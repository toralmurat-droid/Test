export const TILE = 32; // px per tile (same pixel size as the 32px heroes)
/** Tile art was first designed on a 16-unit grid: K = fine pixels per design unit. */
export const ART_K = TILE / 16;
export const MAP_W = 288; // tiles
export const MAP_H = 216; // tiles
export const TICK_RATE = 20; // server updates per second
export const PLAYER_SPEED = 90; // px per second (default; classes override, see classes.ts)
export const PLAYER_RADIUS = 5; // collision half-size in px
export const RESPAWN_MS = 2500;
// HP regeneration is based on the hero's Stamina stat (HP per second per Stamina point): every hero always
// regenerates a little, ramping up smoothly once out of combat, 3x faster on the plaza.
// e.g. Knight Lv1 (10 Stamina): 1 HP/s in combat, 5 HP/s out of combat, 15 HP/s on the plaza.
export const COMBAT_REGEN_PER_STA = 0.1;
export const REGEN_DELAY_MS = 3000; // no damage taken for this long -> out-of-combat regen starts ramping
export const REGEN_RAMP_MS = 3000; // ramp from combat rate to full rate over this time
export const REGEN_PER_STA = 0.5;
export const SAFE_REGEN_MULT = 3;
/** HP per second from Stamina: [in combat, out of combat]. */
export const regenFromStamina = (sta: number) => [sta * COMBAT_REGEN_PER_STA, sta * REGEN_PER_STA] as const;
export const HIT_RADIUS = 6; // body radius used for projectile / melee hit tests

export type Dir = "up" | "down" | "left" | "right";

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export type MobKind = "slime" | "skeleton" | "motherblob" | "blobling" | "shooterblob" | "warriorblob" | "healerblob" | "bandit" | "skeletonmage" | "necromancer" | "crawler" | "demon" | "banditchief";

export interface MobDef {
  name: string;
  maxHp: number;
  speed: number; // px per second
  damage: number;
  attackCooldownMs: number;
  aggroRange: number; // px
  leash: number; // max chase distance from home, px
  xp: number;
}

export const MOBS: Record<MobKind, MobDef> = {
  slime: { name: "Slime", maxHp: 40, speed: 45, damage: 8, attackCooldownMs: 1000, aggroRange: 80, leash: 140, xp: 10 },
  skeleton: { name: "Skeleton", maxHp: 80, speed: 62, damage: 19, attackCooldownMs: 900, aggroRange: 110, leash: 200, xp: 25 },
  // Big, slow slime that buds off bloblings now and then (see BROOD)
  motherblob: { name: "Mother Blob", maxHp: 200, speed: 28, damage: 12, attackCooldownMs: 1300, aggroRange: 70, leash: 120, xp: 60 },
  // Tiny, quick, fragile children of a Mother Blob; they never respawn on their own
  blobling: { name: "Blobling", maxHp: 14, speed: 58, damage: 4, attackCooldownMs: 800, aggroRange: 90, leash: 160, xp: 3 },
  // Higher-level blob zones: a ranged spitter, a helmeted brawler and a healer that keeps the others alive (see BLOB_AI)
  shooterblob: { name: "Shooter Blob", maxHp: 50, speed: 40, damage: 10, attackCooldownMs: 1800, aggroRange: 130, leash: 180, xp: 18 },
  warriorblob: { name: "Warrior Blob", maxHp: 110, speed: 52, damage: 16, attackCooldownMs: 1100, aggroRange: 100, leash: 170, xp: 26 },
  healerblob: { name: "Healer Blob", maxHp: 60, speed: 42, damage: 5, attackCooldownMs: 1200, aggroRange: 110, leash: 160, xp: 22 },
  // Outlaws of Redfang Hollow: quick, hit hard, hood and red bandana
  bandit: { name: "Bandit", maxHp: 95, speed: 64, damage: 15, attackCooldownMs: 950, aggroRange: 120, leash: 200, xp: 30 },
  // Higher skeleton zones: a robed caster that throws magic bolts from range, and the elite Necromancer (see SKELETON_AI)
  skeletonmage: { name: "Skeleton Mage", maxHp: 60, speed: 50, damage: 17, attackCooldownMs: 1900, aggroRange: 140, leash: 200, xp: 32 },
  necromancer: { name: "Necromancer", maxHp: 520, speed: 38, damage: 22, attackCooldownMs: 1700, aggroRange: 150, leash: 230, xp: 240 },
  demon: { name: "Bone Demon", maxHp: 640, speed: 50, damage: 30, attackCooldownMs: 1300, aggroRange: 170, leash: 320, xp: 220 },
  // Boss of Redfang Hollow (shared/bandits.ts CHIEF): a big axeman who leaps at you and rallies his camp
  banditchief: { name: "Redfang Chief", maxHp: 760, speed: 58, damage: 26, attackCooldownMs: 1150, aggroRange: 150, leash: 330, xp: 420 },
  crawler: { name: "Crawling Skeleton", maxHp: 26, speed: 30, damage: 13, attackCooldownMs: 1000, aggroRange: 120, leash: 220, xp: 6 },
};

