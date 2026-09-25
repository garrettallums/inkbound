import { catmullRom, resample, distToSegment, type Rect, type Vec } from '../core/geom';
import { rgba, shade } from '../core/color';
import { getNoise } from '../core/noise';
import { mulberry32 } from '../core/rng';
import type { PathObject, PathProfile } from '../model/types';
import { texturePattern } from './textures';

/**
 * Generic spline path system (spec §38–41, §76). Every path — road, river,
 * wall, border — shares one geometry pipeline (spline → resample → meander →
 * width profile → rough edges) and differs only by its rendering profile.
 */

export interface PathPreset {
  id: string;
  label: string;
  profile: PathProfile;
  style: string;
  widthTD: number;
  widthAtlas: number;
  color: string;
  taper: number;
  meander: number;
  roughness: number;
  widthVariation: number;
  smoothing: number;
  shadow: number;
  details: Record<string, boolean>;
  group: 'Water' | 'Roads' | 'Walls' | 'Borders' | 'Underground';
}

export const PATH_PRESETS: PathPreset[] = [
  { id: 'river', label: 'River', profile: 'river', style: 'river', widthTD: 150, widthAtlas: 7, color: '#4b7d8c', taper: 0.75, meander: 0.35, roughness: 0.35, widthVariation: 0.3, smoothing: 1, shadow: 0.6, details: { reeds: true, rocks: false, rapids: false, islands: false, banks: true }, group: 'Water' },
  { id: 'stream', label: 'Stream', profile: 'stream', style: 'stream', widthTD: 55, widthAtlas: 3, color: '#548795', taper: 0.6, meander: 0.45, roughness: 0.3, widthVariation: 0.35, smoothing: 1, shadow: 0.5, details: { reeds: false, rocks: true, rapids: false, islands: false, banks: true }, group: 'Water' },
  { id: 'road-dirt', label: 'Dirt Road', profile: 'road', style: 'dirt', widthTD: 90, widthAtlas: 2.2, color: '#8a6a45', taper: 0, meander: 0.1, roughness: 0.4, widthVariation: 0.2, smoothing: 1, shadow: 0.2, details: { ruts: true, grass: true, stones: true, mud: false, wear: true }, group: 'Roads' },
  { id: 'road-mud', label: 'Mud Road', profile: 'road', style: 'mud', widthTD: 95, widthAtlas: 2.2, color: '#5a4630', taper: 0, meander: 0.1, roughness: 0.5, widthVariation: 0.25, smoothing: 1, shadow: 0.2, details: { ruts: true, grass: false, stones: false, mud: true, wear: true }, group: 'Roads' },
  { id: 'road-cobble', label: 'Cobblestone', profile: 'road', style: 'cobblestone', widthTD: 100, widthAtlas: 2.5, color: '#7d776c', taper: 0, meander: 0, roughness: 0.15, widthVariation: 0.05, smoothing: 1, shadow: 0.3, details: { ruts: false, grass: true, stones: false, mud: false, wear: true }, group: 'Roads' },
  { id: 'road-stone', label: 'Flagstone Road', profile: 'road', style: 'stone', widthTD: 110, widthAtlas: 2.5, color: '#8a857b', taper: 0, meander: 0, roughness: 0.1, widthVariation: 0.05, smoothing: 1, shadow: 0.35, details: { ruts: false, grass: false, stones: false, mud: false, wear: true }, group: 'Roads' },
  { id: 'trail', label: 'Trail', profile: 'trail', style: 'dirt', widthTD: 40, widthAtlas: 1.4, color: '#8a6a45', taper: 0, meander: 0.2, roughness: 0.6, widthVariation: 0.4, smoothing: 1, shadow: 0, details: { ruts: false, grass: true, stones: false, mud: false, wear: true }, group: 'Roads' },
  { id: 'trail-snow', label: 'Snowy Trail', profile: 'trail', style: 'snow', widthTD: 45, widthAtlas: 1.4, color: '#dfe6ec', taper: 0, meander: 0.2, roughness: 0.6, widthVariation: 0.4, smoothing: 1, shadow: 0.2, details: { ruts: true, grass: false, stones: false, mud: false, wear: true }, group: 'Roads' },
  { id: 'road-ink', label: 'Ink Road', profile: 'road', style: 'ink', widthTD: 8, widthAtlas: 1.2, color: '#3a2e22', taper: 0, meander: 0, roughness: 0, widthVariation: 0, smoothing: 1, shadow: 0, details: {}, group: 'Roads' },
  { id: 'road-dashed', label: 'Dashed Route', profile: 'road', style: 'dashed', widthTD: 8, widthAtlas: 1.4, color: '#3a2e22', taper: 0, meander: 0, roughness: 0, widthVariation: 0, smoothing: 1, shadow: 0, details: {}, group: 'Roads' },
  { id: 'wall-stone', label: 'Stone Wall', profile: 'wall', style: 'stone', widthTD: 34, widthAtlas: 2.5, color: '#8a857b', taper: 0, meander: 0, roughness: 0.2, widthVariation: 0, smoothing: 0, shadow: 0.7, details: {}, group: 'Walls' },
  { id: 'wall-palisade', label: 'Wooden Palisade', profile: 'wall', style: 'palisade', widthTD: 30, widthAtlas: 2.5, color: '#7a5a3a', taper: 0, meander: 0, roughness: 0, widthVariation: 0, smoothing: 0.4, shadow: 0.7, details: {}, group: 'Walls' },
  { id: 'wall-castle', label: 'Castle Wall', profile: 'wall', style: 'castle', widthTD: 60, widthAtlas: 4, color: '#9a948a', taper: 0, meander: 0, roughness: 0, widthVariation: 0, smoothing: 0, shadow: 0.8, details: { towers: true }, group: 'Walls' },
  { id: 'wall-ruined', label: 'Ruined Wall', profile: 'wall', style: 'ruined', widthTD: 34, widthAtlas: 2.5, color: '#8a857b', taper: 0, meander: 0, roughness: 0.3, widthVariation: 0, smoothing: 0, shadow: 0.6, details: {}, group: 'Walls' },
  { id: 'fence', label: 'Fence', profile: 'wall', style: 'fence', widthTD: 14, widthAtlas: 1.2, color: '#8a6a45', taper: 0, meander: 0, roughness: 0, widthVariation: 0, smoothing: 0, shadow: 0.5, details: {}, group: 'Walls' },
  { id: 'hedge', label: 'Hedge', profile: 'wall', style: 'hedge', widthTD: 44, widthAtlas: 2.5, color: '#4f7a34', taper: 0, meander: 0, roughness: 0.2, widthVariation: 0.2, smoothing: 0.8, shadow: 0.6, details: {}, group: 'Walls' },
  { id: 'border-dashed', label: 'Border (Dashed)', profile: 'border', style: 'dashed', widthTD: 10, widthAtlas: 2.2, color: '#8a2f2a', taper: 0, meander: 0, roughness: 0, widthVariation: 0, smoothing: 0.8, shadow: 0, details: {}, group: 'Borders' },
  { id: 'border-dotted', label: 'Border (Dotted)', profile: 'border', style: 'dotted', widthTD: 10, widthAtlas: 2.2, color: '#3a2e22', taper: 0, meander: 0, roughness: 0, widthVariation: 0, smoothing: 0.8, shadow: 0, details: {}, group: 'Borders' },
  { id: 'border-ink', label: 'Border (Bold Ink)', profile: 'border', style: 'ink', widthTD: 12, widthAtlas: 3.2, color: '#1e1914', taper: 0, meander: 0.2, roughness: 0.35, widthVariation: 0.25, smoothing: 0.8, shadow: 0, details: {}, group: 'Borders' },
  { id: 'passage', label: 'Cave Passage', profile: 'passage', style: 'cave', widthTD: 140, widthAtlas: 8, color: '#6b6053', taper: 0, meander: 0.3, roughness: 0.6, widthVariation: 0.35, smoothing: 1, shadow: 0.8, details: {}, group: 'Underground' },
];

