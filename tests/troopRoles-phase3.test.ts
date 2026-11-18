import { test } from "node:test";
import assert from "node:assert/strict";
import { CLASSES } from "../shared/classes";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { BATTLE, battleLine } from "../shared/war/battles";
import { newMinds } from "../shared/war/doctrine";
import { newWar, WAR } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { battleField, type BattleSite } from "../shared/war/battles";
import { battleRole, bowRange, giveUpStep, rolePlace, shunned, type GiveUp } from "../shared/war/troopRoles";
import { CLAN_ROLES, fieldRole, planRole, squadMod, troopStats, ROLE_FORM, ROLE_PLAN, roleOf, TROOP_ROLE, troopWeapon, type RolePlace, type TroopRole } from "../shared/war/troops";
import { _forceBattle, _resetWar, battleClock } from "../server/war";
import { TroopArrows } from "../server/troopRoles";
import { WarBattles, type BattleHost } from "../server/warBattles";
import type { TroopHero, TroopMob, WarTroopsHost } from "../server/warTroops";

const has = (k: ClanKey, r: TroopRole) => r === "foot" || !!CLAN_ROLES[k][r as Exclude<TroopRole, "foot">];

test("troop roles phase 3: each module's plan by place, a role the clan lacks is foot, the head counts are the plans' lengths", () => {
  const kinds: [RolePlace, TroopRole[]][] = [["column", ROLE_PLAN.column], ["siegeAtk", ROLE_PLAN.siege.atk], ["siegeDef", ROLE_PLAN.siege.def], ["ram", ROLE_PLAN.ram], ["escort", ROLE_PLAN.escort], ["hunt", ROLE_PLAN.hunt]];
  for (const k of CLAN_KEYS) for (const [kind, plan] of kinds) {
    plan.forEach((r, i) => assert.equal(planRole(k, kind, i), has(k, r) ? r : "foot", `${k} ${kind} ${i}`));
    assert.equal(planRole(k, kind, plan.length + 3), "foot", "past the plan: foot");
  }
  assert.equal(planRole("hidekin", "siegeAtk", 1), "foot", "the Hide-Kin field no archers");
  assert.equal(planRole("redfang", "ram", 0), "foot", "Redfang fields no pikes");
  assert.equal(planRole("host", "ram", 0), "pike", "the Host's ram crew are pikes");
  assert.equal(planRole("wardens", "escort", 0), "rider", "a rider ahead of the cart");
  assert.deepEqual(ROLE_PLAN.column, ROLE_PLAN.march, "a war road column is planned as the patrol column");
  // the officer's places plan foot: the gate front's place 0, the column's, the squad's
  for (const plan of [ROLE_PLAN.column, ROLE_PLAN.siege.atk, ROLE_PLAN.siege.def, ROLE_PLAN.hunt]) assert.equal(plan[0], "foot");
  // the variety: every clan fields at least two roles across the modules, the riders everywhere they are planned
  for (const k of CLAN_KEYS) {
    const seen = new Set(kinds.flatMap(([kind, plan]) => plan.map((_, i) => planRole(k, kind, i))));
    assert.ok(seen.has("rider") && seen.size >= 3, `${k}: ${[...seen].join(", ")}`);
  }
});

test("troop roles phase 3: fieldRole and roleOf (patrols and guards as before: place 0 foot, missing roles foot, riders only when fielded)", () => {
  for (const k of CLAN_KEYS) {
    for (const r of ["foot", "archer", "pike", "rider"] as TroopRole[]) assert.equal(fieldRole(k, r), has(k, r) ? r : "foot");
    ROLE_PLAN.march.forEach((r, i) => assert.equal(roleOf(k, "march", 1, i), i === 0 || !has(k, r) ? "foot" : r));
    for (const tier of [0, 1, 2] as const) ROLE_PLAN.guard[tier].forEach((r, i) => assert.equal(roleOf(k, "guard", tier, i), i === 0 || !has(k, r) ? "foot" : r));
  }
  const was = TROOP_ROLE.rider.fielded;
  try {
    TROOP_ROLE.rider.fielded = false;
    assert.equal(planRole("wardens", "escort", 0), "foot", "riders not fielded: foot in their place");
    assert.equal(battleRole("wardens", BATTLE.captains), "foot");
  } finally { TROOP_ROLE.rider.fielded = was; }
});

