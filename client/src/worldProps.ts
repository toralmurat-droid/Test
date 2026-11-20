import Phaser from "phaser";
import { STD3D, STD3D_KEYS } from "./standard3d";
import { staticObj } from "./staticChunks";
import { TILE } from "../../shared/constants";
import { AREAS, BARNS, EMPTY, GROUND, HOLLOW, HOLLOW_WARDS, OBJECTS, SIGNPOSTS, T, VILLAGE, WRECK } from "../../shared/map";
import { CAMP_TOWERS } from "../../shared/bandits";
import { standingStone, STONE_H, STONE_W, throne, THRONE_H, THRONE_W } from "./throneArt";
import { NPCS, NPC_DECOR } from "../../shared/npcs";
import { CHESTS } from "../../shared/chests";
import { SIEGE_SITES } from "../../shared/siege";
import { ELEMENT_LANDS } from "../../shared/map";
import { COW_FOOT_U, COW_FOOT_V, COW_H, COW_W, cow } from "./farmArt";
import { MILL_FOOT_U, MILL_FOOT_V, MILL_H, MILL_W, millWheel } from "./millArt";
import { BLACKR, dummy, lanternPole, netRack, REDR, skullPike, spearRack, warPennant, watchtower as watchtowerArt } from "./isoProps";
import { addSaltmereProps } from "./saltmereArt";
import { emberVent, iceSpikes, ICE_H, ICE_W, stormStone, STORM_H, STORM_W, venomCaps, VENOM_H, VENOM_W, VENT_H, VENT_W } from "./elementArt";

/**
 * Standing world props with idle animations: spear racks with fluttering pennants, war pennants on tall poles,
 * swaying training dummies, lantern poles with swinging lanterns (lit at night), bandit skull pikes with flapping
 * rags, fishing-net racks with fish swinging in the wind, and broken spears left on old battlefields.
 *
 * Pixel art painted in code at 1.5 texels per world px (the world's pixel grid, see pixelgrid.ts), light from the
 * top left, weathered dark palette, 1px dark outline. Purely cosmetic: walk-through, client only.
 */
const TX = 1.5; // texels per world px
export const OUTLINE = 0x15100d;

// ---- painter -------------------------------------------------------------------------------------------
export type Px = (x: number, y: number, c: number, a?: number) => void;
export interface Pen {
  px: Px;
  line(x0: number, y0: number, x1: number, y1: number, c: number): void;
  rect(x: number, y: number, w: number, h: number, c: number): void;
  /** Wooden shaft from (x0,y0) to (x1,y1): light left edge, dark right edge. */
  shaft(x0: number, y0: number, x1: number, y1: number, w?: number, cols?: [number, number, number]): void;
}

export function pen(buf: Uint32Array, W: number, H: number): Pen {
  const px: Px = (x, y, c, a = 1) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (a >= 1) { buf[i] = 0xff000000 | c; return; }
    const o = buf[i], oa = o >>> 24;
    if (!oa) { buf[i] = (Math.round(a * 255) << 24) | c; return; }
    const mixc = (s: number) => Math.round(((o >> s) & 255) * (1 - a) + ((c >> s) & 255) * a) << s;
    buf[i] = (0xff000000 | mixc(16) | mixc(8) | mixc(0)) >>> 0;
  };
  const line = (x0: number, y0: number, x1: number, y1: number, c: number) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c);
  };
  const rect = (x: number, y: number, w: number, h: number, c: number) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
  const shaft = (x0: number, y0: number, x1: number, y1: number, w = 2, cols: [number, number, number] = WOOD) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
      for (let k = 0; k < w; k++) px(x + k, y, k === 0 ? cols[0] : k === w - 1 ? cols[2] : cols[1]);
      if (((i * 7) % 11) === 3) px(x + Math.floor(w / 2), y, cols[2]); // grain knots
    }
  };
  return { px, line, rect, shaft };
}

/**
 * Props rebuilt as 3D models and baked to sheets (tools/art/bake-props.ts, Murat 2026-11-17): loaded under the painted
 * props' keys, so sheet() finds them and skips painting. A sheet that fails to load falls back to the painted one.
 */
