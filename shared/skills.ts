import { ClassKind } from "./classes";
import type { StatKind } from "./powers";
import type { Degree, ModeId, Pitch } from "./songs";

/**
 * Skill trees (press T). Every hero has 3 branches of 5 skills (the wizard's Frost branch has 6). Each branch is a small, uneven tree (TREE below):
 * a skill needs its parent skill and a hero level; some strong skills are dead ends (leaves) that lead nowhere higher.
 * Skills that need a higher level hit harder (LEVEL_POWER), and some also scale with an attribute (SkillDef.scale).
 * `row` is the skill's tier (0-4): how big its effects look and how rich its icon frame is (4 = ultimate).
 * Most skills are actives (put them on keys 1-0): attacks, auras, war cries, enchantments, buildups (charge
 * up, or spend the Fury/Ki/... stacks your basic hits build), counters, traps and ground effects. A branch has at
 * most one passive. Higher rows are stronger and much flashier (client/src/skillfx.ts).
 *
 * A skill is data: shared/skillEngine.ts runs it, the same way on the server and in the balance simulator.
 * Parts run in this order: charge (buildup) -> move -> areas -> shots -> field -> buff -> cry. Any part is optional.
 *
 * Damage: `wpn` is a multiple of the hero's weapon hit (class damage x attack stat), `dmg` is flat skill
 * damage scaled by Magic (like the old ultimates). Every extra rank adds RANK_POWER to damage and RANK_TIME to durations.
 */

export type TalentEffect = "dmg" | "skill" | "crit" | "lifesteal" | "hp" | "armor" | "speed" | "cdr" | "regen" | "mana"
  | "night" // vampire Child of the Night: stronger at night (nightBuff)
  | "summonHp" | "summonDmg" // the Summoner's golems (shared/summons.ts): +% life, +% damage
  | "summon" // both of those (Golem Mastery)
  // Summoner, Void Lord rework (shared/summons.ts): golem regen near the owner (%/s), Stone Bond share (+%), aura
  // strength (+%), second golem, black hole size (+%), after-blink rush, Void Slip, blade damage (+%), wisps, Return to the Void
  | "golemRegen" | "bond" | "resonance" | "twin" | "gravity" | "velocity" | "slip" | "edge" | "swarm" | "return"
  | "upgrade" // an upgrade node (SkillDef.mod): changes one spell instead of giving a bonus
  // Songweaver (shared/songs.ts): a mode node (unlocks Lydian / Dorian / Phrygian, +% to its colour), Legato (song buffs
  // linger s longer), Accelerando (each Tempo stack quickens song ticks %), Sympathetic Strings (+% resonance, bursts spread)
  | "mode" | "legato" | "accel" | "sympathy";

/**
 * Upgrade nodes (Murat 2026-11-07): instead of more spells, a school's tree upgrades its one spell. Each value is per
 * rank: n/zap/pierce add, explode adds px, the others are % (cd and mana negative = cheaper / shorter).
 */
export interface SkillMod {
  of: string; // the spell it upgrades
  n?: number; // more projectiles (fanned)
  dmg?: number; cd?: number; mana?: number;
  radius?: number; ms?: number; tick?: number; slow?: number; stun?: number; speed?: number; burn?: number;
  zap?: number; pierce?: number; explode?: number;
}

/** Look of a skill's effects on the client (colours and particle style). */
export type FxStyle =
  | "steel" | "holy" | "fire" | "frost" | "arcane" | "lightning" | "shadow" | "poison" | "earth" | "blood" | "wind" | "spirit" | "nature";

/** What an area hit looks like when it lands. */
export type AreaLook =
  | "slam" | "nova" | "slash" | "pillar" | "meteor" | "rain" | "sword" | "spikes" | "spirit" | "bolt" | "smoke" | "flame" | "burst"
  | "bloodrite"; // Exsanguinate: a blood ritual over the caster, the nova lands when it ends (BLOOD_RITE_MS)

export interface HitEffects {
  stunMs?: number; slowMs?: number; kb?: number;
  burn?: [dps: number, ms: number]; // damage over time (fire, poison, bleed)
  markMs?: number; // takes MARK_TAKEN more damage
  weakMs?: number; // deals WEAK_DEALT less damage
  fearMs?: number; // monsters run away dizzy; heroes are slowed and weakened
  pull?: number; // px pulled toward the centre (areas: once; fields: every tick)
  drain?: number; // % of the damage dealt that heals the attacker (vampire blood magic)
  /** Vampire Leech: for this long, every hit the caster lands on the target also gives them one Blood stack. */
  leechMs?: number;
  /** Look of the bleed this hit starts (burn): blood drips or boiling bubbles instead of flames. */
  bleed?: "drip" | "boil";
  /**
   * A sound hit (the Songweaver): the target's hearing scales it (shared/combat.ts soundMult) and it builds resonance
   * (shared/songs.ts). The skill's pitch, degree and the caster's mode are filled in when it is cast; `res` is extra
   * flat resonance (a finisher, a wave off a well).
   */
  sound?: SoundFx;
}

/** What a sound hit carries (HitEffects.sound). */
export interface SoundFx { pitch?: Pitch; deg?: Degree; mode?: ModeId; res?: number; basic?: boolean }

export interface AreaDef extends HitEffects {
  r: number; // radius, px
  ahead?: number; // centre this far in front of the hero (aim direction)
  wpn?: number; dmg?: number;
  delayMs?: number; // lands after this
  waves?: number; everyMs?: number; // repeats
  line?: number; // each wave moves this many px further ahead (a wave rolling forward)
  scatter?: number; // each wave lands at a random point within this radius of the centre
  look?: AreaLook;
  atStart?: boolean; // lands where the hero stood before moving (Blink)
  /** Exsanguinate: streams of blood run from everyone it hits into the caster (client "siphon" event). */
  siphon?: boolean;
  /** Hemorrhage (Exsanguinate): a bleeding target takes this share of what its bleed had left to deal, all at once, and stops bleeding. */
  rupture?: number;
}

export interface ShotDef extends HitEffects {
  /** Each rank above 1 adds this many projectiles (`n`, the fan widening with them) and/or extra targets passed through, and/or wall bounces. */
  perRank?: { n?: number; pierce?: number; bounce?: number };
  /** A ragged swarm, not a neat fan (Rat Plague): each shot's speed varies by up to ±`speed` (share) and its angle by ±`deg`. */
  jitter?: { speed: number; deg: number; range?: number };
  kind: string; // projectile look (client)
  n?: number; spread?: number; // n shots fanned over `spread` degrees
  lanes?: number; // or n shots side by side, this many px apart
  speed: number; range: number; radius: number; size?: number;
  wpn?: number; dmg?: number;
  pierce?: number; // extra targets it passes through
  explode?: number; // radius of the blast where it stops
  chain?: number; // jumps to this many more enemies nearby (lightning)
  /** Bounces off this many walls (server updateProjectile; shared/acoustics.ts BOUNCE: stone, wood and metal reflect, foliage swallows). */
  bounce?: number;
  field?: FieldDef; // leaves a ground effect where it stops
  /**
   * Every `every` px it flies: sets off `area` where it is, and/or shoots `shards` out of itself in a ring
   * (`shards.n` evenly spaced around it, the ring turning by `turn` degrees each time: a spiral). Frozen Orb.
   */
  pulse?: { every: number; area?: AreaDef; shards?: ShotDef; turn?: number };
}

export interface MoveDef {
  kind: "dash" | "leap" | "blink" | "back" | "behind" | "multi";
  dist: number;
  invulnMs?: number;
  path?: number; // wpn multiple dealt to everyone passed through (dash)
  hits?: number; everyMs?: number; wpn?: number; // multi: blink from enemy to enemy
}

export interface FieldDef extends HitEffects {
  kind: string; // look (client)
  r: number; ms: number; ahead?: number;
  follow?: boolean; // moves with the hero (auras)
  tickMs: number;
  wpn?: number; dmg?: number; // per tick to enemies inside
  heal?: number; // % max HP per tick to the owner while inside
  trap?: boolean; // waits until an enemy steps in, then fires once (`burst`)
  burst?: AreaDef;
  zap?: { n: number; dmg: number; stunMs?: number }; // strikes n random enemies inside per tick (lightning)
  turret?: ShotDef; // shoots the nearest enemy inside per tick
  /**
   * Blood Link: a tether from the caster to one enemy within `range` px (the one nearest the aim, picked when cast; no
   * enemy = not cast). Per tick it deals `dmg`/`wpn` to that enemy only (with its drain, slow...). It snaps when the
   * enemy dies or gets further than `breakAt` px. With `give`, a group ally nearer the aim than any enemy can be bound
   * instead (Transfusion): each tick the caster pays `give`% of max HP and the ally heals 1.5 times that.
   */
  link?: { range: number; breakAt: number; give?: number };
  /** Nightfall: it is night inside (night passives such as Child of the Night count it as night). */
  night?: boolean;
  /**
   * Black Hole (Summoner): `pull` drags foes in every tick (heroes by SUMMON.pvp.cc of it), enemy projectiles that
   * enter vanish, monsters below `below` of their life are swallowed and spat out further away, and when it closes
   * every monster still inside is swallowed and every hero thrown out a few steps (SkillHost.voidHop).
   */
  hole?: { below: number };
  /** Void Blades: this many blades circle the hero (the look; Void Edge adds more and they take the golem's element). */
  blades?: number;
  /**
   * Party aura: every tick, the owner and their group allies inside `r` get this buff (shareBuff: one per skill id, the
   * strongest wins). It lasts tickMs + FIELD_PARTY_LINGER_MS, so it ends shortly after someone steps out.
   */
  party?: BuffDef;
}

export interface BuffDef {
  ms: number;
  dmg?: number; // +% damage dealt
  speed?: number; // +% move speed
  armor?: number; // -% damage taken (negative: takes more)
  atkspd?: number; // +% attack speed
  lifesteal?: number; // % of damage dealt healed
  regen?: number; // % max HP per second
  block?: boolean; // knight Shield Wall: blocks GUARD_REDUCTION and knockback
  immune?: boolean; // no stun, slow or knockback
  heal?: number; // % max HP healed at once
  onHit?: HitEffects & { wpn?: number; chain?: number }; // enchantment: added to basic attacks (and arrows)
  thorns?: HitEffects & { wpn?: number; dmg?: number }; // hits whoever strikes you in melee range
  perStack?: number; // +% damage per stack spent (with SkillDef.consume)
  cdr?: number; // -% skill cooldowns while it lasts (Void Velocity)
  poise?: number; // -% poise drained by blows taken (Marching Tune)
  /** Bloodline (Thirst): group allies within this many px get the same buff with half its lifesteal. */
  group?: number;
  /**
   * Party buff: group allies within this many px get the same buff when it is cast (shareBuff: one per skill id per
   * hero, the stronger cast wins, a weaker one only extends it). Unlike `group`, nothing is halved.
   */
  party?: number;
  /**
   * Shield: a pool of `shield`% of the caster's max HP x the cast's power that soaks up damage before life
   * (absorbDamage, newest pool first). When the pool is used up the buff ends; the same skill's shields don't stack.
   */
  shield?: number;
  /**
   * Vampire shapeshift (Bat Form, Wolf Form): the hero takes this beast's shape while the buff lasts (the client draws
   * the beast instead of the hero). Skills of the form's own school keep the shape; any other skill turns them back
   * first, and pressing the form again ends it.
   */
  form?: BeastForm;
}

export type BeastForm = "bat" | "wolf";

export interface CounterDef {
  ms: number; // stance length
  wpn?: number; // strikes back at the attacker
  blink?: "behind" | "back"; // ...after stepping behind them or leaping away
  reflect?: number; // and returns this share of the blocked hit
  area?: AreaDef; // or explodes around you
  shot?: ShotDef; // or shoots back
  buff?: BuffDef;
  effects?: HitEffects;
}

/** What a skill needs in hand: a bow, any melee weapon (sword, katana, axe), or a shield. */
export type WeaponNeed = "bow" | "melee" | "shield";
export const NEED_TEXT: Record<WeaponNeed, string> = { bow: "a bow", melee: "a melee weapon", shield: "a shield" };

export type SkillType = "Attack" | "Aura" | "War cry" | "Enchant" | "Buildup" | "Counter" | "Trap" | "Movement" | "Passive" | "Ultimate" | "Summon" | "Upgrade";

