import { mkdirSync, writeFileSync } from "node:fs";
import { Canvas, HiCanvas, shade } from "./canvas";
import { buildSheet, GearCtx, GearPart, HEROES, K, Pose, setGearHook } from "./characters";
import { GEAR, GEAR_IDS, GearDef } from "../../shared/gear";

/**
 * Gear overlays. For every hero and item we render the full hero sheet again with that item "worn"
 * (the item recolours the matching body part, see the hook below), then keep only the pixels that differ
 * from the plain sheet. The game draws that overlay on top of the hero, frame for frame.
 */

const PART_OF: Record<GearDef["slot"], GearPart> = { weapon: "weapon", ranged: "torso", shield: "shield", armour: "torso", shoes: "legs", hat: "head" };

const lum = (c: number) => (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;

/** Pixels of `mask` still visible on `main` (nothing drawn over them yet). */
function visible(main: Canvas, mask: Canvas): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let y = 0; y < mask.h; y++) for (let x = 0; x < mask.w; x++) {
    const [mc, ma] = mask.get(x, y);
    if (ma < 200) continue;
    const [c, a] = main.get(x, y);
    if (a >= 200 && c === mc) out.push([x, y, c]);
  }
  return out;
}

/** Repaint pixels in `col`, keeping their light/dark shading relative to the part's average. */
function recolour(main: Canvas, pts: [number, number, number][], col: number, pattern?: (x: number, y: number) => number) {
  if (!pts.length) return;
  const mean = pts.reduce((s, [, , c]) => s + lum(c), 0) / pts.length;
  for (const [x, y, c] of pts) {
    const f = Math.max(0.55, Math.min(1.35, 1 + (lum(c) - mean) * 1.6)) * (pattern?.(x, y) ?? 1);
    main.pxN(x, y, shade(col, f));
  }
}

function hook(item: GearDef) {
  return (part: GearPart, main: Canvas, mask: Canvas, p: Pose, _hero: string, g: GearCtx) => {
    if (PART_OF[item.slot] !== part) return;
    // These draw new shapes, so they run even when the part itself drew nothing
    if (item.slot === "shield") return shield(item, main, mask, p, g);
    if (item.slot === "ranged") return ranged(item, main, p, g);
    const pts = visible(main, mask);
    if (!pts.length) return;
    if (item.slot === "weapon") weapon(item, main, mask, pts, g);
    else if (item.slot === "armour") armour(item, main, pts);
    else if (item.slot === "shoes") shoes(item, main, pts, p);
    else hat(item, main, mask, pts);
  };
}

function weapon(item: GearDef, main: Canvas, mask: Canvas, pts: [number, number, number][], g: GearCtx) {
  if (item.style.startsWith("long")) {
    // Long weapon: redraw the weapon further along its own direction and keep the part past the old tip
    const [hx, hy] = g.hand;
    let tip = pts[0], best = -1;
    for (const q of pts) { const dd = (q[0] - hx) ** 2 + (q[1] - hy) ** 2; if (dd > best) { best = dd; tip = q; } }
    const len = Math.sqrt(best) || 1, ux = (tip[0] - hx) / len, uy = (tip[1] - hy) / len;
    const k = Math.round((item.bonus.reach ?? 0) * 8) + 1;
    const shifted = g.redraw(Math.round(ux * k), Math.round(uy * k));
    for (let y = 0; y < shifted.h; y++) for (let x = 0; x < shifted.w; x++) {
      const [c, a] = shifted.get(x, y);
      if (a < 200) continue;
      const t = (x - hx) * ux + (y - hy) * uy;
      if (t < len - k * K - 1) continue;
      if (main.alpha(x, y) && !mask.alpha(x, y)) continue; // never paint over the body
      main.pxN(x, y, c); mask.pxN(x, y, c);
      pts.push([x, y, c]);
    }
  }
  recolour(main, pts, item.color);
  if (item.style !== "glow" && item.style !== "longglow") return;
  // Soft glow around the whole weapon, only on empty pixels
  for (let y = 0; y < mask.h; y++) for (let x = 0; x < mask.w; x++) {
    if (mask.alpha(x, y) || main.alpha(x, y)) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => mask.alpha(x + dx, y + dy) > 200)) main.pxN(x, y, item.accent, 110);
  }
}

