// Crown of the Marches PR2: the Crown's monsters (every per-kind table, server/crownMobs.ts), their zones (Lv 40-48,
// the Riven King Lv 50 in the Throne Hall), Tollcross and the Crownways' daises kept monster-free, and the court's
// moves. The moves are unit-tested through a fake CrownHost (fast and exact); one room test checks the wiring.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actOfTile, BEAST, BEAST_BROOD, BEAST_FLYERS, BEAST_MOVES, BEAST_RIDER, BOSS, CROWN_AI, CROWN_DEAD, CROWN_KINDS, CROWN_LEVEL, ELITE, MOBS,
  PACK_KINDS, RIVEN_KING, type MobDef, type MobKind, TILE,
} from "../shared/constants";
import { LOOT } from "../shared/items";
import { GEAR_DROP } from "../shared/gear";
import { MOB_COMBAT } from "../shared/combat";
import { MOB_AFFINITY, MOB_SHOT_ELEMENT } from "../shared/elements";
import { RAIDER_SPARES } from "../shared/raiders";
import { familyOf } from "../shared/devour";
import { FAMILY_OF } from "../shared/champions";
import { AREAS, isSafeZone } from "../shared/map";
import { CR, CROWNWAYS, THRONE_HALL, TOLLCROSS } from "../shared/crown";
import { DENSITY, noMobsAt, randomPointInZone, SPAWN_ZONES, zoneAt } from "../shared/spawns";
import { NPCS, TALK_RANGE } from "../shared/npcs";
import { isSolidAt } from "../shared/map";
import { CrownCourt, type CrownHost, type CrownMob } from "../server/crownMobs";
import { startRoom, until, wait } from "./helpers/room";

const crownZones = SPAWN_ZONES.filter((z) => actOfTile(z.x, z.y) === 6);
const inRect = (r: { x: number; y: number; w: number; h: number }, px: number, py: number) => { const tx = px / TILE, ty = py / TILE; return tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h; };
const HALL = { ...THRONE_HALL, y: CR(THRONE_HALL.y) }, TOLL = { ...TOLLCROSS, y: CR(TOLLCROSS.y) };

