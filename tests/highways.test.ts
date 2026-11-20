import { test } from "node:test";
import assert from "node:assert/strict";
import { MAP_W, TILE, WORLD_H } from "../shared/constants";
import { BORDERS, endPath, LAND_ROWS } from "../shared/borders";
import { CITIES } from "../shared/capitals";
import {
  CAPITAL_FORTS, carveHighways, FORT_SKIP, HIGHWAY_HALF, HIGHWAY_MASK, HIGHWAYS, highwayTiles, legLine, type Highway,
} from "../shared/highways";
import { AREAS, EMPTY, GROUND, HIGHWAY_SKIP, HIGHWAY_TILES, isSolidTile, NATURE, OBJECTS, PORTAL_SPOTS, SIGNPOSTS, T, VILLAGE, WORLD } from "../shared/map";
import { HOLDS } from "../shared/war/standards";

const roads = WORLD.roads;
const inBox = (x: number, y: number, b: { x0: number; x1: number; y0: number; y1: number }) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
const skipped = (x: number, y: number) => HIGHWAY_SKIP.some((b) => inBox(x, y, b));
const NAT = new Set<number>([...NATURE, T.CACTUS, T.BONES]);
const oak = HIGHWAYS.find((h) => h.land === 1)!;

/** 8-way flood over road tiles from tile k. */
function roadFlood(k: number): Set<number> {
  const seen = new Set([k]), q = [k];
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % MAP_W, y = Math.floor(q[i] / MAP_W);
    for (let j = -1; j <= 1; j++) for (let d = -1; d <= 1; d++) {
      const n = (y + j) * MAP_W + x + d;
      if (roads.has(n) && !seen.has(n)) { seen.add(n); q.push(n); }
    }
  }
  return seen;
}
/** The road tile nearest (x, y) (map tiles). */
function nearestRoad(x: number, y: number, r = 12): number | undefined {
  let best: number | undefined, bd = Infinity;
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (roads.has((y + j) * MAP_W + x + i) && Math.hypot(i, j) < bd) { bd = Math.hypot(i, j); best = (y + j) * MAP_W + x + i; }
  return best;
}
/** Where a land's highway starts: the road tile just outside its capital's city gate box. */
function root(h: Highway): number {
  const c = CITIES.find((o) => o.act === h.land)!, b = c.outerBox;
  for (let y = b.y0 - 1; y <= b.y1 + 1; y++) for (let x = b.x0 - 1; x <= b.x1 + 1; x++)
    if (!inBox(x, y, b) && HIGHWAY_TILES.has(y * MAP_W + x)) return y * MAP_W + x;
  assert.fail(`${h.name}: no highway tile at the edge of ${c.clan}'s city gate box`);
}

test("highways: Oakvale's highway joins Hearthhold's gate to every settlement and border-road pass end on road", () => {
  const net = roadFlood(root(oak));
  const spots: [string, number, number][] = [["Goldenreach Farms (seat)", 30, 58]];
  for (const id of ["oakvale", "farms", "millbrook", "huntcamp", "saltmere"]) { const p = PORTAL_SPOTS.find((o) => o.id === id)!; spots.push([p.name, p.x, p.y]); }
  for (const [name, x, y] of spots) { const k = nearestRoad(x, y); assert.ok(k !== undefined && net.has(k), `${name}: reached on road from the city gate`); }
  for (const b of BORDERS) for (const e of [b.a, b.b]) if (e.land === 1) {
    const [x, y] = endPath(e)[0];
    assert.ok(net.has(y * MAP_W + x), `${b.name}: its pass end ${x},${y} reached on road from the city gate`);
  }
  // every settlement it lists is a real area, and every highway tile is on that one road net
  for (const n of [oak.seat, oak.town, ...oak.towns]) assert.ok(AREAS.some((a) => a.name === n), n);
  for (const k of HIGHWAY_TILES) if (k < LAND_ROWS[1].h * MAP_W) assert.ok(net.has(k), `highway tile ${k % MAP_W},${Math.floor(k / MAP_W)} joined`);
});

