import type { Rng } from '../../core/rng';
import { shade } from '../../core/color';
import { registerAsset, type AssetDef } from './registry';
import { poly, blob, radial, linear, ink, rnd, ellipse, line, speckle, roundRect, scallop, type C } from './draw';
import { rockShape, roots, bones } from './nature';

/** Top-down props for settlements, camps, dungeons, caves and interiors. */

const OUT = '#1c1712';
const WOOD = '#8a6a45';
const WOOD_D = '#5a4128';
const IRON = '#4a4a50';
type D = (c: C, w: number, h: number, rng: Rng) => void;

function planks(c: C, x: number, y: number, w: number, h: number, base: string, rng: Rng, vertical = false) {
  const n = Math.max(2, Math.round((vertical ? w : h) / Math.max(6, Math.min(w, h) * 0.18)));
  for (let i = 0; i < n; i++) {
    const col = shade(base, rnd(rng, -0.12, 0.12));
    c.fillStyle = col;
    if (vertical) c.fillRect(x + (w * i) / n, y, w / n + 0.3, h); else c.fillRect(x, y + (h * i) / n, w, h / n + 0.3);
  }
  c.strokeStyle = shade(base, -0.45); c.lineWidth = Math.max(0.5, Math.min(w, h) * 0.02);
  for (let i = 1; i < n; i++) {
    if (vertical) line(c, x + (w * i) / n, y, x + (w * i) / n, y + h); else line(c, x, y + (h * i) / n, x + w, y + (h * i) / n);
    c.stroke();
  }
  c.strokeStyle = OUT; c.lineWidth = Math.max(0.8, Math.min(w, h) * 0.035); c.strokeRect(x, y, w, h);
}

// --------------------------------------------------------------------------- camp

const tent = (cloth: string, round = false, patch = false): D => (c, w, h, rng) => {
  const lw = Math.min(w, h) * 0.025;
  if (round) {
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 * 0.95;
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const lit = Math.cos((a0 + a1) / 2 - Math.PI * 1.25);
      c.beginPath(); c.moveTo(cx, cy);
      c.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
      c.quadraticCurveTo(cx + Math.cos((a0 + a1) / 2) * R * 1.06, cy + Math.sin((a0 + a1) / 2) * R * 1.06, cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
      c.closePath();
      c.fillStyle = shade(cloth, lit * 0.22); c.fill();
      c.strokeStyle = shade(cloth, -0.45); c.lineWidth = lw * 0.6; c.stroke();
    }
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); ink(c, lw, OUT);
    c.fillStyle = '#3a2a1c'; ellipse(c, cx, cy, R * 0.08, R * 0.08); c.fill();
    // entrance flap
    c.fillStyle = '#1f1710';
    poly(c, [[cx - R * 0.18, cy + R * 0.97], [cx, cy + R * 0.6], [cx + R * 0.18, cy + R * 0.97]]); c.fill();
  } else {
    // A-frame ridge tent: ridge along x
    const y0 = h * 0.06, y1 = h * 0.94;
    poly(c, [[w * 0.04, y0], [w * 0.96, y0], [w * 0.96, h / 2], [w * 0.04, h / 2]]);
    c.fillStyle = shade(cloth, 0.15); c.fill();
    poly(c, [[w * 0.04, h / 2], [w * 0.96, h / 2], [w * 0.96, y1], [w * 0.04, y1]]);
    c.fillStyle = shade(cloth, -0.18); c.fill();
    // seams / sag
    c.strokeStyle = shade(cloth, -0.4); c.lineWidth = lw * 0.6;
    for (let i = 1; i < 4; i++) { const x = w * (0.04 + 0.92 * (i / 4)); line(c, x, y0, x, y1); c.stroke(); }
    if (patch) {
      c.fillStyle = shade(cloth, -0.3);
      c.fillRect(w * rnd(rng, 0.2, 0.6), h * 0.18, w * 0.12, h * 0.16);
      c.strokeRect(w * 0.5, h * 0.6, w * 0.1, h * 0.14);
    }
    c.strokeStyle = shade(cloth, -0.55); c.lineWidth = lw * 1.5;
    line(c, w * 0.04, h / 2, w * 0.96, h / 2); c.stroke();
    c.strokeStyle = OUT; c.lineWidth = lw;
    c.strokeRect(w * 0.04, y0, w * 0.92, y1 - y0);
    // guy ropes and pegs
    c.strokeStyle = '#c9b48a'; c.lineWidth = lw * 0.5;
    for (const [x, y, px, py] of [[w * 0.04, y0, 0, 0], [w * 0.96, y0, w, 0], [w * 0.04, y1, 0, h], [w * 0.96, y1, w, h]]) { line(c, x, y, px, py); c.stroke(); }
    // door flap on one end
    c.fillStyle = '#1f1710';
    poly(c, [[w * 0.96, h * 0.34], [w * 0.99, h / 2], [w * 0.96, h * 0.66]]); c.fill();
  }
};

const bedroll = (col: string): D => (c, w, h, rng) => {
  roundRect(c, w * 0.05, h * 0.1, w * 0.9, h * 0.8, h * 0.2);
  c.fillStyle = linear(c, 0, 0, 0, h, [[0, shade(col, 0.2)], [1, shade(col, -0.25)]]); c.fill(); ink(c, h * 0.05, OUT);
  c.fillStyle = shade(col, -0.2);
  roundRect(c, w * 0.05, h * 0.1, w * 0.22, h * 0.8, h * 0.2); c.fill(); ink(c, h * 0.04, OUT);
  c.fillStyle = '#e8dfca';
  roundRect(c, w * 0.08, h * 0.22, w * 0.15, h * 0.56, h * 0.15); c.fill(); ink(c, h * 0.03, OUT);
  c.strokeStyle = shade(col, -0.4); c.lineWidth = h * 0.03;
  for (let i = 0; i < 3; i++) { const x = w * (0.4 + i * 0.18); line(c, x, h * 0.12, x + rnd(rng, -2, 2), h * 0.88); c.stroke(); }
};

const campfire: D = (c, w, h, rng) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
  c.fillStyle = radial(c, cx, cy, R, [[0, 'rgba(40,20,10,0.6)'], [1, 'rgba(40,20,10,0)']]);
  ellipse(c, cx, cy, R, R); c.fill();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    rockShape(c, cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62, R * 0.16, R * 0.13, rng, '#7d786e', false);
  }
  c.fillStyle = '#1e1510'; ellipse(c, cx, cy, R * 0.45, R * 0.45); c.fill();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + 0.3;
    c.strokeStyle = OUT; c.lineWidth = R * 0.15;
    line(c, cx - Math.cos(a) * R * 0.4, cy - Math.sin(a) * R * 0.4, cx + Math.cos(a) * R * 0.4, cy + Math.sin(a) * R * 0.4); c.stroke();
    c.strokeStyle = '#6b4a2c'; c.lineWidth = R * 0.1; c.stroke();
  }
  c.fillStyle = radial(c, cx, cy, R * 0.42, [[0, '#fff3b0'], [0.3, '#ffc14a'], [0.7, '#e2541f'], [1, 'rgba(160,30,10,0)']]);
  blob(c, cx, cy, R * 0.38, R * 0.38, rng, 9, 0.5); c.fill();
  speckle(c, cx, cy, R * 0.3, rng, 10, ['#ffe9a0', '#ff9a3a'], [R * 0.02, R * 0.05], 0.9);
};

const firewood: D = (c, w, h, rng) => {
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < 5 - r; i++) {
      const y = h * (0.75 - r * 0.22), x = w * (0.12 + i * 0.18 + r * 0.09);
      c.fillStyle = shade(WOOD, rnd(rng, -0.1, 0.1));
      roundRect(c, x - w * 0.02, y - h * 0.1, w * 0.2, h * 0.2, h * 0.1); c.fill(); ink(c, h * 0.025, OUT);
      c.fillStyle = '#d4b483'; ellipse(c, x + w * 0.16, y, w * 0.035, h * 0.09); c.fill(); ink(c, h * 0.02, OUT);
    }
  }
};

const pot: D = (c, w, h, rng) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
  c.strokeStyle = '#3a2a1c'; c.lineWidth = R * 0.08;
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 - Math.PI / 2; line(c, cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R); c.stroke(); }
  ellipse(c, cx, cy, R * 0.55, R * 0.55); c.fillStyle = '#2b2b2e'; c.fill(); ink(c, R * 0.06, OUT);
  ellipse(c, cx, cy, R * 0.42, R * 0.42); c.fillStyle = radial(c, cx - R * 0.1, cy - R * 0.1, R * 0.5, [[0, '#a07a3a'], [1, '#5a3a1a']]); c.fill();
  speckle(c, cx, cy, R * 0.35, rng, 8, ['#c9a45a', '#7a8a3a'], [R * 0.03, R * 0.07], 0.9);
};

const barrel: D = (c, w, h, rng) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 * 0.95;
  ellipse(c, cx, cy, R, R); c.fillStyle = radial(c, cx - R * 0.3, cy - R * 0.3, R * 1.4, [[0, '#a8835a'], [1, '#5a3f26']]); c.fill(); ink(c, R * 0.08, OUT);
  c.strokeStyle = IRON; c.lineWidth = R * 0.1;
  ellipse(c, cx, cy, R * 0.82, R * 0.82); c.stroke();
  c.strokeStyle = 'rgba(40,25,15,0.6)'; c.lineWidth = R * 0.04;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI; line(c, cx + Math.cos(a) * R * 0.75, cy + Math.sin(a) * R * 0.75, cx - Math.cos(a) * R * 0.75, cy - Math.sin(a) * R * 0.75); c.stroke(); }
  c.fillStyle = '#3a2a1c'; ellipse(c, cx + R * 0.3, cy, R * 0.08, R * 0.08); c.fill();
};

const crate: D = (c, w, h, rng) => {
  planks(c, 0, 0, w, h, '#9a7a50', rng);
  c.strokeStyle = '#5a4128'; c.lineWidth = Math.min(w, h) * 0.1;
  c.strokeRect(w * 0.07, h * 0.07, w * 0.86, h * 0.86);
  line(c, w * 0.1, h * 0.1, w * 0.9, h * 0.9); c.stroke();
  c.strokeStyle = OUT; c.lineWidth = Math.min(w, h) * 0.04; c.strokeRect(0, 0, w, h);
};