test("crown monsters: an entry in every per-kind table, the dead and the living sorted, the boss tagged, every move set", () => {
  assert.equal(CROWN_KINDS.length, 9, "eight monsters and the Riven King");
  for (const k of CROWN_KINDS) {
    assert.ok(MOBS[k] && LOOT[k] && GEAR_DROP[k] && MOB_COMBAT[k], `${k}: MOBS, LOOT, GEAR_DROP, MOB_COMBAT`);
    assert.ok(MOB_AFFINITY[k], `${k}: an elemental affinity`);
    assert.ok(MOBS[k].xp > 0 && LOOT[k].gold[1] > 0 && GEAR_DROP[k].chance > 0, `${k}: pays out`);
    const t = GEAR_DROP[k].tiers;
    assert.ok(Math.abs(t[0] + t[1] + t[2] - 1) < 1e-9, `${k}: gear tiers add up`);
    for (const m of BEAST_MOVES[k] ?? []) assert.ok(BEAST[m], `${k}: move ${m} exists`);
    for (const b of BEAST_BROOD[k] ?? []) assert.ok(CROWN_KINDS.includes(b) && !ELITE[b], `${k} calls its own court (${b})`);
    // the cursed dead are spared by the Night Raiders and hold no blood for a vampire; the living are flesh
    const dead = CROWN_DEAD.includes(k);
    assert.equal(RAIDER_SPARES.includes(k), dead, `${k}: Night Raiders ${dead ? "spare" : "hunt"} it`);
    if (!dead) assert.ok(familyOf(k), `${k} can be devoured`);
    if (!ELITE[k] && dead) assert.equal(FAMILY_OF[k], "necro", `${k}: necro champions`);
  }
  assert.ok(ELITE.thronewarden && !BOSS.thronewarden && ELITE.rivenking && BOSS.rivenking);
  assert.ok(FAMILY_OF.pretender === "redfang" && FAMILY_OF.gildhound === "redfang" && !FAMILY_OF.crowncrow && !FAMILY_OF.courtmagus, "outlaw swords for the pretenders and the poached hunt");
  assert.ok(!CROWN_KINDS.some((k) => LOOT[k].mats?.some((d) => d.mat === "brass" || d.mat === "tonewood")), "brass and tonewood only from breaking");
  assert.equal(MOB_SHOT_ELEMENT.hollowherald, "cold");
  assert.equal(MOB_SHOT_ELEMENT.courtmagus, "shock");
  assert.ok(PACK_KINDS.includes("gildhound") && PACK_KINDS.includes("crowncrow") && BEAST_FLYERS.includes("crowncrow"));
  assert.equal(BEAST_RIDER.gildhound, "bleed");
  assert.ok(CROWN_AI.warlords.thronewarden, "the Thronewarden cries war");
  assert.ok(BEAST_MOVES.rivenking?.includes("brood") && BEAST_BROOD.rivenking?.length, "the king calls his court");
  assert.ok(RIVEN_KING.phase[0] > RIVEN_KING.phase[1], "phases in order");
  for (const k of ["wake", "taunt", "half", "death"] as const) assert.ok(RIVEN_KING.voice[k].length, `the throne's own voice: ${k}`);
  for (const k of CROWN_KINDS) assert.equal(CrownCourt.moves(k), k !== "gildhound" && k !== "crowncrow", `${k}: a move of its own in server/crownMobs.ts`);
  const living = new Set(crownZones.flatMap((z) => Object.keys(z.mobs)));
  for (const k of CROWN_KINDS) assert.ok(living.has(k), `${k} has a zone`);
});

test("crown zones: the lands at Lv 40-48 climbing to the Keep, the Riven King alone at Lv 50 in the Throne Hall, its own density", () => {
  assert.ok(crownZones.length >= 11, `${crownZones.length} zones`);
  assert.equal(crownZones.filter((z) => z.wild).length, 1, "one broad wild zone");
  assert.equal(crownZones.at(-1)!.name, "The Crown of the Marches", "the wild zone is last in its block");
  for (const z of crownZones) {
    const kinds = Object.keys(z.mobs) as MobKind[];
    assert.ok(kinds.every((k) => CROWN_KINDS.includes(k)), `${z.name}: only Crown monsters`);
    const special = kinds.every((k) => ELITE[k]);
    if (!z.wild) assert.ok(z.levels[0] >= CROWN_LEVEL.min && z.levels[1] <= (special ? CROWN_LEVEL.special : CROWN_LEVEL.mob), `${z.name}: ${z.levels}`);
    assert.ok(AREAS.some((a) => a.name === z.name), `${z.name} is a map area`);
  }
  const hall = crownZones.find((z) => z.mobs.rivenking)!;
  assert.equal(hall.name, "The Throne Hall");
  assert.deepEqual(hall.mobs, { rivenking: 1 });
  assert.deepEqual(hall.levels, [50, 50]);
  assert.ok(hall.fixed);
  assert.deepEqual([hall.x, hall.y, hall.w, hall.h], [HALL.x, HALL.y, HALL.w, HALL.h], "his zone is the hall");
  // the Keep's zone never spawns into his hall (shared/spawns.ts BOSS_HALLS)
  const keep = crownZones.find((z) => z.name === "The Crown Keep")!;
  assert.deepEqual(keep.levels, [46, 48]);
  for (let i = 0; i < 300; i++) { const p = randomPointInZone(keep); assert.ok(!inRect(HALL, p.x, p.y), `the Keep spawned in the hall at ${p.x},${p.y}`); }
  for (let i = 0; i < 50; i++) { const p = randomPointInZone(hall); assert.ok(inRect(HALL, p.x, p.y), "the king rises inside his hall"); }
  // the named lands' floors climb toward the Keep (Pilgrims' Way first, the Keep last)
  const named = crownZones.filter((z) => !z.wild && !z.fixed);
  assert.equal(Math.min(...named.map((z) => z.levels[0])), CROWN_LEVEL.min);
  assert.equal(Math.max(...named.map((z) => z.levels[1])), CROWN_LEVEL.mob);
  for (const z of named) if (z.name !== "The Crown Keep") assert.ok(z.levels[0] <= keep.levels[0], `${z.name} below the Keep`);
  assert.ok(named.filter((z) => z.mobs.thronewarden).length >= 2, "Thronewardens in the Vigil Courts and the Keep");
  assert.ok(DENSITY.crownWildTilesPerMob > DENSITY.crownTilesPerMob);
  const total = crownZones.reduce((n, z) => n + Object.values(z.mobs).reduce((a, b) => a + (b ?? 0), 0), 0);
  assert.ok(total > 500 && total <= 1200, `${total} monsters in the Crown`);
});

