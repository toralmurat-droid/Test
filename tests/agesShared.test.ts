// Ages part 7 (roadmap M5, docs/ages-progress.md): with two servers on one Postgres nothing a player does on the server
// that does not own a shared row is lost or applied twice. Handoff spots in kv, the shared idea log, and follower queues
// (server/ageQueue.ts) for Tide kills, sacks and town claims. "Two servers" run in one process: the module plays the
// follower, then (reset) the owner, on one in-memory kv and lease table, as tests/ages.test.ts does.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LEASE, Leases, memLeases, type LeaseBackend } from "../server/lease";
import type { Kv } from "../server/store";
import { AgeQueue, sharedStateOn } from "../server/ageQueue";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { newWar, WAR } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { townPatron } from "../shared/war/towns";
import { TIDE } from "../shared/tide";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ptb-ages-shared-"));
process.env.IDEAS_FILE = path.join(dir, "ideas.json"); // (before server/ideaStore is loaded: never data/)
process.env.SAVE_FILE = path.join(dir, "saves.json"); // (server/handoff.ts's file)
process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));

/** A kv in memory with every optional part, and a count of writes per key. */
function memKv(leases?: LeaseBackend) {
  const m = new Map<string, string>(), writes = new Map<string, number>();
  const kv: Kv = {
    get: async (k) => (m.has(k) ? JSON.parse(m.get(k)!) : undefined),
    set: async (k, v) => { m.set(k, JSON.stringify(v)); writes.set(k, (writes.get(k) ?? 0) + 1); },
    insertIfAbsent: async (k, v) => { if (m.has(k)) return false; await kv.set(k, v); return true; },
    list: async <T>(p: string) => Object.fromEntries([...m].filter(([k]) => k.startsWith(p)).map(([k, v]) => [k, JSON.parse(v) as T])),
    take: async <T>(k: string) => { const v = m.get(k); m.delete(k); return v === undefined ? undefined : (JSON.parse(v) as T); },
    del: async (ks) => { for (const k of ks) m.delete(k); },
    leases,
  };
  return { kv, m, writes };
}
const clock = (t = 1_000_000) => { const c = { t, now: () => c.t }; return c; };
const json = (m: Map<string, string>, k: string) => JSON.parse(m.get(k)!);

// ---- The queue itself ---------------------------------------------------------------------------------------------------

test("age queue: batches numbered per holder, counted once by drained marks, dropped by the follower once counted", async () => {
  const { kv, m } = memKv();
  const q = new AgeQueue<{ n: number }>("q:", (b) => (typeof b.n === "number" ? { n: b.n } : undefined));
  await q.push(kv, "b", 0, { n: 2 }); await q.push(kv, "b", 0, { n: 3 });
  assert.deepEqual(json(m, "q:b"), { holder: "b", seq: 2, batches: [{ n: 2, seq: 1 }, { n: 3, seq: 2 }] });
  m.set("q:junk", JSON.stringify({ holder: 5 })); // (not a queue: ignored)
  let got: number[] = [];
  const d1 = await q.drain(kv, undefined, (b) => got.push(b.n));
  assert.deepEqual(got, [2, 3]); assert.deepEqual(d1, { b: 2 });
  got = [];
  assert.deepEqual(await q.drain(kv, d1, (b) => got.push(b.n)), { b: 2 }); assert.deepEqual(got, [], "counted once");
  const q2 = new AgeQueue<{ n: number }>("q:", (b) => (typeof b.n === "number" ? { n: b.n } : undefined)); // (the follower restarted)
  await q2.push(kv, "b", 2, { n: 7 });
  assert.deepEqual(json(m, "q:b"), { holder: "b", seq: 3, batches: [{ n: 7, seq: 3 }] }, "counted batches dropped, numbering goes on");
  assert.deepEqual(await q.drain(kv, d1, (b) => got.push(b.n)), { b: 3 }); assert.deepEqual(got, [7]);
  assert.equal(await q.drain({ get: kv.get, set: kv.set }, d1, () => {}), undefined, "a store without list: nothing drained");
});

