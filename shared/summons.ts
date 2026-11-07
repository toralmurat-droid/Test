// Summons: monsters a hero calls up to fight for them (the Summoner's golems first, other kinds later).
// A summon is a Mob with an owner (server/TownRoom.ts): it follows its owner, fights the owner's enemies (monsters,
// and heroes when PvP allows it), and the owner gets the XP and loot of what it kills. It never drops loot itself.
import type { Element } from "./elements";
import type { MobKind } from "./constants";

export type SummonKind = "golem_fire" | "golem_cold" | "golem_poison" | "golem_shock";
export const SUMMON_KINDS: SummonKind[] = ["golem_fire", "golem_cold", "golem_poison", "golem_shock"];
export const isSummonKind = (k: unknown): k is SummonKind => typeof k === "string" && (SUMMON_KINDS as string[]).includes(k);

/** The element each golem hits with (and its look). */
export const SUMMON_ELEMENT: Record<SummonKind, Exclude<Element, "faith">> = {
  golem_fire: "fire", golem_cold: "cold", golem_poison: "poison", golem_shock: "shock",
};

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
} as const;

/** Is this mob kind a summon (never part of a spawn zone, never drops loot)? */
export const isSummonMob = (kind: MobKind) => isSummonKind(kind);
