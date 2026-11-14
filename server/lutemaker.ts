import { BAG_SIZE, isBound, itemRunes, keepsBound, luteTraits, withTraits } from "../shared/gear";
import { luteTrait, type MaterialId } from "../shared/lute";
import { breakYield, fitProblem, LUTEMAKER, LUTEMAKER_RANGE, matOfItem, WREN } from "../shared/lutemaker";
import { npcNear } from "../shared/npcs";
import { runeId } from "../shared/runes";
import { sellPrice } from "../shared/shops";
import type { SongCollector } from "./songs";

/**
 * Wren the lute-maker's room-side rules (DI-5; shared/lutemaker.ts holds the numbers and words): breaking bag items into
 * material, fitting lute traits, picking materials off the ground. The room validates the message, rate-limits it and
 * applies the result (bag, stats, events); nothing here touches the schema directly.
 */

/** The hero parts these rules read and change. */
export interface LmHero { cls: string; level: number; gold: number; weapon: string; x: number; y: number; dead: boolean }

/** Is the hero standing at Wren's stall? */
export const atLutemaker = (p: { x: number; y: number }) => npcNear(p.x, p.y, LUTEMAKER_RANGE)?.id === LUTEMAKER;

export type BreakOut = { text: string } | { mat: MaterialId; n: number; text: string };
/**
 * Breaks the bag item at `i` (the room checked it is a whole number in range): a weapon gives Tonewood, a shield or a
 * book Brass (breakYield). Runes set in it come back to `bag` (what has no room is paid for). Her last lute and
 * Songbook (keepsBound) and anything that isn't a weapon, shield or book are refused; a spare of them breaks. Only a
 * Songweaver keeps materials, so only she can break.
 */
export function breakItem(p: LmHero & { shield?: string }, bag: string[], i: number, col: SongCollector, potSlots: number): BreakOut {
  if (p.cls !== "songweaver") return { text: WREN.breakOnly };
  const id = bag[i];
  if (!id) return { text: WREN.nothing };
  const spare = isBound(id) && !keepsBound(p.cls, id, [p.weapon, p.shield, ...bag]);
  if (isBound(id) && !spare) return { text: WREN.bound };
  const y = breakYield(id, spare);
  if (!y) return { text: WREN.nothing };
  bag.splice(i, 1);
  for (const r of itemRunes(id)) {
    const rid = runeId(r.key, r.rank);
    if (bag.length + potSlots < BAG_SIZE) bag.push(rid); else p.gold += sellPrice(rid);
  }
  col.addMat(p, y.mat, y.n);
  return { mat: y.mat, n: y.n, text: WREN.broken };
}

export type FitOut = { text: string; ok?: false } | { ok: true; trait: string; text: string };
/** Fits `trait` to the lute in her hands: level, gold and materials are checked, then paid (a refit pays again). */
export function fitTrait(p: LmHero, col: SongCollector, trait: unknown): FitOut {
  const why = fitProblem({ ...p, mats: col.mats(p) }, trait);
  if (why) return { text: why };
  const t = luteTrait(trait)!;
  if (!col.spend(p, t.mats)) return { text: WREN.mats("materials", 0) };
  p.gold -= t.gold;
  p.weapon = withTraits(p.weapon, [...luteTraits(p.weapon), t.id]);
  return { ok: true, trait: t.id, text: WREN.fitted };
}

/** A ground material (Item kind "mat", gear `mat_<id>`): a Songweaver picks it up into her counters. Returns what she got. */
export function pickMat(p: { cls: string }, gear: string, amount: number, col: SongCollector): { mat: MaterialId; n: number } | undefined {
  const mat = matOfItem(gear);
  if (!mat || p.cls !== "songweaver") return undefined;
  return { mat, n: col.addMat(p, mat, amount) };
}