test("troop roles phase 3: a field battle's lines: captains foot, riders on the front line's wings, foot and pikes in front, archers behind", () => {
  const per = Math.ceil(BATTLE.perSide / 2);
  for (const k of CLAN_KEYS) {
    const count: Record<string, Record<TroopRole, number>> = { front: { foot: 0, archer: 0, pike: 0, rider: 0 }, rear: { foot: 0, archer: 0, pike: 0, rider: 0 } };
    for (let i = 0; i < BATTLE.perSide; i++) {
      const L = battleLine(i), r = battleRole(k, i);
      assert.ok(has(k, r), `${k} ${i}: ${r} is a role it fields`);
      if (L.captain) { assert.equal(r, "foot", "a captain is foot"); continue; }
      count[L.line ? "rear" : "front"][r]++;
      const n = Math.round(L.k + (per - 1) / 2);
      if (L.line === 0 && (n < ROLE_PLAN.battle.wings || n >= per - ROLE_PLAN.battle.wings)) assert.equal(r, fieldRole(k, "rider"), "the wings ride");
    }
    assert.equal(count.front.archer, 0, `${k}: no archers in the front line`);
    assert.equal(count.rear.rider + count.rear.pike, 0, `${k}: the rear line is archers and foot`);
    assert.equal(count.front.rider, 2 * ROLE_PLAN.battle.wings, `${k}: ${ROLE_PLAN.battle.wings} riders on each wing`);
    if (CLAN_ROLES[k].archer) assert.ok(count.rear.archer > count.rear.foot, `${k}: mostly archers behind`);
    if (CLAN_ROLES[k].pike) assert.ok(count.front.pike >= 10, `${k}: pikes in the front line`);
    const total = Object.values(count.front).reduce((a, b) => a + b, 0) + Object.values(count.rear).reduce((a, b) => a + b, 0);
    assert.equal(total + BATTLE.captains, BATTLE.perSide, "the head count is unchanged");
  }
  // battleLine is the lines' old index maths
  for (let i = 0; i < BATTLE.perSide; i++) {
    const L = battleLine(i), C = BATTLE.captains;
    assert.equal(L.line, i < C ? 1 : Math.floor((i - C) / per) % 2);
    assert.equal(L.k, i < C ? (i ? 2 : -2) : ((i - C) % per) - (per - 1) / 2);
  }
});

test("troop roles phase 3: the squads' multipliers (TROOP_ROLE.squad) scale role soldiers' HP, damage and shot, never foot", () => {
  for (const kind of ["column", "escort", "hunt", "ram"] as RolePlace[]) {
    const q = TROOP_ROLE.squad[kind]!;
    assert.ok(q && q.hp > 0 && q.hp <= 1 && q.dmg > 0 && q.dmg <= 1, `${kind}: a modest cut`);
    assert.equal(squadMod(kind, "foot"), undefined, "foot: none");
    assert.equal(squadMod(kind, "archer"), q);
  }
  assert.equal(squadMod("siegeAtk", "rider"), undefined, "sieges fight at full strength");
  const q = { hp: 0.5, dmg: 0.5 }, L = 30;
  assert.deepEqual(troopStats("wardens", L, false, "foot", q), troopStats("wardens", L, false, "foot"), "never on foot");
  const a = troopStats("wardens", L, false, "archer"), b = troopStats("wardens", L, false, "archer", q);
  assert.ok(Math.abs(b.hp - a.hp / 2) <= 1 && Math.abs(b.dmg - a.dmg / 2) <= 1 && Math.abs(b.shot! - a.shot! / 2) <= 1 && b.speed === a.speed);
});

