import type { Rng } from '../../core/rng';
import { shade } from '../../core/color';
import { registerAsset } from './registry';
import { poly, blob, radial, linear, ink, rnd, ellipse, line, speckle, type C } from './draw';

/**
 * Top-down settlement architecture. One parametric building generator is
 * combined with eight architectural collections, so every collection shares a
 * consistent palette / roof language (spec §25, §76).
 */

type RoofType = 'gable' | 'hip' | 'flat' | 'turf' | 'curved' | 'thatch';

interface Style {
  id: string;
  name: string;
  roof: string;
  wall: string;
  trim: string;
  roofType: RoofType;
  shingle: 'tile' | 'wood' | 'slate' | 'thatch' | 'turf' | 'stone' | 'plaster' | 'leaf';
  ruined?: boolean;
  accent: string;
}

const STYLES: Style[] = [
  { id: 'norse', name: 'Viking / Norse', roof: '#56733a', wall: '#6b5238', trim: '#3a2a1c', roofType: 'turf', shingle: 'turf', accent: '#a33a2a' },
  { id: 'medieval', name: 'Medieval European', roof: '#a14e34', wall: '#dccaa4', trim: '#4a3526', roofType: 'gable', shingle: 'tile', accent: '#2f4f7a' },
  { id: 'rustic', name: 'Rustic Frontier', roof: '#7d5d3c', wall: '#8b6a45', trim: '#3e2c1c', roofType: 'gable', shingle: 'wood', accent: '#6f7b3a' },
  { id: 'coastal', name: 'Coastal', roof: '#4d6278', wall: '#e9e4d8', trim: '#2c3440', roofType: 'gable', shingle: 'slate', accent: '#2d6f8a' },
  { id: 'desert', name: 'Desert', roof: '#d6b681', wall: '#caa46c', trim: '#7a5a36', roofType: 'flat', shingle: 'plaster', accent: '#2f7f8a' },
  { id: 'elven', name: 'Elven', roof: '#3f7c70', wall: '#e6e9dc', trim: '#8a9f7a', roofType: 'curved', shingle: 'leaf', accent: '#d9b84a' },
  { id: 'dwarven', name: 'Dwarven', roof: '#6f6a63', wall: '#5a554f', trim: '#2f2b27', roofType: 'hip', shingle: 'stone', accent: '#b4722f' },
  { id: 'ruined', name: 'Ruined', roof: '#7f5e48', wall: '#9a9184', trim: '#3a322a', roofType: 'gable', shingle: 'tile', ruined: true, accent: '#555' },
  { id: 'thatch', name: 'Village Thatch', roof: '#b9964f', wall: '#d8c7a0', trim: '#5a4630', roofType: 'thatch', shingle: 'thatch', accent: '#7a3a2a' },
];

const OUT = '#1d1813';

function facetRows(c: C, st: Style, x: number, y: number, w: number, h: number, horizontal: boolean, rng: Rng, lw: number, base: string) {
  const step = Math.max(3, (horizontal ? h : w) * 0.11);
  c.strokeStyle = shade(base, -0.35);
  c.lineWidth = lw * 0.55;
  if (st.shingle === 'thatch') {
    c.globalAlpha = 0.55;
    for (let i = 0; i < (w * h) / (step * 3); i++) {
      const px = x + rng() * w, py = y + rng() * h;
      c.strokeStyle = shade(base, rnd(rng, -0.35, 0.2));
      if (horizontal) line(c, px, py, px + rnd(rng, -1, 1), py + step * 0.9);
      else line(c, px, py, px + step * 0.9, py + rnd(rng, -1, 1));
      c.stroke();
    }
    c.globalAlpha = 1;
    return;
  }
  if (st.shingle === 'turf') {
    speckle(c, x + w / 2, y + h / 2, Math.max(w, h) * 0.7, rng, Math.round((w * h) / 60), [shade(base, 0.2), shade(base, -0.25), '#7c9a44'], [lw * 0.4, lw * 1.2], 0.6);
    speckle(c, x + w / 2, y + h / 2, Math.max(w, h) * 0.6, rng, Math.round((w * h) / 900), ['#e9d24a', '#f3f3f3'], [lw * 0.5, lw * 0.8], 0.8);
    return;
  }
  if (st.shingle === 'plaster') return;
  const len = horizontal ? h : w;
  let row = 0;
  for (let t = step; t < len; t += step, row++) {
    if (horizontal) line(c, x, y + t, x + w, y + t); else line(c, x + t, y, x + t, y + h);
    c.stroke();
    if (st.shingle === 'tile' || st.shingle === 'wood' || st.shingle === 'slate' || st.shingle === 'stone') {
      const tick = st.shingle === 'stone' ? step * 2.2 : st.shingle === 'wood' ? step * 0.8 : step * 1.1;
      const off = row % 2 ? tick / 2 : 0;
      const span = horizontal ? w : h;
      for (let s = off; s < span; s += tick * rnd(rng, 0.85, 1.15)) {
        if (horizontal) line(c, x + s, y + t - step, x + s, y + t); else line(c, x + t - step, y + s, x + t, y + s);
        c.stroke();
      }
    }
  }
}

