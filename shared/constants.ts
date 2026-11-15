export const TILE = 32; // px per tile (same pixel size as the 32px heroes)
/** Tile art was first designed on a 16-unit grid: K = fine pixels per design unit. */
export const ART_K = TILE / 16;
export const MAP_W = 288; // tiles
/** Rows of the overworld (Oakvale's valley). The map is taller: under it lies the Mawdeep Warrens (shared/dungeon.ts). */
export const WORLD_H = 216; // tiles
/** End of the underground band (rows WORLD_H..UNDER_END hold the Mawdeep Warrens, shared/dungeon.ts). */
export const UNDER_END = 288;
/** Act 2, the desert (shared/desert.ts): its own band of the map, under a strip of solid rock. */
export const DESERT_Y0 = 300;
export const DESERT_H = 216;
/**
 * The deep band under the desert (shared/dungeon.ts, Murat's friend 2026-11-10: "make 2 dungeons, with quests inside"):
 * west of DEEP_SPLIT the Lantern Crypt under Barrow Downs (Act 1), east of it the Undercity below Kharsun (Act 2).
 */
export const DEEP_Y0 = DESERT_Y0 + DESERT_H + 8;
export const DEEP_END = DEEP_Y0 + 64;
export const DEEP_SPLIT = 144;
/** Act 3, the Grey Barrow Moors (shared/moors.ts): the Ossuary Host's homeland, its own band under the deep band's rock. */
export const MOORS_Y0 = DEEP_END + 8;
export const MOORS_H = 176;
/** Act 4, the Red Badlands (shared/badlands.ts): the Redfang clan's homeland, its own band under the moors' rock. */
export const BADLANDS_Y0 = MOORS_Y0 + MOORS_H + 8;
export const BADLANDS_H = 176;
/** Act 5, the Mawdeep Sinkholes (shared/sinkholes.ts): the Hide-Kin's homeland, its own band under the badlands' rock. */
export const SINKHOLES_Y0 = BADLANDS_Y0 + BADLANDS_H + 8;
export const SINKHOLES_H = 176;
export const MAP_H = SINKHOLES_Y0 + SINKHOLES_H + 4; // tiles: overworld, underground band, rock, desert, rock, deep band, rock, moors, rock, badlands, rock, sinkholes
/** The acts (one per land): 1 Oakvale (and the Mawdeep, the Lantern Crypt), 2 the Sunscar, 3 the moors, 4 the badlands, 5 the sinkholes. */
export type Act = 1 | 2 | 3 | 4 | 5;
/** True in the deep band (tiles). */
export const inDeepRow = (ty: number) => ty >= DEEP_Y0 && ty < DEEP_END;
/**
 * True for a map row in the sinkholes band, with the rock strip round it: the 8 rows of rock between two bands split
 * evenly, 4 to each, so a tile there is never mistaken for the band above.
 */
export const inSinkholesBand = (ty: number) => ty >= SINKHOLES_Y0 - 4;
/** True for a map row in the badlands band, with its share of the rock strips above and below. */
export const inBadlandsBand = (ty: number) => ty >= BADLANDS_Y0 - 4 && ty < SINKHOLES_Y0 - 4;
/** True for a map row in the moors band, with its share of the rock strips above and below. */
export const inMoorsBand = (ty: number) => ty >= MOORS_Y0 - 4 && ty < BADLANDS_Y0 - 4;
/**
 * Which act a tile belongs to: the sinkholes band is Act 5, the badlands band Act 4, the moors band Act 3; the desert
 * and the Undercity Act 2; the rest (the Lantern Crypt too) Act 1. The homeland bands are tested first: every row from
 * the desert down would otherwise count as Act 2.
 */
export const actOfTile = (tx: number, ty: number): Act =>
  inSinkholesBand(ty) ? 5 : inBadlandsBand(ty) ? 4 : inMoorsBand(ty) ? 3 : ty >= DESERT_Y0 && !(ty >= DEEP_Y0 - 4 && tx < DEEP_SPLIT) ? 2 : 1;
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
  /**
   * Exact walking direction (world, unit vector) from point-and-click, so the hero walks straight at any angle like
   * in Diablo 2 instead of in 8 directions. The keys above still say roughly where (for facing and animation).
   */
  vx?: number;
  vy?: number;
}

/** Point-and-click walking angles are rounded to this many steps, so the client only sends a new input on a real turn. */
export const WALK_ANGLES = 64;

/** The exact walking direction of an input, if it has a valid one. */
export function inputDir(i: InputState): [number, number] | undefined {
  const x = i.vx, y = i.vy;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  const l = Math.hypot(x, y);
  return l > 0.01 ? [x / l, y / l] : undefined;
}

/** Input walking toward (dx, dy) at any angle (rounded to WALK_ANGLES), with the keys set to the nearest of 8 directions. */
export function dirInput(dx: number, dy: number): InputState {
  if (!dx && !dy) return { up: false, down: false, left: false, right: false };
  const step = (Math.PI * 2) / WALK_ANGLES;
  const a = Math.round(Math.atan2(dy, dx) / step) * step;
  const vx = Math.round(Math.cos(a) * 1e4) / 1e4, vy = Math.round(Math.sin(a) * 1e4) / 1e4;
  const k = 0.38; // ~ sin 22.5 degrees
  return { up: vy < -k, down: vy > k, left: vx < -k, right: vx > k, vx, vy };
}

