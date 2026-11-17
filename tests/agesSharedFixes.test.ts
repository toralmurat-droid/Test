// Ages part 7 review fixes (docs/ages-progress.md): a follower's sack or claim pays only once the war's owner applied
// it; an owner with no room open books the Gloam Tide's march; a queue that cannot be read keeps its items; idea row
// writes never land out of order; a handoff spot survives a failed join and is written before the account goes back.
// "Two servers" run in one process, as in tests/agesShared.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LEASE, Leases, memLeases, type LeaseBackend } from "../server/lease";
import type { Kv } from "../server/store";
import { AgeQueue, requeue } from "../server/ageQueue";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { atWar } from "../shared/war/feuds";
import { newMinds } from "../shared/war/doctrine";
import { HOLD_SACK } from "../shared/war/holdSack";
import { newWar, targetsOf, WAR } from "../shared/war/rules";
import { HOLDS } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { TOWN, townPatron } from "../shared/war/towns";
import { TIDE } from "../shared/tide";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ptb-ages-fixes-"));
process.env.IDEAS_FILE = path.join(dir, "ideas.json");
process.env.SAVE_FILE = path.join(dir, "saves.json");
process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));

/** A kv in memory with every optional part; `fail(op, key)` true makes that call throw, `hold(op, key)` a promise it waits on. */
function memKv(leases?: LeaseBackend) {
  const m = new Map<string, string>();
  const o = { fail: (_op: string, _k: string) => false, hold: (_op: string, _k: string): Promise<void> | undefined => undefined };
  const gate = async (op: string, k: string) => { if (o.fail(op, k)) throw new Error(`db down (${op} ${k})`); const h = o.hold(op, k); if (h) await h; };
  const kv: Kv = {
    get: async (k) => { await gate("get", k); return m.has(k) ? JSON.parse(m.get(k)!) : undefined; },
    set: async (k, v) => { const s = JSON.stringify(v); await gate("set", k); m.set(k, s); },
    insertIfAbsent: async (k, v) => { if (m.has(k)) return false; await kv.set(k, v); return true; },
    list: async <T>(p: string) => Object.fromEntries([...m].filter(([k]) => k.startsWith(p)).map(([k, v]) => [k, JSON.parse(v) as T])),
    take: async <T>(k: string) => { const v = m.get(k); m.delete(k); return v === undefined ? undefined : (JSON.parse(v) as T); },
    del: async (ks) => { for (const k of ks) { await gate("del", k); m.delete(k); } },
    leases,
  };
  return { kv, m, o };
}
const clock = (t = 1_000_000) => { const c = { t, now: () => c.t }; return c; };
const json = (m: Map<string, string>, k: string) => JSON.parse(m.get(k)!);
const later = (ms = 5) => new Promise((r) => setTimeout(r, ms));

// ---- 1. Sacks and claims: the rewards wait for the owner -----------------------------------------------------------------

/** A war row where clan `foe` may sack land `t` (legal: at war with its holder, in reach) and claims town saltmere. */
async function warSetup() {
  const war = await import("../server/war");
  const t0 = 31_000_000_000_000, c = clock(t0), be = memLeases(c.now), { kv, m, o } = memKv(be);
  const st = newWar(), P = townPatron("saltmere");
  war._resetWar({ v: 1, state: st, minds: newMinds(), next: t0 + WAR.tickMs, log: [] }); // (the clans at war for this map)
  let pick: { t: number; foe: ClanKey } | undefined;
  for (const h of HOLDS) {
    const t = h.t, own = st.owner[t];
    if (pick || t === P || TERRITORIES[t].reckoningOnly || st.siege[t] || !own) continue;
    const foe = CLAN_KEYS.find((k) => k !== own && atWar(k, own) && targetsOf(st, k).includes(t));
    if (foe) pick = { t, foe };
  }
  assert.ok(pick, "a land some clan may sack");
  const { t, foe } = pick!;
  const others = HOLDS.map((h) => h.t).filter((x) => x !== t && x !== P && st.owner[x] && !TERRITORIES[x].reckoningOnly && !st.siege[x]);
  const own = st.owner[P] === foe ? CLAN_KEYS.find((k) => k !== foe)! : st.owner[P];
  const row = { v: 1, state: st, minds: newMinds(), next: t0 + WAR.tickMs, log: [], towns: { saltmere: { k: own, c: { by: foe, until: st.tick + 3, ext: 0 } } } };
  m.set("war", JSON.stringify(row));
  be.rows.set("lease:war", { holder: "main:owner", until: c.t + LEASE.ttlMs });
  const start = async (holder: string) => { war._resetWar(undefined); war.stopWar(); await war.startWar(kv, new Leases(be, holder, true, c.now)); war.stopWar(); };
  return { war, c, be, kv, m, o, t, foe, P, others, start };
}

