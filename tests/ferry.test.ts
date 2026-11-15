import { test } from "node:test";
import assert from "node:assert/strict";
import { MAP_W, TILE, WORLD_H } from "../shared/constants";
import { isSolidTile, randomSpawn } from "../shared/map";
import { FERRY_COMBAT_MS, FERRY_FEE, FERRY_RANGE, FERRY_STOPS, ferryOpen, ferryStopById, ferryStopNear } from "../shared/ferry";
import { PORTAL_COMBAT_MS } from "../shared/portals";
import { npcById } from "../shared/npcs";
import { CHAINS, packQuest, RED_CHAIN } from "../shared/quests";
import { SALT_JETTIES } from "../shared/saltmere";
import { rideFerry, type FerryHero } from "../server/ferry";
import { ASK_BURST } from "../server/ratelimit";
import { startRoom, until, wait } from "./helpers/room";

// Saltmere rework phase 7 (owner 2026-11-15): after "The Redfang Chief", Pell rows a hero between Saltmere, Gullrock
// Cove and Heronwreck Strand for a small fee. The server decides each ride (server/ferry.ts).

/** 4-way flood over free tiles from (sx, sy), overworld rows only (as tests/saltmere.test.ts). */
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
const RED_N = CHAINS[RED_CHAIN].quests.length;
const tut = CHAINS.findIndex((c) => c.id === "tutorial");
const quester = (red: number) => ({ tut: packQuest(CHAINS[tut].quests.length, 0, 0), red: packQuest(red, 0, 0) });
const pell = npcById("pell")!;

test("ferry: three stops on the jetty heads, arrival one plank landward, walkable and reachable from Oakvale", () => {
  const spawn = randomSpawn(), reach = flood(Math.floor(spawn.x / TILE), Math.floor(spawn.y / TILE));
  assert.deepEqual(FERRY_STOPS.map((s) => s.id), ["saltmere", "gullrock", "heronwreck"]);
  assert.ok(FERRY_FEE >= 10 && FERRY_FEE <= 20, "a small fee (owner: 10-20 gold)");
  assert.equal(FERRY_COMBAT_MS, PORTAL_COMBAT_MS, "the portal stones' combat rule");
  for (const s of FERRY_STOPS) {
    assert.deepEqual(s.tile, SALT_JETTIES[s.id]);
    const tx = Math.floor(s.x / TILE), ty = Math.floor(s.y / TILE);
    assert.deepEqual([tx, ty], [s.tile.x, s.tile.y - 1], `${s.id}: a step toward land`);
    assert.ok(!isSolidTile(tx, ty) && reach[ty * MAP_W + tx] === 1, `${s.id} arrival ${tx},${ty} walkable and reachable`);
    assert.equal(ferryStopNear(s.x, s.y)?.id, s.id, `${s.id}: you can board again where you step off`);
    assert.equal(ferryStopById(s.id), s);
  }
  assert.equal(ferryStopNear(pell.x, pell.y)?.id, "saltmere", "Pell's boat is the Saltmere stop");
  assert.equal(ferryStopNear(pell.x, pell.y - FERRY_RANGE - TILE), undefined, "but not from up Harbour Street");
  assert.equal(ferryStopById("oakvale"), undefined);
  assert.equal(ferryStopById(3), undefined);
  assert.equal(ferryOpen({ quests: quester(RED_N - 1) }), false, "not before the Redfang Chief");
  assert.equal(ferryOpen({ quests: quester(RED_N) }), true);
  assert.equal(ferryOpen(undefined), false);
});

