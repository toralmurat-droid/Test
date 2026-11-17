// Ages part 8 (docs/ages-progress.md): crossing between Ages. The pure rule (shared/ageCross.ts crossRefusal), the
// gateway's list checked, the handoff spot's `crossed`, and server/ageCross.ts's AgeCross on a fake room: off without
// a gateway, the freeze, the save before leaving, a failed save, the cooldown and the quiet rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AGE_SLOT_RE, CROSS, CROSS_CLOSE, CROSS_TEXT, ageName, cleanAgeInfo, cleanAgesList, crossRefusal, type AgeInfo, type CrossCheck,
} from "../shared/ageCross";
import { ACCOUNT_API } from "../shared/accountApi";
import { ACTIVE_CLASSES } from "../shared/classes";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ptb-age-cross-"));
process.env.SAVE_FILE = path.join(dir, "saves.json"); // (server/accounts.ts and server/handoff.ts: never data/)
process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
// (room log lines on stdout can break the test runner's framing: tests/helpers/room.ts)
console.log = (...a: unknown[]) => { process.stderr.write(a.map(String).join(" ") + "\n"); };

const green: AgeInfo = { slot: "green", name: "Green", up: true, accountApi: ACCOUNT_API, classes: [...ACTIVE_CLASSES] };
const blue: AgeInfo = { ...green, slot: "blue", name: "Blue" };
const base: CrossCheck = { slot: "green", here: "blue", ages: [blue, green], cls: "wizard", dead: false, trading: false, crossing: false, lastFight: 0, now: 1_000_000 };

test("crossRefusal: every reason, the target's first; none when all is well", () => {
  assert.equal(crossRefusal(base), undefined);
  assert.equal(crossRefusal({ ...base, slot: "blue" }), CROSS_TEXT.here);
  assert.equal(crossRefusal({ ...base, ages: [blue] }), CROSS_TEXT.closed, "not open (weight 0: not listed)");
  assert.equal(crossRefusal({ ...base, ages: [blue, { ...green, up: false }] }), CROSS_TEXT.down);
  assert.equal(crossRefusal({ ...base, ages: [blue, { ...green, accountApi: null }] }), CROSS_TEXT.older, "no version: an older build");
  assert.equal(crossRefusal({ ...base, api: ACCOUNT_API + 1 }), CROSS_TEXT.older, "the target's account version is older than ours");
  assert.equal(crossRefusal({ ...base, ages: [blue, { ...green, accountApi: ACCOUNT_API + 1 }] }), undefined, "a newer target reads ours");
  assert.equal(crossRefusal({ ...base, ages: [blue, { ...green, classes: ["vampire"] }] }), CROSS_TEXT.cls);
  assert.equal(crossRefusal({ ...base, ages: [blue, { ...green, classes: null }] }), CROSS_TEXT.cls);
  assert.equal(crossRefusal({ ...base, crossing: true }), CROSS_TEXT.crossing);
  assert.equal(crossRefusal({ ...base, dead: true }), CROSS_TEXT.dead);
  assert.equal(crossRefusal({ ...base, trading: true }), CROSS_TEXT.trading);
  assert.equal(crossRefusal({ ...base, lastFight: base.now - CROSS.quietMs + 1 }), CROSS_TEXT.fight, "the 10 s quiet rule");
  assert.equal(crossRefusal({ ...base, lastFight: base.now - CROSS.quietMs }), undefined);
  assert.equal(crossRefusal({ ...base, crossedAt: base.now - 60_000 }), CROSS_TEXT.cooldown(CROSS.cooldownMs - 60_000));
  assert.match(CROSS_TEXT.cooldown(CROSS.cooldownMs - 60_000), /in 4 min/);
  assert.equal(crossRefusal({ ...base, crossedAt: base.now - CROSS.cooldownMs }), undefined, "the cooldown ran out");
  assert.equal(crossRefusal({ ...base, ages: [blue], dead: true }), CROSS_TEXT.closed, "the target's reason first");
  assert.equal(CROSS.quietMs, 10_000); assert.equal(CROSS.cooldownMs, 300_000); assert.equal(CROSS_CLOSE, 4410);
});

