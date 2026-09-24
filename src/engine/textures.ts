import { makeCanvas, ctx2d } from '../core/canvas';
import { adjustKey, applyAdjustToPixels, hexToRgb, type ColorAdjust, type RGB } from '../core/color';
import { getNoise } from '../core/noise';
import { mulberry32, hashString, type Rng } from '../core/rng';

/**
 * Procedurally generated, seamlessly tiling textures. Everything is painted
 * locally with noise + stroke splatter so no external image assets are needed.
 */
export interface TextureDef {
  id: string;
  name: string;
  group: 'Ground' | 'Vegetation' | 'Rock' | 'Water' | 'Built' | 'Paper' | 'Underground';
  /** Average colour, used for swatches & fallbacks. */
  swatch: string;
  paint: (ctx: CanvasRenderingContext2D, S: number, rng: Rng, seed: number) => void;
  /** Whether it appears in the texture brush palette. */
  brush?: boolean;
}

/** Design units for vector strokes (the canvas is drawn at PX resolution, scaled). */
const S = 256;
/** Pixel resolution of each generated tile. */
const PX = 512;

type Stop = [number, string];

function ramp(stops: Stop[]): (t: number) => RGB {
  const s = stops.map(([t, c]) => ({ t, c: hexToRgb(c) }));
  return (t: number) => {
    if (t <= s[0].t) return s[0].c;
    for (let i = 1; i < s.length; i++) {
      if (t <= s[i].t) {
        const a = s[i - 1], b = s[i];
        const k = (t - a.t) / (b.t - a.t);
        return { r: a.c.r + (b.c.r - a.c.r) * k, g: a.c.g + (b.c.g - a.c.g) * k, b: a.c.b + (b.c.b - a.c.b) * k };
      }
    }
    return s[s.length - 1].c;
  };
}

interface NoiseOpts {
  period?: number; // base cells across the tile
  octaves?: number;
  warp?: number;
  contrast?: number;
  grain?: number;
}

