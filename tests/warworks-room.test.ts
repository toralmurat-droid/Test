import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, wait } from "./helpers/room";
import { SAFE_ZONE } from "../shared/map";
import { TILE } from "../shared/constants";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { patrolOf } from "../shared/war/patrols";
import { newWar, targetsOf } from "../shared/war/rules";
import { SIEGE_BATTLE, siegeFronts } from "../shared/war/siege";
import { TERRITORIES } from "../shared/war/territories";
import { parseTroop, troopLevel, WAR_TROOPS } from "../shared/war/troops";
import { ramHp, SIEGE_WORKS } from "../shared/war/works";
import { _resetWar, _valorOf, warState } from "../server/war";

const HOST: ClanKey = "host";
/** An Act 1 land away from Oakvale with two standards that the Host may attack. */
const PICK = (() => {
  const s = newWar();
  for (const t of TERRITORIES) {
    if (t.act !== 1 || t.capitalOf || !patrolOf(t.id) || siegeFronts(t.id).length < 3 || s.owner[t.id] === HOST) continue;
    if (Math.hypot(t.cx - (SAFE_ZONE.x + SAFE_ZONE.w / 2), t.cy - (SAFE_ZONE.y + SAFE_ZONE.h / 2)) < 60) continue;
    if (targetsOf(s, HOST).includes(t.id)) return { land: t, def: s.owner[t.id] };
  }
  throw new Error("no land for the Host to besiege");
})();
const LAND = PICK.land, DEF: ClanKey = PICK.def, THIRD: ClanKey = CLAN_KEYS.find((k) => k !== HOST && k !== DEF)!;
const FRONTS = siegeFronts(LAND.id), GATE = FRONTS.find((f) => f.gate)!;

/** A spot in LAND (px) outside every front's ring, nearest halfway between a standard and the gate. */
function offRings() {
  const std = FRONTS.find((f) => !f.gate)!, mid = { x: (std.x + GATE.x) / 2, y: (std.y + GATE.y) / 2 }, out: { x: number; y: number }[] = [];
  for (let ty = LAND.y; ty < LAND.y + LAND.h; ty++) for (let tx = LAND.x; tx < LAND.x + LAND.w; tx++) {
    const q = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
    if (FRONTS.every((f) => Math.hypot(f.x - q.x, f.y - q.y) > SIEGE_BATTLE.frontRadiusPx + TILE)) out.push(q);
  }
  return out.sort((a, b) => Math.hypot(a.x - mid.x, a.y - mid.y) - Math.hypot(b.x - mid.x, b.y - mid.y))[0];
}

function siegeWar(by: ClanKey = HOST) {
  const state = newWar();
  state.siege[LAND.id] = { by, at: state.tick + 6 };
  state.control[LAND.id] = 20;
  _resetWar({ v: 1, state, minds: newMinds(), next: Date.now() + 1e9, log: [] });
}
const saved = { ...SIEGE_BATTLE }, savedTroops = { ...WAR_TROOPS }, savedWorks = { ...SIEGE_WORKS };
const restore = () => { Object.assign(SIEGE_BATTLE, saved); Object.assign(WAR_TROOPS, savedTroops); Object.assign(SIEGE_WORKS, savedWorks); };

async function setup(srv: Awaited<ReturnType<typeof startRoom>>, clan?: ClanKey) {
  const c = await srv.join({ cls: "wizard" });
  await wait(150);
  const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
  p.level = 30; p.hp = p.maxHp = 1_000_000; p.invulnUntil = 0; p.clan = clan; p.renown = 0;
  const sent: [string, any][] = [], bc = room.broadcast.bind(room);
  room.broadcast = (t: string, m: any, o?: any) => { sent.push([t, m]); return bc(t, m, o); };
  const at = (pt: { x: number; y: number }) => { p.x = pt.x; p.y = pt.y; };
  const ram = () => room.sieges._works._ram(LAND.id);
  const ramMob = () => { const r = ram(); return r?.id ? room.state.mobs.get(r.id) : undefined; };
  /** Every trooper but the ram (and its crew if `crew` is false) goes. */
  const strip = (keepCrew = false) => room.state.mobs.forEach((m: any, mid: string) => {
    const k = parseTroop(m.weapon);
    if (m.kind !== "trooper") { room.state.mobs.delete(mid); return; }
    if (k?.part === "ram" || (keepCrew && room.sieges._works.owns(mid))) return;
    room.state.mobs.delete(mid);
  });
  return { c, room, id, p, sent, at, ram, ramMob, strip };
}

