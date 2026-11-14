/**
 * The Songweaver's music (Plan v2, owner-approved 2026-11-13): modes, note progressions (chords) and resonance.
 * Pure rules with no engine or room import, so shared/skillEngine.ts, the server and the balance sims all use them.
 *
 *  - One tonic, A (MIDI 45). A mode recolours it: the server sends the degree and the mode, the client sets the pitch.
 *  - Modes split a cast's power in two (MODES): `ally` scales heals, shields and buffs, `foe` scales damage. Major is
 *    known from Lv 1, Minor comes with Dirge, Lydian / Dorian / Phrygian with their tree nodes. Modulate cycles them.
 *  - Every Songweaver skill is a note (SkillDef.degree). The last NOTES.keep notes are kept; when they spell one of the
 *    PROGRESSIONS, its finisher fires by itself, then chords lock for NOTES.lockMs. Order counts, timing doesn't, so
 *    network delay never matters. Notes are forgotten after NOTES.idleMs without one, and on death.
 *  - Resonance: a 0..100 counter on whoever a sound hit lands on (server-side only, in SkillRuntime). The right pitch
 *    and intervals (a fifth or an octave after the previous note) build it faster; it fades after a short pause; at 100
 *    it bursts (at most once a second per target). Spreading it (Sympathetic Strings) never sets off a burst by itself.
 */

export type ModeId = "major" | "minor" | "lydian" | "dorian" | "phrygian";
export const MODE_IDS: ModeId[] = ["major", "minor", "lydian", "dorian", "phrygian"];
export type Degree = "I" | "i" | "ii" | "bII" | "IV" | "V" | "vi";
export const DEGREES: Degree[] = ["I", "i", "ii", "bII", "IV", "V", "vi"];
export type Pitch = "L" | "M" | "H" | "any";
/** Major and Lydian sound bright, Minor, Dorian and Phrygian dark: a monster's mode affinity matches the family. */
export type ModeFamily = "major" | "minor";

export interface ModeDef {
  name: string;
  family: ModeFamily;
  ally: number; // x heals, shields and buff strength
  foe: number; // x damage
  /** Skill whose rank unlocks it (none = known from the start; Minor needs Dirge). */
  skill?: string;
  /** Per rank of `skill`, % strength of its colour: Lydian overheal to shield, Dorian song radius, Phrygian poise and resonance. */
  perRank?: number;
}
export const MODES: Record<ModeId, ModeDef> = {
  major: { name: "Major", family: "major", ally: 1.15, foe: 0.9 },
  minor: { name: "Minor", family: "minor", ally: 0.9, foe: 1.15, skill: "sg_dirge" },
  // overheal becomes a shield (30% of the overflow, +10% per rank above 1)
  lydian: { name: "Lydian", family: "major", ally: 1.2, foe: 0.85, skill: "sg_lydian", perRank: 10 },
  // neutral, both colours: songs reach 20% further (+10% per rank above 1)
  dorian: { name: "Dorian", family: "minor", ally: 1, foe: 1, skill: "sg_dorian", perRank: 10 },
  // dark and sharp: +30% poise drain and +25% resonance (+10% each per rank above 1)
  phrygian: { name: "Phrygian", family: "minor", ally: 0.85, foe: 1.2, skill: "sg_phrygian", perRank: 10 },
};
export const LYDIAN_SHIELD = { share: 0.3, maxPct: 30, ms: 6000 }; // overflow share, pool cap (% of the target's max HP)
export const DORIAN_RADIUS = 0.2;
export const PHRYGIAN = { poise: 0.3, res: 0.25 };
export const isMode = (v: unknown): v is ModeId => typeof v === "string" && (MODE_IDS as string[]).includes(v);

/** Modes a hero knows from their skill ranks (`rank(id)`): Major always, the others with their skill. */
export function knownModes(rank: (id: string) => number): ModeId[] {
  return MODE_IDS.filter((m) => !MODES[m].skill || rank(MODES[m].skill!) > 0);
}
/** Strength of a mode's colour for this hero: 1 + perRank% x (rank - 1) of its skill. */
export function modeColour(mode: ModeId, rank: (id: string) => number): number {
  const d = MODES[mode];
  return d.skill && d.perRank ? 1 + d.perRank / 100 * Math.max(0, rank(d.skill) - 1) : 1;
}

/** Modulate: the next known mode after the current one (wrapping). Needs at least two known modes. */
export function modulate(sk: { mode?: ModeId }, known: ModeId[]): ModeId | undefined {
  if (known.length < 2) return undefined;
  const cur = known.indexOf(sk.mode ?? "major");
  sk.mode = known[(cur + 1) % known.length];
  return sk.mode;
}

