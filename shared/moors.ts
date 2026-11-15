import { MAP_W, MOORS_H, MOORS_Y0 } from "./constants";

/**
 * Act 3: the Grey Barrow Moors, the Ossuary Host's homeland (Lv 20-35). Misty barrow country in its own band of the
 * map (rows MOORS_Y0..+MOORS_H, under the deep band's rock), walled in by grey crags like the desert (shared/desert.ts),
 * so collisions and pathing need nothing special. Heroes come through the moorgate at Act 1's north-east edge
 * (shared/act2.ts WAYGATES) from hero Lv 20.
 *
 * This file is the land: its places, Cairnwatch (the outpost) and the Host's camp. Monster zones are in shared/spawns.ts,
 * the monsters in shared/constants.ts (MOORS_KINDS). Tile ids are passed in (shared/map.ts T) so this file does not
 * import map.ts. Layout constants are in local moors coordinates (0..MAP_W, 0..MOORS_H); `MR(y)` turns a local row
 * into a map row.
 */
export const MR = (y: number) => y + MOORS_Y0;
/** True for a map row inside the moors band. */
export const inMoorsRow = (ty: number) => ty >= MOORS_Y0 && ty < MOORS_Y0 + MOORS_H;

/** The moorgate's moors side (local tile): a ring of grey stones in a clearing; heroes step out just south of it. */
export const MOORGATE = { x: 52, y: 118 };
/**
 * Where the moorgate stands on each side (map tiles): in a dais cut into the border forest at Act 1's north-east edge
 * (north of the Hollow Throne), and in the moors' arrival clearing.
 */
export const MOORSGATE_OAKVALE = { x: 277, y: 4 };
export const MOORSGATE_MOORS = { x: MOORGATE.x, y: MR(MOORGATE.y) };
/** The arrival clearing round the moorgate (local tiles, ellipse): always open ground, nothing stands in it. */
export const MOORGATE_CLEARING = { x: 52.5, y: 119.5, rx: 10, ry: 8 };
/**
 * Cairnwatch, the moors' outpost (local tiles): a palisaded hill-fort of grey stone halls held by the Cairn Wardens,
 * moor-folk who keep the old cairns and hold out against the Ossuary Host. Gates north, east and south (the road from
 * the moorgate comes in at the south gate).
 */
export const MOORS_OUTPOST = { x: 64, y: 100, w: 26, h: 18 };
export const CAIRNWATCH = MOORS_OUTPOST;
/** Cairnwatch's square (local tiles): the moors' safe zone (shared/map.ts isSafeZone), where heroes come back after dying. */
export const CAIRN_SQUARE = { x: 73, y: 106, w: 12, h: 8 };
/** Gate gaps in Cairnwatch's palisade (local tiles): x range on the north / south walls, y range on the east wall. */
export const CAIRN_GATES = { north: [67, 69], south: [76, 78], east: [107, 109] } as const;
/** Cairnwatch's portal stone (local tile), in the yard west of the square (shared/map.ts PORTAL_SPOTS). */
export const CAIRN_PORTAL = { x: 69, y: 109 };
/** The Barrow-King's mound in the heart of Kingsbarrow (local tiles): his lair (shared/spawns.ts), dug open, a ring of bones. */
export const KINGS_MOUND = { x: 236, y: 50, rx: 4, ry: 3 };
/** The Ossuary Host's war camp on the far eastern moor (local tiles): bone banners and cairns of skulls round a muster ground. */
export const HOST_CAMP = { x: 262, y: 82, rx: 12, ry: 9 };
/** Barrow fields: grassy burial mounds in rows, the Ossuary Host's old dead (local tiles). */
export const BARROW_FIELDS = [
  { name: "The Cairnfield", x: 104, y: 40, rx: 18, ry: 12 },
  { name: "Kingsbarrow", x: 236, y: 52, rx: 16, ry: 12 },
  { name: "The Hollow Mounds", x: 186, y: 134, rx: 18, ry: 11 },
  { name: "Thane's Rest", x: 128, y: 146, rx: 13, ry: 9 },
];
/** Rings of standing stones (local tiles, ring radius). */
export const STONE_RINGS = [
  { name: "The Grey Ring", x: 124, y: 96, r: 6 },
  { name: "The Nine Widows", x: 212, y: 28, r: 5 },
  { name: "The Weeping Stones", x: 252, y: 138, r: 7 },
];
/** Fens: dark bog pools in sodden mire (local tiles). */
export const FENS = [
  { name: "Blackwater Fen", x: 160, y: 76, rx: 20, ry: 13 },
  { name: "Sorrow Mire", x: 38, y: 46, rx: 15, ry: 11 },
  { name: "The Drowned Hollow", x: 212, y: 96, rx: 13, ry: 9 },
];
/** Mist hollows: low ground where the fog lies thick all day (cosmetic, the client draws the fog; local tiles). */
export const MIST_HOLLOWS = [
  { x: 160, y: 76, rx: 26, ry: 17 },
  { x: 38, y: 46, rx: 19, ry: 14 },
  { x: 212, y: 96, rx: 17, ry: 12 },
  { x: 86, y: 70, rx: 12, ry: 8 },
  { x: 260, y: 100, rx: 12, ry: 9 },
];

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