export type MobKind = "slime" | "skeleton" | "motherblob" | "blobling" | "shooterblob" | "warriorblob" | "healerblob" | "bandit" | "skeletonmage" | "necromancer" | "crawler" | "demon" | "banditchief" | "hollowking"
  | "venomblob" | "frostblob" | "fireblob" | "stormblob"
  // the beast-folk of the Mawdeep Warrens (shared/dungeon.ts, BEAST below): men and women sewn into animal hides
  | "gnawkin" | "tuskborn" | "silkwretch" | "duskwing" | "packlord" | "hornbrute" | "hidemother" | "crowseer" | "gnasher" | "weaver"
  // Act 2, the Sunscar desert (shared/desert.ts): raiders, scorpions, the buried dead, the Veiled Circle and the camel-folk
  | "nomad" | "scorpion" | "sanddead" | "veiled" | "camelfolk" | "sphinx"
  // Act 2's final boss at the Sun Furnace (SUNWRIGHT below)
  | "sunwright"
  // the Night Raiders (shared/raiders.ts): seven named riders who roam both acts by night
  | "nightraider"
  // Act 3, the Grey Barrow Moors (shared/moors.ts): the Ossuary Host's dead, the fen-hags who serve them, and the Barrow-King
  | "wight" | "boghag" | "bonehound" | "mistwraith" | "legionary" | "cairnlord" | "barrowking"
  // Act 4, the Red Badlands (shared/badlands.ts): the Redfang clan's riders, bowmen, fire-throwers, dogs and captains, the
  // badlands' vultures and rattlesnakes, and Old Rourke, the Fang-Father, in his keep at Fangrock
  | "outrider" | "crossbowman" | "firebrand" | "warhound" | "vulture" | "rattler" | "redcaptain" | "rourke"
  // clan troops of the war (shared/war/troops.ts): the clan rides in Mob.weapon; art comes per clan (shared/war/patrols.ts TROOP_LOOK)
  | "trooper"
  // summoned by heroes (shared/summons.ts): they fight for their owner
  | "golem_fire" | "golem_cold" | "golem_poison" | "golem_shock" | "golem_colossus"
  | "bride" // the vampire's Brides (v_brides): pale companions that run at his foes and drink
  | "wisp"; // the Summoner's elemental wisps (su_wisps, shared/summons.ts WISP): Void lights that shoot (element in Mob.weapon)

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
  // Summoner golems (shared/summons.ts): slow and sturdy, a heavy two-handed slam; aggro/leash come from SUMMON
  golem_fire: { name: "Fire Golem", maxHp: 150, speed: 70, damage: 16, attackCooldownMs: 1200, aggroRange: 160, leash: 256, xp: 0 },
  golem_cold: { name: "Frost Golem", maxHp: 170, speed: 66, damage: 13, attackCooldownMs: 1200, aggroRange: 160, leash: 256, xp: 0 },
  golem_poison: { name: "Venom Golem", maxHp: 150, speed: 70, damage: 12, attackCooldownMs: 1100, aggroRange: 160, leash: 256, xp: 0 },
  golem_shock: { name: "Storm Golem", maxHp: 130, speed: 76, damage: 15, attackCooldownMs: 1000, aggroRange: 160, leash: 256, xp: 0 },
  // the Summoner's ultimate: the golems fused into one giant (its element is in Mob.weapon)
  // the vampire's ultimate (v_brides): fast and frantic, quick claws, not much life
  bride: { name: "Bride", maxHp: 170, speed: 112, damage: 9, attackCooldownMs: 520, aggroRange: 200, leash: 300, xp: 0 },
  // the Summoner's wisps: they float (fast), shoot from afar (shared/voidConjure.ts) and break easily
  wisp: { name: "Wisp", maxHp: 45, speed: 150, damage: 0, attackCooldownMs: 1200, aggroRange: 150, leash: 256, xp: 0 },
  golem_colossus: { name: "Colossus", maxHp: 420, speed: 64, damage: 30, attackCooldownMs: 1500, aggroRange: 180, leash: 256, xp: 0 },
  slime: { name: "Blob", maxHp: 40, speed: 45, damage: 8, attackCooldownMs: 1000, aggroRange: 80, leash: 140, xp: 10 },
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
  demon: { name: "Bone Demon", maxHp: 640, speed: 50, damage: 25, attackCooldownMs: 1300, aggroRange: 170, leash: 320, xp: 220 },
  // Boss of Redfang Hollow (shared/bandits.ts CHIEF): a big axeman who leaps at you and rallies his camp
  banditchief: { name: "Redfang Chief", maxHp: 1000, speed: 58, damage: 30, attackCooldownMs: 1150, aggroRange: 150, leash: 330, xp: 420 },
  // The first zone's final boss (Hollow Crown chain, shared/quests.ts CROWN_QUESTS; moves in HOLLOW_KING below)
  hollowking: { name: "The Hollow King", maxHp: 900, speed: 54, damage: 27, attackCooldownMs: 1250, aggroRange: 220, leash: 420, xp: 900 },
  crawler: { name: "Crawling Skeleton", maxHp: 26, speed: 30, damage: 13, attackCooldownMs: 1000, aggroRange: 120, leash: 220, xp: 6 },
  // Elemental blobs (Murat 2026-11-05): pieces of the Gloam that fled east and soaked up the wild places (ELEM_BLOB below)
  venomblob: { name: "Venom Blob", maxHp: 80, speed: 40, damage: 10, attackCooldownMs: 1400, aggroRange: 135, leash: 190, xp: 30 },
  frostblob: { name: "Frost Blob", maxHp: 125, speed: 42, damage: 14, attackCooldownMs: 1250, aggroRange: 110, leash: 180, xp: 34 },
  fireblob: { name: "Fire Blob", maxHp: 110, speed: 48, damage: 15, attackCooldownMs: 1150, aggroRange: 125, leash: 190, xp: 36 },
  stormblob: { name: "Storm Blob", maxHp: 95, speed: 62, damage: 13, attackCooldownMs: 1000, aggroRange: 120, leash: 200, xp: 38 },
  // The beast-folk of the Mawdeep Warrens (Murat 2026-11-05): their moves come from the beast sewn into them (BEAST below)
  gnawkin: { name: "Gnawkin", maxHp: 62, speed: 74, damage: 11, attackCooldownMs: 760, aggroRange: 130, leash: 230, xp: 26 },
  tuskborn: { name: "Tuskborn", maxHp: 140, speed: 54, damage: 18, attackCooldownMs: 1300, aggroRange: 120, leash: 240, xp: 40 },
  silkwretch: { name: "Silkwretch", maxHp: 86, speed: 58, damage: 13, attackCooldownMs: 1100, aggroRange: 150, leash: 230, xp: 36 },
  duskwing: { name: "Duskwing", maxHp: 76, speed: 70, damage: 12, attackCooldownMs: 950, aggroRange: 150, leash: 250, xp: 34 },
  crowseer: { name: "Crowseer", maxHp: 70, speed: 60, damage: 15, attackCooldownMs: 1700, aggroRange: 170, leash: 250, xp: 40 },
  gnasher: { name: "Old Gnasher", maxHp: 480, speed: 68, damage: 21, attackCooldownMs: 1000, aggroRange: 160, leash: 300, xp: 260 },
  weaver: { name: "The Weaver", maxHp: 520, speed: 54, damage: 22, attackCooldownMs: 1300, aggroRange: 190, leash: 300, xp: 280 },
  packlord: { name: "Gorehowl the Packlord", maxHp: 560, speed: 66, damage: 24, attackCooldownMs: 1100, aggroRange: 170, leash: 330, xp: 320 },
  hornbrute: { name: "The Hornbrute", maxHp: 700, speed: 52, damage: 28, attackCooldownMs: 1400, aggroRange: 160, leash: 330, xp: 360 },
  // Act 2, the Sunscar (Murat 2026-11-08): Lv 30-47. Base numbers set with tools/balance/pve.ts --act2 so the desert plays
  // like Act 1's middle zones for a hero of its level (about 2-4% HP lost and 3 s per kill)
  nomad: { name: "Dustrider", maxHp: 175, speed: 70, damage: 24, attackCooldownMs: 820, aggroRange: 150, leash: 260, xp: 55 },
  scorpion: { name: "Dune Scorpion", maxHp: 215, speed: 58, damage: 22, attackCooldownMs: 1050, aggroRange: 120, leash: 220, xp: 58 },
  sanddead: { name: "Sand-Dead", maxHp: 190, speed: 54, damage: 27, attackCooldownMs: 1000, aggroRange: 130, leash: 230, xp: 58 },
  veiled: { name: "Veiled Adept", maxHp: 140, speed: 56, damage: 27, attackCooldownMs: 1800, aggroRange: 170, leash: 250, xp: 64 },
  camelfolk: { name: "Camel-Man", maxHp: 300, speed: 60, damage: 32, attackCooldownMs: 1300, aggroRange: 140, leash: 260, xp: 74 },
  // the winged lion-headed guardians of Kharsun's tombs: a khopesh and a shield, and a leap onto you on golden wings
  sphinx: { name: "Sphinx Warrior", maxHp: 320, speed: 62, damage: 33, attackCooldownMs: 1200, aggroRange: 150, leash: 270, xp: 80 },
  // Act 2's final boss (the Second Sun chain's last quest; moves in BEAST, voice and phases in SUNWRIGHT below)
  sunwright: { name: "The Sunwright", maxHp: 1100, speed: 50, damage: 30, attackCooldownMs: 1250, aggroRange: 260, leash: 520, xp: 2400 },
  // The Night Raiders (shared/raiders.ts): mounted, cloaked, a massive weapon; always Lv 50, close to unbeatable alone
  // (Murat 2026-11-08): pve.ts --boss=raider gives a Lv 50 hero alone 0-33%, a Lv 30 hero none. Faster than a hero on foot
  nightraider: { name: "Night Raider", maxHp: 20000, speed: 96, damage: 160, attackCooldownMs: 1350, aggroRange: 170, leash: 420, xp: 3000 },
  // Clan troops (shared/war/troops.ts, server/warTroops.ts): drilled footmen with a rush and a javelin, a real fight for a
  // hero of their level (pve.ts --troops); no XP, no loot. troopStats adds the clan, officer and veteran multipliers
  trooper: { name: "Soldier", maxHp: 230, speed: 64, damage: 21, attackCooldownMs: 950, aggroRange: 160, leash: 192, xp: 0 },
  hidemother: { name: "The Hide-Mother", maxHp: 950, speed: 50, damage: 28, attackCooldownMs: 1300, aggroRange: 240, leash: 480, xp: 1000 },
  // Act 3, the Grey Barrow Moors (Lv 20-35): base numbers set with tools/balance/pve.ts --moors so the moors play like
  // Act 1's Lv 20-25 zones for a hero of their level (MOORS_KINDS below; moves in BEAST_MOVES, shots in server RANGED)
  wight: { name: "Barrow-Wight", maxHp: 170, speed: 56, damage: 23, attackCooldownMs: 1000, aggroRange: 120, leash: 220, xp: 34 },
  boghag: { name: "Bog Hag", maxHp: 125, speed: 50, damage: 22, attackCooldownMs: 1800, aggroRange: 150, leash: 230, xp: 36 },
  bonehound: { name: "Bone Hound", maxHp: 105, speed: 84, damage: 10, attackCooldownMs: 800, aggroRange: 150, leash: 260, xp: 28 },
  mistwraith: { name: "Mist Wraith", maxHp: 110, speed: 62, damage: 20, attackCooldownMs: 1700, aggroRange: 160, leash: 240, xp: 36 },
  legionary: { name: "Host Legionary", maxHp: 220, speed: 54, damage: 24, attackCooldownMs: 1150, aggroRange: 130, leash: 230, xp: 42 },
  // the elite of the barrow fields, and the Host's old king under Kingsbarrow (a boss of the dead: only about at night)
  cairnlord: { name: "Cairn-Lord", maxHp: 750, speed: 50, damage: 27, attackCooldownMs: 1300, aggroRange: 170, leash: 320, xp: 340 },
  barrowking: { name: "The Barrow-King", maxHp: 1900, speed: 52, damage: 32, attackCooldownMs: 1250, aggroRange: 240, leash: 460, xp: 1100 },
  // Act 4, the Red Badlands (Lv 25-40): base numbers set with tools/balance/pve.ts --badlands so the badlands play like the
  // moors and Act 1's late zones for a hero of their level (BADLANDS_KINDS below; moves in BEAST_MOVES, BADLANDS_AI)
  outrider: { name: "Redfang Outrider", maxHp: 200, speed: 64, damage: 21, attackCooldownMs: 950, aggroRange: 140, leash: 240, xp: 36 },
  crossbowman: { name: "Redfang Crossbowman", maxHp: 150, speed: 54, damage: 23, attackCooldownMs: 1800, aggroRange: 170, leash: 240, xp: 38 },
  firebrand: { name: "Redfang Firebrand", maxHp: 155, speed: 52, damage: 20, attackCooldownMs: 1500, aggroRange: 150, leash: 230, xp: 40 },
  warhound: { name: "Redfang Warhound", maxHp: 125, speed: 86, damage: 10, attackCooldownMs: 800, aggroRange: 150, leash: 260, xp: 28 },
  vulture: { name: "Vulture", maxHp: 120, speed: 70, damage: 16, attackCooldownMs: 1100, aggroRange: 160, leash: 280, xp: 30 },
  rattler: { name: "Rattler", maxHp: 115, speed: 58, damage: 14, attackCooldownMs: 1000, aggroRange: 100, leash: 200, xp: 30 },
  // the clan's captains (elite) and its lord, Old Rourke, the Fang-Father, in Fangrock's keep (a living boss: about by day and night)
  redcaptain: { name: "Redfang Captain", maxHp: 760, speed: 56, damage: 27, attackCooldownMs: 1250, aggroRange: 180, leash: 320, xp: 350 },
  rourke: { name: "Old Rourke", maxHp: 1900, speed: 56, damage: 26, attackCooldownMs: 1200, aggroRange: 240, leash: 460, xp: 1200 },
};

