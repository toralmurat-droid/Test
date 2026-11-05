import Phaser from "phaser";
import { BONE, IRON, OLDWOOD, Pen, pen, ROPE, sheet } from "./worldProps";

/**
 * The grim side of the Mawdeep (Murat 2026-11-05: "the inside of the dungeon should make sense"): what the beast-folk
 * did to the villagers they dragged down. Blood pools and drag smears, villagers' remains, meat hooks, cages, flaying
 * frames, butcher's blocks, the stitching slab where hides are sewn onto the living, and heads on pikes.
 * Painted in code at 1.5 texels per world px like the other dungeon props, dark and weathered, light from the top left.
 */
const hash = (x: number, y: number, s: number) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const vn = (x: number, y: number, s: number) => {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  let tx = x - x0, ty = y - y0;
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash(x0, y0, s), b = hash(x0 + 1, y0, s), c = hash(x0, y0 + 1, s), d = hash(x0 + 1, y0 + 1, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const dth = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

/** Blood: fresh highlight, wet, dried dark, near black. */
const BLOOD = [0x9a2216, 0x6e120c, 0x4a0a08, 0x2a0606];
/** Dead skin: light, mid, shadow (grey and waxen). */
const FLESH: [number, number, number] = [0xb8a08c, 0x8a7064, 0x5a443c];
const RAW: [number, number, number] = [0x9a4a3c, 0x6e2a22, 0x441614]; // flayed
/** Villagers' homespun: dull green, brown, faded blue, undyed. */
const CLOTH: [number, number, number][] = [[0x5e6a3c, 0x46502c, 0x2e3420], [0x7a5a3a, 0x5a4028, 0x3a2818], [0x56607a, 0x3e465a, 0x2a2e3e], [0x9a8e70, 0x766a52, 0x504634]];
const HAIR = [0x3a2414, 0x6a4a22, 0x8a7a5a, 0x241a14];

export const GORE = {
  blood: { w: 60, h: 32, n: 4 }, drag: { w: 44, h: 30, n: 4 }, remains: { w: 46, h: 28, n: 4 },
  hook: { w: 36, h: 74, n: 3 }, cage: { w: 38, h: 56, n: 2 }, frame: { w: 46, h: 66, n: 2 },
  block: { w: 50, h: 36, n: 2 }, slab: { w: 56, h: 38, n: 1 }, pike: { w: 22, h: 64, n: 2 },
};

/** A flat canvas sheet painted texel by texel (no outline): the decals. */
function plain(scene: Phaser.Scene, key: string, w: number, h: number, frames: number, draw: (p: Pen, f: number) => void) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w * frames, h)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w * frames, h), out = new Uint32Array(img.data.buffer);
  for (let f = 0; f < frames; f++) {
    const buf = new Uint32Array(w * h);
    draw(pen(buf, w, h), f);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = buf[y * w + x];
      out[y * w * frames + f * w + x] = ((v & 0xff00ff00) | ((v >> 16) & 255) | ((v & 255) << 16)) >>> 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  for (let f = 0; f < frames; f++) tex.add(f, 0, f * w, 0, w, h);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** A ragged blood stain (flat, iso-squashed): dark rim, wet middle, a few bright wet glints. */
function stain(p: Pen, cx: number, cy: number, rx: number, ry: number, s: number, a = 1) {
  for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry) + (vn(x / 4, y / 3, s) - 0.5) * 0.7;
    if (d > 1) continue;
    const lv = d > 0.8 ? 3 : d > 0.45 ? 2 : 1;
    p.px(x, y, BLOOD[Math.min(3, lv + (dth(x, y) > 0.3 ? 1 : 0))], a);
    if (d < 0.5 && hash(x, y, s + 1) < 0.05) p.px(x, y, BLOOD[0], a);
  }
}
function drops(p: Pen, cx: number, cy: number, r: number, n: number, s: number) {
  for (let k = 0; k < n; k++) {
    const a = hash(k, s, 2) * Math.PI * 2, d = r * (0.6 + hash(k, s, 3) * 0.6);
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.5;
    p.px(x, y, BLOOD[2]); if (hash(k, s, 4) < 0.5) p.px(x + 1, y, BLOOD[3]);
  }
}

