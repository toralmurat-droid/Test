import { test } from "node:test";
import assert from "node:assert/strict";
import { BLOOD_RITE_MS, CANTRIPS, cleanRanks, MAX_RANK, SKILLS, skillOf } from "../shared/skills";
import { afterHit, bloodCost, castSkill, FieldInst, HitOpts, newRuntime, shotHit, ShotSpec, SkillHost, statusOf, tickField, tickUnit, Unit } from "../shared/skillEngine";
import { ART_IDS } from "../client/src/skillArt";

/** A tiny world for the skill engine: units by id, everyone not "v" is an enemy of "v". */
function world() {
  let now = 1000;
  const units = new Map<string, Unit>();
  const hits: { from: string; to: string; dmg: number; o: HitOpts }[] = [];
  const fx: any[] = [];
  const fields: FieldInst[] = [];
  const later: { at: number; fn: () => void }[] = [];
  const h: SkillHost = {
    now: () => now,
    later: (ms, fn) => later.push({ at: now + ms, fn }),
    unit: (id) => units.get(id),
    canAct: () => true,
    enemies: (x, y, r, of) => [...units.entries()].filter(([id, u]) => id !== of && !u.dead && Math.hypot(u.x - x, u.y - y) <= r).map(([id]) => id),
    hit: (from, to, dmg, _push, o) => { hits.push({ from, to, dmg, o }); afterHit(h, from, to, o); },
    heal: () => {},
    aim: () => [1, 0],
    face: () => {},
    move: () => {},
    place: () => true,
    invuln: () => {},
    shoot: () => {},
    addField: (f) => fields.push(f),
    fear: () => {},
    weaponHit: () => 20,
    magic: () => 1,
    cooldownMult: () => 1,
    fx: (e) => fx.push(e),
  };
  const add = (id: string, x: number, y: number, extra: Partial<Unit> = {}) => {
    const u: Unit = { x, y, dead: false, level: 30, sk: newRuntime(), hp: 200, maxHp: 200, ...extra };
    units.set(id, u);
    return u;
  };
  const step = (ms: number) => {
    now += ms;
    for (const l of later.filter((x) => x.at <= now)) { later.splice(later.indexOf(l), 1); l.fn(); }
    for (const f of [...fields]) if (!tickField(h, f)) fields.splice(fields.indexOf(f), 1);
    for (const id of units.keys()) tickUnit(h, id);
  };
  return { h, add, hits, fx, fields, step, units };
}
const ranks = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, MAX_RANK]));

test("every vampire skill has a painted icon, and Blood Bolt is gone", () => {
  const ids = [...SKILLS.vampire, ...CANTRIPS.vampire].map((s) => s.id);
  assert.deepEqual(ids.filter((id) => !ART_IDS.includes(id)), []);
  assert.equal(skillOf("vampire", "v_bolt"), undefined);
  assert.equal(skillOf("vampire", "v_link")?.req, 1);
});

test("old saves: Blood Bolt ranks move to Blood Link, so the Blood tree above it stays learned", () => {
  const out = cleanRanks("vampire", 30, { v_bolt: 3, v_boil: 2, v_pact: 1, v_tide: 1 });
  assert.deepEqual(out, { v_link: 3, v_boil: 2, v_pact: 1, v_tide: 1 });
});

