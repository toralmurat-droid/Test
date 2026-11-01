import { GEAR } from "./gear";
import { MAX_POTIONS } from "./items";

/**
 * Village shops. A shop is attached to an NPC (shared/npcs.ts) by id. The server checks distance, gold and bag space.
 * Gear prices come from the item tier; shops buy back what they sell at SELL_RATE of the price.
 */
export interface ShopEntry {
  /** gear id, or "potion" */
  item: string;
  qty?: number; // potions per purchase
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
export const POTION_PRICE = 20;

export function gearPrice(id: string): number {
  return GEAR_PRICE[GEAR[id]?.tier ?? 0] ?? 0;
}

export function sellPrice(id: string): number {
  return Math.max(1, Math.floor(gearPrice(id) * SELL_RATE));
}

const weapons = (ids: string[]): ShopEntry[] => ids.map((item) => ({ item, price: gearPrice(item) }));

export const SHOPS: Record<string, Shop> = {
  weaponsmith: {
    greeting: "Steel for every hand, friend. Have a look, or show me what you found out there.",
    stock: weapons(["w_bronze", "w_ash", "w_frost", "w_long", "w_dragon", "w_sky", "r_sling", "r_knives", "r_crossbow"]),
    buys: ["weapon", "ranged"],
  },
  witch: {
    greeting: "Hehehe... potions, freshly brewed. Bubbling with good health, mostly.",
    stock: [
      { item: "potion", qty: 1, price: POTION_PRICE },
      { item: "potion", qty: 3, price: Math.round(POTION_PRICE * 3 * 0.85) },
    ],
  },
};

export { MAX_POTIONS };