// ---- Notes and chords ------------------------------------------------------------------------------------

export const NOTES = { keep: 3, lockMs: 12_000, idleMs: 10_000 };
/** Songs (SkillDef.song): one per Songweaver, 30s, and a change of song waits this long after the last one. */
export const SONG = { ms: 30_000, changeMs: 2000, tickFloorMs: 500 };

/** The chords she knows from the start, then the ones collected songs teach (shared/songbook.ts SONG_SOURCES). */
export type ProgId = "amen" | "encore" | "shatter" | "resolve" | "sleight" | "hum" | "round" | "undertow" | "picardy";
export interface Progression { id: ProgId; name: string; notes: [Degree, Degree, Degree]; skill: string }
export const PROGRESSIONS: Progression[] = [
  { id: "amen", name: "Amen", notes: ["vi", "IV", "I"], skill: "sg_f_amen" }, // heal and shield
  { id: "encore", name: "Turnaround", notes: ["ii", "V", "I"], skill: "sg_f_encore" }, // party damage and attack speed
  { id: "shatter", name: "Neapolitan", notes: ["bII", "V", "i"], skill: "sg_f_shatter" }, // damage, stun, +50 resonance
  { id: "resolve", name: "Perfect", notes: ["IV", "V", "I"], skill: "sg_f_resolve" }, // heal and damage, +30 resonance
  { id: "sleight", name: "Deceptive", notes: ["IV", "V", "vi"], skill: "sg_f_sleight" }, // untouchable, fear
];

export interface NoteState { notes: Degree[]; noteAt: number; chordLock: number }

/** Forget the notes (death, or NOTES.idleMs without one). The lockout stays. */
export function resetNotes(sk: NoteState) { sk.notes = []; }

/**
 * A note was played: keep the last NOTES.keep, forget them after a long pause. Returns the progression of `progs`
 * (default: the ones known from the start; shared/songbook.ts progressionsFor adds collected songs) they complete,
 * and starts the lockout, unless chords are locked.
 */
export function noteCast(sk: NoteState, deg: Degree, now: number, progs: Progression[] = PROGRESSIONS): Progression | undefined {
  if (now - sk.noteAt > NOTES.idleMs) sk.notes = [];
  sk.notes = [...sk.notes, deg].slice(-NOTES.keep);
  sk.noteAt = now;
  if (now < sk.chordLock || sk.notes.length < NOTES.keep) return undefined;
  const p = progs.find((x) => x.notes.every((n, i) => n === sk.notes[i]));
  if (!p) return undefined;
  sk.chordLock = now + NOTES.lockMs;
  sk.notes = [];
  return p;
}

/**
 * How far the latest notes are into a progression (DI-1 rings, `ch1` / `ch2` in statusOf): the longest run of the
 * most recent notes that is the start of one of `progs` (default: every PROGRESSIONS). 0 = none. A full match fires
 * its chord at once, so this stays below each progression's length.
 */
export function chordProgress(sk: { notes: Degree[] }, progs: { notes: Degree[] }[] = PROGRESSIONS): number {
  let best = 0;
  for (const p of progs) for (let k = Math.min(sk.notes.length, p.notes.length - 1); k > best; k--) {
    const tail = sk.notes.slice(-k);
    if (tail.every((n, i) => n === p.notes[i])) { best = k; break; }
  }
  return best;
}

/** The Songweaver's skill kinds (DI-4): songs are Choruses, Modulate a Key change, every other note a Verse. */
export type SongKind = "Chorus" | "Verse" | "Key change";
/** Player-facing kind of a skill; undefined for passives and for skills that are not notes (other classes, hidden ones). */
export function songKind(s: { song?: boolean; modulate?: boolean; passive?: unknown; degree?: string }): SongKind | undefined {
  if (s.passive) return undefined;
  if (s.song) return "Chorus";
  if (s.modulate) return "Key change";
  return s.degree ? "Verse" : undefined;
}

// ---- The song gauge (DI-3, owner 2026-11-14: it replaces Mana and Tempo) ------------------------------------------

/**
 * The Songweaver's gauge lives in `mana` / `maxMana` (shared/mana.ts usesGauge): it starts empty and never regenerates.
 * Notes, landed basic waves, chords and executions fill it; after `idleMs` with no note and no swing it drains. When it
 * is full the equipped book's effect fires (GearDef.book.full, the "swell" event) and it empties. Twelve-Tone Storm
 * spends it instead. Accelerando reads its fill: a full gauge counts as `accelStacks` of the old Tempo.
 */
