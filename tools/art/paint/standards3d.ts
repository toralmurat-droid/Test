/**
 * The clan war standards (client/src/warStandards.ts: the banner poles where heroes swear to a clan, and the banner
 * raised over a sacked Hold) rebuilt as 3D models and baked (Murat 2026-11-19: "the flag poles where you can swear to a
 * clan should be done in 3d and shown as isometric"). A tall pole on a stone plinth ringed with field stones, a gilt
 * finial, a crossbar facing the viewer and the clan's swallow-tailed banner hanging from it, rippling in the wind: cloth
 * in the clan's colour, trim round its edge, the clan's lozenge sigil in the middle. The clan a Reckoning crowned flies
 * a gold sigil under a gold crown on the pole; an unsworn hero's banner is a torn grey rag.
 */
import { CLANS, CLAN_KEYS, type ClanKey } from "../../../shared/war/clans";
import { BRASSR, IRONR, OLDR, STONER, WOODR } from "../../../client/src/isoProps";
import { hash3, mat, type Mat, type Prim } from "./mob3d";
import { blob, box, cloth, grain, rod, type PMat, type PropModel } from "./prop3d";

export const STD_FRAMES = 8;
/** Sheet frame size and the foot's texel (1.5 texels per world px, like the other baked props). */
export const STD_W = 72, STD_H = 156, STD_OX = 36, STD_OY = 150;
const TAU = Math.PI * 2;
const M = (pal: number[], o: Parameters<typeof mat>[1] = {}): Mat => mat(0, { ramp: pal, ...o });
const RAG = [0x1a1a1a, 0x2c2a28, 0x403c38, 0x56514b, 0x6c665e, 0x847d73];

/** Pole height, crossbar height, banner half-width (screen texels) and length. */
const POLE = 134, BAR = 122, HW = 19, LEN = 58;
/** How far in front of the pole (toward the viewer) the crossbar and banner hang, so the pole never shows through. */
const NO = 3.2;

function plinth(P: Prim[]) {
  const stone = (b = 0) => M(STONER, { grain: 0.22, tex: (x, y, z) => b + (hash3(Math.floor(x), Math.floor(y), Math.floor(z * 1.3)) < 0.08 ? -0.2 : 0) });
  P.push(box(-7, 7, -7, 7, 0, 5, stone(0.04), 0.9, 0.5));
  P.push(box(-5, 5, -5, 5, 5, 9, stone(0.1), 0.7, 0.5));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + hash3(i, 7, 1), d = 10 + hash3(i, 7, 2) * 3, s = 1.6 + hash3(i, 7, 3) * 1.6;
    P.push(blob([Math.cos(a) * d, Math.sin(a) * d, s * 0.3], s, s * 0.9, s * 0.75, stone(-0.06), 0.4));
  }
}

