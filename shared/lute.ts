import type { GearBonus } from "./gear";

/**
 * The Songweaver's evolving lute (DI-5, docs/songweaver-di-plan.md). Pure data, no imports beyond types, so
 * shared/gear.ts can read it while building item ids and the engine can read the traits.
 *
 *  - The lute stays the kit item `songweaver_weapon`. Its id carries the hero's level and its fitted traits:
 *    `songweaver_weapon@<lvl>#<trait>.<trait>` (the `#` segment comes before any `^` runes). The level follows the
 *    hero (server/songs.ts relevelLute, on level-up and login); stats and sockets come from LUTE_STAGES.
 *  - Traits are fitted by Wren the lute-maker (shared/lutemaker.ts): one per group, so at most three.
 */

export const LUTE_ID = "songweaver_weapon";

/** A stage of the lute: from `from` (hero level), its name word ("{name} Lute"), its stats and rune sockets. */
export interface LuteStage { from: number; name: string; bonus: GearBonus; sockets: number; line: string }
/** Kept level with the sims' gearFor weapons (tools/balance/duel.ts). No new look per stage (owner, DI-5 5.4). */
export const LUTE_STAGES: LuteStage[] = [
  { from: 1, name: "Minstrel's", bonus: {}, sockets: 1, line: "A first lute. It plays, and that is enough." },
  { from: 5, name: "Journeyman's", bonus: { atk: 2 }, sockets: 1, line: "Strung properly, now. It starts to answer you." },
  { from: 10, name: "Fine", bonus: { atk: 4, mag: 1 }, sockets: 1, line: "A fine lute. Good wood, good voice." },
  { from: 20, name: "Master's", bonus: { atk: 7, mag: 2 }, sockets: 2, line: "A master's instrument. Heads turn when it is tuned." },
  { from: 35, name: "Virtuoso's", bonus: { atk: 8, mag: 3 }, sockets: 2, line: "Known by its sound across the land." },
];
/** The stage of a lute at this item level. */
export function luteAt(level: number): LuteStage {
  let out = LUTE_STAGES[0];
  for (const s of LUTE_STAGES) if (level >= s.from) out = s;
  return out;
}

// ---- Traits ------------------------------------------------------------------------------------------------------

export type LuteTraitId = "steel" | "gut" | "silk" | "wide" | "deep" | "horn" | "bright" | "dark" | "bonepegs";
export type LuteGroup = "strings" | "body" | "tuning";
export const LUTE_GROUPS: LuteGroup[] = ["strings", "body", "tuning"];
export const LUTE_GROUP_NAMES: Record<LuteGroup, string> = { strings: "Strings", body: "Body", tuning: "Tuning" };

export type MaterialId = "tonewood" | "brass" | "bone" | "silk" | "horn" | "sunglass";
export const MATERIAL_IDS: MaterialId[] = ["tonewood", "brass", "bone", "silk", "horn", "sunglass"];
export const MATERIAL_NAMES: Record<MaterialId, string> = { tonewood: "Tonewood", brass: "Brass", bone: "Bone", silk: "Silk", horn: "Horn", sunglass: "Sunglass" };
export const isMaterial = (v: unknown): v is MaterialId => typeof v === "string" && (MATERIAL_IDS as string[]).includes(v);
/** Player text per material (docs/songweaver-di-content.md section 7): tooltip, pickup line, where it comes from. */
export const MATERIALS: Record<MaterialId, { name: string; desc: string; pick: string; source: string }> = {
  tonewood: { name: "Tonewood", desc: "Seasoned wood that rings when you tap it. Comes from broken weapons.", pick: "You gather tonewood.", source: "Break a weapon at Wren." },
  brass: { name: "Brass", desc: "Bright fittings and tuning pins. Comes from broken shields and books.", pick: "You gather brass.", source: "Break a shield or book at Wren." },
  bone: { name: "Bone", desc: "Old, dry bone, smooth as a peg. The restless dead carry it.", pick: "You pick up old bone.", source: "Skeletons and the Hollow King." },
  silk: { name: "Silk", desc: "Fine, strong thread from the webs of silkwretches.", pick: "You gather a hank of silk.", source: "Silkwretches and the weaver." },
  horn: { name: "Horn", desc: "A curl of tusk-horn, hollow and deep-voiced.", pick: "You pick up a curl of horn.", source: "Tusk beasts." },
  sunglass: { name: "Sunglass", desc: "Glass fused by the desert sun. It rings like a bell.", pick: "You find a shard of sunglass.", source: "The Sunscar." },
};

