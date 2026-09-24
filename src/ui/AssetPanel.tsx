import { useMemo, useRef, useState } from 'react';
import { Check as CheckIcon, Dice5, RefreshCw, Save, Search, Star, Trash2, Upload, X } from 'lucide-react';
import type { Editor } from '../editor/editor';
import { library } from '../editor/library';
import { allAssets, getAsset, getThumbnail, type AssetDef } from '../engine/assets/registry';
import type { CollectionItem, ScatterRules, ScatterSettings } from '../engine/collections';
import { uid } from '../core/ids';
import { activeScatterItems, reapplyLastScatter } from '../tools/assetTool';
import { Check, IconButton, NumberInput, Section, Seg, Slider, tipProps, useEmitter } from './controls';
import { toast } from './toast';

type PackFilter = 'atlas' | 'topdown' | 'all';

const RULES: { key: keyof ScatterRules; label: string; tip: string }[] = [
  { key: 'collisions', label: 'Collisions', tip: 'Prevent trees overlapping buildings and buildings overlapping each other (some natural overlap remains)' },
  { key: 'avoidWater', label: 'Avoid water', tip: 'Keep off water / void and out of rivers' },
  { key: 'avoidRoads', label: 'Avoid roads', tip: 'Keep off roads and trails' },
  { key: 'avoidBuildings', label: 'Avoid buildings', tip: 'Trees keep clear of buildings' },
  { key: 'cluster', label: 'Cluster naturally', tip: 'Noise-driven groves and gaps instead of even coverage' },
  { key: 'thinEdges', label: 'Thin edges', tip: 'Sparser at the edge of the brush — soft forest borders' },
  { key: 'preferShore', label: 'Prefer shorelines', tip: 'Place along coasts and river banks (reeds, rocks)' },
  { key: 'alignRoads', label: 'Align to roads', tip: 'Buildings line up alongside nearby roads, facing them' },
  { key: 'nearMountains', label: 'Near mountains', tip: 'Favour spots near mountains, cliffs and rocks' },
];

