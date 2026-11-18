import { test } from "node:test";
import assert from "node:assert/strict";
import { MOBS, mobScale } from "../shared/constants";
import { CLAN_KEYS } from "../shared/war/clans";
import { garrisonCount, patrolCount, TROOP, TROOP_LOOK, troopLook } from "../shared/war/patrols";
import { bowOf, flightMs, kiteStep, roleVs, shotReady } from "../shared/war/troopRoles";
import {
  CLAN_ROLES, parseTroop, ROLE_MARK, roleOf, TROOP_COMBAT, TROOP_OFFICER, TROOP_ROLE, TROOP_ROLES, TROOP_VETERAN, troopName, troopStats, troopWeapon,
  type TroopPart, type TroopRole,
} from "../shared/war/troops";
import type { HoldTier } from "../shared/war/holdTiers";

test("troop roles: every clan x role x part round-trips through Mob.weapon; old strings are unchanged", () => {
  const parts: TroopPart[] = ["soldier", "officer", "cart", "ram", "mouth"];
  const flags = (p: TroopPart) => [p === "officer", p === "cart", p === "ram", p === "mouth"] as const;
  const MARK = { soldier: "", officer: "*", cart: "^", ram: "#", mouth: "~" };
  for (const k of CLAN_KEYS) for (const part of parts) for (const role of TROOP_ROLES) {
    const w = troopWeapon(k, ...flags(part), role);
    // a role mark only on a plain soldier, one mark at most
    const want = part === "soldier" ? k + ROLE_MARK[role] : k + MARK[part];
    assert.equal(w, want, `${k} ${part} ${role}`);
    const t = parseTroop(w)!;
    assert.equal(t.clan, k); assert.equal(t.part, part);
    assert.equal(t.role ?? "foot", part === "soldier" ? role : "foot", `${w} role`);
    assert.equal(troopWeapon(t.clan, t.officer, t.cart, t.part === "ram", t.part === "mouth", t.role), w, `${w} and back`);
  }
  // the strings of before the roles: same value, same parse (no role key at all)
  for (const k of CLAN_KEYS) {
    assert.equal(troopWeapon(k), k); assert.equal(troopWeapon(k, true), `${k}*`);
    assert.equal(troopWeapon(k, false, true), `${k}^`); assert.equal(troopWeapon(k, false, false, true), `${k}#`); assert.equal(troopWeapon(k, false, false, false, true), `${k}~`);
    assert.deepEqual(parseTroop(k), { clan: k, part: "soldier", officer: false, cart: false, object: false });
    assert.deepEqual(parseTroop(`${k}*`), { clan: k, part: "officer", officer: true, cart: false, object: false });
    assert.deepEqual(parseTroop(`${k}~`), { clan: k, part: "mouth", officer: false, cart: false, object: true });
  }
  assert.equal(troopWeapon("wardens", true, false, false, false, "archer"), "wardens*", "an officer is always foot");
  assert.deepEqual(parseTroop("wardens)"), { clan: "wardens", part: "soldier", officer: false, cart: false, object: false, role: "archer" });
  for (const w of [")", "|", ">", "wardens))", "wardens)*", "wardens*)", "wardens|^", "host^|", "host|#", "veiled)|", "__proto__)", "constructor|", "wardens )"]) assert.equal(parseTroop(w), undefined, w);
});

test("troop roles: roleOf is pure, by place, and keeps the counts", () => {
  // the counts the roles ride on are those of before
  assert.equal(TROOP.perPatrol, 8); assert.equal(patrolCount(100), 8);
  assert.deepEqual(TROOP.garrison.map((g) => [...g]), [[2, 3], [4, 6], [6, 8]]);
  assert.equal(garrisonCount(100, 0), 3); assert.equal(garrisonCount(100, 1), 6); assert.equal(garrisonCount(100, 2), 8);
  // the plan for a clan that fields every role (the Wardens): one rider in a column, one at a fortress
  const plan = (kind: "march" | "guard", tier: HoldTier, n: number) => Array.from({ length: n }, (_, i) => roleOf("wardens", kind, tier, i));
  assert.deepEqual(plan("march", 1, 8), ["foot", "rider", "pike", "pike", "foot", "archer", "foot", "archer"]);
  assert.deepEqual(plan("guard", 0, 3), ["foot", "archer", "pike"]);
  assert.deepEqual(plan("guard", 1, 6), ["foot", "archer", "pike", "archer", "foot", "pike"]);
  assert.deepEqual(plan("guard", 2, 8), ["foot", "archer", "pike", "archer", "pike", "archer", "rider", "foot"]);
  for (const k of CLAN_KEYS) for (const kind of ["march", "guard"] as const) for (const tier of [0, 1, 2] as HoldTier[]) for (let i = 0; i < 12; i++) {
    const r = roleOf(k, kind, tier, i);
    assert.equal(roleOf(k, kind, tier, i), r, "deterministic");
    if (i === 0) assert.equal(r, "foot", "the officer's place is foot");
    assert.ok(r === "foot" || CLAN_ROLES[k][r], `${k} fields ${r}`);
    if (r === "rider") assert.ok(kind === "march" ? i === 1 : tier === 2 && i === 6, `${k} ${kind} ${tier} ${i}: one rider per column and per fortress`);
  }
  // a clan without the role fields foot there
  assert.ok(Array.from({ length: 8 }, (_, i) => roleOf("hidekin", "guard", 2, i)).every((r) => r !== "archer"), "no Hide-Kin archers");
  assert.ok(Array.from({ length: 8 }, (_, i) => roleOf("redfang", "guard", 2, i)).every((r) => r !== "pike"), "no Redfang pikes");
  assert.equal(roleOf("hidekin", "guard", 1, 2), "pike"); assert.equal(roleOf("veiled", "march", 1, 5), "archer");
});

