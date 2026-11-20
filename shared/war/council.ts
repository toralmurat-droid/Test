/**
 * The War Councils (roadmap M3), part 1: the plumbing, no AI. Once per war day each clan's council hands in a short
 * order set (CouncilOrders: target priorities, a stance, a proclamation, a rationale). It is never trusted:
 * validateCouncil rejects anything illegal, and only a legal set becomes the clan's intent for the day
 * (CouncilIntent). The intent does not replace the war's tick: councilOrders turns it into the same Orders the
 * scripted leaders give (doctrine.ts), tick by tick, and falls back to the doctrine when no target of the intent is
 * still legal. buildBriefing is what a council reads (a scripted one today, a Claude routine later: docs/war-council-routine.md);
 * dailyDigest is the plain-text day report. Pure: the server (server/warCouncil.ts), the war sim (tools/balance/war.ts)
 * and the tests share it.
 */
import { CLANS, CLAN_KEYS, type ClanKey, type Doctrine } from "./clans";
import { DOCTRINE, doctrineRank, followedSack, scriptedOrders, type Mind } from "./doctrine";
import { clansOf } from "./feuds";
import { crownLands, keepOf } from "./crown";
import { huntedClan, landOf, leaderOf, phaseOf, rallyClan, targetsOf, WAR, type Orders, type WarState } from "./rules";
import { TERRITORIES } from "./territories";
import { FORGE, forgeCodex, validateRecipe, type ForgeRecipe } from "../forge";
import { COUNCIL, COUNCIL_STANCES, type CouncilStance } from "./councilScript";

// (the limits and the scripted council live in councilScript.ts, light enough for a clan plug-in's sandbox: shared/clans/api.ts)
export { COUNCIL, COUNCIL_STANCES, scriptedCouncil, type CouncilStance } from "./councilScript";

export type CouncilMode = "off" | "shadow" | "lead";
export const COUNCIL_MODES: readonly CouncilMode[] = ["off", "shadow", "lead"];
/** The war day of a war tick: one council session per clan per war day (WAR.ticksPerDay ticks, 24 hours). */
export const warDay = (tick: number) => Math.floor(tick / WAR.ticksPerDay);

/** What a council hands in (raw: validateCouncil checks every field). `clan`, `day`: optional, checked when present. */
export interface CouncilOrders {
  clan?: ClanKey;
  day?: number;
  /** Territory ids, most wanted first: each must be a legal target (rules.ts targetsOf), never a capital or the Crown Keep. */
  targets: number[];
  stance?: CouncilStance;
  /** Announced to every player by the Herald (lead mode only): plain text. */
  proclamation?: string;
  /** One line on why (logged and in the digest, never shown to players). */
  rationale?: string;
  /**
   * The Forge (M4 PR4): a recipe (shared/forge.ts validateRecipe; `clan` may be left out). Checked apart from the rest
   * (validateForgeOrder): a bad recipe is rejected on its own and never stops the targets from leading.
   */
  forge?: ForgeRecipe;
}
export interface CouncilCheck { ok: boolean; orders: CouncilOrders; errors: string[] }

/** The day's intent of a clan whose council's orders were legal: what councilOrders executes. */
export interface CouncilIntent { day: number; targets: number[]; stance: CouncilStance }

/** Typographic characters a model likes, as plain ASCII (anything else outside printable ASCII is rejected). */
const ASCII: Record<string, string> = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", " ": " " };

/**
 * Plain text of at most `max` characters, or an error: markup (HTML tags, markdown links, emphasis, headings, code
 * marks) is stripped, whitespace collapsed; control characters, other non-ASCII and overlong text are rejected.
 */
