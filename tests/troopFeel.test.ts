// Murat 2026-11-20: clan battles should feel energetic and dense, troops never stuck, the action readable. A soldier
// locked in melee keeps its foe, soldiers of a side pair off along the front instead of piling onto one man, and a
// soldier blocked by a tree or a rock steers round it (server/warTroops.ts, WAR_TROOPS.lockPx / gangPen / unstick).
import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE } from "../shared/constants";
import { isSolidAt } from "../shared/map";
import { blocked } from "../shared/movement";
import { newMinds } from "../shared/war/doctrine";
import { newWar } from "../shared/war/rules";
import { troopWeapon } from "../shared/war/troops";
import { _resetWar } from "../server/war";
import { newFighter, WarTroops, type FightGround, type TroopHero, type TroopMob } from "../server/warTroops";

function mob(x: number, y: number, weapon: string): TroopMob {
  return { kind: "trooper", weapon, level: 20, x, y, homeX: x, homeY: y, dir: "down", hp: 1e6, maxHp: 1e6, dead: false, hidden: false, owner: "", target: "",
    hateId: "", hate: 0, foe: "", summonFor: "", qwave: false, servant: false, title: "", tide: false, moving: false, stunned: false, slowed: false, broken: false,
    winding: false, windUntil: 0, lastAttack: 0, stunUntil: 0, slowUntil: 0 };
}
function fake() {
  const mobs = new Map<string, TroopMob>(), heroes = new Map<string, TroopHero>();
  const wt = new WarTroops({
    spawn: () => undefined, remove: (id) => { mobs.delete(id); }, mob: (id) => mobs.get(id),
    mobsInBox: (x, y, r) => [...mobs].filter(([, m]) => Math.abs(m.x - x) <= r && Math.abs(m.y - y) <= r),
    heroes: () => heroes.entries(), hero: (id) => heroes.get(id), hidden: () => false,
    strikeHero: () => {}, strikeMob: () => {}, shoot: () => {}, ranked: () => {},
  });
  return { wt, mobs, heroes };
}
const G: FightGround = { leash: () => true, hunt: () => false };

/** An open spot on the map: a 9x5-tile box with nothing solid (lock and gang tests stand there). */
function openSpot(): { x: number; y: number } {
  for (let ty = 20; ty < 1200; ty += 3) for (let tx = 20; tx < 1200; tx += 3) {
    let ok = true;
    for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -4; dx <= 4 && ok; dx++) if (isSolidAt((tx + dx + 0.5) * TILE, (ty + dy + 0.5) * TILE)) ok = false;
    if (ok) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }
  throw new Error("no open spot");
}

test("troop feel: a soldier locked in melee keeps its foe though a nearer one turns up; free again, it takes the nearer", () => {
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });
  const { wt, mobs, heroes } = fake(), o = openSpot();
  heroes.set("watcher", { name: "W", level: 30, x: o.x, y: o.y + 3 * TILE, dead: false, renown: 0 });
  const a = mob(o.x, o.y, troopWeapon("wardens")), b = mob(o.x + 20, o.y, troopWeapon("redfang")), c = mob(o.x - 12, o.y, troopWeapon("redfang"));
  mobs.set("a", a); mobs.set("b", b); mobs.set("c", c);
  const f = newFighter("wardens", false);
  a.target = "b";
  wt.think(a, "a", f, G, 1000);
  assert.equal(a.target, "b", "at arm's length: it keeps its foe");
  b.x = o.x + 120; f.nextPick = 0; a.windUntil = 2000;
  wt.think(a, "a", f, G, 1500);
  assert.equal(a.target, "b", "a blow under way: it keeps its foe");
  a.windUntil = 0; f.nextPick = 0;
  wt.think(a, "a", f, G, 2500);
  assert.equal(a.target, "c", "free again: the nearer foe");
});

test("troop feel: soldiers of a side pair off: a foe already taken by mates loses to a free one a little farther", () => {
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });
  const { wt, mobs, heroes } = fake(), o = openSpot();
  heroes.set("watcher", { name: "W", level: 30, x: o.x, y: o.y + 3 * TILE, dead: false, renown: 0 });
  mobs.set("taken", mob(o.x + 60, o.y, troopWeapon("redfang")));
  mobs.set("free", mob(o.x + 70, o.y + 10, troopWeapon("redfang")));
  for (let i = 0; i < 3; i++) { const m = mob(o.x + 40, o.y - 20 + i * 20, troopWeapon("wardens")); m.target = "taken"; mobs.set(`mate${i}`, m); }
  const a = mob(o.x, o.y, troopWeapon("wardens")); mobs.set("a", a);
  wt.think(a, "a", newFighter("wardens", false), G, 1000);
  assert.equal(a.target, "free");
  for (let i = 0; i < 3; i++) mobs.get(`mate${i}`)!.target = "";
  a.target = "";
  wt.think(a, "a", newFighter("wardens", false), G, 1000);
  assert.equal(a.target, "taken", "with nobody on it, the nearer foe");
});

test("troop feel: a soldier walking into a lone rock or tree steers round it and gets where it goes", () => {
  // a solid tile with open ground for 3 tiles each side and 2 above and below
  let spot: { x: number; y: number } | undefined;
  for (let ty = 20; ty < 1200 && !spot; ty++) for (let tx = 20; tx < 1200 && !spot; tx++) {
    if (!isSolidAt((tx + 0.5) * TILE, (ty + 0.5) * TILE)) continue;
    let ok = true;
    for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -3; dx <= 3 && ok; dx++) if ((dx || dy) && isSolidAt((tx + dx + 0.5) * TILE, (ty + dy + 0.5) * TILE)) ok = false;
    if (ok) spot = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }
  assert.ok(spot, "a lone solid tile on the map");
  const { wt } = fake(), from = { x: spot!.x - 2.5 * TILE, y: spot!.y }, to = { x: spot!.x + 2.5 * TILE, y: spot!.y };
  assert.ok(!blocked(from.x, from.y) && !blocked(to.x, to.y));
  const m = mob(from.x, from.y, troopWeapon("wardens"));
  let t = 1000;
  for (let i = 0; i < 60 && Math.hypot(m.x - to.x, m.y - to.y) > 4; i++, t += 50) wt.walk(m, to.x, to.y, 0.05, 80, t);
  assert.ok(Math.hypot(m.x - to.x, m.y - to.y) <= 4, `it got round (at ${Math.round(m.x - spot!.x)}, ${Math.round(m.y - spot!.y)} from the rock)`);
});
