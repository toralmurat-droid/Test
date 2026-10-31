import Phaser from "phaser";
import { TILE } from "../../shared/constants";
import { TILE_COUNT } from "../../shared/map";
import { drawTileset } from "./tileset";

const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");

/** Registers the procedural tileset (see tileset.ts) as a Phaser texture. */
export function makeTileset(scene: Phaser.Scene) {
  const tex = scene.textures.createCanvas("tiles", TILE * TILE_COUNT, TILE)!;
  drawTileset(tex.getContext());
  tex.refresh();
}

// 12x16 persona frames. H hair, K skin, E eye, S shirt, B belt, P pants, D shoes, A arm(skin)
const HEAD_FRONT = ["....HHHH....", "...HHHHHH...", "...HKKKKH...", "...KEKKEK...", "...KKKKKK...", "....KKKK...."];
const HEAD_BACK = ["....HHHH....", "...HHHHHH...", "...HHHHHH...", "...HHHHHH...", "...HHHHHH...", "....KKKK...."];
const HEAD_SIDE = ["....HHHH....", "...HHHHHH...", "...HHHKKK...", "...HHKKEK...", "....KKKKK...", "....KKKK...."];
const BODY_FRONT = ["..SSSSSSSS..", ".KSSSSSSSSK.", ".KSSSSSSSSK.", "..SSSSSSSS..", "..BBBBBBBB.."];
const BODY_SIDE = ["...SSSSSS...", "...SSSSSS...", "...SKKSSS...", "...SSSSSS...", "...BBBBBB..."];
const LEGS_A = ["...PPPPPP...", "...PP..PP...", "...PP..PP...", "...DD..DD...", "............"];
const LEGS_B = ["...PPPPPP...", "..PP....PP..", "..PP....PP..", "..DD....DD..", "............"];
const LEGS_SIDE_A = ["....PPPP....", "....PPPP....", "....PP.PP...", "....DD.DD...", "............"];
const LEGS_SIDE_B = ["....PPPP....", "...PP..PP...", "..PP....PP..", "..DD....DD..", "............"];

const FRAMES = [
  [...HEAD_FRONT, ...BODY_FRONT, ...LEGS_A], [...HEAD_FRONT, ...BODY_FRONT, ...LEGS_B], // 0,1 down
  [...HEAD_BACK, ...BODY_FRONT, ...LEGS_A], [...HEAD_BACK, ...BODY_FRONT, ...LEGS_B],   // 2,3 up
  [...HEAD_SIDE, ...BODY_SIDE, ...LEGS_SIDE_A], [...HEAD_SIDE, ...BODY_SIDE, ...LEGS_SIDE_B], // 4,5 right (flip for left)
];
export const PW = 12, PH = 16;

function shade(c: number, f: number) {
  const r = Math.min(255, ((c >> 16) & 255) * f) | 0, g = Math.min(255, ((c >> 8) & 255) * f) | 0, b = Math.min(255, (c & 255) * f) | 0;
  return (r << 16) | (g << 8) | b;
}

/** Builds (once per color) a 6-frame persona sprite sheet tinted by shirt color. */
export function personaTexture(scene: Phaser.Scene, color: number): string {
  const key = `persona_${color}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, PW * FRAMES.length, PH)!;
  const ctx = tex.getContext();
  const pal: Record<string, number> = {
    H: 0x4e342e, K: 0xf2c79b, E: 0x1a1a1a, S: color, B: shade(color, 0.5), P: 0x2c3e70, D: 0x1a1a1a,
  };
  FRAMES.forEach((rows, f) => {
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      const c = pal[ch];
      if (c === undefined) return;
      ctx.fillStyle = hex(c);
      ctx.fillRect(f * PW + x, y, 1, 1);
    }));
    tex.add(f, 0, f * PW, 0, PW, PH);
  });
  tex.refresh();
  return key;
}
