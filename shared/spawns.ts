import { actMobLevel, actOfTile, actSpecialLevel, BADLANDS_LEVEL, inDeepRow, ELITE, MobKind, MOORS_LEVEL, SINKHOLES_LEVEL, CROWN_LEVEL, TILE } from "./constants";
import { D, SUNSTONE } from "./desert";
import { MOORSGATE_MOORS } from "./moors";
import { REDPASS_BADLANDS } from "./badlands";
import { MAW_LEDGE_RECT, SINKWAY_SINKHOLES, SR } from "./sinkholes";
import { CR, crownGateTile, CROWNWAYS, THRONE_HALL } from "./crown";
import { AREAS, isSafeZone, isSolidAt, OBJECTS, T, VILLAGE } from "./map";
import { CAMP_POSTS, campMobs } from "./bandits";
import { AMBUSH_ROOMS, chamberAtPx, FLOORS, LAIRS, LANDING, pointInChamber } from "./dungeon";

/**
 * Monster spawn zones. Each zone keeps up to `mobs[kind]` monsters alive. Every `respawnMs` its timer fires
 * and brings back ONE missing monster (so a cleared zone refills gradually, not all at once).
 * Rects are in tiles; names match the map areas shown in the area banner.
 */
export interface SpawnZone {
  name: string;
  x: number; y: number; w: number; h: number;
  mobs: Partial<Record<MobKind, number>>;
  levels: [number, number]; // min, max monster level in this zone
  respawnMs: number;
  /** Broad wild zone: spawns skip the named areas inside it, and levels follow the distance of each spawn point. */
  wild?: boolean;
}

