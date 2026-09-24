import { rectsIntersect, rotatePoint, type Rect, type Vec } from '../core/geom';
import type { Editor } from '../editor/editor';
import { objectAnchor, rotateObj, scaleObj, translateObj } from '../editor/transform';
import { snapToGrid } from '../engine/renderer';
import { hitTest, objectBox, renderLayers, selectionBounds } from '../engine/scene';
import type { PathObject, SceneObject } from '../model/types';
import type { Tool, ToolEvent } from './types';

/**
 * Select tool (spec §13–15): click/shift-click/marquee selection, drag to move,
 * corner handles for uniform scale, edge handles for non-uniform scale, a
 * rotation handle, and control-point editing for a single selected path.
 */

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rot';

interface Frame { cx: number; cy: number; w: number; h: number; angle: number }

interface DragState {
  mode: 'move' | 'scale' | 'rotate' | 'marquee' | 'point';
  start: Vec;
  orig: Map<string, SceneObject>;
  frame?: Frame;
  handle?: HandleId;
  pointIndex?: number;
  pathId?: string;
  marquee?: Rect;
  additive?: boolean;
  moved: boolean;
}

const HANDLE_PX = 7;

export function pickObject(ed: Editor, p: Vec, tol: number): SceneObject | null {
  const layers = renderLayers(ed.doc.layers).filter((x) => x.visible && !x.locked).reverse();
  for (const { layer } of layers) {
    if (layer.kind !== 'objects' && layer.kind !== 'lighting') continue;
    const objs = ed.layerObjects(layer.id);
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (o.locked) continue;
      if (o.type === 'light' && ed.previewMode) continue;
      const b = selectionBounds(o, ed.doc);
      if (p.x < b.x - tol || p.y < b.y - tol || p.x > b.x + b.w + tol || p.y > b.y + b.h + tol) continue;
      if (hitTest(o, p, tol)) return o;
    }
  }
  return null;
}

/** Selection frame: oriented to the object for a single asset/text, axis-aligned otherwise. */
export function selectionFrame(ed: Editor): Frame | null {
  const objs = ed.selectedObjects;
  if (!objs.length) return null;
  if (objs.length === 1) {
    const b = objectBox(objs[0]);
    if (b && objs[0].type !== 'light') return { cx: b.cx, cy: b.cy, w: b.w, h: b.h, angle: b.angle };
  }
  const r = ed.selectionRect();
  if (!r) return null;
  return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, w: r.w, h: r.h, angle: 0 };
}

function handlePositions(f: Frame, unit: number): Record<HandleId, Vec> {
  const hw = f.w / 2, hh = f.h / 2;
  const c = { x: f.cx, y: f.cy };
  const at = (x: number, y: number) => rotatePoint({ x: f.cx + x, y: f.cy + y }, c, f.angle);
  return {
    nw: at(-hw, -hh), n: at(0, -hh), ne: at(hw, -hh), e: at(hw, 0),
    se: at(hw, hh), s: at(0, hh), sw: at(-hw, hh), w: at(-hw, 0), rot: at(0, -hh - 26 * unit),
  };
}