test("Tollcross and the five Crownways' daises stay monster-free; the Herald-Marshal stands in Tollcross Square", () => {
  for (let y = TOLL.y; y < TOLL.y + TOLL.h; y++) for (let x = TOLL.x; x < TOLL.x + TOLL.w; x++) assert.ok(noMobsAt((x + 0.5) * TILE, (y + 0.5) * TILE), `Tollcross monster-free at ${x},${y}`);
  assert.equal(zoneAt(TOLL.x + 5, TOLL.y + 5), undefined, "Tollcross belongs to no monster zone");
  for (const c of CROWNWAYS) {
    const a = AREAS.find((r) => r.name === c.name)!;
    assert.ok(a && noMobsAt((a.x + a.w / 2) * TILE, (a.y + a.h / 2) * TILE), `${c.name}'s dais`);
  }
  for (const z of crownZones) for (let i = 0; i < 120; i++) {
    const p = randomPointInZone(z);
    assert.ok(!inRect(TOLL, p.x, p.y) && !isSafeZone(p.x, p.y) && !noMobsAt(p.x, p.y), `${z.name} spawned at ${p.x},${p.y}`);
  }
  const n = NPCS.find((x) => x.id === "crownherald")!;
  assert.ok(n && inRect(TOLL, n.x, n.y) && n.where, "the Herald-Marshal is in Tollcross and the log can point to her");
  assert.ok([[0, TALK_RANGE * 0.8], [TALK_RANGE * 0.8, 0], [-TALK_RANGE * 0.8, 0], [0, -TALK_RANGE * 0.8]].some(([dx, dy]) => !isSolidAt(n.x + dx, n.y + dy)), "she can be reached");
});

// ---- the court's moves through a fake host ----

