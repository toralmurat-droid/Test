import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, until, wait } from "./helpers/room";
import { BOARDS } from "../shared/bounty";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { atWar } from "../shared/war/feuds";
import { newMinds } from "../shared/war/doctrine";
import { garrisonSpots, patrolOf, TROOP } from "../shared/war/patrols";
import { newWar } from "../shared/war/rules";
import { STANDARD, STANDARDS } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { WAR_TROOPS } from "../shared/war/troops";
import { cleanWrit, writDay, writOffers, writPay, WRIT, type WritKind, type WritState } from "../shared/war/writs";
import { SAFE_ZONE } from "../shared/map";
import { _resetWar, step, warState } from "../server/war";
import { SWEAR_FIRST } from "../server/warWrits";

/** An Act 1 land with a patrol, guard posts and a standard, away from Oakvale. */
const LAND = TERRITORIES.find((t) => patrolOf(t.id) && garrisonSpots(t.id, TROOP.garrisonMax).length >= 4 && t.act === 1 && !t.capitalOf
  && STANDARDS.some((s) => s.t === t.id) && Math.hypot(t.cx - (SAFE_ZONE.x + SAFE_ZONE.w / 2), t.cy - (SAFE_ZONE.y + SAFE_ZONE.h / 2)) > 60)!;
const freshWar = (next = Date.now() + 1e9) => { const state = newWar(); _resetWar({ v: 1, state, minds: newMinds(), next, log: [] }); return state; };
const SQUARE = BOARDS[0];
/** A clan and level with offers on the Market Square board (Act 1). */
function swornWithOffers(): { clan: ClanKey; level: number } {
  const s = newWar();
  for (const level of [12, 10, 15, 8, 20]) for (const clan of CLAN_KEYS) if (writOffers(s, clan, level, 1, 0).length >= 2) return { clan, level };
  throw new Error("no offers anywhere");
}
const writOf = (kind: WritKind, clan: ClanKey, holder: ClanKey, goal: number, minLevel = 0): WritState =>
  ({ kind, t: LAND.id, land: LAND.name, goal, clan, holder, minLevel, gold: 1, renown: 1, n: 0 });

async function setup(srv: Awaited<ReturnType<typeof startRoom>>) {
  const c = await srv.join({ cls: "wizard" });
  const got: any[] = [], chat: string[] = [];
  c.onMessage("writ", (m: any) => got.push(m));
  c.onMessage("chat", (m: any) => chat.push(m.text));
  await wait(200);
  const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
  p.hp = p.maxHp = 100_000; p.invulnUntil = 0;
  const valor: [number, string, number][] = [];
  const add = room.writs.h.addValor;
  room.writs.h.addValor = (t: number, k: string, v: number) => { valor.push([t, k, v]); return add(t, k, v); };
  return { c, room, id, p, got, chat, valor };
}

test("war writs (room): taken only at a board and sworn; bad payloads ignored; the join sends the state", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { c, room, id, p, got } = await setup(srv);
    assert.ok(got.some((m) => m.active === null && m.left === WRIT.perDay), "join: no writ, the day's count");
    const { clan, level } = swornWithOffers();
    p.level = level;
    // away from any board: no offers, take refused
    p.x = SQUARE.x + 400; p.y = SQUARE.y;
    room.writs.msg(id, { take: 0 }); await wait(100);
    assert.equal(p.writ, undefined); assert.ok(got.at(-1).err);
    // at the board, unsworn
    p.x = SQUARE.x; p.y = SQUARE.y;
    room.writs.msg(id, {}); await wait(100);
    assert.equal(got.at(-1).note, SWEAR_FIRST); assert.deepEqual(got.at(-1).offers, []);
    room.writs.msg(id, { take: 0 }); await wait(100);
    assert.equal(p.writ, undefined); assert.equal(got.at(-1).err, SWEAR_FIRST);
    // sworn but under the oath level
    p.clan = clan; p.level = STANDARD.minLevel - 1;
    room.writs.msg(id, { take: 0 }); await wait(100);
    assert.equal(p.writ, undefined);
    p.level = level;
    const n = got.length;
    for (const bad of [5, "x", [], { take: 3 }, { take: -1 }, { take: 0.5 }, { take: "0" }, { drop: 1 }, { take: 0, drop: true }, { take: 0, x: 1 }]) room.writs.msg(id, bad);
    await wait(150);
    assert.equal(got.length, n, "garbage gets no answer"); assert.equal(p.writ, undefined, "and changes nothing");
    // through the room's handler (rate limited, validated)
    c.send("writ", {}); await wait(150);
    const offers = got.at(-1).offers;
    assert.ok(offers.length >= 2, "offers at the board");
    assert.equal(got.at(-1).board, SQUARE.id);
    c.send("writ", { take: 1 }); await wait(150);
    assert.deepEqual(p.writ, { ...offers[1], n: 0 }, "the second offer taken");
    assert.deepEqual(got.at(-1).active, p.writ);
    c.send("writ", { take: 0 }); await wait(150);
    assert.deepEqual(p.writ, { ...offers[1], n: 0 }, "one writ at a time");
    assert.ok(got.at(-1).err);
    assert.equal(p.bounty, undefined, "a writ is no bounty");
    room.writs.msg(id, { drop: true }); await wait(100);
    assert.equal(p.writ, undefined); assert.equal(got.at(-1).active, null);
    room.writs.msg(id, {}); await wait(100);
    assert.deepEqual(got.at(-1).offers, offers, "dropping does not reroll the offers");
    await c.leave();
  } finally { await srv.stop(); }
});