/** Elite monsters: much tougher than the rest of their zone, with a bigger look and an "Elite" tag. */
export const ELITE: Partial<Record<MobKind, true>> = { necromancer: true, demon: true, banditchief: true, hollowking: true, packlord: true, hornbrute: true, hidemother: true, gnasher: true, weaver: true, sunwright: true, cairnlord: true, barrowking: true,
  redcaptain: true, rourke: true };
/** Bosses: elites that lead a whole camp (tagged "Boss" instead of "Elite"). */
export const BOSS: Partial<Record<MobKind, true>> = { banditchief: true, hollowking: true, hidemother: true, sunwright: true, barrowking: true, rourke: true };

/**
 * Skeleton casters. Distances in px.
 * Mage: keeps its distance and throws magic bolts.
 * Necromancer: shadow bolts, raises skeletons around it, and Death Circle: a big telegraphed blast on the ground where you stand.
 */
export const SKELETON_AI = {
  mage: { range: 120, keepAway: 60, shotSpeed: 140, shotRadius: 3 },
  necro: {
    range: 140, keepAway: 70, shotSpeed: 165, shotRadius: 4, boltMult: 1.15,
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
   * climbs out (Lv = their best + `levelUp`, at least the hero's level - `belowHero`). First they walk to the points of
   * the star (`rim` x radius out) and, once there or after `gatherMs`, throw themselves in and burst into its bones. It is banished again after `lifeMs`. One ritual per hero per `cooldownMs`.
   */
  ritual: { gatherMs: 3500, rim: 1.6, minPack: 3, maxPack: 5, near: 170, gap: 3, hpFrac: 0.45, passGap: 6, belowHero: 2, checkMs: 1000, castMs: 3200, radius: 34, levelUp: 3, lifeMs: 90000, cooldownMs: 45000, maxDemons: 6 },
};
/** Bone Demon's Hellfire Stomp: a telegraphed blast of fire around it. */
export const DEMON = {
  stomp: { everyMs: 6500, windupMs: 800, range: 60, radius: 58, dmgMult: 1.3, knockback: 2.2 },
  /**
   * Bone Harvest (Murat): it rips apart a skeleton within `range` px and wears its bones, up to `max` pieces
   * (1-2 armour: shoulder plates and a rib cuirass, 3-4 a bone blade and a spiked crown). Each piece cuts the
   * damage it takes by `armorPer` and adds `dmgPer` to its blows. Tearing one apart takes `ripMs` (it stands still:
   * grab, lift, snap it in two, strap the piece on); the piece is worn at `equipMs`.
   */
  harvest: { everyMs: 5000, range: 90, max: 4, armorPer: 0.1, dmgPer: 0.12, ripMs: 2500, equipMs: 1950 },
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
  venomblob: "blob", frostblob: "blob", fireblob: "blob", stormblob: "blob",
  skeleton: "undead", skeletonmage: "undead", necromancer: "undead", crawler: "undead", demon: "undead",
  bandit: "outlaw", banditchief: "outlaw",
  sanddead: "undead",
  // Act 3: the Ossuary Host (the bog hags are living witches in its pay: no side)
  wight: "undead", bonehound: "undead", mistwraith: "undead", legionary: "undead", cairnlord: "undead", barrowking: "undead",
  // Act 4: the Redfang clan and its dogs (the vultures and the rattlers take no side)
  outrider: "outlaw", crossbowman: "outlaw", firebrand: "outlaw", warhound: "outlaw", redcaptain: "outlaw", rourke: "outlaw",
};

/**
 * Blob merging (Murat): a blob in danger (hurt, or facing several heroes) calls the blobs around it, and they
 * melt into one big blob. Levels, HP and abilities (shoot, charge, heal) add up. At most 5 blobs merge into a
 * blob below Lv 10, up to 10 into a higher one. Only blobs of Lv 4+ merge (Murat 2026-11-03), except near a
 * hero whose quest step is to watch a blob call for help (the first quest, in a Lv 1-3 zone).
 */
export const MERGE = {
  hpFrac: 0.5, // "in danger" below this fraction of HP...
  crowd: 2, crowdRange: 80, // ...or with this many heroes this close
  callRange: 130, callEveryMs: 5000, // px around it that hear the call, and how often it may call
  speedMult: 1.5, touch: 10, // callers rush in and fuse on contact (px)
  capLow: 5, capHigh: 10, highLevel: 10,
  minLevel: 4, // blobs below this level neither call for help nor answer a call
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

/**
 * Elemental blobs (Murat 2026-11-05), each with one move that is painted on the ground before it lands. Distances in px,
 * damage as a multiple of the blob's own (levelled) damage.
 * Venom Blob: hangs back and splurts a glob of poison at you; where it lands a puddle stays and poisons whoever stands in it.
 * Frost Blob: when you come close it swells and lets off a Frost Nova, a ring of ice that chills (slows) everyone in it.
 * Fire Blob: rears back and breathes a cone of fire like a dragon; it can set you alight.
 * Storm Blob: quick and twitchy; every time it is hit it throws off sparks that crackle on the ground for a moment.
 * A merged blob that swallowed one of them keeps its move (TownRoom.elemSpecial).
 */
export const ELEM_BLOB = {
  splurt: { range: 120, keepAway: 55, windupMs: 550, flightMs: 650, cooldownMs: 3200, dmgMult: 0.9, puddle: { radius: 20, ms: 4000, tickMs: 500, dmgMult: 0.3 } },
  nova: { range: 46, radius: 60, windupMs: 800, cooldownMs: 6500, dmgMult: 1.5, slowMs: 1800 },
  breath: { range: 72, reach: 82, halfAngle: 0.5, windupMs: 750, cooldownMs: 5500, dmgMult: 1.7, burn: { ticks: 3, tickMs: 500, dmgMult: 0.25 } },
  sparks: { everyMs: 800, count: 3, spread: 42, radius: 11, ms: 2400, tickMs: 450, dmgMult: 0.55, max: 9 },
};
/** Which move each elemental blob kind brings (a merged blob gets the moves of every elemental blob inside it). */
export const ELEM_MOVE: Partial<Record<MobKind, "splurt" | "nova" | "breath" | "sparks" | "firepot">> = { venomblob: "splurt", frostblob: "nova", fireblob: "breath", stormblob: "sparks",
  firebrand: "firepot" }; // Act 4: the Redfang Firebrand's fire pots (BADLANDS_AI.firepot), thrown and landing like the Venom Blob's splurt

/** Mother Blob brood: every few seconds (random) she may bud a blobling, up to `perMother` alive at once. */
export const BROOD = { minMs: 5000, maxMs: 12000, perMother: 4, worldCap: 160 };
/** How a monster's level scales its base stats (level 1 = the MOBS numbers). */
// Balance pass 2026-11-04 (tools/balance/pve.ts): monsters kept up with heroes' gear and skills (was hp 0.3, damage 0.12, xp 0.25)
export const MOB_LEVEL = { hp: 0.45, damage: 0.25, xp: 0.3, gold: 0.2 }; // +x per level above 1
export function mobScale(level: number, stat: keyof typeof MOB_LEVEL): number {
  return 1 + MOB_LEVEL[stat] * (Math.max(1, level) - 1);
}

/**
 * Level ceilings of the starting region (Oakvale, the first zone: Lv 1-30), Murat 2026-11-04: regular monsters
 * top out at Lv 25 (the quests end around Lv 19-24), while merged blobs, Bone Demons, elites and bosses may reach
 * Lv 30. The hero cap is higher (MAX_LEVEL in classes.ts, Lv 50): the rest is earned in Act 2 (ACT2_LEVEL).
 */
export const REGION_LEVEL = { mob: 25, special: 30 };
/** A regular monster's level, held under the region's ceiling. */
export const regionMobLevel = (l: number) => Math.min(REGION_LEVEL.mob, Math.max(1, Math.round(l)));
/** A merged blob, demon, elite or boss: its own, higher ceiling. */
export const regionSpecialLevel = (l: number) => Math.min(REGION_LEVEL.special, Math.max(1, Math.round(l)));
/** Act 2, the desert (Murat 2026-11-08): Lv 30-50. Regular monsters Lv 30-47, elites and bosses up to Lv 50. */
export const ACT2_LEVEL = { min: 30, mob: 47, special: 50 };
export const act2MobLevel = (l: number) => Math.min(ACT2_LEVEL.mob, Math.max(ACT2_LEVEL.min, Math.round(l)));
export const act2SpecialLevel = (l: number) => Math.min(ACT2_LEVEL.special, Math.max(ACT2_LEVEL.min, Math.round(l)));
/**
 * Act 3, the Grey Barrow Moors: Lv 20-35, open from hero Lv 20 (shared/act2.ts moorsOpen). Regular monsters Lv 20-33,
 * a level every `tilesPerLevel` tiles away from the moorgate (shared/spawns.ts baseLevelAt).
 */
export const MOORS_LEVEL = { min: 20, mob: 33, special: 35, tilesPerLevel: 10 };
export const moorsMobLevel = (l: number) => Math.min(MOORS_LEVEL.mob, Math.max(MOORS_LEVEL.min, Math.round(l)));
export const moorsSpecialLevel = (l: number) => Math.min(MOORS_LEVEL.special, Math.max(MOORS_LEVEL.min, Math.round(l)));
/**
 * Act 4, the Red Badlands: Lv 25-40, open from hero Lv 25 (shared/act2.ts badlandsOpen). Regular monsters Lv 25-38, a
 * level every `tilesPerLevel` tiles west of the Red Pass's badlands side (the band's east edge) toward Fangrock, the
 * Redfang stronghold in the far west (shared/spawns.ts baseLevelAt).
 */
export const BADLANDS_LEVEL = { min: 25, mob: 38, special: 40, tilesPerLevel: 16 };
/**
 * Act 5, the Mawdeep Sinkholes: Lv 30-45, open from hero Lv 30 (the Sinkway, shared/act2.ts HOMELAND_GATES). Regular
 * monsters Lv 30-43, a level every `tilesPerLevel` tiles from the Sinkway's arrival (the band's north-west) toward
 * Hidehall, the Hide-Kin's seat in the far south-east (shared/spawns.ts baseLevelAt).
 */
export const SINKHOLES_LEVEL = { min: 30, mob: 43, special: 45, tilesPerLevel: 12 };
/**
 * Every act's level band in one table (min, regular ceiling, special ceiling), so a new homeland is one row here. Act 1
 * starts at Lv 1 (regionMobLevel); the others hold their monsters inside their own band.
 */
export const ACT_LEVEL: Record<Act, { min: number; mob: number; special: number }> = {
  1: { min: 1, ...REGION_LEVEL }, 2: ACT2_LEVEL, 3: MOORS_LEVEL, 4: BADLANDS_LEVEL, 5: SINKHOLES_LEVEL,
};
const actLevels = (act: number) => ACT_LEVEL[act as Act] ?? ACT_LEVEL[1];
/** A regular monster's level held to its act's band (act from actOfTile). */
export const actMobLevel = (act: number, l: number) => { const L = actLevels(act); return Math.min(L.mob, Math.max(L.min, Math.round(l))); };
/** A merged blob, demon, elite or boss: its act's special ceiling. */
export const actSpecialLevel = (act: number, l: number) => { const L = actLevels(act); return Math.min(L.special, Math.max(L.min, Math.round(l))); };

export const MOB_ATTACK_RANGE = 14; // px

/**
 * Ostrevar, the Hollow King: the first zone's final boss (Lv 30, summoned for the hero on the last step of the
 * Hollow Crown chain). Every move is marked on the ground first, so it can be dodged. Distances in px.
 * Crown Cleave: a wide sweep around him. Gloam Pools: green ooze wells up under the heroes near him, then bursts and
 * slows. Below `servants.hpFrac` he calls his servants (skeletons and blobs, the Pale Marshal's and the Gloam's).
 * Below `wrath.hpFrac` he grows faster and casts Crown's Wrath: a ring of ash all round him, only safe close to him.
 */
export const HOLLOW_KING = {
  cleave: { range: 40, radius: 58, windupMs: 850, cooldownMs: 6500, dmgMult: 1.6, knockback: 2.5 },
  pools: { range: 260, count: 3, spread: 46, radius: 34, windupMs: 1300, cooldownMs: 9000, dmgMult: 1.3, slowMs: 2500 },
  servants: { hpFrac: 0.6, everyMs: 22000, castMs: 1100, kinds: ["skeleton", "warriorblob", "skeleton", "shooterblob"] as MobKind[], max: 4, levelDrop: 6 },
  wrath: { hpFrac: 0.3, inner: 44, radius: 150, windupMs: 1600, cooldownMs: 12000, dmgMult: 2, speed: 1.25, cooldown: 0.8 },
};

/**
 * The beast-folk of the Mawdeep Warrens (Murat 2026-11-05: dark mixes of humans and animals, each attacking like the
 * animal it was sewn to). Every move is marked on the ground before it lands so it can be dodged. Distances in px,
 * damage as a multiple of the monster's own levelled damage. Server: TownRoom.beastSpecial, client: beastFx.ts.
 *
 * Gnawkin (rat): quick, in packs; its Plague Bite leaves a sickness that eats at you (poison over time).
 * Tuskborn (boar): paws the ground and Gores, a straight charge that throws whoever is in its way.
 * Silkwretch (spider): hangs back and spits Web where you stand: anyone caught is stuck fast for a moment; venom bite.
 * Duskwing (bat): Screech, a cone of sound that slows; Swoop, a dive onto you that drinks your blood to heal itself.
 * Gorehowl the Packlord (wolf, elite): Pounce onto a marked spot; Howl calls Gnawkin out of the dark and drives his kin wild; Rending Bite bleeds.
 * The Hornbrute (bull, elite): Stampede, a long charge it can turn once; Stomp, a ring that knocks back and stuns.
 * The Hide-Mother (bear, boss): Maul, a wide cleave; Roar, a ring that slows; below 60% she calls her brood; below 35%
 * she rages and brings the roof down (falling stones under the heroes).
 */
export type BeastMove = "gore" | "web" | "screech" | "swoop" | "pounce" | "howl" | "stampede" | "stomp" | "maul" | "roar" | "brood" | "rockfall" | "hook" | "gather"
  | "beam" | "flare" | "sunfall" | "zenith";
export const BEAST = {
  gore: { min: 34, max: 130, windupMs: 700, rushMs: 420, reach: 135, width: 14, cooldownMs: 6000, dmgMult: 1.7, knockback: 3 },
  web: { min: 40, max: 135, windupMs: 500, flightMs: 520, radius: 22, cooldownMs: 5200, rootMs: 1300, dmgMult: 0.6 },
  screech: { range: 70, reach: 84, halfAngle: 0.55, windupMs: 600, cooldownMs: 6500, dmgMult: 1.1, slowMs: 2200 },
  swoop: { min: 45, max: 140, windupMs: 450, rushMs: 320, cooldownMs: 5000, dmgMult: 1.4, heal: 0.6 },
  pounce: { min: 50, max: 150, windupMs: 650, rushMs: 380, radius: 30, cooldownMs: 6000, dmgMult: 1.8, knockback: 2 },
  howl: { everyMs: 18000, castMs: 900, range: 220, rallyMs: 8000, rallySpeed: 1.25, rallyDmg: 1.25, summon: ["gnawkin", "gnawkin"] as MobKind[], max: 4, levelDrop: 4 },
  stampede: { min: 40, max: 170, windupMs: 850, rushMs: 650, reach: 175, width: 20, cooldownMs: 8000, dmgMult: 2, knockback: 3.5 },
  stomp: { range: 42, radius: 62, windupMs: 800, cooldownMs: 7000, dmgMult: 1.4, knockback: 2.5, stunMs: 700 },
  maul: { range: 46, reach: 64, halfAngle: 0.9, windupMs: 800, cooldownMs: 5200, dmgMult: 1.7, knockback: 2.5 },
  roar: { range: 160, radius: 120, inner: 0, windupMs: 1100, cooldownMs: 11000, dmgMult: 0.8, slowMs: 3000 },
  brood: { hpFrac: 0.6, everyMs: 20000, castMs: 1000, kinds: ["gnawkin", "tuskborn", "gnawkin", "duskwing"] as MobKind[], max: 4, levelDrop: 4 },
  rockfall: { hpFrac: 0.35, range: 260, count: 4, spread: 50, radius: 26, windupMs: 1300, cooldownMs: 8000, dmgMult: 1.5, speed: 1.2, cooldown: 0.8 },
  /** The Hide-Mother's needle and gut: a hooked line flung at a hero out of reach that drags them to her (and bleeds them). */
  hook: { hpFrac: 0.7, min: 70, max: 230, windupMs: 750, flightMs: 300, cooldownMs: 9000, dmgMult: 0.9, stopAt: 34, pullSpeed: 520 },
  /** "Come home to Mother": she sews her living brood back into her own hide, healing for each one in reach. Kill them first. */
  gather: { hpFrac: 0.7, everyMs: 15000, castMs: 1800, range: 190, heal: 0.05 },
  // ---- the Sunwright (SUNWRIGHT): fire, all of it (the heroes' fire resistance cuts it)
  /** A lance of sunlight from her staff along a marked lane: step out of the lane. */
  beam: { min: 30, max: 250, windupMs: 900, reach: 270, width: 20, cooldownMs: 6500, dmgMult: 1.7, knockback: 1 },
  /** A flare bursts off her: a ring around her that throws heroes back. */
  flare: { range: 56, radius: 74, windupMs: 750, cooldownMs: 6000, dmgMult: 1.3, knockback: 3 },
  /** Drops of molten sun fall on the heroes (like the Hide-Mother's stones): more of them, and more often, as the Second Sun. */
  sunfall: { hpFrac: 1, range: 280, count: 3, spread: 54, radius: 28, windupMs: 1300, cooldownMs: 9000, dmgMult: 1.5 },
  /**
   * Zenith: she lifts the Furnace's light over the whole plateau. Only her own shadow is safe (stand right next to her),
   * and every adept of her choir still singing makes it burn hotter. Kill the choir, then hug the Sunwright.
   */
  zenith: { hpFrac: 0.65, everyMs: 21000, windupMs: 2400, radius: 230, inner: 44, dmgMult: 1.4, perAdept: 0.5 },
  /** Riders on a plain blow: the Gnawkin's plague and the Packlord's bleeding bite (ticks of damage after the hit). */
  plague: { ticks: 4, tickMs: 600, dmgMult: 0.25 },
  bleed: { ticks: 3, tickMs: 500, dmgMult: 0.35 },
  venom: { ticks: 3, tickMs: 600, dmgMult: 0.2 },
};
/** Moves of each beast (checked in this order: the first one ready and in range is used). */
export const BEAST_MOVES: Partial<Record<MobKind, BeastMove[]>> = {
  tuskborn: ["gore"],
  silkwretch: ["web"],
  duskwing: ["screech", "swoop"],
  packlord: ["howl", "pounce"],
  crowseer: ["screech"],
  gnasher: ["howl", "pounce"],
  weaver: ["brood", "web"],
  hornbrute: ["stomp", "stampede"],
  hidemother: ["rockfall", "gather", "brood", "hook", "roar", "maul"],
  // Act 2: the scorpion skitters at you in a straight rush; the camel-folk rear and stamp the ground
  scorpion: ["gore"],
  camelfolk: ["stomp"],
  sphinx: ["pounce"], // spreads its wings and drops onto you
  // the Sunwright: Zenith (when ready) before everything, then her choir, falling sun, the flare when crowded, the lance
  sunwright: ["zenith", "brood", "sunfall", "flare", "beam"],
  // Act 3: the legionary rushes behind its tower shield; the Cairn-Lord calls wights out of the mounds, stamps and cleaves;
  // the Barrow-King brings his barrow's roof down when badly hurt, calls his host, roars (slows) and cleaves
  legionary: ["gore"],
  cairnlord: ["brood", "stomp", "maul"],
  barrowking: ["rockfall", "brood", "roar", "maul"],
  // Act 4: vultures drop out of the sky onto you (and drink); warhounds leap at your throat; a Redfang Captain stamps and
  // cleaves (and cries war, BADLANDS_AI.warlords); Old Rourke leaps on you, cleaves, and roars (slows)
  vulture: ["swoop"],
  warhound: ["pounce"],
  redcaptain: ["stomp", "maul"],
  rourke: ["pounce", "roar", "maul"],
};
/** Damage over time after a plain blow (BEAST.plague / bleed / venom). */
/**
 * Grandam Ursk, the Hide-Mother (Murat 2026-11-08: "a proper final boss with a personality"): the trapper-wife who fed
 * the valley's starving hunters the Hide Rite in the Long Hunger and still thinks she saved them. She talks through the
 * fight. Three phases: the Mother (claws and roars), the Rite (below PHASE[0]: she calls her brood, hooks heroes in
 * with needle and gut and sews her children back into herself to heal), the Bear (below PHASE[1]: she tears off what is
 * left of the woman, grows, quickens and brings the roof down).
 */
export const URSK = {
  phase: [0.7, 0.35] as const,
  tauntMs: [11000, 17000] as const,
  bearScale: 1.18,
  lines: {
    wake: ["Who burns my totems?", "Ah. A little one, come all the way down to Mother.", "Lie still, child. You will make a fine hide."],
    taunt: ["I fed this valley when it ate its dogs.", "Skin is only a coat. I will give you a warmer one.", "My hunters were starving. I made them strong.",
      "Hush now. It only hurts while you are still you.", "Three hundred winters, and still they send me children."],
    rite: ["Children! Mother needs you!", "Needle and gut, needle and gut..."],
    hook: ["Come here.", "Closer, little one.", "Don't wriggle."],
    gather: ["Come home to Mother.", "Back into the hide with you."],
    bear: ["ENOUGH! No more woman. Only the bear!"],
    kill: ["There. Quiet now.", "Another hide for the bed.", "Sleep. Mother will sew you something better."],
    death: ["The winter... is it over, then...?"],
  },
};
/**
 * Ishael the Sunwright, High Veil of the Veiled Circle (Murat 2026-11-08: Act 2's storyline and final boss): the scholar
 * who read Kharsun's water-script and decided the first Furnace failed only for want of water. She means to light a second
 * sun over the Sunscar so no child ever freezes in a desert night again, and she is kind about it, which is the worst part.
 * Three phases: the Dawn (lance and flare), the Choir (below PHASE[0]: her adepts sing for her and Zenith begins), the
 * Second Sun (below PHASE[1]: she burns, grows, quickens, and the sun falls twice as often).
 */
export const SUNWRIGHT = {
  phase: [0.65, 0.3] as const,
  tauntMs: [11000, 17000] as const,
  sunScale: 1.15,
  /** As the Second Sun: faster, quicker blows, molten drops more often and more of them. */
  sun: { speed: 1.2, cooldown: 0.8, sunfallCd: 0.55, sunfallCount: 5 },
  lines: {
    wake: ["You came up the stair. Good. Someone should see this.", "A thousand years we waited for water enough. You brought it to me, in a way.",
      "Stand there, child of the cold north. It will be warm soon."],
    taunt: ["Kharsun burned because it was thirsty. I am not thirsty.", "No one will ever shiver in the dark again. Why do you fight that?",
      "Sefa's spring was a small price. She will thank me, when it is always noon.", "I read the water-script in my mother's lap. I understood it better than she did.",
      "Your Hollow King wanted a crown. I want a dawn."],
    choir: ["Sing, my Veiled! Sing it up!", "Choir! Lift the light!"],
    zenith: ["Look up.", "Noon.", "Let there be no shadow but mine."],
    sun: ["Then I will be the sun myself!"],
    kill: ["Rest. It is warm now.", "Another candle for the Furnace.", "Shh. Into the light."],
    death: ["The night... it is so cold... I only wanted..."],
  },
};
export const BEAST_RIDER: Partial<Record<MobKind, "plague" | "bleed" | "venom">> = { gnawkin: "plague", packlord: "bleed", silkwretch: "venom", hidemother: "bleed", gnasher: "plague", weaver: "venom", scorpion: "venom", bonehound: "bleed", boghag: "venom",
  warhound: "bleed", rattler: "venom" };
/** Who answers a beast's Brood or Howl (default BEAST.brood.kinds / BEAST.howl.summon). */
export const BEAST_BROOD: Partial<Record<MobKind, MobKind[]>> = { gnasher: ["gnawkin", "gnawkin", "gnawkin"], weaver: ["silkwretch", "silkwretch"], sunwright: ["veiled", "veiled", "veiled"],
  cairnlord: ["wight", "wight"], barrowking: ["wight", "legionary", "bonehound", "bonehound"] };
/**
 * Half-folk variants (Mob.weapon "folk", Murat 2026-11-05): a man's face under the flayed animal head, the body gone
 * over to the beast. Gnawkin bone-slingers throw stones from range; the rest fight like their kind.
 */
export const BEAST_FOLK: Partial<Record<MobKind, number>> = { gnawkin: 0.4, tuskborn: 0.35, silkwretch: 0.4, duskwing: 0.4, nomad: 0.35 }; // nomad "folk": a Dustrider archer
/** Act 2's monsters (the Sunscar): levels from ACT2_LEVEL. */
export const DESERT_KINDS: MobKind[] = ["nomad", "scorpion", "sanddead", "veiled", "camelfolk", "sphinx", "sunwright"];
/**
 * The moors' casters (server RANGED, pve.ts): the Bog Hag hangs back and spits green rot (poison, MOB_SHOT_ELEMENT), the
 * Mist Wraith drifts at the edge of sight and throws shards of grave-cold (cold). Distances in px.
 */
export const MOORS_AI = {
  hag: { range: 130, keepAway: 65, shotSpeed: 150, shotRadius: 3, mult: 1 },
  wraith: { range: 140, keepAway: 75, shotSpeed: 165, shotRadius: 3, mult: 1 },
};
/** Act 3's monsters (the Grey Barrow Moors): levels from MOORS_LEVEL. */
export const MOORS_KINDS: MobKind[] = ["wight", "boghag", "bonehound", "mistwraith", "legionary", "cairnlord", "barrowking"];
/**
 * The badlands' moves (server TownRoom, pve.ts). Distances in px, times in ms, damage as a multiple of the monster's own.
 * - crossbow: the Crossbowman's heavy bolt, slow to reload; perched on a tower (a camp lookout, shared/bandits.ts) it sees
 *   and shoots as far as a Redfang Hollow lookout.
 * - firepot: the Firebrand lobs a clay pot of burning cinnabar oil where you stand (marked first); it bursts and leaves
 *   the ground burning (a fire hazard like the Venom Blob's puddle).
 * - pack: a Warhound that is hit (or sees its prey) bays, and every warhound within `range` without a target runs in.
 * - warlords: war cries (the rallied hit and run like the Redfang Chief's men, shared/bandits.ts CHIEF.warCry): the
 *   Captain rallies the Redfang round him; Old Rourke rallies them and, once badly hurt, calls outriders out of the keep.
 */
export const BADLANDS_AI = {
  crossbow: { range: 150, keepAway: 65, shotSpeed: 230, shotRadius: 3, mult: 1.15 },
  firepot: { range: 135, keepAway: 70, windupMs: 650, flightMs: 700, cooldownMs: 3600, dmgMult: 1.1, burn: { radius: 24, ms: 4500, tickMs: 500, dmgMult: 0.32 } },
  pack: { range: 8 * 32, cooldownMs: 6000 },
  warlords: {
    redcaptain: { cooldownMs: 20000, range: 10 * 32, buffMs: 9000 },
    rourke: { cooldownMs: 20000, range: 14 * 32, buffMs: 10000, reinforce: { hpFrac: 0.5, count: 3, kind: "outrider" as MobKind } },
  } as Partial<Record<MobKind, { cooldownMs: number; range: number; buffMs: number; reinforce?: { hpFrac: number; count: number; kind: MobKind } }>>,
};
/** Act 4's monsters (the Red Badlands): levels from BADLANDS_LEVEL. */
export const BADLANDS_KINDS: MobKind[] = ["outrider", "crossbowman", "firebrand", "warhound", "vulture", "rattler", "redcaptain", "rourke"];
/** The Redfang clan's own (the badlands' men and dogs): they answer the horn and their captains' war cries. */
export const REDFANG_KINDS: MobKind[] = ["outrider", "crossbowman", "firebrand", "warhound", "redcaptain", "rourke"];
/** Beast-folk that fly (drawn hovering, client textures.ts). */
export const BEAST_FLYERS: MobKind[] = ["duskwing", "crowseer", "vulture"];
export const BEAST_KINDS: MobKind[] = ["gnawkin", "tuskborn", "silkwretch", "duskwing", "packlord", "hornbrute", "hidemother", "crowseer", "gnasher", "weaver"];
