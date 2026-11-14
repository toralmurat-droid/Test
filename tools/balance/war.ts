/**
 * War sim: plays the clan war (shared/war/) headless with the scripted leaders, no players, and checks the design goal
 * (Murat 2026-11-13): left alone, the clans mostly cancel each other out; a clever plan wins some land but can't take over.
 * Run: npx tsx tools/balance/war.ts [runs=200] [days=30] [--clever=host] [--seed=1] [--verbose]
 *
 * Reports per clan the average and worst share of the land, how often any clan held more than WAR.leaderShare for over
 * three war days in a row (after a 7-day settling period), how many territories change hands per day, and the
 * clever clan's gain over its fair share when --clever is set. Exit code 1 if the stalemate goal fails.
 */
import { CLAN_KEYS, type ClanKey } from "../../shared/war/clans";
import { newMinds, scriptedOrders } from "../../shared/war/doctrine";
import { landOf, newWar, WAR, warTick } from "../../shared/war/rules";
import { TERRITORIES } from "../../shared/war/territories";

const args = process.argv.slice(2);
const num = (i: number, d: number) => (args[i] && !args[i].startsWith("--") ? Number(args[i]) : d);
const RUNS = num(0, 200), DAYS = num(1, 30);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}`))?.split("=")[1];
const CLEVER = flag("clever") as ClanKey | undefined;
if (CLEVER && !CLAN_KEYS.includes(CLEVER)) { console.error(`--clever must be one of: ${CLAN_KEYS.join(", ")}`); process.exit(2); }
const SEED = Number(flag("seed") ?? 1), VERBOSE = args.includes("--verbose");
const SETTLE_DAYS = 7, STREAK_DAYS = 3;

function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const N = TERRITORIES.length;
interface Result { avg: Record<ClanKey, number>; worst: Record<ClanKey, number>; dominated: number; flips: number }

/** Plays RUNS wars of DAYS days (same seeds for every call, so a run with and without the ruse can be compared). */
function play(clever?: ClanKey): Result {
  const avg = Object.fromEntries(CLAN_KEYS.map((k) => [k, 0])) as Record<ClanKey, number>;
  const worst = Object.fromEntries(CLAN_KEYS.map((k) => [k, 0])) as Record<ClanKey, number>;
  let samples = 0, dominatedRuns = 0, flips = 0;
  for (let r = 0; r < RUNS; r++) {
    const rnd = mulberry(SEED * 7919 + r), s = newWar(), minds = newMinds();
    let streak = 0, dominated = false, prev = s.owner.slice();
    for (let d = 0; d < DAYS; d++) {
      for (let i = 0; i < WAR.ticksPerDay; i++) {
        warTick(s, scriptedOrders(s, minds, rnd, clever));
        for (let j = 0; j < N; j++) if (s.owner[j] !== prev[j]) flips++;
        prev = s.owner.slice();
      }
      if (d < SETTLE_DAYS) continue;
      const top = Math.max(...CLAN_KEYS.map((k) => landOf(s, k))) / N;
      streak = top > WAR.leaderShare ? streak + 1 : 0;
      if (streak > STREAK_DAYS) dominated = true;
      for (const k of CLAN_KEYS) { const sh = landOf(s, k) / N; avg[k] += sh; worst[k] = Math.max(worst[k], sh); }
      samples++;
    }
    if (dominated) dominatedRuns++;
    if (VERBOSE) console.log(`run ${r}${clever ? ` (${clever} ruse)` : ""}: ${CLAN_KEYS.map((k) => `${k} ${landOf(s, k)}`).join(", ")}${dominated ? "  DOMINATED" : ""}`);
  }
  for (const k of CLAN_KEYS) avg[k] /= Math.max(1, samples);
  return { avg, worst, dominated: dominatedRuns / RUNS, flips: flips / (RUNS * DAYS) };
}

const t0 = Date.now();
const base = play(), ruse = CLEVER ? play(CLEVER) : undefined;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`War sim: ${RUNS} runs x ${DAYS} war days, ${N} territories, scripted leaders, no players (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
console.log("clan       avg land   most land (any day after settling)");
for (const k of CLAN_KEYS) console.log(`${k.padEnd(10)} ${pct(base.avg[k]).padStart(7)}   ${pct(base.worst[k]).padStart(7)}`);
console.log(`territories changing hands: ${base.flips.toFixed(2)} per war day`);
console.log(`runs where one clan held > ${pct(WAR.leaderShare)} for over ${STREAK_DAYS} days in a row: ${pct(base.dominated)} (goal: under 5%)`);
if (ruse && CLEVER) {
  console.log(`with the ${CLEVER} ruse (feint by day, push at night): ${CLEVER} averages ${pct(ruse.avg[CLEVER])} of the land vs ${pct(base.avg[CLEVER])} without; domination ${pct(ruse.dominated)}`);
  console.log(`  goal: the ruse pays (more land) but no clan dominates (under 5%)`);
}
const fail = base.dominated >= 0.05 || (ruse && ruse.dominated >= 0.05);
if (fail) { console.log("GOAL FAILED: the war does not hold itself in check"); process.exitCode = 1; }
