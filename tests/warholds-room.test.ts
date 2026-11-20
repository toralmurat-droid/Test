// Sacking a Hold in the room (W2b, server/warHolds.ts): guards and sieges stop it, the 12 s banner, the pause and the
// restart, one sack per land per war tick for every room, the siege call, the unsworn sacker, the guards kept down.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, until, wait } from "./helpers/room";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { atWar, setWarPairs, warPairs } from "../shared/war/feuds";
import { newMinds } from "../shared/war/doctrine";
import { bannerSpot, HOLD_SACK, inSackReach, sackGold } from "../shared/war/holdSack";
import { garrisonCount, garrisonSpots, patrolOf, TROOP } from "../shared/war/patrols";
import { newWar, targetsOf, WAR } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { musterOf } from "../shared/war/standards";
import { troopLevel, WAR_TROOPS } from "../shared/war/troops";
import { SAFE_ZONE, isSafeZone } from "../shared/map";
import { _resetWar, _valorOf, warLog, warNow, warState } from "../server/war";
import { holdGuards } from "../shared/war/intel";
import { holdTier } from "../shared/war/holdTiers";
import { _resetHolds } from "../server/warHolds";

/**
 * A land with guards (a fortified land: standards.ts HOLD_SITES), away from Oakvale, not a capital; FOE: a clan at war with its holder that may attack it; CALM: a
 * clan neither at war with the holder nor able to reach the land (its heroes need a grudge to be enemies).
 */
const PICK = (() => {
  const s = newWar();
  _resetWar({ v: 1, state: s, minds: newMinds(), next: Date.now() + 1e9, log: [] }); // (sets the clans at war for the opening map)
  for (const t of TERRITORIES) {
    const b = bannerSpot(t.id);
    if (!b || t.capitalOf || !patrolOf(t.id) || garrisonSpots(t.id, TROOP.garrisonMax).length < 4 || isSafeZone(b.x, b.y)) continue;
    if (Math.hypot(t.cx - (SAFE_ZONE.x + SAFE_ZONE.w / 2), t.cy - (SAFE_ZONE.y + SAFE_ZONE.h / 2)) < 60) continue;
    const own = s.owner[t.id], foe = CLAN_KEYS.find((k) => k !== own && atWar(k, own) && targetsOf(s, k).includes(t.id));
    const calm = CLAN_KEYS.find((k) => k !== own && !atWar(k, own) && !targetsOf(s, k).includes(t.id));
    if (foe && calm) return { t: t.id, own, foe, calm };
  }
  throw new Error("no land for the sack tests");
})();
const LAND = TERRITORIES[PICK.t], OWN: ClanKey = PICK.own, FOE: ClanKey = PICK.foe, CALM: ClanKey = PICK.calm, SPOT = bannerSpot(LAND.id)!;
const freshWar = () => { _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] }); _resetHolds(); };

async function setup(srv: Awaited<ReturnType<typeof startRoom>>, clan?: ClanKey) {
  const c = await srv.join({ cls: "wizard" });
  await wait(150);
  const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
  p.level = 30; p.hp = p.maxHp = 1_000_000; p.invulnUntil = Date.now() + 1e9; p.clan = clan; p.renown = 0; p.lastAct = Date.now(); p.lastHurt = 0;
  p.x = SPOT.x; p.y = SPOT.y;
  // the room's own 1 s interval runs on the wall clock: the test drives the banner's clock itself
  const tick: (now: number) => void = room.holds.tick.bind(room.holds);
  room.holds.tick = () => {};
  room.warTroops.tick(Date.now()); // the land wakes: its holder's column and guards
  room.state.mobs.forEach((m: any, mid: string) => { if (m.kind !== "trooper") room.state.mobs.delete(mid); }); // no wild monsters in the way
  const got: any[] = [], sent: [string, any][] = [], chat: string[] = [];
  c.onMessage("sack", (m: any) => got.push(m));
  c.onMessage("chat", (m: any) => chat.push(m.text));
  const bc = room.broadcast.bind(room);
  room.broadcast = (t: string, m: any, o?: any) => { sent.push([t, m]); return bc(t, m, o); };
  const troops = (): any[] => (room.warTroops._land(LAND.id)?.slots ?? []).map((s: any) => s.id && room.state.mobs.get(s.id)).filter((m: any) => m && !m.dead);
  const guards = () => room.warTroops.guardsAlive(LAND.id, (x: number, y: number) => inSackReach(LAND.id, x, y));
  /** Cuts down every soldier of the land (they come back at the gate only after respawnMs). */
  const rout = () => { for (const m of troops()) { m.dead = true; m.hp = 0; } room.warTroops.tick(Date.now()); };
  const sack = (now = Date.now()) => room.holds.sack(id, { t: LAND.id }, now);
  return { c, room, id, p, tick, got, sent, chat, troops, guards, rout, sack };
}