test("war writs (room): rout counts rival troopers killed by the hero standing in the land; pays gold, renown, valor", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { c, room, id, p, got, valor } = await setup(srv);
    const owner = warState()!.owner[LAND.id] as ClanKey, foe = CLAN_KEYS.find((k) => k !== owner && atWar(k, owner))!; // (at war with the holder: shared/war/feuds.ts)
    p.level = 30; p.clan = foe;
    const gate = patrolOf(LAND.id)!.pts[0];
    p.x = gate.x; p.y = gate.y;
    room.warTroops.tick(Date.now());
    room.state.mobs.forEach((m: any, mid: string) => { if (m.kind !== "trooper") room.state.mobs.delete(mid); });
    const troopers = (room.warTroops._land(LAND.id)?.slots ?? []).map((s: any) => s.id).filter((s: string) => s && room.state.mobs.has(s));
    assert.ok(troopers.length >= 3, "troops out");
    p.writ = writOf("rout", foe, owner, 2);
    const gold0 = p.gold, renown0 = p.renown;
    const pay = writPay(warState()!, foe, LAND.id);
    // a kill from outside the land does not count
    p.x = (LAND.x - 3) * 32; p.y = gate.y;
    room.mobDied(room.state.mobs.get(troopers[0]), troopers[0], id, p.name);
    assert.equal(p.writ.n, 0, "the killer must stand in the land");
    p.x = gate.x; p.y = gate.y;
    room.hitTarget(id, troopers[1], 1e7, [0, 0], { basic: true });
    assert.ok(await until(() => p.writ?.n === 1 || !p.writ));
    assert.equal(p.writ.n, 1);
    // past the per-tick kill valor cap still counts for the writ
    room.warTroops.valor.set(p.name, { tick: warState()!.tick, n: WAR_TROOPS.killValorPerTick });
    const renown1 = p.renown; // (the kill itself earns no renown now: the cap is reached)
    room.hitTarget(id, troopers[2], 1e7, [0, 0], { basic: true });
    assert.ok(await until(() => !p.writ), "done");
    assert.equal(p.gold - gold0, pay.gold, "gold");
    assert.equal(p.renown - renown1, pay.renown, "renown");
    assert.ok(p.renown - renown0 >= pay.renown);
    assert.deepEqual(valor.at(-1), [LAND.id, foe, WRIT.valor], "valor for the clan in the land");
    assert.ok(await until(() => !!got.at(-1)?.done));
    assert.equal(got.at(-1).done.gold, pay.gold); assert.equal(got.at(-1).left, WRIT.perDay - 1);
    assert.equal(p.writN, 1); assert.equal(p.writDay, writDay(Date.now()));
    await c.leave();
  } finally { await srv.stop(); }
});

test("war writs (room): an old hold writ (no longer offered since W2c) still loads and counts full minutes at a standard of the land", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { c, room, id, p } = await setup(srv);
    const owner = warState()!.owner[LAND.id] as ClanKey;
    p.level = 30; p.clan = owner;
    const std = STANDARDS.find((s) => s.t === LAND.id)!;
    p.writ = cleanWrit(JSON.parse(JSON.stringify(writOf("hold", owner, owner, 2))), owner); // (as a save brings it back)
    assert.equal(p.writ?.kind, "hold", "a saved hold writ still loads");
    p.x = std.x; p.y = std.y; p.lastAct = 0; // (the standards' idle check is retired: they pay nothing now)
    room.warPresence.secs.set(id, { std: std.id, n: 58 }); // the room's tick (once a second) finishes the minute
    assert.ok(await until(() => p.writ?.n === 1, 4000), "a minute at the standard");
    const other = STANDARDS.find((s) => s.t !== LAND.id)!;
    room.writs.standardMinute(id, other.t);
    assert.equal(p.writ.n, 1, "another land's standard does not count");
    room.writs.standardMinute(id, LAND.id);
    assert.equal(p.writ, undefined, "done");
    assert.equal(p.writN, 1);
    await c.leave();
  } finally { await srv.stop(); }
});

