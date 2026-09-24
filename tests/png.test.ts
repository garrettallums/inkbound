import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { crc32, PngStreamEncoder } from '../src/engine/png';

describe('streaming PNG encoder', () => {
  it('computes the standard CRC32', () => {
    expect(crc32([new TextEncoder().encode('IEND')])).toBe(0xae426082);
  });

  it('writes a valid RGBA PNG across multiple strips', async () => {
    const w = 7, h = 5;
    const enc = new PngStreamEncoder(w, h);
    const px = (x: number, y: number) => [x * 30, y * 40, (x + y) * 10, 200 + x];
    const strip = (y0: number, rows: number) => {
      const a = new Uint8ClampedArray(w * rows * 4);
      for (let y = 0; y < rows; y++) for (let x = 0; x < w; x++) a.set(px(x, y0 + y), (y * w + x) * 4);
      return a;
    };
    await enc.writeRows(strip(0, 2), 2);
    await enc.writeRows(strip(2, 3), 3);
    const blob = await enc.finish();
    const buf = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(buf.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const dv = new DataView(buf.buffer);
    expect(dv.getUint32(16)).toBe(w);
    expect(dv.getUint32(20)).toBe(h);
    // collect IDAT data, inflate and undo the Sub filter
    let off = 8;
    const idat: Uint8Array[] = [];
    while (off < buf.length) {
      const len = dv.getUint32(off);
      const type = String.fromCharCode(...buf.slice(off + 4, off + 8));
      if (type === 'IDAT') idat.push(buf.slice(off + 8, off + 8 + len));
      off += 12 + len;
    }
    const raw = inflateSync(Buffer.concat(idat.map((b) => Buffer.from(b))));
    expect(raw.length).toBe(h * (w * 4 + 1));
    for (let y = 0; y < h; y++) {
      const row = raw.subarray(y * (w * 4 + 1), (y + 1) * (w * 4 + 1));
      expect(row[0]).toBe(1);
      const out = new Uint8Array(w * 4);
      for (let i = 0; i < w * 4; i++) out[i] = (row[i + 1] + (i >= 4 ? out[i - 4] : 0)) & 0xff;
      for (let x = 0; x < w; x++) expect(Array.from(out.slice(x * 4, x * 4 + 4))).toEqual(px(x, y));
    }
  });

  it('rejects an incomplete image', async () => {
    const enc = new PngStreamEncoder(2, 2);
    await enc.writeRows(new Uint8ClampedArray(8), 1);
    await expect(enc.finish()).rejects.toThrow();
  });
});
