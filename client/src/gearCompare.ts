import { activeGear, canWear, Equipped, gearDef, GearSlot, reqProblem } from "../../shared/gear";
import { ELEMENTS, ELEMENT_NAMES } from "../../shared/elements";
import { heroSheet, SheetHero, Sheet, wearing } from "../../shared/heroSheet";
import { usesGauge } from "../../shared/mana";
import { attackProfile } from "../../shared/weapons";

/**
 * Item compare card, the pure part (display only, the server decides). The deltas come from the hero's sheet
 * (shared/heroSheet.ts, the numbers the Character tab shows) evaluated with the current gear and again with the
 * hovered item swapped into its slot. When the hero meets the item's needs, the new set goes through activeGear like
 * on the server (a piece that loses its enabling stat goes inactive and the deltas show it). When they don't, the item
 * is judged as if met and the card's own requirement line says so.
 */
export interface CompareLine { label: string; text: string; good: boolean }
export interface Compare {
  /** The worn item in the hovered item's slot ("" when the slot is empty). */
  current: string;
  slot: GearSlot;
  lines: CompareLine[];
}

/** Signed number: "+6", "-0.2"; zero has no sign. */
export const signed = (n: number, digits = 0): string => {
  const v = Number(n.toFixed(digits));
  return (v > 0 ? "+" : v < 0 ? "-" : "") + Math.abs(v).toFixed(digits);
};

const SHEET_LINES: { key: keyof Omit<Sheet, "res" | "stats">; label: string; unit?: string; rel?: boolean }[] = [
  { key: "spell", label: "Spell damage", unit: "%" },
  { key: "atk", label: "Attack" },
  { key: "crit", label: "Crit chance", unit: "%" },
  { key: "hp", label: "Health" },
  { key: "dps", label: "Damage per second" },
  { key: "def", label: "Damage blocked", unit: "%" },
  { key: "mana", label: "Mana" },
  { key: "magic", label: "Magic" },
  { key: "speed", label: "Move speed", unit: "%", rel: true },
];
const STAT_LINES = [["sta", "Stamina"], ["str", "Strength"], ["dex", "Dexterity"]] as const;

const hitsPerSec = (cls: string, eq: Equipped) => 1000 / attackProfile(cls, eq).attackCooldownMs;

/** Lines for the change from `now` (current worn set) to `nextEq`; `ignoreReq` judges `nextEq` as if its needs were met. */
function diffLines(h: SheetHero, worn: Equipped, nextEq: Equipped, ignoreReq: boolean): CompareLine[] {
  const now = heroSheet(h, worn), next = heroSheet(h, nextEq, h.talents, ignoreReq);
  const req = { cls: h.cls, level: h.level, pts: h.pts };
  const lines: CompareLine[] = [];
  const add = (label: string, diff: number, text: string) => { if (Number(diff.toFixed(2)) !== 0) lines.push({ label, text, good: diff > 0 }); };
  for (const s of SHEET_LINES) {
    if (s.key === "mana" && usesGauge(h.cls)) continue; // the song gauge has a fixed size
    const a = now[s.key] as number, b = next[s.key] as number;
    if (s.rel) { if (a) { const p = Math.round((b / a - 1) * 100); add(s.label, p, `${signed(p)}%`); } continue; }
    add(s.label, b - a, signed(b - a) + (s.unit ?? ""));
  }
  const effNext = ignoreReq ? nextEq : activeGear(nextEq, req);
  const hs = hitsPerSec(h.cls, effNext) - hitsPerSec(h.cls, activeGear(worn, req));
  if (Math.abs(hs) >= 0.05) add("Attack speed", hs, `${signed(hs, 1)} hits/s`);
  for (const [k, label] of STAT_LINES) add(label, next.stats[k] - now.stats[k], signed(next.stats[k] - now.stats[k]));
  for (const e of ELEMENTS) add(`${ELEMENT_NAMES[e]} resistance`, next.res[e] - now.res[e], signed(next.res[e] - now.res[e]) + "%");
  return lines;
}

/** What wearing `id` would change on the hero. Null when the item isn't gear or the class can't wear it. */
export function compareItem(h: SheetHero, worn: Equipped, id: string): Compare | null {
  const d = gearDef(id);
  if (!d || !canWear(h.cls, id)) return null;
  const slot = d.slot, current = worn[slot] ?? "";
  const req = { cls: h.cls, level: h.level, pts: h.pts };
  const meets = !reqProblem(id, { ...req, worn });
  const lines = meets ? diffLines(h, worn, wearing(worn, id), false) : diffLines(h, worn, wearing(activeGear(worn, req), id), true);
  return { current, slot, lines };
}

/** What taking the worn piece in `slot` off would change (the same lines, for the worn-slot hover). */
export function compareTakeOff(h: SheetHero, worn: Equipped, slot: GearSlot): CompareLine[] {
  const eq = { ...worn };
  delete eq[slot];
  return diffLines(h, worn, eq, false);
}

/** Card width that fits left of the panel (at most `max`, at least `min`); the card never covers the panel while there is room. */
export const cardWidth = (panelLeft: number, max = 320, min = 240, gap = 8): number => Math.max(min, Math.min(max, panelLeft - gap - 4));

/** Where the card goes: left of the panel, top aligned with the hovered item, clamped to the screen. */
export function cardPlace(item: { top: number }, panelLeft: number, cardW: number, cardH: number, vw: number, vh: number, gap = 8): { left: number; top: number } {
  const left = Math.max(4, Math.min(panelLeft - gap - cardW, vw - cardW - 4));
  const top = Math.max(4, Math.min(item.top, vh - cardH - 4));
  return { left, top };
}
