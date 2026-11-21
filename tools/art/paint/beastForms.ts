/**
 * Vampire beast forms (Murat 2026-11-08): the great wolf (Wolf Form) and the giant bat (Bat Form).
 * Each beast is a small 3D model of soft shapes (signed distance fields: ellipsoids, tapered limbs, wing membranes),
 * ray-cast from the game's iso camera (30 degrees down) onto the heroes' 1.5 texels per world px grid, lit from the
 * upper left like the rest of the art, shaded in a few hand-picked ramps with a fur dither, outlined, and given glowing
 * eyes. Real 3D means every one of the 8 facings and every leg/wing pose is drawn consistently.
 *
 *   npx tsx tools/art/paint/beastForms.ts      -> client/public/assets/hd/forms/{wolf,bat}.png + forms.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";

type V = [number, number, number];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V): V => mul(a, 1 / (len(a) || 1));
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
/** Rotate about the x axis (forward axis of a beast) by `a`. */
const rotX = (p: V, a: number): V => [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)];
/** Rotate about the y axis (pitch: positive tips +x up). */
const rotY = (p: V, a: number): V => [p[0] * Math.cos(a) - p[2] * Math.sin(a), p[1], p[0] * Math.sin(a) + p[2] * Math.cos(a)];

// ---- materials ----------------------------------------------------------------------------------------
/** A ramp dark -> light, and how much fur noise breaks it up. */
interface Mat { ramp: string[]; fur: number; gain?: number }
const MATS: Record<string, Mat> = {
  // the great wolf: a near-black pelt with a cold grey-violet sheen, a paler ruff and muzzle, old-blood tint deep down
  wfur: { ramp: ["#0e0b12", "#1b1721", "#2b2633", "#3e3848", "#56505f", "#736c7c", "#948da0"], fur: 0.13 },
  wdark: { ramp: ["#09070b", "#121016", "#1c1820", "#28232d", "#37313d", "#4a4352", "#615a6a"], fur: 0.13 },
  wruff: { ramp: ["#120e14", "#221d25", "#353038", "#4d474f", "#6a646b", "#8d868c", "#b0a9ac"], fur: 0.16 },
  wmuz: { ramp: ["#141114", "#2a2529", "#433d40", "#5f585a", "#807879", "#a39b9a"], fur: 0.08 },
  nose: { ramp: ["#050405", "#0e0b0d", "#1c171a", "#3a3236"], fur: 0 },
  claw: { ramp: ["#1a1614", "#4a423a", "#8c8274", "#c9bfae"], fur: 0 },
  tooth: { ramp: ["#8c8270", "#c9c0aa", "#ece6d6", "#ffffff"], fur: 0 },
  mouth: { ramp: ["#1a0306", "#3d070d", "#6b0f18", "#8e1a24"], fur: 0 },
  // the giant bat: sooty brown-black fur, wings of thin leather with blood showing through
  bfur: { ramp: ["#0b0809", "#181113", "#251a1c", "#352628", "#4a3638", "#614a4a"], fur: 0.14 },
  wing: { ramp: ["#0c0508", "#16080d", "#220b13", "#300f19", "#41141f", "#561a28", "#6e2232"], fur: 0.04, gain: 0.72 },
  bone: { ramp: ["#1a1012", "#31201f", "#48302c", "#62433b", "#80594c"], fur: 0 },
  ear: { ramp: ["#160a0c", "#2c1215", "#46191e", "#64242b", "#86343a"], fur: 0.02 },
};
const OUTLINE = "#07050a";
const EYE = "#ff2a2a", EYE_HI = "#ffd0c0", EYE_GLOW = "#9e0d17";

