import { blobToImage, canvasToBlob, ctx2d, makeCanvas } from '../core/canvas';
import { Emitter } from '../core/emitter';
import { clamp, rectUnion, type Rect, type Vec } from '../core/geom';
import { uid } from '../core/ids';
import { randomSeed } from '../core/rng';
import { collectLights, renderScene, type RenderEnv } from '../engine/renderer';
import { objectBounds, renderLayers, selectionBounds, sortObjects } from '../engine/scene';
import { PaintLayer, type PaintPatch } from '../engine/paintLayer';
import { TerrainMask, type MaskPatch } from '../engine/terrainMask';
import { TerrainRenderer } from '../engine/terrainRenderer';
import { ObjectTileCache } from '../engine/objectCache';
import { makeLayer, mapTypeInfo, type StartTerrain } from '../model/defaults';
import type { Camera, DocKey, Layer, LayerKind, LayerRole, ProjectDoc, SceneObject } from '../model/types';
import * as db from '../storage/db';
import type { Tool } from '../tools/types';
import { emptyCommand, History, isEmpty, type Command } from './history';
import { defaultToolSettings, type ToolId, type ToolSettings } from './settings';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

const SETTINGS_KEY = 'inkbound.toolSettings.v1';

/**
 * The editor owns the live scene: document, raster layers, selection,
 * history, camera and persistence. UI components subscribe to `events`.
 */
export class Editor {
  doc: ProjectDoc;
  mask: TerrainMask;
  terrain: TerrainRenderer;
  paint = new Map<string, PaintLayer>();
  objectCache = new ObjectTileCache();
  history = new History();
  selection: string[] = [];
  tool: ToolId = 'select';
  tools: Partial<Record<ToolId, Tool>> = {};
  activeLayerId: string;
  settings: ToolSettings;
  camera: Camera = { x: 0, y: 0, zoom: 1 };
  viewW = 800;
  viewH = 600;
  dpr = 1;
  saveStatus: SaveStatus = 'saved';
  saveError: string | null = null;
  previewMode = false;
  cursorWorld: Vec | null = null;
  /** Objects hidden from the main render (being interactively edited). */
  hidden = new Set<string>();
  events = new Emitter();
  cameraEvents = new Emitter();
  requestRender: () => void = () => {};
  toast: (msg: string, kind?: 'info' | 'error') => void = () => {};

  private tx: Command | null = null;
  private txDepth = 0;
  private sorted = new Map<string, SceneObject[]>();
  private dirtyLayers = new Set<string>();
  private allDirty = true;
  private changeCounter = 0;
  private savedCounter = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private firstUnsaved = 0;
  private saving = false;
  private saveQueued = false;
  private rasterBlobs = new Map<string, { version: number; blob: Blob }>();
  private lastThumb = 0;
  private clipboard: SceneObject[] = [];
  private pasteCount = 0;
  disposed = false;

  constructor(doc: ProjectDoc, mask: TerrainMask) {
    this.doc = doc;
    this.mask = mask;
    this.terrain = new TerrainRenderer(mask, doc.theme, doc.width, doc.height);
    this.terrain.onChange = () => this.requestRender();
    const firstObj = [...doc.layers].reverse().find((l) => l.kind === 'objects' && l.role === 'vegetation') ?? doc.layers.find((l) => l.kind === 'objects');
    this.activeLayerId = firstObj?.id ?? doc.layers[0].id;
    this.settings = this.loadSettings();
    for (const l of doc.layers) if (l.kind === 'paint') this.paint.set(l.id, new PaintLayer(l.id, doc.width, doc.height, doc.rasterScale));
  }

  // ------------------------------------------------------------------ lifecycle

  static create(doc: ProjectDoc, start: StartTerrain): Editor {
    const mask = new TerrainMask(doc.width, doc.height, terrainScale(doc), doc.seed);
    mask.generate(start);
    const ed = new Editor(doc, mask);
    ed.terrain.rebuild();
    ed.markChanged(true);
    return ed;
  }

  static async load(stored: db.StoredProject): Promise<Editor> {
    const doc = migrate(stored.doc);
    const mask = new TerrainMask(doc.width, doc.height, terrainScale(doc), doc.seed);
    if (stored.rasters.terrain) {
      const img = await blobToImage(stored.rasters.terrain);
      mask.loadFromCanvas(img);
    }
    const ed = new Editor(doc, mask);
    for (const [id, layer] of ed.paint) {
      const b = stored.rasters[id];
      if (b) layer.load(await blobToImage(b));
      ed.rasterBlobs.set(id, { version: layer.version, blob: b! });
    }
    if (stored.rasters.terrain) ed.rasterBlobs.set('terrain', { version: mask.version, blob: stored.rasters.terrain });
    ed.terrain.rebuild();
    if (doc.camera) ed.camera = { ...doc.camera };
    return ed;
  }