/** Random level within the zone's range. */
export function rollLevel(z: SpawnZone): number {
  const [lo, hi] = z.levels;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Peaceful places inside monster zones (with a margin in tiles): nothing spawns or walks in there. */
export const NO_MOB_AREAS = ["Saltmere", "Kel Ashar", "The Sunstone Circle", "The Sun Furnace", // Act 2: the oasis town, the waygate's circle and the final fight's plateau
  "Cairnwatch", "The Moorgate", // Act 3: the outpost (walls and all) and the moorgate's arrival clearing
  "The Rustwater Post", "The Red Pass", // Act 4: the outpost (walls and all) and the Red Pass's arrival clearing
  "Ropewell", "The Sinkway", // Act 5: the outpost (walls and all) and the Sinkway's arrival clearing
  "Tollcross", ...CROWNWAYS.map((c) => c.name)]; // Act 6: the Truce Market and the five Crownways' daises on the rim
const NO_MOB_RECTS = NO_MOB_AREAS.flatMap((n) => AREAS.filter((a) => a.name === n)).map((a) => ({ x0: a.x - 2, y0: a.y - 2, x1: a.x + a.w + 2, y1: a.y + a.h + 2 }));
/** True where monsters may not go (pixel coords). */
export function noMobsAt(px: number, py: number): boolean {
  const tx = px / TILE, ty = py / TILE;
  for (const r of NO_MOB_RECTS) if (tx >= r.x0 && tx < r.x1 && ty >= r.y0 && ty < r.y1) return true; // (asked for every monster step: no closure)
  return false;
}

/** Mother Blobs keep this many tiles away from Oakvale's stockade (Murat 2026-11-03): no spawning, no wandering in. */
export const MOTHER_KEEP_OUT = 16;
/** Distance in tiles from a pixel point to the village stockade rect (0 inside). */
export function villageDist(px: number, py: number): number {
  const v = VILLAGE, tx = px / TILE, ty = py / TILE;
  const dx = Math.max(v.x0 - tx, 0, tx - (v.x1 + 1)), dy = Math.max(v.y0 - ty, 0, ty - (v.y1 + 1));
  return Math.hypot(dx, dy);
}
/** True where a monster of this kind may not stand because it is too close to the village. */
export function tooNearVillage(kind: MobKind, px: number, py: number): boolean {
  return kind === "motherblob" && villageDist(px, py) < MOTHER_KEEP_OUT;
}

/** Monsters per area. Rects come from the map's AREAS (shared/map.ts), so zones follow the map layout. */
const ZONE_MOBS: { name: string; mobs: Partial<Record<MobKind, number>>; respawnMs: number; wild?: boolean; fixed?: boolean; levels?: [number, number] }[] = [
  // Levels come from the distance to Oakvale (see zoneLevels)
  // Blob zones above Lv 3 add shooter + warrior blobs, above Lv 5 healer blobs too.
  // Skeleton zones from Lv 5 add skeleton mages; the deepest ones (Barrow Downs, the Keep) an elite Necromancer too.
  // Blobs live in the green and wet places (meadows, fields, ponds, forests), skeletons where the dead lie (graveyards, ruins)
  { name: "North Meadow", mobs: { slime: 16, motherblob: 2 }, respawnMs: 4500 },
  { name: "Goldenreach Farms", mobs: { slime: 18, motherblob: 2 }, respawnMs: 4500 },
  { name: "Mirror Pond", mobs: { slime: 8, shooterblob: 3, warriorblob: 3, motherblob: 2 }, respawnMs: 5250 },
  { name: "Misty Marsh", mobs: { slime: 15, motherblob: 2 }, respawnMs: 4500 },
  // Set-level zones span the quest's minimum level to +3 (Murat 2026-11-04: average to difficult). Nothing regular
  // goes past REGION_LEVEL.mob (25) in this region.
  // The undead are the Pale Marshal's army (skeleton quest chain): their zones have set levels, a step tougher than
  // the blobs around them, so the chain starts mid-way through the blob story and climbs along beside it (Murat 2026-11-03).
  { name: "Stonecrag Quarry", mobs: { skeleton: 10 }, respawnMs: 7500, levels: [6, 9] },
  { name: "Old Ruins", mobs: { skeleton: 10, skeletonmage: 3 }, respawnMs: 8250, levels: [8, 11] },
  { name: "Old Watchtower", mobs: { skeleton: 7, skeletonmage: 3 }, respawnMs: 8250, levels: [10, 13] },
  // The wider world: further from Oakvale, tougher monsters
  { name: "Sunken Lake", mobs: { slime: 8, shooterblob: 4, warriorblob: 4, healerblob: 3, motherblob: 2 }, respawnMs: 6000 },
  { name: "Barrow Downs", mobs: { skeleton: 14, skeletonmage: 5, necromancer: 1 }, respawnMs: 6750, levels: [12, 15] },
  { name: "Gravemoor Cemetery", mobs: { skeleton: 14, skeletonmage: 5, necromancer: 2 }, respawnMs: 6750, levels: [15, 18] },
  { name: "Thornwood", mobs: { slime: 8, shooterblob: 6, warriorblob: 6, healerblob: 4, motherblob: 2 }, respawnMs: 6000 },
  { name: "Greywatch Keep", mobs: { skeleton: 11, skeletonmage: 5, necromancer: 2 }, respawnMs: 8250, levels: [19, 22] },
  // The coast and the far east (Saltmere itself stays monster-free, see NO_MOB_AREAS)
  // Redfang Hollow is a small organised camp (shared/bandits.ts): one bandit per post, no density scaling
  { name: "Redfang Hollow", mobs: { bandit: CAMP_POSTS.length }, respawnMs: 20000, fixed: true, levels: [19, 22] },
  // The west coast, where the Gloam's story ends (blob quests 6 and 7): set levels so the chain climbs evenly
  { name: "Brinewood", mobs: { slime: 8, shooterblob: 6, warriorblob: 6, healerblob: 5, motherblob: 2 }, respawnMs: 6000, levels: [10, 13] },
  { name: "Heronwreck Strand", mobs: { slime: 8, shooterblob: 5, warriorblob: 5, healerblob: 4, motherblob: 3 }, respawnMs: 6000, levels: [12, 15] },
  // Redfang raiders pillaging the Saltmere fishers' smokehouse (Redfang quest chain), on the coast well away from their camp
  { name: "Gullrock Cove", mobs: { bandit: 6 }, respawnMs: 12000, fixed: true, levels: [17, 20] },
  // The elemental wilds deep in the eastern woods (blob quests 8-11): each its own elemental blob, set levels from the end
  // of the Gloam's first story (Lv 12-15) up to the region's ceiling, climbing toward the Hollow Crown (Lv 24+)
  { name: "Blightmire Fen", mobs: { venomblob: 10, slime: 3, healerblob: 3, motherblob: 1 }, respawnMs: 6000, levels: [14, 17] },
  { name: "Rimewater Hollow", mobs: { frostblob: 10, warriorblob: 3, healerblob: 2, motherblob: 1 }, respawnMs: 6000, levels: [17, 20] },
  { name: "Cinder Scar", mobs: { fireblob: 10, warriorblob: 3, shooterblob: 3, motherblob: 1 }, respawnMs: 6000, levels: [20, 23] },
  { name: "Stormbreak Crags", mobs: { stormblob: 12, warriorblob: 3, shooterblob: 3, motherblob: 2 }, respawnMs: 6000, levels: [22, 25] },
  // The Mawdeep Warrens (shared/dungeon.ts): three floors of beast-folk under the woods, a step past the elemental
  // wilds and up to the region's ceiling. Hand-set counts (a warren full of packs, not a carpet of monsters).
  // The lairs come first so their elites keep their own zone.
  // the elites and mini-bosses guard their lair's chest (chests.ts LAIRS): no zone spawns of their own, only the lair's levels
  { name: "Gorehowl's Lair", mobs: {}, respawnMs: 150000, fixed: true, levels: [26, 26] },
  { name: "The Hornbrute's Byre", mobs: {}, respawnMs: 150000, fixed: true, levels: [27, 27] },
  { name: "Gnasher's Warren", mobs: {}, respawnMs: 150000, fixed: true, levels: [23, 23] },
  { name: "The Weaver's Loom", mobs: {}, respawnMs: 150000, fixed: true, levels: [25, 25] },
  { name: "The Gnawing Halls", mobs: { gnawkin: 24, tuskborn: 10, crowseer: 3 }, respawnMs: 7000, fixed: true, levels: [21, 23] },
  { name: "The Silk Pens", mobs: { silkwretch: 13, duskwing: 10, gnawkin: 9, crowseer: 5 }, respawnMs: 7000, fixed: true, levels: [23, 25] },
  { name: "The Hide-Mother's Den", mobs: { tuskborn: 9, duskwing: 8, silkwretch: 7, gnawkin: 7, crowseer: 5 }, respawnMs: 8000, fixed: true, levels: [24, 25] },
  // The Lantern Crypt under Barrow Downs (shared/dungeon.ts, Act 1): the monks' dead, woken when their lamps went out.
  // Underground, so the day never sends them back to their graves (server UNDEAD_ZONES leaves dungeon floors out).
  { name: "The High Choir", mobs: {}, respawnMs: 150000, fixed: true, levels: [17, 17] }, // the Hollow Abbot's hall: his alone
  { name: "The Lamplit Catacombs", mobs: { skeleton: 22, skeletonmage: 7 }, respawnMs: 7000, fixed: true, levels: [13, 15] },
  { name: "The Bone Choir", mobs: { skeleton: 18, skeletonmage: 9, necromancer: 2 }, respawnMs: 7500, fixed: true, levels: [15, 17] },
  // The Undercity below Kharsun (Act 2): the Sand-Dead keep the bazaar and the vault, scorpions nest in the cisterns,
  // the Veiled Circle's grave-robbers dig for the Water-Kings' gold
  { name: "The Water-King's Throne", mobs: {}, respawnMs: 150000, fixed: true, levels: [44, 44] },
  { name: "The Sunken Bazaar", mobs: { sanddead: 16, scorpion: 8, veiled: 4 }, respawnMs: 7000, fixed: true, levels: [40, 42] },
  { name: "The Vault of the Water-Kings", mobs: { sanddead: 14, sphinx: 5, veiled: 6 }, respawnMs: 7500, fixed: true, levels: [42, 44] },
  { name: "Saltwind Coast", mobs: { slime: 14, shooterblob: 5, warriorblob: 5, healerblob: 4, motherblob: 2 }, respawnMs: 4500 },
  { name: "Whispering Woods", mobs: { slime: 10, shooterblob: 4, warriorblob: 4, healerblob: 3, motherblob: 2 }, respawnMs: 5250, wild: true }, // broad areas last: zone lookups take the first match
  // Everything west of the river that no named area covers: fields, roads and woods around Oakvale
  { name: "Oakvale Countryside", mobs: { slime: 10, shooterblob: 3, warriorblob: 3, healerblob: 2, motherblob: 2 }, respawnMs: 5250, wild: true },
  // ---- Act 2, the Sunscar (shared/desert.ts): Lv 30-47, climbing away from the Sunstone Circle toward the Thornspire.
  // Dustrider raiders and scorpions on the open sand, the Sand-Dead and their winged sphinx guardians in buried Kharsun, the camel-folk in the mesas and the
  // eastern dunes, the Veiled Circle's adepts up in the Thornspire round their sanctum.
  { name: "The Glasswind Flats", mobs: { scorpion: 6, nomad: 4 }, respawnMs: 5000, levels: [30, 32] },
  { name: "Palmshade Oasis", mobs: { scorpion: 6, nomad: 3 }, respawnMs: 5500, levels: [31, 33] },
  { name: "Jackal Springs", mobs: { nomad: 6, scorpion: 3 }, respawnMs: 5500, levels: [33, 35] },
  { name: "Dustrider Camp", mobs: { nomad: 14 }, respawnMs: 6000, levels: [34, 37] },
  { name: "Kharsun, the Buried City", mobs: { sanddead: 12, sphinx: 4 }, respawnMs: 6500, levels: [36, 39] },
  { name: "The Humpback Mesas", mobs: { camelfolk: 10, scorpion: 3 }, respawnMs: 6500, levels: [38, 41] },
  { name: "The Saffron Dunes", mobs: { scorpion: 12, camelfolk: 3 }, respawnMs: 6000, levels: [40, 43] },
  { name: "Mirage Wells", mobs: { camelfolk: 5, scorpion: 4, veiled: 3, sphinx: 2 }, respawnMs: 6500, levels: [41, 44] },
  { name: "The Veiled Sanctum", mobs: { veiled: 12 }, respawnMs: 8000, fixed: true, levels: [45, 47] },
  { name: "The Sun Furnace", mobs: {}, respawnMs: 150000, fixed: true, levels: [47, 47] }, // the final fight (no zone spawns)
  { name: "The Thornspire Heights", mobs: { veiled: 8, camelfolk: 4, sanddead: 3, sphinx: 4 }, respawnMs: 7000, levels: [43, 46] },
  { name: "The Red Wastes", mobs: { nomad: 6, scorpion: 8 }, respawnMs: 6000, wild: true },
  { name: "The Sunscar", mobs: { scorpion: 10, nomad: 6, camelfolk: 2 }, respawnMs: 6000, wild: true }, // the open desert, last
  // ---- Act 3, the Grey Barrow Moors (shared/moors.ts): Lv 20-33, climbing away from Cairnwatch toward the Host's camp on the
  // far eastern moor; the Barrow-King (Lv 35) under Kingsbarrow. The Host's dead (wights, bone hounds, legionaries, the
  // Cairn-Lords) keep the barrows and the stone rings and, like the valley's dead, keep the night (server UNDEAD_ZONES:
  // a zone of only undead is thin by day). The mist wraiths are the Host's dead too; only the zones with bog hags stay full by day.
  { name: "The Grey Ring", mobs: { wight: 6, bonehound: 4 }, respawnMs: 6000, levels: [21, 24] },
  { name: "Sorrow Mire", mobs: { boghag: 6, bonehound: 3 }, respawnMs: 6000, levels: [22, 25] },
  { name: "Thane's Rest", mobs: { wight: 6, legionary: 3 }, respawnMs: 6500, levels: [23, 26] },
  { name: "The Cairnfield", mobs: { wight: 8, bonehound: 4, cairnlord: 1 }, respawnMs: 6500, levels: [25, 28] },
  { name: "Blackwater Fen", mobs: { boghag: 6, mistwraith: 4 }, respawnMs: 6000, levels: [26, 29] },
  { name: "The Hollow Mounds", mobs: { wight: 6, legionary: 4, mistwraith: 2 }, respawnMs: 6500, levels: [27, 30] },
  { name: "The Drowned Hollow", mobs: { mistwraith: 6, boghag: 4 }, respawnMs: 6500, levels: [28, 31] },
  { name: "The Nine Widows", mobs: { mistwraith: 6, wight: 4 }, respawnMs: 6500, levels: [29, 32] },
  { name: "The Weeping Stones", mobs: { mistwraith: 5, legionary: 4, cairnlord: 1 }, respawnMs: 7000, levels: [30, 33] },
  // the Barrow-King's own mound: his alone, only at night (NIGHT_BOSSES), a long wait between kings (server SLOW_RISE)
  { name: "The Barrow-King's Mound", mobs: { barrowking: 1 }, respawnMs: 300000, fixed: true, levels: [35, 35] },
  { name: "Kingsbarrow", mobs: { wight: 6, legionary: 5, bonehound: 3, cairnlord: 1 }, respawnMs: 7000, levels: [31, 33] },
  { name: "The Host's Muster", mobs: { legionary: 8, bonehound: 4, cairnlord: 1 }, respawnMs: 7000, levels: [31, 33] },
  // the open moor: hounds and wights on the heather, a hag or two by every pool (so it stays alive by day); levels by distance
  { name: "The Grey Barrow Moors", mobs: { bonehound: 6, wight: 5, boghag: 3 }, respawnMs: 6000, wild: true },
  // ---- Act 4, the Red Badlands (shared/badlands.ts): Lv 25-38, climbing west from the Rustwater Post toward Fangrock;
  // Old Rourke (Lv 40) in Fangrock's keep. Living things all: the Redfang and their dogs, the vultures and the rattlers
  // keep the day as well as the night (nothing here thins by day, server UNDEAD_ZONES). Fangrock and Talon Fort are
  // organised camps like Redfang Hollow (shared/bandits.ts CAMPS: one monster per post, no density scaling).
  { name: "The Saltlick Flats", mobs: { rattler: 6, vulture: 4 }, respawnMs: 6000, levels: [25, 28] },
  { name: "Drovers' Draw", mobs: { warhound: 5, outrider: 3, vulture: 2 }, respawnMs: 6000, levels: [25, 28] },
  { name: "The Hanging Arches", mobs: { vulture: 5, rattler: 4, outrider: 3 }, respawnMs: 6000, levels: [27, 30] },
  { name: "The Cinnabar Pits", mobs: { firebrand: 5, outrider: 4, crossbowman: 3 }, respawnMs: 6500, levels: [28, 31] },
  { name: "Bloodstone Mesa", mobs: { vulture: 5, warhound: 5, crossbowman: 3, redcaptain: 1 }, respawnMs: 6500, levels: [29, 32] },
  { name: "Talon Fort", mobs: campMobs("Talon Fort"), respawnMs: 20000, fixed: true, levels: [32, 35] },
  { name: "Vulture's Roost", mobs: { vulture: 8, rattler: 3 }, respawnMs: 6500, levels: [33, 36] },
  { name: "Rattlesnake Gulch", mobs: { rattler: 7, outrider: 4, firebrand: 3 }, respawnMs: 6500, levels: [33, 36] },
  { name: "Gallows Canyon", mobs: { crossbowman: 5, outrider: 5, warhound: 4, redcaptain: 1 }, respawnMs: 7000, levels: [35, 38] },
  // Old Rourke's keep: his alone, by day and night (a living lord, not a night boss), a long wait for a new Fang-Father
  { name: "Fangrock Keep", mobs: { rourke: 1 }, respawnMs: 300000, fixed: true, levels: [40, 40] },
  { name: "Fangrock", mobs: campMobs("Fangrock"), respawnMs: 20000, fixed: true, levels: [36, 38] },
  // the open badlands: vultures overhead, rattlers under the rocks, stray warhounds; levels by distance (last in its block)
  { name: "The Red Badlands", mobs: { vulture: 5, rattler: 5, warhound: 4 }, respawnMs: 6000, wild: true },
  // ---- Act 5, the Mawdeep Sinkholes (shared/sinkholes.ts): Lv 30-43, climbing south-east from Ropewell toward Hidehall;
  // the Maw-Father (Lv 45) on his ledge down in the Great Maw. Living things all (nothing here thins by day). Hidehall is
  // an organised camp like the badlands' forts (shared/bandits.ts CAMPS: one monster per post). Every land keeps its
  // 7x7 hold patch clear for the war (shared/sinkholes.ts SINK_LANDS).
  { name: "Rootfall Slopes", mobs: { stagkin: 4, cackler: 4, delver: 3 }, respawnMs: 6000, levels: [30, 33] },
  { name: "Hollowbrook Dells", mobs: { cackler: 5, stagkin: 3, quillback: 2, sinkworm: 2 }, respawnMs: 6000, levels: [31, 34] },
  { name: "The Old Warren", mobs: { delver: 6, quillback: 3, stitcher: 2 }, respawnMs: 6000, levels: [32, 35] },
  { name: "Tunneltop", mobs: { delver: 5, cackler: 4, stitcher: 2, hidechief: 1 }, respawnMs: 6500, levels: [34, 37] },
  { name: "Mosslight Fen", mobs: { quillback: 4, stitcher: 3, cackler: 3, stagkin: 2 }, respawnMs: 6500, levels: [35, 38] },
  { name: "The Pitfields", mobs: { sinkworm: 5, delver: 4, quillback: 3, stitcher: 2 }, respawnMs: 6500, levels: [36, 39] },
  { name: "The Gnawed Bank", mobs: { delver: 5, quillback: 3, stitcher: 2, hidechief: 1 }, respawnMs: 6500, levels: [37, 40] },
  { name: "Scratchroot Burrows", mobs: { delver: 5, cackler: 4, stitcher: 2 }, respawnMs: 7000, levels: [38, 41] },
  { name: "Rushmere Hollows", mobs: { stagkin: 5, cackler: 4, quillback: 3, hidechief: 1 }, respawnMs: 7000, levels: [39, 42] },
  { name: "Hidehall", mobs: campMobs("Hidehall"), respawnMs: 20000, fixed: true, levels: [40, 43] },
  // the Maw-Father's ledge: his alone, by day and night (a living lord, not a night boss), a long wait for a new one
  { name: "The Great Maw", mobs: { mawfather: 1 }, respawnMs: 300000, fixed: true, levels: [45, 45] },
  // the open sinkholes: cackler packs, stray stagkin and delvers, worms in the lesser sinks; levels by distance (last in its block)
  { name: "The Mawdeep Sinkholes", mobs: { cackler: 4, stagkin: 3, delver: 3, sinkworm: 1 }, respawnMs: 6000, wild: true },
  // ---- Act 6, the Crown of the Marches (shared/crown.ts): Lv 40-48, the five approaches inside the Crownways first
  // (40-44), the four lands round the Keep's hill next (43-47), the Keep's bailey last (46-48); the Riven King (Lv 50) on
  // his throne in the Throne Hall. The living and the cursed dead alike walk by day and night. Every land keeps its 7x7
  // hold patch clear for the war (shared/crown.ts CROWN_LANDS).
  { name: "The Pilgrims' Way", mobs: { oathbreaker: 6, gildhound: 3, crowncrow: 2 }, respawnMs: 6500, levels: [40, 43] },
  { name: "The Field of Statues", mobs: { oathbreaker: 5, crownguard: 3, crowncrow: 2, hollowherald: 2 }, respawnMs: 6500, levels: [40, 43] },
  { name: "The Spirefall", mobs: { crowncrow: 3, courtmagus: 3, gildhound: 3, oathbreaker: 3 }, respawnMs: 6500, levels: [40, 43] },
  { name: "The Sunken Courts", mobs: { crownguard: 4, hollowherald: 3, oathbreaker: 3 }, respawnMs: 6500, levels: [41, 44] },
  { name: "The Ember Gardens", mobs: { gildhound: 4, pretender: 3, courtmagus: 2, crowncrow: 2 }, respawnMs: 6500, levels: [41, 44] },
  { name: "The Tourney Grounds", mobs: { oathbreaker: 4, gildhound: 4, pretender: 2, thronewarden: 1 }, respawnMs: 7000, levels: [42, 45] },
  { name: "The Gilded Ruins", mobs: { courtmagus: 4, pretender: 4, crowncrow: 2 }, respawnMs: 7000, levels: [43, 46] },
  { name: "The Mourning Gardens", mobs: { hollowherald: 4, oathbreaker: 4, crowncrow: 2 }, respawnMs: 7000, levels: [43, 46] },
  { name: "The Vigil Courts", mobs: { crownguard: 4, pretender: 3, hollowherald: 2, thronewarden: 1 }, respawnMs: 7000, levels: [44, 47] },
  // the Riven King on his broken throne: his alone, by day and night, a long wait for him to sit again (before the
  // Keep, so the hall inside the bailey is his zone)
  { name: "The Throne Hall", mobs: { rivenking: 1 }, respawnMs: 300000, fixed: true, levels: [50, 50] },
  { name: "The Crown Keep", mobs: { crownguard: 4, oathbreaker: 3, courtmagus: 2, hollowherald: 2, thronewarden: 1 }, respawnMs: 7500, levels: [46, 48] },
  // the open Crown: knights who never found the road home, stray hounds of the old hunt, crows over the ruins; levels by
  // distance (last in its block)
  { name: "The Crown of the Marches", mobs: { oathbreaker: 5, gildhound: 3, crowncrow: 2 }, respawnMs: 6500, wild: true },
];
/** Wild zones that are not map areas (no banner, no map label): their rect in tiles. */
const WILD_RECTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  "Oakvale Countryside": { x: 0, y: 0, w: 109, h: 184 },
};
/** Boss halls inside a bigger zone (rect in tiles): only their own zone spawns there (the Riven King's Throne Hall in the Keep). */
const BOSS_HALLS: { name: string; x: number; y: number; w: number; h: number }[] = [{ name: "The Throne Hall", ...THRONE_HALL, y: CR(THRONE_HALL.y) }];
/** The boss hall a tile lies in, if any (a monster from another zone must not end up inside one). */
export const bossHallAt = (tx: number, ty: number) => BOSS_HALLS.find((l) => tx >= l.x && tx < l.x + l.w && ty >= l.y && ty < l.y + l.h)?.name;
/** Zones smaller than their map area (rect in tiles): the Maw-Father keeps to his ledge down in the Great Maw. */
const ZONE_RECTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  "The Great Maw": { ...MAW_LEDGE_RECT, y: SR(MAW_LEDGE_RECT.y) },
};

