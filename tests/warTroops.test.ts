import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE } from "../shared/constants";
import { isSafeZone, SAFE_ZONE } from "../shared/map";
import { blocked } from "../shared/movement";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { garrisonCount, garrisonSpots, patrolCount, patrolOf, TROOP, TROOP_LOOK, troopLook } from "../shared/war/patrols";
import { atWar, _resetWarRelations, setWarRelations } from "../shared/war/feuds";
import { newWar, targetsOf } from "../shared/war/rules";
import { STANDARD } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { parseTroop, troopLevel, troopName, troopStance, troopWeapon, WAR_TROOPS } from "../shared/war/troops";
import { _resetWar, warState } from "../server/war";
import { holdGuards } from "../shared/war/intel";
import { holdTier } from "../shared/war/holdTiers";
import { WarTroops, type TroopHero, type TroopMob } from "../server/warTroops";

test("troops: the clan and part ride in Mob.weapon and round-trip; nothing else parses as a trooper", () => {
  for (const k of CLAN_KEYS) {
    const parts = [
      { w: troopWeapon(k), part: "soldier", mark: "" }, { w: troopWeapon(k, true), part: "officer", mark: "*" },
      { w: troopWeapon(k, false, true), part: "cart", mark: "^" }, { w: troopWeapon(k, false, false, true), part: "ram", mark: "#" },
    ] as const;
    for (const { w, part, mark } of parts) {
      assert.equal(w, `${k}${mark}`, `${k} ${part}`);
      assert.deepEqual(parseTroop(w), { clan: k, part, officer: part === "officer", cart: part === "cart", object: part === "cart" || part === "ram" });
      const t = parseTroop(w)!;
      assert.equal(troopWeapon(t.clan, t.officer, t.cart, t.part === "ram"), w, "and back");
    }
  }
  assert.equal(troopName("host", false, false, true), "Ossuary Host bone ram");
  assert.equal(troopName("redfang", false, true), "Redfang supply cart");
  for (const w of ["", "folk", "sword", "*", "^", "#", "__proto__", "constructor*", "constructor^", "constructor#", "wardens**", "wardens^^", "wardens^*", "wardens*^", "host##", "host#*", "host^#", 5, undefined]) assert.equal(parseTroop(w), undefined, String(w));
});

test("troops: stance table (own clan, a clan at war, a clan at peace, unsworn, under the oath level)", () => {
  const L = STANDARD.minLevel;
  setWarRelations(newWar().owner, 0); // the opening map: Redfang border the Wardens; the Wardens and the Veiled share no front (shared/war/feuds.ts)
  try {
    assert.equal(troopStance("redfang", { clan: "redfang", level: 20 }), "ally");
    assert.equal(troopStance("redfang", { clan: "wardens", level: 20 }), "enemy", "sworn to a clan at war with them");
    assert.equal(troopStance("wardens", { clan: "veiled", level: 20 }), "neutral", "since feuds: a clan they don't border leaves its heroes alone");
    assert.equal(troopStance("redfang", { level: 20 }), "neutral");
    assert.equal(troopStance("redfang", { level: L - 1 }), "neutral", "newcomers are left alone");
    assert.equal(troopStance("redfang", { clan: "wardens", level: L - 1 }), "neutral");
  } finally { _resetWarRelations(); }
});

test("troops: levels stay inside the land's monster band, officers at the top", () => {
  for (const t of TERRITORIES) {
    const s = troopLevel(t.id), o = troopLevel(t.id, true);
    assert.ok(s >= Math.max(1, t.levels[0]) && s <= t.levels[1], `${t.name} soldier ${s}`);
    assert.equal(o, t.levels[1], `${t.name} officer`);
  }
});

test("troops: troopLook is the client's TROOP_LOOK rule", () => {
  for (const k of CLAN_KEYS) {
    assert.equal(troopLook(k, 0, true), TROOP_LOOK[k].officer);
    for (let i = 0; i < 6; i++) assert.equal(troopLook(k, i), TROOP_LOOK[k].kinds[i % TROOP_LOOK[k].kinds.length]);
  }
});

