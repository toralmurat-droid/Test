import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, until, wait } from "./helpers/room";
import { PLAYER_RADIUS, TILE } from "../shared/constants";
import { blocked } from "../shared/movement";
import type { ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { BLOCKING, FORT_PLANS, fortOf, liveTier, setHoldOwners, touchesHoldWall } from "../shared/war/holdWalls";
import { newWar } from "../shared/war/rules";
import { HOLDS } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { _resetWar, warState } from "../server/war";
import { rememberLive } from "../server/handoff";

/** A Hold whose `clan` fort stands whole (no wall left out), away from any other Hold. */
const HOLD = HOLDS.find((h) => {
  const f = fortOf(h.t, "wardens")!;
  return f.walls.length === FORT_PLANS.wardens.cells.filter((c) => BLOCKING.has(c.kind)).length && !f.cells.some((c) => c.kind === "gap");
})!;
const stop = { up: false, down: false, left: false, right: false };

/** The war with `holder` holding HOLD's land, its Hold a camp (fort 0.3, W3: a fresh Hold is an outpost) unless `fort` says otherwise. */
async function setup(srv: Awaited<ReturnType<typeof startRoom>>, holder: ClanKey, fort = 0.3) {
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });
  warState()!.owner[HOLD.t] = holder; warState()!.fort[HOLD.t] = fort;
  const c = await srv.join({ cls: "wizard" });
  await wait(150);
  const room = srv.room, p = room.state.players.get(c.sessionId);
  p.hp = p.maxHp = 100_000; p.level = 30;
  p.x = HOLD.x; p.y = HOLD.y;
  // nobody in the way: no wild monsters, no troopers near the Hold
  room.state.mobs.forEach((m: any, id: string) => { if (Math.hypot(m.x - HOLD.x, m.y - HOLD.y) < 20 * TILE) room.state.mobs.delete(id); });
  assert.ok(await until(() => touchesHoldWall(HOLD.x + 4 * TILE, HOLD.y - 4 * TILE, PLAYER_RADIUS) === (holder === "wardens"), 3000), "the room raised the holder's fort");
  return { c, room, p };
}

test("hold walls (room): the server stops a hero at the fort's wall and lets him out through the gate", async () => {
  const srv = await startRoom();
  try {
    const { c, p } = await setup(srv, "wardens");
    const f = fortOf(HOLD.t, "wardens")!, north = (f.cy - 4 + 1) * TILE; // the inner face of the north palisade
    c.send("input", { ...stop, up: true, seq: 1 });
    await wait(1500);
    assert.ok(p.y > north && p.y < HOLD.y - 2 * TILE, `stopped at the north wall (y ${p.y.toFixed(0)}, wall face ${north})`);
    c.send("input", { ...stop, seq: 2 });
    p.x = HOLD.x; p.y = HOLD.y;
    c.send("input", { ...stop, right: true, seq: 3 });
    assert.ok(await until(() => p.x > (f.cx + 6) * TILE, 4000), `out through the east gate (x ${p.x.toFixed(0)})`);
    c.send("input", { ...stop, seq: 4 });
  } finally { setHoldOwners([]); await srv.stop(); }
});

test("hold walls (room): when the land changes hands, heroes and monsters standing where the new fort's walls rise are moved out", async () => {
  const srv = await startRoom();
  try {
    const { room, p } = await setup(srv, "wardens");
    const was = fortOf(HOLD.t, "wardens")!, next = fortOf(HOLD.t, "host")!, open = new Set(was.walls.map(([x, y]) => `${x},${y}`));
    const [tx, ty] = next.walls.find(([x, y]) => !open.has(`${x},${y}`) && Math.abs(x - next.cx) <= 2 && Math.abs(y - next.cy) <= 2)!; // the keep's inner wall: Wardens courtyard
    const sx = (tx + 0.5) * TILE, sy = (ty + 0.5) * TILE;
    p.x = sx; p.y = sy;
    // any monster will do: take one from elsewhere and stand it on the same spot (beside the hero)
    let mob: any;
    room.state.mobs.forEach((m: any) => { if (!mob && !m.dead && m.kind !== "trooper") mob = m; });
    assert.ok(mob, "a monster to move");
    mob.x = sx + 4; mob.y = sy; mob.homeX = sx + 4; mob.homeY = sy;
    await wait(1200);
    assert.ok(Math.hypot(p.x - sx, p.y - sy) < 1, "the Wardens' courtyard: nothing to move");
    warState()!.owner[HOLD.t] = "host"; // the Ossuary Host take the land: its keep rises (as a camp here: the test sets no flip reset)
    assert.ok(await until(() => !touchesHoldWall(p.x, p.y, PLAYER_RADIUS) && !touchesHoldWall(mob.x, mob.y, PLAYER_RADIUS), 3000), "both moved out of the new wall");
    assert.ok(!blocked(p.x, p.y) && Math.hypot(p.x - sx, p.y - sy) <= 1.5 * TILE, `the hero stands on free ground next to it (${((p.x - sx) / TILE).toFixed(1)}, ${((p.y - sy) / TILE).toFixed(1)} tiles)`);
    assert.ok(!blocked(mob.x, mob.y) && Math.hypot(mob.x - sx, mob.y - sy) <= 2 * TILE, "the monster too");
    assert.ok(!touchesHoldWall(mob.homeX, mob.homeY, PLAYER_RADIUS), "and its home is out of the wall");
  } finally { setHoldOwners([]); await srv.stop(); }
});

