/**
 * Suggests land highway waypoints (shared/highways.ts) and shows what the highways moved. Run: npx tsx tools/highway-route.ts [land]
 *
 * For each leg below it finds a road-preferring way between its via points (open ground costs more, woods more still;
 * water, cliffs, houses and walls are closed; inside a town or village its own streets, or open ground where they break
 * off, for a `join` leg; inside a city gate's or a capital fort's box only road) and keeps away from the
 * forts, then simplifies the line to within a tile, so the old 1-wide road stays under the 3-wide core. Paste the
 * printed `pts` into HIGHWAYS. It reads the built map, highways and all, so a rerun mostly repeats itself. Then it prints
 * the forts, standards and guarded pass ends (diff against a run before the change: forts may move, none may be lost).
 */
import { EMPTY, GROUND, HIGHWAY_SKIP, isSolidTile, NATURE, OBJECTS, T, WORLD } from "../shared/map";
import { MAP_W } from "../shared/constants";
import { BORDERS, endPath, LAND_ROWS } from "../shared/borders";
import { fortSkipBoxes, HIGHWAY_HALF } from "../shared/highways";
import { CITIES } from "../shared/capitals";
import { HOLDS, STANDARDS } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";

type P = [number, number];
/** Via points per leg (map tiles); each consecutive pair is routed. */
const LEGS: Record<number, { from: string; to: string; via: P[] }[]> = {
  1: [
    { from: "Hearthhold Gate", to: "Goldenreach Farms", via: [[66, 42], [52, 46], [52, 57]] },
    { from: "Goldenreach Farms", to: "Oakvale", via: [[30, 58], [64, 60]] },
    { from: "Hearthhold Gate", to: "Oakvale", via: [[66, 42], [79, 46]] },
    { from: "Hearthhold", to: "Hunter's Camp", via: [[40, 27], [35, 17]] },
    { from: "Oakvale", to: "Millbrook Mill", via: [[96, 61], [104, 50]] },
    { from: "Oakvale", to: "The Red Road", via: [[63, 61], [14, 121]] },
    { from: "Oakvale", to: "Stonecrag Quarry", via: [[80, 74], [95, 95]] },
    { from: "Stonecrag Quarry", to: "Saltmere", via: [[96, 96], [98, 125], [104, 156], [124, 177]] },
    { from: "Saltmere", to: "The Greenward Road", via: [[161, 182], [222, 162], [246, 176], [272, 177]] },
    { from: "Stonecrag Quarry", to: "Old Ruins", via: [[96, 95], [140, 64]] },
    { from: "Old Ruins", to: "The Eastmarch Pass", via: [[140, 64], [193, 57], [246, 57]] },
  ],
  2: [
    { from: "Duskveil Gate", to: "The Veiled Sanctum", via: [[223, 354], [231, 353]] },
    { from: "Duskveil Gate", to: "Mirage Wells", via: [[223, 355], [232, 361], [216, 408]] },
    { from: "Mirage Wells", to: "Kel Ashar", via: [[216, 408], [165, 410], [157, 411], [155, 410]] },
    { from: "Mirage Wells", to: "Mirage Wells' east shore", via: [[216, 408], [219, 416]] },
    { from: "Kel Ashar", to: "Jackal Springs", via: [[148, 395], [100, 365]] },
    { from: "Jackal Springs", to: "The Ashen Pass", via: [[100, 365], [99, 360], [146, 345]] },
    { from: "Jackal Springs", to: "The Sun Road", via: [[100, 365], [89, 364], [65, 366], [46, 368]] },
    { from: "Kel Ashar", to: "The Dune Road", via: [[131, 410], [48, 445], [42, 450]] },
  ],
  3: [
    { from: "Marrowkeep Gate", to: "The Host's Muster", via: [[242, 675], [251, 680]] },
    { from: "The Host's Muster", to: "The Mourning Road", via: [[251, 680], [257, 702]] },
    { from: "The Host's Muster", to: "Cairnwatch", via: [[251, 680], [166, 697], [138, 693], [89, 704]] },
    { from: "Cairnwatch", to: "The Eastmarch Pass", via: [[77, 714], [52, 720]] },
    { from: "Cairnwatch", to: "The Ashen Pass", via: [[78, 717], [117, 742], [145, 739], [146, 740]] },
  ],
  4: [
    { from: "Scarwall Gate", to: "Fangrock", via: [[26, 824], [47, 843], [48, 855], [50, 857]] },
    { from: "Fangrock", to: "Vulture's Roost", via: [[50, 857], [119, 852]] },
    { from: "Fangrock", to: "The Rattler's Way", via: [[60, 851], [76, 908]] },
    { from: "Vulture's Roost", to: "The Rustwater Post", via: [[119, 852], [181, 866], [221, 872]] },
    { from: "The Rustwater Post", to: "The Redgate Road", via: [[240, 880], [231, 890]] },
    { from: "The Rustwater Post", to: "The Red Road", via: [[246, 872], [271, 876]] },
  ],
  5: [
    { from: "Deepden Gate", to: "Hidehall", via: [[206, 1075], [207, 1064], [214, 1064], [236, 1068], [248, 1089]] },
    { from: "Hidehall", to: "The Dune Road", via: [[236, 1068], [238, 1067]] },
    { from: "Hidehall", to: "Ropewell", via: [[207, 1064], [166, 1056], [137, 1050], [116, 1000]] },
    { from: "The Great Maw", to: "Tunneltop", via: [[158, 1046], [192, 1034]] },
    { from: "Ropewell", to: "The Deep Road", via: [[127, 991], [160, 998]] },
    { from: "Ropewell", to: "The Rattler's Way", via: [[104, 992], [60, 998], [46, 1030], [45, 1042], [30, 1037]] },
    { from: "The Rattler's Way", to: "Mosslight Fen", via: [[45, 1041], [44, 1068], [44, 1076]] },
  ],
  6: [
    { from: "The Redgate Road", to: "The Red road", via: [[27, 1244], [27, 1239]] },
    { from: "The Deep Road", to: "The Deep road", via: [[150, 1300], [145, 1297]] },
    { from: "The Sun Road", to: "The Sun road", via: [[261, 1289], [256, 1292]] },
    { from: "Tollcross", to: "The Crown Keep", via: [[144, 1198], [144, 1219]] },
  ],
};

