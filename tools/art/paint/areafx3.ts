/**
 * Solid things in area spells (client/src/skillfx.ts showArea / fields) rebuilt as 3D models and baked, the second
 * step of the effects rebuild after the shots (paint/shots3d.ts): ground spikes (Crimson Tide, Quake, traps), the
 * Summoner's orbiting void blades (16 headings, like the arrows), the Native Soil grave-earth patch, and the archived
 * classes' falling Judgement sword, Avalanche boulder and rain arrow. Same light and 1.5 texels per world px as the
 * shots; ground things are modelled from their foot (origin = the ground point, given per entry). Rings, sparks,
 * dust and glows stay runtime particles.
 */
import { mat, noise3, cone, rbox, type Mat, type Prim } from "./mob3d";
import { blob, rod, type PropModel, type V3 } from "./prop3d";
import { FX_TX, type FxEntry } from "./shots3d";

const M = (pal: number[], o: Parameters<typeof mat>[1] = {}): Mat => mat(0, { ramp: pal, ...o });
const S = FX_TX, R2 = Math.SQRT2, YAW = -Math.PI / 4;
/** Facing-the-viewer frame: X to the right on screen (screen px), D away from the viewer, Z up. */
const fw = (X: number, D: number, Z: number): V3 => [X / 2 + D / R2, -X / 2 + D / R2, Z];
const fbox = (X0: number, X1: number, D0: number, D1: number, Z0: number, Z1: number, m: Mat, rr = 0.5, k = 0.3) =>
  rbox(fw((X0 + X1) / 2, (D0 + D1) / 2, (Z0 + Z1) / 2), [Math.max(0.05, (X1 - X0) / 2 / R2 - rr), Math.max(0.05, (D1 - D0) / 2 - rr), Math.max(0.05, (Z1 - Z0) / 2 - rr)], rr, m, { yaw: YAW, k });

const STEEL = [0x1e242c, 0x37474f, 0x6d7d99, 0xa8b4c8, 0xdfe6f0, 0xffffff];
const BLOOD = [0x1e0000, 0x3a0000, 0x6d0000, 0x9b1b1b, 0xb71c1c, 0xe63946, 0xff8a94];
const ROCK = [0x1a1410, 0x2e241c, 0x4a3a2c, 0x6a5440, 0x8a7258, 0xa89070];
const ICE = [0x123a5a, 0x2a6fdb, 0x4cc9f0, 0x8be9ff, 0xd6f6ff, 0xffffff];
const VOID = [0x120820, 0x2a1446, 0x4a2a80, 0x7a4ad0, 0xb48cff, 0xf0e4ff];
const SOIL = [0x120b07, 0x1b120d, 0x24170f, 0x2e1f16, 0x3e2a1d, 0x4a3324];
const BONE = [0x4a4438, 0x8f887a, 0xb8b09c, 0xd8d0b8, 0xece6d4];
const GOLD = [0x3a2408, 0x7a5010, 0xc08a20, 0xffd166, 0xfff3b0, 0xffffff];
const HOLY = [0x7a6a3a, 0xc8b878, 0xf0e6b0, 0xfff8d8, 0xffffff];
const PALEWOOD = [0x3a2a18, 0x6d5034, 0x9c7c58, 0xc0a078, 0xd8b98a];
const RED = [0x3a0a0e, 0x7a1418, 0xb0242a, 0xe63946];

type Model = (f: number) => PropModel;

/**
 * A spike bursting from the ground, 12 world px tall: frame f picks one of three shapes (one lone spike, a spike with
 * a shard beside it, a leaning pair) so a field of them doesn't repeat.
 */
