import type { MobKind } from "./constants";

/**
 * Damage types (Murat 2026-11-05): every hit is Physical, and weapons can turn part of it into Fire, Cold, Poison or
 * Faith (holy). Each element has its own side effect and monsters take more or less of it:
 *   Fire    a chance to set the target alight (a short burn on top)
 *   Cold    chills: the target is slowed for a moment
 *   Poison  that part lands as poison over 2 s instead of at once, a little more in total
 *   Faith   smites the undead and demons (x1.5), normal damage on the living
 *   Shock   (Electric, Murat 2026-11-05) sparks leap from the target to one more foe close by
 * Elements ride on basic attacks (melee swings, arrows, bolts). Armour, shields and hats can resist them.
 * The share is converted, not added, so an elemental weapon is as strong as a plain one of its tier against a
 * neutral target: it is better against monsters weak to it and worse against those that resist it.
 */
export type Element = "fire" | "cold" | "poison" | "faith" | "shock";
export const ELEMENTS: Element[] = ["fire", "cold", "poison", "faith", "shock"];
export const ELEMENT_NAMES: Record<Element | "physical", string> = { physical: "Physical", fire: "Fire", cold: "Cold", poison: "Poison", faith: "Faith", shock: "Electric" };
/** Damage numbers and item text colours. */
export const ELEMENT_COLORS: Record<Element | "physical", number> = { physical: 0xe8e0d0, fire: 0xff8a3c, cold: 0x8fd8ff, poison: 0x9bdc4a, faith: 0xffe08a, shock: 0xb8a8ff };
/** What each element does, for tooltips. */
export const ELEMENT_EFFECT: Record<Element, string> = {
  fire: "may set foes alight", cold: "chills (slows)", poison: "poisons over 2s", faith: "smites the undead", shock: "sparks leap to a foe nearby",
};

/** Side effects. */
export const ELEMENT_FX = {
  fire: { chance: 0.3, ticks: 3, tickMs: 500, total: 0.35 }, // burn worth 35% of the fire part, 30% of the time
  cold: { mobSlowMs: 900, heroSlowMs: 600 },
  poison: { ticks: 4, tickMs: 500, total: 1.15 }, // the poison part, delivered over 2 s, +15% for the wait
  shock: { arc: 0.4, range: 64 }, // 40% of the shock part jumps to the nearest other foe within 64 px
};

/** Hard cap on a hero's resistance to one element. */
export const MAX_RESIST = 0.6;

/** How much of each element a monster takes (1 = normal, missing = 1). */
const UNDEAD: Partial<Record<Element, number>> = { faith: 1.5, poison: 0.5, cold: 0.75, fire: 1.25 };
const BLOB: Partial<Record<Element, number>> = { poison: 0.5, fire: 1.25, cold: 1.25, shock: 1.25 };
export const MOB_AFFINITY: Partial<Record<MobKind, Partial<Record<Element, number>>>> = {
  skeleton: UNDEAD, crawler: UNDEAD, skeletonmage: UNDEAD, necromancer: UNDEAD, hollowking: UNDEAD,
  demon: { fire: 0.5, faith: 1.5, poison: 0.75 },
  slime: BLOB, blobling: BLOB, shooterblob: BLOB, warriorblob: BLOB, healerblob: BLOB, motherblob: BLOB,
  // the elemental blobs shrug off their own element and fear its opposite
  venomblob: { poison: 0.1, fire: 1.5, faith: 1.2, cold: 1.1, shock: 1.1 },
  frostblob: { cold: 0.2, fire: 1.6, poison: 0.5, shock: 1.15 },
  fireblob: { fire: 0.2, cold: 1.6, poison: 0.5, shock: 1.1 },
  stormblob: { shock: 0.2, poison: 0.6, cold: 1.4, fire: 1.1 },
  bandit: { poison: 1.15 }, banditchief: { poison: 1.15 },
};
export const mobAffinity = (kind: string, el: Element) => MOB_AFFINITY[kind as MobKind]?.[el] ?? 1;

/** The element of a monster's magic shot (hero resistances apply to it). Unset = Physical. */
export const MOB_SHOT_ELEMENT: Partial<Record<MobKind, Element>> = { shooterblob: "poison", skeletonmage: "cold", necromancer: "poison", hollowking: "cold", crowseer: "poison" };
/** The element of a monster's melee blows and special moves (unset = Physical). */
export const MOB_MELEE_ELEMENT: Partial<Record<MobKind, Element>> = { venomblob: "poison", frostblob: "cold", fireblob: "fire", stormblob: "shock" };

/** One elemental part of a hit, already in damage points. */
export interface ElemPart { el: Element; amt: number }

/** Words for a monster's weakness / resistance (quest log, tooltips). */
export function affinityText(kind: string): string {
  const a = MOB_AFFINITY[kind as MobKind];
  if (!a) return "";
  const weak = ELEMENTS.filter((e) => (a[e] ?? 1) > 1).map((e) => ELEMENT_NAMES[e]);
  const res = ELEMENTS.filter((e) => (a[e] ?? 1) < 1).map((e) => ELEMENT_NAMES[e]);
  return [weak.length ? `Weak to ${weak.join(", ")}` : "", res.length ? `resists ${res.join(", ")}` : ""].filter(Boolean).join(", ");
}

/**
 * Visual tiers of items (Murat 2026-11-05). Higher tiers get richer idle effects and richer basic-attack effects.
 * Oakvale (the first zone, Lv 1-30) only has Tier I items; the rest are planned for later zones (see project memory).
 * Inside Tier I the item level picks the rank (client/src/gearfx.ts FX_LEVELS): Plain, Glint, Trail, Flame, Mythic.
 */
export const VISUAL_TIERS = [
  { tier: 1, name: "Tier I", zone: "Oakvale (Lv 1-30)", elements: 1, maxShare: 0.5 },
  { tier: 2, name: "Tier II", zone: "planned: second zone (Lv 30-50)", elements: 2, maxShare: 0.7 },
  { tier: 3, name: "Tier III", zone: "planned: third zone (Lv 50-70)", elements: 2, maxShare: 0.85 },
  { tier: 4, name: "Tier IV", zone: "planned: endgame", elements: 3, maxShare: 1 },
];
