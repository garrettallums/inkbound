import type { Vec } from '../core/geom';
import { uid } from '../core/ids';
import type { Editor } from '../editor/editor';
import { library } from '../editor/library';
import { getAsset, getSprite, PAD } from '../engine/assets/registry';
import type { CollectionItem } from '../engine/collections';
import { snapToGrid } from '../engine/renderer';
import { ScatterStroke } from '../engine/scatter';
import type { AssetObject } from '../model/types';
import { drawBrushCursor, sizeKeys } from './paint';
import type { Tool } from './types';

/**
 * Assets tool (spec §30–35): click-to-place with the asset attached to the
 * cursor, the randomized scatter brush, and a scatter eraser.
 */

export function activeScatterItems(ed: Editor): CollectionItem[] {
  const s = ed.settings.asset;
  if (s.collectionId) return library.getCollection(s.collectionId)?.items ?? [];
  return s.items;
}

interface ScatterState { stroke: ScatterStroke; count: number; points: Vec[] }
interface EraseState { ids: Set<string>; any: boolean; removed: number }

const placeRng = Math.random;

export interface AssetTool extends Tool {
  scatter: ScatterState | null;
  erase: EraseState | null;
  lastStroke: Vec[] | null;
  startScatter(ed: Editor, items: CollectionItem[], points: Vec[]): void;
  dabScatter(ed: Editor, p: Vec): void;
}