test("the gateway's list is checked; names; slots", () => {
  assert.equal(ageName("blue"), "Blue");
  assert.equal(ageName("blue", { blue: "Age of Embers" }), "Age of Embers");
  assert.ok(AGE_SLOT_RE.test("green") && !AGE_SLOT_RE.test("../x") && !AGE_SLOT_RE.test("Green") && !AGE_SLOT_RE.test(""));
  assert.deepEqual(cleanAgeInfo({ slot: "green", name: "Age of Tides", up: true, accountApi: 2, classes: ["wizard", 5, "x".repeat(30)] }),
    { slot: "green", name: "Age of Tides", up: true, accountApi: 2, classes: ["wizard"] });
  assert.deepEqual(cleanAgeInfo({ slot: "green", up: "yes", accountApi: 1.5, classes: "wizard" }), { slot: "green", name: "Green", up: false, accountApi: null, classes: null });
  assert.equal(cleanAgeInfo({ slot: "Bad Slot" }), undefined);
  assert.equal(cleanAgesList("nope"), undefined);
  assert.equal(cleanAgesList({ primary: "blue" }), undefined);
  assert.deepEqual(cleanAgesList({ primary: "blue", ages: [green, null, { slot: "../x" }] }), { primary: "blue", ages: [green] });
});

test("cleanLive keeps a crossing's time; the spot is as before without one", async () => {
  const { cleanLive } = await import("../server/handoff");
  const spot = { x: 1, y: 2, dir: "up", hp: 3, mana: 4, energy: 5, group: [], at: 6 };
  assert.deepEqual(cleanLive(spot), spot, "no `crossed` key added");
  assert.equal(cleanLive({ ...spot, crossed: 123 })?.crossed, 123);
  assert.ok(!("crossed" in cleanLive({ ...spot, crossed: "soon" })!), "not a number: dropped");
  assert.ok(!("crossed" in cleanLive({ ...spot, crossed: Infinity })!));
});

/** A fake room for AgeCross: one hero, what it was sent, whether it left. */
async function fakeRoom(opts: { settle?: (n: string) => Promise<boolean>; ages?: AgeInfo[] | "fail"; on?: boolean } = {}) {
  const ac = await import("../server/ageCross");
  const clock = { t: 5_000_000 };
  let fetches = 0;
  ac.setAgeCross({
    url: opts.on === false ? undefined : "http://gw.internal:1", here: "blue", shared: () => true, now: () => clock.t,
    fetch: async (url) => { fetches++; assert.equal(url, "http://gw.internal:1/gateway/ages"); if (opts.ages === "fail") throw new Error("down"); return { primary: "blue", ages: opts.ages ?? [blue, green] }; },
    settle: opts.settle ?? (async () => true),
  });
  const hero = { name: "Crosser", cls: "wizard", dead: false, lastHurt: 0, invulnUntil: 0, input: { up: true, down: false, left: false, right: false } };
  const sent: [string, any][] = [], left: number[] = [];
  let saves = 0, trading = false, here = true;
  const room = new ac.AgeCross({
    hero: () => (here ? hero : undefined), trading: () => trading, save: () => { saves++; },
    send: (_s, t, m) => sent.push([t, m]), leave: (_s, code) => { left.push(code); here = false; },
  });
  const chats = () => sent.filter(([t]) => t === "chat").map(([, m]) => m.text as string);
  return { ac, room, hero, sent, left, clock, chats, saves: () => saves, fetches: () => fetches, trade: (v: boolean) => { trading = v; }, back: () => { here = true; left.length = 0; sent.length = 0; } };
}

