// War Councils (M3 part 1): the order set's validator, the briefing, the executor, the server's sessions (modes, kill
// switch, fallbacks, proclamations, the log and the digest in the save) and the remote routes a Claude routine uses.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { DOCTRINE, newMinds, scriptedOrders } from "../shared/war/doctrine";
import {
  buildBriefing, cleanText, COUNCIL, councilOrders, dailyDigest, intentOrders, scriptedCouncil, validateCouncil, warDay, type CouncilLogEntry,
} from "../shared/war/council";
import { newWar, targetsOf, WAR, type WarState } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { _resetWar, attachWar, onWar, startWar, step, stopWar, warState, type SavedWar, type WarNews } from "../server/war";
import {
  _resetCouncils, cleanCouncil, configureCouncils, councilMode, councilsKilled, councilAuth, councilBriefings, councilClock, killCouncils, leadIntents, mountCouncilRoutes, proclaimLine, registerProvider,
  setCouncilMode, setCouncilProvider, submitCouncilOrders, type CouncilSave,
} from "../server/warCouncil";
import type { Kv } from "../server/store";

const T0 = 1_000_000_000_000;
const saved = (next = T0): SavedWar => ({ v: 1, state: newWar(), minds: newMinds(), next, log: [] });
const rng = (seed: number) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
/** A clan with a legal target that is no capital (every clan has one on a new war). */
const K: ClanKey = "redfang";
const legalOf = (s: Pick<WarState, "owner">, k: ClanKey) => targetsOf(s, k).filter((t) => !TERRITORIES[t].capitalOf);
const fresh = () => { _resetCouncils(); const sv = saved(); _resetWar(sv); return sv; };
const cs = (sv: SavedWar) => sv.council as CouncilSave;

// ---- The validator -----------------------------------------------------------------------------------------------------

test("validator: a legal order set passes, cleaned", () => {
  const s = newWar(), [a, b] = legalOf(s, K);
  const v = validateCouncil({ clan: K, day: 0, targets: [a, b], stance: "feint", proclamation: "  To **war**!\nFor the <b>Compact</b>.  ", rationale: "They are “weak” — strike." }, s, K, 0);
  assert.ok(v.ok, v.errors.join("; "));
  assert.deepEqual(v.orders, { clan: K, day: 0, targets: [a, b], stance: "feint", proclamation: "To war! For the Compact .", rationale: "They are \"weak\" - strike." });
});

test("validator: every illegal item is rejected and named", () => {
  const s = newWar(), legal = legalOf(s, K), own = s.owner.findIndex((o, i) => o === K && !TERRITORIES[i].capitalOf);
  const keep = TERRITORIES.find((t) => t.reckoningOnly)!.id, cap = TERRITORIES.find((t) => t.capitalOf && t.capitalOf !== K)!.id;
  const far = TERRITORIES.findIndex((t, i) => s.owner[i] !== K && !t.capitalOf && !t.reckoningOnly && !targetsOf(s, K).includes(i));
  const bad = (raw: unknown, re: RegExp, day = 0) => {
    const v = validateCouncil(raw, s, K, day);
    assert.equal(v.ok, false, JSON.stringify(raw));
    assert.ok(v.errors.some((e) => re.test(e)), `${JSON.stringify(raw)}: ${v.errors.join("; ")}`);
  };
  bad(null, /must be an object/); bad("attack!", /must be an object/); bad([1, 2], /must be an object/);
  bad({ targets: [], clan: "host" }, /^clan/);
  bad({ targets: [], day: 5 }, /^day/);
  bad({ targets: [], stance: "charge" }, /^stance/);
  bad({ targets: "12" }, /^targets: must be a list/);
  bad({ targets: [legal[0], legal[1], legal[2] ?? legal[0], legal[0]] }, /at most 3/);
  bad({ targets: ["3"] }, /not a territory id/); bad({ targets: [1.5] }, /not a territory id/); bad({ targets: [NaN] }, /not a territory id/);
  bad({ targets: [-1] }, /no territory/); bad({ targets: [TERRITORIES.length] }, /no territory/);
  bad({ targets: [keep] }, /Crown Keep/);
  bad({ targets: [cap] }, /capital/);
  bad({ targets: [own] }, /already yours/);
  assert.ok(far >= 0);
  bad({ targets: [far] }, /not a legal target/);
  bad({ targets: [legal[0], legal[0]] }, /named twice/);
  bad({ targets: [], proclamation: 42 }, /proclamation: must be text/);
  bad({ targets: [], proclamation: "Hail\u0007" }, /printable/);
  bad({ targets: [], proclamation: "Glory \u{1F525}" }, /printable/);
  bad({ targets: [], rationale: "x".repeat(COUNCIL.rationaleMax + 1) }, /rationale: longer/);
  bad({ targets: [], proclamation: "y".repeat(COUNCIL.proclamationMax + 1) }, /proclamation: longer/);
  // the legal part is kept for the log
  const v = validateCouncil({ targets: [legal[0], cap] }, s, K, 0);
  assert.deepEqual(v.orders.targets, [legal[0]]);
});

