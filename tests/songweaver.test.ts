// The Songweaver (Plan v2): songs as party auras, one song each, modes, chords, Modulate, the Oakvale busking rule and
// the swTree / swMode save fields. Room tests run the real TownRoom (tests/helpers/room.ts allows archived classes).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { ACTIVE_CLASSES, CLASSES } from "../shared/classes";
import { CANTRIPS, cleanRanks, FINISHERS, SKILLS, skillById, skillOf } from "../shared/skills";
import { afterHit, castSkill, FieldInst, HitOpts, newRuntime, ShotSpec, SkillHost, statusOf, tickField, tickUnit, Unit } from "../shared/skillEngine";
import { knownModes, MODE_IDS, MODES, NOTES, PROGRESSIONS, SONG, SONGWEAVER_TREE } from "../shared/songs";
import { isSafeZone, isSolidAt, VILLAGE } from "../shared/map";
import { TILE } from "../shared/constants";
import { inVillage } from "../shared/wrath";
import { BUSKING, BUSKING_LINES, npcById } from "../shared/npcs";
import { respecCost } from "../shared/upkeep";
import { startRoom, wait } from "./helpers/room";

// ---- A tiny world for the skill engine (no room) --------------------------------------------------------------------

/** Units by id; everyone is an enemy of everyone (no groups). Records hits, heals, shots and events. */
function world() {
  let now = 100_000;
  const units = new Map<string, Unit>();
  const hits: { from: string; to: string; dmg: number; o: HitOpts }[] = [];
  const heals: { id: string; amount: number; from?: string }[] = [];
  const shots: ShotSpec[] = [];
  const fx: any[] = [];
  const fields: FieldInst[] = [];
  const later: { at: number; fn: () => void }[] = [];
  const h: SkillHost = {
    now: () => now,
    later: (ms, fn) => later.push({ at: now + ms, fn }),
    unit: (id) => units.get(id),
    canAct: (id) => !units.get(id)?.dead,
    enemies: (x, y, r, of) => [...units.entries()].filter(([id, u]) => id !== of && !u.dead && Math.hypot(u.x - x, u.y - y) <= r).map(([id]) => id),
    hit: (from, to, dmg, _push, o) => { hits.push({ from, to, dmg, o }); afterHit(h, from, to, o); },
    heal: (id, amount, from) => { heals.push({ id, amount, from }); const u = units.get(id)!; u.hp = Math.min(u.maxHp!, (u.hp ?? 0) + amount); },
    aim: () => [1, 0], face: () => {}, move: () => {}, place: () => true, invuln: () => {},
    shoot: (s) => shots.push(s),
    addField: (f) => fields.push(f),
    fear: () => {}, weaponHit: () => 20, magic: () => 1, cooldownMult: () => 1,
    fx: (e) => fx.push(e),
  };
  const add = (id: string, x: number, extra: Partial<Unit> = {}) => {
    const u: Unit = { x, y: 0, dead: false, level: 30, sk: newRuntime(), hp: 200, maxHp: 200, mana: 9999, maxMana: 9999, ...extra };
    units.set(id, u);
    return u;
  };
  const step = (ms: number) => {
    now += ms;
    for (const l of later.filter((x) => x.at <= now)) { later.splice(later.indexOf(l), 1); l.fn(); }
    for (const f of [...fields]) if (!tickField(h, f)) fields.splice(fields.indexOf(f), 1);
    for (const id of units.keys()) tickUnit(h, id);
  };
  return { h, add, hits, heals, shots, fx, fields, step, units, get now() { return now; } };
}
/** Every Songweaver skill at rank 1 (parents included, so cleanRanks keeps them all). */
const allRanks = () => cleanRanks("songweaver", 30, Object.fromEntries(SKILLS.songweaver.map((s) => [s.id, 1])));
const singer = (w: ReturnType<typeof world>, talents: Record<string, number> = allRanks(), x = 0) =>
  w.add("sw", x, { cls: "songweaver", talents });
/** Casts and clears its cooldown, so a test can play notes back to back. */
const play = (w: ReturnType<typeof world>, id: string, skill: string) => {
  const u = w.units.get(id)!;
  u.sk.last = {}; u.attackReadyAt = 0; u.mana = 9999;
  if (u.sk.song) u.sk.song.at -= SONG.changeMs; // past the song-change wait
  const ok = castSkill(w.h, id, skill);
  w.step(500); // let buildups (Chorale, Anthem, Twelve-Tone Storm) land
  return ok;
};
const chords = (w: ReturnType<typeof world>) => w.fx.filter((e) => e.ev === "chord").map((e) => e.prog);