test("troop roles: a foot soldier's numbers are those of before; the roles' follow TROOP_ROLE", () => {
  /** troopStats as it was before the roles. */
  const old = (k: (typeof CLAN_KEYS)[number], level: number, officer: boolean) => {
    const d = MOBS.trooper, c = TROOP_COMBAT[k], o = officer ? TROOP_OFFICER : { hp: 1, dmg: 1 }, V = TROOP_VETERAN, up = Math.max(0, level - V.from);
    return { hp: Math.max(1, Math.round(d.maxHp * mobScale(level, "hp") * c.hp * o.hp * (1 + V.hp * up))),
      dmg: Math.max(1, Math.round(d.damage * mobScale(level, "damage") * c.dmg * o.dmg * (1 + V.dmg * up))),
      speed: d.speed * c.speed, cd: d.attackCooldownMs * c.cd };
  };
  for (const k of CLAN_KEYS) for (let L = 1; L <= 50; L++) for (const off of [false, true]) {
    assert.deepEqual(troopStats(k, L, off), old(k, L, off), `${k} Lv${L} ${off ? "officer" : "soldier"}`);
    assert.deepEqual(troopStats(k, L, off, "foot"), old(k, L, off));
  }
  const f = troopStats("wardens", 30), a = troopStats("wardens", 30, false, "archer"), p = troopStats("wardens", 30, false, "pike");
  assert.ok(Math.abs(a.hp - f.hp * TROOP_ROLE.mult.archer.hp) <= 1 && a.dmg < f.dmg && a.shot! < f.dmg && a.shot! >= a.dmg, "archer: frailer, a weak knife, a bow under a soldier's blow");
  assert.ok(Math.abs(p.hp - f.hp * TROOP_ROLE.mult.pike.hp) <= 1 && p.speed < f.speed && p.dmg === f.dmg, "pike: tougher, slower");
  assert.equal(f.shot, undefined); assert.equal(p.shot, undefined);
});

test("troop roles: every CLAN_ROLES entry has a name (archers a shot), names and looks follow the role", () => {
  for (const k of CLAN_KEYS) for (const [r, e] of Object.entries(CLAN_ROLES[k])) {
    assert.ok(e?.name && e.name.length > 2, `${k} ${r} named`);
    if (r === "archer") { assert.ok(e!.shot && e!.shotSpeed! > 0, `${k} archer shoots`); assert.equal(bowOf(k).shot, e!.shot); }
    assert.ok(TROOP_LOOK[k].roles[r as TroopRole]?.startsWith("war_"), `${k} ${r} art key`);
    assert.equal(troopLook(k, 3, false, r as TroopRole), TROOP_LOOK[k].roles[r as TroopRole]);
  }
  assert.equal(troopName("wardens", false, false, false, false, "archer"), "Warden longbowman");
  assert.equal(troopName("hidekin", false, false, false, false, "pike"), "Hide-Kin burrow-spear");
  assert.equal(troopName("hidekin", false, false, false, false, "archer"), "Hide-Kin soldier", "a role the clan lacks: a soldier");
  assert.equal(troopName("host", true, false, false, false, "pike"), "Ossuary captain");
  assert.equal(troopLook("wardens", 0), TROOP_LOOK.wardens.kinds[0]);
  assert.equal(troopLook("hidekin", 0, false, "archer"), TROOP_LOOK.hidekin.kinds[0], "no sheet for the role: the line soldier");
});

test("troop roles: the shared AI rules (kiteStep, shotReady, roleVs)", () => {
  const R = TROOP_ROLE.ranged;
  assert.equal(kiteStep(R.keepAway - 1), -1); assert.equal(kiteStep(R.keepAway), 0); assert.equal(kiteStep(R.range), 0); assert.equal(kiteStep(R.range + 1), 1);
  const b = { nextShot: 0, aimUntil: 0 };
  assert.equal(shotReady(b, 1000, R.range + 5), false); assert.equal(b.aimUntil, 0, "out of range: no aim");
  assert.equal(shotReady(b, 1000, 100), false); assert.equal(b.aimUntil, 1000 + R.windupMs, "aims");
  assert.equal(shotReady(b, 1000 + R.windupMs - 1, 100), false);
  assert.equal(shotReady(b, 1000 + R.windupMs, 100), true, "looses after the wind-up");
  assert.equal(b.nextShot, 1000 + R.windupMs + R.everyMs);
  assert.equal(shotReady(b, 1000 + R.windupMs + 10, 100), false); assert.equal(b.aimUntil, 0, "then waits for the next");
  assert.equal(roleVs("archer", "pike"), 1.25); assert.equal(roleVs("pike", "rider"), 2); assert.equal(roleVs("rider", "archer"), 1.5);
  for (const a of TROOP_ROLES) assert.equal(roleVs("foot", a), 1, "foot counters nothing");
  assert.equal(roleVs("archer", "foot"), 1); assert.equal(roleVs("pike", "archer"), 1);
  assert.equal(flightMs(230, 230), 1000);
});