// ---- WarTroops with a fake room --------------------------------------------------------------------------------------

function mob(id: string, x: number, y: number, level: number, weapon: string): TroopMob {
  return { kind: "trooper", weapon, level, x, y, homeX: x, homeY: y, dir: "down", hp: 100, maxHp: 100, dead: false, hidden: false, owner: "", target: "",
    hateId: "", hate: 0, foe: "", summonFor: "", qwave: false, servant: false, title: "", tide: false, moving: false, stunned: false, slowed: false, broken: false,
    winding: false, windUntil: 0, lastAttack: 0, stunUntil: 0, slowUntil: 0 };
}
function fake() {
  const mobs = new Map<string, TroopMob>(), heroes = new Map<string, TroopHero>(), hits: [string, string, number][] = [];
  const wt = new WarTroops({
    spawn: (id, level, x, y, weapon) => { const m = mob(id, x, y, level, weapon); mobs.set(id, m); return m; },
    remove: (id) => { mobs.delete(id); },
    mob: (id) => mobs.get(id), mobsInBox: (x, y, r) => [...mobs].filter(([, m]) => Math.abs(m.x - x) <= r && Math.abs(m.y - y) <= r),
    heroes: () => heroes.entries(), hero: (id) => heroes.get(id), hidden: () => false,
    strikeHero: (mid, pid, dmg) => { hits.push([mid, pid, dmg]); },
    strikeMob: (mid, tid, dmg) => { hits.push([mid, tid, dmg]); }, shoot: (mid, _k, _x, _y, dmg) => { hits.push([mid, "javelin", dmg]); },
    ranked: () => {},
  });
  return { wt, mobs, heroes, hits };
}
const hero = (x: number, y: number, o: Partial<TroopHero> = {}): TroopHero => ({ name: "H" + Math.random(), level: 30, x, y, dead: false, renown: 0, ...o });
/** A land with a patrol far from both safe squares (its neighbours may wake too). */
const LAND = TERRITORIES.find((t) => patrolOf(t.id) && t.act === 1 && !t.capitalOf && Math.hypot(t.cx - (SAFE_ZONE.x + SAFE_ZONE.w / 2), t.cy - (SAFE_ZONE.y + SAFE_ZONE.h / 2)) > 60)!;
const troopsOf = (mobs: Map<string, TroopMob>, t: number, wt: WarTroops) => (wt._land(t)?.slots ?? []).filter((s) => s.id && mobs.has(s.id)).map((s) => mobs.get(s.id)!);

test("WarTroops: a land wakes near a hero with its column and guards, sleeps sleepMs after the hero left", () => {
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });
  const { wt, mobs, heroes } = fake(), gate = patrolOf(LAND.id)!.pts[0], t0 = 1_000_000;
  heroes.set("a", hero(gate.x, gate.y));
  wt.tick(t0);
  const want = patrolCount(100) + holdGuards(LAND.id, 100, holdTier(warState()!, LAND.id)); // (W3: a fresh Hold is an outpost)
  const mine = troopsOf(mobs, LAND.id, wt);
  assert.equal(mine.length, want, "full strength at control 100");
  assert.ok(mine.every((m) => parseTroop(m.weapon)?.clan === warState()!.owner[LAND.id]), "the holder's men");
  assert.equal(mine.filter((m) => parseTroop(m.weapon)!.officer).length, 2, "one officer leads the column, one the guards");
  assert.ok(wt.count <= WAR_TROOPS.maxTroops);
  heroes.get("a")!.y = 1e7; // gone far away (off every land)
  wt.tick(t0 + WAR_TROOPS.sleepMs - 1000);
  assert.equal(troopsOf(mobs, LAND.id, wt).length, want, "still there for a while");
  wt.tick(t0 + WAR_TROOPS.sleepMs + 1000);
  assert.equal(wt.count, 0, "every land asleep");
  assert.equal(mobs.size, 0, "their monsters are gone");
});