/** A pooled blood stain with splatter. */
function bloodPool(p: Pen, v: number) {
  const { w, h } = GORE.blood;
  stain(p, w / 2 + (v - 1.5) * 2, h / 2, 14 + v * 2, 7 + (v % 2) * 2, 70 + v);
  if (v % 2) stain(p, w / 2 + 14, h / 2 + 5, 5, 3, 90 + v);
  drops(p, w / 2, h / 2, 24, 14, v);
}

/**
 * A smear where someone was dragged, along a screen direction (frame 0 →, 1 ↘, 2 ↓, 3 ↙): two streaks from the heels,
 * thinning out, with clawed finger marks at one end where they tried to hold on.
 */
function dragSmear(p: Pen, v: number) {
  const { w, h } = GORE.drag, a = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4][v];
  const ux = Math.cos(a), uy = Math.sin(a) * 0.55, nx = -Math.sin(a), ny = Math.cos(a) * 0.55;
  const cx = w / 2, cy = h / 2, L = 19;
  // a broad smear, streaked lengthways (clothes and limbs dragging), drying and breaking up towards its tail
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - cx, dy = (y - cy) / 0.55 * (Math.abs(uy) + Math.abs(ny) > 0 ? 1 : 1);
    const along = dx * Math.cos(a) + dy * Math.sin(a), across = -dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(along) > L) continue;
    const t = (along + L) / (2 * L), half = 5 - t * 2.4 + Math.sin(along * 0.3 + v) * 0.6;
    if (Math.abs(across) > half) continue;
    const streak = vn(across * 1.1 + 20, along / 7, 75 + v);
    if (streak < 0.12 + t * 0.38 + dth(x, y) * 0.2) continue;
    const lv = t < 0.25 ? 1 : t < 0.6 ? 2 : 3;
    p.px(x, y, BLOOD[Math.min(3, lv + (Math.abs(across) > half - 1 ? 1 : 0))]);
  }
  // fingers clawing at the floor where it starts
  for (let f = -1.5; f <= 1.5; f++) for (let s = 0; s < 2 + Math.abs(f); s++) p.px(cx - ux * (L + 1 + s) + nx * f * 2, cy - uy * (L + 1 + s) + ny * f * 2, BLOOD[s < 2 ? 1 : 2]);
  stain(p, cx - ux * (L - 4), cy - uy * (L - 4), 4, 2.2, 30 + v);
  drops(p, cx, cy, 16, 6, 40 + v);
}

/** A rib cage, lying (cx,cy centre), pinkish where the flesh still clings. */
function ribs(p: Pen, cx: number, cy: number, flesh: boolean) {
  for (let y = -4; y <= 4; y++) p.px(cx, cy + y, BONE.mid);
  for (let k = 0; k < 4; k++) {
    const y = cy - 3 + k * 2;
    for (let s = 1; s <= 6 - Math.abs(k - 1.5); s++) {
      const dy = Math.round(s * 0.35);
      p.px(cx - s, y + dy, s < 3 ? BONE.hi : BONE.mid); p.px(cx + s, y + dy, BONE.lo);
      if (flesh && hash(s, k, 9) < 0.3) p.px(cx + s, y + dy + 1, RAW[1]);
    }
  }
}
function skullAt(p: Pen, x: number, y: number, hair = -1) {
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
    if (i * i + j * j * 1.3 > 11) continue;
    p.px(x + i, y + j, i < 0 && j < 0 ? BONE.hi : i > 1 || j > 1 ? BONE.lo : BONE.mid);
  }
  p.px(x - 1, y, 0x1c1410); p.px(x + 1, y, 0x1c1410); p.px(x - 1, y + 1, 0x2a1e18); p.px(x + 1, y + 1, 0x2a1e18);
  p.px(x, y + 2, 0x2a1e18); for (let i = -1; i <= 1; i++) p.px(x + i, y + 4, BONE.mid);
  if (hair >= 0) for (let i = -3; i <= 3; i++) for (let j = 0; j < 3 + (hash(i, hair, 5) * 3 | 0); j++) p.px(x + i + (j > 1 ? 1 : 0), y - 4 + j * (i < -1 || i > 1 ? 2 : 0.5), HAIR[hair % 4]);
}
/** A severed limb lying flat from (x0,y0) to (x1,y1): skin, a raw red end with a bone stub. */
function limb(p: Pen, x0: number, y0: number, x1: number, y1: number, cols: [number, number, number] = FLESH, sleeve?: [number, number, number]) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1), L = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, c = sleeve && t < 0.45 ? sleeve : cols;
    p.px(x - nx, y - ny, c[0]); p.px(x, y, c[1]); p.px(x + nx, y + ny, c[2]);
  }
  p.px(x0, y0, RAW[0]); p.px(x0 - nx, y0 - ny, RAW[1]); p.px(x0 + nx, y0 + ny, RAW[2]); p.px(x0 - (x1 - x0) / L, y0 - (y1 - y0) / L, BONE.hi);
}

