import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, wait } from "./helpers/room";
import { TILE, WORLD_H } from "../shared/constants";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { RITUAL, ritualSite, ritualSpot, ritualTime } from "../shared/war/rituals";
import { newWar, targetsOf } from "../shared/war/rules";
import { atWar } from "../shared/war/feuds";
import { STANDARD } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { parseTroop, planRole, troopWeapon, WAR_TROOPS } from "../shared/war/troops";
import { _resetWar, _valorOf, warState } from "../server/war";
import { _resetRituals, WarRituals } from "../server/warRituals";

const V: ClanKey = "veiled";
/** The opening war's ritual land, a clan that may fight there and one the war keeps out. */
const PICK = (() => {
  const s = newWar(), site = ritualSite(s)!;
  const foe = CLAN_KEYS.find((k) => k !== V && targetsOf(s, k).includes(site.t));
  const out = CLAN_KEYS.find((k) => k !== V && k !== foe && s.owner[site.t] !== k && !targetsOf(s, k).includes(site.t));
  if (!foe || !out) throw new Error("no clans for the ritual land");
  return { t: site.t, foe, out };
})();
const LAND = TERRITORIES[PICK.t], FOE = PICK.foe, OUT = PICK.out, SPOT = ritualSpot(LAND.id)!;
/** A moment at noon (the Veiled's doctrine phase), and one at night. */
/** The start of a ritual phase (not the current one, which may be about to end, so "a minute later" stays in phase). */
const NOON = (() => { let t = Date.now(); while (ritualTime(t)) t += 10_000; while (!ritualTime(t)) t += 10_000; return t; })();
const NIGHT = (() => { let t = NOON; while (ritualTime(t)) t += 10_000; return t + 5 * 60_000; })();

const saved = { ...RITUAL }, savedTroops = { ...WAR_TROOPS };
const restore = () => { Object.assign(RITUAL, saved); Object.assign(WAR_TROOPS, savedTroops); _resetRituals(); };
function ritualWar() {
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });
  _resetRituals();
}

async function setup(srv: Awaited<ReturnType<typeof startRoom>>, clan?: ClanKey) {
  const c = await srv.join({ cls: "wizard" });
  await wait(150);
  const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
  p.level = 30; p.hp = p.maxHp = 1_000_000; p.invulnUntil = 0; p.clan = clan; p.renown = 0; p.lastAct = NOON;
  // the room's own 1 s interval runs on the wall clock: the test drives the ritual's clock itself
  const tick: (now: number) => void = room.rituals.tick.bind(room.rituals);
  room.rituals.tick = () => {};
  const sent: [string, any][] = [], bc = room.broadcast.bind(room);
  room.broadcast = (t: string, m: any, o?: any) => { sent.push([t, m]); return bc(t, m, o); };
  const at = (pt: { x: number; y: number }) => { p.x = pt.x; p.y = pt.y; };
  const r = () => room.rituals._ritual;
  const acolytes = () => (r()?.slots ?? []).map((s: any) => s.id && room.state.mobs.get(s.id)).filter((m: any) => m && !m.dead);
  const kill = (m: any) => { at({ x: m.x + 16, y: m.y }); m.hp = 1; room.hitTarget(id, [...room.state.mobs.entries()].find(([, x]: any) => x === m)![0], 50, [0, 0], {}); };
  return { c, room, id, p, sent, at, r, acolytes, tick, kill };
}

