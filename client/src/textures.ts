import Phaser from "phaser";
import { TILE } from "../../shared/constants";
import { TILE_COUNT } from "../../shared/map";
import { ROWS, drawTileset } from "./tileset";

const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");

/** Registers the procedural tileset (see tileset.ts) as a Phaser texture. */
export function makeTileset(scene: Phaser.Scene) {
  const tex = scene.textures.createCanvas("tiles", TILE * TILE_COUNT, TILE * ROWS)!;
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