test("works (room): only a Host-led siege brings a bone ram, at the approach, with its crew and the view", async () => {
  const srv = await startRoom();
  try {
    siegeWar(THIRD);
    const { room, at, ram, sent } = await setup(srv, HOST);
    at(GATE);
    room.sieges.tick(Date.now());
    assert.ok(room.sieges._siege(LAND.id)?.live, "the siege is live");
    assert.equal(ram(), undefined, "another clan's siege: no ram");
    let rams = 0;
    room.state.mobs.forEach((m: any) => { if (parseTroop(m.weapon)?.part === "ram") rams++; });
    assert.equal(rams, 0);
    // the Host besieges it now
    warState()!.siege[LAND.id] = { by: HOST, at: warState()!.tick + 6 };
    room.sieges.tick(Date.now());
    room.sieges.tick(Date.now());
    const r = ram(), m = room.state.mobs.get(r.id), s = room.sieges._siege(LAND.id), level = troopLevel(LAND.id);
    assert.ok(m && !m.dead, "a ram rolls");
    assert.equal(m.weapon, "host#");
    assert.deepEqual(parseTroop(m.weapon), { clan: HOST, part: "ram", officer: false, cart: false, object: true });
    assert.equal(m.maxHp, ramHp(HOST, level));
    assert.ok(Math.hypot(m.x - s.approach.x, m.y - s.approach.y) < SIEGE_WORKS.daySpeed, "it starts at the approach");
    const crew = r.crew.filter(Boolean).map((cid: string) => room.state.mobs.get(cid));
    assert.equal(crew.length, SIEGE_WORKS.crew);
    assert.ok(crew.every((x: any) => x.weapon === "host"), "plain Host soldiers");
    assert.ok(sent.some(([t, v]) => t === "siege" && v.t === LAND.id && v.ram && v.ram.maxHp === m.maxHp), "the clients hear of it");
    // it rolls toward the gate when nobody stands in its way, and stops near a defender
    for (const cid of r.crew) room.state.mobs.delete(cid);
    room.state.mobs.forEach((x: any, mid: string) => { if (x.kind === "trooper" && mid !== r.id) room.state.mobs.delete(mid); });
    room.sieges.tick(Date.now());
    const d0 = r.d, now = Date.now();
    r.held = false; r.nextHeld = now + 1e9;
    room.sieges.step(m, r.id, 0.5, now);
    assert.notEqual(r.d, d0, "rolls");
    r.nextHeld = 0;
    const [, foe] = [...room.state.mobs.entries()].find(([, x]: [string, any]) => parseTroop(x.weapon)?.clan === DEF) ?? [];
    let blocker = foe;
    if (!blocker) { room.sieges._siege(LAND.id).nextWave = 0; room.sieges.tick(Date.now()); blocker = [...room.state.mobs.values()].find((x: any) => parseTroop(x.weapon)?.clan === DEF); }
    room.state.mobs.forEach((x: any, mid: string) => { if (x.kind === "trooper" && x !== blocker && mid !== r.id) room.state.mobs.delete(mid); });
    if (r.arrived) return; // (a very short loop: it is already at the gate)
    blocker.x = m.x + SIEGE_WORKS.blockPx / 2; blocker.y = m.y; blocker.homeX = blocker.x; blocker.homeY = blocker.y; blocker.stunUntil = Date.now() + 1e6;
    const d1 = r.d, t1 = Date.now();
    room.sieges.step(m, r.id, 0.5, t1);
    assert.equal(r.held, true, "held by a defender");
    assert.equal(r.d, d1, "and still");
  } finally { restore(); await srv.stop(); }
});