/** Elite monsters: much tougher than the rest of their zone, with a bigger look and an "Elite" tag. */
export const ELITE: Partial<Record<MobKind, true>> = { necromancer: true, demon: true, banditchief: true };
/** Bosses: elites that lead a whole camp (tagged "Boss" instead of "Elite"). */
export const BOSS: Partial<Record<MobKind, true>> = { banditchief: true };

/**
 * Skeleton casters. Distances in px.
 * Mage: keeps its distance and throws magic bolts.
 * Necromancer: shadow bolts, raises skeletons around it, and Death Circle: a big telegraphed blast on the ground where you stand.
 */
export const SKELETON_AI = {
  mage: { range: 120, keepAway: 60, shotSpeed: 140, shotRadius: 3 },
  necro: {
    range: 140, keepAway: 70, shotSpeed: 165, shotRadius: 4, boltMult: 1.3,
    raise: { everyMs: 10000, count: 2, max: 5, spread: 22, castMs: 800 },
    circle: { range: 150, radius: 38, windupMs: 1300, cooldownMs: 7500, dmgMult: 2 },
  },
};

/**
 * Skeleton weapons (random per skeleton, shown in its hands): reach in px, damage and cooldown multipliers, wind-up.
 * Sword is the all-rounder, the axe hits hard but slowly, the spear reaches twice as far, the bow shoots arrows from afar.
 */
export type SkeletonWeapon = "sword" | "axe" | "spear" | "bow";
export const SKELETON_WEAPONS: Record<SkeletonWeapon, { range: number; dmg: number; cooldown: number; windupMs: number; weight: number }> = {
  sword: { range: 14, dmg: 1, cooldown: 1, windupMs: 300, weight: 3 },
  axe: { range: 13, dmg: 1.45, cooldown: 1.4, windupMs: 480, weight: 2 },
  spear: { range: 28, dmg: 0.9, cooldown: 1.15, windupMs: 380, weight: 2 },
  bow: { range: 115, dmg: 0.7, cooldown: 1.6, windupMs: 550, weight: 2 },
};
/** Bow skeletons keep this far from you; arrows fly at this speed. */
export const SKELETON_BOW = { keepAway: 50, shotSpeed: 170, shotRadius: 3 };
export function rollSkeletonWeapon(): SkeletonWeapon {
  const all = Object.entries(SKELETON_WEAPONS) as [SkeletonWeapon, { weight: number }][];
  let r = Math.random() * all.reduce((a, [, w]) => a + w.weight, 0);
  for (const [k, w] of all) if ((r -= w.weight) < 0) return k;
  return "sword";
}

/** Special blob behaviour. Distances in px. */
export const BLOB_AI = {
  shooter: { range: 110, keepAway: 55, shotSpeed: 150, shotRadius: 3 }, // spits slime balls from a distance
  warrior: { chargeMin: 26, chargeMax: 72, chargeMs: 320, chargeMult: 3, cooldownMs: 4000 }, // lunges at you
  healer: { range: 70, everyMs: 3000, frac: 0.15, keepAway: 50 }, // heals the most hurt blob nearby, stays back
};

/**
 * Blobs and the undead hate each other (Murat): where they meet they fight. A monster with no hero to fight
 * picks the nearest enemy of the other side within `range` px, and kills between monsters drop no loot or XP.
 */
/**
 * Skeletons (Murat 2026-11-03): a killed skeleton may break in two and its upper body crawls on fighting
 * (`crawlChance`, appears after `crawlDelayMs`). Two or more skeletons on one hero spread out around him
 * and close in from different sides (`flankTurn` = max radians they swing round per step of approach).
 */
export const BONES = {
  crawlChance: 0.35, crawlDelayMs: 650, flankTurn: 0.9, flankRadius: 0.8,
  /**
   * Overpowered (Murat 2026-11-03): when 3+ skeletons fighting one hero are outmatched (the hero is `gap`+ levels
   * above them on average, or they are down below `hpFrac` of their health together), up to 5 of them throw
   * themselves apart. They also do it, fight or not, when a hero `passGap`+ levels above them comes within `near` px: their bones fly and slide into a pentagram of radius `radius` and after `castMs` a Bone Demon
   * climbs out (Lv = their best + `levelUp`, at least the hero's level - `belowHero`). It is banished again after `lifeMs`. One ritual per hero per `cooldownMs`.
   */
  ritual: { minPack: 3, maxPack: 5, near: 170, gap: 3, hpFrac: 0.45, passGap: 6, belowHero: 2, checkMs: 1000, castMs: 3200, radius: 34, levelUp: 3, lifeMs: 90000, cooldownMs: 45000, maxDemons: 6 },
};
/** Bone Demon's Hellfire Stomp: a telegraphed blast of fire around it. */
export const DEMON = {
  stomp: { everyMs: 6500, windupMs: 800, range: 60, radius: 58, dmgMult: 1.3, knockback: 2.2 },
  /**
   * Bone Harvest (Murat): it rips apart a skeleton within `range` px and wears its bones, up to `max` pieces
   * (1-2 armour: shoulder plates and a rib cuirass, 3-4 a bone blade and a spiked crown). Each piece cuts the
   * damage it takes by `armorPer` and adds `dmgPer` to its blows.
   */
  harvest: { everyMs: 5000, range: 90, max: 4, armorPer: 0.1, dmgPer: 0.12 },
  /** Skeleton Toss: a hero keeping `min`-`max` px away gets a skeleton (grabbed within `grab` px) thrown at him. */
  toss: { everyMs: 4000, grab: 70, min: 55, max: 180, speed: 170, radius: 7, dmgMult: 1.6 },
};
export const FEUD = { range: 90, dmgMult: 1 };

