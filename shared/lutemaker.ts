import { gearDef, isBound, isLute, itemLevel, itemRarity, luteTraits } from "./gear";
import { luteTrait, MATERIAL_IDS, MATERIALS, type MaterialId } from "./lute";
import { TILE } from "./constants";

/**
 * Wren the lute-maker (DI-5, NPC `lutemaker` in Oakvale): her rules, shared so the client shows the same yields, costs
 * and refusals the server applies (server/lutemaker.ts). Her shop is SHOPS.lutemaker (shared/shops.ts). Player text:
 * docs/songweaver-di-content.md sections 6 and 7.
 */

export const LUTEMAKER = "lutemaker";
/** How close (px) to Wren breaking and fitting work (the shop's own reach, TownRoom.shopNear). */
export const LUTEMAKER_RANGE = 1.1 * TILE * 1.5;

// ---- Breaking ------------------------------------------------------------------------------------------------------

/** Breaking: a weapon gives Tonewood, a shield or a book Brass; more for a higher tier, item level and rarity. */
export const BREAK = { perTenLevels: 1, tierBase: 0.8, perTier: 0.6, perRarity: 0.5 };
/**
 * What breaking this item gives, or undefined when it can't be broken (not a weapon, shield or book; bound; the lute).
 * n = (1 + floor(level / 10)) x (0.8 + 0.6 x tier) x (1 + 0.5 x rarity), at least 1.
 */
export function breakYield(id: string): { mat: MaterialId; n: number } | undefined {
  const d = gearDef(id);
  if (!d || isBound(id) || isLute(id) || (d.slot !== "weapon" && d.slot !== "shield")) return undefined;
  const B = BREAK, n = (1 + B.perTenLevels * Math.floor(itemLevel(id) / 10)) * (B.tierBase + B.perTier * d.tier) * (1 + B.perRarity * itemRarity(id));
  return { mat: d.slot === "weapon" ? "tonewood" : "brass", n: Math.max(1, Math.round(n)) };
}

// ---- Fitting traits ------------------------------------------------------------------------------------------------

/** The refusals and lines (content doc section 6). */
export const WREN = {
  notSinger: "Only a minstrel's lute can be fitted.",
  noLute: "Bring me your lute first. It has to be in your hands.",
  level: (n: number) => `Wren says you are not ready for that yet. Come back at level ${n}.`,
  mats: (mat: string, n: number) => `You don't have enough ${mat} yet. Wren needs ${n}.`,
  gold: "That costs more than you carry.",
  have: "That one is fitted already.",
  fitted: "There. Listen. Hear it? That is a different lute.",
  bound: "Wren shakes her head. That one is yours to keep.",
  nothing: "There is not much left in that one.",
  broken: "Good wood in there. I'll find a use for it.",
  breakOnly: "Only a minstrel has use for what's left of it.",
};

/** What a fit needs from the hero: class, level, gold, the lute in hand, her material counters. */
export interface FitHero { cls: string; level: number; gold: number; weapon: string; mats: Partial<Record<MaterialId, number>> }
/** Why Wren won't fit this trait yet ("" = she will). Refitting a group (another trait of it) is allowed and costs again. */
export function fitProblem(h: FitHero, trait: unknown): string {
  const t = luteTrait(trait);
  if (!t) return "No such fitting.";
  if (h.cls !== "songweaver") return WREN.notSinger;
  if (!isLute(h.weapon)) return WREN.noLute;
  if (luteTraits(h.weapon).includes(t.id)) return WREN.have;
  if (h.level < t.level) return WREN.level(t.level);
  for (const m of MATERIAL_IDS) { const need = t.mats[m] ?? 0; if ((h.mats[m] ?? 0) < need) return WREN.mats(MATERIALS[m].name, need); }
  if (h.gold < t.gold) return WREN.gold;
  return "";
}

// ---- Monster materials (they drop on the ground: owner, 2026-11-14) -----------------------------------------------

/** One material a monster may drop: the chance per kill and how many. Read by LOOT[kind].mats (shared/items.ts). */
export interface MatDrop { mat: MaterialId; chance: number; n: [number, number] }
/** Ground items carry the id `mat_<id>` in Item.gear, with Item.kind "mat". */
export const matItemId = (m: MaterialId) => `mat_${m}`;
export const matOfItem = (id: unknown): MaterialId | undefined => {
  const m = typeof id === "string" && id.startsWith("mat_") ? id.slice(4) : "";
  return (MATERIAL_IDS as string[]).includes(m) ? (m as MaterialId) : undefined;
};
/** Rolls a monster's material drops: one ground item per material that drops. */
export function rollMats(drops: MatDrop[] | undefined, rnd = Math.random): { mat: MaterialId; n: number }[] {
  const out: { mat: MaterialId; n: number }[] = [];
  for (const d of drops ?? []) if (rnd() < d.chance) out.push({ mat: d.mat, n: d.n[0] + Math.floor(rnd() * (d.n[1] - d.n[0] + 1)) });
  return out;
}
