// Devour and Bite (Murat 2026-11-07): the vampire eats monsters to take on what they are, and turns them into thralls.
// Both need flesh: skeletons, the other undead and golems have nothing to eat or bite.
import type { MobKind } from "./constants";

/** Monster families that have flesh. A monster kind missing here (undead, golems) can't be eaten or bitten. */
export type Family = "blob" | "gloam" | "outlaw" | "beast";
export const FAMILIES: Family[] = ["blob", "gloam", "outlaw", "beast"];

export const FAMILY: Partial<Record<MobKind, Family>> = {
  slime: "blob", blobling: "blob", motherblob: "blob", shooterblob: "blob", warriorblob: "blob", healerblob: "blob",
  venomblob: "gloam", frostblob: "gloam", fireblob: "gloam", stormblob: "gloam",
  bandit: "outlaw", banditchief: "outlaw",
  gnawkin: "beast", tuskborn: "beast", silkwretch: "beast", duskwing: "beast", crowseer: "beast",
  gnasher: "beast", weaver: "beast", packlord: "beast", hornbrute: "beast", hidemother: "beast",
  nomad: "outlaw", veiled: "outlaw", sunwright: "outlaw", scorpion: "beast", camelfolk: "beast",
};
export const familyOf = (kind: string): Family | undefined => FAMILY[kind as MobKind];

/** What eating a family gives, per monster eaten (a % bonus), up to FEAST_MAX of each family. */
export type FeastEffect = "hp" | "dmg" | "skill" | "speed";
export const FEAST: Record<Family, { name: string; effect: FeastEffect; per: number; what: string }> = {
  blob: { name: "Blob", effect: "hp", per: 0.5, what: "life" }, // thick, tough goo
  gloam: { name: "Elemental blob", effect: "skill", per: 0.5, what: "skill damage" }, // soaked in the wild elements
  outlaw: { name: "Bandit", effect: "dmg", per: 0.5, what: "damage" }, // quick and cruel
  beast: { name: "Beast-folk", effect: "speed", per: 0.4, what: "move speed" }, // the beast sewn into them
};
export const FEAST_MAX = 20;

/** Monsters eaten, per family (saved with the hero). */
export type Feast = Partial<Record<Family, number>>;

/** Total % bonus the hero's meals give to `effect`. */
export function feastBonus(f: Feast | undefined, effect: FeastEffect): number {
  if (!f) return 0;
  let v = 0;
  for (const fam of FAMILIES) if (FEAST[fam].effect === effect) v += FEAST[fam].per * Math.min(FEAST_MAX, f[fam] ?? 0);
  return Math.round(v * 10) / 10;
}
export const feastMult = (f: Feast | undefined, effect: FeastEffect) => 1 + feastBonus(f, effect) / 100;

/** A saved feast, checked (unknown families dropped, counts 0..FEAST_MAX). */
export function cleanFeast(v: unknown): Feast {
  const out: Feast = {};
  if (!v || typeof v !== "object") return out;
  for (const fam of FAMILIES) {
    const n = (v as Record<string, unknown>)[fam];
    if (typeof n === "number" && Number.isFinite(n) && n > 0) out[fam] = Math.min(FEAST_MAX, Math.floor(n));
  }
  return out;
}

/** "Blob 4/20: +2% life" lines, for the character sheet. */
export function feastLines(f: Feast | undefined): string[] {
  return FAMILIES.filter((fam) => (f?.[fam] ?? 0) > 0).map((fam) => {
    const n = Math.min(FEAST_MAX, f![fam]!), d = FEAST[fam];
    return `${d.name} ${n}/${FEAST_MAX}: +${Math.round(d.per * n * 10) / 10}% ${d.what}`;
  });
}

/**
 * Thralls (Bite): a bitten monster that falls rises again and fights for the vampire, like a Summoner's golem
 * (shared/summons.ts: same follow and fight rules), but as the monster it was. The oldest goes when one too many is made.
 */
export const THRALL = {
  /** Most thralls a vampire keeps at once, by Bite rank (1-3). */
  max: [2, 3, 3] as readonly number[],
  /** How long a thrall serves before it collapses (ms). */
  lifeMs: 180_000,
  /** Share of the monster's own damage it hits with (times the skill's power). */
  dmg: 0.8,
} as const;
export const thrallMax = (rank: number) => THRALL.max[Math.max(0, Math.min(THRALL.max.length - 1, rank - 1))];
