import type { Rng } from '../../core/rng';
import { shade } from '../../core/color';
import { registerAsset, type AssetDef } from './registry';
import { poly, scallop, blob, radial, linear, ink, rnd, ellipse, line, speckle, smoothClosed, type C } from './draw';

/**
 * Top-down nature pack (battlemaps, camps, settlements). Light comes from the
 * upper-left; outlines are thin dark strokes; shading is painterly.
 */

const OUT = '#1b2012';
type D = (c: C, w: number, h: number, rng: Rng) => void;

function spikyStar(c: C, cx: number, cy: number, r: number, n: number, inner: number, rng: Rng, rot: number) {
  const pts: number[][] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2 + rnd(rng, -0.06, 0.06);
    const rr = i % 2 === 0 ? r * rnd(rng, 0.9, 1.05) : r * inner * rnd(rng, 0.9, 1.1);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  poly(c, pts);
}

function coniferTop(base: string, opts: { layers?: number; spikes?: number; snow?: boolean; dead?: boolean } = {}): D {
  return (c, w, h, rng) => {
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
    const L = opts.layers ?? 4;
    const n = opts.spikes ?? 14;
    const lw = R * 0.03;
    for (let i = 0; i < L; i++) {
      const t = i / (L - 1 || 1);
      const r = R * (1 - t * 0.72);
      const ox = -t * R * 0.12, oy = -t * R * 0.12;
      spikyStar(c, cx + ox, cy + oy, r, n - i * 2, 0.62 + t * 0.08, rng, rng() * Math.PI);
      const col = opts.dead ? shade('#6b5a44', -0.3 + t * 0.35) : shade(base, -0.35 + t * 0.45);
      c.fillStyle = col;
      c.fill();
      if (i === 0) ink(c, lw, OUT);
      else { c.strokeStyle = shade(col, -0.35); c.lineWidth = lw * 0.6; c.stroke(); }
      if (opts.snow) {
        c.save(); c.clip();
        c.fillStyle = 'rgba(245,250,255,0.75)';
        ellipse(c, cx + ox - r * 0.3, cy + oy - r * 0.3, r * 0.55, r * 0.45); c.fill();
        c.restore();
      }
    }
    c.fillStyle = '#3d2c1c';
    ellipse(c, cx - R * 0.1, cy - R * 0.1, R * 0.05, R * 0.05); c.fill();
  };
}

function leafyTop(base: string, opts: { lobes?: number; autumn?: boolean; blossom?: string } = {}): D {
  return (c, w, h, rng) => {
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 * 0.96;
    const lw = R * 0.035;
    scallop(c, cx, cy, R, R, rng, opts.lobes ?? 11, 0.25);
    c.fillStyle = radial(c, cx - R * 0.35, cy - R * 0.35, R * 1.5, [[0, shade(base, 0.2)], [0.55, base], [1, shade(base, -0.45)]]);
    c.fill();
    ink(c, lw, OUT);
    c.save(); c.clip();
    // Inner clumps: darker bottom-right, lighter top-left.
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * R * 0.6;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      const rr = R * rnd(rng, 0.25, 0.42);
      scallop(c, x, y, rr, rr, rng, 7, 0.3);
      const lightness = ((cx - x) + (cy - y)) / (R * 2);
      c.fillStyle = shade(base, -0.1 + lightness * 0.5);
      c.globalAlpha = 0.85;
      c.fill();
      c.globalAlpha = 0.5;
      c.strokeStyle = shade(base, -0.45); c.lineWidth = lw * 0.6;
      c.stroke();
    }
    c.globalAlpha = 1;
    speckle(c, cx, cy, R, rng, Math.round(R * 1.5), [shade(base, 0.35), shade(base, -0.4)], [R * 0.01, R * 0.03], 0.5);
    if (opts.blossom) speckle(c, cx, cy, R * 0.9, rng, Math.round(R * 0.8), [opts.blossom, shade(opts.blossom, 0.3)], [R * 0.02, R * 0.045], 0.9);
    c.restore();
  };
}

