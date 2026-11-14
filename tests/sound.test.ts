// Sound sensitivity and resonance (shared/combat.ts SOUND_TIER / soundMult, shared/songs.ts RESONANCE / addResonance),
// through the skill engine (afterHit) and the real room's damage code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { heroSound, MOB_COMBAT, SOUND_MATCH, SOUND_TIER, SOUND_TIERS, soundMult, type SoundProfile } from "../shared/combat";
import { addResonance, consonant, RESONANCE, resonanceOf } from "../shared/songs";
import { afterHit, HitOpts, newRuntime, SkillHost, statusOf, Unit } from "../shared/skillEngine";
import { isSafeZone, isSolidAt, VILLAGE } from "../shared/map";
import { TILE } from "../shared/constants";
import { startRoom, wait } from "./helpers/room";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test("tiers scale damage, resonance and crowd control; deaf never resonates", () => {
  for (const t of SOUND_TIERS) {
    const m = soundMult({ tier: t }, {});
    assert.equal(m.dmg, SOUND_TIER[t].dmg); assert.equal(m.res, SOUND_TIER[t].res); assert.equal(m.cc, SOUND_TIER[t].cc);
  }
  assert.deepEqual(SOUND_TIER.deaf, { dmg: 0.75, res: 0, cc: 0.75 });
  assert.equal(SOUND_TIER.fragile.res, 2);
  assert.equal(soundMult({ tier: "deaf", pitch: "L" }, { pitch: "L", mode: "major" }).res, 0, "deaf: no resonance even matched");
  assert.equal(soundMult(heroSound("wizard"), {}).dmg, 1, "heroes hear normally");
});

test("pitch match x1.2 damage / x1.5 resonance ('any' matches every pitch); mode affinity x1.3; bosses x0.75 and Trained Ear x0.5", () => {
  const keenH: SoundProfile = { tier: "keen", pitch: "H" };
  const m = soundMult(keenH, { pitch: "H" }), off = soundMult(keenH, { pitch: "L" }), any = soundMult(keenH, { pitch: "any" });
  assert.ok(m.match && !off.match && any.match);
  assert.ok(near(m.dmg, SOUND_TIER.keen.dmg * SOUND_MATCH.dmg) && near(m.res, SOUND_TIER.keen.res * SOUND_MATCH.res));
  assert.ok(near(off.dmg, SOUND_TIER.keen.dmg));
  assert.equal(soundMult({ tier: "normal" }, { pitch: "H" }).match, false, "no pitch on the target: no match");
  const undead: SoundProfile = { tier: "normal", mode: "major" };
  assert.ok(near(soundMult(undead, { mode: "lydian" }).res, 1.3), "Lydian is in the major family");
  assert.ok(near(soundMult(undead, { mode: "phrygian" }).res, 1));
  assert.ok(near(soundMult({ tier: "normal", boss: true }, {}).res, 0.75));
  assert.ok(near(soundMult({ tier: "normal", ear: true }, {}).res, 0.5));
  // the planner's assignment
  assert.equal(MOB_COMBAT.slime.sound.tier, "dull");
  assert.equal(MOB_COMBAT.motherblob.sound.tier, "deaf");
  assert.equal(MOB_COMBAT.blobling.sound.tier, "deaf");
  assert.deepEqual(MOB_COMBAT.skeleton.sound, { tier: "fragile", pitch: "H", mode: "major" });
  assert.deepEqual(MOB_COMBAT.nightraider.sound, { tier: "deaf" });
});

