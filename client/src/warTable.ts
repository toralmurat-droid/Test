/**
 * The war table (roadmap M2): with "War table" on, the big map shows one compass-laid continent instead of the world
 * bands (design: riven-marches-map.png). Each built land is a slot round the Crown of the Marches (warTableLayout.ts),
 * every territory a cell of its land tinted in its holder's colours (nearest-territory cells, front lines in ember
 * where two clans meet), capitals and holds as markers, the ways between lands as dashed lines, the clans' banners
 * standing on their home capitals, a legend on the right. Murat 2026-11-16: a pulsing "You are here" marker with your land
 * lit, the ways drawn as gate pairs, and a click on a territory shows the route to it (warRoute.ts) both as a gold path and
 * as steps in the side panel, so the table and the zone map speak of the same places. Cosmetic: it draws the server's
 * "war" snapshot and nothing else.
 */
import { CLANS, CLAN_KEYS, type ClanKey } from "../../shared/war/clans";
import { REGIONS } from "../../shared/war/regions";
import { TERRITORIES } from "../../shared/war/territories";
import type { WarView } from "../../shared/war/view";
import { viewTier } from "../../shared/war/intel";
import { CITIES, cityText } from "../../shared/capitals";
import { inPoly, landFrame, layoutTerritories, sheetToTile, SLOTS, WT_H, WT_W, type Pt } from "./warTableLayout";
import { EMPTY, GROUND, OBJECTS, T } from "../../shared/map";
import { inDeepRow, MAP_H, MAP_W, UNDER_END, WORLD_H } from "../../shared/constants";
import { CROWN_LAND, findRoute, gateReq, landOfNode, nodeName, routeLines, STONES, WAYS, type Here, type Step } from "./warRoute";
import { wrap } from "./warHere";
import { reckonCountdown } from "../../shared/war/crown";

const KEY = "wartable";
let on = (() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })();
export const warTableOn = () => on;
export function setWarTableOn(v: boolean) { on = v; try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private mode */ } }

/** Bright map colours per clan (banner cloth is too dark to read on the table). */
const MAP: Record<string, number> = { wardens: 0xe08a2a, redfang: 0xd03a2a, host: 0x5fb0a0, hidekin: 0xa0703a, veiled: 0x5a5ad8 };
const rgba = (c: number, a: number) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
const mix = (a: number, b: number, t: number) => [16, 8, 0].reduce((o, s) => o | (Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s), 0);
const short = (k: ClanKey) => CLANS[k].name.replace(/^The /, "");
/** The names under the banners, as the design has them. */
const TAG: Record<ClanKey, string> = { wardens: "Wardens", redfang: "Redfang", host: "Ossuary Host", hidekin: "Hide-Kin", veiled: "Veiled Circle" };

const UNIT = 4; // sheet units per art pixel
const AW = WT_W / UNIT, AH = WT_H / UNIT;
const PARCH = 0x2b231a, CROWN = 0x4b4740, VOID = 0x120e0a, INK = 0x0d0a07, GOLD = "#ffe8a3", EMBER = [0xf6b040, 0xd8782a];

const PLACED = layoutTerritories(TERRITORIES);
const POS = new Map(PLACED.map((p) => [p.id, p]));
const LAND_OF = SLOTS.map((s) => s.key);
const landOf = landOfNode;
const NAMES: Record<string, string> = Object.fromEntries(REGIONS.map((r) => [r.key, r.name]));
const idsOf = (key: string) => TERRITORIES.filter((t) => t.region === key).map((t) => t.id);

/** Static per-pixel maps (R x finer than the art grid): which land, which territory's cell (-1 none), a little grain. Built once. */
const R = 2, RW = AW * R, RH = AH * R, SU = UNIT / R; // the painted sheet: R px per art pixel, SU sheet units per px
const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const LAND = new Int8Array(RW * RH), CELL = new Int16Array(RW * RH), GRAIN = new Float32Array(RW * RH);
let built = false;
/** Fills the per-px maps on the first paint, not at load: every hero loads this module, few open the table. */
function buildStatics() {
if (built) return;
built = true;
for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
  const i = y * RW + x, p: Pt = [x * SU + SU / 2 + (hash(x, y) - 0.5) * 7, y * SU + SU / 2 + (hash(y, x) - 0.5) * 7]; // jittered, so land edges are ragged
  const l = SLOTS.findIndex((s) => inPoly(p, s.poly));
  LAND[i] = l; GRAIN[i] = hash(x + 91, y + 17) - 0.5;
  let best = -1, bd = Infinity;
  if (l >= 0) for (const t of TERRITORIES) {
    if (t.region !== LAND_OF[l]) continue;
    const q = POS.get(t.id)!, d = (q.x - x * SU) ** 2 + (q.y - y * SU) ** 2;
    if (d < bd) { bd = d; best = t.id; }
  }
  CELL[i] = best;
}
fillTiles();
}

/**
 * The real ground under each land (Murat 2026-11-19: the table shows the map's own lie of the land). Every px of a slot
 * looks up the world tile it stands for (landFrame's inverse, so markers stand on their own zone), within the land's
 * surface: its territories' box plus a rim, cut to the land's own rows (regions.ts `contains`), never the underground or
 * the deep band. Built from the world data, so a land that grows or moves repaints itself.
 */
