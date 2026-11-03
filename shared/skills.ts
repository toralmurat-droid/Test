import { ClassKind } from "./classes";
import type { StatKind } from "./powers";

/**
 * Skill trees (press T). Every hero has 3 branches of 5 skills. Each branch is a small, uneven tree (TREE below):
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

export type TalentEffect = "dmg" | "skill" | "crit" | "lifesteal" | "hp" | "armor" | "speed" | "cdr" | "regen";

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

export type SkillType = "Attack" | "Aura" | "War cry" | "Enchant" | "Buildup" | "Counter" | "Trap" | "Movement" | "Passive" | "Ultimate";

export interface SkillDef {
  id: string; name: string; type: SkillType; desc: string;
  branch: 0 | 1 | 2; row: 0 | 1 | 2 | 3 | 4;
  req: number; // hero level needed (filled from TREE)
  parent?: string; // skill that must be learned first (none = root of its branch)
  scale?: { stat: StatKind; per: number }; // +per% skill power for every point of `stat` above the class's base
  style: FxStyle;
  passive?: { effect: TalentEffect; perRank: number };
  cd?: number; cost?: number; // ms, energy
  chargeMs?: number; // buildup: roots the hero while charging (a stun cancels it)
  consume?: boolean; // spends all stacks; buff.perStack / STACK_POWER per stack
  move?: MoveDef; areas?: AreaDef[]; shots?: ShotDef; field?: FieldDef; buff?: BuffDef; counter?: CounterDef;
  cry?: AreaDef; // war cry: hits everyone around (usually no damage, only effects)
}

export interface BranchDef { name: string; color: string }

export const MAX_RANK = 3;
export const RANK_POWER = 0.15;
export const RANK_TIME = 0.1;
export const MAX_STACKS = 5;
export const STACK_POWER = 0.25; // +25% damage per stack spent, unless the skill says otherwise
export const STACK_DECAY_MS = 6000; // stacks fade after this long without landing a hit
export const MARK_TAKEN = 0.25;
export const WEAK_DEALT = 0.25;
export const STACK_NAME: Record<ClassKind, string> = { knight: "Valor", ninja: "Ki", wizard: "Arcane", archer: "Focus", barbarian: "Fury" };

export const BRANCHES: Record<ClassKind, [BranchDef, BranchDef, BranchDef]> = {
  knight: [{ name: "Valor", color: "#e63946" }, { name: "Bulwark", color: "#4cc9f0" }, { name: "Crusade", color: "#ffd166" }],
  ninja: [{ name: "Shadow", color: "#9d4edd" }, { name: "Steel", color: "#c0c8d8" }, { name: "Spirit", color: "#f77f00" }],
  wizard: [{ name: "Fire", color: "#f77f00" }, { name: "Frost", color: "#4cc9f0" }, { name: "Storm", color: "#b388ff" }],
  archer: [{ name: "Marksman", color: "#e63946" }, { name: "Trapper", color: "#a68a64" }, { name: "Nature", color: "#7cfc00" }],
  barbarian: [{ name: "Fury", color: "#e63946" }, { name: "Warcry", color: "#ffd166" }, { name: "Earth", color: "#a68a64" }],
};

const S: Record<ClassKind, SkillDef[]> = <Record<ClassKind, SkillDef[]>><unknown>{
  // ---------------------------------------------------------------- KNIGHT
  knight: [
    // Valor: sword offense
    { id: "k_lunge", name: "Lunging Strike", type: "Attack", branch: 0, row: 0, style: "steel", cd: 5000, cost: 20,
      desc: "Lunge forward and run your blade through whoever stands at the end.",
      move: { kind: "dash", dist: 40 }, areas: [{ r: 22, ahead: 10, wpn: 1.8, kb: 1.5, look: "slash" }] },
    { id: "k_whirl", name: "Whirling Slash", type: "Attack", branch: 0, row: 1, style: "steel", cd: 7000, cost: 25,
      desc: "Spin with your sword out: hits everything around you twice.",
      areas: [{ r: 34, wpn: 1.0, kb: 0.8, waves: 2, everyMs: 180, look: "slash" }] },
    { id: "k_mastery", name: "Blade Mastery", type: "Passive", branch: 0, row: 2, style: "steel", passive: { effect: "dmg", perRank: 5 },
      desc: "Years of drills: more damage with everything." },
    { id: "k_rush", name: "Valor Rush", type: "Buildup", branch: 0, row: 3, style: "holy", cd: 10000, cost: 30, consume: true,
      desc: "Spend your Valor: charge through the enemy line, cutting everyone on the way. Each Valor stack adds 25%.",
      move: { kind: "dash", dist: 72, path: 1.4, invulnMs: 300 }, areas: [{ r: 30, wpn: 0.8, kb: 1.5, look: "slash" }] },
    { id: "k_judgement", name: "Judgement Blade", type: "Ultimate", branch: 0, row: 4, style: "holy", cd: 20000, cost: 50, chargeMs: 600,
      desc: "Raise your sword to the sky. A giant blade of light falls ahead of you: huge damage, stuns.",
      areas: [{ r: 48, ahead: 46, dmg: 100, stunMs: 1200, kb: 2, look: "sword" }] },

    // Bulwark: defence and counters
    { id: "k_shield", name: "Shield Wall", type: "Enchant", branch: 1, row: 0, style: "frost", cd: 6000, cost: 25,
      desc: "Raise your shield for 2s: blocks 55% of damage and all knockback.",
      buff: { ms: 2000, block: true } },
    { id: "k_riposte", name: "Riposte", type: "Counter", branch: 1, row: 1, style: "steel", cd: 7000, cost: 20,
      desc: "Stand ready for 0.8s. The next hit is parried: you strike back twice as hard and stun the attacker.",
      counter: { ms: 800, wpn: 1.6, effects: { stunMs: 700, kb: 1.5 } } },
    { id: "k_ironskin", name: "Iron Skin", type: "Passive", branch: 1, row: 2, style: "steel", passive: { effect: "armor", perRank: 4 },
      desc: "Hardened by battle: take less damage." },
    { id: "k_taunt", name: "Challenging Roar", type: "War cry", branch: 1, row: 3, style: "blood", cd: 14000, cost: 25,
      desc: "Roar a challenge: enemies around are marked (take 25% more damage) and slowed; you take 25% less for 5s.",
      cry: { r: 72, markMs: 5000, slowMs: 1500, look: "nova" }, buff: { ms: 5000, armor: 20 } },
    { id: "k_quake", name: "Earthquake", type: "Ultimate", branch: 1, row: 4, style: "earth", cd: 18000, cost: 50,
      desc: "Slam the ground: the earth splits around you, stunning everything, then two aftershocks roll out.",
      areas: [{ r: 56, dmg: 28, stunMs: 1100, kb: 0.5, look: "slam" }, { r: 76, dmg: 12, delayMs: 450, waves: 2, everyMs: 400, slowMs: 800, look: "spikes" }] },

    // Crusade: holy auras, enchantments and blessings
    { id: "k_holyblade", name: "Holy Blade", type: "Enchant", branch: 2, row: 0, style: "holy", cd: 12000, cost: 20,
      desc: "Bless your sword for 7s: every hit burns with holy fire.",
      buff: { ms: 7000, onHit: { burn: [5, 2000] } } },
    { id: "k_consecrate", name: "Consecration", type: "Aura", branch: 2, row: 1, style: "holy", cd: 14000, cost: 30,
      desc: "Sanctify the ground under you for 5s: it burns enemies and heals you while you stand on it.",
      field: { kind: "consecrate", r: 42, ms: 5000, tickMs: 500, dmg: 8, heal: 1.2 } },
    { id: "k_rally", name: "Rally", type: "War cry", branch: 2, row: 2, style: "holy", cd: 16000, cost: 25,
      desc: "Lift your banner: heal 12% HP, +15% damage and speed for 6s, and nearby enemies are weakened.",
      buff: { ms: 6000, dmg: 15, speed: 15, heal: 12 }, cry: { r: 64, weakMs: 4000, look: "nova" } },
    { id: "k_aura", name: "Sacred Aura", type: "Aura", branch: 2, row: 3, style: "holy", cd: 20000, cost: 35,
      desc: "A halo of light surrounds you for 10s: it sears enemies close to you and slowly heals you.",
      field: { kind: "sacred", r: 46, ms: 10000, tickMs: 500, follow: true, dmg: 4 }, buff: { ms: 10000, regen: 1.2 } },
    { id: "k_wrath", name: "Heaven's Wrath", type: "Ultimate", branch: 2, row: 4, style: "holy", cd: 22000, cost: 50, chargeMs: 500,
      desc: "Call down the heavens: six pillars of light crash around you, each one stunning.",
      areas: [{ r: 26, dmg: 34, stunMs: 400, waves: 6, everyMs: 160, scatter: 64, delayMs: 100, look: "pillar" }] },
  ],

  // ---------------------------------------------------------------- NINJA
  ninja: [
    // Shadow: stealth and teleports
    { id: "n_step", name: "Shadow Step", type: "Movement", branch: 0, row: 0, style: "shadow", cd: 2500, cost: 20,
      desc: "Melt into shadow and reappear ahead, untouchable for a moment.",
      move: { kind: "blink", dist: 56, invulnMs: 250 } },
    { id: "n_smoke", name: "Smoke Bomb", type: "Aura", branch: 0, row: 1, style: "shadow", cd: 12000, cost: 25,
      desc: "Throw down a cloud of smoke for 4s: enemies inside are blinded (weakened) and slowed.",
      field: { kind: "smoke", r: 40, ms: 4000, tickMs: 400, weakMs: 600, slowMs: 600 } },
    { id: "n_swift", name: "Swift Feet", type: "Passive", branch: 0, row: 2, style: "wind", passive: { effect: "speed", perRank: 4 },
      desc: "Light as a cat: move faster." },
    { id: "n_assassinate", name: "Assassinate", type: "Buildup", branch: 0, row: 3, style: "shadow", cd: 10000, cost: 30, consume: true,
      desc: "Spend your Ki: vanish and strike the nearest enemy from behind. Each Ki stack adds 25%.",
      move: { kind: "behind", dist: 110, invulnMs: 200 }, areas: [{ r: 20, wpn: 2.4, kb: 1, look: "slash" }] },
    { id: "n_cuts", name: "Thousand Cuts", type: "Ultimate", branch: 0, row: 4, style: "shadow", cd: 18000, cost: 50,
      desc: "Become a shadow: blink from enemy to enemy six times, slashing each one. Untouchable meanwhile.",
      move: { kind: "multi", dist: 96, hits: 6, everyMs: 150, wpn: 0.6, invulnMs: 450 } },

    // Steel: blades and parries
    { id: "n_shuriken", name: "Shuriken Fan", type: "Attack", branch: 1, row: 0, style: "steel", cd: 4000, cost: 20,
      desc: "Throw three spinning shuriken in a fan.",
      shots: { kind: "shuriken", n: 3, spread: 26, speed: 260, range: 150, radius: 4, wpn: 1.0, kb: 0.4 } },
    { id: "n_flurry", name: "Blade Flurry", type: "Enchant", branch: 1, row: 1, style: "steel", cd: 12000, cost: 25,
      desc: "Your blades blur for 5s: 40% faster attacks that make enemies bleed.",
      buff: { ms: 5000, atkspd: 40, onHit: { burn: [3, 2000] } } },
    { id: "n_parry", name: "Shadow Parry", type: "Counter", branch: 1, row: 2, style: "shadow", cd: 8000, cost: 20,
      desc: "Stand ready for 0.7s. When struck, you vanish, appear behind the attacker and cut them deep.",
      counter: { ms: 700, blink: "behind", wpn: 3.4, effects: { kb: 1 } } },
    { id: "n_vital", name: "Vital Points", type: "Passive", branch: 1, row: 3, style: "blood", passive: { effect: "crit", perRank: 5 },
      desc: "You know where it hurts: more critical hits." },
    { id: "n_storm", name: "Blade Storm", type: "Ultimate", branch: 1, row: 4, style: "steel", cd: 15000, cost: 50,
      desc: "Spin into a storm of steel: five hits on everything around you, pulling enemies in.",
      areas: [{ r: 44, wpn: 1.1, kb: 0.2, pull: 6, waves: 5, everyMs: 150, look: "slash" }] },

    // Spirit: elemental jutsu
    { id: "n_flame", name: "Flame Jutsu", type: "Attack", branch: 2, row: 0, style: "fire", cd: 5000, cost: 20,
      desc: "Breathe a gout of fire ahead: damage and burning.",
      areas: [{ r: 26, ahead: 26, wpn: 1.8, burn: [4, 3000], kb: 0.6, look: "flame" }] },
    { id: "n_poison", name: "Poison Blade", type: "Enchant", branch: 2, row: 1, style: "poison", cd: 14000, cost: 20,
      desc: "Coat your blades for 8s: every hit poisons.",
      buff: { ms: 8000, onHit: { burn: [8, 3000] } } },
    { id: "n_caltrops", name: "Caltrops", type: "Trap", branch: 2, row: 2, style: "steel", cd: 10000, cost: 20,
      desc: "Scatter spikes ahead for 6s: enemies walking on them are hurt and slowed.",
      field: { kind: "caltrops", r: 30, ahead: 36, ms: 6000, tickMs: 400, dmg: 5, slowMs: 600 } },
    { id: "n_lightning", name: "Lightning Jutsu", type: "Attack", branch: 2, row: 3, style: "lightning", cd: 9000, cost: 30,
      desc: "Hurl a lightning bolt that jumps to 3 more enemies, stunning each.",
      shots: { kind: "lightning", speed: 420, range: 170, radius: 5, wpn: 3.2, stunMs: 350, chain: 3 } },
    { id: "n_dragon", name: "Fire Dragon", type: "Ultimate", branch: 2, row: 4, style: "fire", cd: 18000, cost: 50, chargeMs: 450,
      desc: "Gather your chakra and release a fire dragon: it tears through everyone in its path and explodes.",
      shots: { kind: "dragon", speed: 200, range: 190, radius: 10, size: 2, wpn: 5, burn: [6, 3000], pierce: 99, explode: 44 } },
  ],

  // ---------------------------------------------------------------- WIZARD
  wizard: [
    // Fire
    { id: "w_wave", name: "Flame Wave", type: "Attack", branch: 0, row: 0, style: "fire", cd: 5000, cost: 20,
      desc: "Send a rolling wave of fire forward: it burns everything it passes.",
      shots: { kind: "flamewave", speed: 160, range: 130, radius: 10, size: 1.5, dmg: 30, burn: [4, 2000], pierce: 99, kb: 0.4 } },
    { id: "w_pyro", name: "Pyromancy", type: "Passive", branch: 0, row: 1, style: "fire", passive: { effect: "skill", perRank: 7 },
      desc: "Fire answers you: more skill damage." },
    { id: "w_firewall", name: "Fire Wall", type: "Aura", branch: 0, row: 2, style: "fire", cd: 12000, cost: 30,
      desc: "Raise a wall of flame ahead for 4s: enemies inside burn.",
      field: { kind: "fire", r: 34, ahead: 44, ms: 4000, tickMs: 400, dmg: 10 } },
    { id: "w_orb", name: "Inferno Orb", type: "Buildup", branch: 0, row: 3, style: "fire", cd: 11000, cost: 35, chargeMs: 600, consume: true,
      desc: "Gather fire into a huge orb, then hurl it: it explodes in a big blast. Arcane stacks make it stronger.",
      shots: { kind: "inferno", speed: 150, range: 160, radius: 9, size: 2.2, dmg: 100, explode: 50, burn: [5, 2000], kb: 2 } },
    { id: "w_meteor", name: "Meteor Shower", type: "Ultimate", branch: 0, row: 4, style: "fire", cd: 20000, cost: 50, chargeMs: 400,
      desc: "Pull meteors from the sky: one giant impact ahead, four smaller ones around it, and burning ground.",
      areas: [{ r: 50, ahead: 56, dmg: 80, kb: 2, delayMs: 450, look: "meteor" },
        { r: 26, ahead: 56, dmg: 24, waves: 4, everyMs: 170, delayMs: 650, scatter: 50, burn: [5, 2000], look: "meteor" }],
      field: { kind: "fire", r: 46, ahead: 56, ms: 3000, tickMs: 500, dmg: 5 } },

    // Frost
    { id: "w_nova", name: "Frost Nova", type: "Attack", branch: 1, row: 0, style: "frost", cd: 7000, cost: 25,
      desc: "Blast ice all around you: damage and a 2.5s slow.",
      areas: [{ r: 46, dmg: 30, slowMs: 2500, look: "nova" }] },
    { id: "w_shards", name: "Ice Shards", type: "Attack", branch: 1, row: 1, style: "frost", cd: 5000, cost: 20,
      desc: "Fire five shards of ice in a fan: each one slows.",
      shots: { kind: "iceshard", n: 5, spread: 40, speed: 280, range: 150, radius: 4, dmg: 11, slowMs: 1200, kb: 0.3 } },
    { id: "w_armor", name: "Frost Armor", type: "Enchant", branch: 1, row: 2, style: "frost", cd: 16000, cost: 25,
      desc: "Ice armour for 8s: take 25% less damage, and whoever hits you is chilled.",
      buff: { ms: 8000, armor: 25, thorns: { slowMs: 1200, dmg: 6 } } },
    { id: "w_mirror", name: "Mirror Ice", type: "Counter", branch: 1, row: 3, style: "frost", cd: 10000, cost: 25,
      desc: "Encase yourself in a mirror of ice for 0.9s: the next hit shatters it, freezing the attacker and reflecting the damage.",
      counter: { ms: 900, reflect: 1, effects: { stunMs: 1000 }, area: { r: 34, dmg: 55, slowMs: 1500, look: "nova" } } },
    { id: "w_blizzard", name: "Blizzard", type: "Ultimate", branch: 1, row: 4, style: "frost", cd: 20000, cost: 50, chargeMs: 300,
      desc: "Summon a blizzard ahead for 5s: ice rains down, hurting and slowing everyone inside.",
      field: { kind: "blizzard", r: 70, ahead: 56, ms: 5000, tickMs: 500, dmg: 11, slowMs: 900 } },

    // Storm / arcane
    { id: "w_missiles", name: "Arcane Missiles", type: "Attack", branch: 2, row: 0, style: "arcane", cd: 4000, cost: 20,
      desc: "Three arcane missiles shoot out in a tight spread.",
      shots: { kind: "arcane", n: 3, spread: 14, speed: 300, range: 170, radius: 4, dmg: 13, kb: 0.4 } },
    { id: "w_blink", name: "Blink", type: "Movement", branch: 2, row: 1, style: "arcane", cd: 6000, cost: 20,
      desc: "Teleport ahead. The rift you leave behind explodes.",
      areas: [{ r: 30, dmg: 40, kb: 1, look: "burst", atStart: true }], move: { kind: "blink", dist: 72, invulnMs: 200 } },
    { id: "w_static", name: "Static Field", type: "Aura", branch: 2, row: 2, style: "lightning", cd: 16000, cost: 30,
      desc: "Crackle with lightning for 8s: every 0.6s a bolt strikes an enemy near you.",
      field: { kind: "static", r: 62, ms: 8000, tickMs: 600, follow: true, zap: { n: 1, dmg: 9, stunMs: 150 } } },
    { id: "w_flow", name: "Mana Flow", type: "Passive", branch: 2, row: 3, style: "arcane", passive: { effect: "cdr", perRank: 5 },
      desc: "Magic flows freely: skills recharge faster." },
    { id: "w_storm", name: "Thunderstorm", type: "Ultimate", branch: 2, row: 4, style: "lightning", cd: 20000, cost: 50, chargeMs: 600,
      desc: "Storm clouds gather over you, then lightning hammers the area for 3s, stunning whatever it hits.",
      field: { kind: "storm", r: 96, ms: 3000, tickMs: 300, zap: { n: 2, dmg: 18, stunMs: 300 } } },
  ],

  // ---------------------------------------------------------------- ARCHER
  archer: [
    // Marksman
    { id: "a_volley", name: "Volley", type: "Attack", branch: 0, row: 0, style: "steel", cd: 6000, cost: 25,
      desc: "Fire three arrows side by side.",
      shots: { kind: "arrow", n: 3, lanes: 8, speed: 300, range: 175, radius: 4, wpn: 0.6, kb: 0.8 } },
    { id: "a_power", name: "Power Shot", type: "Buildup", branch: 0, row: 1, style: "wind", cd: 7000, cost: 25, chargeMs: 450,
      desc: "Draw the bow to its limit, then loose a glowing arrow that pierces everything and knocks back hard.",
      shots: { kind: "powerarrow", speed: 420, range: 240, radius: 5, size: 1.5, wpn: 2.6, pierce: 99, kb: 3 } },
    { id: "a_aim", name: "Steady Aim", type: "Passive", branch: 0, row: 2, style: "steel", passive: { effect: "dmg", perRank: 5 },
      desc: "Breathe, aim, release: more damage." },
    { id: "a_fan", name: "Fan of Arrows", type: "Buildup", branch: 0, row: 3, style: "steel", cd: 10000, cost: 30, consume: true,
      desc: "Spend your Focus: loose a wide fan of seven arrows. Each Focus stack adds 25%.",
      shots: { kind: "arrow", n: 7, spread: 70, speed: 300, range: 170, radius: 4, wpn: 0.7, kb: 0.8 } },
    { id: "a_rain", name: "Arrow Rain", type: "Ultimate", branch: 0, row: 4, style: "steel", cd: 16000, cost: 50,
      desc: "Shoot into the sky: six waves of arrows rain down ahead, slowing everyone under them.",
      areas: [{ r: 48, ahead: 76, dmg: 17, slowMs: 900, kb: 0.2, delayMs: 400, waves: 6, everyMs: 220, look: "rain" }] },

    // Trapper
    { id: "a_beartrap", name: "Bear Trap", type: "Trap", branch: 1, row: 0, style: "steel", cd: 8000, cost: 20,
      desc: "Set an iron trap at your feet (20s). The first enemy to step on it is caught: damage and a long stun.",
      field: { kind: "beartrap", r: 14, ms: 20000, tickMs: 100, trap: true, burst: { r: 16, dmg: 18, stunMs: 1400, look: "spikes" } } },
    { id: "a_reflex", name: "Hunter's Reflex", type: "Counter", branch: 1, row: 1, style: "wind", cd: 8000, cost: 20,
      desc: "Stay alert for 0.7s. If struck, you dodge the blow, vault back and fire three arrows.",
      counter: { ms: 700, blink: "back", shot: { kind: "arrow", n: 3, spread: 18, speed: 320, range: 170, radius: 4, wpn: 0.9, kb: 1 } } },
    { id: "a_explosive", name: "Explosive Trap", type: "Trap", branch: 1, row: 2, style: "fire", cd: 10000, cost: 25,
      desc: "Bury a fire trap ahead (20s). It blows up when an enemy comes close.",
      field: { kind: "firetrap", r: 18, ahead: 20, ms: 20000, tickMs: 100, trap: true, burst: { r: 44, dmg: 44, kb: 2.5, burn: [4, 2000], look: "burst" } } },
    { id: "a_net", name: "Net Shot", type: "Attack", branch: 1, row: 3, style: "nature", cd: 10000, cost: 25,
      desc: "Shoot a weighted net: it tangles the first enemy (rooted 1.6s) and slows everyone near it.",
      shots: { kind: "net", speed: 260, range: 160, radius: 6, size: 1.4, wpn: 3.3, stunMs: 1600, explode: 30, slowMs: 1500 } },
    { id: "a_sentry", name: "Hunter's Sentry", type: "Ultimate", branch: 1, row: 4, style: "nature", cd: 22000, cost: 50,
      desc: "Plant a carved sentry totem for 10s. Its glowing eye fires arrows at every enemy that comes near.",
      field: { kind: "sentry", r: 140, ms: 10000, tickMs: 450, turret: { kind: "arrow", speed: 320, range: 160, radius: 4, dmg: 13, kb: 0.4 } } },

    // Nature: enchanted arrows
    { id: "a_firearrows", name: "Fire Arrows", type: "Enchant", branch: 2, row: 0, style: "fire", cd: 12000, cost: 20,
      desc: "Light your arrowheads for 8s: every arrow sets its target on fire.",
      buff: { ms: 8000, onHit: { burn: [4, 3000] } } },
    { id: "a_frostarrow", name: "Frost Arrow", type: "Attack", branch: 2, row: 1, style: "frost", cd: 6000, cost: 20,
      desc: "An arrow of ice: it shatters on impact, slowing everyone near.",
      shots: { kind: "frostarrow", speed: 320, range: 190, radius: 4, size: 1.2, wpn: 1.9, explode: 28, slowMs: 2000, kb: 0.8 } },
    { id: "a_windwalk", name: "Wind Walk", type: "Aura", branch: 2, row: 2, style: "wind", cd: 14000, cost: 25,
      desc: "The wind carries you for 5s: 40% faster and 25% harder to hurt.",
      buff: { ms: 5000, speed: 40, armor: 25 } },
    { id: "a_feast", name: "Hunter's Feast", type: "Passive", branch: 2, row: 3, style: "nature", passive: { effect: "lifesteal", perRank: 3 },
      desc: "Every kill feeds you: heal part of the damage you deal." },
    { id: "a_phoenix", name: "Phoenix Arrow", type: "Ultimate", branch: 2, row: 4, style: "fire", cd: 20000, cost: 50, chargeMs: 500,
      desc: "Your arrow bursts into a phoenix: it burns through every enemy, explodes and leaves the ground on fire.",
      shots: { kind: "phoenix", speed: 230, range: 210, radius: 10, size: 2, wpn: 2.8, pierce: 99, explode: 48, burn: [6, 3000], kb: 1.5,
        field: { kind: "fire", r: 40, ms: 3000, tickMs: 500, dmg: 6 } } },
  ],

  // ---------------------------------------------------------------- BARBARIAN
  barbarian: [
    // Fury
    { id: "b_rage", name: "Rage", type: "Aura", branch: 0, row: 0, style: "blood", cd: 12000, cost: 25,
      desc: "Fly into a rage for 5s: +15% damage, +20% speed and +15% attack speed.",
      buff: { ms: 5000, dmg: 15, speed: 20, atkspd: 15 } },
    { id: "b_cleave", name: "Cleave", type: "Attack", branch: 0, row: 1, style: "blood", cd: 5000, cost: 20,
      desc: "A huge sweeping axe blow that hits everyone in front of you.",
      areas: [{ r: 34, ahead: 16, wpn: 1.7, kb: 2, look: "slash" }] },
    { id: "b_bloodthirst", name: "Bloodthirst", type: "Passive", branch: 0, row: 2, style: "blood", passive: { effect: "lifesteal", perRank: 4 },
      desc: "Blood feeds your fury: heal part of the damage you deal." },
    { id: "b_berserk", name: "Berserk", type: "Buildup", branch: 0, row: 3, style: "blood", cd: 16000, cost: 30, consume: true,
      desc: "Spend your Fury: go berserk for 6s. Unstoppable, 20% faster attacks, +5% damage per Fury stack, but you take 15% more.",
      buff: { ms: 6000, immune: true, atkspd: 20, armor: -15, perStack: 5 } },
    { id: "b_whirlwind", name: "Whirlwind", type: "Ultimate", branch: 0, row: 4, style: "blood", cd: 18000, cost: 50,
      desc: "Become a whirlwind of steel for 2.5s: you can move, and everything near you is cut five times a second.",
      field: { kind: "whirlwind", r: 38, ms: 2500, tickMs: 200, follow: true, wpn: 0.35, kb: 0.3 }, buff: { ms: 2500, immune: true, speed: 10 } },

    // Warcry
    { id: "b_battlecry", name: "Battle Cry", type: "War cry", branch: 1, row: 0, style: "spirit", cd: 12000, cost: 20,
      desc: "Bellow a battle cry: +15% damage for 6s, and enemies around you are weakened.",
      buff: { ms: 6000, dmg: 15 }, cry: { r: 64, weakMs: 4000, look: "nova" } },
    { id: "b_howl", name: "Terrifying Howl", type: "War cry", branch: 1, row: 1, style: "spirit", cd: 14000, cost: 25,
      desc: "A howl so savage that monsters around you flee in terror and heroes falter.",
      cry: { r: 72, fearMs: 2000, look: "nova" } },
    { id: "b_retaliate", name: "Retaliate", type: "Counter", branch: 1, row: 2, style: "blood", cd: 8000, cost: 20,
      desc: "Brace for 0.8s. The next hit only makes you angrier: you explode in a roar that hits all around.",
      counter: { ms: 800, area: { r: 42, wpn: 1.8, kb: 2, look: "slam" }, buff: { ms: 3000, dmg: 15 } } },
    { id: "b_drums", name: "War Drums", type: "Aura", branch: 1, row: 3, style: "spirit", cd: 20000, cost: 30,
      desc: "Ancestral drums beat around you for 10s: +20% attack speed, and each beat jolts nearby enemies.",
      field: { kind: "drums", r: 52, ms: 10000, tickMs: 800, follow: true, dmg: 5, slowMs: 500 }, buff: { ms: 10000, atkspd: 20 } },
    { id: "b_ancestors", name: "Call of the Ancestors", type: "Ultimate", branch: 1, row: 4, style: "spirit", cd: 22000, cost: 50, chargeMs: 600,
      desc: "Call your ancestors: ghostly warriors rise and slam the ground around you three times, and their spirit shields you.",
      areas: [{ r: 68, dmg: 22, kb: 1, waves: 3, everyMs: 350, look: "spirit" }], buff: { ms: 6000, armor: 25 } },

    // Earth
    { id: "b_slam", name: "Ground Slam", type: "Attack", branch: 2, row: 0, style: "earth", cd: 6000, cost: 20,
      desc: "Smash the ground: hurts and stuns everything around you.",
      areas: [{ r: 38, dmg: 22, stunMs: 350, kb: 1, look: "slam" }] },
    { id: "b_leap", name: "Leap", type: "Movement", branch: 2, row: 1, style: "earth", cd: 9000, cost: 25,
      desc: "Leap forward and crash down, hurting everything where you land.",
      move: { kind: "leap", dist: 64, invulnMs: 300 }, areas: [{ r: 40, dmg: 26, kb: 2, look: "slam" }] },
    { id: "b_thick", name: "Thick Skin", type: "Passive", branch: 2, row: 2, style: "earth", passive: { effect: "hp", perRank: 6 },
      desc: "Hide like a bear: more max HP." },
    { id: "b_seismic", name: "Seismic Wave", type: "Attack", branch: 2, row: 3, style: "earth", cd: 10000, cost: 30,
      desc: "Stomp and send a wave of stone spikes bursting out of the ground ahead.",
      areas: [{ r: 22, ahead: 20, dmg: 15, kb: 1.5, slowMs: 600, waves: 5, everyMs: 90, line: 20, look: "spikes" }] },
    { id: "b_avalanche", name: "Avalanche", type: "Ultimate", branch: 2, row: 4, style: "earth", cd: 22000, cost: 50,
      desc: "Leap high into the air and come down like a mountain: a huge stun blast, then boulders rain around you.",
      move: { kind: "leap", dist: 90, invulnMs: 300 },
      areas: [{ r: 62, dmg: 28, stunMs: 700, kb: 2, delayMs: 350, look: "slam" }, { r: 22, dmg: 9, waves: 6, everyMs: 120, delayMs: 600, scatter: 72, look: "meteor" }] },
  ],
};

// ---- Tree shape -------------------------------------------------------------------------------------
/**
 * id: [level needed, parent skill, attribute scaling]. Uneven on purpose: some branches fork early, strong skills
 * such as Valor Rush, Inferno Orb or Fan of Arrows are dead ends, and the ultimates crown the longest limbs.
 */