test("highways: the middle line is walkable cobbled road, the core three wide almost everywhere", () => {
  let mids = 0, full = 0;
  for (const h of HIGHWAYS) for (const leg of h.legs) {
    const line = legLine(h, leg);
    for (let i = 0; i < line.length; i++) {
      const k = line[i], x = k % MAP_W, y = Math.floor(k / MAP_W);
      if (i) { const p = line[i - 1]; assert.ok(Math.abs((p % MAP_W) - x) <= 1 && Math.abs(Math.floor(p / MAP_W) - y) <= 1, `${leg.to}: unbroken at ${x},${y}`); }
      if (skipped(x, y)) continue; // inside a town, a city gate's box or by a capital's fort it rides the old streets
      const at = `${h.name} -> ${leg.to} at ${x},${y}`;
      assert.ok(!isSolidTile(x, y), `${at}: walkable`);
      assert.ok(roads.has(k), `${at}: a road`);
      assert.ok(GROUND[y][x] === T.COBBLE || GROUND[y][x] === T.BRIDGE, `${at}: cobbles (or a bridge)`);
      assert.equal(OBJECTS[y][x], EMPTY, `${at}: no cliff, house, wall or post on the line`);
      mids++;
      let paved = true;
      for (let j = -HIGHWAY_HALF; j <= HIGHWAY_HALF; j++) for (let d = -HIGHWAY_HALF; d <= HIGHWAY_HALF; d++) if (GROUND[y + j][x + d] !== T.COBBLE) paved = false;
      if (paved) full++;
    }
  }
  assert.ok(mids > 500, `${mids} middle-line tiles`);
  assert.ok(full >= mids * 0.9, `${full} of ${mids} middle-line tiles have the full 3-wide core paved`);
  for (const k of HIGHWAY_TILES) {
    const x = k % MAP_W, y = Math.floor(k / MAP_W);
    assert.ok(GROUND[y][x] === T.COBBLE && OBJECTS[y][x] === EMPTY && roads.has(k), `paved tile ${x},${y}`);
    assert.ok(!skipped(x, y), `no widening inside a town, village, city gate box or capital fort's box (${x},${y})`);
  }
});

test("highways: only nature cleared and open ground paved, all inside HIGHWAY_MASK; water, bridges and buildings untouched", () => {
  const before = WORLD.highwayBefore;
  assert.ok(before.size > 1000);
  for (const [k, b] of before) {
    const x = k % MAP_W, y = Math.floor(k / MAP_W), g = GROUND[y][x], o = OBJECTS[y][x];
    assert.ok(HIGHWAY_MASK.has(k), `${x},${y}: inside the mask`);
    assert.ok(b.g !== T.WATER && b.g !== T.BRIDGE, `${x},${y}: no water or bridge turned to ground`);
    assert.ok(b.o === EMPTY || NAT.has(b.o) || b.o === T.STUMP, `${x},${y}: only nature cleared (was ${b.o})`);
    assert.equal(o, EMPTY);
    assert.ok(g === b.g || g === T.COBBLE, `${x},${y}: ground kept or paved`);
  }
  // the carve on made-up land: what it paves, what it clears, what it leaves alone
  const land = LAND_ROWS[oak.land], { core, verge } = highwayTiles(oak);
  for (const k of [...core, ...verge]) assert.ok(HIGHWAY_MASK.has(k));
  const grid = (g: number, o: number) => ({ g: Array.from({ length: WORLD_H }, () => Array<number>(MAP_W).fill(g)), o: Array.from({ length: WORLD_H }, () => Array<number>(MAP_W).fill(o)) });
  const woods = grid(T.GRASS, T.TREE), r = new Set<number>();
  const paved = carveHighways(woods.g, woods.o, r, T, EMPTY, [], [oak.land]);
  assert.deepEqual([...paved].sort(), [...core].sort(), "the whole core paved in open woods");
  assert.deepEqual([...r].sort(), [...core].sort(), "...and made road");
  for (let y = land.y0; y < land.y0 + land.h; y++) for (let x = 0; x < MAP_W; x++) {
    const k = y * MAP_W + x;
    if (core.has(k)) assert.ok(woods.g[y][x] === T.COBBLE && woods.o[y][x] === EMPTY);
    else if (verge.has(k)) assert.ok(woods.g[y][x] === T.GRASS && woods.o[y][x] === EMPTY, "the verge: trees cleared, grass kept");
    else assert.ok(woods.g[y][x] === T.GRASS && woods.o[y][x] === T.TREE, "nothing else touched");
  }
  for (const [g, o, what] of [[T.WATER, EMPTY, "water"], [T.BRIDGE, EMPTY, "a bridge"], [T.GRASS, T.WALL_STONE, "walls"], [T.GRASS, T.PALISADE, "palisades"], [T.GRASS, T.SIGNPOST, "signposts"], [T.SAND, T.CLIFF, "cliffs"]] as const) {
    const m = grid(g, o), r2 = new Set<number>();
    assert.equal(carveHighways(m.g, m.o, r2, T, EMPTY, [], [oak.land]).size, 0, what);
    assert.ok(r2.size === 0 && m.g.every((row) => row.every((t) => t === g)) && m.o.every((row) => row.every((t) => t === o)), `${what} left alone`);
  }
  const boxed = grid(T.GRASS, T.TREE);
  assert.equal(carveHighways(boxed.g, boxed.o, new Set(), T, EMPTY, [{ x0: 0, x1: MAP_W - 1, y0: land.y0, y1: land.y0 + land.h - 1 }], [oak.land]).size, 0, "nothing inside a skip box");
  assert.equal(carveHighways(boxed.g, boxed.o, new Set(), T, EMPTY, [], [6]).size, 0, "only the lands asked for");
});