  dispose() {
    this.disposed = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
  }

  // ------------------------------------------------------------------ settings

  private loadSettings(): ToolSettings {
    const def = defaultToolSettings(this.doc.assetPack, this.doc.assetScale, this.doc.seed);
    try {
      const raw = localStorage.getItem(SETTINGS_KEY + ':' + this.doc.id);
      if (raw) {
        const s = JSON.parse(raw);
        return { ...def, ...s, terrain: { ...def.terrain, ...s.terrain }, brush: { ...def.brush, ...s.brush }, asset: { ...def.asset, ...s.asset, scatter: { ...def.asset.scatter, ...s.asset?.scatter, rules: { ...def.asset.scatter.rules, ...s.asset?.scatter?.rules } } }, path: { ...def.path, ...s.path }, text: { ...def.text, ...s.text }, light: { ...def.light, ...s.light } };
      }
    } catch {
      /* ignore corrupt settings */
    }
    return def;
  }

  updateSettings<K extends keyof ToolSettings>(key: K, patch: Partial<ToolSettings[K]> | ToolSettings[K]) {
    const cur = this.settings[key];
    this.settings = { ...this.settings, [key]: typeof cur === 'object' && cur !== null ? { ...(cur as object), ...(patch as object) } : patch };
    try {
      localStorage.setItem(SETTINGS_KEY + ':' + this.doc.id, JSON.stringify(this.settings));
    } catch {
      /* storage may be unavailable */
    }
    this.events.emit();
    this.requestRender();
  }

  // ------------------------------------------------------------------ render env

  layerObjects = (layerId: string): SceneObject[] => {
    if (this.allDirty) {
      this.sorted.clear();
      this.dirtyLayers.clear();
      this.allDirty = false;
      const groups = new Map<string, SceneObject[]>();
      for (const o of Object.values(this.doc.objects)) {
        let g = groups.get(o.layerId);
        if (!g) groups.set(o.layerId, (g = []));
        g.push(o);
      }
      for (const l of this.doc.layers) this.sorted.set(l.id, sortObjects(groups.get(l.id) ?? [], l));
    } else if (this.dirtyLayers.size) {
      const dirty = [...this.dirtyLayers];
      this.dirtyLayers.clear();
      const groups = new Map<string, SceneObject[]>(dirty.map((id) => [id, []]));
      for (const o of Object.values(this.doc.objects)) groups.get(o.layerId)?.push(o);
      for (const id of dirty) {
        const l = this.layer(id);
        if (l) this.sorted.set(id, sortObjects(groups.get(id)!, l));
        else this.sorted.delete(id);
      }
    }
    return this.sorted.get(layerId) ?? [];
  };

  get env(): RenderEnv {
    return { doc: this.doc, terrain: this.terrain, paint: this.paint, layerObjects: this.layerObjects, objectCache: this.objectCache };
  }

  layer(id: string | null | undefined): Layer | undefined {
    return id ? this.doc.layers.find((l) => l.id === id) : undefined;
  }

  get activeLayer(): Layer | undefined {
    return this.layer(this.activeLayerId);
  }

  /** Effective lock state (folder locks apply to children). */
  isLayerLocked(id: string) {
    const r = renderLayers(this.doc.layers).find((x) => x.layer.id === id);
    return r ? r.locked : true;
  }

  isLayerVisible(id: string) {
    const r = renderLayers(this.doc.layers).find((x) => x.layer.id === id);
    return r ? r.visible : false;
  }

  /** Layer for new content: role-matched layer when auto-layer is on, otherwise the active objects layer. */
  targetLayer(role: LayerRole | null, auto = this.settings.asset.autoLayer): Layer {
    const active = this.activeLayer;
    if (!auto && active && active.kind === 'objects' && !this.isLayerLocked(active.id)) return active;
    if (role) {
      const byRole = this.doc.layers.find((l) => l.kind === 'objects' && l.role === role && !this.isLayerLocked(l.id));
      if (byRole) return byRole;
    }
    if (active && active.kind === 'objects' && !this.isLayerLocked(active.id)) return active;
    const any = [...this.doc.layers].reverse().find((l) => l.kind === 'objects' && !this.isLayerLocked(l.id));
    if (any) return any;
    return this.addLayer('objects', 'Objects');
  }

