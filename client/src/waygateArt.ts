import { dith as dith1, hash, OUT, stoneCol, vnoise, type Px } from "./shrineArt";

/**
 * Hand-built pixel art for Oakvale's waygate (Murat 2026-11-08: "dark stone like the portals, vines grown all over it
 * and hanging from the arch, some sand escaping round it; once active, sand pixels floating out"). Same recipe as the
 * portal stones (portalArt.ts): real iso solids painted one colour per cell, three-tone stone lit from the top left,
 * ordered dithering, then coarsened 2x2 with a dark outline (chunky()) so it sits with the rest of the decor.
 * Two carved pillars on a stepped plinth carry a heavy lintel with a sun disc; ivy has climbed the pillars and spills
 * off the lintel in hanging strands; desert sand has blown through the arch and drifted round its feet. Awake, a veil of
 * hot desert light fills the arch and grains of sand float out of it.
 */
const dith = (x: number, y: number) => dith1(x >> 1, y >> 1);
export const WG_W = 120, WG_H = 132, WG_OX = 60, WG_OY = 108; // texture size and the gate's foot, in game px
const W = WG_W * 2, H = WG_H * 2, CX = WG_OX * 2, BY = WG_OY * 2; // cells

/** Screen cell of a world point (a along world x, b along world y, z up), relative to the feet. */
const scr = (a: number, b: number, z: number) => ({ x: CX + a - b, y: BY + (a + b) / 2 - z });

const ZS1 = 7, ZS2 = 13; // the two steps' tops
const PA = 42, PR = 10, ZPT = 150; // pillar centre (world x), half width, top
const ZL = 178; // lintel top
const GAP = PA - PR; // half width of the opening

const LEAF = ["#1c2a12", "#2c4219", "#3d5822", "#5c7a30", "#7c9a3e"];
const SAND = ["#6e5232", "#8e6c40", "#b08a52", "#cfa96a", "#e6c88e", "#f4e0b0"];
const HOT = ["#4a2a12", "#7a4a1e", "#b0702a", "#e09a3e", "#ffc35e", "#ffe49a", "#fff6d8"];

type Face = "top" | "left" | "right";
type Col = (face: Face, s: number, t: number, x: number, y: number, lit: number) => string | undefined;

/** An iso box centred on (ca, cb) at height z0, half extents A (x) and B (y), height h. */
function box(px: Px, ca: number, cb: number, z0: number, A: number, B: number, h: number, tone: number, seed: number, col?: Col) {
  const o = scr(ca, cb, 0), ox = o.x, oy = o.y;
  const top = oy - z0 - h;
  for (let y = Math.floor(top - (A + B) / 2 - 1); y <= Math.ceil(oy - z0 + (A + B) / 2 + 1); y++) {
    for (let x = Math.floor(ox - A - B - 1); x <= Math.ceil(ox + A + B + 1); x++) {
      const qx = x + 0.5 - ox, qy = y + 0.5 - oy;
      const ty = qy + z0 + h;
      const a = (qx + 2 * ty) / 2, b = (2 * ty - qx) / 2;
      let face: Face | undefined, s = 0, t = 0, edge = false, ea = 9;
      if (Math.abs(a) <= A && Math.abs(b) <= B) {
        face = "top"; s = (a + A) / (2 * A); t = (b + B) / (2 * B);
        ea = Math.min(A - Math.abs(a), B - Math.abs(b)); edge = ea < 0.9;
      } else {
        const al = qx + B, zl = (al + B) / 2 - qy;
        if (Math.abs(al) <= A && zl >= z0 && zl <= z0 + h) {
          face = "left"; s = (al + A) / (2 * A); t = (zl - z0) / h;
          ea = Math.min(A - Math.abs(al), z0 + h - zl); edge = A - Math.abs(al) < 0.8 || zl - z0 < 0.9 || z0 + h - zl < 0.6;
        } else {
          const br = A - qx, zr = (A + br) / 2 - qy;
          if (Math.abs(br) <= B && zr >= z0 && zr <= z0 + h) {
            face = "right"; s = (br + B) / (2 * B); t = (zr - z0) / h;
            ea = Math.min(B - Math.abs(br), z0 + h - zr); edge = B - Math.abs(br) < 0.8 || zr - z0 < 0.9 || z0 + h - zr < 0.6;
          }
        }
      }
      if (!face) continue;
      const chip = vnoise(x * 0.22, y * 0.22, 999, seed + 7);
      if (ea < 3.2 && chip > 0.66) { // chipped, crumbled edges
        if (ea < 1.6 && chip > 0.72) continue;
        px(x, y, dith(x, y) < 0.5 ? "#24211d" : "#33302b");
        continue;
      }
      if (edge) { px(x, y, OUT); continue; }
      const n = (vnoise(x * 0.3, y * 0.3, 999, seed) - 0.5) * 0.5 + (dith(x, y) - 0.5) * 0.45;
      const lit = (face === "top" ? 0.62 : face === "left" ? 0.05 : -0.55) + n;
      px(x, y, col?.(face, s, t, x, y, lit) ?? stoneCol(lit, tone));
    }
  }
}

