export interface Vec { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const deg2rad = (d: number) => (d * Math.PI) / 180;
export const rad2deg = (r: number) => (r * 180) / Math.PI;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function rectUnion(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function inflate(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, w: r.w + d * 2, h: r.h + d * 2 };
}

export function rotatePoint(p: Vec, c: Vec, ang: number): Vec {
  const s = Math.sin(ang), co = Math.cos(ang);
  const dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * co - dy * s, y: c.y + dx * s + dy * co };
}

/** Bounding box of a rotated rectangle centred at (cx, cy). */
export function rotatedBounds(cx: number, cy: number, w: number, h: number, ang: number): Rect {
  const c = Math.abs(Math.cos(ang)), s = Math.abs(Math.sin(ang));
  const bw = w * c + h * s, bh = w * s + h * c;
  return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
}

export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Catmull–Rom spline sampled into a dense polyline (centripetal-ish, uniform parameter). */
export function catmullRom(points: Vec[], samplesPerSeg = 12, closed = false, tension = 0.5): Vec[] {
  const n = points.length;
  if (n < 2) return points.slice();
  const out: Vec[] = [];
  const get = (i: number) => {
    if (closed) return points[((i % n) + n) % n];
    return points[clamp(i, 0, n - 1)];
  };
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.max(2, Math.min(64, Math.ceil(len / 6) || samplesPerSeg));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t, t3 = t2 * t;
      const m1x = (p2.x - p0.x) * tension, m1y = (p2.y - p0.y) * tension;
      const m2x = (p3.x - p1.x) * tension, m2y = (p3.y - p1.y) * tension;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      out.push({ x: h00 * p1.x + h10 * m1x + h01 * p2.x + h11 * m2x, y: h00 * p1.y + h10 * m1y + h01 * p2.y + h11 * m2y });
    }
  }
  out.push(closed ? { ...points[0] } : { ...points[n - 1] });
  return out;
}

/** Ramer–Douglas–Peucker simplification. */
export function simplify(points: Vec[], eps: number): Vec[] {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distToSegment(points[i], points[a], points[b]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export function polylineLength(pts: Vec[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return l;
}

/** Resample a polyline to (roughly) equal spacing. */
export function resample(pts: Vec[], spacing: number): Vec[] {
  if (pts.length < 2) return pts.slice();
  const out: Vec[] = [{ ...pts[0] }];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    let d = spacing - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      d += spacing;
    }
    carry = seg - (d - spacing);
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > spacing * 0.3) out.push({ ...last });
  else out[out.length - 1] = { ...last };
  return out;
}

export function pointInPolygon(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
