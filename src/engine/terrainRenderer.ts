import { makeCanvas, ctx2d } from '../core/canvas';
import { rgba } from '../core/color';
import { rectsIntersect, type Rect } from '../core/geom';
import { getNoise } from '../core/noise';
import type { TerrainTheme } from '../model/types';
import { buildCoastline } from './contour';
import type { TerrainMask } from './terrainMask';
import { texturePattern } from './textures';

/**
 * Renders the land/water layer. The coastline is vectorised from the mask
 * (marching squares in a worker) so it stays crisp at any zoom and export
 * scale. Rendered output is cached in 256px tiles per power-of-two zoom level
 * (spec §57–59) and invalidated by region when the mask or theme changes.
 */

interface Chunk { path: Path2D; bbox: Rect }

const TILE = 256;

let worker: Worker | null = null;
let workerFailed = false;
let reqId = 0;
const pending = new Map<number, (rings: Float32Array[]) => void>();

function getWorker(): Worker | null {
  if (worker || workerFailed) return worker;
  try {
    worker = new Worker(new URL('./contour.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; rings: Float32Array[] }>) => {
      const cb = pending.get(e.data.id);
      pending.delete(e.data.id);
      cb?.(e.data.rings);
    };
    worker.onerror = () => {
      workerFailed = true;
      worker = null;
    };
  } catch {
    workerFailed = true;
  }
  return worker;
}

function hatchPattern(ctx: CanvasRenderingContext2D, color: string): CanvasPattern {
  const c = makeCanvas(24, 24);
  const x = ctx2d(c);
  x.strokeStyle = color;
  x.lineWidth = 1.6;
  for (let i = -24; i < 48; i += 6) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + 24, 24);
    x.stroke();
  }
  return ctx.createPattern(c, 'repeat')!;
}

export class TerrainRenderer {
  private mask: TerrainMask;
  theme: TerrainTheme;
  readonly worldW: number;
  readonly worldH: number;
  private fill: Path2D = new Path2D();
  private chunks: Chunk[] = [];
  private hasContours = false;
  private contourVersion = -1;
  private building = false;
  private rebuildQueued = false;
  /** Region edited since the last contour build (world units) — drawn from the raw mask meanwhile. */
  private dirty: Rect | null = null;
  private tiles = new Map<string, HTMLCanvasElement>();
  private tileOrder: string[] = [];
  private overview: HTMLCanvasElement | null = null;
  private overviewScale = 1;
  private macro: HTMLCanvasElement | null = null;
  private temp: HTMLCanvasElement = makeCanvas(TILE, TILE);
  onChange: (() => void) | null = null;
  version = 0;

  constructor(mask: TerrainMask, theme: TerrainTheme, worldW: number, worldH: number) {
    this.mask = mask;
    this.theme = theme;
    this.worldW = worldW;
    this.worldH = worldH;
  }

  get ready() {
    return this.hasContours;
  }

  setTheme(theme: TerrainTheme) {
    this.theme = theme;
    this.invalidateAll();
  }

  /** Called after mask edits (world rect). */
  markEdited(r: Rect) {
    this.dirty = this.dirty ? unionRect(this.dirty, r) : { ...r };
    this.invalidate(r);
  }

  /** Rebuild contours asynchronously. */
  rebuild(sync = false) {
    if (this.building) {
      this.rebuildQueued = true;
      return;
    }
    this.mask.flush();
    const version = this.mask.version;
    const smooth = this.theme.coastStyle !== 'dungeon';
    const done = (rings: Float32Array[]) => {
      this.building = false;
      this.applyRings(rings);
      this.contourVersion = version;
      if (this.mask.version === version) this.dirty = null;
      else this.dirty = this.dirty ?? null;
      this.invalidateAll();
      this.onChange?.();
      if (this.rebuildQueued || this.mask.version !== version) {
        this.rebuildQueued = false;
        this.rebuild();
      }
    };
    const w = sync ? null : getWorker();
    this.building = true;
    if (w) {
      const id = ++reqId;
      pending.set(id, done);
      w.postMessage({ id, data: this.mask.data.slice(), w: this.mask.w, h: this.mask.h, scale: this.mask.scale, smooth });
    } else {
      done(buildCoastline(this.mask.data, this.mask.w, this.mask.h, this.mask.scale, smooth));
    }
  }

  get upToDate() {
    return this.contourVersion === this.mask.version && !this.building;
  }

