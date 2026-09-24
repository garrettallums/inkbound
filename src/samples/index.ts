import { uid } from '../core/ids';
import { mulberry32, type Rng } from '../core/rng';
import { pointInPolygon, type Vec } from '../core/geom';
import { Editor } from '../editor/editor';
import { library } from '../editor/library';
import { BRUSH_PRESETS } from '../editor/settings';
import { defaultScatter, type ScatterSettings } from '../engine/collections';
import type { TextureBrush } from '../engine/paintLayer';
import { presetById } from '../engine/paths';
import { ScatterStroke } from '../engine/scatter';
import { createProjectDoc, lightingFromPreset } from '../model/defaults';
import type { AssetObject, EffectKind, PathObject, SceneObject, TextObject } from '../model/types';
import { makeEffect, makeLight, makeText } from '../tools/misc';
import { installTools } from '../tools';
import { toast } from '../ui/toast';
import { pendingEditors } from '../ui/router';

/**
 * The two test maps from the specification (§64–65), assembled with the same
 * public editor APIs a user drives through the UI: terrain brush, texture
 * brush, scatter brush, path engine, labels, lights and effects.
 */

type Zone = { x: number; y: number; r: number };

function brushFor(presetId: string, size: number, extra: Partial<TextureBrush> = {}): TextureBrush {
  const p = BRUSH_PRESETS.find((b) => b.id === presetId)!;
  return { mix: p.mix.map((m) => ({ ...m })), size, opacity: 0.85, flow: 0.6, hardness: 0.3, softness: 0.75, textureScale: 1, rotation: 0, rotationVariation: 180, erase: false, ...extra };
}

function paintLayer(ed: Editor) {
  const l = ed.doc.layers.find((x) => x.kind === 'paint')!;
  return ed.paint.get(l.id)!;
}

/** Paint a texture over a polygon area using overlapping jittered dabs. */
function paintArea(ed: Editor, brush: TextureBrush, poly: Vec[], rng: Rng, spacing = 0.55) {
  const layer = paintLayer(ed);
  layer.beginEdit(Math.floor(rng() * 1e6));
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const step = brush.size * spacing;
  for (let y = Math.min(...ys); y <= Math.max(...ys); y += step) {
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
      const p = { x: x + (rng() - 0.5) * step, y: y + (rng() - 0.5) * step };
      if (pointInPolygon(p, poly)) layer.dab(brush, p.x, p.y);
    }
  }
  const patch = layer.endEdit();
  if (patch) ed.pushRaster(patch, 'Paint texture');
}

function paintStroke(ed: Editor, brush: TextureBrush, pts: Vec[], rng: Rng) {
  const layer = paintLayer(ed);
  layer.beginEdit(Math.floor(rng() * 1e6));
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (brush.size * 0.3)));
    for (let k = 0; k < n; k++) layer.dab(brush, a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n);
  }
  const patch = layer.endEdit();
  if (patch) ed.pushRaster(patch, 'Paint texture');
}

function circle(cx: number, cy: number, r: number, n = 18, rng?: Rng): Vec[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = rng ? 0.8 + rng() * 0.35 : 1;
    return { x: cx + Math.cos(a) * r * k, y: cy + Math.sin(a) * r * k };
  });
}

/** Organic (non-circular) clearing test: the radius wobbles with angle. */
function inZone(p: Vec, z: Zone) {
  const a = Math.atan2(p.y - z.y, p.x - z.x);
  const r = z.r * (1 + 0.22 * Math.sin(3 * a + z.x * 0.013) + 0.1 * Math.sin(7 * a + z.y * 0.017));
  return Math.hypot(p.x - z.x, p.y - z.y) < r;
}

