import { describe, expect, it } from 'vitest';
import { buildCoastline, chaikin, extractContours, simplifyRing } from '../src/engine/contour';

function signedArea(r: Float32Array) {
  let a = 0;
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += r[i * 2] * r[j * 2 + 1] - r[j * 2] * r[i * 2 + 1];
  }
  return a / 2;
}

function field(w: number, h: number, fn: (x: number, y: number) => boolean) {
  const d = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = fn(x, y) ? 255 : 0;
  return d;
}

describe('marching squares', () => {
  it('produces one closed ring around a single blob', () => {
    const d = field(40, 40, (x, y) => (x - 20) ** 2 + (y - 20) ** 2 < 100);
    const rings = extractContours(d, 40, 40);
    expect(rings).toHaveLength(1);
    // area of a radius-10 disc ≈ 314
    expect(Math.abs(signedArea(rings[0]))).toBeGreaterThan(280);
    expect(Math.abs(signedArea(rings[0]))).toBeLessThan(340);
  });

  it('winds holes (lakes) opposite to outer coastlines', () => {
    const d = field(60, 60, (x, y) => {
      const r2 = (x - 30) ** 2 + (y - 30) ** 2;
      return r2 < 25 * 25 && r2 > 8 * 8;
    });
    const rings = extractContours(d, 60, 60);
    expect(rings).toHaveLength(2);
    const areas = rings.map(signedArea);
    expect(Math.sign(areas[0])).not.toBe(Math.sign(areas[1]));
  });

  it('closes rings for land touching the map border', () => {
    const d = field(30, 30, () => true);
    const rings = extractContours(d, 30, 30);
    expect(rings).toHaveLength(1);
    expect(Math.abs(signedArea(rings[0]))).toBeCloseTo(900, -1);
  });

  it('handles saddle points without crashing and keeps rings closed', () => {
    const d = field(8, 8, (x, y) => (x + y) % 2 === 0);
    const rings = extractContours(d, 8, 8);
    expect(rings.length).toBeGreaterThan(0);
    for (const r of rings) expect(r.length % 2).toBe(0);
  });

  it('smooths and simplifies into world coordinates', () => {
    const d = field(50, 50, (x, y) => x > 10 && x < 40 && y > 10 && y < 40);
    const rings = buildCoastline(d, 50, 50, 0.5, true);
    expect(rings).toHaveLength(1);
    const xs = Array.from(rings[0].filter((_, i) => i % 2 === 0));
    // mask scale 0.5 → world coordinates are doubled
    expect(Math.min(...xs)).toBeGreaterThan(18);
    expect(Math.max(...xs)).toBeLessThan(84);
  });

  it('chaikin doubles points and simplify reduces collinear points', () => {
    const sq = new Float32Array([0, 0, 10, 0, 10, 10, 0, 10]);
    expect(chaikin(sq).length).toBe(16);
    const line = new Float32Array(Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? i : 0)));
    expect(simplifyRing(line, 0.1).length).toBeLessThan(line.length);
  });
});