const LAND_RIM = 14; // tiles of country shown round a land's outermost zones
const surfaceRow = (y: number) => !(y >= WORLD_H && y < UNDER_END) && !inDeepRow(y);
const BOX = SLOTS.map((s) => {
  const mine = TERRITORIES.filter((t) => t.region === s.key), f = landFrame(s, mine), reg = REGIONS.find((r) => r.key === s.key);
  if (!f || !reg?.contains) return undefined;
  const cx = Math.round(mine.reduce((a, t) => a + t.cx, 0) / mine.length);
  const cy = Math.round(mine.find((t) => reg.contains!(cx, Math.round(t.cy)))?.cy ?? mine[0].cy); // a row the land really holds
  const ok = (y: number) => y >= 0 && y < MAP_H && surfaceRow(y) && reg.contains!(cx, y);
  let r0 = cy, r1 = cy;
  while (ok(r0 - 1)) r0--;
  while (ok(r1 + 1)) r1++;
  if (r0 === r1) { r0 = Math.min(...mine.map((t) => t.y)); r1 = Math.max(...mine.map((t) => t.y + t.h)); } // no run of rows: the zones' own
  const x0 = Math.max(0, Math.min(...mine.map((t) => t.x)) - LAND_RIM), x1 = Math.min(MAP_W - 1, Math.max(...mine.map((t) => t.x + t.w)) + LAND_RIM);
  const y0 = Math.max(r0, Math.min(...mine.map((t) => t.y)) - LAND_RIM), y1 = Math.min(r1, Math.max(...mine.map((t) => t.y + t.h)) + LAND_RIM);
  return { f, x0, x1, y0, y1 };
});
/** Per px: its world tile (clamped into the land's box, -1 off the lands), how far past the box it lies (fades to parchment), and how far inside its own territory's zone (1 in it, fading to 0 five tiles out). */
const TX = new Int16Array(RW * RH).fill(-1), TY = new Int16Array(RW * RH).fill(-1), FADE = new Float32Array(RW * RH), IN = new Float32Array(RW * RH);
function fillTiles() {
for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
  const i = y * RW + x, b = LAND[i] >= 0 ? BOX[LAND[i]] : undefined;
  if (!b) continue;
  const [fx, fy] = sheetToTile(b.f, x * SU + SU / 2, y * SU + SU / 2);
  const cx = Math.min(b.x1, Math.max(b.x0, Math.floor(fx))), cy = Math.min(b.y1, Math.max(b.y0, Math.floor(fy)));
  TX[i] = cx; TY[i] = cy;
  FADE[i] = Math.min(1, Math.hypot(Math.max(b.x0 - fx, fx - b.x1 - 1, 0), Math.max(b.y0 - fy, fy - b.y1 - 1, 0)) / 10);
  const t = CELL[i] >= 0 ? TERRITORIES[CELL[i]] : undefined;
  IN[i] = t ? Math.max(0, 1 - Math.hypot(Math.max(t.x - fx, fx - t.x - t.w, 0), Math.max(t.y - fy, fy - t.y - t.h, 0)) / 5) : 0; // soft edge, 5 tiles
}
}

/** How high a tile stands, for the hill shading: cliffs and rock high, woods a little, water and pits low. */
function tileHeight(x: number, y: number): number {
  const o = OBJECTS[y][x], g = GROUND[y][x];
  if (o === T.CLIFF) return 3;
  if (o === T.ROCK || o === T.SPIRE || o === T.ARCH) return 1.6;
  if (o === T.PIT || o === T.CAVE) return -1.6;
  if (o === T.TREE || o === T.PINE || o === T.PALM) return 0.9;
  if (o === T.BARROW || o === T.STANDING_STONE || o === T.BURROW || o === T.STATUE) return 0.8;
  if (o !== EMPTY && o !== T.BUSH && o !== T.BRIDGE) return 0.5; // buildings, walls, stalls
  if (g === T.WATER) return -1.2;
  if (g === T.BOG) return -0.4;
  if (g === T.SAND) return 0.1;
  return 0;
}
/** Per px: light from the north-west on the smoothed height (a summed-area table over each land's box). Built on first paint. */
let SHADE: Float32Array | undefined;
function shading(): Float32Array {
  if (SHADE) return SHADE;
  SHADE = new Float32Array(RW * RH);
  const rad = 2;
  const sat = BOX.map((b) => {
    if (!b) return undefined;
    const w = b.x1 - b.x0 + 2, h = b.y1 - b.y0 + 2, a = new Float64Array(w * h);
    for (let y = 1; y < h; y++) for (let x = 1; x < w; x++) a[y * w + x] = tileHeight(b.x0 + x - 1, b.y0 + y - 1) + a[(y - 1) * w + x] + a[y * w + x - 1] - a[(y - 1) * w + x - 1];
    const mean = (tx: number, ty: number) => { // the box mean round (tx, ty), clipped to the land
      const x0 = Math.max(b.x0, tx - rad) - b.x0, x1 = Math.min(b.x1, tx + rad) - b.x0 + 1, y0 = Math.max(b.y0, ty - rad) - b.y0, y1 = Math.min(b.y1, ty + rad) - b.y0 + 1;
      return (a[y1 * w + x1] - a[y0 * w + x1] - a[y1 * w + x0] + a[y0 * w + x0]) / ((x1 - x0) * (y1 - y0));
    };
    return mean;
  });
  for (let i = 0; i < RW * RH; i++) {
    const m = TX[i] < 0 ? undefined : sat[LAND[i]];
    if (!m) continue;
    const x = TX[i], y = TY[i];
    SHADE[i] = Math.max(-1, Math.min(1, (m(x - 2, y - 2) - m(x + 2, y + 2)) * 0.55)) + Math.max(-0.4, Math.min(0.6, m(x, y) * 0.12));
  }
  return SHADE;
}

let terrain: Uint8ClampedArray | undefined;
/** The world's ground colours, 1 px per tile (the minimap's sheet), read once. */
function terrainOf(c?: HTMLCanvasElement): Uint8ClampedArray | undefined {
  if (!terrain && c && c.width === MAP_W && c.height === MAP_H) terrain = c.getContext("2d")!.getImageData(0, 0, MAP_W, MAP_H).data;
  return terrain;
}

let art: HTMLCanvasElement | undefined, artKey = "";
/** The painted continent for these owners: the real ground of each land, washed in its holders' colours (cached: only a war tick changes it). */
function paintArt(v: WarView, ground?: HTMLCanvasElement): HTMLCanvasElement {
  buildStatics();
  const tc = terrainOf(ground);
  const key = v.owner.join(",") + (tc ? "|t" : "");
  if (art && key === artKey) return art;
  artKey = key;
  art ??= Object.assign(document.createElement("canvas"), { width: RW, height: RH });
  const g = art.getContext("2d")!, img = g.createImageData(RW, RH);
  const own = (t: number) => (t < 0 ? -1 : v.owner[t]);
  const sh = tc ? shading() : undefined;
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    const i = y * RW + x;
    let c: number;
    if (LAND[i] < 0) c = VOID;
    else {
      const o = own(CELL[i]);
      let ground = PARCH;
      if (tc && TX[i] >= 0) {
        const q = (TY[i] * MAP_W + TX[i]) * 4;
        ground = mix(mix((tc[q] << 16) | (tc[q + 1] << 8) | tc[q + 2], PARCH, 0.18), PARCH, FADE[i] * 0.85);
      }
      c = o < 0 ? mix(ground, CROWN, tc ? 0.3 : 1) : mix(ground, MAP[CLAN_KEYS[o]], !tc ? 0.42 : 0.2 + 0.24 * IN[i]);
      const k = 1 + GRAIN[i] * (tc ? 0.1 : 0.22) + (sh ? sh[i] * 0.5 * (1 - FADE[i]) : 0);
      c = [16, 8, 0].reduce((o2, s) => o2 | (Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * k))) << s), 0);
      let edge = 0; // the strongest border a neighbour in another cell gives: 1 within a land, 2 between lands, 3 a front line
      for (const j of [x + 1 < RW ? i + 1 : -1, y + 1 < RH ? i + RW : -1, x > 0 ? i - 1 : -1, y > 0 ? i - RW : -1]) {
        if (j < 0 || CELL[j] === CELL[i] && LAND[j] === LAND[i]) continue;
        const a = own(CELL[i]), b = own(CELL[j]);
        edge = Math.max(edge, a >= 0 && b >= 0 && a !== b ? 3 : LAND[j] === LAND[i] ? 1 : 2);
      }
      if (edge === 3) c = EMBER[((x + y) >> 1) & 1]; // a front line: two clans meet
      else if (edge) c = mix(c, INK, edge === 2 ? 0.8 : tc ? 0.45 : 0.55);
    }
    const o = i * 4;
    img.data[o] = (c >> 16) & 255; img.data[o + 1] = (c >> 8) & 255; img.data[o + 2] = c & 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return art;
}