export interface LuteTrait {
  id: LuteTraitId; group: LuteGroup; name: string;
  level: number; gold: number; mats: Partial<Record<MaterialId, number>>;
  exotic?: boolean;
  desc: string;
}
/** The nine traits, three exclusive groups. Their effects live in shared/skillEngine.ts and server/songs.ts (LUTE_FX). */
export const LUTE_TRAITS: LuteTrait[] = [
  { id: "steel", group: "strings", name: "Steel Strings", level: 5, gold: 150, mats: { tonewood: 6 }, desc: "Bright metal strings. Your sound waves bounce off a wall once." },
  { id: "gut", group: "strings", name: "Gut Strings", level: 5, gold: 150, mats: { tonewood: 6 }, desc: "Warm and soft. Your sound rings foes faster." },
  { id: "silk", group: "strings", name: "Silk Strings", level: 18, gold: 600, mats: { silk: 8, tonewood: 10 }, exotic: true, desc: "Spun from silkwretch thread. Your bounces lose nothing." },
  { id: "wide", group: "body", name: "Wide Bowl", level: 12, gold: 400, mats: { tonewood: 8 }, desc: "A broad, round body. Your Choruses reach farther." },
  { id: "deep", group: "body", name: "Deep Bowl", level: 12, gold: 400, mats: { tonewood: 8 }, desc: "A deep, hollow body. Low notes come out stronger." },
  { id: "horn", group: "body", name: "Horn Bowl", level: 24, gold: 900, mats: { horn: 8, brass: 10 }, exotic: true, desc: "A tusk-horn body. Chords fill your song gauge faster." },
  { id: "bright", group: "tuning", name: "Bright Tuning", level: 25, gold: 800, mats: { brass: 6 }, desc: "Tuned high and sweet. Friends gain more from your bright keys." },
  { id: "dark", group: "tuning", name: "Dark Tuning", level: 25, gold: 800, mats: { brass: 6 }, desc: "Tuned low and sour. Foes suffer more from your dark keys." },
  { id: "bonepegs", group: "tuning", name: "Bone Pegs", level: 30, gold: 1500, mats: { bone: 10, sunglass: 4 }, exotic: true, desc: "Pegs carved from old bone. Your gauge holds longer before it drains, and your book's gift is stronger." },
];
export const LUTE_TRAIT_IDS = LUTE_TRAITS.map((t) => t.id);
export const luteTrait = (id: unknown): LuteTrait | undefined => LUTE_TRAITS.find((t) => t.id === id);

/**
 * What the traits do (one number each): Steel: basic waves bounce `steelBounce` time(s); Gut: x resonance; Silk:
 * bounces lose no damage; Wide: x Chorus radius; Deep: x low notes (pitch L); Horn: x gauge fill from chords; Bright /
 * Dark: x ally power in bright modes / x foe power in dark modes; Bone Pegs: the drain waits `pegsIdleMs` longer and
 * the full effect is x `pegsFull`.
 */
export const LUTE_FX = {
  steelBounce: 1, gutRes: 1.15, wideRadius: 1.15, deepLow: 1.15, hornChord: 1.5,
  brightAlly: 1.08, darkFoe: 1.08, pegsIdleMs: 4000, pegsFull: 1.15,
};