/** Ivy over a stone face: dense where `amount` is high, leaves lit by the face's light. */
function ivy(x: number, y: number, lit: number, amount: number, seed: number): string | undefined {
  const n = vnoise(x * 0.16, y * 0.13, 999, seed) * 0.7 + vnoise(x * 0.5, y * 0.5, 999, seed + 1) * 0.3;
  if (n + amount < 0.95) return undefined;
  const leaf = vnoise(x * 0.7, y * 0.7, 999, seed + 2);
  if (leaf < 0.28) return LEAF[0]; // dark gaps between the leaves
  const l = lit + (leaf - 0.5) * 0.9 + (dith(x, y) - 0.5) * 0.4;
  return l > 0.7 ? LEAF[4] : l > 0.25 ? LEAF[3] : l > -0.25 ? LEAF[2] : LEAF[1];
}

/** Sand blown onto a top face: drifts that thin out away from the arch's mouth. */
function sandOn(x: number, y: number, lit: number, amount: number, seed: number): string | undefined {
  const n = vnoise(x * 0.12, y * 0.2, 999, seed);
  if (n + amount < 0.9) return undefined;
  const l = lit - 0.3 + (vnoise(x * 0.4, y * 0.9, 999, seed + 3) - 0.5) * 0.6 + (dith(x, y) - 0.5) * 0.4;
  return SAND[Math.max(1, Math.min(5, Math.round(2.6 + l * 2.2)))];
}

