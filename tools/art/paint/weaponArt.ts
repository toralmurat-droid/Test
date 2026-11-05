import { C2, P, blobPath, curve, ellipseP, fillShape, glow, limb, line, metal, poly, sh, css, vol } from "./brush";

/**
 * Weapon forms (Murat 2026-11-05: "hard to tell the melee weapons apart"). Every weapon item has its own silhouette:
 * blade shape, guard, grip and pommel for swords and katanas, head shape for axes, limbs for bows, the top of staves
 * and wands, plus a damage-type detail (frost shards, flame runes, venom drops, holy gold). Weapons are drawn a
 * fifth bigger than the old ones with thicker blades, so they still read once pixelated at 1.5 texels per world px.
 * Old class weapons (w_bronze, w_frost...) take the hero's weapon kind, so each has a form for every kind.
 */
export type Edge = "straight" | "leaf" | "wavy" | "crystal" | "broad" | "curved" | "serrated";
export type Guard = "cross" | "wide" | "disc" | "wing" | "ringcross" | "none";
export type Pommel = "ball" | "gem" | "ring" | "none";
export type AxeHead = "beard" | "broad" | "crescent" | "double" | "crystal";
export type BowKind = "self" | "recurve" | "thorn" | "horn";
export type Top = "orb" | "crystal" | "flame" | "halo" | "gnarl" | "skull" | "star";
export type Deco = "frost" | "flame" | "holy" | "drip" | "none";
export interface Form {
  len?: number; wid?: number; edge?: Edge; guard?: Guard; pommel?: Pommel; gem?: number; grip?: number; gripLen?: number;
  head?: AxeHead; bow?: BowKind; top?: Top; deco?: Deco; fuller?: boolean; trim?: number;
}

/** Forms per item id; `kind` keys ("sword", "axe"...) override for old class weapons in that hero's hands. */
const F: Record<string, Form & { by?: Partial<Record<string, Form>> }> = {
  // class kits
  knight_weapon: { edge: "straight", guard: "cross", pommel: "ball", fuller: true, grip: 0x4a2a14 },
  ninja_weapon: { edge: "curved", guard: "disc", grip: 0x1a1424, trim: 0x8a1d2a },
  wizard_weapon: { top: "orb" },
  archer_weapon: { bow: "self" },
  barbarian_weapon: { head: "broad", grip: 0x5a3a22 },
  vampire_weapon: { edge: "straight", len: 1.06, wid: 0.72, guard: "ringcross", pommel: "gem", gem: 0xc0182a, grip: 0x1a1014, fuller: true, trim: 0x9e1b2c },
  // old class weapons (shape follows the class)
  w_bronze: { edge: "leaf", guard: "disc", pommel: "ball", len: 0.92, head: "beard", top: "gnarl", bow: "self" },
  w_frost: { edge: "crystal", guard: "wide", pommel: "gem", gem: 0xa2e8ff, head: "crystal", top: "crystal", bow: "recurve", deco: "frost" },
  w_dragon: { edge: "wavy", guard: "wing", pommel: "gem", gem: 0xe63946, head: "crescent", top: "flame", bow: "horn", deco: "flame", len: 1.08 },
  w_ash: { edge: "straight", guard: "none", pommel: "ring", head: "beard", top: "gnarl", bow: "self" },
  w_long: { edge: "straight", guard: "cross", pommel: "ball", fuller: true, head: "double", top: "orb", bow: "recurve" },
  w_sky: { edge: "broad", guard: "wing", pommel: "gem", gem: 0xfff3b0, head: "crescent", top: "halo", bow: "recurve", deco: "holy", fuller: true },
  // typed swords
  ws_arming: { edge: "straight", guard: "cross", pommel: "ball", fuller: true, grip: 0x5a3a22 },
  ws_bastard: { edge: "broad", guard: "wide", pommel: "ring", len: 1.22, gripLen: 1.6, fuller: true, grip: 0x3a2414 },
  ws_pilgrim: { edge: "straight", guard: "ringcross", pommel: "ball", fuller: true, deco: "holy", grip: 0xe9e2d0 },
  // axes
  wx_hand: { head: "beard", len: 0.92, grip: 0x7a4f2a },
  wx_ember: { head: "crescent", deco: "flame", grip: 0x3a2414 },
  // katana
  wk_tanto: { edge: "curved", guard: "disc", len: 0.9, grip: 0x2b2e48, trim: 0x8a2230 },
  // bows
  wb_hunt: { bow: "self" },
  wb_recurve: { bow: "recurve" },
  wb_thorn: { bow: "thorn", deco: "drip" },
  // staves and wands
  wf_oak: { top: "gnarl" },
  ww_ash: { top: "crystal", deco: "frost" },
  ww_bone: { top: "skull", deco: "drip" },
  ww_star: { top: "star", deco: "holy" },
};

