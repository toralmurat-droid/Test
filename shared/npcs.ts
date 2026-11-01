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
  { id: "weaponsmith", name: "Brann", title: "Weapons merchant", sprite: "blacksmith", x: (ROADS.RX - 3) * TILE, y: (ROADS.RY - 1.5) * TILE, dir: "down", shop: "weaponsmith" },
  { id: "witch", name: "Old Morwen", title: "Potion witch", sprite: "witch", x: (ROADS.RX - 3) * TILE, y: (ROADS.RY + 4) * TILE, dir: "right", shop: "witch" },
];

/** How close (px) a player must stand to talk to an NPC. */
export const TALK_RANGE = 1.1 * TILE;

export function npcById(id: string): Npc | undefined {
  return NPCS.find((n) => n.id === id);
}

/** Nearest NPC within talking range, if any. */
export function npcNear(x: number, y: number, range = TALK_RANGE): Npc | undefined {
  let best: Npc | undefined, bd = range;
  for (const n of NPCS) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= bd) { best = n; bd = d; }
  }
  return best;
}
