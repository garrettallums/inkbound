import { smoothstep, type Vec } from '../core/geom';
import { uid } from '../core/ids';
import { getNoise } from '../core/noise';
import { mulberry32, weightedPick, type Rng } from '../core/rng';
import type { AssetObject, LayerRole, PathObject, ProjectDoc, SceneObject } from '../model/types';
import { getAsset, type AssetDef, type CollisionClass } from './assets/registry';
import type { CollectionItem, ScatterSettings } from './collections';
import { pathGeometry } from './paths';
import type { TerrainMask } from './terrainMask';

/**
 * Scatter Brush System (spec §31–35, §76). One engine handles every
 * collection — forests, rocks, villages, camps — driven by weights, settings
 * and optional placement rules. Seeded so the same stroke + seed reproduces
 * the same result.
 */

interface Entry { id: string; x: number; y: number; r: number; cls: CollisionClass; role: LayerRole }

export class SpatialHash {
  private cells = new Map<number, Entry[]>();
  constructor(private cell = 48) {}

  private key(cx: number, cy: number) {
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  insert(e: Entry) {
    const c = this.cell;
    const x0 = Math.floor((e.x - e.r) / c), x1 = Math.floor((e.x + e.r) / c);
    const y0 = Math.floor((e.y - e.r) / c), y1 = Math.floor((e.y + e.r) / c);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = this.key(cx, cy);
        let arr = this.cells.get(k);
        if (!arr) this.cells.set(k, (arr = []));
        arr.push(e);
      }
    }
  }

  query(x: number, y: number, r: number, fn: (e: Entry) => boolean | void) {
    const c = this.cell;
    const seen = new Set<Entry>();
    for (let cy = Math.floor((y - r) / c); cy <= Math.floor((y + r) / c); cy++) {
      for (let cx = Math.floor((x - r) / c); cx <= Math.floor((x + r) / c); cx++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (!arr) continue;
        for (const e of arr) {
          if (seen.has(e)) continue;
          seen.add(e);
          if (fn(e) === true) return;
        }
      }
    }
  }
}

export function footprintRadius(def: AssetDef, sx: number, sy: number) {
  return (Math.max(def.w * sx, def.h * sy) * (def.footprint ?? 0.6)) / 2;
}

export interface ScatterEnv {
  doc: ProjectDoc;
  mask: TerrainMask;
  /** Base scale multiplier (project asset scale). */
  baseScale: number;
  layerFor: (role: LayerRole) => string;
  shadow: number;
}

interface RoadInfo { path: PathObject; water: boolean }

export class ScatterStroke {
  private rng: Rng;
  private hash: SpatialHash;
  private roads: RoadInfo[] = [];
  private noiseSeed: number;
  private items: { item: CollectionItem; def: AssetDef }[];
  private meanR: number;
  private lastDab: Vec | null = null;
  placed: AssetObject[] = [];

  constructor(private env: ScatterEnv, items: CollectionItem[], private s: ScatterSettings, existing: SceneObject[]) {
    this.rng = mulberry32(s.seed);
    this.noiseSeed = s.seed % 10007;
    this.items = items.map((item) => ({ item, def: getAsset(item.assetId)! })).filter((x) => x.def && x.item.weight > 0);
    const avgScale = ((s.minScale + s.maxScale) / 2) * env.baseScale;
    this.meanR = this.items.length ? this.items.reduce((a, x) => a + footprintRadius(x.def, avgScale, avgScale), 0) / this.items.length : 10;
    this.hash = new SpatialHash(Math.max(16, this.meanR * 3));
    for (const o of existing) {
      if (o.type === 'asset') {
        const def = getAsset(o.assetId);
        if (!def) continue;
        this.hash.insert({ id: o.id, x: o.x, y: o.y, r: footprintRadius(def, o.sx, o.sy), cls: def.collision, role: def.role });
      } else if (o.type === 'path' && o.points.length > 1) {
        if (o.profile === 'road' || o.profile === 'trail' || o.profile === 'river' || o.profile === 'stream' || o.profile === 'wall') {
          this.roads.push({ path: o, water: o.profile === 'river' || o.profile === 'stream' });
        }
      }
    }
  }