const pack: D = (c, w, h, rng) => {
  const col = ['#6b5a3a', '#5a6b3a', '#7a4a32'][Math.floor(rng() * 3)];
  roundRect(c, w * 0.1, h * 0.05, w * 0.8, h * 0.9, w * 0.25);
  c.fillStyle = linear(c, 0, 0, w, h, [[0, shade(col, 0.2)], [1, shade(col, -0.3)]]); c.fill(); ink(c, w * 0.05, OUT);
  roundRect(c, w * 0.15, h * 0.05, w * 0.7, h * 0.45, w * 0.2);
  c.fillStyle = shade(col, -0.15); c.fill(); ink(c, w * 0.04, OUT);
  c.strokeStyle = '#3a2a1c'; c.lineWidth = w * 0.06;
  line(c, w * 0.35, h * 0.1, w * 0.35, h * 0.9); c.stroke(); line(c, w * 0.65, h * 0.1, w * 0.65, h * 0.9); c.stroke();
  c.fillStyle = '#c9a45a'; c.fillRect(w * 0.44, h * 0.45, w * 0.12, h * 0.08);
};

const sword: D = (c, w, h) => {
  c.fillStyle = linear(c, 0, h * 0.4, 0, h * 0.6, [[0, '#e6e8ec'], [1, '#8a8e96']]);
  poly(c, [[w * 0.28, h * 0.42], [w * 0.95, h * 0.46], [w, h / 2], [w * 0.95, h * 0.54], [w * 0.28, h * 0.58]]); c.fill(); ink(c, h * 0.04, OUT);
  c.fillStyle = '#8a6a2a'; c.fillRect(w * 0.24, h * 0.2, w * 0.05, h * 0.6); c.strokeRect(w * 0.24, h * 0.2, w * 0.05, h * 0.6);
  c.fillStyle = '#4a2f1c'; c.fillRect(w * 0.06, h * 0.44, w * 0.18, h * 0.12); c.strokeRect(w * 0.06, h * 0.44, w * 0.18, h * 0.12);
  c.fillStyle = '#c9a45a'; ellipse(c, w * 0.05, h / 2, h * 0.08, h * 0.08); c.fill();
};

const axe: D = (c, w, h) => {
  c.fillStyle = '#6b4a2c'; c.fillRect(w * 0.05, h * 0.44, w * 0.9, h * 0.12); ink(c, h * 0.03, OUT); c.strokeRect(w * 0.05, h * 0.44, w * 0.9, h * 0.12);
  c.fillStyle = '#9aa0a8';
  c.beginPath(); c.moveTo(w * 0.72, h * 0.44); c.quadraticCurveTo(w * 0.8, h * 0.05, w * 0.95, h * 0.1); c.lineTo(w * 0.88, h * 0.44); c.closePath(); c.fill(); ink(c, h * 0.03, OUT);
};

const weaponRack: D = (c, w, h, rng) => {
  planks(c, 0, h * 0.4, w, h * 0.2, WOOD, rng, true);
  c.save(); c.translate(w * 0.05, h * 0.02); c.rotate(0.15); sword(c, w * 0.8, h * 0.3, rng); c.restore();
  c.save(); c.translate(w * 0.1, h * 0.62); axe(c, w * 0.7, h * 0.3, rng); c.restore();
  c.strokeStyle = '#6b4a2c'; c.lineWidth = h * 0.05; line(c, w * 0.08, h * 0.95, w * 0.95, h * 0.6); c.stroke();
  c.fillStyle = '#b8bcc4'; poly(c, [[w * 0.95, h * 0.6], [w, h * 0.52], [w * 0.9, h * 0.58]]); c.fill();
};

const shield: D = (c, w, h, rng) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 * 0.95;
  const col = ['#7a2a24', '#2a4a7a', '#3a6a3a', '#b08a2a'][Math.floor(rng() * 4)];
  ellipse(c, cx, cy, R, R); c.fillStyle = col; c.fill();
  c.strokeStyle = shade(col, -0.35); c.lineWidth = R * 0.05;
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI; line(c, cx + Math.cos(a) * R, cy + Math.sin(a) * R, cx - Math.cos(a) * R, cy - Math.sin(a) * R); c.stroke(); }
  c.strokeStyle = IRON; c.lineWidth = R * 0.12; ellipse(c, cx, cy, R * 0.93, R * 0.93); c.stroke();
  c.fillStyle = radial(c, cx - R * 0.08, cy - R * 0.08, R * 0.3, [[0, '#d0d4da'], [1, '#5a5e66']]); ellipse(c, cx, cy, R * 0.22, R * 0.22); c.fill();
  ellipse(c, cx, cy, R, R); ink(c, R * 0.06, OUT);
};

const table = (round = false, items = true): D => (c, w, h, rng) => {
  if (round) { ellipse(c, w / 2, h / 2, w * 0.47, h * 0.47); c.fillStyle = radial(c, w * 0.4, h * 0.4, w * 0.6, [[0, '#a8835a'], [1, '#6b4a2c']]); c.fill(); ink(c, w * 0.03, OUT); }
  else planks(c, w * 0.02, h * 0.04, w * 0.96, h * 0.92, '#9a7a50', rng, w < h);
  if (items) {
    for (let i = 0; i < 3; i++) {
      const x = w * rnd(rng, 0.25, 0.75), y = h * rnd(rng, 0.25, 0.75), r = Math.min(w, h) * 0.1;
      c.fillStyle = ['#d8d0c0', '#8a5a2a', '#a0a4ac'][i]; ellipse(c, x, y, r, r); c.fill(); ink(c, r * 0.15, OUT);
    }
  }
};

const bench: D = (c, w, h, rng) => planks(c, 0, h * 0.1, w, h * 0.8, '#8a6a45', rng, true);

const hide: D = (c, w, h, rng) => {
  const pts: number[][] = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const leg = i % 3.5 < 1 ? 1.2 : 0.85;
    pts.push([w / 2 + Math.cos(a) * w * 0.45 * leg * rnd(rng, 0.9, 1.05), h / 2 + Math.sin(a) * h * 0.45 * leg * rnd(rng, 0.9, 1.05)]);
  }
  poly(c, pts);
  c.fillStyle = radial(c, w / 2, h / 2, w * 0.5, [[0, '#b08a5a'], [1, '#6a4a2a']]); c.fill(); ink(c, w * 0.02, OUT);
  speckle(c, w / 2, h / 2, w * 0.3, rng, 30, ['#5a3a1a', '#d0b080'], [w * 0.005, w * 0.015], 0.4);
};

const rope: D = (c, w, h) => {
  const cx = w / 2, cy = h / 2;
  c.lineCap = 'round';
  for (const [col, lw] of [[OUT, Math.min(w, h) * 0.13], ['#c9a86a', Math.min(w, h) * 0.09]] as const) {
    c.strokeStyle = col; c.lineWidth = lw;
    c.beginPath();
    for (let t = 0; t < Math.PI * 7; t += 0.1) {
      const r = Math.min(w, h) * 0.08 + t * Math.min(w, h) * 0.018;
      const x = cx + Math.cos(t) * r, y = cy + Math.sin(t) * r;
      t === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
  }
};

const lantern: D = (c, w, h) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
  c.fillStyle = radial(c, cx, cy, R, [[0, 'rgba(255,220,130,0.8)'], [1, 'rgba(255,190,90,0)']]); ellipse(c, cx, cy, R, R); c.fill();
  c.fillStyle = '#2f2f33'; c.fillRect(cx - R * 0.35, cy - R * 0.35, R * 0.7, R * 0.7);
  c.fillStyle = '#ffd97a'; c.fillRect(cx - R * 0.22, cy - R * 0.22, R * 0.44, R * 0.44);
  c.strokeStyle = OUT; c.lineWidth = R * 0.06; c.strokeRect(cx - R * 0.35, cy - R * 0.35, R * 0.7, R * 0.7);
  line(c, cx - R * 0.35, cy, cx + R * 0.35, cy); c.stroke(); line(c, cx, cy - R * 0.35, cx, cy + R * 0.35); c.stroke();
};

const food: D = (c, w, h, rng) => {
  ellipse(c, w / 2, h / 2, w * 0.46, h * 0.46); c.fillStyle = '#a07a42'; c.fill(); ink(c, w * 0.04, OUT);
  c.strokeStyle = '#7a5a2a'; c.lineWidth = w * 0.02;
  for (let r = 0.2; r < 0.46; r += 0.07) { ellipse(c, w / 2, h / 2, w * r, h * r); c.stroke(); }
  const cols = ['#c0392b', '#d4a24a', '#6a8a2a', '#e0c070'];
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2, d = rng() * w * 0.25;
    c.fillStyle = cols[i % cols.length]; ellipse(c, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, w * 0.09, w * 0.09); c.fill(); ink(c, w * 0.015, OUT);
  }
};

const waterskin: D = (c, w, h) => {
  ellipse(c, w / 2, h * 0.55, w * 0.38, h * 0.4); c.fillStyle = linear(c, 0, 0, w, h, [[0, '#9a7448'], [1, '#5a3e22']]); c.fill(); ink(c, w * 0.05, OUT);
  c.fillStyle = '#3a2a1c'; c.fillRect(w * 0.42, h * 0.05, w * 0.16, h * 0.18);
};

const bucket: D = (c, w, h) => {
  const R = Math.min(w, h) / 2;
  ellipse(c, w / 2, h / 2, R * 0.9, R * 0.9); c.fillStyle = WOOD; c.fill(); ink(c, R * 0.1, OUT);
  ellipse(c, w / 2, h / 2, R * 0.7, R * 0.7); c.fillStyle = '#3f6f7c'; c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = R * 0.06; c.beginPath(); c.arc(w / 2 - R * 0.1, h / 2 - R * 0.1, R * 0.4, Math.PI, Math.PI * 1.5); c.stroke();
};

const leanTo: D = (c, w, h, rng) => {
  c.fillStyle = '#3a2a1c'; c.fillRect(w * 0.04, h * 0.1, w * 0.92, h * 0.12);
  for (let i = 0; i < 9; i++) {
    const x = w * (0.06 + i * 0.1);
    c.strokeStyle = OUT; c.lineWidth = w * 0.06; line(c, x, h * 0.1, x + rnd(rng, -3, 3), h * 0.92); c.stroke();
    c.strokeStyle = shade('#6b5033', rnd(rng, -0.1, 0.15)); c.lineWidth = w * 0.045; c.stroke();
  }
  c.save(); c.globalAlpha = 0.85;
  for (let i = 0; i < 12; i++) { scallop(c, w * rnd(rng, 0.1, 0.9), h * rnd(rng, 0.2, 0.8), w * 0.1, h * 0.08, rng, 6, 0.4); c.fillStyle = shade('#3f6a31', rnd(rng, -0.2, 0.2)); c.fill(); }
  c.restore();
};

