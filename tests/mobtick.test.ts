// Cheaper monster ticks (optimisation plan S4): each fast path must give exactly what the code it replaced gave.
// The replaced code is kept here as the reference.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { blocked, moveStep } from "../shared/movement";
import { isSafeZone, isSolidAt } from "../shared/map";
import { aggroLevelFactor, AGGRO, inputDir, MAP_H, MAP_W, PLAYER_SPEED, TILE, type InputState } from "../shared/constants";
import { inVoid, newRuntime, quietUnit, statusOf, tickUnit, type SkillHost, type Unit } from "../shared/skillEngine";
import { SUMMON } from "../shared/summons";
import { DEGREES, MODE_IDS, NOTES, RESONANCE, resonanceOf, resWord } from "../shared/songs";
import { fastFields } from "../server/schemaFast";
import { dropOldSamples, Mob, Player } from "../server/TownRoom";
import { startRoom, wait } from "./helpers/room";

/** Seeded numbers in [0, 1) (mulberry32). */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ---- schema fields (server/schemaFast.ts) ----

test("fast schema fields read the stored value and skip only writes of the value already there", () => {
  const m: any = new Mob(), p: any = new Player();
  m.x = 12.5; m.kind = "skeleton"; m.dead = true; m.owner = "abc";
  assert.deepEqual([m.x, m.kind, m.dead, m.owner], [m._x, m._kind, m._dead, m._owner]);
  p.x = 3; p.name = "Hero"; assert.deepEqual([p.x, p.name], [p._x, p._name]);
  const ct = m["~changes"];
  ct.discard();
  m.hp = m.hp; m.kind = "skeleton"; // the same values: nothing to send
  assert.equal(Object.keys(ct.indexedOperations).length, 0);
  m.hp = m.hp + 1;
  assert.equal(Object.keys(ct.indexedOperations).length, 1, "a real change is still tracked");
  // a move still reaches the monster's grid (trackSchemaMoves wraps the fast setter)
  const room = { moved: 0 }, g: any = { moved: () => room.moved++ };
  m._gm = g; m.x = m.x; m.x = 99; m._gm = null;
  assert.equal(room.moved, 2, "both writes are reported, as before (the grid ignores the one that did not move)");
});

test("fastFields refuses accessors that do not work the way it assumes", () => {
  // (a class shaped like a schema class: tests are not compiled with the server's decorators)
  const fake = (get: () => unknown, set: (v: unknown) => void, backing = true) => {
    const cls: any = function () {};
    cls[Symbol.metadata] = { "~descriptors": { v: { get, set, enumerable: true, configurable: true }, ...(backing ? { _v: { value: undefined, writable: true } } : {}) } };
    return cls;
  };
  const reads = function (this: any) { return this._v; }, skips = function (this: any, v: unknown) { if (v === (this._v ?? undefined)) return; throw new Error("no change tree"); }; // like the library
  assert.doesNotThrow(() => fastFields(fake(reads, skips)));
  assert.throws(() => fastFields(fake(() => 42, skips)), /accessors of v changed/);
  assert.throws(() => fastFields(fake(reads, function (this: any) { this["~changes"].change(0); })), /accessors of v changed/);
  assert.throws(() => fastFields(fake(reads, skips, false)), /no plain backing field/);
  const ok = fake(reads, skips);
  fastFields(ok);
  const d = ok[Symbol.metadata]["~descriptors"].v, o: any = { _v: 5 };
  assert.equal(d.get.call(o), 5);
  d.set.call(o, 5); // the value already there: returns before the library's setter
  assert.throws(() => d.set.call(o, 6), /no change tree/, "a new value goes through the library's setter");
  o._v = null;
  assert.throws(() => d.set.call(o, null), /no change tree/, "a null goes through the library's setter (it tells null from undefined)");
});

// ---- standing still (shared/movement.ts) ----