export interface SkillDef {
  id: string; name: string; type: SkillType; desc: string;
  mod?: SkillMod; // an upgrade node: learned ranks change the spell `mod.of` (see withMods)
  maxRank?: number; // ranks it can take (default MAX_RANK); the wizard's spells go to 6 (Murat 2026-11-07)
  /** What each rank past the first adds besides RANK_POWER / RANK_TIME, for the tree sheet ("+2 bats"). */
  rankStep?: string;
  /** Hero level needed for each rank past the third (index 0 = rank 4), e.g. [30, 40]: Act 2 mastery ranks. */
  rankLevels?: number[];
  branch: 0 | 1 | 2; row: 0 | 1 | 2 | 3 | 4;
  req: number; // hero level needed (filled from TREE)
  parent?: string; // skill that must be learned first (none = root of its branch)
  scale?: { stat: StatKind; per: number }; // +per% skill power for every point of `stat` above the class's base
  style: FxStyle;
  /** `blood`: while learned, every skill (not the basic spell) also costs this % of max HP (Blood Pact). */
  passive?: {
    effect: TalentEffect; perRank: number; blood?: number;
    /** Rise Again (Blood Pact): a killing blow leaves the hero at `hp`% life instead, once every `cdMs`. */
    rise?: { hp: number; cdMs: number };
    /** Bloodlust (Undying Hunger): every kill gives this buff. */
    kill?: BuffDef;
    /** Void Velocity: a blink (Rift Step) gives a buff of `ms` with +perRank x rank % speed and -% cooldowns. */
    blink?: { ms: number };
    /**
     * Void Slip: a blow that drops the hero below `below` of their life sends them into the Void for `ms` (+`perRank`
     * per rank above 1): untouchable and unseen, monsters drop them. Once every `cdMs`; they come out with +speed%.
     */
    slip?: { below: number; ms: number; perRank: number; cdMs: number; speed: number; speedMs: number };
  };
  cd?: number; // ms
  cost?: number; // Heat (physical skills, shared/overload.ts)
  mana?: number; // Mana (spells): shared/mana.ts
  /** Blood magic (vampire): also costs this % of max HP. Can't be cast with that little HP left, and never kills. */
  blood?: number;
  chargeMs?: number; // buildup: roots the hero while charging (a stun cancels it)
  /** Melee wind-up: the hero gathers for this long (rooted, a stun cancels it) before the blow lands, matching the animation (client/src/skillMoves.ts). */
  windMs?: number;
  consume?: boolean; // spends all stacks; buff.perStack / STACK_POWER per stack
  move?: MoveDef; areas?: AreaDef[]; shots?: ShotDef; field?: FieldDef; buff?: BuffDef; counter?: CounterDef;
  cry?: AreaDef; // war cry: hits everyone around (usually no damage, only effects)
  target?: SkillTarget; // how a right click aims it (worked out by skillTarget() when not set)
  /** Weapon it needs in hand (shared/weapons.ts weaponOk): an archer holding an axe can't loose a Volley. */
  needs?: WeaponNeed;
  /** Other skills that must be learned too, besides `parent` (Diablo 2 style prerequisites; filled from REQUIRES). */
  requires?: string[];
  /** Diablo 2 style synergies: +pct% damage per rank of skill `from` (filled from SYNERGY). */
  synergy?: { from: string; pct: number }[];
  /** Basic spell (CANTRIPS): known from Lv 1 without skill points, always rank 1, cheap and meant to be cast again and again. */
  cantrip?: boolean;
  /** Damage multiplier: quick spells that can be cast again and again hit softer per cast (wizard, Diablo 2 style). */
  power?: number;
  /** Summoner (shared/summons.ts): pulls the hero's golems back out of the Void at once, whole. */
  summon?: boolean;
  /** Summoner ultimate: the hero's golems fuse into one Colossus for `ms`. */
  colossus?: { ms: number };
  /** Summoner: calls `n` elemental wisps (+1 with Swarm, at most 4) that shoot the hero's foes for `ms` (SkillHost.wisps). */
  wisps?: { n: number; ms: number };
  /** Summoner ultimate: the Void's armoury for `ms` (blade, lance, axe and the four wisps; SkillHost.arsenal). */
  arsenal?: { ms: number };
  /** Vampire Devour: bite the fleshy foe nearest the aim; a weak monster is eaten whole (shared/devour.ts feast). */
  devour?: FangDef;
  /** Vampire Bite: bite the fleshy foe nearest the aim; a weak monster may fall and rise as a thrall (shared/devour.ts THRALL). */
  bite?: FangDef;
  /** Vampire Brides: `n` brides (+`perRank` per rank above 1) fight for the hero for `ms`; each heals him `drain`% of what it deals. */
  brides?: { n: number; perRank: number; ms: number; drain: number };
  /** Vampire Charm: the foe nearest the aim within `range` px: a monster fights for the hero for `ms`; a hero, boss or elite is dazed for `daze` ms instead. */
  charm?: { range: number; ms: number; daze: number };
  // ---- Songweaver (shared/songs.ts) ----
  /** The note this skill plays: casting it logs the degree, three in a progression fire a chord (PROGRESSIONS). */
  degree?: Degree;
  /** Its register: a monster that hears at this pitch takes more and resonates more (shared/combat.ts soundMult). */
  pitch?: Pitch;
  /** A song: its `field` is a 30s party aura, one song per Songweaver (SkillRuntime.song), changed at most every SONG.changeMs. */
  song?: boolean;
  /** Modulate: switches to the next known mode and recolours the running song. Not a note in a progression. */
  modulate?: boolean;
  /** Mending Note: heals the caster `heal`% of max HP, then jumps to the nearest group ally within `range` (x0.8 each hop); `hops` (+1 at ranks 3 and 5). */
  mend?: { heal: number; hops: number; range: number };
  /** Chorale: heals the caster and every group ally within `r` `heal`% of max HP, +`perAlly` for each one inside. */
  chorale?: { heal: number; perAlly: number; r: number };
  /** Cracked String: from rank `rank`, its blast rings again `delayMs` later at `mult` of its power (a canon). */
  canon?: { rank: number; delayMs: number; mult: number };
  /** Crescendo (Anthem): its party aura's buff grows by this share every tick. */
  crescendo?: number;
  /** Untouchable for this long (ms) when it goes off (the Deceptive cadence). */
  untouchable?: number;
  /** A chord finisher (shared/songs.ts PROGRESSIONS): fired by its progression, never cast, not in the tree. */
  finisher?: boolean;
}

/**
 * Devour / Bite: grabs the foe with flesh (not skeletons, undead or golems) nearest the aim within `range` px. Deals
 * `wpn`/`dmg` and drinks `drain`%. A monster at or below `below` of its life (+5% per extra rank) is eaten whole (Devour,
 * healing `heal`% of max life) or, with `chance` (+10% per extra rank), turned into a thrall (Bite).
 */
export interface FangDef { range: number; wpn?: number; dmg?: number; drain?: number; below: number; heal?: number; chance?: number;
  /** Ancient Lord (Devour): eating a monster whole gives this buff. */
  fed?: BuffDef }
export const FANG_BELOW_PER_RANK = 0.05, FANG_CHANCE_PER_RANK = 0.1;

/** Right-click aiming: on the hero itself, at the clicked spot, or toward the click. */
export type SkillTarget = "self" | "point" | "dir";

export interface BranchDef { name: string; color: string }

export const MAX_RANK = 3;
export const RANK_POWER = 0.15;
export const RANK_TIME = 0.1;
export const MAX_STACKS = 5;
export const STACK_POWER = 0.25; // +25% damage per stack spent, unless the skill says otherwise
export const STACK_DECAY_MS = 6000; // stacks fade after this long without landing a hit
export const MARK_TAKEN = 0.25;
export const WEAK_DEALT = 0.25;
/**
 * Impact timing: skills whose look falls from the sky deal their damage when it lands, not when it appears.
 * The client animations (client/src/skillfx.ts) use these same numbers, so the hit, the damage numbers and the
 * crash all happen on the same frame.
 */
export const LEAP_MS = 260; // a leap's hop through the air; its blasts land when the hero comes down
export const SWORD_FALL_MS = 260; // Judgement Blade
export const METEOR_FALL_MS = 420, SMALL_METEOR_FALL_MS = 260; // big meteors (r >= 40) fall slower
export const RAIN_FALL_MS = 220; // arrows of a rain hit the ground around this time
export const BLOOD_RITE_MS = 720; // Exsanguinate: blood spills, rises into a crimson orb over the vampire, then crashes down
export function impactMs(look: AreaLook | undefined, r: number): number {
  switch (look) {
    case "sword": return SWORD_FALL_MS;
    case "meteor": return r >= 40 ? METEOR_FALL_MS : SMALL_METEOR_FALL_MS;
    case "rain": return RAIN_FALL_MS;
    case "bloodrite": return BLOOD_RITE_MS;
    default: return 0;
  }
}
export const STACK_NAME: Record<ClassKind, string> = { knight: "Valor", ninja: "Ki", wizard: "Arcane", archer: "Focus", barbarian: "Fury", vampire: "Blood", summoner: "Essence", songweaver: "Tempo" };

export const BRANCHES: Record<ClassKind, [BranchDef, BranchDef, BranchDef]> = {
  knight: [{ name: "Valor", color: "#e63946" }, { name: "Bulwark", color: "#4cc9f0" }, { name: "Crusade", color: "#ffd166" }],
  ninja: [{ name: "Shadow", color: "#9d4edd" }, { name: "Steel", color: "#c0c8d8" }, { name: "Spirit", color: "#f77f00" }],
  wizard: [{ name: "Fire", color: "#f77f00" }, { name: "Frost", color: "#4cc9f0" }, { name: "Thunder", color: "#ffd60a" }],
  archer: [{ name: "Marksman", color: "#e63946" }, { name: "Trapper", color: "#a68a64" }, { name: "Nature", color: "#7cfc00" }],
  barbarian: [{ name: "Fury", color: "#e63946" }, { name: "Warcry", color: "#ffd166" }, { name: "Earth", color: "#a68a64" }],
  vampire: [{ name: "Blood", color: "#c1121f" }, { name: "Night", color: "#9d4edd" }, { name: "Fang", color: "#c0c8d8" }],
  summoner: [{ name: "Golems", color: "#a68a64" }, { name: "Void", color: "#9d4edd" }, { name: "Conjuration", color: "#b388ff" }],
  songweaver: [{ name: "Hymnal", color: "#f4d35e" }, { name: "Folk", color: "#e07a5f" }, { name: "Discord", color: "#7b2cbf" }],
};

