import { test } from "node:test";
import assert from "node:assert/strict";
import { MAP_W, TILE, WORLD_H } from "../shared/constants";
import { AREAS, areaAt, GROUND, isSafeZone, isSolidTile, OBJECTS, PORTAL_SPOTS, randomSpawn, SALT_SAFE, SIGNPOSTS, T } from "../shared/map";
import {
  JETTY_RUNS, SALT_BUILDINGS, SALT_HARBOUR_STREET, SALT_JETTIES, SALT_LANE, SALT_PIERS, SALT_SQUARE, SALT_STASH, SALT_TOWN, SALT_UPPER_LANE,
  saltDoorStep, WATCH_FIRE,
} from "../shared/saltmere";
import { arrivalOf, portalById } from "../shared/portals";
import { NPCS } from "../shared/npcs";
import { noMobsAt } from "../shared/spawns";

/** 4-way flood over free tiles from (sx, sy), overworld rows only. */
function flood(sx: number, sy: number) {
  const seen = new Uint8Array(MAP_W * WORLD_H), q = [sy * MAP_W + sx];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % MAP_W, y = (q[i] / MAP_W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (ny >= WORLD_H || isSolidTile(nx, ny) || seen[ny * MAP_W + nx]) continue;
      seen[ny * MAP_W + nx] = 1; q.push(ny * MAP_W + nx);
    }
  }
  return seen;
}
const spawn = randomSpawn();
const REACH = flood(Math.floor(spawn.x / TILE), Math.floor(spawn.y / TILE));
const reachable = (x: number, y: number) => REACH[y * MAP_W + x] === 1;
const inRect = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
const area = (name: string) => AREAS.find((a) => a.name === name)!;
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test("saltmere: the harbour square is a safe zone inside the village, flagstones underfoot", () => {
  assert.deepEqual(SALT_SAFE, SALT_SQUARE);
  const town = area("Saltmere");
  assert.deepEqual({ x: town.x, y: town.y, w: town.w, h: town.h }, SALT_TOWN, "the area entry is SALT_TOWN");
  assert.ok(!town.mobs?.length, "no monsters in town");
  const Q = SALT_SAFE;
  for (let y = Q.y; y < Q.y + Q.h; y++) for (let x = Q.x; x < Q.x + Q.w; x++) {
    assert.ok(inRect(SALT_TOWN, x, y), `square tile ${x},${y} in Saltmere`);
    assert.equal(areaAt((x + 0.5) * TILE, (y + 0.5) * TILE), "Saltmere");
    assert.ok(isSafeZone((x + 0.5) * TILE, (y + 0.5) * TILE), `safe at ${x},${y}`);
    assert.equal(GROUND[y][x], T.COBBLE, `cobbles at ${x},${y}`);
    assert.ok(noMobsAt((x + 0.5) * TILE, (y + 0.5) * TILE));
  }
  // just outside, on every side, it is not
  for (let x = Q.x; x < Q.x + Q.w; x++) {
    assert.ok(!isSafeZone((x + 0.5) * TILE, (Q.y - 0.5) * TILE), `not safe above at ${x}`);
    assert.ok(!isSafeZone((x + 0.5) * TILE, (Q.y + Q.h + 0.5) * TILE), `not safe below at ${x}`);
  }
  for (let y = Q.y; y < Q.y + Q.h; y++) {
    assert.ok(!isSafeZone((Q.x - 0.5) * TILE, (y + 0.5) * TILE), `not safe west at ${y}`);
    assert.ok(!isSafeZone((Q.x + Q.w + 0.5) * TILE, (y + 0.5) * TILE), `not safe east at ${y}`);
  }
  // the square lies between the two piers, above the water line
  assert.ok(SALT_PIERS[0] < Q.x && SALT_PIERS[1] >= Q.x + Q.w);
  for (let x = Q.x; x < Q.x + Q.w; x++) assert.notEqual(GROUND[Q.y + Q.h][x], T.WATER, `sand below the square at ${x}`);
  assert.ok(inRect(SALT_SQUARE, SALT_STASH.x, SALT_STASH.y), "the stash spot is on the square");
});

