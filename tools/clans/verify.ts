/**
 * One clan plug-in's full check before a PR (Living Code M6 part 2): the static check (check.ts), the sandbox gate
 * (gate.ts), and the war sim twice on the same seeds, `--council=lead` (the baseline: the doctrine's council) and
 * `--plugin=<clan>` (its bundle leads its council), CLAN_PLUGIN.verifyWars wars of verifyDays war days each. Prints a
 * Markdown block for the PR body (the clan code routine pastes it: docs/living-code-routine.md) and exits 1 when any
 * step fails. The sim gate (simGate, pure; thresholds in shared/clans/api.ts CLAN_PLUGIN): a clan over domShare of the
 * land for more than domDays war days in a row in domWars or more of the plug-in's wars, or the plug-in clan's average
 * land more than landGainMax above the baseline. Passing it is not an OK to run live: only Murat's hash pin is.
 * Run: npm run clans:verify -- <clan> [--wars=60] [--days=30] [--out=<file>]   (the block also goes to <file>)
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CLAN_PLUGIN } from "../../shared/clans/api";
import { CLAN_KEYS, CLANS, type ClanKey } from "../../shared/war/clans";
import { checkClan } from "./check";
import { gateClan, type GateResult } from "./gate";

/** What verify reads back from one war-sim run (tools/balance/war.ts --json). */
export interface SimSummary {
  runs: number; days: number;
  /** Each clan's average land share after settling, and its highest on any day. */
  avg: Record<ClanKey, number>; peak: Record<ClanKey, number>;
  /** Territories changing hands per war day; plug-in calls and the failed ones (the doctrine led that day). */
  flips: number; pluginCalls: number; pluginFails: number;
  /** Per war, per war day after settling, each clan's land share (CLAN_KEYS order). */
  daily: number[][][];
  seconds?: number;
}

/**
 * Share of wars in which one clan held more than `share` of the land for more than `days` war days in a row. Pure.
 */
export function dominatedWars(daily: number[][][], share: number = CLAN_PLUGIN.domShare, days: number = CLAN_PLUGIN.domDays): number {
  if (!daily.length) return 0;
  let n = 0;
  for (const war of daily) {
    const streak: number[] = [];
    let dom = false;
    for (const day of war) day.forEach((sh, i) => { streak[i] = sh > share ? (streak[i] ?? 0) + 1 : 0; if (streak[i] > days) dom = true; });
    if (dom) n++;
  }
  return n / daily.length;
}

export interface SimVerdict { ok: boolean; before: number; after: number; gain: number; problems: string[] }

/** The sim gate on clan `clan`'s plug-in run `after` against the baseline `before`. Pure. */
export function simGate(clan: ClanKey, before: SimSummary, after: SimSummary): SimVerdict {
  const P = CLAN_PLUGIN, problems: string[] = [];
  const b = dominatedWars(before.daily), a = dominatedWars(after.daily), gain = (after.avg[clan] ?? 0) - (before.avg[clan] ?? 0);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  if (a >= P.domWars) problems.push(`dominated wars ${pct(a)}: a clan held over ${pct(P.domShare)} of the land for more than ${P.domDays} days in a row in ${pct(P.domWars)} or more of the wars`);
  if (gain > P.landGainMax + 1e-9) problems.push(`${clan} averages ${pct(after.avg[clan])} of the land, ${(gain * 100).toFixed(1)} points over the baseline (at most +${(P.landGainMax * 100).toFixed(0)})`);
  if (!after.pluginCalls) problems.push("the plug-in never ran in the sim");
  if (before.runs !== after.runs || before.days !== after.days) problems.push("the two sim runs differ in wars or days");
  return { ok: !problems.length, before: b, after: a, gain, problems };
}

export interface VerifyResult {
  clan: ClanKey; version: string; sha256: string;
  check: string[];
  gate?: GateResult;
  sim?: { before: SimSummary; after: SimSummary; verdict: SimVerdict };
  /** Why the sim did not run (an earlier step failed), or failed to run. */
  simError?: string;
  seconds: number;
}

/** Whether every step passed. */
export const verifyOk = (r: VerifyResult) => !r.check.length && !!r.gate?.ok && !!r.sim?.verdict.ok;

