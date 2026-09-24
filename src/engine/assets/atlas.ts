import type { Rng } from '../../core/rng';
import { shade, mix } from '../../core/color';
import { registerAsset, type AssetDef } from './registry';
import { INK, poly, scallop, blob, linear, ink, rnd, ellipse, line, type C } from './draw';

/**
 * "Atlas" pack: illustrated, three-quarter-view icons for world & regional maps.
 * Every icon shares the same light direction (upper-left), ink weight and
 * palette so they compose into cohesive ranges and forests (spec §80).
 * Each drawer is parameterised by a palette so the same art also ships in a
 * sepia "Ink" variant for parchment maps.
 */

interface Pal {
  foliage: string; foliageDark: string; trunk: string; rockLight: string; rockDark: string; snow: string;
  roof: string; wall: string; ink: string; grass: string; water: string;
}

const COLOR: Pal = {
  foliage: '#5f7a35', foliageDark: '#34471f', trunk: '#4d3824', rockLight: '#c4b08a', rockDark: '#76644b', snow: '#f4f4ef',
  roof: '#9a4b33', wall: '#e2d4b4', ink: INK, grass: '#7f8a45', water: '#5f8a94',
};
const SEPIA: Pal = {
  foliage: '#b9aa8a', foliageDark: '#7b6a50', trunk: '#5b4a38', rockLight: '#e7dcc3', rockDark: '#a8977a', snow: '#f6f0e2',
  roof: '#a58f70', wall: '#efe6d2', ink: '#2a2119', grass: '#c9bb99', water: '#d9ccb0',
};

type Drawer = (c: C, w: number, h: number, rng: Rng, p: Pal) => void;

// --------------------------------------------------------------------------- trees

function conifer(opts: { tiers: number; slim: number; snow?: boolean; tint?: number; dead?: boolean }): Drawer {
  return (c, w, h, rng, p) => {
    const lw = Math.max(0.5, w * 0.06);
    const cx = w / 2;
    const trunkH = h * 0.14;
    c.fillStyle = p.trunk;
    c.fillRect(cx - w * 0.07, h - trunkH - 1, w * 0.14, trunkH + 1);
    c.strokeStyle = p.ink; c.lineWidth = lw * 0.8;
    c.strokeRect(cx - w * 0.07, h - trunkH - 1, w * 0.14, trunkH + 1);
    const bottom = h - trunkH * 0.7;
    const T = opts.tiers;
    const right: number[][] = [];
    for (let i = 0; i < T; i++) {
      const yb = (bottom * (i + 1)) / T;
      const hw = (w / 2) * opts.slim * (0.45 + 0.55 * ((i + 1) / T)) * rnd(rng, 0.92, 1.06);
      right.push([cx + hw, yb]);
      if (i < T - 1) right.push([cx + hw * 0.42, yb - bottom / T * 0.18]);
    }
    const pts: number[][] = [[cx + rnd(rng, -0.4, 0.4), 0], ...right, [cx, bottom]];
    const left = right.map(([x, y]) => [cx - (x - cx) * rnd(rng, 0.94, 1.04), y]).reverse();
    const all = [...pts.slice(0, pts.length - 1), [cx + w * 0.07, bottom], [cx - w * 0.07, bottom], ...left];
    const base = opts.dead ? mix(p.trunk, p.rockDark, 0.4) : opts.tint ? shade(p.foliage, opts.tint) : p.foliage;
    poly(c, all);
    c.fillStyle = linear(c, 0, 0, w, h, [[0, shade(base, 0.18)], [0.5, base], [1, shade(base, -0.25)]]);
    c.fill();
    // shadow half
    c.save();
    poly(c, all);
    c.clip();
    c.fillStyle = opts.dead ? shade(base, -0.3) : p.foliageDark;
    c.globalAlpha = 0.65;
    c.beginPath();
    c.moveTo(cx + w * 0.03, 0);
    c.lineTo(w, 0); c.lineTo(w, h); c.lineTo(cx + w * 0.08, h);
    c.closePath();
    c.fill();
    c.globalAlpha = 1;
    if (opts.snow) {
      c.fillStyle = p.snow;
      for (let i = 0; i < T; i++) {
        const yb = (bottom * (i + 1)) / T;
        const yt = yb - bottom / T * 0.5;
        c.beginPath();
        c.moveTo(cx - w * 0.5, yb - bottom / T * 0.05);
        c.quadraticCurveTo(cx, yt - bottom / T * 0.25, cx + w * 0.5, yb - bottom / T * 0.05);
        c.lineTo(cx + w * 0.5, yb - bottom / T * 0.2);
        c.quadraticCurveTo(cx, yt - bottom / T * 0.45, cx - w * 0.5, yb - bottom / T * 0.2);
        c.fill();
      }
    }
    c.restore();
    poly(c, all);
    ink(c, lw, p.ink);
  };
}

function deciduous(opts: { tint?: number; round?: number; autumn?: boolean }): Drawer {
  return (c, w, h, rng, p) => {
    const lw = Math.max(0.5, w * 0.05);
    const cx = w / 2;
    c.fillStyle = p.trunk;
    poly(c, [[cx - w * 0.08, h], [cx - w * 0.05, h * 0.55], [cx + w * 0.05, h * 0.55], [cx + w * 0.08, h]]);
    c.fill(); ink(c, lw * 0.8, p.ink);
    const base = opts.autumn ? '#b36b2c' : opts.tint ? shade(p.foliage, opts.tint) : p.foliage;
    const cy = h * 0.4, rx = w * 0.47, ry = h * 0.38 * (opts.round ?? 1);
    // Outline first (thick), then fill: gives a clean union outline.
    scallop(c, cx, cy, rx, ry, rng, 8, 0.3);
    const path = new Path2D();
    c.lineWidth = lw * 2;
    c.strokeStyle = p.ink;
    c.stroke();
    c.fillStyle = linear(c, 0, 0, w, h * 0.8, [[0, shade(base, 0.2)], [0.5, base], [1, shade(base, -0.3)]]);
    c.fill();
    void path;
    c.save();
    c.clip();
    c.fillStyle = shade(base, -0.35);
    c.globalAlpha = 0.5;
    ellipse(c, cx + rx * 0.45, cy + ry * 0.55, rx * 0.8, ry * 0.6);
    c.fill();
    c.globalAlpha = 0.45;
    c.fillStyle = shade(base, 0.35);
    ellipse(c, cx - rx * 0.35, cy - ry * 0.4, rx * 0.35, ry * 0.25);
    c.fill();
    c.restore();
    c.globalAlpha = 1;
  };
}