/** The form of item `id` drawn as weapon `kind`, or null (no form: the old drawing). */
export function formOf(id: string | null, kind: string): Form | null {
  if (!id) return null;
  const f = F[id];
  if (!f) return null;
  return { ...f, ...(f.by?.[kind] ?? {}) };
}

/** Weapons drawn with a form are this much bigger than the old ones. */
export const WS = 1.2;

export interface WCtx {
  c: C2; h: P; u: P; n: P; kind: string; f: Form;
  blade: number; accent: number; long: number; attack: number; move?: string;
  C: (c: number) => number; // weathering dim of the body painter
}

const DECO_COL: Record<Deco, number> = { frost: 0xd6f6ff, flame: 0xff9f1c, holy: 0xffd166, drip: 0x9bdc4a, none: 0 };

export function drawFormWeapon(w: WCtx): boolean {
  switch (w.kind) {
    case "sword": sword(w); return true;
    case "katana": katana(w); return true;
    case "axe": axe(w); return true;
    case "bow": bow(w); return true;
    case "staff": staff(w); return true;
    case "wand": wand(w); return true;
    default: return false;
  }
}

const at = (w: WCtx, t: number, o = 0): P => [w.h[0] + w.u[0] * t + w.n[0] * o, w.h[1] + w.u[1] * t + w.n[1] * o];

/** A blade from t0 to t1 with a width profile (k = 0 at the guard .. 1 at the tip) and a sideways bend. */
function profile(w: WCtx, t0: number, t1: number, width: (k: number) => number, bend: (k: number) => number, col: number, steps = 14) {
  const L: P[] = [], R: P[] = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps, t = t0 + (t1 - t0) * k, wd = width(k) / 2, b = bend(k);
    L.push(at(w, t, b + wd)); R.push(at(w, t, b - wd));
  }
  const pts = [...L, ...R.reverse()];
  const s = poly(pts);
  const m = at(w, (t0 + t1) / 2);
  metal(w.c, s, col, [m[0] + w.n[0] * 2, m[1] + w.n[1] * 2], [m[0] - w.n[0] * 2, m[1] - w.n[1] * 2], 0.7);
  return { s, L, R: R.reverse() };
}

/** Tip taper used by most blades. */
const taper = (k: number, from = 0.8) => (k > from ? Math.max(0.06, (1 - k) / (1 - from)) : 1);

function grip(w: WCtx, len: number, col: number, wrap = true) {
  const g = w.C(col);
  limb(w.c, at(w, -len), at(w, 0.7), 0.78, 0.74, g);
  if (wrap) for (let t = -len + 0.5; t < 0.4; t += 0.75) line(w.c, [at(w, t, -0.42), at(w, t + 0.38, 0.42)], sh(g, 0.55), 0.2, 0.9);
}

function pommel(w: WCtx, t: number) {
  const p = at(w, t), gold = w.C(w.f.trim ?? 0xd9a93a);
  switch (w.f.pommel ?? "ball") {
    case "ball": metal(w.c, ellipseP(p[0], p[1], 0.8, 0.8), gold, [p[0] - 0.8, p[1] - 0.8], [p[0] + 0.8, p[1] + 0.8], 0.6); break;
    case "gem":
      metal(w.c, ellipseP(p[0], p[1], 0.9, 0.9), gold, [p[0] - 0.9, p[1] - 0.9], [p[0] + 0.9, p[1] + 0.9], 0.5);
      vol(w.c, ellipseP(p[0], p[1], 0.5, 0.5), w.f.gem ?? 0xe63946, [p[0] - 0.5, p[1] - 0.5, 1, 1], { hi: 1.7, spec: 0.9, ao: 0.1 });
      break;
    case "ring": { // a flat wheel pommel
      const s = poly([at(w, t - 0.5, -1.0), at(w, t - 0.5, 1.0), at(w, t + 0.4, 1.0), at(w, t + 0.4, -1.0)]);
      metal(w.c, s, w.C(0xb9c2cc), at(w, t, -1), at(w, t, 1), 0.6);
      break;
    }
    default: break;
  }
}

