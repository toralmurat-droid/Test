import { BADLANDS_H, BADLANDS_Y0, CROWN_H, CROWN_Y0, DESERT_H, DESERT_Y0, MAP_W, MOORS_H, MOORS_Y0, SINKHOLES_H, SINKHOLES_Y0, TILE, WORLD_H, type Act } from "./constants";

/**
 * Border roads (Murat 2026-11-19: "walk around most of the map, even if it needs to load the next zone in some
 * places"). The lands are stacked bands of one map (shared/constants.ts), so two neighbours on the continent
 * (client/src/warTableLayout.ts: Oakvale NW, the moors NE, the badlands W, the Sunscar SE, the sinkholes S, the Crown
 * in the middle) never touch on the map. A border road joins them on foot: a road from each land's own roads out to
 * the edge of its band, through the cliffs or the border forest, into a mountain pass where the mist closes in. Walking
 * on into the mist (the last SEAM tiles before the edge) takes the hero to the other land's end of the road, ARRIVE
 * tiles in from its edge, still walking the same way: the client paints the far side ahead and only veils the swap in
 * mist (client/src/borders.ts). The gates (shared/act2.ts WAYGATES) stay as the quick ways.
 *
 * A road into a land is open on the same terms as that land's gates (shared/act2.ts actOpen): its hero level, and the
 * Sunscar wants Act 1's last bosses beaten. Going back is always open. Pure data: no map.ts import, so the map can
 * carve the roads (carveBorders) and the server and client can share the crossing maths.
 */
export type Side = "n" | "s" | "e" | "w";
/** One end of a border road. `path`: local tiles of the land (x, row within its band), from a point on the land's roads out to its edge. */
export interface BorderEnd { land: Act; side: Side; path: readonly [number, number][] }
export interface Border { id: string; name: string; a: BorderEnd; b: BorderEnd }

/** The rows of each land's band (Act 1: the overworld only, not the Mawdeep under it). */
export const LAND_ROWS: Record<Act, { y0: number; h: number }> = {
  1: { y0: 0, h: WORLD_H }, 2: { y0: DESERT_Y0, h: DESERT_H }, 3: { y0: MOORS_Y0, h: MOORS_H },
  4: { y0: BADLANDS_Y0, h: BADLANDS_H }, 5: { y0: SINKHOLES_Y0, h: SINKHOLES_H }, 6: { y0: CROWN_Y0, h: CROWN_H },
};
/** The land each end lies in, for names on signs and notes. */
export const LAND_NAMES: Record<Act, string> = {
  1: "Oakvale", 2: "the Sunscar", 3: "the Grey Barrow Moors", 4: "the Red Badlands", 5: "the Mawdeep Sinkholes", 6: "the Crown of the Marches",
};

/** Tiles each side of the road's middle line: the road is 2 * HALF + 1 tiles wide. */
export const BORDER_HALF = 1;
/** Within this many tiles of the band's edge (on the road), a hero crosses. */
export const SEAM = 2.5;
/** How far in from the other band's edge a crossing hero comes out (more than SEAM, so they never bounce straight back). */
export const ARRIVE = 5;

/**
 * The roads, by neighbours on the continent. Each path ends on its band's edge tile. Names are placeholders. Lands
 * climb in level away from Oakvale, so each road leads from a land's easier side into the next land's easier side.
 */