test("hold walls (room): a hero coming back (resume after an update) where a wall now stands is out of it at once, not at the next sweep", async () => {
  const srv = await startRoom();
  try {
    await setup(srv, "wardens"); // the room is up, the Wardens' palisade stands
    const room = srv.room, f = fortOf(HOLD.t, "wardens")!, [wx, wy] = f.walls.find(([x, y]) => y === f.cy - 4 && Math.abs(x - f.cx) <= 1)!;
    const sx = (wx + 0.5) * TILE, sy = (wy + 0.5) * TILE, name = `Wallback${process.pid % 1000}`;
    room.holdWalls.sync = () => 0; // no sweep: only the join itself may move the hero
    rememberLive(name, "wizard", { x: sx, y: sy, dir: "down", hp: 50, mana: 0, energy: 0, group: [] });
    const sid = "wallback";
    room.onJoin({ sessionId: sid, send: () => {} }, { cls: "wizard" }, { name }); // a returning hero (not New game)
    const p = room.state.players.get(sid);
    assert.ok(Math.hypot(p.x - sx, p.y - sy) <= 1.5 * TILE, `back where they stood, or a tile off it (${((p.x - sx) / TILE).toFixed(1)}, ${((p.y - sy) / TILE).toFixed(1)})`);
    assert.ok(!touchesHoldWall(p.x, p.y, PLAYER_RADIUS) && !blocked(p.x, p.y), "not inside the palisade");
    room.state.players.delete(sid);
  } finally { setHoldOwners([]); await srv.stop(); }
});

test("hold walls (room, W3): when a Hold grows, heroes where the outer works rise are moved out; when it shrinks or flips, the walls go", async () => {
  const srv = await startRoom();
  try {
    const { p } = await setup(srv, "wardens");
    const camp = fortOf(HOLD.t, "wardens", 1)!, big = fortOf(HOLD.t, "wardens", 2)!, small = fortOf(HOLD.t, "wardens", 0)!;
    const inCamp = new Set(camp.walls.map(([x, y]) => `${x},${y}`));
    const outer = big.walls.find(([x, y]) => !inCamp.has(`${x},${y}`) && Math.max(Math.abs(x - big.cx), Math.abs(y - big.cy)) >= 5); // the fortress's outer palisade
    assert.ok(outer, "this Hold has outer works");
    const sx = (outer[0] + 0.5) * TILE, sy = (outer[1] + 0.5) * TILE;
    p.x = sx; p.y = sy;
    await wait(1200);
    assert.ok(Math.hypot(p.x - sx, p.y - sy) < 1 && liveTier(HOLD.t) === 1, "a camp: nothing stands there yet");
    for (const n of TERRITORIES[HOLD.t].near) warState()!.owner[n] = "wardens"; // an inner land (a front land is a camp at most)
    warState()!.fort[HOLD.t] = 0.7; // built up to a fortress
    assert.ok(await until(() => liveTier(HOLD.t) === 2 && !touchesHoldWall(p.x, p.y, PLAYER_RADIUS), 2500), "the outer palisade rose and the hero is out of it within the next sweep");
    assert.ok(!blocked(p.x, p.y) && Math.hypot(p.x - sx, p.y - sy) <= 1.5 * TILE, `on free ground next to it (${((p.x - sx) / TILE).toFixed(1)} tiles)`);
    assert.ok(touchesHoldWall(sx, sy, PLAYER_RADIUS), "the wall stands");
    warState()!.control[HOLD.t] = 45; // shaken: a camp again
    assert.ok(await until(() => liveTier(HOLD.t) === 1 && !touchesHoldWall(sx, sy, PLAYER_RADIUS), 2500), "Control 45: the fortress shows a camp");
    warState()!.owner[HOLD.t] = "host"; warState()!.fort[HOLD.t] = 0; warState()!.control[HOLD.t] = 60; // a flip as warTick does it
    assert.ok(await until(() => liveTier(HOLD.t) === 0, 2500), "the new holder starts with an outpost");
    const hostSmall = fortOf(HOLD.t, "host", 0)!, [wx, wy] = hostSmall.walls[0];
    assert.ok(touchesHoldWall((wx + 0.5) * TILE, (wy + 0.5) * TILE, PLAYER_RADIUS) && small.walls.length > 0);
    assert.ok(!touchesHoldWall((camp.walls[0][0] + 0.5) * TILE, (camp.walls[0][1] + 0.5) * TILE, PLAYER_RADIUS) || hostSmall.walls.some(([x, y]) => x === camp.walls[0][0] && y === camp.walls[0][1]), "the camp's palisade is down");
  } finally { setHoldOwners([]); await srv.stop(); }
});
