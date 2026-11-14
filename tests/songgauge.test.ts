// DI-3 (docs/songweaver-di-plan.md): the Songweaver's mana bubble is a song gauge. Notes, waves, chords and executions
// fill it; idle, it drains; full, her book's effect fires and it empties. No Mana costs, no regen, no potions, no Tempo.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { CANTRIPS, cleanRanks, FINISHERS, SKILLS, skillById } from "../shared/skills";
import { afterHit, castSkill, FieldInst, fillGauge, gaugeSwing, HitOpts, newRuntime, SkillHost, tickField, tickUnit, Unit } from "../shared/skillEngine";
import { GAUGE, MODES, SONG } from "../shared/songs";
import { usesGauge } from "../shared/mana";
import { EXECUTE, executeRefund } from "../shared/combat";
import { BAG_SIZE, gearDef, isBound, starterKit } from "../shared/gear";
import { shopBuys, SHOPS } from "../shared/shops";
import { offerFrom } from "../shared/trade";
import { isSafeZone, isSolidAt, VILLAGE } from "../shared/map";
import { TILE } from "../shared/constants";
import { SONG_POTION_TEXT } from "../server/songs";
import { startRoom, wait } from "./helpers/room";

// ---- A tiny world for the skill engine (as in songweaver.test.ts) ---------------------------------------------------

function world() {
  let now = 100_000;
  const units = new Map<string, Unit>();
  const hits: { from: string; to: string; dmg: number; o: HitOpts }[] = [];
  const heals: { id: string; amount: number; from?: string }[] = [];
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
    shoot: () => {}, addField: (f) => fields.push(f),
    fear: () => {}, weaponHit: () => 20, magic: () => 1, cooldownMult: () => 1,
    fx: (e) => fx.push(e),
  };
  const add = (id: string, x: number, extra: Partial<Unit> = {}) => {
    const u: Unit = { x, y: 0, dead: false, level: 30, sk: newRuntime(), hp: 200, maxHp: 200, ...extra };
    units.set(id, u);
    return u;
  };
  const step = (ms: number) => {
    now += ms;
    for (const l of later.filter((x) => x.at <= now)) { later.splice(later.indexOf(l), 1); l.fn(); }
    for (const f of [...fields]) if (!tickField(h, f)) fields.splice(fields.indexOf(f), 1);
    for (const id of units.keys()) tickUnit(h, id);
  };
  return { h, add, hits, heals, fx, fields, step, units, get now() { return now; } };
}
const allRanks = () => cleanRanks("songweaver", 30, Object.fromEntries(SKILLS.songweaver.map((s) => [s.id, 1])));
const singer = (w: ReturnType<typeof world>, extra: Partial<Unit> = {}) =>
  w.add("sw", 0, { cls: "songweaver", talents: allRanks(), mana: 0, maxMana: GAUGE.max, ...extra });
/** Casts with its cooldown cleared; steps 500 ms so buildups land. */
const play = (w: ReturnType<typeof world>, skill: string) => {
  const u = w.units.get("sw")!;
  u.sk.last = {}; u.attackReadyAt = 0;
  if (u.sk.song) u.sk.song.at -= SONG.changeMs;
  const ok = castSkill(w.h, "sw", skill);
  w.step(500);
  return ok;
};
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const swells = (w: ReturnType<typeof world>) => w.fx.filter((e) => e.ev === "swell");

test("data: no Songweaver skill costs Mana; Storm spends the gauge; the Songbook kit is a bound book with the Refrain", () => {
  for (const s of [...SKILLS.songweaver, ...CANTRIPS.songweaver]) assert.equal(s.mana, undefined, `${s.id} costs no Mana`);
  assert.equal(skillById("sg_twelve")!.spendGauge, true);
  assert.equal(usesGauge("songweaver"), true);
  assert.equal(usesGauge("wizard"), false);
  assert.equal(EXECUTE.manaClasses.songweaver, undefined, "no Mana refund for her");
  const kit = starterKit("songweaver");
  assert.equal(kit.shield, "songweaver_shield");
  const book = gearDef("songweaver_shield")!;
  assert.equal(book.slot, "shield");
  assert.deepEqual(book.bonus, {}, "no stats");
  assert.deepEqual(book.book, { full: "sg_g_refrain", songs: true });
  assert.ok(isBound("songweaver_shield"));
  assert.ok(!isBound("sh_wood") && !isBound("songweaver_weapon") && !isBound(undefined));
  const refrain = FINISHERS.find((f) => f.id === "sg_g_refrain")!;
  assert.ok(refrain && refrain.refrain?.beats === 3 && refrain.finisher, "a hidden full-gauge skill");
});

