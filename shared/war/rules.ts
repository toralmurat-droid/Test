/**
 * The rules of the clan war: one pure step per war tick (every 10 minutes in the game). Nothing here talks to the
 * room or to an AI: a leader (scripted doctrine.ts now, a War Council later) hands in Orders, the rules decide what
 * they achieve. Every number lives in WAR so the war sim (tools/balance/war.ts) and the game read the same values.
 *
 * Model, per tick: clans earn troops from their land (less the further it is from a capital: overextension), pay
 * upkeep, split their army between defending their borders and attacking the targets their leader chose. On each
 * attacked territory attack meets defence (defender's edge, forts, counter cycle, doctrine and time of day); the
 * difference moves Control. Below WAR.siegeAt a siege is announced, and when it comes due the territory flips if the
 * attacker still out-fights the defence there. Capitals never flip, nor does Reckoning-only ground (the Crown Keep: no
 * clan may strike it at all, territories.ts reckoningOnly). Clans below a fair share get a rally bonus (the
 * weakest one also a Rally for its heroes' valor), and the Night Raiders hunt a clan that holds clearly the most land:
 * by night they bleed its army and strike its weakest border lands (roadmap M2: the brakes on a runaway clan).
 */
import { CLANS, CLAN_KEYS, type ClanKey } from "./clans";
import { initialOwners, TERRITORIES, warProof, type Territory } from "./territories";

export const WAR = {
  tickMs: 10 * 60_000,
  ticksPerDay: 144,
  /** Day phases per war tick (the game's day is 30 minutes, three war ticks): 0 noon, 1 dusk, 2 night. */
  phases: 3,
  income: 1, // troops per territory per tick
  capitalIncome: 3,
  upkeep: 0.02, // share of the army lost to upkeep each tick, so armies settle near income / upkeep
  supplyDecay: 0.25, // supply = 1 / (1 + decay x borders from the nearest own capital)
  cutOff: 0.35, // supply of land with no road back to a capital
  defender: 1.3,
  counter: 1.2, // attacking the clan you counter
  doctrine: 1.25, // night for the Host, noon for the Veiled
  controlDiv: 25, // (attack - defence) / controlDiv = Control points per tick...
  maxShift: 2, // ...at most this many
  regrow: 1, // Control a quiet territory wins back per tick
  siegeAt: 25,
  siegeWarnTicks: 6, // an hour's notice so players can come
  siegeBonus: 1.0, // attack multiplier when the siege comes due (the Host gets more)
  siegeHold: 1.3, // the defence rallies at the walls when the siege comes due
  hostSiege: 1.3,
  lossRate: 0.01, // share of the smaller side lost by both sides of a fight each tick
  hostRaise: 0.3, // the Host raises this share of its losses again
  raidSteal: 0.02, // Redfang: share of its attack on a territory taken from the defender's army...
  fortGrow: 0.01, fortMax: 1, palisadeFort: 2, // forts grow on quiet land (the Wardens build twice as fast)
  tunnelReach: 2, // the Hide-Kin attack land up to this many borders from their own
  tunnelSupply: 0.8, // share of the start's supply a tunnel strike keeps
  rally: 0.8, // income bonus of a clan with no land at all, shrinking to 0 at a fair share (1/5 of the land)
  leaderShare: 0.3, // above this share of the land a clan is "the leader": everyone's target, the Raiders' prey
  raidersHit: 0.03, // share of the hunted clan's army the Night Raiders cut down each night tick
  // The Night Raiders hunt a clan that holds clearly the most land (huntedClan): over leaderShare, or at least huntShare
  // and huntLead territories ahead of the next clan. Each night tick they strike huntLands of its border lands
  huntShare: 0.26,
  huntLead: 2,
  huntLands: 2, // (non-capital, weakest Control first)
  huntControl: 4, // Control each struck land loses (a quiet land wins WAR.regrow back per tick)
  // Rally for the weakest (rallyClan): the clan with the least land, below rallyBelow x a fair share. Its heroes' valor
  // counts rallyValor times (valorForce still caps it at valorCap) and their renown grows rallyRenown times (server)
  rallyBelow: 0.8,
  rallyValor: 1.3,
  rallyRenown: 1.25,
  // Players (server/war.ts): valor is hero-minutes at a standard; a few heroes tip a front, a crowd cannot swamp it
  valorScale: 20, // valor at which players bring ~63% of valorCap
  siegeValor: 1.5, // players count more at a territory under siege (the hour's notice is for them)
  valorPerAdd: 10, // most valor one hero can bring in one report (ten minutes at a standard)
  valorCap: 60, // troops players can add to one territory per clan per tick (x siegeValor during a siege) (a clan's army is ~150-600)
  // A sacked Hold (shared/war/holdSack.ts, sackHold below): the holder's Control loses this much (half for an unsworn hero
  // or a clan the war keeps out of the land); at most once per land per war tick (server/warHolds.ts)
  sackControl: 8,
  // A siege a sack called (Siege.sack) that fails when it comes due leaves Control where it is, plus this (an army's failed
  // siege resets it to 50): a raid on the Hold should not end up strengthening the holder
  sackSiegeFail: 2,
  // A sack also tears down part of the Hold's works (W3): `fort` (built-up time, the defence bonus and the Hold's tier,
  // holdTiers.ts) loses this much (half for an unsworn hero, like the Control)
  sackFort: 0.02,
  // Big battles (W5, shared/war/battles.ts; their own numbers are in BATTLE): what an outcome does to the war at the next
  // tick. The loser's army loses battleArmyHit x the share of its men it lost. A pitched or meeting battle won by the
  // attacker: the land loses battleControl Control and the attacker's army attack there counts battleAttack; won by
  // the defender: its defence counts battleDefence and Control grows battleHold. A storming flips the land or fails the siege
  battleArmyHit: 0.08,
  battleControl: 12,
  battleAttack: 1.25,
  battleDefence: 1.25,
  battleHold: 8,
  // Capturable towns (W6, shared/war/towns.ts): troops each town its holder holds adds to that clan's income per tick
  // (only with TickExtra.towns: a tick without it plays as before W6)
  townIncome: 0.5,
};