/**
 * Density (Murat wants monsters everywhere): every zone keeps at least one monster per this many walkable tiles.
 * Wild zones are a bit thinner than the named hunting grounds. Elites (necromancers) keep their hand-set count.
 */
export const DENSITY = { tilesPerMob: 9, wildTilesPerMob: 12, desertTilesPerMob: 18, desertWildTilesPerMob: 28, // the desert is wide open: thinner
  moorsTilesPerMob: 15, moorsWildTilesPerMob: 30, // the moors: packs on the barrows and fens, the open heather between them thin
  badlandsTilesPerMob: 16, badlandsWildTilesPerMob: 34, // the badlands: Redfang bands in the canyons and pits, the flats between them empty
  sinkholesTilesPerMob: 18, sinkholesWildTilesPerMob: 46, // the sinkholes: Hide-Kin in their warrens and fens, the land between them quiet
  crownTilesPerMob: 24, crownWildTilesPerMob: 60 }; // the Crown: the court in its ruined lands, the roads between them quiet
/** Blob variants only appear from these levels (Murat: shooter + warrior above Lv 3, healer above Lv 5). */
export const KIND_MIN_LEVEL: Partial<Record<MobKind, number>> = { shooterblob: 4, warriorblob: 4, healerblob: 6, venomblob: 12, frostblob: 14, fireblob: 16, stormblob: 18 };