test("Songweaver data: 18 tree skills, Modulate cantrip, 5 hidden finishers, playable", () => {
  assert.equal(ACTIVE_CLASSES.includes("songweaver"), true);
  assert.equal(CLASSES.songweaver.projectile?.kind, "wave");
  const ids = SKILLS.songweaver.map((s) => s.id).sort();
  assert.deepEqual(ids, ["sg_accel", "sg_anthem", "sg_ballad", "sg_call", "sg_chorale", "sg_crack", "sg_dirge", "sg_dorian", "sg_jig", "sg_legato",
    "sg_lydian", "sg_march", "sg_mend", "sg_pedal", "sg_phrygian", "sg_shrill", "sg_sympathy", "sg_twelve"]);
  assert.deepEqual(CANTRIPS.songweaver.map((s) => s.id), ["sg_modulate"]);
  for (const f of FINISHERS) {
    assert.ok(skillById(f.id), `${f.id} is registered`);
    assert.equal(skillOf("songweaver", f.id), undefined, `${f.id} can't be cast`);
    assert.equal(SKILLS.songweaver.includes(f), false, `${f.id} is not in the tree`);
  }
  for (const p of PROGRESSIONS) assert.ok(FINISHERS.some((f) => f.id === p.skill), p.id);
  // every note of every progression is played by some skill
  for (const p of PROGRESSIONS) for (const n of p.notes) assert.ok(SKILLS.songweaver.some((s) => s.degree === n), `${p.id}: ${n}`);
});

test("a finisher can't be cast through castSkill", () => {
  const w = world();
  singer(w);
  for (const f of FINISHERS) assert.equal(castSkill(w.h, "sw", f.id), false);
});

test("mode multipliers: Minor hits harder and heals less than Major, per MODES", () => {
  const dmg = (mode?: "minor" | "major") => {
    const w = world();
    const u = singer(w);
    u.sk.mode = mode;
    play(w, "sw", "sg_shrill");
    return w.shots[0].dmg;
  };
  const heal = (mode: "minor" | "major" | "lydian") => {
    const w = world();
    const u = singer(w);
    u.sk.mode = mode; u.hp = 10;
    play(w, "sw", "sg_mend");
    return w.heals[0].amount;
  };
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b));
  assert.ok(near(dmg("minor") / dmg("major"), MODES.minor.foe / MODES.major.foe), "damage follows the foe colour");
  assert.ok(near(dmg(undefined), dmg("major")), "no mode = Major");
  assert.ok(near(heal("minor") / heal("major"), MODES.minor.ally / MODES.major.ally), "heals follow the ally colour");
  assert.ok(near(heal("lydian") / heal("major"), MODES.lydian.ally / MODES.major.ally));
});

test("Lydian: healing past full life becomes a shield", () => {
  const w = world();
  const u = singer(w);
  u.sk.mode = "lydian"; u.hp = u.maxHp;
  play(w, "sw", "sg_mend");
  const sh = u.sk.buffs.find((b) => b.id === "sg_lydian");
  assert.ok(sh && (sh.shield ?? 0) > 0, "an overheal shield");
  u.sk.mode = "major";
  const w2 = world(); const v = singer(w2); v.hp = v.maxHp;
  play(w2, "sw", "sg_mend");
  assert.equal(v.sk.buffs.some((b) => b.id === "sg_lydian"), false, "not in Major");
});

test("each of the 5 progressions fires its finisher, coloured by the mode", () => {
  const seqs: Record<string, string[]> = {
    amen: ["sg_pedal", "sg_mend", "sg_ballad"], encore: ["sg_jig", "sg_call", "sg_march"], shatter: ["sg_crack", "sg_shrill", "sg_dirge"],
    resolve: ["sg_mend", "sg_call", "sg_ballad"], sleight: ["sg_mend", "sg_call", "sg_pedal"],
  };
  for (const [prog, seq] of Object.entries(seqs)) {
    const w = world();
    const u = singer(w);
    u.sk.mode = "minor";
    w.add("foe", 30, { hp: 5000, maxHp: 5000 });
    for (const s of seq) assert.ok(play(w, "sw", s), `${prog}: ${s} cast`);
    assert.deepEqual(chords(w), [prog], `${prog} fired once`);
    assert.equal(w.fx.find((e) => e.ev === "chord").mode, "minor");
    assert.ok(w.units.get("sw")!.sk.chordLock > w.now, "then chords lock");
    // every cast sent a note with its degree
    assert.deepEqual(w.fx.filter((e) => e.ev === "note").map((e) => e.deg), seq.map((s) => skillById(s)!.degree));
  }
  // Neapolitan: damage, stun, +50 resonance on what it hits
  const w = world(); singer(w);
  const foe = w.add("foe", 30, { hp: 5000, maxHp: 5000 });
  for (const s of ["sg_crack", "sg_shrill", "sg_dirge"]) play(w, "sw", s);
  const hit = w.hits.find((x) => x.to === "foe" && x.o.stunMs === 800);
  assert.ok(hit, "the Shatterchord stuns");
  assert.equal(hit!.o.sound?.res, 50);
  assert.ok(foe.sk.res > 0 || w.fx.some((e) => e.ev === "resonate"), "it rings");
});

