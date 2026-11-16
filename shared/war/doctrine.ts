/**
 * Scripted clan leaders: the fallback the War Councils fall back to, and the leaders the war sim plays with until
 * the councils exist (roadmap M0/M1). Each leader picks targets by its doctrine and sticks with them for a while,
 * so fronts last hours instead of flickering. `clever` adds one ruse within the rules (a feint by day, the real push at
 * night), to check that a smart plan wins some land but cannot run away with the map. A leader follows its heroes: a
 * siege they called by sacking a Hold comes first (followedSack).
 */
import { CLANS, CLAN_KEYS, type ClanKey } from "./clans";
import { landOf, leaderOf, phaseOf, targetsOf, type Orders, type WarState } from "./rules";
import { TERRITORIES } from "./territories";

export interface Mind { target?: number; since: number; feint?: number }
export const newMinds = () => Object.fromEntries(CLAN_KEYS.map((k) => [k, { since: 0 } as Mind])) as Record<ClanKey, Mind>;

export const DOCTRINE = {
  defend: { wardens: 0.7, redfang: 0.45, host: 0.55, hidekin: 0.55, veiled: 0.65 } as Record<ClanKey, number>,
  stickTicks: 18, // keep a target about three hours unless a much better one shows up
  switchFactor: 1.4,
  leaderWeight: 2, // everyone goes for the clan that is ahead
  jitter: 0.25,
};

function score(s: WarState, k: ClanKey, t: number, lead: ClanKey | undefined, rnd: () => number): number {
  const vs = s.owner[t];
  let v = 1;
  if (CLANS[k].counters === vs) v *= 1.3;
  if (lead && vs === lead && lead !== k) v *= DOCTRINE.leaderWeight;
  v *= 0.5 + (landOf(s, vs) / s.owner.length) * CLAN_KEYS.length * 0.5; // the bigger the owner, the more tempting
  if (TERRITORIES[t].capitalOf === vs) v *= 0.2; // capitals never fall: pointless to besiege
  v *= 1 + (100 - s.control[t]) / 100; // finish what is already shaking
  v /= 1 + s.fort[t];
  return v * (1 + (rnd() - 0.5) * DOCTRINE.jitter);
}

/**
 * The land a clan's leader follows its heroes to (W2b): a siege its heroes called by sacking a Hold (Siege.sack) on a land
 * it may still attack. One at a time: the one due soonest (then the lowest id). Without the army behind it, a sack's
 * siege lapses when it comes due.
 */
export function followedSack(s: WarState, k: ClanKey, legal: readonly number[] = targetsOf(s, k)): number | undefined {
  let best: number | undefined;
  for (const t of legal) {
    const sg = s.siege[t];
    if (sg?.sack && sg.by === k && s.owner[t] !== k && (best === undefined || sg.at < s.siege[best]!.at || (sg.at === s.siege[best]!.at && t < best))) best = t;
  }
  return best;
}

/** Orders of every clan for this tick. `clever`: the clan playing the feint-and-night-push ruse. */
export function scriptedOrders(s: WarState, minds: Record<ClanKey, Mind>, rnd: () => number, clever?: ClanKey): Record<ClanKey, Orders> {
  const lead = leaderOf(s), out = {} as Record<ClanKey, Orders>;
  for (const k of CLAN_KEYS) {
    const m = minds[k], legal = targetsOf(s, k);
    if (!legal.length) { out[k] = { defend: 1, attack: [] }; continue; }
    const ranked = legal.map((t) => ({ t, v: score(s, k, t, lead, rnd) })).sort((a, b) => b.v - a.v);
    const cur = m.target !== undefined && legal.includes(m.target) ? ranked.find((r) => r.t === m.target) : undefined;
    if (!cur || (s.tick - m.since > DOCTRINE.stickTicks && ranked[0].v > cur.v * DOCTRINE.switchFactor)) { m.target = ranked[0].t; m.since = s.tick; }
    const attack = [{ t: m.target!, share: 1 }];
    if (CLANS[k].doctrine === "raid" && ranked.length > 1) attack.push({ t: ranked.find((r) => r.t !== m.target)!.t, share: 0.5 }); // raiders hit two places
    let defend = DOCTRINE.defend[k];
    // the heroes sacked a Hold and called a siege: the leader puts that land first until the siege is settled (its own
    // target is kept in mind for afterwards; a raider still hits its second place)
    const follow = followedSack(s, k, legal);
    if (follow !== undefined) {
      out[k] = { defend, attack: [{ t: follow, share: 1 }, ...attack.slice(1).filter((a) => a.t !== follow)] };
      continue;
    }
    if (clever === k) {
      // The ruse: by day a token push somewhere else keeps the defenders busy; at night everything goes on the real target
      if (m.feint === undefined || !legal.includes(m.feint) || m.feint === m.target) m.feint = ranked.find((r) => r.t !== m.target)?.t;
      if (phaseOf(s.tick) === 2) { defend = 0.2; out[k] = { defend, attack: [{ t: m.target!, share: 1 }] }; continue; }
      out[k] = { defend: 0.9, attack: m.feint !== undefined ? [{ t: m.feint, share: 1 }] : attack };
      continue;
    }
    out[k] = { defend, attack };
  }
  return out;
}

