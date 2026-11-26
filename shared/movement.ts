import { InputState, inputDir, PLAYER_RADIUS, PLAYER_SPEED, TILE } from "./constants";
import { isWalkSolidAt as mapSolidAt } from "./map";
import { isDecorSolidAt } from "./npcs";
import { holdWallPx } from "./war/holdWalls";

/** Map tiles, the props around the village traders (shared/npcs.ts) and the walls of the clan Holds as held now (shared/war/holdWalls.ts). */
const isSolidAt = (x: number, y: number) => mapSolidAt(x, y) || isDecorSolidAt(x, y) || holdWallPx(x, y);
/**
 * For code that puts a body down or slides it (a monster budded, raised or called, a champion's blink, a rush, a hero's
 * dash or pull): the map at the point, as before, plus the feet box (PLAYER_RADIUS) against the landmarks
 * (shared/landmarks.ts), the capitals' props and the Hold walls. The map alone misses those, and a body left with its
 * feet in one could never walk out (moveStep refuses every step whose feet box overlaps a solid), so a dash stops
 * before the box, as walking does. Map walls keep the old point test, so moves along them are unchanged.
 */
export function bodySolidAt(x: number, y: number): boolean {
  if (mapSolidAt(x, y)) return true;
  const r = PLAYER_RADIUS, off = (px: number, py: number) => isDecorSolidAt(px, py) || holdWallPx(px, py);
  return off(x - r, y - r) || off(x + r, y - r) || off(x - r, y + r) || off(x + r, y + r);
}

/** True when a hero's feet box at (x, y) overlaps a wall, water or a solid prop. */
export function blocked(x: number, y: number): boolean {
  const r = PLAYER_RADIUS;
  // Check feet-box corners, and the middles of its sides against the map: a round tree trunk can poke into a side
  // between two corners (walls, stumps and props are square and at least as big as the box, the corners catch them)
  return (
    isSolidAt(x - r, y - r) || isSolidAt(x + r, y - r) ||
    isSolidAt(x - r, y + r) || isSolidAt(x + r, y + r) ||
    mapSolidAt(x - r, y) || mapSolidAt(x + r, y) || mapSolidAt(x, y - r) || mapSolidAt(x, y + r)
  );
}

/**
 * The nearest spot (px, a tile centre or the spot itself) within `maxTiles` where a hero's feet box is free, nearest
 * first; undefined when there is none. The server moves people out of a Hold wall that rose under them with it.
 */
export function nearestFree(x: number, y: number, maxTiles = 6): { x: number; y: number } | undefined {
  if (!blocked(x, y)) return { x, y };
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  let best: { x: number; y: number } | undefined, bd = Infinity;
  for (let r = 0; r <= maxTiles; r++) {
    if (best && bd <= r * TILE - TILE) break; // nothing in a farther ring can be nearer
    for (let j = ty - r; j <= ty + r; j++) for (let i = tx - r; i <= tx + r; i++) {
      if (Math.max(Math.abs(i - tx), Math.abs(j - ty)) !== r) continue;
      const cx = (i + 0.5) * TILE, cy = (j + 0.5) * TILE, d = Math.hypot(cx - x, cy - y);
      if (d < bd && !blocked(cx, cy)) { bd = d; best = { x: cx, y: cy }; }
    }
  }
  return best;
}

/** How far aside (px) a hero looks for a way round an edge it walks into: a tree trunk's radius plus the feet box. */
const ASSIST = 18;
/** Turns (radians) the rounding assist in moveStep tries, nearest first. */
const TURNS = [0.4, -0.4, 0.8, -0.8, 1.2, -1.2];
/** Sideways shift (at most `step`) toward the nearer side where the way ahead opens up, or 0. */
function sidestep(clearAt: (o: number) => boolean, canMove: (o: number) => boolean, step: number): number {
  for (let k = 1; k <= ASSIST; k++) {
    for (const s of [1, -1]) {
      if (!clearAt(s * k)) continue;
      const d = s * Math.min(step, k);
      return canMove(d) ? d : 0;
    }
  }
  return 0;
}

/** Shared movement step: identical on server (authoritative) and client (prediction). */
export function moveStep(x: number, y: number, input: InputState, dtSec: number, speed = PLAYER_SPEED) {
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  // Standing still (most monsters most of the time): the steps below would give exactly this, through 2 wall tests
  if (!dx && !dy && Number.isFinite(speed * dtSec)) return { x, y, moving: false };
  if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
  // Point-and-click walks at its exact angle (only while a key direction says it is walking at all)
  const v = (dx || dy) ? inputDir(input) : undefined;
  if (v) [dx, dy] = v;
  const x0 = x, y0 = y;
  const nx = x + dx * speed * dtSec;
  const ny = y + dy * speed * dtSec;
  // Resolve axes separately so players slide along walls
  const bx = blocked(nx, y);
  if (!bx) x = nx;
  const by = blocked(x, ny);
  if (!by) y = ny;
  // Wedged between two things where only the diagonal step itself is free (e.g. a rock below, a stump ahead)
  if (bx && by && !blocked(nx, ny)) return { x: nx, y: ny, moving: true };
  // Corner assist: walking (nearly) straight into the edge of a stump, tree or wall corner, the hero slips sideways
  // round it when the way is clear a few px aside, instead of snagging on it
  const step = speed * dtSec;
  if (bx && Math.abs(dy) < 0.4 * Math.abs(dx)) y += sidestep((o) => !blocked(nx, y + o) && !blocked(x, y + o), (o) => !blocked(x, y + o), step);
  else if (by && Math.abs(dx) < 0.4 * Math.abs(dy)) x += sidestep((o) => !blocked(x + o, ny) && !blocked(x + o, y), (o) => !blocked(x + o, y), step);
  // Rounding assist (any angle): still held up (less than half a step made), try the step turned a little either way,
  // so a hero glides round a trunk and into the gap between two trees touching corner to corner
  if ((bx || by) && (x - x0) * dx + (y - y0) * dy < 0.5 * step) {
    let best = (x - x0) * dx + (y - y0) * dy, bx2 = x, by2 = y;
    for (const a of TURNS) {
      const c = Math.cos(a), s = Math.sin(a), rx = dx * c - dy * s, ry = dx * s + dy * c;
      const tx = x0 + rx * step, ty = y0 + ry * step, prog = (tx - x0) * dx + (ty - y0) * dy;
      if (prog > best + 1e-9 && !blocked(tx, ty)) { best = prog; bx2 = tx; by2 = ty; }
    }
    x = bx2; y = by2;
  }
  return { x, y, moving: dx !== 0 || dy !== 0 };
}