/** The Markdown block for the PR body. Pure. */
export function verifyReport(r: VerifyResult): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`, pts = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}`;
  const P = CLAN_PLUGIN, ok = verifyOk(r), L: string[] = [];
  L.push(`### Clan code verify: ${r.clan}@${r.version}: ${ok ? "PASSED" : "FAILED"}`, "");
  L.push("| | |", "|---|---|");
  L.push(`| Clan | ${CLANS[r.clan].name} (\`${r.clan}\`) |`, `| Version | \`${r.version}\` |`);
  L.push(`| Bundle sha256 | \`${r.sha256 || "n/a (no bundle)"}\` |`, `| sha16 | \`${r.sha256 ? r.sha256.slice(0, 16) : "n/a"}\` |`);
  L.push(`| Static check | ${r.check.length ? `FAILED, ${r.check.length} problem(s)` : "ok"} |`);
  L.push(`| Sandbox gate | ${!r.gate ? "not run" : r.gate.ok ? `ok, ${r.gate.n} briefings, run twice, identical` : `FAILED, ${r.gate.problems.length} problem(s)`} |`);
  L.push(`| Sim gate | ${!r.sim ? `not run${r.simError ? ` (${r.simError})` : ""}` : r.sim.verdict.ok ? "ok" : "FAILED"} |`);
  const probs = [...r.check, ...(r.gate?.problems ?? []), ...(r.sim?.verdict.problems ?? [])];
  if (probs.length) L.push("", "Problems:", ...probs.slice(0, 15).map((p) => `- ${p}`), ...(probs.length > 15 ? [`- ... and ${probs.length - 15} more`] : []));
  if (r.sim) {
    const { before: b, after: a, verdict: v } = r.sim;
    L.push("", `War sim, ${b.runs} wars x ${b.days} war days, same seeds. Before: \`--council=lead\` (the doctrine's council). After: \`--plugin=${r.clan}\`.`, "");
    L.push("| Clan | Avg land before | Avg land after | Change (pts) | Peak before | Peak after |", "|---|---:|---:|---:|---:|---:|");
    for (const k of CLAN_KEYS) {
      const n = k === r.clan ? `**${k}**` : k;
      L.push(`| ${n} | ${pct(b.avg[k])} | ${pct(a.avg[k])} | ${pts(a.avg[k] - b.avg[k])} | ${pct(b.peak[k])} | ${pct(a.peak[k])} |`);
    }
    L.push("", "| | Before | After | Limit |", "|---|---:|---:|---|");
    L.push(`| Dominated wars (a clan over ${pct(P.domShare)} for more than ${P.domDays} days in a row) | ${pct(v.before)} | ${pct(v.after)} | under ${pct(P.domWars)} |`);
    L.push(`| ${r.clan} average land change | | ${pts(v.gain)} pts | at most +${(P.landGainMax * 100).toFixed(0)} pts |`);
    L.push(`| Flips per war day | ${b.flips.toFixed(2)} | ${a.flips.toFixed(2)} | |`);
    L.push(`| Plug-in calls / failed | n/a | ${a.pluginCalls} / ${a.pluginFails} | |`);
  }
  L.push("", `Verified with \`npm run clans:verify -- ${r.clan}\` in ${r.seconds.toFixed(0)} s. Not live: it runs only once Murat pins this bundle's sha256 in \`CLAN_PLUGINS\`.`);
  return L.join("\n");
}

const ROOT = path.resolve(__dirname, "../..");

/** Runs tools/balance/war.ts with `args` in a child process (its own output to stderr) and reads its --json back. */
function warSim(args: string[]): Promise<SimSummary> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clan-verify-")), out = path.join(dir, "sim.json");
  return new Promise<SimSummary>((resolve, reject) => {
    const p = spawn(process.execPath, ["--import", "tsx", path.join(ROOT, "tools/balance/war.ts"), ...args, `--json=${out}`], { cwd: ROOT, stdio: ["ignore", 2, 2] });
    p.on("error", reject);
    p.on("exit", (code) => { // (exit 1 on the sim's own goal check still wrote the numbers: the sim gate judges them)
      try { resolve(JSON.parse(fs.readFileSync(out, "utf8")) as SimSummary); }
      catch { reject(new Error(`war sim ${args.join(" ")} wrote no numbers (exit ${code})`)); }
    });
  }).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}

/** The whole verification of clan `clan`. Never throws for a broken plug-in (the result says what failed). */
export async function verifyClan(clan: ClanKey, wars: number = CLAN_PLUGIN.verifyWars, days: number = CLAN_PLUGIN.verifyDays): Promise<VerifyResult> {
  const t0 = Date.now(), src = "./build.mjs";
  const { bundleClan, bundleMeta } = (await import(src)) as { bundleClan(c: string): Promise<{ code: string; sha256: string }>; bundleMeta(code: string): { version?: unknown } | undefined };
  const r: VerifyResult = { clan, version: "?", sha256: "", check: checkClan(clan), seconds: 0 };
  try {
    const b = await bundleClan(clan), m = bundleMeta(b.code);
    r.sha256 = b.sha256;
    if (typeof m?.version === "string") r.version = m.version;
  } catch { /* the gate reports why the bundle does not build */ }
  r.gate = await gateClan(clan);
  if (r.check.length || !r.gate.ok) r.simError = "the check or the gate failed";
  else {
    try {
      const [before, after] = await Promise.all([warSim([String(wars), String(days), "--council=lead"]), warSim([String(wars), String(days), `--plugin=${clan}`])]);
      r.sim = { before, after, verdict: simGate(clan, before, after) };
    } catch (e) { r.simError = String((e as Error)?.message ?? e).slice(0, 200); }
  }
  r.seconds = (Date.now() - t0) / 1000;
  return r;
}

if (require.main === module) {
  const args = process.argv.slice(2), opt = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
  const clan = args.find((a) => !a.startsWith("--")) as ClanKey | undefined;
  if (!clan || !CLAN_KEYS.includes(clan)) { console.error(`usage: npm run clans:verify -- <clan> [--wars=${CLAN_PLUGIN.verifyWars}] [--days=${CLAN_PLUGIN.verifyDays}] [--out=<file>]   (clan: ${CLAN_KEYS.join(", ")})`); process.exit(2); }
  const wars = Number(opt("wars") ?? CLAN_PLUGIN.verifyWars), days = Number(opt("days") ?? CLAN_PLUGIN.verifyDays);
  if (!(wars >= 1 && days > 7)) { console.error("--wars must be at least 1 and --days more than 7 (the settling days)"); process.exit(2); }
  verifyClan(clan, wars, days).then((r) => {
    const md = verifyReport(r), out = opt("out");
    if (out) fs.writeFileSync(out, md + "\n");
    console.log(`\n${md}`);
    process.exit(verifyOk(r) ? 0 : 1);
  }, (e) => { console.error("clans:verify failed:", e); process.exit(1); });
}
