import { AffixKey, affixMax, gearDef, itemLevel, itemRarity, withAffixes, withLevel } from "./gear";
import { POTION_SIZES } from "./potions";
import { parseRune } from "./runes";

/**
 * Village shops. A shop is attached to an NPC (shared/npcs.ts) by id. The server checks distance, gold and bag space.
 * Gear prices come from the item tier and item level; shops buy back what they sell at SELL_RATE of the price.
 * The smith sells set item levels (SHOP_LEVEL by tier): the best gear is still found out in the world.
 */
export interface ShopEntry {
  /** gear id, "potion" (healing) or "mpotion" (mana) */
  item: string;
  qty?: number; // potions per purchase
  size?: number; // potion size (shared/potions.ts POTION_SIZES)
  price: number;
}

export interface Shop {
  greeting: string;
  stock: ShopEntry[];
  /** Gear slots this shop buys from the player's bag, "rune" = loose runes (none = buys nothing) */
  buys?: string[];
  /** Stock is listed under one heading per item level (the armourers) */
  levelHeads?: boolean;
}

export const GEAR_PRICE = [0, 60, 180, 450];
export const SELL_RATE = 0.4;

/** Price grows 12% per item level above 1. */
export const PRICE_PER_LEVEL = 0.12;
/** Item level of shop stock, by tier (Common, Rare, Epic). */
export const SHOP_LEVEL = [0, 1, 6, 12];
/**
 * Masterwork stock (Murat 2026-11-08: "really good but very expensive", up to level 30): the best piece of every slot,
 * Legendary, with four bonuses rolled to their maximum, every 3 levels from 15 to 30.
 */
export const MASTER_LEVELS = [15, 18, 21, 24, 27, 30];
/** The best base item of each kind, sold as masterwork, and the four bonuses Brann forges into it. */
export const MASTER_BASES: Record<string, AffixKey[]> = {
  w_dragon: ["atk", "str", "fdm", "sta"],
  w_sky: ["atk", "str", "hdm", "dex"],
  ww_star: ["atk", "mag", "sdm", "cdm"],
  r_crossbow: ["atk", "dex", "str", "sta"],
  sh_dragon: ["sta", "str", "fre", "cre"],
  a_royal: ["sta", "str", "fre", "pre"],
  h_crown: ["mag", "sta", "hre", "sre"],
  s_winged: ["spd", "dex", "sta", "mag"],
};
/** Masterwork price: 10 000 gold at level 15, x10 by level 30 (rounded to 500). Sold back like any Legendary. */
export const masterPrice = (level: number) => Math.round((10000 * 10 ** ((level - 15) / 15)) / 500) * 500;
/** A masterwork item id: Legendary, its bonuses at their highest for the level. */
export function masterItem(base: string, level: number): string {
  return withAffixes(withLevel(base, level), 3, MASTER_BASES[base].map((key) => ({ key, value: affixMax(key, level, 3) })));
}
/** Magic, Rare and Legendary items sell for more (Plain, Magic, Rare, Legendary). */
export const RARITY_PRICE = [1, 1.5, 2.5, 4];

export function gearPrice(id: string): number {
  const d = gearDef(id);
  return d ? Math.round((GEAR_PRICE[d.tier] ?? 0) * (1 + PRICE_PER_LEVEL * (itemLevel(id) - 1)) * RARITY_PRICE[itemRarity(id)]) : 0;
}

/** What a shop pays for a loose rune (shared/runes.ts), by rank: Lesser, plain, Greater. Only shops with "rune" in `buys`. */
export const RUNE_PRICE = [0, 40, 120, 300];

/**
 * True when this shop buys this bag item (a gear slot it lists, or "rune" for loose runes). `spare`: a bound item the
 * hero may part with (gear.ts keepsBound); other bound items are never sold.
 */
export function shopBuys(shop: Shop, id: string, spare = false): boolean {
  if (!shop.buys) return false;
  if (parseRune(id)) return shop.buys.includes("rune");
  const d = gearDef(id);
  return !!d && (!d.bound || spare) && shop.buys.includes(d.slot);
}

/** Rune fusion (shared/runes.ts fuseRunes) is offered by every trader who buys loose runes. */
export const shopFuses = (shop: Shop | undefined): boolean => !!shop?.buys?.includes("rune");

export function sellPrice(id: string): number {
  const r = parseRune(id);
  if (r) return RUNE_PRICE[r.rank];
  return Math.max(1, Math.floor(gearPrice(id) * SELL_RATE));
}

