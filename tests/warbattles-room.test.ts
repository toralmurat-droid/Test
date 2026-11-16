import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, until, wait } from "./helpers/room";
import { TILE } from "../shared/constants";
import { type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { BATTLE, battleField, type Battle, type BattleMsg, type BattleSite } from "../shared/war/battles";
import { newWar, WAR, warTick } from "../shared/war/rules";
import { WAR_TROOPS } from "../shared/war/troops";
import { STANDARD } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { warPhase } from "../shared/war/view";
import type { Kv } from "../server/store";
import {
  _battleFed, _forceBattle, _resetWar, _valorOf, battleClock, battleDeath, battleFielded, battleScore, inMeetBattle, step, stormingAt, warBattles, warNow, warOrders, warState, type SavedWar,
} from "../server/war";
import { WarBattles, type BattleHost } from "../server/warBattles";
import type { TroopHero, TroopMob } from "../server/warTroops";

const memKv = () => { const m = new Map<string, string>(); const kv: Kv = { get: async (k) => (m.has(k) ? JSON.parse(m.get(k)!) : undefined), set: async (k, v) => { m.set(k, JSON.stringify(v)); } }; return { kv, m }; };
const saved = (next: number): SavedWar => ({ v: 1, state: newWar(), minds: newMinds(), next, log: [] });
const savedB = { ...BATTLE }, savedT = { ...WAR_TROOPS };
const restore = () => { Object.assign(BATTLE, savedB); Object.assign(WAR_TROOPS, savedT); };

/** A land pair of the opening war with a field: land t (not a capital), attacked from the neighbour `from` of another clan. */
const SITE: BattleSite = (() => {
  const s = newWar();
  for (const T of TERRITORIES) {
    if (T.capitalOf) continue;
    for (const n of T.near) if (s.owner[n] !== s.owner[T.id] && battleField(n, T.id)) return { t: T.id, from: n, a: s.owner[n], b: s.owner[T.id] };
  }
  throw new Error("no battle site");
})();
const FIELD = battleField(SITE.from, SITE.t)!;

test("battles (server war): with battles on, the server war plays the rules' war with exactly the outcomes it fed each tick", async () => {
  const t0 = 10_000_000_000_000, N = 300;
  _resetWar(saved(t0));
  const kinds = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const before = JSON.parse(JSON.stringify(warState())), at = warNow()!.next;
    await step(at);
    const fed = _battleFed();
    for (const o of fed) kinds.set(o.kind, (kinds.get(o.kind) ?? 0) + 1);
    warTick(before, warOrders()!, { phase: warPhase(at), valor: TERRITORIES.map(() => ({})), ...(fed.length ? { battle: fed } : {}) });
    assert.deepEqual(warState(), before, `tick ${i}`);
  }
  assert.ok((kinds.get("pitched") ?? 0) >= 3, `pitched battles fought (${[...kinds].join(", ")})`);
  assert.ok([...kinds.values()].reduce((a, b) => a + b, 0) <= BATTLE.perDay * Math.ceil(N / WAR.ticksPerDay + 1), "at most perDay a day");
});

test("battles (server war): one battle at a time; the pitched one is announced noticeMs ahead at the most pressed front", async () => {
  const t0 = 10_000_000_000_000;
  _resetWar(saved(t0));
  for (let i = 0; i < 200; i++) await step(warNow()!.next); // (pressure builds)
  for (let n = 0; n < 2 * WAR.ticksPerDay; n++) {
    const at = warNow()!.next;
    await step(at);
    const open = warBattles().filter((b) => !b.result);
    for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) assert.ok(open[i].end <= open[j].start || open[j].end <= open[i].start, "never two battles at once");
    for (const b of open) if (b.kind === "pitched" && !b.begun) assert.ok(b.start - at <= BATTLE.noticeMs && b.start > at - WAR.tickMs, "announced at most noticeMs ahead");
  }
});

