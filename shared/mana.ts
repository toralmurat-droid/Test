import type { ClassKind } from "./classes";
import { STATS, type Stats } from "./powers";
import { addHeat, isOverheated } from "./overload";

/**
 * Mana and Heat: what skills cost besides their cooldown (Murat 2026-11-04: "skills should be a mix of mana + cooldown").
 *
 *   Heat (Player.energy, shared/overload.ts): replaced Stamina on 2026-11-07. Physical skills and the dodge roll build
 *     it; it cools by itself; past the top the hero overloads and those skills lock for a few seconds.
 *   Mana (this file): a slow pool that grows with Magic. Pays for spells: the whole Wizard book, and the holy, spirit,
 *     jutsu and nature skills of the other classes. Mana potions (V, shared/potions.ts) refill it.
 *
 * A skill (shared/skills.ts SkillDef) costs `cost` Heat and/or `mana` Mana, on top of its cooldown. Cheap skills
 * have short cooldowns and are limited by the pools; big skills are limited by their cooldown.
 *
 * Player.mp (synced) packs current mana, max mana and mana potions into one number (packMana), because the Player
 * schema is at Colyseus's 64-field limit.
 */
export const MANA = {
  base: 50, // max mana of a hero with 0 Magic
  perMag: 6, // max mana per point of Magic
  perLevel: 2, // max mana per hero level above 1
  regenBase: 1, // mana per second
  regenPerMag: 0.4, // ...plus this per point of Magic
  restMult: 2, // regen out of combat (not hurt for REGEN_DELAY_MS)
};

/** A mana potion drops this often compared with a healing potion (LOOT potionChance). */
export const MANA_POTION_DROP = 0.8;

export function maxManaFor(s: Stats, level = 1): number {
  return Math.round(MANA.base + MANA.perMag * s.mag + MANA.perLevel * (level - 1));
}

/** Mana per second; `bonusPct` from the skill tree (Mana Flow). */
export function manaRegen(s: Stats, resting = false, bonusPct = 0): number {
  return (MANA.regenBase + MANA.regenPerMag * s.mag) * (resting ? MANA.restMult : 1) * (1 + bonusPct / 100);
}

/** Class base mana at level 1, for the class picker. */
export const baseMana = (cls: ClassKind) => maxManaFor(STATS[cls].base);

export interface Cost { heat?: number; mana?: number }
export interface Payer { energy?: number; mana?: number }

/** What a skill costs: `cost` is Heat (shared/overload.ts), `mana` is Mana. */
export const skillCost = (s: { cost?: number; mana?: number }): Required<Cost> => ({ heat: s.cost ?? 0, mana: s.mana ?? 0 });

/** What blocks the cost ("" = can pay): overheated for a Heat skill, or too little Mana. */
export function shortOf(u: Payer, c: Cost): "" | "heat" | "mana" {
  if ((c.heat ?? 0) > 0 && isOverheated(u)) return "heat";
  if ((c.mana ?? 0) > (u.mana ?? 0)) return "mana";
  return "";
}
export const canPay = (u: Payer, c: Cost) => shortOf(u, c) === "";
/** Pays the cost (adds the Heat, spends the Mana) unless something blocks it. Returns false (and pays nothing) otherwise. */
export function pay(u: Payer, c: Cost): boolean {
  if (!canPay(u, c)) return false;
  if (c.heat) addHeat(u, c.heat);
  if (c.mana) u.mana = (u.mana ?? 0) - c.mana;
  return true;
}

// ---- Player.mp packing: potions * 1e6 + max * 1e3 + floor(current) (each part 0..999) ----------------
export function packMana(cur: number, max: number, potions: number): number {
  const m = Math.min(999, Math.max(0, Math.round(max)));
  return Math.min(9, Math.max(0, potions)) * 1e6 + m * 1e3 + Math.min(m, Math.max(0, Math.floor(cur)));
}
export function unpackMana(mp: number | undefined): { mana: number; maxMana: number; potions: number } {
  const v = Math.max(0, Math.floor(mp ?? 0));
  return { mana: v % 1000, maxMana: Math.floor(v / 1000) % 1000, potions: Math.floor(v / 1e6) };
}
