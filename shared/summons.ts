// Summons: monsters a hero calls up to fight for them (the Summoner's golems first, other kinds later).
// A summon is a Mob with an owner (server/TownRoom.ts): it follows its owner, fights the owner's enemies (monsters,
// and heroes when PvP allows it), and the owner gets the XP and loot of what it kills. It never drops loot itself.
import type { Element } from "./elements";
import type { MobKind } from "./constants";

export type SummonKind = "golem_fire" | "golem_cold" | "golem_poison" | "golem_shock" | "golem_colossus";
export const SUMMON_KINDS: SummonKind[] = ["golem_fire", "golem_cold", "golem_poison", "golem_shock", "golem_colossus"];
/** The elements Attune cycles through (Player.attune is an index into this), and the golem of each. */
export const ATTUNE_ORDER = ["fire", "cold", "poison", "shock"] as const;
export type AttuneElement = (typeof ATTUNE_ORDER)[number];
export const GOLEM_OF: Record<AttuneElement, SummonKind> = { fire: "golem_fire", cold: "golem_cold", poison: "golem_poison", shock: "golem_shock" };
export const attuneOf = (i: number): AttuneElement => ATTUNE_ORDER[((i | 0) % ATTUNE_ORDER.length + ATTUNE_ORDER.length) % ATTUNE_ORDER.length];
export const isSummonKind = (k: unknown): k is SummonKind => typeof k === "string" && (SUMMON_KINDS as string[]).includes(k);

/** The element each golem hits with (and its look). */
export const SUMMON_ELEMENT: Record<Exclude<SummonKind, "golem_colossus">, Exclude<Element, "faith">> = {
  golem_fire: "fire", golem_cold: "cold", golem_poison: "poison", golem_shock: "shock",
};
/** A summon's element: the golem's own, or the Colossus's (kept in Mob.weapon). */
export const summonElement = (kind: string, weapon: string): AttuneElement =>
  kind === "golem_colossus" ? attuneOf(ATTUNE_ORDER.indexOf(weapon as AttuneElement)) : SUMMON_ELEMENT[kind as Exclude<SummonKind, "golem_colossus">] ?? "fire";

export const SUMMON = {
  /** Most summons one hero can have out at once: calling one more sends the oldest back. */
  max: 2,
  /** How long a summon stays before it crumbles (ms). */
  lifeMs: 90_000,
  /** It walks back to its owner when farther than this (px), and picks fights only this close to the owner. */
  followRange: 3 * 32, leash: 8 * 32,
  /** It looks for enemies this far around itself (px). */
  aggroRange: 5 * 32,
  /** Share of its damage that becomes elemental (fire burns, cold slows, poison, shock), the rest is physical. */
  elementShare: 0.4,
  /** Vital Link (su_link): a golem close to its owner mends this share of its life per second per rank. */
  linkRegen: 0.01,
  /** Colossus: each golem fused into it adds this much life and damage; its slam hits everyone this close to the target. */
  colossusPerGolem: 0.25, colossusSlam: 34,
  /**
   * Bound golem (Murat 2026-11-07): a Summoner with no summon out gets one by itself after `autoMs`, anywhere but the
   * safe zone, in the attuned element and as strong as their Elemental Golem skill (rank 1 if not learned yet).
   */
  autoMs: 5000,
  /**
   * Guardian: a monster the owner hits hates the owner's golem instead, when one is fighting next to it (within
   * `guardRange` px of the monster). Monsters away from the golems still go for the Summoner.
   */
  guardRange: 3 * 32,
  /** Monsters pick a summon over a hero by this much more (it stands in front of its owner). */
  taunt: 0.3,
  /** Stone Bond reaches golems this close to their owner (px). */
  bondRange: 6 * 32,
  /**
   * Stone Bond (balance pass 2026-11-07, tools/balance/duel.ts): the owner's nearest golem within guardRange takes this
   * share of every blow the owner takes. The Summoner was dying in ~5 s to any melee hero before the golems mattered.
   */
  guardShare: 0.3,
} as const;

/**
 * Level used for a summon's life and damage scaling (monster scaling, shared/constants.ts mobScale). Past `soft`, only
 * `rate` of each level counts (balance pass 2026-11-07: the Summoner topped every class at Lv 25-30). The level shown
 * on the golem stays the owner's.
 */
export const SUMMON_SCALE = { soft: 20, rate: 0.4 } as const;
export const summonScaleLevel = (level: number) => (level <= SUMMON_SCALE.soft ? level : SUMMON_SCALE.soft + (level - SUMMON_SCALE.soft) * SUMMON_SCALE.rate);

/**
 * Stone Bond share for an owner of this level: SUMMON.guardShare up to Lv 20, then down to `low` at Lv 25 and after.
 * It is what carries the Summoner (duels: 28-30% without it), and at Lv 25-30 the full share put them above every class.
 */
export const BOND = { from: 20, to: 25, low: 0.22 } as const;
export function bondShare(level: number): number {
  if (level <= BOND.from) return SUMMON.guardShare;
  const t = Math.min(1, (level - BOND.from) / (BOND.to - BOND.from));
  return SUMMON.guardShare + (BOND.low - SUMMON.guardShare) * t;
}

/** Is this mob kind a summon (never part of a spawn zone, never drops loot)? */
export const isSummonMob = (kind: MobKind) => isSummonKind(kind);
