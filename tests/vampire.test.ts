import { test } from "node:test";
import assert from "node:assert/strict";
import { CANTRIPS, cleanRanks, MAX_RANK, SKILLS, skillOf } from "../shared/skills";
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