type Shape = [req: number, parent?: string, scale?: [StatKind, number]];
const TREE: Record<string, Shape> = {
  // Knight · Valor: lunge forks into a dead-end charge and the whirl, which grows on to the Judgement Blade
  k_lunge: [1, undefined, ["str", 4]], k_rush: [9, "k_lunge", ["str", 4]], k_whirl: [4, "k_lunge", ["str", 4]],
  k_mastery: [12, "k_whirl"], k_judgement: [22, "k_whirl", ["str", 5]],
  // Knight · Bulwark: one long limb, Iron Skin hangs off the root
  k_shield: [1], k_ironskin: [6, "k_shield"], k_riposte: [3, "k_shield", ["dex", 3]], k_taunt: [10, "k_riposte"],
  k_quake: [20, "k_taunt", ["sta", 4]],
  // Knight · Crusade
  k_holyblade: [2], k_consecrate: [5, "k_holyblade", ["mag", 3]], k_aura: [13, "k_consecrate", ["mag", 3]],
  k_rally: [8, "k_consecrate"], k_wrath: [24, "k_rally", ["mag", 4]],
  // Ninja · Shadow: the smoke fork ends in Assassinate (dead end) or Thousand Cuts
  n_step: [1], n_swift: [6, "n_step"], n_smoke: [4, "n_step"], n_assassinate: [11, "n_smoke", ["dex", 4]],
  n_cuts: [22, "n_smoke", ["dex", 4]],
  // Ninja · Steel
  n_shuriken: [1, undefined, ["dex", 3]], n_flurry: [4, "n_shuriken"], n_vital: [12, "n_flurry"], n_parry: [8, "n_flurry", ["dex", 3]],
  n_storm: [20, "n_parry", ["str", 3]],
  // Ninja · Spirit: fire splits into poison craft (dead end) and lightning, which leads to the dragon
  n_flame: [2, undefined, ["mag", 3]], n_poison: [5, "n_flame"], n_caltrops: [9, "n_poison", ["dex", 2]],
  n_lightning: [12, "n_flame", ["mag", 3]], n_dragon: [24, "n_lightning", ["mag", 4]],
  // Wizard · Fire: the wall forks into the Inferno Orb (dead end) and the Meteor Shower
  w_wave: [1, undefined, ["mag", 3]], w_pyro: [8, "w_wave"], w_firewall: [5, "w_wave", ["mag", 3]],
  w_orb: [11, "w_firewall", ["mag", 4]], w_meteor: [22, "w_firewall", ["mag", 4]],
  // Wizard · Frost
  w_nova: [1, undefined, ["mag", 3]], w_shards: [3, "w_nova", ["dex", 3]], w_armor: [7, "w_shards"], w_mirror: [10, "w_shards"],
  w_blizzard: [20, "w_mirror", ["mag", 4]],
  // Wizard · Storm: one long limb, Mana Flow off the root
  w_missiles: [2, undefined, ["dex", 3]], w_flow: [12, "w_missiles"], w_blink: [5, "w_missiles", ["mag", 3]],
  w_static: [9, "w_blink", ["mag", 3]], w_storm: [24, "w_static", ["mag", 4]],
  // Archer · Marksman: Power Shot forks into the Fan (dead end) and Steady Aim on to the Arrow Rain
  a_volley: [1, undefined, ["dex", 3]], a_power: [4, "a_volley", ["str", 3]], a_fan: [10, "a_power", ["dex", 3]],
  a_aim: [7, "a_power"], a_rain: [20, "a_aim", ["dex", 3]],
  // Archer · Trapper: the reflex is a dead end right off the root
  a_beartrap: [1, undefined, ["str", 2]], a_reflex: [3, "a_beartrap", ["dex", 3]], a_explosive: [6, "a_beartrap", ["mag", 3]],
  a_net: [10, "a_explosive"], a_sentry: [22, "a_net", ["dex", 3]],
  // Archer · Nature
  a_firearrows: [2], a_frostarrow: [5, "a_firearrows", ["mag", 2]], a_feast: [12, "a_frostarrow"], a_windwalk: [8, "a_frostarrow"],
  a_phoenix: [24, "a_windwalk", ["mag", 4]],
  // Barbarian · Fury
  b_rage: [1], b_cleave: [3, "b_rage", ["str", 3]], b_bloodthirst: [8, "b_cleave"], b_berserk: [11, "b_cleave"],
  b_whirlwind: [22, "b_berserk", ["str", 4]],
  // Barbarian · Warcry: the battle cry forks into the howl (ending in Retaliate) and the drums (ending in the ancestors)
  b_battlecry: [1], b_howl: [5, "b_battlecry"], b_retaliate: [9, "b_howl", ["sta", 3]], b_drums: [12, "b_battlecry", ["sta", 2]],
  b_ancestors: [24, "b_drums", ["str", 3]],
  // Barbarian · Earth: Leap forks into the Seismic Wave (dead end) and Thick Skin on to the Avalanche
  b_slam: [1, undefined, ["sta", 2]], b_leap: [4, "b_slam", ["str", 3]], b_seismic: [10, "b_leap", ["str", 3]],
  b_thick: [7, "b_leap"], b_avalanche: [20, "b_thick", ["sta", 3]],
};
for (const list of Object.values(S)) for (const sk of list) {
  const t = TREE[sk.id];
  if (!t) throw new Error(`skill ${sk.id} has no place in TREE`);
  sk.req = t[0]; sk.parent = t[1];
  if (t[2]) sk.scale = { stat: t[2][0], per: t[2][1] };
}
// Tree order: parents before children, lower levels first
for (const list of Object.values(S)) list.sort((a, b) => a.branch - b.branch || depth(a, list) - depth(b, list) || a.req - b.req);
function depth(s: SkillDef, list: SkillDef[]): number { let d = 0, p = s.parent; while (p) { d++; p = list.find((x) => x.id === p)?.parent; } return d; }

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