test("chord lockout (12 s), and notes are forgotten after 10 s idle and on death; Modulate is not a note", () => {
  const w = world();
  const u = singer(w);
  for (const s of ["sg_pedal", "sg_mend", "sg_ballad"]) play(w, "sw", s);
  assert.deepEqual(chords(w), ["amen"]);
  for (const s of ["sg_pedal", "sg_mend", "sg_ballad"]) play(w, "sw", s);
  assert.deepEqual(chords(w), ["amen"], "locked: no second chord");
  w.step(NOTES.lockMs);
  for (const s of ["sg_pedal", "sg_mend", "sg_ballad"]) play(w, "sw", s);
  assert.deepEqual(chords(w), ["amen", "amen"], "after the lockout it fires again");
  // idle reset
  w.step(NOTES.lockMs);
  play(w, "sw", "sg_pedal"); play(w, "sw", "sg_mend");
  w.step(NOTES.idleMs + 100);
  assert.deepEqual(u.sk.notes, [], "forgotten after a long pause");
  play(w, "sw", "sg_ballad");
  assert.equal(chords(w).length, 2);
  // death reset
  play(w, "sw", "sg_pedal"); play(w, "sw", "sg_mend");
  u.dead = true; tickUnit(w.h, "sw"); u.dead = false; u.hp = u.maxHp;
  assert.deepEqual(u.sk.notes, []);
  play(w, "sw", "sg_ballad");
  assert.equal(chords(w).length, 2, "no chord across a death");
  // Modulate between notes doesn't break a progression
  play(w, "sw", "sg_pedal"); play(w, "sw", "sg_modulate"); play(w, "sw", "sg_mend"); play(w, "sw", "sg_modulate"); play(w, "sw", "sg_ballad");
  assert.equal(chords(w).length, 3, "Modulate doesn't log");
});

test("Modulate is locked until 2 modes are known, cycles them and recolours the running song", () => {
  const w = world();
  const u = singer(w, { sg_ballad: 1 });
  assert.equal(castSkill(w.h, "sw", "sg_modulate"), false, "Major only: locked");
  u.talents = { sg_ballad: 1, sg_dirge: 1 };
  assert.ok(play(w, "sw", "sg_dirge"));
  const f = w.fields.find((x) => x.skill === "sg_dirge")!;
  const before = f.power;
  assert.ok(play(w, "sw", "sg_modulate"));
  assert.equal(u.sk.mode, "minor");
  assert.equal(f.tune?.mode, "minor", "the song took the new mode");
  assert.ok(Math.abs(f.power / before - MODES.minor.foe / MODES.major.foe) < 1e-9);
  assert.ok(statusOf(u, w.now).split(",").includes("mode:minor"));
  assert.ok(play(w, "sw", "sg_modulate"));
  assert.equal(u.sk.mode, "major", "wraps round");
  const note = w.fx.filter((e) => e.ev === "note" && e.s === "sg_modulate").pop();
  assert.equal(note.mode, "major", "its note carries the new mode");
});

// ---- Room tests --------------------------------------------------------------------------------------------------

/** A walkable spot outside the stockade and the safe zone. */
function openSpot(): [number, number] {
  for (let tx = VILLAGE.x0 - 12; tx > 0; tx--) {
    const x = (tx + 0.5) * TILE, y = (VILLAGE.y0 + 10.5) * TILE;
    if (!isSolidAt(x, y) && !isSafeZone(x, y) && !isSolidAt(x + 40, y)) return [x, y];
  }
  throw new Error("no open spot");
}

/** One game server for every room test in this file (fewer start-ups and shutdowns under the parallel test runner). */
let shared: ReturnType<typeof startRoom> | undefined;
const server = () => (shared ??= startRoom());
after(async () => { if (shared) await (await shared).stop(); });

async function setup(n: number) {
  const srv = await server();
  const cs = [];
  for (let i = 0; i < n; i++) cs.push(await srv.join({ cls: "songweaver" }));
  await wait(200);
  const room = srv.room, [x, y] = openSpot();
  const ids = cs.map((c) => c.sessionId);
  const ps = ids.map((id) => room.state.players.get(id));
  for (const p of ps) {
    p.x = x; p.y = y; p.level = 30; p.invulnUntil = 0; p.sk.buffs = []; p.mana = p.maxMana = 9999;
    for (const [k, v] of Object.entries(allRanks())) p.talents.set(k, v);
  }
  const buff = (i: number, s: string) => ps[i].sk.buffs.find((b: { id: string; until: number }) => b.id === s && b.until > Date.now());
  const songFields = (id: string) => { const out: any[] = []; room.state.fields.forEach((f: any) => { if (f.owner === id && f.inst.song) out.push(f); }); return out; };
  const done = async () => { for (const c of cs) await c.leave(); await wait(50); };
  return { srv, room, cs, ids, ps, x, y, buff, songFields, done };
}

