import Phaser from "phaser";
import { FORGE_PALETTES, type PaletteKey } from "../../shared/forge";
import { baseId, parseForgedGearId } from "../../shared/gear";
import { forgedMobOf, forgedOf, noteForged } from "./forgePack";

/**
 * The Forge's art (cosmetic only): a forged monster or weapon wears its base's art recoloured with a palette from
 * FORGE_PALETTES (a closed list). The recolour finds the sprite's main colour (its dominant hue, or its greys when it
 * has none), maps those pixels onto the palette ramp keeping their luminance, and leaves eyes, outlines and trim alone.
 * Textures are made on first sight, in slices of idle time, and kept. Nothing here is sent to the server.
 */

/** The art id of an item: a forged weapon wears its base weapon's art (and gets the palette on top). */
export const artId = (id: string): string => parseForgedGearId(id)?.base ?? baseId(id);

type Rgb = [number, number, number];
const rgbOf = (n: number): Rgb => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lumOf = (c: Rgb) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;

/** The ramp of a palette: dark to light, from the darker of its two colours to the lighter, with a shade and a glint at the ends. */
function ramp(key: PaletteKey): Rgb[] {
  const p = FORGE_PALETTES[key], a = rgbOf(p.color), b = rgbOf(p.accent);
  const [lo, hi] = lumOf(a) <= lumOf(b) ? [a, b] : [b, a];
  return [mix(lo, [8, 8, 12], 0.55), lo, mix(lo, hi, 0.55), mix(hi, [255, 255, 255], 0.35)];
}
function rampAt(r: Rgb[], t: number): Rgb {
  const x = Math.min(0.999, Math.max(0, t)) * (r.length - 1), i = Math.floor(x);
  return mix(r[i], r[i + 1], x - i);
}

interface Band { mode: "hue" | "grey"; hue: number; mean: number }
/** Which pixels are "the body": the dominant hue's band, or (a bone-white or grey sprite) its low-saturation pixels. */
function analyse(d: Uint8ClampedArray): Band {
  const bins = new Float64Array(36);
  let opaque = 0, sat = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    opaque++;
    const [h, s, l] = hsl(d[i], d[i + 1], d[i + 2]);
    if (s > 0.25 && l > 0.1) { sat++; bins[Math.floor(h / 10) % 36] += s; }
  }
  let best = 0;
  for (let b = 1; b < 36; b++) if (bins[b] > bins[best]) best = b;
  const mode = opaque && sat / opaque >= 0.25 ? "hue" : "grey";
  const band: Band = { mode, hue: best * 10 + 5, mean: 0.5 };
  let n = 0, sum = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 128 && inBand(band, d[i], d[i + 1], d[i + 2])) { sum += lumOf([d[i], d[i + 1], d[i + 2]]); n++; }
  band.mean = n ? sum / n : 0.5;
  return band;
}
function hsl(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const s = mx ? (mx - mn) / mx : 0;
  let h = 0;
  if (mx !== mn) {
    const d = mx - mn;
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, s, l];
}
function inBand(band: Band, r: number, g: number, b: number): boolean {
  const [h, s, l] = hsl(r, g, b);
  if (band.mode === "grey") return s < 0.25 && l > 0.12 && l < 0.97;
  const dh = Math.abs(((h - band.hue + 540) % 360) - 180);
  return s > 0.2 && l > 0.08 && dh <= 45;
}

/** Remaps the pixels of d[from, to) (in place). */
function remap(d: Uint8ClampedArray, band: Band, r: Rgb[], from: number, to: number) {
  for (let i = from; i < to; i += 4) {
    if (d[i + 3] < 128 || !inBand(band, d[i], d[i + 1], d[i + 2])) continue;
    const t = 0.5 + (lumOf([d[i], d[i + 1], d[i + 2]]) - band.mean) * 1.6;
    const c = rampAt(r, t);
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
}

const idle = (f: () => void) => ((window as any).requestIdleCallback ? (window as any).requestIdleCallback(f, { timeout: 200 }) : setTimeout(f, 16));
const SLICE = 120_000 * 4; // bytes of pixel data per slice

/** Recolours a canvas copy of `src` (same size) and calls done(canvas): chunked in idle time unless `sync`. */
function recolour(src: CanvasImageSource, w: number, h: number, pal: PaletteKey, done: (c: HTMLCanvasElement) => void, sync = false) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, w, h), band = analyse(img.data), r = ramp(pal);
  let at = 0;
  const step = () => {
    const to = sync ? img.data.length : Math.min(img.data.length, at + SLICE);
    remap(img.data, band, r, at, to);
    at = to;
    if (at < img.data.length) return idle(step);
    ctx.putImageData(img, 0, 0);
    done(c);
  };
  step();
}

