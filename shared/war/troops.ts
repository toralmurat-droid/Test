/**
 * Clan troops that fight (roadmap: "troops that really fight", PR1). Each awake land's holder fields its patrol column
 * and Hold guards as real monsters (MobKind "trooper", server/warTroops.ts): they march the cosmetic route of
 * shared/war/patrols.ts, guard the Hold, hunt the wild monsters of their land and fight heroes sworn to other clans.
 * The clan rides in the existing Mob.weapon string ("<clanKey>", "<clanKey>*" for the officer), so the synced Mob
 * schema is unchanged. Pure rules and numbers: the room module and the tests read them.
 */
import { MOBS, mobScale } from "../constants";
import type { ClanKey } from "./clans";
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
  /** Valor a sworn hero earns for their clan by felling a trooper of another clan in its land... */
  killValor: 1,
  /** ...at most this much per hero per war tick (WAR.tickMs). */
  killValorPerTick: 5,
  /** How often a trooper looks for a target (ms). */
  pickMs: 400,
  /** Score bonuses when picking a foe: an enemy hero comes first, then a trooper of another clan, then wild monsters. */
  heroBonus: 0.5, troopBonus: 0.3,
  /** Score kept by the current target (no flicker between two equal foes). */
  stick: 0.3,
  /** Out of formation by more than this (px), a trooper hurries back at its full speed instead of the march pace. */
  slackPx: 24,
  /** Back in formation, a trooper walks at the column's pace times this (a little quicker, to catch up). */
  catchUp: 1.15,
  /** A trooper's reach (px) past MOB_ATTACK_RANGE: its target's body (mobBody) for a monster, `heroBody` for a hero;
   * the rush blow lands within `rushSlack` of that, a wound-up blow within `swingSlack` (the foe may step back a little). */
  heroBody: 4, rushSlack: 4, swingSlack: 6,
  /** A trooper with no hero within this (px, square) just keeps its place in the column: no walking, no fights nobody sees. */
  livePx: 22 * 32,
  /** A trooper this far from its post (px) with no hero within `warpUnseenPx` is put back on it (stuck behind a wall). */
  warpPx: 10 * 32, warpUnseenPx: 18 * 32,
  /** The soldier's rush: a foe this far off (px) is closed at speedMult for ms, and the blow on arrival hits dmgMult harder
   * (no arrival within missGraceMs after the rush ends: it missed). */
  rush: { min: 36, max: 130, ms: 320, speedMult: 3, everyMs: 4000, dmgMult: 1.3, missGraceMs: 250 },
  /** A javelin thrown at an enemy hero this far off (px): wind-up, then a shot that only hurts heroes the troops fight. */
  javelin: { min: 56, max: 150, everyMs: 4500, windupMs: 450, dmgMult: 0.9, speed: 240, radius: 4 },
};

/**
 * Per-clan multipliers on the trooper's MOBS numbers, a modest spread by doctrine: Wardens tankier, Redfang harder
 * hitting, the Host slow but tough, the Hide-Kin quick, the Veiled few but strong (tools/balance/pve.ts --troops).
 */
export const TROOP_COMBAT: Record<ClanKey, { hp: number; dmg: number; speed: number; cd: number }> = {
  wardens: { hp: 1.15, dmg: 0.9, speed: 1, cd: 1 },
  redfang: { hp: 0.9, dmg: 1.15, speed: 1.05, cd: 1 },
  host: { hp: 1.2, dmg: 1, speed: 0.85, cd: 1.1 },
  hidekin: { hp: 0.9, dmg: 0.95, speed: 1.15, cd: 0.9 },
  veiled: { hp: 1, dmg: 1.1, speed: 1, cd: 1 },
};
/** An officer (the "*" ones: column leader, first guard) on top of his clan's numbers. */
export const TROOP_OFFICER = { hp: 1.7, dmg: 1.25 };
/**
 * Veterans: one MOBS entry serves every land from Lv 5 to 50, but heroes outgrow the plain level curve (zone monsters
 * get tougher kinds as you go), so troops of higher lands gain this share per level above `from` on top of mobScale.
 */
export const TROOP_VETERAN = { from: 8, hp: 0.02, dmg: 0.05 };

/** A trooper's fighting numbers at `level` (server/warTroops.ts and the PvE sim read the same). */
export function troopStats(k: ClanKey, level: number, officer = false): { hp: number; dmg: number; speed: number; cd: number } {
  const d = MOBS.trooper, c = TROOP_COMBAT[k], o = officer ? TROOP_OFFICER : { hp: 1, dmg: 1 }, V = TROOP_VETERAN, up = Math.max(0, level - V.from);
  return { hp: Math.max(1, Math.round(d.maxHp * mobScale(level, "hp") * c.hp * o.hp * (1 + V.hp * up))),
    dmg: Math.max(1, Math.round(d.damage * mobScale(level, "damage") * c.dmg * o.dmg * (1 + V.dmg * up))),
    speed: d.speed * c.speed, cd: d.attackCooldownMs * c.cd };
}

/** The Mob.weapon value of a trooper of clan `k`: "<clan>", "<clan>*" for an officer, "<clan>^" for a supply cart (shared/war/caravans.ts). */
export const troopWeapon = (k: ClanKey, officer = false, cart = false) => (cart ? `${k}^` : officer ? `${k}*` : k);

/** A trooper's clan and rank from its Mob.weapon (a cart is a trooper too, so every trooper gate applies), or undefined for anything else. */
export function parseTroop(w: unknown): { clan: ClanKey; officer: boolean; cart: boolean } | undefined {
  if (typeof w !== "string") return undefined;
  const officer = w.endsWith("*"), cart = !officer && w.endsWith("^"), k = officer || cart ? w.slice(0, -1) : w;
  return isClan(k) ? { clan: k, officer, cart } : undefined;
}

/** A trooper's level in territory `t`: soldiers at the middle of its monster band, officers at the top. */
export function troopLevel(t: number, officer = false): number {
  const lv = TERRITORIES[t]?.levels ?? [1, 1];
  const want = officer ? lv[1] : Math.round((lv[0] + lv[1]) / 2);
  return Math.max(1, Math.min(lv[1], want));
}

export type TroopStance = "ally" | "neutral" | "enemy";
/**
 * How clan `troop`'s soldiers see a hero: their own sworn heroes are allies, heroes sworn elsewhere are enemies,
 * everyone else (unsworn heroes, anyone under STANDARD.minLevel) is left alone and can't hurt them either (the war is
 * for the sworn: the server's WarTroops.canHurt and the client's attack cursor both read this).
 */
export function troopStance(troop: ClanKey, hero: { clan?: ClanKey; level: number }): TroopStance {
  if (hero.level < STANDARD.minLevel) return "neutral";
  if (hero.clan === troop) return "ally";
  return hero.clan ? "enemy" : "neutral";
}

/** A short name for a trooper (name label, death messages): "Redfang soldier", "Redfang captain", "Redfang supply cart". */
export function troopName(k: ClanKey, officer = false, cart = false): string {
  return `${TROOP_SHORT[k]} ${cart ? "supply cart" : officer ? "captain" : "soldier"}`;
}
/** The word a clan's soldiers go by (name tags): "The Hearthbound Wardens" -> "Warden". */
const TROOP_SHORT: Record<ClanKey, string> = { wardens: "Warden", redfang: "Redfang", host: "Ossuary", hidekin: "Hide-Kin", veiled: "Veiled" };

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
