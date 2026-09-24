import { uid } from '../core/ids';
import { randomSeed } from '../core/rng';
import type {
  GridSettings, Layer, LayerKind, LayerRole, LightingPreset, LightingSettings, MapType, ProjectDoc, TerrainTheme,
} from './types';

export interface MapTypeInfo {
  id: MapType;
  label: string;
  blurb: string;
  theme: string;
  pack: 'atlas' | 'topdown';
  grid: GridSettings['type'];
  gridSize: number;
  /** Base asset scale relative to a 1920px wide map (atlas) or 70px cells (top-down). */
  assetScale: number;
  start: StartTerrain;
  lighting: LightingPreset;
}

export type StartTerrain = 'water' | 'land' | 'landmass' | 'islands' | 'lake' | 'river-valley' | 'cavern' | 'rooms';

export const MAP_TYPES: MapTypeInfo[] = [
  { id: 'world', label: 'World', blurb: 'Continents, oceans, nations, mountain ranges, large-scale geography.', theme: 'painted', pack: 'atlas', grid: 'none', gridSize: 64, assetScale: 0.8, start: 'islands', lighting: 'none' },
  { id: 'region', label: 'Region', blurb: 'Forests, valleys, islands, mountain regions, coastlines, wilderness.', theme: 'painted', pack: 'atlas', grid: 'none', gridSize: 64, assetScale: 1, start: 'landmass', lighting: 'none' },
  { id: 'settlement', label: 'Settlement', blurb: 'Cities, towns, villages, ports and farms.', theme: 'field', pack: 'topdown', grid: 'none', gridSize: 70, assetScale: 0.5, start: 'land', lighting: 'day' },
  { id: 'battlemap', label: 'Battlemap', blurb: 'Tactical tabletop encounters.', theme: 'field', pack: 'topdown', grid: 'square', gridSize: 70, assetScale: 1, start: 'land', lighting: 'day' },
  { id: 'dungeon', label: 'Dungeon', blurb: 'Constructed underground environments.', theme: 'dungeon', pack: 'topdown', grid: 'square', gridSize: 70, assetScale: 1, start: 'rooms', lighting: 'none' },
  { id: 'cave', label: 'Cave', blurb: 'Natural underground environments.', theme: 'cave', pack: 'topdown', grid: 'square', gridSize: 70, assetScale: 1, start: 'cavern', lighting: 'none' },
  { id: 'camp', label: 'Camp', blurb: 'Temporary settlements and adventurer camps.', theme: 'field', pack: 'topdown', grid: 'none', gridSize: 70, assetScale: 1, start: 'land', lighting: 'twilight' },
  { id: 'interior', label: 'Interior', blurb: 'Taverns, houses, castles, temples, shops.', theme: 'interior', pack: 'topdown', grid: 'square', gridSize: 70, assetScale: 1, start: 'rooms', lighting: 'none' },
];

export const mapTypeInfo = (t: MapType) => MAP_TYPES.find((m) => m.id === t) ?? MAP_TYPES[1];

export const CANVAS_PRESETS = [
  { id: 'hd', label: '1920 × 1080', w: 1920, h: 1080 },
  { id: 'qhd', label: '2560 × 1440', w: 2560, h: 1440 },
  { id: '4k', label: '3840 × 2160', w: 3840, h: 2160 },
  { id: 'square', label: 'Square', w: 2400, h: 2400 },
  { id: 'portrait', label: 'Portrait', w: 1800, h: 2400 },
  { id: 'landscape', label: 'Landscape', w: 3000, h: 2000 },
] as const;

export const MAX_MAP_DIM = 16384;
export const MIN_MAP_DIM = 256;

