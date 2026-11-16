/**
 * War sim: plays the clan war (shared/war/) headless with the scripted leaders, no players, and checks the design goal
 * (Murat 2026-11-13): left alone, the clans mostly cancel each other out; a clever plan wins some land but can't take over.
 * Run: npx tsx tools/balance/war.ts [runs=200] [days=30] [--clever=host] [--zeal=redfang[:30]] [--sack=redfang[:6]] [--sack-fort=0.1] [--tiers] [--ambush=hidekin[:0.5]] [--clash] [--per-soldier=30] [--old-brakes] [--seed=1] [--verbose]
 *
 * Marching columns (W4, shared/war/marches.ts): every run prints the histogram of column sizes (men, officer included)
 * so COLUMN.perSoldier can be tuned (`--per-soldier=<n>` tries another value). `--ambush=<clan|all>[:share]`: each tick
 * that clan's heroes (or every clan's) cut `share` (default 0.5) of every enemy column marching on its lands, which
 * scales those attacks by marchMult (rules.ts TickExtra.march). `--clash` (a what-if: the live war charges no men for
 * a meeting nobody fights, only a live clash's real deaths count): columns of clans at war on one road in opposite
 * directions meet and lose clashLosses. Both report only, like zeal.
 *
 * `--tiers` (W3, diagnostic): the share of Holds at each tier (holdTiers.ts: outpost, camp, fortress) per clan after
 * settling, the average tier and the share of front-line lands that are outposts. `--sack-fort=<x>` sets WAR.sackFort
 * for the run (what a sack takes off a land's fort).
 *
 * `--zeal=<clan|all>[:valor]`: sworn heroes push for that clan (or for every clan alike) with this much valor a tick at
 * its main target, to see the brakes (Night Raiders, Rally) hold a clan its players carry. The design goal is checked
 * without players; a zeal run only reports.
 *
 * `--sack=<clan|all>[:perDay]`: that clan's heroes (or every clan's alike) sack perDay Holds a war day (W2b, spread
 * evenly over the day) at its main target when the war lets it attack there and no siege is announced: rules.ts sackHold
 * (Control, maybe a siege) and HOLD_SACK.sackValor valor that tick, as the live game does. Reports only, like zeal.
 *
 * Reports per clan the average and worst share of the land, how often any clan held more than WAR.leaderShare for over
 * three war days in a row (after a 7-day settling period), how many territories change hands per day, and the
 * clever clan's gain over its fair share when --clever is set, how often the Night Raiders hunted and whom the war
 * rallied for. Exit code 1 if the stalemate goal fails.
 */
import { CLAN_KEYS, type ClanKey } from "../../shared/war/clans";
import { newMinds, scriptedOrders } from "../../shared/war/doctrine";
import { HOLD_TIER, holdTier } from "../../shared/war/holdTiers";
import { setWarRelations } from "../../shared/war/feuds";
import { atWar } from "../../shared/war/feuds";
import { clashLosses, COLUMN, marchesOf, marchMult, plansOf } from "../../shared/war/marches";
import { tunnelStrikes } from "../../shared/war/tunnels";
import { deployments, landOf, newWar, nightRaid, phaseOf, rallyClan, sackHold, targetsOf, WAR, warTick, type TickExtra } from "../../shared/war/rules";
import { HOLD_SACK } from "../../shared/war/holdSack";
import { TERRITORIES } from "../../shared/war/territories";

