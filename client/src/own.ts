/**
 * Our own hero's owner-only numbers (server/player.ts PlayerPrivate), synced to this client alone in `Player.me`.
 * Other heroes' states never have `me`, and ours has none until the view's first patch lands: then the defaults below
 * stand in (the same as a fresh PlayerPrivate), so the HUD reads one shape either way.
 */
export interface Own {
  kills: number; xp: number; gold: number;
  potions: number; // packPotions (shared/potions.ts)
  mp: number; // packMana (shared/mana.ts)
  energy: number; // Heat (shared/overload.ts)
  stacks: number; spd: number;
  seq: number; // last input the server processed
  timers: string; // HUD buff row (shared/buffTimers.ts)
}

const NONE: Readonly<Own> = Object.freeze({ kills: 0, xp: 0, gold: 0, potions: 0, mp: 0, energy: 0, stacks: 0, spd: 1, seq: 0, timers: "" });

/** `p.me` of a synced Player (our own hero), or the defaults while it hasn't arrived. Read only: the server decides. */
export const own = (p: { me?: unknown } | undefined | null): Readonly<Own> => (p?.me as Own | undefined) ?? NONE;