/** Draw a roof filling the rectangle (x,y,w,h), ridge along the longer axis. */
function roof(c: C, st: Style, x: number, y: number, w: number, h: number, rng: Rng, type: RoofType = st.roofType) {
  const lw = Math.max(0.8, Math.min(w, h) * 0.025);
  const horizontal = w >= h; // ridge runs horizontally
  const base = st.roof;
  if (type === 'flat') {
    c.fillStyle = shade(base, -0.05);
    c.fillRect(x, y, w, h);
    const p = Math.min(w, h) * 0.08;
    c.fillStyle = shade(base, 0.12);
    c.fillRect(x + p, y + p, w - p * 2, h - p * 2);
    c.fillStyle = linear(c, x, y, x + w, y + h, [[0, 'rgba(255,255,255,0.12)'], [1, 'rgba(0,0,0,0.18)']]);
    c.fillRect(x + p, y + p, w - p * 2, h - p * 2);
    c.strokeStyle = shade(base, -0.35); c.lineWidth = lw * 0.6;
    c.strokeRect(x + p, y + p, w - p * 2, h - p * 2);
    c.strokeStyle = OUT; c.lineWidth = lw; c.strokeRect(x, y, w, h);
    return;
  }
  if (type === 'curved') {
    c.beginPath(); c.roundRect(x, y, w, h, Math.min(w, h) * 0.45);
    c.fillStyle = linear(c, x, y, x + w * 0.3, y + h, [[0, shade(base, 0.25)], [0.5, base], [1, shade(base, -0.35)]]);
    c.fill();
    c.save(); c.clip();
    c.strokeStyle = shade(base, -0.3); c.lineWidth = lw * 0.6;
    const n = 7;
    for (let i = 1; i < n; i++) {
      c.beginPath();
      if (horizontal) { c.ellipse(x + w / 2, y + h / 2, (w / 2) * (i / n), (h / 2) * (i / n), 0, 0, Math.PI * 2); }
      else { c.ellipse(x + w / 2, y + h / 2, (w / 2) * (i / n), (h / 2) * (i / n), 0, 0, Math.PI * 2); }
      c.stroke();
    }
    c.restore();
    c.beginPath(); c.roundRect(x, y, w, h, Math.min(w, h) * 0.45); ink(c, lw, OUT);
    c.fillStyle = st.accent;
    ellipse(c, x + w / 2, y + h / 2, lw * 2, lw * 2); c.fill();
    return;
  }
  const hip = type === 'hip';
  const round = type === 'turf' || type === 'thatch';
  const inset = hip ? Math.min(w, h) / 2 : 0;
  // Facets: in "horizontal" orientation, top & bottom quads plus end triangles for hips.
  const facets: { pts: number[][]; tone: number; horiz: boolean }[] = [];
  if (horizontal) {
    const my = y + h / 2;
    facets.push({ pts: [[x, y], [x + w, y], [x + w - inset, my], [x + inset, my]], tone: 0.12, horiz: true });
    facets.push({ pts: [[x + inset, my], [x + w - inset, my], [x + w, y + h], [x, y + h]], tone: -0.2, horiz: true });
    if (hip) {
      facets.push({ pts: [[x, y], [x + inset, my], [x, y + h]], tone: 0.02, horiz: false });
      facets.push({ pts: [[x + w, y], [x + w - inset, my], [x + w, y + h]], tone: -0.3, horiz: false });
    }
  } else {
    const mx = x + w / 2;
    facets.push({ pts: [[x, y], [mx, y + inset], [mx, y + h - inset], [x, y + h]], tone: 0.12, horiz: false });
    facets.push({ pts: [[mx, y + inset], [x + w, y], [x + w, y + h], [mx, y + h - inset]], tone: -0.2, horiz: false });
    if (hip) {
      facets.push({ pts: [[x, y], [x + w, y], [mx, y + inset]], tone: 0.05, horiz: true });
      facets.push({ pts: [[x, y + h], [x + w, y + h], [mx, y + h - inset]], tone: -0.3, horiz: true });
    }
  }
  c.save();
  if (round) { c.beginPath(); c.roundRect(x, y, w, h, Math.min(w, h) * 0.22); c.clip(); }
  for (const f of facets) {
    const col = shade(base, f.tone);
    poly(c, f.pts);
    c.fillStyle = col; c.fill();
    c.save(); poly(c, f.pts); c.clip();
    facetRows(c, st, x, y, w, h, f.horiz, rng, lw, col);
    c.restore();
    poly(c, f.pts);
    c.strokeStyle = shade(base, -0.45); c.lineWidth = lw * 0.5; c.stroke();
  }
  // ridge
  c.strokeStyle = shade(base, -0.45); c.lineWidth = lw * 1.4;
  if (horizontal) line(c, x + inset, y + h / 2, x + w - inset, y + h / 2); else line(c, x + w / 2, y + inset, x + w / 2, y + h - inset);
  c.stroke();
  if (type === 'turf') {
    c.strokeStyle = st.trim; c.lineWidth = lw * 1.8;
    if (horizontal) line(c, x, y + h / 2, x + w, y + h / 2); else line(c, x + w / 2, y, x + w / 2, y + h);
    c.stroke();
  }
  c.restore();
  c.beginPath();
  if (round) c.roundRect(x, y, w, h, Math.min(w, h) * 0.22); else c.rect(x, y, w, h);
  ink(c, lw, OUT);
}