/** `sack`: called by a sacked Hold (sackHold), not by the armies (optional: older saves have none). */
export interface Siege { by: ClanKey; at: number; sack?: true }
export interface WarState {
  tick: number;
  owner: ClanKey[];
  control: number[]; // 0..100, the owner's grip
  fort: number[]; // 0..WAR.fortMax (x palisadeFort for the Wardens)
  army: Record<ClanKey, number>;
  siege: (Siege | null)[];
  /** Attack each territory took last tick (leaders use it to send defenders where the pressure is). */
  pressure: number[];
}
/** What a leader decides for one tick: the share of its army that defends, and where the rest attacks. */
export interface Orders { defend: number; attack: { t: number; share: number }[] }

export function newWar(): WarState {
  const n = TERRITORIES.length, owner = initialOwners();
  const army = {} as Record<ClanKey, number>;
  for (const k of CLAN_KEYS) army[k] = (owner.filter((o) => o === k).length * WAR.income) / WAR.upkeep;
  return { tick: 0, owner, control: Array(n).fill(100), fort: Array(n).fill(0), army, siege: Array(n).fill(null), pressure: Array(n).fill(0) };
}

export const phaseOf = (tick: number) => tick % WAR.phases; // 0 noon, 1 dusk, 2 night
/** Land that is fought over: the heartland havens (territories.ts haven) never count toward a clan's share of the war. */
const fought = (i: number) => !TERRITORIES[i]?.haven;
const foughtCount = (owner: readonly (ClanKey | undefined)[]) => owner.reduce((n, _, i) => n + (fought(i) ? 1 : 0), 0) || 1;
export const landOf = (s: Pick<WarState, "owner">, k: ClanKey) => s.owner.reduce((n, o, i) => n + (o === k && fought(i) ? 1 : 0), 0);
/** The clan holding more than WAR.leaderShare of the land, if any. */
export function leaderOf(s: WarState): ClanKey | undefined {
  const best = CLAN_KEYS.reduce((a, b) => (landOf(s, b) > landOf(s, a) ? b : a));
  return landOf(s, best) / foughtCount(s.owner) > WAR.leaderShare ? best : undefined;
}