/**
 * Monster levels grow with distance from the village centre: zones next to Oakvale are level 1-3,
 * and every 8 tiles further out adds a level (each zone spans 3 levels).
 */
export function zoneLevels(a: { x: number; y: number; w: number; h: number }): [number, number] {
  const lo = baseLevelAt(a.x + a.w / 2, a.y + a.h / 2);
  return [lo, lo + 2];
}
/** The Crownways' Crown-side gates (map tiles): Act 6's levels grow with the distance to the nearest. */
const CROWN_ARRIVALS = CROWNWAYS.map(crownGateTile);
/** Lowest monster level at a tile, from its distance to the village centre (a spot spans this level to +2). */
export function baseLevelAt(tx: number, ty: number): number {
  const act = actOfTile(tx, ty);
  // Act 6: from Lv 40 at the Crownways on the rim, a level every 10 tiles from the nearest one, inward toward the Keep
  if (act === 6) return CROWN_LEVEL.min + Math.floor(Math.max(0, Math.min(...CROWN_ARRIVALS.map((a) => Math.hypot(tx - a.x, ty - a.y))) - 12) / CROWN_LEVEL.tilesPerLevel);
  // Act 5: from Lv 30 at the Sinkway (the band's north-west), a level every 12 tiles further on, south-east toward Hidehall
  if (act === 5) return SINKHOLES_LEVEL.min + Math.floor(Math.max(0, Math.hypot(tx - SINKWAY_SINKHOLES.x, ty - SINKWAY_SINKHOLES.y) - 12) / SINKHOLES_LEVEL.tilesPerLevel);
  // Act 4: from Lv 25 at the Red Pass (the band's east edge), a level every 16 tiles further on, west toward Fangrock
  if (act === 4) return BADLANDS_LEVEL.min + Math.floor(Math.max(0, Math.hypot(tx - REDPASS_BADLANDS.x, ty - REDPASS_BADLANDS.y) - 12) / BADLANDS_LEVEL.tilesPerLevel);
  // Act 3: from Lv 20 at the moorgate, a level every 10 tiles further out (held under MOORS_LEVEL by levelFns)
  if (act === 3) return MOORS_LEVEL.min + Math.floor(Math.max(0, Math.hypot(tx - MOORSGATE_MOORS.x, ty - MOORSGATE_MOORS.y) - 12) / MOORS_LEVEL.tilesPerLevel);
  // Act 2: from Lv 30 at the Sunstone Circle, a level every 12 tiles further out
  if (act === 2) return 30 + Math.floor(Math.max(0, Math.hypot(tx - SUNSTONE.x, ty - D(SUNSTONE.y)) - 12) / 12);
  const cx = (VILLAGE.x0 + VILLAGE.x1) / 2, cy = (VILLAGE.y0 + VILLAGE.y1) / 2;
  return 1 + Math.floor(Math.max(0, Math.hypot(tx - cx, ty - cy) - 40) / 8);
}

