import { canvasToBlob, ctx2d, makeCanvas } from '../core/canvas';
import type { Editor } from '../editor/editor';
import { PngStreamEncoder, pngStreamSupported } from './png';
import { renderScene } from './renderer';

export interface ExportOptions {
  format: 'png' | 'jpeg' | 'webp';
  scale: number;
  grid: boolean;
  labels: boolean;
  lighting: boolean;
  effects: boolean;
  quality: number;
}

export interface ExportResult { blob: Blob; width: number; height: number; note?: string }

/** Largest single canvas we allow (Safari's limit is the tightest, ~16.7 MP). */
const MAX_CANVAS_AREA = 16_000_000;
const MAX_CANVAS_DIM = 16_384;

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Render the entire map (never a viewport screenshot) at the chosen scale.
 * Rendering happens in horizontal strips so memory stays bounded and progress
 * can be reported (spec §56–57).
 */
export async function exportMap(ed: Editor, o: ExportOptions, onProgress: (f: number, label: string) => void, signal?: AbortSignal): Promise<ExportResult> {
  await document.fonts?.ready;
  await ed.terrain.ensureFresh();
  let scale = o.scale;
  let W = Math.round(ed.doc.width * scale), H = Math.round(ed.doc.height * scale);
  let note: string | undefined;
  const streaming = o.format === 'png' && pngStreamSupported();
  if (!streaming && (W * H > MAX_CANVAS_AREA || W > MAX_CANVAS_DIM || H > MAX_CANVAS_DIM)) {
    const k = Math.min(Math.sqrt(MAX_CANVAS_AREA / (W * H)), MAX_CANVAS_DIM / W, MAX_CANVAS_DIM / H);
    scale = Math.floor(scale * k * 100) / 100;
    W = Math.round(ed.doc.width * scale);
    H = Math.round(ed.doc.height * scale);
    note = `Reduced to ${scale.toFixed(2)}× (${W}×${H}) — the browser cannot hold a larger ${o.format.toUpperCase()} image. Use PNG for full resolution.`;
  }
  if (W > 65535 || H > 65535) throw new Error('Export is too large.');
  const stripH = Math.max(1, Math.min(H, Math.floor(4_000_000 / W), 2048));
  const strip = makeCanvas(W, stripH);
  const sctx = ctx2d(strip, { willReadFrequently: streaming });
  const png = streaming ? new PngStreamEncoder(W, H) : null;
  const full = streaming ? null : makeCanvas(W, H);
  const fctx = full ? ctx2d(full) : null;
  if (fctx && o.format === 'jpeg') {
    fctx.fillStyle = '#ffffff';
    fctx.fillRect(0, 0, W, H);
  }
  const strips = Math.ceil(H / stripH);
  for (let i = 0; i < strips; i++) {
    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
    const y0 = i * stripH;
    const h = Math.min(stripH, H - y0);
    onProgress(i / strips, `Rendering map… ${Math.round((i / strips) * 100)}%`);
    await tick();
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, W, stripH);
    sctx.setTransform(scale, 0, 0, scale, 0, -y0);
    renderScene(sctx, ed.env, {
      view: { x: 0, y: y0 / scale, w: ed.doc.width, h: h / scale },
      pxPerUnit: scale, deviceW: W, deviceH: stripH, cached: false,
      grid: o.grid, labels: o.labels, lighting: o.lighting, effects: o.effects,
    });
    if (png) {
      const data = sctx.getImageData(0, 0, W, h).data;
      await png.writeRows(data, h);
    } else {
      fctx!.drawImage(strip, 0, 0, W, h, 0, y0, W, h);
    }
  }
  onProgress(0.99, 'Encoding image…');
  await tick();
  const blob = png
    ? await png.finish()
    : await canvasToBlob(full!, o.format === 'png' ? 'image/png' : o.format === 'jpeg' ? 'image/jpeg' : 'image/webp', o.quality);
  if (o.format === 'webp' && blob.type !== 'image/webp') note = 'This browser cannot encode WebP; the file was saved as PNG instead.';
  onProgress(1, 'Done');
  return { blob, width: W, height: H, note };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function safeFilename(name: string) {
  return name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'map';
}
