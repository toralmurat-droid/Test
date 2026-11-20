import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds, scriptedOrders } from "../shared/war/doctrine";
import {
  BATTLE, battleBanners, battleDay, battleField, battleMen, battleOutcome, battleResult, battleStep, battleView, isDecisive, meetSite, newBattle,
  pickMeetings, pickPitched, pitchedSlot, pitchedTicks, siegeOdds, siteForces, virtualBattle, type Battle,
} from "../shared/war/battles";
import type { March } from "../shared/war/marches";
import { roadPairs } from "../shared/war/roads";
import { deployments, newWar, phaseOf, WAR, warTick, type BattleOutcome, type WarState } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";

function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clone = (s: WarState): WarState => JSON.parse(JSON.stringify(s));
const site = (a: ClanKey = "redfang", b: ClanKey = "wardens") => ({ t: 5, from: 6, a, b });

/** 600 seeded ticks with valor and march extras: the hash was taken with shared/war/rules.ts as it was before W5 (refreshed
 * on purpose for each new land on the map, last when the Crown joined: 72 territories, 2026-11-16). */
function golden(battle?: BattleOutcome[]): string {
  const s = newWar(), minds = newMinds(), rnd = mulberry(5005), trace: number[] = [];
  for (let i = 0; i < 600; i++) {
    const o = scriptedOrders(s, minds, rnd);
    warTick(s, o, { valor: i % 5 === 2 ? s.owner.map((_, t) => (t % 4 === 1 ? { [CLAN_KEYS[i % 5]]: 15 } : {})) : undefined,
      march: i % 3 === 0 ? [{ t: i % s.owner.length, k: CLAN_KEYS[(i >> 1) % 5], mult: 0.6 }] : undefined, ...(battle ? { battle } : {}) });
    trace.push(s.pressure.reduce((a, b) => a + b, 0), s.control.reduce((a, b) => a + b, 0));
  }
  const json = JSON.stringify({ s, trace }, (_k, v) => (typeof v === "number" ? Number(v.toFixed(6)) : v));
  let h = 2166136261;
  for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}

test("battles: warTick with no battle plays exactly as before W5 (golden), and an empty or invalid battle list changes nothing", () => {
  assert.equal(golden(), "8ea9e37");
  assert.equal(golden([]), "8ea9e37");
  const junk = [{ kind: "duel", t: 1, att: "redfang", def: "wardens", result: "att", lostA: 0.5, lostB: 0.5 }, { kind: "pitched", t: 999, att: "redfang", def: "wardens", result: "att", lostA: 0, lostB: 1 },
    { kind: "pitched", t: 1, att: "redfang", def: "redfang", result: "att", lostA: 0, lostB: 1 }, { kind: "pitched", t: 1.5, att: "redfang", def: "wardens", result: "def", lostA: 1, lostB: 0 },
    { kind: "pitched", t: 1, att: "nobody", def: "wardens", result: "def", lostA: 1, lostB: 0 }] as unknown as BattleOutcome[];
  assert.equal(golden(junk), "8ea9e37");
});

function warAt(ticks: number, seed = 11): { s: WarState; minds: ReturnType<typeof newMinds>; rnd: () => number } {
  const s = newWar(), minds = newMinds(), rnd = mulberry(seed);
  for (let i = 0; i < ticks; i++) warTick(s, scriptedOrders(s, minds, rnd));
  return { s, minds, rnd };
}