const ASSIST = 13;
function oldSidestep(clearAt: (o: number) => boolean, canMove: (o: number) => boolean, step: number): number {
  for (let k = 1; k <= ASSIST; k++) for (const s of [1, -1]) { if (!clearAt(s * k)) continue; const d = s * Math.min(step, k); return canMove(d) ? d : 0; }
  return 0;
}
function oldMoveStep(x: number, y: number, input: InputState, dtSec: number, speed = PLAYER_SPEED) {
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
  const v = (dx || dy) ? inputDir(input) : undefined;
  if (v) [dx, dy] = v;
  const nx = x + dx * speed * dtSec, ny = y + dy * speed * dtSec;
  const bx = blocked(nx, y);
  if (!bx) x = nx;
  const by = blocked(x, ny);
  if (!by) y = ny;
  if (bx && by && !blocked(nx, ny)) return { x: nx, y: ny, moving: true };
  const step = speed * dtSec;
  if (bx && Math.abs(dy) < 0.4 * Math.abs(dx)) y += oldSidestep((o) => !blocked(nx, y + o) && !blocked(x, y + o), (o) => !blocked(x, y + o), step);
  else if (by && Math.abs(dx) < 0.4 * Math.abs(dy)) x += oldSidestep((o) => !blocked(x + o, ny) && !blocked(x + o, y), (o) => !blocked(x + o, y), step);
  return { x, y, moving: dx !== 0 || dy !== 0 };
}

test("moveStep: a monster standing still keeps exactly its spot and moving flag, in the open, in a wall, at any speed", () => {
  const r = rng(7);
  const still: InputState = { up: false, down: false, left: false, right: false };
  const both: InputState = { up: true, down: true, left: true, right: true }; // keys that cancel out
  const speeds = [0, 40, 90, 400, -30, Infinity, NaN], dts = [0, 0.05, 0.6, 1];
  let walls = 0;
  for (let i = 0; i < 4000; i++) {
    const x = r() * MAP_W * TILE, y = r() * MAP_H * TILE;
    if (blocked(x, y)) walls++;
    const keys = { up: r() < 0.5, down: r() < 0.5, left: r() < 0.5, right: r() < 0.5 };
    for (const inp of [still, both, keys]) {
      const sp = speeds[i % speeds.length], dt = dts[i % dts.length];
      // (a non-finite step walks to NaN, off the map: both throw there, and must agree on that too)
      const run = (f: typeof moveStep) => { try { return f(x, y, inp, dt, sp); } catch (e) { return String(e); } };
      assert.deepEqual(run(moveStep), run(oldMoveStep), `${x},${y} ${JSON.stringify(inp)} ${sp} ${dt}`);
    }
  }
  assert.ok(walls > 100, "some points were inside walls");
  // and for the hero's default speed with a point-and-click aim
  const aim = { up: false, down: false, left: false, right: false, ax: 0.6, ay: 0.8 } as InputState;
  assert.deepEqual(moveStep(500, 500, aim, 0.05), oldMoveStep(500, 500, aim, 0.05));
});

// ---- status words, quiet units (shared/skillEngine.ts) ----

/** statusOf as on the default branch before the early return (with the Songweaver's mode and resonance words). */
function oldStatusOf(u: Unit, now: number): string {
  const sk = u.sk, out: string[] = [];
  if (now < sk.burnUntil) out.push(sk.bleed === "boil" ? "boil" : sk.bleed === "drip" ? "bleed" : "burn");
  if (now < sk.markUntil) out.push("mark");
  if (now < sk.weakUntil) out.push("weak");
  if (sk.counter && now < sk.counter.until) out.push("counter:" + sk.counter.s.id);
  if (now < sk.chargeUntil) out.push("charge");
  for (const b of sk.buffs) if (b.until > now) out.push(b.id);
  if (u.cls === "songweaver") out.push("mode:" + (sk.mode ?? "major"));
  const rw = sk.res > 0 ? resWord(resonanceOf(sk, now)) : "";
  if (rw) out.push(rw);
  return out.join(",");
}