// --------------------------------------------------------------------------- village

const well: D = (c, w, h, rng) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 * 0.92;
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    c.beginPath(); c.arc(cx, cy, R, a0, a1); c.arc(cx, cy, R * 0.68, a1, a0, true); c.closePath();
    c.fillStyle = shade('#8f8a80', rnd(rng, -0.12, 0.12)); c.fill(); ink(c, R * 0.04, OUT);
  }
  ellipse(c, cx, cy, R * 0.68, R * 0.68); c.fillStyle = radial(c, cx, cy, R * 0.68, [[0, '#0e1a1f'], [1, '#2e4d57']]); c.fill();
  c.fillStyle = WOOD_D; c.fillRect(cx - R * 1.05, cy - R * 0.08, R * 2.1, R * 0.16); ink(c, R * 0.03, OUT); c.strokeRect(cx - R * 1.05, cy - R * 0.08, R * 2.1, R * 0.16);
  c.fillStyle = WOOD; ellipse(c, cx, cy, R * 0.18, R * 0.18); c.fill(); ink(c, R * 0.04, OUT);
};

const dock: D = (c, w, h, rng) => {
  planks(c, 0, h * 0.1, w, h * 0.8, '#8f704a', rng, true);
  c.fillStyle = WOOD_D;
  for (let x = w * 0.05; x < w; x += w * 0.18) for (const y of [h * 0.08, h * 0.92]) { ellipse(c, x, y, h * 0.08, h * 0.08); c.fill(); ink(c, h * 0.02, OUT); }
};

const bridge: D = (c, w, h, rng) => {
  planks(c, 0, h * 0.15, w, h * 0.7, '#8f704a', rng, true);
  for (const y of [h * 0.1, h * 0.9]) {
    c.fillStyle = WOOD_D; c.fillRect(0, y - h * 0.05, w, h * 0.1); c.strokeStyle = OUT; c.lineWidth = h * 0.02; c.strokeRect(0, y - h * 0.05, w, h * 0.1);
    for (let x = w * 0.04; x < w; x += w * 0.16) { c.fillStyle = '#3a2a1c'; c.fillRect(x - h * 0.05, y - h * 0.07, h * 0.1, h * 0.14); }
  }
};

const stoneBridge: D = (c, w, h, rng) => {
  c.fillStyle = '#8a857b'; c.fillRect(0, h * 0.12, w, h * 0.76);
  c.save(); c.beginPath(); c.rect(0, h * 0.12, w, h * 0.76); c.clip();
  c.strokeStyle = '#5a564f'; c.lineWidth = h * 0.015;
  for (let y = h * 0.12; y < h * 0.9; y += h * 0.12) { line(c, 0, y, w, y); c.stroke(); for (let x = (y / h * 97) % 20; x < w; x += w * 0.08) { line(c, x, y, x, y + h * 0.12); c.stroke(); } }
  c.restore();
  for (const y of [h * 0.1, h * 0.9]) { c.fillStyle = '#6f6a62'; c.fillRect(0, y - h * 0.06, w, h * 0.12); c.strokeStyle = OUT; c.lineWidth = h * 0.02; c.strokeRect(0, y - h * 0.06, w, h * 0.12); }
};

const stall = (col: string): D => (c, w, h, rng) => {
  table(false, false)(c, w, h * 0.5, rng);
  for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#efe6d2' : col; c.fillRect((w * i) / 6, h * 0.35, w / 6 + 0.5, h * 0.65); }
  c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(0, h * 0.35, w, h * 0.3);
  c.strokeStyle = OUT; c.lineWidth = Math.min(w, h) * 0.025; c.strokeRect(0, h * 0.35, w, h * 0.65);
  speckle(c, w / 2, h * 0.18, w * 0.35, rng, 14, ['#c0392b', '#e0b040', '#7a9a3a'], [w * 0.02, w * 0.04], 1);
};

const cart: D = (c, w, h, rng) => {
  c.fillStyle = '#2a2a2a';
  for (const x of [w * 0.3, w * 0.62]) for (const y of [h * 0.08, h * 0.92]) { c.fillRect(x - w * 0.07, y - h * 0.06, w * 0.14, h * 0.12); }
  planks(c, w * 0.15, h * 0.12, w * 0.62, h * 0.76, '#8f704a', rng, true);
  c.strokeStyle = '#5a4128'; c.lineWidth = h * 0.06;
  line(c, w * 0.77, h * 0.35, w, h * 0.42); c.stroke(); line(c, w * 0.77, h * 0.65, w, h * 0.58); c.stroke();
  for (let i = 0; i < 3; i++) { c.fillStyle = '#c9a86a'; ellipse(c, w * (0.3 + i * 0.15), h * 0.5, w * 0.08, h * 0.2); c.fill(); ink(c, h * 0.02, OUT); }
};

const boat: D = (c, w, h, rng) => {
  c.beginPath(); c.moveTo(0, h / 2); c.quadraticCurveTo(w * 0.25, 0, w * 0.85, h * 0.06); c.quadraticCurveTo(w, h / 2, w * 0.85, h * 0.94); c.quadraticCurveTo(w * 0.25, h, 0, h / 2); c.closePath();
  c.fillStyle = '#6b4a2c'; c.fill(); ink(c, h * 0.05, OUT);
  c.save(); c.clip();
  planks(c, w * 0.06, h * 0.18, w * 0.84, h * 0.64, '#9a7a50', rng);
  c.restore();
  for (const x of [w * 0.35, w * 0.62]) { c.fillStyle = WOOD_D; c.fillRect(x, h * 0.12, w * 0.06, h * 0.76); }
  c.strokeStyle = '#3a2a1c'; c.lineWidth = h * 0.05; line(c, w * 0.3, h * 0.3, w * 0.1, h * 1.05); c.stroke();
};

const windmill: D = (c, w, h, rng) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
  ellipse(c, cx, cy, R * 0.45, R * 0.45); c.fillStyle = '#a14e34'; c.fill(); ink(c, R * 0.03, OUT);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; c.strokeStyle = '#6a2e1e'; c.lineWidth = R * 0.015; line(c, cx, cy, cx + Math.cos(a) * R * 0.45, cy + Math.sin(a) * R * 0.45); c.stroke(); }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    c.save(); c.translate(cx, cy); c.rotate(a);
    c.fillStyle = '#e8dfca'; c.fillRect(R * 0.1, -R * 0.08, R * 0.88, R * 0.16);
    c.strokeStyle = '#5a4128'; c.lineWidth = R * 0.02;
    for (let x = R * 0.1; x < R * 0.98; x += R * 0.11) { line(c, x, -R * 0.08, x, R * 0.08); c.stroke(); }
    c.strokeStyle = OUT; c.lineWidth = R * 0.025; c.strokeRect(R * 0.1, -R * 0.08, R * 0.88, R * 0.16);
    c.restore();
  }
  c.fillStyle = '#3a2a1c'; ellipse(c, cx, cy, R * 0.08, R * 0.08); c.fill();
};

const watermill: D = (c, w, h, rng) => {
  const st = { roof: '#7d5d3c' };
  c.fillStyle = shade(st.roof, 0.1); c.fillRect(0, 0, w * 0.75, h / 2);
  c.fillStyle = shade(st.roof, -0.2); c.fillRect(0, h / 2, w * 0.75, h / 2);
  c.strokeStyle = shade(st.roof, -0.45); c.lineWidth = Math.min(w, h) * 0.012;
  for (let y = h * 0.08; y < h; y += h * 0.08) { line(c, 0, y, w * 0.75, y); c.stroke(); }
  c.strokeStyle = OUT; c.lineWidth = Math.min(w, h) * 0.025; c.strokeRect(0, 0, w * 0.75, h); line(c, 0, h / 2, w * 0.75, h / 2); c.stroke();
  // wheel seen from above: a narrow disc with paddles
  c.fillStyle = WOOD_D; c.fillRect(w * 0.8, h * 0.12, w * 0.12, h * 0.76);
  c.strokeStyle = '#3a2a1c'; c.lineWidth = Math.min(w, h) * 0.02;
  for (let y = h * 0.14; y < h * 0.88; y += h * 0.06) { line(c, w * 0.78, y, w * 0.94, y); c.stroke(); }
  c.strokeStyle = OUT; c.strokeRect(w * 0.8, h * 0.12, w * 0.12, h * 0.76);
  c.fillStyle = '#5a4128'; c.fillRect(w * 0.75, h * 0.47, w * 0.05, h * 0.06);
};

const farmPlot = (crop: string): D => (c, w, h, rng) => {
  c.fillStyle = '#6d5434'; c.fillRect(0, 0, w, h);
  const rows = Math.round(h / 22);
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * (h / rows);
    c.strokeStyle = 'rgba(40,28,16,0.6)'; c.lineWidth = h / rows * 0.3; line(c, 0, y + h / rows * 0.3, w, y + h / rows * 0.3); c.stroke();
    for (let x = 6; x < w - 4; x += 12) { c.fillStyle = shade(crop, rnd(rng, -0.2, 0.15)); ellipse(c, x + rnd(rng, -2, 2), y, 5, 4); c.fill(); }
  }
  c.strokeStyle = '#3a2a1c'; c.lineWidth = 2; c.strokeRect(0, 0, w, h);
};

const fence: D = (c, w, h) => {
  c.strokeStyle = OUT; c.lineWidth = h * 0.35; line(c, 0, h / 2, w, h / 2); c.stroke();
  c.strokeStyle = '#8a6a45'; c.lineWidth = h * 0.22; c.stroke();
  for (let x = h * 0.4; x < w; x += w / 4) { c.fillStyle = '#5a4128'; c.fillRect(x - h * 0.3, h * 0.2, h * 0.6, h * 0.6); c.strokeStyle = OUT; c.lineWidth = h * 0.08; c.strokeRect(x - h * 0.3, h * 0.2, h * 0.6, h * 0.6); }
};

const stoneWall: D = (c, w, h, rng) => {
  c.fillStyle = '#2a2622'; c.fillRect(0, 0, w, h);
  let x = 0;
  while (x < w) {
    const bw = h * rnd(rng, 0.8, 1.4);
    rockShape(c, x + bw / 2, h / 2, bw * 0.52, h * 0.46, rng, '#8a857b', false);
    x += bw * 0.9;
  }
};

