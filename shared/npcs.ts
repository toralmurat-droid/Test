import { TILE } from "./constants";
import { isSafeZone, isSolidAt, ROADS, WRECK } from "./map";
import { D } from "./desert";
import { MR } from "./moors";

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

/**
 * Feet (px) of a free spot near tile (tx, ty): the zone quest givers stand out in the wilds, so they are put on the
 * nearest walkable tile with room round it, whatever the map generator grew there.
 */
function standNear(tx: number, ty: number): { x: number; y: number } {
  const free = (x: number, y: number) => {
    if (isSafeZone((x + 0.5) * TILE, (y + 0.5) * TILE)) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isSolidAt((x + 0.5 + dx * 0.7) * TILE, (y + 0.5 + dy * 0.7) * TILE)) return false;
    return true;
  };
  for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) === r && free(tx + dx, ty + dy)) return { x: (tx + dx + 0.5) * TILE, y: (ty + dy + 0.6) * TILE };
  }
  return { x: (tx + 0.5) * TILE, y: (ty + 0.6) * TILE };
}

export const NPCS: Npc[] = [
  // Elder Rowan tends the bonfire in the middle of the market square
  { id: "druid", name: "Elder Rowan", title: "Druid", sprite: "druid", x: (ROADS.RX + 3) * TILE, y: (ROADS.RY + 1.7) * TILE, dir: "left", where: "Oakvale, at the bonfire on the square" },
  // Traders around the market square
  { id: "weaponsmith", name: "Brann", title: "Weapons merchant", sprite: "blacksmith", x: 71.6 * TILE, y: 57.5 * TILE, dir: "right", where: "Oakvale, at the smithy on the square", shop: "weaponsmith" },
  { id: "witch", name: "Morwen", title: "Potion witch", sprite: "witch", x: 71.95 * TILE, y: 63.95 * TILE, dir: "right", where: "Oakvale, at her tent by the square", shop: "witch" },
  // Hilda the armourer, behind the market stall on the square's east side: armour for the first half of Act 1
  { id: "armourer", name: "Hilda", title: "Armour merchant", sprite: "armourer", x: 84.9 * TILE, y: 57.5 * TILE, dir: "down", shop: "armourer" },
  // Wren the lute-maker, at her stall on the square's south-east side between her bench and her rack of lutes (DI-5)
  { id: "lutemaker", name: "Wren", title: "Lute-maker", sprite: "lutemaker", x: 85.6 * TILE, y: 64.7 * TILE, dir: "down", where: "Oakvale, in her workshop by the square", shop: "lutemaker" },
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
  // ---- Cairnwatch, the Cairn Wardens' hill-fort in the Grey Barrow Moors (Act 3, shared/moors.ts): round its square
  // (sprites: existing sheets until tools/art paints cairncaptain / moorarmourer / moorherbalist)
  // the wardens' captain stands before their hall: the moors' quest chain starts with her
  { id: "cairncaptain", name: "Warden-Captain Edra Vane", title: "Captain of the Cairn Wardens", sprite: "cairncaptain", x: 68.5 * TILE, y: MR(106.75) * TILE, dir: "down", where: "Cairnwatch (Act 3 moors), before the Wardens' Hall" },
  { id: "moorherbalist", name: "Mother Ysolde", title: "Herbwife", sprite: "moorherbalist", x: 77.5 * TILE, y: MR(106.75) * TILE, dir: "down", shop: "moorherbalist", where: "Cairnwatch (Act 3 moors), at her stall on the square" },
  { id: "moorarmourer", name: "Gorm", title: "Armour merchant", sprite: "moorarmourer", x: 84.5 * TILE, y: MR(111.6) * TILE, dir: "left", shop: "moorarmourer", where: "Cairnwatch (Act 3 moors), by the armoury" },
  // ---- Zone quest givers (Murat 2026-11-10: "more zone quests, real exploration arcs"): each lives out in their zone and
  // starts a short arc there that moves on through it and ends out in the field (shared/quests.ts ZONE_ARCS)
  { id: "huntsman", name: "Huntmaster Bryn", title: "Hunter", sprite: "huntsman", ...standNear(28, 18), dir: "left", where: "the Hunter's Camp, north-west of Oakvale" },
  { id: "miller", name: "Odo", title: "Miller", sprite: "miller", ...standNear(106, 48), dir: "down", where: "Millbrook Mill, north-east of Oakvale by the river" },
  { id: "forester", name: "Ylva", title: "Forester", sprite: "forester", ...standNear(198, 22), dir: "left", where: "the glade in the middle of Thornwood" },
  { id: "beachcomber", name: "Nell", title: "Beachcomber", sprite: "beachcomber", ...standNear(112, 192), dir: "down", where: "the Saltwind Coast, west of Saltmere" },
  { id: "prospector", name: "Dagna", title: "Prospector", sprite: "prospector", ...standNear(250, 137), dir: "left", where: "the north edge of the Stormbreak Crags" },
  { id: "caravaneer", name: "Hamid", title: "Caravan master", sprite: "caravaneer", ...standNear(91, 368), dir: "down", where: "Jackal Springs (Act 2), north-west of Kel Ashar" },
  { id: "hermit", name: "Old Tamsin", title: "Hermit", sprite: "hermit", ...standNear(80, 404), dir: "right", where: "the Red Wastes (Act 2), west of the Sunstone" },
  { id: "dunescout", name: "Leyla", title: "Scout of the camel-clans", sprite: "dunescout", ...standNear(200, 438), dir: "left", where: "the edge of the Saffron Dunes (Act 2), east of Kel Ashar" },
  { id: "defector", name: "Nasrin", title: "Runaway adept", sprite: "defector", ...standNear(224, 398), dir: "down", where: "the foot of the Thornspire Heights (Act 2), by Mirage Wells" },
  // the deep dungeons' quest givers, at their doors (shared/dungeon.ts)
  { id: "monk", name: "Brother Aldric", title: "Last of the Lamplighters", sprite: "monk", ...standNear(47, 145), dir: "left", where: "the ruined mausoleum on Barrow Downs, at the crypt stair" },
  { id: "tombrobber", name: "Zahir", title: "Tomb-robber", sprite: "tombrobber", ...standNear(61, 483), dir: "left", where: "the old well in Kharsun, the Buried City (Act 2)" },
  // ---- The quest concepts (docs/quest-concepts-progress.md); some only stand there for some heroes (shared/quests.ts npcPresent)
  // the Empty Grave: the sexton at Gravemoor's north gate, three mourners along the wall who won't go in among the dead
  { id: "sexton", name: "Amos", title: "Sexton of Gravemoor", sprite: "sexton", ...standNear(199, 123), dir: "down", where: "Gravemoor Cemetery, at the north gate" },
  { id: "mourner1", name: "Maud", title: "Smith's widow", sprite: "mourner1", ...standNear(190, 123), dir: "down", where: "Gravemoor Cemetery, by the north wall" },
  { id: "mourner2", name: "Edda", title: "Nan Hesketh's granddaughter", sprite: "mourner2", ...standNear(194, 122), dir: "down", where: "Gravemoor Cemetery, by the north wall" },
  { id: "mourner3", name: "Hollis", title: "Boatwright, Corin's partner", sprite: "mourner3", ...standNear(207, 123), dir: "down", where: "Gravemoor Cemetery, by the north wall" },
  // Two Letters: Ilka waits outside the Redfang stockade's west gate; the watch's quartermaster (law) stands beside
  // Captain Hale, the smuggler (mercy) on Saltmere beach
  { id: "ilka", name: "Ilka", title: "Net-mender", sprite: "ilka", ...standNear(234, 113), dir: "right", where: "outside the Redfang fence, by the west gate" },
  { id: "quartermaster", name: "Wynn", title: "Quartermaster of the Watch", sprite: "quartermaster", x: 91.1 * TILE, y: 59.4 * TILE, dir: "left", shop: "watch", where: "Oakvale, beside Captain Hale" },
  { id: "smuggler", name: "Marin", title: "Smuggler", sprite: "smuggler", x: 156.5 * TILE, y: 191.6 * TILE, dir: "left", shop: "smuggler", where: "Saltmere, on the beach east of the piers" },
  // Tavern Rumours: Mags sells ale off her cart at the square's south-west corner, by the crates and barrels, and hears
  // everything (shared/rumours.ts, server/rumours.ts)
  { id: "alewife", name: "Mags", title: "Alewife", sprite: "alewife", x: 77.4 * TILE, y: 64.75 * TILE, dir: "down", where: "Oakvale, at her ale-cart on the square" },
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
  // Wren's stall (client/src/lutierArt.ts): a workbench with a lute being built and a rack of finished lutes
  { prop: "lu_bench", x: 83.9, y: 64.6, scale: 1, animated: true, solid: [83.0, 64.35, 1.8, 0.35] },
  { prop: "lu_rack", x: 88.0, y: 64.2, scale: 1, animated: true, solid: [87.0, 63.95, 2.0, 0.3] },
  { prop: "ar_stand_salt", x: 143.0, y: 183.7, scale: 0.82, animated: true, solid: [142.7, 183.5, 0.6, 0.35] },
  { prop: "ar_rack_salt", x: 139.8, y: 183.5, scale: 0.88, animated: true, solid: [139.15, 183.3, 1.3, 0.35] },
  { prop: "ar_stand_sand", x: 150.9, y: D(112.6), scale: 0.82, animated: true, solid: [150.6, D(112.4), 0.6, 0.35] },
  { prop: "ar_rack_sand", x: 153.9, y: D(111.9), scale: 0.88, animated: true, solid: [153.25, D(111.7), 1.3, 0.35] },
  // Mags' ale-cart beside her (client/src/questConceptData.ts): south of the square's hero spawn rows, clear of the South Road
  { prop: "ale_cart", x: 78.75, y: 65.8, scale: 1, solid: [78.2, 65.4, 1.1, 0.38] },
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

/**
 * What Oakvale's villagers say when a Songweaver plays a major-key song near them (by NPC id, like the idle lines in
 * shared/quests.ts). A minor key or Discord in town gets no line. server/songs.ts BuskingLines says them (BUSKING).
 */
export const BUSKING_LINES: Record<string, string> = {
  druid: "A lute on the square. The bonfire has not heard a tune like that since my knees were young.",
  weaponsmith: "Play on, minstrel. The hammer keeps better time with a song.",
  witch: "Hm. Mind the notes near my jars. Some of them hum when you do.",
  armourer: "My stall has been quiet all morning. Your tune has the whole square lingering.",
  captain: "Hymns and jigs, fine. Play a sour note near the gate and we will have words.",
  fisher: "You play like my mother sang. Thank you for that.",
};

/**
 * Busking lines: how near (px) the villager must stand to hear the tune, how long (ms) before it speaks again, and how
 * near (px) a hero must stand to the villager to hear its answer (a local line, not a server-wide one).
 */
export const BUSKING = { range: 4 * TILE, cooldownMs: 60_000, hearRange: 12 * TILE };

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
