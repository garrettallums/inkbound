import { supportsCanvasFilter } from '../core/canvas';
import { rectsIntersect, type Rect } from '../core/geom';
import type { AssetObject, GridSettings, LightObject, ProjectDoc, SceneObject } from '../model/types';
import { getShadowSprite, getSprite, PAD } from './assets/registry';
import { drawEffect } from './effects';
import { applyLighting, shadowVector } from './lighting';
import type { PaintLayer } from './paintLayer';
import type { ObjectTileCache } from './objectCache';
import { drawPath } from './paths';
import { assetDef, objectBounds, renderLayers } from './scene';
import type { TerrainRenderer } from './terrainRenderer';
import { drawText } from './text';

/**
 * Scene renderer shared by the editor viewport, thumbnails and export. It
 * draws the layer stack for an arbitrary world rectangle at an arbitrary
 * resolution, culling objects outside the view (spec §58–59).
 */

export interface RenderEnv {
  doc: ProjectDoc;
  terrain: TerrainRenderer;
  paint: Map<string, PaintLayer>;
  layerObjects: (layerId: string) => SceneObject[];
  /** Optional tile cache for dense object layers (viewport only). */
  objectCache?: ObjectTileCache;
  /** Reference images for tracing (never exported). */
  refImages?: Map<string, CanvasImageSource>;
}

export interface RenderOptions {
  view: Rect;
  pxPerUnit: number;
  deviceW: number;
  deviceH: number;
  /** Use the terrain tile cache (viewport) instead of direct vector drawing (export). */
  cached: boolean;
  grid: boolean;
  labels: boolean;
  lighting: boolean;
  effects: boolean;
  /** Skip objects entirely (e.g. while being dragged, drawn separately). */
  hidden?: Set<string>;
  /** Lighting contrast is applied by the caller (e.g. as a CSS filter on the viewport). */
  skipContrast?: boolean;
  /** Draw reference-image layers (editor only). */
  references?: boolean;
}

/** Minimum number of on-screen objects before a layer is drawn through the tile cache. */
const CACHE_THRESHOLD = 350;

export interface RenderStats { drawn: number; culled: number; complete: boolean }

export function collectLights(env: RenderEnv): LightObject[] {
  const out: LightObject[] = [];
  for (const { layer, visible } of renderLayers(env.doc.layers)) {
    if (!visible) continue;
    for (const o of env.layerObjects(layer.id)) if (o.type === 'light') out.push(o);
  }
  return out;
}

