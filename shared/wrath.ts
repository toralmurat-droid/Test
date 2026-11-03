import { TILE } from "./constants";
import { VILLAGE } from "./map";

/**
 * No magic in Oakvale (Murat 2026-11-03): a hero who casts a skill inside the stockade becomes an outlaw. The whole
 * village turns on that hero (only that hero): the gate watch leaves its posts to spear them and the townsfolk mob
 * them, both hitting very hard, even on the safe market square. It ends the moment the hero is out of the village
 * (or dead). Server: TownRoom.setOutlaw / updateWatchman / the player loop. Client: client/src/wrath.ts + villagers.ts.
 */
export const WRATH = {
  /** A watchman's spear on an outlaw: a quarter of their life plus a flat jab, so four or five thrusts kill. */
  watchDamage: (maxHp: number) => Math.round(maxHp * 0.22 + 15),
  watchSpeed: 1.5,      // watchmen run after an outlaw (x WATCH.speed)
  watchHitEveryMs: 900,
  /** The townsfolk: pitchforks, stones and fists, a heavy blow every mobEveryMs while the outlaw stays inside. */
  mobEveryMs: 1500,
  mobDamage: (maxHp: number) => Math.round(maxHp * 0.09 + 8),
  stunMs: 180,
  shouts: ["No magic in Oakvale!", "Witchcraft! Get out!", "Seize the sorcerer!", "Out of our village!", "Burn the witch!", "Begone, spellcaster!"],
};

/** True inside the Oakvale stockade (tile bounds of VILLAGE, walls included). */
export function inVillage(px: number, py: number): boolean {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  return tx >= VILLAGE.x0 && ty >= VILLAGE.y0 && tx <= VILLAGE.x1 && ty <= VILLAGE.y1;
}
