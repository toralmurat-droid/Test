import { ClassKind } from "./classes";
import type { StatKind } from "./powers";

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
  | "summonHp" | "summonDmg"; // the Summoner's golems (shared/summons.ts): +% life, +% damage

/** Look of a skill's effects on the client (colours and particle style). */
export type FxStyle =
  | "steel" | "holy" | "fire" | "frost" | "arcane" | "lightning" | "shadow" | "poison" | "earth" | "blood" | "wind" | "spirit" | "nature";

/** What an area hit looks like when it lands. */
export type AreaLook =
  | "slam" | "nova" | "slash" | "pillar" | "meteor" | "rain" | "sword" | "spikes" | "spirit" | "bolt" | "smoke" | "flame" | "burst";

export interface HitEffects {
  stunMs?: number; slowMs?: number; kb?: number;
  burn?: [dps: number, ms: number]; // damage over time (fire, poison, bleed)
  markMs?: number; // takes MARK_TAKEN more damage
  weakMs?: number; // deals WEAK_DEALT less damage
  fearMs?: number; // monsters run away dizzy; heroes are slowed and weakened
  pull?: number; // px pulled toward the centre
  drain?: number; // % of the damage dealt that heals the attacker (vampire blood magic)
}

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
}

export interface ShotDef extends HitEffects {
  kind: string; // projectile look (client)
  n?: number; spread?: number; // n shots fanned over `spread` degrees
  lanes?: number; // or n shots side by side, this many px apart
  speed: number; range: number; radius: number; size?: number;
  wpn?: number; dmg?: number;
  pierce?: number; // extra targets it passes through
  explode?: number; // radius of the blast where it stops
  chain?: number; // jumps to this many more enemies nearby (lightning)
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
}

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

export type SkillType = "Attack" | "Aura" | "War cry" | "Enchant" | "Buildup" | "Counter" | "Trap" | "Movement" | "Passive" | "Ultimate" | "Summon";

export interface SkillDef {
  id: string; name: string; type: SkillType; desc: string;
  branch: 0 | 1 | 2; row: 0 | 1 | 2 | 3 | 4;
  req: number; // hero level needed (filled from TREE)
  parent?: string; // skill that must be learned first (none = root of its branch)
  scale?: { stat: StatKind; per: number }; // +per% skill power for every point of `stat` above the class's base
  style: FxStyle;
  passive?: { effect: TalentEffect; perRank: number };
  cd?: number; // ms
  cost?: number; // Stamina (physical skills)
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
  /** Summoner (shared/summons.ts): calls a golem of the hero's current element (Player.attune). */
  summon?: boolean;
  /** Summoner ultimate: the hero's golems fuse into one Colossus for `ms`. */
  colossus?: { ms: number };
  /** Summoner basic spell: turns the element the next golem (and the Colossus) is called in. */
  attune?: boolean;
}

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
export function impactMs(look: AreaLook | undefined, r: number): number {
  switch (look) {
    case "sword": return SWORD_FALL_MS;
    case "meteor": return r >= 40 ? METEOR_FALL_MS : SMALL_METEOR_FALL_MS;
    case "rain": return RAIN_FALL_MS;
    default: return 0;
  }
}
export const STACK_NAME: Record<ClassKind, string> = { knight: "Valor", ninja: "Ki", wizard: "Arcane", archer: "Focus", barbarian: "Fury", vampire: "Blood", summoner: "Essence" };

