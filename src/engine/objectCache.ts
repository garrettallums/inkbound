import { makeCanvas, ctx2d } from '../core/canvas';
import { rectsIntersect, type Rect } from '../core/geom';

/**
 * Tile cache for dense object layers (spec §58–59). When thousands of objects
 * are on screen (a zoomed-out forest), each 256px tile is rendered once per
 * zoom level and reused while panning. Edits invalidate only the tiles under
 * the changed objects.
 */

const TILE = 256;
const MAX_TILES = 360;

export class ObjectTileCache {
  private tiles = new Map<string, { canvas: HTMLCanvasElement; layer: string; rect: Rect }>();
  private order: string[] = [];

  invalidate(layerId: string, r: Rect) {
    for (const [k, t] of this.tiles) if (t.layer === layerId && rectsIntersect(t.rect, r)) this.tiles.delete(k);
  }

  invalidateLayer(layerId: string) {
    for (const [k, t] of this.tiles) if (t.layer === layerId) this.tiles.delete(k);
  }

  invalidateAll() {
    this.tiles.clear();
    this.order = [];
  }

  static levelFor(pxPerUnit: number) {
    return Math.max(-6, Math.min(2, Math.ceil(Math.log2(pxPerUnit) - 0.001)));
  }

  /**
   * Draw a layer through the cache. `render` draws the given objects for a
   * world rect at scale `s` into a tile context (already transformed).
   * Returns false when some tiles were skipped for budget reasons.
   */
  draw(
    ctx: CanvasRenderingContext2D, layerId: string, view: Rect, mapW: number, mapH: number, pxPerUnit: number,
    render: (tctx: CanvasRenderingContext2D, rect: Rect, s: number) => void, deadline: number,
  ): boolean {
    const level = ObjectTileCache.levelFor(pxPerUnit);
    const s = Math.pow(2, level);
    const size = TILE / s;
    // objects can overhang the map edge slightly; cover a margin
    const x0 = Math.max(-size, view.x), y0 = Math.max(-size, view.y);
    const x1 = Math.min(mapW + size, view.x + view.w), y1 = Math.min(mapH + size, view.y + view.h);
    const tx0 = Math.floor(x0 / size), ty0 = Math.floor(y0 / size), tx1 = Math.floor(x1 / size), ty1 = Math.floor(y1 / size);
    let complete = true;
    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = `${layerId}|${level}|${tx}|${ty}`;
        let t = this.tiles.get(key);
        const rect = { x: tx * size, y: ty * size, w: size, h: size };
        if (!t) {
          if (performance.now() > deadline) {
            complete = false;
            // fall back to a coarser cached tile if one exists
            const pl = level - 1, ps = Math.pow(2, pl), psize = TILE / ps;
            const ptx = Math.floor(rect.x / psize), pty = Math.floor(rect.y / psize);
            const parent = this.tiles.get(`${layerId}|${pl}|${ptx}|${pty}`);
            if (parent) {
              const sx = (rect.x - ptx * psize) * ps, sy = (rect.y - pty * psize) * ps;
              ctx.drawImage(parent.canvas, sx, sy, size * ps, size * ps, rect.x, rect.y, size, size);
            }
            continue;
          }
          const canvas = makeCanvas(TILE, TILE);
          const tctx = ctx2d(canvas);
          tctx.setTransform(s, 0, 0, s, -rect.x * s, -rect.y * s);
          tctx.beginPath();
          tctx.rect(rect.x, rect.y, size, size);
          tctx.clip();
          render(tctx, rect, s);
          t = { canvas, layer: layerId, rect };
          this.tiles.set(key, t);
          this.order.push(key);
          if (this.order.length > MAX_TILES) for (const k of this.order.splice(0, 60)) this.tiles.delete(k);
        }
        ctx.drawImage(t.canvas, 0, 0, TILE, TILE, rect.x, rect.y, size, size);
      }
    }
    ctx.imageSmoothingEnabled = prevSmooth;
    return complete;
  }
}