test("songs reach group members only, and end shortly after leaving the song", async () => {
  const t = await setup(3);
  try {
    const [a] = t.ids;
    t.ps[0].party = t.ps[1].party = "gsong"; // ps[2] is not in the group
    t.room.cast(a, "sg_march");
    await wait(300);
    assert.ok(t.buff(0, "sg_march"), "the singer has it");
    assert.ok(t.buff(1, "sg_march"), "the group member inside has it");
    assert.equal(t.buff(2, "sg_march"), undefined, "a hero outside the group does not");
    // step out of the song: its gift lasts one beat + FIELD_PARTY_LINGER_MS + Legato (rank 1 here: +1 s)
    t.ps[1].x += 400;
    await wait(1000 + 600 + 1000 + 400);
    assert.equal(t.buff(1, "sg_march"), undefined, "gone shortly after leaving");
    assert.ok(t.buff(0, "sg_march"), "the singer inside keeps it");
  } finally { await t.done(); }
});

test("one song per Songweaver: a new song ends the last; changing waits 2 s", async () => {
  const t = await setup(1);
  try {
    const [a] = t.ids, p = t.ps[0];
    t.room.cast(a, "sg_ballad");
    assert.equal(t.songFields(a).length, 1);
    p.sk.last = {}; p.attackReadyAt = 0;
    t.room.cast(a, "sg_dirge"); // within 2 s: refused
    assert.equal(p.sk.song.id, "sg_ballad", "no change within SONG.changeMs");
    p.sk.song.at -= SONG.changeMs;
    t.room.cast(a, "sg_dirge");
    await wait(150);
    const songs = t.songFields(a);
    assert.equal(songs.length, 1, "only one song plays");
    assert.equal(songs[0].skill, "sg_dirge");
    assert.equal(p.sk.song.id, "sg_dirge");
  } finally { await t.done(); }
});

test("same song from two Songweavers doesn't stack; different songs do", async () => {
  const t = await setup(3);
  try {
    const [a, b] = t.ids;
    for (const p of t.ps) p.party = "gduo";
    t.room.cast(a, "sg_march");
    t.room.cast(b, "sg_march");
    await wait(300);
    assert.equal(t.ps[2].sk.buffs.filter((x: { id: string }) => x.id === "sg_march").length, 1, "one March buff");
    t.ps[1].sk.song.at -= SONG.changeMs; t.ps[1].sk.last = {};
    t.room.cast(b, "sg_ballad");
    await wait(1200);
    assert.ok(t.buff(2, "sg_march") && t.buff(2, "sg_ballad"), "March and Ballad together");
  } finally { await t.done(); }
});

test("Oakvale: major Hymnal / Folk songs with no enemy effect are busking; minor modes and Discord make an outlaw", async () => {
  const t = await setup(1);
  try {
    const [a] = t.ids, p = t.ps[0];
    // inside the stockade, off the market square
    let spot: [number, number] | undefined;
    for (let tx = VILLAGE.x0 + 2; tx < VILLAGE.x1 - 1 && !spot; tx++) for (let ty = VILLAGE.y0 + 2; ty < VILLAGE.y1 - 1 && !spot; ty++) {
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
      if (!isSolidAt(x, y) && inVillage(x, y)) spot = [x, y];
    }
    [p.x, p.y] = spot!;
    const again = () => { p.sk.last = {}; p.attackReadyAt = 0; if (p.sk.song) p.sk.song.at -= SONG.changeMs; p.outlaw = false; };
    p.sk.mode = "major";
    t.room.cast(a, "sg_ballad");
    assert.ok(p.sk.song?.id === "sg_ballad", "cast");
    assert.equal(p.outlaw, false, "a major Hymnal song is busking");
    again(); t.room.cast(a, "sg_jig");
    assert.equal(p.outlaw, false, "a major Folk party buff is busking");
    again(); p.sk.mode = "lydian"; t.room.cast(a, "sg_march");
    assert.equal(p.outlaw, false, "Lydian is bright too");
    again(); p.sk.mode = "minor"; t.room.cast(a, "sg_ballad");
    assert.equal(p.outlaw, true, "a minor mode breaks the rule");
    again(); p.sk.mode = "major"; t.room.cast(a, "sg_dirge");
    assert.equal(p.outlaw, true, "Discord breaks the rule");
    again(); t.room.cast(a, "sg_call");
    assert.equal(p.outlaw, true, "a Folk skill that hits foes breaks the rule");
    // Modulate never breaks it, whatever key it lands in: changing key touches nobody
    again(); p.sk.mode = "major"; t.room.cast(a, "sg_modulate");
    assert.equal(p.sk.mode, "minor", "Modulated into Minor");
    assert.equal(p.outlaw, false, "Modulate into Minor stays lawful");
    again(); p.sk.mode = "dorian"; t.room.cast(a, "sg_modulate");
    assert.equal(p.sk.mode, "phrygian", "Modulated from one dark mode into another");
    assert.equal(p.outlaw, false, "Modulate from a dark mode stays lawful");
    // ...but a song played in the dark key it left is still forbidden magic
    again(); p.sk.mode = "major"; t.room.cast(a, "sg_modulate");
    assert.equal(p.outlaw, false);
    again(); t.room.cast(a, "sg_ballad");
    assert.equal(p.sk.song?.id, "sg_ballad", "the Ballad went off in Minor");
    assert.equal(p.outlaw, true, "a Hearth Ballad in Minor in town still outlaws");
  } finally { await t.done(); }
});