function guard(w: WCtx, t: number) {
  const gold = w.C(w.f.trim ?? 0xd9a93a), steel = w.C(0x9aa4ae);
  const bar = (half: number, col: number, thick = 0.6, droop = 0) => {
    const s = blobPath([at(w, t - thick / 2 + droop, -half), at(w, t - thick / 2, 0), at(w, t - thick / 2 + droop, half),
      at(w, t + thick / 2 + droop, half), at(w, t + thick / 2, 0), at(w, t + thick / 2 + droop, -half)]);
    metal(w.c, s, col, at(w, t, -half), at(w, t, half), 0.6);
  };
  switch (w.f.guard ?? "cross") {
    case "cross": bar(2.1, gold); break;
    case "wide": bar(3.0, steel, 0.65, 0.7); for (const s of [-1, 1]) metal(w.c, ellipseP(at(w, t + 0.7, s * 3.0)[0], at(w, t + 0.7, s * 3.0)[1], 0.45, 0.45), gold, at(w, t, -3), at(w, t, 3), 0.5); break;
    case "disc": { const p = at(w, t); metal(w.c, ellipseP(p[0], p[1], 1.25, 1.25), w.C(0x5a4a38), [p[0] - 1.2, p[1] - 1.2], [p[0] + 1.2, p[1] + 1.2], 0.4); break; }
    case "wing":
      for (const s of [-1, 1]) {
        const wing = blobPath([at(w, t + 0.3, s * 0.4), at(w, t + 0.2, s * 2.0), at(w, t - 1.4, s * 3.2), at(w, t - 0.6, s * 1.6), at(w, t - 0.4, s * 0.4)]);
        metal(w.c, wing, gold, at(w, t, 0), at(w, t - 1, s * 3), 0.7);
      }
      break;
    case "ringcross": {
      bar(2.0, gold);
      const p = at(w, t + 0.9);
      w.c.beginPath(); w.c.ellipse(p[0], p[1], 1.2, 1.2, 0, 0, Math.PI * 2); w.c.strokeStyle = css(gold); w.c.lineWidth = 0.42; w.c.stroke();
      break;
    }
    default: break;
  }
}

/** Damage-type detail along a blade (between t0 and t1, `half` = half its width). */
function deco(w: WCtx, t0: number, t1: number, half: number) {
  const d = w.f.deco ?? "none";
  if (d === "none") return;
  const col = DECO_COL[d];
  switch (d) {
    case "frost":
      for (let t = t0 + 1; t < t1 - 0.8; t += 1.7) {
        const s = (Math.round(t) % 2) ? 1 : -1;
        fillShape(w.c, poly([at(w, t - 0.5, s * half), at(w, t + 0.2, s * (half + 1.1)), at(w, t + 0.6, s * half)]), css(col, 0.95));
      }
      for (let t = t0 + 0.6; t < t1; t += 2.6) glow(w.c, at(w, t)[0], at(w, t)[1], 1.2, 0xd6f6ff, 0.35);
      break;
    case "flame":
      for (let t = t0 + 0.5; t < t1; t += 1.3) glow(w.c, at(w, t)[0], at(w, t)[1], 1.5, 0xff8a3c, 0.32);
      for (let t = t0 + 1.2; t < t1 - 1; t += 1.6) { const p = at(w, t); fillShape(w.c, ellipseP(p[0], p[1], 0.34, 0.34), css(0xffd060)); }
      break;
    case "holy":
      line(w.c, [at(w, t0 + 0.8), at(w, t1 - 1.2)], 0xf2c14e, 0.32, 0.95);
      for (let t = t0 + 1.6; t < t1 - 1.2; t += 2.2) line(w.c, [at(w, t, -0.55), at(w, t, 0.55)], 0xfff3b0, 0.25, 0.95);
      glow(w.c, at(w, t1 * 0.7)[0], at(w, t1 * 0.7)[1], 2.2, 0xfff3b0, 0.3);
      break;
    case "drip":
      for (let t = t0 + 1.5; t < t1 - 1; t += 2.4) {
        const p = at(w, t, -half);
        fillShape(w.c, blobPath([[p[0] - 0.35, p[1]], [p[0] + 0.35, p[1]], [p[0] + 0.32, p[1] + 0.9], [p[0], p[1] + 1.4], [p[0] - 0.32, p[1] + 0.9]]), css(col));
      }
      break;
  }
}