test("shared state turns on only for several servers on Postgres (AGE_SLOT or ACCOUNT_LEASES=1): one server keeps its files", () => {
  const db = "postgres://x";
  assert.equal(sharedStateOn({}), false, "JSON mode");
  assert.equal(sharedStateOn({ DATABASE_URL: db }), false, "today's single server on Postgres: data/handoff.json and the idea file");
  assert.equal(sharedStateOn({ DATABASE_URL: db, ACCOUNT_LEASES: "0" }), false);
  assert.equal(sharedStateOn({ DATABASE_URL: db, AGE_SLOT: "blue" }), true);
  assert.equal(sharedStateOn({ DATABASE_URL: db, ACCOUNT_LEASES: "1" }), true);
  assert.equal(sharedStateOn({ AGE_SLOT: "blue" }), false, "no shared store without Postgres");
  const src = fs.readFileSync(path.join(__dirname, "../server/index.ts"), "utf8");
  assert.match(src, /if \(sharedStateOn\(\)\) \{ await useHandoffKv\(kv\); await initIdeas\(kv\); \}/, "index.ts gates both on it");
});

test("ideas without a shared store (one server): the file, as before", async () => {
  const I = await import("../server/ideaStore");
  I._resetIdeas();
  assert.equal(I.ideasFollow(), false);
  const r = I.submitIdea({ name: "Gil", level: 10 }, "A bigger bank for every hero please");
  assert.ok(r.ok && !r.queued); assert.equal(r.idea!.id, 1);
  I.saveIdeas(); await new Promise((res) => setTimeout(res, 600));
  assert.equal(JSON.parse(fs.readFileSync(process.env.IDEAS_FILE!, "utf8")).ideas[0].author, "Gil");
  I._resetIdeas();
});

// ---- Handoff spots ------------------------------------------------------------------------------------------------------

test("handoff (shared store): a spot written on leave is taken on any server's login, once; expired spots are ignored and pruned", async () => {
  const h = await import("../server/handoff");
  const { kv, m } = memKv();
  await h.useHandoffKv(kv);
  try {
    h.rememberLive("Ann", "wizard", { x: 100, y: 200, dir: "left", hp: 30, mana: 5, energy: 7, group: ["Bob"] });
    await h.writeHandoff(); // (shutdown: waits for the writes made on leave)
    const row = json(m, "handoff:ann:wizard");
    assert.equal(row.x, 100); assert.deepEqual(row.group, ["Bob"]);
    assert.equal(fs.existsSync(path.join(dir, "handoff.json")), false, "no file with a shared store");
    // server B: knows nothing locally, takes the spot at login
    assert.ok(h.takeLive("Ann", "wizard"), "(server A's own memory, dropped: B starts empty)");
    await h.fetchLive("Ann", "wizard");
    assert.equal(m.has("handoff:ann:wizard"), false, "taken: deleted at once");
    const s = h.takeLive("Ann", "wizard");
    assert.ok(s); assert.equal(s!.x, 100); assert.equal(s!.dir, "left"); assert.deepEqual(s!.group, ["Bob"]);
    await h.fetchLive("Ann", "wizard");
    assert.equal(h.takeLive("Ann", "wizard"), undefined, "used once");
    // an expired spot is ignored (and deleted); prune drops expired rows and junk, keeps fresh ones
    const old = { x: 1, y: 2, dir: "up", hp: 1, mana: 1, energy: 1, group: [], at: Date.now() - h.HANDOFF_MS - 1 };
    m.set("handoff:cy:vampire", JSON.stringify(old));
    await h.fetchLive("Cy", "vampire");
    assert.equal(h.takeLive("Cy", "vampire"), undefined);
    assert.equal(m.has("handoff:cy:vampire"), false);
    m.set("handoff:old:wizard", JSON.stringify(old)); m.set("handoff:bad:wizard", JSON.stringify({ x: "no" }));
    m.set("handoff:new:wizard", JSON.stringify({ ...old, at: Date.now() }));
    await h.pruneHandoff();
    assert.deepEqual([...m.keys()].filter((k) => k.startsWith("handoff:")), ["handoff:new:wizard"]);
    // a newer spot in this server's memory wins over an older shared one; New game drops both
    h.rememberLive("Dee", "summoner", { x: 9, y: 9, dir: "down", hp: 1, mana: 1, energy: 1, group: [] });
    await h.writeHandoff();
    m.set("handoff:dee:summoner", JSON.stringify({ ...old, at: Date.now() - 1000 }));
    await h.fetchLive("Dee", "summoner");
    assert.equal(h.takeLive("Dee", "summoner")!.x, 9);
    h.rememberLive("Eve", "wizard", { x: 1, y: 1, dir: "down", hp: 1, mana: 1, energy: 1, group: [] });
    h.dropLive("Eve", "wizard"); await h.writeHandoff();
    assert.equal(m.has("handoff:eve:wizard"), false);
  } finally { await h.useHandoffKv(undefined); }
  // JSON mode (no shared store): the file, as before
  h.rememberLive("Fay", "wizard", { x: 5, y: 6, dir: "up", hp: 1, mana: 1, energy: 1, group: [] });
  await h.writeHandoff();
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "handoff.json"), "utf8"))["fay:wizard"].x, 5);
  assert.equal(m.has("handoff:fay:wizard"), false);
});

