// Server CPU work (optimisation plan S3, S5, S8): the cheaper scans must give what the old full scans gave, the
// throttled upkeep must still do its job, and a leaving hero's per-session entries must go.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { MAP_W, TILE } from "../shared/constants";
import { DOORS, doorDist, isSafeZone } from "../shared/map";
import { CHESTS } from "../shared/chests";
import { findHideSpot, HIDE } from "../shared/spawns";
import { clearWalk, CAMP_POSTS, postPos } from "../shared/bandits";
import { RUNE_KEYS } from "../shared/runes";
import { Mob } from "../server/TownRoom";
import { startRoom, wait } from "./helpers/room";

let srv: Awaited<ReturnType<typeof startRoom>>;
let c: any;
before(async () => { srv = await startRoom(); c = await srv.join({ cls: "knight" }); await wait(200); });
after(async () => { await srv.stop(); });

const mob = (kind: string, x: number, y: number) => { const m = new Mob(); m.kind = kind as any; m.x = m.homeX = x; m.y = m.homeY = y; m.hp = m.maxHp = 50; return m; };

test("inGate and doorBusy give what the old full scans gave, with a monster on a gate tile and without", () => {
  const room = srv.room;
  type D = (typeof DOORS)[number];
  const anyone = (inIt: (x: number, y: number) => boolean, alive: boolean) => {
    for (const p of room.state.players.values()) if ((!alive || !p.dead) && inIt(p.x, p.y)) return true;
    for (const m of room.state.mobs.values()) if (!m.dead && inIt(m.x, m.y)) return true;
    return false;
  };
  const oldInGate = (d: D) => anyone((x, y) => d.gate.includes(Math.floor(y / TILE) * MAP_W + Math.floor(x / TILE)), true);
  const oldBusy = (d: D) => anyone((x, y) => Math.abs(x - d.x * TILE) < 6 * TILE && Math.abs(y - d.y * TILE) < 6 * TILE && doorDist(d, x, y) < 1.1, false);
  assert.ok(DOORS.length > 0);
  for (const d of DOORS) { assert.equal(room.inGate(d), oldInGate(d), d.id); assert.equal(room.doorBusy(d), oldBusy(d), d.id); }
  // one monster on each gate's last tile (its corner farthest from the first), at the door's centre, then dead
  try {
    for (const d of DOORS) {
      const k = d.gate[d.gate.length - 1], m = mob("slime", (k % MAP_W) * TILE + TILE - 0.01, Math.floor(k / MAP_W) * TILE + TILE - 0.01);
      room.state.mobs.set("gatetest", m);
      assert.equal(room.inGate(d), true, d.id);
      assert.equal(room.doorBusy(d), oldBusy(d), `${d.id} busy`);
      m.x = d.x * TILE; m.y = d.y * TILE;
      assert.equal(room.doorBusy(d), oldBusy(d), `${d.id} busy at its centre`);
      m.dead = true;
      assert.equal(room.inGate(d), oldInGate(d));
      assert.equal(room.doorBusy(d), oldBusy(d));
      room.state.mobs.delete("gatetest");
    }
  } finally { room.state.mobs.delete("gatetest"); }
});

test("a pack of skeletons on one hero gets flank sides, and loses them when the pack breaks up", () => {
  const room = srv.room, pid = c.sessionId, p = room.state.players.get(pid);
  const a = mob("skeleton", p.x + 60, p.y), b = mob("skeleton", p.x - 60, p.y + 10);
  a.target = b.target = pid;
  room.state.mobs.set("flankA", a); room.state.mobs.set("flankB", b);
  try {
    room.assignFlanks();
    assert.ok(!Number.isNaN(a.flankA) && !Number.isNaN(b.flankA), "both have a side");
    assert.notEqual(a.flankA, b.flankA);
    b.target = ""; // b lost its target: no stale side on it, and a is alone again
    room.assignFlanks();
    assert.ok(Number.isNaN(a.flankA) && Number.isNaN(b.flankA));
  } finally { room.state.mobs.delete("flankA"); room.state.mobs.delete("flankB"); }
});