function sword(w: WCtx) {
  const f = w.f, len = 10.5 * WS * w.long * (f.len ?? 1), wd = 1.5 * (f.wid ?? 1), col = f.edge === "leaf" ? sh(w.blade, 1.25) : w.blade;
  const edge = f.edge ?? "straight";
  const widthFn: Record<Edge, (k: number) => number> = {
    straight: (k) => wd * (1 - 0.18 * k) * taper(k),
    broad: (k) => wd * 1.32 * (1 - 0.12 * k) * taper(k, 0.84),
    leaf: (k) => wd * (0.75 + 0.55 * Math.sin(Math.min(1, k / 0.85) * Math.PI * 0.85)) * taper(k, 0.82),
    wavy: (k) => wd * 1.1 * taper(k, 0.82),
    crystal: (k) => wd * (1.05 + (Math.floor(k * 7) % 2 ? 0.35 : -0.05)) * taper(k, 0.78),
    curved: (k) => wd * 0.9 * taper(k, 0.85),
    serrated: (k) => wd * (1 + (Math.floor(k * 10) % 2 ? 0.3 : 0)) * taper(k),
  };
  const bend = edge === "wavy" ? (k: number) => Math.sin(k * Math.PI * 4) * 0.32 * (1 - k * 0.6) : edge === "curved" ? (k: number) => -0.9 * k * k : () => 0;
  const gl = 2.0 * (f.gripLen ?? 1);
  grip(w, gl, f.grip ?? 0x4a2a14);
  pommel(w, -gl - 0.4);
  if (f.deco === "flame") for (let t = 1.5; t < len; t += 1.4) glow(w.c, at(w, t)[0], at(w, t)[1], 1.9, 0xff5a1f, 0.28);
  if (f.deco === "holy") for (let t = 1.5; t < len; t += 1.8) glow(w.c, at(w, t)[0], at(w, t)[1], 1.7, 0xfff3b0, 0.22);
  profile(w, 1.1, len, widthFn[edge], bend, col);
  // dark spine and bright edge so the blade reads on any ground
  if (f.fuller || edge === "broad") line(w.c, [at(w, 1.8), at(w, len * 0.72)], sh(col, 0.5), 0.32, 0.9);
  line(w.c, [at(w, 1.6, wd * 0.34), at(w, len * 0.86, wd * 0.2)], sh(col, 1.7), 0.22, 0.9);
  if (edge === "crystal") for (let t = 2.2; t < len - 1; t += 2.1) line(w.c, [at(w, t, -0.6), at(w, t + 0.8, 0.6)], 0xffffff, 0.14, 0.8);
  deco(w, 1.1, len, wd / 2);
  guard(w, 1.0);
}

function katana(w: WCtx) {
  const f = w.f, len = 11.5 * WS * w.long * (f.len ?? 1), col = w.blade;
  const tw = f.trim ?? 0x8a1d2a;
  const gl = 3.0 * (f.gripLen ?? 1);
  limb(w.c, at(w, -gl), at(w, 0.6), 0.72, 0.72, w.C(f.grip ?? 0x1a1424));
  for (let k = 0; k < 5; k++) { const t = -gl + 0.4 + k * 0.62; line(w.c, [at(w, t, -0.38), at(w, t + 0.3, 0.38)], w.C(tw), 0.2, 0.95); line(w.c, [at(w, t, 0.38), at(w, t + 0.3, -0.38)], w.C(tw), 0.2, 0.95); }
  metal(w.c, ellipseP(at(w, -gl - 0.2)[0], at(w, -gl - 0.2)[1], 0.5, 0.5), w.C(0xc9a050), at(w, -gl - 0.6), at(w, -gl), 0.4);
  if (f.deco === "flame") for (let t = 1.5; t < len; t += 1.4) glow(w.c, at(w, t, -0.5)[0], at(w, t, -0.5)[1], 1.8, 0xff5a1f, 0.28);
  const edge = f.edge === "crystal" ? (k: number) => 1.15 * (1 + (Math.floor(k * 7) % 2 ? 0.3 : 0)) * taper(k, 0.8) : (k: number) => 1.15 * taper(k, 0.86);
  profile(w, 0.9, len, edge, (k) => -1.05 * k * k, col);
  // hamon: the wavy temper line
  const hp: P[] = [];
  for (let k = 0.05; k < 0.85; k += 0.05) hp.push(at(w, 0.9 + (len - 0.9) * k, -1.05 * k * k - 0.15 + Math.sin(k * 30) * 0.12));
  line(w.c, hp, sh(col, 1.6), 0.18, 0.9);
  deco(w, 0.9, len, 0.6);
  const p = at(w, 0.75);
  metal(w.c, ellipseP(p[0], p[1], 1.25, 1.25), w.C(0x3e3428), [p[0] - 1.2, p[1] - 1.2], [p[0] + 1.2, p[1] + 1.2], 0.5); // tsuba
  metal(w.c, ellipseP(p[0], p[1], 0.65, 0.65), w.C(0xc9a050), [p[0] - 0.6, p[1] - 0.6], [p[0] + 0.6, p[1] + 0.6], 0.5);
}