test("Oakvale: a finisher with an enemy part outlaws even when the note that fires it is lawful; Amen in Major doesn't", async () => {
  const t = await setup(1);
  try {
    const [a] = t.ids, p = t.ps[0];
    let town: [number, number] | undefined;
    for (let tx = VILLAGE.x0 + 2; tx < VILLAGE.x1 - 1 && !town; tx++) for (let ty = VILLAGE.y0 + 2; ty < VILLAGE.y1 - 1 && !town; ty++) {
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
      if (!isSolidAt(x, y) && inVillage(x, y)) town = [x, y];
    }
    const fired: string[] = [];
    const bc = t.room.broadcast;
    t.room.broadcast = function (type: string, msg: any, ...rest: unknown[]) {
      if (type === "sfx" && msg?.ev === "chord") fired.push(msg.prog);
      return bc.call(this, type, msg, ...rest);
    };
    const again = () => { p.sk.last = {}; p.attackReadyAt = 0; if (p.sk.song) p.sk.song.at -= SONG.changeMs; };
    const fresh = () => { p.sk.notes = []; p.sk.chordLock = 0; p.outlaw = false; p.sk.mode = "major"; };
    try {
      // Perfect Cadence (IV V I: heals, and hurts foes): IV and V played outside the stockade, the lawful I inside
      fresh(); [p.x, p.y] = [t.x, t.y];
      again(); t.room.cast(a, "sg_mend"); again(); t.room.cast(a, "sg_call");
      assert.equal(p.outlaw, false, "nothing is forbidden outside");
      [p.x, p.y] = town!;
      again(); t.room.cast(a, "sg_ballad");
      assert.equal(fired.at(-1), "resolve", "Perfect Cadence fired in town");
      assert.equal(p.outlaw, true, "a finisher with an enemy part outlaws");
      // Amen (vi IV I: heal and shield, no enemy part), every note in town, in Major: busking
      fresh(); again(); t.room.cast(a, "sg_pedal"); again(); t.room.cast(a, "sg_mend"); again(); t.room.cast(a, "sg_ballad");
      assert.equal(fired.at(-1), "amen", "Amen fired in town");
      assert.equal(p.outlaw, false, "Amen in Major stays lawful");
    } finally { t.room.broadcast = bc; }
  } finally { await t.done(); }
});

