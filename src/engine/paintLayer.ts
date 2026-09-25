import { makeCanvas, ctx2d } from '../core/canvas';
import type { Rect } from '../core/geom';
import { getNoise } from '../core/noise';
import { mulberry32, weightedPick, type Rng } from '../core/rng';
import { texturePattern } from './textures';

/**
 * A texture-paint raster layer (spec §18–20). Painting stamps world-anchored
 * texture through soft, noise-eroded brush tips, so overlapping dabs blend into
 * gradual transitions instead of hard circles.
 */

const TILE = 128;

export interface PaintPatch {
  kind: 'paint';
  layerId: string;
  tiles: { tx: number; ty: number; before: ImageData; after: ImageData }[];
}

export interface TextureMixItem {
  texture: string;
  weight: number;
}

export interface TextureBrush {
  mix: TextureMixItem[];
  size: number; // radius (world units)
  opacity: number; // 0..1
  flow: number; // 0..1
  hardness: number; // 0..1
  softness: number; // 0..1 edge noise erosion ("edge softness")
  textureScale: number;
  rotation: number; // degrees
  rotationVariation: number; // degrees
  erase: boolean;
  /** Restrict paint to land or water using the terrain mask. */
  clip?: 'none' | 'land' | 'water';
}

/** Minimal view of the terrain mask needed for clipping. */
export interface ClipMask { canvas: HTMLCanvasElement; scale: number; flush(): void }

// ---------------------------------------------------------------- brush tips

const tipCache = new Map<string, HTMLCanvasElement>();
const TIP = 128;

