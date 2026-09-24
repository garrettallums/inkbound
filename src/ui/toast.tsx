import { useEffect, useState } from 'react';

interface Toast { id: number; msg: string; kind: 'info' | 'error' }

let listeners: ((t: Toast[]) => void)[] = [];
let toasts: Toast[] = [];
let next = 1;

export function toast(msg: string, kind: 'info' | 'error' = 'info') {
  const t = { id: next++, msg, kind };
  toasts = [...toasts.filter((x) => x.msg !== msg), t].slice(-4);
  listeners.forEach((l) => l(toasts));
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    listeners.forEach((l) => l(toasts));
  }, kind === 'error' ? 6000 : 2400);
}

export function ToastHost() {
  const [list, setList] = useState<Toast[]>(toasts);
  useEffect(() => {
    listeners.push(setList);
    return () => { listeners = listeners.filter((l) => l !== setList); };
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>
      ))}
    </div>
  );
}
