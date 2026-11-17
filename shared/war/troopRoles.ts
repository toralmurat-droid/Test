/**
 * The troop roles' small AI rules (shared/war/troops.ts TroopRole, TROOP_ROLE), pure, so the server's soldiers
 * (server/troopRoles.ts) and the PvE sim (tools/balance/pve.ts --roles, --garrison) move and shoot the same way.
 */
import type { ClanKey } from "./clans";
import { CLAN_ROLES, TROOP_ROLE, type TroopRole } from "./troops";

type Ranged = typeof TROOP_ROLE.ranged;

/** An archer's move against a foe `dist` px away: -1 step back (inside keepAway), 1 close in (out of range), 0 stand and shoot. */
export function kiteStep(dist: number, R: Ranged = TROOP_ROLE.ranged): -1 | 0 | 1 {
  return dist < R.keepAway ? -1 : dist > R.range ? 1 : 0;
}

/** An archer's bow state (part of the server's Fighter and of the sim's archer). */
export interface Bow { nextShot: number; aimUntil: number }

/**
 * The archer's bow at `now` with its foe `dist` px away (mutates `b`): ready and in range, it starts its wind-up
 * (aimUntil); true at the moment the shot leaves, which puts the next one everyMs away. A wind-up is not cut short by range.
 */
export function shotReady(b: Bow, now: number, dist: number, R: Ranged = TROOP_ROLE.ranged): boolean {
  if (b.aimUntil) {
    if (now < b.aimUntil) return false;
    b.aimUntil = 0; b.nextShot = now + R.everyMs;
    return true;
  }
  if (now >= b.nextShot && dist <= R.range) b.aimUntil = now + R.windupMs;
  return false;
}

/** The counter multiplier on a blow (or shot) of a `att` soldier on a `def` soldier: troop against troop only (TROOP_ROLE.vs). */
export const roleVs = (att: TroopRole, def: TroopRole): number => TROOP_ROLE.vs[att]?.[def] ?? 1;

/** What clan `k`'s archers shoot: the client's projectile kind and its speed (px/s); a plain arrow for a clan without archers. */
export function bowOf(k: ClanKey): { shot: string; speed: number } {
  const a = CLAN_ROLES[k]?.archer;
  return { shot: a?.shot ?? "arrow", speed: a?.shotSpeed ?? 200 };
}

/** Flight time (ms) of a shot over `dist` px at `speed` px/s: an archer's hit on a monster or a trooper lands after it. */
export const flightMs = (dist: number, speed: number): number => Math.round((Math.max(0, dist) / Math.max(1, speed)) * 1000);