/** The level ceilings for a zone or a tile: its act's band (shared/constants.ts ACT_LEVEL: Oakvale Lv 25/30, the desert Lv 30-47/50, the moors Lv 20-33/35, the badlands Lv 25-38/40, the sinkholes Lv 30-43/45, the Crown Lv 40-48/50). */
const levelFns = (tx: number, ty: number) => {
  const act = actOfTile(tx, ty);
  return { mob: (l: number) => actMobLevel(act, l), special: (l: number) => actSpecialLevel(act, l) };
};

const inRect = (r: { x: number; y: number; w: number; h: number }, tx: number, ty: number) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h;
/** Areas so broad they never keep a wild zone's monsters out (they hold other zones). */
const BROAD_AREAS = ["Whispering Woods", "River Ashwell", "The Sunscar", "The Grey Barrow Moors", "The Red Badlands", "The Dry Ashwell", "The Mawdeep Sinkholes", "The Crown of the Marches"];
/** Named areas (and Oakvale's surroundings) a wild zone leaves alone: its monsters stay in their own biome. */
function claimedByArea(name: string, tx: number, ty: number): boolean {
  let list = claimCache.get(name);
  if (!list) claimCache.set(name, list = AREAS.filter((a) => a.name !== name && !BROAD_AREAS.includes(a.name)));
  for (const a of list) if (inRect(a, tx, ty)) return true;
  return false;
}
/** Per zone, the areas that keep it out (filtered once: this runs for every tile of every wild zone at start-up). */
const claimCache = new Map<string, { x: number; y: number; w: number; h: number }[]>();
/** Tiles where this zone may spawn a monster. */
function spawnable(z: { name: string; wild?: boolean }, tx: number, ty: number): boolean {
  const v = VILLAGE;
  if (tx >= v.x0 - 2 && tx <= v.x1 + 2 && ty >= v.y0 - 2 && ty <= v.y1 + 2) return false;
  if (z.wild && claimedByArea(z.name, tx, ty)) return false;
  if (LAIRS.some((l) => l.name !== z.name && inRect(l, tx, ty))) return false; // a lair is its elite's alone (and the boss bed nobody's)
  if (BOSS_HALLS.some((l) => l.name !== z.name && inRect(l, tx, ty))) return false; // (the Riven King's hall is his)
  const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
  if (noMobsAt(x, y) || isSafeZone(x, y)) return false;
  const solid = isSolidAt; // one getter call under tsx (the tests), not four
  return !solid(x - 6, y - 6) && !solid(x + 6, y + 6) && !solid(x - 6, y + 6) && !solid(x + 6, y - 6);
}