test("war (follower): a sack's valor travels in the act and counts only when the owner applies it; each act's fate is noted", async () => {
  const { war, c, m, t, foe, P, start } = await warSetup();
  try {
    await start("main:me");
    assert.equal(war.warRole(), "follower");
    const a1 = war.sackAct(t, foe, false, "Ann", { valor: HOLD_SACK.sackValor, credits: ["ann:wizard"] });
    const a2 = war.sackAct(t, foe, false, "Bob", { valor: HOLD_SACK.sackValor }); // (a second sack of that land this tick)
    const c1 = war.claimAct("saltmere", foe, "Cy");
    assert.ok(a1 && a2 && c1 && new Set([a1, a2, c1]).size === 3, "each act has its own id");
    assert.equal(war.claimAct("saltmere", foe, "Dee"), undefined, "never claimed twice from here meanwhile");
    assert.equal(war.warActFate(a1!), undefined, "not known yet");
    await war._pulse(c.t);
    assert.equal(m.has("war-valor:main:me"), false, "the sack's valor is not queued apart (it travels with the act)");
    assert.equal(json(m, "war-acts:main:me").batches[0].acts.length, 3);

    await start("main:owner");
    await war._pulse(c.t);
    assert.equal(war._valorOf(t, foe), HOLD_SACK.sackValor, "the applied sack's valor, once (the dropped one brings none)");
    assert.ok(war._valorOf(P, foe) >= TOWN.claimValor, "the claim's valor in the patron land");
    assert.deepEqual(JSON.parse(m.get("war")!).fates, { [a1!]: 1, [a2!]: 0, [c1!]: 1 }, "the fates, written with the war");

    await start("main:me");
    await war._pulse(c.t);
    assert.equal(war.warActFate(a1!), "ok"); assert.equal(war.warActFate(a2!), "no"); assert.equal(war.warActFate(c1!), "ok");
    // a claim of a town no longer contested is dropped, and said so
    const c2 = war.claimAct("saltmere", foe, "Eve");
    assert.equal(c2, undefined, "the town is the clan's now: nothing to claim");
  } finally { war.stopWar(); war._resetWar(); }
});

test("war (owner): a corrupt row's act fates are forgotten, never a crash", async () => {
  const { war, c, m, t, foe, start } = await warSetup();
  try {
    await start("main:me");
    const a = war.sackAct(t, foe, false, "Ann");
    await war._pulse(c.t);
    m.set("war", JSON.stringify({ ...JSON.parse(m.get("war")!), fates: "junk" }));
    await start("main:owner");
    await war._pulse(c.t);
    assert.deepEqual(JSON.parse(m.get("war")!).fates, { [a!]: 1 });
  } finally { war.stopWar(); war._resetWar(); }
});