/**
 * The clan the Night Raiders hunt, if any: one that holds more than WAR.leaderShare, or at least WAR.huntShare of the
 * land and WAR.huntLead territories more than any other clan. Takes the owners only, so the client can ask it too.
 */
export function huntedClan(s: Pick<WarState, "owner">): ClanKey | undefined {
  const land = CLAN_KEYS.map((k) => landOf(s, k)), n = foughtCount(s.owner);
  const top = Math.max(...land), i = land.indexOf(top), second = Math.max(...land.filter((_, j) => j !== i));
  if (top / n > WAR.leaderShare && top > second) return CLAN_KEYS[i];
  return top / n >= WAR.huntShare && top - second >= WAR.huntLead ? CLAN_KEYS[i] : undefined;
}

/** What the Night Raiders do this tick: by night, strike up to WAR.huntLands of the hunted clan's border lands (not its
 *  capitals), weakest Control first (then the most pressed, then the lowest id). Undefined by day or with nobody hunted. */
export function nightRaid(s: WarState, phase: number): { clan: ClanKey; ts: number[] } | undefined {
  const clan = phase === 2 ? huntedClan(s) : undefined;
  if (!clan) return undefined;
  const ts = bordersOf(s, clan).filter((t) => TERRITORIES[t].capitalOf !== clan)
    .sort((a, b) => s.control[a] - s.control[b] || s.pressure[b] - s.pressure[a] || a - b).slice(0, WAR.huntLands);
  return { clan, ts };
}

/**
 * The clan the war rallies for, if any: the one with the least land when that is under WAR.rallyBelow x a fair share.
 * A tie goes to the first in CLAN_KEYS order (not the smaller army: that would hand the Rally back and forth every tick).
 * Takes the owners only, so the client and the writ board name the same clan.
 */
export function rallyClan(s: Pick<WarState, "owner">): ClanKey | undefined {
  const land = (k: ClanKey) => landOf(s, k);
  const k = CLAN_KEYS.reduce((a, b) => (land(b) < land(a) ? b : a));
  return land(k) < WAR.rallyBelow * (foughtCount(s.owner) / CLAN_KEYS.length) ? k : undefined;
}
/** Renown multiplier for a hero sworn to clan `k` (WAR.rallyRenown while the war rallies for `k`). */
export const rallyRenown = (s: Pick<WarState, "owner"> | undefined, k: ClanKey | undefined): number =>
  (s && k && rallyClan(s) === k ? WAR.rallyRenown : 1);

/** Supply of every territory for its owner: 1 at a capital, less per border away, WAR.cutOff when cut off. */
export function supplyMap(s: WarState): number[] {
  const hops = Array<number>(TERRITORIES.length).fill(Infinity);
  let frontier = TERRITORIES.filter((t) => t.capitalOf && s.owner[t.id] === t.capitalOf).map((t) => t.id);
  for (const id of frontier) hops[id] = 0;
  while (frontier.length) {
    const next: number[] = [];
    for (const id of frontier) for (const n of TERRITORIES[id].near)
      if (hops[n] === Infinity && s.owner[n] === s.owner[id]) { hops[n] = hops[id] + 1; next.push(n); }
    frontier = next;
  }
  return hops.map((h) => (h === Infinity ? WAR.cutOff : 1 / (1 + WAR.supplyDecay * h)));
}

/** Enemy territories clan `k` can attack: next to its land (within WAR.tunnelReach for the Hide-Kin). Never Reckoning-only ground (a tunnel may pass under it). */
export function targetsOf(s: Pick<WarState, "owner">, k: ClanKey): number[] {
  const reach = CLANS[k].doctrine === "tunnel" ? WAR.tunnelReach : 1;
  const seen = new Set<number>(), out = new Set<number>();
  let frontier = s.owner.flatMap((o, i) => (o === k ? [i] : []));
  frontier.forEach((i) => seen.add(i));
  for (let d = 0; d < reach; d++) {
    const next: number[] = [];
    for (const id of frontier) for (const n of TERRITORIES[id].near) {
      if (seen.has(n)) continue;
      seen.add(n);
      if (s.owner[n] !== k) { if (!warProof(TERRITORIES[n])) out.add(n); next.push(n); }
    }
    frontier = next;
  }
  return [...out];
}
/** Own territories that touch an enemy (where defenders stand). Reckoning-only ground is none: nobody can strike it. */
export const bordersOf = (s: WarState, k: ClanKey) => TERRITORIES.filter((t) => s.owner[t.id] === k && !warProof(t) && t.near.some((n) => s.owner[n] !== k)).map((t) => t.id);

