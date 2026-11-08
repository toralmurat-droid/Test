import Phaser from "phaser";
import { sheet, type Pen } from "./worldProps";
import { hash, dith } from "./bonfireArt";

/**
 * The armourers' wares (shared/npcs.ts NPC_DECOR "ar_*"): an armour stand dressed in the village's best coat and helm,
 * and a rack of shields, a spare helm and boots. One look per village: Oakvale steel mail and an oxblood tabard,
 * Saltmere riveted sea-leather with blued iron, Kel Ashar brass scale under indigo and white linen.
 *
 * Bonfire-style pixel art like Brann's smithy (smithy.ts): 1.5 texels per world px, flat ramps with ordered dithering,
 * light from the top left, a dark outline. A glint runs over the metal now and then and the cloth stirs in the wind.
 * Cosmetic only (collision is NPC_DECOR.solid).
 */
export const AR_TX = 1.5;
const N = 12;

const step = (pal: number[], v: number, x: number, y: number) => {
  const c = Math.max(0, Math.min(pal.length - 1, v)), i = Math.floor(c);
  return pal[Math.min(pal.length - 1, c - i > dith(x, y) ? i + 1 : i)];
};

const WOOD = [0x1c120a, 0x2e1e10, 0x45301a, 0x5e4426, 0x7a5a34, 0x94703f];
const IRON = [0x0e1014, 0x1c1f24, 0x2e3238, 0x464c54, 0x666e78, 0x929ca6, 0xc4ccd2, 0xeef2f4];
const BLUED = [0x0a0e14, 0x141c26, 0x22303e, 0x334656, 0x4c6476, 0x708a9a, 0x9cb4c0, 0xdceaee];
const BRASS = [0x241808, 0x3a2a10, 0x6a4c1c, 0x9a722c, 0xc89c44, 0xead07a, 0xfff0b8, 0xfffbe6];
const LEATHER = [0x1a0f0a, 0x321e12, 0x4c2e1a, 0x6a4226, 0x8a5a34, 0xa47446];
const SEALEATHER = [0x120c0a, 0x221814, 0x36261e, 0x4a3628, 0x604834, 0x7a5e44];
const OXBLOOD = [0x1e0808, 0x3a1010, 0x5a1a18, 0x7a2620, 0x96382a];
const SEA = [0x081418, 0x10262c, 0x1a3a42, 0x285058, 0x3a6a70, 0x568a8c];
const INDIGO = [0x0c0a1c, 0x16143a, 0x221f56, 0x302e72, 0x46468e];
const LINEN = [0x4a443a, 0x6e665a, 0x948a78, 0xbab09a, 0xdcd4c0, 0xf2ecdc];
const GOLD = 0xe0b440;

type Coat = "mail" | "brig" | "scale";
interface Style {
  metal: number[]; coatPal: number[]; coat: Coat; cloth: number[]; leather: number[];
  helm: "bascinet" | "kettle" | "spike"; emblem: number; shields: ("kite" | "round" | "buckler")[];
}
const STYLES: Record<string, Style> = {
  oak: { metal: IRON, coatPal: IRON, coat: "mail", cloth: OXBLOOD, leather: LEATHER, helm: "bascinet", emblem: GOLD, shields: ["kite", "round"] },
  salt: { metal: BLUED, coatPal: SEALEATHER, coat: "brig", cloth: SEA, leather: SEALEATHER, helm: "kettle", emblem: 0xd8e4e0, shields: ["round", "buckler"] },
  sand: { metal: BRASS, coatPal: BRASS, coat: "scale", cloth: INDIGO, leather: LEATHER, helm: "spike", emblem: 0xf2ecdc, shields: ["round", "kite"] },
};

/** A bright band that sweeps over the metal in the first frames of the loop, then rests. */
function glint(f: number, x: number, y: number) {
  const band = -20 + f * 16; // frames 0-5 cross the piece, the rest are still
  const d = Math.abs(x + y * 0.6 - band);
  return d < 1.2 ? 2 : d < 2.6 ? 1 : 0;
}