export const THEMES: Record<string, TerrainTheme> = {
  painted: {
    name: 'Painted Isles', waterTexture: 'ocean', landTexture: 'meadow', waterColor: '#54727c', landColor: '#8d8a4f',
    coastStyle: 'painted', outlineColor: '#1b1813', outlineWidth: 2.6, glowColor: '#d5ecec', glowWidth: 26, ripples: 2,
    rippleColor: '#b9d3d5', shoreTexture: null, shoreWidth: 0, innerShade: 0.35, textureScale: 1,
  },
  parchment: {
    name: 'Parchment Atlas', waterTexture: 'parchment', landTexture: 'parchment-land', waterColor: '#e6dcc6', landColor: '#ece3cf',
    coastStyle: 'ink', outlineColor: '#211a14', outlineWidth: 3.2, glowColor: '#d9ccb0', glowWidth: 0, ripples: 3,
    rippleColor: '#4a3c2e', shoreTexture: null, shoreWidth: 0, innerShade: 0.12, textureScale: 1,
  },
  field: {
    name: 'Green Field', waterTexture: 'shallow-water', landTexture: 'grass', waterColor: '#4f8a8b', landColor: '#6f8a3e',
    coastStyle: 'soft', outlineColor: '#3a3524', outlineWidth: 0, glowColor: '#9fcfc4', glowWidth: 18, ripples: 0,
    rippleColor: '#d6efe9', shoreTexture: 'sand', shoreWidth: 22, innerShade: 0.15, textureScale: 1,
  },
  snow: {
    name: 'Frozen North', waterTexture: 'deep-water', landTexture: 'snow', waterColor: '#3e5d73', landColor: '#e9eef2',
    coastStyle: 'painted', outlineColor: '#26303a', outlineWidth: 2.2, glowColor: '#e4f3fb', glowWidth: 22, ripples: 1,
    rippleColor: '#b9d6e6', shoreTexture: null, shoreWidth: 0, innerShade: 0.2, textureScale: 1,
  },
  desert: {
    name: 'Sunbaked Coast', waterTexture: 'ocean', landTexture: 'sand', waterColor: '#3f7f8c', landColor: '#d8b878',
    coastStyle: 'painted', outlineColor: '#2a2016', outlineWidth: 2.4, glowColor: '#f2e6c4', glowWidth: 22, ripples: 2,
    rippleColor: '#bfe0de', shoreTexture: null, shoreWidth: 0, innerShade: 0.25, textureScale: 1,
  },
  cave: {
    name: 'Cavern', waterTexture: 'cave-rock', landTexture: 'cave-floor', waterColor: '#1f1c1a', landColor: '#6b6053',
    coastStyle: 'cave', outlineColor: '#0e0c0b', outlineWidth: 5, glowColor: '#000000', glowWidth: 34, ripples: 0,
    rippleColor: '#000000', shoreTexture: null, shoreWidth: 0, innerShade: 0.55, textureScale: 1,
  },
  dungeon: {
    name: 'Dungeon', waterTexture: 'dungeon-void', landTexture: 'flagstone', waterColor: '#16151a', landColor: '#77736b',
    coastStyle: 'dungeon', outlineColor: '#0b0a0c', outlineWidth: 7, glowColor: '#000000', glowWidth: 26, ripples: 0,
    rippleColor: '#000000', shoreTexture: null, shoreWidth: 0, innerShade: 0.5, textureScale: 1,
  },
  interior: {
    name: 'Interior', waterTexture: 'dungeon-void', landTexture: 'planks', waterColor: '#1a1714', landColor: '#8a6a45',
    coastStyle: 'dungeon', outlineColor: '#15110d', outlineWidth: 9, glowColor: '#000000', glowWidth: 22, ripples: 0,
    rippleColor: '#000000', shoreTexture: null, shoreWidth: 0, innerShade: 0.45, textureScale: 1,
  },
};

