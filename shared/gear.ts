import type { MobKind } from "./constants";
import { STATS, Stats } from "./powers";

/**
 * Equipment: four slots, each item adds stats and is drawn on the hero.
 * Art convention: overlay sheets `assets/gear/{hero}_{id}.png` (same frame layout as the hero sheet, see tools/art/gear.ts),
 * icons in the `gear_icons` atlas with frame name = id. Player fields weapon/armour/shoes/hat hold the equipped id ("" = none).
 */
export type GearSlot = "weapon" | "armour" | "shoes" | "hat";
export const GEAR_SLOTS: GearSlot[] = ["weapon", "armour", "shoes", "hat"];
export const SLOT_NAMES: Record<GearSlot, string> = { weapon: "Weapon", armour: "Armour", shoes: "Shoes", hat: "Hat" };

export interface GearBonus {
  atk?: number; // added to the hero's attack stat (Strength or Magic, by class)
  sta?: number;
  str?: number;
  mag?: number;
  speed?: number; // fraction, 0.1 = +10% move speed
}

export interface GearDef {
  id: string;
  slot: GearSlot;
  tier: 1 | 2 | 3;
  name: string; // weapons: material only, the class adds the noun ("Frost" + "Katana")
  bonus: GearBonus;
  color: number; // main colour on the hero
  accent: number; // trim / glow
  style: string; // drawing style for the art generator
}

const G = (d: GearDef) => d;
export const GEAR: Record<string, GearDef> = Object.fromEntries([
  G({ id: "w_bronze", slot: "weapon", tier: 1, name: "Bronze", bonus: { atk: 2 }, color: 0xcd7f32, accent: 0xffd08a, style: "plain" }),
  G({ id: "w_frost", slot: "weapon", tier: 2, name: "Frost", bonus: { atk: 4, mag: 1 }, color: 0x7fd8ff, accent: 0xe8fbff, style: "plain" }),
  G({ id: "w_dragon", slot: "weapon", tier: 3, name: "Dragonfire", bonus: { atk: 7, str: 1 }, color: 0xff5a1f, accent: 0xffc247, style: "glow" }),
  G({ id: "a_leather", slot: "armour", tier: 1, name: "Leather Vest", bonus: { sta: 2 }, color: 0x8a5a32, accent: 0xc89b6a, style: "plain" }),
  G({ id: "a_chain", slot: "armour", tier: 2, name: "Chainmail", bonus: { sta: 4, str: 1 }, color: 0xa7b6c8, accent: 0x5c6878, style: "mail" }),
  G({ id: "a_royal", slot: "armour", tier: 3, name: "Royal Plate", bonus: { sta: 7, str: 1, mag: 1 }, color: 0xb3262e, accent: 0xf2c14e, style: "trim" }),
  G({ id: "s_leather", slot: "shoes", tier: 1, name: "Leather Boots", bonus: { speed: 0.05 }, color: 0x6b4423, accent: 0xa0703f, style: "plain" }),
  G({ id: "s_swift", slot: "shoes", tier: 2, name: "Swift Boots", bonus: { speed: 0.1, sta: 1 }, color: 0x2e9b5a, accent: 0xa8f0b0, style: "plain" }),
  G({ id: "s_winged", slot: "shoes", tier: 3, name: "Winged Boots", bonus: { speed: 0.15, sta: 2 }, color: 0xf0eee6, accent: 0xf2c14e, style: "wings" }),
  G({ id: "h_cap", slot: "hat", tier: 1, name: "Feather Cap", bonus: { mag: 1, sta: 1 }, color: 0x3f7d3a, accent: 0xe63946, style: "cap" }),
  G({ id: "h_helm", slot: "hat", tier: 2, name: "Iron Helm", bonus: { sta: 3, str: 1 }, color: 0x9aa3ad, accent: 0x5a626c, style: "helm" }),
  G({ id: "h_crown", slot: "hat", tier: 3, name: "Golden Crown", bonus: { sta: 2, str: 2, mag: 3 }, color: 0xf2c14e, accent: 0xe63946, style: "crown" }),
].map((d) => [d.id, d]));
export const GEAR_IDS = Object.keys(GEAR);

export const BAG_SIZE = 12;
export const TIER_NAMES = ["", "Common", "Rare", "Epic"];

/** Chance a monster drops a piece of gear, and the odds of tier 1/2/3. */
export const GEAR_DROP: Record<MobKind, { chance: number; tiers: [number, number, number] }> = {
  slime: { chance: 0.06, tiers: [0.85, 0.15, 0] },
  skeleton: { chance: 0.15, tiers: [0.5, 0.38, 0.12] },
  motherblob: { chance: 0.25, tiers: [0.45, 0.4, 0.15] },
  blobling: { chance: 0.01, tiers: [1, 0, 0] },
};

export function isGearId(v: unknown): v is string {
  return typeof v === "string" && v in GEAR;
}

/** Random drop for a monster kind, or undefined. */
export function rollGear(kind: MobKind, rnd = Math.random): string | undefined {
  const d = GEAR_DROP[kind];
  if (!d || rnd() >= d.chance) return undefined;
  let r = rnd(), tier = 1;
  for (let i = 0; i < 3; i++) { if (r < d.tiers[i]) { tier = i + 1; break; } r -= d.tiers[i]; }
  const pool = GEAR_IDS.filter((id) => GEAR[id].tier === tier);
  return pool[Math.floor(rnd() * pool.length)];
}

export type Equipped = Partial<Record<GearSlot, string>>;

/** Stat points added by the equipped items. Weapon `atk` goes to the class's attack stat. */
export function gearStats(cls: string, eq: Equipped): Stats {
  const out: Stats = { sta: 0, str: 0, mag: 0 };
  const atkStat = (STATS as Record<string, { attackStat: keyof Stats }>)[cls]?.attackStat ?? "str";
  for (const s of GEAR_SLOTS) {
    const b = eq[s] ? GEAR[eq[s]!]?.bonus : undefined;
    if (!b) continue;
    out.sta += b.sta ?? 0; out.str += b.str ?? 0; out.mag += b.mag ?? 0;
    out[atkStat] += b.atk ?? 0;
  }
  return out;
}

/** Move speed multiplier from shoes (and anything else with `speed`). */
export function gearSpeedMult(eq: Equipped): number {
  let m = 1;
  for (const s of GEAR_SLOTS) m += (eq[s] ? GEAR[eq[s]!]?.bonus.speed : 0) ?? 0;
  return m;
}

const WEAPON_NOUN: Record<string, string> = { knight: "Sword", ninja: "Katana", wizard: "Staff", archer: "Bow", barbarian: "Axe" };

/** Display name; weapons take the hero's weapon type ("Frost Katana"). */
export function gearName(id: string, cls?: string): string {
  const d = GEAR[id];
  if (!d) return id;
  return d.slot === "weapon" ? `${d.name} ${WEAPON_NOUN[cls ?? ""] ?? "Weapon"}` : d.name;
}

/** "+4 attack, +1 Magic" style summary. */
export function bonusText(b: GearBonus): string {
  const parts: string[] = [];
  if (b.atk) parts.push(`+${b.atk} attack`);
  if (b.sta) parts.push(`+${b.sta} Stamina`);
  if (b.str) parts.push(`+${b.str} Strength`);
  if (b.mag) parts.push(`+${b.mag} Magic`);
  if (b.speed) parts.push(`+${Math.round(b.speed * 100)}% speed`);
  return parts.join(", ");
}