test("Leech: the foe bleeds (blood, not flames), and hits on it while it bleeds give Blood stacks", () => {
  const w = world();
  const v = w.add("v", 0, 0, { cls: "vampire", talents: {} });
  const m = w.add("m", 30, 0);
  const leech = CANTRIPS.vampire[0];
  assert.equal(leech.id, "v_leech");
  const d = leech.shots!;
  const spec = { owner: "v", skill: leech.id, x: 0, y: 0, vx: 1, vy: 0, kind: d.kind, speed: d.speed, range: d.range, radius: d.radius, size: 1, dmg: d.dmg!,
    pierce: 0, explode: 0, chain: 0, rank: 1, power: 1, burn: d.burn, drain: d.drain, leechMs: d.leechMs, bleed: d.bleed, kb: d.kb } as ShotSpec;
  shotHit(w.h, spec, "m");
  assert.equal(v.sk.stacks, 0, "the Leech hit itself gives no stack");
  assert.equal(statusOf(m, w.h.now()), "bleed");
  w.h.hit("v", "m", 10, [0, 0], { skill: true }); // a skill hit while it bleeds
  assert.equal(v.sk.stacks, 1);
  w.h.hit("v", "m", 10, [0, 0], { basic: true }); // a basic hit: its own stack + the Leech stack
  assert.equal(v.sk.stacks, 3);
  w.step(600); // bleed ticks (dot) give nothing
  assert.equal(v.sk.stacks, 3);
  assert.ok(w.hits.some((x) => x.o.dot && x.to === "m"), "it bleeds over time");
  w.step(4000);
  w.h.hit("v", "m", 10, [0, 0], { skill: true }); // the bleed is over
  assert.equal(v.sk.stacks, 3);
});

test("Blood Link: binds the foe in reach, pumps its life every tick and snaps when it runs off", () => {
  const w = world();
  const v = w.add("v", 0, 0, { cls: "vampire", talents: ranks(["v_link"]), mana: 999, energy: 999 });
  assert.equal(castSkill(w.h, "v", "v_link"), false, "nobody in reach: not cast, nothing paid");
  assert.equal(v.mana, 999);
  const m = w.add("m", 80, 0);
  assert.equal(castSkill(w.h, "v", "v_link"), true);
  assert.equal(w.fields.length, 1);
  assert.equal(w.fields[0].target, "m");
  w.step(10); w.step(310); w.step(310);
  const pumps = w.hits.filter((x) => x.to === "m");
  assert.ok(pumps.length >= 2, `pumps ${pumps.length}`);
  assert.ok(pumps.every((x) => x.o.drain === 50 && x.o.dot));
  m.x = 400; // out of reach
  w.step(50);
  assert.equal(w.fields.length, 0, "the cord snapped");
});

test("Blood Pact makes every skill cost 2% HP more (not the basic spell); Crimson Tide costs 8% on its own", () => {
  const plain: Unit = { x: 0, y: 0, dead: false, level: 30, sk: newRuntime(), hp: 200, maxHp: 200, cls: "vampire", talents: {} };
  const pact: Unit = { ...plain, talents: ranks(["v_link", "v_pact"]) };
  const boil = skillOf("vampire", "v_boil")!, tide = skillOf("vampire", "v_tide")!, rend = skillOf("vampire", "v_rend")!;
  assert.equal(bloodCost(tide, plain), 16);
  assert.equal(bloodCost(boil, plain), 8);
  assert.equal(bloodCost(boil, pact), 12);
  assert.equal(bloodCost(rend, plain), 0);
  assert.equal(bloodCost(rend, pact), 4);
  assert.equal(bloodCost(CANTRIPS.vampire[0], pact), 0);
});

test("Exsanguinate sends a blood stream from every victim; Boil Blood makes them boil", () => {
  const w = world();
  w.add("v", 0, 0, { cls: "vampire", talents: ranks(["v_link", "v_boil", "v_exsang"]), mana: 999, energy: 999 });
  w.add("a", 30, 0); w.add("b", -20, 20); w.add("far", 300, 0);
  assert.ok(castSkill(w.h, "v", "v_exsang"));
  w.step(2000);
  const s = w.fx.find((e) => e.ev === "siphon");
  assert.ok(s, "siphon event");
  assert.equal(s.pts.length, 2);
  assert.ok(castSkill(w.h, "v", "v_boil"));
  w.step(1000);
  assert.equal(statusOf(w.units.get("a")!, w.h.now()), "boil");
});

test("Child of the Night: a buff only while it is night where the vampire stands", () => {
  const w = world();
  let night = false;
  w.h.isNight = () => night;
  const v = w.add("v", 0, 0, { cls: "vampire", talents: ranks(["v_mist", "v_gaze", "v_nightborn"]) });
  w.step(100);
  assert.equal(v.sk.buffs.length, 0, "no buff by day");
  night = true;
  w.step(100);
  const b = v.sk.buffs.find((x) => x.id === "v_nightborn");
  assert.ok(b, "buff at night");
  assert.deepEqual([b!.b.dmg, b!.b.lifesteal, b!.b.speed], [18, 6, 9]);
  night = false;
  w.step(2500);
  assert.equal(v.sk.buffs.length, 0, "gone after dawn");
});