  get empty() {
    return this.items.length === 0;
  }

  /** Distance to the nearest road/water path edge (negative inside), with the tangent angle. */
  private nearestPath(x: number, y: number, filter: (r: RoadInfo) => boolean, maxDist: number): { d: number; angle: number; nx: number; ny: number; px: number; py: number; half: number } | null {
    let best: { d: number; angle: number; nx: number; ny: number; px: number; py: number; half: number } | null = null;
    for (const r of this.roads) {
      if (!filter(r)) continue;
      const g = pathGeometry(r.path);
      const b = g.bounds;
      if (x < b.x - maxDist || y < b.y - maxDist || x > b.x + b.w + maxDist || y > b.y + b.h + maxDist) continue;
      const c = g.center;
      for (let i = 1; i < c.length; i++) {
        const ax = c[i - 1].x, ay = c[i - 1].y, bx = c[i].x, by = c[i].y;
        const dx = bx - ax, dy = by - ay;
        const l2 = dx * dx + dy * dy || 1;
        let t = ((x - ax) * dx + (y - ay) * dy) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = ax + dx * t, py = ay + dy * t;
        const half = (g.widths[i - 1] + (g.widths[i] - g.widths[i - 1]) * t) / 2;
        const d = Math.hypot(x - px, y - py) - half;
        if (!best || d < best.d) {
          const l = Math.sqrt(l2);
          best = { d, angle: Math.atan2(dy, dx), nx: -dy / l, ny: dx / l, px, py, half };
        }
      }
    }
    return best;
  }

