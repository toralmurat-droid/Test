import { TILE, type MobKind } from "./constants";
import { isSolidAt, isSolidTile, REDFANG, REDFANG_TOWERS, T } from "./map";
import { BR, FANGROCK, FANGROCK_KEEP, FANGROCK_TOWERS, LEDGES, TALON_FORT, TALON_TOWERS } from "./badlands";
import { HIDEHALL, HIDEHALL_BURROWS, HIDEHALL_TOWERS, SR } from "./sinkholes";
import { CITY, cityGates, inLandCities, plotBox } from "./capitals";
import { CITY_APRON } from "./cityLand";

/**
 * Redfang Hollow (Murat 2026-11-03): a small, organised outlaw camp instead of a crowd of bandits.
 * Few bandits, each much tougher and with a trick of its own, posted like a village watch:
 * - Lookouts stand on the three watchtowers. They see far, shoot arrows, and blow a horn when a hero comes:
 *   every bandit in earshot drops what it is doing and comes for that hero.
 * - Brutes (axe, Cleave), cutthroats (dagger, Dash) and archers (bow, Volley) hold posts inside the stockade.
 *   Any of them shouts for the others when a hero hits it.
 * - Two patrols of two walk the trails outside the camp and pick fights with the monsters of the woods.
 * - The leader, the Redfang Chief, is a boss guarding the camp's loot chest (shared/chests.ts): Sweep, Leap,
 *   War Cry (rallies the camp) and, once badly hurt, calls two more cutthroats out of the huts.
 *
 * - Ambushers (Murat 2026-11-06) hide up in the trees of the woods round the camp, in small groups along the trails.
 *   Nothing shows until a hero walks right under them: then they drop out of the branches, land beside him with a
 *   stab, and the rest of their group follows. Once the fight is over they climb back up into a tree.
 *
 * Bandits are MobKind "bandit" with a role kept in Mob.weapon (synced, so the client picks the matching sheet).
 *
 * Act 4 (the Red Badlands, the Redfang homeland): Fangrock and Talon Fort are camps like the Hollow (CAMPS), manned by the
 * clan's own kinds (BanditPost.kind): Redfang crossbowmen keep watch on the towers and blow the horn, outriders and
 * warhounds patrol the roads, outriders crouch on rock ledges by the roads (ambushers), captains, firebrands and the rest
 * hold posts inside. A post of another kind than "bandit" keeps its role in the Mob's flags (perch, ambusher), not in
 * Mob.weapon, which stays "" for them (a lookout's is "lookout" too: the client draws every lookout up on its tower).
 *
 * Act 5 (the Mawdeep Sinkholes): Hidehall, the Hide-Kin's seat, is a camp the same way: Quillbacks on its lookout towers
 * (their bone horn alerts the warren), Hide-Chieftains, stitchers and the rest at posts, cackler and stagkin patrols on
 * the roads, Delvers lying in burrow mounds by the roads (ambushers: they burst out instead of dropping from a tree).
 */
export type BanditRole = "cutthroat" | "brute" | "archer" | "lookout" | "ambusher";

/** Role multipliers on the bandit's base stats (MOBS.bandit). `loot` scales the gold it drops. */
export const BANDIT_ROLES: Record<BanditRole, { name: string; hp: number; dmg: number; speed: number; cooldown: number; xp: number; poise: number; loot: number }> = {
  cutthroat: { name: "Cutthroat", hp: 2.2, dmg: 1.3, speed: 1.12, cooldown: 0.9, xp: 2.4, poise: 1.2, loot: 2 },
  brute: { name: "Brute", hp: 3.6, dmg: 1.7, speed: 0.82, cooldown: 1.35, xp: 3.4, poise: 2.2, loot: 2.5 },
  archer: { name: "Bandit Archer", hp: 1.7, dmg: 1, speed: 1, cooldown: 1, xp: 2.2, poise: 1, loot: 2 },
  ambusher: { name: "Ambusher", hp: 1.9, dmg: 1.2, speed: 1.15, cooldown: 0.9, xp: 2.4, poise: 1.1, loot: 2 },
  lookout: { name: "Lookout", hp: 1.6, dmg: 0.95, speed: 0, cooldown: 1, xp: 2.2, poise: 1.4, loot: 2 },
};