/** Ticks the banner of `s` once a second from `t0` until it is done or `max` seconds pass; returns the time it took (s). */
function raise(s: { tick: (now: number) => void; room: any }, t0: number, max = 30): number {
  for (let i = 1; i <= max; i++) { s.tick(t0 + i * 1000); if (!s.room.holds.count) return i; }
  return Infinity;
}

test("holds (room): no sack while a guard lives, during a siege, by a friend or a neutral; the message is validated", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const s = await setup(srv, FOE), { room, id, p, c } = s;
    assert.ok(s.guards() > 0, "the Hold's guards stand");
    assert.match(s.sack(), /guards/);
    assert.equal(room.holds.count, 0);
    s.rout();
    assert.equal(s.guards(), 0);
    for (const bad of [undefined, null, 5, "x", {}, { t: "1" }, { t: -1 }, { t: 1.5 }, { t: 1e6 }]) assert.notEqual(room.holds.sack(id, bad), "", JSON.stringify(bad));
    c.send("sack", { t: "junk" }); c.send("sack", null);
    await wait(150);
    assert.equal(room.holds.count, 0, "junk starts nothing (and does not crash the room)");
    p.x = SPOT.x + 3 * 32;
    assert.match(s.sack(), /Stand at the banner/);
    p.x = SPOT.x;
    p.clan = OWN; assert.match(s.sack(), /own clan/);
    p.clan = CALM; assert.match(s.sack(), /not your enemies/, "a clan at peace with the holder needs a provocation first");
    p.clan = undefined; assert.match(s.sack(), /not your enemies/);
    p.clan = FOE;
    warState()!.siege[LAND.id] = { by: FOE, at: warState()!.tick + 3 };
    assert.match(s.sack(), /siege/);
    warState()!.siege[LAND.id] = null;
    assert.equal(s.sack(), "", "an enemy at an unguarded Hold may raise the banner");
    assert.equal(room.holds.count, 1);
    // a siege called meanwhile stops it
    warState()!.siege[LAND.id] = { by: FOE, at: warState()!.tick + 3 };
    s.tick(Date.now() + 1000);
    assert.equal(room.holds.count, 0, "a siege stops the banner");
    assert.ok(await until(() => s.got.some((m) => m.state === "stop" && /siege/.test(m.err))), "the raiser hears why");
    await c.leave();
  } finally { await srv.stop(); }
});