// ---- signed distances ---------------------------------------------------------------------------------
type Prim = { d: (p: V) => number; m: string; k: number };
function ellipsoid(c: V, r: V, m: string, k = 1.6, pitch = 0): Prim {
  return { m, k, d: (p) => {
    let q = sub(p, c);
    if (pitch) q = rotY(q, -pitch);
    const k0 = len([q[0] / r[0], q[1] / r[1], q[2] / r[2]]), k1 = len([q[0] / (r[0] * r[0]), q[1] / (r[1] * r[1]), q[2] / (r[2] * r[2])]);
    return k1 === 0 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
  } };
}
/** A limb from a (radius ra) to b (radius rb). */
function limb(a: V, b: V, ra: number, rb: number, m: string, k = 1.2): Prim {
  return { m, k, d: (p) => {
    const ba = sub(b, a), pa = sub(p, a);
    const h = clamp(dot(pa, ba) / dot(ba, ba));
    return len(sub(pa, mul(ba, h))) - (ra + (rb - ra) * h);
  } };
}
/** 2D polygon distance (negative inside). */
function poly2(px: number, py: number, pts: number[][]): number {
  let d = Infinity, s = 1;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[j];
    const ex = bx - ax, ey = by - ay, wx = px - ax, wy = py - ay;
    const h = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey));
    d = Math.min(d, Math.hypot(wx - ex * h, wy - ey * h));
    const c1 = py >= ay, c2 = py < by, c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * d;
}
/** A thin membrane: polygon `pts` in the plane spanned by unit axes u, w through o, `t` thick. */
function membrane(o: V, u: V, w: V, pts: number[][], t: number, m: string): Prim {
  const n = norm([u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]);
  return { m, k: 0.6, d: (p) => {
    const q = sub(p, o);
    const dp = poly2(dot(q, u), dot(q, w), pts), dn = Math.abs(dot(q, n)) - t;
    return dp > 0 ? Math.hypot(dp, Math.max(dn, 0)) : dn; // rounded edge
  } };
}

/** 3D value noise for fur clumps. */
function hash(x: number, y: number, z: number) { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(p: V) {
  const ix = Math.floor(p[0]), iy = Math.floor(p[1]), iz = Math.floor(p[2]);
  const fx = p[0] - ix, fy = p[1] - iy, fz = p[2] - iz;
  const s = (t: number) => t * t * (3 - 2 * t);
  const ux = s(fx), uy = s(fy), uz = s(fz);
  let r = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
    r += hash(ix + dx, iy + dy, iz + dz) * (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz);
  }
  return r;
}

interface Model { scale: number; prims: Prim[]; eyes: V[]; furAmp: number; shadow: { x: number; y: number; rx: number; ry: number; a: number } }

function sceneDist(m: Model, p: V): { d: number; mat: string } {
  let d = Infinity, best = Infinity, mat = "";
  for (const pr of m.prims) {
    const di = pr.d(p);
    if (di < best) { best = di; mat = pr.m; }
    // smooth union: soft joins between body parts
    if (d === Infinity) d = di;
    else { const k = Math.min(pr.k, 1.6), h = clamp(0.5 + 0.5 * (di - d) / k); d = di * (1 - h) + d * h - k * h * (1 - h); }
  }
  const f = MATS[mat]?.fur ?? 0;
  if (f > 0 && m.furAmp > 0) d += (noise(mul(p, 0.85)) - 0.5) * m.furAmp * (f / 0.14); // shaggy edge
  return { d, mat };
}

// ---- camera + rendering ---------------------------------------------------------------------------------
export const FW = 64, FH = 64, OX = 32, OY = 54; // frame size and the feet in it
const PITCH = Math.PI / 6; // the iso camera looks 30 degrees down (2:1 diamonds)
const DIR: V = [0, Math.cos(PITCH), -Math.sin(PITCH)], UP: V = [0, Math.sin(PITCH), Math.cos(PITCH)], RIGHT: V = [1, 0, 0];
const LIGHT = norm([-0.55, -0.5, 0.85]);