  // ------------------------------------------------------------------ transactions

  begin(label: string) {
    if (this.txDepth === 0) this.tx = emptyCommand(label);
    this.txDepth++;
  }

  commit(): boolean {
    if (this.txDepth === 0) return false;
    this.txDepth--;
    if (this.txDepth > 0) return false;
    const c = this.tx!;
    this.tx = null;
    if (isEmpty(c)) return false;
    // Continuous property tweaks (slider drags, colour pickers) collapse into one undo step.
    const last = this.history.undoStack[this.history.undoStack.length - 1];
    if (last && last.label === c.label && c.label.startsWith('Adjust') && c.time - last.time < 1500 && !c.rasters.length && !c.paintLayers.size && !last.rasters.length && !last.paintLayers.size) {
      for (const [id, v] of c.objs) {
        const prev = last.objs.get(id);
        if (prev) prev.after = v.after;
        else last.objs.set(id, v);
      }
      for (const [k, v] of c.keys) {
        const prev = last.keys.get(k);
        if (prev) prev.after = v.after;
        else last.keys.set(k, v);
      }
      last.time = c.time;
      this.history.redoStack = [];
      this.markChanged();
      this.events.emit();
      return true;
    }
    this.history.push(c);
    this.markChanged();
    this.events.emit();
    return true;
  }

  /** Abort the open transaction, reverting its changes. */
  rollback() {
    if (!this.tx) return;
    const c = this.tx;
    this.tx = null;
    this.txDepth = 0;
    this.applyCommand(c, 'before');
    this.events.emit();
  }

  get inTransaction() {
    return this.txDepth > 0;
  }

  private withTx<T>(label: string, fn: () => T): T {
    const own = this.txDepth === 0;
    if (own) this.begin(label);
    try {
      return fn();
    } finally {
      if (own) this.commit();
    }
  }

  private recordObj(id: string) {
    if (!this.tx) return;
    if (!this.tx.objs.has(id)) this.tx.objs.set(id, { before: this.doc.objects[id] ?? null, after: null });
  }

  private touchLayer(layerId: string) {
    this.dirtyLayers.add(layerId);
  }

  /** Invalidate cached object tiles under an object (lights affect shadows everywhere). */
  private invalidateObj(o: SceneObject | null | undefined) {
    if (!o) return;
    if (o.type === 'light') this.objectCache.invalidateAll();
    else this.objectCache.invalidate(o.layerId, objectBounds(o, this.doc));
  }

  putObject(o: SceneObject) {
    this.withTx('Edit', () => {
      this.recordObj(o.id);
      const prev = this.doc.objects[o.id];
      if (prev && prev.layerId !== o.layerId) this.touchLayer(prev.layerId);
      this.invalidateObj(prev);
      this.invalidateObj(o);
      this.doc.objects[o.id] = o;
      this.tx!.objs.get(o.id)!.after = o;
      this.touchLayer(o.layerId);
    });
    this.requestRender();
  }

  putObjects(list: SceneObject[], label = 'Edit') {
    this.withTx(label, () => list.forEach((o) => this.putObject(o)));
  }

  removeObject(id: string) {
    const o = this.doc.objects[id];
    if (!o) return;
    this.withTx('Delete', () => {
      this.recordObj(id);
      this.invalidateObj(o);
      delete this.doc.objects[id];
      this.tx!.objs.get(id)!.after = null;
      this.touchLayer(o.layerId);
    });
    if (this.selection.includes(id)) this.setSelection(this.selection.filter((s) => s !== id));
    this.requestRender();
  }

  setKey<K extends DocKey>(key: K, value: ProjectDoc[K], label = 'Change settings') {
    this.withTx(label, () => {
      if (!this.tx!.keys.has(key)) this.tx!.keys.set(key, { before: this.doc[key], after: value });
      else this.tx!.keys.get(key)!.after = value;
      (this.doc as unknown as Record<string, unknown>)[key] = value;
      this.onKeyChanged(key);
    });
    this.requestRender();
  }

