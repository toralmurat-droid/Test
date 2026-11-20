// Clan plug-ins (Living Code M6 part 1): off by default, the hash pin, the sandbox (what it lacks, its limits), every
// failure falling back to the doctrine, the auto switch-off, the kill switch (env and admin), the provider id in the
// council log, the default plug-ins equal to the scripted council, and the gate. The bundles are built from the clan
// folders (fs.readdirSync below lists them), so this file always runs in CI.
import type { ClanPlugin } from "../shared/clans/api";
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { buildBriefing, scriptedCouncil, warDay, type CouncilLogEntry } from "../shared/war/council";
import { newWar, targetsOf, WAR } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { CLAN_PLUGIN } from "../shared/clans/api";
import { _resetWar, warState, type SavedWar } from "../server/war";
import { _resetCouncils, cleanCouncil, configureCouncils, councilAdmin, councilClock, leadIntents, setCouncilMode, setCouncilProvider, type CouncilSave } from "../server/warCouncil";
import {
  _resetClanPlugins, _setClanBundle, clanBundle, clanPluginsAdmin, clanPluginsKilled, configureClanPlugins, enableClanPlugin, killClanPlugins, mountClanPluginAdmin, pluginCouncilSync,
} from "../server/clanPlugins";
import { sandboxRun } from "../server/clanPluginWorker";
import { gateCode, gateFixtures } from "../tools/clans/gate";

const T0 = 1_000_000_000_000;
const K: ClanKey = "wardens";
const sha = (code: string) => crypto.createHash("sha256").update(code).digest("hex");
const saved = (): SavedWar => ({ v: 1, state: newWar(), minds: newMinds(), next: T0, log: [] });
const fresh = () => { _resetCouncils(); _resetClanPlugins(); const sv = saved(); _resetWar(sv); return sv; };
const cs = (sv: SavedWar) => sv.council as CouncilSave;
const pin = (pins: Partial<Record<ClanKey, string>>, extra: Record<string, string> = {}) =>
  configureClanPlugins({ CLAN_PLUGINS: Object.entries(pins).map(([k, h]) => `${k}:${h}`).join(","), NODE_TEST_CONTEXT: "1", ...extra });
/** Clan k's council in lead mode with the plug-in provider. */
const usePlugin = (k: ClanKey = K) => { setCouncilMode(k, "lead"); setCouncilProvider(k, "plugin"); };
/** A hand-written bundle: `plugin` with these fields (council's body as source). */
const bundle = (council: string, fields = `api: 1, clan: "${K}", version: "t1"`) => `var __clan = { plugin: { ${fields}, council: ${council} } };`;
/** Runs clan k's session for the war day after `day` and returns its log entry. */
async function sit(sv: SavedWar, day: number, k: ClanKey = K): Promise<CouncilLogEntry> {
  sv.state.tick = day * WAR.ticksPerDay;
  await councilClock(T0 + day * 3_600_000);
  return cs(sv).log.filter((e) => e.k === k).at(-1)!;
}

test("off by default: no env, no pins, no plug-in runs, councils as before", async () => {
  _resetCouncils();
  configureClanPlugins({ NODE_TEST_CONTEXT: "1" });
  configureCouncils({ NODE_TEST_CONTEXT: "1" });
  const a = await clanPluginsAdmin();
  assert.equal(a.killed, false);
  for (const k of CLAN_KEYS) {
    const c = a.clans[k] as { pin: string | null; live: boolean };
    assert.equal(c.pin, null);
    assert.equal(c.live, false);
  }
  assert.ok(Object.values(councilAdmin().modes).every((m) => m.mode === "off" && m.provider === "scripted"), "councils off, scripted");
  // the plug-in provider without a pin: the doctrine leads, logged
  const sv = fresh();
  usePlugin();
  const e = await sit(sv, 0);
  assert.equal(e.status, "fallback");
  assert.match(e.reason!, /no hash pinned/);
  assert.equal(e.provider.startsWith("plugin:wardens"), true);
  assert.deepEqual(leadIntents(cs(sv), sv.state.tick), {});
});

test("pins: malformed pins are ignored (fail closed)", async () => {
  fresh();
  pin({}, { CLAN_PLUGINS: "wardens:abc,host:zzzzzzzz,nobody:0123456789,redfang:0123456789abcdef" });
  const a = await clanPluginsAdmin();
  assert.equal((a.clans.wardens as { pin: string | null }).pin, null, "too short");
  assert.equal((a.clans.host as { pin: string | null }).pin, null, "not hex");
  assert.equal((a.clans.redfang as { pin: string | null }).pin, "0123456789abcdef");
});

