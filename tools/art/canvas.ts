import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

/** Minimal RGBA pixel canvas + PNG writer (no native deps). Colors are 0xRRGGBB, alpha separate. */
export class Canvas {
  data: Uint8Array;
  constructor(public w: number, public h: number) { this.data = new Uint8Array(w * h * 4); }

  inside(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  alpha(x: number, y: number) { return this.inside(x, y) ? this.data[(y * this.w + x) * 4 + 3] : 0; }
  get(x: number, y: number): [number, number] {
    const i = (y * this.w + x) * 4, d = this.data;
    return [(d[i] << 16) | (d[i + 1] << 8) | d[i + 2], d[i + 3]];
  }
  px(x: number, y: number, c: number, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (!this.inside(x, y)) return;
    const i = (y * this.w + x) * 4, d = this.data;
    if (a >= 255 || d[i + 3] === 0) {
      d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = a;
      return;
    }
    const t = a / 255;
    d[i] = d[i] * (1 - t) + ((c >> 16) & 255) * t;
    d[i + 1] = d[i + 1] * (1 - t) + ((c >> 8) & 255) * t;
    d[i + 2] = d[i + 2] * (1 - t) + (c & 255) * t;
    d[i + 3] = Math.max(d[i + 3], a);
  }
  /** Native-resolution pixel (same as px on a plain canvas; one fine pixel on a HiCanvas). */
  pxN(x: number, y: number, c: number, a = 255) { Canvas.prototype.px.call(this, x, y, c, a); }
  /** Logical scale: drawing coordinates are multiplied by k (1 on a plain canvas). */
  get k() { return 1; }
  clear(x: number, y: number) { if (this.inside(x, y)) this.data.fill(0, (y * this.w + x) * 4, (y * this.w + x) * 4 + 4); }
  rect(x: number, y: number, w: number, h: number, c: number, a = 255) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c, a);
  }
  /** Rect with a lit left/top edge and a shaded right/bottom edge. */
  box(x: number, y: number, w: number, h: number, c: number, opts: { top?: boolean } = {}) {
    this.rect(x, y, w, h, c);
    if (h > 1) this.rect(x, y + h - 1, w, 1, shade(c, 0.72));
    if (w > 2) { this.rect(x + w - 1, y, 1, h, shade(c, 0.72)); this.rect(x, y, 1, h - (h > 1 ? 1 : 0), shade(c, 1.22)); }
    if (opts.top && w > 2) this.rect(x + 1, y, w - 2, 1, shade(c, 1.22));
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number, a = 255) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number, a = 255) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / (rx + 0.5), ny = (y - cy) / (ry + 0.5);
        if (nx * nx + ny * ny <= 1) this.px(x, y, c, a);
      }
  }
  /** Draw rows of chars through a palette. '.' or unknown = skip. */
  sprite(x: number, y: number, rows: string[], pal: Record<string, number>, flip = false) {
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      const c = pal[ch];
      if (c !== undefined) this.px(x + (flip ? row.length - 1 - i : i), y + j, c);
    }));
  }
  /** Coloured outline: each edge pixel takes a deep, cool shade of the part it wraps ("selout"). */
  selout(base: number) {
    const marks: [number, number, number][] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.alpha(x, y) > 0) continue;
      let pick = -1;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) if (this.alpha(x + dx, y + dy) > 200) { pick = this.get(x + dx, y + dy)[0]; break; }
      if (pick >= 0) marks.push([x, y, pick]);
    }
    for (const [x, y, col] of marks) {
      const dk = shade(col, 0.32);
      const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
      const r = mix((base >> 16) & 255, (dk >> 16) & 255, 0.55), g = mix((base >> 8) & 255, (dk >> 8) & 255, 0.55), b = mix(base & 255, dk & 255, 0.55);
      this.px(x, y, (r << 16) | (g << 8) | b);
    }
  }
  /** Light from the top-left: brighten opaque pixels whose left or top neighbour is empty. */
  rim(f = 1.18) {
    const marks: [number, number, number][] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.alpha(x, y) < 200) continue;
      if (this.alpha(x - 1, y) === 0 || this.alpha(x, y - 1) === 0) marks.push([x, y, this.get(x, y)[0]]);
    }
    for (const [x, y, col] of marks) this.px(x, y, shade(col, f));
  }
  dot(x: number, y: number, c: number, a = 255) { this.px(x, y, c, a); }
  mirror() {
    const o = new Canvas(this.w, this.h);
    o.blit(this, 0, 0, (x, y) => [this.w - 1 - x, y]);
    this.data = o.data;
    return this;
  }
  /** Dark outline around every opaque pixel (4-neighbour). */
  outline(c: number, x0 = 0, y0 = 0, w = this.w, h = this.h) {
    const marks: [number, number][] = [];
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      if (this.alpha(x, y) > 0) continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx >= x0 && ny >= y0 && nx < x0 + w && ny < y0 + h && this.alpha(nx, ny) > 200;
      });
      if (n) marks.push([x, y]);
    }
    for (const [x, y] of marks) this.px(x, y, c);
  }
  /** Paint only into transparent pixels (used for ground shadows). */
  under(fn: (c: Canvas) => void) {
    const tmp = new Canvas(this.w, this.h);
    fn(tmp);
    for (let i = 0; i < this.data.length; i += 4) if (this.data[i + 3] === 0 && tmp.data[i + 3] > 0) this.data.set(tmp.data.subarray(i, i + 4), i);
  }
  blit(src: Canvas, dx: number, dy: number, transform?: (x: number, y: number) => [number, number]) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const [c, a] = src.get(x, y);
      if (!a) continue;
      const [tx, ty] = transform ? transform(x, y) : [x, y];
      this.px(dx + tx, dy + ty, c, a);
    }
  }
  /** Mix every opaque pixel toward a color (hit flash etc). */
  tint(c: number, t: number) {
    for (let i = 0; i < this.data.length; i += 4) {
      if (!this.data[i + 3]) continue;
      this.data[i] += (((c >> 16) & 255) - this.data[i]) * t;
      this.data[i + 1] += (((c >> 8) & 255) - this.data[i + 1]) * t;
      this.data[i + 2] += ((c & 255) - this.data[i + 2]) * t;
    }
  }
  save(path: string) { writeFileSync(path, encodePNG(this)); }
  scaled(k: number) {
    const o = new Canvas(this.w * k, this.h * k);
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
      const si = (((y / k) | 0) * this.w + ((x / k) | 0)) * 4;
      o.data.set(this.data.subarray(si, si + 4), (y * o.w + x) * 4);
    }
    return o;
  }
}