test("war holds (follower): the war chest and renown wait for the owner; a dropped or unanswered sack pays nothing", async () => {
  const { war, c, t, foe, others, start } = await warSetup();
  const { WarHolds, _resetHolds } = await import("../server/warHolds");
  _resetHolds();
  const [t2, t3] = others;
  const ann = { name: "Ann", cls: "wizard", clan: foe, level: 40, x: 0, y: 0, dead: false, renown: 0, lastAct: c.t, lastHurt: 0 };
  const sent: [string, string, any][] = [], gold: number[] = [];
  const h = new WarHolds({
    heroes: () => [["s1", ann]], hero: (id) => (id === "s1" ? ann : undefined), mobsInBox: () => [],
    send: (id, type, msg) => sent.push([id, type, msg]), broadcast: () => {}, dropGold: (_x, _y, n) => gold.push(n),
    guardsAlive: () => 0, guardsDue: () => 0, guardsOff: () => {},
  });
  const done = (land: number, now: number) => (h as any).done("s1", ann, { hero: "s1", t: land, progress: 1, paused: false, lastStep: now, hurtAt: 0 }, war.warState()!.owner[land], war.warNow()!.tick, now);
  const chats = () => sent.filter(([, type]) => type === "chat").map(([, , msg]) => msg.text as string);
  try {
    await start("main:me");
    done(t, c.t); done(t2, c.t);
    assert.equal(ann.renown, 0, "no renown before the owner applies it"); assert.deepEqual(gold, [], "no war chest yet");
    assert.match(chats().at(-1)!, /heralds carry the news/);
    assert.ok(sent.some(([, type, msg]) => type === "sack" && msg.state === "done"), "the banner is up here at once");
    h.tick(c.t);
    assert.equal(ann.renown, 0);
    await war._pulse(c.t); // (the acts reach the queue)

    await start("main:owner");
    war.strikeHold(t2, undefined, true, "Someone", c.t); // (the owner's own hero sacked t2 first)
    await war._pulse(c.t);

    await start("main:me");
    await war._pulse(c.t); // (reads the war with the fates)
    h.tick(c.t);
    assert.ok(ann.renown > 0, "renown once the owner applied the sack");
    assert.equal(gold.length, 1, "one war chest: the applied sack's");
    assert.ok(chats().some((x) => x.startsWith(`You sacked the Hold of ${TERRITORIES[t].name}: +${HOLD_SACK.sackValor} valor`)));
    assert.ok(chats().some((x) => x.includes(`did not count your sack of the Hold of ${TERRITORIES[t2].name}`)), "the dropped one is told");
    const r = ann.renown;
    h.tick(c.t + 1);
    assert.equal(ann.renown, r, "paid once");
    // an act the owner never answers (an older owner, say): given up after ACT_FATE_MS, unpaid
    done(t3, c.t);
    h.tick(c.t + war.ACT_FATE_MS - 1);
    assert.equal(gold.length, 1);
    h.tick(c.t + war.ACT_FATE_MS);
    assert.equal(gold.length, 1, "no war chest"); assert.equal(ann.renown, r, "no renown");
    assert.ok(chats().some((x) => x.includes(TERRITORIES[t3].name) && x.includes("did not count")));
  } finally { war.stopWar(); war._resetWar(); _resetHolds(); }
});

test("war towns (follower): a claim's renown waits for the owner's answer", async () => {
  const { war, c, foe, start } = await warSetup();
  const { WarTowns, _resetTowns } = await import("../server/warTowns");
  const { townById } = await import("../shared/war/towns");
  _resetTowns();
  const cy = { name: "Cy", cls: "wizard", clan: foe, level: 40, x: 0, y: 0, dead: false, renown: 0, lastAct: c.t, lastHurt: 0 };
  const sent: [string, string, any][] = [];
  const h = new WarTowns({
    spawn: () => undefined, remove: () => {}, mob: () => undefined, heroes: () => [["s1", cy]], hero: (id) => (id === "s1" ? cy : undefined),
    send: (id, type, msg) => sent.push([id, type, msg]), broadcast: () => {}, budget: () => 0,
  }, {} as never);
  try {
    await start("main:me");
    (h as any).done("s1", cy, { hero: "s1", id: "saltmere", progress: 1, paused: false, lastStep: c.t, hurtAt: 0 }, foe, c.t);
    assert.equal(cy.renown, 0, "no renown before the owner applies it");
    assert.ok(sent.some(([, type, msg]) => type === "townclaim" && msg.state === "done"));
    await war._pulse(c.t);
    await start("main:owner"); await war._pulse(c.t);
    assert.equal(war.warTowns().saltmere.k, foe, "the owner flipped the town");
    await start("main:me"); await war._pulse(c.t);
    h.tick(c.t);
    assert.ok(cy.renown > 0, "renown once applied");
    assert.ok(sent.some(([, type, msg]) => type === "chat" && msg.text.includes(`counted your banner over ${townById("saltmere")!.name}`)));
  } finally { war.stopWar(); war._resetWar(); _resetTowns(); }
});

// ---- 2. The Tide's march with no room open on the owner ------------------------------------------------------------------

