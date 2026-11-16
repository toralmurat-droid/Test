import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, until, wait } from "./helpers/room";
import { TILE, WORLD_H } from "../shared/constants";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { atWar } from "../shared/war/feuds";
import { newMinds } from "../shared/war/doctrine";
import { garrisonCount, garrisonSpots, patrolOf, TROOP } from "../shared/war/patrols";
import { holdIntel } from "../shared/war/intel";
import { inSackReach } from "../shared/war/holdSack";
import { tierWallAt } from "../shared/war/holdWalls";
import { newWar, targetsOf } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { parseTroop, WAR_TROOPS } from "../shared/war/troops";
import { SAFE_ZONE } from "../shared/map";
import { SPAWN_ZONES } from "../shared/spawns";
import { _resetWar, warNow, warState } from "../server/war";

/** An Act 1 land with a patrol and guard posts, away from Oakvale. */
const LAND = TERRITORIES.find((t) => patrolOf(t.id) && garrisonSpots(t.id, TROOP.garrisonMax).length >= 4 && t.act === 1 && !t.capitalOf
  && Math.hypot(t.cx - (SAFE_ZONE.x + SAFE_ZONE.w / 2), t.cy - (SAFE_ZONE.y + SAFE_ZONE.h / 2)) > 60)!;
/** A new war, LAND's Hold a camp (W3: a fresh Hold is an outpost; the camp fields the guards these tests count on). */
const freshWar = () => { const s = newWar(); s.fort[LAND.id] = 0.3; _resetWar({ v: 1, state: s, minds: newMinds(), next: Date.now() + 1e9, log: [] }); };

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

test("war troops (room): who they fight; only enemy-sworn heroes hurt them (own clan's and unsworn heroes' blows, skills and shots deal 0)", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { c, room, id, p, chat } = await setup(srv);
    const owner = warState()!.owner[LAND.id] as ClanKey, foe = CLAN_KEYS.find((k) => k !== owner && atWar(k, owner))!; // (at war with the holder: shared/war/feuds.ts)
    const hits: string[] = []; // [hero id] of every trooper blow on a hero
    const dp = room.damagePlayer.bind(room);
    room.damagePlayer = (tid: string, dmg: number, by: string, push: any, kb: number, o: any = {}) => { if (String(o.from).startsWith("wt")) hits.push(tid); return dp(tid, dmg, by, push, kb, o); };
    const [gid, g] = guardOf(room);
    const post = garrisonSpots(LAND.id, TROOP.garrisonMax).find((s) => Math.hypot(s.x - g.x, s.y - g.y) < 4)!;
    const stand = () => { p.x = post.x + post.fx * 30; p.y = post.y + post.fy * 30; };
    const clear = () => {
      room.state.fields.forEach((_f: any, fid: string) => room.state.fields.delete(fid));
      room.state.projectiles.forEach((_s: any, sid: string) => room.state.projectiles.delete(sid));
    };
    const hp0 = g.hp;
    p.talents.set("w_blizzard", 1);
    /** Every way the hero can hit the guard: a blow, a skill hit, a Blizzard on it, a bolt at it. */
    const strike = () => {
      room.hitTarget(id, gid, 50, [0, 0], { basic: true });
      room.hitTarget(id, gid, 50, [0, 0], { skill: true });
      p.mana = p.maxMana = 9999; p.sk.last = {};
      room.cast(id, "w_blizzard"); // the AoE field on the hero, the guard inside it
      p.ax = -post.fx; p.ay = -post.fy; p.attackReadyAt = 0;
      room.playerAttack(id); // a basic bolt straight at the guard
    };
    for (const clan of [owner, undefined]) {
      p.clan = clan; stand();
      await wait(1200);
      assert.equal(hits.filter((h) => h === id).length, 0, `${clan ?? "unsworn"}: left alone`);
      assert.ok(!room.targetsAround(g.x, g.y, 300, id).includes(gid), `${clan ?? "unsworn"}: no AoE target`);
      assert.ok(!room.host.enemies(g.x, g.y, 300, id).includes(gid));
      strike();
      await wait(1500);
      assert.equal(g.hp, hp0, `${clan ?? "unsworn"}: blows, Blizzard and bolt deal 0`);
      assert.equal(g.target, "", `${clan ?? "unsworn"}: no fight started`);
      assert.equal(hits.filter((h) => h === id).length, 0, `${clan ?? "unsworn"}: still left alone after striking`);
      clear();
    }
    assert.equal(chat.length, 0, "no Herald note either");
    // sworn to another clan: the same Blizzard hurts (so the 0 above was the stance rule, not a miss) and the troops attack
    p.clan = foe; stand();
    p.sk.last = {}; p.mana = 9999;
    room.cast(id, "w_blizzard");
    assert.ok(await until(() => g.dead || g.hp < hp0, 3000), "an enemy's AoE hurts them");
    assert.ok(await until(() => hits.includes(id), 5000), "an enemy-sworn hero is struck");
    await c.leave();
  } finally { await srv.stop(); }
});

