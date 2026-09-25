import { ctx2d, makeCanvas } from '../core/canvas';
import type { RGB } from '../core/color';
import { defaultScatter, type ScatterSettings } from '../engine/collections';
import { autoWaterColor, classifyLand, detectWater, softenMask, zoneDensity } from '../engine/imageTrace';
import { texturePattern } from '../engine/textures';
import { ScatterStroke } from '../engine/scatter';
import type { AssetObject } from '../model/types';
import { targetPaintLayer } from '../tools/paint';
import type { Editor } from './editor';
import { library } from './library';

/**
 * Convert the reference image into editable Inkbound content: coastline,
 * ground textures and scattered forests / mountains — all as one undo step.
 */

export interface TraceOptions {
  water: RGB;
  tolerance: number; // 0..1
  minIsland: number; // fraction of map area (0.0005 = 0.05%)
  coast: boolean;
  textures: boolean;
  forests: boolean;
  mountains: boolean;
  forestDensity: number; // 0..1
}

export const DEFAULT_TRACE: Omit<TraceOptions, 'water'> = {
  tolerance: 0.35, minIsland: 0.0003, coast: true, textures: true, forests: true, mountains: true, forestDensity: 0.6,
};

function referencePixels(ed: Editor) {
  const layer = ed.referenceLayer;
  const img = layer ? ed.refImages.get(layer.id) : undefined;
  if (!img) throw new Error('Add a reference image first.');
  const w = ed.mask.w, h = ed.mask.h;
  const c = makeCanvas(w, h);
  const x = ctx2d(c, { willReadFrequently: true });
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, w, h);
  return { px: x.getImageData(0, 0, w, h).data, w, h };
}

export function detectReferenceWater(ed: Editor): RGB {
  const { px, w, h } = referencePixels(ed);
  return autoWaterColor(px, w, h);
}

/** Colour of the reference image at a world position. */
export function sampleReference(ed: Editor, wx: number, wy: number): RGB | null {
  const layer = ed.referenceLayer;
  const img = layer ? ed.refImages.get(layer.id) : undefined;
  if (!img) return null;
  const c = makeCanvas(1, 1);
  const x = ctx2d(c, { willReadFrequently: true });
  const sx = (wx / ed.doc.width) * img.naturalWidth, sy = (wy / ed.doc.height) * img.naturalHeight;
  x.drawImage(img, sx, sy, 1, 1, 0, 0, 1, 1);
  const d = x.getImageData(0, 0, 1, 1).data;
  return { r: d[0], g: d[1], b: d[2] };
}

/** "Pick water colour from the map" mode, handled by the terrain tool. */
export const tracePick: { active: boolean; onPick: ((c: RGB) => void) | null } = { active: false, onPick: null };

export interface TraceResult { landPct: number; trees: number; mountains: number }