test("validator: markup is stripped to plain text", () => {
  const e: string[] = [];
  assert.equal(cleanText("[Read](http://x.y) <script>alert(1)</script> # `now` ~~go~~", 200, "p", e), "Read alert(1) now go");
  assert.equal(cleanText("   ", 10, "p", e), undefined);
  assert.deepEqual(e, []);
});

// ---- Briefing, scripted council, executor --------------------------------------------------------------------------------

test("briefing: deterministic, plain JSON, only legal targets, the doctrine's pick first", () => {
  const s = newWar(), ctx = { wars: [0, 1, 2], events: [{ tick: 3, kind: "flip", by: K, from: "host" as ClanKey, text: "Redfang took a land" }, { tick: 3, kind: "flip", by: "host" as ClanKey, from: "veiled" as ClanKey, text: "not ours" }] };
  for (const k of CLAN_KEYS) {
    const a = buildBriefing(s, k, ctx), b = buildBriefing(structuredClone(s), k, structuredClone(ctx));
    assert.equal(JSON.stringify(a), JSON.stringify(b), k);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), a, `${k}: plain JSON`);
    assert.deepEqual(a.targets.map((t) => t.id).sort((x, y) => x - y), legalOf(s, k).sort((x, y) => x - y), "legal, no capital");
    assert.ok(a.targets.every((t) => !TERRITORIES[t.id].reckoningOnly));
    assert.equal(a.doctrinePick[0], a.targets[0]?.id);
    assert.equal(a.lands.held, s.owner.filter((o) => o === k).length);
    assert.equal(a.enemies.length, 4);
    assert.ok(a.crown.keep);
  }
  assert.deepEqual(buildBriefing(s, K, ctx).events, ["Redfang took a land"]);
});

test("scripted council: its orders are legal for every clan, every day of a war", () => {
  const s = newWar(), m = newMinds(), r = rng(3);
  for (let d = 0; d < 6; d++) {
    for (const k of CLAN_KEYS) {
      const b = buildBriefing(s, k), o = scriptedCouncil(b), v = validateCouncil(o, s, k, d);
      assert.ok(v.ok, `${k} day ${d}: ${v.errors.join("; ")}`);
      assert.deepEqual(scriptedCouncil(b), o, "deterministic");
    }
    for (let i = 0; i < WAR.ticksPerDay; i++) { const o = scriptedOrders(s, m, r); (s as WarState).tick++; void o; }
  }
});

