import { BAYER, Bmp, box, ellipsoid, hash, mix, pal, rod, shadow, splat, tone, vn, type Hit, type RGB, type Sprite, type V3 } from "./moorsPaint";

/**
 * Act 4's Red Badlands art (shared/badlands.ts), painted per pixel in code with no canvas or Phaser dependency, so the
 * preview script (tools/art/preview/badlands-tiles.ts) runs it in node. Same method as the moors (moorsPaint.ts): iso
 * solids and surfaces "splatted" into a bitmap, shaded from the top left, quantised to a short ramp with ordered
 * dithering, then outlined. Textures live in badlandsArt.ts.
 *
 * Geometry is the props' (smoothProps.ts Iso): a point (u, v, z) of a tile (u along world x, v along world y, both
 * -16..16 on the tile, z up) is drawn at x = ox + (u - v), y = oy + (u + v) / 2 - z.
 */
/** Red mesa rock, dark to bright: oxblood shadow through burnt orange to a pale salmon on lit edges. */
export const MESA = pal(["#1e0f0c", "#3a1a14", "#5c2a1e", "#7e3b26", "#a0502e", "#c46c3a", "#e08c50", "#f0b074"]);
/** Maroon strata (iron-rich bands) and tan sandstone strata. */
export const MAROON = pal(["#1a0c0c", "#321416", "#4e2020", "#6c2e2a", "#8a4034", "#a85644"]);
export const OCHRE = pal(["#2a1c12", "#4a3220", "#6e4c2e", "#926a40", "#b88a56", "#d6aa72", "#ecca94"]);
/** Packed red earth. */
export const EARTH = pal(["#2a1410", "#4a2418", "#6e3a26", "#8f5034", "#b06a44", "#c88458"]);
/** Sun-bleached bone on red ground: warm ivory, not the moors' green-grey. */
export const BLEACH = pal(["#2a1e18", "#5a4636", "#8a7258", "#b8a07c", "#dcc8a0", "#f2e6c4"]);
export const DEADWOOD = pal(["#1a1410", "#362a20", "#54443a", "#7a6856", "#a08c74", "#c4b098"]);
export const SCRUB = pal(["#1c1a10", "#3a3420", "#5e5634", "#887a4c", "#aa9a62", "#c8b880"]);
export const SAGE = pal(["#1e2a1e", "#34463a", "#4e6650", "#6e866a", "#92aa8a"]);
export const CACT = pal(["#0f2016", "#1c3a24", "#2c5a34", "#437a44", "#62a058", "#8cc872"]);
export const CLOTH = pal(["#160707", "#340d0d", "#5a1512", "#82211a", "#a63220", "#c44a2a"]);
/** The Red Pass's ember light, dark to bright. */
export const EMBER = pal(["#1a0806", "#3c1208", "#7a2410", "#b8401a", "#e8701e", "#ffa83a", "#ffe08a"]);
const IRON = pal(["#0e0e12", "#24242c", "#3c3c46", "#585864", "#7a7a88"]);

const rnd = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

/**
 * Red sandstone: wavy strata (burnt orange, maroon, tan) every `bandH` of height, hairline cracks, rain streaks down
 * the faces, pale wind-blown dust on the sun-facing tops. `k` scales the surface noise.
 */
export function mesaAt(hit: Hit, seed: number, bandH = 5.5, k = 1): RGB {
  const { sx, sy, lit, p } = hit, z = p[2];
  const wave = (vn(p[0] * 0.06 + p[1] * 0.05, z * 0.03, seed) - 0.5) * 7;
  const bi = Math.floor((z + wave) / bandH), bk = hash(bi, 3, seed), edge = ((z + wave) / bandH) - bi;
  const ramp = bk < 0.3 ? MESA : bk < 0.5 ? MAROON : bk < 0.72 ? OCHRE : MESA;
  let t = 0.16 + lit * 0.78 + (vn(sx * 0.35, sy * 0.35, seed + 1) - 0.5) * 0.22 * k + (bk - 0.5) * 0.12;
  if (edge < 0.1 && hit.n[2] < 0.7) t -= 0.14; // a shadow line under each course
  const crack = Math.abs(vn(p[0] * 0.2 + p[1] * 0.2, z * 0.06, seed + 3) - 0.5);
  if (crack < 0.012 && hit.n[2] < 0.8) t -= 0.34;
  if (vn((p[0] + p[1]) * 0.09 + 7, z * 0.5, seed + 4) > 0.74 && hit.n[2] < 0.6) t -= 0.12; // rain streaks
  let col = tone(ramp, t, sx, sy);
  if (hit.n[2] > 0.7 && vn(sx * 0.12, sy * 0.15, seed + 5) > 0.5) col = mix(col, tone(OCHRE, 0.45 + lit * 0.5, sx, sy), 0.7); // dust on the tops
  if (hash(sx, sy, seed + 6) < 0.025) col = tone(ramp, t + 0.3, sx, sy);
  return col;
}

const bone = (h: Hit, seed: number): RGB => tone(BLEACH, 0.3 + h.lit * 0.8 + (hash(h.sx, h.sy, seed) - 0.5) * 0.12, h.sx, h.sy);

