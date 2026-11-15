import { MAP_W, SINKHOLES_H, SINKHOLES_Y0 } from "./constants";

/**
 * Act 5: the Mawdeep Sinkholes, the Hide-Kin's homeland (Lv 30-45). Damp green-brown country pocked with sinkholes,
 * collapsed slopes and burrow-warrens in its own band of the map (rows SINKHOLES_Y0..+SINKHOLES_H, under the badlands'
 * rock), walled in by loam cliffs like the other homelands (shared/badlands.ts), so collisions and pathing need nothing
 * special. Heroes come down the Sinkway (shared/act2.ts WAYGATES), a cave on the beach south of Sunken Lake, from hero
 * Lv 30, and climb out of a cave mouth at the band's north-west; the land climbs in level toward Hidehall, the
 * Hide-Kin's seat in the far south-east. Not to be confused with the Mawdeep Sinkhole, Act 1's way down into the
 * Mawdeep Warrens (shared/dungeon.ts SINKHOLE): the Hide-Kin who dug the Warrens came from here.
 *
 * This file is the land and its places. Ropewell (the outpost) and Hidehall are still bare ground: their buildings,
 * the monster zones and the war come later. Tile ids are passed in (shared/map.ts T) so this file does not import
 * map.ts. Layout constants are in local sinkholes coordinates (0..MAP_W, 0..SINKHOLES_H); `SR(y)` turns a local row
 * into a map row.
 */
export const SR = (y: number) => y + SINKHOLES_Y0;
/** True for a map row inside the sinkholes band. */
export const inSinkholesRow = (ty: number) => ty >= SINKHOLES_Y0 && ty < SINKHOLES_Y0 + SINKHOLES_H;

/** The Sinkway's sinkholes side (local tile): open ground at the foot of a cave mouth (CAVE_MOUTHS[0]); heroes step out just south of it. */
export const SINKGATE = { x: 96, y: 10 };
/**
 * Where the Sinkway stands on each side (map tiles): on the beach south of Sunken Lake, west of the River Ashwell's
 * mouth (Act 1), and at the sinkholes' arrival clearing.
 */
export const SINKWAY_OAKVALE = { x: 100, y: 190 };
export const SINKWAY_SINKHOLES = { x: SINKGATE.x, y: SR(SINKGATE.y) };
/** The Sinkway's Act 1 carve box (map tiles, inclusive): nothing else in Act 1 changed for it (tests/sinkholes.test.ts). */
export const SINKWAY_BOX = { x0: 94, x1: 112, y0: 177, y1: 196 };
/** The arrival clearing below the Sinkway's cave mouth (local tiles, ellipse): always open ground, nothing stands in it. */
export const SINKGATE_CLEARING = { x: 96.5, y: 14, rx: 8, ry: 5 };
/**
 * Ropewell, the sinkholes' outpost (local tiles): a camp of Hide-Kin who keep the old truce, round a well-shaft with
 * rope lifts, just south-east of the Sinkway. Bare ground for now; its buildings come with the zones.
 */
export const ROPEWELL = { x: 104, y: 18, w: 24, h: 18 };
/** Ropewell's square (local tiles): the sinkholes' safe zone (shared/map.ts isSafeZone), where heroes come back after dying. */
export const ROPEWELL_SQUARE = { x: 111, y: 23, w: 10, h: 7 };
/** Hidehall, the Hide-Kin's seat in the far south-east (local tiles): bare ground reserved for the great hall and its stockade. */
export const HIDEHALL = { x: 230, y: 126, w: 36, h: 32 };
/** The Great Maw: the biggest sinkhole of all, in the middle of the band (local tiles, ellipse of the pit). */
export const GREAT_MAW = { x: 150, y: 92, rx: 13, ry: 9 };
/** The lesser sinks (local tiles: centre, radii, `flooded`: a drowned pit of black water, else overgrown and sheer). */
export const SINKS: readonly { x: number; y: number; rx: number; ry: number; flooded: boolean }[] = (
  [[60, 40, 4, 3, 0], [178, 30, 5, 3, 1], [218, 52, 4, 3, 0], [40, 96, 5, 4, 1], [90, 70, 3, 2, 0], [120, 130, 5, 3, 1], [196, 110, 4, 3, 0],
    [262, 90, 4, 3, 1], [30, 150, 4, 3, 0], [150, 150, 5, 3, 0], [244, 30, 3, 2, 1], [80, 118, 3, 3, 0], [205, 150, 4, 3, 1], [118, 58, 3, 2, 0]] as const
).map(([x, y, rx, ry, f]) => ({ x, y, rx, ry, flooded: f === 1 }));
/** The Hide-Kin's burrow-warrens out on the land (local tiles: centre, radius): fields of burrow mounds round an open yard. */
export const WARRENS: readonly { name: string; x: number; y: number; r: number }[] = [
  { name: "The Old Warren", x: 54, y: 66, r: 8 },
  { name: "Tunneltop", x: 196, y: 70, r: 7 },
  { name: "The Gnawed Bank", x: 70, y: 146, r: 7 },
  { name: "Scratchroot Burrows", x: 250, y: 62, r: 7 },
];
/**
 * Cave mouths (local tiles): three CAVE tiles on row `y` (x-1..x+1) in the face of a loam knoll, open ground below.
 * The first is the Sinkway's own; the others are for the dungeons and quests to come.
 */
