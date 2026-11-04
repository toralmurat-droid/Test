import Phaser from "phaser";
import { sheet, type Pen } from "./worldProps";
import { hash, vnoise, dith, FIRE } from "./bonfireArt";

/**
 * Brann's smithy by the well: a soot-black stone forge with a chimney, a glowing coal bed and leather bellows that pump
 * the coals brighter, an anvil on an oak stump with a blade cooling on it, a quench barrel that steams, a grindstone
 * whose wheel turns, a tool bench with a coal heap, and the rack of weapons he sells.
 *
 * Bonfire-style pixel art at 1.5 texels per world px: flat colour ramps, ordered dithering, dark outline, light from
 * the top left, all drawn in the same isometric view as the buildings. Cosmetic only (collision is NPC_DECOR.solid
 * in shared/npcs.ts). The chimney smoke is a particle emitter (npcs.ts), so it can rise past the frame.
 */
export const TX = 1.5;
export const SMITHY_FRAMES = 12;
const N = SMITHY_FRAMES;

const step = (pal: number[], v: number, x: number, y: number) => {
  const c = Math.max(0, Math.min(pal.length - 1, v)), i = Math.floor(c);
  return pal[Math.min(pal.length - 1, c - i > dith(x, y) ? i + 1 : i)];
};
const hex = (s: string) => parseInt(s.slice(1), 16);

const STONE = [0x121116, 0x1e1c22, 0x2c2930, 0x3c383e, 0x4f4a4e, 0x655e5e, 0x7c7470]; // cold grey, warm where lit
const SOOT = [0x0c0b0e, 0x161418, 0x221f24, 0x302c30];
const MORTAR = 0x141216;
const WOOD = [0x1c120a, 0x2e1e10, 0x45301a, 0x5e4426, 0x7a5a34, 0x94703f];
const BARK = [0x18110c, 0x2a1e14, 0x3e2c1c, 0x524028];
const IRON = [0x0e1014, 0x1c1f24, 0x2e3238, 0x464c54, 0x666e78, 0x929ca6, 0xc4ccd2];
const LEATHER = [0x1a0f0a, 0x321e12, 0x4c2e1a, 0x6a4226, 0x8a5a34, 0xa47446];
const HOT = [0x2a0a06, 0x581008, 0x922008, 0xcc420e, 0xf2761c, 0xffb040, 0xffe08a, 0xfff6d0]; // iron from cherry red to white heat
const COALS = [0x0e0a0a, 0x241210, 0x4a1408, 0x8a240a, 0xc8460e, 0xff8a26, 0xffc860];
const FIREC = FIRE.map(hex);
const WATER = [0x080c10, 0x111a20, 0x1c2a30, 0x2c4046, 0x4a6266, 0x7a9496];
const STEAM = [0x8a8e8c, 0xaab0ac, 0xcdd2ce, 0xe8ece8];
const CLOTH = [0x200c0c, 0x3a1414, 0x5a1e1a, 0x7a2c22, 0x963c2a];
const BRASS = [0x3a2a10, 0x6a4c1c, 0x9a722c, 0xc89c44, 0xead07a];
const GRIT = [0x2a2826, 0x3e3a36, 0x57514a, 0x726a60, 0x8c8378];

// ---- shared helpers ---------------------------------------------------------------------------------------
type Face = "top" | "left" | "right";
/**
 * Axis-aligned isometric box: (ox, oy) is the screen point of its back corner on the ground (u = v = 0, z = 0), u runs
 * down-right, v down-left, z up. `shade` paints each visible face, with (a, b) = position on that face.
 */
function box(p: Pen, ox: number, oy: number, W: number, D: number, H: number, z0: number, shade: (face: Face, a: number, b: number, x: number, y: number) => number | undefined) {
  for (let y = Math.floor(oy - z0 - H - 1); y <= Math.ceil(oy - z0 + (W + D) / 2 + 1); y++) {
    for (let x = Math.floor(ox - D); x <= Math.ceil(ox + W); x++) {
      let face: Face | undefined, a = 0, b = 0;
      const tu = (x - ox + 2 * (y - oy + z0 + H)) / 2, tv = (2 * (y - oy + z0 + H) - (x - ox)) / 2;
      if (tu >= 0 && tu < W && tv >= 0 && tv < D) { face = "top"; a = tu; b = tv; }
      else {
        const lu = x - ox + D, lz = oy + (lu + D) / 2 - y - z0;
        if (lu >= 0 && lu < W && lz >= 0 && lz < H) { face = "left"; a = lu; b = lz; }
        else {
          const rv = ox + W - x, rz = oy + (W + rv) / 2 - y - z0;
          if (rv > 0 && rv <= D && rz >= 0 && rz < H) { face = "right"; a = rv; b = rz; }
        }
      }
      if (!face) continue;
      const c = shade(face, a, b, x, y);
      if (c !== undefined) p.px(x, y, c);
    }
  }
}

function disc(p: Pen, cx: number, cy: number, rx: number, ry: number, fn: (x: number, y: number, dx: number, dy: number) => number | undefined) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    if (dx * dx + dy * dy > 1) continue;
    const c = fn(x, y, dx, dy);
    if (c !== undefined) p.px(x, y, c);
  }
}

/** Ground shadow, dithered, pushed away from the light. */
function shadow(p: Pen, cx: number, cy: number, rx: number, ry: number, a = 0.4) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    if (dx * dx + dy * dy <= 1 && dith(x, y) < 0.75) p.px(x, y, 0x000000, a);
  }
}

/** Dressed stone blocks in courses on a wall face; returns the ramp level (or -1 for mortar). */
function masonry(a: number, b: number, seed: number, course = 6) {
  const row = Math.floor(b / course), off = hash(row, 3, seed) * 9;
  const len = 7 + Math.floor(hash(row, 4, seed) * 4);
  const col = Math.floor((a + off + row * 4) / len);
  const fa = (a + off + row * 4) - col * len, fb = b - row * course;
  if (fa < 1 || fb < 1) return -1;
  let v = (hash(col, row, seed + 1) - 0.5) * 0.9;
  if (fa < 2 || fb > course - 1.5) v -= 0.4; // block edges in shadow under the lip
  if (fb < 2) v += 0.35; // lit top edge of each block
  if (hash(Math.floor(a), Math.floor(b), seed + 2) < 0.06) v -= 0.8; // pits and chips
  return 10 + v;
}

/** Iron shaft (tool handle, poker): 1-2 px line, lit on the left. */
function rod(p: Pen, x0: number, y0: number, x1: number, y1: number, pal = IRON, lit = 4) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
    p.px(x, y, pal[lit]); p.px(x + 1, y, pal[Math.max(0, lit - 2)]);
  }
}