test("troop roles phase 3: rolePlace puts an archer behind its place and a rider out on its flank; foot and pikes stay", () => {
  assert.deepEqual(rolePlace("foot", 100, 100, [1, 0], [0, 1]), { x: 100, y: 100 });
  assert.deepEqual(rolePlace("pike", 100, 100, [1, 0], [0, 1]), { x: 100, y: 100 });
  assert.deepEqual(rolePlace("archer", 100, 100, [1, 0], [0, 1]), { x: 100 + ROLE_FORM.archerBack, y: 100 });
  assert.deepEqual(rolePlace("rider", 100, 100, [1, 0], [0, -1]), { x: 100, y: 100 - ROLE_FORM.riderWide });
});

test("troop roles phase 3: the give-up rule drops a target out of reach for giveUp.ms and shuns it for shunMs; back in reach or a new target starts over", () => {
  const G = TROOP_ROLE.giveUp, f: GiveUp = { outOf: "", outSince: 0, shun: "", shunUntil: 0 }, t0 = 1_000_000;
  assert.equal(giveUpStep(f, "h", true, t0), false);
  assert.equal(giveUpStep(f, "h", true, t0 + G.ms - 1), false, "not yet");
  assert.equal(giveUpStep(f, "h", false, t0 + G.ms - 1), false, "back in reach: the clock stops");
  assert.equal(giveUpStep(f, "h", true, t0 + G.ms), false, "out again: it starts over");
  assert.equal(giveUpStep(f, "x", true, t0 + G.ms + 10), false, "a new target: it starts over");
  assert.equal(giveUpStep(f, "x", true, t0 + 2 * G.ms + 9), false);
  assert.equal(giveUpStep(f, "x", true, t0 + 2 * G.ms + 10), true, "out for giveUp.ms straight: dropped");
  assert.ok(shunned(f, "x", t0 + 2 * G.ms + 10) && shunned(f, "x", t0 + 2 * G.ms + 9 + G.shunMs), "and shunned for shunMs");
  assert.ok(!shunned(f, "x", t0 + 2 * G.ms + 10 + G.shunMs) && !shunned(f, "h", t0 + 2 * G.ms + 10), "then no more; nor anyone else");
  assert.ok(!shunned(f, "", t0));
});

test("troop roles phase 3: a courtyard archer's bow outranges every active ranged hero's basic shot", () => {
  const W = bowRange(true), R = bowRange(false);
  assert.equal(R.range, TROOP_ROLE.ranged.range, "the plain archer's bow as before");
  assert.ok(W.range > R.range && W.sightPx > W.range && W.sightPx >= R.sightPx);
  for (const c of ["wizard", "summoner", "songweaver"] as const) {
    const pr = CLASSES[c].projectile?.range ?? 0;
    assert.ok(W.range > pr, `${c} ${pr} px < wall bow ${W.range} px`);
  }
});

test("archer shots: a shot in flight at a monster or trooper is lost when its archer falls before it lands", () => {
  const mobs = new Map<string, Partial<TroopMob>>([["a", { dead: false, x: 0, y: 0 }], ["b", { dead: false, x: 0, y: 0 }], ["t", { dead: false, hidden: false, x: 900 * 32, y: 900 * 32 }]]);
  const hits: string[] = [];
  const h = { mob: (id: string) => mobs.get(id), strikeMob: (from: string, to: string) => { hits.push(`${from}>${to}`); } } as unknown as WarTroopsHost;
  const q = new TroopArrows(), now = 5000;
  q.add("a", "t", 5, now); q.add("b", "t", 5, now); q.add("gone", "t", 5, now); q.add("a", "t", 5, now + 100);
  mobs.get("b")!.dead = true; // (fell mid-flight; "gone" was already removed)
  q.fly(h, now);
  assert.deepEqual(hits, ["a>t"], "only the living archer's shot lands");
  assert.equal(q.size, 1, "the later one still flies");
});