  private onKeyChanged(key: DocKey) {
    if (key === 'theme') this.terrain.setTheme(this.doc.theme);
    if (key === 'layers' || key === 'lighting') this.objectCache.invalidateAll();
    if (key === 'layers') {
      this.allDirty = true;
      if (!this.layer(this.activeLayerId)) this.activeLayerId = this.doc.layers.find((l) => l.kind === 'objects')?.id ?? this.doc.layers[0]?.id;
    }
  }

  pushRaster(p: MaskPatch | PaintPatch, label: string) {
    this.withTx(label, () => this.tx!.rasters.push(p));
  }

  private setPaintLayerRecord(id: string, layer: PaintLayer | null) {
    this.withTx('Layer', () => {
      if (!this.tx!.paintLayers.has(id)) this.tx!.paintLayers.set(id, { before: this.paint.get(id) ?? null, after: layer });
      else this.tx!.paintLayers.get(id)!.after = layer;
      if (layer) this.paint.set(id, layer);
      else this.paint.delete(id);
    });
  }

  private applyCommand(c: Command, which: 'before' | 'after') {
    const order = which === 'before' ? [...c.rasters].reverse() : c.rasters;
    let terrainRect: Rect | null = null;
    for (const r of order) {
      if (r.kind === 'mask') {
        const rr = this.mask.applyPatch(r, which);
        if (rr) terrainRect = rectUnion(terrainRect, rr);
      } else {
        this.paint.get(r.layerId)?.applyPatch(r, which);
      }
    }
    if (terrainRect) {
      this.terrain.markEdited(terrainRect);
      this.terrain.rebuild();
    }
    for (const [id, v] of c.paintLayers) {
      const layer = v[which];
      if (layer) this.paint.set(id, layer);
      else this.paint.delete(id);
    }
    for (const [key, v] of c.keys) {
      (this.doc as unknown as Record<string, unknown>)[key] = v[which];
      this.onKeyChanged(key);
    }
    for (const [id, v] of c.objs) {
      const o = v[which];
      const prev = this.doc.objects[id];
      if (prev) this.touchLayer(prev.layerId);
      this.invalidateObj(prev);
      this.invalidateObj(o);
      if (o) {
        this.doc.objects[id] = o;
        this.touchLayer(o.layerId);
      } else delete this.doc.objects[id];
    }
    this.allDirty = true;
    this.setSelection(this.selection.filter((id) => this.doc.objects[id]));
    this.requestRender();
  }

  undo() {
    if (this.inTransaction) return;
    const c = this.history.undoStack.pop();
    if (!c) return;
    this.applyCommand(c, 'before');
    this.history.redoStack.push(c);
    this.markChanged();
    this.events.emit();
    this.toast(`Undo: ${c.label}`);
  }

  redo() {
    if (this.inTransaction) return;
    const c = this.history.redoStack.pop();
    if (!c) return;
    this.applyCommand(c, 'after');
    this.history.undoStack.push(c);
    this.markChanged();
    this.events.emit();
    this.toast(`Redo: ${c.label}`);
  }

  // ------------------------------------------------------------------ selection

  setSelection(ids: string[]) {
    const same = ids.length === this.selection.length && ids.every((id, i) => id === this.selection[i]);
    if (same) return;
    this.selection = ids;
    this.events.emit();
    this.requestRender();
  }

  /** Expand ids to include full permanent groups. */
  expandGroups(ids: string[]): string[] {
    const groups = new Set(ids.map((id) => this.doc.objects[id]?.groupId).filter(Boolean) as string[]);
    if (!groups.size) return ids;
    const out = new Set(ids);
    for (const o of Object.values(this.doc.objects)) if (o.groupId && groups.has(o.groupId)) out.add(o.id);
    return [...out];
  }

  get selectedObjects(): SceneObject[] {
    return this.selection.map((id) => this.doc.objects[id]).filter(Boolean);
  }

  selectionRect(): Rect | null {
    let r: Rect | null = null;
    for (const o of this.selectedObjects) r = rectUnion(r, selectionBounds(o, this.doc));
    return r;
  }

  selectableObjects(): SceneObject[] {
    const out: SceneObject[] = [];
    for (const { layer, visible, locked } of renderLayers(this.doc.layers)) {
      if (!visible || locked) continue;
      for (const o of this.layerObjects(layer.id)) if (!o.locked) out.push(o);
    }
    return out;
  }

  selectAll() {
    this.setSelection(this.selectableObjects().filter((o) => o.type !== 'effect').map((o) => o.id));
  }

