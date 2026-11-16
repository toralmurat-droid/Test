// Monsters in a fight keep their bodies apart (CROWD): without it a pack closing on one hero ends up as one pile of
// overlapping sprites, which reads flat and wrong in the isometric view. Each fighting monster looks only at the
// monsters in its own grid squares (MobGrid) and steps half the overlap away from each, capped per tick; its partner
// does the other half on its own turn. The target pulls everyone in, so the pack settles into a ring round the hero.
import { CROWD, type MobKind } from "../shared/constants";
import { blocked } from "../shared/movement";
import { MOB_CELL, type GridUnit, type MobGrid } from "./mobGrid";

/** What the crowd pass reads on a monster. */
export interface CrowdUnit extends GridUnit {
  kind: MobKind;
  dead: boolean;
  hidden: boolean;
  merged: number;
  winding: boolean;
}

/** Body radius of a monster: big kinds wider, merged blobs grow like the client draws them (1 + 0.22 per blob). */
export function bodyRadius(m: CrowdUnit): number {
  const r = CROWD.big[m.kind] ?? CROWD.r;
  return m.merged > 1 ? r * (1 + 0.22 * (Math.min(m.merged, 10) - 1)) : r;
}

/**
 * Nudges monster `m` out of the bodies of the monsters around it. `canStand` says whether it may stand at a spot
 * (the room's canStep). Returns true when it moved. Cheap: at most the 1-4 grid squares its body touches, and only the
 * `maxNear` first overlaps count.
 */
export function spreadCrowd<T extends CrowdUnit>(grid: MobGrid<T>, m: T, canStand: (m: T, x: number, y: number) => boolean): boolean {
  const r = bodyRadius(m), reach = r + 24; // 24: the widest partner's radius (a big merged blob)
  const x = m.x, y = m.y;
  const cx0 = Math.floor((x - reach) / MOB_CELL), cx1 = Math.floor((x + reach) / MOB_CELL);
  const cy0 = Math.floor((y - reach) / MOB_CELL), cy1 = Math.floor((y + reach) / MOB_CELL);
  let px = 0, py = 0, n = 0;
  for (let cx = cx0; cx <= cx1 && n < CROWD.maxNear; cx++) for (let cy = cy0; cy <= cy1 && n < CROWD.maxNear; cy++) {
    const cell = grid.cell(cx, cy);
    if (!cell) continue;
    for (const o of cell.values()) {
      if (o === m || o.dead || o.hidden) continue;
      const dx = x - o.x, dy = y - o.y;
      const min = r + bodyRadius(o);
      if (dx > min || dx < -min || dy > min || dy < -min) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d < 0.01) {
        // exactly on top of each other: split along a fixed direction picked from the pair's order in the map
        const a = (m._gs > o._gs ? 1 : -1) * (0.7 + (m._gs % 7) * 0.8);
        px += Math.cos(a) * min * 0.5; py += Math.sin(a) * min * 0.5;
      } else {
        const k = (min - d) * 0.5 / d;
        px += dx * k; py += dy * k;
      }
      if (++n >= CROWD.maxNear) break;
    }
  }
  if (!n) return false;
  const lim = CROWD.maxPush * (m.winding ? CROWD.planted : 1);
  const len = Math.hypot(px, py);
  if (len > lim) { px *= lim / len; py *= lim / len; }
  // walls: try the full nudge, then each axis alone (slides along a wall instead of sticking)
  return tryAt(m, x + px, y + py, canStand) || tryAt(m, x + px, y, canStand) || tryAt(m, x, y + py, canStand);
}

function tryAt<T extends CrowdUnit>(m: T, nx: number, ny: number, canStand: (m: T, x: number, y: number) => boolean): boolean {
  if ((nx === m.x && ny === m.y) || blocked(nx, ny) || !canStand(m, nx, ny)) return false;
  m.x = nx; m.y = ny;
  return true;
}
