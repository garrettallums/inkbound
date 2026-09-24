export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement, opts?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', opts);
  if (!ctx) throw new Error('Canvas 2D is not available in this browser.');
  return ctx;
}

/** Whether `ctx.filter` actually works (Safari historically ignores it). */
let filterSupport: boolean | null = null;
export function supportsCanvasFilter(): boolean {
  if (filterSupport !== null) return filterSupport;
  try {
    const c = makeCanvas(4, 4);
    const x = ctx2d(c);
    x.filter = 'blur(2px)';
    filterSupport = x.filter === 'blur(2px)';
  } catch {
    filterSupport = false;
  }
  return filterSupport;
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality),
  );
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

export async function blobToImage(b: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(b);
  try {
    return await loadImage(url);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