export const BAKED_PROPS: Record<string, [number, number]> = {
  wp_lantern_pole: [32, 90], wp_dummy: [34, 58], wp_skull_pike: [26, 72], wp_pennant_red: [44, 100], wp_pennant_black: [44, 100],
  wp_net_rack: [54, 50], wp_spear_rack: [56, 80], wp_weapon_rack: [56, 80], wp_watchtower: [60, 126], wp_spears_ground: [40, 54],
  wp_cow0: [COW_W, COW_H], wp_cow1: [COW_W, COW_H], wp_millwheel: [MILL_W, MILL_H], wp_shipwreck: [300, 200],
  siege_catapult: [152, 118], siege_ram: [144, 104], siege_tower: [116, 192], siege_lumber: [112, 62], siege_sawhorse: [60, 40],
  dg_brazier: [32, 50], dg_torch: [18, 58], dg_rack: [50, 54], dg_pole: [30, 58], dg_spike: [22, 44],
  dp_candles: [30, 30], dp_skulls: [40, 40], dp_jar: [24, 30],
  wp_venom_caps: [34, 30], wp_ice_spikes: [34, 40], wp_ember_vent: [34, 34], wp_storm_stone: [30, 50], wp_hollow_throne: [108, 120],
  wp_crownstone0: [30, 54], wp_crownstone1: [30, 54], wp_crownstone2: [30, 54], qobj_ward: [30, 54], qobj_ward_broken: [30, 54],
  wc_tent: [132, 110],
  qobj_shard_poison: [36, 50], qobj_shard_cold: [36, 50], qobj_shard_fire: [36, 50], qobj_shard_shock: [36, 50],
  qobj_shard_poison_broken: [36, 50], qobj_shard_cold_broken: [36, 50], qobj_shard_fire_broken: [36, 50], qobj_shard_shock_broken: [36, 50],
  qobj_lantern_off: [34, 72], qobj_lantern_lit: [34, 72],
  qobj_silk: [30, 50], qobj_silk_cut: [30, 50], qobj_totem: [40, 76], qobj_totem_burnt: [40, 76],
};
export function preloadBakedProps(scene: Phaser.Scene) {
  for (const [k, [w, h]] of Object.entries(BAKED_PROPS)) if (!scene.textures.exists(k)) scene.load.spritesheet(k, `assets/hd/props/${k}.png`, { frameWidth: w, frameHeight: h });
  for (const k of STD3D_KEYS) if (!scene.textures.exists(k)) scene.load.spritesheet(k, `assets/hd/props/${k}.png`, { frameWidth: STD3D.w, frameHeight: STD3D.h }); // clan war standards (warStandards.ts)
}

/** Paints `frames` frames side by side, outlines each silhouette, and registers the spritesheet texture. */
export function sheet(scene: Phaser.Scene, key: string, w: number, h: number, frames: number, draw: (p: Pen, f: number) => void, shadow = 0.5) {
  if (scene.textures.exists(key)) { scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST); return; }
  const tex = scene.textures.createCanvas(key, w * frames, h)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w * frames, h);
  const out = new Uint32Array(img.data.buffer);
  for (let f = 0; f < frames; f++) {
    const buf = new Uint32Array(w * h);
    draw(pen(buf, w, h), f);
    // 1px dark outline around the silhouette
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && buf[y * w + x] >>> 24 > 140;
    const ol = new Uint32Array(buf);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) ol[y * w + x] = (0xe0 << 24 | OUTLINE) >>> 0;
    }
    // soft contact shadow at the foot
    if (shadow > 0) for (let y = h - 4; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / (w * 0.42), dy = (y - (h - 2)) / 2.2;
      if (dx * dx + dy * dy <= 1 && !(ol[y * w + x] >>> 24)) ol[y * w + x] = (Math.round(shadow * 120) << 24) >>> 0;
    }
    // RGBA byte order in the ImageData: swap red and blue
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = ol[y * w + x];
      out[y * w * frames + f * w + x] = ((v & 0xff00ff00) | ((v >> 16) & 255) | ((v & 255) << 16)) >>> 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  for (let f = 0; f < frames; f++) tex.add(f, 0, f * w, 0, w, h);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

// ---- palette (dark, weathered) -------------------------------------------------------------------------
export const WOOD: [number, number, number] = [0x7d5c3c, 0x5a3f28, 0x3a281a];
export const OLDWOOD: [number, number, number] = [0x6e665a, 0x504a40, 0x34302a];
export const IRON = { hi: 0xb4b8bc, mid: 0x7a7f86, lo: 0x43474d };
export const ROPE = 0x9a8458;
export const BONE = { hi: 0xe2dac4, mid: 0xb8ae94, lo: 0x7a705c };

/** Spear head pointing up with its tip at (x, y). */
export function spearHead(p: Pen, x: number, y: number) {
  for (let j = 0; j < 7; j++) {
    const half = j < 3 ? j * 0.5 : (6 - j) * 0.45 + 0.4;
    for (let i = -Math.round(half); i <= Math.round(half); i++) p.px(x + i, y + j, i < 0 ? IRON.hi : i > 0 ? IRON.lo : IRON.mid);
  }
  p.px(x, y + 7, IRON.lo); p.px(x - 1, y + 8, ROPE); p.px(x, y + 8, ROPE); p.px(x + 1, y + 8, 0x6a5a3a); // socket binding
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dith = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];
/** Colour for a continuous shade `v` (0 = darkest step) with the fraction between two steps dithered. */
const step = (pal: number[], v: number, x: number, y: number) => {
  const c = Math.max(0, Math.min(pal.length - 1, v)), i = Math.floor(c);
  return pal[Math.min(pal.length - 1, c - i > dith(x, y) ? i + 1 : i)];
};

// ---- the props ------------------------------------------------------------------------------------------
const N = 6; // animation frames per prop

