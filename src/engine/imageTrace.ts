import type { RGB } from '../core/color';

/**
 * "Trace from image": turn an existing map picture (e.g. an export from
 * another map maker, or a scanned sketch) into editable Inkbound terrain.
 * Pure functions over RGBA pixels so they can be unit tested.
 *
 * Water is found by flood-filling from the image border (plus pixels that
 * closely match the water colour) through "watery" pixels. Dark ink
 * coastlines stop the fill, so coastal glows, grid lines and text over the
 * sea are handled, and land classes (snow, forest, mountains, grass) are
 * estimated from colour.
 */

export const enum Cls { Water = 0, Grass = 1, Snow = 2, Forest = 3, Mountain = 4 }

export interface TraceParams {
  water: RGB;
  /** 0..1 — how different from the water colour a pixel may be and still count as water. */
  tolerance: number;
  /** Remove land blobs smaller than this many pixels (labels, icons over the sea). */
  minIsland: number;
  /** Fill lakes/holes smaller than this many pixels. */
  minLake: number;
}

function hsv(r: number, g: number, b: number) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: mx ? d / mx : 0, v: mx / 255 };
}

/** Most common colour along the image border (quantised) — usually the sea. */
export function autoWaterColor(px: Uint8ClampedArray, w: number, h: number): RGB {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  const add = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const c = counts.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n++; c.r += r; c.g += g; c.b += b;
    counts.set(k, c);
  };
  const step = Math.max(1, Math.floor(Math.min(w, h) / 400));
  for (let x = 0; x < w; x += step) { add(x, 0); add(x, h - 1); add(x, Math.min(h - 1, 3)); add(x, Math.max(0, h - 4)); }
  for (let y = 0; y < h; y += step) { add(0, y); add(w - 1, y); add(Math.min(w - 1, 3), y); add(Math.max(0, w - 4), y); }
  let best = { n: 0, r: 60, g: 90, b: 110 };
  for (const c of counts.values()) if (c.n > best.n) best = c;
  return { r: Math.round(best.r / best.n), g: Math.round(best.g / best.n), b: Math.round(best.b / best.n) };
}

/** Water mask (1 = water) at the image's resolution. */
export function detectWater(px: Uint8ClampedArray, w: number, h: number, p: TraceParams): Uint8Array {
  const n = w * h;
  const wr = p.water.r, wg = p.water.g, wb = p.water.b;
  const whsv = hsv(wr, wg, wb);
  const tol = 16 + p.tolerance * 70;
  const passable = new Uint8Array(n);
  const seed = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const r = px[j], g = px[j + 1], b = px[j + 2];
    const dist = Math.sqrt((r - wr) ** 2 + (g - wg) ** 2 + (b - wb) ** 2);
    const c = hsv(r, g, b);
    // bluish / cyan tints of the water colour (coastal glow, grid lines, ripples)
    const hueNear = Math.abs(((c.h - whsv.h + 540) % 360) - 180) < 30;
    // Tinted like the sea (clearly saturated), or simply very close to the sea colour.
    const minSat = Math.max(0.1, whsv.s * 0.5);
    const watery = (hueNear && c.s > minSat && c.v > 0.22) || (dist < tol && (hueNear || c.s < 0.1));
    // strongly saturated off-palette colours (red titles, markers) don't block the sea
    const decoration = c.s > 0.35 && c.v > 0.3 && (c.h < 22 || c.h > 300) && r > g + 40;
    passable[i] = watery || decoration ? 1 : 0;
    if (dist < tol * 0.5 && hueNear) seed[i] = 1;
  }
  const water = new Uint8Array(n);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!water[i] && passable[i]) { water[i] = 1; stack.push(i); }
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  for (let i = 0; i < n; i++) if (seed[i]) push(i);
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < n - w) push(i + w);
  }
  // Dark ink outlines/labels that sit inside the sea: absorb 1-2px lines touching water on both sides.
  const out = water.slice();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (water[i]) continue;
      if ((water[i - 1] && water[i + 1]) || (water[i - w] && water[i + w])) out[i] = 1;
    }
  }
  removeSmall(out, w, h, 0, p.minIsland);
  removeSmall(out, w, h, 1, p.minLake);
  return out;
}

/** Flip connected components of `value` smaller than `minSize` pixels. */
export function removeSmall(mask: Uint8Array, w: number, h: number, value: 0 | 1, minSize: number) {
  if (minSize <= 0) return;
  const n = w * h;
  const seen = new Uint8Array(n);
  const comp: number[] = [];
  for (let s = 0; s < n; s++) {
    if (seen[s] || mask[s] !== value) continue;
    comp.length = 0;
    const stack = [s];
    seen[s] = 1;
    let touchesBorder = false;
    while (stack.length) {
      const i = stack.pop()!;
      comp.push(i);
      const x = i % w, y = (i / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder = true;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb) if (j >= 0 && !seen[j] && mask[j] === value) { seen[j] = 1; stack.push(j); }
    }
    // Lakes touching the border are really the sea; never fill those.
    if (comp.length < minSize && !(value === 1 && touchesBorder)) for (const i of comp) mask[i] = value ? 0 : 1;
  }
}

/** Per-pixel land class from colour (water pixels keep Cls.Water). */
export function classifyLand(px: Uint8ClampedArray, water: Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h;
  const cls = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    if (water[i]) { cls[i] = Cls.Water; continue; }
    const c = hsv(px[j], px[j + 1], px[j + 2]);
    if (c.v > 0.72 && c.s < 0.16) cls[i] = Cls.Snow;
    else if (c.h >= 38 && c.h <= 170 && c.v < 0.38 && c.s > 0.28) cls[i] = Cls.Forest;
    else if (c.h >= 5 && c.h <= 42 && c.s > 0.2 && c.s < 0.7 && c.v > 0.4) cls[i] = Cls.Mountain;
    else cls[i] = Cls.Grass;
  }
  return cls;
}

/** Fraction of each class inside `cell`×`cell` blocks. Returns one grid per class. */
export function zoneDensity(cls: Uint8Array, w: number, h: number, cell: number) {
  const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
  const grids = [0, 1, 2, 3, 4].map(() => new Float32Array(gw * gh));
  const totals = new Float32Array(gw * gh);
  for (let y = 0; y < h; y++) {
    const gy = (y / cell) | 0;
    for (let x = 0; x < w; x++) {
      const g = gy * gw + ((x / cell) | 0);
      grids[cls[y * w + x]][g]++;
      totals[g]++;
    }
  }
  for (const grid of grids) for (let i = 0; i < grid.length; i++) grid[i] /= totals[i] || 1;
  return { gw, gh, water: grids[0], grass: grids[1], snow: grids[2], forest: grids[3], mountain: grids[4] };
}

/** Soften a binary mask into 0..255 alpha (box blur) so coastlines vectorise smoothly. */
export function softenMask(mask: Uint8Array, w: number, h: number, invert: boolean, radius = 1): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          s += mask[yy * w + xx]; c++;
        }
      }
      const v = s / c;
      out[y * w + x] = Math.round((invert ? 1 - v : v) * 255);
    }
  }
  return out;
}
