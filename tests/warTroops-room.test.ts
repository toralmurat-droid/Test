import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, until, wait } from "./helpers/room";
import { TILE, WORLD_H } from "../shared/constants";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { garrisonSpots, patrolOf, TROOP } from "../shared/war/patrols";
import { newWar } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { parseTroop, WAR_TROOPS } from "../shared/war/troops";
import { SAFE_ZONE } from "../shared/map";
import { _resetWar, warNow, warState } from "../server/war";

/** An Act 1 land with a patrol and guard posts, away from Oakvale. */
const LAND = TERRITORIES.find((t) => patrolOf(t.id) && garrisonSpots(t.id, TROOP.garrisonMax).length >= 4 && t.act === 1 && !t.capitalOf
  && Math.hypot(t.cx - (SAFE_ZONE.x + SAFE_ZONE.w / 2), t.cy - (SAFE_ZONE.y + SAFE_ZONE.h / 2)) > 60)!;
const freshWar = () => _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });

/** The room's troopers of LAND (id, mob). */
const landTroops = (room: any): [string, any][] =>
  (room.warTroops._land(LAND.id)?.slots ?? []).filter((s: any) => s.id && room.state.mobs.has(s.id)).map((s: any) => [s.id, room.state.mobs.get(s.id)]);
const guardOf = (room: any): [string, any] => landTroops(room).find(([, m]) => {
  const g = garrisonSpots(LAND.id, TROOP.garrisonMax);
  return g.some((s) => Math.hypot(s.x - m.x, s.y - m.y) < 4);
})!;

async function setup(srv: Awaited<ReturnType<typeof startRoom>>, cls = "wizard") {
  const c = await srv.join({ cls });
  await wait(150);
  const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
  p.level = 30; p.hp = p.maxHp = 100_000; p.invulnUntil = 0;
  const gate = patrolOf(LAND.id)!.pts[0];
  p.x = gate.x; p.y = gate.y;
  room.warTroops.tick(Date.now());
  // no wild monsters in the way: only the troops are left to fight
  room.state.mobs.forEach((m: any, mid: string) => { if (m.kind !== "trooper") room.state.mobs.delete(mid); });
  const chat: string[] = [];
  c.onMessage("chat", (m: any) => chat.push(m.text));
  return { c, room, id, p, chat };
}

test("war troops (room): a land near a hero fields its holder's troops; they vanish when it sleeps", async () => {
  const srv = await startRoom(), sleep = WAR_TROOPS.sleepMs;
  freshWar();
  try {
    const { room, p } = await setup(srv);
    const mine = landTroops(room), owner = warState()!.owner[LAND.id];
    assert.ok(mine.length >= 8, `troops out (${mine.length})`);
    assert.ok(mine.every(([id, m]) => id.startsWith("wt") && m.kind === "trooper" && parseTroop(m.weapon)?.clan === owner && m.level >= LAND.levels[0] && m.level <= LAND.levels[1]));
    WAR_TROOPS.sleepMs = 300;
    p.y = (WORLD_H + 20) * TILE; // underground: no land wakes
    await wait(400);
    room.warTroops.tick(Date.now());
    let left = 0;
    room.state.mobs.forEach((m: any) => { if (m.kind === "trooper") left++; });
    assert.equal(left, 0, "every land asleep");
  } finally { WAR_TROOPS.sleepMs = sleep; await srv.stop(); }
});