test("battles: a pitched or meeting outcome moves Control and the fight there; the loser's army bleeds by the share it lost", () => {
  const { s, minds, rnd } = warAt(200);
  const o = scriptedOrders(s, minds, rnd), d = deployments(s, o, phaseOf(s.tick));
  const t = d.attack.findIndex((a, i) => !TERRITORIES[i].capitalOf && Object.keys(a).length > 0);
  assert.ok(t >= 0);
  const att = Object.keys(d.attack[t])[0] as ClanKey, def = s.owner[t];
  const run = (b?: BattleOutcome) => { const x = clone(s); warTick(x, o, b ? { battle: [b] } : {}); return x; };
  const plain = run();
  const won = run({ kind: "pitched", t, att, def, result: "att", lostA: 0.2, lostB: 0.6 });
  assert.ok(won.pressure[t] > plain.pressure[t], "the winner's attack there counts more");
  assert.ok(Math.abs(won.army[def] - plain.army[def]) > 0, "the loser's army bleeds");
  const held = run({ kind: "meet", t, att, def, result: "def", lostA: 0.5, lostB: 0.1 });
  assert.ok(held.control[t] >= plain.control[t] || held.owner[t] !== plain.owner[t], "a defender win holds Control");
  assert.ok(held.army[att] < plain.army[att] + 1e-9);
  // Control alone: on a quiet land (no attack) a battle still moves it
  const q = clone(s); q.control.fill(60); q.siege.fill(null);
  const quiet = TERRITORIES.findIndex((tt) => !tt.capitalOf && !Object.keys(d.attack[tt.id]).length);
  const a2 = CLAN_KEYS.find((k) => k !== q.owner[quiet])!;
  const base = clone(q); warTick(base, o, {});
  const hit = clone(q); warTick(hit, o, { battle: [{ kind: "pitched", t: quiet, att: a2, def: q.owner[quiet], result: "att", lostA: 0, lostB: 0.7 }] });
  assert.equal(hit.control[quiet], base.control[quiet] - WAR.battleControl);
  const hold = clone(q); warTick(hold, o, { battle: [{ kind: "pitched", t: quiet, att: a2, def: q.owner[quiet], result: "def", lostA: 0.7, lostB: 0 }] });
  assert.equal(hold.control[quiet], Math.min(100, base.control[quiet] + WAR.battleHold));
  // the army hit: armyHit x the share lost, on the loser only
  const ah = clone(q), ab = clone(q);
  warTick(ab, { }, {}); warTick(ah, {}, { battle: [{ kind: "pitched", t: quiet, att: a2, def: q.owner[quiet], result: "att", lostA: 0.1, lostB: 0.5 }] });
  assert.ok(Math.abs(ah.army[q.owner[quiet]] - ab.army[q.owner[quiet]]) > 0);
  assert.ok(Math.abs(ah.army[a2] - ab.army[a2]) < 1e-9, "the winner's army is untouched");
  // the land changed hands meanwhile: Control is left alone (the armies still fought)
  const moot = clone(q); warTick(moot, o, { battle: [{ kind: "pitched", t: quiet, att: a2, def: a2 === "wardens" ? "redfang" : "wardens", result: "att", lostA: 0, lostB: 0.7 }] });
  if (q.owner[quiet] !== (a2 === "wardens" ? "redfang" : "wardens")) assert.equal(moot.control[quiet], base.control[quiet]);
});

test("battles: a storming settles the siege: an attacker win flips the land, a defender win fails it, a draw leaves the usual check", () => {
  const { s, minds, rnd } = warAt(150, 3);
  const o = scriptedOrders(s, minds, rnd), d = deployments(s, o, phaseOf(s.tick));
  const t = d.attack.findIndex((a, i) => !TERRITORIES[i].capitalOf && Object.keys(a).length > 0);
  const by = Object.keys(d.attack[t])[0] as ClanKey, own = s.owner[t];
  const x = clone(s); x.siege[t] = { by, at: x.tick }; x.control[t] = 10;
  const run = (result?: "att" | "def" | "draw") => { const y = clone(x); warTick(y, o, result ? { battle: [{ kind: "storm", t, att: by, def: own, result, lostA: 0.3, lostB: 0.3 }] } : {}); return y; };
  const plain = run(), win = run("att"), lose = run("def"), draw = run("draw");
  assert.equal(win.owner[t], by); assert.equal(win.control[t], 60); assert.equal(win.siege[t], null);
  assert.equal(lose.owner[t], own); assert.equal(lose.control[t], 50); assert.equal(lose.siege[t], null);
  assert.equal(draw.owner[t], plain.owner[t]); assert.equal(draw.control[t], plain.control[t]);
  // a storming by a clan that is not the besieger does nothing to the siege
  const other = CLAN_KEYS.find((k) => k !== by && k !== own)!;
  const y = clone(x); warTick(y, o, { battle: [{ kind: "storm", t, att: other, def: own, result: "att", lostA: 0, lostB: 1 }] });
  assert.equal(y.owner[t], plain.owner[t]);
});