/** A unit with a random mix of runtime state around `now`. */
function randomUnit(r: () => number, now: number): Unit {
  const sk = newRuntime(), t = () => (r() < 0.5 ? 0 : now + (r() - 0.5) * 2000);
  sk.burnUntil = t(); sk.markUntil = t(); sk.weakUntil = t(); sk.chargeUntil = t(); sk.burnNext = t();
  sk.bleed = (["", "drip", "boil"] as const)[Math.floor(r() * 3)];
  sk.stacks = r() < 0.7 ? 0 : Math.floor(r() * 4) - 1; sk.stackAt = t();
  if (r() < 0.2) sk.counter = { until: t(), s: { id: "k_counter" } as any, rank: 1, power: 1 };
  if (r() < 0.3) sk.buffs = [{ id: "b1", until: t(), b: { ms: 1000 } as any, rank: 1, stacks: 0 }];
  // Songweaver state: notes played (some to be forgotten by now), resonance (some faded, some too small for a word), a mode
  if (r() < 0.25) { sk.notes = DEGREES.slice(0, 1 + Math.floor(r() * 3)); sk.noteAt = now - r() * 2 * NOTES.idleMs; }
  if (r() < 0.3) { sk.res = r() < 0.2 ? r() : r() * RESONANCE.max; sk.resAt = now - r() * 20_000; }
  if (r() < 0.3) sk.mode = MODE_IDS[Math.floor(r() * MODE_IDS.length)];
  const c = r(), cls = c < 0.1 ? "vampire" as const : c < 0.2 ? "songweaver" as const : undefined;
  return { x: 100, y: 100, dead: r() < 0.1, level: 3, sk, cls, talents: {} };
}

test("statusOf: the early return gives the same words as building the list", () => {
  const r = rng(11), now = 1_000_000;
  let empty = 0, mode = 0, res = 0, onlySong = 0;
  for (let i = 0; i < 20000; i++) {
    const u = randomUnit(r, now);
    const s = statusOf(u, now);
    assert.equal(s, oldStatusOf(u, now));
    if (!s) empty++;
    if (s.includes("mode:")) mode++;
    if (/res\d/.test(s)) res++;
    if (s && s.split(",").every((w) => w.startsWith("mode:") || /^res\d$/.test(w))) onlySong++; // what the first early return hid
  }
  assert.ok(empty > 1000 && empty < 19000, `both cases met (${empty} empty)`);
  assert.ok(mode > 500 && res > 500 && onlySong > 100, `Songweaver words met (${mode} mode, ${res} resonance, ${onlySong} only those)`);
});

test("quietUnit: when it says so, tickUnit (now or later) leaves the unit untouched and asks the host nothing", () => {
  const r = rng(5), now = 2_000_000;
  let quiet = 0;
  for (let i = 0; i < 20000; i++) {
    const u = randomUnit(r, now);
    if (!quietUnit(u, now)) continue;
    quiet++;
    const before = JSON.stringify(u);
    const asked: string[] = [];
    const later = now + Math.floor(r() * 3) * 25; // the host's clock reads a little later than the tick's
    const host = new Proxy({}, { get: (_t, k: string) => { if (k === "unit") return () => u; if (k === "now") return () => later; return (..._a: unknown[]) => { asked.push(k); }; } }) as SkillHost;
    tickUnit(host, "m1");
    assert.equal(JSON.stringify(u), before);
    assert.deepEqual(asked, []);
  }
  assert.ok(quiet > 500, `quiet units met (${quiet})`);
  // a monster still holding notes that tickUnit forgets after a pause is not quiet
  const u: Unit = { x: 0, y: 0, dead: false, level: 1, sk: { ...newRuntime(), notes: ["I"], noteAt: now - NOTES.idleMs - 1 } };
  assert.equal(quietUnit(u, now), false, "notes still to forget");
});

// ---- position history ----

test("dropOldSamples keeps what the splice loop kept", () => {
  const r = rng(3);
  for (let i = 0; i < 5000; i++) {
    const n = Math.floor(r() * 12), h: number[] = [];
    for (let k = 0; k < n; k++) h.push(Math.floor(r() * 1000), r() * 500, r() * 500);
    const before = Math.floor(r() * 1100), ref = h.slice();
    while (ref.length > 3 && ref[0] < before) ref.splice(0, 3);
    dropOldSamples(h, before);
    assert.deepEqual(h, ref);
  }
});