test("a charged note counts at release: a stunned Chorale logs no note and fires no Amen; a released one does, and the Oakvale rule sees it", async () => {
  const t = await setup(1);
  try {
    const [a] = t.ids, p = t.ps[0];
    let town: [number, number] | undefined;
    for (let tx = VILLAGE.x0 + 2; tx < VILLAGE.x1 - 1 && !town; tx++) for (let ty = VILLAGE.y0 + 2; ty < VILLAGE.y1 - 1 && !town; ty++) {
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
      if (!isSolidAt(x, y) && inVillage(x, y)) town = [x, y];
    }
    const fired: string[] = [], fizzled: string[] = [];
    const bc = t.room.broadcast;
    t.room.broadcast = function (type: string, msg: any, ...rest: unknown[]) {
      if (type === "sfx" && msg?.ev === "chord") fired.push(msg.prog);
      if (type === "sfx" && msg?.ev === "fizzle") fizzled.push(msg.s);
      return bc.call(this, type, msg, ...rest);
    };
    const again = () => { p.sk.last = {}; p.attackReadyAt = 0; p.stunUntil = 0; p.mana = 9999; if (p.sk.song) p.sk.song.at -= SONG.changeMs; };
    const fresh = () => { p.sk.notes = []; p.sk.chordLock = 0; p.outlaw = false; p.sk.mode = "major"; fired.length = 0; };
    const charge = SKILLS.songweaver.find((s) => s.id === "sg_chorale")!.chargeMs!;
    try {
      // vi, IV, then Chorale (I) stunned during its charge: it fizzles, the I is never logged, no Amen
      fresh(); [p.x, p.y] = [t.x, t.y];
      again(); t.room.cast(a, "sg_pedal"); again(); t.room.cast(a, "sg_mend");
      again(); t.room.cast(a, "sg_chorale");
      assert.deepEqual(fired, [], "no Amen at the start of the charge");
      p.stunUntil = Date.now() + 5000;
      await wait(charge + 300);
      assert.deepEqual(fizzled, ["sg_chorale"], "the stun broke the Chorale");
      assert.deepEqual(fired, [], "a fizzled Chorale fires no Amen");
      assert.equal(p.sk.notes.length, 2, "the fizzled I is not logged");
      // the same without the stun: Amen fires when the Chorale goes off
      fresh();
      again(); t.room.cast(a, "sg_pedal"); again(); t.room.cast(a, "sg_mend");
      again(); t.room.cast(a, "sg_chorale");
      assert.deepEqual(fired, [], "not before the release");
      await wait(charge + 300);
      assert.deepEqual(fired, ["amen"], "Amen fires on release");
      // Perfect Cadence (IV V I, it hurts foes): IV and V outside, the Chorale's I in town outlaws when it goes off
      fresh();
      again(); t.room.cast(a, "sg_mend"); again(); t.room.cast(a, "sg_call");
      [p.x, p.y] = town!;
      again(); t.room.cast(a, "sg_chorale");
      assert.equal(p.outlaw, false, "the Chorale itself is lawful");
      await wait(charge + 300);
      assert.deepEqual(fired, ["resolve"], "Perfect Cadence fired on release");
      assert.equal(p.outlaw, true, "the finisher a charged note set off outlaws");
    } finally { t.room.broadcast = bc; }
  } finally { await t.done(); }
});

test("swTree / swMode: saved, loaded, an old tree refunds, an unknown mode falls back to Major", async () => {
  const t = await setup(1);
  try {
    const p = t.ps[0];
    p.sk.mode = "phrygian";
    const save = t.room.snapshot(p);
    assert.equal(save.swTree, SONGWEAVER_TREE);
    assert.equal(save.swMode, "phrygian");
    p.talents.clear(); p.sk.mode = undefined;
    t.room.restore(p, save);
    assert.equal(p.sk.mode, "phrygian");
    assert.equal(p.talents.get("sg_phrygian"), 1, "a save of today's tree keeps its points");
    // the mode needs its skill: without Phrygian learned it falls back to Major
    p.talents.clear();
    t.room.restore(p, { ...save, talents: { sg_dirge: 1 } });
    assert.equal(p.sk.mode, "major");
    t.room.restore(p, { ...save, swMode: "locrian" });
    assert.equal(p.sk.mode, "major", "unknown mode");
    // a save from another tree version: every point back
    p.talents.clear();
    t.room.restore(p, { ...save, swTree: undefined });
    assert.equal(p.talents.size, 0, "old tree: skill points come back");
    assert.equal(p.sk.mode, "major");
    // other classes never get the fields
    const w = { ...p, cls: "wizard" };
    assert.equal(t.room.snapshot(w).swTree, undefined);
  } finally { await t.done(); }
});

test("the owner-only chord message: notes, mode and lockout, sent when they change", async () => {
  const srv = await server();
  try {
    const c = await srv.join({ cls: "songweaver" });
    const got: any[] = [];
    c.onMessage("chord", (m: any) => got.push(m));
    await wait(200);
    const p = srv.room.state.players.get(c.sessionId), [x, y] = openSpot();
    p.x = x; p.y = y; p.level = 30; p.mana = p.maxMana = 9999;
    for (const [k, v] of Object.entries(allRanks())) p.talents.set(k, v);
    await wait(150);
    const n0 = got.length;
    srv.room.cast(c.sessionId, "sg_pedal");
    await wait(200);
    assert.deepEqual(got.at(-1)?.notes, ["vi"]);
    assert.equal(got.at(-1)?.mode, "major");
    await wait(300);
    assert.equal(got.length, n0 + 1, "nothing new while nothing changed");
    await c.leave();
  } finally { await wait(50); }
});

test("Accelerando: Tempo quickens a song's beat, never below 500 ms", () => {
  const w = world();
  const u = singer(w, { sg_march: 1, sg_call: 1, sg_accel: 3 }); // 15% per Tempo stack
  play(w, "sw", "sg_march");
  const f = w.fields.find((x) => x.skill === "sg_march")!;
  u.sk.stacks = 2; u.sk.stackAt = w.now;
  f.nextTick = 0; tickField(w.h, f);
  assert.equal(f.nextTick - w.now, Math.round(1000 * (1 - 0.15 * 2)));
  u.sk.stacks = 5; u.sk.stackAt = w.now;
  f.nextTick = 0; tickField(w.h, f);
  assert.equal(f.nextTick - w.now, SONG.tickFloorMs, "floor");
});

