import { useMemo } from 'react';
import { Eraser, Minus, Plus, PaintBucket, Trash2, Waves, Sparkles, Shrink, Expand } from 'lucide-react';
import type { Editor } from '../editor/editor';
import { BRUSH_PRESETS } from '../editor/settings';
import { LIGHTING_PRESETS, lightingFromPreset } from '../model/defaults';
import type { EffectKind, EffectObject, LightKind, LightingPreset, LightingSettings } from '../model/types';
import { EFFECT_INFO } from '../engine/effects';
import { LIGHT_PRESETS, ambientColor } from '../engine/lighting';
import { PATH_PRESETS } from '../engine/paths';
import { TEXT_PRESETS } from '../engine/text';
import { TEXTURES, getTextureCanvas } from '../engine/textures';
import { atmosphereTool, makeEffect } from '../tools/misc';
import type { TerrainOp } from '../engine/terrainMask';
import { AssetPanel } from './AssetPanel';
import { TracePanel } from './TracePanel';
import { Check, ColorInput, IconButton, NumberInput, Section, Seg, Slider, tipProps, useEmitter } from './controls';
import { pathWidth } from '../tools/pathTool';

export function ToolPanel({ editor: ed }: { editor: Editor }) {
  switch (ed.tool) {
    case 'terrain': return <TerrainPanel ed={ed} />;
    case 'brush': return <BrushPanel ed={ed} />;
    case 'asset': return <AssetPanel editor={ed} />;
    case 'path': return <PathPanel ed={ed} />;
    case 'text': return <TextPanel ed={ed} />;
    case 'light': return <LightPanel ed={ed} />;
    case 'atmosphere': return <AtmospherePanel ed={ed} />;
    default: return <SelectPanel ed={ed} />;
  }
}

// ------------------------------------------------------------------ select