test("AgeCross: off without a gateway (no `ages` at join, /age says one Age); on: `ages` at join", async () => {
  const off = await fakeRoom({ on: false });
  const join: [string, unknown][] = [];
  off.room.join("Crosser", undefined, (t, m) => join.push([t, m]));
  assert.deepEqual(join, [], "nothing sent when crossing is off");
  assert.equal(off.ac.crossOn(), false);
  await off.room.chat("s1", "/age");
  await off.room.cross("s1", { slot: "green" });
  assert.deepEqual(off.chats(), [CROSS_TEXT.off, CROSS_TEXT.off]);
  assert.equal(off.fetches(), 0); assert.deepEqual(off.left, []);
  off.ac.setAgeCross({ url: "http://gw", here: "", shared: () => true });
  assert.equal(off.ac.crossOn(), false, "no AGE_SLOT: off");
  off.ac.setAgeCross({ url: "http://gw", here: "blue", shared: () => false });
  assert.equal(off.ac.crossOn(), false, "no shared accounts: off");
  off.ac.setAgeCross({ env: { GATEWAY_URL: "http://gw/", AGE_SLOT: "blue" }, shared: () => true });
  assert.equal(off.ac.crossOn(), true, "from the environment");

  const on = await fakeRoom();
  on.room.join("Crosser", undefined, (t, m) => join.push([t, m]));
  assert.deepEqual(join, [["ages", { on: true, here: "blue" }]]);
});

test("AgeCross: the list with this hero's reasons, cached for the menu; /age in chat", async () => {
  const f = await fakeRoom({ ages: [blue, green, { ...green, slot: "red", name: "Red", up: false }] });
  await f.room.ask("s1");
  const msg = f.sent.find(([t]) => t === "ages")![1];
  assert.deepEqual(msg, { on: true, here: "blue", list: [
    { slot: "blue", name: "Blue", here: true, why: CROSS_TEXT.here },
    { slot: "green", name: "Green", here: false },
    { slot: "red", name: "Red", here: false, why: CROSS_TEXT.down },
  ] });
  await f.room.ask("s1");
  assert.equal(f.fetches(), 1, "cached");
  f.clock.t += CROSS.listCacheMs;
  f.hero.lastHurt = f.clock.t;
  await f.room.chat("s1", "/age");
  assert.equal(f.fetches(), 2);
  assert.ok(f.chats().some((t) => t.includes("Green") && t.includes(CROSS_TEXT.fight)), "the hero's reason shown");
  assert.equal(f.room.isCmd("/age green"), true); assert.equal(f.room.isCmd("/ages"), false); assert.equal(f.room.isCmd(5), false);

  const bad = await fakeRoom({ ages: "fail" });
  const err = console.error; console.error = () => {};
  try { await bad.room.ask("s1"); await bad.room.cross("s1", { slot: "green" }); } finally { console.error = err; }
  assert.deepEqual(bad.sent[0], ["ages", { on: true, here: "blue", list: [], err: CROSS_TEXT.listFail }]);
  assert.deepEqual(bad.chats(), [CROSS_TEXT.listFail]);
  assert.deepEqual(bad.left, []);
});

test("AgeCross: bad messages are ignored; refusals say why and do not freeze", async () => {
  const f = await fakeRoom();
  for (const m of [undefined, null, 5, "green", { slot: 5 }, { slot: "../green" }, { slot: "Green" }, { slot: "x".repeat(30) }]) await f.room.cross("s1", m);
  assert.deepEqual(f.sent, []); assert.equal(f.fetches(), 0);
  await f.room.cross("s1", { slot: "blue" });
  await f.room.cross("s1", { slot: "purple" });
  f.hero.lastHurt = f.clock.t - 5_000;
  await f.room.cross("s1", { slot: "green" });
  f.hero.lastHurt = 0;
  assert.equal(f.room.gate("s1", "attack"), true, "an attack counts as fighting");
  await f.room.cross("s1", { slot: "green" });
  f.clock.t += CROSS.quietMs;
  f.trade(true);
  await f.room.cross("s1", { slot: "green" });
  f.trade(false); f.hero.dead = true;
  await f.room.cross("s1", { slot: "green" });
  f.hero.dead = false;
  assert.deepEqual(f.chats(), [CROSS_TEXT.here, CROSS_TEXT.closed, CROSS_TEXT.fight, CROSS_TEXT.fight, CROSS_TEXT.trading, CROSS_TEXT.dead]);
  assert.equal(f.saves(), 0); assert.deepEqual(f.left, []);
  assert.equal(f.room.gate("s1", "input"), true, "not frozen");
});

