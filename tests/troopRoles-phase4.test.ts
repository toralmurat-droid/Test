// Troop roles phase 4 (pure): tunnel waves, ritual acolytes and town gate guards in their roles by place (ROLE_PLAN.tunnel /
// ritual / gate), a role the clan lacks is foot, the head counts are unchanged; ritual archers stand inside the circle; at a
// town gate the pikes face the road and the archers stand behind them, toward the town, never on town ground.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { RITUAL } from "../shared/war/rituals";
import { gatePosts, gatePx, keepOut, onTownGround, TOWN, TOWNS, type Town } from "../shared/war/towns";
import { gateGuardPosts, ritualPlace } from "../shared/war/troopRoles";
import { CLAN_ROLES, planRole, ROLE_FORM, ROLE_PLAN, squadMod, troopStats, TROOP_ROLE, type RolePlace, type TroopRole } from "../shared/war/troops";
import { TUNNEL } from "../shared/war/tunnels";

const has = (k: ClanKey, r: TroopRole) => r === "foot" || !!CLAN_ROLES[k][r as Exclude<TroopRole, "foot">];

test("troop roles phase 4: tunnel, ritual and gate plans by place; missing roles are foot; the head counts are the modules' own", () => {
  const kinds: [RolePlace, TroopRole[]][] = [["tunnel", ROLE_PLAN.tunnel], ["ritual", ROLE_PLAN.ritual], ["gate", ROLE_PLAN.gate]];
  for (const k of CLAN_KEYS) for (const [kind, plan] of kinds) {
    plan.forEach((r, i) => assert.equal(planRole(k, kind, i), has(k, r) ? r : "foot", `${k} ${kind} ${i}`));
    assert.equal(planRole(k, kind, plan.length + 2), "foot", "past the plan: foot");
  }
  assert.equal(ROLE_PLAN.tunnel.length, TUNNEL.perWave, "one role per place in a wave");
  assert.equal(ROLE_PLAN.ritual.length, RITUAL.acolytes, "one role per acolyte");
  assert.equal(ROLE_PLAN.gate.length, TOWN.captain + TOWN.guards, "one role per gate post");
  assert.equal(gatePosts(TOWNS[0]).length, ROLE_PLAN.gate.length);
  assert.equal(ROLE_PLAN.gate[0], "foot", "the captain's place (an officer never carries a role)");
  // what the clans that hold them field: Hide-Kin tunnels burrow-spears and boar riders; the Veiled circle a sun-caster
  assert.deepEqual([0, 1, 2].map((i) => planRole("hidekin", "tunnel", i)), ["pike", "foot", "rider"]);
  assert.deepEqual([0, 1, 2].map((i) => planRole(RITUAL.clan, "ritual", i)), ["foot", "archer", "rider"]);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => planRole("wardens", "gate", i)), ["foot", "pike", "archer", "pike", "archer"]);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => planRole("hidekin", "gate", i)), ["foot", "pike", "foot", "pike", "foot"], "no archers: foot behind");
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => planRole("redfang", "gate", i)), ["foot", "foot", "archer", "foot", "archer"], "no pikes: foot in front");
});

test("troop roles phase 4: squad multipliers for tunnel waves and gate guards trim role soldiers only", () => {
  for (const kind of ["tunnel", "gate", "ritual"] as RolePlace[]) {
    assert.equal(squadMod(kind, "foot"), undefined, `${kind}: never on foot`);
    const m = squadMod(kind, "pike");
    assert.deepEqual(m, TROOP_ROLE.squad[kind]);
    if (m) assert.equal(troopStats("wardens", 30, false, "pike", m).hp, troopStats("wardens", 30, false, "pike", { hp: m.hp, dmg: 1 }).hp);
  }
  const m = squadMod("tunnel", "rider")!;
  assert.ok(m.hp <= 1 && m.dmg <= 1, "a tunnel wave's riders and pikes are trimmed (a lone hero's fight)");
  assert.ok(troopStats("hidekin", 30, false, "rider", m).hp < troopStats("hidekin", 30, false, "rider").hp);
});