test("rituals (room): the circle and its acolytes appear only at noon with a hero near", async () => {
  const srv = await startRoom();
  try {
    ritualWar();
    const { room, p, at, r, acolytes, tick, sent } = await setup(srv, FOE);
    at(SPOT);
    tick(NIGHT);
    assert.equal(r(), undefined, "night: no ritual");
    p.y = (WORLD_H + 20) * TILE; // underground: nothing wakes
    tick(NOON);
    assert.ok(r() && !r().live && acolytes().length === 0, "noon, but no hero near");
    at({ x: SPOT.x + (RITUAL.wakeTiles + 3) * TILE, y: SPOT.y });
    tick(NOON);
    assert.equal(acolytes().length, 0, "a hero just out of reach");
    at({ x: SPOT.x + 10 * TILE, y: SPOT.y });
    tick(NOON);
    assert.equal(r().t, LAND.id);
    const a = acolytes();
    assert.equal(a.length, RITUAL.acolytes, "three acolytes");
    assert.ok(a.every((m: any) => parseTroop(m.weapon)?.clan === V && Math.hypot(m.x - SPOT.x, m.y - SPOT.y) <= RITUAL.postPx + 1), "Veiled troopers on the circle");
    assert.deepEqual(a.map((m: any) => m.weapon), [0, 1, 2].map((i) => troopWeapon(V, false, false, false, false, planRole(V, "ritual", i))), "in their roles by place (ROLE_PLAN.ritual)");
    assert.ok(sent.some(([t, v]) => t === "rituals" && v.t === LAND.id && v.x === SPOT.x && v.state === "channel"), "the clients hear of it");
    // noon ends: the circle goes
    tick(NIGHT);
    assert.equal(r(), undefined);
    assert.equal(room.rituals.count, 0, "its acolytes go");
    assert.ok(sent.some(([t, v]) => t === "rituals" && v.t === -1), "and the clients hear");
  } finally { restore(); await srv.stop(); }
});

test("rituals (room): Veiled heroes speed it up, rivals pause it (with hysteresis)", async () => {
  const srv = await startRoom();
  try {
    ritualWar();
    const { p, at, r, tick } = await setup(srv);
    at({ x: SPOT.x + 10 * TILE, y: SPOT.y });
    let T = NOON;
    tick(T);
    const step = (ms: number) => { T += ms; p.lastAct = T; tick(T); };
    step(1000);
    const alone = r().progress;
    assert.ok(alone > 0 && Math.abs(alone - 1000 / RITUAL.channelMs) < 1e-6, `channels alone (${alone})`);
    p.clan = V; at({ x: SPOT.x + TILE, y: SPOT.y });
    const before = r().progress;
    step(1000);
    assert.ok(Math.abs(r().progress - before - (1000 * (1 + RITUAL.heroSpeed)) / RITUAL.channelMs) < 1e-6, "a Veiled hero in the ring speeds it up");
    p.lastAct = T - STANDARD.idleMs - 1000; T += 1000; tick(T);
    // (an idle hero helps nothing; lastAct was not refreshed for that step)
    p.clan = FOE; step(1000);
    assert.equal(r().state, "channel", "a rival: not paused at once");
    step(RITUAL.pauseMs);
    assert.equal(r().state, "paused", "paused after pauseMs");
    const held = r().progress;
    step(5000);
    assert.equal(r().progress, held, "paused: no progress");
    at({ x: SPOT.x + RITUAL.ringPx + 2 * TILE, y: SPOT.y });
    step(1000);
    assert.equal(r().state, "paused", "resumes only after resumeMs");
    step(RITUAL.resumeMs);
    assert.equal(r().state, "channel");
  } finally { restore(); await srv.stop(); }
});