function paint(f: number, N: number, awake: boolean): HTMLCanvasElement {
  // two layers: the ground (shadow, sand fan, tufts) gets no outline; the stone and the ivy do
  const layer = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c.getContext("2d")!; };
  const go = layer(), o = layer();
  const gpx: Px = (x, y, c) => { go.fillStyle = c; go.fillRect(x, y, 1, 1); };
  const px: Px = (x, y, c) => { o.fillStyle = c; o.fillRect(x, y, 1, 1); };
  const ph = (f / N) * Math.PI * 2, pulse = 0.5 + 0.5 * Math.sin(ph);
  /** The veil's light on the ground and the steps, strongest just in front of the opening. */
  const glowAt = (x: number, y: number) => {
    if (!awake) return 0;
    const c = scr(0, 14, ZS2);
    return Math.max(0, 1 - Math.hypot((x - c.x) / 54, (y - c.y) / 26));
  };

  // soft shadow on the grass
  for (let y = BY - 40; y <= BY + 44; y++) for (let x = 0; x < W; x++) {
    const ex = (x - CX - 4) / 84, ey = (y - BY - 4) / 40, d = ex * ex + ey * ey;
    if (d < 1 && dith(x, y) < (1 - d) * 0.55) gpx(x, y, "rgba(10,8,6,0.45)");
  }

  // sand that has blown through the arch and spilled onto the grass, fanning out in front (world +y) in ripples
  for (let y = BY - 50; y < H; y++) for (let x = 0; x < W; x++) {
    const qx = x + 0.5 - CX, qy = y + 0.5 - BY;
    const a = (qx + 2 * qy) / 2, b = (2 * qy - qx) / 2; // ground point
    const ea = (a - 6) / 80, eb = (b - 12) / 42, d = ea * ea + eb * eb;
    const edge = 1 - d + (vnoise(x * 0.08, y * 0.12, 999, 401) - 0.5) * 0.9;
    if (edge < 0) continue;
    if (edge < 0.18 && dith(x, y) > edge * 4.5) continue; // the thin edge scatters into the grass
    const ripple = Math.sin((b * 0.55 + a * 0.12) + vnoise(a * 0.05, b * 0.05, 999, 402) * 5);
    let l = (ripple > 0.55 ? 0.45 : ripple < -0.7 ? -0.5 : 0) + (dith(x, y) - 0.5) * 0.5 + (edge > 0.5 ? 0.2 : 0);
    if (hash(x, y, 403) < 0.02) l -= 0.8; // a dark grain, a pebble
    let c = SAND[Math.max(0, Math.min(5, Math.round(2.4 + l * 2)))];
    const gl = glowAt(x, y);
    if (gl > 0 && dith(x, y) < gl * (0.5 + 0.25 * pulse)) c = l > 0 ? HOT[5] : HOT[4];
    gpx(x, y, c);
  }
  // tufts of grass poking through the thin sand
  for (let k = 0; k < 18; k++) {
    const a = (hash(k, 1, 404) - 0.5) * 140, b = 10 + hash(k, 2, 404) * 46;
    const p = scr(a, b, 0);
    for (let i = 0; i < 4; i++) { const h = 2 + ((k + i) % 3); for (let j = 0; j < h; j++) gpx(Math.round(p.x + i - 2 + (j > 1 ? (i - 2) * 0.5 : 0)), Math.round(p.y - j), j === h - 1 ? LEAF[3] : LEAF[2]); }
  }

  // the stepped plinth, sand drifted against and over it, ivy creeping up from the grass
  const step = (seed: number, A: number, B: number): Col => (fc, s, t, x, y, l) => {
    if (fc === "top") {
      const u = s * A / 10 + (Math.floor(t * B / 10) % 2) * 0.5, iu = Math.floor(u), fu = u - iu;
      const sand = sandOn(x, y, l, 0.15 + Math.max(0, t - 0.4) * 0.9 - Math.abs(s - 0.5) * 0.5, seed + 1);
      if (sand) { const gl = glowAt(x, y); return gl > 0 && dith(x, y) < gl * 0.6 ? HOT[4] : sand; }
      if (fu < 0.08) return "#1a1714";
      if (hash(iu, 1, seed) < 0.2 && vnoise(x * 0.3, y * 0.3, 999, seed + 2) > 0.5) return dith(x, y) < 0.5 ? LEAF[2] : LEAF[1];
      const gl = glowAt(x, y);
      if (gl > 0 && dith(x, y) < gl * (0.5 + 0.2 * pulse)) return l > 0.6 ? "#c88a52" : "#9a5a30";
      return stoneCol(l + (hash(iu, 2, seed) - 0.5) * 0.4, 0.74 + hash(iu, 3, seed) * 0.12);
    }
    const span = fc === "left" ? A : B, k = s * span / 7, fk = k - Math.floor(k);
    if (fk < 0.1) return "#1a1714";
    if (fc === "left" && t < 0.7) { const sd = sandOn(x, y, l + 0.3, 0.25 - Math.abs(s - 0.5) * 0.6, seed + 4); if (sd) return sd; } // sand banked against the front
    return ivy(x, y, l, 0.32 - t * 0.3, seed + 5);
  };
  box(px, 0, 0, 0, 62, 24, ZS1, 0.72, 501, step(510, 62, 24));
  box(px, 0, 0, ZS1, 55, 17, ZS2 - ZS1, 0.76, 502, step(520, 55, 17));

  // a pillar: a footing, stacked drums with a carved band, a capital; ivy climbing it, thickest low and on the
  // side away from the opening
  const pillar = (ca: number, seed: number) => {
    const far = ca < 0;
    box(px, ca, 0, ZS2, PR + 3, PR + 3, 9, 0.74, seed, (fc, s, t, x, y, l) => fc === "top" ? undefined : ivy(x, y, l, 0.4, seed + 1));
    box(px, ca, 0, ZS2 + 9, PR, PR, ZPT - ZS2 - 19, 0.8, seed + 2, (fc, s, t, x, y, l) => {
      if (fc === "top") return undefined;
      const z = ZS2 + 9 + t * (ZPT - ZS2 - 19);
      const out = (fc === "left" ? (far ? 1 - s : s) : s); // 1 = the side facing away from the opening
      const v = ivy(x, y, l, 0.5 - (z - ZS2) / 130 + out * 0.28 + (far ? 0.08 : 0), seed + 3);
      if (v) return v;
      if ((z - ZS2 - 9) % 17 < 1.2) return "#1a1714"; // joints between the drums
      if (Math.abs(z - 104) < 4) { // a carved band of sun rays
        const k = s * 6, fk = k - Math.floor(k);
        if (Math.abs(z - 104) > 2.6 || (fk > 0.35 && fk < 0.65)) return awake && dith(x, y) < 0.3 + 0.3 * pulse ? HOT[3] : "#1f1c19";
      }
      if (fc === "left" && Math.abs(s - 0.3 - Math.sin(z * 0.2) * 0.04) < 0.035 && z > 70 && z < 128) return OUT; // a crack
      if (hash(x, y, seed + 4) < 0.025) return "#9a9878"; // lichen
      if (hash(Math.floor(x / 2), 0, seed + 5) < 0.25 && vnoise(x * 0.6, y * 0.05, 999, seed + 6) > 0.55) return stoneCol(l - 0.45, 0.76); // rain streaks
      return undefined;
    });
    box(px, ca, 0, ZPT - 10, PR + 3, PR + 3, 10, 0.82, seed + 7, (fc, s, t, x, y, l) => fc === "top" ? undefined : ivy(x, y, l, 0.3 + (far ? 0.2 : 0), seed + 8));
  };

  // the veil of desert light between the pillars, or nothing but the grass beyond while it sleeps
  const veil = () => {
    for (let a = -GAP; a <= GAP; a += 0.5) for (let z = ZS2; z <= ZPT; z += 0.5) {
      const p = scr(a, 0, z), x = Math.round(p.x), y = Math.round(p.y);
      const u = a / GAP, w = (z - ZS2) / (ZPT - ZS2);
      // the heat-shimmer: everything seen through the gate wavers a little, frame by frame
      const sh = Math.sin(w * 18 - ph * 2) * 0.03 + (vnoise(u * 3, w * 6 - f / N * 2, 999, 603) - 0.5) * 0.04;
      const uu = u + sh;
      // beyond it, the Sunscar: a white-hot sky with the sun low over the dunes, dunes in bands to the horizon
      const sun = Math.hypot((uu - 0.25) * 1.2, (w - 0.42) * 1.6);
      const d1 = 0.3 + Math.sin(uu * 3.1 + 1.2) * 0.06 + Math.sin(uu * 7 + 0.3) * 0.02; // far dunes
      const d2 = 0.2 + Math.sin(uu * 2.2 - 0.6) * 0.07; // near dunes
      let c: string;
      if (w < d2) { // near dune: lit crest, shaded hollow, ripples
        const sl = Math.cos(uu * 2.2 - 0.6) * 0.5 + Math.sin(uu * 30 + w * 50) * 0.15 + (dith(x, y) - 0.5) * 0.4;
        c = sl > 0.25 ? SAND[5] : sl > -0.2 ? SAND[4] : SAND[3];
      } else if (w < d1) c = (dith(x, y) < 0.5 ? SAND[3] : HOT[3]); // far dunes in the haze
      else if (sun < 0.13) c = HOT[6];
      else {
        const v = 0.95 - (w - 0.3) * 0.55 - Math.min(sun, 0.6) * 0.5 + (dith(x, y) - 0.5) * 0.12 + (vnoise(uu * 2, w * 3, 999, 604) - 0.5) * 0.12;
        c = HOT[Math.max(2, Math.min(6, Math.round(v * 6)))];
      }
      // the veil's own light: a bright, rippling rim round the opening and drifting streaks of blown sand
      const edge = Math.min(GAP - Math.abs(a), z - ZS2, ZPT - z);
      const streak = Math.sin(u * 4 + w * 22 - ph * 3 + vnoise(u * 2, w * 2, 999, 605) * 4);
      if (edge < 2.2 + pulse * 1.2) c = HOT[5];
      else if (edge < 5 && dith(x, y) < 0.5) c = HOT[4];
      else if (streak > 0.86 && dith(x, y) < 0.6) c = SAND[5];
      px(x, y, c);
    }
  };


  pillar(-PA, 530);
  if (awake) veil();
  pillar(PA, 540);

  // the lintel, its sun disc dark (or burning once the gate wakes), its left end broken off and ivy over it all
  const disc = scr(0, 12, (ZPT + ZL) / 2);
  box(px, 0, 0, ZPT, 60, 12, ZL - ZPT, 0.82, 550, (fc, s, t, x, y, l) => {
    const v = ivy(x, y, l, (fc === "top" ? 0.38 : 0.22) + Math.max(0, 0.35 - s) * 0.9 + Math.max(0, s - 0.8) * 0.8, 551);
    if (fc === "left") {
      const dx = (x - disc.x) / 1, dy = (y - disc.y) * 1.25, r = Math.hypot(dx, dy);
      if (r < 8) return awake ? (r < 4.5 ? HOT[6] : dith(x, y) < 0.5 + 0.3 * pulse ? HOT[5] : HOT[4]) : r < 4.5 ? "#1f1c19" : r > 6.6 ? OUT : "#a8a494";
      const ang = Math.atan2(dy, dx), ray = Math.abs(((ang / (Math.PI * 2)) * 12 + 12.5) % 1 - 0.5);
      if (r < 13 && ray < 0.12) return awake ? HOT[4] : "#1f1c19";
      if (v) return v;
      if (Math.abs(t - 0.5) < 0.06 && (s < 0.38 || s > 0.62)) return "#1f1c19"; // a carved line along its face
    }
    if (v) return v;
    if (hash(x, y, 552) < 0.025) return "#9a9878";
    return undefined;
  });

  // leafy clumps bulging over the lintel's edges and the capitals, so the ivy breaks the stone's outline
  const clump = (cx: number, cy: number, r: number, seed: number) => {
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
      const dx = (x - cx) / (r + 1), dy = (y - cy) / r, d = Math.hypot(dx, dy) + (vnoise(x * 0.6, y * 0.6, 999, seed) - 0.5) * 0.7;
      if (d > 1) continue;
      const leaf = vnoise(x * 0.8, y * 0.8, 999, seed + 1), l = -dx * 0.5 - dy * 0.8 + (leaf - 0.5) * 1.1 + (dith(x, y) - 0.5) * 0.35;
      px(x, y, leaf < 0.22 ? LEAF[0] : l > 0.55 ? LEAF[4] : l > 0.1 ? LEAF[3] : l > -0.35 ? LEAF[2] : LEAF[1]);
    }
  };
  for (let k = 0; k < 11; k++) {
    const a = -60 + hash(k, 1, 570) * 120, onTop = hash(k, 2, 570) < 0.5;
    if (!onTop && Math.abs(a + 6) < 20) continue; // keep the sun disc in the middle of the face clear
    const p = scr(a, onTop ? hash(k, 3, 570) * 20 - 10 : 12.5, onTop ? ZL : ZPT + 2 + hash(k, 3, 570) * 8);
    clump(p.x, p.y, 3 + hash(k, 5, 570) * 3.5, 571 + k);
  }
  for (const ca of [-PA, PA]) { const p = scr(ca, PR + 3, ZPT); clump(p.x - 3, p.y + 1, 4, 590 + ca); }
  for (const ca of [-PA, PA]) { const p = scr(ca + (ca < 0 ? -PR : PR), PR + 3, ZS2 + 6); clump(p.x, p.y, 5, 595 + ca); } // at the foot

  // ivy strands hanging from the lintel's front edge, some long enough to dangle into the opening
  const hang = [[-56, 30], [-47, 52], [-38, 22], [-27, 40], [-18, 14], [-9, 26], [3, 18], [14, 34], [25, 12], [34, 24], [49, 46], [57, 20]];
  for (const [a0, len] of hang) {
    const sw = Math.sin(ph + a0) * (awake ? 1.2 : 0.4); // a breath of wind (the desert air pours through once it's awake)
    let lastX = 0;
    for (let i = 0; i <= len; i++) {
      const p = scr(a0, 12.5, ZPT - i), wob = Math.sin(i * 0.3 + a0) * 1.2 + sw * (i / len) * 2;
      const x = Math.round(p.x + wob), y = Math.round(p.y);
      px(x, y, LEAF[1]); px(x + 1, y, LEAF[0]);
      if (i > 0 && Math.abs(x - lastX) > 1) px(x - Math.sign(x - lastX), y, LEAF[1]);
      lastX = x;
      if (i % 3 === 1 && i < len - 1) { // a leaf, alternating sides: a little heart of 2-4 cells with a lit edge
        const side = (i / 3) % 2 < 1 ? 1 : -1, big = i < len * 0.7;
        const lx = x + side * 2;
        px(x + side, y, LEAF[2]); px(lx, y, LEAF[3]); px(lx, y - 1, LEAF[4]); px(lx + side, y, LEAF[2]);
        if (big) { px(lx, y + 1, LEAF[2]); px(lx + side, y - 1, LEAF[3]); px(lx + side, y + 1, LEAF[1]); }
      }
    }
  }
  // a few runners climbing the pillars' fronts from the ground
  for (const [ca, s0] of [[-PA, -3], [-PA, 6], [PA, -5], [PA, 4]]) {
    for (let z = ZS2 + 4; z < ZS2 + 60 + hash(ca, s0, 560) * 50; z++) {
      const p = scr(ca + s0 + Math.sin(z * 0.15 + s0) * 2.5, PR + 0.5, z);
      const x = Math.round(p.x), y = Math.round(p.y);
      px(x, y, LEAF[1]);
      if (z % 5 === 0) { const sd = (z / 5) % 2 ? 1 : -1; px(x + sd, y, LEAF[3]); px(x + sd * 2, y - 1, LEAF[4]); px(x + sd, y - 1, LEAF[2]); }
    }
  }
  const out = chunky(go, false);
  const oc = out.getContext("2d")!;
  oc.drawImage(chunky(o, true), 0, 0);
  if (awake) sandMotes(oc, f, N);
  return out;
}