/** One clan's standard (`k` undefined: the grey rag of an unsworn hero) at frame f. */
export const standard3d = (k: ClanKey | undefined, crowned = false) => (f: number): PropModel => {
  const ph = (f / STD_FRAMES) * TAU, P: Prim[] = [];
  plinth(P);
  const wood = M(k ? WOODR : OLDR, { tex: (x, y, z) => grain(2)(x, y, z), grain: 0.05 });
  const brass = M(BRASSR, { spec: 0.45, shine: 12, tex: () => 0.06 });
  const iron = M(IRONR, { spec: 0.3, shine: 14 });
  P.push(rod([0, 0, 8], [0, 0, POLE], 1.7, wood, 1.4, 0.4));
  P.push(box(-2.2, 2.2, -2.2, 2.2, 22, 25, iron, 0.4, 0.2)); // iron bands
  P.push(box(-2.1, 2.1, -2.1, 2.1, 70, 72.5, iron, 0.4, 0.2));
  // the crossbar, turned a little off square to the viewer so the banner reads in 3D, brass caps on its ends
  const EA = HW * 0.62, EB = HW * 0.42, nl = Math.hypot(EA, EB), nu = EB / nl, nv = EA / nl;
  const bar = (t: number): [number, number, number] => [EA * t + nu * NO, -EB * t + nv * NO, BAR];
  P.push(rod(bar(-0.62), bar(0.62), 1, wood, 1, 0.3));
  for (const t of [-0.62, 0.62]) P.push(blob(bar(t), 1.5, 1.5, 1.5, brass, 0.3));
  P.push(rod([0, 0, BAR + 0.5], bar(0), 0.9, iron, 0.9, 0.2)); // the iron bracket that holds it off the pole
  // finial: a gilt spearhead, or the Reckoning's gold crown
  P.push(blob([0, 0, POLE + 1], 2.4, 2.4, 2.2, brass, 0.5));
  if (crowned) {
    const gold = M([0x3a2408, 0x6a4612, 0xa8761e, 0xd8a634, 0xf8d460, 0xfff0a8], { spec: 0.6, shine: 10 });
    P.push(rod([0, 0, POLE + 2], [0, 0, POLE + 5], 3.4, gold, 3.4, 0.3));
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; P.push(rod([Math.cos(a) * 3.2, Math.sin(a) * 3.2, POLE + 5], [Math.cos(a) * 3.6, Math.sin(a) * 3.6, POLE + 9], 0.9, gold, 0.4, 0.2)); }
    P.push(blob([0, 3.6, POLE + 3.5], 0.9, 0.9, 0.9, M([0x3a0808, 0x7a1414, 0xc02020, 0xf05050], { spec: 0.7, shine: 8 }), 0.2)); // a ruby
  } else {
    P.push(rod([0, 0, POLE + 3], [0, 0, POLE + 11], 1.5, brass, 0.2, 0.3));
  }
  // the banner: cloth hung from the crossbar, facing the viewer, a swallow tail cut in its foot
  const cl = k ? CLANS[k] : undefined;
  const cloth0 = k ? mat(cl!.cloth, { grain: 0.06 }) : M(RAG, { grain: 0.12 });
  const trim = k ? mat(cl!.trim, { grain: 0.04 }) : M(RAG.slice(0, 4), { grain: 0.1 });
  const sigil = k ? (crowned ? M([0x5a3a10, 0x8a6020, 0xc0902e, 0xe8c25a, 0xfff0a8], { spec: 0.4 }) : mat(cl!.sigil, { grain: 0.03 })) : undefined;
  // e1 = (EA, -EB, 0) along the crossbar, normal (EB, EA) toward the viewer; the banner hangs from bar(-0.5) to bar(0.5)
  const a0: [number, number, number] = [-EA * 0.5 + nu * NO, EB * 0.5 + nv * NO, BAR - 1.2];
  const fold = (t: number, z: number) => (z > BAR - 3 ? 0.06 : 0) + Math.sin(t * 14) * 0.03; // the top hem catches the light
  const flag: PMat = { ...cloth0, tex: (x, y, z) => fold(0, z) };
  flag.sub = (x, y, z) => {
    const s = ((x - a0[0]) * EA - (y - a0[1]) * EB) / (EA * EA + EB * EB), t = (a0[2] - z) / LEN;
    if (!k) return undefined;
    const notch = t > 0.8 ? (t - 0.8) / 0.2 * 0.32 : 0;
    if (s < 0.08 || s > 0.92 || t < 0.06 || (t > 0.78 && Math.abs(s - 0.5) < notch + 0.08)) return trim;
    if (Math.abs(s - 0.5) * HW + Math.abs(t - 0.4) * LEN * 0.75 < 7.5) return sigil;
    if (Math.abs(s - 0.5) * HW + Math.abs(t - 0.4) * LEN * 0.75 < 9) return trim; // a ring of trim round the sigil
    return undefined;
  };
  P.push(cloth(a0, [EA, -EB, 0], [0, 0, -LEN], flag,
    (s, t) => Math.sin(ph - t * 4.6 + s * 1.3) * 2.6 * t + Math.sin(ph * 2 - t * 9) * 0.6 * t * s + Math.sin(s * Math.PI) * 0.8,
    (s, t) => {
      const notch = t > 0.8 ? (t - 0.8) / 0.2 * 0.32 : 0;
      if (t > 0.8 && Math.abs(s - 0.5) < notch) return false; // the swallow tail
      if (!k && t > 0.3 && (hash3(Math.floor(s * 16), Math.floor(t * 12), 9) < 0.14 || (t > 0.75 - 0.25 * Math.abs(Math.sin(s * 7)) && hash3(Math.floor(s * 22), 3, 4) < 0.6))) return false; // torn rag
      return true;
    }, 0.55));
  return { prims: P, shadow: [{ u: 0, v: 0, r: 9 }], cast: 10 };
};

/** Every sheet: warstd3_<clan>, warstd3_<clan>_crowned, warstd3_rogue (keys the client loads, warStandards.ts). */
export const STANDARDS3D = [
  ...CLAN_KEYS.flatMap((k) => [
    { key: `warstd3_${k}`, w: STD_W, h: STD_H, frames: STD_FRAMES, ox: STD_OX, oy: STD_OY, model: standard3d(k) },
    { key: `warstd3_${k}_crowned`, w: STD_W, h: STD_H, frames: STD_FRAMES, ox: STD_OX, oy: STD_OY, model: standard3d(k, true) },
  ]),
  { key: "warstd3_rogue", w: STD_W, h: STD_H, frames: STD_FRAMES, ox: STD_OX, oy: STD_OY, model: standard3d(undefined) },
];
