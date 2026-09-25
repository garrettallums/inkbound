import { makeCanvas, ctx2d } from '../core/canvas';
import type { Rect } from '../core/geom';
import { getNoise } from '../core/noise';
import { mulberry32 } from '../core/rng';
import type { StartTerrain } from '../model/defaults';

/**
 * The editable land/water mask (spec §16–17). Stored as a Uint8 field at a
 * reduced resolution (`scale` mask pixels per world unit). Brush operations
 * modify the field directly; undo works on 128px tile snapshots so a stroke
 * only stores what it touched.
 */

const TILE = 128;

export interface MaskPatch {
  kind: 'mask';
  tiles: { tx: number; ty: number; before: Uint8Array; after: Uint8Array }[];
}

export type TerrainOp = 'add' | 'remove' | 'smooth' | 'roughen' | 'expand' | 'contract';

export class TerrainMask {
  readonly w: number;
  readonly h: number;
  readonly scale: number;
  data: Uint8Array;
  /** Canvas mirror of the field (white, alpha = land) used for previews and saving. */
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private noiseField: Uint8Array | null = null;
  private noiseW = 0;
  private noiseH = 0;
  private editTiles: Map<number, Uint8Array> | null = null;
  private pendingSync: Rect | null = null;
  version = 0;
  seed: number;

  constructor(worldW: number, worldH: number, scale: number, seed: number) {
    this.scale = scale;
    this.w = Math.max(1, Math.round(worldW * scale));
    this.h = Math.max(1, Math.round(worldH * scale));
    this.data = new Uint8Array(this.w * this.h);
    this.canvas = makeCanvas(this.w, this.h);
    this.ctx = ctx2d(this.canvas, { willReadFrequently: true });
    this.seed = seed;
  }

  // ---------------------------------------------------------------- sync

  /** Push the Uint8 field to the canvas mirror for a region (mask px). */
  syncCanvas(r: Rect = { x: 0, y: 0, w: this.w, h: this.h }) {
    const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
    const x1 = Math.min(this.w, Math.ceil(r.x + r.w)), y1 = Math.min(this.h, Math.ceil(r.y + r.h));
    if (x1 <= x0 || y1 <= y0) return;
    const img = this.ctx.createImageData(x1 - x0, y1 - y0);
    const d = img.data;
    let k = 0;
    for (let y = y0; y < y1; y++) {
      let i = y * this.w + x0;
      for (let x = x0; x < x1; x++, i++, k += 4) {
        d[k] = 255; d[k + 1] = 255; d[k + 2] = 255; d[k + 3] = this.data[i];
      }
    }
    this.ctx.putImageData(img, x0, y0);
  }

  markDirty(r: Rect) {
    this.version++;
    const p = this.pendingSync;
    this.pendingSync = p
      ? { x: Math.min(p.x, r.x), y: Math.min(p.y, r.y), w: Math.max(p.x + p.w, r.x + r.w) - Math.min(p.x, r.x), h: Math.max(p.y + p.h, r.y + r.h) - Math.min(p.y, r.y) }
      : { ...r };
  }

  flush() {
    if (this.pendingSync) {
      this.syncCanvas(this.pendingSync);
      this.pendingSync = null;
    }
  }

  loadFromCanvas(src: CanvasImageSource) {
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.ctx.drawImage(src, 0, 0, this.w, this.h);
    const px = this.ctx.getImageData(0, 0, this.w, this.h).data;
    for (let i = 0; i < this.data.length; i++) this.data[i] = px[i * 4 + 3];
    this.syncCanvas();
    this.version++;
  }

  /** Value at world coordinates (0..255, bilinear). */
  sample(wx: number, wy: number): number {
    const x = wx * this.scale - 0.5, y = wy * this.scale - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const g = (xx: number, yy: number) => {
      if (xx < 0) xx = 0; else if (xx >= this.w) xx = this.w - 1;
      if (yy < 0) yy = 0; else if (yy >= this.h) yy = this.h - 1;
      return this.data[yy * this.w + xx];
    };
    const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * fx;
    const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  }

