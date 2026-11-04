import type { MobKind } from "./constants";
import { MAX_LEVEL } from "./classes";
import { STATS, Stats, StatKind, statsFor } from "./powers";
import type { ClassKind } from "./classes";

/**
 * Equipment: six slots, each item adds stats and is drawn on the hero.
 * Art convention: overlay sheets `assets/gear/{hero}_{id}.png` (same frame layout as the hero sheet, see tools/art/gear.ts),
 * icons in the `gear_icons` atlas with frame name = id. Player fields weapon/ranged/shield/armour/hat/shoes hold the equipped id ("" = none).
 */
export type GearSlot = "weapon" | "ranged" | "shield" | "armour" | "hat" | "shoes";
export const GEAR_SLOTS: GearSlot[] = ["weapon", "ranged", "shield", "armour", "hat", "shoes"];
export const SLOT_NAMES: Record<GearSlot, string> = { weapon: "Weapon", ranged: "Ranged", shield: "Shield", armour: "Armour", hat: "Hat", shoes: "Shoes" };
/** Key that fires the equipped ranged (secondary) weapon. */
export const RANGED_KEY = "R";

export interface GearBonus {
  atk?: number; // added to the hero's attack stat (Strength or Magic, by class)
  sta?: number;
  str?: number;
  mag?: number;
  dex?: number; // Dexterity: critical hit chance
  speed?: number; // fraction, 0.1 = +10% move speed
  reach?: number; // fraction, 0.4 = melee reach and projectile range +40%
  block?: number; // fraction of incoming damage the shield stops
}

/** Secondary ranged weapon: fired with RANGED_KEY, independent of the class attack. */
export interface ShotDef { damage: number; range: number; speed: number; cooldownMs: number; kind: "stone" | "knife" | "bolt" }

export interface GearDef {
  id: string;
  slot: GearSlot;
  tier: 1 | 2 | 3;
  name: string; // weapons: material only, the class adds the noun ("Frost" + "Katana")
  bonus: GearBonus;
  color: number; // main colour on the hero
  accent: number; // trim / glow
  style: string; // drawing style for the art generator
  shot?: ShotDef; // ranged slot only
  /** Starting kit: only this class can wear it, it never drops from monsters or chests, and it is what makes the hero look like its class. */
  cls?: string;
}