  selectLayer(layerId = this.activeLayerId) {
    this.setSelection(this.layerObjects(layerId).filter((o) => !o.locked).map((o) => o.id));
  }

  selectSameAsset() {
    const ids = new Set(this.selectedObjects.filter((o) => o.type === 'asset').map((o) => (o as { assetId: string }).assetId));
    if (!ids.size) return;
    this.setSelection(this.selectableObjects().filter((o) => o.type === 'asset' && ids.has(o.assetId)).map((o) => o.id));
  }

  deleteSelection() {
    const ids = this.selection.filter((id) => !this.doc.objects[id]?.locked);
    if (!ids.length) return;
    this.withTx(ids.length > 1 ? `Delete ${ids.length} objects` : 'Delete', () => ids.forEach((id) => this.removeObject(id)));
    this.setSelection([]);
  }

  duplicateSelection(offset = 20) {
    const objs = this.selectedObjects;
    if (!objs.length) return;
    const clones = this.cloneObjects(objs, offset * this.unitScale());
    this.putObjects(clones, clones.length > 1 ? `Duplicate ${clones.length} objects` : 'Duplicate');
    this.setSelection(clones.map((c) => c.id));
  }

  /** A scale factor so default offsets feel similar across map sizes. */
  unitScale() {
    return this.doc.assetPack === 'atlas' ? Math.max(0.4, this.doc.assetScale) * 0.6 : 1;
  }

  private cloneObjects(objs: SceneObject[], offset: number): SceneObject[] {
    const groupMap = new Map<string, string>();
    return objs.map((o) => {
      const id = uid('o');
      const groupId = o.groupId ? (groupMap.get(o.groupId) ?? groupMap.set(o.groupId, uid('g')).get(o.groupId)!) : null;
      const layerId = this.layer(o.layerId) ? o.layerId : this.targetLayer(null).id;
      switch (o.type) {
        case 'path':
          return { ...o, id, groupId, layerId, points: o.points.map((p) => ({ ...p, x: p.x + offset, y: p.y + offset })) };
        case 'effect':
          return { ...o, id, groupId, layerId, region: o.region ? { ...o.region, x: o.region.x + offset, y: o.region.y + offset } : null };
        default:
          return { ...o, id, groupId, layerId, x: o.x + offset, y: o.y + offset } as SceneObject;
      }
    });
  }

  copy() {
    this.clipboard = this.selectedObjects.map((o) => ({ ...o }));
    this.pasteCount = 0;
    if (this.clipboard.length) this.toast(`Copied ${this.clipboard.length} object${this.clipboard.length > 1 ? 's' : ''}`);
  }

  paste() {
    if (!this.clipboard.length) return;
    this.pasteCount++;
    const clones = this.cloneObjects(this.clipboard, 20 * this.pasteCount * this.unitScale());
    this.putObjects(clones, 'Paste');
    this.setSelection(clones.map((c) => c.id));
  }

  groupSelection() {
    const objs = this.selectedObjects;
    if (objs.length < 2) return;
    const g = uid('g');
    this.putObjects(objs.map((o) => ({ ...o, groupId: g })), 'Group');
  }

  ungroupSelection() {
    const objs = this.selectedObjects.filter((o) => o.groupId);
    if (!objs.length) return;
    this.putObjects(objs.map((o) => ({ ...o, groupId: null })), 'Ungroup');
  }

  /** Depth ordering: 'forward' | 'backward' | 'front' | 'back'. */
  reorderSelection(mode: 'forward' | 'backward' | 'front' | 'back') {
    const objs = this.selectedObjects;
    if (!objs.length) return;
    const all = Object.values(this.doc.objects);
    const maxZ = Math.max(0, ...all.map((o) => o.zBias ?? 0));
    const minZ = Math.min(0, ...all.map((o) => o.zBias ?? 0));
    const next = objs.map((o) => {
      const z = o.zBias ?? 0;
      const nz = mode === 'forward' ? z + 1 : mode === 'backward' ? z - 1 : mode === 'front' ? maxZ + 1 : minZ - 1;
      return { ...o, zBias: nz };
    });
    this.putObjects(next, { forward: 'Bring Forward', backward: 'Send Backward', front: 'Bring to Front', back: 'Send to Back' }[mode]);
  }