const deadTree: Drawer = (c, w, h, rng, p) => {
  const lw = Math.max(0.6, w * 0.07);
  c.strokeStyle = p.trunk;
  const branch = (x: number, y: number, a: number, len: number, width: number, depth: number) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    c.lineWidth = width;
    c.strokeStyle = p.ink;
    c.lineWidth = width + lw * 0.8;
    line(c, x, y, x2, y2); c.stroke();
    c.strokeStyle = p.trunk;
    c.lineWidth = width;
    line(c, x, y, x2, y2); c.stroke();
    if (depth > 0) {
      branch(x2, y2, a - rnd(rng, 0.3, 0.6), len * 0.68, width * 0.65, depth - 1);
      branch(x2, y2, a + rnd(rng, 0.3, 0.6), len * 0.62, width * 0.65, depth - 1);
    }
  };
  branch(w / 2, h, -Math.PI / 2 + rnd(rng, -0.1, 0.1), h * 0.42, w * 0.14, 3);
};

const palm: Drawer = (c, w, h, rng, p) => {
  const lw = Math.max(0.5, w * 0.05);
  c.strokeStyle = p.ink; c.lineWidth = w * 0.13 + lw;
  c.beginPath(); c.moveTo(w * 0.5, h); c.quadraticCurveTo(w * 0.62, h * 0.6, w * 0.5, h * 0.3); c.stroke();
  c.strokeStyle = p.trunk; c.lineWidth = w * 0.13;
  c.stroke();
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.55 + rnd(rng, -0.1, 0.1);
    const ex = w * 0.5 + Math.cos(a) * w * 0.5, ey = h * 0.3 + Math.sin(a) * h * 0.25 + h * 0.12;
    c.beginPath();
    c.moveTo(w * 0.5, h * 0.3);
    c.quadraticCurveTo(w * 0.5 + Math.cos(a) * w * 0.3, h * 0.3 + Math.sin(a) * h * 0.3 - h * 0.08, ex, ey);
    c.quadraticCurveTo(w * 0.5 + Math.cos(a) * w * 0.25, h * 0.3 + Math.sin(a) * h * 0.18, w * 0.5, h * 0.33);
    c.fillStyle = i % 2 ? p.foliage : shade(p.foliage, -0.2);
    c.fill(); ink(c, lw * 0.7, p.ink);
  }
};

const bush: Drawer = (c, w, h, rng, p) => {
  const lw = Math.max(0.4, w * 0.05);
  scallop(c, w / 2, h * 0.58, w * 0.46, h * 0.4, rng, 7, 0.3);
  c.lineWidth = lw * 2; c.strokeStyle = p.ink; c.stroke();
  c.fillStyle = linear(c, 0, 0, w, h, [[0, shade(p.foliage, 0.15)], [1, shade(p.foliage, -0.3)]]);
  c.fill();
};

const grassTuft: Drawer = (c, w, h, rng, p) => {
  c.strokeStyle = p.ink === INK ? '#3f4f22' : p.ink;
  c.lineWidth = Math.max(0.4, w * 0.06);
  for (let i = 0; i < 7; i++) {
    const x = w * (0.2 + 0.6 * (i / 6));
    c.beginPath();
    c.moveTo(x, h);
    c.quadraticCurveTo(x + rnd(rng, -2, 2), h * 0.5, x + (x - w / 2) * 0.5, h * rnd(rng, 0.05, 0.3));
    c.stroke();
  }
};

const reeds: Drawer = (c, w, h, rng, p) => {
  const lw = Math.max(0.4, w * 0.04);
  for (let i = 0; i < 9; i++) {
    const x = w * (0.1 + 0.8 * rng());
    const top = h * rnd(rng, 0.05, 0.4);
    c.strokeStyle = p.ink; c.lineWidth = lw;
    line(c, x, h, x + rnd(rng, -1.5, 1.5), top); c.stroke();
    if (rng() < 0.5) {
      c.fillStyle = p.trunk;
      ellipse(c, x, top + h * 0.08, w * 0.035, h * 0.08);
      c.fill(); ink(c, lw * 0.6, p.ink);
    }
  }
};

// --------------------------------------------------------------------------- mountains

function peakPoly(x0: number, x1: number, base: number, top: number, px: number, rng: Rng, jag: number) {
  const pts: number[][] = [[x0, base]];
  const steps = 4;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    pts.push([x0 + (px - x0) * t + rnd(rng, -1, 1) * jag, base + (top - base) * t + rnd(rng, -1, 1) * jag]);
  }
  pts.push([px, top]);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    pts.push([px + (x1 - px) * t + rnd(rng, -1, 1) * jag, top + (base - top) * t + rnd(rng, -1, 1) * jag]);
  }
  pts.push([x1, base]);
  return pts;
}