const OPPOSITE: Record<Exclude<HandleId, 'rot'>, HandleId> = { nw: 'se', n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e' };

function selectedPath(ed: Editor): PathObject | null {
  const objs = ed.selectedObjects;
  return objs.length === 1 && objs[0].type === 'path' ? objs[0] : null;
}

export const selectTool: Tool & { drag: DragState | null; hoverHandle: HandleId | null } = {
  id: 'select',
  drag: null,
  hoverHandle: null,

  cursor(ed) {
    const h = this.hoverHandle;
    if (!h) return 'default';
    if (h === 'rot') return 'grab';
    const f = selectionFrame(ed);
    const base = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 }[h];
    const a = (base + ((f?.angle ?? 0) * 180) / Math.PI + 360) % 180;
    return a < 22.5 || a >= 157.5 ? 'ns-resize' : a < 67.5 ? 'nesw-resize' : a < 112.5 ? 'ew-resize' : 'nwse-resize';
  },

  down(ed, ev) {
    const tol = 4 * ev.unit;
    // 1. path control points
    const path = selectedPath(ed);
    if (path && !path.locked) {
      const idx = path.points.findIndex((p) => Math.hypot(p.x - ev.world.x, p.y - ev.world.y) < 8 * ev.unit);
      if (idx >= 0) {
        ed.begin('Edit path point');
        this.drag = { mode: 'point', start: ev.world, orig: new Map([[path.id, path]]), pointIndex: idx, pathId: path.id, moved: false };
        return;
      }
      if (ev.alt && hitTest(path, ev.world, tol * 2)) {
        insertPoint(ed, path, ev.world);
        return;
      }
    }
    // 2. transform handles
    const frame = selectionFrame(ed);
    if (frame && !ed.selectedObjects.some((o) => o.locked)) {
      const hp = handlePositions(frame, ev.unit);
      for (const [id, p] of Object.entries(hp) as [HandleId, Vec][]) {
        if (Math.hypot(p.x - ev.world.x, p.y - ev.world.y) <= HANDLE_PX * ev.unit * 1.4) {
          ed.begin(id === 'rot' ? 'Rotate' : 'Resize');
          this.drag = { mode: id === 'rot' ? 'rotate' : 'scale', start: ev.world, orig: snapshot(ed), frame, handle: id, moved: false };
          return;
        }
      }
    }
    // 3. objects (a selected regional effect can be dragged from anywhere inside it)
    const selEffect = ed.selectedObjects.find((o) => o.type === 'effect' && o.region && !o.locked && ev.world.x >= o.region.x && ev.world.y >= o.region.y && ev.world.x <= o.region.x + o.region.w && ev.world.y <= o.region.y + o.region.h);
    if (selEffect) {
      ed.begin('Move effect');
      this.drag = { mode: 'move', start: ev.world, orig: snapshot(ed), moved: false };
      return;
    }
    const hit = pickObject(ed, ev.world, tol);
    if (hit) {
      const group = ed.expandGroups([hit.id]);
      if (ev.shift) {
        const set = new Set(ed.selection);
        const has = group.every((id) => set.has(id));
        group.forEach((id) => (has ? set.delete(id) : set.add(id)));
        ed.setSelection([...set]);
        if (has) return;
      } else if (!ed.selection.includes(hit.id)) {
        ed.setSelection(group);
      }
      ed.begin(ed.selection.length > 1 ? `Move ${ed.selection.length} objects` : 'Move');
      this.drag = { mode: 'move', start: ev.world, orig: snapshot(ed), moved: false };
      return;
    }
    // 4. marquee
    this.drag = { mode: 'marquee', start: ev.world, orig: new Map(), marquee: { x: ev.world.x, y: ev.world.y, w: 0, h: 0 }, additive: ev.shift, moved: false };
    if (!ev.shift) ed.setSelection([]);
  },

  move(ed, ev, dragging) {
    const d = this.drag;
    if (!d || !dragging) {
      // hover feedback for handles
      const frame = selectionFrame(ed);
      let hh: HandleId | null = null;
      if (frame) {
        for (const [id, p] of Object.entries(handlePositions(frame, ev.unit)) as [HandleId, Vec][]) {
          if (Math.hypot(p.x - ev.world.x, p.y - ev.world.y) <= HANDLE_PX * ev.unit * 1.4) { hh = id; break; }
        }
      }
      if (hh !== this.hoverHandle) { this.hoverHandle = hh; ed.events.emit(); }
      return;
    }
    let dx = ev.world.x - d.start.x, dy = ev.world.y - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) < 2 * ev.unit) return;
    d.moved = true;
    const snap = ed.settings.snap && ed.doc.grid.type !== 'none';
    switch (d.mode) {
      case 'move': {
        if (ev.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        if (snap) {
          const first = d.orig.values().next().value as SceneObject;
          const a = objectAnchor(first);
          const s = snapToGrid(ed.doc.grid, a.x + dx, a.y + dy);
          dx = s.x - a.x; dy = s.y - a.y;
        }
        ed.putObjects([...d.orig.values()].map((o) => translateObj(o, dx, dy)));
        break;
      }
      case 'point': {
        const p = d.orig.get(d.pathId!) as PathObject;
        let np = { x: ev.world.x, y: ev.world.y };
        if (snap) np = snapToGrid(ed.doc.grid, np.x, np.y, false);
        const pts = p.points.map((q, i) => (i === d.pointIndex ? { ...q, ...np } : q));
        ed.putObject({ ...p, points: pts });
        break;
      }
      case 'rotate': {
        const f = d.frame!;
        const a0 = Math.atan2(d.start.y - f.cy, d.start.x - f.cx);
        let da = Math.atan2(ev.world.y - f.cy, ev.world.x - f.cx) - a0;
        if (ev.shift) da = Math.round(da / (Math.PI / 12)) * (Math.PI / 12);
        const c = { x: f.cx, y: f.cy };
        ed.putObjects([...d.orig.values()].map((o) => rotateObj(o, c, da)));
        break;
      }
      case 'scale': {
        const f = d.frame!;
        const h = d.handle as Exclude<HandleId, 'rot'>;
        const hp = handlePositions(f, ev.unit);
        const anchor = hp[OPPOSITE[h]];
        const c = { x: f.cx, y: f.cy };
        // Work in the frame's local axes.
        const lStart = rotatePoint(hp[h], c, -f.angle), lNow = rotatePoint(ev.world, c, -f.angle), lAnchor = rotatePoint(anchor, c, -f.angle);
        let fx = h.includes('e') || h.includes('w') ? (lNow.x - lAnchor.x) / (lStart.x - lAnchor.x || 1) : 1;
        let fy = h.includes('n') || h.includes('s') ? (lNow.y - lAnchor.y) / (lStart.y - lAnchor.y || 1) : 1;
        const corner = h.length === 2;
        if (corner && !ev.shift) {
          const u = (Math.abs(fx) + Math.abs(fy)) / 2;
          fx = u; fy = u;
        }
        fx = Math.max(0.02, Math.abs(fx)); fy = Math.max(0.02, Math.abs(fy));
        ed.putObjects([...d.orig.values()].map((o) => scaleObj(o, anchor, fx, fy, f.angle)));
        break;
      }
      case 'marquee': {
        const r = { x: Math.min(d.start.x, ev.world.x), y: Math.min(d.start.y, ev.world.y), w: Math.abs(dx), h: Math.abs(dy) };
        d.marquee = r;
        ed.requestRender();
        break;
      }
    }
  },

  up(ed) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.mode === 'marquee') {
      if (d.moved && d.marquee) {
        const hits = ed.selectableObjects().filter((o) => o.type !== 'effect' && rectsIntersect(selectionBounds(o, ed.doc), d.marquee!)).map((o) => o.id);
        const ids = ed.expandGroups(hits);
        ed.setSelection(d.additive ? [...new Set([...ed.selection, ...ids])] : ids);
      }
      ed.requestRender();
      return;
    }
    if (!d.moved) ed.rollback();
    else ed.commit();
  },

  doubleClick(ed, ev) {
    const path = selectedPath(ed);
    if (!path) return;
    const idx = path.points.findIndex((p) => Math.hypot(p.x - ev.world.x, p.y - ev.world.y) < 8 * ev.unit);
    if (idx >= 0 && path.points.length > 2) {
      ed.putObjects([{ ...path, points: path.points.filter((_, i) => i !== idx) }], 'Delete path point');
    } else if (idx < 0) {
      insertPoint(ed, path, ev.world);
    }
  },

  cancel(ed) {
    if (this.drag) {
      if (this.drag.mode !== 'marquee') ed.rollback();
      this.drag = null;
      ed.requestRender();
      return true;
    }
    if (ed.selection.length) {
      ed.setSelection([]);
      return true;
    }
    return false;
  },

  overlay(ed, ctx, unit) {
    if (ed.previewMode) return;
    const objs = ed.selectedObjects;
    ctx.save();
    ctx.lineWidth = unit * 1.2;
    // individual outlines (multi-selection)
    if (objs.length > 1) {
      ctx.strokeStyle = 'rgba(255, 196, 70, 0.55)';
      for (const o of objs.slice(0, 600)) {
        const b = objectBox(o);
        if (b) {
          ctx.save(); ctx.translate(b.cx, b.cy); ctx.rotate(b.angle);
          ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
          ctx.restore();
        } else {
          const r = selectionBounds(o, ed.doc);
          ctx.strokeRect(r.x, r.y, r.w, r.h);
        }
      }
    }
    const frame = selectionFrame(ed);
    if (frame) {
      ctx.save();
      ctx.translate(frame.cx, frame.cy);
      ctx.rotate(frame.angle);
      ctx.strokeStyle = '#ffc446';
      ctx.setLineDash([unit * 5, unit * 3]);
      ctx.strokeRect(-frame.w / 2, -frame.h / 2, frame.w, frame.h);
      ctx.setLineDash([]);
      ctx.restore();
      const locked = objs.some((o) => o.locked);
      if (!locked) {
        const hp = handlePositions(frame, unit);
        ctx.strokeStyle = '#ffc446';
        ctx.beginPath();
        ctx.moveTo(hp.n.x, hp.n.y);
        ctx.lineTo(hp.rot.x, hp.rot.y);
        ctx.stroke();
        for (const [id, p] of Object.entries(hp)) {
          ctx.fillStyle = id === 'rot' ? '#ffc446' : '#ffffff';
          ctx.strokeStyle = '#1b1b1f';
          ctx.lineWidth = unit * 1.2;
          ctx.beginPath();
          if (id === 'rot') ctx.arc(p.x, p.y, HANDLE_PX * unit * 0.8, 0, Math.PI * 2);
          else ctx.rect(p.x - (HANDLE_PX / 2) * unit, p.y - (HANDLE_PX / 2) * unit, HANDLE_PX * unit, HANDLE_PX * unit);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    // path control points
    const path = selectedPath(ed);
    if (path) drawPathControls(ctx, path, unit);
    // light radii
    for (const o of objs) {
      if (o.type !== 'light') continue;
      ctx.strokeStyle = 'rgba(255,196,70,0.8)';
      ctx.setLineDash([unit * 6, unit * 4]);
      ctx.beginPath(); ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    // marquee
    const d = this.drag;
    if (d?.mode === 'marquee' && d.marquee && d.moved) {
      ctx.fillStyle = 'rgba(255,196,70,0.08)';
      ctx.strokeStyle = '#ffc446';
      ctx.setLineDash([unit * 4, unit * 3]);
      ctx.fillRect(d.marquee.x, d.marquee.y, d.marquee.w, d.marquee.h);
      ctx.strokeRect(d.marquee.x, d.marquee.y, d.marquee.w, d.marquee.h);
    }
    ctx.restore();
  },
};

function snapshot(ed: Editor) {
  return new Map(ed.selectedObjects.filter((o) => !o.locked).map((o) => [o.id, o]));
}

export function drawPathControls(ctx: CanvasRenderingContext2D, path: PathObject, unit: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,196,70,0.7)';
  ctx.lineWidth = unit;
  ctx.setLineDash([unit * 3, unit * 3]);
  ctx.beginPath();
  path.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (path.closed) ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  path.points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5 * unit, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? '#7ee07e' : i === path.points.length - 1 ? '#ff8a6a' : '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#1b1b1f';
    ctx.lineWidth = unit * 1.3;
    ctx.stroke();
  });
  ctx.restore();
}

function insertPoint(ed: Editor, path: PathObject, p: Vec) {
  // insert between the two control points closest along the polyline
  let best = 0, bd = Infinity;
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1], b = path.points[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
    if (d < bd) { bd = d; best = i; }
  }
  const pts = [...path.points];
  pts.splice(best, 0, { x: p.x, y: p.y });
  ed.putObjects([{ ...path, points: pts }], 'Add path point');
}
