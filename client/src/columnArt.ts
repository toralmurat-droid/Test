/**
 * Art for the clan war roads and marching columns (W4): the column pennant, the crossed-swords clash glyph, the road
 * dash style, the waygate glyph and the trampled-track ground decal. Small code-drawn sprites in the style of
 * warMap.ts's pixel icons (1 art px = 1 canvas unit: scale the context for the map, nearest-neighbour). Cosmetic only;
 * the functions take a plain 2D context so they run in the browser and in tools/art/preview/war-roads-sheet.ts.
 */
import { TILE } from "../../shared/constants";
import { CLANS, type ClanKey } from "../../shared/war/clans";

const INK = "#0d0a07";
/** Bright map colours per clan (same as CLAN_COL in warMap.ts, repeated so this file stays free of the map code). */
const MAP_COL: Record<ClanKey, string> = { wardens: "#e08a2a", redfang: "#d03a2a", host: "#5fb0a0", hidekin: "#a0703a", veiled: "#7a7aff" };
const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");

/** Pennant art size in art px (the widest, long variant). */
export const COLUMN_ICON = { w: 11, h: 9 } as const;
/** Trailing banner length (art px) for a short, medium and long column. */
const TAIL = [1, 2, 4] as const;
/** 0 short (1-3 soldiers), 1 medium (4-5), 2 long (6 and more). */
export function columnSizeClass(soldiers: number): 0 | 1 | 2 { return soldiers <= 3 ? 0 : soldiers <= 5 ? 1 : 2; }

type Pix = Map<string, string>;
/** Paints a pixel map with a 1 px ink outline round it. */
function blit(ctx: CanvasRenderingContext2D, x: number, y: number, pix: Pix) {
  const at = (px: number, py: number) => pix.has(px + "," + py);
  ctx.fillStyle = INK;
  for (const k of pix.keys()) {
    const [px, py] = k.split(",").map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!at(px + dx, py + dy)) ctx.fillRect(x + px + dx, y + py + dy, 1, 1);
  }
  for (const [k, c] of pix) { const [px, py] = k.split(",").map(Number); ctx.fillStyle = c; ctx.fillRect(x + px, y + py, 1, 1); }
}

/**
 * A marching-column pennant at (x, y) (top-left), 11x9 art px with its outline. `soldiers` picks the trailing banner:
 * short (1-3), medium (4-5) or long (6+); pass a class 0..2 via columnSizeClass if you have it. Cloth is the clan's map
 * colour, the trim and sigil come from its banner colours.
 */
export function drawColumnIcon(ctx: CanvasRenderingContext2D, x: number, y: number, clan: ClanKey, soldiers = 4) {
  const c = CLANS[clan], cloth = MAP_COL[clan], trim = hex(c.trim), sigil = hex(c.sigil);
  const tail = TAIL[columnSizeClass(soldiers)], pix: Pix = new Map(), set = (px: number, py: number, col: string) => pix.set(px + "," + py, col);
  for (let py = 1; py <= 7; py++) set(1, py, py === 1 ? "#e8dcc0" : "#8a7a64"); // pole and spearhead
  for (let py = 1; py <= 4; py++) for (let px = 2; px <= 5; px++) set(px, py, py === 1 ? trim : cloth); // flag
  set(3, 3, sigil); set(4, 3, sigil); // sigil
  set(5, 4, cloth);
  for (let i = 0; i < tail; i++) { set(6 + i, 2, i % 2 ? cloth : trim); set(6 + i, 3 + (i === tail - 1 && tail > 2 ? 1 : 0), cloth); } // trailing banner
  set(0, 7, "#5a4a38"); set(2, 7, "#5a4a38"); // planted foot
  blit(ctx, x, y, pix);
}

/** Crossed swords (9x9 art px incl. outline): where two columns clash on the map. */
export function drawClashIcon(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const pix: Pix = new Map();
  for (let i = 0; i < 7; i++) {
    const hilt = i >= 5, blade = i <= 1 ? "#ffffff" : "#cfd6dc";
    pix.set(`${1 + i},${1 + i}`, hilt ? "#c9962f" : blade);
    pix.set(`${7 - i},${1 + i}`, hilt ? "#c9962f" : blade);
  }
  pix.set("4,4", "#f0b44a"); // crossing
  pix.set("0,7", "#7a4a22"); pix.set("8,7", "#7a4a22"); // pommels
  pix.set("2,6", "#c9962f"); pix.set("6,6", "#c9962f");
  blit(ctx, x, y, pix);
}