test("Nightfall marks its ground as night", () => {
  const nf = skillOf("vampire", "v_nightfall")!;
  assert.equal(nf.field?.night, true);
  assert.equal(skillOf("vampire", "v_nightborn")?.parent, "v_gaze");
});

// ---- Tree rebuild (Murat 2026-11-07): 7 skills per tree, new mechanics ----

test("each vampire tree has 7 skills, 22 with Leech; old Cloak and Frenzy saves move to Rat Plague and The Brides", () => {
  for (const b of [0, 1, 2]) assert.equal(SKILLS.vampire.filter((s) => s.branch === b).length, 7, `branch ${b}`);
  assert.equal(SKILLS.vampire.length + CANTRIPS.vampire.length, 22);
  const out = cleanRanks("vampire", 30, { v_mist: 1, v_bats: 1, v_cloak: 2, v_nightfall: 1, v_rend: 1, v_pounce: 1, v_frenzy: 3 });
  assert.deepEqual(out, { v_mist: 1, v_bats: 1, v_rats: 2, v_nightfall: 1, v_rend: 1, v_pounce: 1, v_brides: 3 });
});

test("Exsanguinate reaches a wide circle, and Hemorrhage bursts what is left of a bleed at once", () => {
  const w = world();
  const v = w.add("v", 0, 0, { cls: "vampire", talents: ranks(["v_link", "v_boil", "v_exsang"]), mana: 999, energy: 999 });
  const m = w.add("m", 90, 0);
  m.sk.burnUntil = w.h.now() + BLOOD_RITE_MS + 2000; m.sk.burnDps = 10; m.sk.burnBy = "v"; // 2 s of bleed left when the ritual ends
  assert.ok(castSkill(w.h, "v", "v_exsang"));
  w.step(BLOOD_RITE_MS - 20);
  assert.ok(!w.hits.some((x) => x.to === "m" && !x.o.dot), "no damage before the blood ritual ends");
  w.step(20);
  const hit = w.hits.find((x) => x.to === "m" && !x.o.dot)!;
  assert.ok(hit, "a foe 90 px away is caught");
  assert.ok(w.fx.some((e) => e.ev === "rupture" && e.t === "m"));
  assert.ok(m.sk.burnUntil <= w.h.now(), "the bleed is spent");
  // without a bleed the same cast does 20 less (10 dps x 2 s)
  const w2 = world();
  w2.add("v", 0, 0, { cls: "vampire", talents: v.talents, mana: 999, energy: 999 });
  w2.add("m", 90, 0);
  castSkill(w2.h, "v", "v_exsang"); w2.step(BLOOD_RITE_MS + 20);
  assert.ok(Math.abs(hit.dmg - w2.hits.find((x) => x.to === "m")!.dmg - 20) < 0.01);
});

test("Transfusion: Blood Link aimed at a group ally gives them the vampire's blood", () => {
  const w = world();
  const healed: Record<string, number> = {};
  w.h.heal = (id, amt) => { healed[id] = (healed[id] ?? 0) + amt; };
  w.h.allies = (x, y, r, of) => (of === "v" ? ["ally"] : []).filter((id) => { const u = w.units.get(id)!; return Math.hypot(u.x - x, u.y - y) <= r; });
  const foes = w.h.enemies;
  w.h.enemies = (x, y, r, of) => foes(x, y, r, of).filter((id) => id !== "ally");
  const v = w.add("v", 0, 0, { cls: "vampire", talents: ranks(["v_link"]), mana: 999, energy: 999 });
  w.add("ally", 60, 0);
  w.add("m", 0, 100); // an enemy, but further from the aim (aim is +x)
  assert.ok(castSkill(w.h, "v", "v_link"));
  assert.equal(w.fields[0].target, "ally");
  assert.equal(w.fields[0].ally, true);
  w.step(10);
  assert.equal(v.hp, 196, "2% of 200 HP given");
  assert.ok((healed.ally ?? 0) > 4 * 1.5 - 0.01, "the ally heals 1.5x of it (and more with rank)");
  assert.equal(w.hits.filter((x) => x.to === "ally").length, 0, "the ally is never hurt");
});

