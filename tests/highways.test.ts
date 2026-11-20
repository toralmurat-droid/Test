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
/** What a highway paves with: cobbles, or the Crown's flagstones, rubble and marble. */
const PAVED = new Set<number>([T.COBBLE, T.FLAGS, T.RUBBLE, T.MARBLE]);
const oak = HIGHWAYS.find((h) => h.land === 1)!;

/** 8-way flood over walkable road tiles from tile k (a few old road tiles lie under an oasis's water or a market stall). */
function roadFlood(k: number): Set<number> {
  const seen = new Set([k]), q = [k];
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % MAP_W, y = Math.floor(q[i] / MAP_W);
    for (let j = -1; j <= 1; j++) for (let d = -1; d <= 1; d++) {
      const n = (y + j) * MAP_W + x + d;
      if (roads.has(n) && !seen.has(n) && !isSolidTile(n % MAP_W, Math.floor(n / MAP_W))) { seen.add(n); q.push(n); }
    }
  }
  return seen;
}
/** The walkable road tile nearest (x, y) (map tiles). */
function nearestRoad(x: number, y: number, r = 12): number | undefined {
  let best: number | undefined, bd = Infinity;
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (roads.has((y + j) * MAP_W + x + i) && !isSolidTile(x + i, y + j) && Math.hypot(i, j) < bd) { bd = Math.hypot(i, j); best = (y + j) * MAP_W + x + i; }
  return best;
}
/** Where a land's highway starts: the road tile just outside its capital's city gate box (the Crown, with no capital: Tollcross). */
function root(h: Highway): number {
  const c = CITIES.find((o) => o.act === h.land), b = c?.outerBox ?? { x0: 138, x1: 149, y0: 1190, y1: 1197 }; // (Tollcross Square)
  for (let y = b.y0 - 1; y <= b.y1 + 1; y++) for (let x = b.x0 - 1; x <= b.x1 + 1; x++)
    if (!inBox(x, y, b) && HIGHWAY_TILES.has(y * MAP_W + x)) return y * MAP_W + x;
  assert.fail(`${h.name}: no highway tile at the edge of ${c?.clan ?? "Tollcross Square"}'s box`);
}
/** Each land's seat, main town and villages (portal stones by id, or a spot): the highway must reach them on road. */
const SPOTS: Record<number, (string | [string, number, number])[]> = {
  1: [["Goldenreach Farms (seat)", 30, 58], "oakvale", "farms", "millbrook", "huntcamp", "saltmere"],
  2: [["The Veiled Sanctum (seat)", 242, 353], "kelashar", "jackal", "palmshade", "mirage", ["Dustrider Camp", 51, 363]],
  3: [["The Host's Muster (seat)", 262, 678], "cairnwatch", "blackwater", "thanesrest"],
  4: [["Fangrock (seat)", 29, 859], "rustwater", "vulture", "cinnabar"],
  5: [["Hidehall (seat)", 248, 1105], "ropewell", "tunneltop", "mosslight"],
};

test("highways: each land's highway joins its capital's gate to every settlement and border-road pass end on road", () => {
  assert.deepEqual(HIGHWAYS.map((h) => h.land), Object.keys(SPOTS).map(Number), "a highway in every land, with its spots listed here");
  for (const h of HIGHWAYS) {
    const net = roadFlood(root(h)), { y0, h: rows } = LAND_ROWS[h.land];
    for (const s of SPOTS[h.land]) {
      const [name, x, y] = typeof s === "string" ? (() => { const p = PORTAL_SPOTS.find((o) => o.id === s)!; return [p.name, p.x, p.y] as const; })() : s;
      const k = nearestRoad(x, y);
      assert.ok(k !== undefined && net.has(k), `${h.name}: ${name} reached on road from the gate`);
    }
    for (const b of BORDERS) for (const e of [b.a, b.b]) if (e.land === h.land) {
      const [x, y] = endPath(e)[0];
      assert.ok(net.has(y * MAP_W + x), `${h.name}: ${b.name}'s pass end ${x},${y} reached on road from the gate`);
    }
    // every settlement it lists is a real area, and every highway tile is on that one road net
    for (const n of [h.seat, h.town, ...h.towns]) assert.ok(AREAS.some((a) => a.name === n), n);
    for (const k of HIGHWAY_TILES) if (k >= y0 * MAP_W && k < (y0 + rows) * MAP_W) assert.ok(net.has(k), `${h.name}: highway tile ${k % MAP_W},${Math.floor(k / MAP_W)} joined`);
  }
});

