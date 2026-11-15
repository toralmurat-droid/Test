import type { MobKind } from "./constants";

/**
 * Damage types (Murat 2026-11-05): every hit is Physical, and weapons can turn part of it into Fire, Cold, Poison or
 * Faith (holy). Each element has its own side effect and monsters take more or less of it:
 *   Fire    a chance to set the target alight (a short burn on top)
 *   Cold    chills: the target is slowed for a moment
 *   Poison  that part lands as poison over 2 s instead of at once, a little more in total
 *   Faith   smites the undead and demons (x1.5), normal damage on the living
 *   Shock   (Electric, Murat 2026-11-05) sparks leap from the target to one more foe close by
 * Elements ride on basic attacks (melee swings, arrows, bolts). Armour, shields and hats can resist them.
 * The share is converted, not added, so an elemental weapon is as strong as a plain one of its tier against a
 * neutral target: it is better against monsters weak to it and worse against those that resist it.
 */
export type Element = "fire" | "cold" | "poison" | "faith" | "shock";
export const ELEMENTS: Element[] = ["fire", "cold", "poison", "faith", "shock"];
export const ELEMENT_NAMES: Record<Element | "physical", string> = { physical: "Physical", fire: "Fire", cold: "Cold", poison: "Poison", faith: "Faith", shock: "Electric" };
/** Damage numbers and item text colours. */
export const ELEMENT_COLORS: Record<Element | "physical", number> = { physical: 0xe8e0d0, fire: 0xff8a3c, cold: 0x8fd8ff, poison: 0x9bdc4a, faith: 0xffe08a, shock: 0xb8a8ff };
/** What each element does, for tooltips. */
export const ELEMENT_EFFECT: Record<Element, string> = {
  fire: "may set foes alight", cold: "chills (slows)", poison: "poisons over 2s", faith: "smites the undead", shock: "sparks leap to a foe nearby",
};

/** Side effects. */
export const ELEMENT_FX = {
  fire: { chance: 0.3, ticks: 3, tickMs: 500, total: 0.35 }, // burn worth 35% of the fire part, 30% of the time
  cold: { mobSlowMs: 900, heroSlowMs: 600 },
  poison: { ticks: 4, tickMs: 500, total: 1.15 }, // the poison part, delivered over 2 s, +15% for the wait
  shock: { arc: 0.4, range: 64 }, // 40% of the shock part jumps to the nearest other foe within 64 px
};

/** Hard cap on a hero's resistance to one element. */
export const MAX_RESIST = 0.6;