export function cleanText(v: unknown, max: number, field: string, errors: string[]): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") { errors.push(`${field}: must be text`); return undefined; }
  if (v.length > max * 4) { errors.push(`${field}: longer than ${max} characters`); return undefined; }
  let t = v.replace(/[‘’“”–—… ]/g, (c) => ASCII[c]).replace(/[\t\n\r]+/g, " ");
  if (/[^\x20-\x7e]/.test(t)) { errors.push(`${field}: only plain printable text (ASCII) is allowed`); return undefined; }
  t = t.replace(/<[^>]*>/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`#~|\\<>{}]/g, "").replace(/ {2,}/g, " ").trim();
  if (t.length > max) { errors.push(`${field}: longer than ${max} characters`); return undefined; }
  return t || undefined;
}

/**
 * Checks clan `k`'s order set for war day `day` against the war as it stands. Every illegal item is named in
 * `errors`; `orders` keeps only the legal parts (for the log); `ok` only when nothing was wrong. A council whose
 * orders are not ok does not lead that day (the doctrine does).
 */
export function validateCouncil(raw: unknown, s: Pick<WarState, "owner">, k: ClanKey, day?: number): CouncilCheck {
  const errors: string[] = [], orders: CouncilOrders = { clan: k, targets: [] };
  if (day !== undefined) orders.day = day;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, orders, errors: ["orders: must be an object"] };
  const r = raw as Record<string, unknown>;
  if (r.clan !== undefined && r.clan !== k) errors.push(`clan: these orders are for ${k}, not ${typeof r.clan === "string" ? r.clan.slice(0, 20) : typeof r.clan}`);
  if (r.day !== undefined && day !== undefined && r.day !== day) errors.push(`day: these orders are for war day ${day}, not ${typeof r.day === "number" ? r.day : typeof r.day}`);
  if (r.stance !== undefined) {
    if (COUNCIL_STANCES.includes(r.stance as CouncilStance)) orders.stance = r.stance as CouncilStance;
    else errors.push(`stance: must be one of ${COUNCIL_STANCES.join(", ")}`);
  }
  if (!Array.isArray(r.targets)) errors.push("targets: must be a list of territory ids");
  else {
    if (r.targets.length > COUNCIL.maxTargets) errors.push(`targets: at most ${COUNCIL.maxTargets} (got ${r.targets.length})`);
    const legal = new Set(targetsOf(s, k));
    r.targets.slice(0, COUNCIL.maxTargets).forEach((t, i) => {
      const at = `targets[${i}]`, ter = typeof t === "number" && Number.isInteger(t) ? TERRITORIES[t] : undefined;
      if (typeof t !== "number" || !Number.isInteger(t)) errors.push(`${at}: not a territory id (a whole number)`);
      else if (!ter || t >= s.owner.length) errors.push(`${at}: no territory ${t} (ids 0-${Math.min(TERRITORIES.length, s.owner.length) - 1})`);
      else if (ter.reckoningOnly) errors.push(`${at}: ${ter.name} is the Crown Keep; only a Reckoning moves it`);
      else if (ter.haven) errors.push(`${at}: ${ter.name} is a heartland haven; no army strikes it`);
      else if (ter.capitalOf) errors.push(`${at}: ${ter.name} is a capital; capitals never fall`);
      else if (s.owner[t] === k) errors.push(`${at}: ${ter.name} is already yours`);
      else if (!legal.has(t)) errors.push(`${at}: ${ter.name} is not a legal target (not on your border)`);
      else if (orders.targets.includes(t)) errors.push(`${at}: ${ter.name} is named twice`);
      else orders.targets.push(t);
    });
  }
  const p = cleanText(r.proclamation, COUNCIL.proclamationMax, "proclamation", errors);
  if (p) orders.proclamation = p;
  const why = cleanText(r.rationale, COUNCIL.rationaleMax, "rationale", errors);
  if (why) orders.rationale = why;
  return { ok: !errors.length, orders, errors };
}

/** A council's forge order, checked: `recipe` when it is legal, else every problem in `errors` ("forge.<code>: ..."). */
export interface ForgeOrderCheck { ok: boolean; recipe?: ForgeRecipe; errors: string[] }
/**
 * Checks the `forge` field of clan `k`'s orders, apart from the targets (validateCouncil ignores it). The recipe is
 * the council's own clan's: `clan` left out is filled in, another clan's is an error. Only the recipe is checked here;
 * the forge's own limits (FORGE.perDay, the kill switch, one order a clan a war day) are the server's at the session.
 */
export function validateForgeOrder(raw: unknown, k: ClanKey): ForgeOrderCheck {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["forge.not_object: the forge order is a recipe object"] };
  const r = raw as Record<string, unknown>;
  if (r.clan !== undefined && r.clan !== k) return { ok: false, errors: [`forge.bad_clan: a council forges for its own clan (${k})`] };
  const c = validateRecipe({ ...r, clan: k });
  return c.ok ? { ok: true, recipe: c.recipe, errors: [] } : { ok: false, errors: c.errors.map((e) => `forge.${e.code}: ${e.msg}`) };
}

/** The intent a legal order set becomes. */
export const intentOf = (o: CouncilOrders, day: number): CouncilIntent => ({ day, targets: [...o.targets], stance: o.stance ?? "attack" });

/**
 * Clan `k`'s Orders for this tick from its intent, executed like its doctrine (doctrine.ts scriptedOrders): its first
 * priority still legal is its main target (kept in its Mind, so the doctrine picks up from there when the council
 * stops); a front that does not move for DOCTRINE.stickTicks gives way to the next priority (COUNCIL.stuckControl);
 * a siege its heroes called by a sack comes first, a raider also hits its next priority. Undefined when the intent
 * names targets and none is still legal (the doctrine leads then).
 */
export function intentOrders(s: WarState, k: ClanKey, it: CouncilIntent, mind?: Mind): Orders | undefined {
  const legal = targetsOf(s, k), live = it.targets.filter((t) => legal.includes(t));
  if (!live.length) return it.targets.length ? undefined : { defend: 1, attack: [] }; // (no targets named: the council holds its borders)
  let main = live[0];
  if (mind?.target !== undefined && live.includes(mind.target)) {
    main = mind.target;
    if (live.length > 1 && s.tick - mind.since > DOCTRINE.stickTicks && s.control[main] >= COUNCIL.stuckControl) main = live[(live.indexOf(main) + 1) % live.length];
  }
  if (mind && mind.target !== main) { mind.target = main; mind.since = s.tick; }
  const next = live.find((t) => t !== main);
  let defend = DOCTRINE.defend[k], attack = [{ t: main, share: 1 }];
  if (it.stance === "defend") defend = Math.max(defend, COUNCIL.defendStance);
  else if (it.stance === "feint" && next !== undefined) {
    if (mind) mind.feint = next;
    if (phaseOf(s.tick) === 2) return { defend: COUNCIL.feintNight, attack };
    defend = COUNCIL.feintDay; attack = [{ t: next, share: 1 }];
  } else if (CLANS[k].doctrine === "raid" && next !== undefined) attack.push({ t: next, share: COUNCIL.secondShare });
  const follow = followedSack(s, k, legal);
  if (follow !== undefined) attack = [{ t: follow, share: 1 }, ...attack.slice(1).filter((a) => a.t !== follow)];
  return { defend, attack };
}

/**
 * Every clan's Orders for this tick: the doctrine's (scriptedOrders, same random draws, so clans without an intent
 * play exactly as without councils), then each clan with an intent for today's war day takes its intent's orders.
 * `intents`: only the clans whose council leads.
 */
export function councilOrders(s: WarState, minds: Record<ClanKey, Mind>, rnd: () => number, intents: Partial<Record<ClanKey, CouncilIntent>> = {}, clever?: ClanKey): Record<ClanKey, Orders> {
  const day = warDay(s.tick), lead = CLAN_KEYS.filter((k) => intents[k]?.day === day);
  const kept = new Map(lead.map((k) => [k, { ...minds[k] }])); // (the doctrine below would retarget them: the council's Mind is kept)
  const out = scriptedOrders(s, minds, rnd, clever);
  for (const k of lead) {
    const doctrineMind = minds[k];
    minds[k] = kept.get(k)!;
    const o = intentOrders(s, k, intents[k]!, minds[k]);
    if (o) out[k] = o;
    else minds[k] = doctrineMind; // (no priority left: the doctrine leads, from its own pick)
  }
  return out;
}

/** Does the doctrine's main target this tick match the council's first priority still legal (shadow mode's yardstick)? */
export function agrees(s: Pick<WarState, "owner">, k: ClanKey, doctrine: Orders | undefined, it: CouncilIntent): boolean {
  const legal = targetsOf(s, k), live = it.targets.find((t) => legal.includes(t));
  return (doctrine?.attack[0]?.t ?? -1) === (live ?? -1);
}

// ---- The briefing: what a council reads ---------------------------------------------------------------------------

/** A war event as the briefing and digest take it (server/war.ts WarEvent fits). */
export interface CouncilEvent { tick: number; kind: string; by: ClanKey; from: ClanKey; text: string }
/** What the server knows beyond the state: the clans at war (feuds.ts pair ids), last day's events, the Reckoning. */
export interface BriefingCtx {
  /** Seeds the scripted council's jitter (the war sim: its run; default 0). */ seed?: number;
  wars?: readonly number[]; events?: readonly CouncilEvent[]; reckoning?: { start: number; end: number; on?: boolean; lastWinner?: ClanKey };
  /** The Forge as the server knows it for this clan (server/forge.ts forgeBrief); none: the briefing has no forge section. */
  forge?: ForgeBriefCtx;
}
/** The clan's side of the Forge: its live forgings, its projects in research, commissions left today, the kill switch. */
export interface ForgeBriefCtx {
  live: { id: string; kind: "weapon" | "monster"; name: string; base: string; palette: string }[];
  projects: { seq: number; kind: "weapon" | "monster"; name: string; base: string; day: number; liveDay: number; gate: "pending" | "pass" }[];
  /** Commissions left this war day (FORGE.perDay, every clan together). */
  leftToday: number;
  killed?: boolean;
}
/** The briefing's forge section: what the clan has, what a commission costs, the Codex in short (schema.forge has it all). */
export interface ForgeBriefing extends ForgeBriefCtx {
  /** Live forgings of each kind a clan keeps; a new one past this retires the clan's oldest of that kind. */
  perClan: Record<"weapon" | "monster", number>;
  /** Army spent on a commission (lead mode): the share and about how many men that is now. */
  armyCost: { share: number; men: number };
  researchDays: number;
  codex: { weaponBases: number; monsterBases: number; weaponPowerCap: number; monsterBudget: number; palettes: string[]; see: string };
  text: string;
}

export interface BriefingTarget { id: number; name: string; region: string; owner: ClanKey; control: number; fort: number; levels: [number, number]; siege?: { by: ClanKey; sack?: true; inTicks: number }; doctrineScore: number }
export interface CouncilBriefing {
  v: 1;
  clan: ClanKey; name: string; doctrine: Doctrine; counters: ClanKey; counteredBy: ClanKey;
  /** The war day these orders are for, the war tick and its phase (0 noon, 1 dusk, 2 night). */
  day: number; tick: number; phase: number;
  /** BriefingCtx.seed (the scripted council's jitter). */
  seed: number;
  rules: { maxTargets: number; stances: readonly CouncilStance[]; proclamationMax: number; rationaleMax: number; text: string };
  lands: { held: number; total: number; share: number; army: number; capitals: string[]; list: { id: number; name: string; region: string; control: number; fort: number; border?: true; capital?: true; besiegedBy?: ClanKey }[] };
  /** The targets a council may name (legal, no capital, never the Crown Keep), the doctrine's favourite first. */
  targets: BriefingTarget[];
  enemies: { clan: ClanKey; name: string; land: number; army: number; atWar: boolean; youCounter: boolean; countersYou: boolean }[];
  sieges: { id: number; name: string; by: ClanKey; owner: ClanKey; inTicks: number; sack?: true }[];
  brakes: { leader?: ClanKey; hunted?: ClanKey; rally?: ClanKey };
  crown: { keep?: { id: number; name: string; holder: ClanKey }; land: Partial<Record<ClanKey, number>>; reckoning?: BriefingCtx["reckoning"] };
  /** The doctrine's favourite targets without its jitter (the scripted council adds a jitter seeded by the day). */
  doctrinePick: number[];
  events: string[];
  /** The Forge (server briefings only). */
  forge?: ForgeBriefing;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Clan `k`'s briefing for war day `day` (default: the day of the state's tick). Deterministic: same input, same JSON. */
export function buildBriefing(s: WarState, k: ClanKey, ctx: BriefingCtx = {}, day = warDay(s.tick)): CouncilBriefing {
  // the targets a council may name: legal and no capital (validateCouncil), the doctrine's favourite first
  const legal = targetsOf(s, k).filter((t) => !TERRITORIES[t].capitalOf), rank = doctrineRank(s, k, legal), n = s.owner.length;
  const wars = new Set((ctx.wars ?? []).flatMap((p) => { const c = clansOf(p); return c && c.includes(k) ? [c[0] === k ? c[1] : c[0]] : []; }));
  const own = TERRITORIES.filter((t) => s.owner[t.id] === k);
  const siegeIn = (t: number) => Math.max(0, (s.siege[t]?.at ?? s.tick) - s.tick);
  const keep = keepOf(TERRITORIES), crownLand: Partial<Record<ClanKey, number>> = {};
  for (const t of crownLands(TERRITORIES)) crownLand[s.owner[t.id]] = (crownLand[s.owner[t.id]] ?? 0) + 1;
  const counteredBy = CLAN_KEYS.find((c) => CLANS[c].counters === k)!;
  const brakes: CouncilBriefing["brakes"] = {}, lead = leaderOf(s), hunted = huntedClan(s), rally = rallyClan(s);
  if (lead) brakes.leader = lead;
  if (hunted) brakes.hunted = hunted;
  if (rally) brakes.rally = rally;
  return {
    v: 1, clan: k, name: CLANS[k].name, doctrine: CLANS[k].doctrine, counters: CLANS[k].counters, counteredBy,
    day, tick: s.tick, phase: phaseOf(s.tick), seed: ctx.seed ?? 0,
    rules: {
      maxTargets: COUNCIL.maxTargets, stances: COUNCIL_STANCES, proclamationMax: COUNCIL.proclamationMax, rationaleMax: COUNCIL.rationaleMax,
      text: "Name up to maxTargets territory ids from `targets` (most wanted first) and a stance. Capitals and the Crown Keep can never be targeted. Your armies push your first target still legal each 10-minute tick for the whole war day; plain-text proclamation and rationale only.",
    },
    lands: {
      held: own.length, total: n, share: r2(own.length / n), army: Math.round(s.army[k]),
      capitals: own.filter((t) => t.capitalOf === k).map((t) => t.name),
      list: own.map((t) => {
        const l: CouncilBriefing["lands"]["list"][number] = { id: t.id, name: t.name, region: t.region, control: Math.round(s.control[t.id]), fort: r2(s.fort[t.id]) };
        if (t.near.some((m) => s.owner[m] !== k)) l.border = true;
        if (t.capitalOf === k) l.capital = true;
        if (s.siege[t.id]) l.besiegedBy = s.siege[t.id]!.by;
        return l;
      }),
    },
    targets: rank.map(({ t, v }) => {
      const ter = TERRITORIES[t], sg = s.siege[t];
      const x: BriefingTarget = { id: t, name: ter.name, region: ter.region, owner: s.owner[t], control: Math.round(s.control[t]), fort: r2(s.fort[t]), levels: [ter.levels[0], ter.levels[1]], doctrineScore: r2(v) };
      if (sg) x.siege = sg.sack ? { by: sg.by, sack: true, inTicks: siegeIn(t) } : { by: sg.by, inTicks: siegeIn(t) };
      return x;
    }),
    enemies: CLAN_KEYS.filter((c) => c !== k).map((c) => ({ clan: c, name: CLANS[c].name, land: landOf(s, c), army: Math.round(s.army[c]), atWar: wars.has(c), youCounter: CLANS[k].counters === c, countersYou: CLANS[c].counters === k })),
    sieges: TERRITORIES.flatMap((t) => {
      const sg = s.siege[t.id];
      if (!sg || (sg.by !== k && s.owner[t.id] !== k)) return [];
      const x: CouncilBriefing["sieges"][number] = { id: t.id, name: t.name, by: sg.by, owner: s.owner[t.id], inTicks: siegeIn(t.id) };
      if (sg.sack) x.sack = true;
      return [x];
    }),
    brakes,
    crown: { ...(keep ? { keep: { id: keep.id, name: keep.name, holder: s.owner[keep.id] } } : {}), land: crownLand, ...(ctx.reckoning ? { reckoning: { ...ctx.reckoning } } : {}) },
    doctrinePick: rank.slice(0, COUNCIL.maxTargets).map((r) => r.t),
    events: (ctx.events ?? []).filter((e) => e.by === k || e.from === k).slice(-COUNCIL.briefEvents).map((e) => e.text),
    ...(ctx.forge ? { forge: forgeBriefing(ctx.forge, s.army[k]) } : {}),
  };
}

/** The briefing's forge section from the server's facts (codex numbers from shared/forge.ts). */
function forgeBriefing(f: ForgeBriefCtx, army: number): ForgeBriefing {
  const c = forgeCodex();
  return {
    live: f.live.map((x) => ({ ...x })), projects: f.projects.map((x) => ({ ...x })), leftToday: f.leftToday, ...(f.killed ? { killed: true } : {}),
    perClan: { ...FORGE.perClan }, armyCost: { share: FORGE.armyCost, men: Math.round(army * FORGE.armyCost) }, researchDays: FORGE.researchDays,
    codex: {
      weaponBases: c.weapon.bases.length, monsterBases: c.monster.bases.length, weaponPowerCap: c.weapon.powerCap, monsterBudget: c.monster.budget,
      palettes: Object.keys(c.palettes), see: "schema.forge.codex lists every base, bonus, affix, range and budget",
    },
    text: "Optional: orders.forge commissions one weapon or monster recipe (at most one a war day). In lead mode it costs armyCost of your army at once, is tested by the balance sims, and appears researchDays later: monsters walk in your lands, weapons drop from them and sell at your capital. A recipe that breaks a rule is rejected on its own; your targets still stand.",
  };
}

// ---- The log and the daily digest ------------------------------------------------------------------------------------

/**
 * One council decision as the war save logs it. `status`: `led` (legal, leading), `shadow` (legal, logged only),
 * `fallback` (the provider threw, timed out or handed in illegal orders: the doctrine leads), `rejected` (a remote
 * submission that failed validation). `agree`: shadow mode, ticks the doctrine's main target matched / ticks counted.
 */
export interface CouncilLogEntry {
  at: number; day: number; k: ClanKey; mode: CouncilMode; provider: string;
  status: "led" | "shadow" | "fallback" | "rejected" | "forge_rejected";
  orders?: CouncilOrders; errors?: string[]; reason?: string; agree?: [number, number];
  /** What came of the forge order of this session or submission. */
  forge?: ForgeNote;
}
/**
 * A forge order's fate: `commissioned` (lead: paid, in research as #seq), `shadow` (logged only), `rejected` (the
 * recipe broke a rule), `refused` (a legal recipe the forge turned down: the day's cap, the kill switch, one a day).
 */
export interface ForgeNote { status: "commissioned" | "shadow" | "rejected" | "refused"; kind?: "weapon" | "monster"; name?: string; base?: string; seq?: number; liveDay?: number; errors?: string[] }
/** Every forge note status (cleanCouncil keeps only these). */
export const FORGE_NOTE_STATUSES: readonly ForgeNote["status"][] = ["commissioned", "shadow", "rejected", "refused"];

/** What a day's digest is built from (all optional). */
export interface DigestInput {
  council?: readonly CouncilLogEntry[];
  events?: readonly CouncilEvent[];
  battles?: readonly { kind: string; t: number; a: ClanKey; b: ClanKey; result?: string }[];
  reckoning?: { winner: ClanKey; kept: boolean };
  owner?: readonly ClanKey[];
  /** The Forge's lines of the day (server/forge.ts forgeDayLines): commissions, gates, forgings gone live or retired. */
  forge?: readonly string[];
}

const tName = (t: number) => TERRITORIES[t]?.name ?? `territory ${t}`;
/** A forge note in the digest's words. */
export function forgeNoteText(f: ForgeNote): string {
  const what = f.name ? `${f.kind ?? "forging"} "${f.name}"${f.base ? ` on ${f.base}` : ""}` : "a forging";
  if (f.status === "commissioned") return `commissioned ${what}${f.seq ? ` as #${f.seq}` : ""}${f.liveDay !== undefined ? `, live on war day ${f.liveDay} if the gate passes` : ""}`;
  if (f.status === "shadow") return `would forge ${what} (shadow: nothing made)`;
  return `${f.status} ${what}: ${f.errors?.join("; ") ?? "?"}`;
}

/** The plain-text digest of war day `day`: councils (decisions, rejections, fallbacks), flips, battles, the Reckoning, the map. Pure. */
export function dailyDigest(day: number, inp: DigestInput): string {
  const out: string[] = [`War digest, war day ${day}`];
  const cs = (inp.council ?? []).filter((e) => e.day === day);
  out.push(`Councils: ${cs.length ? "" : "none sat (doctrine led every clan)"}`);
  for (const e of cs) {
    const who = `${e.k} (${e.mode}, ${e.provider})`, ts = e.orders?.targets.map(tName).join(", ") || "no targets";
    if (e.status === "led" || e.status === "shadow") {
      const ag = e.agree ? `; doctrine agreed ${e.agree[0]}/${e.agree[1]} ticks` : "";
      out.push(`- ${who} ${e.status === "led" ? "led" : "shadowed"}: ${e.orders?.stance ?? "attack"} on ${ts}${e.orders?.rationale ? `. Why: ${e.orders.rationale}` : ""}${ag}`);
      if (e.status === "led" && e.orders?.proclamation) out.push(`  proclaimed: "${e.orders.proclamation}"`);
    } else if (e.status === "fallback") out.push(`- ${who} fell back to doctrine: ${e.reason ?? "invalid orders"}${e.errors?.length ? ` (${e.errors.join("; ")})` : ""}`);
    else if (e.status === "forge_rejected") out.push(`- ${who} forge order rejected (targets accepted): ${e.errors?.join("; ") ?? "invalid"}`);
    else out.push(`- ${who} submission rejected: ${e.errors?.join("; ") ?? "invalid"}`);
    if (e.forge && e.status !== "forge_rejected") out.push(`  forge: ${forgeNoteText(e.forge)}`);
  }
  const ev = inp.events ?? [], count = (k: string) => ev.filter((e) => e.kind === k).length;
  out.push(`Flips: ${count("flip")}, sieges laid: ${count("siege")}, held: ${count("held")}, Holds sacked: ${count("sack")}`);
  for (const e of ev.filter((x) => x.kind === "flip")) out.push(`- ${e.text}`);
  const bs = inp.battles ?? [];
  if (bs.length) {
    out.push(`Battles: ${bs.length}`);
    for (const b of bs) out.push(`- ${b.kind} at ${tName(b.t)}: ${b.a} vs ${b.b}, ${b.result === "att" ? `${b.a} won` : b.result === "def" ? `${b.b} won` : b.result === "draw" ? "a draw" : "not over"}`);
  }
  if (inp.reckoning) out.push(`Reckoning: ${inp.reckoning.winner} ${inp.reckoning.kept ? "kept" : "took"} the Crown Keep`);
  if (inp.forge) out.push(`Forge: ${inp.forge.length ? "" : "nothing forged"}`, ...inp.forge.map((l) => `- ${l}`));
  if (inp.owner) out.push(`Land: ${CLAN_KEYS.map((k) => `${k} ${inp.owner!.filter((o) => o === k).length}`).join(", ")}`);
  return out.join("\n");
}

/** The order schema the remote council endpoint hands out with each briefing (docs/war-council-routine.md). */
export const ORDER_SCHEMA = {
  clan: "the clan key these orders are for (must match)",
  day: "the war day id from the briefing (must match)",
  orders: {
    targets: `array of up to ${COUNCIL.maxTargets} territory ids from briefing.targets[].id, most wanted first`,
    stance: `one of ${COUNCIL_STANCES.join(" | ")} (default attack)`,
    proclamation: `optional, plain ASCII text, at most ${COUNCIL.proclamationMax} characters, announced to all players in lead mode`,
    rationale: `optional, plain ASCII text, at most ${COUNCIL.rationaleMax} characters, one line, logged only`,
    forge: {
      about: "optional, at most one forging a war day: a recipe for a weapon or a monster built from the parts in codex (clan may be left out). Checked apart from the targets: a bad recipe is rejected on its own (the answer's forge.errors) and the targets still stand.",
      weapon: `{ kind: "weapon", name, base: codex.weapon.bases[].id, implicit: [${FORGE.minImplicits}-${FORGE.maxImplicits} of { key: codex.weapon.implicit key, value: 1..max }], elem?: { el: codex.weapon.elements, share: >0, <= ${FORGE.maxShare}, steps of ${FORGE.shareStep} }, palette: codex.palettes key }; itemPower <= codex.weapon.powerCap`,
      monster: `{ kind: "monster", name, base: codex.monster.bases[].kind, affixes: [0-${FORGE.maxAffixes} of that base's affixes], weapon?: one of that base's weapons, hp, dmg, speed: within codex.monster.range, palette: codex.palettes key }; mobPower <= codex.monster.budget`,
      codex: forgeCodex(),
    },
  },
} as const;