function drawPeak(c: C, rng: Rng, p: Pal, x0: number, x1: number, base: number, top: number, opts: { snow?: number; jag?: number; lw: number; rounded?: boolean }) {
  const px = x0 + (x1 - x0) * rnd(rng, 0.42, 0.58);
  const jag = (opts.jag ?? 0.05) * (x1 - x0);
  let pts = peakPoly(x0, x1, base, top, px, rng, jag);
  if (opts.rounded) {
    c.beginPath();
    c.moveTo(x0, base);
    c.bezierCurveTo(x0 + (px - x0) * 0.4, top + (base - top) * 0.15, px - (x1 - x0) * 0.2, top, px, top);
    c.bezierCurveTo(px + (x1 - x0) * 0.2, top, x1 - (x1 - px) * 0.4, top + (base - top) * 0.15, x1, base);
    c.closePath();
    pts = [];
  } else poly(c, pts);
  const body = new Path2D();
  if (opts.rounded) {
    body.moveTo(x0, base);
    body.bezierCurveTo(x0 + (px - x0) * 0.4, top + (base - top) * 0.15, px - (x1 - x0) * 0.2, top, px, top);
    body.bezierCurveTo(px + (x1 - x0) * 0.2, top, x1 - (x1 - px) * 0.4, top + (base - top) * 0.15, x1, base);
    body.closePath();
  } else {
    body.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts.slice(1)) body.lineTo(q[0], q[1]);
    body.closePath();
  }
  c.fillStyle = linear(c, x0, top, x1, base, [[0, shade(p.rockLight, 0.12)], [1, p.rockLight]]);
  c.fill(body);
  c.save();
  c.clip(body);
  // shadow face: from peak down a wiggly ridge to the base.
  const ridgeEnd = px + (x1 - px) * rnd(rng, 0.05, 0.35);
  c.beginPath();
  c.moveTo(px, top);
  let x = px, y = top;
  const n = 5;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    x = px + (ridgeEnd - px) * t + rnd(rng, -1, 1) * (x1 - x0) * 0.04;
    y = top + (base - top) * t;
    c.lineTo(x, y);
  }
  c.lineTo(x1 + 5, base + 5);
  c.lineTo(x1 + 5, top - 5);
  c.closePath();
  c.fillStyle = p.rockDark;
  c.fill();
  // hatching on the shadow face
  c.strokeStyle = shade(p.rockDark, -0.35);
  c.lineWidth = opts.lw * 0.55;
  for (let i = 0; i < 7; i++) {
    const t = 0.2 + rng() * 0.75;
    const hy = top + (base - top) * t;
    const hx = px + (ridgeEnd - px) * t + (x1 - x0) * 0.05;
    line(c, hx, hy, hx + (x1 - x0) * rnd(rng, 0.06, 0.16), hy + (base - top) * 0.1);
    c.stroke();
  }
  // snow cap
  if (opts.snow) {
    const sh = (base - top) * opts.snow;
    c.fillStyle = p.snow;
    c.beginPath();
    c.moveTo(px - (px - x0) * opts.snow * 1.2, top + sh);
    for (let i = 1; i <= 6; i++) {
      const t = i / 6;
      const sx = px - (px - x0) * opts.snow * 1.2 + (x1 - x0) * opts.snow * 1.9 * t;
      c.lineTo(sx, top + sh * (i % 2 ? 0.55 : 1) + rnd(rng, -1, 1) * sh * 0.15);
    }
    c.lineTo(px, top - 2);
    c.closePath();
    c.fill();
    c.fillStyle = shade(p.snow, -0.18);
    c.beginPath();
    c.moveTo(px, top);
    c.lineTo(px + (x1 - px) * opts.snow * 1.1, top + sh);
    c.lineTo(px + (ridgeEnd - px) * opts.snow, top + sh * 0.9);
    c.closePath();
    c.fill();
  }
  c.restore();
  c.strokeStyle = p.ink;
  c.lineWidth = opts.lw;
  c.stroke(body);
  // ridge line
  c.lineWidth = opts.lw * 0.6;
  c.beginPath();
  c.moveTo(px, top);
  c.quadraticCurveTo(px + (ridgeEnd - px) * 0.6 + (x1 - x0) * 0.03, top + (base - top) * 0.5, ridgeEnd, base);
  c.stroke();
}

function range(opts: { peaks: number; snow?: number; jag?: number; rounded?: boolean; low?: number }): Drawer {
  return (c, w, h, rng, p) => {
    const lw = Math.max(0.6, Math.min(w, h * 1.4) * 0.025);
    const n = opts.peaks;
    const items: { x0: number; x1: number; top: number; base: number }[] = [];
    for (let i = 0; i < n; i++) {
      const center = n === 1 ? w / 2 : w * (0.12 + 0.76 * (i / (n - 1))) + rnd(rng, -1, 1) * w * 0.03;
      const hw = (w / n) * rnd(rng, 0.75, 1.0) * (n === 1 ? 0.5 : 0.95);
      const tallness = n === 1 ? 1 : 1 - Math.abs(i - (n - 1) / 2) / n * 0.8 + rnd(rng, -0.12, 0.12);
      const top = h * (1 - Math.min(1, tallness) * (opts.low ?? 1)) + h * 0.02;
      const back = i % 2 === 1 && n > 2;
      items.push({ x0: Math.max(0, center - hw), x1: Math.min(w, center + hw), top: back ? top - h * 0.05 : top, base: back ? h * 0.9 : h });
    }
    // draw back peaks first
    const order = items.map((it, i) => ({ it, i })).sort((a, b) => a.it.base - b.it.base || (a.i % 2) - (b.i % 2));
    for (const { it } of order) {
      drawPeak(c, rng, p, it.x0, it.x1, it.base, Math.max(1, it.top), { snow: opts.snow, jag: opts.jag, lw, rounded: opts.rounded });
    }
  };
}

const hills: Drawer = (c, w, h, rng, p) => {
  const lw = Math.max(0.5, h * 0.05);
  const humps = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < humps; i++) {
    const x0 = w * (i / humps) * 0.8, x1 = x0 + w * rnd(rng, 0.45, 0.65);
    const top = h * rnd(rng, 0.15, 0.45);
    c.beginPath();
    c.moveTo(x0, h);
    c.bezierCurveTo(x0 + (x1 - x0) * 0.15, top, x0 + (x1 - x0) * 0.75, top, Math.min(w, x1), h);
    c.closePath();
    c.fillStyle = linear(c, x0, top, x1, h, [[0, shade(p.grass, 0.18)], [0.6, p.grass], [1, shade(p.grass, -0.3)]]);
    c.fill();
    ink(c, lw, p.ink);
    c.strokeStyle = shade(p.grass, -0.4);
    c.lineWidth = lw * 0.6;
    for (let k = 0; k < 3; k++) {
      const hx = x0 + (x1 - x0) * rnd(rng, 0.55, 0.85);
      line(c, hx, h - (h - top) * rnd(rng, 0.2, 0.6), hx + w * 0.04, h - (h - top) * 0.1);
      c.stroke();
    }
  }
};

const mesa: Drawer = (c, w, h, rng, p) => {
  const lw = Math.max(0.6, h * 0.03);
  const topY = h * 0.25;
  const pts = [[0, h], [w * 0.1, topY + 3], [w * 0.22, topY], [w * 0.78, topY + rnd(rng, -2, 2)], [w * 0.9, topY + 4], [w, h]];
  poly(c, pts);
  c.fillStyle = p.rockLight; c.fill();
  c.save(); c.clip();
  c.fillStyle = shade(p.rockLight, 0.2);
  c.fillRect(0, topY - 2, w, h * 0.12);
  c.strokeStyle = p.rockDark; c.lineWidth = lw * 0.8;
  for (let i = 0; i < 12; i++) {
    const x = w * (0.05 + 0.9 * rng());
    line(c, x, topY + h * 0.14, x + rnd(rng, -2, 2), h); c.stroke();
  }
  c.fillStyle = p.rockDark; c.globalAlpha = 0.6;
  c.fillRect(w * 0.6, topY + h * 0.12, w * 0.4, h);
  c.restore();
  c.globalAlpha = 1;
  poly(c, pts); ink(c, lw, p.ink);
};

const volcano: Drawer = (c, w, h, rng, p) => {
  range({ peaks: 1, jag: 0.03 })(c, w, h * 0.95, rng, p);
  c.fillStyle = '#3a2a22';
  ellipse(c, w / 2, h * 0.06, w * 0.08, h * 0.03); c.fill();
  c.fillStyle = 'rgba(120,120,120,0.55)';
  for (let i = 0; i < 4; i++) { ellipse(c, w / 2 + rnd(rng, -4, 4), -i * h * 0.05, w * 0.07 + i * 2, h * 0.04); c.fill(); }
};