export const GAUGE = {
  max: 100,
  note: 8, // a note that sounded (a charged skill: when it goes off)
  basic: 2, // a landed basic wave
  strum: 4, // ...the strum (third step of the combo)
  chord: 20,
  execute: 10, // executing a broken monster (shared/combat.ts EXECUTE)
  idleMs: 4000, // no note and no swing for this long: it drains
  drainPerSec: 20,
  refreshMs: 10_000, // casting the Chorus that plays again with more than this left: no note, no fill
  stormBase: 0.7, stormPerFill: 0.6, // Twelve-Tone Storm power x(stormBase + stormPerFill x fill / max)
  accelStacks: 5,
};

// ---- Resonance ----------------------------------------------------------------------------------------------

/** Semitones above the tonic, for intervals. */
export const SEMITONE: Record<Degree, number> = { I: 0, i: 0, bII: 1, ii: 2, IV: 5, V: 7, vi: 9 };
/** A fifth (or its inversion, a fourth) or an octave (the same note at another pitch) between two notes. */
export function consonant(a: { deg?: Degree; pitch?: Pitch }, b: { deg?: Degree; pitch?: Pitch }): boolean {
  if (!a.deg || !b.deg) return false;
  const d = Math.abs(SEMITONE[a.deg] - SEMITONE[b.deg]) % 12;
  return d === 5 || d === 7 || (d === 0 && !!a.pitch && !!b.pitch && a.pitch !== b.pitch && a.pitch !== "any" && b.pitch !== "any");
}

export const RESONANCE = {
  max: 100,
  perHit: 14, // a skill's sound hit
  basic: 9, // a basic wave (the strum: x2)
  tick: 5, // a song or field tick
  interval: 1.5, // x after a fifth or an octave
  decayAfterMs: 2000,
  decayPerSec: 40,
  burstEveryMs: 1000, // at most one burst per target per second
  burstDmg: 30, // x the Songweaver's Magic multiplier, x the target's tier damage
  shatterMult: 2, // fragile targets shatter: x this, and a stun
  shatterStunMs: 700,
  spread: 35, // Sympathetic Strings: a burst gives this to foes close by (x rank colour), never past spreadCap
  spreadR: 64,
  spreadCap: 99,
  metal: 20, // a wave off a well or an anvil carries this much more
};

export interface ResState { res: number; resAt: number; resBurstAt: number; resDeg?: Degree; resPitch?: Pitch }

/** Current resonance after its fade (it starts fading RESONANCE.decayAfterMs after the last gain). */
export function resonanceOf(sk: ResState, now: number): number {
  if (sk.res <= 0) return 0;
  const idle = now - sk.resAt - RESONANCE.decayAfterMs;
  return idle > 0 ? Math.max(0, sk.res - RESONANCE.decayPerSec * idle / 1000) : sk.res;
}

/**
 * Adds resonance to a target. `amount` already carries the target's sensitivity (shared/combat.ts soundMult); the
 * interval bonus is worked out here from the previous note that rang in it. Returns true when it bursts (the counter
 * goes back to 0). A spread (`o.spread`) never bursts: it stops just below the top.
 */
export function addResonance(sk: ResState, amount: number, now: number, o: { deg?: Degree; pitch?: Pitch; spread?: boolean } = {}): boolean {
  if (amount <= 0) return false;
  let cur = resonanceOf(sk, now);
  if (!o.spread && consonant({ deg: sk.resDeg, pitch: sk.resPitch }, o)) amount *= RESONANCE.interval;
  if (!o.spread && o.deg) { sk.resDeg = o.deg; sk.resPitch = o.pitch; }
  cur += amount;
  sk.resAt = now;
  if (o.spread) { sk.res = Math.min(cur, Math.max(RESONANCE.spreadCap, resonanceOf(sk, now))); return false; }
  if (cur >= RESONANCE.max && now - sk.resBurstAt >= RESONANCE.burstEveryMs) {
    sk.res = 0; sk.resBurstAt = now;
    return true;
  }
  sk.res = Math.min(RESONANCE.max, cur);
  return false;
}

/** Status word for the client (`res1`..`res3`), "" below 1. */
export function resWord(v: number): string {
  return v < 1 ? "" : v < 34 ? "res1" : v < 67 ? "res2" : "res3";
}

/** Save format of the Songweaver's tree (server/accounts.ts swTree): a mismatch refunds every skill point. */
export const SONGWEAVER_TREE = 1;
