import type { MobKind } from "./constants";
import { MAX_LEVEL } from "./classes";
import { STATS, Stats, StatKind, statsFor } from "./powers";
import type { ClassKind } from "./classes";
import { Element, ELEMENTS, ELEMENT_EFFECT, ELEMENT_NAMES, MAX_RESIST } from "./elements";
import { isRuneId, parseRuneCode, Rune, RUNES, runeCode, runeId, mergeRunes } from "./runes";
import { luteAt, LUTE_GROUPS, LUTE_ID, luteTrait, type LuteTraitId } from "./lute";

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
  // Elemental damage added to every basic hit (weapons), and resistances in percent (armour, shields, hats). shared/elements.ts
  fireDmg?: number; coldDmg?: number; poisonDmg?: number; faithDmg?: number; shockDmg?: number;
  fireRes?: number; coldRes?: number; poisonRes?: number; faithRes?: number; shockRes?: number;
}
const DMG_KEY: Record<Element, keyof GearBonus> = { fire: "fireDmg", cold: "coldDmg", poison: "poisonDmg", faith: "faithDmg", shock: "shockDmg" };
const RES_KEY: Record<Element, keyof GearBonus> = { fire: "fireRes", cold: "coldRes", poison: "poisonRes", faith: "faithRes", shock: "shockRes" };

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
  /** Weapons: the share of every basic hit that is this element instead of Physical (shared/elements.ts). */
  elem?: { el: Element; share: number };
  /** Weapons: what kind of weapon it is. It decides the basic attack (bow = arrows, wand = magic bolts, sword = melee...).
   *  Unset = the old "class weapon" that takes the shape of the hero's own weapon (shared/weapons.ts NATIVE_WEAPON). */
  wtype?: WeaponType;
  /** Starting kit: only this class can wear it, it never drops from monsters or chests, and it is what makes the hero look like its class. */
  cls?: string;
  /**
   * A Songweaver book (DI-2/DI-3, shield slot): `full` is the hidden skill (shared/skills.ts FINISHERS) it fires when
   * her song gauge fills; `songs`: it holds the songs she collects (the Songbook).
   */
  book?: { full: string; songs?: boolean };
  /** Bound to its hero (isBound): it can't be dropped, sold, traded or put in the stash. */
  bound?: boolean;
  /** The stat its requirement asks for instead of the slot's (REQ_STAT): books want a mind for magic, not Strength. */
  req?: StatKind;
}

/** Weapon kinds. The equipped main-hand weapon decides the basic attack for every class (shared/weapons.ts). */
export type WeaponType = "sword" | "katana" | "axe" | "bow" | "staff" | "wand" | "fists" | "lute";
export const WEAPON_TYPE_NAMES: Record<WeaponType, string> = { sword: "Sword", katana: "Katana", axe: "Axe", bow: "Bow", staff: "Staff", wand: "Wand", fists: "Fists", lute: "Lute" };
/** Short words for what the weapon does in any hero's hands (item tooltip). */
export const WEAPON_USE: Record<WeaponType, string> = {
  sword: "melee", katana: "fast melee", axe: "heavy melee", bow: "shoots arrows", staff: "fireballs", wand: "magic bolts, costs mana", fists: "punches",
  lute: "sound waves",
};
/** The weapon each class is trained with: its class weapon and kit take this shape. */
export const NATIVE_WEAPON: Record<ClassKind, WeaponType> = { knight: "sword", ninja: "katana", wizard: "staff", archer: "bow", barbarian: "axe", vampire: "sword", summoner: "staff", songweaver: "lute" };
/** Weapon kind in a hero's hand: none = fists, an old class weapon = the class's own kind. */
export function weaponType(cls: string, weaponId?: string): WeaponType {
  if (!weaponId) return "fists";
  const d = gearDef(weaponId);
  if (!d || d.slot !== "weapon") return "fists";
  return d.wtype ?? NATIVE_WEAPON[(d.cls ?? cls) as ClassKind] ?? "sword";
}
/** Magic weapons (staves, wands, the Songweaver's lute) hit with Magic; everything else with Strength. */
export const weaponStat = (t: WeaponType): "mag" | "str" => (t === "staff" || t === "wand" || t === "lute" ? "mag" : "str");