test("Modulate through the room at real gaps: every press advances the mode, the fx word and the chord message follow", async () => {
  const srv = await server();
  // every mode, then Major + Minor + Phrygian only (Lydian and Dorian not learned: the cycle skips them, never repeats)
  const all = allRanks(), some = cleanRanks("songweaver", 30, { ...all, sg_lydian: 0, sg_dorian: 0 });
  for (const ranks of [all, some]) {
    const c = await srv.join({ cls: "songweaver" });
    const chords: { mode: string }[] = [];
    c.onMessage("chord", (m: { mode: string }) => chords.push(m));
    await wait(200);
    const p = srv.room.state.players.get(c.sessionId), [x, y] = openSpot();
    p.x = x; p.y = y; p.level = 30; p.mana = p.maxMana = 9999; p.hp = p.maxHp = 99999;
    p.invulnUntil = Date.now() + 60_000; // no stray monster blow (flinch, poise break) holds a press back
    for (const [k, v] of Object.entries(ranks)) if (v > 0) p.talents.set(k, v);
    const known = knownModes((id) => Number(ranks[id] ?? 0));
    assert.deepEqual(known, ranks === all ? MODE_IDS : ["major", "minor", "phrygian"]);
    await wait(150);
    const seen: string[] = [];
    for (let i = 0; i < known.length + 1; i++) { // once round and back to the first
      c.send("cast", "sg_modulate"); // the real client message, not room.cast
      await wait(650); // just past the 600 ms cantrip cooldown, plus the network and a tick
      const want = known[(i + 1) % known.length];
      assert.equal(p.sk.mode, want, `press ${i + 1}: the mode advanced`);
      const fx = String(c.state.players.get(c.sessionId).fx).split(",").find((w) => w.startsWith("mode:"));
      assert.equal(fx, "mode:" + want, `press ${i + 1}: the synced fx word follows`);
      assert.equal(chords.at(-1)?.mode, want, `press ${i + 1}: the chord message follows`);
      seen.push(want);
    }
    assert.deepEqual([...new Set(seen)].sort(), [...known].sort(), "every known mode came up");
    await c.leave();
  }
  await wait(50);
});

test("Mending Note heals the singer, then jumps to the nearest group ally", async () => {
  const t = await setup(3);
  try {
    const [a] = t.ids;
    t.ps[0].party = t.ps[1].party = "gmend";
    for (const p of t.ps) p.hp = 10;
    t.ps[1].x += 40; t.ps[2].x += 20; // ps[2] is closer but not in the group
    t.room.cast(a, "sg_mend");
    assert.ok(t.ps[0].hp > 10, "the singer heals");
    assert.ok(t.ps[1].hp > 10, "the group ally heals");
    assert.ok(t.ps[1].hp - 10 < t.ps[0].hp - 10, "x0.8 on the hop");
    assert.equal(t.ps[2].hp, 10, "not a stranger");
  } finally { await t.done(); }
});