function armour(item: GearDef, main: Canvas, pts: [number, number, number][]) {
  const set = new Set(pts.map(([x, y]) => `${x},${y}`));
  const has = (x: number, y: number) => set.has(`${x},${y}`);
  recolour(main, pts, item.color, item.style === "mail" ? (x, y) => ((Math.floor(x / K) + Math.floor(y / K)) % 2 ? 0.86 : 1.06) : undefined);
  if (item.style === "trim") {
    // Gold edges and a centre stripe
    const xs = pts.map(([x]) => x), mid = Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
    for (const [x, y] of pts) {
      const edge = !has(x - 1, y) || !has(x + 1, y) || !has(x, y - 1);
      if (edge || Math.abs(x - mid) < K / 2 + 0.01 || x === mid) main.pxN(x, y, shade(item.accent, edge ? 1 : 0.9));
    }
  } else if (item.style === "plain") {
    // Leather: a darker belt line along the bottom row and stitch dots
    const maxY = Math.max(...pts.map(([, y]) => y));
    for (const [x, y] of pts) if (y >= maxY - K && y < maxY) main.pxN(x, y, shade(item.color, 0.6));
    for (const [x, y] of pts) if (y === maxY - 4 * K && Math.floor(x / K) % 2 === 0) main.pxN(x, y, item.accent);
  }
}

function shoes(item: GearDef, main: Canvas, pts: [number, number, number][], p: Pose) {
  // Per column, the bottom rows of the leg are the boot
  const rows = (item.tier === 1 ? 3 : 4) * K;
  const bottom = new Map<number, number>();
  for (const [x, y] of pts) bottom.set(x, Math.max(bottom.get(x) ?? -1, y));
  const boot = pts.filter(([x, y]) => y > bottom.get(x)! - rows);
  recolour(main, boot, item.color);
  // Cuff in the accent colour
  for (const [x, y] of boot) if (y < bottom.get(x)! - rows + 1 + K) main.pxN(x, y, item.accent);
  if (item.style === "wings") {
    const xs = [...bottom.keys()].sort((a, b) => a - b);
    if (!xs.length) return;
    const cuff = (x: number) => bottom.get(x)! - rows + 1;
    const wing = (x: number, dx: number) => {
      const y = cuff(x);
      for (const [wx, wy] of [[dx, 0], [dx, -1], [2 * dx, -1], [2 * dx, -2]]) if (!main.alpha(x + wx, y + wy)) main.pxN(x + wx, y + wy, 0xffffff);
    };
    if (p.dir === "right") wing(xs[0], -1);
    else { wing(xs[0], -1); wing(xs[xs.length - 1], 1); }
  }
}

function hat(item: GearDef, main: Canvas, mask: Canvas, pts: [number, number, number][]) {
  const ys = pts.map(([, y]) => y);
  const y0 = Math.min(...ys), y1 = Math.max(...ys), h = y1 - y0 + 1;
  // Row extents of the whole head (mask), so brims/crowns sit on the real silhouette
  const span = (y: number) => {
    let a = 999, b = -1;
    for (let x = 0; x < mask.w; x++) if (mask.alpha(x, y) > 200) { a = Math.min(a, x); b = Math.max(b, x); }
    return [a, b] as const;
  };
  if (item.style === "crown") {
    // First row where the head is wide enough to wear a crown (wizard hats are pointy)
    let y = y0;
    while (y < y1 && span(y)[1] - span(y)[0] < 6 * K) y++;
    const [a, b] = span(y);
    for (let x = a; x <= b; x++) for (let j = 0; j < 2 * K; j++) main.pxN(x, y + j, shade(item.color, j < K ? 1.15 : 0.8));
    const mid = Math.round((a + b) / 2);
    for (const [x, t] of [[a, 1], [mid, 2], [b, 1]] as const) for (let k = 1; k <= t * K; k++) for (let i = 0; i < K; i++) main.pxN(x + (x === b ? -i : i) - (x === mid ? K >> 1 : 0), y - k, shade(item.color, k > (t - 1) * K ? 1.25 : 1));
    for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) main.pxN(mid - (K >> 1) + i, y + K + j, item.accent);
    return;
  }
  const rows = Math.max(3 * K, Math.round(h * (item.style === "helm" ? 0.5 : 0.35)));
  recolour(main, pts.filter(([, y]) => y < y0 + rows), item.color);
  // Brim one pixel wider than the head
  const by = y0 + rows - 1, [a, b] = span(by);
  for (let x = a - K; x <= b + K; x++) for (let j = 0; j < K; j++) main.pxN(x, by - j, shade(item.color, 0.7));
  if (item.style === "helm") {
    // Ridge on top
    const [ta, tb] = span(y0), mid = Math.round((ta + tb) / 2);
    for (let i = 0; i < K; i++) { for (let j = 1; j <= K; j++) main.pxN(mid + i, y0 - j, item.accent); main.pxN(mid + i, y0, shade(item.color, 1.3)); }
  } else {
    // Feather sticking up from one side
    const [ta] = span(y0 + K);
    for (const [dx, dy] of [[0, -1], [-1, -2], [-1, -3], [-2, -4]]) for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) if (i + j < K + 1) main.pxN(ta + dx * K + i, y0 + K + dy * K + j, item.accent);
  }
}

