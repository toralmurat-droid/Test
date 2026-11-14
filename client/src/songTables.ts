/**
 * Songweaver presentation tables (cosmetic only): mode colours, which status words mean what, chord names, and the
 * one-time hint lines. Everything the client shows here is read from server events and status words
 * (docs/songweaver-progress.md, "Interface contract"); nothing here decides an outcome.
 */
import * as songsMod from "../../shared/songs";
import { SLOT_NAMES } from "../../shared/gear";
import { MOB_COMBAT, type MobSound, type SoundTier } from "../../shared/combat";
import type { MobKind } from "../../shared/constants";
import { CANTRIPS, FINISHERS, SKILLS, skillById, type SkillDef } from "../../shared/skills";

/** Every Songweaver skill, hidden finishers and the cantrip included. */
const SONG_SKILLS: SkillDef[] = [...SKILLS.songweaver, ...CANTRIPS.songweaver, ...FINISHERS];

export type { SoundTier, MobSound };

/** Ring / note colour by the caster's mode (`mode:<id>` status word). */
export const MODE_COLOR: Record<string, number> = { major: 0xffd24d, minor: 0x5aa2ff, lydian: 0xd9c4ff, dorian: 0x6fdc8c, phrygian: 0xd8203c };
export const MODE_NAME: Record<string, string> = { major: "Major", minor: "Minor", lydian: "Lydian", dorian: "Dorian", phrygian: "Phrygian" };
export const modeColor = (m: string | undefined) => MODE_COLOR[m ?? ""] ?? MODE_COLOR.major;

/**
 * Buff ids that put a song ring on the carrier (the Songweaver and party allies): every song skill, and every skill whose
 * field gives the party a buff (Anthem). Built from the real skill table; a buff's id is its skill's id.
 */
export const SONG_BUFFS: ReadonlySet<string> = new Set(SONG_SKILLS.filter((s) => s.song || s.field?.party).map((s) => s.id));
/** Buff ids that are a shield bubble: any Songweaver skill whose buff has `shield` (Pedal Point, Amen, ...). */
export const SHIELD_BUFFS: ReadonlySet<string> = new Set(SONG_SKILLS.filter((s) => s.buff?.shield || s.field?.party?.shield).map((s) => s.id));

/** Finisher names by the `prog` of a chord event: read from the skill table (skillById) so they never drift. */
const PROG_SKILL: Record<string, string> = { amen: "sg_f_amen", encore: "sg_f_encore", shatter: "sg_f_shatter", resolve: "sg_f_resolve", sleight: "sg_f_sleight" };
export const CHORD_NAMES: Record<string, string> = Object.fromEntries(Object.entries(PROG_SKILL).map(([k, id]) => [k, skillById(id)?.name ?? k]));
/** The progression behind each finisher: its name, the notes in order and what the finisher does (section 4). */
export const PROGRESSIONS_TEXT: { prog: string; name: string; notes: string; line: string; does: string }[] = [
  { prog: "amen", name: "Amen", notes: "vi IV I", line: "A hymn's ending.", does: "Heals and shields." },
  { prog: "encore", name: "Turnaround", notes: "ii V I", line: "The tune circles back.", does: "Party hits harder and faster." },
  { prog: "shatter", name: "Neapolitan", notes: "bII V i", line: "A sour step, then home in shadow.", does: "Damage, a stun, and heavy ringing." },
  { prog: "resolve", name: "Perfect", notes: "IV V I", line: "The cadence every ear expects.", does: "Heals friends, hits foes." },
  { prog: "sleight", name: "Deceptive", notes: "IV V vi", line: "You promise home and turn away.", does: "Untouchable for a moment; foes flee." },
];
export const CHORD_HINT = "one more note.", CHORD_LOCK_LINE = "Your strings are still ringing.";
/** Plain words for the Roman numerals (the content doc's glosses). Capital = bright, small = sad. */
export const DEGREE_GLOSS: Record<string, string> = {
  I: "home note", i: "home, in shadow", ii: "lively step up", bII: "sour step above home", IV: "leans toward home", V: "tension, wants an answer", vi: "sad cousin of home",
};

/** Degrees as the chord tracker prints them (the pixel font has no flat sign). */
export const DEGREE_TEXT: Record<string, string> = { I: "I", i: "i", ii: "ii", bII: "bII", IV: "IV", V: "V", vi: "vi" };

export const TIER_COLOR: Record<SoundTier, number> = { deaf: 0x777777, dull: 0xb0a090, normal: 0xe8e8e8, keen: 0xffd24d, fragile: 0xff8a8a };
/** Damage number colours: ringing (keen / fragile / matching pitch) and muffled (deaf / dull). */
export const RINGING = "#ffd24d", MUFFLED = "#8a8a8a";

