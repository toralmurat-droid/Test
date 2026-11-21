/**
 * How easy the forests are to walk through: random walks held in one direction (keyboard) and click-to-walk routes
 * (client/src/pathfind.ts) between random spots in the wooded areas. Run: npx tsx tools/forest-nav.ts [area...]
 */
import { dirInput, PLAYER_SPEED, TILE } from "../shared/constants";
import { AREAS, OBJECTS, T } from "../shared/map";
import { blocked, moveStep } from "../shared/movement";
import { findPath } from "../client/src/pathfind";

const names = process.argv.slice(2).length ? process.argv.slice(2) : ["Whispering Woods", "Thornwood"];
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
for (const n of names) {
  const a = AREAS.find((r) => r.name === n)!;
  const spot = () => {
    for (;;) {
      const x = (a.x + rnd() * a.w) * TILE, y = (a.y + rnd() * a.h) * TILE;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), o = OBJECTS[ty]?.[tx];
      if (!blocked(x, y) && o !== undefined) {
        // only spots with trees around them (the forest itself, not a village or a clearing)
        let trees = 0;
        for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const q = OBJECTS[ty + j]?.[tx + i]; if (q === T.TREE || q === T.PINE) trees++; }
        if (trees >= 6) return { x, y };
      }
    }
  };
  // 1. Keyboard: hold one of the 8 directions for 2 s, how far does the hero get compared with open ground?
  let got = 0, stuck = 0; const K = 1500, dt = 1 / 30, steps = 60;
  for (let k = 0; k < K; k++) {
    let p = spot(); const [dx, dy] = DIRS[k % 8];
    const input = { up: dy < 0, down: dy > 0, left: dx < 0, right: dx > 0 } as any;
    const p0 = { ...p };
    for (let s = 0; s < steps; s++) { const r = moveStep(p.x, p.y, input, dt); p = { x: r.x, y: r.y }; }
    const d = Math.hypot(p.x - p0.x, p.y - p0.y) / (PLAYER_SPEED * dt * steps);
    got += d; if (d < 0.35) stuck++;
  }
  // 2. Click to walk: route length vs straight distance
  let ratio = 0, routes = 0, fail = 0, arrived = 0;
  const clear = (a: { x: number; y: number }, b: { x: number; y: number }) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)); for (let i = 1; i <= n; i++) if (blocked(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n)) return false; return true; };
  // walk the route the way the click-to-walk steering does (head for the farthest waypoint in a straight line)
  const follow = (p: { x: number; y: number }, path: { x: number; y: number }[]) => {
    path = [...path]; const dt = 1 / 30;
    for (let s = 0; s < 30 * 40 && path.length; s++) {
      while (path.length && Math.hypot(path[0].x - p.x, path[0].y - p.y) <= Math.max(2, PLAYER_SPEED * dt * 1.1)) path.shift();
      if (!path.length) break;
      for (let k = Math.min(path.length - 1, 6); k > 0; k--) if (clear(p, path[k])) { path.splice(0, k); break; }
      const r = moveStep(p.x, p.y, dirInput(path[0].x - p.x, path[0].y - p.y), dt); p = { x: r.x, y: r.y };
    }
    return p;
  };
  for (let k = 0; k < 300; k++) {
    const p = spot(), q = { x: p.x + (rnd() - 0.5) * 16 * TILE, y: p.y + (rnd() - 0.5) * 16 * TILE };
    if (blocked(q.x, q.y)) continue;
    const pts = findPath(p, q); const last = pts[pts.length - 1];
    if (!last || Math.hypot(last.x - q.x, last.y - q.y) > 1) { fail++; continue; }
    let len = 0, c = p; for (const w of pts) { len += Math.hypot(w.x - c.x, w.y - c.y); c = w; }
    ratio += len / Math.hypot(q.x - p.x, q.y - p.y); routes++;
    const e = follow(p, pts); if (Math.hypot(e.x - q.x, e.y - q.y) < 6) arrived++;
  }
  console.log(`${n}: keyboard walk ${(100 * got / K).toFixed(0)}% of open-ground distance, stuck ${(100 * stuck / K).toFixed(0)}% | click routes ${(ratio / routes).toFixed(2)}x straight line, unreachable ${fail}, walked there ${(100 * arrived / routes).toFixed(0)}%`);
}
