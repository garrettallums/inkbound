import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, ImagePlus, Pipette, Loader2, Wand2 } from 'lucide-react';
import { rgbToHex, type RGB } from '../core/color';
import type { Editor } from '../editor/editor';
import { DEFAULT_TRACE, detectReferenceWater, traceReference, tracePick } from '../editor/trace';
import { Check, IconButton, Section, Slider, tipProps } from './controls';
import { toast } from './toast';

/** Terrain-panel section for tracing an existing map image into Inkbound terrain. */
export function TracePanel({ ed }: { ed: Editor }) {
  const ref = ed.referenceLayer;
  const fileRef = useRef<HTMLInputElement>(null);
  const [water, setWater] = useState<RGB | null>(null);
  const [opts, setOpts] = useState(DEFAULT_TRACE);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (ref && !water) {
      try { setWater(detectReferenceWater(ed)); } catch { /* not loaded yet */ }
    }
  }, [ref?.id]);

  useEffect(() => () => { tracePick.active = false; tracePick.onPick = null; }, []);

  const upload = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { toast('Please choose a PNG, JPEG or WebP image.', 'error'); return; }
    try {
      await ed.setReferenceImage(f);
      setWater(detectReferenceWater(ed));
      const ratio = (ed.refImages.get(ed.referenceLayer!.id)!.naturalWidth / ed.refImages.get(ed.referenceLayer!.id)!.naturalHeight);
      const mapRatio = ed.doc.width / ed.doc.height;
      if (Math.abs(ratio - mapRatio) / mapRatio > 0.05) toast('Note: the image is stretched to the map. Create the map with “Trace an existing map” to match its proportions.');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const pick = () => {
    tracePick.active = true;
    tracePick.onPick = (c) => { setWater(c); setPicking(false); tracePick.onPick = null; };
    setPicking(true);
    ed.events.emit();
    toast('Click on the sea in the map to sample its colour.');
  };

  const run = async () => {
    if (!water) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const res = traceReference(ed, { ...opts, water });
      if (ref) ed.updateLayer(ref.id, { opacity: 0.25 }, 'Reference opacity');
      toast(`Traced: ${res.landPct}% land, ${res.trees} trees, ${res.mountains} mountains — one undo step.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const set = (p: Partial<typeof opts>) => setOpts({ ...opts, ...p });

  return (
    <Section title="Trace from image">
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
      {!ref ? (
        <>
          <p className="hint">Have a map from another tool, a scan or a sketch? Load it as a reference image, then convert its land, water, snow, forests and mountains into editable Inkbound terrain.</p>
          <button className="btn" onClick={() => fileRef.current?.click()}><ImagePlus size={14} /> Load reference image</button>
        </>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 8 }}>
            <IconButton small icon={ref.visible ? <Eye size={13} /> : <EyeOff size={13} />} tip={ref.visible ? 'Hide reference' : 'Show reference'}
              onClick={() => ed.updateLayer(ref.id, { visible: !ref.visible }, 'Toggle reference')} />
            <div className="grow">
              <Slider label="Reference opacity" value={ref.opacity} min={0} max={1} step={0.01} onChange={(v) => ed.updateLayer(ref.id, { opacity: v }, 'Adjust reference opacity')} />
            </div>
          </div>
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="label grow">Water colour</span>
            <span className="swatch" style={{ width: 22, height: 22, background: water ? rgbToHex(water) : 'transparent' }} />
            <button className={`btn small${picking ? ' active' : ''}`} onClick={pick} {...tipProps('Click the sea on the map to sample it')}><Pipette size={13} /> Pick</button>
            <button className="btn small" onClick={() => setWater(detectReferenceWater(ed))} {...tipProps('Detect from the image edges')}>Auto</button>
          </div>
          <Slider label="Water tolerance" value={opts.tolerance} min={0} max={1} step={0.01} onChange={(v) => set({ tolerance: v })} tip="Raise if parts of the sea are traced as land; lower if land leaks into the sea" />
          <Slider label="Ignore islands smaller than (%)" value={opts.minIsland * 100} min={0} max={0.5} step={0.005} precision={3} onChange={(v) => set({ minIsland: v / 100 })} tip="Removes labels, icons and specks sitting on the water" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px', margin: '4px 0 8px' }}>
            <Check label="Coastline" checked={opts.coast} onChange={(v) => set({ coast: v })} />
            <Check label="Ground textures" checked={opts.textures} onChange={(v) => set({ textures: v })} tip="Snow, forest floor and rock painted where the image shows them" />
            <Check label="Forests" checked={opts.forests} onChange={(v) => set({ forests: v })} />
            <Check label="Mountains" checked={opts.mountains} onChange={(v) => set({ mountains: v })} />
          </div>
          {opts.forests && <Slider label="Forest density" value={opts.forestDensity} min={0} max={1} step={0.01} onChange={(v) => set({ forestDensity: v })} />}
          <div className="row">
            <button className="btn primary grow" disabled={busy || !water} onClick={run}>{busy ? <Loader2 className="spin" size={14} /> : <Wand2 size={14} />} Convert to Inkbound</button>
            <button className="btn small" onClick={() => fileRef.current?.click()}>Replace</button>
          </div>
          <p className="hint" style={{ marginTop: 6 }}>Everything it creates is normal, editable content (one undo step). Then add rivers, roads and labels by tracing over the reference. The reference image is never exported.</p>
        </>
      )}
    </Section>
  );
}
