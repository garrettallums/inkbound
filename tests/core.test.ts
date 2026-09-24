import { describe, expect, it } from 'vitest';
import { catmullRom, resample, rotatedBounds, simplify } from '../src/core/geom';
import { Noise2D } from '../src/core/noise';
import { mulberry32, weightedPick } from '../src/core/rng';
import { applyAdjustToPixels, adjustKey, hexToRgb, rgbToHex } from '../src/core/color';
import { snapToGrid } from '../src/engine/renderer';
import { rotateObj, scaleObj, translateObj } from '../src/editor/transform';
import type { AssetObject, GridSettings } from '../src/model/types';

describe('seeded randomness', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(284729), b = mulberry32(284729), c = mulberry32(1);
    const sa = Array.from({ length: 5 }, a), sb = Array.from({ length: 5 }, b), sc = Array.from({ length: 5 }, c);
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });

  it('weightedPick follows the weights', () => {
    const rng = mulberry32(7);
    const items = [{ id: 'a', w: 75 }, { id: 'b', w: 25 }];
    let a = 0;
    for (let i = 0; i < 4000; i++) if (weightedPick(rng, items, (x) => x.w)!.id === 'a') a++;
    expect(a / 4000).toBeGreaterThan(0.7);
    expect(a / 4000).toBeLessThan(0.8);
  });

  it('periodic noise tiles seamlessly', () => {
    const n = new Noise2D(3);
    for (const y of [0.2, 1.7, 3.3]) expect(n.fbm(0, y, 4, 4)).toBeCloseTo(n.fbm(4, y, 4, 4), 5);
  });
});

describe('geometry', () => {
  it('catmull-rom passes through its control points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 200, y: 0 }];
    const c = catmullRom(pts);
    expect(c[0]).toEqual({ x: 0, y: 0 });
    expect(c[c.length - 1]).toEqual({ x: 200, y: 0 });
    expect(c.some((p) => Math.abs(p.x - 100) < 1e-6 && Math.abs(p.y - 50) < 1e-6)).toBe(true);
  });

  it('resample spaces points evenly', () => {
    const r = resample([{ x: 0, y: 0 }, { x: 100, y: 0 }], 10);
    expect(r.length).toBe(11);
    for (let i = 1; i < r.length; i++) expect(r[i].x - r[i - 1].x).toBeCloseTo(10, 5);
  });

  it('simplify keeps corners and drops collinear points', () => {
    const s = simplify([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 0.5);
    expect(s).toHaveLength(3);
  });

  it('rotated bounds of a 90° box swap width and height', () => {
    const b = rotatedBounds(0, 0, 40, 10, Math.PI / 2);
    expect(b.w).toBeCloseTo(10, 5);
    expect(b.h).toBeCloseTo(40, 5);
  });
});

describe('colour', () => {
  it('round-trips hex', () => {
    expect(rgbToHex(hexToRgb('#a14e34'))).toBe('#a14e34');
  });

  it('neutral adjustments have an empty cache key and leave pixels untouched', () => {
    expect(adjustKey({})).toBe('');
    const px = new Uint8ClampedArray([10, 120, 200, 255]);
    applyAdjustToPixels(px, {});
    expect(Array.from(px)).toEqual([10, 120, 200, 255]);
  });

  it('brightness raises values', () => {
    const px = new Uint8ClampedArray([100, 100, 100, 255]);
    applyAdjustToPixels(px, { brightness: 0.3 });
    expect(px[0]).toBeGreaterThan(100);
  });
});

describe('grid snapping', () => {
  const g: GridSettings = { type: 'square', size: 70, opacity: 1, thickness: 1, color: '#000', offsetX: 0, offsetY: 0, snap: true };
  it('snaps to square cell centres', () => {
    expect(snapToGrid(g, 80, 130)).toEqual({ x: 105, y: 105 });
  });
  it('snaps to hex centres', () => {
    const h = { ...g, type: 'hex' as const };
    const p = snapToGrid(h, 3, 4);
    expect(p).toEqual({ x: 0, y: 0 });
  });
});

describe('transforms are immutable', () => {
  const a: AssetObject = { id: 'o1', type: 'asset', layerId: 'l', assetId: 'x', x: 10, y: 10, sx: 1, sy: 1, rotation: 0, flipX: false, flipY: false, opacity: 1, shadow: 0, blur: 0 };
  it('translate/rotate/scale return new objects', () => {
    const t = translateObj(a, 5, -5);
    expect(t).not.toBe(a);
    expect(a.x).toBe(10);
    expect(t).toMatchObject({ x: 15, y: 5 });
    const r = rotateObj(a, { x: 0, y: 0 }, Math.PI / 2) as AssetObject;
    expect(r.x).toBeCloseTo(-10, 5);
    expect(r.rotation).toBeCloseTo(90, 5);
    const s = scaleObj(a, { x: 0, y: 0 }, 2, 2) as AssetObject;
    expect(s).toMatchObject({ x: 20, y: 20, sx: 2, sy: 2 });
  });
});
