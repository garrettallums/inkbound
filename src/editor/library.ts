import { blobToImage } from '../core/canvas';
import { Emitter } from '../core/emitter';
import { uid } from '../core/ids';
import { clearAssetCaches, registerAsset, unregisterAsset, getAsset } from '../engine/assets/registry';
import { registerBuiltInAssets } from '../engine/assets';
import { BUILTIN_COLLECTIONS, type AssetCollection } from '../engine/collections';
import * as db from '../storage/db';

/**
 * Asset library state shared by all editors: imported assets, user
 * collections, favourites and recently used (spec §21, §48–49).
 */

const FAV_KEY = 'inkbound.favorites';
const RECENT_KEY = 'inkbound.recent';

function readList(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeList(key: string, v: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

class Library {
  events = new Emitter();
  userCollections: AssetCollection[] = [];
  customIds: string[] = [];
  favorites = new Set(readList(FAV_KEY));
  recent: string[] = readList(RECENT_KEY);
  loaded = false;
  private loading: Promise<void> | null = null;
  version = 0;

  load(): Promise<void> {
    registerBuiltInAssets();
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const assets = await db.listCustomAssets();
        for (const a of assets) await this.registerStored(a);
        this.userCollections = await db.listCollections();
      } catch (e) {
        console.warn('Could not load custom assets', e);
      }
      this.loaded = true;
      this.bump();
    })();
    return this.loading;
  }

  private bump() {
    this.version++;
    this.events.emit();
  }

  private async registerStored(a: db.StoredAsset) {
    const img = await blobToImage(a.blob);
    const id = `custom/${a.id}`;
    registerAsset({
      id, name: a.name, category: 'Imported', subcategory: a.folder || 'Unsorted', pack: 'topdown', tags: ['imported', ...a.tags],
      w: a.w, h: a.h, role: 'details', collision: 'prop', image: img, custom: true, folder: a.folder, footprint: 0.7,
    });
    if (!this.customIds.includes(id)) this.customIds.push(id);
  }

  /** Import PNG / WebP / JPEG files as custom assets. */
  async importFiles(files: File[], folder: string, sizeHint: number): Promise<string[]> {
    const ids: string[] = [];
    for (const f of files) {
      if (!/^image\/(png|webp|jpeg)$/.test(f.type)) throw new Error(`${f.name}: only PNG, WebP and JPEG images are supported.`);
      if (f.size > 25 * 1024 * 1024) throw new Error(`${f.name} is larger than 25 MB.`);
      const img = await blobToImage(f);
      const k = sizeHint / Math.max(img.width, img.height);
      const rec: db.StoredAsset = {
        id: uid('a'), name: f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Imported asset', folder: folder || 'Unsorted',
        blob: f, w: Math.max(4, Math.round(img.width * k)), h: Math.max(4, Math.round(img.height * k)), created: Date.now(), tags: [],
      };
      await db.putCustomAsset(rec);
      await this.registerStored(rec);
      ids.push(`custom/${rec.id}`);
    }
    this.bump();
    return ids;
  }

  async renameCustom(id: string, patch: { name?: string; folder?: string }) {
    const raw = id.replace(/^custom\//, '');
    const list = await db.listCustomAssets();
    const rec = list.find((a) => a.id === raw);
    if (!rec) return;
    const next = { ...rec, ...patch };
    await db.putCustomAsset(next);
    const def = getAsset(id);
    if (def) registerAsset({ ...def, name: next.name, folder: next.folder, subcategory: next.folder });
    clearAssetCaches(id);
    this.bump();
  }

  async deleteCustom(id: string) {
    await db.deleteCustomAsset(id.replace(/^custom\//, ''));
    unregisterAsset(id);
    this.customIds = this.customIds.filter((x) => x !== id);
    this.bump();
  }

  toggleFavorite(id: string) {
    if (this.favorites.has(id)) this.favorites.delete(id);
    else this.favorites.add(id);
    writeList(FAV_KEY, [...this.favorites]);
    this.bump();
  }

  touchRecent(id: string) {
    this.recent = [id, ...this.recent.filter((x) => x !== id)].slice(0, 24);
    writeList(RECENT_KEY, this.recent);
    this.bump();
  }

  collections(pack: 'atlas' | 'topdown'): AssetCollection[] {
    return [...BUILTIN_COLLECTIONS.filter((c) => c.pack === pack || c.pack === 'any'), ...this.userCollections];
  }

  getCollection(id: string | null): AssetCollection | undefined {
    if (!id) return undefined;
    return BUILTIN_COLLECTIONS.find((c) => c.id === id) ?? this.userCollections.find((c) => c.id === id);
  }

  async saveCollection(c: AssetCollection) {
    const rec = { ...c, builtIn: false };
    await db.putCollection(rec);
    this.userCollections = [...this.userCollections.filter((x) => x.id !== rec.id), rec];
    this.bump();
  }

  async deleteCollection(id: string) {
    await db.deleteCollection(id);
    this.userCollections = this.userCollections.filter((x) => x.id !== id);
    this.bump();
  }
}

export const library = new Library();