/** Distances in px, times in ms. */
export const BANDIT_AI = {
  // Cutthroat: darts at a hero a few steps away and stabs on arrival
  dash: { min: 34, max: 120, ms: 300, mult: 3.4, cooldownMs: 6000, dmgMult: 1.4 },
  // Brute: winds up, then a wide axe swing that hits everyone around and knocks them back
  cleave: { range: 26, radius: 40, windupMs: 750, cooldownMs: 6500, dmgMult: 1.5, knockback: 2.5 },
  // Archers: keep their distance; now and then loose three arrows at once
  bow: { keepAway: 60, range: 150, shotSpeed: 190, shotRadius: 3 },
  lookoutBow: { range: 230, shotSpeed: 210, shotRadius: 3 },
  volley: { everyMs: 8000, arrows: 3, spread: 0.22 },
  // Lookouts see far; the horn calls everyone within `range` (they come running from further than they'd normally chase)
  horn: { sight: 240, range: 26 * TILE, cooldownMs: 25000, alertMs: 25000, alertAggro: 560, alertLeash: 640 },
  // A bandit hit by a hero shouts for the ones near it
  shout: { range: 9 * TILE, cooldownMs: 8000 },
  // Patrols go looking for trouble: they pick fights with monsters this far away
  patrolFeud: 160,
  // ...and win those fights: damage they deal to monsters, and take from them
  feud: { dealt: 2.5, taken: 0.4 },
};

/**
 * Ambushers in the trees. `range` px: a hero this close below the tree makes it drop; it lands `landGap` px from him
 * after a `flightMs` jump and hits everyone within `radius` (a short stagger, no screen shake). Hidden ones of the same
 * group within `callRange` follow it out, one after another (`staggerMs`). Back in a tree within `treeRadius` tiles of
 * its post once nothing is left to fight.
 */
export const AMBUSH = { range: 64, landGap: 20, flightMs: 380, radius: 30, dmgMult: 0.9, stunMs: 250, callRange: 7 * TILE, staggerMs: [180, 520] as const, treeRadius: 4, seekMs: 20000 };

/** The boss. Stats in MOBS.banditchief. */
export const CHIEF = {
  sweep: { range: 30, radius: 46, windupMs: 800, cooldownMs: 7000, dmgMult: 1.8, knockback: 3 },
  leap: { min: 60, max: 170, windupMs: 850, flightMs: 350, cooldownMs: 11000, radius: 42, dmgMult: 2, stunMs: 700 },
  warCry: { cooldownMs: 22000, range: 12 * TILE, buffMs: 10000, dmg: 1.35, speed: 1.25 },
  reinforce: { hpFrac: 0.5, count: 2 },
};

export interface BanditPost {
  role: BanditRole;
  /** Who holds it (default a "bandit" in this role). */
  kind?: MobKind;
  /** Tile it stands on (lookouts: their tower). */
  at: [number, number];
  /** Patrols: tiles they walk along, back and forth (from the gate out into the woods). */
  route?: [number, number][];
}

/**
 * True when no city in its land (settlement network step 5) claims map tile (x, y): outside every such city's walls and
 * apron, and at least CITY.gateClear from each of its gates' outside tiles (the spawn zones keep the same ring clear).
 */
export function cityClear(x: number, y: number): boolean {
  for (const c of inLandCities()) {
    const b = plotBox(c), r = CITY_APRON;
    if (x >= b.x - r && y >= b.y - r && x < b.x + b.w + r && y < b.y + b.h + r) return false;
    if (cityGates(c).some((g) => Math.hypot(x - g.out.x, y - g.out.y) < CITY.gateClear)) return false;
  }
  return true;
}
/**
 * A camp's posts with none in a city in its land or by its gates (cityClear): a post standing there (a burrow or ledge
 * ambusher, a guard) is dropped, a patrol keeps the route points outside. Every other post stays as it was, in order.
 */
export function clearOfCities(posts: BanditPost[]): BanditPost[] {
  return posts.filter((p) => cityClear(p.at[0], p.at[1])).map((p) => (p.route?.some(([x, y]) => !cityClear(x, y)) ? { ...p, route: p.route.filter(([x, y]) => cityClear(x, y)) } : p));
}