/** How the war roads are stroked on the world map (tan dashes) and the minimap (faint, thin). */
export const ROAD_STYLE = {
  color: "#d2b077", shade: "rgba(13,10,7,0.55)", dash: [5, 3] as number[], width: 2,
  /** The straight "track" for a pair of Holds that no route links: sparser dashes. */
  track: { color: "#b39668", dash: [2, 4] as number[], width: 1.5 },
  mini: { color: "rgba(210,176,119,0.55)", dash: [3, 2] as number[], width: 1 },
  /** Gate glyph size in art px. */
  gate: 7,
  /** Sets the stroke for a road polyline: `kind` "road" (default), "track" or "mini". Call setLineDash([]) afterwards. */
  apply(g: CanvasRenderingContext2D, kind: "road" | "track" | "mini" = "road") {
    const s = kind === "road" ? this : this[kind];
    g.strokeStyle = s.color; g.lineWidth = s.width; g.setLineDash(s.dash); g.lineCap = "butt"; g.lineJoin = "round";
  },
};

/** The waygate glyph (7x7 art px with outline) for the end of a road leg: a small stone arch with a dark opening. */
export function drawGateGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, clan?: ClanKey) {
  const pix: Pix = new Map(), stone = "#b8a888", dark = "#2a1f16", top = clan ? MAP_COL[clan] : "#e8dcc0";
  for (let py = 1; py <= 5; py++) for (let px = 1; px <= 5; px++) pix.set(`${px},${py}`, stone);
  for (let px = 1; px <= 5; px++) pix.set(`${px},1`, top);
  for (let py = 3; py <= 5; py++) pix.set(`3,${py}`, dark);
  pix.set("2,3", dark); pix.set("4,3", dark); pix.set("3,2", dark);
  pix.set("2,3", stone); pix.set("4,3", stone);
  blit(ctx, x, y, pix);
}

// ---------- trampled track ground decal ----------

export const TRACK_VARIANTS = 4;
/**
 * One 32 px variant of the trampled track at (ox, 0): two wheel ruts and flattened, scuffed ground running left to
 * right, joined at both edges so tiles line up (rotate for other directions). Transparent around, so it lays over grass.
 */
export function drawTrackVariant(ctx: CanvasRenderingContext2D, ox: number, v: number, oy = 0) {
  let s = v * 7919 + 4243; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const px = (x: number, y: number, c: string, a = 1) => { if (x < 0 || y < 0 || x >= TILE || y >= TILE) return; ctx.globalAlpha = a; ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, 1, 1); };
  const wob = (x: number, n: number, amp: number) => Math.round(Math.sin(Math.PI * n * x / (TILE - 1)) * amp); // 0 at both edges
  const n1 = 1 + (v % 2), n2 = 1 + ((v + 1) % 2), a1 = 2 + (v >> 1), a2 = 2 + ((v + 1) >> 1);
  // trampled bed between the ruts
  for (let x = 0; x < TILE; x++) {
    const c1 = 11 + wob(x, n1, a1), c2 = 20 + wob(x, n2, a2);
    for (let y = c1 - 1; y <= c2 + 1; y++) if (r() < 0.45) px(x, y, "#7a5e38", 0.35);
    for (const [c, sgn] of [[c1, 1], [c2, -1]] as [number, number][]) {
      px(x, c - 1, "#6a5030", 0.7); px(x, c, "#3e2e1b", 0.95); px(x, c + 1, "#4f3a22", 0.85); // rut: edge, dark floor, far lip
      px(x, c + 2 * sgn * -1 + (sgn > 0 ? -1 : 1), "#9a7a4c", 0.5); // lit lip
      if (r() < 0.35) px(x, c, "#2b1f12", 1);
    }
  }
  // scuffs, pebbles, torn grass
  for (let k = 0; k < 26; k++) px(Math.floor(r() * TILE), 7 + Math.floor(r() * 18), r() < 0.5 ? "#8a6a3e" : "#5a4328", 0.8);
  for (let k = 0; k < 5; k++) {
    const x = 1 + Math.floor(r() * 28), y = 8 + Math.floor(r() * 15);
    px(x, y, "#8a7a64"); px(x + 1, y, "#a09078"); px(x, y + 1, "#5a5040"); px(x + 1, y + 1, "#4a4234");
  }
  for (let k = 0; k < 10; k++) { const x = Math.floor(r() * TILE), y = r() < 0.5 ? 4 + Math.floor(r() * 5) : 23 + Math.floor(r() * 5); px(x, y, "#4a5a30", 0.7); px(x, y - 1, "#5f7a3a", 0.6); }
  ctx.globalAlpha = 1;
}

/** Registers the "war_track" texture: TRACK_VARIANTS frames (0..3) of 32x32, drawn once. Use it as a ground decal below heroes. */
export function ensureTrackTextures(scene: Phaser.Scene) {
  if (scene.textures.exists("war_track")) return;
  const tex = scene.textures.createCanvas("war_track", TILE * TRACK_VARIANTS, TILE)!, ctx = tex.getContext();
  for (let v = 0; v < TRACK_VARIANTS; v++) { drawTrackVariant(ctx, v * TILE, v); tex.add(v, 0, v * TILE, 0, TILE, TILE); }
  tex.refresh();
}