test("battles (server war): the war save keeps the battles; a restart mid-battle continues it exactly; junk is dropped; old saves load", async () => {
  const t0 = 11_000_000_000_000, { kv, m } = memKv();
  const run = () => { _resetWar(saved(t0 + WAR.tickMs), kv); return _forceBattle(SITE, "pitched", t0 - 60_000, FIELD.x, FIELD.y)!; };
  // uninterrupted
  const b1 = run();
  battleClock(t0 - 30_000); battleDeath(b1.id, 0, 7); battleClock(t0); battleClock(t0 + 120_000);
  const men = [...b1.men], el = b1.el;
  // saved at t0, restarted, continued
  const b2 = run();
  battleClock(t0 - 30_000); battleDeath(b2.id, 0, 7); battleClock(t0);
  await step(t0); // (dirty: written by the step)
  const raw = JSON.parse(m.get("war")!);
  assert.equal(raw.battles.list.length, 1, "the battle is in the save");
  assert.equal(raw.battles.list[0].el, 60);
  _resetWar(raw, kv);
  battleClock(t0 + 120_000);
  assert.equal(warBattles().length, 1);
  assert.equal(warBattles()[0].el, el);
  assert.deepEqual(warBattles()[0].men, men, "after a restart it goes on exactly as without one");
  // junk battles are dropped, the rest of the war loads
  _resetWar({ ...saved(t0), battles: { list: [{ id: 1, kind: "duel" }, null], day: "x", n: 2, meets: 0, pitched: 0 } } as any);
  assert.deepEqual(warBattles(), []);
  assert.ok(warNow());
  // a save from before W5 loads as it is
  _resetWar(saved(t0));
  assert.deepEqual(warBattles(), []);
});

/** A fake room for the two-room test: its own mobs and one hero standing on the field. */
function fakeRoom(hero: Partial<TroopHero> = {}, paid: [string, number][] = []) {
  const mobs = new Map<string, TroopMob>(), heroes = new Map<string, TroopHero>([["h", { name: `H${Math.random()}`, clan: undefined, level: 30, x: FIELD.x, y: FIELD.y, dead: false, renown: 0, ...hero }]]);
  const host: BattleHost = {
    spawn: (id, level, x, y, weapon) => { const m = { kind: "trooper", weapon, level, x, y, homeX: x, homeY: y, dir: "down", hp: 1, maxHp: 1, dead: false, title: "" } as unknown as TroopMob; mobs.set(id, m); return m; },
    remove: (id) => { mobs.delete(id); }, mob: (id) => mobs.get(id), heroes: () => heroes.entries(), hero: (id) => heroes.get(id),
    broadcast: () => {}, tell: () => {}, ranked: () => {}, pay: (id, g) => { paid.push([id, g]); },
  };
  return { mobs, heroes, wb: new WarBattles(host, {} as any) };
}

test("battles (two rooms): the pools are shared; no two rooms field the same men; every death counts once", () => {
  try {
    BATTLE.perSide = 40;
    const now = Date.now();
    _resetWar(saved(now + WAR.tickMs));
    const b = _forceBattle(SITE, "pitched", now - 1000, FIELD.x, FIELD.y)!;
    battleClock(now);
    b.men0 = [60, 60]; b.men = [60, 60]; // (small pools: two rooms want more than there is)
    const A = fakeRoom(), B = fakeRoom();
    A.wb.tick(now); B.wb.tick(now);
    const side = (r: ReturnType<typeof fakeRoom>, s: 0 | 1) => r.wb._live()!.places[s].filter((p: { id: string }) => p.id).length;
    assert.equal(side(A, 0), 40); assert.equal(side(A, 1), 40);
    assert.equal(side(B, 0), 20, "the second room fields what is left"); assert.equal(side(B, 1), 20);
    assert.ok(A.wb.count + B.wb.count <= 120 && A.wb.count <= BATTLE.extraTroops);
    // three attackers fall in A, two in B: five men, counted once each
    const kill = (r: ReturnType<typeof fakeRoom>, n: number) => {
      for (const p of r.wb._live()!.places[0].filter((x: { id: string; captain: boolean }) => x.id && !x.captain).slice(0, n)) { const m = r.mobs.get(p.id)!; m.dead = true; assert.ok(r.wb.killed(m, p.id, undefined, now)); }
    };
    kill(A, 3); kill(B, 2);
    assert.equal(A.wb.killed(A.mobs.values().next().value!, "nope", undefined), false, "not a battle soldier");
    battleClock(now + BATTLE.stepMs);
    assert.equal(warBattles()[0].men[0], 55, "five deaths, counted once (the quota was under one man)");
    battleClock(now + BATTLE.stepMs); // (the same time again: nothing more)
    assert.equal(warBattles()[0].men[0], 55);
    // the rooms report what they field: together never more than the pools
    const fa = battleFielded(b.id, "probe", [0, 0], now + 3000).may;
    assert.ok(fa[0] >= 0 && side(A, 0) + side(B, 0) <= 60);
    A.wb.tick(now + BATTLE.reserveMs + 3000); B.wb.tick(now + BATTLE.reserveMs + 3000);
    assert.ok(side(A, 0) + side(B, 0) <= warBattles()[0].men[0], `fielded ${side(A, 0)} + ${side(B, 0)} <= ${warBattles()[0].men[0]}`);
  } finally { restore(); }
});