const args = process.argv.slice(2);
const num = (i: number, d: number) => (args[i] && !args[i].startsWith("--") ? Number(args[i]) : d);
const RUNS = num(0, 200), DAYS = num(1, 30);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}`))?.split("=")[1];
const CLEVER = flag("clever") as ClanKey | undefined;
if (CLEVER && !CLAN_KEYS.includes(CLEVER)) { console.error(`--clever must be one of: ${CLAN_KEYS.join(", ")}`); process.exit(2); }
const SEED = Number(flag("seed") ?? 1), VERBOSE = args.includes("--verbose");
const [zealWho, zealV] = (flag("zeal") ?? "").split(":");
const ZEAL: ClanKey[] = zealWho === "all" ? [...CLAN_KEYS] : CLAN_KEYS.includes(zealWho as ClanKey) ? [zealWho as ClanKey] : [];
if (zealWho && !ZEAL.length) { console.error(`--zeal must be all or one of: ${CLAN_KEYS.join(", ")}`); process.exit(2); }
const ZEAL_V = Number(zealV || 30);
const [sackWho, sackN] = (flag("sack") ?? "").split(":");
const SACK: ClanKey[] = sackWho === "all" ? [...CLAN_KEYS] : CLAN_KEYS.includes(sackWho as ClanKey) ? [sackWho as ClanKey] : [];
if (sackWho && !SACK.length) { console.error(`--sack must be all or one of: ${CLAN_KEYS.join(", ")}`); process.exit(2); }
const SACK_PER_DAY = Number(sackN || 6);
// --old-brakes: the brakes as they were before the Raiders' hunt and the Rally (2026-11-15): the Raiders only bled a clan
// over WAR.leaderShare, no strikes on its lands, no Rally on valor. For before/after comparisons.
if (args.includes("--old-brakes")) Object.assign(WAR, { huntShare: 2, huntLands: 0, rallyValor: 1 });
const TIERS = args.includes("--tiers");
const [ambushWho, ambushS] = (flag("ambush") ?? "").split(":");
const AMBUSH: ClanKey[] = ambushWho === "all" ? [...CLAN_KEYS] : CLAN_KEYS.includes(ambushWho as ClanKey) ? [ambushWho as ClanKey] : [];
if (ambushWho && !AMBUSH.length) { console.error(`--ambush must be all or one of: ${CLAN_KEYS.join(", ")}`); process.exit(2); }
const AMBUSH_SHARE = Number(ambushS || 0.5), CLASH = args.includes("--clash");
if (flag("per-soldier") !== undefined) COLUMN.perSoldier = Number(flag("per-soldier"));
if (flag("sack-fort") !== undefined) WAR.sackFort = Number(flag("sack-fort"));
if (flag("camp-fort") !== undefined) HOLD_TIER.camp.fort = Number(flag("camp-fort")); // (--tiers: try another camp threshold)
const SETTLE_DAYS = 7, STREAK_DAYS = 3;

function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const N = TERRITORIES.length;
interface Result {
  avg: Record<ClanKey, number>; worst: Record<ClanKey, number>; dominated: number; flips: number;
  /** Share of night ticks the Night Raiders rode against a clan; share of all ticks the war rallied for each clan. */
  hunts: number; hunted: Record<ClanKey, number>; rally: Record<ClanKey, number>;
  /** Sacks per war day that landed (legal target, no siege), and the sieges they called. */
  sacks: number; sackSieges: number;
  /** --tiers: per clan the share of its Holds at each tier (sampled daily after settling); front lands that are outposts. */
  tiers: Record<ClanKey, [number, number, number]>; frontOutpost: number; front: [number, number, number];
  /** Marching columns (W4): men per column (index = size), columns cut down by an ambush, meetings and men lost there, per war day. */
  sizes: number[]; ambushed: number; clashes: number; clashDead: number;
}

/** Plays RUNS wars of DAYS days (same seeds for every call, so a run with and without the ruse can be compared). */
function play(clever?: ClanKey): Result {
  const avg = Object.fromEntries(CLAN_KEYS.map((k) => [k, 0])) as Record<ClanKey, number>;
  const worst = Object.fromEntries(CLAN_KEYS.map((k) => [k, 0])) as Record<ClanKey, number>;
  const hunted = Object.fromEntries(CLAN_KEYS.map((k) => [k, 0])) as Record<ClanKey, number>;
  const rally = Object.fromEntries(CLAN_KEYS.map((k) => [k, 0])) as Record<ClanKey, number>;
  const tiers = Object.fromEntries(CLAN_KEYS.map((k) => [k, [0, 0, 0]])) as Record<ClanKey, [number, number, number]>;
  let front = 0, frontOut = 0;
  const frontTiers: [number, number, number] = [0, 0, 0];
  let samples = 0, dominatedRuns = 0, flips = 0, nights = 0, hunts = 0, ticks = 0, sacks = 0, sackSieges = 0, ambushed = 0, clashes = 0, clashDead = 0;
  const sizes = Array<number>(COLUMN.max + 2).fill(0);
  for (let r = 0; r < RUNS; r++) {
    const rnd = mulberry(SEED * 7919 + r), s = newWar(), minds = newMinds();
    let streak = 0, dominated = false, prev = s.owner.slice();
    for (let d = 0; d < DAYS; d++) {
      for (let i = 0; i < WAR.ticksPerDay; i++) {
        const orders = scriptedOrders(s, minds, rnd, clever), extra: TickExtra = {};
        if (ZEAL.length) {
          extra.valor = TERRITORIES.map(() => ({}));
          for (const k of ZEAL) { const t = orders[k].attack[0]?.t; if (t !== undefined) extra.valor[t][k] = ZEAL_V; }
        }
        const due = SACK.length ? Math.floor(((i + 1) * SACK_PER_DAY) / WAR.ticksPerDay) - Math.floor((i * SACK_PER_DAY) / WAR.ticksPerDay) : 0;
        for (let n = 0; n < due; n++) for (const k of SACK) { // heroes sack the Hold of the clan's main target
          const t = orders[k].attack[0]?.t;
          if (t === undefined || !targetsOf(s, k).includes(t)) continue;
          const r = sackHold(s, t, k, false);
          if (!r) continue;
          sacks++; if (r.siege) sackSieges++;
          extra.valor ??= TERRITORIES.map(() => ({}));
          extra.valor[t][k] = (extra.valor[t][k] ?? 0) + HOLD_SACK.sackValor;
        }
        // the columns of these orders (W4): sized by the attack each carries; ambushes and meetings cut them down
        const plans = plansOf(s, orders, tunnelStrikes(s, orders), s.tick), ms = marchesOf(plans, deployments(s, orders, phaseOf(s.tick)).attack, s.tick, 0);
        const fallen = new Map<string, number>();
        for (const m of ms) sizes[m.size]++;
        if (CLASH) {
          setWarRelations(s.owner, s.tick, d === 0 && i === 0 ? [] : undefined);
          for (let a = 0; a < ms.length; a++) for (let b = a + 1; b < ms.length; b++) {
            const A = ms[a], B = ms[b];
            if (A.from !== B.to || A.to !== B.from || A.clan === B.clan || !atWar(A.clan, B.clan)) continue;
            const [la, lb] = clashLosses(A.size, B.size, A.force, B.force);
            fallen.set(A.id, (fallen.get(A.id) ?? 0) + la); fallen.set(B.id, (fallen.get(B.id) ?? 0) + lb);
            clashes++; clashDead += la + lb;
          }
        }
        if (AMBUSH.length) for (const m of ms) {
          if (!AMBUSH.includes(s.owner[m.to]) || s.owner[m.to] === m.clan) continue;
          fallen.set(m.id, Math.min(m.size, (fallen.get(m.id) ?? 0) + Math.round(m.size * AMBUSH_SHARE)));
          ambushed++;
        }
        if (fallen.size) extra.march = ms.flatMap((m) => (fallen.get(m.id) ? [{ t: m.to, k: m.clan, mult: marchMult(m.size - Math.min(m.size, fallen.get(m.id)!), m.size) }] : []));
        if (d >= SETTLE_DAYS) {
          ticks++;
          const r = rallyClan(s); if (r) rally[r]++;
          if (phaseOf(s.tick) === 2) { nights++; const h = nightRaid(s, 2); if (h) { hunts++; hunted[h.clan]++; } }
        }
        warTick(s, orders, extra);
        if (TIERS) setWarRelations(s.owner, s.tick, d === 0 && i === 0 ? [] : undefined); // (display only, for the tiers: the clans at war as the live server keeps them)
        for (let j = 0; j < N; j++) if (s.owner[j] !== prev[j]) flips++;
        prev = s.owner.slice();
      }
      if (d < SETTLE_DAYS) continue;
      const top = Math.max(...CLAN_KEYS.map((k) => landOf(s, k))) / N;
      streak = top > WAR.leaderShare ? streak + 1 : 0;
      if (streak > STREAK_DAYS) dominated = true;
      for (const k of CLAN_KEYS) { const sh = landOf(s, k) / N; avg[k] += sh; worst[k] = Math.max(worst[k], sh); }
      samples++;
      if (TIERS) for (const t of TERRITORIES) {
        const tier = holdTier(s, t.id);
        tiers[s.owner[t.id]][tier]++;
        if (t.near.some((n) => s.owner[n] !== s.owner[t.id])) { front++; frontTiers[tier]++; if (tier === 0) frontOut++; }
      }
    }
    if (dominated) dominatedRuns++;
    if (VERBOSE) console.log(`run ${r}${clever ? ` (${clever} ruse)` : ""}: ${CLAN_KEYS.map((k) => `${k} ${landOf(s, k)}`).join(", ")}${dominated ? "  DOMINATED" : ""}`);
  }
  for (const k of CLAN_KEYS) avg[k] /= Math.max(1, samples);
  for (const k of CLAN_KEYS) { hunted[k] /= Math.max(1, nights); rally[k] /= Math.max(1, ticks); }
  return { avg, worst, dominated: dominatedRuns / RUNS, flips: flips / (RUNS * DAYS), hunts: hunts / Math.max(1, nights), hunted, rally, sacks: sacks / (RUNS * DAYS), sackSieges: sackSieges / (RUNS * DAYS), tiers, frontOutpost: frontOut / Math.max(1, front), front: frontTiers,
    sizes, ambushed: ambushed / (RUNS * DAYS), clashes: clashes / (RUNS * DAYS), clashDead: clashDead / (RUNS * DAYS) };
}

const t0 = Date.now();
const base = play(), ruse = CLEVER ? play(CLEVER) : undefined;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const who = [ZEAL.length ? `heroes pushing ${zealWho} (${ZEAL_V} valor a tick)` : "", SACK.length ? `heroes sacking for ${sackWho} (${SACK_PER_DAY} Holds a day each)` : "",
  AMBUSH.length ? `heroes ambushing columns on ${ambushWho}'s lands (${pct(AMBUSH_SHARE)} of each)` : "", CLASH ? "columns clashing on shared roads" : ""].filter(Boolean).join(", ") || "no players";
