/**
 * Songweaver item art, pixel icons painted in code (no DOM or Phaser here, so tools/art can import it):
 *  - the books (shield slot): `songweaver_shield` (the Songbook), `bk_hymnal`, `bk_march`, `bk_dissonance`, 16x16;
 *  - the lute-maker's materials `mat_<id>` (tonewood, brass, bone, silk, horn, sunglass), 16x16. The same frame is the
 *    inventory icon, the pickup pop and the ground drop (gear drops draw the gear_icons atlas frame of their id);
 *  - the lute traits `trait_<id>` (steel, gut, silk, wide, deep, horn, bright, dark, bonepegs), 12x12.
 * `songItemIcon(id)` gives the colours; `songItemUrl(id)` (browser) a data URL; tools/art/gear.ts adds every id to the
 * gear atlas. Ids follow docs/songweaver-di-plan.md "Interface contract".
 */
export interface SongItemIcon { n: number; cols: string[] }

const ICON_N = 16, TRAIT_N = 12;
const OUT = "#1b120a";

const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const toHex = (v: number[]) => "#" + v.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
/** Mix `a` toward `b` by t. */
const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
type Ramp = [string, string, string, string];
/** dark, mid, light, highlight from a base colour. */
const ramp = (base: string): Ramp => [mix(base, "#000000", 0.55), mix(base, "#000000", 0.22), base, mix(base, "#ffffff", 0.55)];

class Mini {
  g: string[];
  constructor(public n: number) { this.g = new Array(n * n).fill(""); }
  px(x: number, y: number, c: string) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.n && y < this.n) this.g[y * this.n + x] = c; }
  rect(x: number, y: number, w: number, h: number, c: string) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  line(x0: number, y0: number, x1: number, y1: number, c: string) {
    const k = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= k; i++) this.px(x0 + (x1 - x0) * i / k, y0 + (y1 - y0) * i / k, c);
  }
  /** Ellipse filled by `fn(dx, dy)` (dx, dy in -1..1) so shapes can be shaded. */
  oval(cx: number, cy: number, rx: number, ry: number, fn: (dx: number, dy: number) => string | undefined) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const c = fn(dx, dy);
      if (c) this.px(x, y, c);
    }
  }
  /** A thick stroke whose width tapers from w0 to w1, shaded across its width (k: light on the upper-left side). */
  stroke(x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, k: Ramp) {
    const L = Math.hypot(x1 - x0, y1 - y0), steps = Math.ceil(L * 2);
    const nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, w = w0 + (w1 - w0) * t, cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
      for (let s = -w / 2; s <= w / 2 + 0.01; s += 0.5) {
        const u = w > 0 ? s / (w / 2) : 0; // -1 (upper-left) .. 1 (lower-right)
        this.px(cx + nx * s, cy + ny * s, u < -0.45 ? k[3] : u < 0.15 ? k[2] : u < 0.7 ? k[1] : k[0]);
      }
    }
  }
  /** Dark 1px outline round everything drawn. */
  outline(c = OUT) {
    const src = this.g.slice(), n = this.n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (src[y * n + x]) continue;
      const at = (i: number, j: number) => i >= 0 && j >= 0 && i < n && j < n && src[j * n + i];
      if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) this.g[y * n + x] = c;
    }
  }
  done(): SongItemIcon { return { n: this.n, cols: this.g }; }
}