  /** Wait until the vector coastline reflects the latest mask (used before export). */
  async ensureFresh(): Promise<void> {
    this.mask.flush();
    if (this.upToDate && !this.dirty) return;
    if (!this.building) this.rebuild();
    const t0 = performance.now();
    while (!this.upToDate && performance.now() - t0 < 6000) await new Promise((r) => setTimeout(r, 40));
    if (!this.upToDate) {
      this.building = false;
      this.rebuildQueued = false;
      this.rebuild(true);
    }
    this.dirty = null;
  }

  private applyRings(rings: Float32Array[]) {
    const fill = new Path2D();
    const chunks: Chunk[] = [];
    const W = this.worldW, H = this.worldH;
    const tol = 1.5 / this.mask.scale;
    const onBorder = (x: number, y: number) => x <= tol || y <= tol || x >= W - tol || y >= H - tol;
    for (const r of rings) {
      const n = r.length / 2;
      fill.moveTo(r[0], r[1]);
      for (let i = 1; i < n; i++) fill.lineTo(r[i * 2], r[i * 2 + 1]);
      fill.closePath();
      // stroke chunks skip segments that run along the map border
      let cur: Path2D | null = null;
      let bb: Rect | null = null;
      let count = 0;
      const flush = () => {
        if (cur && bb && count > 1) chunks.push({ path: cur, bbox: bb });
        cur = null; bb = null; count = 0;
      };
      for (let i = 0; i <= n; i++) {
        const a = i % n, b = (i + 1) % n;
        const ax = r[a * 2], ay = r[a * 2 + 1], bx = r[b * 2], by = r[b * 2 + 1];
        if (onBorder(ax, ay) && onBorder(bx, by)) { flush(); continue; }
        if (!cur) { cur = new Path2D(); cur.moveTo(ax, ay); bb = { x: ax, y: ay, w: 0, h: 0 }; count = 1; }
        cur.lineTo(bx, by);
        count++;
        bb = unionRect(bb!, { x: bx, y: by, w: 0, h: 0 });
        if (count > 96) { flush(); cur = new Path2D(); cur.moveTo(bx, by); bb = { x: bx, y: by, w: 0, h: 0 }; count = 1; }
      }
      flush();
    }
    this.fill = fill;
    this.chunks = chunks;
    this.hasContours = true;
    this.version++;
  }