function shadeIndex(n: V, mat: Mat, p: V, ao: number, tx: number, ty: number): number {
  const dif = Math.max(0, dot(n, LIGHT));
  const sky = 0.5 + 0.5 * n[2];
  let v = -0.04 + dif * 0.8 + sky * 0.2;
  v *= (0.55 + 0.45 * ao) * (mat.gain ?? 1);
  // fur lies in strands along the body (stretched noise), plus a fine grain
  if (mat.fur > 0) v += (noise([p[0] * 0.45, p[1] * 1.6, p[2] * 1.6]) - 0.5) * mat.fur * 2.6 + (hash(Math.round(p[0] * 2), Math.round(p[1] * 2), Math.round(p[2] * 2)) - 0.5) * mat.fur * 0.8;
  // ordered dither on the band edges: a hand-placed look, not a smooth gradient
  const bayer = [[0, 2], [3, 1]][ty & 1][tx & 1] / 4 - 0.375;
  const levels = mat.ramp.length;
  return clamp(Math.floor(clamp(v) * levels + bayer * 0.55), 0, levels - 1);
}

interface Frame { px: Uint8ClampedArray }
function hex(c: string): [number, number, number] { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }

/** Ray-cast one frame of `model` facing `yaw` (0 = screen right, +y = away from the camera). */
function render(model: Model, yaw: number): Frame {
  const px = new Uint8ClampedArray(FW * FH * 4);
  const depth = new Float32Array(FW * FH).fill(Infinity);
  const matAt: string[] = new Array(FW * FH).fill("");
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const toModel = (p: V): V => [p[0] * cy + p[1] * sy, -p[0] * sy + p[1] * cy, p[2]]; // world -> model (inverse yaw)
  const toWorld = (p: V): V => [p[0] * cy - p[1] * sy, p[0] * sy + p[1] * cy, p[2]];
  // bounding sphere of the model (cheap skip of empty texels)
  const R = 34, C: V = [0, 0, 14];
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    const u = i + 0.5 - OX, v = OY - (j + 0.5);
    const o0 = add(mul(RIGHT, u), mul(UP, v));
    // ray-sphere test against the bounds
    const oc = sub(o0, toWorld(C)), b = dot(oc, DIR), c = dot(oc, oc) - R * R, disc = b * b - c;
    if (disc < 0) continue;
    let t = -b - Math.sqrt(disc);
    const tEnd = -b + Math.sqrt(disc);
    let hit = false, mat = "";
    for (let s = 0; s < 90 && t < tEnd; s++) {
      const p = mul(toModel(add(o0, mul(DIR, t))), 1 / model.scale);
      const r = sceneDist(model, p);
      if (r.d < 0.04) { hit = true; mat = r.mat; break; }
      t += Math.max(0.05, r.d * model.scale * 0.8);
    }
    if (!hit) continue;
    const pw = add(o0, mul(DIR, t)), p = mul(toModel(pw), 1 / model.scale);
    const e = 0.25;
    const g = (q: V) => sceneDist(model, q).d;
    const nm: V = norm([g(add(p, [e, 0, 0])) - g(sub(p, [e, 0, 0])), g(add(p, [0, e, 0])) - g(sub(p, [0, e, 0])), g(add(p, [0, 0, e])) - g(sub(p, [0, 0, e]))]);
    const nw = toWorld(nm);
    const ao = clamp(g(add(p, mul(nm, 1.8))) / 1.8);
    const M = MATS[mat];
    const idx = shadeIndex(nw, M, p, ao, i, j);
    const [r8, g8, b8] = hex(M.ramp[idx]);
    const k = (j * FW + i) * 4;
    px[k] = r8; px[k + 1] = g8; px[k + 2] = b8; px[k + 3] = 255;
    depth[j * FW + i] = t; matAt[j * FW + i] = mat;
  }
  // inner lines: where a far part shows next to a near one (a leg behind a leg), the far side darkens a step
  const out = new Uint8ClampedArray(px);
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    const a = j * FW + i;
    if (depth[a] === Infinity) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= FW || jj >= FH) continue;
      const b = jj * FW + ii;
      if (depth[b] !== Infinity && depth[a] - depth[b] > 3.2) {
        const k = a * 4, [r, g, bb] = hex(OUTLINE);
        out[k] = Math.round(out[k] * 0.35 + r * 0.65); out[k + 1] = Math.round(out[k + 1] * 0.35 + g * 0.65); out[k + 2] = Math.round(out[k + 2] * 0.35 + bb * 0.65);
        break;
      }
    }
  }
  // eyes: a burning red texel where an eye can be seen, a faint glow round it
  for (const ew of model.eyes) {
    const w = toWorld(mul(ew, model.scale));
    const u = dot(w, RIGHT), v = dot(w, UP), t = dot(w, DIR);
    const i = Math.floor(u + OX), j = Math.floor(OY - v);
    if (i < 1 || j < 1 || i >= FW - 1 || j >= FH - 1) continue;
    const a = j * FW + i;
    if (depth[a] === Infinity || t > depth[a] + 2.2) continue; // hidden behind the head
    const set = (ii: number, jj: number, c: string, mix = 1) => {
      const k = (jj * FW + ii) * 4; if (out[k + 3] === 0) return;
      const [r, g, b] = hex(c);
      out[k] = Math.round(out[k] * (1 - mix) + r * mix); out[k + 1] = Math.round(out[k + 1] * (1 - mix) + g * mix); out[k + 2] = Math.round(out[k + 2] * (1 - mix) + b * mix);
    };
    set(i, j, EYE);
    set(i + (w[0] < 0 ? 1 : -1), j, EYE_GLOW, 0.5);
    if (model.eyes.length && hash(i, j, 7) < 2) set(i, j - 1, EYE_GLOW, 0.35);
    void EYE_HI;
  }
  // outline: every empty texel touching the beast
  const fin = new Uint8ClampedArray(out);
  const [orr, og, ob] = hex(OUTLINE);
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    const a = (j * FW + i) * 4;
    if (out[a + 3]) continue;
    let near = false;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj;
      if (ii >= 0 && jj >= 0 && ii < FW && jj < FH && out[(jj * FW + ii) * 4 + 3]) near = true;
    }
    if (near) { fin[a] = orr; fin[a + 1] = og; fin[a + 2] = ob; fin[a + 3] = 235; }
  }
  // the shadow on the ground under it (soft dark ellipse, behind the beast)
  const sh = model.shadow;
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    const a = (j * FW + i) * 4;
    if (fin[a + 3]) continue;
    const u = i + 0.5 - OX, v = OY - (j + 0.5);
    // ground point under this texel (z = 0): v = y * sin(pitch)
    const gx = u, gy = v / Math.sin(PITCH);
    const sx = sh.x * model.scale * cy - sh.y * sy, syy = sh.x * sy + sh.y * cy;
    const lx = gx - sx, ly = gy - syy;
    const rx = lx * cy + ly * sy, ry = -lx * sy + ly * cy;
    const q = (rx / (sh.rx * model.scale)) ** 2 + (ry / (sh.ry * model.scale)) ** 2;
    if (q < 1) { fin[a] = 6; fin[a + 1] = 4; fin[a + 2] = 10; fin[a + 3] = Math.round(sh.a * 255 * (q < 0.55 ? 1 : 0.6)); }
  }
  return { px: fin };
}