type Ev = { type: string; msg: any };
function court() {
  const mobs = new Map<string, CrownMob>(), heroes = new Map<string, { x: number; y: number; dead: boolean; hp: number }>();
  const evs: Ev[] = [], said: string[][] = [], hurt: { pid: string; dmg: number; what: string; stunMs?: number }[] = [], provoked: string[] = [];
  const host: CrownHost = {
    hero: (id) => heroes.get(id), heroes: () => heroes.entries(), mob: (id) => mobs.get(id),
    mobsNear: (x, y, r) => [...mobs.entries()].filter(([, m]) => Math.abs(m.x - x) <= r && Math.abs(m.y - y) <= r),
    broadcast: (type, msg) => evs.push({ type, msg }),
    dmg: (_m, mult) => Math.round(100 * mult),
    hurtHero: (pid, dmg, _f, what, _p, _kb, o) => { hurt.push({ pid, dmg, what, stunMs: o.stunMs }); heroes.get(pid)!.hp -= dmg; },
    canStand: () => true, clearLine: () => true, say: (_id, lines) => said.push([...lines]), provoke: (m) => provoked.push(m.kind),
  };
  const add = (id: string, kind: MobKind, x: number, y: number, o: Partial<CrownMob> = {}) => {
    const m: CrownMob = { kind, level: 45, x, y, hp: 1000, maxHp: 1000, zone: 0, dead: false, hidden: false, moving: true, winding: false, broken: false, stunned: false,
      owner: "", target: "", specialAt: 0, rushUntil: 0, windUntil: 0, lastAttack: 0, rallyUntil: 0, aimX: 0, aimY: 1, dir: "down", halfSaid: false, nextTaunt: 0, ...o };
    mobs.set(id, m);
    return m;
  };
  const hero = (id: string, x: number, y: number) => { const h = { x, y, dead: false, hp: 10000 }; heroes.set(id, h); return h; };
  const ev = (name: string) => evs.filter((e) => e.type === "crown" && e.msg.ev === name).map((e) => e.msg);
  return { c: new CrownCourt(host), mobs, heroes, evs, said, hurt, provoked, add, hero, ev };
}
const T0 = 1_000_000;

test("court: an Oathbroken Knight breaks its last oath once when badly hurt, and comes on faster and harder", () => {
  const k = court(), m = k.add("o", "oathbreaker", 0, 0);
  k.c.tick(m, "o", T0);
  assert.equal(k.ev("oath").length, 0, "whole: still sworn");
  m.hp = m.maxHp * CROWN_AI.oath.hpFrac - 1;
  k.c.tick(m, "o", T0 + 100); k.c.tick(m, "o", T0 + 200);
  assert.equal(k.ev("oath").length, 1, "broken once");
  const base = MOBS.oathbreaker as MobDef, d = CrownCourt.def(m, base, T0);
  assert.ok(d.damage > base.damage && d.speed > base.speed && d.attackCooldownMs < base.attackCooldownMs);
});

test("court: a Crownguard plants its shield toward its foe: blows from the front are cut, from behind they are not; a stun drops it", () => {
  const k = court(), m = k.add("g", "crownguard", 0, 0, { target: "h" });
  k.hero("h", 100, 0);
  assert.equal(k.c.tick(m, "g", T0), false, "not before its first ward");
  assert.equal(k.c.tick(m, "g", T0 + CROWN_AI.ward.firstMs), true, "shield up, holding");
  const w = k.ev("ward")[0];
  assert.ok(w && w.ax > 0.9 && w.ms === CROWN_AI.ward.ms, "facing the hero");
  const now = T0 + CROWN_AI.ward.firstMs + 100;
  assert.equal(k.c.taken(m, 100, 0, now), CROWN_AI.ward.mult, "from the front");
  assert.equal(k.c.taken(m, -100, 0, now), 1, "from behind");
  assert.equal(k.c.taken(m, 0, 100, now), 1, "from the side");
  assert.equal(k.c.taken(m, 100, 0, now + CROWN_AI.ward.ms), 1, "the shield comes down");
  m.stunned = true;
  assert.equal(k.c.tick(m, "g", now), false, "stunned: the shield drops");
  assert.equal(k.c.taken(m, 100, 0, now), 1);
});