  isLand(wx: number, wy: number) {
    return this.sample(wx, wy) >= 128;
  }

  /** Distance (world units, capped) to the nearest coastline, sampled on a ring. */
  nearShore(wx: number, wy: number, radius: number): boolean {
    const here = this.isLand(wx, wy);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (this.isLand(wx + Math.cos(a) * radius, wy + Math.sin(a) * radius) !== here) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- undo snapshots

  beginEdit() {
    this.editTiles = new Map();
  }

  private touch(x0: number, y0: number, x1: number, y1: number) {
    if (!this.editTiles) return;
    const tx0 = Math.max(0, Math.floor(x0 / TILE)), ty0 = Math.max(0, Math.floor(y0 / TILE));
    const tx1 = Math.min(Math.ceil(this.w / TILE) - 1, Math.floor(x1 / TILE)), ty1 = Math.min(Math.ceil(this.h / TILE) - 1, Math.floor(y1 / TILE));
    const cols = Math.ceil(this.w / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = ty * cols + tx;
        if (!this.editTiles.has(key)) this.editTiles.set(key, this.readTile(tx, ty));
      }
    }
  }

  private readTile(tx: number, ty: number): Uint8Array {
    const x0 = tx * TILE, y0 = ty * TILE;
    const w = Math.min(TILE, this.w - x0), h = Math.min(TILE, this.h - y0);
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) out.set(this.data.subarray((y0 + y) * this.w + x0, (y0 + y) * this.w + x0 + w), y * w);
    return out;
  }

  private writeTile(tx: number, ty: number, src: Uint8Array) {
    const x0 = tx * TILE, y0 = ty * TILE;
    const w = Math.min(TILE, this.w - x0), h = Math.min(TILE, this.h - y0);
    for (let y = 0; y < h; y++) this.data.set(src.subarray(y * w, y * w + w), (y0 + y) * this.w + x0);
    this.markDirty({ x: x0, y: y0, w, h });
  }

  endEdit(): MaskPatch | null {
    const tiles = this.editTiles;
    this.editTiles = null;
    if (!tiles || tiles.size === 0) return null;
    const cols = Math.ceil(this.w / TILE);
    const out: MaskPatch = { kind: 'mask', tiles: [] };
    for (const [key, before] of tiles) {
      const tx = key % cols, ty = Math.floor(key / cols);
      const after = this.readTile(tx, ty);
      let same = true;
      for (let i = 0; i < after.length; i++) if (after[i] !== before[i]) { same = false; break; }
      if (!same) out.tiles.push({ tx, ty, before, after });
    }
    return out.tiles.length ? out : null;
  }

  applyPatch(p: MaskPatch, which: 'before' | 'after'): Rect | null {
    let r: Rect | null = null;
    for (const t of p.tiles) {
      this.writeTile(t.tx, t.ty, t[which]);
      const tr = { x: t.tx * TILE / this.scale, y: t.ty * TILE / this.scale, w: TILE / this.scale, h: TILE / this.scale };
      r = r ? { x: Math.min(r.x, tr.x), y: Math.min(r.y, tr.y), w: Math.max(r.x + r.w, tr.x + tr.w) - Math.min(r.x, tr.x), h: Math.max(r.y + r.h, tr.y + tr.h) - Math.min(r.y, tr.y) } : tr;
    }
    return r;
  }

  // ---------------------------------------------------------------- noise field

  private ensureNoise() {
    if (this.noiseField) return;
    const k = 2;
    const nw = Math.ceil(this.w / k) + 2, nh = Math.ceil(this.h / k) + 2;
    const f = new Uint8Array(nw * nh);
    const n = getNoise(this.seed);
    // Feature size ≈ 90 world units at the base octave.
    const freq = 1 / (90 * this.scale / k);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const v = n.fbm(x * freq, y * freq, 5, 0, 2.1, 0.55);
        f[y * nw + x] = Math.max(0, Math.min(255, 128 + v * 150));
      }
    }
    this.noiseField = f;
    this.noiseW = nw;
    this.noiseH = nh;
  }

  /** Noise 0..1 at mask pixel coordinates. */
  noiseAt(x: number, y: number): number {
    this.ensureNoise();
    const nx = x / 2, ny = y / 2;
    const x0 = Math.floor(nx), y0 = Math.floor(ny);
    const fx = nx - x0, fy = ny - y0;
    const W = this.noiseW;
    const i = Math.min(this.noiseH - 2, Math.max(0, y0)) * W + Math.min(W - 2, Math.max(0, x0));
    const f = this.noiseField!;
    const a = f[i] + (f[i + 1] - f[i]) * fx;
    const b = f[i + W] + (f[i + W + 1] - f[i + W]) * fx;
    return (a + (b - a) * fy) / 255;
  }

  // ---------------------------------------------------------------- brush ops

  /**
   * Apply a brush dab at world position. `strength` 0..1; `roughness` 0..1
   * perturbs the edge with a world-anchored noise field so consecutive dabs
   * form one coherent organic coastline rather than overlapping circles.
   */
  dab(op: TerrainOp, wx: number, wy: number, radiusWorld: number, roughness: number, strength = 1, hardness = 0.7) {
    const cx = wx * this.scale, cy = wy * this.scale;
    const r = Math.max(1, radiusWorld * this.scale);
    const reach = r * (1 + roughness * 0.5) + 2;
    const x0 = Math.max(0, Math.floor(cx - reach)), y0 = Math.max(0, Math.floor(cy - reach));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + reach)), y1 = Math.min(this.h - 1, Math.ceil(cy + reach));
    if (x1 < x0 || y1 < y0) return;
    this.touch(x0, y0, x1, y1);
    const soft = Math.max(1.2, r * (1 - hardness) * 0.5);
    const d = this.data;
    const W = this.w;
    if (op === 'add' || op === 'remove') {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > reach) continue;
          const n = roughness > 0 ? this.noiseAt(x, y) - 0.5 : 0;
          const edge = r * (1 + n * roughness * 0.9);
          let v = (edge - dist) / soft;
          if (v <= 0) continue;
          if (v > 1) v = 1;
          v *= strength;
          const i = y * W + x;
          if (op === 'add') {
            const t = 255 * v;
            if (t > d[i]) d[i] = t;
          } else {
            const t = 255 * (1 - v);
            if (t < d[i]) d[i] = t;
          }
        }
      }
    } else if (op === 'smooth') {
      this.boxFilter(x0, y0, x1, y1, cx, cy, r, Math.max(1, Math.round(r * 0.08)), 'blur', strength);
    } else if (op === 'expand' || op === 'contract') {
      this.boxFilter(x0, y0, x1, y1, cx, cy, r, Math.max(1, Math.round(r * 0.03)), op === 'expand' ? 'max' : 'min', strength);
    } else if (op === 'roughen') {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > r) continue;
          const i = y * W + x;
          const cur = d[i];
          if (cur < 8 || cur > 247) {
            // Only near edges: check neighbours
            const nb = (xx: number, yy: number) => d[Math.min(this.h - 1, Math.max(0, yy)) * W + Math.min(W - 1, Math.max(0, xx))];
            const k = 3;
            const edge = Math.abs(nb(x - k, y) - nb(x + k, y)) + Math.abs(nb(x, y - k) - nb(x, y + k));
            if (edge < 60) continue;
          }
          const fall = 1 - dist / r;
          const n = this.noiseAt(x * 3.1, y * 3.1) - 0.5;
          d[i] = Math.max(0, Math.min(255, cur + n * 180 * strength * fall));
        }
      }
    }
    this.markDirty({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }

  private boxFilter(x0: number, y0: number, x1: number, y1: number, cx: number, cy: number, r: number, k: number, mode: 'blur' | 'max' | 'min', strength: number) {
    const W = this.w;
    const d = this.data;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const src = new Float32Array(bw * bh);
    const get = (x: number, y: number) => d[Math.min(this.h - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
    // Horizontal pass
    const tmp = new Float32Array(bw * bh);
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        let acc = mode === 'min' ? 255 : 0;
        for (let o = -k; o <= k; o++) {
          const v = get(x0 + x + o, y0 + y);
          if (mode === 'blur') acc += v; else if (mode === 'max') { if (v > acc) acc = v; } else if (v < acc) acc = v;
        }
        tmp[y * bw + x] = mode === 'blur' ? acc / (2 * k + 1) : acc;
      }
    }
    const tget = (x: number, y: number) => tmp[Math.min(bh - 1, Math.max(0, y)) * bw + Math.min(bw - 1, Math.max(0, x))];
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        let acc = mode === 'min' ? 255 : 0;
        for (let o = -k; o <= k; o++) {
          const v = tget(x, y + o);
          if (mode === 'blur') acc += v; else if (mode === 'max') { if (v > acc) acc = v; } else if (v < acc) acc = v;
        }
        src[y * bw + x] = mode === 'blur' ? acc / (2 * k + 1) : acc;
      }
    }
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const dx = x0 + x + 0.5 - cx, dy = y0 + y + 0.5 - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > r) continue;
        const f = Math.min(1, (1 - dist / r) * 2) * strength;
        const i = (y0 + y) * W + x0 + x;
        d[i] = d[i] + (src[y * bw + x] - d[i]) * f;
      }
    }
  }

  /** Flood-fill the connected land or water region under a point. Returns true if anything changed. */
  floodFill(wx: number, wy: number, toLand: boolean): boolean {
    const sx = Math.floor(wx * this.scale), sy = Math.floor(wy * this.scale);
    if (sx < 0 || sy < 0 || sx >= this.w || sy >= this.h) return false;
    const W = this.w, H = this.h, d = this.data;
    const startLand = d[sy * W + sx] >= 128;
    if (startLand === toLand) return false;
    const target = toLand ? 255 : 0;
    const seen = new Uint8Array(W * H);
    const stack = [sx, sy];
    let minX = sx, maxX = sx, minY = sy, maxY = sy;
    const match = (i: number) => !seen[i] && (d[i] >= 128) === startLand;
    const touched: number[] = [];
    while (stack.length) {
      const y = stack.pop()!, x0 = stack.pop()!;
      let x = x0;
      while (x > 0 && match(y * W + x - 1)) x--;
      let upOpen = false, downOpen = false;
      for (; x < W && match(y * W + x); x++) {
        const i = y * W + x;
        seen[i] = 1;
        touched.push(i);
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (y > 0) { const m = match(i - W); if (m && !upOpen) { stack.push(x, y - 1); upOpen = true; } else if (!m) upOpen = false; }
        if (y < H - 1) { const m = match(i + W); if (m && !downOpen) { stack.push(x, y + 1); downOpen = true; } else if (!m) downOpen = false; }
      }
    }
    // Also absorb the anti-aliased rim so the fill meets the existing coast cleanly.
    this.touch(minX - 2, minY - 2, maxX + 2, maxY + 2);
    for (const i of touched) d[i] = target;
    this.markDirty({ x: minX - 1, y: minY - 1, w: maxX - minX + 3, h: maxY - minY + 3 });
    return true;
  }

  /** Replace the whole field (undoable when inside beginEdit/endEdit). */
  replaceAll(src: Uint8Array) {
    this.touch(0, 0, this.w, this.h);
    this.data.set(src.subarray(0, this.data.length));
    this.markDirty({ x: 0, y: 0, w: this.w, h: this.h });
  }

  fillAll(value: number) {
    this.touch(0, 0, this.w, this.h);
    this.data.fill(value);
    this.markDirty({ x: 0, y: 0, w: this.w, h: this.h });
  }

  /** Procedural starting terrain (seeded, optional — spec §3 "assist, don't author"). */
  generate(kind: StartTerrain) {
    const W = this.w, H = this.h, d = this.data;
    const n = getNoise(this.seed + 101);
    const rng = mulberry32(this.seed);
    const feature = 1 / Math.max(W, H);
    if (kind === 'water') d.fill(0);
    else if (kind === 'land') d.fill(255);
    else if (kind === 'landmass' || kind === 'islands' || kind === 'lake' || kind === 'river-valley') {
      const blobs: { x: number; y: number; r: number }[] = [];
      if (kind === 'landmass') blobs.push({ x: W * 0.5, y: H * 0.52, r: Math.min(W, H) * 0.52 });
      if (kind === 'islands') {
        blobs.push({ x: W * (0.3 + rng() * 0.12), y: H * (0.45 + rng() * 0.1), r: Math.min(W, H) * 0.34 });
        blobs.push({ x: W * (0.7 + rng() * 0.08), y: H * (0.4 + rng() * 0.2), r: Math.min(W, H) * 0.26 });
        for (let i = 0; i < 4; i++) blobs.push({ x: W * rng(), y: H * rng(), r: Math.min(W, H) * (0.05 + rng() * 0.07) });
      }
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let v: number;
          if (kind === 'lake' || kind === 'river-valley') {
            const dx = (x - W / 2) / (W * 0.22), dy = (y - H / 2) / (H * 0.22);
            v = Math.sqrt(dx * dx + dy * dy) - 1 + n.fbm(x * feature * 4, y * feature * 4, 5) * 0.8;
            v = -v;
            v = v > 0 ? 0 : 1;
          } else {
            let best = -1;
            for (const b of blobs) {
              const dx = (x - b.x) / b.r, dy = (y - b.y) / b.r;
              const f = 1 - Math.sqrt(dx * dx + dy * dy);
              if (f > best) best = f;
            }
            v = best + n.fbm(x * feature * 3.2, y * feature * 3.2, 6, 0, 2.05, 0.52) * 0.55;
            v = v > 0.08 ? 1 : 0;
          }
          d[y * W + x] = v ? 255 : 0;
        }
      }
    } else if (kind === 'cavern') {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const dx = (x - W / 2) / (W * 0.48), dy = (y - H / 2) / (H * 0.48);
          const edge = Math.sqrt(dx * dx + dy * dy);
          const v = n.fbm(x * feature * 5, y * feature * 5, 5) * 0.9 + 0.35 - edge * edge * 0.7;
          d[y * W + x] = v > 0 ? 255 : 0;
        }
      }
    } else if (kind === 'rooms') {
      d.fill(0);
      const cell = Math.round(70 * this.scale);
      const rooms: Rect[] = [];
      const cols = Math.floor(W / cell), rows = Math.floor(H / cell);
      for (let i = 0; i < 40 && rooms.length < 7; i++) {
        const rw = 3 + Math.floor(rng() * 5), rh = 3 + Math.floor(rng() * 4);
        const rx = 1 + Math.floor(rng() * Math.max(1, cols - rw - 2)), ry = 1 + Math.floor(rng() * Math.max(1, rows - rh - 2));
        const r = { x: rx, y: ry, w: rw, h: rh };
        if (rooms.some((o) => r.x < o.x + o.w + 1 && r.x + r.w + 1 > o.x && r.y < o.y + o.h + 1 && r.y + r.h + 1 > o.y)) continue;
        rooms.push(r);
      }
      const carve = (x: number, y: number, w: number, h: number) => {
        for (let yy = y * cell; yy < (y + h) * cell && yy < H; yy++) for (let xx = x * cell; xx < (x + w) * cell && xx < W; xx++) d[yy * W + xx] = 255;
      };
      rooms.sort((a, b) => a.x - b.x);
      rooms.forEach((r, i) => {
        carve(r.x, r.y, r.w, r.h);
        if (i > 0) {
          const a = rooms[i - 1];
          const ax = a.x + Math.floor(a.w / 2), ay = a.y + Math.floor(a.h / 2), bx = r.x + Math.floor(r.w / 2), by = r.y + Math.floor(r.h / 2);
          carve(Math.min(ax, bx), ay, Math.abs(bx - ax) + 1, 1);
          carve(bx, Math.min(ay, by), 1, Math.abs(by - ay) + 1);
        }
      });
    }
    this.syncCanvas();
    this.version++;
  }
}
