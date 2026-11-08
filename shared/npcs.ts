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
  /** Where to find them, in words, for the quest tracker and log (quest givers) */
  where?: string;
}

export const NPCS: Npc[] = [
  // Elder Rowan tends the bonfire in the middle of the market square
  { id: "druid", name: "Elder Rowan", title: "Druid", sprite: "druid", x: (ROADS.RX + 3) * TILE, y: (ROADS.RY + 1.7) * TILE, dir: "left", where: "Oakvale, at the bonfire on the square" },
  // Traders around the market square
  { id: "weaponsmith", name: "Brann", title: "Weapons merchant", sprite: "blacksmith", x: 71.6 * TILE, y: 57.5 * TILE, dir: "right", where: "Oakvale, at the smithy on the square", shop: "weaponsmith" },
  { id: "witch", name: "Morwen", title: "Potion witch", sprite: "witch", x: 71.95 * TILE, y: 63.95 * TILE, dir: "right", where: "Oakvale, at her tent by the square", shop: "witch" },
  // Hilda the armourer, behind the market stall on the square's east side: armour for the first half of Act 1
  { id: "armourer", name: "Hilda", title: "Armour merchant", sprite: "armourer", x: 84.9 * TILE, y: 57.5 * TILE, dir: "down", shop: "armourer" },
  // Tobin the fisherman: only home once you free him from the blob cocoon at Sunken Lake (shared/quests.ts npcPresent)
  { id: "fisher", name: "Tobin", title: "Fisherman", sprite: "villager", x: 85.5 * TILE, y: 61.4 * TILE, dir: "left" },
  // Captain Hale of the watch, just inside the east gate: gives the skeleton quest chain (shared/quests.ts BONE_QUESTS)
  { id: "captain", name: "Captain Hale", title: "Captain of the Watch", sprite: "guard", x: 89.7 * TILE, y: 57.6 * TILE, dir: "down", where: "Oakvale, inside the east gate" },
  // Old Garrick, the eldest fisherman of Saltmere, warming himself at the beach fire: gives the Redfang chain (shared/quests.ts RED_QUESTS)
  { id: "oldfisher", name: "Old Garrick", title: "Old fisherman", sprite: "elder", x: 130.7 * TILE, y: 189.6 * TILE, dir: "left", where: "Saltmere, at the beach fire" },
  // Dorran, Saltmere's armourer, by the well among the net racks: armour for Lv 17-29
  { id: "saltarmourer", name: "Dorran", title: "Armour merchant", sprite: "saltarmourer", x: 141.5 * TILE, y: 183.7 * TILE, dir: "down", shop: "saltarmourer" },
  // ---- Kel Ashar, the oasis town of the Sunscar (Act 2, shared/desert.ts): round its market and spring
  // Sefa keeps the town's spring and remembers the old stories; Captain Rakhim holds the south gate (shared/quests.ts SUN_QUESTS)
  { id: "wellkeeper", name: "Sefa", title: "Well-Keeper", sprite: "wellkeeper", x: 145.3 * TILE, y: D(110.5) * TILE, dir: "right", where: "Kel Ashar (Act 2 desert), at the spring in the market" },
  { id: "sandcaptain", name: "Captain Rakhim", title: "Captain of the Sand Watch", sprite: "sandcaptain", x: 149.6 * TILE, y: D(120.8) * TILE, dir: "down", where: "Kel Ashar (Act 2 desert), inside the south gate" },
  { id: "spicetrader", name: "Zahra", title: "Spice and potion trader", sprite: "spicetrader", x: 142.5 * TILE, y: D(106.8) * TILE, dir: "down", shop: "spicetrader" },
  { id: "sandarmourer", name: "Idris", title: "Armour merchant", sprite: "sandarmourer", x: 152.4 * TILE, y: D(112.6) * TILE, dir: "down", shop: "sandarmourer" },
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
  // The armourers' wares (client/src/armoury.ts): an armour stand in the village's best coat and a rack of shields
  { prop: "ar_stand_oak", x: 86.5, y: 57.6, scale: 0.82, animated: true, solid: [86.2, 57.4, 0.6, 0.35] },
  { prop: "ar_rack_oak", x: 83.1, y: 57.3, scale: 0.88, animated: true, solid: [82.45, 57.1, 1.3, 0.35] },
  { prop: "ar_stand_salt", x: 143.0, y: 183.7, scale: 0.82, animated: true, solid: [142.7, 183.5, 0.6, 0.35] },
  { prop: "ar_rack_salt", x: 139.8, y: 183.5, scale: 0.88, animated: true, solid: [139.15, 183.3, 1.3, 0.35] },
  { prop: "ar_stand_sand", x: 150.9, y: D(112.6), scale: 0.82, animated: true, solid: [150.6, D(112.4), 0.6, 0.35] },
  { prop: "ar_rack_sand", x: 153.9, y: D(111.9), scale: 0.88, animated: true, solid: [153.25, D(111.7), 1.3, 0.35] },
];

/**
 * Solid trader props bucketed by 4-tile cell (the villages are far apart: one bounding box over all of them would
 * cover most of the map), so most collision checks find an empty cell and stop there.
 */
const DECOR_CELL = 4;
let decorCells: Map<number, [number, number, number, number][]> | undefined;
function decorGrid() {
  const m = new Map<number, [number, number, number, number][]>();
  for (const d of NPC_DECOR) {
    const r = d.solid;
    if (!r) continue;
    for (let cy = Math.floor(r[1] / DECOR_CELL); cy <= Math.floor((r[1] + r[3]) / DECOR_CELL); cy++)
      for (let cx = Math.floor(r[0] / DECOR_CELL); cx <= Math.floor((r[0] + r[2]) / DECOR_CELL); cx++) {
        const k = cy * 4096 + cx;
        (m.get(k) ?? m.set(k, []).get(k)!).push(r);
      }
  }
  return m;
}

/** True if (px, py) is inside one of the NPC props that block movement. */
export function isDecorSolidAt(px: number, py: number): boolean {
  const tx = px / TILE, ty = py / TILE;
  const w = WRECK.solid;
  if (tx >= w[0] && ty >= w[1] && tx < w[0] + w[2] && ty < w[1] + w[3]) return true; // the Grey Heron's hull
  const cell = (decorCells ??= decorGrid()).get(Math.floor(ty / DECOR_CELL) * 4096 + Math.floor(tx / DECOR_CELL));
  if (!cell) return false;
  for (const r of cell) if (tx >= r[0] && ty >= r[1] && tx < r[0] + r[2] && ty < r[1] + r[3]) return true;
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
