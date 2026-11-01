/**
 * Navigation metrics for the world map: how open it is and how direct travel feels.
 * Run: npx tsx tools/map-metrics.ts
 */
import { MAP_H, MAP_W, TILE } from "../shared/constants";
import { isSolidTile, randomSpawn } from "../shared/map";

const N = MAP_W * MAP_H;
const walk = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && !isSolidTile(x, y);
let walkable = 0;
for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (walk(x, y)) walkable++;

function bfs(sx: number, sy: number) {
  const d = new Int32Array(N).fill(-1);
  const q = [sx + sy * MAP_W]; d[q[0]] = 0;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % MAP_W, y = (c / MAP_W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + ny * MAP_W;
      if (walk(nx, ny) && d[k] < 0) { d[k] = d[c] + 1; q.push(k); }
    }
  }
  return d;
}
const s = randomSpawn();
const sx = Math.floor(s.x / TILE), sy = Math.floor(s.y / TILE);
const fromSpawn = bfs(sx, sy);
let reach = 0;
for (let i = 0; i < N; i++) if (fromSpawn[i] >= 0) reach++;

// Detour: BFS distance vs straight-line (manhattan) distance between random reachable tiles
const reachable: number[] = [];
for (let i = 0; i < N; i++) if (fromSpawn[i] >= 0) reachable.push(i);
let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
let ratio = 0, worst = 0, samples = 0, worstAt = '';
for (let k = 0; k < 40; k++) {
  const a = reachable[Math.floor(rnd() * reachable.length)];
  const d = bfs(a % MAP_W, (a / MAP_W) | 0);
  for (let j = 0; j < 25; j++) {
    const b = reachable[Math.floor(rnd() * reachable.length)];
    const m = Math.abs((a % MAP_W) - (b % MAP_W)) + Math.abs(((a / MAP_W) | 0) - ((b / MAP_W) | 0));
    if (m < 10) continue;
    const r = d[b] / m; ratio += r; samples++; if (r > worst) { worst = r; worstAt = `(${a % MAP_W},${(a / MAP_W) | 0}) -> (${b % MAP_W},${(b / MAP_W) | 0})`; }
  }
}
// Narrow spots: walkable tiles squeezed between solids on both sides (1-tile corridors)
let narrow = 0;
for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
  if (!walk(x, y)) continue;
  if ((!walk(x - 1, y) && !walk(x + 1, y)) || (!walk(x, y - 1) && !walk(x, y + 1))) narrow++;
}
console.log(`map ${MAP_W}x${MAP_H} (${N} tiles)`);
console.log(`walkable ${(100 * walkable / N).toFixed(1)}%  reachable from spawn ${(100 * reach / walkable).toFixed(1)}% of walkable`);
console.log(`detour factor avg ${(ratio / samples).toFixed(2)}  worst ${worst.toFixed(2)} ${worstAt}  (1.00 = straight line)`);
console.log(`1-tile squeeze spots: ${narrow}`);
