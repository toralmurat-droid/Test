import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE } from "../shared/constants";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { callsToArms, frontEdges, holdIntel, landPin, type WarPlan } from "../shared/war/intel";
import { patrolOf } from "../shared/war/patrols";
import { newWar, supplyMap, targetsOf, WAR } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { tunnelStrikes } from "../shared/war/tunnels";
import { warView, type WarView } from "../shared/war/view";
import { _resetWar, plansOf, warNow } from "../server/war";
import { WarTroops, type TroopHero, type TroopMob } from "../server/warTroops";
import { planAll, sendPlan } from "../server/warIntel";

test("intel: hot lists exactly the lands with pressure above 0, and is absent when none", () => {
  const s = newWar();
  assert.equal(warView(s, 0).hot, undefined);
  s.pressure[3] = 12; s.pressure[7] = 0.01; s.pressure[9] = 0;
  assert.deepEqual(warView(s, 0).hot, s.pressure.flatMap((p, t) => (p > 0 ? [t] : [])));
  assert.deepEqual(warView(s, 0).hot, [3, 7]);
});

/** WarTroops on a fake room, to count what it really fields on one land. */
function fielded(t: number): { guards: number; patrol: number } {
  const mobs = new Map<string, TroopMob>(), heroes = new Map<string, TroopHero>();
  const mob = (x: number, y: number, level: number, weapon: string): TroopMob => ({ kind: "trooper", weapon, level, x, y, homeX: x, homeY: y, dir: "down",
    hp: 100, maxHp: 100, dead: false, hidden: false, owner: "", target: "", hateId: "", hate: 0, foe: "", summonFor: "", qwave: false, servant: false,
    title: "", tide: false, moving: false, stunned: false, slowed: false, broken: false, winding: false, windUntil: 0, lastAttack: 0, stunUntil: 0, slowUntil: 0 });
  const wt = new WarTroops({
    spawn: (id, level, x, y, weapon) => { const m = mob(x, y, level, weapon); mobs.set(id, m); return m; },
    remove: (id) => { mobs.delete(id); }, mob: (id) => mobs.get(id), mobsInBox: () => [],
    heroes: () => heroes.entries(), hero: (id) => heroes.get(id), hidden: () => false,
    strikeHero: () => {}, strikeMob: () => {}, shoot: () => {}, ranked: () => {},
  });
  const gate = patrolOf(t)!.pts[0];
  heroes.set("a", { name: "A", level: 30, x: gate.x, y: gate.y, dead: false, renown: 0 });
  wt.tick(1000);
  const slots = (wt._land(t)?.slots ?? []).filter((x) => x.id && mobs.has(x.id));
  return { guards: slots.filter((x) => x.role === "guard").length, patrol: slots.filter((x) => x.role === "march").length };
}

test("intel: holdIntel counts what WarTroops fields, at full and low Control and under siege", () => {
  const lands = TERRITORIES.filter((t) => patrolOf(t.id)).slice(0, 4).map((t) => t.id);
  for (const t of lands) for (const [control, siege] of [[100, false], [37, false], [0, false], [20, true]] as const) {
    const s = newWar();
    s.control[t] = control;
    if (siege) s.siege[t] = { by: CLAN_KEYS.find((k) => k !== s.owner[t])!, at: s.tick + 3 };
    _resetWar({ v: 1, state: s, minds: newMinds(), next: Date.now() + 1e9, log: [] });
    const got = holdIntel(warNow()!, t), want = fielded(t);
    assert.equal(got.guards, want.guards, `${TERRITORIES[t].name} guards at ${control}${siege ? " (siege)" : ""}`);
    assert.equal(got.patrol, want.patrol, `${TERRITORIES[t].name} patrol at ${control}${siege ? " (siege)" : ""}`);
    assert.equal(got.clan, s.owner[t]);
    assert.equal(got.control, control);
    if (siege) { assert.equal(got.siege![0], s.siege[t]!.by); assert.equal(got.siege![1], warNow()!.sieges[0][2]); } else assert.equal(got.siege, undefined);
  }
});