// ---- a field battle's live lines (a fake room, as in tests/warbattles-room.test.ts) ----

const SITE: BattleSite = (() => {
  const s = newWar();
  for (const T of TERRITORIES) {
    if (T.capitalOf) continue;
    for (const n of T.near) if (s.owner[n] !== s.owner[T.id] && battleField(n, T.id)) return { t: T.id, from: n, a: s.owner[n], b: s.owner[T.id] };
  }
  throw new Error("no battle site");
})();
const FIELD = battleField(SITE.from, SITE.t)!;

test("battles (fake room): every place stands in its role (weapon mark, fighter, HP); archers behind the front line", () => {
  const now = Date.now();
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: now + WAR.tickMs, log: [] });
  const b = _forceBattle(SITE, "pitched", now - 1000, FIELD.x, FIELD.y)!;
  battleClock(now);
  const mobs = new Map<string, TroopMob>(), heroes = new Map<string, TroopHero>([["h", { name: "H", clan: undefined, level: 30, x: FIELD.x, y: FIELD.y, dead: false, renown: 0 }]]);
  const host: BattleHost = {
    spawn: (id, level, x, y, weapon) => { const m = { kind: "trooper", weapon, level, x, y, homeX: x, homeY: y, dir: "down", hp: 1, maxHp: 1, dead: false, title: "" } as unknown as TroopMob; mobs.set(id, m); return m; },
    remove: (id) => { mobs.delete(id); }, mob: (id) => mobs.get(id), heroes: () => heroes.entries(), hero: (id) => heroes.get(id),
    broadcast: () => {}, tell: () => {}, ranked: () => {}, pay: () => {},
  };
  const wb = new WarBattles(host, {} as any);
  wb.tick(now);
  const l = wb._live()!;
  assert.ok(l, "the battle wakes");
  let n = 0;
  for (const side of [0, 1] as const) {
    const clan = side ? b.b : b.a, ax = l.ax, sgn = side ? 1 : -1;
    const depth = (q: { x: number; y: number }) => (q.x - l.c.x) * ax.x * sgn + (q.y - l.c.y) * ax.y * sgn; // (from the field's middle toward this side's rear)
    l.places[side].forEach((p: any, i: number) => {
      const want = battleRole(clan, i);
      assert.equal(p.f.role, want, `side ${side} place ${i}`);
      assert.equal(!!p.g, want !== "foot", "a role soldier has its own ground (its place: a pike's tether)");
      if (!p.id) return;
      n++;
      const m = mobs.get(p.id)!;
      assert.equal(m.weapon, troopWeapon(clan, p.captain, false, false, false, want));
    });
    // an archer stands behind the front line's foot (where the ground lets it)
    const front = l.places[side].map((p: any, i: number) => ({ p, i, L: battleLine(i) })).filter((x: any) => x.p.f.role === "foot" && !x.L.captain && x.L.line === 0);
    const arch = l.places[side].map((p: any, i: number) => ({ p, i })).filter((x: any) => x.p.f.role === "archer");
    if (arch.length && front.length) {
      const fd = Math.max(...front.map((x: any) => depth((wb as any).postOf(l, side, x.i))));
      const placed = arch.map((x: any) => depth((wb as any).postOf(l, side, x.i))).filter((d: number) => Math.abs(d) > 1); // (a place on blocked ground falls back to the field's middle, as before the roles)
      assert.ok(placed.length > 0 && placed.every((d: number) => d > fd + ROLE_FORM.archerBack), `${clan}: archers behind the front line (${placed.map(Math.round).join(" ")} vs ${Math.round(fd)})`);
    }
  }
  assert.ok(n > 0, "men fielded");
});