/** Pen that shrinks a design grid by k onto the texture (every texture pixel still gets one flat colour). */
function scaled(p: Pen, k: number): Pen {
  return {
    px: (x, y, c, a) => p.px(Math.floor(x * k), Math.floor(y * k), c, a),
    line: (x0, y0, x1, y1, c) => p.line(x0 * k, y0 * k, x1 * k, y1 * k, c),
    rect: (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) p.px(Math.floor((x + i) * k), Math.floor((y + j) * k), c); },
    shaft: p.shaft,
  };
}

// ---- forge -------------------------------------------------------------------------------------------------
export const FORGE_W = 132, FORGE_H = 132;
const FW = 46, FD = 32, FH = 22; // hearth box in texels
const FOX = 50, FOY = 87; // back ground corner of the hearth on the frame
const PIT = { u0: 13, u1: 39, v0: 12, v1: 29 }; // coal bed sunk into the hearth top
/** Screen point of a hearth-space point. */
const P = (u: number, v: number, z: number): [number, number] => [FOX + u - v, FOY + (u + v) / 2 - z];

/** How hard the bellows blow this frame (0..1): the board is pushed down over the first half of the loop. */
const blow = (f: number) => Math.max(0, Math.sin((f / N) * Math.PI * 2));
const openAt = (f: number) => 0.45 + 0.55 * (0.5 + 0.5 * Math.cos((f / N) * Math.PI * 2));