// ---- the great wolf -------------------------------------------------------------------------------------
type WolfPose = { gait: number; run: number; bob: number; lean: number; headUp: number; jaw: number; reach: number; crouch: number; tail: number; breathe: number };
const W0: WolfPose = { gait: 0, run: 0, bob: 0, lean: 0, headUp: 0, jaw: 0, reach: 0, crouch: 0, tail: 0, breathe: 0 };

/** Gallop footfalls (fraction of a stride) for hind near, hind far, fore near, fore far; and how long a paw stays down. */
const GALLOP = [0, 0.12, 0.42, 0.54], GALLOP_STANCE = 0.3;
/** The gallop's body motion over one stride: one gentle rise and fall (highest in the gathered flight after the front
 * feet push off), and the back rocking: rump high as the hind feet land, chest high as the front feet do. */
const gallopBody = (k: number) => ({ bob: 0.45 + 0.45 * Math.cos(2 * Math.PI * (k - 0.78)), lean: 0.045 * Math.sin(2 * Math.PI * (k - 0.2)) });

function wolf(pose: Partial<WolfPose>): Model {
  const P = { ...W0, ...pose };
  const prims: Prim[] = [];
  const bz = 15 + P.bob - P.crouch, bx = P.reach;
  const at = (x: number, y: number, z: number): V => [bx + x, y, z + x * Math.sin(P.lean)]; // the body tilts by `lean` round its middle
  const breathe = 1 + P.breathe * 0.04;
  // torso: deep chest, tucked waist, strong haunches
  prims.push(ellipsoid(at(5, 0, bz + 0.5), [7.5, 6.0 * breathe, 6.4 * breathe], "wfur", 2, -0.1 + P.lean));
  prims.push(ellipsoid(at(-1, 0, bz + 0.6), [8, 5.0, 4.9], "wfur", 2));
  prims.push(ellipsoid(at(-8, 0, bz + 0.6), [5.6, 5.5, 5.6], "wfur", 2));
  prims.push(ellipsoid(at(3, 0, bz - 3.4), [6.5, 3.6, 3.2], "wruff", 1.4)); // pale underside of the chest
  prims.push(ellipsoid(at(-2, 0, bz + 3.2), [10.5, 4.2, 3.0], "wdark", 1.2)); // the black saddle down the back
  // ruff: a thick shaggy mane round the neck and shoulders
  prims.push(ellipsoid(at(8.5, 0, bz + 3), [5.2, 6.6, 5.8], "wruff", 2, 0.5));
  // neck and head
  const hx = 13.5 + Math.cos(P.headUp) * 0.5, hz = bz + 5.5 + P.headUp * 6;
  const head: V = at(hx, 0, hz);
  prims.push(limb(at(9, 0, bz + 2.5), head, 4.4, 3.6, "wfur", 1.8));
  prims.push(ellipsoid(head, [4.6, 4.2, 3.9], "wfur", 1.4));
  // muzzle (raised with the head when howling), jaw drops open to bite
  const mu = (P.headUp * 0.9) + 0.12; // muzzle pitch (radians, up)
  const mdir: V = [Math.cos(mu), 0, Math.sin(mu)];
  const mStart = add(head, [1.8, 0, -0.6]);
  const mEnd = add(mStart, mul(mdir, 6.6));
  prims.push(limb(mStart, mEnd, 2.4, 1.45, "wmuz", 1));
  prims.push(ellipsoid(add(mEnd, mul(mdir, 0.5)), [1.15, 1.25, 1.05], "nose", 0.5));
  const ja = mu - 0.15 - P.jaw; // lower jaw
  const jdir: V = [Math.cos(ja), 0, Math.sin(ja)];
  const jStart = add(head, [1.4, 0, -1.9]);
  const jEnd = add(jStart, mul(jdir, 5.8));
  prims.push(limb(jStart, jEnd, 1.6, 1.0, "wmuz", 0.6));
  if (P.jaw > 0.15) {
    prims.push(limb(add(mStart, mul(mdir, 1.2)), add(jStart, mul(jdir, 1.2)), 1.2, 1.2, "mouth", 0.3));
    // fangs
    for (const s of [-1, 1]) {
      const f: V = add(add(mStart, mul(mdir, 5.4)), [0, s * 0.9, -1.4]);
      prims.push(limb(f, add(f, [0, 0, -1.4]), 0.45, 0.25, "tooth", 0.1));
      const g: V = add(add(jStart, mul(jdir, 4.6)), [0, s * 0.8, 1.0]);
      prims.push(limb(g, add(g, [0, 0, 1.0]), 0.4, 0.2, "tooth", 0.1));
    }
  }
  // ears: tall, pointed, laid back a little
  for (const s of [-1, 1]) {
    const e0 = add(head, [-1.2, s * 2.1, 2.4]);
    prims.push(limb(e0, add(e0, [-1.4 - P.headUp, s * 0.6, 3.9]), 1.5, 0.25, "wfur", 0.6));
  }
  // legs: hip -> knee -> paw, a trotting gait (diagonal pairs) or a galloping bound
  const legs: { x: number; s: number; front: boolean; ph: number }[] = [
    { x: 8.5, s: 1, front: true, ph: 0 }, { x: 8.5, s: -1, front: true, ph: 0.5 },
    { x: -8, s: 1, front: false, ph: 0.5 }, { x: -8, s: -1, front: false, ph: 0 },
  ];
  for (const L of legs) {
    let sw: number, up: number;
    if (P.run > 0.5) {
      // a real gallop (Murat 2026-11-21: the old bound bounced like a hop): the hind feet land one after the other,
      // then the front ones; each paw stays planted on the ground while the body passes over it (it slides back
      // under the hip at running speed), then lifts, tucks and reaches forward
      const t = (((P.gait + GALLOP[L.front ? (L.s > 0 ? 2 : 3) : (L.s > 0 ? 0 : 1)]) % 1) + 1) % 1, A = L.front ? 6.6 : 6.0;
      if (t < GALLOP_STANCE) { sw = A * (1 - 2 * t / GALLOP_STANCE); up = 0; }
      else {
        const q = (t - GALLOP_STANCE) / (1 - GALLOP_STANCE);
        sw = -A + 2 * A * (1 - Math.cos(Math.PI * q)) / 2;
        up = Math.sin(Math.PI * Math.pow(q, 0.8)) * (L.front ? 3.6 : 3.0);
      }
    } else {
      const ph = P.gait + L.ph;
      sw = Math.sin(ph * Math.PI * 2) * (3.6 + P.run * 2.2) * (P.gait || P.run ? 1 : 0);
      up = Math.max(0, Math.cos(ph * Math.PI * 2)) * (1.6 + P.run * 1.4) * (P.gait || P.run ? 1 : 0);
    }
    const hip = at(L.x, L.s * 3.4, bz - 1);
    const paw: V = [hip[0] + sw + (L.front ? 0.6 : -0.6) + (L.front ? P.reach * 0.3 : -P.reach * 0.2), L.s * 3.6, 0.9 + up];
    const knee: V = L.front
      ? [(hip[0] + paw[0]) / 2 - 0.4, L.s * 3.5, (hip[2] + paw[2]) / 2 + 0.3]
      : [(hip[0] + paw[0]) / 2 - 2.0, L.s * 3.5, (hip[2] + paw[2]) / 2 + 1.6]; // the hind leg's hock bends back
    prims.push(limb(hip, knee, L.front ? 2.6 : 3.2, 1.6, "wfur", 1.4));
    prims.push(limb(knee, paw, 1.5, 1.15, "wfur", 0.8));
    prims.push(ellipsoid(add(paw, [0.8, 0, -0.1]), [1.7, 1.25, 0.95], "wfur", 0.5));
    prims.push(ellipsoid(add(paw, [2.2, 0, -0.5]), [0.45, 0.9, 0.35], "claw", 0.2));
  }
  // tail: a heavy brush, swinging
  const t0 = at(-12.5, 0, bz + 2);
  const tw = Math.sin(P.tail) * 2.2;
  const t1: V = add(t0, [-4, tw * 0.6, -1.5 + P.run * 2]), t2: V = add(t1, [-4.2, tw, -2.2 + P.run * 2.5]);
  prims.push(limb(t0, t1, 2.2, 2.6, "wfur", 1.2));
  prims.push(limb(t1, t2, 2.6, 1.0, "wruff", 1.0));
  const eyes: V[] = [-1, 1].map((s) => add(head, [2.9, s * 2.3, 1.0]));
  return { scale: 1.12, prims, eyes, furAmp: 0.95, shadow: { x: bx, y: 0, rx: 15, ry: 6.5, a: 0.35 } };
}