  moveSelectionToLayer(layerId: string) {
    const l = this.layer(layerId);
    if (!l || l.kind !== 'objects' && l.kind !== 'effects' && l.kind !== 'lighting') return;
    const objs = this.selectedObjects.filter((o) => {
      if (l.kind === 'effects') return o.type === 'effect';
      if (l.kind === 'lighting') return o.type === 'light';
      return o.type !== 'effect';
    });
    this.putObjects(objs.map((o) => ({ ...o, layerId })), 'Change layer');
  }

  // ------------------------------------------------------------------ layers

  addLayer(kind: LayerKind, name?: string, index?: number): Layer {
    const names: Record<LayerKind, string> = { objects: 'Objects', paint: 'Texture Paint', folder: 'Group', effects: 'Atmosphere', grid: 'Grid', terrain: 'Land & Water', lighting: 'Lighting' };
    const l = makeLayer(kind, name ?? names[kind], kind === 'objects' ? { depthSort: true } : {});
    const layers = [...this.doc.layers];
    const active = this.activeLayer;
    let at = index ?? (active ? layers.indexOf(active) + 1 : layers.length);
    if (active?.parentId && kind !== 'folder') l.parentId = active.parentId;
    at = clamp(at, 0, layers.length);
    layers.splice(at, 0, l);
    this.withTx(`Add ${names[kind]} layer`, () => {
      if (kind === 'paint') this.setPaintLayerRecord(l.id, new PaintLayer(l.id, this.doc.width, this.doc.height, this.doc.rasterScale));
      this.setKey('layers', layers);
    });
    if (kind !== 'folder') this.activeLayerId = l.id;
    this.events.emit();
    return l;
  }

  updateLayer(id: string, patch: Partial<Layer>, label = 'Layer change') {
    const layers = this.doc.layers.map((l) => (l.id === id ? { ...l, ...patch } : l));
    this.setKey('layers', layers, label);
  }

  deleteLayer(id: string) {
    const l = this.layer(id);
    if (!l) return;
    if (l.kind === 'terrain') {
      this.toast('The Land & Water layer cannot be deleted (hide it instead).', 'error');
      return;
    }
    const ids = new Set([id, ...this.doc.layers.filter((c) => c.parentId === id).map((c) => c.id)]);
    this.withTx(`Delete layer "${l.name}"`, () => {
      for (const o of Object.values(this.doc.objects)) if (ids.has(o.layerId)) this.removeObject(o.id);
      for (const lid of ids) if (this.paint.has(lid)) this.setPaintLayerRecord(lid, null);
      this.setKey('layers', this.doc.layers.filter((x) => !ids.has(x.id)));
    });
  }

  duplicateLayer(id: string) {
    const l = this.layer(id);
    if (!l || l.kind === 'terrain' || l.kind === 'grid' || l.kind === 'lighting') return;
    const copy: Layer = { ...l, id: uid('l'), name: `${l.name} copy` };
    const layers = [...this.doc.layers];
    layers.splice(layers.indexOf(l) + 1, 0, copy);
    this.withTx(`Duplicate layer "${l.name}"`, () => {
      this.setKey('layers', layers);
      if (l.kind === 'paint') {
        const src = this.paint.get(id);
        const p = new PaintLayer(copy.id, this.doc.width, this.doc.height, this.doc.rasterScale);
        if (src) p.copyFrom(src);
        this.setPaintLayerRecord(copy.id, p);
      }
      const objs = this.layerObjects(id).map((o) => ({ ...o, layerId: copy.id }));
      const clones = this.cloneObjects(objs, 0).map((o) => ({ ...o, layerId: copy.id }));
      this.putObjects(clones);
    });
    this.activeLayerId = copy.id;
  }

  /** Move a layer to a new position in the root list or into/out of a folder. */
  moveLayer(id: string, targetId: string, where: 'above' | 'below' | 'into') {
    if (id === targetId) return;
    const layers = [...this.doc.layers];
    const l = layers.find((x) => x.id === id);
    const target = layers.find((x) => x.id === targetId);
    if (!l || !target) return;
    if (l.kind === 'folder' && (where === 'into' || target.parentId)) return; // no nested folders
    const rest = layers.filter((x) => x.id !== id);
    let parentId: string | null;
    let idx: number;
    if (where === 'into' && target.kind === 'folder') {
      parentId = target.id;
      // place as the top-most child: after the folder's last child in array order
      const children = rest.filter((x) => x.parentId === target.id);
      idx = children.length ? rest.indexOf(children[children.length - 1]) + 1 : rest.indexOf(target) + 1;
    } else {
      parentId = target.parentId;
      // Panel shows top → bottom; array is bottom → top. "above" in the panel = later in the array.
      idx = rest.indexOf(target) + (where === 'above' ? 1 : 0);
      if (target.kind === 'folder' && where === 'above') {
        // skip past the folder's children so we land above the whole folder
        const children = rest.filter((x) => x.parentId === target.id);
        if (children.length) idx = Math.max(idx, rest.indexOf(children[children.length - 1]) + 1);
      }
    }
    const moved = { ...l, parentId };
    rest.splice(idx, 0, moved);
    // Keep a folder's children with the folder when the folder itself moves.
    let final = rest;
    if (l.kind === 'folder') {
      const kids = rest.filter((x) => x.parentId === l.id);
      final = rest.filter((x) => x.parentId !== l.id);
      final.splice(final.indexOf(moved), 0, ...kids);
    }
    this.setKey('layers', final, 'Reorder layers');
  }