/** Run the scatter brush over an area (dabs on a jittered grid), skipping exclusion zones. */
function scatterArea(ed: Editor, collectionId: string, area: Vec[], exclude: Zone[], over: Omit<Partial<ScatterSettings>, 'rules'> & { rules?: Partial<ScatterSettings['rules']> }, rng: Rng): AssetObject[] {
  const coll = library.getCollection(collectionId);
  if (!coll) return [];
  const base = defaultScatter(ed.doc.assetPack, Math.floor(rng() * 900000) + 100000);
  const k = ed.doc.assetPack === 'atlas' ? ed.doc.assetScale : 1;
  const settings: ScatterSettings = {
    ...base, ...(coll.settings ?? {}), ...over,
    size: (over.size ?? coll.settings?.size ?? base.size) * (over.size ? 1 : k),
    rules: { ...base.rules, ...(coll.settings?.rules ?? {}), ...(over.rules ?? {}) },
  } as ScatterSettings;
  const existing = Object.values(ed.doc.objects);
  const stroke = new ScatterStroke({ doc: ed.doc, mask: ed.mask, baseScale: ed.doc.assetScale, shadow: ed.doc.assetPack === 'atlas' ? 0.35 : 0.6, layerFor: (role) => ed.targetLayer(role).id }, coll.items, settings, existing);
  const xs = area.map((p) => p.x), ys = area.map((p) => p.y);
  const step = settings.size * 0.5;
  const out: AssetObject[] = [];
  let row = 0;
  for (let y = Math.min(...ys); y <= Math.max(...ys); y += step, row++) {
    for (let x = Math.min(...xs) + (row % 2) * step * 0.5; x <= Math.max(...xs); x += step) {
      const p = { x: x + (rng() - 0.5) * step * 0.4, y: y + (rng() - 0.5) * step * 0.4 };
      if (!pointInPolygon(p, area)) continue;
      for (const o of stroke.dab(p.x, p.y)) {
        if (!pointInPolygon(o, area)) continue;
        if (exclude.some((z) => inZone(o, z))) continue;
        out.push(o);
      }
    }
  }
  ed.putObjects(out, `Scatter ${coll.name}`);
  return out;
}

function pathObj(ed: Editor, presetId: string, pts: Vec[], extra: Partial<PathObject> = {}): PathObject {
  const p = presetById(presetId);
  const w = ed.doc.assetPack === 'atlas' ? p.widthAtlas * ed.doc.assetScale : p.widthTD;
  return {
    id: uid('o'), type: 'path', layerId: ed.targetLayer(p.profile === 'wall' ? 'buildings' : 'paths').id, profile: p.profile, style: p.style,
    points: pts.map((q) => ({ ...q })), closed: false, width: w, opacity: 1, color: p.color, roughness: p.roughness, meander: p.meander,
    smoothing: p.smoothing, taper: p.taper, widthVariation: p.widthVariation, shadow: p.shadow, seed: Math.floor(Math.random() * 1e6),
    details: { ...p.details }, textureScale: 1, ...extra,
  };
}

function asset(ed: Editor, assetId: string, x: number, y: number, extra: Partial<AssetObject> = {}): AssetObject {
  const s = ed.doc.assetScale;
  return {
    id: uid('o'), type: 'asset', layerId: ed.targetLayer(null).id, assetId, x, y, sx: s, sy: s, rotation: 0, flipX: false, flipY: false,
    opacity: 1, shadow: ed.doc.assetPack === 'atlas' ? 0.35 : 0.6, blur: 0, ...extra,
  };
}

function place(ed: Editor, list: SceneObject[], label: string) {
  ed.putObjects(list, label);
}

function withRole(ed: Editor, o: AssetObject, role: Parameters<Editor['targetLayer']>[0]): AssetObject {
  return { ...o, layerId: ed.targetLayer(role).id };
}

function label(ed: Editor, text: string, x: number, y: number, preset: string, extra: Partial<TextObject> = {}): TextObject {
  return { ...makeText(ed, x, y, preset, text), ...extra };
}

// ---------------------------------------------------------------------------------------------- Varren's Forest