test("bound: the Songbook can't be offered in a trade nor sold to a shop", () => {
  const bag = ["songweaver_shield", "sh_wood"];
  assert.deepEqual(offerFrom(bag, 0, [0, 1], 0).items, ["sh_wood"]);
  for (const shop of Object.values(SHOPS)) if (shop.buys?.includes("shield")) {
    assert.equal(shopBuys(shop, "songweaver_shield"), false);
    assert.equal(shopBuys(shop, "sh_wood"), true);
  }
});

test("fill: +8 per note, 0 for Modulate, +2 per landed basic wave, +4 on the strum, +20 per chord, +10 on an execution", () => {
  const w = world();
  const u = singer(w);
  w.add("foe", 30, { hp: 99999, maxHp: 99999 });
  play(w, "sg_mend");
  assert.equal(u.mana, GAUGE.note);
  play(w, "sg_modulate");
  assert.equal(u.mana, GAUGE.note, "a key change fills nothing");
  afterHit(w.h, "sw", "foe", { basic: true, sound: { basic: true, pitch: "M", deg: "I" } });
  assert.equal(u.mana, GAUGE.note + GAUGE.basic);
  afterHit(w.h, "sw", "foe", { basic: true, sound: { basic: true, strum: true, pitch: "M", deg: "I" } });
  assert.equal(u.mana, GAUGE.note + GAUGE.basic + GAUGE.strum);
  assert.equal(u.sk.stacks, 0, "no Tempo stacks from basic hits");
  // Amen (vi IV I): three notes and the chord
  u.mana = 0; u.sk.notes = [];
  for (const s of ["sg_pedal", "sg_mend", "sg_ballad"]) play(w, s);
  assert.ok(w.fx.some((e) => e.ev === "chord" && e.prog === "amen"));
  assert.equal(u.mana, 3 * GAUGE.note + GAUGE.chord);
  // an execution (shared/combat.ts executeRefund): +10, no Heat change
  u.mana = 50; u.energy = 40;
  assert.deepEqual(executeRefund(u, "songweaver", 100), { heat: 0, mana: GAUGE.execute });
  assert.equal(u.mana, 50 + GAUGE.execute);
  assert.equal(u.energy, 40);
  // another class keeps its Tempo-like stacks
  const k = w.add("k", 500, { cls: "knight" });
  afterHit(w.h, "k", "foe", { basic: true });
  assert.equal(k.sk.stacks, 1);
  assert.equal(k.mana, undefined, "fillGauge leaves others alone");
  fillGauge(w.h, "k", 50);
  assert.equal(k.mana, undefined);
});

test("drain: after 4 s with no note and no swing it drains 20/s; a swing holds it off", () => {
  const w = world();
  const u = singer(w);
  u.mana = 50; u.sk.gaugeAt = w.now;
  tickUnit(w.h, "sw");
  for (let i = 0; i < 4; i++) w.step(1000);
  assert.equal(u.mana, 50, "nothing in the first 4 s");
  w.step(1000);
  assert.ok(near(u.mana!, 50 - GAUGE.drainPerSec), `one second of drain: ${u.mana}`);
  gaugeSwing(u, w.now);
  for (let i = 0; i < 4; i++) w.step(1000);
  assert.ok(near(u.mana!, 30), "a swing restarts the wait");
  w.step(500);
  assert.ok(near(u.mana!, 30 - GAUGE.drainPerSec / 2), `half a second of drain: ${u.mana}`);
  w.step(5000);
  assert.equal(u.mana, 0, "never below 0");
  // a note restarts the wait too
  u.mana = 50;
  play(w, "sg_mend");
  for (let i = 0; i < 3; i++) w.step(1000);
  assert.equal(u.mana, 50 + GAUGE.note);
});

