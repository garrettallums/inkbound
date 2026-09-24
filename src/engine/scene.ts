import { rotatedBounds, rotatePoint, type Rect, type Vec } from '../core/geom';
import type { AssetObject, Layer, ProjectDoc, SceneObject, TextObject } from '../model/types';
import { getAlphaMask, getAsset, MISSING_ASSET, PAD, type AssetDef } from './assets/registry';
import { effectBounds } from './effects';
import { lightBounds } from './lighting';
import { distanceToPath, pathBounds } from './paths';
import { textSize } from './text';

export const assetDef = (o: AssetObject): AssetDef => getAsset(o.assetId) ?? MISSING_ASSET;

/** Oriented box for transformable objects (assets & text). */
export interface OBox { cx: number; cy: number; w: number; h: number; angle: number }

export function objectBox(o: SceneObject): OBox | null {
  if (o.type === 'asset') {
    const d = assetDef(o);
    return { cx: o.x, cy: o.y, w: d.w * o.sx, h: d.h * o.sy, angle: (o.rotation * Math.PI) / 180 };
  }
  if (o.type === 'text') {
    const s = textSize(o);
    const ang = (o.rotation * Math.PI) / 180;
    const c = rotatePoint({ x: o.x + s.ox, y: o.y + s.oy }, { x: o.x, y: o.y }, ang);
    return { cx: c.x, cy: c.y, w: s.w, h: s.h, angle: ang };
  }
  if (o.type === 'light') return { cx: o.x, cy: o.y, w: 28, h: 28, angle: 0 };
  return null;
}

const boundsCache = new WeakMap<SceneObject, Rect>();

export function objectBounds(o: SceneObject, doc: Pick<ProjectDoc, 'width' | 'height'>): Rect {
  const c = boundsCache.get(o);
  if (c) return c;
  let r: Rect;
  switch (o.type) {
    case 'asset': {
      const d = assetDef(o);
      const b = rotatedBounds(o.x, o.y, d.w * o.sx * (1 + PAD * 2), d.h * o.sy * (1 + PAD * 2), (o.rotation * Math.PI) / 180);
      // include room for drop shadows
      const m = Math.max(d.w * o.sx, d.h * o.sy) * 0.25;
      r = { x: b.x - m, y: b.y - m, w: b.w + m * 2, h: b.h + m * 2 };
      break;
    }
    case 'text': {
      const b = objectBox(o)!;
      const rb = rotatedBounds(b.cx, b.cy, b.w, b.h, b.angle);
      const m = o.outline + o.shadow + o.size * 0.3;
      r = { x: rb.x - m, y: rb.y - m, w: rb.w + m * 2, h: rb.h + m * 2 };
      break;
    }
    case 'path':
      r = pathBounds(o);
      break;
    case 'light':
      r = lightBounds(o);
      break;
    case 'effect':
      r = effectBounds(o, doc.width, doc.height);
      break;
  }
  boundsCache.set(o, r);
  return r;
}

/** Bounds used for selection (tighter than render bounds). */
export function selectionBounds(o: SceneObject, doc: Pick<ProjectDoc, 'width' | 'height'>): Rect {
  const b = objectBox(o);
  if (b) return rotatedBounds(b.cx, b.cy, b.w, b.h, b.angle);
  if (o.type === 'path') {
    const r = pathBounds(o);
    const m = o.width * 0.6 + 6;
    return { x: r.x + m * 0.5, y: r.y + m * 0.5, w: Math.max(1, r.w - m), h: Math.max(1, r.h - m) };
  }
  return objectBounds(o, doc);
}

/** Bottom edge of an object in world space — used for depth sorting. */
export function depthKey(o: SceneObject): number {
  if (o.type === 'asset') {
    const d = assetDef(o);
    return o.y + (d.h * o.sy) / 2;
  }
  if (o.type === 'text') return o.y;
  if (o.type === 'light') return o.y;
  if (o.type === 'path') return o.points.reduce((m, p) => Math.max(m, p.y), -Infinity);
  return 0;
}

export function sortObjects(objs: SceneObject[], layer: Layer): SceneObject[] {
  const arr = objs.slice();
  if (layer.depthSort) arr.sort((a, b) => (a.zBias ?? 0) - (b.zBias ?? 0) || depthKey(a) - depthKey(b));
  else arr.sort((a, b) => (a.zBias ?? 0) - (b.zBias ?? 0));
  return arr;
}

/** Precise hit test at a world point. `tol` is the tolerance in world units. */
export function hitTest(o: SceneObject, p: Vec, tol: number): boolean {
  switch (o.type) {
    case 'asset': {
      const d = assetDef(o);
      const w = d.w * o.sx, h = d.h * o.sy;
      const l = rotatePoint(p, { x: o.x, y: o.y }, (-o.rotation * Math.PI) / 180);
      let u = (l.x - o.x) / w + 0.5, v = (l.y - o.y) / h + 0.5;
      if (u < -0.02 || v < -0.02 || u > 1.02 || v > 1.02) return false;
      if (o.flipX) u = 1 - u;
      if (o.flipY) v = 1 - v;
      const m = getAlphaMask(d);
      // mask covers PAD margins
      const mu = (u * d.w + d.w * PAD) / (d.w * (1 + PAD * 2)), mv = (v * d.h + d.h * PAD) / (d.h * (1 + PAD * 2));
      const r = Math.max(1, Math.round(2));
      const cx = Math.floor(mu * m.w), cy = Math.floor(mv * m.h);
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
          if (m.data[y * m.w + x] > 40) return true;
        }
      }
      // Small objects: accept the whole box so they stay clickable.
      return w < tol * 6 || h < tol * 6;
    }
    case 'text': {
      const b = objectBox(o)!;
      const l = rotatePoint(p, { x: b.cx, y: b.cy }, -b.angle);
      return Math.abs(l.x - b.cx) <= b.w / 2 + tol && Math.abs(l.y - b.cy) <= b.h / 2 + tol;
    }
    case 'path':
      return distanceToPath(o, p) <= o.width / 2 + tol;
    case 'light':
      return Math.hypot(p.x - o.x, p.y - o.y) <= 16 + tol;
    case 'effect':
      return false;
  }
}

/** Layers in render order with effective visibility / opacity (folders applied). */
export function renderLayers(layers: Layer[]): { layer: Layer; visible: boolean; opacity: number; locked: boolean }[] {
  const byId = new Map(layers.map((l) => [l.id, l]));
  const out: { layer: Layer; visible: boolean; opacity: number; locked: boolean }[] = [];
  for (const l of layers) {
    if (l.kind === 'folder' || l.parentId) continue;
    out.push({ layer: l, visible: l.visible, opacity: l.opacity, locked: l.locked });
  }
  // Insert folder children at the folder's position.
  const result: typeof out = [];
  for (const l of layers) {
    if (l.parentId) continue;
    if (l.kind === 'folder') {
      for (const c of layers) {
        if (c.parentId !== l.id) continue;
        result.push({ layer: c, visible: l.visible && c.visible, opacity: l.opacity * c.opacity, locked: l.locked || c.locked });
      }
    } else {
      result.push(out.find((x) => x.layer === l)!);
    }
  }
  // Orphans (parent missing) render at the end rather than disappearing.
  for (const l of layers) if (l.parentId && !byId.has(l.parentId)) result.push({ layer: l, visible: l.visible, opacity: l.opacity, locked: l.locked });
  return result;
}

export function isTextObject(o: SceneObject): o is TextObject {
  return o.type === 'text';
}