test("ferry: every refusal, and a ride (server/ferry.ts, no room)", () => {
  const sent: [string, unknown][] = [], cast: [string, unknown][] = [];
  let lantern = false;
  const h = { send: (t: string, m: unknown) => sent.push([t, m]), broadcast: (t: string, m: unknown) => cast.push([t, m]), lanternHeld: () => lantern };
  const now = 1_000_000;
  const hero = (o: Partial<FerryHero> = {}): FerryHero => ({
    x: pell.x, y: pell.y, dead: false, gold: 100, lastHurt: 0, moving: true, rollUntil: 9, rolling: true, emote: "wave", quests: quester(RED_N), ...o,
  });
  const go = (p: FerryHero | undefined, msg: unknown) => rideFerry(h, "pid", p, msg, now);
  for (const bad of [undefined, null, 5, "gullrock", {}, { to: 3 }, { to: ["gullrock"] }, { to: "oakvale" }, { to: "x".repeat(500) }]) assert.equal(go(hero(), bad), "bad", JSON.stringify(bad));
  assert.equal(go(undefined, { to: "gullrock" }), "bad");
  assert.equal(go(hero({ dead: true }), { to: "gullrock" }), "dead");
  assert.equal(go(hero({ quests: quester(RED_N - 1) }), { to: "gullrock" }), "closed");
  assert.equal(go(hero({ y: pell.y - 10 * TILE }), { to: "gullrock" }), "far");
  assert.equal(go(hero(), { to: "saltmere" }), "same");
  lantern = true;
  assert.equal(go(hero(), { to: "gullrock" }), "lantern");
  lantern = false;
  assert.equal(go(hero({ lastHurt: now - PORTAL_COMBAT_MS + 100 }), { to: "gullrock" }), "fight", "hit 4.9 s ago");
  assert.equal(go(hero({ gold: FERRY_FEE - 1 }), { to: "gullrock" }), "gold");
  assert.deepEqual(sent.map(([, m]) => (m as { why: string }).why), ["closed", "far", "fight", "gold"], "only what a player can act on is told");
  assert.ok(sent.every(([t]) => t === "ferryno"));
  assert.equal(cast.length, 0, "no refusal moves anyone");
  const p = hero({ lastHurt: now - PORTAL_COMBAT_MS });
  assert.equal(go(p, { to: "heronwreck" }), "ok", "hit exactly 5 s ago may go");
  const dest = ferryStopById("heronwreck")!;
  assert.deepEqual([p.x, p.y, p.gold, p.moving, p.rolling, p.rollUntil, p.emote], [dest.x, dest.y, 100 - FERRY_FEE, false, false, 0, ""]);
  assert.deepEqual(cast.map(([t]) => t), ["travel", "sfx"]);
  assert.deepEqual(cast[0][1], { id: "pid", from: "", to: "", x: Math.round(dest.x), y: Math.round(dest.y), why: "ferry" });
  assert.deepEqual(cast[1][1], { ev: "ferry", id: "pid", from: "saltmere", to: "heronwreck", x1: Math.round(pell.x), y1: Math.round(pell.y), x: Math.round(dest.x), y: Math.round(dest.y), fee: FERRY_FEE });
});