/** A skull ellipsoid at c (radius r, facing yaw): sockets, nose, teeth; used by the bone heaps and the gate's spikes. */
export function skull(b: Bmp, ox: number, oy: number, c: V3, r: number, yaw: number, seed: number) {
  const F: V3 = [Math.cos(0.78 + yaw), Math.sin(0.78 + yaw), 0], Lx: V3 = [-F[1], F[0], 0];
  ellipsoid(b, ox, oy, c, [r, r, r * 0.92], (h) => {
    const q: V3 = [(h.p[0] - c[0]) / r, (h.p[1] - c[1]) / r, (h.p[2] - c[2]) / r], qf = q[0] * F[0] + q[1] * F[1], ql = q[0] * Lx[0] + q[1] * Lx[1];
    if (qf > 0.42 && Math.abs(ql) > 0.2 && Math.abs(ql) < 0.62 && q[2] > -0.1 && q[2] < 0.42) return [10, 6, 6];
    if (qf > 0.55 && Math.abs(ql) < 0.15 && q[2] > -0.34 && q[2] < 0.02) return [16, 9, 8];
    if (qf > 0.35 && q[2] < -0.42 && q[2] > -0.8 && ((h.sx + h.sy) & 1)) return tone(BLEACH, 0.12, h.sx, h.sy);
    return bone(h, seed);
  });
}

// ---------- objects ----------

/**
 * Red boulders: one big weathered block with strata and a cracked face, a smaller one leaning on it and a scatter of
 * pebbles, on a skirt of drift sand. Walk-blocking (ROCK).
 */
export function paintBoulder(seed: number): Sprite {
  const R = rnd(seed * 19 + 3), oy = 34, b = new Bmp(56, 54), ox = 28;
  shadow(b, ox, oy, 1, 1, 17, 8, 120);
  const rock = (c: V3, r: V3, sd: number, bh: number) =>
    ellipsoid(b, ox, oy, c, r, (h) => mesaAt(h, sd, bh, 1.2), (th, ph) => 1 + (vn(th * 2.2 + sd, ph * 2.2, sd + 1) - 0.5) * 0.42 + (Math.abs(Math.sin(th * 3 + sd)) < 0.07 ? -0.1 : 0));
  rock([-1.5, 0.5, 8 + R() * 3], [10.5 + R() * 2, 8.5 + R() * 1.5, 9 + R() * 3], seed + 10, 3.6);
  rock([7 + R() * 2, 3 + R() * 2, 4.2], [5.5, 4.6, 4.4], seed + 11, 2.6);
  rock([-9, 5 + R() * 2, 2.8], [3.6, 3, 2.6], seed + 12, 2.2);
  for (let k = 0; k < 5; k++) { const a = R() * 6.28, d = 10 + R() * 5; ellipsoid(b, ox, oy, [Math.cos(a) * d, Math.sin(a) * d * 0.6, 0.6], [1.5, 1.2, 0.9], (h) => mesaAt(h, seed + 20 + k, 1.6)); }
  b.outline();
  return { b, ox, oy };
}

/** A heap of sun-bleached bones and skulls on red earth: long bones, ribs, three skulls (BONES). */
export function paintBones(seed: number): Sprite {
  const R = rnd(seed * 31 + 17), oy = 30, b = new Bmp(44, 44), ox = 22;
  shadow(b, ox, oy, 0, 1, 15, 8, 120);
  const heap = (u: number, v: number) => Math.max(0, 1 - (u / 10.5) ** 2 - (v / 7) ** 2);
  ellipsoid(b, ox, oy, [0, 0, 0], [10, 6.5, 2.4], (h) => {
    const n1 = vn(h.p[0] * 0.5 + 9, h.p[1] * 0.6, seed), n2 = hash(h.sx >> 1, h.sy, seed + 3);
    if (n1 > 0.62 && n2 > 0.5) return tone(BLEACH, 0.2 + h.lit * 0.5 + (n2 - 0.5) * 0.3, h.sx, h.sy);
    return tone(EARTH, 0.12 + h.lit * 0.7 + (n2 - 0.5) * 0.2, h.sx, h.sy);
  }, (th, ph) => 1 + (vn(th * 3 + seed, ph * 3, seed + 1) - 0.5) * 0.3);
  for (let k = 0; k < 8; k++) {
    const u = (R() - 0.5) * 17, v = (R() - 0.5) * 11, ang = R() * Math.PI, len = 5 + R() * 4.5, z = 0.9 + heap(u, v) * 2.6;
    const du = Math.cos(ang) * len, dv = Math.sin(ang) * len * 0.7, dz = (R() - 0.3) * 2.2;
    rod(b, ox, oy, [u - du, v - dv, z - dz], [u + du, v + dv, z + dz + 0.5], 1.05 + R() * 0.3, (h) => bone(h, seed + 9), 1.1);
  }
  for (let k = 0; k < 4; k++) { // ribs
    const u = -5 + k * 2.2 + (R() - 0.5), v = 2 + R() * 2.5;
    rod(b, ox, oy, [u, v - 2.6, 1.2], [u + 0.7, v + 0.8, 3.8 + heap(u, v) * 2.5], 0.55, (h) => bone(h, seed + 9));
  }
  for (const [u, v, yaw, s] of [[-5.2, 1.8, 0.2, 1.05], [4.6, 3.6, -0.7, 0.95], [0.4, -2.6, 0.9, 0.9]] as const) skull(b, ox, oy, [u, v, 0.8 + heap(u, v) * 2 + 3.3 * s * 0.55], 3.3 * s, yaw, seed);
  b.depthEdges(2.2, 0.4);
  b.outline();
  return { b, ox, oy };
}

/**
 * Dry scrub for BUSH tiles (walk-through): kind 0 a grey-olive thorn bush, a spray of bare twigs round a few sage
 * tufts; kind 1 a tumbleweed, a lattice ball of tangled twigs resting on the ground.
 */