test("highways: towns, villages, Oakvale's gates, city gates and capital forts keep their own streets", () => {
  const V = VILLAGE;
  for (const b of [{ x0: V.x0 - 4, x1: V.x1 + 4, y0: V.y0 - 4, y1: V.y1 + 4 }, ...CITIES.map((c) => c.outerBox), ...CAPITAL_FORTS.map(([x, y]) => ({ x0: x - FORT_SKIP, x1: x + FORT_SKIP, y0: y - FORT_SKIP, y1: y + FORT_SKIP }))])
    assert.ok(HIGHWAY_SKIP.some((s) => s.x0 === b.x0 && s.x1 === b.x1 && s.y0 === b.y0 && s.y1 === b.y1), `skip box ${JSON.stringify(b)}`);
  for (const h of HIGHWAYS) for (const n of h.towns) {
    const a = AREAS.find((o) => o.name === n)!;
    assert.ok(HIGHWAY_SKIP.some((s) => s.x0 === a.x && s.y0 === a.y && s.x1 === a.x + a.w - 1 && s.y1 === a.y + a.h - 1), `${n}: unwidened`);
  }
  // Oakvale's palisade gates stay one tile wide: a gap in the palisade ring is a single tile
  for (const [x, y] of [[V.x0, 60], [V.x1, 60], [79, V.y0], [79, V.y1]] as const) {
    const vertical = x === V.x0 || x === V.x1;
    let gap = 0;
    for (let d = -3; d <= 3; d++) { const tx = vertical ? x : x + d, ty = vertical ? y + d : y; if (OBJECTS[ty][tx] !== T.PALISADE) gap++; }
    assert.ok(gap <= 2, `Oakvale's gate at ${x},${y}: still narrow (${gap} open)`);
  }
  // the capitals' forts stand where they always did
  for (const [x, y] of CAPITAL_FORTS) assert.ok(HOLDS.some((h) => h.site === "capital" && h.x === (x + 0.5) * TILE && h.y === (y + 0.5) * TILE), `capital fort at ${x},${y}`);
});

test("highways: a signpost at each fork, naming the seat and the main town; portal stones stay clear", () => {
  for (const h of HIGHWAYS) {
    const y0 = LAND_ROWS[h.land].y0;
    for (const p of h.posts ?? []) {
      assert.ok(p.to.includes(h.seat) && p.to.includes(h.town), `${p.x},${p.y}: names ${h.seat} and ${h.town}`);
      const post = WORLD.posts.find((o) => o.to === p.to);
      assert.ok(post, `${h.name}: the post by ${p.x},${p.y} stands`);
      assert.ok(Math.max(Math.abs(post.x - p.x), Math.abs(post.y - p.y - y0)) <= 3, "within 3 tiles of its spot");
      assert.equal(OBJECTS[post.y][post.x], T.SIGNPOST);
      assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => roads.has((post.y + j) * MAP_W + post.x + i)), "beside the road");
      const s = SIGNPOSTS.find((o) => o.x === post.x && o.y === post.y)!;
      assert.ok(s.dirs.length >= 2 && s.dirs.some((d) => d.name.includes(h.town) || d.name.includes(h.seat)), `${post.x},${post.y}: a board points home (${s.dirs.map((d) => d.name).join(" | ")})`);
    }
  }
  assert.equal(SIGNPOSTS.length, WORLD.posts.length);
  for (const p of PORTAL_SPOTS) assert.ok(!isSolidTile(p.x, p.y), `${p.name}: its stone's spot is clear`);
});