test("ferry (room): a ride costs the fee and lands on the stop's jetty; refusals answer ferryno", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    const rides: any[] = [], no: string[] = [];
    c.onMessage("sfx", (m: any) => { if (m.ev === "ferry") rides.push(m); });
    c.onMessage("ferryno", (m: { why: string }) => no.push(m.why));
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    room.qset(p, tut, { questId: CHAINS[tut].quests.length, questStage: 0, questCount: 0 });
    // chain not done: closed
    p.x = pell.x; p.y = pell.y; p.gold = 100; p.lastHurt = 0;
    c.send("ferry", { to: "gullrock" });
    assert.ok(await until(() => no.length === 1), "refused");
    assert.equal(no[0], "closed");
    room.qset(p, RED_CHAIN, { questId: RED_N, questStage: 0, questCount: 0 });
    c.send("ferry", { to: "gullrock" });
    assert.ok(await until(() => rides.length === 1), "rode");
    const g = ferryStopById("gullrock")!;
    assert.equal(p.gold, 100 - FERRY_FEE);
    assert.ok(Math.hypot(p.x - g.x, p.y - g.y) < 1, "on the Gullrock jetty");
    assert.deepEqual([rides[0].id, rides[0].from, rides[0].to], [c.sessionId, "saltmere", "gullrock"]);
    p.lastHurt = 0;
    c.send("ferry", { to: "heronwreck" });
    assert.ok(await until(() => rides.length === 2), "rode on from the jetty");
    const hw = ferryStopById("heronwreck")!;
    assert.ok(Math.hypot(p.x - hw.x, p.y - hw.y) < 1, "on the Heronwreck jetty");
    assert.equal(p.gold, 100 - 2 * FERRY_FEE);
    // fresh clients (each its own rate-limit budget) for the rest; c stays, so the room does too
    const d = await srv.join({ cls: "knight" });
    const no2: string[] = [], rides2: any[] = [];
    d.onMessage("ferryno", (m: { why: string }) => no2.push(m.why));
    d.onMessage("sfx", (m: any) => { if (m.ev === "ferry") rides2.push(m); });
    await wait(200);
    const q = room.state.players.get(d.sessionId);
    room.qset(q, tut, { questId: CHAINS[tut].quests.length, questStage: 0, questCount: 0 });
    room.qset(q, RED_CHAIN, { questId: RED_N, questStage: 0, questCount: 0 });
    q.x = pell.x; q.y = pell.y - 12 * TILE; q.gold = 100; q.lastHurt = 0;
    d.send("ferry", { to: "gullrock" });
    assert.ok(await until(() => no2.length === 1));
    q.x = pell.x; q.y = pell.y; q.lastHurt = Date.now();
    d.send("ferry", { to: "gullrock" });
    assert.ok(await until(() => no2.length === 2));
    q.lastHurt = 0; q.gold = FERRY_FEE - 1;
    d.send("ferry", { to: "gullrock" });
    assert.ok(await until(() => no2.length === 3));
    assert.deepEqual(no2, ["far", "fight", "gold"]);
    assert.equal(q.gold, FERRY_FEE - 1, "no fee taken");
    assert.ok(Math.hypot(q.x - pell.x, q.y - pell.y) < 1, "still on the pier");
    await d.leave();
    // bad payloads: ignored, nothing moves, nothing is paid
    const e = await srv.join({ cls: "knight" });
    const said: string[] = [], rides3: any[] = [];
    e.onMessage("ferryno", (m: { why: string }) => said.push(m.why));
    e.onMessage("sfx", (m: any) => { if (m.ev === "ferry") rides3.push(m); });
    await wait(200);
    const r = room.state.players.get(e.sessionId);
    room.qset(r, tut, { questId: CHAINS[tut].quests.length, questStage: 0, questCount: 0 });
    room.qset(r, RED_CHAIN, { questId: RED_N, questStage: 0, questCount: 0 });
    r.x = pell.x; r.y = pell.y; r.gold = 100; r.lastHurt = 0;
    for (const m of [{ to: 7 }, { to: "oakvale" }, { to: "saltmere" }, "gullrock"]) e.send("ferry", m);
    await wait(600);
    assert.deepEqual([said, rides3.length, r.gold], [[], 0, 100]);
    assert.ok(Math.hypot(r.x - pell.x, r.y - pell.y) < 1);
    await e.leave();
    assert.equal(rides2.length, 0);
    await c.leave();
  } finally {
    await srv.stop();
  }
});

test("ferry (room): spamming the message is rate-limited", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    const rides: any[] = [];
    c.onMessage("sfx", (m: any) => { if (m.ev === "ferry") rides.push(m); });
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    room.qset(p, tut, { questId: CHAINS[tut].quests.length, questStage: 0, questCount: 0 });
    room.qset(p, RED_CHAIN, { questId: RED_N, questStage: 0, questCount: 0 });
    p.x = pell.x; p.y = pell.y; p.gold = 1000; p.lastHurt = 0;
    for (let i = 0; i < 12; i++) c.send("ferry", { to: i % 2 ? "saltmere" : "gullrock" }); // every one a valid ride
    await until(() => rides.length >= ASK_BURST);
    await wait(500);
    assert.ok(rides.length >= 1 && rides.length <= ASK_BURST + 1, `${rides.length} of 12 rides went through`);
    assert.equal(p.gold, 1000 - rides.length * FERRY_FEE, "only the rides that went are paid");
    await c.leave();
  } finally {
    await srv.stop();
  }
});
