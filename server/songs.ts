import { isMode, MODES, SONGWEAVER_TREE, type ModeId } from "../shared/songs";
import { knownModesOf, luteHas, type ShotSpec, type SkillRuntime, type Unit } from "../shared/skillEngine";
import { LUTE_FX } from "../shared/lute";
import type { SoundFx } from "../shared/skills";
import { skillById, type AreaDef, type FieldDef, type HitEffects, type SkillDef } from "../shared/skills";
import { BOUNCE, BOUNCE_RULES, reflectAxis, wallAt } from "../shared/acoustics";
import { BUSKING, BUSKING_LINES, npcById, type Npc } from "../shared/npcs";
import { isSongId, ODO_LINES, pondShore, SONG_SOURCES, type SongDef, type SongId } from "../shared/songbook";
import { isMaterial, type MaterialId } from "../shared/lute";
import { BAG_SIZE, gearName, isBagItem, isBook, isLute, luteAtLevel, starterKit } from "../shared/gear";
import { potionSlots, type Potions } from "../shared/potions";
import { sellPrice } from "../shared/shops";
import { STASH_SIZE } from "../shared/trade";

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

/**
 * The projectile fields a bounce reads and turns (server TownRoom Projectile). `bounces`: walls a basic wave may bounce
 * off (Steel Strings; a skill wave keeps it in spec.bounce); `keep`: bounces lose no damage (Silk Strings).
 */
export interface BounceShot { x: number; y: number; vx: number; vy: number; dir: string; traveled: number; bounced: number; bouncedAt: number; damage: number; spec?: ShotSpec;
  bounces?: number; keep?: boolean; sound?: SoundFx }

/** A Songweaver's wave takes her lute's strings (DI-5): Steel lets a basic wave bounce, Silk keeps a bounce's damage. */
export function stringShot(s: BounceShot, u: Unit | undefined, basic: boolean) {
  if (basic && luteHas(u, "steel")) s.bounces = LUTE_FX.steelBounce;
  if (luteHas(u, "silk")) s.keep = true;
}

/**
 * A wave that may still bounce (ShotSpec.bounce) ran into a wall between (px, py) and where it is: off stone, wood and
 * metal it turns back along the blocked axis (shared/acoustics.ts, two isSolidAt lookups), weaker by the material, and
 * a "bounce" event goes out; foliage and water swallow it. Needs BOUNCE_RULES.minFlight px since the last bounce, at
 * most BOUNCE_RULES.max. True when it bounced.
 */