const G = (d: GearDef) => d;
export const GEAR: Record<string, GearDef> = Object.fromEntries([
  G({ id: "w_bronze", slot: "weapon", tier: 1, name: "Bronze", bonus: { atk: 2 }, color: 0xcd7f32, accent: 0xffd08a, style: "plain" }),
  G({ id: "w_frost", slot: "weapon", tier: 2, name: "Frost", bonus: { atk: 4, mag: 1 }, elem: { el: "cold", share: 0.4 }, color: 0x7fd8ff, accent: 0xe8fbff, style: "plain" }),
  G({ id: "w_dragon", slot: "weapon", tier: 3, name: "Dragonfire", bonus: { atk: 7, str: 1 }, elem: { el: "fire", share: 0.5 }, color: 0xff5a1f, accent: 0xffc247, style: "glow" }),
  // Long weapons: more reach (bigger melee arc, longer shots) for a bit less attack
  G({ id: "w_ash", slot: "weapon", tier: 1, name: "Ashwood Long", bonus: { atk: 1, reach: 0.25 }, color: 0xa87444, accent: 0xe0b98a, style: "long" }),
  G({ id: "w_long", slot: "weapon", tier: 2, name: "Longreach", bonus: { atk: 3, reach: 0.4 }, color: 0xc8d6e0, accent: 0x4cc9f0, style: "long" }),
  G({ id: "w_sky", slot: "weapon", tier: 3, name: "Skyreach", bonus: { atk: 5, reach: 0.6 }, elem: { el: "faith", share: 0.4 }, color: 0xffd166, accent: 0xfff3b0, style: "longglow" }),
  G({ id: "sh_wood", slot: "shield", tier: 1, name: "Wooden Shield", bonus: { sta: 1, block: 0.05 }, color: 0x9a6634, accent: 0x6f7883, style: "round" }),
  G({ id: "sh_iron", slot: "shield", tier: 2, name: "Iron Shield", bonus: { sta: 2, block: 0.1, coldRes: 10 }, color: 0xa3acb6, accent: 0x5a626c, style: "kite" }),
  G({ id: "sh_dragon", slot: "shield", tier: 3, name: "Dragon Shield", bonus: { sta: 4, block: 0.15, fireRes: 20 }, color: 0xb3262e, accent: 0xf2c14e, style: "kite" }),
  G({ id: "r_sling", slot: "ranged", tier: 1, name: "Sling", bonus: {}, color: 0x8a5a32, accent: 0xc89b6a, style: "sling",
    shot: { damage: 10, range: 120, speed: 200, cooldownMs: 1100, kind: "stone" } }),
  G({ id: "r_knives", slot: "ranged", tier: 2, name: "Throwing Knives", bonus: { str: 1, dex: 1 }, color: 0xc9cdd6, accent: 0x6b4226, style: "knives",
    shot: { damage: 16, range: 140, speed: 240, cooldownMs: 850, kind: "knife" } }),
  G({ id: "r_crossbow", slot: "ranged", tier: 3, name: "Crossbow", bonus: { str: 1, sta: 1 }, color: 0x6b4423, accent: 0xb0bec5, style: "crossbow",
    shot: { damage: 28, range: 190, speed: 280, cooldownMs: 1400, kind: "bolt" } }),
  G({ id: "a_leather", slot: "armour", tier: 1, name: "Leather Vest", bonus: { sta: 2 }, color: 0x8a5a32, accent: 0xc89b6a, style: "plain" }),
  G({ id: "a_chain", slot: "armour", tier: 2, name: "Chainmail", bonus: { sta: 4, str: 1 }, color: 0xa7b6c8, accent: 0x5c6878, style: "mail" }),
  G({ id: "a_royal", slot: "armour", tier: 3, name: "Royal Plate", bonus: { sta: 7, str: 1, mag: 1, fireRes: 10, coldRes: 10 }, color: 0xb3262e, accent: 0xf2c14e, style: "trim" }),
  G({ id: "s_leather", slot: "shoes", tier: 1, name: "Leather Boots", bonus: { speed: 0.05 }, color: 0x6b4423, accent: 0xa0703f, style: "plain" }),
  G({ id: "s_swift", slot: "shoes", tier: 2, name: "Swift Boots", bonus: { speed: 0.1, sta: 1, dex: 1 }, color: 0x2e9b5a, accent: 0xa8f0b0, style: "plain" }),
  G({ id: "s_winged", slot: "shoes", tier: 3, name: "Winged Boots", bonus: { speed: 0.15, sta: 2 }, color: 0xf0eee6, accent: 0xf2c14e, style: "wings" }),
  G({ id: "h_cap", slot: "hat", tier: 1, name: "Feather Cap", bonus: { mag: 1, sta: 1, dex: 1, poisonRes: 10 }, color: 0x3f7d3a, accent: 0xe63946, style: "cap" }),
  G({ id: "h_helm", slot: "hat", tier: 2, name: "Iron Helm", bonus: { sta: 3, str: 1 }, color: 0x9aa3ad, accent: 0x5a626c, style: "helm" }),
  G({ id: "h_crown", slot: "hat", tier: 3, name: "Golden Crown", bonus: { sta: 2, str: 2, mag: 3, faithRes: 15 }, color: 0xf2c14e, accent: 0xe63946, style: "crown" }),
  // Typed weapons: they change how any hero attacks (an archer with a sword fights in melee, a knight with a bow shoots)
  G({ id: "wb_hunt", slot: "weapon", tier: 1, wtype: "bow", name: "Hunting Bow", bonus: { atk: 2 }, color: 0x8a5a32, accent: 0xe9e2d0, style: "bow" }),
  G({ id: "wb_recurve", slot: "weapon", tier: 2, wtype: "bow", name: "Recurve Bow", bonus: { atk: 4, dex: 1 }, color: 0x4a2e1c, accent: 0xd9a93a, style: "bow" }),
  G({ id: "ws_arming", slot: "weapon", tier: 1, wtype: "sword", name: "Arming Sword", bonus: { atk: 2 }, color: 0xb9c2cc, accent: 0x8a5a32, style: "plain" }),
  G({ id: "ws_bastard", slot: "weapon", tier: 2, wtype: "sword", name: "Bastard Sword", bonus: { atk: 4, sta: 1 }, color: 0xd6dde4, accent: 0xd9a93a, style: "plain" }),
  G({ id: "wx_hand", slot: "weapon", tier: 1, wtype: "axe", name: "Hand Axe", bonus: { atk: 2 }, color: 0x8a939b, accent: 0x6b4226, style: "axe" }),
  G({ id: "wk_tanto", slot: "weapon", tier: 2, wtype: "katana", name: "Wanderer's Katana", bonus: { atk: 3, dex: 1 }, color: 0xc9cdd6, accent: 0x8a2230, style: "plain" }),
  G({ id: "wf_oak", slot: "weapon", tier: 1, wtype: "staff", name: "Oak Staff", bonus: { atk: 2 }, color: 0x7a4f2a, accent: 0x9be8ff, style: "long" }),
  G({ id: "ww_ash", slot: "weapon", tier: 1, wtype: "wand", name: "Ash Wand", bonus: { atk: 2 }, elem: { el: "cold", share: 0.25 }, color: 0xb08a5a, accent: 0x9be8ff, style: "wand" }),
  G({ id: "ww_bone", slot: "weapon", tier: 2, wtype: "wand", name: "Bone Wand", bonus: { atk: 4, mag: 1 }, elem: { el: "poison", share: 0.4 }, color: 0xe6dcc0, accent: 0x9bdc4a, style: "wand" }),
  G({ id: "ww_star", slot: "weapon", tier: 3, wtype: "wand", name: "Starfire Wand", bonus: { atk: 7, mag: 1 }, elem: { el: "faith", share: 0.4 }, color: 0x3a2a4a, accent: 0xffc247, style: "wand" }),
  // Elemental weapons of the first zone (Tier I: one element, at most half the hit)
  G({ id: "ws_pilgrim", slot: "weapon", tier: 1, wtype: "sword", name: "Pilgrim's Sword", bonus: { atk: 2 }, elem: { el: "faith", share: 0.3 }, color: 0xd8d2c0, accent: 0xf2d27a, style: "plain" }),
  G({ id: "wx_ember", slot: "weapon", tier: 2, wtype: "axe", name: "Ember Axe", bonus: { atk: 4 }, elem: { el: "fire", share: 0.35 }, color: 0x8a7064, accent: 0xff8a3c, style: "axe" }),
  G({ id: "wb_thorn", slot: "weapon", tier: 2, wtype: "bow", name: "Thornbow", bonus: { atk: 4 }, elem: { el: "poison", share: 0.4 }, color: 0x3e4a26, accent: 0x9bdc4a, style: "bow" }),
  // Books (DI-2, shield slot, any class): a poor shield, but a Songweaver's full song gauge fires the book's gift
  // (GearDef.book.full, shared/skills.ts FINISHERS). Colours match tools/art/paint/books.ts BOOKS.
  G({ id: "bk_hymnal", slot: "shield", tier: 2, name: "Hymnal", bonus: { mag: 2, sta: 1, block: 0.03 }, req: "mag", book: { full: "sg_g_bless" }, color: 0xf1e9d0, accent: 0xe0a82c, style: "book" }),
  G({ id: "bk_march", slot: "shield", tier: 2, name: "War March", bonus: { mag: 2, sta: 1, block: 0.03 }, req: "mag", book: { full: "sg_g_rally" }, color: 0xa8402a, accent: 0xd9a93a, style: "book" }),
  G({ id: "bk_dissonance", slot: "shield", tier: 2, name: "Dissonance", bonus: { mag: 3, block: 0.02 }, req: "mag", book: { full: "sg_g_cacoph" }, color: 0x5a2a8c, accent: 0xb890f0, style: "book" }),
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
    k("vampire", "weapon", "Bloodletter", 0x8e96a6, 0x9e1b2c, "plain"),
    k("vampire", "armour", "Nightcoat", 0x2a1520, 0xb08a3a, "trim"),
    k("vampire", "hat", "Night Circlet", 0x4a4650, 0xc0182a, "crown"),
    k("vampire", "shoes", "Riding Boots", 0x1e1418, 0x5a3a2a, "plain"),
    k("summoner", "weapon", "Binding Rod", 0x6b4a2e, 0xb68cff, "long"),
    k("summoner", "armour", "Warlock's Tailcoat", 0x38323f, 0x9a6cff, "tailcoat"),
    k("summoner", "hat", "Void Scarf", 0x5b2f8f, 0xc8a8ff, "scarf"),
    k("summoner", "shoes", "Warlock's Boots", 0x1e1a24, 0x5a3a6a, "plain"),
    // the Songweaver's minstrel kit (art: tools/art/paint/look.ts KITS.songweaver)
    // the evolving lute (DI-5, shared/lute.ts): its level follows hers, Wren fits its traits; it never leaves her
    { ...k("songweaver", "weapon", "Minstrel's", 0x8a5a2c, 0xe8d070, "lute"), bound: true },
    k("songweaver", "armour", "Minstrel's Doublet", 0xd09a34, 0xa8402a, "trim"),
    k("songweaver", "hat", "Feathered Cap", 0x2e7d74, 0xd9482f, "cap"),
    k("songweaver", "shoes", "Minstrel's Boots", 0x4e3220, 0x8a5a2c, "plain"),
    // the Songbook (DI-3): no stats, its full-gauge effect is the Refrain
    { ...k("songweaver", "shield", "Songbook", 0x6b3a22, 0xe8d070, "book"), book: { full: "sg_g_refrain", songs: true }, bound: true },
  ];
}