test("WarTroops: lower control fields fewer men, a siege leaves only the guards, the room cap holds", () => {
  const s = newWar();
  s.control[LAND.id] = 0;
  _resetWar({ v: 1, state: s, minds: newMinds(), next: Date.now() + 1e9, log: [] });
  const { wt, mobs, heroes } = fake(), gate = patrolOf(LAND.id)!.pts[0];
  heroes.set("a", hero(gate.x, gate.y));
  wt.tick(1000);
  const guards = holdGuards(LAND.id, 0, holdTier(s, LAND.id));
  assert.equal(troopsOf(mobs, LAND.id, wt).length, patrolCount(0) + guards);
  s.siege[LAND.id] = { by: CLAN_KEYS.find((k) => k !== s.owner[LAND.id])!, at: s.tick + 3 };
  wt.tick(2000);
  assert.equal(troopsOf(mobs, LAND.id, wt).length, guards, "besieged: guards only");
  const cap = WAR_TROOPS.maxTroops;
  try {
    WAR_TROOPS.maxTroops = 3;
    wt.tick(3000);
    assert.ok(wt.count <= 3, `cap ${wt.count}`);
  } finally { WAR_TROOPS.maxTroops = cap; }
});

test("WarTroops: kill valor goes to sworn heroes of a clan at war in the land (officers count double), capped per hero per war tick", () => {
  const s = newWar();
  _resetWar({ v: 1, state: s, minds: newMinds(), next: Date.now() + 1e9, log: [] });
  const { wt, mobs, heroes } = fake(), gate = patrolOf(LAND.id)!.pts[0], owner = s.owner[LAND.id];
  const foe = CLAN_KEYS.find((k) => k !== owner && atWar(k, owner) && targetsOf(s, k).includes(LAND.id))!, calm = CLAN_KEYS.find((k) => k !== owner && !atWar(k, owner));
  assert.ok(foe, "a clan at war that may attack the land");
  const at = { x: (LAND.x + LAND.w / 2) * TILE, y: (LAND.y + LAND.h / 2) * TILE };
  heroes.set("a", hero(at.x, at.y, { clan: foe }));
  heroes.set("own", hero(at.x, at.y, { clan: owner }));
  heroes.set("free", hero(at.x, at.y));
  if (calm) heroes.set("calm", hero(at.x, at.y, { clan: calm }));
  heroes.set("gate", hero(gate.x, gate.y));
  wt.tick(1000);
  const P = WAR_TROOPS.killPts, respawn = WAR_TROOPS.respawnMs;
  let pts = 0, now = Date.now() + 1000; // (killed() stamps the fall with the wall clock)
  const kill = (by: string) => { // (the fallen come straight back: the land holds fewer men than the test kills)
    for (const [id, m] of mobs) if (m.dead) mobs.delete(id);
    WAR_TROOPS.respawnMs = 0; try { wt.tick(now += 10); } finally { WAR_TROOPS.respawnMs = respawn; }
    const m = troopsOf(mobs, LAND.id, wt).find((x) => !x.dead)!, id = [...mobs].find(([, x]) => x === m)![0];
    pts = parseTroop(m.weapon)!.officer ? P.officer : P.soldier;
    m.dead = true; return wt.killed(m, id, by);
  };
  assert.equal(kill("own"), undefined, "no writ credit for the own clan"); assert.equal(kill("free"), undefined, "nor for the unsworn");
  assert.equal(heroes.get("own")!.renown + heroes.get("free")!.renown, 0, "own clan and unsworn heroes earn nothing");
  if (calm) { kill("calm"); assert.equal(heroes.get("calm")!.renown, 0, "a clan at peace with the holder earns no kill valor"); }
  let want = 0;
  for (let i = 0; i < WAR_TROOPS.killValorPerTick + 3; i++) {
    assert.deepEqual(kill("a"), { t: LAND.id, clan: owner }, "a rival in the land: writ credit, cap or not");
    want = Math.min(WAR_TROOPS.killValorPerTick, want + pts);
    assert.equal(heroes.get("a")!.renown, want, `kill ${i}: a soldier ${P.soldier}, an officer ${P.officer}`);
  }
  assert.equal(heroes.get("a")!.renown, WAR_TROOPS.killValorPerTick, "capped this war tick");
  s.tick++; // the next war tick
  kill("a");
  const after = WAR_TROOPS.killValorPerTick + pts;
  assert.equal(heroes.get("a")!.renown, after, "a new tick, new valor");
  heroes.get("a")!.x = 0; heroes.get("a")!.y = 0; // outside the land
  assert.equal(kill("a"), undefined, "no writ credit from outside the land");
  assert.equal(heroes.get("a")!.renown, after, "only inside the land");
  assert.equal(P.hero, 3); assert.equal(WAR_TROOPS.killValorPerTick, 12);
});