test("court: a Hollow Herald reads a decree that rallies the court round it, unless a stun cuts it off", () => {
  const k = court(), m = k.add("hh", "hollowherald", 0, 0, { target: "h" }), ally = k.add("a", "oathbreaker", 60, 0), far = k.add("f", "oathbreaker", CROWN_AI.proclaim.range + 40, 0);
  k.add("x", "slime" as MobKind, 30, 0); // not of the court
  k.hero("h", 120, 0);
  assert.equal(k.c.tick(m, "hh", T0), false, "not before its first decree");
  const t1 = T0 + CROWN_AI.proclaim.firstMs;
  assert.equal(k.c.tick(m, "hh", t1), true, "it starts reading");
  assert.ok(m.winding && k.ev("proclaim").length === 1);
  assert.equal(k.c.tick(m, "hh", t1 + 100), true, "still reading");
  k.c.tick(m, "hh", t1 + CROWN_AI.proclaim.castMs);
  const d = k.ev("decree")[0];
  assert.ok(d && d.ids.includes("a") && d.ids.includes("hh") && !d.ids.includes("f") && !d.ids.includes("x"), "the court in range only");
  assert.ok(ally.rallyUntil > t1 && far.rallyUntil === 0);
  assert.ok(CrownCourt.def(ally, MOBS.oathbreaker, t1 + CROWN_AI.proclaim.castMs + 10).damage > MOBS.oathbreaker.damage, "rallied blows hit harder");
  // the next one is cut off
  const t2 = t1 + CROWN_AI.proclaim.castMs + CROWN_AI.proclaim.everyMs;
  assert.equal(k.c.tick(m, "hh", t2), true);
  m.stunned = true;
  assert.equal(k.c.tick(m, "hh", t2 + 200), false);
  assert.equal(k.ev("hush").length, 1, "hushed");
  assert.equal(k.ev("decree").length, 1, "no second decree");
  assert.ok(!m.winding);
});

test("court: a Court Magus blinks away from a hero who closes in, then waits out its cooldown", () => {
  const k = court(), m = k.add("cm", "courtmagus", 0, 0, { target: "h" });
  k.hero("h", 30, 0);
  k.c.tick(m, "cm", T0);
  const b = k.ev("blink")[0];
  assert.ok(b && b.x0 === 0, "it blinks");
  assert.ok(Math.hypot(m.x - 30, m.y) >= CROWN_AI.blink.dist - 1 && m.x < 0, "away from the hero");
  k.heroes.get("h")!.x = m.x + 20;
  k.c.tick(m, "cm", T0 + 500);
  assert.equal(k.ev("blink").length, 1, "on cooldown");
  k.c.tick(m, "cm", T0 + CROWN_AI.blink.cooldownMs);
  assert.equal(k.ev("blink").length, 2, "and again");
});

test("court: a stun drops a Crownguard's shield and cuts a herald's decree off (hush, no rally)", () => {
  const k = court(), g = k.add("g", "crownguard", 0, 0, { target: "h" }), hh = k.add("hh", "hollowherald", 300, 0, { target: "h" }), ally = k.add("a", "oathbreaker", 330, 0);
  k.hero("h", 100, 0);
  k.c.tick(g, "g", T0); k.c.tick(hh, "hh", T0);
  k.c.tick(g, "g", T0 + CROWN_AI.ward.firstMs);
  assert.equal(k.c.taken(g, 100, 0, T0 + CROWN_AI.ward.firstMs + 10), CROWN_AI.ward.mult, "shield up");
  k.c.tick(hh, "hh", T0 + CROWN_AI.proclaim.firstMs);
  assert.equal(k.ev("proclaim").length, 1, "reading");
  const t = T0 + CROWN_AI.proclaim.firstMs + 100;
  k.c.stunned(g, "g", t); k.c.stunned(hh, "hh", t);
  assert.equal(k.c.taken(g, 100, 0, t), 1, "the shield is down");
  assert.equal(k.ev("hush").length, 1, "hushed");
  assert.ok(!hh.winding);
  k.c.tick(hh, "hh", t + CROWN_AI.proclaim.castMs);
  assert.equal(k.ev("decree").length, 0, "no decree");
  assert.equal(ally.rallyUntil, 0, "no rally");
});