/** Shield: recolour the knight's own shield, or strap a new one to everybody else's far arm. */
function shield(item: GearDef, main: Canvas, mask: Canvas, p: Pose, g: GearCtx) {
  if (g.hasShield) {
    const pts = visible(main, mask);
    const set = new Set(pts.map(([x, y]) => `${x},${y}`));
    recolour(main, pts, item.color);
    for (const [x, y] of pts) if (!set.has(`${x - 1},${y}`) || !set.has(`${x + 1},${y}`) || !set.has(`${x},${y - 1}`)) main.pxN(x, y, item.accent);
    return;
  }
  const c = shade(item.color, 1), dk = shade(item.color, 0.72), rim = item.accent;
  if (p.dir === "right") {
    // Edge-on, held in front
    const x = 19 + g.ux + (p.attack === 0 ? 1 : 0), y = 16 + g.uy;
    main.rect(x, y, 3, 9, c); main.rect(x + 2, y, 1, 9, dk);
    main.rect(x, y, 3, 1, rim); main.rect(x, y + 8, 3, 1, rim);
    return;
  }
  // Facing: on the far arm (right of the body facing down, left facing up = on the back)
  const x = (p.dir === "down" ? 19 : 7) + g.ux, y = 17 + g.uy;
  if (item.style === "round") {
    main.ellipse(x + 3, y + 3.5, 3, 3.5, c);
    for (let a = 0; a < 360; a += 12) main.px(x + 3 + Math.cos(a * Math.PI / 180) * 3.2, y + 3.5 + Math.sin(a * Math.PI / 180) * 3.7, rim);
    main.rect(x + 2, y + 3, 2, 2, shade(rim, 1.2));
  } else {
    main.box(x, y, 6, 7, c);
    main.rect(x + 1, y + 7, 4, 1, c); main.rect(x + 2, y + 8, 2, 1, c);
    main.rect(x, y, 6, 1, rim); main.rect(x, y, 1, 7, rim); main.rect(x + 5, y, 1, 7, rim);
    main.px(x + 1, y + 7, rim); main.px(x + 4, y + 7, rim); main.px(x + 2, y + 8, rim); main.px(x + 3, y + 8, rim);
    if (p.dir === "down") { main.rect(x + 2, y + 2, 2, 3, rim); main.rect(x + 1, y + 3, 4, 1, rim); }
  }
}

/** Secondary ranged weapon worn on the body: a strap across the torso and the item at the hip / on the back. */
function ranged(item: GearDef, main: Canvas, p: Pose, g: GearCtx) {
  const X = (x: number) => x + g.ux, Y = (y: number) => y + g.uy;
  const strap = shade(item.accent, 0.75);
  if (p.dir === "down") main.line(X(11), Y(16), X(19), Y(22), strap);
  else if (p.dir === "up") main.line(X(20), Y(16), X(12), Y(22), strap);
  const glyph = (x: number, y: number) => {
    if (item.style === "sling") {
      main.rect(x, y, 2, 2, item.color); main.px(x, y + 2, shade(item.color, 0.7)); main.px(x + 1, y - 1, item.accent);
    } else if (item.style === "knives") {
      for (const dx of [0, 2]) { main.rect(x + dx, y, 1, 2, item.color); main.px(x + dx, y + 2, item.accent); }
    } else {
      main.rect(x - 2, y, 6, 1, item.accent); main.rect(x, y - 1, 2, 4, item.color); main.px(x - 2, y + 1, item.accent); main.px(x + 3, y + 1, item.accent);
    }
  };
  if (p.dir === "down") glyph(X(item.style === "crossbow" ? 10 : 19), Y(item.style === "crossbow" ? 14 : 21));
  else if (p.dir === "up") glyph(X(item.style === "crossbow" ? 15 : 12), Y(item.style === "crossbow" ? 18 : 21));
  else glyph(X(item.style === "crossbow" ? 11 : 12), Y(item.style === "crossbow" ? 17 : 20));
}

