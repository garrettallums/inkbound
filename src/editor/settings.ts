import type { TerrainOp } from '../engine/terrainMask';
import type { TextureBrush } from '../engine/paintLayer';
import { defaultScatter, type CollectionItem, type ScatterSettings } from '../engine/collections';
import type { LightKind } from '../model/types';

export type ToolId = 'select' | 'terrain' | 'brush' | 'asset' | 'path' | 'text' | 'light' | 'atmosphere';

export interface TerrainToolSettings {
  op: TerrainOp | 'fill';
  size: number;
  roughness: number;
  strength: number;
  hardness: number;
}

export interface AssetToolSettings {
  mode: 'place' | 'scatter' | 'erase';
  assetId: string | null;
  /** Active scatter set — either a collection or an ad-hoc selection of assets. */
  collectionId: string | null;
  items: CollectionItem[];
  scatter: ScatterSettings;
  randomRotation: number;
  randomScale: number;
  randomFlip: boolean;
  autoLayer: boolean;
  shadow: number;
}

export interface PathToolSettings {
  presetId: string;
  width: number | null; // null → preset default
  freehand: boolean;
}

export interface TextToolSettings {
  presetId: string;
}

export interface LightToolSettings {
  kind: LightKind;
}

export interface ToolSettings {
  terrain: TerrainToolSettings;
  brush: TextureBrush & { presetId: string };
  asset: AssetToolSettings;
  path: PathToolSettings;
  text: TextToolSettings;
  light: LightToolSettings;
  snap: boolean;
  /** Configurable camera zoom limits (fractions, 1 = 100%). */
  zoomMin: number;
  zoomMax: number;
}

export interface BrushPreset {
  id: string;
  name: string;
  mix: { texture: string; weight: number }[];
}

export const BRUSH_PRESETS: BrushPreset[] = [
  { id: 'grass', name: 'Grass', mix: [{ texture: 'grass', weight: 100 }] },
  { id: 'meadow', name: 'Meadow', mix: [{ texture: 'grass', weight: 60 }, { texture: 'meadow', weight: 25 }, { texture: 'moss', weight: 15 }] },
  { id: 'forest-floor', name: 'Forest Floor', mix: [{ texture: 'forest-floor', weight: 60 }, { texture: 'moss', weight: 20 }, { texture: 'dark-grass', weight: 10 }, { texture: 'leaf-litter', weight: 10 }] },
  { id: 'dirt-path', name: 'Trodden Dirt', mix: [{ texture: 'dirt', weight: 70 }, { texture: 'mud', weight: 15 }, { texture: 'dead-vegetation', weight: 15 }] },
  { id: 'beach', name: 'Beach', mix: [{ texture: 'sand', weight: 85 }, { texture: 'dirt', weight: 15 }] },
  { id: 'rocky', name: 'Rocky Ground', mix: [{ texture: 'stone', weight: 55 }, { texture: 'mountain-rock', weight: 30 }, { texture: 'dirt', weight: 15 }] },
  { id: 'snowfield', name: 'Snowfield', mix: [{ texture: 'snow', weight: 85 }, { texture: 'stone', weight: 15 }] },
  { id: 'swamp', name: 'Swamp', mix: [{ texture: 'mud', weight: 45 }, { texture: 'moss', weight: 30 }, { texture: 'shallow-water', weight: 25 }] },
  { id: 'farmland', name: 'Farmland', mix: [{ texture: 'farmland', weight: 100 }] },
  { id: 'autumn', name: 'Autumn Floor', mix: [{ texture: 'leaf-litter', weight: 60 }, { texture: 'dead-vegetation', weight: 25 }, { texture: 'dirt', weight: 15 }] },
  { id: 'cave', name: 'Cave Floor', mix: [{ texture: 'cave-floor', weight: 75 }, { texture: 'stone', weight: 25 }] },
  { id: 'shallows', name: 'Shallow Water', mix: [{ texture: 'shallow-water', weight: 100 }] },
  { id: 'deep', name: 'Deep Water', mix: [{ texture: 'deep-water', weight: 100 }] },
];

export function defaultToolSettings(pack: 'atlas' | 'topdown', assetScale: number, seed: number): ToolSettings {
  const atlas = pack === 'atlas';
  const k = atlas ? assetScale : 1;
  return {
    terrain: { op: 'add', size: atlas ? 70 * k : 220, roughness: 0.6, strength: 1, hardness: 0.75 },
    brush: {
      presetId: 'forest-floor', mix: BRUSH_PRESETS[2].mix.map((m) => ({ ...m })), size: atlas ? 40 * k : 140, opacity: 0.8, flow: 0.55,
      hardness: 0.35, softness: 0.7, textureScale: 1, rotation: 0, rotationVariation: 180, erase: false,
    },
    asset: {
      mode: 'place', assetId: null, collectionId: atlas ? 'atlas:conifer' : 'td:conifer', items: [],
      scatter: { ...defaultScatter(pack, seed), size: atlas ? 60 * k : 260 },
      randomRotation: atlas ? 0 : 20, randomScale: 0.1, randomFlip: true, autoLayer: true, shadow: atlas ? 0.35 : 0.6,
    },
    path: { presetId: 'river', width: null, freehand: false },
    text: { presetId: atlas ? 'region' : 'building' },
    light: { kind: 'torch' },
    snap: false,
    zoomMin: 0.05,
    zoomMax: atlas ? 16 : 6,
  };
}