test("tide (owner, no room open): a meter the followers filled gets its march booked, and emptied once the march's time is up", async () => {
  const W = await import("../server/worldStore");
  const { Tide, bookIdleMarch } = await import("../server/tide");
  const c = clock(), be = memLeases(c.now), { kv, m } = memKv(be);
  const rows = new Map<string, any>();
  const store = { kind: "postgres" as const, load: async () => Object.fromEntries(rows), loadOne: async (k: string) => structuredClone(rows.get(k)), save: async (ch: Record<string, any>) => { for (const [k, v] of Object.entries(ch)) rows.set(k, structuredClone(v)); } };
  rows.set("world", { v: 1, tide: TIDE.goal - 2, marches: 0 });
  const l = new Leases(be, "main:owner", true, c.now); await l.want("lease:world").renew();
  W._setupWorld(store, l, W.cleanWorld(rows.get("world")), kv);
  m.set("world-tide:main:x", JSON.stringify({ holder: "main:x", seq: 1, batches: [{ seq: 1, kills: 5 }] }));
  const before = Date.now();
  await W._claimWorld();
  const row = rows.get("world");
  assert.equal(row.tide, TIDE.goal, "filled by the queue");
  assert.ok(typeof row.marchAt === "number" && row.marchAt >= before, "the march is booked (no room needed)");
  const booked = row.marchAt;
  await W._claimWorld();
  assert.equal(rows.get("world").marchAt, booked, "booked once");
  // the march's time is up (the followers marched it for their heroes): the meter empties, as at a march's end
  W.world().marchAt = Date.now() - TIDE.limitMs + 60_000;
  await W._claimWorld();
  assert.equal(rows.get("world").tide, TIDE.goal, "still under way: nothing changes");
  W.world().marchAt = Date.now() - TIDE.limitMs - 1;
  await W._claimWorld();
  assert.equal(rows.get("world").tide, 0); assert.equal(rows.get("world").marchAt, undefined); assert.equal(rows.get("world").marches, 1);
  // with a room open, its Tide books and moves (it may be marching): the idle booking stays out of it
  const w = { v: 1 as const, tide: TIDE.goal, marches: 0 } as { v: 1; tide: number; marches: number; marchAt?: number };
  const room = new Tide({
    heroes: () => [], hero: () => undefined, mob: () => undefined, spawn: () => undefined, removeMob: () => {}, send: () => {},
    act1: () => true, dayFrac: () => 0.5, pay: () => {}, world: () => w, changed: () => {},
  });
  assert.equal(bookIdleMarch(w, Date.now(), () => 0.5), false);
  assert.equal(w.marchAt, undefined);
  room.release();
  assert.equal(bookIdleMarch(w, Date.now(), () => 0.5), true);
  assert.ok(w.marchAt! > 0);
  assert.equal(bookIdleMarch({ v: 1, tide: TIDE.goal - 1, marches: 0 }, Date.now(), () => 0.5), false, "not full: nothing booked");
});

test("tide (follower): a march is set out for once, even when the owner's row brings the same march back after it ended", async () => {
  const { Tide, _resetTideMarched } = await import("../server/tide");
  _resetTideMarched();
  const now = Date.now(), at = now - 1000;
  let w = { v: 1 as const, tide: TIDE.goal, marches: 0, marchAt: at } as { v: 1; tide: number; marches: number; marchAt?: number };
  const host = {
    heroes: () => [], hero: () => undefined, mob: () => undefined, spawn: () => undefined, removeMob: () => {}, send: () => {},
    act1: () => true, dayFrac: () => 0.5, pay: () => {}, world: () => w, changed: () => {}, follows: () => true, queueKill: () => {},
  };
  const t = new Tide(host);
  try {
    t.tick(now);
    assert.equal(t.marching, true, "the follower marches at the shared dusk for its heroes");
    (t as any).end(false);
    assert.equal(w.tide, 0, "(its own copy emptied)");
    w = { v: 1, tide: TIDE.goal, marches: 0, marchAt: at }; // (followWorld: the owner's row, the same march still booked)
    t.tick(now + 2000);
    assert.equal(t.marching, false, "never the same march twice");
    t.release();
    const t2 = new Tide(host); // (another room of this process)
    t2.tick(now + 3000);
    assert.equal(t2.marching, false, "nor from another room");
    w = { v: 1, tide: TIDE.goal, marches: 1, marchAt: now + 2500 }; // (the next march the owner booked)
    t2.tick(now + 4000);
    assert.equal(t2.marching, true, "a new march sets out");
    t2.release();
  } finally { t.release(); _resetTideMarched(); }
});

// ---- 3. A queue that cannot be read keeps its items ----------------------------------------------------------------------