const gate: D = (c, w, h, rng) => {
  for (const x of [0, w * 0.8]) { c.fillStyle = '#8a857b'; c.fillRect(x, 0, w * 0.2, h); c.strokeStyle = OUT; c.lineWidth = h * 0.04; c.strokeRect(x, 0, w * 0.2, h); }
  planks(c, w * 0.2, h * 0.3, w * 0.3, h * 0.4, '#7a5a3a', rng, true);
  planks(c, w * 0.5, h * 0.3, w * 0.3, h * 0.4, '#7a5a3a', rng, true);
  c.fillStyle = IRON; c.fillRect(w * 0.2, h * 0.36, w * 0.6, h * 0.05); c.fillRect(w * 0.2, h * 0.6, w * 0.6, h * 0.05);
};

const woodpile: D = (c, w, h, rng) => {
  for (let i = 0; i < 18; i++) {
    const x = w * rnd(rng, 0.12, 0.88), y = h * rnd(rng, 0.15, 0.85);
    c.fillStyle = '#d4b483'; ellipse(c, x, y, Math.min(w, h) * 0.1, Math.min(w, h) * 0.1); c.fill(); ink(c, Math.min(w, h) * 0.02, OUT);
    c.strokeStyle = '#9a7a4a'; c.lineWidth = Math.min(w, h) * 0.01; ellipse(c, x, y, Math.min(w, h) * 0.05, Math.min(w, h) * 0.05); c.stroke();
  }
};

const garden: D = (c, w, h, rng) => {
  c.fillStyle = '#5b4630'; c.fillRect(0, 0, w, h);
  const cols = ['#5f8a36', '#7aa040', '#c0392b', '#e0b040', '#6a8a2a'];
  for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) {
    const x = (i + 0.5) * (w / 6), y = (r + 0.5) * (h / 4);
    bushTiny(c, x, y, Math.min(w / 6, h / 4) * 0.4, cols[(r * 2 + i) % cols.length], rng);
  }
  c.strokeStyle = '#8a6a45'; c.lineWidth = Math.min(w, h) * 0.04; c.strokeRect(0, 0, w, h);
};

function bushTiny(c: C, x: number, y: number, r: number, col: string, rng: Rng) {
  scallop(c, x, y, r, r, rng, 6, 0.4); c.fillStyle = col; c.fill(); c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = r * 0.12; c.stroke();
}

const pen: D = (c, w, h, rng) => {
  c.fillStyle = '#7a6040'; c.fillRect(w * 0.03, h * 0.03, w * 0.94, h * 0.94);
  speckle(c, w / 2, h / 2, Math.min(w, h) * 0.45, rng, 80, ['#5a4630', '#8a7050', '#6a7a3a'], [2, 5], 0.6);
  // animals
  for (let i = 0; i < 4; i++) {
    const x = w * rnd(rng, 0.25, 0.75), y = h * rnd(rng, 0.25, 0.75), a = rng() * Math.PI * 2;
    c.save(); c.translate(x, y); c.rotate(a);
    const col = ['#f0ece2', '#e8b0a0', '#6b4a2c', '#2a2a2a'][i % 4];
    ellipse(c, 0, 0, w * 0.08, h * 0.05); c.fillStyle = col; c.fill(); ink(c, 1.5, OUT);
    ellipse(c, w * 0.08, 0, w * 0.03, h * 0.03); c.fill(); ink(c, 1.5, OUT);
    c.restore();
  }
  c.strokeStyle = OUT; c.lineWidth = 7; c.strokeRect(w * 0.03, h * 0.03, w * 0.94, h * 0.94);
  c.strokeStyle = '#8a6a45'; c.lineWidth = 4; c.strokeRect(w * 0.03, h * 0.03, w * 0.94, h * 0.94);
  c.fillStyle = '#7a6040'; c.fillRect(w * 0.4, h * 0.9, w * 0.2, h * 0.1);
};

const hay: D = (c, w, h, rng) => {
  ellipse(c, w / 2, h / 2, w * 0.46, h * 0.46); c.fillStyle = radial(c, w * 0.4, h * 0.4, w * 0.6, [[0, '#e8cf7a'], [1, '#a88a3a']]); c.fill(); ink(c, w * 0.03, OUT);
  c.strokeStyle = 'rgba(120,90,30,0.7)'; c.lineWidth = w * 0.015;
  for (let r = 0.1; r < 0.45; r += 0.07) { ellipse(c, w / 2, h / 2, w * r, h * r); c.stroke(); }
};

const trough: D = (c, w, h, rng) => {
  planks(c, 0, 0, w, h, '#7a5a3a', rng);
  c.fillStyle = '#3f6f7c'; c.fillRect(w * 0.08, h * 0.2, w * 0.84, h * 0.6);
};

const signpost: D = (c, w, h) => {
  c.fillStyle = '#5a4128'; ellipse(c, w / 2, h / 2, w * 0.12, w * 0.12); c.fill(); ink(c, w * 0.03, OUT);
  c.fillStyle = '#9a7a50';
  c.save(); c.translate(w / 2, h / 2); c.rotate(-0.4);
  poly(c, [[0, -h * 0.08], [w * 0.4, -h * 0.08], [w * 0.48, 0], [w * 0.4, h * 0.08], [0, h * 0.08]]); c.fill(); ink(c, w * 0.02, OUT);
  c.rotate(2.4);
  poly(c, [[0, -h * 0.08], [w * 0.36, -h * 0.08], [w * 0.44, 0], [w * 0.36, h * 0.08], [0, h * 0.08]]); c.fill(); ink(c, w * 0.02, OUT);
  c.restore();
};

const gravestone: D = (c, w, h, rng) => {
  roundRect(c, w * 0.15, h * 0.1, w * 0.7, h * 0.35, w * 0.3);
  c.fillStyle = '#8a867e'; c.fill(); ink(c, w * 0.04, OUT);
  c.fillStyle = 'rgba(80,70,40,0.35)'; c.fillRect(w * 0.25, h * 0.5, w * 0.5, h * 0.42);
  c.strokeStyle = 'rgba(60,50,30,0.4)'; c.lineWidth = w * 0.02; c.strokeRect(w * 0.25, h * 0.5, w * 0.5, h * 0.42);
};

// --------------------------------------------------------------------------- dungeon

const wallBlock: D = (c, w, h, rng) => {
  c.fillStyle = '#2a2826'; c.fillRect(0, 0, w, h);
  const rows = Math.max(1, Math.round(h / 22));
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -w * 0.08 : 0;
    const y = (r * h) / rows;
    while (x < w) {
      const bw = rnd(rng, 26, 40);
      c.fillStyle = shade('#6f6b64', rnd(rng, -0.12, 0.1));
      c.fillRect(x + 1, y + 1, bw - 2, h / rows - 2);
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x + 1, y + 1, bw - 2, 2);
      x += bw;
    }
  }
  c.strokeStyle = OUT; c.lineWidth = 2.5; c.strokeRect(0, 0, w, h);
};

const door: D = (c, w, h, rng) => {
  c.fillStyle = '#5c5750'; c.fillRect(0, 0, w * 0.12, h); c.fillRect(w * 0.88, 0, w * 0.12, h);
  c.strokeStyle = OUT; c.lineWidth = 2; c.strokeRect(0, 0, w * 0.12, h); c.strokeRect(w * 0.88, 0, w * 0.12, h);
  planks(c, w * 0.12, h * 0.2, w * 0.76, h * 0.6, '#7a5634', rng, true);
  c.fillStyle = IRON; c.fillRect(w * 0.12, h * 0.28, w * 0.76, h * 0.06); c.fillRect(w * 0.12, h * 0.66, w * 0.76, h * 0.06);
  c.fillStyle = '#c9a45a'; ellipse(c, w * 0.78, h / 2, h * 0.06, h * 0.06); c.fill();
};

const portcullis: D = (c, w, h) => {
  c.fillStyle = '#5c5750'; c.fillRect(0, 0, w * 0.12, h); c.fillRect(w * 0.88, 0, w * 0.12, h);
  c.strokeStyle = OUT; c.lineWidth = 2; c.strokeRect(0, 0, w * 0.12, h); c.strokeRect(w * 0.88, 0, w * 0.12, h);
  c.strokeStyle = '#1a1a1c'; c.lineWidth = h * 0.16; line(c, w * 0.12, h / 2, w * 0.88, h / 2); c.stroke();
  c.strokeStyle = '#6a6a72'; c.lineWidth = h * 0.1;
  for (let x = w * 0.18; x < w * 0.86; x += w * 0.08) { line(c, x, h * 0.35, x, h * 0.65); c.stroke(); }
  line(c, w * 0.12, h / 2, w * 0.88, h / 2); c.stroke();
};

const pillar = (round = true): D => (c, w, h, rng) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 * 0.92;
  if (round) {
    ellipse(c, cx, cy, R, R); c.fillStyle = '#6f6b64'; c.fill(); ink(c, R * 0.06, OUT);
    ellipse(c, cx, cy, R * 0.78, R * 0.78); c.fillStyle = radial(c, cx - R * 0.3, cy - R * 0.3, R * 1.2, [[0, '#b5afa4'], [1, '#6a655d']]); c.fill(); ink(c, R * 0.04, OUT);
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = R * 0.03;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; line(c, cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3, cx + Math.cos(a) * R * 0.75, cy + Math.sin(a) * R * 0.75); c.stroke(); }
  } else {
    c.fillStyle = '#6f6b64'; c.fillRect(cx - R, cy - R, R * 2, R * 2); c.strokeStyle = OUT; c.lineWidth = R * 0.06; c.strokeRect(cx - R, cy - R, R * 2, R * 2);
    c.fillStyle = linear(c, cx - R, cy - R, cx + R, cy + R, [[0, '#b5afa4'], [1, '#6a655d']]); c.fillRect(cx - R * 0.75, cy - R * 0.75, R * 1.5, R * 1.5);
    c.strokeRect(cx - R * 0.75, cy - R * 0.75, R * 1.5, R * 1.5);
  }
};

const stairs: D = (c, w, h) => {
  const n = 8;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    c.fillStyle = shade('#8a857b', 0.15 - t * 0.55);
    c.fillRect(0, (h * i) / n, w, h / n + 0.5);
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1.5; line(c, 0, (h * i) / n, w, (h * i) / n); c.stroke();
  }
  c.strokeStyle = OUT; c.lineWidth = 3; c.strokeRect(0, 0, w, h);
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 0, w * 0.06, h); c.fillRect(w * 0.94, 0, w * 0.06, h);
};