export const BORDERS: readonly Border[] = [
  // Oakvale (NW) and the moors (NE): from the King's Way east past the Hollow Throne; in the moors, out west of the Moorgate
  { id: "eastmarch", name: "The Eastmarch Pass",
    a: { land: 1, side: "e", path: [[246, 57], [258, 52], [272, 50], [287, 50]] },
    b: { land: 3, side: "w", path: [[52, 124], [38, 125], [22, 123], [0, 123]] } },
  // Oakvale and the badlands (W): beside the Red Pass, west out of the meadow south of Mirror Pond; the badlands' east edge by the Red Pass clearing
  { id: "redroad", name: "The Red Road",
    a: { land: 1, side: "w", path: [[14, 121], [8, 124], [0, 124]] },
    b: { land: 4, side: "e", path: [[271, 96], [280, 97], [287, 97]] } },
  // Oakvale and the Crown (C): east along the coast from the Greenward Gate; down onto the Crown's north rim by its own Greenward Gate
  { id: "greenward", name: "The Greenward Road",
    a: { land: 1, side: "e", path: [[273, 186], [280, 185], [287, 185]] },
    b: { land: 6, side: "n", path: [[42, 21], [46, 12], [46, 0]] } },
  // the moors and the Crown: south from the Mourning Gate past the Weeping Stones; the Crown's north rim by the Mourning Gate
  { id: "mourning", name: "The Mourning Road",
    a: { land: 3, side: "s", path: [[257, 106], [263, 124], [266, 150], [266, 175]] },
    b: { land: 6, side: "n", path: [[247, 21], [242, 10], [242, 0]] } },
  // the badlands and the Crown: east from the road down to the Hanging Arches; the Crown's west rim below the Red Gate
  { id: "redgate", name: "The Redgate Road",
    a: { land: 4, side: "e", path: [[231, 110], [236, 124], [252, 135], [287, 136]] },
    b: { land: 6, side: "w", path: [[27, 96], [12, 96], [0, 96]] } },
  // the sinkholes (S) and the Crown: north from the Ropewell road at the Rootfall Slopes; the Crown's south rim by the Deep Gate
  { id: "deeproad", name: "The Deep Road",
    a: { land: 5, side: "n", path: [[160, 34], [158, 18], [158, 0]] },
    b: { land: 6, side: "s", path: [[150, 152], [154, 162], [154, 175]] } },
  // the Sunscar (SE) and the Crown: west from the Dustrider road; the Crown's east rim by the Sun Gate
  { id: "sunroad", name: "The Sun Road",
    a: { land: 2, side: "w", path: [[46, 68], [30, 72], [14, 70], [0, 70]] },
    b: { land: 6, side: "e", path: [[261, 141], [273, 139], [287, 139]] } },
  // the moors and the Sunscar: south from Thane's Rest; the Sunscar's north edge through the Humpback Mesas
  { id: "ashenpass", name: "The Ashen Pass",
    a: { land: 3, side: "s", path: [[146, 144], [148, 160], [148, 175]] },
    b: { land: 2, side: "n", path: [[146, 45], [144, 24], [144, 0]] } },
  // the badlands and the sinkholes: south from Rattlesnake Gulch's road; the sinkholes' west edge by the Old Warren
  { id: "rattler", name: "The Rattler's Way",
    a: { land: 4, side: "s", path: [[76, 128], [70, 150], [70, 175]] },
    b: { land: 5, side: "w", path: [[30, 73], [14, 72], [0, 72]] } },
  // the Sunscar and the sinkholes: west from the Palmshade road; the sinkholes' east edge past the Rushmere Hollows
  { id: "duneroad", name: "The Dune Road",
    a: { land: 2, side: "w", path: [[42, 150], [20, 152], [0, 152]] },
    b: { land: 5, side: "e", path: [[238, 103], [262, 100], [287, 100]] } },
];

/** An end's path in map tiles. */
export const endPath = (e: BorderEnd): [number, number][] => e.path.map(([x, y]) => [x, y + LAND_ROWS[e.land].y0]);
/** The end's edge tile (map tiles): the last point of its path. */
export const edgeTile = (e: BorderEnd) => { const p = endPath(e); return p[p.length - 1]; };
/** Unit step out of the land through this end's edge (tiles). */
export const outward = (s: Side): [number, number] => (s === "n" ? [0, -1] : s === "s" ? [0, 1] : s === "e" ? [1, 0] : [-1, 0]);
/** The other end of a road. */
export const otherEnd = (b: Border, e: BorderEnd) => (e === b.a ? b.b : b.a);