test("rituals (room): completion pays the Veiled legal, capped valor once; no second outcome that phase", async () => {
  const srv = await startRoom();
  try {
    ritualWar();
    const { room, at, r, tick, sent, acolytes } = await setup(srv);
    at({ x: SPOT.x + 10 * TILE, y: SPOT.y });
    tick(NOON);
    // a second room of the same process
    const mobs = new Map<string, any>(), other = new WarRituals({
      spawn: (mid, level, x, y, weapon) => { const m = { kind: "trooper", weapon, level, x, y, homeX: x, homeY: y, hp: 1, maxHp: 1, dead: false, dir: "down", target: "" } as any; mobs.set(mid, m); return m; },
      remove: (mid) => { mobs.delete(mid); }, mob: (mid) => mobs.get(mid), mobsInBox: () => [],
      heroes: () => room.state.players.entries(), hero: (hid) => room.state.players.get(hid),
      broadcast: () => {}, budget: () => 40,
    }, room.warTroops);
    other.tick(NOON);
    assert.equal(other._ritual!.state, "channel");
    r().progress = 0.999;
    tick(NOON + 1000);
    assert.equal(r().state, "done");
    assert.equal(_valorOf(LAND.id, V), Math.min(RITUAL.ritualValor, RITUAL.maxValorPerTick), "valor for the Veiled in the land");
    assert.ok(sent.some(([t, v]) => t === "sfx" && v.ev === "ritual_done" && v.x === SPOT.x && v.y === SPOT.y));
    assert.ok(sent.some(([t, v]) => t === "chat" && v.name === "The Veiled Oracle" && v.text.includes(LAND.name)), "a leader line");
    assert.ok(sent.some(([t, v]) => t === "rituals" && v.state === "done" && v.progress === 1));
    assert.ok(acolytes().length > 0, "the acolytes stay a moment");
    tick(NOON + 1000 + RITUAL.lingerMs + 1000);
    assert.equal(acolytes().length, 0, "then go");
    // the other room's copy is over too, and pays nothing
    other._ritual!.progress = 0.999;
    other.tick(NOON + 2000);
    assert.equal(other._ritual!.state, "done");
    assert.equal(_valorOf(LAND.id, V), Math.min(RITUAL.ritualValor, RITUAL.maxValorPerTick), "paid once");
    // the same day phase: no fresh ritual
    tick(NOON + 60_000);
    assert.equal(r().state, "done", "no second ritual this noon");
    // the cap: a second completion in the same war tick (a new noon) pays only what is left
    let T2 = NOON; while (ritualTime(T2)) T2 += 10_000; while (!ritualTime(T2)) T2 += 10_000;
    tick(T2);
    assert.equal(r().state, "channel", "the next noon brings a new ritual");
    r().progress = 0.999; tick(T2 + 1000);
    assert.equal(_valorOf(LAND.id, V), RITUAL.maxValorPerTick, "capped per land, clan and war tick");
  } finally { restore(); await srv.stop(); }
});

test("rituals (room): killing the three acolytes breaks it, with renown and legal valor; only hostile heroes hurt them", async () => {
  const srv = await startRoom();
  try {
    ritualWar();
    const { id, p, at, r, tick, sent, acolytes, kill, room } = await setup(srv);
    at({ x: SPOT.x + 10 * TILE, y: SPOT.y });
    tick(NOON);
    const a = acolytes(), aid = r().slots[0].id, hp0 = a[0].hp, xp0 = p.xp;
    for (const clan of [undefined, V]) {
      p.clan = clan; at({ x: a[0].x + 16, y: a[0].y });
      room.hitTarget(id, aid, 500, [0, 0], {});
      assert.equal(a[0].hp, hp0, `${clan ?? "unsworn"}: 0 damage`);
    }
    p.clan = FOE;
    kill(a[0]); kill(a[1]);
    assert.equal(r().state, "channel", "two down: still channelling");
    tick(NOON + 1000);
    assert.equal(acolytes().length, 1, "the fallen do not come back");
    kill(a[2]);
    assert.equal(r().state, "broken");
    assert.equal(p.xp, xp0, "no XP");
    const kv = atWar(FOE, V) ? 3 * WAR_TROOPS.killPts.soldier : 0; // (W2c: each acolyte is a soldier of a clan at war: kill valor)
    assert.equal(p.renown, RITUAL.disruptRenown + kv, "renown for the disruptor");
    assert.equal(_valorOf(LAND.id, FOE), RITUAL.disruptValor + kv, "valor for the disruptor's clan");
    assert.equal(_valorOf(LAND.id, V), 0);
    assert.ok(sent.some(([t, v]) => t === "sfx" && v.ev === "ritual_broken" && v.x === SPOT.x));
    assert.ok(sent.some(([t, v]) => t === "chat" && v.name === "Herald" && /broke a ritual/.test(v.text) && v.text.includes(LAND.name)));
    assert.ok(sent.some(([t, v]) => t === "rituals" && v.state === "broken"));
    tick(NOON + 60_000);
    assert.equal(r().state, "broken", "no second outcome this noon");
    assert.equal(acolytes().length, 0);
  } finally { restore(); await srv.stop(); }
});

