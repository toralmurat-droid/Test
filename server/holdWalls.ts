/**
 * The Hold walls on the server (shared/war/holdWalls.ts): the walls follow the war's holders, and nobody stays inside
 * one. Once a second (and right after a war tick) the room passes the holders in; a land that changed hands raises its
 * new holder's fort, and any hero or monster (troopers included) whose feet now overlap a wall is moved to the nearest
 * free spot. The same sweep frees anyone a spawn, a blink or a knockback left in a wall. The movement check itself is
 * shared/movement.ts (server and client prediction alike).
 */
import { PLAYER_RADIUS } from "../shared/constants";
import { nearestFree } from "../shared/movement";
import type { ClanKey } from "../shared/war/clans";
import { setHoldOwners, touchesHoldWall } from "../shared/war/holdWalls";

/** What the sweep moves: heroes and monsters (only their position, and a monster's home when it lies in a wall too). */
export interface WallBody { x: number; y: number; dead?: boolean; homeX?: number; homeY?: number }
export interface HoldWallHost {
  heroes(): Iterable<[string, WallBody]>;
  mobs(): Iterable<[string, WallBody]>;
}

export class HoldWalls {
  constructor(private h: HoldWallHost) {}

  /** Walls as `owner` holds the lands (undefined: no war, no walls), then everyone out of them. Returns how many were moved. */
  sync(owner: readonly ClanKey[] | undefined): number {
    setHoldOwners(owner ?? []);
    let moved = 0;
    for (const [, b] of this.h.heroes()) if (this.free(b)) moved++;
    for (const [, m] of this.h.mobs()) if (!m.dead && this.free(m)) moved++;
    return moved;
  }

  /** Moves a body out of a wall (true if it was in one and moved). */
  private free(b: WallBody): boolean {
    if (!touchesHoldWall(b.x, b.y, PLAYER_RADIUS)) return false;
    const to = nearestFree(b.x, b.y);
    if (!to) return false;
    if (b.homeX !== undefined && b.homeY !== undefined && touchesHoldWall(b.homeX, b.homeY, PLAYER_RADIUS)) { b.homeX = to.x; b.homeY = to.y; }
    b.x = to.x; b.y = to.y;
    return true;
  }
}