const G = (d: GearDef) => d;
export const GEAR: Record<string, GearDef> = Object.fromEntries([
  G({ id: "w_bronze", slot: "weapon", tier: 1, name: "Bronze", bonus: { atk: 2 }, color: 0xcd7f32, accent: 0xffd08a, style: "plain" }),
  G({ id: "w_frost", slot: "weapon", tier: 2, name: "Frost", bonus: { atk: 4, mag: 1 }, color: 0x7fd8ff, accent: 0xe8fbff, style: "plain" }),
  G({ id: "w_dragon", slot: "weapon", tier: 3, name: "Dragonfire", bonus: { atk: 7, str: 1 }, color: 0xff5a1f, accent: 0xffc247, style: "glow" }),
  // Long weapons: more reach (bigger melee arc, longer shots) for a bit less attack
  G({ id: "w_ash", slot: "weapon", tier: 1, name: "Ashwood Long", bonus: { atk: 1, reach: 0.25 }, color: 0xa87444, accent: 0xe0b98a, style: "long" }),
  G({ id: "w_long", slot: "weapon", tier: 2, name: "Longreach", bonus: { atk: 3, reach: 0.4 }, color: 0xc8d6e0, accent: 0x4cc9f0, style: "long" }),
  G({ id: "w_sky", slot: "weapon", tier: 3, name: "Skyreach", bonus: { atk: 5, reach: 0.6 }, color: 0xffd166, accent: 0xfff3b0, style: "longglow" }),
  G({ id: "sh_wood", slot: "shield", tier: 1, name: "Wooden Shield", bonus: { sta: 1, block: 0.05 }, color: 0x9a6634, accent: 0x6f7883, style: "round" }),
  G({ id: "sh_iron", slot: "shield", tier: 2, name: "Iron Shield", bonus: { sta: 2, block: 0.1 }, color: 0xa3acb6, accent: 0x5a626c, style: "kite" }),
  G({ id: "sh_dragon", slot: "shield", tier: 3, name: "Dragon Shield", bonus: { sta: 4, block: 0.15 }, color: 0xb3262e, accent: 0xf2c14e, style: "kite" }),
  G({ id: "r_sling", slot: "ranged", tier: 1, name: "Sling", bonus: {}, color: 0x8a5a32, accent: 0xc89b6a, style: "sling",
    shot: { damage: 10, range: 120, speed: 200, cooldownMs: 1100, kind: "stone" } }),
  G({ id: "r_knives", slot: "ranged", tier: 2, name: "Throwing Knives", bonus: { str: 1, dex: 1 }, color: 0xc9cdd6, accent: 0x6b4226, style: "knives",
    shot: { damage: 16, range: 140, speed: 240, cooldownMs: 850, kind: "knife" } }),
  G({ id: "r_crossbow", slot: "ranged", tier: 3, name: "Crossbow", bonus: { str: 1, sta: 1 }, color: 0x6b4423, accent: 0xb0bec5, style: "crossbow",
    shot: { damage: 28, range: 190, speed: 280, cooldownMs: 1400, kind: "bolt" } }),
  G({ id: "a_leather", slot: "armour", tier: 1, name: "Leather Vest", bonus: { sta: 2 }, color: 0x8a5a32, accent: 0xc89b6a, style: "plain" }),
  G({ id: "a_chain", slot: "armour", tier: 2, name: "Chainmail", bonus: { sta: 4, str: 1 }, color: 0xa7b6c8, accent: 0x5c6878, style: "mail" }),
  G({ id: "a_royal", slot: "armour", tier: 3, name: "Royal Plate", bonus: { sta: 7, str: 1, mag: 1 }, color: 0xb3262e, accent: 0xf2c14e, style: "trim" }),
  G({ id: "s_leather", slot: "shoes", tier: 1, name: "Leather Boots", bonus: { speed: 0.05 }, color: 0x6b4423, accent: 0xa0703f, style: "plain" }),
  G({ id: "s_swift", slot: "shoes", tier: 2, name: "Swift Boots", bonus: { speed: 0.1, sta: 1, dex: 1 }, color: 0x2e9b5a, accent: 0xa8f0b0, style: "plain" }),
  G({ id: "s_winged", slot: "shoes", tier: 3, name: "Winged Boots", bonus: { speed: 0.15, sta: 2 }, color: 0xf0eee6, accent: 0xf2c14e, style: "wings" }),
  G({ id: "h_cap", slot: "hat", tier: 1, name: "Feather Cap", bonus: { mag: 1, sta: 1, dex: 1 }, color: 0x3f7d3a, accent: 0xe63946, style: "cap" }),
  G({ id: "h_helm", slot: "hat", tier: 2, name: "Iron Helm", bonus: { sta: 3, str: 1 }, color: 0x9aa3ad, accent: 0x5a626c, style: "helm" }),
  G({ id: "h_crown", slot: "hat", tier: 3, name: "Golden Crown", bonus: { sta: 2, str: 2, mag: 3 }, color: 0xf2c14e, accent: 0xe63946, style: "crown" }),
  ...starterKits(),
].map((d) => [d.id, d]));
export const GEAR_IDS = Object.keys(GEAR);
/** Items that can drop or be found (everything except the class starting kits). */
export const LOOT_IDS = GEAR_IDS.filter((id) => !GEAR[id].cls);

/**
 * Starting kits. A hero with nothing equipped is a plain human in linen underwear; these items are the class look
 * (the knight's plate and great helm, the wizard's robe and hat...). New heroes start wearing them. No stat bonus,
 * so taking them off or replacing them only changes the look. Id = `${cls}_${slot}`.
 */