export const SPAWN_ZONES: SpawnZone[] = ZONE_MOBS.flatMap((z) => {
  const a = ZONE_RECTS[z.name] ?? AREAS.find((area) => area.name === z.name) ?? WILD_RECTS[z.name];
  if (!a) return [];
  const r = { x: a.x, y: a.y, w: a.w, h: a.h };
  // Walkable tiles -> how many monsters (kinds keep their mix, elites stay as set)
  let tiles = 0, lo = 99, hi = 0;
  for (let ty = r.y; ty < r.y + r.h; ty++) for (let tx = r.x; tx < r.x + r.w; tx++) {
    if (!spawnable(z, tx, ty)) continue;
    tiles++;
    if (z.wild) { const l = baseLevelAt(tx, ty); lo = Math.min(lo, l); hi = Math.max(hi, l + 2); }
  }
  const base = Math.max(1, Object.values(z.mobs).reduce((n, c) => n + (c ?? 0), 0));
  // each act its own density (the Undercity under the desert is hand-set, a dungeon floor like the Mawdeep's)
  const act = actOfTile(r.x, r.y), desert = act === 2 && !inDeepRow(r.y);
  const per = act === 6 ? (z.wild ? DENSITY.crownWildTilesPerMob : DENSITY.crownTilesPerMob)
    : act === 5 ? (z.wild ? DENSITY.sinkholesWildTilesPerMob : DENSITY.sinkholesTilesPerMob)
    : act === 4 ? (z.wild ? DENSITY.badlandsWildTilesPerMob : DENSITY.badlandsTilesPerMob)
    : act === 3 ? (z.wild ? DENSITY.moorsWildTilesPerMob : DENSITY.moorsTilesPerMob)
    : desert ? (z.wild ? DENSITY.desertWildTilesPerMob : DENSITY.desertTilesPerMob) : z.wild ? DENSITY.wildTilesPerMob : DENSITY.tilesPerMob;
  const want = Math.round(tiles / per);
  const f = z.fixed ? 1 : Math.max(1, want / base); // fixed: hand-set count
  const mobs: Partial<Record<MobKind, number>> = {};
  for (const [k, n] of Object.entries(z.mobs) as [MobKind, number][]) mobs[k] = ELITE[k] ? n : k === "motherblob" ? Math.max(n, Math.round(n * f / 4)) : Math.round(n * f); // elites keep their count, big ones grow slower
  const raw: [number, number] = z.levels ?? (z.wild && hi > 0 ? [lo, hi] : zoneLevels(r));
  const L = levelFns(r.x, r.y), lvl = (Object.keys(z.mobs) as MobKind[]).every((k) => ELITE[k]) ? L.special : L.mob; // an elite's lair: the special ceiling
  const levels: [number, number] = [lvl(raw[0]), lvl(raw[1])];
  return [{ ...z, ...r, mobs, levels, respawnMs: Math.max(800, Math.round(z.respawnMs / f)) }];
});