/** How much of each element a monster takes (1 = normal, missing = 1). */
const UNDEAD: Partial<Record<Element, number>> = { faith: 1.5, poison: 0.5, cold: 0.75, fire: 1.25 };
const BLOB: Partial<Record<Element, number>> = { poison: 0.5, fire: 1.25, cold: 1.25, shock: 1.25 };
export const MOB_AFFINITY: Partial<Record<MobKind, Partial<Record<Element, number>>>> = {
  skeleton: UNDEAD, crawler: UNDEAD, skeletonmage: UNDEAD, necromancer: UNDEAD, hollowking: UNDEAD,
  demon: { fire: 0.5, faith: 1.5, poison: 0.75 },
  slime: BLOB, blobling: BLOB, shooterblob: BLOB, warriorblob: BLOB, healerblob: BLOB, motherblob: BLOB,
  // the elemental blobs shrug off their own element and fear its opposite
  venomblob: { poison: 0.1, fire: 1.5, faith: 1.2, cold: 1.1, shock: 1.1 },
  frostblob: { cold: 0.2, fire: 1.6, poison: 0.5, shock: 1.15 },
  fireblob: { fire: 0.2, cold: 1.6, poison: 0.5, shock: 1.1 },
  stormblob: { shock: 0.2, poison: 0.6, cold: 1.4, fire: 1.1 },
  bandit: { poison: 1.15 }, banditchief: { poison: 1.15 },
  // Act 2: the Sand-Dead are the Kharsun dead (undead); scorpions shrug off venom; the Veiled Circle burns with the sun
  sanddead: UNDEAD, scorpion: { poison: 0.4, cold: 1.25 }, veiled: { fire: 0.5, cold: 1.25 }, sunwright: { fire: 0.4, cold: 1.3 }, nomad: { fire: 0.85 },
  sphinx: { fire: 0.6, faith: 0.8, poison: 1.2 }, // sun-blessed guardians
  // Act 3: the Host's dead are undead like the valley's; the wraiths are made of grave-cold mist; the hags live in the bog's rot
  wight: UNDEAD, bonehound: UNDEAD, legionary: UNDEAD, cairnlord: UNDEAD, barrowking: UNDEAD,
  mistwraith: { cold: 0.3, poison: 0.3, faith: 1.6, fire: 1.3 },
  boghag: { poison: 0.4, fire: 1.3 },
  // Act 4: the Redfang are men like their Hollow kin (the firebrands smell of lamp-oil and fear their own fire less);
  // the rattlers carry their own venom; the warhounds and vultures are plain flesh
  outrider: { poison: 1.15 }, crossbowman: { poison: 1.15 }, redcaptain: { poison: 1.15 }, rourke: { poison: 1.1 },
  firebrand: { fire: 0.6, poison: 1.15, cold: 1.15 },
  warhound: { poison: 1.1 }, vulture: { shock: 1.2, poison: 1.1 }, rattler: { poison: 0.3, cold: 1.3 },
};
export const mobAffinity = (kind: string, el: Element) => MOB_AFFINITY[kind as MobKind]?.[el] ?? 1;

/** The element of a monster's magic shot (hero resistances apply to it). Unset = Physical. */
export const MOB_SHOT_ELEMENT: Partial<Record<MobKind, Element>> = { shooterblob: "poison", skeletonmage: "cold", necromancer: "poison", hollowking: "cold", crowseer: "poison", veiled: "fire", boghag: "poison", mistwraith: "cold" };
/** The element of a monster's melee blows and special moves (unset = Physical). */
export const MOB_MELEE_ELEMENT: Partial<Record<MobKind, Element>> = { venomblob: "poison", frostblob: "cold", fireblob: "fire", stormblob: "shock",
  wight: "cold", mistwraith: "cold", barrowking: "cold", // Act 3: the barrow-cold in a wight's grip
  firebrand: "fire" }; // Act 4: a torch in the off hand

/** One elemental part of a hit, already in damage points. */
export interface ElemPart { el: Element; amt: number }

/** Words for a monster's weakness / resistance (quest log, tooltips). */
export function affinityText(kind: string): string {
  const a = MOB_AFFINITY[kind as MobKind];
  if (!a) return "";
  const weak = ELEMENTS.filter((e) => (a[e] ?? 1) > 1).map((e) => ELEMENT_NAMES[e]);
  const res = ELEMENTS.filter((e) => (a[e] ?? 1) < 1).map((e) => ELEMENT_NAMES[e]);
  return [weak.length ? `Weak to ${weak.join(", ")}` : "", res.length ? `resists ${res.join(", ")}` : ""].filter(Boolean).join(", ");
}

/**
 * Visual tiers of items (Murat 2026-11-05). Higher tiers get richer idle effects and richer basic-attack effects.
 * Oakvale (the first zone, Lv 1-30) only has Tier I items; the rest are planned for later zones (see project memory).
 * Inside Tier I the item level picks the rank (client/src/gearfx.ts FX_LEVELS): Plain, Glint, Trail, Flame, Mythic.
 */