/**
 * Each 2x2 block of cells becomes one pixel of its most common colour (darker wins a tie), tones muted towards the
 * world's weathered greys, a dark outline one block thick (portalArt.ts does the same), then the floating sand on top.
 */
function chunky(o: CanvasRenderingContext2D, outline: boolean): HTMLCanvasElement {
  const CW = W / 2, CH = H / 2;
  const src = o.getImageData(0, 0, W, H).data;
  const res = document.createElement("canvas");
  res.width = CW; res.height = CH;
  const rc = res.getContext("2d")!, img = rc.createImageData(CW, CH), d = img.data;
  const solid = new Uint8Array(CW * CH);
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
    const votes = new Map<number, number>();
    let opaque = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const k = ((cy * 2 + j) * W + cx * 2 + i) * 4;
      if (src[k + 3] < 8) continue;
      opaque++;
      const key = (src[k] << 24 | src[k + 1] << 16 | src[k + 2] << 8 | src[k + 3]) >>> 0;
      votes.set(key, (votes.get(key) ?? 0) + 1);
    }
    let best = -1, bn = 0, bl = 1e9;
    for (const [key, n] of votes) {
      const l = (key >>> 24) + ((key >>> 16) & 255) + ((key >>> 8) & 255);
      if (n > bn || (n === bn && l < bl)) { best = key; bn = n; bl = l; }
    }
    if (best < 0 || opaque < 2) continue;
    let r = best >>> 24, g = (best >>> 16) & 255, b = (best >>> 8) & 255;
    const a = best & 255, q = (cy * CW + cx) * 4;
    const hot = r > g + 30 && r > 170;
    if (!hot) { const m = (r + g + b) / 3; r = (r * 0.72 + m * 0.28) * 0.88 + 5; g = (g * 0.72 + m * 0.28) * 0.86 + 4; b = (b * 0.72 + m * 0.28) * 0.82; }
    d[q] = r; d[q + 1] = g; d[q + 2] = b; d[q + 3] = a;
    solid[cy * CW + cx] = a > 200 ? 1 : 2;
  }
  const edge: number[] = [];
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
    if (solid[cy * CW + cx] !== 1) continue;
    if (!outline) continue;
    const open = (x: number, y: number) => x < 0 || y < 0 || x >= CW || y >= CH || solid[y * CW + x] !== 1;
    if (open(cx - 1, cy) || open(cx + 1, cy) || open(cx, cy - 1) || open(cx, cy + 1)) edge.push(cy * CW + cx);
  }
  for (const e of edge) { const q = e * 4; d[q] = 0x15; d[q + 1] = 0x11; d[q + 2] = 0x0e; d[q + 3] = 255; }
  rc.putImageData(img, 0, 0);
  return res;
}