function forge(p: Pen, f: number) {
  const ph = (f / N) * Math.PI * 2, gust = blow(f);
  shadow(p, ...P(FW / 2 + 8, FD / 2 + 4, 0), 44, 20);

  // stone hearth: dressed blocks, soot creeping up from the fire, lighter where the light hits
  box(p, FOX, FOY, FW, FD, FH, 0, (face, a, b, x, y) => {
    if (face === "top") {
      // pit sunk into the top: a stone rim around a bed of coals
      const inPit = a >= PIT.u0 && a < PIT.u1 && b >= PIT.v0 && b < PIT.v1;
      if (inPit) {
        const cu = (a - (PIT.u0 + PIT.u1) / 2) / ((PIT.u1 - PIT.u0) / 2), cv = (b - (PIT.v0 + PIT.v1) / 2) / ((PIT.v1 - PIT.v0) / 2);
        const edge = Math.max(Math.abs(cu), Math.abs(cv));
        if (b < PIT.v0 + 2) return step(STONE, 1.2, x, y); // the pit's back wall, in its own shadow
        const n = vnoise(a * 0.45, b * 0.45 + f * 0.5, 6, 3) * 0.6 + hash(a >> 1, b >> 1, f >> 1) * 0.4;
        const heat = 1.4 + n * 3.4 - edge * 2.2 + gust * 1.4;
        return step(COALS, heat, x, y);
      }
      const rim = a >= PIT.u0 - 3 && a < PIT.u1 + 3 && b >= PIT.v0 - 3 && b < PIT.v1 + 3;
      let v = rim ? 4.4 : 3.6;
      if (rim && (hash(Math.floor((a + b) / 4), 1, 9) < 0.5)) v -= 0.5; // rim stones
      if ((Math.floor(a / 9) + Math.floor(b / 7)) % 2 === 0 && !rim) v -= 0.3; // slabs
      v += (hash(a >> 1, b >> 1, 5) - 0.5) * 0.8;
      if (a < 3 || b > FD - 2) v += 0.8; // worn lit edges
      if (hash(Math.floor(a), Math.floor(b), 21) < 0.04) return COALS[4 - ((f + a) % 2)]; // stray embers on the slab
      return step(STONE, v - 0.4 * Math.max(0, 1 - Math.abs(a - 26) / 18), x, y);
    }
    const m = masonry(a, b, face === "left" ? 1 : 2);
    if (m < 0) return MORTAR;
    let v = m - 10 + (face === "left" ? 3.2 : 2.0);
    v -= Math.max(0, (b - 14) / 8) * 1.1; // soot under the lip
    if (b < 3) v -= 0.6; // mud splash at the foot
    if (face === "left" && a > FW - 2) v += 0.7; // front corner catches the light
    if (face === "right" && a < 2) v -= 0.2;
    return step(STONE, v, x, y);
  });

  // ash-pit arch in the front face, the coals glowing through it
  for (let u = 11; u <= 35; u++) for (let z = 0; z <= 15; z++) {
    const k = (u - 23) / 11.5, top = 8 + Math.sqrt(Math.max(0, 1 - k * k)) * 6;
    if (Math.abs(k) > 1 || z > top + 2.5) continue;
    const [x, y] = P(u, FD, z);
    if (z > top) { // arch stones (voussoirs)
      const seg = Math.floor(Math.atan2(z - 8, u - 23) * 4);
      p.px(x, y, step(STONE, 3.4 + (seg % 2) * 0.7 - (z > top + 1.5 ? 0.6 : 0), x, y));
      continue;
    }
    const depth = 1 - z / top, n = hash(u >> 1, z >> 1, (f >> 1) + 40);
    const v = depth * 3.6 + n * 1.4 - Math.abs(k) * 1.3 + gust * 0.8 - (z > top - 2 ? 1.6 : 0);
    p.px(x, y, z < 2 ? step(COALS, v + 0.6, x, y) : v < 1.2 ? SOOT[0] : step(COALS, v, x, y));
  }

  // flames licking up off the coals, stronger when the bellows blow
  for (let y = 40; y < FORGE_H; y++) for (let x = 0; x < FORGE_W; x++) {
    // find the pit row under this pixel: the flame base is the pit surface
    const cxp = P((PIT.u0 + PIT.u1) / 2, (PIT.v0 + PIT.v1) / 2 + 2, FH);
    const dx = (x - cxp[0]) / 14, hgt = cxp[1] - y;
    if (Math.abs(dx) > 1 || hgt < -3 || hgt > 22) continue;
    const n = vnoise(x * 0.32, (y + f * 3) * 0.28, 12 * 0.28 * 12 / 3.36, 7);
    const t = n * (1 - Math.abs(dx) ** 1.6) - Math.max(0, hgt) / (12 + gust * 10) + 0.25 + gust * 0.12;
    if (t < 0.32) continue;
    const i = Math.min(FIREC.length - 1, Math.floor((t - 0.32) * 13 + dith(x, y) * 1.2));
    if (hgt < -1 && i < 3) continue;
    p.px(x, y, FIREC[Math.max(1, i)]);
  }

  // hood and chimney at the back, blackened by years of smoke
  const flue = (face: Face, a: number, b: number, x: number, y: number, top: number, seed: number) => {
    if (face === "top") return b > 2 && b < 7 && a > 3 && a < 11 ? SOOT[0] : step(STONE, 3.4 + hash(a, b, seed) * 0.6, x, y); // the flue opening
    const m = masonry(a, b, seed, 5);
    if (m < 0) return MORTAR;
    const soot = Math.max(0, 1 - Math.abs(b - top * 0.5) / (top * 0.9));
    let v = m - 10 + (face === "left" ? 2.8 : 1.7) - soot * 0.6;
    if (face === "left" && a > (seed === 3 ? 27 : 13)) v += 0.5;
    return step(STONE, v, x, y);
  };
  box(p, ...P(6, 0, 0), 28, 13, 12, FH, (face, a, b, x, y) => {
    if (face === "top") return step(STONE, 3 + hash(a >> 1, b >> 1, 11) * 0.8 - (b > 11 ? -0.6 : 0), x, y);
    if (b > 10) return step(STONE, face === "left" ? 4.2 : 3, x, y); // the mantel lip
    const v = flue(face, a, b, x, y, 12, 3);
    // the fire's glow on the underside of the hood
    if (face === "left" && b < 4 && a > 6 && a < 24) return step(COALS, 2.6 + gust - b * 0.4 + hash(a, b, f) * 0.6, x, y);
    return v;
  });
  box(p, ...P(13, 2, 0), 14, 9, 44, FH + 12, (face, a, b, x, y) => {
    if (face !== "top" && b > 40) return step(STONE, face === "left" ? 4 : 2.8, x, y); // cap course
    return flue(face, a, b, x, y, 44, 4);
  });
  // a crack down the chimney with a weed in it
  {
    const [x0, y0] = P(20, 11, FH + 40);
    for (let i = 0; i < 14; i++) p.px(x0 + Math.round(Math.sin(i * 1.3) * 0.8), y0 + i, SOOT[0]);
    p.px(x0 + 1, y0 + 6, 0x3c4a22); p.px(x0 + 2, y0 + 5, 0x52602c); p.px(x0 + 2, y0 + 7, 0x3c4a22);
  }

  // tongs, poker and a rake leaning on the front of the hearth
  for (let i = 0; i < 3; i++) {
    const [bx, by] = P(1 + i * 3.5, FD + 3, 0), tx = bx + 4, ty = by - 26 + i * 2;
    if (i === 0) { // tongs: two arms crossing at a rivet, jaws at the top
      rod(p, bx, by, tx + 1, ty, IRON, 3); rod(p, bx + 3, by, tx - 1, ty + 1, IRON, 4);
      p.px(bx + 2, by - 10, BRASS[3]); p.px(tx, ty - 1, IRON[2]); p.px(tx - 1, ty - 1, IRON[2]);
    } else if (i === 1) { // poker with a hooked, still-glowing tip
      rod(p, bx, by, tx, ty, IRON, 4);
      p.px(tx + 1, ty, IRON[3]); p.px(tx + 1, ty + 1, HOT[2]); p.px(tx, ty - 1, IRON[4]);
      p.px(bx, by - 1, WOOD[3]); p.px(bx, by - 2, WOOD[4]); p.px(bx + 1, by - 1, WOOD[1]);
    } else { // rake
      rod(p, bx, by, tx, ty, WOOD, 4);
      for (let k = -2; k <= 2; k++) p.px(tx + k, ty, IRON[3]);
      for (let k = -2; k <= 2; k += 2) p.px(tx + k, ty - 1, IRON[4]);
    }
  }
  // coal scuttle by the corner, heaped with coal
  {
    const [cx, cy] = P(-4, FD + 2, 0);
    shadow(p, cx + 3, cy + 1, 8, 3, 0.35);
    for (let y = cy - 8; y <= cy; y++) for (let x = cx - 6; x <= cx + 6; x++) {
      const k = (y - (cy - 8)) / 8, half = 6 - k * 1.2;
      if (Math.abs(x - cx) > half) continue;
      p.px(x, y, step(IRON, 3 - (x - cx) * 0.3 - (y === cy - 8 ? -1 : 0) + (y === cy - 3 ? -1.2 : 0), x, y));
    }
    disc(p, cx, cy - 9, 6, 2.5, (x, y, dx, dy) => (hash(x, y, 2) < 0.2 ? IRON[5] : step(SOOT.concat(IRON[3]), 2 - dx - dy + hash(x >> 1, y, 1), x, y)));
    p.line(cx - 5, cy - 11, cx - 2, cy - 14, IRON[3]); p.line(cx - 2, cy - 14, cx + 4, cy - 12, IRON[3]); // handle
  }

  // bellows on a trestle beside the hearth, its nozzle in the fire: the top board rises and falls
  const open = openAt(f);
  const N0: [number, number] = P(FW - 1, 15, 6), B0: [number, number] = P(FW + 30, 15, 5);
  const trestle = (s: number) => [N0[0] + (B0[0] - N0[0]) * s, N0[1] + (B0[1] - N0[1]) * s];
  // trestle legs
  for (const s of [0.35, 0.9]) { const [x, y] = trestle(s); rod(p, x - 1, y + 2, x - 3, y + 9, WOOD, 3); rod(p, x + 1, y + 2, x + 3, y + 8, WOOD, 2); }
  for (let x = Math.floor(N0[0] - 2); x <= B0[0] + 6; x++) {
    const s = (x - N0[0]) / (B0[0] - N0[0]);
    if (s < -0.05 || s > 1.12) continue;
    const yc = N0[1] + (B0[1] - N0[1]) * s;
    if (s < 0.12) { // iron nozzle
      for (let t = -1; t <= 0; t++) p.px(x, yc + t, t ? IRON[4] : IRON[2]);
      continue;
    }
    const k = Math.min(1, (s - 0.12) / 0.88), w = 1.5 + 6 * Math.pow(Math.sin(Math.min(1, k * 1.05) * Math.PI * 0.62), 0.9);
    const h = Math.max(1, w * open * 0.9), top = w * 0.8; // leather height, then the top board seen from above
    // lower board edge
    for (let t = 0; t <= 1; t++) p.px(x, yc + t, t ? WOOD[0] : WOOD[2]);
    // leather bag in pleats that bunch up as the board comes down
    const pleats = Math.max(2, Math.round(h / 2));
    for (let t = -h; t < 0; t++) {
      const fold = ((Math.floor(((t + h) / h) * pleats)) % 2) ? -1 : 0.6;
      p.px(x, yc + t, step(LEATHER, 2.2 + fold + (t < -h + 1 ? 1.2 : 0) - k * 0.4, x, Math.round(yc + t)));
    }
    // top board: teardrop of oak planks, lit from the top left, iron studs round its edge
    for (let t = -h - top; t < -h; t++) {
      const e = t < -h - top + 1, sideEdge = t >= -h - 1;
      let v = 3.3 - k * 0.5 + (Math.floor((t + h + top) / 3) % 2 ? -0.35 : 0);
      if (e) v = 4.8; if (sideEdge) v = 1.6;
      p.px(x, yc + t, step(WOOD, v, x, Math.round(yc + t)));
    }
    if (Math.round(x) % 4 === 0 && s > 0.2 && s < 1) p.px(x, yc - h - top + 1, IRON[5]);
    if (s > 1) { p.px(x, yc - h - 2, WOOD[4]); p.px(x, yc - h - 1, WOOD[2]); } // handle
  }
  // ring on the handle and a rope up to the lever
  {
    const [hx, hy] = trestle(1.08), h = (1.5 + 6) * open * 0.9 + 1;
    p.px(hx + 4, hy - h - 3, IRON[4]); p.px(hx + 5, hy - h - 2, IRON[3]);
    // lever post with a counterweight stone
    const lx = hx + 6, ly = hy + 8;
    rod(p, lx, ly, lx, ly - 30, WOOD, 3);
    const tip = [lx - 10, ly - 30 + (open - 0.7) * 10];
    p.line(lx + 6, ly - 30 - (open - 0.7) * 6, tip[0], tip[1], WOOD[3]);
    p.line(lx + 6, ly - 31 - (open - 0.7) * 6, tip[0], tip[1] - 1, WOOD[4]);
    p.px(lx, ly - 31, IRON[4]);
    p.line(hx + 4, hy - h - 3, tip[0] + 2, tip[1] + 1, 0x6e5c40);
    disc(p, lx + 7, ly - 30 - (open - 0.7) * 6 + 3, 3, 2.5, (x, y, dx, dy) => step(STONE, 3.6 - dx - dy, x, y));
  }

  // sparks drifting slowly up out of the coals, more when the bellows blow
  for (let i = 0; i < 9; i++) {
    const k = ((f / N) + hash(i, 1, 77)) % 1;
    if (i > 5 && gust < 0.3 && k < 0.5) continue;
    const [sx, sy] = P(PIT.u0 + 4 + hash(i, 2, 77) * (PIT.u1 - PIT.u0 - 8), PIT.v0 + 6 + hash(i, 3, 77) * 8, FH);
    const x = Math.round(sx + Math.sin(k * 5 + i) * 3 + k * 4), y = Math.round(sy - 4 - k * 38);
    p.px(x, y, k < 0.4 ? HOT[7] : k < 0.75 ? HOT[5] : HOT[3], 1 - k * 0.5);
  }
}