test("saltmere: the square, the waystone, the piers, every door, the stash spot, the jetties and the watch-fire are reachable from Oakvale", () => {
  const Q = SALT_SQUARE;
  for (let y = Q.y; y < Q.y + Q.h; y++) for (let x = Q.x; x < Q.x + Q.w; x++)
    if (!isSolidTile(x, y)) assert.ok(reachable(x, y), `square tile ${x},${y}`);
  let open = 0;
  for (let y = Q.y; y < Q.y + Q.h; y++) for (let x = Q.x; x < Q.x + Q.w; x++) if (!isSolidTile(x, y)) open++;
  assert.ok(open >= Q.w * Q.h - 3, `the square is open (${open} free tiles)`);
  const stone = portalById("saltmere")!, arr = arrivalOf(stone);
  assert.ok(reachable(Math.floor(arr.x / TILE), Math.floor(arr.y / TILE)), "waystone arrival spot");
  // both piers run out over the water to a T head of planks
  for (const px of SALT_PIERS) {
    let y = SALT_LANE + 1;
    while (GROUND[y + 1][px] === T.BRIDGE || GROUND[y + 1][px] === T.DIRT) y++;
    assert.equal(GROUND[y][px], T.BRIDGE, `pier ${px} ends on planks`);
    const head = [y - 1, y].find((r) => GROUND[r][px - 1] === T.BRIDGE && GROUND[r][px + 1] === T.BRIDGE);
    assert.ok(head !== undefined, `pier ${px} has a head`);
    for (const x of [px - 1, px, px + 1]) assert.ok(reachable(x, head!), `pier ${px} head at ${x},${head}`);
  }
  assert.equal(SALT_JETTIES.saltmere.x, SALT_PIERS[1], "the ferry ties up at the Harbour Street pier");
  for (const [id, j] of Object.entries(SALT_JETTIES)) {
    assert.equal(GROUND[j.y][j.x], T.BRIDGE, `${id} jetty head on planks`);
    assert.ok(reachable(j.x, j.y), `${id} jetty head`);
    assert.ok([[1, 1], [-1, 1], [1, -1], [-1, -1]].some(([dx, dy]) => GROUND[j.y + dy][j.x + dx] === T.WATER), `${id} jetty head over the water`);
  }
  for (const r of JETTY_RUNS) {
    assert.notEqual(GROUND[r.y0][r.x], T.WATER, `${r.id} jetty starts on land`);
    for (let y = r.y0; y <= r.y1; y++) assert.ok(reachable(r.x, y), `${r.id} jetty ${r.x},${y}`);
  }
  assert.equal(areaAt(SALT_JETTIES.heronwreck.x * TILE, (SALT_JETTIES.heronwreck.y - 3) * TILE), "Heronwreck Strand");
  assert.ok(overlaps(area("Gullrock Cove"), { x: SALT_JETTIES.gullrock.x, y: JETTY_RUNS[0].y0, w: 1, h: 1 }), "Gullrock's jetty starts in the cove");
  assert.ok(reachable(SALT_STASH.x, SALT_STASH.y) && !isSolidTile(SALT_STASH.x, SALT_STASH.y), "stash spot free");
  for (const b of SALT_BUILDINGS) {
    const door = { x: b.x + Math.floor(b.w / 2), y: b.y + b.h - 1 }, step = saltDoorStep(b);
    assert.equal(OBJECTS[door.y][door.x], T.DOOR, `${b.id} door`);
    assert.ok(reachable(step.x, step.y), `${b.id} door step ${step.x},${step.y}`);
    assert.ok(inRect(SALT_TOWN, b.x, b.y) && inRect(SALT_TOWN, b.x + b.w - 1, b.y + b.h - 1), `${b.id} in town`);
    assert.ok(b.y + b.h <= SALT_LANE, `${b.id} above the beach lane, not on the sand`);
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) assert.ok(isSolidTile(x, y), `${b.id} solid at ${x},${y}`);
  }
  // the three trades front onto Upper Lane
  for (const id of ["tavern", "chandlery", "smokehouse"]) {
    const b = SALT_BUILDINGS.find((s) => s.id === id)!;
    assert.equal(saltDoorStep(b).y, SALT_UPPER_LANE.y, `${id} on Upper Lane`);
  }
  assert.equal(SALT_BUILDINGS.find((b) => b.id === "tavern")!.name, "The Gull & Anchor");
  // Harbour Street runs from the waystone down to the beach lane
  const HS = SALT_HARBOUR_STREET;
  for (let y = HS.y0; y <= HS.y1; y++) assert.ok(reachable(HS.x, y) && GROUND[y][HS.x] === T.COBBLE, `Harbour Street at ${y}`);
  assert.ok(Math.abs(HS.x - PORTAL_SPOTS.find((p) => p.id === "saltmere")!.x) <= 1 && HS.y0 === SALT_UPPER_LANE.y);
  // the watch-fire's cairn: open ground on the eastern side of town, walkable all round, away from the square
  const W = WATCH_FIRE;
  assert.ok(!inRect(SALT_SQUARE, W.x, W.y) && W.x > SALT_SQUARE.x + SALT_SQUARE.w, "east of the square");
  assert.ok(reachable(W.x, W.y), "watch-fire spot");
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.ok(reachable(W.x + dx, W.y + dy), `beside the watch-fire ${dx},${dy}`);
});

test("saltmere: the town stays clear of Gullrock Cove and the River Ashwell, the signposts outside it", () => {
  assert.ok(!overlaps(SALT_TOWN, area("Gullrock Cove")), "Gullrock Cove");
  assert.ok(!overlaps(SALT_TOWN, area("River Ashwell")), "River Ashwell");
  // the signposts at the lane's two ends stand just outside the town and point into it
  const posts = SIGNPOSTS.filter((s) => s.y >= SALT_TOWN.y && s.y < SALT_TOWN.y + SALT_TOWN.h && Math.abs(s.x - (SALT_TOWN.x + SALT_TOWN.w / 2)) < SALT_TOWN.w / 2 + 3);
  assert.equal(posts.length, 2);
  for (const p of posts) {
    assert.ok(!inRect(SALT_TOWN, p.x, p.y), `post at ${p.x},${p.y} outside town`);
    assert.ok(p.dirs.some((d) => d.name === "Saltmere"), `post at ${p.x},${p.y} points to Saltmere`);
  }
});

test("saltmere: Garrick, Dorran and Marin stand on open ground, the waystone has room round it", () => {
  for (const id of ["oldfisher", "saltarmourer", "smuggler"]) {
    const n = NPCS.find((m) => m.id === id)!;
    const tx = Math.floor(n.x / TILE), ty = Math.floor(n.y / TILE);
    assert.ok(!isSolidTile(tx, ty) && reachable(tx, ty), `${n.name} at ${tx},${ty}`);
    assert.equal(areaAt(n.x, n.y), "Saltmere", `${n.name} in Saltmere`);
  }
  const s = PORTAL_SPOTS.find((p) => p.id === "saltmere")!;
  for (let y = s.y - 1; y <= s.y + 1; y++) for (let x = s.x - 1; x <= s.x + 1; x++) assert.equal(OBJECTS[y][x], -1, `nothing stands at ${x},${y} by the waystone`);
  assert.ok(inRect(SALT_TOWN, s.x, s.y), "the waystone is in town");
});
