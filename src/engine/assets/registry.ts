import { makeCanvas, ctx2d } from '../../core/canvas';
import { adjustKey, applyAdjustToPixels, type ColorAdjust } from '../../core/color';
import { mulberry32, hashString, type Rng } from '../../core/rng';
import type { LayerRole } from '../../model/types';

export type CollisionClass = 'tree' | 'building' | 'rock' | 'prop' | 'none';
export type AssetPack = 'atlas' | 'topdown';

/**
 * A single asset definition. Placed objects are lightweight instances that
 * reference an asset by id; the artwork itself exists once (spec §79).
 */
export interface AssetDef {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  pack: AssetPack;
  tags: string[];
  /** Size in world units at scale 1. */
  w: number;
  h: number;
  role: LayerRole;
  collision: CollisionClass;
  /** Architectural collection / visual style (e.g. "Norse"). */
  style?: string;
  /** Vector drawer in asset units: (0,0) top-left → (w,h) bottom-right. */
  draw?: (ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng) => void;
  /** Imported bitmap source. */
  image?: CanvasImageSource & { width: number; height: number };
  custom?: boolean;
  folder?: string;
  /** Emits light when placed (used for auto light suggestions). */
  glow?: string;
  /** Fraction of the footprint used for collisions. */
  footprint?: number;
}

/** Extra margin around the asset box so outlines / shadows are never clipped. */
export const PAD = 0.18;

const defs = new Map<string, AssetDef>();
let version = 0;

export function registerAsset(def: AssetDef) {
  defs.set(def.id, def);
  version++;
}

export function unregisterAsset(id: string) {
  defs.delete(id);
  spriteCache.forEach((_, k) => { if (k.startsWith(id + '@')) spriteCache.delete(k); });
  version++;
}

export const getAsset = (id: string) => defs.get(id);
export const allAssets = () => [...defs.values()];
export const assetsVersion = () => version;

/** Fallback used when a project references an asset that is not available (e.g. a deleted import). */
export const MISSING_ASSET: AssetDef = {
  id: '__missing', name: 'Missing asset', category: 'Other', subcategory: '', pack: 'topdown', tags: [], w: 60, h: 60,
  role: 'details', collision: 'none',
  draw: (c, w, h) => {
    c.strokeStyle = '#d04a4a'; c.lineWidth = 3; c.setLineDash([6, 4]);
    c.strokeRect(2, 2, w - 4, h - 4);
    c.beginPath(); c.moveTo(8, 8); c.lineTo(w - 8, h - 8); c.moveTo(w - 8, 8); c.lineTo(8, h - 8); c.stroke();
  },
};

// ---------------------------------------------------------------------------
// Sprite cache: sprites are rendered at power-of-two resolution buckets so the
// same asset stays crisp at any zoom / export scale and is shared by every
// instance that uses it.

const spriteCache = new Map<string, HTMLCanvasElement>();
const spriteOrder: string[] = [];
const MAX_SPRITES = 1600;
const MAX_SPRITE_DIM = 2048;

export function bucketFor(pxPerUnit: number): number {
  const b = Math.pow(2, Math.ceil(Math.log2(Math.max(1 / 32, pxPerUnit))));
  return Math.min(8, b);
}

function remember(key: string, c: HTMLCanvasElement) {
  spriteCache.set(key, c);
  spriteOrder.push(key);
  if (spriteOrder.length > MAX_SPRITES) {
    const old = spriteOrder.splice(0, 200);
    for (const k of old) spriteCache.delete(k);
  }
}

function renderBase(def: AssetDef, bucket: number): HTMLCanvasElement {
  let s = bucket;
  const fullW = def.w * (1 + PAD * 2), fullH = def.h * (1 + PAD * 2);
  if (fullW * s > MAX_SPRITE_DIM || fullH * s > MAX_SPRITE_DIM) s = MAX_SPRITE_DIM / Math.max(fullW, fullH);
  const c = makeCanvas(fullW * s, fullH * s);
  const ctx = ctx2d(c);
  ctx.scale(c.width / fullW, c.height / fullH);
  ctx.translate(def.w * PAD, def.h * PAD);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (def.image) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(def.image, 0, 0, def.w, def.h);
  } else if (def.draw) {
    def.draw(ctx, def.w, def.h, mulberry32(hashString(def.id)));
  }
  return c;
}