function ellipse(p: Pen, cx: number, cy: number, rx: number, ry: number, fn: (x: number, y: number, dx: number, dy: number) => number | undefined) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    if (dx * dx + dy * dy > 1) continue;
    const c = fn(x, y, dx, dy);
    if (c !== undefined) p.px(x, y, c);
  }
}

/** Round wooden plinth the stand's post rises from. */
function plinth(p: Pen, cx: number, cy: number, rx: number, ry: number, h: number) {
  for (let k = h; k > 0; k--) ellipse(p, cx, cy + k, rx, ry, (x, y, dx) => step(WOOD, 2.2 - dx * 1.1 - (k / h) * 0.6, x, y));
  ellipse(p, cx, cy, rx, ry, (x, y, dx, dy) => {
    const ring = Math.hypot(dx, dy * 0.9);
    return step(WOOD, 4 - dx * 0.8 - dy * 0.6 - (Math.floor(ring * 4) % 2 ? 0.5 : 0) - (hash(x, y, 701) < 0.05 ? 1 : 0), x, y);
  });
}

// ---- the armour stand -------------------------------------------------------------------------------------
const ST_W = 46, ST_H = 84, ST_BX = 23, ST_BY = 79;

function stand(s: Style) {
  return (p: Pen, f: number) => {
    const cx = ST_BX, wind = Math.sin((f / N) * Math.PI * 2);
    plinth(p, cx, ST_BY - 4, 10, 4.5, 3);
    // the post, and the crossbar the shoulders hang on
    for (let y = 22; y <= ST_BY - 4; y++) { p.px(cx - 1, y, WOOD[4]); p.px(cx, y, WOOD[3]); p.px(cx + 1, y, WOOD[1]); }
    // coat: shoulders 13 px each side, waist 9, a skirt flaring out to 11
    const top = 27, waist = 47, hem = 60;
    const half = (y: number) => y < top + 3 ? 10 + (y - top) : y < waist ? 13 - ((y - top - 3) / (waist - top - 3)) * 4 : 9 + ((y - waist) / (hem - waist)) * 2.5;
    for (let y = top; y <= hem; y++) {
      const hw = half(y);
      for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
        const u = (x - cx) / hw, row = y - top;
        let v = 0, pal = s.coatPal, metal = s.coat !== "brig";
        if (s.coat === "mail") { // rings: staggered rows with a bright top edge
          const ring = ((x + (row >> 1) % 2) % 2 === 0) !== (row % 2 === 0);
          v = 4.2 - u * 1.4 - row * 0.03 + (ring ? 0.7 : -0.5);
        } else if (s.coat === "brig") { // dark sea-leather with rows of brass rivets
          const rivet = row % 5 === 2 && (x + (row % 10 === 2 ? 0 : 2)) % 4 === 0;
          if (rivet) { p.px(x, y, step(BRASS, 5 - u, x, y)); continue; }
          v = 3.6 - u * 1.3 - (row % 5 === 4 ? 0.9 : 0) + (hash(x, y, 702) < 0.06 ? -0.8 : 0);
        } else { // brass scales: rows every 3 px, each scale lit at its top, offset every other row
          const r3 = row % 3, off = Math.floor(row / 3) % 2 ? 2 : 0, edge = (x + off) % 4 === 0;
          v = 4.4 - u * 1.4 - r3 * 0.8 - (edge ? 1 : 0);
          pal = s.coatPal;
        }
        if (metal) v += glint(f, x, y);
        p.px(x, y, step(pal, v, x, y));
      }
    }
    // pauldrons: two layered plates over the shoulders
    for (const side of [-1, 1]) {
      const px0 = cx + side * 11;
      for (let lame = 0; lame < 3; lame++) {
        ellipse(p, px0 + side * lame * 0.6, top + 1 + lame * 3, 6 - lame * 0.6, 3.6, (x, y, dx, dy) =>
          step(s.metal, 5 - dx * 1.2 - dy * 1.6 - lame * 0.6 + glint(f, x, y), x, y));
      }
      p.px(px0, top + 1, s.metal[Math.min(s.metal.length - 1, 7)]);
    }
    // belt and buckle
    for (let x = Math.floor(cx - 9); x <= cx + 9; x++) { p.px(x, waist, step(s.leather, 3 - (x - cx) / 9, x, waist)); p.px(x, waist + 1, s.leather[1]); }
    for (let j = -1; j <= 2; j++) for (let i = -1; i <= 1; i++) if (Math.abs(i) === 1 || Math.abs(j - 0.5) > 1) p.px(cx + i, waist + j, step(BRASS, 5 - i, cx + i, waist + j));
    // cloth: Oakvale a tabard down the front, Saltmere a sash across, Kel Ashar a sash with tassels and a hanging tail
    const sway = (y: number, y0: number) => Math.round(wind * Math.max(0, y - y0) * 0.09);
    if (s.helm === "bascinet") {
      for (let y = top + 6; y <= hem + 6; y++) {
        const w = y > hem + 2 ? 4 - (y - hem - 2) * 0.6 : 5, dx = sway(y, waist);
        for (let x = Math.floor(cx - w); x <= cx + w; x++) {
          const em = Math.abs(x - cx) <= 1 && y >= top + 12 && y <= top + 20 || Math.abs(y - (top + 15)) <= 1 && Math.abs(x - cx) <= 3;
          p.px(x + dx, y, em ? step([0x6a4c1c, 0x9a722c, s.emblem, 0xfff0b8], 2.4 - (x - cx) * 0.3, x, y) : step(s.cloth, 3.4 - (x - cx) / 5 - (y > waist ? 0.4 : 0) - ((x + y) % 7 === 0 ? 0.6 : 0), x, y));
        }
      }
    } else {
      for (let k = 0; k < 26; k++) { // a sash from the right shoulder to the left hip
        const x0 = cx + 9 - k * 0.75, y0 = top + 3 + k * 0.72;
        for (let w = 0; w < 4; w++) p.px(x0 - w * 0.3, y0 + w, step(s.cloth, 3.6 - w * 0.5 - k * 0.04, x0, y0 + w));
      }
      if (s.helm === "spike") for (let t = 0; t < 2; t++) { // tassels at the hip, swinging
        const tx = cx - 9 + t * 3;
        for (let j = 0; j < 7; j++) p.px(tx + sway(waist + j * 1.6, waist) * 1.4, waist + 3 + j, j < 2 ? GOLD : step(s.cloth, 3 - j * 0.2, tx, waist + j));
      }
    }
    // the helm on top of the post
    const hx = cx, hy = 16;
    if (s.helm === "bascinet") {
      ellipse(p, hx, hy, 7, 8, (x, y, dx, dy) => (y > hy + 1 && y < hy + 3 && Math.abs(dx) < 0.7 ? IRON[0] : step(s.metal, 5.2 - dx * 1.6 - dy * 1.4 + glint(f, x, y), x, y)));
      for (let x = hx - 6; x <= hx + 6; x++) p.px(x, hy + 7, step(s.metal, 3.6 - (x - hx) / 4, x, hy + 7)); // the rim
      for (let j = 0; j < 6; j++) p.px(hx, hy - 8 - j * 0.2 + (j > 3 ? 1 : 0), step(s.cloth, 4 - j * 0.4, hx, hy - 8)); // crest
      for (let i = 0; i < 6; i++) p.px(hx + 1 + i + Math.round(wind * i * 0.2), hy - 9 + i * 0.5, step(s.cloth, 3.8 - i * 0.4, hx + i, hy - 9)); // plume
    } else if (s.helm === "kettle") {
      ellipse(p, hx, hy + 1, 6, 6, (x, y, dx, dy) => step(s.metal, 5 - dx * 1.4 - dy * 1.4 + glint(f, x, y) + (hash(x, y, 703) < 0.08 ? -1.4 : 0), x, y));
      ellipse(p, hx, hy + 6, 11, 2.6, (x, y, dx, dy) => (dy < -0.2 && Math.abs(dx) < 0.5 ? undefined : step(s.metal, 4.4 - dx * 1.2 + dy * 0.8 + glint(f, x, y), x, y)));
      for (let x = hx - 10; x <= hx + 10; x += 4) p.px(x, hy + 7, 0x3a7a6a); // verdigris on the brim
    } else {
      ellipse(p, hx, hy + 1, 6.5, 6.5, (x, y, dx, dy) => step(s.metal, 5.4 - dx * 1.5 - dy * 1.5 + glint(f, x, y), x, y));
      for (let j = 0; j < 7; j++) for (let i = -2 + Math.floor(j / 3); i <= 2 - Math.floor(j / 3); i++) p.px(hx + i, hy - 5 - j, step(s.metal, 5 - i * 0.8 + glint(f, hx + i, hy - 5 - j), hx + i, hy - 5 - j)); // spike
      for (let x = hx - 7; x <= hx + 7; x++) for (let j = 0; j < 3; j++) p.px(x, hy + 4 + j, step(LINEN, 4.6 - (x - hx) / 5 - j * 0.6 - ((x + j) % 3 === 0 ? 0.6 : 0), x, hy + 4 + j)); // linen wrap
      for (let j = 0; j < 12; j++) for (let w = 0; w < 3; w++) { // the wrap's tail, lifting in the wind
        const x = hx + 6 + w + Math.round(wind * j * 0.25) + Math.floor(j / 4), y = hy + 5 + j;
        p.px(x, y, step(LINEN, 3.8 - w * 0.6 - j * 0.08, x, y));
      }
    }
  };
}