test("executor: no intents plays exactly the doctrine; an intent's stance shapes the orders", () => {
  const s1 = newWar(), s2 = newWar(), m1 = newMinds(), m2 = newMinds(), r1 = rng(9), r2 = rng(9);
  for (let i = 0; i < 30; i++) { assert.deepEqual(councilOrders(s1, m1, r1, {}), scriptedOrders(s2, m2, r2)); s1.tick++; s2.tick++; }
  const s = newWar(), [a, b] = legalOf(s, "host");
  assert.deepEqual(intentOrders(s, "host", { day: 0, targets: [a, b], stance: "attack" }), { defend: DOCTRINE.defend.host, attack: [{ t: a, share: 1 }] });
  assert.deepEqual(intentOrders(s, "host", { day: 0, targets: [a], stance: "defend" }), { defend: COUNCIL.defendStance, attack: [{ t: a, share: 1 }] });
  s.tick = 0; // noon: the feint
  assert.deepEqual(intentOrders(s, "host", { day: 0, targets: [a, b], stance: "feint" }), { defend: COUNCIL.feintDay, attack: [{ t: b, share: 1 }] });
  s.tick = 2; // night: the real push
  assert.deepEqual(intentOrders(s, "host", { day: 0, targets: [a, b], stance: "feint" }), { defend: COUNCIL.feintNight, attack: [{ t: a, share: 1 }] });
  const [x, y] = legalOf(s, "redfang");
  assert.deepEqual(intentOrders(s, "redfang", { day: 0, targets: [x, y], stance: "attack" })!.attack, [{ t: x, share: 1 }, { t: y, share: COUNCIL.secondShare }], "raiders hit two places");
  assert.deepEqual(intentOrders(s, "host", { day: 0, targets: [], stance: "defend" }), { defend: 1, attack: [] });
  const gone = s.owner.findIndex((o, i) => o === "host" && !TERRITORIES[i].capitalOf); // (its own land: never a target)
  assert.equal(intentOrders(s, "host", { day: 0, targets: [gone], stance: "attack" }), undefined, "no target left: the doctrine leads");
  // a stuck front (pushed DOCTRINE.stickTicks, Control still high) gives way to the next priority; a moving one is kept
  const mind = { target: a, since: 0 };
  s.tick = DOCTRINE.stickTicks + 1; s.control[a] = 100;
  assert.equal(intentOrders(s, "host", { day: 0, targets: [a, b], stance: "attack" }, mind)!.attack[0].t, b);
  assert.deepEqual(mind, { target: b, since: s.tick });
  const moving = { target: a, since: 0 };
  s.control[a] = COUNCIL.stuckControl - 1;
  assert.equal(intentOrders(s, "host", { day: 0, targets: [a, b], stance: "attack" }, moving)!.attack[0].t, a);
  // the doctrine runs first in councilOrders, but a leading council's Mind is its own
  const w = newWar(), mm = newMinds(), [p, q] = legalOf(w, "host");
  mm.host = { target: q, since: 0 };
  const o = councilOrders(w, mm, rng(4), { host: { day: 0, targets: [p, q], stance: "attack" } });
  assert.equal(o.host.attack[0].t, q, "kept on its current priority");
  assert.equal(mm.host.target, q);
  // an intent of another day is ignored
  const m = newMinds();
  assert.deepEqual(councilOrders(newWar(), m, rng(1), { host: { day: 1, targets: [a], stance: "defend" } }), scriptedOrders(newWar(), newMinds(), rng(1)));
});

// ---- Server sessions -----------------------------------------------------------------------------------------------------

test("modes: off holds no council; shadow logs and leaves the doctrine leading; lead leads and proclaims", async () => {
  // off and shadow play the same war
  const run = async (mode: "off" | "shadow") => {
    const sv = fresh();
    if (mode === "shadow") for (const k of CLAN_KEYS) setCouncilMode(k, "shadow");
    for (let i = 0; i < WAR.ticksPerDay + 3; i++) await step(T0 + i * WAR.tickMs);
    return sv;
  };
  const off = await run("off"), sh = await run("shadow");
  assert.deepEqual(sh.state.owner, off.state.owner, "shadow councils change nothing");
  assert.deepEqual(sh.ahead, off.ahead);
  assert.equal(cs(off).log.length, 0);
  const shLog = cs(sh).log;
  assert.equal(shLog.filter((e) => e.status === "shadow" && e.day === 0).length, 5);
  assert.equal(shLog.filter((e) => e.status === "shadow" && e.day === 1).length, 5, "one session per clan per war day");
  const d0 = shLog.filter((e) => e.day === 0);
  assert.ok(d0.every((e) => e.agree && e.agree[1] > 100 && e.agree[0] <= e.agree[1]), "the day's agreement with the doctrine is logged");
  assert.deepEqual(leadIntents(cs(sh), sh.state.tick), {}, "shadow intents never lead");

  // lead: the intent's first target is attacked, the Herald proclaims
  const sv = fresh(), news: WarNews[] = [], sent: [string, any][] = [];
  setCouncilMode(K, "lead");
  const off1 = onWar((_v, _e, n) => { news.push(n); }), off2 = attachWar({ broadcast: (t, m) => { sent.push([t, m]); } });
  await step(T0);
  off1(); off2();
  const it = cs(sv).intents[K]!;
  assert.equal(it.mode, "lead");
  assert.equal(sv.ahead![K]!.attack[0].t, it.targets.find((t) => targetsOf(sv.state, K).includes(t)));
  const p = news.flatMap((n) => n.proclaim ?? []);
  assert.equal(p.length, 1);
  assert.equal(p[0].clan, K);
  assert.ok(sent.some(([t, m]) => t === "chat" && m.name === "Herald" && m.text === proclaimLine(K, p[0].text)));
  assert.equal(cs(sv).log.at(-1)!.status, "led");
});

