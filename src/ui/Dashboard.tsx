import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, FileUp, Loader2, Map as MapIcon, Mountain, Pencil, Plus, Sparkles, Trash2, FileDown, Image as ImageIcon } from 'lucide-react';
import type { Editor } from '../editor/editor';
import { mapTypeInfo } from '../model/defaults';
import type { ProjectMeta } from '../model/types';
import * as db from '../storage/db';
import { IconButton, Modal, usePopover } from './controls';
import { ExportDialog } from './ExportDialog';
import { NewMapDialog } from './NewMapDialog';
import { downloadProjectFile, duplicateMap, importProjectFile, openEditorFor } from './projectOps';
import { navigate } from './router';
import { toast } from './toast';

function timeAgo(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
}

export function Dashboard() {
  const [maps, setMaps] = useState<ProjectMeta[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [exporting, setExporting] = useState<Editor | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProjectMeta | null>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    try {
      setMaps(await db.listProjects());
      setUsage(await db.storageEstimate());
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
      setMaps([]);
    }
  };
  useEffect(() => { void refresh(); }, []);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const createSample = (which: 'varren' | 'camp') =>
    run(which === 'varren' ? "Building Varren's Forest…" : 'Building Adventurer Camp…', async () => {
      const { buildSample } = await import('../samples');
      const id = await buildSample(which);
      navigate(`#/map/${id}`);
    });

  return (
    <div className="dash">
      <header className="dash-header">
        <div className="brand"><Mountain size={26} /> INKBOUND</div>
        <span className="muted">Fantasy map maker</span>
        <div style={{ marginLeft: 'auto' }} className="row">
          <button className="btn" onClick={() => fileRef.current?.click()}><FileUp size={15} /> Import project</button>
          <button className="btn primary" onClick={() => setShowNew(true)}><Plus size={16} /> Create New Map</button>
        </div>
        <input ref={fileRef} type="file" accept=".json,.inkbound,application/json" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void run('Importing…', async () => { await importProjectFile(f); await refresh(); toast('Project imported'); });
        }} />
      </header>
      <div className="dash-body scroll">
        <div className="dash-title">
          <h1>Your Maps</h1>
          {usage && usage.quota > 0 && <span className="muted">Stored in this browser · {(usage.usage / 1048576).toFixed(1)} MB used</span>}
        </div>
        {maps === null ? (
          <div className="row muted"><Loader2 className="spin" size={16} /> Loading…</div>
        ) : (
          <div className="cards">
            <button className="card new" onClick={() => setShowNew(true)}>
              <Plus size={28} />
              <span style={{ fontWeight: 600 }}>Create New Map</span>
              <span className="muted" style={{ fontSize: 12 }}>World · Region · Settlement · Battlemap · Dungeon · Cave · Camp · Interior</span>
            </button>
            {maps.map((m) => (
              <MapCard key={m.id} meta={m} onChanged={refresh}
                onDuplicate={() => run('Duplicating…', async () => { await duplicateMap(m.id); await refresh(); })}
                onDelete={() => setConfirmDelete(m)}
                onExportImage={() => run('Preparing export…', async () => setExporting(await openEditorFor(m.id)))}
                onExportFile={() => run('Packaging project…', () => downloadProjectFile(m.id))}
              />
            ))}
          </div>
        )}
        <div className="samples">
          <Sparkles size={16} className="muted" />
          <span className="muted">Test maps from the spec:</span>
          <button className="btn" disabled={!!busy} onClick={() => createSample('varren')}>Varren's Forest (region)</button>
          <button className="btn" disabled={!!busy} onClick={() => createSample('camp')}>Adventurer Camp (twilight battlemap)</button>
        </div>
        {maps?.length === 0 && (
          <div className="empty-state">
            <MapIcon size={36} />
            <p>No maps yet. Create one, or open a sample map to see what Inkbound can do.</p>
          </div>
        )}
      </div>
      {showNew && <NewMapDialog onClose={() => setShowNew(false)} />}
      {busy && (
        <div className="backdrop"><div className="row" style={{ background: 'var(--panel)', padding: '14px 18px', borderRadius: 10 }}><Loader2 className="spin" size={18} /> {busy}</div></div>
      )}
      {exporting && <ExportDialog editor={exporting} onClose={() => { exporting.dispose(); setExporting(null); }} />}
      {confirmDelete && (
        <Modal title="Delete map?" narrow onClose={() => setConfirmDelete(null)} footer={<>
          <button className="btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
          <button className="btn danger" onClick={() => { const m = confirmDelete; setConfirmDelete(null); void run('Deleting…', async () => { await db.deleteProject(m.id); await refresh(); toast(`Deleted “${m.name}”`); }); }}><Trash2 size={14} /> Delete</button>
        </>}>
          <p>“{confirmDelete.name}” will be permanently deleted from this browser. This cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
}

function MapCard(p: { meta: ProjectMeta; onChanged: () => void; onDuplicate: () => void; onDelete: () => void; onExportImage: () => void; onExportFile: () => void }) {
  const m = p.meta;
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(m.name);
  const url = useMemo(() => (m.thumbnail ? URL.createObjectURL(m.thumbnail) : null), [m.thumbnail]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const pop = usePopover();
  const open = () => navigate(`#/map/${m.id}`);
  const commitRename = async () => {
    setRenaming(false);
    const n = name.trim();
    if (n && n !== m.name) {
      await db.updateMeta(m.id, { name: n });
      p.onChanged();
    } else setName(m.name);
  };
  return (
    <div className="card">
      <div className="card-thumb" style={url ? { backgroundImage: `url(${url})` } : undefined} onClick={open} title="Open">
        {!url && <div className="placeholder"><MapIcon size={28} /></div>}
      </div>
      <div className="card-body">
        {renaming ? (
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') void commitRename(); if (e.key === 'Escape') { setName(m.name); setRenaming(false); } }} />
        ) : (
          <div className="card-name" title={m.name}>{m.name}</div>
        )}
        <div className="card-meta">
          <span className="type">{mapTypeInfo(m.mapType).label}</span>
          <span>{m.width} × {m.height}</span>
          <span>Edited {timeAgo(m.updated)}</span>
        </div>
        <div className="card-actions" style={{ position: 'relative' }}>
          <button className="btn small primary" onClick={open}>Open</button>
          <IconButton small icon={<Pencil size={14} />} tip="Rename" onClick={() => setRenaming(true)} />
          <IconButton small icon={<Copy size={14} />} tip="Duplicate" onClick={p.onDuplicate} />
          <IconButton small icon={<Download size={14} />} tip="Export" onClick={() => pop.setOpen(!pop.open)} />
          <span className="grow" />
          <IconButton small icon={<Trash2 size={14} />} tip="Delete" onClick={p.onDelete} />
          {pop.open && (
            <div className="popover" ref={pop.ref} style={{ top: 30, left: 60, width: 220, padding: 6 }}>
              <button className="btn ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => { pop.setOpen(false); p.onExportImage(); }}><ImageIcon size={14} /> Export image (PNG/JPEG/WebP)</button>
              <button className="btn ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => { pop.setOpen(false); p.onExportFile(); }}><FileDown size={14} /> Download project file</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