test("holds (room): the banner takes 12 s, a defender pauses it, a blow starts it over; Control -8 once, valor, renown, gold", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const s = await setup(srv, FOE), { room, p } = s;
    s.rout();
    const d = await srv.join({ cls: "wizard" });
    await wait(150);
    const q = room.state.players.get(d.sessionId);
    q.level = 30; q.invulnUntil = Date.now() + 1e9; q.clan = OWN; q.lastAct = Date.now(); q.x = SPOT.x + 4 * 32; q.y = SPOT.y;
    assert.ok(inSackReach(LAND.id, q.x, q.y));
    assert.match(s.sack(), /stands watch/, "an active defender in the reach keeps the banner down");
    q.lastAct = 0;
    const t0 = Date.now();
    assert.equal(s.sack(t0), "", "an idle one does not");
    for (let i = 1; i <= 6; i++) s.tick(t0 + i * 1000);
    const half = [...room.holds.raises.values()][0];
    assert.ok(Math.abs(half.progress - 0.5) < 1e-6, `half way after 6 s (${half.progress})`);
    q.lastAct = t0 + 6000; // the defender wakes up
    s.tick(t0 + 7000); s.tick(t0 + 8000);
    assert.ok(half.paused && Math.abs(half.progress - 0.5) < 1e-6, "paused while the defender stands in the reach");
    assert.ok(await until(() => s.got.some((m) => m.state === "paused")), "the raiser sees it paused");
    assert.ok(s.sent.some(([t, m]) => t === "holds" && m.raising.some((r: number[]) => r[0] === LAND.id && r[2] === 1)), "the room sees it paused");
    q.x = SPOT.x + 40 * 32; // the defender leaves
    s.tick(t0 + 9000);
    assert.ok(!half.paused && half.progress > 0.5);
    p.lastHurt = t0 + 9500; // a blow lands on the raiser
    s.tick(t0 + 10_000);
    assert.equal(half.progress, 0, "hurt: from nothing");
    const c0 = warState()!.control[LAND.id], tick = warNow()!.tick, gold0 = p.gold;
    let items0 = 0; room.state.items.forEach((it: any) => { if (it.kind === "gold") items0 += it.amount; });
    const took = raise(s, t0 + 10_000);
    assert.equal(took, HOLD_SACK.raiseMs / 1000, "12 s with nobody in the way");
    assert.equal(warState()!.control[LAND.id], c0 - HOLD_SACK.control, "Control -8");
    assert.equal(_valorOf(LAND.id, FOE), HOLD_SACK.sackValor, "valor for the sacker's clan");
    assert.equal(p.renown, HOLD_SACK.sackRenown, "renown for the sacker");
    assert.equal(q.renown ?? 0, 0, "none for the defender");
    let items = 0; room.state.items.forEach((it: any) => { if (it.kind === "gold") items += it.amount; });
    assert.equal(items - items0 + (p.gold - gold0), sackGold(troopLevel(LAND.id)), "the war chest");
    assert.ok(s.sent.some(([t, m]) => t === "sfx" && m.ev === "hold_sacked" && m.t === LAND.id && m.by === FOE), "sfx hold_sacked");
    assert.ok(s.sent.some(([t, m]) => t === "holds" && m.sacked.some((x: number[]) => x[0] === LAND.id && x[1] === CLAN_KEYS.indexOf(FOE))), "the sacker's banner flies");
    assert.ok(s.sent.some(([t, m]) => t === "warev" && m.kind === "sack" && m.t === LAND.id && m.by === FOE), "every room hears the war event");
    assert.ok(s.sent.some(([t, m]) => t === "chat" && m.name === "Herald" && /sacked the Hold/.test(m.text)), "the Herald");
    assert.ok(s.sent.filter(([t, m]) => t === "chat" && m.name !== "Herald" && m.name).length >= 1, "the holder's leader answers");
    assert.equal(warLog().at(-1)?.kind, "sack");
    assert.equal(warNow()!.tick, tick);
    // once per war tick
    assert.match(s.sack(), /sacked already/);
    await d.leave(); await s.c.leave();
  } finally { await srv.stop(); }
});

test("holds (room): one sack per land per war tick, shared by two rooms; the guards stay down until the next tick", async () => {
  const a = await startRoom(), respawn = WAR_TROOPS.respawnMs;
  freshWar();
  try {
    const sa = await setup(a, FOE);
    await sa.room.lock(); // full: the next hero opens a second room in this process
    const sb = await setup(a, FOE);
    assert.notEqual(sa.room, sb.room, "two rooms");
    sa.rout(); sb.rout();
    assert.equal(sa.sack(), ""); assert.equal(sb.sack(), "");
    const c0 = warState()!.control[LAND.id], t0 = Date.now();
    assert.equal(raise(sa, t0), 12);
    assert.equal(warState()!.control[LAND.id], c0 - HOLD_SACK.control);
    sb.tick(t0 + 13_000);
    assert.equal(sb.room.holds.count, 0, "the other room's banner stops");
    assert.ok(await until(() => sb.got.some((m) => m.state === "stop" && /sacked already/.test(m.err))));
    assert.equal(warState()!.control[LAND.id], c0 - HOLD_SACK.control, "Control fell once");
    assert.match(sb.sack(), /sacked already/);
    assert.ok(sb.room.holds.view().sacked.some((x: number[]) => x[0] === LAND.id), "the other room flies the banner too");
    // the guards stay down, in both rooms, past their respawn
    WAR_TROOPS.respawnMs = 0;
    for (const s of [sa, sb]) { s.room.warTroops.tick(Date.now()); assert.equal(s.room.warTroops.guardsAlive(LAND.id), 0, "no guards until the next war tick"); }
    assert.ok(sa.troops().length > 0, "the column comes back");
    warState()!.tick++; // the next war tick
    sa.tick(Date.now()); sb.tick(Date.now());
    for (const s of [sa, sb]) { s.room.warTroops.tick(Date.now()); assert.ok(s.room.warTroops.guardsAlive(LAND.id) > 0, "the guards are back"); }
    assert.deepEqual(sa.room.holds.view().sacked, [], "the banner is down");
    await sa.c.leave(); await sb.c.leave();
  } finally { WAR_TROOPS.respawnMs = respawn; await a.stop(); }
});

