// Saltmere rework phase 6 (docs/saltmere-rework-progress.md): the side arc "Saltmere Ways" from Bess Tanner.
// Smoke and Salt (driftwood from the shore slimes, the smoke-pit by the racks) and The Watch-Fire (a flame carried from
// Garrick's fire to the old cairn), which waits for "Salt and Steel".
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAP_W, TILE, WORLD_H } from "../shared/constants";
import { ACTIVE_CLASSES, CLASSES } from "../shared/classes";
import { isSafeZone, isSolidTile, randomSpawn } from "../shared/map";
import { SALT_RACKS, SALT_SQUARE, SALT_TOWN, WATCH_FIRE } from "../shared/saltmere";
import { allObjects, CHAINS, chainOpen, chainState, packQuest, QUEST_ITEMS, questDialog, questStep, RED_CHAIN, SIDE_ARCS, USE_RANGE, ZONE_ARCS } from "../shared/quests";
import { lightDrain, stepObjects } from "../shared/questSteps";
import { npcById } from "../shared/npcs";
import { SPAWN_ZONES } from "../shared/spawns";
import { startRoom, until, wait } from "./helpers/room";

const ci = CHAINS.findIndex((c) => c.id === "saltways");
const arc = SIDE_ARCS.find((a) => a.id === "saltways")!;
const [smoke, watch] = arc.quests;
const TUT = CHAINS.find((x) => x.id === "tutorial")!.quests.length;
const COD_DONE = CHAINS[RED_CHAIN].quests.findIndex((d) => d.id === "cod") + 1;

/** 4-way flood over free tiles from the spawn, overworld rows only (as tests/saltmere.test.ts). */
const REACH = (() => {
  const s = randomSpawn(), sx = Math.floor(s.x / TILE), sy = Math.floor(s.y / TILE);
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
})();
/** A reachable tile whose centre is within `r` px of (x, y). */
const reachableWithin = (x: number, y: number, r: number) => {
  const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
  for (let ty = cy - 3; ty <= cy + 3; ty++) for (let tx = cx - 3; tx <= cx + 3; tx++)
    if (REACH[ty * MAP_W + tx] && Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) <= r) return true;
  return false;
};
const inRect = (r: { x: number; y: number; w: number; h: number }, px: number, py: number) => {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  return tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h;
};
/** A test hero: tutorial done, the Redfang chain at `red` (quest index), the arc at `arc`. */
const hero = (red: number, at = 0, level = 17) => ({ level, quests: { tut: packQuest(TUT, 0, 0), red: packQuest(red, 0, 0), saltways: at } }) as any;

test("Saltmere Ways: the last side arc (no chain index moves), its own quests-map key, two quests from Bess Tanner", () => {
  assert.equal(SIDE_ARCS[SIDE_ARCS.length - 1], arc, "appended at the end of SIDE_ARCS");
  assert.equal(ci, CHAINS.length - 1);
  assert.ok(ci >= ZONE_ARCS.length);
  assert.equal(CHAINS.filter((c) => c.packed === "saltways").length, 1, "one chain on the key");
  const others = CHAINS.filter((c) => c.id !== "saltways").flatMap((c) => [c.packed, c.verKey, ...c.keys]);
  for (const k of [CHAINS[ci].packed, CHAINS[ci].verKey, ...CHAINS[ci].keys]) assert.ok(!others.includes(k), `${k} is not another chain's`);
  assert.deepEqual(arc.quests.map((d) => d.id), ["smokesalt", "watchfire"]);
  assert.deepEqual(arc.quests.map((d) => d.title), ["Smoke and Salt", "The Watch-Fire"]);
  assert.ok(arc.quests.every((d) => d.giver === "smoker" && !d.auto), "Bess offers both");
  assert.deepEqual(arc.quests.map((d) => d.minLevel), [16, 17]);
  // the driftwood drop: quest-only, from the slimes of the coast
  assert.ok(QUEST_ITEMS.driftwood);
  const collect = smoke.steps[0];
  assert.equal(collect.type, "collect"); assert.equal(collect.item, "driftwood"); assert.equal(collect.goal, 8);
  const coast = SPAWN_ZONES.filter((z) => z.name === "Saltwind Coast" || z.name === "Heronwreck Strand");
  assert.equal(coast.length, 2);
  for (const k of collect.kinds!) {
    assert.ok((collect.chance?.[k] ?? 0) > 0, `${k} drops it`);
    assert.ok(coast.every((z) => (z.mobs[k] ?? 0) > 0), `${k} lives on both shores`);
  }
  assert.deepEqual(smoke.steps.map((s) => s.type), ["collect", "use", "talk"]);
  assert.deepEqual(watch.steps.map((s) => s.type), ["carry", "use", "talk"]);
  // rewards in line with the coast arc's Lv 17-19 quests (arcReward)
  for (const d of arc.quests) assert.ok(d.reward.xp > 0 && d.reward.xp < 1200 && d.reward.gold > 0 && d.reward.gold < 300, `${d.id} reward`);
});