/** Same logical 32px drawing API, rendered k times finer: thin outlines, finer bevels, smoother curves. */
export class HiCanvas extends Canvas {
  nat = false;
  private _k: number;
  constructor(public lw: number, public lh: number, k: number) { super(lw * k, lh * k); this._k = k; }
  get k() { return this._k; }
  private n(f: () => void) { const o = this.nat; this.nat = true; f(); this.nat = o; }
  px(x: number, y: number, c: number, a = 255) {
    if (this.nat) return super.px(x, y, c, a);
    x = Math.round(x); y = Math.round(y);
    this.n(() => { for (let j = 0; j < this.k; j++) for (let i = 0; i < this.k; i++) super.px(x * this.k + i, y * this.k + j, c, a); });
  }
  clear(x: number, y: number) { for (let j = 0; j < this.k; j++) for (let i = 0; i < this.k; i++) super.clear(x * this.k + i, y * this.k + j); }
  private nrect(x: number, y: number, w: number, h: number, c: number, a = 255) { this.n(() => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) super.px(x + i, y + j, c, a); }); }
  box(x: number, y: number, w: number, h: number, c: number, opts: { top?: boolean } = {}) {
    const k = this.k, X = Math.round(x) * k, Y = Math.round(y) * k, W = w * k, H = h * k;
    this.nrect(X, Y, W, H, c);
    // soft two-step shading: 1 native px edge plus a faint inner band
    if (h > 1) { this.nrect(X, Y + H - 1, W, 1, shade(c, 0.7)); this.nrect(X, Y + H - 2, W, 1, shade(c, 0.86)); }
    if (w > 2) {
      this.nrect(X + W - 1, Y, 1, H, shade(c, 0.7)); this.nrect(X + W - 2, Y, 1, H - 1, shade(c, 0.86));
      this.nrect(X, Y, 1, H - 1, shade(c, 1.22)); this.nrect(X + 1, Y + 1, 1, H - 3, shade(c, 1.08));
    }
    if (opts.top && w > 2) this.nrect(X + 1, Y, W - 2, 1, shade(c, 1.22));
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number, a = 255) {
    const k = this.k, o = (k - 1) / 2;
    let X0 = Math.round(x0 * k + o), Y0 = Math.round(y0 * k + o);
    const X1 = Math.round(x1 * k + o), Y1 = Math.round(y1 * k + o);
    const dx = Math.abs(X1 - X0), dy = -Math.abs(Y1 - Y0), sx = X0 < X1 ? 1 : -1, sy = Y0 < Y1 ? 1 : -1;
    let err = dx + dy;
    this.n(() => {
      for (;;) {
        for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) if (i + j < k + (k > 2 ? 1 : 0)) super.px(X0 + i - (k >> 1) + 1, Y0 + j - (k >> 1) + 1, c, a);
        if (X0 === X1 && Y0 === Y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; X0 += sx; }
        if (e2 <= dx) { err += dx; Y0 += sy; }
      }
    });
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number, a = 255) {
    const k = this.k, CX = cx * k + (k - 1) / 2, CY = cy * k + (k - 1) / 2, RX = (rx + 0.5) * k - 0.5, RY = (ry + 0.5) * k - 0.5;
    this.n(() => {
      for (let y = Math.floor(CY - RY); y <= Math.ceil(CY + RY); y++)
        for (let x = Math.floor(CX - RX); x <= Math.ceil(CX + RX); x++) {
          const nx = (x - CX) / (RX + 0.5), ny = (y - CY) / (RY + 0.5);
          if (nx * nx + ny * ny <= 1) super.px(x, y, c, a);
        }
    });
  }
  /** Offsets are logical (scaled by k); a transform works on native pixel coordinates. */
  blit(src: Canvas, dx: number, dy: number, transform?: (x: number, y: number) => [number, number]) {
    if (this.nat) return super.blit(src, dx, dy, transform);
    this.n(() => super.blit(src, Math.round(dx * this.k), Math.round(dy * this.k), transform));
  }
  /** A single fine pixel at a logical (fractional) position: thin effects such as arcs and sparks. */
  dot(x: number, y: number, c: number, a = 255) { this.pxN(Math.floor(x * this.k + 0.5 * (this.k - 1) + 0.5), Math.floor(y * this.k + 0.5 * (this.k - 1) + 0.5), c, a); }
  /**
   * Scale2x-style rounding for k=2: every logical cell still drawn as a flat 2x2 block gets its
   * staircase corners filled from matching neighbours, so blocky diagonals and silhouettes become smooth.
   */
  smooth() {
    if (this.k !== 2) return;
    const W = this.lw, H = this.lh, src = this.data.slice();
    const key = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return 0;
      const i = (y * 2 * this.w + x * 2) * 4, j = i + 4, r = i + this.w * 4, q = r + 4;
      for (let o = 0; o < 4; o++) if (src[i + o] !== src[j + o] || src[i + o] !== src[r + o] || src[i + o] !== src[q + o]) return -1;
      return src[i + 3] === 0 ? 0 : ((src[i] << 16) | (src[i + 1] << 8) | src[i + 2]) * 256 + src[i + 3];
    };
    const put = (x: number, y: number, kk: number, ox: number, oy: number) => {
      const i = ((y * 2 + oy) * this.w + x * 2 + ox) * 4;
      if (kk === 0) { this.data.fill(0, i, i + 4); return; }
      const c = Math.floor(kk / 256);
      this.data[i] = (c >> 16) & 255; this.data[i + 1] = (c >> 8) & 255; this.data[i + 2] = c & 255; this.data[i + 3] = kk % 256;
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const E = key(x, y);
      if (E < 0) continue;
      const A = key(x, y - 1), B = key(x + 1, y), C = key(x - 1, y), D = key(x, y + 1);
      if (A < 0 || B < 0 || C < 0 || D < 0 || A === D || B === C) continue;
      if (C === A && C !== E) put(x, y, A, 0, 0);
      if (A === B && A !== E) put(x, y, B, 1, 0);
      if (C === D && C !== E) put(x, y, C, 0, 1);
      if (D === B && D !== E) put(x, y, B, 1, 1);
    }
  }
  selout(b: number) { this.n(() => super.selout(b)); }
  rim(f?: number) { this.n(() => super.rim(f)); }
  outline(c: number) { this.n(() => super.outline(c)); }
  under(fn: (c: Canvas) => void) {
    const tmp = new HiCanvas(this.lw, this.lh, this.k);
    fn(tmp);
    for (let i = 0; i < this.data.length; i += 4) if (this.data[i + 3] === 0 && tmp.data[i + 3] > 0) this.data.set(tmp.data.subarray(i, i + 4), i);
  }
}