const weapons = (ids: string[]): ShopEntry[] => ids.map((base) => {
  const item = withLevel(base, SHOP_LEVEL[gearDef(base)?.tier ?? 1]);
  return { item, price: gearPrice(item) };
});

/** Kel Ashar's bladesmith: the same bases, forged at Act 2's levels (Common 30, Rare 36, Epic 42). */
export const DESERT_SHOP_LEVEL = [0, 30, 36, 42];
const desertStock = (ids: string[]): ShopEntry[] => ids.map((base) => {
  const item = withLevel(base, DESERT_SHOP_LEVEL[gearDef(base)?.tier ?? 1]);
  return { item, price: gearPrice(item) };
});

/**
 * Armourers (Murat 2026-11-08: "a merchant selling armor in the villages"): shields, body armour, helms and boots only,
 * in steps across the levels of their part of the world. Each step is [tier, item level]; every step sells the four
 * armour slots of that tier. Oakvale covers the first half of Act 1, Saltmere (reached at Lv 16) the second half,
 * Kel Ashar Act 2 (Lv 30-50), Cairnwatch the moors (Act 3, Lv 20-35).
 */
export const ARMOUR_BASES: Record<number, string[]> = {
  1: ["sh_wood", "a_leather", "h_cap", "s_leather"],
  2: ["sh_iron", "a_chain", "h_helm", "s_swift"],
  3: ["sh_dragon", "a_royal", "h_crown", "s_winged"],
};
export const ARMOUR_STEPS: Record<string, [number, number][]> = {
  armourer: [[1, 3], [1, 6], [2, 9], [2, 12], [3, 15]],
  saltarmourer: [[2, 17], [2, 20], [3, 23], [3, 26], [3, 29]],
  sandarmourer: [[2, 32], [3, 36], [3, 40], [3, 44], [3, 48]],
  moorarmourer: [[2, 21], [3, 24], [3, 27], [3, 30], [3, 33]], // Cairnwatch (Act 3, Lv 20-35)
};
const armourStock = (shop: string): ShopEntry[] => ARMOUR_STEPS[shop].flatMap(([tier, level]) => ARMOUR_BASES[tier].map((base) => {
  const item = withLevel(base, level);
  return { item, price: gearPrice(item) };
}));
const ARMOUR_SLOTS = ["shield", "armour", "hat", "shoes"];

/** Flasks of one kind, one and five at a time (the five at 15% off), like the witch's. */
const potionStock = (item: "potion" | "mpotion", sizes: number[]): ShopEntry[] => sizes.flatMap((size) => [
  { item, size, qty: 1, price: POTION_SIZES[size].price },
  { item, size, qty: 5, price: Math.round(POTION_SIZES[size].price * 5 * 0.85) },
]);

const masterwork = (level: number): ShopEntry[] => Object.keys(MASTER_BASES).map((base) => ({ item: masterItem(base, level), price: masterPrice(level) }));

