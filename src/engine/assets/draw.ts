import type { Rng } from '../../core/rng';
import { shade } from '../../core/color';

export type C = CanvasRenderingContext2D;

export const INK = '#1e1914';

export function poly(c: C, pts: number[][], close = true) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  if (close) c.closePath();
}

/** A lumpy, organic closed blob. */
export function blob(c: C, cx: number, cy: number, rx: number, ry: number, rng: Rng, lumps = 10, jitter = 0.18) {
  const pts: number[][] = [];
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < lumps; i++) {
    const a = phase + (i / lumps) * Math.PI * 2;
    const k = 1 - jitter / 2 + rng() * jitter;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  smoothClosed(c, pts);
}

/** Smooth closed curve through points (quadratic midpoints). */
export function smoothClosed(c: C, pts: number[][]) {
  const n = pts.length;
  c.beginPath();
  const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  c.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i], m = mid(p, pts[(i + 1) % n]);
    c.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  c.closePath();
}

/** Scalloped (cloud-like) crown path built from arcs around a centre. */
export function scallop(c: C, cx: number, cy: number, rx: number, ry: number, rng: Rng, n = 9, depth = 0.22) {
  const pts: number[][] = [];
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    const k = 1 - depth * 0.5 + rng() * depth * 0.4;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = mx - cx, dy = my - cy;
    const l = Math.hypot(dx, dy) || 1;
    const bulge = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.55;
    if (i === 0) c.moveTo(a[0], a[1]);
    c.quadraticCurveTo(mx + (dx / l) * bulge, my + (dy / l) * bulge, b[0], b[1]);
  }
  c.closePath();
}

export function radial(c: C, x: number, y: number, r: number, stops: [number, string][]) {
  const g = c.createRadialGradient(x, y, 0, x, y, Math.max(0.01, r));
  for (const [t, col] of stops) g.addColorStop(t, col);
  return g;
}

export function linear(c: C, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [t, col] of stops) g.addColorStop(t, col);
  return g;
}

/** Fill the current path with a top-left lit gradient derived from a base colour. */
export function litFill(c: C, base: string, x: number, y: number, w: number, h: number, strength = 0.22) {
  c.fillStyle = linear(c, x, y, x + w, y + h, [[0, shade(base, strength)], [0.55, base], [1, shade(base, -strength * 1.4)]]);
  c.fill();
}

export function ink(c: C, lw: number, color = INK) {
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.stroke();
}

/** Scatter small speckles inside a circle — adds painterly texture. */
export function speckle(c: C, cx: number, cy: number, r: number, rng: Rng, n: number, colors: string[], size: [number, number], alpha = 0.6) {
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r;
    c.globalAlpha = alpha * (0.5 + rng() * 0.5);
    c.fillStyle = colors[Math.floor(rng() * colors.length)];
    c.beginPath();
    c.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, size[0] + rng() * (size[1] - size[0]), 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
}

export function roundRect(c: C, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

export function ellipse(c: C, x: number, y: number, rx: number, ry: number, rot = 0) {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
}

export function line(c: C, x0: number, y0: number, x1: number, y1: number) {
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
}

/** Soft contact shadow ellipse under objects. */
export function contactShadow(c: C, cx: number, cy: number, rx: number, ry: number, a = 0.35) {
  c.fillStyle = radial(c, cx, cy, rx, [[0, `rgba(0,0,0,${a})`], [1, 'rgba(0,0,0,0)']]);
  c.save();
  c.translate(cx, cy);
  c.scale(1, ry / rx);
  c.beginPath();
  c.arc(0, 0, rx, 0, Math.PI * 2);
  c.restore();
  c.fill();
}

export const rnd = (rng: Rng, a: number, b: number) => a + (b - a) * rng();
