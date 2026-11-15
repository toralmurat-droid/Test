import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, until, wait } from "./helpers/room";
import { TILE, WORLD_H } from "../shared/constants";
import { SAFE_ZONE } from "../shared/map";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { patrolOf } from "../shared/war/patrols";
import { newWar, targetsOf } from "../shared/war/rules";
import { SIEGE_BATTLE, siegeForce, siegeFronts } from "../shared/war/siege";
import { TERRITORIES } from "../shared/war/territories";
import { parseTroop, WAR_TROOPS } from "../shared/war/troops";
import { _resetWar, _valorOf, warState } from "../server/war";

/** An Act 1 land away from Oakvale with two standards and a rival next door that may attack it. */
const PICK = (() => {
  const s = newWar();
  for (const t of TERRITORIES) {
    if (t.act !== 1 || t.capitalOf || !patrolOf(t.id) || siegeFronts(t.id).length < 3) continue;
    if (Math.hypot(t.cx - (SAFE_ZONE.x + SAFE_ZONE.w / 2), t.cy - (SAFE_ZONE.y + SAFE_ZONE.h / 2)) < 60) continue;
    const atk = CLAN_KEYS.find((k) => k !== s.owner[t.id] && targetsOf(s, k).includes(t.id));
    if (atk) return { land: t, atk, def: s.owner[t.id] };
  }
  throw new Error("no land to besiege");
})();
const LAND = PICK.land, ATK: ClanKey = PICK.atk, DEF: ClanKey = PICK.def;
const FRONTS = siegeFronts(LAND.id), GATE = FRONTS.find((f) => f.gate)!;

/** A war with LAND under siege by ATK (and no war tick for a long while). */
function siegeWar() {
  const state = newWar();
  state.siege[LAND.id] = { by: ATK, at: state.tick + 6 };
  state.control[LAND.id] = 20;
  _resetWar({ v: 1, state, minds: newMinds(), next: Date.now() + 1e9, log: [] });
}
const saved = { ...SIEGE_BATTLE }, savedTroops = { ...WAR_TROOPS };
const restore = () => { Object.assign(SIEGE_BATTLE, saved); Object.assign(WAR_TROOPS, savedTroops); };

async function setup(srv: Awaited<ReturnType<typeof startRoom>>, clan?: ClanKey) {
  const c = await srv.join({ cls: "wizard" });
  await wait(150);
  const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
  p.level = 30; p.hp = p.maxHp = 1_000_000; p.invulnUntil = 0; p.clan = clan; p.renown = 0;
  const sent: [string, any][] = [], bc = room.broadcast.bind(room);
  room.broadcast = (t: string, m: any, o?: any) => { sent.push([t, m]); return bc(t, m, o); };
  const at = (pt: { x: number; y: number }) => { p.x = pt.x; p.y = pt.y; };
  const wild = () => room.state.mobs.forEach((m: any, mid: string) => { if (m.kind !== "trooper") room.state.mobs.delete(mid); });
  const side = (s: "atk" | "def") => room.sieges._troops(LAND.id, s).map((tid: string) => [tid, room.state.mobs.get(tid)] as [string, any]);
  return { c, room, id, p, sent, at, wild, side };
}