const S: Record<ClassKind, SkillDef[]> = <Record<ClassKind, SkillDef[]>><unknown>{
  // ---------------------------------------------------------------- KNIGHT
  knight: [
    // Valor: sword offense
    { id: "k_lunge", name: "Lunging Strike", type: "Attack", branch: 0, row: 0, style: "steel", windMs: 80, cd: 5000, cost: 25,
      desc: "Lunge forward and run your blade through whoever stands at the end.",
      move: { kind: "dash", dist: 40 }, areas: [{ r: 22, ahead: 10, wpn: 2, kb: 1.5, look: "slash" }] },
    { id: "k_whirl", name: "Whirling Slash", type: "Attack", branch: 0, row: 1, style: "steel", windMs: 70, cd: 7000, cost: 30,
      desc: "Spin with your sword out: hits everything around you twice.",
      areas: [{ r: 34, wpn: 1.0, kb: 0.8, waves: 2, everyMs: 180, look: "slash" }] },
    { id: "k_mastery", name: "Blade Mastery", type: "Passive", branch: 0, row: 2, style: "steel", passive: { effect: "dmg", perRank: 5 },
      desc: "Years of drills: more damage with everything." },
    { id: "k_rush", name: "Valor Rush", type: "Buildup", branch: 0, row: 3, style: "holy", windMs: 90, cd: 10000, cost: 35, consume: true,
      desc: "Spend your Valor: charge through the enemy line, cutting everyone on the way. Each Valor stack adds 25%.",
      move: { kind: "dash", dist: 72, path: 1.6, invulnMs: 300 }, areas: [{ r: 30, wpn: 0.8, kb: 1.5, look: "slash" }] },
    { id: "k_judgement", name: "Judgement Blade", type: "Ultimate", branch: 0, row: 4, style: "holy", cd: 20000, cost: 30, mana: 30, chargeMs: 600,
      desc: "Raise your sword to the sky. A giant blade of light falls ahead of you: huge damage, stuns.",
      areas: [{ r: 48, ahead: 46, dmg: 100, stunMs: 1200, kb: 2, look: "sword" }] },

    // Bulwark: defence and counters
    { id: "k_shield", name: "Shield Wall", type: "Enchant", branch: 1, row: 0, style: "frost", cd: 7000, cost: 25,
      desc: "Raise your shield for 2s: blocks 50% of damage and all knockback.",
      buff: { ms: 2000, block: true } },
    { id: "k_riposte", name: "Riposte", type: "Counter", branch: 1, row: 1, style: "steel", cd: 7000, cost: 20,
      desc: "Stand ready for 0.8s. The next hit is parried: you strike back twice as hard and stun the attacker.",
      counter: { ms: 800, wpn: 1.4, effects: { stunMs: 500, kb: 1.5 } } },
    { id: "k_ironskin", name: "Iron Skin", type: "Passive", branch: 1, row: 2, style: "steel", passive: { effect: "armor", perRank: 3 },
      desc: "Hardened by battle: take less damage." },
    { id: "k_taunt", name: "Challenging Roar", type: "War cry", branch: 1, row: 3, style: "blood", cd: 14000, cost: 25,
      desc: "Roar a challenge: enemies around are marked (take 25% more damage) and slowed; you take 15% less for 5s.",
      cry: { r: 72, markMs: 5000, slowMs: 1500, look: "nova" }, buff: { ms: 5000, armor: 15 } },
    { id: "k_quake", name: "Earthquake", type: "Ultimate", branch: 1, row: 4, style: "earth", windMs: 100, cd: 18000, cost: 50,
      desc: "Slam the ground: the earth splits around you, stunning everything, then two aftershocks roll out.",
      areas: [{ r: 56, dmg: 28, stunMs: 1100, kb: 0.5, look: "slam" }, { r: 76, dmg: 12, delayMs: 450, waves: 2, everyMs: 400, slowMs: 800, look: "spikes" }] },

    // Crusade: holy auras, enchantments and blessings
    { id: "k_holyblade", name: "Holy Blade", type: "Enchant", branch: 2, row: 0, style: "holy", cd: 12000, mana: 20,
      desc: "Bless your sword for 7s: every hit burns with holy fire, your skills too.",
      buff: { ms: 7000, onHit: { burn: [8, 2000] } } },
    { id: "k_consecrate", name: "Consecration", type: "Aura", branch: 2, row: 1, style: "holy", cd: 14000, mana: 25,
      desc: "Sanctify the ground under you for 5s: it burns enemies and heals you while you stand on it.",
      field: { kind: "consecrate", r: 42, ms: 5000, tickMs: 500, dmg: 8, heal: 1.2 } },
    { id: "k_rally", name: "Rally", type: "War cry", branch: 2, row: 2, style: "holy", cd: 16000, cost: 15, mana: 15,
      desc: "Lift your banner: heal 12% HP, +15% damage and speed for 6s, and nearby enemies are weakened.",
      buff: { ms: 6000, dmg: 15, speed: 15, heal: 12 }, cry: { r: 64, weakMs: 4000, look: "nova" } },
    { id: "k_aura", name: "Sacred Aura", type: "Aura", branch: 2, row: 3, style: "holy", cd: 20000, mana: 30,
      desc: "A halo of light surrounds you for 10s: it sears enemies close to you and slowly heals you.",
      field: { kind: "sacred", r: 46, ms: 10000, tickMs: 500, follow: true, dmg: 6 }, buff: { ms: 10000, regen: 1.2 } },
    { id: "k_wrath", name: "Heaven's Wrath", type: "Ultimate", branch: 2, row: 4, style: "holy", cd: 22000, cost: 20, mana: 35, chargeMs: 500,
      desc: "Call down the heavens: six pillars of light crash around you, each one stunning.",
      areas: [{ r: 26, dmg: 34, stunMs: 400, waves: 6, everyMs: 160, scatter: 64, delayMs: 100, look: "pillar" }] },
  ],

  // ---------------------------------------------------------------- NINJA
  ninja: [
    // Shadow: stealth and teleports
    { id: "n_step", name: "Shadow Step", type: "Movement", branch: 0, row: 0, style: "shadow", cd: 2500, cost: 20,
      desc: "Melt into shadow and reappear ahead, untouchable for a moment.",
      move: { kind: "blink", dist: 56, invulnMs: 250 } },
    { id: "n_smoke", name: "Smoke Bomb", type: "Aura", branch: 0, row: 1, style: "shadow", cd: 12000, cost: 30,
      desc: "Throw down a cloud of smoke for 4s: enemies inside are blinded (weakened) and slowed.",
      field: { kind: "smoke", r: 40, ms: 4000, tickMs: 400, weakMs: 600, slowMs: 600 } },
    { id: "n_swift", name: "Swift Feet", type: "Passive", branch: 0, row: 2, style: "wind", passive: { effect: "speed", perRank: 4 },
      desc: "Light as a cat: move faster." },
    { id: "n_assassinate", name: "Assassinate", type: "Buildup", branch: 0, row: 3, style: "shadow", windMs: 60, cd: 10000, cost: 40, consume: true,
      desc: "Spend your Ki: vanish and strike the nearest enemy from behind. Each Ki stack adds 25%.",
      move: { kind: "behind", dist: 110, invulnMs: 200 }, areas: [{ r: 20, wpn: 3, kb: 1, look: "slash" }] },
    { id: "n_cuts", name: "Thousand Cuts", type: "Ultimate", branch: 0, row: 4, style: "shadow", cd: 18000, cost: 55,
      desc: "Become a shadow: blink from enemy to enemy six times, slashing each one. Untouchable meanwhile.",
      move: { kind: "multi", dist: 96, hits: 6, everyMs: 150, wpn: 0.75, invulnMs: 450 } },

    // Steel: blades and parries
    { id: "n_shuriken", name: "Shuriken Fan", type: "Attack", branch: 1, row: 0, style: "steel", cd: 4000, cost: 20,
      desc: "Throw three spinning shuriken in a fan.",
      shots: { kind: "shuriken", n: 3, spread: 26, speed: 260, range: 150, radius: 4, wpn: 1.0, kb: 0.4 } },
    { id: "n_flurry", name: "Blade Flurry", type: "Enchant", branch: 1, row: 1, style: "steel", cd: 12000, cost: 25,
      desc: "Your blades blur for 5s: 40% faster attacks that make enemies bleed, your skills too.",
      buff: { ms: 5000, atkspd: 40, onHit: { burn: [3, 2000] } } },
    { id: "n_parry", name: "Shadow Parry", type: "Counter", branch: 1, row: 2, style: "shadow", cd: 8000, cost: 20,
      desc: "Stand ready for 0.7s. When struck, you vanish, appear behind the attacker and cut them deep.",
      counter: { ms: 700, blink: "behind", wpn: 2.8, effects: { kb: 1 } } },
    { id: "n_vital", name: "Vital Points", type: "Passive", branch: 1, row: 3, style: "blood", passive: { effect: "crit", perRank: 4 },
      desc: "You know where it hurts: more critical hits." },
    { id: "n_storm", name: "Blade Storm", type: "Ultimate", branch: 1, row: 4, style: "steel", windMs: 60, cd: 15000, cost: 50,
      desc: "Spin into a storm of steel: five hits on everything around you, pulling enemies in.",
      areas: [{ r: 44, wpn: 0.9, kb: 0.2, pull: 6, waves: 5, everyMs: 150, look: "slash" }] },

    // Spirit: elemental jutsu
    { id: "n_flame", name: "Flame Jutsu", type: "Attack", branch: 2, row: 0, style: "fire", cd: 4000, mana: 12,
      desc: "Breathe a gout of fire ahead: damage and burning.",
      areas: [{ r: 26, ahead: 26, wpn: 2.5, burn: [5, 3000], kb: 0.6, look: "flame" }] },
    { id: "n_poison", name: "Poison Blade", type: "Enchant", branch: 2, row: 1, style: "poison", cd: 14000, cost: 10, mana: 10,
      desc: "Coat your blades for 8s: every hit poisons, your skills too.",
      buff: { ms: 8000, onHit: { burn: [10, 3000] } } },
    { id: "n_caltrops", name: "Caltrops", type: "Trap", branch: 2, row: 2, style: "steel", cd: 10000, cost: 20,
      desc: "Scatter spikes ahead for 6s: enemies walking on them are hurt and slowed.",
      field: { kind: "caltrops", r: 30, ahead: 36, ms: 6000, tickMs: 400, dmg: 7, slowMs: 600 } },
    { id: "n_lightning", name: "Lightning Jutsu", type: "Attack", branch: 2, row: 3, style: "lightning", cd: 9000, mana: 25,
      desc: "Hurl a lightning bolt that jumps to 3 more enemies, stunning each.",
      shots: { kind: "lightning", speed: 420, range: 170, radius: 5, wpn: 3.3, stunMs: 350, chain: 3 } },
    { id: "n_dragon", name: "Fire Dragon", type: "Ultimate", branch: 2, row: 4, style: "fire", cd: 18000, cost: 15, mana: 40, chargeMs: 450,
      desc: "Gather your chakra and release a fire dragon: it tears through everyone in its path and explodes.",
      shots: { kind: "dragon", speed: 200, range: 190, radius: 10, size: 2, wpn: 3.5, burn: [6, 3000], pierce: 99, explode: 44 } },
  ],

  // ---------------------------------------------------------------- WIZARD
  // Three schools of magic, one spell each for now (Murat 2026-11-07): Fire, Frost, Thunder.
  wizard: [
    // Fire
    { id: "w_firebolt", name: "Fire Bolt", type: "Attack", branch: 0, row: 0, style: "fire", cd: 450, mana: 5,
      desc: "Hurl a bolt of fire at your foe: it burns them for a moment. Cheap and quick: cast it again and again.",
      shots: { kind: "fireball", speed: 280, range: 200, radius: 6, size: 1.3, dmg: 11, burn: [2, 1500], kb: 0.6 } },
    { id: "w_fb_split", name: "Split Bolt", type: "Upgrade", branch: 0, row: 1, style: "fire", passive: { effect: "upgrade", perRank: 0 },
      desc: "Fire Bolt splits: +1 bolt per rank, fanned out (each bolt 10% weaker per rank).", mod: { of: "w_firebolt", n: 1, dmg: -10 } },
    { id: "w_fb_heat", name: "Searing Heat", type: "Upgrade", branch: 0, row: 1, style: "fire", passive: { effect: "upgrade", perRank: 0 },
      desc: "Fire Bolt hits harder: +15% damage per rank.", mod: { of: "w_firebolt", dmg: 15 } },
    { id: "w_fb_haste", name: "Quick Hands", type: "Upgrade", branch: 0, row: 2, style: "fire", passive: { effect: "upgrade", perRank: 0 },
      desc: "Fire Bolt comes back sooner and costs less: -6% cooldown and -5% mana per rank.", mod: { of: "w_firebolt", cd: -6, mana: -5 } },
    { id: "w_fb_burst", name: "Combustion", type: "Upgrade", branch: 0, row: 2, style: "fire", passive: { effect: "upgrade", perRank: 0 },
      desc: "Fire Bolt explodes where it hits, burning everything close: +12 px blast radius per rank.", mod: { of: "w_firebolt", explode: 12 } },
    { id: "w_fb_pierce", name: "Piercing Flames", type: "Upgrade", branch: 0, row: 3, style: "fire", passive: { effect: "upgrade", perRank: 0 },
      desc: "Fire Bolt goes through: +1 enemy pierced per rank, and +15% range.", mod: { of: "w_firebolt", pierce: 1, speed: 15 } },
    { id: "w_fb_inferno", name: "Inferno", type: "Upgrade", branch: 0, row: 3, style: "fire", passive: { effect: "upgrade", perRank: 0 },
      desc: "Fire Bolt's blast grows (+8 px per rank) and its burn is hotter (+40% per rank).", mod: { of: "w_firebolt", explode: 8, burn: 40 } },
    // Frost
    { id: "w_blizzard", name: "Blizzard", type: "Aura", branch: 1, row: 0, style: "frost", cd: 9000, mana: 22,
      desc: "A storm of snow and ice turns around you for 6s and moves with you, hurting and slowing every enemy close by.",
      field: { kind: "frostwhirl", r: 56, ms: 6000, tickMs: 500, follow: true, dmg: 6, slowMs: 800 } },
    { id: "w_bz_wide", name: "Wide Storm", type: "Upgrade", branch: 1, row: 1, style: "frost", passive: { effect: "upgrade", perRank: 0 },
      desc: "The Blizzard reaches further: +15% radius per rank.", mod: { of: "w_blizzard", radius: 15 } },
    { id: "w_bz_bite", name: "Biting Cold", type: "Upgrade", branch: 1, row: 1, style: "frost", passive: { effect: "upgrade", perRank: 0 },
      desc: "The Blizzard bites harder: +15% damage per rank.", mod: { of: "w_blizzard", dmg: 15 } },
    { id: "w_bz_last", name: "Lasting Storm", type: "Upgrade", branch: 1, row: 2, style: "frost", passive: { effect: "upgrade", perRank: 0 },
      desc: "The Blizzard lasts longer: +20% duration per rank.", mod: { of: "w_blizzard", ms: 20 } },
    { id: "w_bz_freeze", name: "Deep Freeze", type: "Upgrade", branch: 1, row: 2, style: "frost", passive: { effect: "upgrade", perRank: 0 },
      desc: "The Blizzard's chill lasts longer: +30% slow time per rank.", mod: { of: "w_blizzard", slow: 30 } },
    { id: "w_bz_age", name: "Ice Age", type: "Upgrade", branch: 1, row: 3, style: "frost", passive: { effect: "upgrade", perRank: 0 },
      desc: "The Blizzard comes back sooner: -7.5% cooldown per rank.", mod: { of: "w_blizzard", cd: -7.5 } },
    { id: "w_bz_bite2", name: "Frostbite", type: "Upgrade", branch: 1, row: 3, style: "frost", passive: { effect: "upgrade", perRank: 0 },
      desc: "The Blizzard strikes more often: ticks 12% faster per rank.", mod: { of: "w_blizzard", tick: 12 } },
    // Thunder
    { id: "w_storm", name: "Thunder", type: "Attack", branch: 2, row: 0, style: "lightning", cd: 6000, mana: 20,
      desc: "Call thunder down on a spot: for 2.5s lightning hammers the zone, striking and stunning the enemies inside.",
      field: { kind: "storm", r: 56, ahead: 70, ms: 2500, tickMs: 300, zap: { n: 2, dmg: 11, stunMs: 250 } } },
    { id: "w_th_fork", name: "Forked Lightning", type: "Upgrade", branch: 2, row: 1, style: "lightning", passive: { effect: "upgrade", perRank: 0 },
      desc: "Thunder strikes more: +1 bolt per strike per rank (each 10% weaker per rank).", mod: { of: "w_storm", zap: 1, dmg: -10 } },
    { id: "w_th_charge", name: "Charged", type: "Upgrade", branch: 2, row: 1, style: "lightning", passive: { effect: "upgrade", perRank: 0 },
      desc: "Thunder hits harder: +15% damage per rank.", mod: { of: "w_storm", dmg: 15 } },
    { id: "w_th_wide", name: "Wide Thunder", type: "Upgrade", branch: 2, row: 2, style: "lightning", passive: { effect: "upgrade", perRank: 0 },
      desc: "Thunder covers more ground: +15% radius per rank.", mod: { of: "w_storm", radius: 15 } },
    { id: "w_th_stun", name: "Paralysis", type: "Upgrade", branch: 2, row: 2, style: "lightning", passive: { effect: "upgrade", perRank: 0 },
      desc: "Thunder stuns longer: +30% stun per rank.", mod: { of: "w_storm", stun: 30 } },
    { id: "w_th_long", name: "Long Storm", type: "Upgrade", branch: 2, row: 3, style: "lightning", passive: { effect: "upgrade", perRank: 0 },
      desc: "Thunder rages longer: +25% duration per rank.", mod: { of: "w_storm", ms: 25 } },
    { id: "w_th_swift", name: "Swift Storm", type: "Upgrade", branch: 2, row: 3, style: "lightning", passive: { effect: "upgrade", perRank: 0 },
      desc: "Thunder comes back sooner: -7.5% cooldown per rank.", mod: { of: "w_storm", cd: -7.5 } },
  ],

  // ---------------------------------------------------------------- ARCHER
  archer: [
    // Marksman
    { id: "a_volley", name: "Volley", type: "Attack", branch: 0, row: 0, style: "steel", cd: 6000, cost: 30,
      desc: "Fire three arrows side by side.",
      shots: { kind: "arrow", n: 3, lanes: 8, speed: 300, range: 175, radius: 4, wpn: 0.7, kb: 0.8 } },
    { id: "a_power", name: "Power Shot", type: "Buildup", branch: 0, row: 1, style: "wind", cd: 7000, cost: 25, chargeMs: 450,
      desc: "Draw the bow to its limit, then loose a glowing arrow that pierces everything and knocks back hard.",
      shots: { kind: "powerarrow", speed: 420, range: 240, radius: 5, size: 1.5, wpn: 2.9, pierce: 99, kb: 3 } },
    { id: "a_aim", name: "Steady Aim", type: "Passive", branch: 0, row: 2, style: "steel", passive: { effect: "dmg", perRank: 5 },
      desc: "Breathe, aim, release: more damage." },
    { id: "a_fan", name: "Fan of Arrows", type: "Buildup", branch: 0, row: 3, style: "steel", cd: 10000, cost: 35, consume: true,
      desc: "Spend your Focus: loose a wide fan of seven arrows. Each Focus stack adds 25%.",
      shots: { kind: "arrow", n: 7, spread: 70, speed: 300, range: 170, radius: 4, wpn: 0.8, kb: 0.8 } },
    { id: "a_rain", name: "Arrow Rain", type: "Ultimate", branch: 0, row: 4, style: "steel", cd: 16000, cost: 50,
      desc: "Shoot into the sky: six waves of arrows rain down ahead, slowing everyone under them.",
      areas: [{ r: 48, ahead: 76, dmg: 24, slowMs: 900, kb: 0.2, delayMs: 400, waves: 6, everyMs: 220, look: "rain" }] },

    // Trapper
    { id: "a_beartrap", name: "Bear Trap", type: "Trap", branch: 1, row: 0, style: "steel", cd: 8000, cost: 20,
      desc: "Set an iron trap where you aim (20s). The first enemy to step on it is caught: damage and a long stun.",
      field: { kind: "beartrap", r: 14, ms: 20000, tickMs: 100, trap: true, burst: { r: 16, dmg: 26, stunMs: 1100, look: "spikes" } } },
    { id: "a_reflex", name: "Hunter's Reflex", type: "Counter", branch: 1, row: 1, style: "wind", cd: 8000, cost: 20,
      desc: "Stay alert for 0.7s. If struck, you dodge the blow, vault back and fire three arrows.",
      counter: { ms: 700, blink: "back", shot: { kind: "arrow", n: 3, spread: 18, speed: 320, range: 170, radius: 4, wpn: 0.9, kb: 1 } } },
    { id: "a_explosive", name: "Explosive Trap", type: "Trap", branch: 1, row: 2, style: "fire", cd: 10000, cost: 25,
      desc: "Bury a fire trap ahead (20s). It blows up when an enemy comes close.",
      field: { kind: "firetrap", r: 18, ahead: 20, ms: 20000, tickMs: 100, trap: true, burst: { r: 44, dmg: 52, kb: 2.5, burn: [4, 2000], look: "burst" } } },
    { id: "a_net", name: "Net Shot", type: "Attack", branch: 1, row: 3, style: "nature", cd: 10000, cost: 25,
      desc: "Shoot a weighted net: it tangles the first enemy (rooted 1.6s) and slows everyone near it.",
      shots: { kind: "net", speed: 260, range: 160, radius: 6, size: 1.4, wpn: 3.3, stunMs: 1600, explode: 30, slowMs: 1500 } },
    { id: "a_sentry", name: "Hunter's Sentry", type: "Ultimate", branch: 1, row: 4, style: "nature", cd: 22000, cost: 30, mana: 25,
      desc: "Plant a carved sentry totem for 10s. Its glowing eye fires arrows at every enemy that comes near.",
      field: { kind: "sentry", r: 140, ms: 10000, tickMs: 450, turret: { kind: "arrow", speed: 320, range: 160, radius: 4, dmg: 15, kb: 0.4 } } },

    // Nature: enchanted arrows
    { id: "a_firearrows", name: "Fire Arrows", type: "Enchant", branch: 2, row: 0, style: "fire", cd: 12000, mana: 20,
      desc: "Light your arrowheads for 8s: every arrow sets its target on fire, skill arrows too (a Volley of fire arrows).",
      buff: { ms: 8000, onHit: { burn: [4, 3000] } } },
    { id: "a_frostarrow", name: "Frost Arrow", type: "Attack", branch: 2, row: 1, style: "frost", cd: 6000, cost: 10, mana: 12,
      desc: "An arrow of ice: it shatters on impact, slowing everyone near.",
      shots: { kind: "frostarrow", speed: 320, range: 190, radius: 4, size: 1.2, wpn: 2.2, explode: 28, slowMs: 2000, kb: 0.8 } },
    { id: "a_windwalk", name: "Wind Walk", type: "Aura", branch: 2, row: 2, style: "wind", cd: 14000, mana: 25,
      desc: "The wind carries you for 5s: 40% faster and 25% harder to hurt.",
      buff: { ms: 5000, speed: 40, armor: 25 } },
    { id: "a_feast", name: "Hunter's Feast", type: "Passive", branch: 2, row: 3, style: "nature", passive: { effect: "lifesteal", perRank: 4 },
      desc: "Every kill feeds you: heal part of the damage you deal." },
    { id: "a_phoenix", name: "Phoenix Arrow", type: "Ultimate", branch: 2, row: 4, style: "fire", cd: 20000, cost: 15, mana: 40, chargeMs: 300,
      desc: "Your arrow bursts into a phoenix: it burns through every enemy, explodes and leaves the ground on fire.",
      shots: { kind: "phoenix", speed: 230, range: 210, radius: 10, size: 2, wpn: 3.8, pierce: 99, explode: 48, burn: [6, 3000], kb: 1.5,
        field: { kind: "fire", r: 40, ms: 3000, tickMs: 500, dmg: 6 } } },
  ],

  // ---------------------------------------------------------------- BARBARIAN
  barbarian: [
    // Fury
    { id: "b_rage", name: "Rage", type: "Aura", branch: 0, row: 0, style: "blood", cd: 12000, cost: 25,
      desc: "Fly into a rage for 5s: +15% damage, +20% speed and +15% attack speed.",
      buff: { ms: 5000, dmg: 15, speed: 20, atkspd: 15 } },
    { id: "b_cleave", name: "Cleave", type: "Attack", branch: 0, row: 1, style: "blood", windMs: 70, cd: 5000, cost: 20,
      desc: "A huge sweeping axe blow that hits everyone in front of you.",
      areas: [{ r: 34, ahead: 16, wpn: 1.9, kb: 2, look: "slash" }] },
    { id: "b_bloodthirst", name: "Bloodthirst", type: "Passive", branch: 0, row: 2, style: "blood", passive: { effect: "lifesteal", perRank: 5 },
      desc: "Blood feeds your fury: heal part of the damage you deal." },
    { id: "b_berserk", name: "Berserk", type: "Buildup", branch: 0, row: 3, style: "blood", cd: 16000, cost: 30, consume: true,
      desc: "Spend your Fury: go berserk for 6s. Unstoppable, 20% faster attacks, +5% damage per Fury stack, but you take 15% more.",
      buff: { ms: 6000, immune: true, atkspd: 20, armor: -15, perStack: 5 } },
    { id: "b_whirlwind", name: "Whirlwind", type: "Ultimate", branch: 0, row: 4, style: "blood", cd: 18000, cost: 50,
      desc: "Become a whirlwind of steel for 2.5s: you can move, and everything near you is cut five times a second.",
      field: { kind: "whirlwind", r: 38, ms: 2500, tickMs: 200, follow: true, wpn: 0.3, kb: 0.3 }, buff: { ms: 2500, immune: true, speed: 10 } },

    // Warcry
    { id: "b_battlecry", name: "Battle Cry", type: "War cry", branch: 1, row: 0, style: "spirit", cd: 12000, cost: 15,
      desc: "Bellow a battle cry: +20% damage for 6s, and enemies around you are weakened.",
      buff: { ms: 6000, dmg: 20 }, cry: { r: 64, weakMs: 4000, look: "nova" } },
    { id: "b_howl", name: "Terrifying Howl", type: "War cry", branch: 1, row: 1, style: "spirit", cd: 12000, cost: 15,
      desc: "A howl so savage that monsters around you flee in terror and heroes falter.",
      cry: { r: 72, fearMs: 2000, look: "nova" } },
    { id: "b_retaliate", name: "Retaliate", type: "Counter", branch: 1, row: 2, style: "blood", cd: 6000, cost: 15,
      desc: "Brace for 0.8s. The next hit only makes you angrier: you explode in a roar that hits all around.",
      counter: { ms: 800, area: { r: 42, wpn: 1.5, kb: 2, look: "slam" }, buff: { ms: 3000, dmg: 15 } } },
    { id: "b_drums", name: "War Drums", type: "Aura", branch: 1, row: 3, style: "spirit", cd: 14000, cost: 25,
      desc: "Ancestral drums beat around you for 10s: +20% attack speed, and each beat jolts nearby enemies.",
      field: { kind: "drums", r: 52, ms: 10000, tickMs: 800, follow: true, dmg: 5, slowMs: 500 }, buff: { ms: 10000, atkspd: 20 } },
    { id: "b_ancestors", name: "Call of the Ancestors", type: "Ultimate", branch: 1, row: 4, style: "spirit", cd: 22000, cost: 20, mana: 35, chargeMs: 600,
      desc: "Call your ancestors: ghostly warriors rise and slam the ground around you three times, and their spirit shields you.",
      areas: [{ r: 68, wpn: 0.8, kb: 1, waves: 3, everyMs: 350, look: "spirit" }], buff: { ms: 6000, armor: 25 } },

    // Earth
    { id: "b_slam", name: "Ground Slam", type: "Attack", branch: 2, row: 0, style: "earth", windMs: 60, cd: 6000, cost: 20,
      desc: "Smash the ground: hurts and stuns everything around you.",
      areas: [{ r: 38, wpn: 1.2, stunMs: 450, kb: 1, look: "slam" }] },
    { id: "b_leap", name: "Leap", type: "Movement", branch: 2, row: 1, style: "earth", windMs: 40, cd: 7000, cost: 25,
      desc: "Leap forward and crash down, hurting everything where you land.",
      move: { kind: "leap", dist: 64, invulnMs: 300 }, areas: [{ r: 40, wpn: 1.3, kb: 2, look: "slam" }] },
    { id: "b_thick", name: "Thick Skin", type: "Passive", branch: 2, row: 2, style: "earth", passive: { effect: "hp", perRank: 6 },
      desc: "Hide like a bear: more max HP." },
    { id: "b_seismic", name: "Seismic Wave", type: "Attack", branch: 2, row: 3, style: "earth", windMs: 70, cd: 10000, cost: 30,
      desc: "Stomp and send a wave of stone spikes bursting out of the ground ahead.",
      areas: [{ r: 22, ahead: 20, wpn: 0.5, kb: 1.5, slowMs: 600, waves: 5, everyMs: 90, line: 20, look: "spikes" }] },
    { id: "b_avalanche", name: "Avalanche", type: "Ultimate", branch: 2, row: 4, style: "earth", windMs: 80, cd: 22000, cost: 50,
      desc: "Leap high into the air and come down like a mountain: a huge stun blast, then boulders rain around you.",
      move: { kind: "leap", dist: 90, invulnMs: 300 },
      areas: [{ r: 62, wpn: 1.5, stunMs: 450, kb: 2, delayMs: 350, look: "slam" }, { r: 22, wpn: 0.35, waves: 6, everyMs: 120, delayMs: 600, scatter: 72, look: "meteor" }] },

  ],
  // ---------------------------------------------------------------- VAMPIRE
  // Warrior and caster in one (Murat 2026-11-05). Blood magic costs some of his own HP (blood) as well as mana, and
  // most of his hits drink part of the damage back (drain): he pays in blood and takes it back from his enemies.
  vampire: [
    // Blood: blood magic (Magic). Rebuilt from Murat's picks (2026-11-07): Lance, Ward, Transfusion, Rise Again, Hemorrhage, Blood Rain
    { id: "v_link", name: "Blood Link", type: "Attack", branch: 0, row: 0, style: "blood", cd: 7000, mana: 12, target: "dir",
      desc: "Bind yourself to the foe nearest your aim with a cord of blood for 3s and pump their life into you: it hurts them, slows them and heals you for half of it. Aim at a group ally instead and the cord carries your own blood to them: you give a little of your life each pulse and they heal half as much again. The cord snaps if they get too far away.",
      field: { kind: "bloodlink", r: 0, ms: 3000, tickMs: 300, follow: true, dmg: 6, drain: 50, slowMs: 400, link: { range: 120, breakAt: 170, give: 2 } } },
    { id: "v_lance", name: "Blood Lance", type: "Attack", branch: 0, row: 1, style: "blood", cd: 5000, mana: 14, blood: 3,
      desc: "Draw a spear of your own blood and hurl it: it runs through foes in a line (three at rank 1, one more each rank) and leaves each of them bleeding.",
      shots: { kind: "bloodlance", speed: 330, range: 175, radius: 4, dmg: 18, pierce: 2, perRank: { pierce: 1 }, burn: [6, 2500], bleed: "drip", drain: 10, kb: 0.5 } },
    { id: "v_boil", name: "Boil Blood", type: "Attack", branch: 0, row: 1, style: "blood", cd: 6000, mana: 16, blood: 4,
      desc: "Make the blood of everyone at the spot boil: they swell with bubbling blood, are hurt and bleed for 3s.",
      areas: [{ r: 30, ahead: 44, dmg: 16, burn: [8, 3000], bleed: "boil", kb: 0.4, look: "burst" }] },
    { id: "v_pact", name: "Blood Pact", type: "Passive", branch: 0, row: 2, style: "blood",
      passive: { effect: "skill", perRank: 7, blood: 2, rise: { hp: 30, cdMs: 180000 } },
      desc: "An old oath sealed in blood: all your skills hit harder, but every skill you cast also costs 2% of your life. Once every 3 minutes, a killing blow leaves you standing in a pool of blood at 30% life instead." },
    { id: "v_ward", name: "Sanguine Ward", type: "Aura", branch: 0, row: 3, style: "blood", cd: 15000, mana: 15, blood: 6, target: "self",
      desc: "Spill your blood into a hardened red shell around you for 4s: you take 40% less damage and nothing knocks you about.",
      field: { kind: "bloodward", r: 16, ms: 4000, tickMs: 1000, follow: true }, buff: { ms: 4000, armor: 40, immune: true } },
    { id: "v_exsang", name: "Exsanguinate", type: "Buildup", branch: 0, row: 3, style: "blood", cd: 12000, mana: 20, consume: true,
      desc: "Spend your Blood: tear the blood out of everyone in a wide circle around you in streams that pour into you, pull them in and drink a quarter of it. Every bleed on them bursts at once (Hemorrhage). Each Blood stack adds 25%.",
      areas: [{ r: 110, dmg: 22, drain: 25, pull: 16, kb: 0, look: "bloodrite", siphon: true, rupture: 1 }] },
    { id: "v_tide", name: "Crimson Tide", type: "Ultimate", branch: 0, row: 4, style: "blood", cd: 20000, mana: 35, blood: 8, chargeMs: 400,
      desc: "Open your veins: a wave of blood spikes rolls out ahead, slowing everything it hits and feeding you 15% of the damage.",
      areas: [{ r: 24, ahead: 22, dmg: 30, drain: 15, slowMs: 700, kb: 1.2, waves: 6, everyMs: 100, line: 22, look: "spikes" }] },

    // Night: mist, bats, rats and the dark (Mana)
    { id: "v_mist", name: "Mist Form", type: "Movement", branch: 1, row: 0, style: "shadow", cd: 3500, cost: 20,
      desc: "Dissolve into mist and a flutter of bats and drift far ahead, over water, fences and walls, untouchable for a moment. The mist you leave behind chills whoever stands in it.",
      move: { kind: "blink", dist: 110, invulnMs: 450 }, areas: [{ r: 24, dmg: 10, slowMs: 900, atStart: true, look: "smoke" }] },
    { id: "v_bats", name: "Bat Swarm", type: "Attack", branch: 1, row: 1, style: "shadow", cd: 4000, mana: 14,
      desc: "A swarm of bats pours out of your cloak and spreads ahead, biting whatever it reaches and bringing a little blood back to you: 6 bats, 2 more each rank. More bats stay behind and whirl round you for 3s as a living shield: they bite anyone close and you take 15% less damage.",
      shots: { kind: "bat", n: 6, perRank: { n: 2 }, spread: 26, jitter: { speed: 0.35, deg: 9, range: 0.25 }, speed: 170, range: 120, radius: 3, dmg: 12, drain: 15, kb: 0.1 },
      field: { kind: "batring", r: 26, ms: 3000, tickMs: 500, follow: true, dmg: 9, drain: 30 }, buff: { ms: 3000, armor: 15 } },
    { id: "v_gaze", name: "Charm", type: "Attack", branch: 1, row: 2, style: "shadow", cd: 16000, mana: 18, target: "dir",
      desc: "Catch the eye of the foe nearest your aim. A monster falls under your spell and fights at your side for 5s, then wakes up. Heroes, bosses and elites are too strong-willed: they falter instead, dazed and weakened for 2s.",
      charm: { range: 100, ms: 5000, daze: 2000 } },
    { id: "v_nightborn", name: "Child of the Night", type: "Passive", branch: 1, row: 2, style: "shadow", passive: { effect: "night", perRank: 6 },
      desc: "The dark is yours. At night, and inside a Nightfall, you hit harder, heal from the damage you deal and move faster." },
    { id: "v_rats", name: "Rat Plague", type: "Attack", branch: 1, row: 3, style: "poison", cd: 9000, mana: 20,
      desc: "A seething wave of plague rats boils out of the dark and swarms slowly ahead, a wide squirming mass: they bite through everything in their way, slowing it and leaving it sick for 3s. 10 rats, 3 more each rank.",
      shots: { kind: "rat", n: 10, perRank: { n: 3 }, spread: 40, jitter: { speed: 0.3, deg: 6 }, speed: 70, range: 150, radius: 6, dmg: 13, pierce: 3, burn: [5, 3000], slowMs: 900, kb: 0 } },
    { id: "v_soil", name: "Native Soil", type: "Aura", branch: 1, row: 3, style: "shadow", cd: 20000, mana: 22, target: "self",
      desc: "Spill a box of your grave earth at your feet for 8s: while you stand on it you heal quickly, and it clings to the feet of your enemies.",
      field: { kind: "gravesoil", r: 40, ms: 8000, tickMs: 500, heal: 2, slowMs: 500 } },
    // Murat 2026-11-08: the vampire can take the shape of a bat or a wolf
    { id: "v_batform", name: "Bat Form", type: "Movement", branch: 1, row: 3, style: "shadow", cd: 14000, mana: 20, target: "self",
      desc: "Shrink into a great black bat for 6s: you flit about 60% faster, are hard to hit (25% less damage taken), nothing slows or knocks you about, and your bites drink 6% of the damage. You can still call bats, rats and mist (Night skills); any other skill, or this one again, gives you your own shape back.",
      buff: { ms: 6000, form: "bat", speed: 60, armor: 25, immune: true, lifesteal: 6 } },
    { id: "v_nightfall", name: "Nightfall", type: "Ultimate", branch: 1, row: 4, style: "shadow", cd: 24000, mana: 40, chargeMs: 500,
      desc: "Call down a starless night and a cold fog on the land around you for 10s: it is night there (Child of the Night wakes), the fog slows every enemy inside, weakens them and feeds you, and for 5s you hunt faster, healing on every hit.",
      field: { kind: "nightfall", r: 96, ms: 10000, tickMs: 500, dmg: 14, drain: 25, weakMs: 1200, slowMs: 1000, night: true }, buff: { ms: 5000, lifesteal: 12, speed: 15 } },

    // Fang: the blade and the hunt (Strength, Stamina)
    { id: "v_rend", name: "Crimson Slash", type: "Attack", branch: 2, row: 0, style: "blood", windMs: 60, cost: 30,
      desc: "A quick, cruel slash: the wound bleeds, and you drink 10% of the damage.",
      areas: [{ r: 26, ahead: 12, wpn: 1.2, burn: [5, 2000], drain: 10, kb: 1.2, look: "slash" }] },
    { id: "v_thirst", name: "Thirst", type: "Enchant", branch: 2, row: 1, style: "blood", cd: 11000, cost: 15, mana: 10,
      desc: "Your blade thirsts for 7s: every hit, your skills too, makes them bleed, and you heal 8% of the damage you deal. Your bloodline shares it: group allies near you heal 4% of theirs.",
      buff: { ms: 7000, lifesteal: 8, onHit: { burn: [3, 2000] }, group: 140 } },
    { id: "v_hunger", name: "Undying Hunger", type: "Passive", branch: 2, row: 2, style: "blood",
      passive: { effect: "lifesteal", perRank: 2, kill: { ms: 3000, speed: 20, atkspd: 15 } },
      desc: "The hunger never sleeps: heal part of all the damage you deal. Every kill sends a rush of bloodlust through you: faster steps and faster blows for 3s." },
    { id: "v_pounce", name: "Night Pounce", type: "Attack", branch: 2, row: 3, style: "shadow", windMs: 70, cd: 10000, cost: 30,
      desc: "Melt into the shadows and step out right behind the nearest foe, then sink your teeth in: a heavy blow that stuns, and you drink 15% of it.",
      move: { kind: "behind", dist: 80, invulnMs: 250 }, areas: [{ r: 22, ahead: 8, wpn: 2, stunMs: 350, drain: 15, kb: 1, look: "slash" }] },
    { id: "v_wolfform", name: "Wolf Form", type: "Buildup", branch: 2, row: 3, style: "blood", cd: 22000, cost: 25, mana: 10, chargeMs: 250, target: "self",
      desc: "Throw back your head and howl as you become a huge black wolf for 10s: you hit 20% harder and 20% faster, run 20% faster, shrug off 10% of all damage, and every bite makes them bleed and heals you 8% of it. You can still rend, pounce, devour and bite (Fang skills); any other skill, or this one again, gives you your own shape back.",
      buff: { ms: 10000, form: "wolf", dmg: 20, atkspd: 20, speed: 20, armor: 10, lifesteal: 8, onHit: { burn: [4, 2000], bleed: "drip" } } },
    { id: "v_brides", name: "The Brides", type: "Ultimate", branch: 2, row: 4, style: "shadow", cd: 35000, mana: 35, chargeMs: 300, target: "self",
      desc: "Call your pale brides out of the night: three of them at rank 1, one more each rank. For 25s they stay at your side and throw themselves at every foe near you, clawing in a frenzy and drinking: part of the blood they draw comes back to you.",
      brides: { n: 3, perRank: 1, ms: 25000, drain: 20 } },
    // Murat 2026-11-07: eat monsters to take on what they are, bite them to make thralls. Both need flesh.
    { id: "v_devour", name: "Devour", type: "Attack", branch: 2, row: 1, style: "blood", cd: 6000, cost: 20, target: "dir",
      desc: "Tear into the foe with flesh nearest your aim. A monster below 30% life is eaten whole: it dies, you heal 8% of your life, the fresh blood makes you 12% stronger for 8s, and you keep a little of what it was, more for every one of its kind you eat (blobs: life, elemental blobs: skill damage, bandits: damage, beast-folk: speed). Skeletons and golems have nothing to eat.",
      devour: { range: 44, wpn: 1.6, drain: 20, below: 0.3, heal: 8, fed: { ms: 8000, dmg: 12 } } },
    { id: "v_bite", name: "Bite", type: "Summon", branch: 2, row: 2, style: "blood", cd: 9000, mana: 15, target: "dir",
      desc: "Sink your fangs into the foe with flesh nearest your aim and drink. A monster below 40% life may fall and rise as your thrall for 3 minutes (40% chance, more with ranks). You keep up to 2 thralls (3 from rank 2); a new one sends the oldest away. Skeletons and golems have no blood to take.",
      bite: { range: 44, wpn: 1.2, drain: 30, below: 0.4, chance: 0.4 } },
  ],

  // ---------------------------------------------------------------- SUMMONER
  // Void Lord rework (Murat 2026-11-08): the Summoner rules the Void. Golems are permanent (shared/summons.ts GOLEM),
  // the grimoire picks their elements, every creature acts on its own (no commands), and the Essence they leave when
  // they go back to the Void feeds the ultimates.
  summoner: [
    // Golems: the permanent golems, their auras and the Colossus
    { id: "su_golem", name: "Elemental Golem", type: "Summon", branch: 0, row: 0, style: "earth", cd: 10000, mana: 25, target: "self",
      desc: "Your golems answer from the Void by themselves (12s after one falls). Cast this to pull them back at once, whole again. Choose their elements in your grimoire. Ranks: tougher, harder-hitting golems.",
      summon: true },
    { id: "su_bond", name: "Stone Bond", type: "Passive", branch: 0, row: 1, style: "earth", passive: { effect: "bond", perRank: 2 },
      desc: "Your nearest golem always takes part of every blow you take (30%, 22% from Lv 25). Each rank adds more. While it takes blows for you, the Void gives you Essence." },
    { id: "su_might", name: "Golem Mastery", type: "Passive", branch: 0, row: 1, style: "earth", passive: { effect: "summon", perRank: 8 },
      desc: "Your golems grow from the Void's own stone: more life and harder blows." },
    { id: "su_link", name: "Vital Link", type: "Passive", branch: 0, row: 2, style: "earth", passive: { effect: "golemRegen", perRank: 1 },
      desc: "Your life force flows into your golems: close to you, they mend part of their life every second." },
    { id: "su_resonance", name: "Resonance", type: "Passive", branch: 0, row: 2, style: "arcane", passive: { effect: "resonance", perRank: 10 },
      desc: "Each golem wraps you in the aura of its element (fire: harder, burning blows; frost: less damage, attackers chilled; venom: drink life, poisoned blows; storm: faster). Two of one element resonate (x1.5). Each rank makes every aura stronger." },
    { id: "su_twin", name: "Twin Bond", type: "Passive", branch: 0, row: 3, style: "earth", passive: { effect: "twin", perRank: 1 },
      desc: "A second golem answers your call. Its element is the second page of your grimoire." },
    { id: "su_colossus", name: "Colossus", type: "Ultimate", branch: 0, row: 4, style: "earth", cd: 45000, mana: 50, chargeMs: 600, target: "self", consume: true,
      desc: "Your golems fuse into one Colossus for 30s: far tougher, it slams everything around it and carries both their auras and powers. When its time is up it splits back into your golems. Spends your Essence: +25% per charge.",
      colossus: { ms: 30_000 } },

    // Void: control and escape
    { id: "su_step", name: "Rift Step", type: "Movement", branch: 1, row: 0, style: "arcane", cd: 5000, cost: 20,
      desc: "Step through a rift and come out ahead of you, untouchable for a moment.",
      move: { kind: "blink", dist: 60, invulnMs: 300 } },
    { id: "su_blackhole", name: "Black Hole", type: "Attack", branch: 1, row: 1, style: "arcane", cd: 14000, mana: 30, target: "point",
      desc: "Open a black hole at the spot for 3s: it drags foes in, tears at them and swallows every enemy projectile. Monsters at the end, or worn down below 15% of their life, are swallowed and spat out further away (each gives Essence). Heroes are never swallowed: they are thrown out a few steps.",
      field: { kind: "blackhole", r: 64, ms: 3000, tickMs: 500, dmg: 9, pull: 7, hole: { below: 0.15 } } },
    { id: "su_velocity", name: "Void Velocity", type: "Passive", branch: 1, row: 1, style: "wind", passive: { effect: "velocity", perRank: 8, blink: { ms: 3000 } },
      desc: "Coming out of a Rift Step, you move faster and your skills come back sooner for 3s." },
    { id: "su_gravity", name: "Gravity", type: "Passive", branch: 1, row: 2, style: "arcane", passive: { effect: "gravity", perRank: 10 },
      desc: "Your black holes grow wider and pull harder." },
    { id: "su_slip", name: "Void Slip", type: "Passive", branch: 1, row: 3, style: "shadow", passive: { effect: "slip", perRank: 1, slip: { below: 0.25, ms: 1500, perRank: 200, cdMs: 60_000, speed: 30, speedMs: 2000 } },
      desc: "When a blow drops you below 25% life, you slip into the Void: unseen and untouchable for a moment, monsters lose you and turn on your golems, and you come out running. Once a minute. Ranks: longer." },
    { id: "su_horizon", name: "Event Horizon", type: "Ultimate", branch: 1, row: 4, style: "arcane", cd: 45000, mana: 50, chargeMs: 400, target: "point", consume: true,
      desc: "Tear open a giant black hole for 5s: it drags in everything around, swallows every projectile and spits out what it eats. Spends your Essence: +25% per charge.",
      field: { kind: "blackhole", r: 110, ms: 5000, tickMs: 500, dmg: 12, pull: 10, hole: { below: 0.15 } } },

    // Conjuration: weapons and wisps out of the Void
    { id: "su_blades", name: "Void Blades", type: "Enchant", branch: 2, row: 0, style: "arcane", cd: 12000, mana: 20, target: "self",
      desc: "Three blades of the Void circle you for 8s, cutting every foe they pass. They take your golem's element.",
      field: { kind: "voidblades", r: 30, ms: 8000, tickMs: 450, follow: true, dmg: 6, blades: 3 } },
    { id: "su_wisps", name: "Elemental Wisps", type: "Summon", branch: 2, row: 1, style: "lightning", cd: 16000, mana: 30, target: "self",
      desc: "Call three wisps out of the Void for 15s, one of each of your golems' elements: they float near you and shoot at your foes on their own. When they fade they burst in their element.",
      wisps: { n: 3, ms: 15_000 } },
    { id: "su_edge", name: "Void Edge", type: "Passive", branch: 2, row: 1, style: "arcane", passive: { effect: "edge", perRank: 10 },
      desc: "Your Void Blades cut deeper, and more of them circle you (+1 at ranks 3 and 5)." },
    { id: "su_return", name: "Return to the Void", type: "Passive", branch: 2, row: 2, style: "spirit", passive: { effect: "return", perRank: 2 },
      desc: "Each of your creatures that goes back to the Void gives you back some life and mana (at most once a second)." },
    { id: "su_swarm", name: "Swarm", type: "Passive", branch: 2, row: 3, style: "lightning", passive: { effect: "swarm", perRank: 15 },
      desc: "One more wisp answers your call (up to four), and your wisps last longer." },
    { id: "su_arsenal", name: "Void Arsenal", type: "Ultimate", branch: 2, row: 4, style: "arcane", cd: 40000, mana: 50, chargeMs: 400, target: "self", consume: true,
      desc: "Open the Void's armoury for 8s: a blade circles you, a lance flies at your foes and runs them through, an axe sweeps a wide arc, and all four elemental wisps fight at your side. Spends your Essence: +25% per charge.",
      arsenal: { ms: 8000 } },
  ],
  // ---------------------------------------------------------------- SONGWEAVER
  // Plan v2 (Murat 2026-11-13): progression is music. Each skill is a note (degree, pitch); songs are 30s party auras,
  // one at a time; three notes in a progression fire a chord (shared/songs.ts). Texts: docs/songweaver-content.md.
  songweaver: [
    // Hymnal: healing and shields for the group
    { id: "sg_ballad", name: "Hearth Ballad", type: "Aura", branch: 0, row: 0, style: "holy", cd: 2000, mana: 14, target: "self", song: true, degree: "I", pitch: "M",
      desc: "Play the old village tune. For 30s it mends you and your party close by with every beat, and it follows you. Note I, the home note.",
      field: { kind: "ballad", r: 90, ms: 30000, tickMs: 1000, follow: true, party: { ms: 0, heal: 1.6 } } },
    { id: "sg_mend", name: "Mending Note", type: "Aura", branch: 0, row: 1, style: "holy", cd: 6000, mana: 16, target: "self", degree: "IV", pitch: "H",
      desc: "Pluck a clear high note: it heals you, then leaps to the nearest friend. Ranks 3 and 5 add one more friend. Note IV.",
      mend: { heal: 18, hops: 1, range: 110 } },
    { id: "sg_pedal", name: "Pedal Point", type: "Aura", branch: 0, row: 1, style: "holy", cd: 14000, mana: 18, target: "self", degree: "vi", pitch: "L",
      desc: "A held low note, steady while the tune moves above it. It shields you and your party close by. Note vi.",
      buff: { ms: 8000, shield: 28, party: 130 } },
    { id: "sg_lydian", name: "Lydian", type: "Passive", branch: 0, row: 2, style: "holy", passive: { effect: "mode", perRank: 10 },
      desc: "Unlocks the Lydian key: bright and generous. Healing that would go past full life becomes a shield instead. Each rank makes the shield stronger." },
    { id: "sg_legato", name: "Legato", type: "Passive", branch: 0, row: 2, style: "holy", passive: { effect: "legato", perRank: 1 },
      desc: "Played smooth, each note flowing into the next. The gifts of your songs linger on a friend after they step out of the song." },
    { id: "sg_chorale", name: "Chorale", type: "Ultimate", branch: 0, row: 4, style: "holy", cd: 40000, mana: 45, chargeMs: 400, target: "self", degree: "I", pitch: "M",
      desc: "Many voices, one hymn. You and your party close by heal, more for every friend standing in it, and keep mending for a few seconds. Note I.",
      chorale: { heal: 18, perAlly: 0.15, r: 140 }, buff: { ms: 8000, regen: 2, party: 140 } },

    // Folk: speed, attack speed and damage for the group
    { id: "sg_march", name: "Marching Tune", type: "Aura", branch: 1, row: 0, style: "wind", cd: 2000, mana: 14, target: "self", song: true, degree: "I", pitch: "M",
      desc: "Chorus: a steady march for 30s. You and your party inside move faster and are harder to push around. Note I.",
      field: { kind: "march", r: 90, ms: 30000, tickMs: 1000, follow: true, party: { ms: 0, speed: 12, poise: 20 } } },
    { id: "sg_jig", name: "Jig", type: "War cry", branch: 1, row: 1, style: "wind", cd: 12000, mana: 14, target: "self", degree: "ii", pitch: "H",
      desc: "A quick dance tune. You and your party close by strike faster for a few seconds. Note ii.",
      buff: { ms: 8000, atkspd: 26, party: 130 } },
    { id: "sg_call", name: "Call", type: "War cry", branch: 1, row: 1, style: "wind", cd: 9000, mana: 12, target: "self", degree: "V", pitch: "H",
      desc: "Call and response. A ringing shout jolts foes close by, and for a few seconds you and your party answer with harder blows. Note V.",
      cry: { r: 56, dmg: 18, kb: 0.6 }, buff: { ms: 5000, dmg: 26, party: 130 } },
    { id: "sg_dorian", name: "Dorian", type: "Passive", branch: 1, row: 2, style: "wind", passive: { effect: "mode", perRank: 10 },
      desc: "Unlocks the Dorian key: plain and even, fit for the road. Your songs reach farther, and it serves friends and foes alike. Each rank adds reach." },
    { id: "sg_accel", name: "Accelerando", type: "Passive", branch: 1, row: 2, style: "wind", passive: { effect: "accel", perRank: 5 },
      desc: "Gradually quickening. The more Tempo you build, the faster your songs beat." },
    { id: "sg_anthem", name: "Anthem", type: "Ultimate", branch: 1, row: 4, style: "wind", cd: 40000, mana: 45, chargeMs: 300, target: "self", degree: "I", pitch: "L",
      desc: "A crescendo that grows louder and prouder with every beat. For a while you and your party inside hit harder and move and strike faster. Note I, played low.",
      crescendo: 0.1, field: { kind: "anthem", r: 120, ms: 10000, tickMs: 1000, follow: true, party: { ms: 0, dmg: 13, speed: 8, atkspd: 11 } } },

    // Discord: slows, poise drain and the solo damage
    { id: "sg_dirge", name: "Dirge", type: "Aura", branch: 2, row: 0, style: "shadow", cd: 2000, mana: 14, target: "self", song: true, degree: "i", pitch: "L",
      desc: "Chorus: a slow, heavy lament for 30s. Foes inside are slowed, worn down and lose their footing. Learning it opens the Minor key. Note i, home in shadow.",
      field: { kind: "dirge", r: 70, ms: 30000, tickMs: 1000, follow: true, dmg: 8, slowMs: 1100 } },
    { id: "sg_shrill", name: "Shrill Note", type: "Attack", branch: 2, row: 1, style: "arcane", cd: 5000, mana: 14, degree: "V", pitch: "H",
      desc: "A piercing note that runs through foes and bounces off walls. Stone gives it back, wood gives back less, and leaves and water swallow it. Each rank adds a bounce. Note V.",
      shots: { kind: "wave", speed: 260, range: 190, radius: 6, size: 1.2, dmg: 28, pierce: 2, bounce: 1, perRank: { bounce: 1 }, kb: 0.5 } },
    { id: "sg_crack", name: "Cracked String", type: "Attack", branch: 2, row: 1, style: "arcane", cd: 8000, mana: 16, degree: "bII", pitch: "M",
      desc: "Snap a string on purpose. A harsh twang hurts and stuns the foes ahead of you. From rank 3 it rings again, softer, like a canon. Note bII, the sour step above home.",
      areas: [{ r: 28, ahead: 34, dmg: 26, stunMs: 700, kb: 0.8, look: "burst" }], canon: { rank: 3, delayMs: 600, mult: 0.5 } },
    { id: "sg_phrygian", name: "Phrygian", type: "Passive", branch: 2, row: 2, style: "shadow", passive: { effect: "mode", perRank: 10 },
      desc: "Unlocks the Phrygian key: dark, with a flinch in it. Your sound drains more poise and makes foes ring faster. Each rank adds more." },
    { id: "sg_sympathy", name: "Sympathetic Strings", type: "Passive", branch: 2, row: 2, style: "arcane", passive: { effect: "sympathy", perRank: 10 },
      desc: "Strings that hum along with each other. Foes ring faster, and when the ringing bursts it spreads to foes close by. Each rank adds more." },
    { id: "sg_twelve", name: "Twelve-Tone Storm", type: "Ultimate", branch: 2, row: 4, style: "arcane", cd: 35000, mana: 45, chargeMs: 400, target: "self", degree: "bII", pitch: "any",
      desc: "Every note at once, none of them at home. Four waves of sound crash around you, and each foe hears the note it likes best. Note bII.",
      areas: [{ r: 72, dmg: 16, waves: 4, everyMs: 300, slowMs: 600, kb: 0.4, look: "nova" }] },
  ],
};

