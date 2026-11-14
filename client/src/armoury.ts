import Phaser from "phaser";
import { sheet, type Pen } from "./worldProps";
import { hash } from "./bonfireArt";
import { IsoPaint, ramp } from "./isoPaint";
import { wood } from "./isoProps";

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


// ---- the armour stand -------------------------------------------------------------------------------------
// Modelled in 3D (isoPaint.ts, Murat 2026-11-13: the face-on version looked flat): the mannequin faces down-left (+v),
// so its shoulders run along u and the viewer sees its front and its right side.
const ST_W = 46, ST_H = 84, ST_BX = 23, ST_BY = 79;

function stand(s: Style) {
  return (p: Pen, f: number) => {
    const g = new IsoPaint(p, ST_W, ST_H, ST_BX, ST_BY - 2), wind = Math.sin((f / N) * Math.PI * 2);
    const gl = (x: number, y: number) => glint(f, x, y) * 0.16;
    g.shadow(1, 1, 8);
    // round plinth with turned rings, and the post
    g.rod([0, 0, 0], [0, 0, 3], 7.5, (l, _s, t, x, y) => ramp(WOOD, l - 0.1, x, y));
    g.surf((r, a) => [[Math.cos(a * 6.283) * r * 7.5, Math.sin(a * 6.283) * r * 7.5, 3], [0, 0, 1]], 30, 90, (l, r, _a, x, y) => ramp(WOOD, l + (Math.floor(r * 4) % 2 ? -0.08 : 0.04) - (hash(x, y, 701) < 0.05 ? 0.2 : 0), x, y));
    g.box(-1.1, 1.1, -1.1, 1.1, 3, 60, wood(WOOD, 0, 56));
    // the coat: an elliptic body, broad at the shoulders, pulled in at the waist, a skirt flaring to the hem
    const Z0 = 20, Z1 = 54, waistT = 0.42;
    const rad = (t: number) => t > 0.86 ? 0.8 + (1 - t) / 0.14 * 0.2 : t > waistT ? 0.72 + (t - waistT) / (0.86 - waistT) * 0.28 : 0.72 + (waistT - t) / waistT * 0.18;
    const RU = 7.6, RV = 4.6;
    g.surf((a, t) => {
      const th = a * Math.PI * 2, r = rad(t), c = Math.cos(th), sn = Math.sin(th);
      return [[c * RU * r, sn * RV * r, Z0 + t * (Z1 - Z0)], [c / RU, sn / RV, t > 0.9 ? 0.6 : 0.05]];
    }, 120, 70, (l, a, t, x, y) => {
      const row = Math.floor((1 - t) * 32), col = Math.floor(a * 72);
      let v = l, pal = s.coatPal;
      if (s.coat === "mail") v += ((col + (row % 2)) % 2 ? 0.1 : -0.08) + gl(x, y);
      else if (s.coat === "brig") { if (row % 5 === 2 && (col + (row % 10 === 2 ? 0 : 2)) % 4 === 0) return ramp(BRASS, l + 0.25, x, y); v += (row % 5 === 4 ? -0.14 : 0); }
      else v += -(row % 3) * 0.1 + ((col + (Math.floor(row / 3) % 2 ? 2 : 0)) % 4 === 0 ? -0.15 : 0.05) + gl(x, y);
      if (Math.abs(t - waistT) < 0.03) return ramp(s.leather, l, x, y); // belt
      return ramp(pal, v, x, y);
    });
    // buckle on the front of the belt
    const zb = Z0 + waistT * (Z1 - Z0);
    g.box(-1.2, 1.2, RV * rad(waistT) - 0.2, RV * rad(waistT) + 0.5, zb - 1.2, zb + 1.2, (l, _s, _t, x, y) => ramp(BRASS, l + 0.2, x, y));
    // pauldrons: layered plates over each shoulder
    for (const side of [-1, 1]) for (let lame = 0; lame < 3; lame++)
      g.blob([side * (RU * 0.82 + lame * 0.35), 0.3, Z1 - 0.8 - lame * 2], 3.1 - lame * 0.35, 3.4 - lame * 0.3, 2.1, (l, _s, t, x, y) => ramp(s.metal, l + 0.05 - lame * 0.08 + gl(x, y), x, y), 0.3, 1);
    // cloth: Oakvale a tabard hanging down the front, the others a sash across the chest
    if (s.helm === "bascinet") {
      g.quad([-2.4, RV + 0.5, Z1 - 3], [4.8, 0, 0], [0, 1.2, -(Z1 - Z0) - 4], (l, u, t, x, y) => {
        if (t > 0.96 && Math.abs(u - 0.5) > 0.3) return undefined;
        const em = (Math.abs(u - 0.5) < 0.1 && t > 0.2 && t < 0.48) || (Math.abs(t - 0.3) < 0.04 && Math.abs(u - 0.5) < 0.3);
        return em ? ramp([0x6a4c1c, 0x9a722c, s.emblem, 0xfff0b8], l + 0.1, x, y) : ramp(s.cloth, l + ((Math.round(u * 6) + Math.round(t * 20)) % 7 === 0 ? -0.1 : 0), x, y);
      }, (_u, t) => wind * Math.max(0, t - 0.45) * 1.8, 0.5);
    } else {
      g.surf((a, w) => { const t = 0.92 - a * 0.5, th = Math.PI * (0.15 + a * 0.75), r = rad(t) + 0.08; return [[Math.cos(th) * RU * r, Math.sin(th) * RV * r, Z0 + t * (Z1 - Z0) + w * 3], [Math.cos(th), Math.sin(th), 0.1]]; }, 80, 12, (l, _a, _w, x, y) => ramp(s.cloth, l, x, y), 0.6);
      if (s.helm === "spike") for (const k of [0, 1]) g.rod([-6 + k * 2, 3.2, zb - 1], [-6 + k * 2 + wind * 0.6, 3.6, zb - 9], 0.5, (l, _s, t, x, y) => (t < 0.2 ? GOLD : ramp(s.cloth, l, x, y)));
    }
    // the helm on the post
    const H: [number, number, number] = [0, 0, 63];
    const hm = (b = 0) => (l: number, _s: number, _t: number, x: number, y: number) => ramp(s.metal, l + b + gl(x, y), x, y);
    if (s.helm === "bascinet") {
      g.blob(H, 4.2, 4.2, 5.4, hm(0.05));
      g.box(-2.2, 2.2, 3.6, 4.4, 62, 62.8, () => IRON[0]); // eye slit
      g.rod([0, 0, 68], [0.6, 0.6, 71], 0.7, (l, _s, _t, x, y) => ramp(s.cloth, l, x, y)); // crest
      g.quad([0.6, 0.6, 71], [7 + wind, -1, -2], [0, 0, -2.5], (l, _s, _t, x, y) => ramp(s.cloth, l, x, y), (u) => Math.sin(u * 4 + f) * 0.8); // plume
    } else if (s.helm === "kettle") {
      g.blob([0, 0, 61], 4, 4, 4.4, hm(0), 0.45, 1);
      g.surf((r, a) => { const th = a * 6.283, rr = 4 + r * 3.8; return [[Math.cos(th) * rr, Math.sin(th) * rr, 61.4 - r * 1.4], [Math.cos(th) * 0.3, Math.sin(th) * 0.3, 1]]; }, 20, 120, (l, r, a, x, y) => (Math.round(a * 24) % 6 === 0 && r > 0.8 ? 0x3a7a6a : ramp(s.metal, l + gl(x, y), x, y)));
    } else {
      g.blob([0, 0, 61], 4.2, 4.2, 4.8, hm(0.05), 0.4, 1);
      g.rod([0, 0, 65], [0, 0, 70], 1, hm(0.1));
      g.rod([0, 0, 68], [0, 0, 72], 0.45, hm(0.15));
      g.rod([0, 0, 58.6], [0, 0, 61], 4.5, (l, _s, t, x, y) => ramp(LINEN, l + (Math.round(t * 6) % 2 ? -0.08 : 0.04), x, y));
      g.quad([2.4, 3.8, 60.5], [1.5 + wind * 1.2, 1, -9], [2.2, -1, 0], (l, _s, _t, x, y) => ramp(LINEN, l, x, y), undefined, 0.4); // the wrap's tail
    }
  };
}