test("age queue: a row that cannot be read keeps the batch (false, no throw); a failed write is written again", async () => {
  const { kv, m, o } = memKv();
  const q = new AgeQueue<{ n: number }>("q:", (b) => (typeof b.n === "number" ? { n: b.n } : undefined));
  o.fail = (op) => op === "get";
  assert.equal(await q.push(kv, "b", 0, { n: 1 }), false, "not taken");
  assert.equal(m.has("q:b"), false);
  o.fail = (op) => op === "set";
  assert.equal(await q.push(kv, "b", 0, { n: 1 }), true, "taken (in memory)");
  assert.equal(m.has("q:b"), false, "the write failed");
  o.fail = () => false;
  assert.equal(await q.push(kv, "b", 0), true);
  assert.deepEqual(json(m, "q:b").batches, [{ n: 1, seq: 1 }], "written at the next beat, with nothing new");
  // two first pushes at once (a fresh queue): one read for both, no batch lost, no number used twice
  const q2 = new AgeQueue<{ n: number }>("q:", (b) => (typeof b.n === "number" ? { n: b.n } : undefined));
  let release!: () => void;
  o.hold = (op) => (op === "get" ? new Promise<void>((r) => { release = r; }) : undefined);
  const p1 = q2.push(kv, "b", 1, { n: 2 }), p2 = q2.push(kv, "b", 1, { n: 3 });
  await later(); o.hold = () => undefined; release();
  assert.deepEqual([await p1, await p2], [true, true]);
  assert.deepEqual(json(m, "q:b"), { holder: "b", seq: 3, batches: [{ n: 2, seq: 2 }, { n: 3, seq: 3 }] });
  assert.deepEqual(requeue([1, 2], [3], 10), [1, 2, 3]);
  assert.deepEqual(requeue([1, 2], [3], 2), [1, 2], "capped");
});

test("war (follower): valor and acts are pushed each on their own; what could not be written waits for the next beat", async () => {
  const { war, c, m, o, t, foe, start } = await warSetup();
  try {
    o.fail = (op, k) => op === "get" && k.startsWith("war-valor:"); // (the queue row is read once, at the first beat)
    await start("main:me");
    assert.ok(war.addValor(t, foe, 5, "ann:wizard"));
    assert.ok(war.sackAct(t, foe, false, "Ann"));
    await war._pulse(c.t);
    assert.equal(m.has("war-valor:main:me"), false, "the valor queue could not be read");
    assert.equal(json(m, "war-acts:main:me").batches[0].acts.length, 1, "the acts went all the same");
    o.fail = () => false;
    await war._pulse(c.t);
    assert.deepEqual(json(m, "war-valor:main:me").batches.map((b: { adds: unknown }) => b.adds), [[[t, foe, 5, "ann:wizard"]]], "the valor, kept and written at the next beat");
  } finally { war.stopWar(); war._resetWar(); }
});

test("tide and ideas (follower): kills and acts a queue could not take wait for the next beat", async () => {
  const W = await import("../server/worldStore");
  const c = clock(), be = memLeases(c.now), { kv, m, o } = memKv(be);
  const rows = new Map<string, any>([["world", { v: 1, tide: 5, marches: 0 }]]);
  const store = { kind: "postgres" as const, load: async () => Object.fromEntries(rows), loadOne: async (k: string) => structuredClone(rows.get(k)), save: async (ch: Record<string, any>) => { for (const [k, v] of Object.entries(ch)) rows.set(k, structuredClone(v)); } };
  be.rows.set("lease:world", { holder: "main:owner", until: c.t + LEASE.ttlMs });
  const l = new Leases(be, "main:me", true, c.now); await l.want("lease:world").renew();
  W._setupWorld(store, l, W.cleanWorld(rows.get("world")), kv);
  W.queueTideKill(); W.queueTideKill();
  o.fail = (op, k) => op === "get" && k.startsWith("world-tide:");
  await W._claimWorld();
  assert.equal(m.has("world-tide:main:me"), false);
  o.fail = () => false;
  W.queueTideKill();
  await W._claimWorld();
  assert.deepEqual(json(m, "world-tide:main:me").batches, [{ kills: 3, seq: 1 }], "the two kept kills and the new one");

  const I = await import("../server/ideaStore");
  be.rows.set("lease:ideas", { holder: "main:a", until: Infinity });
  I._resetIdeas();
  try {
    o.fail = (op, k) => op === "get" && k.startsWith("ideas-q:"); // (the queue row is read once, at the first beat)
    await I.initIdeas(kv, new Leases(be, "main:b", true, c.now));
    assert.ok(I.submitIdea({ name: "Ann", level: 10 }, "More fishing spots near the river please").ok);
    await I.ideasBeat(c.t);
    assert.equal(m.has("ideas-q:main:b"), false);
    o.fail = () => false;
    await I.ideasBeat(c.t);
    assert.equal(json(m, "ideas-q:main:b").batches[0].acts.length, 1, "the idea, kept and written at the next beat");
  } finally { I._resetIdeas(); }
});