// ---- anvil on its stump --------------------------------------------------------------------------------------
const AK = 0.74; // the anvil is drawn on a 56x50 design grid and shrunk to waist height
const ANVIL_DW = 56, ANVIL_DH = 50, ANVIL_BY = 44;
export const ANVIL_W = Math.ceil(ANVIL_DW * AK), ANVIL_H = Math.ceil(ANVIL_DH * AK);
/** Height of the anvil face above the ground, in world px (where the hammer hits and the sparks fly). */
export const ANVIL_TOP = ((ANVIL_BY - 17) * AK) / TX;

function anvil(p0: Pen, f: number) {
  const p = scaled(p0, AK);
  const ph = (f / N) * Math.PI * 2, SX = 27, ST = 33; // stump centre and top
  shadow(p, SX + 4, ANVIL_BY - 1, 20, 5);
  // hammer scale and slag on the ground around the stump
  for (let i = 0; i < 18; i++) {
    const a = hash(i, 1, 90) * Math.PI * 2, r = 11 + hash(i, 2, 90) * 10;
    p.px(SX + Math.cos(a) * r * 1.2, ANVIL_BY - 1 + Math.sin(a) * r * 0.32, i % 3 ? SOOT[2] : IRON[2]);
  }
  // oak stump: bark sides, a root, the cut top with rings and a hammer-scarred rim
  for (let y = ST; y <= ANVIL_BY; y++) for (let x = SX - 12; x <= SX + 12; x++) {
    const dx = (x - SX) / 11.5;
    const flare = y > ANVIL_BY - 4 ? (y - (ANVIL_BY - 4)) * 0.35 : 0;
    if (Math.abs(x - SX) > 11.5 + flare) continue;
    const by = ANVIL_BY - 1 + Math.sqrt(Math.max(0, 1 - dx * dx)) * 3;
    if (y > by) continue;
    const ridge = Math.sin(x * 1.7 + Math.floor(y / 3) * 0.8) > 0.5 ? -0.6 : 0;
    p.px(x, y, step(BARK, 2.4 - dx * 1.4 + ridge + (hash(x, y >> 1, 4) - 0.5) * 0.6, x, y));
  }
  disc(p, SX, ST, 11.5, 4, (x, y, dx, dy) => {
    const r = Math.hypot(dx, dy);
    if (r > 0.86) return step(BARK, 3 - dx, x, y);
    const ring = Math.round(r * 7 + hash(x >> 2, y, 3) * 0.6) % 2;
    return step(WOOD, 3.6 - ring * 0.7 - dx * 0.6 - dy * 0.4, x, y);
  });
  // iron bands strapping the anvil's foot to the stump
  for (const bx of [SX - 7, SX + 7]) for (let y = ST - 1; y <= ST + 6; y++) p.px(bx, y, step(IRON, 2.4 + (bx < SX ? 0.8 : 0), bx, y));

  // the anvil: foot, waist, body with the hardy hole, and the horn pointing right
  const AT = 16; // face row
  const prof = (y: number): [number, number] | undefined => {
    if (y < AT || y > ST) return;
    if (y <= AT + 4) return [SX - 12, SX + 9]; // body
    if (y <= AT + 9) { const k = (y - AT - 5) / 4; return [SX - 7 + k * 0.5, SX + 4 - k * 0.5]; } // waist
    const k = (y - AT - 10) / Math.max(1, ST - AT - 10); return [SX - 7 - k * 3, SX + 4 + k * 3]; // foot
  };
  for (let y = AT; y <= ST; y++) {
    const r = prof(y)!;
    for (let x = Math.floor(r[0]); x <= Math.ceil(r[1]); x++) {
      const k = (x - r[0]) / (r[1] - r[0]);
      let v = 4.2 - k * 2.6 - (y > AT + 4 ? 0.6 : 0);
      if (y === AT + 4) v -= 1.2; // under the face lip
      if (hash(x, y, 13) < 0.08) v -= 0.6; // pitting
      p.px(x, y, step(IRON, v, x, y));
    }
  }
  // horn: a tapering cone off the right end
  for (let x = SX + 9; x <= SX + 22; x++) {
    const k = (x - SX - 9) / 13, half = 2.3 * (1 - k) + 0.3, cy = AT + 1.6 + k * 0.8;
    for (let y = Math.floor(cy - half); y <= Math.ceil(cy + half); y++) {
      const t = (y - cy) / Math.max(0.6, half);
      if (Math.abs(t) > 1.05) continue;
      p.px(x, y, step(IRON, 4.3 - t * 2 - k * 0.6, x, y));
    }
  }
  // the face: a polished strip catching the light, the hardy and pritchel holes at the heel
  for (let x = SX - 12; x <= SX + 9; x++) { p.px(x, AT - 1, step(IRON, 5.4 - (x - SX + 12) * 0.05, x, AT)); p.px(x, AT - 2, step(IRON, 4.6, x, AT - 1)); }
  p.px(SX - 9, AT - 1, IRON[0]); p.px(SX - 8, AT - 1, IRON[0]); p.px(SX - 6, AT - 1, IRON[1]);
  // a blade on the face, cooling from orange heat at the tip down to black; it breathes as if just pulled from the fire
  const glow = 0.5 + 0.5 * Math.sin(ph);
  for (let x = SX - 5; x <= SX + 13; x++) {
    const k = (x - SX + 5) / 18, heat = 2 + k * 3.6 + glow * 0.8;
    p.px(x, AT - 3, step(HOT, heat, x, AT - 3));
    if (x < SX + 12) p.px(x, AT - 2, step(HOT, heat - 1.2, x, AT - 2));
  }
  // tongs holding the blade's tang, handles hanging off the anvil
  rod(p, SX - 6, AT - 3, SX - 17, AT + 6, IRON, 3); rod(p, SX - 6, AT - 2, SX - 15, AT + 9, IRON, 4);
  p.px(SX - 7, AT - 3, IRON[5]);
  // a sledge leaning on the stump
  rod(p, SX + 14, ANVIL_BY - 1, SX + 18, ST - 14, WOOD, 4);
  for (let y = ST - 17; y <= ST - 13; y++) for (let x = SX + 15; x <= SX + 21; x++) p.px(x, y, step(IRON, 4 - (x - SX - 15) * 0.4 - (y - ST + 17) * 0.2, x, y));
  // faint heat shimmer off the hot end
  for (let i = 0; i < 3; i++) {
    const k = ((f / N) + i / 3) % 1;
    p.px(SX + 10 + Math.round(Math.sin(k * 6 + i) * 1.5), AT - 5 - Math.round(k * 9), HOT[4], 0.5 * (1 - k));
  }
}