// ---- Tree shape -------------------------------------------------------------------------------------
/**
 * id: [level needed, parent skill, attribute scaling]. Uneven on purpose: some branches fork early, strong skills
 * such as Valor Rush, Inferno Orb or Fan of Arrows are dead ends, and the ultimates crown the longest limbs.
 */
type Shape = [req: number, parent?: string, scale?: [StatKind, number]];
// Attribute scaling was cut to 60% in the balance pass of 2026-11-04: it multiplied with the weapon hit / Magic, so high-level skills grew far too fast
const TREE: Record<string, Shape> = {
  // Songweaver (Plan v2): roots at Lv 1, a mode and a device per branch around Lv 8-12, ultimates at 20-22
  sg_ballad: [1, undefined, ["mag", 2]], sg_mend: [3, "sg_ballad", ["mag", 2]], sg_pedal: [5, "sg_ballad", ["mag", 2]],
  sg_lydian: [8, "sg_mend"], sg_legato: [11, "sg_pedal"], sg_chorale: [20, "sg_lydian", ["mag", 2.5]],
  sg_march: [1], sg_jig: [3, "sg_march"], sg_call: [4, "sg_march", ["mag", 2]],
  sg_dorian: [9, "sg_jig"], sg_accel: [12, "sg_call"], sg_anthem: [21, "sg_dorian", ["mag", 2.5]],
  sg_dirge: [1, undefined, ["mag", 2]], sg_shrill: [2, "sg_dirge", ["mag", 2]], sg_crack: [4, "sg_dirge", ["mag", 2]],
  sg_phrygian: [10, "sg_crack"], sg_sympathy: [12, "sg_shrill"], sg_twelve: [22, "sg_phrygian", ["mag", 2.5]],
  // Summoner, Void Lord rework (Murat 2026-11-08): Lv 1 roots, Twin Bond 18, Colossus 20, Event Horizon 21, Void Arsenal 22.
  // The golems, wisps, blades and black holes grow with Magic.
  su_golem: [1, undefined, ["mag", 2]], su_bond: [2, "su_golem"], su_might: [3, "su_golem"], su_link: [5, "su_might"],
  su_resonance: [9, "su_bond"], su_twin: [18, "su_might"], su_colossus: [20, "su_twin", ["mag", 2.5]],
  su_step: [1], su_blackhole: [4, "su_step", ["mag", 2]], su_velocity: [6, "su_step"], su_gravity: [8, "su_blackhole"],
  su_slip: [12, "su_velocity"], su_horizon: [21, "su_gravity", ["mag", 2.5]],
  su_blades: [1, undefined, ["mag", 2]], su_wisps: [3, "su_blades", ["mag", 2]], su_edge: [6, "su_blades"], su_return: [8, "su_wisps"],
  su_swarm: [11, "su_wisps"], su_arsenal: [22, "su_edge", ["mag", 2.5]],
  // Knight · Valor: lunge forks into a dead-end charge and the whirl, which grows on to the Judgement Blade
  k_lunge: [1, undefined, ["str", 2.5]], k_rush: [9, "k_lunge", ["str", 2.5]], k_whirl: [4, "k_lunge", ["str", 2.5]],
  k_mastery: [12, "k_whirl"], k_judgement: [22, "k_whirl", ["str", 3]],
  // Knight · Bulwark: one long limb, Iron Skin hangs off the root
  k_shield: [1], k_ironskin: [6, "k_shield"], k_riposte: [3, "k_shield", ["dex", 2]], k_taunt: [10, "k_riposte"],
  k_quake: [20, "k_taunt", ["sta", 2.5]],
  // Knight · Crusade
  k_holyblade: [2], k_consecrate: [5, "k_holyblade", ["mag", 2]], k_aura: [13, "k_consecrate", ["mag", 2]],
  k_rally: [8, "k_consecrate"], k_wrath: [24, "k_rally", ["mag", 2.5]],
  // Ninja · Shadow: the smoke fork ends in Assassinate (dead end) or Thousand Cuts
  n_step: [1], n_swift: [6, "n_step"], n_smoke: [4, "n_step"], n_assassinate: [11, "n_smoke", ["dex", 2.5]],
  n_cuts: [22, "n_smoke", ["dex", 2.5]],
  // Ninja · Steel
  n_shuriken: [1, undefined, ["dex", 2]], n_flurry: [4, "n_shuriken"], n_vital: [12, "n_flurry"], n_parry: [8, "n_flurry", ["dex", 2]],
  n_storm: [20, "n_parry", ["str", 2]],
  // Ninja · Spirit: fire splits into poison craft (dead end) and lightning, which leads to the dragon
  n_flame: [2, undefined, ["mag", 2]], n_poison: [5, "n_flame"], n_caltrops: [9, "n_poison", ["dex", 1]],
  n_lightning: [12, "n_flame", ["mag", 2]], n_dragon: [24, "n_lightning", ["mag", 2.5]],
  // Wizard: three schools, one spell each (Murat 2026-11-07)
  w_firebolt: [1, undefined, ["mag", 2]], w_blizzard: [1, undefined, ["mag", 2]], w_storm: [1, undefined, ["mag", 2]],
  // Upgrades of each spell (Murat 2026-11-07): two paths per school, tiers at levels 3, 8 and 14
  w_fb_split: [3, "w_firebolt"], w_fb_haste: [8, "w_fb_split"], w_fb_pierce: [14, "w_fb_haste"],
  w_fb_heat: [3, "w_firebolt"], w_fb_burst: [8, "w_fb_heat"], w_fb_inferno: [14, "w_fb_burst"],
  w_bz_wide: [3, "w_blizzard"], w_bz_last: [8, "w_bz_wide"], w_bz_age: [14, "w_bz_last"],
  w_bz_bite: [3, "w_blizzard"], w_bz_freeze: [8, "w_bz_bite"], w_bz_bite2: [14, "w_bz_freeze"],
  w_th_fork: [3, "w_storm"], w_th_wide: [8, "w_th_fork"], w_th_long: [14, "w_th_wide"],
  w_th_charge: [3, "w_storm"], w_th_stun: [8, "w_th_charge"], w_th_swift: [14, "w_th_stun"],
  // Archer · Marksman: Power Shot forks into the Fan (dead end) and Steady Aim on to the Arrow Rain
  a_volley: [1, undefined, ["dex", 2]], a_power: [4, "a_volley", ["str", 2]], a_fan: [10, "a_power", ["dex", 2]],
  a_aim: [7, "a_power"], a_rain: [20, "a_aim", ["dex", 2]],
  // Archer · Trapper: the reflex is a dead end right off the root
  a_beartrap: [1, undefined, ["str", 1]], a_reflex: [3, "a_beartrap", ["dex", 2]], a_explosive: [6, "a_beartrap", ["mag", 2]],
  a_net: [10, "a_explosive"], a_sentry: [22, "a_net", ["dex", 2]],
  // Archer · Nature
  a_firearrows: [2], a_frostarrow: [5, "a_firearrows", ["mag", 1]], a_feast: [12, "a_frostarrow"], a_windwalk: [8, "a_frostarrow"],
  a_phoenix: [24, "a_windwalk", ["mag", 2.5]],
  // Barbarian · Fury
  b_rage: [1], b_cleave: [3, "b_rage", ["str", 2]], b_bloodthirst: [8, "b_cleave"], b_berserk: [11, "b_cleave"],
  b_whirlwind: [22, "b_berserk", ["str", 2.5]],
  // Barbarian · Warcry: the battle cry forks into the howl (ending in Retaliate) and the drums (ending in the ancestors)
  b_battlecry: [1], b_howl: [5, "b_battlecry"], b_retaliate: [9, "b_howl", ["sta", 2]], b_drums: [12, "b_battlecry", ["sta", 1]],
  b_ancestors: [24, "b_drums", ["str", 2]],
  // Barbarian · Earth: Leap forks into the Seismic Wave (dead end) and Thick Skin on to the Avalanche
  b_slam: [1, undefined, ["sta", 1]], b_leap: [4, "b_slam", ["str", 2]], b_seismic: [10, "b_leap", ["str", 2]],
  b_thick: [7, "b_leap"], b_avalanche: [20, "b_thick", ["sta", 2]],
  // Vampire · Blood: the Blood Link forks into the Lance (dead end), Boil Blood (ending in Exsanguinate) and the Pact,
  // which leads on to the Ward (dead end) and the Crimson Tide
  v_link: [1, undefined, ["mag", 2]], v_lance: [3, "v_link", ["mag", 2]], v_boil: [4, "v_link", ["mag", 2]], v_exsang: [11, "v_boil", ["mag", 2.5]],
  v_pact: [7, "v_link"], v_ward: [12, "v_pact", ["sta", 2]], v_tide: [22, "v_pact", ["mag", 2.5]],
  // Vampire · Night: Charm hangs off the mist and leads to the passive and the soil (dead end); the bats grow into the rats and Nightfall, and into Bat Form (dead end)
  v_mist: [1], v_gaze: [6, "v_mist"], v_nightborn: [8, "v_gaze"], v_soil: [13, "v_nightborn"], v_bats: [4, "v_mist", ["mag", 2]],
  v_rats: [10, "v_bats", ["mag", 2]], v_nightfall: [21, "v_rats", ["mag", 2.5]], v_batform: [12, "v_bats"],
  // Vampire · Fang: Thirst leads to the Hunger (dead end); the slash grows into the Pounce, which leads to the Brides and Wolf Form (dead end); Devour, then Bite
  v_rend: [1, undefined, ["str", 2]], v_thirst: [3, "v_rend"], v_hunger: [8, "v_thirst"], v_pounce: [9, "v_rend", ["str", 2]],
  v_brides: [20, "v_pounce", ["mag", 2.5]], v_wolfform: [14, "v_pounce"],
  v_devour: [4, "v_rend", ["str", 2]], v_bite: [7, "v_devour", ["mag", 2]],
};
/**
 * Skills that need the right weapon in hand (Murat 2026-11-04): bow skills need a bow, blade work needs a melee
 * weapon, Shield Wall needs a shield. Spells, shouts, traps, auras and movement work with anything.
 */