async function buildVarren(): Promise<Editor> {
  const doc = createProjectDoc({ name: "Varren's Forest", mapType: 'region', width: 2560, height: 1600, theme: 'painted', seed: 284729 });
  doc.theme = { ...doc.theme, landTexture: 'meadow', waterTexture: 'deep-water' };
  const ed = Editor.create(doc, 'land');
  installTools(ed);
  ed.toast = toast;
  const rng = mulberry32(284729);
  const W = doc.width, H = doc.height;
  const k = doc.assetScale;

  // --- Terrain: a small northern lake feeding the river, a pond near the cave
  ed.mask.beginEdit();
  for (let i = 0; i < 26; i++) ed.mask.dab('remove', 1980 + Math.cos(i / 4) * 60 + i * 3, 150 + Math.sin(i / 3) * 40, 70, 0.7);
  for (let i = 0; i < 10; i++) ed.mask.dab('remove', 520 + i * 6, 360 + Math.sin(i) * 10, 34, 0.7);
  const mp = ed.mask.endEdit();
  if (mp) ed.pushRaster(mp, 'Terrain');
  ed.terrain.markEdited({ x: 0, y: 0, w: W, h: H });
  ed.terrain.rebuild(true);

  // --- Key locations (kept well apart — spec asks for meaningful distances)
  const riverX = (y: number) => 1960 + Math.sin(y / 260) * 70 + (y / H) * 60;
  const farm = { x: 1050, y: 1400, r: 230 };
  const village = { x: riverX(1250) + 190, y: 1250, r: 190 };
  const camp = { x: 720, y: 820, r: 85 };
  const elk = { x: 1320, y: 560, r: 80 };
  const shack = { x: 360, y: 1180, r: 80 };
  const cave = { x: 560, y: 330, r: 70 };
  const rocky = { x: 1500, y: 980, r: 110 };

  // --- Ground textures
  const forestPoly: Vec[] = [{ x: 0, y: 0 }, { x: riverX(0) - 90, y: 0 }, { x: riverX(800) - 90, y: 800 }, { x: riverX(1600) - 120, y: H }, { x: 0, y: H }];
  paintArea(ed, brushFor('forest-floor', 150 * k * 0.6, { opacity: 0.7 }), forestPoly, rng, 0.7);
  paintArea(ed, brushFor('farmland', 90, { opacity: 0.9, hardness: 0.45 }), circle(farm.x, farm.y, farm.r * 0.9, 20, rng), rng, 0.45);
  paintArea(ed, brushFor('meadow', 70), circle(farm.x, farm.y - 40, farm.r * 1.15, 20, rng), rng, 0.8);
  paintArea(ed, brushFor('dirt-path', 60, { opacity: 0.6 }), circle(village.x, village.y, village.r * 0.8, 16, rng), rng, 0.6);
  paintArea(ed, brushFor('autumn', 50, { opacity: 0.7 }), circle(elk.x, elk.y, elk.r, 14, rng), rng, 0.6);
  paintArea(ed, brushFor('rocky', 60, { opacity: 0.8 }), circle(rocky.x, rocky.y, rocky.r, 14, rng), rng, 0.6);
  paintArea(ed, brushFor('rocky', 50, { opacity: 0.7 }), circle(cave.x, cave.y, cave.r * 1.2, 14, rng), rng, 0.6);
  paintArea(ed, brushFor('swamp', 45, { opacity: 0.6 }), circle(shack.x, shack.y, shack.r * 1.1, 14, rng), rng, 0.6);

  // --- River (north → south along the east side), streams and trails
  const riverPts: Vec[] = [];
  for (let y = 120; y <= H + 20; y += 160) riverPts.push({ x: riverX(y), y });
  const river = pathObj(ed, 'river', riverPts, { width: 10 * k, details: { reeds: true, rocks: true, rapids: false, islands: true, banks: true } });
  const stream = pathObj(ed, 'stream', [{ x: 560, y: 380 }, { x: 760, y: 470 }, { x: 1000, y: 430 }, { x: 1300, y: 330 }, { x: 1600, y: 380 }, { x: riverX(420) - 4, y: 420 }], { width: 4 * k });
  const trails = [
    pathObj(ed, 'trail', [{ x: village.x - 40, y: village.y }, { x: riverX(1250) + 10, y: 1250 }, { x: 1700, y: 1180 }, { x: 1500, y: 1000 }, { x: 1250, y: 880 }, { x: camp.x + 60, y: camp.y + 30 }]),
    pathObj(ed, 'trail', [{ x: camp.x - 40, y: camp.y + 40 }, { x: 560, y: 1000 }, { x: shack.x + 30, y: shack.y - 30 }]),
    pathObj(ed, 'trail', [{ x: camp.x, y: camp.y - 50 }, { x: 640, y: 560 }, { x: cave.x + 20, y: cave.y + 50 }]),
    pathObj(ed, 'trail', [{ x: 1250, y: 880 }, { x: 1300, y: 700 }, { x: elk.x, y: elk.y + 60 }]),
    pathObj(ed, 'road-dirt', [{ x: farm.x + 120, y: farm.y - 80 }, { x: 1500, y: 1330 }, { x: riverX(1300) - 30, y: 1300 }], { width: 3 * k }),
    pathObj(ed, 'road-dirt', [{ x: village.x + 60, y: village.y + 30 }, { x: 2400, y: 1400 }, { x: W + 20, y: 1450 }], { width: 3 * k }),
  ];
  place(ed, [river, stream, ...trails], 'Rivers & trails');

  // --- Forests: dense conifers west of the river, thinner to the east
  const clearings: Zone[] = [
    { ...farm, r: farm.r * 1.2 }, { ...village, r: village.r * 1.35 }, { ...camp, r: camp.r * 1.4 }, { ...elk, r: elk.r * 1.2 },
    { ...shack, r: shack.r * 0.9 }, { ...cave, r: cave.r * 1.3 }, { ...rocky, r: rocky.r * 0.9 },
  ];
  scatterArea(ed, 'atlas:conifer', forestPoly, clearings, { density: 0.62, spacing: 0.95, size: 70 * k }, rng);
  scatterArea(ed, 'atlas:dark-pine', circle(420, 620, 260, 16, rng), clearings, { density: 0.7, spacing: 0.9, size: 60 * k }, rng);
  const eastPoly: Vec[] = [{ x: riverX(0) + 70, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: riverX(H) + 90, y: H }];
  scatterArea(ed, 'atlas:mixed', eastPoly, clearings, { density: 0.3, spacing: 1, size: 70 * k }, rng);
  scatterArea(ed, 'atlas:marsh', circle(shack.x - 40, shack.y + 60, 130, 14, rng), [{ ...shack, r: 50 }], { density: 0.5, size: 40 * k, rules: { avoidWater: false } }, rng);

  // --- Settlement, farm, camp, shack, cave, rocks
  const items: AssetObject[] = [];
  const houses = [[-60, -50], [30, -80], [90, -10], [-20, 40], [70, 70], [-90, 60], [140, 40]];
  houses.forEach(([dx, dy], i) => items.push(withRole(ed, asset(ed, 'atlas/icon-house', village.x + dx * k * 0.9, village.y + dy * k * 0.7, { flipX: i % 2 === 0 }), 'buildings')));
  items.push(withRole(ed, asset(ed, 'atlas/icon-tower', village.x + 10, village.y - 20), 'buildings'));
  items.push(withRole(ed, asset(ed, 'atlas/icon-bridge', riverX(1250), 1250, { sx: k * 0.8, sy: k * 0.8, rotation: 0 }), 'buildings'));
  items.push(withRole(ed, asset(ed, 'atlas/icon-farm', farm.x - 40, farm.y - 60, { sx: k * 1.3, sy: k * 1.3 }), 'buildings'));
  items.push(withRole(ed, asset(ed, 'atlas/icon-house', farm.x + 60, farm.y - 110), 'buildings'));
  items.push(withRole(ed, asset(ed, 'atlas/icon-camp', camp.x, camp.y, { sx: k * 1.1, sy: k * 1.1 }), 'buildings'));
  items.push(withRole(ed, asset(ed, 'atlas/icon-house', shack.x, shack.y, { saturation: -0.6, brightness: -0.12, hue: 60, rotation: -4 }), 'buildings'));
  items.push(withRole(ed, asset(ed, 'atlas/dead-tree', shack.x - 30, shack.y - 10), 'vegetation'));
  items.push(withRole(ed, asset(ed, 'atlas/dead-tree', shack.x + 34, shack.y + 4, { flipX: true }), 'vegetation'));
  items.push(withRole(ed, asset(ed, 'atlas/icon-cave', cave.x, cave.y, { sx: k * 1.3, sy: k * 1.3 }), 'mountains'));
  items.push(withRole(ed, asset(ed, 'atlas/hill-rocky', cave.x - 60, cave.y - 30), 'mountains'));
  items.push(withRole(ed, asset(ed, 'atlas/hill-rocky', cave.x + 70, cave.y - 20, { flipX: true }), 'mountains'));
  items.push(withRole(ed, asset(ed, 'atlas/mesa', rocky.x, rocky.y - 20, { sx: k * 0.9, sy: k * 0.9 }), 'mountains'));
  items.push(withRole(ed, asset(ed, 'atlas/hill-rocky', rocky.x - 80, rocky.y + 30), 'mountains'));
  items.push(withRole(ed, asset(ed, 'atlas/hills', rocky.x + 70, rocky.y + 50), 'mountains'));
  items.push(withRole(ed, asset(ed, 'atlas/mtn-peak', 2300, 260, { sx: k * 1.2, sy: k * 1.2 }), 'mountains'));
  items.push(withRole(ed, asset(ed, 'atlas/ridge-small', 2400, 380), 'mountains'));
  items.push(withRole(ed, asset(ed, 'atlas/shield-2', elk.x, elk.y - 10, { sx: k * 0.8, sy: k * 0.8 }), 'labels'));
  items.push(withRole(ed, asset(ed, 'atlas/compass', W - 150, H - 150, { sx: 0.9, sy: 0.9, shadow: 0 }), 'labels'));
  place(ed, items, 'Place locations');

  // --- Labels
  const labels: TextObject[] = [
    label(ed, "Varren's Forest", 820, 170, 'region', { size: Math.round(46 * k * 0.8), letterSpacing: 0.4, curve: 0.08 }),
    label(ed, 'Varren River', riverX(760) + 34, 760, 'water', { rotation: 82, size: Math.round(17 * k) }),
    label(ed, 'Mossbrook', village.x, village.y + village.r * 0.75, 'city'),
    label(ed, 'Ashfield Farm', farm.x, farm.y + farm.r * 0.55, 'village'),
    label(ed, "Hunters' Camp", camp.x, camp.y + 44 * k, 'village'),
    label(ed, 'Elk-Kill Clearing', elk.x, elk.y + 40 * k, 'village', { italic: true }),
    label(ed, "Hedge Mage's Shack\n(abandoned)", shack.x, shack.y + 44 * k, 'village', { italic: true }),
    label(ed, 'Hollow Cave', cave.x, cave.y + 36 * k, 'village'),
    label(ed, 'The Grey Tors', rocky.x, rocky.y + 70 * k, 'mountains', { size: Math.round(14 * k) }),
    label(ed, 'Stillwater', 1990, 150, 'water', { size: Math.round(14 * k), curve: 0 }),
  ];
  place(ed, labels, 'Labels');

  // --- Lighting: late golden afternoon + a faint magical glow at the shack, light mist
  ed.setKey('lighting', { ...lightingFromPreset('day', 225), temperature: 0.08, shadowIntensity: 0.5 }, 'Lighting');
  const glow = makeLight(ed, shack.x, shack.y - 6, 'magic');
  place(ed, [{ ...glow, radius: 60 * k, intensity: 0.9 }], 'Light');
  const mist = makeEffect(ed, 'mist', { x: 1700, y: 0, w: 700, h: H });
  place(ed, [{ ...mist, intensity: 0.28 }], 'Mist');
  ed.history.clear();
  return ed;
}

