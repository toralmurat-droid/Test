import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, until, wait } from "./helpers/room";
import { TILE } from "../shared/constants";
import { isSafeZone, isSolidAt } from "../shared/map";
import { clearWalk } from "../shared/bandits";
import { noMobsAt } from "../shared/spawns";
import { fortGroundAt, isWildMob, nearestOffFort } from "../shared/war/fortGround";
import { fortOf, setHoldOwners } from "../shared/war/holdWalls";
import { HOLDS } from "../shared/war/standards";
import { newMinds } from "../shared/war/doctrine";
import { newWar } from "../shared/war/rules";
import { _resetWar, warState } from "../server/war";

/** A Hold out in the open (not in a town or a safe zone), its middle (courtyard) and the nearest ground outside its fort. */
const HOLD = HOLDS.find((h) => !noMobsAt(h.x, h.y) && !isSafeZone(h.x, h.y) && fortOf(h.t, "wardens"))!;
const OUT = nearestOffFort(HOLD.x, HOLD.y)!;

test("fort ground (room): the room fills its zones with no wild monster on fort ground", async () => {
  const srv = await startRoom();
  try {
    await srv.join({ cls: "wizard" });
    await wait(150);
    const inside: string[] = [];
    srv.room.state.mobs.forEach((m: any, id: string) => { if (!m.dead && isWildMob(m) && fortGroundAt(m.x, m.y)) inside.push(`${id} ${m.kind} (${(m.x / TILE).toFixed(0)}, ${(m.y / TILE).toFixed(0)})`); });
    assert.deepEqual(inside, []);
  } finally { await srv.stop(); }
});

test("fort ground (room): a wild monster can't step into a fort but can step out; troopers, summons and quest monsters can go in", async () => {
  const srv = await startRoom();
  try {
    await srv.join({ cls: "wizard" });
    await wait(150);
    const room = srv.room;
    let wild: any;
    room.state.mobs.forEach((m: any) => { if (!wild && !m.dead && m.kind === "slime" && !m.owner && !m.summonFor && !m.camp && !m.guard) wild = m; });
    assert.ok(wild, "a wild slime");
    const inX = HOLD.x, inY = HOLD.y;
    assert.ok(fortGroundAt(inX, inY) && !fortGroundAt(OUT.x, OUT.y) && !isSolidAt(OUT.x, OUT.y));
    // standing outside: the courtyard is refused, open ground outside is not
    wild.x = OUT.x; wild.y = OUT.y;
    assert.equal(room.canStep(wild, inX, inY), false, "a wild monster may not step into the fort");
    assert.equal(room.canStep(wild, OUT.x + 1, OUT.y), !fortGroundAt(OUT.x + 1, OUT.y));
    // standing inside (a spawn from before, a knockback): it may walk, so it can walk out
    wild.x = inX; wild.y = inY;
    assert.equal(room.canStep(wild, OUT.x, OUT.y), true, "it may step out");
    assert.equal(room.canStep(wild, inX + 2, inY), true, "and walk on inside until it is out");
    // a wild monster chasing a hero (or a monster) follows it in, so a fort is no refuge from melee monsters
    wild.x = OUT.x; wild.y = OUT.y;
    wild.target = "hero"; assert.equal(room.canStep(wild, inX, inY), true, "a chasing monster may follow its target in"); wild.target = "";
    wild.foe = "rival"; assert.equal(room.canStep(wild, inX, inY), true, "a fighting monster may follow its foe in"); wild.foe = "";
    // not wild: a clan's trooper, a hero's summon, a quest monster, a Night Raider
    for (const set of [(m: any) => { m.kind = "trooper"; }, (m: any) => { m.owner = "someone"; }, (m: any) => { m.summonFor = "someone"; }, (m: any) => { m.kind = "nightraider"; }]) {
      const was = { kind: wild.kind, owner: wild.owner, summonFor: wild.summonFor };
      set(wild); wild.x = OUT.x; wild.y = OUT.y;
      assert.equal(room.canStep(wild, inX, inY), true, `${wild.kind}/${wild.owner}/${wild.summonFor} may go in`);
      Object.assign(wild, was);
    }
  } finally { setHoldOwners([]); await srv.stop(); }
});

test("fort ground (room): a wild monster found in a fort gets a home outside and walks out to it", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(150);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    let wild: any;
    room.state.mobs.forEach((m: any) => { if (!wild && !m.dead && m.kind === "slime" && !m.owner && !m.summonFor && !m.camp && !m.guard) wild = m; });
    assert.ok(wild, "a wild slime");
    p.hp = p.maxHp = 100_000; p.x = OUT.x; p.y = OUT.y; // a hero nearby wakes the monsters (they sleep far from heroes)
    room.state.mobs.forEach((m: any, id: string) => { if (m !== wild && Math.hypot(m.x - HOLD.x, m.y - HOLD.y) < 20 * TILE) room.state.mobs.delete(id); });
    wild.x = wild.homeX = HOLD.x; wild.y = wild.homeY = HOLD.y; wild.target = ""; wild.foe = "";
    assert.ok(await until(() => !fortGroundAt(wild.homeX, wild.homeY), 3000), "the wall sweep moved its home out of the fort");
    assert.ok(await until(() => !fortGroundAt(wild.x, wild.y), 15000), `it walked out (at ${(wild.x / TILE).toFixed(1)}, ${(wild.y / TILE).toFixed(1)})`);
  } finally { setHoldOwners([]); await srv.stop(); }
});

test("fort ground (room): a wild monster left inside a walled fort (it chased a hero in) finds its way out", async () => {
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });
  warState()!.owner[HOLD.t] = "wardens"; warState()!.fort[HOLD.t] = 1; // a whole fort: the walls stand
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(150);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    // its home is outside, behind the back wall (a straight walk only meets the palisade)
    let k = 0; while (fortGroundAt(HOLD.x, HOLD.y + k * TILE)) k++;
    const BACK = { x: HOLD.x, y: HOLD.y + (k + 2) * TILE };
    assert.ok(await until(() => !clearWalk(HOLD.x, HOLD.y, BACK.x, BACK.y), 3000), "the room raised the fort: a wall stands between the courtyard and home");
    assert.ok(!isSolidAt(BACK.x, BACK.y));
    let wild: any;
    room.state.mobs.forEach((m: any) => { if (!wild && !m.dead && m.kind === "slime" && !m.owner && !m.summonFor && !m.camp && !m.guard) wild = m; });
    assert.ok(wild, "a wild slime");
    p.hp = p.maxHp = 100_000; p.x = BACK.x; p.y = BACK.y; // a hero nearby wakes it
    room.state.mobs.forEach((m: any, id: string) => { if (m !== wild && Math.hypot(m.x - HOLD.x, m.y - HOLD.y) < 20 * TILE) room.state.mobs.delete(id); });
    // it lost its target in the courtyard
    wild.hp = wild.maxHp = 1_000_000; wild.x = HOLD.x; wild.y = HOLD.y; wild.homeX = BACK.x; wild.homeY = BACK.y; wild.target = ""; wild.foe = "";
    assert.ok(await until(() => !fortGroundAt(wild.x, wild.y), 30000), `it walked out round the walls (at ${(wild.x / TILE).toFixed(1)}, ${(wild.y / TILE).toFixed(1)})`);
  } finally { _resetWar(); setHoldOwners([]); await srv.stop(); }
});