function axe(w: WCtx) {
  const f = w.f, len = 10.5 * WS * w.long * (f.len ?? 1), col = w.blade;
  const haft = w.C(f.grip ?? 0x7a4f2a);
  limb(w.c, at(w, -3.2), at(w, len + 0.4), 0.85, 0.8, haft);
  for (const t of [-1.8, -0.8, 0.2, 1.2]) line(w.c, [at(w, t - 0.2, -0.5), at(w, t + 0.2, 0.5)], w.C(0x3a2414), 0.3, 0.95);
  const b0 = len - 3.8;
  const head = f.head ?? "beard";
  const H = (pts: [number, number][]) => blobPath(pts.map(([t, o]) => at(w, b0 + t, o)));
  if (f.deco === "flame") for (let k = 0; k < 4; k++) glow(w.c, at(w, b0 + k * 1.2, 4.5)[0], at(w, b0 + k * 1.2, 4.5)[1], 2.0, 0xff5a1f, 0.32);
  let edgePts: [number, number][] = [];
  switch (head) {
    case "beard": {
      const s = H([[0, 0.3], [-1.6, 2.6], [-2.1, 5.0], [1.6, 4.4], [4.6, 5.2], [3.6, 2.4], [3.0, 0.3]]);
      metal(w.c, s, col, at(w, b0, 5), at(w, b0 + 3, 0.5), 0.6);
      edgePts = [[-2.0, 4.9], [1.6, 4.3], [4.5, 5.1]];
      break;
    }
    case "broad": {
      const s = H([[0, 0.3], [-1.2, 3.0], [-1.8, 5.6], [1.9, 6.3], [5.4, 5.6], [4.6, 3.0], [3.4, 0.3]]);
      metal(w.c, s, col, at(w, b0, 6), at(w, b0 + 3, 0.5), 0.6);
      edgePts = [[-1.7, 5.5], [1.9, 6.2], [5.3, 5.5]];
      fillShape(w.c, poly([at(w, b0 + 0.6, -0.3), at(w, b0 + 1.7, -1.8), at(w, b0 + 2.8, -0.3)]), css(sh(col, 0.7)));
      break;
    }
    case "crescent": {
      const s = H([[0.4, 0.3], [-2.6, 3.4], [-3.4, 6.2], [-1.0, 5.0], [1.8, 5.4], [4.6, 5.0], [6.6, 6.2], [5.6, 3.4], [2.8, 0.3]]);
      metal(w.c, s, col, at(w, b0, 6), at(w, b0 + 3, 0.5), 0.65);
      edgePts = [[-3.3, 6.1], [-1.0, 4.9], [1.8, 5.3], [4.6, 4.9], [6.5, 6.1]];
      fillShape(w.c, poly([at(w, b0 + 0.8, -0.3), at(w, b0 + 1.8, -2.4), at(w, b0 + 2.6, -0.3)]), css(sh(col, 0.7))); // back spike
      break;
    }
    case "double": {
      for (const sg of [-1, 1]) {
        const s = H([[0, sg * 0.3], [-1.3, sg * 2.6], [-1.6, sg * 4.6], [1.6, sg * 4.0], [4.6, sg * 4.6], [4.3, sg * 2.6], [3.0, sg * 0.3]]);
        metal(w.c, s, col, at(w, b0, sg * 4.5), at(w, b0 + 3, 0), 0.6);
      }
      edgePts = [[-1.5, 4.5], [1.6, 3.9], [4.5, 4.5]];
      break;
    }
    case "crystal": {
      const s = H([[0, 0.3], [-1.4, 2.0], [-2.4, 3.6], [-1.0, 4.0], [-1.6, 5.6], [0.8, 4.8], [2.2, 6.0], [3.0, 4.6], [4.8, 5.0], [3.8, 2.6], [3.0, 0.3]]);
      metal(w.c, s, col, at(w, b0, 5), at(w, b0 + 3, 0.5), 0.8);
      for (const [t, o] of [[0, 3], [1.5, 4], [3, 3.3]] as const) line(w.c, [at(w, b0 + t, o - 1), at(w, b0 + t + 0.6, o + 0.6)], 0xffffff, 0.16, 0.85);
      edgePts = [[-1.6, 5.5], [0.8, 4.7], [2.2, 5.9], [4.7, 4.9]];
      break;
    }
  }
  // bright cutting edge, socket ring
  if (edgePts.length) line(w.c, edgePts.map(([t, o]) => at(w, b0 + t, o)), sh(col, 1.75), 0.35, 0.95);
  metal(w.c, poly([at(w, b0 - 0.2, -0.95), at(w, b0 - 0.2, 0.95), at(w, b0 + 3.2, 0.95), at(w, b0 + 3.2, -0.95)]), sh(col, 0.75), at(w, b0, -1), at(w, b0 + 3, 1), 0.4);
  if (f.deco === "flame") for (const [t, o] of edgePts) { const p = at(w, b0 + t, o - 0.4); fillShape(w.c, ellipseP(p[0], p[1], 0.38, 0.38), css(0xffd060)); }
  if (f.deco === "frost") deco(w, b0, b0 + 4, 1);
}