test("war troops (room): a trooper's kill announces no cleared zone; a shock arc skips troopers the hero may not hurt", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(150);
    const room = srv.room as any, id = c.sessionId, p = room.state.players.get(id);
    p.level = 30;
    const gate = patrolOf(LAND.id)!.pts[0];
    p.x = gate.x; p.y = gate.y;
    room.warTroops.tick(Date.now());
    const sent: [string, any][] = [], bc = room.broadcast.bind(room);
    room.broadcast = (t: string, m: any, o?: any) => { sent.push([t, m]); return bc(t, m, o); };
    const [tid, t] = landTroops(room)[0];
    const zoneMob = (): [string, any] => { let r: [string, any] | undefined; room.state.mobs.forEach((m: any, mid: string) => { if (!r && !m.dead && m.zone >= 0 && m.kind !== "trooper") r = [mid, m]; }); return r!; };
    // the last monster of a zone felled by a trooper: no banner
    const [wid, w] = zoneMob(), zone = room.state.zones.get(SPAWN_ZONES[w.zone].name);
    zone.alive = 1;
    room.mobHitsMob(t, tid, w, wid, 1e6);
    assert.ok(w.dead);
    assert.ok(!sent.some(([k]) => k === "zonecleared"), "no zonecleared for a trooper's kill");
    // (the same kill by a hero is announced: the check above is not vacuous)
    const [wid2, w2] = zoneMob(), zone2 = room.state.zones.get(SPAWN_ZONES[w2.zone].name);
    zone2.alive = 1;
    room.mobDied(w2, wid2, id, p.name);
    assert.ok(sent.some(([k]) => k === "zonecleared"), "a hero's is");
    // shock: an unsworn hero's arc never leaps onto a trooper (the only other monster near)
    p.clan = undefined;
    const [wid3, w3] = zoneMob();
    room.state.mobs.forEach((m: any, mid: string) => { if (mid !== wid3 && mid !== tid) room.state.mobs.delete(mid); });
    w3.x = t.x + 20; w3.y = t.y;
    const hp = t.hp;
    sent.length = 0;
    room.shockArc(id, wid3, 500);
    assert.ok(!sent.some(([k]) => k === "arc"), "no arc onto the neutral trooper");
    assert.equal(t.hp, hp);
    p.clan = CLAN_KEYS.find((k) => k !== parseTroop(t.weapon)!.clan && atWar(k, parseTroop(t.weapon)!.clan));
    room.shockArc(id, wid3, 500);
    assert.ok(sent.some(([k]) => k === "arc") && t.hp < hp, "an enemy-sworn hero's arc does leap onto it");
    await c.leave();
  } finally { await srv.stop(); }
});