// ---- The idea log -------------------------------------------------------------------------------------------------------

test("ideas (shared store): ideas and votes from the follower and the owner all land in the one log, each once", async () => {
  const I = await import("../server/ideaStore");
  const c = clock(), be = memLeases(c.now), { kv, m } = memKv(be);
  const ann = { name: "Ann", level: 10 }, bob = { name: "Bob", level: 10, addr: "x1" }, cy = { name: "Cy", level: 10, addr: "x2" };
  try {
    // server B follows (server A holds the log's lease)
    be.rows.set("lease:ideas", { holder: "main:a", until: Infinity });
    I._resetIdeas();
    await I.initIdeas(kv, new Leases(be, "main:b", true, c.now));
    assert.equal(I.ideasFollow(), true);
    const r = I.submitIdea(ann, "More fishing spots near the river please");
    assert.ok(r.ok && r.queued, "checked here and queued");
    assert.ok(I.ideaLog.ideas.some((i) => i.id < 0 && i.author === "Ann"), "shown here at once, under a temporary number");
    assert.equal(I.submitIdea(ann, "A second idea from Ann today").ok, false, "the daily limit holds here too");
    await I.ideasBeat(c.t);
    assert.equal(json(m, "ideas-q:main:b").batches.length, 1);

    // server A (the owner): applies B's idea and takes its own
    I._resetIdeas();
    await I.initIdeas(kv, new Leases(be, "main:a", true, c.now));
    assert.equal(I.ideasFollow(), false);
    assert.deepEqual(I.ideaLog.ideas.map((i) => [i.id, i.author]), [[1, "Ann"]], "B's idea, numbered by the owner");
    assert.ok(I.submitIdea(bob, "Let pets carry one extra potion").ok);
    assert.equal(I.voteIdea(bob, 1, 1).ok, true);
    I.saveIdeas(); await new Promise((r) => setTimeout(r, 600));
    let row = json(m, "ideas");
    assert.deepEqual(row.ideas.map((i: { id: number }) => i.id), [1, 2]);
    assert.deepEqual(row.drained, { "main:b": 1 });
    assert.deepEqual(I.publicLog().map((i) => i.author), ["Bob", "Ann"], "the admin list shows both servers' ideas");
    // the owner restarts: nothing applied twice
    I._resetIdeas();
    await I.initIdeas(kv, new Leases(be, "main:a", true, c.now));
    await I.ideasBeat(c.t);
    assert.equal(I.ideaLog.ideas.length, 2);
    assert.deepEqual(I.ideaLog.ideas[0].votes, { "a:x1": 1 });

    // B again: sees the shared log, votes (queued), then takes over when A's lease runs out
    I._resetIdeas();
    be.rows.set("lease:ideas", { holder: "main:a", until: c.t + LEASE.ttlMs });
    await I.initIdeas(kv, new Leases(be, "main:b", true, c.now));
    assert.equal(I.ideasFollow(), true);
    assert.equal(I.ideaLog.ideas.length, 2, "the follower shows the owner's log");
    assert.equal(json(m, "ideas-q:main:b").batches.length, 0, "the counted batch is dropped from B's queue");
    assert.ok(I.voteIdea(cy, 1, 1).ok);
    await I.ideasBeat(c.t); // (queued: batch 2)
    assert.ok(I.voteIdea(cy, 2, -1).ok); // (not written yet when the owner changes)
    c.t += LEASE.ttlMs + 1;
    await I.ideasBeat(c.t);
    assert.equal(I.ideasFollow(), false, "B owns the log now");
    row = json(m, "ideas");
    assert.deepEqual(row.ideas.find((i: { id: number }) => i.id === 1).votes, { "a:x1": 1, "a:x2": 1 });
    assert.deepEqual(row.ideas.find((i: { id: number }) => i.id === 2).votes, { "a:x2": -1 });
    assert.deepEqual(row.drained, { "main:b": 2 });
    await I.ideasBeat(c.t);
    assert.deepEqual(json(m, "ideas").ideas.find((i: { id: number }) => i.id === 1).votes, { "a:x1": 1, "a:x2": 1 }, "not counted twice");
    await I.flushIdeas();
    assert.equal(be.rows.has("lease:ideas"), false, "shutdown gives the lease back");
  } finally { I._resetIdeas(); }
});