export function paintScrub(kind: number, seed: number): Sprite {
  const R = rnd(seed * 23 + kind * 7 + 9), oy = 30, b = new Bmp(52, 42), ox = 26;
  shadow(b, ox, oy, 0, 1, kind === 1 ? 11 : 14, 6, 100);
  if (kind === 1) {
    const r = 7.5 + R() * 2, c: V3 = [0, 0, r * 0.85], f1 = 3 + (R() * 2 | 0), f2 = 4 + (R() * 2 | 0);
    ellipsoid(b, ox, oy, c, [r, r, r * 0.9], (h) => {
      const th = Math.atan2(h.p[1] - c[1], h.p[0] - c[0]), ph = Math.asin(Math.max(-1, Math.min(1, (h.p[2] - c[2]) / (r * 0.9))));
      const w = Math.abs(Math.sin(th * f1 + ph * 3 + seed)) < 0.16 || Math.abs(Math.sin(th * f2 - ph * 4)) < 0.13 || hash(h.sx, h.sy, seed) < 0.06;
      return w ? tone(SCRUB, 0.1 + h.lit * 0.85 + (hash(h.sx, h.sy, seed + 1) - 0.5) * 0.3, h.sx, h.sy) : null;
    }, (th, ph) => 1 + (vn(th * 3, ph * 3, seed) - 0.5) * 0.2);
  } else {
    for (let k = 0; k < 4; k++) { const a = R() * 6.28, d = 1 + R() * 5; ellipsoid(b, ox, oy, [Math.cos(a) * d, Math.sin(a) * d * 0.7, 2], [3.2 + R() * 1.5, 2.8, 2.2], (h) => tone(k % 3 ? SCRUB : SAGE, 0.18 + h.lit * 0.8 + (hash(h.sx, h.sy, seed) - 0.5) * 0.3, h.sx, h.sy), (th, ph) => 1 + (hash((th * 7) | 0, (ph * 6) | 0, seed + k) - 0.45) * 0.3); }
    for (let k = 0; k < 26; k++) {
      const a = R() * 6.28 + k * 0.1, l = 6 + R() * 9, hh = 4 + R() * 9, p0: V3 = [Math.cos(a) * 1.5, Math.sin(a) * 1.2, 0.8], p1: V3 = [Math.cos(a) * l, Math.sin(a) * l * 0.75, hh];
      const mid: V3 = [p0[0] + (p1[0] - p0[0]) * 0.5, p0[1] + (p1[1] - p0[1]) * 0.5, hh * 0.9];
      rod(b, ox, oy, p0, mid, 0.5, (h) => tone(SCRUB, 0.3 + h.lit * 0.7, h.sx, h.sy));
      rod(b, ox, oy, mid, p1, 0.35, (h) => tone(SCRUB, 0.4 + h.lit * 0.7, h.sx, h.sy));
      if (k % 5 === 0) ellipsoid(b, ox, oy, p1, [1.3, 1.1, 1], (h) => tone(SAGE, 0.3 + h.lit * 0.7, h.sx, h.sy));
    }
  }
  b.outline(0.4);
  return { b, ox, oy };
}

/** A dead mesquite (STUMP): a twisted, silvered trunk forking into gnarled limbs; kind 2 is a split, broken stump with splinters. */
export function paintSnag(kind: number, seed: number): Sprite {
  const R = rnd(seed * 17 + kind * 53 + 2), H = kind === 2 ? 20 + R() * 6 : 34 + R() * 10, oy = Math.ceil(H) + 22, b = new Bmp(56, oy + 12), ox = 28;
  const lean: [number, number] = [(R() - 0.5) * 10, (R() - 0.5) * 5];
  const C = (t: number): V3 => [lean[0] * t * t + Math.sin(t * 6 + seed) * 1.6, lean[1] * t * t + Math.cos(t * 5 + seed) * 1.1, H * t];
  const r0 = kind === 2 ? 4.6 : 3.4, rOf = (t: number) => r0 * (1 - 0.42 * t) * (1 + 0.5 * Math.pow(1 - t, 6));
  shadow(b, ox, oy, 1, 1, 11, 5, 100);
  const wood = (h: Hit, sd: number) => {
    const grain = vn(h.c * 9 + sd, h.a * 2.4, sd), crack = vn(h.c * 13, h.a * 7, sd + 1) > 0.8;
    let t = 0.22 + h.lit * 0.78 + (grain - 0.5) * 0.4 + (hash(h.sx, h.sy, sd + 2) - 0.5) * 0.12;
    if (crack) t -= 0.35;
    return tone(DEADWOOD, t, h.sx, h.sy);
  };
  for (let k = 0; k < 4; k++) { const a = k * 1.7 + R(), l = 4 + R() * 4; rod(b, ox, oy, [0, 0, 2.4], [Math.cos(a) * l, Math.sin(a) * l * 0.8, 0.2], 1.2 - k * 0.1, (h) => wood(h, seed + 5)); }
  const topT = kind === 2 ? 1 : 0.55;
  splat(b, ox, oy, (t, ang) => { const c = C(t), r = rOf(t) * (1 + (vn(ang * 2 + seed, t * 8, seed) - 0.5) * 0.3); return [c[0] + Math.cos(ang) * r, c[1] + Math.sin(ang) * r * 0.9, c[2]]; },
    0, topT, Math.ceil(H * 3.4), 0, Math.PI * 2, 48, (h) => {
      if (kind === 2) { const j = vn(h.c * 5 + h.a * 3, 0, seed + 6) * 6; if (h.p[2] > H - 1 - j) return null; }
      return wood(h, seed);
    }, 0);
  if (kind === 2) {
    const c = C(0.92);
    splat(b, ox, oy, (ang, rho) => [c[0] + Math.cos(ang) * rho * rOf(0.9), c[1] + Math.sin(ang) * rho * rOf(0.9) * 0.9, H - 3 + Math.cos(ang * 2 + seed) * 1.8 + rho * 0.8], 0, Math.PI * 2, 60, 0, 1, 12, (h) => tone(DEADWOOD, 0.5 + h.lit * 0.45, h.sx, h.sy), 1);
  } else {
    const tip = C(topT);
    for (let lim = 0; lim < 2; lim++) { // the fork: two limbs, each kinked twice, with spurs
      let p: V3 = [tip[0], tip[1], tip[2]], dir = (lim ? 0.5 : 3.6) + R() * 0.8, rad = 2.3;
      for (let seg = 0; seg < 4; seg++) {
        const l = 5.5 - seg * 0.6, q: V3 = [p[0] + Math.cos(dir) * l, p[1] + Math.sin(dir) * l * 0.8, p[2] + 4 + R() * 2.5];
        rod(b, ox, oy, p, q, rad, (h) => wood(h, seed + 10 + lim * 5 + seg), 0.2);
        if (seg % 2 === 0) { const q2: V3 = [q[0] + Math.cos(dir + 1.3) * 4, q[1] + Math.sin(dir + 1.3) * 3, q[2] + 2.2]; rod(b, ox, oy, q, q2, rad * 0.5, (h) => wood(h, seed + 30 + seg)); }
        p = q; dir += (R() - 0.5) * 1.5; rad *= 0.72;
      }
    }
  }
  b.outline();
  return { b, ox, oy };
}

