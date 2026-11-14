/**
 * The rules of the clan war: one pure step per war tick (every 10 minutes in the game). Nothing here talks to the
 * room or to an AI: a leader (scripted doctrine.ts now, a War Council later) hands in Orders, the rules decide what
 * they achieve. Every number lives in WAR so the war sim (tools/balance/war.ts) and the game read the same values.
 *
 * Model, per tick: clans earn troops from their land (less the further it is from a capital: overextension), pay
 * upkeep, split their army between defending their borders and attacking the targets their leader chose. On each
 * attacked territory attack meets defence (defender's edge, forts, counter cycle, doctrine and time of day); the
 * difference moves Control. Below WAR.siegeAt a siege is announced, and when it comes due the territory flips if the
 * attacker still out-fights the defence there. Capitals never flip. Clans below a fair share get a rally bonus, and the
 * Night Raiders bleed whoever holds the most land.
 */
import { CLANS, CLAN_KEYS, type ClanKey } from "./clans";
import { initialOwners, TERRITORIES, type Territory } from "./territories";

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
  raidersHit: 0.03, // share of the leader's army the Night Raiders cut down each night tick
  // Players (server/war.ts): valor is hero-minutes at a standard; a few heroes tip a front, a crowd cannot swamp it
  valorScale: 20, // valor at which players bring ~63% of valorCap
  siegeValor: 1.5, // players count more at a territory under siege (the hour's notice is for them)
  valorPerAdd: 10, // most valor one hero can bring in one report (ten minutes at a standard)
  valorCap: 60, // troops players can add to one territory per clan per tick (x siegeValor during a siege) (a clan's army is ~150-600)
};

export interface Siege { by: ClanKey; at: number }
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
export const landOf = (s: WarState, k: ClanKey) => s.owner.filter((o) => o === k).length;
/** The clan holding more than WAR.leaderShare of the land, if any. */
export function leaderOf(s: WarState): ClanKey | undefined {
  const best = CLAN_KEYS.reduce((a, b) => (landOf(s, b) > landOf(s, a) ? b : a));
  return landOf(s, best) / s.owner.length > WAR.leaderShare ? best : undefined;
}

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

/** Enemy territories clan `k` can attack: next to its land (within WAR.tunnelReach for the Hide-Kin). */
export function targetsOf(s: WarState, k: ClanKey): number[] {
  const reach = CLANS[k].doctrine === "tunnel" ? WAR.tunnelReach : 1;
  const seen = new Set<number>(), out = new Set<number>();
  let frontier = s.owner.flatMap((o, i) => (o === k ? [i] : []));
  frontier.forEach((i) => seen.add(i));
  for (let d = 0; d < reach; d++) {
    const next: number[] = [];
    for (const id of frontier) for (const n of TERRITORIES[id].near) {
      if (seen.has(n)) continue;
      seen.add(n);
      if (s.owner[n] !== k) { out.add(n); next.push(n); }
    }
    frontier = next;
  }
  return [...out];
}
/** Own territories that touch an enemy (where defenders stand). */
export const bordersOf = (s: WarState, k: ClanKey) => TERRITORIES.filter((t) => s.owner[t.id] === k && t.near.some((n) => s.owner[n] !== k)).map((t) => t.id);

const timeBonus = (k: ClanKey, p: number) => {
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
 */
export interface TickExtra { phase?: number; valor?: Partial<Record<ClanKey, number>>[] }

/** Troops that `v` valor is worth: each point counts, but a crowd adds less and less (WAR.valorCap at most). */
export const valorForce = (v: number) => (v > 0 ? WAR.valorCap * (1 - Math.exp(-v / WAR.valorScale)) : 0);

/** One war tick. Mutates and returns `s`. A clan missing from `orders` (or with broken orders) only defends. */
export function warTick(s: WarState, orders: Partial<Record<ClanKey, Orders>>, extra: TickExtra = {}): WarState {
  const supply = supplyMap(s), lead = leaderOf(s), phase = extra.phase ?? phaseOf(s.tick);
  const land = Object.fromEntries(CLAN_KEYS.map((k) => [k, landOf(s, k)])) as Record<ClanKey, number>;
  // 1. Income and upkeep
  for (const k of CLAN_KEYS) {
    let inc = 0;
    for (const t of TERRITORIES) if (s.owner[t.id] === k) inc += (t.capitalOf === k ? WAR.capitalIncome : WAR.income) * supply[t.id];
    // Rally: the less land a clan holds below a fair share, the more its people take up arms
    inc *= 1 + WAR.rally * Math.max(0, 1 - land[k] / (s.owner.length / CLAN_KEYS.length));
    s.army[k] = s.army[k] * (1 - WAR.upkeep) + inc;
  }
  if (lead && phase === 2) s.army[lead] *= 1 - WAR.raidersHit;
  // 2. Where the armies stand: defenders spread over the borders by last tick's pressure, attackers on their targets
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
  // Players: valor for the owner defends, valor for a clan that may attack this territory pushes for that clan
  extra.valor?.forEach((vs, id) => {
    if (!vs || id >= TERRITORIES.length) return;
    const legal = (k: ClanKey) => targetsOf(s, k).includes(id);
    for (const [k, v] of Object.entries(vs) as [ClanKey, number][]) {
      const f = valorForce(v ?? 0) * (s.siege[id] ? WAR.siegeValor : 1); // a siege window calls the heroes
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
    const def = defence[id] * supply[id] * WAR.defender * timeBonus(own, phase) * (1 + s.fort[id]);
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
    if (t.capitalOf === own) continue; // capitals never fall
    const top = (Object.entries(atk) as [ClanKey, number][]).reduce((a, b) => (b[1] > a[1] ? b : a));
    const sg = s.siege[id];
    if (!sg && s.control[id] <= WAR.siegeAt) s.siege[id] = { by: top[0], at: s.tick + WAR.siegeWarnTicks };
    else if (sg && s.tick >= sg.at) {
      const by = atk[sg.by] ?? 0, mult = CLANS[sg.by].doctrine === "siege" ? WAR.hostSiege : WAR.siegeBonus;
      if (by * mult > def * WAR.siegeHold) { s.owner[id] = sg.by; s.fort[id] = 0; s.control[id] = 60; }
      else s.control[id] = 50;
      s.siege[id] = null;
    }
  }
  s.tick++;
  return s;
}
