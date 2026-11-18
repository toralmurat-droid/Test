// clans:verify (tools/clans/verify.ts, Living Code M6 part 2): the sim gate as pure functions (dominated wars by the
// CLAN_PLUGIN thresholds, the plug-in clan's land gain over the baseline), the PR block; and the bundler's fence on
// helper files (tools/clans/build.mjs): a clan file reaches only ../api and .ts files in its own folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CLAN_PLUGIN } from "../shared/clans/api";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { dominatedWars, simGate, verifyOk, verifyReport, type SimSummary, type VerifyResult } from "../tools/clans/verify";
import { gateCode } from "../tools/clans/gate";

const P = CLAN_PLUGIN;
const even = () => CLAN_KEYS.map(() => 0.2);
/** One war of `days` war days: every clan at 20%, but clan 0 at `hi` on the days in `on`. */
const war = (days: number, on: number[] = [], hi = P.domShare + 0.01) => Array.from({ length: days }, (_, d) => { const r = even(); if (on.includes(d)) r[0] = hi; return r; });
const of = (v: number) => Object.fromEntries(CLAN_KEYS.map((k) => [k, v])) as Record<ClanKey, number>;
const sim = (daily: number[][][], avg = of(0.2), calls = 100): SimSummary => ({ runs: daily.length, days: 30, avg, peak: of(0.25), flips: 2.9, pluginCalls: calls, pluginFails: 0, daily });

test("the sim gate's thresholds are CLAN_PLUGIN constants (Murat's brief: 30%, more than 3 days, 5% of wars, +3 points)", () => {
  assert.equal(P.domShare, 0.3);
  assert.equal(P.domDays, 3);
  assert.equal(P.domWars, 0.05);
  assert.equal(P.landGainMax, 0.03);
  assert.ok(P.verifyWars >= 50 && P.verifyDays >= 30);
});

test("dominated wars: one clan over the share for more than domDays days in a row", () => {
  assert.equal(dominatedWars([war(23, [1, 2, 3])]), 0, "3 days in a row is not more than 3");
  assert.equal(dominatedWars([war(23, [1, 2, 3, 4])]), 1, "4 days in a row is");
  assert.equal(dominatedWars([war(23, [1, 2, 4, 5, 7, 8])]), 0, "broken streaks do not add up");
  assert.equal(dominatedWars([war(23, [1, 2, 3, 4], P.domShare)]), 0, "exactly the share is not over it");
  // two clans taking turns above the share: one clan's streak counts, not "some clan"
  const turns = war(23).map((r, d) => { if (d < 4) r[d % 2] = 0.31; return r; });
  assert.equal(dominatedWars([turns]), 0);
  assert.equal(dominatedWars([war(23, [0, 1, 2, 3]), war(23), war(23), war(23)]), 0.25);
  assert.equal(dominatedWars([]), 0);
});

test("sim gate: passes a quiet plug-in; fails on 5% dominated wars, on more than +3 points, on a plug-in that never ran", () => {
  const quiet = Array.from({ length: 20 }, () => war(23));
  assert.deepEqual(simGate("wardens", sim(quiet), sim(quiet)).problems, []);
  // 1 of 20 wars dominated = 5%: fails (5% or more); 1 of 21 (4.8%) passes
  const one = [war(23, [5, 6, 7, 8]), ...quiet.slice(1)];
  const g = simGate("wardens", sim(quiet), sim(one));
  assert.equal(g.ok, false);
  assert.equal(g.after, 0.05);
  assert.match(g.problems[0], /dominated wars 5\.0%/);
  assert.equal(simGate("wardens", sim([...quiet, war(23)]), sim([...one, war(23)])).ok, true);
  // the baseline's own domination does not fail the plug-in
  assert.equal(simGate("wardens", sim(one), sim(quiet)).ok, true);
  // land: +3 points passes, +3.1 fails; other clans' gains do not count
  const avg = (w: number) => ({ ...of(0.2), wardens: w });
  assert.equal(simGate("wardens", sim(quiet), sim(quiet, avg(0.23))).ok, true);
  const land = simGate("wardens", sim(quiet), sim(quiet, avg(0.231)));
  assert.equal(land.ok, false);
  assert.match(land.problems[0], /wardens averages 23\.1% of the land, 3\.1 points over the baseline/);
  assert.equal(simGate("host", sim(quiet), sim(quiet, avg(0.3))).ok, true);
  assert.match(simGate("wardens", sim(quiet), sim(quiet, of(0.2), 0)).problems.join(), /never ran/);
  assert.match(simGate("wardens", sim(quiet), { ...sim(quiet), pluginFails: 1 }).problems.join(), /failed 1 of 100/);
});