/** A clan's standing banner as pixel art (20 x 36 art px): gold rail, cloth with trim, a swallow tail, the sigil. */
const SIGIL: Record<ClanKey, string[]> = {
  wardens: ["...#...", "..###..", ".#####.", "..###..", "...#...", "...#..."],
  redfang: ["#.....#", "##...##", ".##.##.", "..###..", "...#...", "......."],
  host: [".#####.", "#.###.#", "#.###.#", ".#####.", "..#.#..", "......."],
  hidekin: ["#.###.#", "#######", "#.###.#", ".#####.", "..#.#..", "......."],
  veiled: [".#####.", "##.#.##", "#.###.#", "##.#.##", ".#####.", "......."],
};
const banners = new Map<ClanKey, HTMLCanvasElement>();
function bannerArt(k: ClanKey): HTMLCanvasElement {
  let c = banners.get(k);
  if (c) return c;
  c = Object.assign(document.createElement("canvas"), { width: 20, height: 36 });
  const g = c.getContext("2d")!, cl = CLANS[k];
  const lift = (n: number, t: number) => hex(mix(n, 0xffffff, t));
  g.fillStyle = "#120c08"; g.fillRect(0, 0, 20, 3);
  g.fillStyle = "#c8962c"; g.fillRect(1, 1, 18, 1); g.fillRect(0, 0, 1, 3); g.fillRect(19, 0, 1, 3);
  for (let y = 3; y < 36; y++) for (let x = 2; x < 18; x++) {
    const notch = y >= 29 && Math.abs(x - 9.5) < (y - 28) * 0.9; // the swallow tail's cut
    if (notch) continue;
    const rim = x === 2 || x === 17 || y === 3;
    g.fillStyle = rim ? hex(cl.trim) : lift(cl.cloth, 0.12 + 0.05 * ((x + y) & 1));
    g.fillRect(x, y, 1, 1);
  }
  g.fillStyle = hex(cl.trim); g.fillRect(3, 5, 14, 1);
  g.fillStyle = hex(mix(cl.sigil, 0xffffff, 0.1));
  SIGIL[k].forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") g.fillRect(6 + x, 10 + y, 1, 1); }));
  banners.set(k, c);
  return c;
}

export interface WarHover { x: number; y: number }

/** Zoom and pan of the table (Murat 2026-11-19): z from 1 (the whole continent) to ZOOM_MAX, centred on (cx, cy) sheet units. */
const ZOOM_MAX = 4;
const view = { z: 1, cx: WT_W / 2, cy: WT_H / 2 };
/** The frame of the last drawn table (canvas px) and its unzoomed px per art pixel: input maps through it. */
let frame: { x: number; y: number; w: number; h: number; ds: number } | undefined;
function clampView() {
  view.z = Math.max(1, Math.min(ZOOM_MAX, view.z));
  const hw = WT_W / 2 / view.z, hh = WT_H / 2 / view.z;
  view.cx = Math.max(hw, Math.min(WT_W - hw, view.cx)); view.cy = Math.max(hh, Math.min(WT_H - hh, view.cy));
}
/** Zooms the table by `f`, keeping the spot under canvas point (px, py) in place. */
export function warTableZoom(f: number, px: number, py: number) {
  if (!frame) return;
  const u0 = (frame.ds * view.z) / UNIT, ox = px - (frame.x + frame.w / 2), oy = py - (frame.y + frame.h / 2);
  const sx = view.cx + ox / u0, sy = view.cy + oy / u0; // sheet point under the cursor
  view.z = Math.max(1, Math.min(ZOOM_MAX, view.z * f));
  const u1 = (frame.ds * view.z) / UNIT;
  view.cx = sx - ox / u1; view.cy = sy - oy / u1;
  clampView();
}
/** Moves the table by a canvas-pixel offset (a drag: the sheet follows the pointer). */
export function warTablePan(dx: number, dy: number) {
  if (!frame) return;
  const u = (frame.ds * view.z) / UNIT;
  view.cx += dx / u; view.cy += dy / u;
  clampView();
}
/** Back to the whole continent. */
/** Zooms by `f` around the table's own centre (buttons and keys: the legend sits right of it). */
export function warTableZoomCentre(f: number) { if (frame) warTableZoom(f, frame.x + frame.w / 2, frame.y + frame.h / 2); }
export function warTableResetView() { view.z = 1; view.cx = WT_W / 2; view.cy = WT_H / 2; }
export const warTableZoomed = () => view.z > 1;
/** What the table says about the hero: where they stand, the territory they picked, the portal stones they may use. */
export interface WarTableUI { here?: Here; area?: string; sel?: number; woken?: ReadonlySet<string>; /** the world's ground colours, 1 px per tile (the minimap's sheet): painted under the clans' colours */ ground?: HTMLCanvasElement }

/** Screen spots of the nodes of the last frame, for picking a territory by click. */
let spots: { id: number; x: number; y: number }[] = [], reach = 16;
/** The territory nearest a canvas point of the last frame, if it is close enough. */
export function warTablePick(x: number, y: number): number | undefined {
  let best: number | undefined, bd = reach;
  for (const s of spots) { const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = s.id; } }
  return best;
}