test("sieges (room): a hero near a besieged land fields both sides at its fronts; they fight each other; no hero, no troops", async () => {
  const srv = await startRoom();
  siegeWar();
  try {
    const { room, p, at, wild, side, sent } = await setup(srv, ATK);
    p.y = (WORLD_H + 20) * TILE; // underground: nothing wakes
    room.sieges.tick(Date.now());
    assert.equal(room.sieges.count, 0, "no hero near: nothing spawns");
    assert.ok(!room.sieges._siege(LAND.id)?.live, "and the siege stays virtual");
    at(GATE);
    room.sieges.tick(Date.now());
    wild();
    const s = room.sieges._siege(LAND.id), f = siegeForce(FRONTS.length, 20, Math.min(SIEGE_BATTLE.maxSiegeTroops, WAR_TROOPS.maxTroops - room.caravans.count));
    assert.ok(s?.live, "a hero near: the siege goes live");
    const atk = side("atk"), def = side("def");
    assert.equal(atk.length, f.atk * FRONTS.length);
    assert.equal(def.length, f.def * FRONTS.length);
    assert.ok(f.def >= SIEGE_BATTLE.defMin && f.atk === SIEGE_BATTLE.perFront);
    assert.ok(atk.every(([, m]) => m.kind === "trooper" && parseTroop(m.weapon)?.clan === ATK), "attackers of the besieging clan");
    assert.ok(def.every(([, m]) => parseTroop(m.weapon)?.clan === DEF), "defenders of the holder");
    assert.ok(atk.every(([, m]) => Math.hypot(m.x - s.approach.x, m.y - s.approach.y) < 2), "attackers come in at the approach");
    assert.ok(sent.some(([t, m]) => t === "siege" && m.t === LAND.id && m.fronts.length === FRONTS.length && m.fronts.every((x: any) => x.holder === DEF)), "the clients hear of it");
    // an unsworn hero watches: the two sides go for each other
    p.clan = undefined;
    const [, a] = atk[0], [, d] = def[0];
    a.x = d.x + 30; a.y = d.y;
    const ids = new Set(def.map(([tid]) => tid)), hp0 = new Map(def.map(([tid, m]) => [tid, m.hp]));
    assert.ok(await until(() => ids.has(a.target) || def.some(([tid, m]) => m.hp < hp0.get(tid)!)), "attackers fight defenders");
    assert.ok(await until(() => def.some(([tid, m]) => m.hp < hp0.get(tid)! || m.dead)), "and blows land");
  } finally { restore(); await srv.stop(); }
});

test("sieges (room): siege troopers share the troop budget after the caravans (total never over maxTroops)", async () => {
  const srv = await startRoom();
  siegeWar();
  try {
    const { room, at } = await setup(srv, ATK);
    WAR_TROOPS.maxTroops = 30;
    Object.defineProperty(room.caravans, "count", { get: () => 12, configurable: true }); // carts and escorts on a road nearby
    at(GATE);
    for (let i = 0; i < 3; i++) { room.sieges.tick(Date.now()); room.warTroops.tick(Date.now()); await wait(50); }
    assert.ok(room.sieges.count > 0, "the siege still gets troops");
    assert.ok(room.sieges.count <= Math.min(SIEGE_BATTLE.maxSiegeTroops, 30 - 12), `siege share ${room.sieges.count}`);
    assert.ok(12 + room.sieges.count + room.warTroops.count <= 30, `total ${12 + room.sieges.count + room.warTroops.count}`);
    SIEGE_BATTLE.maxSiegeTroops = 6;
    room.sieges.tick(Date.now());
    assert.ok(room.sieges.count <= 6, "maxSiegeTroops trims the force");
  } finally { restore(); await srv.stop(); }
});

test("sieges (room): a sworn hero holding a front earns valor once a minute (gate x2), capped per war tick; troops alone earn nothing; a front changes hands only after captureMs", async () => {
  const srv = await startRoom();
  siegeWar();
  try {
    SIEGE_BATTLE.reinforceMs = 1e9;
    const { room, p, at, wild, sent } = await setup(srv, DEF);
    const std = FRONTS.find((f) => !f.gate)!, off = { x: (std.x + GATE.x) / 2, y: (std.y + GATE.y) / 2 };
    // the hero stands away from every front: the defenders hold them all, but troops alone pay nothing
    at(off);
    let T = Date.now() + 1_000_000;
    p.lastAct = T;
    room.sieges.tick(T);
    wild();
    const s = room.sieges._siege(LAND.id);
    assert.ok(s?.live);
    const far = FRONTS.every((f) => Math.hypot(f.x - p.x, f.y - p.y) > SIEGE_BATTLE.frontRadiusPx);
    s.nextScore = T; s.nextPay = T + SIEGE_BATTLE.valorEveryMs;
    for (const end = s.nextPay; T <= end; T += SIEGE_BATTLE.scoreMs) { p.lastAct = T; room.sieges.tick(T); }
    assert.ok(far, "the hero stands outside every front's ring");
    assert.equal(_valorOf(LAND.id, DEF), 0, "no hero in a ring: no valor");
    // at the gate: 2 x frontValor a minute up to the cap
    at(GATE);
    const v0 = _valorOf(LAND.id, DEF);
    const minute = () => { const end = s.nextPay; for (; T <= end; T += SIEGE_BATTLE.scoreMs) { p.lastAct = T; room.state.mobs.forEach((m: any, mid: string) => { if (parseTroop(m.weapon)?.clan === ATK) room.state.mobs.delete(mid); }); room.sieges.tick(T); } };
    minute();
    assert.equal(_valorOf(LAND.id, DEF) - v0, SIEGE_BATTLE.frontValor * SIEGE_BATTLE.gateMult, "the gate pays double");
    for (let i = 0; i < 8; i++) minute();
    assert.equal(_valorOf(LAND.id, DEF), SIEGE_BATTLE.battleValorPerTick, "capped per war tick");
    // the attackers' hero alone at the gate, no defenders there: it falls only after captureMs of lead
    p.clan = ATK;
    const strip = () => room.state.mobs.forEach((m: any, mid: string) => { if (m.kind === "trooper" && parseTroop(m.weapon)?.clan !== ATK) room.state.mobs.delete(mid); });
    const gi = FRONTS.indexOf(GATE), t0 = T;
    let fell = 0;
    for (; T < t0 + SIEGE_BATTLE.captureMs + 4 * SIEGE_BATTLE.scoreMs && !fell; T += SIEGE_BATTLE.scoreMs) {
      p.lastAct = T; strip(); room.sieges.tick(T);
      if (s.fronts[gi].holder === "atk") fell = T;
    }
    assert.ok(fell, "the gate fell");
    assert.ok(fell - t0 >= SIEGE_BATTLE.captureMs, "not before captureMs");
    assert.ok(sent.some(([t, m]) => t === "sfx" && m.ev === "siege_front" && m.clan === ATK), "the horn sounds");
    assert.ok(sent.some(([t, m]) => t === "chat" && m.name === "Herald" && /gate of/.test(m.text)), "the Herald tells of the gate");
    assert.ok(sent.some(([t, m]) => t === "siege" && m.fronts[gi]?.holder === ATK), "the clients see the new holder");
  } finally { restore(); await srv.stop(); }
});

