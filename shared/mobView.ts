/**
 * Area of interest for monsters: each hero is only sent the monsters near them, not the whole world's
 * (server/mobView.ts sends, client/src/mobFeed.ts receives). Monsters are no longer part of the synced room state.
 *
 * One "mv" message per server update, only when something near the hero changed:
 *   a: added   [id, ...values in MOB_FIELDS order]
 *   c: changed [id, fieldIndex, value, fieldIndex, value, ...]
 *   r: removed [id, ...]
 * x and y travel as whole numbers of 1/POS_SCALE px (smaller messages than floats).
 */
// Same order as the synced fields of Mob (server/TownRoom.ts); tests/mobview.test.ts checks it.
export const MOB_FIELDS = [
  "kind", "level", "weapon", "hidden", "bones", "merged", "guard", "work", "job", "parts", "title",
  "x", "y", "dir", "moving", "hp", "maxHp", "dead", "stunned", "slowed", "broken", "winding", "fx", "owner",
] as const;
export type MobField = (typeof MOB_FIELDS)[number];
export const POS_SCALE = 4;
export const X_FIELD = MOB_FIELDS.indexOf("x"), Y_FIELD = MOB_FIELDS.indexOf("y");
/** A monster comes into a hero's view within this many tiles (in x and in y)... */
export const VIEW_ADD = 30;
/** ...and leaves it beyond this many (the gap stops monsters on the edge popping in and out). */
export const VIEW_DROP = 36;
export interface MobViewMsg { a?: unknown[][]; c?: unknown[][]; r?: string[] }
