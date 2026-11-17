/**
 * Forged monsters in the room (roadmap M4, server/forge.ts has the registry): which zone spawns come as a clan's forging,
 * their damage factor for the room's inline damage sites, and what they leave. A forged monster keeps its base kind
 * (every Record<MobKind, ...> table applies); Mob.forge names the forging, mobDef applies its variant (applyVariant).
 * Its affixes run through server/champions.ts (makeForged), without the champion's HP, damage, XP or gold multipliers,
 * rune or title.
 */
import { CHAMPION } from "../shared/champions";
import { campOfZone } from "../shared/bandits";
import type { MobKind } from "../shared/constants";
import { FORGE, forgedRewardMult, type ForgedMob } from "../shared/forge";
import { SPAWN_ZONES } from "../shared/spawns";
import type { ClanKey } from "../shared/war/clans";
import { TERRITORIES, type Territory } from "../shared/war/territories";
import { forgedDrop, forgedMobById, liveMobsOf } from "./forge";
import { warState } from "./war";

/**
 * Each spawn zone's war territory, or undefined where forged monsters never walk: villages, dungeons, lairs and the wild
 * zones are no territories (shared/war/territories.ts isSanctuary), and camps keep their posted roles.
 */
export const ZONE_TERRITORY: readonly (Territory | undefined)[] = SPAWN_ZONES.map((z) =>
  campOfZone(z.name) >= 0 ? undefined : TERRITORIES.find((t) => t.name === z.name));

/** A spawn of `kind` in territory `t`, held by `owner`: the owner's forging on that base, FORGE.spawnShare of the time. */
export function variantFor(t: Territory | undefined, kind: MobKind, owner: ClanKey | undefined, rnd: () => number = Math.random): ForgedMob | undefined {
  if (!t || !owner) return undefined;
  const list = liveMobsOf(owner).filter((v) => v.base === kind);
  if (!list.length || rnd() >= FORGE.spawnShare) return undefined; // (no forging: no random number drawn, spawns stay as they were)
  return list[Math.floor(rnd() * list.length)];
}
/** variantFor for spawn zone `zi` (its territory's owner in the running war). */
export function zoneVariant(zi: number, kind: MobKind, rnd: () => number = Math.random): ForgedMob | undefined {
  const t = zi >= 0 ? ZONE_TERRITORY[zi] : undefined;
  return t ? variantFor(t, kind, warState()?.owner[t.id], rnd) : undefined;
}

interface ForgeMob { forge: string; champion: number }
/** The forging a monster is, while it still counts (a revoked one fights as its base). */
export function forgedOf(m: ForgeMob): ForgedMob | undefined {
  if (!m.forge) return undefined;
  const v = forgedMobById(m.forge);
  return v && v.status !== "revoked" ? v : undefined;
}
/**
 * The damage factor of the room's sites that read MOBS[kind].damage directly (not mobDef): a forging's damage
 * multiplier, a champion's CHAMPION.dmgMult (a forged monster with affixes is no champion for this), else 1.
 */
export function mobDmgK(m: ForgeMob): number {
  if (m.forge) return forgedOf(m)?.mult.dmg ?? 1;
  return m.champion ? CHAMPION.dmgMult : 1;
}
/** A real champion (not a forged monster carrying affixes): champion gold, loot and rune. */
export const isChampion = (m: ForgeMob) => !!m.champion && !m.forge;
/** Gold factor of a forged monster (its power, like its XP). */
export const forgedGoldMult = (m: ForgeMob): number => { const v = forgedOf(m); return v ? forgedRewardMult(v) : 1; };
/** What a forged monster leaves on top of its loot: maybe one of its clan's forged weapons. */
export function forgedKillDrop(m: ForgeMob & { level: number }, rnd: () => number = Math.random): string | undefined {
  const v = forgedOf(m);
  return v ? forgedDrop(v.clan, m.level, rnd) : undefined;
}
