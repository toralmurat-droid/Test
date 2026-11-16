import { MAX_LEVEL, xpForLevel } from "./classes";
import { actOfTile, ELITE, MOBS, TILE, type MobKind } from "./constants";
import { isSolidAt, PORTAL_SPOTS } from "./map";
import { SPAWN_ZONES, type SpawnZone } from "./spawns";

/**
 * Bounty boards (Murat 2026-11-05, expert review #6): a notice board beside every portal stone and one on the
 * Market Square. Each board offers BOUNTY_OFFERS hunts for monsters around the hero's level, one per zone
 * ("Hunt 8 Skeletons, Stonecrag Quarry"). One bounty at a time; it pays out the moment the last kill lands, so
 * there is no walk back. Kills count anywhere (Murat's rule for quests), but only monsters of at least the
 * bounty's level, so low monsters near the village can't fill a high bounty. This is levelling content, not an
 * endgame: offers stop above the first zone's level cap like everything else.
 */
export interface Bounty {
  zone: string;
  kind: MobKind;
  goal: number;
  /** Lowest monster level that counts. */
  minLevel: number;
  xp: number;
  gold: number;
}
export interface BountyState extends Bounty { n: number }

export const BOUNTY_OFFERS = 3;
export const BOARD_RANGE = TILE * 1.5; // px from the board's foot to read it
/** XP paid on completion: this share of what the hero's level needs to reach the next one. */
export const BOUNTY_XP_SHARE = 0.4;

export interface Board { id: string; name: string; x: number; y: number }

/** A free tile (with free neighbours) near (tx, ty), searched outwards ring by ring. */
function freeSpot(tx: number, ty: number): { x: number; y: number } {
  const free = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isSolidAt((x + 0.5 + dx * 0.6) * TILE, (y + 0.5 + dy * 0.6) * TILE)) return false;
    return true;
  };
  for (let r = 0; r < 10; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !free(tx + dx, ty + dy)) continue;
      return { x: (tx + dx + 0.5) * TILE, y: (ty + dy + 0.7) * TILE };
    }
  }
  return { x: (tx + 0.5) * TILE, y: (ty + 0.7) * TILE };
}

/** The boards: Market Square, then one a few steps east of each portal stone. */
export const BOARDS: Board[] = [
  { id: "square", name: "Oakvale Bounty Board", ...freeSpot(76, 57) },
  ...PORTAL_SPOTS.map((p) => ({ id: p.id, name: `${p.name} Bounty Board`, ...freeSpot(p.x + 3, p.y + 1) })),
];
export const boardById = (id: string) => BOARDS.find((b) => b.id === id);
export const nearestBoard = (x: number, y: number) => {
  let best: Board | undefined, bd = Infinity;
  for (const b of BOARDS) { const d = Math.hypot(b.x - x, b.y - y); if (d < bd) { bd = d; best = b; } }
  return best && bd <= BOARD_RANGE ? best : undefined;
};

/** The monster a zone's bounty asks for: its most common kind (elites and mothers are left out). Rumours (shared/rumours.ts) send it as their ambusher. */
export function signature(z: SpawnZone): MobKind | undefined {
  let best: MobKind | undefined, bn = 0;
  for (const [k, n] of Object.entries(z.mobs) as [MobKind, number][]) {
    if (k === "motherblob" || ELITE[k] || !n) continue;
    if (n > bn) { bn = n; best = k; }
  }
  return best;
}
const GOAL: Partial<Record<MobKind, number>> = { bandit: 6, skeletonmage: 5, tuskborn: 5, crowseer: 3, duskwing: 5, silkwretch: 5, legionary: 6, boghag: 6, mistwraith: 6,
  crossbowman: 6, firebrand: 6, quillback: 6, stitcher: 5,
  hollowherald: 5, courtmagus: 5, pretender: 5 };

/** Small seeded random (offers stay the same until the hero finishes one or levels up; rumours seed it with the day). */
export function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** A zone with a monster to hunt (not a wild zone, not an empty lair) in this act (1 to 5). Shared with the rumours. */
export const huntable = (z: SpawnZone, act = 1) => !z.wild && !!signature(z) && actOfTile(z.x, z.y) === act;
/** The zone's levels overlap the hero's level ±`by` (bounties and rumours: work about the hero's level). */
export const nearLevel = (z: SpawnZone, level: number, by = 2) => z.levels[0] <= level + by && z.levels[1] >= level - by;

/**
 * The board's offers for a hero of this level (`done` = bounties finished so far, so each one brings new offers).
 * A board only offers hunts in its own act (`act`: actOfTile of the board; the Cairnwatch board is the moors'), so
 * Oakvale never sends anyone to a land they can't reach.
 */
export function bountyOffers(level: number, done: number, act = 1): Bounty[] {
  const L = Math.min(level, MAX_LEVEL);
  const zones = SPAWN_ZONES.filter((z) => huntable(z, act) && nearLevel(z, L));
  const r = rng(L * 1000 + done);
  // closest to the hero's level first, ties shuffled by the seed
  const scored = zones.map((z) => ({ z, s: Math.abs((z.levels[0] + z.levels[1]) / 2 - L) + r() * 1.5 })).sort((a, b) => a.s - b.s);
  const step = xpForLevel(L + 1) - xpForLevel(L);
  // one offer per monster kind (kills count anywhere, so two blob hunts would be the same hunt)
  const seen = new Set<MobKind>();
  const picked = scored.filter(({ z }) => { const k = signature(z)!; if (seen.has(k)) return false; seen.add(k); return true; });
  return picked.slice(0, BOUNTY_OFFERS).map(({ z }) => {
    const kind = signature(z)!;
    const goal = (GOAL[kind] ?? 8) + Math.floor(r() * 3);
    return {
      zone: z.name, kind, goal,
      minLevel: Math.max(1, Math.min(z.levels[0], L - 2)),
      xp: Math.max(20, Math.round(step * BOUNTY_XP_SHARE * (goal / 8))),
      gold: Math.round((12 + z.levels[0] * 6) * (goal / 8)),
    };
  });
}

/** "Hunt 8 Skeletons" */
export function bountyTitle(b: Bounty): string {
  const name = MOBS[b.kind]?.name ?? b.kind;
  const many = /s$/.test(name) ? name : /(sh|ch|x)$/.test(name) ? name + "es" : name + "s";
  return `Hunt ${b.goal} ${b.goal > 1 ? many : name}`;
}

/** Does this kill count for the bounty? */
export const bountyCounts = (b: Bounty | undefined, kind: MobKind, level: number) => !!b && b.kind === kind && level >= b.minLevel;

/** A saved bounty, checked (saves are just JSON on disk). */
export function cleanBounty(v: unknown): BountyState | undefined {
  const b = v as Partial<BountyState> | undefined;
  if (!b || typeof b !== "object" || typeof b.kind !== "string" || !(b.kind in MOBS)) return undefined;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0);
  const goal = num(b.goal);
  if (!goal) return undefined;
  return { zone: String(b.zone ?? ""), kind: b.kind as MobKind, goal, minLevel: num(b.minLevel), xp: num(b.xp), gold: num(b.gold), n: Math.min(goal - 1, num(b.n)) };
}