function makeTextures(scene: Phaser.Scene) {
  // Weapon racks (smithy and camps), pennants, dummies, lantern poles, skull pikes and net racks: true isometric
  // pixel art modelled in isoProps.ts (Murat 2026-11-13: the face-on versions looked flat).
  sheet(scene, "wp_spear_rack", 56, 80, N, spearRack(true), 0);
  sheet(scene, "wp_venom_caps", VENOM_W, VENOM_H, N, venomCaps, 0.4);
  sheet(scene, "wp_ice_spikes", ICE_W, ICE_H, N, iceSpikes, 0.45);
  sheet(scene, "wp_ember_vent", VENT_W, VENT_H, N, emberVent, 0.4);
  sheet(scene, "wp_storm_stone", STORM_W, STORM_H, N, stormStone, 0.5);
  sheet(scene, "wp_weapon_rack", 56, 80, 1, spearRack(false), 0);
  sheet(scene, "wp_pennant_red", 44, 100, N, warPennant(REDR, false), 0);
  sheet(scene, "wp_pennant_black", 44, 100, N, warPennant(BLACKR, true), 0);
  sheet(scene, "wp_dummy", 34, 58, N, dummy, 0);
  sheet(scene, "wp_lantern_pole", 32, 90, N, lanternPole, 0);
  sheet(scene, "wp_skull_pike", 26, 72, N, skullPike, 0);
  sheet(scene, "wp_net_rack", 54, 50, N, netRack, 0);

  // Broken spears stuck in the ground, a rope end on one, a shield half buried
  sheet(scene, "wp_spears_ground", 40, 54, N, (p, f) => {
    const t = (f / N) * Math.PI * 2;
    p.shaft(9, 52, 15, 12, 2, OLDWOOD); spearHead(p, 16, 5);
    p.shaft(22, 52, 18, 26, 2, OLDWOOD); p.px(17, 25, OLDWOOD[0]); p.px(19, 24, OLDWOOD[2]); // snapped
    p.shaft(30, 52, 34, 18, 2, OLDWOOD); spearHead(p, 35, 11);
    // a frayed rope binding swinging from the snapped shaft (no cloth: no flags where the dead march)
    for (let i = 0; i < 6; i++) p.px(19 + Math.round(Math.sin(t) * i * 0.25), 27 + i, i % 2 ? ROPE : 0x6a5a3a);
    // round shield leaning at the foot
    for (let y = 40; y < 53; y++) for (let x = 17; x < 31; x++) {
      const dx = (x - 24) / 7, dy = (y - 47) / 6.2;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      p.px(x, y, d > 0.72 ? (dx < 0 ? 0x8a8e94 : 0x4a4e54) : (x + y) % 5 === 0 ? 0x4a3420 : dx < -0.2 && dy < 0 ? 0x7a5634 : 0x5e4028);
    }
    p.rect(23, 46, 3, 2, IRON.mid); p.px(23, 46, IRON.hi);
  }, 0.5);
}

/** Redfang watchtower (shared/bandits.ts), modelled in isoProps.ts; its deck top is PERCH_LIFT above the foot. */
function watchtower(scene: Phaser.Scene) {
  sheet(scene, "wp_watchtower", 60, 126, N, watchtowerArt, 0);
}


