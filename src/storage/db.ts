import type { ProjectDoc, ProjectMeta } from '../model/types';
import type { AssetCollection } from '../engine/collections';

/**
 * Local-first persistence in IndexedDB. Everything runs in the browser, so
 * hosting is a static site with no per-user server cost (spec §55). The
 * storage layer is isolated here so a remote backend could be added later.
 */

const DB_NAME = 'inkbound';
const DB_VERSION = 1;

export interface StoredProject {
  id: string;
  doc: ProjectDoc;
  /** Raster layers as PNG blobs keyed by 'terrain' or paint layer id. */
  rasters: Record<string, Blob>;
}

export interface StoredAsset {
  id: string;
  name: string;
  folder: string;
  blob: Blob;
  w: number;
  h: number;
  created: number;
  tags: string[];
}

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not support IndexedDB, so maps cannot be saved.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('collections')) db.createObjectStore('collections', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('recovery')) db.createObjectStore('recovery', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open database'));
    req.onblocked = () => reject(new Error('Database is blocked by another tab. Close other Inkbound tabs and retry.'));
  });
  return dbp;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name: string, mode: IDBTransactionMode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const s = await store('meta');
  const all = (await wrap(s.getAll())) as ProjectMeta[];
  return all.sort((a, b) => b.updated - a.updated);
}

export async function loadProject(id: string): Promise<StoredProject | undefined> {
  const s = await store('projects');
  return (await wrap(s.get(id))) as StoredProject | undefined;
}

export async function saveProject(p: StoredProject, thumbnail?: Blob | null): Promise<void> {
  const db = await open();
  const tx = db.transaction(['projects', 'meta'], 'readwrite');
  tx.objectStore('projects').put(p);
  const prev = (await wrap(tx.objectStore('meta').get(p.id))) as ProjectMeta | undefined;
  const meta: ProjectMeta = {
    id: p.id, name: p.doc.name, mapType: p.doc.mapType, width: p.doc.width, height: p.doc.height,
    created: p.doc.created, updated: p.doc.updated, thumbnail: thumbnail === undefined ? prev?.thumbnail ?? null : thumbnail,
  };
  tx.objectStore('meta').put(meta);
  await txDone(tx);
}

export async function updateMeta(id: string, patch: Partial<ProjectMeta>) {
  const db = await open();
  const tx = db.transaction(['meta', 'projects'], 'readwrite');
  const meta = (await wrap(tx.objectStore('meta').get(id))) as ProjectMeta | undefined;
  if (meta) tx.objectStore('meta').put({ ...meta, ...patch });
  if (patch.name) {
    const p = (await wrap(tx.objectStore('projects').get(id))) as StoredProject | undefined;
    if (p) tx.objectStore('projects').put({ ...p, doc: { ...p.doc, name: patch.name } });
  }
  await txDone(tx);
}

export async function deleteProject(id: string) {
  const db = await open();
  const tx = db.transaction(['meta', 'projects', 'recovery'], 'readwrite');
  tx.objectStore('meta').delete(id);
  tx.objectStore('projects').delete(id);
  tx.objectStore('recovery').delete(id);
  await txDone(tx);
}

export async function getMeta(id: string): Promise<ProjectMeta | undefined> {
  const s = await store('meta');
  return (await wrap(s.get(id))) as ProjectMeta | undefined;
}

// ---------------------------------------------------------------- recovery journal

export interface RecoveryRecord { id: string; doc: ProjectDoc; time: number }

export async function writeRecovery(r: RecoveryRecord) {
  const s = await store('recovery', 'readwrite');
  await wrap(s.put(r));
}

export async function readRecovery(id: string): Promise<RecoveryRecord | undefined> {
  const s = await store('recovery');
  return (await wrap(s.get(id))) as RecoveryRecord | undefined;
}

export async function clearRecovery(id: string) {
  const s = await store('recovery', 'readwrite');
  await wrap(s.delete(id));
}

// ---------------------------------------------------------------- custom assets & collections

export async function listCustomAssets(): Promise<StoredAsset[]> {
  const s = await store('assets');
  return ((await wrap(s.getAll())) as StoredAsset[]).sort((a, b) => a.created - b.created);
}

export async function putCustomAsset(a: StoredAsset) {
  const s = await store('assets', 'readwrite');
  await wrap(s.put(a));
}

export async function deleteCustomAsset(id: string) {
  const s = await store('assets', 'readwrite');
  await wrap(s.delete(id));
}

export async function listCollections(): Promise<AssetCollection[]> {
  const s = await store('collections');
  return (await wrap(s.getAll())) as AssetCollection[];
}

export async function putCollection(c: AssetCollection) {
  const s = await store('collections', 'readwrite');
  await wrap(s.put(c));
}

export async function deleteCollection(id: string) {
  const s = await store('collections', 'readwrite');
  await wrap(s.delete(id));
}

/** Rough storage usage estimate for the dashboard. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}

export async function requestPersistence() {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* optional */
  }
}
