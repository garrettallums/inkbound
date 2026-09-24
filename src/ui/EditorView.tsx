import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft, CloudFog, Download, Eye, Grid3x3, Hand, Keyboard, Lightbulb, Maximize, Minus, Mountain, MousePointer2,
  PanelRightClose, PanelRight, Plus, Redo2, Route, Settings2, Trees, Type, Undo2, Paintbrush,
} from 'lucide-react';
import type { Editor } from '../editor/editor';
import type { ToolId } from '../editor/settings';
import { translateObj } from '../editor/transform';
import { renderScene } from '../engine/renderer';
import { TOOL_INFO } from '../tools';
import { IconButton, useEmitter, useStore, usePopover, tipProps, Modal } from './controls';
import { ExportDialog } from './ExportDialog';
import { GridSettingsPanel, MapSettingsPanel } from './SettingsPanels';
import { LayersPanel } from './LayersPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { ToolPanel } from './ToolPanel';
import { Viewport } from './Viewport';

const TOOL_ICONS: Record<ToolId, React.ReactNode> = {
  select: <MousePointer2 size={18} />,
  terrain: <Mountain size={18} />,
  brush: <Paintbrush size={18} />,
  asset: <Trees size={18} />,
  path: <Route size={18} />,
  text: <Type size={18} />,
  light: <Lightbulb size={18} />,
  atmosphere: <CloudFog size={18} />,
};

const WORKFLOW: { label: string; tool: ToolId }[] = [
  { label: 'Create', tool: 'terrain' },
  { label: 'Paint', tool: 'brush' },
  { label: 'Populate', tool: 'asset' },
  { label: 'Detail', tool: 'path' },
  { label: 'Light', tool: 'atmosphere' },
];