export const assetTool: AssetTool = {
  id: 'asset',
  scatter: null,
  erase: null,
  lastStroke: null,

  cursor(ed) {
    const s = ed.settings.asset;
    return s.mode === 'place' && s.assetId ? 'none' : s.mode === 'place' ? 'default' : 'none';
  },

  down(ed, ev) {
    const s = ed.settings.asset;
    if (s.mode === 'place') {
      if (!s.assetId) {
        ed.toast('Pick an asset from the library first.');
        return;
      }
      const def = getAsset(s.assetId);
      if (!def) return;
      let p = ev.world;
      if (ed.settings.snap) p = snapToGrid(ed.doc.grid, p.x, p.y);
      const scale = ed.doc.assetScale * (1 + (placeRng() - 0.5) * 2 * s.randomScale);
      const o: AssetObject = {
        id: uid('o'), type: 'asset', layerId: ed.targetLayer(def.role).id, assetId: def.id, x: p.x, y: p.y,
        sx: scale, sy: scale, rotation: (placeRng() - 0.5) * 2 * s.randomRotation, flipX: s.randomFlip && def.pack === 'atlas' ? placeRng() < 0.5 : false,
        flipY: false, opacity: 1, shadow: s.shadow, blur: 0,
      };
      ed.putObjects([o], `Place ${def.name}`);
      library.touchRecent(def.id);
      return;
    }
    if (s.mode === 'erase') {
      const ids = new Set(activeScatterItems(ed).map((i) => i.assetId));
      ed.begin('Erase scattered assets');
      this.erase = { ids, any: ev.shift || ids.size === 0, removed: 0 };
      this.move!(ed, ev, true);
      return;
    }
    // scatter
    const items = activeScatterItems(ed);
    if (!items.length) {
      ed.toast('Choose a collection or tick some assets to scatter.');
      return;
    }
    this.startScatter(ed, items, [ev.world]);
  },

  move(ed, ev, dragging) {
    ed.cursorWorld = ev.world;
    if (dragging && this.scatter) {
      this.scatter.points.push(ev.world);
      this.dabScatter(ed, ev.world);
    } else if (dragging && this.erase) {
      const r = ed.settings.asset.scatter.size;
      for (const o of ed.selectableObjects()) {
        if (o.type !== 'asset') continue;
        if (!this.erase.any && !this.erase.ids.has(o.assetId)) continue;
        if (Math.hypot(o.x - ev.world.x, o.y - ev.world.y) <= r) {
          ed.removeObject(o.id);
          this.erase.removed++;
        }
      }
    }
    ed.requestRender();
  },

  up(ed) {
    if (this.scatter) {
      this.lastStroke = this.scatter.points;
      const n = this.scatter.count;
      this.scatter = null;
      ed.commit();
      if (n) ed.toast(`Scattered ${n} object${n === 1 ? '' : 's'} (one undo step)`);
    }
    if (this.erase) {
      this.erase = null;
      ed.commit();
    }
  },

  key(ed, k) {
    const s = ed.settings.asset;
    return sizeKeys(k, s.scatter.size, (size) => ed.updateSettings('asset', { scatter: { ...s.scatter, size } }));
  },

  cancel(ed) {
    if (this.scatter || this.erase) {
      this.scatter = null;
      this.erase = null;
      ed.rollback();
      return true;
    }
    if (ed.settings.asset.mode === 'place' && ed.settings.asset.assetId) {
      ed.updateSettings('asset', { assetId: null });
      return true;
    }
    return false;
  },

  overlay(ed, ctx, unit) {
    const s = ed.settings.asset;
    const p = ed.cursorWorld;
    if (!p) return;
    if (s.mode === 'place') {
      const def = s.assetId ? getAsset(s.assetId) : null;
      if (!def) return;
      let q = p;
      if (ed.settings.snap) q = snapToGrid(ed.doc.grid, q.x, q.y);
      const sc = ed.doc.assetScale;
      const w = def.w * sc, h = def.h * sc;
      const sprite = getSprite(def, (1 / unit) * sc);
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.drawImage(sprite, q.x - (w * (1 + PAD * 2)) / 2, q.y - (h * (1 + PAD * 2)) / 2, w * (1 + PAD * 2), h * (1 + PAD * 2));
      ctx.restore();
      return;
    }
    drawBrushCursor(ctx, p, s.scatter.size, unit, s.mode === 'erase' ? '#ff9a8a' : '#9fe0a0');
  },

  startScatter(ed: Editor, items: CollectionItem[], points: Vec[]) {
    const s = ed.settings.asset;
    const existing = ed.selectableObjects().concat(ed.doc.layers.filter((l) => !ed.isLayerVisible(l.id)).flatMap((l) => ed.layerObjects(l.id)));
    const coll = library.getCollection(s.collectionId);
    const settings = { ...s.scatter, rules: { ...s.scatter.rules } };
    const stroke = new ScatterStroke(
      {
        doc: ed.doc, mask: ed.mask, baseScale: ed.doc.assetScale, shadow: s.shadow,
        layerFor: (role) => ed.targetLayer(role).id,
      },
      items, settings, existing,
    );
    ed.begin(`Scatter ${coll?.name ?? 'assets'}`);
    this.scatter = { stroke, count: 0, points: [...points] };
    for (const p of points) this.dabScatter(ed, p);
  },

  dabScatter(ed: Editor, p: Vec) {
    const st = this.scatter;
    if (!st) return;
    const objs = st.stroke.dab(p.x, p.y);
    if (objs.length) {
      ed.putObjects(objs);
      st.count += objs.length;
    }
  },
};

/** Undo the previous scatter stroke and replay it with the current settings/seed ("Apply"). */
export function reapplyLastScatter(ed: Editor): boolean {
  const t = assetTool;
  const pts = t.lastStroke;
  const last = ed.history.undoStack[ed.history.undoStack.length - 1];
  if (!pts || !last || !last.label.startsWith('Scatter')) return false;
  ed.undo();
  const items = activeScatterItems(ed);
  if (!items.length) return false;
  t.startScatter(ed, items, [pts[0]]);
  for (const p of pts.slice(1)) {
    t.scatter?.points.push(p);
    t.dabScatter(ed, p);
  }
  t.up!(ed, { world: pts[pts.length - 1], screen: { x: 0, y: 0 }, button: 0, shift: false, alt: false, ctrl: false, pressure: 1, unit: 1 });
  return true;
}