/** Plain-minus-geared difference: only the changed pixels. */
function diff(plain: Canvas, geared: Canvas): Canvas {
  const out = new Canvas(plain.w, plain.h);
  for (let i = 0; i < plain.data.length; i += 4) {
    const same = plain.data[i] === geared.data[i] && plain.data[i + 1] === geared.data[i + 1] &&
      plain.data[i + 2] === geared.data[i + 2] && plain.data[i + 3] === geared.data[i + 3];
    if (!same && geared.data[i + 3]) out.data.set(geared.data.subarray(i, i + 4), i);
  }
  return out;
}

// ---- 16x16 icons (menu + ground drops) -------------------------------------
const ICONS: Record<string, string[]> = {
  long: [
    "...............L", "..............LM", ".............LMD", "............LMD.", "...........LMD..", "..........LMD...",
    ".........LMD....", "........HHD.....", ".......HH.......", "......HH........", ".....HH.........", "....HH..........",
    "...HH...........", "..HH............", ".PP.............", "PP..............",
  ],
  round: [
    "................", ".....AAAAAA.....", "....ALLLLLLA....", "...ALLLLLLLLA...", "..ALLLLLLLLLLA..", "..ALLLLMMLLLLA..",
    "..ALLLMAAMLLLA..", "..ALLLMAAMLLLA..", "..ALLLLMMLLLLA..", "..ALLLLLLLLLMA..", "...ALLLLLLLMA...", "....ADMMMMDA....",
    ".....AAAAAA.....", "................", "................", "................",
  ],
  kite: [
    "................", "..AAAAAAAAAAAA..", "..ALLLLAALLLLA..", "..ALLLLAALLLLA..", "..ALLLLAALLLLA..", "..AAAAAAAAAAAA..",
    "..ALLLLAALLLMA..", "..ALLLLAALLLMA..", "...ALLLAALLMA...", "...ALLLAALLMA...", "....ALLAALMA....", ".....ALAAMA.....",
    "......AAAA......", ".......AA.......", "................", "................",
  ],
  sling: [
    "................", "................", "..A.........A...", "...A.......A....", "....A.....A.....", ".....A...A......",
    "......LLLL......", ".....LMMMML.....", ".....LMDDML.....", "......LLLL......", "................", "..........MMM...",
    ".........MDDDM..", ".........MDDDM..", "..........MMM...", "................",
  ],
  knives: [
    "................", "...L....L....L..", "...L....L....L..", "..LM...LM...LM..", "..LM...LM...LM..", "..LM...LM...LM..",
    "..LM...LM...LM..", "..LM...LM...LM..", ".AAAA.AAAA.AAAA.", "..HH...HH...HH..", "..HH...HH...HH..", "..HH...HH...HH..",
    "..DD...DD...DD..", "................", "................", "................",
  ],
  crossbow: [
    "................", "...AAAA..AAAA...", "..A....LL....A..", ".A.....LL.....A.", "A......LL......A", ".......LL.......",
    "......PLLP......", ".......LL.......", ".......LL.......", ".......MM.......", "......MMMM......", "......MDDM......",
    "......MDDM......", ".......MM.......", "................", "................",
  ],
  weapon: [
    "..............LL", ".............LML", "............LMD.", "...........LMD..", "..........LMD...", ".........LMD....",
    "........LMD.....", "...A...LMD......", "...AA.LMD.......", "....AAMD........", ".....AA.........", "....HHAA........",
    "...HH..AA.......", "..HH............", ".PP.............", "PP..............",
  ],
  armour: [
    "................", "...MM......MM...", "..MLLM....MLLM..", ".MLLLLMMMMLLLLM.", ".MLLLLLLLLLLLLM.", ".MMLLLLLLLLLLMM.",
    "..MMLLLLLLLLMM..", "...MLLLAALLLM...", "...MLLLAALLLM...", "...MLLLLLLLLM...", "...MLLLLLLLLM...", "...MLLLLLLLLM...",
    "...MDDDDDDDDM...", "...MLLLLLLLLM...", "....MMMMMMMM....", "................",
  ],
  shoes: [
    "................", "................", "....AAAAA.......", "....MLLLM.......", "....MLLLM.......", "....MLLLM.......",
    "....MLLLM.......", "....MLLLM.......", "....MLLLM.......", "....MLLLLMM.....", "...MLLLLLLLMM...", "...MLLLLLLLLLM..",
    "...MLLLLLLLLLM..", "...DDDDDDDDDDD..", "................", "................",
  ],
  hat: [
    "................", "................", "...........A....", "..........A.....", ".....MMMMA......", "....MLLLLAM.....",
    "...MLLLLLLLM....", "...MLLLLLLLM....", "...MLLLLLLLM....", "..DDDDDDDDDDD...", ".DDDDDDDDDDDDD..", "................",
    "................", "................", "................", "................",
  ],
  helm: [
    "................", "................", ".......A........", "......MLM.......", ".....MLLLM......", "....MLLLLLM.....",
    "...MLLLLLLLM....", "...MLLLLLLLM....", "...MDDDDDDDM....", "...ML.DDD.LM....", "...ML..D..LM....", "...MLL.D.LLM....",
    "....MM...MM.....", "................", "................", "................",
  ],
  crown: [
    "................", "................", "................", "...L...L...L....", "...LL.LLL.LL....", "...LLLLLLLLL....",
    "...LLLLLLLLL....", "...LLLLALLLL....", "...LLLLLLLLL....", "...DDDDDDDDD....", "................", "................",
    "................", "................", "................", "................",
  ],
};

