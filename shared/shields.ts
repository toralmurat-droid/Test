// What is left of a unit's absorb shields, for the owner's HUD (server/player.ts PlayerPrivate.shield). Kept out of
// shared/skillEngine.ts: it only reads the buff pools that partyBuff / overShield fill and absorbDamage drains.
import type { ActiveBuff } from "./skillEngine";

/** Sum of the live (`until > now`) shield pools, in whole points: the client draws it and never sees the pools. */
export function shieldLeft(u: { sk: { buffs: ActiveBuff[] } }, now: number): number {
  let n = 0;
  for (const b of u.sk.buffs) if (b.shield && b.shield > 0 && b.until > now) n += b.shield;
  return Math.round(n);
}