// --------------------------------------------------------------------------- settlements

/** Three-quarter view cottage: lit gable front, shaded side wall, long roof plane. */
function house(c: C, x: number, y: number, s: number, p: Pal, roof?: string, lw?: number) {
  const L = lw ?? Math.max(0.5, s * 0.07);
  const r = roof ?? p.roof;
  const fw = s * 0.52, h = s * 0.46, dx = s * 0.42, dy = -s * 0.17, gable = s * 0.36;
  const xl = x - s / 2, xr = xl + fw, xm = xl + fw / 2;
  c.lineJoin = 'round';
  c.strokeStyle = p.ink;
  c.lineWidth = L;
  // side wall (shaded)
  poly(c, [[xr, y], [xr + dx, y + dy], [xr + dx, y - h + dy], [xr, y - h]]);
  c.fillStyle = shade(p.wall, -0.22); c.fill(); c.stroke();
  // front wall + gable (lit)
  poly(c, [[xl, y], [xr, y], [xr, y - h], [xm, y - h - gable], [xl, y - h]]);
  c.fillStyle = p.wall; c.fill(); c.stroke();
  // roof plane running back from the gable
  poly(c, [[xm, y - h - gable], [xr, y - h], [xr + dx, y - h + dy], [xm + dx, y - h - gable + dy]]);
  c.fillStyle = linear(c, xm, y - h - gable, xr + dx, y - h, [[0, shade(r, 0.12)], [1, shade(r, -0.18)]]); c.fill(); c.stroke();
  // roof eave overhang on the gable edge
  c.lineWidth = L * 1.4;
  line(c, xl - s * 0.04, y - h + s * 0.03, xm, y - h - gable); c.stroke();
  line(c, xm, y - h - gable, xr + s * 0.04, y - h + s * 0.03); c.stroke();
  c.lineWidth = L;
  // shingle hints
  c.strokeStyle = shade(r, -0.4);
  c.lineWidth = L * 0.5;
  for (let i = 1; i < 3; i++) {
    const t = i / 3;
    line(c, xm + (xr - xm) * t, y - h - gable + gable * t, xm + (xr - xm) * t + dx, y - h - gable + gable * t + dy); c.stroke();
  }
  c.strokeStyle = p.ink;
  c.lineWidth = L;
  // door & windows
  c.fillStyle = p === COLOR ? '#3b2a1c' : p.ink;
  c.fillRect(xm - s * 0.07, y - h * 0.55, s * 0.14, h * 0.55);
  c.fillStyle = p === COLOR ? '#f0c96a' : shade(p.wall, -0.4);
  poly(c, [[xr + dx * 0.3, y - h * 0.62 + dy * 0.3], [xr + dx * 0.62, y - h * 0.62 + dy * 0.62], [xr + dx * 0.62, y - h * 0.32 + dy * 0.62], [xr + dx * 0.3, y - h * 0.32 + dy * 0.3]]);
  c.fill(); c.lineWidth = L * 0.6; c.stroke(); c.lineWidth = L;
  // chimney
  const cx = xm + dx * 0.72 + (xr - xm) * 0.35, cy = y - h - gable * 0.65 + dy * 0.72;
  c.fillStyle = shade(p.rockLight, -0.1);
  c.fillRect(cx - s * 0.05, cy - s * 0.16, s * 0.1, s * 0.16);
  c.strokeRect(cx - s * 0.05, cy - s * 0.16, s * 0.1, s * 0.16);
}

function tower(c: C, x: number, y: number, s: number, h: number, p: Pal, lw: number) {
  c.fillStyle = shade(p.wall, -0.08);
  c.fillRect(x - s / 2, y - h, s, h);
  c.strokeStyle = p.ink; c.lineWidth = lw;
  c.strokeRect(x - s / 2, y - h, s, h);
  poly(c, [[x - s * 0.62, y - h], [x, y - h - s * 1.1], [x + s * 0.62, y - h]]);
  c.fillStyle = p.roof; c.fill(); ink(c, lw, p.ink);
  c.fillStyle = p.ink; c.fillRect(x - s * 0.1, y - h * 0.7, s * 0.2, s * 0.3);
}

function crenelWall(c: C, x0: number, x1: number, y: number, h: number, p: Pal, lw: number) {
  c.fillStyle = shade(p.wall, -0.12);
  c.fillRect(x0, y - h, x1 - x0, h);
  c.strokeStyle = p.ink; c.lineWidth = lw;
  c.strokeRect(x0, y - h, x1 - x0, h);
  const m = h * 0.35;
  for (let x = x0; x < x1 - m; x += m * 2) {
    c.fillStyle = shade(p.wall, -0.12);
    c.fillRect(x, y - h - m, m, m);
    c.strokeRect(x, y - h - m, m, m);
  }
}

const village: Drawer = (c, w, h, rng, p) => {
  const s = w * 0.32;
  house(c, w * 0.28, h * 0.72, s * 0.9, p);
  house(c, w * 0.72, h * 0.78, s * 0.85, p, shade(p.roof, -0.15));
  house(c, w * 0.5, h * 0.98, s, p);
};

const town: Drawer = (c, w, h, rng, p) => {
  const lw = Math.max(0.5, w * 0.022);
  tower(c, w * 0.5, h * 0.62, w * 0.14, h * 0.36, p, lw);
  const spots = [[0.2, 0.7], [0.8, 0.72], [0.33, 0.95], [0.67, 0.97], [0.5, 1]];
  spots.forEach(([x, y], i) => house(c, w * x, h * y, w * rnd(rng, 0.2, 0.25), p, i % 2 ? shade(p.roof, -0.15) : undefined, lw));
};

const city: Drawer = (c, w, h, rng, p) => {
  const lw = Math.max(0.5, w * 0.018);
  tower(c, w * 0.35, h * 0.5, w * 0.1, h * 0.32, p, lw);
  tower(c, w * 0.62, h * 0.45, w * 0.12, h * 0.36, p, lw);
  for (let i = 0; i < 7; i++) {
    house(c, w * (0.14 + 0.72 * (i / 6)) + rnd(rng, -2, 2), h * (0.72 + (i % 2) * 0.06), w * rnd(rng, 0.14, 0.18), p, i % 3 ? undefined : shade(p.roof, -0.2), lw);
  }
  crenelWall(c, w * 0.02, w * 0.98, h, h * 0.16, p, lw);
  tower(c, w * 0.06, h, w * 0.1, h * 0.3, p, lw);
  tower(c, w * 0.94, h, w * 0.1, h * 0.3, p, lw);
};