test("resonance: a fifth or an octave after the last note builds x1.5; it fades after 2 s", () => {
  const sk = newRuntime();
  addResonance(sk, 10, 1000, { deg: "I", pitch: "M" });
  assert.equal(sk.res, 10);
  addResonance(sk, 10, 1100, { deg: "V", pitch: "M" });
  assert.equal(sk.res, 10 + 10 * RESONANCE.interval, "I -> V: a fifth");
  addResonance(sk, 10, 1200, { deg: "vi", pitch: "M" });
  assert.equal(sk.res, 25 + 10, "V -> vi: no bonus");
  addResonance(sk, 10, 1300, { deg: "vi", pitch: "H" });
  assert.equal(sk.res, 35 + 15, "the same note an octave up");
  assert.ok(consonant({ deg: "IV" }, { deg: "I" }), "a fourth is a fifth turned over");
  assert.equal(resonanceOf(sk, 1300 + RESONANCE.decayAfterMs), 50, "no fade within 2 s");
  assert.ok(near(resonanceOf(sk, 1300 + RESONANCE.decayAfterMs + 500), 50 - RESONANCE.decayPerSec / 2), "then it fades");
  assert.equal(resonanceOf(sk, 1300 + 60_000), 0);
});

test("resonance bursts at 100, at most once a second per target; a spread alone never bursts", () => {
  const sk = newRuntime();
  assert.equal(addResonance(sk, 60, 1000), false);
  assert.equal(addResonance(sk, 60, 1050), true, "bursts at 100");
  assert.equal(sk.res, 0);
  assert.equal(addResonance(sk, 120, 1500), false, "capped: within a second of the last burst");
  assert.equal(sk.res, 100, "held at the top");
  assert.equal(addResonance(sk, 1, 2050), true, "a second later it may burst again");
  const s2 = newRuntime();
  for (let i = 0; i < 20; i++) assert.equal(addResonance(s2, 40, 1000 + i * 10, { spread: true }), false);
  assert.equal(s2.res, RESONANCE.spreadCap, "stops just below the top");
  assert.equal(addResonance(s2, 5, 1300), true, "a real hit on top of it bursts");
});

/** The engine with a sound profile per unit: a Songweaver hits monsters with sound. */
function world(profiles: Record<string, SoundProfile>) {
  const now = 10_000;
  const units = new Map<string, Unit>();
  const hits: { to: string; dmg: number; o: HitOpts }[] = [];
  const fx: any[] = [];
  const h: SkillHost = {
    now: () => now, later: () => {}, unit: (id) => units.get(id), canAct: () => true,
    enemies: (x, y, r, of) => [...units.entries()].filter(([id, u]) => id !== of && !u.dead && Math.hypot(u.x - x, u.y - y) <= r).map(([id]) => id),
    hit: (from, to, dmg, _p, o) => { hits.push({ to, dmg, o }); afterHit(h, from, to, o); },
    heal: () => {}, aim: () => [1, 0], face: () => {}, move: () => {}, place: () => true, invuln: () => {}, shoot: () => {}, addField: () => {},
    fear: () => {}, weaponHit: () => 20, magic: () => 1, cooldownMult: () => 1, fx: (e) => fx.push(e),
    soundOf: (id) => profiles[id],
  };
  units.set("sw", { x: 0, y: 0, dead: false, level: 30, sk: newRuntime(), cls: "songweaver", talents: {}, hp: 100, maxHp: 100 });
  for (const id of Object.keys(profiles)) units.set(id, { x: 20, y: 0, dead: false, level: 30, sk: newRuntime(), hp: 9999, maxHp: 9999 });
  /** A sound hit's after-effects (the damage itself is the host's). */
  const ring = (to: string, o: HitOpts = { skill: true, sound: { pitch: "H", deg: "I", mode: "major" } }) => afterHit(h, "sw", to, o);
  return { h, units, hits, fx, ring };
}

