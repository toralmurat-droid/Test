import { T, AREAS, EMPTY, areaInfoAt, ELEMENT_LANDS, groundBefore, objectBefore, solidBefore } from "./map";
import { MobKind, MOBS, TILE, WORLD_H } from "./constants";
import { baseLevelAt, SPAWN_ZONES, zoneLevels } from "./spawns";
import { GEAR, LOOT_IDS, LOOT_LEVEL, rollAffixes, withLevel } from "./gear";
import { CHAINS, objectDone, QuestObject, Quester } from "./quests";
import { AMBUSH_CHEST, FLOORS } from "./dungeon";

/**
 * Loot chests only stand where there is a reason for them (Murat 2026-11-03):
 *  - Lairs: one chest per monster area, in its heart, watched by guardians (a Mother Blob, a Necromancer,
 *    a bandit crew...). The chest stays locked while any of its guardians lives; they come back GUARD_RESPAWN_MS later.
 *  - Story rewards: next to the last object of each "use" quest step (Tobin's cocoon, the Brood Heart...),
 *    locked until the player has done that step. Built from QUESTS, so they follow the quest data.
 * Placement is deterministic, so server and clients agree. Each account opens a chest once; it refills
 * CHEST_RESPAWN_MS later (one day/night cycle). Loot scales with the chest level (zone level).
 */
export type ChestTier = 1 | 2 | 3; // wooden, iron-bound, gilded
export interface Chest {
  id: string; x: number; y: number; level: number; tier: ChestTier; area: string;
  /** Lair chest: monsters that guard it (spawned around it by the server). */
  guards?: Partial<Record<MobKind, number>>;
  /** Story chest: the quest objects that must all be done first, and a hint shown while locked. */
  story?: { objects: QuestObject[]; hint: string };
}

export const CHEST_RANGE = TILE * 1.1; // px from the chest's feet to open it
export const CHEST_RESPAWN_MS = 30 * 60 * 1000;
export const GUARD_RESPAWN_MS = 4 * 60 * 1000;
/** How often the server counts lair guardians to see who is missing (their timers run in minutes). */
export const GUARD_CHECK_MS = 1000;
export const CHEST_NAMES = ["", "Wooden Chest", "Iron-bound Chest", "Gilded Chest"];

export const chestTier = (level: number): ChestTier => (level >= 11 ? 3 : level >= 5 ? 2 : 1);

/**
 * Lairs: area, its guardians, and where in the area the lair sits (fraction of the rect; default its middle).
 * Only monster areas: the village, the mill, the hunters' camp and Saltmere have nothing to guard.
 */
const LAIRS: { area: string; guards: Partial<Record<MobKind, number>>; at?: [number, number] }[] = [
  { area: "North Meadow", guards: { motherblob: 1 } },
  { area: "Goldenreach Farms", guards: { motherblob: 1 } },
  { area: "Misty Marsh", guards: { motherblob: 1 } },
  { area: "Mirror Pond", guards: { motherblob: 1, shooterblob: 1 } },
  { area: "Stonecrag Quarry", guards: { skeleton: 3 } },
  { area: "Old Ruins", guards: { skeleton: 2, skeletonmage: 1 } },
  { area: "Old Watchtower", guards: { skeletonmage: 2, skeleton: 1 } },
  { area: "Sunken Lake", guards: { motherblob: 1, healerblob: 1 }, at: [0.7, 0.65] }, // the west shore is Tobin's camp
  { area: "Barrow Downs", guards: { necromancer: 1 } },
  { area: "Greywatch Keep", guards: { necromancer: 1 } },
  { area: "Thornwood", guards: { motherblob: 1, warriorblob: 1 } },
  { area: "Redfang Hollow", guards: { banditchief: 1 }, at: [0.28, 0.5] }, // the yard between the bandit houses: the chief keeps the loot
  { area: "Saltwind Coast", guards: { motherblob: 1, shooterblob: 1 }, at: [0.3, 0.5] },
  { area: "Saltwind Coast", guards: { motherblob: 1, warriorblob: 1 }, at: [0.75, 0.5] },
  { area: "Whispering Woods", guards: { motherblob: 1, healerblob: 1 }, at: [0.55, 0.45] },
  { area: "Whispering Woods", guards: { motherblob: 1, warriorblob: 1 }, at: [0.75, 0.75] },
  // new lairs go last: chest ids are lair_<index>, saved per account
  { area: "Gravemoor Cemetery", guards: { necromancer: 1, skeleton: 2 }, at: [0.5, 0.38] }, // the hoard in the great mausoleum
  // the elemental wilds (Murat 2026-11-05)
  { area: "Blightmire Fen", guards: { motherblob: 1, venomblob: 2 }, at: [0.6, 0.3] },
  { area: "Rimewater Hollow", guards: { frostblob: 2, warriorblob: 1 }, at: [0.25, 0.7] },
  { area: "Cinder Scar", guards: { fireblob: 2, warriorblob: 1 }, at: [0.7, 0.65] },
  { area: "Stormbreak Crags", guards: { stormblob: 3 }, at: [0.65, 0.3] },
  // the Mawdeep Warrens (Murat 2026-11-05: mini-boss zones with chests): each elite keeps its hoard in its lair
  { area: "Gnasher's Warren", guards: { gnasher: 1, gnawkin: 2 } },
  { area: "The Weaver's Loom", guards: { weaver: 1, silkwretch: 2 } },
  { area: "Gorehowl's Lair", guards: { packlord: 1, gnawkin: 2 } },
  { area: "The Hornbrute's Byre", guards: { hornbrute: 1, tuskborn: 1 } },
];

