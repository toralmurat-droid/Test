import Phaser from "phaser";
import { cliffTexture } from "./desertArt";
import { GATE_H, GATE_OX, GATE_OY, GATE_W, GRANITE, MOSS, hash, mix, paintBarrow, paintBirch, paintBones, paintGate, paintGorse, paintStone, tone, vn, type Bmp, type Sprite } from "./moorsPaint";
import { hiCanvas, hiResTexture } from "./smooth";

/**
 * Phaser textures for the Grey Barrow Moors (shared/moors.ts). The painting itself is in moorsPaint.ts (plain pixel
 * buffers, so the preview script can run it in node); this file turns the results into textures and recolours the
 * desert's sandstone cliffs into grey granite. Keys start with "mo_".
 *
 * Hooks (other files): iso.ts isoMoors places the barrows, standing stones, bone piles, birches and cliffs;
 * waygate.ts uses moorgateTexture for the "moorsgate" and "moors" gates; ambient.ts can use gorseTexture for BUSH
 * tiles in the moors rows.
 */
const SCALE = 3;
const canvasOf = (b: Bmp) => {
  const c = document.createElement("canvas");
  c.width = b.w; c.height = b.h;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(b.d), b.w, b.h), 0, 0);
  return c;
};
/** Registers a painted sprite as a texture and returns its key. */
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

/** A mound run `n` tiles long; the origin is the first tile's centre. `mouth` = tile index of the stone door, -1 for none. */
export const barrowTexture = (scene: Phaser.Scene, n: number, mouth: number, seed: number) => cached(scene, `mo_barrow_${n}_${mouth}_${seed}`, () => paintBarrow(n, mouth, seed));
export const standingStoneTexture = (scene: Phaser.Scene, kind: number, seed: number) => cached(scene, `mo_stone_${kind}_${seed}`, () => paintStone(kind, seed));
export const boneHeapTexture = (scene: Phaser.Scene, seed: number) => cached(scene, `mo_bones_${seed}`, () => paintBones(seed));
export const birchTexture = (scene: Phaser.Scene, kind: number, seed: number) => cached(scene, `mo_birch_${kind}_${seed}`, () => paintBirch(kind, seed));
/** Gorse for BUSH tiles in the moors (bottom-centre origin: use origin(s)). */
export const gorseTexture = (scene: Phaser.Scene, seed: number) => cached(scene, `mo_gorse_${seed}`, () => paintGorse(seed));

/** The moorgate: side "forest" (Oakvale's end) or "moors". Awake = 8 animated frames. Feet at (GATE_OX, GATE_OY). */
export const MOORGATE_FRAMES = 8;
export function moorgateTexture(scene: Phaser.Scene, side: "forest" | "moors", awake: boolean) {
  const key = `mo_gate_${side}_${awake ? 1 : 0}`, N = awake ? MOORGATE_FRAMES : 1;
  hiResTexture(scene, key, GATE_W, GATE_H, N, 3, (c, f) => { c.imageSmoothingEnabled = false; c.drawImage(canvasOf(paintGate(side, awake, f, MOORGATE_FRAMES)), 0, 0, GATE_W, GATE_H); });
  return { key, ox: GATE_OX / GATE_W, oy: GATE_OY / GATE_H };
}

/** The desert's sandstone cliff block `h` px tall, recoloured to weathered grey granite with lichen on the tops. */
export function graniteCliffTexture(scene: Phaser.Scene, h: number, faces: number, v: number): string {
  const src = cliffTexture(scene, h, faces, v), key = `mo_${src}`;
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
    const q = Math.max(0, Math.min(1, l)) * (GRANITE.length - 1), q0 = Math.min(GRANITE.length - 2, Math.floor(q));
    let c = mix(GRANITE[q0], GRANITE[q0 + 1], q - q0);
    const gx = Math.floor(px / sc), gy = Math.floor(py / sc);
    if (l > 0.5 && vn(gx * 0.2 + v * 9, gy * 0.25, 33) > 0.58 + (hash(gx, gy, 5) - 0.5) * 0.2) c = tone(MOSS, 0.3 + l * 0.5, gx, gy);
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  oc.putImageData(img, 0, 0);
  hiResTexture(scene, key, w, hh, 1, sc, (c) => { c.imageSmoothingEnabled = false; c.drawImage(out, 0, 0, w, hh); });
  return key;
}