function bow(w: WCtx) {
  const f = w.f, ph = w.attack, ch = w.move === "a3", pull = ph === 0 ? (ch ? 4 : 2) : ph === 1 ? (ch ? 5 : 4) : 0;
  const half = 8.4 * w.long, wood = w.blade, kind = f.bow ?? "self";
  const at2 = (t: number, o: number) => at(w, t, o);
  const pts: P[] = [];
  for (let t = -1; t <= 1.0001; t += 0.1) {
    const a = Math.abs(t);
    let bend = 2.8 * (1 - t * t) - 0.5 * a ** 3;
    if (kind === "recurve" || kind === "horn") bend -= a > 0.72 ? (a - 0.72) * (kind === "horn" ? 9 : 7) : 0; // tips curl forward
    pts.push(at2(bend, t * half));
  }
  const stroke = (col: number, wd: number, a = 1) => { w.c.beginPath(); w.c.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) w.c.lineTo(q[0], q[1]); w.c.strokeStyle = css(col, a); w.c.lineWidth = wd; w.c.lineCap = "round"; w.c.stroke(); };
  stroke(sh(wood, 0.5), 1.15); stroke(wood, 0.78); stroke(sh(wood, 1.5), 0.22, 0.75);
  if (kind === "recurve" || kind === "horn") for (const e of [pts[0], pts[pts.length - 1]]) metal(w.c, ellipseP(e[0], e[1], 0.55, 0.55), w.C(kind === "horn" ? 0xe63946 : f.trim ?? 0xd9a93a), [e[0] - 0.5, e[1] - 0.5], [e[0] + 0.5, e[1] + 0.5], 0.5);
  if (kind === "thorn") {
    for (let i = 2; i < pts.length - 2; i += 2) { const q = pts[i]; fillShape(w.c, poly([[q[0] - w.n[0] * 0.3, q[1] - w.n[1] * 0.3], [q[0] + w.u[0] * 1.2, q[1] + w.u[1] * 1.2], [q[0] + w.n[0] * 0.3, q[1] + w.n[1] * 0.3]]), css(sh(wood, 0.6))); }
    for (const i of [4, pts.length - 5]) { const q = pts[i]; fillShape(w.c, ellipseP(q[0] - w.u[0] * 0.4, q[1] - w.u[1] * 0.4, 0.9, 0.45, Math.atan2(w.n[1], w.n[0])), css(0x6fae3a)); }
  }
  if (f.deco === "frost") for (const i of [3, pts.length - 4]) glow(w.c, pts[i][0], pts[i][1], 1.6, 0xd6f6ff, 0.45);
  if (f.deco === "flame") for (const i of [3, pts.length - 4]) glow(w.c, pts[i][0], pts[i][1], 1.6, 0xff8a3c, 0.45);
  const sp = at(w, -pull * 1.3);
  line(w.c, [pts[0], sp, pts[pts.length - 1]], 0xeee6d2, 0.16, 0.9);
  limb(w.c, at(w, -0.8), at(w, 1.0), 0.95, 0.95, w.C(f.grip ?? 0x3e2715)); // grip
  if (ph === 0 || ph === 1) {
    const tip = at(w, -pull * 1.3 + 12);
    line(w.c, [sp, tip], w.C(0xa07a48), 0.28);
    const head = f.deco === "drip" ? 0x9bdc4a : 0xc9d2dc;
    fillShape(w.c, poly([[tip[0] + w.u[0] * 1.1, tip[1] + w.u[1] * 1.1], [tip[0] + w.n[0] * 0.6, tip[1] + w.n[1] * 0.6], [tip[0] - w.n[0] * 0.6, tip[1] - w.n[1] * 0.6]]), css(head));
    for (const s of [-1, 1]) line(w.c, [[sp[0] + w.u[0] * 0.3, sp[1] + w.u[1] * 0.3], [sp[0] + w.u[0] * 1.5 + w.n[0] * s * 0.6, sp[1] + w.u[1] * 1.5 + w.n[1] * s * 0.6]], w.C(0xb5262f), 0.34);
  }
  if (f.deco === "drip") { const q = pts[Math.floor(pts.length * 0.7)]; fillShape(w.c, ellipseP(q[0], q[1] + 1, 0.35, 0.6), css(0x9bdc4a)); }
}