console.log(`War sim: ${RUNS} runs x ${DAYS} war days, ${N} territories, scripted leaders, ${who} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
console.log("clan       avg land   most land (any day after settling)   hunted (night ticks)   rallied (ticks)");
for (const k of CLAN_KEYS) console.log(`${k.padEnd(10)} ${pct(base.avg[k]).padStart(7)}   ${pct(base.worst[k]).padStart(7)}                              ${pct(base.hunted[k]).padStart(6)}               ${pct(base.rally[k]).padStart(6)}`);
console.log(`Night Raiders rode against a clan on ${pct(base.hunts)} of night ticks`);
console.log(`territories changing hands: ${base.flips.toFixed(2)} per war day`);
if (SACK.length) console.log(`Holds sacked: ${base.sacks.toFixed(2)} per war day, calling ${base.sackSieges.toFixed(2)} sieges`);
console.log(`runs where one clan held > ${pct(WAR.leaderShare)} for over ${STREAK_DAYS} days in a row: ${pct(base.dominated)} (goal: under 5%)`);
{
  const n = base.sizes.reduce((a, b) => a + b, 0) || 1;
  console.log(`column sizes (men, officer included; perSoldier ${COLUMN.perSoldier}): ${base.sizes.map((c, k) => (k >= COLUMN.min + 1 ? `${k}: ${pct(c / n)}` : "")).filter(Boolean).join("  ")}  (${(n / (RUNS * DAYS)).toFixed(1)} columns a war day)`);
}
if (AMBUSH.length) console.log(`columns ambushed: ${base.ambushed.toFixed(1)} per war day (each cut to ${pct(1 - AMBUSH_SHARE)} of its men, attack x${marchMult(Math.round(8 * (1 - AMBUSH_SHARE)), 8).toFixed(2)} for a full column; floor ${COLUMN.floor})`);
if (CLASH) console.log(`column meetings: ${base.clashes.toFixed(2)} per war day, ${base.clashDead.toFixed(2)} men lost per war day`);
if (SACK.length || flag("sack-fort") !== undefined) console.log(`a sack takes ${WAR.sackFort} off the land's fort (WAR.sackFort)`);
if (TIERS) {
  console.log("Hold tiers (share of each clan's Holds, daily after settling):  outpost   camp   fortress   avg tier");
  for (const k of CLAN_KEYS) {
    const [a, b, c] = base.tiers[k], n = Math.max(1, a + b + c);
    console.log(`${k.padEnd(10)}${" ".repeat(52)}${pct(a / n).padStart(7)} ${pct(b / n).padStart(6)} ${pct(c / n).padStart(9)}   ${((b + 2 * c) / n).toFixed(2).padStart(7)}`);
  }
  const all = CLAN_KEYS.reduce((a, k) => a.map((x, i) => x + base.tiers[k][i]), [0, 0, 0]), n = Math.max(1, all[0] + all[1] + all[2]), fn = Math.max(1, base.front[0] + base.front[1] + base.front[2]);
  console.log(`all Holds: ${all.map((x) => pct(x / n)).join(" / ")} (outpost / camp / fortress); front-line lands (a neighbour held by another clan): ${base.front.map((x) => pct(x / fn)).join(" / ")}`);
  console.log(`front-line lands that are outposts: ${pct(base.frontOutpost)} (camp threshold: fort ${HOLD_TIER.camp.fort})`);
}
if (ruse && CLEVER) {
  console.log(`with the ${CLEVER} ruse (feint by day, push at night): ${CLEVER} averages ${pct(ruse.avg[CLEVER])} of the land vs ${pct(base.avg[CLEVER])} without; domination ${pct(ruse.dominated)}`);
  console.log(`  goal: the ruse pays (more land) but no clan dominates (under 5%)`);
}
const fail = !ZEAL.length && !SACK.length && !AMBUSH.length && !CLASH && (base.dominated >= 0.05 || (ruse && ruse.dominated >= 0.05));
if (fail) { console.log("GOAL FAILED: the war does not hold itself in check"); process.exitCode = 1; }