const building = new Set<string>();
/** Adds `canvas` as texture `key` with the frames of texture `from` (names and rectangles). */
function addLike(scene: Phaser.Scene, key: string, from: Phaser.Textures.Texture, canvas: HTMLCanvasElement) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.addCanvas(key, canvas);
  if (!tex) return;
  for (const n of from.getFrameNames()) { const f = from.get(n); tex.add(n, 0, f.cutX, f.cutY, f.cutWidth, f.cutHeight); }
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/**
 * The texture a forged monster ("fm3") wears in place of `srcKey` (its base's current sheet): the recoloured copy once
 * it is ready, else `srcKey` itself (and the copy is started). Frames and size are the source's, so it is a drop-in.
 */
export function forgedMobTexture(scene: Phaser.Scene, srcKey: string, forgeId: string): string {
  const f = forgedMobOf(forgeId);
  if (!f) { noteForged(forgeId); return srcKey; }
  const key = `${srcKey}__${forgeId}`;
  if (scene.textures.exists(key)) return key;
  if (!building.has(key) && scene.textures.exists(srcKey)) {
    building.add(key);
    const tex = scene.textures.get(srcKey), img = tex.getSourceImage() as HTMLCanvasElement | HTMLImageElement;
    recolour(img, img.width, img.height, f.palette, (c) => { addLike(scene, key, tex, c); building.delete(key); });
  }
  return srcKey;
}

/**
 * The hero overlay of a forged weapon: a recoloured copy of the base weapon's sheet `baseKey` as `key`. True when it is
 * there; false while it is being made (call again).
 */
export function forgedGearSheet(scene: Phaser.Scene, baseKey: string, key: string, id: string): boolean {
  if (scene.textures.exists(key)) return true;
  const f = forgedOf(id);
  if (!f || f.kind !== "weapon") { noteForged(id); return false; }
  if (!building.has(key) && scene.textures.exists(baseKey)) {
    building.add(key);
    const tex = scene.textures.get(baseKey), img = tex.getSourceImage() as HTMLCanvasElement | HTMLImageElement;
    recolour(img, img.width, img.height, f.palette, (c) => { addLike(scene, key, tex, c); building.delete(key); });
  }
  return false;
}

/** The recoloured icon of a forged weapon, drawn into `ctx` at the given size from the atlas frame; false when it is not a known forging. */
export function drawForgedIcon(scene: Phaser.Scene, ctx: CanvasRenderingContext2D, id: string, size: number, atlasScale: number): boolean {
  const f = forgedOf(id);
  noteForged(id);
  if (!f || f.kind !== "weapon" || !scene.textures.exists("gear_icons")) return false;
  const fr = scene.textures.getFrame("gear_icons", artId(id));
  if (!fr) return false;
  const src = document.createElement("canvas");
  src.width = fr.cutWidth; src.height = fr.cutHeight;
  src.getContext("2d")!.drawImage(fr.source.image as CanvasImageSource, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, 0, 0, fr.cutWidth, fr.cutHeight);
  recolour(src, src.width, src.height, f.palette, (c) => { ctx.drawImage(c, 0, 0, fr.cutWidth, fr.cutHeight, 0, 0, fr.cutWidth * atlasScale, fr.cutHeight * atlasScale); }, true);
  return true;
}

/** A texture key for a dropped forged weapon's icon (a small canvas texture, made once); undefined for any other id. */
export function forgedIconTexture(scene: Phaser.Scene, id: string): string | undefined {
  const f = forgedOf(id);
  noteForged(id);
  if (!f || f.kind !== "weapon" || !scene.textures.exists("gear_icons")) return undefined;
  const key = `gear_icon_${baseId(id)}`;
  if (scene.textures.exists(key)) return key;
  const fr = scene.textures.getFrame("gear_icons", artId(id));
  if (!fr) return undefined;
  const src = document.createElement("canvas");
  src.width = fr.cutWidth; src.height = fr.cutHeight;
  src.getContext("2d")!.drawImage(fr.source.image as CanvasImageSource, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, 0, 0, fr.cutWidth, fr.cutHeight);
  recolour(src, src.width, src.height, f.palette, (c) => { scene.textures.addCanvas(key, c)?.setFilter(Phaser.Textures.FilterMode.NEAREST); }, true);
  return key;
}