export const presetById = (id: string) => PATH_PRESETS.find((p) => p.id === id) ?? PATH_PRESETS[0];

// ---------------------------------------------------------------- geometry

export interface PathGeometry {
  center: Vec[];
  normals: Vec[];
  widths: number[];
  left: Vec[];
  right: Vec[];
  polygon: Path2D;
  bounds: Rect;
  length: number;
}

const geoCache = new WeakMap<PathObject, PathGeometry>();

export function pathGeometry(p: PathObject): PathGeometry {
  let g = geoCache.get(p);
  if (g) return g;
  g = computeGeometry(p);
  geoCache.set(p, g);
  return g;
}

function computeGeometry(p: PathObject): PathGeometry {
  const pts = p.points;
  const baseW = Math.max(0.5, p.width);
  let center: Vec[];
  if (pts.length < 2) center = pts.map((q) => ({ x: q.x, y: q.y }));
  else if (p.smoothing > 0.05) center = catmullRom(pts, 12, p.closed, 0.5 * p.smoothing);
  else center = p.closed ? [...pts, pts[0]].map((q) => ({ x: q.x, y: q.y })) : pts.map((q) => ({ x: q.x, y: q.y }));
  const step = Math.max(1, Math.min(8, baseW / 6));
  center = resample(center, step);
  const n = center.length;
  const noise = getNoise(p.seed);
  // cumulative length
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(center[i].x - center[i - 1].x, center[i].y - center[i - 1].y));
  const total = cum[n - 1] || 1;
  const normalsAt = (arr: Vec[]) => arr.map((_, i) => {
    const a = arr[Math.max(0, i - 1)], b = arr[Math.min(arr.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: -dy / l, y: dx / l };
  });
  let normals = normalsAt(center);
  // meander: gentle low-frequency sideways drift, pinned at the ends
  if (p.meander > 0 && n > 2) {
    const wave = Math.max(baseW * 6, 60);
    center = center.map((c, i) => {
      const t = cum[i] / total;
      const pin = p.closed ? 1 : Math.min(1, Math.min(t, 1 - t) * 8);
      const off = noise.fbm(cum[i] / wave, 3.7, 3) * p.meander * baseW * 1.6 * pin;
      return { x: c.x + normals[i].x * off, y: c.y + normals[i].y * off };
    });
    normals = normalsAt(center);
  }
  // per-point width multipliers (interpolated by index along control points)
  const widths = center.map((_, i) => {
    const t = cum[i] / total;
    let w = baseW;
    if (p.taper > 0) w *= 1 - p.taper * (1 - (0.18 + 0.82 * Math.pow(t, 0.65)));
    if (p.widthVariation > 0) w *= 1 + noise.fbm(cum[i] / (baseW * 4 + 20), 11.3, 3) * p.widthVariation;
    if (pts.some((q) => q.w !== undefined) && pts.length > 1) {
      const f = t * (pts.length - 1);
      const k = Math.min(pts.length - 2, Math.floor(f));
      const a = pts[k].w ?? 1, b = pts[k + 1].w ?? 1;
      w *= a + (b - a) * (f - k);
    }
    return Math.max(0.3, w);
  });
  const rough = p.roughness;
  const left: Vec[] = [], right: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const hw = widths[i] / 2;
    const nl = rough ? 1 + noise.fbm(cum[i] / (baseW * 0.9 + 4), 21.1, 4) * rough * 0.8 : 1;
    const nr = rough ? 1 + noise.fbm(cum[i] / (baseW * 0.9 + 4), 47.9, 4) * rough * 0.8 : 1;
    left.push({ x: center[i].x + normals[i].x * hw * nl, y: center[i].y + normals[i].y * hw * nl });
    right.push({ x: center[i].x - normals[i].x * hw * nr, y: center[i].y - normals[i].y * hw * nr });
  }
  const polygon = new Path2D();
  if (n > 0) {
    if (p.closed) {
      polygon.moveTo(left[0].x, left[0].y);
      for (const q of left) polygon.lineTo(q.x, q.y);
      polygon.closePath();
      polygon.moveTo(right[right.length - 1].x, right[right.length - 1].y);
      for (let i = right.length - 1; i >= 0; i--) polygon.lineTo(right[i].x, right[i].y);
      polygon.closePath();
    } else {
      polygon.moveTo(left[0].x, left[0].y);
      for (const q of left) polygon.lineTo(q.x, q.y);
      for (let i = right.length - 1; i >= 0; i--) polygon.lineTo(right[i].x, right[i].y);
      polygon.closePath();
    }
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of [...left, ...right]) { if (q.x < x0) x0 = q.x; if (q.y < y0) y0 = q.y; if (q.x > x1) x1 = q.x; if (q.y > y1) y1 = q.y; }
  if (!isFinite(x0)) { x0 = y0 = x1 = y1 = 0; }
  const m = baseW * 0.6 + 6;
  return { center, normals, widths, left, right, polygon, bounds: { x: x0 - m, y: y0 - m, w: x1 - x0 + m * 2, h: y1 - y0 + m * 2 }, length: total };
}

