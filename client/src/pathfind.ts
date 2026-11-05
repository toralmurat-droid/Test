import { MAP_H, MAP_W, TILE } from "../../shared/constants";
import { blocked } from "../../shared/movement";

export type Pt = { x: number; y: number };

const SQ2 = Math.SQRT2;
const STEPS: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

/** Small binary heap of nodes by priority (parallel arrays, no allocations per push). */
class Heap {
  private f: number[] = [];
  private n: number[] = [];
  get size() { return this.n.length; }
  push(f: number, n: number) {
    const F = this.f, N = this.n;
    let i = N.length;
    F.push(f); N.push(n);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (F[p] <= f) break;
      F[i] = F[p]; N[i] = N[p]; i = p;
    }
    F[i] = f; N[i] = n;
  }
  pop(): number {
    const F = this.f, N = this.n, top = N[0];
    const lf = F.pop()!, ln = N.pop()!;
    const len = N.length;
    if (len) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = -1, mf = lf;
        if (l < len && F[l] < mf) { m = l; mf = F[l]; }
        if (r < len && F[r] < mf) { m = r; mf = F[r]; }
        if (m < 0) break;
        F[i] = F[m]; N[i] = N[m]; i = m;
      }
      F[i] = lf; N[i] = ln;
    }
    return top;
  }
}

let walkGrid: Uint8Array | undefined;
/** 1 = a hero can stand in the middle of this tile. The map and the props never change, so it is worked out once. */
function grid(): Uint8Array {
  if (walkGrid) return walkGrid;
  const w = new Uint8Array(MAP_W * MAP_H);
  for (let j = 0; j < MAP_H; j++) for (let i = 0; i < MAP_W; i++) w[j * MAP_W + i] = blocked((i + 0.5) * TILE, (j + 0.5) * TILE) ? 0 : 1;
  return (walkGrid = w);
}

/** A Mawdeep gate opened or shut: work those tiles (and their neighbours, a hero is round) out again. */
export function refreshWalk(tiles: number[]) {
  if (!walkGrid) return;
  for (const k of tiles) {
    const x = k % MAP_W, y = (k / MAP_W) | 0;
    for (let j = y - 2; j <= y + 2; j++) for (let i = x - 2; i <= x + 2; i++) {
      if (i < 0 || j < 0 || i >= MAP_W || j >= MAP_H) continue;
      walkGrid[j * MAP_W + i] = blocked((i + 0.5) * TILE, (j + 0.5) * TILE) ? 0 : 1;
    }
  }
}

let scr: { run: number; stamp: Uint32Array; g: Float64Array; parent: Int32Array; closed: Uint8Array } | undefined;
function scratch() {
  const n = MAP_W * MAP_H;
  return (scr ??= { run: 0, stamp: new Uint32Array(n), g: new Float64Array(n), parent: new Int32Array(n), closed: new Uint8Array(n) });
}

/** Work out the walk grid ahead of time (e.g. while the loading screen is up). */
export function warmPaths() { grid(); scratch(); }

/**
 * Walking route for a hero from `from` to `to` (world px) on the tile grid, 8 directions, never cutting a wall corner.
 * The waypoints are tile centres (straight runs merged) and finally `to` itself. When `to` can't be reached
 * (water, a wall, too far) the route ends at the closest reachable tile instead.
 */
export function findPath(from: Pt, to: Pt, maxNodes = 6000): Pt[] {
  const tile = (v: number, n: number) => Math.max(0, Math.min(n - 1, Math.floor(v / TILE)));
  const si = tile(from.x, MAP_W), sj = tile(from.y, MAP_H);
  let gi = tile(to.x, MAP_W), gj = tile(to.y, MAP_H);
  const start = sj * MAP_W + si;
  const walk = grid();
  let goalFree = !blocked(to.x, to.y);
  if (!walk[gj * MAP_W + gi]) {
    // Clicked into water or a wall: aim for the nearest tile a hero can stand on, on the side the hero comes from
    let bi = -1, bj = -1, bd = Infinity;
    for (let r = 1; r <= 6 && bi < 0; r++) {
      for (let j = gj - r; j <= gj + r; j++) for (let i = gi - r; i <= gi + r; i++) {
        if (i < 0 || j < 0 || i >= MAP_W || j >= MAP_H || !walk[j * MAP_W + i]) continue;
        const d = Math.hypot(i - gi, j - gj) * 4 + Math.hypot(i - si, j - sj) * 0.01;
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    }
    if (bi >= 0) { gi = bi; gj = bj; }
    goalFree = false;
  }
  const goal = gj * MAP_W + gi;
  if (start === goal) return goalFree ? [{ x: to.x, y: to.y }] : [];

  const isFree = (i: number, j: number) => i >= 0 && j >= 0 && i < MAP_W && j < MAP_H && (walk[j * MAP_W + i] === 1 || j * MAP_W + i === start);
  const h = (i: number, j: number) => {
    const dx = Math.abs(i - gi), dy = Math.abs(j - gj);
    return Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy);
  };

  // Scratch arrays reused between searches; `stamp` marks which entries belong to this search
  const S = scratch();
  const run = ++S.run;
  const seen = (k: number) => S.stamp[k] === run;
  S.stamp[start] = run; S.g[start] = 0; S.closed[start] = 0; S.parent[start] = -1;
  const open = new Heap();
  open.push(h(si, sj), start);
  let best = start, bestH = h(si, sj), expanded = 0, found = false;
  while (open.size && expanded < maxNodes) {
    const n = open.pop();
    if (S.closed[n]) continue;
    S.closed[n] = 1; expanded++;
    if (n === goal) { found = true; break; }
    const i = n % MAP_W, j = (n - i) / MAP_W;
    const hn = h(i, j);
    if (hn < bestH) { bestH = hn; best = n; }
    const gn = S.g[n];
    for (const [di, dj, c] of STEPS) {
      const ni = i + di, nj = j + dj;
      if (!isFree(ni, nj)) continue;
      if (di && dj && (!isFree(i + di, j) || !isFree(i, j + dj))) continue; // no squeezing past a corner
      const k = nj * MAP_W + ni;
      if (!seen(k)) { S.stamp[k] = run; S.g[k] = Infinity; S.closed[k] = 0; }
      if (S.closed[k]) continue;
      const ng = gn + c;
      if (ng < S.g[k]) { S.g[k] = ng; S.parent[k] = n; open.push(ng + h(ni, nj), k); }
    }
  }
  const end = found ? goal : best;
  const cells: number[] = [];
  for (let n = end; n >= 0 && n !== start; n = S.parent[n]) cells.push(n);
  cells.reverse();
  // Tile centres, keeping only the turns
  const pts: Pt[] = [];
  let pdx = 0, pdy = 0, prev = start;
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    const dx = (c % MAP_W) - (prev % MAP_W), dy = Math.floor(c / MAP_W) - Math.floor(prev / MAP_W);
    if (pts.length && dx === pdx && dy === pdy) pts.pop();
    pts.push({ x: ((c % MAP_W) + 0.5) * TILE, y: (Math.floor(c / MAP_W) + 0.5) * TILE });
    pdx = dx; pdy = dy; prev = c;
  }
  if (found && goalFree) pts.push({ x: to.x, y: to.y });
  return pts;
}