function chimney(c: C, x: number, y: number, s: number, st: Style) {
  c.fillStyle = st.shingle === 'turf' ? '#5a4632' : '#7a6f64';
  c.fillRect(x - s / 2, y - s / 2, s, s);
  c.strokeStyle = OUT; c.lineWidth = s * 0.12; c.strokeRect(x - s / 2, y - s / 2, s, s);
  c.fillStyle = '#1a1512'; c.fillRect(x - s * 0.25, y - s * 0.25, s * 0.5, s * 0.5);
}

function ruin(c: C, w: number, h: number, rng: Rng) {
  for (let i = 0; i < 2 + Math.floor(rng() * 2); i++) {
    const x = w * rnd(rng, 0.2, 0.8), y = h * rnd(rng, 0.25, 0.75), r = Math.min(w, h) * rnd(rng, 0.14, 0.26);
    blob(c, x, y, r * 1.2, r, rng, 9, 0.5);
    c.fillStyle = '#4f4234'; c.fill();
    c.strokeStyle = OUT; c.lineWidth = Math.min(w, h) * 0.02; c.stroke();
    c.save(); c.clip();
    speckle(c, x, y, r, rng, 30, ['#8a8072', '#6d6456', '#a39888'], [r * 0.04, r * 0.12], 0.9);
    c.strokeStyle = '#3a2a1c'; c.lineWidth = Math.min(w, h) * 0.03;
    for (let k = 0; k < 3; k++) { line(c, x - r, y - r + k * r * 0.7, x + r, y - r * 0.6 + k * r * 0.7); c.stroke(); }
    c.restore();
  }
}

type Builder = (c: C, w: number, h: number, rng: Rng, st: Style) => void;

const house: Builder = (c, w, h, rng, st) => {
  roof(c, st, 0, 0, w, h, rng);
  if (st.roofType !== 'flat' && st.roofType !== 'curved') chimney(c, w * rnd(rng, 0.2, 0.3), h * 0.3, Math.min(w, h) * 0.12, st);
  if (st.ruined) ruin(c, w, h, rng);
};