test("battles (room): the lines wake near a hero in slots of their own; only sworn heroes of oath level the clan fights hurt them; kill valor under the battle's cap; captains; pay at the end; the cap restored", async () => {
  const srv = await startRoom();
  try {
    const now = Date.now();
    _resetWar(saved(now + WAR.tickMs));
    const b: Battle = _forceBattle(SITE, "pitched", now - 1000, FIELD.x, FIELD.y)!;
    const c = await srv.join({ cls: "wizard" });
    const msgs: BattleMsg[] = [];
    c.onMessage("battle", (m: BattleMsg) => msgs.push(m)); // subscribe before waiting, so the join send isn't dropped
    await wait(150);
    const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
    p.level = 30; p.hp = p.maxHp = 1_000_000; p.invulnUntil = 0; p.clan = undefined; p.renown = 0;
    p.x = FIELD.x; p.y = FIELD.y;
    room.state.mobs.forEach((m: any, mid: string) => { if (m.kind !== "trooper") room.state.mobs.delete(mid); });
    room.battles.tick(Date.now());
    const lv = room.battles._live();
    assert.ok(lv, "a hero on the field: the battle wakes");
    assert.ok(b.begun);
    const per = Math.min(BATTLE.perSide, b.men0[0]);
    assert.equal(lv.places[0].filter((x: any) => x.id).length, per);
    assert.ok(room.battles.count <= BATTLE.extraTroops);
    let troopers = 0; room.state.mobs.forEach((m: any) => { if (m.kind === "trooper") troopers++; });
    assert.ok(troopers <= WAR_TROOPS.maxTroops + BATTLE.extraTroops, `${troopers} troopers in the room`);
    const cap0 = lv.places[0].find((x: any) => x.captain).id, capMob = room.state.mobs.get(cap0);
    assert.match(capMob.title, /, captain$/);
    // stance gates: unsworn, ally, under the oath level: no damage
    const sol = lv.places[0].find((x: any) => x.id && !x.captain).id, m0 = room.state.mobs.get(sol), hp0 = m0.hp;
    for (const [clan, lvl] of [[undefined, 30], [SITE.a, 30], [SITE.b, STANDARD.minLevel - 1]] as [ClanKey | undefined, number][]) {
      p.clan = clan; p.level = lvl; p.x = m0.x; p.y = m0.y;
      room.hitTarget(id, sol, 500, [0, 0], { basic: true });
      assert.equal(m0.hp, hp0, `${clan ?? "unsworn"} at level ${lvl}: no damage`);
    }
    // a sworn hero of the defender, of oath level: hurts it, and kill valor is paid under the battle's cap
    p.clan = SITE.b; p.level = 30;
    room.hitTarget(id, sol, 50, [0, 0], {});
    assert.ok(m0.hp < hp0, "an enemy hurts it");
    capMob.hp = 1; p.x = capMob.x; p.y = capMob.y;
    room.hitTarget(id, cap0, 50, [0, 0], {});
    assert.ok(capMob.dead, "the captain falls");
    assert.equal(b.captains[0], 1, "the attackers lost a captain");
    assert.equal(_valorOf(SITE.t, SITE.b), WAR_TROOPS.killPts.officer + BATTLE.captainValor);
    let kills = 1;
    for (const x of lv.places[0]) {
      if (!x.id || x.captain) continue;
      const mm = room.state.mobs.get(x.id); if (!mm || mm.dead) continue;
      mm.hp = 1; p.x = mm.x; p.y = mm.y;
      room.hitTarget(id, x.id, 50, [0, 0], {});
      if (mm.dead) kills++;
      if (kills > 40) break;
    }
    assert.ok(kills > 30);
    assert.equal(_valorOf(SITE.t, SITE.b), BATTLE.killValorCap, "kill valor stops at the battle's cap");
    const renownAfterKills = p.renown;
    assert.equal(renownAfterKills, BATTLE.killValorCap, "as much renown");
    // the deaths fill the pools' quota at the next step
    const men0 = b.men[0];
    battleClock(Date.now() + BATTLE.stepMs);
    assert.ok(b.men[0] <= men0 - kills, `the pool lost every death (${men0} -> ${b.men[0]}, ${kills} kills)`);
    // the end: the defender's active hero is paid; renown never past BATTLE.renownCap a battle
    BATTLE.activeMs = 1; BATTLE.winRenown = 100;
    p.x = FIELD.x; p.y = FIELD.y; room.battles.tick(Date.now()); p.x += 40; await wait(20); room.battles.tick(Date.now());
    const gold0 = p.gold;
    b.men[0] = 1; // (the attackers break)
    battleClock(Date.now() + 10 * BATTLE.stepMs);
    assert.equal(b.result, "def");
    room.battles.tick(Date.now());
    assert.equal(p.renown, BATTLE.renownCap, "renown capped per battle");
    assert.ok(p.gold > gold0, "gold for the winner");
    assert.equal(room.battles.count, 0, "the battle's men are gone: the room's cap is back to WAR_TROOPS.maxTroops");
    troopers = 0; room.state.mobs.forEach((m: any) => { if (m.kind === "trooper" && !m.dead) troopers++; });
    assert.ok(troopers <= WAR_TROOPS.maxTroops);
    await until(() => msgs.some((m) => m.list.some((v) => v.id === b.id)));
    assert.ok(msgs.some((m) => m.list.some((v) => v.id === b.id)), "the clients hear of the battle");
  } finally { restore(); await srv.stop(); }
});

