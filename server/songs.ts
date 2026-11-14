import { isMode, MODES, SONGWEAVER_TREE, type ModeId } from "../shared/songs";
import { knownModesOf, type ShotSpec, type SkillRuntime, type Unit } from "../shared/skillEngine";
import { skillById, type AreaDef, type FieldDef, type HitEffects, type SkillDef } from "../shared/skills";
import { BOUNCE, BOUNCE_RULES, reflectAxis, wallAt } from "../shared/acoustics";
import { BUSKING, BUSKING_LINES, npcById, type Npc } from "../shared/npcs";
import { BAG_SIZE, gearName, isBagItem, starterKit } from "../shared/gear";
import { potionSlots, type Potions } from "../shared/potions";
import { sellPrice } from "../shared/shops";

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
 * mode (Major or Lydian). Modulate is always allowed, into any mode: changing key touches nobody (orchestrator,
 * 2026-11-13). Songs in a minor mode and Discord still break the "no magic" rule, and so does a finisher with an enemy
 * part that the cast set off (`chord`, from castSkill's CastOut), even when every note before it was lawful.
 */
export function busking(cls: string, mode: ModeId | undefined, s: SkillDef, chord?: string): boolean {
  if (cls !== "songweaver") return false;
  const fin = chord ? skillById(chord) : undefined;
  if (fin && foeEffect(fin)) return false;
  if (s.modulate) return true;
  return MODES[mode ?? "major"].family === "major" && s.branch !== 2 && !s.finisher && !foeEffect(s);
}

/**
 * Oakvale's villagers answer a busking tune (shared/npcs.ts BUSKING_LINES): a Hymnal or Folk song that busking() allows
 * (Modulate is not a song) makes the nearest villager within BUSKING.range who has a line say it, each villager at most
 * once per BUSKING.cooldownMs, so a Songweaver standing on the square can't make them chatter.
 */
export class BuskingLines {
  private next = new Map<string, number>();
  /** After a cast went through (`chord`: the finisher it set off); `say` gets the villager and its line. */
  heard(cls: string, mode: ModeId | undefined, s: SkillDef, x: number, y: number, now: number, say: (n: Npc, text: string) => void, chord?: string) {
    if (s.modulate || !busking(cls, mode, s, chord)) return;
    let best: Npc | undefined, bd = BUSKING.range;
    for (const id of Object.keys(BUSKING_LINES)) {
      const n = npcById(id), d = n ? Math.hypot(n.x - x, n.y - y) : Infinity;
      if (n && d <= bd && (this.next.get(id) ?? 0) <= now) { best = n; bd = d; }
    }
    if (!best) return;
    this.next.set(best.id, now + BUSKING.cooldownMs);
    say(best, BUSKING_LINES[best.id]);
  }
}

/**
 * Who hears a villager's busking line: heroes within BUSKING.hearRange of the villager, and always the Songweaver
 * (`singer`) who played. The line is local chatter, so the rest of the server doesn't get it.
 */
export function buskingAudience(n: Npc, singer: string, heroes: Iterable<[string, { x: number; y: number }]>): Set<string> {
  const out = new Set([singer]);
  for (const [id, h] of heroes) if (Math.hypot(h.x - n.x, h.y - n.y) <= BUSKING.hearRange) out.add(id);
  return out;
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

// ---- Waves bounce off walls (Plan v2) ----------------------------------------------------------------------------

/** The projectile fields a bounce reads and turns (server TownRoom Projectile). */
export interface BounceShot { x: number; y: number; vx: number; vy: number; dir: string; traveled: number; bounced: number; bouncedAt: number; damage: number; spec?: ShotSpec }

/**
 * A wave that may still bounce (ShotSpec.bounce) ran into a wall between (px, py) and where it is: off stone, wood and
 * metal it turns back along the blocked axis (shared/acoustics.ts, two isSolidAt lookups), weaker by the material, and
 * a "bounce" event goes out; foliage and water swallow it. Needs BOUNCE_RULES.minFlight px since the last bounce, at
 * most BOUNCE_RULES.max. True when it bounced.
 */
export function bounceWave(s: BounceShot, px: number, py: number, emit: (ev: Record<string, unknown>) => void): boolean {
  const spec = s.spec;
  if (!spec?.bounce || s.bounced >= Math.min(BOUNCE_RULES.max, spec.bounce) || (s.bounced && s.traveled - s.bouncedAt < BOUNCE_RULES.minFlight)) return false;
  const mat = wallAt(s.x, s.y), fall = BOUNCE[mat];
  if (!fall) return false;
  const { fx, fy } = reflectAxis(px, py, s.x, s.y);
  s.x = px; s.y = py;
  if (fx) s.vx = -s.vx;
  if (fy) s.vy = -s.vy;
  s.dir = Math.abs(s.vx) > Math.abs(s.vy) ? (s.vx > 0 ? "right" : "left") : s.vy > 0 ? "down" : "up";
  s.bounced++; s.bouncedAt = s.traveled;
  spec.vx = s.vx; spec.vy = s.vy; spec.dmg *= fall.dmg; s.damage *= fall.dmg;
  if (fall.res && spec.sound) spec.sound = { ...spec.sound, res: (spec.sound.res ?? 0) + fall.res };
  emit({ ev: "bounce", x: Math.round(px), y: Math.round(py), mat });
  return true;
}

// ---- Hearing ---------------------------------------------------------------------------------------------------

/** How heroes and monsters hear: the rule lives in shared/combat.ts, so the sims use the same one. */
export { heroSound, mobSound } from "../shared/combat";

// ---- Saves (server/accounts.ts swTree / swMode) ---------------------------------------------------------------------

/** Save fields of a Songweaver (none for other classes). */
export function songSave(cls: string, sk: SkillRuntime): { swTree?: number; swMode?: string; swKit?: number } {
  return cls === "songweaver" ? { swTree: SONGWEAVER_TREE, swMode: sk.mode ?? "major", swKit: SW_KIT_VERSION } : {};
}

// ---- Kit migrations (docs/songweaver-di-plan.md "State and saves") ---------------------------------------------------

/** Save format of the Songweaver's kit (save field swKit). 1: the Songbook sits in the shield slot (DI-3). */
export const SW_KIT_VERSION = 1;

/** What a hero needs for migrateSongweaver: the class, potions (they take bag slots) and gold (a sold item pays). */
export interface KitHero { cls: string; gold: number; pots: Potions }
/** The parts of a save it moves (server/accounts.ts HeroSave). */
export interface KitSave { shield?: unknown; bag?: unknown; swKit?: unknown }

/**
 * Brings an older Songweaver save up to SW_KIT_VERSION. Runs in TownRoom.restore BEFORE the gear filter, on the save
 * itself, so nothing she owned is lost. v1: the shield she wore goes to the bag; with the bag full, to the stash
 * (`toStash`, false when it is full too); else it is sold at sellPrice. The Songbook takes the shield slot. Returns
 * chat lines for her, one per moved item.
 */
export function migrateSongweaver(p: KitHero, s: KitSave, toStash: (item: string) => boolean): string[] {
  if (p.cls !== "songweaver" || (typeof s.swKit === "number" && s.swKit >= SW_KIT_VERSION)) return [];
  const notes: string[] = [], book = starterKit("songweaver").shield!;
  const bag = Array.isArray(s.bag) ? s.bag.filter((v): v is string => isBagItem(v) && v !== book) : [];
  const old = typeof s.shield === "string" && s.shield !== book && isBagItem(s.shield) ? s.shield : "";
  if (old) {
    const name = gearName(old, p.cls);
    if (bag.length + potionSlots(p.pots) < BAG_SIZE) { bag.push(old); notes.push(`Your ${name} went to your bag: a Songweaver carries her Songbook in that hand now.`); }
    else if (toStash(old)) notes.push(`Your bag was full, so your ${name} went to your stash: a Songweaver carries her Songbook in that hand now.`);
    else { const g = sellPrice(old); p.gold += g; notes.push(`Your bag and stash were full, so your ${name} was sold for ${g} gold: a Songweaver carries her Songbook in that hand now.`); }
  }
  s.bag = bag; s.shield = book; s.swKit = SW_KIT_VERSION;
  return notes;
}
/** A save from another tree version gets every skill point back (like the Summoner's suTree). */
export const oldSongTree = (cls: string, swTree: unknown) => cls === "songweaver" && swTree !== SONGWEAVER_TREE;
/**
 * After a skill reset: the mode must still be known (else Major), and a running song ends, since every song is a tree
 * skill she just unlearned (otherwise it would keep playing in the old mode, e.g. a Phrygian aura with no Discord).
 */
export function afterRespec(u: Unit) {
  if (u.cls !== "songweaver") return;
  restoreMode(u, u.sk.mode);
  if (u.sk.song) { u.sk.song.f.until = 0; u.sk.song = undefined; }
}
/** The saved mode, if the hero still knows it (a refund or an unknown value falls back to Major). */
export function restoreMode(u: Unit, swMode: unknown) {
  if (u.cls !== "songweaver") return;
  u.sk.mode = isMode(swMode) && knownModesOf(u).includes(swMode) ? swMode : "major";
}

/** What a Songweaver is told when she reaches for a mana potion (sent as "gearno"): her bubble is the song gauge. */
export const SONG_POTION_TEXT = "Your song gauge fills with music, not potions";
