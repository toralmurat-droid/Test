/** Small pure helpers behind HUD bits (orbs, lvl note, group panel), kept apart from the DOM so tests can reach them. */

export interface OrbShown { hp: number; mp: number; at: number; hpTxt: string; mpTxt: string }

/** The "hp / max" and "mp / max" strings written inside the orbs. */
export function orbTexts(hp: number, maxHp: number, mp: number, maxMp: number) {
  return { hpTxt: `${Math.ceil(hp)} / ${Math.round(maxHp)}`, mpTxt: `${Math.floor(mp)} / ${Math.round(maxMp)}` };
}

/**
 * Does an orb need redrawing? A changed fill or a changed number does; while a fill is partial the slosh
 * animation redraws at most every 120 ms. A max that grows at full HP/mana changes only the number, not the fill.
 */
export function orbNeedsRedraw(prev: OrbShown, fh: number, fm: number, hpTxt: string, mpTxt: string, now: number): boolean {
  const moving = (fh > 0 && fh < 1) || (fm > 0 && fm < 1);
  const throttled = moving && now - prev.at < 120;
  const textChanged = hpTxt !== prev.hpTxt || mpTxt !== prev.mpTxt;
  const fillSame = Math.abs(fh - prev.hp) < 0.004 && Math.abs(fm - prev.mp) < 0.004;
  if (textChanged && fillSame) return !throttled;
  return !(fillSame && (!moving || throttled));
}

/** Unspent stat points hide the level-up note when none are left (the note says "assign your stat points"). */
export function showLevelNote(freeStatPoints: number): boolean { return freeStatPoints > 0; }

/** Line shown in the Group panel when the nearby-heroes list has no one to invite or trade with. */
export function nearbyEmptyMessage(groupmatesNearby: number): string {
  return groupmatesNearby > 0
    ? "Everyone nearby is in your group. You can also type /invite name or /trade name in chat."
    : "Nobody close by. You can also type /invite name or /trade name in chat.";
}