/** Smoothly animate the camera zoom around the viewport centre. */
export function animateZoom(ed: Editor, target: number, center?: { x: number; y: number }) {
  const from = ed.camera.zoom;
  const to = Math.max(ed.minZoom, Math.min(ed.maxZoom, target));
  const cx0 = ed.camera.x, cy0 = ed.camera.y;
  const t0 = performance.now();
  const step = () => {
    const t = Math.min(1, (performance.now() - t0) / 160);
    const e = 1 - Math.pow(1 - t, 3);
    const z = from * Math.pow(to / from, e);
    if (center) ed.setCamera({ zoom: z, x: cx0 + (center.x - cx0) * e, y: cy0 + (center.y - cy0) * e });
    else ed.zoomAt(ed.viewW / 2, ed.viewH / 2, z);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function EditorView({ editor: ed, onExit }: { editor: Editor; onExit: () => void }) {
  useEmitter(ed.events);
  const [rightOpen, setRightOpen] = useState(true);
  const [toolOpen, setToolOpen] = useState(true);
  const [hand, setHand] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const mapPop = usePopover();
  const gridPop = usePopover();

  // Expose the live editor for debugging / automated browser tests.
  useEffect(() => {
    Object.assign(window, { inkbound: ed, __render: renderScene });
  }, [ed]);

  // Save when leaving (browser back / tab close) and warn about unsaved work.
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (ed.hasUnsavedChanges) {
        void ed.save(true);
        e.preventDefault();
      }
    };
    const hidden = () => { if (document.visibilityState === 'hidden' && ed.hasUnsavedChanges) void ed.save(); };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('visibilitychange', hidden);
      if (!ed.disposed && ed.hasUnsavedChanges) void ed.save(true);
    };
  }, [ed]);

  const setTool = useCallback((t: ToolId) => {
    ed.setTool(t);
    setHand(false);
    setToolOpen(true);
  }, [ed]);

  // Keyboard shortcuts (spec §53)
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    const onKey = (e: KeyboardEvent) => {
      if (isField(e.target) || e.defaultPrevented) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod) {
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); ed.undo(); return; }
        if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); ed.redo(); return; }
        if (k === 'c') { e.preventDefault(); ed.copy(); return; }
        if (k === 'x') { e.preventDefault(); ed.copy(); ed.deleteSelection(); return; }
        if (k === 'v') { e.preventDefault(); ed.paste(); return; }
        if (k === 'd') { e.preventDefault(); ed.duplicateSelection(); return; }
        if (k === 'a') { e.preventDefault(); if (e.shiftKey) ed.setSelection([]); else ed.selectAll(); return; }
        if (k === 'g') { e.preventDefault(); if (e.shiftKey) ed.ungroupSelection(); else ed.groupSelection(); return; }
        if (k === 's') { e.preventDefault(); void ed.save(true); return; }
        if (k === 'e') { e.preventDefault(); setShowExport(true); return; }
        if (k === '0') { e.preventDefault(); ed.fit(); return; }
        if (k === '1') { e.preventDefault(); animateZoom(ed, 1); return; }
        if (k === '=' || k === '+') { e.preventDefault(); animateZoom(ed, ed.camera.zoom * 1.4); return; }
        if (k === '-') { e.preventDefault(); animateZoom(ed, ed.camera.zoom / 1.4); return; }
        if (k === ']') { e.preventDefault(); ed.reorderSelection(e.shiftKey ? 'front' : 'forward'); return; }
        if (k === '[') { e.preventDefault(); ed.reorderSelection(e.shiftKey ? 'back' : 'backward'); return; }
        return;
      }
      if (e.key === 'Escape') {
        if (ed.previewMode) { ed.setPreview(false); return; }
        if (ed.currentTool?.cancel?.(ed)) return;
        if (ed.tool !== 'select') { ed.setSelection([]); }
        return;
      }
      if (ed.currentTool?.key?.(ed, e)) { e.preventDefault(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); ed.deleteSelection(); return; }
      if (e.key === '`' || e.key === '\\') { ed.setPreview(!ed.previewMode); return; }
      if (e.key === '?') { setShowKeys(true); return; }
      if (e.key.startsWith('Arrow') && ed.selection.length) {
        e.preventDefault();
        const d = (e.shiftKey ? 10 : 1) * (ed.settings.snap && ed.doc.grid.type !== 'none' ? ed.doc.grid.size : 1);
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
        const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
        ed.putObjects(ed.selectedObjects.filter((o) => !o.locked).map((o) => translateObj(o, dx, dy)), 'Adjust nudge');
        return;
      }
      if (k === 'h') { setHand((h) => !h); return; }
      const tool = TOOL_INFO.find((t) => t.key.toLowerCase() === k);
      if (tool) setTool(tool.id as ToolId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ed, setTool]);

  const preview = ed.previewMode;
  const info = TOOL_INFO.find((t) => t.id === ed.tool)!;

  return (
    <div className={`editor${preview ? ' preview' : ''}`}>
      <div className="topbar">
        <IconButton icon={<ChevronLeft size={18} />} tip="Back to maps (saves)" onClick={onExit} />
        <NameField ed={ed} />
        <SaveStatus ed={ed} />
        <span className="sep" />
        <IconButton icon={<Undo2 size={17} />} tip={ed.history.canUndo ? `Undo ${ed.history.undoStack[ed.history.undoStack.length - 1].label}` : 'Undo'} kbd="Ctrl+Z" disabled={!ed.history.canUndo} onClick={() => ed.undo()} />
        <IconButton icon={<Redo2 size={17} />} tip={ed.history.canRedo ? `Redo ${ed.history.redoStack[ed.history.redoStack.length - 1].label}` : 'Redo'} kbd="Ctrl+Shift+Z" disabled={!ed.history.canRedo} onClick={() => ed.redo()} />
        <span className="sep" />
        <div style={{ position: 'relative' }}>
          <IconButton icon={<Settings2 size={17} />} tip="Map settings" active={mapPop.open} onClick={() => mapPop.setOpen(!mapPop.open)} />
          {mapPop.open && <div className="popover scroll" ref={mapPop.ref} style={{ top: 36, left: 0, maxHeight: 'calc(100vh - 90px)' }}><MapSettingsPanel editor={ed} /></div>}
        </div>
        <div style={{ position: 'relative' }}>
          <IconButton icon={<Grid3x3 size={17} />} tip="Grid settings" active={gridPop.open} onClick={() => gridPop.setOpen(!gridPop.open)} />
          {gridPop.open && <div className="popover" ref={gridPop.ref} style={{ top: 36, left: 0 }}><GridSettingsPanel editor={ed} /></div>}
        </div>
        <div className="workflow" aria-label="Workflow">
          {WORKFLOW.map((w, i) => (
            <span key={w.label} className="row" style={{ gap: 2 }}>
              {i > 0 && <span className="arrow">›</span>}
              <button className={ed.tool === w.tool ? 'on' : ''} onClick={() => setTool(w.tool)}>{w.label}</button>
            </span>
          ))}
          <span className="arrow">›</span>
          <button onClick={() => setShowExport(true)}>Export</button>
        </div>
        <IconButton icon={<Keyboard size={17} />} tip="Keyboard shortcuts" kbd="?" onClick={() => setShowKeys(true)} />
        <button className="btn" onClick={() => ed.setPreview(true)} {...tipProps('Preview the finished map', '`')}><Eye size={15} /> Preview</button>
        <button className="btn primary" onClick={() => setShowExport(true)} {...tipProps('Export image', 'Ctrl+E')}><Download size={15} /> Export</button>
      </div>

      <div className="main">
        {!preview && (
          <nav className="rail" aria-label="Tools">
            {TOOL_INFO.map((t) => (
              <IconButton key={t.id} icon={TOOL_ICONS[t.id as ToolId]} tip={`${t.label} — ${t.hint}`} kbd={t.key}
                active={ed.tool === t.id && !hand} onClick={() => { if (ed.tool === t.id) setToolOpen((o) => !o); else setTool(t.id as ToolId); }} />
            ))}
            <span className="spacer" />
            <IconButton icon={<Hand size={18} />} tip="Pan (or hold Space / drag with middle or right mouse)" kbd="H" active={hand} onClick={() => setHand(!hand)} />
          </nav>
        )}
        {!preview && toolOpen && (
          <aside className="toolpanel">
            <div className="toolpanel-head">
              <span>{info.label}</span>
              <IconButton small icon={<ChevronLeft size={15} />} tip="Collapse panel" onClick={() => setToolOpen(false)} />
            </div>
            <div className="toolpanel-body scroll">
              <ToolPanel editor={ed} />
            </div>
          </aside>
        )}
        <Viewport editor={ed} hand={hand} />
        {preview && <div className="preview-hint">Preview — press Esc to return to editing</div>}
        {!preview && rightOpen && (
          <aside className="rightpanel">
            <div className="props scroll"><PropertiesPanel editor={ed} /></div>
            <div className="layers"><LayersPanel editor={ed} /></div>
          </aside>
        )}
        {!preview && (
          <div className="panel-toggle" style={{ right: rightOpen ? 298 : 8 }}>
            <IconButton icon={rightOpen ? <PanelRightClose size={17} /> : <PanelRight size={17} />} tip={rightOpen ? 'Hide properties & layers' : 'Show properties & layers'} onClick={() => setRightOpen(!rightOpen)} />
          </div>
        )}
      </div>

      <BottomBar ed={ed} />
      {showExport && <ExportDialog editor={ed} onClose={() => setShowExport(false)} />}
      {showKeys && <ShortcutsDialog onClose={() => setShowKeys(false)} />}
    </div>
  );
}