  invalidate(r: Rect) {
    const pad = Math.max(this.theme.glowWidth, this.theme.shoreWidth, this.theme.ripples * this.rippleSpacing() + 4, 40) + 20;
    const rr = { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
    for (const key of [...this.tiles.keys()]) {
      const [lv, tx, ty] = key.split(':').map(Number);
      const s = Math.pow(2, lv);
      const size = TILE / s;
      if (rectsIntersect(rr, { x: tx * size, y: ty * size, w: size, h: size })) this.tiles.delete(key);
    }
    this.overview = null;
    this.version++;
  }

  invalidateAll() {
    this.tiles.clear();
    this.tileOrder = [];
    this.overview = null;
    this.version++;
  }

  private rippleSpacing() {
    return this.theme.coastStyle === 'ink' ? Math.max(5, this.theme.outlineWidth * 2.6) : Math.max(6, this.theme.glowWidth * 0.45);
  }

  // ---------------------------------------------------------------- core drawing

  private getMacro(): HTMLCanvasElement {
    if (this.macro) return this.macro;
    const w = Math.max(8, Math.ceil(this.worldW / 48)), h = Math.max(8, Math.ceil(this.worldH / 48));
    const c = makeCanvas(w, h);
    const x = ctx2d(c);
    const img = x.createImageData(w, h);
    const n = getNoise(this.mask.seed + 77);
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const v = n.fbm(xx / 14, yy / 14, 4) * 0.5 + 0.5;
        const i = (yy * w + xx) * 4;
        const g = v * 255;
        img.data[i] = g; img.data[i + 1] = g; img.data[i + 2] = g; img.data[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    this.macro = c;
    return c;
  }

  /** Draw the terrain for world rect `r` into ctx whose transform is already world → device. */
  drawRegion(ctx: CanvasRenderingContext2D, r: Rect, pxPerUnit: number) {
    const t = this.theme;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    // 1. water
    ctx.fillStyle = texturePattern(ctx, t.waterTexture, t.textureScale);
    ctx.fillRect(r.x, r.y, r.w, r.h);
    const usePreview = !this.hasContours || (this.dirty && rectsIntersect(this.dirty, r));
    if (usePreview) {
      this.drawPreviewLand(ctx, r, pxPerUnit);
      this.drawMacro(ctx, r);
      ctx.restore();
      return;
    }
    const margin = Math.max(t.glowWidth, t.shoreWidth, t.ripples * this.rippleSpacing(), t.outlineWidth * 6) + 8;
    const vis = { x: r.x - margin, y: r.y - margin, w: r.w + margin * 2, h: r.h + margin * 2 };
    const chunks = this.chunks.filter((c) => rectsIntersect(c.bbox, vis));
    const strokeAll = (width: number, style: string | CanvasPattern, alpha = 1) => {
      if (width <= 0) return;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.strokeStyle = style;
      for (const c of chunks) ctx.stroke(c.path);
      ctx.globalAlpha = 1;
    };
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const waterPat = texturePattern(ctx, t.waterTexture, t.textureScale);
    // 2. hatching band (dungeons)
    if (t.coastStyle === 'dungeon') {
      strokeAll(t.glowWidth * 2, hatchPattern(ctx, rgba(t.outlineColor, 0.55)), 1);
    }
    // 3. ripples
    if (t.ripples > 0) {
      const sp = this.rippleSpacing();
      const lw = t.coastStyle === 'ink' ? Math.max(0.8, t.outlineWidth * 0.45) : Math.max(0.8, sp * 0.18);
      for (let k = t.ripples; k >= 1; k--) {
        const d = sp * k + (t.coastStyle === 'ink' ? t.outlineWidth : t.glowWidth * 0.3);
        strokeAll(d * 2 + lw, t.rippleColor, t.coastStyle === 'ink' ? 0.85 - k * 0.15 : 0.55 - k * 0.12);
        strokeAll(d * 2 - lw, waterPat, 1);
      }
    }
    // 4. glow / shallows / dark void falloff (fake blur via layered strokes)
    if (t.glowWidth > 0) {
      const steps = 5;
      for (let i = steps; i >= 1; i--) {
        const f = i / steps;
        strokeAll(t.glowWidth * 2 * f, t.glowColor, (t.coastStyle === 'cave' || t.coastStyle === 'dungeon' ? 0.22 : 0.18) * (1.2 - f * 0.6));
      }
    }
    // 5. shore band
    if (t.shoreTexture && t.shoreWidth > 0) {
      const pat = texturePattern(ctx, t.shoreTexture, t.textureScale);
      strokeAll(t.shoreWidth * 2, pat, 0.9);
      strokeAll(t.shoreWidth * 1.3, pat, 1);
    }
    // 6. land
    ctx.fillStyle = texturePattern(ctx, t.landTexture, t.textureScale);
    ctx.fill(this.fill, 'nonzero');
    // 7. inner shading along the coast (clipped to land)
    if (t.innerShade > 0) {
      ctx.save();
      ctx.clip(this.fill, 'nonzero');
      const w0 = t.coastStyle === 'cave' || t.coastStyle === 'dungeon' ? Math.max(14, t.glowWidth * 0.8) : 16;
      for (let i = 4; i >= 1; i--) strokeAll(w0 * 2 * (i / 4), '#000000', t.innerShade * 0.09 * (1.4 - i / 4));
      if (t.shoreTexture && t.shoreWidth > 0) {
        const pat = texturePattern(ctx, t.shoreTexture, t.textureScale);
        for (let i = 3; i >= 1; i--) strokeAll(t.shoreWidth * (i / 3) * 1.2, pat, 0.35);
      }
      ctx.restore();
    }
    this.drawMacro(ctx, r);
    // 8. outline
    if (t.outlineWidth > 0) {
      strokeAll(t.outlineWidth, t.outlineColor, 1);
      if (t.coastStyle === 'painted') strokeAll(t.outlineWidth * 0.35, rgba('#ffffff', 0.15), 1);
    }
    ctx.restore();
  }

  private drawMacro(ctx: CanvasRenderingContext2D, r: Rect) {
    // Low-frequency tonal variation breaks up texture repetition over big maps.
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.35;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.getMacro(), 0, 0, this.worldW, this.worldH);
    ctx.restore();
    void r;
  }

  private drawPreviewLand(ctx: CanvasRenderingContext2D, r: Rect, pxPerUnit: number) {
    this.mask.flush();
    const t = this.theme;
    // Render land through the mask into a temp canvas sized to the region in device px.
    const dw = Math.ceil(r.w * pxPerUnit), dh = Math.ceil(r.h * pxPerUnit);
    if (dw <= 0 || dh <= 0) return;
    if (this.temp.width < dw || this.temp.height < dh) {
      this.temp.width = Math.max(this.temp.width, dw);
      this.temp.height = Math.max(this.temp.height, dh);
    }
    const tc = ctx2d(this.temp);
    tc.save();
    tc.setTransform(1, 0, 0, 1, 0, 0);
    tc.clearRect(0, 0, dw, dh);
    tc.setTransform(pxPerUnit, 0, 0, pxPerUnit, -r.x * pxPerUnit, -r.y * pxPerUnit);
    tc.imageSmoothingEnabled = true;
    const ms = this.mask.scale;
    tc.drawImage(this.mask.canvas, 0, 0, this.mask.w / ms, this.mask.h / ms);
    tc.globalCompositeOperation = 'source-in';
    tc.fillStyle = texturePattern(tc, t.landTexture, t.textureScale);
    tc.fillRect(r.x, r.y, r.w, r.h);
    tc.restore();
    ctx.drawImage(this.temp, 0, 0, dw, dh, r.x, r.y, dw / pxPerUnit, dh / pxPerUnit);
  }

  // ---------------------------------------------------------------- tile cache

  private renderTile(level: number, tx: number, ty: number): HTMLCanvasElement {
    const s = Math.pow(2, level);
    const size = TILE / s;
    const c = makeCanvas(TILE, TILE);
    const ctx = ctx2d(c);
    ctx.setTransform(s, 0, 0, s, -tx * size * s, -ty * size * s);
    this.drawRegion(ctx, { x: tx * size, y: ty * size, w: size, h: size }, s);
    return c;
  }

  private getOverview(): HTMLCanvasElement {
    if (this.overview) return this.overview;
    const s = Math.min(1, 1536 / Math.max(this.worldW, this.worldH));
    const c = makeCanvas(this.worldW * s, this.worldH * s);
    const ctx = ctx2d(c);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    this.drawRegion(ctx, { x: 0, y: 0, w: this.worldW, h: this.worldH }, s);
    this.overview = c;
    this.overviewScale = s;
    return c;
  }

  /**
   * Draw the visible part of the terrain using cached tiles. `ctx` must be in
   * world coordinates; `pxPerUnit` is the device-pixel zoom. Returns false if
   * some tiles are still pending (caller should schedule another frame).
   */
  drawCached(ctx: CanvasRenderingContext2D, view: Rect, pxPerUnit: number, budgetMs = 10): boolean {
    const level = Math.max(-6, Math.min(3, Math.ceil(Math.log2(pxPerUnit) - 0.001)));
    const s = Math.pow(2, level);
    const size = TILE / s;
    const vx0 = Math.max(0, view.x), vy0 = Math.max(0, view.y);
    const vx1 = Math.min(this.worldW, view.x + view.w), vy1 = Math.min(this.worldH, view.y + view.h);
    if (vx1 <= vx0 || vy1 <= vy0) return true;
    const tx0 = Math.floor(vx0 / size), ty0 = Math.floor(vy0 / size);
    const tx1 = Math.floor((vx1 - 1e-6) / size), ty1 = Math.floor((vy1 - 1e-6) / size);
    const start = performance.now();
    let complete = true;
    // Always paint the overview first as a fallback underlay.
    const ov = this.getOverview();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(ov, 0, 0, this.worldW, this.worldH);
    if (pxPerUnit <= this.overviewScale * 1.01) return true;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = `${level}:${tx}:${ty}`;
        let tile = this.tiles.get(key);
        if (!tile) {
          if (performance.now() - start > budgetMs) { complete = false; continue; }
          tile = this.renderTile(level, tx, ty);
          this.tiles.set(key, tile);
          this.tileOrder.push(key);
          if (this.tileOrder.length > 420) {
            for (const k of this.tileOrder.splice(0, 60)) this.tiles.delete(k);
          }
        }
        const x = tx * size, y = ty * size;
        const w = Math.min(size, this.worldW - x), h = Math.min(size, this.worldH - y);
        ctx.drawImage(tile, 0, 0, w * s, h * s, x, y, w, h);
      }
    }
    return complete;
  }
}

function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