const W = MAP_W, roads = WORLD.roads, NAT = new Set<number>([...NATURE, T.CACTUS, T.BONES, T.STUMP]);
const inSkip = (x: number, y: number) => HIGHWAY_SKIP.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
const KEEP = [...CITIES.map((c) => c.outerBox), ...fortSkipBoxes()];
/** A city gate's or a capital fort's box: never joined across, only its roads. */
const inKeep = (x: number, y: number) => KEEP.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
/** Water, cliffs and anything built: the middle line never crosses these (a bridge is fine). */
const closed = (x: number, y: number) => {
  const g = GROUND[y]?.[x], o = OBJECTS[y]?.[x];
  return g === undefined || g === T.WATER || (o !== EMPTY && !NAT.has(o));
};
const hard = (x: number, y: number) => { const o = OBJECTS[y]?.[x]; return o !== undefined && o !== EMPTY && !NAT.has(o) && isSolidTile(x, y); };
const forts = HOLDS.filter((h) => h.site !== "capital").map((h) => [Math.floor(h.x / 32), Math.floor(h.y / 32)]);

function route(a: P, b: P, y0: number, y1: number): P[] {
  const snap = ([px, py]: P): P => { let best: P = [px, py], bd = Infinity; for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) if (roads.has((py + j) * W + px + i) && Math.hypot(i, j) < bd) { bd = Math.hypot(i, j); best = [px + i, py + j]; } return best; };
  const [sx, sy] = snap(a), [tx, ty] = snap(b);
  const cost = (x: number, y: number) => {
    const road = roads.has(y * W + x);
    if (closed(x, y)) return Infinity; // (a few old road tiles lie under water or a stall)
    if (inSkip(x, y)) return road ? 1 : inKeep(x, y) ? Infinity : 4; // a town's broken street: joined (`join`)
    let c = road ? 1 : NAT.has(OBJECTS[y][x]) && isSolidTile(x, y) ? 7 : 3;
    for (let j = -HIGHWAY_HALF; j <= HIGHWAY_HALF; j++) for (let i = -HIGHWAY_HALF; i <= HIGHWAY_HALF; i++) if (hard(x + i, y + j)) c += 8; // room for 3 wide
    if (!process.env.NOFORT && forts.some(([fx, fy]) => Math.max(Math.abs(fx - x), Math.abs(fy - y)) <= 9)) c += 10; // keep off the forts' clearings (NOFORT=1: ride the old road past them)
    return c;
  };
  const n = W * (y1 - y0), dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), heap: [number, number][] = [];
  const push = (d: number, k: number) => { heap.push([d, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const t = heap[0], l = heap.pop()!; if (heap.length) { heap[0] = l; let i = 0; for (;;) { const c1 = 2 * i + 1, c2 = c1 + 1; let m = i; if (c1 < heap.length && heap[c1][0] < heap[m][0]) m = c1; if (c2 < heap.length && heap[c2][0] < heap[m][0]) m = c2; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return t; };
  const s = (sy - y0) * W + sx; dist[s] = 0; push(0, s);
  while (heap.length) {
    const [d, k] = pop(); if (d > dist[k]) continue;
    const x = k % W, y = Math.floor(k / W) + y0;
    if (x === tx && y === ty) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || nx >= W || ny < y0 || ny >= y1) continue;
      if (dx && dy && (closed(x + dx, y) || closed(x, y + dy))) continue; // no squeezing past a corner
      const c = cost(nx, ny); if (!isFinite(c)) continue;
      const o = (ny - y0) * W + nx, nd = d + c * (dx && dy ? 1.414 : 1);
      if (nd < dist[o]) { dist[o] = nd; prev[o] = k; push(nd, o); }
    }
  }
  const out: P[] = []; for (let k = (ty - y0) * W + tx; k >= 0; k = prev[k]) { out.push([k % W, Math.floor(k / W) + y0]); if (k === s) break; }
  if (out[out.length - 1][0] !== sx || out[out.length - 1][1] !== sy) throw new Error(`no way from ${a} to ${b}`);
  return out.reverse();
}

/** The tiles a segment's middle line covers (as highways.ts legLine draws it). */
const raster = ([x0, y0]: P, [x1, y1]: P): P[] => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4)), o: P[] = []; for (let k = 0; k <= n; k++) o.push([Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n)]); return o; };
/** Douglas-Peucker to within `tol` tiles, splitting further wherever a straight piece would cross something closed or leave an old path tile outside the core. */
function simplify(path: P[], tol = 0.8): P[] {
  const ok = (i: number, j: number) => {
    const seg = raster(path[i], path[j]);
    if (seg.some(([x, y]) => closed(x, y))) return false; // (in a town too: a `join` leg paves its middle line there)
    for (let k = i; k <= j; k++) if (!seg.some(([x, y]) => Math.max(Math.abs(x - path[k][0]), Math.abs(y - path[k][1])) <= HIGHWAY_HALF)) return false;
    return true;
  };
  const rec = (i: number, j: number): P[] => {
    const [ax, ay] = path[i], [bx, by] = path[j], L = Math.hypot(bx - ax, by - ay) || 1;
    let far = -1, fd = 0;
    for (let k = i + 1; k < j; k++) { const d = Math.abs((bx - ax) * (ay - path[k][1]) - (ax - path[k][0]) * (by - ay)) / L; if (d > fd) { fd = d; far = k; } }
    if (far < 0 || (fd <= tol && ok(i, j))) return [path[i]];
    if (fd <= tol) far = (i + j) >> 1;
    return [...rec(i, far), ...rec(far, j)];
  };
  return [...rec(0, path.length - 1), path[path.length - 1]];
}