/** A gate glyph (two pillars and a lintel) centred on (x, y), `k` px per art pixel. */
function gateGlyph(g: CanvasRenderingContext2D, x: number, y: number, k: number, col: string) {
  g.fillStyle = "#0d0a07"; g.fillRect(x - 6 * k, y - 6 * k, 12 * k, 12 * k);
  g.fillStyle = col; g.fillRect(x - 5 * k, y - 5 * k, 10 * k, 2 * k); g.fillRect(x - 4 * k, y - 3 * k, 2 * k, 8 * k); g.fillRect(x + 2 * k, y - 3 * k, 2 * k, 8 * k);
}

/** Draw the war table over the whole big-map canvas (screen space). Returns nothing; the minimap clears the canvas first. */
export function drawWarTable(g: CanvasRenderingContext2D, v: WarView, font: string, now: number, hover?: WarHover, ui: WarTableUI = {}) {
  const W = g.canvas.width, H = g.canvas.height;
  const legW = Math.max(190, Math.min(215, Math.round(W * 0.19))), pad = 8;
  const avail = { w: W - legW - pad * 3, h: H - pad * 2 };
  let ds = Math.min(avail.w / AW, avail.h / AH);
  if (ds > 1) ds = Math.floor(ds * 4) / 4; // keep art pixels near-whole
  const fw = AW * ds, fh = AH * ds, fx = Math.round(pad + (avail.w - fw) / 2), fy = Math.round(pad + (avail.h - fh) / 2); // the table's frame
  frame = { x: fx, y: fy, w: fw, h: fh, ds };
  clampView();
  const u = (ds * view.z) / UNIT; // screen px per sheet unit (zoomed)
  const mw = WT_W * u, mh = WT_H * u, mx = Math.round(fx + fw / 2 - view.cx * u), my = Math.round(fy + fh / 2 - view.cy * u); // the sheet, zoomed and moved
  const kC = Math.max(2, Math.round(ds)); // the Crown icon's pixel size (over the Crown Keep)
  const P = (id: number): [number, number] => { const p = POS.get(id)!; return [mx + p.x * u, my + p.y * u]; };
  const pulse = 0.5 + 0.5 * Math.sin(now / 250);
  const here = ui.here, hn = here?.node;
  g.save();
  g.imageSmoothingEnabled = false;
  g.textBaseline = "middle"; g.textAlign = "left";
  const text = (t: string, x: number, y: number, c: string, px = 13) => { g.font = `${px}px ${font}`; g.fillStyle = "#000"; g.fillText(t, x + 1, y + 1); g.fillStyle = c; g.fillText(t, x, y); };
  g.fillStyle = "#0d0a07"; g.fillRect(0, 0, W, H);
  // the table: a gilt frame round the painted continent
  g.fillStyle = "#6e5326"; g.fillRect(fx - 4, fy - 4, fw + 8, fh + 8);
  g.fillStyle = "#1a130b"; g.fillRect(fx - 2, fy - 2, fw + 4, fh + 4);
  g.save(); // everything on the sheet stays inside the frame when zoomed in
  g.beginPath(); g.rect(fx, fy, fw, fh); g.clip();
  g.drawImage(paintArt(v, ui.ground), mx, my, mw, mh);
  // your land lit: a glowing gold edge round it, a light wash over it
  const myLand = here?.land ? SLOTS.find((s) => s.key === here.land) : undefined;
  if (myLand) {
    g.beginPath(); myLand.poly.forEach(([x, y], i) => (i ? g.lineTo(mx + x * u, my + y * u) : g.moveTo(mx + x * u, my + y * u))); g.closePath();
    g.fillStyle = `rgba(255,214,120,${0.05 + 0.05 * pulse})`; g.fill();
    g.lineJoin = "round"; g.lineWidth = 6; g.strokeStyle = "rgba(0,0,0,0.6)"; g.stroke();
    g.lineWidth = 3; g.strokeStyle = `rgba(255,209,102,${0.65 + 0.35 * pulse})`; g.stroke();
  }

  // the route to the territory you picked (or hover): hovered wins, so the way is shown before the click
  const hovered = hover ? warTablePick(hover.x, hover.y) : undefined, tgt = hovered ?? ui.sel;
  const route = tgt !== undefined && hn !== undefined && tgt !== hn ? routeOf(hn, tgt, ui.woken) : undefined;
  const onRoute = new Set(route?.filter((s) => s.via === "gate").map((s) => s.way!.id));

  // ways between lands: a dotted line between the two gates, named at its middle
  const dash = Math.max(5, ds * 3), gap = Math.max(4, ds * 2), lw0 = Math.max(2, Math.round(ds * 0.8));
  const mineWay = (w: (typeof WAYS)[number]) => !here?.land || landOf(w.a) === here.land || landOf(w.b) === here.land;
  for (const w of WAYS) {
    const [ax, ay] = P(w.a), [bx, by] = P(w.b), dim = route ? !onRoute.has(w.id) : !mineWay(w);
    g.lineCap = "butt"; g.setLineDash([dash, gap]);
    g.lineWidth = lw0 + 3; g.strokeStyle = `rgba(0,0,0,${dim ? 0.3 : 0.55})`; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.lineWidth = lw0; g.strokeStyle = `rgba(150,215,255,${dim ? 0.4 : 0.95})`; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
  }
  g.setLineDash([]);
  if (route) { // the path: gold, marching, with a dot on every territory it crosses
    g.lineCap = "round"; g.lineJoin = "round";
    const trace = () => { g.beginPath(); route.forEach((s, i) => { const [x0, y0] = P(s.from), [x1, y1] = P(s.to); if (!i) g.moveTo(x0, y0); if (s.via === "portal") g.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - 60, x1, y1); else g.lineTo(x1, y1); }); };
    trace(); g.setLineDash([]); g.lineWidth = lw0 + 6; g.strokeStyle = "rgba(0,0,0,0.7)"; g.stroke();
    trace(); g.setLineDash([12, 7]); g.lineDashOffset = -now / 35; g.lineWidth = lw0 + 2; g.strokeStyle = "#ffd166"; g.stroke();
    g.setLineDash([]); g.lineDashOffset = 0; g.lineCap = "butt";
    for (const s of route) for (const n of [s.from, s.to]) { const [x, y] = P(n); g.fillStyle = "#000"; g.fillRect(Math.round(x) - 4, Math.round(y) - 4, 8, 8); g.fillStyle = "#ffd166"; g.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6); }
  }

  // the home clans' banners, standing on their capitals (the pole's foot just above the capital's marker, the clan's name over the cloth, drawn later on top)
  const sz = Math.max(8, Math.round(15 * u)), capH = Math.round(sz * 1.5) >> 1;
  const bs = Math.max(1, Math.round((100 * u) / 36)), bannerAt = new Map<ClanKey, [number, number]>();
  for (const s of SLOTS) {
    const cap = s.banner && TERRITORIES.find((t) => t.region === s.key && t.capitalOf === s.banner!.clan);
    if (!cap) continue;
    const [cx, cy] = P(cap.id), b = bannerArt(s.banner!.clan), bx = Math.round(cx - 10 * bs), by = Math.round(cy - capH - 2 - 36 * bs);
    bannerAt.set(s.banner!.clan, [cx, by - 12]); // where its name plate goes
    g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(bx + 3, by + 3, 20 * bs, 36 * bs);
    g.drawImage(b, bx, by, 20 * bs, 36 * bs);
  }

  // territories: holds and capitals in holder colours
  reach = Math.max(16, sz);
  spots = [];
  for (const t of TERRITORIES) {
    const [x0, y0] = P(t.id), x = Math.round(x0), y = Math.round(y0), k = CLAN_KEYS[v.owner[t.id]], col = k ? MAP[k] : 0x888888;
    const cap = !!t.capitalOf || !!t.reckoningOnly, s = cap ? Math.round(sz * 1.5) : Math.round(sz * [0.75, 1, 1.25][viewTier(v, t.id)]), h = s >> 1; // (a bigger marker for a bigger Hold)
    spots.push({ id: t.id, x, y });
    if (v.sieges.some((sg) => sg[0] === t.id)) { g.lineWidth = 2; g.strokeStyle = `rgba(255,80,40,${0.45 + 0.55 * pulse})`; g.strokeRect(x - h - 5, y - h - 5, s + 10, s + 10); }
    if (v.raided?.includes(t.id)) { g.lineWidth = 2; g.setLineDash([4, 3]); g.strokeStyle = `rgba(200,110,255,${0.7 + 0.3 * pulse})`; g.strokeRect(x - h - 3, y - h - 3, s + 6, s + 6); g.setLineDash([]); }
    g.fillStyle = "#0d0a07"; g.fillRect(x - h - 1, y - h - 1, s + 2, s + 2);
    g.fillStyle = hex(mix(col, 0x000000, cap ? 0.15 : 0.35)); g.fillRect(x - h, y - h, s, s);
    g.strokeStyle = cap ? "#ffd860" : hex(mix(col, 0xffffff, 0.35)); g.lineWidth = cap ? 2 : 1; g.strokeRect(x - h + 0.5, y - h + 0.5, s - 1, s - 1);
    if (t.reckoningOnly) { // the Crown Keep: a gold crown over it (it falls only at a Reckoning)
      const k = Math.max(1, Math.round(kC / 2)), cx = x - 5 * k, cy = y - h - 5 * k;
      g.fillStyle = "#0d0a07"; g.fillRect(cx - k, cy - k, 13 * k, 8 * k);
      g.fillStyle = "#ffd860";
      for (const [a, b, w, hh] of [[0, 3, 11, 3], [0, 0, 1, 3], [5, 0, 1, 3], [10, 0, 1, 3], [1, 1, 1, 2], [4, 1, 1, 2], [6, 1, 1, 2], [9, 1, 1, 2]]) g.fillRect(cx + a * k, cy + b * k, w * k, hh * k);
    } else if (cap) { g.fillStyle = "#ffd860"; g.fillRect(x - 1, y - h - 6, 2, 6); g.fillStyle = hex(col); g.fillRect(x + 1, y - h - 6, 5, 3); } // a flag on the keep
  }
  // woken portal stones: a small orange diamond on the territory they stand in
  for (const st of STONES) {
    if (!ui.woken?.has(st.id)) continue;
    const [x, y] = P(st.node), dx = Math.round(x + sz * 0.6 + 5), dy = Math.round(y - sz * 0.6 - 5);
    g.fillStyle = "#000"; g.beginPath(); g.moveTo(dx, dy - 6); g.lineTo(dx + 6, dy); g.lineTo(dx, dy + 6); g.lineTo(dx - 6, dy); g.fill();
    g.fillStyle = "#ff9a3c"; g.beginPath(); g.moveTo(dx, dy - 4); g.lineTo(dx + 4, dy); g.lineTo(dx, dy + 4); g.lineTo(dx - 4, dy); g.fill();
  }
  // gates: a glyph on each end of every way, just off the territory towards the other end
  for (const w of WAYS) {
    const dim = route ? !onRoute.has(w.id) : !mineWay(w), col = route && onRoute.has(w.id) ? "#ffd166" : dim ? "#6f8ea3" : "#96d7ff";
    for (const [me, other] of [[w.a, w.b], [w.b, w.a]] as const) {
      const [x, y] = P(me), [ox, oy] = P(other), d = Math.hypot(ox - x, oy - y) || 1, off = sz * 0.9 + 10;
      gateGlyph(g, Math.round(x + ((ox - x) / d) * off), Math.round(y + ((oy - y) / d) * off), 1, col);
    }
  }
  // the capital cities' gates (shared/capitals.ts): a small gilt arch in the clan's colour beside the territory the gate stands in
  for (const c of CITIES) {
    const t = TERRITORIES.find((q) => q.x <= c.outer.x && c.outer.x < q.x + q.w && q.y <= c.outer.y && c.outer.y < q.y + q.h);
    if (!t) continue;
    const [x0, y0] = P(t.id), k = Math.max(2, Math.round(sz / 5)), gx = Math.round(x0 + sz * 0.9), gy = Math.round(y0 + sz * 0.5);
    g.fillStyle = "#0d0a07"; g.fillRect(gx - 3 * k - 1, gy - 3 * k - 1, 6 * k + 2, 6 * k + 2);
    g.fillStyle = hex(MAP[c.clan]); g.fillRect(gx - 3 * k, gy - 3 * k, 6 * k, 6 * k);
    g.fillStyle = "#0d0a07"; g.fillRect(gx - k, gy, 2 * k, 3 * k);
    g.fillStyle = "#ffd860"; g.fillRect(gx - 3 * k, gy - 3 * k, 6 * k, Math.max(1, k >> 1));
    g.textAlign = "left"; text(`${cityText(c).name} gate`, gx + 3 * k + 5, gy, GOLD, 11);
  }

  // land plates: the land's name and each clan's share of it
  for (const s of SLOTS) {
    const name = NAMES[s.key] ?? s.key, ids = idsOf(s.key), mine = s.key === here?.land;
    const sm = ds < 2.2, fs = sm ? 12 : 14;
    g.font = `${fs}px ${font}`;
    const nw = g.measureText(name).width, chip = sm ? 26 : 30, built = ids.length > 0;
    const sub = built ? "" : s.key === CROWN_LAND ? `Lv ${gateReq(CROWN_LAND).replace("Lv ", "")}+, five gates` : "coming";
    g.font = `11px ${font}`;
    const w = Math.round(Math.max(nw, built ? CLAN_KEYS.length * chip : g.measureText(sub).width) + 14), h = sm ? 34 : 38;
    const px = Math.round(mx + s.plate[0] * u), py = Math.round(my + s.plate[1] * u);
    g.fillStyle = "rgba(10,8,6,0.88)"; g.fillRect(px, py, w, h);
    g.strokeStyle = mine ? `rgba(255,209,102,${0.7 + 0.3 * pulse})` : built || s.key === CROWN_LAND ? "#c8962c" : "#6a604c"; g.lineWidth = mine ? 3 : 1; g.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
    text(name, px + 7, py + (sm ? 11 : 12), built || s.key === CROWN_LAND ? GOLD : "#a8a08a", fs);
    if (built) CLAN_KEYS.forEach((k, j) => {
      const n = ids.filter((id) => CLAN_KEYS[v.owner[id]] === k).length, x = px + 7 + j * chip;
      g.fillStyle = rgba(MAP[k], n ? 1 : 0.3); g.fillRect(x, py + h - 14, 8, 8);
      text(`${n}`, x + 11, py + h - 9.5, n ? "#eadfc8" : "#7a6e5a", 11);
    }); else text(sub, px + 7, py + h - 11, "#8a8470", 11);
  }

  // the banners' names, over their cloth and over the markers round them
  g.textAlign = "center"; g.font = `13px ${font}`;
  for (const [k, [x, y]] of bannerAt) {
    const lw = g.measureText(TAG[k]).width + 10;
    g.fillStyle = "rgba(10,8,6,0.85)"; g.fillRect(Math.round(x - lw / 2), Math.round(y - 8), Math.round(lw), 17);
    text(TAG[k], x, y + 1, GOLD);
  }
  g.textAlign = "left";

  // the ways' names, on top of everything on the map; a name that would sit on another is moved down
  const placed: [number, number, number, number][] = []; // x, y, w, h of every label already down
  for (const s of SLOTS) { // the land plates and banner names are in the way too
    const px = mx + s.plate[0] * u, py = my + s.plate[1] * u;
    placed.push([px + 60, py + 17, 120, 34]);
    const ba = s.banner && bannerAt.get(s.banner.clan);
    if (ba) placed.push([ba[0], ba[1], 110, 17]);
  }
  for (const w of WAYS) {
    const hot0 = onRoute.has(w.id), asked = hovered === w.a || hovered === w.b || ui.sel === w.a || ui.sel === w.b;
    if (!hot0 && !asked && !mineWay(w)) continue; // a way that does not touch your land is named only when it matters
    const [ax, ay] = P(w.a), [bx, by] = P(w.b), x = Math.round(ax + (bx - ax) * 0.45), name = ds < 2.2 ? w.name.replace(/^The /, "") : w.name;
    let y = Math.round(ay + (by - ay) * 0.45);
    g.font = `12px ${font}`;
    const wd = g.measureText(name).width + 8;
    const hit = (yy: number) => placed.some(([px, py, pw, ph]) => Math.abs(px - x) < (pw + wd) / 2 && Math.abs(py - yy) < (ph + 16) / 2);
    for (const d of [0, 17, -17, 34, -34, 51, -51]) if (!hit(y + d)) { y += d; break; }
    placed.push([x, y, wd, 16]);
    const hot = onRoute.has(w.id);
    g.fillStyle = "rgba(10,8,6,0.88)"; g.fillRect(Math.round(x - wd / 2), y - 8, Math.round(wd), 16);
    if (hot) { g.strokeStyle = "#ffd166"; g.lineWidth = 1; g.strokeRect(Math.round(x - wd / 2) + 0.5, y - 7.5, Math.round(wd) - 1, 15); }
    g.textAlign = "center"; text(name, x, y + 1, hot ? "#ffd166" : "#96d7ff", 12); g.textAlign = "left";
  }

  // you are here: a pulsing ring on your territory, a pin over it and a name tag
  const tag = (x: number, y: number, l1: string, l2: string, col: string, at: "above" | "below" | "right") => {
    g.font = `12px ${font}`; const w1 = g.measureText(l1).width; g.font = `11px ${font}`;
    const w = Math.round(Math.max(w1, g.measureText(l2).width) + 12), h = 31;
    let tx = Math.round(Math.max(fx + 4, Math.min(fx + fw - w - 4, at === "right" ? x : x - w / 2))), ty = Math.round(at === "above" ? y - h : y);
    ty = Math.max(fy + 4, Math.min(fy + fh - h - 4, ty));
    g.fillStyle = "rgba(10,8,6,0.93)"; g.fillRect(tx, ty, w, h); g.strokeStyle = col; g.lineWidth = 2; g.strokeRect(tx + 1, ty + 1, w - 2, h - 2);
    text(l1, tx + 6, ty + 10, col, 12); text(l2, tx + 6, ty + 23, "#eadfc8", 11);
  };
  const inFrame = (x: number, y: number) => x >= fx && x < fx + fw && y >= fy && y < fy + fh;
  if (hn !== undefined && here && inFrame(...P(hn))) { // (zoomed away from you: no pin)
    const [x0, y0] = P(hn), x = Math.round(x0), y = Math.round(y0), r = sz * 0.9 + 6 + pulse * 4;
    g.lineWidth = 6; g.strokeStyle = "rgba(0,0,0,0.65)"; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3; g.strokeStyle = "#ffd166"; g.setLineDash(here.near ? [5, 4] : []); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.lineWidth = 2; g.strokeStyle = `rgba(255,209,102,${0.7 * (1 - pulse)})`; g.beginPath(); g.arc(x, y, r + 5 + pulse * 10, 0, Math.PI * 2); g.stroke();
    const label = (here.near ? "near " : "") + nodeName(hn);
    if (y - r - 3 - 13 - 31 < fy + 4) tag(x + r + 8, y - 15, "You are here", label, "#ffd166", "right"); // no room above: beside the ring
    else {
      const bob = Math.round(pulse * 3), ty = y - Math.round(r) - 3 - bob; // a pin pointing down at the ring
      g.fillStyle = "#000"; g.beginPath(); g.moveTo(x, ty + 2); g.lineTo(x - 9, ty - 11); g.lineTo(x + 9, ty - 11); g.closePath(); g.fill();
      g.fillStyle = "#ffd166"; g.beginPath(); g.moveTo(x, ty); g.lineTo(x - 6, ty - 9); g.lineTo(x + 6, ty - 9); g.closePath(); g.fill();
      tag(x, ty - 13, "You are here", label, "#ffd166", "above");
    }
  }
  if (ui.sel !== undefined && ui.sel !== hn) { // the picked territory: a cyan frame, turning dashes
    const [x0, y0] = P(ui.sel), x = Math.round(x0), y = Math.round(y0), r = sz * 0.9 + 4;
    g.lineWidth = 5; g.strokeStyle = "rgba(0,0,0,0.65)"; g.strokeRect(x - r, y - r, r * 2, r * 2);
    g.lineWidth = 2; g.strokeStyle = "#8fe0ff"; g.setLineDash([6, 4]); g.lineDashOffset = -now / 60; g.strokeRect(x - r, y - r, r * 2, r * 2); g.setLineDash([]); g.lineDashOffset = 0;
    tag(x, y + r + 4, "Picked", nodeName(ui.sel), "#8fe0ff", "below");
  }
  if (hovered !== undefined) { const [x, y] = P(hovered), r = sz * 0.9 + 2; g.lineWidth = 1; g.strokeStyle = "#fff"; g.strokeRect(Math.round(x) - r + 0.5, Math.round(y) - r + 0.5, r * 2, r * 2); }

  g.restore(); // (the frame's clip)
  spots = spots.filter((p) => inFrame(p.x, p.y)); // only what can be seen can be picked
  if (view.z >= 1.05) { // how far in: a small plate in the frame's corner
    const zt = `Zoom x${view.z.toFixed(1)}`;
    g.font = `11px ${font}`; const zw = g.measureText(zt).width + 10;
    g.fillStyle = "rgba(10,8,6,0.85)"; g.fillRect(fx + fw - zw - 6, fy + fh - 22, zw, 16);
    text(zt, fx + fw - zw - 1, fy + fh - 14, "#cfc4aa", 11);
  }

  // legend on the right: where you are, the way to the picked territory, then the clans and the key
  const lx = W - legW - pad + 6, lw = legW - 6, bot = H - pad - 4;
  g.fillStyle = "rgba(10,8,6,0.85)"; g.fillRect(lx - 6, pad, lw + 6, H - pad * 2);
  g.strokeStyle = "#6e5326"; g.lineWidth = 1; g.strokeRect(lx - 5.5, pad + 0.5, lw + 5, H - pad * 2 - 1);
  const tight = H < 560, rowH = tight ? 15 : 18, keyH = tight ? 13 : 16, tw = lw - 12;
  let y = pad + 14;
  const para = (t: string, c: string, px: number, lh: number, max = 99) => { g.font = `${px}px ${font}`; for (const l of wrap(g, t, tw).slice(0, max)) { text(l, lx + 4, y, c, px); y += lh; } };
  g.fillStyle = `rgba(255,209,102,${0.6 + 0.4 * pulse})`; g.fillRect(lx + 4, y - 4, 8, 8);
  text("You are here", lx + 18, y, "#ffd166", 14); y += 17;
  if (hn === undefined || !here) para(ui.area ? `In ${ui.area}, below the lands.` : "Below the lands.", "#eadfc8", 12, 14);
  else {
    if (here.near) para(ui.area ?? "Outside the zones", "#ffe8a3", 13, 15, 2);
    para(here.near ? `near ${nodeName(hn)}` : nodeName(hn), here.near ? "#cfc4aa" : "#ffe8a3", here.near ? 11 : 13, here.near ? 13 : 15, 2);
    para(`${NAMES[here.land ?? ""] ?? ""}${here.land === CROWN_LAND ? " (neutral ground)" : ""}`, "#a39680", 11, 13);
  }
  y += 5; g.fillStyle = "#3a2a1c"; g.fillRect(lx + 4, y - 3, lw - 12, 1); y += 8;
  if (tgt !== undefined && hn !== undefined && tgt !== hn) {
    text(`Way to ${nodeName(tgt)}`.slice(0, 26), lx + 4, y, "#8fe0ff", 13); y += 16;
    if (!route) para("No road from here.", "#d8c8a0", 11, 13);
    else {
      para(`${route.length} step${route.length === 1 ? "" : "s"}`, "#a39680", 11, 13);
      routeLines(route).forEach((l, i) => { para(`${i + 1}. ${l}`, "#d8c8a0", 11, 13, 4); });
    }
  } else if (hn !== undefined) { para(tgt === hn ? "This is where you stand." : "Click a territory to see the way there.", "#a39680", 11, 13); if (tgt !== hn) para("The dotted lines are gates between lands.", "#a39680", 11, 13); }
  y += 6; g.fillStyle = "#3a2a1c"; g.fillRect(lx + 4, y - 3, lw - 12, 1); y += 10;
  if (!tight || y < bot - 150) { text("The Riven Marches", lx + 4, y, "#f6b040", 14); y += 15; }
  const rk = v.reck;
  CLAN_KEYS.forEach((k, i) => {
    const n = v.owner.filter((o) => CLAN_KEYS[o] === k).length, tag = v.hunt === i ? "hunted" : v.rally === i ? "Rally" : "";
    g.fillStyle = "#0d0a07"; g.fillRect(lx + 3, y - 6, 12, 12); g.fillStyle = hex(MAP[k]); g.fillRect(lx + 4, y - 5, 10, 10);
    text(short(k), lx + 21, y, "#eadfc8", 12);
    if (rk?.crowned === i) { g.font = `12px ${font}`; crownMark(g, Math.round(lx + 25 + g.measureText(short(k)).width), y - 5, 1); } // crowned at the last Reckoning
    if (rk?.on && rk.score) { g.textAlign = "right"; text(`${rk.score[i] ?? 0}`, lx + lw - 30, y, "#ffd860", 11); g.textAlign = "left"; } // Reckoning score so far
    g.textAlign = "right"; text(`${n}`, lx + lw - 6, y, "#ffe8a3", 13); g.textAlign = "left";
    if (tag) { y += 12; text(tag, lx + 21, y, v.hunt === i ? "#c890ff" : "#9fe07a", 11); }
    y += rowH;
  });
  // the Reckoning (shared/war/crown.ts): when, or how long it still runs, and the last result
  if (rk && y < bot - 60) {
    y += 4; g.fillStyle = "#3a2a1c"; g.fillRect(lx + 4, y - 3, lw - 12, 1); y += 10;
    text(rk.on ? "The Reckoning: now" : "The Reckoning", lx + 4, y, rk.on ? `rgba(255,216,96,${0.7 + 0.3 * pulse})` : "#ffd860", 13); y += 15;
    para(rk.on ? `${reckonCountdown(rk, now)} · scores in gold above` : `${reckonCountdown(rk, now)} (first Saturday, 18:00 UTC)`, "#eadfc8", 11, 13, 2);
    const lw0 = rk.last && CLAN_KEYS[rk.last.winner];
    if (!rk.on && lw0) para(`Last: ${short(lw0)} ${rk.last!.kept ? "kept" : "took"} the Keep`, "#a39680", 11, 13, 2);
  }
  y += 2;
  const key = (draw: () => void, label: string) => { if (y > bot) return; draw(); text(label, lx + 28, y, "#cfc4aa", 11); y += keyH; };
  key(() => { g.fillStyle = hex(EMBER[0]); g.fillRect(lx + 3, y - 1, 18, 3); }, "Front line");
  key(() => { g.fillStyle = "#0d0a07"; g.fillRect(lx + 7, y - 6, 10, 10); g.strokeStyle = "#c9b27a"; g.lineWidth = 1; g.strokeRect(lx + 7.5, y - 5.5, 9, 9); }, "Hold");
  key(() => { g.fillStyle = "#0d0a07"; g.fillRect(lx + 6, y - 7, 13, 13); g.strokeStyle = "#ffd860"; g.lineWidth = 2; g.strokeRect(lx + 7, y - 6, 11, 11); }, "Capital (cannot fall)");
  key(() => { g.fillStyle = "#ffd860"; for (const [a, b, w, hh] of [[0, 3, 11, 3], [0, 0, 1, 3], [5, 0, 1, 3], [10, 0, 1, 3]]) g.fillRect(lx + 7 + a, y - 3 + b, w, hh); }, "Crown Keep (a Reckoning only)");
  key(() => { gateGlyph(g, lx + 12, y, 1, "#96d7ff"); }, "Gate between lands");
  if (CITIES.length) key(() => { g.fillStyle = "#0d0a07"; g.fillRect(lx + 6, y - 7, 13, 13); g.fillStyle = hex(MAP[CITIES[0].clan]); g.fillRect(lx + 7, y - 6, 11, 11); g.fillStyle = "#0d0a07"; g.fillRect(lx + 11, y - 1, 3, 6); }, "City gate");
  key(() => { g.strokeStyle = `rgba(255,80,40,${0.5 + 0.5 * pulse})`; g.lineWidth = 2; g.strokeRect(lx + 6, y - 6, 12, 12); }, "Under siege");
  key(() => { g.strokeStyle = "rgba(200,110,255,0.9)"; g.lineWidth = 2; g.setLineDash([3, 2]); g.strokeRect(lx + 6, y - 6, 12, 12); g.setLineDash([]); }, "Struck by raiders");
  if (!tight && y < bot - 20) { y += 6; text(`${TERRITORIES.length} territories, ${TERRITORIES.filter((t) => t.capitalOf).length} capitals · tick ${v.tick}`, lx + 4, y, "#a39680", 10); }

  // hover: the nearest territory within reach
  if (hover && hovered !== undefined) {
    const lines: string[] = [];
    let col = "#888";
    {
      const t = TERRITORIES[hovered], k = CLAN_KEYS[v.owner[hovered]], sg = v.sieges.find((s) => s[0] === hovered);
      col = k ? hex(MAP[k]) : "#888";
      lines.push(t.name, `${k ? short(k) : "Unclaimed"}${t.capitalOf ? "  (capital)" : ""}  ·  ${NAMES[t.region] ?? ""}`, `Level ${t.levels[0]}-${t.levels[1]}  Control ${v.control[hovered] ?? 0}`);
      if (t.reckoningOnly) lines.push("Falls only at a Reckoning");
      else if (t.region === CROWN_LAND && t.wards) lines.push(`Crownway land, first held by ${short(t.wards)} (${gateReq(CROWN_LAND)})`);
      if (sg) lines.push(`Siege by ${short(CLAN_KEYS[sg[1]])}`);
    }
    if (hn === hovered) lines.push("You are here");
    else if (hn !== undefined) {
      const r = routeOf(hn, hovered, ui.woken);
      lines.push(r ? `From you: ${r.length} step${r.length === 1 ? "" : "s"}` : "No road from here", ...(r ? routeLines(r).slice(0, 3) : []));
      if (ui.sel !== hovered) lines.push("Click to pick");
    }
    g.font = `12px ${font}`;
    const w = Math.round(Math.max(...lines.map((l) => g.measureText(l).width)) + 14), hh = lines.length * 16 + 8;
    const tx = Math.round(Math.min(W - w - 4, hover.x + 14)), ty = Math.round(Math.max(4, Math.min(H - hh - 4, hover.y + 10)));
    g.fillStyle = "rgba(10,8,6,0.95)"; g.fillRect(tx, ty, w, hh);
    g.strokeStyle = col; g.lineWidth = 1; g.strokeRect(tx + 0.5, ty + 0.5, w - 1, hh - 1);
    lines.forEach((l, i) => text(l, tx + 7, ty + 12 + i * 16, i === 0 ? GOLD : l.startsWith("Click") ? "#8fe0ff" : "#eadfc8", 12));
  }
  g.restore();
}

/** A small gold crown (11 x 6 art px at scale k), its top-left at (x, y): the clan a Reckoning crowned. */
function crownMark(g: CanvasRenderingContext2D, x: number, y: number, k: number) {
  g.fillStyle = "#0d0a07"; g.fillRect(x - k, y - k, 13 * k, 8 * k);
  g.fillStyle = "#ffd860";
  for (const [a, b, w, hh] of [[0, 3, 11, 3], [0, 0, 1, 3], [5, 0, 1, 3], [10, 0, 1, 3], [1, 1, 1, 2], [4, 1, 1, 2], [6, 1, 1, 2], [9, 1, 1, 2]]) g.fillRect(x + a * k, y + b * k, w * k, hh * k);
}

const routeCache = new Map<string, Step[] | undefined>();
/** findRoute, remembered: the table asks every frame. */
function routeOf(a: number, b: number, woken?: ReadonlySet<string>): Step[] | undefined {
  const key = `${a}|${b}|${woken ? [...woken].sort().join(",") : ""}`;
  if (!routeCache.has(key)) { if (routeCache.size > 400) routeCache.clear(); routeCache.set(key, findRoute(a, b, woken)); }
  return routeCache.get(key);
}
