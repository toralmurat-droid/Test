import { ClassKind } from "./classes";
import { impactMs, nightBuff, passiveBlood, talentBonus, LEAP_MS, pointRange, skillTarget,
  AreaDef, BuffDef, FieldDef, HitEffects, levelPower, MARK_TAKEN, MAX_STACKS, MoveDef, rankOf, rankPower, rankTime, Ranks, scalePower, synergyPower, withMods, maxRank,
  ShotDef, SkillDef, skillById, skillOf, SKILLS, STACK_DECAY_MS, STACK_POWER, WEAK_DEALT, FANG_BELOW_PER_RANK, FANG_CHANCE_PER_RANK, type SoundFx,
} from "./skills";
import { Stats, STATS } from "./powers";
import { pay, skillCost, usesGauge } from "./mana";
import { gearDef } from "./gear";
import { auraBuffs, isAuraId, BLADE_EL, BLADES_BASE, ESSENCE, SUMMON, WISP, type AttuneElement } from "./summons";
import { addResonance, chordProgress, GAUGE, knownModes, PROGRESSIONS, LYDIAN_SHIELD, DORIAN_RADIUS, MODES, modeColour, modulate, noteCast, NOTES, PHRYGIAN, RESONANCE, resonanceOf, resWord, SONG,
  type Degree, type ModeId, type Pitch, type Progression } from "./songs";
import { heroSound, SOUND_TIER, soundMult, type SoundProfile } from "./combat";
import { progressionsFor } from "./songbook";
import { acousticsAt } from "./acoustics";

/**
 * Runs the skills of shared/skills.ts. It knows nothing about the room: the server (server/TownRoom.ts) and the
 * balance simulator (tools/balance/duel.ts) each implement SkillHost, so both play skills by the same rules.
 *
 * The host calls:
 *   castSkill()    when a hero presses a skill key
 *   tickUnit()     every tick for every hero and monster (burning, buffs running out, stacks fading)
 *   tickField()    every tick for every ground effect
 *   shotHit() / shotEnd()   when a skill projectile hits someone / stops
 *   counterHit()   before applying damage to a hero (a counter stance can cancel the hit)
 *   afterHit()     after damage landed (debuffs, enchantments, stacks)
 *   dealtMult / takenMult / speedMult / ...   inside its own damage and movement code
 * and gets visual events through host.fx() (broadcast as "sfx" to the clients, see client/src/skillfx.ts).
 */

export interface ActiveBuff { id: string; until: number; b: BuffDef; rank: number; stacks: number;
  /** shareBuff: the cast's power (strength = rank x power decides which of two casts stays) and who gave it. */
  power?: number; from?: string;
  /** BuffDef.shield: damage the pool can still soak up (absorbDamage). Server-side only: the client sees the buff id. */
  shield?: number }

export interface SkillRuntime {
  last: Record<string, number>; // skill id -> last cast time
  buffs: ActiveBuff[];
  counter?: { until: number; s: SkillDef; rank: number; power: number };
  chargeUntil: number; // buildup: rooted until then
  windUntil: number; // melee wind-up (SkillDef.windMs): no other skill or basic attack until the blow lands
  stacks: number; stackAt: number;
  burnUntil: number; burnDps: number; burnBy: string; burnNext: number;
  markUntil: number; weakUntil: number;
  /** How the running burn looks: "" flames, "drip" blood dripping (bleed), "boil" bubbling blood (Boil Blood). */
  bleed: "" | "drip" | "boil";
  /** Vampire Leech: until then, hits by `leechBy` on this unit also give them a Blood stack. */
  leechUntil: number; leechBy: string;
  // ---- Songweaver (shared/songs.ts) ----
  /** The hero's mode (saved as swMode); unset = Major. Only the Songweaver has one. */
  mode?: ModeId;
  /** The song this Songweaver is playing (SkillDef.song): its skill, when it started, its ground effect. */
  song?: { id: string; at: number; f: FieldInst };
  /** The last notes played (degrees), when the last one was, and until when chords are locked. */
  notes: Degree[]; noteAt: number; chordLock: number;
  /** Resonance on this unit (0..100, any Songweaver's sound hits), when it last grew, its last burst, its last note. */
  res: number; resAt: number; resBurstAt: number; resDeg?: Degree; resPitch?: Pitch;
  /** Song gauge (DI-3, the value itself is Unit.mana): her last note or swing (the drain waits for it), the last gauge tick. */
  gaugeAt: number; gaugeTick: number;
  /** The book she wears (the host mirrors the shield slot here): its GearDef.book.full fires when the gauge fills. */
  book?: string;
  /** Songs she collected (shared/songbook.ts, the host mirrors them): their progressions count while her book holds songs. */
  songs?: string[];
}
export const newRuntime = (): SkillRuntime => ({
  last: {}, buffs: [], chargeUntil: 0, windUntil: 0, stacks: 0, stackAt: 0,
  burnUntil: 0, burnDps: 0, burnBy: "", burnNext: 0, markUntil: 0, weakUntil: 0, bleed: "", leechUntil: 0, leechBy: "",
  notes: [], noteAt: 0, chordLock: 0, res: 0, resAt: 0, resBurstAt: -Infinity, gaugeAt: 0, gaugeTick: 0,
});

export interface Unit { x: number; y: number; dead: boolean; level: number; sk: SkillRuntime; cls?: ClassKind; talents?: Ranks; energy?: number; mana?: number; maxMana?: number; hp?: number; maxHp?: number;
  /** Heroes: when the next basic attack may go off. Cantrips share this timer (they are a basic attack you cast). */
  attackReadyAt?: number }

/**
 * An enchantment that rides along on a skill (Fire Arrows + Volley = a volley of fire arrows): the enchant skill's id,
 * its look (FxStyle) and the effects its hits add. Taken when the skill goes off and kept by its shots and ground effects.
 */
export interface Imbue { id: string; style: string; fx: HitEffects }

export interface HitOpts extends HitEffects { skill?: boolean; basic?: boolean; dot?: boolean; thorn?: boolean; crit?: boolean; imb?: Imbue;
  /** Dealt by a hero's creature in their name (golem, wisp): SUMMON.pvp applies when it lands on a hero. */
  pet?: boolean;
  /** x poise drained (a Phrygian sound hit, worked out by the host's damage code). */
  poiseMul?: number;
  /** The element the hit shows as (damage number colour). */
  el?: "fire" | "cold" | "poison" | "faith" | "shock" }

export interface ShotSpec extends HitEffects {
  owner: string; skill: string; x: number; y: number; vx: number; vy: number;
  kind: string; speed: number; range: number; radius: number; size: number; dmg: number;
  pierce: number; explode: number; chain: number; field?: FieldDef; rank: number; power: number;
  bounce?: number; // walls it may still bounce off (ShotDef.bounce, server updateProjectile)
  pulse?: ShotDef["pulse"]; pulses?: number; // pulses so far (turns the shard ring)
  imb?: Imbue; // enchantment active when it was shot
  pet?: boolean; // shot by a hero's creature (a wisp) in their name: SUMMON.pvp applies on heroes
}

export interface FieldInst {
  owner: string; skill: string; def: FieldDef; rank: number; power: number;
  x: number; y: number; until: number; nextTick: number;
  imb?: Imbue; // enchantment active when it was cast (traps, sentries)
  target?: string; // Blood Link: the enemy on the other end of the cord
  ally?: boolean; // Blood Link bound to a group ally (Transfusion): blood flows to them instead
  /** Songweaver: the power of its heals and buffs (a mode splits a cast in two, shared/songs.ts MODES); unset = `power`. */
  allyPower?: number;
  /** Songweaver: the cast's power before its mode, its def before its mode and acoustics, the mode and pitch it plays in. */
  tune?: { base: number; def: FieldDef; mode: ModeId; pitch?: Pitch; crescendo?: number };
  song?: boolean; // a song (SkillDef.song): Tempo quickens it (Accelerando), tiles around colour it (shared/acoustics.ts)
  ticks?: number; // ticks so far (Anthem's crescendo)
  /** The radius its last tick reached (a song near a well reaches further); the server syncs it so the ring matches. */
  reach?: number;
}

export interface SkillHost {
  now(): number;
  later(ms: number, fn: () => void): void;
  unit(id: string): Unit | undefined;
  /** Can act: alive, not stunned or dizzy. */
  canAct(id: string): boolean;
  /** Live, hittable enemies of `id` within r of (x, y). */
  enemies(x: number, y: number, r: number, of: string): string[];
  hit(attacker: string, target: string, dmg: number, push: [number, number], o: HitOpts): void;
  /** `from`: who heals (a party buff or aura cast by someone else); missing = the unit itself or nobody in particular. */
  heal(id: string, amount: number, from?: string): void;
  aim(id: string): [number, number];
  /** Distance to the spot the hero clicked for this cast (point skills), read once; undefined = no click. */
  aimDist?(id: string): number | undefined;
  face(id: string, dx: number, dy: number): void;
  /** Walk `dist` px along (dx, dy), stopped by walls, in small steps; calls `each` after every step. */
  move(id: string, dx: number, dy: number, dist: number, each?: () => void): void;
  /** Teleport if the spot is walkable. */
  place(id: string, x: number, y: number): boolean;
  invuln(id: string, until: number): void;
  shoot(s: ShotSpec): void;
  addField(f: FieldInst): void;
  fear(id: string, ms: number): void;
  /** Weapon hit of the hero (class damage x attack stat), and the Magic multiplier for flat skill damage. */
  weaponHit(id: string): number;
  magic(id: string): number;
  /** Hero attributes (with gear), for skills that scale with one. */
  stats?(id: string): Stats | undefined;
  cooldownMult(id: string): number;
  fx(ev: Record<string, unknown>): void;
  /** Summoner (shared/summons.ts): pull the golems back out of the Void; fuse them into a Colossus. */
  summon?(id: string, power: number): void;
  colossus?(id: string, power: number, ms: number): void;
  /** Summoner: the elements of the hero's living golems (a Colossus counts for each golem fused into it); their auras. */
  golemEls?(id: string): AttuneElement[];
  /** Summoner: call `n` elemental wisps for `ms`; open the Void Arsenal for `ms`. */
  wisps?(id: string, power: number, n: number, ms: number): void;
  arsenal?(id: string, power: number, ms: number): void;
  /**
   * Black Hole: `target` is swallowed (a monster: spat out at a random spot a little further away) or thrown out of it
   * (a hero: 3-4 tiles away, on a walkable spot out of the safe zone). Returns false when it couldn't be moved.
   */
  voidHop?(owner: string, target: string, swallowed: boolean, x: number, y: number): boolean;
  /** Is it night where this unit stands (the world clock, or inside a Nightfall)? Night passives need it. */
  isNight?(id: string): boolean;
  /** Has this unit flesh to eat or bite (not skeletons, the undead or golems)? Missing = everyone has. */
  flesh?(id: string): boolean;
  /** Devour: eat monster `target` whole with a blow of `dmg` (it dies). False when it can't be eaten (a hero, an elite...). */
  devour?(id: string, target: string, dmg: number, heal: number): boolean;
  /** Bite: monster `target` falls and rises as the hero's thrall. False when it can't be turned. */
  thrall?(id: string, target: string, dmg: number, power: number, rank: number): boolean;
  /** Vampire Brides: call `n` brides that fight for the hero for `ms`, each healing him `drain`% of its damage. */
  brides?(id: string, power: number, n: number, ms: number, drain: number): void;
  /** Group allies of `of` (alive heroes in the same group) within r of (x, y), not `of` itself. Missing = no groups. */
  allies?(x: number, y: number, r: number, of: string): string[];
  /** Can this unit be charmed (a plain monster: not a hero, summon, boss or elite)? */
  charmable?(id: string): boolean;
  /** Charm: monster `target` fights for the hero for `ms`. False when it can't be charmed. */
  charm?(id: string, target: string, ms: number): boolean;
  /** How this unit hears a sound hit (shared/combat.ts): a monster's MOB_COMBAT sound, a hero normal. Missing = normal. */
  soundOf?(id: string): SoundProfile | undefined;
}

