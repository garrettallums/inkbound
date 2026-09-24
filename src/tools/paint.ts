import type { Vec } from '../core/geom';
import type { Editor } from '../editor/editor';
import type { PaintLayer } from '../engine/paintLayer';
import type { Tool, ToolEvent } from './types';

/** Walk from `a` to `b` emitting points every `step` world units (carrying the remainder). */
function stamps(a: Vec | null, b: Vec, step: number, carry: { d: number }): Vec[] {
  if (!a) return [b];
  const out: Vec[] = [];
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  let d = step - carry.d;
  while (d <= len) {
    out.push({ x: a.x + (dx * d) / len, y: a.y + (dy * d) / len });
    d += step;
  }
  carry.d = len - (d - step);
  return out;
}

export function drawBrushCursor(ctx: CanvasRenderingContext2D, p: Vec | null, r: number, unit: number, color = '#ffffff') {
  if (!p) return;
  ctx.save();
  ctx.lineWidth = unit * 1.5;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = unit * 0.8;
  ctx.strokeStyle = color;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// --------------------------------------------------------------------------- terrain

interface TerrainState { last: Vec | null; carry: { d: number }; invert: boolean; lastRebuild: number }

export const terrainTool: Tool & { st: TerrainState | null } = {
  id: 'terrain',
  st: null,
  cursor: () => 'none',

  down(ed, ev) {
    const s = ed.settings.terrain;
    if (s.op === 'fill') {
      ed.mask.beginEdit();
      const toLand = !ed.mask.isLand(ev.world.x, ev.world.y);
      if (ed.mask.floodFill(ev.world.x, ev.world.y, toLand)) {
        const patch = ed.mask.endEdit();
        if (patch) ed.pushRaster(patch, toLand ? 'Fill land' : 'Fill water');
        ed.terrain.markEdited({ x: 0, y: 0, w: ed.doc.width, h: ed.doc.height });
        ed.terrain.rebuild();
      } else ed.mask.endEdit();
      return;
    }
    ed.mask.beginEdit();
    ed.begin(`Terrain: ${s.op}`);
    this.st = { last: null, carry: { d: 0 }, invert: ev.alt, lastRebuild: performance.now() };
    this.move!(ed, ev, true);
  },

  move(ed, ev, dragging) {
    ed.cursorWorld = ev.world;
    const st = this.st;
    if (!st || !dragging) { ed.requestRender(); return; }
    const s = ed.settings.terrain;
    let op = s.op === 'fill' ? 'add' : s.op;
    if (st.invert) op = op === 'add' ? 'remove' : op === 'remove' ? 'add' : op === 'expand' ? 'contract' : op === 'contract' ? 'expand' : op;
    const pts = stamps(st.last, ev.world, Math.max(1, s.size * 0.18), st.carry);
    st.last = ev.world;
    for (const p of pts) {
      ed.mask.dab(op, p.x, p.y, s.size, s.roughness, s.strength, s.hardness);
      ed.terrain.markEdited({ x: p.x - s.size * 1.6, y: p.y - s.size * 1.6, w: s.size * 3.2, h: s.size * 3.2 });
    }
    if (performance.now() - st.lastRebuild > 450) {
      st.lastRebuild = performance.now();
      ed.terrain.rebuild();
    }
    ed.requestRender();
  },

  up(ed) {
    if (!this.st) return;
    this.st = null;
    const patch = ed.mask.endEdit();
    if (patch) ed.pushRaster(patch, 'Terrain');
    ed.commit();
    ed.terrain.rebuild();
  },

  key(ed, k) {
    if (k.key === 'x' || k.key === 'X') {
      const op = ed.settings.terrain.op;
      ed.updateSettings('terrain', { op: op === 'add' ? 'remove' : 'add' });
      return true;
    }
    return sizeKeys(k, ed.settings.terrain.size, (size) => ed.updateSettings('terrain', { size }));
  },

  overlay(ed, ctx, unit) {
    const s = ed.settings.terrain;
    const invert = this.st?.invert;
    const remove = (s.op === 'remove') !== !!invert;
    drawBrushCursor(ctx, ed.cursorWorld, s.op === 'fill' ? 10 * unit : s.size, unit, remove ? '#ff9a8a' : '#ffffff');
  },

  cancel(ed) {
    if (!this.st) return false;
    this.st = null;
    const patch = ed.mask.endEdit();
    if (patch) {
      const r = ed.mask.applyPatch(patch, 'before');
      if (r) ed.terrain.markEdited(r);
    }
    ed.rollback();
    ed.terrain.rebuild();
    return true;
  },
};

export function sizeKeys(k: KeyboardEvent, size: number, set: (n: number) => void): boolean {
  if (k.key === '[') { set(Math.max(2, Math.round(size / 1.2))); return true; }
  if (k.key === ']') { set(Math.min(4000, Math.round(size * 1.2))); return true; }
  return false;
}

// --------------------------------------------------------------------------- texture brush

/** Paint layer that receives brush strokes (active paint layer, or the first/new one). */
export function targetPaintLayer(ed: Editor): PaintLayer {
  const active = ed.activeLayer;
  if (active?.kind === 'paint' && !ed.isLayerLocked(active.id)) {
    const p = ed.paint.get(active.id);
    if (p) return p;
  }
  const first = ed.doc.layers.find((l) => l.kind === 'paint' && !ed.isLayerLocked(l.id));
  if (first && ed.paint.get(first.id)) return ed.paint.get(first.id)!;
  const terrainIdx = ed.doc.layers.findIndex((l) => l.kind === 'terrain');
  const l = ed.addLayer('paint', 'Ground Textures', terrainIdx + 1);
  return ed.paint.get(l.id)!;
}

interface BrushState { layer: PaintLayer; last: Vec | null; carry: { d: number }; erase: boolean }

export const brushTool: Tool & { st: BrushState | null } = {
  id: 'brush',
  st: null,
  cursor: () => 'none',

  down(ed, ev) {
    const layer = targetPaintLayer(ed);
    if (!ed.isLayerVisible(layer.id)) ed.toast('The target texture layer is hidden.', 'error');
    layer.beginEdit(ed.newSeed());
    ed.begin('Paint texture');
    this.st = { layer, last: null, carry: { d: 0 }, erase: ev.alt };
    this.move!(ed, ev, true);
  },

  move(ed, ev, dragging) {
    ed.cursorWorld = ev.world;
    const st = this.st;
    if (!st || !dragging) { ed.requestRender(); return; }
    const b = ed.settings.brush;
    const brush = { ...b, erase: b.erase !== st.erase };
    const pts = stamps(st.last, ev.world, Math.max(1, b.size * 0.22), st.carry);
    st.last = ev.world;
    for (const p of pts) st.layer.dab(brush, p.x, p.y, ev.pressure > 0 && ev.pressure !== 0.5 ? 0.4 + ev.pressure * 0.6 : 1, ed.mask);
    ed.requestRender();
  },

  up(ed) {
    const st = this.st;
    if (!st) return;
    this.st = null;
    const patch = st.layer.endEdit();
    if (patch) ed.pushRaster(patch, ed.settings.brush.erase ? 'Erase texture' : 'Paint texture');
    ed.commit();
  },

  key(ed, k) {
    if (k.key === 'e' || k.key === 'E') {
      ed.updateSettings('brush', { erase: !ed.settings.brush.erase });
      return true;
    }
    return sizeKeys(k, ed.settings.brush.size, (size) => ed.updateSettings('brush', { size }));
  },

  overlay(ed, ctx, unit) {
    drawBrushCursor(ctx, ed.cursorWorld, ed.settings.brush.size, unit, ed.settings.brush.erase ? '#ff9a8a' : '#ffffff');
  },

  cancel(ed) {
    const st = this.st;
    if (!st) return false;
    this.st = null;
    const patch = st.layer.endEdit();
    if (patch) st.layer.applyPatch(patch, 'before');
    ed.rollback();
    return true;
  },
};

export type { ToolEvent };