const rubble: D = (c, w, h, rng) => {
  const items = Array.from({ length: 14 }, () => ({ x: w * rnd(rng, 0.12, 0.88), y: h * rnd(rng, 0.12, 0.88), r: Math.min(w, h) * rnd(rng, 0.05, 0.14) }));
  items.sort((a, b) => a.y - b.y);
  for (const it of items) rockShape(c, it.x, it.y, it.r * 1.2, it.r, rng, '#817c73', false);
};

const brokenMasonry: D = (c, w, h, rng) => {
  for (let i = 0; i < 6; i++) {
    const x = w * rnd(rng, 0.1, 0.75), y = h * rnd(rng, 0.1, 0.75), bw = w * rnd(rng, 0.15, 0.3), bh = h * rnd(rng, 0.1, 0.2);
    c.save(); c.translate(x + bw / 2, y + bh / 2); c.rotate(rnd(rng, -0.6, 0.6));
    c.fillStyle = shade('#7d786f', rnd(rng, -0.1, 0.1)); c.fillRect(-bw / 2, -bh / 2, bw, bh);
    c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(-bw / 2, -bh / 2, bw, bh * 0.2);
    c.strokeStyle = OUT; c.lineWidth = 1.5; c.strokeRect(-bw / 2, -bh / 2, bw, bh);
    c.restore();
  }
  rubble(c, w, h, rng);
};

const statue: D = (c, w, h, rng) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
  c.fillStyle = '#6f6b64'; c.fillRect(cx - R * 0.9, cy - R * 0.9, R * 1.8, R * 1.8); c.strokeStyle = OUT; c.lineWidth = R * 0.04; c.strokeRect(cx - R * 0.9, cy - R * 0.9, R * 1.8, R * 1.8);
  const stone = (x: number, y: number, rx: number, ry: number) => { ellipse(c, x, y, rx, ry); c.fillStyle = radial(c, x - rx * 0.3, y - ry * 0.3, Math.max(rx, ry) * 1.4, [[0, '#d4cec2'], [1, '#8a847a']]); c.fill(); ink(c, R * 0.03, OUT); };
  stone(cx, cy + R * 0.1, R * 0.55, R * 0.35); // shoulders
  stone(cx - R * 0.55, cy + R * 0.05, R * 0.14, R * 0.3); stone(cx + R * 0.55, cy - R * 0.2, R * 0.14, R * 0.34);
  stone(cx, cy - R * 0.05, R * 0.24, R * 0.24); // head
  c.strokeStyle = '#8a847a'; c.lineWidth = R * 0.08; line(c, cx + R * 0.55, cy - R * 0.5, cx + R * 0.55, cy - R * 0.85); c.stroke();
};

const altar: D = (c, w, h, rng) => {
  c.fillStyle = '#7d786f'; c.fillRect(0, 0, w, h); c.strokeStyle = OUT; c.lineWidth = 2.5; c.strokeRect(0, 0, w, h);
  c.fillStyle = linear(c, 0, 0, w, h, [[0, '#c4bdb0'], [1, '#8a847a']]); c.fillRect(w * 0.06, h * 0.12, w * 0.88, h * 0.76);
  c.fillStyle = '#6a1f24'; c.fillRect(w * 0.35, h * 0.12, w * 0.3, h * 0.76);
  for (const x of [w * 0.12, w * 0.88]) {
    c.fillStyle = radial(c, x, h / 2, h * 0.3, [[0, 'rgba(255,220,120,0.9)'], [1, 'rgba(255,200,100,0)']]); ellipse(c, x, h / 2, h * 0.3, h * 0.3); c.fill();
    c.fillStyle = '#efe6cf'; ellipse(c, x, h / 2, h * 0.07, h * 0.07); c.fill();
  }
  c.fillStyle = '#c9a45a'; ellipse(c, w / 2, h / 2, h * 0.12, h * 0.12); c.fill(); ink(c, 1.5, OUT);
};

const sarcophagus: D = (c, w, h, rng) => {
  roundRect(c, 0, 0, w, h, h * 0.2); c.fillStyle = '#6f6a62'; c.fill(); ink(c, 3, OUT);
  roundRect(c, w * 0.05, h * 0.1, w * 0.9, h * 0.8, h * 0.18);
  c.fillStyle = linear(c, 0, 0, w, h, [[0, '#bdb6a8'], [1, '#7d776d']]); c.fill(); ink(c, 1.5, OUT);
  c.fillStyle = 'rgba(0,0,0,0.18)';
  ellipse(c, w * 0.2, h / 2, h * 0.2, h * 0.2); c.fill();
  roundRect(c, w * 0.32, h * 0.25, w * 0.55, h * 0.5, h * 0.2); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 2; line(c, w * 0.55, h * 0.3, w * 0.55, h * 0.7); c.stroke();
};

const chains: D = (c, w, h) => {
  c.lineWidth = Math.min(w, h) * 0.05;
  for (let i = 0; i < 10; i++) {
    const x = w * (0.08 + i * 0.09), y = h / 2 + Math.sin(i * 0.9) * h * 0.2;
    c.strokeStyle = OUT; ellipse(c, x, y, w * 0.06, h * 0.08, i % 2 ? 0 : Math.PI / 2); c.stroke();
    c.strokeStyle = '#8a8e96'; c.lineWidth = Math.min(w, h) * 0.03; c.stroke(); c.lineWidth = Math.min(w, h) * 0.05;
  }
};

const torch: D = (c, w, h) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
  c.fillStyle = radial(c, cx, cy, R, [[0, 'rgba(255,200,90,0.85)'], [0.4, 'rgba(255,140,40,0.35)'], [1, 'rgba(255,120,30,0)']]); ellipse(c, cx, cy, R, R); c.fill();
  c.fillStyle = '#3a3a3e'; c.fillRect(cx - R * 0.15, cy - R * 0.15, R * 0.3, R * 0.3);
  c.fillStyle = radial(c, cx, cy, R * 0.2, [[0, '#fff5c0'], [0.5, '#ffb030'], [1, '#e04a1a']]); ellipse(c, cx, cy, R * 0.16, R * 0.16); c.fill();
};

const chest = (open = false): D => (c, w, h, rng) => {
  planks(c, 0, 0, w, h, '#8a5e36', rng);
  c.fillStyle = '#6a6a72';
  for (const x of [w * 0.12, w * 0.82]) c.fillRect(x, 0, w * 0.06, h);
  c.strokeStyle = OUT; c.lineWidth = 1.5;
  for (const x of [w * 0.12, w * 0.82]) c.strokeRect(x, 0, w * 0.06, h);
  if (open) {
    c.fillStyle = '#2a1a10'; c.fillRect(w * 0.2, h * 0.15, w * 0.6, h * 0.7);
    speckle(c, w / 2, h / 2, Math.min(w, h) * 0.3, rng, 25, ['#f2c94c', '#e0a82c', '#fff0a0'], [w * 0.02, w * 0.04], 1);
  } else {
    c.fillStyle = '#c9a45a'; c.fillRect(w * 0.45, h * 0.85, w * 0.1, h * 0.15); c.strokeRect(w * 0.45, h * 0.85, w * 0.1, h * 0.15);
  }
};

const cellBars: D = (c, w, h) => {
  c.strokeStyle = '#1a1a1c'; c.lineWidth = h * 0.3; line(c, 0, h / 2, w, h / 2); c.stroke();
  c.strokeStyle = '#6a6a72'; c.lineWidth = h * 0.18; c.stroke();
  for (let x = h * 0.3; x < w; x += w / 8) { c.fillStyle = '#4a4a50'; ellipse(c, x, h / 2, h * 0.28, h * 0.28); c.fill(); ink(c, h * 0.06, OUT); }
};

const debris: D = (c, w, h, rng) => {
  speckle(c, w / 2, h / 2, Math.min(w, h) * 0.45, rng, 50, ['#6f6a62', '#8a847a', '#4a4540'], [1, 4], 0.9);
  for (let i = 0; i < 4; i++) {
    c.strokeStyle = '#5a4128'; c.lineWidth = 3;
    const x = w * rnd(rng, 0.2, 0.8), y = h * rnd(rng, 0.2, 0.8), a = rng() * Math.PI;
    line(c, x, y, x + Math.cos(a) * w * 0.2, y + Math.sin(a) * h * 0.2); c.stroke();
  }
};

// --------------------------------------------------------------------------- cave

const caveRocks: D = (c, w, h, rng) => {
  const items = Array.from({ length: 9 }, () => ({ x: w * rnd(rng, 0.15, 0.85), y: h * rnd(rng, 0.15, 0.85), r: Math.min(w, h) * rnd(rng, 0.14, 0.3) }));
  items.sort((a, b) => a.y - b.y);
  for (const it of items) rockShape(c, it.x, it.y, it.r * 1.2, it.r, rng, '#5a534b');
};

const stalagmite: D = (c, w, h, rng) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
  for (let i = 0; i < 5; i++) {
    const r = R * (1 - i * 0.18);
    blob(c, cx - i * R * 0.05, cy - i * R * 0.05, r, r, rng, 9, 0.2);
    c.fillStyle = shade('#6d655b', -0.3 + i * 0.13); c.fill();
    if (i === 0) ink(c, R * 0.05, OUT);
  }
};

const stalactite: D = (c, w, h, rng) => {
  // Seen from above: dark drip-marks on the floor beneath hanging spikes.
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
  c.fillStyle = radial(c, cx, cy, R, [[0, 'rgba(10,8,6,0.6)'], [1, 'rgba(10,8,6,0)']]); ellipse(c, cx, cy, R, R); c.fill();
  for (let i = 0; i < 6; i++) {
    const a = rng() * Math.PI * 2, d = rng() * R * 0.6;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, r = R * rnd(rng, 0.12, 0.25);
    c.fillStyle = radial(c, x - r * 0.3, y - r * 0.3, r * 1.2, [[0, '#a79d8f'], [1, '#4a433b']]); ellipse(c, x, y, r, r); c.fill(); ink(c, R * 0.03, OUT);
  }
};

const pool: D = (c, w, h, rng) => {
  blob(c, w / 2, h / 2, w * 0.46, h * 0.44, rng, 14, 0.3);
  c.fillStyle = '#3a342d'; c.fill(); ink(c, Math.min(w, h) * 0.025, OUT);
  blob(c, w / 2, h / 2, w * 0.4, h * 0.38, rng, 14, 0.25);
  c.fillStyle = radial(c, w / 2, h / 2, w * 0.45, [[0, '#1c4a5a'], [0.7, '#2c6878'], [1, '#5a8a8a']]); c.fill();
  c.strokeStyle = 'rgba(200,240,255,0.25)'; c.lineWidth = Math.min(w, h) * 0.01;
  for (let i = 0; i < 3; i++) { ellipse(c, w * rnd(rng, 0.35, 0.65), h * rnd(rng, 0.35, 0.65), w * 0.08 * (i + 1), h * 0.05 * (i + 1)); c.stroke(); }
};