export const BRANCHES: Record<ClassKind, [BranchDef, BranchDef, BranchDef]> = {
  knight: [{ name: "Valor", color: "#e63946" }, { name: "Bulwark", color: "#4cc9f0" }, { name: "Crusade", color: "#ffd166" }],
  ninja: [{ name: "Shadow", color: "#9d4edd" }, { name: "Steel", color: "#c0c8d8" }, { name: "Spirit", color: "#f77f00" }],
  wizard: [{ name: "Fire", color: "#f77f00" }, { name: "Frost", color: "#4cc9f0" }, { name: "Storm", color: "#b388ff" }],
  archer: [{ name: "Marksman", color: "#e63946" }, { name: "Trapper", color: "#a68a64" }, { name: "Nature", color: "#7cfc00" }],
  barbarian: [{ name: "Fury", color: "#e63946" }, { name: "Warcry", color: "#ffd166" }, { name: "Earth", color: "#a68a64" }],
  vampire: [{ name: "Blood", color: "#c1121f" }, { name: "Night", color: "#9d4edd" }, { name: "Fang", color: "#c0c8d8" }],
  summoner: [{ name: "Earth", color: "#a68a64" }, { name: "Flux", color: "#4cc9f0" }, { name: "Ruin", color: "#b388ff" }],
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
  wizard: [
    // Fire
    { id: "w_wave", name: "Flame Wave", type: "Attack", branch: 0, row: 0, style: "fire", cd: 1500, power: 0.42, mana: 8,
      desc: "Send a rolling wave of fire forward: it burns everything it passes.",
      shots: { kind: "flamewave", speed: 160, range: 130, radius: 10, size: 1.5, dmg: 30, burn: [4, 2000], pierce: 99, kb: 0.4 } },
    { id: "w_pyro", name: "Pyromancy", type: "Passive", branch: 0, row: 1, style: "fire", passive: { effect: "skill", perRank: 7 },
      desc: "Fire answers you: more skill damage." },
    { id: "w_firewall", name: "Fire Wall", type: "Aura", branch: 0, row: 2, style: "fire", cd: 6000, power: 0.62, mana: 19,
      desc: "Raise a wall of flame ahead for 4s: enemies inside burn.",
      field: { kind: "fire", r: 34, ahead: 44, ms: 4000, tickMs: 400, dmg: 10 } },
    { id: "w_orb", name: "Inferno Orb", type: "Buildup", branch: 0, row: 3, style: "fire", cd: 4000, power: 0.42, mana: 15, chargeMs: 200, consume: true,
      desc: "Gather fire into a huge orb, then hurl it: it explodes in a big blast. Arcane stacks make it stronger.",
      shots: { kind: "inferno", speed: 150, range: 160, radius: 9, size: 2.2, dmg: 100, explode: 50, burn: [5, 2000], kb: 2 } },
    { id: "w_meteor", name: "Meteor Shower", type: "Ultimate", branch: 0, row: 4, style: "fire", cd: 7000, power: 0.46, mana: 25, chargeMs: 300,
      desc: "Pull meteors from the sky: one giant impact ahead, four smaller ones around it, and burning ground.",
      areas: [{ r: 50, ahead: 56, dmg: 95, kb: 2, delayMs: 450, look: "meteor" },
        { r: 26, ahead: 56, dmg: 24, waves: 4, everyMs: 170, delayMs: 650, scatter: 50, burn: [5, 2000], look: "meteor" }],
      field: { kind: "fire", r: 46, ahead: 56, ms: 3000, tickMs: 500, dmg: 5 } },

    // Frost
    { id: "w_nova", name: "Frost Nova", type: "Attack", branch: 1, row: 0, style: "frost", cd: 3500, power: 0.63, mana: 16,
      desc: "Blast ice all around you: damage and a 1.1s slow.",
      areas: [{ r: 46, dmg: 30, slowMs: 1100, look: "nova" }] },
    { id: "w_shards", name: "Ice Shards", type: "Attack", branch: 1, row: 1, style: "frost", cd: 1200, power: 0.32, mana: 4,
      desc: "Fire five shards of ice in a fan: each one slows.",
      shots: { kind: "iceshard", n: 5, spread: 40, speed: 280, range: 150, radius: 4, dmg: 10, slowMs: 400, kb: 0.3 } },
    { id: "w_armor", name: "Frost Armor", type: "Enchant", branch: 1, row: 2, style: "frost", cd: 15000, mana: 25,
      desc: "Ice armour for 8s: take 20% less damage, and whoever hits you is chilled.",
      buff: { ms: 8000, armor: 20, thorns: { slowMs: 1200, dmg: 6 } } },
    { id: "w_mirror", name: "Mirror Ice", type: "Counter", branch: 1, row: 3, style: "frost", cd: 8000, power: 0.77, mana: 14,
      desc: "Encase yourself in a mirror of ice for 0.9s: the next hit shatters it, freezing the attacker and reflecting the damage.",
      counter: { ms: 900, reflect: 0.7, effects: { stunMs: 700 }, area: { r: 34, dmg: 40, slowMs: 1500, look: "nova" } } },
    { id: "w_blizzard", name: "Blizzard", type: "Ultimate", branch: 1, row: 4, style: "frost", cd: 6000, power: 0.39, mana: 21, chargeMs: 300,
      desc: "Summon a blizzard ahead for 5s: ice rains down, hurting and slowing everyone inside.",
      field: { kind: "blizzard", r: 70, ahead: 56, ms: 5000, tickMs: 500, dmg: 11, slowMs: 900 } },
    { id: "w_frozenorb", name: "Frozen Orb", type: "Attack", branch: 1, row: 4, style: "frost", cd: 1000, power: 0.89, mana: 27,
      desc: "Launch an orb of frozen magic that flies straight and very far through enemies. As it goes it keeps spitting ice shards all around it in a turning spiral, and at the end it blows up in a big frost blast. A very short cooldown: cast it again and again while your mana lasts.",
      shots: { kind: "frozenorb", speed: 200, range: 450, radius: 7, size: 1.6, dmg: 8, pierce: 99, slowMs: 500, kb: 0.2, explode: 56,
        pulse: { every: 40, turn: 25, shards: { kind: "iceshard", n: 4, speed: 230, range: 80, radius: 4, dmg: 3, slowMs: 400, kb: 0.2 } } } },

    // Storm / arcane
    { id: "w_missiles", name: "Arcane Missiles", type: "Attack", branch: 2, row: 0, style: "arcane", cd: 1000, power: 0.37, mana: 6,
      desc: "Three arcane missiles shoot out in a tight spread.",
      shots: { kind: "arcane", n: 3, spread: 14, speed: 300, range: 170, radius: 4, dmg: 11, kb: 0.4 } },
    { id: "w_blink", name: "Blink", type: "Movement", branch: 2, row: 1, style: "arcane", cd: 4000, cost: 20, mana: 8,
      desc: "Teleport ahead. The rift you leave behind explodes.",
      areas: [{ r: 30, dmg: 40, kb: 1, look: "burst", atStart: true }], move: { kind: "blink", dist: 72, invulnMs: 200 } },
    { id: "w_static", name: "Static Field", type: "Aura", branch: 2, row: 2, style: "lightning", cd: 14000, power: 0.92, mana: 28,
      desc: "Crackle with lightning for 8s: every 0.6s a bolt strikes an enemy near you.",
      field: { kind: "static", r: 62, ms: 8000, tickMs: 600, follow: true, zap: { n: 1, dmg: 11, stunMs: 150 } } },
    { id: "w_flow", name: "Mana Flow", type: "Passive", branch: 2, row: 3, style: "arcane", passive: { effect: "mana", perRank: 20 },
      desc: "Magic flows freely: your mana refills faster." },
    { id: "w_storm", name: "Thunderstorm", type: "Ultimate", branch: 2, row: 4, style: "lightning", cd: 8000, power: 0.53, mana: 29, chargeMs: 300,
      desc: "Storm clouds gather over you, then lightning hammers the area for 3s, stunning whatever it hits.",
      field: { kind: "storm", r: 96, ms: 3000, tickMs: 300, zap: { n: 2, dmg: 18, stunMs: 300 } } },
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
    // Blood: blood magic (Magic)
    { id: "v_bolt", name: "Blood Bolt", type: "Attack", branch: 0, row: 0, style: "blood", cd: 2000, mana: 8, blood: 3,
      desc: "Hurl a bolt of your own blood. It bursts in the target, and you drink back 20% of the damage.",
      shots: { kind: "bloodbolt", speed: 260, range: 160, radius: 5, dmg: 30, drain: 20, kb: 0.6 } },
    { id: "v_boil", name: "Boil Blood", type: "Attack", branch: 0, row: 1, style: "blood", cd: 6000, mana: 16, blood: 4,
      desc: "Make the blood of everyone at the spot boil: they are hurt and bleed for 3s.",
      areas: [{ r: 30, ahead: 44, dmg: 22, burn: [8, 3000], kb: 0.4, look: "burst" }] },
    { id: "v_pact", name: "Blood Pact", type: "Passive", branch: 0, row: 2, style: "blood", passive: { effect: "skill", perRank: 7 },
      desc: "An old oath sealed in blood: all your skills hit harder." },
    { id: "v_exsang", name: "Exsanguinate", type: "Buildup", branch: 0, row: 3, style: "blood", cd: 12000, mana: 20, consume: true,
      desc: "Spend your Blood: tear the blood out of everyone around you, pull them in and drink a quarter of it. Each Blood stack adds 25%.",
      areas: [{ r: 50, dmg: 32, drain: 25, pull: 8, kb: 0, look: "nova" }] },
    { id: "v_tide", name: "Crimson Tide", type: "Ultimate", branch: 0, row: 4, style: "blood", cd: 20000, mana: 35, blood: 8, chargeMs: 400,
      desc: "Open your veins: a wave of blood spikes rolls out ahead, slowing everything it hits and feeding you 10% of the damage.",
      areas: [{ r: 24, ahead: 22, dmg: 38, drain: 10, slowMs: 700, kb: 1.2, waves: 6, everyMs: 100, line: 22, look: "spikes" }] },

    // Night: mist, bats and dread (Mana)
    { id: "v_mist", name: "Mist Form", type: "Movement", branch: 1, row: 0, style: "shadow", cd: 3500, cost: 20,
      desc: "Dissolve into mist and drift ahead, untouchable for a moment. The mist you leave behind chills whoever stands in it.",
      move: { kind: "blink", dist: 64, invulnMs: 400 }, areas: [{ r: 24, dmg: 10, slowMs: 900, atStart: true, look: "smoke" }] },
    { id: "v_bats", name: "Bat Swarm", type: "Attack", branch: 1, row: 1, style: "shadow", cd: 4000, mana: 14,
      desc: "Five bats burst from your cloak and bite whatever they reach, bringing a little blood back to you.",
      shots: { kind: "bat", n: 5, spread: 50, speed: 210, range: 140, radius: 4, dmg: 16, drain: 10, kb: 0.2 } },
    { id: "v_gaze", name: "Mesmerize", type: "War cry", branch: 1, row: 2, style: "shadow", cd: 14000, mana: 15,
      desc: "Fix everyone around you with a red stare that drinks from them: monsters flee in dread, heroes falter, and all of them are weakened for 3s.",
      cry: { r: 64, dmg: 18, drain: 15, fearMs: 1600, weakMs: 3000, look: "nova" } },
    { id: "v_cloak", name: "Cloak of Night", type: "Aura", branch: 1, row: 3, style: "shadow", cd: 18000, mana: 25,
      desc: "Wrap yourself in living darkness for 8s: it gnaws at enemies close to you, slows them and feeds you; you take 10% less damage.",
      field: { kind: "nightcloak", r: 44, ms: 8000, tickMs: 600, follow: true, dmg: 13, drain: 20, slowMs: 500 }, buff: { ms: 8000, armor: 10 } },
    { id: "v_nightfall", name: "Nightfall", type: "Ultimate", branch: 1, row: 4, style: "shadow", cd: 24000, mana: 40, chargeMs: 500,
      desc: "Call down a starless night for 5s: the darkness saps every enemy inside and feeds you, and you hunt faster, healing on every hit.",
      field: { kind: "nightfall", r: 72, ms: 5000, tickMs: 500, dmg: 14, drain: 15, weakMs: 800, slowMs: 600 }, buff: { ms: 5000, lifesteal: 8, speed: 15 } },

    // Fang: the blade (Strength, Stamina)
    { id: "v_rend", name: "Crimson Slash", type: "Attack", branch: 2, row: 0, style: "blood", windMs: 60, cd: 4500, cost: 20,
      desc: "A quick, cruel slash: the wound bleeds, and you drink 10% of the damage.",
      areas: [{ r: 26, ahead: 12, wpn: 2.3, burn: [5, 2000], drain: 10, kb: 1.2, look: "slash" }] },
    { id: "v_thirst", name: "Thirst", type: "Enchant", branch: 2, row: 1, style: "blood", cd: 11000, cost: 15, mana: 10,
      desc: "Your blade thirsts for 7s: every hit, your skills too, makes them bleed, and you heal 8% of the damage you deal.",
      buff: { ms: 7000, lifesteal: 8, onHit: { burn: [3, 2000] } } },
    { id: "v_hunger", name: "Undying Hunger", type: "Passive", branch: 2, row: 2, style: "blood", passive: { effect: "lifesteal", perRank: 2 },
      desc: "The hunger never sleeps: heal part of all the damage you deal." },
    { id: "v_pounce", name: "Night Pounce", type: "Attack", branch: 2, row: 3, style: "shadow", windMs: 70, cd: 10000, cost: 30,
      desc: "Pounce on your prey and sink your teeth in: a heavy blow that stuns, and you drink 15% of it.",
      move: { kind: "dash", dist: 56, invulnMs: 200 }, areas: [{ r: 22, ahead: 8, wpn: 2.2, stunMs: 350, drain: 15, kb: 1, look: "slash" }] },
    { id: "v_frenzy", name: "Blood Frenzy", type: "Ultimate", branch: 2, row: 4, style: "blood", windMs: 80, cd: 18000, cost: 40,
      desc: "Lose yourself to the hunger: four blood-red slashes all around you, then 4.5s of frenzy: faster hits that heal you, and nothing stops you.",
      areas: [{ r: 40, wpn: 0.6, drain: 10, kb: 0.3, waves: 4, everyMs: 140, look: "slash" }], buff: { ms: 4500, atkspd: 20, lifesteal: 6, immune: true } },
  ],

  // ---------------------------------------------------------------- SUMMONER
  // Murat 2026-11-07: golems (shared/summons.ts) do the fighting; the Summoner calls, guards and arms them.
  // Rows unlock at levels 1, 3, 5, 8 and 10: Golem (Lv 1), Vital Link (3), Conjured Blade (5), Conjured Armour (8), Colossus (10).
  summoner: [
    // Earth: the golems' toughness
    { id: "su_golem", name: "Elemental Golem", type: "Summon", branch: 0, row: 0, style: "earth", cd: 8000, mana: 25, target: "self",
      desc: "Call a golem of your current element (Attune to change it). Up to 2 fight for you; a third sends the oldest back. Ranks: tougher, harder-hitting golems.",
      summon: true },
    { id: "su_link", name: "Vital Link", type: "Passive", branch: 0, row: 1, style: "earth", passive: { effect: "summonHp", perRank: 12 },
      desc: "Your life force flows into your golems: more life, and they mend 1% of it per second per rank while close to you." },
    { id: "su_stonehide", name: "Stone Hide", type: "Passive", branch: 0, row: 2, style: "earth", passive: { effect: "armor", perRank: 3 },
      desc: "Your skin hardens like your golems': take less damage." },
    { id: "su_armour", name: "Conjured Armour", type: "Enchant", branch: 0, row: 3, style: "earth", cd: 14000, mana: 20, target: "self",
      desc: "Conjure armour of living stone around you for 10s: you take 40% less damage, mend 2% of your life a second and shrug off stuns and knockback.",
      buff: { ms: 10000, armor: 40, regen: 2, immune: true } },
    { id: "su_colossus", name: "Colossus", type: "Ultimate", branch: 0, row: 4, style: "earth", cd: 45000, mana: 50, chargeMs: 600, target: "self",
      desc: "Your golems fuse into one Colossus of your current element for 30s: far tougher, slams everything around it. With no golem out, it rises alone.",
      colossus: { ms: 30_000 } },

    // Flux: speed and cooldowns
    { id: "su_step", name: "Rift Step", type: "Movement", branch: 1, row: 0, style: "arcane", cd: 5000, cost: 20,
      desc: "Step through a rift and come out ahead of you, untouchable for a moment.",
      move: { kind: "blink", dist: 60, invulnMs: 300 } },
    { id: "su_quick", name: "Quick Binding", type: "Passive", branch: 1, row: 1, style: "arcane", passive: { effect: "cdr", perRank: 4 },
      desc: "Practised words: every skill comes back sooner." },
    { id: "su_flow", name: "Essence Flow", type: "Passive", branch: 1, row: 2, style: "arcane", passive: { effect: "mana", perRank: 8 },
      desc: "Mana wells up faster and runs deeper." },
    { id: "su_swift", name: "Wind of the Rift", type: "Passive", branch: 1, row: 3, style: "wind", passive: { effect: "speed", perRank: 4 },
      desc: "You move faster, and your golems keep up." },
    { id: "su_rift", name: "Elemental Rift", type: "Ultimate", branch: 1, row: 4, style: "arcane", cd: 24000, mana: 40, chargeMs: 400,
      desc: "Tear open a rift at the spot for 5s: it drags enemies in and storms them with every element.",
      field: { kind: "storm", r: 60, ms: 5000, tickMs: 500, dmg: 14, pull: 6, slowMs: 500 } },

    // Ruin: elemental damage
    { id: "su_mote", name: "Elemental Mote", type: "Attack", branch: 2, row: 0, style: "lightning", cd: 2500, mana: 10,
      desc: "Hurl a mote of raw element: it bursts on the target and arcs to one more enemy close by.",
      shots: { kind: "lightning", speed: 300, range: 160, radius: 5, dmg: 28, chain: 1, kb: 0.4 } },
    { id: "su_ruin", name: "Ruin", type: "Passive", branch: 2, row: 1, style: "fire", passive: { effect: "summonDmg", perRank: 10 },
      desc: "Your golems hit harder." },
    { id: "su_blade", name: "Conjured Blade", type: "Enchant", branch: 2, row: 2, style: "arcane", cd: 14000, mana: 20, target: "self",
      desc: "Conjure a blade of pure element for 10s: you deal 20% more damage, every hit strikes a second time with the spectral edge, and you heal 12% of all the damage you deal.",
      buff: { ms: 10000, dmg: 20, lifesteal: 12, onHit: { wpn: 0.3 } } },
    { id: "su_mastery", name: "Elemental Mastery", type: "Passive", branch: 2, row: 3, style: "arcane", passive: { effect: "skill", perRank: 6 },
      desc: "All your skills hit harder." },
    { id: "su_cataclysm", name: "Cataclysm", type: "Ultimate", branch: 2, row: 4, style: "fire", cd: 26000, mana: 45, chargeMs: 500,
      desc: "Call down fire, ice and lightning on the spot in turn: three bursts that burn, slow and stun.",
      areas: [
        { r: 44, ahead: 50, dmg: 34, burn: [8, 2500], kb: 0.8, look: "meteor" },
        { r: 44, ahead: 50, dmg: 26, slowMs: 1200, delayMs: 400, look: "pillar" },
        { r: 44, ahead: 50, dmg: 26, stunMs: 600, delayMs: 800, look: "bolt" },
      ] },
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
  // Summoner (Murat 2026-11-07): Golem Lv 1, Vital Link 3, Conjured Blade 5, Conjured Armour 8, Colossus 10.
  // The golems and the Colossus grow with Magic (their life and damage take the skill's power).
  su_golem: [1, undefined, ["mag", 2]], su_link: [3, "su_golem"], su_stonehide: [6, "su_link"], su_armour: [8, "su_link"],
  su_colossus: [10, "su_armour", ["mag", 2.5]],
  su_step: [1], su_quick: [4, "su_step"], su_flow: [7, "su_quick"], su_swift: [12, "su_quick"], su_rift: [20, "su_flow", ["mag", 2.5]],
  su_mote: [2, undefined, ["mag", 2]], su_ruin: [4, "su_mote"], su_blade: [5, "su_mote"], su_mastery: [13, "su_blade"],
  su_cataclysm: [22, "su_mastery", ["mag", 2.5]],
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
  // Wizard (Diablo 2 style, Murat 2026-11-05): skills unlock in tiers at levels 1, 6, 12, 18 and 24, Frozen Orb at 30;
  // some need a second skill (REQUIRES) and spells grow with the ranks of their neighbours (SYNERGY).
  // Fire: the wall forks into the Inferno Orb and the Meteor Shower, which needs both
  w_wave: [1, undefined, ["mag", 2]], w_firewall: [6, "w_wave", ["mag", 2]], w_pyro: [12, "w_wave"],
  w_orb: [18, "w_firewall", ["mag", 2.5]], w_meteor: [24, "w_firewall", ["mag", 2.5]],
  // Frost: Frozen Orb, the last skill of the wizard, forks off Mirror Ice next to the Blizzard and needs it
  w_nova: [1, undefined, ["mag", 2]], w_shards: [6, "w_nova", ["dex", 2]], w_armor: [12, "w_shards"], w_mirror: [18, "w_shards"],
  w_blizzard: [24, "w_mirror", ["mag", 2.5]], w_frozenorb: [30, "w_mirror", ["mag", 2]],
  // Storm: one long limb, Mana Flow off the root
  w_missiles: [1, undefined, ["dex", 2]], w_blink: [6, "w_missiles", ["mag", 2]], w_static: [12, "w_blink", ["mag", 2]],
  w_flow: [18, "w_missiles"], w_storm: [24, "w_static", ["mag", 2.5]],
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
  // Vampire · Blood: the bolt forks into Boil Blood, ending in Exsanguinate (dead end), and the Pact on to the Crimson Tide
  v_bolt: [1, undefined, ["mag", 2]], v_boil: [4, "v_bolt", ["mag", 2]], v_exsang: [11, "v_boil", ["mag", 2.5]],
  v_pact: [7, "v_bolt"], v_tide: [22, "v_pact", ["mag", 2.5]],
  // Vampire · Night: Mesmerize hangs off the mist; the bats grow into the cloak and Nightfall
  v_mist: [1], v_gaze: [6, "v_mist"], v_bats: [4, "v_mist", ["mag", 2]], v_cloak: [10, "v_bats", ["mag", 2]],
  v_nightfall: [21, "v_cloak", ["mag", 2.5]],
  // Vampire · Fang: Thirst leads to the Hunger (dead end); the slash grows into the Pounce and the Frenzy
  v_rend: [1, undefined, ["str", 2]], v_thirst: [3, "v_rend"], v_hunger: [8, "v_thirst"], v_pounce: [9, "v_rend", ["str", 2]],
  v_frenzy: [20, "v_pounce", ["str", 2.5]],
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
  v_rend: "melee", v_pounce: "melee", v_frenzy: "melee", v_thirst: "melee",
};
/** Second prerequisites (Diablo 2 style): skill id -> other skills that must be learned first. */
const REQUIRES: Record<string, string[]> = {
  w_meteor: ["w_orb"], w_frozenorb: ["w_blizzard"], w_storm: ["w_flow"],
};
/** Synergies (Diablo 2 style): skill id -> +pct% damage per rank of each `from` skill. */
const SYNERGY: Record<string, { from: string; pct: number }[]> = {
  w_wave: [{ from: "w_firewall", pct: 4 }, { from: "w_orb", pct: 4 }],
  w_firewall: [{ from: "w_wave", pct: 4 }, { from: "w_meteor", pct: 3 }],
  w_orb: [{ from: "w_wave", pct: 5 }, { from: "w_firewall", pct: 3 }],
  w_meteor: [{ from: "w_firewall", pct: 4 }, { from: "w_orb", pct: 4 }],
  w_nova: [{ from: "w_shards", pct: 4 }, { from: "w_blizzard", pct: 3 }],
  w_shards: [{ from: "w_nova", pct: 4 }, { from: "w_frozenorb", pct: 3 }],
  w_blizzard: [{ from: "w_shards", pct: 4 }, { from: "w_nova", pct: 4 }],
  w_frozenorb: [{ from: "w_shards", pct: 4 }, { from: "w_blizzard", pct: 4 }],
  w_missiles: [{ from: "w_static", pct: 4 }, { from: "w_storm", pct: 3 }],
  w_static: [{ from: "w_missiles", pct: 4 }],
  w_storm: [{ from: "w_static", pct: 4 }, { from: "w_missiles", pct: 4 }],
};
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

/** Synergy multiplier of a skill: 1 + its SYNERGY bonuses for the ranks the hero has in those skills. */
export function synergyPower(s: SkillDef, r: Ranks | undefined): number {
  let pct = 0;
  for (const y of s.synergy ?? []) pct += y.pct * Math.min(MAX_RANK, rankOf(r, y.from));
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
  // The Summoner turns the element their next golem is called in (Murat 2026-11-07: one key cycles the elements)
  summoner: [
    { id: "su_attune", name: "Attune", type: "Summon", branch: 0, row: 0, req: 1, style: "arcane", cd: 250, cantrip: true, target: "self",
      desc: "Turn to the next element: fire, frost, venom, storm. Your next golem (and the Colossus) is called in it.",
      attune: true },
  ],
  // The vampire's one basic spell: a flick of blood up close that drinks a little back (Murat 2026-11-05: warrior caster)
  vampire: [
    { id: "v_leech", name: "Leech", type: "Attack", branch: 0, row: 0, req: 1, style: "blood", cd: 450, mana: 4, cantrip: true,
      desc: "Flick a drop of blood at a foe close by and drink a little of theirs back. Costs little mana: cast it again and again.",
      shots: { kind: "bloodbolt", speed: 300, range: 95, radius: 4, size: 0.6, dmg: 12, drain: 15, kb: 0.2 } },
  ],
  wizard: [
    { id: "w_spark", name: "Spark", type: "Attack", branch: 2, row: 0, req: 1, style: "lightning", cd: 300, mana: 3, cantrip: true,
      desc: "A crackling spark at close range. Costs little mana: cast it again and again.",
      shots: { kind: "lightning", speed: 360, range: 85, radius: 5, dmg: 13, kb: 0.3 } },
    { id: "w_firedart", name: "Fire Dart", type: "Attack", branch: 0, row: 0, req: 1, style: "fire", cd: 450, mana: 4, cantrip: true,
      desc: "A quick dart of flame that sets the target smouldering for a moment.",
      shots: { kind: "flamewave", speed: 300, range: 110, radius: 5, size: 0.55, dmg: 11, burn: [3, 1500], kb: 0.3 } },
    { id: "w_frostbolt", name: "Frost Bolt", type: "Attack", branch: 1, row: 0, req: 1, style: "frost", cd: 500, mana: 5, cantrip: true,
      desc: "A shard of ice that chills: the target slows down for a moment.",
      shots: { kind: "iceshard", speed: 300, range: 120, radius: 4, dmg: 12, slowMs: 600, kb: 0.2 } },
  ],
};

export const SKILLS = S;
const BY_ID = new Map<string, SkillDef>();
for (const list of [...Object.values(S), ...Object.values(CANTRIPS)]) for (const s of list) BY_ID.set(s.id, s);
export const skillById = (id: string) => BY_ID.get(id);
export const skillOf = (cls: ClassKind, id: string) => { const s = BY_ID.get(id); return s && (S[cls].includes(s) || CANTRIPS[cls]?.includes(s)) ? s : undefined; };
export const isActive = (s: SkillDef) => !s.passive;
export const maxRank = (_s: SkillDef) => MAX_RANK;

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
  return S[cls].reduce((s, n) => s + Math.min(MAX_RANK, rankOf(r, n.id)), 0);
}

