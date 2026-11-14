/**
 * Songweaver DI-2 / DI-5 presentation data (cosmetic only): books, songs, lute stages and traits, materials, and the
 * owner-only "songbook" message store. Texts come from docs/songweaver-di-content.md; ids from the Interface contract in
 * docs/songweaver-di-plan.md. The server decides everything (fits, breaks, pickups, what the Songbook holds).
 * HOOK(di): until shared/songbook.ts exists the tables below are the client's copy; costs and levels are display only.
 */

/** Item base id of an item id: strips `@level`, `#traits`, `^runes`, `~affixes`. */
export const songBase = (id: string) => (id ?? "").split(/[@#^~]/)[0];

export interface BookInfo { name: string; gift: string; line: string; desc: string }
/** Books (shield slot). `songweaver_shield` is the bound Songbook kit. */
export const BOOKS: Record<string, BookInfo> = {
  songweaver_shield: { name: "Songbook", gift: "Refrain", desc: "A worn little book of your own tunes. It keeps the songs you find and the legend of your chords.", line: "Refrain: your Chorus beats again at once and its time begins anew. With no Chorus, your party is mended." },
  bk_hymnal: { name: "Hymnal", gift: "Benediction", desc: "Pages of old hymns, soft with handling. For a minstrel who keeps people on their feet.", line: "Benediction: you and your party close by are healed and shielded." },
  bk_march: { name: "War March", gift: "Rally", desc: "Drum rhythms and road songs, inked in a hurry. For a minstrel who leads a band.", line: "Rally: you and your party close by hit harder, strike faster and move quicker for a few seconds." },
  bk_dissonance: { name: "Dissonance", gift: "Cacophony", desc: "Songs written to be played wrong. For a minstrel who plays alone and does not mind the stares.", line: "Cacophony: a harsh blast hurts and stuns foes around you, and leaves them ringing." },
};
export const bookOf = (id: string): BookInfo | undefined => BOOKS[songBase(id)];
export const isBook = (id: string) => !!bookOf(id);
/** The bound kit items: the evolving lute and the Songbook (no Drop, Sell, Trade or Stash). */
export const isBound = (id: string) => { const b = songBase(id); return b === "songweaver_shield" || b.startsWith("songweaver_weapon"); };
export const isLute = (id: string) => songBase(id).startsWith("songweaver_weapon");
export const isSongbook = (id: string) => songBase(id) === "songweaver_shield";

/** Lute stage by item level (plan: 1-4 / 5-9 / 10-19 / 20-34 / 35+). */
export const LUTE_STAGES: { from: number; name: string; line: string }[] = [
  { from: 1, name: "Minstrel's", line: "A first lute. It plays, and that is enough." },
  { from: 5, name: "Journeyman's", line: "Strung properly, now. It starts to answer you." },
  { from: 10, name: "Fine", line: "A fine lute. Good wood, good voice." },
  { from: 20, name: "Master's", line: "A master's instrument. Heads turn when it is tuned." },
  { from: 35, name: "Virtuoso's", line: "Known by its sound across the land." },
];
export function luteLevel(id: string): number {
  const n = Number(/@(\d+)/.exec((id ?? "").split(/[#^~]/)[0])?.[1] ?? 1);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}
export const luteStage = (level: number) => [...LUTE_STAGES].reverse().find((s) => level >= s.from) ?? LUTE_STAGES[0];
/** Fitted trait ids from `songweaver_weapon@12#steel.wide^...` (the `#trait.trait` segment). */
export function luteTraits(id: string): string[] {
  const m = /#([a-z.]+)/.exec(id ?? "");
  return m ? m[1].split(".").filter((t) => TRAITS[t]) : [];
}

export interface TraitInfo { id: string; name: string; group: "Strings" | "Body" | "Tuning"; level: number; gold: number; mats: Record<string, number>; exotic?: boolean; desc: string }
export const TRAIT_GROUPS: ("Strings" | "Body" | "Tuning")[] = ["Strings", "Body", "Tuning"];
const T = (id: string, name: string, group: TraitInfo["group"], level: number, gold: number, mats: Record<string, number>, desc: string, exotic = false): [string, TraitInfo] => [id, { id, name, group, level, gold, mats, desc, exotic }];
export const TRAITS: Record<string, TraitInfo> = Object.fromEntries([
  T("steel", "Steel Strings", "Strings", 5, 150, { tonewood: 6 }, "Bright metal strings. Your sound waves bounce off a wall once."),
  T("gut", "Gut Strings", "Strings", 5, 150, { tonewood: 6 }, "Warm and soft. Your sound rings foes faster."),
  T("silk", "Silk Strings", "Strings", 18, 600, { silk: 8, tonewood: 10 }, "Spun from silkwretch thread. Your bounces lose nothing.", true),
  T("wide", "Wide Bowl", "Body", 12, 400, { tonewood: 8 }, "A broad, round body. Your Choruses reach farther."),
  T("deep", "Deep Bowl", "Body", 12, 400, { tonewood: 8 }, "A deep, hollow body. Low notes come out stronger."),
  T("horn", "Horn Bowl", "Body", 24, 900, { horn: 8, brass: 10 }, "A tusk-horn body. Chords fill your song gauge faster.", true),
  T("bright", "Bright Tuning", "Tuning", 25, 800, { brass: 6 }, "Tuned high and sweet. Friends gain more from your bright keys."),
  T("dark", "Dark Tuning", "Tuning", 25, 800, { brass: 6 }, "Tuned low and sour. Foes suffer more from your dark keys."),
  T("bonepegs", "Bone Pegs", "Tuning", 30, 1500, { bone: 10, sunglass: 4 }, "Pegs carved from old bone. Your gauge holds longer before it drains, and your book's gift is stronger.", true),
]);

export interface MatInfo { id: string; name: string; desc: string; pick: string; source: string; color: number; accent: number }
export const MATS: Record<string, MatInfo> = Object.fromEntries(([
  ["tonewood", "Tonewood", "Seasoned wood that rings when you tap it. Comes from broken weapons.", "You gather tonewood.", "Break a weapon at Wren.", 0xb88048, 0x5a3a1a],
  ["brass", "Brass", "Bright fittings and tuning pins. Comes from broken shields and books.", "You gather brass.", "Break a shield or book at Wren.", 0xe8c040, 0x8a6a10],
  ["bone", "Bone", "Old, dry bone, smooth as a peg. The restless dead carry it.", "You pick up old bone.", "Skeletons and the Hollow King.", 0xe8e2d0, 0x9a9280],
  ["silk", "Silk", "Fine, strong thread from the webs of silkwretches.", "You gather a hank of silk.", "Silkwretches and the weaver.", 0xf0f0ff, 0x9fb0d8],
  ["horn", "Horn", "A curl of tusk-horn, hollow and deep-voiced.", "You pick up a curl of horn.", "Tusk beasts.", 0xd8c8a0, 0x7a6a40],
  ["sunglass", "Sunglass", "Glass fused by the desert sun. It rings like a bell.", "You find a shard of sunglass.", "The Sunscar.", 0xffb84a, 0xffe9a0],
] as [string, string, string, string, string, number, number][]).map(([id, name, desc, pick, source, color, accent]) => [id, { id, name, desc, pick, source, color, accent }]));
export const MAT_IDS = Object.keys(MATS);
/** A ground item's material id (`mat_silk` -> `silk`), or undefined. */
export const matOfGround = (id: string | undefined): string | undefined => { const m = /^mat_([a-z]+)$/.exec(id ?? ""); return m && MATS[m[1]] ? m[1] : undefined; };

export interface SongInfo { id: string; name: string; prog: string; hint: string; learned: string; line: string; finisher: string; fdesc: string }
/** The four collectable songs (contract ids `song_*`). */
export const SONGS: SongInfo[] = [
  { id: "song_hum", name: "The Gloam's Hum", prog: "I V I", hint: "Something hums in Morwen's jelly. Help her find out why.", learned: "You hum the tune back until you have it. The Gloam's Hum is in your Songbook.", line: "The tune of a thing that remembers.", finisher: "Gloam's Hum", fdesc: "The jelly's old tune, played by you. Foes around you are hurt and left ringing, and you are mended." },
  { id: "song_round", name: "Miller's Round", prog: "I V vi", hint: "Odo the miller likes a good Chorus. Play a bright one near him.", learned: "Odo hums the last bars for you. Miller's Round is in your Songbook.", line: "A round that turns the mill, and the people with it.", finisher: "Miller's Round", fdesc: "A round the whole mill can step to. You and your party close by hit harder and move faster." },
  { id: "song_pond", name: "Mirror Pond Air", prog: "i bII i", hint: "The still water at the Mirror Pond keeps the tune. Play a Chorus on its shore.", learned: "The water gives your tune back, a little changed. Mirror Pond Air is in your Songbook.", line: "A tune and its reflection.", finisher: "Undertow", fdesc: "The pond pulls back. Foes around you are drawn in, slowed and left ringing." },
  { id: "song_lament", name: "The Hollow King's Lament", prog: "i V I", hint: "A king is owed a song. Put the Hollow King to rest.", learned: "You find the last notes in the quiet he leaves behind. The Hollow King's Lament is in your Songbook.", line: "Grief, then a single light at the end.", finisher: "Picardy", fdesc: "A sad tune ends on a bright chord. Foes around you are blasted, and you and your party close by are healed." },
];

export const CANT_WEAPON = "Can't wear: not a musical instrument";
export const CANT_SHIELD = "Can't wear: a minstrel carries a book, not a shield";
export const BOUND_LINE = "Bound. It won't leave your side.";
export const POOR_SHIELD = "Not meant to be read in a fight. As a shield it is a poor one.";

/** Why a Songweaver can't wear this (musical-only rule), or "". `wtype` is the item's weapon type when known. */
export function songCantWear(cls: string | undefined, slot: string | undefined, id: string, wtype?: string): string {
  if (cls !== "songweaver") return "";
  if (slot === "weapon" && !isLute(id) && wtype !== "lute") return CANT_WEAPON;
  if (slot === "shield" && !isBook(id)) return CANT_SHIELD;
  return "";
}

/** Display name of a lute or book (stage name for the evolving lute), or undefined for other items. */
export function songItemName(id: string): string | undefined {
  if (isLute(id)) return `${luteStage(luteLevel(id)).name} Lute`;
  return bookOf(id)?.name;
}

/** Extra tooltip lines for books and the lute (HTML). `cls` is the viewer's class. */
export function songItemHtml(id: string, cls: string | undefined): string {
  const out: string[] = [];
  const book = bookOf(id);
  if (book) {
    out.push(`<span class="glvl">${book.desc}</span>`);
    out.push(`<span class="gok">Full gauge: ${book.line}</span>`); // HOOK(di): content doc section 3
    out.push(cls === "songweaver" ? `<span class="glvl">${isSongbook(id) ? "Yours from the start. It will not leave your side." : "Only a minstrel hears its gift."}</span>` : `<span class="gbad">${POOR_SHIELD}</span>`);
    if (!isSongbook(id)) out.push(`<span class="glvl">Needs a mind for magic to read.</span>`);
  }
  if (isLute(id)) {
    const st = luteStage(luteLevel(id)), tr = luteTraits(id);
    out.push(`<span class="glvl">${st.name} Lute: ${st.line}</span>`);
    out.push(tr.length ? `Fitted: ${tr.map((t) => TRAITS[t].name).join(", ")}.` : "No fittings. Wren can change that.");
  }
  if (isBound(id)) out.push(`<span class="glvl">Bound.</span>`);
  return out.join("<br>");
}

/** Estimated yield of breaking an item at Wren (display only; the server rolls the real one). Weapon -> tonewood, shield/book -> brass. */
export function breakEstimate(id: string, slot: string, tier: number, rarity: number, level: number): { mat: string; n: number } {
  const mat = slot === "weapon" ? "tonewood" : "brass";
  const n = Math.max(1, Math.round((1 + Math.floor(level / 10)) * (0.8 + 0.6 * tier) * (1 + 0.5 * rarity)));
  return { mat, n };
}

// ---- the owner-only "songbook" message -------------------------------------------------------------------------
export interface SongbookState { songs: string[]; mats: Record<string, number> }
let state: SongbookState = { songs: [], mats: {} };
const subs = new Set<() => void>();
/** `"songbook" { songs, mats }`, sent on join and on change. Read defensively. HOOK(di) */
export function setSongbook(m: any) {
  state = {
    songs: Array.isArray(m?.songs) ? m.songs.filter((s: unknown) => typeof s === "string") : [],
    mats: m?.mats && typeof m.mats === "object" ? Object.fromEntries(Object.entries(m.mats).map(([k, v]) => [k, Math.max(0, Math.floor(Number(v) || 0))])) : {},
  };
  subs.forEach((f) => f());
}
export const getSongbook = () => state;
export function onSongbook(f: () => void): () => void { subs.add(f); return () => subs.delete(f); }
