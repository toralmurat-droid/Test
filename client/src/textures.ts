import Phaser from "phaser";
import { BEAST_KINDS, DESERT_KINDS, TILE } from "../../shared/constants";
import { RAIDERS } from "../../shared/raiders";
import { AFFIX_KEYS, AFFIXES, CHAMP_WEAPON_SHEETS as CHAMP_SHEETS } from "../../shared/champions";
import { TILE_COUNT } from "../../shared/map";
import { troopLook } from "../../shared/war/patrols";
import { parseTroop } from "../../shared/war/troops";
import { COMMON_ROWS, ROWS, drawTileset } from "./tileset";
import { SMOOTH } from "./isoflag";
import { hiResTexture } from "./smooth";

const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");

/** Registers the procedural tileset (see tileset.ts) as a Phaser texture. */
export function makeTileset(scene: Phaser.Scene) {
  const rows = SMOOTH ? COMMON_ROWS : ROWS; // smooth iso never reads the palisade and signpost rows (see COMMON_ROWS)
  const tex = scene.textures.createCanvas("tiles", TILE * TILE_COUNT, TILE * rows)!;
  drawTileset(tex.getContext(), rows);
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

// Bandit: persona frames with a hood and a red bandana over the mouth
const BANDIT_FRAMES = FRAMES.map((f) => f.map((row, y) => (y === 4 ? row.replace(/K/g, "M") : row)));

/**
 * Skeleton casters (14x20): a hooded skull on the persona frames, a long robe instead of legs and a staff with a glowing orb.
 * C hood, K bone, E glowing eyes, R robe, T trim, D feet, W staff, O orb, N horns (necromancer).
 */
export const CASTER_W = 14, CASTER_H = 20;
const MAGE_HAT = ["......C.......", "......CC......", ".....CCCC.....", "....CCCCCC...."];
const NECRO_HAT = ["..N........N..", "..NN......NN..", "...NNCCCCNN...", "....CCCCCC...."];
function casterFrames(hat: string[]): string[][] {
  const robeFront = ["..RRRRRRRR..", "..RRRRRRRR..", ".RRRRRRRRRR.", ".RTTTTTTTTR."];
  const robeSide = ["...RRRRRR...", "...RRRRRR...", "..RRRRRRRR..", "..RTTTTTTR.."];
  return FRAMES.map((f, i) => {
    const side = i >= 4, step = i % 2 === 1;
    const head = f.slice(0, 6).map((r) => r.replace(/H/g, "C"));
    const body = f.slice(6, 11).map((r) => r.replace(/S/g, "R").replace(/B/g, "T"));
    const feet = side ? (step ? "..DD....DD.." : "...DD..DD...") : (step ? "...DD..DD..." : "..DD....DD..");
    const rows = [...head, ...body, ...(side ? robeSide : robeFront), feet].map((r) => "." + r + ".");
    // Staff in the free hand: orb on top, shaft down to the ground
    const sx = side ? 11 : 12;
    const out = [...hat, ...rows].map((r) => [...r]);
    for (let y = 5; y < CASTER_H; y++) out[y][sx] = y < 7 ? "O" : "W";
    out[4][sx] = "o";
    return out.map((r) => r.join(""));
  });
}
const MAGE_FRAMES = casterFrames(MAGE_HAT), NECRO_FRAMES = casterFrames(NECRO_HAT);

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
  // Mana potion (shared/mana.ts): same flask, deep blue
  mpotion: { rows: ["...WW...", "...GG...", "..GRRG..", ".GRrRRG.", ".GRRRRG.", ".GRRRRG.", "..GGGG..", "........"],
    pal: { W: 0x8d6e63, G: 0xcfe8ff, R: 0x2f6bff, r: 0xa9c8ff } },
  // Bigger flasks (shared/potions.ts sizes): Medium is a round flask, Greater a wide one with a gold band
  potion1: { rows: ["...WW...", "...GG...", ".GRRRRG.", "GRrRRRRG", "GRRRRRRG", "GRRRRRRG", ".GRRRRG.", "..GGGG.."],
    pal: { W: 0x8d6e63, G: 0xcfe8ff, R: 0xe63946, r: 0xffb3b3 } },
  potion2: { rows: ["..YWWY..", "...GG...", ".GRRRRG.", "GRrrRRRG", "GRrRRRRG", "GRRRRRRG", "YGRRRRGY", ".YGGGGY."],
    pal: { W: 0x8d6e63, G: 0xcfe8ff, R: 0xc1121f, r: 0xffb3b3, Y: 0xffc93c } },
  mpotion1: { rows: ["...WW...", "...GG...", ".GRRRRG.", "GRrRRRRG", "GRRRRRRG", "GRRRRRRG", ".GRRRRG.", "..GGGG.."],
    pal: { W: 0x8d6e63, G: 0xcfe8ff, R: 0x2f6bff, r: 0xa9c8ff } },
  mpotion2: { rows: ["..YWWY..", "...GG...", ".GRRRRG.", "GRrrRRRG", "GRrRRRRG", "GRRRRRRG", "YGRRRRGY", ".YGGGGY."],
    pal: { W: 0x8d6e63, G: 0xcfe8ff, R: 0x1f4fd0, r: 0xa9c8ff, Y: 0xffc93c } },
  // Quest drops (shared/quests.ts QUEST_ITEMS)
  q_jelly: { rows: ["........", "...GG...", "..GLGG..", ".GLGGGG.", ".GGGGGD.", "GGGGGGDD", ".GGDDDD.", "........"],
    pal: { G: 0x7bd36b, L: 0xd6ffcc, D: 0x3f9a3a } },
  q_core: { rows: ["...KK...", "..KSSK..", ".KSLSSK.", "KSLSSRSK", "KSSSRRSK", ".KSRRSK.", "..KSSK..", "...KK..."],
    pal: { K: 0x1a1420, S: 0x8a94a3, L: 0xd8e0ea, R: 0xd62839 } },
  q_rot: { rows: ["........", "....G...", "...GP...", "..PPPP..", ".PPLPPP.", ".PPPPPD.", "..PPDD..", "...DD..."],
    pal: { G: 0x6fbf3a, P: 0x4a2f6b, L: 0x8e6bbf, D: 0x2a1a3d } },
  q_cod: { rows: ["........", "........", ".T..SSS.", "TTSSLSSE", ".TSSSSSS", "TTSDDDS.", ".T......", "........"],
    pal: { T: 0x8a6a3a, S: 0xc9b48a, L: 0xf2ead2, D: 0x8f7a52, E: 0x2a2018 } },
  q_venom: { rows: ["....K...", "...KGK..", "..KGLGK.", ".KGLGGGK", ".KGGGGDK", ".KGGGDDK", "..KDDDK.", "...KK..."],
    pal: { K: 0x1a2410, G: 0x8fd13a, L: 0xe4ff9a, D: 0x4c7a1c } },
  q_cinder: { rows: ["...KK...", "..KRYK..", ".KRYWYK.", "KRRYYRRK", "KDRRRRDK", ".KDRRDK.", "..KDDK..", "...KK..."],
    pal: { K: 0x1a0e0a, R: 0xe0521e, Y: 0xffb347, W: 0xfff2b0, D: 0x7a2412 } },
  q_stormglass: { rows: ["....K...", "...KLK..", "..KLBVK.", ".KLBBVK.", ".KBWBVVK", "..KBBVK.", "..KVVK..", "...KK..."],
    pal: { K: 0x14122a, L: 0xe8f4ff, B: 0x8fb8ff, W: 0xffffff, V: 0x6a4fd8 } },  // Act 2 (the Second Sun)
  q_veil: { rows: ["..KKKK..", ".KIIIIK.", "KIIYYIIK", "KIYWWYIK", "KIIYYIIK", ".KIIIIK.", "..KIIK..", "...KK..."],
    pal: { K: 0x14102a, I: 0x3a2e6a, Y: 0xd8a040, W: 0xfff0b0 } },
  q_letter: { rows: ["........", "KKKKKKKK", "KPPPPPPK", "KPKPPKPK", "KPPKKPPK", "KPPRRPPK", "KKKRRKKK", "........"],
    pal: { K: 0x4a3a28, P: 0xf0e2c4, R: 0xb0201e } },
  q_brand: { rows: ["...K....", "..KYK...", ".KYWYK..", "KYWOWYK.", ".KYWYK..", "..KYKK..", "....KBK.", ".....KBK"],
    pal: { K: 0x3a2410, Y: 0xd8a040, W: 0xfff0b0, O: 0xff6a1e, B: 0x6a4a2a } },
  q_key: { rows: ["..KKK...", ".KYOYK..", ".KOWOK..", ".KYOYK..", "..KYK...", "..KYKK..", "..KYYK..", "..KYKK.."],
    pal: { K: 0x3a2410, Y: 0xd8a040, O: 0xff8a2a, W: 0xfff0b0 } },
};