export const CAVE_MOUTHS: readonly { x: number; y: number }[] = [
  { x: SINKGATE.x, y: SINKGATE.y - 1 }, { x: 30, y: 70 }, { x: 200, y: 14 }, { x: 176, y: 116 }, { x: 262, y: 123 },
];
/**
 * The lands that will hold monster zones and war territories (local tiles), each with a 7x7 patch of clear ground
 * (`hold`, its middle) so a war Hold (shared/war/standards.ts, an inner 5x5 free of anything solid) always fits.
 */
export const SINK_LANDS: readonly { name: string; x: number; y: number; w: number; h: number; hold: [number, number] }[] = [
  { name: "Hollowbrook Dells", x: 16, y: 20, w: 60, h: 32, hold: [36, 40] },
  ...WARRENS.map((w) => ({ name: w.name, x: w.x - w.r - 2, y: w.y - w.r - 2, w: w.r * 2 + 5, h: w.r * 2 + 5, hold: [w.x, w.y] as [number, number] })),
  { name: "Mosslight Fen", x: 16, y: 84, w: 56, h: 40, hold: [44, 108] },
  { name: "Rootfall Slopes", x: 150, y: 16, w: 60, h: 34, hold: [166, 40] },
  { name: "The Great Maw", x: GREAT_MAW.x - GREAT_MAW.rx - 8, y: GREAT_MAW.y - GREAT_MAW.ry - 8, w: GREAT_MAW.rx * 2 + 17, h: GREAT_MAW.ry * 2 + 17, hold: [GREAT_MAW.x, GREAT_MAW.y + GREAT_MAW.ry + 3] },
  { name: "The Pitfields", x: 96, y: 118, w: 72, h: 44, hold: [136, 140] },
  { name: "Rushmere Hollows", x: 220, y: 76, w: 50, h: 40, hold: [236, 100] },
  { name: "Hidehall", x: HIDEHALL.x - 8, y: HIDEHALL.y - 8, w: HIDEHALL.w + 16, h: HIDEHALL.h + 14, hold: [HIDEHALL.x - 4, HIDEHALL.y + 16] },
];
/** Loam ridges out on the land (local tiles: centre, radii): lumps of cliff the trails wind round. */
const RIDGES: [number, number, number, number][] = [[84, 40, 6, 4], [130, 60, 7, 4], [230, 40, 5, 3], [110, 96, 6, 5], [200, 128, 6, 4], [36, 134, 6, 4], [180, 160, 6, 3]];
/** Collapsed slopes (local tiles: centre, radius): fans of rubble and tumbled boulders where the ground gave way. */
const SLIDES: [number, number, number][] = [[172, 26, 6], [192, 34, 5], [84, 48, 4], [130, 68, 4], [110, 104, 4], [44, 142, 4], [214, 120, 4]];

