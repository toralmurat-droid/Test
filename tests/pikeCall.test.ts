// A tethered pike struck from beyond its tether (TROOP_ROLE.pike.call, server/troopRoles.ts pikeCall): it calls its
// nearest squad mates that can answer onto the hero, or sallies when none can; the picks see a called hero from farther.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOB_ATTACK_RANGE, TILE } from "../shared/constants";
import { called } from "../shared/war/troopRoles";
import { TROOP_ROLE, troopWeapon, WAR_TROOPS } from "../shared/war/troops";
import { pikeCall, TroopArrows, type RoleCtx } from "../server/troopRoles";
import { newFighter, type Fighter, type FightGround, type TroopMob, type WarTroopsHost } from "../server/warTroops";

const C = TROOP_ROLE.pike.call, POST = { x: 1000, y: 1000 };
const HOLD = TROOP_ROLE.pike.tetherTiles * TILE + MOB_ATTACK_RANGE + TROOP_ROLE.pike.reach + WAR_TROOPS.heroBody; // (pikeHolds)
const mob = (x: number, y: number, weapon: string, o: Partial<TroopMob> = {}): TroopMob => ({
  kind: "trooper", weapon, level: 20, x, y, homeX: x, homeY: y, dir: "down", hp: 100, maxHp: 100, dead: false, hidden: false, owner: "", target: "", hateId: "", hate: 0, foe: "",
  summonFor: "", qwave: false, servant: false, title: "", tide: false, moving: false, stunned: false, slowed: false, broken: false, winding: false,
  windUntil: 0, lastAttack: 0, stunUntil: 0, slowUntil: 0, ...o,
});

function world() {
  const mobs = new Map<string, TroopMob>(), fighters = new Map<string, Fighter>(), grounds = new Map<string, FightGround>();
  const leash = (x: number, y: number) => Math.hypot(x - POST.x, y - POST.y) <= 12 * TILE;
  const add = (id: string, m: TroopMob, f: Fighter, post = false) => { mobs.set(id, m); fighters.set(id, f); grounds.set(id, { leash, hunt: () => false, ...(post ? { post: () => ({ x: m.homeX, y: m.homeY }) } : {}) }); };
  const h = { mobsInBox: (x: number, y: number, r: number) => [...mobs].filter(([, o]) => Math.abs(o.x - x) <= r && Math.abs(o.y - y) <= r) } as unknown as WarTroopsHost;
  const c: RoleCtx = { h, arrows: new TroopArrows(), walk: () => {}, fighter: (id) => fighters.get(id), ground: (id) => grounds.get(id) };
  return { mobs, fighters, grounds, add, c };
}

test("pike call: the nearest mates of its clan that can answer are called onto a hero beyond its tether; a hero within it calls no one", () => {
  const { add, fighters, grounds, mobs, c } = world(), now = 1_000_000;
  const pf = newFighter("wardens", false, "pike"), pm = mob(POST.x, POST.y, troopWeapon("wardens", false, false, false, false, "pike"));
  add("pike", pm, pf, true);
  add("near", mob(POST.x + 40, POST.y, "wardens"), newFighter("wardens", false));
  add("archer", mob(POST.x - 60, POST.y, troopWeapon("wardens", false, false, false, false, "archer")), newFighter("wardens", false, "archer"));
  add("far", mob(POST.x, POST.y + 120, "wardens"), newFighter("wardens", false));
  add("out", mob(POST.x, POST.y - C.px - 10, "wardens"), newFighter("wardens", false)); // (beyond call.px)
  add("rival", mob(POST.x + 20, POST.y, "redfang"), newFighter("redfang", false));
  add("pike2", mob(POST.x + 10, POST.y + 10, troopWeapon("wardens", false, false, false, false, "pike")), newFighter("wardens", false, "pike"), true);
  add("broken", mob(POST.x + 5, POST.y, "wardens", { broken: true }), newFighter("wardens", false));
  // within its tether: the pike answers itself, no call
  assert.deepEqual(pikeCall(c, pm, "pike", pf, grounds.get("pike")!, "hero", POST.x + HOLD - 5, POST.y, now), []);
  assert.equal(pf.nextCall, 0, "no call: no cooldown");
  // beyond it: the two nearest that can answer (not a rival, a tethered pike, a broken man, one out of call reach)
  const hx = POST.x + HOLD + 40, hy = POST.y;
  assert.equal(C.mates, 2);
  assert.deepEqual(pikeCall(c, pm, "pike", pf, grounds.get("pike")!, "hero", hx, hy, now), ["near", "archer"]);
  for (const id of ["near", "archer"]) {
    const f = fighters.get(id)!;
    assert.ok(called(f, "hero", now) && called(f, "hero", now + C.ms - 1) && !called(f, "hero", now + C.ms), `${id}: called for call.ms`);
    assert.equal(f.nextPick, 0, "it picks on its next turn");
  }
  for (const id of ["far", "out", "rival", "pike2", "broken"]) assert.equal(fighters.get(id)!.call, "", `${id}: not called`);
  assert.equal(pf.call, "", "mates answered: the pike holds its post");
  // at most once per call.everyMs
  assert.deepEqual(pikeCall(c, pm, "pike", pf, grounds.get("pike")!, "hero", hx, hy, now + C.everyMs - 1), []);
  // a mate that may not go where the hero stands (its leash) does not count; with none left, the pike sallies (and a shun on that hero is lifted)
  grounds.get("near")!.leash = () => false; grounds.get("archer")!.leash = () => false; grounds.get("far")!.leash = () => false;
  pf.shun = "hero"; pf.shunUntil = now + 1e6;
  assert.deepEqual(pikeCall(c, pm, "pike", pf, grounds.get("pike")!, "hero", hx, hy, now + C.everyMs), ["pike"]);
  assert.ok(called(pf, "hero", now + C.everyMs), "the pike sallies");
  assert.ok(pf.shunUntil <= now + C.everyMs, "the shun is lifted");
  // a pike with no post (a manhunter's) never calls
  mobs.delete("near");
  const free = newFighter("wardens", false, "pike");
  assert.deepEqual(pikeCall(c, pm, "x", free, { leash: () => true, hunt: () => false }, "hero", hx + 500, hy, now), []);
});

test("pike call: the numbers hold together (a mate's sight reaches a ranged hero beyond a pike's tether)", () => {
  assert.ok(C.sightPx > WAR_TROOPS.aggroPx * 2, "farther than a struck trooper's sight");
  assert.ok(C.sightPx >= 170 + C.px / 2, "a Wizard's reach past the pike, from a mate half the call reach away");
  assert.ok(C.ms > C.everyMs && C.mates >= 1 && C.bonus > 0);
});