test("through the engine: deaf monsters never ring, only sound hits count, a burst hits and a fragile one shatters", () => {
  const w = world({ deaf: { tier: "deaf", pitch: "L" }, norm: { tier: "normal" }, frag: { tier: "fragile", pitch: "H" } });
  for (let i = 0; i < 30; i++) w.ring("deaf");
  assert.equal(w.units.get("deaf")!.sk.res, 0, "deaf: nothing");
  for (let i = 0; i < 10; i++) afterHit(w.h, "sw", "norm", { skill: true });
  assert.equal(w.units.get("norm")!.sk.res, 0, "a hit without sound builds nothing");
  w.ring("norm");
  assert.equal(w.units.get("norm")!.sk.res, RESONANCE.perHit);
  assert.ok(statusOf(w.units.get("norm")!, 10_000).split(",").includes("res1"), "res1 status word");
  w.ring("frag"); w.ring("frag"); w.ring("frag"); w.ring("frag");
  const burst = w.fx.find((e) => e.ev === "resonate");
  assert.ok(burst, "fragile + matching pitch bursts in a few hits");
  assert.equal(burst.id, "frag"); assert.equal(burst.shatter, true);
  const blow = w.hits.find((x) => x.to === "frag")!;
  assert.equal(blow.o.stunMs, RESONANCE.shatterStunMs, "shatter stuns");
  assert.ok(near(blow.dmg, RESONANCE.burstDmg * SOUND_TIER.fragile.dmg * RESONANCE.shatterMult));
  assert.equal(blow.o.sound, undefined, "the burst itself is not a sound hit (no loop)");
  assert.ok(w.fx.some((e) => e.ev === "soundhit" && e.id === "frag" && e.tier === "fragile" && e.match === true), "the soundhit cue");
});

test("Sympathetic Strings: a burst spreads to foes close by without setting them off", () => {
  const w = world({ a: { tier: "fragile", pitch: "H" }, b: { tier: "normal" } });
  w.units.get("sw")!.talents = { sg_dirge: 1, sg_shrill: 1, sg_sympathy: 3 };
  for (let i = 0; i < 4; i++) w.ring("a");
  assert.ok(w.fx.some((e) => e.ev === "resonate" && e.id === "a"));
  const b = w.units.get("b")!.sk.res;
  assert.ok(b > 0 && b < RESONANCE.max, `b got some (${b})`);
  assert.equal(w.fx.filter((e) => e.ev === "resonate").length, 1, "b did not burst from the spread");
});

test("the room scales sound hits by how the target hears (deaf blobling, dull slime, fragile skeleton); other hits unchanged", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "songweaver" });
    await wait(200);
    const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
    let spot: [number, number] | undefined;
    for (let tx = VILLAGE.x0 - 14; tx > 0 && !spot; tx--) { const x = (tx + 0.5) * TILE, y = (VILLAGE.y0 + 10.5) * TILE; if (!isSolidAt(x, y) && !isSafeZone(x, y)) spot = [x, y]; }
    const [x, y] = spot!;
    p.x = x; p.y = y;
    const lost = (kind: string, o: Record<string, unknown>) => {
      room.spawnMob(kind, 0, "t_" + kind, { x: x + 20, y, level: 1 });
      const m = room.state.mobs.get("t_" + kind);
      m.hp = m.maxHp = 1e6; m.execSpent = true; m.broken = false;
      room.hitTarget(id, "t_" + kind, 100, [0, 0], { kb: 0, ...o });
      const d = 1e6 - m.hp;
      room.state.mobs.delete("t_" + kind);
      return d;
    };
    const plain = lost("blobling", {});
    assert.equal(plain, 100);
    assert.equal(lost("blobling", { sound: { pitch: "M" } }), 75, "deaf: three quarters");
    assert.equal(lost("blobling", { sound: { pitch: "L" } }), 90, "deaf, but the right pitch");
    assert.equal(lost("slime", { sound: { pitch: "M" } }), 90, "dull");
    assert.equal(lost("skeleton", { sound: { pitch: "H" } }), Math.round(100 * 1.35 * 1.2), "fragile + match");
    assert.equal(lost("skeleton", {}), 100, "not a sound hit: unchanged");
    await c.leave();
  } finally { await srv.stop(); }
});