const castle: Drawer = (c, w, h, rng, p) => {
  const lw = Math.max(0.5, w * 0.025);
  crenelWall(c, w * 0.3, w * 0.7, h * 0.55, h * 0.3, p, lw); // keep
  tower(c, w * 0.5, h * 0.35, w * 0.14, h * 0.18, p, lw);
  crenelWall(c, w * 0.1, w * 0.9, h, h * 0.3, p, lw);
  tower(c, w * 0.12, h, w * 0.16, h * 0.5, p, lw);
  tower(c, w * 0.88, h, w * 0.16, h * 0.5, p, lw);
  c.fillStyle = p.ink;
  c.beginPath(); c.arc(w / 2, h, w * 0.08, Math.PI, 0); c.fill();
};

const watchtower: Drawer = (c, w, h, _rng, p) => {
  const lw = Math.max(0.5, w * 0.05);
  tower(c, w / 2, h, w * 0.45, h * 0.6, p, lw);
};

const ruins: Drawer = (c, w, h, rng, p) => {
  const lw = Math.max(0.5, w * 0.03);
  c.fillStyle = shade(p.wall, -0.15);
  c.strokeStyle = p.ink; c.lineWidth = lw;
  const cols = 4;
  for (let i = 0; i < cols; i++) {
    const x = w * (0.12 + 0.76 * (i / (cols - 1)));
    const hh = h * rnd(rng, 0.35, 0.9);
    poly(c, [[x - w * 0.06, h], [x - w * 0.06, h - hh], [x - w * 0.02, h - hh - 3], [x + w * 0.06, h - hh + 4], [x + w * 0.06, h]]);
    c.fill(); c.stroke();
  }
  poly(c, [[w * 0.05, h], [w * 0.05, h * 0.8], [w * 0.4, h * 0.85], [w * 0.55, h * 0.78], [w * 0.95, h * 0.83], [w * 0.95, h]]);
  c.fill(); c.stroke();
};

const temple: Drawer = (c, w, h, _rng, p) => {
  const lw = Math.max(0.5, w * 0.03);
  c.strokeStyle = p.ink; c.lineWidth = lw;
  c.fillStyle = p.wall;
  c.fillRect(w * 0.1, h * 0.85, w * 0.8, h * 0.15); c.strokeRect(w * 0.1, h * 0.85, w * 0.8, h * 0.15);
  for (let i = 0; i < 5; i++) {
    const x = w * (0.18 + i * 0.16);
    c.fillRect(x - w * 0.035, h * 0.45, w * 0.07, h * 0.4); c.strokeRect(x - w * 0.035, h * 0.45, w * 0.07, h * 0.4);
  }
  poly(c, [[w * 0.05, h * 0.45], [w * 0.5, h * 0.1], [w * 0.95, h * 0.45]]);
  c.fillStyle = shade(p.wall, -0.1); c.fill(); c.stroke();
};

const port: Drawer = (c, w, h, rng, p) => {
  const lw = Math.max(0.5, w * 0.025);
  village(c, w * 0.7, h * 0.8, rng, p);
  c.fillStyle = p.trunk;
  c.fillRect(w * 0.55, h * 0.84, w * 0.42, h * 0.07);
  c.strokeStyle = p.ink; c.lineWidth = lw; c.strokeRect(w * 0.55, h * 0.84, w * 0.42, h * 0.07);
  ship(c, w * 0.72 + w * 0.05, h * 0.55, w * 0.25, h * 0.4, p, lw);
};

function ship(c: C, x: number, y: number, w: number, h: number, p: Pal, lw: number) {
  c.fillStyle = p.trunk;
  poly(c, [[x, y + h * 0.7], [x + w, y + h * 0.7], [x + w * 0.85, y + h], [x + w * 0.15, y + h]]);
  c.fill(); c.strokeStyle = p.ink; c.lineWidth = lw; c.stroke();
  line(c, x + w * 0.5, y + h * 0.7, x + w * 0.5, y); c.stroke();
  poly(c, [[x + w * 0.52, y + h * 0.05], [x + w * 0.9, y + h * 0.55], [x + w * 0.52, y + h * 0.6]]);
  c.fillStyle = p.wall; c.fill(); c.stroke();
}

const shipIcon: Drawer = (c, w, h, _rng, p) => ship(c, 0, 0, w, h, p, Math.max(0.5, w * 0.04));

const farm: Drawer = (c, w, h, rng, p) => {
  const lw = Math.max(0.5, w * 0.025);
  c.strokeStyle = p.ink; c.lineWidth = lw * 0.8;
  poly(c, [[0, h], [w * 0.2, h * 0.6], [w, h * 0.6], [w * 0.85, h]]);
  c.fillStyle = mix(p.grass, '#c9a95a', p === COLOR ? 0.5 : 0.2); c.fill(); c.stroke();
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    line(c, w * 0.2 * (1 - t) + w * 0.0 * t + w * t * 0.85, h, w * 0.2 + (w - w * 0.2) * t, h * 0.6); c.stroke();
  }
  house(c, w * 0.22, h * 0.62, w * 0.25, p, undefined, lw);
};

const mine: Drawer = (c, w, h, rng, p) => {
  const lw = Math.max(0.5, w * 0.04);
  range({ peaks: 1, jag: 0.04, low: 0.8 })(c, w, h, rng, p);
  c.fillStyle = '#15110d';
  c.beginPath(); c.moveTo(w * 0.35, h); c.lineTo(w * 0.35, h * 0.72); c.quadraticCurveTo(w * 0.5, h * 0.58, w * 0.65, h * 0.72); c.lineTo(w * 0.65, h); c.fill();
  c.strokeStyle = p.trunk; c.lineWidth = lw * 1.4;
  c.beginPath(); c.moveTo(w * 0.35, h); c.lineTo(w * 0.35, h * 0.7); c.lineTo(w * 0.65, h * 0.7); c.lineTo(w * 0.65, h); c.stroke();
};

const caveEntrance: Drawer = (c, w, h, rng, p) => {
  const lw = Math.max(0.5, w * 0.035);
  c.beginPath();
  c.moveTo(0, h);
  c.bezierCurveTo(w * 0.05, h * 0.2, w * 0.95, h * 0.1, w, h);
  c.closePath();
  c.fillStyle = linear(c, 0, 0, w, h, [[0, p.rockLight], [1, p.rockDark]]); c.fill(); ink(c, lw, p.ink);
  c.fillStyle = '#100c09';
  c.beginPath(); c.moveTo(w * 0.3, h); c.bezierCurveTo(w * 0.3, h * 0.45, w * 0.7, h * 0.45, w * 0.7, h); c.closePath(); c.fill();
  c.strokeStyle = p.rockDark; c.lineWidth = lw * 0.6;
  for (let i = 0; i < 4; i++) { const x = w * rnd(rng, 0.1, 0.9); line(c, x, h * 0.45, x + 3, h * 0.6); c.stroke(); }
};