/** Every tile a road covers (map tiles, row * MAP_W + x): the middle line (`mid`) and the full width (`all`). */
export function roadTiles(e: BorderEnd): { mid: Set<number>; all: Set<number> } {
  const mid = new Set<number>(), all = new Set<number>(), { y0, h } = LAND_ROWS[e.land], p = endPath(e);
  const inLand = (x: number, y: number) => x >= 0 && x < MAP_W && y >= y0 && y < y0 + h;
  for (let i = 0; i + 1 < p.length; i++) {
    const [x0, y0p] = p[i], [x1, y1] = p[i + 1], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0p) * 4);
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0p + ((y1 - y0p) * k) / n);
      if (!inLand(x, y)) continue;
      mid.add(y * MAP_W + x);
      for (let j = -BORDER_HALF; j <= BORDER_HALF; j++) for (let i2 = -BORDER_HALF; i2 <= BORDER_HALF; i2++)
        if (inLand(x + i2, y + j)) all.add((y + j) * MAP_W + x + i2);
    }
  }
  return { mid, all };
}

/** The box round each road end (map tiles, with a tile to spare): the only tiles carveBorders changes (the map hash tests mask them). */
export const BORDER_BOXES: { x0: number; x1: number; y0: number; y1: number }[] = BORDERS.flatMap((b) => [b.a, b.b]).map((e) => {
  const ks = [...roadTiles(e).all], xs = ks.map((k) => k % MAP_W), ys = ks.map((k) => Math.floor(k / MAP_W));
  return { x0: Math.min(...xs) - 1, x1: Math.max(...xs) + 1, y0: Math.min(...ys) - 1, y1: Math.max(...ys) + 1 };
});

/**
 * Cuts the roads into the built map (shared/map.ts, after every band): the full width cleared of whatever stood there
 * (trees, cliffs, stones), water filled in, the middle line a dirt road. Deterministic, no randomness.
 */
export function carveBorders(ground: number[][], objects: number[][], roads: Set<number>, T: { DIRT: number; WATER: number; BRIDGE: number }, EMPTY: number) {
  for (const b of BORDERS) for (const e of [b.a, b.b]) {
    const { mid, all } = roadTiles(e);
    for (const k of all) {
      const x = k % MAP_W, y = Math.floor(k / MAP_W);
      objects[y][x] = EMPTY;
      if (ground[y][x] === T.WATER || ground[y][x] === T.BRIDGE || mid.has(k)) ground[y][x] = T.DIRT;
      if (mid.has(k)) roads.add(k);
    }
  }
}

/** A hero crossing at map px (x, y): the road and the end they walk out of, or undefined when not in a seam. */
export function seamAt(x: number, y: number): { b: Border; from: BorderEnd } | undefined {
  for (const b of BORDERS) for (const e of [b.a, b.b]) {
    const [ex, ey] = edgeTile(e), [ox, oy] = outward(e.side);
    // distance (tiles) from the outer face of the edge tile, inward; and the offset along the edge
    const fx = (ex + 0.5 + ox * 0.5) * TILE, fy = (ey + 0.5 + oy * 0.5) * TILE;
    const depth = ((fx - x) * ox + (fy - y) * oy) / TILE;
    const along = ox !== 0 ? (y - (ey + 0.5) * TILE) / TILE : (x - (ex + 0.5) * TILE) / TILE;
    if (depth >= 0 && depth < SEAM && Math.abs(along) <= BORDER_HALF + 0.5) return { b, from: e };
  }
  return undefined;
}

/**
 * Where a hero walking out of end `from` at map px (x, y) comes out of the other end (map px): ARRIVE tiles in from
 * its edge, on the same side of the road (left of the way they walk stays left).
 */
export function crossTo(b: Border, from: BorderEnd, x: number, y: number): { to: BorderEnd; x: number; y: number } {
  const to = otherEnd(b, from), [ex, ey] = edgeTile(from), [ox, oy] = outward(from.side);
  // offset to the left of the walk (walking (ox, oy), left is (oy, -ox) on a y-down map)
  const left = ((x - (ex + 0.5) * TILE) * oy + (y - (ey + 0.5) * TILE) * -ox) / TILE;
  const k = Math.max(-BORDER_HALF, Math.min(BORDER_HALF, left));
  const [tx, ty] = edgeTile(to), [px, py] = outward(to.side), ix = -px, iy = -py; // walking in: (ix, iy)
  return { to, x: (tx + 0.5 + ix * ARRIVE + iy * k) * TILE, y: (ty + 0.5 + iy * ARRIVE - ix * k) * TILE };
}
