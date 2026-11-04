import { pixelize } from "./pixelize";
import Phaser from "phaser";

/**
 * Smooth look for textures still drawn as pixel art (props, trees, buildings, monsters…): when such a texture goes
 * to the GPU it is first enlarged 4x with the EPX / Scale2x rule (twice), which rounds stair-step edges into smooth
 * diagonals and curves, and then drawn with linear filtering. Frame coordinates stay the same, so nothing else changes.
 */
const MAX_AREA = 512 * 512; // bigger canvases (tilesets, baked chunks) are only filtered, not enlarged
const SKIP = /^(sg_|tiles_iso|__|hd_)/;

function scale2x(src: Uint32Array, w: number, h: number): Uint32Array {
  const out = new Uint32Array(w * h * 4), W = w * 2;
  for (let y = 0; y < h; y++) {
    const ym = y > 0 ? y - 1 : y, yp = y < h - 1 ? y + 1 : y;
    for (let x = 0; x < w; x++) {
      const xm = x > 0 ? x - 1 : x, xp = x < w - 1 ? x + 1 : x;
      const P = src[y * w + x], A = src[ym * w + x], B = src[y * w + xp], C = src[y * w + xm], D = src[yp * w + x];
      let e0 = P, e1 = P, e2 = P, e3 = P;
      if (A !== D && C !== B) {
        if (C === A) e0 = A;
        if (A === B) e1 = B;
        if (D === C) e2 = C;
        if (B === D) e3 = D;
      }
      const o = y * 2 * W + x * 2;
      out[o] = e0; out[o + 1] = e1; out[o + W] = e2; out[o + W + 1] = e3;
    }
  }
  return out;
}

/** World structures that get weathered (grime, streaks, muted colours) on top of the smoothing. */
const WEATHER = /^(house_|stall_|rw_|barn|stk_|bridge_|props$|bonfire|crop_)/;
const MAX_WEATHER_AREA = 2048 * 2048;

function hash2(x: number, y: number, s: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vn(x: number, y: number, s: number) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  let tx = x - x0, ty = y - y0;
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0, s), b = hash2(x0 + 1, y0, s), c = hash2(x0, y0 + 1, s), d = hash2(x0 + 1, y0 + 1, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/**
 * Weathering for buildings and props, in place on RGBA pixels of a w x h image whose design pixel is `u` px:
 * soft grime blotches, vertical rain streaks, fine grain, and colours pulled toward a muted, earthy tone.
 */
function weather(d: Uint8ClampedArray, w: number, h: number, u: number) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    if (!d[o + 3]) continue;
    const X = x / u, Y = y / u;
    const blot = vn(X / 9, Y / 9, 1) * 0.6 + vn(X / 3, Y / 3, 2) * 0.4;
    const streak = vn(X / 1.6, Y / 14, 3);
    const grain = hash2(x, y, 4);
    const k = 0.74 + 0.22 * blot - (streak > 0.68 ? (streak - 0.68) * 0.6 : 0) + (grain - 0.5) * 0.06;
    let r = d[o], g = d[o + 1], b = d[o + 2];
    const l = r * 0.3 + g * 0.55 + b * 0.15;
    // desaturate 30% and tint toward warm umber
    r = (r * 0.7 + l * 0.3) * 0.98 + 4; g = (g * 0.7 + l * 0.3) * 0.95 + 2; b = (b * 0.7 + l * 0.3) * 0.86;
    d[o] = r * k; d[o + 1] = g * k; d[o + 2] = b * k;
  }
}

/** A 4x smoothed (and, for structures, weathered) copy of a canvas or image. */
export function smoothCopy(img: HTMLCanvasElement | HTMLImageElement, key = ""): HTMLCanvasElement | undefined {
  const w = img.width, h = img.height;
  if (!w || !h) return;
  if (w * h > MAX_AREA) {
    // too big to enlarge: weather it at its own size
    if (!WEATHER.test(key) || w * h > MAX_WEATHER_AREA) return;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const cx = c.getContext("2d", { willReadFrequently: true })!;
    cx.drawImage(img, 0, 0);
    const id = cx.getImageData(0, 0, w, h);
    weather(id.data, w, h, 2);
    cx.putImageData(id, 0, 0);
    return c;
  }
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const cx = c.getContext("2d", { willReadFrequently: true })!;
  cx.drawImage(img, 0, 0);
  let px = new Uint32Array(cx.getImageData(0, 0, w, h).data.buffer);
  px = scale2x(px, w, h); // 2x: about the shared pixel grid's density (pixelgrid.ts), without rounding edges away
  const out = document.createElement("canvas");
  out.width = w * 2; out.height = h * 2;
  const data = new Uint8ClampedArray(px.buffer);
  if (WEATHER.test(key)) weather(data, w * 2, h * 2, 4);
  out.getContext("2d")!.putImageData(new ImageData(data, w * 2, h * 2), 0, 0);
  return out;
}