const deadTop: D = (c, w, h, rng) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
  const branch = (x: number, y: number, a: number, len: number, width: number, depth: number) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    c.strokeStyle = OUT; c.lineWidth = width + R * 0.03;
    line(c, x, y, x2, y2); c.stroke();
    c.strokeStyle = '#6b5641'; c.lineWidth = width;
    line(c, x, y, x2, y2); c.stroke();
    if (depth > 0) {
      branch(x2, y2, a + rnd(rng, 0.25, 0.6), len * 0.6, width * 0.6, depth - 1);
      branch(x2, y2, a - rnd(rng, 0.25, 0.6), len * 0.55, width * 0.6, depth - 1);
    }
  };
  const n = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) branch(cx, cy, (i / n) * Math.PI * 2 + rnd(rng, -0.2, 0.2), R * rnd(rng, 0.4, 0.5), R * 0.08, 2);
  c.fillStyle = '#5a4634';
  ellipse(c, cx, cy, R * 0.14, R * 0.14); c.fill(); ink(c, R * 0.03, OUT);
};

const bushTop = (base: string, flowers?: string[]): D => (c, w, h, rng) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 * 0.95;
  for (let i = 0; i < 4; i++) {
    const a = rng() * Math.PI * 2, d = R * 0.35;
    scallop(c, cx + Math.cos(a) * d * (i ? 1 : 0), cy + Math.sin(a) * d * (i ? 1 : 0), R * (i ? 0.6 : 0.75), R * (i ? 0.6 : 0.75), rng, 8, 0.35);
    c.fillStyle = radial(c, cx - R * 0.4, cy - R * 0.4, R * 1.6, [[0, shade(base, 0.25)], [1, shade(base, -0.4)]]);
    c.fill(); ink(c, R * 0.04, OUT);
  }
  if (flowers) {
    for (let i = 0; i < R * 0.5; i++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * R * 0.85;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      c.fillStyle = flowers[i % flowers.length];
      for (let k = 0; k < 5; k++) {
        const pa = (k / 5) * Math.PI * 2;
        ellipse(c, x + Math.cos(pa) * R * 0.05, y + Math.sin(pa) * R * 0.05, R * 0.045, R * 0.045); c.fill();
      }
      c.fillStyle = '#f5d76e'; ellipse(c, x, y, R * 0.03, R * 0.03); c.fill();
    }
  }
};

const fern: D = (c, w, h, rng) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd(rng, -0.2, 0.2);
    const len = R * rnd(rng, 0.75, 0.98);
    const ex = cx + Math.cos(a) * len, ey = cy + Math.sin(a) * len;
    c.strokeStyle = '#2f4a1c'; c.lineWidth = R * 0.03;
    line(c, cx, cy, ex, ey); c.stroke();
    for (let k = 1; k < 9; k++) {
      const t = k / 9;
      const px = cx + (ex - cx) * t, py = cy + (ey - cy) * t;
      const ll = R * 0.22 * (1 - t * 0.8);
      for (const s of [-1, 1]) {
        const la = a + s * 1.0;
        c.fillStyle = shade('#5d8a36', ((k + (s > 0 ? 1 : 0)) % 2) * 0.12 - 0.05);
        ellipse(c, px + Math.cos(la) * ll * 0.5, py + Math.sin(la) * ll * 0.5, ll * 0.55, ll * 0.18, la);
        c.fill();
      }
    }
  }
};

const grassTop: D = (c, w, h, rng) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
  c.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const len = R * rnd(rng, 0.45, 0.95);
    c.strokeStyle = shade('#6f8f3a', rnd(rng, -0.3, 0.25));
    c.lineWidth = R * 0.06;
    c.beginPath(); c.moveTo(cx, cy);
    c.quadraticCurveTo(cx + Math.cos(a + 0.3) * len * 0.5, cy + Math.sin(a + 0.3) * len * 0.5, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    c.stroke();
  }
};

