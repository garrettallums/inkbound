import type { ColorAdjust } from '../core/color';
import type { Vec } from '../core/geom';

export type MapType = 'world' | 'region' | 'settlement' | 'battlemap' | 'dungeon' | 'cave' | 'camp' | 'interior';

export type LayerKind = 'terrain' | 'paint' | 'objects' | 'grid' | 'effects' | 'lighting' | 'folder';

/** Default destinations for new objects when "auto layer" placement is on. */
export type LayerRole = 'vegetation' | 'buildings' | 'paths' | 'labels' | 'details' | 'ground' | 'mountains';

export interface Layer {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  locked: boolean;
  opacity: number;
  parentId: string | null;
  /** Automatic depth sorting (lower on screen draws in front). */
  depthSort?: boolean;
  role?: LayerRole;
  collapsed?: boolean;
}

interface BaseObject {
  id: string;
  layerId: string;
  locked?: boolean;
  groupId?: string | null;
  /** Manual depth override used with Bring Forward / Send Backward. */
  zBias?: number;
  name?: string;
}

export interface AssetObject extends BaseObject, ColorAdjust {
  type: 'asset';
  assetId: string;
  x: number; // centre
  y: number; // centre
  sx: number; // scale X (always positive, flips are separate)
  sy: number;
  rotation: number; // degrees
  flipX: boolean;
  flipY: boolean;
  opacity: number;
  shadow: number; // 0..1 drop-shadow strength
  blur: number; // px (world units)
}

export type PathProfile = 'river' | 'stream' | 'road' | 'trail' | 'wall' | 'border' | 'passage' | 'coastline';

export interface PathPoint extends Vec {
  /** Optional per-point width multiplier. */
  w?: number;
}

export interface PathObject extends BaseObject {
  type: 'path';
  profile: PathProfile;
  /** Sub-style: road surface, wall style, border style… */
  style: string;
  points: PathPoint[];
  closed: boolean;
  width: number;
  opacity: number;
  color: string;
  roughness: number; // 0..1 edge irregularity
  meander: number; // 0..1 subtle meandering
  smoothing: number; // 0..1
  taper: number; // 0..1 (rivers: narrow at source)
  widthVariation: number; // 0..1
  shadow: number; // 0..1
  seed: number;
  /** Optional procedural decorations (rocks, reeds, ruts, stones…). */
  details: Record<string, boolean>;
  textureScale: number;
}

export type TextAlign = 'left' | 'center' | 'right';

export interface TextObject extends BaseObject {
  type: 'text';
  text: string;
  x: number;
  y: number;
  font: string;
  size: number;
  weight: number;
  italic: boolean;
  letterSpacing: number; // em
  lineHeight: number; // multiplier
  align: TextAlign;
  rotation: number;
  curve: number; // -1..1 arc bend
  color: string;
  outline: number; // px
  outlineColor: string;
  shadow: number; // blur px
  shadowColor: string;
  opacity: number;
  uppercase: boolean;
  sx?: number;
  sy?: number;
}

export type LightKind = 'campfire' | 'torch' | 'lantern' | 'fireplace' | 'window' | 'magic' | 'custom';

export interface LightObject extends BaseObject {
  type: 'light';
  kind: LightKind;
  x: number;
  y: number;
  radius: number;
  intensity: number; // 0..2
  color: string;
  falloff: number; // 0..1 (0 = hard, 1 = very soft)
  shadowStrength: number; // 0..1
  flicker: number;
}

export type EffectKind =
  | 'fog' | 'mist' | 'smoke' | 'rain' | 'snow' | 'clouds' | 'dust' | 'embers' | 'fireglow' | 'godrays' | 'vignette';

export interface EffectObject extends BaseObject {
  type: 'effect';
  kind: EffectKind;
  intensity: number; // 0..1
  scale: number; // 0.25..4
  color: string;
  seed: number;
  angle: number; // degrees (rain slant, god-ray direction, wind)
  /** Optional region; null means the whole map. */
  region: { x: number; y: number; w: number; h: number } | null;
}

export type SceneObject = AssetObject | PathObject | TextObject | LightObject | EffectObject;
export type SceneObjectType = SceneObject['type'];

export interface GridSettings {
  type: 'none' | 'square' | 'hex';
  size: number;
  opacity: number;
  thickness: number;
  color: string;
  offsetX: number;
  offsetY: number;
  snap: boolean;
}

export type LightingPreset = 'none' | 'dawn' | 'day' | 'golden' | 'sunset' | 'twilight' | 'night' | 'moonlight' | 'overcast';

export interface LightingSettings {
  enabled: boolean;
  preset: LightingPreset;
  ambient: number; // 0..1 brightness
  ambientColor: string;
  temperature: number; // -1..1
  contrast: number; // -1..1
  shadowIntensity: number; // 0..1
  lightDirection: number; // degrees, direction light comes FROM (0 = east, 225 = north-west)
}

export type CoastStyle = 'painted' | 'ink' | 'cave' | 'dungeon' | 'soft' | 'none';

export interface TerrainTheme {
  name: string;
  waterTexture: string;
  landTexture: string;
  waterColor: string;
  landColor: string;
  coastStyle: CoastStyle;
  outlineColor: string;
  outlineWidth: number;
  glowColor: string;
  glowWidth: number;
  ripples: number;
  rippleColor: string;
  shoreTexture: string | null;
  shoreWidth: number;
  innerShade: number;
  textureScale: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface ProjectDoc {
  version: 1;
  id: string;
  name: string;
  mapType: MapType;
  width: number;
  height: number;
  created: number;
  updated: number;
  theme: TerrainTheme;
  /** Default scale applied to newly placed assets. */
  assetScale: number;
  /** Preferred asset pack for the library ('atlas' icons vs 'topdown'). */
  assetPack: 'atlas' | 'topdown';
  seed: number;
  layers: Layer[];
  objects: Record<string, SceneObject>;
  grid: GridSettings;
  lighting: LightingSettings;
  camera: Camera | null;
  /** Resolution factor for raster layers relative to map pixels. */
  rasterScale: number;
}

export interface ProjectMeta {
  id: string;
  name: string;
  mapType: MapType;
  width: number;
  height: number;
  created: number;
  updated: number;
  thumbnail?: Blob | null;
}

/** Keys of ProjectDoc that are undoable as whole values (besides objects/rasters). */
export type DocKey = 'layers' | 'grid' | 'lighting' | 'theme' | 'name' | 'assetScale' | 'assetPack' | 'mapType';