function hash(x: number, y: number, seed: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
function noise(x: number, y: number, scale: number, seed: number) {
  const fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = smooth(fx - x0), ty = smooth(fy - y0);
  const a = hash(x0, y0, seed), b = hash(x0 + 1, y0, seed), c = hash(x0, y0 + 1, seed), d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

export interface SinkholesTiles {
  GRASS_DARK: number; TALL_GRASS: number; DIRT: number; RUBBLE: number; FLAGS: number; WATER: number;
  TREE: number; BUSH: number; ROCK: number; STUMP: number; CLIFF: number; SIGNPOST: number;
  MOSS: number; PIT: number; BURROW: number; CAVE: number;
}
export interface SinkholesArea { name: string; x: number; y: number; w: number; h: number; mobs?: never[] }

/**
 * Builds the sinkholes into the map's ground/object grids (map coordinates). Deterministic (fixed seeds), like the rest
 * of the world. Returns its named areas (specific first), the road tiles and the signposts. Every open tile joins the
 * Sinkway's arrival.
 */
export function buildSinkholes(T: SinkholesTiles, ground: number[][], objects: number[][], EMPTY: number) {
  const Y0 = SINKHOLES_Y0, H = SINKHOLES_H, W = MAP_W;
  const inBand = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H;
  const setG = (x: number, y: number, t: number) => { if (inBand(x, y)) ground[y + Y0][x] = t; };
  const setO = (x: number, y: number, t: number) => { if (inBand(x, y)) objects[y + Y0][x] = t; };
  const getG = (x: number, y: number) => (inBand(x, y) ? ground[y + Y0][x] : -1);
  const getO = (x: number, y: number) => (inBand(x, y) ? objects[y + Y0][x] : T.CLIFF);
  const roads = new Set<number>(); // map index
  const keep = new Uint8Array(W * H); // tiles that must stay open (the gate, the reserved places, the trails)
  const cliff = new Uint8Array(W * H);
  const each = (x: number, y: number, w: number, h: number, f: (x: number, y: number) => void) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inBand(i, j)) f(i, j);
  };
  const disk = (cx: number, cy: number, rx: number, ry: number, f: (x: number, y: number, d: number) => void) =>
    each(Math.floor(cx - rx - 1), Math.floor(cy - ry - 1), Math.ceil(rx * 2 + 3), Math.ceil(ry * 2 + 3), (x, y) => {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
      if (d < 1) f(x, y, d);
    });
  const open = (x: number, y: number) => { if (inBand(x, y)) { keep[y * W + x] = 1; cliff[y * W + x] = 0; if (getO(x, y) === T.CLIFF) setO(x, y, EMPTY); } };
  /** A trail tile: trodden mud, clear of whatever stood there (it fords drowned ground on stepping stones of rubble). */
  const road = (x: number, y: number, t: number = T.DIRT) => {
    if (!inBand(x, y)) return;
    setG(x, y, getG(x, y) === T.WATER ? T.RUBBLE : t);
    setO(x, y, EMPTY); open(x, y);
    roads.add((y + Y0) * W + x);
  };
  /** Walks a Catmull-Rom curve through the waypoints, 4-connected, calling `put` on each tile. */
  const spline = (pts: [number, number][], put: (x: number, y: number) => void) => {
    const P = [pts[0], ...pts, pts[pts.length - 1]];
    let last: [number, number] | undefined;
    for (let i = 1; i < P.length - 2; i++) {
      const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      for (let k = 0; k <= len * 4; k++) {
        const u = k / Math.max(1, len * 4), u2 = u * u, u3 = u2 * u;
        const c = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
        const cx = Math.round(c(p0[0], p1[0], p2[0], p3[0])), cy = Math.round(c(p0[1], p1[1], p2[1], p3[1]));
        if (last && last[0] !== cx && last[1] !== cy) put(cx, last[1]);
        last = [cx, cy];
        put(cx, cy);
      }
    }
  };
  /** A winding trail, 1 tile wide with open verges (`wide` more on each side), through any rock on its way. */
  const trail = (pts: [number, number][], wide = 0) => spline(pts, (cx, cy) => {
    road(cx, cy);
    for (let j = -1 - wide; j <= 1 + wide; j++) for (let i = -1 - wide; i <= 1 + wide; i++) open(cx + i, cy + j);
  });

  // ---------- 1. Damp ground: dark grass, moss in the hollows, bare mud where water stands after rain ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = noise(x, y, 11, 1101), m = noise(x, y, 4, 1102);
    setG(x, y, n < 0.32 ? T.MOSS : n > 0.74 && m < 0.5 ? T.DIRT : m > 0.72 ? T.TALL_GRASS : T.GRASS_DARK);
    setO(x, y, EMPTY);
  }

  // ---------- 2. Loam cliffs: a ragged wall all round, ridges out on the land ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (d < 6 + noise(x, y, 9, 1111) * 8 + noise(x, y, 3, 1112) * 2) cliff[y * W + x] = 1;
  }
  RIDGES.forEach(([cx, cy, rx, ry], i) => disk(cx, cy, rx + 2, ry + 2, (x, y) => {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy < 0.8 + 0.4 * noise(x, y, 3, 1121 + i)) cliff[y * W + x] = 1;
  }));

  // ---------- 3. Places that must stay open ----------
  const clearDisk = (cx: number, cy: number, rx: number, ry: number) => disk(cx, cy, rx, ry, (x, y) => { cliff[y * W + x] = 0; keep[y * W + x] = 1; });
  const clearRect = (r: { x: number; y: number; w: number; h: number }, m: number) => clearDisk(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + m, r.h / 2 + m);
  const G = SINKGATE_CLEARING, O = ROPEWELL, M = GREAT_MAW;
  clearDisk(G.x, G.y + 2, G.rx + 3, G.ry + 1); // the cliff behind the cave mouth stays
  clearRect(O, 4); clearRect(HIDEHALL, 4);
  clearDisk(M.x, M.y, M.rx + 5, M.ry + 5);
  for (const w of WARRENS) clearDisk(w.x + 0.5, w.y + 0.5, w.r + 2, w.r + 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cliff[y * W + x]) setO(x, y, T.CLIFF);

  // ---------- 4. The cave mouths: a knoll of loam, the dark mouth in its south face, open ground in front ----------
  for (const c of CAVE_MOUTHS) {
    each(c.x - 3, c.y - 4, 7, 5, (x, y) => { setO(x, y, T.CLIFF); keep[y * W + x] = 0; });
    for (let i = -1; i <= 1; i++) setO(c.x + i, c.y, T.CAVE);
    each(c.x - 2, c.y + 1, 5, 3, (x, y) => { setO(x, y, EMPTY); open(x, y); setG(x, y, hash(x, y, 1131) < 0.6 ? T.DIRT : T.RUBBLE); });
  }

  // ---------- 5. The Sinkway's clearing: trodden mud, old flagstones laid at the cave's foot ----------
  disk(G.x, G.y, G.rx, G.ry, (x, y, d) => { if (y < SINKGATE.y) return; setO(x, y, EMPTY); open(x, y); setG(x, y, d < 0.5 ? T.DIRT : hash(x, y, 1141) < 0.6 ? T.MOSS : T.GRASS_DARK); });
  disk(SINKGATE.x + 0.5, SINKGATE.y + 1.5, 2.6, 2.2, (x, y, d) => setG(x, y, d > 0.6 && hash(x, y, 1142) < 0.5 ? T.RUBBLE : T.FLAGS));

  // ---------- 6. Ropewell's and Hidehall's ground: bare until they are raised ----------
  for (const r of [O, HIDEHALL]) each(r.x, r.y, r.w, r.h, (x, y) => { setO(x, y, EMPTY); open(x, y); setG(x, y, hash(x, y, 1151) < 0.75 ? T.DIRT : T.MOSS); });

  // ---------- 7. The Great Maw: a sheer pit, a rim of slumped moss and rubble round it ----------
  disk(M.x, M.y, M.rx + 4, M.ry + 4, (x, y) => { setO(x, y, EMPTY); open(x, y); setG(x, y, hash(x, y, 1161) < 0.55 ? T.MOSS : T.RUBBLE); });
  disk(M.x, M.y, M.rx, M.ry, (x, y, d) => { if (d < 1 - 0.12 * noise(x, y, 3, 1162)) { setO(x, y, T.PIT); keep[y * W + x] = 0; } });

  // ---------- 8. The lesser sinks: drowned pits of black water, or sheer holes choked with brush ----------
  for (const s of SINKS) {
    disk(s.x, s.y, s.rx + 2, s.ry + 2, (x, y) => { if (getO(x, y) === T.CLIFF) setO(x, y, EMPTY); setG(x, y, hash(x, y, 1171) < 0.7 ? T.MOSS : T.TALL_GRASS); });
    disk(s.x, s.y, s.rx, s.ry, (x, y) => { if (s.flooded) { setO(x, y, EMPTY); setG(x, y, T.WATER); } else setO(x, y, T.PIT); });
  }

  // ---------- 9. Collapsed slopes: rubble fans and tumbled boulders ----------
  SLIDES.forEach(([cx, cy, r], i) => disk(cx, cy, r, r * 0.8, (x, y) => {
    if (getO(x, y) !== EMPTY && getO(x, y) !== T.CLIFF) return;
    if (getO(x, y) === T.CLIFF && hash(x, y, 1181 + i) < 0.5) return; // the scarp crumbles back into the slope
    setO(x, y, hash(x, y, 1191 + i) < 0.16 ? T.ROCK : EMPTY); setG(x, y, hash(x, y, 1201) < 0.7 ? T.RUBBLE : T.DIRT);
  }));

  // ---------- 10. The warrens: burrow mounds round an open yard, runs left between them ----------
  for (const w of WARRENS) disk(w.x + 0.5, w.y + 0.5, w.r, w.r, (x, y, d) => {
    setO(x, y, EMPTY); setG(x, y, hash(x, y, 1211) < 0.6 ? T.DIRT : T.MOSS);
    if (d > 0.2 && (x + y) % 3 !== 0 && hash(x, y, 1212) < 0.3) setO(x, y, T.BURROW);
  });

  // ---------- 11. Trails: from the Sinkway to Ropewell, on round the Great Maw to Hidehall, ways to every place ----------
  const gate: [number, number] = [SINKGATE.x, SINKGATE.y + 3];
  const rim = (k: number): [number, number] => { const a = (k / 12) * Math.PI * 2; return [Math.round(M.x + Math.cos(a) * (M.rx + 2.5)), Math.round(M.y + Math.sin(a) * (M.ry + 2.5))]; };
  trail([gate, [100, 20], [O.x, O.y + 9]], 1);                                                               // the Sinkway to Ropewell
  trail([[O.x + O.w, O.y + 9], [140, 30], [158, 34], [180, 40], [196, 40]]);                                  // east to Rootfall Slopes
  trail([[196, 40], [200, 28], [200, 17]]);                                                                    // up to the slopes' cave
  trail([[O.x + 12, O.y + O.h], [118, 48], [124, 66], rim(7)], 1);                                             // south to the Great Maw
  trail([...Array.from({ length: 13 }, (_, k) => rim(k))]);                                                     // the path round the Maw's rim
  trail([rim(0), [190, 96], [214, 100], [236, 104], [244, 118], [248, HIDEHALL.y]], 1);                        // east, on to Hidehall
  trail([rim(3), [146, 120], [136, 136]]);                                                                      // down to the Pitfields
  trail([[136, 140], [104, 148], [78, 146]]);                                                                   // west to the Gnawed Bank
  trail([[136, 140], [160, 146], [190, 150], [218, 146], [HIDEHALL.x, 142]]);                                   // the back way to Hidehall
  trail([[176, 119], [160, 124], [146, 120]]);                                                                  // the Maw's south cave
  trail([[O.x, O.y + 12], [86, 32], [60, 34], [36, 40]]);                                                       // west into the Dells
  trail([[60, 34], [56, 48], [54, 58]]);                                                                        // down to the Old Warren
  trail([[54, 74], [48, 86], [44, 104]]);                                                                       // on to Mosslight Fen
  trail([[48, 80], [34, 76], [30, 73]]);                                                                        // the Fen's cave
  trail([[44, 112], [56, 130], [66, 140]]);                                                                     // the Fen to the Gnawed Bank
  trail([rim(10), [180, 74], [WARRENS[1].x - 4, WARRENS[1].y]]);                                                // up to Tunneltop
  trail([[236, 104], [244, 80], [250, 69]]);                                                                    // north to Scratchroot Burrows

  // ---------- 12. Scatter: willows and alders, brush, boulders under the cliffs, rotten stumps ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (getO(x, y) !== EMPTY || keep[y * W + x] || roads.has((y + Y0) * W + x) || getG(x, y) === T.WATER) continue;
    const h = hash(x, y, 1221), near = (dx: number, dy: number) => getO(x + dx, y + dy) === T.CLIFF;
    const foot = near(1, 0) || near(-1, 0) || near(0, 1) || near(0, -1);
    const copse = noise(x, y, 10, 1222) > 0.7; // damp copses of willow and alder
    if (foot && h < 0.14) setO(x, y, T.ROCK);
    else if (copse && h < 0.22) setO(x, y, h < 0.1 ? T.TREE : T.BUSH);
    else if (h < 0.012) setO(x, y, T.TREE);
    else if (h < 0.03) setO(x, y, T.BUSH); // brush (walk-through)
    else if (h < 0.036) setO(x, y, T.ROCK);
    else if (h < 0.042) setO(x, y, T.STUMP);
  }
  // the roads keep a clear verge
  for (const k of roads) {
    const x = k % W, y = ((k / W) | 0) - Y0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const o = getO(x + i, y + j); if (o === T.ROCK || o === T.BUSH || o === T.STUMP || o === T.TREE) setO(x + i, y + j, EMPTY); }
  }
  // Ropewell and Hidehall stand on bare ground; every future zone keeps a 7x7 of clear ground for a war Hold
  for (const r of [O, HIDEHALL]) each(r.x, r.y, r.w, r.h, (x, y) => setO(x, y, EMPTY));
  for (const l of SINK_LANDS) each(l.hold[0] - 3, l.hold[1] - 3, 7, 7, (x, y) => { setO(x, y, EMPTY); open(x, y); if (getG(x, y) === T.WATER) setG(x, y, T.MOSS); });

  // ---------- 13. Reachability: every open tile joins the Sinkway (pockets cut off by rock or water are filled in) ----------
  const solid = (x: number, y: number) => {
    if (!inBand(x, y)) return true;
    const o = getO(x, y);
    return (o !== EMPTY && o !== T.BUSH) || getG(x, y) === T.WATER;
  };
  const seen = new Uint8Array(W * H);
  const q = [(SINKGATE.y + 2) * W + SINKGATE.x]; seen[q[0]] = 1; // the arrival spot
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % W, y = (q[i] / W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (solid(nx, ny) || seen[ny * W + nx]) continue;
      seen[ny * W + nx] = 1; q.push(ny * W + nx);
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!seen[y * W + x] && !solid(x, y)) setO(x, y, T.CLIFF);

  // ---------- 14. Named areas (specific first) ----------
  const A = (name: string, x: number, y: number, w: number, h: number): SinkholesArea => ({ name, x: Math.floor(x), y: Math.floor(y) + Y0, w: Math.ceil(w), h: Math.ceil(h) });
  const Q = ROPEWELL_SQUARE;
  const areas: SinkholesArea[] = [
    A("Ropewell Square", Q.x, Q.y, Q.w, Q.h),
    A("Ropewell", O.x, O.y, O.w, O.h),
    A("The Sinkway", G.x - G.rx, G.y - G.ry - 2, G.rx * 2, G.ry * 2 + 2),
    ...SINK_LANDS.map((l) => A(l.name, l.x, l.y, l.w, l.h)),
    A("The Mawdeep Sinkholes", 0, 0, W, H),
  ];
  // signposts at the road junctions (local tiles; put on the free tile beside the nearest road)
  const wanted: { x: number; y: number; to: string[] }[] = [
    { x: gate[0] + 3, y: gate[1] + 3, to: ["Ropewell", "The Sinkway"] },                                   // out of the Sinkway
    { x: 118, y: 48, to: ["The Great Maw", "Ropewell"] },                                                  // Ropewell's south road
    { x: 86, y: 32, to: ["Hollowbrook Dells", "The Old Warren", "Ropewell"] },                              // Ropewell's west road
    { x: 190, y: 96, to: ["Hidehall", "Rushmere Hollows", "The Great Maw"] },                              // east of the Maw
    { x: 146, y: 120, to: ["The Pitfields", "The Great Maw"] },                                            // south of the Maw
  ];
  const posts: { x: number; y: number; to: string[] }[] = []; // map tiles, as shared/map.ts SIGNPOSTS wants them
  for (const p of wanted) {
    let best: [number, number] | undefined, bd = Infinity;
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      const x = p.x + i, y = p.y + j;
      if (!inBand(x, y) || getO(x, y) !== EMPTY || roads.has((y + Y0) * W + x) || !seen[y * W + x] || getG(x, y) === T.WATER) continue;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => roads.has((y + dy + Y0) * W + x + dx))) continue;
      if (Math.hypot(i, j) < bd) { bd = Math.hypot(i, j); best = [x, y]; }
    }
    if (best) { setO(best[0], best[1], T.SIGNPOST); posts.push({ x: best[0], y: best[1] + Y0, to: p.to }); }
  }
  return { areas, roads, posts };
}
