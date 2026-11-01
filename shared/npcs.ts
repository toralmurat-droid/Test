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
}

export const NPCS: Npc[] = [
  // Elder Rowan tends the bonfire in the middle of the market square
  { id: "druid", name: "Elder Rowan", title: "Druid", sprite: "druid", x: (ROADS.RX + 4.5) * TILE, y: (ROADS.RY + 1.8) * TILE, dir: "left" },
];

/** How close (px) a player must stand to talk to an NPC. */
export const TALK_RANGE = 32;

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