test("rituals (room): a clan the war keeps out of the land breaks it for renown only", async () => {
  const srv = await startRoom();
  try {
    ritualWar();
    const { p, at, r, tick, acolytes, kill } = await setup(srv, OUT);
    at({ x: SPOT.x + 10 * TILE, y: SPOT.y });
    tick(NOON);
    for (const m of acolytes()) kill(m);
    assert.equal(r().state, "broken");
    for (const k of CLAN_KEYS) assert.equal(_valorOf(LAND.id, k), 0, `no valor for ${k}`);
    assert.equal(p.renown, RITUAL.disruptRenown);
  } finally { restore(); await srv.stop(); }
});

test("rituals (room): caravans, a siege, a tunnel and the ritual stay within maxTroops; patrols yield", async () => {
  const srv = await startRoom();
  try {
    ritualWar();
    const { room, at, tick } = await setup(srv, FOE);
    WAR_TROOPS.maxTroops = 26;
    Object.defineProperty(room.caravans, "count", { get: () => 12, configurable: true });
    Object.defineProperty(room.sieges, "count", { get: () => 6, configurable: true });
    Object.defineProperty(room.tunnels, "count", { get: () => 6, configurable: true });
    at({ x: SPOT.x + 10 * TILE, y: SPOT.y });
    for (let i = 0; i < 3; i++) { tick(NOON + i * 1000); room.warTroops.tick(Date.now()); await wait(50); }
    assert.equal(room.rituals.count, 26 - 12 - 6 - 6, "the ritual gets what is left after the tunnels");
    assert.ok(12 + 6 + 6 + room.rituals.count + room.warTroops.count <= 26, `total ${12 + 6 + 6 + room.rituals.count + room.warTroops.count}`);
    Object.defineProperty(room.tunnels, "count", { get: () => 8, configurable: true });
    tick(NOON + 5000);
    assert.equal(room.rituals.count, 0, "trimmed when the tunnels grow");
    Object.assign(WAR_TROOPS, savedTroops);
    tick(NOON + 6000);
    assert.equal(room.rituals.count, RITUAL.acolytes, "back, never more than three");
    room.warTroops.tick(Date.now());
    assert.ok(12 + 6 + 8 + room.rituals.count + room.warTroops.count <= WAR_TROOPS.maxTroops);
    assert.ok(warState());
  } finally { restore(); await srv.stop(); }
});

test("rituals (room): a summon's kill of the last acolyte counts for its hero", async () => {
  const srv = await startRoom();
  try {
    ritualWar();
    const { room, id, p, at, r, tick, acolytes, kill } = await setup(srv, FOE);
    at({ x: SPOT.x + 10 * TILE, y: SPOT.y });
    tick(NOON);
    const a = acolytes();
    kill(a[0]); kill(a[1]);
    const [sid, sm] = [...room.state.mobs.entries()].find(([mid, m]: any) => !m.dead && !room.rituals.owns(mid) && m.kind !== "trooper")!;
    sm.owner = id;
    const lastId = r().slots.find((s: any) => s.id).id;
    room.rituals.killed(a[2], lastId, sid);
    assert.equal(r().state, "broken");
    const kv = atWar(FOE, V) ? 2 * WAR_TROOPS.killPts.soldier : 0; // (the hero's own two kills pay kill valor; the summon's last blow goes straight to the ritual)
    assert.equal(p.renown, RITUAL.disruptRenown + kv, "renown for the summoner");
    assert.equal(_valorOf(LAND.id, FOE), RITUAL.disruptValor + kv, "valor for the summoner's clan");
  } finally { restore(); await srv.stop(); }
});
