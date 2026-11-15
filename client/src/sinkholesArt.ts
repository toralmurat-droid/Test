import Phaser from "phaser";
import { cliffTexture } from "./desertArt";
import { GATE_H, GATE_OX, GATE_OY, GATE_W, loamCliffPixel, paintBurrow, paintCaveMouth, paintFern, paintPit, paintSinkway, paintWillow } from "./sinkholesPaint";
import type { Bmp, Sprite } from "./moorsPaint";
import { hiCanvas, hiResTexture } from "./smooth";

/**
 * Phaser textures for the Mawdeep Sinkholes (shared/sinkholes.ts). The painting is in sinkholesPaint.ts (plain pixel
 * buffers, so the preview script runs in node); this file turns the results into textures and recolours the desert's
 * sandstone cliffs into damp loam. Keys start with "sk_".
 *
 * Hooks (other files): iso.ts places the pits (PIT), burrows (BURROW), cave mouths (CAVE), willows (TREE), ferns
 * (BUSH) and loam cliffs (CLIFF); waygate.ts uses sinkwayTexture for the "sinkway" gate.
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

/** A sinkhole for a PIT tile, sunk into its tile (origin = tile centre, use origin(s)): `flooded` a green cenote, else a black drop; `v` the shape and how overgrown. */
export const pitTexture = (scene: Phaser.Scene, flooded: boolean, v: number) => cached(scene, `sk_pit_${flooded ? 1 : 0}_${v}`, () => paintPit(flooded, v));
/** A Hide-Kin burrow mound for a BURROW tile (origin = tile centre). */
export const burrowTexture = (scene: Phaser.Scene, v: number) => cached(scene, `sk_burrow_${v}`, () => paintBurrow(v));
/** A cave mouth for a CAVE tile: a whole loam cliff block with the opening in its south-west face (origin = tile centre on the ground plane). */
export const caveMouthTexture = (scene: Phaser.Scene, v: number) => cached(scene, `sk_cave_${v}`, () => paintCaveMouth(v));
/** Ambient undergrowth for BUSH tiles (origin = tile centre): kind 0 fern clump, 1 tall bracken, 2 toadstools in moss. */
export const fernTexture = (scene: Phaser.Scene, kind: number, seed: number) => cached(scene, `sk_fern_${kind}_${seed}`, () => paintFern(kind, seed));
/** A weeping willow for TREE tiles in the band (origin = tile centre, at the trunk's foot). */
export const willowTexture = (scene: Phaser.Scene, seed: number) => cached(scene, `sk_willow_${seed}`, () => paintWillow(seed));

/** The Sinkway gate: side "coast" (a collapsed sinkhole in the dunes) or "sinkholes" (a cave mouth). Awake = 8 animated frames. Feet at (ox, oy) of the frame. */
export const SINKWAY_FRAMES = 8;
export function sinkwayTexture(scene: Phaser.Scene, side: "coast" | "sinkholes", awake: boolean) {
  const key = `sk_gate_${side}_${awake ? 1 : 0}`, N = awake ? SINKWAY_FRAMES : 1;
  hiResTexture(scene, key, GATE_W, GATE_H, N, 3, (c, f) => { c.imageSmoothingEnabled = false; c.drawImage(canvasOf(paintSinkway(side, awake, f, SINKWAY_FRAMES)), 0, 0, GATE_W, GATE_H); });
  return { key, ox: GATE_OX / GATE_W, oy: GATE_OY / GATE_H };
}

/** The desert's sandstone cliff block `h` px tall, recoloured to damp brown loam (earthen courses, wet streaks, moss and turf on top). */
export function sinkCliffTexture(scene: Phaser.Scene, h: number, faces: number, v: number): string {
  const src = cliffTexture(scene, h, faces, v), key = `sk_${src}`;
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
    const c = loamCliffPixel(l, Math.floor(px / sc), Math.floor(py / sc), v);
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  oc.putImageData(img, 0, 0);
  hiResTexture(scene, key, w, hh, 1, sc, (c) => { c.imageSmoothingEnabled = false; c.drawImage(out, 0, 0, w, hh); });
  return key;
}
