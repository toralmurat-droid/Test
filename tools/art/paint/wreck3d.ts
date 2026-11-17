/**
 * The wreck of the Grey Heron (worldProps.shipwreck, Heronwreck Strand) rebuilt as a 3D model and baked: a merchant
 * cog lying along the shore, bow raised to the upper left, heeled toward the viewer, her stern smashed into the surf.
 * The hull is a real shell (planked side, broken deck, ribs inside), so the breach above the sprite's foot shows the
 * hold where the Brood Heart glows; a snapped mast carries a torn sail flapping on its yard over the 6 frames.
 */
import { mat, hash3, noise3, type Mat, type Prim } from "./mob3d";
import { blob, cloth, rod, type PMat, type PropModel, type V3 } from "./prop3d";

const N = 6, TAU = Math.PI * 2;
const M = (pal: number[], o: Parameters<typeof mat>[1] = {}): Mat => mat(0, { ramp: pal, ...o });
const HULLR = [0x120c08, 0x1a120c, 0x2e2016, 0x463222, 0x5e4630, 0x7a5e42, 0x96785a, 0xae9474];
const DECKR = [0x1a120c, 0x2a1e14, 0x463424, 0x624a34, 0x7e6248, 0x967a5c];
const SAILR = [0x2a241c, 0x3a3226, 0x5e5240, 0x837458, 0xa8987a, 0xc8baa0, 0xdcd0b8];
const WEEDR = [0x0e160a, 0x16200f, 0x223218, 0x34481f, 0x4a5e2a];
const OOZER = [0x2a0e20, 0x5a1440, 0x9b2c6b, 0xe26fa8, 0xffc4e2];
const GLOAMR = [0x12240e, 0x1e3a18, 0x3a6a2a, 0x6aa848, 0x8cc864];
const SANDR = [0x4a3a26, 0x6a5638, 0x8a744c, 0xa89060, 0xc4ac78];
const ROPER = [0x2e2414, 0x4a3c22, 0x6a5834, 0x8a7448, 0xa89060];
const GULLR = [0x5a5e66, 0x7a7e86, 0xb8b8b4, 0xe8e4dc, 0xf4f0ea];
const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

// ---- the ship's own frame: a along her length (bow at -L), b across (+b = the side toward us), c up from the keel ----
const L = 118, BEAM = 24, DEPTH = 52;
const PITCH = 0.09, ROLL = -0.28;           // bow raised, heeled away from the viewer (her side faces us)
const T: V3 = [0, 0, 3];                   // where her midship keel sits in the world
const cp = Math.cos(PITCH), sp = Math.sin(PITCH), cr = Math.cos(ROLL), sr = Math.sin(ROLL);
/** World (u, v, z) -> ship (a, b, c). */
const toShip = (x: number, y: number, z: number): V3 => {
  const u = x - T[0], v = y - T[1], w = z - T[2];
  const b = v * cr - w * sr, w1 = v * sr + w * cr;        // undo the roll (about a)
  return [u * cp - w1 * sp, b, u * sp + w1 * cp];          // undo the pitch (about b)
};
/** Ship -> world. */
const toWorld = (a: number, b: number, c: number): V3 => {
  const u = a * cp + c * sp, w1 = -a * sp + c * cp;
  return [u + T[0], b * cr + w1 * sr + T[1], -b * sr + w1 * cr + T[2]];
};
/** A prim built in the ship's frame: its distance in ship space, its box the world box of the given ship box. */
function inShip(lo: V3, hi: V3, d: (a: number, b: number, c: number) => number, m: Mat, k = 0.3, cut = false, top = Infinity): Prim {
  const cs = [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((l) => toWorld(i ? hi[0] : lo[0], j ? hi[1] : lo[1], l ? hi[2] : lo[2]))));
  const wl = [0, 1, 2].map((i) => Math.min(...cs.map((p) => p[i])) - 1) as V3, wh = [0, 1, 2].map((i) => Math.max(...cs.map((p) => p[i])) + 1) as V3;
  return { m, k, lo: wl, hi: wh, cut, d: (x, y, z) => { const [a, b, c] = toShip(x, y, z); return Math.max(d(a, b, c), -z, z - top); } };
}
const shipTex = (f: (a: number, b: number, c: number) => number) => (x: number, y: number, z: number) => { const [a, b, c] = toShip(x, y, z); return f(a, b, c); };

