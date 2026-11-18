/**
 * The Hold walls on the server (shared/war/holdWalls.ts): the walls follow the war's holders and their Holds' tiers
 * (shared/war/holdTiers.ts), and nobody stays inside one. Once a second (and right after a war tick or a sack) the room
 * passes the holders and tiers in; a land that changed hands raises its new holder's fort, a Hold that grew or shrank its
 * new tier's, and any hero or monster (troopers included) whose feet now overlap a wall is moved to the nearest free spot. The same sweep frees anyone a spawn, a blink or a knockback left in a wall. The movement check itself is
 * shared/movement.ts (server and client prediction alike). The same sweep gives a wild monster whose home lies on fort ground
 * (shared/war/fortGround.ts) a home outside, so its leash walks it out of the fort.
 */
import { PLAYER_RADIUS } from "../shared/constants";
import { nearestFree } from "../shared/movement";
import type { ClanKey } from "../shared/war/clans";
import { fortGroundAt, nearestOffFort } from "../shared/war/fortGround";
import { setHoldOwners, touchesHoldWall } from "../shared/war/holdWalls";
import { holdTiers } from "../shared/war/holdTiers";
import type { WarState } from "../shared/war/rules";

/** What the sweep moves: heroes and monsters (only their position, and a monster's home when it lies in a wall too). */
export interface WallBody { x: number; y: number; dead?: boolean; homeX?: number; homeY?: number }
export interface HoldWallHost {
  heroes(): Iterable<[string, WallBody]>;
  mobs(): Iterable<[string, WallBody]>;
  /** Is this monster wild (shared/war/fortGround.ts isWildMob)? A wild one whose home lies on fort ground gets a home outside. */
  wild?(m: WallBody): boolean;
}

export class HoldWalls {
  constructor(private h: HoldWallHost) {}

  /** Walls as `owner` holds the lands at `tier` (holdTiers; undefined owner: no war, no walls), then everyone out of them. Returns how many were moved. */
  sync(owner: readonly ClanKey[] | undefined, tier?: readonly number[]): number {
    setHoldOwners(owner ?? [], tier);
    let moved = 0;
    for (const [, b] of this.h.heroes()) if (this.free(b)) moved++;
    for (const [, m] of this.h.mobs()) {
      if (m.dead) continue;
      if (this.free(m)) moved++;
      if (m.homeX !== undefined && m.homeY !== undefined && fortGroundAt(m.homeX, m.homeY) && this.h.wild?.(m)) {
        const to = nearestOffFort(m.homeX, m.homeY);
        if (to) { m.homeX = to.x; m.homeY = to.y; } // its leash walks it out of the fort
      }
    }
    return moved;
  }

  /** sync for the live war state (undefined: no war): its holders and the tiers their Holds stand at. */
  syncWar(s: Pick<WarState, "owner" | "fort" | "control"> | undefined): number { return this.sync(s?.owner, s && holdTiers(s)); }
  /** admit for the live war state. */
  admitWar(b: WallBody, s: Pick<WarState, "owner" | "fort" | "control"> | undefined): boolean { return this.admit(b, s?.owner, s && holdTiers(s)); }

  /** A hero coming in (a login, a resume after an update) at a spot a fort has walled since: out at once, not at the next sweep. */
  admit(b: WallBody, owner: readonly ClanKey[] | undefined, tier?: readonly number[]): boolean {
    setHoldOwners(owner ?? [], tier);
    return this.free(b);
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