function starterKits(): GearDef[] {
  const k = (cls: string, slot: GearSlot, name: string, color: number, accent: number, style: string): GearDef =>
    ({ id: `${cls}_${slot}`, slot, tier: 1, name, bonus: {}, color, accent, style, cls });
  return [
    k("knight", "weapon", "Squire's", 0xc9d2dc, 0xd9a93a, "plain"),
    k("knight", "shield", "Knight's Shield", 0x24468f, 0xd9a93a, "kite"),
    k("knight", "armour", "Knight's Plate", 0xaeb8c4, 0xd9a93a, "trim"),
    k("knight", "hat", "Great Helm", 0xb9c2cc, 0xc0262f, "helm"),
    k("knight", "shoes", "Steel Greaves", 0x9aa4ae, 0x6f7883, "plain"),
    k("ninja", "weapon", "Shadow", 0xbfc4cf, 0x2b2e48, "plain"),
    k("ninja", "armour", "Shinobi Garb", 0x2b2e48, 0x8a2230, "plain"),
    k("ninja", "hat", "Shinobi Hood", 0x23253a, 0xc21f32, "hood"),
    k("ninja", "shoes", "Tabi Wraps", 0x16172a, 0xa9aec0, "plain"),
    k("wizard", "weapon", "Apprentice", 0x7a4f2a, 0x5ee6ff, "long"),
    k("wizard", "armour", "Arcane Robe", 0x5b33a3, 0xe0b440, "robe"),
    k("wizard", "hat", "Pointed Hat", 0x4b2a8c, 0xe0b440, "hat"),
    k("wizard", "shoes", "Soft Shoes", 0x4a2e1c, 0x6b4423, "plain"),
    k("archer", "weapon", "Yew", 0x8a5a32, 0xe9e2d0, "bow"),
    k("archer", "armour", "Ranger's Jerkin", 0x6e4526, 0x4f7f3a, "plain"),
    k("archer", "hat", "Ranger's Hood", 0x355f2e, 0x24421f, "hood"),
    k("archer", "shoes", "Ranger's Boots", 0x3a2717, 0x6e4526, "plain"),
    k("barbarian", "weapon", "Iron", 0x9aa3ad, 0x6b4226, "axe"),
    k("barbarian", "armour", "Fur Kilt", 0x6a4527, 0x8a6a48, "fur"),
    k("barbarian", "hat", "Horned Helm", 0x7d8792, 0xeadfc6, "horned"),
    k("barbarian", "shoes", "Fur-lined Boots", 0x45301e, 0x8a6a48, "plain"),
  ];
}

/** The class's starting kit, slot -> item id. */
export function starterKit(cls: string): Equipped {
  const out: Equipped = {};
  for (const id of GEAR_IDS) if (GEAR[id].cls === cls) out[GEAR[id].slot] = id;
  return out;
}

/** Class kits only fit their own class; everything else fits anyone. */
export function canWear(cls: string, id: string): boolean {
  const d = gearDef(id);
  return !!d && (!d.cls || d.cls === cls);
}

export const BAG_SIZE = 12;
export const TIER_NAMES = ["", "Common", "Rare", "Epic"];