// ---------------------------------------------------------------------------------------------- Adventurer Camp

async function buildCamp(): Promise<Editor> {
  const doc = createProjectDoc({ name: 'Adventurer Camp (Twilight)', mapType: 'camp', width: 2100, height: 1540, theme: 'field', seed: 65065 });
  doc.grid = { ...doc.grid, type: 'none' };
  const ed = Editor.create(doc, 'land');
  installTools(ed);
  ed.toast = toast;
  const rng = mulberry32(65065);
  const W = doc.width, H = doc.height;
  const C = { x: 1030, y: 760 };

  // --- Terrain: a stream pool in the north-east corner
  ed.mask.beginEdit();
  const pond = [[1880, 120], [1960, 200], [2060, 260], [2140, 300], [1800, 60], [1720, 20]];
  for (const [x, y] of pond) ed.mask.dab('remove', x, y, 150, 0.6);
  const mp = ed.mask.endEdit();
  if (mp) ed.pushRaster(mp, 'Terrain');
  ed.terrain.markEdited({ x: 0, y: 0, w: W, h: H });
  ed.terrain.rebuild(true);

  // --- Ground: forest floor at the edges, trampled dirt in camp
  paintArea(ed, brushFor('forest-floor', 170, { opacity: 0.8 }), [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], rng, 0.75);
  paintArea(ed, brushFor('meadow', 150, { opacity: 0.8 }), circle(C.x, C.y, 560, 22, rng), rng, 0.6);
  paintArea(ed, brushFor('dirt-path', 110, { opacity: 0.85 }), circle(C.x, C.y, 330, 20, rng), rng, 0.5);
  paintArea(ed, brushFor('dirt-path', 60, { opacity: 0.9 }), circle(C.x, C.y, 140, 14, rng), rng, 0.45);

  // --- Footpaths: from each tent to the fire and a trail out of camp
  const tents: { id: string; a: number; r: number; tint?: Partial<AssetObject> }[] = [
    { id: 'td/tent-cloth-a', a: -100, r: 330 },
    { id: 'td/tent-leather-a', a: -40, r: 350, tint: { hue: -6 } },
    { id: 'td/tent-cloth-b', a: 20, r: 320 },
    { id: 'td/tent-round-leather', a: 85, r: 340 },
    { id: 'td/tent-leather-b', a: 150, r: 330, tint: { brightness: -0.06 } },
    { id: 'td/tent-cloth-c', a: 210, r: 345, tint: { saturation: -0.15 } },
  ];
  const tentPos = tents.map((t) => {
    const rad = (t.a * Math.PI) / 180;
    return { x: C.x + Math.cos(rad) * t.r * 1.15, y: C.y + Math.sin(rad) * t.r * 0.95, rad };
  });
  const paths: PathObject[] = tentPos.map((p, i) => pathObj(ed, 'trail', [{ x: p.x, y: p.y }, { x: (p.x + C.x) / 2 + (rng() - 0.5) * 30, y: (p.y + C.y) / 2 + (rng() - 0.5) * 30 }, { x: C.x + Math.cos(p.rad) * 90, y: C.y + Math.sin(p.rad) * 90 }], { width: 34 + (i % 3) * 5, details: { ruts: false, grass: true, stones: false, mud: false, wear: true } }));
  paths.push(pathObj(ed, 'trail', [{ x: C.x - 120, y: C.y + 80 }, { x: 700, y: 1050 }, { x: 420, y: 1250 }, { x: 150, y: H + 30 }], { width: 55 }));
  paths.push(pathObj(ed, 'stream', [{ x: 1880, y: 180 }, { x: 1760, y: 420 }, { x: 1830, y: 700 }, { x: 1760, y: 1000 }, { x: 1880, y: 1300 }, { x: 1820, y: H + 30 }], { width: 60 }));
  place(ed, paths, 'Footpaths');

  // --- Six primary tents, each facing the fire with slight differences
  const objs: AssetObject[] = [];
  tents.forEach((t, i) => {
    const p = tentPos[i];
    const facing = (Math.atan2(C.y - p.y, C.x - p.x) * 180) / Math.PI;
    objs.push(withRole(ed, asset(ed, t.id, p.x, p.y, { rotation: facing, sx: 1 + (rng() - 0.5) * 0.1, sy: 1 + (rng() - 0.5) * 0.1, ...(t.tint ?? {}) }), 'buildings'));
    // bedroll & belongings outside each tent
    const bx = p.x + Math.cos(p.rad + Math.PI) * 120, by = p.y + Math.sin(p.rad + Math.PI) * 120;
    const bed = ['td/bedroll-a', 'td/bedroll-b', 'td/bedroll-c'][i % 3];
    objs.push(withRole(ed, asset(ed, bed, bx + Math.cos(p.rad + Math.PI / 2) * 60, by + Math.sin(p.rad + Math.PI / 2) * 60, { rotation: facing + 90 + (rng() - 0.5) * 30 }), 'ground'));
    objs.push(withRole(ed, asset(ed, 'td/pack', bx - Math.cos(p.rad + Math.PI / 2) * 55, by - Math.sin(p.rad + Math.PI / 2) * 55, { rotation: rng() * 360 }), 'details'));
    if (i % 2 === 0) objs.push(withRole(ed, asset(ed, 'td/shield-round', p.x + Math.cos(p.rad + 1.2) * 110, p.y + Math.sin(p.rad + 1.2) * 110), 'details'));
    if (i % 3 === 1) objs.push(withRole(ed, asset(ed, 'td/waterskin', p.x + Math.cos(p.rad - 1.1) * 100, p.y + Math.sin(p.rad - 1.1) * 100, { rotation: rng() * 360 }), 'details'));
  });
  // central fire, cooking area & seating
  objs.push(withRole(ed, asset(ed, 'td/campfire', C.x, C.y, { sx: 1.3, sy: 1.3, shadow: 0 }), 'details'));
  objs.push(withRole(ed, asset(ed, 'td/cooking-pot', C.x + 95, C.y - 55), 'details'));
  objs.push(withRole(ed, asset(ed, 'td/firewood', C.x - 140, C.y - 95, { rotation: 20 }), 'details'));
  objs.push(withRole(ed, asset(ed, 'td/woodpile', C.x + 190, C.y + 130, { rotation: -15 }), 'details'));
  objs.push(withRole(ed, asset(ed, 'td/log-seat', C.x, C.y - 150, { rotation: 5 }), 'details'));
  objs.push(withRole(ed, asset(ed, 'td/log-seat', C.x - 150, C.y + 40, { rotation: 80 }), 'details'));
  objs.push(withRole(ed, asset(ed, 'td/bench', C.x + 60, C.y + 150, { rotation: -10 }), 'details'));
  objs.push(withRole(ed, asset(ed, 'td/table-camp', C.x + 250, C.y - 20, { rotation: 80 }), 'details'));
  objs.push(withRole(ed, asset(ed, 'td/food-basket', C.x + 255, C.y + 10), 'details'));
  objs.push(withRole(ed, asset(ed, 'td/bucket', C.x + 140, C.y - 110), 'details'));
  objs.push(withRole(ed, asset(ed, 'td/hide', C.x - 260, C.y - 30, { rotation: 30 }), 'ground'));
  objs.push(withRole(ed, asset(ed, 'td/rope', C.x - 230, C.y + 120), 'details'));
  // supply corner: barrels & crates
  const supply = { x: C.x + 520, y: C.y + 420 };
  [[0, 0, 'td/crate-long', 10], [60, -50, 'td/crate', -8], [-55, -40, 'td/barrel', 0], [-60, 20, 'td/barrel', 0], [-10, 60, 'td/crate', 25], [70, 40, 'td/barrel', 0]].forEach(([dx, dy, id, r]) =>
    objs.push(withRole(ed, asset(ed, id as string, supply.x + (dx as number), supply.y + (dy as number), { rotation: r as number }), 'details')));
  objs.push(withRole(ed, asset(ed, 'td/weapon-rack', C.x - 420, C.y + 330, { rotation: 35 }), 'details'));
  objs.push(withRole(ed, asset(ed, 'td/sword', C.x - 360, C.y + 390, { rotation: -20 }), 'details'));
  objs.push(withRole(ed, asset(ed, 'td/axe', C.x + 330, C.y + 250, { rotation: 60 }), 'details'));
  objs.push(withRole(ed, asset(ed, 'td/lantern', tentPos[0].x + 90, tentPos[0].y + 40), 'details'));
  objs.push(withRole(ed, asset(ed, 'td/lantern', supply.x - 100, supply.y - 60), 'details'));
  objs.push(withRole(ed, asset(ed, 'td/cart', C.x - 620, C.y - 380, { rotation: -30 }), 'details'));
  place(ed, objs, 'Camp');

  // --- Surrounding wilderness
  const clearing: Zone[] = [{ x: C.x, y: C.y, r: 640 }, { x: 1880, y: 180, r: 200 }];
  const all: Vec[] = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  scatterArea(ed, 'td:conifer', all, clearing, { density: 0.75, size: 300 }, rng);
  scatterArea(ed, 'td:undergrowth', all, [{ x: C.x, y: C.y, r: 520 }], { density: 0.35, size: 300 }, rng);
  scatterArea(ed, 'td:rocks', circle(1500, 1250, 220, 12, rng), [], { density: 0.4, size: 220, rules: { nearMountains: false } }, rng);
  scatterArea(ed, 'td:reed-bank', circle(1880, 200, 260, 14, rng), [], { density: 0.6, size: 200 }, rng);

  // --- Twilight: cool blue-purple ambient vs. warm orange campfire
  ed.setKey('lighting', { ...lightingFromPreset('twilight', 230), ambient: 0.46 }, 'Lighting');
  const lights = [
    { ...makeLight(ed, C.x, C.y, 'campfire'), radius: 620, intensity: 1.35, shadowStrength: 0.7 },
    { ...makeLight(ed, tentPos[0].x + 90, tentPos[0].y + 40, 'lantern'), radius: 190 },
    { ...makeLight(ed, supply.x - 100, supply.y - 60, 'lantern'), radius: 200 },
  ];
  place(ed, lights, 'Lights');
  const effects = [
    { ...makeEffect(ed, 'embers' as EffectKind, { x: C.x - 160, y: C.y - 260, w: 320, h: 300 }), intensity: 0.6 },
    { ...makeEffect(ed, 'smoke' as EffectKind, { x: C.x - 120, y: C.y - 420, w: 260, h: 380 }), intensity: 0.25 },
    { ...makeEffect(ed, 'mist' as EffectKind, null), intensity: 0.22 },
    { ...makeEffect(ed, 'vignette' as EffectKind, null), intensity: 0.45 },
  ];
  place(ed, effects, 'Atmosphere');
  const title = label(ed, 'The Six Tents', 480, 100, 'region', { size: 54, color: '#f1e6cc', outline: 4, outlineColor: '#1b1712' });
  place(ed, [title], 'Label');
  ed.history.clear();
  return ed;
}

export async function buildSample(which: 'varren' | 'camp'): Promise<string> {
  await library.load();
  const ed = which === 'varren' ? await buildVarren() : await buildCamp();
  await ed.save(true);
  pendingEditors.set(ed.doc.id, ed);
  return ed.doc.id;
}