export type LockReason = "" | "max" | "level" | "above" | "requires" | "points";
/** Why skill `id` can't take one more rank right now ("" = it can). A skill needs its parent skill learned. */
export function lockReason(cls: ClassKind, level: number, r: Ranks, id: string): LockReason {
  const n = skillOf(cls, id);
  if (!n || n.cantrip || rankOf(r, id) >= MAX_RANK) return "max";
  if (level < n.req) return "level";
  if (n.parent && rankOf(r, n.parent) < 1) return "above";
  if (n.requires?.some((q) => rankOf(r, q) < 1)) return "requires";
  if (spentPoints(cls, r) >= talentPoints(level)) return "points";
  return "";
}
export const canLearn = (cls: ClassKind, level: number, r: Ranks, id: string) => lockReason(cls, level, r, id) === "";

/** Total passive bonus for an effect, in percent (e.g. 12 = +12%). */
export function talentBonus(cls: ClassKind, r: Ranks, effect: TalentEffect): number {
  let v = 0;
  for (const s of S[cls]) if (s.passive?.effect === effect) v += s.passive.perRank * Math.min(MAX_RANK, rankOf(r, s.id));
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
  summonHp: (v) => `+${v}% golem life`,
  summonDmg: (v) => `+${v}% golem damage`,
};

/** Drop unknown skills (old saves) and anything above what the level allows. */
export function cleanRanks(cls: ClassKind, level: number, saved: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of S[cls]) {
    const v = saved[s.id];
    if (typeof v === "number" && v > 0) out[s.id] = Math.min(MAX_RANK, Math.floor(v));
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