const PATHS = new Set<number>([T.DIRT, T.COBBLE, T.BRIDGE, T.WATER]);
/**
 * Open ground (not a road), free all around in radius r, not inside a bush; `front`: also nothing tall just in front of it.
 * Read on the map before the land highways (shared/map.ts solidBefore): chest spots are pinned, a highway never moves one.
 */
function openSpot(tx: number, ty: number, r: number, front: boolean): boolean {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (solidBefore(tx + dx, ty + dy) || (PATHS.has(groundBefore(tx + dx, ty + dy)!) && ty < WORLD_H)) return false; // the Mawdeep is all earth floor
  }
  if (objectBefore(tx, ty) !== EMPTY) return false;
  // Iso view: nothing solid just in front (south/east), or a roof or tree would hide the chest
  if (front) for (let dy = 0; dy <= 4; dy++) for (let dx = 0; dx <= 4; dx++) if (solidBefore(tx + dx, ty + dy)) return false;
  return true;
}

/** Nearest open tile to (cx,cy) in tiles, searching outward ring by ring; prefers room for a fight (radius 2). */
function nearestSpot(cx: number, cy: number, inside: (tx: number, ty: number) => boolean, maxR = 30): { tx: number; ty: number } | undefined {
  for (const [clear, front] of [[2, true], [1, true], [1, false]] as const) {
    for (let r = 0; r <= maxR; r++) {
      let best: { tx: number; ty: number; d: number } | undefined;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = Math.round(cx) + dx, ty = Math.round(cy) + dy;
        if (!inside(tx, ty) || !openSpot(tx, ty, clear, front)) continue;
        const d = Math.hypot(dx, dy);
        if (!best || d < best.d) best = { tx, ty, d };
      }
      if (best) return best;
    }
  }
  return undefined;
}

const pos = (tx: number, ty: number) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.6) * TILE });
const kindName = (k: MobKind) => MOBS[k]?.name ?? k;