/**
 * Cacti (CACTUS, solid): kind 0/1 a saguaro with two or one upturned arms, kind 2 a prickly pear, a stack of flat pads
 * with red fruit. Ribbed trunks, pale spine dots, a few flowers.
 */
export function paintCactus(kind: number, seed: number): Sprite {
  const R = rnd(seed * 29 + kind * 11 + 4), oy = 52, b = new Bmp(56, 66), ox = 28;
  shadow(b, ox, oy, 1, 1, 12, 6, 110);
  const spine = (h: Hit, sd: number, ribs: number) => {
    const rib = Math.cos(h.c * ribs);
    let t = 0.14 + h.lit * 0.86 + (rib - 0.3) * 0.16 + (hash(h.sx, h.sy, sd) - 0.5) * 0.1;
    if (rib < -0.7) t -= 0.18;
    let col = tone(CACT, t, h.sx, h.sy);
    if (rib > 0.86 && hash(h.sx, h.sy, sd + 1) < 0.5) col = [226, 220, 176]; // a row of spines along the crest
    return col;
  };
  if (kind === 2) {
    const pads: [number, number, number, number][] = [[0, 0, 5, 7], [-4, -1, 11, 6], [4.5, 1, 10, 5.6], [-6.5, 0.5, 17, 5], [0, -1, 15, 5.6], [5, 0, 18, 4.6]];
    for (const [u, v, z, r] of pads) {
      const lean = (R() - 0.5) * 0.5;
      ellipsoid(b, ox, oy, [u, v, z], [r * 0.95, 1.9, r * 1.1], (h) => {
        const g = hash(h.sx >> 1, h.sy >> 1, seed);
        if (g > 0.93) return [236, 230, 190];
        let col = tone(CACT, 0.1 + h.lit * 0.9, h.sx, h.sy);
        if (vn(h.sx * 0.3, h.sy * 0.3, seed) > 0.62) col = mix(col, [86, 130, 120], 0.35);
        return col;
      }, (th, ph) => 1 + Math.sin(th * 2 + lean) * 0.03 + (vn(th * 3, ph * 3, seed) - 0.5) * 0.08);
    }
    for (const [u, z] of [[-6.5, 22.5], [0, 20.5], [5, 22.5], [-4, 16]] as const) ellipsoid(b, ox, oy, [u, 0.6, z], [1.7, 1.7, 1.5], (h) => tone(CLOTH, 0.4 + h.lit * 0.7, h.sx, h.sy)); // red fruit
  } else {
    const H = 34 + R() * 12, r = 3.6, top = 0.9;
    const trunk = (t: number, ang: number): V3 => { const rr = r * (1 + 0.1 * Math.cos(ang * 7)) * (t > top ? Math.sqrt(Math.max(0, 1 - ((t - top) / (1 - top)) ** 2)) : 1); return [Math.cos(ang) * rr, Math.sin(ang) * rr, H * t]; };
    splat(b, ox, oy, trunk, 0, 1, Math.ceil(H * 3.4), 0, Math.PI * 2, 56, (h) => spine(h, seed, 7), 0);
    const arms = kind === 0 ? [[1, 0.52, 11, 15], [-1, 0.4, 9, 12]] : [[-1, 0.5, 10, 13]];
    arms.forEach(([dir, t0, reach, up], i) => {
      const z0 = H * t0, ax = dir * reach * 0.9, ay = dir * reach * 0.35, ar = 2.5;
      rod(b, ox, oy, [dir * r * 0.5, 0, z0], [ax, ay, z0 + 0.5], ar, (h) => spine(h, seed + 3 + i, 5));
      ellipsoid(b, ox, oy, [ax, ay, z0 + 0.5], [ar, ar, ar], (h) => spine(h, seed + 3 + i, 5));
      rod(b, ox, oy, [ax, ay, z0 + 0.5], [ax, ay, z0 + up], ar, (h) => spine(h, seed + 5 + i, 5));
      ellipsoid(b, ox, oy, [ax, ay, z0 + up], [ar, ar, ar * 0.85], (h) => spine(h, seed + 5 + i, 5));
    });
    ellipsoid(b, ox, oy, [0.6, 0.4, H + 0.2], [1.4, 1.4, 0.9], (h) => (hash(h.sx, h.sy, seed) < 0.6 ? [240, 232, 200] : [226, 170, 190]));
  }
  b.outline();
  return { b, ox, oy };
}

// ---------- arches ----------

/**
 * The natural arch's profile for two legs `span` tiles apart (shared by the arch and the Red Pass gate): u from the left
 * leg's tile centre; `zin(u)` is the opening's roof height (0 inside the legs), `half` the opening's half width.
 */