/** Texture kind of a potion flask by size: "potion", "potion1", "potion2" (and "mpotion"...). */
export const potionTex = (kind: string, size: number) => (size > 0 ? `${kind}${size}` : kind);

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

/**
 * Round blob frame (w x h px): a dome with a highlight, two eyes and a dark rim at the base.
 * `squish` flattens/widens it for the bounce frame; `buds` adds little bloblings growing inside (Mother Blob).
 */
function blobFrame(w: number, h: number, bodyH: number, squish: boolean, buds: boolean, tiara = buds): string[] {
  const rows: string[][] = Array.from({ length: h }, () => Array(w).fill("."));
  const bh = squish ? Math.round(bodyH * 0.86) : bodyH;
  const rx = (squish ? w / 2 : w / 2 - 1) - 0.01, ry = bh - 0.5;
  const cx = (w - 1) / 2, base = h - 2; // bottom row of the body
  for (let y = base - bh + 1; y <= base; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / rx, dy = (y - base) / ry; // dome: half ellipse sitting on the base row
      if (dx * dx + dy * dy <= 1 && y >= 0) rows[y][x] = "G";
    }
  }
  for (let x = 0; x < w; x++) if (rows[base][x] === "G") rows[base + 1][x] = "D";
  const top = base - bh + 1;
  const put = (x: number, y: number, c: string) => { if (rows[y]?.[x] === "G") rows[y][x] = c; };
  // highlight on the upper left
  const hl = Math.max(1, Math.round(w / 8));
  for (let i = 0; i < hl; i++) for (let j = 0; j < hl + 1; j++) put(Math.round(cx - rx * 0.5) + j - i, top + 2 + i, "L");
  // eyes
  const ey = top + Math.round(bh * 0.45), gap = Math.max(1, Math.round(w / 6));
  const eh = w >= 20 ? 2 : 1;
  for (let k = 0; k < eh; k++) { put(Math.floor(cx) - gap, ey + k, "E"); put(Math.ceil(cx) + gap, ey + k, "E"); }
  if (w >= 20) { put(Math.floor(cx) - gap, ey, "W"); put(Math.ceil(cx) + gap, ey, "W"); }
  if (buds) {
    // three babies floating inside her belly
    for (const [bx, by] of [[cx - rx * 0.55, base - 2], [cx + rx * 0.5, base - 3], [cx + 0.5, base - 1]]) {
      const x0 = Math.round(bx), y0 = Math.round(by);
      for (const [ox, oy] of [[0, 0], [1, 0], [0, -1], [1, -1], [-1, 0], [2, 0]]) put(x0 + ox, y0 + oy, "B");
      put(x0, y0 - 1, "b");
    }
  }
  // dark outline so blobs read against the grass
  const filled = rows.map((r) => r.map((c) => c !== "."));
  const isBody = (x: number, y: number) => !!filled[y]?.[x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rows[y][x] !== "G") continue;
    if (!isBody(x - 1, y) || !isBody(x + 1, y) || !isBody(x, y - 1)) rows[y][x] = "O";
  }
  if (tiara) {
    // little gold tiara: she's the mother
    const tx = Math.round(cx), ty = top;
    for (const [ox, oy, c] of [[-3, 0, "Y"], [-2, 0, "Y"], [-1, 0, "Y"], [0, 0, "Y"], [1, 0, "Y"], [2, 0, "Y"], [-3, -1, "Y"], [0, -1, "R"], [2, -1, "Y"], [0, -2, "Y"]] as [number, number, string][]) {
      if (rows[ty + oy]) rows[ty + oy][tx + ox] = c;
    }
  }
  return rows.map((r) => r.join(""));
}