const tentCamp: Drawer = (c, w, h, _rng, p) => {
  const lw = Math.max(0.5, w * 0.035);
  const tent = (x: number, s: number, col: string) => {
    poly(c, [[x - s / 2, h], [x, h - s * 0.8], [x + s / 2, h]]);
    c.fillStyle = col; c.fill(); ink(c, lw, p.ink);
    poly(c, [[x - s * 0.1, h], [x, h - s * 0.4], [x + s * 0.1, h]]);
    c.fillStyle = p.ink; c.fill();
  };
  tent(w * 0.3, w * 0.42, p === COLOR ? '#c8b28a' : p.wall);
  tent(w * 0.72, w * 0.36, p === COLOR ? '#8f6a45' : p.rockLight);
  c.fillStyle = '#e07a2a'; ellipse(c, w * 0.52, h * 0.93, w * 0.05, h * 0.06); c.fill();
};

const lighthouse: Drawer = (c, w, h, _rng, p) => {
  const lw = Math.max(0.5, w * 0.06);
  poly(c, [[w * 0.3, h], [w * 0.38, h * 0.25], [w * 0.62, h * 0.25], [w * 0.7, h]]);
  c.fillStyle = p.wall; c.fill(); ink(c, lw, p.ink);
  c.fillStyle = p.roof;
  c.fillRect(w * 0.35, h * 0.5, w * 0.3, h * 0.08);
  c.fillRect(w * 0.32, h * 0.75, w * 0.36, h * 0.08);
  c.fillStyle = '#f2c14e'; c.fillRect(w * 0.38, h * 0.12, w * 0.24, h * 0.13);
  c.strokeRect(w * 0.38, h * 0.12, w * 0.24, h * 0.13);
  poly(c, [[w * 0.34, h * 0.12], [w * 0.5, 0], [w * 0.66, h * 0.12]]);
  c.fillStyle = p.roof; c.fill(); ink(c, lw, p.ink);
};

const bridgeAtlas: Drawer = (c, w, h, _rng, p) => {
  const lw = Math.max(0.5, h * 0.08);
  c.fillStyle = p.wall;
  c.beginPath(); c.moveTo(0, h * 0.35); c.lineTo(w, h * 0.35); c.lineTo(w, h); c.lineTo(w * 0.8, h);
  c.quadraticCurveTo(w * 0.5, h * 0.3, w * 0.2, h); c.lineTo(0, h); c.closePath();
  c.fill(); ink(c, lw, p.ink);
};

// --------------------------------------------------------------------------- markers & decorations

const shieldMarker = (emblem: number): Drawer => (c, w, h, _rng, p) => {
  const lw = Math.max(0.6, w * 0.05);
  c.beginPath();
  c.moveTo(w * 0.1, h * 0.05); c.lineTo(w * 0.9, h * 0.05); c.lineTo(w * 0.9, h * 0.45);
  c.quadraticCurveTo(w * 0.88, h * 0.8, w * 0.5, h * 0.98);
  c.quadraticCurveTo(w * 0.12, h * 0.8, w * 0.1, h * 0.45); c.closePath();
  const col = ['#8a2f2a', '#2f4f7a', '#3d6a36', '#6a4a8a', '#b58a2a'][emblem % 5];
  c.fillStyle = p === COLOR ? col : p.rockLight;
  c.fill();
  c.save(); c.clip();
  c.fillStyle = p === COLOR ? '#e9dfc7' : p.wall;
  if (emblem % 3 === 0) { poly(c, [[0, h * 0.75], [w * 0.5, h * 0.35], [w, h * 0.75], [w, h * 0.95], [w * 0.5, h * 0.55], [0, h * 0.95]]); c.fill(); }
  else if (emblem % 3 === 1) { c.fillRect(w * 0.42, 0, w * 0.16, h); c.fillRect(0, h * 0.32, w, h * 0.14); }
  else { c.beginPath(); c.arc(w / 2, h * 0.42, w * 0.2, 0, Math.PI * 2); c.fill(); }
  c.restore();
  c.beginPath();
  c.moveTo(w * 0.1, h * 0.05); c.lineTo(w * 0.9, h * 0.05); c.lineTo(w * 0.9, h * 0.45);
  c.quadraticCurveTo(w * 0.88, h * 0.8, w * 0.5, h * 0.98);
  c.quadraticCurveTo(w * 0.12, h * 0.8, w * 0.1, h * 0.45); c.closePath();
  ink(c, lw, p.ink);
};

