import { mulberry32 } from './rng';

/**
 * 2D gradient (Perlin-style) noise with an optional period so it tiles.
 * Output roughly in [-1, 1].
 */
export class Noise2D {
  private perm: Uint16Array;
  private gx: Float32Array;
  private gy: Float32Array;

  constructor(seed = 1) {
    const rng = mulberry32(seed);
    const p = new Uint16Array(512);
    const base = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [base[i], base[j]] = [base[j], base[i]];
    }
    for (let i = 0; i < 512; i++) p[i] = base[i & 255];
    this.perm = p;
    this.gx = new Float32Array(256);
    this.gy = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const a = rng() * Math.PI * 2;
      this.gx[i] = Math.cos(a);
      this.gy[i] = Math.sin(a);
    }
  }

  private grad(ix: number, iy: number, x: number, y: number, period: number): number {
    if (period > 0) {
      ix = ((ix % period) + period) % period;
      iy = ((iy % period) + period) % period;
    }
    const h = this.perm[(this.perm[ix & 255] + iy) & 511] & 255;
    return this.gx[h] * x + this.gy[h] * y;
  }

  noise(x: number, y: number, period = 0): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const n00 = this.grad(x0, y0, fx, fy, period);
    const n10 = this.grad(x0 + 1, y0, fx - 1, fy, period);
    const n01 = this.grad(x0, y0 + 1, fx, fy - 1, period);
    const n11 = this.grad(x0 + 1, y0 + 1, fx - 1, fy - 1, period);
    const a = n00 + u * (n10 - n00);
    const b = n01 + u * (n11 - n01);
    return (a + v * (b - a)) * 1.414;
  }

  /** Fractal Brownian motion. When `period` > 0 the result tiles every `period` units. */
  fbm(x: number, y: number, octaves = 4, period = 0, lacunarity = 2, gain = 0.5): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise(x * f, y * f, period > 0 ? period * f : 0);
      norm += amp;
      amp *= gain;
      f *= lacunarity;
    }
    return sum / norm;
  }
}

const noiseCache = new Map<number, Noise2D>();
export function getNoise(seed: number): Noise2D {
  let n = noiseCache.get(seed);
  if (!n) {
    n = new Noise2D(seed);
    noiseCache.set(seed, n);
  }
  return n;
}