const NEEDS: Record<string, WeaponNeed> = {
  k_lunge: "melee", k_whirl: "melee", k_rush: "melee", k_judgement: "melee", k_riposte: "melee", k_holyblade: "melee", k_shield: "shield",
  n_assassinate: "melee", n_cuts: "melee", n_flurry: "melee", n_parry: "melee", n_storm: "melee", n_poison: "melee",
  a_volley: "bow", a_power: "bow", a_fan: "bow", a_rain: "bow", a_net: "bow", a_firearrows: "bow", a_frostarrow: "bow", a_phoenix: "bow",
  b_cleave: "melee", b_berserk: "melee", b_whirlwind: "melee", b_slam: "melee",
  v_rend: "melee", v_pounce: "melee", v_thirst: "melee",
};
/** Second prerequisites (Diablo 2 style): skill id -> other skills that must be learned first. */
const REQUIRES: Record<string, string[]> = {
};
/** Synergies (Diablo 2 style): skill id -> +pct% damage per rank of each `from` skill. */
const SYNERGY: Record<string, { from: string; pct: number }[]> = {
};
// Every wizard skill, spells and upgrades alike, takes 6 ranks (Murat 2026-11-07)
for (const sk of S.wizard) sk.maxRank = 6;
/**
 * Vampire ranks (Murat 2026-11-07: each skill takes as many points as give a clear step). Skills whose ranks add
 * something you can count go to 5, the utility skills stay at 3. Steps besides +power / longer effects.
 * Level 50 review (Murat 2026-11-08): ranks 4 and 5 are mastery ranks earned in Act 2 (VAMP_MASTERY: Lv 30 and 40),
 * so the tree keeps growing past Act 1; the Blood and Night ultimates go to 5 as well.
 */