function icon(item: GearDef): Canvas {
  const c = new HiCanvas(16, 16, K);
  const rows = item.slot === "hat" ? ICONS[item.style === "crown" ? "crown" : item.style === "helm" ? "helm" : "hat"]
    : item.slot === "shield" ? ICONS[item.style]
    : item.slot === "ranged" ? ICONS[item.style]
    : item.slot === "weapon" && item.style.startsWith("long") ? ICONS.long
    : ICONS[item.slot];
  c.sprite(0, 0, rows, {
    L: shade(item.color, 1.1), M: shade(item.color, 0.8), D: shade(item.color, 0.55), A: item.accent,
    H: 0x6b4226, P: shade(item.accent, 0.8),
  });
  c.rim();
  c.selout(0x1a1420);
  if (item.tier === 3) for (const [x, y] of [[1, 1], [14, 3], [2, 12]]) c.px(x, y, 0xffffff, 200);
  return c;
}

export function buildGear(out: string) {
  mkdirSync(out, { recursive: true });
  const frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> = {};
  const S = 16 * K;
  const atlas = new Canvas(S * GEAR_IDS.length, S);
  GEAR_IDS.forEach((id, i) => {
    atlas.blit(icon(GEAR[id]), i * S, 0);
    frames[id] = { frame: { x: i * S, y: 0, w: S, h: S } };
  });
  atlas.save(`${out}/icons.png`);
  writeFileSync(`${out}/icons.json`, JSON.stringify({ frames, meta: { image: "icons.png", size: { w: atlas.w, h: S }, scale: 1 } }, null, 1));

  for (const hero of HEROES) {
    setGearHook(null);
    const plain = buildSheet(hero);
    for (const id of GEAR_IDS) {
      setGearHook(hook(GEAR[id]));
      diff(plain, buildSheet(hero)).save(`${out}/${hero.name}_${id}.png`);
    }
  }
  setGearHook(null);
  writeFileSync(`${out}/gear.json`, JSON.stringify({ heroes: HEROES.map((h) => h.name), items: GEAR_IDS, image: "{hero}_{item}.png" }, null, 1));
}
