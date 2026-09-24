/**
 * Marching-squares contour extraction for the land mask. Pure functions so the
 * work can run inside a Web Worker (spec §58).
 *
 * Rings are returned in mask-pixel coordinates with land consistently on the
 * right-hand side of travel (y-down), so outer coasts and lakes wind in
 * opposite directions and a nonzero fill renders holes correctly.
 */

export interface ContourResult {
  rings: Float32Array[];
}

// Corners: 0 = tl, 1 = tr, 2 = br, 3 = bl. Edges: 0 = top, 1 = right, 2 = bottom, 3 = left.
const EDGE_MID = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
const CORNER_POS = [[0, 0], [1, 0], [1, 1], [0, 1]];
const CORNER_EDGES: [number, number][] = [[3, 0], [0, 1], [1, 2], [2, 3]];

type Seg = [e1: number, e2: number];

/** Segment table per case (bits: tl=8, tr=4, br=2, bl=1), oriented so land is on the right. */
function buildTable(): { normal: Seg[][]; saddleIn: Seg[][] } {
  const normal: Seg[][] = [];
  const saddleIn: Seg[][] = [];
  const orient = (e1: number, e2: number, corner: number, inside: boolean): Seg => {
    const p1 = EDGE_MID[e1], p2 = EDGE_MID[e2], c = CORNER_POS[corner];
    const cross = (p2[0] - p1[0]) * (c[1] - p1[1]) - (p2[1] - p1[1]) * (c[0] - p1[0]);
    const right = cross > 0;
    return right === inside ? [e1, e2] : [e2, e1];
  };
  for (let k = 0; k < 16; k++) {
    const ins = [(k & 8) > 0, (k & 4) > 0, (k & 2) > 0, (k & 1) > 0];
    const count = ins.filter(Boolean).length;
    const segs: Seg[] = [];
    const segsIn: Seg[] = [];
    if (count === 1 || count === 3) {
      const target = count === 1;
      const c = ins.findIndex((v) => v === target);
      const [a, b] = CORNER_EDGES[c];
      segs.push(orient(a, b, c, ins[c]));
    } else if (count === 2) {
      if (ins[0] === ins[2]) {
        // saddle: tl & br share state
        // Center outside → isolate the two inside corners; center inside → isolate the two outside corners.
        for (let c = 0; c < 4; c++) if (ins[c]) segs.push(orient(CORNER_EDGES[c][0], CORNER_EDGES[c][1], c, true));
        for (let c = 0; c < 4; c++) if (!ins[c]) segsIn.push(orient(CORNER_EDGES[c][0], CORNER_EDGES[c][1], c, false));
      } else {
        // two adjacent corners inside: the cut crosses the two edges between inside and outside corners
        const cut: number[] = [];
        for (let e = 0; e < 4; e++) {
          const ca = e, cb = (e + 1) % 4; // edge e joins corner e and corner e+1 (tl-tr, tr-br, br-bl, bl-tl)
          if (ins[ca] !== ins[cb]) cut.push(e);
        }
        const c = ins.findIndex(Boolean);
        segs.push(orient(cut[0], cut[1], c, true));
      }
    }
    normal.push(segs);
    saddleIn.push(segsIn.length ? segsIn : segs);
  }
  return { normal, saddleIn };
}

const TABLE = buildTable();

/**
 * Extract iso-contours at `threshold` from a w×h Uint8 field. The field is
 * padded with zeros so every ring closes.
 */