/** Villagers' remains on the floor: 0 a torn tunic round a rib cage, 1 an arm and a booted leg, 2 a head with its cap, 3 scraps (hand, shoe, gnawed bone). */
function remains(p: Pen, v: number) {
  const { w, h } = GORE.remains, cx = w / 2, cy = h / 2, cl = CLOTH[v % CLOTH.length];
  stain(p, cx + 2, cy + 3, 13, 6, 50 + v, 0.9);
  if (v === 0) {
    for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 9; x <= cx + 9; x++) { // the tunic, ripped open in the middle
      const d = Math.abs(x - cx) / 9 + Math.abs(y - cy) / 7 + (vn(x / 2, y / 2, 3) - 0.5) * 0.5;
      if (d > 1 || Math.abs(x - cx) < 3 + (y - cy) * 0.2) continue;
      p.px(x, y, x < cx ? cl[0] : y > cy + 2 ? cl[2] : cl[1]);
    }
    ribs(p, cx, cy, true);
    limb(p, cx + 8, cy - 3, cx + 17, cy - 6, FLESH, cl);
    p.px(cx + 18, cy - 6, FLESH[0]); p.px(cx + 18, cy - 7, FLESH[1]); p.px(cx + 19, cy - 6, FLESH[1]); // fingers
  } else if (v === 1) {
    limb(p, cx - 14, cy - 2, cx - 3, cy + 2, FLESH, cl);
    for (let f = 0; f < 4; f++) p.px(cx - 2 + (f > 2 ? 0 : 1), cy + 1 + f * 0.7, f % 2 ? FLESH[1] : FLESH[0]);
    limb(p, cx + 2, cy - 5, cx + 12, cy + 1, CLOTH[3]); // a leg in its hose
    p.rect(cx + 11, cy, 5, 3, 0x3a2818); p.rect(cx + 12, cy, 3, 1, 0x5a4028); p.px(cx + 16, cy + 2, 0x241810); // the boot
  } else if (v === 2) {
    skullAt(p, cx - 2, cy - 1, v);
    for (let i = -4; i <= 4; i++) for (let j = 0; j < 3; j++) p.px(cx - 2 + i, cy - 5 + j - (Math.abs(i) > 3 ? -1 : 0), j === 0 ? cl[0] : cl[1]); // a cloth cap
    for (let i = -3; i <= 3; i++) p.px(cx - 2 + i, cy + 4, RAW[1]);
    p.rect(cx + 8, cy + 1, 6, 4, CLOTH[1][1]); p.line(cx + 8, cy + 1, cx + 13, cy + 1, CLOTH[1][0]); // a dropped basket
    for (let i = 0; i < 6; i += 2) p.px(cx + 8 + i, cy + 3, CLOTH[1][2]);
  } else {
    for (let f = 0; f < 4; f++) p.line(cx - 10 + f * 1.4, cy - 3, cx - 11 + f * 1.6, cy - 7, f === 0 ? FLESH[0] : FLESH[1]); // a hand
    p.rect(cx - 11, cy - 3, 6, 3, FLESH[1]); p.px(cx - 11, cy - 1, RAW[0]); p.px(cx - 10, cy - 1, RAW[1]);
    p.rect(cx + 4, cy - 4, 6, 3, 0x3a2818); p.px(cx + 4, cy - 4, 0x5a4028); // a shoe
    for (let s = -5; s <= 5; s++) p.px(cx + s, cy + 4 + s * 0.2, s < 0 ? BONE.hi : BONE.mid); // a gnawed thigh bone
    p.px(cx - 6, cy + 3, BONE.hi); p.px(cx + 6, cy + 5, BONE.mid);
    for (let k = 0; k < 6; k++) p.px(cx + (hash(k, 1, 7) - 0.5) * 20, cy + 7 + hash(k, 2, 7) * 3, cl[k % 3]); // rags
  }
  drops(p, cx, cy, 18, 8, 20 + v);
}

