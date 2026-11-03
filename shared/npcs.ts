import { TILE } from "./constants";
import { ROADS } from "./map";

/** Village NPCs: where they stand (feet, in pixels) and which sprite sheet they use. Server and client share this. */
export interface Npc {
  id: string;
  name: string;
  title: string;
  sprite: string; // character sheet in client/public/assets/characters
  x: number; y: number;
  dir: "down" | "up" | "left" | "right";
  /** Shop id in shared/shops.ts, if this NPC trades */
  shop?: string;
}

export const NPCS: Npc[] = [
  // Elder Rowan tends the bonfire in the middle of the market square
  { id: "druid", name: "Elder Rowan", title: "Druid", sprite: "druid", x: (ROADS.RX + 3) * TILE, y: (ROADS.RY + 1.7) * TILE, dir: "left" },
  // Traders around the market square
  { id: "weaponsmith", name: "Brann", title: "Weapons merchant", sprite: "blacksmith", x: 71.6 * TILE, y: 57.5 * TILE, dir: "right", shop: "weaponsmith" },
  { id: "witch", name: "Old Morwen", title: "Potion witch", sprite: "witch", x: 71.95 * TILE, y: 63.95 * TILE, dir: "right", shop: "witch" },
  // Tobin the fisherman: only home once you free him from the blob cocoon at Sunken Lake (shared/quests.ts npcPresent)
  { id: "fisher", name: "Tobin", title: "Fisherman", sprite: "villager", x: 85.5 * TILE, y: 61.4 * TILE, dir: "left" },
  // Captain Hale of the watch, just inside the east gate: gives the skeleton quest chain (shared/quests.ts BONE_QUESTS)
  { id: "captain", name: "Captain Hale", title: "Captain of the Watch", sprite: "guard", x: 89.7 * TILE, y: 57.6 * TILE, dir: "down" },
  // Old Garrick, the eldest fisherman of Saltmere, warming himself at the beach fire: gives the Redfang chain (shared/quests.ts RED_QUESTS)
  { id: "oldfisher", name: "Old Garrick", title: "Old fisherman", sprite: "elder", x: 130.7 * TILE, y: 189.6 * TILE, dir: "left" },
];

/**
 * Props around the traders (props atlas, bottom-centre pivot), in tiles. `solid` = blocking rect in tiles
 * (x, y, w, h), used by shared/movement.ts so players walk around the hut and the forge.
 */
export interface NpcDecor { prop: string; x: number; y: number; scale: number; animated?: boolean; solid?: [number, number, number, number]; flip?: boolean }
export const NPC_DECOR: NpcDecor[] = [
  // Old Morwen's crooked hut, cauldron, candles and herbs
  { prop: "witch_hut", x: 71.6, y: 62.85, scale: 1.5, animated: true, solid: [70.5, 61.8, 1.75, 1.25] }, // big enough for Morwen to fit through the door
  { prop: "cauldron", x: 72.8, y: 64.05, scale: 0.55, animated: true, solid: [72.55, 63.8, 0.5, 0.25] },
  { prop: "candles", x: 70.05, y: 63.45, scale: 0.5, animated: true },
  { prop: "toadstools", x: 73.4, y: 63.3, scale: 0.5 },
  { prop: "herb_rack", x: 72.9, y: 62.55, scale: 0.5 },
  // Brann's smithy: forge with bellows, anvil, weapon rack
  { prop: "forge", x: 70.4, y: 56.85, scale: 0.6, animated: true, solid: [69.85, 56.2, 1.1, 0.65] },
  { prop: "anvil", x: 72.25, y: 57.65, scale: 0.5, solid: [72.05, 57.45, 0.4, 0.2] },
  { prop: "weapon_rack", x: 73.3, y: 56.6, scale: 0.55, solid: [72.8, 56.3, 1.0, 0.3] },
];

/** True if (px, py) is inside one of the NPC props that block movement. */
export function isDecorSolidAt(px: number, py: number): boolean {
  const tx = px / TILE, ty = py / TILE;
  for (const d of NPC_DECOR) {
    const r = d.solid;
    if (r && tx >= r[0] && ty >= r[1] && tx < r[0] + r[2] && ty < r[1] + r[3]) return true;
  }
  return false;
}

/** How close (px) a player must stand to talk to an NPC. */
export const TALK_RANGE = 1.1 * TILE;

export function npcById(id: string): Npc | undefined {
  return NPCS.find((n) => n.id === id);
}

/** Nearest NPC within talking range, if any (`present` hides NPCs that are not there for this player). */
export function npcNear(x: number, y: number, range = TALK_RANGE, present: (n: Npc) => boolean = () => true): Npc | undefined {
  let best: Npc | undefined, bd = range;
  for (const n of NPCS) {
    if (!present(n)) continue;
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= bd) { best = n; bd = d; }
  }
  return best;
}