/** Chat hint, the first time a Songweaver strikes a monster of this tier (docs/songweaver-content.md section 5). */
export const HINTS: Record<SoundTier, string> = {
  deaf: "It does not hear you. Sound barely troubles it.",
  dull: "It hears you, but only dimly.",
  normal: "It hears you as most things do.",
  keen: "Sharp-eared. It flinches at every note.",
  fragile: "It rings like glass. A hard note could shatter it.",
};
/** Added to the tier line when the monster has a favourite note. "Note" wording, never "pitch", in player text. */
export const NOTE_HINTS: Record<"L" | "M" | "H", string> = { L: "It hums back at low notes.", M: "It answers to middle notes.", H: "It rings at high notes." };
/** One-time lines per kind (docs/songweaver-content.md section 5, true to MOB_COMBAT[*].sound). */
export const KIND_HINTS: Partial<Record<MobKind, string>> = {
  wisp: "Glassy. It rings at high notes, and a hard one could shatter it.",
  slime: "Soft and wet. It swallows the sound.", motherblob: "Soft and wet. It swallows the sound.", blobling: "Soft and wet. It swallows the sound.",
  skeleton: "Dry, brittle bones. A high note in a bright key could shatter them.",
  skeletonmage: "Brittle, and humming with its own spell. A high note cracks it.",
  bride: "Sharp-eared and pale. High notes cut her.",
  crowseer: "It cocks its head at every note.",
  duskwing: "Its ears are larger than its head.",
  gnawkin: "Small, quick, and all ears. Every high note stings it.",
  tuskborn: "It feels low notes in its chest, and hears them like anyone.",
  silkwretch: "Its web shivers with every note, and so does it.",
  scorpion: "A hard shell. Only the highest notes get through.",
  sanddead: "Dry and hollow. Low notes rattle in them, and they like the major key.",
  golem_colossus: "Stone barely listens. Only low notes trouble it.",
  golem_fire: "Heavy as stone. Low notes work best.", golem_poison: "Heavy as stone. Low notes work best.",
  golem_cold: "Ice rings like a bell. A high note could shatter it.",
  golem_shock: "Crackling and restless. It flinches at high notes.",
  sphinx: "It listens closely, and the minor key reaches it best.",
  hollowking: "A crown of bone, and ears of stone. A deep note in the major key rings in him, but slowly.",
  nightraider: "It cannot be moved by song, only by steel.",
};
/** The hint for a monster kind: its own line when it has one, else the tier line plus the note flavour. */
export function hintFor(kind: string): string {
  const s = soundOf(kind);
  if (!s) return "";
  return KIND_HINTS[kind as MobKind] ?? [HINTS[s.tier], s.pitch ? NOTE_HINTS[s.pitch] : "", s.mode ? `It likes the ${s.mode} key.` : ""].filter(Boolean).join(" ");
}

/** Nameplate tooltips (section 6): the ear icon by tier, the note icon, and the key affinity. */
export const EAR_TIPS: Record<SoundTier, string> = {
  deaf: "Deaf. Sound barely affects it.",
  dull: "Hard of hearing. Sound is weaker.",
  normal: "Normal hearing.",
  keen: "Keen ears. Sound hits harder.",
  fragile: "Fragile. A loud enough sound shatters it.",
};
export const NOTE_TIPS: Record<"L" | "M" | "H" | "none", string> = { L: "Answers to low notes.", M: "Answers to middle notes.", H: "Answers to high notes.", none: "No favourite note." };
export const KEY_TIPS: Record<string, string> = { major: "Likes the major key.", minor: "Likes the minor key." };
export const RES_TIP = "Resonance: the right notes make a foe ring. Fill it and it bursts. A fifth or an octave after the last note rings fastest. It fades if you stop.";
export const RES_STAGES = ["Humming", "Ringing", "About to burst"];

/** The nameplate tooltip for a monster kind: ear tier, favourite note and key, as one line. */
export function earTip(kind: string): string {
  const s = soundOf(kind);
  if (!s) return "";
  return [EAR_TIPS[s.tier], NOTE_TIPS[s.pitch ?? "none"], s.mode ? KEY_TIPS[s.mode] ?? "" : ""].filter(Boolean).join(" ");
}

/** MOB_COMBAT[kind].sound (shared/combat.ts): how a monster hears. */
export const soundOf = (kind: string): MobSound | undefined => MOB_COMBAT[kind as MobKind]?.sound;

/**
 * Slot label for the UI: a Songweaver's shield slot holds her Songbook or a book ("Book"). HOOK(di): ids `songweaver_shield`
 * and `bk_*` come from the contract; they don't exist in shared/ until the server side lands.
 */
export function slotName(slot: string, cls?: string, id?: string): string {
  const base = (id ?? "").split(/[@#^]/)[0];
  if (slot === "shield" && (cls === "songweaver" || base === "songweaver_shield" || base.startsWith("bk_"))) return "Book";
  return (SLOT_NAMES as Record<string, string>)[slot] ?? slot;
}

/**
 * Player-facing kind of a Songweaver skill: "Chorus" (the 30 s party song), "Verse" (a note skill, the basic attack
 * too) or "Key change" (Modulate). HOOK(di): uses `songKind` from shared/songs.ts as soon as it exists; until then
 * the local rule below.
 */
export function songKindLabel(s: { song?: boolean; modulate?: boolean; degree?: string; passive?: unknown }): string | undefined {
  const real = (songsMod as any).songKind as ((s: unknown) => string | undefined) | undefined;
  if (real) return real(s);
  return s.song ? "Chorus" : s.modulate ? "Key change" : s.degree && !s.passive ? "Verse" : undefined;
}