test("battles (two rooms): banners are scored once per window from every room's counts summed; an empty room neither freezes nor resets them", () => {
  const now = Date.now();
  _resetWar(saved(now + WAR.tickMs));
  const b = _forceBattle(SITE, "pitched", now, FIELD.x, FIELD.y)!;
  battleClock(now);
  assert.equal(b.banners[1].holder, "def");
  const S = BATTLE.scoreMs, lead: [number, number][] = [[0, 0], [5, 0], [0, 0]], empty: [number, number][] = [[0, 0], [0, 0], [0, 0]];
  // room A leads at the centre every second; room B, with no men there, reports zeros every second too
  for (let t = now; t <= now + 20_000 + 3 * S; t += 1000) { battleScore(b.id, "A", lead, t); battleScore(b.id, "B", empty, t); battleClock(t); }
  assert.equal(b.banners[1].holder, "atk", "the lead held captureMs: the centre changes hands despite the empty room");
  // the counts of two rooms add up: 1 + 1 is a lead of 2 (holdMargin), neither alone is
  const t1 = now + 40_000;
  for (let t = t1; t <= t1 + 20_000 + 3 * S; t += 1000) { battleScore(b.id, "A", [[0, 1], [0, 0], [0, 0]], t); battleScore(b.id, "B", [[0, 1], [0, 0], [0, 0]], t); battleClock(t); }
  assert.equal(b.banners[0].holder, "def", "two rooms' defenders together take the left flank");
  // a window nobody reported leaves the hysteresis alone
  const f = { ...b.banners[2] };
  battleClock(t1 + 60_000);
  assert.deepEqual(b.banners[2], f);
  // calling the clock twice for the same time steps nothing twice
  const before = JSON.stringify(b.banners);
  battleClock(t1 + 60_000);
  assert.equal(JSON.stringify(b.banners), before);
});

test("battles (two rooms): the captains stand in one room only, a fallen captain never comes back, its valor only once", () => {
  try {
    BATTLE.perSide = 30;
    const now = Date.now();
    _resetWar(saved(now + WAR.tickMs));
    const b = _forceBattle(SITE, "pitched", now - 1000, FIELD.x, FIELD.y)!;
    battleClock(now);
    b.men0 = [200, 200]; b.men = [200, 200];
    const A = fakeRoom(), B = fakeRoom();
    A.wb.tick(now); B.wb.tick(now);
    const caps = (r: ReturnType<typeof fakeRoom>, s: 0 | 1) => r.wb._live()!.places[s].filter((p: { id: string; captain: boolean }) => p.id && p.captain).length;
    assert.equal(caps(A, 0) + caps(B, 0), BATTLE.captains, "the captains of a side stand once, in one room");
    const holder = caps(A, 0) ? A : B;
    const cap = holder.wb._live()!.places[0].find((p: { id: string; captain: boolean }) => p.id && p.captain)!, m = holder.mobs.get(cap.id)!;
    m.dead = true; holder.wb.killed(m, cap.id, undefined, now);
    assert.equal(b.captains[0], 1);
    for (let t = now + 1000; t <= now + 3 * BATTLE.reserveMs; t += BATTLE.reserveMs) { A.wb.tick(t); B.wb.tick(t); }
    assert.equal(caps(A, 0) + caps(B, 0), BATTLE.captains - 1, "the fallen captain does not come back");
  } finally { restore(); }
});