/** Meat hooks on a gibbet: 0 a body sewn in sackcloth, 1 a leg and a side of something, 2 a flayed carcass. */
function hook(p: Pen, v: number) {
  const { w, h } = GORE.hook;
  p.shaft(4, 6, 4, h - 2, 4, OLDWOOD);
  p.shaft(4, 6, w - 3, 6, 3, OLDWOOD);
  p.line(7, 14, 13, 8, OLDWOOD[1]); p.line(8, 14, 14, 8, OLDWOOD[2]); // brace
  const hx = w - 10;
  for (let y = 9; y < 20; y++) p.px(hx + (y % 2), y, y % 2 ? IRON.lo : IRON.mid); // the chain
  p.px(hx, 20, IRON.hi); p.px(hx + 1, 21, IRON.mid); p.px(hx + 1, 22, IRON.mid); p.px(hx, 23, IRON.lo); // the hook
  const top = 22, bot = h - (v === 1 ? 22 : 14);
  for (let y = top; y < bot; y++) {
    const t = (y - top) / (bot - top), half = v === 1 ? 3 - t * 1.2 : 5 * Math.sin(Math.min(1, t * 1.6 + 0.15) * Math.PI * 0.85) + 1;
    for (let x = Math.floor(hx - half); x <= hx + half; x++) {
      const side = (x - hx) / half;
      if (v === 0) { // sackcloth tied with rope, blood soaking through from the bottom
        let c = side < -0.3 ? 0x8a7a5a : side > 0.4 ? 0x4e4432 : 0x6e6046;
        if ((y - top) % 9 === 4) c = ROPE;
        if (t > 0.55 && vn(x / 2, y / 3, 11) < t - 0.2) c = BLOOD[t > 0.8 ? 1 : 2];
        p.px(x, y, c);
      } else if (v === 1) {
        // hung by the ankles: two legs, then the body, arms dangling, the head at the bottom
        const legs = t < 0.4, gap = legs && Math.abs(x - hx) < 1 - t;
        if (!gap && !(legs && Math.abs(x - hx) > 3)) p.px(x, y, t > 0.45 && t < 0.8 && Math.abs(x - hx) < 3 ? (side < 0 ? CLOTH[2][1] : CLOTH[2][2]) : side < -0.3 ? FLESH[0] : side > 0.4 ? FLESH[2] : FLESH[1]);
      } else {
        let c = side < -0.3 ? RAW[0] : side > 0.4 ? RAW[2] : RAW[1];
        if (Math.abs(side) < 0.15) c = BONE.mid; // spine
        else if ((y - top) % 3 === 0 && t < 0.55) c = BONE.lo; // ribs through the meat
        p.px(x, y, c);
      }
    }
  }
  if (v === 1) {
    for (const sx of [-5, 5]) limb(p, hx + sx * 0.7, top + (bot - top) * 0.5, hx + sx, bot + 1); // arms hanging down
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (i * i + j * j < 11) p.px(hx + i, bot + 1 + j, i < 0 ? FLESH[0] : FLESH[1]); // the head
    for (let i = -3; i <= 3; i++) for (let j = 0; j < 3; j++) p.px(hx + i, bot + 4 + j - Math.abs(i) * 0.3, HAIR[0]); // hair hanging
    for (let i = -2; i <= 2; i++) p.px(hx + i, top, ROPE);
  }
  if (v === 0) for (let i = -3; i <= 3; i++) p.px(hx + i, top + 3, HAIR[1]); // hair out of the sack's mouth
  // drips and the pool under it
  for (let k = 0; k < 4; k++) { const x = hx - 2 + k, y = bot + 2 + ((k * 5) % 7); p.px(x, y, BLOOD[1]); }
  stain(p, hx, h - 5, 7, 2.5, 60 + v);
}