/** The class's starting kit, slot -> item id. */
export function starterKit(cls: string): Equipped {
  const out: Equipped = {};
  for (const id of GEAR_IDS) if (GEAR[id].cls === cls) out[GEAR[id].slot] = id;
  return out;
}

/** Class kits only fit their own class; everything else fits anyone, except the Songweaver's musical-only rule (wearProblem). */
export function canWear(cls: string, id: string): boolean {
  return !wearProblem(cls, id);
}

/** Is this item the Songweaver's lute (any level, any traits, any runes)? */
export const isLute = (id: string | undefined): boolean => !!id && baseId(id) === LUTE_ID;
/** Is it a book (DI-2: the Songbook and the found books)? */
export const isBook = (id: string | undefined): boolean => !!id && !!gearDef(id)?.book;

/**
 * Why this class can't wear the item at all ("" = it can; level and stat needs are reqProblem). Class kits fit only
 * their class. DI-5: a Songweaver's weapon slot takes her lute only and her shield slot books only; her ranged slot
 * stays open, and other classes may wear books.
 */
export function wearProblem(cls: string, id: string): string {
  const d = gearDef(id);
  if (!d) return "Not an item";
  if (d.cls && d.cls !== cls) return `Only a ${d.cls} can wear this`;
  if (cls === "songweaver" && d.slot === "weapon" && !isLute(id)) return NOT_LUTE;
  if (cls === "songweaver" && d.slot === "shield" && !d.book) return NOT_BOOK;
  return "";
}
/** The Songweaver's refusals (docs/songweaver-di-content.md section 5). */
export const NOT_LUTE = "That is not a musical instrument. A minstrel plays a lute.";
export const NOT_BOOK = "A minstrel carries a book, not a shield.";

/** Bound items (her lute, the Songbook): kept by their hero (keepsBound says when a spare may go). Runes and affixes don't change it. */
export const isBound = (id: string | undefined): boolean => !!id && !!gearDef(id)?.bound;
/**
 * Must this bound item stay with this hero? Only a Songweaver's last one of its kind (same base id: her lute, her
 * Songbook) among what she carries (`carried`: worn gear and bag, the item included). A spare (a second lute from a
 * save migration, a copy in another class's bag) is a plain item: it can be stashed, sold, traded, dropped and broken,
 * so a bound duplicate never becomes a dead bag slot.
 */
export function keepsBound(cls: string, id: string | undefined, carried: Iterable<string | undefined>): boolean {
  if (!id || !isBound(id) || cls !== "songweaver") return false;
  const b = baseId(id);
  let n = 0;
  for (const v of carried) if (v && baseId(v) === b) n++;
  return n <= 1;
}
/**
 * keepsBound for items leaving one after another (a batch drop, a trade offer): `gone` are the bag items already let
 * go, so two spares can leave but never her last one.
 */
export function keepsBoundOf(cls: string, worn: (string | undefined)[], bag: readonly string[]) {
  return (id: string | undefined, gone: readonly string[] = []): boolean => {
    const left = [...bag];
    for (const g of gone) { const k = left.indexOf(g); if (k >= 0) left.splice(k, 1); }
    return keepsBound(cls, id, [...worn, ...left]);
  };
}

export const BAG_SIZE = 24;
/** Base item grade (Bronze < Frost < Dragonfire). The item's colour comes from its rarity (RARITY_NAMES). */
export const TIER_NAMES = ["", "Basic", "Fine", "Superior"];

