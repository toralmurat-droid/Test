import { InputState, PLAYER_RADIUS, PLAYER_SPEED } from "./constants";
import { isSolidAt } from "./map";

function blocked(x: number, y: number): boolean {
  const r = PLAYER_RADIUS;
  // Check feet-box corners
  return (
    isSolidAt(x - r, y - r) || isSolidAt(x + r, y - r) ||
    isSolidAt(x - r, y + r) || isSolidAt(x + r, y + r)
  );
}

/** Shared movement step: identical on server (authoritative) and client (prediction). */
export function moveStep(x: number, y: number, input: InputState, dtSec: number) {
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
  const nx = x + dx * PLAYER_SPEED * dtSec;
  const ny = y + dy * PLAYER_SPEED * dtSec;
  // Resolve axes separately so players slide along walls
  if (!blocked(nx, y)) x = nx;
  if (!blocked(x, ny)) y = ny;
  return { x, y, moving: dx !== 0 || dy !== 0 };
}