/** Chance a monster drops a piece of gear, and the odds of tier 1/2/3. */
export const GEAR_DROP: Record<MobKind, { chance: number; tiers: [number, number, number] }> = {
  slime: { chance: 0.06, tiers: [0.85, 0.15, 0] },
  skeleton: { chance: 0.15, tiers: [0.5, 0.38, 0.12] },
  crawler: { chance: 0.02, tiers: [1, 0, 0] },
  demon: { chance: 0.8, tiers: [0.05, 0.45, 0.5] },
  motherblob: { chance: 0.25, tiers: [0.45, 0.4, 0.15] },
  blobling: { chance: 0.01, tiers: [1, 0, 0] },
  shooterblob: { chance: 0.08, tiers: [0.75, 0.22, 0.03] },
  warriorblob: { chance: 0.12, tiers: [0.6, 0.32, 0.08] },
  healerblob: { chance: 0.1, tiers: [0.7, 0.25, 0.05] },
  bandit: { chance: 0.18, tiers: [0.45, 0.4, 0.15] },
  skeletonmage: { chance: 0.16, tiers: [0.5, 0.38, 0.12] },
  necromancer: { chance: 0.75, tiers: [0.1, 0.5, 0.4] },
  banditchief: { chance: 1, tiers: [0, 0.45, 0.55] },
};

export function isGearId(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const base = baseId(v);
  return base in GEAR && withLevel(base, itemLevel(v)) === v;
}

/**
 * Higher-level monsters drop better loot. Per level above 1: gear chance +8% (relative, max 60%),
 * Rare odds +3 points (max 55%), Epic odds +2 points (max 45%), Common takes what is left (min 5%).
 */
export const LOOT_LEVEL = { chance: 0.08, maxChance: 0.6, rare: 0.03, maxRare: 0.55, epic: 0.02, maxEpic: 0.45, potion: 0.05, maxPotion: 0.6 };

/** Gear drop chance and tier odds (Common, Rare, Epic) for a monster of this kind and level. */
export function gearDropOdds(kind: MobKind, level = 1): { chance: number; tiers: [number, number, number] } {
  const d = GEAR_DROP[kind];
  if (!d) return { chance: 0, tiers: [1, 0, 0] };
  const n = Math.max(0, level - 1), L = LOOT_LEVEL;
  const chance = Math.min(Math.max(d.chance, L.maxChance), d.chance * (1 + L.chance * n));
  const epic = Math.min(Math.max(d.tiers[2], L.maxEpic), d.tiers[2] + L.epic * n);
  const rare = Math.min(Math.max(d.tiers[1], L.maxRare), d.tiers[1] + L.rare * n);
  const common = Math.max(0.05, 1 - rare - epic);
  const sum = common + rare + epic;
  return { chance, tiers: [common / sum, rare / sum, epic / sum] };
}

/** Potion drop chance scaled by monster level. */
export function potionChance(base: number, level = 1): number {
  return Math.min(Math.max(base, LOOT_LEVEL.maxPotion), base * (1 + LOOT_LEVEL.potion * Math.max(0, level - 1)));
}

/** Random drop for a monster kind and level, or undefined. */
export function rollGear(kind: MobKind, level = 1, rnd = Math.random): string | undefined {
  const d = gearDropOdds(kind, level);
  if (rnd() >= d.chance) return undefined;
  let r = rnd(), tier = 1;
  for (let i = 0; i < 3; i++) { if (r < d.tiers[i]) { tier = i + 1; break; } r -= d.tiers[i]; }
  const pool = LOOT_IDS.filter((id) => GEAR[id].tier === tier);
  return withLevel(pool[Math.floor(rnd() * pool.length)], level);
}

export type Equipped = Partial<Record<GearSlot, string>>;

/** Stat points added by the equipped items. Weapon `atk` goes to the class's attack stat. */
export function gearStats(cls: string, eq: Equipped): Stats {
  const out: Stats = { sta: 0, str: 0, mag: 0, dex: 0 };
  const atkStat = (STATS as Record<string, { attackStat: keyof Stats }>)[cls]?.attackStat ?? "str";
  for (const s of GEAR_SLOTS) {
    const b = eq[s] ? gearDef(eq[s]!)?.bonus : undefined;
    if (!b) continue;
    out.sta += b.sta ?? 0; out.str += b.str ?? 0; out.mag += b.mag ?? 0; out.dex += b.dex ?? 0;
    out[atkStat] += b.atk ?? 0;
  }
  return out;
}