/** Chance a monster drops a piece of gear, and the odds of tier 1/2/3. */
export const GEAR_DROP: Record<MobKind, { chance: number; tiers: [number, number, number] }> = {
  golem_fire: { chance: 0, tiers: [1, 0, 0] }, golem_cold: { chance: 0, tiers: [1, 0, 0] },
  golem_poison: { chance: 0, tiers: [1, 0, 0] }, golem_shock: { chance: 0, tiers: [1, 0, 0] }, golem_colossus: { chance: 0, tiers: [1, 0, 0] },
  bride: { chance: 0, tiers: [1, 0, 0] },
  wisp: { chance: 0, tiers: [1, 0, 0] },
  slime: { chance: 0.06, tiers: [0.85, 0.15, 0] },
  skeleton: { chance: 0.15, tiers: [0.5, 0.38, 0.12] },
  crawler: { chance: 0.02, tiers: [1, 0, 0] },
  demon: { chance: 0.8, tiers: [0.05, 0.45, 0.5] },
  motherblob: { chance: 0.25, tiers: [0.45, 0.4, 0.15] },
  blobling: { chance: 0.01, tiers: [1, 0, 0] },
  shooterblob: { chance: 0.08, tiers: [0.75, 0.22, 0.03] },
  warriorblob: { chance: 0.12, tiers: [0.6, 0.32, 0.08] },
  healerblob: { chance: 0.1, tiers: [0.7, 0.25, 0.05] },
  venomblob: { chance: 0.15, tiers: [0.4, 0.42, 0.18] },
  frostblob: { chance: 0.16, tiers: [0.35, 0.45, 0.2] },
  fireblob: { chance: 0.16, tiers: [0.3, 0.45, 0.25] },
  stormblob: { chance: 0.17, tiers: [0.25, 0.45, 0.3] },
  bandit: { chance: 0.18, tiers: [0.45, 0.4, 0.15] },
  skeletonmage: { chance: 0.16, tiers: [0.5, 0.38, 0.12] },
  necromancer: { chance: 0.75, tiers: [0.1, 0.5, 0.4] },
  banditchief: { chance: 1, tiers: [0, 0.45, 0.55] },
  hollowking: { chance: 1, tiers: [0, 0.2, 0.8] },
  gnawkin: { chance: 0.12, tiers: [0.35, 0.45, 0.2] },
  tuskborn: { chance: 0.18, tiers: [0.25, 0.45, 0.3] },
  silkwretch: { chance: 0.16, tiers: [0.3, 0.45, 0.25] },
  duskwing: { chance: 0.16, tiers: [0.3, 0.45, 0.25] },
  crowseer: { chance: 0.18, tiers: [0.3, 0.45, 0.25] },
  gnasher: { chance: 0.85, tiers: [0, 0.5, 0.5] },
  weaver: { chance: 0.85, tiers: [0, 0.5, 0.5] },
  packlord: { chance: 0.9, tiers: [0, 0.45, 0.55] },
  hornbrute: { chance: 0.9, tiers: [0, 0.4, 0.6] },
  hidemother: { chance: 1, tiers: [0, 0.25, 0.75] },
  nomad: { chance: 0.18, tiers: [0.25, 0.45, 0.3] },
  scorpion: { chance: 0.16, tiers: [0.25, 0.45, 0.3] },
  sanddead: { chance: 0.18, tiers: [0.2, 0.45, 0.35] },
  veiled: { chance: 0.2, tiers: [0.2, 0.45, 0.35] },
  camelfolk: { chance: 0.22, tiers: [0.15, 0.45, 0.4] },
  sphinx: { chance: 0.24, tiers: [0.12, 0.45, 0.43] },
  sunwright: { chance: 1, tiers: [0, 0.2, 0.8] },
  nightraider: { chance: 1, tiers: [0, 0.35, 0.65] },
  trooper: { chance: 0, tiers: [1, 0, 0] },
  // Act 3, the moors (Lv 20-35): like the Mawdeep's beast-folk and Act 2's regulars; the elite and the boss like Act 1's
  wight: { chance: 0.17, tiers: [0.25, 0.45, 0.3] },
  boghag: { chance: 0.17, tiers: [0.25, 0.45, 0.3] },
  bonehound: { chance: 0.13, tiers: [0.3, 0.45, 0.25] },
  mistwraith: { chance: 0.17, tiers: [0.25, 0.45, 0.3] },
  legionary: { chance: 0.2, tiers: [0.2, 0.45, 0.35] },
  cairnlord: { chance: 0.9, tiers: [0, 0.45, 0.55] },
  barrowking: { chance: 1, tiers: [0, 0.25, 0.75] },
  // Act 4, the badlands (Lv 25-40): like the moors' regulars (beasts a little less); the captain and Old Rourke like the
  // moors' elite and boss
  outrider: { chance: 0.18, tiers: [0.25, 0.45, 0.3] },
  crossbowman: { chance: 0.18, tiers: [0.25, 0.45, 0.3] },
  firebrand: { chance: 0.18, tiers: [0.25, 0.45, 0.3] },
  warhound: { chance: 0.12, tiers: [0.3, 0.45, 0.25] },
  vulture: { chance: 0.12, tiers: [0.3, 0.45, 0.25] },
  rattler: { chance: 0.12, tiers: [0.3, 0.45, 0.25] },
  redcaptain: { chance: 0.9, tiers: [0, 0.45, 0.55] },
  rourke: { chance: 1, tiers: [0, 0.25, 0.75] },
  // Act 5, the sinkholes (Lv 30-45): like the badlands' regulars (packs and worms a little less); the Chieftain and the
  // Maw-Father like the badlands' elite and boss
  delver: { chance: 0.18, tiers: [0.25, 0.45, 0.3] },
  cackler: { chance: 0.12, tiers: [0.3, 0.45, 0.25] },
  stagkin: { chance: 0.18, tiers: [0.25, 0.45, 0.3] },
  quillback: { chance: 0.18, tiers: [0.25, 0.45, 0.3] },
  stitcher: { chance: 0.18, tiers: [0.25, 0.45, 0.3] },
  sinkworm: { chance: 0.12, tiers: [0.3, 0.45, 0.25] },
  hidechief: { chance: 0.9, tiers: [0, 0.45, 0.55] },
  mawfather: { chance: 1, tiers: [0, 0.25, 0.75] },
  // Act 6, the Crown (Lv 40-50): the endgame's regulars drop a little more and better; the Thronewarden like an elite,
  // the Riven King always a top-tier piece most of the time
  oathbreaker: { chance: 0.2, tiers: [0.2, 0.45, 0.35] },
  crownguard: { chance: 0.2, tiers: [0.2, 0.45, 0.35] },
  hollowherald: { chance: 0.2, tiers: [0.2, 0.45, 0.35] },
  gildhound: { chance: 0.13, tiers: [0.25, 0.45, 0.3] },
  courtmagus: { chance: 0.2, tiers: [0.2, 0.45, 0.35] },
  crowncrow: { chance: 0.13, tiers: [0.25, 0.45, 0.3] },
  pretender: { chance: 0.22, tiers: [0.2, 0.45, 0.35] },
  thronewarden: { chance: 0.9, tiers: [0, 0.4, 0.6] },
  rivenking: { chance: 1, tiers: [0, 0.2, 0.8] },
};

export function isGearId(v: unknown): v is string {
  if (typeof v !== "string") return false;
  // Runes set in the item (shared/runes.ts): they must fit its sockets, the rest of the id is checked as usual
  if (v.includes("^")) {
    const bare = stripRunes(v), runes = itemRunes(v);
    if (!runes.length || runes.length > socketsOf(bare) || withRunes(bare, runes) !== v) return false;
    if (runes.some((r) => !runeFits(bare, r))) return false;
    return isGearId(bare);
  }
  // The lute's traits (shared/lute.ts): one per group, written in group order
  const t = v.indexOf("#");
  if (t >= 0) {
    const head = v.slice(0, t), traits = luteTraits(v);
    return isLute(head) && isGearId(head) && traits.length > 0 && withTraits(head, traits) === v;
  }
  const base = baseId(v);
  if (!(base in GEAR)) return false;
  const plain = withLevel(base, itemLevel(v));
  if (plain === v) return true;
  // With random bonuses: they must be valid for this item and written the canonical way
  if (GEAR[base].cls || plainId(v) !== plain) return false;
  const r = itemRarity(v), aff = itemAffixes(v);
  if (r === 0 || aff.length < RARITY_AFFIXES[r][0] || aff.length > RARITY_AFFIXES[r][1]) return false;
  const lvl = itemLevel(v), slot = GEAR[base].slot;
  if (new Set(aff.map((a) => a.key)).size !== aff.length) return false;
  if (aff.some((a) => !affixFits(a.key, slot) || a.value < 1 || a.value > affixMax(a.key, lvl, r))) return false;
  return withAffixes(plain, r, aff) === v;
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
  return rollAffixes(withLevel(pool[Math.floor(rnd() * pool.length)], level), BOSS_LUCK[kind] ?? 1, rnd);
}

/** Bosses roll better rarities (multiplies the Magic/Rare/Legendary odds). */
export const BOSS_LUCK: Partial<Record<MobKind, number>> = { demon: 3, necromancer: 2.5, banditchief: 3, motherblob: 2, hollowking: 5, nightraider: 4 };