export function pathBounds(p: PathObject): Rect {
  return pathGeometry(p).bounds;
}

/** Distance from a world point to the path centreline. */
export function distanceToPath(p: PathObject, pt: Vec): number {
  const c = pathGeometry(p).center;
  let best = Infinity;
  for (let i = 1; i < c.length; i++) best = Math.min(best, distToSegment(pt, c[i - 1], c[i]));
  return best;
}

// ---------------------------------------------------------------- rendering

function strokeLine(ctx: CanvasRenderingContext2D, pts: Vec[], closed = false) {
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  if (closed) ctx.closePath();
}

function centerPath(g: PathGeometry, closed: boolean) {
  const p = new Path2D();
  g.center.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y)));
  if (closed) p.closePath();
  return p;
}

/** Walk along the centreline at a fixed spacing and yield samples. */
function* walk(g: PathGeometry, spacing: number, offset = 0) {
  const c = g.center;
  let carry = offset;
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1], b = c[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg === 0) continue;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    let d = carry;
    while (d <= seg) {
      const t = d / seg;
      const wv = g.widths[i - 1] + (g.widths[i] - g.widths[i - 1]) * t;
      yield { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: ang, width: wv, nx: g.normals[i].x, ny: g.normals[i].y, index: i };
      d += spacing;
    }
    carry = d - seg;
  }
}