  /** Stamp at a point. Returns newly created objects. */
  dab(x: number, y: number): AssetObject[] {
    if (this.empty) return [];
    const s = this.s;
    const R = s.size;
    // Keep dabs spaced along the stroke so dragging slowly doesn't overpopulate.
    if (this.lastDab && Math.hypot(x - this.lastDab.x, y - this.lastDab.y) < R * 0.45) return [];
    this.lastDab = { x, y };
    const rng = this.rng;
    const rules = s.rules;
    const noise = getNoise(this.noiseSeed + 5);
    const spacingR = Math.max(0.5, this.meanR * Math.max(0.15, s.spacing));
    const capacity = (R * R) / (spacingR * spacingR);
    const target = Math.min(90, Math.max(1, Math.round(capacity * s.density * 0.55)));
    const out: AssetObject[] = [];
    const attempts = target * 4;
    for (let a = 0; a < attempts && out.length < target; a++) {
      const rr = R * Math.sqrt(rng());
      const th = rng() * Math.PI * 2;
      let px = x + Math.cos(th) * rr * (0.4 + 0.6 * s.scatter) , py = y + Math.sin(th) * rr * (0.4 + 0.6 * s.scatter);
      if (px < 0 || py < 0 || px > this.env.doc.width || py > this.env.doc.height) continue;
      // Edge falloff & forest-edge thinning
      const edgeT = rr / R;
      let accept = 1 - s.edgeFalloff * smoothstep(0.45, 1, edgeT);
      if (rules.thinEdges) accept *= 1 - 0.5 * smoothstep(0.7, 1, edgeT);
      if (rules.cluster) {
        const n = noise.fbm(px / (this.meanR * 9 + 20), py / (this.meanR * 9 + 20), 3) * 0.5 + 0.5;
        accept *= smoothstep(0.25, 0.7, n) * 0.85 + 0.15;
      }
      if (rng() > accept) continue;
      const pick = weightedPick(rng, this.items, (x) => x.item.weight);
      if (!pick) continue;
      const def = pick.def;
      const scale = (s.minScale + (s.maxScale - s.minScale) * rng()) * this.env.baseScale;
      const fr = footprintRadius(def, scale, scale);
      const isTree = def.collision === 'tree' || def.role === 'vegetation';
      const isBuilding = def.collision === 'building';
      const mask = this.env.mask;
      // Water / void avoidance (land mask doubles as floor mask underground)
      if (rules.avoidWater && !rules.preferShore && !mask.isLand(px, py)) continue;
      let rotation = (rng() - 0.5) * 2 * s.rotation;
      if (rules.preferShore) {
        const onShore = mask.nearShore(px, py, Math.max(fr * 2.5, 6));
        const river = this.nearestPath(px, py, (r) => r.water, fr * 3);
        const nearRiver = river && river.d < fr * 1.5 && river.d > -river.half * 0.6;
        if (!onShore && !nearRiver) { if (rng() < 0.92) continue; }
        if (rules.avoidWater && !mask.isLand(px, py) && !onShore) continue;
      }
      if (rules.avoidWater || rules.avoidRoads) {
        const p = this.nearestPath(px, py, (r) => (r.water ? rules.avoidWater && !rules.preferShore : rules.avoidRoads), fr * 2);
        if (p && p.d < fr * 0.6) continue;
      }
      if (rules.alignRoads && (isBuilding || def.role === 'buildings')) {
        const road = this.nearestPath(px, py, (r) => !r.water && r.path.profile !== 'wall', R * 1.4);
        if (road && road.d < R) {
          // Pull the building to sit alongside the road, facing it.
          const side = (px - road.px) * road.nx + (py - road.py) * road.ny >= 0 ? 1 : -1;
          const setback = road.half + (def.h * scale) / 2 + fr * 0.15 + rng() * fr * 0.4;
          px = road.px + road.nx * side * setback;
          py = road.py + road.ny * side * setback;
          rotation = (road.angle * 180) / Math.PI + (side > 0 ? 0 : 180) + (rng() - 0.5) * 8;
        }
      }
      if (rules.nearMountains) {
        let near = false;
        this.hash.query(px, py, fr * 6 + 30, (e) => { if (e.role === 'mountains' || e.cls === 'rock') { near = true; return true; } });
        if (!near && rng() < 0.7) continue;
      }
      // Collisions & spacing
      let blocked = false;
      this.hash.query(px, py, fr + this.meanR * 4, (e) => {
        const d = Math.hypot(e.x - px, e.y - py);
        if (rules.collisions) {
          if ((isTree || isBuilding || def.collision === 'prop') && e.cls === 'building' && d < (fr + e.r) * 0.85) { blocked = true; return true; }
          if (isBuilding && (e.cls === 'building' || e.cls === 'tree' || e.cls === 'prop') && d < (fr + e.r) * 0.8) { blocked = true; return true; }
        }
        if (e.id.startsWith('~') || e.cls === def.collision) {
          // spacing among similar things — some natural overlap stays possible
          if (d < (fr + e.r) * 0.5 * s.spacing) { blocked = true; return true; }
        }
        if (rules.avoidBuildings && isTree && e.cls === 'building' && d < fr + e.r) { blocked = true; return true; }
      });
      if (blocked) continue;
      const cv = s.colorVariation;
      const bright = cv ? Math.round(((rng() - 0.5) * 2 * cv * 0.3) / 0.04) * 0.04 : 0;
      const hue = cv ? Math.round(((rng() - 0.5) * 2 * cv * 14) / 4) * 4 : 0;
      const o: AssetObject = {
        id: uid('o'), type: 'asset', layerId: this.env.layerFor(def.role), assetId: def.id,
        x: px, y: py, sx: scale, sy: scale, rotation, flipX: s.flip ? rng() < 0.5 : false, flipY: false,
        opacity: 1, shadow: this.env.shadow, blur: 0, brightness: bright || undefined, hue: hue || undefined,
      };
      this.hash.insert({ id: '~' + o.id, x: px, y: py, r: fr, cls: def.collision, role: def.role });
      out.push(o);
    }
    this.placed.push(...out);
    return out;
  }
}