export function AssetPanel({ editor: ed }: { editor: Editor }) {
  useEmitter(library.events);
  const s = ed.settings.asset;
  const set = (p: Partial<typeof s>) => ed.updateSettings('asset', p);
  const setScatter = (p: Partial<ScatterSettings>) => ed.updateSettings('asset', { scatter: { ...ed.settings.asset.scatter, ...p } });
  const [pack, setPack] = useState<PackFilter>(ed.doc.assetPack);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string>('All');
  const [collName, setCollName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState('My Assets');

  const assets = useMemo(() => allAssets().filter((a) => pack === 'all' || a.pack === pack || a.custom), [pack, library.version]);
  const categories = useMemo(() => ['All', 'Favorites', 'Recent', ...new Set(assets.map((a) => a.category))], [assets]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = assets;
    if (cat === 'Favorites') list = list.filter((a) => library.favorites.has(a.id));
    else if (cat === 'Recent') list = library.recent.map((id) => getAsset(id)).filter((a): a is AssetDef => !!a);
    else if (cat !== 'All') list = list.filter((a) => a.category === cat);
    if (q) list = list.filter((a) => `${a.name} ${a.category} ${a.subcategory} ${a.tags.join(' ')} ${a.style ?? ''}`.toLowerCase().includes(q));
    return list;
  }, [assets, cat, query, library.version]);
  const grouped = useMemo(() => {
    const m = new Map<string, AssetDef[]>();
    for (const a of filtered.slice(0, 600)) {
      const k = cat === 'All' || cat === 'Favorites' || cat === 'Recent' ? `${a.category} · ${a.subcategory}` : a.subcategory || a.category;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return [...m.entries()];
  }, [filtered, cat]);

  const items = activeScatterItems(ed);
  const itemSet = new Set(items.map((i) => i.assetId));
  const total = items.reduce((a, i) => a + i.weight, 0) || 1;
  const collections = library.collections(ed.doc.assetPack);
  const current = library.getCollection(s.collectionId);

  const clickAsset = (a: AssetDef, e: React.MouseEvent) => {
    if (s.mode === 'place' && !e.shiftKey) {
      set({ assetId: a.id });
      library.touchRecent(a.id);
      return;
    }
    // scatter / erase: build a custom weighted set
    const base: CollectionItem[] = s.collectionId ? items.map((i) => ({ ...i })) : [...s.items];
    const next = base.some((i) => i.assetId === a.id) ? base.filter((i) => i.assetId !== a.id) : [...base, { assetId: a.id, weight: 20 }];
    set({ collectionId: null, items: next, mode: s.mode === 'place' ? 'scatter' : s.mode });
  };
  const setWeight = (id: string, w: number) => {
    const base = s.collectionId ? items.map((i) => ({ ...i })) : [...s.items];
    set({ collectionId: null, items: base.map((i) => (i.assetId === id ? { ...i, weight: w } : i)) });
  };
  const saveCollection = async () => {
    const name = collName.trim();
    if (!name || !items.length) return;
    const c = { id: uid('c'), name, pack: ed.doc.assetPack, items: items.map((i) => ({ ...i })), settings: { size: s.scatter.size, density: s.scatter.density, spacing: s.scatter.spacing, rules: { ...s.scatter.rules } } };
    await library.saveCollection(c);
    set({ collectionId: c.id, items: [] });
    setCollName('');
    toast(`Saved collection “${name}”`);
  };
  const pickCollection = (id: string) => {
    const c = library.getCollection(id);
    if (!c) return;
    const base = ed.settings.asset.scatter;
    const sz = c.settings?.size !== undefined ? c.settings.size * (ed.doc.assetPack === 'atlas' ? ed.doc.assetScale : 1) : base.size;
    set({ collectionId: id, mode: s.mode === 'erase' ? 'erase' : 'scatter', scatter: { ...base, ...(c.settings ?? {}), size: sz, rules: { ...base.rules, ...(c.settings?.rules ?? {}) }, seed: base.seed } });
  };
  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const size = ed.doc.assetPack === 'atlas' ? 40 * ed.doc.assetScale : 140;
      const ids = await library.importFiles([...files], folder, size);
      setCat('Imported');
      if (ids.length === 1) set({ assetId: ids[0], mode: 'place' });
      toast(`Imported ${ids.length} asset${ids.length > 1 ? 's' : ''}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  return (
    <>
      <Section title="Mode">
        <Seg full value={s.mode} onChange={(v) => set({ mode: v })} options={[
          { value: 'place', label: 'Place', tip: 'Click to place the selected asset repeatedly (Esc to stop)' },
          { value: 'scatter', label: 'Scatter brush', tip: 'Paint many assets at once — forests, rocks, villages' },
          { value: 'erase', label: 'Erase', tip: 'Brush away scattered assets from the current set (Shift: any asset)' },
        ]} />
      </Section>

      {s.mode !== 'place' && (
        <Section title="Collections">
          <div className="coll-list">
            {collections.map((c) => (
              <button key={c.id} className={`coll-item${s.collectionId === c.id ? ' on' : ''}`} onClick={() => pickCollection(c.id)}>
                <span className="thumbs">{c.items.slice(0, 4).map((i) => { const d = getAsset(i.assetId); return d ? <img key={i.assetId} src={getThumbnail(d, 44)} alt="" /> : null; })}</span>
                <span style={{ marginLeft: 8 }}>{c.name}</span>
                {!c.builtIn && <span className="grow" />}
                {!c.builtIn && <IconButton small icon={<Trash2 size={12} />} tip="Delete collection" onClick={() => void library.deleteCollection(c.id)} />}
              </button>
            ))}
            <button className={`coll-item${!s.collectionId ? ' on' : ''}`} onClick={() => set({ collectionId: null })}>
              <span>Custom selection {s.items.length ? `(${s.items.length})` : '— Shift-click assets below'}</span>
            </button>
          </div>
        </Section>
      )}

      {s.mode !== 'place' && items.length > 0 && (
        <Section title={`${current?.name ?? 'Custom set'} · weights`}>
          <div className="weights">
            {items.map((i) => {
              const d = getAsset(i.assetId);
              if (!d) return null;
              return (
                <div className="wrow" key={i.assetId}>
                  <img src={getThumbnail(d, 52)} alt="" />
                  <input type="range" min={0} max={100} value={i.weight} onChange={(e) => setWeight(i.assetId, +e.target.value)} {...tipProps(`${d.name}: relative frequency`)} />
                  <span className="nm">{d.name}</span>
                  <span className="pct">{Math.round((i.weight / total) * 100)}%</span>
                </div>
              );
            })}
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <input className="input grow" placeholder="Save as collection…" value={collName} onChange={(e) => setCollName(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') void saveCollection(); }} />
            <IconButton icon={<Save size={15} />} tip="Save this weighted set as a reusable collection" disabled={!collName.trim()} onClick={() => void saveCollection()} />
          </div>
        </Section>
      )}

      {s.mode !== 'place' && (
        <Section title="Scatter brush">
          <Slider label="Brush size" value={s.scatter.size} min={5} max={2000} step={1} precision={0} onChange={(v) => setScatter({ size: v })} tip="[ and ] change size" />
          <Slider label="Density" value={s.scatter.density} min={0.02} max={1} step={0.01} onChange={(v) => setScatter({ density: v })} />
          <Slider label="Spacing" value={s.scatter.spacing} min={0.1} max={2.5} step={0.01} onChange={(v) => setScatter({ spacing: v })} tip="Minimum distance between items, relative to their size" />
          <Slider label="Scatter" value={s.scatter.scatter} min={0} max={1} step={0.01} onChange={(v) => setScatter({ scatter: v })} />
          <div className="form-grid">
            <Slider label="Min scale" value={s.scatter.minScale} min={0.1} max={3} step={0.01} onChange={(v) => setScatter({ minScale: Math.min(v, s.scatter.maxScale) })} />
            <Slider label="Max scale" value={s.scatter.maxScale} min={0.1} max={3} step={0.01} onChange={(v) => setScatter({ maxScale: Math.max(v, s.scatter.minScale) })} />
          </div>
          <Slider label="Rotation variation (°)" value={s.scatter.rotation} min={0} max={180} step={1} precision={0} onChange={(v) => setScatter({ rotation: v })} />
          <Slider label="Edge falloff" value={s.scatter.edgeFalloff} min={0} max={1} step={0.01} onChange={(v) => setScatter({ edgeFalloff: v })} />
          <Slider label="Colour variation" value={s.scatter.colorVariation} min={0} max={1} step={0.01} onChange={(v) => setScatter({ colorVariation: v })} />
          <Check label="Random flips" checked={s.scatter.flip} onChange={(v) => setScatter({ flip: v })} />
          <div className="label" style={{ margin: '10px 0 6px' }}>Smart scatter rules</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
            {RULES.map((r) => (
              <Check key={r.key} label={r.label} tip={r.tip} checked={s.scatter.rules[r.key]} onChange={(v) => setScatter({ rules: { ...s.scatter.rules, [r.key]: v } })} />
            ))}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="label">Seed</span>
            <NumberInput value={s.scatter.seed} min={0} max={999999} precision={0} onChange={(v) => setScatter({ seed: Math.round(v) })} />
            <IconButton icon={<Dice5 size={15} />} tip="Randomize seed" onClick={() => setScatter({ seed: Math.floor(Math.random() * 900000) + 100000 })} />
            <button className="btn small" onClick={() => { if (!reapplyLastScatter(ed)) toast('Paint a scatter stroke first — Apply re-runs your last stroke with the current seed & settings.'); }} {...tipProps('Re-run the last scatter stroke with the current seed and settings')}>
              <RefreshCw size={13} /> Apply
            </button>
          </div>
          <p className="hint" style={{ marginTop: 6 }}>Same seed + settings + stroke = same result. Each stroke is a single undo step.</p>
        </Section>
      )}

      {s.mode === 'place' && (
        <Section title="Placement">
          <Slider label="Random rotation (°)" value={s.randomRotation} min={0} max={180} step={1} precision={0} onChange={(v) => set({ randomRotation: v })} />
          <Slider label="Random scale" value={s.randomScale} min={0} max={0.6} step={0.01} onChange={(v) => set({ randomScale: v })} />
          <Slider label="Drop shadow" value={s.shadow} min={0} max={1} step={0.01} onChange={(v) => set({ shadow: v })} />
          <Check label="Auto layer by type" checked={s.autoLayer} onChange={(v) => set({ autoLayer: v })} tip="Trees go to Vegetation, buildings to Buildings… (off: use the active layer)" />
        </Section>
      )}
      {s.mode !== 'place' && (
        <Section title="Placement">
          <Slider label="Drop shadow" value={s.shadow} min={0} max={1} step={0.01} onChange={(v) => set({ shadow: v })} />
          <Check label="Auto layer by type" checked={s.autoLayer} onChange={(v) => set({ autoLayer: v })} />
        </Section>
      )}

      <Section title="Asset library" right={<span className="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>{filtered.length}</span>}>
        <div className="row" style={{ marginBottom: 8 }}>
          <div className="row grow" style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 8, color: 'var(--text-3)' }} />
            <input className="input grow" style={{ paddingLeft: 26 }} placeholder="Search assets…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
            {query && <button className="icon-btn sm" style={{ position: 'absolute', right: 2 }} onClick={() => setQuery('')} aria-label="Clear"><X size={12} /></button>}
          </div>
        </div>
        <div className="field">
          <Seg full value={pack} onChange={(v) => setPack(v)} options={[{ value: 'atlas', label: 'Atlas' }, { value: 'topdown', label: 'Top-down' }, { value: 'all', label: 'All' }]} />
        </div>
        <div className="cat-list">
          {categories.map((c) => <button key={c} className={`chip${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        {s.mode === 'place' && <p className="hint">Click an asset to attach it to the cursor. Shift-click adds assets to a scatter set.</p>}
        {grouped.map(([group, list]) => (
          <div key={group}>
            <div className="subcat">{group}</div>
            <div className="asset-grid">
              {list.map((a) => {
                const on = s.mode === 'place' ? s.assetId === a.id : itemSet.has(a.id);
                return (
                  <div key={a.id} className={`asset-tile${on ? ' on' : ''}`} onClick={(e) => clickAsset(a, e)} {...tipProps(`${a.name}${a.style ? ` · ${a.style}` : ''}`)}>
                    <img src={getThumbnail(a)} alt={a.name} loading="lazy" draggable={false} />
                    {s.mode !== 'place' && on && <span className="check-mark"><CheckIcon size={11} /></span>}
                    <button className={`fav${library.favorites.has(a.id) ? ' on' : ''}`} onClick={(e) => { e.stopPropagation(); library.toggleFavorite(a.id); }} aria-label="Favourite">
                      <Star size={12} fill={library.favorites.has(a.id) ? 'currentColor' : 'none'} />
                    </button>
                    {a.custom && cat === 'Imported' && (
                      <button className="fav" style={{ left: 2, right: 'auto', opacity: 1 }} onClick={(e) => { e.stopPropagation(); void library.deleteCustom(a.id); }} aria-label="Delete imported asset">
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {!filtered.length && <p className="hint">No assets match.</p>}
      </Section>

      <Section title="Import your own">
        <div className="row" style={{ marginBottom: 6 }}>
          <input className="input grow" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Folder" onKeyDown={(e) => e.stopPropagation()} {...tipProps('Imported assets are organised into folders')} />
          <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={14} /> Upload</button>
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/webp,image/jpeg" multiple hidden onChange={(e) => { void importFiles(e.target.files); e.target.value = ''; }} />
        <p className="hint">PNG, WebP or JPEG — transparent PNG/WebP work best. Imported assets support placement, transforms, tinting, layers, scatter brushes and collections. They are stored in this browser.</p>
      </Section>
    </>
  );
}