/** Grains of sand floating out of the veil towards the viewer, rising, turning and settling (drawn after chunky()). */
function sandMotes(rc: CanvasRenderingContext2D, f: number, N: number) {
  {
    for (let k = 0; k < 46; k++) {
      const life = ((f / N) + hash(k, 1, 701)) % 1;
      const a0 = (hash(k, 2, 701) - 0.5) * 2 * (GAP - 4), z0 = ZS2 + 8 + hash(k, 3, 701) * (ZPT - ZS2 - 24);
      const drift = Math.sin(life * 6 + k) * 4;
      const b = life * (34 + hash(k, 4, 701) * 30); // out along world +y
      const z = z0 + (k % 3 === 0 ? life * 22 : -life * life * 26) ; // some lifted on the hot air, most sinking
      if (z < 2) continue;
      const p = scr(a0 * (1 + life * 0.5) + drift, b, z);
      const x = Math.round(p.x / 2), y = Math.round(p.y / 2);
      const c = life < 0.25 ? HOT[6] : life < 0.55 ? HOT[5] : life < 0.8 ? SAND[5] : SAND[4];
      rc.fillStyle = c; rc.fillRect(x, y, 1, 1);
      if (k % 5 === 0 && life < 0.6) { rc.fillStyle = SAND[5]; rc.fillRect(x + 1, y, 1, 1); }
    }
  }
}

/** Paints frame `f` of `N` of the Oakvale waygate into a 2D context at game-pixel scale (WG_W x WG_H). */
export function paintWaygate(g: CanvasRenderingContext2D, f: number, N: number, awake: boolean) {
  const out = paint(f, N, awake);
  g.imageSmoothingEnabled = false;
  g.drawImage(out, 0, 0, WG_W, WG_H);
}
