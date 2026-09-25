import { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CANVAS_PRESETS, MAP_TYPES, MAX_MAP_DIM, MIN_MAP_DIM, THEMES, mapTypeInfo, type StartTerrain } from '../model/defaults';
import type { MapType } from '../model/types';
import { Modal, NumberInput } from './controls';
import { createMap } from './projectOps';
import { toast } from './toast';

const STARTS: { id: StartTerrain; label: string; hint: string }[] = [
  { id: 'water', label: 'Empty water', hint: 'Start from open sea / void and paint land yourself' },
  { id: 'land', label: 'All land', hint: 'Solid ground edge to edge' },
  { id: 'landmass', label: 'Landmass', hint: 'A seeded organic continent to reshape' },
  { id: 'islands', label: 'Islands', hint: 'A few seeded islands to reshape' },
  { id: 'lake', label: 'Central lake', hint: 'Land with a lake in the middle' },
  { id: 'cavern', label: 'Cavern', hint: 'A seeded natural cave floor' },
  { id: 'rooms', label: 'Rooms', hint: 'A few connected rectangular chambers' },
];

export function NewMapDialog({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<MapType>('region');
  const info = mapTypeInfo(type);
  const [name, setName] = useState('');
  const [preset, setPreset] = useState<string>('hd');
  const [w, setW] = useState(1920);
  const [h, setH] = useState(1080);
  const [theme, setTheme] = useState(info.theme);
  const [start, setStart] = useState<StartTerrain>(info.start);
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState<{ file: File; w: number; h: number; url: string } | null>(null);
  const refInput = useRef<HTMLInputElement>(null);

  const pickReference = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { toast('Please choose a PNG, JPEG or WebP image.', 'error'); return; }
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      // Keep the image's proportions; make the long side at least 2400px (at most 4096).
      const long = Math.max(img.naturalWidth, img.naturalHeight);
      const k = Math.min(4096, Math.max(2400, long)) / long;
      const W = Math.round(img.naturalWidth * k), H = Math.round(img.naturalHeight * k);
      setReference({ file: f, w: W, h: H, url });
      setW(W); setH(H); setPreset('custom');
      if (!name) setName(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
    };
    img.onerror = () => toast('Could not read that image.', 'error');
    img.src = url;
  };

  const pickType = (t: MapType) => {
    setType(t);
    const i = mapTypeInfo(t);
    setTheme(i.theme);
    setStart(i.start);
  };
  const pickPreset = (id: string) => {
    setPreset(id);
    const p = CANVAS_PRESETS.find((x) => x.id === id);
    if (p) { setW(p.w); setH(p.h); }
  };
  const create = async () => {
    setBusy(true);
    try {
      await createMap({ name: name.trim() || `New ${info.label} Map`, mapType: type, width: w, height: h, theme, start: reference ? 'water' : start, reference: reference?.file });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
      setBusy(false);
    }
  };
  const mp = ((w * h) / 1e6).toFixed(1);
  return (
    <Modal title="Create New Map" onClose={onClose} footer={<>
      <span className="muted" style={{ marginRight: 'auto' }}>{w} × {h} px · {mp} MP{w * h > 25e6 ? ' · large maps may be slower to edit' : ''}</span>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={busy} onClick={create}>{busy ? <Loader2 className="spin" size={15} /> : null} Create Map</button>
    </>}>
      <div className="label" style={{ marginBottom: 6 }}>Map type</div>
      <div className="type-grid">
        {MAP_TYPES.map((t) => (
          <button key={t.id} className={`type-card${t.id === type ? ' on' : ''}`} onClick={() => pickType(t.id)}>
            <b>{t.label}</b>
            <span>{t.blurb}</span>
          </button>
        ))}
      </div>
      <p className="hint" style={{ marginTop: -6 }}>Map types only set sensible defaults (style, grid, asset pack, lighting). Every tool stays available.</p>
      <div className="form-grid">
        <div className="field">
          <label>Name</label>
          <input className="input" placeholder={`New ${info.label} Map`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} autoFocus />
        </div>
        <div className="field">
          <label>Style</label>
          <select className="select" value={theme} onChange={(e) => setTheme(e.target.value)}>
            {Object.entries(THEMES).map(([id, t]) => <option key={id} value={id}>{t.name}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Canvas size</label>
        <div className="chips">
          {CANVAS_PRESETS.map((p) => (
            <button key={p.id} className={`chip${preset === p.id ? ' on' : ''}`} onClick={() => pickPreset(p.id)}>{p.label}{['square', 'portrait', 'landscape'].includes(p.id) ? ` · ${p.w}×${p.h}` : ''}</button>
          ))}
          <button className={`chip${preset === 'custom' ? ' on' : ''}`} onClick={() => setPreset('custom')}>Custom</button>
        </div>
        {preset === 'custom' && (
          <div className="row" style={{ marginTop: 8 }}>
            <span className="label">Width</span>
            <NumberInput value={w} min={MIN_MAP_DIM} max={MAX_MAP_DIM} precision={0} onChange={(v) => setW(Math.round(v))} />
            <span className="label">Height</span>
            <NumberInput value={h} min={MIN_MAP_DIM} max={MAX_MAP_DIM} precision={0} onChange={(v) => setH(Math.round(v))} />
            <span className="hint">px ({MIN_MAP_DIM}–{MAX_MAP_DIM})</span>
          </div>
        )}
      </div>
      <div className="field">
        <label>Trace an existing map (optional)</label>
        <input ref={refInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { void pickReference(e.target.files?.[0]); e.target.value = ''; }} />
        {reference ? (
          <div className="row">
            <img src={reference.url} alt="" style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--line-2)' }} />
            <span className="hint grow">{reference.file.name} — the map will match its proportions. After creating, open <b>Terrain → Trace from image</b> and press <b>Convert</b>.</span>
            <button className="btn small" onClick={() => setReference(null)}>Remove</button>
          </div>
        ) : (
          <div className="row">
            <button className="btn" onClick={() => refInput.current?.click()}>Choose image…</button>
            <span className="hint">A map exported from another tool, a scan or a sketch. It becomes a reference layer you can auto-convert and trace over.</span>
          </div>
        )}
      </div>
      {!reference && <div className="field">
        <label>Starting terrain</label>
        <div className="chips">
          {STARTS.map((s) => (
            <button key={s.id} className={`chip${start === s.id ? ' on' : ''}`} title={s.hint} onClick={() => setStart(s.id)}>{s.label}</button>
          ))}
        </div>
        <p className="hint">{STARTS.find((s) => s.id === start)?.hint}. Seeded shapes are only a starting point — sculpt them with the Terrain tool.</p>
      </div>}
    </Modal>
  );
}