test("war troops (room): who they fight (own clan, unsworn, grudge, enemy clan); own clan's skills and shots hurt them not", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { c, room, id, p, chat } = await setup(srv);
    const owner = warState()!.owner[LAND.id] as ClanKey, foe = CLAN_KEYS.find((k) => k !== owner)!;
    const hits: string[] = []; // [hero id] of every trooper blow on a hero
    const dp = room.damagePlayer.bind(room);
    room.damagePlayer = (tid: string, dmg: number, by: string, push: any, kb: number, o: any = {}) => { if (String(o.from).startsWith("wt")) hits.push(tid); return dp(tid, dmg, by, push, kb, o); };
    const [gid, g] = guardOf(room);
    const post = garrisonSpots(LAND.id, TROOP.garrisonMax).find((s) => Math.hypot(s.x - g.x, s.y - g.y) < 4)!;
    const stand = () => { p.x = post.x + post.fx * 30; p.y = post.y + post.fy * 30; };
    // sworn to the holder: left alone, and their blows do nothing
    p.clan = owner; stand();
    await wait(1500);
    assert.equal(hits.filter((h) => h === id).length, 0, "own clan never struck");
    assert.ok(!room.targetsAround(g.x, g.y, 300, id).some((t: string) => t.startsWith("wt") && parseTroop(room.state.mobs.get(t)?.weapon)?.clan === owner), "no own trooper is an AoE target");
    assert.ok(!room.host.enemies(g.x, g.y, 300, id).includes(gid));
    const hp0 = g.hp;
    room.hitTarget(id, gid, 50, [0, 0], { basic: true });
    room.hitTarget(id, gid, 50, [0, 0], { skill: true });
    p.talents.set("w_blizzard", 1); p.mana = p.maxMana = 9999; p.sk.last = {};
    room.cast(id, "w_blizzard"); // the AoE field on the hero, the guard inside it
    p.ax = -post.fx; p.ay = -post.fy; p.attackReadyAt = 0;
    room.playerAttack(id); // a basic bolt straight at the guard
    await wait(1500);
    assert.equal(g.hp, hp0, "own clan's blows, skills and shots deal 0");
    assert.equal(chat.length, 0, "no grudge for the own clan");
    // unsworn: ignored... (the blizzard still raging would earn a grudge: it goes first)
    room.state.fields.forEach((_f: any, fid: string) => room.state.fields.delete(fid));
    room.state.projectiles.forEach((_s: any, sid: string) => room.state.projectiles.delete(sid));
    p.clan = undefined; stand();
    await wait(1200);
    assert.equal(hits.filter((h) => h === id).length, 0, "unsworn heroes are left alone");
    // ...until they strike once: a grudge, a note, and the troops answer
    room.hitTarget(id, gid, 1, [0, 0], {});
    assert.ok(g.hp < hp0, "an unsworn hero can hurt them");
    assert.ok(await until(() => chat.some((t) => /hunt you/.test(t)), 2000), "the grudge note");
    assert.ok(await until(() => hits.includes(id), 5000), "the troops attack after the grudge");
    assert.equal(chat.filter((t) => /hunt you/.test(t)).length, 1, "one note");
    // the same blizzard from an unsworn hero does reach the guard (so the 0 above was the clan rule, not a miss)
    const hp1 = g.hp; p.sk.last = {}; p.mana = 9999; stand();
    room.cast(id, "w_blizzard");
    assert.ok(await until(() => g.dead || g.hp < hp1, 3000), "an unsworn hero's AoE hurts them");
    // a hero sworn to another clan is attacked on sight
    const c2 = await srv.join({ cls: "wizard" });
    await wait(150);
    const q = room.state.players.get(c2.sessionId);
    p.clan = owner; // (the grudged hero calls the troops off: sworn to the holder now)
    assert.ok(await until(() => !!guardOf(room), 4000), "a guard back at its post");
    const [, g2] = guardOf(room), post2 = garrisonSpots(LAND.id, TROOP.garrisonMax).find((s) => Math.hypot(s.x - g2.x, s.y - g2.y) < 4)!;
    q.level = 30; q.hp = q.maxHp = 100_000; q.invulnUntil = 0; q.clan = foe;
    q.x = post2.x + post2.fx * 24; q.y = post2.y + post2.fy * 24;
    assert.ok(await until(() => hits.includes(c2.sessionId), 5000), "an enemy-sworn hero is struck");
    await c2.leave(); await c.leave();
  } finally { await srv.stop(); }
});

test("war troops (room): a trooper kill gives no XP or loot, valor is capped; the fallen come back; a new owner replaces them", async () => {
  const srv = await startRoom(), respawn = WAR_TROOPS.respawnMs;
  freshWar();
  try {
    const { room, id, p } = await setup(srv);
    const s = warState()!, owner = s.owner[LAND.id] as ClanKey, foe = CLAN_KEYS.find((k) => k !== owner)!;
    p.clan = foe; p.renown = 0;
    p.x = (LAND.x + LAND.w / 2) * TILE; p.y = (LAND.y + LAND.h / 2) * TILE; // inside the land
    const xp0 = p.xp, gold0 = p.gold, lvl0 = p.level;
    const n0 = landTroops(room).length;
    let items0 = 0; room.state.items.forEach(() => items0++);
    for (let i = 0; i < WAR_TROOPS.killValorPerTick + 2; i++) {
      const [tid, m] = landTroops(room).find(([, x]) => !x.dead)!;
      m.hp = 1;
      room.hitTarget(id, tid, 10, [0, 0], {});
      assert.ok(m.dead, `kill ${i}`);
    }
    let items = 0; room.state.items.forEach(() => items++);
    assert.equal(p.xp, xp0); assert.equal(p.level, lvl0); assert.equal(p.gold, gold0);
    assert.equal(items, items0, "no loot");
    assert.equal(p.renown, WAR_TROOPS.killValorPerTick * WAR_TROOPS.killValor, "valor capped per war tick (renown follows it)");
    // the fallen come back at the Hold gate
    WAR_TROOPS.respawnMs = 200;
    await wait(350);
    room.warTroops.tick(Date.now());
    assert.equal(landTroops(room).length, n0, "back to full strength");
    // the land changes hands: the whole force is the new holder's
    s.owner[LAND.id] = foe;
    room.warTroops.onWar(warNow());
    const after = landTroops(room);
    assert.equal(after.length, n0);
    assert.ok(after.every(([, m]) => parseTroop(m.weapon)?.clan === foe), "new holder's men");
  } finally { WAR_TROOPS.respawnMs = respawn; await srv.stop(); }
});