export function zoneCap(z: SpawnZone): number {
  return Object.values(z.mobs).reduce((a, b) => a + (b ?? 0), 0);
}

/** Random walkable point inside a zone (never in the village or the safe zone; wild zones skip named areas). */
export function randomPointInZone(z: SpawnZone, kind?: MobKind): { x: number; y: number } {
  // A Mawdeep floor: nothing on its landing; about a third of its beast-folk wait in its ambush rooms
  const floor = FLOORS.find((f) => f.name === z.name);
  if (floor) {
    const rooms = AMBUSH_ROOMS[floor.id] ?? [];
    if (rooms.length && Math.random() < 0.32) for (let i = 0; i < 40; i++) {
      const p = pointInChamber(floor, rooms[Math.floor(Math.random() * rooms.length)]);
      if (spawnable(z, Math.floor(p.x / TILE), Math.floor(p.y / TILE))) return { x: (Math.floor(p.x / TILE) + 0.5) * TILE, y: (Math.floor(p.y / TILE) + 0.5) * TILE };
    }
  }
  for (let i = 0; i < 300; i++) {
    const tx = z.x + Math.floor(Math.random() * z.w);
    const ty = z.y + Math.floor(Math.random() * z.h);
    if (kind && tooNearVillage(kind, (tx + 0.5) * TILE, (ty + 0.5) * TILE)) continue;
    const ch = floor && chamberAtPx((tx + 0.5) * TILE, (ty + 0.5) * TILE);
    if (ch && (ch.index === LANDING || ch.floor.chambers[ch.index].secret)) continue; // the landing is safe; the secret rooms are sealed
    if (spawnable(z, tx, ty)) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }
  return { x: (z.x + z.w / 2) * TILE, y: (z.y + z.h / 2) * TILE };
}