test("proclamations go out in lead mode only", async () => {
  fresh();
  for (const k of CLAN_KEYS) setCouncilMode(k, "shadow");
  const got: WarNews[] = [], off = onWar((_v, _e, n) => { got.push(n); });
  await step(T0);
  off();
  assert.ok(got.length && got.every((n) => !n.proclaim));
});

test("kill switch: every clan reverts to the doctrine at once; no sessions while it is on", async () => {
  const sv = fresh();
  for (const k of CLAN_KEYS) setCouncilMode(k, "lead");
  await step(T0);
  assert.equal(Object.keys(leadIntents(cs(sv), sv.state.tick)).length, 5);
  killCouncils(true);
  assert.deepEqual(leadIntents(cs(sv), sv.state.tick), {});
  // the next orders are the doctrine's: the executor gets no intent, so it plays scriptedOrders' draws
  const s = structuredClone(sv.state), m = structuredClone(sv.minds);
  assert.deepEqual(councilOrders(s, m, rng(5), leadIntents(cs(sv), s.tick)), scriptedOrders(structuredClone(sv.state), structuredClone(sv.minds), rng(5)));
  await step(T0 + WAR.tickMs);
  const held = { ...cs(sv).held };
  sv.state.tick = WAR.ticksPerDay * 3; // a new day: still no session
  await councilClock(T0 + 5 * WAR.tickMs);
  assert.deepEqual(cs(sv).held, held);
  killCouncils(false);
  await councilClock(T0 + 6 * WAR.tickMs);
  assert.ok(CLAN_KEYS.every((k) => cs(sv).held[k] === warDay(sv.state.tick + 1)), "back on: the councils sit again");
});

test("kill switch from the env", () => {
  _resetCouncils();
  configureCouncils({ WAR_COUNCIL: "lead,host:shadow", WAR_COUNCIL_KILL: "1", NODE_TEST_CONTEXT: "1" });
  assert.ok(councilsKilled());
  assert.equal(councilMode("host"), "off");
  configureCouncils({ WAR_COUNCIL: "lead,host:shadow", NODE_TEST_CONTEXT: "1" });
  assert.equal(councilMode("host"), "shadow");
  assert.equal(councilMode("wardens"), "lead");
  configureCouncils({ NODE_TEST_CONTEXT: "1" });
  assert.ok(CLAN_KEYS.every((k) => councilMode(k) === "off"), "default: off");
});

