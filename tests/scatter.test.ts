import { describe, expect, it } from 'vitest';
import { registerAsset } from '../src/engine/assets/registry';
import { DEFAULT_RULES, type ScatterSettings } from '../src/engine/collections';
import { ScatterStroke, SpatialHash } from '../src/engine/scatter';
import type { ProjectDoc } from '../src/model/types';
import type { TerrainMask } from '../src/engine/terrainMask';

registerAsset({ id: 't/tree', name: 'Tree', category: 'Nature', subcategory: '', pack: 'topdown', tags: [], w: 40, h: 40, role: 'vegetation', collision: 'tree', footprint: 0.5 });
registerAsset({ id: 't/house', name: 'House', category: 'S', subcategory: '', pack: 'topdown', tags: [], w: 80, h: 60, role: 'buildings', collision: 'building', footprint: 0.95 });

const doc = { width: 2000, height: 2000 } as ProjectDoc;
// Land on the left half only.
const mask = { isLand: (x: number) => x < 1000, nearShore: (x: number) => Math.abs(x - 1000) < 30 } as unknown as TerrainMask;
const env = { doc, mask, baseScale: 1, layerFor: () => 'veg', shadow: 0.5 };
const settings = (seed: number, patch: Partial<ScatterSettings> = {}): ScatterSettings => ({
  size: 200, density: 0.7, spacing: 0.8, scatter: 0.8, minScale: 0.8, maxScale: 1.2, rotation: 30, edgeFalloff: 0.5,
  flip: true, colorVariation: 0.2, seed, rules: { ...DEFAULT_RULES }, ...patch,
});
const stroke = [[300, 500], [500, 520], [700, 560], [900, 600]];

function run(seed: number, existing = [] as never[], patch: Partial<ScatterSettings> = {}) {
  const s = new ScatterStroke(env, [{ assetId: 't/tree', weight: 1 }], settings(seed, patch), existing);
  return stroke.flatMap(([x, y]) => s.dab(x, y));
}

describe('scatter brush', () => {
  it('reproduces the same result for the same seed and stroke', () => {
    const a = run(284729).map((o) => [o.x, o.y, o.sx, o.rotation]);
    const b = run(284729).map((o) => [o.x, o.y, o.sx, o.rotation]);
    expect(a.length).toBeGreaterThan(5);
    expect(a).toEqual(b);
    expect(run(1).map((o) => [o.x, o.y])).not.toEqual(a.map(([x, y]) => [x, y]));
  });

  it('keeps trees out of water when avoidWater is on', () => {
    const out = new ScatterStroke(env, [{ assetId: 't/tree', weight: 1 }], settings(5, { size: 400 }), []).dab(1000, 1000);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((o) => o.x < 1000)).toBe(true);
  });

  it('respects spacing between placed items', () => {
    const out = run(11);
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        expect(Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y)).toBeGreaterThan(5);
      }
    }
  });

  it('avoids existing buildings', () => {
    const house = { id: 'h', type: 'asset', layerId: 'b', assetId: 't/house', x: 500, y: 520, sx: 1, sy: 1, rotation: 0, flipX: false, flipY: false, opacity: 1, shadow: 0, blur: 0 };
    const out = run(3, [house as never]);
    expect(out.every((o) => Math.hypot(o.x - 500, o.y - 520) > 30)).toBe(true);
  });

  it('spatial hash finds neighbours', () => {
    const h = new SpatialHash(50);
    h.insert({ id: 'a', x: 10, y: 10, r: 5, cls: 'tree', role: 'vegetation' });
    h.insert({ id: 'b', x: 400, y: 400, r: 5, cls: 'tree', role: 'vegetation' });
    const found: string[] = [];
    h.query(20, 20, 30, (e) => { found.push(e.id); });
    expect(found).toEqual(['a']);
  });
});