test("intel (W3): holdIntel names the Hold's tier and counts its guards by tier, as WarTroops fields them", () => {
  const t = TERRITORIES.filter((x) => patrolOf(x.id) && !x.capitalOf)[0].id;
  for (const [fort, tier] of [[0, 0], [0.3, 1], [0.7, 2]] as const) {
    const s = newWar();
    s.fort[t] = fort;
    _resetWar({ v: 1, state: s, minds: newMinds(), next: Date.now() + 1e9, log: [] });
    const got = holdIntel(warNow()!, t);
    assert.equal(got.tier, tier, `fort ${fort}`);
    assert.equal(got.guards, fielded(t).guards, `tier ${tier}: the count matches what stands there`);
  }
  const s = newWar(), v = warView(s, 0);
  delete v.tier;
  assert.equal(holdIntel(v, TERRITORIES.findIndex((x) => patrolOf(x.id))).tier, 1, "an older snapshot: camps");
});

test("intel: frontEdges lists each neighbouring pair with different holders once", () => {
  const owner = TERRITORIES.map(() => 0);
  assert.deepEqual(frontEdges(owner), [], "one clan holds all: no front");
  const a = TERRITORIES.find((t) => t.near.length >= 2)!;
  owner[a.id] = 1;
  const got = frontEdges(owner), want = a.near.map((n) => (n < a.id ? [n, a.id] : [a.id, n])).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  assert.deepEqual([...got].sort((x, y) => x[0] - y[0] || x[1] - y[1]), want, "a lone land is fronted on every side");
  assert.ok(got.every(([x, y]) => x < y));
  // the live opening map: every edge is a real border with two holders
  const s = newWar(), v = warView(s, 0);
  for (const [x, y] of frontEdges(v.owner)) { assert.ok(TERRITORIES[x].near.includes(y)); assert.notEqual(v.owner[x], v.owner[y]); }
});

test("intel: callsToArms orders sieges (soonest first), writ, marches, nearest front; at most 5; none unsworn", () => {
  const s = newWar(), k: ClanKey = "redfang", ci = CLAN_KEYS.indexOf(k);
  const targets = targetsOf(s, k).filter((t) => !TERRITORIES[t].capitalOf);
  const own = s.owner.flatMap((o, i) => (o === k && !TERRITORIES[i].capitalOf ? [i] : []));
  const [siegeOn, march1, march2, writT] = targets, defended = own[0];
  const v: WarView = warView(s, 1000);
  const other = TERRITORIES.find((t) => s.owner[t.id] !== k && !targets.includes(t.id))!.id; // a siege between two other clans: not ours
  const third = CLAN_KEYS.findIndex((c) => c !== k && c !== s.owner[other]);
  v.sieges = [[siegeOn, ci, 9000], [defended, CLAN_KEYS.indexOf(s.owner[siegeOn]), 5000], [other, third, 1]];
  const plan: WarPlan = { tick: v.tick, march: [[own[0], march1, 0], [own[0], march2, 1], [own[0], siegeOn, 0]] };
  const writ = { t: writT, kind: "rout" as const, clan: k };
  const hero = landPin(own[1] ?? own[0]);
  const rows = callsToArms(v, plan, writ, k, hero);
  assert.ok(rows.length <= 5);
  assert.deepEqual(rows.map((r) => r.kind), ["siege", "siege", "writ", "march", "march"]);
  assert.deepEqual(rows.slice(0, 2).map((r) => r.t), [defended, siegeOn], "soonest siege first");
  assert.equal(rows[0].defend, true); assert.equal(rows[1].defend, false); assert.equal(rows[1].by, k);
  assert.equal(rows[2].t, writT); assert.equal(rows[2].writ, "rout");
  assert.deepEqual(rows.slice(3).map((r) => [r.t, r.tunnel, r.from]), [[march1, 0, own[0]], [march2, 1, own[0]]], "a land already called for a siege is listed once");
  assert.ok(rows.every((r) => r.name === TERRITORIES[r.t].name && Number.isFinite(r.x) && Number.isFinite(r.y)));
  // fewer rows: the nearest front land closes the list
  const short = callsToArms(v, undefined, null, k, hero);
  assert.deepEqual(short.map((r) => r.kind), ["siege", "siege", "front"]);
  const f = short[2], T = TERRITORIES[f.t];
  assert.notEqual(v.owner[f.t], ci); assert.ok(T.near.some((n) => v.owner[n] === ci), "a front land borders the clan");
  const dist = (t: number) => { const R = TERRITORIES[t], hx = hero.x / TILE, hy = hero.y / TILE; return Math.hypot(Math.max(0, R.x - hx, hx - (R.x + R.w)), Math.max(0, R.y - hy, hy - (R.y + R.h))); };
  for (const t of TERRITORIES) if (v.owner[t.id] !== ci && t.near.some((n) => v.owner[n] === ci) && t.id !== defended && t.id !== siegeOn) assert.ok(dist(t.id) >= dist(f.t));
  assert.deepEqual(callsToArms(v, plan, writ, undefined, hero), [], "unsworn: no calls");
  assert.equal(callsToArms(v, plan, { ...writ, clan: "veiled" }, k, hero).some((r) => r.kind === "writ"), false, "a writ of another oath is not shown");
});

