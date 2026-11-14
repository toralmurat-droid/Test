/**
 * Clan troops that fight (roadmap: "troops that really fight", PR1). Each awake land's holder fields its patrol column
 * and Hold guards as real monsters (MobKind "trooper", server/warTroops.ts): they march the cosmetic route of
 * shared/war/patrols.ts, guard the Hold, hunt the wild monsters of their land and fight heroes sworn to other clans.
 * The clan rides in the existing Mob.weapon string ("<clanKey>", "<clanKey>*" for the officer), so the synced Mob
 * schema is unchanged. Pure rules and numbers: the room module and the tests read them.
 */
import { CLANS, type ClanKey } from "./clans";
import { TROOP, type Patrol } from "./patrols";
import { isClan, STANDARD } from "./standards";
import { TERRITORIES } from "./territories";

export const WAR_TROOPS = {
  /** Master switch: off, no land ever wakes (the cosmetic client squads stay). */
  live: true,
  /** A land wakes when a living hero above ground is this close to its rect (tiles). */
  wakeTiles: 34,
  /** ...and sleeps (its troops vanish) after this long with no hero that close. */
  sleepMs: 60_000,
  /** A fallen trooper's slot is filled again at the Hold gate after this long. */
  respawnMs: 60_000,
  /** Troopers alive in one room at most (lands nearest the heroes come first; 120 cost too much tick time in npm run bench SPREAD=1). */
  maxTroops: 80,
  /** Sight (px): a trooper picks targets this close to it (twice that for whoever hit it). */
  aggroPx: 160,
  /** Wild monsters are hunted only this many tiles past the land's rect. */
  mobMarginTiles: 2,
  /** No trooper chases anything farther than this past its land's rect (tiles). */
  leashTiles: 6,
  /** An unsworn hero who strikes a trooper is that clan's enemy in all its lands for this long. */
  grudgeMs: 120_000,
  /** Valor a sworn hero earns for their clan by felling a trooper of another clan in its land... */
  killValor: 1,
  /** ...at most this much per hero per war tick (WAR.tickMs). */
  killValorPerTick: 5,
  /** How often a trooper looks for a target (ms). */
  pickMs: 400,
  /** Score bonus for a wild monster fighting a hero friendly to the clan (the troops help their own). */
  helpBonus: 1,
  /** Score kept by the current target (no flicker between two equal foes). */
  stick: 0.3,
  /** Out of formation by more than this (px), a trooper hurries back at its full speed instead of the march pace. */
  slackPx: 24,
  /** A trooper with no hero within this (px, square) just keeps its place in the column: no walking, no fights nobody sees. */
  livePx: 22 * 32,
  /** A trooper this far from its post (px) with no hero within `warpUnseenPx` is put back on it (stuck behind a wall). */
  warpPx: 10 * 32, warpUnseenPx: 18 * 32,
  /** Chat lines (Herald notes to one hero). */
  lines: {
    grudge: (clan: string, secs: number) => `You struck a soldier of ${clan}. Their troops will hunt you in all their lands for ${Math.round(secs / 60)} minutes.`,
  },
};

/** Per-clan multipliers on the trooper's MOBS numbers (all 1.0 at first: the clans differ in looks only). */
export const TROOP_COMBAT: Record<ClanKey, { hp: number; dmg: number }> = {
  wardens: { hp: 1, dmg: 1 },
  redfang: { hp: 1, dmg: 1 },
  host: { hp: 1, dmg: 1 },
  hidekin: { hp: 1, dmg: 1 },
  veiled: { hp: 1, dmg: 1 },
};

/** The Mob.weapon value of a trooper of clan `k`. */
export const troopWeapon = (k: ClanKey, officer = false) => (officer ? `${k}*` : k);

/** A trooper's clan and rank from its Mob.weapon, or undefined for anything else. */
export function parseTroop(w: unknown): { clan: ClanKey; officer: boolean } | undefined {
  if (typeof w !== "string") return undefined;
  const officer = w.endsWith("*"), k = officer ? w.slice(0, -1) : w;
  return isClan(k) ? { clan: k, officer } : undefined;
}

/** A trooper's level in territory `t`: soldiers at the middle of its monster band, officers at the top. */
export function troopLevel(t: number, officer = false): number {
  const lv = TERRITORIES[t]?.levels ?? [1, 1];
  const want = officer ? lv[1] : Math.round((lv[0] + lv[1]) / 2);
  return Math.max(1, Math.min(lv[1], want));
}

export type TroopStance = "ally" | "neutral" | "enemy";
/**
 * How clan `troop`'s soldiers see a hero: their own sworn heroes are allies, heroes sworn elsewhere and heroes with a
 * live grudge (`grudgeUntil` > `now`) are enemies, everyone else (and anyone under STANDARD.minLevel) is left alone.
 */
export function troopStance(troop: ClanKey, hero: { clan?: ClanKey; level: number }, grudgeUntil: number, now: number): TroopStance {
  if (hero.level < STANDARD.minLevel) return "neutral";
  if (hero.clan === troop) return "ally";
  if (hero.clan) return "enemy";
  return grudgeUntil > now ? "enemy" : "neutral";
}

/** A short name for a trooper (death messages, hit lines): "Redfang soldier", "Redfang officer". */
export function troopName(k: ClanKey, officer = false): string {
  const short = CLANS[k].name.replace(/^The /, "").split(" ")[0];
  return `${short} ${officer ? "officer" : "soldier"}`;
}

const arcCache = new WeakMap<Patrol, { arcs: number[]; cycle: number }>();
/** Per-stop arc positions (px, ascending) and the virtual loop length with one pause per stop. */
function arcsOf(p: Patrol) {
  let c = arcCache.get(p);
  if (!c) {
    let acc = 0;
    const at = p.pts.map((a, i) => { const s = acc, b = p.pts[(i + 1) % p.pts.length]; acc += Math.hypot(b.x - a.x, b.y - a.y); return s; });
    const arcs = p.stops.map((i) => at[i]).sort((a, b) => a - b);
    c = { arcs, cycle: p.len + arcs.length * pauseD() };
    arcCache.set(p, c);
  }
  return c;
}
const pauseD = () => (TROOP.speed * TROOP.pauseMs) / 1000;

/**
 * Distance along the loop of a column's leader at wall time `wall`, and whether it stands at a stop: one speed with a
 * pause spliced in at every stop, phased per land like the client's cosmetic squads (client/src/warTroops.ts lead).
 */
export function columnLead(p: Patrol, wall: number): { d: number; paused: boolean } {
  const { arcs, cycle } = arcsOf(p), pd = pauseD();
  if (cycle <= 0) return { d: 0, paused: true };
  const phase = (p.t * 977) % cycle, u = ((((wall / 1000) * TROOP.speed + phase) % cycle) + cycle) % cycle;
  for (let k = 0; k < arcs.length; k++) {
    const arrive = arcs[k] + k * pd;
    if (u < arrive) return { d: u - k * pd, paused: false };
    if (u < arrive + pd) return { d: arcs[k], paused: true };
  }
  return { d: u - arcs.length * pd, paused: false };
}