export function bounceWave(s: BounceShot, px: number, py: number, emit: (ev: Record<string, unknown>) => void): boolean {
  const spec = s.spec, max = spec ? spec.bounce ?? 0 : s.bounces ?? 0;
  if (!max || s.bounced >= Math.min(BOUNCE_RULES.max, max) || (s.bounced && s.traveled - s.bouncedAt < BOUNCE_RULES.minFlight)) return false;
  const mat = wallAt(s.x, s.y), fall = BOUNCE[mat];
  if (!fall) return false;
  const { fx, fy } = reflectAxis(px, py, s.x, s.y);
  s.x = px; s.y = py;
  if (fx) s.vx = -s.vx;
  if (fy) s.vy = -s.vy;
  s.dir = Math.abs(s.vx) > Math.abs(s.vy) ? (s.vx > 0 ? "right" : "left") : s.vy > 0 ? "down" : "up";
  s.bounced++; s.bouncedAt = s.traveled;
  const loss = s.keep ? 1 : fall.dmg;
  s.damage *= loss;
  if (spec) { spec.vx = s.vx; spec.vy = s.vy; spec.dmg *= loss; }
  if (fall.res && spec?.sound) spec.sound = { ...spec.sound, res: (spec.sound.res ?? 0) + fall.res };
  else if (fall.res && !spec && s.sound) s.sound = { ...s.sound, res: (s.sound.res ?? 0) + fall.res };
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

/**
 * Save format of the Songweaver's kit (save field swKit). 1: the Songbook sits in the shield slot (DI-3). 2: the
 * musical-only rule and the evolving lute (DI-5): her weapon slot holds her lute, at her level. 3: collected songs
 * (DI-2): a save from before gets the songs of the quests it had already finished (SongCollector.load).
 */
export const SW_KIT_VERSION = 3;

/** What a hero needs for migrateSongweaver: the class, her level (the lute's), potions (they take bag slots) and gold (a sold item pays). */
export interface KitHero { cls: string; level: number; gold: number; pots: Potions }
/** The parts of a save it moves (server/accounts.ts HeroSave). */
export interface KitSave { weapon?: unknown; shield?: unknown; bag?: unknown; swKit?: unknown }

/**
 * Puts an item she can't keep in her hands where it is not lost: the bag while it has room (`bag` is changed), else
 * the stash (`toStash`, false when it is full too), else it is sold at sellPrice. Returns the chat line, `why` ending it.
 */
export function stowItem(p: KitHero, bag: string[], item: string, toStash: (item: string) => boolean, why: string): string {
  const name = gearName(item, p.cls);
  if (bag.length + potionSlots(p.pots) < BAG_SIZE) { bag.push(item); return `Your ${name} went to your bag: ${why}`; }
  if (toStash(item)) return `Your bag was full, so your ${name} went to your stash: ${why}`;
  const g = sellPrice(item);
  p.gold += g;
  return `Your bag and stash were full, so your ${name} was sold for ${g} gold: ${why}`;
}
/** The account stash as the kit rules see it: put an item in (false when full), take out the first one that matches. */
export interface KitStash { put(item: string): boolean; take(match: (item: string) => boolean): string | undefined }
type StashData = { items: string[]; gold: number };
/**
 * A KitStash over the account stash, loaded on first use. `loaded`: the copy to write back with the hero
 * (accounts.saveStash), undefined when nothing touched it; `peek` reads without loading it for writing.
 */
export class LazyStash implements KitStash {
  loaded?: StashData;
  constructor(private load: () => StashData) {}
  private get st() { return (this.loaded ??= this.load()); }
  put(item: string) {
    if (this.st.items.length >= STASH_SIZE) return false;
    this.st.items.push(item);
    return true;
  }
  take(match: (item: string) => boolean) {
    const i = this.st.items.findIndex(match);
    return i < 0 ? undefined : this.st.items.splice(i, 1)[0];
  }
  peek(): readonly string[] { return (this.loaded ?? this.load()).items; }
}
const WHY_BOOK = "a Songweaver carries her Songbook in that hand now.";
const WHY_LUTE = "a minstrel carries a lute and a book.";

/**
 * Brings an older Songweaver save up to SW_KIT_VERSION. Runs in TownRoom.restore BEFORE the gear filter, on the save
 * itself, so nothing she owned is lost (stowItem: bag, else stash, else sold). Returns chat lines, one per moved item.
 *  - v1: the shield she wore is stowed; the Songbook takes the shield slot.
 *  - v2: a weapon that is not her lute is stowed, and so is a shield that is not a book (the Songbook comes back to the
 *    slot); her lute goes back in her hands (from the bag, else the stash, else a new one) at her level, so no second
 *    lute is made while one waits in the stash.
 */
export function migrateSongweaver(p: KitHero, s: KitSave, stash: KitStash): string[] {
  const toStash = (item: string) => stash.put(item);
  const ver = typeof s.swKit === "number" ? s.swKit : 0;
  if (p.cls !== "songweaver" || ver >= SW_KIT_VERSION) return [];
  const notes: string[] = [], kit = starterKit("songweaver"), book = kit.shield!;
  let bag = Array.isArray(s.bag) ? s.bag.filter((v): v is string => isBagItem(v)) : [];
  const worn = (v: unknown) => (typeof v === "string" && isBagItem(v) ? v : "");
  if (ver < 1) {
    const old = worn(s.shield);
    if (old && old !== book) notes.push(stowItem(p, bag, old, toStash, WHY_BOOK));
    s.shield = book;
  }
  if (ver < 2) {
    const sh = worn(s.shield);
    if (sh && !isBook(sh)) { notes.push(stowItem(p, bag, sh, toStash, WHY_LUTE)); s.shield = book; }
    if (!worn(s.shield)) s.shield = book;
    let lute = worn(s.weapon);
    if (lute && !isLute(lute)) { notes.push(stowItem(p, bag, lute, toStash, WHY_LUTE)); lute = ""; }
    if (!lute) { // the lute she put away comes back to her hands; a lost one is made anew
      const k = bag.findIndex((v) => isLute(v)), st = k < 0 ? stash.take(isLute) : undefined;
      lute = k >= 0 ? bag.splice(k, 1)[0] : st ?? kit.weapon!;
      if (st) notes.push(`Your ${gearName(st, p.cls)} came out of your stash into your hands: ${WHY_LUTE}`);
    }
    const loose: string[] = [];
    s.weapon = luteAtLevel(lute, p.level, loose);
    for (const r of loose) notes.push(stowItem(p, bag, r, toStash, "your lute had fewer sockets."));
  }
  if (s.shield === book) bag = bag.filter((v) => v !== book); // the Songbook in her hand is not in her bag too
  s.bag = bag; s.swKit = SW_KIT_VERSION;
  return notes;
}

/**
 * Her lute follows her level (DI-5): the worn one and any in the bag are rewritten (on level-up and login). Runes past
 * the stage's sockets come out into `loose`. Returns true when something changed (the caller re-applies stats).
 */
export function relevelLute(p: { cls: string; level: number; weapon: string }, bag: string[], loose: string[]): boolean {
  if (p.cls !== "songweaver") return false;
  let changed = false;
  if (isLute(p.weapon)) { const v = luteAtLevel(p.weapon, p.level, loose); if (v !== p.weapon) { p.weapon = v; changed = true; } }
  for (let i = 0; i < bag.length; i++) if (isLute(bag[i])) { const v = luteAtLevel(bag[i], p.level, loose); if (v !== bag[i]) { bag[i] = v; changed = true; } }
  return changed;
}

/**
 * The lost-kit fallback, on every load: a Songweaver's hands take only a lute and a book (gear.ts wearProblem), and a
 * lute whose id no longer checks out (isGearId) is dropped on load, so one with no lute anywhere (worn, bag, `stashed`)
 * gets the starter lute back at her level, and one with no book anywhere gets the Songbook in her shield slot. Only
 * fills an empty slot. Returns chat lines.
 */
export function refillKit(p: { cls: string; level: number; weapon: string; shield: string }, bag: readonly string[], stashed: readonly string[]): string[] {
  if (p.cls !== "songweaver") return [];
  const kit = starterKit("songweaver"), all = [p.weapon, p.shield, ...bag, ...stashed], out: string[] = [];
  if (!p.weapon && !all.some(isLute)) {
    p.weapon = luteAtLevel(kit.weapon!, p.level, []);
    out.push(`Your lute was lost, so a new ${gearName(p.weapon, p.cls)} is in your hands.`);
  }
  if (!p.shield && !all.some(isBook)) {
    p.shield = kit.shield!;
    out.push(`Your Songbook was lost, so a new one is in your hand.`);
  }
  return out;
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

// ---- Collected songs and materials (DI-2 / DI-5; shared/songbook.ts, shared/lute.ts) -------------------------------

/** The owner-only "songbook" message: the songs she collected and her material counters. Sent on join and on change. */
export interface SongbookMsg { songs: string[]; mats: Record<string, number> }
interface Book { songs: SongId[]; mats: Partial<Record<MaterialId, number>>; darkAt: number }
/** Most of one material a hero can hold (a counter, not bag items). */
export const MAT_CAP = 9999;
/** How often (ms) Odo grumbles about a dark Chorus. */
const ODO_DARK_MS = 30_000;

/**
 * Per hero (keyed by the Player object, so nothing is synced and no Player field is needed): the songs she collected,
 * mirrored into the engine as SkillRuntime.songs, and her material counters. Saved as swSongs / swMats. Only a
 * Songweaver collects songs or materials.
 */
export class SongCollector {
  private by = new WeakMap<object, Book>();
  private of(p: object): Book {
    let b = this.by.get(p);
    if (!b) this.by.set(p, (b = { songs: [], mats: {}, darkAt: -Infinity }));
    return b;
  }

  /**
   * On load: the save's songs and materials, cleaned. `oldKit`: a save from before kit v3, which gets the songs of the
   * quests it had already finished (`done`).
   */
  load(p: { cls: string; sk: SkillRuntime }, s: { swSongs?: unknown; swMats?: unknown }, done: (quest: string) => boolean, oldKit: boolean) {
    const b = this.of(p);
    b.songs = []; b.mats = {};
    if (p.cls !== "songweaver") { p.sk.songs = undefined; return; }
    if (Array.isArray(s.swSongs)) for (const v of s.swSongs) if (isSongId(v) && !b.songs.includes(v)) b.songs.push(v);
    if (oldKit) for (const d of SONG_SOURCES) if (d.source.kind === "quest" && done(d.source.quest) && !b.songs.includes(d.id)) b.songs.push(d.id);
    if (s.swMats && typeof s.swMats === "object") for (const [k, v] of Object.entries(s.swMats as Record<string, unknown>)) {
      if (isMaterial(k) && typeof v === "number" && Number.isFinite(v) && v > 0) b.mats[k] = Math.min(MAT_CAP, Math.floor(v));
    }
    p.sk.songs = [...b.songs];
  }

  /** Save fields (none for other classes). */
  save(p: { cls: string }): { swSongs?: string[]; swMats?: Record<string, number> } {
    if (p.cls !== "songweaver") return {};
    const b = this.of(p);
    return { swSongs: [...b.songs], swMats: { ...b.mats } as Record<string, number> };
  }

  msg(p: object): SongbookMsg {
    const b = this.of(p);
    return { songs: [...b.songs], mats: { ...b.mats } as Record<string, number> };
  }

  has(p: object, song: string): boolean { return this.of(p).songs.includes(song as SongId); }

  /** She learns a song. False for another class, an unknown id or a song she has. */
  learn(p: { cls: string; sk: SkillRuntime }, song: string): boolean {
    const b = this.of(p);
    if (p.cls !== "songweaver" || !isSongId(song) || b.songs.includes(song)) return false;
    b.songs.push(song);
    p.sk.songs = [...b.songs];
    return true;
  }

  /**
   * A Chorus went off (`s.song`) at (x, y) in `mode`: the songs it earns (Odo hears a bright one within reach, Mirror
   * Pond's shore takes any), and what a villager says about a dark one. `say` gets the villager id and its line.
   */
  chorus(p: { cls: string; sk: SkillRuntime }, s: SkillDef, mode: ModeId, x: number, y: number, now: number, say: (npc: string, text: string) => void): SongDef[] {
    if (p.cls !== "songweaver" || !s.song) return [];
    const b = this.of(p), out: SongDef[] = [];
    for (const d of SONG_SOURCES) {
      if (b.songs.includes(d.id)) continue;
      const src = d.source;
      if (src.kind === "place" && src.place === "pond" && pondShore(x, y)) out.push(d);
      if (src.kind === "npc") {
        const n = npcById(src.npc);
        if (!n || Math.hypot(n.x - x, n.y - y) > src.range) continue;
        if (MODES[mode].family === src.family) out.push(d);
        else if (now - b.darkAt >= ODO_DARK_MS) { b.darkAt = now; say(src.npc, ODO_LINES.dark); }
      }
    }
    return out.filter((d) => this.learn(p, d.id));
  }

  // ---- materials (earned and spent by the lute-maker rules, server/lutemaker.ts) ----
  mats(p: object): Partial<Record<MaterialId, number>> { return this.of(p).mats; }
  /** Adds `n` of a material (a Songweaver only). Returns what was added. */
  addMat(p: { cls: string }, mat: MaterialId, n: number): number {
    if (p.cls !== "songweaver" || n <= 0) return 0;
    const m = this.of(p).mats, had = m[mat] ?? 0;
    m[mat] = Math.min(MAT_CAP, had + Math.floor(n));
    return m[mat]! - had;
  }
  /** Spends materials if she has them all; false (nothing spent) otherwise. */
  spend(p: object, cost: Partial<Record<MaterialId, number>>): boolean {
    const m = this.of(p).mats;
    if (Object.entries(cost).some(([k, v]) => (m[k as MaterialId] ?? 0) < (v ?? 0))) return false;
    for (const [k, v] of Object.entries(cost)) {
      const left = (m[k as MaterialId] ?? 0) - (v ?? 0);
      if (left > 0) m[k as MaterialId] = left; else delete m[k as MaterialId];
    }
    return true;
  }
}