export function archProfile(span: number) {
  const S = 32 * span, half = (S - 30) / 2, uc = S / 2, Hin = Math.min(half * 1.02, 54);
  const zin = (u: number) => { const q = (u - uc) / half; return Math.abs(q) >= 1 ? 0 : Hin * Math.pow(1 - q * q, 0.42); };
  return { S, half, uc, Hin, zin };
}

/**
 * A wind-cut sandstone arch bridging two solid legs `span` tiles apart, drawn once from the left leg's tile centre
 * (the origin): banded red rock, a front face with a thick rounded crown, the soffit in shade, rubble and drift at the
 * feet. Heroes walk through the opening, which is clear to head height.
 */
export function paintArch(span: number, seed: number): Sprite {
  const { S, uc, half, Hin, zin } = archProfile(span), R = rnd(seed * 41 + span);
  const Ho = Hin + 20 + R() * 5, A = uc + 18;
  const zout = (u: number) => {
    const q = (u - uc) / A, base = Ho * Math.pow(Math.max(0, 1 - q * q), 0.55);
    return Math.max(zin(u) + 3.5, base + (vn(u * 0.09, 1, seed) - 0.5) * 6) * (Math.abs(q) > 0.97 ? 0.5 : 1);
  };
  const T = (u: number) => 7.5 + 4.5 * Math.pow(1 - zin(u) / Hin, 2) + (vn(u * 0.1, 4, seed + 1) - 0.5) * 2;
  const ox = 34, oy = Math.ceil(Ho) + 26, b = new Bmp(S + 76, oy + S / 2 + 30);
  shadow(b, ox, oy, uc, 3, S / 2 + 22, 15, 120);
  const U0 = -18, U1 = S + 18, N = Math.ceil((U1 - U0) * 3.6);
  const mat = (sd: number, dark = 1) => (h: Hit) => {
    let c = mesaAt(h, sd, 5.5);
    if (dark < 1) c = [c[0] * dark, c[1] * dark, c[2] * dark];
    return c;
  };
  // the soffit first (nearer faces cover it): in shade, warm bounce light from the ground
  splat(b, ox, oy, (u, c) => [u, T(u) * (2 * c - 1), zin(u)], uc - half, uc + half, Math.ceil(half * 7), 0, 1, 24, (h) => {
    let c = mesaAt(h, seed + 7, 5.5);
    const k = 0.46 + 0.14 * Math.max(0, h.n[0]);
    c = [c[0] * k, c[1] * k, c[2] * k]; return c;
  }, 2);
  // the front face (+v): from the soffit (or the ground at the legs) up to the crown
  splat(b, ox, oy, (u, c) => [u, T(u), zin(u) + c * (zout(u) - zin(u))], U0, U1, N, 0, 1, Math.ceil((Ho + 4) * 2.4), mat(seed + 8), 0);
  // the top: rounded across its thickness, rough along it
  splat(b, ox, oy, (u, c) => { const w = 2 * c - 1; return [u, T(u) * w, zout(u) - 3.2 * w * w + (vn(u * 0.4, w * 3, seed + 9) - 0.5) * 1.1]; }, U0, U1, N, 0, 1, 26, mat(seed + 9), 1);
  // chips of fallen rock and drift sand at the feet
  for (const side of [0, 1]) for (let k = 0; k < 4; k++) {
    const u = side ? S + 10 + R() * 8 : -10 - R() * 8, v = 8 + R() * 8, r = 1.4 + R() * 2.2;
    ellipsoid(b, ox, oy, [u, v, r * 0.5], [r * 1.3, r, r * 0.8], (h) => mesaAt(h, seed + 60 + k, 1.8), (th, ph) => 1 + (hash((th * 4) | 0, (ph * 4) | 0, seed + k) - 0.5) * 0.3);
  }
  b.depthEdges(4, 0.6);
  b.outline(0.35);
  return { b, ox, oy };
}

// ---------- the Red Pass gate ----------

export const GATE_W = 150, GATE_H = 150, GATE_OX = 75, GATE_OY = 118;
const GP = 26, GPH = 62, GZ0 = 6;
/** The Redfang sigil in a plane (du, dz from its centre): two curved fangs meeting at a bar. True where a pixel is paint. */
const sigil = (du: number, dz: number, s = 1) => {
  du /= s; dz /= s;
  if (Math.abs(dz - 6) < 0.9 && Math.abs(du) < 8) return true; // the bar over the fangs
  for (const sg of [-1, 1]) {
    const t = (5 - dz) / 11;
    if (t < 0 || t > 1) continue;
    const x = sg * (9.5 - 6.5 * t + 2.2 * Math.sin(Math.PI * t)), w = 2.9 * (1 - t) + 0.45;
    if (Math.abs(du - x) < w) return true;
  }
  return false;
};