/** Where and at what level a monster of this kind appears. In wild zones the level follows the spot. */
export function spawnPoint(z: SpawnZone, kind: MobKind): { x: number; y: number; level: number } {
  const min = KIND_MIN_LEVEL[kind] ?? 1, L = levelFns(z.x, z.y);
  if (!z.wild) return { ...randomPointInZone(z, kind), level: (ELITE[kind] ? L.special : L.mob)(Math.max(min, rollLevel(z))) };
  let best = randomPointInZone(z, kind), lvl = 0;
  for (let i = 0; i < 25; i++) {
    const p = i ? randomPointInZone(z, kind) : best;
    const l = baseLevelAt(p.x / TILE, p.y / TILE) + Math.floor(Math.random() * 3);
    if (l > lvl) { best = p; lvl = l; }
    if (l >= min) break; // variants only out where the levels are high enough
  }
  return { ...best, level: L.mob(Math.max(min, lvl)) };
}

/** The monster zone a tile belongs to (wild zones leave out the named areas inside them). */
export function zoneAt(tx: number, ty: number): SpawnZone | undefined {
  return SPAWN_ZONES.find((z) => inRect(z, tx, ty) && !(z.wild && claimedByArea(z.name, tx, ty)));
}

/** Level range shown for a zone at a tile: wild zones show the local range. */
export function levelsAt(z: SpawnZone, tx: number, ty: number): [number, number] {
  if (!z.wild) return z.levels;
  const l = baseLevelAt(tx, ty), L = levelFns(tx, ty);
  return [L.mob(l), L.mob(l + 2)];
}

/**
 * Hiding: skeletons slip into graves, slimes and bloblings into trees. A hidden monster can't be hit or seen
 * (only its eyes peek out) and jumps out when a player walks close. Dizzy (broken) monsters run for cover too.
 */
export const HIDE = {
  spots: { skeleton: [T.GRAVE], skeletonmage: [T.GRAVE], slime: [T.TREE, T.PINE], blobling: [T.TREE, T.PINE], shooterblob: [T.TREE, T.PINE], healerblob: [T.TREE, T.PINE], frostblob: [T.PINE],
    sanddead: [T.BONES, T.GRAVE], scorpion: [T.ROCK], // Act 2: the dead sink into the sand by their bones, scorpions creep under rocks
    wight: [T.BARROW, T.BONE_PILE], // Act 3: wights crawl back into their barrows
    rattler: [T.ROCK, T.CACTUS], // Act 4: rattlers coil up under rocks and in the cactus
    sinkworm: [T.PIT] } as Partial<Record<MobKind, number[]>>, // Act 5: the Gullet Worms lie buried in the pit floors (server/hidekin.ts)
  idleChance: 0.06, // per wander decision, chance an idle monster goes to hide
  idleRadius: 7, // tiles from home to look for a spot
  fleeRadius: 6, // tiles from the monster when it's dizzy
  ambushRange: 40, // px: a player this close makes a hidden monster jump out
  minMs: 10000, maxMs: 25000, // how long it stays hidden if nobody comes by
  regenPerSec: 0.04, // fraction of max HP healed per second while hidden
  seekMs: 7000, // give up walking to a spot after this long
  retryMs: 400, // after a search found no free spot, the same monster looks again no sooner than this (server CPU)
};

export interface HideSpot { key: string; x: number; y: number; outX: number; outY: number }

/** Nearest free hiding spot for `kind` within `radius` tiles of (px,py), with a walkable tile next to it to step in from. */
export function findHideSpot(kind: MobKind, px: number, py: number, radius: number, taken: Set<string>, ids = HIDE.spots[kind]): HideSpot | undefined {
  if (!ids) return undefined;
  const cx = Math.floor(px / TILE), cy = Math.floor(py / TILE);
  let best: HideSpot | undefined, bestD = Infinity;
  for (let ty = cy - radius; ty <= cy + radius; ty++) {
    for (let tx = cx - radius; tx <= cx + radius; tx++) {
      const o = OBJECTS[ty]?.[tx];
      if (o === undefined || !ids.includes(o) || taken.has(`${tx},${ty}`)) continue;
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
      if (isSafeZone(x, y)) continue;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const ox = x + dx * TILE, oy = y + dy * TILE;
        if (isSafeZone(ox, oy) || isSolidAt(ox - 5, oy - 5) || isSolidAt(ox + 5, oy + 5) || isSolidAt(ox - 5, oy + 5) || isSolidAt(ox + 5, oy - 5)) continue;
        const d = Math.hypot(ox - px, oy - py);
        if (d < bestD) { bestD = d; best = { key: `${tx},${ty}`, x, y, outX: ox, outY: oy }; }
      }
    }
  }
  return best;
}