export const VAMP_MASTERY = [30, 40];
const VAMP_RANKS: Record<string, [number, string?]> = {
  v_link: [5], v_lance: [5, "pierces one more foe"], v_boil: [3], v_pact: [5], v_ward: [3], v_exsang: [5], v_tide: [5],
  v_mist: [3], v_bats: [5, "+2 bats"], v_gaze: [3, "charm lasts longer"], v_nightborn: [5], v_rats: [5, "+3 rats"], v_soil: [3], v_nightfall: [5], v_batform: [3],
  v_rend: [5], v_thirst: [3], v_hunger: [5], v_pounce: [3], v_devour: [3, "eats foes with 5% more life left"], v_bite: [3, "10% more chance to turn, +1 thrall at rank 2"], v_brides: [3, "+1 bride"], v_wolfform: [3],
};
for (const sk of S.vampire) { const v = VAMP_RANKS[sk.id]; if (v) { sk.maxRank = v[0]; sk.rankStep = v[1]; if (v[0] > 3) sk.rankLevels = VAMP_MASTERY; } }
/** Summoner ranks (Void Lord rework 2026-11-08), on the vampire's model: ranks 4-5 are mastery ranks (Lv 30 and 40). */
const SUMMONER_RANKS: Record<string, [number, string?]> = {
  su_golem: [5], su_bond: [5, "+2% of each blow"], su_might: [5], su_link: [3], su_resonance: [3], su_twin: [1], su_colossus: [5],
  su_step: [3], su_blackhole: [5], su_velocity: [3], su_gravity: [3], su_slip: [3, "+0.2s in the Void"], su_horizon: [5],
  su_blades: [5], su_wisps: [5], su_edge: [5, "+1 blade at ranks 3 and 5"], su_return: [3], su_swarm: [3, "wisps last longer"], su_arsenal: [5],
};
for (const sk of S.summoner) { const v = SUMMONER_RANKS[sk.id]; if (v) { sk.maxRank = v[0]; sk.rankStep = v[1]; if (v[0] > 3) sk.rankLevels = VAMP_MASTERY; } }
/** Songweaver ranks (Plan v2), like the Summoner: actives and ultimates to 5 (mastery ranks at Lv 30 and 40), passives to 3. */
const SONGWEAVER_RANKS: Record<string, [number, string?]> = {
  sg_ballad: [5], sg_mend: [5, "+1 ally at ranks 3 and 5"], sg_pedal: [5], sg_lydian: [3], sg_legato: [3], sg_chorale: [5],
  sg_march: [5], sg_jig: [5], sg_call: [5], sg_dorian: [3], sg_accel: [3], sg_anthem: [5],
  sg_dirge: [5], sg_shrill: [3, "+1 bounce"], sg_crack: [5, "rings again from rank 3"], sg_phrygian: [3], sg_sympathy: [3], sg_twelve: [5],
};
for (const sk of S.songweaver) { const v = SONGWEAVER_RANKS[sk.id]; if (v) { sk.maxRank = v[0]; sk.rankStep = v[1]; if (v[0] > 3) sk.rankLevels = VAMP_MASTERY; } }
for (const list of Object.values(S)) for (const sk of list) {
  sk.needs = NEEDS[sk.id];
  sk.requires = REQUIRES[sk.id];
  sk.synergy = SYNERGY[sk.id];
  const t = TREE[sk.id];
  if (!t) throw new Error(`skill ${sk.id} has no place in TREE`);
  sk.req = t[0]; sk.parent = t[1];
  if (t[2]) sk.scale = { stat: t[2][0], per: t[2][1] };
}
// Tree order: parents before children, lower levels first
for (const list of Object.values(S)) list.sort((a, b) => a.branch - b.branch || depth(a, list) - depth(b, list) || a.req - b.req);
function depth(s: SkillDef, list: SkillDef[]): number { let d = 0, p = s.parent; while (p) { d++; p = list.find((x) => x.id === p)?.parent; } return d; }