/** Darken/lighten with hue shifting: shadows drift toward cool blue-violet, highlights toward warm yellow. */
export function shade(c: number, f: number) {
  let r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn;
  let h = 0;
  if (dd) h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
  h *= 60; if (h < 0) h += 360;
  let sat = mx ? dd / mx : 0, v = mx;
  const toward = (target: number, amt: number) => { let diff = ((target - h + 540) % 360) - 180; h = (h + Math.sign(diff) * Math.min(Math.abs(diff), amt) + 360) % 360; };
  if (sat > 0.08) {
    if (f < 1) { toward(250, (1 - f) * 45); sat = Math.min(1, sat * (1 + (1 - f) * 0.35)); }
    else if (f > 1) { toward(55, (f - 1) * 60); sat = sat * (1 - (f - 1) * 0.25); }
  }
  v = Math.min(1, v * f);
  const C = v * sat, X = C * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - C;
  [r, g, b] = h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X];
  const ch = (x: number) => Math.max(0, Math.min(255, Math.round((x + m) * 255)));
  return (ch(r) << 16) | (ch(g) << 8) | ch(b);
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf: Uint8Array) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Uint8Array) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
export function encodePNG(c: Canvas) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.w, 0); ihdr.writeUInt32BE(c.h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((c.w * 4 + 1) * c.h);
  for (let y = 0; y < c.h; y++) Buffer.from(c.data.subarray(y * c.w * 4, (y + 1) * c.w * 4)).copy(raw, y * (c.w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", new Uint8Array())]);
}
