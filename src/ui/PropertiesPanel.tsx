import { useEffect, useRef } from 'react';
import {
  ArrowDown, ArrowUp, BringToFront, Copy, FlipHorizontal2, FlipVertical2, Group, Lock, LockOpen, SendToBack, Trash2, Ungroup, Dice5, Repeat,
} from 'lucide-react';
import type { Editor } from '../editor/editor';
import { EFFECT_INFO } from '../engine/effects';
import { LIGHT_PRESETS } from '../engine/lighting';
import { PATH_PRESETS } from '../engine/paths';
import { assetDef } from '../engine/scene';
import { FONTS } from '../engine/text';
import type { AssetObject, EffectObject, LightKind, LightObject, PathObject, SceneObject, TextObject } from '../model/types';
import { focusTextEvents, textFocus } from '../tools/misc';
import { Check, ColorInput, IconButton, NumberInput, Section, Seg, Slider, tipProps } from './controls';

type Upd = <T extends SceneObject>(fn: (o: T) => T, label: string) => void;

export function PropertiesPanel({ editor: ed }: { editor: Editor }) {
  const objs = ed.selectedObjects;
  if (!objs.length) return <NoSelection ed={ed} />;
  const update: Upd = (fn, label) => ed.putObjects(ed.selectedObjects.filter((o) => !o.locked || label === 'lock').map((o) => fn(o as never)), `Adjust ${label}`);
  const types = new Set(objs.map((o) => o.type));
  const one = objs.length === 1 ? objs[0] : null;
  const locked = objs.every((o) => o.locked);
  const layers = ed.doc.layers.filter((l) => l.kind === 'objects' || l.kind === 'effects' || l.kind === 'lighting');
  const layerId = objs.every((o) => o.layerId === objs[0].layerId) ? objs[0].layerId : '';
  return (
    <>
      <Section title={one ? describe(one) : `${objs.length} objects selected`} right={
        <div className="row" style={{ gap: 2 }}>
          <IconButton small icon={locked ? <Lock size={13} /> : <LockOpen size={13} />} tip={locked ? 'Unlock' : 'Lock (prevents selecting on canvas & editing)'} active={locked}
            onClick={() => ed.putObjects(ed.selectedObjects.map((o) => ({ ...o, locked: !locked })), locked ? 'Unlock' : 'Lock')} />
          <IconButton small icon={<Copy size={13} />} tip="Duplicate" kbd="Ctrl+D" onClick={() => ed.duplicateSelection()} />
          <IconButton small icon={<Trash2 size={13} />} tip="Delete" kbd="Del" onClick={() => ed.deleteSelection()} />
        </div>
      }>
        <div className="field">
          <label>Layer</label>
          <select className="select" value={layerId} onChange={(e) => ed.moveSelectionToLayer(e.target.value)}>
            {!layerId && <option value="">(mixed)</option>}
            {layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="row" style={{ gap: 2 }}>
          <span className="label grow">Depth</span>
          <IconButton small icon={<ArrowUp size={13} />} tip="Bring forward" kbd="Ctrl+]" onClick={() => ed.reorderSelection('forward')} />
          <IconButton small icon={<ArrowDown size={13} />} tip="Send backward" kbd="Ctrl+[" onClick={() => ed.reorderSelection('backward')} />
          <IconButton small icon={<BringToFront size={13} />} tip="Bring to front" kbd="Ctrl+Shift+]" onClick={() => ed.reorderSelection('front')} />
          <IconButton small icon={<SendToBack size={13} />} tip="Send to back" kbd="Ctrl+Shift+[" onClick={() => ed.reorderSelection('back')} />
          <span style={{ width: 8 }} />
          <IconButton small icon={<Group size={13} />} tip="Group" kbd="Ctrl+G" disabled={objs.length < 2} onClick={() => ed.groupSelection()} />
          <IconButton small icon={<Ungroup size={13} />} tip="Ungroup" kbd="Ctrl+Shift+G" disabled={!objs.some((o) => o.groupId)} onClick={() => ed.ungroupSelection()} />
        </div>
        {objs.some((o) => o.groupId) && <p className="hint">Part of a group — clicking any member selects the whole group.</p>}
      </Section>
      {types.size === 1 && types.has('asset') && <AssetProps ed={ed} objs={objs as AssetObject[]} update={update} />}
      {types.size === 1 && types.has('text') && <TextProps objs={objs as TextObject[]} update={update} />}
      {types.size === 1 && types.has('path') && <PathProps ed={ed} objs={objs as PathObject[]} update={update} />}
      {types.size === 1 && types.has('light') && <LightProps objs={objs as LightObject[]} update={update} />}
      {types.size === 1 && types.has('effect') && <EffectProps ed={ed} objs={objs as EffectObject[]} update={update} />}
      {types.size > 1 && (
        <Section title="Mixed selection">
          <Slider label="Opacity" value={opacityOf(objs[0])} min={0} max={1} step={0.01}
            onChange={(v) => update((o: SceneObject) => ('opacity' in o ? { ...o, opacity: v } : o), 'opacity')} />
          <p className="hint">Move, rotate, scale with the handles on the canvas.</p>
        </Section>
      )}
    </>
  );
}

function opacityOf(o: SceneObject) {
  return 'opacity' in o ? o.opacity : 1;
}

function describe(o: SceneObject) {
  switch (o.type) {
    case 'asset': return assetDef(o).name;
    case 'text': return `Label “${o.text.slice(0, 18)}${o.text.length > 18 ? '…' : ''}”`;
    case 'path': return PATH_PRESETS.find((p) => p.profile === o.profile && p.style === o.style)?.label ?? 'Path';
    case 'light': return LIGHT_PRESETS[o.kind].label;
    case 'effect': return EFFECT_INFO[o.kind].label;
  }
}

function NoSelection({ ed }: { ed: Editor }) {
  const layer = ed.activeLayer;
  return (
    <Section title="Properties">
      <p className="hint">Nothing selected. Use the <b>Select</b> tool (V) and click an object, or drag a box around several.</p>
      {layer && <p className="hint">Active layer: <b>{layer.name}</b></p>}
      <p className="hint">Workflow: <b>Terrain</b> → <b>Brush</b> → <b>Assets</b> → <b>Path</b> & <b>Text</b> → <b>Light</b>/<b>Atmosphere</b> → <b>Export</b>.</p>
    </Section>
  );
}

function Prop({ label, value, onChange, step = 1, precision = 1, min, max }: { label: string; value: number; onChange: (v: number) => void; step?: number; precision?: number; min?: number; max?: number }) {
  return (
    <div className="prop">
      <span>{label}</span>
      <NumberInput value={value} onChange={onChange} step={step} precision={precision} min={min} max={max} />
    </div>
  );
}

// ------------------------------------------------------------------ assets

function AssetProps({ ed, objs, update }: { ed: Editor; objs: AssetObject[]; update: Upd }) {
  const o = objs[0];
  const d = assetDef(o);
  const up = (fn: (a: AssetObject) => AssetObject, label: string) => update<AssetObject>(fn, label);
  const single = objs.length === 1;
  return (
    <>
      <Section title="Transform">
        <div className="prop-grid">
          {single && <Prop label="X" value={o.x} onChange={(v) => up((a) => ({ ...a, x: v }), 'position')} />}
          {single && <Prop label="Y" value={o.y} onChange={(v) => up((a) => ({ ...a, y: v }), 'position')} />}
          <Prop label="W" value={d.w * o.sx} min={0.5} onChange={(v) => up((a) => ({ ...a, sx: Math.max(0.01, v / assetDef(a).w) }), 'size')} />
          <Prop label="H" value={d.h * o.sy} min={0.5} onChange={(v) => up((a) => ({ ...a, sy: Math.max(0.01, v / assetDef(a).h) }), 'size')} />
          <Prop label="↻" value={o.rotation} step={1} onChange={(v) => up((a) => ({ ...a, rotation: v }), 'rotation')} />
          <Prop label="%" value={Math.round(((o.sx + o.sy) / 2) * 100)} step={5} precision={0} min={1} onChange={(v) => up((a) => { const k = v / 100 / ((a.sx + a.sy) / 2); return { ...a, sx: a.sx * k, sy: a.sy * k }; }, 'scale')} />
        </div>
        <div className="row" style={{ marginTop: 8, gap: 4 }}>
          <button className={`btn small${o.flipX ? ' active' : ''}`} onClick={() => up((a) => ({ ...a, flipX: !a.flipX }), 'flip')}><FlipHorizontal2 size={13} /> Flip H</button>
          <button className={`btn small${o.flipY ? ' active' : ''}`} onClick={() => up((a) => ({ ...a, flipY: !a.flipY }), 'flip')}><FlipVertical2 size={13} /> Flip V</button>
          <button className="btn small" onClick={() => up((a) => ({ ...a, sx: ed.doc.assetScale, sy: ed.doc.assetScale, rotation: 0 }), 'reset transform')}>Reset</button>
        </div>
      </Section>
      <Section title="Appearance">
        <Slider label="Opacity" value={o.opacity} min={0} max={1} step={0.01} onChange={(v) => up((a) => ({ ...a, opacity: v }), 'opacity')} />
        <Slider label="Shadow" value={o.shadow} min={0} max={1} step={0.01} onChange={(v) => up((a) => ({ ...a, shadow: v }), 'shadow')} />
        <Slider label="Blur" value={o.blur} min={0} max={12} step={0.1} onChange={(v) => up((a) => ({ ...a, blur: v }), 'blur')} />
      </Section>
      <Section title="Colour" right={<button className="btn small ghost" onClick={() => up((a) => ({ ...a, hue: 0, saturation: 0, brightness: 0, contrast: 0, temperature: 0, tint: null, tintAmount: 0 }), 'colour')}>Reset</button>}>
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="label grow">Tint</span>
          <ColorInput value={o.tint ?? '#ffffff'} onChange={(v) => up((a) => ({ ...a, tint: v, tintAmount: a.tintAmount || 0.5 }), 'tint')} />
        </div>
        <Slider label="Tint amount" value={o.tintAmount ?? 0} min={0} max={1} step={0.01} onChange={(v) => up((a) => ({ ...a, tintAmount: v, tint: a.tint ?? '#ffffff' }), 'tint')} />
        <Slider label="Hue" value={o.hue ?? 0} min={-180} max={180} step={1} precision={0} onChange={(v) => up((a) => ({ ...a, hue: v }), 'hue')} />
        <Slider label="Saturation" value={o.saturation ?? 0} min={-1} max={1} step={0.01} onChange={(v) => up((a) => ({ ...a, saturation: v }), 'saturation')} />
        <Slider label="Brightness" value={o.brightness ?? 0} min={-1} max={1} step={0.01} onChange={(v) => up((a) => ({ ...a, brightness: v }), 'brightness')} />
        <Slider label="Contrast" value={o.contrast ?? 0} min={-1} max={1} step={0.01} onChange={(v) => up((a) => ({ ...a, contrast: v }), 'contrast')} />
        <Slider label="Temperature" value={o.temperature ?? 0} min={-1} max={1} step={0.01} onChange={(v) => up((a) => ({ ...a, temperature: v }), 'temperature')} />
        <div className="chips" style={{ marginTop: 4 }}>
          {[
            ['Summer', { hue: 0, saturation: 0.15, brightness: 0.03, temperature: 0.1 }],
            ['Winter', { hue: -10, saturation: -0.5, brightness: 0.12, temperature: -0.5 }],
            ['Dead', { hue: 25, saturation: -0.55, brightness: -0.05, temperature: 0.3 }],
            ['Moonlit', { hue: 0, saturation: -0.35, brightness: -0.2, temperature: -0.8 }],
            ['Magical', { hue: 120, saturation: 0.4, brightness: 0.05, temperature: -0.2 }],
          ].map(([name, p]) => (
            <button key={name as string} className="chip" onClick={() => up((a) => ({ ...a, contrast: 0, tint: null, tintAmount: 0, ...(p as object) }), 'colour')}>{name as string}</button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 6 }}>Colour changes are stored on the object — the source art is never modified.</p>
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ text

function TextProps({ objs, update }: { objs: TextObject[]; update: Upd }) {
  const t = objs[0];
  const up = (fn: (a: TextObject) => TextObject, label: string) => update<TextObject>(fn, label);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const focus = () => {
      if (!textFocus.pending) return;
      textFocus.pending = false;
      ref.current?.focus();
      ref.current?.select();
    };
    return focusTextEvents.subscribe(focus);
  }, []);
  return (
    <>
      <Section title="Text">
        <textarea ref={ref} className="input" rows={2} style={{ width: '100%' }} value={t.text}
          onChange={(e) => up((a) => ({ ...a, text: e.target.value }), 'text')} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') e.currentTarget.blur(); }} />
        <div className="field" style={{ marginTop: 8 }}>
          <label>Font</label>
          <select className="select" value={t.font} onChange={(e) => up((a) => ({ ...a, font: e.target.value }), 'font')} style={{ fontFamily: t.font }}>
            {FONTS.map((f) => <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>{f.label}</option>)}
          </select>
        </div>
        <div className="prop-grid">
          <Prop label="pt" value={t.size} min={2} max={2000} onChange={(v) => up((a) => ({ ...a, size: v }), 'size')} />
          <Prop label="↻" value={t.rotation} onChange={(v) => up((a) => ({ ...a, rotation: v }), 'rotation')} />
        </div>
        <div className="row wrap" style={{ marginTop: 8, gap: 4 }}>
          <button className={`btn small${t.weight >= 600 ? ' active' : ''}`} onClick={() => up((a) => ({ ...a, weight: a.weight >= 600 ? 400 : 700 }), 'weight')}><b>B</b></button>
          <button className={`btn small${t.italic ? ' active' : ''}`} onClick={() => up((a) => ({ ...a, italic: !a.italic }), 'italic')}><i>I</i></button>
          <button className={`btn small${t.uppercase ? ' active' : ''}`} onClick={() => up((a) => ({ ...a, uppercase: !a.uppercase }), 'case')}>AA</button>
          <Seg value={t.align} onChange={(v) => up((a) => ({ ...a, align: v }), 'alignment')} options={[{ value: 'left', label: 'L' }, { value: 'center', label: 'C' }, { value: 'right', label: 'R' }]} />
        </div>
      </Section>
      <Section title="Layout">
        <Slider label="Letter spacing" value={t.letterSpacing} min={-0.1} max={1.5} step={0.01} onChange={(v) => up((a) => ({ ...a, letterSpacing: v }), 'letter spacing')} />
        <Slider label="Line spacing" value={t.lineHeight} min={0.6} max={3} step={0.01} onChange={(v) => up((a) => ({ ...a, lineHeight: v }), 'line spacing')} />
        <Slider label="Curve" value={t.curve} min={-1} max={1} step={0.01} onChange={(v) => up((a) => ({ ...a, curve: v }), 'curve')} tip="Bend the label along an arc" />
      </Section>
      <Section title="Style">
        <div className="row between" style={{ marginBottom: 8 }}><span className="label">Colour</span><ColorInput value={t.color} onChange={(v) => up((a) => ({ ...a, color: v }), 'colour')} /></div>
        <Slider label="Opacity" value={t.opacity} min={0} max={1} step={0.01} onChange={(v) => up((a) => ({ ...a, opacity: v }), 'opacity')} />
        <div className="row between" style={{ marginBottom: 8 }}><span className="label">Outline</span><ColorInput value={t.outlineColor} onChange={(v) => up((a) => ({ ...a, outlineColor: v }), 'outline')} /></div>
        <Slider label="Outline width" value={t.outline} min={0} max={Math.max(20, t.size * 0.3)} step={0.1} onChange={(v) => up((a) => ({ ...a, outline: v }), 'outline')} />
        <div className="row between" style={{ marginBottom: 8 }}><span className="label">Shadow</span><ColorInput value={toHex(t.shadowColor)} onChange={(v) => up((a) => ({ ...a, shadowColor: v }), 'shadow')} /></div>
        <Slider label="Shadow blur" value={t.shadow} min={0} max={40} step={0.5} onChange={(v) => up((a) => ({ ...a, shadow: v }), 'shadow')} />
      </Section>
    </>
  );
}

function toHex(c: string) {
  return c.startsWith('#') ? c : '#000000';
}

// ------------------------------------------------------------------ paths

const DETAIL_LABELS: Record<string, string> = {
  reeds: 'Reeds', rocks: 'Rocks', rapids: 'Rapids', islands: 'Small islands', banks: 'Shore blending', ruts: 'Wagon ruts',
  grass: 'Grass intrusion', stones: 'Stones', mud: 'Mud variation', wear: 'Edge wear', towers: 'Towers at corners',
};

function PathProps({ ed, objs, update }: { ed: Editor; objs: PathObject[]; update: Upd }) {
  const p = objs[0];
  const up = (fn: (a: PathObject) => PathObject, label: string) => update<PathObject>(fn, label);
  const presets = PATH_PRESETS.filter((x) => x.profile === p.profile || (['road', 'trail'].includes(x.profile) && ['road', 'trail'].includes(p.profile)) || (['river', 'stream'].includes(x.profile) && ['river', 'stream'].includes(p.profile)));
  const detailKeys = Object.keys(DETAIL_LABELS).filter((k) => k in p.details);
  return (
    <>
      <Section title="Path">
        <div className="field">
          <label>Style</label>
          <select className="select" value={presets.find((x) => x.profile === p.profile && x.style === p.style)?.id ?? ''} onChange={(e) => {
            const pr = PATH_PRESETS.find((x) => x.id === e.target.value);
            if (pr) up((a) => ({ ...a, profile: pr.profile, style: pr.style, color: pr.color, details: { ...pr.details, ...a.details } }), 'path style');
          }}>
            {presets.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </div>
        <Slider label="Width" value={p.width} min={0.5} max={Math.max(400, p.width * 2)} step={0.5} onChange={(v) => up((a) => ({ ...a, width: v }), 'width')} />
        <div className="row between" style={{ marginBottom: 8 }}><span className="label">Colour</span><ColorInput value={p.color} onChange={(v) => up((a) => ({ ...a, color: v }), 'colour')} /></div>
        <Slider label="Opacity" value={p.opacity} min={0} max={1} step={0.01} onChange={(v) => up((a) => ({ ...a, opacity: v }), 'opacity')} />
        <Slider label="Texture scale" value={p.textureScale} min={0.2} max={4} step={0.05} onChange={(v) => up((a) => ({ ...a, textureScale: v }), 'texture')} />
      </Section>
      <Section title="Shape">
        <Slider label="Smoothing" value={p.smoothing} min={0} max={1} step={0.01} onChange={(v) => up((a) => ({ ...a, smoothing: v }), 'smoothing')} />
        <Slider label="Meander" value={p.meander} min={0} max={1} step={0.01} onChange={(v) => up((a) => ({ ...a, meander: v }), 'meander')} />
        <Slider label="Edge roughness" value={p.roughness} min={0} max={1} step={0.01} onChange={(v) => up((a) => ({ ...a, roughness: v }), 'roughness')} />
        <Slider label="Width variation" value={p.widthVariation} min={0} max={1} step={0.01} onChange={(v) => up((a) => ({ ...a, widthVariation: v }), 'width variation')} />
        <Slider label="Tapering" value={p.taper} min={0} max={1} step={0.01} onChange={(v) => up((a) => ({ ...a, taper: v }), 'taper')} tip="Narrow at the start (source), wider downstream" />
        <Slider label="Shadow" value={p.shadow} min={0} max={1} step={0.01} onChange={(v) => up((a) => ({ ...a, shadow: v }), 'shadow')} />
        <div className="row wrap" style={{ gap: 4 }}>
          <Check label="Closed loop" checked={p.closed} onChange={(v) => up((a) => ({ ...a, closed: v }), 'closed')} />
          <button className="btn small" onClick={() => up((a) => ({ ...a, points: [...a.points].reverse() }), 'direction')} {...tipProps('Reverse direction (swaps which end is the narrow source)')}><Repeat size={13} /> Reverse</button>
          <button className="btn small" onClick={() => up((a) => ({ ...a, seed: ed.newSeed() }), 'variation')} {...tipProps('New random variation')}><Dice5 size={13} /> Vary</button>
        </div>
      </Section>
      {detailKeys.length > 0 && (
        <Section title="Details">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
            {detailKeys.map((k) => (
              <Check key={k} label={DETAIL_LABELS[k]} checked={!!p.details[k]} onChange={(v) => up((a) => ({ ...a, details: { ...a.details, [k]: v } }), 'details')} />
            ))}
          </div>
        </Section>
      )}
      <Section title="Editing">
        <p className="hint">Drag the control points on the canvas. Alt-click or double-click the path to add a point; double-click a point to delete it. {p.points.length} points.</p>
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ lights & effects

function LightProps({ objs, update }: { objs: LightObject[]; update: Upd }) {
  const l = objs[0];
  const up = (fn: (a: LightObject) => LightObject, label: string) => update<LightObject>(fn, label);
  return (
    <Section title="Light">
      <div className="field">
        <label>Type</label>
        <select className="select" value={l.kind} onChange={(e) => { const k = e.target.value as LightKind; const p = LIGHT_PRESETS[k]; up((a) => ({ ...a, kind: k, color: p.color, falloff: p.falloff, intensity: p.intensity }), 'light type'); }}>
          {(Object.keys(LIGHT_PRESETS) as LightKind[]).map((k) => <option key={k} value={k}>{LIGHT_PRESETS[k].label}</option>)}
        </select>
      </div>
      {objs.length === 1 && (
        <div className="prop-grid" style={{ marginBottom: 8 }}>
          <Prop label="X" value={l.x} onChange={(v) => up((a) => ({ ...a, x: v }), 'position')} />
          <Prop label="Y" value={l.y} onChange={(v) => up((a) => ({ ...a, y: v }), 'position')} />
        </div>
      )}
      <Slider label="Radius" value={l.radius} min={4} max={Math.max(1500, l.radius * 1.5)} step={1} precision={0} onChange={(v) => up((a) => ({ ...a, radius: v }), 'radius')} />
      <Slider label="Intensity" value={l.intensity} min={0} max={2.5} step={0.01} onChange={(v) => up((a) => ({ ...a, intensity: v }), 'intensity')} />
      <div className="row between" style={{ marginBottom: 8 }}><span className="label">Colour</span><ColorInput value={l.color} onChange={(v) => up((a) => ({ ...a, color: v }), 'colour')} /></div>
      <Slider label="Falloff" value={l.falloff} min={0} max={1} step={0.01} onChange={(v) => up((a) => ({ ...a, falloff: v }), 'falloff')} />
      <Slider label="Shadow strength" value={l.shadowStrength} min={0} max={1} step={0.01} onChange={(v) => up((a) => ({ ...a, shadowStrength: v }), 'shadow strength')} tip="Objects with shadows near this light cast shadows away from it" />
    </Section>
  );
}

function EffectProps({ ed, objs, update }: { ed: Editor; objs: EffectObject[]; update: Upd }) {
  const e = objs[0];
  const up = (fn: (a: EffectObject) => EffectObject, label: string) => update<EffectObject>(fn, label);
  return (
    <Section title="Effect">
      <Slider label="Intensity" value={e.intensity} min={0} max={1} step={0.01} onChange={(v) => up((a) => ({ ...a, intensity: v }), 'intensity')} />
      <Slider label="Scale" value={e.scale} min={0.1} max={4} step={0.01} onChange={(v) => up((a) => ({ ...a, scale: v }), 'scale')} />
      <Slider label="Direction (°)" value={e.angle} min={-180} max={180} step={1} precision={0} onChange={(v) => up((a) => ({ ...a, angle: v }), 'direction')} />
      <div className="row between" style={{ marginBottom: 8 }}><span className="label">Colour</span><ColorInput value={e.color} onChange={(v) => up((a) => ({ ...a, color: v }), 'colour')} /></div>
      <div className="row" style={{ gap: 4 }}>
        <button className="btn small" onClick={() => up((a) => ({ ...a, seed: ed.newSeed() % 1000 }), 'variation')}><Dice5 size={13} /> Vary</button>
        {e.region && <button className="btn small" onClick={() => up((a) => ({ ...a, region: null }), 'region')}>Apply to whole map</button>}
      </div>
      <p className="hint" style={{ marginTop: 6 }}>{e.region ? 'Regional effect — drag it with the Select tool.' : 'Covers the whole map.'} Effects live on their own layer.</p>
    </Section>
  );
}
