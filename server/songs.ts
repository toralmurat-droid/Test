import { MOB_COMBAT, type SoundProfile } from "../shared/combat";
import type { MobKind } from "../shared/constants";
import { isMode, MODES, SONGWEAVER_TREE, type ModeId } from "../shared/songs";
import { knownModesOf, type SkillRuntime, type Unit } from "../shared/skillEngine";
import type { AreaDef, FieldDef, HitEffects, SkillDef } from "../shared/skills";

/**
 * The Songweaver's room-side rules (shared/songs.ts holds the music itself): the Oakvale busking exemption, the
 * owner-only "chord" message, the save fields and how heroes and monsters hear. Kept out of TownRoom.ts.
 */

// ---- Oakvale: busking is allowed (owner decision 12, 2026-11-13) ------------------------------------------------

const hurts = (e?: HitEffects & { wpn?: number; dmg?: number }) =>
  !!e && !!(e.wpn || e.dmg || e.stunMs || e.slowMs || e.fearMs || e.weakMs || e.markMs || e.burn || e.pull || e.kb);
/** Does the skill touch an enemy at all (damage, crowd control, a push)? */
export function foeEffect(s: SkillDef): boolean {
  const field = (f?: FieldDef) => !!f && (hurts(f) || !!f.zap || !!f.turret || !!f.burst || !!f.hole || !!f.link);
  return !!(s.areas?.some((a: AreaDef) => hurts(a)) || s.shots || hurts(s.cry) || field(s.field) || s.counter || s.move?.path || s.charm || s.devour || s.bite);
}

/**
 * A Songweaver may play in Oakvale without turning outlaw: a Hymnal or Folk skill that touches no enemy, in a bright
 * mode (Major or Lydian), and Modulate into one. Minor modes and Discord still break the "no magic" rule.
 */
export function busking(cls: string, mode: ModeId | undefined, s: SkillDef): boolean {
  if (cls !== "songweaver" || MODES[mode ?? "major"].family !== "major") return false;
  return !!s.modulate || (s.branch !== 2 && !s.finisher && !foeEffect(s));
}

// ---- The owner-only "chord" message: { notes, mode, lockMs }, sent when it changes -------------------------------

export interface ChordMsg { notes: string[]; mode: ModeId; lockMs: number }
/** What the Songweaver's own HUD shows: the notes so far, the mode, how long chords stay locked. */
export function chordMsg(sk: SkillRuntime, now: number): ChordMsg {
  return { notes: [...sk.notes], mode: sk.mode ?? "major", lockMs: Math.max(0, Math.round(sk.chordLock - now)) };
}
const sigOf = (sk: SkillRuntime, now: number) => `${sk.notes.join(" ")}|${sk.mode ?? "major"}|${now < sk.chordLock ? sk.chordLock : 0}`;

/** Remembers what each Songweaver was last told, so the message only goes out when something changed. */
export class ChordSync {
  private last = new Map<string, string>();
  /** Call every tick for every hero; `send` gets the message when this Songweaver's chord state changed. */
  tick(id: string, u: Unit, now: number, send: (m: ChordMsg) => void) {
    if (u.cls !== "songweaver") return;
    const sig = sigOf(u.sk, now);
    if (this.last.get(id) === sig) return;
    this.last.set(id, sig);
    send(chordMsg(u.sk, now));
  }
  drop(id: string) { this.last.delete(id); }
}

// ---- Hearing ---------------------------------------------------------------------------------------------------

/** How a hero hears: normal; the Songweaver has Trained Ear (half the resonance on herself). */
export const heroSound = (cls: string): SoundProfile => (cls === "songweaver" ? { tier: "normal", ear: true } : { tier: "normal" });
/** How a monster hears (MOB_COMBAT sound); bosses resonate at half. */
export const mobSound = (kind: MobKind, boss: boolean): SoundProfile => (boss ? { ...MOB_COMBAT[kind].sound, boss } : MOB_COMBAT[kind].sound);

// ---- Saves (server/accounts.ts swTree / swMode) ---------------------------------------------------------------------

/** Save fields of a Songweaver (none for other classes). */
export function songSave(cls: string, sk: SkillRuntime): { swTree?: number; swMode?: string } {
  return cls === "songweaver" ? { swTree: SONGWEAVER_TREE, swMode: sk.mode ?? "major" } : {};
}
/** A save from another tree version gets every skill point back (like the Summoner's suTree). */
export const oldSongTree = (cls: string, swTree: unknown) => cls === "songweaver" && swTree !== SONGWEAVER_TREE;
/** The saved mode, if the hero still knows it (a refund or an unknown value falls back to Major). */
export function restoreMode(u: Unit, swMode: unknown) {
  if (u.cls !== "songweaver") return;
  u.sk.mode = isMode(swMode) && knownModesOf(u).includes(swMode) ? swMode : "major";
}