test("wrong hash: the bundle does not run, the doctrine leads", async () => {
  const sv = fresh();
  usePlugin();
  const b = (await clanBundle(K))!;
  pin({ [K]: (b.sha256[0] === "0" ? "1" : "0") + b.sha256.slice(1, 16) });
  const e = await sit(sv, 0);
  assert.equal(e.status, "fallback");
  assert.match(e.reason!, /hash mismatch/);
  assert.equal(e.provider, `plugin:${K}@1#${b.sha256.slice(0, 8)}`);
});

test("pinned default plug-in: provider plugin:<clan>@<v>#<sha8>, orders equal the scripted council's", async () => {
  // the scripted council's orders for the same war and day
  const sv0 = fresh();
  setCouncilMode(K, "lead");
  const scripted = await sit(sv0, 0);
  assert.equal(scripted.status, "led");

  const sv = fresh();
  usePlugin();
  const b = (await clanBundle(K))!;
  assert.ok(b.code.length < 40_000, "the bundle is small (the kit only, not the map)");
  pin({ [K]: b.sha256.slice(0, 16) });
  const e = await sit(sv, 0);
  assert.equal(e.status, "led", e.reason);
  assert.equal(e.provider, `plugin:${K}@1#${b.sha256.slice(0, 8)}`);
  assert.ok(e.provider.length <= 32, "fits the saved log's provider field");
  assert.deepEqual(e.orders, scripted.orders);
  assert.deepEqual(cs(sv).intents[K], cs(sv0).intents[K]);
  // the provider id survives a save round trip
  assert.equal(cleanCouncil(JSON.parse(JSON.stringify(cs(sv)))).log.at(-1)!.provider, e.provider);
  // a full sha256 pin works too
  pin({ [K]: b.sha256 });
  assert.equal((await sit(sv, 1)).status, "led");
});

