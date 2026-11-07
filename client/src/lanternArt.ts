import type { Pen } from "./worldProps";

/**
 * The spirit lanterns of the marsh (quest "Lights in the Mist", questObjects.ts): an iron cage lantern seen from the
 * corner (two glass faces and a pyramid roof, like the village houses), on a weathered square post set in a mossy stone
 * plinth. Same hand as the village bonfire: 1.5 texels per world px, flat colour steps with ordered dithering, light
 * from the top left; the 1px outline comes from sheet(). Dark: smoky glass and cobwebs. Lit: a cold spirit flame.
 */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dith = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];
const step = (pal: number[], v: number, x: number, y: number) => {
  const c = Math.max(0, Math.min(pal.length - 1, v)), i = Math.floor(c);
  return pal[Math.min(pal.length - 1, c - i > dith(x, y) ? i + 1 : i)];
};
const hash = (x: number, y: number, s: number) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const noise = (x: number, y: number, s: number) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};

const STONE = [0x16141a, 0x26242b, 0x38363d, 0x4c4a50, 0x625f63, 0x7c7a7a];
const MOSS = [0x1a2414, 0x2a3a1c, 0x3e5226, 0x56682e];
const WOOD = [0x17120e, 0x2a2119, 0x3f3226, 0x564535, 0x6f5b45];
const IRON = [0x111215, 0x1f2126, 0x33363d, 0x4d525b, 0x6f7681, 0x9aa2ab];
const RUST = [0x3a1e12, 0x5a2f18];
const SPIRIT = [0x0c2a33, 0x16505e, 0x2a8494, 0x4fc3d0, 0x9ff4ff, 0xeaffff];
const SMOKE = [0x111518, 0x192024, 0x222b30, 0x2e393f];

export const LANTERN_W = 34, LANTERN_H = 72, LANTERN_FRAMES = 6;
/** Middle of the glass, in world px above the foot (display scale 1/1.5): where the light sits. */
export const LANTERN_LIFT = (LANTERN_H - 30) / 1.5;

const CX = LANTERN_W / 2;
// Cage: a square prism seen from its front corner. Top corners at y=TOP (sides), TOP+HH (front); faces BODY tall.
const HW = 8, HH = 4, TOP = 20, BODY = 15;
const faceTop = (x: number) => TOP + (HH * (HW - Math.abs(x - CX))) / HW; // the cage's top edge, sloping down to the front