const only = process.argv[2] ? Number(process.argv[2]) : undefined;
for (const [land, legs] of Object.entries(LEGS)) {
  if (only !== undefined && Number(land) !== only) continue;
  const { y0, h } = LAND_ROWS[Number(land) as 1];
  console.log(`\n// land ${land}`);
  for (const l of legs) {
    let path: P[] = [];
    for (let i = 0; i + 1 < l.via.length; i++) { const p = route(l.via[i], l.via[i + 1], y0, y0 + h); path = path.concat(i ? p.slice(1) : p); }
    const pts = simplify(path).map(([x, y]) => `[${x}, ${y - y0}]`).join(", ");
    const fresh = path.filter(([x, y]) => !roads.has(y * W + x)).length, joins = path.some(([x, y]) => inSkip(x, y) && !roads.has(y * W + x));
    console.log(`    { from: ${JSON.stringify(l.from)}, to: ${JSON.stringify(l.to)}, pts: [${pts}]${joins ? ", join: true" : ""} }, // ${path.length} tiles, ${fresh} off today's roads`);
  }
}
console.log("\n// forts (diff against a run before the change)");
for (const h of HOLDS) console.log("hold", TERRITORIES[h.t].region, TERRITORIES[h.t].name, h.site, h.anchor, h.x / 32, h.y / 32);
let guarded = 0; for (const b of BORDERS) for (const e of [b.a, b.b]) { const [x, y] = endPath(e)[0]; if (HOLDS.some((o) => Math.hypot(o.x / 32 - x, o.y / 32 - y) <= 30)) guarded++; }
console.log("holds", HOLDS.length, "standards", STANDARDS.length);
console.log("pass ends guarded", guarded, "of", BORDERS.length * 2);