const gateBase = new Map<string, Bmp>();
/** A torn banner hanging at (u0, v0) from height zTop, `w` wide, `len` long, with the sigil in pale thread. */
function banner(b: Bmp, ox: number, oy: number, u0: number, v0: number, zTop: number, w: number, len: number, seed: number, awake: boolean) {
  splat(b, ox, oy, (a, c) => [u0 + (a - 0.5) * w + Math.sin(c * 4 + seed) * 0.5, v0 + Math.sin(a * 9 + seed) * 0.7 + c * 0.8, zTop - c * len], 0, 1, Math.ceil(w * 3), 0, 1, Math.ceil(len * 3), (h) => {
    const a = h.a, c = h.c, tooth = hash(Math.floor(a * 7), seed, 5);
    if (c > 0.72 + tooth * 0.28 - (Math.abs(a - 0.5) < 0.12 ? 0.3 : 0)) return null; // the torn lower edge
    if (a < 0.05 && hash(Math.floor(c * 9), seed, 6) < 0.6) return null; // frayed sides
    const fold = Math.sin(a * 11 + seed) * 0.14;
    const mark = sigil((a - 0.5) * w, len * 0.35 - c * len, 0.42);
    if (mark) return awake ? tone(EMBER, 0.62 + hash(h.sx, h.sy, 3) * 0.3, h.sx, h.sy) : tone(BLEACH, 0.35 + h.lit * 0.3, h.sx, h.sy);
    return tone(CLOTH, 0.12 + h.lit * 0.6 + fold + (hash(h.sx, h.sy, seed) - 0.5) * 0.18 - c * 0.12, h.sx, h.sy);
  }, 0, true);
}
/** A pole with a skull on top. */
function spike(b: Bmp, ox: number, oy: number, u: number, v: number, hh: number, seed: number) {
  rod(b, ox, oy, [u, v, 0], [u + 0.4, v, hh], 1.1, (h) => tone(DEADWOOD, 0.2 + h.lit * 0.75, h.sx, h.sy));
  skull(b, ox, oy, [u + 0.4, v, hh + 2.6], 3, 0.2 + (seed % 5) * 0.25, seed);
  for (let k = 0; k < 3; k++) rod(b, ox, oy, [u - 1, v + 0.4, hh * (0.3 + k * 0.22)], [u + 1.6, v + 0.4, hh * (0.3 + k * 0.22) + 1], 0.35, (h) => bone(h, seed)); // lashed crossbones
}
/** An iron brazier on three legs; lit by the caller when awake. */
function brazier(b: Bmp, ox: number, oy: number, u: number, v: number) {
  for (const a of [0.4, 2.5, 4.6]) rod(b, ox, oy, [u + Math.cos(a) * 2.6, v + Math.sin(a) * 2.6, 0], [u, v, 7.5], 0.6, (h) => tone(IRON, 0.2 + h.lit * 0.8, h.sx, h.sy));
  ellipsoid(b, ox, oy, [u, v, 9.5], [4.8, 4.8, 3], (h) => (h.p[2] > 10.4 && h.n[2] > 0.5 ? tone(EARTH, 0.05 + h.lit * 0.2, h.sx, h.sy) : tone(IRON, 0.2 + h.lit * 0.8, h.sx, h.sy)));
}

/**
 * The Red Pass gate's still part. Side "forest": Act 1's end, a trilithon of red mesa rock (two buttresses and a heavy
 * lintel carrying the red fang sigil) on a dais of packed earth among pine needles. Side "badlands": the gate hangs
 * under the natural arch (paintArch, span 4, the arch itself is a separate sprite): a flagged dais with the sigil in a
 * ring, skull spikes and torn banners hung from the soffit. Both: braziers, bones, banners; awake the sigil burns.
 */
