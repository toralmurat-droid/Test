import { TILE } from "./constants";
import { EMPTY, OBJECTS, VILLAGE, isSolidAt } from "./map";
import { isDecorSolidAt } from "./npcs";

/**
 * The village watch (Murat 2026-11-03): two watchmen inside every gate of the Oakvale stockade. They leave their post to
 * spear any monster that comes too close, then walk back. They can't be hurt, give no loot or XP, and never chase far.
 * Server: TownRoom.updateWatch. Client: client/src/watch.ts.
 */
export const WATCH = {
  sightTiles: 6,    // a monster this close to a watchman's post is attacked
  leashTiles: 9,    // never strays further than this from the post
  reach: 26,        // spear reach (px)
  speed: 78,        // px/s, a brisk march
  hitEveryMs: 1100,
  windMs: 260,      // the thrust lands this long after the swing starts (the spear is out on the anim's 5th frame)
  /** Damage: a flat jab plus a share of the monster's max HP, so a few thrusts drop anything that wanders up to the gate. */
  damage: (maxHp: number) => Math.round(14 + maxHp * 0.24),
  knockback: 10,    // px
  stunMs: 250,
};

export interface WatchPost {
  id: string;
  x: number; y: number;           // post (feet, px)
  gx: number; gy: number;         // gate opening centre (px): the way out and back in
  nx: number; ny: number;         // inward normal of the wall (unit, axis aligned)
  wall: number;                   // the wall line in px along the normal axis (y for north/south walls, x for east/west)
}

const walkable = (px: number, py: number) => !isSolidAt(px, py) && !isDecorSolidAt(px, py);

/** Openings in the stockade wall (gates): runs of non-palisade tiles along each side. */
function gates() {
  const V = VILLAGE, out: { tx: number; ty: number; n: number; nx: number; ny: number }[] = [];
  const scan = (len: number, at: (i: number) => [number, number], nx: number, ny: number) => {
    let run: [number, number][] = [];
    const flush = () => {
      if (run.length) {
        out.push({ tx: run.reduce((s, r) => s + r[0], 0) / run.length, ty: run.reduce((s, r) => s + r[1], 0) / run.length, n: run.length, nx, ny });
      }
      run = [];
    };
    for (let i = 1; i < len; i++) {
      const [tx, ty] = at(i);
      if (OBJECTS[ty][tx] === EMPTY) run.push([tx, ty]); else flush();
    }
    flush();
  };
  scan(V.x1 - V.x0, (i) => [V.x0 + i, V.y0], 0, 1);   // north wall, inward = south
  scan(V.x1 - V.x0, (i) => [V.x0 + i, V.y1], 0, -1);  // south wall
  scan(V.y1 - V.y0, (i) => [V.x0, V.y0 + i], 1, 0);   // west wall
  scan(V.y1 - V.y0, (i) => [V.x1, V.y0 + i], -1, 0);  // east wall
  return out.filter((g) => g.n <= 4); // real gates are narrow; ignore any wide breach
}

/** Two posts per gate, one on each side of the opening, a little inside the wall. */
function buildPosts(): WatchPost[] {
  const posts: WatchPost[] = [];
  for (const g of gates()) {
    const gx = (g.tx + 0.5) * TILE, gy = (g.ty + 0.5) * TILE;
    const ax = g.ny !== 0 ? 1 : 0, ay = g.nx !== 0 ? 1 : 0; // along the wall
    const half = (g.n / 2 + 0.9) * TILE;
    for (const side of [-1, 1]) {
      let found: [number, number] | undefined;
      for (let depth = 1.1; depth <= 3 && !found; depth += 0.3) {
        for (let slide = 0; slide <= 1.2 && !found; slide += 0.3) {
          const x = gx + ax * side * (half + slide * TILE) + g.nx * depth * TILE, y = gy + ay * side * (half + slide * TILE) + g.ny * depth * TILE;
          if (walkable(x, y) && walkable(x - 6, y - 6) && walkable(x + 6, y + 6)) found = [x, y];
        }
      }
      if (!found) continue;
      posts.push({
        id: `w${posts.length}`, x: found[0], y: found[1], gx, gy, nx: g.nx, ny: g.ny,
        wall: g.ny !== 0 ? gy : gx,
      });
    }
  }
  return posts;
}

export const WATCH_POSTS: WatchPost[] = buildPosts();

/** True if (x, y) lies outside the wall of this post's gate. */
export function beyondWall(p: WatchPost, x: number, y: number): boolean {
  const s = p.ny !== 0 ? (y - p.wall) * p.ny : (x - p.wall) * p.nx;
  return s < -TILE * 0.3;
}

