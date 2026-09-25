import { useState } from 'react';
import {
  ChevronDown, ChevronRight, CloudFog, Copy, Eye, EyeOff, Folder, FolderPlus, Grid3x3, Layers as LayersIcon, Lightbulb, Lock, LockOpen,
  Mountain, Paintbrush, Plus, Shapes, Trash2, ArrowUp, ArrowDown, Image as ImageIcon,
} from 'lucide-react';
import { panelOrder, type Editor } from '../editor/editor';
import type { Layer, LayerKind } from '../model/types';
import { IconButton, Slider, tipProps, usePopover } from './controls';

const KIND_ICON: Record<LayerKind, React.ReactNode> = {
  terrain: <Mountain size={13} />, paint: <Paintbrush size={13} />, objects: <Shapes size={13} />, grid: <Grid3x3 size={13} />,
  effects: <CloudFog size={13} />, lighting: <Lightbulb size={13} />, folder: <Folder size={13} />, reference: <ImageIcon size={13} />,
};

export function LayersPanel({ editor: ed }: { editor: Editor }) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; over: string | null; where: 'above' | 'below' | 'into' } | null>(null);
  const addPop = usePopover();
  const order = panelOrder(ed.doc.layers);
  const counts = new Map<string, number>();
  for (const o of Object.values(ed.doc.objects)) counts.set(o.layerId, (counts.get(o.layerId) ?? 0) + 1);
  const active = ed.activeLayer;
  const collapsed = new Set(ed.doc.layers.filter((l) => l.collapsed).map((l) => l.id));

  const onDrop = () => {
    if (drag?.over) ed.moveLayer(drag.id, drag.over, drag.where);
    setDrag(null);
  };

  return (
    <>
      <div className="section" style={{ padding: '8px 12px 6px', borderBottom: '1px solid var(--line)' }}>
        <div className="section-title" style={{ marginBottom: 0 }}>
          <span className="row" style={{ gap: 6 }}><LayersIcon size={13} /> Layers</span>
          <div className="row" style={{ gap: 2, position: 'relative' }}>
            <IconButton small icon={<Plus size={14} />} tip="Add layer" onClick={() => addPop.setOpen(!addPop.open)} />
            <IconButton small icon={<FolderPlus size={14} />} tip="New layer group (folder)" onClick={() => ed.addLayer('folder', 'Group')} />
            {addPop.open && (
              <div className="popover" ref={addPop.ref} style={{ top: 26, right: 0, width: 200, padding: 6 }}>
                {([['objects', 'Object layer'], ['paint', 'Texture paint layer'], ['effects', 'Atmosphere / effects layer'], ['folder', 'Group (folder)']] as [LayerKind, string][]).map(([k, label]) => (
                  <button key={k} className="btn ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => { addPop.setOpen(false); ed.addLayer(k); }}>
                    {KIND_ICON[k]} {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="layer-list scroll" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        {order.map((l) => {
          if (l.parentId && collapsed.has(l.parentId)) return null;
          const isActive = active?.id === l.id;
          const dropCls = drag && drag.over === l.id && drag.id !== l.id ? ` drop-${drag.where}` : '';
          return (
            <div key={l.id}
              className={`layer-row${isActive ? ' active' : ''}${l.parentId ? ' child' : ''}${!l.visible ? ' hidden' : ''}${dropCls}`}
              draggable={renaming !== l.id}
              onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', l.id); setDrag({ id: l.id, over: null, where: 'above' }); }}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                const y = (e.clientY - r.top) / r.height;
                const where = l.kind === 'folder' && y > 0.3 && y < 0.7 ? 'into' : y < 0.5 ? 'above' : 'below';
                if (drag.over !== l.id || drag.where !== where) setDrag({ ...drag, over: l.id, where });
              }}
              onDragEnd={() => setDrag(null)}
              onClick={() => ed.setActiveLayer(l.id)}
              onDoubleClick={() => setRenaming(l.id)}>
              {l.kind === 'folder' ? (
                <button className="icon-btn sm" onClick={(e) => { e.stopPropagation(); ed.updateLayer(l.id, { collapsed: !l.collapsed }, 'Collapse group'); }}>
                  {l.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </button>
              ) : null}
              <span className="kind">{KIND_ICON[l.kind]}</span>
              {renaming === l.id ? (
                <RenameInput layer={l} onDone={(name) => { setRenaming(null); if (name && name !== l.name) ed.updateLayer(l.id, { name }, 'Rename layer'); }} />
              ) : (
                <span className="name" title={l.name}>{l.name}</span>
              )}
              {(counts.get(l.id) ?? 0) > 0 && <span className="count">{(counts.get(l.id) ?? 0).toLocaleString()}</span>}
              <IconButton small icon={l.locked ? <Lock size={12} /> : <LockOpen size={12} />} tip={l.locked ? 'Unlock layer' : 'Lock layer'} active={l.locked}
                onClick={() => ed.updateLayer(l.id, { locked: !l.locked }, l.locked ? 'Unlock layer' : 'Lock layer')} />
              <IconButton small icon={l.visible ? <Eye size={12} /> : <EyeOff size={12} />} tip={l.visible ? 'Hide layer' : 'Show layer'}
                onClick={() => ed.updateLayer(l.id, { visible: !l.visible }, l.visible ? 'Hide layer' : 'Show layer')} />
            </div>
          );
        })}
      </div>
      {active && (
        <div className="section" style={{ borderTop: '1px solid var(--line)', borderBottom: 'none', paddingTop: 8, paddingBottom: 4 }}>
          <Slider label={`${active.name} opacity`} value={active.opacity} min={0} max={1} step={0.01} onChange={(v) => ed.updateLayer(active.id, { opacity: v }, 'Adjust layer opacity')} />
          {active.kind === 'objects' && (
            <label className="check" {...tipProps('Objects lower on the map draw in front (top-down / isometric art)')}>
              <input type="checkbox" checked={!!active.depthSort} onChange={(e) => ed.updateLayer(active.id, { depthSort: e.target.checked }, 'Depth sorting')} /> Automatic depth sorting
            </label>
          )}
        </div>
      )}
      <div className="layer-foot">
        <IconButton small icon={<ArrowUp size={13} />} tip="Move layer up" disabled={!active} onClick={() => active && ed.nudgeLayer(active.id, 1)} />
        <IconButton small icon={<ArrowDown size={13} />} tip="Move layer down" disabled={!active} onClick={() => active && ed.nudgeLayer(active.id, -1)} />
        <IconButton small icon={<Copy size={13} />} tip="Duplicate layer" disabled={!active || ['terrain', 'grid', 'lighting'].includes(active.kind)} onClick={() => active && ed.duplicateLayer(active.id)} />
        <span className="grow" />
        <button className="btn small ghost" disabled={!active || active.kind !== 'objects'} onClick={() => active && ed.selectLayer(active.id)} {...tipProps('Select all objects on this layer')}>Select all</button>
        <IconButton small icon={<Trash2 size={13} />} tip="Delete layer" disabled={!active || active.kind === 'terrain'} onClick={() => active && ed.deleteLayer(active.id)} />
      </div>
    </>
  );
}

function RenameInput({ layer, onDone }: { layer: Layer; onDone: (name: string) => void }) {
  const [v, setV] = useState(layer.name);
  return (
    <input className="input rename" autoFocus value={v} onChange={(e) => setV(e.target.value)} onClick={(e) => e.stopPropagation()}
      onBlur={() => onDone(v.trim())} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') onDone(v.trim()); if (e.key === 'Escape') onDone(layer.name); }} />
  );
}
