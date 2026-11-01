import { mkdirSync, writeFileSync } from "node:fs";
import { Canvas, shade } from "./canvas";
import { buildSheet, GearPart, HEROES, Pose, setGearHook } from "./characters";
import { GEAR, GEAR_IDS, GearDef } from "../../shared/gear";

/**
 * Gear overlays. For every hero and item we render the full hero sheet again with that item "worn"
 * (the item recolours the matching body part, see the hook below), then keep only the pixels that differ
 * from the plain sheet. The game draws that overlay on top of the hero, frame for frame.
 */

const PART_OF: Record<GearDef["slot"], GearPart> = { weapon: "weapon", armour: "torso", shoes: "legs", hat: "head" };

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
    main.px(x, y, shade(col, f));
  }
}

function hook(item: GearDef) {
  return (part: GearPart, main: Canvas, mask: Canvas, p: Pose) => {
    if (PART_OF[item.slot] !== part) return;
    const pts = visible(main, mask);
    if (!pts.length) return;
    if (item.slot === "weapon") weapon(item, main, mask, pts);
    else if (item.slot === "armour") armour(item, main, pts);
    else if (item.slot === "shoes") shoes(item, main, pts, p);
    else hat(item, main, mask, pts);
  };
}

function weapon(item: GearDef, main: Canvas, mask: Canvas, pts: [number, number, number][]) {
  recolour(main, pts, item.color);
  if (item.style !== "glow") return;
  // Soft glow around the whole weapon, only on empty pixels
  for (let y = 0; y < mask.h; y++) for (let x = 0; x < mask.w; x++) {
    if (mask.alpha(x, y) || main.alpha(x, y)) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => mask.alpha(x + dx, y + dy) > 200)) main.px(x, y, item.accent, 110);
  }
}

function armour(item: GearDef, main: Canvas, pts: [number, number, number][]) {
  const set = new Set(pts.map(([x, y]) => `${x},${y}`));
  const has = (x: number, y: number) => set.has(`${x},${y}`);
  recolour(main, pts, item.color, item.style === "mail" ? (x, y) => ((x + y) % 2 ? 0.86 : 1.06) : undefined);
  if (item.style === "trim") {
    // Gold edges and a centre stripe
    const xs = pts.map(([x]) => x), mid = Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
    for (const [x, y] of pts) {
      const edge = !has(x - 1, y) || !has(x + 1, y) || !has(x, y - 1);
      if (edge || x === mid) main.px(x, y, shade(item.accent, edge ? 1 : 0.9));
    }
  } else if (item.style === "plain") {
    // Leather: a darker belt line along the bottom row and stitch dots
    const maxY = Math.max(...pts.map(([, y]) => y));
    for (const [x, y] of pts) if (y === maxY - 1) main.px(x, y, shade(item.color, 0.6));
    for (const [x, y] of pts) if (y === maxY - 4 && x % 2 === 0) main.px(x, y, item.accent);
  }
}

function shoes(item: GearDef, main: Canvas, pts: [number, number, number][], p: Pose) {
  // Per column, the bottom rows of the leg are the boot
  const rows = item.tier === 1 ? 3 : 4;
  const bottom = new Map<number, number>();
  for (const [x, y] of pts) bottom.set(x, Math.max(bottom.get(x) ?? -1, y));
  const boot = pts.filter(([x, y]) => y > bottom.get(x)! - rows);
  recolour(main, boot, item.color);
  // Cuff in the accent colour
  for (const [x, y] of boot) if (y === bottom.get(x)! - rows + 1) main.px(x, y, item.accent);
  if (item.style === "wings") {
    const xs = [...bottom.keys()].sort((a, b) => a - b);
    if (!xs.length) return;
    const cuff = (x: number) => bottom.get(x)! - rows + 1;
    const wing = (x: number, dx: number) => {
      const y = cuff(x);
      for (const [wx, wy] of [[dx, 0], [dx, -1], [2 * dx, -1], [2 * dx, -2]]) if (!main.alpha(x + wx, y + wy)) main.px(x + wx, y + wy, 0xffffff);
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
    let a = 99, b = -1;
    for (let x = 0; x < mask.w; x++) if (mask.alpha(x, y) > 200) { a = Math.min(a, x); b = Math.max(b, x); }
    return [a, b] as const;
  };
  if (item.style === "crown") {
    // First row where the head is wide enough to wear a crown (wizard hats are pointy)
    let y = y0;
    while (y < y1 && span(y)[1] - span(y)[0] < 6) y++;
    const [a, b] = span(y);
    for (let x = a; x <= b; x++) { main.px(x, y, shade(item.color, 1.15)); main.px(x, y + 1, shade(item.color, 0.8)); }
    const mid = Math.round((a + b) / 2);
    for (const [x, t] of [[a, 1], [mid, 2], [b, 1]] as const) for (let k = 1; k <= t; k++) main.px(x, y - k, shade(item.color, k === t ? 1.25 : 1));
    main.px(mid, y + 1, item.accent);
    return;
  }
  const rows = Math.max(3, Math.round(h * (item.style === "helm" ? 0.5 : 0.35)));
  recolour(main, pts.filter(([, y]) => y < y0 + rows), item.color);
  // Brim one pixel wider than the head
  const by = y0 + rows - 1, [a, b] = span(by);
  for (let x = a - 1; x <= b + 1; x++) main.px(x, by, shade(item.color, 0.7));
  if (item.style === "helm") {
    // Ridge on top
    const [ta, tb] = span(y0), mid = Math.round((ta + tb) / 2);
    main.px(mid, y0 - 1, item.accent); main.px(mid, y0, shade(item.color, 1.3));
  } else {
    // Feather sticking up from one side
    const [ta] = span(y0 + 1);
    for (const [dx, dy] of [[0, -1], [-1, -2], [-1, -3], [-2, -4]]) main.px(ta + dx, y0 + 1 + dy, item.accent);
  }
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
const ICONS: Record<GearDef["slot"] | "crown" | "helm", string[]> = {
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
  const c = new Canvas(16, 16);
  const rows = item.slot === "hat" ? ICONS[item.style === "crown" ? "crown" : item.style === "helm" ? "helm" : "hat"] : ICONS[item.slot];
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
  const atlas = new Canvas(16 * GEAR_IDS.length, 16);
  GEAR_IDS.forEach((id, i) => {
    atlas.blit(icon(GEAR[id]), i * 16, 0);
    frames[id] = { frame: { x: i * 16, y: 0, w: 16, h: 16 } };
  });
  atlas.save(`${out}/icons.png`);
  writeFileSync(`${out}/icons.json`, JSON.stringify({ frames, meta: { image: "icons.png", size: { w: atlas.w, h: 16 }, scale: 1 } }, null, 1));

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