export const SKILLS = S;
const BY_ID = new Map<string, SkillDef>();
for (const list of Object.values(S)) for (const s of list) BY_ID.set(s.id, s);
export const skillById = (id: string) => BY_ID.get(id);
export const skillOf = (cls: ClassKind, id: string) => { const s = BY_ID.get(id); return s && S[cls].includes(s) ? s : undefined; };
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
export const activeSkills = (cls: ClassKind) => S[cls].filter(isActive);
/** Every skill of a class (actives and passives), in tree order. */
export const classSkills = (cls: ClassKind) => S[cls].slice();
export const skillLearned = (cls: ClassKind, r: Ranks, id: string) => !!skillOf(cls, id) && rankOf(r, id) > 0;


export function talentPoints(level: number): number { return Math.max(0, level - 1); }

export function spentPoints(cls: ClassKind, r: Ranks): number {
  return S[cls].reduce((s, n) => s + Math.min(MAX_RANK, rankOf(r, n.id)), 0);
}

export type LockReason = "" | "max" | "level" | "above" | "points";
/** Why skill `id` can't take one more rank right now ("" = it can). A skill needs its parent skill learned. */
export function lockReason(cls: ClassKind, level: number, r: Ranks, id: string): LockReason {
  const n = skillOf(cls, id);
  if (!n || rankOf(r, id) >= MAX_RANK) return "max";
  if (level < n.req) return "level";
  if (n.parent && rankOf(r, n.parent) < 1) return "above";
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
};

/** Drop unknown skills (old saves) and anything above what the level allows. */
export function cleanRanks(cls: ClassKind, level: number, saved: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of S[cls]) {
    const v = saved[s.id];
    if (typeof v === "number" && v > 0) out[s.id] = Math.min(MAX_RANK, Math.floor(v));
  }
  // Learn order must still be valid: drop skills whose parent is missing or that need a higher level (S is in tree order)
  for (const s of S[cls]) if (out[s.id] && (level < s.req || (s.parent && !out[s.parent]))) delete out[s.id];
  return spentPoints(cls, out) <= talentPoints(level) ? out : {};
}