test("war writs (room): clear counts wild monsters of the level inside the land; not tide, quest waves, low or outside", async () => {
  const srv = await startRoom(), live = WAR_TROOPS.live;
  freshWar();
  WAR_TROOPS.live = false;
  try {
    const { c, room, id, p } = await setup(srv);
    const owner = warState()!.owner[LAND.id] as ClanKey;
    p.level = 30; p.clan = owner;
    room.state.mobs.forEach((_m: any, mid: string) => room.state.mobs.delete(mid));
    p.writ = writOf("clear", owner, owner, 2, LAND.levels[0]);
    const at = patrolOf(LAND.id)!.pts[0];
    p.x = at.x; p.y = at.y;
    let seq = 0;
    const kill = (level: number, x = at.x, y = at.y, tweak: (m: any) => void = () => {}) => {
      const mid = `wtest${++seq}`;
      room.spawnMob("slime", -1, mid, { x, y, level });
      const m = room.state.mobs.get(mid); tweak(m);
      room.hitTarget(id, mid, 1e7, [0, 0], { basic: true });
      return m;
    };
    kill(LAND.levels[0] - 1);
    kill(LAND.levels[0], at.x, at.y, (m) => { m.tide = true; });
    kill(LAND.levels[0], at.x, at.y, (m) => { m.qwave = true; });
    kill(LAND.levels[0], (LAND.x - 4) * 32, at.y);
    await wait(100);
    assert.equal(p.writ.n, 0, "none of those count");
    kill(LAND.levels[0]);
    assert.ok(await until(() => p.writ?.n === 1));
    kill(LAND.levels[1]);
    assert.ok(await until(() => !p.writ), "done");
    await c.leave();
  } finally { WAR_TROOPS.live = live; await srv.stop(); }
});

test("war writs (room): daily limit; withdrawal on a flip and on a new oath (no pay, not counted)", async () => {
  const srv = await startRoom();
  const state = freshWar();
  try {
    const { c, room, id, p, got, chat } = await setup(srv);
    const { clan, level } = swornWithOffers();
    p.level = level; p.clan = clan; p.x = SQUARE.x; p.y = SQUARE.y;
    p.writDay = writDay(Date.now()); p.writN = WRIT.perDay;
    room.writs.msg(id, { take: 0 }); await wait(100);
    assert.equal(p.writ, undefined, "the day's writs are done"); assert.equal(got.at(-1).left, 0); assert.deepEqual(got.at(-1).offers, []);
    p.writDay = writDay(Date.now()) - 1; // yesterday's count does not hold
    room.writs.msg(id, {}); await wait(100);
    assert.equal(got.at(-1).left, WRIT.perDay); assert.ok(got.at(-1).offers.length);
    p.writN = 0; p.writDay = 0;
    // a flip on a war tick withdraws it
    const owner = state.owner[LAND.id], other = CLAN_KEYS.find((k) => k !== owner && k !== clan)!;
    p.writ = writOf("clear", clan, owner, 5);
    const gold0 = p.gold;
    state.owner[LAND.id] = other;
    _resetWar({ v: 1, state, minds: newMinds(), next: Date.now() - 1000, log: [] });
    await step(Date.now());
    assert.ok(await until(() => !p.writ), "withdrawn on the flip");
    assert.ok(await until(() => chat.some((t) => t.includes("withdrawn") && t.includes(LAND.name))), "the Herald says so");
    assert.equal(p.gold, gold0, "no pay"); assert.equal(p.writN, 0, "not counted");
    // a new oath withdraws it
    p.writ = writOf("hold", clan, state.owner[LAND.id], 5);
    p.clanAt = 0;
    const next = CLAN_KEYS.find((k) => k !== clan)!;
    c.send("clan", { swear: next });
    assert.ok(await until(() => p.clan === next && !p.writ), "withdrawn on the new oath");
    // a writ whose land changed hands while away is withdrawn on join
    p.writ = writOf("hold", next, CLAN_KEYS.find((k) => k !== state.owner[LAND.id])!, 5);
    room.writs.join(id);
    assert.equal(p.writ, undefined);
    await c.leave();
  } finally { await srv.stop(); }
});

test("war writs (room): save and load round trip; old and broken saves load with no writ", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { c, room, p } = await setup(srv);
    p.clan = "redfang"; p.level = 20;
    const old = room.snapshot(p);
    assert.equal(old.writ, undefined); assert.equal(old.writN, undefined, "no writ fields when there is nothing to save");
    p.writ = writOf("rout", "redfang", "wardens", 7); p.writ.n = 3;
    p.writDay = writDay(Date.now()); p.writN = 2;
    const save = structuredClone(room.snapshot(p));
    assert.deepEqual(save.writ, p.writ);
    p.writ = undefined; p.writN = 0; p.writDay = 0;
    room.restore(p, structuredClone(save));
    assert.deepEqual(p.writ, { ...writOf("rout", "redfang", "wardens", 7), n: 3 });
    assert.equal(p.writN, 2); assert.equal(p.writDay, writDay(Date.now()));
    room.restore(p, structuredClone(old));
    assert.equal(p.writ, undefined, "an old save: no writ"); assert.equal(p.writN, 0);
    for (const bad of [{ ...save, writ: { kind: "loot" } }, { ...save, writ: "x", writN: "y" }, { ...save, writ: { ...save.writ, land: "Nowhere" } }, { ...save, clan: "wardens" }]) {
      room.restore(p, structuredClone(bad));
      assert.equal(p.writ, undefined, JSON.stringify(bad.writ));
    }
    await c.leave();
  } finally { await srv.stop(); }
});