test("holds (room): a siege at <= 25 Control only for a clan that may attack; an unsworn sacker gets gold, no valor, half the harm", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const s = await setup(srv, FOE), { room, p } = s;
    s.rout();
    // an unsworn hero with a grudge: half the harm, no siege, no valor, the war chest
    p.clan = undefined; p.feud = { [OWN]: { until: Date.now() + 600_000 } };
    warState()!.control[LAND.id] = 28;
    assert.equal(s.sack(), "");
    const gold0 = p.gold;
    let items0 = 0; room.state.items.forEach((it: any) => { if (it.kind === "gold") items0 += it.amount; });
    raise(s, Date.now());
    assert.equal(warState()!.control[LAND.id], 24, "half the harm");
    assert.equal(warState()!.siege[LAND.id], null, "no clan, no siege");
    for (const k of CLAN_KEYS) assert.equal(_valorOf(LAND.id, k), 0, "no valor");
    assert.equal(p.renown, 0);
    let items = 0; room.state.items.forEach((it: any) => { if (it.kind === "gold") items += it.amount; });
    assert.equal(items - items0 + (p.gold - gold0), sackGold(troopLevel(LAND.id)), "but the war chest");
    assert.ok(s.sent.some(([t, m]) => t === "sfx" && m.ev === "hold_sacked" && m.by === ""), "a plain banner");
    // a hero sworn to a clan the war keeps out (a grudge makes them enemies): half the harm, no siege, no valor
    warState()!.tick++; s.tick(Date.now()); room.warTroops.tick(Date.now()); s.rout();
    p.clan = CALM; p.feud = { [OWN]: { until: Date.now() + 600_000 } };
    warState()!.control[LAND.id] = 28;
    assert.equal(s.sack(), "");
    raise(s, Date.now());
    assert.equal(warState()!.control[LAND.id], 24);
    assert.equal(warState()!.siege[LAND.id], null, "out of reach: no siege");
    assert.equal(_valorOf(LAND.id, CALM), 0);
    // a sworn hero of a clan that may attack: the siege is called at <= 25
    warState()!.tick++; s.tick(Date.now()); room.warTroops.tick(Date.now()); s.rout();
    p.clan = FOE; p.feud = {};
    warState()!.control[LAND.id] = 30;
    assert.equal(s.sack(), "");
    raise(s, Date.now());
    assert.equal(warState()!.control[LAND.id], 22);
    assert.deepEqual(warState()!.siege[LAND.id], { by: FOE, at: warState()!.tick + WAR.siegeWarnTicks, sack: true }, "the sacker's clan lays siege (marked as a sack's)");
    assert.ok(warNow()!.sieges.some((x) => x[0] === LAND.id), "every client's snapshot shows it");
    assert.ok(warLog().some((e) => e.kind === "siege" && e.t === LAND.id && e.by === FOE), "and the war log");
    await s.c.leave();
  } finally { await srv.stop(); }
});

