import Phaser from "phaser";
import { TILE } from "../../shared/constants";

const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");

/** Draws the tileset procedurally (no image assets needed yet). Index order matches shared/map.ts T. */
export function makeTileset(scene: Phaser.Scene) {
  const n = 9;
  const tex = scene.textures.createCanvas("tiles", TILE * n, TILE)!;
  const ctx = tex.getContext();
  const px = (i: number, x: number, y: number, c: number) => { ctx.fillStyle = hex(c); ctx.fillRect(i * TILE + x, y, 1, 1); };
  const fill = (i: number, c: number) => { ctx.fillStyle = hex(c); ctx.fillRect(i * TILE, 0, TILE, TILE); };
  let s = 7;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const speckle = (i: number, c: number, count: number) => { for (let k = 0; k < count; k++) px(i, (r() * 16) | 0, (r() * 16) | 0, c); };

  fill(0, 0x4caf50); speckle(0, 0x3e8e41, 18); speckle(0, 0x66bb6a, 10);               // grass
  fill(1, 0xc8a165); speckle(1, 0xb08850, 20); speckle(1, 0xd9b77e, 10);               // road
  fill(2, 0xd8c3a5); for (let y = 0; y < 16; y += 4) { ctx.fillStyle = "#a89070"; ctx.fillRect(2 * TILE, y, 16, 1); }
  for (let y = 0; y < 16; y += 4) px(2, (y % 8 ? 4 : 12), y + 1, 0xa89070);           // wall (bricks)
  fill(3, 0xb23a48); for (let y = 0; y < 16; y += 3) { ctx.fillStyle = "#8c2a37"; ctx.fillRect(3 * TILE, y, 16, 1); } // roof
  fill(4, 0x2f80ed); speckle(4, 0x56a0ff, 12); speckle(4, 0x1c5fbf, 10);              // water
  fill(5, 0x4caf50); ctx.fillStyle = "#6d4c41"; ctx.fillRect(5 * TILE + 7, 10, 2, 6);  // tree
  ctx.fillStyle = "#1b5e20"; ctx.fillRect(5 * TILE + 2, 1, 12, 10); ctx.fillStyle = "#2e7d32"; ctx.fillRect(5 * TILE + 4, 2, 7, 6);
  fill(6, 0xd8c3a5); ctx.fillStyle = "#5d4037"; ctx.fillRect(6 * TILE + 4, 2, 8, 14); px(6, 10, 9, 0xffd54f); // door
  fill(7, 0x4caf50); speckle(7, 0x3e8e41, 14);                                        // flowers
  for (const [x, y, c] of [[4, 4, 0xff6b9d], [11, 6, 0xfff176], [6, 11, 0xffffff], [12, 12, 0xff6b9d]] as const) {
    px(7, x, y, c); px(7, x + 1, y, c); px(7, x, y + 1, c); px(7, x + 1, y + 1, 0xffeb3b);
  }
  fill(8, 0x9e9e9e); ctx.fillStyle = "#7d7d7d"; ctx.fillRect(8 * TILE, 0, 16, 1); ctx.fillRect(8 * TILE, 8, 16, 1);
  ctx.fillRect(8 * TILE, 0, 1, 8); ctx.fillRect(8 * TILE + 8, 8, 1, 8);               // plaza stones
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