const compass: Drawer = (c, w, h, _rng, p) => {
  const cx = w / 2, cy = h / 2, R = w * 0.48;
  const lw = Math.max(0.6, w * 0.008);
  c.strokeStyle = p.ink; c.lineWidth = lw;
  c.beginPath(); c.arc(cx, cy, R * 0.72, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(cx, cy, R * 0.66, 0, Math.PI * 2); c.stroke();
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    line(c, cx + Math.cos(a) * R * 0.66, cy + Math.sin(a) * R * 0.66, cx + Math.cos(a) * R * (i % 4 ? 0.69 : 0.72), cy + Math.sin(a) * R * (i % 4 ? 0.69 : 0.72));
    c.stroke();
  }
  const star = (len: number, width: number, rot: number, light: string, dark: string) => {
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * Math.PI) / 2 - Math.PI / 2;
      const tip = [cx + Math.cos(a) * len, cy + Math.sin(a) * len];
      const l = [cx + Math.cos(a - Math.PI / 2) * width, cy + Math.sin(a - Math.PI / 2) * width];
      const r = [cx + Math.cos(a + Math.PI / 2) * width, cy + Math.sin(a + Math.PI / 2) * width];
      poly(c, [[cx, cy], l, tip]); c.fillStyle = light; c.fill(); c.stroke();
      poly(c, [[cx, cy], tip, r]); c.fillStyle = dark; c.fill(); c.stroke();
    }
  };
  star(R * 0.62, R * 0.1, Math.PI / 4, p.wall, p.rockDark);
  star(R, R * 0.14, 0, p.wall, p === COLOR ? '#8a2f2a' : p.ink);
  c.fillStyle = p.ink;
  c.font = `bold ${R * 0.22}px Cinzel, Georgia, serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('N', cx, cy - R * 1.08 + R * 0.1);
};

const seaSerpent: Drawer = (c, w, h, rng, p) => {
  const lw = Math.max(0.6, w * 0.02);
  const col = p === COLOR ? '#3f6b5e' : p.rockDark;
  for (let i = 0; i < 3; i++) {
    const x = w * (0.1 + i * 0.28);
    c.beginPath(); c.moveTo(x, h * 0.85); c.bezierCurveTo(x, h * 0.3, x + w * 0.22, h * 0.3, x + w * 0.22, h * 0.85);
    c.lineWidth = h * 0.14 + lw * 2; c.strokeStyle = p.ink; c.stroke();
    c.lineWidth = h * 0.14; c.strokeStyle = col; c.stroke();
  }
  c.fillStyle = col; ellipse(c, w * 0.9, h * 0.4, w * 0.08, h * 0.1); c.fill(); ink(c, lw, p.ink);
  c.fillStyle = p.ink; ellipse(c, w * 0.92, h * 0.37, w * 0.012, h * 0.015); c.fill();
  c.strokeStyle = shade(p.water, 0.3); c.lineWidth = lw;
  for (let i = 0; i < 4; i++) { const x = w * rnd(rng, 0.05, 0.9); line(c, x, h * 0.92, x + w * 0.06, h * 0.92); c.stroke(); }
};

const waves: Drawer = (c, w, h, _rng, p) => {
  c.strokeStyle = p === COLOR ? '#a9c6c9' : p.ink;
  c.lineWidth = Math.max(0.5, h * 0.12);
  for (let r = 0; r < 2; r++) {
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const x = w * (0.08 + i * 0.3) + r * w * 0.15;
      c.moveTo(x, h * (0.45 + r * 0.35));
      c.quadraticCurveTo(x + w * 0.07, h * (0.1 + r * 0.35), x + w * 0.14, h * (0.45 + r * 0.35));
    }
    c.stroke();
  }
};

const swamp: Drawer = (c, w, h, rng, p) => {
  c.strokeStyle = p.ink; c.lineWidth = Math.max(0.4, h * 0.05);
  line(c, w * 0.05, h * 0.92, w * 0.95, h * 0.92); c.stroke();
  reeds(c, w, h * 0.9, rng, p);
};

// --------------------------------------------------------------------------- registration

interface AtlasItem {
  id: string; name: string; sub: string; w: number; h: number; draw: Drawer; tags: string[];
  cat: string; role: AssetDef['role']; collision: AssetDef['collision'];
}

const ITEMS: AtlasItem[] = [];
const add = (cat: string, sub: string, id: string, name: string, w: number, h: number, draw: Drawer, role: AssetDef['role'], collision: AssetDef['collision'], tags: string[] = []) =>
  ITEMS.push({ id, name, sub, w, h, draw, tags, cat, role, collision });

// Trees
add('Nature', 'Conifers', 'spruce-a', 'Spruce A', 14, 26, conifer({ tiers: 4, slim: 0.85 }), 'vegetation', 'tree', ['spruce', 'conifer', 'tree', 'forest']);
add('Nature', 'Conifers', 'spruce-b', 'Spruce B', 13, 24, conifer({ tiers: 3, slim: 0.8, tint: -0.1 }), 'vegetation', 'tree', ['spruce', 'conifer', 'tree', 'forest']);
add('Nature', 'Conifers', 'spruce-c', 'Spruce C', 15, 28, conifer({ tiers: 5, slim: 0.9, tint: 0.05 }), 'vegetation', 'tree', ['spruce', 'conifer', 'tree', 'forest']);
add('Nature', 'Conifers', 'pine-a', 'Pine A', 16, 25, conifer({ tiers: 3, slim: 1, tint: 0.1 }), 'vegetation', 'tree', ['pine', 'conifer', 'tree', 'forest']);
add('Nature', 'Conifers', 'pine-b', 'Pine B', 17, 23, conifer({ tiers: 2, slim: 1.05, tint: 0.02 }), 'vegetation', 'tree', ['pine', 'conifer', 'tree', 'forest']);
add('Nature', 'Conifers', 'spruce-small', 'Small Spruce', 9, 16, conifer({ tiers: 3, slim: 0.85, tint: 0.08 }), 'vegetation', 'tree', ['spruce', 'conifer', 'tree', 'forest', 'small']);
add('Nature', 'Conifers', 'pine-dead', 'Dead Pine', 13, 24, conifer({ tiers: 3, slim: 0.7, dead: true }), 'vegetation', 'tree', ['pine', 'dead', 'tree']);
add('Nature', 'Conifers', 'spruce-snow', 'Snowy Spruce', 14, 26, conifer({ tiers: 4, slim: 0.9, snow: true, tint: -0.05 }), 'vegetation', 'tree', ['spruce', 'snow', 'winter', 'tree']);
add('Nature', 'Deciduous', 'oak-a', 'Oak A', 20, 22, deciduous({}), 'vegetation', 'tree', ['oak', 'deciduous', 'tree', 'forest']);
add('Nature', 'Deciduous', 'oak-b', 'Oak B', 18, 21, deciduous({ tint: -0.12, round: 0.9 }), 'vegetation', 'tree', ['oak', 'deciduous', 'tree', 'forest']);
add('Nature', 'Deciduous', 'birch', 'Birch', 15, 22, deciduous({ tint: 0.18, round: 1.1 }), 'vegetation', 'tree', ['birch', 'deciduous', 'tree']);
add('Nature', 'Deciduous', 'maple-autumn', 'Autumn Maple', 19, 21, deciduous({ autumn: true }), 'vegetation', 'tree', ['maple', 'autumn', 'tree']);
add('Nature', 'Dead Trees', 'dead-tree', 'Dead Tree', 16, 22, deadTree, 'vegetation', 'tree', ['dead', 'tree', 'swamp']);
add('Nature', 'Tropical', 'palm', 'Palm', 18, 24, palm, 'vegetation', 'tree', ['palm', 'desert', 'tropical', 'tree']);
add('Nature', 'Shrubs', 'bush-atlas', 'Bush', 12, 9, bush, 'vegetation', 'prop', ['bush', 'shrub']);
add('Nature', 'Shrubs', 'grass-atlas', 'Grass Tuft', 10, 7, grassTuft, 'details', 'none', ['grass']);
add('Nature', 'Wetland', 'reeds-atlas', 'Reeds', 12, 12, reeds, 'details', 'none', ['reeds', 'shore', 'swamp']);
add('Nature', 'Wetland', 'swamp-atlas', 'Marsh', 20, 12, swamp, 'details', 'none', ['swamp', 'marsh', 'reeds']);
// Mountains
add('Mountains', 'Peaks', 'mtn-peak', 'Individual Peak', 60, 46, range({ peaks: 1 }), 'mountains', 'rock', ['mountain', 'peak']);
add('Mountains', 'Peaks', 'mtn-peak-b', 'Individual Peak B', 52, 42, range({ peaks: 1, jag: 0.08 }), 'mountains', 'rock', ['mountain', 'peak']);
add('Mountains', 'Peaks', 'mtn-snow', 'Snow-capped Peak', 64, 52, range({ peaks: 1, snow: 0.38 }), 'mountains', 'rock', ['mountain', 'snow', 'peak']);
add('Mountains', 'Peaks', 'mtn-jagged', 'Jagged Mountains', 74, 52, range({ peaks: 3, jag: 0.1, snow: 0.2 }), 'mountains', 'rock', ['mountain', 'jagged']);
add('Mountains', 'Peaks', 'mtn-rounded', 'Rounded Mountain', 62, 36, range({ peaks: 1, rounded: true }), 'mountains', 'rock', ['mountain', 'rounded']);
add('Mountains', 'Ridges', 'ridge-small', 'Small Ridge', 90, 40, range({ peaks: 3, low: 0.85 }), 'mountains', 'rock', ['mountain', 'ridge']);
add('Mountains', 'Ridges', 'ridge-large', 'Large Ridge', 160, 64, range({ peaks: 5, snow: 0.25 }), 'mountains', 'rock', ['mountain', 'ridge', 'range']);
add('Mountains', 'Ridges', 'ridge-snow', 'Snowy Ridge', 130, 58, range({ peaks: 4, snow: 0.35, jag: 0.07 }), 'mountains', 'rock', ['mountain', 'ridge', 'snow']);
add('Mountains', 'Hills', 'hills', 'Rolling Hills', 44, 18, hills, 'mountains', 'rock', ['hill']);
add('Mountains', 'Hills', 'hill-rocky', 'Rocky Hill', 40, 24, range({ peaks: 2, low: 0.6, rounded: true }), 'mountains', 'rock', ['hill', 'rocky']);
add('Mountains', 'Cliffs', 'mesa', 'Cliff Formation', 70, 34, mesa, 'mountains', 'rock', ['cliff', 'mesa', 'desert']);
add('Mountains', 'Peaks', 'volcano', 'Volcano', 64, 52, volcano, 'mountains', 'rock', ['volcano', 'mountain']);
// Settlements
add('Settlements', 'Icons', 'icon-village', 'Village', 30, 24, village, 'buildings', 'building', ['village', 'settlement']);
add('Settlements', 'Icons', 'icon-town', 'Town', 40, 34, town, 'buildings', 'building', ['town', 'settlement']);
add('Settlements', 'Icons', 'icon-city', 'City', 60, 44, city, 'buildings', 'building', ['city', 'capital', 'settlement']);
add('Settlements', 'Icons', 'icon-castle', 'Castle', 44, 40, castle, 'buildings', 'building', ['castle', 'fortress', 'keep']);
add('Settlements', 'Icons', 'icon-tower', 'Watchtower', 14, 30, watchtower, 'buildings', 'building', ['tower']);
add('Settlements', 'Icons', 'icon-ruins', 'Ruins', 34, 22, ruins, 'buildings', 'building', ['ruins', 'ancient']);
add('Settlements', 'Icons', 'icon-temple', 'Temple', 34, 26, temple, 'buildings', 'building', ['temple', 'shrine']);
add('Settlements', 'Icons', 'icon-port', 'Port', 44, 30, port, 'buildings', 'building', ['port', 'harbor', 'coastal']);
add('Settlements', 'Icons', 'icon-farm', 'Farmstead', 36, 20, farm, 'buildings', 'building', ['farm']);
add('Settlements', 'Icons', 'icon-mine', 'Mine', 34, 26, mine, 'buildings', 'building', ['mine', 'dwarven']);
add('Settlements', 'Icons', 'icon-cave', 'Cave Entrance', 30, 20, caveEntrance, 'buildings', 'rock', ['cave', 'entrance']);
add('Settlements', 'Icons', 'icon-camp', 'Encampment', 30, 18, tentCamp, 'buildings', 'building', ['camp', 'tent']);
add('Settlements', 'Icons', 'icon-lighthouse', 'Lighthouse', 16, 34, lighthouse, 'buildings', 'building', ['lighthouse', 'coastal']);
add('Settlements', 'Icons', 'icon-bridge', 'Stone Bridge', 30, 12, bridgeAtlas, 'buildings', 'none', ['bridge']);
add('Settlements', 'Icons', 'icon-house', 'Lone House', 14, 14, (c, w, h, rng, p) => house(c, w / 2, h, w * 0.7, p), 'buildings', 'building', ['house']);
// Markers & decoration
for (let i = 0; i < 5; i++) add('Cartography', 'Heraldry', `shield-${i}`, `Heraldic Shield ${i + 1}`, 18, 22, shieldMarker(i), 'labels', 'none', ['shield', 'heraldry', 'banner', 'marker']);
add('Cartography', 'Decoration', 'compass', 'Compass Rose', 140, 140, compass, 'labels', 'none', ['compass', 'rose', 'north']);
add('Cartography', 'Decoration', 'ship', 'Sailing Ship', 34, 30, shipIcon, 'details', 'none', ['ship', 'boat', 'sea']);
add('Cartography', 'Decoration', 'sea-serpent', 'Sea Serpent', 70, 30, seaSerpent, 'details', 'none', ['monster', 'serpent', 'sea']);
add('Cartography', 'Decoration', 'waves', 'Waves', 36, 12, waves, 'details', 'none', ['waves', 'sea', 'water']);

export function registerAtlasAssets() {
  for (const it of ITEMS) {
    for (const variant of ['color', 'ink'] as const) {
      const pal = variant === 'color' ? COLOR : SEPIA;
      registerAsset({
        id: variant === 'color' ? `atlas/${it.id}` : `ink/${it.id}`,
        name: variant === 'color' ? it.name : `${it.name} (Ink)`,
        category: variant === 'color' ? it.cat : 'Ink Atlas',
        subcategory: variant === 'color' ? it.sub : it.cat,
        pack: 'atlas',
        tags: [...it.tags, variant === 'ink' ? 'ink parchment sepia' : 'color'],
        w: it.w, h: it.h, role: it.role, collision: it.collision,
        style: variant === 'ink' ? 'Ink' : undefined,
        draw: (c, w, h, rng) => it.draw(c, w, h, rng, pal),
        footprint: it.cat === 'Mountains' ? 0.5 : 0.6,
      });
    }
  }
}