/** Melee reach / projectile range multiplier from long weapons. */
export function gearReachMult(eq: Equipped): number {
  return 1 + ((eq.weapon ? gearDef(eq.weapon)?.bonus.reach : 0) ?? 0);
}

/** Fraction of damage the equipped shield blocks. */
export function gearBlock(eq: Equipped): number {
  return (eq.shield ? gearDef(eq.shield)?.bonus.block : 0) ?? 0;
}

/** Move speed multiplier from shoes (and anything else with `speed`). */
export function gearSpeedMult(eq: Equipped): number {
  let m = 1;
  for (const s of GEAR_SLOTS) m += (eq[s] ? gearDef(eq[s]!)?.bonus.speed : 0) ?? 0;
  return m;
}

const WEAPON_NOUN: Record<string, string> = { knight: "Sword", ninja: "Katana", wizard: "Staff", archer: "Bow", barbarian: "Axe" };

/** Display name; weapons take the hero's weapon type ("Frost Katana"). */
export function gearName(id: string, cls?: string): string {
  const d = gearDef(id);
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
  if (b.dex) parts.push(`+${b.dex} Dexterity`);
  if (b.speed) parts.push(`+${Math.round(b.speed * 100)}% speed`);
  if (b.reach) parts.push(`+${Math.round(b.reach * 100)}% reach`);
  if (b.block) parts.push(`blocks ${Math.round(b.block * 100)}% damage`);
  return parts.join(", ");
}

/** Full description of an item: bonuses, plus damage/range for ranged weapons. */
export function itemText(id: string): string {
  const d = gearDef(id);
  if (!d) return "";
  if (d.cls && !d.shot && !Object.keys(d.bonus).length) return "Starting gear";
  const shot = d.shot ? `${d.shot.damage} dmg, range ${d.shot.range}, every ${(d.shot.cooldownMs / 1000).toFixed(1)}s [${RANGED_KEY}]` : "";
  return [shot, bonusText(d.bonus)].filter(Boolean).join(", ");
}

// ---- Item levels and requirements ----------------------------------------------------------------------
/**
 * Every found item has an item level (1..MAX_LEVEL), written after the base id: "w_frost@17" (level 1 = plain id,
 * class kits are always level 1). Drops and chests roll at the monster / chest level, shops sell set levels.
 * Bonuses grow with the level, and so do the requirements to wear it: the hero's level and points in one stat
 * (class base + points placed, gear does not count). Higher levels also look stronger on the hero (client/src/gearfx.ts).
 */
export const ITEM_MAX_LEVEL = MAX_LEVEL;
/** Whole-number bonuses (stats, attack, shot damage) grow this much per item level above 1 (Lv 30 = x2.3). */
export const ILVL_GROWTH = 0.045;
/** Fraction bonuses (speed, reach, block) grow more gently (Lv 30 = x1.44). */
export const ILVL_GROWTH_FRAC = 0.015;
/** Stat points needed per item level, by tier (Common, Rare, Epic). */
export const REQ_PER_LEVEL = [0, 0.35, 0.5, 0.65];
/** The stat each slot asks for. Weapons ask for the class's attack stat (Strength, or Magic for the Wizard). */
export const REQ_STAT: Record<GearSlot, StatKind | "attack"> = { weapon: "attack", ranged: "dex", shield: "str", armour: "sta", hat: "sta", shoes: "dex" };

export function baseId(id: string): string {
  const k = id.indexOf("@");
  return k < 0 ? id : id.slice(0, k);
}

export function itemLevel(id: string): number {
  const k = id.indexOf("@");
  if (k < 0) return 1;
  const n = Number(id.slice(k + 1));
  return Number.isInteger(n) ? Math.min(ITEM_MAX_LEVEL, Math.max(1, n)) : 1;
}

/** Item id for a base item at a level (class kits and level 1 keep the plain id). */
export function withLevel(base: string, level: number): string {
  const b = baseId(base);
  const l = Math.min(ITEM_MAX_LEVEL, Math.max(1, Math.round(level)));
  return l <= 1 || GEAR[b]?.cls ? b : `${b}@${l}`;
}