// ---- quench barrel ------------------------------------------------------------------------------------------
const QK = 0.84;
const QUENCH_DW = 40, QUENCH_DH = 62, QUENCH_BY = 56;
export const QUENCH_W = Math.ceil(QUENCH_DW * QK), QUENCH_H = Math.ceil(QUENCH_DH * QK);

function quench(p0: Pen, f: number) {
  const p = scaled(p0, QK);
  const ph = (f / N) * Math.PI * 2, CX = 19, TOP = 34, R = 10.5;
  shadow(p, CX + 4, QUENCH_BY - 1, 14, 4);
  // staves bulging at the middle, hoops, a split stave patched with a nailed slat
  for (let y = TOP; y <= QUENCH_BY; y++) {
    const k = (y - TOP) / (QUENCH_BY - TOP), half = R + Math.sin(k * Math.PI) * 1.5;
    const base = QUENCH_BY - 1 - TOP;
    for (let x = Math.floor(CX - half); x <= Math.ceil(CX + half); x++) {
      const dx = (x - CX) / half;
      if (Math.abs(dx) > 1) continue;
      const by = TOP + base + Math.sqrt(Math.max(0, 1 - dx * dx)) * 3.5;
      if (y > by) continue;
      const stave = Math.floor((Math.asin(Math.max(-1, Math.min(1, dx))) + 2) * 3.4);
      let v = 3.2 - dx * 1.8 + (hash(stave, 1, 8) - 0.5) * 0.9;
      const seam = Math.abs(((Math.asin(Math.max(-1, Math.min(1, dx))) + 2) * 3.4) % 1);
      if (seam < 0.12) v -= 1.2;
      if (k > 0.8) v -= (k - 0.8) * 4; // wet, darker foot
      const hoop = [0.12, 0.45, 0.84].some((h) => Math.abs(k - h - (1 - dx * dx) * 0.08) < 0.05);
      if (hoop) { p.px(x, y, step(IRON, 3 - dx * 1.6 + (hash(x, y, 2) < 0.2 ? -1 : 0), x, y)); continue; }
      if (hash(x, y >> 1, 3) < 0.05) v -= 0.8;
      p.px(x, y, step(WOOD, v, x, y));
    }
  }
  // wet streaks running down from the rim
  for (const sx of [CX - 6, CX - 1, CX + 4]) for (let y = TOP + 3; y < TOP + 8 + (sx & 3) * 3; y++) p.px(sx, y, WOOD[1], 0.6);
  // rim and the dark water inside, a slow ripple ring
  disc(p, CX, TOP, R + 0.5, 4, (x, y, dx, dy) => {
    const r = Math.hypot(dx, dy);
    if (r > 0.82) return step(WOOD, 4.2 - dx * 1.2 - dy, x, y);
    const rip = Math.abs(r - ((f / N) * 0.8 + 0.05)) < 0.07 || Math.abs(r - (((f / N) + 0.5) % 1) * 0.8 - 0.05) < 0.06;
    return step(WATER, 1.6 - dy * 0.7 - dx * 0.4 + (rip ? 1.3 : 0) + (hash(x, y, f) < 0.04 ? 1 : 0), x, y);
  });
  // a hilt sticking up out of the water where a blade cools, and the ladle hooked on the rim
  rod(p, CX + 3, TOP - 1, CX + 4, TOP - 10, IRON, 3);
  p.line(CX + 1, TOP - 7, CX + 7, TOP - 8, BRASS[2]); p.px(CX + 4, TOP - 11, BRASS[3]);
  rod(p, CX - 9, TOP - 1, CX - 13, TOP + 12, WOOD, 4);
  disc(p, CX - 13, TOP + 14, 2.5, 2, (x, y, dx) => step(IRON, 3.4 - dx, x, y));
  // steam curling up off the water in soft pixel wisps
  for (let w = 0; w < 3; w++) {
    const x0 = CX - 5 + w * 5, off = w / 3;
    for (let j = 0; j < 14; j++) {
      const k = ((f / N) + off + j / 14) % 1, y = Math.round(TOP - 2 - k * 30);
      const x = Math.round(x0 + Math.sin(k * 7 + w * 2 + ph * 0.5) * (1 + k * 3) + k * 3);
      if (dith(x, y) > 1 - k * 0.9 + 0.1) continue;
      const a = (1 - k) * 0.65;
      p.px(x, y, STEAM[k < 0.3 ? 3 : k < 0.6 ? 2 : 1], a);
      if (k > 0.4) p.px(x + 1, y, STEAM[1], a * 0.6);
    }
  }
}

// ---- weapon rack ----------------------------------------------------------------------------------------------
export const RACK_W = 90, RACK_H = 76, RACK_BY = 68;