const reedsTop: D = (c, w, h, rng) => {
  for (let i = 0; i < 30; i++) {
    const x = w * rnd(rng, 0.1, 0.9), y = h * rnd(rng, 0.1, 0.9);
    const a = rnd(rng, -2.4, -0.7);
    const len = Math.min(w, h) * rnd(rng, 0.2, 0.4);
    c.strokeStyle = shade('#7b8a3e', rnd(rng, -0.3, 0.2)); c.lineWidth = Math.min(w, h) * 0.025;
    line(c, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len); c.stroke();
    if (rng() < 0.3) { c.fillStyle = '#5b3d22'; ellipse(c, x + Math.cos(a) * len, y + Math.sin(a) * len, w * 0.02, w * 0.035, a); c.fill(); }
  }
};

const mushrooms = (cap: string, glow = false): D => (c, w, h, rng) => {
  const n = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const x = w * rnd(rng, 0.2, 0.8), y = h * rnd(rng, 0.2, 0.8), r = Math.min(w, h) * rnd(rng, 0.08, 0.18);
    if (glow) { c.fillStyle = radial(c, x, y, r * 2.5, [[0, 'rgba(120,255,220,0.45)'], [1, 'rgba(120,255,220,0)']]); ellipse(c, x, y, r * 2.5, r * 2.5); c.fill(); }
    c.fillStyle = radial(c, x - r * 0.3, y - r * 0.3, r * 1.3, [[0, shade(cap, 0.3)], [1, shade(cap, -0.3)]]);
    ellipse(c, x, y, r, r); c.fill(); ink(c, r * 0.12, OUT);
    c.fillStyle = 'rgba(255,255,240,0.8)';
    for (let k = 0; k < 3; k++) { ellipse(c, x + rnd(rng, -0.5, 0.5) * r, y + rnd(rng, -0.5, 0.5) * r, r * 0.13, r * 0.13); c.fill(); }
  }
};

function rockShape(c: C, cx: number, cy: number, rx: number, ry: number, rng: Rng, base: string, facets = true) {
  const n = 7 + Math.floor(rng() * 3);
  const pts: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd(rng, -0.2, 0.2);
    const k = rnd(rng, 0.78, 1.05);
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  poly(c, pts);
  c.fillStyle = linear(c, cx - rx, cy - ry, cx + rx, cy + ry, [[0, shade(base, 0.3)], [0.5, base], [1, shade(base, -0.45)]]);
  c.fill();
  const lw = Math.min(rx, ry) * 0.08;
  c.save(); c.clip();
  if (facets) {
    const top = [cx - rx * 0.15 + rnd(rng, -1, 1) * rx * 0.1, cy - ry * 0.15];
    c.fillStyle = shade(base, 0.22);
    poly(c, [pts[Math.floor(n * 0.5)], pts[Math.floor(n * 0.62)], pts[Math.floor(n * 0.75)], top]);
    c.fill();
    c.strokeStyle = shade(base, -0.5); c.lineWidth = lw * 0.5;
    for (let i = 0; i < 3; i++) {
      const p = pts[Math.floor(rng() * n)];
      line(c, top[0], top[1], (p[0] + top[0]) / 2 + (p[0] - top[0]) * 0.4, (p[1] + top[1]) / 2 + (p[1] - top[1]) * 0.4); c.stroke();
    }
  }
  c.restore();
  poly(c, pts);
  ink(c, lw, '#1c1a17');
}

const rocks = (count: number, base = '#8a857b'): D => (c, w, h, rng) => {
  const items = Array.from({ length: count }, () => ({ x: w * rnd(rng, 0.25, 0.75), y: h * rnd(rng, 0.25, 0.75), r: Math.min(w, h) * (count === 1 ? 0.45 : rnd(rng, 0.12, 0.28)) }));
  if (count === 1) { items[0].x = w / 2; items[0].y = h / 2; }
  items.sort((a, b) => a.y - b.y);
  for (const it of items) rockShape(c, it.x, it.y, it.r * rnd(rng, 1, 1.25), it.r * rnd(rng, 0.8, 1), rng, shade(base, rnd(rng, -0.08, 0.08)));
};

const mossyRock: D = (c, w, h, rng) => {
  rocks(1, '#7f7b70')(c, w, h, rng);
  c.save();
  c.globalAlpha = 0.8;
  speckle(c, w * 0.42, h * 0.4, Math.min(w, h) * 0.28, rng, 70, ['#5d7a2e', '#7a9a3a', '#48621f'], [w * 0.015, w * 0.04], 0.8);
  c.restore();
};