export interface MoorsTiles {
  GRASS_DARK: number; TALL_GRASS: number; DIRT: number; WATER: number; FLAGS: number; RUBBLE: number; COBBLE: number;
  ROCK: number; BUSH: number; STUMP: number; CLIFF: number;
  HEATHER: number; BOG: number; BARROW: number; STANDING_STONE: number; BONE_PILE: number; SIGNPOST: number;
  // Cairnwatch: grey stone halls under slate, a timber palisade, the yard's props
  PALISADE: number; ROOF_SLATE: number; WALL_STONE: number; WINDOW_STONE: number; DOOR: number; WELL: number;
  BARREL: number; CRATE: number; HAY: number; STALL_BLUE: number; BONFIRE: number; CAMPFIRE: number; FENCE: number; TENT: number;
}
export interface MoorsArea { name: string; x: number; y: number; w: number; h: number; mobs?: never[] }

/**
 * Builds the moors into the map's ground/object grids (map coordinates). Deterministic (fixed seeds), like the rest of
 * the world. Returns its named areas (specific first) and the road tiles. Every open tile joins the moorgate.
 */
export function buildMoors(T: MoorsTiles, ground: number[][], objects: number[][], EMPTY: number) {
  const Y0 = MOORS_Y0, H = MOORS_H, W = MAP_W;
  const inBand = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H;
  const setG = (x: number, y: number, t: number) => { if (inBand(x, y)) ground[y + Y0][x] = t; };
  const setO = (x: number, y: number, t: number) => { if (inBand(x, y)) objects[y + Y0][x] = t; };
  const getG = (x: number, y: number) => (inBand(x, y) ? ground[y + Y0][x] : -1);
  const getO = (x: number, y: number) => (inBand(x, y) ? objects[y + Y0][x] : T.CLIFF);
  const roads = new Set<number>(); // map index
  const keep = new Uint8Array(W * H); // tiles that must stay open (the gate, the outpost, the trails)
  const each = (x: number, y: number, w: number, h: number, f: (x: number, y: number) => void) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inBand(i, j)) f(i, j);
  };
  const disk = (cx: number, cy: number, rx: number, ry: number, f: (x: number, y: number, d: number) => void) =>
    each(Math.floor(cx - rx - 1), Math.floor(cy - ry - 1), Math.ceil(rx * 2 + 3), Math.ceil(ry * 2 + 3), (x, y) => {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
      if (d < 1) f(x, y, d);
    });
  const cliff = new Uint8Array(W * H);
  const open = (x: number, y: number) => { if (inBand(x, y)) { keep[y * W + x] = 1; cliff[y * W + x] = 0; if (getO(x, y) === T.CLIFF) setO(x, y, EMPTY); } };
  /** A trail tile: a causeway of packed peat over the bog water, clear of whatever stood there. */
  const road = (x: number, y: number, t: number = T.DIRT) => {
    if (!inBand(x, y)) return;
    setG(x, y, getG(x, y) === T.WATER ? T.BOG : t);
    setO(x, y, EMPTY); open(x, y);
    roads.add((y + Y0) * W + x);
  };
  /** A winding trail through waypoints (Catmull-Rom), 1 tile wide and 4-connected, through any crag on its way. */
  const trail = (pts: [number, number][], t: number = T.DIRT, wide = 0) => {
    const P = [pts[0], ...pts, pts[pts.length - 1]];
    let last: [number, number] | undefined;
    for (let i = 1; i < P.length - 2; i++) {
      const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      for (let k = 0; k <= len * 4; k++) {
        const u = k / Math.max(1, len * 4), u2 = u * u, u3 = u2 * u;
        const c = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
        const cx = Math.round(c(p0[0], p1[0], p2[0], p3[0])), cy = Math.round(c(p0[1], p1[1], p2[1], p3[1]));
        if (last && last[0] !== cx && last[1] !== cy) road(cx, last[1], t);
        last = [cx, cy];
        road(cx, cy, t);
        for (let j = -1 - wide; j <= 1 + wide; j++) for (let i2 = -1 - wide; i2 <= 1 + wide; i2++) open(cx + i2, cy + j);
      }
    }
  };

  // ---------- 1. Heather everywhere, moor grass and sedge in the dips, bare peat where it wears thin ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = noise(x, y, 11, 701), m = noise(x, y, 4, 702);
    setG(x, y, n < 0.26 ? T.GRASS_DARK : n > 0.74 ? T.TALL_GRASS : n < 0.32 && m < 0.4 ? T.DIRT : T.HEATHER);
    setO(x, y, EMPTY);
  }

  // ---------- 2. Crags: a ragged ring of grey rock all round, low ridges across the moor ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (d < 6 + noise(x, y, 9, 711) * 8 + noise(x, y, 3, 712) * 2) cliff[y * W + x] = 1;
  }
  const ridge = (pts: [number, number][], r: number, seed: number) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
      for (let k = 0; k <= n; k++) {
        const t = k / n, px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
        const rr = r * (0.5 + 0.7 * noise(px, py, 6, seed));
        for (let y = Math.floor(py - rr - 2); y <= py + rr + 2; y++) for (let x = Math.floor(px - rr - 2); x <= px + rr + 2; x++) {
          if (inBand(x, y) && Math.hypot(x + 0.5 - px, y + 0.5 - py) < rr + (noise(x, y, 2.5, seed + 1) - 0.5) * 2) cliff[y * W + x] = 1;
        }
      }
    }
  };
  ridge([[70, 14], [78, 40], [72, 62]], 2.6, 721);         // the Greyback, west of the Cairnfield
  ridge([[136, 18], [150, 34], [176, 40]], 2.4, 722);      // the Moot Edge
  ridge([[96, 124], [110, 116], [118, 128], [106, 160]], 2.2, 723);
  ridge([[188, 52], [196, 74], [190, 100], [178, 112]], 2.6, 724); // the Witherscar, between the fen and Kingsbarrow
  ridge([[232, 112], [246, 118], [268, 112]], 2.2, 725);
  ridge([[150, 112], [162, 118], [160, 134]], 2, 726);
  // tors: lone heaps of granite on the heather
  const tor = (cx: number, cy: number, rx: number, ry: number, seed: number) => disk(cx, cy, rx + 1, ry + 1, (x, y) => {
    const a = Math.atan2(y - cy, x - cx), wob = 0.8 + 0.3 * noise(Math.cos(a) * 3 + seed, Math.sin(a) * 3, 1, seed);
    if (Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry) < wob) cliff[y * W + x] = 1;
  });
  for (const [cx, cy, rx, ry, s] of [[28, 92, 3, 2.5, 731], [96, 92, 2.5, 2, 732], [142, 60, 3, 2, 733], [266, 70, 3, 3.5, 734], [222, 150, 3.5, 2.5, 735], [58, 154, 3, 2, 736], [176, 18, 2.5, 2, 737]] as const) tor(cx, cy, rx, ry, s);

  // ---------- 3. Places that must stay open ----------
  const clearDisk = (cx: number, cy: number, rx: number, ry: number) => disk(cx, cy, rx, ry, (x, y) => { cliff[y * W + x] = 0; keep[y * W + x] = 1; });
  const G = MOORGATE_CLEARING, O = MOORS_OUTPOST;
  clearDisk(G.x, G.y, G.rx + 3, G.ry + 3);
  clearDisk(O.x + O.w / 2, O.y + O.h / 2, O.w / 2 + 4, O.h / 2 + 4);
  for (const b of BARROW_FIELDS) clearDisk(b.x, b.y, b.rx + 3, b.ry + 3);
  for (const r of STONE_RINGS) clearDisk(r.x + 0.5, r.y + 0.5, r.r + 4, r.r + 3);
  for (const f of FENS) clearDisk(f.x, f.y, f.rx + 3, f.ry + 3);
  clearDisk(HOST_CAMP.x, HOST_CAMP.y, HOST_CAMP.rx + 3, HOST_CAMP.ry + 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cliff[y * W + x]) setO(x, y, T.CLIFF);

  // ---------- 4. Fens: black pools in soft mire, sedge round the edges, drowned trees ----------
  FENS.forEach((f, i) => {
    const s = 741 + i * 7;
    disk(f.x, f.y, f.rx + 3, f.ry + 3, (x, y, d) => { if (getO(x, y) !== T.CLIFF && (d < 0.8 || hash(x, y, s) < 0.55)) setG(x, y, hash(x, y, s + 1) < 0.25 ? T.TALL_GRASS : T.BOG); });
    disk(f.x, f.y, f.rx, f.ry, (x, y, d) => { if (noise(x, y, 4, s + 2) > 0.5 + d * 0.25) { setG(x, y, T.WATER); setO(x, y, EMPTY); } });
    disk(f.x, f.y, f.rx + 2, f.ry + 2, (x, y) => {
      if (getG(x, y) === T.WATER || getO(x, y) !== EMPTY) return;
      const h = hash(x, y, s + 3);
      if (h < 0.035) setO(x, y, T.STUMP); else if (h < 0.08) setO(x, y, T.BUSH);
    });
  });
  // small bog pools out on the moor
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (getO(x, y) !== EMPTY || keep[y * W + x]) continue;
    const n = noise(x, y, 5, 751);
    if (n > 0.86) setG(x, y, T.WATER); else if (n > 0.8) setG(x, y, T.BOG);
  }

  // ---------- 5. The moorgate: a ring of grey stones on worn flags, a clearing of short turf round it ----------
  disk(G.x, G.y, G.rx, G.ry, (x, y, d) => { setO(x, y, EMPTY); open(x, y); setG(x, y, d < 0.6 ? T.GRASS_DARK : hash(x, y, 761) < 0.7 ? T.HEATHER : T.GRASS_DARK); });
  disk(MOORGATE.x + 0.5, MOORGATE.y + 0.5, 3.6, 3, (x, y, d) => setG(x, y, d > 0.7 && hash(x, y, 762) < 0.45 ? T.RUBBLE : T.FLAGS));
  for (let k = 0; k < 7; k++) {
    if (k === 2) continue; // the gap on the south side: the way out
    const a = (k / 7) * Math.PI * 2 + Math.PI / 2 + 0.45, sx = Math.round(MOORGATE.x + Math.cos(a) * 5.5), sy = Math.round(MOORGATE.y + Math.sin(a) * 4.5);
    if (Math.abs(sx - MOORGATE.x) < 2 && sy > MOORGATE.y) continue; // never on the arrival spot
    setO(sx, sy, T.STANDING_STONE);
  }
  // ---------- 6. The outpost's ground: flat, empty turf (Cairnwatch is raised on it after the roads, step 9b) ----------
  each(O.x, O.y, O.w, O.h, (x, y) => { setO(x, y, EMPTY); open(x, y); setG(x, y, hash(x, y, 771) < 0.75 ? T.GRASS_DARK : T.HEATHER); });

  // ---------- 7. Barrow fields: mounds in loose rows, stone-lined mouths, bones heaped by the old doors ----------
  BARROW_FIELDS.forEach((b, i) => {
    const s = 781 + i * 11;
    disk(b.x, b.y, b.rx, b.ry, (x, y) => { if (getG(x, y) !== T.WATER) setG(x, y, hash(x, y, s) < 0.6 ? T.GRASS_DARK : T.HEATHER); });
    for (let gy = -b.ry + 2; gy <= b.ry - 2; gy += 4) for (let gx = -b.rx + 2; gx <= b.rx - 2; gx += 5) {
      const cx = Math.round(b.x + gx + (hash(gx, gy, s + 1) - 0.5) * 2), cy = Math.round(b.y + gy + (hash(gx, gy, s + 2) - 0.5) * 1.5);
      if (((cx - b.x) / b.rx) ** 2 + ((cy - b.y) / b.ry) ** 2 > 0.85 || hash(gx, gy, s + 3) < 0.12) continue;
      const w = hash(gx, gy, s + 4) < 0.5 ? 2 : 3; // a mound two or three wide, one row deep
      for (let k = 0; k < w; k++) { setO(cx + k, cy, T.BARROW); setG(cx + k, cy, T.GRASS_DARK); }
      if (hash(gx, gy, s + 5) < 0.4) setO(cx + w, cy + 1, T.BONE_PILE);
    }
  });

  // ---------- 8. Stone rings ----------
  STONE_RINGS.forEach((r, i) => {
    disk(r.x + 0.5, r.y + 0.5, r.r + 1.5, (r.r + 1.5) * 0.85, (x, y) => { setO(x, y, EMPTY); open(x, y); setG(x, y, hash(x, y, 791 + i) < 0.8 ? T.GRASS_DARK : T.RUBBLE); });
    const n = 9 + i * 2;
    for (let k = 0; k < n; k++) {
      if (k === 1 || k === Math.floor(n / 2) + 1) continue; // two fallen: the ways in
      const a = (k / n) * Math.PI * 2, sx = Math.round(r.x + Math.cos(a) * r.r), sy = Math.round(r.y + Math.sin(a) * r.r * 0.85);
      setO(sx, sy, T.STANDING_STONE);
    }
    setO(r.x, r.y, T.STANDING_STONE); // the tall king-stone in the middle
  });

  // ---------- 9. Corpse roads: the old ways the dead were carried to the barrows ----------
  const gate: [number, number] = [MOORGATE.x, MOORGATE.y + 4];
  const ox = O.x + (O.w >> 1), oy = O.y + O.h;
  trail([gate, [58, 124], [ox - 6, oy + 4], [ox, oy]]);                                                               // the moorgate to the outpost
  trail([[O.x + O.w, O.y + 8], [100, 104], [STONE_RINGS[0].x - 6, STONE_RINGS[0].y + 2]]);                           // east to the Grey Ring
  trail([[STONE_RINGS[0].x + 1, STONE_RINGS[0].y - 6], [116, 74], [BARROW_FIELDS[0].x, BARROW_FIELDS[0].y + BARROW_FIELDS[0].ry]], T.FLAGS); // north to the Cairnfield
  trail([[STONE_RINGS[0].x + 7, STONE_RINGS[0].y], [146, 98], [168, 100], [186, 104], [202, 108]]);                  // the Fen Road
  trail([[186, 104], [196, 120], [BARROW_FIELDS[2].x, BARROW_FIELDS[2].y - BARROW_FIELDS[2].ry]], T.FLAGS);          // to the Hollow Mounds
  trail([[BARROW_FIELDS[2].x + BARROW_FIELDS[2].rx, BARROW_FIELDS[2].y], [228, 136], [STONE_RINGS[2].x - 8, STONE_RINGS[2].y]]); // on to the Weeping Stones
  trail([[202, 108], [222, 84], [230, 70], [BARROW_FIELDS[1].x, BARROW_FIELDS[1].y + BARROW_FIELDS[1].ry]], T.DIRT, 1); // the climb to Kingsbarrow
  trail([[BARROW_FIELDS[1].x - 6, BARROW_FIELDS[1].y - BARROW_FIELDS[1].ry], [222, 34], [STONE_RINGS[1].x + 2, STONE_RINGS[1].y + 6]]); // Kingsbarrow to the Nine Widows
  trail([[BARROW_FIELDS[0].x + BARROW_FIELDS[0].rx, BARROW_FIELDS[0].y - 4], [140, 32], [168, 24], [STONE_RINGS[1].x - 6, STONE_RINGS[1].y]]); // the High Way along the north
  trail([[O.x + 4, O.y], [62, 84], [50, 64], [FENS[1].x + 6, FENS[1].y + FENS[1].ry]]);                             // north-west to Sorrow Mire
  trail([[ox, oy + 2], [104, 132], [BARROW_FIELDS[3].x - BARROW_FIELDS[3].rx, BARROW_FIELDS[3].y]], T.FLAGS);        // south-east to Thane's Rest
  trail([[BARROW_FIELDS[3].x + BARROW_FIELDS[3].rx, BARROW_FIELDS[3].y - 2], [158, 140], [BARROW_FIELDS[2].x - BARROW_FIELDS[2].rx, BARROW_FIELDS[2].y + 2]]);
  trail([[FENS[0].x - 4, FENS[0].y + FENS[0].ry + 2], [156, 94]]);                                                    // a causeway into Blackwater Fen

  trail([[202, 108], [226, 98], [244, 92], [HOST_CAMP.x - HOST_CAMP.rx, HOST_CAMP.y + 2]]);                           // the Host's road east to its camp

  // ---------- 9b. Cairnwatch: a timber palisade round grey stone halls, a paved square with the wardens' fire ----------
  {
    const C = CAIRNWATCH, Q = CAIRN_SQUARE, Gt = CAIRN_GATES;
    const x1 = C.x + C.w - 1, y1 = C.y + C.h - 1;
    each(C.x, C.y, C.w, C.h, (x, y) => { setO(x, y, EMPTY); open(x, y); setG(x, y, hash(x, y, 771) < 0.75 ? T.GRASS_DARK : T.HEATHER); });
    // the square, and paths from it to the three gates and the halls
    each(Q.x, Q.y, Q.w, Q.h, (x, y) => road(x, y, T.COBBLE));
    for (let y = Q.y + Q.h; y <= y1; y++) road(Gt.south[0] + 1, y);                 // the south gate
    for (let x = Q.x + Q.w; x <= x1; x++) road(x, Gt.east[0] + 1);                  // the east gate
    road(Gt.north[0] + 1, C.y); road(Gt.north[0] + 1, C.y + 1);                       // the north gate, then east behind the hall
    for (let x = Gt.north[0] + 1; x < Q.x; x++) road(x, C.y + 1);
    for (let y = C.y + 1; y < Q.y; y++) road(Q.x, y);
    // halls: slate roofs over grey stone, a door in the front wall (two rows of wall, like the valley's houses)
    const hall = (x: number, y: number, w: number, h: number) => {
      each(x, y, w, h - 2, (i, j) => setO(i, j, T.ROOF_SLATE));
      each(x, y + h - 2, w, 2, (i, j) => setO(i, j, T.WALL_STONE));
      const door = x + Math.floor(w / 2);
      setO(door, y + h - 1, T.DOOR);
      for (const wx of [x + 1, x + w - 2]) if (wx !== door) setO(wx, y + h - 1, T.WINDOW_STONE);
    };
    hall(65, 102, 7, 4);  // the Wardens' Hall (the captain)
    hall(75, 102, 5, 4);  // the herbwife's house
    hall(82, 102, 6, 4);  // the barracks
    hall(65, 113, 5, 3);  // the cairn-keeper's lodge
    hall(85, 112, 4, 4);  // the armoury
    // the timber palisade, broken by the three gates
    const post = (x: number, y: number) => { if (!roads.has((y + Y0) * W + x)) setO(x, y, T.PALISADE); };
    for (let x = C.x; x <= x1; x++) {
      if (x < Gt.north[0] || x > Gt.north[1]) post(x, C.y);
      if (x < Gt.south[0] || x > Gt.south[1]) post(x, y1);
    }
    for (let y = C.y + 1; y < y1; y++) { post(C.x, y); if (y < Gt.east[0] || y > Gt.east[1]) post(x1, y); }
    // the wardens' fire in the square, a well, stores and the herbwife's stall
    setO(Q.x + 6, Q.y + 4, T.BONFIRE);
    setO(Q.x + 1, Q.y + Q.h - 1, T.WELL);
    setO(Q.x + 3, Q.y, T.STALL_BLUE);
    for (const [bx, by, t] of [[80, 105, T.BARREL], [81, 105, T.CRATE], [72, 104, T.BARREL], [88, 106, T.HAY], [88, 107, T.HAY], [84, 115, T.CRATE], [71, 116, T.BARREL]] as const) setO(bx, by, t);
    // the cairns the wardens keep: a ring of grey stones round the portal stone's yard
    for (const [sx, sy] of [[66, 107], [66, 111], [72, 107]] as const) setO(sx, sy, T.STANDING_STONE);
    each(CAIRN_PORTAL.x - 2, CAIRN_PORTAL.y - 1, 5, 3, (x, y) => setG(x, y, T.FLAGS));
  }

  // ---------- 9c. The Barrow-King's mound and the Host's war camp ----------
  {
    const K = KINGS_MOUND;
    disk(K.x + 0.5, K.y + 0.5, K.rx + 1.5, K.ry + 1.5, (x, y, d) => { setO(x, y, EMPTY); open(x, y); setG(x, y, d < 0.5 ? T.FLAGS : hash(x, y, 811) < 0.5 ? T.RUBBLE : T.GRASS_DARK); });
    for (let k = 0; k < 8; k++) {
      if (k === 2) continue; // the way in, from the climb up from the south
      const a = (k / 8) * Math.PI * 2, bx = Math.round(K.x + Math.cos(a) * K.rx), by = Math.round(K.y + Math.sin(a) * K.ry);
      setO(bx, by, k % 2 ? T.BONE_PILE : T.STANDING_STONE);
    }
    const H2 = HOST_CAMP;
    disk(H2.x, H2.y, H2.rx, H2.ry, (x, y, d) => { setO(x, y, EMPTY); open(x, y); if (d < 0.6 && hash(x, y, 821) < 0.6) setG(x, y, T.DIRT); });
    setO(H2.x, H2.y, T.CAMPFIRE);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.3, tx = Math.round(H2.x + Math.cos(a) * H2.rx * 0.6), ty = Math.round(H2.y + Math.sin(a) * H2.ry * 0.6);
      setO(tx, ty, k % 3 === 0 ? T.BONE_PILE : T.TENT);
    }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2, tx = Math.round(H2.x + Math.cos(a) * H2.rx * 0.88), ty = Math.round(H2.y + Math.sin(a) * H2.ry * 0.88);
      if (getO(tx, ty) === EMPTY) setO(tx, ty, T.STANDING_STONE); // the skull-cairns on the camp's rim
    }
  }

  // ---------- 10. Scatter: dead trees, gorse, lone stones, bones, boulders at the foot of the crags ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (getO(x, y) !== EMPTY || keep[y * W + x] || roads.has((y + Y0) * W + x) || getG(x, y) === T.WATER) continue;
    const h = hash(x, y, 801), near = (dx: number, dy: number) => getO(x + dx, y + dy) === T.CLIFF;
    const foot = near(1, 0) || near(-1, 0) || near(0, 1) || near(0, -1);
    const wood = noise(x, y, 8, 802) > 0.7; // copses of dead birch
    if (foot && h < 0.14) setO(x, y, T.ROCK);
    else if (wood && h < 0.16) setO(x, y, T.STUMP);
    else if (h < 0.005) setO(x, y, T.ROCK);
    else if (h < 0.02) setO(x, y, T.BUSH); // gorse (walk-through)
    else if (h < 0.024) setO(x, y, T.STUMP);
    else if (h < 0.0265) setO(x, y, T.STANDING_STONE);
    else if (h < 0.029) setO(x, y, T.BONE_PILE);
  }
  // the roads keep a clear verge
  for (const k of roads) {
    const x = k % W, y = ((k / W) | 0) - Y0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const o = getO(x + i, y + j); if (o === T.ROCK || o === T.BUSH || o === T.STUMP || o === T.BONE_PILE) setO(x + i, y + j, EMPTY); }
  }

  // ---------- 11. Reachability: every open tile joins the moorgate (pockets cut off by crags and pools are filled in) ----------
  const solid = (x: number, y: number) => {
    if (!inBand(x, y)) return true;
    const o = getO(x, y);
    return (o !== EMPTY && o !== T.BUSH) || getG(x, y) === T.WATER;
  };
  const seen = new Uint8Array(W * H);
  const q = [(MOORGATE.y + 3) * W + MOORGATE.x]; seen[q[0]] = 1; // the arrival spot
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % W, y = (q[i] / W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (solid(nx, ny) || seen[ny * W + nx]) continue;
      seen[ny * W + nx] = 1; q.push(ny * W + nx);
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!seen[y * W + x] && !solid(x, y)) setO(x, y, T.CLIFF);

  // ---------- 12. Named areas (specific first) ----------
  const A = (name: string, x: number, y: number, w: number, h: number): MoorsArea => ({ name, x: Math.floor(x), y: Math.floor(y) + Y0, w: Math.ceil(w), h: Math.ceil(h) });
  const Q = CAIRN_SQUARE, K = KINGS_MOUND, HC = HOST_CAMP;
  const areas: MoorsArea[] = [
    A("Cairnwatch Square", Q.x, Q.y, Q.w, Q.h),
    A("Cairnwatch", O.x, O.y, O.w, O.h),
    A("The Moorgate", G.x - G.rx, G.y - G.ry, G.rx * 2, G.ry * 2),
    A("The Barrow-King's Mound", K.x - K.rx - 1, K.y - K.ry - 1, K.rx * 2 + 3, K.ry * 2 + 3),
    A("The Host's Muster", HC.x - HC.rx - 2, HC.y - HC.ry - 2, HC.rx * 2 + 4, HC.ry * 2 + 4),
    ...STONE_RINGS.map((r) => A(r.name, r.x - r.r - 2, r.y - r.r - 2, r.r * 2 + 5, r.r * 2 + 4)),
    ...BARROW_FIELDS.map((b) => A(b.name, b.x - b.rx - 2, b.y - b.ry - 2, b.rx * 2 + 4, b.ry * 2 + 4)),
    ...FENS.map((f) => A(f.name, f.x - f.rx - 3, f.y - f.ry - 3, f.rx * 2 + 6, f.ry * 2 + 6)),
    A("The Grey Barrow Moors", 0, 0, W, H),
  ];
  // signposts at the road junctions (local tiles; shared/map.ts puts each on the free tile beside the nearest road)
  const R = STONE_RINGS, B = BARROW_FIELDS;
  const wanted: { x: number; y: number; to: string[] }[] = [
    { x: gate[0] + 3, y: gate[1] + 5, to: ["Cairnwatch", "The Moorgate"] },                                    // out of the moorgate
    { x: O.x + O.w + 3, y: O.y + 7, to: ["The Grey Ring", "Blackwater Fen", "Cairnwatch"] },                   // Cairnwatch's east gate
    { x: O.x + 2, y: O.y - 4, to: ["Sorrow Mire", "Cairnwatch"] },                                             // the north-west way
    { x: ox + 2, y: oy + 4, to: ["Thane's Rest", "Cairnwatch"] },                                              // south-east way
    { x: R[0].x - 2, y: R[0].y - 8, to: ["The Cairnfield", "The Grey Ring", "Cairnwatch"] },                   // Grey Ring, north way
    { x: 188, y: 102, to: ["The Hollow Mounds", "The Drowned Hollow", "Blackwater Fen"] },                      // Fen Road fork
    { x: 204, y: 106, to: ["The Host's Muster", "Kingsbarrow", "The Drowned Hollow"] },                        // the Host's crossroads
    { x: 224, y: 82, to: ["Kingsbarrow", "The Drowned Hollow"] },                                              // the climb
    { x: B[1].x - 4, y: B[1].y - B[1].ry - 3, to: ["The Nine Widows", "Kingsbarrow"] },                        // north of Kingsbarrow
  ];
  const posts: { x: number; y: number; to: string[] }[] = []; // map tiles, as shared/map.ts SIGNPOSTS wants them
  for (const p of wanted) {
    let best: [number, number] | undefined, bd = Infinity;
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      const x = p.x + i, y = p.y + j;
      if (!inBand(x, y) || getO(x, y) !== EMPTY || roads.has((y + Y0) * W + x) || getG(x, y) === T.WATER) continue;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => roads.has((y + dy + Y0) * W + x + dx))) continue;
      if (Math.hypot(i, j) < bd) { bd = Math.hypot(i, j); best = [x, y]; }
    }
    if (best) { setO(best[0], best[1], T.SIGNPOST); posts.push({ x: best[0], y: best[1] + Y0, to: p.to }); }
  }
  return { areas, roads, posts };
}