test("Saltmere Ways: the smoke-pit, the lantern and the cairn stand outside the square, reachable, clear of other objects", () => {
  const objs = arc.quests.flatMap((d) => d.steps.flatMap(stepObjects));
  assert.deepEqual(objs.map((o) => o.id), ["salt_smokepit", "salt_firelantern", "salt_watchfire"]);
  const all = allObjects();
  for (const o of objs) {
    assert.ok(all.includes(o), `${o.id} is drawn`);
    assert.ok(!inRect(SALT_SQUARE, o.x, o.y) && !isSafeZone(o.x, o.y), `${o.id} outside the safe square`);
    assert.ok(inRect(SALT_TOWN, o.x, o.y), `${o.id} in Saltmere`);
    assert.ok(reachableWithin(o.x, o.y, USE_RANGE), `${o.id} can be used from walkable ground`);
    for (const x of all) if (x !== o) assert.ok(Math.hypot(x.x - o.x, x.y - o.y) >= 2 * TILE, `${o.id} clear of ${x.id}`);
  }
  const [pit, lantern, cairn] = objs;
  // the pit sits between the fish racks, the cairn on WATCH_FIRE
  assert.deepEqual([Math.floor(pit.x / TILE), Math.floor(pit.y / TILE)], [SALT_RACKS[0][0], SALT_RACKS[0][1] + 1]);
  assert.deepEqual([Math.floor(cairn.x / TILE), Math.floor(cairn.y / TILE)], [WATCH_FIRE.x, WATCH_FIRE.y]);
  assert.equal(pit.kind, "clue"); assert.equal(lantern.kind, "lastlantern"); assert.equal(cairn.kind, "cairn");
  // the carry ends at the cairn, and a straight walk at night by the water still fits in its light
  const carry = watch.steps[0].carry!;
  assert.ok(Math.hypot(carry.to.x - cairn.x, carry.to.y - cairn.y) < TILE && reachableWithin(carry.to.x, carry.to.y, carry.to.r));
  const slowest = Math.min(...ACTIVE_CLASSES.map((c) => CLASSES[c].speed));
  const secs = Math.max(0, Math.hypot(carry.to.x - carry.take.x, carry.to.y - carry.take.y) - carry.to.r) / slowest;
  const used = lightDrain(carry, { water: true, dark: true, ground: false }, secs);
  assert.ok(used <= carry.light * 0.6, `a night walk by the water uses ${used.toFixed(1)} of ${carry.light}`);
});

test("Saltmere Ways: The Watch-Fire waits for Salt and Steel; Bess points the hero to the Redfang in between", () => {
  assert.equal(chainOpen(hero(0), ci), true, "Smoke and Salt is open from the start");
  assert.equal(questDialog("smoker", hero(0, 0, 16))!.accept, smoke.acceptText);
  const between = hero(COD_DONE - 1, packQuest(1, 0, 0));
  assert.equal(chainOpen(between, ci), false, "not before Salt and Steel");
  const line = questDialog("smoker", between)!;
  assert.equal(line.accept, undefined, "no offer");
  assert.match(line.text.join(" "), /Redfang/);
  const after = hero(COD_DONE, packQuest(1, 0, 0));
  assert.equal(chainOpen(after, ci), true, "offered after Salt and Steel");
  assert.deepEqual(questDialog("smoker", after)!.text, watch.offer);
  assert.equal(chainOpen(hero(COD_DONE - 1, packQuest(1, 1, 0)), ci), false, "the gate is only on the offer");
  // a hero without the key has not begun
  assert.deepEqual(chainState({ level: 20, quests: { tut: packQuest(TUT, 0, 0) } }, ci), { chain: ci, questId: 0, questStage: 0, questCount: 0, level: 20 });
});