export type Equipped = Partial<Record<GearSlot, string>>;

/** Stat points added by the equipped items. Weapon `atk` goes to the class's attack stat. */
export function gearStats(cls: string, eq: Equipped): Stats {
  const out: Stats = { sta: 0, str: 0, mag: 0, dex: 0 };
  const clsStat = (STATS as Record<string, { attackStat: keyof Stats }>)[cls]?.attackStat ?? "str";
  for (const s of GEAR_SLOTS) {
    const b = eq[s] ? gearDef(eq[s]!)?.bonus : undefined;
    if (!b) continue;
    out.sta += b.sta ?? 0; out.str += b.str ?? 0; out.mag += b.mag ?? 0; out.dex += b.dex ?? 0;
    // a weapon's attack goes to the stat it hits with (a wand: Magic, a sword: Strength), anything else to the class's
    const atkStat = s === "weapon" ? weaponStat(weaponType(cls, eq.weapon)) : clsStat;
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


/**
 * Display name; old class weapons take the hero's weapon type ("Frost Katana"), typed weapons keep their own name.
 * A generic weapon is never a "Lute" (only her kit lute is): its item icon is drawn as a sword (tools/art/gear.ts), so a
 * Songweaver sees "Bronze Sword". Naming only: weaponType still answers "lute" for the combat code.
 */
export function gearName(id: string, cls?: string): string {
  const d = gearDef(id);
  if (!d) return id;
  const wt = cls ? weaponType(cls, id) : undefined, shown = wt === "lute" && !d.cls ? "sword" : wt;
  const name = d.slot === "weapon" && !d.wtype ? `${d.name} ${shown ? WEAPON_TYPE_NAMES[shown] : "Weapon"}` : d.name;
  const aff = itemAffixes(id);
  if (!aff.length) return name;
  // Strongest bonus gives the first word, the next one the "of ..." ending
  const top = [...aff].sort((a, b) => b.value / affixMax(b.key, itemLevel(id), 3) - a.value / affixMax(a.key, itemLevel(id), 3));
  const pre = AFFIXES[top[0].key].prefix;
  const suf = top[1] ? ` ${AFFIXES[top[1].key].suffix}` : "";
  return `${pre} ${name}${suf}`;
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
  for (const e of ELEMENTS) if (b[DMG_KEY[e]]) parts.push(`+${b[DMG_KEY[e]]} ${ELEMENT_NAMES[e]} damage`);
  for (const e of ELEMENTS) if (b[RES_KEY[e]]) parts.push(`${ELEMENT_NAMES[e]} resist ${b[RES_KEY[e]]}%`);
  return parts.join(", ");
}

/** Full description of an item: bonuses, plus damage/range for ranged weapons. */
export function itemText(id: string): string {
  const d = gearDef(id);
  if (!d) return "";
  const kind = d.wtype ? `${WEAPON_TYPE_NAMES[d.wtype]}: ${WEAPON_USE[d.wtype]}` : "";
  if (d.cls && !d.shot && !Object.keys(d.bonus).length) return "Starting gear";
  const shot = d.shot ? `${d.shot.damage} dmg, range ${d.shot.range}, every ${(d.shot.cooldownMs / 1000).toFixed(1)}s [${RANGED_KEY}]` : "";
  const elem = d.elem ? `${Math.round(d.elem.share * 100)}% ${ELEMENT_NAMES[d.elem.el]}: ${ELEMENT_EFFECT[d.elem.el]}` : "";
  return [kind, elem, shot, bonusText(d.bonus)].filter(Boolean).join(", ");
}

// ---- Item levels and requirements ----------------------------------------------------------------------
/**
 * Every found item has an item level (1..MAX_LEVEL), written after the base id: "w_frost@17" (level 1 = plain id,
 * class kits are always level 1). Drops and chests roll at the monster / chest level, shops sell set levels.
 * Bonuses grow with the level, and so do the requirements to wear it: the hero's level and points in one stat
 * (class base + points placed, gear does not count). Higher levels also look stronger on the hero (client/src/gearfx.ts).
 */
export const ITEM_MAX_LEVEL = MAX_LEVEL;
/** Whole-number bonuses (stats, attack, shot damage) grow this much per item level above 1 (Lv 30 = x2.3, Lv 50 = x3.2). */
export const ILVL_GROWTH = 0.045;
/** Fraction bonuses (speed, reach, block) grow more gently (Lv 30 = x1.44, Lv 50 = x1.74). */
export const ILVL_GROWTH_FRAC = 0.015;
/** Stat points needed per item level, by tier (Common, Rare, Epic). */
export const REQ_PER_LEVEL = [0, 0.35, 0.5, 0.65];
/** The stat each slot asks for. Weapons ask for the class's attack stat (Strength, or Magic for the Wizard). */
export const REQ_STAT: Record<GearSlot, StatKind | "attack"> = { weapon: "attack", ranged: "dex", shield: "str", armour: "sta", hat: "sta", shoes: "dex" };

/** The id without its random bonuses and lute traits ("w_frost@17~R:atk3,dex2" -> "w_frost@17", "songweaver_weapon@9#gut" -> "songweaver_weapon@9"). */
export function plainId(id: string): string {
  id = stripRunes(id);
  const k = id.search(/[~#]/);
  return k < 0 ? id : id.slice(0, k);
}

export function baseId(id: string): string {
  const p = plainId(id);
  const k = p.indexOf("@");
  return k < 0 ? p : p.slice(0, k);
}

export function itemLevel(id: string): number {
  const p = plainId(id);
  const k = p.indexOf("@");
  if (k < 0) return 1;
  const n = Number(p.slice(k + 1));
  return Number.isInteger(n) ? Math.min(ITEM_MAX_LEVEL, Math.max(1, n)) : 1;
}

/** Item id for a base item at a level (class kits and level 1 keep the plain id; the lute is the one kit item with levels). */
export function withLevel(base: string, level: number): string {
  const b = baseId(base);
  const l = Math.min(ITEM_MAX_LEVEL, Math.max(1, Math.round(level)));
  return l <= 1 || (GEAR[b]?.cls && b !== LUTE_ID) ? b : `${b}@${l}`;
}

const growInt = (v: number | undefined, l: number) => (v ? Math.round(v * (1 + ILVL_GROWTH * (l - 1))) : v);
const growFrac = (v: number | undefined, l: number) => (v ? Math.round(v * (1 + ILVL_GROWTH_FRAC * (l - 1)) * 1000) / 1000 : v);

const growPct = (v: number | undefined, l: number) => (v ? Math.round(v * (1 + ILVL_GROWTH_FRAC * (l - 1))) : v);

const defCache = new Map<string, GearDef>();
/** Item definition with its bonuses scaled to the item level. `id` is the full id; art and icons use baseId(id). */
export function gearDef(id: string): GearDef | undefined {
  const hit = defCache.get(id);
  if (hit) return hit;
  if (id.includes("^")) { // set runes don't change the bonuses (they fire in combat, shared/runes.ts)
    const bare = gearDef(stripRunes(id));
    if (!bare) return undefined;
    const out = { ...bare, id };
    defCache.set(id, out);
    return out;
  }
  const d = GEAR[baseId(id)];
  if (!d) return undefined;
  const l = itemLevel(id);
  if (d.id === LUTE_ID) { // the lute's stats come from its stage (shared/lute.ts LUTE_STAGES), not from item-level growth
    const st = luteAt(l), out: GearDef = { ...d, id, name: st.name, bonus: { ...st.bonus } };
    defCache.set(id, out);
    return out;
  }
  const affixes = itemAffixes(id);
  if (l <= 1 && !affixes.length) return d;
  const b = d.bonus;
  const bonus: GearBonus = Object.fromEntries(Object.entries({
    atk: growInt(b.atk, l), sta: growInt(b.sta, l), str: growInt(b.str, l), mag: growInt(b.mag, l), dex: growInt(b.dex, l),
    speed: growFrac(b.speed, l), reach: growFrac(b.reach, l), block: growFrac(b.block, l),
    fireDmg: growInt(b.fireDmg, l), coldDmg: growInt(b.coldDmg, l), poisonDmg: growInt(b.poisonDmg, l), faithDmg: growInt(b.faithDmg, l), shockDmg: growInt(b.shockDmg, l),
    // resistances grow gently, like the other percent bonuses
    fireRes: growPct(b.fireRes, l), coldRes: growPct(b.coldRes, l), poisonRes: growPct(b.poisonRes, l), faithRes: growPct(b.faithRes, l), shockRes: growPct(b.shockRes, l),
  }).filter(([, v]) => v !== undefined));
  // Random bonuses add on top of the base item's
  for (const a of affixes) {
    const key = AFFIXES[a.key].bonus;
    const add = a.key === "spd" ? a.value / 100 : a.value;
    bonus[key] = Math.round(((bonus[key] ?? 0) + add) * 1000) / 1000;
  }
  const out: GearDef = { ...d, id, bonus, shot: d.shot && { ...d.shot, damage: growInt(d.shot.damage, l)! } };
  defCache.set(id, out);
  return out;
}

export interface GearReq { level: number; stat: StatKind; points: number }

/** What a hero of this class needs to wear the item. */
export function gearReq(id: string, cls: string): GearReq {
  const d = gearDef(id), l = itemLevel(id);
  const slot = d?.slot ?? "weapon";
  const want = d?.req ?? REQ_STAT[slot];
  const stat: StatKind = want === "attack" ? (STATS as Record<string, { attackStat: StatKind }>)[cls]?.attackStat ?? "str" : want;
  if (!d || d.cls || l <= 1) return { level: 1, stat, points: 0 };
  return { level: l, stat, points: Math.round(l * REQ_PER_LEVEL[d.tier]) };
}

/**
 * A hero's level, own stat points (class base + points placed) and the items worn. The stat a requirement asks for
 * counts the hero's own points plus what the OTHER worn pieces give (the number shown in the hero menu), never the
 * item itself or the piece it replaces, so two items can't hold each other up.
 */
export interface HeroReqInfo { cls: string; level: number; pts: Partial<Stats>; worn?: Equipped }

export function ownStats(h: HeroReqInfo): Stats {
  return statsFor(h.cls as ClassKind, h.pts);
}

/** Own stats plus the stats of the worn pieces in `eq`. */
function statsWith(h: HeroReqInfo, eq: Equipped): Stats {
  const s = ownStats(h), g = gearStats(h.cls, eq);
  return { sta: s.sta + g.sta, str: s.str + g.str, mag: s.mag + g.mag, dex: s.dex + g.dex };
}

/**
 * A hero's Stamina/Strength/Magic/Dexterity: class base, assigned points and the worn pieces whose requirements are met.
 * The server and the client both call it, so the four stats need no synced fields (Player.sta... are server-only).
 */
export function heroStats(h: HeroReqInfo): Stats {
  return statsWith(h, activeGear(h.worn ?? {}, h));
}

function problemWith(id: string, h: HeroReqInfo, st: Stats): string {
  const r = gearReq(id, h.cls);
  const miss: string[] = [];
  if (h.level < r.level) miss.push(`Lv ${r.level}`);
  if (r.points && st[r.stat] < r.points) miss.push(`${r.points} ${STAT_LABEL[r.stat]} (you: ${st[r.stat]})`);
  return miss.length ? `Needs ${miss.join(" and ")}` : "";
}

/** Why the hero can't wear the item yet ("Needs Lv 12", "Needs 9 Strength"), or "" when they can. */
export function reqProblem(id: string, h: HeroReqInfo): string {
  const slot = gearDef(id)?.slot;
  const others: Equipped = { ...(h.worn ?? {}) };
  if (slot) delete others[slot];
  return problemWith(id, h, statsWith(h, activeGear(others, h)));
}

export const meetsReq = (id: string, h: HeroReqInfo) => !reqProblem(id, h);

/**
 * The worn items that count: a piece whose requirements are not met gives nothing. Pieces are switched on one by
 * one, each with the stats of the pieces already on (own points first), so no piece ever counts its own bonus.
 */
export function activeGear(eq: Equipped, h: HeroReqInfo): Equipped {
  const out: Equipped = {};
  for (let grew = true; grew;) {
    grew = false;
    const st = statsWith(h, out);
    for (const s of GEAR_SLOTS) if (eq[s] && !out[s] && !problemWith(eq[s]!, h, st)) { out[s] = eq[s]; grew = true; }
  }
  return out;
}

/** "Item Lv 17 · needs 11 Strength (you: 14)" line for menus; "you" counts own points + the other worn pieces. */
export function reqText(id: string, cls: string, h?: HeroReqInfo): string {
  const r = gearReq(id, cls);
  if (!r.points) return `Item Lv ${itemLevel(id)}`;
  let you = "";
  if (h) {
    const slot = gearDef(id)?.slot, others: Equipped = { ...(h.worn ?? {}) };
    if (slot) delete others[slot];
    you = ` (you: ${statsWith(h, activeGear(others, h))[r.stat]})`;
  }
  return `Item Lv ${itemLevel(id)} · needs ${r.points} ${STAT_LABEL[r.stat]}${you}`;
}

const STAT_LABEL: Record<StatKind, string> = { sta: "Stamina", str: "Strength", mag: "Magic", dex: "Dexterity" };

// ---- Rarity and random bonuses ----------------------------------------------------------------------------
/**
 * Found items roll a rarity: Plain (no extra bonuses), Magic (1-2), Rare (3) or Legendary (4, bigger rolls).
 * The random bonuses are written after the level: "w_frost@17~R:atk3,dex2,sta4" (M = Magic, R = Rare, L = Legendary).
 * gearDef() adds them to the item's bonus, gearName() names the item after the two strongest ("Cruel Frost Sword of the Bear").
 * Bonuses grow with the item level (affixMax). Shops sell Plain items only, class kits never roll.
 */
export type Rarity = 0 | 1 | 2 | 3;
export const RARITY_NAMES = ["Plain", "Magic", "Rare", "Legendary"];
const RARITY_CODE = ["", "M", "R", "L"];
/** Min and max number of random bonuses per rarity. */
export const RARITY_AFFIXES: [number, number][] = [[0, 0], [1, 2], [3, 3], [4, 4]];
/** Base odds of Magic, Rare and Legendary on a found item, and how much they grow per item level above 1. */
export const RARITY_ODDS = { magic: 0.3, rare: 0.07, legendary: 0.01, perLevel: { magic: 0.006, rare: 0.004, legendary: 0.0015 } };
/** Legendary bonuses roll this much higher. */
const LEGENDARY_BOOST = 1.5;

export type AffixKey = "atk" | "sta" | "str" | "mag" | "dex" | "spd" | "fdm" | "cdm" | "pdm" | "hdm" | "fre" | "cre" | "pre" | "hre" | "sdm" | "sre";
interface AffixDef { bonus: keyof GearBonus; prefix: string; suffix: string; base: number; perLevel: number; slots?: GearSlot[] }
export const AFFIXES: Record<AffixKey, AffixDef> = {
  atk: { bonus: "atk", prefix: "Cruel", suffix: "of Slaughter", base: 2, perLevel: 0.2 },
  sta: { bonus: "sta", prefix: "Sturdy", suffix: "of the Bear", base: 2, perLevel: 0.25 },
  str: { bonus: "str", prefix: "Mighty", suffix: "of the Ox", base: 2, perLevel: 0.2 },
  mag: { bonus: "mag", prefix: "Arcane", suffix: "of the Magi", base: 2, perLevel: 0.2 },
  dex: { bonus: "dex", prefix: "Keen", suffix: "of Precision", base: 2, perLevel: 0.2 },
  // percent move speed, shoes only
  spd: { bonus: "speed", prefix: "Swift", suffix: "of Haste", base: 3, perLevel: 0.15, slots: ["shoes"] },
  // elemental damage on weapons, flat per basic hit (shared/elements.ts)
  fdm: { bonus: "fireDmg", prefix: "Burning", suffix: "of Embers", base: 2, perLevel: 0.25, slots: ["weapon"] },
  cdm: { bonus: "coldDmg", prefix: "Frozen", suffix: "of Frost", base: 2, perLevel: 0.25, slots: ["weapon"] },
  pdm: { bonus: "poisonDmg", prefix: "Venomous", suffix: "of Venom", base: 2, perLevel: 0.25, slots: ["weapon"] },
  hdm: { bonus: "faithDmg", prefix: "Blessed", suffix: "of Faith", base: 2, perLevel: 0.25, slots: ["weapon"] },
  // resistances in percent on armour, shields and hats
  fre: { bonus: "fireRes", prefix: "Flameward", suffix: "of the Hearth", base: 6, perLevel: 0.5, slots: ["armour", "shield", "hat"] },
  cre: { bonus: "coldRes", prefix: "Furred", suffix: "of Warmth", base: 6, perLevel: 0.5, slots: ["armour", "shield", "hat"] },
  pre: { bonus: "poisonRes", prefix: "Purified", suffix: "of Remedy", base: 6, perLevel: 0.5, slots: ["armour", "shield", "hat"] },
  hre: { bonus: "faithRes", prefix: "Heathen", suffix: "of Heresy", base: 6, perLevel: 0.5, slots: ["armour", "shield", "hat"] },
  // Electric (Murat 2026-11-05): new keys go last so older item ids keep their affix order
  sdm: { bonus: "shockDmg", prefix: "Crackling", suffix: "of Storms", base: 2, perLevel: 0.25, slots: ["weapon"] },
  sre: { bonus: "shockRes", prefix: "Grounded", suffix: "of the Lodestone", base: 6, perLevel: 0.5, slots: ["armour", "shield", "hat"] },
};
export const AFFIX_KEYS = Object.keys(AFFIXES) as AffixKey[];
export interface Affix { key: AffixKey; value: number }

export const affixFits = (key: AffixKey, slot: GearSlot) => !AFFIXES[key].slots || AFFIXES[key].slots!.includes(slot);

/** Highest value a bonus can roll at this item level and rarity. */
export function affixMax(key: AffixKey, level: number, rarity: Rarity): number {
  const a = AFFIXES[key];
  return Math.floor((a.base + a.perLevel * (level - 1)) * (rarity === 3 ? LEGENDARY_BOOST : 1));
}

export function itemRarity(id: string): Rarity {
  id = stripRunes(id);
  const k = id.indexOf("~");
  if (k < 0) return 0;
  const r = RARITY_CODE.indexOf(id.charAt(k + 1));
  return (r > 0 ? r : 0) as Rarity;
}

export function itemAffixes(id: string): Affix[] {
  id = stripRunes(id);
  const k = id.indexOf("~");
  if (k < 0) return [];
  const body = id.slice(k + 3); // after "~R:"
  if (!body) return [];
  const out: Affix[] = [];
  for (const part of body.split(",")) {
    const m = /^([a-z]+)(\d+)$/.exec(part);
    if (!m || !(m[1] in AFFIXES)) continue;
    out.push({ key: m[1] as AffixKey, value: Number(m[2]) });
  }
  return out;
}

/** Item id with a rarity and bonuses ("w_frost@17" + Rare + [atk 3] -> "w_frost@17~R:atk3"). */
export function withAffixes(plain: string, rarity: Rarity, affixes: Affix[]): string {
  plain = stripRunes(plain);
  if (!rarity || !affixes.length) return plainId(plain);
  const sorted = [...affixes].sort((a, b) => AFFIX_KEYS.indexOf(a.key) - AFFIX_KEYS.indexOf(b.key));
  return `${plainId(plain)}~${RARITY_CODE[rarity]}:${sorted.map((a) => `${a.key}${a.value}`).join(",")}`;
}

/** Magic / Rare / Legendary odds for an item level (luck > 1 for bosses). */
export function rarityOdds(level: number, luck = 1): [number, number, number] {
  const n = Math.max(0, level - 1), O = RARITY_ODDS;
  return [
    Math.min(0.5, (O.magic + O.perLevel.magic * n) * luck),
    Math.min(0.3, (O.rare + O.perLevel.rare * n) * luck),
    Math.min(0.12, (O.legendary + O.perLevel.legendary * n) * luck),
  ];
}

/** Roll a rarity and random bonuses onto a plain found item. */
export function rollAffixes(plain: string, luck = 1, rnd = Math.random): string {
  const d = GEAR[baseId(plain)];
  if (!d || d.cls) return plain;
  const lvl = itemLevel(plain);
  const [magic, rare, leg] = rarityOdds(lvl, luck);
  const r = rnd();
  const rarity: Rarity = r < leg ? 3 : r < leg + rare ? 2 : r < leg + rare + magic ? 1 : 0;
  if (!rarity) return plainId(plain);
  const [lo, hi] = RARITY_AFFIXES[rarity];
  const count = lo + Math.floor(rnd() * (hi - lo + 1));
  const pool = AFFIX_KEYS.filter((k) => affixFits(k, d.slot));
  const out: Affix[] = [];
  while (out.length < count && pool.length) {
    const key = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    const max = affixMax(key, lvl, rarity);
    const min = Math.max(1, Math.ceil(max * (rarity === 3 ? 0.6 : 0.3)));
    out.push({ key, value: min + Math.floor(rnd() * (max - min + 1)) });
  }
  return withAffixes(plain, rarity, out);
}

/** One line per random bonus, for menus ("+3 attack", "+5% speed"). */
export function affixLines(id: string): string[] {
  return itemAffixes(id).map((a) => a.key === "spd" ? `+${a.value}% speed` : bonusText({ [AFFIXES[a.key].bonus]: a.value }));
}

// ---- Damage types (shared/elements.ts) -------------------------------------------------------------------
/** The elemental side of a weapon: the share of each hit it converts, and flat damage it adds per element. */
export function weaponElements(eq: Equipped): { conv?: { el: Element; share: number }; flat: Partial<Record<Element, number>> } {
  const d = eq.weapon ? gearDef(eq.weapon) : undefined;
  const flat: Partial<Record<Element, number>> = {};
  if (d) for (const e of ELEMENTS) { const v = d.bonus[DMG_KEY[e]]; if (v) flat[e] = v; }
  return { conv: d?.elem, flat };
}

/** Fraction of damage of this element the worn gear stops (capped at MAX_RESIST). */
export function gearResist(eq: Equipped, el: Element): number {
  let pct = 0;
  for (const s of GEAR_SLOTS) pct += (eq[s] ? gearDef(eq[s]!)?.bonus[RES_KEY[el]] : 0) ?? 0;
  return Math.min(MAX_RESIST, pct / 100);
}

/** The element an item shows (its effects and glow): the converted one, else its biggest elemental bonus. */
export function itemElement(id: string | undefined): Element | undefined {
  const d = id ? gearDef(id) : undefined;
  if (!d) return undefined;
  if (d.elem) return d.elem.el;
  let best: Element | undefined, v = 0;
  for (const e of ELEMENTS) {
    const x = (d.bonus[DMG_KEY[e]] ?? 0) * 4 + (d.bonus[RES_KEY[e]] ?? 0); // a damage point shows more than a resist point
    if (x > v) { v = x; best = e; }
  }
  return best;
}

/**
 * Split a hero's basic hit by damage type: `dmg` is the full hit; the weapon's converted share becomes its element and
 * the flat elemental bonuses are added on top (scaled like the hit: combo step and crit, `flatMult`).
 */
export function splitHit(eq: Equipped, dmg: number, flatMult = 1): { phys: number; parts: { el: Element; amt: number }[] } {
  const { conv, flat } = weaponElements(eq);
  const parts: { el: Element; amt: number }[] = [];
  let phys = dmg;
  if (conv) { const amt = dmg * conv.share; phys -= amt; parts.push({ el: conv.el, amt }); }
  for (const e of ELEMENTS) {
    const v = flat[e];
    if (!v) continue;
    const p = parts.find((x) => x.el === e), amt = v * flatMult;
    if (p) p.amt += amt; else parts.push({ el: e, amt });
  }
  return { phys: Math.max(1, Math.round(phys)), parts };
}

// ---- Runes set in items (shared/runes.ts) ----------------------------------------------------------------
/** The item id without its set runes ("w_frost@17~R:atk3^ember2" -> "w_frost@17~R:atk3"). */
export function stripRunes(id: string): string {
  const k = id.indexOf("^");
  return k < 0 ? id : id.slice(0, k);
}

/** The runes set in an item, in socket order. */
export function itemRunes(id: string): Rune[] {
  const k = id.indexOf("^");
  if (k < 0) return [];
  return id.slice(k + 1).split(".").map(parseRuneCode).filter((r): r is Rune => !!r);
}

/** Item id with these runes set (none = the bare id). */
export function withRunes(id: string, runes: Rune[]): string {
  const bare = stripRunes(id);
  return runes.length ? `${bare}^${runes.map(runeCode).join(".")}` : bare;
}

/** Rune sockets of an item: none on ranged weapons, two on Rare and Legendary items, one on the rest; the lute by its stage. */
export function socketsOf(id: string): number {
  const d = GEAR[baseId(id)];
  if (!d || d.slot === "ranged") return 0;
  if (d.id === LUTE_ID) return luteAt(itemLevel(id)).sockets;
  return itemRarity(id) >= 2 ? 2 : 1;
}

/** Weapon runes go in the main-hand weapon, armour runes in armour, shields, hats and shoes. */
export function runeFits(id: string, r: Rune): boolean {
  const d = GEAR[baseId(id)];
  if (!d || d.slot === "ranged") return false;
  return RUNES[r.key].kind === (d.slot === "weapon" ? "weapon" : "armour");
}

/** Why the rune can't go in this item ("No free socket"), or "" when it can. */
export function socketProblem(id: string, r: Rune): string {
  const d = GEAR[baseId(id)];
  if (!d) return "Not an item";
  if (!socketsOf(id)) return "This item has no rune socket";
  if (!runeFits(id, r)) return RUNES[r.key].kind === "weapon" ? "Weapon runes go in a weapon" : "Armour runes go in armour, shields, hats or shoes";
  if (itemRunes(id).length >= socketsOf(id)) return "No free socket: take a rune out first";
  return "";
}

/** The rune effects of the worn items that count (pass activeGear), merged by rune. */
export function runeEffects(eq: Equipped) {
  return mergeRunes(GEAR_SLOTS.flatMap((s) => (eq[s] ? itemRunes(eq[s]!) : [])));
}

/** Anything a bag can hold besides potions: a piece of gear or a loose rune. */
export const isBagItem = (v: unknown): v is string => isGearId(v) || isRuneId(v);

// ---- The evolving lute (DI-5, shared/lute.ts) ----------------------------------------------------------------
/** The traits fitted to a lute id ("songweaver_weapon@12#steel.wide^ember2" -> ["steel", "wide"]); unknown words are skipped. */
export function luteTraits(id: string | undefined): LuteTraitId[] {
  const bare = stripRunes(id ?? ""), k = bare.indexOf("#");
  if (k < 0) return [];
  return bare.slice(k + 1).split(".").filter((w) => !!luteTrait(w)) as LuteTraitId[];
}
/**
 * A lute id with these traits, keeping its level and runes. One trait per group: a later one replaces an earlier one
 * of its group (refitting), and they are written in group order so the id is canonical.
 */
export function withTraits(id: string, traits: LuteTraitId[]): string {
  const runes = itemRunes(id), head = plainId(id);
  const by = new Map<string, LuteTraitId>();
  for (const t of traits) { const d = luteTrait(t); if (d) by.set(d.group, t); }
  const list = LUTE_GROUPS.map((g) => by.get(g)).filter((t): t is LuteTraitId => !!t);
  return withRunes(list.length ? `${head}#${list.join(".")}` : head, runes);
}
/**
 * The lute at another item level (the hero's), traits and runes kept. Runes past the new stage's sockets come out as
 * loose runes into `out`, so the id stays valid; anything that is not a lute comes back as it is.
 */
export function luteAtLevel(id: string, level: number, out?: string[]): string {
  if (!isLute(id)) return id;
  const traits = luteTraits(id), runes = itemRunes(id), keep = luteAt(Math.max(1, Math.round(level))).sockets;
  if (out) for (const r of runes.slice(keep)) out.push(runeId(r.key, r.rank));
  return withRunes(withTraits(withLevel(LUTE_ID, level), traits), runes.slice(0, keep));
}