export const LIGHTING_PRESETS: Record<LightingPreset, Omit<LightingSettings, 'enabled' | 'preset' | 'lightDirection'>> = {
  none: { ambient: 1, ambientColor: '#ffffff', temperature: 0, contrast: 0, shadowIntensity: 0.35 },
  dawn: { ambient: 0.82, ambientColor: '#ffcfb4', temperature: 0.15, contrast: 0.05, shadowIntensity: 0.45 },
  day: { ambient: 1, ambientColor: '#ffffff', temperature: 0, contrast: 0.05, shadowIntensity: 0.4 },
  golden: { ambient: 0.92, ambientColor: '#ffd592', temperature: 0.35, contrast: 0.1, shadowIntensity: 0.55 },
  sunset: { ambient: 0.72, ambientColor: '#ff9c72', temperature: 0.45, contrast: 0.12, shadowIntensity: 0.6 },
  twilight: { ambient: 0.5, ambientColor: '#6d62a6', temperature: -0.35, contrast: 0.08, shadowIntensity: 0.45 },
  night: { ambient: 0.3, ambientColor: '#28346a', temperature: -0.6, contrast: 0.1, shadowIntensity: 0.3 },
  moonlight: { ambient: 0.45, ambientColor: '#7c95cf', temperature: -0.45, contrast: 0.08, shadowIntensity: 0.4 },
  overcast: { ambient: 0.82, ambientColor: '#b9bec7', temperature: -0.1, contrast: -0.15, shadowIntensity: 0.15 },
};

export function lightingFromPreset(preset: LightingPreset, dir = 225): LightingSettings {
  return { enabled: preset !== 'none', preset, lightDirection: dir, ...LIGHTING_PRESETS[preset] };
}

export function makeLayer(kind: LayerKind, name: string, extra: Partial<Layer> = {}): Layer {
  return { id: uid('l'), name, kind, visible: true, locked: false, opacity: 1, parentId: null, ...extra };
}

function objLayer(name: string, role: LayerRole, depthSort = false): Layer {
  return makeLayer('objects', name, { role, depthSort });
}

export function defaultLayers(): Layer[] {
  // Bottom → top render order.
  return [
    makeLayer('terrain', 'Land & Water'),
    makeLayer('paint', 'Ground Textures'),
    objLayer('Terrain Details', 'details', true),
    objLayer('Roads & Rivers', 'paths'),
    makeLayer('grid', 'Grid'),
    objLayer('Mountains', 'mountains', true),
    objLayer('Vegetation', 'vegetation', true),
    objLayer('Buildings', 'buildings', true),
    objLayer('Foreground Details', 'ground', true),
    makeLayer('effects', 'Atmosphere'),
    makeLayer('lighting', 'Lighting'),
    objLayer('Labels', 'labels'),
  ];
}

export function computeRasterScale(w: number, h: number): number {
  return Math.min(1, Math.sqrt(4_200_000 / (w * h)));
}

export interface NewProjectOptions {
  name: string;
  mapType: MapType;
  width: number;
  height: number;
  theme?: string;
  start?: StartTerrain;
  seed?: number;
}

export function createProjectDoc(o: NewProjectOptions): ProjectDoc {
  const info = mapTypeInfo(o.mapType);
  const theme = THEMES[o.theme ?? info.theme] ?? THEMES.painted;
  const now = Date.now();
  const atlasScale = info.pack === 'atlas' ? info.assetScale * Math.max(0.5, Math.min(3, Math.sqrt((o.width * o.height) / (1920 * 1080)))) : info.assetScale;
  return {
    version: 1,
    id: uid('p'),
    name: o.name || 'Untitled Map',
    mapType: o.mapType,
    width: Math.round(o.width),
    height: Math.round(o.height),
    created: now,
    updated: now,
    theme: { ...theme },
    assetScale: Math.round(atlasScale * 100) / 100,
    assetPack: info.pack,
    seed: o.seed ?? randomSeed(),
    layers: defaultLayers(),
    objects: {},
    grid: {
      type: info.grid, size: info.gridSize, opacity: info.pack === 'atlas' ? 0.25 : 0.35, thickness: 1.5,
      color: info.theme === 'dungeon' || info.theme === 'cave' ? '#e8e0d0' : '#1d1a16', offsetX: 0, offsetY: 0, snap: false,
    },
    lighting: lightingFromPreset(info.lighting),
    camera: null,
    rasterScale: computeRasterScale(o.width, o.height),
  };
}