test("hiding spots: claims made in one tick never share a spot; a failed search waits HIDE.retryMs", () => {
  const room = srv.room;
  // somewhere with at least three free trees in reach
  let at: { x: number; y: number } | undefined;
  for (let ty = 20; ty < 400 && !at; ty += 7) for (let tx = 20; tx < 400 && !at; tx += 7) {
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    if (isSafeZone(x, y)) continue;
    const t = new Set<string>(), keys: string[] = [];
    for (let i = 0; i < 3; i++) { const s = findHideSpot("slime", x, y, 6, t); if (!s) break; t.add(s.key); keys.push(s.key); }
    if (keys.length === 3) at = { x, y };
  }
  assert.ok(at, "found trees");
  const { x, y } = at!, now = Date.now();
  const a = mob("slime", x, y), b = mob("slime", x, y), m = mob("slime", x, y);
  room.state.mobs.set("spotA", a); room.state.mobs.set("spotB", b); room.state.mobs.set("spotC", m);
  try {
    room.claimSpot(a, x, y, 6, now, true);
    room.claimSpot(b, x, y, 6, now, true);
    assert.ok(a.spot && b.spot && a.spot !== b.spot, `${a.spot} / ${b.spot}`);
    const taken = new Set<string>();
    room.state.mobs.forEach((o: Mob) => { if (o !== m && o.spot && !o.dead) taken.add(o.spot); });
    const want = findHideSpot("slime", x, y, 6, taken)!;
    // no tree on its own tile: the search fails and waits
    const ox = a.outX, oy = a.outY;
    room.claimSpot(m, ox, oy, 0, now, true);
    assert.equal(m.spot, "");
    assert.equal(m.spotRetry, now + HIDE.retryMs);
    room.claimSpot(m, x, y, 6, now + HIDE.retryMs - 1, true);
    assert.equal(m.spot, "", "still waiting");
    room.claimSpot(m, x, y, 6, now + HIDE.retryMs, true);
    assert.equal(m.spot, want.key, "the same spot the old full scan picks");
  } finally { for (const id of ["spotA", "spotB", "spotC"]) room.state.mobs.delete(id); }
});

test("a camp bandit with no way to its goal does not search again every tick", () => {
  const room = srv.room, { x, y } = postPos(CAMP_POSTS[0]);
  const m = mob("bandit", x, y);
  m.camp = true;
  const gx = x + 100 * TILE, gy = y; // too far for the bounded search: no path
  assert.ok(!clearWalk(x, y, gx, gy), "precondition: no straight walk");
  room.go(m, gx, gy, 1000);
  assert.equal(m.path.length, 0);
  assert.equal(m.pathFail, true);
  assert.equal(m.pathAt, 1000);
  room.go(m, gx, gy, 1100);
  assert.equal(m.pathAt, 1000, "no new search for the same goal");
  room.go(m, gx + 2 * TILE, gy, 1200);
  assert.equal(m.pathAt, 1200, "the goal moved: searches again");
  room.go(m, gx + 2 * TILE, gy, 2701);
  assert.equal(m.pathAt, 2701, "the usual re-path time: searches again");
});

test("lair guardians are there from the start and come back after they fell", async () => {
  const room = srv.room, chest = CHESTS.find((ch) => ch.guards)!;
  const want = Object.values(chest.guards!).reduce((s, n) => s + n!, 0);
  assert.equal(room.guardsAlive(chest.id), want);
  const gone: string[] = [];
  room.state.mobs.forEach((m: Mob, id: string) => { if (m.guard === chest.id) gone.push(id); });
  for (const id of gone) room.state.mobs.delete(id);
  await wait(1300);
  const at = room.guardBack.get(chest.id);
  assert.ok(at > Date.now() + 60_000, "missing ones noticed, they come back later");
  room.guardBack.set(chest.id, 0); // time is up
  assert.equal(room.guardsAlive(chest.id), 0);
  await wait(1300);
  assert.equal(room.guardsAlive(chest.id), want);
});

test("a leaving hero's rune and ritual entries are cleared", async () => {
  const room = srv.room, c2 = await srv.join({ cls: "knight" });
  await wait(100);
  const sid = c2.sessionId, p = room.state.players.get(sid);
  room.runesOf(sid, p);
  room.runeReady.set(`${sid}:${RUNE_KEYS[0]}`, Date.now() + 9999);
  room.runeReady.set(`${sid}:${RUNE_KEYS[RUNE_KEYS.length - 1]}`, Date.now() + 9999);
  room.ritualCd.set(sid, Date.now() + 9999);
  assert.ok(room.runeCache.has(sid));
  await c2.leave();
  await wait(300);
  assert.ok(!room.state.players.has(sid));
  assert.ok(!room.runeCache.has(sid));
  assert.ok(![...room.runeReady.keys()].some((k: string) => k.startsWith(`${sid}:`)));
  assert.ok(!room.ritualCd.has(sid));
});