test("highways: the middle line is walkable paved road, the core three wide almost everywhere", () => {
  let mids = 0, full = 0;
  const joined = new Set<number>(), keep = [...CITIES.map((c) => c.outerBox), ...CAPITAL_FORTS.map(([x, y]) => ({ x0: x - FORT_SKIP, x1: x + FORT_SKIP, y0: y - FORT_SKIP, y1: y + FORT_SKIP }))];
  for (const h of HIGHWAYS) for (const leg of h.legs) {
    const line = legLine(h, leg), pave = (g: number) => (h.paving === "crown" ? PAVED.has(g) : g === T.COBBLE);
    for (let i = 0; i < line.length; i++) {
      const k = line[i], x = k % MAP_W, y = Math.floor(k / MAP_W), at = `${h.name}: ${leg.from} -> ${leg.to} at ${x},${y}`;
      if (i) { const p = line[i - 1]; assert.ok(Math.abs((p % MAP_W) - x) <= 1 && Math.abs(Math.floor(p / MAP_W) - y) <= 1, `${at}: unbroken`); }
      if (skipped(x, y)) { // inside a town, a city gate's box or by a capital's fort it rides the old streets...
        if (!leg.join) continue;
        // ...and a `join` leg fills their gaps one tile wide, never in a city gate's or a capital fort's box
        assert.ok(!keep.some((b) => inBox(x, y, b)), `${at}: no join in a city gate's or a capital fort's box`);
        assert.ok(roads.has(k) && !isSolidTile(x, y), `${at}: the street is whole`);
        joined.add(k);
        continue;
      }
      assert.ok(!isSolidTile(x, y), `${at}: walkable`);
      assert.ok(roads.has(k), `${at}: a road`);
      assert.ok(pave(GROUND[y][x]) || GROUND[y][x] === T.BRIDGE, `${at}: paved (or a bridge)`);
      assert.equal(OBJECTS[y][x], EMPTY, `${at}: no cliff, house, wall or post on the line`);
      mids++;
      let paved = true;
      for (let j = -HIGHWAY_HALF; j <= HIGHWAY_HALF; j++) for (let d = -HIGHWAY_HALF; d <= HIGHWAY_HALF; d++) if (!pave(GROUND[y + j][x + d])) paved = false;
      if (paved) full++;
    }
  }
  assert.ok(mids > 500, `${mids} middle-line tiles`);
  assert.ok(full >= mids * 0.9, `${full} of ${mids} middle-line tiles have the full 3-wide core paved`);
  for (const k of HIGHWAY_TILES) {
    const x = k % MAP_W, y = Math.floor(k / MAP_W);
    assert.ok(PAVED.has(GROUND[y][x]) && OBJECTS[y][x] === EMPTY && roads.has(k), `paved tile ${x},${y}`);
    assert.ok(!skipped(x, y) || joined.has(k), `no widening inside a town, village, city gate box or capital fort's box (${x},${y})`);
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
    if (o === T.SIGNPOST) { assert.ok(WORLD.posts.some((p) => p.x === x && p.y === y), `${x},${y}: a highway's post`); continue; }
    assert.equal(o, EMPTY);
    assert.ok(g === b.g || PAVED.has(g), `${x},${y}: ground kept or paved`);
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
      assert.equal(WORLD.highwayBefore.get(post.y * MAP_W + post.x)?.o, EMPTY, "kept as open ground on the map before the highways (chests and siege sites never see it)");
      assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => roads.has((post.y + j) * MAP_W + post.x + i)), "beside the road");
      const s = SIGNPOSTS.find((o) => o.x === post.x && o.y === post.y)!;
      assert.ok(s.dirs.length >= 2 && s.dirs.some((d) => d.name.includes(h.town) || d.name.includes(h.seat)), `${post.x},${post.y}: a board points home (${s.dirs.map((d) => d.name).join(" | ")})`);
    }
  }
  assert.equal(SIGNPOSTS.length, WORLD.posts.length);
  for (const p of PORTAL_SPOTS) assert.ok(!isSolidTile(p.x, p.y), `${p.name}: its stone's spot is clear`);
});
