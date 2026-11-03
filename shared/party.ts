import { TILE } from "./constants";
import { zoneAt } from "./spawns";

/**
 * Player groups (parties): invite / accept / leave, no friendly fire between members,
 * kill XP shared with members in the same zone, and monsters fight harder against a group.
 */
export const PARTY = {
  maxSize: 4,
  inviteMs: 30_000, // an invite expires after this
  /** Members this close always count as "together" (also outside monster zones). */
  shareRange: 560,
  /** Per extra member fighting together: monsters take this much less damage (like +50% HP each)... */
  mobHpPer: 0.5,
  /** ...and hit this much harder. */
  mobDmgPer: 0.15,
};

/** True when two spots count as the same place for a group: same monster zone, or close by. */
export function together(ax: number, ay: number, bx: number, by: number): boolean {
  if (Math.hypot(ax - bx, ay - by) <= PARTY.shareRange) return true;
  const za = zoneAt(Math.floor(ax / TILE), Math.floor(ay / TILE));
  return !!za && za === zoneAt(Math.floor(bx / TILE), Math.floor(by / TILE));
}

/** How much tougher a monster is against `n` group members fighting together. */
export const groupHpMult = (n: number) => 1 + PARTY.mobHpPer * Math.max(0, n - 1);
export const groupDmgMult = (n: number) => 1 + PARTY.mobDmgPer * Math.max(0, n - 1);
