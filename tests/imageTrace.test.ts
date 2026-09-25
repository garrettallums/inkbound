import { describe, expect, it } from 'vitest';
import { autoWaterColor, classifyLand, detectWater, removeSmall, zoneDensity } from '../src/engine/imageTrace';

/** Synthetic "map": sea with an island ringed by a dark ink coastline, a red title on the sea, a small icon. */
function makeMap(w = 120, h = 100) {
  const px = new Uint8ClampedArray(w * h * 4);
  const set = (x: number, y: number, [r, g, b]: number[]) => { const i = (y * w + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - 60, y - 50);
    if (d < 28) set(x, y, x < 50 ? [225, 228, 226] : y > 55 ? [70, 72, 30] : [150, 145, 80]); // snow | forest | grass
    else if (d < 30) set(x, y, [25, 22, 18]); // ink coast
    else if (d < 36) set(x, y, [130, 165, 175]); // coastal glow
    else set(x, y, [86, 107, 114]); // sea
  }
  for (let y = 5; y < 15; y++) for (let x = 5; x < 20; x++) set(x, y, [210, 25, 25]); // red title on the sea
  for (let y = 80; y < 84; y++) for (let x = 100; x < 104; x++) set(x, y, [240, 240, 235]); // tiny icon
  return { px, w, h };
}

describe('trace from image', () => {
  const { px, w, h } = makeMap();
  const water = autoWaterColor(px, w, h);
  const mask = detectWater(px, w, h, { water, tolerance: 0.35, minIsland: 30, minLake: 10 });

  it('finds the sea colour from the image border', () => {
    expect(Math.abs(water.r - 86) + Math.abs(water.g - 107) + Math.abs(water.b - 114)).toBeLessThan(20);
  });

  it('treats glow, red titles and tiny icons on the sea as water', () => {
    expect(mask[33 * 0 + 50 * w + 93]).toBe(1); // glow ring (x=93,y=50)
    expect(mask[10 * w + 10]).toBe(1); // red title
    expect(mask[82 * w + 102]).toBe(1); // tiny icon removed
  });

  it('keeps the island (including snow) as land', () => {
    expect(mask[50 * w + 60]).toBe(0);
    expect(mask[50 * w + 40]).toBe(0); // snowy part
  });

  it('classifies snow, forest and grass', () => {
    const cls = classifyLand(px, mask, w, h);
    expect(cls[45 * w + 40]).toBe(2); // snow
    expect(cls[65 * w + 65]).toBe(3); // forest
    expect(cls[45 * w + 70]).toBe(1); // grass
    const z = zoneDensity(cls, w, h, 10);
    expect(z.gw).toBe(12);
    expect(Math.max(...z.snow)).toBeGreaterThan(0.5);
  });

  it('removeSmall flips small components but not border-touching lakes', () => {
    const m = new Uint8Array(100).fill(0);
    m[55] = 1; // single water pixel inside land
    for (let x = 0; x < 10; x++) m[x] = 1; // water along the top border
    removeSmall(m, 10, 10, 1, 5);
    expect(m[55]).toBe(0);
    expect(m[3]).toBe(1);
  });
});