const spike = (kind: "blood" | "earth" | "frost" | "steel"): Model => (f) => {
  const H = 12 * S, P: Prim[] = [];
  const m = kind === "blood" ? M(BLOOD, { spec: 0.8, shine: 16, grain: 0.05, tex: (x, y, z) => (noise3(x * 0.5, y * 0.5, z * 0.3) - 0.5) * 0.3 - 0.1 })
    : kind === "earth" ? M(ROCK, { grain: 0.25, tex: (x, y, z) => (noise3(x * 0.6, y * 0.6, z * 0.6) - 0.5) * 0.5 })
    : kind === "frost" ? M(ICE, { spec: 0.9, shine: 22, emit: 0.2, tex: (x, y, z) => (Math.abs(((x - y + z * 0.5) % 4 + 4) % 4 - 2) < 0.3 ? 0.18 : 0) })
    : M(STEEL, { spec: 0.9, shine: 20, grain: 0.04 });
  const lean = [[0.12, -0.08], [-0.15, 0.1], [0.2, 0.18]][f % 3];
  const r = kind === "steel" ? 2.2 * S : 3 * S;
  P.push(cone([0, 0, -1], [lean[0] * H, lean[1] * H, H], r, m, { k: 0.4 }));
  if (f >= 1) P.push(cone([2.6 * S, -1.8 * S, -1], [4.4 * S, -3.2 * S, H * 0.55], r * 0.6, m, { k: 0.4 }));
  if (f === 2) P.push(cone([-2.4 * S, 2 * S, -1], [-4.6 * S, 2.6 * S, H * 0.7], r * 0.7, m, { k: 0.4 }));
  // the ground it tore open: clods (rock and blood) or frost crust round the foot
  const base = kind === "frost" ? M(ICE.slice(1), { spec: 0.6, emit: 0.1 }) : M(ROCK.slice(0, 5), { grain: 0.3 });
  for (let i = 0; i < 4; i++) { const a = i * 1.7 + f; P.push(blob([Math.cos(a) * 3.4 * S, Math.sin(a) * 3.4 * S, 0], 1 * S, 0.9 * S, 0.7 * S, base, 0.4, 0)); }
  if (kind === "blood") for (let i = 0; i < 3; i++) P.push(blob([lean[0] * H * (0.3 + i * 0.2) + 0.8, lean[1] * H * (0.3 + i * 0.2) + 0.8, H * (0.3 + i * 0.2)], 0.6 * S, 0.6 * S, 0.9 * S, M(BLOOD.slice(2), { spec: 0.7, shine: 12 }), 0.4)); // drips
  return { prims: P, shadow: [{ u: 0, v: 0, r: 4 * S, a: 0.35 }] };
};

/** One of the Summoner's void blades, 8 world px, pointing along +u, lying tilted so both faces catch the light. */
const voidBlade: Model = () => {
  const L = 8 * S, roll = 0.6, cr = Math.cos(roll), sr = Math.sin(roll);
  const ridge = M(VOID.slice(3), { emit: 0.55, spec: 0.6, shine: 14 });
  const m = { ...M(VOID.slice(0, 4), { spec: 0.8, shine: 18 }), sub: (x: number, y: number) => (Math.abs(y) < 0.45 && x > -0.2 * L ? ridge : undefined) };
  const hw = (x: number) => (x < 0.1 * L ? 1.8 * S * (x + 0.45 * L) / (0.55 * L) : 1.8 * S * (L - x) / (0.9 * L));
  return { prims: [{ m, k: 0.2, lo: [-0.5 * L, -3 * S, -3 * S], hi: [L + 1, 3 * S, 3 * S], d: (x: number, y: number, z: number) => {
    const yy = y * cr + z * sr, zz = -y * sr + z * cr;
    return Math.max(Math.abs(yy) - Math.max(0, hw(x)), Math.abs(zz) - 0.4, -x - 0.45 * L, x - L) * 0.8;
  } }] };
};

/** Native Soil: a patch of dark grave earth heaped over the ground, clods and bone chips, for a 40 px field. */
const graveSoil: Model = () => {
  const R = (40 / R2) * S, P: Prim[] = [];
  const soil = M(SOIL, { grain: 0.35, tex: (x, y, z) => (noise3(x * 0.25, y * 0.25, z) - 0.5) * 0.6 });
  P.push({ m: soil, k: 0.5, lo: [-R - 4, -R - 4, -1], hi: [R + 4, R + 4, 4], d: (x, y, z) => {
    const q = Math.hypot(x, y), edge = R * (0.92 + (noise3(x * 0.12, y * 0.12, 0) - 0.5) * 0.3), h = 1.4 + 1.2 * Math.max(0, 1 - q / edge);
    return Math.max(q - edge, z - h, -z);
  } });
  for (let i = 0; i < 22; i++) {
    const a = i * 2.39996, d = Math.sqrt((i + 0.5) / 22) * R * 0.88, s = 0.8 + ((i * 7) % 5) * 0.25;
    P.push(blob([Math.cos(a) * d, Math.sin(a) * d, 1.2], 1.4 * s, 1.1 * s, 1 * s, M(SOIL.slice(2), { grain: 0.3 }), 0.5, 0));
  }
  const bone = M(BONE, { grain: 0.1, spec: 0.2 });
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3 + 0.4, d = R * (0.25 + (i % 3) * 0.2), b = a * 2.1;
    const c: V3 = [Math.cos(a) * d, Math.sin(a) * d, 1.6];
    P.push(rod([c[0] - Math.cos(b) * 2.2, c[1] - Math.sin(b) * 2.2, c[2]], [c[0] + Math.cos(b) * 2.2, c[1] + Math.sin(b) * 2.2, c[2] + 0.4], 0.55, bone, 0.55, 0.3));
  }
  P.push(blob([R * 0.3, -R * 0.35, 2], 1.6, 1.5, 1.5, bone, 0.4)); // a small skull, half buried
  return { prims: P };
};

