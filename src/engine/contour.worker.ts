/// <reference lib="webworker" />
import { buildCoastline } from './contour';

interface Req { id: number; data: Uint8Array; w: number; h: number; scale: number; smooth: boolean }

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, data, w, h, scale, smooth } = e.data;
  const rings = buildCoastline(data, w, h, scale, smooth);
  (self as unknown as Worker).postMessage({ id, rings }, rings.map((r) => r.buffer));
};
