import { InputState, inputDir, PLAYER_RADIUS, PLAYER_SPEED } from "./constants";
import { isSolidAt as mapSolidAt } from "./map";
import { isDecorSolidAt } from "./npcs";

/** Map tiles plus the props around the village traders (shared/npcs.ts). */
const isSolidAt = (x: number, y: number) => mapSolidAt(x, y) || isDecorSolidAt(x, y);

/** True when a hero's feet box at (x, y) overlaps a wall, water or a solid prop. */
export function blocked(x: number, y: number): boolean {
  const r = PLAYER_RADIUS;
  // Check feet-box corners
  return (
    isSolidAt(x - r, y - r) || isSolidAt(x + r, y - r) ||
    isSolidAt(x - r, y + r) || isSolidAt(x + r, y + r)
  );
}

/** How far aside (px) a hero looks for a way round an edge it walks into: a stump's core plus the feet box. */
const ASSIST = 13;
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
  return { x, y, moving: dx !== 0 || dy !== 0 };
}
