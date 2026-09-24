import type { Editor } from '../editor/editor';
import { MAP_TYPES, THEMES } from '../model/defaults';
import type { CoastStyle, GridSettings, MapType, TerrainTheme } from '../model/types';
import { TEXTURES } from '../engine/textures';
import { Check, ColorInput, Section, Seg, Slider } from './controls';

export function MapSettingsPanel({ editor: ed }: { editor: Editor }) {
  const t = ed.doc.theme;
  const setTheme = (patch: Partial<TerrainTheme>, label = 'Adjust map style') => ed.setKey('theme', { ...ed.doc.theme, ...patch }, label);
  const texOpts = TEXTURES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>);
  return (
    <>
      <Section title="Map">
        <div className="field">
          <label>Map type</label>
          <select className="select" value={ed.doc.mapType} onChange={(e) => ed.setKey('mapType', e.target.value as MapType, 'Change map type')}>
            {MAP_TYPES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Asset library default</label>
          <Seg full value={ed.doc.assetPack} onChange={(v) => ed.setKey('assetPack', v, 'Change asset pack')} options={[
            { value: 'atlas', label: 'Atlas icons', tip: 'Illustrated icons for world & regional maps' },
            { value: 'topdown', label: 'Top-down', tip: 'Top-down art for battlemaps, towns, camps, dungeons' },
          ]} />
        </div>
        <Slider label="Default asset scale" value={ed.doc.assetScale} min={0.1} max={4} step={0.05} onChange={(v) => ed.setKey('assetScale', v, 'Adjust asset scale')}
          tip="Scale applied to newly placed assets and brushes" />
        <p className="hint">Canvas: {ed.doc.width} × {ed.doc.height}px · seed {ed.doc.seed}</p>
      </Section>
      <Section title="Style preset">
        <div className="field">
          <select className="select" value="" onChange={(e) => { const th = THEMES[e.target.value]; if (th) setTheme({ ...th }, 'Apply style preset'); }}>
            <option value="" disabled>Apply a preset… (current: {t.name})</option>
            {Object.entries(THEMES).map(([id, th]) => <option key={id} value={id}>{th.name}</option>)}
          </select>
        </div>
      </Section>
      <Section title="Land & water">
        <div className="form-grid">
          <div className="field"><label>Water texture</label><select className="select" value={t.waterTexture} onChange={(e) => setTheme({ waterTexture: e.target.value })}>{texOpts}</select></div>
          <div className="field"><label>Land texture</label><select className="select" value={t.landTexture} onChange={(e) => setTheme({ landTexture: e.target.value })}>{texOpts}</select></div>
        </div>
        <Slider label="Texture scale" value={t.textureScale} min={0.25} max={4} step={0.05} onChange={(v) => setTheme({ textureScale: v })} />
        <div className="field">
          <label>Coast style</label>
          <select className="select" value={t.coastStyle} onChange={(e) => setTheme({ coastStyle: e.target.value as CoastStyle })}>
            <option value="painted">Painted (ink outline + glow)</option>
            <option value="ink">Ink atlas (outline + ripples)</option>
            <option value="soft">Soft shoreline</option>
            <option value="cave">Cave walls</option>
            <option value="dungeon">Dungeon walls (hatched)</option>
            <option value="none">None</option>
          </select>
        </div>
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="label grow">Outline</span>
          <ColorInput value={t.outlineColor} onChange={(v) => setTheme({ outlineColor: v })} />
        </div>
        <Slider label="Outline width" value={t.outlineWidth} min={0} max={20} step={0.1} onChange={(v) => setTheme({ outlineWidth: v })} />
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="label grow">Coast glow / shadow</span>
          <ColorInput value={t.glowColor} onChange={(v) => setTheme({ glowColor: v })} />
        </div>
        <Slider label="Glow width" value={t.glowWidth} min={0} max={120} step={1} onChange={(v) => setTheme({ glowWidth: v })} />
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="label grow">Ripple lines</span>
          <ColorInput value={t.rippleColor} onChange={(v) => setTheme({ rippleColor: v })} />
        </div>
        <Slider label="Ripples" value={t.ripples} min={0} max={6} step={1} precision={0} onChange={(v) => setTheme({ ripples: Math.round(v) })} />
        <div className="field"><label>Shore texture</label>
          <select className="select" value={t.shoreTexture ?? ''} onChange={(e) => setTheme({ shoreTexture: e.target.value || null })}>
            <option value="">None</option>{texOpts}
          </select>
        </div>
        {t.shoreTexture && <Slider label="Shore width" value={t.shoreWidth} min={0} max={120} step={1} onChange={(v) => setTheme({ shoreWidth: v })} />}
        <Slider label="Inner coast shading" value={t.innerShade} min={0} max={1} step={0.01} onChange={(v) => setTheme({ innerShade: v })} />
      </Section>
    </>
  );
}

export function GridSettingsPanel({ editor: ed }: { editor: Editor }) {
  const g = ed.doc.grid;
  const set = (patch: Partial<GridSettings>, label = 'Adjust grid') => ed.setKey('grid', { ...ed.doc.grid, ...patch }, label);
  return (
    <Section title="Grid">
      <div className="field">
        <Seg full value={g.type} onChange={(v) => set({ type: v }, 'Change grid type')} options={[
          { value: 'none', label: 'None' }, { value: 'square', label: 'Square' }, { value: 'hex', label: 'Hex' },
        ]} />
      </div>
      {g.type !== 'none' && (
        <>
          <Slider label="Cell size" value={g.size} min={8} max={400} step={1} precision={0} onChange={(v) => set({ size: v })} />
          <Slider label="Opacity" value={g.opacity} min={0} max={1} step={0.01} onChange={(v) => set({ opacity: v })} />
          <Slider label="Thickness" value={g.thickness} min={0.25} max={8} step={0.25} onChange={(v) => set({ thickness: v })} />
          <Slider label="Offset X" value={g.offsetX} min={-g.size} max={g.size} step={1} precision={0} onChange={(v) => set({ offsetX: v })} />
          <Slider label="Offset Y" value={g.offsetY} min={-g.size} max={g.size} step={1} precision={0} onChange={(v) => set({ offsetY: v })} />
          <div className="row between" style={{ marginBottom: 8 }}>
            <span className="label">Colour</span>
            <ColorInput value={g.color} onChange={(v) => set({ color: v })} />
          </div>
        </>
      )}
      <Check label="Snap to grid" checked={ed.settings.snap} onChange={(v) => ed.updateSettings('snap', v)} tip="Snap placement, moves and path points to the grid" />
      <p className="hint" style={{ marginTop: 8 }}>The grid is its own layer — reorder or hide it in the Layers panel. It is never forced onto world or regional maps.</p>
    </Section>
  );
}