test("fallback: a provider that throws, times out or hands in illegal orders leaves the doctrine leading (logged)", async () => {
  const keep = COUNCIL.timeoutMs;
  registerProvider({ name: "boom", decide: async () => { throw new Error("the oracle is drunk"); } });
  registerProvider({ name: "slow", decide: () => new Promise(() => {}) });
  registerProvider({ name: "liar", decide: async () => ({ targets: [TERRITORIES.find((t) => t.capitalOf && t.capitalOf !== "wardens")!.id] }) });
  try {
    COUNCIL.timeoutMs = 30;
    const sv = fresh();
    const set: [ClanKey, string][] = [["wardens", "boom"], ["host", "slow"], ["veiled", "liar"]];
    for (const [k, p] of set) { setCouncilMode(k, "lead"); setCouncilProvider(k, p); }
    await councilClock(T0);
    const log = cs(sv).log;
    assert.match(log.find((e) => e.k === "wardens")!.reason!, /provider failed: the oracle is drunk/);
    assert.match(log.find((e) => e.k === "host")!.reason!, /no answer within 30 ms/);
    const liar = log.find((e) => e.k === "veiled")!;
    assert.equal(liar.reason, "invalid orders");
    assert.ok(liar.errors!.some((e) => /capital/.test(e)));
    assert.ok(log.every((e) => e.status === "fallback"));
    assert.deepEqual(leadIntents(cs(sv), sv.state.tick), {}, "nobody leads: the doctrine does");
  } finally { COUNCIL.timeoutMs = keep; }
});

// ---- Save ---------------------------------------------------------------------------------------------------------------

test("save: the council round-trips, junk is dropped, the log is capped; old saves load with no council", async () => {
  const sv = fresh();
  for (const k of CLAN_KEYS) setCouncilMode(k, k === "host" ? "shadow" : "lead");
  await step(T0);
  const c = cs(sv);
  assert.deepEqual(cleanCouncil(JSON.parse(JSON.stringify(c))), c);
  assert.deepEqual(cleanCouncil(undefined), { intents: {}, held: {}, pending: {}, log: [], digests: [] });
  const junk = cleanCouncil({ intents: { host: { day: -1 }, wardens: "x", nope: {} }, held: { host: "1" }, log: [{ at: 1 }, ...Array(COUNCIL.logMax + 20).fill({ at: 1, day: 0, k: "host", mode: "lead", provider: "scripted", status: "led" })], digests: [{}] });
  assert.deepEqual(junk.intents, {});
  assert.deepEqual(junk.held, {});
  assert.equal(junk.log.length, COUNCIL.logMax);
  assert.deepEqual(junk.digests, []);

  // an old save (no `council`) loads, and the field is written back cleaned
  const m = new Map<string, string>(), kv: Kv = { get: async (k) => (m.has(k) ? JSON.parse(m.get(k)!) : undefined), set: async (k, v) => { m.set(k, JSON.stringify(v)); } };
  const old = saved(Date.now() + 3_600_000);
  m.set("war", JSON.stringify(old));
  _resetCouncils(); _resetWar(undefined); stopWar();
  await startWar(kv);
  stopWar();
  assert.ok(warState());
  const { warCouncilSave } = await import("../server/war");
  assert.deepEqual(warCouncilSave(), cleanCouncil(undefined));
});

// ---- Digest -------------------------------------------------------------------------------------------------------------

test("digest: councils, rejections, fallbacks, flips, battles and the Reckoning, in plain text", () => {
  const e = (x: Partial<CouncilLogEntry>): CouncilLogEntry => ({ at: 1, day: 4, k: "host", mode: "lead", provider: "scripted", status: "led", ...x });
  const t = TERRITORIES.find((x) => !x.capitalOf)!;
  const text = dailyDigest(4, {
    council: [
      e({ orders: { targets: [t.id], stance: "attack", proclamation: "The dead march.", rationale: "It shakes." } }),
      e({ k: "wardens", mode: "shadow", status: "shadow", orders: { targets: [t.id] }, agree: [100, 144] }),
      e({ k: "veiled", status: "fallback", reason: "provider failed: boom" }),
      e({ k: "redfang", provider: "remote", status: "rejected", errors: ["targets[0]: x is a capital; capitals never fall"] }),
      e({ k: "hidekin", day: 3 }),
    ],
    events: [{ tick: 600, kind: "flip", by: "host", from: "wardens", text: "The Ossuary Host took Somewhere" }, { tick: 601, kind: "siege", by: "host", from: "veiled", text: "x" }],
    battles: [{ kind: "pitched", t: t.id, a: "host", b: "wardens", result: "att" }],
    reckoning: { winner: "veiled", kept: false },
    owner: newWar().owner,
  });
  for (const want of ["war day 4", `host (lead, scripted) led: attack on ${t.name}. Why: It shakes.`, 'proclaimed: "The dead march."', "doctrine agreed 100/144 ticks",
    "veiled (lead, scripted) fell back to doctrine: provider failed: boom", "submission rejected: targets[0]", "Flips: 1, sieges laid: 1",
    "The Ossuary Host took Somewhere", `pitched at ${t.name}: host vs wardens, host won`, "Reckoning: veiled took the Crown Keep", "Land: wardens"]) assert.ok(text.includes(want), `${want}\n---\n${text}`);
  assert.ok(!text.includes("hidekin (lead"), "other days stay out");
  assert.ok(/^[\x20-\x7e\n]*$/.test(text), "plain text");
});