function placeChests(): Chest[] {
  const out: Chest[] = [];
  LAIRS.forEach((l, i) => {
    const a = AREAS.find((x) => x.name === l.area);
    if (!a) return;
    const [fx, fy] = l.at ?? [0.5, 0.5];
    const inside = (tx: number, ty: number) => areaInfoAt((tx + 0.5) * TILE, (ty + 0.5) * TILE) === a; // not in a smaller area within it
    const s = nearestSpot(a.x + a.w * fx, a.y + a.h * fy, inside);
    if (!s) return;
    const level = (SPAWN_ZONES.find((z) => z.name === a.name)?.levels ?? zoneLevels(a))[1] + 1; // guarded hoards are a bit richer than the zone
    out.push({ id: `lair_${i + 1}`, ...pos(s.tx, s.ty), level, tier: chestTier(level), area: a.name, guards: l.guards });
  });
  // The Mawdeep (Murat 2026-11-08: "best in class principles"): on each floor a hoard in its ambush room, kept by the
  // beast-folk lurking round it, and a richer chest in the secret room behind the cracked wall
  const KEEPERS: Record<number, Partial<Record<MobKind, number>>> = { 1: { gnawkin: 2, tuskborn: 1 }, 2: { silkwretch: 2, gnawkin: 1 }, 3: { tuskborn: 2, silkwretch: 1 },
    4: { skeleton: 3 }, 5: { skeleton: 2, skeletonmage: 1 }, 6: { sanddead: 2, scorpion: 1 }, 7: { sanddead: 2, veiled: 1 } };
  for (const f of FLOORS) {
    const zl = SPAWN_ZONES.find((z) => z.name === f.name)?.levels ?? [20, 22];
    const inRoom = (ci: number) => (tx: number, ty: number) => Math.hypot((tx + 0.5 - f.x - f.chambers[ci].x) / f.chambers[ci].rx, (ty + 0.5 - f.y - f.chambers[ci].y) / f.chambers[ci].ry) < 0.8;
    const hc = AMBUSH_CHEST[f.id];
    if (hc !== undefined) {
      const c = f.chambers[hc], sp = nearestSpot(f.x + c.x, f.y + c.y, inRoom(hc), 6);
      if (sp) out.push({ id: `maw_hoard_${f.id}`, ...pos(sp.tx, sp.ty), level: zl[1] + 1, tier: 3, area: f.name, guards: KEEPERS[f.id] });
    }
    f.chambers.forEach((c, ci) => {
      if (!c.secret) return;
      const sp = nearestSpot(f.x + c.x, f.y + c.y, inRoom(ci), 3);
      if (sp) out.push({ id: `maw_secret_${f.id}`, ...pos(sp.tx, sp.ty), level: zl[1] + 3, tier: 3, area: `${f.name}: a hidden room` });
    });
  }
  // Story rewards: beside the last object of each "use" step (unless the step says no chest), for every quest chain
  CHAINS.forEach((ch, c) => ch.quests.forEach((q, qi) => q.steps.forEach((st, si) => {
    if (st.type !== "use" || !st.objects?.length || st.chest === false) return;
    const o = st.objects[st.objects.length - 1];
    const ox = o.x / TILE, oy = o.y / TILE;
    const s = nearestSpot(ox + 1.5, oy + 1, (tx, ty) => Math.hypot(tx - ox, ty - oy) >= 1.5 && Math.hypot(tx - ox, ty - oy) <= 6, 6);
    if (!s) return;
    // the skeleton zones have set levels (shared/spawns.ts), above what the distance alone would give
    const zl = st.zone ? SPAWN_ZONES.find((z) => z.name === st.zone)?.levels : undefined;
    const setLevels = c || ELEMENT_LANDS.some((l) => l.name === st.zone); // the elemental wilds have set levels too
    const level = setLevels && zl ? zl[1] + 2 : baseLevelAt(s.tx, s.ty) + 3;
    out.push({ id: c ? `${ch.id}_${qi + 1}_${si + 1}` : `story_${qi + 1}_${si + 1}`, ...pos(s.tx, s.ty), level, tier: chestTier(level), area: q.title,
      story: { objects: st.objects, hint: st.text } });
  })));
  return out;
}

export const CHESTS: Chest[] = placeChests();
export const chestById = (id: unknown) => CHESTS.find((c) => c.id === id);

/** Why a chest can't be opened yet (undefined = it can). `guardsAlive` counts this chest's living guardians. */
export function chestLock(c: Chest, q: Quester | undefined, guardsAlive: number): string | undefined {
  if (c.guards && guardsAlive > 0) {
    const names = (Object.entries(c.guards) as [MobKind, number][]).map(([k, n]) => (n > 1 ? `${n} ${kindName(k)}s` : `the ${kindName(k)}`));
    return `Guarded: defeat ${names.join(" and ")}`;
  }
  if (c.story && !c.story.objects.every((o) => objectDone(o, q))) return `Sealed: ${c.story.hint}`;
  return undefined;
}

export interface ChestLoot { gold: number; potions: number; gear: string[] }

/**
 * Chest contents for a chest level. Gold grows with level, potions are likely, and there is a good chance of gear
 * whose tier odds use the same level rules as monster loot (LOOT_LEVEL in gear.ts), a bit kinder.
 */
export function rollChest(level: number, tier: ChestTier, rnd = Math.random): ChestLoot {
  const n = Math.max(0, level - 1), L = LOOT_LEVEL;
  const gold = Math.round((12 + 7 * level) * (0.8 + rnd() * 0.5) * (1 + 0.25 * (tier - 1)));
  const potions = (rnd() < Math.min(0.9, 0.45 + 0.04 * n) ? 1 : 0) + (rnd() < Math.min(0.5, 0.1 + 0.02 * n) ? 1 : 0);
  const gearChance = Math.min(0.95, 0.4 + 0.04 * n + 0.15 * (tier - 1));
  const gear: string[] = [];
  const pieces = (rnd() < gearChance ? 1 : 0) + (tier === 3 && rnd() < 0.35 ? 1 : 0);
  for (let i = 0; i < pieces; i++) {
    const epic = Math.min(L.maxEpic, 0.03 + L.epic * n + (tier === 3 ? 0.08 : 0));
    const rare = Math.min(L.maxRare, 0.15 + L.rare * n);
    const r = rnd();
    const t = r < epic ? 3 : r < epic + rare ? 2 : 1;
    const pool = LOOT_IDS.filter((id) => GEAR[id].tier === t);
    gear.push(rollAffixes(withLevel(pool[Math.floor(rnd() * pool.length)], level), 1 + 0.5 * (tier - 1), rnd)); // item level = chest level
  }
  return { gold, potions, gear };
}