test("troop roles phase 4: a ritual's archers stand inside the circle, the others on it; blocked spots fall back", () => {
  const cx = 5000, cy = 7000;
  for (const k of CLAN_KEYS) for (let i = 0; i < RITUAL.acolytes; i++) {
    const p = ritualPlace(k, i, cx, cy, () => true), d = Math.hypot(p.x - cx, p.y - cy);
    assert.equal(p.role, planRole(k, "ritual", i));
    assert.ok(Math.abs(d - (p.role === "archer" ? RITUAL.postPx - ROLE_FORM.archerBack : RITUAL.postPx)) < 0.01, `${k} ${i} ${p.role}: ${d.toFixed(1)} px from the centre`);
  }
  const a = ROLE_PLAN.ritual.findIndex((r, i) => planRole(RITUAL.clan, "ritual", i) === "archer" && r === "archer");
  assert.ok(a >= 0, "the Veiled circle has an archer");
  const plain = ritualPlace(RITUAL.clan, a, cx, cy, (x, y) => Math.hypot(x - cx, y - cy) > RITUAL.postPx - 1);
  assert.ok(Math.abs(Math.hypot(plain.x - cx, plain.y - cy) - RITUAL.postPx) < 0.01, "the inner spot blocked: on the circle");
  const mid = ritualPlace(RITUAL.clan, a, cx, cy, () => false);
  assert.deepEqual([mid.x, mid.y], [cx, cy], "the circle spot blocked: the centre, as before");
});

/** How far toward the town (px) a spot stands from the gate. */
function inward(t: Town, p: { x: number; y: number }): number {
  const g = gatePx(t), r = keepOut(t)!, tx = ((r.x0 + r.x1) / 2) * 32 - g.x, ty = ((r.y0 + r.y1) / 2) * 32 - g.y, l = Math.hypot(tx, ty);
  return ((p.x - g.x) * tx + (p.y - g.y) * ty) / l;
}

test("troop roles phase 4: at a town gate the captain holds the gate, pikes face the road, archers stand behind them, off town ground", () => {
  for (const t of TOWNS) for (const k of CLAN_KEYS) {
    const posts = gateGuardPosts(t, k), plain = gatePosts(t), roles = posts.map((_, i) => (i === 0 ? "foot" : planRole(k, "gate", i)));
    assert.equal(posts.length, plain.length, "the same head count");
    assert.deepEqual(posts[0], plain[0], "the captain on the gate");
    for (const p of posts) assert.ok(!onTownGround(p.x, p.y), `${t.id} ${k}: never on town ground`);
    const pikes = posts.filter((_, i) => roles[i] === "pike"), archers = posts.filter((_, i) => roles[i] === "archer");
    for (const pk of pikes) for (const ar of archers) assert.ok(inward(t, ar) > inward(t, pk), `${t.id} ${k}: an archer behind each pike`);
    if (roles.every((r) => r === "foot")) assert.deepEqual(posts, plain, "an all-foot guard keeps the plain ring");
    // the ring spots are handed out, not moved (an archer a step further back)
    for (let i = 1; i < posts.length; i++) {
      const near = Math.min(...plain.slice(1).map((q) => Math.hypot(q.x - posts[i].x, q.y - posts[i].y)));
      assert.ok(near < (roles[i] === "archer" ? ROLE_FORM.archerBack + 0.01 : 0.01), `${t.id} ${k} ${i}: on (or a step back from) a ring spot`);
    }
    assert.equal(new Set(posts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)).size, posts.length, "no two guards on one spot");
  }
  // a blocked step back keeps the plain ring spot
  const t = TOWNS[0], ring = gatePosts(t).slice(1), held = gateGuardPosts(t, "wardens", () => false);
  for (let i = 1; i < held.length; i++) assert.ok(ring.some((q) => q.x === held[i].x && q.y === held[i].y));
});
