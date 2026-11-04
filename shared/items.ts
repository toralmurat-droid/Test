import type { MobKind } from "./constants";

/** Items lying on the ground. Art convention: client draws them by `Item.kind`. */
export type ItemKind = "gold" | "potion" | "gear" | "quest"; // "gear": Item.gear holds the id (shared/gear.ts); "quest": quest item id (shared/quests.ts)

export const PICKUP_RADIUS = 10; // px
export const ITEM_LIFETIME_MS = 30000; // ground items vanish after this
export const MAX_POTIONS = 5;
export const POTION_HEAL = 0.4; // fraction of max HP
export const POTION_COOLDOWN_MS = 1000;
export const PVP_GOLD_DROP = 0.5; // fraction of gold a player drops when killed by another player

export interface LootDef {
  gold: [number, number]; // min, max coins dropped
  potionChance: number; // 0..1
}

export const LOOT: Record<MobKind, LootDef> = {
  slime: { gold: [1, 4], potionChance: 0.15 },
  skeleton: { gold: [5, 12], potionChance: 0.3 },
  crawler: { gold: [0, 2], potionChance: 0.05 },
  demon: { gold: [50, 100], potionChance: 1 },
  motherblob: { gold: [8, 18], potionChance: 0.5 },
  blobling: { gold: [0, 1], potionChance: 0.03 },
  shooterblob: { gold: [2, 6], potionChance: 0.15 },
  warriorblob: { gold: [4, 10], potionChance: 0.25 },
  healerblob: { gold: [3, 8], potionChance: 0.4 },
  bandit: { gold: [8, 20], potionChance: 0.3 },
  skeletonmage: { gold: [6, 14], potionChance: 0.35 },
  necromancer: { gold: [40, 80], potionChance: 1 },
  banditchief: { gold: [90, 160], potionChance: 1 },
  hollowking: { gold: [400, 600], potionChance: 1 },
};
