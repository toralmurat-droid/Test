// Summons: monsters a hero calls up to fight for them (the Summoner's golems first, other kinds later).
// A summon is a Mob with an owner (server/TownRoom.ts): it follows its owner, fights the owner's enemies (monsters,
// and heroes when PvP allows it), and the owner gets the XP and loot of what it kills. It never drops loot itself.
import type { Element } from "./elements";
import type { MobKind } from "./constants";
import type { AreaDef, BuffDef, FieldDef } from "./skills";

export type SummonKind = "golem_fire" | "golem_cold" | "golem_poison" | "golem_shock" | "golem_colossus";
export const SUMMON_KINDS: SummonKind[] = ["golem_fire", "golem_cold", "golem_poison", "golem_shock", "golem_colossus"];
/** The four golem elements (the grimoire picks one per golem; Player.attune is the first golem's, as an index here). */
export const ATTUNE_ORDER = ["fire", "cold", "poison", "shock"] as const;
export type AttuneElement = (typeof ATTUNE_ORDER)[number];
export const GOLEM_OF: Record<AttuneElement, SummonKind> = { fire: "golem_fire", cold: "golem_cold", poison: "golem_poison", shock: "golem_shock" };
export const attuneOf = (i: number): AttuneElement => ATTUNE_ORDER[((i | 0) % ATTUNE_ORDER.length + ATTUNE_ORDER.length) % ATTUNE_ORDER.length];
export const isSummonKind = (k: unknown): k is SummonKind => typeof k === "string" && (SUMMON_KINDS as string[]).includes(k);

/** The element each golem hits with (and its look). */
export const SUMMON_ELEMENT: Record<Exclude<SummonKind, "golem_colossus">, Exclude<Element, "faith">> = {
  golem_fire: "fire", golem_cold: "cold", golem_poison: "poison", golem_shock: "shock",
};
/** A summon's element: the golem's own, or the Colossus's (kept in Mob.weapon). */
export const summonElement = (kind: string, weapon: string): AttuneElement =>
  kind === "golem_colossus" ? attuneOf(ATTUNE_ORDER.indexOf(weapon as AttuneElement)) : SUMMON_ELEMENT[kind as Exclude<SummonKind, "golem_colossus">] ?? "fire";

export const SUMMON = {
  /** Most summons one hero can have out at once: calling one more sends the oldest back (golems have their own slots). */
  max: 2,
  /** How long a summon stays before it crumbles (ms). */
  lifeMs: 90_000,
  /** It walks back to its owner when farther than this (px), and picks fights only this close to the owner. */
  followRange: 3 * 32, leash: 8 * 32,
  /** It looks for enemies this far around itself (px). */
  aggroRange: 5 * 32,
  /** Share of its damage that becomes elemental (fire burns, cold slows, poison, shock), the rest is physical. */
  elementShare: 0.4,
  /** Vital Link (su_link): a golem close to its owner mends this share of its life per second per rank. */
  linkRegen: 0.01,
  /** Colossus: each golem fused into it adds this much life and damage; its slam hits everyone this close to the target. */
  colossusPerGolem: 0.25, colossusSlam: 34,
  /**
   * Bound golem (Murat 2026-11-07): a Summoner with no summon out gets one by itself after `autoMs`, anywhere but the
   * safe zone, in the attuned element and as strong as their Elemental Golem skill (rank 1 if not learned yet).
   */
  autoMs: 5000,
  /**
   * Guardian: a monster the owner hits hates the owner's golem instead, when one is fighting next to it (within
   * `guardRange` px of the monster). Monsters away from the golems still go for the Summoner.
   */
  guardRange: 3 * 32,
  /** Monsters pick a summon over a hero by this much more (it stands in front of its owner). */
  taunt: 0.3,
  /** Stone Bond reaches golems this close to their owner (px). */
  bondRange: 6 * 32,
  /**
   * Stone Bond (balance pass 2026-11-07, tools/balance/duel.ts): the owner's nearest golem within guardRange takes this
   * share of every blow the owner takes. The Summoner was dying in ~5 s to any melee hero before the golems mattered.
   */
  guardShare: 0.3,
  /**
   * PvP settings in one place (Void Lord rework 2026-11-08): what the Summoner's creatures do to heroes. `dmg`: their
   * blows and abilities on a hero; `hp`: their life against a hero's hits (2 = heroes need twice the damage); `cc`:
   * how long the Summoner's crowd control (Black Hole pull, golem freeze) holds a hero.
   */
  pvp: { dmg: 0.85, hp: 1, cc: 0.6 },
} as const;

