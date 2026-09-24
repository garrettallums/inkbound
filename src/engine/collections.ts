/**
 * Asset collections: weighted groups of assets used by the randomized scatter
 * brush (spec §31, §32, §49). Built-in collections ship for both packs; users
 * can save their own (stored in IndexedDB).
 */

export interface ScatterRules {
  collisions: boolean;
  avoidWater: boolean;
  avoidRoads: boolean;
  avoidBuildings: boolean;
  cluster: boolean;
  thinEdges: boolean;
  preferShore: boolean;
  alignRoads: boolean;
  nearMountains: boolean;
}

export interface ScatterSettings {
  size: number; // brush radius in world units
  density: number; // 0..1
  spacing: number; // multiplier of footprint radius
  scatter: number; // 0..1 positional jitter
  minScale: number;
  maxScale: number;
  rotation: number; // degrees of random rotation variation
  edgeFalloff: number; // 0..1
  flip: boolean; // random horizontal flips
  colorVariation: number; // 0..1 brightness/hue jitter per instance
  seed: number;
  rules: ScatterRules;
}

export interface CollectionItem {
  assetId: string;
  weight: number;
}

export interface AssetCollection {
  id: string;
  name: string;
  pack: 'atlas' | 'topdown' | 'any';
  items: CollectionItem[];
  settings?: Partial<Omit<ScatterSettings, 'rules' | 'seed'>> & { rules?: Partial<ScatterRules> };
  builtIn?: boolean;
  folder?: string;
}

export const DEFAULT_RULES: ScatterRules = {
  collisions: true, avoidWater: true, avoidRoads: true, avoidBuildings: true, cluster: true, thinEdges: true,
  preferShore: false, alignRoads: false, nearMountains: false,
};

export function defaultScatter(pack: 'atlas' | 'topdown', seed: number): ScatterSettings {
  return pack === 'atlas'
    ? { size: 60, density: 0.6, spacing: 0.75, scatter: 0.8, minScale: 0.85, maxScale: 1.15, rotation: 0, edgeFalloff: 0.5, flip: true, colorVariation: 0.15, seed, rules: { ...DEFAULT_RULES } }
    : { size: 260, density: 0.55, spacing: 0.8, scatter: 0.8, minScale: 0.8, maxScale: 1.2, rotation: 180, edgeFalloff: 0.5, flip: true, colorVariation: 0.12, seed, rules: { ...DEFAULT_RULES } };
}

const w = (assetId: string, weight: number): CollectionItem => ({ assetId, weight });

const both = (id: string, name: string, items: [string, number][], settings?: AssetCollection['settings'], atlasSettings?: AssetCollection['settings']): AssetCollection[] => [
  { id: `atlas:${id}`, name, pack: 'atlas', builtIn: true, items: items.map(([a, n]) => w(`atlas/${a}`, n)), settings: atlasSettings ?? settings },
  { id: `td:${id}`, name, pack: 'topdown', builtIn: true, items: items.map(([a, n]) => w(`td/${a}`, n)), settings },
];