// ---- The Gloam Tide's meter ---------------------------------------------------------------------------------------------

test("tide (shared store): a follower's blob kills reach the owner's meter once, across an owner restart and an owner change", async () => {
  const W = await import("../server/worldStore");
  const c = clock(), be = memLeases(c.now), { kv, m } = memKv(be);
  const rows = new Map<string, any>();
  const store = { kind: "postgres" as const, load: async () => Object.fromEntries(rows), loadOne: async (k: string) => structuredClone(rows.get(k)), save: async (ch: Record<string, any>) => { for (const [k, v] of Object.entries(ch)) rows.set(k, structuredClone(v)); } };
  rows.set("world", { v: 1, tide: 5, marches: 0 });
  be.rows.set("lease:world", { holder: "main:owner", until: c.t + LEASE.ttlMs });
  const setup = async (holder: string) => {
    const l = new Leases(be, holder, true, c.now); await l.want("lease:world").renew();
    W._setupWorld(store, l, W.cleanWorld(rows.get("world")), kv);
  };
  const kill = () => { W.world().tide++; W.queueTideKill(); }; // (what server/tide.ts does on a follower)
  // the follower
  await setup("main:me");
  assert.equal(W.worldFollows(), true);
  kill(); kill(); kill();
  await W._claimWorld();
  assert.deepEqual(json(m, "world-tide:main:me").batches, [{ kills: 3, seq: 1 }]);
  assert.equal(W.world().tide, 8, "the owner's meter, plus this server's kills not counted yet");
  assert.equal(rows.get("world").tide, 5, "a follower never writes the world");
  // the owner counts them once, also after a restart
  await setup("main:owner");
  assert.equal(W.worldFollows(), false);
  await W._claimWorld();
  assert.equal(rows.get("world").tide, 8);
  assert.deepEqual(rows.get("world").drained, { "main:me": 1 });
  await W._claimWorld();
  await setup("main:owner"); await W._claimWorld();
  assert.equal(rows.get("world").tide, 8, "counted once");
  // the follower again: its counted batch goes; two more kills queued, one not written when the owner goes away
  await setup("main:me");
  kill(); kill();
  await W._claimWorld();
  assert.deepEqual(json(m, "world-tide:main:me").batches, [{ kills: 2, seq: 2 }]);
  assert.equal(W.world().tide, 10);
  kill();
  c.t += LEASE.ttlMs + 1; // (the owner stopped renewing)
  await W._claimWorld();
  assert.equal(W.worldFollows(), false, "this server owns the world now");
  assert.equal(rows.get("world").tide, 11, "the queued kills and the unwritten one, each once");
  assert.deepEqual(rows.get("world").drained, { "main:me": 2 });
  // a full meter or a called march takes no kills (as on the owner)
  rows.set("world", { ...rows.get("world"), tide: TIDE.goal - 1, marchAt: c.t + 1000 });
  be.rows.delete("lease:world"); // (main:me shut down and gave it back)
  await setup("main:owner2");
  assert.equal(W.worldFollows(), false);
  m.set("world-tide:main:x", JSON.stringify({ holder: "main:x", seq: 1, batches: [{ seq: 1, kills: 5 }] }));
  await W._claimWorld();
  assert.equal(rows.get("world").tide, TIDE.goal - 1);
  assert.equal(rows.get("world").drained["main:x"], 1, "counted (and dropped) all the same");
});

test("tide on a follower: a blob kill is queued for the owner, which alone fills the meter and moves a missed march", async () => {
  const { Tide } = await import("../server/tide");
  const w = { v: 1 as const, tide: TIDE.goal - 1, marches: 0 } as { v: 1; tide: number; marches: number; marchAt?: number };
  let queued = 0, changed = 0;
  const t = new Tide({
    heroes: () => [], hero: () => undefined, mob: () => undefined, spawn: () => undefined, removeMob: () => {}, send: () => {},
    act1: () => true, dayFrac: () => 0.5, pay: () => {}, world: () => w, changed: () => { changed++; },
    follows: () => true, queueKill: () => { queued++; },
  });
  try {
    const blob = { kind: "slime", dead: true, owner: "", summonFor: "", qwave: false, tide: false };
    t.kill("p", blob);
    assert.equal(queued, 1); assert.equal(w.tide, TIDE.goal, "shown here");
    assert.equal(w.marchAt, undefined, "the owner calls the march"); assert.equal(changed, 0, "never written here");
    t.tick(Date.now());
    assert.equal(w.marchAt, undefined, "a full meter is not booked by a follower");
    const late = Date.now() - TIDE.lateMs - 1;
    w.marchAt = late; t.tick(Date.now());
    assert.equal(w.marchAt, late, "a missed march is moved by the owner only");
    assert.equal(changed, 0);
  } finally { t.release(); }
});