// ---- books -----------------------------------------------------------------------------------------------
interface BookArt { cover: string; trim: string; page: string; em: string; hi: string; mark: string[] }
// 7x7 emblems: e emblem, h highlight, k dark (a sound hole, a crack)
const BOOK_ART: Record<string, BookArt> = {
  songweaver_shield: {
    cover: "#8a5a2c", trim: "#e8d070", page: "#e8e0c8", em: "#e8d070", hi: "#fff3b0",
    mark: ["......h", ".....e.", "....e..", "..ee...", ".eeke..", ".eeee..", "..ee..."],
  },
  bk_hymnal: {
    cover: "#f1e9d0", trim: "#e0a82c", page: "#fffdf3", em: "#e0a82c", hi: "#fff0a8",
    mark: ["...e...", ".e.e.e.", "..eee..", "eeehee.", "..eee..", ".e.e.e.", "...e..."],
  },
  bk_march: {
    cover: "#a8402a", trim: "#d9a93a", page: "#e8dcc0", em: "#f0d9a0", hi: "#ffffff",
    mark: ["e.....e", ".e...e.", "..e.e..", ".hhhhh.", "eeeeeee", "e.e.e.e", ".eeeee."],
  },
  bk_dissonance: {
    cover: "#5a2a8c", trim: "#b890f0", page: "#d8d0e8", em: "#e6d0ff", hi: "#ffffff",
    mark: ["...eh.k", "..e.eke", "..e.ke.", "...ke..", ".eekk..", ".e.ke.e", "..ee.k."],
  },
};
function bookIcon(a: BookArt): SongItemIcon {
  const p = new Mini(ICON_N), cv = ramp(a.cover);
  p.rect(2, 1, 12, 13, cv[2]);
  p.rect(5, 1, 9, 1, cv[3]); // lit top edge
  p.rect(12, 2, 2, 12, cv[1]); p.rect(13, 2, 1, 12, cv[0]); // shaded right side
  p.rect(2, 1, 3, 13, cv[1]); p.rect(4, 2, 1, 11, cv[3]); // the spine band, a ridge beside it
  p.rect(3, 14, 10, 1, a.page); p.rect(3, 15, 10, 1, mix(a.page, "#000000", 0.35)); // the page block under the cover
  p.rect(5, 3, 7, 1, a.trim); p.rect(5, 12, 7, 1, a.trim); // trim bands
  p.px(2, 1, a.trim); p.px(13, 1, a.trim); p.px(2, 13, a.trim); p.px(13, 13, a.trim); // corners
  a.mark.forEach((row, j) => [...row].forEach((ch, i) => {
    const c = ch === "e" ? a.em : ch === "h" ? a.hi : ch === "k" ? "#1d0c10" : "";
    if (c) p.px(5 + i, 4 + j, c);
  }));
  p.outline();
  return p.done();
}

