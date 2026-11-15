import Phaser from "phaser";
import { cliffTexture } from "./desertArt";
import { GATE_H, GATE_OX, GATE_OY, GATE_W, paintArch, paintBoulder, paintBones, paintCactus, paintRedGate, paintScrub, paintSnag, redCliffPixel } from "./badlandsPaint";
import type { Bmp, Sprite } from "./moorsPaint";
import { hiCanvas, hiResTexture } from "./smooth";

/**
 * Phaser textures for the Red Badlands (shared/badlands.ts). The painting is in badlandsPaint.ts (plain pixel buffers,
 * so the preview script runs in node); this file turns the results into textures and recolours the desert's sandstone
 * cliffs into layered red mesa rock. Keys start with "bl_".
 *
 * Hooks (other files): iso.ts isoBadlands places the arches, boulders, bone heaps, snags, cacti and cliffs; ambient.ts
 * can use scrubTexture for BUSH tiles in the badlands rows; waygate.ts uses redPassTexture for the "redpass" and
 * "badlands" gates.
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

/** The natural arch for legs `span` tiles apart, drawn once from the left leg's tile centre (use origin(s)). */
export const archTexture = (scene: Phaser.Scene, span: number, seed: number) => cached(scene, `bl_arch_${span}_${seed}`, () => paintArch(span, seed));
export const boulderTexture = (scene: Phaser.Scene, seed: number) => cached(scene, `bl_boulder_${seed}`, () => paintBoulder(seed));
export const bleachedBonesTexture = (scene: Phaser.Scene, seed: number) => cached(scene, `bl_bones_${seed}`, () => paintBones(seed));
/** Dead mesquite for STUMP tiles: kind 0/1 a forked snag, 2 a broken stump. */
export const snagTexture = (scene: Phaser.Scene, kind: number, seed: number) => cached(scene, `bl_snag_${kind}_${seed}`, () => paintSnag(kind, seed));
/** Cacti: kind 0 two-armed saguaro, 1 one-armed, 2 prickly pear. */
export const cactusTexture = (scene: Phaser.Scene, kind: number, seed: number) => cached(scene, `bl_cactus_${kind}_${seed}`, () => paintCactus(kind, seed));
/** Dry scrub for BUSH tiles in the badlands (bottom-centre origin: use origin(s)): kind 0 thorn bush, 1 tumbleweed. */
export const scrubTexture = (scene: Phaser.Scene, kind: number, seed: number) => cached(scene, `bl_scrub_${kind}_${seed}`, () => paintScrub(kind, seed));

/** The Red Pass gate: side "forest" (Act 1's end) or "badlands" (under the arch). Awake = 8 animated frames. Feet at (ox, oy) of the frame. */
export const REDPASS_FRAMES = 8;
export function redPassTexture(scene: Phaser.Scene, side: "forest" | "badlands", awake: boolean) {
  const key = `bl_gate_${side}_${awake ? 1 : 0}`, N = awake ? REDPASS_FRAMES : 1;
  hiResTexture(scene, key, GATE_W, GATE_H, N, 3, (c, f) => { c.imageSmoothingEnabled = false; c.drawImage(canvasOf(paintRedGate(side, awake, f, REDPASS_FRAMES)), 0, 0, GATE_W, GATE_H); });
  return { key, ox: GATE_OX / GATE_W, oy: GATE_OY / GATE_H };
}

/** The desert's sandstone cliff block `h` px tall, recoloured to layered red mesa rock (strata of orange, maroon and tan). */
export function redCliffTexture(scene: Phaser.Scene, h: number, faces: number, v: number): string {
  const src = cliffTexture(scene, h, faces, v), key = `bl_${src}`;
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
    const c = redCliffPixel(l, Math.floor(px / sc), Math.floor(py / sc), v);
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  oc.putImageData(img, 0, 0);
  hiResTexture(scene, key, w, hh, 1, sc, (c) => { c.imageSmoothingEnabled = false; c.drawImage(out, 0, 0, w, hh); });
  return key;
}
