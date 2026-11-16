import Phaser from "phaser";
import { cliffTexture } from "./desertArt";
import { BRAZIER_FRAMES, crownCliffPixel, GATE_H, GATE_OX, GATE_OY, GATE_W, paintBrazier, paintCrownGate, paintSpire, paintStatue, type CrownFrom } from "./crownPaint";
import type { Bmp, Sprite } from "./moorsPaint";
import { hiCanvas, hiResTexture } from "./smooth";

/**
 * Phaser textures for the Crown of the Marches (shared/crown.ts). The painting is in crownPaint.ts (plain pixel buffers, so
 * the preview script runs in node); this file turns the results into textures and recolours the desert's sandstone cliffs
 * into pale granite. Keys start with "cr_".
 *
 * Hooks (other files): iso.ts places the statues (STATUE), spires (SPIRE), braziers (BRAZIER, animated: see
 * `brazierTexture`) and pale granite cliffs (CLIFF in the band, `crownCliffTexture`); waygate.ts uses `crownGateTexture`
 * for the ten crown_* / crownway_* gates; the ground painter calls `paintCrownGround` / `crownCliffTopPixel` from crownPaint.ts.
 */
const SCALE = 3;
const canvasOf = (b: Bmp) => {
  const c = document.createElement("canvas");
  c.width = b.w; c.height = b.h;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(b.d), b.w, b.h), 0, 0);
  return c;
};
function sprite(scene: Phaser.Scene, key: string, make: () => Sprite): Sprite & { key: string } {
  const s = make();
  if (!scene.textures.exists(key)) hiResTexture(scene, key, s.b.w, s.b.h, 1, SCALE, (c) => { c.imageSmoothingEnabled = false; c.drawImage(canvasOf(s.b), 0, 0, s.b.w, s.b.h); });
  return { ...s, key };
}
const memo = new Map<string, Sprite & { key: string }>();
const cached = (scene: Phaser.Scene, key: string, make: () => Sprite) => {
  let r = memo.get(key);
  if (!r || !scene.textures.exists(key)) { r = sprite(scene, key, make); memo.set(key, r); }
  return r;
};
/** Phaser origin of a sprite texture whose (ox, oy) is the point to stand on the tile centre. */
export const origin = (s: Sprite) => ({ x: s.ox / s.b.w, y: s.oy / s.b.h });

/** A broken statue for a STATUE tile (origin = tile centre, use origin(s)); `v` 0-3 picks the look (king, headless knight, toppled torso, stump). */
export const statueTexture = (scene: Phaser.Scene, v: number) => cached(scene, `cr_statue_${v}`, () => paintStatue(v));
/** A snapped spire for a SPIRE tile (origin = tile centre); `v` 0-3. */
export const spireTexture = (scene: Phaser.Scene, v: number) => cached(scene, `cr_spire_${v}`, () => paintSpire(v));

/**
 * A lit brazier for a BRAZIER tile: BRAZIER_FRAMES frames in one texture (frame 0..N-1, a seamless loop, play at ~8 fps like
 * the gates), `v` 0-1 only changes the weeds. Returns the key, the origin and the size of one frame.
 */
export { BRAZIER_FRAMES };
export function brazierTexture(scene: Phaser.Scene, v: number) {
  const key = `cr_brazier_${v}`, p = paintBrazier(v, 0, BRAZIER_FRAMES);
  hiResTexture(scene, key, p.b.w, p.b.h, BRAZIER_FRAMES, SCALE, (c, f) => { c.imageSmoothingEnabled = false; c.drawImage(canvasOf(paintBrazier(v, f, BRAZIER_FRAMES).b), 0, 0, p.b.w, p.b.h); });
  return { key, frames: BRAZIER_FRAMES, ...origin(p), w: p.b.w, h: p.b.h };
}

/** A Crownway gate: `side` "crown" (the Crown's rim) or "home" (the homeland's dais). Awake = CROWNGATE_FRAMES animated frames. Feet at (ox, oy) of the frame. */
export const CROWNGATE_FRAMES = 8;
export function crownGateTexture(scene: Phaser.Scene, from: CrownFrom, side: "crown" | "home", awake: boolean) {
  const key = `cr_gate_${from}_${side}_${awake ? 1 : 0}`, N = awake ? CROWNGATE_FRAMES : 1;
  hiResTexture(scene, key, GATE_W, GATE_H, N, 3, (c, f) => { c.imageSmoothingEnabled = false; c.drawImage(canvasOf(paintCrownGate(from, side, awake, f, CROWNGATE_FRAMES)), 0, 0, GATE_W, GATE_H); });
  return { key, ox: GATE_OX / GATE_W, oy: GATE_OY / GATE_H };
}

/** The desert's sandstone cliff block `h` px tall, recoloured to pale granite (weathered courses, rust-gold stains, a little growth on top). */
export function crownCliffTexture(scene: Phaser.Scene, h: number, faces: number, v: number): string {
  const src = cliffTexture(scene, h, faces, v), key = `cr_${src}`;
  if (scene.textures.exists(key)) return key;
  const hi = hiCanvas(src);
  if (!hi) return src;
  const sc = hi.width / 64, w = 64, hh = hi.height / sc;
  const out = document.createElement("canvas");
  out.width = hi.width; out.height = hi.height;
  const oc = out.getContext("2d")!, img = hi.getContext("2d")!.getImageData(0, 0, hi.width, hi.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const px = (i / 4) % hi.width, py = Math.floor(i / 4 / hi.width), l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11 - 30) / 190;
    const c = crownCliffPixel(l, Math.floor(px / sc), Math.floor(py / sc), v);
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  oc.putImageData(img, 0, 0);
  hiResTexture(scene, key, w, hh, 1, sc, (c) => { c.imageSmoothingEnabled = false; c.drawImage(out, 0, 0, w, hh); });
  return key;
}