// ---- the rack: shields on pegs, a spare helm on the post, boots on the board ---------------------------
const RK_W = 70, RK_H = 62, RK_BX = 35, RK_BY = 58;

function shieldAt(p: Pen, s: Style, kind: "kite" | "round" | "buckler", cx: number, cy: number, f: number, idx: number) {
  const face = idx === 0 ? s.cloth : s.leather;
  if (kind === "kite") {
    for (let y = -9; y <= 13; y++) {
      const hw = y < -5 ? 6 + (y + 9) * 0.5 : 8 - Math.max(0, y + 1) * 0.55;
      for (let x = Math.floor(-hw); x <= Math.ceil(hw); x++) {
        const rim = Math.abs(x) > hw - 1.2 || y === -9;
        const cross = Math.abs(x) <= 1 || Math.abs(y + 1) <= 1;
        const X = cx + x, Y = cy + y;
        p.px(X, Y, rim ? step(s.metal, 4.6 - x / hw + glint(f, X, Y), X, Y) : cross ? step([0x6a4c1c, 0x9a722c, s.emblem, 0xfff0b8], 2.4 - x * 0.2, X, Y) : step(face, 3.4 - x / hw - y * 0.04, X, Y));
      }
    }
  } else {
    const r = kind === "round" ? 10 : 6.5;
    ellipse(p, cx, cy, r, r, (x, y, dx, dy) => {
      const d = Math.hypot(dx, dy);
      if (d > 0.84) return step(s.metal, 4.6 - dx - dy + glint(f, x, y), x, y);
      if (d < 0.3) return step(s.metal, 5.4 - dx * 2 - dy * 2 + glint(f, x, y), x, y); // the boss
      const plank = Math.floor((x - cx + r) / 3) % 2;
      return kind === "round" && s.helm !== "spike"
        ? step(s.helm === "kettle" ? SEA : WOOD, 3.4 - dx - dy * 0.8 - plank * 0.5, x, y)
        : step(face, 3.6 - dx - dy * 0.8 + ((Math.floor(Math.atan2(dy, dx) * 2.5) & 1) ? 0.4 : 0), x, y);
    });
  }
}