// ---- Sacks and town claims ----------------------------------------------------------------------------------------------

test("war (shared store): a follower's sack and town claim are applied once by the owner, across a restart and an owner change", async () => {
  const war = await import("../server/war");
  const t0 = 31_000_000_000_000, c = clock(t0), be = memLeases(c.now), { kv, m } = memKv(be);
  const st = newWar(), P = townPatron("saltmere"), own = st.owner[P], foe = CLAN_KEYS.find((k) => k !== own)! as ClanKey;
  st.owner[P] = foe;
  const t = TERRITORIES.findIndex((x, i) => !x.reckoningOnly && !st.siege[i] && st.owner[i] !== foe && i !== P);
  const row = { v: 1, state: st, minds: newMinds(), next: t0 + WAR.tickMs, log: [], towns: { saltmere: { k: own, c: { by: foe, until: st.tick + 3, ext: 0 } } } };
  m.set("war", JSON.stringify(row));
  be.rows.set("lease:war", { holder: "main:owner", until: c.t + LEASE.ttlMs });
  const start = async (holder: string) => { war._resetWar(undefined); war.stopWar(); await war.startWar(kv, new Leases(be, holder, true, c.now)); war.stopWar(); };
  const sacks = () => war.warLog(200).filter((e) => e.kind === "sack" && e.t === t).length;
  const claims = () => war.warLog(200).filter((e) => e.kind === "town" && e.town === "saltmere" && e.change === "claimed").length;
  try {
    await start("main:me");
    assert.equal(war.warRole(), "follower");
    const control = war.warState()!.control[t];
    assert.equal(war.strikeHold(t, foe, false, "Ann", c.t), undefined, "queued, not applied here");
    assert.equal(war.townClaim("saltmere", foe, "Bob", c.t), true, "queued");
    assert.equal(war.townClaim("saltmere", foe, "Cy", c.t), false, "never claimed twice from here meanwhile");
    assert.equal(war.warState()!.control[t], control);
    await war._pulse(c.t);
    assert.equal(json(m, "war-acts:main:me").batches[0].acts.length, 2);
    assert.equal(JSON.parse(m.get("war")!).log.length, 0, "a follower never writes the war");

    // the owner applies both at its next beat (not waiting for the tick)
    await start("main:owner");
    assert.equal(war.warRole(), "owner");
    await war._pulse(c.t);
    const saved = JSON.parse(m.get("war")!);
    assert.equal(saved.state.tick, 0, "no tick ran");
    assert.ok(saved.state.control[t] < control, "the sack loosened the grip");
    assert.equal(saved.towns.saltmere.k, foe, "the town flipped");
    assert.deepEqual(saved.drainedActs, { "main:me": 1 });
    assert.equal(sacks(), 1); assert.equal(claims(), 1);
    assert.equal(war.warSacked(t), true, "sacked this tick, for every server's Holds");
    await war._pulse(c.t);
    await start("main:owner"); await war._pulse(c.t);
    assert.equal(sacks(), 1, "a restart applies nothing twice"); assert.equal(claims(), 1);

    // the follower again: a second sack of that land this tick is dropped by the owner; the owner changes
    await start("main:me");
    await war._pulse(c.t);
    assert.deepEqual(json(m, "war-acts:main:me").batches, [], "the counted batch is dropped");
    war.strikeHold(t, foe, false, "Dee", c.t);
    await war._pulse(c.t); // (queued: batch 2)
    c.t += LEASE.ttlMs + 1; // (the owner went away)
    await war._pulse(c.t);
    assert.equal(war.warRole(), "owner");
    await war._pulse(c.t);
    assert.equal(sacks(), 1, "one sack per land per war tick, across servers");
    assert.deepEqual(JSON.parse(m.get("war")!).drainedActs, { "main:me": 2 });
  } finally { war.stopWar(); war._resetWar(); }
});
