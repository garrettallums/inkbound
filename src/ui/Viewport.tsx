import { useEffect, useRef, useState } from 'react';
import type { Editor } from '../editor/editor';
import { renderScene } from '../engine/renderer';
import type { ToolEvent } from '../tools/types';

/**
 * The map canvas. Owns the render loop, camera input (wheel zoom at cursor,
 * middle / right / space-drag / hand panning) and forwards pointer input to
 * the active tool in world coordinates.
 */
export function Viewport({ editor: ed, hand }: { editor: Editor; hand: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cursor, setCursor] = useState('default');
  const [pending, setPending] = useState(false);
  const spaceRef = useRef(false);
  const handRef = useRef(hand);
  handRef.current = hand;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    let raf = 0;
    let first = true;

    const frame = () => {
      raf = 0;
      if (ed.disposed) return;
      const dpr = ed.dpr;
      const W = canvas.width, H = canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0f1012';
      ctx.fillRect(0, 0, W, H);
      const z = ed.camera.zoom * dpr;
      const tx = -ed.camera.x * z + W / 2, ty = -ed.camera.y * z + H / 2;
      ctx.setTransform(z, 0, 0, z, tx, ty);
      // map drop shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 24 * dpr;
      ctx.fillStyle = '#222';
      ctx.fillRect(0, 0, ed.doc.width, ed.doc.height);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, ed.doc.width, ed.doc.height);
      ctx.clip();
      const view = ed.viewRect();
      const stats = renderScene(ctx, ed.env, {
        view, pxPerUnit: z, deviceW: W, deviceH: H, cached: true,
        grid: true, labels: true, lighting: true, effects: true, hidden: ed.hidden, skipContrast: true,
      });
      // Lighting contrast as a GPU-composited CSS filter keeps panning fast.
      const L = ed.doc.lighting;
      const filter = L.enabled && L.contrast ? `contrast(${Math.round((1 + L.contrast) * 100)}%)` : '';
      if (canvas.style.filter !== filter) canvas.style.filter = filter;
      ctx.restore();
      ctx.setTransform(z, 0, 0, z, tx, ty);
      const unit = 1 / ed.camera.zoom;
      if (!ed.previewMode) {
        drawGizmos(ed, ctx, unit);
        ed.currentTool?.overlay?.(ed, ctx, unit);
        if (ed.tool !== 'select') ed.tools.select?.overlay?.(ed, ctx, unit);
      }
      if (!stats.complete) request();
      const pend = !ed.terrain.ready;
      setPending((p) => (p !== pend ? pend : p));
    };
    const request = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    ed.requestRender = request;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      ed.setViewport(r.width, r.height, dpr);
      if (first && r.width > 10) {
        first = false;
        if (!ed.doc.camera) ed.fit();
      }
      request();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      ed.requestRender = () => {};
    };
  }, [ed]);

  // Cursor feedback
  useEffect(() => {
    const upd = () => {
      if (handRef.current || spaceRef.current) setCursor('grab');
      else setCursor(ed.currentTool?.cursor?.(ed) ?? 'default');
    };
    upd();
    const off = ed.events.subscribe(upd);
    return () => { off(); };
  }, [ed, hand]);

  // Space-to-pan
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isField(e.target)) {
        if (!spaceRef.current) { spaceRef.current = true; setCursor('grab'); }
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') { spaceRef.current = false; setCursor(ed.currentTool?.cursor?.(ed) ?? 'default'); }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [ed]);

  // Pointer & wheel input
  useEffect(() => {
    const canvas = canvasRef.current!;
    let panning: { x: number; y: number; cx: number; cy: number } | null = null;
    let toolDown = false;
    let activePointer: number | null = null;

    const toEvent = (e: PointerEvent | MouseEvent): ToolEvent => {
      const r = canvas.getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      return {
        world: ed.screenToWorld(sx, sy), screen: { x: sx, y: sy }, button: e.button, shift: e.shiftKey, alt: e.altKey,
        ctrl: e.ctrlKey || e.metaKey, pressure: 'pressure' in e ? (e as PointerEvent).pressure || 0.5 : 0.5, unit: 1 / ed.camera.zoom,
      };
    };

    const onDown = (e: PointerEvent) => {
      canvas.focus();
      if (activePointer !== null && activePointer !== e.pointerId) return;
      const pan = e.button === 1 || e.button === 2 || spaceRef.current || handRef.current || ed.previewMode;
      canvas.setPointerCapture(e.pointerId);
      activePointer = e.pointerId;
      if (pan) {
        panning = { x: e.clientX, y: e.clientY, cx: ed.camera.x, cy: ed.camera.y };
        setCursor('grabbing');
        e.preventDefault();
        return;
      }
      if (e.button !== 0) return;
      toolDown = true;
      try {
        ed.currentTool?.down?.(ed, toEvent(e));
      } catch (err) {
        console.error(err);
        ed.toast(`Something went wrong: ${err instanceof Error ? err.message : err}`, 'error');
      }
    };
    const onMove = (e: PointerEvent) => {
      if (panning) {
        const dx = (e.clientX - panning.x) / ed.camera.zoom, dy = (e.clientY - panning.y) / ed.camera.zoom;
        ed.setCamera({ x: panning.cx - dx, y: panning.cy - dy });
        return;
      }
      if (activePointer !== null && e.pointerId !== activePointer) return;
      const ev = toEvent(e);
      ed.cursorWorld = ev.world;
      // Coalesced events give smoother brush strokes on fast drags.
      if (toolDown && typeof e.getCoalescedEvents === 'function') {
        const list = e.getCoalescedEvents();
        if (list.length > 1) {
          for (const ce of list) ed.currentTool?.move?.(ed, toEvent(ce), true);
          return;
        }
      }
      ed.currentTool?.move?.(ed, ev, toolDown);
      if (!toolDown) ed.requestRender();
    };
    const onUp = (e: PointerEvent) => {
      if (activePointer !== e.pointerId) return;
      activePointer = null;
      if (panning) {
        panning = null;
        setCursor(handRef.current || spaceRef.current ? 'grab' : ed.currentTool?.cursor?.(ed) ?? 'default');
        return;
      }
      if (toolDown) {
        toolDown = false;
        try {
          ed.currentTool?.up?.(ed, toEvent(e));
        } catch (err) {
          console.error(err);
        }
      }
    };
    const onLeave = () => {
      if (!toolDown) {
        ed.cursorWorld = null;
        ed.requestRender();
      }
    };
    const onDbl = (e: MouseEvent) => {
      if (e.button === 0 && !spaceRef.current && !handRef.current) ed.currentTool?.doubleClick?.(ed, toEvent(e));
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (e.shiftKey && !e.ctrlKey) {
        ed.setCamera({ x: ed.camera.x + (e.deltaY || e.deltaX) / ed.camera.zoom });
        return;
      }
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const k = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0016));
      ed.zoomAt(sx, sy, ed.camera.zoom * k);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('dblclick', onDbl);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    const ctxMenu = (e: Event) => e.preventDefault();
    canvas.addEventListener('contextmenu', ctxMenu);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('dblclick', onDbl);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', ctxMenu);
    };
  }, [ed]);

  return (
    <div className="viewport" ref={wrapRef}>
      <canvas ref={canvasRef} tabIndex={0} style={{ cursor }} aria-label="Map canvas" />
      {pending && <div className="loading-terrain">Tracing coastline…</div>}
    </div>
  );
}

/** Editor-only markers: light sources and effect regions. */
function drawGizmos(ed: Editor, ctx: CanvasRenderingContext2D, unit: number) {
  const showLights = ed.tool === 'light' || ed.tool === 'select' || ed.tool === 'atmosphere';
  if (showLights) {
    for (const l of ed.lights()) {
      const sel = ed.selection.includes(l.id);
      ctx.save();
      ctx.beginPath();
      ctx.arc(l.x, l.y, 9 * unit, 0, Math.PI * 2);
      ctx.fillStyle = l.color;
      ctx.globalAlpha = 0.95;
      ctx.fill();
      ctx.lineWidth = 2 * unit;
      ctx.strokeStyle = sel ? '#ffc446' : '#111';
      ctx.stroke();
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1.4 * unit;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(l.x + Math.cos(a) * 12 * unit, l.y + Math.sin(a) * 12 * unit);
        ctx.lineTo(l.x + Math.cos(a) * 16 * unit, l.y + Math.sin(a) * 16 * unit);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