test("sieges (room): the siege's end, or the land changing hands, clears its troopers", async () => {
  const srv = await startRoom();
  siegeWar();
  try {
    const { room, at, sent } = await setup(srv, ATK);
    at(GATE);
    room.sieges.tick(Date.now());
    assert.ok(room.sieges.count > 0);
    const ids = room.sieges._troops(LAND.id);
    warState()!.siege[LAND.id] = null;
    room.sieges.tick(Date.now());
    assert.equal(room.sieges.count, 0, "siege over: troopers gone");
    assert.ok(ids.every((id: string) => !room.state.mobs.has(id)));
    assert.equal(room.sieges._siege(LAND.id), undefined);
    assert.ok(sent.some(([t, m]) => t === "siege" && m.t === -1), "the clients drop the fronts");
    // again, and this time the land falls to the attackers
    warState()!.siege[LAND.id] = { by: ATK, at: 99 };
    room.sieges.tick(Date.now());
    assert.ok(room.sieges.count > 0);
    warState()!.owner[LAND.id] = ATK;
    room.sieges.tick(Date.now());
    assert.equal(room.sieges.count, 0, "land flipped: troopers gone");
  } finally { restore(); await srv.stop(); }
});

test("sieges (room): only enemy-sworn heroes hurt siege troopers (no XP); unsworn heroes are left alone", async () => {
  const srv = await startRoom();
  siegeWar();
  try {
    const { room, id, p, at, wild, side } = await setup(srv);
    at(GATE);
    room.sieges.tick(Date.now());
    wild();
    const [did, d] = side("def")[0];
    const hp0 = d.hp, xp0 = p.xp;
    for (const clan of [undefined, DEF]) {
      p.clan = clan; p.x = d.x + 20; p.y = d.y;
      room.hitTarget(id, did, 500, [0, 0], { basic: true });
      room.hitTarget(id, did, 500, [0, 0], { skill: true });
      assert.equal(d.hp, hp0, `${clan ?? "unsworn"}: 0 damage`);
    }
    // an unsworn hero next to them is ignored
    p.clan = undefined;
    await wait(1200);
    assert.ok(side("def").every(([, m]) => m.target !== id) && side("atk").every(([, m]) => m.target !== id), "nobody goes for the unsworn hero");
    p.clan = ATK;
    room.hitTarget(id, did, 50, [0, 0], {});
    assert.ok(d.hp < hp0, "an attacker-sworn hero hurts a defender");
    d.hp = 1;
    room.hitTarget(id, did, 50, [0, 0], {});
    assert.ok(d.dead);
    assert.equal(p.xp, xp0, "no XP for a siege trooper");
  } finally { restore(); await srv.stop(); }
});