test("court: a Court Magus never blinks through a wall; the Riven King's taunts wait after his wake line; a respawn says its half line again", () => {
  const k = court(), m = k.add("cm", "courtmagus", 0, 0, { target: "h" });
  k.hero("h", 30, 0);
  const host = (k.c as any).host;
  host.clearLine = () => false; // walled in on every side
  k.c.tick(m, "cm", T0);
  assert.equal(k.ev("blink").length, 0, "no blink through walls");
  assert.deepEqual([m.x, m.y], [0, 0]);
  host.canStand = (_m: CrownMob, x: number) => x > -100; host.clearLine = () => true; // only the far landings are in another zone's hall
  k.c.tick(m, "cm", T0 + 1000);
  const b = k.ev("blink")[0];
  assert.ok(b && b.x > -100, "it picks a landing it may stand on");
  const rk = k.add("rk", "rivenking", 500, 0, { target: "h", voice: RIVEN_KING.voice, halfSaid: true });
  k.c.spawned(rk);
  assert.equal(rk.halfSaid, false, "a fresh king has his half line again");
  k.c.tick(rk, "rk", T0);
  assert.ok(rk.nextTaunt >= T0 + RIVEN_KING.tauntMs[0] && rk.nextTaunt <= T0 + RIVEN_KING.tauntMs[1], "no taunt straight after his wake line");
});

test("court: a Gildhound's fall drives the rest of its hunt wild onto its killer", () => {
  const k = court(), dead = k.add("g1", "gildhound", 0, 0), g2 = k.add("g2", "gildhound", 80, 0), g3 = k.add("g3", "gildhound", CROWN_AI.hunt.range + 50, 0), crow = k.add("c", "crowncrow", 40, 0);
  k.hero("killer", 100, 0);
  k.c.died(dead, "g1", "killer");
  const h = k.ev("hunt")[0];
  assert.deepEqual(h.ids, ["g2"], "the hounds in range, not the crow");
  assert.ok(g2.rallyUntil > 0 && g3.rallyUntil === 0 && crow.rallyUntil === 0);
  assert.deepEqual(k.provoked, ["gildhound"], "onto the killer");
});

test("court: a Thronewarden wards the most hurt of its court, which then takes far less", () => {
  const k = court(), w = k.add("tw", "thronewarden", 0, 0, { target: "h" }), a = k.add("a", "oathbreaker", 50, 0, { hp: 300 }), b = k.add("b", "crownguard", -50, 0, { hp: 100 });
  k.hero("h", 100, 0);
  k.c.tick(w, "tw", T0);
  assert.equal(k.ev("rampart").length, 0, "a moment first");
  k.c.tick(w, "tw", T0 + 2000);
  const r = k.ev("rampart")[0];
  assert.equal(r?.to, "b", "the worst hurt");
  assert.equal(k.c.taken(b, 0, 0, T0 + 2100), CROWN_AI.rampart.mult);
  assert.equal(k.c.taken(a, 0, 0, T0 + 2100), 1);
  assert.equal(k.c.taken(b, 0, 0, T0 + 2000 + CROWN_AI.rampart.ms), 1, "it wears off");
});

test("court: a hurt Pretender trades places with the nearest of its court (never another pretender or the king)", () => {
  const k = court(), p = k.add("p", "pretender", 0, 0, { target: "h", hp: 400 }), g = k.add("g", "crownguard", 100, 0), k2 = k.add("k", "rivenking", 20, 0);
  k.add("p2", "pretender", 10, 0);
  k.hero("h", -40, 0);
  k.c.tick(p, "p", T0);
  const u = k.ev("usurp")[0];
  assert.equal(u?.to, "g");
  assert.deepEqual([p.x, g.x, k2.x], [100, 0, 20], "swapped with the guard");
  assert.deepEqual(k.provoked, ["crownguard"], "who now faces the hero");
});