function rack(s: Style) {
  return (p: Pen, f: number) => {
    const wind = Math.sin((f / N) * Math.PI * 2 + 1);
    // base board on the ground, lit from the top left
    for (let y = RK_BY - 5; y <= RK_BY - 1; y++) for (let x = 4; x <= RK_W - 5; x++) {
      const topFace = y < RK_BY - 3;
      p.px(x, y, step(WOOD, (topFace ? 4 : 2) - (x / RK_W) * 1.2 - ((x % 9) === 0 ? 0.8 : 0), x, y));
    }
    // two posts and the top beam
    for (const px0 of [8, RK_W - 10]) for (let y = 10; y <= RK_BY - 4; y++) { p.px(px0, y, WOOD[4]); p.px(px0 + 1, y, WOOD[3]); p.px(px0 + 2, y, WOOD[1]); }
    for (let x = 5; x <= RK_W - 6; x++) for (let j = 0; j < 3; j++) p.px(x, 12 + j, step(WOOD, 4.4 - j * 1.2 - (hash(x, j, 711) < 0.07 ? 1 : 0), x, 12 + j));
    // pegs, and the shields hung from them on leather loops (swinging a little)
    s.shields.forEach((k, i) => {
      const cx = 22 + i * 24, swing = Math.round(wind * (i ? -1 : 1) * 0.7);
      p.px(cx, 15, WOOD[2]); p.px(cx, 16, WOOD[1]);
      for (let j = 0; j < 4; j++) { p.px(cx - 2 + swing * (j / 4), 16 + j, s.leather[3]); p.px(cx + 2 + swing * (j / 4), 16 + j, s.leather[2]); }
      shieldAt(p, s, k, cx + swing, k === "kite" ? 29 : k === "round" ? 30 : 27, f, i);
    });
    // a spare helm on the left post's top
    const hx = 9, hy = 7;
    ellipse(p, hx, hy, 5, 4.5, (x, y, dx, dy) => step(s.metal, 5 - dx * 1.4 - dy * 1.4 + glint(f, x, y), x, y));
    for (let x = hx - 5; x <= hx + 5; x++) p.px(x, hy + 4, step(s.metal, 3.4 - (x - hx) / 4, x, hy + 4));
    // a pair of boots on the board
    for (const [bx, by] of [[44, RK_BY - 5], [52, RK_BY - 4]]) {
      for (let y = 0; y < 9; y++) for (let x = 0; x < 4; x++) p.px(bx + x, by - 9 + y, step(s.leather, 4 - x * 0.6 - (y === 1 ? -0.6 : 0), bx + x, by - 9 + y));
      for (let x = 0; x < 7; x++) p.px(bx + x, by - 1, step(s.leather, 3.4 - x * 0.4, bx + x, by - 1));
      for (let x = 0; x < 7; x++) p.px(bx + x, by, s.leather[1]);
      if (s.helm !== "kettle") for (let x = 0; x < 4; x++) p.px(bx + x, by - 6, step(s.metal, 4.6 - x * 0.5 + glint(f, bx + x, by - 6), bx + x, by - 6)); // greave band
    }
    // a folded coat over the board's left end
    for (let y = 0; y < 5; y++) for (let x = 0; x < 14; x++) p.px(13 + x, RK_BY - 9 + y, step(s.coat === "brig" ? s.coatPal : s.cloth, 3.6 - x * 0.12 - y * 0.4 - ((x + y) % 5 === 0 ? 0.6 : 0), 13 + x, RK_BY - 9 + y));
  };
}

/** Paints the armourers' textures and their idle animations (one stand and one rack per village look). */
export function armouryTextures(scene: Phaser.Scene) {
  for (const [k, s] of Object.entries(STYLES)) {
    sheet(scene, `ar_stand_${k}`, ST_W, ST_H, N, stand(s), 0);
    sheet(scene, `ar_rack_${k}`, RK_W, RK_H, N, rack(s), 0);
    for (const key of [`ar_stand_${k}`, `ar_rack_${k}`]) {
      if (!scene.anims.exists(`${key}_idle`)) scene.anims.create({ key: `${key}_idle`, frames: scene.anims.generateFrameNumbers(key, { start: 0, end: N - 1 }), frameRate: 6, repeat: -1 });
    }
  }
}

/** Origin (x, y fractions) of each armoury texture: the spot that stands on the decor's tile position. */
export function armouryOrigin(prop: string): [number, number] {
  return prop.startsWith("ar_stand") ? [ST_BX / ST_W, (ST_BY - 2) / ST_H] : [RK_BX / RK_W, (RK_BY - 2) / RK_H];
}