/** An iron cage, the bars rusted, someone slumped dead inside it (0 bones in rags, 1 still with flesh, gripping the bars). */
function cage(p: Pen, v: number) {
  const { w, h } = GORE.cage, x0 = 5, x1 = w - 6, y0 = 10, y1 = h - 5;
  // inside first (behind the front bars): floor, body
  stain(p, w / 2, y1 - 3, 11, 3, 40 + v, 0.9);
  const cl = CLOTH[(v + 1) % CLOTH.length];
  if (v === 0) {
    skullAt(p, w / 2 - 4, y1 - 14);
    ribs(p, w / 2 - 2, y1 - 7, false);
    for (let k = 0; k < 9; k++) p.px(w / 2 - 6 + k, y1 - 3 + (k % 2), cl[k % 3]);
    p.line(w / 2 + 3, y1 - 3, w / 2 + 9, y1 - 2, BONE.mid);
  } else {
    for (let y = y1 - 16; y < y1 - 2; y++) for (let x = w / 2 - 6; x <= w / 2 + 3; x++) {
      if (Math.abs(x - (w / 2 - 1.5)) > 4.5 - (y - y1 + 16) * 0.05) continue;
      p.px(x, y, x < w / 2 - 3 ? cl[0] : cl[1]);
    }
    for (let j = -3; j <= 2; j++) for (let i = -3; i <= 3; i++) if (i * i + j * j < 10) p.px(w / 2 - 2 + i, y1 - 19 + j, i < 0 ? FLESH[0] : FLESH[1]);
    for (let i = -3; i <= 3; i++) p.px(w / 2 - 2 + i, y1 - 22, HAIR[2]);
    p.px(w / 2 - 3, y1 - 19, 0x241810); p.px(w / 2 - 1, y1 - 19, 0x241810);
    limb(p, w / 2 + 3, y1 - 12, x1 - 1, y1 - 20); // an arm reaching to the bars
  }
  // the cage: top hoop, bars, bottom frame, the chain it hangs from
  for (let y = 0; y < y0; y++) p.px(w / 2 + (y % 2), y, y % 2 ? IRON.lo : IRON.mid);
  for (let x = x0; x <= x1; x++) { const dome = Math.round(Math.abs(x - w / 2) / ((x1 - x0) / 2) * 3); p.px(x, y0 + dome, IRON.mid); p.px(x, y0 + dome + 1, IRON.lo); p.px(x, y1, IRON.lo); p.px(x, y1 - 1, IRON.mid); }
  for (let x = x0; x <= x1; x += 4) {
    const dome = Math.round(Math.abs(x - w / 2) / ((x1 - x0) / 2) * 3);
    for (let y = y0 + dome; y < y1; y++) p.px(x, y, hash(x, y, 13) < 0.15 ? 0x6a3e22 : x < w / 2 ? IRON.mid : IRON.lo);
  }
}

