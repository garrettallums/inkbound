export interface RGB { r: number; g: number; b: number }

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t });
}

export function shade(hex: string, amt: number): string {
  return amt >= 0 ? mix(hex, '#ffffff', amt) : mix(hex, '#000000', -amt);
}

export function rgba(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Colour temperature offset (-1 cold … +1 warm) expressed as an RGB multiplier. */
export function temperatureTint(t: number): RGB {
  return t >= 0
    ? { r: 1 + 0.18 * t, g: 1 + 0.04 * t, b: 1 - 0.28 * t }
    : { r: 1 + 0.25 * t, g: 1 + 0.05 * t, b: 1 - 0.22 * t };
}

export interface ColorAdjust {
  hue?: number; // degrees
  saturation?: number; // -1..1
  brightness?: number; // -1..1
  contrast?: number; // -1..1
  temperature?: number; // -1..1
  tint?: string | null;
  tintAmount?: number; // 0..1
}

export function isNeutralAdjust(a: ColorAdjust): boolean {
  return !a.hue && !a.saturation && !a.brightness && !a.contrast && !a.temperature && !(a.tint && (a.tintAmount ?? 0) > 0);
}

export function adjustKey(a: ColorAdjust): string {
  if (isNeutralAdjust(a)) return '';
  return [a.hue ?? 0, a.saturation ?? 0, a.brightness ?? 0, a.contrast ?? 0, a.temperature ?? 0, a.tint ?? '', a.tintAmount ?? 0]
    .map((v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v))
    .join('|');
}

/** Apply non-destructive colour adjustments to pixel data in place. */
export function applyAdjustToPixels(data: Uint8ClampedArray, a: ColorAdjust): void {
  const hue = ((a.hue ?? 0) * Math.PI) / 180;
  const sat = 1 + (a.saturation ?? 0);
  const bri = (a.brightness ?? 0) * 255 * 0.6;
  const con = 1 + (a.contrast ?? 0);
  const temp = temperatureTint(a.temperature ?? 0);
  const tint = a.tint ? hexToRgb(a.tint) : null;
  const ta = a.tintAmount ?? 0;
  const cosH = Math.cos(hue);
  const sinH = Math.sin(hue);
  // Hue rotation matrix (luminance-preserving).
  const m = [
    0.213 + cosH * 0.787 - sinH * 0.213, 0.715 - cosH * 0.715 - sinH * 0.715, 0.072 - cosH * 0.072 + sinH * 0.928,
    0.213 - cosH * 0.213 + sinH * 0.143, 0.715 + cosH * 0.285 + sinH * 0.14, 0.072 - cosH * 0.072 - sinH * 0.283,
    0.213 - cosH * 0.213 - sinH * 0.787, 0.715 - cosH * 0.715 + sinH * 0.715, 0.072 + cosH * 0.928 + sinH * 0.072,
  ];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = data[i], g = data[i + 1], b = data[i + 2];
    if (hue) {
      const nr = m[0] * r + m[1] * g + m[2] * b;
      const ng = m[3] * r + m[4] * g + m[5] * b;
      const nb = m[6] * r + m[7] * g + m[8] * b;
      r = nr; g = ng; b = nb;
    }
    if (sat !== 1) {
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
    }
    if (con !== 1) {
      r = (r - 128) * con + 128; g = (g - 128) * con + 128; b = (b - 128) * con + 128;
    }
    r = (r + bri) * temp.r; g = (g + bri) * temp.g; b = (b + bri) * temp.b;
    if (tint && ta > 0) {
      // Multiply-style tint keeps shading while shifting colour.
      const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      r = r + (tint.r * l * 1.25 - r) * ta;
      g = g + (tint.g * l * 1.25 - g) * ta;
      b = b + (tint.b * l * 1.25 - b) * ta;
    }
    data[i] = r; data[i + 1] = g; data[i + 2] = b;
  }
}