test("AgeCross: a crossing freezes, saves, waits for the commit, sends `cross` and closes with 4410; the cooldown stands", async () => {
  let release!: (v: boolean) => void;
  const f = await fakeRoom({ settle: (n) => { assert.equal(n, "Crosser"); return new Promise((r) => { release = r; }); } });
  const going = f.room.cross("s1", { slot: "green" });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(f.saves(), 1, "saved");
  assert.deepEqual(f.hero.input, { up: false, down: false, left: false, right: false }, "stopped");
  assert.ok(f.hero.invulnUntil > f.clock.t, "unhurt while it saves");
  assert.equal(f.room.gate("s1", "input"), false); assert.equal(f.room.gate("s1", "cast"), false); assert.equal(f.room.gate("s1", "ping"), true);
  assert.deepEqual(f.room.spot("Crosser"), { crossed: f.clock.t }, "the spot written now carries the crossing");
  await f.room.cross("s1", { slot: "green" });
  assert.deepEqual(f.chats(), [CROSS_TEXT.crossing]);
  assert.deepEqual(f.left, [], "not before the commit");
  release(true);
  await going;
  assert.deepEqual(f.sent.at(-1), ["cross", { slot: "green" }]);
  assert.deepEqual(f.left, [CROSS_CLOSE]);
  assert.equal(f.ac.crossStats().crossed, 1);
  // Back on this server within 5 min (another room or a later session): refused by the cooldown
  f.back(); f.room.leave("s1");
  f.clock.t += 60_000;
  await f.room.cross("s1", { slot: "green" });
  assert.deepEqual(f.chats(), [CROSS_TEXT.cooldown(CROSS.cooldownMs - 60_000)]);
  f.clock.t += CROSS.cooldownMs;
  assert.deepEqual(f.room.spot("Crosser"), {}, "the cooldown ran out");
});

test("AgeCross: a failed save unfreezes the hero, says so, and sets no cooldown; a cooldown arrives with the spot", async () => {
  const f = await fakeRoom({ settle: async () => false });
  f.hero.invulnUntil = 7;
  await f.room.cross("s1", { slot: "green" });
  assert.deepEqual(f.chats(), [CROSS_TEXT.saveFail]);
  assert.deepEqual(f.left, []);
  assert.equal(f.room.gate("s1", "input"), true, "unfrozen");
  assert.equal(f.hero.invulnUntil, 7, "back as it was");
  assert.deepEqual(f.room.spot("Crosser"), {}, "no cooldown");
  assert.equal(f.ac.crossStats().failed, 1);

  // A hero arriving from another Age that crossed a minute ago (its spot's `crossed`; a clock ahead counts as now)
  const g = await fakeRoom();
  g.room.join("Crosser", g.clock.t - 60_000, () => {});
  assert.deepEqual(g.room.spot("crosser"), { crossed: g.clock.t - 60_000 });
  await g.room.cross("s1", { slot: "green" });
  assert.deepEqual(g.chats(), [CROSS_TEXT.cooldown(CROSS.cooldownMs - 60_000)]);
  g.ac.setAgeCross({ url: "http://gw", here: "blue", shared: () => true, now: () => g.clock.t });
  g.room.join("Crosser", g.clock.t + 3_600_000, () => {});
  assert.deepEqual(g.room.spot("Crosser"), { crossed: g.clock.t }, "never later than now");
});