export function spiritLantern(p: Pen, f: number, lit: boolean) {
  const t = (f / LANTERN_FRAMES) * Math.PI * 2, H = LANTERN_H, seed = lit ? 7 : 3;

  // --- stone plinth: an iso block, mossy top, chipped corners ---
  const PY = H - 12, PW = 9, PH = 4.5, PS = 6; // top diamond centre y, half sizes, side height
  for (let x = -PW; x <= PW; x++) {
    const span = PH * (1 - Math.abs(x) / PW);
    const y0 = Math.round(PY - span), y1 = Math.round(PY + span);
    for (let y = y0; y <= y1 + PS; y++) {
      const top = y <= y1;
      if ((Math.abs(x) >= PW - 1 && hash(x, y, 40) < 0.4) || (y > y1 + PS - 1 && hash(x, y, 41) < 0.35)) continue;
      let lv = top ? 4.2 - (x + PW) / (PW * 2) * 1.2 : x < 0 ? 3 - (y - y1) * 0.15 : 1.7 - (y - y1) * 0.12;
      lv += (noise(x * 0.5, y * 0.5, 42) - 0.5) * 1.2;
      let c = step(STONE, lv, CX + x, y);
      if (noise(x * 0.4, y * 0.4, 43) > (top ? 0.52 : 0.68) && !(top && Math.abs(x) < 3)) c = step(MOSS, lv * 0.7, CX + x, y);
      if (!top && x === 0) c = STONE[1]; // front corner edge
      p.px(CX + x, y, c);
    }
  }
  // a few reeds of marsh grass against the stone
  for (const [gx, gh, s] of [[-8, 6, 1], [-6, 4, 2], [7, 5, 3], [9, 3, 4]] as const)
    for (let i = 0; i < gh; i++) p.px(CX + gx + Math.round(Math.sin(i * 0.6 + s) * 0.6), H - 3 - i, step(MOSS, 3 - i * 0.4, gx, i));

  // --- the post: square timber seen on its corner, lit left face, dark right face ---
  const postTop = TOP + HH + BODY + 3, postFoot = PY;
  for (let y = postTop; y <= postFoot; y++) for (let x = -3; x <= 3; x++) {
    const lv = (x < 0 ? 3.4 + x * -0.1 : x === 0 ? 2.2 : 1.4 - x * 0.15) + (noise(x * 0.7, y * 0.15, 50) - 0.5) * 1.4;
    let c = step(WOOD, lv, CX + x, y);
    if (hash(x, y, 51) < 0.05) c = WOOD[0]; // cracks
    p.px(CX + x, y, c);
  }
  // iron bands round the post
  for (const by of [postTop + 4, postFoot - 6]) for (let x = -3; x <= 3; x++) {
    p.px(CX + x, by + Math.abs(x) * 0.5, step(IRON, x < 0 ? 4 : 2, CX + x, by));
    p.px(CX + x, by + 1 + Math.abs(x) * 0.5, IRON[1]);
  }
  if (!lit) p.px(CX + 2, postFoot - 5, RUST[1]);

  // --- base plate the cage sits on (a thin iso diamond) ---
  const BY = TOP + HH + BODY; // front-bottom corner of the cage
  for (let x = -HW - 1; x <= HW + 1; x++) {
    const yy = BY - HH * (Math.abs(x) / HW);
    p.px(CX + x, yy, step(IRON, x < 0 ? 3 : 1.6, CX + x, yy));
    p.px(CX + x, yy + 1, IRON[1]);
    if (Math.abs(x) < 3) p.px(CX + x, yy + 2, IRON[0]);
  }

  // --- the cage: two glass faces in an iron frame, flame inside ---
  const fl = lit ? 0.5 + 0.5 * Math.sin(t) : 0, fl2 = lit ? Math.sin(t * 2 + 1) : 0;
  for (let x = -HW; x <= HW; x++) {
    const X = CX + x, yTop = faceTop(X), yBot = yTop + BODY;
    for (let y = Math.round(yTop); y <= Math.round(yBot); y++) {
      const u = y - yTop; // 0..BODY down the face
      const frame = Math.abs(x) === HW || x === 0 || u < 1.5 || u > BODY - 1.5;
      if (frame) { p.px(X, y, step(IRON, x < 0 ? 3.6 - u * 0.08 : x === 0 ? 4.6 : 1.8, X, y)); continue; }
      if (lit) {
        // glass lit from the flame: brightest near the middle, left face a touch brighter
        const d = Math.hypot(x * 0.9, (u - BODY * 0.58) * 0.8);
        p.px(X, y, step(SPIRIT, 3.7 - d * 0.36 + (x < 0 ? 0.3 : -0.3) + fl * 0.4, X, y));
      } else {
        const lv = (x < 0 ? 2.2 : 1.2) - u * 0.06 + (noise(x * 0.8, u * 0.8, 60) - 0.5) * 1.2;
        p.px(X, y, step(SMOKE, lv, X, y));
        if (x < 0 && u > 2 && u < 6 && x === -HW + 2 + Math.floor(u / 2)) p.px(X, y, SMOKE[3]); // glint on the glass
      }
    }
  }
  if (lit) {
    // the spirit flame: a cold tongue standing on the wick, swaying
    const fy = Math.round(TOP + HH + BODY - 3), fh = 9 + fl * 2;
    for (let i = 0; i < fh; i++) {
      const k = i / fh, w = Math.max(0, Math.sin(Math.PI * Math.min(1, k * 1.6 + 0.15)) * 2.4 * (1 - k * 0.6)), sway = Math.sin(t + i * 0.5) * k * 1.4;
      for (let x = -Math.ceil(w); x <= Math.ceil(w); x++) if (Math.abs(x) <= w) p.px(CX + x + sway, fy - i, step(SPIRIT, 5.4 - Math.abs(x) * 0.7 - k * 1.2, CX + x, fy - i));
    }
    p.px(CX, fy + 1, IRON[2]); // wick
  } else {
    // a cold wick and a cobweb in the upper left corner
    p.px(CX, TOP + HH + BODY - 3, WOOD[0]);
    for (let i = 0; i < 4; i++) { p.px(CX - HW + 1 + i, faceTop(CX - HW + 1 + i) + 2 + (i % 2), 0x8a8f96, 0.45); p.px(CX - HW + 1, faceTop(CX - HW) + 2 + i, 0x8a8f96, 0.35); }
  }

  // --- the roof: an iron pyramid with eaves, lit left face, dark right face, ring on top ---
  const RW = HW + 2, RY = TOP, AP = TOP - 11; // eave side corners, apex y
  for (let x = -RW; x <= RW; x++) {
    const eave = RY + (HH + 1.5) * (1 - Math.abs(x) / RW); // front edge of the eave, lowest under the front corner
    for (let y = Math.round(AP + Math.abs(x) * ((RY - AP) / RW)); y <= Math.round(eave); y++) {
      const lv = (x < 0 ? 4 - (y - AP) * 0.08 : x === 0 ? 3.6 : 1.7 - (y - AP) * 0.04) + (noise(x * 0.6, y * 0.6, 70) - 0.5) * 0.9;
      let c = step(IRON, lv, CX + x, y);
      if (!lit && noise(x * 0.5, y * 0.5, 71) > 0.66) c = step(RUST, lv * 0.4, CX + x, y);
      if (y >= Math.round(eave) - 0.5) c = IRON[1]; // eave lip
      p.px(CX + x, y, c);
    }
  }
  // finial ring
  for (const [rx, ry] of [[-1, -2], [0, -3], [1, -2], [-1, -1], [1, -1]] as const) p.px(CX + rx, AP + ry, IRON[x0(rx)]);
  p.px(CX, AP - 1, IRON[2]);

  if (lit) {
    // light spilling out under the eaves and down the post, and spirit motes drifting up
    for (let x = -HW + 1; x < HW; x++) p.px(CX + x, faceTop(CX + x) + BODY + 1, SPIRIT[4], 0.3);
    for (let y = postTop; y < postTop + 10; y++) p.px(CX - 3, y, SPIRIT[3], 0.3 - (y - postTop) * 0.03);
    for (let i = 0; i < 7; i++) {
      const ph = (f / LANTERN_FRAMES + hash(i, 0, seed)) % 1;
      const mx = CX + (hash(i, 1, seed) - 0.5) * 22 + Math.sin(ph * 6 + i) * 1.5, my = TOP + BODY - ph * 30;
      if (my < 1) continue;
      p.px(mx, my, SPIRIT[i % 2 ? 4 : 5], 0.85 - ph * 0.7);
    }
  }
}
const x0 = (rx: number) => (rx < 0 ? 4 : rx === 0 ? 5 : 2);