function NameField({ ed }: { ed: Editor }) {
  const [v, setV] = useState<string | null>(null);
  const cancelled = useRef(false);
  const commit = () => {
    const n = (v ?? '').trim();
    if (!cancelled.current && v !== null && n && n !== ed.doc.name) ed.setKey('name', n, 'Rename map');
    cancelled.current = false;
    setV(null);
  };
  return (
    <input className="project-name" value={v ?? ed.doc.name} aria-label="Map name"
      onFocus={() => setV(ed.doc.name)} onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur(); } }} />
  );
}

function SaveStatus({ ed }: { ed: Editor }) {
  const s = ed.saveStatus;
  const label = s === 'saved' ? 'Saved' : s === 'saving' ? 'Saving…' : s === 'unsaved' ? 'Unsaved Changes' : 'Save failed — retry';
  return (
    <button className={`save-status ${s}`} style={{ background: 'none', border: 'none' }} onClick={() => void ed.save(true)} {...tipProps(ed.saveError ?? 'Autosaves to this browser. Click to save now.', 'Ctrl+S')}>
      <span className="dot" /> {label}
    </button>
  );
}

function BottomBar({ ed }: { ed: Editor }) {
  const zoom = useStore(ed.cameraEvents, () => ed.camera.zoom);
  const objCount = Object.keys(ed.doc.objects).length;
  const [edit, setEdit] = useState<string | null>(null);
  return (
    <div className="bottombar">
      <span>{ed.doc.width} × {ed.doc.height}px</span>
      <span>· {objCount.toLocaleString()} objects</span>
      {ed.selection.length > 0 && <span>· {ed.selection.length} selected</span>}
      <span className="muted">· Hold Space to pan · Scroll to zoom</span>
      <div className="nav">
        <IconButton small icon={<Minus size={14} />} tip="Zoom out" kbd="Ctrl+−" onClick={() => animateZoom(ed, zoom / 1.4)} />
        <input className="zoom-pct" value={edit ?? `${Math.round(zoom * 100)}%`} aria-label="Zoom percentage"
          onFocus={(e) => { setEdit(String(Math.round(zoom * 100))); setTimeout(() => e.target.select()); }}
          onChange={(e) => setEdit(e.target.value)}
          onBlur={() => { const v = parseFloat(edit ?? ''); if (Number.isFinite(v) && v > 0) animateZoom(ed, v / 100); setEdit(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setEdit(null); e.currentTarget.blur(); } e.stopPropagation(); }} />
        <IconButton small icon={<Plus size={14} />} tip="Zoom in" kbd="Ctrl+=" onClick={() => animateZoom(ed, zoom * 1.4)} />
        <button className="btn small" onClick={() => animateZoom(ed, ed.fitZoom(), { x: ed.doc.width / 2, y: ed.doc.height / 2 })} {...tipProps('Fit map to screen', 'Ctrl+0')}><Maximize size={13} /> Fit</button>
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Undo / Redo', 'Ctrl+Z / Ctrl+Shift+Z'], ['Copy / Paste / Cut', 'Ctrl+C / Ctrl+V / Ctrl+X'], ['Duplicate', 'Ctrl+D'],
  ['Select all / none', 'Ctrl+A / Ctrl+Shift+A'], ['Delete', 'Delete'], ['Cancel / deselect / exit preview', 'Esc'],
  ['Pan', 'Space + drag, middle or right drag, H'], ['Zoom', 'Scroll, Ctrl+= / Ctrl+−'], ['Fit / 100%', 'Ctrl+0 / Ctrl+1'],
  ['Group / Ungroup', 'Ctrl+G / Ctrl+Shift+G'], ['Bring forward / to front', 'Ctrl+] / Ctrl+Shift+]'], ['Send backward / to back', 'Ctrl+[ / Ctrl+Shift+['],
  ['Nudge selection', 'Arrow keys (+Shift ×10)'], ['Brush size', '[ / ]'], ['Terrain add ↔ subtract', 'X (or hold Alt)'], ['Brush erase', 'E (or hold Alt)'],
  ['Finish path / remove last point', 'Enter / Backspace'], ['Preview', '`'], ['Save now', 'Ctrl+S'], ['Export', 'Ctrl+E'],
  ['Tools', 'V Select · T Terrain · B Brush · A Assets · P Path · L Text · G Light · M Atmosphere'],
];

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} narrow>
      <table className="shortcut-table"><tbody>
        {SHORTCUTS.map(([a, b]) => <tr key={a}><td>{a}</td><td><span className="kbd">{b}</span></td></tr>)}
      </tbody></table>
    </Modal>
  );
}