// ---- the rack: shields on pegs, a spare helm on the post, boots on the board ---------------------------
const RK_W = 70, RK_H = 62, RK_BX = 35, RK_BY = 58;

function rack(s: Style) {
  return (p: Pen, f: number) => {
    const g = new IsoPaint(p, RK_W, RK_H, RK_BX, RK_BY - 4), wind = Math.sin((f / N) * Math.PI * 2 + 1);
    const gl = (x: number, y: number) => glint(f, x, y) * 0.16;
    const A = 15;
    g.shadow(0, 2, 13, 0.4);
    // base board, two posts, a top beam along u
    g.box(-A - 1, A + 1, -3, 3, 0, 2, (l, u, _t, x, y) => ramp(WOOD, l - 0.05 + (Math.floor(u * 10) % 3 === 0 ? -0.1 : 0), x, y));
    for (const u of [-A + 1, A - 1]) g.box(u - 1.2, u + 1.2, -1.2, 1.2, 2, 36, wood(WOOD, 0, 34));
    g.box(-A - 2, A + 2, -1.3, 1.3, 33, 35.5, wood(WOOD, 0.05, 34));
    // shields hung from pegs on leather loops, swinging a little, facing down-left like the stand
    s.shields.forEach((k, i) => {
      const cu = -6.5 + i * 13, sw = wind * (i ? -1 : 1) * 0.6, pv = 2.2;
      g.box(cu - 0.5, cu + 0.5, 1.3, 3, 31.5, 32.5, wood(WOOD, -0.1));
      for (const d of [-1.6, 1.6]) g.rod([cu + d * 0.5, pv, 32], [cu + d, pv + 0.3, 28.5], 0.3, (l, _s, _t, x, y) => ramp(s.leather, l, x, y));
      const face = i === 0 ? s.cloth : s.leather;
      const shape = (u: number, z: number) => k === "kite" ? (z > 0 ? Math.abs(u) < 6.2 - z * 0.15 : Math.abs(u) < 6.2 + z * 0.5 && z > -12) : Math.hypot(u, z) < (k === "round" ? 7 : 4.8);
      const zc = k === "kite" ? 27 : 22.5, R = k === "kite" ? 13 : 7.5;
      g.quad([cu - R + sw * 0.3, pv + 0.4, zc + R], [2 * R, 0, 0], [0, 0, -2 * R], (l, uu, tt, x, y) => {
        const u = (uu - 0.5) * 2 * R, z = (0.5 - tt) * 2 * R;
        if (!shape(u, z)) return undefined;
        const rim = !shape(u * 1.14, z * 1.14 + (k === "kite" && z > 0 ? 0.6 : 0));
        if (rim) return ramp(s.metal, l + 0.1 + gl(x, y), x, y);
        if (k !== "kite" && Math.hypot(u, z) < 1.8) return ramp(s.metal, l + 0.3 + gl(x, y), x, y);
        if (k === "kite" && (Math.abs(u) < 0.9 || Math.abs(z - 1) < 0.9)) return ramp([0x6a4c1c, 0x9a722c, s.emblem, 0xfff0b8], l + 0.1, x, y);
        if (k === "round" && s.helm !== "spike") return ramp(s.helm === "kettle" ? SEA : WOOD, l - (Math.floor((u + 8) / 2.4) % 2) * 0.08, x, y);
        return ramp(face, l + ((Math.floor(Math.atan2(z, u) * 2.5) & 1) ? 0.06 : 0), x, y);
      }, (uu, tt) => { const u = (uu - 0.5) * 2, z = (0.5 - tt) * 2; return (1 - Math.min(1, u * u + z * z)) * 1.4 + sw * (1 - tt); });
    });
    // a spare helm on the left post's top
    g.blob([-A + 1, 0, 38.5], 3.6, 3.6, 3.6, (l, _s, _t, x, y) => ramp(s.metal, l + 0.05 + gl(x, y), x, y), 0.4, 1);
    g.rod([-A + 1, 0, 37.6], [-A + 1, 0, 38.2], 4, (l, _s, _t, x, y) => ramp(s.metal, l - 0.1, x, y));
    // a pair of boots on the board and a folded coat at the other end
    for (const [u, v] of [[6, 0.5], [9.5, -0.6]]) {
      g.box(u - 1.2, u + 1.4, v - 1.2, v + 1.2, 2, 9, (l, _s, _t, x, y) => ramp(s.leather, l, x, y));
      g.box(u - 1.2, u + 1.4, v - 1.2, v + 3.4, 2, 4, (l, _s, _t, x, y) => ramp(s.leather, l - 0.05, x, y));
      if (s.helm !== "kettle") g.box(u - 1.3, u + 1.5, v - 1.3, v + 1.3, 6, 7, (l, _s, _t, x, y) => ramp(s.metal, l + 0.1 + gl(x, y), x, y));
    }
    g.box(-12, -3, -2.4, 2.4, 2, 4.5, (l, u, t, x, y) => ramp(s.coat === "brig" ? s.coatPal : s.cloth, l + ((Math.floor(u * 9) + Math.floor(t * 5)) % 5 === 0 ? -0.1 : 0), x, y));
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