function gateStatic(side: "forest" | "badlands", awake: boolean): Bmp {
  const key = side + (awake ? 1 : 0), have = gateBase.get(key);
  if (have) return have;
  const forest = side === "forest", seed = forest ? 81 : 87, b = new Bmp(GATE_W, GATE_H), ox = GATE_OX, oy = GATE_OY, R = rnd(seed), A = archProfile(4);
  const ground = forest ? [EARTH, pal(["#14100c", "#241c14", "#382a1c", "#4c3a26"])] : [EARTH, OCHRE];
  splat(b, ox, oy, (u, v) => [u, v, 0], -66, 66, 260, -36, 46, 160, (h) => {
    const [u, v] = h.p, d = Math.hypot(u / 66, (v - 6) / 38) + (vn(u * 0.07, v * 0.1, seed) - 0.5) * 0.5;
    if (d > 1 || (d > 0.78 && BAYER[(h.sy & 3) * 4 + (h.sx & 3)] > (1 - d) * 4.5)) return null;
    const n = vn(u * 0.2, v * 0.25, seed + 1);
    let col = tone(ground[0], 0.35 + n * 0.5, h.sx, h.sy);
    if (vn(u * 0.1 + 5, v * 0.13, seed + 2) > 0.58) col = tone(ground[1], 0.3 + n * 0.5, h.sx, h.sy);
    if (hash(h.sx, h.sy, seed + 3) < 0.04) col = tone(MESA, 0.6, h.sx, h.sy);
    return col;
  }, 0, false);
  shadow(b, ox, oy, 0, 4, 58, 26, 110);
  const flags = (h: Hit, sd: number) => {
    const [u, v] = h.p;
    if (h.tag === 0) {
      const fu = ((u + 200) * 0.11) % 1, fv = ((v + 200) * 0.17 + Math.floor((u + 200) * 0.11) * 0.41) % 1;
      if (fu < 0.06 || fv < 0.08) return tone(EARTH, 0.12, h.sx, h.sy);
      const r = Math.hypot(u, v * 1.0);
      const ringed = !forest && h.p[2] > 7 && ((r > 10 && r < 12.4) || sigil(u, v + 1, 0.85) && r < 11);
      if (ringed) return awake ? tone(EMBER, 0.62 + hash(h.sx, h.sy, 3) * 0.35, h.sx, h.sy) : tone(MAROON, 0.08, h.sx, h.sy);
      return mesaAt({ ...h, p: [u, v, 3 + Math.floor((u + 200) * 0.11) * 0.3] as V3 }, sd + Math.floor((u + 200) * 0.11) * 3, 99, 1.4);
    }
    const k = (h.tag === 1 ? u : v) * 0.11 % 1;
    if (Math.abs(k) < 0.07 || (h.p[2] % 4 < 0.4)) return tone(EARTH, 0.14, h.sx, h.sy);
    return mesaAt(h, sd + 5, 4);
  };
  const duH = 3.6;
  box(b, ox, oy, -50, 50, -18, 20, 0, duH, (h) => flags(h, seed + 10));
  box(b, ox, oy, -41, 41, -12, 13, duH, GZ0 + 2, (h) => flags(h, seed + 20));
  if (forest) {
    const pillar = (cu: number, sd: number, tall: number) => {
      const rx = 9.6, ry = 7.2, H = GPH + tall, rot = (R() - 0.5) * 0.2, cr = Math.cos(rot), sr = Math.sin(rot), taper = 0.12 + R() * 0.06;
      const bnd = (th: number, t: number) => {
        const cs = Math.cos(th), sn = Math.sin(th), p = 2 / 4.4;
        const sc = (1 - taper * t + 0.12 * Math.pow(1 - t, 5) + (vn(th * 1.6 + sd, t * 6, sd) - 0.5) * 0.16) * (1 - (vn(th * 3, t * 14, sd + 1) > 0.8 ? 0.07 : 0));
        const x = rx * sc * Math.sign(cs) * Math.pow(Math.abs(cs), p), y = ry * sc * Math.sign(sn) * Math.pow(Math.abs(sn), p);
        return [cu + x * cr - y * sr, x * sr + y * cr] as const;
      };
      splat(b, ox, oy, (th, t) => { const q = bnd(th, t); return [q[0], q[1], GZ0 + 2 + (H - GZ0 - 2) * t]; }, 0, Math.PI * 2, 300, 0, 1, Math.ceil((H - GZ0) * 3.4), (h) => mesaAt(h, sd, 5.5, 1.2), 0);
      splat(b, ox, oy, (th, rho) => { const q = bnd(th, 1); return [cu + (q[0] - cu) * rho, q[1] * rho, H + (q[0] - cu) * rho * 0.05 - 1.4 * rho * rho * (1 - rho)]; }, 0, Math.PI * 2, 200, 0, 1, 40, (h) => mesaAt(h, sd + 40, 5.5), 1);
    };
    pillar(-GP, seed + 30, 2);
    pillar(GP, seed + 31, -3);
    const ZL0 = GPH - 3, ZL1 = ZL0 + 14;
    box(b, ox, oy, -GP - 15, GP + 14, -6.5, 6.5, ZL0, ZL1, (h) => {
      const [u, v, z] = h.p, e = Math.min(u + GP + 15, GP + 14 - u);
      if (e < 3 && vn(h.sx * 0.5, h.sy * 0.5, seed + 50) > 0.45 + e * 0.1) return null;
      if (h.tag === 1 && sigil(u + 0.5, z - (ZL0 + ZL1) / 2 + 0.2, 0.62)) return awake ? tone(EMBER, 0.7 + hash(h.sx, h.sy, 3) * 0.3, h.sx, h.sy) : tone(CLOTH, 0.4 + h.lit * 0.2, h.sx, h.sy);
      void v;
      return mesaAt(h, seed + 52, 5.5, 1.1);
    });
    // a skull above the lintel's centre, horn-less and bleached
    skull(b, ox, oy, [0, 0, ZL1 + 3.4], 3.8, 0, seed);
    banner(b, ox, oy, -GP - 13, 8.5, ZL0 + 6, 9, 30, seed + 1, awake);
    banner(b, ox, oy, GP + 12, 8.5, ZL0 + 6, 9, 26, seed + 2, awake);
    spike(b, ox, oy, -GP - 16, 19, 16, seed + 3);
    spike(b, ox, oy, GP + 14, 22, 20, seed + 4);
    brazier(b, ox, oy, -GP - 6, 16);
    brazier(b, ox, oy, GP + 6, 16);
  } else {
    const hz = (u: number) => A.zin(u + A.uc);
    // the soffit's banners and skull spikes, the braziers on the dais
    banner(b, ox, oy, -30, 1.5, hz(-30) - 1, 9, 24, seed + 1, awake);
    banner(b, ox, oy, 30, 1.5, hz(30) - 1, 9, 22, seed + 2, awake);
    spike(b, ox, oy, -42, 9, 17, seed + 3);
    spike(b, ox, oy, 42, 9, 19, seed + 4);
    brazier(b, ox, oy, -16, 15);
    brazier(b, ox, oy, 16, 15);
  }
  // fallen bones and chips round the feet
  for (let k = 0; k < 7; k++) {
    const u = (R() - 0.5) * 100, v = 20 + R() * 20, sz = 1.8 + R() * 2.2;
    if (k % 2) rod(b, ox, oy, [u - 3, v, 0.8], [u + 3, v + 1, 1.2], 0.9, (h) => bone(h, seed + k), 1.1);
    else ellipsoid(b, ox, oy, [u, v, 0.7], [sz * 1.3, sz, sz * 0.8], (h) => mesaAt(h, seed + 70 + k, 1.8), (th, ph) => 1 + (hash((th * 4) | 0, (ph * 4) | 0, seed + k) - 0.5) * 0.3);
  }
  if (forest) for (let k = 0; k < 10; k++) { // pine needles and dry tufts on the verge
    const u = (R() - 0.5) * 118, v = -18 + R() * 62;
    if (Math.abs(u) < 44 && v < 22 && v > -14) continue;
    const r = 1.8 + R() * 2;
    ellipsoid(b, ox, oy, [u, v, 0.8], [r * 1.5, r, r * 0.7], (h) => tone(k % 2 ? SCRUB : SAGE, 0.2 + h.lit * 0.7 + (hash(h.sx, h.sy, seed + 80) - 0.4) * 0.3, h.sx, h.sy), (th, ph) => 1 + (hash((th * 6) | 0, (ph * 5) | 0, seed + k) - 0.4) * 0.35);
  }
  b.depthEdges(5, 0.55);
  b.outline(0.35);
  gateBase.set(key, b);
  return b;
}