test("digest: the server keeps one per war day, the last few only", async () => {
  const sv = fresh();
  setCouncilMode("host", "lead");
  for (let i = 0; i < WAR.ticksPerDay * 2 + 2; i++) await step(T0 + i * WAR.tickMs);
  const d = cs(sv).digests;
  assert.deepEqual(d.map((x) => x.day), [0, 1]);
  assert.match(d[0].text, /host \(lead, scripted\) led/);
});

// ---- Remote councils ------------------------------------------------------------------------------------------------------

const TOKEN = "s3cret-token-for-tests-0123";
async function serve(env: NodeJS.ProcessEnv) {
  const app = express();
  mountCouncilRoutes(app, env);
  const srv = app.listen(0);
  await new Promise((ok) => srv.once("listening", ok));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  return { base, close: () => new Promise((ok) => srv.close(ok)) };
}
const auth = (t = TOKEN) => ({ authorization: `Bearer ${t}` });

test("remote auth: no token set, a short token, a missing or wrong bearer are all refused", async () => {
  assert.equal(councilAuth(`Bearer ${TOKEN}`, undefined), false);
  assert.equal(councilAuth("Bearer short", "short"), false);
  assert.equal(councilAuth(undefined, TOKEN), false);
  assert.equal(councilAuth(TOKEN, TOKEN), false);
  assert.equal(councilAuth(`Bearer ${TOKEN}x`, TOKEN), false);
  assert.equal(councilAuth(`Bearer ${TOKEN}`, TOKEN), true);
  fresh();
  const off = await serve({});
  try {
    assert.equal((await fetch(`${off.base}/api/war/council/briefing`, { headers: auth() })).status, 404, "env unset: the routes are off");
    assert.equal((await fetch(`${off.base}/api/war/council/orders`, { method: "POST", headers: auth() })).status, 404);
  } finally { await off.close(); }
  const on = await serve({ WAR_COUNCIL_TOKEN: TOKEN });
  try {
    assert.equal((await fetch(`${on.base}/api/war/council/briefing`)).status, 401);
    assert.equal((await fetch(`${on.base}/api/war/council/briefing`, { headers: auth("wrong-token-wrong-token") })).status, 401);
    assert.equal((await fetch(`${on.base}/api/war/council/orders`, { method: "POST", headers: { ...auth("nope"), "content-type": "application/json" }, body: "{}" })).status, 401);
    const big = await fetch(`${on.base}/api/war/council/orders`, { method: "POST", headers: { ...auth(), "content-type": "application/json" }, body: JSON.stringify({ x: "y".repeat(20_000) }) });
    assert.equal(big.status, 413, "body capped");
  } finally { await on.close(); }
});

