import { uid } from '../core/ids';
import type { ProjectDoc } from '../model/types';
import type { StoredProject } from './db';

/**
 * Portable project files (.inkbound): the scene JSON plus raster layers as
 * data URLs. Useful for backups and moving maps between browsers.
 */

const MAGIC = 'inkbound-project';

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

async function dataUrlToBlob(u: string): Promise<Blob> {
  const res = await fetch(u);
  return res.blob();
}

export async function projectToFile(p: StoredProject): Promise<Blob> {
  const rasters: Record<string, string> = {};
  for (const [k, b] of Object.entries(p.rasters)) if (b) rasters[k] = await blobToDataUrl(b);
  const json = JSON.stringify({ format: MAGIC, version: 1, doc: p.doc, rasters });
  return new Blob([json], { type: 'application/json' });
}

export async function projectFromFile(file: File): Promise<StoredProject> {
  let data: { format?: string; doc?: ProjectDoc; rasters?: Record<string, string> };
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('This file is not a valid Inkbound project.');
  }
  if (data.format !== MAGIC || !data.doc || !Array.isArray(data.doc.layers)) throw new Error('This file is not a valid Inkbound project.');
  const rasters: Record<string, Blob> = {};
  for (const [k, u] of Object.entries(data.rasters ?? {})) rasters[k] = await dataUrlToBlob(u);
  const id = uid('p');
  const now = Date.now();
  return { id, doc: { ...data.doc, id, updated: now, name: data.doc.name || 'Imported map' }, rasters };
}
