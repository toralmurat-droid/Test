/**
 * War sim: plays the clan war (shared/war/) headless with the scripted leaders, no players, and checks the design goal
 * (Murat 2026-11-13): left alone, the clans mostly cancel each other out; a clever plan wins some land but can't take over.
 * Run: npx tsx tools/balance/war.ts [runs=200] [days=30] [--clever=host] [--zeal=redfang[:30]] [--sack=redfang[:6]] [--sack-fort=0.1] [--tiers] [--ambush=hidekin[:0.5]] [--clash] [--per-soldier=30] [--battles] [--battle-heroes=redfang[:1.3]] [--old-brakes] [--towns] [--seed=1] [--verbose]
 *
 * Marching columns (W4, shared/war/marches.ts): every run prints the histogram of column sizes (men, officer included)
 * so COLUMN.perSoldier can be tuned (`--per-soldier=<n>` tries another value). `--ambush=<clan|all>[:share]`: each tick
 * that clan's heroes (or every clan's) cut `share` (default 0.5) of every enemy column marching on its lands, which
 * scales those attacks by marchMult (rules.ts TickExtra.march). `--clash` (a what-if: the live war charges no men for
 * a meeting nobody fights, only a live clash's real deaths count): columns of clans at war on one road in opposite
 * directions meet and lose clashLosses. Both report only, like zeal.
 *
 * `--battles` (W5, shared/war/battles.ts): big battles as the live war fights them with no hero near: the pitched battles at
 * their local times (placed by pickPitched 3 ticks ahead), stormings of sieges that come due on a close margin
 * (isDecisive), and up to BATTLE.meetPerDay meeting battles of columns of 6+ men of clans at war on one road in opposite
 * directions (the largest first; their columns then do not clash). At most one a tick and BATTLE.perDay a day. Each is a
 * virtualBattle with men from that tick's deployments, handed to warTick as TickExtra.battle. With battles on by default
 * in the live war, this is the run the no-player goal is judged on too. `--battle-heroes=<clan|all>[:kMult]`: that clan's
 * heroes fight in every battle it is in, multiplying its side's killing rate by kMult (default 1.3; reports only).
 *
 * `--towns` (W6, shared/war/towns.ts): the capturable towns follow their patron lands as the live war has them with no
 * hero near (contested for TOWN.graceTicks, then they submit; nobody claims or holds a gate), and each held town adds
 * WAR.townIncome to its holder's income (rules.ts TickExtra.towns). Judged on the no-player goal like --battles.
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
 * rallied for; for the Crown of the Marches (a `wards` land) also each clan's share of it and how often one clan held over
 * half of it, the snowball to watch there. Exit code 1 if the stalemate goal fails.
 *
 * The Reckoning (Crown PR4, shared/war/crown.ts), on unless `--no-reckoning`: every `--reckon-every=<days>` war days
 * (default 30, a month) the war ticks of 18:00-21:00 (war tick 0 is midnight) score the Crown's land, and the top clan takes
 * the Keep (a tie: the holder keeps it). No players, so no valor unless `--reckon-valor=<clan>:<valor a tick>` adds that
 * clan's heroes fighting in the Crown. Reports who won, how often the holder kept the Keep and how often one clan won
 * twice running (the snowball to watch: with five clans about 20% is chance).
 *
 * `--council=shadow|lead` (War Councils M3, shared/war/council.ts): every clan's scripted council sits once a war day
 * (briefing, scriptedCouncil, validateCouncil). `shadow`: the doctrine still leads, the sim reports how often its main
 * target matched the council's; `lead`: the councils' intents lead (councilOrders). Judged on the no-player goal too.
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
import { BATTLE, battleOutcome, siteForces, isDecisive, meetSite, newBattle, pickMeetings, pickPitched, pitchedTicks, virtualBattle, type BattleSite } from "../../shared/war/battles";
import type { BattleKind, BattleOutcome } from "../../shared/war/rules";
import { TERRITORIES } from "../../shared/war/territories";
import { regionByKey } from "../../shared/war/regions";
import { keepOf, landPoints, RECKONING, reckonWinner, scoresOf, type ReckonTally } from "../../shared/war/crown";
import { TOWNS, townCounts, townPatron, townStep, type TownState } from "../../shared/war/towns";
import { agrees, buildBriefing, councilOrders, intentOf, scriptedCouncil, validateCouncil, type CouncilIntent } from "../../shared/war/council";

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
const BATTLES = args.includes("--battles") || flag("battle-heroes") !== undefined;
const [bhWho, bhK] = (flag("battle-heroes") ?? "").split(":");
const BH: ClanKey[] = bhWho === "all" ? [...CLAN_KEYS] : CLAN_KEYS.includes(bhWho as ClanKey) ? [bhWho as ClanKey] : [];
if (bhWho && !BH.length) { console.error(`--battle-heroes must be all or one of: ${CLAN_KEYS.join(", ")}`); process.exit(2); }
const BH_K = Number(bhK || 1.3);
const TOWNS_ON = args.includes("--towns");
const SETTLE_DAYS = 7, STREAK_DAYS = 3;
const RECKON = !args.includes("--no-reckoning"), RECKON_EVERY = Number(flag("reckon-every") ?? 30);
const [rvWho, rvV] = (flag("reckon-valor") ?? "").split(":");
const RV: ClanKey | undefined = CLAN_KEYS.includes(rvWho as ClanKey) ? (rvWho as ClanKey) : undefined;
if (rvWho && !RV) { console.error(`--reckon-valor must be one of: ${CLAN_KEYS.join(", ")}`); process.exit(2); }
const RV_V = Number(rvV || 10);
/** The war ticks of the Reckoning's window in its day (war tick 0 at midnight UTC). */
const RECKON_FROM = Math.round((RECKONING.hour * 3600_000) / WAR.tickMs), RECKON_TO = RECKON_FROM + Math.round((RECKONING.hours * 3600_000) / WAR.tickMs);
const KEEP = keepOf(TERRITORIES);
const COUNCIL_MODE = flag("council");
if (COUNCIL_MODE !== undefined && COUNCIL_MODE !== "shadow" && COUNCIL_MODE !== "lead") { console.error("--council must be shadow or lead"); process.exit(2); }

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
  /** --battles: battles per war day by kind, results (attacker / defender / draw) by kind, stormings that flipped, men per side, minutes fought. */
  battles: Record<BattleKind, number>; results: Record<BattleKind, [number, number, number]>; stormFlips: number; men: number; mins: number;
  /** --towns: town handovers and contests started per war day, contests called off; towns held per clan (average). */
  townFlips: number; townContests: number; townOff: number; townsHeld: Record<ClanKey, number>;
  /** The neutral lands (regions.ts `wards`: the Crown): each clan's average share of them, the share of days one clan held
   * more than half of them, territories of theirs changing hands per war day. */
  crownAvg: Record<ClanKey, number>; crownHalf: number; crownFlips: number;
  /** Reckonings held, won by each clan, kept by the holder, won by the clan that won the one before. */
  reckonings: number; reckonWins: Record<ClanKey, number>; reckonKept: number; reckonRepeat: number;
  /** --council: sessions held, order sets rejected, ticks the doctrine's main target matched the council's / ticks compared. */
  councils: number; councilRejected: number; agree: number; compared: number;
}
/** Territories of the neutral lands (the Crown of the Marches): reported apart, so a snowball there shows. */
const NEUTRAL = TERRITORIES.filter((t) => regionByKey(t.region)?.wards).map((t) => t.id);

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
  const battles: Record<BattleKind, number> = { pitched: 0, storm: 0, meet: 0 }, results: Record<BattleKind, [number, number, number]> = { pitched: [0, 0, 0], storm: [0, 0, 0], meet: [0, 0, 0] };
  let stormFlips = 0, menSum = 0, minSum = 0, townFlips = 0, townContests = 0, townOff = 0;
  const townsHeld = Object.fromEntries(CLAN_KEYS.map((k) => [k, 0])) as Record<ClanKey, number>;
  const crownAvg = Object.fromEntries(CLAN_KEYS.map((k) => [k, 0])) as Record<ClanKey, number>;
  let crownHalf = 0, crownFlips = 0, reckonings = 0, reckonKept = 0, reckonRepeat = 0;
  const reckonWins = Object.fromEntries(CLAN_KEYS.map((k) => [k, 0])) as Record<ClanKey, number>;
  let councils = 0, councilRejected = 0, agree = 0, compared = 0;
  const slots = pitchedTicks();
  for (let r = 0; r < RUNS; r++) {
    const rnd = mulberry(SEED * 7919 + r), s = newWar(), minds = newMinds();
    let streak = 0, dominated = false, prev = s.owner.slice();
    const towns: Record<string, TownState> = {};
    if (TOWNS_ON) for (const t of TOWNS) towns[t.id] = { k: s.owner[townPatron(t.id)] };
    const announced = new Map<number, BattleSite>(); // settle tick (day index) -> the pitched battle placed 3 ticks before its start
    let tally: ReckonTally | undefined, lastWinner: ClanKey | undefined;
    for (let d = 0; d < DAYS; d++) {
      let today = 0, meetsToday = 0;
      announced.clear();
      const intents: Partial<Record<ClanKey, CouncilIntent>> = {};
      if (COUNCIL_MODE) for (const k of CLAN_KEYS) { // the councils sit at the start of the war day
        const v = validateCouncil(scriptedCouncil(buildBriefing(s, k, { seed: SEED * 7919 + r })), s, k, d);
        councils++;
        if (v.ok) intents[k] = intentOf(v.orders, d); else councilRejected++;
      }
      for (let i = 0; i < WAR.ticksPerDay; i++) {
        const orders = COUNCIL_MODE === "lead" ? councilOrders(s, minds, rnd, intents, clever) : scriptedOrders(s, minds, rnd, clever), extra: TickExtra = {};
        if (COUNCIL_MODE === "shadow") for (const k of CLAN_KEYS) if (intents[k]) { compared++; if (agrees(s, k, orders[k], intents[k]!)) agree++; }
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
        if (BATTLES) {
          if (!CLASH) setWarRelations(s.owner, s.tick, d === 0 && i === 0 ? [] : undefined); // (the clans at war, as the live server keeps them)
          // pitched: placed at notice (3 ticks before the start), fought at the start, settled at the tick after it
          const lead = Math.round(BATTLE.noticeMs / WAR.tickMs);
          for (const st of slots) if (i === st - lead) { const p = pickPitched(s); if (p) announced.set(st + 1, p); }
          const dep = deployments(s, orders, phaseOf(s.tick)), fight = (site: BattleSite, kind: BattleKind, fa: number, fb: number): BattleOutcome => {
            const b = virtualBattle(newBattle(site, kind, 0, 0, 0, fa, fb), [BH.includes(site.a) ? BH_K : 1, BH.includes(site.b) ? BH_K : 1]);
            battles[kind]++; results[kind][b.result === "att" ? 0 : b.result === "def" ? 1 : 2]++; menSum += b.men0[0] + b.men0[1]; minSum += b.el / 60;
            today++;
            return battleOutcome(b)!;
          };
          let out: BattleOutcome | undefined;
          // the pitched battles still to come today keep their places under the day's cap
          const free = BATTLE.perDay - slots.filter((st) => st + 1 > i).length, ph = phaseOf(s.tick);
          const p = today < BATTLE.perDay ? announced.get(i) : undefined;
          if (p && s.owner[p.t] === p.b) out = fight(p, "pitched", ...siteForces(s, "pitched", p.t, p.a, dep.attack[p.t], dep.defence[p.t], ph));
          if (!out && today < free) { // a siege due on a close margin: the closest one is stormed
            let best = -1, bm = Infinity;
            for (let t = 0; t < N; t++) {
              if (!isDecisive(s, t, dep.attack[t], dep.defence[t], phaseOf(s.tick))) continue;
              const m = Math.abs(Math.log((dep.attack[t][s.siege[t]!.by] ?? 1) / Math.max(1e-9, dep.defence[t])));
              if (m < bm) { bm = m; best = t; }
            }
            if (best >= 0) {
              const by = s.siege[best]!.by, own = s.owner[best];
              out = fight({ t: best, from: best, a: by, b: own }, "storm", ...siteForces(s, "storm", best, by, dep.attack[best], dep.defence[best], ph));
            }
          }
          if (!out && today < free && meetsToday < BATTLE.meetPerDay) {
            const pairs: { a: typeof ms[number]; b: typeof ms[number] }[] = [];
            for (let a = 0; a < ms.length; a++) for (let b = a + 1; b < ms.length; b++) if (atWar(ms[a].clan, ms[b].clan) && meetSite(ms[a], ms[b])) pairs.push({ a: ms[a], b: ms[b] });
            const m = pickMeetings(pairs, 1)[0], site = m && meetSite(m.a, m.b);
            if (site) {
              out = fight(site, "meet", site.forceA, site.forceB); meetsToday++;
              fallen.delete(m.a.id); fallen.delete(m.b.id); // (they fought the battle, not a clash)
            }
          }
          if (out) {
            extra.battle = [out];
            if (out.kind === "storm" && out.result === "att") stormFlips++;
          }
        }
        if (fallen.size) extra.march = ms.flatMap((m) => (fallen.get(m.id) ? [{ t: m.to, k: m.clan, mult: marchMult(m.size - Math.min(m.size, fallen.get(m.id)!), m.size) }] : []));
        if (d >= SETTLE_DAYS) {
          ticks++;
          const r = rallyClan(s); if (r) rally[r]++;
          if (phaseOf(s.tick) === 2) { nights++; const h = nightRaid(s, 2); if (h) { hunts++; hunted[h.clan]++; } }
        }
        if (TOWNS_ON) extra.towns = townCounts(towns);
        warTick(s, orders, extra);
        if (TOWNS_ON) for (const t of TOWNS) { // the towns follow their lands (no hero claims or holds a gate)
          const r = townStep(towns[t.id], s.owner[townPatron(t.id)], s.tick);
          towns[t.id] = r.s;
          if (d >= SETTLE_DAYS) { if (r.change === "submitted") townFlips++; else if (r.change === "contested") townContests++; else if (r.change === "off") townOff++; }
        }
        if (TIERS) setWarRelations(s.owner, s.tick, d === 0 && i === 0 ? [] : undefined); // (display only, for the tiers: the clans at war as the live server keeps them)
        if (RECKON && KEEP && (d + 1) % RECKON_EVERY === 0 && i >= RECKON_FROM && i < RECKON_TO) { // the Reckoning: the window's ticks score, its end decides
          tally ??= { land: {}, valor: {} };
          for (const [k, v] of Object.entries(landPoints(s.owner, TERRITORIES)) as [ClanKey, number][]) tally.land[k] = (tally.land[k] ?? 0) + v;
          if (RV) tally.valor[RV] = (tally.valor[RV] ?? 0) + RV_V;
          if (i === RECKON_TO - 1) {
            const holder = s.owner[KEEP.id], { winner, kept } = reckonWinner(scoresOf(tally), holder);
            s.owner[KEEP.id] = winner; s.control[KEEP.id] = 100;
            reckonings++; reckonWins[winner]++; if (kept) reckonKept++; if (winner === lastWinner) reckonRepeat++;
            lastWinner = winner; tally = undefined;
          }
        }
        for (let j = 0; j < N; j++) if (s.owner[j] !== prev[j]) { flips++; if (NEUTRAL.includes(j)) crownFlips++; }
        prev = s.owner.slice();
      }
      if (d < SETTLE_DAYS) continue;
      const top = Math.max(...CLAN_KEYS.map((k) => landOf(s, k))) / N;
      streak = top > WAR.leaderShare ? streak + 1 : 0;
      if (streak > STREAK_DAYS) dominated = true;
      for (const k of CLAN_KEYS) { const sh = landOf(s, k) / N; avg[k] += sh; worst[k] = Math.max(worst[k], sh); }
      if (TOWNS_ON) for (const t of TOWNS) townsHeld[towns[t.id].k]++;
      if (NEUTRAL.length) {
        const held = CLAN_KEYS.map((k) => NEUTRAL.filter((t) => s.owner[t] === k).length);
        CLAN_KEYS.forEach((k, i) => { crownAvg[k] += held[i] / NEUTRAL.length; });
        if (Math.max(...held) * 2 > NEUTRAL.length) crownHalf++;
      }
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
  for (const k of CLAN_KEYS) { avg[k] /= Math.max(1, samples); townsHeld[k] /= Math.max(1, samples); crownAvg[k] /= Math.max(1, samples); }
  for (const k of CLAN_KEYS) { hunted[k] /= Math.max(1, nights); rally[k] /= Math.max(1, ticks); }
  return { avg, worst, dominated: dominatedRuns / RUNS, flips: flips / (RUNS * DAYS), hunts: hunts / Math.max(1, nights), hunted, rally, sacks: sacks / (RUNS * DAYS), sackSieges: sackSieges / (RUNS * DAYS), tiers, frontOutpost: frontOut / Math.max(1, front), front: frontTiers,
    sizes, ambushed: ambushed / (RUNS * DAYS), clashes: clashes / (RUNS * DAYS), clashDead: clashDead / (RUNS * DAYS),
    battles: { pitched: battles.pitched / (RUNS * DAYS), storm: battles.storm / (RUNS * DAYS), meet: battles.meet / (RUNS * DAYS) }, results, stormFlips: stormFlips / (RUNS * DAYS),
    men: menSum / Math.max(1, 2 * (battles.pitched + battles.storm + battles.meet)), mins: minSum / Math.max(1, battles.pitched + battles.storm + battles.meet),
    townFlips: townFlips / Math.max(1, RUNS * (DAYS - SETTLE_DAYS)), townContests: townContests / Math.max(1, RUNS * (DAYS - SETTLE_DAYS)), townOff: townOff / Math.max(1, RUNS * (DAYS - SETTLE_DAYS)), townsHeld,
    crownAvg, crownHalf: crownHalf / Math.max(1, samples), crownFlips: crownFlips / (RUNS * DAYS),
    reckonings, reckonWins, reckonKept, reckonRepeat, councils, councilRejected, agree, compared };
}

const t0 = Date.now();
const base = play(), ruse = CLEVER ? play(CLEVER) : undefined;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const who = [ZEAL.length ? `heroes pushing ${zealWho} (${ZEAL_V} valor a tick)` : "", SACK.length ? `heroes sacking for ${sackWho} (${SACK_PER_DAY} Holds a day each)` : "",
  BATTLES ? `big battles${BH.length ? ` (${bhWho}'s heroes in them, k x${BH_K})` : ""}` : "", TOWNS_ON ? `${TOWNS.length} capturable towns` : "", AMBUSH.length ? `heroes ambushing columns on ${ambushWho}'s lands (${pct(AMBUSH_SHARE)} of each)` : "", CLASH ? "columns clashing on shared roads" : ""].filter(Boolean).join(", ") || "no players";
console.log(`War sim: ${RUNS} runs x ${DAYS} war days, ${N} territories, scripted leaders, ${who} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
console.log("clan       avg land   most land (any day after settling)   hunted (night ticks)   rallied (ticks)");
for (const k of CLAN_KEYS) console.log(`${k.padEnd(10)} ${pct(base.avg[k]).padStart(7)}   ${pct(base.worst[k]).padStart(7)}                              ${pct(base.hunted[k]).padStart(6)}               ${pct(base.rally[k]).padStart(6)}`);
console.log(`Night Raiders rode against a clan on ${pct(base.hunts)} of night ticks`);
console.log(`territories changing hands: ${base.flips.toFixed(2)} per war day`);
if (NEUTRAL.length) {
  console.log(`the Crown (${NEUTRAL.length} territories): ${base.crownFlips.toFixed(2)} change hands per war day; share held on average: ${CLAN_KEYS.map((k) => `${k} ${pct(base.crownAvg[k])}`).join(", ")}`);
  console.log(`  days one clan held more than half of the Crown: ${pct(base.crownHalf)}`);
}
if (RECKON && base.reckonings) {
  const n = base.reckonings, runsWithTwo = Math.floor(DAYS / RECKON_EVERY) - 1;
  console.log(`Reckonings: ${n} (every ${RECKON_EVERY} war days${RV ? `, ${rvWho}'s heroes adding ${RV_V} Crown valor a tick` : ""}); won by ${CLAN_KEYS.map((k) => `${k} ${pct(base.reckonWins[k] / n)}`).join(", ")}`);
  console.log(`  the holder kept the Keep ${pct(base.reckonKept / n)}; the last winner won again ${runsWithTwo > 0 ? pct(base.reckonRepeat / Math.max(1, n - RUNS)) : "n/a (one Reckoning a run)"}`);
}
if (SACK.length) console.log(`Holds sacked: ${base.sacks.toFixed(2)} per war day, calling ${base.sackSieges.toFixed(2)} sieges`);
if (COUNCIL_MODE) {
  console.log(`war councils (${COUNCIL_MODE}, scripted): ${base.councils} sessions, ${base.councilRejected} order sets rejected`);
  if (COUNCIL_MODE === "shadow") console.log(`  the doctrine's main target matched the council's on ${pct(base.agree / Math.max(1, base.compared))} of ${base.compared} clan-ticks`);
}
console.log(`runs where one clan held > ${pct(WAR.leaderShare)} for over ${STREAK_DAYS} days in a row: ${pct(base.dominated)} (goal: under 5%)`);
{
  const n = base.sizes.reduce((a, b) => a + b, 0) || 1;
  console.log(`column sizes (men, officer included; perSoldier ${COLUMN.perSoldier}): ${base.sizes.map((c, k) => (k >= COLUMN.min + 1 ? `${k}: ${pct(c / n)}` : "")).filter(Boolean).join("  ")}  (${(n / (RUNS * DAYS)).toFixed(1)} columns a war day)`);
}
if (AMBUSH.length) console.log(`columns ambushed: ${base.ambushed.toFixed(1)} per war day (each cut to ${pct(1 - AMBUSH_SHARE)} of its men, attack x${marchMult(Math.round(8 * (1 - AMBUSH_SHARE)), 8).toFixed(2)} for a full column; floor ${COLUMN.floor})`);
if (BATTLES) {
  const res = (k: BattleKind) => { const [a, b, c] = base.results[k], n = Math.max(1, a + b + c); return `att ${pct(a / n)} / def ${pct(b / n)} / draw ${pct(c / n)}`; };
  console.log(`big battles per war day: pitched ${base.battles.pitched.toFixed(2)} (${res("pitched")}), stormings ${base.battles.storm.toFixed(2)} (${res("storm")}; ${base.stormFlips.toFixed(2)} flips), meetings ${base.battles.meet.toFixed(2)} (${res("meet")})`);
  console.log(`  men per side ${base.men.toFixed(0)} (perMan ${BATTLE.perMan}, ${BATTLE.menMin}-${BATTLE.menMax}), ${base.mins.toFixed(1)} min fought on average`);
}
if (TOWNS_ON) {
  console.log(`towns (after settling): ${base.townContests.toFixed(2)} contests started, ${base.townOff.toFixed(2)} called off, ${base.townFlips.toFixed(2)} handovers per war day (income +${WAR.townIncome} a town a tick)`);
  console.log(`  towns held on average: ${CLAN_KEYS.map((k) => `${k} ${base.townsHeld[k].toFixed(2)}`).join(", ")}`);
}
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
const fail = !ZEAL.length && !SACK.length && !AMBUSH.length && !CLASH && !BH.length && (base.dominated >= 0.05 || (ruse && ruse.dominated >= 0.05));
if (fail) { console.log("GOAL FAILED: the war does not hold itself in check"); process.exitCode = 1; }