const growInt = (v: number | undefined, l: number) => (v ? Math.round(v * (1 + ILVL_GROWTH * (l - 1))) : v);
const growFrac = (v: number | undefined, l: number) => (v ? Math.round(v * (1 + ILVL_GROWTH_FRAC * (l - 1)) * 1000) / 1000 : v);

const defCache = new Map<string, GearDef>();
/** Item definition with its bonuses scaled to the item level. `id` is the full id; art and icons use baseId(id). */
export function gearDef(id: string): GearDef | undefined {
  const hit = defCache.get(id);
  if (hit) return hit;
  const d = GEAR[baseId(id)];
  if (!d) return undefined;
  const l = itemLevel(id);
  if (l <= 1) return d;
  const b = d.bonus;
  const bonus: GearBonus = Object.fromEntries(Object.entries({
    atk: growInt(b.atk, l), sta: growInt(b.sta, l), str: growInt(b.str, l), mag: growInt(b.mag, l), dex: growInt(b.dex, l),
    speed: growFrac(b.speed, l), reach: growFrac(b.reach, l), block: growFrac(b.block, l),
  }).filter(([, v]) => v !== undefined));
  const out: GearDef = { ...d, id, bonus, shot: d.shot && { ...d.shot, damage: growInt(d.shot.damage, l)! } };
  defCache.set(id, out);
  return out;
}

export interface GearReq { level: number; stat: StatKind; points: number }

/** What a hero of this class needs to wear the item. */
export function gearReq(id: string, cls: string): GearReq {
  const d = gearDef(id), l = itemLevel(id);
  const slot = d?.slot ?? "weapon";
  const want = REQ_STAT[slot];
  const stat: StatKind = want === "attack" ? (STATS as Record<string, { attackStat: StatKind }>)[cls]?.attackStat ?? "str" : want;
  if (!d || d.cls || l <= 1) return { level: 1, stat, points: 0 };
  return { level: l, stat, points: Math.round(l * REQ_PER_LEVEL[d.tier]) };
}

/** A hero's level and own stat points (class base + points placed, without gear). */
export interface HeroReqInfo { cls: string; level: number; pts: Partial<Stats> }

export function ownStats(h: HeroReqInfo): Stats {
  return statsFor(h.cls as ClassKind, h.pts);
}

/** Why the hero can't wear the item yet ("Needs Lv 12", "Needs 9 Strength"), or "" when they can. */
export function reqProblem(id: string, h: HeroReqInfo): string {
  const r = gearReq(id, h.cls);
  const miss: string[] = [];
  if (h.level < r.level) miss.push(`Lv ${r.level}`);
  if (r.points && ownStats(h)[r.stat] < r.points) miss.push(`${r.points} ${STAT_LABEL[r.stat]}`);
  return miss.length ? `Needs ${miss.join(" and ")}` : "";
}

export const meetsReq = (id: string, h: HeroReqInfo) => !reqProblem(id, h);

/** The worn items that count: a piece whose requirements are no longer met (stat points reset) gives nothing. */
export function activeGear(eq: Equipped, h: HeroReqInfo): Equipped {
  const out: Equipped = {};
  for (const s of GEAR_SLOTS) if (eq[s] && meetsReq(eq[s]!, h)) out[s] = eq[s];
  return out;
}

/** "Lv 17 · needs 11 Strength" line for menus. */
export function reqText(id: string, cls: string): string {
  const r = gearReq(id, cls);
  return `Item Lv ${itemLevel(id)}` + (r.points ? ` · needs ${r.points} ${STAT_LABEL[r.stat]}` : "");
}

const STAT_LABEL: Record<StatKind, string> = { sta: "Stamina", str: "Strength", mag: "Magic", dex: "Dexterity" };