function blade(p: Pen, x: number, top: number, len: number, w: number, glintY: number, kind: "sword" | "spear" | "axe" | "mace" | "hammer") {
  if (kind === "sword") {
    for (let y = top; y < top + len; y++) {
      const tip = y - top < 3 ? (y - top) / 3 : 1;
      for (let i = 0; i < w; i++) {
        if (tip < 1 && i !== Math.floor(w / 2)) continue;
        const g = Math.abs(y - glintY) < 2 ? 1.6 : 0;
        p.px(x + i, y, step(IRON, 5 - i * 1.2 + g - (i === Math.floor(w / 2) ? 0.5 : 0), x + i, y));
      }
    }
    for (let i = -3; i <= w + 2; i++) p.px(x + i, top + len, BRASS[i < 0 ? 3 : 2]); // crossguard
    for (let y = top + len + 1; y <= top + len + 5; y++) p.px(x + Math.floor(w / 2), y, y % 2 ? LEATHER[3] : LEATHER[1]); // grip
    p.px(x + Math.floor(w / 2), top + len + 6, BRASS[3]); // pommel
  } else {
    // a long haft with a head on top
    rod(p, x, top + 6, x, top + len, WOOD, 4);
    if (kind === "spear") {
      for (let y = top; y < top + 7; y++) { const h = y - top < 4 ? Math.floor((y - top) / 2) : 1; for (let i = -h; i <= h; i++) p.px(x + i, y, step(IRON, 5 - i - (Math.abs(y - glintY) < 2 ? -1.4 : 0), x + i, y)); }
      p.px(x - 1, top + 7, CLOTH[3]); p.px(x - 1, top + 8, CLOTH[2]); // a red tassel
    } else if (kind === "axe") {
      for (let y = top + 2; y < top + 10; y++) { const h = 1 + Math.round(Math.sin(((y - top - 2) / 8) * Math.PI) * 4); for (let i = 1; i <= h; i++) p.px(x + i, y, step(IRON, 4.6 - i * 0.4 + (i === h ? 1 : 0) + (Math.abs(y - glintY) < 2 ? 1 : 0), x + i, y)); }
      p.px(x - 1, top + 5, IRON[3]); p.px(x - 1, top + 6, IRON[2]);
    } else if (kind === "mace") {
      disc(p, x + 0.5, top + 4, 3, 3.5, (px, py, dx, dy) => step(IRON, 4 - dx * 1.6 - dy, px, py));
      for (const [ex, ey] of [[-4, 4], [5, 4], [0, -0], [1, 8]]) p.px(x + ex, top + ey, IRON[4]);
    } else {
      for (let y = top + 3; y < top + 8; y++) for (let i = -3; i <= 4; i++) p.px(x + i, y, step(IRON, 4.2 - i * 0.4 - (y - top - 3) * 0.3, x + i, y));
      p.px(x + 5, top + 4, IRON[4]); p.px(x + 5, top + 5, IRON[3]);
    }
  }
}

function rack(p: Pen, f: number) {
  const ph = (f / N) * Math.PI * 2;
  shadow(p, RACK_W / 2 + 6, RACK_BY - 1, 34, 6);
  // two posts with a top beam and a slotted lower rail, skewed along the iso diagonal
  const L = 18, R = 74, sk = 0.5; // rail runs down-right
  const ry = (x: number) => RACK_BY - 4 + (x - L) * sk * 0.25;
  const post = (x: number) => { const y0 = ry(x); for (let y = y0 - 52; y <= y0 + 2; y++) { p.px(x - 1, y, WOOD[4]); p.px(x, y, WOOD[3]); p.px(x + 1, y, WOOD[1]); } p.px(x, y0 - 53, WOOD[4]); };
  // the weapons on the rack, each hung by a peg on the top beam with its foot in the lower rail
  const items: [number, number, number, number, "sword" | "spear" | "axe" | "mace" | "hammer"][] = [
    [25, 26, 34, 3, "sword"], [32, 10, 52, 1, "spear"], [39, 20, 40, 1, "axe"], [46, 24, 34, 3, "sword"], [53, 21, 38, 1, "mace"], [60, 16, 44, 1, "hammer"], [66, 28, 30, 2, "sword"],
  ];
  post(L);
  // back beam
  for (let x = L; x <= R; x++) { const y = ry(x) - 44; p.px(x, y, WOOD[4]); p.px(x, y + 1, WOOD[3]); p.px(x, y + 2, WOOD[1]); if (x % 9 === 3) p.px(x, y + 1, IRON[4]); }
  items.forEach(([x, top, len, w, kind], i) => {
    const glint = top + ((f / N + i * 0.37) % 1) * (len + 12) - 6;
    blade(p, x, Math.round(ry(x) - 56 + top), len, w, Math.round(ry(x) - 56 + glint), kind);
  });
  // lower rail in front of the feet
  for (let x = L; x <= R; x++) { const y = ry(x) - 6; for (let t = 0; t < 4; t++) p.px(x, y + t, t === 0 ? WOOD[5] : step(WOOD, 3.2 - t * 0.6 + (x % 7 === 0 ? -1 : 0), x, y + t)); }
  post(R);
  // a round shield on the post, red with an iron boss, and a battered kite shield leaning at the end
  disc(p, R + 1, ry(R) - 32, 8.5, 9, (x, y, dx, dy) => {
    const r = Math.hypot(dx, dy);
    if (r > 0.84) return step(IRON, 3.6 - dx - dy, x, y);
    if (r < 0.28) return step(IRON, 4.8 - dx * 1.6 - dy * 1.6, x, y);
    const quarter = (dx > 0) !== (dy > 0);
    return step(quarter ? CLOTH : WOOD, 3 - dx * 1.2 - dy * 0.8 + (hash(x, y, 6) < 0.08 ? -1.2 : 0), x, y);
  });
  // kite shield leaning against the left post: flat top, tapering to a point, blue field with a brass stripe
  for (let y = 0; y < 22; y++) {
    const half = y < 8 ? 6.5 - (y === 0 ? 1 : 0) : Math.max(0.5, 6.5 * (1 - (y - 8) / 14) ** 0.8), cx = L - 7 + y * 0.12, yy = ry(L) - 22 + y;
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const d = Math.abs(x - cx), edge = d > half - 1.1 || y === 0;
      const BLUE = [0x0e121e, 0x18203a, 0x243058, 0x34446e, 0x4a5c86];
      p.px(x, yy, edge ? step(IRON, 3.6 - (x - cx) * 0.3, x, yy) : d < 1 ? step(BRASS, 3 - y * 0.06, x, yy) : step(BLUE, 3 - (x - cx) * 0.3 - y * 0.05 + (hash(x, yy, 4) < 0.1 ? -1.2 : 0), x, yy));
    }
  }
  // a tattered cloth tied to the post top, lifting in the wind
  for (let i = 0; i < 12; i++) {
    const k = i / 12, dy = Math.round(Math.sin(ph + i * 0.6) * (0.4 + k * 1.6));
    const hgt = Math.max(1, Math.round(5 - k * 3 - (i === 11 ? 1 : 0)));
    for (let j = 0; j < hgt; j++) p.px(R + 2 + i, ry(R) - 52 + j + dy, j === hgt - 1 ? CLOTH[1] : Math.sin(ph + i * 0.6 + 1) > 0.3 ? CLOTH[4] : CLOTH[2]);
  }
}