// ---- Void Lord rework (Murat 2026-11-08) ------------------------------------------------------------------------
/**
 * Permanent golems: one from Lv 1, two once Twin Bond is learned (Lv 18). Each golem has a slot whose element the
 * grimoire sets. Out of the safe zone they rise by themselves (`enterMs` after leaving it), and `respawnMs` after one
 * dies it climbs back out of the Void. In the safe zone they go back (no golem in town).
 */
export const GOLEM = { respawnMs: 12_000, enterMs: 1500, twinLevel: 18, grimoireMs: 800 } as const;
export const DEFAULT_GRIMOIRE = "fire,fire";
/**
 * Version of the Summoner's skill tree. A save from an older tree (Attune, Conjured Blade, Aegis...) gets all its
 * skill points back for free on load, and the default grimoire.
 */
export const SUMMONER_TREE = 2;
/** The grimoire saved as "el,el" (Player.grimoire): unknown elements fall back to fire. */
export function parseGrimoire(s: unknown): [AttuneElement, AttuneElement] {
  const parts = typeof s === "string" ? s.split(",") : [];
  const el = (v: string | undefined): AttuneElement => (ATTUNE_ORDER as readonly string[]).includes(v ?? "") ? (v as AttuneElement) : "fire";
  return [el(parts[0]), el(parts[1] ?? parts[0])];
}
export const isElement = (v: unknown): v is AttuneElement => typeof v === "string" && (ATTUNE_ORDER as readonly string[]).includes(v);

/**
 * Element auras: each living golem gives its owner a lasting buff of its element. Two golems of the same element
 * (or a Colossus fused from them) give one aura, `RESONANCE` times stronger; two different ones give both. The
 * Resonance passive makes every aura stronger. The buff ids are `aura_<element>` (the HUD buff row shows them).
 */
export const RESONANCE = 1.5;
export const AURA: Record<AttuneElement, BuffDef> = {
  fire: { ms: 2000, dmg: 8, onHit: { burn: [5, 2000] } }, // harder blows that set foes alight
  cold: { ms: 2000, armor: 8, thorns: { dmg: 4, slowMs: 900 } }, // less damage taken, attackers up close are chilled
  poison: { ms: 2000, lifesteal: 5, onHit: { burn: [4, 3000] } }, // drink part of the damage, blows poison
  shock: { ms: 2000, speed: 10, atkspd: 12 }, // faster steps and blows
};
export const auraId = (el: AttuneElement) => `aura_${el}`;
export const isAuraId = (id: string) => id.startsWith("aura_");
/** The aura buffs a hero gets from their golems' elements (`mult`: the Resonance passive, 1 = none). */
export function auraBuffs(els: readonly AttuneElement[], mult = 1): { id: string; b: BuffDef }[] {
  const out: { id: string; b: BuffDef }[] = [];
  for (const el of ATTUNE_ORDER) {
    const n = els.filter((e) => e === el).length;
    if (!n) continue;
    out.push({ id: auraId(el), b: scaleBuff(AURA[el], (n > 1 ? RESONANCE : 1) * mult) });
  }
  return out;
}
const sc = (v: number | undefined, m: number) => (v === undefined ? undefined : Math.round(v * m * 10) / 10);
function scaleBuff(b: BuffDef, m: number): BuffDef {
  const o: BuffDef = { ms: b.ms };
  for (const k of ["dmg", "armor", "speed", "atkspd", "lifesteal"] as const) if (b[k] !== undefined) o[k] = sc(b[k], m);
  if (b.onHit) o.onHit = { ...b.onHit, burn: b.onHit.burn && [sc(b.onHit.burn[0], m)!, b.onHit.burn[1]] };
  if (b.thorns) o.thorns = { ...b.thorns, dmg: sc(b.thorns.dmg, m), slowMs: sc(b.thorns.slowMs, m) };
  return o;
}

