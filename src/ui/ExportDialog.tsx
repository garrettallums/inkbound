import { useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { Editor } from '../editor/editor';
import { downloadBlob, exportMap, safeFilename, type ExportOptions } from '../engine/export';
import { downloadProjectFile } from './projectOps';
import { Check, Modal, Seg } from './controls';
import { toast } from './toast';

export function ExportDialog({ editor: ed, onClose }: { editor: Editor; onClose: () => void }) {
  const [o, setO] = useState<ExportOptions>({ format: 'png', scale: 1, grid: ed.doc.grid.type !== 'none' && ed.info().grid !== 'none', labels: true, lighting: true, effects: true, quality: 0.92 });
  const [progress, setProgress] = useState<{ f: number; label: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const W = ed.doc.width * o.scale, H = ed.doc.height * o.scale;
  const run = async () => {
    abort.current = new AbortController();
    setProgress({ f: 0, label: 'Preparing…' });
    try {
      const res = await exportMap(ed, o, (f, label) => setProgress({ f, label }), abort.current.signal);
      const ext = res.blob.type === 'image/jpeg' ? 'jpg' : res.blob.type === 'image/webp' ? 'webp' : 'png';
      downloadBlob(res.blob, `${safeFilename(ed.doc.name)}-${res.width}x${res.height}.${ext}`);
      toast(res.note ?? `Exported ${res.width} × ${res.height} (${(res.blob.size / 1048576).toFixed(1)} MB)`, res.note ? 'error' : 'info');
      onClose();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast(`Export failed: ${e instanceof Error ? e.message : e}`, 'error');
      setProgress(null);
    }
  };
  const set = (p: Partial<ExportOptions>) => setO({ ...o, ...p });
  return (
    <Modal title="Export Map" narrow onClose={() => { abort.current?.abort(); onClose(); }} footer={progress ? (
      <button className="btn" onClick={() => abort.current?.abort()}>Cancel</button>
    ) : (
      <>
        <button className="btn ghost" style={{ marginRight: 'auto' }} onClick={() => void ed.save(true).then(() => downloadProjectFile(ed.doc.id)).catch((e) => toast(String(e), 'error'))}>Project file</button>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={run}><Download size={15} /> Export {o.format.toUpperCase()}</button>
      </>
    )}>
      {progress ? (
        <div>
          <div className="row" style={{ marginBottom: 10 }}><Loader2 className="spin" size={16} /> {progress.label}</div>
          <div className="progress"><div style={{ width: `${Math.round(progress.f * 100)}%` }} /></div>
        </div>
      ) : (
        <>
          <div className="field">
            <label>Format</label>
            <Seg full value={o.format} onChange={(v) => set({ format: v })} options={[
              { value: 'png', label: 'PNG', tip: 'Highest quality, lossless' },
              { value: 'jpeg', label: 'JPEG', tip: 'Smaller files' },
              { value: 'webp', label: 'WebP', tip: 'Efficient high-resolution images' },
            ]} />
          </div>
          <div className="field">
            <label>Resolution</label>
            <Seg full value={String(o.scale) as '1' | '2' | '4'} onChange={(v) => set({ scale: Number(v) })} options={[
              { value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: '4', label: '4×' },
            ]} />
            <span className="hint">{W.toLocaleString()} × {H.toLocaleString()} px{W * H > 16e6 && o.format !== 'png' ? ' — very large; PNG is recommended at this size' : ''}</span>
          </div>
          {o.format !== 'png' && (
            <div className="field">
              <label>Quality {Math.round(o.quality * 100)}%</label>
              <input type="range" min={0.5} max={1} step={0.01} value={o.quality} onChange={(e) => set({ quality: +e.target.value })} />
            </div>
          )}
          <div className="field">
            <label>Include</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <Check label="Grid" checked={o.grid} onChange={(v) => set({ grid: v })} />
              <Check label="Labels" checked={o.labels} onChange={(v) => set({ labels: v })} />
              <Check label="Lighting" checked={o.lighting} onChange={(v) => set({ lighting: v })} />
              <Check label="Effects" checked={o.effects} onChange={(v) => set({ effects: v })} />
            </div>
          </div>
          <p className="hint">The whole map is rendered at full quality from the scene (not a screenshot of the viewport). Large exports render in strips with progress; PNG streams to disk-friendly chunks so even 4× exports of big maps avoid browser memory limits.</p>
        </>
      )}
    </Modal>
  );
}