test("court: the Riven King speaks, cuts his Edge down a marked lane, drops Shards in phase 2 and Kingsfall in phase 3", () => {
  const k = court(), R = RIVEN_KING, m = k.add("rk", "rivenking", 0, 0, { target: "h", maxHp: 10000, hp: 10000, voice: R.voice });
  k.c.spawned(m);
  const h = k.hero("h", 120, 0);
  // the Edge: marked, then cut; the hero in the lane is hit, one stepped aside is not
  k.c.tick(m, "rk", T0);
  assert.deepEqual(k.said[0], R.voice.wake, "he wakes with a word");
  assert.equal(k.ev("edge").length, 0, "not before his first Edge");
  const t1 = T0 + R.edge.firstMs;
  assert.equal(k.c.tick(m, "rk", t1), true);
  const e = k.ev("edge")[0];
  assert.ok(e && e.x2 > e.x && e.ms === R.edge.windupMs, "a lane toward the hero");
  k.c.tick(m, "rk", t1 + R.edge.windupMs);
  assert.equal(k.ev("edgecut").length, 1);
  assert.equal(k.hurt.at(-1)?.what, "Riven Edge");
  assert.equal(k.hurt.at(-1)?.dmg, Math.round(100 * R.edge.dmgMult));
  const n0 = k.hurt.length, t2 = t1 + R.edge.everyMs;
  k.c.tick(m, "rk", t2);
  h.y = 200; h.x = 0; // stepped out of the lane (out of its reach too)
  k.c.tick(m, "rk", t2 + R.edge.windupMs);
  assert.equal(k.hurt.length, n0, "out of the lane: unhurt");
  // phase 2: the shards fall where they were marked
  m.hp = m.maxHp * (R.phase[0] - 0.01); h.x = 100; h.y = 0;
  const t3 = t2 + R.edge.windupMs + 10;
  k.c.tick(m, "rk", t3);
  assert.deepEqual(k.ev("phase").map((p) => p.phase), [2]);
  assert.ok(k.said.some((l) => l === R.lines.shards || l.join() === R.lines.shards.join()));
  k.c.tick(m, "rk", t3 + R.shards.firstMs);
  const s = k.ev("shards")[0];
  assert.ok(s && s.pts.length === R.shards.count && s.pts[0][0] === 100, "one on the hero, the rest round him");
  k.c.tick(m, "rk", t3 + R.shards.firstMs + R.shards.windupMs);
  assert.equal(k.hurt.at(-1)?.what, "Crown Shards");
  assert.equal(k.hurt.at(-1)?.stunMs, R.shards.stunMs);
  // phase 3: Kingsfall, faster and angrier; a hero who ran clear is spared
  m.hp = m.maxHp * (R.phase[1] - 0.01);
  const t4 = t3 + R.shards.firstMs + R.shards.windupMs + 10;
  k.c.tick(m, "rk", t4);
  assert.deepEqual(k.ev("phase").map((p) => p.phase), [2, 3]);
  assert.ok(CrownCourt.def(m, MOBS.rivenking, t4).attackCooldownMs < MOBS.rivenking.attackCooldownMs, "his wrath");
  h.x = 60;
  k.c.tick(m, "rk", t4 + R.kingsfall.firstMs);
  const f = k.ev("fall")[0];
  assert.ok(f && f.r === R.kingsfall.radius && f.ms === R.kingsfall.windupMs);
  h.x = R.kingsfall.radius + 40; // ran clear
  const n1 = k.hurt.length;
  k.c.tick(m, "rk", t4 + R.kingsfall.firstMs + R.kingsfall.windupMs);
  assert.equal(k.ev("fallen").length, 1);
  assert.equal(k.hurt.length, n1, "spared");
});

// ---- the room ----