// ---- grindstone ---------------------------------------------------------------------------------------------
export const GRIND_W = 52, GRIND_H = 50, GRIND_BY = 44;

function grind(p: Pen, f: number) {
  const ph = (f / N) * Math.PI * 2, CX = 24, CY = 22, RX = 5.5, RY = 11;
  shadow(p, CX + 5, GRIND_BY - 1, 20, 5);
  // water trough under the wheel
  box(p, CX - 4, GRIND_BY - 12, 20, 9, 6, 0, (face, a, b, x, y) => {
    if (face === "top") return a > 1.5 && a < 18.5 && b > 1.5 && b < 7.5 ? step(WATER, 1.8 + (Math.abs(a - 10 - Math.sin(ph) * 3) < 1 ? 1.2 : 0) - b * 0.1, x, y) : step(WOOD, 4.2, x, y);
    return step(WOOD, (face === "left" ? 3 : 2) + (Math.floor(b / 3) % 2 ? -0.4 : 0) + (hash(a | 0, b | 0, 7) - 0.5) * 0.6, x, y);
  });
  // back leg of the frame
  rod(p, CX + 6, CY - 2, CX + 14, GRIND_BY - 2, WOOD, 2);
  // the wheel, seen at a slant: a sandstone disc with its rim; chips and the dressing mark turn with it
  const RIMW = 4, SAND = [0x2a241e, 0x40372c, 0x5a4e3e, 0x766850, 0x948466, 0xb0a080];
  for (let r0 = RIMW; r0 >= 1; r0--) disc(p, CX + r0, CY + r0 * 0.5, RX, RY, (x, y, dx, dy) => {
    if (dx < 0.2 && r0 < RIMW) return undefined;
    const notch = (Math.round(Math.atan2(dy, dx) * 5 + ph * 3) % 4) === 0;
    return step(SAND, 2.4 - dy * 0.9 + (notch ? -0.9 : 0) + (r0 === RIMW ? -0.5 : 0), x, y);
  });
  disc(p, CX, CY, RX, RY, (x, y, dx, dy) => {
    const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) - ph;
    if (r > 0.88) return step(SAND, 4.4 - dy, x, y); // worn bright edge
    if (r < 0.18) return IRON[1]; // axle hole
    if (r < 0.3) return step(IRON, 3.8 - dx - dy, x, y);
    let v = 3.2 - dx * 0.8 - dy * 0.9;
    if (Math.abs(r - 0.62) < 0.06) v -= 0.8; // a worn ring
    if (Math.abs(Math.sin(a * 2)) < 0.12 && r > 0.35) v -= 1.1; // chalk marks turning with it
    if (hash(Math.round(Math.cos(a) * r * 5), Math.round(Math.sin(a) * r * 5), 3) < 0.15) v -= 0.6;
    return step(SAND, v, x, y);
  });
  // drips off the wheel's bottom into the trough
  const dk = (f % 4) / 4;
  p.px(CX + 2, CY + RY + 2 + Math.round(dk * 4), WATER[5], 0.8);
  // front leg, the axle bearing and the crank going round
  rod(p, CX - 6, CY - 2, CX - 12, GRIND_BY - 2, WOOD, 4);
  rod(p, CX - 4, CY + 2, CX - 13, GRIND_BY - 10, WOOD, 3); // brace
  p.px(CX - 1, CY, IRON[4]); p.px(CX - 2, CY, IRON[3]);
  const cx = CX - 4 + Math.cos(ph) * 4, cy = CY + Math.sin(ph) * 5;
  p.line(CX - 2, CY, cx, cy, IRON[3]);
  rod(p, cx - 1, cy, cx - 4, cy + 1, WOOD, 4); // handle
  // a blade resting on the trough to be sharpened next
  for (let i = 0; i < 12; i++) p.px(CX + 6 + i, GRIND_BY - 13 + Math.round(i * 0.5), IRON[i < 9 ? 5 : 3]);
  p.px(CX + 5, GRIND_BY - 14, BRASS[3]); p.px(CX + 5, GRIND_BY - 13, BRASS[2]);
}

// ---- tool bench and coal heap ---------------------------------------------------------------------------------
export const BENCH_W = 84, BENCH_H = 70, BENCH_BY = 62;

