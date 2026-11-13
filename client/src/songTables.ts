/**
 * Songweaver presentation tables (cosmetic only): mode colours, which status words mean what, chord names, and the
 * one-time hint lines. Everything the client shows here is read from server events and status words
 * (docs/songweaver-progress.md, "Interface contract"); nothing here decides an outcome.
 */
import { MOB_COMBAT } from "../../shared/combat";

export type SoundTier = "deaf" | "dull" | "normal" | "keen" | "fragile";

/** Ring / note colour by the caster's mode (`mode:<id>` status word). */
export const MODE_COLOR: Record<string, number> = { major: 0xffd24d, minor: 0x5aa2ff, lydian: 0xd9c4ff, dorian: 0x6fdc8c, phrygian: 0xd8203c };
export const MODE_NAME: Record<string, string> = { major: "Major", minor: "Minor", lydian: "Lydian", dorian: "Dorian", phrygian: "Phrygian" };
export const modeColor = (m: string | undefined) => MODE_COLOR[m ?? ""] ?? MODE_COLOR.major;

/** Buff ids that put a song ring on the carrier (the Songweaver and party allies). */
export const SONG_BUFFS = new Set(["sg_ballad", "sg_march", "sg_jig", "sg_call", "sg_anthem", "sg_chorale", "sg_dirge"]);
/** Buff ids that are a shield (also any skill whose buff has `shield`, see skillfx.status). */
export const SHIELD_BUFFS = new Set(["sg_pedal", "sg_lydian"]);

/** Finisher names by the `prog` of a chord event. */
export const CHORD_NAMES: Record<string, string> = { amen: "Amen", encore: "Turnaround", shatter: "Shatterchord", resolve: "Perfect Cadence", sleight: "Deceptive Cadence" };

/** Degrees as the chord tracker prints them (the pixel font has no flat sign). */
export const DEGREE_TEXT: Record<string, string> = { I: "I", i: "i", ii: "ii", bII: "bII", IV: "IV", V: "V", vi: "vi" };

export const TIER_COLOR: Record<SoundTier, number> = { deaf: 0x777777, dull: 0xb0a090, normal: 0xe8e8e8, keen: 0xffd24d, fragile: 0xff8a8a };
/** Damage number colours: ringing (keen / fragile / matching pitch) and muffled (deaf / dull). */
export const RINGING = "#ffd24d", MUFFLED = "#8a8a8a";

/** Chat hint, the first time a Songweaver hits a new kind of monster (once per session). `{name}` is the monster. */
export const HINTS: Record<SoundTier, string> = {
  deaf: "{name} is deaf: your music barely reaches it. Use your own wits.",
  dull: "{name} hears dully: songs are muffled and resonance builds slowly.",
  normal: "",
  keen: "{name} hears keenly: your notes ring and hit harder.",
  fragile: "{name} is fragile to sound: let resonance build until it shatters.",
};

export interface MobSound { tier: SoundTier; pitch?: "L" | "M" | "H" | "any"; mode?: string }
/** MOB_COMBAT[kind].sound (shared/combat.ts), read defensively until it lands. `__devMobSound` is the dev harness's stand-in (tools/e2e-songweaver-fx.cjs). */
export const soundOf = (kind: string): MobSound | undefined => (MOB_COMBAT as any)[kind]?.sound ?? (globalThis as any).__devMobSound?.[kind];
