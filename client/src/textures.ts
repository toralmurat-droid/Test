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
  return drawSheet(scene, `persona_${color}`, FRAMES, {
    H: 0x4e342e, K: 0xf2c79b, E: 0x1a1a1a, S: color, B: shade(color, 0.5), P: 0x2c3e70, D: 0x1a1a1a,
  });
}

/**
 * Hero sprite by class. Placeholder palettes on the persona frames; the art thread can swap in real
 * 32x32 sheets here as long as the frame layout stays: 0-1 down, 2-3 up, 4-5 right (flipped for left).
 */
export function heroTexture(scene: Phaser.Scene, cls: string, color: number): string {
  const pal: Record<string, Record<string, number>> = {
    knight: { H: 0xb0b8c4, K: 0xf2c79b, E: 0x1a1a1a, S: 0x9aa4b2, B: color, P: 0x5a6270, D: 0x2a2a2a },
    ninja: { H: 0x1c1c24, K: 0xf2c79b, E: 0x1a1a1a, S: 0x2a2a36, B: color, P: 0x1c1c24, D: 0x111111 },
    wizard: { H: color, K: 0xf2c79b, E: 0x1a1a1a, S: shade(color, 0.8), B: 0xffd54f, P: shade(color, 0.6), D: 0x3e2723 },
  };
  return drawSheet(scene, `hero_${cls}_${color}`, FRAMES, pal[cls] ?? pal.knight);
}

// Ground items, 8x8. C coin, c coin shade, R potion red, r highlight, G glass, W cork
const ITEM_ART: Record<string, { rows: string[]; pal: Record<string, number> }> = {
  gold: { rows: ["..CCCC..", ".CCrrCC.", "CCrCCcCC", "CCCCCcCC", "CCCCCcCC", "CCCcccCC", ".CCCCCC.", "..CCCC.."],
    pal: { C: 0xffc93c, c: 0xd99a1e, r: 0xfff3b0 } },
  potion: { rows: ["...WW...", "...GG...", "..GRRG..", ".GRrRRG.", ".GRRRRG.", ".GRRRRG.", "..GGGG..", "........"],
    pal: { W: 0x8d6e63, G: 0xcfe8ff, R: 0xe63946, r: 0xffb3b3 } },
};

/** Ground item texture by `Item.kind` (single frame). */
export function itemTexture(scene: Phaser.Scene, kind: string): string {
  const key = `item_${kind}`;
  if (scene.textures.exists(key)) return key;
  const art = ITEM_ART[kind] ?? ITEM_ART.gold;
  const tex = scene.textures.createCanvas(key, 8, 8)!;
  const ctx = tex.getContext();
  art.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const c = art.pal[ch];
    if (c === undefined) return;
    ctx.fillStyle = hex(c);
    ctx.fillRect(x, y, 1, 1);
  }));
  tex.refresh();
  return key;
}

// Slime: frames alternate normal / squished (6 frames so it shares the persona frame layout)
const SLIME_A = [..."............|............|............|............|............|............|.....GG.....|...GGGGGG...|..GLLGGGGG..|.GLLGGGGGGG.|.GGGEGGEGGG.|.GGGGGGGGGG.|GGGGGGGGGGGG|GGGGGGGGGGGG|.DDDDDDDDDD.|............".split("|")];
const SLIME_B = [..."............|............|............|............|............|............|............|....GGGG....|..GGGGGGGG..|.GLLGGGGGGG.|GLLGEGGEGGGG|GGGGGGGGGGGG|GGGGGGGGGGGG|GGGGGGGGGGGG|DDDDDDDDDDDD|............".split("|")];

/** Monster sprite sheets, same 6-frame layout as personas. */
export function mobTexture(scene: Phaser.Scene, kind: string): string {
  if (kind === "slime") {
    return drawSheet(scene, "mob_slime", [SLIME_A, SLIME_B, SLIME_A, SLIME_B, SLIME_A, SLIME_B], {
      G: 0x7bd36b, L: 0xc8f5b8, E: 0x14301a, D: 0x3f8a3a,
    });
  }
  return drawSheet(scene, "mob_skeleton", FRAMES, {
    H: 0xe8e6d6, K: 0xe8e6d6, E: 0x111111, S: 0x4a4a52, B: 0x2a2a2a, P: 0xd2d0c0, D: 0x9a988a,
  });
}

function drawSheet(scene: Phaser.Scene, key: string, frames: string[][], pal: Record<string, number>): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, PW * frames.length, PH)!;
  const ctx = tex.getContext();
  frames.forEach((rows, f) => {
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