test("works (room): only rival-sworn heroes hurt the ram (no XP)", async () => {
  const srv = await startRoom();
  siegeWar();
  try {
    const { room, id, p, at, ramMob, ram } = await setup(srv);
    at(GATE);
    room.sieges.tick(Date.now());
    const m = ramMob(), rid = ram().id, hp0 = m.hp, xp0 = p.xp;
    for (const clan of [undefined, HOST]) {
      p.clan = clan; p.x = m.x + 20; p.y = m.y;
      room.hitTarget(id, rid, 500, [0, 0], { basic: true });
      room.hitTarget(id, rid, 500, [0, 0], { skill: true });
      assert.equal(m.hp, hp0, `${clan ?? "unsworn"}: 0 damage`);
    }
    for (const clan of [DEF, THIRD]) {
      p.clan = clan;
      const h = m.hp;
      room.hitTarget(id, rid, 50, [0, 0], {});
      assert.ok(m.hp < h, `${clan}: hurts it`);
    }
    assert.equal(p.xp, xp0, "no XP");
  } finally { restore(); await srv.stop(); }
});

test("works (room): wrecked by a defender-sworn hero: valor for the defender (capped), renown, sfx, Herald; no new ram until the next war tick", async () => {
  const srv = await startRoom();
  siegeWar();
  try {
    SIEGE_BATTLE.battleValorPerTick = SIEGE_WORKS.wreckValor + 2; // room for one full wreck, then the cap bites
    const { room, id, p, at, ram, ramMob, sent } = await setup(srv, DEF);
    at(GATE);
    room.sieges.tick(Date.now());
    let m = ramMob();
    assert.ok(m);
    p.x = m.x + 20; p.y = m.y;
    m.hp = 1;
    room.hitTarget(id, ram().id, 50, [0, 0], {});
    assert.ok(m.dead, "wrecked");
    assert.equal(_valorOf(LAND.id, DEF), SIEGE_WORKS.wreckValor, "valor for the defending clan");
    assert.equal(_valorOf(LAND.id, HOST), 0);
    assert.equal(p.renown, SIEGE_WORKS.wreckRenown, "renown for the killer");
    assert.ok(sent.some(([t, v]) => t === "sfx" && v.ev === "ram_wrecked" && Number.isFinite(v.x) && Number.isFinite(v.y)));
    assert.ok(sent.some(([t, v]) => t === "chat" && v.name === "Herald" && /bone ram/.test(v.text)));
    assert.ok(sent.some(([t, v]) => t === "siege" && v.t === LAND.id && !v.ram), "the plaque drops the ram");
    // no new ram in the same war tick
    for (let i = 0; i < 4; i++) { room.sieges.tick(Date.now()); await wait(20); }
    assert.equal(ramMob(), undefined, "no respawn this war tick");
    // the next war tick: a fresh ram at the approach, whole
    warState()!.tick++;
    room.sieges.tick(Date.now());
    m = ramMob();
    assert.ok(m && !m.dead && m.hp === m.maxHp, "a new ram next war tick");
    assert.equal(ram().arrived, false);
    // the cap: a second wreck in the same war tick pays only what is left
    warState()!.tick--;
    p.x = m.x + 20; p.y = m.y; m.hp = 1;
    room.hitTarget(id, ram().id, 50, [0, 0], {});
    assert.equal(_valorOf(LAND.id, DEF), SIEGE_BATTLE.battleValorPerTick, "capped per war tick");
    assert.equal(p.renown, 2 * SIEGE_WORKS.wreckRenown);
  } finally { restore(); await srv.stop(); }
});

test("works (room): a third clan's hero wrecks it for nothing; only the defender earns from it", async () => {
  const srv = await startRoom();
  siegeWar();
  try {
    const { room, id, p, at, ram, ramMob, sent } = await setup(srv, THIRD);
    at(GATE);
    room.sieges.tick(Date.now());
    const m = ramMob();
    p.x = m.x + 20; p.y = m.y; m.hp = 1;
    room.hitTarget(id, ram().id, 50, [0, 0], {});
    assert.ok(m.dead);
    assert.equal(_valorOf(LAND.id, THIRD) + _valorOf(LAND.id, DEF), 0, "no valor");
    assert.equal(p.renown, 0, "no renown");
    assert.ok(sent.some(([t, v]) => t === "sfx" && v.ev === "ram_wrecked"), "still a wreck to see and hear");
  } finally { restore(); await srv.stop(); }
});

