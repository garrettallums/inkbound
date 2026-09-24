import type { DocKey, SceneObject } from '../model/types';
import type { MaskPatch } from '../engine/terrainMask';
import type { PaintLayer, PaintPatch } from '../engine/paintLayer';

/**
 * A reversible edit. Objects are immutable, so before/after snapshots are just
 * references — a 500-tree scatter stroke is one command holding 500 refs
 * (spec §52).
 */
export interface Command {
  label: string;
  objs: Map<string, { before: SceneObject | null; after: SceneObject | null }>;
  keys: Map<DocKey, { before: unknown; after: unknown }>;
  rasters: (MaskPatch | PaintPatch)[];
  paintLayers: Map<string, { before: PaintLayer | null; after: PaintLayer | null }>;
  time: number;
}

export function emptyCommand(label: string): Command {
  return { label, objs: new Map(), keys: new Map(), rasters: [], paintLayers: new Map(), time: Date.now() };
}

export function isEmpty(c: Command) {
  for (const [, v] of c.objs) if (v.before !== v.after) return false;
  for (const [, v] of c.keys) if (v.before !== v.after) return false;
  return c.rasters.length === 0 && c.paintLayers.size === 0;
}

export class History {
  undoStack: Command[] = [];
  redoStack: Command[] = [];
  limit = 200;

  push(c: Command) {
    this.undoStack.push(c);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