export const SHOPS: Record<string, Shop> = {
  weaponsmith: {
    greeting: "Steel for every hand, friend. Have a look, or show me what you found out there.",
    stock: [
      ...weapons(["w_bronze", "w_ash", "w_frost", "w_long", "w_dragon", "w_sky", "ws_arming", "wx_hand", "wb_hunt", "wf_oak", "r_sling", "r_knives", "r_crossbow"]),
      // armour, shields, hats and boots at their tier's level
      ...weapons(["sh_wood", "sh_iron", "sh_dragon", "a_leather", "a_chain", "a_royal", "h_cap", "h_helm", "h_crown", "s_leather", "s_swift", "s_winged"]),
      // masterwork: the best of each slot at higher levels, up to the max level
      ...MASTER_LEVELS.flatMap(masterwork),
    ],
    buys: ["weapon", "ranged", "shield", "armour", "hat", "shoes"],
  },
  // Kel Ashar (Act 2): desert-forged stock at Lv 30 / 36 / 42 by tier, and Greater flasks the valley's witch never sells
  desertsmith: {
    greeting: "Sun-tempered steel. It holds an edge where valley iron goes soft. Sell me your old pieces, I melt them down.",
    stock: desertStock(["w_bronze", "w_frost", "w_long", "w_dragon", "w_sky", "ws_arming", "wx_hand", "wb_hunt", "wf_oak", "r_knives", "r_crossbow",
      "sh_iron", "sh_dragon", "a_leather", "a_chain", "a_royal", "h_cap", "h_helm", "h_crown", "s_leather", "s_swift", "s_winged"]),
    buys: ["weapon", "ranged", "shield", "armour", "hat", "shoes"],
  },
  // the armourers: one in each village, armour slots only
  armourer: {
    greeting: "Mail, plate, good boots. Steel keeps the blood on the inside, love. Try something on.",
    stock: armourStock("armourer"),
    buys: ARMOUR_SLOTS,
    levelHeads: true,
  },
  saltarmourer: {
    greeting: "Salt eats iron, so I oil every ring twice. Armour for the hard roads east, if you've the coin.",
    stock: armourStock("saltarmourer"),
    buys: ARMOUR_SLOTS,
    levelHeads: true,
  },
  sandarmourer: {
    greeting: "Brass scale and doubled linen. Valley plate cooks a man alive out here. Mine lets him breathe.",
    stock: armourStock("sandarmourer"),
    buys: ARMOUR_SLOTS,
    levelHeads: true,
  },
  moorarmourer: {
    greeting: "Iron rings over boiled leather, and a hood against the mist. The dead out there bite cold. Wear something thick.",
    stock: armourStock("moorarmourer"),
    buys: ARMOUR_SLOTS,
    levelHeads: true,
  },
  // Cairnwatch's herbwife (Act 3): Medium and Greater flasks; she buys and fuses loose runes like Morwen and Zahra
  moorherbalist: {
    greeting: "Bog-myrtle, sundew, a drop of something stronger. Red keeps you breathing, blue keeps you thinking. Carved stones? I'll take them, or fuse four.",
    stock: [...potionStock("potion", [1, 2]), ...potionStock("mpotion", [1, 2])],
    buys: ["rune"],
  },
  spicetrader: {
    greeting: "Cardamom, saffron, and flasks to keep you breathing in the sun. Water is extra. Joking. Mostly. Carved stones? I buy those too, or fuse four into one.",
    stock: [
      ...[1, 2].flatMap((size) => (["potion", "mpotion"] as const).flatMap((item) => [
        { item, size, qty: 1, price: POTION_SIZES[size].price },
        { item, size, qty: 5, price: Math.round(POTION_SIZES[size].price * 5 * 0.85) },
      ])),
    ],
    // Act 2's rune buyer (and so rune fuser, Lot C), like Morwen in Oakvale
    buys: ["rune"],
  },
  // Two Letters (shared/quests.ts SIDE_ARCS): the watch's quartermaster opens for heroes who took the list to Hale
  // (law), the beach smuggler for those who warned Ilka (mercy). Existing stock only: Saltmere's armour and flasks,
  // a fence's knives and crossbows.
  watch: {
    greeting: "Hale says you're a friend of the watch. Watch kit, then, at watch prices. Sign here. And here.",
    stock: [...armourStock("saltarmourer"), ...potionStock("potion", [1])],
    buys: ARMOUR_SLOTS,
  },
  smuggler: {
    greeting: "Ilka says you're all right. Don't ask where any of it came from, and I won't ask where you're taking it.",
    stock: [...potionStock("potion", [0, 1]), ...potionStock("mpotion", [0, 1]), ...weapons(["r_sling", "r_knives", "r_crossbow"])],
    buys: ["weapon", "ranged"],
  },
  // Wren the lute-maker (DI-5, shared/lutemaker.ts): the books, and she buys weapons and shields (breaking them is hers too)
  lutemaker: {
    greeting: "Books on the left, spare strings on the right. Anything you can't use, I'll buy or break.",
    stock: weapons(["bk_hymnal", "bk_march", "bk_dissonance"]),
    buys: ["weapon", "shield"],
  },
  witch: {
    greeting: "Fresh from the still, darling. Red for your blood, blue for your magic. Try not to stare. Found a carved stone out there? I pay well for runes, or fuse four alike into a stronger one.",
    stock: [
      // Minor and Medium flasks; Greater ones are only found out in the world
      ...[0, 1].flatMap((size) => (["potion", "mpotion"] as const).flatMap((item) => [
        { item, size, qty: 1, price: POTION_SIZES[size].price },
        { item, size, qty: 5, price: Math.round(POTION_SIZES[size].price * 5 * 0.85) },
      ])),
    ],
    // Morwen buys loose runes for her rune-stone alchemy (Murat 2026-11-08)
    buys: ["rune"],
  },
};