test("Saltmere Ways through the room: driftwood, the smoke-pit, Bess; the flame carried to the cairn, lit, Bess; saved", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(200);
    const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
    p.quests.set("tut", packQuest(TUT, 0, 0));
    p.level = 16; p.invulnUntil = Date.now() + 600_000;
    const bess = npcById("smoker")!;
    const toBess = () => { p.x = bess.x + 10; p.y = bess.y + 10; };
    toBess();
    await wait(150);
    c.send("quest", { chain: ci });
    assert.ok(await until(() => chainState(p, ci)!.questStage === 1), "Smoke and Salt accepted from Bess");
    assert.equal(p.quests.get("saltways"), packQuest(0, 1, 0), "kept in the quests map");

    // driftwood: a shore slime dies to the hero, the drop is theirs alone, picked up it counts
    const rnd = Math.random;
    for (let i = 0; i < 8; i++) {
      Math.random = () => 0;
      try { room.questKill(id, p, { kind: "slime", x: p.x, y: p.y }, ci); } finally { Math.random = rnd; }
      const drops = [...room.state.items.values()].filter((it: any) => it.kind === "quest" && it.gear === "driftwood");
      assert.equal(drops.length, 1, "one driftwood drop");
      assert.equal(drops[0].owner, id, "only this hero's");
      p.x = drops[0].x; p.y = drops[0].y;
      room.pickUp(p, id);
      if (i < 7) assert.equal(chainState(p, ci)!.questCount, i + 1);
    }
    assert.equal(questStep(chainState(p, ci))!.type, "use", "eight pieces: on to the racks");
    const pit = smoke.steps[1].objects![0];
    p.x = pit.x - TILE; p.y = pit.y - 0.2 * TILE;
    c.send("use", { id: pit.id });
    assert.ok(await until(() => chainState(p, ci)!.questStage === 3), "the smoke-pit lit");
    toBess();
    const gold0 = p.gold;
    c.send("quest", { chain: ci });
    assert.ok(await until(() => chainState(p, ci)!.questId === 1), "Smoke and Salt handed in");
    assert.equal(p.gold, gold0 + smoke.reward.gold);

    // The Watch-Fire: not offered before Salt and Steel
    p.level = 17;
    c.send("quest", { chain: ci });
    await wait(300);
    assert.equal(chainState(p, ci)!.questStage, 0, "not offered before Salt and Steel");
    p.quests.set("red", packQuest(COD_DONE, 0, 0));
    c.send("quest", { chain: ci });
    assert.ok(await until(() => chainState(p, ci)!.questStage === 1), "offered after it");

    // take the storm lantern at Garrick's fire, walk it to the cairn
    const carry = watch.steps[0].carry!;
    p.x = carry.take.x + 4; p.y = carry.take.y;
    await wait(100);
    c.send("use", { id: carry.take.id });
    assert.ok(await until(() => p.qlock === true), "lantern taken up");
    p.x = carry.to.x; p.y = carry.to.y;
    assert.ok(await until(() => chainState(p, ci)!.questStage === 2), "the flame reached the cairn");
    assert.equal(p.qlock, false, "hands free again");
    const cairn = watch.steps[1].objects![0];
    p.x = cairn.x + TILE; p.y = cairn.y;
    c.send("use", { id: cairn.id });
    assert.ok(await until(() => chainState(p, ci)!.questStage === 3), "the watch-fire lit");
    toBess();
    const gold1 = p.gold;
    c.send("quest", { chain: ci });
    assert.ok(await until(() => chainState(p, ci)!.questId === 2), "The Watch-Fire handed in");
    assert.equal(p.gold, gold1 + watch.reward.gold);
    const snap = room.snapshot(p) as unknown as Record<string, number>;
    assert.deepEqual([snap.saltwaysId, snap.saltwaysStage, snap.saltwaysVer], [2, 0, 1], "saved under the arc's names");
    await c.leave();
  } finally {
    await srv.stop();
  }
});

test("Saltmere Ways: a save from before the arc loads as not begun", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    const save = room.snapshot(p) as Record<string, unknown>;
    for (const k of [...CHAINS[ci].keys, CHAINS[ci].verKey]) delete save[k];
    save.level = 18;
    room.restore(p, save);
    assert.equal(p.quests.has("saltways"), false, "no key in the quests map");
    assert.deepEqual(chainState(p, ci), { chain: ci, questId: 0, questStage: 0, questCount: 0, level: p.level });
    await c.leave();
  } finally {
    await srv.stop();
  }
});