const B = REDFANG;
/** Every bandit of Redfang Hollow, in the order the posts are filled (lookouts first, patrols last). */
export const CAMP_POSTS: BanditPost[] = clearOfCities([
  ...REDFANG_TOWERS.map(([x, y]): BanditPost => ({ role: "lookout", at: [x, y] })),
  { role: "brute", at: [B.x + 11, B.y + 8] }, // on the lane, facing the north gate
  { role: "brute", at: [B.x + 11, B.y + 15] }, // by the south gate
  { role: "cutthroat", at: [B.x + 5, B.y + 9] }, // by the west gate
  { role: "cutthroat", at: [B.x + 18, B.y + 10] }, // east side, by the hay
  { role: "archer", at: [B.x + 15, B.y + 13] }, // by the campfire
  // Bandit Trail (north-west toward the Keep) and Smugglers' Path (south toward Saltmere)
  { role: "cutthroat", at: [251, 100], route: [[251, 100], [241, 93], [233, 88], [225, 80]] },
  { role: "archer", at: [252, 100], route: [[252, 100], [242, 93], [234, 88], [226, 80]] },
  { role: "cutthroat", at: [251, 121], route: [[251, 121], [250, 126], [248, 132], [245, 138], [241, 143]] },
  { role: "archer", at: [252, 121], route: [[252, 121], [251, 126], [249, 132], [246, 138], [242, 143]] },
  // Ambushers: two per grove, up in the trees beside the trails round the camp (the bandits' own woods)
  ...([[236, 94], [256, 94], [234, 106], [244, 127], [271, 113]] as [number, number][])
    .flatMap((at): BanditPost[] => [{ role: "ambusher", at }, { role: "ambusher", at }]),
]);

/** A Fangrock / Talon Fort post (local badlands tiles) held by one of the clan's kinds. */
const bp = (kind: MobKind, role: BanditRole, x: number, y: number, route?: [number, number][]): BanditPost =>
  ({ kind, role, at: [x, BR(y)], ...(route ? { route: route.map(([rx, ry]): [number, number] => [rx, BR(ry)]) } : {}) });
const FK = FANGROCK_KEEP, F = FANGROCK, TF = TALON_FORT;
/** Fangrock's garrison (the Redfang seat, Lv 36-38): crossbowmen on the towers, two captains, the clan's men and dogs. */
export const FANGROCK_POSTS: BanditPost[] = clearOfCities([
  ...FANGROCK_TOWERS.map(([x, y]) => bp("crossbowman", "lookout", x, y)),
  bp("redcaptain", "brute", 37, 78),                  // on the main lane inside the east gate
  bp("redcaptain", "brute", FK.x + FK.w + 2, FK.y + 6), // before the keep's gate
  bp("firebrand", "archer", 38, 73), bp("firebrand", "archer", 35, 84), bp("firebrand", "archer", 27, 83),
  bp("crossbowman", "archer", 33, 75), bp("crossbowman", "archer", 40, 87),
  bp("outrider", "cutthroat", 40, 79), bp("outrider", "cutthroat", 31, 78), bp("outrider", "cutthroat", 23, 89),
  bp("warhound", "cutthroat", 38, 81), bp("warhound", "cutthroat", 31, 73), bp("warhound", "cutthroat", 26, 87),
  // patrols: out of the east gate along the Fang Road, out of the back gate toward the gulch road
  bp("outrider", "cutthroat", F.x + F.w + 1, 78, [[F.x + F.w + 1, 78], [56, 76], [68, 70], [80, 74]]),
  bp("warhound", "cutthroat", F.x + F.w + 1, 79, [[F.x + F.w + 1, 79], [57, 77], [69, 71], [81, 75]]),
  bp("outrider", "cutthroat", 28, F.y + F.h + 1, [[28, F.y + F.h + 1], [34, 100], [48, 99], [60, 93]]),
  bp("warhound", "cutthroat", 29, F.y + F.h + 1, [[29, F.y + F.h + 1], [35, 100], [49, 99], [60, 94]]),
  // ambushers: two on each ledge-pair by the roads (shared/badlands.ts LEDGES)
  ...LEDGES.filter(([x]) => x < 100).map(([x, y]) => bp("outrider", "ambusher", x, y + 1)),
]);
/** Talon Fort's garrison (Lv 32-35): a captain, three lookouts, a patrol down the river road, two ambushers on its ledges. */
export const TALON_POSTS: BanditPost[] = clearOfCities([
  ...TALON_TOWERS.map(([x, y]) => bp("crossbowman", "lookout", x, y)),
  bp("redcaptain", "brute", TF.x + 9, TF.y + 7),
  bp("firebrand", "archer", 122, 26), bp("crossbowman", "archer", 127, 23), bp("outrider", "cutthroat", 131, 26),
  bp("warhound", "cutthroat", 125, 28), bp("warhound", "cutthroat", 129, 28),
  bp("outrider", "cutthroat", 127, TF.y + TF.h + 1, [[127, TF.y + TF.h + 1], [136, 44], [146, 62]]),
  bp("warhound", "cutthroat", 128, TF.y + TF.h + 1, [[128, TF.y + TF.h + 1], [137, 44], [147, 62]]),
  ...LEDGES.filter(([x]) => x > 100).map(([x, y]) => bp("outrider", "ambusher", x, y + 1)),
]);