function bench(p: Pen, f: number) {
  const ph = (f / N) * Math.PI * 2;
  shadow(p, 46, BENCH_BY - 2, 38, 8);
  const ox = 30, oy = BENCH_BY - 24;
  // tool board standing behind the bench, tools hung on pegs
  box(p, ox, oy, 40, 3, 40, 0, (face, a, b, x, y) => {
    if (face === "top") return step(WOOD, 4.4, x, y);
    const plank = Math.floor(a / 6);
    let v = (face === "left" ? 2.0 : 1.3) + (hash(plank, 1, 12) - 0.5) * 0.8 - (a % 6 < 0.8 ? 1 : 0) - Math.max(0, (b - 30) / 10) * 0.5;
    if (hash(a | 0, b | 0, 13) < 0.05) v -= 0.8;
    return step(WOOD, v, x, y);
  });
  const hang = (u: number, z: number): [number, number] => [ox + u - 3, oy + (u + 3) / 2 - z];
  // hammers, tongs, a file, horseshoes (one swinging on its nail)
  {
    let [x, y] = hang(5, 33); rod(p, x, y, x, y + 14, WOOD, 4); for (let i = -2; i <= 2; i++) { p.px(x + i, y - 1, IRON[4 - (i > 0 ? 1 : 0)]); p.px(x + i, y, IRON[3]); }
    [x, y] = hang(11, 34); rod(p, x, y, x - 2, y + 15, IRON, 3); rod(p, x + 1, y, x + 3, y + 15, IRON, 4); p.px(x, y + 4, BRASS[3]);
    [x, y] = hang(17, 33); rod(p, x, y, x, y + 13, WOOD, 4); for (let j = 0; j < 4; j++) for (let i = -1; i <= 2; i++) p.px(x + i, y - 2 + j, step(IRON, 4 - i * 0.6, x + i, y + j));
    [x, y] = hang(23, 34); for (let j = 0; j < 12; j++) p.px(x, y + j, j < 3 ? WOOD[3] : (j % 2 ? IRON[3] : IRON[4]));
    for (let k = 0; k < 2; k++) {
      [x, y] = hang(29 + k * 6, 31);
      p.px(x, y - 2, IRON[5]);
      const sw = k === 1 ? Math.round(Math.sin(ph) * 1.4) : 0;
      for (let a = 0; a < 14; a++) { const t = (a / 13) * Math.PI * 1.25 - Math.PI * 0.12; p.px(x + sw * (1 - Math.sin(t)) + Math.cos(t) * 2.5, y + Math.sin(t) * 3.2 + 1, step(IRON, 4 - Math.cos(t) * 1.4, x, y)); }
    }
  }
  // the bench in front of the board
  const bx = ox + 4, by = oy + 4;
  box(p, bx, by, 38, 12, 3, 12, (face, a, b, x, y) => face === "top" ? step(WOOD, 4.2 - (Math.floor(b / 4) % 2) * 0.5 + (hash(a | 0, b | 0, 3) < 0.06 ? -1.2 : 0), x, y) : step(WOOD, face === "left" ? 2.6 : 1.6, x, y));
  for (const [u, v] of [[1, 11], [37, 11], [37, 1]]) {
    const [x, y] = [bx + u - v, by + (u + v) / 2];
    rod(p, x, y - 12, x, y, WOOD, u === 37 && v === 1 ? 2 : 3);
  }
  const onTop = (u: number, v: number): [number, number] => [bx + u - v, by + (u + v) / 2 - 15];
  // things on the bench: an ingot stack, a horseshoe being shaped, a stone mug
  for (let k = 0; k < 3; k++) { const [x, y] = onTop(8 + k * 1.5, 7 - k * 0.5); for (let i = 0; i < 6; i++) { p.px(x + i, y - k * 2, IRON[5 - (i > 3 ? 1 : 0)]); p.px(x + i, y - k * 2 + 1, IRON[3]); } }
  { const [x, y] = onTop(22, 6); for (let a = 0; a < 12; a++) { const t = (a / 11) * Math.PI * 1.2 - Math.PI * 0.1; p.px(x + Math.cos(t) * 3, y - Math.sin(t) * 1.6, step(HOT, 2.6 + Math.sin(ph) * 0.5, x, y)); } }
  { const [x, y] = onTop(31, 5); for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) p.px(x + i, y - j, step(GRIT, 3.4 - i * 0.8, x + i, y - j)); p.px(x + 3, y - 2, GRIT[2]); }
  // iron bar stock leaning at the end
  for (let k = 0; k < 3; k++) rod(p, ox + 45 + k * 3, BENCH_BY - 7 + k, ox + 42 + k * 4, oy - 14 + k * 2, IRON, 4 - (k % 2));
  // a little shingle roof over the tool board, keeping the rain off
  for (let u = -2; u <= 42; u++) for (let j = 0; j < 6; j++) {
    const x = ox + u - 3 - j * 0.8, y = oy + (u + 3) / 2 - 41 - 3 + j * 1.1;
    const sh = Math.floor((u + (j % 2) * 2) / 4);
    p.px(x, y, step(WOOD, (j === 0 ? 3.4 : 2.4 - j * 0.15) + (hash(sh, j, 31) - 0.5) * 0.8 - ((u + (j % 2) * 2) % 4 === 0 ? 1 : 0), x, y));
  }
  // coal heap in front: lumps piled up, a few catching the light
  for (let i = 0; i < 46; i++) {
    const a = hash(i, 1, 50), r = Math.sqrt(hash(i, 2, 50));
    const lx = 16 + (a - 0.5) * 26 * r * 1.1, ly0 = BENCH_BY - 4 + (hash(i, 3, 50) - 0.5) * 6;
    const lift = (1 - Math.abs(lx - 16) / 15) * 9 * (1 - (i / 46) * 0.2);
    const ly = ly0 - Math.max(0, lift) * (i / 46);
    const lr = 1.6 + hash(i, 4, 50) * 1.6;
    disc(p, lx, ly, lr * 1.2, lr, (x, y, dx, dy) => (dx < -0.2 && dy < -0.2 && hash(i, 5, 50) < 0.4 ? IRON[4] : step(SOOT.concat(IRON[2]), 2.4 - dx * 1.3 - dy * 1.3, x, y)));
  }
  // a shovel stuck in the heap
  rod(p, 20, BENCH_BY - 12, 28, BENCH_BY - 34, WOOD, 4);
  for (let j = 0; j < 5; j++) for (let i = -2; i <= 2; i++) p.px(18 + i + j * 0.3, BENCH_BY - 12 + j, step(IRON, 3.8 - i * 0.5, 18 + i, BENCH_BY - 12 + j));
}

/** Paints the smithy textures and their idle animations. */
export function smithyTextures(scene: Phaser.Scene) {
  sheet(scene, "sm_forge", FORGE_W, FORGE_H, N, forge, 0);
  sheet(scene, "sm_anvil", ANVIL_W, ANVIL_H, N, anvil, 0);
  sheet(scene, "sm_quench", QUENCH_W, QUENCH_H, N, quench, 0);
  sheet(scene, "sm_rack", RACK_W, RACK_H, N, rack, 0);
  sheet(scene, "sm_grind", GRIND_W, GRIND_H, N, grind, 0);
  sheet(scene, "sm_bench", BENCH_W, BENCH_H, N, bench, 0);
  for (const [k, fps] of [["sm_forge", 8], ["sm_anvil", 4], ["sm_quench", 6], ["sm_rack", 6], ["sm_grind", 8], ["sm_bench", 5]] as const) {
    if (!scene.anims.exists(`${k}_idle`)) scene.anims.create({ key: `${k}_idle`, frames: scene.anims.generateFrameNumbers(k, { start: 0, end: N - 1 }), frameRate: fps, repeat: -1 });
  }
}

const FORGE_BASE = P(FW / 2, FD / 2, 0);
/** Origin (x, y fractions) of each smithy texture: the spot that stands on the decor's tile position. */
export const SMITHY_ORIGIN: Record<string, [number, number]> = {
  sm_forge: [FORGE_BASE[0] / FORGE_W, FORGE_BASE[1] / FORGE_H],
  sm_anvil: [27 / ANVIL_DW, (ANVIL_BY - 2) / ANVIL_DH],
  sm_quench: [19 / QUENCH_DW, (QUENCH_BY - 2) / QUENCH_DH],
  sm_rack: [46 / RACK_W, (RACK_BY - 2) / RACK_H],
  sm_grind: [24 / GRIND_W, (GRIND_BY - 2) / GRIND_H],
  sm_bench: [46 / BENCH_W, (BENCH_BY - 4) / BENCH_H],
};
/** Where the forge's fire sits above its base, in world px (night glow, chimney smoke). */
const toWorld = (pt: [number, number]): [number, number] => [(pt[0] - FORGE_BASE[0]) / TX, (FORGE_BASE[1] - pt[1]) / TX];
export const FORGE_FIRE = toWorld(P((PIT.u0 + PIT.u1) / 2, (PIT.v0 + PIT.v1) / 2, FH));
export const FORGE_FLUE = toWorld(P(20, 6.5, FH + 12 + 44));