const cliff: D = (c, w, h, rng) => {
  // A long rocky band: shadowed face along the bottom edge.
  const topPts: number[][] = [], botPts: number[][] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const x = (w * i) / n;
    topPts.push([x, h * 0.18 + rnd(rng, -1, 1) * h * 0.1]);
    botPts.push([x, h * 0.72 + rnd(rng, -1, 1) * h * 0.12]);
  }
  poly(c, [...topPts, [w, h * 0.95], [0, h * 0.95]]);
  c.fillStyle = '#3e3a34'; c.fill();
  poly(c, [...topPts, ...botPts.slice().reverse()]);
  c.fillStyle = linear(c, 0, 0, 0, h, [[0, '#a39c8f'], [1, '#6c665c']]); c.fill();
  c.strokeStyle = '#26231f'; c.lineWidth = h * 0.02;
  for (let i = 1; i < n; i++) { line(c, botPts[i][0], botPts[i][1], botPts[i][0] + rnd(rng, -3, 3), h * 0.93); c.stroke(); }
  poly(c, [...topPts, [w, h * 0.95], [0, h * 0.95]]); ink(c, h * 0.025, '#1c1a17');
  poly(c, botPts, false); c.lineWidth = h * 0.02; c.stroke();
};

const log = (fallen: boolean): D => (c, w, h, rng) => {
  const r = h * (fallen ? 0.18 : 0.38);
  const y = h / 2;
  if (fallen) {
    // Branches + dead foliage
    for (let i = 0; i < 6; i++) {
      const x = w * rnd(rng, 0.25, 0.85), s = rng() < 0.5 ? -1 : 1;
      c.strokeStyle = '#4b3a28'; c.lineWidth = h * 0.05;
      line(c, x, y, x + rnd(rng, -0.1, 0.1) * w, y + s * h * rnd(rng, 0.3, 0.48)); c.stroke();
    }
    scallop(c, w * 0.88, y, w * 0.1, h * 0.42, rng, 8, 0.4);
    c.fillStyle = '#6b6a3a'; c.fill(); ink(c, h * 0.02, OUT);
  }
  c.fillStyle = linear(c, 0, y - r, 0, y + r, [[0, '#8a6a47'], [0.5, '#6b4f33'], [1, '#3e2c1c']]);
  c.beginPath(); c.roundRect(w * 0.06, y - r, w * (fallen ? 0.82 : 0.86), r * 2, r); c.fill(); ink(c, h * 0.03, '#221810');
  c.strokeStyle = 'rgba(40,28,18,0.6)'; c.lineWidth = h * 0.015;
  for (let i = 0; i < 6; i++) { const x = w * rnd(rng, 0.15, 0.8); line(c, x, y - r * 0.6, x + w * 0.08, y - r * 0.5); c.stroke(); }
  c.fillStyle = '#c9a877';
  ellipse(c, w * 0.08, y, r * 0.35, r); c.fill(); ink(c, h * 0.02, '#221810');
  c.strokeStyle = '#8a6a44'; c.lineWidth = h * 0.012;
  ellipse(c, w * 0.08, y, r * 0.2, r * 0.6); c.stroke();
};

const stump: D = (c, w, h, rng) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 * 0.9;
  for (let i = 0; i < 5; i++) {
    const a = rng() * Math.PI * 2;
    c.strokeStyle = '#4a3624'; c.lineWidth = R * 0.18;
    line(c, cx, cy, cx + Math.cos(a) * R * 1.05, cy + Math.sin(a) * R * 1.05); c.stroke();
  }
  blob(c, cx, cy, R * 0.72, R * 0.72, rng, 12, 0.12);
  c.fillStyle = '#5a4128'; c.fill(); ink(c, R * 0.06, '#221810');
  blob(c, cx - R * 0.04, cy - R * 0.04, R * 0.58, R * 0.58, rng, 12, 0.08);
  c.fillStyle = '#c9a877'; c.fill();
  c.strokeStyle = '#8f6b43'; c.lineWidth = R * 0.03;
  for (let r = 0.12; r < 0.55; r += 0.1) { ellipse(c, cx - R * 0.04, cy - R * 0.04, R * r, R * r); c.stroke(); }
};