/**
 * Spell `s` with the hero's learned upgrade nodes (SkillDef.mod) applied: more bolts, bigger radius, shorter cooldown...
 * Returns `s` itself when nothing upgrades it. Damage upgrades go into `power`.
 */
export function withMods(cls: ClassKind, r: Ranks | undefined, s: SkillDef): SkillDef {
  if (!r || s.mod || s.passive) return s;
  const t: Required<Omit<SkillMod, "of">> = { n: 0, dmg: 0, cd: 0, mana: 0, radius: 0, ms: 0, tick: 0, slow: 0, stun: 0, speed: 0, burn: 0, zap: 0, pierce: 0, explode: 0 };
  let any = false;
  for (const m of S[cls] ?? []) {
    if (m.mod?.of !== s.id) continue;
    const k = Math.min(maxRank(m), rankOf(r, m.id));
    if (k <= 0) continue;
    any = true;
    for (const key of Object.keys(t) as (keyof typeof t)[]) t[key] += (m.mod[key] ?? 0) * k;
  }
  if (!any) return s;
  const pct = (v: number) => Math.max(0.1, 1 + v / 100);
  const o: SkillDef = { ...s, power: (s.power ?? 1) * pct(t.dmg) };
  if (s.cd) o.cd = Math.round(s.cd * pct(t.cd));
  if (s.mana) o.mana = Math.max(1, Math.round(s.mana * pct(t.mana)));
  if (s.shots) {
    const d = { ...s.shots };
    if (t.n) { const n = (d.n ?? 1) + t.n; d.n = n; d.spread = Math.max(d.spread ?? 0, 12 * (n - 1)); }
    if (t.pierce) d.pierce = (d.pierce ?? 0) + t.pierce;
    if (t.explode) d.explode = (d.explode ?? 0) + t.explode;
    if (t.speed) { d.speed *= pct(t.speed); d.range *= pct(t.speed); }
    if (t.burn && d.burn) d.burn = [d.burn[0] * pct(t.burn), d.burn[1]];
    o.shots = d;
  }
  if (s.field) {
    const f = { ...s.field };
    f.r *= pct(t.radius); f.ms *= pct(t.ms);
    if (t.tick) f.tickMs = Math.max(100, f.tickMs / pct(t.tick));
    if (f.slowMs) f.slowMs *= pct(t.slow);
    if (f.zap) f.zap = { ...f.zap, n: f.zap.n + t.zap, stunMs: f.zap.stunMs && f.zap.stunMs * pct(t.stun) };
    if (f.ahead && t.radius) f.ahead *= pct(t.radius);
    o.field = f;
  }
  return o;
}

/** Synergy multiplier of a skill: 1 + its SYNERGY bonuses for the ranks the hero has in those skills. */
export function synergyPower(s: SkillDef, r: Ranks | undefined): number {
  let pct = 0;
  for (const y of s.synergy ?? []) pct += y.pct * Math.min(maxRank(BY_ID.get(y.from)), rankOf(r, y.from));
  return 1 + pct / 100;
}

/** Skills that need a higher level hit harder: +LEVEL_POWER skill power per level needed above 1. */
export const LEVEL_POWER = 0.03;
export const levelPower = (s: SkillDef) => 1 + LEVEL_POWER * Math.max(0, s.req - 1);
/** Extra power from the skill's attribute: +per% for each point above the class's base (gear counts). */
export function scalePower(s: SkillDef, stats?: Partial<Record<StatKind, number>>, base?: Partial<Record<StatKind, number>>): number {
  if (!s.scale || !stats) return 1;
  return 1 + s.scale.per / 100 * Math.max(0, (stats[s.scale.stat] ?? 0) - (base?.[s.scale.stat] ?? 0));
}
/** The skills that grow out of `id`. */
export const childrenOf = (cls: ClassKind, id: string) => S[cls].filter((x) => x.parent === id);

