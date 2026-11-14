import { TILE, type MobKind } from "./constants";
import { DAY_CYCLE_MS, DUSK } from "./daynight";
import { isSafeZone, isSolidAt, ROADS, VILLAGE } from "./map";
import { noMobsAt } from "./spawns";
import { findPath } from "./bandits";
import { WATCH_POSTS } from "./watch";

/**
 * The Gloam Tide (quest concept #7, docs/quest-concepts-progress.md): a server-wide event, not a quest. Every blob a hero
 * kills fills one world meter; when it is full, what is left of the Gloam marches on Oakvale at the next dusk, in waves,
 * and stops outside the west gate (out of the gate watch's sight, so the heroes have to go out and meet it). Heroes who
 * fought it near the gate share the reward by the damage they dealt. Server: server/tide.ts; the meter is saved in
 * server/worldStore.ts.
 */

/** One wave of the march: its level range, how many marchers, and the blob kinds by weight. */
export interface TideWave { level: [number, number]; n: number; kinds: Partial<Record<MobKind, number>> }

export const TIDE = {
  /** Blob kills that fill the meter (Decision 8). */
  goal: 1500,
  /** Lv 4 -> 12; the last wave is exactly maxAlive, so it is all out at once (and the bench's worst case). */
  waves: [
    { level: [4, 5], n: 24, kinds: { slime: 14, shooterblob: 5, warriorblob: 5 } },
    { level: [6, 8], n: 30, kinds: { slime: 12, shooterblob: 6, warriorblob: 7, healerblob: 5 } },
    { level: [8, 10], n: 36, kinds: { slime: 8, shooterblob: 7, warriorblob: 8, healerblob: 5, venomblob: 4, frostblob: 4 } },
    { level: [11, 12], n: 40, kinds: { warriorblob: 10, shooterblob: 8, healerblob: 6, venomblob: 4, frostblob: 4, fireblob: 4, stormblob: 4 } },
  ] as TideWave[],
  /** Name over every marcher. */
  title: "Gloam Tide",
  /** Most marchers alive at once (tick cost: they never doze, see server/tide.ts). */
  maxAlive: 40,
  /** A wave comes in packs of this many, one pack every packMs, while there is room under maxAlive. */
  pack: [4, 6] as [number, number],
  packMs: 4000,
  /** Pause between a cleared wave and the next. */
  waveGapMs: 15_000,
  /** The march gives up (and pays what was earned) this long after it began. */
  limitMs: 12 * 60_000,
  /** A march missed by more than this (the server was down at dusk) waits for the next dusk instead. */
  lateMs: 3 * 60_000,
  /** The point they march to: this many tiles west of the west gate, on the King's Road. */
  goalTiles: 10,
  /** Each marcher's own spot is this many tiles (at most) around that point, so they don't stand in one heap. */
  spreadTiles: 2.5,
  /** They come out of the west this far beyond the goal point (tiles, along the road), up to this many rows off it. */
  spawnTiles: [12, 18] as [number, number],
  spawnRows: 5,
  /** Damage to marchers counts only from heroes this close to the west gate (tiles). */
  creditTiles: 20,
  /** A hero needs at least this share of the damage to be paid. */
  shareFloor: 0.03,
  /** Gold at full pay for a hero of this level (times 0.5 + share, see tideGold); Act 1 levels only, so it stops at 30. */
  gold: (level: number) => 15 + 8 * Math.max(1, Math.min(30, Math.floor(level))),
  goldCap: 350,
  /** The best few by share also get a rune of this level (shared/runes.ts rollRune). */
  runeTop: 3,
  runeLevel: 12,
  /** "tide" messages go out at most this often (and only when something changed). */
  sendMs: 1000,
};

/** Ms from a time of day t (0..1) until the next dusk begins; 0 while it is dusk. */
export function msUntilDusk(t: number): number {
  if (t >= DUSK.from && t < DUSK.to) return 0;
  return ((DUSK.from - t + 1) % 1) * DAY_CYCLE_MS;
}

/** When a march called at `now` (time of day t) sets out: the next dusk. */
export const marchTime = (now: number, t: number) => now + Math.round(msUntilDusk(t));

/** Each hero's share of the damage (0..1), best first. */
export function tideShares(dmg: ReadonlyMap<string, number>): { name: string; share: number }[] {
  let total = 0;
  for (const v of dmg.values()) if (v > 0) total += v;
  if (total <= 0) return [];
  return [...dmg].filter(([, v]) => v > 0).map(([name, v]) => ({ name, share: v / total })).sort((a, b) => b.share - a.share || (a.name < b.name ? -1 : 1));
}

