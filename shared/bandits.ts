import { TILE } from "./constants";
import { isSolidAt, isSolidTile, REDFANG, REDFANG_TOWERS } from "./map";

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
  /** Tile it stands on (lookouts: their tower). */
  at: [number, number];
  /** Patrols: tiles they walk along, back and forth (from the gate out into the woods). */
  route?: [number, number][];
}

const B = REDFANG;
/** Every bandit of the camp, in the order the posts are filled (lookouts first, patrols last). */
export const CAMP_POSTS: BanditPost[] = [
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
];
/** Lookouts stand a hair in front of their tower so they are drawn on its platform. */
export const PERCH_DY = 2;
/** How high the tower platform is (world px): the client draws the lookout up there. */
export const PERCH_LIFT = 38;

export const roleOf = (weapon: string): BanditRole => (weapon in BANDIT_ROLES ? weapon as BanditRole : "cutthroat");
export const postPos = (p: BanditPost) => ({ x: (p.at[0] + 0.5) * TILE, y: (p.at[1] + 0.5) * TILE + (p.role === "lookout" ? PERCH_DY : 0) });

/**
 * Bandits know their way around the camp: when a wall stands between a bandit and where it wants to go,
 * it takes the way through the gates. Tile BFS (8-way, no corner cutting) in a box around both points.
 * Returns the tile centres to walk through (px), or [] when there's no way (or it's out of reach).
 */
export function findPath(x0: number, y0: number, x1: number, y1: number, margin = 10): [number, number][] {
  const sx = Math.floor(x0 / TILE), sy = Math.floor(y0 / TILE), ex = Math.floor(x1 / TILE), ey = Math.floor(y1 / TILE);
  const bx = Math.min(sx, ex) - margin, by = Math.min(sy, ey) - margin;
  const bw = Math.abs(ex - sx) + margin * 2 + 1, bh = Math.abs(ey - sy) + margin * 2 + 1;
  if (bw * bh > 90 * 90) return [];
  const idx = (x: number, y: number) => (y - by) * bw + (x - bx);
  const prev = new Int32Array(bw * bh).fill(-1);
  const open = (x: number, y: number) => x >= bx && y >= by && x < bx + bw && y < by + bh && !isSolidTile(x, y);
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

/** True if a body can walk the straight line between the two points (px). */
export function clearWalk(x0: number, y0: number, x1: number, y1: number): boolean {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8);
  for (let i = 1; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
    if (isSolidAt(x - 5, y - 5) || isSolidAt(x + 5, y + 5) || isSolidAt(x - 5, y + 5) || isSolidAt(x + 5, y - 5)) return false;
  }
  return true;
}