// ---- the wreck of the Grey Heron (Heronwreck Strand, blob quest chain) -------------------------------------
const SAIL = [0x3a3226, 0x5e5240, 0x837458, 0xa8987a, 0xc8baa0];     // salt-stained canvas
const HULL = [0x1a120c, 0x2e2016, 0x463222, 0x5e4630, 0x7a5e42, 0x96785a]; // sea-bleached planks
const DECK = [0x2a1e14, 0x463424, 0x624a34, 0x7e6248];
const WEED = [0x16200f, 0x223218, 0x34481f];
const OOZE = [0x2a0e20, 0x5a1440, 0x9b2c6b, 0xe26fa8, 0xffc4e2];
const GLOAM_GREEN = [0x1e3a18, 0x3a6a2a, 0x6aa848];
const wHash = (x: number, y: number, s: number) => { let h = Math.imul(x * 73 + 11 + s * 977, 374761393) ^ Math.imul(y + 5 + s * 131, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const wNoise = (x: number, y: number, s: number) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = wHash(ix, iy, s), b = wHash(ix + 1, iy, s), c = wHash(ix, iy + 1, s), d = wHash(ix + 1, iy + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};
export const WRECK_W = 300, WRECK_H = 200;

/**
 * A merchant cog lying on the sand, bow raised to the upper left, her stern smashed into the surf at the lower right.
 * The hull runs along the world x axis, so in the iso view she lies along the shore. Planked side lit from the top
 * left with sea-bleached strakes, weed and barnacles at the waterline, a sliver of broken deck, a breach in her side
 * showing the ribs and the hold (where the Brood Heart glows), a snapped mast with a torn sail flapping on its yard.
 */
function shipwreck(p: Pen, f: number) {
  const t = (f / N) * Math.PI * 2;
  // the breach sits right above the sprite's foot (x 150, bottom), so the Brood Heart drawn there stands in it
  const X0 = 14, X1 = 262;                  // bow tip .. smashed stern
  const keel = (u: number) => 126 + u * 112 + Math.sin(u * Math.PI) * 4 - (u > 0.55 ? (u - 0.55) * 95 : 0)
    - (u < 0.16 ? Math.pow((0.16 - u) / 0.16, 1.6) * 44 : 0); // keel line, bow up (curving up into the stem), stern down in the surf
  const side = (u: number) => (u < 0.1 ? 0.35 + 6.5 * u : 1) * (50 + 34 * Math.pow(1 - u, 2)); // side height, the bow rises high
  const gun = (u: number) => keel(u) - side(u) - (u < 0.12 ? (0.12 - u) * 90 : 0);  // gunwale with the bow's sheer
  const deckW = (u: number) => Math.max(0, 26 * Math.pow(Math.sin(Math.min(1, u * 1.15) * Math.PI), 0.7) - 2); // she heels toward us: we see her deck
  // breach in her side (the hold), with a ragged edge
  const breach = (x: number, y: number, u: number) => {
    const v = (y - gun(u)) / (keel(u) - gun(u));
    const cu = (u - 0.55) / 0.12, cv = (v - 0.56) / 0.4;
    return cu * cu + cv * cv < 0.75 + 0.5 * wNoise(x * 0.25, y * 0.25, 3);
  };
  // the stern is smashed: planks end raggedly
  const smashed = (x: number, y: number, u: number) => u > 0.86 && (u - 0.86) * 9 > 0.25 + 0.75 * wNoise(x * 0.12, y * 0.6, 4) + ((y >> 2) % 2) * 0.12;

  // --- her shadow on the sand ---
  for (let x = X0 - 4; x <= X1 - 4; x++) {
    const u = Math.min(1, Math.max(0, (x - X0) / (X1 - X0))), k = keel(u);
    for (let j = -2; j < 9; j++) if (wHash(x, j, 24) < 0.92) p.px(x + 4, k + j, 0x0e0a08, j < 3 ? 0.42 : 0.42 - (j - 3) * 0.06);
  }
  // --- snapped mast behind the hull, a yard hanging askew with a torn sail ---
  const mu = 0.34, mx = X0 + (X1 - X0) * mu, mBase = gun(mu) - deckW(mu) * 0.5;
  const mTop = 18, lean = -10;
  const mastX = (y: number) => mx + lean * (mBase - y) / (mBase - mTop);
  for (let y = mTop; y < mBase; y++) for (let k = 0; k < 5; k++) p.px(mastX(y) - 2 + k, y, k === 0 ? HULL[5] : k < 2 ? HULL[4] : k < 4 ? HULL[3] : HULL[1]);
  for (let k = 0; k < 6; k++) p.px(mastX(mTop) - 2 + k, mTop - 1 - (k % 3 === 1 ? 3 : k % 2), HULL[k < 3 ? 4 : 2]); // splintered top
  for (const y of [40, 66, 92]) { p.line(mastX(y) - 3, y, mastX(y) + 3, y, ROPE); p.line(mastX(y) - 3, y + 1, mastX(y) + 3, y + 1, 0x6a5a3a); } // iron bands, rope lashings
  // a gull keeps watch on the stump
  { const gx = mastX(mTop) - 1, gy = mTop - 4, bob = f % 3 === 0 ? 0 : 0;
    p.rect(gx - 3, gy - 3 + bob, 7, 3, 0xe8e4dc); p.rect(gx - 2, gy - 6 + bob, 3, 3, 0xf4f0ea); p.px(gx - 3, gy - 5 + bob, 0xe0a030);
    p.px(gx - 1, gy - 5 + bob, 0x101010); p.rect(gx + 1, gy - 3 + bob, 4, 1, 0x7a7e86); p.px(gx + 4, gy - 2 + bob, 0x5a5e66); }
  // yard: hangs from one rope, tilted, swinging a little
  const sw = Math.sin(t) * 1.5;
  const yA = { x: mastX(44) - 34, y: 36 + sw }, yB = { x: mastX(44) + 46, y: 58 - sw };
  p.line(mastX(30), 30, yA.x + 8, yA.y, ROPE); p.line(mastX(38), 38, yB.x - 6, yB.y, ROPE);
  // sail: hangs from the yard, torn, the loose end flapping
  for (let i = 0; i <= 80; i++) {
    const k = i / 80, tx = yA.x + (yB.x - yA.x) * k, ty = yA.y + (yB.y - yA.y) * k;
    const len = 26 + 34 * Math.sin(k * Math.PI * 0.9) * (0.6 + 0.4 * wNoise(i * 0.3, 0, 7)) - (k > 0.7 ? (k - 0.7) * 60 : 0);
    for (let j = 2; j < len; j++) {
      const fl = Math.sin(t + k * 4 + j * 0.08) * (j / 60) * 4, x = tx + fl + j * 0.12, y = ty + j;
      const hole = wNoise(x * 0.18, j * 0.18, 8) > 0.72 && j > 6;
      if (hole) continue;
      const fold = Math.sin(k * 22 + t * 0.5 + j * 0.02);
      let lv = 2.6 + fold * 0.9 - j / len * 1.2 - k * 0.6;
      if (j > len - 3) lv -= 1.2; // ragged dark hem
      const c = step(SAIL, lv, Math.round(x), y);
      p.px(x, y, wHash(Math.round(x), y, 9) < 0.04 ? 0x4a3e2c : c); // salt stains
    }
  }
  for (let i = 0; i <= 80; i++) { const k = i / 80; p.px(yA.x + (yB.x - yA.x) * k, yA.y + (yB.y - yA.y) * k, HULL[4]); p.px(yA.x + (yB.x - yA.x) * k, yA.y + (yB.y - yA.y) * k + 1, HULL[2]); }
  // rigging: slack stays to the bow and to the stern
  const sag = (x0: number, y0: number, x1: number, y1: number, d: number) => { for (let i = 0; i <= 120; i++) { const k = i / 120; p.px(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * d, 0x4a3e2c); } };
  sag(mastX(24), 24, X0 + 6, gun(0.02) - 12, 10);
  sag(mastX(50), 50, X0 + (X1 - X0) * 0.8, gun(0.8) - 4, 16 + Math.sin(t) * 2);

  // --- deck (seen past the gunwale, tilted toward us) ---
  for (let x = X0; x <= X1; x++) {
    const u = (x - X0) / (X1 - X0), g = gun(u), dw = deckW(u);
    for (let y = Math.round(g - dw); y < g; y++) {
      if (u > 0.84 && wNoise(x * 0.2, y * 0.3, 11) > 0.45) continue; // stern deck is gone
      if (u > 0.55 && u < 0.72 && y > g - dw * 0.7 && wNoise(x * 0.15, y * 0.3, 12) > 0.5) { p.px(x, y, HULL[0]); continue; } // stove-in deck
      const seam = Math.round(y - (g - dw)) % 4 === 0, butt = (x + Math.floor((y - g) / 4) * 13) % 23 === 0;
      p.px(x, y, seam || butt ? DECK[0] : step(DECK, 2.2 - (g - y) / Math.max(1, dw) * 0.8 + (wNoise(x * 0.3, y, 13) - 0.5), x, y));
    }
    // a cargo hatch, its cover gone: a dark square hole in the deck
    if (u > 0.2 && u < 0.27 && dw > 8) for (let y = Math.round(g - dw * 0.75); y < g - dw * 0.25; y++) p.px(x, y, u < 0.205 || y < g - dw * 0.72 ? DECK[3] : HULL[0]);
    // the far bulwark along the top of the deck, broken in places
    if (dw > 2 && u < 0.84 && wNoise(x * 0.09, 0, 23) > 0.3) { const y = Math.round(g - dw); p.px(x, y - 2, HULL[4]); p.px(x, y - 1, HULL[3]); p.px(x, y, HULL[1]); if (x % 11 === 0) for (let k = 0; k < 4; k++) p.px(x, y - 2 - k, HULL[k < 2 ? 3 : 4]); }
  }
  // --- hull side ---
  for (let x = X0; x <= X1; x++) {
    const u = (x - X0) / (X1 - X0), g = gun(u), kl = keel(u);
    for (let y = Math.round(g); y <= kl; y++) {
      if (smashed(x, y, u)) continue;
      const v = (y - g) / Math.max(1, kl - g);
      if (breach(x, y, u)) {
        // the hold: dark inside, ribs, and the Gloam's ooze glowing at the bottom
        const ribs = (x + Math.round(v * 4)) % 9 < 3;
        const glow = v > 0.55 ? (v - 0.55) * 2.2 * (0.75 + 0.25 * Math.sin(t + x * 0.05)) : 0;
        if (ribs) p.px(x, y, (x + Math.round(v * 4)) % 9 === 0 ? HULL[3] : HULL[1]);
        else if (glow > 0.25) p.px(x, y, step(OOZE, glow * 3.2 + wNoise(x * 0.2, y * 0.2 + t, 14) - 0.5, x, y));
        else p.px(x, y, (x + y) % 7 === 0 ? HULL[1] : HULL[0]);
        continue;
      }
      const strake = Math.floor(v * 9), sv = v * 9 - strake;
      let lv = 4.6 - Math.pow(v, 0.8) * 3.4 + (v < 0.12 ? 0.3 : 0) - (u > 0.8 ? (u - 0.8) * 4 : 0) + (wNoise(x * 0.08, strake * 3, 15) - 0.5) * 0.9 - (u < 0.06 ? 0.6 : 0);
      if (sv < 0.14) lv = 0.6;                                   // seam between strakes
      else if (sv > 0.82) lv -= 0.7;                             // underside of each plank
      if ((x + strake * 31) % 37 === 0) lv = 0.5;                 // butt joints
      let c = step(HULL, lv, x, y);
      if (v > 0.74 && wNoise(x * 0.15, y * 0.4, 16) > 0.5 - (v - 0.74) * 1.4) c = step(WEED, (wNoise(x * 0.3, y * 0.3, 17)) * 3, x, y); // weed at the waterline
      if (v > 0.7 && wHash(x, y, 18) < 0.018) c = BONE.lo;      // barnacles
      if (v > 0.8) c = step(HULL, Math.min(lv, 1.6) - (v - 0.8) * 3, x, y) === HULL[0] && wHash(x, y, 25) < 0.5 ? HULL[0] : c; // the bilge turns under, into shadow
      if (wHash(x >> 1, y >> 2, 19) < 0.012) c = 0x6a3a22;      // rust weeping from the nails
      p.px(x, y, c);
    }
    // gunwale rail
    if (!smashed(x, Math.round(g), u) && !(u > 0.86 && wNoise(x * 0.2, 0, 20) > 0.5)) { p.px(x, g - 1, HULL[5]); p.px(x, g, HULL[4]); p.px(x, g + 1, HULL[2]); }
  }
  // breach edge: splintered plank ends around the hole
  for (let x = X0; x <= X1; x++) {
    const u = (x - X0) / (X1 - X0), g = gun(u), kl = keel(u);
    for (let y = Math.round(g); y <= kl; y++) {
      if (!breach(x, y, u) || breach(x, y - 1, u) && breach(x - 1, y, u) && breach(x + 1, y, u) && breach(x, y + 1, u)) continue;
      p.px(x, y, HULL[5]);
      if (wHash(x, y, 21) < 0.25) p.px(x + 1, y + (y > (g + kl) / 2 ? 2 : -2), HULL[4]);
    }
  }
  // ooze spilling out of the breach onto the sand, a pink drip pulsing
  for (let i = 0; i < 30; i++) {
    const u = 0.5 + i * 0.0035, x = X0 + (X1 - X0) * u, y0 = keel(u) - 6;
    const len = 4 + Math.round(6 * wHash(i, 0, 22) + (i % 5 === 2 ? 1 + Math.sin(t) * 2 : 0));
    for (let j = 0; j < len; j++) p.px(x, y0 + j, j === len - 1 ? GLOAM_GREEN[0] : step(GLOAM_GREEN, 2.4 - j / len * 1.6, Math.round(x), y0 + j));
  }
  // bowsprit and figurehead stump
  p.shaft(X0 + 2, gun(0.01) + 2, X0 - 10, gun(0) - 26, 3, OLDWOOD);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 6; x++) if ((x - 2.5) ** 2 / 9 + (y - 4) ** 2 / 16 < 1) p.px(X0 + 1 + x, gun(0.01) + 4 + y, x < 2 ? HULL[4] : HULL[2]); // the heron, worn to a lump
  // broken stern timbers sticking up out of the surf
  for (const [x, h] of [[240, 26], [250, 18], [259, 30]] as const) { const u = (x - X0) / (X1 - X0); p.shaft(x, keel(u), x + 3, keel(u) - h, 2, HULL.slice(2, 5) as [number, number, number]); }
}

// ---- placement -------------------------------------------------------------------------------------------
type Kind = "wp_hollow_throne" | "wp_crownstone0" | "wp_crownstone1" | "wp_crownstone2" | "wp_shipwreck" | "wp_spear_rack" | "wp_pennant_red" | "wp_pennant_black" | "wp_dummy" | "wp_lantern_pole" | "wp_skull_pike" | "wp_net_rack" | "wp_spears_ground" | "wp_watchtower" | "wp_millwheel" | "wp_cow0" | "wp_cow1"
  | "wp_venom_caps" | "wp_ice_spikes" | "wp_ember_vent" | "wp_storm_stone";
interface Spot { kind: Kind; x: number; y: number; flip?: boolean; depth?: number }

const hash = (x: number, y: number, s: number) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const BAD_GROUND = new Set<number>([T.WATER, T.COBBLE, T.BRIDGE, T.CROPS, T.FIELD]);

/** Free tile for a standing prop: nothing on it or right around it, not on a road or in water, away from NPCs and chests. */
function free(tx: number, ty: number, taken: Spot[], gap: number): boolean {
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const o = OBJECTS[ty + j]?.[tx + i], g = GROUND[ty + j]?.[tx + i];
    if (o === undefined || o !== EMPTY || (i === 0 && j === 0 && BAD_GROUND.has(g)) || g === T.WATER) return false;
  }
  const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
  if (taken.some((s) => Math.hypot(s.x - cx, s.y - cy) < gap * TILE)) return false;
  if (NPCS.some((n) => Math.hypot(n.x - cx, n.y - cy) < 2.5 * TILE)) return false;
  if (NPC_DECOR.some((d) => Math.hypot(d.x * TILE - cx, d.y * TILE - cy) < 2 * TILE)) return false;
  if (CHESTS.some((c) => Math.hypot(c.x - cx, c.y - cy) < 2 * TILE)) return false;
  if (SIGNPOSTS.some((s) => Math.hypot((s.x + 0.5) * TILE - cx, (s.y + 0.5) * TILE - cy) < 2 * TILE)) return false;
  if (SIEGE_SITES.some((s) => Math.abs(s.tx - tx) <= 9 && Math.abs(s.ty - ty) <= 4)) return false; // siege works
  return true;
}

