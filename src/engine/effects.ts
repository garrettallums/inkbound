import { makeCanvas, ctx2d } from '../core/canvas';
import { rgba } from '../core/color';
import { rectsIntersect, type Rect } from '../core/geom';
import { getNoise } from '../core/noise';
import { hash2, mulberry32 } from '../core/rng';
import type { EffectKind, EffectObject } from '../model/types';

/**
 * Procedural atmospheric overlays (spec §46). Each effect is an object on an
 * effects layer, anchored in world space so it exports identically.
 */

export const EFFECT_INFO: Record<EffectKind, { label: string; color: string; intensity: number; scale: number; angle: number }> = {
  fog: { label: 'Fog', color: '#e8edf0', intensity: 0.55, scale: 1, angle: 0 },
  mist: { label: 'Mist', color: '#cfe0ea', intensity: 0.45, scale: 0.6, angle: 0 },
  smoke: { label: 'Smoke', color: '#5a5550', intensity: 0.4, scale: 0.5, angle: -80 },
  rain: { label: 'Rain', color: '#b8c8d8', intensity: 0.5, scale: 1, angle: 75 },
  snow: { label: 'Snow', color: '#ffffff', intensity: 0.5, scale: 1, angle: 80 },
  clouds: { label: 'Clouds', color: '#ffffff', intensity: 0.6, scale: 1.4, angle: 0 },
  dust: { label: 'Dust', color: '#d8c08a', intensity: 0.4, scale: 1, angle: 0 },
  embers: { label: 'Embers', color: '#ff9a3a', intensity: 0.5, scale: 1, angle: -90 },
  fireglow: { label: 'Fire Glow', color: '#ff7a2a', intensity: 0.5, scale: 1, angle: 0 },
  godrays: { label: 'God Rays', color: '#fff2c8', intensity: 0.45, scale: 1, angle: 60 },
  vignette: { label: 'Darkness Vignette', color: '#000000', intensity: 0.6, scale: 1, angle: 0 },
};

const noiseTex = new Map<string, HTMLCanvasElement>();

function cloudTexture(seed: number, soft: number): HTMLCanvasElement {
  const key = `${seed}|${soft}`;
  let c = noiseTex.get(key);
  if (c) return c;
  const S = 256;
  c = makeCanvas(S, S);
  const x = ctx2d(c);
  const img = x.createImageData(S, S);
  const n = getNoise(seed);
  for (let yy = 0; yy < S; yy++) {
    for (let xx = 0; xx < S; xx++) {
      let v = n.fbm((xx / S) * 4, (yy / S) * 4, 5, 4) * 0.5 + 0.5;
      v = Math.max(0, Math.min(1, (v - 0.5 + soft * 0.5) / (0.2 + soft * 0.6)));
      const i = (yy * S + xx) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = v * 255;
    }
  }
  x.putImageData(img, 0, 0);
  noiseTex.set(key, c);
  return c;
}

function tinted(tex: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const key = `tint|${color}|${noiseTex.size}`;
  void key;
  const c = makeCanvas(tex.width, tex.height);
  const x = ctx2d(c);
  x.drawImage(tex, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

const tintCache = new Map<string, HTMLCanvasElement>();
function tintedTexture(seed: number, soft: number, color: string) {
  const key = `${seed}|${soft}|${color}`;
  let c = tintCache.get(key);
  if (!c) {
    c = tinted(cloudTexture(seed, soft), color);
    tintCache.set(key, c);
    if (tintCache.size > 40) tintCache.delete(tintCache.keys().next().value!);
  }
  return c;
}

function patternLayer(ctx: CanvasRenderingContext2D, e: EffectObject, area: Rect, soft: number, worldSize: number, alpha: number, dx = 0, dy = 0, seedOff = 0) {
  const tex = tintedTexture((e.seed + seedOff) % 1000, soft, e.color);
  const pat = ctx.createPattern(tex, 'repeat')!;
  const k = worldSize / tex.width;
  pat.setTransform(new DOMMatrix().translate(dx, dy).scale(k, k));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pat;
  ctx.fillRect(area.x, area.y, area.w, area.h);
  ctx.globalAlpha = 1;
}

function particles(ctx: CanvasRenderingContext2D, e: EffectObject, area: Rect, cell: number, perCell: number, draw: (x: number, y: number, rnd: () => number) => void) {
  const cx0 = Math.floor(area.x / cell), cy0 = Math.floor(area.y / cell);
  const cx1 = Math.floor((area.x + area.w) / cell), cy1 = Math.floor((area.y + area.h) / cell);
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const rnd = mulberry32(Math.floor(hash2(cx, cy, e.seed) * 4294967295));
      for (let i = 0; i < perCell; i++) draw(cx * cell + rnd() * cell, cy * cell + rnd() * cell, rnd);
    }
  }
}