/** The top of a staff (or the tip of a wand, `small`). */
function top(w: WCtx, t: number, wood: number, stone: number, small: boolean) {
  const k = small ? 0.62 : 1, o = at(w, t + 2.3 * k), shine = w.attack >= 0 ? 0.25 : 0;
  const claws = () => { for (const s of [-1, 1]) curve(w.c, at(w, t - 0.3, s * 0.3), at(w, t + 1.3 * k, s * 1.9 * k), at(w, t + 3.4 * k, s * 1.0 * k), wood, 0.48 * k); };
  const orb = (r: number, col: number) => {
    glow(w.c, o[0], o[1], 3.2 * k, col, 0.55 + shine);
    vol(w.c, ellipseP(o[0], o[1], r, r), col, [o[0] - r, o[1] - r, r * 2, r * 2], { ao: 0.15, hi: 1.7, spec: 0.85 });
  };
  switch (w.f.top ?? "orb") {
    case "orb": claws(); orb(1.35 * k, stone); break;
    case "gnarl": {
      // twisted wood knot cradling a small stone
      for (const s of [-1, 1]) curve(w.c, at(w, t - 1, s * 0.4), at(w, t + 1.6 * k, s * 2.2 * k), at(w, t + 3.4 * k, -s * 0.6 * k), wood, 0.62 * k);
      orb(0.95 * k, stone);
      break;
    }
    case "crystal": {
      claws();
      glow(w.c, o[0], o[1], 3.0 * k, stone, 0.5 + shine);
      for (const [dt, dd, ln] of [[0, 0, 3.2], [-0.4, -1.0, 2.0], [-0.4, 1.0, 2.2]] as const) {
        const b: P = at(w, t + 0.8 * k + dt, dd * k), tip = at(w, t + (0.8 + ln) * k + dt, dd * 1.4 * k);
        const s = poly([[b[0] - w.n[0] * 0.55 * k, b[1] - w.n[1] * 0.55 * k], tip, [b[0] + w.n[0] * 0.55 * k, b[1] + w.n[1] * 0.55 * k]]);
        metal(w.c, s, stone, b, tip, 0.9);
      }
      break;
    }
    case "flame": {
      for (const s of [-1, 1]) curve(w.c, at(w, t - 0.3, s * 0.3), at(w, t + 1.6 * k, s * 2.4 * k), at(w, t + 4.0 * k, s * 1.6 * k), wood, 0.5 * k);
      glow(w.c, o[0], o[1], 3.6 * k, 0xff5a1f, 0.6 + shine);
      fillShape(w.c, blobPath([at(w, t + 0.9 * k, -1.1 * k), at(w, t + 2.6 * k, -0.9 * k), at(w, t + 4.6 * k, 0.2 * k), at(w, t + 2.6 * k, 1.0 * k), at(w, t + 0.9 * k, 1.1 * k)]), css(0xff9f1c));
      fillShape(w.c, ellipseP(o[0], o[1], 0.7 * k, 0.7 * k), css(0xfff176));
      break;
    }
    case "halo": {
      const ring = at(w, t + 2.4 * k);
      glow(w.c, ring[0], ring[1], 3.4 * k, 0xfff3b0, 0.5 + shine);
      w.c.beginPath(); w.c.ellipse(ring[0], ring[1], 2.0 * k, 2.0 * k, 0, 0, Math.PI * 2); w.c.strokeStyle = css(0xf2c14e); w.c.lineWidth = 0.55 * k; w.c.stroke();
      line(w.c, [at(w, t), at(w, t + 4.4 * k)], 0xf2c14e, 0.5 * k);
      line(w.c, [at(w, t + 2.4 * k, -1.4 * k), at(w, t + 2.4 * k, 1.4 * k)], 0xf2c14e, 0.5 * k);
      break;
    }
    case "skull": {
      const sk = at(w, t + 1.6 * k);
      glow(w.c, sk[0], sk[1], 2.6 * k, stone, 0.45 + shine);
      vol(w.c, ellipseP(sk[0], sk[1], 1.25 * k, 1.1 * k), 0xe6dcc0, [sk[0] - 1.3, sk[1] - 1.2, 2.6, 2.4], { ao: 0.35 });
      for (const s of [-1, 1]) { const e = at(w, t + 1.8 * k, s * 0.5 * k); fillShape(w.c, ellipseP(e[0], e[1], 0.32 * k, 0.32 * k), css(stone)); }
      break;
    }
    case "star": {
      const s = at(w, t + 2.0 * k);
      glow(w.c, s[0], s[1], 3.2 * k, stone, 0.55 + shine);
      const pts: P[] = [];
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, r = (i % 2 ? 0.7 : 1.7) * k; pts.push([s[0] + Math.cos(a) * r, s[1] + Math.sin(a) * r]); }
      metal(w.c, poly(pts), stone, [s[0] - 1.6, s[1] - 1.6], [s[0] + 1.6, s[1] + 1.6], 0.9);
      break;
    }
  }
}