test("Oakvale: a busking tune near a villager gets its BUSKING_LINES line, once per cooldown, heard nearby only", async () => {
  const t = await setup(2);
  // what the server sends each client (the line goes to heroes near the villager, not to everyone)
  const got = new Map<string, { id: string; name: string; text: string }[]>(t.ids.map((id) => [id, []]));
  for (const c of t.room.clients) {
    const send = c.send.bind(c);
    c.send = (type: any, msg?: any, ...rest: any[]) => {
      if (type === "chat" && String(msg?.id).startsWith("npc:")) got.get(c.sessionId)?.push(msg);
      return send(type, msg, ...rest);
    };
  }
  const lines = got.get(t.ids[0])!, far = got.get(t.ids[1])!;
  const bc = t.room.broadcast;
  let broadcasts = 0;
  t.room.broadcast = function (type: string, msg: any, ...rest: unknown[]) {
    if (type === "chat" && String(msg?.id).startsWith("npc:")) broadcasts++;
    return bc.call(this, type, msg, ...rest);
  };
  try {
    const [a] = t.ids, p = t.ps[0], druid = npcById("druid")!, q = t.ps[1];
    [q.x, q.y] = [20 * TILE, 20 * TILE];
    assert.ok(Math.hypot(druid.x - q.x, druid.y - q.y) > BUSKING.hearRange, "the second hero stands far from the druid");
    const again = () => { p.sk.last = {}; p.attackReadyAt = 0; if (p.sk.song) p.sk.song.at -= SONG.changeMs; p.outlaw = false; };
    [p.x, p.y] = [druid.x + TILE, druid.y];
    p.sk.mode = "major";
    t.room.cast(a, "sg_ballad");
    assert.deepEqual(lines, [{ id: "npc:druid", name: druid.name, text: BUSKING_LINES.druid }], "the nearest villager answers");
    // the next tune: the druid waits out its cooldown, so another villager in range (Tobin, 2.6 tiles) may answer
    again(); t.room.cast(a, "sg_jig");
    assert.ok(lines.length <= 2 && lines.slice(1).every((l) => l.id !== "npc:druid"), "the druid not again within the cooldown");
    for (let i = 0; i < 6; i++) { again(); t.room.cast(a, i % 2 ? "sg_jig" : "sg_ballad"); }
    assert.equal(new Set(lines.map((l) => l.id)).size, lines.length, "every villager speaks at most once per cooldown");
    for (const id of Object.keys(BUSKING_LINES)) t.room.buskers.next.set(id, Date.now() - 1); // every cooldown runs out
    lines.length = 0;
    again(); p.sk.mode = "minor"; t.room.cast(a, "sg_march");
    assert.equal(lines.length, 0, "a minor key gets no line");
    again(); p.sk.mode = "major"; t.room.cast(a, "sg_dirge");
    assert.equal(lines.length, 0, "Discord gets no line");
    again(); [p.x, p.y] = [20 * TILE, 20 * TILE];
    assert.ok(Object.keys(BUSKING_LINES).every((id) => Math.hypot(npcById(id)!.x - p.x, npcById(id)!.y - p.y) > BUSKING.range));
    t.room.cast(a, "sg_ballad");
    assert.equal(lines.length, 0, "too far from every villager");
    again(); [p.x, p.y] = [druid.x, druid.y + TILE]; p.sk.mode = "lydian"; t.room.cast(a, "sg_march");
    assert.deepEqual(lines.map((l) => l.id), ["npc:druid"], "Lydian is bright too; after the cooldown the druid speaks again");
    assert.equal(far.length, 0, "a hero far from the villager hears none of it");
    assert.equal(broadcasts, 0, "never a server-wide line");
    // a hero standing near the villager (not the singer) hears it too
    for (const id of Object.keys(BUSKING_LINES)) t.room.buskers.next.set(id, Date.now() - 1);
    lines.length = 0;
    [q.x, q.y] = [druid.x + 6 * TILE, druid.y];
    again(); t.room.cast(a, "sg_ballad");
    assert.deepEqual(far.map((l) => l.id), ["npc:druid"], "within 12 tiles of the villager: heard");
  } finally { t.room.broadcast = bc; await t.done(); }
});

test("respec: the mode falls back to Major, the running song ends, a Hymnal song in Oakvale stays lawful", async () => {
  const t = await setup(1);
  try {
    const [a] = t.ids, p = t.ps[0];
    const again = () => { p.sk.last = {}; p.attackReadyAt = 0; if (p.sk.song) p.sk.song.at -= SONG.changeMs; p.outlaw = false; };
    p.talents.clear(); p.talents.set("sg_dirge", 1); // Dirge has no parent; it brings Minor
    p.sk.mode = "major";
    t.room.cast(a, "sg_dirge");
    assert.equal(p.sk.song?.id, "sg_dirge", "the Dirge plays");
    again(); t.room.cast(a, "sg_modulate");
    assert.equal(p.sk.mode, "minor");
    assert.equal(p.sk.song?.f.tune?.mode, "minor", "the song took Minor");
    const song = p.sk.song!.f;
    p.lastHurt = 0; p.gold = respecCost(p.level);
    t.room.respec(a);
    assert.equal(p.talents.size, 0, "reset went through");
    assert.equal(p.sk.mode, "major", "Minor is no longer known: back to Major");
    assert.equal(p.sk.song, undefined, "no song running");
    assert.ok(song.until <= Date.now(), "the Dirge ended");
    await wait(150);
    const live = t.songFields(a).filter((f) => f.inst.until > Date.now());
    assert.ok(live.every((f) => f.inst.tune?.mode !== "minor"), "no minor-coloured song left");
    // in Oakvale with a freshly learned Hearth Ballad: Major, so busking
    let spot: [number, number] | undefined;
    for (let tx = VILLAGE.x0 + 2; tx < VILLAGE.x1 - 1 && !spot; tx++) for (let ty = VILLAGE.y0 + 2; ty < VILLAGE.y1 - 1 && !spot; ty++) {
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
      if (!isSolidAt(x, y) && inVillage(x, y)) spot = [x, y];
    }
    [p.x, p.y] = spot!;
    p.talents.set("sg_ballad", 1);
    again(); t.room.cast(a, "sg_ballad");
    assert.equal(p.sk.song?.id, "sg_ballad", "cast");
    assert.equal(p.sk.song?.f.tune?.mode, "major");
    assert.equal(p.outlaw, false, "a Hymnal song after the reset is busking");
  } finally { await t.done(); }
});