/** The doctrine's time-of-day bonus of clan `k` in phase `p` (night for the Host, noon for the Veiled; rituals.ts reads it). */
export const timeBonus = (k: ClanKey, p: number) => {
  const d = CLANS[k].doctrine;
  return (d === "siege" && p === 2) || (d === "ritual" && p === 0) ? WAR.doctrine : 1;
};
const finite = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
/**
 * Orders from any leader (an AI council later, so never trusted): a missing entry or a value that is not a finite
 * number means "defend everything"; shares are clamped, unknown targets dropped later as illegal.
 */
export function cleanOrders(o: Orders | undefined): Orders {
  const defend = finite(o?.defend, 0, 1);
  if (!o || defend === undefined || !Array.isArray(o.attack)) return { defend: 1, attack: [] };
  const attack = o.attack.slice(0, 8).flatMap((a) => {
    const t = finite(a?.t, 0, TERRITORIES.length - 1), share = finite(a?.share, 0, 1);
    return t !== undefined && Number.isInteger(a.t) && share ? [{ t, share }] : [];
  });
  return { defend, attack };
}
const fortCap = (k: ClanKey) => WAR.fortMax * (CLANS[k].doctrine === "palisade" ? WAR.palisadeFort : 1);

/**
 * What the live game adds to a tick. `phase`: the real time of day (the sim counts it from the tick). `valor`: the
 * players' effort per territory and clan this tick (standards held, see server/war.ts), turned into troops there.
 * `march` (W4): clan k's army attack on land t counts `mult` (0..1) of itself: what is left of its marching column
 * (shared/war/marches.ts marchMult, floored there); valor is untouched. `towns` (W6): the towns each clan holds
 * (shared/war/towns.ts townCounts), each adding WAR.townIncome to its income after the rally bonus.
 */
export interface TickExtra { phase?: number; valor?: Partial<Record<ClanKey, number>>[]; march?: { t: number; k: ClanKey; mult: number }[]; battle?: BattleOutcome[]; towns?: Partial<Record<ClanKey, number>> }
/** Most towns one clan can count in TickExtra.towns (validated: a bad count is dropped, a big one capped). */
export const TOWNS_MAX = 16;
/** Clan k's held towns from TickExtra.towns (W6): a whole number 0..TOWNS_MAX, 0 for junk. */
export const townCount = (towns: TickExtra["towns"], k: ClanKey): number => {
  const n = towns?.[k];
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.min(TOWNS_MAX, Math.floor(n)) : 0;
};

/** W5 big battles (shared/war/battles.ts): a pitched battle at fixed times, a storming at a siege's gate, a meeting of two columns. */
export type BattleKind = "pitched" | "storm" | "meet";
export type BattleResult = "att" | "def" | "draw";
/**
 * A battle fought since the last tick, as TickExtra.battle hands it in: land t (held by `def`), attacker `att`, who won,
 * and the share (0..1) of its starting men each side lost. Validated here (it comes from the server's battle records).
 */
export interface BattleOutcome { kind: BattleKind; t: number; att: ClanKey; def: ClanKey; result: BattleResult; lostA: number; lostB: number }
const BATTLE_KINDS: readonly unknown[] = ["pitched", "storm", "meet"], BATTLE_RESULTS: readonly unknown[] = ["att", "def", "draw"];
const okOutcome = (b: BattleOutcome | undefined, n: number): b is BattleOutcome => !!b && BATTLE_KINDS.includes(b.kind) && BATTLE_RESULTS.includes(b.result)
  && Number.isInteger(b.t) && b.t >= 0 && b.t < n && !!CLANS[b.att] && !!CLANS[b.def] && b.att !== b.def;