test("room: the Crown comes alive (its court in its lands, the Riven King on his throne, Tollcross clear); a Crownguard's shield cuts a blow", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    const got: any[] = [];
    c.onMessage("crown", (m: any) => got.push(m));
    await wait(200);
    const room = srv.room;
    let king: any, live = 0;
    room.state.mobs.forEach((m: any) => {
      if (m.dead || m.owner || actOfTile(Math.floor(m.x / TILE), Math.floor(m.y / TILE)) !== 6) return;
      if (m.kind === "trooper") return; // (the clan war's soldiers march through)
      live++;
      assert.ok(CROWN_KINDS.includes(m.kind), `${m.kind} in the Crown`);
      assert.ok(!inRect(TOLL, m.x, m.y), `${m.kind} in Tollcross at ${m.x},${m.y}`);
      assert.ok(m.level >= CROWN_LEVEL.min && m.level <= CROWN_LEVEL.special, `${m.kind} Lv ${m.level}`);
      if (m.kind === "rivenking") king = m;
    });
    assert.ok(live > 500, `${live} Crown monsters up`);
    assert.ok(king && king.level === 50 && inRect(HALL, king.x, king.y), "the Riven King is on his throne");
    assert.ok(king.voice?.wake.length, "and has his say");
    // a Crownguard facing the hero plants its shield; the hero's blow from the front is cut
    const p = room.state.players.get(c.sessionId);
    const z = SPAWN_ZONES.find((s) => s.name === "The Sunken Courts")!, at = randomPointInZone(z);
    p.x = at.x; p.y = at.y; p.level = 45; p.maxHp = p.hp = 100000; p.invulnUntil = 0;
    room.state.mobs.forEach((m: any, id: string) => { if (Math.hypot(m.x - p.x, m.y - p.y) < 20 * TILE) room.state.mobs.delete(id); });
    room.spawnMob("crownguard", -1, "cg", { x: p.x + 80, y: p.y, level: 44 });
    const g = room.state.mobs.get("cg");
    g.target = c.sessionId; g.hateId = c.sessionId; g.hate = 3;
    assert.ok(await until(() => got.some((e) => e.ev === "ward" && e.id === "cg"), 6000), "it plants its shield");
    g.hp = g.maxHp;
    const hp0 = g.hp;
    (room as any).hitTarget(c.sessionId, "cg", 100, [1, 0], { kb: 0 });
    const cut = hp0 - g.hp;
    assert.ok(cut > 0 && cut <= 100 * CROWN_AI.ward.mult * 1.5 + 2, `the shield took most of it (${cut} of 100)`);
    await c.leave();
  } finally {
    await srv.stop();
  }
});

test("room: a stun through the room cuts a casting herald off: hush goes out, the court is not rallied", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    const got: any[] = [];
    c.onMessage("crown", (m: any) => got.push(m));
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    const z = SPAWN_ZONES.find((s) => s.name === "The Mourning Gardens")!, at = randomPointInZone(z);
    p.x = at.x; p.y = at.y; p.level = 45; p.maxHp = p.hp = 100000; p.invulnUntil = 0;
    room.state.mobs.forEach((m: any, id: string) => { if (Math.hypot(m.x - p.x, m.y - p.y) < 20 * TILE) room.state.mobs.delete(id); });
    room.spawnMob("hollowherald", -1, "hh", { x: p.x + 100, y: p.y, level: 44 });
    room.spawnMob("oathbreaker", -1, "ob", { x: p.x + 130, y: p.y + 20, level: 44 });
    const h = room.state.mobs.get("hh"), ally = room.state.mobs.get("ob");
    h.target = c.sessionId; h.hateId = c.sessionId; h.hate = 3;
    assert.ok(await until(() => got.some((e) => e.ev === "proclaim" && e.id === "hh"), 8000), "it starts a decree");
    h.stunUntil = Date.now() + 2500; // a stun lands mid-decree
    assert.ok(await until(() => got.some((e) => e.ev === "hush" && e.id === "hh"), 2000), "hush goes out");
    await wait(CROWN_AI.proclaim.castMs + 300);
    assert.ok(!got.some((e) => e.ev === "decree" && e.id === "hh"), "no decree");
    assert.ok(!(ally.rallyUntil > Date.now()), "the court is not rallied");
    await c.leave();
  } finally {
    await srv.stop();
  }
});