const longhouse: Builder = (c, w, h, rng, st) => {
  roof(c, st, 0, 0, w, h, rng, st.roofType === 'gable' || st.roofType === 'turf' ? st.roofType : st.roofType === 'flat' ? 'flat' : 'hip');
  const s = Math.min(w, h) * 0.1;
  c.fillStyle = '#231a12';
  for (const x of [w * 0.3, w * 0.7]) { ellipse(c, x, h / 2, s * 0.6, s * 0.6); c.fill(); }
  if (st.id === 'norse') {
    // carved gable ends
    c.strokeStyle = st.trim; c.lineWidth = s * 0.5;
    for (const x of [0, w]) { line(c, x, h * 0.2, x + (x ? s * 1.5 : -s * 1.5), h * 0.05); c.stroke(); line(c, x, h * 0.8, x + (x ? s * 1.5 : -s * 1.5), h * 0.95); c.stroke(); }
  }
  if (st.ruined) ruin(c, w, h, rng);
};

const tavern: Builder = (c, w, h, rng, st) => {
  roof(c, st, w * 0.55, h * 0.45, w * 0.42, h * 0.55, rng);
  roof(c, st, 0, 0, w * 0.75, h * 0.62, rng);
  chimney(c, w * 0.15, h * 0.2, Math.min(w, h) * 0.1, st);
  chimney(c, w * 0.6, h * 0.2, Math.min(w, h) * 0.1, st);
  // hanging sign
  c.fillStyle = st.accent;
  c.fillRect(w * 0.3, h * 0.64, w * 0.12, h * 0.08);
  c.strokeStyle = OUT; c.lineWidth = Math.min(w, h) * 0.015; c.strokeRect(w * 0.3, h * 0.64, w * 0.12, h * 0.08);
  if (st.ruined) ruin(c, w, h, rng);
};

const shop: Builder = (c, w, h, rng, st) => {
  roof(c, st, 0, 0, w, h * 0.78, rng);
  // striped awning along the front
  const ay = h * 0.78, ah = h * 0.22;
  const n = 7;
  for (let i = 0; i < n; i++) {
    c.fillStyle = i % 2 ? '#efe6d2' : st.accent;
    c.fillRect(w * 0.1 + (w * 0.8 * i) / n, ay, (w * 0.8) / n + 0.5, ah);
  }
  c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(w * 0.1, ay + ah * 0.7, w * 0.8, ah * 0.3);
  c.strokeStyle = OUT; c.lineWidth = Math.min(w, h) * 0.015; c.strokeRect(w * 0.1, ay, w * 0.8, ah);
  if (st.ruined) ruin(c, w, h * 0.78, rng);
};

const blacksmith: Builder = (c, w, h, rng, st) => {
  roof(c, st, 0, 0, w * 0.62, h, rng);
  // open lean-to workshop
  c.fillStyle = '#5b4a38'; c.fillRect(w * 0.62, h * 0.1, w * 0.38, h * 0.8);
  c.strokeStyle = '#3a2c1f'; c.lineWidth = Math.min(w, h) * 0.012;
  for (let x = w * 0.64; x < w; x += w * 0.05) { line(c, x, h * 0.1, x, h * 0.9); c.stroke(); }
  c.strokeStyle = OUT; c.lineWidth = Math.min(w, h) * 0.02; c.strokeRect(w * 0.62, h * 0.1, w * 0.38, h * 0.8);
  // forge + anvil
  c.fillStyle = '#6d655c'; c.fillRect(w * 0.7, h * 0.2, w * 0.18, h * 0.22); c.strokeRect(w * 0.7, h * 0.2, w * 0.18, h * 0.22);
  c.fillStyle = radial(c, w * 0.79, h * 0.31, w * 0.08, [[0, '#ffd27a'], [0.5, '#e0552a'], [1, 'rgba(120,20,10,0.9)']]);
  ellipse(c, w * 0.79, h * 0.31, w * 0.06, h * 0.07); c.fill();
  c.fillStyle = '#3b3b3f';
  poly(c, [[w * 0.72, h * 0.62], [w * 0.9, h * 0.62], [w * 0.88, h * 0.7], [w * 0.74, h * 0.7]]); c.fill(); c.stroke();
  chimney(c, w * 0.5, h * 0.3, Math.min(w, h) * 0.14, st);
};

const warehouse: Builder = (c, w, h, rng, st) => {
  roof(c, st, 0, 0, w, h, rng, st.roofType === 'flat' ? 'flat' : st.roofType === 'curved' ? 'curved' : 'hip');
  if (st.ruined) ruin(c, w, h, rng);
};

