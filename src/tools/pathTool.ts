import { simplify, type Vec } from '../core/geom';
import { uid } from '../core/ids';
import type { Editor } from '../editor/editor';
import { drawPath, presetById } from '../engine/paths';
import { snapToGrid } from '../engine/renderer';
import type { PathObject } from '../model/types';
import { drawPathControls } from './select';
import type { Tool } from './types';

/**
 * Path tool (spec §38–41): click to place control points (double-click / Enter
 * to finish, click the first point to close) or press-and-drag to draw a
 * freehand route that is simplified into control points.
 */

interface Draft { points: Vec[]; freehand: boolean; downAt: Vec | null; seed: number }

export function pathWidth(ed: Editor, presetId: string): number {
  const p = presetById(presetId);
  const w = ed.settings.path.width;
  if (w) return w;
  return ed.doc.assetPack === 'atlas' ? p.widthAtlas * ed.doc.assetScale : p.widthTD;
}

export function makePath(ed: Editor, points: Vec[], closed: boolean, seed: number): PathObject {
  const preset = presetById(ed.settings.path.presetId);
  return {
    id: uid('o'), type: 'path', layerId: ed.targetLayer(preset.profile === 'wall' ? 'buildings' : 'paths').id,
    profile: preset.profile, style: preset.style, points: points.map((p) => ({ x: p.x, y: p.y })), closed,
    width: pathWidth(ed, preset.id), opacity: 1, color: preset.color, roughness: preset.roughness, meander: preset.meander,
    smoothing: preset.smoothing, taper: preset.taper, widthVariation: preset.widthVariation, shadow: preset.shadow,
    seed, details: { ...preset.details }, textureScale: 1,
  };
}

export const pathTool: Tool & { draft: Draft | null; finish(ed: Editor, closed?: boolean): void } = {
  id: 'path',
  draft: null,
  cursor: () => 'crosshair',

  down(ed, ev) {
    let p = ev.world;
    if (ed.settings.snap) p = snapToGrid(ed.doc.grid, p.x, p.y, false);
    if (!this.draft) this.draft = { points: [], freehand: false, downAt: null, seed: ed.newSeed() };
    const d = this.draft;
    // close the path by clicking its first point
    if (d.points.length >= 3 && Math.hypot(d.points[0].x - p.x, d.points[0].y - p.y) < 10 * ev.unit) {
      this.finish(ed, true);
      return;
    }
    d.downAt = p;
    d.points.push(p);
    ed.requestRender();
  },

  move(ed, ev, dragging) {
    ed.cursorWorld = ev.world;
    const d = this.draft;
    if (d && dragging && d.downAt) {
      const moved = Math.hypot(ev.world.x - d.downAt.x, ev.world.y - d.downAt.y);
      if (moved > 6 * ev.unit || d.freehand) {
        d.freehand = true;
        const last = d.points[d.points.length - 1];
        if (Math.hypot(ev.world.x - last.x, ev.world.y - last.y) > 3 * ev.unit) d.points.push(ev.world);
      }
    }
    ed.requestRender();
  },

  up(ed, ev) {
    const d = this.draft;
    if (!d) return;
    d.downAt = null;
    if (d.freehand) {
      // simplify the freehand route into editable control points
      const w = pathWidth(ed, ed.settings.path.presetId);
      d.points = simplify(d.points, Math.max(2 * ev.unit, Math.min(w * 0.35, 40)));
      this.finish(ed, false);
    }
  },

  doubleClick(ed) {
    const d = this.draft;
    if (!d) return;
    // the double-click's second press added a duplicate point
    if (d.points.length > 2) d.points.pop();
    this.finish(ed, false);
  },

  finish(ed, closed = false) {
    const d = this.draft;
    this.draft = null;
    if (!d || d.points.length < 2) {
      ed.requestRender();
      return;
    }
    const path = makePath(ed, d.points, closed, d.seed);
    const preset = presetById(ed.settings.path.presetId);
    ed.putObjects([path], `Draw ${preset.label}`);
    ed.setSelection([path.id]);
    ed.requestRender();
  },

  key(ed, k) {
    const d = this.draft;
    if (!d) return false;
    if (k.key === 'Enter') { this.finish(ed, false); return true; }
    if (k.key === 'Backspace') { d.points.pop(); if (!d.points.length) this.draft = null; ed.requestRender(); return true; }
    return false;
  },

  cancel(ed) {
    if (!this.draft) return false;
    this.draft = null;
    ed.requestRender();
    return true;
  },

  deactivate(ed) {
    if (this.draft && this.draft.points.length >= 2) this.finish(ed, false);
    this.draft = null;
  },

  overlay(ed, ctx, unit) {
    const d = this.draft;
    if (!d || !d.points.length) {
      if (ed.cursorWorld) {
        ctx.save();
        ctx.fillStyle = '#ffc446';
        ctx.beginPath(); ctx.arc(ed.cursorWorld.x, ed.cursorWorld.y, 3 * unit, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      return;
    }
    const pts = d.freehand || !ed.cursorWorld ? d.points : [...d.points, ed.cursorWorld];
    if (pts.length >= 2) {
      const preview = makePath(ed, pts, false, d.seed);
      ctx.save();
      ctx.globalAlpha = 0.75;
      drawPath(ctx, preview, 1 / unit);
      ctx.restore();
    }
    if (!d.freehand) drawPathControls(ctx, { ...makePath(ed, d.points, false, d.seed) }, unit);
  },
};