test("full: the Songbook's Refrain beats the Chorus 3 times and resets it to 30 s; then the gauge is empty", () => {
  const w = world();
  const u = singer(w, { hp: 100 });
  u.sk.book = "songweaver_shield";
  play(w, "sg_ballad");
  const f = u.sk.song!.f;
  w.step(10_000);
  const ticks = f.ticks!;
  u.mana = GAUGE.max - GAUGE.note;
  play(w, "sg_mend"); // the note fills it
  const sw = swells(w);
  assert.equal(sw.length, 1);
  assert.equal(sw[0].book, "songweaver_shield");
  assert.equal(sw[0].fizzle, undefined);
  assert.equal(u.mana, 0, "emptied");
  assert.ok(f.ticks! >= ticks + 3, `three extra beats (${ticks} -> ${f.ticks})`);
  assert.ok(f.until - w.now > SONG.ms - 1000, "the Chorus runs 30 s again");
});

test("full with no Chorus: the Refrain heals the party 8%; no book or another shield: the swell fizzles", () => {
  const w = world();
  const u = singer(w, { hp: 10 });
  u.sk.book = "songweaver_shield"; u.sk.mode = "major";
  u.mana = GAUGE.max - 1;
  fillGauge(w.h, "sw", 5);
  assert.equal(u.mana, 0);
  const heal = w.heals.find((x) => x.id === "sw");
  assert.ok(heal, "she heals");
  assert.ok(near(heal!.amount, 200 * 8 / 100 * MODES.major.ally, 1e-3), `8% coloured by Major: ${heal!.amount}`);
  for (const book of [undefined, "sh_wood"]) {
    const v = world();
    const s = singer(v, { hp: 10 });
    s.sk.book = book;
    s.mana = GAUGE.max - 1;
    fillGauge(v.h, "sw", 5);
    assert.deepEqual(swells(v).map((e) => [e.book, e.fizzle]), [[null, true]], `fizzle with ${book}`);
    assert.equal(s.mana, 0);
    assert.equal(v.heals.length, 0, "no effect");
  }
});

test("a gauge filled from outside the engine (execution, Echo rune) swells on the next tick", () => {
  const w = world();
  const u = singer(w);
  u.sk.book = "songweaver_shield";
  u.mana = 95;
  executeRefund(u, "songweaver", 100);
  assert.equal(u.mana, GAUGE.max);
  w.step(50);
  assert.equal(swells(w).length, 1);
  assert.equal(u.mana, 0);
});

test("Twelve-Tone Storm empties the gauge with no book effect, at x(0.7 + 0.6 x fill / 100)", () => {
  const dmg = (fill: number) => {
    const w = world();
    const u = singer(w);
    u.sk.book = "songweaver_shield";
    w.add("foe", 30, { hp: 99999, maxHp: 99999 });
    u.mana = fill;
    assert.ok(play(w, "sg_twelve"));
    assert.equal(swells(w).length, 0, "no swell");
    assert.equal(u.mana, GAUGE.note, "spent; its own note (at release) is all that is left");
    return w.hits.find((x) => x.to === "foe")!.dmg;
  };
  const empty = dmg(0), half = dmg(50), full = dmg(99);
  assert.ok(near(half / empty, (0.7 + 0.6 * 0.5) / 0.7, 1e-6));
  assert.ok(near(full / empty, (0.7 + 0.6 * 0.99) / 0.7, 1e-6));
});

test("Accelerando reads the gauge: a full one equals the old 5 Tempo stacks", () => {
  const w = world();
  const u = singer(w, { talents: cleanRanks("songweaver", 30, { sg_march: 1, sg_call: 1, sg_accel: 1 }) }); // 5% per stack
  play(w, "sg_march");
  const f = w.fields.find((x) => x.skill === "sg_march")!;
  u.mana = 99.99;
  f.nextTick = 0; tickField(w.h, f);
  assert.ok(near(f.nextTick - w.now, 1000 * (1 - 0.05 * 5 * 0.9999)), `${f.nextTick - w.now}`);
  u.mana = 20;
  f.nextTick = 0; tickField(w.h, f);
  assert.ok(near(f.nextTick - w.now, 1000 * (1 - 0.05 * 1)));
});

test("death empties the gauge", () => {
  const w = world();
  const u = singer(w);
  u.mana = 60;
  u.dead = true;
  tickUnit(w.h, "sw");
  assert.equal(u.mana, 0);
});

