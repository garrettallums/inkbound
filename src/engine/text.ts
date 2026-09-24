import type { Rect } from '../core/geom';
import type { TextObject } from '../model/types';

/** Label rendering with letter spacing, multi-line, alignment and arc-curved text (spec §42). */

export const FONTS = [
  { id: 'Cinzel', label: 'Cinzel', css: "'Cinzel', Georgia, serif" },
  { id: 'IM Fell English', label: 'IM Fell English', css: "'IM Fell English', Georgia, serif" },
  { id: 'MedievalSharp', label: 'MedievalSharp', css: "'MedievalSharp', Georgia, serif" },
  { id: 'Uncial Antiqua', label: 'Uncial Antiqua', css: "'Uncial Antiqua', Georgia, serif" },
  { id: 'Pirata One', label: 'Pirata One', css: "'Pirata One', Georgia, serif" },
  { id: 'Almendra', label: 'Almendra', css: "'Almendra', Georgia, serif" },
  { id: 'Eagle Lake', label: 'Eagle Lake', css: "'Eagle Lake', Georgia, serif" },
  { id: 'Georgia', label: 'Georgia', css: 'Georgia, serif' },
  { id: 'system', label: 'Sans Serif', css: 'system-ui, sans-serif' },
];

export const fontCss = (id: string) => FONTS.find((f) => f.id === id)?.css ?? `'${id}', Georgia, serif`;

export interface TextPreset {
  id: string;
  label: string;
  patch: Partial<TextObject>;
  /** Size relative to the project's asset scale. */
  size: number;
}

export const TEXT_PRESETS: TextPreset[] = [
  { id: 'continent', label: 'Continent', size: 64, patch: { font: 'Cinzel', weight: 700, letterSpacing: 0.45, uppercase: true, color: '#2b2118', outline: 3, outlineColor: '#efe6d2', curve: 0.12 } },
  { id: 'nation', label: 'Nation', size: 44, patch: { font: 'Uncial Antiqua', weight: 400, letterSpacing: 0.3, uppercase: false, color: '#b3261e', outline: 0, curve: 0.18, italic: false } },
  { id: 'region', label: 'Region', size: 26, patch: { font: 'Cinzel', weight: 600, letterSpacing: 0.35, uppercase: true, color: '#2b2118', outline: 2, outlineColor: '#e9dfc6' } },
  { id: 'city', label: 'City', size: 16, patch: { font: 'IM Fell English', weight: 400, letterSpacing: 0.08, uppercase: true, color: '#1e1914', outline: 2.5, outlineColor: '#efe6d2' } },
  { id: 'village', label: 'Village', size: 11, patch: { font: 'IM Fell English', weight: 400, letterSpacing: 0.05, uppercase: false, color: '#1e1914', outline: 2, outlineColor: '#efe6d2' } },
  { id: 'mountains', label: 'Mountains', size: 18, patch: { font: 'Cinzel', weight: 400, letterSpacing: 0.5, uppercase: true, color: '#3a2e22', outline: 1.5, outlineColor: '#e9dfc6', curve: 0.1 } },
  { id: 'water', label: 'River / Sea', size: 18, patch: { font: 'IM Fell English', weight: 400, italic: true, letterSpacing: 0.35, uppercase: false, color: '#27465a', outline: 0, curve: -0.12 } },
  { id: 'road', label: 'Road', size: 10, patch: { font: 'IM Fell English', weight: 400, italic: true, letterSpacing: 0.15, color: '#3a2e22', outline: 1.5, outlineColor: '#efe6d2' } },
  { id: 'building', label: 'Building', size: 12, patch: { font: 'Almendra', weight: 700, letterSpacing: 0.05, color: '#f3ead6', outline: 2.5, outlineColor: '#1e1914' } },
];

interface Glyph { ch: string; x: number; y: number; angle: number; w: number }
interface Layout { glyphs: Glyph[]; bounds: Rect; font: string }

const layoutCache = new WeakMap<TextObject, Layout>();
let measureCtx: CanvasRenderingContext2D | null = null;