export function effectBounds(e: EffectObject, mapW: number, mapH: number): Rect {
  return e.region ?? { x: 0, y: 0, w: mapW, h: mapH };
}

const COMPOSITE: Partial<Record<EffectKind, GlobalCompositeOperation>> = { smoke: 'multiply', embers: 'lighter', fireglow: 'screen', godrays: 'screen' };
let featherCanvas: HTMLCanvasElement | null = null;

export function drawEffect(ctx: CanvasRenderingContext2D, e: EffectObject, view: Rect, mapW: number, mapH: number) {
  const region = effectBounds(e, mapW, mapH);
  if (!rectsIntersect(region, view)) return;
  const area: Rect = {
    x: Math.max(region.x, view.x), y: Math.max(region.y, view.y),
    w: Math.min(region.x + region.w, view.x + view.w) - Math.max(region.x, view.x),
    h: Math.min(region.y + region.h, view.y + view.h) - Math.max(region.y, view.y),
  };
  if (area.w <= 0 || area.h <= 0) return;
  if (!e.region) {
    drawEffectContent(ctx, e, region, area, mapW, mapH);
    return;
  }
  // Regional effects render off-screen, then fade out towards the region edges.
  const m = ctx.getTransform();
  const sc = Math.hypot(m.a, m.b);
  const dw = Math.min(4096, Math.ceil(area.w * sc)), dh = Math.min(4096, Math.ceil(area.h * sc));
  if (dw < 1 || dh < 1) return;
  if (!featherCanvas) featherCanvas = makeCanvas(dw, dh);
  if (featherCanvas.width < dw || featherCanvas.height < dh) {
    featherCanvas.width = Math.max(featherCanvas.width, dw);
    featherCanvas.height = Math.max(featherCanvas.height, dh);
  }
  const k = dw / area.w;
  const o = ctx2d(featherCanvas);
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalCompositeOperation = 'source-over';
  o.globalAlpha = 1;
  o.clearRect(0, 0, dw, dh);
  o.setTransform(k, 0, 0, k, -area.x * k, -area.y * k);
  drawEffectContent(o, e, region, area, mapW, mapH);
  o.globalCompositeOperation = 'destination-in';
  o.globalAlpha = 1;
  const fx = region.w * 0.22, fy = region.h * 0.22;
  const gx = o.createLinearGradient(region.x, 0, region.x + region.w, 0);
  gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(fx / region.w, 'rgba(0,0,0,1)'); gx.addColorStop(1 - fx / region.w, 'rgba(0,0,0,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)');
  o.fillStyle = gx;
  o.fillRect(area.x, area.y, area.w, area.h);
  const gy = o.createLinearGradient(0, region.y, 0, region.y + region.h);
  gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(fy / region.h, 'rgba(0,0,0,1)'); gy.addColorStop(1 - fy / region.h, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
  o.fillStyle = gy;
  o.fillRect(area.x, area.y, area.w, area.h);
  ctx.save();
  ctx.globalCompositeOperation = COMPOSITE[e.kind] ?? 'source-over';
  ctx.drawImage(featherCanvas, 0, 0, dw, dh, area.x, area.y, area.w, area.h);
  ctx.restore();
}

function drawEffectContent(ctx: CanvasRenderingContext2D, e: EffectObject, region: Rect, area: Rect, mapW: number, mapH: number) {
  const I = Math.max(0, Math.min(1, e.intensity));
  const sc = Math.max(0.1, e.scale);
  const mapScale = Math.max(mapW, mapH);
  ctx.save();
  const ang = (e.angle * Math.PI) / 180;
  switch (e.kind) {
    case 'fog':
      patternLayer(ctx, e, area, 0.55, mapScale * 0.45 * sc, I * 0.75);
      patternLayer(ctx, e, area, 0.35, mapScale * 0.22 * sc, I * 0.5, 137, 71, 7);
      break;
    case 'mist':
      patternLayer(ctx, e, area, 0.3, mapScale * 0.18 * sc, I * 0.55, 0, 0, 3);
      patternLayer(ctx, e, area, 0.2, mapScale * 0.09 * sc, I * 0.35, 51, 23, 11);
      break;
    case 'smoke':
      ctx.globalCompositeOperation = 'multiply';
      patternLayer(ctx, e, area, 0.3, mapScale * 0.12 * sc, I * 0.6, 0, 0, 5);
      ctx.globalCompositeOperation = 'source-over';
      patternLayer(ctx, e, area, 0.25, mapScale * 0.08 * sc, I * 0.3, 20, 60, 9);
      break;
    case 'clouds': {
      // cast shadow first, then bright cloud tops
      const size = mapScale * 0.5 * sc;
      ctx.globalCompositeOperation = 'multiply';
      const shadowTex = tintedTexture(e.seed % 1000, 0.15, '#56606a');
      const sp = ctx.createPattern(shadowTex, 'repeat')!;
      sp.setTransform(new DOMMatrix().translate(size * 0.06, size * 0.08).scale(size / shadowTex.width));
      ctx.globalAlpha = I * 0.45;
      ctx.fillStyle = sp;
      ctx.fillRect(area.x, area.y, area.w, area.h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      patternLayer(ctx, e, area, 0.15, size, I * 0.95);
      break;
    }
    case 'rain': {
      const len = 26 * sc;
      ctx.strokeStyle = rgba(e.color, 0.55);
      ctx.lineWidth = Math.max(0.6, 1.3 * sc);
      ctx.beginPath();
      const dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
      particles(ctx, e, area, 300, Math.round(120 * I), (x, y) => { ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); });
      ctx.stroke();
      patternLayer(ctx, { ...e, color: '#6a7a8a' }, area, 0.4, mapScale * 0.3, I * 0.18);
      break;
    }
    case 'snow':
      ctx.fillStyle = e.color;
      particles(ctx, e, area, 300, Math.round(110 * I), (x, y, r) => {
        const s = (1 + r() * 2.5) * sc;
        ctx.globalAlpha = 0.5 + r() * 0.5;
        ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      break;
    case 'dust':
      patternLayer(ctx, e, area, 0.45, mapScale * 0.3 * sc, I * 0.3, 0, 0, 13);
      ctx.fillStyle = e.color;
      particles(ctx, e, area, 260, Math.round(60 * I), (x, y, r) => { ctx.globalAlpha = 0.3 + r() * 0.4; ctx.fillRect(x, y, 1.6 * sc, 1.6 * sc); });
      ctx.globalAlpha = 1;
      break;
    case 'embers':
      ctx.globalCompositeOperation = 'lighter';
      particles(ctx, e, area, 220, Math.round(34 * I), (x, y, r) => {
        const s = (0.5 + r() * 1.1) * sc;
        const g = ctx.createRadialGradient(x, y, 0, x, y, s * 3);
        g.addColorStop(0, rgba('#fff2b0', 0.95)); g.addColorStop(0.3, rgba(e.color, 0.8)); g.addColorStop(1, rgba(e.color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - s * 3, y - s * 3, s * 6, s * 6);
      });
      break;
    case 'fireglow': {
      const cx = region.x + region.w / 2, cy = region.y + region.h / 2, R = Math.max(region.w, region.h) * 0.6;
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, rgba(e.color, I * 0.6)); g.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(area.x, area.y, area.w, area.h);
      break;
    }
    case 'godrays': {
      ctx.globalCompositeOperation = 'screen';
      const n = 9;
      const diag = Math.hypot(region.w, region.h);
      const rnd = mulberry32(e.seed);
      for (let i = 0; i < n; i++) {
        const t = (i + rnd() * 0.6) / n;
        const ox = region.x + region.w * t, oy = region.y;
        const width = diag * (0.02 + rnd() * 0.05) * sc;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(ang - Math.PI / 2);
        const g = ctx.createLinearGradient(0, 0, diag, 0);
        g.addColorStop(0, rgba(e.color, I * 0.55)); g.addColorStop(1, rgba(e.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, -width * 0.3); ctx.lineTo(diag, -width); ctx.lineTo(diag, width); ctx.lineTo(0, width * 0.3); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'vignette': {
      const cx = region.x + region.w / 2, cy = region.y + region.h / 2;
      const R = Math.hypot(region.w, region.h) / 2;
      const g = ctx.createRadialGradient(cx, cy, R * (0.75 - I * 0.4) / sc, cx, cy, R);
      g.addColorStop(0, rgba(e.color, 0)); g.addColorStop(1, rgba(e.color, Math.min(1, I * 1.2)));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, region.h / region.w);
      ctx.translate(-cx, -cy);
      ctx.fillStyle = g;
      ctx.fillRect(region.x - region.w, region.y - region.h * 2, region.w * 3, region.h * 5);
      ctx.restore();
      break;
    }
  }
  ctx.restore();
}