test("the PR block names clan, version, full sha256 and sha16, every step, and the sim before/after", () => {
  const quiet = Array.from({ length: 20 }, () => war(23));
  const before = sim(quiet), after = sim(quiet, { ...of(0.2), wardens: 0.215 });
  const r: VerifyResult = { clan: "wardens", version: "2", sha256: "ab".repeat(32), check: [], gate: { ok: true, clan: "wardens", n: 200, problems: [] },
    sim: { before, after, verdict: simGate("wardens", before, after) }, seconds: 95 };
  assert.ok(verifyOk(r));
  const md = verifyReport(r);
  for (const s of ["wardens@2: PASSED", "The Hearthbound Wardens", "`" + "ab".repeat(32) + "`", "| sha16 | `" + "ab".repeat(8) + "` |",
    "| Static check | ok |", "| Sandbox gate | ok, 200 briefings", "| Sim gate | ok |", "| **wardens** | 20.0% | 21.5% | +1.5 |", "| redfang |",
    "Dominated wars", "Flips per war day | 2.90 | 2.90", "Plug-in calls / failed | n/a | 100 / 0", "CLAN_PLUGINS"]) assert.ok(md.includes(s), `${s}\n${md}`);
  const bad: VerifyResult = { ...r, check: ["wardens/index.ts:3: Date: not allowed in a plug-in"], sim: undefined, simError: "the check or the gate failed" };
  assert.equal(verifyOk(bad), false);
  const m2 = verifyReport(bad);
  assert.ok(m2.includes("FAILED") && m2.includes("- wardens/index.ts:3: Date") && m2.includes("| Sim gate | not run (the check or the gate failed) |"), m2);
});

type Build = { bundleClan(c: string, dir?: string): Promise<{ code: string; sha256: string }>; fenced(importer: string, target: string, dir?: string): string | undefined };
const build = async () => { const src = "../tools/clans/build.mjs"; return (await import(src)) as Build; };
const ROOT = path.resolve(__dirname, "..");

test("bundler fence: a clan file reaches ../api and .ts files in its own folder only", async () => {
  const { fenced } = await build(), D = path.join(ROOT, "shared/clans"), w = (f: string) => path.join(D, "wardens", f);
  assert.equal(fenced(w("index.ts"), path.join(D, "api.ts")), undefined);
  assert.equal(fenced(w("index.ts"), w("tactics.ts")), undefined);
  assert.equal(fenced(path.join(D, "api.ts"), path.join(ROOT, "shared/war/councilScript.ts")), undefined, "the kit is free");
  assert.match(fenced(w("index.ts"), path.join(D, "host/index.ts"))!, /may import only/);
  assert.match(fenced(w("index.ts"), path.join(ROOT, "shared/war/rules.ts"))!, /may import only/);
  assert.match(fenced(w("index.ts"), w("notes.js"))!, /may import only/);
  assert.match(fenced(w("index.ts"), w("x.d.ts"))!, /may import only/);
});

test("a plug-in with a helper file bundles and passes the gate; one reaching outside its folder does not build", async () => {
  const { bundleClan } = await build();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clan-helper-"));
  try {
    fs.writeFileSync(path.join(dir, "api.ts"), `export * from ${JSON.stringify(path.join(ROOT, "shared/clans/api"))};\n`);
    fs.mkdirSync(path.join(dir, "wardens"));
    fs.writeFileSync(path.join(dir, "wardens", "pick.ts"), `import type { CouncilBriefing } from "../api";\nexport const firstTwo = (b: CouncilBriefing, t: number[]) => t.slice(0, 2);\n`);
    fs.writeFileSync(path.join(dir, "wardens", "index.ts"), `import { CLAN_PLUGIN_API, kit, type ClanPlugin } from "../api";\nimport { firstTwo } from "./pick";\n` +
      `export const plugin: ClanPlugin = { api: CLAN_PLUGIN_API, clan: "wardens", version: "h1", council: (b) => { const o = kit.scriptedCouncil(b); return { ...o, targets: firstTwo(b, o.targets) }; } };\n`);
    const b = await bundleClan("wardens", dir);
    assert.ok(b.code.includes("plugin") && b.sha256.length === 64);
    const g = await gateCode("wardens", b.code, 20);
    assert.ok(g.ok, g.problems.join("; "));
    // a helper reaching into the war rules (absolute path, so it resolves): refused by the bundler
    fs.writeFileSync(path.join(dir, "wardens", "pick.ts"), `import { WAR } from ${JSON.stringify(path.join(ROOT, "shared/war/rules"))};\nexport const firstTwo = (b: unknown, t: number[]) => t.slice(0, WAR.leaderShare > 0 ? 2 : 1);\n`);
    await assert.rejects(bundleClan("wardens", dir), /may import only shared\/clans\/api\.ts/);
    // another clan's folder: refused too
    fs.mkdirSync(path.join(dir, "host"));
    fs.writeFileSync(path.join(dir, "host", "x.ts"), `export const firstTwo = (b: unknown, t: number[]) => t;\n`);
    fs.writeFileSync(path.join(dir, "wardens", "pick.ts"), `export { firstTwo } from "../host/x";\n`);
    await assert.rejects(bundleClan("wardens", dir), /may import only/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