export function drawPath(ctx: CanvasRenderingContext2D, p: PathObject, pxPerUnit: number) {
  if (p.points.length < 2) return;
  const g = pathGeometry(p);
  ctx.save();
  ctx.globalAlpha *= p.opacity;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (p.profile) {
    case 'river':
    case 'stream':
      drawRiver(ctx, p, g, pxPerUnit);
      break;
    case 'road':
    case 'trail':
      drawRoad(ctx, p, g, pxPerUnit);
      break;
    case 'wall':
      drawWall(ctx, p, g, pxPerUnit);
      break;
    case 'passage':
      drawPassage(ctx, p, g);
      break;
    default:
      drawBorder(ctx, p, g);
  }
  ctx.restore();
}

function drawRiver(ctx: CanvasRenderingContext2D, p: PathObject, g: PathGeometry, px: number) {
  const rng = mulberry32(p.seed);
  const avgW = p.width;
  const thin = avgW * px < 3;
  // shore blending: damp earth band
  if (p.details.banks !== false && !thin) {
    ctx.strokeStyle = rgba('#3a2e1e', 0.22);
    ctx.lineWidth = Math.max(1, avgW * 0.28);
    ctx.stroke(g.polygon);
    ctx.strokeStyle = rgba('#3a2e1e', 0.15);
    ctx.lineWidth = Math.max(1, avgW * 0.5);
    ctx.stroke(g.polygon);
  }
  // water body
  ctx.fillStyle = p.color;
  ctx.fill(g.polygon);
  if (!thin) {
    ctx.save();
    ctx.clip(g.polygon);
    ctx.globalAlpha *= 0.45;
    ctx.fillStyle = texturePattern(ctx, 'shallow-water', p.textureScale * 0.6);
    ctx.fill(g.polygon);
    ctx.globalAlpha = 1;
    // deeper centre channel
    ctx.strokeStyle = rgba(shade(p.color, -0.35), 0.35);
    for (let i = 0; i < 3; i++) {
      const pth = new Path2D();
      g.center.forEach((q, k) => (k ? pth.lineTo(q.x, q.y) : pth.moveTo(q.x, q.y)));
      ctx.lineWidth = avgW * (0.5 - i * 0.14);
      ctx.stroke(pth);
    }
    // current highlights
    ctx.strokeStyle = rgba('#e6f4f2', 0.35);
    ctx.lineWidth = Math.max(0.6, avgW * 0.03);
    for (const s of walk(g, Math.max(20, avgW * 1.3), rng() * 40)) {
      if (rng() < 0.45) continue;
      const off = (rng() - 0.5) * s.width * 0.6;
      const x = s.x + s.nx * off, y = s.y + s.ny * off;
      const len = s.width * (0.3 + rng() * 0.5);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(s.angle) * len, y + Math.sin(s.angle) * len);
      ctx.stroke();
    }
    ctx.restore();
  }
  // banks (ink edge)
  ctx.strokeStyle = rgba('#1f1b14', 0.5 + p.shadow * 0.4);
  ctx.lineWidth = Math.max(0.5, Math.min(3.2, avgW * 0.06));
  strokeLine(ctx, g.left, p.closed); ctx.stroke();
  strokeLine(ctx, g.right, p.closed); ctx.stroke();
  if (thin) return;
  // decorations
  const det = p.details;
  if (det.islands) {
    for (const s of walk(g, avgW * 9, avgW * 3)) {
      if (s.width < avgW * 0.8 || rng() < 0.5) continue;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, s.width * 0.45, s.width * 0.16, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#8a8a4a'; ctx.fill();
      ctx.strokeStyle = '#2a2418'; ctx.lineWidth = Math.max(0.5, avgW * 0.03); ctx.stroke();
      ctx.restore();
    }
  }
  if (det.rapids) {
    ctx.strokeStyle = rgba('#ffffff', 0.7);
    ctx.lineWidth = Math.max(0.6, avgW * 0.035);
    for (const s of walk(g, avgW * 0.5)) {
      if (rng() < 0.55) continue;
      const off = (rng() - 0.5) * s.width * 0.7;
      const x = s.x + s.nx * off, y = s.y + s.ny * off;
      ctx.beginPath();
      ctx.arc(x, y, s.width * 0.08, s.angle - 1, s.angle + 1);
      ctx.stroke();
    }
  }
  if (det.rocks) {
    for (const s of walk(g, avgW * 1.1, rng() * avgW)) {
      if (rng() < 0.5) continue;
      const side = rng() < 0.5 ? 1 : -1;
      const off = (s.width / 2) * (0.85 + rng() * 0.3) * side;
      const x = s.x + s.nx * off, y = s.y + s.ny * off, r = avgW * (0.05 + rng() * 0.07);
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.2, r, rng() * 3, 0, Math.PI * 2);
      ctx.fillStyle = shade('#8a857b', (rng() - 0.5) * 0.3); ctx.fill();
      ctx.strokeStyle = '#26221d'; ctx.lineWidth = Math.max(0.4, r * 0.25); ctx.stroke();
    }
  }
  if (det.reeds) {
    ctx.lineWidth = Math.max(0.4, avgW * 0.018);
    for (const s of walk(g, avgW * 0.35, rng() * avgW)) {
      if (rng() < 0.55) continue;
      const side = rng() < 0.5 ? 1 : -1;
      const off = (s.width / 2) * (0.8 + rng() * 0.35) * side;
      const x = s.x + s.nx * off, y = s.y + s.ny * off;
      for (let k = 0; k < 4; k++) {
        const a = rng() * Math.PI * 2, l = avgW * (0.06 + rng() * 0.1);
        ctx.strokeStyle = shade('#6f7f3a', (rng() - 0.5) * 0.4);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
      }
    }
  }
}