export function renderScene(ctx: CanvasRenderingContext2D, env: RenderEnv, o: RenderOptions): RenderStats {
  const { doc } = env;
  const stats: RenderStats = { drawn: 0, culled: 0, complete: true };
  const lights = collectLights(env);
  const shadowDir = shadowVector(doc.lighting);
  const shadowK = doc.lighting.enabled ? doc.lighting.shadowIntensity : 0.35;
  const filterOk = supportsCanvasFilter();
  const baseTransform = ctx.getTransform();
  const mapRect = { x: 0, y: 0, w: doc.width, h: doc.height };
  const view = o.view;
  const deadline = performance.now() + 14;
  for (const { layer, visible, opacity } of renderLayers(doc.layers)) {
    if (!visible || opacity <= 0) continue;
    ctx.save();
    ctx.globalAlpha = opacity;
    switch (layer.kind) {
      case 'terrain':
        if (o.cached) stats.complete = env.terrain.drawCached(ctx, view, o.pxPerUnit) && stats.complete;
        else env.terrain.drawRegion(ctx, clip(view, mapRect), o.pxPerUnit);
        break;
      case 'paint': {
        const p = env.paint.get(layer.id);
        if (p && p.hasContent) {
          const r = clip(view, mapRect);
          if (r.w > 0 && r.h > 0) {
            const s = p.scale;
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(p.canvas, r.x * s, r.y * s, r.w * s, r.h * s, r.x, r.y, r.w, r.h);
          }
        }
        break;
      }
      case 'reference': {
        const img = o.references ? env.refImages?.get(layer.id) : undefined;
        if (img) {
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(img, 0, 0, doc.width, doc.height);
        }
        break;
      }
      case 'grid':
        if (o.grid) drawGrid(ctx, doc.grid, clip(view, mapRect), o.pxPerUnit);
        break;
      case 'effects':
        if (o.effects) for (const e of env.layerObjects(layer.id)) if (e.type === 'effect' && !o.hidden?.has(e.id)) drawEffect(ctx, e, view, doc.width, doc.height);
        break;
      case 'lighting':
        if (o.lighting) {
          ctx.restore();
          ctx.save();
          applyLighting(ctx, doc.lighting, lights, view, o.deviceW, o.deviceH, !o.skipContrast);
          ctx.setTransform(baseTransform);
        }
        break;
      case 'objects': {
        const list = env.layerObjects(layer.id);
        if (o.cached && env.objectCache && list.length > CACHE_THRESHOLD && !(o.hidden && o.hidden.size)) {
          let vis = 0;
          for (const obj of list) if (rectsIntersect(objectBounds(obj, doc), view) && ++vis > CACHE_THRESHOLD) break;
          if (vis > CACHE_THRESHOLD) {
            stats.drawn += vis;
            const ok = env.objectCache.draw(ctx, layer.id, view, doc.width, doc.height, o.pxPerUnit, (tctx, rect, s) => {
              for (const obj of list) {
                if (obj.type === 'light' || obj.type === 'effect') continue;
                if (!rectsIntersect(objectBounds(obj, doc), rect)) continue;
                drawObject(tctx, obj, s, shadowDir, shadowK, lights, doc.lighting.enabled, filterOk);
              }
            }, deadline);
            stats.complete = ok && stats.complete;
            break;
          }
        }
        for (const obj of list) {
          if (o.hidden?.has(obj.id)) continue;
          if (obj.type === 'text' && !o.labels) continue;
          if (obj.type === 'light' || obj.type === 'effect') continue;
          const b = objectBounds(obj, doc);
          if (!rectsIntersect(b, view)) { stats.culled++; continue; }
          stats.drawn++;
          drawObject(ctx, obj, o.pxPerUnit, shadowDir, shadowK, lights, doc.lighting.enabled, filterOk);
        }
        break;
      }
    }
    ctx.restore();
  }
  return stats;
}

function clip(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, w: Math.min(a.x + a.w, b.x + b.w) - x, h: Math.min(a.y + a.h, b.y + b.h) - y };
}

export function drawObject(ctx: CanvasRenderingContext2D, obj: SceneObject, px: number, shadowDir: { x: number; y: number }, shadowK: number, lights: LightObject[], lit: boolean, filterOk: boolean) {
  if (obj.type === 'asset') drawAsset(ctx, obj, px, shadowDir, shadowK, lights, lit, filterOk);
  else if (obj.type === 'path') drawPath(ctx, obj, px);
  else if (obj.type === 'text') drawText(ctx, obj);
}

export function drawAsset(ctx: CanvasRenderingContext2D, o: AssetObject, px: number, shadowDir: { x: number; y: number }, shadowK: number, lights: LightObject[], lit: boolean, filterOk: boolean) {
  const d = assetDef(o);
  const w = d.w * o.sx, h = d.h * o.sy;
  const screen = Math.max(w, h) * px;
  if (screen < 0.6) return; // level-of-detail: sub-pixel objects are invisible anyway
  const pxPerUnit = px * Math.max(o.sx, o.sy);
  const fw = w * (1 + PAD * 2), fh = h * (1 + PAD * 2);
  const rot = (o.rotation * Math.PI) / 180;
  ctx.save();
  ctx.globalAlpha *= o.opacity;
  // Drop shadow (world-space offset, independent of the object's rotation).
  if (o.shadow > 0 && shadowK > 0 && screen > 3) {
    const len = Math.max(w, h) * 0.12 * shadowK * 1.6;
    const sh = getShadowSprite(d, pxPerUnit);
    const draw = (dx: number, dy: number, a: number) => {
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.translate(o.x + dx, o.y + dy);
      ctx.rotate(rot);
      ctx.scale(o.flipX ? -1 : 1, o.flipY ? -1 : 1);
      ctx.drawImage(sh, -fw / 2, -fh / 2, fw, fh);
      ctx.restore();
    };
    draw(shadowDir.x * len, shadowDir.y * len, Math.min(0.85, o.shadow * shadowK * 1.1));
    // Local light shadows: cast away from nearby lights.
    if (lit) {
      for (const l of lights) {
        if (l.shadowStrength <= 0) continue;
        const dx = o.x - l.x, dy = o.y - l.y;
        const dist = Math.hypot(dx, dy);
        if (dist > l.radius || dist < 1) continue;
        const f = (1 - dist / l.radius) * l.shadowStrength;
        const L = Math.max(w, h) * 0.35 * f;
        draw((dx / dist) * L, (dy / dist) * L, 0.6 * f * o.shadow);
      }
    }
  }
  const adjusted = o.hue || o.saturation || o.brightness || o.contrast || o.temperature || (o.tint && o.tintAmount);
  const sprite = getSprite(d, pxPerUnit, adjusted ? o : undefined);
  ctx.translate(o.x, o.y);
  ctx.rotate(rot);
  ctx.scale(o.flipX ? -1 : 1, o.flipY ? -1 : 1);
  if (o.blur > 0 && filterOk) ctx.filter = `blur(${Math.max(0.1, o.blur * px)}px)`;
  ctx.drawImage(sprite, -fw / 2, -fh / 2, fw, fh);
  ctx.restore();
}