  /** Step a layer up/down one position in the panel. */
  nudgeLayer(id: string, dir: 1 | -1) {
    const order = panelOrder(this.doc.layers);
    const i = order.findIndex((x) => x.id === id);
    const j = i - dir; // panel is top→bottom, dir 1 = up
    if (i < 0 || j < 0 || j >= order.length) return;
    this.moveLayer(id, order[j].id, dir === 1 ? 'above' : 'below');
  }

  // ------------------------------------------------------------------ camera

  setViewport(w: number, h: number, dpr: number) {
    this.viewW = w;
    this.viewH = h;
    this.dpr = dpr;
  }

  setCamera(c: Partial<Camera>) {
    const z = clamp(c.zoom ?? this.camera.zoom, this.minZoom, this.maxZoom);
    this.camera = { x: c.x ?? this.camera.x, y: c.y ?? this.camera.y, zoom: z };
    this.cameraEvents.emit();
    this.requestRender();
  }

  get minZoom() {
    return Math.min(0.05, this.fitZoom() * 0.5);
  }

  get maxZoom() {
    return this.doc.assetPack === 'atlas' ? 16 : 6;
  }

  fitZoom() {
    return Math.min((this.viewW - 60) / this.doc.width, (this.viewH - 60) / this.doc.height);
  }

  fit() {
    this.setCamera({ x: this.doc.width / 2, y: this.doc.height / 2, zoom: this.fitZoom() });
  }

  screenToWorld(sx: number, sy: number): Vec {
    return { x: (sx - this.viewW / 2) / this.camera.zoom + this.camera.x, y: (sy - this.viewH / 2) / this.camera.zoom + this.camera.y };
  }

  worldToScreen(wx: number, wy: number): Vec {
    return { x: (wx - this.camera.x) * this.camera.zoom + this.viewW / 2, y: (wy - this.camera.y) * this.camera.zoom + this.viewH / 2 };
  }

  zoomAt(sx: number, sy: number, zoom: number) {
    const before = this.screenToWorld(sx, sy);
    const z = clamp(zoom, this.minZoom, this.maxZoom);
    this.camera = { ...this.camera, zoom: z };
    const after = this.screenToWorld(sx, sy);
    this.setCamera({ x: this.camera.x + before.x - after.x, y: this.camera.y + before.y - after.y, zoom: z });
  }

  viewRect(): Rect {
    const a = this.screenToWorld(0, 0), b = this.screenToWorld(this.viewW, this.viewH);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  }

  // ------------------------------------------------------------------ tools

  setTool(id: ToolId) {
    if (this.tool === id) return;
    this.tools[this.tool]?.deactivate?.(this);
    this.tool = id;
    this.tools[id]?.activate?.(this);
    this.events.emit();
    this.requestRender();
  }

  get currentTool(): Tool | undefined {
    return this.tools[this.tool];
  }

  setActiveLayer(id: string) {
    this.activeLayerId = id;
    this.events.emit();
  }

  setPreview(on: boolean) {
    this.previewMode = on;
    this.events.emit();
    this.requestRender();
  }

  // ------------------------------------------------------------------ saving

  markChanged(immediate = false) {
    this.changeCounter++;
    this.doc.updated = Date.now();
    if (this.saveStatus !== 'saving') this.setStatus('unsaved');
    if (!this.firstUnsaved) this.firstUnsaved = Date.now();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    const overdue = Date.now() - this.firstUnsaved > 8000;
    this.saveTimer = setTimeout(() => void this.save(), immediate || overdue ? 50 : 1200);
  }