/** A plain blob with something extra drawn on top: a spout (shooter), a helmet (warrior) or a halo and cross (healer). */
function blobVariant(w: number, h: number, bodyH: number, squish: boolean, kind: "shooter" | "warrior" | "healer"): string[] {
  const rows = blobFrame(w, h, bodyH, squish, false).map((r) => [...r]);
  const top = rows.findIndex((r) => r.some((c) => c !== "."));
  const base = h - 2, cx = Math.floor((w - 1) / 2);
  const body = (x: number, y: number) => rows[y]?.[x] !== undefined && rows[y][x] !== ".";
  const set = (x: number, y: number, c: string) => { if (rows[y]?.[x] !== undefined) rows[y][x] = c; };
  if (kind === "shooter") {
    // stubby spout on the head, with a dark mouth
    for (let y = top - 3; y < top + 1; y++) { set(cx, y, "N"); set(cx + 1, y, "N"); }
    set(cx - 1, top - 3, "N"); set(cx + 2, top - 3, "N"); set(cx, top - 3, "n"); set(cx + 1, top - 3, "n");
  } else if (kind === "warrior") {
    // steel helmet over the top of the dome, with a red crest and angry brows
    for (let y = top; y < top + 3; y++) for (let x = 0; x < w; x++) if (body(x, y)) set(x, y, y === top + 2 ? "h" : "H");
    for (const x of [cx - 1, cx, cx + 1, cx + 2]) set(x, top - 1, "R");
    set(cx, top - 2, "R"); set(cx + 1, top - 2, "R");
    const ey = rows.findIndex((r) => r.includes("E"));
    if (ey > 0) rows[ey].forEach((c, x) => { if (c === "E") set(x + (x < cx ? -1 : 1), ey - 1, "E"); });
  } else {
    // golden halo floating above, green cross on the belly
    for (let x = cx - 2; x <= cx + 3; x++) set(x, top - 3, "Y");
    set(cx - 3, top - 2, "Y"); set(cx + 4, top - 2, "Y");
    const by = base - 2;
    for (const [ox, oy] of [[0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [2, 0], [0, 1], [1, 1]]) if (body(cx + ox, by + oy)) set(cx + ox, by + oy, "X");
  }
  return rows.map((r) => r.join(""));
}
const VAR_W = 14, VAR_H = 17;
const SHOOTER_A = blobVariant(VAR_W, VAR_H, 10, false, "shooter"), SHOOTER_B = blobVariant(VAR_W, VAR_H, 10, true, "shooter");
const WARRIOR_A = blobVariant(16, 18, 12, false, "warrior"), WARRIOR_B = blobVariant(16, 18, 12, true, "warrior");
const HEALER_A = blobVariant(VAR_W, VAR_H, 10, false, "healer"), HEALER_B = blobVariant(VAR_W, VAR_H, 10, true, "healer");

const MOTHER_W = 24, MOTHER_H = 22, BLOBLING_W = 8, BLOBLING_H = 9;
const MOTHER_A = blobFrame(MOTHER_W, MOTHER_H, 17, false, true), MOTHER_B = blobFrame(MOTHER_W, MOTHER_H, 17, true, true);

/**
 * Mother Blob by tier (shared MOTHER.tier): 2 = Lv 5+, iron crown and a leather belt with a gold buckle;
 * 3 = Lv 10+, big jewelled crown, riveted steel plate round her middle and spikes on her back.
 */
function motherFrame(tier: 2 | 3, squish: boolean): string[] {
  const rows = blobFrame(MOTHER_W, MOTHER_H, 17, squish, true, false).map((r) => [...r]);
  const top = rows.findIndex((r) => r.some((c) => c !== "."));
  const base = MOTHER_H - 2, cx = Math.floor((MOTHER_W - 1) / 2);
  const body = (x: number, y: number) => rows[y]?.[x] !== undefined && rows[y][x] !== ".";
  const set = (x: number, y: number, c: string) => { if (rows[y]?.[x] !== undefined) rows[y][x] = c; };
  if (tier === 2) {
    // iron crown: a band with three points
    for (let x = cx - 3; x <= cx + 4; x++) { set(x, top, "I"); set(x, top - 1, "I"); }
    for (const x of [cx - 3, cx + 0.5, cx + 4]) set(Math.round(x), top - 2, "I");
    set(cx, top - 1, "i"); set(cx + 1, top - 1, "i");
    // leather belt with a buckle
    const by = base - 6;
    for (let x = 0; x < MOTHER_W; x++) if (body(x, by)) { set(x, by, "T"); if (body(x, by + 1)) set(x, by + 1, "T"); }
    for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(cx + ox, by + oy, "Y");
  } else {
    // big gold crown with red jewels
    for (let x = cx - 5; x <= cx + 6; x++) { set(x, top, "Y"); set(x, top - 1, "Y"); }
    for (const x of [cx - 5, cx - 2, cx + 1, cx + 3, cx + 6]) { set(x, top - 2, "Y"); set(x, top - 3, "Y"); }
    for (const x of [cx - 3, cx + 1, cx + 5]) set(x, top - 1, "R");
    // steel plate round her middle, with rivets
    for (let y = base - 7; y <= base - 4; y++) for (let x = 0; x < MOTHER_W; x++) if (body(x, y)) set(x, y, y === base - 7 ? "s" : "S");
    for (let x = 2; x < MOTHER_W - 2; x += 3) if (body(x, base - 5)) set(x, base - 5, "r");
    // spikes along her back
    for (const dx of [-8, -6, 7, 9]) { const x = cx + dx; const y = rows.findIndex((r) => r[x] !== "."); if (y > 0) { set(x, y - 1, "S"); set(x, y - 2, "s"); } }
  }
  return rows.map((r) => r.join(""));
}
const MOTHER2_A = motherFrame(2, false), MOTHER2_B = motherFrame(2, true);
const MOTHER3_A = motherFrame(3, false), MOTHER3_B = motherFrame(3, true);
const BLOBLING_A = blobFrame(BLOBLING_W, BLOBLING_H, 6, false, false), BLOBLING_B = blobFrame(BLOBLING_W, BLOBLING_H, 6, true, false);

/** Crawling skeleton: only this top fraction of the skeleton frame is drawn, resting on the ground. */
export const CRAWL_CROP = 0.6;
/** Per-kind size info for the scene: head height (labels/bubbles) and HP bar width. */
export const MOB_LOOK: Record<string, { top: number; bar: number; oy: number; scale?: number }> = {
  skeletonmage: { top: 19, bar: 12, oy: 0.975 },
  necromancer: { top: 32, bar: 24, oy: 0.975, scale: 1.6 }, // elite: drawn big
  demon: { top: 32, bar: 26, oy: 0.975, scale: 1.7 },
  banditchief: { top: 34, bar: 28, oy: 0.85, scale: 1.6 }, // boss of Redfang Hollow
  hollowking: { top: 40, bar: 34, oy: 0.975, scale: 2 }, // the first zone's final boss
  sunwright: { top: 40, bar: 34, oy: 0.975, scale: 2 }, // Act 2's final boss
  motherblob: { top: 20, bar: 22, oy: 0.92 },
  blobling: { top: 8, bar: 8, oy: 0.9 },
  shooterblob: { top: 15, bar: 12, oy: 0.92 },
  warriorblob: { top: 16, bar: 14, oy: 0.92 },
  healerblob: { top: 15, bar: 12, oy: 0.92 },
  venomblob: { top: 15, bar: 12, oy: 0.92 }, frostblob: { top: 17, bar: 14, oy: 0.92 }, fireblob: { top: 17, bar: 14, oy: 0.92 }, stormblob: { top: 16, bar: 12, oy: 0.92 },
  crawler: { top: 10, bar: 10, oy: CRAWL_CROP },
  nightraider: { top: 30, bar: 22, oy: 0.95, scale: 1.5 }, // pixel look: a big bandit stands in for the rider
  wisp: { top: 12, bar: 10, oy: 1.4, scale: 0.55 }, // pixel look: a small elemental blob floating (no pixel wisp sheet)
};
/** Pixel look: the Summoner's wisps borrow the elemental blob of their element (Mob.weapon). Painted: mob_wisp_<element>. */
const WISP_STANDIN: Record<string, string> = { fire: "fireblob", cold: "frostblob", poison: "venomblob", shock: "stormblob" };

const PAINTED_MOBS = ["slime", "blobling", "shooterblob", "warriorblob", "healerblob", "motherblob", "venomblob", "frostblob", "fireblob", "stormblob", "skeleton", "bandit", "skeletonmage", "necromancer", "demon", "crawler", "banditchief", "hollowking", "gnawkin", "tuskborn", "silkwretch", "duskwing", "packlord", "hornbrute", "hidemother", "crowseer", "gnasher", "weaver",
  "nomad", "scorpion", "sanddead", "veiled", "camelfolk", "sphinx", "sunwright", "nightraider",
  "golem_fire", "golem_cold", "golem_poison", "golem_shock", "golem_colossus", "bride"];
/** The Colossus is painted once per element (Mob.weapon holds it, shared/summons.ts). */
const COLOSSUS_ELEMENTS = ["fire", "cold", "poison", "shock"];
/** The wisps' painted sheets (tools/art/paint/wisps.ts), one per element. */
const WISP_ELEMENTS = COLOSSUS_ELEMENTS;
/** Beast-folk drawn the other way round (Mob.weapon "folk", shared/constants.ts BEAST_FOLK): the beast's hide on a man. */
const FOLK_MOBS = ["gnawkin", "tuskborn", "silkwretch", "duskwing", "nomad"]; // nomad "folk" = a Dustrider archer
/** Painted humanoid monsters have taller frames (feet lower in the frame, label higher). */
/** Clans that have a supply cart sheet (art keys war_cart_<clan>, same ids as shared/war/clans.ts). */
export const WAR_CART_CLANS = ["wardens", "redfang", "host", "hidekin", "veiled"] as const;
const PAINTED_LOOK: Record<string, { top: number; bar: number; oy: number; scale?: number }> = {
  // about hero height (heroes are 32 world px since the 48px sheets)
  crawler: { top: 13, bar: 12, oy: 20 / 22 }, // own painted sheet: crawling on its arms
  skeleton: { top: 23, bar: 14, oy: 27.5 / 30 }, bandit: { top: 23, bar: 14, oy: 27.5 / 30 }, bride: { top: 23, bar: 14, oy: 27.5 / 30 },
  skeletonmage: { top: 25, bar: 14, oy: 0.975 }, necromancer: { top: 40, bar: 26, oy: 0.975, scale: 1.45 },
  demon: { top: 50, bar: 28, oy: 33 / 34, scale: 1.45 },
  banditchief: { top: 46, bar: 30, oy: 32 / 34, scale: 1.5 },
  hollowking: { top: 62, bar: 38, oy: 42 / 48, scale: 1.6 }, // towers over the heroes
  // the Mawdeep's beast-folk (tools/art/paint/look.ts): the elites and the Hide-Mother drawn big
  gnawkin: { top: 25, bar: 14, oy: 27.5 / 30 }, silkwretch: { top: 25, bar: 14, oy: 27.5 / 30 },
  tuskborn: { top: 28, bar: 16, oy: 29.5 / 32 }, duskwing: { top: 34, bar: 16, oy: 36 / 38 }, // the flyers hover
  crowseer: { top: 36, bar: 16, oy: 38 / 40 },
  gnasher: { top: 50, bar: 28, oy: 35.5 / 38, scale: 1.4 }, weaver: { top: 52, bar: 30, oy: 37.5 / 40, scale: 1.45 },
  packlord: { top: 48, bar: 28, oy: 34 / 36, scale: 1.4 }, hornbrute: { top: 56, bar: 32, oy: 37.5 / 40, scale: 1.45 },
  hidemother: { top: 66, bar: 38, oy: 44 / 48, scale: 1.6 },
  // the clan war's soldiers (tools/art/paint/warLooks.ts): art-only keys, not MobKinds; line soldiers 36x32 frames, officers 36x34
  ...Object.fromEntries(["war_warden", "war_redfang", "war_host", "war_hidekin", "war_veiled"].map((k) => [k, { top: 27, bar: 14, oy: 30 / 32 }])),
  ...Object.fromEntries(["war_warden_cap", "war_redfang_chief", "war_host_cap", "war_hidekin_chief", "war_veiled_adept"].map((k) => [k, { top: 30, bar: 16, oy: 32 / 34 }])),
  // the clan war's supply carts (tools/art/paint/warCarts.ts): 72x44 frames, a cart and its beast about 2 tiles long; the ground line is at 40/44
  ...Object.fromEntries(WAR_CART_CLANS.map((c) => [`war_cart_${c}`, { top: 36, bar: 30, oy: 40 / 44 }])),
  // Act 2, the Sunscar
  nomad: { top: 24, bar: 14, oy: 27.5 / 30 }, sanddead: { top: 24, bar: 14, oy: 27.5 / 30 }, veiled: { top: 26, bar: 14, oy: 31.2 / 32 },
  camelfolk: { top: 36, bar: 18, oy: 33.5 / 36 }, sphinx: { top: 38, bar: 18, oy: 36.5 / 40 }, scorpion: { top: 20, bar: 18, oy: 27 / 30 },
  sunwright: { top: 62, bar: 38, oy: 42 / 48, scale: 1.6 }, // Act 2's final boss, as tall as the Hollow King
  // the Night Raiders (tools/art/paint/raiders.ts): a rider on a big horse, a head taller than the heroes
  nightraider: { top: 60, bar: 30, oy: 55 / 62, scale: 1.35 }, // drawn big: horse and rider tower over the heroes
  // the Summoner's golems (tools/art/paint/golems.ts, 40x46 frames, feet at 43) and the Colossus they fuse into
  golem_fire: { top: 40, bar: 22, oy: 43 / 46 }, golem_cold: { top: 40, bar: 22, oy: 43 / 46 },
  golem_poison: { top: 40, bar: 22, oy: 43 / 46 }, golem_shock: { top: 40, bar: 22, oy: 43 / 46 },
  golem_colossus: { top: 64, bar: 34, oy: 43 / 46, scale: 1.6 },
  wisp: { top: 18, bar: 10, oy: 20 / 22 }, // 16x22 frames: the orb floats above its own shadow (foot at 20)
  // pixel sheets use even frame heights (whole texels at 1.5 per px)
  blobling: { top: 9, bar: 8, oy: 0.91 }, shooterblob: { top: 16, bar: 12, oy: 0.93 }, healerblob: { top: 16, bar: 12, oy: 0.93 },
  venomblob: { top: 17, bar: 12, oy: 0.93 }, frostblob: { top: 20, bar: 14, oy: 0.94 }, fireblob: { top: 19, bar: 14, oy: 0.94 }, stormblob: { top: 18, bar: 12, oy: 0.93 },
};
/** Painted monster sheets (tools/art/paint/mobs.ts), loaded by preloadPaintedMobs for the smooth look. */
export function preloadPaintedMobs(scene: Phaser.Scene) {
  if (!SMOOTH) return;
  Object.assign(MOB_LOOK, PAINTED_LOOK);
  scene.load.json("hd_mobs", "assets/hd/mobs/mobs.json");
  for (const k of [...PAINTED_MOBS.filter((m) => m !== "golem_colossus" && m !== "nightraider").map((m) => `mob_${m}`), "mob_motherblob2", "mob_motherblob3", "mob_skeleton_axe", "mob_skeleton_spear", "mob_skeleton_bow", "mob_bandit_brute", "mob_bandit_archer", "mob_demon1", "mob_demon2", "mob_demon3", "mob_demon4", ...FOLK_MOBS.map((m) => `mob_${m}_folk`), ...COLOSSUS_ELEMENTS.map((e) => `mob_golem_colossus_${e}`), ...WISP_ELEMENTS.map((e) => `mob_wisp_${e}`), ...RAIDERS.map((r) => `mob_nightraider_${r.key}`), ...AFFIX_KEYS.filter((k) => AFFIXES[k].overlay).map((k) => `mob_champ_${k}`), ...CHAMP_SHEETS.map((k) => `mob_${k}_champ`)]) scene.load.image(`hd_${k}`, `assets/hd/mobs/${k}.webp`);
}

/** Monster sprite sheets, same 6-frame layout as personas (painted when the smooth look is on). */
/** The old monster look each clan soldier wears in the pixel view and until its painted sheet is loaded (kind_weapon). */
export const WAR_LEGACY: Record<string, string> = {
  war_warden: "watchman", war_warden_cap: "watchman", war_redfang: "bandit", war_redfang_chief: "bandit_brute", war_host: "skeleton_spear", war_host_cap: "skeleton",
  war_hidekin: "gnawkin_folk", war_hidekin_chief: "tuskborn_folk", war_veiled: "veiled", war_veiled_adept: "nomad_folk",
};
/** The art key ("war_redfang_chief"...) a server trooper wears: its clan and rank ride in Mob.weapon (shared/war/troops.ts). */
export function trooperArt(weapon: string): string {
  const t = parseTroop(weapon);
  return t ? troopLook(t.clan, 0, t.officer) : "war_warden";
}
/** A monster's look entry (size, label height): a trooper's comes from its clan's soldier sheet. */
export const mobLook = (kind: string, weapon = "") => MOB_LOOK[kind === "trooper" ? trooperArt(weapon) : kind];

export function mobTexture(scene: Phaser.Scene, kind: string, level = 1, weapon = "", bones = 0, champion = false): string {
  if (kind === "trooper") { // a clan soldier: its painted sheet once loaded, an old monster look meanwhile (the watchman is a hero sheet: a bandit stands in)
    const art = trooperArt(weapon), painted = warSoldierTexture(scene, art);
    if (painted) return painted;
    const [k, w] = (WAR_LEGACY[art] ?? "bandit").replace("watchman", "bandit").split("_");
    return mobTexture(scene, k, level, w ?? "");
  }
  if (kind === "wisp") {
    if (SMOOTH && scene.textures.exists(`hd_mob_wisp_${WISP_ELEMENTS.includes(weapon) ? weapon : "fire"}`)) return paintedSheet(scene, `mob_wisp_${WISP_ELEMENTS.includes(weapon) ? weapon : "fire"}`) ?? mobTexture(scene, WISP_STANDIN[weapon] ?? "fireblob", level);
    return mobTexture(scene, WISP_STANDIN[weapon] ?? "fireblob", level);
  }
  if (kind === "crawler" && !(SMOOTH && scene.textures.exists("hd_mob_crawler"))) return mobTexture(scene, "skeleton", level, weapon); // pixel look: a skeleton's upper half (cropped in TownScene)
  if (SMOOTH && PAINTED_MOBS.includes(kind)) {
    const tier = level >= 10 ? 3 : level >= 5 ? 2 : 1;
    // skeletons carry a sword (base sheet), an axe, a spear or a bow
    // bandits by role (shared/bandits.ts): cutthroats use the base sheet, lookouts are archers up on a tower
    const key = kind === "motherblob" && tier > 1 ? `mob_motherblob${tier}` : kind === "skeleton" && weapon && weapon !== "sword" ? `mob_skeleton_${weapon}`
      : kind === "bandit" && (weapon === "brute" || weapon === "archer" || weapon === "lookout") ? `mob_bandit_${weapon === "lookout" ? "archer" : weapon}`
      : weapon === "folk" && FOLK_MOBS.includes(kind) ? `mob_${kind}_folk`
      : kind === "nightraider" ? `mob_nightraider_${RAIDERS.some((r) => r.key === weapon) ? weapon : RAIDERS[0].key}` // each of the Seven has its own sheet
      : kind === "golem_colossus" ? `mob_golem_colossus_${COLOSSUS_ELEMENTS.includes(weapon) ? weapon : "fire"}`
      : kind === "demon" && bones > 0 ? `mob_demon${Math.min(4, bones)}` : `mob_${kind}`; // the demon wearing its harvested bones
    // a humanoid champion carries its champion weapon (tools/art/paint/look.ts CHAMP_WEAPONS), when it has one
    const done = (champion && paintedSheet(scene, `${key}_champ`)) || paintedSheet(scene, key);
    if (done) return done;
  }
  return pixelMobTexture(scene, kind === "demon" || kind === "hollowking" || kind === "sunwright" ? "necromancer" : BEAST_KINDS.includes(kind as any) || DESERT_KINDS.includes(kind as any) || kind === "bride" || kind === "nightraider" ? (kind === "sanddead" ? "skeleton" : "bandit") : kind, level); // no pixel demon sheet: a necromancer stands in
}

const warAsked = new Set<string>();
/**
 * A clan soldier's painted sheet (art key "war_warden"...: see shared/war/patrols.ts TROOP_LOOK, not a MobKind): fetched on
 * first ask, so only players near a war land pay for it (about 15 KB a sheet). Null until it is loaded; 14 frames
 * (the 12 of a monster sheet, then 12 = staggering and 13 = fallen, facing right).
 */
export function warSoldierTexture(scene: Phaser.Scene, name: string): string | null {
  if (!SMOOTH) return null;
  const key = `mob_${name}`;
  if (!scene.textures.exists(`hd_${key}`)) {
    if (!warAsked.has(key) && scene.cache.json.exists("hd_mobs")) {
      warAsked.add(key);
      // a failed fetch (network blip) frees the key after a while, so the clan's soldiers are asked for again
      const onErr = (f: Phaser.Loader.File) => { if (f.key !== `hd_${key}`) return; scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onErr); setTimeout(() => warAsked.delete(key), 15_000); };
      scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onErr);
      scene.load.once(`filecomplete-image-hd_${key}`, () => scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onErr));
      scene.load.image(`hd_${key}`, `assets/hd/mobs/${key}.webp`);
      if (!scene.load.isLoading()) scene.load.start();
    }
    return null;
  }
  return paintedSheet(scene, key);
}