function getTip(hardness: number, softness: number, variant: number): HTMLCanvasElement {
  const hq = Math.round(hardness * 5) / 5, sq = Math.round(softness * 5) / 5;
  const key = `${hq}|${sq}|${variant}`;
  let c = tipCache.get(key);
  if (c) return c;
  c = makeCanvas(TIP, TIP);
  const ctx = ctx2d(c);
  const img = ctx.createImageData(TIP, TIP);
  const n = getNoise(9000 + variant);
  const R = TIP / 2;
  for (let y = 0; y < TIP; y++) {
    for (let x = 0; x < TIP; x++) {
      const dx = (x + 0.5 - R) / R, dy = (y + 0.5 - R) / R;
      const d = Math.sqrt(dx * dx + dy * dy);
      const nv = n.fbm(x / 22, y / 22, 4) * 0.5 + 0.5;
      const edge = 1 - sq * 0.45 * nv;
      const inner = edge * (0.15 + hq * 0.8);
      let a = d <= inner ? 1 : d >= edge ? 0 : 1 - (d - inner) / (edge - inner);
      a = a * a * (3 - 2 * a);
      // interior mottling so repeated dabs build up texture unevenly
      a *= 1 - sq * 0.35 * (1 - nv);
      const i = (y * TIP + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.max(0, Math.min(255, a * 255));
    }
  }
  ctx.putImageData(img, 0, 0);
  tipCache.set(key, c);
  return c;
}

// ---------------------------------------------------------------- layer

export class PaintLayer {
  readonly id: string;
  readonly w: number;
  readonly h: number;
  readonly scale: number;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private temp: HTMLCanvasElement;
  private tctx: CanvasRenderingContext2D;
  private editTiles: Map<number, ImageData> | null = null;
  private rng: Rng = mulberry32(1);
  version = 0;
  /** True once anything has been painted (empty layers are skipped when saving/rendering). */
  hasContent = false;

  constructor(id: string, worldW: number, worldH: number, scale: number) {
    this.id = id;
    this.scale = scale;
    this.w = Math.max(1, Math.round(worldW * scale));
    this.h = Math.max(1, Math.round(worldH * scale));
    this.canvas = makeCanvas(this.w, this.h);
    this.ctx = ctx2d(this.canvas, { willReadFrequently: true });
    this.temp = makeCanvas(TIP * 4, TIP * 4);
    this.tctx = ctx2d(this.temp);
  }

  load(src: CanvasImageSource) {
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.ctx.drawImage(src, 0, 0, this.w, this.h);
    this.hasContent = true;
    this.version++;
  }

  copyFrom(other: PaintLayer) {
    this.load(other.canvas);
    this.hasContent = other.hasContent;
  }

  beginEdit(seed: number) {
    this.editTiles = new Map();
    this.rng = mulberry32(seed);
  }

  private touch(x0: number, y0: number, x1: number, y1: number) {
    if (!this.editTiles) return;
    const cols = Math.ceil(this.w / TILE), rows = Math.ceil(this.h / TILE);
    const tx0 = Math.max(0, Math.floor(x0 / TILE)), ty0 = Math.max(0, Math.floor(y0 / TILE));
    const tx1 = Math.min(cols - 1, Math.floor(x1 / TILE)), ty1 = Math.min(rows - 1, Math.floor(y1 / TILE));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = ty * cols + tx;
        if (!this.editTiles.has(key)) this.editTiles.set(key, this.readTile(tx, ty));
      }
    }
  }

  private readTile(tx: number, ty: number) {
    const x = tx * TILE, y = ty * TILE;
    return this.ctx.getImageData(x, y, Math.min(TILE, this.w - x), Math.min(TILE, this.h - y));
  }

  endEdit(): PaintPatch | null {
    const tiles = this.editTiles;
    this.editTiles = null;
    if (!tiles || !tiles.size) return null;
    const cols = Math.ceil(this.w / TILE);
    const patch: PaintPatch = { kind: 'paint', layerId: this.id, tiles: [] };
    for (const [key, before] of tiles) {
      const tx = key % cols, ty = Math.floor(key / cols);
      patch.tiles.push({ tx, ty, before, after: this.readTile(tx, ty) });
    }
    return patch;
  }

  applyPatch(p: PaintPatch, which: 'before' | 'after'): Rect {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const t of p.tiles) {
      this.ctx.putImageData(t[which], t.tx * TILE, t.ty * TILE);
      x0 = Math.min(x0, t.tx * TILE); y0 = Math.min(y0, t.ty * TILE);
      x1 = Math.max(x1, t.tx * TILE + TILE); y1 = Math.max(y1, t.ty * TILE + TILE);
    }
    this.hasContent = true;
    this.version++;
    return { x: x0 / this.scale, y: y0 / this.scale, w: (x1 - x0) / this.scale, h: (y1 - y0) / this.scale };
  }

  /** Composite a full-layer image (e.g. a masked texture) as one undoable edit. */
  drawFull(src: CanvasImageSource, alpha = 1) {
    this.touch(0, 0, this.w, this.h);
    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(src, 0, 0, this.w, this.h);
    this.ctx.restore();
    this.hasContent = true;
    this.version++;
  }

  clear() {
    this.touch(0, 0, this.w, this.h);
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.version++;
  }

  /** Stamp one dab of the brush at world coordinates. Returns the dirty world rect. */
  dab(b: TextureBrush, wx: number, wy: number, pressure = 1, mask?: ClipMask): Rect {
    const s = this.scale;
    const r = Math.max(1, b.size * s);
    const x0 = Math.floor(wx * s - r), y0 = Math.floor(wy * s - r);
    const size = Math.ceil(r * 2) + 1;
    this.touch(x0, y0, x0 + size, y0 + size);
    const rng = this.rng;
    const variant = Math.floor(rng() * 4);
    const tip = getTip(b.hardness, b.softness, variant);
    const rot = ((b.rotation + (rng() - 0.5) * 2 * b.rotationVariation) * Math.PI) / 180;
    const tipRot = rng() * Math.PI * 2;
    const alpha = Math.max(0, Math.min(1, b.opacity * b.flow * pressure));
    const ctx = this.ctx;
    ctx.save();
    if (b.erase) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = alpha;
      ctx.translate(wx * s, wy * s);
      ctx.rotate(tipRot);
      ctx.drawImage(tip, -r, -r, r * 2, r * 2);
      ctx.restore();
    } else {
      const item = weightedPick(rng, b.mix, (m) => m.weight);
      if (!item) { ctx.restore(); return { x: 0, y: 0, w: 0, h: 0 }; }
      // Secondary textures in a mix use smaller, blotchier dabs for natural speckled blending.
      const primary = b.mix.length <= 1 || item === b.mix.reduce((a, m) => (m.weight > a.weight ? m : a), b.mix[0]);
      const rr = primary ? r : r * (0.35 + rng() * 0.45);
      const ox = primary ? 0 : (rng() - 0.5) * r * 1.2, oy = primary ? 0 : (rng() - 0.5) * r * 1.2;
      const tsz = Math.ceil(rr * 2) + 2;
      if (this.temp.width < tsz || this.temp.height < tsz) {
        this.temp.width = Math.max(this.temp.width, tsz);
        this.temp.height = Math.max(this.temp.height, tsz);
      }
      const t = this.tctx;
      const cx = wx * s + ox, cy = wy * s + oy;
      const tx0 = cx - rr - 1, ty0 = cy - rr - 1;
      t.save();
      t.globalCompositeOperation = 'source-over';
      t.clearRect(0, 0, tsz, tsz);
      // texture in world space: temp px = (world * s) - (tx0, ty0)
      t.setTransform(s, 0, 0, s, -tx0, -ty0);
      t.fillStyle = texturePattern(t, item.texture, b.textureScale, (rot * 180) / Math.PI);
      t.fillRect(tx0 / s, ty0 / s, tsz / s, tsz / s);
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.globalCompositeOperation = 'destination-in';
      t.translate(cx - tx0, cy - ty0);
      t.rotate(tipRot);
      t.drawImage(tip, -rr, -rr, rr * 2, rr * 2);
      t.restore();
      ctx.globalAlpha = alpha * (primary ? 1 : 0.9);
      ctx.drawImage(this.temp, 0, 0, tsz, tsz, Math.floor(tx0), Math.floor(ty0), tsz, tsz);
      ctx.restore();
      this.hasContent = true;
      if (mask && b.clip && b.clip !== 'none') {
        // Keep paint only where the terrain mask allows it (within this dab's rect).
        mask.flush();
        const k = mask.scale / s;
        const rx = Math.floor(tx0), ry = Math.floor(ty0);
        ctx.save();
        ctx.beginPath();
        ctx.rect(rx, ry, tsz, tsz);
        ctx.clip();
        ctx.globalCompositeOperation = b.clip === 'land' ? 'destination-in' : 'destination-out';
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(mask.canvas, rx * k, ry * k, tsz * k, tsz * k, rx, ry, tsz, tsz);
        ctx.restore();
      }
    }
    this.version++;
    return { x: x0 / s, y: y0 / s, w: size / s, h: size / s };
  }
}