/** Sprite canvas (including PAD margin) for an asset at ≥ `pxPerUnit` resolution. */
export function getSprite(def: AssetDef, pxPerUnit: number, adjust?: ColorAdjust): HTMLCanvasElement {
  const bucket = bucketFor(pxPerUnit);
  const ak = adjust ? adjustKey(adjust) : '';
  const key = `${def.id}@${bucket}|${ak}`;
  let c = spriteCache.get(key);
  if (c) return c;
  if (ak) {
    const base = getSprite(def, pxPerUnit);
    c = makeCanvas(base.width, base.height);
    const ctx = ctx2d(c, { willReadFrequently: true });
    ctx.drawImage(base, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    applyAdjustToPixels(img.data, adjust!);
    ctx.putImageData(img, 0, 0);
  } else {
    c = renderBase(def, bucket);
  }
  remember(key, c);
  return c;
}

/** Blurred black silhouette used for drop shadows. */
export function getShadowSprite(def: AssetDef, pxPerUnit: number): HTMLCanvasElement {
  const bucket = Math.min(bucketFor(pxPerUnit), 1);
  const key = `${def.id}@${bucket}|shadow`;
  let c = spriteCache.get(key);
  if (c) return c;
  const base = getSprite(def, bucket);
  c = makeCanvas(base.width, base.height);
  const ctx = ctx2d(c);
  const blur = Math.max(1, base.width * 0.02);
  // Offset trick: draw far away and shift the shadow back into view (works without ctx.filter).
  ctx.shadowColor = 'rgba(0,0,0,1)';
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = base.width * 4;
  ctx.drawImage(base, -base.width * 4, 0);
  remember(key, c);
  return c;
}

const alphaMasks = new Map<string, { w: number; h: number; data: Uint8Array }>();

/** Low resolution alpha mask for pixel-accurate picking. */
export function getAlphaMask(def: AssetDef) {
  let m = alphaMasks.get(def.id);
  if (m) return m;
  const target = 64 / Math.max(def.w, def.h);
  const sprite = getSprite(def, target);
  const w = Math.min(sprite.width, 128), h = Math.min(sprite.height, 128);
  const c = makeCanvas(w, h);
  const ctx = ctx2d(c, { willReadFrequently: true });
  ctx.drawImage(sprite, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = px[i * 4 + 3];
  m = { w, h, data };
  alphaMasks.set(def.id, m);
  return m;
}

/** Thumbnail data URL for the asset browser (cached). */
const thumbs = new Map<string, string>();
export function getThumbnail(def: AssetDef, size = 72): string {
  const key = def.id + ':' + size;
  const t = thumbs.get(key);
  if (t) return t;
  const full = Math.max(def.w, def.h) * (1 + PAD * 2);
  const sprite = getSprite(def, (size * 1.5) / full);
  const c = makeCanvas(size, size);
  const ctx = ctx2d(c);
  const k = Math.min(size / sprite.width, size / sprite.height);
  const dw = sprite.width * k, dh = sprite.height * k;
  ctx.drawImage(sprite, (size - dw) / 2, (size - dh) / 2, dw, dh);
  const url = c.toDataURL();
  thumbs.set(key, url);
  return url;
}

export function clearAssetCaches(id?: string) {
  if (!id) {
    spriteCache.clear();
    alphaMasks.clear();
    thumbs.clear();
    return;
  }
  for (const k of [...spriteCache.keys()]) if (k.startsWith(id + '@')) spriteCache.delete(k);
  alphaMasks.delete(id);
  for (const k of [...thumbs.keys()]) if (k.startsWith(id + ':')) thumbs.delete(k);
}