/**
 * A clan's supply cart sheet (art key "war_cart_wardens"...; 14 frames of 72x44, like the soldiers' sheets: 0-1 walk down, 2-3 up,
 * 4-5 right (left = flipped), 6-8 idle down / up / right, 9-11 mid-stride, 12 = staggering, 13 = wrecked, facing right). Fetched on
 * first ask, retried after a failed fetch; null until loaded. Art only: nothing in it is a gameplay value.
 */
export function warCartTexture(scene: Phaser.Scene, clan: string): string | null {
  return warSoldierTexture(scene, clan.startsWith("war_cart_") ? clan : `war_cart_${clan}`);
}

/** A champion affix's painted detail (tools/art/paint/mobs.ts champOverlay, 2 frames), or null (pixel look, not loaded). */
export function champOverlayTexture(scene: Phaser.Scene, k: string): string | null {
  return SMOOTH ? paintedSheet(scene, `mob_champ_${k}`) : null;
}

/** A painted monster sheet (assets/hd/mobs) turned into a frame texture once; null while it is not loaded. */
function paintedSheet(scene: Phaser.Scene, key: string): string | null {
  if (scene.textures.exists(key)) return key;
  const meta = scene.cache.json.get("hd_mobs")?.[key];
  const src = scene.textures.exists(`hd_${key}`) ? scene.textures.get(`hd_${key}`).getSourceImage() as HTMLImageElement : null;
  if (!meta || !src) return null;
  hiResTexture(scene, key, meta.w, meta.h, meta.frames ?? 6, meta.scale, (ctx, f) => ctx.drawImage(src, f * meta.w * meta.scale, 0, meta.w * meta.scale, meta.h * meta.scale, 0, 0, meta.w, meta.h));
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST); // pixel art sheet
  return key;
}