/**
 * Frame f of N of the Red Pass gate. Asleep: cold stone and cloth, dead braziers, a dark sigil. Awake: an ember veil
 * fills the opening (forest side: between the buttresses; badlands side: under the arch), swirling and looping, the
 * sigil and the braziers burn, warm light spills on the dais and sparks rise.
 */
export function paintRedGate(side: "forest" | "badlands", awake: boolean, f: number, N: number): Bmp {
  const b = gateStatic(side, awake).clone();
  if (!awake) return b;
  const forest = side === "forest", A = archProfile(4), ph = (f / N) * Math.PI * 2, pulse = 0.5 + 0.5 * Math.sin(ph), ox = GATE_OX, oy = GATE_OY;
  const GAP = forest ? GP - 9.6 : A.half - 4, top = (u: number) => (forest ? GPH : A.zin(u + A.uc) - 1.2);
  // warm light on the dais, the steps and the ground in front
  const cx = ox, cy = oy + 14;
  for (let y = cy - 34; y < cy + 34; y++) for (let x = cx - 72; x < cx + 72; x++) {
    const d = Math.hypot((x - cx) / 64, (y - cy) / 27);
    if (d >= 1 || y < oy - 4) continue;
    const k = (1 - d) * (0.55 + 0.25 * pulse), flick = BAYER[(y & 3) * 4 + (x & 3)];
    if (flick < k) b.tint(x, y, EMBER[flick < k * 0.4 ? 5 : 4], 0.5);
  }
  // the veil: heat and flame in the opening, drifting upward, bright at the rim
  const z0 = GZ0 + 2;
  splat(b, ox, oy, (u, z) => [u, 0.2, z], -GAP, GAP, 120, z0, forest ? GPH : A.Hin, 130, (h) => {
    const u = h.p[0], z = h.p[2], tp = top(u);
    if (z > tp) return null;
    const uu = u / GAP, w = (z - z0) / (tp - z0);
    const sw = vn(u * 0.12 + Math.cos(ph) * 2.4, z * 0.07 + Math.sin(ph) * 2.4, 171) * 0.6 + vn(u * 0.27 - Math.sin(ph) * 1.7, z * 0.2 + Math.cos(ph) * 1.7, 172) * 0.4;
    const lick = Math.sin(z * 0.4 + uu * 2.4 + sw * 5 - ph * 2) * 0.5 + 0.5;
    let t = 0.2 + sw * 0.42 + lick * 0.22 + (1 - Math.abs(uu)) * 0.1 - w * 0.12;
    const edge = Math.min(GAP - Math.abs(u), z - z0, tp - z);
    if (edge < 0.9 + pulse * 0.7) t = 0.95;
    else if (edge < 4.5) t += 0.26 * (1 - (edge - 0.9) / 3.6);
    return tone(EMBER, Math.min(1, t), h.sx, h.sy);
  }, 0, false);
  // flames in the braziers
  const bu = forest ? [-GP - 6, GP + 6] : [-16, 16], bv = forest ? 16 : 15;
  bu.forEach((u, i) => {
    for (let k = 0; k < 15; k++) {
      const a = (hash(k, i, 5) - 0.5) * 6, life = (f / N * 2 + hash(k, i, 6)) % 1, hh = 3 + life * 11, x = Math.round(ox + u - bv + a * (1 - life * 0.7)), y = Math.round(oy + (u + bv) / 2 - 11.5 - hh);
      b.put(x, y, EMBER[life < 0.3 ? 6 : life < 0.6 ? 5 : life < 0.85 ? 4 : 3], 1e6);
      if (life < 0.7) b.put(x, y + 1, EMBER[life < 0.3 ? 5 : 4], 1e6);
    }
  });
  // sparks rising out of the veil
  for (let k = 0; k < 30; k++) {
    const life = (f / N + hash(k, 1, 191)) % 1, u0 = (hash(k, 2, 191) - 0.5) * 2 * (GAP - 3), z0b = z0 + 4 + hash(k, 3, 191) * 22;
    const v = 2 + life * (14 + hash(k, 4, 191) * 18), z = z0b + life * 14 + Math.sin(life * 6 + k) * 1.4, u = u0 * (1 + life * 0.3) + Math.sin(life * 5 + k) * 2;
    const x = Math.round(ox + u - v), y = Math.round(oy + (u + v) / 2 - z);
    b.put(x, y, EMBER[life < 0.5 ? 6 : life < 0.8 ? 5 : 3], 1e6);
    if (k % 3 === 0 && life < 0.6) b.put(x, y - 1, EMBER[4], 1e6);
  }
  return b;
}

/**
 * Recolours one pixel of the desert's grey-scale-ish sandstone cliff (desertArt.ts cliffTexture) into layered red mesa
 * rock: wavy strata in burnt orange, maroon and tan, dust on the lit tops. `lum` is the source pixel's brightness 0..1,
 * (gx, gy) its art-pixel position in the texture, `v` the cliff variant.
 */
export function redCliffPixel(lum: number, gx: number, gy: number, v: number): RGB {
  const wave = Math.sin(gx * 0.19 + v * 2) * 1.6 + Math.sin(gx * 0.07 + gy * 0.05) * 1.2, band = Math.floor((gy + wave) / 5), bk = hash(band, 5, 41);
  const ramp = bk < 0.28 ? MAROON : bk < 0.5 ? OCHRE : MESA;
  let t = Math.max(0, Math.min(1, lum)) * 0.9 + (bk - 0.5) * 0.1;
  if (((gy + wave) / 5 - band) < 0.14) t -= 0.12; // the shadow line under each course
  let col = tone(ramp, t, gx, gy);
  if (lum > 0.62 && vn(gx * 0.25 + v * 9, gy * 0.3, 43) > 0.5) col = mix(col, tone(OCHRE, 0.55 + lum * 0.4, gx, gy), 0.7); // dust and sand on the lit tops
  return col;
}