const barn: Builder = (c, w, h, rng, st) => {
  const s2 = { ...st, roof: st.id === 'medieval' || st.id === 'rustic' ? '#8a3a2a' : st.roof };
  roof(c, s2, 0, 0, w, h, rng, st.roofType === 'flat' ? 'flat' : st.roofType === 'curved' ? 'curved' : st.roofType === 'thatch' ? 'thatch' : 'gable');
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillRect(w * 0.45, 0, w * 0.1, h * 0.06);
  if (st.ruined) ruin(c, w, h, rng);
};

const towerB: Builder = (c, w, h, rng, st) => {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
  const lw = R * 0.04;
  if (st.roofType === 'flat' || st.id === 'dwarven') {
    ellipse(c, cx, cy, R, R); c.fillStyle = shade(st.wall, 0.05); c.fill(); ink(c, lw, OUT);
    ellipse(c, cx, cy, R * 0.78, R * 0.78); c.fillStyle = shade(st.roof, 0.1); c.fill(); ink(c, lw * 0.6, OUT);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.fillStyle = shade(st.wall, -0.1);
      c.fillRect(cx + Math.cos(a) * R * 0.88 - R * 0.08, cy + Math.sin(a) * R * 0.88 - R * 0.08, R * 0.16, R * 0.16);
    }
    c.fillStyle = '#231a12'; ellipse(c, cx + R * 0.3, cy + R * 0.2, R * 0.12, R * 0.12); c.fill();
    return;
  }
  const seg = 12;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    const lit = Math.cos(mid - Math.PI * 1.25);
    c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, a0, a1); c.closePath();
    c.fillStyle = shade(st.roof, lit * 0.25); c.fill();
    c.strokeStyle = shade(st.roof, -0.45); c.lineWidth = lw * 0.5; c.stroke();
  }
  for (let r = 0.25; r < 1; r += 0.18) { c.beginPath(); c.arc(cx, cy, R * r, 0, Math.PI * 2); c.strokeStyle = shade(st.roof, -0.35); c.lineWidth = lw * 0.4; c.stroke(); }
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); ink(c, lw, OUT);
  c.fillStyle = st.accent; ellipse(c, cx, cy, R * 0.1, R * 0.1); c.fill(); ink(c, lw * 0.5, OUT);
  if (st.ruined) ruin(c, w, h, rng);
};

const cabin: Builder = (c, w, h, rng, st) => {
  const s2 = st.id === 'medieval' || st.id === 'coastal' ? { ...st, shingle: 'wood' as const, roof: '#7a5a3a' } : st;
  roof(c, s2, 0, 0, w, h, rng);
  chimney(c, w * 0.78, h * 0.72, Math.min(w, h) * 0.14, st);
  if (st.ruined) ruin(c, w, h, rng);
};

const BUILDINGS: [id: string, name: string, w: number, h: number, b: Builder, tags: string[]][] = [
  ['house', 'House', 210, 150, house, ['house', 'home']],
  ['house-small', 'Small House', 160, 120, house, ['house', 'cottage']],
  ['cabin', 'Cabin', 150, 115, cabin, ['cabin', 'hut']],
  ['longhouse', 'Longhouse', 380, 140, longhouse, ['longhouse', 'hall']],
  ['tavern', 'Tavern', 300, 220, tavern, ['tavern', 'inn']],
  ['shop', 'Shop', 200, 170, shop, ['shop', 'store', 'market']],
  ['blacksmith', 'Blacksmith', 240, 170, blacksmith, ['blacksmith', 'forge', 'smithy']],
  ['warehouse', 'Warehouse', 330, 200, warehouse, ['warehouse', 'storage']],
  ['barn', 'Barn', 300, 200, barn, ['barn', 'farm']],
  ['tower', 'Tower', 160, 160, towerB, ['tower', 'watchtower']],
];

export function registerBuildingAssets() {
  for (const st of STYLES) {
    for (const [id, name, w, h, b, tags] of BUILDINGS) {
      registerAsset({
        id: `bld/${st.id}/${id}`,
        name: `${name}${st.id === 'ruined' ? ' (Ruined)' : ''}`,
        category: 'Settlement',
        subcategory: st.name,
        style: st.name,
        pack: 'topdown',
        tags: [...tags, st.id, st.name.toLowerCase(), 'building'],
        w, h, role: 'buildings', collision: 'building',
        draw: (c, ww, hh, rng) => b(c, ww, hh, rng, st),
        footprint: 0.95,
      });
    }
  }
}

export const ARCH_STYLES = STYLES.map((s) => ({ id: s.id, name: s.name }));