/** Up to `n` spots for `kind` inside the named area (deterministic, same on every client). */
function scatter(out: Spot[], area: string, kind: Kind, n: number, gap = 4, near?: (tx: number, ty: number) => boolean) {
  const a = AREAS.find((r) => r.name === area);
  if (!a) return;
  let placed = 0;
  for (let k = 0; k < 400 && placed < n; k++) {
    const tx = a.x + Math.floor(hash(k, n, kind.length * 31 + area.length) * a.w), ty = a.y + Math.floor(hash(n, k, kind.length * 17 + area.length * 3) * a.h);
    if (!free(tx, ty, out, gap) || (near && !near(tx, ty))) continue;
    out.push({ kind, x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, flip: hash(tx, ty, 5) < 0.5 && kind !== "wp_pennant_red" && kind !== "wp_pennant_black" && kind !== "wp_lantern_pole" });
    placed++;
  }
}

/** Within `r` tiles of a cobbled road (lantern poles line the roads). */
const byRoad = (r: number) => (tx: number, ty: number) => {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (GROUND[ty + j]?.[tx + i] === T.COBBLE) return true;
  return false;
};

function spots(): Spot[] {
  const out: Spot[] = [];
  // Oakvale: lantern poles along the roads, pennants, dummies to practise on (the smithy has its own weapon rack)
  scatter(out, "Oakvale", "wp_dummy", 2, 5, (tx, ty) => tx < VILLAGE.x0 + 9);
  scatter(out, "Oakvale", "wp_pennant_red", 2, 8);
  scatter(out, "Oakvale", "wp_lantern_pole", 6, 4, byRoad(1));
  // Hunter's Camp: a spear rack and a dummy
  scatter(out, "Hunter's Camp", "wp_spear_rack", 1, 3);
  scatter(out, "Hunter's Camp", "wp_dummy", 1, 3);
  // Skeleton lands (Watchtower, Keep, Barrows, Ruins): no flags or pennants, the dead don't camp. Their siege
  // works are in siegeArt.ts; only old broken spears lie around.
  scatter(out, "Old Watchtower", "wp_spears_ground", 2, 4);
  scatter(out, "Greywatch Keep", "wp_spears_ground", 4, 4);
  scatter(out, "Barrow Downs", "wp_spears_ground", 4, 6);
  scatter(out, "Old Ruins", "wp_spears_ground", 2, 5);
  // Redfang Hollow: skull pikes and the bandits' spear rack
  // the watchtowers first (fixed spots by the gates, manned by lookouts), so nothing else is put under them
  for (const [tx, ty] of CAMP_TOWERS) out.push({ kind: "wp_watchtower", x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }); // and Fangrock's and Talon Fort's (shared/bandits.ts CAMPS)
  scatter(out, "Redfang Hollow", "wp_skull_pike", 6, 3);
  scatter(out, "Redfang Hollow", "wp_spear_rack", 1, 4);
  // Heronwreck Strand: the Grey Heron (fixed spot, see WRECK in shared/map.ts)
  out.push({ kind: "wp_shipwreck", x: (WRECK.x + 0.5) * TILE, y: (WRECK.y + 0.6) * TILE });
  // The Hollow Throne: Ostrevar's throne on its dais, and a ring of crown-stones round the clearing (the three
  // ward-stones on the ring are quest objects, client/src/questObjects.ts)
  out.push({ kind: "wp_hollow_throne", x: (HOLLOW.cx + 0.5) * TILE, y: (HOLLOW.cy - 3.6) * TILE });
  const wardAng = HOLLOW_WARDS.map(([x, y]) => Math.atan2(y - HOLLOW.cy, x - HOLLOW.cx));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2;
    if (wardAng.some((w) => Math.abs(Math.atan2(Math.sin(a - w), Math.cos(a - w))) < 0.4)) continue;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.3) continue; // the King's Way comes in from the south
    const tx = HOLLOW.cx + 0.5 + Math.cos(a) * HOLLOW.r * 1.1, ty = HOLLOW.cy + 0.5 + Math.sin(a) * HOLLOW.r;
    out.push({ kind: `wp_crownstone${i % 3}` as Kind, x: tx * TILE, y: ty * TILE, flip: hash(i, 3, 7) < 0.5 });
  }
  // Millbrook: the water wheel and its lean-to on pilings, against the mill's east wall (millArt.ts)
  const mill = AREAS.find((r) => r.name === "Millbrook Mill");
  if (mill) {
    let x1 = -1, y0 = 1e9, y1 = -1;
    for (let ty = mill.y; ty < mill.y + mill.h; ty++) for (let tx = mill.x; tx < mill.x + mill.w; tx++) {
      const o = OBJECTS[ty]?.[tx];
      if (o === T.ROOF_THATCH || o === T.DOOR || o === T.WALL_TIMBER || o === T.WINDOW_TIMBER) { x1 = Math.max(x1, tx); y0 = Math.min(y0, ty); y1 = Math.max(y1, ty); }
    }
    if (x1 >= 0) out.push({ kind: "wp_millwheel", x: (x1 + 1) * TILE + MILL_FOOT_U, y: (y0 + y1 + 1) / 2 * TILE + MILL_FOOT_V, depth: (y1 + 1) * TILE + 2 });
  }
  // Goldenreach barn: two cows in the straw, out of the doorway's line (farmArt.ts)
  for (const b of BARNS) for (const [du, dv, k, fl] of [[2.6, 2.2, 0, false], [b.w - 3.4, 3.6, 1, true]] as const)
    // a flipped iso sprite swaps u and v, so its foot offset swaps too
    out.push({ kind: `wp_cow${k}`, x: (b.x + du) * TILE + (fl ? COW_FOOT_V : COW_FOOT_U), y: (b.y + dv) * TILE + (fl ? COW_FOOT_U : COW_FOOT_V), flip: fl });
  // Saltmere: nets drying by the beach, lantern poles on the lane
  scatter(out, "Saltmere", "wp_net_rack", 3, 5);
  scatter(out, "Saltmere", "wp_lantern_pole", 3, 6);
  // The elemental wilds (elementArt.ts): each land's own growths and scars
  const LAND_PROP = { poison: "wp_venom_caps", cold: "wp_ice_spikes", fire: "wp_ember_vent", shock: "wp_storm_stone" } as const;
  for (const l of ELEMENT_LANDS) scatter(out, l.name, LAND_PROP[l.el], Math.round(l.w * l.h / 90), 4);
  return out;
}