test("re-playing the Chorus that plays with more than 10 s left: no note, no fill; with less: a note again", () => {
  const w = world();
  const u = singer(w);
  play(w, "sg_ballad");
  assert.equal(u.mana, GAUGE.note);
  const notes = () => w.fx.filter((e) => e.ev === "note").length;
  const n0 = notes();
  assert.ok(play(w, "sg_ballad"), "it still casts (the song starts over)");
  assert.equal(notes(), n0, "no note");
  assert.deepEqual(u.sk.notes, ["I"], "nothing logged");
  assert.equal(u.mana, GAUGE.note, "no fill");
  u.sk.song!.f.until = w.now + GAUGE.refreshMs - 500;
  play(w, "sg_ballad");
  assert.equal(notes(), n0 + 1);
  assert.equal(u.mana, 2 * GAUGE.note);
  // another Chorus is a change of song, not a refresh: it sounds
  play(w, "sg_march");
  assert.equal(u.mana, 3 * GAUGE.note);
});

// ---- Room ----------------------------------------------------------------------------------------------------

let shared: ReturnType<typeof startRoom> | undefined;
const server = () => (shared ??= startRoom());
after(async () => { if (shared) await (await shared).stop(); });

function openSpot(): [number, number] {
  for (let tx = VILLAGE.x0 - 12; tx > 0; tx--) {
    const x = (tx + 0.5) * TILE, y = (VILLAGE.y0 + 10.5) * TILE;
    if (!isSolidAt(x, y) && !isSafeZone(x, y) && !isSolidAt(x + 40, y)) return [x, y];
  }
  throw new Error("no open spot");
}

test("room: a new Songweaver wears the Songbook, starts at 0 of 100, never regenerates, has no Tempo", async () => {
  const srv = await server();
  const c = await srv.join({ cls: "songweaver" });
  try {
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    assert.equal(p.shield, "songweaver_shield");
    assert.equal(p.sk.book, "songweaver_shield", "mirrored into the engine");
    assert.equal(p.maxMana, GAUGE.max);
    p.lastHurt = 0;
    await wait(800);
    assert.equal(p.mana, 0, "no regen, even resting");
    assert.equal(p.stacks, 0);
    const [x, y] = openSpot();
    p.x = x; p.y = y; p.level = 30;
    p.sk.stacks = 4; // whatever got there, the synced counter shows none
    await wait(150);
    assert.equal(p.stacks, 0);
    // dead: empty (instead of the full refill everyone else gets)
    p.mana = 60; p.dead = true;
    await wait(150);
    assert.equal(p.mana, 0);
    p.dead = false; p.hp = p.maxHp;
    // the shrine-like and respawn refills are skipped too: applyStats keeps the gauge where it is
    p.mana = 30; room.applyStats(p);
    assert.equal(p.mana, 30);
    assert.equal(p.maxMana, GAUGE.max);
  } finally { await c.leave(); await wait(50); }
});

test("room: a mana potion is refused for her with a gearno message and none is used up", async () => {
  const srv = await server();
  const c = await srv.join({ cls: "songweaver" });
  const said: string[] = [];
  c.onMessage("gearno", (m: { text: string }) => said.push(m.text));
  try {
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    p.pots.mpotion = [3, 0, 0]; room.syncPotions(p);
    p.mana = 0;
    room.drinkManaPotion(c.sessionId);
    await wait(150);
    assert.deepEqual([...p.pots.mpotion], [3, 0, 0], "none drunk");
    assert.equal(p.mana, 0);
    assert.deepEqual(said, [SONG_POTION_TEXT]);
  } finally { await c.leave(); await wait(50); }
});

test("room: the Echo rune fills her gauge by its share; the Songbook can't be dropped", async () => {
  const srv = await server();
  const c = await srv.join({ cls: "songweaver" });
  try {
    await wait(200);
    const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
    const roll = room.runeRoll;
    room.runeRoll = () => 0.12;
    try { p.mana = 10; room.runesOnCast(id, p); } finally { room.runeRoll = roll; }
    assert.ok(near(p.mana, 22), `+12: ${p.mana}`);
    // take the book off, then try to throw it away
    room.unequip(id, "shield");
    const at = [...p.bag].indexOf("songweaver_shield");
    assert.ok(at >= 0, "it went to the bag");
    room.dropGear(id, at);
    room.dropGears(id, [at]);
    assert.ok([...p.bag].includes("songweaver_shield"), "still in the bag");
    assert.equal(p.sk.book, undefined, "no book worn: nothing mirrored");
    assert.ok(p.bag.length <= BAG_SIZE);
  } finally { await c.leave(); await wait(50); }
});