  private setStatus(s: SaveStatus) {
    if (this.saveStatus === s) return;
    this.saveStatus = s;
    this.events.emit();
  }

  get hasUnsavedChanges() {
    return this.changeCounter !== this.savedCounter;
  }

  async save(force = false): Promise<void> {
    if (this.disposed && !force) return;
    if (this.saving) {
      this.saveQueued = true;
      return;
    }
    if (!force && !this.hasUnsavedChanges) return;
    // Don't snapshot in the middle of a stroke; retry shortly.
    if (this.inTransaction) {
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => void this.save(), 600);
      return;
    }
    this.saving = true;
    this.setStatus('saving');
    const counter = this.changeCounter;
    try {
      this.mask.flush();
      const doc: ProjectDoc = { ...this.doc, camera: { ...this.camera }, objects: { ...this.doc.objects }, layers: [...this.doc.layers] };
      const rasters: Record<string, Blob> = {};
      rasters.terrain = await this.rasterBlob('terrain', this.mask.version, this.mask.canvas);
      for (const [id, p] of this.paint) {
        if (!p.hasContent) continue;
        rasters[id] = await this.rasterBlob(id, p.version, p.canvas);
      }
      let thumb: Blob | undefined;
      if (Date.now() - this.lastThumb > 20000 || force) {
        thumb = await this.thumbnail();
        this.lastThumb = Date.now();
      }
      await db.saveProject({ id: doc.id, doc, rasters }, thumb);
      this.savedCounter = counter;
      this.saveError = null;
      if (this.changeCounter === counter) {
        this.firstUnsaved = 0;
        this.setStatus('saved');
      } else this.setStatus('unsaved');
    } catch (err) {
      console.error(err);
      this.saveError = err instanceof Error ? err.message : String(err);
      this.setStatus('error');
      this.toast(`Save failed: ${this.saveError}`, 'error');
    } finally {
      this.saving = false;
      if (this.saveQueued || (this.changeCounter !== this.savedCounter && this.saveStatus !== 'error')) {
        this.saveQueued = false;
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => void this.save(), 800);
      }
    }
  }

  private async rasterBlob(key: string, version: number, canvas: HTMLCanvasElement): Promise<Blob> {
    const cached = this.rasterBlobs.get(key);
    if (cached && cached.version === version && cached.blob) return cached.blob;
    const blob = await canvasToBlob(canvas, 'image/png');
    this.rasterBlobs.set(key, { version, blob });
    return blob;
  }

  async thumbnail(max = 360): Promise<Blob> {
    const s = Math.min(max / this.doc.width, max / this.doc.height);
    const c = makeCanvas(this.doc.width * s, this.doc.height * s);
    const ctx = ctx2d(c);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    renderScene(ctx, this.env, {
      view: { x: 0, y: 0, w: this.doc.width, h: this.doc.height }, pxPerUnit: s, deviceW: c.width, deviceH: c.height,
      cached: false, grid: false, labels: true, lighting: true, effects: true,
    });
    return canvasToBlob(c, 'image/webp', 0.8).catch(() => canvasToBlob(c, 'image/png'));
  }

  // ------------------------------------------------------------------ helpers

  newSeed() {
    return randomSeed();
  }

  lights() {
    return collectLights(this.env);
  }

  boundsOf(o: SceneObject) {
    return objectBounds(o, this.doc);
  }

  info() {
    return mapTypeInfo(this.doc.mapType);
  }
}

/** Mask resolution: generous for small maps, bounded for large ones. */
export function terrainScale(doc: Pick<ProjectDoc, 'width' | 'height'>) {
  return Math.min(1, Math.sqrt(2_400_000 / (doc.width * doc.height)));
}

/** Layers in panel order (top → bottom), with folder children following their folder. */
export function panelOrder(layers: Layer[]): Layer[] {
  const out: Layer[] = [];
  const roots = layers.filter((l) => !l.parentId).reverse();
  for (const r of roots) {
    out.push(r);
    if (r.kind === 'folder') out.push(...layers.filter((c) => c.parentId === r.id).reverse());
  }
  return out;
}

/** Forward-compatible document migration hook. */
function migrate(doc: ProjectDoc): ProjectDoc {
  const d = { ...doc };
  if (!d.layers.some((l) => l.kind === 'terrain')) d.layers = [makeLayer('terrain', 'Land & Water'), ...d.layers];
  if (!d.rasterScale) d.rasterScale = 1;
  return d;
}