function drawRoad(ctx: CanvasRenderingContext2D, p: PathObject, g: PathGeometry, px: number) {
  const rng = mulberry32(p.seed);
  const w = p.width;
  if (p.style === 'ink' || p.style === 'dashed' || w * px < 2.5) {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = Math.max(0.5, w * 0.5);
    if (p.style === 'dashed') ctx.setLineDash([w * 3, w * 2]);
    ctx.stroke(centerPath(g, p.closed));
    ctx.setLineDash([]);
    return;
  }
  const tex = p.style === 'mud' ? 'mud' : p.style === 'cobblestone' ? 'cobblestone' : p.style === 'stone' ? 'flagstone' : p.style === 'snow' ? 'snow' : 'dirt';
  const trail = p.profile === 'trail';
  // shadow / worn soft edge — layered strokes fade into the terrain
  if (p.details.wear !== false) {
    const edgeCol = p.style === 'snow' ? '#c9d3dc' : p.style === 'cobblestone' || p.style === 'stone' ? '#5b5448' : '#5a4630';
    for (let i = 3; i >= 1; i--) {
      ctx.strokeStyle = rgba(edgeCol, 0.12);
      ctx.lineWidth = w * (0.12 + i * 0.12);
      ctx.stroke(g.polygon);
    }
  }
  if (p.shadow > 0 && (p.style === 'cobblestone' || p.style === 'stone')) {
    ctx.save();
    ctx.translate(w * 0.03, w * 0.04);
    ctx.fillStyle = rgba('#000000', p.shadow * 0.35);
    ctx.fill(g.polygon);
    ctx.restore();
  }
  ctx.save();
  if (trail) ctx.globalAlpha *= 0.85;
  ctx.fillStyle = texturePattern(ctx, tex, p.textureScale * (tex === 'cobblestone' ? 0.35 : tex === 'flagstone' ? 0.45 : 0.8));
  ctx.fill(g.polygon);
  ctx.fillStyle = rgba(p.color, 0.25);
  ctx.fill(g.polygon);
  ctx.restore();
  ctx.save();
  ctx.clip(g.polygon);
  if (p.details.mud) {
    for (const s of walk(g, w * 0.7, rng() * w)) {
      if (rng() < 0.4) continue;
      const off = (rng() - 0.5) * s.width * 0.6;
      ctx.beginPath(); ctx.ellipse(s.x + s.nx * off, s.y + s.ny * off, w * (0.1 + rng() * 0.15), w * (0.06 + rng() * 0.08), s.angle, 0, Math.PI * 2);
      ctx.fillStyle = rgba('#2e2419', 0.35); ctx.fill();
      ctx.strokeStyle = rgba('#a8c0c4', 0.25); ctx.lineWidth = w * 0.01; ctx.stroke();
    }
  }
  if (p.details.ruts) {
    for (const side of [-1, 1]) {
      const off = side * w * 0.2;
      const rut = new Path2D();
      g.center.forEach((q, i) => {
        const x = q.x + g.normals[i].x * off, y = q.y + g.normals[i].y * off;
        i ? rut.lineTo(x, y) : rut.moveTo(x, y);
      });
      ctx.strokeStyle = rgba(p.style === 'snow' ? '#9fb0bd' : '#2e2419', 0.28);
      ctx.lineWidth = w * 0.07;
      ctx.stroke(rut);
    }
  }
  if (p.details.stones) {
    for (const s of walk(g, w * 0.25, rng() * w)) {
      if (rng() < 0.6) continue;
      const off = (rng() - 0.5) * s.width * 0.9;
      const r = w * (0.02 + rng() * 0.03);
      ctx.beginPath(); ctx.ellipse(s.x + s.nx * off, s.y + s.ny * off, r * 1.3, r, rng() * 3, 0, Math.PI * 2);
      ctx.fillStyle = shade('#8f897e', (rng() - 0.5) * 0.3); ctx.fill();
      ctx.strokeStyle = rgba('#1e1a15', 0.6); ctx.lineWidth = r * 0.3; ctx.stroke();
    }
  }
  ctx.restore();
  if (p.details.grass) {
    // grass intrusion along edges and down the middle
    ctx.lineWidth = Math.max(0.5, w * 0.018);
    for (const s of walk(g, w * 0.18, rng() * w)) {
      if (rng() < 0.5) continue;
      const edge = rng() < 0.75;
      const side = rng() < 0.5 ? 1 : -1;
      const off = edge ? (s.width / 2) * (0.75 + rng() * 0.3) * side : (rng() - 0.5) * w * 0.12;
      const x = s.x + s.nx * off, y = s.y + s.ny * off;
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (rng() - 0.5) * 2.2, l = w * (0.04 + rng() * 0.06);
        ctx.strokeStyle = shade('#5f7f33', (rng() - 0.5) * 0.4);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
      }
    }
  }
}