const mossPatch: D = (c, w, h, rng) => {
  for (let i = 0; i < 6; i++) { blob(c, w * rnd(rng, 0.3, 0.7), h * rnd(rng, 0.3, 0.7), w * rnd(rng, 0.15, 0.3), h * rnd(rng, 0.12, 0.25), rng, 10, 0.4); c.fillStyle = shade('#4f6a2a', rnd(rng, -0.2, 0.2)); c.globalAlpha = 0.8; c.fill(); }
  c.globalAlpha = 1;
  speckle(c, w / 2, h / 2, Math.min(w, h) * 0.4, rng, 60, ['#7a9a3a', '#3a5020'], [1, 3], 0.7);
};

const crystals = (col: string): D => (c, w, h, rng) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
  c.fillStyle = radial(c, cx, cy, R, [[0, shade(col, 0.2) + '99'], [1, col + '00']]); ellipse(c, cx, cy, R, R); c.fill();
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2, len = R * rnd(rng, 0.45, 0.85), wd = R * rnd(rng, 0.12, 0.2);
    c.save(); c.translate(cx, cy); c.rotate(a);
    poly(c, [[0, -wd / 2], [len * 0.8, -wd / 2], [len, 0], [len * 0.8, wd / 2], [0, wd / 2]]);
    c.fillStyle = linear(c, 0, -wd, 0, wd, [[0, shade(col, 0.5)], [0.5, col], [1, shade(col, -0.35)]]); c.fill(); ink(c, R * 0.03, shade(col, -0.6));
    c.restore();
  }
};

const naturalPillar: D = (c, w, h, rng) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
  blob(c, cx, cy, R * 0.95, R * 0.9, rng, 11, 0.25); c.fillStyle = '#4a433b'; c.fill(); ink(c, R * 0.05, OUT);
  for (let i = 1; i < 5; i++) { blob(c, cx - i * R * 0.04, cy - i * R * 0.04, R * (0.9 - i * 0.16), R * (0.85 - i * 0.15), rng, 10, 0.2); c.fillStyle = shade('#5a534b', i * 0.1); c.fill(); }
};

const fungi: D = (c, w, h, rng) => {
  mossPatch(c, w, h, rng);
  const m = (x: number, y: number, r: number) => {
    c.fillStyle = radial(c, x, y, r * 2.6, [[0, 'rgba(110,240,210,0.5)'], [1, 'rgba(110,240,210,0)']]); ellipse(c, x, y, r * 2.6, r * 2.6); c.fill();
    c.fillStyle = radial(c, x - r * 0.3, y - r * 0.3, r * 1.3, [[0, '#c8fff0'], [1, '#2aa88a']]); ellipse(c, x, y, r, r); c.fill(); ink(c, r * 0.15, OUT);
  };
  for (let i = 0; i < 6; i++) m(w * rnd(rng, 0.2, 0.8), h * rnd(rng, 0.2, 0.8), Math.min(w, h) * rnd(rng, 0.05, 0.1));
};

// --------------------------------------------------------------------------- interior

const chair: D = (c, w, h, rng) => {
  planks(c, w * 0.1, h * 0.2, w * 0.8, h * 0.75, '#8a6a45', rng);
  c.fillStyle = '#5a4128'; c.fillRect(w * 0.05, 0, w * 0.9, h * 0.22); c.strokeStyle = OUT; c.lineWidth = Math.min(w, h) * 0.05; c.strokeRect(w * 0.05, 0, w * 0.9, h * 0.22);
};

const bed = (col: string): D => (c, w, h, rng) => {
  planks(c, 0, 0, w, h, '#6b4a2c', rng);
  c.fillStyle = linear(c, 0, 0, w, h, [[0, shade(col, 0.2)], [1, shade(col, -0.25)]]); c.fillRect(w * 0.06, h * 0.28, w * 0.88, h * 0.68);
  c.strokeStyle = OUT; c.lineWidth = 1.5; c.strokeRect(w * 0.06, h * 0.28, w * 0.88, h * 0.68);
  c.fillStyle = shade(col, 0.35); c.fillRect(w * 0.06, h * 0.28, w * 0.88, h * 0.1);
  roundRect(c, w * 0.12, h * 0.06, w * 0.76, h * 0.18, h * 0.06); c.fillStyle = '#efe8d8'; c.fill(); ink(c, 1.5, OUT);
  c.strokeStyle = shade(col, -0.35); c.lineWidth = 1;
  for (let i = 0; i < 4; i++) { const y = h * (0.45 + i * 0.12); line(c, w * 0.1, y, w * 0.9, y + rnd(rng, -2, 2)); c.stroke(); }
};

const shelf: D = (c, w, h, rng) => {
  planks(c, 0, 0, w, h, '#6b4a2c', rng);
  let x = w * 0.03;
  while (x < w * 0.95) {
    const bw = w * rnd(rng, 0.03, 0.06);
    c.fillStyle = ['#7a2a24', '#2a4a6a', '#3a5a2a', '#8a6a2a', '#4a2a5a'][Math.floor(rng() * 5)];
    c.fillRect(x, h * 0.15, bw, h * 0.7); c.strokeStyle = OUT; c.lineWidth = 0.8; c.strokeRect(x, h * 0.15, bw, h * 0.7);
    x += bw + w * 0.005;
  }
};

const desk: D = (c, w, h, rng) => {
  planks(c, 0, 0, w, h, '#7a5634', rng);
  c.fillStyle = '#efe6cf'; c.save(); c.translate(w * 0.35, h * 0.45); c.rotate(-0.15); c.fillRect(-w * 0.12, -h * 0.25, w * 0.24, h * 0.5); c.strokeStyle = OUT; c.lineWidth = 1; c.strokeRect(-w * 0.12, -h * 0.25, w * 0.24, h * 0.5);
  c.strokeStyle = 'rgba(40,30,20,0.6)'; for (let i = 0; i < 5; i++) { line(c, -w * 0.09, -h * 0.18 + i * h * 0.08, w * 0.09, -h * 0.18 + i * h * 0.08); c.stroke(); }
  c.restore();
  c.fillStyle = '#1a1a1a'; ellipse(c, w * 0.7, h * 0.35, w * 0.04, w * 0.04); c.fill();
  c.strokeStyle = '#e8e0cf'; c.lineWidth = 1.5; line(c, w * 0.7, h * 0.35, w * 0.8, h * 0.15); c.stroke();
  candle(c, w * 0.85, h * 0.7, Math.min(w, h) * 0.25);
};

function candle(c: C, x: number, y: number, r: number) {
  c.fillStyle = radial(c, x, y, r, [[0, 'rgba(255,220,130,0.7)'], [1, 'rgba(255,200,100,0)']]); ellipse(c, x, y, r, r); c.fill();
  c.fillStyle = '#efe6cf'; ellipse(c, x, y, r * 0.22, r * 0.22); c.fill(); ink(c, r * 0.05, OUT);
  c.fillStyle = '#ffb030'; ellipse(c, x, y, r * 0.08, r * 0.08); c.fill();
}

const candles: D = (c, w, h) => { candle(c, w * 0.35, h * 0.4, Math.min(w, h) * 0.45); candle(c, w * 0.65, h * 0.6, Math.min(w, h) * 0.4); };

const cabinet: D = (c, w, h, rng) => {
  planks(c, 0, 0, w, h, '#6b4a2c', rng, true);
  c.strokeStyle = OUT; c.lineWidth = 1.5; line(c, w / 2, 0, w / 2, h); c.stroke();
  c.fillStyle = '#c9a45a'; ellipse(c, w * 0.45, h / 2, 2, 2); c.fill(); ellipse(c, w * 0.55, h / 2, 2, 2); c.fill();
};

const rug = (col: string, accent: string): D => (c, w, h, rng) => {
  c.fillStyle = col; c.fillRect(w * 0.03, h * 0.05, w * 0.94, h * 0.9);
  c.strokeStyle = accent; c.lineWidth = Math.min(w, h) * 0.05; c.strokeRect(w * 0.09, h * 0.14, w * 0.82, h * 0.72);
  c.lineWidth = Math.min(w, h) * 0.02; c.strokeRect(w * 0.14, h * 0.24, w * 0.72, h * 0.52);
  c.fillStyle = accent; poly(c, [[w / 2, h * 0.3], [w * 0.65, h / 2], [w / 2, h * 0.7], [w * 0.35, h / 2]]); c.fill();
  c.strokeStyle = shade(col, 0.3); c.lineWidth = 1.2;
  for (let x = w * 0.03; x < w * 0.97; x += 4) { line(c, x, h * 0.05, x, 0); c.stroke(); line(c, x, h * 0.95, x, h); c.stroke(); }
};

const books: D = (c, w, h, rng) => {
  for (let i = 0; i < 4; i++) {
    c.save(); c.translate(w / 2 + rnd(rng, -2, 2), h / 2 + rnd(rng, -2, 2)); c.rotate(rnd(rng, -0.4, 0.4));
    const bw = w * (0.8 - i * 0.1), bh = h * (0.6 - i * 0.07);
    c.fillStyle = ['#7a2a24', '#2a4a6a', '#3a5a2a', '#8a6a2a'][i]; c.fillRect(-bw / 2, -bh / 2, bw, bh); c.strokeStyle = OUT; c.lineWidth = 1; c.strokeRect(-bw / 2, -bh / 2, bw, bh);
    c.fillStyle = '#efe6cf'; c.fillRect(bw / 2 - bw * 0.1, -bh / 2 + 1, bw * 0.08, bh - 2);
    c.restore();
  }
};

const fireplace: D = (c, w, h, rng) => {
  c.fillStyle = '#6f6a62'; c.fillRect(0, 0, w, h); c.strokeStyle = OUT; c.lineWidth = 2.5; c.strokeRect(0, 0, w, h);
  c.fillStyle = '#1a1410'; c.fillRect(w * 0.15, h * 0.1, w * 0.7, h * 0.6);
  c.fillStyle = radial(c, w / 2, h * 0.45, w * 0.3, [[0, '#fff0a0'], [0.3, '#ffb030'], [0.7, '#d0401a'], [1, 'rgba(120,20,10,0)']]); blob(c, w / 2, h * 0.45, w * 0.25, h * 0.2, rng, 8, 0.5); c.fill();
  c.fillStyle = '#8a857b'; c.fillRect(w * 0.1, h * 0.7, w * 0.8, h * 0.3); c.strokeRect(w * 0.1, h * 0.7, w * 0.8, h * 0.3);
};

