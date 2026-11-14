import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE } from "../shared/constants";
import { isSafeZone, SAFE_ZONE } from "../shared/map";
import { blocked } from "../shared/movement";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { garrisonCount, garrisonSpots, patrolCount, patrolOf, TROOP, TROOP_LOOK, troopLook } from "../shared/war/patrols";
import { newWar } from "../shared/war/rules";
import { STANDARD } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { parseTroop, troopLevel, troopStance, troopWeapon, WAR_TROOPS } from "../shared/war/troops";
import { _resetWar, warState } from "../server/war";
import { WarTroops, type TroopHero, type TroopMob } from "../server/warTroops";

test("troops: the clan rides in Mob.weapon and round-trips; nothing else parses as a trooper", () => {
  for (const k of CLAN_KEYS) for (const officer of [false, true]) {
    const w = troopWeapon(k, officer);
    assert.deepEqual(parseTroop(w), { clan: k, officer });
  }
  for (const w of ["", "folk", "sword", "*", "__proto__", "constructor*", "wardens**", 5, undefined]) assert.equal(parseTroop(w), undefined, String(w));
});

test("troops: stance table (own clan, other clan, unsworn, grudge and its end, under the oath level)", () => {
  const L = STANDARD.minLevel, now = 1000;
  assert.equal(troopStance("redfang", { clan: "redfang", level: 20 }, 0, now), "ally");
  assert.equal(troopStance("redfang", { clan: "veiled", level: 20 }, 0, now), "enemy");
  assert.equal(troopStance("redfang", { level: 20 }, 0, now), "neutral");
  assert.equal(troopStance("redfang", { level: 20 }, now + 1, now), "enemy", "a live grudge");
  assert.equal(troopStance("redfang", { level: 20 }, now, now), "neutral", "the grudge is over");
  assert.equal(troopStance("redfang", { clan: "redfang", level: 20 }, now + 1e6, now), "ally", "a grudge never turns the own clan");
  assert.equal(troopStance("redfang", { level: L - 1 }, now + 1e6, now), "neutral", "newcomers are left alone, grudge or not");
  assert.equal(troopStance("redfang", { clan: "veiled", level: L - 1 }, 0, now), "neutral");
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
    hateId: "", hate: 0, summonFor: "", qwave: false, servant: false, title: "", tide: false, moving: false, stunned: false, slowed: false, broken: false,
    winding: false, windUntil: 0, lastAttack: 0, stunUntil: 0, slowUntil: 0 };
}
function fake() {
  const mobs = new Map<string, TroopMob>(), heroes = new Map<string, TroopHero>(), notes: [string, string][] = [], hits: [string, string, number][] = [];
  const wt = new WarTroops({
    spawn: (id, level, x, y, weapon) => { const m = mob(id, x, y, level, weapon); mobs.set(id, m); return m; },
    remove: (id) => { mobs.delete(id); },
    mob: (id) => mobs.get(id), mobsInBox: (x, y, r) => [...mobs].filter(([, m]) => Math.abs(m.x - x) <= r && Math.abs(m.y - y) <= r),
    heroes: () => heroes.entries(), hero: (id) => heroes.get(id), hidden: () => false,
    strikeHero: (mid, pid, dmg) => { hits.push([mid, pid, dmg]); },
    strikeMob: (mid, tid, dmg) => { hits.push([mid, tid, dmg]); }, shoot: (mid, _k, _x, _y, dmg) => { hits.push([mid, "javelin", dmg]); },
    note: (pid, text) => notes.push([pid, text]), ranked: () => {}, grudge: () => {},
  });
  return { wt, mobs, heroes, notes, hits };
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
  const want = patrolCount(100) + Math.min(garrisonCount(100), garrisonSpots(LAND.id, TROOP.garrisonMax).length);
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
  const guards = Math.min(garrisonCount(0), garrisonSpots(LAND.id, TROOP.garrisonMax).length);
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

test("WarTroops: kill valor goes to sworn heroes of another clan in the land, capped per hero per war tick", () => {
  const s = newWar();
  _resetWar({ v: 1, state: s, minds: newMinds(), next: Date.now() + 1e9, log: [] });
  const { wt, mobs, heroes } = fake(), gate = patrolOf(LAND.id)!.pts[0], owner = s.owner[LAND.id];
  const foe = CLAN_KEYS.find((k) => k !== owner)!;
  const at = { x: (LAND.x + LAND.w / 2) * TILE, y: (LAND.y + LAND.h / 2) * TILE };
  heroes.set("a", hero(at.x, at.y, { clan: foe }));
  heroes.set("own", hero(at.x, at.y, { clan: owner }));
  heroes.set("free", hero(at.x, at.y));
  heroes.set("gate", hero(gate.x, gate.y));
  wt.tick(1000);
  const kill = (by: string) => {
    const [id, m] = [...mobs].find(([, m]) => !m.dead && parseTroop(m.weapon)?.clan === owner)!;
    m.dead = true; wt.killed(m, id, by);
  };
  kill("own"); kill("free");
  assert.equal(heroes.get("own")!.renown + heroes.get("free")!.renown, 0, "own clan and unsworn heroes earn nothing");
  for (let i = 0; i < WAR_TROOPS.killValorPerTick + 3; i++) kill("a");
  assert.equal(heroes.get("a")!.renown, WAR_TROOPS.killValorPerTick * WAR_TROOPS.killValor, "capped this war tick");
  s.tick++; // the next war tick
  wt.tick(2000); // (fills nothing: the fallen wait respawnMs)
  for (const [id, m] of mobs) if (m.dead) mobs.delete(id);
  kill("a");
  assert.equal(heroes.get("a")!.renown, WAR_TROOPS.killValorPerTick * WAR_TROOPS.killValor + WAR_TROOPS.killValor, "a new tick, new valor");
  heroes.get("a")!.x = 0; heroes.get("a")!.y = 0; // outside the land
  kill("a");
  assert.equal(heroes.get("a")!.renown, WAR_TROOPS.killValorPerTick * WAR_TROOPS.killValor + WAR_TROOPS.killValor, "only inside the land");
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
  // a trooper of a land next to Oakvale, a grudged hero standing just inside the safe square
  const t = TERRITORIES.filter((x) => patrolOf(x.id)).sort((a, b) => Math.hypot(a.cx - SAFE_ZONE.x, a.cy - SAFE_ZONE.y) - Math.hypot(b.cx - SAFE_ZONE.x, b.cy - SAFE_ZONE.y))[0];
  const saved = WAR_TROOPS.leashTiles;
  try {
    WAR_TROOPS.leashTiles = 400; // the safe square is "in reach" of the land: only the off-limits rule may stop them
    const inside = { x: (SAFE_ZONE.x + 1) * TILE, y: (SAFE_ZONE.y + SAFE_ZONE.h / 2) * TILE };
    assert.ok(isSafeZone(inside.x, inside.y));
    heroes.set("a", hero(inside.x, inside.y));
    wt.tick(1000);
    const [id, m] = [...mobs].find(([mid]) => wt._land(t.id)?.slots.some((x) => x.id === mid))!;
    m.x = inside.x - 2 * TILE; m.y = inside.y; // right outside it
    wt.hit("a", m, 1000);
    for (let i = 0; i < 400; i++) {
      wt.step(m, id, 0.05, 1000 + i * 50);
      assert.ok(!isSafeZone(m.x, m.y), `step ${i}: (${m.x.toFixed(0)}, ${m.y.toFixed(0)}) on the safe square`);
    }
    assert.notEqual(m.target, "a", "no target on the safe square");
  } finally { WAR_TROOPS.leashTiles = saved; }
});

test("WarTroops: own clan can't hurt its troops; an unsworn hero's blow starts a grudge with one note", () => {
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });
  const { wt, mobs, heroes, notes } = fake(), gate = patrolOf(LAND.id)!.pts[0], owner = warState()!.owner[LAND.id] as ClanKey;
  heroes.set("own", hero(gate.x, gate.y, { clan: owner }));
  heroes.set("free", hero(gate.x, gate.y));
  wt.tick(1000);
  const m = [...mobs.values()].find((x) => parseTroop(x.weapon)?.clan === owner)!;
  assert.equal(wt.canHurt("own", m), false);
  assert.equal(wt.canHurt("free", m), true);
  assert.equal(wt.hostile("free", m, 1000), false);
  wt.hit("free", m, 1000);
  wt.hit("free", m, 1500);
  assert.equal(notes.filter(([p]) => p === "free").length, 1, "one note per grudge");
  assert.equal(wt.hostile("free", m, 1600), true);
  assert.equal(m.target, "free", "it turns on them");
  assert.equal(wt.hostile("free", m, 1500 + WAR_TROOPS.grudgeMs + 1), false, "the grudge runs out");
  wt.forget("free");
  assert.equal(wt.hostile("free", m, 1600), false, "forgotten on death or leaving");
  heroes.set("new", hero(gate.x, gate.y, { level: STANDARD.minLevel - 1 }));
  wt.hit("new", m, 2000);
  assert.equal(notes.filter(([p]) => p === "new").length, 0, "newcomers earn no grudge (they are never fought)");
  assert.equal(wt.hostile("new", m, 2001), false);
});

test("WarTroops: a javelin for an enemy hero a few steps off, a rush blow on arrival; nothing for a neutral one", () => {
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });
  const { wt, mobs, heroes, hits } = fake(), gate = patrolOf(LAND.id)!.pts[0], owner = warState()!.owner[LAND.id] as ClanKey;
  const foe = CLAN_KEYS.find((k) => k !== owner)!;
  heroes.set("n", hero(gate.x, gate.y));
  wt.tick(1000);
  const [id, m] = [...mobs].find(([, x]) => parseTroop(x.weapon)?.clan === owner && !parseTroop(x.weapon)!.officer)!;
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