// ---- the room: the hero and summon scans of the monster loop ----

let srv: Awaited<ReturnType<typeof startRoom>>;
const cs: any[] = [];
before(async () => { srv = await startRoom(); for (let i = 0; i < 4; i++) cs.push(await srv.join({ cls: i % 2 ? "summoner" : "vampire" })); await wait(300); });
after(async () => { for (const c of cs) await c.leave(); await srv.stop(); });

/** The aggro pick for heroes and summons as it was (no rival monsters around), on the room's own data. */
function oldPick(room: any, m: Mob, def: { aggroRange: number; leash: number }) {
  let best = 0, target = "", foe = "", threat = 0;
  const now0 = Date.now(), alerted = now0 < m.alertUntil;
  room.state.players.forEach((p: Player, pid: string) => {
    if (p.dead || isSafeZone(p.x, p.y) || Math.hypot(p.x - m.homeX, p.y - m.homeY) >= def.leash || inVoid(p, now0)) return;
    const d = Math.hypot(p.x - m.x, p.y - m.y);
    const hated = (pid === m.hateId ? m.hate : 0) + (alerted && pid === m.alertHero ? 0.5 : 0);
    const range = hated > 0 ? def.aggroRange * 2 : def.aggroRange;
    if (d >= range) return;
    if (d < def.aggroRange) threat = Math.max(threat, p.level - m.level);
    const lf = m.merged > 1 || m.kind === "demon" ? Math.max(1, aggroLevelFactor(m.level, p.level)) : aggroLevelFactor(m.level, p.level);
    const score = Math.max(0, 1 - d / def.aggroRange) * lf + hated + (pid === m.target ? AGGRO.stick : 0);
    if (score > best) { best = score; target = pid; }
  });
  for (const [sid, o] of room.summons as Map<string, Mob>) {
    if (o.dead || Math.abs(o.x - m.x) > def.aggroRange || Math.abs(o.y - m.y) > def.aggroRange) continue;
    const d = Math.hypot(o.x - m.x, o.y - m.y), hated = sid === m.hateId ? m.hate : 0;
    if (d >= (hated > 0 ? def.aggroRange * 2 : def.aggroRange) || Math.hypot(o.x - m.homeX, o.y - m.homeY) >= def.leash) continue;
    const score = Math.max(0, 1 - d / def.aggroRange) + SUMMON.taunt + hated + (sid === m.foe ? AGGRO.stick : 0);
    if (score > best) { best = score; target = ""; foe = sid; }
  }
  return { target, foe, threat };
}

function openSpot(r: () => number): [number, number] {
  for (;;) {
    const x = (200 + r() * 200) * TILE, y = (60 + r() * 120) * TILE;
    if (!isSolidAt(x, y) && !isSafeZone(x, y)) return [x, y];
  }
}