const share01 = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** Land t's defence as the fight reckons it: the raw defenders there x supply x the defender's edge x time of day x forts. */
export const defenceAt = (s: WarState, t: number, raw: number, phase: number, supply: number[]) => raw * supply[t] * WAR.defender * timeBonus(s.owner[t], phase) * (1 + s.fort[t]);

/** Troops that `v` valor is worth: each point counts, but a crowd adds less and less (WAR.valorCap at most). */
export const valorForce = (v: number) => (v > 0 ? WAR.valorCap * (1 - Math.exp(-v / WAR.valorScale)) : 0);

/**
 * A hero sacked territory t's Hold (shared/war/holdSack.ts): the holder's grip loosens by WAR.sackControl and its works
 * by WAR.sackFort, half when `half` (an unsworn hero, a clan not at war with the holder, or one the war keeps out of the
 * land). When a full sack brings Control to WAR.siegeAt or below and no siege is announced, clan `k` lays siege, but only where the war lets it attack (targetsOf) and never at a
 * capital: the flip still waits for the siege (warTick). Mutates `s`. The live war (server/war.ts strikeHold) and the
 * war sim (tools/balance/war.ts --sack) share it. Undefined (nothing changed) for a bad land, Reckoning-only ground, the
 * holder's own clan or a land already under siege.
 */
export function sackHold(s: WarState, t: number, k: ClanKey | undefined, half: boolean): { control: number; siege?: Siege } | undefined {
  if (!Number.isInteger(t) || t < 0 || t >= s.owner.length || warProof(TERRITORIES[t]) || s.siege[t] || (k && s.owner[t] === k)) return undefined;
  s.control[t] = Math.max(0, s.control[t] - WAR.sackControl * (half ? 0.5 : 1));
  s.fort[t] = Math.max(0, (s.fort[t] ?? 0) - WAR.sackFort * (half ? 0.5 : 1));
  const out: { control: number; siege?: Siege } = { control: s.control[t] };
  if (k && CLANS[k] && !half && s.control[t] <= WAR.siegeAt && TERRITORIES[t]?.capitalOf !== s.owner[t] && targetsOf(s, k).includes(t))
    out.siege = s.siege[t] = { by: k, at: s.tick + WAR.siegeWarnTicks, sack: true };
  return out;
}

/**
 * Where the armies stand for one tick (warTick step 2): each clan's defenders spread over its borders by last tick's
 * pressure, its attackers on its legal targets (fed from the best-supplied adjacent own land, a tunnel's start for a
 * Hide-Kin strike), with the time of day and the counter cycle. Pure: reads `s` (after the tick's income), never writes.
 * The marching columns (marches.ts) size themselves by the attack it gives. `supply`: supplyMap(s), when known.
 */
export function deployments(s: WarState, orders: Partial<Record<ClanKey, Orders>>, phase: number, supply: number[] = supplyMap(s)): { attack: Partial<Record<ClanKey, number>>[]; defence: number[] } {
  const attack: Partial<Record<ClanKey, number>>[] = TERRITORIES.map(() => ({}));
  const defence = Array<number>(TERRITORIES.length).fill(0);
  for (const k of CLAN_KEYS) {
    const o = cleanOrders(orders[k]), legal = new Set(targetsOf(s, k));
    // Only border land gets defenders: land the Hide-Kin reach by tunnel behind a front stands empty (by design)
    const borders = bordersOf(s, k), weight = borders.map((b) => 1 + s.pressure[b] / 50), wsum = weight.reduce((a, b) => a + b, 0) || 1;
    const def = s.army[k] * o.defend;
    borders.forEach((b, i) => { defence[b] += (def * weight[i]) / wsum; });
    const shares = o.attack.filter((a) => legal.has(a.t) && a.share > 0), ssum = shares.reduce((a, b) => a + b.share, 0);
    const force = s.army[k] - def;
    for (const a of shares) {
      let src = Math.max(WAR.cutOff, ...TERRITORIES[a.t].near.filter((n) => s.owner[n] === k).map((n) => supply[n]));
      // Tunnels: a strike two borders away is fed from the own land the tunnel starts at, not from nothing
      if (CLANS[k].doctrine === "tunnel" && !TERRITORIES[a.t].near.some((n) => s.owner[n] === k))
        src = Math.max(src, WAR.tunnelSupply * Math.max(0, ...TERRITORIES[a.t].near.flatMap((n) => TERRITORIES[n].near).filter((m) => s.owner[m] === k).map((m) => supply[m])));
      const vs = s.owner[a.t];
      const mult = timeBonus(k, phase) * (CLANS[k].counters === vs ? WAR.counter : 1);
      attack[a.t][k] = (attack[a.t][k] ?? 0) + ((force * a.share) / Math.max(1, ssum)) * src * mult;
    }
  }
  return { attack, defence };
}

