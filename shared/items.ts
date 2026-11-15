import type { MobKind } from "./constants";
import type { MatDrop } from "./lutemaker";

/** Items lying on the ground. Art convention: client draws them by `Item.kind`. */
// "gear": Item.gear holds the id (shared/gear.ts); "quest": quest item id (shared/quests.ts); "mat": a Songweaver material,
// Item.gear = "mat_<id>" (shared/lutemaker.ts), only a Songweaver picks it up
export type ItemKind = "gold" | "potion" | "mpotion" | "gear" | "quest" | "mat";

export const PICKUP_RADIUS = 10; // px
/** Gold is scooped up from a little further away, as in most ARPGs: no walking onto every coin. */
export const GOLD_PICKUP_RADIUS = 72; // px (about 2 tiles)
export const ITEM_LIFETIME_MS = 30000; // ground items vanish after this
export const PVP_GOLD_DROP = 0.5; // fraction of gold a player drops when killed by another player

export interface LootDef {
  gold: [number, number]; // min, max coins dropped
  potionChance: number; // 0..1
  /** Songweaver materials it drops on the ground (DI-5, shared/lutemaker.ts): bone from the dead, silk, horn, sunglass. */
  mats?: MatDrop[];
}
const mat = (m: MatDrop["mat"], chance: number, lo = 1, hi = lo): MatDrop[] => [{ mat: m, chance, n: [lo, hi] }];

export const LOOT: Record<MobKind, LootDef> = {
  golem_fire: { gold: [0, 0], potionChance: 0 }, golem_cold: { gold: [0, 0], potionChance: 0 },
  golem_poison: { gold: [0, 0], potionChance: 0 }, golem_shock: { gold: [0, 0], potionChance: 0 }, golem_colossus: { gold: [0, 0], potionChance: 0 },
  bride: { gold: [0, 0], potionChance: 0 },
  wisp: { gold: [0, 0], potionChance: 0 },
  slime: { gold: [1, 4], potionChance: 0.15 },
  skeleton: { gold: [5, 12], potionChance: 0.3, mats: mat("bone", 0.12) },
  crawler: { gold: [0, 2], potionChance: 0.05 },
  demon: { gold: [50, 100], potionChance: 1 },
  motherblob: { gold: [8, 18], potionChance: 0.5 },
  blobling: { gold: [0, 1], potionChance: 0.03 },
  shooterblob: { gold: [2, 6], potionChance: 0.15 },
  warriorblob: { gold: [4, 10], potionChance: 0.25 },
  healerblob: { gold: [3, 8], potionChance: 0.4 },
  venomblob: { gold: [6, 14], potionChance: 0.35 },
  frostblob: { gold: [8, 16], potionChance: 0.35 },
  fireblob: { gold: [8, 18], potionChance: 0.35 },
  stormblob: { gold: [9, 20], potionChance: 0.35 },
  bandit: { gold: [8, 20], potionChance: 0.3 },
  skeletonmage: { gold: [6, 14], potionChance: 0.35, mats: mat("bone", 0.12) },
  necromancer: { gold: [40, 80], potionChance: 1 },
  banditchief: { gold: [90, 160], potionChance: 1 },
  hollowking: { gold: [400, 600], potionChance: 1, mats: mat("bone", 1, 4, 6) },
  gnawkin: { gold: [5, 12], potionChance: 0.25 },
  tuskborn: { gold: [10, 22], potionChance: 0.35, mats: mat("horn", 0.15) },
  silkwretch: { gold: [8, 18], potionChance: 0.3, mats: mat("silk", 0.15) },
  duskwing: { gold: [8, 16], potionChance: 0.3 },
  crowseer: { gold: [9, 20], potionChance: 0.3 },
  gnasher: { gold: [60, 110], potionChance: 1 },
  weaver: { gold: [60, 115], potionChance: 1, mats: mat("silk", 1, 4, 6) },
  packlord: { gold: [70, 130], potionChance: 1 },
  hornbrute: { gold: [80, 150], potionChance: 1, mats: mat("horn", 1, 3, 5) },
  hidemother: { gold: [300, 480], potionChance: 1, mats: mat("horn", 1, 4, 6) },
  nomad: { gold: [14, 30], potionChance: 0.35, mats: mat("sunglass", 0.06) },
  scorpion: { gold: [6, 16], potionChance: 0.3, mats: mat("sunglass", 0.06) },
  sanddead: { gold: [12, 28], potionChance: 0.35, mats: mat("sunglass", 0.06) },
  veiled: { gold: [16, 34], potionChance: 0.4, mats: mat("sunglass", 0.08) },
  camelfolk: { gold: [18, 38], potionChance: 0.4, mats: mat("sunglass", 0.08) },
  sphinx: { gold: [22, 44], potionChance: 0.4, mats: mat("sunglass", 0.1) },
  sunwright: { gold: [600, 900], potionChance: 1, mats: mat("sunglass", 1, 3, 5) },
  nightraider: { gold: [180, 320], potionChance: 1 },
  trooper: { gold: [0, 0], potionChance: 0 }, // clan troops drop nothing (shared/war/troops.ts)
};