test("war troops (room): a trooper kill gives no XP or loot, valor is capped; the fallen come back; a new owner replaces them", async () => {
  const srv = await startRoom(), respawn = WAR_TROOPS.respawnMs;
  freshWar();
  try {
    const { room, id, p } = await setup(srv);
    const s = warState()!, owner = s.owner[LAND.id] as ClanKey, foe = CLAN_KEYS.find((k) => k !== owner && atWar(k, owner) && targetsOf(s, k).includes(LAND.id))!; // (kill valor only where the war lets the clan fight)
    p.clan = foe; p.renown = 0;
    p.x = (LAND.x + LAND.w / 2) * TILE; p.y = (LAND.y + LAND.h / 2) * TILE; // inside the land
    const xp0 = p.xp, gold0 = p.gold, lvl0 = p.level;
    const n0 = landTroops(room).length;
    let items0 = 0; room.state.items.forEach(() => items0++);
    let pts = 0;
    for (let i = 0; pts < WAR_TROOPS.killValorPerTick + 2; i++) {
      const [tid, m] = landTroops(room).find(([, x]) => !x.dead)!;
      m.hp = 1;
      pts += parseTroop(m.weapon)!.officer ? WAR_TROOPS.killPts.officer : WAR_TROOPS.killPts.soldier;
      room.hitTarget(id, tid, 10, [0, 0], {});
      assert.ok(m.dead, `kill ${i}`);
    }
    let items = 0; room.state.items.forEach(() => items++);
    assert.equal(p.xp, xp0); assert.equal(p.level, lvl0); assert.equal(p.gold, gold0);
    assert.equal(items, items0, "no loot");
    assert.equal(p.renown, WAR_TROOPS.killValorPerTick, "valor capped per war tick (renown follows it)");
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

test("war troops (room, W2c): any soldier of a clan at war pays kill valor (officer 2), an enemy sworn hero 3 once per war tick; never a party mate; a creature kills in its owner's name", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { room, id, p } = await setup(srv);
    const s = warState()!, owner = s.owner[LAND.id] as ClanKey, foe = CLAN_KEYS.find((k) => k !== owner && atWar(k, owner) && targetsOf(s, k).includes(LAND.id))!; // (kill valor only where the war lets the clan fight)
    p.clan = foe; p.renown = 0;
    p.x = (LAND.x + LAND.w / 2) * TILE; p.y = (LAND.y + LAND.h / 2) * TILE;
    const { _valorOf } = await import("../server/war");
    const v0 = _valorOf(LAND.id, foe);
    // a trooper that is no patrol's (a siege's, an escort's, a manhunter's...): the room pays its kill valor
    const lone = (officer: boolean) => {
      const mid = `test${Math.random()}`;
      room.spawnMob("trooper", -1, mid, { x: p.x + 20, y: p.y, level: 20 });
      const m = room.state.mobs.get(mid); m.weapon = officer ? `${owner}*` : owner;
      room.mobDied(m, mid, id, p.name);
    };
    lone(false);
    assert.equal(p.renown, WAR_TROOPS.killPts.soldier);
    lone(true);
    assert.equal(p.renown, WAR_TROOPS.killPts.soldier + WAR_TROOPS.killPts.officer, "an officer counts double");
    assert.equal(_valorOf(LAND.id, foe) - v0, WAR_TROOPS.killPts.soldier + WAR_TROOPS.killPts.officer, "valor in the land the killer stands in");
    // a hero's creature fells a lone trooper and a patrol guard: valor and renown in its owner's name
    const sid = `pet${Math.random()}`;
    room.spawnMob("skeleton", -1, sid, { x: p.x + 30, y: p.y, level: 20 }); room.state.mobs.get(sid).owner = id;
    const rc = p.renown, mid = `test${Math.random()}`;
    room.spawnMob("trooper", -1, mid, { x: p.x + 20, y: p.y, level: 20 });
    const lm = room.state.mobs.get(mid); lm.weapon = owner;
    room.mobDied(lm, mid, sid, "Skeleton");
    assert.equal(p.renown - rc, WAR_TROOPS.killPts.soldier, "a creature's kill of a lone trooper pays its owner");
    room.warTroops.tick(Date.now());
    const [gid, gm] = guardOf(room);
    const rg = p.renown;
    gm.hp = 0; room.mobDied(gm, gid, sid, "Skeleton");
    assert.ok(p.renown - rg > 0, "and of a patrol guard");
    // an enemy sworn hero
    const c2 = await srv.join({ cls: "wizard" });
    await wait(150);
    const q = room.state.players.get(c2.sessionId);
    q.level = 30; q.clan = owner; q.invulnUntil = 0; q.x = p.x + 10; q.y = p.y;
    const r0 = p.renown;
    room.damagePlayer(c2.sessionId, 1e9, p.name, [0, 0], 0, { from: id });
    assert.ok(q.dead, "the enemy hero fell");
    assert.equal(p.renown - r0, WAR_TROOPS.killPts.hero, "an enemy sworn hero is worth 3");
    // the same victim again in the same war tick: nothing (no farming a friend's respawns)
    q.dead = false; q.hp = q.maxHp; q.invulnUntil = 0;
    room.damagePlayer(c2.sessionId, 1e9, p.name, [0, 0], 0, { from: id });
    assert.ok(q.dead);
    assert.equal(p.renown - r0, WAR_TROOPS.killPts.hero, "once per victim per killer per war tick");
    warState()!.tick++; // the next war tick: they are worth it again
    q.dead = false; q.hp = q.maxHp; q.invulnUntil = 0;
    room.damagePlayer(c2.sessionId, 1e9, p.name, [0, 0], 0, { from: id });
    assert.equal(p.renown - r0, 2 * WAR_TROOPS.killPts.hero, "a new war tick, a new payout");
    // a party mate: nothing (no farming with alts)
    q.dead = false; q.hp = q.maxHp; q.invulnUntil = 0; p.party = q.party = "pt-test";
    const r1 = p.renown;
    room.damagePlayer(c2.sessionId, 1e9, p.name, [0, 0], 0, { from: id });
    assert.ok(q.dead);
    assert.equal(p.renown, r1, "a party mate pays nothing");
    await c2.leave();
  } finally { await srv.stop(); }
});

test("war troops (room, W3): the guards follow the Hold's tier: 3 at an outpost, 6 at a camp, 8 at a fortress (Control 100), at that tier's posts", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { room } = await setup(srv);
    const guards = () => landTroops(room).filter(([id]) => room.warTroops._land(LAND.id).slots.some((s: any) => s.id === id && s.role === "guard"));
    for (const [fort, tier] of [[0, 0], [0.3, 1], [0.7, 2], [0.1, 0]] as const) {
      warState()!.fort[LAND.id] = fort;
      room.warTroops.tick(Date.now());
      const want = Math.min(garrisonCount(100, tier), garrisonSpots(LAND.id, TROOP.garrison[tier][1], tier).length);
      assert.equal(want, [3, 6, 8][tier], `tier ${tier}: the land has room for its guards`);
      assert.equal(guards().length, want, `tier ${tier}: ${guards().length} guards`);
      assert.equal(holdIntel(warNow()!, LAND.id).guards, want, "the map's count matches");
      assert.equal(holdIntel(warNow()!, LAND.id).tier, tier);
      assert.equal(room.warTroops.guardsDue(LAND.id), want, "a sack must cut through them all");
    }
    // at a fortress the guards walk out to the fortress's posts: outside its walls, inside its sack reach
    warState()!.fort[LAND.id] = 0.7;
    const posts = garrisonSpots(LAND.id, 8, 2);
    for (const p of posts) assert.ok(!tierWallAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE), 2).wall && inSackReach(LAND.id, p.x, p.y, 2));
    const ok = await until(() => { room.warTroops.tick(Date.now()); return guards().length === 8 && guards().every(([, m]) => posts.some((q) => Math.hypot(q.x - m.x, q.y - m.y) < 6)); }, 15000);
    assert.ok(ok, `every guard at a fortress post: ${JSON.stringify(guards().map(([, m]) => [Math.round(m.x), Math.round(m.y), m.target]))} posts ${JSON.stringify(posts.map((q) => [Math.round(q.x), Math.round(q.y)]))}`);
  } finally { await srv.stop(); }
});
