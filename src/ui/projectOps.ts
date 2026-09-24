import { Editor } from '../editor/editor';
import { library } from '../editor/library';
import { uid } from '../core/ids';
import { createProjectDoc, type NewProjectOptions, type StartTerrain } from '../model/defaults';
import * as db from '../storage/db';
import { projectFromFile, projectToFile } from '../storage/projectFile';
import { downloadBlob, safeFilename } from '../engine/export';
import { installTools } from '../tools';
import { pendingEditors, navigate } from './router';
import { toast } from './toast';

export async function createMap(o: NewProjectOptions & { start: StartTerrain }) {
  await library.load();
  const doc = createProjectDoc(o);
  const ed = Editor.create(doc, o.start);
  ed.toast = toast;
  await ed.save(true);
  pendingEditors.set(doc.id, ed);
  navigate(`#/map/${doc.id}`);
}

export async function openEditorFor(id: string): Promise<Editor> {
  await library.load();
  const stored = await db.loadProject(id);
  if (!stored) throw new Error('Map not found');
  const ed = await Editor.load(stored);
  installTools(ed);
  ed.toast = toast;
  return ed;
}

export async function duplicateMap(id: string) {
  const stored = await db.loadProject(id);
  if (!stored) throw new Error('Map not found');
  const meta = await db.getMeta(id);
  const nid = uid('p');
  const now = Date.now();
  await db.saveProject({ id: nid, doc: { ...stored.doc, id: nid, name: `${stored.doc.name} (copy)`, created: now, updated: now }, rasters: stored.rasters }, meta?.thumbnail ?? null);
}

export async function downloadProjectFile(id: string) {
  const stored = await db.loadProject(id);
  if (!stored) throw new Error('Map not found');
  downloadBlob(await projectToFile(stored), `${safeFilename(stored.doc.name)}.inkbound.json`);
}

export async function importProjectFile(file: File) {
  const p = await projectFromFile(file);
  await db.saveProject(p, null);
  // Generate a thumbnail by loading it once.
  try {
    const ed = await Editor.load(p);
    await ed.save(true);
    ed.dispose();
  } catch {
    /* thumbnail is optional */
  }
  return p.doc.id;
}