function staff(w: WCtx) {
  const len = 13 * WS * w.long * (w.f.len ?? 1), wood = w.blade, stone = w.accent || 0x5ee6ff;
  limb(w.c, at(w, -6.5), at(w, len), 0.88, 0.76, wood);
  for (const t of [-3, 2.5, 7.5]) line(w.c, [at(w, t, -0.48), at(w, t + 0.55, 0.48)], sh(wood, 0.5), 0.22, 0.8);
  limb(w.c, at(w, -0.6), at(w, 1.6), 1.0, 1.0, w.C(0x3e2715)); // leather grip
  if (w.f.deco === "frost") glow(w.c, at(w, len)[0], at(w, len)[1], 2.4, 0xd6f6ff, 0.35);
  top(w, len, wood, stone, false);
}

function wand(w: WCtx) {
  const len = 7.4 * WS, wood = w.blade, stone = w.accent || 0x9be8ff;
  limb(w.c, at(w, -1.3), at(w, len), 0.62, 0.46, wood);
  line(w.c, [at(w, 0.4, -0.3), at(w, len - 0.6, -0.3)], sh(wood, 1.5), 0.12, 0.7);
  limb(w.c, at(w, -1.5), at(w, 0.9), 0.75, 0.75, w.C(0x3e2715));
  metal(w.c, ellipseP(at(w, len)[0], at(w, len)[1], 0.6, 0.6), w.C(0xc9a050), at(w, len - 0.6), at(w, len + 0.6), 0.5); // ferrule
  top(w, len, wood, stone, true);
  if (w.f.deco === "drip") { const q = at(w, len + 1.2, -0.9); fillShape(w.c, ellipseP(q[0], q[1] + 0.8, 0.3, 0.55), css(0x9bdc4a)); }
}