export function traceReference(ed: Editor, o: TraceOptions): TraceResult {
  const { px, w, h } = referencePixels(ed);
  const water = detectWater(px, w, h, { water: o.water, tolerance: o.tolerance, minIsland: Math.round(o.minIsland * w * h), minLake: Math.round(o.minIsland * 0.3 * w * h) });
  const cls = classifyLand(px, water, w, h);
  let land = 0;
  for (let i = 0; i < water.length; i++) if (!water[i]) land++;
  const atlas = ed.doc.assetPack === 'atlas';
  const scale = ed.mask.scale;
  const cellWorld = atlas ? 26 * ed.doc.assetScale : 120;
  const cell = Math.max(3, Math.round(cellWorld * scale));
  const z = zoneDensity(cls, w, h, cell);
  const cw = cell / scale; // actual cell size in world units
  const result: TraceResult = { landPct: Math.round((land / (w * h)) * 100), trees: 0, mountains: 0 };
  const inCell = (grid: Float32Array, x: number, y: number, t: number) => {
    const gx = Math.floor((x * scale) / cell), gy = Math.floor((y * scale) / cell);
    return gx >= 0 && gy >= 0 && gx < z.gw && gy < z.gh && grid[gy * z.gw + gx] >= t;
  };

  ed.begin('Trace from image');
  try {
    if (o.coast) {
      ed.mask.beginEdit();
      ed.mask.replaceAll(softenMask(water, w, h, true, 1));
      const p = ed.mask.endEdit();
      if (p) ed.pushRaster(p, 'Trace coastline');
      ed.terrain.markEdited({ x: 0, y: 0, w: ed.doc.width, h: ed.doc.height });
    }
    if (o.textures) {
      const layer = targetPaintLayer(ed);
      layer.beginEdit(ed.doc.seed);
      ed.mask.flush();
      // Smoothly blended zones: density grid → upscaled soft mask → texture through it, clipped to land.
      const zone = (grid: Float32Array, lo: number, hi: number, texture: string, alpha: number) => {
        const zc = makeCanvas(z.gw, z.gh);
        const zx = ctx2d(zc);
        const img = zx.createImageData(z.gw, z.gh);
        for (let i = 0; i < grid.length; i++) {
          const t = Math.min(1, Math.max(0, (grid[i] - lo) / (hi - lo)));
          img.data[i * 4 + 3] = t * t * (3 - 2 * t) * 255;
        }
        zx.putImageData(img, 0, 0);
        const full = makeCanvas(layer.w, layer.h);
        const fx = ctx2d(full);
        fx.setTransform(layer.scale, 0, 0, layer.scale, 0, 0);
        fx.fillStyle = texturePattern(fx, texture, 1);
        fx.fillRect(0, 0, ed.doc.width, ed.doc.height);
        fx.setTransform(1, 0, 0, 1, 0, 0);
        fx.globalCompositeOperation = 'destination-in';
        fx.imageSmoothingEnabled = true;
        fx.imageSmoothingQuality = 'high';
        // cell grid covers gw*cw world units
        fx.drawImage(zc, 0, 0, z.gw * cw * layer.scale, z.gh * cw * layer.scale);
        fx.drawImage(ed.mask.canvas, 0, 0, layer.w, layer.h);
        layer.drawFull(full, alpha);
      };
      zone(z.forest, 0.12, 0.45, 'forest-floor', 0.6);
      zone(z.mountain, 0.06, 0.3, 'mountain-rock', 0.35);
      zone(z.snow, 0.2, 0.55, 'snow', 0.92);
      const p = layer.endEdit();
      if (p) ed.pushRaster(p, 'Trace textures');
    }
    const scatter = (collectionId: string, pick: (i: number) => boolean, over: Partial<ScatterSettings>, keep: (o: AssetObject) => boolean) => {
      const coll = library.getCollection(collectionId);
      if (!coll) return 0;
      const base = defaultScatter(ed.doc.assetPack, ed.doc.seed + collectionId.length);
      const settings: ScatterSettings = { ...base, ...(coll.settings ?? {}), ...over, rules: { ...base.rules, ...(coll.settings?.rules ?? {}), avoidRoads: false } } as ScatterSettings;
      const stroke = new ScatterStroke(
        { doc: ed.doc, mask: ed.mask, baseScale: ed.doc.assetScale, shadow: atlas ? 0.35 : 0.6, layerFor: (role) => ed.targetLayer(role).id },
        coll.items, settings, Object.values(ed.doc.objects),
      );
      const out: AssetObject[] = [];
      for (let gy = 0; gy < z.gh; gy++) {
        for (let gx = 0; gx < z.gw; gx++) {
          if (!pick(gy * z.gw + gx)) continue;
          for (const obj of stroke.dab((gx + 0.5) * cw, (gy + 0.5) * cw)) if (keep(obj)) out.push(obj);
        }
      }
      ed.putObjects(out);
      return out.length;
    };
    if (o.mountains) {
      result.mountains = scatter(atlas ? 'atlas:mountains' : 'td:rocks', (i) => z.mountain[i] > 0.16,
        { size: cw * 0.9, density: 0.75, spacing: 0.75, minScale: 0.6, maxScale: 0.95, rotation: atlas ? 0 : 180 },
        (m) => inCell(z.mountain, m.x, m.y, 0.08));
    }
    if (o.forests) {
      const snowy = (i: number) => z.snow[i] > 0.3;
      const forest = (i: number) => z.forest[i] > 0.25 && z.mountain[i] < 0.2;
      const dens = 0.3 + o.forestDensity * 0.6;
      result.trees += scatter(atlas ? 'atlas:conifer' : 'td:conifer', (i) => forest(i) && !snowy(i),
        { size: cw * 0.8, density: dens, spacing: 0.8, rotation: atlas ? 0 : 180 }, (t) => inCell(z.forest, t.x, t.y, 0.15));
      result.trees += scatter(atlas ? 'atlas:winter' : 'td:winter', (i) => forest(i) && snowy(i),
        { size: cw * 0.8, density: dens, spacing: 0.8, rotation: atlas ? 0 : 180 }, (t) => inCell(z.forest, t.x, t.y, 0.15));
    }
  } finally {
    ed.commit();
  }
  ed.terrain.rebuild();
  return result;
}