const roots: D = (c, w, h, rng) => {
  const cx = w / 2, cy = h / 2;
  const grow = (x: number, y: number, a: number, len: number, wd: number, d: number) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    c.strokeStyle = '#1e160e'; c.lineWidth = wd + 1.5;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo((x + x2) / 2 + rnd(rng, -4, 4), (y + y2) / 2 + rnd(rng, -4, 4), x2, y2); c.stroke();
    c.strokeStyle = '#6b5033'; c.lineWidth = wd; c.stroke();
    if (d > 0) { grow(x2, y2, a + rnd(rng, -0.6, 0.6), len * 0.7, wd * 0.6, d - 1); if (rng() < 0.6) grow(x2, y2, a + rnd(rng, -0.9, 0.9), len * 0.5, wd * 0.5, d - 1); }
  };
  for (let i = 0; i < 5; i++) grow(cx, cy, (i / 5) * Math.PI * 2, Math.min(w, h) * 0.22, Math.min(w, h) * 0.05, 2);
};

const branches: D = (c, w, h, rng) => {
  for (let i = 0; i < 4; i++) {
    const x = w * rnd(rng, 0.15, 0.85), y = h * rnd(rng, 0.2, 0.8), a = rng() * Math.PI, len = w * rnd(rng, 0.3, 0.45);
    c.strokeStyle = '#1e160e'; c.lineWidth = h * 0.08;
    line(c, x - Math.cos(a) * len / 2, y - Math.sin(a) * len / 2, x + Math.cos(a) * len / 2, y + Math.sin(a) * len / 2); c.stroke();
    c.strokeStyle = '#7a5c3b'; c.lineWidth = h * 0.05; c.stroke();
  }
};

const flowerPatch = (cols: string[]): D => (c, w, h, rng) => {
  grassTop(c, w, h, rng);
  for (let i = 0; i < 14; i++) {
    const x = w * rnd(rng, 0.15, 0.85), y = h * rnd(rng, 0.15, 0.85), r = w * 0.05;
    c.fillStyle = cols[i % cols.length];
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; ellipse(c, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.5, r * 0.5); c.fill(); }
    c.fillStyle = '#f7d854'; ellipse(c, x, y, r * 0.35, r * 0.35); c.fill();
  }
};

const puddle = (col: string): D => (c, w, h, rng) => {
  blob(c, w / 2, h / 2, w * 0.46, h * 0.44, rng, 12, 0.3);
  c.fillStyle = radial(c, w * 0.45, h * 0.45, w * 0.5, [[0, shade(col, 0.1)], [1, shade(col, -0.25)]]); c.fill();
  c.strokeStyle = 'rgba(40,30,20,0.6)'; c.lineWidth = w * 0.02; c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = w * 0.015;
  c.beginPath(); c.arc(w * 0.4, h * 0.4, w * 0.2, Math.PI * 1.1, Math.PI * 1.5); c.stroke();
};

const tracks: D = (c, w, h, rng) => {
  c.fillStyle = 'rgba(50,36,24,0.55)';
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const x = w * (0.08 + 0.84 * t), y = h / 2 + (i % 2 ? -1 : 1) * h * 0.15 + Math.sin(t * 5) * h * 0.1;
    for (const s of [-1, 1]) { ellipse(c, x + s * w * 0.012, y, w * 0.01, h * 0.08, 0); c.fill(); }
  }
};

