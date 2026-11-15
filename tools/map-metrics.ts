/**
 * Navigation metrics for the world map: how open it is and how direct travel feels.
 * Run: npx tsx tools/map-metrics.ts
 */
import { DEEP_END, DEEP_Y0, DESERT_H, DESERT_Y0, BADLANDS_H, BADLANDS_Y0, MAP_H, MAP_W, MOORS_H, MOORS_Y0, SINKHOLES_H, SINKHOLES_Y0, TILE, UNDER_END, WORLD_H } from "../shared/constants";
import { DOORS, isSolidTile, randomSpawn } from "../shared/map";
import { FLOORS, LANDING } from "../shared/dungeon";
import { waygateArrival, waygateById } from "../shared/act2";

const N = MAP_W * MAP_H;
// dungeon gates count as open (a hero opens them), so the floors behind them are reachable
const doorTiles = new Set(DOORS.flatMap((d) => d.tiles));
const walk = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && (!isSolidTile(x, y) || doorTiles.has(y * MAP_W + x));
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

// Reachability per band: the bands are joined by gates, ropes and stairs, not on foot, so each floods from its own way in
const px = (p: { x: number; y: number }): [number, number] => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)];
const bands: { name: string; y0: number; y1: number; from: [number, number][] }[] = [
  { name: "Act 1 overworld (Oakvale)", y0: 0, y1: WORLD_H, from: [[sx, sy]] },
  { name: "Mawdeep Warrens", y0: WORLD_H, y1: UNDER_END, from: FLOORS.filter((f) => f.dungeon === "maw").map((f) => [Math.round(f.x + f.chambers[LANDING].x), Math.round(f.y + f.chambers[LANDING].y)]) },
  { name: "Act 2 desert (waygate)", y0: DESERT_Y0, y1: DESERT_Y0 + DESERT_H, from: [px(waygateArrival(waygateById("desert")!))] },
  { name: "deep band (crypt, undercity)", y0: DEEP_Y0, y1: DEEP_END, from: FLOORS.filter((f) => f.y >= DEEP_Y0).map((f) => [Math.round(f.x + f.chambers[LANDING].x), Math.round(f.y + f.chambers[LANDING].y)]) },
  { name: "Act 3 moors (moorgate)", y0: MOORS_Y0, y1: MOORS_Y0 + MOORS_H, from: [px(waygateArrival(waygateById("moors")!))] },
  { name: "Act 4 badlands (Red Pass)", y0: BADLANDS_Y0, y1: BADLANDS_Y0 + BADLANDS_H, from: [px(waygateArrival(waygateById("badlands")!))] },
  { name: "Act 5 sinkholes (Sinkway)", y0: SINKHOLES_Y0, y1: SINKHOLES_Y0 + SINKHOLES_H, from: [px(waygateArrival(waygateById("sinkholes")!))] },
];
const bandLines: string[] = [];
let allReach = true;
for (const b of bands) {
  const seen = new Uint8Array(N);
  for (const [x, y] of b.from) { const d = bfs(x, y); for (let i = 0; i < N; i++) if (d[i] >= 0) seen[i] = 1; }
  let w = 0, r = 0;
  for (let y = b.y0; y < b.y1; y++) for (let x = 0; x < MAP_W; x++) if (walk(x, y)) { w++; if (seen[y * MAP_W + x]) r++; }
  if (r < w) allReach = false;
  bandLines.push(`  ${b.name.padEnd(30)} rows ${b.y0}-${b.y1 - 1}: walkable ${w}, reachable ${(100 * r / Math.max(1, w)).toFixed(1)}%`);
}
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
console.log(`walkable ${(100 * walkable / N).toFixed(1)}%  reachable from Oakvale on foot ${(100 * reach / walkable).toFixed(1)}% of walkable (other bands: by gate, rope or stair)`);
console.log(`reachability per band, from its way in:\n${bandLines.join("\n")}`);
if (!allReach) { console.log("SOME WALKABLE TILES ARE UNREACHABLE"); process.exitCode = 1; }
console.log(`detour factor avg ${(ratio / samples).toFixed(2)}  worst ${worst.toFixed(2)} ${worstAt}  (1.00 = straight line)`);
console.log(`1-tile squeeze spots: ${narrow}`);