/** Fill the tile with a colour ramp driven by tiling fractal noise. */
function noiseFill(ctx: CanvasRenderingContext2D, seed: number, stops: Stop[], o: NoiseOpts = {}) {
  const period = o.period ?? 4;
  const oct = o.octaves ?? 5;
  const warp = o.warp ?? 0.6;
  const contrast = o.contrast ?? 1.4;
  const grain = o.grain ?? 10;
  const n = getNoise(seed);
  const n2 = getNoise(seed + 17);
  const col = ramp(stops);
  const img = ctx.createImageData(PX, PX);
  const d = img.data;
  const rng = mulberry32(seed * 7 + 3);
  for (let y = 0; y < PX; y++) {
    for (let x = 0; x < PX; x++) {
      const u = (x / PX) * period, v = (y / PX) * period;
      const wx = warp ? n2.fbm(u + 3.1, v + 1.7, 3, period) * warp : 0;
      const wy = warp ? n2.fbm(u + 8.3, v + 4.2, 3, period) * warp : 0;
      let t = n.fbm(u + wx, v + wy, oct, period);
      t = 0.5 + t * contrast * 0.5;
      const c = col(Math.max(0, Math.min(1, t)));
      const g = (rng() - 0.5) * grain;
      const i = (y * PX + x) * 4;
      d[i] = c.r + g; d[i + 1] = c.g + g; d[i + 2] = c.b + g; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Draw a shape at (x, y) and its wrap-around copies so the tile stays seamless. */
function wrapDraw(x: number, y: number, r: number, fn: (x: number, y: number) => void) {
  for (const ox of [-S, 0, S]) {
    for (const oy of [-S, 0, S]) {
      const px = x + ox, py = y + oy;
      if (px + r < 0 || py + r < 0 || px - r > S || py - r > S) continue;
      fn(px, py);
    }
  }
}

function strokes(ctx: CanvasRenderingContext2D, rng: Rng, count: number, colors: string[], len: [number, number], width: [number, number], angle: [number, number], alpha = 0.5) {
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = rng() * S, y = rng() * S;
    const l = len[0] + rng() * (len[1] - len[0]);
    const a = angle[0] + rng() * (angle[1] - angle[0]);
    const w = width[0] + rng() * (width[1] - width[0]);
    ctx.strokeStyle = colors[Math.floor(rng() * colors.length)];
    ctx.globalAlpha = alpha * (0.5 + rng() * 0.5);
    ctx.lineWidth = w;
    const dx = Math.cos(a) * l, dy = Math.sin(a) * l;
    const bend = (rng() - 0.5) * l * 0.4;
    wrapDraw(x, y, l + w, (px, py) => {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + dx / 2 + bend, py + dy / 2 - bend, px + dx, py + dy);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
}

function dabs(ctx: CanvasRenderingContext2D, rng: Rng, count: number, colors: string[], r: [number, number], alpha = 0.5, squash = 1) {
  for (let i = 0; i < count; i++) {
    const x = rng() * S, y = rng() * S;
    const rad = r[0] + rng() * (r[1] - r[0]);
    const rot = rng() * Math.PI;
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.globalAlpha = alpha * (0.4 + rng() * 0.6);
    wrapDraw(x, y, rad * 2, (px, py) => {
      ctx.beginPath();
      ctx.ellipse(px, py, rad, rad * squash, rot, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
}

/** Tileable Voronoi cells: returns cell polygons via per-pixel nearest-site search. */
function voronoiStones(ctx: CanvasRenderingContext2D, seed: number, cells: number, fill: Stop[], mortar: string, mortarWidth: number, jitter = 0.8, rowOffset = false) {
  const rng = mulberry32(seed);
  const sites: { x: number; y: number; c: number }[] = [];
  const cs = PX / cells;
  mortarWidth *= PX / S;
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const off = rowOffset && j % 2 ? cs / 2 : 0;
      sites.push({ x: (i + 0.5) * cs + off + (rng() - 0.5) * cs * jitter, y: (j + 0.5) * cs + (rng() - 0.5) * cs * jitter, c: rng() });
    }
  }
  const col = ramp(fill);
  const m = hexToRgb(mortar);
  const n = getNoise(seed + 5);
  const img = ctx.createImageData(PX, PX);
  const d = img.data;
  for (let y = 0; y < PX; y++) {
    for (let x = 0; x < PX; x++) {
      let d1 = 1e9, d2 = 1e9, best = 0;
      for (let k = 0; k < sites.length; k++) {
        let dx = Math.abs(x - sites[k].x); if (dx > PX / 2) dx = PX - dx;
        let dy = Math.abs(y - sites[k].y); if (dy > PX / 2) dy = PX - dy;
        const dd = dx * dx + dy * dy;
        if (dd < d1) { d2 = d1; d1 = dd; best = k; } else if (dd < d2) d2 = dd;
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      const nv = n.fbm((x / PX) * 8, (y / PX) * 8, 3, 8) * 0.18;
      const c = col(Math.max(0, Math.min(1, sites[best].c * 0.7 + 0.15 + nv)));
      const i = (y * PX + x) * 4;
      const shadeIn = Math.min(1, edge / (mortarWidth * 2.2));
      const k = edge < mortarWidth ? 1 - edge / mortarWidth : 0;
      // Slight bevel: darker near edges, lighter inside.
      const lit = 0.82 + 0.25 * shadeIn;
      d[i] = (c.r * lit) * (1 - k) + m.r * k;
      d[i + 1] = (c.g * lit) * (1 - k) + m.g * k;
      d[i + 2] = (c.b * lit) * (1 - k) + m.b * k;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export const TEXTURES: TextureDef[] = [
  {
    id: 'grass', name: 'Grass', group: 'Vegetation', swatch: '#6f8a3e', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#4f6a2a'], [0.45, '#6d8a3b'], [0.7, '#86a04a'], [1, '#9db25a']], { period: 4 });
      strokes(c, rng, 900, ['#3f5a22', '#8fae4e', '#5e7c30', '#a9bf63'], [3, 7], [0.8, 1.6], [-1.9, -1.2], 0.45);
    },
  },
  {
    id: 'dark-grass', name: 'Dark Grass', group: 'Vegetation', swatch: '#46602c', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#2c3f1b'], [0.5, '#44602a'], [1, '#62803a']], { period: 4 });
      strokes(c, rng, 900, ['#243818', '#57772f', '#3a5322'], [3, 8], [0.8, 1.7], [-1.9, -1.2], 0.5);
    },
  },
  {
    id: 'meadow', name: 'Painted Meadow', group: 'Vegetation', swatch: '#8d8a4f', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#6b6a38'], [0.35, '#86854a'], [0.6, '#9c9656'], [0.85, '#b3a866'], [1, '#c2b579']], { period: 3, warp: 0.9 });
      dabs(c, rng, 260, ['#7a7a40', '#a9a060', '#6c6d3a', '#b8ad6d'], [3, 9], 0.25, 0.6);
    },
  },
  {
    id: 'forest-floor', name: 'Forest Floor', group: 'Vegetation', swatch: '#4b4a2c', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#2f2c1b'], [0.5, '#4a4629'], [0.8, '#5d5a33'], [1, '#6f6a3c']], { period: 5 });
      dabs(c, rng, 500, ['#3b3a22', '#6b5a33', '#55602f', '#2a2818'], [1.5, 4], 0.45, 0.55);
      strokes(c, rng, 90, ['#6e5a3a', '#4e3e28'], [5, 12], [0.8, 1.4], [0, Math.PI], 0.4);
    },
  },
  {
    id: 'dirt', name: 'Dirt', group: 'Ground', swatch: '#7a5f41', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#5a4430'], [0.5, '#7a5f41'], [0.8, '#8f7250'], [1, '#a2845f']], { period: 5 });
      dabs(c, rng, 500, ['#4a3828', '#9b7f5d', '#6b5238'], [0.8, 2.2], 0.5);
    },
  },
  {
    id: 'mud', name: 'Mud', group: 'Ground', swatch: '#4d3d2c', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#2f251b'], [0.45, '#4a3a2a'], [0.75, '#5d4a34'], [1, '#6f6048']], { period: 4, warp: 1.2 });
      dabs(c, rng, 90, ['#6c6150', '#7b7462'], [3, 8], 0.25, 0.5);
      dabs(c, rng, 70, ['#1f1913'], [2, 6], 0.3, 0.6);
    },
  },
  {
    id: 'sand', name: 'Sand', group: 'Ground', swatch: '#d4b983', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#b99a64'], [0.5, '#d2b67f'], [1, '#e6d09c']], { period: 3, grain: 18 });
      strokes(c, rng, 140, ['#c2a46e', '#e7d4a4'], [10, 26], [1, 2], [-0.3, 0.3], 0.25);
    },
  },
  {
    id: 'snow', name: 'Snow', group: 'Ground', swatch: '#e9eef2', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#c3cfd9'], [0.45, '#dde6ed'], [0.8, '#eef3f6'], [1, '#fbfdff']], { period: 3, grain: 6 });
      dabs(c, rng, 160, ['#c9d6e2', '#ffffff'], [2, 7], 0.35, 0.5);
    },
  },
  {
    id: 'stone', name: 'Stone', group: 'Rock', swatch: '#88847b', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#5e5b55'], [0.5, '#838078'], [0.8, '#9b978d'], [1, '#b1ada2']], { period: 6, octaves: 6 });
      strokes(c, rng, 60, ['#4d4a45'], [8, 22], [0.7, 1.2], [0, Math.PI], 0.35);
    },
  },
  {
    id: 'mountain-rock', name: 'Mountain Rock', group: 'Rock', swatch: '#6f6558', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#3f3830'], [0.4, '#625849'], [0.7, '#80766a'], [1, '#a39a8c']], { period: 4, warp: 1.1, contrast: 1.8 });
      strokes(c, rng, 110, ['#2e2923', '#a59b8c'], [6, 18], [0.8, 1.6], [0.5, 1.2], 0.4);
    },
  },
  {
    id: 'cave-floor', name: 'Cave Floor', group: 'Underground', swatch: '#6b6053', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#3e372f'], [0.45, '#5f564a'], [0.8, '#766b5c'], [1, '#8a7f6e']], { period: 5, warp: 1 });
      dabs(c, rng, 260, ['#2f2923', '#8b806f'], [1, 3.5], 0.45);
    },
  },
  {
    id: 'farmland', name: 'Farmland', group: 'Ground', swatch: '#8a6f45', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#6d5434'], [0.5, '#876a43'], [1, '#9f8053']], { period: 4 });
      const rows = 16;
      for (let r = 0; r < rows; r++) {
        const y = (r + 0.5) * (S / rows);
        c.strokeStyle = r % 2 ? 'rgba(60,44,26,0.55)' : 'rgba(110,140,58,0.55)';
        c.lineWidth = S / rows * 0.45;
        c.beginPath();
        for (let x = 0; x <= S; x += 8) c.lineTo(x, y + Math.sin((x / S) * Math.PI * 2 + r) * 1.2);
        c.stroke();
      }
      dabs(c, rng, 200, ['#7d9a43', '#5f4a2e'], [1, 2.4], 0.5);
    },
  },
  {
    id: 'dead-vegetation', name: 'Dead Vegetation', group: 'Vegetation', swatch: '#8a7a4c', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#5c5033'], [0.5, '#7f7046'], [1, '#a4925c']], { period: 4 });
      strokes(c, rng, 800, ['#6b5d38', '#b09c63', '#8e7a48', '#4d4329'], [3, 8], [0.8, 1.5], [-2.2, -0.9], 0.5);
    },
  },
  {
    id: 'moss', name: 'Moss', group: 'Vegetation', swatch: '#5d7a33', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#33491d'], [0.45, '#557230'], [0.8, '#71923c'], [1, '#8aac4a']], { period: 6, warp: 1.3 });
      dabs(c, rng, 700, ['#3d5722', '#7fa244', '#95b653'], [1, 3], 0.45);
    },
  },
  {
    id: 'leaf-litter', name: 'Leaf Litter', group: 'Vegetation', swatch: '#7a5a33', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#3f2f1d'], [0.5, '#5d4629'], [1, '#735836']], { period: 4 });
      dabs(c, rng, 900, ['#9b6a2c', '#b98a3d', '#7a4e22', '#8f7a3b', '#5a3a1c'], [1.8, 4], 0.7, 0.5);
    },
  },
  {
    id: 'shallow-water', name: 'Shallow Water', group: 'Water', swatch: '#5c9696', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#3f7677'], [0.5, '#5a9594'], [0.85, '#78b1aa'], [1, '#95c7bd']], { period: 3, warp: 1.4, grain: 4 });
      strokes(c, rng, 90, ['#a9d8cf', '#dff3ee'], [10, 24], [0.6, 1.2], [-0.2, 0.2], 0.25);
    },
  },
  {
    id: 'deep-water', name: 'Deep Water', group: 'Water', swatch: '#2f5268', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#1f3a4f'], [0.5, '#2e5068'], [1, '#43667c']], { period: 3, warp: 1.2, grain: 4 });
      strokes(c, rng, 60, ['#5c8198'], [12, 28], [0.6, 1.1], [-0.15, 0.15], 0.25);
    },
  },
  {
    id: 'ocean', name: 'Painted Ocean', group: 'Water', swatch: '#54727c', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#3f5c66'], [0.5, '#54727c'], [0.8, '#65838b'], [1, '#7a9699']], { period: 2, warp: 1.1, grain: 5, contrast: 1.2 });
      dabs(c, rng, 120, ['#4a6872', '#6b8a92'], [6, 16], 0.18, 0.35);
    },
  },
  {
    id: 'cobblestone', name: 'Cobblestone', group: 'Built', swatch: '#7d776c', brush: true,
    paint: (c, _s, _r, seed) => voronoiStones(c, seed, 12, [[0, '#5d5850'], [0.5, '#7e786d'], [1, '#9c968a']], '#3b3833', 1.6),
  },
  {
    id: 'flagstone', name: 'Flagstone', group: 'Built', swatch: '#77736b', brush: true,
    paint: (c, _s, _r, seed) => voronoiStones(c, seed, 5, [[0, '#5f5c56'], [0.5, '#77736b'], [1, '#8f8a80']], '#2c2a27', 2.2, 0.35, true),
  },
  {
    id: 'planks', name: 'Wooden Planks', group: 'Built', swatch: '#8a6a45', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#6a4e31'], [0.5, '#8a6a45'], [1, '#a4825a']], { period: 2, octaves: 3 });
      const n = getNoise(seed + 9);
      const rows = 8;
      const img = c.getImageData(0, 0, PX, PX);
      const d = img.data;
      for (let y = 0; y < PX; y++) {
        const row = Math.floor(y / (PX / rows));
        for (let x = 0; x < PX; x++) {
          const i = (y * PX + x) * 4;
          const grain = n.noise((x / PX) * 2 + row * 3.3, (y / PX) * 40, 0) * 18;
          const tone = ((row * 37) % 5) * 6 - 12;
          d[i] += grain + tone; d[i + 1] += grain * 0.8 + tone; d[i + 2] += grain * 0.6 + tone;
        }
      }
      c.putImageData(img, 0, 0);
      c.strokeStyle = '#3a2816';
      c.lineWidth = 1.6;
      for (let r = 0; r < rows; r++) {
        const y = r * (S / rows);
        c.beginPath(); c.moveTo(0, y); c.lineTo(S, y); c.stroke();
        const x = (r * 97 + Math.floor(rng() * 40)) % S;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + S / rows); c.stroke();
      }
    },
  },
  {
    id: 'parchment', name: 'Parchment', group: 'Paper', swatch: '#e6dcc6', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#d7c8a8'], [0.5, '#e4d8bf'], [1, '#efe6d2']], { period: 2, warp: 1, grain: 6, contrast: 1.1 });
      strokes(c, rng, 200, ['#cdbd9c', '#f3ecdc'], [8, 24], [0.4, 0.9], [0, Math.PI], 0.2);
    },
  },
  {
    id: 'parchment-land', name: 'Parchment (Land)', group: 'Paper', swatch: '#ece3cf',
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#e0d4b8'], [0.5, '#ebe1cb'], [1, '#f5eedd']], { period: 2, warp: 1, grain: 5, contrast: 1.05 });
      strokes(c, rng, 150, ['#d9cbb0', '#f7f1e3'], [8, 24], [0.4, 0.9], [0, Math.PI], 0.18);
    },
  },
  {
    id: 'cave-rock', name: 'Cave Rock', group: 'Underground', swatch: '#1f1c1a', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#121010'], [0.5, '#221e1b'], [1, '#342e29']], { period: 5, warp: 1.2, contrast: 1.7 });
      strokes(c, rng, 90, ['#3b342d', '#0c0a09'], [6, 16], [0.8, 1.6], [0, Math.PI], 0.4);
    },
  },
  {
    id: 'dungeon-void', name: 'Solid Rock', group: 'Underground', swatch: '#16151a', brush: true,
    paint: (c, _s, rng, seed) => {
      noiseFill(c, seed, [[0, '#0f0e12'], [0.5, '#1a181d'], [1, '#26232a']], { period: 6, contrast: 1.3 });
      strokes(c, rng, 180, ['#2d2a31', '#0a090c'], [4, 10], [0.6, 1.2], [0.6, 0.9], 0.35);
    },
  },
];