// ---- the giant bat ----------------------------------------------------------------------------------------
type BatPose = { flap: number; fold: number; z: number; dive: number; jaw: number };
function bat(pose: Partial<BatPose>): Model {
  const P: BatPose = { flap: 0, fold: 0, z: 23, dive: 0, jaw: 0, ...pose };
  const prims: Prim[] = [];
  const c: V = [P.dive * 6, 0, P.z - P.dive * 6];
  const tilt = 0.35 + P.dive * 0.6; // body leans forward in flight
  const B = (x: number, y: number, z: number): V => add(c, rotY([x, y, z], -tilt + Math.PI / 2 * 0));
  // body: a furry barrel, head forward and up
  prims.push(ellipsoid(B(0, 0, 0), [5.0, 4.0, 4.2], "bfur", 1.4, -tilt));
  prims.push(ellipsoid(B(-4.2, 0, -0.8), [3.8, 3.1, 3.1], "bfur", 1.4, -tilt));
  prims.push(ellipsoid(B(2.2, 0, 1.4), [3.4, 4.3, 3.4], "bfur", 1.2)); // a shaggy ruff round the neck
  const head = B(5.6, 0, 1.8);
  prims.push(ellipsoid(head, [3.2, 3.0, 2.8], "bfur", 1.1));
  // snout, mouth, fangs
  prims.push(limb(add(head, [1.6, 0, -0.4]), add(head, [3.5, 0, -0.6]), 1.4, 0.9, "ear", 0.5));
  if (P.jaw > 0.1) for (const s of [-1, 1]) prims.push(limb(add(head, [2.8, s * 0.6, -1.0]), add(head, [2.8, s * 0.6, -2.3]), 0.35, 0.2, "tooth", 0.1));
  // great ears
  for (const s of [-1, 1]) {
    const e0 = add(head, [-0.2, s * 1.4, 1.6]);
    prims.push(limb(e0, add(e0, [0.4, s * 2.0, 5.4]), 1.9, 0.2, "ear", 0.5));
  }
  // legs and clawed feet tucked under the tail
  for (const s of [-1, 1]) {
    const h = B(-5, s * 1.4, -1.5);
    prims.push(limb(h, add(h, [-1.5, s * 0.4, -2.6 - P.dive * 1.5]), 0.7, 0.45, "bone", 0.3));
  }
  // wings: arm to the wrist, fingers out to the tips, leather between (scalloped trailing edge)
  for (const s of [-1, 1]) {
    const sh = B(1.4, s * 3.2, 1.2);
    const flapA = P.flap * s; // + = wings up
    // the wing's own axes: out (to the side), back (toward the tail)
    let out: V = [0, s, 0], back: V = [-1, 0, 0];
    out = rotX(out, flapA); back = rotX(back, flapA);
    // fold: the hand closes in toward the body on the upstroke
    const k = 1 - P.fold * 0.42;
    const pts: number[][] = [
      [0, -0.8], [10 * k, -3], [21 * k, -1.4], [16 * k, 2.8], [19.5 * k, 6.8], [14 * k, 6.6], [12.8 * k, 11], [8.4 * k, 8.2], [5 * k, 9.8], [0, 7],
    ];
    const P2 = (a: number[]) => add(sh, add(mul(out, a[0]), mul(back, a[1])));
    prims.push(membrane(sh, out, back, pts, 0.42, "wing"));
    prims.push(limb(sh, P2([10 * k, -3]), 1.2, 0.8, "bone", 0.5));
    for (const tip of [[21 * k, -1.4], [19.5 * k, 6.8], [12.8 * k, 11], [5 * k, 9.8]]) prims.push(limb(P2([10 * k, -3]), P2(tip), 0.6, 0.3, "bone", 0.3));
    prims.push(limb(P2([10 * k, -3]), P2([11.4 * k, -5]), 0.5, 0.2, "claw", 0.2)); // thumb claw
  }
  const eyes: V[] = [-1, 1].map((s) => add(head, [2.5, s * 1.4, 0.7]));
  return { scale: 1.18, prims, eyes, furAmp: 0.7, shadow: { x: c[0], y: 0, rx: 9, ry: 4, a: 0.28 - P.dive * 0.0 } };
}