function pixelMobTexture(scene: Phaser.Scene, kind: string, level = 1): string {
  const mtier = level >= 10 ? 3 : level >= 5 ? 2 : 1; // MOTHER.tier
  if (kind === "motherblob" && mtier === 2) {
    return drawSheet(scene, "mob_motherblob2", [MOTHER2_A, MOTHER2_B, MOTHER2_A, MOTHER2_B, MOTHER2_A, MOTHER2_B], {
      G: 0x2f8f9e, L: 0xb0eef5, E: 0x0b2a30, W: 0xffffff, D: 0x1c5560, O: 0x123f47, B: 0x8fe0c8, b: 0xdcfff4,
      I: 0x8a9099, i: 0xc9ced6, Y: 0xffc93c, T: 0x6d4c33,
    }, MOTHER_W, MOTHER_H);
  }
  if (kind === "motherblob" && mtier === 3) {
    return drawSheet(scene, "mob_motherblob3", [MOTHER3_A, MOTHER3_B, MOTHER3_A, MOTHER3_B, MOTHER3_A, MOTHER3_B], {
      G: 0x5a3f9e, L: 0xd3c2ff, E: 0x140a2a, W: 0xffffff, D: 0x35246b, O: 0x22164a, B: 0xb79cff, b: 0xf0e8ff,
      Y: 0xffc93c, R: 0xe63946, S: 0x9aa3ad, s: 0xd6dce3, r: 0x4a4f57,
    }, MOTHER_W, MOTHER_H);
  }
  if (kind === "motherblob") {
    return drawSheet(scene, "mob_motherblob", [MOTHER_A, MOTHER_B, MOTHER_A, MOTHER_B, MOTHER_A, MOTHER_B], {
      G: 0x3f9e8c, L: 0xb8f2e0, E: 0x10302a, W: 0xffffff, D: 0x1f5c50, O: 0x1a4a40, B: 0x9be58a, b: 0xe2ffd6, Y: 0xffc93c, R: 0xe63946,
    }, MOTHER_W, MOTHER_H);
  }
  const sheet = (key: string, a: string[], b: string[], pal: Record<string, number>, w: number, h: number) =>
    drawSheet(scene, key, [a, b, a, b, a, b], pal, w, h);
  if (kind === "shooterblob") {
    return sheet("mob_shooterblob", SHOOTER_A, SHOOTER_B, {
      G: 0x9b6bd6, L: 0xe2ccff, E: 0x1e0f33, D: 0x5d3a8f, O: 0x3f2466, N: 0x4a4458, n: 0x1b1824,
    }, VAR_W, VAR_H);
  }
  if (kind === "warriorblob") {
    return sheet("mob_warriorblob", WARRIOR_A, WARRIOR_B, {
      G: 0xd9573b, L: 0xffb59e, E: 0x2a0d06, D: 0x8f2f1c, O: 0x5c1d10, H: 0xaeb6c2, h: 0x6b7480, R: 0xe63946,
    }, 16, 18);
  }
  if (kind === "healerblob") {
    return sheet("mob_healerblob", HEALER_A, HEALER_B, {
      G: 0xf5d0e6, L: 0xffffff, E: 0x3a1a2e, D: 0xc48aaa, O: 0x8a5577, Y: 0xffd54f, X: 0x43c463,
    }, VAR_W, VAR_H);
  }
  if (kind === "bandit" || kind === "banditchief") {
    return drawSheet(scene, "mob_bandit", BANDIT_FRAMES, {
      H: 0x3b2f2a, K: 0xd9a77a, E: 0x1a1a1a, M: 0xb3261e, S: 0x6d4c33, B: 0x2b1d14, P: 0x3a3a3a, D: 0x1a1a1a,
    });
  }
  if (kind === "blobling") {
    return drawSheet(scene, "mob_blobling", [BLOBLING_A, BLOBLING_B, BLOBLING_A, BLOBLING_B, BLOBLING_A, BLOBLING_B], {
      G: 0xa6e86b, L: 0xf0ffd8, E: 0x14301a, D: 0x5f9e3a, O: 0x3f7a2a,
    }, BLOBLING_W, BLOBLING_H);
  }
  if (kind === "slime") {
    return drawSheet(scene, "mob_slime", [SLIME_A, SLIME_B, SLIME_A, SLIME_B, SLIME_A, SLIME_B], {
      G: 0x7bd36b, L: 0xc8f5b8, E: 0x14301a, D: 0x3f8a3a,
    });
  }
  if (kind === "skeletonmage") {
    return drawSheet(scene, "mob_skeletonmage", MAGE_FRAMES, {
      C: 0x2c3a9a, K: 0xe8e6d6, E: 0x7fe7ff, R: 0x3b4cc0, T: 0xffd54f, D: 0x9a988a, W: 0x6d4c33, O: 0x7fe7ff, o: 0xe0fbff,
    }, CASTER_W, CASTER_H);
  }
  if (kind === "necromancer") {
    return drawSheet(scene, "mob_necromancer", NECRO_FRAMES, {
      C: 0x1b1024, K: 0xd8d2bf, E: 0x7dff6a, R: 0x2a1838, T: 0x8e1b2e, D: 0x9a988a, W: 0x3a3340, O: 0x7dff6a, o: 0xe6ffd9, N: 0xd8d2bf,
    }, CASTER_W, CASTER_H);
  }
  return drawSheet(scene, "mob_skeleton", FRAMES, {
    H: 0xe8e6d6, K: 0xe8e6d6, E: 0x111111, S: 0x4a4a52, B: 0x2a2a2a, P: 0xd2d0c0, D: 0x9a988a,
  });
}

function drawSheet(scene: Phaser.Scene, key: string, frames: string[][], pal: Record<string, number>, PW_ = PW, PH_ = PH): string {
  if (scene.textures.exists(key)) return key;
  const PW = PW_, PH = PH_;
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
