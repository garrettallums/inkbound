import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Emitter } from '../core/emitter';

/** Re-render when an emitter fires. */
export function useEmitter(em: Emitter): number {
  const ver = useRef(0);
  const [, force] = useState(0);
  useEffect(() => em.subscribe(() => { ver.current++; force((x) => x + 1); }), [em]);
  return ver.current;
}

/** Subscribe to an emitter and read a derived snapshot. */
export function useStore<T>(em: Emitter, read: () => T): T {
  const cache = useRef<{ v: T } | null>(null);
  return useSyncExternalStore(
    (cb) => em.subscribe(() => { cache.current = null; cb(); }),
    () => {
      if (!cache.current) cache.current = { v: read() };
      return cache.current.v;
    },
  );
}

// ------------------------------------------------------------------ tooltip

let tipEl: HTMLDivElement | null = null;
let tipTimer: ReturnType<typeof setTimeout> | null = null;

function showTip(target: HTMLElement, text: string, key?: string) {
  if (tipTimer) clearTimeout(tipTimer);
  tipTimer = setTimeout(() => {
    if (!target.isConnected) return;
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'tip';
      document.body.appendChild(tipEl);
    }
    tipEl.innerHTML = '';
    tipEl.append(text);
    if (key) {
      const k = document.createElement('span');
      k.className = 'kbd';
      k.textContent = key;
      tipEl.append(k);
    }
    tipEl.style.display = 'block';
    const r = target.getBoundingClientRect();
    const tr = tipEl.getBoundingClientRect();
    let x = r.right + 8, y = r.top + r.height / 2 - tr.height / 2;
    if (x + tr.width > window.innerWidth - 8) { x = r.left + r.width / 2 - tr.width / 2; y = r.bottom + 6; }
    if (y + tr.height > window.innerHeight - 8) y = r.top - tr.height - 6;
    tipEl.style.left = `${Math.max(6, Math.min(window.innerWidth - tr.width - 6, x))}px`;
    tipEl.style.top = `${Math.max(6, y)}px`;
  }, 380);
}

function hideTip() {
  if (tipTimer) clearTimeout(tipTimer);
  if (tipEl) tipEl.style.display = 'none';
}

export function tipProps(text: string, key?: string) {
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showTip(e.currentTarget, text, key),
    onMouseLeave: hideTip,
    onMouseDown: hideTip,
    'aria-label': text,
  };
}

export function IconButton(p: { icon: ReactNode; tip: string; kbd?: string; onClick?: () => void; active?: boolean; disabled?: boolean; small?: boolean; className?: string }) {
  return (
    <button
      type="button"
      className={`icon-btn${p.active ? ' active' : ''}${p.small ? ' sm' : ''} ${p.className ?? ''}`}
      disabled={p.disabled}
      onClick={p.onClick}
      {...tipProps(p.tip, p.kbd)}
    >
      {p.icon}
    </button>
  );
}

// ------------------------------------------------------------------ fields

export function NumberInput(p: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; className?: string; precision?: number; onCommit?: () => void }) {
  const [text, setText] = useState(fmt(p.value, p.precision));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(p.value, p.precision));
  }, [p.value, p.precision]);
  const commit = () => {
    const v = parseFloat(text);
    if (Number.isFinite(v)) {
      const c = Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, v));
      p.onChange(c);
      setText(fmt(c, p.precision));
    } else setText(fmt(p.value, p.precision));
    p.onCommit?.();
  };
  return (
    <input
      className={`input num ${p.className ?? ''}`}
      value={text}
      inputMode="decimal"
      onFocus={(e) => { focused.current = true; e.currentTarget.select(); }}
      onBlur={() => { focused.current = false; commit(); }}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const step = (p.step ?? 1) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
          const v = Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, (parseFloat(text) || 0) + step));
          setText(fmt(v, p.precision));
          p.onChange(v);
        }
        e.stopPropagation();
      }}
    />
  );
}

function fmt(v: number, precision = 2) {
  if (!Number.isFinite(v)) return '';
  const k = Math.pow(10, precision);
  return String(Math.round(v * k) / k);
}

export function Slider(p: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
  onStart?: () => void; onEnd?: () => void; suffix?: string; precision?: number; display?: (v: number) => string; tip?: string;
}) {
  return (
    <div className="field">
      <div className="slider-head" {...(p.tip ? tipProps(p.tip) : {})}>
        <span>{p.label}</span>
      </div>
      <div className="slider">
        <input
          type="range" min={p.min} max={p.max} step={p.step ?? (p.max - p.min) / 100} value={p.value}
          onPointerDown={p.onStart} onPointerUp={p.onEnd} onKeyUp={p.onEnd}
          onChange={(e) => p.onChange(parseFloat(e.target.value))}
        />
        <NumberInput value={p.value} min={p.min} max={p.max} step={p.step ?? (p.max - p.min) / 100} precision={p.precision ?? 2}
          onChange={(v) => { p.onStart?.(); p.onChange(v); p.onEnd?.(); }} />
      </div>
    </div>
  );
}

export function Check(p: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; tip?: string }) {
  return (
    <label className="check" {...(p.tip ? tipProps(p.tip) : {})}>
      <input type="checkbox" checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} />
      {p.label}
    </label>
  );
}

export function Seg<T extends string>(p: { value: T; options: { value: T; label: ReactNode; tip?: string }[]; onChange: (v: T) => void; full?: boolean }) {
  return (
    <div className={`seg${p.full ? ' full' : ''}`}>
      {p.options.map((o) => (
        <button key={o.value} type="button" className={o.value === p.value ? 'on' : ''} onClick={() => p.onChange(o.value)} {...(o.tip ? tipProps(o.tip) : {})}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ColorInput(p: { value: string; onChange: (v: string) => void; onStart?: () => void; onEnd?: () => void }) {
  const hex = /^#[0-9a-f]{6}$/i.test(p.value) ? p.value : '#000000';
  return (
    <input type="color" className="color" value={hex}
      onFocus={p.onStart} onBlur={p.onEnd}
      onChange={(e) => p.onChange(e.target.value)} />
  );
}

export function Section(p: { title: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="section">
      <div className="section-title">
        <span>{p.title}</span>
        {p.right}
      </div>
      {p.children}
    </div>
  );
}

export function Modal(p: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; narrow?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); p.onClose(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [p.onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) p.onClose(); }}>
      <div className={`modal${p.narrow ? ' narrow' : ''}`} role="dialog" aria-label={p.title}>
        <div className="modal-head">
          <h2>{p.title}</h2>
          <button className="icon-btn" onClick={p.onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body scroll">{p.children}</div>
        {p.footer && <div className="modal-foot">{p.footer}</div>}
      </div>
    </div>
  );
}

/** Popover anchored under a button; closes on outside click / Escape. */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    setTimeout(() => window.addEventListener('mousedown', down), 0);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key); };
  }, [open]);
  return { open, setOpen, ref };
}