// ---- materials -------------------------------------------------------------------------------------------
const MATS: Record<string, () => SongItemIcon> = {
  // tonewood: a split log, bark on the side and the ringed end towards us
  tonewood: () => {
    const p = new Mini(16), bark = ramp("#7a4f2a"), cut = ramp("#d9a868");
    p.oval(6, 9, 5.5, 5, (dx, dy) => dy < -0.45 ? bark[3] : dy < 0.1 ? bark[2] : dy < 0.65 ? bark[1] : bark[0]);
    for (const y of [7, 9, 11]) p.line(2, y, 8, y, bark[0]);
    p.oval(10, 8, 3.5, 5.5, (dx, dy) => (Math.hypot(dx * 0.9, dy) > 0.82 ? cut[1] : cut[Math.hypot(dx * 0.9, dy) < 0.5 ? 3 : 2]));
    p.oval(10, 8, 2, 3.2, (dx, dy) => (Math.hypot(dx, dy) > 0.78 ? cut[1] : undefined));
    p.px(10, 8, cut[0]); p.px(10, 7, cut[0]);
    p.px(14, 13, cut[2]); p.px(3, 14, cut[2]); p.px(12, 14, cut[1]); // sawdust
    p.outline();
    return p.done();
  },
  // brass: two stacked ingots, a bright top face and a glint
  brass: () => {
    const p = new Mini(16), k = ramp("#c89c44");
    const bar = (x: number, y: number, w: number) => {
      p.rect(x + 2, y, w, 2, k[3]); // top face, set back
      p.rect(x, y + 2, w, 4, k[2]); p.rect(x, y + 5, w, 1, k[1]);
      p.rect(x + w, y + 1, 2, 5, k[0]); p.px(x + w, y, k[1]); p.px(x + w + 1, y + 1, k[1]);
      p.px(x, y + 2, k[3]); p.px(x + 1, y + 2, k[3]);
    };
    bar(2, 9, 9); bar(5, 3, 8);
    p.px(12, 5, "#ffffff"); p.px(4, 11, "#ffffff"); p.px(8, 5, k[3]);
    p.outline();
    return p.done();
  },
  // bone: a long bone with a knob at each end
  bone: () => {
    const p = new Mini(16), k = ramp("#e8dcc0");
    p.stroke(4, 12, 11, 5, 2.6, 2.6, k);
    for (const [x, y] of [[3.5, 12.5], [11.5, 4.5]] as const) {
      p.oval(x - 1.2, y - 0.4, 1.6, 1.6, (dx, dy) => (dx + dy < -0.2 ? k[3] : k[2]));
      p.oval(x + 0.6, y + 0.8, 1.6, 1.6, (dx, dy) => (dx + dy < -0.2 ? k[2] : k[1]));
    }
    p.px(8, 8, k[1]);
    p.outline();
    return p.done();
  },
  // silk: a skein of pale lilac thread with a gold tie, the ends hanging
  silk: () => {
    const p = new Mini(16), k = ramp("#c7a8f0");
    for (const [cx, rx] of [[7, 4.4], [9, 4.4]] as const) p.oval(cx, 9, rx, 5.6, (dx, dy) => (Math.hypot(dx, dy) > 0.62 ? (dx + dy < -0.2 ? k[3] : k[2]) : undefined));
    p.oval(8, 9, 2.4, 3.6, (dx, dy) => (Math.hypot(dx, dy) > 0.5 ? k[1] : undefined));
    p.rect(6, 3, 4, 2, "#e0b440"); p.px(6, 3, "#fff0a8"); p.px(9, 4, "#8a6820");
    p.line(7, 14, 6, 15, k[2]); p.line(9, 14, 10, 15, k[1]);
    p.px(12, 4, "#ffffff"); p.px(3, 12, k[3]);
    p.outline();
    return p.done();
  },
  // horn: a curved tusk of horn, banded, its tip dark
  horn: () => {
    const p = new Mini(16), k = ramp("#e6d4a4");
    // base at lower left, curving up and right
    const pts: [number, number][] = [[3, 13], [4, 10], [6, 7.5], [9, 5.5], [13, 4]];
    for (let i = 0; i < pts.length - 1; i++) p.stroke(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 5.4 - i * 1.3, 4.1 - i * 1.3, k);
    p.line(2, 14, 5, 12, k[0]); p.line(2, 12, 3, 12, k[0]); // the open base
    p.px(3, 12, "#7a5a3a"); p.px(4, 12, "#7a5a3a"); p.px(3, 13, "#7a5a3a");
    for (const [x, y] of [[5, 9], [7, 7]] as const) { p.px(x, y, k[0]); p.px(x + 1, y + 1, k[0]); } // growth bands
    p.px(13, 4, "#3a2a1a"); p.px(12, 4, "#6a5a40");
    p.outline();
    return p.done();
  },
  // sunglass: desert glass, an amber crystal full of light
  sunglass: () => {
    const p = new Mini(16), k = ramp("#ffb830");
    const shape: [number, number][] = [[8, 1], [13, 5], [12, 11], [8, 15], [4, 11], [3, 5]];
    const inside = (x: number, y: number) => {
      let c = false;
      for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
        const [xi, yi] = shape[i], [xj, yj] = shape[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (inside(x + 0.5, y + 0.5)) p.px(x, y, x + 0.5 < 8 ? (y < 7 ? k[3] : k[2]) : (y < 7 ? k[2] : k[1]));
    p.line(8, 2, 8, 14, k[1]); p.line(4, 6, 12, 6, k[2]); p.line(8, 6, 4, 11, k[1]); p.line(8, 6, 12, 11, k[0]);
    p.px(6, 4, "#ffffff"); p.px(5, 5, "#fff0b0"); p.px(6, 8, "#ffffff");
    p.outline();
    p.px(13, 1, "#ffffff"); p.px(14, 1, "#fff0b0"); p.px(13, 0, "#fff0b0"); p.px(13, 2, "#fff0b0"); p.px(12, 1, "#fff0b0");
    return p.done();
  },
};

// ---- lute traits (12x12) ---------------------------------------------------------------------------------
const sparkle = (p: Mini, x: number, y: number, c = "#fff0a8") => { p.px(x, y, "#ffffff"); p.px(x + 1, y, c); p.px(x - 1, y, c); p.px(x, y + 1, c); p.px(x, y - 1, c); };
const WOODY = ramp("#8a5a2c");
const lutebody = (p: Mini, cx: number, cy: number, rx: number, ry: number) => {
  p.oval(cx, cy, rx, ry, (dx, dy) => (dx + dy < -0.5 ? WOODY[3] : dx + dy < 0.2 ? WOODY[2] : dx + dy < 0.8 ? WOODY[1] : WOODY[0]));
  p.oval(cx, cy - ry * 0.1, rx * 0.28, ry * 0.28, () => "#1b0f06");
};
const TRAITS: Record<string, () => SongItemIcon> = {
  // steel strings: a taut string with a bounce, between two bridge posts
  steel: () => {
    const p = new Mini(12), k = ramp("#a9b8d0");
    p.rect(0, 8, 2, 3, WOODY[1]); p.rect(10, 8, 2, 3, WOODY[1]);
    p.line(1, 8, 4, 2, k[3]); p.line(4, 2, 7, 8, k[2]); p.line(7, 8, 10, 2, k[3]);
    p.px(4, 1, "#ffffff"); p.px(10, 1, k[3]); p.px(7, 9, k[1]);
    p.outline();
    return p.done();
  },
  // gut: a twisted cord in warm tan
  gut: () => {
    const p = new Mini(12), k = ramp("#d9b878");
    p.stroke(2, 10, 10, 2, 3.2, 3.2, k);
    for (let i = 0; i < 4; i++) { p.px(3 + i * 2, 9 - i * 2, k[0]); p.px(4 + i * 2, 9 - i * 2 - 1, k[3]); }
    p.px(10, 1, k[2]); p.px(1, 11, k[2]);
    p.outline();
    return p.done();
  },
  // silk strings (exotic): a lilac thread in a loop, a sparkle
  silk: () => {
    const p = new Mini(12), k = ramp("#c7a8f0");
    p.oval(5.5, 6.5, 4.3, 3.6, (dx, dy) => (Math.hypot(dx, dy) > 0.55 ? (dx + dy < -0.2 ? k[3] : k[2]) : undefined));
    p.line(8, 9, 11, 11, k[2]); p.line(3, 9, 1, 11, k[1]);
    p.outline();
    sparkle(p, 9, 2);
    return p.done();
  },
  // wide bowl: a broad flat body with arrows to both sides
  wide: () => {
    const p = new Mini(12);
    lutebody(p, 6, 6, 5, 3.4);
    p.outline();
    p.line(0, 11, 11, 11, "#ffd166"); p.px(1, 10, "#ffd166"); p.px(10, 10, "#ffd166"); // a double arrow under the body
    return p.done();
  },
  // deep bowl: a tall body, a down arrow for the low notes
  deep: () => {
    const p = new Mini(12);
    lutebody(p, 5, 5, 3.3, 4.4);
    p.outline();
    p.line(10, 3, 10, 9, "#4a90e2"); p.px(9, 8, "#4a90e2"); p.px(11, 8, "#4a90e2"); p.px(10, 10, "#4a90e2");
    return p.done();
  },
  // horn bowl (exotic): a curled horn, a sparkle
  horn: () => {
    const p = new Mini(12), k = ramp("#e6d4a4");
    const pts: [number, number][] = [[2, 10], [3, 7], [5, 5], [8, 3.5], [10, 3]];
    for (let i = 0; i < pts.length - 1; i++) p.stroke(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 3.8 - i * 0.8, 3 - i * 0.7, k);
    p.px(10, 3, "#3a2a1a"); p.px(2, 10, "#7a5a3a");
    p.outline();
    sparkle(p, 9, 8);
    return p.done();
  },
  // bright tuning: a small sun
  bright: () => {
    const p = new Mini(12), k = ramp("#ffd166");
    p.oval(5.5, 5.5, 2.8, 2.8, (dx, dy) => (dx + dy < -0.3 ? k[3] : k[2]));
    for (const [x, y] of [[5, 0], [6, 0], [5, 11], [6, 11], [0, 5], [0, 6], [11, 5], [11, 6], [1, 1], [10, 1], [1, 10], [10, 10]] as const) p.px(x, y, k[1]);
    p.outline("#6b4a12");
    return p.done();
  },
  // dark tuning: a crescent moon
  dark: () => {
    const p = new Mini(12), k = ramp("#8a6ad0");
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      if (Math.hypot(x - 5, y - 5.5) > 4.6 || Math.hypot(x - 7.8, y - 4.6) < 3.9) continue; // the disc minus a bite
      p.px(x, y, x + y < 8 ? k[3] : x + y < 11 ? k[2] : k[1]);
    }
    p.outline("#201040");
    p.px(9, 9, "#c8b8f0"); p.px(10, 3, "#ffffff");
    return p.done();
  },
  // bone pegs (exotic): two bone tuning pegs
  bonepegs: () => {
    const p = new Mini(12), k = ramp("#e8dcc0");
    for (const x of [3, 8]) { p.rect(x, 3, 2, 7, k[2]); p.rect(x, 3, 1, 7, k[3]); p.rect(x - 1, 1, 4, 2, k[2]); p.px(x - 1, 1, k[3]); p.px(x + 1, 9, k[1]); p.rect(x + 1, 3, 1, 7, k[1]); }
    p.outline();
    sparkle(p, 10, 10);
    return p.done();
  },
};

// ---- lookup ---------------------------------------------------------------------------------------------
export const MATERIAL_IDS = ["tonewood", "brass", "bone", "silk", "horn", "sunglass"] as const;
export const TRAIT_IDS = ["steel", "gut", "silk", "wide", "deep", "horn", "bright", "dark", "bonepegs"] as const;
export const BOOK_IDS = ["songweaver_shield", "bk_hymnal", "bk_march", "bk_dissonance"] as const;
/** Every id this module draws: books, `mat_<id>` and `trait_<id>`. */
export const SONG_ITEM_IDS: string[] = [...BOOK_IDS, ...MATERIAL_IDS.map((m) => "mat_" + m), ...TRAIT_IDS.map((t) => "trait_" + t)];

const cache = new Map<string, SongItemIcon | null>();
/** The icon for a book id, `mat_<material>` (or the bare material id) or `trait_<trait>`; undefined for anything else. */
export function songItemIcon(id: string): SongItemIcon | undefined {
  if (cache.has(id)) return cache.get(id) ?? undefined;
  let ic: SongItemIcon | undefined;
  if (BOOK_ART[id]) ic = bookIcon(BOOK_ART[id]);
  else if (id.startsWith("mat_") && MATS[id.slice(4)]) ic = MATS[id.slice(4)]();
  else if (id.startsWith("trait_") && TRAITS[id.slice(6)]) ic = TRAITS[id.slice(6)]();
  cache.set(id, ic ?? null);
  return ic;
}

/** Draws an icon into a 2D context at `size` px (nearest-neighbour blocks); false when the id is not ours. */
export function drawSongItem(ctx: CanvasRenderingContext2D, id: string, size: number): boolean {
  const ic = songItemIcon(id);
  if (!ic) return false;
  const k = size / ic.n;
  ic.cols.forEach((c, i) => { if (c) { ctx.fillStyle = c; ctx.fillRect(Math.floor((i % ic.n) * k), Math.floor(Math.floor(i / ic.n) * k), Math.ceil(k), Math.ceil(k)); } });
  return true;
}

const urls = new Map<string, string>();
/** Data URL of the icon at its own size (16 or 12 px) for <img> tags with `image-rendering: pixelated`; "" outside a browser or for an unknown id. */
export function songItemUrl(id: string): string {
  if (urls.has(id)) return urls.get(id)!;
  const ic = songItemIcon(id);
  if (!ic || typeof document === "undefined") return "";
  const c = document.createElement("canvas");
  c.width = ic.n; c.height = ic.n;
  const g = c.getContext("2d")!;
  ic.cols.forEach((col, i) => { if (col) { g.fillStyle = col; g.fillRect(i % ic.n, Math.floor(i / ic.n), 1, 1); } });
  const u = c.toDataURL();
  urls.set(id, u);
  return u;
}