test("WarTroops: the fallen come back at the Hold gate after respawnMs; a new owner replaces the whole force", () => {
  const s = newWar();
  _resetWar({ v: 1, state: s, minds: newMinds(), next: Date.now() + 1e9, log: [] });
  const { wt, mobs, heroes } = fake(), gate = patrolOf(LAND.id)!.pts[0];
  heroes.set("a", hero(gate.x, gate.y));
  wt.tick(1000);
  const n = troopsOf(mobs, LAND.id, wt).length, [id, m] = [...mobs].find(([mid]) => wt._land(LAND.id)!.slots.some((x) => x.id === mid))!;
  m.dead = true; wt.killed(m, id, "", 1000); mobs.delete(id);
  wt.tick(2000);
  assert.equal(troopsOf(mobs, LAND.id, wt).length, n - 1, "not yet");
  wt.tick(1000 + WAR_TROOPS.respawnMs + 10);
  const back = troopsOf(mobs, LAND.id, wt);
  assert.equal(back.length, n, "back to full strength");
  const fresh = back.find((x) => x.x === gate.x && x.y === gate.y);
  assert.ok(fresh, "the new man starts at the gate");
  const was = s.owner[LAND.id], now = CLAN_KEYS.find((k) => k !== was)!;
  s.owner[LAND.id] = now;
  wt.tick(1000 + WAR_TROOPS.respawnMs + 20);
  const after = troopsOf(mobs, LAND.id, wt);
  assert.equal(after.length, n);
  assert.ok(after.every((x) => parseTroop(x.weapon)!.clan === now && x.x === gate.x && x.y === gate.y), "the new holder marches out of the gate");
  assert.ok(![...mobs.values()].some((x) => parseTroop(x.weapon)?.clan === was && wt._land(LAND.id)!.slots.some((sl) => mobs.get(sl.id) === x)), "the old holder's men are gone");
});