test("default plug-ins: every clan's bundle answers exactly as its source on war-sim briefings (a version 1 plug-in: the scripted council)", async () => {
  const dirs = fs.readdirSync(path.join(__dirname, "../shared/clans"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  assert.deepEqual(dirs, [...CLAN_KEYS].sort(), "one folder per clan");
  _resetClanPlugins();
  for (const k of CLAN_KEYS) {
    const code = (await clanBundle(k))!.code, fx = gateFixtures(k, 40), src = (await import(`../shared/clans/${k}/index`)).plugin as ClanPlugin;
    const res = sandboxRun(code, fx.map((f) => JSON.stringify(f.b)), { callMs: CLAN_PLUGIN.callMs, loadMs: CLAN_PLUGIN.callMs, maxOut: CLAN_PLUGIN.maxOut });
    res.forEach((r, i) => {
      assert.ok(r.ok, `${k} #${i}: ${!r.ok && r.error}`);
      // (a clan that rewrote its council, like the Hide-Kin's v2 of 2026-11-19, answers as its own source; the others as the script)
      assert.equal(r.out, JSON.stringify(src.version === "1" ? scriptedCouncil(fx[i].b) : src.council(fx[i].b)), `${k} #${i}`);
    });
  }
});

test("failures fall back to the doctrine: hang, throw, wrong clan, wrong API, reserved point, forge order, oversized, illegal", async () => {
  const legal = targetsOf(newWar(), K).filter((t) => !TERRITORIES[t].capitalOf)[0];
  const cases: [string, string, RegExp][] = [
    ["hang", bundle("(b) => { for (;;) {} }"), /timeout/],
    ["throw", bundle("(b) => { throw new Error('the seer is drunk'); }"), /threw: Error: the seer is drunk/],
    ["wrong clan declared", bundle("(b) => ({ targets: [] })", `api: 1, clan: "host", version: "t1"`), /clan: the plug-in is for "host"/],
    ["wrong clan ordered", bundle(`(b) => ({ clan: "host", targets: [${legal}] })`), /illegal orders: clan/],
    ["api 2", bundle("(b) => ({ targets: [] })", `api: 2, clan: "${K}", version: "t1"`), /api/],
    ["reserved point", bundle("(b) => ({ targets: [] })", `api: 1, clan: "${K}", version: "t1", herald: (x) => x`), /reserved points .*herald/],
    ["forge order", bundle(`(b) => ({ targets: [${legal}], forge: { kind: "weapon" } })`), /forge: a plug-in may not commission/],
    ["oversized", bundle(`(b) => ({ targets: [${legal}], rationale: "x".repeat(${CLAN_PLUGIN.maxOut}) })`), /answer too large/],
    ["illegal target", bundle(`(b) => ({ targets: [${TERRITORIES.find((t) => t.capitalOf && t.capitalOf !== K)!.id}] })`), /illegal orders: .*capital/],
    ["async", bundle("async (b) => ({ targets: [] })"), /illegal orders: targets/],
    ["no plugin", "var __clan = {};", /no plugin object/],
    ["syntax", "var __clan = {", /does not compile/],
  ];
  for (const [name, code, re] of cases) {
    const sv = fresh();
    usePlugin();
    _setClanBundle(K, code);
    pin({ [K]: sha(code).slice(0, 16) });
    const e = await sit(sv, 0);
    assert.equal(e.status, "fallback", name);
    assert.match(e.reason!, re, `${name}: ${e.reason}`);
    assert.deepEqual(leadIntents(cs(sv), sv.state.tick), {}, `${name}: the doctrine leads`);
  }
});

test("a worker that runs out of memory is a failure, not a crash", async () => {
  const sv = fresh();
  usePlugin();
  const code = bundle("(b) => { const a = []; for (;;) a.push(new Array(1e5).fill(1.5)); }");
  _setClanBundle(K, code);
  pin({ [K]: sha(code).slice(0, 16) });
  const e = await sit(sv, 0);
  assert.equal(e.status, "fallback");
  assert.match(e.reason!, /plug-in failed: (timeout|the worker)/);
});

test("auto switch-off after 3 failures in a row; an admin re-enables it", async () => {
  const sv = fresh();
  usePlugin();
  const code = bundle("(b) => { throw new Error('no'); }");
  _setClanBundle(K, code);
  pin({ [K]: sha(code).slice(0, 16) });
  const r1 = await sit(sv, 0), r2 = await sit(sv, 1), r3 = await sit(sv, 2), r4 = await sit(sv, 3);
  assert.match(r1.reason!, /plug-in failed/);
  assert.match(r2.reason!, /plug-in failed/);
  assert.match(r3.reason!, new RegExp(`switched off after ${CLAN_PLUGIN.failLimit} failures in a row`));
  assert.match(r4.reason!, /switched off after 3 failures in a row \(admin/);
  assert.equal(((await clanPluginsAdmin()).clans[K] as { disabled: boolean }).disabled, true);
  // the digest of the day says so
  await sit(sv, 4);
  assert.ok(cs(sv).digests.some((d) => /switched off/.test(d.text)));
  // fixed and re-enabled: it runs again, and a success clears the count
  const good = bundle("(b) => ({ targets: [] , stance: 'defend' })");
  _setClanBundle(K, good);
  pin({ [K]: sha(good).slice(0, 16) });
  enableClanPlugin(K);
  assert.equal((await sit(sv, 5)).status, "led");
  assert.equal(((await clanPluginsAdmin()).clans[K] as { failsInARow: number }).failsInARow, 0);
});

test("kill switch from the env: pinned plug-ins never run", async () => {
  const sv = fresh();
  usePlugin();
  const b = (await clanBundle(K))!;
  pin({ [K]: b.sha256.slice(0, 16) }, { CLAN_PLUGINS_KILL: "1" });
  assert.ok(clanPluginsKilled());
  const e = await sit(sv, 0);
  assert.equal(e.status, "fallback");
  assert.match(e.reason!, /killed/);
});

test("admin: wrong or no key 404; GET shows pins and hashes; POST kills, revives and re-enables", async () => {
  const KEY = "admin-key-for-tests";
  fresh();
  const b = (await clanBundle(K))!;
  pin({ [K]: b.sha256.slice(0, 16) });
  const app = express();
  mountClanPluginAdmin(app, (req) => req.query.key === KEY);
  const srv = app.listen(0);
  await new Promise((r) => srv.once("listening", r));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/admin/clan-plugins`;
  try {
    assert.equal((await fetch(base)).status, 404);
    assert.equal((await fetch(`${base}?key=wrong`)).status, 404);
    assert.equal((await fetch(`${base}?key=wrong&kill=1`, { method: "POST" })).status, 404);
    assert.equal(clanPluginsKilled(), false, "a wrong key changes nothing");
    const g = await (await fetch(`${base}?key=${KEY}`)).json() as { clans: Record<string, { pin: string; sha8: string; live: boolean }> };
    assert.equal(g.clans[K].pin, b.sha256.slice(0, 16));
    assert.equal(g.clans[K].sha8, b.sha256.slice(0, 8));
    assert.equal(g.clans[K].live, true);
    const k1 = await (await fetch(`${base}?key=${KEY}&kill=1`, { method: "POST" })).json() as { killed: boolean };
    assert.equal(k1.killed, true);
    assert.ok(clanPluginsKilled());
    const sv = saved(); _resetWar(sv); usePlugin();
    assert.match((await sit(sv, 0)).reason!, /killed/);
    await fetch(`${base}?key=${KEY}&kill=0&enable=all`, { method: "POST" });
    assert.equal(clanPluginsKilled(), false);
    assert.equal((await sit(sv, 1)).status, "led");
  } finally { srv.close(); killClanPlugins(false); }
});

test("sandbox: no process, require, Function, eval, Date, Intl, timers or globalThis; no string codegen; seeded random; frozen input", () => {
  const probe = bundle(`(b) => {
    let gen; try { gen = (() => 0).constructor("return 1")(); } catch (e) { gen = "refused"; }
    let mut; try { b.targets.push(1); mut = "changed"; } catch (e) { mut = "frozen"; }
    return { types: [typeof process, typeof require, typeof Function, typeof eval, typeof Date, typeof Intl, typeof setTimeout, typeof globalThis, typeof WebAssembly, typeof Proxy, typeof Reflect, typeof SharedArrayBuffer, typeof queueMicrotask, typeof module, typeof fetch],
      gen, mut, r: [Math.random(), Math.random()] };
  }`);
  const b0 = buildBriefing(newWar(), K, { seed: 5 }, 3), b1 = { ...b0, day: 4 };
  const run = (b: object) => {
    const [r] = sandboxRun(probe, [JSON.stringify(b)], { callMs: 200, loadMs: 200, maxOut: 100_000 });
    assert.ok(r.ok, !r.ok ? r.error : "");
    return JSON.parse((r as { out: string }).out) as { types: string[]; gen: unknown; mut: string; r: number[] };
  };
  const a = run(b0), again = run(b0), other = run(b1);
  assert.ok(a.types.every((t) => t === "undefined"), a.types.join(","));
  assert.equal(a.gen, "refused");
  assert.equal(a.mut, "frozen");
  assert.deepEqual(again.r, a.r, "Math.random is seeded: the same briefing, the same numbers");
  assert.notDeepEqual(other.r, a.r, "another day, other numbers");
  assert.ok(a.r.every((x) => x >= 0 && x < 1));
});

test("sim path: pluginCouncilSync runs the same sandbox and checks", async () => {
  _resetClanPlugins();
  const s = newWar(), b = buildBriefing(s, K, { seed: 2 }), code = (await clanBundle(K))!.code;
  const ok = pluginCouncilSync(code, b, () => []);
  assert.ok("raw" in ok);
  assert.deepEqual(ok.raw, JSON.parse(JSON.stringify(scriptedCouncil(b))));
  const bad = pluginCouncilSync(bundle("(b) => ({ targets: [], forge: {} })"), b, () => []);
  assert.ok("error" in bad && /forge/.test(bad.error));
});

test("gate: the default plug-in passes; illegal answers fail it", async () => {
  _resetClanPlugins();
  const code = (await clanBundle(K))!.code;
  const ok = await gateCode(K, code, 30);
  assert.ok(ok.ok, ok.problems.join("; "));
  assert.equal(ok.n, 30);
  const capital = TERRITORIES.find((t) => t.capitalOf && t.capitalOf !== K)!.id;
  const bad = await gateCode(K, bundle(`(b) => b.day % 2 ? ({ targets: [${capital}] }) : ({ targets: [] })`), 30);
  assert.equal(bad.ok, false);
  assert.ok(bad.problems.length >= 10 && bad.problems.every((p) => /capital/.test(p)), bad.problems.slice(0, 3).join("; "));
  const slow = await gateCode(K, bundle("(b) => { for (;;) {} }"), 3);
  assert.equal(slow.ok, false);
});

test("the war's council day still advances with a failing plug-in (one session a day)", async () => {
  const sv = fresh();
  usePlugin();
  await sit(sv, 0);
  assert.equal(cs(sv).held[K], warDay(sv.state.tick + 1));
  assert.ok(warState());
});