// ---- sheets ----------------------------------------------------------------------------------------------
export const FORM_DIRS = ["down", "downright", "right", "upright", "up", "upleft", "left", "downleft"] as const;
const YAW: Record<string, number> = { right: 0, downright: -Math.PI / 4, down: -Math.PI / 2, downleft: -3 * Math.PI / 4, left: Math.PI, upleft: 3 * Math.PI / 4, up: Math.PI / 2, upright: Math.PI / 4 };

interface AnimSpec { name: string; fps: number; loop: boolean; poses: Model[] }
const loopN = (n: number, f: (k: number) => Model) => Array.from({ length: n }, (_, i) => f(i / n));

function wolfAnims(): AnimSpec[] {
  return [
    { name: "idle", fps: 5, loop: true, poses: loopN(4, (k) => wolf({ breathe: Math.sin(k * Math.PI * 2), tail: Math.sin(k * Math.PI * 2) * 0.6, headUp: Math.sin(k * Math.PI * 2) * 0.03 })) },
    { name: "run", fps: 16, loop: true, poses: loopN(8, (k) => wolf({ gait: k, run: 1, ...gallopBody(k), tail: Math.sin(k * Math.PI * 2) * 0.5, headUp: -0.06 + 0.03 * Math.sin(2 * Math.PI * (k - 0.6)) })) },
    { name: "bite", fps: 14, loop: false, poses: [
      wolf({ crouch: 1.6, reach: -1.5, headUp: -0.12, jaw: 0.2 }),
      wolf({ reach: 3.5, bob: 1.2, lean: 0.08, headUp: 0.02, jaw: 0.75, run: 0.4, gait: 0.25 }),
      wolf({ reach: 2.5, bob: 0.4, headUp: -0.05, jaw: 0.1 }),
      wolf({ reach: 0.5, headUp: 0, jaw: 0 }),
    ] },
    { name: "howl", fps: 8, loop: false, poses: [
      wolf({ crouch: 0.6, headUp: 0.2 }), wolf({ headUp: 0.65, jaw: 0.4, crouch: 0.8 }), wolf({ headUp: 0.85, jaw: 0.55, crouch: 0.9 }), wolf({ headUp: 0.85, jaw: 0.5, crouch: 0.9, breathe: 1 }),
    ] },
  ];
}
function batAnims(): AnimSpec[] {
  const flap = (k: number) => { const a = Math.sin(k * Math.PI * 2); return { flap: 0.2 + a * 0.85, fold: Math.max(0, a) * 0.8, z: 23 - a * 1.6 }; };
  return [
    { name: "fly", fps: 14, loop: true, poses: loopN(6, (k) => bat(flap(k))) },
    { name: "bite", fps: 14, loop: false, poses: [
      bat({ flap: 0.9, fold: 0.6, z: 25 }), bat({ flap: -0.4, z: 21, dive: 0.7, jaw: 1 }), bat({ flap: -0.7, z: 20, dive: 0.9, jaw: 1 }), bat({ flap: 0.4, z: 23, dive: 0.2 }),
    ] },
  ];
}