test("WarTroops: troops never chase into the safe square or the stockade", () => {
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });
  const { wt, mobs, heroes } = fake();
  // a trooper of a land next to Oakvale, an enemy-sworn hero standing just inside the safe square
  const t = TERRITORIES.filter((x) => patrolOf(x.id)).sort((a, b) => Math.hypot(a.cx - SAFE_ZONE.x, a.cy - SAFE_ZONE.y) - Math.hypot(b.cx - SAFE_ZONE.x, b.cy - SAFE_ZONE.y))[0];
  const saved = WAR_TROOPS.leashTiles;
  try {
    WAR_TROOPS.leashTiles = 400; // the safe square is "in reach" of the land: only the off-limits rule may stop them
    const inside = { x: (SAFE_ZONE.x + 1) * TILE, y: (SAFE_ZONE.y + SAFE_ZONE.h / 2) * TILE };
    assert.ok(isSafeZone(inside.x, inside.y));
    heroes.set("a", hero(inside.x, inside.y));
    wt.tick(1000);
    const [id, m] = [...mobs].find(([mid]) => wt._land(t.id)?.slots.some((x) => x.id === mid))!;
    heroes.get("a")!.clan = CLAN_KEYS.find((k) => k !== parseTroop(m.weapon)!.clan && atWar(k, parseTroop(m.weapon)!.clan));
    m.x = inside.x - 2 * TILE; m.y = inside.y; // right outside it
    assert.equal(wt.canHurt("a", m), true, "an enemy can hurt it out here...");
    wt.hit("a", m);
    assert.equal(m.target, "a", "...and it turns on them");
    for (let i = 0; i < 400; i++) {
      wt.step(m, id, 0.05, 1000 + i * 50);
      assert.ok(!isSafeZone(m.x, m.y), `step ${i}: (${m.x.toFixed(0)}, ${m.y.toFixed(0)}) on the safe square`);
    }
    assert.notEqual(m.target, "a", "no target on the safe square");
  } finally { WAR_TROOPS.leashTiles = saved; }
});

test("WarTroops: only heroes the troops fight can hurt them (no own clan, no unsworn hero, no newcomer, never on the safe square)", () => {
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });
  const { wt, mobs, heroes } = fake(), gate = patrolOf(LAND.id)!.pts[0], owner = warState()!.owner[LAND.id] as ClanKey;
  const foe = CLAN_KEYS.find((k) => k !== owner && atWar(k, owner))!; // (a clan at war with the holder: shared/war/feuds.ts)
  heroes.set("own", hero(gate.x, gate.y, { clan: owner }));
  heroes.set("free", hero(gate.x, gate.y));
  heroes.set("new", hero(gate.x, gate.y, { clan: foe, level: STANDARD.minLevel - 1 }));
  heroes.set("foe", hero(gate.x, gate.y, { clan: foe }));
  wt.tick(1000);
  const m = [...mobs.values()].find((x) => parseTroop(x.weapon)?.clan === owner)!;
  assert.equal(wt.canHurt("own", m), false, "own clan");
  assert.equal(wt.canHurt("free", m), false, "an unsworn hero stays out of the war");
  assert.equal(wt.canHurt("new", m), false, "a newcomer under the oath level");
  assert.equal(wt.canHurt("foe", m), true, "a hero sworn to another clan");
  for (const pid of ["own", "free", "new"]) { wt.hit(pid, m); assert.equal(m.target, "", `${pid}: no fight starts`); }
  assert.equal(wt.stance(owner, "free"), "neutral", "the blows changed nothing");
  wt.hit("foe", m);
  assert.equal(m.target, "foe", "an enemy's blow: it turns on them");
  const { x, y } = m, safe = { x: (SAFE_ZONE.x + 1) * TILE, y: (SAFE_ZONE.y + 1) * TILE };
  m.x = safe.x; m.y = safe.y;
  assert.equal(wt.canHurt("foe", m), false, "never on the safe square");
  m.x = x; m.y = y;
});