/** A flaying frame: 0 a villager's skin stretched and laced on it, 1 a body chained to an X of timbers. */
function frame(p: Pen, v: number) {
  const { w, h } = GORE.frame;
  stain(p, w / 2, h - 6, 16, 4, 80 + v);
  if (v === 0) {
    p.shaft(5, 6, 5, h - 3, 3, OLDWOOD); p.shaft(w - 8, 6, w - 8, h - 3, 3, OLDWOOD);
    p.shaft(3, 8, w - 4, 8, 3, OLDWOOD); p.shaft(5, h - 14, w - 6, h - 14, 2, OLDWOOD);
    // the skin, a pale man-shape spread wide, face sagging, laced at wrists and ankles
    const cx = w / 2 - 1;
    const body = (x: number, y: number) => {
      const t = (y - 12) / (h - 30);
      if (t < 0 || t > 1) return false;
      if (t < 0.14) return Math.abs(x - cx) < 4 - (t < 0.03 ? 1 : 0); // head
      if (t < 0.2) return Math.abs(x - cx) < 2;
      if (t < 0.3) return Math.abs(x - cx) < 15 - (t - 0.2) * 40; // arms out
      if (t < 0.62) return Math.abs(x - cx) < 7 - (t - 0.3) * 5;
      return Math.abs(Math.abs(x - cx) - 3.5 - (t - 0.62) * 8) < 2.4; // legs spread
    };
    for (let y = 10; y < h - 14; y++) for (let x = 6; x < w - 7; x++) {
      if (!body(x, y)) continue;
      const s = vn(x / 3, y / 3, 21) + dth(x, y) * 0.4;
      const edge = !body(x - 1, y) || !body(x + 1, y) || !body(x, y - 1) || !body(x, y + 1);
      p.px(x, y, edge ? RAW[hash(x, y, 23) < 0.5 ? 1 : 2] : s > 0.7 ? 0x6e5440 : s < 0.3 ? 0xa88a6a : 0x8a6e54); // tanned hide, raw ragged edge
      if (!edge && hash(x, y, 22) < 0.05) p.px(x, y, RAW[1]);
    }
    p.px(cx - 2, 14, 0x1c1410); p.px(cx + 1, 14, 0x1c1410); p.line(cx - 1, 17, cx, 17, 0x3a2420); // empty eyes, slack mouth
    for (const [lx, ly] of [[7, 17], [w - 9, 17], [cx - 9, h - 16], [cx + 8, h - 16]]) { p.px(lx, ly, ROPE); p.px(lx + 1, ly - 1, ROPE); p.px(lx - 1, ly + 1, ROPE); }
    for (let y = 22; y < 34; y += 2) p.px(cx, y, RAW[0]); // the cut it was peeled from
    for (let k = 0; k < 5; k++) p.px(cx - 4 + k * 2, h - 15 + (k % 2), BLOOD[1]); // drips
  } else {
    p.shaft(6, 6, w - 9, h - 4, 3, OLDWOOD); p.shaft(w - 9, 6, 6, h - 4, 3, OLDWOOD);
    const cx = w / 2 - 1, cy = h / 2 - 2;
    // the body: grey, ribs showing, arms up along the X
    limb(p, cx - 2, cy - 8, cx - 12, cy - 20); limb(p, cx + 2, cy - 8, cx + 12, cy - 20);
    limb(p, cx - 2, cy + 8, cx - 9, cy + 20); limb(p, cx + 2, cy + 8, cx + 9, cy + 20);
    for (let y = cy - 9; y <= cy + 9; y++) for (let x = cx - 4; x <= cx + 4; x++) {
      const c = x < cx - 1 ? FLESH[0] : x > cx + 2 ? FLESH[2] : FLESH[1];
      p.px(x, y, (y - cy) % 3 === 0 && y < cy + 2 && Math.abs(x - cx) > 1 ? FLESH[2] : c);
    }
    for (let y = cy + 1; y <= cy + 7; y++) for (let x = cx - 3; x <= cx + 3; x++) if (hash(x, y, 33) < 0.6) p.px(x, y, RAW[1 + (hash(x, y, 34) < 0.4 ? 1 : 0)]);
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (i * i + j * j < 10) p.px(cx + i + 1, cy - 12 + j + 1, i < 0 ? FLESH[0] : FLESH[1]); // head hung to one side
    for (let i = -3; i <= 3; i++) p.px(cx + 1 + i, cy - 15 + 1, HAIR[0]);
    for (const [lx, ly] of [[cx - 12, cy - 20], [cx + 12, cy - 20], [cx - 9, cy + 20], [cx + 9, cy + 20]]) { p.px(lx, ly, IRON.hi); p.px(lx + 1, ly, IRON.lo); p.px(lx, ly + 1, IRON.mid); }
    for (let k = 0; k < 5; k++) p.px(cx - 1 + (k % 3), cy + 10 + k * 2, BLOOD[1]);
  }
}