test("battles: men from force are clamped; the Lanchester step is deterministic and breaks the smaller side", () => {
  assert.equal(battleMen(0), BATTLE.menMin); assert.equal(battleMen(NaN), BATTLE.menMin); assert.equal(battleMen(1e9), BATTLE.menMax);
  assert.equal(battleMen(150 * BATTLE.perMan), 150);
  const a = virtualBattle(newBattle(site(), "pitched", 0, 0, 0, 200 * BATTLE.perMan, 100 * BATTLE.perMan));
  const b = virtualBattle(newBattle(site(), "pitched", 0, 0, 0, 200 * BATTLE.perMan, 100 * BATTLE.perMan));
  assert.deepEqual(a, b, "the same men give the same battle");
  assert.equal(a.result, "att");
  assert.ok(a.men[1] < BATTLE.breakAt * a.men0[1], "the defender broke");
  assert.ok(a.el * 1000 < BATTLE.maxMs);
  assert.deepEqual([a.men0, a.men, Math.round(a.el)], [[200, 100], [179, 29], 164]); // (the numbers as tuned; change with BATTLE)
  const o = battleOutcome(a)!;
  assert.equal(o.kind, "pitched"); assert.equal(o.att, "redfang"); assert.equal(o.def, "wardens");
  assert.ok(Math.abs(o.lostA - 21 / 200) < 1e-9 && Math.abs(o.lostB - 71 / 100) < 1e-9);
  // an even fight with one banner each draws
  const e = newBattle(site(), "pitched", 0, 0, 0, 150, 150);
  e.banners = [{ holder: "atk", since: 0 }, { holder: "def", since: 0 }];
  virtualBattle(e);
  assert.equal(e.result, "draw");
  assert.ok(e.el * 1000 >= BATTLE.maxMs - 1e-6 || e.men[0] < BATTLE.breakAt * e.men0[0]);
  assert.equal(battleOutcome(newBattle(site(), "pitched", 0, 0, 0, 100, 100)), undefined, "no outcome while it is fought");
});

test("battles: banners and fallen captains swing the killing rates; live deaths count toward the quota, only the excess is extra", () => {
  const even = () => { const b = newBattle(site(), "pitched", 0, 0, 0, 150, 150); b.banners = [{ holder: "atk", since: 0 }, { holder: "def", since: 0 }]; return b; };
  const b1 = even(); b1.banners[1].holder = "atk"; virtualBattle(b1); assert.equal(b1.result, "att", "two banners to none wins an even fight");
  const b2 = even(); b2.captains = [2, 0]; virtualBattle(b2); assert.equal(b2.result, "def", "losing both captains loses an even fight");
  // the quota: 150 men x k x 2 s = 0.525 a step: live deaths at or under the quota take nothing extra
  const q = even(), r = even();
  for (let i = 0; i < 20; i++) { const took = battleStep(q, 2); battleStep(r, 2, [took[0], 0]); }
  assert.deepEqual(q.men, r.men, "live deaths that the quota would have taken anyway take nothing extra");
  const x = even(), y = even();
  for (let i = 0; i < 20; i++) { battleStep(x, 2); battleStep(y, 2, [3, 0]); }
  assert.ok(y.men[0] < x.men[0] - 30, "kills beyond the quota cost the side extra men");
  assert.ok(y.men[1] >= x.men[1], "and the side that lost them kills fewer");
  // a finished battle stays put
  const done = virtualBattle(even()), men = [...done.men];
  assert.deepEqual(battleStep(done, 2, [5, 5]), [0, 0]); assert.deepEqual(done.men, men);
  assert.equal(battleResult({ men0: [100, 100], men: [50, 47] }), "draw");
  assert.equal(battleResult({ men0: [100, 200], men: [50, 60] }), "att");
});

test("battles: pitched battles at 13:00, 19:00 and 21:30 Zurich time, winter and summer", () => {
  const w = pitchedSlot(Date.UTC(2026, 10, 16, 6, 0));
  assert.equal(new Date(w.at).toISOString(), "2026-11-16T12:00:00.000Z"); assert.equal(w.slot, 0);
  assert.equal(new Date(pitchedSlot(w.at + 1).at).toISOString(), "2026-11-16T18:00:00.000Z");
  const late = pitchedSlot(Date.UTC(2026, 10, 16, 20, 31));
  assert.equal(new Date(late.at).toISOString(), "2026-11-17T12:00:00.000Z");
  const s = pitchedSlot(Date.UTC(2026, 6, 1, 19, 0));
  assert.equal(new Date(s.at).toISOString(), "2026-07-01T19:30:00.000Z"); assert.equal(s.slot, 2);
  assert.equal(battleDay(Date.UTC(2026, 10, 16, 23, 30)), battleDay(Date.UTC(2026, 10, 17, 10, 0)), "the day turns at local midnight");
  assert.deepEqual(pitchedTicks(), [78, 114, 129]);
});