/** Hand-painted high-resolution sources by texture key (see hiResTexture): uploaded as they are, never enlarged. */
const HI = new Map<string, HTMLCanvasElement>();
if (import.meta.env?.DEV) (globalThis as any).__HI = HI; // dev: lets tools read the painted canvases

/**
 * A spritesheet texture of `frames` frames of w x h px (the size the game uses), painted `scale` times bigger with
 * smooth vector drawing: `draw` gets a context already scaled so it paints in w x h units, offset to frame f.
 */
/** Painted decor that gets the pixelize pass (see pixelize.ts). Already pixel-made art (bonfire, bridges, stalls) is left out. */
const PIXEL_STYLE = /^(up_|oak_|pine|bush|rw_|stk_|crop_)/;

export function hiResTexture(scene: Phaser.Scene, key: string, w: number, h: number, frames: number, scale: number, draw: (ctx: CanvasRenderingContext2D, f: number) => void) {
  if (scene.textures.exists(key)) return;
  const hi = document.createElement("canvas");
  hi.width = w * frames * scale; hi.height = h * scale;
  const ctx = hi.getContext("2d")!;
  for (let f = 0; f < frames; f++) {
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, f * w * scale, 0);
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    draw(ctx, f);
    ctx.restore();
    // decor in the bonfire's pixel style: flat dithered tones and a dark outline, one colour per art pixel
    if (PIXEL_STYLE.test(key)) pixelize(ctx, w * scale, h * scale, Math.max(1, Math.round(scale * 2 / 3)), { ox: f * w * scale, step: 12, outline: 0.55 });
  }
  HI.set(key, hi);
  const tex = scene.textures.createCanvas(key, w * frames, h)!;
  // the small canvas is what CPU-side code (pixel tests, minimap) sees
  tex.getContext().drawImage(hi, 0, 0, w * frames, h);
  for (let f = 0; f < frames; f++) tex.add(f, 0, f * w, 0, w, h);
  tex.refresh();
}

/** Forgets a hiResTexture's big canvas (call when its texture is removed). */
export const dropHiRes = (key: string) => HI.delete(key);

/** Replaces what the GPU shows for an already loaded texture with a hand-painted high-res canvas (same layout). */
export function overrideTexture(scene: Phaser.Scene, key: string, hi: HTMLCanvasElement) {
  HI.set(key, hi);
  const src = scene.textures.get(key).source[0] as any;
  if (src?.renderer?.gl && src.glTexture) src.renderer.updateCanvasTexture(hi, src.glTexture, src.flipY);
}

let installed = false;
/** Patches Phaser's texture upload so every eligible texture goes up smoothed. Call before the game starts. */
export function installSmoothTextures() {
  if (installed) return;
  installed = true;
  const TS = (Phaser.Textures as any).TextureSource.prototype;
  const eligible = (src: any) => {
    const key = src.texture?.key ?? "";
    if (HI.has(key)) return true;
    if (SKIP.test(key) || src.isRenderTexture || src.isVideo || src.isGLTexture || src.compressionAlgorithm) return false;
    if (!src.renderer?.gl) return false;
    // Already-detailed art (64px heroes, NPCs, gear) only needs filtering
    if (/^(knight|ninja|wizard|archer|barbarian|blacksmith|merchant|villager|guard|druid|witch|gear_|hero)/.test(key) && !src.isCanvas) return false;
    return src.image instanceof HTMLCanvasElement || src.image instanceof HTMLImageElement;
  };
  const init = TS.init;
  TS.init = function (game: Phaser.Game) {
    if (!eligible(this)) return init.call(this, game);
    const real = this.image, hi = HI.get(this.texture?.key) ?? smoothCopy(real, this.texture?.key);
    if (!hi) return init.call(this, game);
    // Upload the big copy: UVs are fractions of the (unchanged) logical width/height, so frames still line up
    const wasCanvas = this.isCanvas;
    this.image = hi; this.isCanvas = true;
    try { init.call(this, game); } finally { this.image = real; this.isCanvas = wasCanvas; }
    this.__smooth = true;
  };
  const update = TS.update;
  TS.update = function () {
    if (!this.__smooth || !this.renderer?.gl) return update.call(this);
    const hi = HI.get(this.texture?.key) ?? smoothCopy(this.image, this.texture?.key);
    if (hi) this.renderer.updateCanvasTexture(hi, this.glTexture, this.flipY);
  };
}
