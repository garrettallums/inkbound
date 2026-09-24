import { makeCanvas, ctx2d, supportsCanvasFilter } from '../core/canvas';
import { hexToRgb, temperatureTint, rgbToHex, rgba } from '../core/color';
import { rectsIntersect, type Rect } from '../core/geom';
import type { LightKind, LightObject, LightingSettings } from '../model/types';

/**
 * Non-destructive lighting (spec §44–45). The scene below the Lighting layer is
 * multiplied by a light map built from the ambient colour plus additive local
 * lights, then a soft bloom is screened on top so fires glow.
 */

export const LIGHT_PRESETS: Record<LightKind, { label: string; color: string; radius: number; intensity: number; falloff: number; flicker: number }> = {
  campfire: { label: 'Campfire', color: '#ff9a3c', radius: 420, intensity: 1.3, falloff: 0.75, flicker: 0.3 },
  torch: { label: 'Torch', color: '#ffae4a', radius: 240, intensity: 1.1, falloff: 0.7, flicker: 0.3 },
  lantern: { label: 'Lantern', color: '#ffd27a', radius: 180, intensity: 1, falloff: 0.65, flicker: 0.1 },
  fireplace: { label: 'Fireplace', color: '#ff8a3a', radius: 320, intensity: 1.2, falloff: 0.7, flicker: 0.25 },
  window: { label: 'Window Glow', color: '#ffdc8a', radius: 140, intensity: 0.8, falloff: 0.5, flicker: 0 },
  magic: { label: 'Magical Light', color: '#7ad8ff', radius: 260, intensity: 1.1, falloff: 0.6, flicker: 0.1 },
  custom: { label: 'Custom', color: '#ffffff', radius: 200, intensity: 1, falloff: 0.6, flicker: 0 },
};

export function lightBounds(l: LightObject): Rect {
  return { x: l.x - l.radius, y: l.y - l.radius, w: l.radius * 2, h: l.radius * 2 };
}

export function ambientColor(s: LightingSettings): string {
  const c = hexToRgb(s.ambientColor);
  const t = temperatureTint(s.temperature);
  const a = s.ambient;
  return rgbToHex({ r: c.r * a * t.r, g: c.g * a * t.g, b: c.b * a * t.b });
}

let lightmap: HTMLCanvasElement | null = null;

function gradientFor(ctx: CanvasRenderingContext2D, l: LightObject, strength: number) {
  const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.radius);
  const c = l.color;
  const inner = Math.max(0.02, (1 - l.falloff) * 0.6);
  g.addColorStop(0, rgba(c, Math.min(1, strength)));
  g.addColorStop(inner, rgba(c, Math.min(1, strength * 0.85)));
  g.addColorStop(Math.min(0.98, inner + (1 - inner) * 0.45), rgba(c, Math.min(1, strength * 0.35)));
  g.addColorStop(1, rgba(c, 0));
  return g;
}

/**
 * Apply lighting to everything already drawn in `ctx`. The ctx transform maps
 * world → device; `deviceW/H` is the drawable size.
 */
export function applyLighting(ctx: CanvasRenderingContext2D, s: LightingSettings, lights: LightObject[], view: Rect, deviceW: number, deviceH: number, contrast = true) {
  const visible = lights.filter((l) => rectsIntersect(lightBounds(l), view));
  const m = ctx.getTransform();
  if (s.enabled) {
    if (!lightmap) lightmap = makeCanvas(deviceW, deviceH);
    if (lightmap.width !== deviceW || lightmap.height !== deviceH) {
      lightmap.width = deviceW;
      lightmap.height = deviceH;
    }
    const lc = ctx2d(lightmap);
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.fillStyle = ambientColor(s);
    lc.fillRect(0, 0, deviceW, deviceH);
    lc.setTransform(m);
    lc.globalCompositeOperation = 'lighter';
    for (const l of visible) {
      lc.fillStyle = gradientFor(lc, l, l.intensity * 0.9);
      lc.fillRect(l.x - l.radius, l.y - l.radius, l.radius * 2, l.radius * 2);
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(lightmap, 0, 0);
    if (contrast && s.contrast && supportsCanvasFilter() && ctx.canvas instanceof HTMLCanvasElement) {
      ctx.globalCompositeOperation = 'copy';
      ctx.filter = `contrast(${Math.round((1 + s.contrast) * 100)}%)`;
      ctx.drawImage(ctx.canvas, 0, 0);
      ctx.filter = 'none';
    }
    ctx.restore();
  }
  // Bloom: warm glow around each light source.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const l of visible) {
    const r = l.radius * 0.55;
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    g.addColorStop(0, rgba(l.color, Math.min(0.7, 0.35 * l.intensity * (s.enabled ? 1 : 0.6))));
    g.addColorStop(1, rgba(l.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(l.x - r, l.y - r, r * 2, r * 2);
  }
  ctx.restore();
}

/** Unit vector pointing where shadows fall (away from the light direction). */
export function shadowVector(s: LightingSettings): { x: number; y: number } {
  const a = (s.lightDirection * Math.PI) / 180;
  return { x: -Math.cos(a), y: -Math.sin(a) };
}