function SelectPanel({ ed }: { ed: Editor }) {
  const n = ed.selection.length;
  return (
    <>
      <Section title="Selection">
        <div className="btn-row">
          <button className="btn small" onClick={() => ed.selectAll()} {...tipProps('Select all', 'Ctrl+A')}>All</button>
          <button className="btn small" onClick={() => ed.selectLayer()} {...tipProps('Select everything on the active layer')}>Active layer</button>
          <button className="btn small" disabled={!n} onClick={() => ed.selectSameAsset()} {...tipProps('Select every object using the same asset')}>Same asset</button>
          <button className="btn small" disabled={!n} onClick={() => ed.setSelection([])}>None</button>
        </div>
        <div className="btn-row" style={{ marginTop: 6 }}>
          <button className="btn small" disabled={n < 2} onClick={() => ed.groupSelection()} {...tipProps('Group permanently', 'Ctrl+G')}>Group</button>
          <button className="btn small" disabled={!n} onClick={() => ed.ungroupSelection()} {...tipProps('Ungroup', 'Ctrl+Shift+G')}>Ungroup</button>
        </div>
      </Section>
      <Section title="Options">
        <Check label="Snap to grid" checked={ed.settings.snap} onChange={(v) => ed.updateSettings('snap', v)} />
      </Section>
      <Section title="How to">
        <p className="hint">
          Click to select · Shift-click to add · Drag on empty space for a selection box.<br />
          Drag to move (Shift locks axis) · Corner handles scale uniformly (Shift for free) · Edge handles stretch · Top handle rotates (Shift snaps 15°).<br />
          For a selected path: drag its points, Alt-click or double-click the path to add a point, double-click a point to remove it.
        </p>
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ terrain

const TERRAIN_OPS: { id: TerrainOp | 'fill'; label: string; icon: React.ReactNode; tip: string }[] = [
  { id: 'add', label: 'Add', icon: <Plus size={14} />, tip: 'Paint land (floor). Hold Alt to subtract.' },
  { id: 'remove', label: 'Remove', icon: <Minus size={14} />, tip: 'Paint water (void). Hold Alt to add.' },
  { id: 'smooth', label: 'Smooth', icon: <Waves size={14} />, tip: 'Soften jagged coastlines' },
  { id: 'roughen', label: 'Roughen', icon: <Sparkles size={14} />, tip: 'Break up edges into organic detail' },
  { id: 'expand', label: 'Expand', icon: <Expand size={14} />, tip: 'Grow land outward' },
  { id: 'contract', label: 'Contract', icon: <Shrink size={14} />, tip: 'Erode land inward' },
  { id: 'fill', label: 'Fill', icon: <PaintBucket size={14} />, tip: 'Click to flip a whole connected land/water region' },
];

function TerrainPanel({ ed }: { ed: Editor }) {
  const s = ed.settings.terrain;
  const set = (p: Partial<typeof s>) => ed.updateSettings('terrain', p);
  return (
    <>
      <TracePanel ed={ed} />
      <Section title="Action">
        <div className="preset-grid">
          {TERRAIN_OPS.map((o) => (
            <button key={o.id} className={`preset-btn${s.op === o.id ? ' on' : ''}`} onClick={() => set({ op: o.id })} {...tipProps(o.tip, o.id === 'add' || o.id === 'remove' ? 'X' : undefined)}>
              {o.icon} {o.label}
            </button>
          ))}
        </div>
      </Section>
      {s.op !== 'fill' && (
        <Section title="Brush">
          <Slider label="Brush size" value={s.size} min={4} max={1500} step={1} precision={0} onChange={(v) => set({ size: v })} tip="[ and ] change size" />
          <Slider label="Roughness" value={s.roughness} min={0} max={1} step={0.01} onChange={(v) => set({ roughness: v })} tip="Organic, noisy coastline edges instead of circles" />
          <Slider label="Hardness" value={s.hardness} min={0} max={1} step={0.01} onChange={(v) => set({ hardness: v })} />
          <Slider label="Strength" value={s.strength} min={0.05} max={1} step={0.01} onChange={(v) => set({ strength: v })} />
        </Section>
      )}
      <Section title="Tips">
        <p className="hint">
          Land/water drives coastlines on world maps, shorelines on battlemaps, and floors vs. rock on cave & dungeon maps. Coastlines are vectorised automatically so they stay crisp at any zoom and export size. Change coast style & textures in <b>Map settings</b>.
        </p>
        <div className="btn-row">
          <button className="btn small" onClick={() => { ed.mask.beginEdit(); ed.mask.fillAll(255); const p = ed.mask.endEdit(); if (p) ed.pushRaster(p, 'Fill all land'); ed.terrain.markEdited({ x: 0, y: 0, w: ed.doc.width, h: ed.doc.height }); ed.terrain.rebuild(); }}>Fill all land</button>
          <button className="btn small" onClick={() => { ed.mask.beginEdit(); ed.mask.fillAll(0); const p = ed.mask.endEdit(); if (p) ed.pushRaster(p, 'Clear to water'); ed.terrain.markEdited({ x: 0, y: 0, w: ed.doc.width, h: ed.doc.height }); ed.terrain.rebuild(); }}>Clear to water</button>
        </div>
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ brush

const texUrls = new Map<string, string>();
export function textureUrl(id: string) {
  let u = texUrls.get(id);
  if (!u) {
    u = getTextureCanvas(id).toDataURL('image/jpeg', 0.8);
    texUrls.set(id, u);
  }
  return u;
}

function BrushPanel({ ed }: { ed: Editor }) {
  const b = ed.settings.brush;
  const set = (p: Partial<typeof b>) => ed.updateSettings('brush', p);
  const total = b.mix.reduce((a, m) => a + m.weight, 0) || 1;
  const toggleTex = (id: string, add: boolean) => {
    const has = b.mix.find((m) => m.texture === id);
    if (add) set({ presetId: 'custom', mix: has ? b.mix.filter((m) => m.texture !== id) : [...b.mix, { texture: id, weight: 20 }] });
    else set({ presetId: 'custom', mix: [{ texture: id, weight: 100 }] });
  };
  const brushTextures = TEXTURES.filter((t) => t.brush);
  return (
    <>
      <Section title="Mode">
        <Seg full value={b.erase ? 'erase' : 'paint'} onChange={(v) => set({ erase: v === 'erase' })} options={[
          { value: 'paint', label: 'Paint' }, { value: 'erase', label: <><Eraser size={13} /> Erase</>, tip: 'E toggles · hold Alt to erase temporarily' },
        ]} />
      </Section>
      <Section title="Brush presets">
        <div className="preset-grid">
          {BRUSH_PRESETS.map((p) => (
            <button key={p.id} className={`preset-btn${b.presetId === p.id ? ' on' : ''}`} onClick={() => set({ presetId: p.id, mix: p.mix.map((m) => ({ ...m })) })}>
              <span className="swatch" style={{ backgroundImage: `url(${textureUrl(p.mix[0].texture)})`, backgroundSize: 'cover' }} /> {p.name}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Texture mix" right={<span className="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>Shift-click adds</span>}>
        <div className="tex-grid" style={{ marginBottom: 8 }}>
          {brushTextures.map((t) => (
            <div key={t.id} className={`tex-tile${b.mix.some((m) => m.texture === t.id) ? ' on' : ''}`} style={{ backgroundImage: `url(${textureUrl(t.id)})` }}
              onClick={(e) => toggleTex(t.id, e.shiftKey)} {...tipProps(`${t.name} — click to use, Shift-click to mix`)}>
              <span>{t.name}</span>
            </div>
          ))}
        </div>
        <div className="weights">
          {b.mix.map((m, i) => (
            <div className="wrow" key={m.texture}>
              <img src={textureUrl(m.texture)} alt="" />
              <input type="range" min={1} max={100} value={m.weight} onChange={(e) => set({ presetId: 'custom', mix: b.mix.map((x, j) => (j === i ? { ...x, weight: +e.target.value } : x)) })} />
              <span className="nm">{TEXTURES.find((t) => t.id === m.texture)?.name}</span>
              <span className="pct">{Math.round((m.weight / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Brush settings">
        <Slider label="Size" value={b.size} min={2} max={1200} step={1} precision={0} onChange={(v) => set({ size: v })} tip="[ and ] change size" />
        <Slider label="Opacity" value={b.opacity} min={0.02} max={1} step={0.01} onChange={(v) => set({ opacity: v })} />
        <Slider label="Flow" value={b.flow} min={0.02} max={1} step={0.01} onChange={(v) => set({ flow: v })} tip="How much paint each dab deposits — low flow builds up gradually" />
        <Slider label="Hardness" value={b.hardness} min={0} max={1} step={0.01} onChange={(v) => set({ hardness: v })} />
        <Slider label="Edge softness" value={b.softness} min={0} max={1} step={0.01} onChange={(v) => set({ softness: v })} tip="Noise-eroded edges blend textures naturally" />
        <Slider label="Texture scale" value={b.textureScale} min={0.2} max={4} step={0.05} onChange={(v) => set({ textureScale: v })} />
        <Slider label="Rotation" value={b.rotation} min={0} max={360} step={1} precision={0} onChange={(v) => set({ rotation: v })} />
        <Slider label="Rotation variation" value={b.rotationVariation} min={0} max={180} step={1} precision={0} onChange={(v) => set({ rotationVariation: v })} />
      </Section>
      <Section title="Paint only on">
        <Seg full value={b.clip ?? 'none'} onChange={(v) => set({ clip: v })} options={[
          { value: 'none', label: 'Anywhere' }, { value: 'land', label: 'Land', tip: 'Clip paint to land / floor' }, { value: 'water', label: 'Water', tip: 'Clip paint to water / void' },
        ]} />
      </Section>
      <Section title="Target">
        <p className="hint">Paints onto the active texture layer ({ed.activeLayer?.kind === 'paint' ? ed.activeLayer.name : 'first texture layer'}). Add more texture layers in the Layers panel.</p>
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ path

function PathPanel({ ed }: { ed: Editor }) {
  const s = ed.settings.path;
  const groups = useMemo(() => [...new Set(PATH_PRESETS.map((p) => p.group))], []);
  const width = pathWidth(ed, s.presetId);
  return (
    <>
      {groups.map((g) => (
        <Section key={g} title={g}>
          <div className="preset-grid">
            {PATH_PRESETS.filter((p) => p.group === g).map((p) => (
              <button key={p.id} className={`preset-btn${s.presetId === p.id ? ' on' : ''}`} onClick={() => ed.updateSettings('path', { presetId: p.id, width: null })}>
                <span className="swatch" style={{ background: p.color }} /> {p.label}
              </button>
            ))}
          </div>
        </Section>
      ))}
      <Section title="New path width">
        <div className="row">
          <NumberInput value={width} min={0.5} max={2000} step={1} onChange={(v) => ed.updateSettings('path', { width: v })} />
          <span className="hint">world px</span>
          {s.width !== null && <button className="btn small ghost" onClick={() => ed.updateSettings('path', { width: null })}>Reset</button>}
        </div>
      </Section>
      <Section title="How to">
        <p className="hint">
          <b>Click</b> to place control points, <b>double-click</b> or <b>Enter</b> to finish, click the first point to close a loop. <b>Press and drag</b> to sketch a route freehand — it becomes smooth editable points.<br />
          Inkbound adds the meanders, width variation, tapering and rough banks. Tweak everything afterwards in Properties.
        </p>
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ text

function TextPanel({ ed }: { ed: Editor }) {
  const s = ed.settings.text;
  return (
    <>
      <Section title="Label style">
        <div className="preset-grid">
          {TEXT_PRESETS.map((p) => (
            <button key={p.id} className={`preset-btn${s.presetId === p.id ? ' on' : ''}`} onClick={() => ed.updateSettings('text', { presetId: p.id })}>
              <span style={{ fontFamily: p.patch.font, color: p.patch.color === '#1e1914' || p.patch.color === '#2b2118' ? undefined : p.patch.color }}>{p.label}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="How to">
        <p className="hint">Click on the map to add a label, then type its text in Properties. Click an existing label to edit it. Curve, spacing, outline and shadow are in Properties.</p>
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ light

function LightPanel({ ed }: { ed: Editor }) {
  const s = ed.settings.light;
  const lights = ed.lights();
  return (
    <>
      <Section title="Light source">
        <div className="preset-grid">
          {(Object.keys(LIGHT_PRESETS) as LightKind[]).map((k) => (
            <button key={k} className={`preset-btn${s.kind === k ? ' on' : ''}`} onClick={() => ed.updateSettings('light', { kind: k })}>
              <span className="swatch" style={{ background: LIGHT_PRESETS[k].color, borderRadius: '50%' }} /> {LIGHT_PRESETS[k].label}
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 8 }}>Click the map to place a light; drag a light to move it. Lights are independent of assets — put a Campfire light on a campfire asset, a Window glow by a house.</p>
      </Section>
      <Section title={`Lights on this map (${lights.length})`}>
        {lights.length === 0 && <p className="hint">None yet.</p>}
        <div className="coll-list">
          {lights.slice(0, 60).map((l) => (
            <button key={l.id} className={`coll-item${ed.selection.includes(l.id) ? ' on' : ''}`} onClick={() => ed.setSelection([l.id])}>
              <span className="swatch" style={{ background: l.color, borderRadius: '50%' }} /> {LIGHT_PRESETS[l.kind].label}
              <span className="muted" style={{ marginLeft: 'auto' }}>r {Math.round(l.radius)}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Ambient">
        <p className="hint">Lights shine brightest against darker global lighting — set the time of day in the Atmosphere tool.</p>
        <button className="btn small" onClick={() => ed.setTool('atmosphere')}>Open Atmosphere</button>
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ atmosphere

const PRESET_ORDER: LightingPreset[] = ['none', 'dawn', 'day', 'golden', 'sunset', 'twilight', 'night', 'moonlight', 'overcast'];
const PRESET_LABEL: Record<LightingPreset, string> = { none: 'Off', dawn: 'Dawn', day: 'Day', golden: 'Golden hour', sunset: 'Sunset', twilight: 'Twilight', night: 'Night', moonlight: 'Moonlight', overcast: 'Overcast' };

function AtmospherePanel({ ed }: { ed: Editor }) {
  useEmitter(ed.events);
  const L = ed.doc.lighting;
  const set = (p: Partial<LightingSettings>, label = 'Adjust lighting') => ed.setKey('lighting', { ...ed.doc.lighting, ...p, enabled: (p.enabled ?? ed.doc.lighting.enabled) }, label);
  const effects = ed.doc.layers.filter((l) => l.kind === 'effects').flatMap((l) => ed.layerObjects(l.id)).filter((o): o is EffectObject => o.type === 'effect');
  const kinds = Object.keys(EFFECT_INFO) as EffectKind[];
  return (
    <>
      <Section title="Global lighting">
        <div className="preset-grid">
          {PRESET_ORDER.map((p) => (
            <button key={p} className={`preset-btn${L.preset === p ? ' on' : ''}`} onClick={() => ed.setKey('lighting', lightingFromPreset(p, L.lightDirection), `Lighting: ${PRESET_LABEL[p]}`)}>
              <span className="swatch" style={{ background: p === 'none' ? 'transparent' : ambientColor(lightingFromPreset(p)) }} /> {PRESET_LABEL[p]}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <Check label="Lighting enabled" checked={L.enabled} onChange={(v) => set({ enabled: v }, 'Toggle lighting')} />
        </div>
      </Section>
      <Section title="Manual controls">
        <Slider label="Ambient brightness" value={L.ambient} min={0.05} max={1.2} step={0.01} onChange={(v) => set({ ambient: v, enabled: true })} />
        <div className="row between" style={{ marginBottom: 8 }}>
          <span className="label">Ambient colour</span>
          <ColorInput value={L.ambientColor} onChange={(v) => set({ ambientColor: v, enabled: true })} />
        </div>
        <Slider label="Temperature (cool ↔ warm)" value={L.temperature} min={-1} max={1} step={0.01} onChange={(v) => set({ temperature: v, enabled: true })} />
        <Slider label="Contrast" value={L.contrast} min={-0.5} max={0.5} step={0.01} onChange={(v) => set({ contrast: v })} />
        <Slider label="Shadow intensity" value={L.shadowIntensity} min={0} max={1} step={0.01} onChange={(v) => set({ shadowIntensity: v })} />
        <Slider label="Light direction (°)" value={L.lightDirection} min={0} max={360} step={1} precision={0} onChange={(v) => set({ lightDirection: v })} tip="Direction the light comes from; shadows fall the opposite way" />
        <p className="hint">Lighting is non-destructive: it never alters terrain or assets and can be turned off at export. Layers above the Lighting layer (e.g. Labels) stay unlit.</p>
      </Section>
      <Section title="Environmental effects">
        <div className="field">
          <label>Add to whole map</label>
          <div className="chips">
            {kinds.map((k) => (
              <button key={k} className="chip" onClick={() => { const e = makeEffect(ed, k, null); ed.putObjects([e], `Add ${EFFECT_INFO[k].label}`); ed.setSelection([e.id]); }}>{EFFECT_INFO[k].label}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Or drag on the map to add a regional</label>
          <select className="select" value={atmosphereTool.kind} onChange={(e) => { atmosphereTool.kind = e.target.value as EffectKind; ed.events.emit(); }}>
            {kinds.map((k) => <option key={k} value={k}>{EFFECT_INFO[k].label}</option>)}
          </select>
        </div>
        {effects.length > 0 && <div className="label" style={{ margin: '6px 0' }}>On this map</div>}
        <div className="coll-list">
          {effects.map((e) => (
            <div key={e.id} className={`coll-item${ed.selection.includes(e.id) ? ' on' : ''}`} onClick={() => ed.setSelection([e.id])} style={{ cursor: 'pointer' }}>
              <span className="swatch" style={{ background: e.color }} />
              <span>{EFFECT_INFO[e.kind].label}</span>
              <span className="muted">{e.region ? 'region' : 'whole map'}</span>
              <span className="grow" />
              <IconButton small icon={<Trash2 size={13} />} tip="Remove effect" onClick={() => ed.removeObject(e.id)} />
            </div>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 6 }}>Select an effect to adjust intensity, scale, colour and direction in Properties.</p>
      </Section>
    </>
  );
}

