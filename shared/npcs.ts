import { TILE } from "./constants";
import { ROADS, WRECK } from "./map";
import { D } from "./desert";

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
  { id: "witch", name: "Morwen", title: "Potion witch", sprite: "witch", x: 71.95 * TILE, y: 63.95 * TILE, dir: "right", shop: "witch" },
  // Tobin the fisherman: only home once you free him from the blob cocoon at Sunken Lake (shared/quests.ts npcPresent)
  { id: "fisher", name: "Tobin", title: "Fisherman", sprite: "villager", x: 85.5 * TILE, y: 61.4 * TILE, dir: "left" },
  // Captain Hale of the watch, just inside the east gate: gives the skeleton quest chain (shared/quests.ts BONE_QUESTS)
  { id: "captain", name: "Captain Hale", title: "Captain of the Watch", sprite: "guard", x: 89.7 * TILE, y: 57.6 * TILE, dir: "down" },
  // Old Garrick, the eldest fisherman of Saltmere, warming himself at the beach fire: gives the Redfang chain (shared/quests.ts RED_QUESTS)
  { id: "oldfisher", name: "Old Garrick", title: "Old fisherman", sprite: "elder", x: 130.7 * TILE, y: 189.6 * TILE, dir: "left" },
  // ---- Kel Ashar, the oasis town of the Sunscar (Act 2, shared/desert.ts): round its market and spring
  // Sefa keeps the town's spring and remembers the old stories; Captain Rakhim holds the south gate (shared/quests.ts SUN_QUESTS)
  { id: "wellkeeper", name: "Sefa", title: "Well-Keeper", sprite: "wellkeeper", x: 145.3 * TILE, y: D(110.5) * TILE, dir: "right" },
  { id: "sandcaptain", name: "Captain Rakhim", title: "Captain of the Sand Watch", sprite: "sandcaptain", x: 149.6 * TILE, y: D(120.8) * TILE, dir: "down" },
  { id: "spicetrader", name: "Zahra", title: "Spice and potion trader", sprite: "spicetrader", x: 142.5 * TILE, y: D(106.8) * TILE, dir: "down", shop: "spicetrader" },
  { id: "desertsmith", name: "Oren", title: "Bladesmith", sprite: "desertsmith", x: 155.5 * TILE, y: D(106.6) * TILE, dir: "down", shop: "desertsmith" },
];

/**
 * Props around the traders (props atlas, bottom-centre pivot), in tiles. `solid` = blocking rect in tiles
 * (x, y, w, h), used by shared/movement.ts so players walk around the hut and the forge.
 */
export interface NpcDecor { prop: string; x: number; y: number; scale: number; animated?: boolean; solid?: [number, number, number, number]; flip?: boolean }
export const NPC_DECOR: NpcDecor[] = [
  // Morwen's camp: her crimson bell tent and the alchemy rig with its floating rune stones (client/src/witchCamp.ts)
  { prop: "wc_tent", x: 70.9, y: 62.7, scale: 1, animated: true, solid: [70.25, 62.05, 1.3, 1.3] },
  { prop: "wc_rig", x: 72.8, y: 63.7, scale: 1, animated: true, solid: [72.5, 63.45, 0.6, 0.35] },
  // Brann's smithy (client/src/smithy.ts): stone forge with bellows and chimney, anvil on a stump, quench barrel,
  // grindstone, tool bench with a coal heap, and the rack of weapons he sells
  { prop: "sm_forge", x: 70.2, y: 56.7, scale: 1, animated: true, solid: [69.7, 56.35, 1.55, 0.7] },
  { prop: "sm_bench", x: 69.0, y: 57.85, scale: 1, animated: true, solid: [68.6, 57.5, 0.9, 0.45] },
  { prop: "sm_anvil", x: 72.25, y: 57.65, scale: 1, animated: true, solid: [71.95, 57.5, 0.55, 0.3] },
  { prop: "sm_quench", x: 72.75, y: 58.35, scale: 1, animated: true, solid: [72.5, 58.15, 0.45, 0.4] },
  { prop: "sm_grind", x: 70.65, y: 58.35, scale: 1, animated: true, solid: [70.35, 58.15, 0.6, 0.35] },
  { prop: "sm_rack", x: 73.4, y: 56.6, scale: 1, animated: true, solid: [72.8, 56.35, 1.2, 0.4] },
];

/** True if (px, py) is inside one of the NPC props that block movement. */
/** Box (tiles) around every solid trader prop: most collision checks are far from it and stop there. */
let decorBox: [number, number, number, number] | undefined;
function decorBounds(): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const d of NPC_DECOR) {
    const r = d.solid;
    if (!r) continue;
    x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[0] + r[2]); y1 = Math.max(y1, r[1] + r[3]);
  }
  return [x0, y0, x1, y1];
}

export function isDecorSolidAt(px: number, py: number): boolean {
  const tx = px / TILE, ty = py / TILE;
  const w = WRECK.solid;
  if (tx >= w[0] && ty >= w[1] && tx < w[0] + w[2] && ty < w[1] + w[3]) return true; // the Grey Heron's hull
  const b = (decorBox ??= decorBounds());
  if (tx < b[0] || ty < b[1] || tx >= b[2] || ty >= b[3]) return false;
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