export const TEXTURE_MAP = new Map(TEXTURES.map((t) => [t.id, t]));

const canvasCache = new Map<string, HTMLCanvasElement>();

/** The tile canvas for a texture (generated on first use, then cached). Colour adjustments are cached variants. */
export function getTextureCanvas(id: string, adjust?: ColorAdjust): HTMLCanvasElement {
  const ak = adjust ? adjustKey(adjust) : '';
  if (ak) {
    const key = `${id}|${ak}`;
    let v = canvasCache.get(key);
    if (!v) {
      const base = getTextureCanvas(id);
      v = makeCanvas(base.width, base.height);
      const x = ctx2d(v, { willReadFrequently: true });
      x.drawImage(base, 0, 0);
      const img = x.getImageData(0, 0, v.width, v.height);
      applyAdjustToPixels(img.data, adjust!);
      x.putImageData(img, 0, 0);
      canvasCache.set(key, v);
    }
    return v;
  }
  let c = canvasCache.get(id);
  if (c) return c;
  const def = TEXTURE_MAP.get(id) ?? TEXTURES[0];
  c = makeCanvas(PX, PX);
  const ctx = ctx2d(c, { willReadFrequently: true });
  const seed = hashString(def.id) % 100000;
  // Pixel passes write at full PX resolution; vector strokes use 256 design units.
  ctx.scale(PX / S, PX / S);
  def.paint(ctx, S, mulberry32(seed), seed);
  canvasCache.set(id, c);
  return c;
}

export const TEXTURE_TILE_SIZE = PX;

/** Base world size of one texture tile at textureScale 1. */
export const TEXTURE_WORLD_SIZE = 400;

/**
 * A repeating pattern in *world units*. Draw with the context transform set to
 * world → device so textures stay anchored to the map at any zoom level.
 */
export function texturePattern(ctx: CanvasRenderingContext2D, id: string, textureScale = 1, rotationDeg = 0, adjust?: ColorAdjust): CanvasPattern {
  const pat = ctx.createPattern(getTextureCanvas(id, adjust), 'repeat')!;
  const k = (TEXTURE_WORLD_SIZE * textureScale) / PX;
  let m = new DOMMatrix().scale(k, k);
  if (rotationDeg) m = m.rotate(rotationDeg);
  pat.setTransform(m);
  return pat;
}