/** A butcher's block: 0 a cleaver bitten into it and a severed leg, 1 tools laid out and a hand, a bucket of blood beside. */
function block(p: Pen, v: number) {
  const { w, h } = GORE.block, x0 = 4, x1 = w - 12, top = 12, bot = h - 4;
  for (let y = top; y <= bot; y++) for (let x = x0; x <= x1; x++) {
    let c = y < top + 4 ? (x < x0 + 8 ? 0x6a5640 : 0x56442f) : x < x0 + 3 ? 0x4a3a28 : 0x382a1c;
    if (y >= top + 4 && (x - x0) % 9 === 0) c = 0x241a12;
    if (y < top + 4 && vn(x / 3, y, 41 + v) > 0.62) c = BLOOD[2];
    p.px(x, y, c);
  }
  for (let x = x0; x <= x1; x++) p.px(x, top, 0x7a6448);
  if (v === 0) {
    limb(p, x0 + 4, top + 1, x0 + 18, top + 2, FLESH, CLOTH[1]);
    p.rect(x0 + 24, top - 6, 7, 5, IRON.mid); p.line(x0 + 24, top - 6, x0 + 30, top - 6, IRON.hi); p.rect(x0 + 24, top - 2, 7, 1, BLOOD[1]); // cleaver blade
    p.shaft(x0 + 30, top - 5, x0 + 35, top - 8, 2, OLDWOOD);
  } else {
    p.line(x0 + 3, top + 1, x0 + 10, top + 1, IRON.hi); p.line(x0 + 3, top + 2, x0 + 10, top + 2, IRON.lo); // a flensing knife
    p.line(x0 + 13, top + 2, x0 + 18, top + 0, IRON.mid); p.px(x0 + 12, top + 2, OLDWOOD[1]); // hooks and needles
    for (let f = 0; f < 4; f++) p.line(x0 + 23 + f, top, x0 + 23 + f, top - 3 + (f === 0 ? 2 : 0), f % 2 ? FLESH[1] : FLESH[0]);
    p.rect(x0 + 22, top, 5, 2, FLESH[1]); p.px(x0 + 27, top + 1, RAW[0]);
  }
  // the bucket
  const bx = w - 9, by = h - 13;
  for (let y = by; y < by + 10; y++) for (let x = bx; x < bx + 8; x++) p.px(x, y, (y - by) % 4 === 1 ? IRON.lo : x < bx + 2 ? 0x5a4630 : 0x3e2e1e);
  for (let x = bx; x < bx + 8; x++) p.px(x, by, BLOOD[1]);
  p.px(bx + 2, by, BLOOD[0]);
  stain(p, w / 2, h - 2, 18, 3, 45 + v, 0.8);
}

/** The stitching slab: a villager on a stone slab, a beast hide half sewn onto them, needle and gut thread, a candle stub. */
function slab(p: Pen) {
  const { w, h } = GORE.slab, x0 = 3, x1 = w - 4, top = 14, bot = h - 4;
  for (let y = top; y <= bot; y++) for (let x = x0; x <= x1; x++) {
    let c = y < top + 5 ? 0x5e574e : x < x0 + 2 ? 0x4a443c : 0x36312c;
    if (vn(x / 4, y / 2, 51) > 0.7) c = y < top + 5 ? 0x6e675c : 0x2a2622;
    p.px(x, y, c);
  }
  const cy = top + 1;
  for (let x = x0 + 6; x < x1 - 8; x++) for (let j = -3; j <= 0; j++) { // the body lying along the slab, the hide (dark fur) sewn over its legs and middle
    const furred = x > x0 + 20;
    p.px(x, cy + j, furred ? ((x + j) % 3 === 0 ? 0x2a1c12 : 0x46301c) : j < -1 ? FLESH[0] : FLESH[1]);
    if (x === x0 + 21 && j > -4) p.px(x, cy + j, 0x8a7a5a); // the seam
  }
  for (let x = x0 + 21; x < x1 - 8; x += 2) p.px(x, cy - 4, 0x5a3a22); // fur tufts
  for (let k = 0; k < 6; k++) p.px(x0 + 21, cy - 3 + k * 0.6, k % 2 ? BLOOD[0] : 0xc8b890); // stitches
  for (let j = -3; j <= 2; j++) for (let i = -3; i <= 3; i++) if (i * i + j * j < 10) p.px(x0 + 4 + i, cy - 2 + j, i < 0 ? FLESH[0] : FLESH[1]); // head
  for (let j = -2; j <= 2; j++) p.px(x0 + 1, cy - 2 + j, HAIR[3]);
  p.px(x0 + 4, cy - 3, 0x241810);
  // needle and thread trailing off the edge, a candle stub
  p.line(x1 - 6, cy - 6, x1 - 2, cy - 9, IRON.hi); p.line(x1 - 6, cy - 6, x1 - 10, cy, 0xc8b890);
  p.rect(x0 + 13, top - 5, 2, 4, 0xd8ccb0); p.px(x0 + 13, top - 6, 0xffcc66); p.px(x0 + 14, top - 7, 0xffe8a0);
  for (let x = x0 + 8; x < x1 - 6; x++) if (hash(x, 1, 52) < 0.3) p.px(x, top + 5 + (hash(x, 2, 52) * 3 | 0), BLOOD[2]); // runs down the side
  stain(p, w / 2 + 4, h - 2, 20, 3, 55, 0.9);
}