/**
 * Aggro (Murat): a monster fights whoever it hates most, hero or rival monster, re-picked every `everyMs`.
 * Perceived aggro: closeness (1 at contact, 0 at its aggro range) times a level factor: a target more than
 * `freeGap` levels above the monster is scary, -`perLevel` per extra level (a much stronger hero is left alone
 * unless he attacks); a weaker one is a bit more tempting (+`preyPerLevel` per level, up to `preyMax`).
 * Rival monsters count `rival` as much as a hero. Generated aggro: each blow adds `hitBase` + `dmgMult` x the
 * fraction of HP it took (up to `max`), fading by `decayPerSec`. The current target gets `stick` so monsters
 * don't flip-flop. A blob that sees a hero `dangerGap`+ levels above it feels in danger and calls its kin to merge.
 */
export const AGGRO = {
  everyMs: 600, rival: 0.8, stick: 0.3,
  freeGap: 2, perLevel: 0.2, preyPerLevel: 0.05, preyMax: 0.25,
  hitBase: 0.6, dmgMult: 2, max: 3, decayPerSec: 0.15,
  dangerGap: 4,
};
/** How much a monster of level `lvl` cares about a target of level `targetLvl` (0 = not at all). */
export function aggroLevelFactor(lvl: number, targetLvl: number) {
  const gap = targetLvl - lvl;
  if (gap < 0) return 1 + Math.min(AGGRO.preyMax, -gap * AGGRO.preyPerLevel);
  return Math.max(0, 1 - Math.max(0, gap - AGGRO.freeGap) * AGGRO.perLevel);
}
// Outlaws (Redfang Hollow) fight both: their patrols pick fights with whatever lives in the woods
export const FACTION: Partial<Record<MobKind, "blob" | "undead" | "outlaw">> = {
  slime: "blob", blobling: "blob", motherblob: "blob", shooterblob: "blob", warriorblob: "blob", healerblob: "blob",
  skeleton: "undead", skeletonmage: "undead", necromancer: "undead", crawler: "undead", demon: "undead",
  bandit: "outlaw", banditchief: "outlaw",
};

/**
 * Blob merging (Murat): a blob in danger (hurt, or facing several heroes) calls the blobs around it, and they
 * melt into one big blob. Levels, HP and abilities (shoot, charge, heal) add up. At most 5 blobs merge into a
 * blob below Lv 10, up to 10 into a higher one. Only blobs of Lv 5+ merge (Murat 2026-11-03), except near a
 * hero whose quest step is to watch a blob call for help (the first quest, in a Lv 1-3 zone).
 */
export const MERGE = {
  hpFrac: 0.5, // "in danger" below this fraction of HP...
  crowd: 2, crowdRange: 80, // ...or with this many heroes this close
  callRange: 130, callEveryMs: 5000, // px around it that hear the call, and how often it may call
  speedMult: 1.5, touch: 10, // callers rush in and fuse on contact (px)
  capLow: 5, capHigh: 10, highLevel: 10,
  minLevel: 5, // blobs below this level neither call for help nor answer a call
  shotEveryMs: 2200, // a merged blob that can shoot spits between blows
  growPerBlob: 0.22, // client: sprite scale +22% per blob inside
};

/**
 * Mother Blob grows with her level: a new look per tier (more armour the higher she is) and special moves.
 * Lv 5+: Belly Bounce, a short-range shockwave that knocks players back.
 * Lv 10+: Ground Slam, a big hit around her that also calls a swarm of bloblings.
 */
export const MOTHER = {
  tier: (level: number) => (level >= 10 ? 3 : level >= 5 ? 2 : 1),
  bounce: { level: 5, range: 34, radius: 42, windupMs: 600, cooldownMs: 7000, dmgMult: 0.8, knockback: 3 },
  slam: { level: 10, range: 70, radius: 66, windupMs: 900, cooldownMs: 15000, dmgMult: 1.8, knockback: 2, swarm: 5 },
};

/** Mother Blob brood: every few seconds (random) she may bud a blobling, up to `perMother` alive at once. */
export const BROOD = { minMs: 5000, maxMs: 12000, perMother: 4, worldCap: 160 };
/** How a monster's level scales its base stats (level 1 = the MOBS numbers). */
export const MOB_LEVEL = { hp: 0.3, damage: 0.12, xp: 0.25, gold: 0.2 }; // +x per level above 1
export function mobScale(level: number, stat: keyof typeof MOB_LEVEL): number {
  return 1 + MOB_LEVEL[stat] * (Math.max(1, level) - 1);
}

export const MOB_ATTACK_RANGE = 14; // px