test("battles (rooms): only heroes in a room that fielded men are paid; a watcher in an empty room earns nothing", () => {
  try {
    BATTLE.activeMs = 1;
    const now = Date.now();
    _resetWar(saved(now + WAR.tickMs));
    const b = _forceBattle(SITE, "pitched", now - 1000, FIELD.x, FIELD.y)!;
    battleClock(now);
    const paidA: [string, number][] = [], paidB: [string, number][] = [];
    const A = fakeRoom({ clan: SITE.b }, paidA), B = fakeRoom({ clan: SITE.b, y: FIELD.y + 3 }, paidB);
    BATTLE.extraTroops = 140;
    A.wb.tick(now);
    const had = BATTLE.perSide; BATTLE.perSide = 0; // (room B fields nobody)
    B.wb.tick(now);
    BATTLE.perSide = had;
    for (const [r, dy] of [[A, 8], [B, 8]] as const) { r.heroes.get("h")!.y += dy; r.wb.tick(now + 1000); }
    assert.equal(B.wb.count, 0);
    b.men[0] = 1; battleClock(now + 10 * BATTLE.stepMs);
    assert.equal(b.result, "def");
    A.wb.tick(now + 20_000); B.wb.tick(now + 20_000);
    assert.ok(paidA.length > 0, "the room that fought pays its hero");
    assert.equal(paidB.length, 0, "the room that fielded nobody pays nothing");
  } finally { restore(); }
});

test("battles: a battle a tick interval past its end is stale: dropped unfed", async () => {
  const t0 = 12_000_000_000_000;
  _resetWar(saved(t0));
  const b = _forceBattle(SITE, "pitched", t0 - 3 * WAR.tickMs, FIELD.x, FIELD.y)!;
  b.result = "att"; b.begun = true; b.done = t0 - 2 * WAR.tickMs;
  await step(t0);
  assert.deepEqual(_battleFed(), [], "not fed");
  assert.ok(!warBattles().some((x) => x.id === b.id), "dropped");
});

test("battles: a storming makes the siege's live waves stand down; a meeting battle the columns'", async () => {
  const now = Date.now();
  _resetWar(saved(now + WAR.tickMs));
  assert.equal(stormingAt(SITE.t), false);
  _forceBattle(SITE, "storm", now + 30_000, FIELD.x, FIELD.y, BATTLE.shortMs);
  assert.equal(stormingAt(SITE.t), true, "announced: the siege's waves stand down already");
  const meet = _forceBattle({ t: SITE.from, from: SITE.t, a: SITE.b, b: SITE.a }, "meet", now - 1000, FIELD.x, FIELD.y, BATTLE.shortMs)!;
  assert.ok(meet);
  assert.equal(inMeetBattle({ clan: SITE.b, from: SITE.t, to: SITE.from }, now), true, "the attacking column");
  assert.equal(inMeetBattle({ clan: SITE.a, from: SITE.from, to: SITE.t }, now), true, "the other column");
  assert.equal(inMeetBattle({ clan: SITE.a, from: SITE.from, to: SITE.t }, now - 5000), false, "not before it starts");
  // in a room: a live siege at that land sleeps while the storming is called
  const srv = await startRoom();
  try {
    _resetWar(saved(Date.now() + WAR.tickMs));
    const st = warState()!; st.siege[SITE.t] = { by: SITE.a, at: st.tick + 6 }; st.control[SITE.t] = 20;
    const c = await srv.join({ cls: "wizard" });
    await wait(150);
    const room = srv.room, p = room.state.players.get(c.sessionId), T = TERRITORIES[SITE.t];
    p.x = (T.x + T.w / 2) * TILE; p.y = (T.y + T.h / 2) * TILE;
    room.sieges.tick(Date.now());
    const live = () => [...room.sieges.sieges.values()].some((s: any) => s.live);
    assert.ok(live(), "the siege is live with a hero there");
    _forceBattle(SITE, "storm", Date.now() + 30_000, FIELD.x, FIELD.y, BATTLE.shortMs);
    room.sieges.tick(Date.now());
    assert.equal(live(), false, "the storming replaces its waves");
  } finally { await srv.stop(); }
});