// hull lines
const tOf = (a: number) => a / L;
/** Half-beam in plan: a pointed stem at the bow, a full round stern. */
const plan = (t: number) => (t < 0 ? Math.pow(Math.max(0, 1 - Math.pow(-t, 2.2)), 0.62) : Math.pow(Math.max(0, 1 - Math.pow(t, 3.2)), 0.5));
/** The keel rises into the stem at the bow (and a little at the stern). */
const keelC = (t: number) => (t < 0 ? 26 * Math.pow(Math.max(0, -t - 0.45) / 0.55, 1.8) : 6 * Math.pow(Math.max(0, t - 0.6) / 0.4, 2));
/** Gunwale height: the sheer, high at the bow castle. */
const gunC = (t: number) => DEPTH + (t < 0 ? 30 * t * t : 6 * t * t);
const DECK_DROP = 3;                         // deck below the gunwale (the bulwark)
/** Half-width at height c of station t: round bilge, a slight tumblehome near the top. */
const halfW = (t: number, c: number) => {
  const k = keelC(t), g = gunC(t), h = clamp((c - k) / Math.max(1, (g - k) * 0.5));
  const top = clamp((c - k) / Math.max(1, g - k));
  return BEAM * plan(t) * Math.pow(h, 0.3) * (1 - 0.05 * top * top);
};
const outer = (a: number, b: number, c: number) => {
  const t = tOf(a);
  const side = (Math.abs(b) - halfW(clamp(t, -1, 1), c)) * 0.75;
  return Math.max(side, keelC(clamp(t, -1, 1)) - c, c - gunC(clamp(t, -1, 1)), Math.abs(a) - L);
};
// the breach (the hold, above the sprite's foot) and the smashed stern
const BREACH: V3 = [36, BEAM, 27];
const breachD = (a: number, b: number, c: number) => Math.hypot((a - BREACH[0]) / 1.3, (c - BREACH[2]) / 1.05, Math.max(0, BREACH[1] - 12 - b)) - 21 - (noise3(a * 0.2, c * 0.2, 3) - 0.5) * 8;
const smashedD = (a: number, b: number, c: number) => L * 0.72 + (noise3(b * 0.15, c * 0.35, 4) - 0.5) * 26 + Math.floor(c / 5.5) % 2 * 5 - a;

