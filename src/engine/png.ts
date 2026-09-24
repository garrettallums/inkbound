/**
 * Streaming PNG encoder. Rows are filtered (Sub) and deflated incrementally via
 * CompressionStream, so exports far larger than any single canvas the browser
 * allows can be produced strip-by-strip without exhausting memory (spec §57).
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(parts: Uint8Array[]): number {
  let c = 0xffffffff;
  for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC_TABLE[(c ^ p[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  const t = new Uint8Array([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)]);
  out.set(t, 4);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32([t, data]));
  return out;
}

export function pngStreamSupported() {
  return typeof CompressionStream !== 'undefined';
}

export class PngStreamEncoder {
  private writer: WritableStreamDefaultWriter<BufferSource>;
  private compressed: Uint8Array[] = [];
  private reading: Promise<void>;
  private rowsWritten = 0;

  constructor(readonly width: number, readonly height: number) {
    const cs = new CompressionStream('deflate');
    this.writer = cs.writable.getWriter();
    const reader = cs.readable.getReader();
    this.reading = (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        this.compressed.push(value);
      }
    })();
  }

  /** Append RGBA rows (length = rows × width × 4). */
  async writeRows(rgba: Uint8ClampedArray, rows: number) {
    const w = this.width;
    const stride = w * 4;
    const buf = new Uint8Array(rows * (stride + 1));
    for (let y = 0; y < rows; y++) {
      const o = y * (stride + 1);
      buf[o] = 1; // Sub filter
      const r = y * stride;
      for (let i = 0; i < 4 && i < stride; i++) buf[o + 1 + i] = rgba[r + i];
      for (let i = 4; i < stride; i++) buf[o + 1 + i] = (rgba[r + i] - rgba[r + i - 4]) & 0xff;
    }
    this.rowsWritten += rows;
    await this.writer.write(buf);
  }

  async finish(): Promise<Blob> {
    if (this.rowsWritten !== this.height) throw new Error(`PNG encoder expected ${this.height} rows, got ${this.rowsWritten}`);
    await this.writer.close();
    await this.reading;
    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, this.width);
    dv.setUint32(4, this.height);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const parts: BlobPart[] = [sig, chunk('IHDR', ihdr)];
    // group compressed output into ~1 MB IDAT chunks
    let pending: Uint8Array[] = [];
    let size = 0;
    const flush = () => {
      if (!size) return;
      const data = new Uint8Array(size);
      let o = 0;
      for (const p of pending) { data.set(p, o); o += p.length; }
      parts.push(chunk('IDAT', data));
      pending = [];
      size = 0;
    };
    for (const c of this.compressed) {
      pending.push(c);
      size += c.length;
      if (size > 1 << 20) flush();
    }
    flush();
    parts.push(chunk('IEND', new Uint8Array(0)));
    return new Blob(parts, { type: 'image/png' });
  }
}