/** A Hidehall post (local sinkholes tiles) held by one of the Hide-Kin. */
const hp = (kind: MobKind, role: BanditRole, x: number, y: number, route?: [number, number][]): BanditPost =>
  ({ kind, role, at: [x, SR(y)], ...(route ? { route: route.map(([rx, ry]): [number, number] => [rx, SR(ry)]) } : {}) });
const HH = HIDEHALL;
/** Hidehall's garrison (the Hide-Kin's seat, Lv 40-43): quillbacks on the towers, two Hide-Chieftains, stitchers, packs and chargers. */
export const HIDEHALL_POSTS: BanditPost[] = clearOfCities([
  ...HIDEHALL_TOWERS.map(([x, y]) => hp("quillback", "lookout", x, y)),
  hp("hidechief", "brute", 248, 135),   // on the main lane inside the north gate
  hp("hidechief", "brute", 256, 151),   // before the great hall's door
  hp("stitcher", "archer", 244, 140), hp("stitcher", "archer", 252, 141), hp("stitcher", "archer", 242, 151),
  hp("quillback", "archer", 237, 144), hp("quillback", "archer", 259, 143),
  hp("cackler", "cutthroat", 246, 133), hp("cackler", "cutthroat", 250, 138), hp("cackler", "cutthroat", 240, 141), hp("cackler", "cutthroat", 253, 154),
  hp("stagkin", "cutthroat", 243, 132), hp("stagkin", "cutthroat", 262, 150), hp("stagkin", "cutthroat", 236, 141),
  // patrols: out of the north gate up the road toward the Maw, out of the west gate along the back way
  hp("cackler", "cutthroat", 248, HH.y - 1, [[248, HH.y - 1], [244, 118], [236, 104]]),
  hp("stagkin", "cutthroat", 249, HH.y - 1, [[249, HH.y - 1], [245, 118], [237, 104]]),
  hp("cackler", "cutthroat", HH.x - 1, 142, [[HH.x - 1, 142], [218, 146], [190, 150]]),
  hp("stagkin", "cutthroat", HH.x - 1, 143, [[HH.x - 1, 143], [218, 147], [190, 151]]),
  // ambushers: a Delver under each burrow mound by the roads (shared/sinkholes.ts HIDEHALL_BURROWS)
  ...HIDEHALL_BURROWS.map(([x, y]) => hp("delver", "ambusher", x, y + 1)),
]);

/**
 * The organised camps (Murat 2026-11-03's Redfang Hollow and the badlands' forts): the spawn zone they belong to, their
 * posts, and where their ambushers hide (`hide`: tile ids, trees in the Hollow's woods, rocks and crags in the badlands,
 * burrow mounds round Hidehall).
 */
export interface BanditCamp { zone: string; posts: BanditPost[]; towers: [number, number][]; hide: number[] }
/** Where the Hollow's ambushers hide: up in the woods' trees (the same trees as the slimes', shared/spawns.ts HIDE). */
export const REDFANG_HOLLOW_HIDE = [T.TREE, T.PINE];
export const CAMPS: BanditCamp[] = [
  { zone: "Redfang Hollow", posts: CAMP_POSTS, towers: REDFANG_TOWERS, hide: REDFANG_HOLLOW_HIDE }, // first: its post indices stay what they were
  { zone: "Fangrock", posts: FANGROCK_POSTS, towers: FANGROCK_TOWERS.map(([x, y]): [number, number] => [x, BR(y)]), hide: [T.ROCK, T.CLIFF] },
  { zone: "Talon Fort", posts: TALON_POSTS, towers: TALON_TOWERS.map(([x, y]): [number, number] => [x, BR(y)]), hide: [T.ROCK, T.CLIFF] },
  { zone: "Hidehall", posts: HIDEHALL_POSTS, towers: HIDEHALL_TOWERS.map(([x, y]): [number, number] => [x, SR(y)]), hide: [T.BURROW] }, // the Delvers lie in burrow mounds
];
/** Every post of every camp, one index space (Mob.post): Redfang Hollow's come first, as before. `camp` = its CAMPS index. */
export const POSTS: (BanditPost & { camp: number })[] = CAMPS.flatMap((c, ci) => c.posts.map((p) => ({ ...p, camp: ci })));
/** Every camp's watchtowers (map tiles): the client draws a tower on each. */
export const CAMP_TOWERS: [number, number][] = CAMPS.flatMap((c) => c.towers);
/** The camp a spawn zone is (CAMPS index), or -1. */
export const campOfZone = (zone: string | undefined) => CAMPS.findIndex((c) => c.zone === zone);
/** Who holds a post. */
export const postKind = (p: BanditPost): MobKind => p.kind ?? "bandit";
/** A camp's spawn-zone count per kind (shared/spawns.ts): one monster per post. */
export function campMobs(zone: string): Partial<Record<MobKind, number>> {
  const out: Partial<Record<MobKind, number>> = {};
  for (const p of CAMPS[campOfZone(zone)].posts) out[postKind(p)] = (out[postKind(p)] ?? 0) + 1;
  return out;
}