export const VISUAL_TIERS = [
  { tier: 1, name: "Tier I", zone: "Oakvale (Lv 1-30)", elements: 1, maxShare: 0.5 },
  { tier: 2, name: "Tier II", zone: "planned: second zone (Lv 30-50)", elements: 2, maxShare: 0.7 },
  { tier: 3, name: "Tier III", zone: "planned: third zone (Lv 50-70)", elements: 2, maxShare: 0.85 },
  { tier: 4, name: "Tier IV", zone: "planned: endgame", elements: 3, maxShare: 1 },
];

/**
 * Elemental reactions (Lot E, game design review 2026-11): two elements meeting on the same monster react, so heroes
 * of different classes fighting together get more out of their elements. Monsters only, never PvP.
 *   - A hit with an elemental part leaves a MARK on the monster for REACTION_MARK_MS: its element and the hero who left it.
 *   - A hit of ANOTHER element on a marked monster sets off the reaction of the pair and uses the mark up.
 *   - Mark left by another hero: the reaction works in full. Left by the same hero: at REACTION_SELF_FACTOR (30%).
 *     A hero's creatures (golems, wisps, Void Blades, the Void Lord's Arsenal, a vampire's thralls) hit in their
 *     owner's name, so they always count as that same hero, never as "another hero".
 *   - The pairs are symmetric: mark Cold + Shock hit = mark Shock + Cold hit.
 *   - After a reaction a monster cannot react again for REACTION_COOLDOWN_MS. 1 s: long enough that two heroes
 *     trading hits can't chain a reaction on every swing (a basic attack lands every ~0.5-0.8 s), short enough that a
 *     group still sees one every second or two. Hits during the cooldown still leave their mark, ready for the next one.
 * Values below are at 100% (another hero's mark); the factor scales each effect.
 */
export type ReactionId = "fracture" | "toxic" | "steam" | "corrode" | "purify";
export interface ReactionDef { name: string; els: [Element, Element]; color: number; text: string }
export const REACTIONS = {
  // +40% damage on this hit, and a big poise blow (a share of the monster's whole poise bar)
  fracture: { name: "Fracture", els: ["cold", "shock"], color: 0xbfe6ff, text: "+40% damage on the hit, breaks poise", dmg: 0.4, poise: 0.35 },
  // a burst of poison round the target: the others close by take a share of the hit
  toxic: { name: "Toxic Blast", els: ["fire", "poison"], color: 0x9bdc4a, text: "a poison blast hurts the foes around", radius: 56, dmg: 0.5 },
  // scalding steam: the monster misses some of its attacks for a moment
  steam: { name: "Steam", els: ["fire", "cold"], color: 0xe8f4ff, text: "the foe misses 30% of its attacks for 3s", miss: 0.3, ms: 3000 },
  // its elemental resistances drop by 25 points for 5 s (affinity + 0.25: a 50% resist becomes 25%)
  corrode: { name: "Corrosion", els: ["shock", "poison"], color: 0xc8e06a, text: "-25% elemental resistances for 5s", resist: 0.25, ms: 5000 },
  // x2 on this hit against the undead and demons, and a small heal to the hero and their group close by
  purify: { name: "Purification", els: ["faith", "fire"], color: 0xfff1b0, text: "x2 on the undead and demons, heals heroes close by", mult: 2, heal: 0.03, radius: 96 },
} satisfies Record<ReactionId, ReactionDef & Record<string, unknown>>;
export const REACTION_IDS = Object.keys(REACTIONS) as ReactionId[];
/** How long a mark stays on a monster. */
export const REACTION_MARK_MS = 4000;
/** How long a monster cannot react again after a reaction. */
export const REACTION_COOLDOWN_MS = 1000;
/** A reaction on a mark the same hero (or their creatures) left. */
export const REACTION_SELF_FACTOR = 0.3;

/** The reaction of two elements, either way round (undefined: none, or the same element). */
export function reactionOf(a: Element, b: Element): ReactionId | undefined {
  if (a === b) return undefined;
  for (const id of REACTION_IDS) { const [x, y] = REACTIONS[id].els; if ((a === x && b === y) || (a === y && b === x)) return id; }
  return undefined;
}