test("works (room): the ram at the gate weighs ramWeight for the attacker, enough to take the gate alone", async () => {
  const srv = await startRoom();
  siegeWar();
  try {
    SIEGE_BATTLE.reinforceMs = 1e9;
    const { room, p, at, ram, ramMob, strip, sent } = await setup(srv, THIRD);
    // the hero stands in the land, outside every front's ring (the spot nearest halfway from a standard to the gate:
    // halfway itself lies in a ring on some lands)
    at(offRings());
    assert.ok(FRONTS.every((f) => Math.hypot(f.x - p.x, f.y - p.y) > SIEGE_BATTLE.frontRadiusPx), "hero outside the rings");
    let T = Date.now() + 1_000_000;
    room.sieges.tick(T);
    const r = ram(), s = room.sieges._siege(LAND.id), gi = FRONTS.indexOf(GATE);
    assert.ok(ramMob());
    const works = room.sieges._works;
    assert.equal(works.extraWeight(LAND.id, GATE, "atk"), 0, "not at the gate yet");
    r.d = r.goal; r.arrived = true;
    const m = ramMob();
    m.x = GATE.x; m.y = GATE.y;
    assert.equal(works.extraWeight(LAND.id, GATE, "atk"), SIEGE_WORKS.ramWeight);
    assert.equal(works.extraWeight(LAND.id, GATE, "def"), 0);
    assert.equal(works.extraWeight(LAND.id, FRONTS[0], "atk"), 0, "only at the gate");
    s.nextScore = T;
    const t0 = T;
    let fell = 0;
    for (; T < t0 + SIEGE_BATTLE.captureMs + 4 * SIEGE_BATTLE.scoreMs && !fell; T += SIEGE_BATTLE.scoreMs) {
      strip(); m.x = GATE.x; m.y = GATE.y; room.sieges.tick(T);
      if (s.fronts[gi].holder === "atk") fell = T;
    }
    assert.ok(SIEGE_WORKS.ramWeight >= SIEGE_BATTLE.holdMargin);
    assert.ok(fell && fell - t0 >= SIEGE_BATTLE.captureMs, "the gate falls to the ram alone, after captureMs");
    assert.ok(sent.some(([t, v]) => t === "siege" && v.fronts[gi]?.holder === HOST));
    assert.equal(_valorOf(LAND.id, HOST), 0, "the ram earns nothing by itself (no Host hero there)");
  } finally { restore(); await srv.stop(); }
});

test("works (room): the ram and its crew count inside maxSiegeTroops; total troopers never pass maxTroops", async () => {
  const srv = await startRoom();
  siegeWar();
  try {
    const { room, at, ramMob } = await setup(srv, DEF);
    WAR_TROOPS.maxTroops = 30;
    Object.defineProperty(room.caravans, "count", { get: () => 12, configurable: true });
    at(GATE);
    for (let i = 0; i < 3; i++) { room.sieges.tick(Date.now()); room.warTroops.tick(Date.now()); await wait(50); }
    assert.ok(ramMob(), "a ram within the share");
    assert.ok(room.sieges.count <= Math.min(SIEGE_BATTLE.maxSiegeTroops, 30 - 12), `siege share ${room.sieges.count}`);
    assert.ok(12 + room.sieges.count + room.warTroops.count <= 30, `total ${12 + room.sieges.count + room.warTroops.count}`);
    let n = 0;
    room.state.mobs.forEach((m: any) => { if (m.kind === "trooper" && !m.dead) n++; });
    assert.ok(n <= 30 - 12, `troopers in the room ${n}`);
    SIEGE_BATTLE.maxSiegeTroops = 10;
    room.sieges.tick(Date.now());
    assert.ok(room.sieges.count <= 10, `maxSiegeTroops holds the ram too (${room.sieges.count})`);
    assert.ok(ramMob(), "the ram keeps its reserved places");
  } finally { restore(); await srv.stop(); }
});