/**
 * What each golem does on its own besides its slam (its AI, no command): the fire golem bursts into flames around it,
 * the frost golem freezes with every third blow, the venom golem leaves pools of poison, the storm golem throws
 * chain lightning from afar. `mult` scales the golem's own blow.
 */
export const GOLEM_SKILL = {
  fire: { everyMs: 6000, r: 40, mult: 1.1, burn: [5, 2000] as [number, number] },
  cold: { every: 3, stunMs: 700 },
  poison: { everyMs: 5000, field: { kind: "venompool", r: 30, ms: 3500, tickMs: 500, dmg: 2.5, weakMs: 900 } as FieldDef },
  shock: { everyMs: 5000, range: 130, hops: 2, mult: 0.9, stunMs: 150 },
} as const;

/** When a golem dies (not when it is sent back), its element bursts out where it fell. Damage scales with Magic. */
export const GOLEM_DEATH: Record<AttuneElement, { area?: AreaDef; field?: FieldDef }> = {
  fire: { area: { r: 46, dmg: 16, burn: [6, 2000], kb: 1, look: "burst" } },
  cold: { field: { kind: "frostground", r: 46, ms: 4000, tickMs: 500, slowMs: 700 } },
  poison: { field: { kind: "toxiccloud", r: 42, ms: 4000, tickMs: 500, dmg: 3, weakMs: 900 } },
  shock: { area: { r: 46, dmg: 8, stunMs: 600, look: "bolt" } },
};

/**
 * Void Essence (the Summoner's stacks, STACK_NAME.summoner): gained when one of their creatures goes back to the
 * Void (dies or its time runs out), when the Black Hole swallows a foe, and while a golem takes blows through Stone
 * Bond (at most one per `bondEveryMs`). Basic hits don't build it. Ultimates spend it all (+25% per charge).
 * It fades after `decayMs` without a new charge.
 */
export const ESSENCE = { decayMs: 30_000, bondEveryMs: 3000 } as const;

/** How many golems a Summoner has: one, two with Twin Bond (su_twin) from GOLEM.twinLevel. */
export function golemSlots(level: number, twin: number): 1 | 2 {
  return level >= GOLEM.twinLevel && twin > 0 ? 2 : 1;
}

/**
 * Level used for a summon's life and damage scaling (monster scaling, shared/constants.ts mobScale). Past `soft`, only
 * `rate` of each level counts (balance pass 2026-11-07: the Summoner topped every class at Lv 25-30). The level shown
 * on the golem stays the owner's.
 */
export const SUMMON_SCALE = { soft: 20, rate: 0.4 } as const;
export const summonScaleLevel = (level: number) => (level <= SUMMON_SCALE.soft ? level : SUMMON_SCALE.soft + (level - SUMMON_SCALE.soft) * SUMMON_SCALE.rate);

/**
 * Stone Bond share for an owner of this level: SUMMON.guardShare up to Lv 20, then down to `low` at Lv 25 and after.
 * It is what carries the Summoner (duels: 28-30% without it), and at Lv 25-30 the full share put them above every class.
 */
export const BOND = { from: 20, to: 25, low: 0.22 } as const;
export function bondShare(level: number): number {
  if (level <= BOND.from) return SUMMON.guardShare;
  const t = Math.min(1, (level - BOND.from) / (BOND.to - BOND.from));
  return SUMMON.guardShare + (BOND.low - SUMMON.guardShare) * t;
}

/** Is this mob kind a summon (never part of a spawn zone, never drops loot)? */
export const isSummonMob = (kind: MobKind) => isSummonKind(kind);