const live = (h: SkillHost, id: string) => { const u = h.unit(id); return u && !u.dead ? u : undefined; };
const norm = (dx: number, dy: number): [number, number] => { const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
const pushFrom = (h: SkillHost, x: number, y: number, tid: string): [number, number] => {
  const t = h.unit(tid);
  return t ? norm(t.x - x || 0.01, t.y - y) : [0, 1];
};
const effects = (e: HitEffects, t: number): HitEffects => ({
  stunMs: e.stunMs && e.stunMs * t, slowMs: e.slowMs && e.slowMs * t, kb: e.kb,
  burn: e.burn && [e.burn[0], e.burn[1] * t], markMs: e.markMs && e.markMs * t, weakMs: e.weakMs && e.weakMs * t, fearMs: e.fearMs && e.fearMs * t,
  drain: e.drain, leechMs: e.leechMs && e.leechMs * t, bleed: e.bleed, sound: e.sound,
});

/**
 * The enchantment (buff with onHit: Fire Arrows, Holy Blade, Poison Blade, Blade Flurry) that skills cast now carry,
 * the latest one if several are up. Skills combine with it: their hits get its effects and their visuals its colour.
 */
export function imbueOf(u: Unit | undefined, now: number): Imbue | undefined {
  if (!u?.cls) return undefined;
  let best: ActiveBuff | undefined;
  for (const b of u.sk.buffs) if (b.b.onHit && b.until > now) best = b; // addBuff pushes, so the last one is the newest
  if (!best) return undefined;
  return { id: best.id, style: skillOf(u.cls, best.id)?.style ?? "fire", fx: effects(best.b.onHit!, rankTime(best.rank)) };
}

function baseDmg(h: SkillHost, id: string, a: { wpn?: number; dmg?: number }): number {
  return (a.wpn ? a.wpn * h.weaponHit(id) : 0) + (a.dmg ? a.dmg * h.magic(id) : 0);
}

export function cooldownLeft(s: SkillDef, sk: SkillRuntime, now: number, cdm: number): number {
  return Math.max(0, (sk.last[s.id] ?? -Infinity) + (s.cd ?? 0) * cdm - now);
}

// ---- Casting -----------------------------------------------------------------------------------------

/**
 * Melee skills with a wind-up (SkillDef.windMs) reach this much further (px): the foe had the wind-up to step back, and
 * without it the blow whiffs much more than the skill before it (tools/balance/duel.ts).
 */
export const WIND_REACH = 6;

/**
 * What a cast set off besides itself: `chord` = the Songweaver finisher it completed (the room's Oakvale rule reads it).
 * A charged skill logs its note only when it goes off, so a finisher it completes then reaches `onChord` instead.
 */
export interface CastOut { chord?: string; onChord?: (fin: string) => void }

/** A hero presses a skill. Returns true if it was cast; `out` learns what else it set off. */
export function castSkill(h: SkillHost, id: string, skillId: string, out?: CastOut): boolean {
  const u = live(h, id);
  if (!u || !u.cls || !h.canAct(id)) return false;
  const base = skillOf(u.cls, skillId);
  const s = base && withMods(u.cls, u.talents, base); // learned upgrade nodes (more bolts, bigger radius, shorter cooldown...)
  const rank = s?.cantrip ? 1 : Math.min(maxRank(s), rankOf(u.talents, skillId));
  const now = h.now();
  if (!s || s.passive || rank <= 0 || now < u.sk.chargeUntil || now < (u.sk.windUntil ?? 0)) return false;
  // Bat / Wolf Form: pressing the form again takes the hero's own shape back (free, no cooldown)
  const form = formBuff(u, now);
  if (form && form.id === s.id) { endForm(h, id); return true; }
  if (cooldownLeft(s, u.sk, now, h.cooldownMult(id) * buffCdr(u, now)) > 0) return false;
  if (s.field?.link && !linkPick(h, id, s.field.link)) return false; // Blood Link: nobody in reach to bind
  if (s.charm && !charmTarget(h, id, s.charm.range)) return false; // Charm: nobody in reach
  if (s.modulate && knownModesOf(u).length < 2) return false; // Modulate needs a second mode
  // One song per Songweaver: changing to another waits SONG.changeMs after the last one started
  const sg = u.sk.song;
  if (s.song && sg && sg.id !== s.id && sg.f.until > now && now - sg.at < SONG.changeMs) return false;
  const fang = s.devour ?? s.bite;
  if (fang && !fangTarget(h, id, fang.range)) return false; // Devour / Bite: nothing with flesh in reach
  // Cantrips take the place of a basic attack (balance pass 2026-11-04): they wait for it and hold the next one back
  if (s.cantrip && now < (u.attackReadyAt ?? 0)) return false;
  const blood = bloodCost(s, u);
  if (blood > 0 && (u.hp ?? 0) <= blood + 1) return false; // blood magic: not enough life left to pay with
  if (!pay(u, skillCost(s))) return false; // Heat and/or Mana (shared/mana.ts, shared/overload.ts)
  if (blood > 0) u.hp = Math.max(1, (u.hp ?? 0) - blood);
  u.sk.last[s.id] = now;
  // The beast keeps to its own school: a bat still calls bats, rats and mist, a wolf still rends, pounces and bites;
  // a skill of any other school turns the vampire back first
  if (form && skillOf(u.cls, form.id)?.branch !== s.branch) endForm(h, id);
  if (s.cantrip) u.attackReadyAt = now + (s.cd ?? 0);
  // A clicked spot (point skills): how far from the hero it lands, within the skill's reach
  const clicked = h.aimDist?.(id);
  const at = skillTarget(s) === "point" && clicked !== undefined ? Math.max(0, Math.min(pointRange(s), clicked)) : undefined;
  let stacks = 0;
  if (s.consume) { stacks = u.sk.stacks; u.sk.stacks = 0; }
  // the song gauge (DI-3): Twelve-Tone Storm spends it all, stronger the fuller it was (and the book's effect is lost)
  const gauge = s.spendGauge && usesGauge(u.cls) ? spendGauge(u) : 1;
  // re-playing the Chorus that still has more than GAUGE.refreshMs to run logs no note and fills nothing
  const sg0 = u.sk.song, refresh = !!s.song && !!sg0 && sg0.id === s.id && sg0.f.until - now > GAUGE.refreshMs;
  const power = rankPower(rank) * levelPower(s) * (s.power ?? 1) * synergyPower(s, u.talents) * scalePower(s, h.stats?.(id), STATS[u.cls].base) *
    (s.consume && !s.buff?.perStack ? 1 + STACK_POWER * stacks : 1) * gauge;
  h.fx({ ev: "cast", id, s: s.id, rank, stacks, charge: s.chargeMs ?? 0, wind: s.windMs ?? 0, x: u.x, y: u.y });
  // A buildup charges (rooted, a stun breaks it). A big melee blow winds up first, so it lands with the animation's
  // strike (client/src/skillMoves.ts): the hero keeps moving and can't swing or cast meanwhile, and nothing breaks it
  // (rooting it or letting stuns cancel it cost knights and barbarians up to 10% of their duels, tools/balance/duel.ts)
  const hold = (s.chargeMs ?? 0) + (s.windMs ?? 0), sings = !!s.degree && u.cls === "songweaver" && !refresh;
  if (hold > 0) {
    if (s.chargeMs) u.sk.chargeUntil = now + hold;
    if (s.windMs) u.sk.windUntil = now + hold;
    h.later(hold, () => {
      u.sk.chargeUntil = 0; u.sk.windUntil = 0;
      if (s.chargeMs && !h.canAct(id)) { h.fx({ ev: "fizzle", id, s: s.id }); return; } // a stun breaks the buildup
      release(h, id, s, rank, power, stacks, at);
      // a charged note counts only if it sounded: a fizzled one logs nothing and fires no chord
      if (s.chargeMs && sings) { const fin = playNote(h, id, u, s, h.now()); if (fin) out?.onChord?.(fin); }
    });
  } else release(h, id, s, rank, power, stacks, at);
  if (sings && !s.chargeMs) { const fin = playNote(h, id, u, s, now); if (out && fin) out.chord = fin; }
  return true;
}

// ---- The Songweaver: modes, notes and chords (shared/songs.ts) ---------------------------------------------------

/** The Songweaver's mode (undefined for every other class: their casts keep a single power). */
export const modeOf = (u: Unit | undefined): ModeId | undefined => (u?.cls === "songweaver" ? u.sk.mode ?? "major" : undefined);
const ranksOf = (u: Unit) => (id: string) => rankOf(u.talents, id);
/** The modes this hero knows (Major, Minor with Dirge, the three mode nodes). */
export const knownModesOf = (u: Unit) => knownModes(ranksOf(u));

/**
 * A Songweaver skill went off: its note sounds for everyone ("note"), and unless it is Modulate it is logged. Three
 * notes in a progression fire that chord's finisher at once ("chord"), coloured by the mode. Returns the finisher's id.
 */
function playNote(h: SkillHost, id: string, u: Unit, s: SkillDef, now: number): string | undefined {
  const mode = modeOf(u)!;
  h.fx({ ev: "note", id, s: s.id, deg: s.degree, mode, pitch: s.pitch ?? "M", x: Math.round(u.x), y: Math.round(u.y) });
  u.sk.gaugeAt = now;
  if (s.modulate) return undefined; // a key change fills nothing
  const p = noteCast(u.sk, s.degree!, now, progressionsFor(u.sk));
  const fin = p ? fireChord(h, id, p) : undefined;
  fillGauge(h, id, GAUGE.note);
  return fin;
}

/** The progressions this hero can finish: every note is played by a skill she has learned (Modulate logs no note). */
export function playableProgs(u: Unit): Progression[] {
  if (!u.cls) return [];
  const degs = new Set(SKILLS[u.cls].filter((s) => s.degree && !s.passive && rankOf(u.talents, s.id) > 0).map((s) => s.degree));
  return progressionsFor(u.sk).filter((p) => p.notes.every((n) => degs.has(n)));
}

/** A progression fired: its finisher goes off (power from its level and Magic, like a skill). Returns its id if it did. */
export function fireChord(h: SkillHost, id: string, p: Progression): string | undefined {
  const u = live(h, id), fin = skillById(p.skill);
  if (!u?.cls || !fin) return undefined;
  h.fx({ ev: "chord", id, prog: p.id, mode: modeOf(u), x: Math.round(u.x), y: Math.round(u.y) });
  release(h, id, fin, 1, levelPower(fin) * scalePower(fin, h.stats?.(id), STATS[u.cls].base), 0);
  fillGauge(h, id, GAUGE.chord);
  return fin.id;
}

// ---- The song gauge (DI-3, shared/songs.ts GAUGE) ----------------------------------------------------------------

/** Adds `n` to a Songweaver's song gauge (her `mana`); a full gauge swells at once. Anyone else: nothing. */
export function fillGauge(h: SkillHost, id: string, n: number) {
  const u = live(h, id);
  if (!u || !usesGauge(u.cls) || n <= 0) return;
  u.mana = Math.min(GAUGE.max, (u.mana ?? 0) + n);
  if (u.mana >= GAUGE.max) swell(h, id, u);
}

/** She swung her lute (hit or not): the drain waits GAUGE.idleMs again. The host calls it from its basic attack. */
export function gaugeSwing(u: Unit, now: number) { if (usesGauge(u.cls)) u.sk.gaugeAt = now; }

/** Twelve-Tone Storm empties the gauge: its power multiplier from how full it was. */
function spendGauge(u: Unit): number {
  const fill = Math.max(0, Math.min(GAUGE.max, u.mana ?? 0));
  u.mana = 0;
  return GAUGE.stormBase + GAUGE.stormPerFill * fill / GAUGE.max;
}

/**
 * The gauge is full: it empties and the book she wears fires its effect (GearDef.book.full, a hidden skill, powered
 * like a chord finisher), with a "swell" event. No book: the swell fizzles.
 */
function swell(h: SkillHost, id: string, u: Unit) {
  u.mana = 0;
  const bk = u.sk.book ? gearDef(u.sk.book)?.book : undefined, fin = bk ? skillById(bk.full) : undefined;
  h.fx({ ev: "swell", id, book: fin ? u.sk.book : null, x: Math.round(u.x), y: Math.round(u.y), ...(fin ? {} : { fizzle: true }) });
  if (fin && u.cls) release(h, id, fin, 1, levelPower(fin) * scalePower(fin, h.stats?.(id), STATS[u.cls].base), 0);
}

/** Every tick: a gauge filled from outside the engine (an execution, the Echo rune) swells; idle, it drains. */
function tickGauge(h: SkillHost, id: string, u: Unit, now: number) {
  const sk = u.sk, last = sk.gaugeTick || now;
  sk.gaugeTick = now;
  if (u.maxMana !== GAUGE.max) u.maxMana = GAUGE.max;
  const v = u.mana ?? 0;
  if (v >= GAUGE.max) { swell(h, id, u); return; }
  const idleFrom = sk.gaugeAt + GAUGE.idleMs;
  if (v > 0 && now > idleFrom) u.mana = Math.max(0, v - GAUGE.drainPerSec * (now - Math.max(last, idleFrom)) / 1000);
}

/**
 * Refrain (the Songbook's full effect): the Chorus she plays beats `beats` times at once and runs SONG.ms again.
 * Returns false when no Chorus is playing (the skill's buff, a small party heal, goes off instead).
 */
function refrain(h: SkillHost, id: string, u: Unit, beats: number): boolean {
  const now = h.now(), sg = u.sk.song;
  if (!sg || sg.f.until <= now) return false;
  for (let i = 0; i < beats; i++) { sg.f.nextTick = now; tickField(h, sg.f); }
  sg.f.until = now + SONG.ms;
  return true;
}

/** Every hit of a Songweaver skill is sound: its pitch, its degree and the caster's mode ride on each one. */
function withSound(s: SkillDef, snd: SoundFx): SkillDef {
  const put = <T extends { sound?: SoundFx }>(d: T): T => ({ ...d, sound: { ...d.sound, ...snd } });
  return { ...s, areas: s.areas?.map(put), shots: s.shots && put(s.shots), field: s.field && put(s.field), cry: s.cry && put(s.cry) };
}

/** A buff's percentages times `k` (a mode's ally colour, a crescendo). Heals and shields scale with the cast's power instead. */
export function scaleBuff(b: BuffDef, k: number, radius = 1): BuffDef {
  if (k === 1 && radius === 1) return b;
  const x = (v?: number) => (v ? v * k : v);
  return { ...b, dmg: x(b.dmg), speed: x(b.speed), armor: x(b.armor), atkspd: x(b.atkspd), lifesteal: x(b.lifesteal), regen: x(b.regen), poise: x(b.poise),
    party: b.party && b.party * radius };
}

/** Dorian songs reach further: x this radius. */
const dorianReach = (u: Unit | undefined, mode: ModeId | undefined) => (mode === "dorian" && u ? 1 + DORIAN_RADIUS * modeColour("dorian", ranksOf(u)) : 1);

/** A Songweaver field in its mode: radius (Dorian) and the mode its hits carry. */
function tuneDef(d: FieldDef, mode: ModeId, u: Unit | undefined): FieldDef {
  const k = dorianReach(u, mode);
  return { ...d, r: d.r * k, sound: d.sound && { ...d.sound, mode } };
}

/** Puts a Songweaver field in `mode`: its damage, heal and buff powers and its radius follow (Modulate recolours songs). */
function applyTune(f: FieldInst, u: Unit | undefined) {
  if (!f.tune) return;
  const md = MODES[f.tune.mode];
  f.power = f.tune.base * md.foe; f.allyPower = f.tune.base * md.ally;
  f.def = tuneDef(f.tune.def, f.tune.mode, u);
}

/** Modulate went off: the next known mode, and the song being played takes it. */
function doModulate(h: SkillHost, u: Unit) {
  const m = modulate(u.sk, knownModesOf(u));
  const sg = u.sk.song;
  if (m && sg?.f.tune && sg.f.until > h.now()) { sg.f.tune.mode = m; applyTune(sg.f, u); }
}

/**
 * Heals `tid` for `amount` from `from`. A Songweaver in Lydian turns what goes past full life into a shield
 * (LYDIAN_SHIELD); everyone else just heals.
 */
export function allyHeal(h: SkillHost, from: string, tid: string, amount: number) {
  const t = live(h, tid);
  if (!t || amount <= 0) return;
  const c = h.unit(from), lyd = modeOf(c) === "lydian" && !!t.maxHp;
  const room = lyd ? Math.max(0, t.maxHp! - (t.hp ?? 0)) : 0;
  h.heal(tid, amount, from);
  if (lyd && amount > room) overShield(h, from, tid, (amount - room) * LYDIAN_SHIELD.share * modeColour("lydian", ranksOf(c!)));
}

/** Lydian: overheal tops up one shield per hero (buff "sg_lydian"), at most LYDIAN_SHIELD.maxPct of their life. */
function overShield(h: SkillHost, from: string, tid: string, add: number) {
  const t = live(h, tid);
  if (!t?.maxHp || add <= 0) return;
  const now = h.now(), cap = t.maxHp * LYDIAN_SHIELD.maxPct / 100;
  const cur = t.sk.buffs.find((b) => b.id === "sg_lydian" && b.until > now);
  if (cur) { cur.shield = Math.min(cap, (cur.shield ?? 0) + add); cur.until = now + LYDIAN_SHIELD.ms; return; }
  t.sk.buffs = t.sk.buffs.filter((b) => b.id !== "sg_lydian");
  t.sk.buffs.push({ id: "sg_lydian", until: now + LYDIAN_SHIELD.ms, b: { ms: LYDIAN_SHIELD.ms }, rank: 1, stacks: 0, from, shield: Math.min(cap, add) });
  h.fx({ ev: "buff", id: tid, s: "sg_lydian", ms: LYDIAN_SHIELD.ms });
}

/** Mending Note: heal the caster, then hop to the nearest group ally not healed yet (x0.8 each hop). */
function mendChain(h: SkillHost, id: string, s: SkillDef, rank: number, power: number) {
  const m = s.mend!, u = live(h, id);
  if (!u?.maxHp) return;
  const hops = m.hops + (rank >= 3 ? 1 : 0) + (rank >= 5 ? 1 : 0);
  allyHeal(h, id, id, u.maxHp * m.heal / 100 * power);
  const done = new Set([id]);
  let cur: Unit = u, k = 1;
  for (let i = 0; i < hops && h.allies; i++) {
    let best: string | undefined, bd = Infinity;
    for (const a of h.allies(cur.x, cur.y, m.range, id)) {
      if (done.has(a)) continue;
      const au = h.unit(a)!, d = Math.hypot(au.x - cur.x, au.y - cur.y);
      if (d < bd) { bd = d; best = a; }
    }
    if (!best) break;
    done.add(best); k *= 0.8;
    const bu = h.unit(best)!;
    if (bu.maxHp) allyHeal(h, id, best, bu.maxHp * m.heal / 100 * k * power);
    cur = bu;
  }
}

/** Chorale: the caster and every group ally inside heal, more for each voice that joins in. */
function choraleHeal(h: SkillHost, id: string, s: SkillDef, power: number) {
  const c = s.chorale!, u = live(h, id);
  if (!u) return;
  const who = party(h, id, u.x, u.y, c.r), k = 1 + c.perAlly * (who.length - 1);
  for (const t of who) { const tu = live(h, t); if (tu?.maxHp) allyHeal(h, id, t, tu.maxHp * c.heal / 100 * k * power); }
}

/** Legato: song gifts linger this much longer (ms) after stepping out. */
const legatoMs = (o: Unit | undefined) => (o?.cls ? talentBonus(o.cls, o.talents ?? {}, "legato") * 1000 : 0);

/**
 * A song's beat (ms): Accelerando quickens it with the song gauge's fill (a full gauge = GAUGE.accelStacks of the old
 * Tempo stacks), never below SONG.tickFloorMs.
 */
function songTick(f: FieldInst, o: Unit | undefined): number {
  const base = f.def.tickMs;
  if (!f.song || !o?.cls) return base;
  const st = usesGauge(o.cls) ? GAUGE.accelStacks * Math.max(0, Math.min(GAUGE.max, o.mana ?? 0)) / GAUGE.max : o.sk.stacks;
  if (!st) return base;
  const v = talentBonus(o.cls, o.talents ?? {}, "accel");
  return v > 0 ? Math.max(SONG.tickFloorMs, base * (1 - v * st / 100)) : base;
}

/**
 * A sound hit landed on `tid` (afterHit): the "soundhit" cue on monsters, then resonance by the target's hearing. At
 * 100 it bursts (and a fragile target shatters); Sympathetic Strings spread part of a burst to foes close by.
 */
function resonate(h: SkillHost, from: string, tid: string, o: HitOpts) {
  const t = h.unit(tid), a = h.unit(from), snd = o.sound!;
  if (!t || !a) return;
  const prof = h.soundOf ? h.soundOf(tid) : heroSound(t.cls), m = soundMult(prof, snd), now = h.now();
  if (!t.cls && !o.dot) h.fx({ ev: "soundhit", id: tid, x: Math.round(t.x), y: Math.round(t.y), tier: prof?.tier ?? "normal", match: m.match });
  if (m.res <= 0) return; // deaf: it never rings
  const sym = a.cls ? talentBonus(a.cls, a.talents ?? {}, "sympathy") : 0;
  const phry = snd.mode === "phrygian" ? 1 + PHRYGIAN.res * modeColour("phrygian", ranksOf(a)) : 1;
  const base = snd.basic ? RESONANCE.basic : o.dot ? RESONANCE.tick : RESONANCE.perHit;
  const amt = (base * phry * (1 + sym / 100) + (snd.res ?? 0)) * m.res;
  if (!addResonance(t.sk, amt, now, { deg: snd.deg, pitch: snd.pitch })) return;
  const shatter = prof?.tier === "fragile";
  h.fx({ ev: "resonate", id: tid, by: from, x: Math.round(t.x), y: Math.round(t.y), shatter });
  const dmg = RESONANCE.burstDmg * h.magic(from) * SOUND_TIER[prof?.tier ?? "normal"].dmg * (shatter ? RESONANCE.shatterMult : 1);
  h.hit(from, tid, dmg, [0, 0], { skill: true, thorn: true, kb: 0, stunMs: shatter ? RESONANCE.shatterStunMs : undefined });
  if (sym <= 0) return;
  const spread = RESONANCE.spread * (1 + sym / 100);
  for (const e of h.enemies(t.x, t.y, RESONANCE.spreadR, from)) {
    const eu = h.unit(e);
    if (e === tid || !eu) continue;
    addResonance(eu.sk, spread * soundMult(h.soundOf?.(e), snd).res, now, { spread: true });
  }
}

/**
 * HP a skill costs this unit: its own blood magic (SkillDef.blood) plus what learned passives add to every skill
 * (Blood Pact, passive.blood; not the basic spell).
 */
export const bloodCost = (s: SkillDef, u: Unit | undefined) => {
  if (!u?.maxHp) return 0;
  const pct = (s.blood ?? 0) + (s.cantrip || !u.cls ? 0 : passiveBlood(u.cls, u.talents));
  return pct > 0 ? Math.round(u.maxHp * pct / 100) : 0;
};

/** The enemy a Blood Link binds: within `range`, the one nearest the spot half that far along the aim. */
export function linkTarget(h: SkillHost, id: string, range: number): string | undefined {
  const u = live(h, id);
  if (!u) return undefined;
  const [ax, ay] = h.aim(id);
  const px = u.x + ax * range * 0.5, py = u.y + ay * range * 0.5;
  let best: string | undefined, bd = Infinity;
  for (const e of h.enemies(u.x, u.y, range, id)) {
    const t = h.unit(e)!;
    const d = Math.hypot(t.x - px, t.y - py);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/**
 * What a Blood Link binds: the enemy nearest the aim (linkTarget) or, when the link can give (Transfusion), a group ally
 * if one is nearer the aimed spot than that enemy.
 */
export function linkPick(h: SkillHost, id: string, link: { range: number; give?: number }): { t: string; ally: boolean } | undefined {
  const u = live(h, id);
  if (!u) return undefined;
  const foe = linkTarget(h, id, link.range);
  if (!link.give || !h.allies) return foe ? { t: foe, ally: false } : undefined;
  const [ax, ay] = h.aim(id);
  const px = u.x + ax * link.range * 0.5, py = u.y + ay * link.range * 0.5;
  const dist = (tid: string) => { const t = h.unit(tid)!; return Math.hypot(t.x - px, t.y - py); };
  let best: string | undefined, bd = foe ? dist(foe) : Infinity;
  for (const a of h.allies(u.x, u.y, link.range, id)) { const d = dist(a); if (d < bd) { bd = d; best = a; } }
  return best ? { t: best, ally: true } : foe ? { t: foe, ally: false } : undefined;
}

/** Charm: the foe nearest the spot half `range` along the aim, within `range` (a monster to charm, or a hero to daze). */
export function charmTarget(h: SkillHost, id: string, range: number): string | undefined {
  return linkTarget(h, id, range);
}

/** Devour / Bite: the foe with flesh (shared/devour.ts) within `range`, the one nearest the spot half that far along the aim. */
export function fangTarget(h: SkillHost, id: string, range: number): string | undefined {
  const u = live(h, id);
  if (!u) return undefined;
  const [ax, ay] = h.aim(id);
  const px = u.x + ax * range * 0.5, py = u.y + ay * range * 0.5;
  let best: string | undefined, bd = Infinity;
  for (const e of h.enemies(u.x, u.y, range, id)) {
    if (h.flesh && !h.flesh(e)) continue;
    const t = h.unit(e)!;
    const d = Math.hypot(t.x - px, t.y - py);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/** Is `t` weak enough to be eaten / turned: at or below `below` of its life (+5% per rank above 1)? */
export const fangWeak = (t: Unit, below: number, rank: number) =>
  !!t.maxHp && (t.hp ?? 0) <= t.maxHp * (below + FANG_BELOW_PER_RANK * Math.max(0, rank - 1));

/** Devour / Bite goes off: the vampire lunges at the foe and bites; a weak monster is eaten or turned. */
function fangStrike(h: SkillHost, id: string, s: SkillDef, rank: number, power: number, imb?: Imbue) {
  const f = (s.devour ?? s.bite)!;
  const u = live(h, id), tid = fangTarget(h, id, f.range);
  const t = tid ? h.unit(tid) : undefined;
  if (!u || !tid || !t) return;
  h.face(id, t.x - u.x, t.y - u.y);
  const dmg = baseDmg(h, id, f) * power;
  h.fx({ ev: "fang", id, s: s.id, t: tid, x: t.x, y: t.y });
  const weak = fangWeak(t, f.below, rank);
  if (s.devour && weak && h.devour?.(id, tid, dmg, f.heal ?? 0)) {
    if (f.fed) addBuff(h, id, s.id, f.fed, rank); // Ancient Lord: the fresh blood makes him stronger for a while
    return;
  }
  if (s.bite && weak && Math.random() < (f.chance ?? 0) + FANG_CHANCE_PER_RANK * (rank - 1) && h.thrall?.(id, tid, dmg, power, rank)) return;
  h.hit(id, tid, dmg, pushFrom(h, u.x, u.y, tid), { skill: true, drain: f.drain, kb: 0.4, imb });
}

/** `at`: distance to the clicked spot for a point skill (leap/blink length, centre of the blast or field). */
function release(h: SkillHost, id: string, s: SkillDef, rank: number, power: number, stacks: number, at?: number) {
  const u = live(h, id);
  if (!u) return;
  // A Songweaver's mode splits the cast: `ally` for heals, shields and buffs, `foe` for damage (every other class: both = power)
  const mode = modeOf(u), md = mode ? MODES[mode] : undefined;
  const ally = md ? power * md.ally : power, foe = md ? power * md.foe : power;
  if (mode && (s.pitch || s.finisher)) s = withSound(s, { pitch: s.pitch, deg: s.degree, mode });
  if (s.modulate) doModulate(h, u);
  if (s.refrain && refrain(h, id, u, s.refrain.beats)) return;
  if (s.untouchable) h.invuln(id, h.now() + s.untouchable);
  const t = rankTime(rank);
  const x0 = u.x, y0 = u.y;
  const [ax0, ay0] = h.aim(id);
  // An enchantment that is up rides along on the skill's hits (not on the enchant itself)
  const imb = s.buff?.onHit ? undefined : imbueOf(u, h.now());
  if (s.move) doMove(h, id, s, s.move, power, t, at, imb);
  // Several blasts keep their spacing, scaled so the furthest lands on the clicked spot
  const far = Math.max(0, ...(s.areas ?? []).map((a) => a.ahead ?? 0));
  for (const a of s.areas ?? []) {
    const spot = a.atStart ? [x0, y0] as [number, number]
      : at !== undefined && (a.ahead ?? 0) > 0 && !s.move ? [x0 + ax0 * at * (a.ahead! / far), y0 + ay0 * at * (a.ahead! / far)] as [number, number]
      : undefined;
    // After a leap the blast lands with the hero, not at take-off
    const leapt = s.move?.kind === "leap" && !a.atStart ? { ...a, delayMs: Math.max(a.delayMs ?? 0, LEAP_MS) } : a;
    const def = s.windMs ? { ...leapt, r: leapt.r + WIND_REACH } : leapt;
    area(h, id, s, def, foe, t, spot, false, imb);
  }
  // Cracked String's canon: from its rank, the blast rings again a moment later, softer
  const canon = s.canon;
  if (canon && rank >= canon.rank) h.later(canon.delayMs, () => { for (const a of s.areas ?? []) area(h, id, s, a, foe * canon.mult, t, undefined, false, imb); });
  if (s.shots) fire(h, id, s.id, s.shots, rank, foe, u.x, u.y, h.aim(id), imb);
  if (s.mend) mendChain(h, id, s, rank, ally);
  if (s.chorale) choraleHeal(h, id, s, ally);
  if (s.devour || s.bite) fangStrike(h, id, s, rank, power, imb);
  if (s.charm) {
    const tid = charmTarget(h, id, s.charm.range), tu = tid && h.unit(tid);
    if (tid && tu) {
      h.face(id, tu.x - u.x, tu.y - u.y);
      const won = !!h.charmable?.(tid) && !!h.charm?.(id, tid, s.charm.ms * t);
      // Heroes (and monsters too strong-willed: bosses, elites) can't be charmed: they falter, dazed and weakened
      if (!won) h.hit(id, tid, 0, [0, 0], { skill: true, kb: 0, fearMs: s.charm.daze * t, weakMs: s.charm.daze * t });
      h.fx({ ev: "charm", id, t: tid, x: Math.round(tu.x), y: Math.round(tu.y), ms: won ? s.charm.ms * t : 0 });
    }
  }
  if (s.field) {
    const [ax, ay] = h.aim(id), d = at ?? s.field.ahead ?? 0;
    const pick = s.field.link ? linkPick(h, id, s.field.link) : undefined;
    if (pick) { const tu = h.unit(pick.t)!; h.face(id, tu.x - u.x, tu.y - u.y); }
    const def = fieldFor(u, s.field);
    const pw = s.field.blades && u.cls ? power * (1 + talentBonus(u.cls, u.talents ?? {}, "edge") / 100) : power;
    const inst: FieldInst = { owner: id, skill: s.id, def, rank, power: pw, x: u.x + ax * d, y: u.y + ay * d, until: h.now() + s.field.ms * t, nextTick: h.now(), imb, target: pick?.t, ally: pick?.ally || undefined };
    if (mode) { // a Songweaver field keeps its mode: Modulate can recolour it while it plays
      inst.tune = { base: pw, def, mode, pitch: s.pitch, crescendo: s.crescendo };
      inst.song = !!s.song;
      applyTune(inst, u);
    }
    if (!s.field.link || pick) {
      h.addField(inst);
      if (s.song) { // one song per Songweaver: the new one ends the last
        const prev = u.sk.song;
        if (prev && prev.f !== inst) prev.f.until = 0;
        u.sk.song = { id: s.id, at: h.now(), f: inst };
      }
    }
  }
  if (s.buff) {
    // Party buffs and shields go through shareBuff (one per skill id, strongest wins); every other buff as before
    if (s.buff.party || s.buff.shield) partyBuff(h, id, s.id, md ? scaleBuff(s.buff, md.ally, dorianReach(u, mode)) : s.buff, rank, ally);
    else addBuff(h, id, s.id, s.buff, rank, stacks);
    // Bloodline: group allies close by share the buff, at half its lifesteal
    if (s.buff.group && h.allies) for (const a of h.allies(u.x, u.y, s.buff.group, id)) addBuff(h, a, s.id, { ms: s.buff.ms, lifesteal: (s.buff.lifesteal ?? 0) / 2 }, rank);
  }
  if (s.cry) {
    h.fx({ ev: "cry", id, s: s.id, x: u.x, y: u.y, r: s.cry.r });
    area(h, id, s, s.cry, foe, t, undefined, true, imb);
  }
  if (s.counter) {
    u.sk.counter = { until: h.now() + s.counter.ms * t, s, rank, power };
    h.fx({ ev: "counter", id, s: s.id, ms: s.counter.ms * t });
  }
  if (s.summon) h.summon?.(id, power);
  if (s.brides) h.brides?.(id, power, s.brides.n + s.brides.perRank * (rank - 1), s.brides.ms * t, s.brides.drain);
  if (s.colossus) h.colossus?.(id, power, s.colossus.ms);
  if (s.wisps && u.cls) {
    const swarm = talentBonus(u.cls, u.talents ?? {}, "swarm");
    h.wisps?.(id, power, Math.min(4, s.wisps.n + (swarm > 0 ? 1 : 0)), s.wisps.ms * t * (1 + swarm / 100));
  }
  if (s.arsenal) h.arsenal?.(id, power, s.arsenal.ms * t);
  // Void Velocity: coming out of a blink, a rush of speed and quicker skills
  if (s.move?.kind === "blink" && u.cls) for (const p of SKILLS[u.cls]) {
    const r = rankOf(u.talents, p.id);
    if (r > 0 && p.passive?.blink) { const v = p.passive.perRank * Math.min(maxRank(p), r); addBuff(h, id, p.id, { ms: p.passive.blink.ms, speed: v, cdr: v }, 1); }
  }
}

/**
 * A ground effect as this hero casts it: Gravity widens black holes and makes them pull harder; Void Edge adds blades
 * (one at ranks 3 and 5).
 */
function fieldFor(u: Unit, d: FieldDef): FieldDef {
  if (!u.cls) return d;
  if (d.hole) {
    const g = 1 + talentBonus(u.cls, u.talents ?? {}, "gravity") / 100;
    return g > 1 ? { ...d, r: Math.round(d.r * g), pull: (d.pull ?? 0) * g } : d;
  }
  if (d.blades) {
    const edge = rankOf(u.talents, "su_edge");
    return edge >= 3 ? { ...d, blades: d.blades + (edge >= 5 ? 2 : 1) } : d;
  }
  return d;
}

// ---- Void Essence and the Void (Summoner, shared/summons.ts) ----------------------------------------------------

/** The Summoner `id` gains `n` charges of Void Essence (their stacks, at most MAX_STACKS). */
export function gainEssence(h: SkillHost, id: string, n = 1) {
  const u = live(h, id);
  if (!u || u.cls !== "summoner") return;
  u.sk.stacks = Math.min(MAX_STACKS, u.sk.stacks + n);
  u.sk.stackAt = h.now();
}

/**
 * One of the Summoner's creatures went back to the Void (it died or its time ran out): a charge of Essence, and Return
 * to the Void gives back a little life and mana (at most once a second).
 */
export function toVoid(h: SkillHost, owner: string) {
  const u = live(h, owner);
  if (!u || u.cls !== "summoner") return;
  gainEssence(h, owner);
  const v = talentBonus(u.cls, u.talents ?? {}, "return");
  const now = h.now();
  if (v <= 0 || now - (u.sk.last["return"] ?? -Infinity) < 1000) return;
  u.sk.last["return"] = now;
  if (u.maxHp) h.heal(owner, u.maxHp * v / 100);
  if (u.mana !== undefined) u.mana = Math.min(u.maxMana ?? Infinity, u.mana + (u.maxMana ?? 100) * v / 100);
  h.fx({ ev: "voidreturn", id: owner });
}

/**
 * Void Slip (passive.slip): hero `id` was just hit and stands below the passive's threshold of their life. Once per
 * cooldown, they slip into the Void: untouchable for its time (the host makes monsters drop them), then they come out
 * running. Returns how long they are gone (ms), 0 if it didn't happen.
 */
export function voidSlip(h: SkillHost, id: string): number {
  const u = live(h, id);
  if (!u?.cls || !u.maxHp || (u.hp ?? 0) <= 0) return 0;
  const now = h.now();
  for (const s of SKILLS[u.cls]) {
    const sl = s.passive?.slip, r = rankOf(u.talents, s.id);
    if (!sl || r <= 0 || (u.hp ?? 0) > u.maxHp * sl.below) continue;
    const key = "slip:" + s.id;
    if (now - (u.sk.last[key] ?? -Infinity) < sl.cdMs) continue;
    u.sk.last[key] = now;
    const ms = sl.ms + sl.perRank * (Math.min(maxRank(s), r) - 1);
    h.invuln(id, now + ms);
    u.sk.last["slipUntil"] = now + ms;
    u.sk.buffs = u.sk.buffs.filter((x) => x.id !== s.id);
    u.sk.buffs.push({ id: s.id, until: now + ms + sl.speedMs, b: { ms: ms + sl.speedMs, speed: sl.speed }, rank: 1, stacks: 0 });
    h.fx({ ev: "voidslip", id, s: s.id, ms, x: Math.round(u.x), y: Math.round(u.y) });
    h.fx({ ev: "buff", id, s: s.id, ms: ms + sl.speedMs });
    return ms;
  }
  return 0;
}

/** Is this unit hidden in the Void right now (Void Slip: monsters can't see them)? */
export const inVoid = (u: Unit | undefined, now: number) => !!u && now < (u.sk.last["slipUntil"] ?? 0);

/** The shapeshift buff (BuffDef.form) the unit is in right now, if any. */
export function formBuff(u: Unit | undefined, now: number): ActiveBuff | undefined {
  return u?.sk.buffs.find((b) => b.b.form && b.until > now);
}
/** Which beast the unit is right now ("bat", "wolf") or undefined. */
export const formOf = (u: Unit | undefined, now: number) => formBuff(u, now)?.b.form;
/** Ends a shapeshift early: the hero takes their own shape back (the client sees the buff id leave Player.fx). */
export function endForm(h: SkillHost, id: string) {
  const u = h.unit(id);
  if (!u) return;
  const b = formBuff(u, h.now());
  if (!b) return;
  u.sk.buffs = u.sk.buffs.filter((x) => x !== b);
  h.fx({ ev: "unform", id, s: b.id });
}

export function addBuff(h: SkillHost, id: string, skill: string, b: BuffDef, rank: number, stacks = 0) {
  const u = live(h, id);
  if (!u) return;
  const until = h.now() + b.ms * rankTime(rank);
  u.sk.buffs = u.sk.buffs.filter((x) => x.id !== skill);
  u.sk.buffs.push({ id: skill, until, b, rank, stacks });
  if (b.heal && u.maxHp) h.heal(id, u.maxHp * b.heal / 100 * rankPower(rank));
  h.fx({ ev: "buff", id, s: skill, ms: until - h.now() });
}

// ---- Effects that reach the group (party buffs, auras, shields) -------------------------------------------------

/** A party aura's buff (FieldDef.party) lasts this much longer than one field tick: it ends this soon after stepping out. */
export const FIELD_PARTY_LINGER_MS = 600;

/**
 * The caster and their group allies within r of (x, y), for heals and buffs that reach the party. Only group members
 * (SkillHost.allies), never other heroes; hosts without groups (the balance sims) give just the caster.
 */
export function party(h: SkillHost, id: string, x: number, y: number, r: number): string[] {
  return [id, ...(r > 0 && h.allies ? h.allies(x, y, r, id) : [])];
}

/**
 * Gives `targetId` the buff of skill `skillId` cast by `from` (a party buff, an aura tick). One per skill id per hero,
 * so two casters of the same skill don't stack: if the running one is at least as strong (rank x power), it only runs
 * longer (no "buff" event, like the Child of the Night top-up); otherwise the new one replaces it. Shields keep the
 * bigger pool. A heal (BuffDef.heal) lands on every call, credited to `from`. `ms` overrides the buff's time.
 */
export function shareBuff(h: SkillHost, from: string, targetId: string, skillId: string, b: BuffDef, rank: number, power: number, ms?: number): ActiveBuff | undefined {
  const u = live(h, targetId);
  if (!u) return undefined;
  const now = h.now(), until = now + (ms ?? b.ms * rankTime(rank));
  const caster = h.unit(from);
  const pool = b.shield && caster?.maxHp ? caster.maxHp * b.shield / 100 * power : 0;
  const cur = u.sk.buffs.find((x) => x.id === skillId && x.until > now);
  let out: ActiveBuff;
  if (cur && from && cur.from === from) {
    // the same caster again (an aura tick, a recolour, a recast): it takes the new strength in place, no new event
    cur.b = b; cur.rank = rank; cur.power = power; cur.until = Math.max(cur.until, until);
    if (pool > (cur.shield ?? 0)) cur.shield = pool;
    out = cur;
  } else if (cur && cur.rank * (cur.power ?? 1) >= rank * power) {
    cur.until = Math.max(cur.until, until);
    if (pool > (cur.shield ?? 0)) cur.shield = pool;
    out = cur;
  } else {
    const keep = Math.max(pool, cur?.shield ?? 0);
    u.sk.buffs = u.sk.buffs.filter((x) => x.id !== skillId);
    out = { id: skillId, until, b, rank, stacks: 0, power, from, shield: b.shield ? keep : undefined };
    u.sk.buffs.push(out);
    h.fx({ ev: "buff", id: targetId, s: skillId, ms: until - now });
  }
  if (b.heal && u.maxHp) allyHeal(h, from, targetId, u.maxHp * b.heal / 100 * power);
  return out;
}

/** A buff skill with BuffDef.party / shield goes off: the caster and every group ally within `party` px get it. */
export function partyBuff(h: SkillHost, id: string, skillId: string, b: BuffDef, rank: number, power: number) {
  const u = live(h, id);
  if (!u) return;
  for (const t of party(h, id, u.x, u.y, b.party ?? 0)) shareBuff(h, id, t, skillId, b, rank, power);
}

/**
 * Before damage takes life: the unit's shields (BuffDef.shield) soak it up, the newest pool first. Returns the damage
 * left over. A pool that runs dry ends its buff with a "shieldbreak" event.
 */
export function absorbDamage(h: SkillHost, id: string, dmg: number): number {
  const u = h.unit(id);
  if (!u || dmg <= 0 || !u.sk.buffs.some((b) => b.shield)) return dmg;
  const now = h.now();
  for (let i = u.sk.buffs.length - 1; i >= 0 && dmg > 0; i--) { // addBuff/shareBuff push, so the last is the newest
    const b = u.sk.buffs[i];
    if (!b.shield || b.until <= now) continue;
    const take = Math.min(b.shield, dmg);
    b.shield -= take; dmg -= take;
    if (b.shield <= 0) {
      b.until = 0;
      h.fx({ ev: "shieldbreak", id, s: b.id, x: Math.round(u.x), y: Math.round(u.y) });
    }
  }
  if (u.sk.buffs.some((b) => b.until <= now)) u.sk.buffs = u.sk.buffs.filter((b) => b.until > now);
  return dmg;
}

function doMove(h: SkillHost, id: string, s: SkillDef, m: MoveDef, power: number, t: number, at?: number, imb?: Imbue) {
  const u = live(h, id)!;
  const now = h.now();
  const [ax, ay] = h.aim(id);
  const fx0 = u.x, fy0 = u.y;
  if (m.invulnMs) h.invuln(id, now + m.invulnMs);
  switch (m.kind) {
    case "dash": case "leap": {
      const cut = new Set<string>();
      h.move(id, ax, ay, m.kind === "leap" && at !== undefined ? at : m.dist, () => { if (m.path) for (const e of h.enemies(u.x, u.y, 14, id)) cut.add(e); });
      for (const e of cut) h.hit(id, e, baseDmg(h, id, { wpn: m.path }) * power, [ax, ay], { skill: true, kb: 0.6, imb });
      break;
    }
    case "blink": case "back": {
      const dir = m.kind === "back" ? -1 : 1;
      for (let d = m.kind === "blink" && at !== undefined ? at : m.dist; d >= 8; d -= 8) if (h.place(id, u.x + ax * d * dir, u.y + ay * d * dir)) break;
      break;
    }
    case "behind": {
      const tid = nearest(h, id, u.x, u.y, m.dist);
      if (tid) behind(h, id, tid);
      else for (let d = m.dist / 2; d >= 8; d -= 8) if (h.place(id, u.x + ax * d, u.y + ay * d)) break;
      break;
    }
    case "multi": {
      const hits = m.hits ?? 3, every = m.everyMs ?? 150;
      h.invuln(id, now + Math.max(m.invulnMs ?? 0, hits * every + 100));
      let prev = "";
      for (let i = 0; i < hits; i++) {
        h.later(i * every, () => {
          const me = live(h, id);
          if (!me) return;
          const all = h.enemies(me.x, me.y, m.dist, id);
          const pick = all.filter((x) => x !== prev);
          const tid = (pick.length ? pick : all)[Math.floor(Math.random() * (pick.length || all.length))];
          if (!tid) return;
          prev = tid;
          const fx = me.x, fy = me.y;
          behind(h, id, tid);
          h.fx({ ev: "move", id, s: s.id, kind: "blink", fx, fy, x: me.x, y: me.y, i });
          h.hit(id, tid, baseDmg(h, id, { wpn: m.wpn ?? 1 }) * power, pushFrom(h, me.x, me.y, tid), { skill: true, kb: 0.3, imb });
        });
      }
      return;
    }
  }
  h.fx({ ev: "move", id, s: s.id, kind: m.kind, fx: fx0, fy: fy0, x: u.x, y: u.y });
}

/** Step just behind `tid` (seen from where `id` stands) and face it. */
function behind(h: SkillHost, id: string, tid: string) {
  const u = h.unit(id)!, t = h.unit(tid)!;
  const [dx, dy] = norm(t.x - u.x, t.y - u.y);
  if (!h.place(id, t.x + dx * 14, t.y + dy * 14)) h.place(id, t.x - dx * 14, t.y - dy * 14);
  h.face(id, t.x - u.x, t.y - u.y);
}

function nearest(h: SkillHost, id: string, x: number, y: number, r: number): string | undefined {
  let best: string | undefined, bd = Infinity;
  for (const e of h.enemies(x, y, r, id)) {
    const t = h.unit(e)!;
    const d = Math.hypot(t.x - x, t.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/** One area hit (and its waves). `at` fixes the centre; otherwise it is ahead of the hero (or on the hero, following them). */
export function area(h: SkillHost, id: string, s: SkillDef | { id: string }, a: AreaDef, power: number, t: number, at?: [number, number], cry = false, imb?: Imbue) {
  const u = h.unit(id);
  if (!u) return;
  const [ax, ay] = h.aim(id);
  const fixed = at ?? (a.ahead || a.scatter ? [u.x + ax * (a.ahead ?? 0), u.y + ay * (a.ahead ?? 0)] as [number, number] : undefined);
  const waves = a.waves ?? 1;
  const dmg = baseDmg(h, id, a) * power;
  for (let i = 0; i < waves; i++) {
    const go = () => {
      const me = h.unit(id);
      if (!me || (me.dead && !fixed)) return;
      let [cx, cy] = fixed ?? [me.x, me.y];
      if (a.line) { cx += ax * a.line * i; cy += ay * a.line * i; }
      if (a.scatter) { const ang = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * a.scatter; cx += Math.cos(ang) * d; cy += Math.sin(ang) * d; }
      if (!cry) h.fx({ ev: "area", id, s: s.id, x: cx, y: cy, r: a.r, look: a.look ?? "burst", i, n: waves, imb: imb?.style });
      const strike = () => {
        if (!h.unit(id)) return;
        const hit = h.enemies(cx, cy, a.r, id);
        // Exsanguinate: a stream of blood from every victim into the caster
        if (a.siphon && hit.length) h.fx({ ev: "siphon", id, s: s.id, pts: hit.map((e) => { const tu = h.unit(e)!; return [Math.round(tu.x), Math.round(tu.y)]; }) });
        for (const e of hit) {
          // Hemorrhage: a bleeding foe takes what is left of its bleed all at once
          let extra = 0;
          const tu0 = a.rupture ? h.unit(e) : undefined;
          if (tu0 && h.now() < tu0.sk.burnUntil && tu0.sk.burnBy) {
            extra = tu0.sk.burnDps * (tu0.sk.burnUntil - h.now()) / 1000 * a.rupture!;
            tu0.sk.burnUntil = 0;
            h.fx({ ev: "rupture", id, t: e, x: Math.round(tu0.x), y: Math.round(tu0.y) });
          }
          if (a.pull) {
            const tu = h.unit(e);
            if (tu) { const [px, py] = norm(cx - tu.x, cy - tu.y); h.move(e, px, py, Math.min(a.pull, Math.hypot(cx - tu.x, cy - tu.y))); }
          }
          h.hit(id, e, dmg + extra, pushFrom(h, cx, cy, e), { ...effects(a, t), skill: true, kb: a.kb ?? (dmg > 0 ? 1 : 0), imb });
        }
      };
      // A falling blade / meteor / arrow rain hurts when it lands (impactMs), in step with its animation
      const land = cry ? 0 : impactMs(a.look, a.r);
      if (land > 0) h.later(land, strike); else strike();
    };
    const delay = (a.delayMs ?? 0) + i * (a.everyMs ?? 0);
    if (delay > 0) h.later(delay, go); else go();
  }
}

function fire(h: SkillHost, id: string, skill: string, d: ShotDef, rank: number, power: number, x: number, y: number, aim: [number, number], imb?: Imbue) {
  // Ranks that add projectiles widen the fan with them (Bat Swarm, Rat Plague) and/or let them pass through more foes
  const more = d.perRank ? Math.max(0, rank - 1) : 0;
  if (more) d = { ...d, n: (d.n ?? 1) + (d.perRank!.n ?? 0) * more, spread: d.spread && d.perRank!.n ? d.spread * (1 + 0.12 * more) : d.spread, pierce: (d.pierce ?? 0) + (d.perRank!.pierce ?? 0) * more,
    bounce: d.bounce !== undefined || d.perRank!.bounce ? (d.bounce ?? 0) + (d.perRank!.bounce ?? 0) * more : undefined };
  const n = d.n ?? 1;
  const base = Math.atan2(aim[1], aim[0]);
  const t = rankTime(rank);
  const dmg = baseDmg(h, id, d) * power;
  for (let i = 0; i < n; i++) {
    const k = n > 1 ? i - (n - 1) / 2 : 0;
    const ang = base + (d.spread && n > 1 ? (k * d.spread / (n - 1)) * Math.PI / 180 : 0) + (d.jitter ? (Math.random() * 2 - 1) * d.jitter.deg * Math.PI / 180 : 0);
    const speed = d.jitter ? d.speed * (1 + (Math.random() * 2 - 1) * d.jitter.speed) : d.speed;
    const range = d.jitter?.range ? d.range * (1 + (Math.random() * 2 - 1) * d.jitter.range) : d.range;
    const vx = Math.cos(ang), vy = Math.sin(ang);
    const lane = d.lanes ? k * d.lanes : 0;
    h.shoot({
      owner: id, skill, x: x + vx * 6 - aim[1] * lane, y: y - 4 + vy * 6 + aim[0] * lane, vx, vy,
      kind: d.kind, speed, range, radius: d.radius, size: d.size ?? 1, dmg,
      pierce: d.pierce ?? 0, explode: d.explode ?? 0, chain: d.chain ?? 0, field: d.field, rank, power, pulse: d.pulse, bounce: d.bounce,
      ...effects(d, t), imb,
    });
  }
}

// ---- Projectiles -------------------------------------------------------------------------------------

/** A skill projectile hits `tid` (the host keeps flying it if it pierces). */
export function shotHit(h: SkillHost, s: ShotSpec, tid: string) {
  const exploding = s.explode > 0 && s.pierce <= 0;
  h.hit(s.owner, tid, s.dmg, [s.vx, s.vy], { stunMs: s.stunMs, slowMs: exploding ? undefined : s.slowMs, burn: s.burn, markMs: s.markMs, weakMs: s.weakMs, drain: s.drain,
    leechMs: s.leechMs, bleed: s.bleed, kb: s.kb ?? 1, skill: true, imb: s.imb, pet: s.pet, sound: s.sound });
  if (s.chain > 0) chain(h, s.owner, tid, s.chain, s.dmg, s);
}

function chain(h: SkillHost, owner: string, from: string, hops: number, dmg: number, e: HitEffects) {
  const done = new Set([from]);
  const f0 = h.unit(from);
  if (!f0) return;
  const pts: [number, number][] = [[f0.x, f0.y]];
  let cur = f0;
  for (let i = 0; i < hops; i++) {
    const next = h.enemies(cur.x, cur.y, 72, owner).filter((x) => !done.has(x))
      .sort((a, b) => { const A = h.unit(a)!, B = h.unit(b)!; return Math.hypot(A.x - cur.x, A.y - cur.y) - Math.hypot(B.x - cur.x, B.y - cur.y); })[0];
    if (!next) break;
    done.add(next);
    dmg *= 0.8;
    const n = h.unit(next)!;
    pts.push([n.x, n.y]);
    h.hit(owner, next, dmg, pushFrom(h, cur.x, cur.y, next), { stunMs: e.stunMs, slowMs: e.slowMs, kb: 0.3, skill: true, imb: (e as ShotSpec).imb, pet: (e as ShotSpec).pet, sound: e.sound });
    cur = n;
  }
  if (pts.length > 1) h.fx({ ev: "chain", id: owner, pts });
}

/** A skill projectile stops at (x, y): explosion and ground effect. */
/** A pulsing projectile (ShotDef.pulse) flew `every` px further: it sets off its area and/or shoots its shard ring from where it is now. */
export function shotPulse(h: SkillHost, s: ShotSpec, x: number, y: number) {
  const p = s.pulse;
  if (!p) return;
  const i = s.pulses = (s.pulses ?? 0) + 1;
  if (p.area) area(h, s.owner, { id: s.skill }, p.area, s.power, rankTime(s.rank), [x, y], false, s.imb);
  if (p.shards) {
    const n = p.shards.n ?? 1;
    const a = Math.atan2(s.vy, s.vx) + (i * (p.turn ?? 0)) * Math.PI / 180;
    // n shots fanned over 360 * (n-1)/n degrees = evenly all around; fire() lifts shots 4 px, so start 4 px lower
    fire(h, s.owner, s.skill, { ...p.shards, spread: 360 * (n - 1) / n }, s.rank, s.power, x, y + 4, [Math.cos(a), Math.sin(a)], s.imb);
  }
}

export function shotEnd(h: SkillHost, s: ShotSpec, x: number, y: number) {
  if (s.explode > 0) {
    area(h, s.owner, { id: s.skill }, { r: s.explode, dmg: 0, slowMs: s.slowMs, burn: s.burn, kb: s.kb, look: "burst" }, 1, 1, [x, y], false, s.imb);
    // the explosion's damage is the projectile's own
    if (s.dmg > 0) for (const e of h.enemies(x, y, s.explode, s.owner)) h.hit(s.owner, e, s.dmg * 0.6, pushFrom(h, x, y, e), { kb: s.kb ?? 1, skill: true, imb: s.imb, sound: s.sound });
  }
  if (s.field) h.addField({ owner: s.owner, skill: s.skill, def: s.field, rank: s.rank, power: s.power, x, y, until: h.now() + s.field.ms * rankTime(s.rank), nextTick: h.now(), imb: s.imb });
}

// ---- Ground effects ----------------------------------------------------------------------------------

/** Advance a ground effect. Returns false when it is over (the host removes it). */
export function tickField(h: SkillHost, f: FieldInst): boolean {
  const now = h.now();
  const o = h.unit(f.owner);
  if (now >= f.until) { if (f.def.hole) holeClose(h, f); return false; }
  if (f.def.follow) {
    if (!o || o.dead) return false;
    f.x = o.x; f.y = o.y;
  }
  // Blood Link: the cord snaps when the bound enemy dies or gets too far away
  const tu = f.def.link ? (f.target ? live(h, f.target) : undefined) : undefined;
  if (f.def.link && (!tu || !o || o.dead || Math.hypot(tu.x - o.x, tu.y - o.y) > f.def.link.breakAt)) return false;
  if (now < f.nextTick) return true;
  f.nextTick = now + songTick(f, o);
  f.ticks = (f.ticks ?? 0) + 1;
  let d = f.def;
  const t = rankTime(f.rank);
  if (f.song) {
    // a song takes colour from the tiles around: water slows longer, a well carries it further, stone rings its low notes
    const ac = acousticsAt(f.x, f.y);
    if (ac.radius !== 1 || ac.slow !== 1 || (ac.low !== 1 && f.tune?.pitch === "L"))
      d = { ...d, r: d.r * ac.radius, slowMs: d.slowMs && d.slowMs * ac.slow, dmg: d.dmg && (f.tune?.pitch === "L" ? d.dmg * ac.low : d.dmg) };
  }
  f.reach = d.r;
  if (d.link && f.ally) {
    // Transfusion: the vampire's blood runs down the cord into the ally (never below 1 HP of his own)
    const give = Math.round((o!.maxHp ?? 0) * (d.link.give ?? 0) / 100);
    if (give <= 0 || (o!.hp ?? 0) <= give + 1) return false;
    o!.hp = (o!.hp ?? 0) - give;
    h.heal(f.target!, give * 1.5 * f.power);
    h.fx({ ev: "drain", id: f.target, t: f.owner });
    return true;
  }
  if (d.link) {
    h.hit(f.owner, f.target!, baseDmg(h, f.owner, d) * f.power, [0, 0], { ...effects(d, t), kb: 0, skill: true, dot: true, imb: f.imb });
    return true;
  }
  // Party aura: the owner and group allies inside get its buff, lasting just past the next tick
  if (d.party) {
    // a Songweaver's aura: its mode's ally colour, the crescendo so far (Anthem), and Legato's linger
    const tune = f.tune, cres = tune?.crescendo ? 1 + tune.crescendo * Math.max(0, (f.ticks ?? 1) - 1) : 1;
    const pb = tune ? scaleBuff(d.party, MODES[tune.mode].ally * cres) : d.party;
    const ms = d.tickMs + FIELD_PARTY_LINGER_MS + (tune ? legatoMs(o) : 0);
    for (const t of party(h, f.owner, f.x, f.y, d.r)) {
      const tu = live(h, t);
      if (tu && Math.hypot(tu.x - f.x, tu.y - f.y) <= d.r) shareBuff(h, f.owner, t, f.skill, pb, f.rank, (f.allyPower ?? f.power) * cres, ms);
    }
  }
  const inside = h.enemies(f.x, f.y, d.r, f.owner);
  // Fields that drag foes in (Black Hole): every tick, heroes held for less (SUMMON.pvp.cc)
  if (d.pull) for (const e of inside) {
    const tu = h.unit(e);
    if (!tu) continue;
    const dist = Math.hypot(f.x - tu.x, f.y - tu.y);
    if (dist < 3) continue;
    const [px, py] = norm(f.x - tu.x, f.y - tu.y);
    h.move(e, px, py, Math.min(dist, d.pull * (tu.cls ? SUMMON.pvp.cc : 1)));
  }
  if (d.trap) {
    if (!inside.length) return true;
    if (d.burst) area(h, f.owner, { id: f.skill }, d.burst, f.power, t, [f.x, f.y], false, f.imb);
    return false;
  }
  if (d.zap) {
    const pick = [...inside].sort(() => Math.random() - 0.5).slice(0, d.zap.n);
    for (const e of pick) {
      const tu = h.unit(e);
      if (!tu) continue; // gone this tick (a summon in the balance sims has no unit)
      h.fx({ ev: "zap", id: f.owner, s: f.skill, x1: f.x, y1: f.y, x2: tu.x, y2: tu.y, sky: f.def.kind === "storm" });
      h.hit(f.owner, e, d.zap.dmg * h.magic(f.owner) * f.power, [0, 0], { stunMs: d.zap.stunMs, drain: d.drain, kb: 0, skill: true, imb: f.imb });
    }
    // Storm: some bolts strike empty ground too, for the look
    if (d.kind === "storm" && pick.length < d.zap.n) {
      const ang = Math.random() * Math.PI * 2, rr = Math.random() * d.r;
      h.fx({ ev: "zap", id: f.owner, s: f.skill, x1: f.x, y1: f.y, x2: f.x + Math.cos(ang) * rr, y2: f.y + Math.sin(ang) * rr, sky: true });
    }
  }
  if (d.turret) {
    const tid = nearest(h, f.owner, f.x, f.y, d.r);
    if (tid) {
      const tu = h.unit(tid)!;
      const aim = norm(tu.x - f.x, tu.y - f.y);
      h.fx({ ev: "turret", id: f.owner, s: f.skill, x: f.x, y: f.y });
      fire(h, f.owner, f.skill, d.turret, f.rank, f.power, f.x, f.y - 6, aim, f.imb);
    }
  }
  if (d.wpn || d.dmg || d.slowMs || d.weakMs) {
    let dmg = baseDmg(h, f.owner, d) * f.power, fx: HitEffects & { el?: AttuneElement } = effects(d, t);
    if (d.blades) {
      // Void Blades: more blades cut harder; they take the golem's element (two different golems: they alternate)
      dmg *= Math.max(1, d.blades / BLADES_BASE);
      const els = [...new Set(h.golemEls?.(f.owner) ?? [])];
      if (els.length) {
        const el = els[Math.floor(now / d.tickMs) % els.length];
        dmg *= WISP.resonance;
        fx = { ...fx, ...BLADE_EL[el], el };
      }
    }
    for (const e of inside) h.hit(f.owner, e, dmg, pushFrom(h, f.x, f.y, e), { ...fx, kb: d.kb ?? 0, skill: true, dot: !d.kb, imb: f.imb });
  }
  if (d.heal && o && !o.dead && o.maxHp && Math.hypot(o.x - f.x, o.y - f.y) <= d.r) h.heal(f.owner, o.maxHp * d.heal / 100 * (f.allyPower ?? f.power));
  // Black Hole: monsters worn down past its threshold are swallowed at once
  if (d.hole) for (const e of inside) {
    const tu = h.unit(e);
    if (tu && !tu.dead && !tu.cls && tu.maxHp && (tu.hp ?? 0) <= tu.maxHp * d.hole.below) swallow(h, f, e);
  }
  return true;
}

/** A Black Hole swallows monster `e`: spat out a little further away, the Summoner gains a charge of Essence. */
function swallow(h: SkillHost, f: FieldInst, e: string) {
  if (!h.voidHop?.(f.owner, e, true, f.x, f.y)) return;
  gainEssence(h, f.owner);
  h.fx({ ev: "swallow", id: f.owner, t: e, x: Math.round(f.x), y: Math.round(f.y) });
}

/** A Black Hole closes: every monster still inside is swallowed, every hero thrown out of it. */
function holeClose(h: SkillHost, f: FieldInst) {
  for (const e of h.enemies(f.x, f.y, f.def.r, f.owner)) {
    const tu = h.unit(e);
    if (!tu || tu.dead) continue;
    if (tu.cls) h.voidHop?.(f.owner, e, false, f.x, f.y);
    else swallow(h, f, e);
  }
  h.fx({ ev: "holeclose", id: f.owner, s: f.skill, x: Math.round(f.x), y: Math.round(f.y), r: f.def.r });
}

// ---- Hooks for the host's damage code ----------------------------------------------------------------

const buffsOf = (u: Unit | undefined, now: number) => (u ? u.sk.buffs.filter((b) => b.until > now) : []);

/** Multiplier on damage dealt by `u` (buffs, stacks spent on Berserk, weakened). */
export function dealtMult(u: Unit | undefined, now: number): number {
  if (!u) return 1;
  let m = 1;
  for (const b of buffsOf(u, now)) m += ((b.b.dmg ?? 0) + (b.b.perStack ?? 0) * b.stacks) / 100;
  if (now < u.sk.weakUntil) m *= 1 - WEAK_DEALT;
  return m;
}
/** Multiplier on damage taken by `u` (armour buffs, marked). */
export function takenMult(u: Unit | undefined, now: number): number {
  if (!u) return 1;
  let m = 1;
  for (const b of buffsOf(u, now)) if (b.b.armor) m *= 1 - b.b.armor / 100;
  if (now < u.sk.markUntil) m *= 1 + MARK_TAKEN;
  return m;
}
const sum = (u: Unit | undefined, now: number, k: "speed" | "atkspd" | "lifesteal" | "regen" | "poise") => buffsOf(u, now).reduce((s, b) => s + (b.b[k] ?? 0), 0);
/** Share of poise drain that buffs hold off (Marching Tune), at most 80%. */
export const buffPoise = (u: Unit | undefined, now: number) => Math.min(80, sum(u, now, "poise")) / 100;
export const speedMult = (u: Unit | undefined, now: number) => 1 + sum(u, now, "speed") / 100;
export const atkSpeedMult = (u: Unit | undefined, now: number) => 1 + sum(u, now, "atkspd") / 100;
export const buffLifesteal = (u: Unit | undefined, now: number) => sum(u, now, "lifesteal") / 100;
export const buffRegen = (u: Unit | undefined, now: number) => sum(u, now, "regen") / 100;
/** Cooldown multiplier from buffs (Void Velocity's -% cooldowns). */
export function buffCdr(u: Unit | undefined, now: number): number { let m = 1; for (const b of buffsOf(u, now)) if (b.b.cdr) m *= 1 - b.b.cdr / 100; return m; }
export const blocking = (u: Unit | undefined, now: number) => buffsOf(u, now).some((b) => b.b.block);
export const ccImmune = (u: Unit | undefined, now: number) => buffsOf(u, now).some((b) => b.b.immune);
export const charging = (u: Unit | undefined, now: number) => !!u && now < u.sk.chargeUntil;
/** In a melee skill's wind-up: no basic attack until its blow lands. */
export const winding = (u: Unit | undefined, now: number) => !!u && now < (u.sk.windUntil ?? 0);

/**
 * Before a hit lands on `tid`: a counter stance eats it and strikes back. Returns true when the hit is cancelled.
 * `from` is the attacker if known (else the counter goes for the nearest enemy).
 */
export function counterHit(h: SkillHost, tid: string, from: string | undefined, dmg: number, o: HitOpts): boolean {
  const u = live(h, tid);
  const now = h.now();
  const c = u?.sk.counter;
  if (!u || !c || o.dot || o.thorn) return false;
  if (now >= c.until) { u.sk.counter = undefined; return false; }
  u.sk.counter = undefined;
  const cd = c.s.counter!;
  const t = rankTime(c.rank);
  const fu = from ? live(h, from) : undefined;
  const foe = fu && Math.hypot(fu.x - u.x, fu.y - u.y) < 90 ? from : nearest(h, tid, u.x, u.y, 70);
  const fx0 = u.x, fy0 = u.y;
  const f = foe ? h.unit(foe) : undefined;
  if (f) h.face(tid, f.x - u.x, f.y - u.y);
  if (cd.blink === "behind" && foe) behind(h, tid, foe);
  if (cd.blink === "back") {
    const [dx, dy] = f ? norm(u.x - f.x, u.y - f.y) : h.aim(tid).map((v) => -v) as [number, number];
    h.move(tid, dx, dy, 50);
    if (f) h.face(tid, f.x - u.x, f.y - u.y);
  }
  h.invuln(tid, now + 250);
  h.fx({ ev: "countered", id: tid, s: c.s.id, fx: fx0, fy: fy0, x: u.x, y: u.y, tx: f?.x, ty: f?.y });
  if (foe && f) {
    const back = baseDmg(h, tid, cd) * c.power + (cd.reflect ? dmg * cd.reflect : 0);
    if (back > 0 || cd.effects) h.hit(tid, foe, back, norm(f.x - u.x, f.y - u.y), { ...effects(cd.effects ?? {}, t), kb: cd.effects?.kb ?? 1, skill: true, crit: cd.blink === "behind", thorn: true });
  }
  if (cd.area) area(h, tid, c.s, cd.area, c.power, t, [u.x, u.y]);
  if (cd.shot) fire(h, tid, c.s.id, cd.shot, c.rank, c.power, u.x, u.y, h.aim(tid));
  if (cd.buff) addBuff(h, tid, c.s.id, cd.buff, c.rank);
  return true;
}

/** After damage landed on `tid`: debuffs, enchantments on basic attacks, stacks, thorns. */
export function afterHit(h: SkillHost, from: string | undefined, tid: string, o: HitOpts) {
  const now = h.now();
  const t = h.unit(tid);
  if (!t || t.dead) return;
  const a = from ? h.unit(from) : undefined;
  const e: HitEffects[] = [o];
  if (a && o.basic) {
    // Basic hits build stacks and carry enchantments (not the Summoner's Essence: it comes from the Void)
    // the Songweaver has no Tempo: her waves fill the song gauge instead, the strum more (DI-3)
    if (usesGauge(a.cls)) fillGauge(h, from!, o.sound?.strum ? GAUGE.strum : GAUGE.basic);
    else if (a.cls !== "summoner") { a.sk.stacks = Math.min(MAX_STACKS, a.sk.stacks + 1); a.sk.stackAt = now; }
    for (const b of buffsOf(a, now)) if (b.b.onHit) {
      e.push(effects(b.b.onHit, rankTime(b.rank)));
      if (b.b.onHit.burn) h.fx({ ev: "enchanthit", id: from, s: b.id, x: t.x, y: t.y });
    }
  } else if (o.imb && from && !o.dot) {
    // A skill cast while enchanted (Fire Arrows + Volley): its hits carry the enchantment too
    e.push(o.imb.fx);
    h.fx({ ev: "enchanthit", id: from, s: o.imb.id, x: t.x, y: t.y });
  }
  // Leech: while the foe still bleeds from it, every hit the vampire lands (not the bleed itself) gives a Blood stack
  if (a && from && !o.dot && !o.thorn && !o.leechMs && now < t.sk.leechUntil && t.sk.leechBy === from) {
    a.sk.stacks = Math.min(MAX_STACKS, a.sk.stacks + 1);
    a.sk.stackAt = now;
  }
  const immune = ccImmune(t, now);
  for (const x of e) {
    if (x.burn && from) {
      const [dps, ms] = x.burn;
      // keep the stronger burn
      if (now >= t.sk.burnUntil || dps * ms >= t.sk.burnDps * (t.sk.burnUntil - now)) {
        t.sk.burnDps = dps * (a ? h.magic(from) : 1); t.sk.burnUntil = now + ms; t.sk.burnBy = from; t.sk.bleed = x.bleed ?? "";
        if (t.sk.burnNext < now) t.sk.burnNext = now + 500;
      }
    }
    if (x.leechMs && from) { t.sk.leechUntil = Math.max(t.sk.leechUntil, now + x.leechMs); t.sk.leechBy = from; }
    if (x.markMs) t.sk.markUntil = Math.max(t.sk.markUntil, now + x.markMs);
    if (x.weakMs) t.sk.weakUntil = Math.max(t.sk.weakUntil, now + x.weakMs);
    if (x.fearMs && !immune) h.fear(tid, x.fearMs);
  }
  if (o.sound && from && !o.thorn) resonate(h, from, tid, o); // a Songweaver's sound rings in whoever hears it
  // Thorns (Frost Armor): whoever hits you up close pays
  if (a && from && !o.dot && !o.thorn && Math.hypot(a.x - t.x, a.y - t.y) < 48) {
    for (const b of buffsOf(t, now)) if (b.b.thorns) {
      h.hit(tid, from, baseDmg(h, tid, b.b.thorns), norm(a.x - t.x, a.y - t.y), { ...effects(b.b.thorns, 1), kb: 0, skill: true, thorn: true });
      h.fx({ ev: "thorns", id: tid, s: b.id, x: a.x, y: a.y });
    }
  }
}

/** Bloodlust (passive.kill): the hero `id` just killed someone; learned passives with a kill buff give it. */
export function onKill(h: SkillHost, id: string) {
  const u = live(h, id);
  if (!u?.cls) return;
  for (const s of SKILLS[u.cls]) {
    const r = rankOf(u.talents, s.id);
    if (r > 0 && s.passive?.kill) addBuff(h, id, s.id, s.passive.kill, r);
  }
}

/**
 * Rise Again (passive.rise, Blood Pact): a blow that would kill hero `id` leaves them at the passive's share of their
 * life instead, once per its cooldown. Returns true when they rose (the host must not kill them).
 */
export function riseAgain(h: SkillHost, id: string): boolean {
  const u = h.unit(id);
  if (!u?.cls || !u.maxHp) return false;
  const now = h.now();
  for (const s of SKILLS[u.cls]) {
    const rise = s.passive?.rise;
    if (!rise || rankOf(u.talents, s.id) <= 0) continue;
    const key = "rise:" + s.id;
    if (now - (u.sk.last[key] ?? -Infinity) < rise.cdMs) continue;
    u.sk.last[key] = now;
    u.hp = Math.max(1, Math.round(u.maxHp * rise.hp / 100));
    h.invuln(id, now + 1200);
    h.fx({ ev: "rise", id, s: s.id, x: Math.round(u.x), y: Math.round(u.y) });
    h.fx({ ev: "buff", id, s: s.id, ms: rise.cdMs }); // the buff row counts down until it is ready again
    return true;
  }
  return false;
}

const NIGHT_BUFF_ID = "v_nightborn";

/** Every tick for every hero and monster. */
export function tickUnit(h: SkillHost, id: string) {
  const u = h.unit(id);
  if (!u) return;
  const now = h.now();
  const sk = u.sk;
  if (u.dead) { sk.burnUntil = 0; sk.buffs = []; sk.counter = undefined; sk.stacks = 0; sk.chargeUntil = 0; sk.windUntil = 0; if (sk.notes?.length) sk.notes = []; sk.res = 0; sk.song = undefined;
    if (usesGauge(u.cls)) u.mana = 0; // the song gauge empties on death
    return; }
  if (usesGauge(u.cls)) tickGauge(h, id, u, now);
  if (sk.notes?.length && now - sk.noteAt > NOTES.idleMs) sk.notes = []; // forgotten after a long pause
  if (sk.buffs.length && sk.buffs.some((b) => b.until <= now)) sk.buffs = sk.buffs.filter((b) => b.until > now);
  if (sk.counter && now >= sk.counter.until) sk.counter = undefined;
  if (sk.stacks > 0 && now - sk.stackAt > (u.cls === "summoner" ? ESSENCE.decayMs : STACK_DECAY_MS)) sk.stacks = 0;
  // Summoner: each living golem keeps the aura of its element topped up (shared/summons.ts AURA, RESONANCE)
  if (u.cls === "summoner" && h.golemEls) {
    const want = auraBuffs(h.golemEls(id), 1 + talentBonus(u.cls, u.talents ?? {}, "resonance") / 100);
    for (const b of sk.buffs) if (isAuraId(b.id) && !want.some((w) => w.id === b.id)) b.until = 0;
    for (const w of want) {
      const b = sk.buffs.find((x) => x.id === w.id && x.until > now);
      if (b) { b.b = w.b; if (b.until - now < 600) b.until = now + w.b.ms; }
      else { sk.buffs.push({ id: w.id, until: now + w.b.ms, b: w.b, rank: 1, stacks: 0 }); h.fx({ ev: "buff", id, s: w.id, ms: w.b.ms }); }
    }
    if (sk.buffs.some((b) => b.until <= now)) sk.buffs = sk.buffs.filter((b) => b.until > now);
  }
  // Child of the Night: at night the passive keeps a short buff topped up (it runs out a second or two after dawn)
  const night = u.cls && u.talents ? talentBonus(u.cls, u.talents, "night") : 0;
  if (night > 0 && h.isNight?.(id)) {
    const b = sk.buffs.find((x) => x.id === NIGHT_BUFF_ID);
    if (b) { if (b.until - now < 600) b.until = now + 2000; } // topped up in steps: the HUD buff row isn't resent every tick
    else { sk.buffs.push({ id: NIGHT_BUFF_ID, until: now + 2000, b: { ms: 2000, ...nightBuff(night) }, rank: 1, stacks: 0 }); h.fx({ ev: "buff", id, s: NIGHT_BUFF_ID, ms: 2000 }); }
  }
  if (now < sk.burnUntil && now >= sk.burnNext) {
    sk.burnNext = now + 500;
    h.hit(sk.burnBy, id, Math.max(1, sk.burnDps * 0.5), [0, 0], { dot: true, kb: 0, skill: true });
  }
}

/** Status words for the client (comma list): burn, mark, weak, counter, charge and active buff skill ids. */
export function statusOf(u: Unit, now: number): string {
  const sk = u.sk, out: string[] = [];
  if (now < sk.burnUntil) out.push(sk.bleed === "boil" ? "boil" : sk.bleed === "drip" ? "bleed" : "burn");
  if (now < sk.markUntil) out.push("mark");
  if (now < sk.weakUntil) out.push("weak");
  if (sk.counter && now < sk.counter.until) out.push("counter:" + sk.counter.s.id);
  if (now < sk.chargeUntil) out.push("charge");
  for (const b of sk.buffs) if (b.until > now) out.push(b.id);
  if (u.cls === "songweaver") {
    out.push("mode:" + (sk.mode ?? "major"));
    // chord progress for everyone to see (DI-1): the lockout, else how many notes into a progression she can finish
    if (now < sk.chordLock) out.push("chlock");
    else if (sk.notes.length) { const k = chordProgress(sk, playableProgs(u)); if (k > 0) out.push("ch" + k); }
  }
  const rw = sk.res > 0 ? resWord(resonanceOf(sk, now)) : "";
  if (rw) out.push(rw);
  return out.join(",");
}
