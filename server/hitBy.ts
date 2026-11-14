/**
 * The `by` of a "hit" broadcast: the player behind the blow, so the client can show a monster's HP bar to whoever
 * (or whose group) hurt it. A hero counts as themselves, a hero's creature (golem, thrall, wisp, charmed monster:
 * Mob.owner) as its owner; monsters, the watch and the world count as nobody. Two map lookups at most (hot path).
 */
export function hitBy(
  players: { has(id: string): boolean },
  mobs: { get(id: string): { owner: string } | undefined },
  from: string | undefined,
): string | undefined {
  if (!from) return undefined;
  if (players.has(from)) return from;
  const owner = mobs.get(from)?.owner;
  return owner && players.has(owner) ? owner : undefined;
}

/** `{ by }` to spread into a "hit" payload, or nothing when no player is behind it (the field is then left out). */
export const byPart = (by: string | undefined): { by?: string } => (by ? { by } : NONE);
const NONE: { by?: string } = Object.freeze({});
