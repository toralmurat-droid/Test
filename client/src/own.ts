import { SLOT_COUNT } from "../../shared/slots";

/**
 * Our own hero's owner-only data (server/player.ts PlayerPrivate), synced to this client alone in `Player.me`.
 * Other heroes' states never have `me`, and ours has none until the view's first patch lands: then the defaults below
 * stand in (the same as a fresh PlayerPrivate), so the HUD reads one shape either way.
 */
export interface Own {
  kills: number; xp: number; gold: number;
  potions: number; // packPotions (shared/potions.ts)
  mp: number; // packMana (shared/mana.ts)
  energy: number; // Heat (shared/overload.ts)
  shield?: number; // remaining absorb shields in HP points, 0 when none (absent on an older server)
  stacks: number; spd: number;
  seq: number; // last input the server processed
  timers: string; // HUD buff row (shared/buffTimers.ts)
  ptSta: number; ptStr: number; ptMag: number; ptDex: number; // stat points assigned (shared/powers.ts)
  // Collections (ArraySchema / MapSchema on the real `me`): read only, the server rewrites them in place
  bag: readonly string[]; // unequipped items
  talents: ReadonlyMap<string, number>; // skill tree ranks (shared/talents.ts)
  slots: readonly string[]; // skill hotkeys 1..0 (shared/slots.ts), "" = empty
}

const NONE: Readonly<Own> = Object.freeze({
  kills: 0, xp: 0, gold: 0, potions: 0, mp: 0, energy: 0, stacks: 0, spd: 1, seq: 0, timers: "",
  ptSta: 0, ptStr: 0, ptMag: 0, ptDex: 0,
  bag: Object.freeze([] as string[]), talents: new Map<string, number>() as ReadonlyMap<string, number>,
  slots: Object.freeze(Array<string>(SLOT_COUNT).fill("")),
});

/** `p.me` of a synced Player (our own hero), or the defaults while it hasn't arrived. Read only: the server decides. */
export const own = (p: { me?: unknown } | undefined | null): Readonly<Own> => (p?.me as Own | undefined) ?? NONE;