// ---- 4. Idea row writes one at a time ------------------------------------------------------------------------------------

test("ideas (owner): row writes run one after another, each with the log as it stands then (an older one never lands last)", async () => {
  const I = await import("../server/ideaStore");
  const c = clock(), be = memLeases(c.now), { kv, m, o } = memKv(be);
  I._resetIdeas();
  try {
    await I.initIdeas(kv, new Leases(be, "main:a", true, c.now));
    assert.equal(I.ideasFollow(), false);
    // another server's idea in its queue: the beat applies it and writes the row, slowly
    m.set("ideas-q:main:b", JSON.stringify({ holder: "main:b", seq: 1, batches: [{ seq: 1, acts: [["s", { name: "Bob", level: 10 }, "Let pets carry one extra potion", c.t]] }] }));
    let release!: () => void, held = false;
    const slow = new Promise<void>((r) => { release = r; });
    o.hold = (op, k) => (op === "set" && k === "ideas" && !held ? ((held = true), slow) : undefined);
    const beat = I.ideasBeat(c.t);
    for (let i = 0; i < 50 && !held; i++) await later(2);
    assert.ok(held, "the beat's write is under way");
    assert.ok(I.submitIdea({ name: "Ann", level: 10 }, "More fishing spots near the river please").ok); // (on the owner: in the log at once)
    const flush = I.flushIdeas(); // (another write of the row)
    await later(10);
    release();
    await beat; await flush;
    assert.deepEqual(json(m, "ideas").ideas.map((i: { author: string }) => i.author).sort(), ["Ann", "Bob"], "the newest log landed last");
  } finally { I._resetIdeas(); }
});

// ---- 7. Handoff: read at login, deleted after the join; written before the account goes back -----------------------------

test("handoff (shared store): a join that fails after login keeps the spot; the leave waits for its write, capped", async () => {
  const h = await import("../server/handoff");
  const { kv, m, o } = memKv();
  await h.useHandoffKv(kv);
  try {
    m.set("handoff:ann:wizard", JSON.stringify({ x: 100, y: 200, dir: "left", hp: 30, mana: 5, energy: 7, group: [], at: Date.now() }));
    await h.fetchLive("Ann", "wizard"); // (onAuth) ... and the join fails: takeLive never runs
    assert.equal(m.has("handoff:ann:wizard"), true, "read, not taken");
    await h.fetchLive("Ann", "wizard"); // (the next login, maybe on another server)
    const s = h.takeLive("Ann", "wizard"); // (onJoin)
    assert.equal(s?.x, 100);
    await h.writeHandoff();
    assert.equal(m.has("handoff:ann:wizard"), false, "deleted once the hero joined");

    assert.equal(h.handoffWritten("Bob", "wizard"), undefined, "nothing under way: the account goes back at once");
    let release!: () => void;
    o.hold = (op, k) => (op === "set" && k === "handoff:bob:wizard" ? new Promise<void>((r) => { release = r; }) : undefined);
    h.rememberLive("Bob", "wizard", { x: 1, y: 2, dir: "up", hp: 1, mana: 1, energy: 1, group: [] });
    let done = false;
    const w = h.handoffWritten("Bob", "wizard")!.then(() => { done = true; });
    await later(10);
    assert.equal(done, false, "waits for the write");
    release(); await w;
    assert.equal(json(m, "handoff:bob:wizard").x, 1, "written before the account lease goes back");
    o.hold = (op, k) => (op === "set" && k === "handoff:cy:wizard" ? new Promise<void>(() => {}) : undefined); // (a database that hangs)
    h.rememberLive("Cy", "wizard", { x: 1, y: 2, dir: "up", hp: 1, mana: 1, energy: 1, group: [] });
    const t0 = Date.now();
    await h.handoffWritten("Cy", "wizard", 30);
    assert.ok(Date.now() - t0 < 1000, "capped");
    o.hold = () => undefined;
  } finally { await h.useHandoffKv(undefined); }
  const src = fs.readFileSync(path.join(__dirname, "../server/TownRoom.ts"), "utf8");
  assert.match(src, /const spot = p && handoffWritten\(p\.name, p\.cls\);\s*if \(spot\) void spot\.then\(\(\) => leaveAccount\(acct\)\); else void leaveAccount\(acct\);/, "onLeave gives the account back after the spot's write");
});