/** What a monster carries for reactions (server only, not synced as such). */
export interface ReactState {
  el?: Element; by?: string; until: number; // the mark: element, who left it (a hero id, the owner for creatures), when it fades
  cdUntil: number; // no reaction before this
  steamUntil: number; steamMiss: number; // Steam: miss chance until then
  corrodeUntil: number; corrode: number; // Corrosion: affinity bonus until then
}
export const newReactState = (): ReactState => ({ until: 0, cdUntil: 0, steamUntil: 0, steamMiss: 0, corrodeUntil: 0, corrode: 0 });

/** Who a hit counts as for reactions: a creature's owner when it has one, otherwise the hero who hit. */
export const reactionActor = (attacker: string, ownerOf?: (id: string) => string | undefined) => ownerOf?.(attacker) || attacker;

export interface ReactionHit { id: ReactionId; factor: number; markBy: string }

/**
 * One elemental hit on a monster (`els`: the elements of the hit, strongest first; `by`: the hero, see reactionActor).
 * Sets off a reaction when the monster is marked with another element that pairs with one of the hit's (the mark is
 * then used up), otherwise leaves (or renews) the mark with the hit's strongest element. `pvp`: the target is a hero or a
 * hero's creature: nothing at all. Mutates `s`; returns the reaction set off, if any.
 */
export function applyElementHit(s: ReactState, els: Element[], by: string, now: number, pvp = false): ReactionHit | undefined {
  if (pvp || !els.length) return undefined;
  if (s.el && now < s.until && now >= s.cdUntil) {
    for (const e of els) {
      const id = reactionOf(s.el, e);
      if (!id) continue;
      const markBy = s.by ?? "";
      s.el = undefined; s.by = undefined; s.until = 0; s.cdUntil = now + REACTION_COOLDOWN_MS;
      return { id, factor: markBy === by ? REACTION_SELF_FACTOR : 1, markBy };
    }
  }
  s.el = els[0]; s.by = by; s.until = now + REACTION_MARK_MS;
  return undefined;
}

/** The live mark on a monster, if any. */
export const liveMark = (s: ReactState | undefined, now: number): Element | undefined => (s?.el && now < s.until ? s.el : undefined);
/** Extra share of an element a monster takes while corroded (added to its affinity). */
export const corrodeBonus = (s: ReactState | undefined, now: number) => (s && now < s.corrodeUntil ? s.corrode : 0);
/** Chance a monster's attack misses while in Steam. */
export const steamMiss = (s: ReactState | undefined, now: number) => (s && now < s.steamUntil ? s.steamMiss : 0);
/** Applies a reaction's lasting effects (Steam, Corrosion) to a monster's state at `factor`. */
export function lingerReaction(s: ReactState, id: ReactionId, factor: number, now: number) {
  if (id === "steam") { s.steamUntil = now + REACTIONS.steam.ms; s.steamMiss = Math.max(steamMiss(s, now), REACTIONS.steam.miss * factor); }
  if (id === "corrode") { s.corrodeUntil = now + REACTIONS.corrode.ms; s.corrode = Math.max(corrodeBonus(s, now), REACTIONS.corrode.resist * factor); }
}
/** The undead and demons (Purification doubles on them): the monsters Faith smites. */
export const purifies = (kind: string) => mobAffinity(kind, "faith") >= 1.5;
/** Status words for the client (added to Mob.fx): "em_<element>" for a mark, "steam", "corrode". */
export function reactionWords(s: ReactState | undefined, now: number): string {
  if (!s) return "";
  const w: string[] = [];
  const m = liveMark(s, now);
  if (m) w.push("em_" + m);
  if (steamMiss(s, now)) w.push("steam");
  if (corrodeBonus(s, now)) w.push("corrode");
  return w.join(",");
}