/** World-space height (px) of each prop: textures are 1.5 texels per world px. */
const SIZE: Record<Kind, number> = {
  wp_hollow_throne: THRONE_H / TX, wp_crownstone0: STONE_H / TX, wp_crownstone1: STONE_H / TX, wp_crownstone2: STONE_H / TX,
  wp_shipwreck: WRECK_H / TX,
  wp_spear_rack: 80, wp_pennant_red: 100, wp_pennant_black: 100, wp_dummy: 58, wp_lantern_pole: 90, wp_skull_pike: 72, wp_net_rack: 50, wp_spears_ground: 54,
  wp_watchtower: 84, wp_millwheel: MILL_H / TX, wp_cow0: COW_H / TX, wp_cow1: COW_H / TX,
  wp_venom_caps: VENOM_H / TX, wp_ice_spikes: ICE_H / TX, wp_ember_vent: VENT_H / TX, wp_storm_stone: STORM_H / TX,
};
const FPS: Record<Kind, number> = {
  wp_hollow_throne: 6, wp_crownstone0: 1, wp_crownstone1: 1, wp_crownstone2: 1,
  wp_shipwreck: 4,
  wp_spear_rack: 6, wp_pennant_red: 7, wp_pennant_black: 6, wp_dummy: 3, wp_lantern_pole: 3, wp_skull_pike: 6, wp_net_rack: 3, wp_spears_ground: 5,
  wp_watchtower: 6, wp_millwheel: 5, wp_cow0: 2, wp_cow1: 2,
  wp_venom_caps: 4, wp_ice_spikes: 4, wp_ember_vent: 6, wp_storm_stone: 8,
};