const counter: D = (c, w, h, rng) => {
  planks(c, 0, 0, w, h, '#7a5634', rng);
  for (let i = 0; i < 5; i++) { const x = w * (0.1 + i * 0.2); c.fillStyle = '#c9a86a'; ellipse(c, x, h / 2, h * 0.18, h * 0.18); c.fill(); ink(c, 1, OUT); c.fillStyle = '#6a3a1a'; ellipse(c, x, h / 2, h * 0.12, h * 0.12); c.fill(); }
};

const sacks: D = (c, w, h, rng) => {
  for (let i = 0; i < 4; i++) {
    const x = w * rnd(rng, 0.25, 0.75), y = h * rnd(rng, 0.25, 0.75);
    blob(c, x, y, w * 0.24, h * 0.2, rng, 9, 0.2); c.fillStyle = linear(c, x - w * 0.2, y - h * 0.2, x + w * 0.2, y + h * 0.2, [[0, '#d8c49a'], [1, '#9a8458']]); c.fill(); ink(c, Math.min(w, h) * 0.02, OUT);
    c.strokeStyle = '#6a5a3a'; c.lineWidth = 1.5; line(c, x - w * 0.05, y - h * 0.15, x + w * 0.05, y - h * 0.15); c.stroke();
  }
};

const stove: D = (c, w, h, rng) => {
  c.fillStyle = '#3a3a3e'; roundRect(c, 0, 0, w, h, 6); c.fill(); ink(c, 2.5, OUT);
  for (const [x, y] of [[0.3, 0.35], [0.7, 0.35]]) { c.fillStyle = '#1a1a1c'; ellipse(c, w * x, h * y, w * 0.15, w * 0.15); c.fill(); c.strokeStyle = '#6a6a72'; c.lineWidth = 1.5; c.stroke(); }
  pot(c, w * 0.4, h * 0.5, rng);
  c.fillStyle = radial(c, w / 2, h * 0.85, w * 0.2, [[0, '#ffb030'], [1, 'rgba(200,60,20,0)']]); c.fillRect(w * 0.25, h * 0.75, w * 0.5, h * 0.2);
};

const plates: D = (c, w, h, rng) => {
  for (let i = 0; i < 3; i++) {
    const x = w * (0.2 + i * 0.3), y = h * rnd(rng, 0.35, 0.65), r = Math.min(w, h) * 0.18;
    c.fillStyle = '#e8e2d6'; ellipse(c, x, y, r, r); c.fill(); ink(c, 1, OUT);
    c.fillStyle = ['#a0582a', '#6a8a2a', '#d4a24a'][i]; ellipse(c, x, y, r * 0.55, r * 0.55); c.fill();
  }
};

// --------------------------------------------------------------------------- registration

type Entry = [id: string, name: string, cat: string, sub: string, w: number, h: number, draw: D, role: AssetDef['role'], collision: AssetDef['collision'], tags: string[], glow?: string];