export function buildForms(outDir: string) {
  mkdirSync(outDir, { recursive: true });
  const meta: any = { frameWidth: FW, frameHeight: FH, origin: { x: OX / FW, y: OY / FH }, texelsPerPx: 1.5, forms: {} };
  for (const [name, anims] of [["wolf", wolfAnims()], ["bat", batAnims()]] as [string, AnimSpec[]][]) {
    const cols = Math.max(...anims.map((a) => a.poses.length));
    const rows = anims.length * FORM_DIRS.length;
    const can = createCanvas(cols * FW, rows * FH), ctx = can.getContext("2d");
    const info: any = {};
    let row = 0;
    for (const a of anims) for (const d of FORM_DIRS) {
      const frames: number[] = [];
      a.poses.forEach((m, i) => {
        const f = render(m, YAW[d]);
        const img = ctx.createImageData(FW, FH);
        img.data.set(f.px);
        ctx.putImageData(img, i * FW, row * FH);
        frames.push(row * cols + i);
      });
      info[`${a.name}_${d}`] = { frames, fps: a.fps, loop: a.loop };
      row++;
    }
    writeFileSync(`${outDir}/${name}.png`, can.encodeSync("png"));
    meta.forms[name] = { columns: cols, anims: info };
    console.log(`${name}: ${rows} rows x ${cols}`);
  }
  writeFileSync(`${outDir}/forms.json`, JSON.stringify(meta, null, 1));
}

if (process.argv[1]?.endsWith("beastForms.ts")) buildForms(process.argv[2] ?? "client/public/assets/hd/forms");