/** One war tick. Mutates and returns `s`. A clan missing from `orders` (or with broken orders) only defends. */
export function warTick(s: WarState, orders: Partial<Record<ClanKey, Orders>>, extra: TickExtra = {}): WarState {
  const supply = supplyMap(s), phase = extra.phase ?? phaseOf(s.tick), rally = rallyClan(s);
  const land = Object.fromEntries(CLAN_KEYS.map((k) => [k, landOf(s, k)])) as Record<ClanKey, number>;
  // 1. Income and upkeep
  for (const k of CLAN_KEYS) {
    let inc = 0;
    for (const t of TERRITORIES) if (s.owner[t.id] === k) inc += (t.capitalOf === k ? WAR.capitalIncome : WAR.income) * supply[t.id];
    // Rally: the less land a clan holds below a fair share, the more its people take up arms
    inc *= 1 + WAR.rally * Math.max(0, 1 - land[k] / (s.owner.length / CLAN_KEYS.length));
    if (extra.towns) inc += WAR.townIncome * townCount(extra.towns, k); // held towns (W6); nothing at all without them
    s.army[k] = s.army[k] * (1 - WAR.upkeep) + inc;
  }
  // The Night Raiders hunt the clan that holds clearly the most: its army bleeds, its weakest borders shake
  const raid = nightRaid(s, phase);
  if (raid) {
    s.army[raid.clan] *= 1 - WAR.raidersHit;
    for (const t of raid.ts) s.control[t] = Math.max(0, s.control[t] - WAR.huntControl);
  }
  // 2. Where the armies stand (deployments); then the marching columns players cut down (W4: the army share only)
  const { attack, defence } = deployments(s, orders, phase, supply);
  for (const m of extra.march ?? []) {
    const a = Number.isInteger(m?.t) ? attack[m.t] : undefined, mult = typeof m?.mult === "number" && Number.isFinite(m.mult) ? Math.max(0, Math.min(1, m.mult)) : 1;
    if (a && CLANS[m.k] && a[m.k] !== undefined) a[m.k] = a[m.k]! * mult;
  }
  // Big battles (W5): the loser's army bleeds; a pitched or meeting battle moves Control and weighs on this tick's fight
  // there; a storming is kept for the siege check below. Nothing at all with no battle (the pre-W5 path)
  let storms: Map<number, BattleOutcome> | undefined;
  for (const b of extra.battle ?? []) {
    if (!okOutcome(b, TERRITORIES.length)) continue;
    const loser = b.result === "att" ? b.def : b.result === "def" ? b.att : undefined;
    if (loser) s.army[loser] = Math.max(0, s.army[loser] * (1 - WAR.battleArmyHit * share01(loser === b.att ? b.lostA : b.lostB)));
    if (s.owner[b.t] !== b.def || b.result === "draw") continue; // (the land changed hands meanwhile: its fight is moot)
    if (b.kind === "storm") { (storms ??= new Map()).set(b.t, b); continue; }
    if (b.result === "att") {
      s.control[b.t] = Math.max(0, s.control[b.t] - WAR.battleControl);
      if (attack[b.t][b.att] !== undefined) attack[b.t][b.att] = attack[b.t][b.att]! * WAR.battleAttack;
    } else {
      s.control[b.t] = Math.min(100, s.control[b.t] + WAR.battleHold);
      defence[b.t] *= WAR.battleDefence;
    }
  }
  // Players: valor for the owner defends, valor for a clan that may attack this territory pushes for that clan
  extra.valor?.forEach((vs, id) => {
    if (!vs || id >= TERRITORIES.length) return;
    const legal = (k: ClanKey) => targetsOf(s, k).includes(id);
    for (const [k, v] of Object.entries(vs) as [ClanKey, number][]) {
      // a siege window calls the heroes; the Rally makes the weakest clan's heroes count more
      const f = valorForce((v ?? 0) * (k === rally ? WAR.rallyValor : 1)) * (s.siege[id] ? WAR.siegeValor : 1);
      if (!f || !CLANS[k]) continue;
      if (s.owner[id] === k) defence[id] += f;
      else if (legal(k)) attack[id][k] = (attack[id][k] ?? 0) + f;
    }
  });
  // 3. Fights, Control, sieges
  for (const t of TERRITORIES) {
    const id = t.id, own = s.owner[id], atk = attack[id];
    const total = Object.values(atk).reduce((a, b) => a + (b ?? 0), 0);
    s.pressure[id] = total;
    const def = defenceAt(s, id, defence[id], phase, supply);
    if (total <= 0) {
      s.control[id] = Math.min(100, s.control[id] + WAR.regrow);
      s.fort[id] = Math.min(fortCap(own), s.fort[id] + WAR.fortGrow * (CLANS[own].doctrine === "palisade" ? WAR.palisadeFort : 1));
      if (s.siege[id] && s.control[id] > WAR.siegeAt) s.siege[id] = null;
      continue;
    }
    // Attrition on both sides (shared out among the attackers by their weight)
    const loss = Math.min(total, def) * WAR.lossRate;
    const ownLoss = (loss * defence[id]) / Math.max(def, 1e-9);
    s.army[own] = Math.max(0, s.army[own] - ownLoss * (CLANS[own].doctrine === "siege" ? 1 - WAR.hostRaise : 1));
    for (const [k, v] of Object.entries(atk) as [ClanKey, number][]) {
      const l = (loss * v) / total;
      s.army[k] = Math.max(0, s.army[k] - l * (CLANS[k].doctrine === "siege" ? 1 - WAR.hostRaise : 1));
      if (CLANS[k].doctrine === "raid") { const take = Math.min(s.army[own], v * WAR.raidSteal); s.army[own] -= take; s.army[k] += take / 2; }
    }
    s.control[id] = Math.max(0, Math.min(100, s.control[id] - Math.max(-WAR.maxShift, Math.min(WAR.maxShift, (total - def) / WAR.controlDiv))));
    if (t.capitalOf === own || warProof(t)) continue; // capitals never fall, nor the Crown Keep (only a Reckoning moves it) or a haven
    const top = (Object.entries(atk) as [ClanKey, number][]).reduce((a, b) => (b[1] > a[1] ? b : a));
    const sg = s.siege[id];
    if (!sg && s.control[id] <= WAR.siegeAt) s.siege[id] = { by: top[0], at: s.tick + WAR.siegeWarnTicks };
    else if (sg && s.tick >= sg.at) {
      const by = atk[sg.by] ?? 0, mult = CLANS[sg.by].doctrine === "siege" ? WAR.hostSiege : WAR.siegeBonus;
      const storm = storms?.get(id)?.att === sg.by ? storms.get(id)!.result : undefined; // (a storming settles it: W5)
      if (storm === "def") s.control[id] = sg.sack ? Math.min(100, s.control[id] + WAR.sackSiegeFail) : 50;
      else if (storm === "att" || by * mult > def * WAR.siegeHold) { s.owner[id] = sg.by; s.fort[id] = 0; s.control[id] = 60; }
      else s.control[id] = sg.sack ? Math.min(100, s.control[id] + WAR.sackSiegeFail) : 50; // (a sack's siege does not hand the holder its grip back)
      s.siege[id] = null;
    }
  }
  s.tick++;
  return s;
}