export function extractContours(data: Uint8Array, w: number, h: number, threshold = 128): Float32Array[] {
  const W = w + 2, H = h + 2;
  const val = (x: number, y: number) => (x <= 0 || y <= 0 || x > w || y > h ? 0 : data[(y - 1) * w + (x - 1)]);
  // Edge id: horizontal edge between (x,y)-(x+1,y) → (y*W+x)*2 ; vertical (x,y)-(x,y+1) → (y*W+x)*2+1
  const next = new Map<number, number>();
  const px = new Map<number, number>();
  const py = new Map<number, number>();
  const edgeId = (cx: number, cy: number, e: number) => {
    switch (e) {
      case 0: return (cy * W + cx) * 2;
      case 1: return (cy * W + cx + 1) * 2 + 1;
      case 2: return ((cy + 1) * W + cx) * 2;
      default: return (cy * W + cx) * 2 + 1;
    }
  };
  const interp = (a: number, b: number) => {
    const d = b - a;
    return d === 0 ? 0.5 : Math.min(1, Math.max(0, (threshold - a) / d));
  };
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const tl = val(x, y), tr = val(x + 1, y), br = val(x + 1, y + 1), bl = val(x, y + 1);
      const k = (tl >= threshold ? 8 : 0) | (tr >= threshold ? 4 : 0) | (br >= threshold ? 2 : 0) | (bl >= threshold ? 1 : 0);
      if (k === 0 || k === 15) continue;
      let segs = TABLE.normal[k];
      if (k === 5 || k === 10) {
        const center = (tl + tr + br + bl) / 4;
        if (center >= threshold) segs = TABLE.saddleIn[k];
      }
      for (const [e1, e2] of segs) {
        const id1 = edgeId(x, y, e1), id2 = edgeId(x, y, e2);
        next.set(id1, id2);
        for (const [e, id] of [[e1, id1], [e2, id2]] as const) {
          if (px.has(id)) continue;
          let ex: number, ey: number;
          if (e === 0) { ex = x + interp(tl, tr); ey = y; }
          else if (e === 1) { ex = x + 1; ey = y + interp(tr, br); }
          else if (e === 2) { ex = x + interp(bl, br); ey = y + 1; }
          else { ex = x; ey = y + interp(tl, bl); }
          // back to unpadded pixel-centre coordinates (+0.5 → pixel space where pixel i covers [i, i+1])
          px.set(id, ex - 1 + 0.5);
          py.set(id, ey - 1 + 0.5);
        }
      }
    }
  }
  const rings: Float32Array[] = [];
  const visited = new Set<number>();
  for (const start of next.keys()) {
    if (visited.has(start)) continue;
    const pts: number[] = [];
    let cur: number | undefined = start;
    let guard = 0;
    while (cur !== undefined && !visited.has(cur) && guard++ < 10_000_000) {
      visited.add(cur);
      pts.push(px.get(cur)!, py.get(cur)!);
      cur = next.get(cur);
    }
    if (pts.length >= 6) rings.push(new Float32Array(pts));
  }
  return rings;
}

/** One pass of Chaikin corner cutting on a closed ring. */
export function chaikin(ring: Float32Array): Float32Array {
  const n = ring.length / 2;
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = ring[i * 2], y0 = ring[i * 2 + 1], x1 = ring[j * 2], y1 = ring[j * 2 + 1];
    out[i * 4] = 0.75 * x0 + 0.25 * x1;
    out[i * 4 + 1] = 0.75 * y0 + 0.25 * y1;
    out[i * 4 + 2] = 0.25 * x0 + 0.75 * x1;
    out[i * 4 + 3] = 0.25 * y0 + 0.75 * y1;
  }
  return out;
}

/** Radial-distance + RDP-ish simplification for closed rings. */
export function simplifyRing(ring: Float32Array, eps: number): Float32Array {
  const n = ring.length / 2;
  if (n < 8) return ring;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: number[] = [0, n - 1];
  const e2 = eps * eps;
  while (stack.length) {
    const b = stack.pop()!, a = stack.pop()!;
    const ax = ring[a * 2], ay = ring[a * 2 + 1], bx = ring[b * 2], by = ring[b * 2 + 1];
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy || 1e-9;
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const x = ring[i * 2], y = ring[i * 2 + 1];
      let t = ((x - ax) * dx + (y - ay) * dy) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + t * dx - x, qy = ay + t * dy - y;
      const d = qx * qx + qy * qy;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > e2 && idx > 0) {
      keep[idx] = 1;
      stack.push(a, idx, idx, b);
    }
  }
  let count = 0;
  for (let i = 0; i < n; i++) if (keep[i]) count++;
  const out = new Float32Array(count * 2);
  let k = 0;
  for (let i = 0; i < n; i++) if (keep[i]) { out[k++] = ring[i * 2]; out[k++] = ring[i * 2 + 1]; }
  return out;
}

/** Full pipeline: contours → optional smoothing → simplification → world coordinates. */
export function buildCoastline(data: Uint8Array, w: number, h: number, scale: number, smooth: boolean): Float32Array[] {
  const rings = extractContours(data, w, h);
  const out: Float32Array[] = [];
  for (let r of rings) {
    r = simplifyRing(r, smooth ? 0.3 : 0.15);
    if (smooth) r = chaikin(r);
    if (r.length < 6) continue;
    const inv = 1 / scale;
    for (let i = 0; i < r.length; i++) r[i] *= inv;
    out.push(r);
  }
  return out;
}
