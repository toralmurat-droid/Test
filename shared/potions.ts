/**
 * Healing and mana potions in 3 sizes (Murat 2026-11-04). Each size restores a fixed amount. Bigger flasks drop from
 * higher-level monsters and chests. Potions are carried in the bag: up to POTION_STACK of one size and kind share a
 * bag slot. Q drinks a healing potion and V a mana potion, always the smallest size you carry, so the big ones are
 * kept for later. Healing potions can be drunk back to back with no cooldown; the heal lands instantly.
 *
 * Synced to the owner only: Player.me.potions (server/player.ts) packs the six counts in one number (packPotions).
 * Ground items: kind "potion" / "mpotion", the size index in Item.gear ("0".."2").
 */
export type PotionKind = "potion" | "mpotion";
export const POTION_KINDS: PotionKind[] = ["potion", "mpotion"];
export const POTION_STACK = 10;
/** Mana potions only: healing potions have no cooldown and no limit, each heals its full amount at once (Murat 2026-11-07). */
export const POTION_COOLDOWN_MS = 1000;

export interface PotionSize { name: string; heal: number; mana: number; price: number }
export const POTION_SIZES: PotionSize[] = [
  { name: "Minor", heal: 40, mana: 30, price: 15 },
  { name: "Medium", heal: 90, mana: 60, price: 35 },
  { name: "Greater", heal: 180, mana: 120, price: 80 },
];
export const SIZES = POTION_SIZES.length;

/** Counts per size, smallest first. */
export type Counts = [number, number, number];
export interface Potions { potion: Counts; mpotion: Counts }
export const noPotions = (): Potions => ({ potion: [0, 0, 0], mpotion: [0, 0, 0] });

export const potionName = (kind: PotionKind, size: number) =>
  `${POTION_SIZES[size]?.name ?? ""} ${kind === "mpotion" ? "Mana" : "Healing"} Potion`;
export const potionAmount = (kind: PotionKind, size: number) =>
  kind === "mpotion" ? POTION_SIZES[size].mana : POTION_SIZES[size].heal;

/** Bag slots the potions take (each size of each kind stacks by POTION_STACK). */
export function potionSlots(p: Potions): number {
  let n = 0;
  for (const k of POTION_KINDS) for (const c of p[k]) n += Math.ceil(c / POTION_STACK);
  return n;
}
/** Bag slots needed after adding `n` potions of one size. */
export function slotsAfter(p: Potions, kind: PotionKind, size: number, n: number): number {
  const c = p[kind][size];
  return potionSlots(p) - Math.ceil(c / POTION_STACK) + Math.ceil((c + n) / POTION_STACK);
}
export const total = (c: Counts) => c[0] + c[1] + c[2];
/** Size Q/V drinks next: the smallest one carried (-1 = none). */
export const nextSize = (c: Counts) => c.findIndex((n) => n > 0);

/** Stacks for the bag screen, healing first, small to big: [kind, size, count in this stack]. */
export function potionStacks(p: Potions): [PotionKind, number, number][] {
  const out: [PotionKind, number, number][] = [];
  for (const k of POTION_KINDS) for (let s = 0; s < SIZES; s++) {
    for (let left = p[k][s]; left > 0; left -= POTION_STACK) out.push([k, s, Math.min(POTION_STACK, left)]);
  }
  return out;
}

/** Size of a potion dropped by a monster or chest of this level: mostly by level, sometimes one size up or down. */
export function dropSize(level: number, rnd = Math.random): number {
  const base = level >= 20 ? 2 : level >= 10 ? 1 : 0;
  const r = rnd();
  return Math.max(0, Math.min(SIZES - 1, base + (r < 0.15 ? -1 : r > 0.9 ? 1 : 0)));
}

// ---- Player.potions packing: 6 counts, base 128 (each 0..127) ------------------------------------
const BASE = 128;
export function packPotions(p: Potions): number {
  let v = 0, m = 1;
  for (const k of POTION_KINDS) for (let s = 0; s < SIZES; s++) { v += Math.min(BASE - 1, Math.max(0, p[k][s])) * m; m *= BASE; }
  return v;
}
export function unpackPotions(v: number | undefined): Potions {
  const out = noPotions();
  let x = Math.max(0, Math.floor(v ?? 0));
  for (const k of POTION_KINDS) for (let s = 0; s < SIZES; s++) { out[k][s] = x % BASE; x = Math.floor(x / BASE); }
  return out;
}