test("intel: plansOf feeds each attack from the best-supplied adjacent own land; Hide-Kin tunnels get 1; at most 8", () => {
  const s = newWar(), hk: ClanKey = "hidekin";
  const direct = targetsOf(s, hk).filter((t) => TERRITORIES[t].near.some((n) => s.owner[n] === hk));
  const tunnel = targetsOf(s, hk).filter((t) => !TERRITORIES[t].near.some((n) => s.owner[n] === hk));
  assert.ok(direct.length && tunnel.length);
  const orders = { [hk]: { defend: 0.5, attack: [{ t: direct[0], share: 0.5 }, { t: tunnel[0], share: 0.5 }, { t: direct[0], share: 0.2 }, { t: 9999, share: 1 }] } };
  const plan = plansOf(s, orders, tunnelStrikes(s, orders), 7)[hk]!;
  assert.equal(plan.tick, 7);
  assert.equal(plan.march.length, 2, "duplicates and illegal targets dropped");
  const [from, to, tn] = plan.march[0];
  assert.equal(to, direct[0]); assert.equal(tn, 0); assert.equal(s.owner[from], hk); assert.ok(TERRITORIES[to].near.includes(from));
  const sup = supplyMap(s);
  assert.equal(sup[from], Math.max(...TERRITORIES[to].near.filter((n) => s.owner[n] === hk).map((n) => sup[n])), "the best-supplied neighbour (as warTick feeds it)");
  assert.deepEqual(plan.march[1], [tunnelStrikes(s, orders)[0].from, tunnel[0], 1]);
  const many = { redfang: { defend: 0, attack: TERRITORIES.map((t) => ({ t: t.id, share: 1 })) } };
  assert.ok(plansOf(s, many, [], 0).redfang!.march.length <= 8);
  assert.deepEqual(plansOf(s, undefined, [], 0), {});
});

test("intel: the war snapshot stays small (under ~2 KB at 62 lands, every land hot, sieges, raids)", () => {
  const s = newWar();
  assert.ok(TERRITORIES.length >= 62);
  s.pressure = s.pressure.map(() => 123.456);
  s.control = s.control.map((_, i) => (i * 37) % 101 + 0.4);
  for (let i = 0; i < 6; i++) s.siege[i * 7] = { by: CLAN_KEYS[i % 5], at: s.tick + WAR.siegeWarnTicks };
  const v = warView(s, Date.now() + WAR.tickMs, [1, 2]), n = JSON.stringify(v).length;
  assert.ok(n < 2048, `${n} bytes`);
});

test("intel: sendPlan and planAll reach sworn heroes only (an empty plan when the clan has none yet)", () => {
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });
  const out: [string, string, unknown][] = [], client = (id: string) => ({ send: (t: string, m: unknown) => { out.push([id, t, m]); } });
  sendPlan(client("u"), {});
  assert.deepEqual(out, [], "unsworn: nothing");
  sendPlan(client("u"), {}, true);
  assert.deepEqual(out.pop(), ["u", "warplan", { tick: 0, march: [] }], "clear: an empty plan");
  planAll([["a", { clan: "redfang" }], ["u", {}]], client);
  assert.deepEqual(out, [["a", "warplan", { tick: 0, march: [] }]], "no orders yet: an empty plan, to the sworn one only");
});
