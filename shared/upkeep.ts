// Gold sinks: paid resets of stat points and the skill tree. (Gear wear and repairs were removed 2026-11-13.)

/** Resetting stat points or the skill tree: free up to `freeUpTo`, then `perLevel` gold per hero level, each. */
export const RESPEC = { freeUpTo: 5, perLevel: 15 } as const;
export const respecCost = (level: number) => (level <= RESPEC.freeUpTo ? 0 : RESPEC.perLevel * level);