export const WORLD_PROP_SPOTS = spots();

/** Paints the prop textures if needed (npcs.ts uses wp_weapon_rack for Brann's smithy). */
export function worldPropTextures(scene: Phaser.Scene) { makeTextures(scene); }

const LANTERN_LIFT = 71 / TX, LANTERN_DX = 6 / TX;

/** Adds the props to the scene. `light` gets called for every lantern (the day/night layer lights it after dusk). */
export function addWorldProps(scene: Phaser.Scene, light?: (x: number, y: number, lift: number, dx: number) => void) {
  makeTextures(scene);
  watchtower(scene);
  sheet(scene, "wp_millwheel", MILL_W, MILL_H, N, millWheel, 0);
  sheet(scene, "wp_cow0", COW_W, COW_H, N, cow(false), 0);
  sheet(scene, "wp_cow1", COW_W, COW_H, N, cow(true), 0);
  sheet(scene, "wp_shipwreck", WRECK_W, WRECK_H, N, shipwreck, 0);
  sheet(scene, "wp_hollow_throne", THRONE_W, THRONE_H, N, throne, 0);
  for (const v of [0, 1, 2]) sheet(scene, `wp_crownstone${v}`, STONE_W, STONE_H, N, (p, f) => standingStone(p, f, 0, v), 0);
  for (const kind of Object.keys(SIZE) as Kind[]) {
    const key = `${kind}_idle`;
    if (!scene.anims.exists(key)) scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(kind, { start: 0, end: N - 1 }), frameRate: FPS[kind], repeat: -1 });
  }
  for (const s of WORLD_PROP_SPOTS) {
    const spr = scene.add.sprite(s.x, s.y, s.kind, 0).setOrigin(0.5, 1).setScale(1 / TX).setDepth(s.depth ?? s.y).setFlipX(!!s.flip);
    // out of step with each other, so a row of them doesn't move as one
    spr.play({ key: `${s.kind}_idle`, startFrame: Math.floor(hash(Math.round(s.x), Math.round(s.y), 9) * N) });
    staticObj(scene, spr); // animated only while near the view (staticChunks.ts)
    // the glow sits in the lantern: it hangs at texel x 22 of 32 (6 right of the sprite's centre), its middle ~71 texels above the foot
    if (s.kind === "wp_lantern_pole") light?.(s.x, s.y, LANTERN_LIFT, LANTERN_DX);
  }
  addSaltmereProps(scene, light); // Saltmere's harbour: smacks, rowboats, buoy, posts, breakwater (saltmereArt.ts)
}
