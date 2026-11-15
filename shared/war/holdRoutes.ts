/**
 * Walking round the Hold walls (shared/war/holdWalls.ts) for monsters that steer by themselves (server/warTroops.ts
 * walk: a guard going to its post on the far side of the fort, a man coming out of the courtyard). Away from a fort,
 * or when the straight way is clear, the goal itself; else the farthest tile in sight along the shortest tile path to
 * the goal (a small BFS field round the Hold, cached per goal and holder).
 */
import { MAP_H, MAP_W, TILE } from "../constants";
import { blocked } from "../movement";
import { liveHolder, liveReachPx } from "./holdWalls";
import { HOLDS } from "./standards";

/** Tiles round a Hold that a field covers (the goal's tile is always inside it). */
const FIELD_R = 18;
/** Tiles of the path looked along for the farthest one in sight (long enough that a hook round stumps reads the same from each tile on it). */
const CHAIN = 20;
/** Fields kept (goal x holder); all are dropped when there are more. */
const FIELD_MAX = 1500;

interface Field { x0: number; y0: number; w: number; h: number; dist: Int16Array }
const fields = new Map<string, Field>();

const STEPS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Does the segment (ax, ay)-(bx, by) cross the square of half-size r round (cx, cy)? (slab test) */
function crossesSquare(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): boolean {
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[ax, bx - ax, cx - r, cx + r], [ay, by - ay, cy - r, cy + r]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
    let u = (lo - p) / d, v = (hi - p) / d;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    if (t0 > t1) return false;
  }
  return true;
}

/** Can a body walk straight from a to b (its feet box free every 4 px)? */
function clearLine(ax: number, ay: number, bx: number, by: number): boolean {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 4);
  for (let i = 1; i <= n; i++) if (blocked(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n)) return false;
  return true;
}

/**
 * Steps (8-way, never cutting a corner) from every tile round the Hold at tile (hx, hy) to the goal (px), with the walls
 * as they stand: 0 on the goal's tile (if open) and on each open tile next to it with the goal in a straight line (a goal by a stump).
 */
function field(hx: number, hy: number, px: number, py: number, k: string): Field {
  const got = fields.get(k);
  if (got) return got;
  if (fields.size >= FIELD_MAX) fields.clear();
  const gx = Math.floor(px / TILE), gy = Math.floor(py / TILE);
  const x0 = Math.max(0, Math.min(hx - FIELD_R, gx - 2)), y0 = Math.max(0, Math.min(hy - FIELD_R, gy - 2));
  const x1 = Math.min(MAP_W - 1, Math.max(hx + FIELD_R, gx + 2)), y1 = Math.min(MAP_H - 1, Math.max(hy + FIELD_R, gy + 2));
  const w = x1 - x0 + 1, h = y1 - y0 + 1, dist = new Int16Array(w * h).fill(-1), walk = new Uint8Array(w * h);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) walk[(y - y0) * w + x - x0] = blocked((x + 0.5) * TILE, (y + 0.5) * TILE) ? 0 : 1;
  const free = (x: number, y: number) => x >= x0 && y >= y0 && x <= x1 && y <= y1 && walk[(y - y0) * w + x - x0] === 1;
  const q = new Int32Array(w * h);
  let head = 0, tail = 0;
  if (free(gx, gy)) { dist[(gy - y0) * w + gx - x0] = 0; q[tail++] = (gy - y0) * w + gx - x0; }
  for (const [dx, dy] of STEPS) {
    const nx = gx + dx, ny = gy + dy, n = (ny - y0) * w + nx - x0;
    if (free(nx, ny) && clearLine((nx + 0.5) * TILE, (ny + 0.5) * TILE, px, py)) { dist[n] = 0; q[tail++] = n; }
  }
  while (head < tail) {
    const c = q[head++], cx = (c % w) + x0, cy = Math.floor(c / w) + y0;
    for (const [dx, dy] of STEPS) {
      const nx = cx + dx, ny = cy + dy;
      if (!free(nx, ny) || (dx && dy && (!free(cx + dx, cy) || !free(cx, cy + dy)))) continue;
      const n = (ny - y0) * w + nx - x0;
      if (dist[n] !== -1) continue;
      dist[n] = dist[c] + 1; q[tail++] = n;
    }
  }
  const f = { x0, y0, w, h, dist };
  fields.set(k, f);
  return f;
}

/**
 * Where a monster at (x, y) bound for (gx, gy) should head so it walks round a Hold's walls (as held now) instead of
 * into them. Cheap when no wall stands near or the way is clear.
 */
export function fortDetour(x: number, y: number, gx: number, gy: number): { x: number; y: number } {
  for (const hd of HOLDS) {
    if (Math.abs(hd.x - x) > 12 * TILE || Math.abs(hd.y - y) > 12 * TILE) continue;
    const r = liveReachPx(hd.t);
    if (!r || !crossesSquare(x, y, gx, gy, hd.x, hd.y, r + 3 * TILE) || clearLine(x, y, gx, gy)) continue; // (rocks by the walls count: they make the corners)
    const htx = Math.floor(hd.x / TILE), hty = Math.floor(hd.y / TILE);
    const f = field(htx, hty, gx, gy, `${hd.t}:${liveHolder(hd.t)}:${Math.round(gx)},${Math.round(gy)}`);
    const at = (tx: number, ty: number) => (tx >= f.x0 && ty >= f.y0 && tx < f.x0 + f.w && ty < f.y0 + f.h ? f.dist[(ty - f.y0) * f.w + tx - f.x0] : -1);
    let tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < f.x0 || ty < f.y0 || tx >= f.x0 + f.w || ty >= f.y0 + f.h) return { x: gx, y: gy };
    // down the field: the chain of tiles toward the goal, then the farthest one in a straight line
    const chain: [number, number][] = [];
    if (at(tx, ty) < 0) { // standing half in a wall's tile or a rock's: the nearest tile of the field next to it
      const near = STEPS.map(([dx, dy]) => [tx + dx, ty + dy, at(tx + dx, ty + dy)]).filter((n) => n[2] >= 0).sort((a, b) => a[2] - b[2]);
      const best = near.find(([nx, ny]) => clearLine(x, y, (nx + 0.5) * TILE, (ny + 0.5) * TILE)); // one it can step to, not one over a wall
      if (!best) return { x: gx, y: gy };
      [tx, ty] = best;
    }
    chain.push([tx, ty]);
    for (let i = 0; i < CHAIN && at(tx, ty) > 0; i++) {
      const d = at(tx, ty);
      const next = STEPS.find(([dx, dy]) => at(tx + dx, ty + dy) === d - 1 && (!dx || !dy || (at(tx + dx, ty) >= 0 && at(tx, ty + dy) >= 0)));
      if (!next) break;
      tx += next[0]; ty += next[1];
      chain.push([tx, ty]);
    }
    if (at(tx, ty) === 0 && clearLine(x, y, gx, gy)) return { x: gx, y: gy }; // the goal's tile in sight: the goal itself
    for (let j = chain.length - 1; j >= 1; j--) {
      const cx = (chain[j][0] + 0.5) * TILE, cy = (chain[j][1] + 0.5) * TILE;
      if (clearLine(x, y, cx, cy)) return { x: cx, y: cy };
    }
    if (chain.length === 1) return { x: gx, y: gy };
    return { x: (chain[0][0] + 0.5) * TILE, y: (chain[0][1] + 0.5) * TILE }; // to the middle of its own tile first: the way on is in sight from there
  }
  return { x: gx, y: gy };
}