export function wreck(f: number): PropModel {
  const P: Prim[] = [], ph = (f / N) * TAU;
  // planks: strakes along her length, seams, butt joints, rust from the nails
  const plank = (a: number, _b: number, c: number) => {
    const t = clamp(tOf(a), -1, 1), k = keelC(t), s = (c - k) / 5.2, st = Math.floor(s), sv = s - st;
    let l = (hash3(st, Math.floor((a + st * 23) / 31), 3) - 0.5) * 0.18 + (hash3(Math.floor(a), st, 9) - 0.5) * 0.08;
    if (sv < 0.16) l -= 0.42; else if (sv > 0.84) l -= 0.18;
    if (Math.abs(((a + st * 31) % 37 + 37) % 37) < 0.7) l -= 0.35;
    if (hash3(Math.floor(a / 2), Math.floor(c / 3), 19) < 0.012) l -= 0.25;
    return l - (tOf(a) > 0.6 ? (tOf(a) - 0.6) * 0.5 : 0);
  };
  const hull: PMat = { ...M(HULLR, { grain: 0.05, tex: shipTex(plank) }) };
  const weed = M(WEEDR, { grain: 0.25, spec: 0.15, shine: 10 });
  const barn = M([0x3a3a32, 0x5a584a, 0x7a705c, 0xb8ae94, 0xe2dac4], { grain: 0.2 });
  const hold = M([0x0a0705, 0x120c08, 0x1a120c, 0x2e2016], { grain: 0.1 });
  hull.sub = (x, y, z) => {
    const [a, b, c] = toShip(x, y, z), t = clamp(tOf(a), -1, 1), lowC = c - keelC(t);
    if (Math.abs(b) < halfW(t, c) - SH * 0.45 && c < gunC(t) - DECK_DROP) return hold; // inside the hull: the dark hold
    if (b < 0 || Math.abs(a) > L) return undefined;
    const wl = 15 + noise3(a * 0.12, c * 0.3, 16) * 8;          // weed and barnacles at the old waterline
    if (lowC < wl && hash3(Math.floor(a), Math.floor(c), 18) < 0.03) return barn;
    if (lowC < wl - 2 && noise3(a * 0.15, c * 0.4, 17) > 0.38 - (wl - lowC) * 0.04) return weed;
    return undefined;
  };
  // the shell: outer hull minus the inner hull above the hold floor, the breach and the smashed stern
  const SH = 1.8;
  P.push(inShip([-L - 2, -BEAM - 2, -2], [L + 2, BEAM + 2, DEPTH + 26], (a, b, c) => {
    const o = outer(a, b, c), t = clamp(tOf(a), -1, 1);
    const inner = Math.max((Math.abs(b) - (halfW(t, c) - SH)) * 0.75, keelC(t) + 3 - c, Math.abs(a) - (L - 6));
    let d = Math.max(o, -inner);
    d = Math.max(d, -breachD(a, b, c), -smashedD(a, b, c));
    return d;
  }, hull, 0.2));
  // gunwale rail along the top of the side
  const rail = M(HULLR, { grain: 0.04, tex: () => 0.22 });
  P.push(inShip([-L, -BEAM - 2, 20], [L * 0.8, BEAM + 2, DEPTH + 26], (a, b, c) => {
    const t = clamp(tOf(a), -1, 1), g = gunC(t);
    const d = Math.max(Math.abs(c - g + 0.6) - 1.1, (Math.abs(Math.abs(b) - halfW(t, g) + 0.6)) * 0.8 - 1.3, Math.abs(a) - (L - 4));
    return Math.max(d, -smashedD(a, b, c) - 4, -(breachD(a, b, c) + 2));
  }, rail, 0.2));
  // ribs: frames inside the shell (seen through the breach and the smashed stern)
  const ribM = M(HULLR.slice(0, 6), { grain: 0.06, tex: () => -0.05 });
  P.push(inShip([-L * 0.2, -BEAM, 0], [L, BEAM, DEPTH + 10], (a, b, c) => {
    const t = clamp(tOf(a), -1, 1), ai = Math.round(a / 9) * 9;
    const band = Math.max((Math.abs(b) - halfW(t, c) + SH) * 0.75, -(Math.abs(b) - halfW(t, c) + SH + 2.6) * 0.75, keelC(t) + 2 - c, c - gunC(t) + 1);
    return Math.max(Math.abs(a - ai) - 1.1, band, -a - L * 0.15);
  }, ribM, 0.1));
  // the deck: planks along her length, the hatch open, stove in over the breach, gone at the stern
  const deckM = M(DECKR, { grain: 0.06, tex: shipTex((a, b) => (Math.abs(((b + 40) % 4.2) - 2.1) > 1.65 ? -0.4 : 0) + (Math.abs(((a + Math.floor((b + 40) / 4.2) * 13) % 23 + 23) % 23) < 0.6 ? -0.3 : 0) + (hash3(Math.floor((b + 40) / 4.2), Math.floor(a / 9), 4) - 0.5) * 0.15) });
  P.push(inShip([-L, -BEAM, 10], [L * 0.8, BEAM, DEPTH + 26], (a, b, c) => {
    const t = clamp(tOf(a), -1, 1), dz = gunC(t) - DECK_DROP;
    let d = Math.max(Math.abs(c - dz) - 1, (Math.abs(b) - halfW(t, dz) + SH * 0.5) * 0.75, Math.abs(a) - (L - 6));
    d = Math.max(d, -Math.max(Math.abs(a + 46) - 7, Math.abs(b) - 8));                                    // the cargo hatch
    d = Math.max(d, -(Math.hypot((a - 28) / 1.4, b * 0.9) - 15 - (noise3(a * 0.2, b * 0.3, 12) - 0.5) * 10)); // stove in
    d = Math.max(d, -(smashedD(a, b, c) + 14 + (noise3(a * 0.3, b * 0.3, 11) - 0.5) * 12));                 // the stern deck is gone
    return d;
  }, deckM, 0.1));
  // the hold: dark timbers and the Gloam's ooze, glowing, pulsing over the frames
  const pulse = 0.5 + 0.5 * Math.sin(ph);
  const ooze = M(OOZER, { emit: 0.55 + pulse * 0.15, grain: 0.3, spec: 0.4, shine: 10, tex: shipTex((a, b) => (noise3(a * 0.2, b * 0.2, ph * 0.3) - 0.5) * 0.6) });
  P.push(inShip([-10, -BEAM, 0], [L * 0.85, BEAM, 14], (a, b, c) => {
    const t = clamp(tOf(a), -1, 1);
    return Math.max(c - 8 - noise3(a * 0.15, b * 0.15, 5) * 3, (Math.abs(b) - halfW(t, c) + SH) * 0.75, keelC(t) + 1 - c, Math.abs(a - 40) - 46);
  }, ooze, 0.6));
  // wet sand and surf wash fill her sunk stern
  const wet = M([0x3a2e20, 0x5a4a32, 0x7a6644, 0x9a8458, 0xb8a070], { grain: 0.25, spec: 0.2, shine: 8 });
  P.push(inShip([50, -BEAM, 0], [L, BEAM, 30], (a, b, c) => {
    const t = clamp(tOf(a), -1, 1);
    return Math.max((Math.abs(b) - halfW(t, c) + SH * 0.6) * 0.75, a < 60 ? 60 - a : -1e3, keelC(t) - c);
  }, wet, 0.4, false, 7 + 0));
  // ooze spilling out of the breach onto the sand, green at the rim
  const gloam = M(GLOAMR, { emit: 0.25, spec: 0.4, shine: 10, grain: 0.2 });
  for (let i = 0; i < 7; i++) {
    const r = 1 - i / 7, aa = BREACH[0] + (hash3(i, 1, 7) - 0.5) * 30, t = tOf(aa), c = keelC(t) + 4;
    const [x, y] = toWorld(aa, halfW(t, c) - 1, c);
    P.push(blob([x + 1, y + 2 + hash3(i, 2, 7) * 3, 0], 4 + r * 4, 3 + r * 2.5, 1.2 + r, i < 3 ? ooze : gloam, 0.8, 0));
  }
  // broken stern timbers standing up out of the surf
  for (const [a, b, h, lean] of [[L * 0.86, BEAM * 0.6, 30, 0.2], [L * 0.94, BEAM * 0.1, 22, -0.1], [L * 1.0, -BEAM * 0.4, 34, 0.15]] as const) {
    const p0 = toWorld(a, b, keelC(1) + 2), p1 = toWorld(a + lean * h, b, h);
    P.push(rod(p0, p1, 1.5, hull, 1.1, 0.2));
  }
  // bowsprit and the heron figurehead, worn to a lump
  const old = M(HULLR, { grain: 0.06, tex: () => 0.08 });
  P.push(rod(toWorld(-L + 8, 0, gunC(-1) - 8), toWorld(-L - 26, 0, gunC(-1) - 16), 2.2, old, 1.4, 0.2));
  P.push(blob(toWorld(-L - 1, 0, gunC(-1) - 12), 3.5, 3.5, 5, old, 0.6));

  // ---- the snapped mast, a yard hanging askew with the torn sail, slack rigging ----
  const MA = -46, mBase = gunC(tOf(MA)) - DECK_DROP, MTOP = 116;
  const mast = M(HULLR, { grain: 0.06, tex: shipTex((_a, b, c) => (hash3(Math.floor(b * 2), Math.floor(c / 5), 6) - 0.5) * 0.18) });
  const mp = (c: number): V3 => toWorld(MA, 0, c);
  P.push(rod(mp(mBase - 2), mp(MTOP), 3, mast, 2.4, 0.3));
  for (let k = 0; k < 4; k++) P.push(rod(mp(MTOP), toWorld(MA + (k - 1.5) * 1.4, (k % 2 - 0.5) * 2, MTOP + 2 + (k % 3) * 2.5), 0.8, mast, 0.3, 0.1)); // splintered top
  const bandM = M(ROPER, { tex: (x, y, z) => ((x + y + z) * 1.3 % 1 < 0.3 ? -0.2 : 0) });
  for (const c of [76, 92, 106]) P.push(rod(mp(c - 1.2), mp(c + 1.2), 3.6, bandM, 3.4, 0.2));
  // a gull keeps watch on the stump
  const gull = M(GULLR, { grain: 0.03 }), gw = M([0x3a3e46, 0x5a5e66, 0x7a7e86, 0x9a9ea6]);
  const g0 = toWorld(MA, 0, MTOP + 5);
  P.push(blob([g0[0], g0[1], g0[2]], 3.2, 2.2, 2.2, gull, 0.6));
  P.push(blob([g0[0] - 2.4, g0[1] + 0.4, g0[2] + 2.6], 1.6, 1.5, 1.5, gull, 0.8));
  P.push(blob([g0[0] + 2.2, g0[1] - 0.4, g0[2] + 0.6], 2.4, 1.6, 1, gw, 0.4));
  const eyes = [{ p: [g0[0] - 3.2, g0[1] + 1.6, g0[2] + 3] as V3, col: 0x101010 }, { p: [g0[0] - 4.2, g0[1] + 0.8, g0[2] + 2.4] as V3, col: 0xe0a030 }];
  // yard: hangs from one rope, tilted, swinging a little
  const sw = Math.sin(ph) * 1.5;
  const yA = toWorld(MA - 30, 4, 104 + sw), yB = toWorld(MA + 46, 8, 82 - sw);
  P.push(rod(yA, yB, 1.6, mast, 1.3, 0.2));
  const rope = M(ROPER, { tex: () => -0.1 });
  P.push(rod(mp(110), [yA[0] + (yB[0] - yA[0]) * 0.1, yA[1] + (yB[1] - yA[1]) * 0.1, yA[2] + (yB[2] - yA[2]) * 0.1], 0.5, rope, 0.5, 0.1));
  P.push(rod(mp(100), [yA[0] + (yB[0] - yA[0]) * 0.92, yA[1] + (yB[1] - yA[1]) * 0.92, yA[2] + (yB[2] - yA[2]) * 0.92], 0.5, rope, 0.5, 0.1));
  // sail: canvas hanging from the yard, torn, the loose end flapping
  const sail = M(SAILR, { grain: 0.08, tex: (x, y, z) => (hash3(Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2)) < 0.03 ? -0.35 : 0) });
  const e1: V3 = [yB[0] - yA[0], yB[1] - yA[1], yB[2] - yA[2]];
  P.push(cloth([yA[0], yA[1] + 1, yA[2] - 1], e1, [4, 10, -50], sail,
    (s, t) => Math.sin(s * 9 + ph * 0.5) * 1.4 + Math.sin(ph + s * 4 + t * 3) * t * 4,
    (s, t) => {
      const len = (0.45 + 0.55 * Math.sin(Math.min(1, s * 1.1) * Math.PI * 0.9) * (0.6 + 0.4 * noise3(s * 6, 0, 7))) - (s > 0.7 ? (s - 0.7) * 1.2 : 0);
      if (t > len) return false;
      return !(noise3(s * 14, t * 9, 8) > 0.74 && t > 0.1);
    }, 0.7));
  // slack stays to the bow and to the stern
  const sag = (p0: V3, p1: V3, dd: number) => {
    const n = 8; let prev = p0;
    for (let i = 1; i <= n; i++) { const k = i / n, q: V3 = [p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k, p0[2] + (p1[2] - p0[2]) * k - Math.sin(k * Math.PI) * dd]; P.push(rod(prev, q, 0.45, rope, 0.45, 0.05)); prev = q; }
  };
  sag(mp(110), toWorld(-L - 22, 0, gunC(-1) - 15), 8);
  sag(mp(98), toWorld(L * 0.62, -BEAM * 0.6, gunC(0.62)), 14 + Math.sin(ph) * 2);

  return { prims: P, eyes, halos: [{ p: toWorld(BREACH[0], BEAM * 0.4, 8), r: 26, col: 0xe26fa8, a: 0.35 + pulse * 0.1 }], cast: 8 };
}

export const WRECK3D: { key: string; w: number; h: number; frames: number; ox: number; oy: number; model: (f: number) => PropModel }[] = [
  // the breach's foot sits at the sprite's foot (x 150, bottom), where the Brood Heart stands
  { key: "wp_shipwreck", w: 300, h: 200, frames: N, ...(() => { const [u, v, z] = toWorld(BREACH[0], BEAM * 0.8, keelC(tOf(BREACH[0]))); return { ox: Math.round(150 - (u - v)), oy: Math.round(189 - (u + v) / 2 + z) }; })(), model: wreck },
];