/**
 * Basic spells (Murat 2026-11-04): every caster knows these from Lv 1, no skill points, no tree. Cheap, short reach,
 * a tiny cooldown: made to be cast again and again up close, e.g. bound to the left click. They cost a little mana.
 */
export const CANTRIPS: Record<ClassKind, SkillDef[]> = {
  knight: [], ninja: [], archer: [], barbarian: [],
  summoner: [], // Attune is gone: the grimoire picks the golems' elements (Void Lord rework 2026-11-08)
  // The vampire's one basic spell: a flick of blood up close that drinks a little back (Murat 2026-11-05: warrior caster)
  vampire: [
    { id: "v_leech", name: "Leech", type: "Attack", branch: 0, row: 0, req: 1, style: "blood", cd: 450, mana: 4, cantrip: true,
      desc: "Flick a drop of blood at a foe close by: they bleed for 4s, and every hit you land on them while they bleed gives you a Blood stack. Costs little mana: cast it again and again.",
      shots: { kind: "bloodbolt", speed: 300, range: 95, radius: 4, size: 0.6, dmg: 8, burn: [6, 4000], bleed: "drip", leechMs: 4000, drain: 10, kb: 0.2 } },
  ],
  wizard: [], // the wizard has no basic spells: its three schools are in the tree (Murat 2026-11-07)
  // The Songweaver's one basic spell: switch mode (shared/songs.ts). Locked until a second mode is known.
  songweaver: [
    { id: "sg_modulate", name: "Modulate", type: "Aura", branch: 0, row: 0, req: 1, style: "holy", cd: 600, mana: 4, cantrip: true, modulate: true, target: "self", degree: "I", pitch: "M",
      desc: "Change key: switch to the next key you know and recolour the song you are playing. Needs two keys. Major favours friends, the dark keys favour damage.",
    },
  ],
};

/**
 * Chord finishers (shared/songs.ts PROGRESSIONS): hidden skills that a progression fires by itself, coloured by the mode.
 * Registered by id (skillById) but never castable: not in the tree, not a cantrip.
 */
export const FINISHERS: SkillDef[] = [
  { id: "sg_f_amen", name: "Amen", type: "Ultimate", branch: 0, row: 3, req: 10, style: "holy", finisher: true, target: "self",
    desc: "Amen, a hymn's closing chord. You and your party close by are healed and shielded.",
    buff: { ms: 6000, heal: 16, shield: 24, party: 130 } },
  { id: "sg_f_encore", name: "Turnaround", type: "Ultimate", branch: 1, row: 3, req: 10, style: "wind", finisher: true, target: "self",
    desc: "The tune circles back and kicks the band into gear. You and your party close by hit harder and faster for a few seconds.",
    buff: { ms: 8000, dmg: 22, atkspd: 28, party: 130 } },
  { id: "sg_f_shatter", name: "Shatterchord", type: "Ultimate", branch: 2, row: 3, req: 10, style: "arcane", finisher: true, target: "self",
    desc: "A cruel chord that rings the whole room. Foes around you are hurt, stunned and left ringing hard.",
    areas: [{ r: 60, dmg: 26, stunMs: 800, kb: 1, look: "nova", sound: { res: 50 } }] },
  { id: "sg_f_resolve", name: "Perfect Cadence", type: "Ultimate", branch: 0, row: 3, req: 10, style: "holy", finisher: true, target: "self",
    desc: "Tension settles into home. Foes around you are hurt and left ringing, and you and your party close by are healed.",
    areas: [{ r: 60, dmg: 20, kb: 0.6, look: "nova", sound: { res: 30 } }], buff: { ms: 1000, heal: 8, party: 130 } },
  { id: "sg_f_sleight", name: "Deceptive Cadence", type: "Ultimate", branch: 1, row: 3, req: 10, style: "shadow", finisher: true, target: "self",
    desc: "You promise home, then step aside. For a moment nothing can touch you, and foes around you flee.",
    untouchable: 1200, cry: { r: 72, fearMs: 1500 } },
];
for (const f of FINISHERS) f.scale = { stat: "mag", per: 2 };

export const SKILLS = S;
const BY_ID = new Map<string, SkillDef>();
for (const list of [...Object.values(S), ...Object.values(CANTRIPS), FINISHERS]) for (const s of list) BY_ID.set(s.id, s);
export const skillById = (id: string) => BY_ID.get(id);
export const skillOf = (cls: ClassKind, id: string) => { const s = BY_ID.get(id); return s && (S[cls].includes(s) || CANTRIPS[cls]?.includes(s)) ? s : undefined; };
export const isActive = (s: SkillDef) => !s.passive;
export const maxRank = (s: SkillDef | undefined) => s?.maxRank ?? MAX_RANK;
/** The highest rank any skill of the class can reach (how many learning passes "learn everything" needs). */
export const topRank = (cls: ClassKind) => Math.max(MAX_RANK, ...(S[cls] ?? []).map((s) => maxRank(s)));

// ---- Ranks -------------------------------------------------------------------------------------------
/** Ranks per skill id. Works with a plain object or a Colyseus MapSchema. */
export type Ranks = { get(id: string): number | undefined; forEach?: any } | Record<string, number>;
export const rankOf = (r: Ranks | undefined, id: string): number =>
  !r ? 0 : (typeof (r as any).get === "function" ? (r as any).get(id) : (r as Record<string, number>)[id]) ?? 0;

/** Damage and duration multipliers of a skill at `rank` (1 = base). */
export const rankPower = (rank: number) => 1 + RANK_POWER * Math.max(0, rank - 1);
export const rankTime = (rank: number) => 1 + RANK_TIME * Math.max(0, rank - 1);

/** The active skills a class can put on a key, in tree order. */
/** Every active skill of the class: its basic spells first, then the tree's. */
export const activeSkills = (cls: ClassKind) => [...(CANTRIPS[cls] ?? []), ...S[cls].filter(isActive)];
/** Every skill of a class (actives and passives), in tree order. */
export const classSkills = (cls: ClassKind) => S[cls].slice();
export const skillLearned = (cls: ClassKind, r: Ranks, id: string) => { const s = skillOf(cls, id); return !!s && (!!s.cantrip || rankOf(r, id) > 0); };


export function talentPoints(level: number): number { return Math.max(0, level - 1); }

export function spentPoints(cls: ClassKind, r: Ranks): number {
  return S[cls].reduce((s, n) => s + Math.min(maxRank(n), rankOf(r, n.id)), 0);
}

export type LockReason = "" | "max" | "level" | "above" | "requires" | "points";
/** Why skill `id` can't take one more rank right now ("" = it can). A skill needs its parent skill learned. */
export function lockReason(cls: ClassKind, level: number, r: Ranks, id: string): LockReason {
  const n = skillOf(cls, id);
  if (!n || n.cantrip || rankOf(r, id) >= maxRank(n)) return "max";
  if (level < n.req || level < nextRankLevel(n, rankOf(r, id))) return "level";
  if (n.parent && rankOf(r, n.parent) < 1) return "above";
  if (n.requires?.some((q) => rankOf(r, q) < 1)) return "requires";
  if (spentPoints(cls, r) >= talentPoints(level)) return "points";
  return "";
}
/** Hero level the next rank of `s` needs, when it has `rank` ranks now (its unlock level for rank 1). */
export function nextRankLevel(s: SkillDef, rank: number): number {
  return rank < 3 ? s.req : Math.max(s.req, s.rankLevels?.[rank - 3] ?? 0);
}
/** Ranks of `s` a hero of `level` may hold (the mastery ranks wait for their level). */
export function rankCap(s: SkillDef, level: number): number {
  let r = 0;
  while (r < maxRank(s) && level >= nextRankLevel(s, r)) r++;
  return r;
}
export const canLearn = (cls: ClassKind, level: number, r: Ranks, id: string) => lockReason(cls, level, r, id) === "";

/** Total passive bonus for an effect, in percent (e.g. 12 = +12%). */
export function talentBonus(cls: ClassKind, r: Ranks, effect: TalentEffect): number {
  let v = 0;
  const both = effect === "summonHp" || effect === "summonDmg"; // Golem Mastery ("summon") counts for both
  for (const s of S[cls]) if (s.passive?.effect === effect || (both && s.passive?.effect === "summon")) v += s.passive!.perRank * Math.min(maxRank(s), rankOf(r, s.id));
  return v;
}
/** The buff Child of the Night gives at night, from its total passive value `v` (perRank x rank). */
export const nightBuff = (v: number) => ({ dmg: v, lifesteal: Math.round(v / 3), speed: Math.round(v / 2) });

/** % of max HP that every skill costs on top of its own price (learned passives with passive.blood: Blood Pact). */
export function passiveBlood(cls: ClassKind, r: Ranks | undefined): number {
  let v = 0;
  for (const s of S[cls]) if (s.passive?.blood && rankOf(r, s.id) > 0) v += s.passive.blood;
  return v;
}
export const talentMult = (cls: ClassKind, r: Ranks, effect: TalentEffect) => 1 + talentBonus(cls, r, effect) / 100;
export const talentReduce = (cls: ClassKind, r: Ranks, effect: TalentEffect) => 1 - talentBonus(cls, r, effect) / 100;

export const EFFECT_TEXT: Record<TalentEffect, (v: number) => string> = {
  dmg: (v) => `+${v}% damage`,
  skill: (v) => `+${v}% skill damage`,
  crit: (v) => `+${v}% chance to deal double damage`,
  lifesteal: (v) => `Heal ${v}% of damage dealt`,
  hp: (v) => `+${v}% max HP`,
  armor: (v) => `-${v}% damage taken`,
  speed: (v) => `+${v}% move speed`,
  cdr: (v) => `-${v}% skill cooldowns`,
  regen: (v) => `+${v}% max HP regen per second`,
  mana: (v) => `+${v}% mana regen`,
  night: (v) => { const b = nightBuff(v); return `At night: +${b.dmg}% damage, heal ${b.lifesteal}% of damage dealt, +${b.speed}% move speed`; },
  summonHp: (v) => `+${v}% golem life`,
  summonDmg: (v) => `+${v}% golem damage`,
  summon: (v) => `+${v}% golem life and damage`,
  golemRegen: (v) => `Golems near you mend ${v}% of their life per second`,
  bond: (v) => `Stone Bond: your golem takes ${v}% more of each blow`,
  resonance: (v) => `+${v}% aura strength`,
  twin: () => `A second golem`,
  gravity: (v) => `+${v}% black hole size and pull`,
  velocity: (v) => `After a Rift Step: +${v}% move speed, -${v}% cooldowns for 3s`,
  slip: (v) => `Slip into the Void below 25% life (${(1.3 + 0.2 * v).toFixed(1)}s, once a minute)`,
  edge: (v) => `+${v}% Void Blade damage`,
  swarm: (v) => `+1 wisp, wisps last ${v}% longer`,
  return: (v) => `Each creature back in the Void heals ${v}% life and mana`,
  upgrade: () => "",
  mode: (v) => (v > 10 ? `Unlocks its mode; +${v - 10}% to its colour` : "Unlocks its mode"),
  legato: (v) => `Song gifts linger ${v}s longer after leaving the song`,
  accel: (v) => `Each Tempo stack quickens your song beats by ${v}%`,
  sympathy: (v) => `+${v}% resonance; a burst spreads to foes close by`,
};

/** Drop unknown skills (old saves) and anything above what the level allows. */
/** Skills that were replaced: old id -> new id. Saved ranks (and slots) move over, so the skills above them stay learned. */
// Murat 2026-11-07: Blood Bolt -> Blood Link; tree rebuild: Cloak of Night -> Rat Plague, Blood Frenzy -> The Brides
export const REPLACED_SKILLS: Record<string, string> = { v_bolt: "v_link", v_cloak: "v_rats", v_frenzy: "v_brides" };

export function cleanRanks(cls: ClassKind, level: number, saved: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  saved = { ...saved };
  for (const [from, to] of Object.entries(REPLACED_SKILLS)) if (saved[from] && !saved[to]) saved[to] = saved[from];
  for (const s of S[cls]) {
    const v = saved[s.id];
    if (typeof v === "number" && v > 0) out[s.id] = Math.min(rankCap(s, level) || 1, Math.floor(v));
  }
  // Learn order must still be valid: drop skills whose parent is missing or that need a higher level (S is in tree order)
  for (const s of S[cls]) if (out[s.id] && (level < s.req || (s.parent && !out[s.parent]) || s.requires?.some((q) => !out[q]))) delete out[s.id];
  return spentPoints(cls, out) <= talentPoints(level) ? out : {};
}

/**
 * How a skill is aimed with the mouse. Self: cast on the hero wherever you click (buffs, auras, war cries, counters).
 * Point: lands on the clicked spot, up to pointRange() away (leaps, blinks, ground blasts, traps). Dir: goes off
 * toward the click (shots, dashes, rolling waves).
 */
export function skillTarget(s: SkillDef): SkillTarget {
  if (s.target) return s.target;
  if (s.shots) return "dir";
  if (s.move) return s.move.kind === "leap" || s.move.kind === "blink" ? "point" : s.move.kind === "multi" ? "self" : "dir";
  if (s.areas?.length) {
    if (s.areas.some((a) => a.line)) return "dir";
    const ahead = Math.max(0, ...s.areas.filter((a) => !a.atStart).map((a) => a.ahead ?? 0));
    return ahead >= 30 ? "point" : ahead > 0 ? "dir" : "self"; // a blast out there / a swing or breath in front
  }
  if (s.field) return s.field.follow || !(s.field.ahead || s.field.trap) ? "self" : "point";
  return "self";
}

/** Furthest a "point" skill can be placed from the hero (px). */
export function pointRange(s: SkillDef): number {
  if (s.move && (s.move.kind === "leap" || s.move.kind === "blink")) return s.move.dist;
  const ahead = Math.max(0, ...(s.areas ?? []).map((a) => a.ahead ?? 0), s.field?.ahead ?? 0);
  return Math.max(90, ahead * 2.5);
}