test("pickTarget in the monster loop (living heroes, box test first) picks what the full scan picked", () => {
  const room = srv.room, r = rng(21);
  room.state.mobs.forEach((_m: any, mid: string) => room.state.mobs.delete(mid)); // no rival monsters: heroes and summons only
  room.summons.clear();
  const heroes: [string, Player][] = [...room.state.players.entries()];
  assert.equal(heroes.length, 4);
  const m = new Mob(); m.kind = "gnawkin"; m.level = 5; m.hp = m.maxHp = 50; // (no faction: no rival monsters to weigh)
  room.state.mobs.set("aggrotest", m);
  const sums: Mob[] = [];
  for (let i = 0; i < 6; i++) { const s = new Mob(); s.kind = "golem_poison" as any; s.owner = heroes[i % 4][0]; s.hp = s.maxHp = 50; sums.push(s); room.summons.set(`sum${i}`, s); }
  let picked = 0, bySummon = 0, none = 0;
  try {
    for (let round = 0; round < 3000; round++) {
      const [mx, my] = openSpot(r);
      m.x = mx; m.y = my; m.homeX = mx + (r() - 0.5) * 200; m.homeY = my + (r() - 0.5) * 200;
      m.merged = r() < 0.2 ? 2 : 1; m.target = ""; m.foe = "";
      const def = { aggroRange: 60 + r() * 250, leash: 150 + r() * 600 };
      for (const [, p] of heroes) {
        const far = r() < 0.3;
        p.x = mx + (r() - 0.5) * (far ? 3000 : 2.2 * def.aggroRange * 2); p.y = my + (r() - 0.5) * (far ? 3000 : 2.2 * def.aggroRange * 2);
        p.dead = r() < 0.15; p.level = 1 + Math.floor(r() * 30);
        p.sk.last["slipUntil"] = r() < 0.1 ? Date.now() + 5000 : 0;
      }
      for (const s of sums) { s.x = mx + (r() - 0.5) * 3 * def.aggroRange; s.y = my + (r() - 0.5) * 3 * def.aggroRange; s.dead = r() < 0.15; }
      const pick = r();
      m.hateId = pick < 0.3 ? heroes[Math.floor(r() * 4)][0] : pick < 0.4 ? `sum${Math.floor(r() * 6)}` : "";
      m.hate = m.hateId ? r() * 2 : 0;
      m.alertUntil = r() < 0.2 ? Date.now() + 5000 : 0; m.alertHero = heroes[Math.floor(r() * 4)][0];
      if (r() < 0.3) m.target = heroes[Math.floor(r() * 4)][0];
      const was = { target: m.target, foe: m.foe };
      const ref = oldPick(room, m, def);
      // in the loop: the heroes alive when it began (one of them may have died since)
      const alive = heroes.filter(([, p]) => !p.dead || r() < 0.3);
      room.loopHeroes = alive.map(([, p]) => p); room.loopIds = alive.map(([id]) => id);
      m.target = was.target; m.foe = was.foe;
      room.pickTarget(m, def);
      assert.deepEqual({ target: m.target, foe: m.foe, threat: m.threat }, ref, `round ${round}`);
      // outside the loop (tests, other callers): the full scan
      room.loopHeroes = undefined;
      m.target = was.target; m.foe = was.foe;
      room.pickTarget(m, def);
      assert.deepEqual({ target: m.target, foe: m.foe, threat: m.threat }, ref, `round ${round}, outside the loop`);
      if (ref.target) picked++; else if (ref.foe) bySummon++; else none++;
    }
  } finally { room.loopHeroes = undefined; room.state.mobs.delete("aggrotest"); room.summons.clear(); }
  assert.ok(picked > 200 && bySummon > 100 && none > 200, `all outcomes met (${picked} heroes, ${bySummon} summons, ${none} none)`);
});

test("the sleep check in updateMob (the hero dozing found, else the living heroes) answers like playerNear", () => {
  const room = srv.room, r = rng(9);
  const heroes: Player[] = [...room.state.players.values()];
  const m = new Mob(); m.kind = "slime";
  for (let round = 0; round < 3000; round++) {
    m.x = 3000 + r() * 2000; m.y = 3000 + r() * 2000;
    for (const p of heroes) { p.x = m.x + (r() - 0.5) * 2400; p.y = m.y + (r() - 0.5) * 2400; p.dead = r() < 0.2; }
    const ref = room.playerNear(m.x, m.y, 28 * TILE);
    // as in the loop: the list from its start (with a hero dead since), a witness from heroNear (maybe dead or moved since)
    room.loopHeroes = heroes.filter((p) => !p.dead || r() < 0.3);
    room.nearHero = r() < 0.5 ? heroes[Math.floor(r() * heroes.length)] : undefined;
    assert.equal(room.sleepNear(m), ref, `round ${round}`);
    assert.equal(room.nearHero, undefined, "the witness is used once");
    room.loopHeroes = undefined;
  }
  for (const p of heroes) p.dead = false;
});