/** A hero's gold for their share: nothing under the floor, else TIDE.gold(level) x (0.5 + share), capped. */
export function tideGold(level: number, share: number): number {
  if (!(share >= TIDE.shareFloor)) return 0;
  return Math.min(TIDE.goldCap, Math.round(TIDE.gold(level) * (0.5 + Math.min(1, share))));
}

/**
 * What every paid hero gets. `levelOf` gives the level of a hero who is still online (undefined = gone: their share still
 * counts against the others, but nobody is paid for it). Runes go to the best TIDE.runeTop shares overall, if paid.
 */
export function tidePayouts(dmg: ReadonlyMap<string, number>, levelOf: (name: string) => number | undefined): { name: string; share: number; gold: number; rune: boolean }[] {
  const out: { name: string; share: number; gold: number; rune: boolean }[] = [];
  tideShares(dmg).forEach(({ name, share }, rank) => {
    const level = levelOf(name), gold = level === undefined ? 0 : tideGold(level, share);
    if (gold > 0) out.push({ name, share, gold, rune: rank < TIDE.runeTop });
  });
  return out;
}

/** A marcher of wave w: its kind (by the wave's weights) and level. */
export function tideMarcher(w: TideWave, rnd = Math.random): { kind: MobKind; level: number } {
  const ks = Object.entries(w.kinds) as [MobKind, number][];
  let r = rnd() * ks.reduce((s, [, n]) => s + n, 0), kind = ks[0][0];
  for (const [k, n] of ks) { if ((r -= n) < 0) { kind = k; break; } }
  return { kind, level: w.level[0] + Math.floor(rnd() * (w.level[1] - w.level[0] + 1)) };
}

// ---- Where (deterministic, from the map) ----

const open = (x: number, y: number) => {
  for (const [ox, oy] of [[0, 0], [-6, -6], [6, -6], [-6, 6], [6, 6]]) if (isSolidAt(x + ox, y + oy)) return false;
  return !isSafeZone(x, y) && !noMobsAt(x, y);
};
/** The first open tile centre at (tx, ty) or in the rings around it. */
function openNear(tx: number, ty: number, maxR = 3): { x: number; y: number } {
  for (let r = 0; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = (tx + dx + 0.5) * TILE, y = (ty + dy + 0.5) * TILE;
    if (open(x, y)) return { x, y };
  }
  return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
}

const WEST = WATCH_POSTS.find((p) => p.nx === 1);
/** The west gate's opening (px): the march's target and the centre of the credit radius. */
export const TIDE_GATE = WEST ? { x: WEST.gx, y: WEST.gy } : { x: (VILLAGE.x0 + 0.5) * TILE, y: (ROADS.RY + 1.5) * TILE };
/** Where the march stops (px): TIDE.goalTiles west of the gate. tests check it is out of every watch post's sight. */
export const TIDE_GOAL = openNear(Math.floor(TIDE_GATE.x / TILE) - TIDE.goalTiles, Math.floor(TIDE_GATE.y / TILE));
/** Tile centres (px) the marchers come out at: open ground west of the goal with a way to it (they walk it like camp bandits, findPath). */
export const TIDE_SPAWNS: { x: number; y: number }[] = (() => {
  const out: { x: number; y: number }[] = [];
  const gx = Math.floor(TIDE_GOAL.x / TILE), gy = Math.floor(TIDE_GOAL.y / TILE);
  for (let tx = gx - TIDE.spawnTiles[1]; tx <= gx - TIDE.spawnTiles[0]; tx++) for (let ty = gy - TIDE.spawnRows; ty <= gy + TIDE.spawnRows; ty++) {
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    if (open(x, y) && findPath(x, y, TIDE_GOAL.x, TIDE_GOAL.y).length) out.push({ x, y });
  }
  return out.length ? out : [TIDE_GOAL];
})();

/** A marcher's own spot near the goal point (open ground, within TIDE.spreadTiles). */
export function tideHome(rnd = Math.random): { x: number; y: number } {
  for (let i = 0; i < 12; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * TIDE.spreadTiles * TILE;
    const x = TIDE_GOAL.x + Math.cos(a) * d, y = TIDE_GOAL.y + Math.sin(a) * d;
    if (open(x, y)) return { x, y };
  }
  return { ...TIDE_GOAL };
}