const E: Entry[] = [
  // Camp
  ['tent-cloth-a', 'Cloth Tent A', 'Camp', 'Tents', 170, 120, tent('#cdbb95'), 'buildings', 'building', ['tent', 'cloth', 'camp']],
  ['tent-cloth-b', 'Cloth Tent B', 'Camp', 'Tents', 160, 115, tent('#b9a987', false, true), 'buildings', 'building', ['tent', 'cloth', 'camp']],
  ['tent-cloth-c', 'Cloth Tent (Green)', 'Camp', 'Tents', 165, 118, tent('#7f8a5c'), 'buildings', 'building', ['tent', 'cloth', 'camp']],
  ['tent-leather-a', 'Leather Tent A', 'Camp', 'Tents', 175, 125, tent('#8f6a45'), 'buildings', 'building', ['tent', 'leather', 'camp']],
  ['tent-leather-b', 'Leather Tent B', 'Camp', 'Tents', 165, 120, tent('#7a5838', false, true), 'buildings', 'building', ['tent', 'leather', 'camp']],
  ['tent-round', 'Round Tent', 'Camp', 'Tents', 160, 160, tent('#c2ab82', true), 'buildings', 'building', ['tent', 'round', 'yurt', 'camp']],
  ['tent-round-leather', 'Round Leather Tent', 'Camp', 'Tents', 150, 150, tent('#8a6440', true), 'buildings', 'building', ['tent', 'round', 'leather', 'camp']],
  ['lean-to', 'Makeshift Shelter', 'Camp', 'Shelters', 150, 110, leanTo, 'buildings', 'building', ['shelter', 'lean-to', 'camp']],
  ['bedroll-a', 'Bedroll (Red)', 'Camp', 'Bedding', 110, 45, bedroll('#8a3a2a'), 'ground', 'prop', ['bedroll', 'camp']],
  ['bedroll-b', 'Bedroll (Blue)', 'Camp', 'Bedding', 110, 45, bedroll('#3a5a7a'), 'ground', 'prop', ['bedroll', 'camp']],
  ['bedroll-c', 'Bedroll (Green)', 'Camp', 'Bedding', 110, 45, bedroll('#4a6a3a'), 'ground', 'prop', ['bedroll', 'camp']],
  ['campfire', 'Campfire', 'Camp', 'Fire', 90, 90, campfire, 'details', 'prop', ['campfire', 'fire', 'camp'], 'campfire'],
  ['firewood', 'Firewood', 'Camp', 'Fire', 80, 60, firewood, 'details', 'prop', ['firewood', 'wood', 'camp']],
  ['cooking-pot', 'Cooking Pot', 'Camp', 'Cooking', 60, 60, pot, 'details', 'prop', ['pot', 'cooking', 'camp']],
  ['barrel', 'Barrel', 'Camp', 'Storage', 48, 48, barrel, 'details', 'prop', ['barrel', 'storage']],
  ['crate', 'Crate', 'Camp', 'Storage', 50, 50, crate, 'details', 'prop', ['crate', 'box', 'storage']],
  ['crate-long', 'Long Crate', 'Camp', 'Storage', 90, 45, crate, 'details', 'prop', ['crate', 'storage']],
  ['pack', 'Pack', 'Camp', 'Belongings', 38, 44, pack, 'details', 'none', ['pack', 'bag', 'backpack', 'belongings']],
  ['sword', 'Sword', 'Camp', 'Weapons', 80, 18, sword, 'details', 'none', ['sword', 'weapon']],
  ['axe', 'Axe', 'Camp', 'Weapons', 60, 28, axe, 'details', 'none', ['axe', 'weapon', 'tool']],
  ['weapon-rack', 'Weapon Rack', 'Camp', 'Weapons', 90, 60, weaponRack, 'details', 'prop', ['weapons', 'rack']],
  ['shield-round', 'Round Shield', 'Camp', 'Weapons', 40, 40, shield, 'details', 'none', ['shield', 'weapon']],
  ['table-camp', 'Camp Table', 'Camp', 'Furniture', 100, 60, table(), 'details', 'prop', ['table', 'camp']],
  ['bench', 'Bench', 'Camp', 'Furniture', 100, 26, bench, 'details', 'prop', ['bench', 'seat']],
  ['log-seat', 'Log Seat', 'Camp', 'Furniture', 90, 30, (c, w, h, r) => { c.fillStyle = '#6b4f33'; roundRect(c, 0, 0, w, h, h / 2); c.fill(); ink(c, 2, OUT); c.fillStyle = '#c9a877'; ellipse(c, h * 0.3, h / 2, h * 0.2, h * 0.45); c.fill(); }, 'details', 'prop', ['seat', 'log', 'camp']],
  ['hide', 'Animal Hide', 'Camp', 'Belongings', 90, 70, hide, 'ground', 'none', ['hide', 'pelt', 'fur']],
  ['rope', 'Coiled Rope', 'Camp', 'Belongings', 36, 36, rope, 'details', 'none', ['rope']],
  ['lantern', 'Lantern', 'Camp', 'Light', 40, 40, lantern, 'details', 'none', ['lantern', 'light'], 'lantern'],
  ['food-basket', 'Food Basket', 'Camp', 'Food', 44, 44, food, 'details', 'none', ['food', 'basket']],
  ['waterskin', 'Waterskin', 'Camp', 'Water', 26, 34, waterskin, 'details', 'none', ['water', 'waterskin']],
  ['bucket', 'Water Bucket', 'Camp', 'Water', 34, 34, bucket, 'details', 'none', ['bucket', 'water']],
  // Village
  ['well', 'Well', 'Settlement', 'Village Life', 80, 80, well, 'buildings', 'building', ['well', 'water']],
  ['dock', 'Dock', 'Settlement', 'Waterfront', 300, 90, dock, 'buildings', 'none', ['dock', 'pier', 'coastal']],
  ['bridge-wood', 'Wooden Bridge', 'Settlement', 'Waterfront', 240, 90, bridge, 'paths', 'none', ['bridge']],
  ['bridge-stone', 'Stone Bridge', 'Settlement', 'Waterfront', 260, 100, stoneBridge, 'paths', 'none', ['bridge', 'stone']],
  ['market-stall-red', 'Market Stall (Red)', 'Settlement', 'Market', 110, 80, stall('#a33a2a'), 'buildings', 'building', ['market', 'stall']],
  ['market-stall-blue', 'Market Stall (Blue)', 'Settlement', 'Market', 110, 80, stall('#2f5a8a'), 'buildings', 'building', ['market', 'stall']],
  ['market-stall-green', 'Market Stall (Green)', 'Settlement', 'Market', 110, 80, stall('#3a6a3a'), 'buildings', 'building', ['market', 'stall']],
  ['cart', 'Cart', 'Settlement', 'Village Life', 120, 70, cart, 'details', 'prop', ['cart', 'wagon']],
  ['boat', 'Rowboat', 'Settlement', 'Waterfront', 130, 55, boat, 'details', 'none', ['boat', 'rowboat', 'coastal']],
  ['windmill', 'Windmill', 'Settlement', 'Farms', 220, 220, windmill, 'buildings', 'building', ['windmill', 'mill', 'farm']],
  ['watermill', 'Watermill', 'Settlement', 'Farms', 220, 160, watermill, 'buildings', 'building', ['watermill', 'mill', 'river']],
  ['farm-wheat', 'Wheat Field', 'Settlement', 'Farms', 300, 220, farmPlot('#d8b85a'), 'ground', 'none', ['farm', 'field', 'wheat', 'crops']],
  ['farm-veg', 'Vegetable Field', 'Settlement', 'Farms', 260, 200, farmPlot('#5f8a36'), 'ground', 'none', ['farm', 'field', 'crops']],
  ['garden', 'Garden', 'Settlement', 'Village Life', 120, 90, garden, 'ground', 'none', ['garden', 'vegetables']],
  ['livestock-pen', 'Livestock Pen', 'Settlement', 'Farms', 200, 160, pen, 'ground', 'building', ['livestock', 'pen', 'animals', 'farm']],
  ['hay-bale', 'Hay Bale', 'Settlement', 'Farms', 50, 50, hay, 'details', 'prop', ['hay', 'farm']],
  ['trough', 'Trough', 'Settlement', 'Farms', 80, 30, trough, 'details', 'prop', ['trough', 'water', 'farm']],
  ['woodpile', 'Wood Pile', 'Settlement', 'Village Life', 80, 60, woodpile, 'details', 'prop', ['wood', 'pile', 'firewood']],
  ['fence', 'Fence Segment', 'Settlement', 'Walls & Fences', 140, 14, fence, 'details', 'none', ['fence']],
  ['stone-wall-seg', 'Stone Wall Segment', 'Settlement', 'Walls & Fences', 140, 26, stoneWall, 'buildings', 'building', ['wall', 'stone']],
  ['gate', 'Gate', 'Settlement', 'Walls & Fences', 140, 40, gate, 'buildings', 'building', ['gate']],
  ['signpost', 'Signpost', 'Settlement', 'Village Life', 60, 60, signpost, 'details', 'none', ['sign', 'signpost']],
  ['gravestone', 'Gravestone', 'Settlement', 'Village Life', 34, 44, gravestone, 'details', 'prop', ['grave', 'cemetery']],
  // Dungeon
  ['dungeon-wall', 'Stone Wall', 'Dungeon', 'Structure', 140, 44, wallBlock, 'buildings', 'building', ['wall', 'dungeon']],
  ['door-wood', 'Wooden Door', 'Dungeon', 'Doors', 70, 30, door, 'buildings', 'none', ['door']],
  ['portcullis', 'Portcullis', 'Dungeon', 'Doors', 90, 26, portcullis, 'buildings', 'none', ['gate', 'portcullis']],
  ['pillar-round', 'Round Pillar', 'Dungeon', 'Structure', 60, 60, pillar(true), 'buildings', 'building', ['pillar', 'column']],
  ['pillar-square', 'Square Pillar', 'Dungeon', 'Structure', 56, 56, pillar(false), 'buildings', 'building', ['pillar', 'column']],
  ['stairs', 'Stairs', 'Dungeon', 'Structure', 70, 140, stairs, 'ground', 'none', ['stairs', 'steps']],
  ['rubble', 'Rubble', 'Dungeon', 'Debris', 90, 80, rubble, 'details', 'none', ['rubble', 'debris']],
  ['broken-masonry', 'Broken Masonry', 'Dungeon', 'Debris', 120, 100, brokenMasonry, 'details', 'none', ['masonry', 'ruins', 'debris']],
  ['statue', 'Statue', 'Dungeon', 'Features', 90, 90, statue, 'buildings', 'building', ['statue']],
  ['altar', 'Altar', 'Dungeon', 'Features', 130, 70, altar, 'buildings', 'building', ['altar', 'shrine', 'temple']],
  ['sarcophagus', 'Sarcophagus', 'Dungeon', 'Features', 140, 60, sarcophagus, 'buildings', 'building', ['sarcophagus', 'tomb', 'crypt']],
  ['chains', 'Chains', 'Dungeon', 'Features', 80, 30, chains, 'details', 'none', ['chains', 'prison']],
  ['torch', 'Wall Torch', 'Dungeon', 'Light', 50, 50, torch, 'details', 'none', ['torch', 'light'], 'torch'],
  ['bones-pile', 'Bones', 'Dungeon', 'Debris', 60, 60, bones, 'details', 'none', ['bones', 'skull']],
  ['debris', 'Debris', 'Dungeon', 'Debris', 80, 80, debris, 'details', 'none', ['debris']],
  ['chest', 'Chest', 'Dungeon', 'Treasure', 60, 40, chest(false), 'details', 'prop', ['chest', 'treasure']],
  ['chest-open', 'Open Chest', 'Dungeon', 'Treasure', 60, 40, chest(true), 'details', 'prop', ['chest', 'treasure', 'gold']],
  ['table-dungeon', 'Stone Table', 'Dungeon', 'Features', 110, 70, (c, w, h, r) => { c.fillStyle = '#7d786f'; c.fillRect(0, 0, w, h); ink(c, 2, OUT); c.strokeRect(0, 0, w, h); table(false, true)(c, w, h, r); }, 'details', 'prop', ['table']],
  ['cell-bars', 'Prison Cell Bars', 'Dungeon', 'Structure', 140, 16, cellBars, 'buildings', 'building', ['prison', 'cell', 'bars']],
  // Cave
  ['cave-wall', 'Cave Wall Rocks', 'Cave', 'Walls', 160, 140, caveRocks, 'buildings', 'rock', ['cave', 'wall', 'rock']],
  ['stalagmite', 'Stalagmite', 'Cave', 'Formations', 60, 60, stalagmite, 'details', 'rock', ['stalagmite', 'cave']],
  ['stalactite', 'Stalactites', 'Cave', 'Formations', 80, 80, stalactite, 'details', 'none', ['stalactite', 'cave']],
  ['rock-pile', 'Rock Pile', 'Cave', 'Formations', 90, 80, caveRocks, 'details', 'rock', ['rocks', 'pile', 'cave']],
  ['cave-pool', 'Underground Pool', 'Cave', 'Water', 220, 170, pool, 'ground', 'none', ['pool', 'water', 'cave']],
  ['cave-moss', 'Cave Moss', 'Cave', 'Growth', 100, 80, mossPatch, 'ground', 'none', ['moss', 'cave']],
  ['glow-fungi', 'Glowing Fungi', 'Cave', 'Growth', 80, 80, fungi, 'details', 'none', ['fungi', 'mushroom', 'glow', 'cave'], 'magic'],
  ['crystals-blue', 'Crystals (Blue)', 'Cave', 'Crystals', 80, 80, crystals('#5fb8e8'), 'details', 'rock', ['crystal', 'gem', 'cave'], 'magic'],
  ['crystals-purple', 'Crystals (Purple)', 'Cave', 'Crystals', 80, 80, crystals('#a066d8'), 'details', 'rock', ['crystal', 'gem', 'cave'], 'magic'],
  ['cave-roots', 'Hanging Roots', 'Cave', 'Growth', 110, 110, (c, w, h, r) => { c.save(); c.globalAlpha = 0.9; (roots as D)(c, w, h, r); c.restore(); }, 'details', 'none', ['roots', 'cave']],
  ['natural-pillar', 'Natural Pillar', 'Cave', 'Formations', 110, 100, naturalPillar, 'buildings', 'rock', ['pillar', 'column', 'cave']],
  // Interior
  ['int-table', 'Table', 'Interior', 'Furniture', 140, 80, table(), 'details', 'prop', ['table']],
  ['int-table-round', 'Round Table', 'Interior', 'Furniture', 100, 100, table(true), 'details', 'prop', ['table', 'round']],
  ['chair', 'Chair', 'Interior', 'Furniture', 36, 36, chair, 'details', 'prop', ['chair', 'seat']],
  ['bed-red', 'Bed (Red)', 'Interior', 'Furniture', 80, 140, bed('#8a3a2a'), 'details', 'prop', ['bed']],
  ['bed-blue', 'Bed (Blue)', 'Interior', 'Furniture', 80, 140, bed('#3a5a7a'), 'details', 'prop', ['bed']],
  ['bookshelf', 'Bookshelf', 'Interior', 'Furniture', 140, 36, shelf, 'details', 'prop', ['shelf', 'books', 'library']],
  ['desk', 'Desk', 'Interior', 'Furniture', 120, 70, desk, 'details', 'prop', ['desk', 'study']],
  ['int-chest', 'Chest', 'Interior', 'Storage', 60, 40, chest(false), 'details', 'prop', ['chest']],
  ['cabinet', 'Cabinet', 'Interior', 'Storage', 90, 40, cabinet, 'details', 'prop', ['cabinet', 'cupboard']],
  ['rug-red', 'Rug (Red)', 'Interior', 'Decor', 200, 140, rug('#7a2a24', '#c9a45a'), 'ground', 'none', ['rug', 'carpet']],
  ['rug-blue', 'Rug (Blue)', 'Interior', 'Decor', 200, 140, rug('#2a3a5a', '#d8c8a0'), 'ground', 'none', ['rug', 'carpet']],
  ['books', 'Books', 'Interior', 'Decor', 40, 34, books, 'details', 'none', ['books']],
  ['candles', 'Candles', 'Interior', 'Light', 40, 40, candles, 'details', 'none', ['candle', 'light'], 'lantern'],
  ['fireplace', 'Fireplace', 'Interior', 'Features', 140, 60, fireplace, 'buildings', 'building', ['fireplace', 'hearth'], 'fireplace'],
  ['counter', 'Bar Counter', 'Interior', 'Furniture', 220, 50, counter, 'details', 'prop', ['counter', 'bar', 'tavern']],
  ['int-barrel', 'Barrel', 'Interior', 'Storage', 48, 48, barrel, 'details', 'prop', ['barrel']],
  ['sacks', 'Sacks', 'Interior', 'Storage', 80, 70, sacks, 'details', 'prop', ['sacks', 'grain', 'storage']],
  ['plates', 'Plates of Food', 'Interior', 'Kitchen', 80, 36, plates, 'details', 'none', ['food', 'plates']],
  ['stove', 'Stove', 'Interior', 'Kitchen', 90, 70, stove, 'details', 'prop', ['stove', 'kitchen', 'cooking']],
];

export function registerPropAssets() {
  for (const [id, name, cat, sub, w, h, draw, role, collision, tags, glow] of E) {
    registerAsset({ id: `td/${id}`, name, category: cat, subcategory: sub, pack: 'topdown', tags, w, h, role, collision, draw, glow, footprint: 0.85 });
  }
}