test("Rise Again: Blood Pact saves the vampire from one killing blow every 3 minutes", async () => {
  const { riseAgain } = await import("../shared/skillEngine");
  const w = world();
  const v = w.add("v", 0, 0, { cls: "vampire", talents: ranks(["v_link", "v_pact"]), hp: 0 });
  assert.equal(riseAgain(w.h, "v"), true);
  assert.equal(v.hp, 60);
  v.hp = 0;
  assert.equal(riseAgain(w.h, "v"), false, "on cooldown");
  w.step(180000);
  assert.equal(riseAgain(w.h, "v"), true);
  const plain = w.add("p", 0, 0, { cls: "vampire", talents: ranks(["v_link"]) });
  assert.equal(riseAgain(w.h, "p"), false);
  assert.ok(plain);
});

test("Bloodlust: with Undying Hunger every kill gives a rush of speed", async () => {
  const { onKill, speedMult } = await import("../shared/skillEngine");
  const w = world();
  const v = w.add("v", 0, 0, { cls: "vampire", talents: ranks(["v_rend", "v_thirst", "v_hunger"]) });
  onKill(w.h, "v");
  assert.ok(speedMult(v, w.h.now()) > 1.19);
  const plain = w.add("p", 0, 0, { cls: "vampire", talents: {} });
  onKill(w.h, "p");
  assert.equal(speedMult(plain, w.h.now()), 1);
});

test("Bloodline: Thirst also gives group allies close by half its lifesteal", async () => {
  const { buffLifesteal } = await import("../shared/skillEngine");
  const w = world();
  w.h.allies = (_x, _y, _r, of) => (of === "v" ? ["ally"] : []);
  const v = w.add("v", 0, 0, { cls: "vampire", talents: ranks(["v_rend", "v_thirst"]), mana: 999, energy: 999 });
  const ally = w.add("ally", 40, 0);
  assert.ok(castSkill(w.h, "v", "v_thirst"));
  assert.equal(buffLifesteal(v, w.h.now()), 0.08);
  assert.equal(buffLifesteal(ally, w.h.now()), 0.04);
});

test("Charm: a monster in reach is handed to the host; a boss or hero is dazed instead", () => {
  const w = world();
  const charmed: string[] = [];
  w.h.charmable = (id) => id !== "boss";
  w.h.charm = (_id, tid) => { charmed.push(tid); return true; };
  const v = w.add("v", 0, 0, { cls: "vampire", talents: ranks(["v_mist", "v_gaze"]), mana: 999, energy: 999 });
  assert.equal(castSkill(w.h, "v", "v_gaze"), false, "nobody in reach: not cast");
  assert.equal(v.mana, 999);
  w.add("boss", 50, 0);
  assert.ok(castSkill(w.h, "v", "v_gaze"));
  assert.deepEqual(charmed, []);
  assert.ok(w.hits.some((x) => x.to === "boss" && x.o.fearMs && x.o.weakMs), "the boss is dazed");
  w.units.delete("boss");
  w.add("m", 70, 10);
  v.sk.last = {};
  assert.ok(castSkill(w.h, "v", "v_gaze"));
  assert.deepEqual(charmed, ["m"]);
  assert.ok(w.fx.some((e) => e.ev === "charm" && e.t === "m" && e.ms > 0));
});

test("The Brides slash up to three foes around the vampire and feed him", () => {
  const w = world();
  w.add("v", 0, 0, { cls: "vampire", talents: ranks(["v_rend", "v_pounce", "v_brides"]), mana: 999, energy: 999 });
  for (let i = 0; i < 5; i++) w.add("m" + i, 20 + i * 10, 0);
  assert.ok(castSkill(w.h, "v", "v_brides"));
  w.step(400); w.step(10);
  const slashes = w.hits.filter((x) => x.from === "v");
  assert.equal(slashes.length, 3);
  assert.ok(slashes.every((x) => x.o.drain === 15));
});
