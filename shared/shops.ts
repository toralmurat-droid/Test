import { gearDef, itemLevel, itemRarity, withLevel } from "./gear";
import { POTION_SIZES } from "./potions";

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
  /** Gear slots this shop buys from the player's bag (none = buys nothing) */
  buys?: string[];
}

export const GEAR_PRICE = [0, 60, 180, 450];
export const SELL_RATE = 0.4;

/** Price grows 12% per item level above 1. */
export const PRICE_PER_LEVEL = 0.12;
/** Item level of shop stock, by tier (Common, Rare, Epic). */
export const SHOP_LEVEL = [0, 1, 6, 12];
/** Magic, Rare and Legendary items sell for more (Plain, Magic, Rare, Legendary). */
export const RARITY_PRICE = [1, 1.5, 2.5, 4];

export function gearPrice(id: string): number {
  const d = gearDef(id);
  return d ? Math.round((GEAR_PRICE[d.tier] ?? 0) * (1 + PRICE_PER_LEVEL * (itemLevel(id) - 1)) * RARITY_PRICE[itemRarity(id)]) : 0;
}

export function sellPrice(id: string): number {
  return Math.max(1, Math.floor(gearPrice(id) * SELL_RATE));
}

const weapons = (ids: string[]): ShopEntry[] => ids.map((base) => {
  const item = withLevel(base, SHOP_LEVEL[gearDef(base)?.tier ?? 1]);
  return { item, price: gearPrice(item) };
});

export const SHOPS: Record<string, Shop> = {
  weaponsmith: {
    greeting: "Steel for every hand, friend. Have a look, or show me what you found out there.",
    stock: weapons(["w_bronze", "w_ash", "w_frost", "w_long", "w_dragon", "w_sky", "ws_arming", "wx_hand", "wb_hunt", "wf_oak", "r_sling", "r_knives", "r_crossbow"]),
    buys: ["weapon", "ranged"],
  },
  witch: {
    greeting: "Fresh from the still, darling. Red for your blood, blue for your magic. Try not to stare.",
    stock: [
      // Minor and Medium flasks; Greater ones are only found out in the world
      ...[0, 1].flatMap((size) => (["potion", "mpotion"] as const).flatMap((item) => [
        { item, size, qty: 1, price: POTION_SIZES[size].price },
        { item, size, qty: 5, price: Math.round(POTION_SIZES[size].price * 5 * 0.85) },
      ])),
    ],
  },
};