function drawWall(ctx: CanvasRenderingContext2D, p: PathObject, g: PathGeometry, px: number) {
  const rng = mulberry32(p.seed);
  const w = p.width;
  const ink = '#1d1a16';
  const dropShadow = (fn: () => void) => {
    if (p.shadow <= 0) return;
    ctx.save();
    ctx.translate(w * 0.12, w * 0.16);
    ctx.globalAlpha *= p.shadow * 0.45;
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#000';
    fn();
    ctx.restore();
  };
  if (w * px < 2) {
    ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(0.6, w);
    ctx.stroke(centerPath(g, p.closed));
    return;
  }
  switch (p.style) {
    case 'palisade': {
      const logs = [...walk(g, w * 0.55)];
      dropShadow(() => { for (const s of logs) { ctx.beginPath(); ctx.arc(s.x, s.y, w * 0.32, 0, Math.PI * 2); ctx.fill(); } });
      for (const s of logs) {
        ctx.beginPath(); ctx.arc(s.x, s.y, w * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = shade(p.color, (rng() - 0.5) * 0.25); ctx.fill();
        ctx.strokeStyle = ink; ctx.lineWidth = w * 0.07; ctx.stroke();
        ctx.beginPath(); ctx.arc(s.x - w * 0.05, s.y - w * 0.05, w * 0.13, 0, Math.PI * 2);
        ctx.strokeStyle = rgba('#e8d2a6', 0.6); ctx.lineWidth = w * 0.04; ctx.stroke();
      }
      break;
    }
    case 'fence': {
      const cp = centerPath(g, p.closed);
      dropShadow(() => { ctx.lineWidth = w * 0.3; ctx.stroke(cp); });
      ctx.strokeStyle = ink; ctx.lineWidth = w * 0.42; ctx.stroke(cp);
      ctx.strokeStyle = p.color; ctx.lineWidth = w * 0.26; ctx.stroke(cp);
      for (const s of walk(g, w * 5)) {
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.angle);
        ctx.fillStyle = shade(p.color, -0.3); ctx.fillRect(-w * 0.35, -w * 0.35, w * 0.7, w * 0.7);
        ctx.strokeStyle = ink; ctx.lineWidth = w * 0.1; ctx.strokeRect(-w * 0.35, -w * 0.35, w * 0.7, w * 0.7);
        ctx.restore();
      }
      break;
    }
    case 'hedge': {
      const blobs = [...walk(g, w * 0.4)];
      dropShadow(() => { for (const s of blobs) { ctx.beginPath(); ctx.arc(s.x, s.y, w * 0.5, 0, Math.PI * 2); ctx.fill(); } });
      for (const s of blobs) {
        ctx.beginPath(); ctx.arc(s.x + (rng() - 0.5) * w * 0.15, s.y + (rng() - 0.5) * w * 0.15, w * (0.45 + rng() * 0.1), 0, Math.PI * 2);
        ctx.strokeStyle = ink; ctx.lineWidth = w * 0.1; ctx.stroke();
      }
      for (const s of blobs) {
        const r = w * (0.44 + rng() * 0.1);
        const grd = ctx.createRadialGradient(s.x - r * 0.3, s.y - r * 0.3, 0, s.x, s.y, r * 1.2);
        grd.addColorStop(0, shade(p.color, 0.25)); grd.addColorStop(1, shade(p.color, -0.35));
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();
      }
      break;
    }
    default: {
      // stone / castle / ruined walls: repeated blocks along a band
      const castle = p.style === 'castle';
      const ruined = p.style === 'ruined';
      dropShadow(() => { ctx.fill(g.polygon); });
      const noise = getNoise(p.seed + 3);
      if (!ruined) {
        ctx.fillStyle = shade(p.color, -0.45);
        ctx.fill(g.polygon);
      }
      const blockL = w * (castle ? 0.7 : 0.9);
      let row = 0;
      for (const s of walk(g, blockL * 0.5)) {
        row++;
        if (ruined && noise.noise(row * 0.23, 0.5) > 0.12) {
          if (rng() < 0.3) {
            ctx.beginPath(); ctx.arc(s.x + (rng() - 0.5) * w, s.y + (rng() - 0.5) * w, w * 0.12, 0, Math.PI * 2);
            ctx.fillStyle = shade(p.color, -0.1); ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = w * 0.04; ctx.stroke();
          }
          continue;
        }
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.angle);
        const half = row % 2 ? 0 : blockL / 2;
        for (const [oy, hh] of castle ? [[-w * 0.5, w * 0.5], [0, w * 0.5]] : [[-w * 0.5, w]]) {
          ctx.fillStyle = shade(p.color, (rng() - 0.5) * 0.22);
          ctx.fillRect(-blockL / 4 + half * 0, oy, blockL / 2, hh);
          ctx.strokeStyle = rgba(ink, 0.8); ctx.lineWidth = w * 0.05;
          ctx.strokeRect(-blockL / 4, oy, blockL / 2, hh);
          ctx.fillStyle = rgba('#ffffff', 0.12); ctx.fillRect(-blockL / 4, oy, blockL / 2, hh * 0.18);
        }
        if (castle && row % 3 === 0) {
          // merlons on the outer side
          ctx.fillStyle = shade(p.color, 0.12);
          ctx.fillRect(-blockL * 0.2, -w * 0.72, blockL * 0.4, w * 0.24);
          ctx.strokeStyle = ink; ctx.strokeRect(-blockL * 0.2, -w * 0.72, blockL * 0.4, w * 0.24);
        }
        ctx.restore();
      }
      if (!ruined) {
        ctx.strokeStyle = ink; ctx.lineWidth = Math.max(0.6, w * 0.07);
        strokeLine(ctx, g.left, p.closed); ctx.stroke();
        strokeLine(ctx, g.right, p.closed); ctx.stroke();
      }
      if (castle && p.details.towers !== false) {
        for (const q of p.points) {
          const R = w * 1.1;
          ctx.save();
          ctx.translate(w * 0.15, w * 0.2);
          ctx.fillStyle = rgba('#000', p.shadow * 0.4);
          ctx.beginPath(); ctx.arc(q.x, q.y, R, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          ctx.beginPath(); ctx.arc(q.x, q.y, R, 0, Math.PI * 2);
          ctx.fillStyle = shade(p.color, -0.05); ctx.fill();
          ctx.strokeStyle = ink; ctx.lineWidth = w * 0.08; ctx.stroke();
          ctx.beginPath(); ctx.arc(q.x, q.y, R * 0.72, 0, Math.PI * 2);
          ctx.fillStyle = shade(p.color, 0.1); ctx.fill(); ctx.stroke();
          for (let k = 0; k < 10; k++) {
            const a = (k / 10) * Math.PI * 2;
            ctx.fillStyle = shade(p.color, -0.2);
            ctx.fillRect(q.x + Math.cos(a) * R * 0.86 - w * 0.1, q.y + Math.sin(a) * R * 0.86 - w * 0.1, w * 0.2, w * 0.2);
          }
        }
      }
    }
  }
}