test("WarTroops: troops leave alone a wild monster busy with a hero they don't fight (or that hero's creature), unless it hits them", () => {
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });
  const { wt, mobs, heroes } = fake(), owner = warState()!.owner[LAND.id] as ClanKey, foe = CLAN_KEYS.find((k) => k !== owner)!;
  const gate = patrolOf(LAND.id)!.pts[0];
  heroes.set("watch", hero(gate.x, gate.y)); // wakes the land, neutral
  wt.tick(1000);
  const [id, m] = [...mobs].find(([, x]) => parseTroop(x.weapon)?.clan === owner)!;
  for (const [oid] of mobs) if (oid !== id) mobs.delete(oid); // alone
  heroes.get("watch")!.x = m.x + 400; heroes.get("watch")!.y = m.y; // near enough to see, too far to matter
  heroes.set("own", hero(m.x + 400, m.y, { clan: owner }));
  heroes.set("free", hero(m.x + 400, m.y));
  heroes.set("foe", hero(m.x + 2000, m.y, { clan: foe })); // far out of sight: only its name is in the monster's head
  const wolf = { ...mob("w1", m.x + 30, m.y, 10, ""), kind: "wolf" };
  mobs.set("w1", wolf);
  const golem = { ...mob("g1", m.x + 600, m.y, 10, ""), kind: "golem", owner: "free" };
  mobs.set("g1", golem);
  let now = 2000;
  const picked = () => { m.target = ""; now += WAR_TROOPS.pickMs + 1; wt.step(m, id, 0.01, now); return m.target; };
  assert.equal(picked(), "w1", "a wild monster nobody fights: hunted");
  for (const [field, who, why] of [["target", "own", "fighting an own-clan hero"], ["target", "free", "fighting an unsworn hero"],
    ["hateId", "free", "hating an unsworn hero"], ["foe", "g1", "fighting an unsworn hero's creature"], ["target", "watch", "fighting a neutral hero"]] as const) {
    Object.assign(wolf, { target: "", hateId: "", foe: "" }, { [field]: who });
    assert.equal(picked(), "", why);
  }
  Object.assign(wolf, { target: "foe", hateId: "", foe: "" });
  assert.equal(picked(), "w1", "a monster fighting an enemy hero is fair game");
  Object.assign(wolf, { target: "free", hateId: "", foe: "" });
  m.hateId = "w1"; m.hate = 20; // it struck the trooper
  assert.equal(picked(), "w1", "a monster that hit a trooper is answered");
});

test("WarTroops: a javelin for an enemy hero a few steps off, a rush blow on arrival; nothing for a neutral one", () => {
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });
  const { wt, mobs, heroes, hits } = fake(), gate = patrolOf(LAND.id)!.pts[0], owner = warState()!.owner[LAND.id] as ClanKey;
  const foe = CLAN_KEYS.find((k) => k !== owner)!;
  heroes.set("n", hero(gate.x, gate.y));
  wt.tick(1000);
  const [id, m] = [...mobs].find(([, x]) => parseTroop(x.weapon)?.clan === owner && !parseTroop(x.weapon)!.officer && !parseTroop(x.weapon)!.role)!; // (a foot soldier: archers and pikes fight their own way)
  const { x, y } = m;
  for (const [oid] of mobs) if (oid !== id) mobs.delete(oid); // alone with the heroes
  // open ground on some side of it (no wall in the way of the rush)
  const [ux, uy] = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).find(([a, b]) => Array.from({ length: 21 }, (_, k) => k * 5).every((d) => !blocked(x + a * d, y + b * d)))!;
  heroes.get("n")!.x = x + ux * 100; heroes.get("n")!.y = y + uy * 100;
  for (let i = 0; i < 40; i++) { m.x = x; m.y = y; wt.step(m, id, 0.05, 2000 + i * 50); }
  assert.equal(hits.length, 0, "a neutral hero is left alone");
  heroes.set("e", hero(x + ux * 100, y + uy * 100, { clan: foe }));
  heroes.delete("n");
  for (let i = 0; i < 20; i++) { m.x = x; m.y = y; wt.step(m, id, 0.05, 5000 + i * 50); }
  assert.ok(hits.some(([mid, what]) => mid === id && what === "javelin"), "a javelin at the enemy");
  hits.length = 0;
  heroes.get("e")!.x = x + ux * 60; heroes.get("e")!.y = y + uy * 60; // in rush range, the javelin still on cooldown
  for (let i = 0; i < 40 && !hits.length; i++) wt.step(m, id, 0.05, 6100 + i * 50);
  assert.ok(hits.some(([mid, who]) => mid === id && who === "e"), "it closes in and lands a blow (rush or swing)");
});