const elkCarcass: D = (c, w, h, rng) => {
  const cx = w * 0.5, cy = h * 0.5;
  // blood / trampled area
  blob(c, cx, cy + h * 0.05, w * 0.42, h * 0.38, rng, 12, 0.35);
  c.fillStyle = 'rgba(92,20,18,0.35)'; c.fill();
  // body
  ellipse(c, cx, cy, w * 0.26, h * 0.17, 0.1);
  c.fillStyle = linear(c, cx, cy - h * 0.17, cx, cy + h * 0.17, [[0, '#8a6a48'], [1, '#4f3a26']]); c.fill(); ink(c, w * 0.012, '#1e140c');
  // exposed ribs
  c.strokeStyle = '#e7dcc8'; c.lineWidth = w * 0.012;
  for (let i = 0; i < 5; i++) { const x = cx - w * 0.06 + i * w * 0.03; c.beginPath(); c.arc(x, cy, h * 0.07, -0.3, Math.PI + 0.3); c.stroke(); }
  c.fillStyle = 'rgba(130,25,25,0.8)'; ellipse(c, cx, cy, w * 0.08, h * 0.05); c.fill();
  // legs
  c.strokeStyle = '#3f2d1e'; c.lineWidth = w * 0.025;
  for (const [a, b] of [[-0.18, 0.1], [-0.12, 0.14], [0.12, 0.13], [0.18, 0.1]]) { line(c, cx + w * a, cy + h * 0.08, cx + w * (a * 1.3), cy + h * (0.2 + b)); c.stroke(); }
  // head + antlers
  const hx = cx - w * 0.33, hy = cy - h * 0.08;
  ellipse(c, hx, hy, w * 0.07, h * 0.06, -0.4); c.fillStyle = '#6a5038'; c.fill(); ink(c, w * 0.01, '#1e140c');
  c.strokeStyle = '#d9c8a4'; c.lineWidth = w * 0.014;
  for (const s of [-1, 1]) {
    c.beginPath(); c.moveTo(hx, hy); c.quadraticCurveTo(hx - w * 0.05, hy + s * h * 0.18, hx - w * 0.14, hy + s * h * 0.28); c.stroke();
    for (let k = 1; k < 4; k++) { const tx = hx - w * 0.035 * k, ty = hy + s * h * 0.08 * k; line(c, tx, ty, tx - w * 0.04, ty + s * h * 0.02 - h * 0.05); c.stroke(); }
  }
};

const bones: D = (c, w, h, rng) => {
  c.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const x = w * rnd(rng, 0.2, 0.8), y = h * rnd(rng, 0.2, 0.8), a = rng() * Math.PI, l = w * rnd(rng, 0.15, 0.3);
    const x0 = x - Math.cos(a) * l / 2, y0 = y - Math.sin(a) * l / 2, x1 = x + Math.cos(a) * l / 2, y1 = y + Math.sin(a) * l / 2;
    c.strokeStyle = '#2a241c'; c.lineWidth = w * 0.06; line(c, x0, y0, x1, y1); c.stroke();
    c.strokeStyle = '#e6dcc5'; c.lineWidth = w * 0.04; c.stroke();
    for (const [px, py] of [[x0, y0], [x1, y1]]) { c.fillStyle = '#e6dcc5'; ellipse(c, px, py, w * 0.035, w * 0.035); c.fill(); ink(c, w * 0.01, '#2a241c'); }
  }
  // skull
  c.fillStyle = '#ece3cf'; ellipse(c, w * 0.5, h * 0.45, w * 0.12, h * 0.1); c.fill(); ink(c, w * 0.012, '#2a241c');
  c.fillStyle = '#2a241c'; ellipse(c, w * 0.46, h * 0.45, w * 0.025, h * 0.025); c.fill(); ellipse(c, w * 0.54, h * 0.45, w * 0.025, h * 0.025); c.fill();
};

const waterRunoff: D = (c, w, h, rng) => {
  c.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    c.beginPath();
    let x = w * rnd(rng, 0.3, 0.7), y = 0;
    c.moveTo(x, y);
    while (y < h) { x += rnd(rng, -w * 0.08, w * 0.08); y += h * 0.1; c.lineTo(x, y); }
    c.strokeStyle = 'rgba(40,60,70,0.55)'; c.lineWidth = w * 0.06 * (1 - k * 0.3); c.stroke();
    c.strokeStyle = 'rgba(140,190,200,0.6)'; c.lineWidth = w * 0.03 * (1 - k * 0.3); c.stroke();
  }
};

// --------------------------------------------------------------------------- registration

type Entry = [id: string, name: string, sub: string, w: number, h: number, draw: D, role: AssetDef['role'], collision: AssetDef['collision'], tags: string[]];