export function drawGrid(ctx: CanvasRenderingContext2D, g: GridSettings, r: Rect, px: number) {
  if (g.type === 'none' || r.w <= 0 || r.h <= 0) return;
  const size = Math.max(4, g.size);
  if (size * px < 4) return; // too dense to be useful at this zoom
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.globalAlpha *= g.opacity;
  ctx.strokeStyle = g.color;
  ctx.lineWidth = g.thickness;
  ctx.beginPath();
  if (g.type === 'square') {
    const x0 = Math.floor((r.x - g.offsetX) / size) * size + g.offsetX;
    const y0 = Math.floor((r.y - g.offsetY) / size) * size + g.offsetY;
    for (let x = x0; x <= r.x + r.w; x += size) { ctx.moveTo(x, r.y); ctx.lineTo(x, r.y + r.h); }
    for (let y = y0; y <= r.y + r.h; y += size) { ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); }
  } else {
    // flat-topped hexes; `size` = flat-to-flat width across corners (2R)
    const R = size / 2;
    const hx = R * 1.5, hy = Math.sqrt(3) * R;
    const c0 = Math.floor((r.x - g.offsetX) / hx) - 1, c1 = Math.ceil((r.x + r.w - g.offsetX) / hx) + 1;
    const r0 = Math.floor((r.y - g.offsetY) / hy) - 1, r1 = Math.ceil((r.y + r.h - g.offsetY) / hy) + 1;
    for (let c = c0; c <= c1; c++) {
      for (let rr = r0; rr <= r1; rr++) {
        const cx = g.offsetX + c * hx, cy = g.offsetY + rr * hy + (c & 1 ? hy / 2 : 0);
        // draw three edges per hex; neighbours supply the rest
        const pt = (k: number) => [cx + R * Math.cos((Math.PI / 3) * k), cy + R * Math.sin((Math.PI / 3) * k)];
        const a = pt(3), b = pt(4), cc = pt(5), dd = pt(0);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(cc[0], cc[1]); ctx.lineTo(dd[0], dd[1]);
        const e = pt(2);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(e[0], e[1]);
      }
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** Snap a world point to the grid (cell centres for hex, intersections/centres for square). */
export function snapToGrid(g: GridSettings, x: number, y: number, centers = true): { x: number; y: number } {
  if (g.type === 'none') return { x, y };
  const s = g.size;
  if (g.type === 'square') {
    const off = centers ? s / 2 : 0;
    return { x: Math.round((x - g.offsetX - off) / s) * s + g.offsetX + off, y: Math.round((y - g.offsetY - off) / s) * s + g.offsetY + off };
  }
  const R = s / 2, hx = R * 1.5, hy = Math.sqrt(3) * R;
  let best = { x, y }, bd = Infinity;
  const c = Math.round((x - g.offsetX) / hx);
  for (let cc = c - 1; cc <= c + 1; cc++) {
    const r = Math.round((y - g.offsetY - (cc & 1 ? hy / 2 : 0)) / hy);
    for (let rr = r - 1; rr <= r + 1; rr++) {
      const px = g.offsetX + cc * hx, py = g.offsetY + rr * hy + (cc & 1 ? hy / 2 : 0);
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bd) { bd = d; best = { x: px, y: py }; }
    }
  }
  return best;
}