test("holds (room): a busy room's budget never lets a Hold be sacked without a fight; a hero at the banner gets its guards first", async () => {
  const srv = await startRoom(), max = WAR_TROOPS.maxTroops, respawn = WAR_TROOPS.respawnMs;
  freshWar();
  try {
    const s = await setup(srv, FOE), { room } = s;
    warState()!.fort[LAND.id] = 0.3; room.holdWalls.syncWar(warState()); // a camp (W3: a fresh Hold is an outpost of 3 guards)
    const want = holdGuards(LAND.id, warState()!.control[LAND.id], holdTier(warState()!, LAND.id));
    assert.ok(want > 2, "a land with more guards than the starved budget");
    WAR_TROOPS.maxTroops = 0; // the room's troopers all spent elsewhere
    room.warTroops.tick(Date.now());
    assert.equal(room.warTroops.guardsAlive(LAND.id), 0, "starved: no guards in the field");
    assert.equal(room.warTroops.guardsDue(LAND.id), want, "but they are still owed a fight");
    assert.match(s.sack(), /guards/, "no free sack");
    WAR_TROOPS.maxTroops = 2; WAR_TROOPS.respawnMs = 0;
    room.warTroops.tick(Date.now());
    assert.equal(room.warTroops.guardsAlive(LAND.id), 2, "a hero at the banner: the land's guards take the slots first");
    let felled = 0;
    // (W3: the fallen come back at the gate, which a fortress's reach can push just past a camp's sack reach: once every
    // guard owed has fallen, the sack may go up even while they walk back)
    for (let i = 0; i < 20 && room.warTroops.guardsDue(LAND.id) > 0; i++) { felled += room.warTroops.guardsAlive(LAND.id); s.rout(); if (room.warTroops.guardsDue(LAND.id) > 0) assert.match(s.sack(), /guards/); }
    assert.equal(felled, want, "every guard the Hold should field had to fall");
    WAR_TROOPS.respawnMs = respawn; s.rout(); // the last pair, no more coming back this tick
    assert.equal(room.warTroops.guardsDue(LAND.id), 0);
    assert.equal(s.sack(), "", "cut through: the banner may go up");
    await s.c.leave();
  } finally { WAR_TROOPS.maxTroops = max; WAR_TROOPS.respawnMs = respawn; await srv.stop(); }
});

test("holds (room): a sworn hero whose clan is not at war with the holder (a grudge only) robs the Hold: gold, half the harm, no siege, no valor", async () => {
  const srv = await startRoom(), wars = warPairs();
  freshWar();
  try {
    const s = await setup(srv, FOE), { p } = s;
    s.rout();
    setWarPairs([]); // no clan at war: FOE may still reach the land on the war map, but only a grudge makes its hero an enemy
    p.feud = { [OWN]: { until: Date.now() + 600_000 } };
    warState()!.control[LAND.id] = 30;
    assert.equal(s.sack(), "");
    const gold0 = p.gold;
    let items0 = 0; s.room.state.items.forEach((it: any) => { if (it.kind === "gold") items0 += it.amount; });
    raise(s, Date.now());
    assert.equal(warState()!.control[LAND.id], 26, "half the harm");
    assert.equal(warState()!.siege[LAND.id], null, "no siege");
    assert.equal(_valorOf(LAND.id, FOE), 0, "no valor");
    assert.equal(p.renown, 0, "no renown");
    let items = 0; s.room.state.items.forEach((it: any) => { if (it.kind === "gold") items += it.amount; });
    assert.equal(items - items0 + (p.gold - gold0), sackGold(troopLevel(LAND.id)), "the war chest");
    assert.ok(await until(() => s.chat.some((t) => /not at war/.test(t))), "the Herald says why");
    await s.c.leave();
  } finally { setWarPairs(wars); await srv.stop(); }
});

test("holds (room): the Crown Keep has no banner to raise: it changes hands only at a Reckoning", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const keep = TERRITORIES.find((t) => t.reckoningOnly)!, holder = warState()!.owner[keep.id];
    assert.equal(bannerSpot(keep.id), undefined, "war-proof land: no fort (standards.ts HOLD_SITES)");
    const at = musterOf(keep.id)!;
    const c = await srv.join({ cls: "wizard" });
    await wait(150);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    p.level = 50; p.clan = CLAN_KEYS.find((k) => k !== holder); p.lastAct = Date.now(); p.x = at.x; p.y = at.y;
    assert.match(room.holds.sack(c.sessionId, { t: keep.id }), /no banner/);
    assert.equal(room.holds.count, 0);
    assert.equal(warState()!.control[keep.id], 100);
  } finally { await srv.stop(); }
});