const E: Entry[] = [
  ['spruce-a', 'Spruce A', 'Conifers', 180, 180, coniferTop('#2f5a3a', { layers: 4, spikes: 16 }), 'vegetation', 'tree', ['spruce', 'conifer', 'tree', 'forest']],
  ['spruce-b', 'Spruce B', 'Conifers', 160, 160, coniferTop('#2c5236', { layers: 4, spikes: 14 }), 'vegetation', 'tree', ['spruce', 'conifer', 'tree', 'forest']],
  ['spruce-c', 'Spruce C', 'Conifers', 200, 200, coniferTop('#35613f', { layers: 5, spikes: 18 }), 'vegetation', 'tree', ['spruce', 'conifer', 'tree', 'forest']],
  ['pine-a', 'Pine A', 'Conifers', 190, 190, coniferTop('#3f6a37', { layers: 3, spikes: 12 }), 'vegetation', 'tree', ['pine', 'conifer', 'tree', 'forest']],
  ['pine-b', 'Pine B', 'Conifers', 170, 170, coniferTop('#476f3a', { layers: 3, spikes: 11 }), 'vegetation', 'tree', ['pine', 'conifer', 'tree', 'forest']],
  ['spruce-small', 'Small Spruce', 'Conifers', 100, 100, coniferTop('#3a6843', { layers: 3, spikes: 12 }), 'vegetation', 'tree', ['spruce', 'conifer', 'tree', 'forest', 'small']],
  ['pine-dead', 'Dead Pine', 'Conifers', 160, 160, coniferTop('#6b5a44', { layers: 3, spikes: 11, dead: true }), 'vegetation', 'tree', ['pine', 'dead', 'tree']],
  ['spruce-snow', 'Snowy Spruce', 'Conifers', 180, 180, coniferTop('#2f5a45', { layers: 4, spikes: 16, snow: true }), 'vegetation', 'tree', ['spruce', 'snow', 'winter', 'tree']],
  ['oak-a', 'Oak A', 'Deciduous', 220, 220, leafyTop('#58803a'), 'vegetation', 'tree', ['oak', 'deciduous', 'tree', 'forest']],
  ['oak-b', 'Oak B', 'Deciduous', 200, 200, leafyTop('#4c7334', { lobes: 9 }), 'vegetation', 'tree', ['oak', 'deciduous', 'tree', 'forest']],
  ['birch', 'Birch', 'Deciduous', 150, 150, leafyTop('#7a9a44', { lobes: 12 }), 'vegetation', 'tree', ['birch', 'deciduous', 'tree']],
  ['maple-autumn', 'Autumn Maple', 'Deciduous', 190, 190, leafyTop('#c0692c', { lobes: 10 }), 'vegetation', 'tree', ['maple', 'autumn', 'tree']],
  ['cherry', 'Blossom Tree', 'Deciduous', 170, 170, leafyTop('#5b7d3c', { blossom: '#f1b5c8' }), 'vegetation', 'tree', ['blossom', 'elven', 'tree']],
  ['dead-tree', 'Dead Tree', 'Dead Trees', 170, 170, deadTop, 'vegetation', 'tree', ['dead', 'tree', 'swamp']],
  ['bush-a', 'Bush A', 'Shrubs', 70, 70, bushTop('#4f7a34'), 'vegetation', 'prop', ['bush', 'shrub', 'undergrowth']],
  ['bush-b', 'Bush B', 'Shrubs', 60, 60, bushTop('#5f8a3a'), 'vegetation', 'prop', ['bush', 'shrub', 'undergrowth']],
  ['bush-berry', 'Berry Bush', 'Shrubs', 64, 64, bushTop('#3f6a31', ['#8e1f3a', '#b02c4a']), 'vegetation', 'prop', ['bush', 'berry']],
  ['bush-flower', 'Flowering Bush', 'Shrubs', 64, 64, bushTop('#4f7a34', ['#e7e2f5', '#c7a6e8']), 'vegetation', 'prop', ['bush', 'flowers']],
  ['fern', 'Fern', 'Undergrowth', 70, 70, fern, 'details', 'none', ['fern', 'undergrowth', 'forest']],
  ['grass-tuft', 'Grass Tuft', 'Undergrowth', 40, 40, grassTop, 'details', 'none', ['grass', 'undergrowth']],
  ['flowers-a', 'Wildflowers', 'Undergrowth', 60, 60, flowerPatch(['#e9d24a', '#f2f2f2', '#c95b8a']), 'details', 'none', ['flowers', 'meadow']],
  ['flowers-b', 'Bluebells', 'Undergrowth', 60, 60, flowerPatch(['#6a7fd8', '#8f9ee8']), 'details', 'none', ['flowers']],
  ['reeds', 'Reeds', 'Wetland', 70, 70, reedsTop, 'details', 'none', ['reeds', 'shore', 'swamp', 'water']],
  ['mushrooms', 'Mushrooms', 'Fungi', 34, 34, mushrooms('#b8452f'), 'details', 'none', ['mushroom', 'forest', 'fungi']],
  ['mushrooms-brown', 'Brown Mushrooms', 'Fungi', 34, 34, mushrooms('#9a7550'), 'details', 'none', ['mushroom', 'forest', 'fungi']],
  ['log', 'Log', 'Deadwood', 150, 44, log(false), 'details', 'prop', ['log', 'wood', 'forest']],
  ['fallen-tree', 'Fallen Tree', 'Deadwood', 280, 110, log(true), 'details', 'prop', ['fallen', 'tree', 'log', 'forest']],
  ['stump', 'Stump', 'Deadwood', 50, 50, stump, 'details', 'prop', ['stump', 'forest']],
  ['roots', 'Roots', 'Deadwood', 110, 110, roots, 'details', 'none', ['roots']],
  ['branches', 'Branches', 'Deadwood', 70, 40, branches, 'details', 'none', ['branches', 'twigs', 'forest']],
  ['rock-a', 'Rock A', 'Rocks', 34, 30, rocks(1), 'details', 'rock', ['rock', 'stone']],
  ['rock-b', 'Rock B', 'Rocks', 28, 24, rocks(1, '#7c776c'), 'details', 'rock', ['rock', 'stone']],
  ['rocks-cluster', 'Rock Cluster', 'Rocks', 80, 70, rocks(5), 'details', 'rock', ['rock', 'stone', 'cluster']],
  ['pebbles', 'Pebbles', 'Rocks', 50, 50, rocks(9, '#9a948a'), 'details', 'none', ['pebbles', 'stone', 'river']],
  ['boulder', 'Boulder', 'Rocks', 110, 95, rocks(1, '#858075'), 'details', 'rock', ['boulder', 'rock']],
  ['boulder-mossy', 'Mossy Boulder', 'Rocks', 100, 90, mossyRock, 'details', 'rock', ['boulder', 'moss', 'rock']],
  ['cliff', 'Cliff Edge', 'Cliffs', 300, 90, cliff, 'details', 'rock', ['cliff', 'rock', 'ledge']],
  ['puddle', 'Puddle', 'Water', 70, 50, puddle('#4d7a86'), 'ground', 'none', ['puddle', 'water']],
  ['pond', 'Small Pond', 'Water', 240, 180, puddle('#3e6f7c'), 'ground', 'none', ['pond', 'water', 'pool']],
  ['runoff', 'Water Runoff', 'Water', 60, 180, waterRunoff, 'ground', 'none', ['runoff', 'stream', 'water']],
  ['tracks', 'Animal Tracks', 'Storytelling', 160, 50, tracks, 'ground', 'none', ['tracks', 'footprints', 'trail']],
  ['elk-carcass', 'Elk Carcass', 'Storytelling', 170, 110, elkCarcass, 'details', 'prop', ['elk', 'kill', 'hunt', 'carcass']],
  ['bones', 'Bones', 'Storytelling', 60, 60, bones, 'details', 'none', ['bones', 'skull', 'remains']],
];

export function registerNatureAssets() {
  for (const [id, name, sub, w, h, draw, role, collision, tags] of E) {
    registerAsset({ id: `td/${id}`, name, category: 'Nature', subcategory: sub, pack: 'topdown', tags, w, h, role, collision, draw, footprint: collision === 'tree' ? 0.35 : 0.7 });
  }
}

export { rockShape, smoothClosed, roots, bones };
