import Phaser from "phaser";

/**
 * Smooth look for textures still drawn as pixel art (props, trees, buildings, monsters…): when such a texture goes
 * to the GPU it is first enlarged 4x with the EPX / Scale2x rule (twice), which rounds stair-step edges into smooth
 * diagonals and curves, and then drawn with linear filtering. Frame coordinates stay the same, so nothing else changes.
 */
const MAX_AREA = 512 * 512; // bigger canvases (tilesets, baked chunks) are only filtered, not enlarged
const SKIP = /^(sg_|tiles_iso|__)/;

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

/** A 4x smoothed copy of a canvas or image. */
export function smoothCopy(img: HTMLCanvasElement | HTMLImageElement): HTMLCanvasElement | undefined {
  const w = img.width, h = img.height;
  if (!w || !h || w * h > MAX_AREA) return;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const cx = c.getContext("2d", { willReadFrequently: true })!;
  cx.drawImage(img, 0, 0);
  let px = new Uint32Array(cx.getImageData(0, 0, w, h).data.buffer);
  px = scale2x(px, w, h);
  px = scale2x(px, w * 2, h * 2);
  const out = document.createElement("canvas");
  out.width = w * 4; out.height = h * 4;
  out.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(px.buffer), w * 4, h * 4), 0, 0);
  return out;
}

/** Hand-painted high-resolution sources by texture key (see hiResTexture): uploaded as they are, never enlarged. */
const HI = new Map<string, HTMLCanvasElement>();

/**
 * A spritesheet texture of `frames` frames of w x h px (the size the game uses), painted `scale` times bigger with
 * smooth vector drawing: `draw` gets a context already scaled so it paints in w x h units, offset to frame f.
 */
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
  }
  HI.set(key, hi);
  const tex = scene.textures.createCanvas(key, w * frames, h)!;
  // the small canvas is what CPU-side code (pixel tests, minimap) sees
  tex.getContext().drawImage(hi, 0, 0, w * frames, h);
  for (let f = 0; f < frames; f++) tex.add(f, 0, f * w, 0, w, h);
  tex.refresh();
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
    const real = this.image, hi = HI.get(this.texture?.key) ?? smoothCopy(real);
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
    const hi = HI.get(this.texture?.key) ?? smoothCopy(this.image);
    if (hi) this.renderer.updateCanvasTexture(hi, this.glTexture, this.flipY);
  };
}