function drawPassage(ctx: CanvasRenderingContext2D, p: PathObject, g: PathGeometry) {
  const w = p.width;
  ctx.strokeStyle = rgba('#000000', 0.35 * p.shadow);
  for (let i = 3; i >= 1; i--) { ctx.lineWidth = w * 0.12 * i; ctx.stroke(g.polygon); }
  ctx.fillStyle = texturePattern(ctx, 'cave-floor', p.textureScale);
  ctx.fill(g.polygon);
  ctx.save();
  ctx.clip(g.polygon);
  ctx.strokeStyle = rgba('#000000', 0.18);
  for (let i = 3; i >= 1; i--) { ctx.lineWidth = w * 0.1 * i; ctx.stroke(g.polygon); }
  ctx.restore();
  ctx.strokeStyle = '#0e0c0b'; ctx.lineWidth = Math.max(1, w * 0.04);
  ctx.stroke(g.polygon);
}

function drawBorder(ctx: CanvasRenderingContext2D, p: PathObject, g: PathGeometry) {
  const w = p.width;
  const cp = centerPath(g, p.closed);
  if (p.style === 'ink') {
    ctx.fillStyle = p.color;
    ctx.fill(g.polygon);
    return;
  }
  if (p.style !== 'dotted') {
    ctx.strokeStyle = rgba(p.color, 0.22);
    ctx.lineWidth = w * 2.4;
    ctx.stroke(cp);
  }
  ctx.strokeStyle = p.color;
  ctx.lineWidth = w * 0.5;
  ctx.setLineDash(p.style === 'dotted' ? [0.1, w * 1.4] : [w * 2.2, w * 1.2]);
  ctx.stroke(cp);
  ctx.setLineDash([]);
}