test("remote: briefing, a rejected then fixed submission, the session leads with it; nothing arrived: fallback; a past day: refused", async () => {
  const sv = fresh();
  setCouncilMode(K, "lead"); setCouncilProvider(K, "remote");
  setCouncilMode("host", "lead"); setCouncilProvider("host", "remote");
  const srv = await serve({ WAR_COUNCIL_TOKEN: TOKEN });
  try {
    const br = await (await fetch(`${srv.base}/api/war/council/briefing?clan=${K}`, { headers: auth() })).json() as any;
    assert.equal(br.clans.length, 1);
    const c = br.clans[0], day = c.day;
    assert.equal(day, 0);
    assert.ok(br.schema.orders.targets);
    assert.deepEqual(c.briefing.targets.map((t: any) => t.id).sort(), legalOf(sv.state, K).sort());
    const post = (body: unknown) => fetch(`${srv.base}/api/war/council/orders`, { method: "POST", headers: { ...auth(), "content-type": "application/json" }, body: JSON.stringify(body) });
    const cap = TERRITORIES.find((t) => t.capitalOf && t.capitalOf !== K)!.id;
    const r1 = await post({ clan: K, day, orders: { targets: [cap], stance: "attack" } });
    assert.equal(r1.status, 422);
    const j1 = await r1.json() as any;
    assert.equal(j1.ok, false);
    assert.ok(j1.errors.some((e: string) => /capital/.test(e)));
    assert.equal(cs(sv).log.at(-1)!.status, "rejected");
    const pick = c.briefing.targets.at(-1).id;
    const r2 = await post({ clan: K, day, orders: { targets: [pick], stance: "defend", proclamation: "Hold fast, then strike.", rationale: "Testing." } });
    assert.equal(r2.status, 200);
    assert.deepEqual((await r2.json() as any).orders.targets, [pick]);
    // the session sits: Redfang's remote orders lead; the Host sent nothing and falls back
    await councilClock(T0);
    assert.deepEqual(cs(sv).intents[K], { day: 0, targets: [pick], stance: "defend", mode: "lead" });
    assert.match(cs(sv).log.find((e) => e.k === "host")!.reason!, /no orders arrived for war day 0/);
    assert.equal(cs(sv).pending[K], undefined, "used up");
    // day 0 has sat: orders for it are refused, day 1 is open
    const r3 = await post({ clan: K, day: 0, orders: { targets: [pick] } });
    assert.equal(r3.status, 409);
    assert.match((await r3.json() as any).errors[0], /past/);
    assert.equal(submitCouncilOrders({ clan: K, day: 7, orders: { targets: [] } }).status, 409, "a far day is not open");
    assert.equal(submitCouncilOrders({ clan: "wardens", day: 1, orders: { targets: [] } }).status, 409, "a clan whose council is not remote");
    assert.equal(submitCouncilOrders({ clan: "nope", day: 1 }).status, 400);
    assert.equal((councilBriefings(K).body as any).clans[0].day, 1);
    killCouncils(true);
    assert.equal(submitCouncilOrders({ clan: K, day: 1, orders: { targets: [] } }).status, 409, "the kill switch closes the door");
  } finally { await srv.close(); killCouncils(false); }
});

// ---- Clan plug-ins (Living Code M6): the `plugin` provider ------------------------------------------------------------------

test("plugin provider: chosen from the env, logged as plugin:<clan>..., unpinned falls back; the default env never picks it", async () => {
  const { _resetClanPlugins } = await import("../server/clanPlugins");
  fresh(); _resetClanPlugins();
  configureCouncils({ NODE_TEST_CONTEXT: "1" });
  const { councilAdmin } = await import("../server/warCouncil");
  assert.ok(Object.values(councilAdmin().modes).every((m) => m.provider === "scripted"));
  configureCouncils({ WAR_COUNCIL: "lead", WAR_COUNCIL_PROVIDER: "scripted,host:plugin", NODE_TEST_CONTEXT: "1" });
  assert.equal(councilAdmin().modes.host.provider, "plugin");
  assert.equal(councilAdmin().modes.wardens.provider, "scripted");
  const sv = fresh();
  configureCouncils({ WAR_COUNCIL: "host:lead", WAR_COUNCIL_PROVIDER: "host:plugin", NODE_TEST_CONTEXT: "1" });
  await councilClock(T0);
  const e = cs(sv).log.find((x) => x.k === "host")!;
  assert.equal(e.status, "fallback");
  assert.match(e.provider, /^plugin:host(@[\w.-]+#[0-9a-f]{8})?$/);
  assert.match(e.reason!, /no hash pinned/);
  // the longest provider id fits the saved log
  const long = "plugin:hidekin@12345678#0123abcd";
  assert.equal(long.length, 32);
  assert.equal(cleanCouncil({ log: [{ at: 1, day: 0, k: "hidekin", mode: "lead", provider: long, status: "led" }] }).log[0].provider, long);
});