/** A stake with a villager's head on it: 0 a man with a beard, 1 a woman with long hair. */
function pike(p: Pen, v: number) {
  const { w, h } = GORE.pike, cx = Math.round(w / 2);
  p.shaft(cx - 1, 10, cx - 1, h - 2, 3, OLDWOOD);
  for (let y = 16; y < 34; y++) if (hash(y, v, 3) < 0.6) p.px(cx - 1 + (y % 2), y, BLOOD[y < 24 ? 1 : 2]); // run down the stake
  const hy = 11;
  if (v === 1) for (let j = 0; j < 14; j++) for (let i = -5; i <= 5; i++) if (Math.abs(i) > 2 && hash(i, j, 4) < 0.85 - j * 0.04) p.px(cx + i, hy - 4 + j, HAIR[1]); // long hair hanging
  for (let j = -5; j <= 5; j++) for (let i = -4; i <= 4; i++) {
    if (i * i / 16 + j * j / 25 > 1) continue;
    p.px(cx + i, hy + j, i < -1 ? FLESH[0] : i > 2 ? FLESH[2] : FLESH[1]);
  }
  for (let i = -4; i <= 4; i++) for (let j = 0; j < 3; j++) p.px(cx + i, hy - 6 + j, HAIR[v ? 1 : 0]);
  p.px(cx - 2, hy - 1, 0x1c1410); p.px(cx + 1, hy - 1, 0x1c1410); // eyes gone
  p.line(cx - 1, hy + 3, cx + 1, hy + 3, 0x3a2420);
  if (v === 0) for (let i = -3; i <= 3; i++) for (let j = 3; j < 7 - Math.abs(i) * 0.6; j++) p.px(cx + i, hy + j, HAIR[0]);
  for (let i = -2; i <= 2; i++) p.px(cx + i, hy + 6, RAW[1]);
}

/** Registers every gore texture (decals as flat sheets, standing props with outline and contact shadow). */
export function goreTextures(scene: Phaser.Scene) {
  const G = GORE;
  plain(scene, "dg_blood", G.blood.w, G.blood.h, G.blood.n, bloodPool);
  plain(scene, "dg_drag", G.drag.w, G.drag.h, G.drag.n, dragSmear);
  sheet(scene, "dg_remains", G.remains.w, G.remains.h, G.remains.n, remains, 0);
  sheet(scene, "dg_hook", G.hook.w, G.hook.h, G.hook.n, hook, 0.5);
  sheet(scene, "dg_cage", G.cage.w, G.cage.h, G.cage.n, cage, 0.5);
  sheet(scene, "dg_frame", G.frame.w, G.frame.h, G.frame.n, frame, 0.5);
  sheet(scene, "dg_block", G.block.w, G.block.h, G.block.n, block, 0.5);
  sheet(scene, "dg_slab", G.slab.w, G.slab.h, G.slab.n, slab, 0.5);
  sheet(scene, "dg_pike", G.pike.w, G.pike.h, G.pike.n, pike, 0.5);
}