/** Lookouts stand a hair in front of their tower so they are drawn on its platform. */
export const PERCH_DY = 2;
/** How high the tower platform is (world px): the client draws the lookout up there. */
export const PERCH_LIFT = 38;

export const roleOf = (weapon: string): BanditRole => (weapon in BANDIT_ROLES ? weapon as BanditRole : "cutthroat");
export const postPos = (p: BanditPost) => ({ x: (p.at[0] + 0.5) * TILE, y: (p.at[1] + 0.5) * TILE + (p.role === "lookout" ? PERCH_DY : 0) });

/**
 * Bandits know their way around the camp: when a wall stands between a bandit and where it wants to go,
 * it takes the way through the gates. Tile BFS (8-way, no corner cutting) in a box around both points.
 * Returns the tile centres to walk through (px), or [] when there's no way (or it's out of reach). `wall` adds walls the map
 * doesn't have (the live Hold walls, by tile).
 */
export function findPath(x0: number, y0: number, x1: number, y1: number, margin = 10, wall?: (tx: number, ty: number) => boolean): [number, number][] {
  const sx = Math.floor(x0 / TILE), sy = Math.floor(y0 / TILE), ex = Math.floor(x1 / TILE), ey = Math.floor(y1 / TILE);
  const bx = Math.min(sx, ex) - margin, by = Math.min(sy, ey) - margin;
  const bw = Math.abs(ex - sx) + margin * 2 + 1, bh = Math.abs(ey - sy) + margin * 2 + 1;
  if (bw * bh > 90 * 90) return [];
  const idx = (x: number, y: number) => (y - by) * bw + (x - bx);
  const prev = new Int32Array(bw * bh).fill(-1);
  const open = (x: number, y: number) => x >= bx && y >= by && x < bx + bw && y < by + bh && !isSolidTile(x, y) && !wall?.(x, y);
  const q: number[] = [idx(sx, sy)];
  prev[q[0]] = q[0];
  const goal = idx(ex, ey);
  for (let h = 0; h < q.length && prev[goal] < 0; h++) {
    const k = q[h], x = bx + (k % bw), y = by + Math.floor(k / bw);
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (!open(nx, ny) || (dx && dy && (!open(x + dx, y) || !open(x, y + dy)))) continue;
      const n = idx(nx, ny);
      if (prev[n] >= 0) continue;
      prev[n] = k; q.push(n);
    }
  }
  if (prev[goal] < 0) return [];
  const out: [number, number][] = [];
  for (let k = goal; k !== prev[k]; k = prev[k]) out.push([(bx + (k % bw) + 0.5) * TILE, (by + Math.floor(k / bw) + 0.5) * TILE]);
  return out.reverse();
}
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** True if a body can walk the straight line between the two points (px); `wall` adds walls the map doesn't have (the live Hold walls, by px). */
export function clearWalk(x0: number, y0: number, x1: number, y1: number, wall?: (px: number, py: number) => boolean): boolean {
  const solid = (x: number, y: number) => isSolidAt(x, y) || !!wall?.(x, y);
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8);
  for (let i = 1; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
    if (solid(x - 5, y - 5) || solid(x + 5, y + 5) || solid(x - 5, y + 5) || solid(x + 5, y - 5)) return false;
  }
  return true;
}