/** Judgement: a giant sword of light, point down at the origin (the ground), 60 px blade, facing the viewer. */
const judgement: Model = () => {
  const P: Prim[] = [], L = 60 * S, W = 7 * S;
  const steel = M(HOLY, { emit: 0.45, spec: 0.9, shine: 20 });
  const fuller = M([0xfff8d8, 0xffffff], { emit: 0.9 });
  P.push({ m: { ...steel, sub: (x: number, y: number) => (Math.abs(x - y) < 1.6 * R2 ? fuller : undefined) } as Mat, k: 0.2, lo: [-W - 4, -W - 4, 0], hi: [W + 4, W + 4, L], d: (x, y, z) => {
    const X = (x - y) / R2, D = (x + y) / R2, w = z < 14 * S ? (W * z) / (14 * S) : W;
    return Math.max(Math.abs(X) - w / R2, Math.abs(D) - 1.1, -z, z - L) * 0.8;
  } });
  const gold = M(GOLD, { spec: 0.8, shine: 16, emit: 0.2 });
  P.push(fbox(-W - 8 * S, W + 8 * S, -2, 2, L, L + 4 * S, gold, 1.2));
  P.push(fbox(-2 * S, 2 * S, -1.6, 1.6, L + 4 * S, L + 18 * S, M(PALEWOOD, { grain: 0.1 }), 1));
  P.push(blob(fw(0, 0, L + 20 * S), 3.2 * S, 3.2 * S, 2.6 * S, gold, 0.4));
  return { prims: P, halos: [{ p: fw(0, 0, L * 0.5), r: 14 * S, col: 0xfff3b0, a: 0.25 }] };
};

/** Avalanche boulder: a rough rock, 14 px across (the client spins it as it falls). */
const boulder: Model = () => ({ prims: [{ ...blob([0, 0, 0], 7 * S, 6.4 * S, 6 * S, M(ROCK, { grain: 0.3, tex: (x, y, z) => (noise3(x * 0.3, y * 0.3, z * 0.3) - 0.5) * 0.6 }), 0.4),
  d: (x, y, z) => Math.hypot(x / 1.1, y, z / 0.95) - 6.6 * S - (noise3(x * 0.18, y * 0.18, z * 0.18) - 0.5) * 4 }] });

/** A rain arrow falling point down. */
const rainArrow: Model = () => {
  const L = 9 * S, P: Prim[] = [];
  P.push(rod([0, 0, 2.4 * S], [0, 0, L + 2.4 * S], 0.45 * S, M(PALEWOOD, { grain: 0.04 }), 0.45 * S, 0.2));
  P.push(cone([0, 0, 2.6 * S], [0, 0, 0], 1.1 * S, M(STEEL, { spec: 0.8, shine: 18 }), { k: 0.2 }));
  for (const s of [-1, 1]) P.push(fbox(s < 0 ? -1.6 * S : 0.2, s < 0 ? -0.2 : 1.6 * S, -0.3, 0.3, L - 1 * S, L + 2 * S, M(RED), 0.2));
  return { prims: P };
};

/** Area sheets: [entry, origin x, origin y] (origin = the ground point or centre the client places at the event). */
export const AREA3D: (FxEntry & { frames: number; ox: number; oy: number })[] = [
  { key: "spike_blood", w: 26, h: 34, frames: 3, ox: 13, oy: 28, dir: false, outline: true, model: spike("blood") },
  { key: "spike_earth", w: 26, h: 34, frames: 3, ox: 13, oy: 28, dir: false, outline: true, model: spike("earth") },
  { key: "spike_frost", w: 26, h: 34, frames: 3, ox: 13, oy: 28, dir: false, outline: true, model: spike("frost") },
  { key: "spike_steel", w: 26, h: 34, frames: 3, ox: 13, oy: 28, dir: false, outline: true, model: spike("steel") },
  { key: "voidblade", w: 22, h: 16, frames: 1, ox: 11, oy: 8, dir: true, outline: true, model: voidBlade },
  { key: "gravesoil", w: 130, h: 72, frames: 1, ox: 65, oy: 36, dir: false, outline: false, model: graveSoil },
  { key: "judgement", w: 60, h: 132, frames: 1, ox: 30, oy: 128, dir: false, outline: true, model: judgement },
  { key: "boulder", w: 26, h: 26, frames: 1, ox: 13, oy: 13, dir: false, outline: true, model: boulder },
  { key: "rainarrow", w: 10, h: 24, frames: 1, ox: 5, oy: 21, dir: false, outline: true, model: rainArrow },
];