test("battles: every chosen pair has a field (a clear box off the safe ground), and nearly every neighbour pair has one", () => {
  let missing = 0;
  for (const p of roadPairs()) {
    const f = battleField(p.a, p.b);
    if (!f) { missing++; continue; }
    assert.equal(Math.max(f.w, f.h), BATTLE.fieldLong); assert.equal(Math.min(f.w, f.h), BATTLE.fieldShort);
    assert.equal(Math.abs(f.dx) + Math.abs(f.dy), 1);
    const back = battleField(p.b, p.a)!;
    assert.deepEqual([back.x, back.y, back.dx, back.dy], [f.x, f.y, -f.dx, -f.dy], "the same field, the axis turned");
    assert.equal(battleBanners(f).length, 3);
  }
  assert.ok(missing <= 3, `${missing} neighbour pairs have no field`);
  // pitched battles chosen over seeded wars all have a field, at a non-capital land the attacker can strike
  let chosen = 0;
  for (const seed of [1, 2, 3]) {
    const s = newWar(), minds = newMinds(), rnd = mulberry(seed);
    for (let i = 0; i < WAR.ticksPerDay * 3; i++) {
      if (i % 12 === 0) {
        const p = pickPitched(s);
        if (p) {
          chosen++;
          assert.ok(battleField(p.from, p.t), `no field between ${p.from} and ${p.t}`);
          assert.ok(!TERRITORIES[p.t].capitalOf); assert.equal(s.owner[p.t], p.b); assert.equal(s.owner[p.from], p.a);
          assert.ok(TERRITORIES[p.t].near.includes(p.from));
        }
      }
      warTick(s, scriptedOrders(s, minds, rnd));
    }
  }
  assert.ok(chosen > 10);
});

test("battles: a storming only on a close, due siege; site forces follow the siege odds", () => {
  const { s, minds, rnd } = warAt(150, 3);
  const o = scriptedOrders(s, minds, rnd), ph = phaseOf(s.tick), d = deployments(s, o, ph);
  const t = d.attack.findIndex((a, i) => !TERRITORIES[i].capitalOf && Object.keys(a).length > 0);
  const by = Object.keys(d.attack[t])[0] as ClanKey;
  const x = clone(s); x.siege[t] = { by, at: x.tick + 1 };
  assert.equal(isDecisive(x, t, d.attack[t], d.defence[t], ph), false, "not due yet");
  x.siege[t]!.at = x.tick;
  const odds = siegeOdds(x, t, d.attack[t], d.defence[t], ph)!;
  assert.deepEqual(siteForces(x, "storm", t, by, d.attack[t], d.defence[t], ph), odds);
  // scale the defence so the odds sit at even, then far apart
  const even = d.defence[t] * odds[0] / odds[1];
  assert.equal(isDecisive(x, t, d.attack[t], even, ph), true);
  assert.equal(isDecisive(x, t, d.attack[t], even * 2, ph), false);
  assert.equal(isDecisive(x, t, d.attack[t], even / 2, ph), false);
});

test("battles: meeting battles need 6+ men a side; the stronger column attacks the land it marches on; the largest first", () => {
  const m = (id: string, clan: ClanKey, from: number, to: number, size: number, force: number): March => ({ id, clan, from, to, tick: 0, at: 0, dep: 0, force, size });
  const a = m("a", "redfang", 1, 2, 7, 150), b = m("b", "wardens", 2, 1, 6, 120);
  assert.deepEqual(meetSite(a, b), { t: 2, from: 1, a: "redfang", b: "wardens", forceA: 150, forceB: 120 });
  assert.deepEqual(meetSite(b, a), meetSite(a, b));
  assert.equal(meetSite(a, m("c", "wardens", 2, 1, 5, 300)), undefined, "a column of 5 is too small");
  assert.equal(meetSite(a, m("d", "wardens", 3, 1, 8, 300)), undefined, "not one road");
  const big = { a: m("e", "host", 4, 5, 8, 200), b: m("f", "veiled", 5, 4, 8, 210) };
  assert.deepEqual(pickMeetings([{ a, b }, big], 1), [big]);
  assert.equal(pickMeetings([{ a, b }, big], 2).length, 2);
});

test("battles: the client view carries the field, the banners and the men", () => {
  const p = roadPairs().find((q) => battleField(q.a, q.b))!;
  const b: Battle = newBattle({ t: p.b, from: p.a, a: "redfang", b: "wardens" }, "pitched", 0, 0, 1000, 150, 120);
  const v0 = battleView(b, 500);
  assert.equal(v0.state, 0); assert.ok(v0.box); assert.equal(v0.banners.length, 3); assert.deepEqual(v0.captains, [BATTLE.captains, BATTLE.captains]);
  assert.deepEqual(v0.banners.map((x) => x[2]), [0, 1, 0]);
  battleStep(b, 2);
  assert.equal(battleView(b, 2000).state, 1);
  virtualBattle(b);
  const v2 = battleView(b, 9e9);
  assert.equal(v2.state, 2); assert.equal(v2.result, b.result);
  assert.ok(JSON.stringify(v2).length < 600, "small enough to send every few seconds");
});