export const BUILTIN_COLLECTIONS: AssetCollection[] = [
  ...both('conifer', 'Coniferous Forest', [['spruce-a', 25], ['spruce-b', 20], ['spruce-c', 15], ['pine-a', 15], ['pine-b', 15], ['pine-dead', 5], ['spruce-small', 5]]),
  ...both('dark-pine', 'Dark Pine Forest', [['spruce-b', 30], ['spruce-a', 25], ['pine-a', 15], ['pine-dead', 15], ['spruce-small', 15]], { density: 0.8 }, { density: 0.85 }),
  ...both('deciduous', 'Deciduous Forest', [['oak-a', 35], ['oak-b', 30], ['birch', 25], ['maple-autumn', 10]]),
  ...both('mixed', 'Mixed Woodland', [['oak-a', 20], ['oak-b', 15], ['spruce-a', 20], ['pine-a', 15], ['birch', 15], ['spruce-small', 15]]),
  ...both('winter', 'Winter Forest', [['spruce-snow', 60], ['pine-dead', 15], ['spruce-small', 25]]),
  ...both('deadwood', 'Dead Woods', [['dead-tree', 55], ['pine-dead', 45]], { density: 0.35 }),
  {
    id: 'atlas:mountains', name: 'Mountain Range', pack: 'atlas', builtIn: true,
    items: [w('atlas/mtn-peak', 30), w('atlas/mtn-peak-b', 25), w('atlas/mtn-jagged', 15), w('atlas/mtn-snow', 15), w('atlas/ridge-small', 10), w('atlas/mtn-rounded', 5)],
    settings: { size: 90, density: 0.75, spacing: 0.55, rotation: 0, minScale: 0.8, maxScale: 1.25, rules: { avoidRoads: false, cluster: false, nearMountains: false } },
  },
  {
    id: 'atlas:snowy-range', name: 'Snowy Peaks', pack: 'atlas', builtIn: true,
    items: [w('atlas/mtn-snow', 45), w('atlas/ridge-snow', 20), w('atlas/mtn-jagged', 20), w('atlas/spruce-snow', 15)],
    settings: { size: 90, density: 0.75, spacing: 0.55, rotation: 0 },
  },
  {
    id: 'atlas:hills', name: 'Rolling Hills', pack: 'atlas', builtIn: true,
    items: [w('atlas/hills', 60), w('atlas/hill-rocky', 25), w('atlas/bush-atlas', 15)],
    settings: { size: 70, density: 0.5, spacing: 0.7, rotation: 0 },
  },
  {
    id: 'atlas:marsh', name: 'Marshland', pack: 'atlas', builtIn: true,
    items: [w('atlas/swamp-atlas', 40), w('atlas/reeds-atlas', 35), w('atlas/dead-tree', 15), w('atlas/grass-atlas', 10)],
    settings: { density: 0.5, rules: { avoidWater: false, preferShore: true } },
  },
  {
    id: 'td:undergrowth', name: 'Forest Undergrowth', pack: 'topdown', builtIn: true,
    items: [w('td/fern', 25), w('td/bush-a', 15), w('td/bush-b', 10), w('td/mushrooms', 8), w('td/mushrooms-brown', 7), w('td/log', 6), w('td/stump', 8), w('td/branches', 10), w('td/grass-tuft', 8), w('td/fallen-tree', 3)],
    settings: { density: 0.45, rules: { avoidBuildings: true } },
  },
  {
    id: 'td:meadow', name: 'Meadow Flowers', pack: 'topdown', builtIn: true,
    items: [w('td/flowers-a', 35), w('td/flowers-b', 20), w('td/grass-tuft', 35), w('td/bush-flower', 10)],
    settings: { density: 0.4, rules: { collisions: false } },
  },
  {
    id: 'td:rocky-coast', name: 'Rocky Coast', pack: 'topdown', builtIn: true,
    items: [w('td/rock-a', 25), w('td/rock-b', 20), w('td/rocks-cluster', 20), w('td/boulder', 15), w('td/pebbles', 10), w('td/reeds', 10)],
    settings: { density: 0.5, rules: { avoidWater: false, preferShore: true } },
  },
  {
    id: 'td:reed-bank', name: 'Reed Bank', pack: 'topdown', builtIn: true,
    items: [w('td/reeds', 70), w('td/grass-tuft', 20), w('td/pebbles', 10)],
    settings: { density: 0.65, rules: { avoidWater: false, preferShore: true, collisions: false } },
  },
  {
    id: 'td:rocks', name: 'Rocky Ground', pack: 'topdown', builtIn: true,
    items: [w('td/rock-a', 30), w('td/rock-b', 25), w('td/rocks-cluster', 15), w('td/boulder', 10), w('td/boulder-mossy', 10), w('td/pebbles', 10)],
    settings: { density: 0.4, rules: { nearMountains: true } },
  },
  {
    id: 'td:viking-village', name: 'Viking Village', pack: 'topdown', builtIn: true,
    items: [w('bld/norse/longhouse', 20), w('bld/norse/house', 25), w('bld/norse/cabin', 20), w('bld/norse/barn', 10), w('td/woodpile', 10), w('td/hay-bale', 5), w('td/well', 5), w('td/cart', 5)],
    settings: { size: 500, density: 0.25, spacing: 1.1, rotation: 20, minScale: 0.9, maxScale: 1.1, rules: { alignRoads: true, avoidRoads: true } },
  },
  {
    id: 'td:medieval-village', name: 'Medieval Village', pack: 'topdown', builtIn: true,
    items: [w('bld/medieval/house', 30), w('bld/medieval/house-small', 25), w('bld/medieval/shop', 10), w('bld/medieval/tavern', 5), w('bld/thatch/house', 15), w('td/garden', 8), w('td/well', 4), w('td/cart', 3)],
    settings: { size: 500, density: 0.25, spacing: 1.1, rotation: 20, minScale: 0.9, maxScale: 1.1, rules: { alignRoads: true, avoidRoads: true } },
  },
  {
    id: 'td:bandit-camp', name: 'Bandit Camp', pack: 'topdown', builtIn: true,
    items: [w('td/tent-leather-a', 15), w('td/tent-leather-b', 15), w('td/tent-cloth-b', 10), w('td/crate', 12), w('td/barrel', 12), w('td/bedroll-a', 8), w('td/weapon-rack', 6), w('td/firewood', 8), w('td/pack', 8), w('td/hide', 6)],
    settings: { size: 360, density: 0.3, spacing: 0.9, rotation: 40 },
  },
  {
    id: 'td:ruins', name: 'Ancient Ruins', pack: 'topdown', builtIn: true,
    items: [w('bld/ruined/house', 15), w('bld/ruined/tower', 10), w('td/broken-masonry', 25), w('td/rubble', 20), w('td/statue', 5), w('td/pillar-round', 10), w('td/boulder-mossy', 15)],
    settings: { size: 400, density: 0.3, spacing: 0.9, rotation: 90 },
  },
  {
    id: 'atlas:ruins', name: 'Ancient Ruins', pack: 'atlas', builtIn: true,
    items: [w('atlas/icon-ruins', 60), w('atlas/dead-tree', 20), w('atlas/hill-rocky', 20)],
    settings: { density: 0.3, spacing: 1 },
  },
  {
    id: 'td:cave-clutter', name: 'Cave Clutter', pack: 'topdown', builtIn: true,
    items: [w('td/stalagmite', 30), w('td/stalactite', 20), w('td/rock-pile', 15), w('td/crystals-blue', 8), w('td/crystals-purple', 5), w('td/glow-fungi', 7), w('td/cave-moss', 10), w('td/bones-pile', 5)],
    settings: { density: 0.35, rules: { avoidWater: false } },
  },
  {
    id: 'td:dungeon-debris', name: 'Dungeon Debris', pack: 'topdown', builtIn: true,
    items: [w('td/rubble', 35), w('td/debris', 25), w('td/bones-pile', 15), w('td/broken-masonry', 15), w('td/chains', 10)],
    settings: { density: 0.3, rules: { avoidWater: false } },
  },
];
