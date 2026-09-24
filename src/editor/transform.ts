import { rotatePoint, type Vec } from '../core/geom';
import type { SceneObject } from '../model/types';

/** Pure transform helpers — always return new objects (history relies on immutability). */

export function translateObj(o: SceneObject, dx: number, dy: number): SceneObject {
  switch (o.type) {
    case 'path':
      return { ...o, points: o.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) };
    case 'effect':
      return o.region ? { ...o, region: { ...o.region, x: o.region.x + dx, y: o.region.y + dy } } : o;
    default:
      return { ...o, x: o.x + dx, y: o.y + dy };
  }
}

/**
 * Scale about `anchor` in a frame rotated by `frame` radians (so a single
 * rotated object scales along its own axes).
 */
export function scaleObj(o: SceneObject, anchor: Vec, fx: number, fy: number, frame = 0): SceneObject {
  const map = (p: Vec): Vec => {
    const l = rotatePoint(p, anchor, -frame);
    const s = { x: anchor.x + (l.x - anchor.x) * fx, y: anchor.y + (l.y - anchor.y) * fy };
    return rotatePoint(s, anchor, frame);
  };
  const uni = Math.sqrt(Math.abs(fx * fy));
  switch (o.type) {
    case 'asset': {
      const c = map({ x: o.x, y: o.y });
      // Only scale along the object's own axes when the frame matches its rotation.
      const aligned = Math.abs(((o.rotation * Math.PI) / 180 - frame) % Math.PI) < 1e-3;
      return { ...o, x: c.x, y: c.y, sx: Math.max(0.02, o.sx * (aligned ? fx : uni)), sy: Math.max(0.02, o.sy * (aligned ? fy : uni)) };
    }
    case 'text': {
      const c = map({ x: o.x, y: o.y });
      const aligned = Math.abs(((o.rotation * Math.PI) / 180 - frame) % Math.PI) < 1e-3;
      return { ...o, x: c.x, y: c.y, sx: Math.max(0.05, (o.sx ?? 1) * (aligned ? fx : uni)), sy: Math.max(0.05, (o.sy ?? 1) * (aligned ? fy : uni)) };
    }
    case 'path':
      return { ...o, points: o.points.map((p) => ({ ...p, ...map(p) })), width: Math.max(0.5, o.width * uni) };
    case 'light': {
      const c = map({ x: o.x, y: o.y });
      return { ...o, x: c.x, y: c.y, radius: Math.max(4, o.radius * uni) };
    }
    case 'effect':
      if (!o.region) return o;
      {
        const a = map({ x: o.region.x, y: o.region.y }), b = map({ x: o.region.x + o.region.w, y: o.region.y + o.region.h });
        return { ...o, region: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) } };
      }
  }
}

export function rotateObj(o: SceneObject, center: Vec, rad: number): SceneObject {
  const deg = (rad * 180) / Math.PI;
  switch (o.type) {
    case 'asset':
    case 'text': {
      const c = rotatePoint({ x: o.x, y: o.y }, center, rad);
      return { ...o, x: c.x, y: c.y, rotation: normDeg(o.rotation + deg) };
    }
    case 'path':
      return { ...o, points: o.points.map((p) => ({ ...p, ...rotatePoint(p, center, rad) })) };
    case 'light': {
      const c = rotatePoint({ x: o.x, y: o.y }, center, rad);
      return { ...o, x: c.x, y: c.y };
    }
    default:
      return o;
  }
}

export function normDeg(d: number) {
  let r = d % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return Math.round(r * 100) / 100;
}

export function objectAnchor(o: SceneObject): Vec {
  switch (o.type) {
    case 'path': {
      const xs = o.points.map((p) => p.x), ys = o.points.map((p) => p.y);
      return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    }
    case 'effect':
      return o.region ? { x: o.region.x + o.region.w / 2, y: o.region.y + o.region.h / 2 } : { x: 0, y: 0 };
    default:
      return { x: o.x, y: o.y };
  }
}