function mctx() {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

export function textFont(t: TextObject) {
  return `${t.italic ? 'italic ' : ''}${t.weight} ${t.size}px ${fontCss(t.font)}`;
}

/** Glyph layout in the label's local (unrotated, unscaled) space, centred on (0,0). */
export function layoutText(t: TextObject): Layout {
  const cached = layoutCache.get(t);
  if (cached) return cached;
  const ctx = mctx();
  const font = textFont(t);
  ctx.font = font;
  const text = t.uppercase ? t.text.toUpperCase() : t.text;
  const lines = text.split('\n');
  const spacing = t.letterSpacing * t.size;
  const lh = t.size * t.lineHeight;
  const glyphs: Glyph[] = [];
  const widths = lines.map((line) => {
    let w = 0;
    for (const ch of line) w += ctx.measureText(ch).width + spacing;
    return Math.max(0, w - spacing);
  });
  const maxW = Math.max(1, ...widths);
  const totalH = lh * lines.length;
  const R = t.curve ? maxW / (Math.abs(t.curve) * Math.PI) : 0;
  lines.forEach((line, li) => {
    const lw = widths[li];
    let x = t.align === 'left' ? -maxW / 2 : t.align === 'right' ? maxW / 2 - lw : -lw / 2;
    const baseY = -totalH / 2 + lh * (li + 0.5);
    for (const ch of line) {
      const cw = ctx.measureText(ch).width;
      const cx = x + cw / 2;
      if (R) {
        const sign = Math.sign(t.curve);
        const r = R + sign * (baseY + totalH / 2) * -1;
        const a = cx / Math.max(1, r);
        glyphs.push({ ch, x: Math.sin(a) * r, y: baseY + sign * (r - Math.cos(a) * r), angle: a * sign, w: cw });
      } else {
        glyphs.push({ ch, x: cx, y: baseY, angle: 0, w: cw });
      }
      x += cw + spacing;
    }
  });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const g of glyphs) {
    const rr = Math.max(g.w, t.size) * 0.6;
    x0 = Math.min(x0, g.x - rr); x1 = Math.max(x1, g.x + rr);
    y0 = Math.min(y0, g.y - t.size * 0.6); y1 = Math.max(y1, g.y + t.size * 0.6);
  }
  if (!glyphs.length) { x0 = -t.size; x1 = t.size; y0 = -t.size / 2; y1 = t.size / 2; }
  const layout = { glyphs, bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, font };
  layoutCache.set(t, layout);
  return layout;
}

/** Local-space box (w,h) used for selection handles. */
export function textSize(t: TextObject) {
  const b = layoutText(t).bounds;
  return { w: b.w * (t.sx ?? 1), h: b.h * (t.sy ?? 1), ox: (b.x + b.w / 2) * (t.sx ?? 1), oy: (b.y + b.h / 2) * (t.sy ?? 1) };
}

export function drawText(ctx: CanvasRenderingContext2D, t: TextObject) {
  const { glyphs, font } = layoutText(t);
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(t.sx ?? 1, t.sy ?? 1);
  ctx.globalAlpha *= t.opacity;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const pass = (fn: (g: Glyph) => void) => {
    for (const g of glyphs) {
      ctx.save();
      ctx.translate(g.x, g.y);
      if (g.angle) ctx.rotate(g.angle);
      fn(g);
      ctx.restore();
    }
  };
  if (t.shadow > 0) {
    ctx.save();
    ctx.shadowColor = t.shadowColor;
    ctx.shadowBlur = t.shadow * ctx.getTransform().a;
    ctx.fillStyle = t.shadowColor;
    pass((g) => ctx.fillText(g.ch, 0, 0));
    ctx.restore();
  }
  if (t.outline > 0) {
    ctx.strokeStyle = t.outlineColor;
    ctx.lineWidth = t.outline * 2;
    pass((g) => ctx.strokeText(g.ch, 0, 0));
  }
  ctx.fillStyle = t.color;
  pass((g) => ctx.fillText(g.ch, 0, 0));
  ctx.restore();
}
