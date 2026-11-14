import { TILE } from "./constants";
import { gearDef } from "./gear";
import { MIRROR_POND } from "./map";
import { PROGRESSIONS, type Progression } from "./songs";

/**
 * Songs the Songweaver collects into her Songbook (DI-2, docs/songweaver-di-plan.md). Songs come from quests, villagers
 * and places, never from a drop (owner, 2.1). Each one teaches a new progression (three notes) with its own finisher
 * (shared/skills.ts FINISHERS). A collected song counts only while she wears a book with `songs: true` (the Songbook):
 * progressionsFor() is what the engine plays against. server/songs.ts SongCollector hands them out and saves them.
 * Player text comes from docs/songweaver-di-content.md section 4.
 */

export type SongId = "song_hum" | "song_round" | "song_pond" | "song_lament";

/** Where a song is found: a quest's reward, a villager who hears a Chorus close by, or a Chorus played at a place. */
export type SongSource =
  | { kind: "quest"; quest: string }
  /** A Chorus (a song skill) played within `range` px of villager `npc`; `family`: the key it must be in. */
  | { kind: "npc"; npc: string; range: number; family: "major" | "minor" }
  /** A Chorus played on Mirror Pond's shore (pondShore). */
  | { kind: "place"; place: "pond" };

export interface SongDef {
  id: SongId; name: string; source: SongSource;
  /** The progression it teaches: its id is the `prog` of the "chord" event, its skill the finisher. */
  prog: Progression;
  /** Before it is found (shown under "???"); the line when it is learned; its chord line in the reader. */
  hint: string; learned: string; line: string;
  /** Who teaches it, and what they say (chat lines, in order), and the banner line. */
  teacher?: string; teach?: string[]; banner: string;
}

export const SONG_SOURCES: SongDef[] = [
  { id: "song_hum", name: "The Gloam's Hum", source: { kind: "quest", quest: "jelly" },
    prog: { id: "hum", name: "Gloam's Hum", notes: ["I", "V", "I"], skill: "sg_f_hum" },
    hint: "Something hums in Morwen's jelly. Help her find out why.",
    learned: "You hum the tune back until you have it. The Gloam's Hum is in your Songbook.",
    line: "The tune of a thing that remembers.",
    teacher: "Morwen", banner: "Morwen taught you a song.",
    teach: ["Hold still, darling. Listen. Hear it? The jelly hums in threes.", "Here. Write it down before it gets away from you. A minstrel should have it. I have no use for a tune that crawls."] },
  { id: "song_round", name: "Miller's Round", source: { kind: "npc", npc: "miller", range: 4 * TILE, family: "major" },
    prog: { id: "round", name: "Miller's Round", notes: ["I", "V", "vi"], skill: "sg_f_round" },
    hint: "Odo the miller likes a good Chorus. Play a bright one near him.",
    learned: "Odo hums the last bars for you. Miller's Round is in your Songbook.",
    line: "A round that turns the mill, and the people with it.",
    teacher: "Odo", banner: "Odo taught you a song.",
    teach: ["Ha! That is the spirit. Here, I will give you the round we sing at the wheel. Three lines, and it never ends.", "Mind the rhythm. The wheel does not wait."] },
  { id: "song_pond", name: "Mirror Pond Air", source: { kind: "place", place: "pond" },
    prog: { id: "undertow", name: "Undertow", notes: ["i", "bII", "i"], skill: "sg_f_undertow" },
    hint: "The still water at the Mirror Pond keeps the tune. Play a Chorus on its shore.",
    learned: "The water gives your tune back, a little changed. Mirror Pond Air is in your Songbook.",
    line: "A tune and its reflection.", banner: "Mirror Pond Air" },
  { id: "song_lament", name: "The Hollow King's Lament", source: { kind: "quest", quest: "king" },
    prog: { id: "picardy", name: "Picardy", notes: ["i", "V", "I"], skill: "sg_f_picardy" },
    hint: "A king is owed a song. Put the Hollow King to rest.",
    learned: "You find the last notes in the quiet he leaves behind. The Hollow King's Lament is in your Songbook.",
    line: "Grief, then a single light at the end.", banner: "A song for the Hollow King.",
    teach: ["Something in the silence is a tune. You write it down while you can."] },
];
export const SONG_IDS = SONG_SOURCES.map((s) => s.id);
export const songById = (id: unknown): SongDef | undefined => SONG_SOURCES.find((s) => s.id === id);
export const isSongId = (v: unknown): v is SongId => !!songById(v);
/** The song a quest teaches when it is done, if any. */
export const songOfQuest = (quest: string): SongDef | undefined => SONG_SOURCES.find((s) => s.source.kind === "quest" && s.source.quest === quest);
/** Every progression a song can teach. */
export const SONG_PROGRESSIONS: Progression[] = SONG_SOURCES.map((s) => s.prog);

/** Odo's other lines (content doc section 4): before he teaches, and when the Chorus is in a dark key. */
export const ODO_LINES = {
  before: "Is that a lute? Play something bright, would you? The wheel turns better with a tune.",
  dark: "Hm. A bit gloomy for grinding grain. Try a bright key.",
};
/** The first-time hint on Mirror Pond's shore. */
export const POND_HINT = "The water is very still. It is listening.";

/** Is (x, y) px on Mirror Pond's shore: the sand ring round its water, a step or two out? */
export function pondShore(x: number, y: number): boolean {
  const P = MIRROR_POND, d = Math.hypot((x / TILE - P.x) / P.rx, (y / TILE - P.y) / P.ry);
  return d >= 0.8 && d <= 1.6;
}

/** Does the book she wears hold collected songs (GearDef.book.songs: the Songbook)? */
export const holdsSongs = (book: string | undefined): boolean => !!book && !!gearDef(book)?.book?.songs;

/**
 * The progressions this hero plays against: every chord she was born knowing, plus the collected songs while her book
 * holds them (SkillRuntime.book, .songs). The engine (noteCast, the ch1/ch2 status words) and the sims read this.
 */
export function progressionsFor(sk: { book?: string; songs?: readonly string[] }): Progression[] {
  if (!sk.songs?.length || !holdsSongs(sk.book)) return PROGRESSIONS;
  return [...PROGRESSIONS, ...SONG_SOURCES.filter((s) => sk.songs!.includes(s.id)).map((s) => s.prog)];
}

/** Player text of the books (content doc section 3): the gift's name, the book's desc and its full-gauge line. */
export const BOOK_TEXT: Record<string, { gift: string; desc: string; line: string }> = {
  songweaver_shield: { gift: "Refrain", desc: "A worn little book of your own tunes. It keeps the songs you find and the legend of your chords.", line: "Refrain: your Chorus beats again at once and its time begins anew. With no Chorus, your party is mended." },
  bk_hymnal: { gift: "Benediction", desc: "Pages of old hymns, soft with handling. For a minstrel who keeps people on their feet.", line: "Benediction: you and your party close by are healed and shielded." },
  bk_march: { gift: "Rally", desc: "Drum rhythms and road songs, inked in a hurry. For a minstrel who leads a band.", line: "Rally: you and your party close by hit harder, strike faster and move quicker for a few seconds." },
  bk_dissonance: { gift: "Cacophony", desc: "Songs written to be played wrong. For a minstrel who plays alone and does not mind the stares.", line: "Cacophony: a harsh blast hurts and stuns foes around you, and leaves them ringing." },
};
