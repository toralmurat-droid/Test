import type { IncomingMessage } from "node:http";
import { Client, Room } from "colyseus";
import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import {
  AGGRO, aggroLevelFactor, BLOB_AI, BONES, DEMON, BROOD, Dir, FACTION, FEUD, MERGE, MobDef, MOTHER, SKELETON_AI, HIT_RADIUS, mobScale, regionMobLevel, regionSpecialLevel, InputState, MOB_ATTACK_RANGE, MOBS, MobKind, rollSkeletonWeapon, SKELETON_BOW, SKELETON_WEAPONS, SkeletonWeapon, REGEN_DELAY_MS, REGEN_RAMP_MS, regenFromStamina, SAFE_REGEN_MULT,
  RESPAWN_MS, TICK_RATE, TILE,
  HOLLOW_KING, ELEM_BLOB, ELEM_MOVE,
} from "../shared/constants";
import {
  ATTACK_VARIANTS, CLASSES, ClassKind, COMBO_WINDOW_MS, DODGE, EMOTES, ENERGY, staminaRegen, DASH_INVULN_MS, GUARD_REDUCTION, isClassKind, levelFromXp, MAX_XP, capLevel, PVP_KILL_XP, xpForLevel,
} from "../shared/classes";
import { MANA_POTION_DROP, manaRegen, maxManaFor, packMana, pay } from "../shared/mana";
import { Counts, dropSize, Potions, nextSize, noPotions, packPotions, potionAmount, potionName, PotionKind, potionSlots, POTION_COOLDOWN_MS, slotsAfter, SIZES, total } from "../shared/potions";
/** Potion size from a ground item's `gear` field ("0".."2"). */
const potSize = (g: string) => Math.max(0, Math.min(SIZES - 1, Math.floor(Number(g) || 0)));
import { attackMult, cooldownMult, critChance, heroSpeed, magicMult, maxHpFromStats, SLOW_MOB, statsFor, statPoints } from "../shared/powers";
import { AttackProfile, attackProfile, weaponAttackMult, weaponOk } from "../shared/weapons";
import { Element, ElemPart, ELEMENT_FX, mobAffinity, MOB_MELEE_ELEMENT, MOB_SHOT_ELEMENT } from "../shared/elements";
import { gearResist, splitHit } from "../shared/gear";
import { activeSkills, canLearn, classSkills, cleanRanks, MAX_RANK, NEED_TEXT, skillLearned, skillOf, talentBonus, talentMult, talentReduce } from "../shared/skills";
import {
  afterHit, atkSpeedMult, blocking, buffLifesteal, buffRegen, castSkill, ccImmune, charging, winding, counterHit, dealtMult, FieldInst, newRuntime,
  imbueOf, shotEnd, shotHit, shotPulse, ShotSpec, SkillHost, speedMult, statusOf, takenMult, tickField, tickUnit, Unit,
} from "../shared/skillEngine";
import {
  ITEM_LIFETIME_MS, ItemKind, LOOT, PICKUP_RADIUS, PVP_GOLD_DROP,
} from "../shared/items";
import { isSafeZone, isSolidAt, randomSpawn, VILLAGE } from "../shared/map";
import { isDecorSolidAt, npcById, npcNear, TALK_RANGE } from "../shared/npcs";
import { beyondWall, WATCH, WATCH_POSTS, WatchPost } from "../shared/watch";
import { inVillage, WRATH } from "../shared/wrath";
import { sellPrice, SHOPS } from "../shared/shops";
import { BLOB_KINDS, CHAINS, CROWN_CHAIN, packQuest, chainOpen, chainState, inZone, isBlob, npcPresent, QuestState, questStep, stepGoal, Summon, TUT_CHAIN, TUT_QUESTS, USE_RANGE } from "../shared/quests";
import { findHideSpot, HIDE, MOTHER_KEEP_OUT, noMobsAt, spawnPoint, SPAWN_ZONES, villageDist, zoneCap } from "../shared/spawns";
import { moveStep } from "../shared/movement";
import { SLOTS_BY_ZONE, WORK_SLOTS } from "../shared/siege";
import { DAY_CYCLE_MS, dayFrac, isUndeadNight, NIGHT_BOSSES, UNDEAD_NIGHT } from "../shared/daynight";
import { BANDIT_AI, BANDIT_ROLES, CAMP_POSTS, CHIEF, clearWalk, findPath, postPos, roleOf } from "../shared/bandits";
import { flush, HeroSave, loadHero, loadStash, login, markChest, openedChests, resetChests, saveHero, saveStash } from "./accounts";
import { offerFrom, Offer, settle, STASH, STASH_GOLD_MAX, STASH_RANGE, STASH_SIZE, TRADE } from "../shared/trade";
import { arrivalOf, cleanPortals, PORTAL_COMBAT_MS, PORTAL_RANGE, PORTAL_WAKE_RANGE, portalById, PORTALS } from "../shared/portals";
import { rollBoon, shrineXp, SHRINE, SHRINE_COOLDOWN_MS, SHRINE_RANGE, WIND_BLESSING, WIND_BLESSING_ID } from "../shared/shrine";
import { chestById, chestLock, CHEST_RANGE, CHEST_RESPAWN_MS, CHESTS, GUARD_RESPAWN_MS, rollChest } from "../shared/chests";
import { encodeTimers, timerSig, timersOf } from "../shared/buffTimers";
import { SLOT_COUNT } from "../shared/slots";
import { groupDmgMult, groupHpMult, PARTY, together } from "../shared/party";
import { heroPoise, MOB_COMBAT, mobBody, POISE, poiseLevelMult, poiseSpeed, pvpDamageMult, SWING_AHEAD } from "../shared/combat";
import {
  BAG_SIZE, Equipped, gearDef, GEAR_SLOTS, activeGear, reqProblem, itemLevel, HeroReqInfo, GearSlot, gearBlock, gearName, gearReachMult, gearSpeedMult, gearStats, isGearId, potionChance, rollGear, canWear, starterKit,
} from "../shared/gear";
/** "Frost Katana Lv 17" for pickup messages. */
/** Hit direction for the client's flinch nudge (unit vector, 1 decimal), or undefined when there is no push. */
const hitDir = (push: [number, number]) => {
  const l = Math.hypot(push[0], push[1]);
  return l > 0 ? { kx: Math.round((push[0] / l) * 10) / 10, ky: Math.round((push[1] / l) * 10) / 10 } : {};
};
const lvlName = (id: string, cls: string) => `${gearName(id, cls)}${itemLevel(id) > 1 ? ` Lv ${itemLevel(id)}` : ""}`;
import { Asker, boardFor, submit, tick as ideaTick, vote as ideaVote } from "../shared/ideas";
import { hashAddr, ideaLog, saveIdeas } from "./ideaStore";

export class Player extends Schema {
  @type("string") name = "";
  @type("string") cls: ClassKind = "knight";
  @type("number") color = 0xffffff;
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("string") dir: Dir = "down";
  // Aim: unit vector of the last movement direction, diagonals included (attacks and shots go this way)
  @type("float32") ax = 0;
  aimDist = -1; // not synced: px to the spot last clicked with "face" (point skills read it once)
  @type("float32") ay = 1;
  @type("boolean") moving = false;
  @type("number") hp = 100;
  @type("number") maxHp = 100;
  @type("boolean") dead = false;
  @type("boolean") guarding = false; // knight shield up
  @type("number") kills = 0;
  @type("number") xp = 0;
  @type("number") level = 1;
  @type("string") emote = ""; // current emote animation ("" = none)
  @type("boolean") outlaw = false; // cast a skill inside Oakvale: the village attacks until they leave (shared/wrath.ts)
  @type("number") combo = 0; // which hit of the 3-hit combo was thrown last (0..2)
  @type("number") gold = 0;
  // Healing and mana potions by size (shared/potions.ts), packed in one synced number (packPotions); `pots` is the server copy
  @type("number") potions = 0;
  pots: Potions = noPotions();
  @type("number") seq = 0; // last processed input sequence (for client reconciliation)
  // Stats, auto-allocated on level up (see shared/powers.ts)
  @type("number") sta = 0;
  @type("number") str = 0;
  @type("number") mag = 0;
  @type("number") dex = 0; // Dexterity: critical hit chance
  // Stat points the player assigned in the hero panel (shared/powers.ts statPoints)
  @type("number") ptSta = 0;
  @type("number") ptStr = 0;
  @type("number") ptMag = 0;
  @type("number") ptDex = 0;
  @type("boolean") stunned = false;
  @type("boolean") slowed = false;
  // Mana (shared/mana.ts): current, max and mana potions packed in one synced number (packMana), because the schema is at
  // the 64-field limit. Took the old `raging` flag's place (the client reads Rage from `fx`). Server-side values below.
  @type("number") mp = 0;
  mana = 0;
  maxMana = 0;
  lastManaPotion = 0;
  @type("boolean") rolling = false; // dodge roll in progress
  @type("boolean") broken = false; // poise broken: dizzy, can't attack (shared/combat.ts)
  @type("number") energy = 100; // Stamina (ENERGY in shared/classes.ts); spells spend mana (above)
  // Skills (shared/skillEngine.ts): stacks built by basic hits, speed multiplier from buffs and passives (client
  // prediction), and status words for the effects on screen (burn, mark, active auras and enchantments...)
  @type("number") stacks = 0;
  @type("number") spd = 1;
  @type("string") fx = "";
  // Timed buffs/debuffs with ms left for the HUD buff row (shared/buffTimers.ts), rewritten only when they change
  @type("string") timers = "";
  timerSig = "";
  timerSeq = 0;
  @type("string") party = ""; // player group id ("" = solo); shared/party.ts
  // Equipment (shared/gear.ts): equipped item ids ("" = empty) and the unequipped items carried.
  // Each slot must stay a synced @type field, or the client never sees it (the sword vanished from the menu).
  @type("string") weapon = "";
  @type("string") armour = "";
  @type("string") shoes = "";
  @type("string") hat = "";
  @type("string") shield = "";
  @type("string") ranged = ""; // secondary ranged weapon, fired with R
  @type(["string"]) bag = new ArraySchema<string>();
  // Skill tree (shared/talents.ts): ranks per talent id
  @type({ map: "number" }) talents = new MapSchema<number>();
  // Blob quest chain (shared/quests.ts): quest index, step (0 = not accepted) and progress on the step
  @type("number") questId = 0;
  @type("number") questStage = 0;
  @type("number") questCount = 0;
  // Skeleton quest chain (the Pale Marshal), run beside the blob chain: same meaning, CHAINS[1]
  @type("number") boneId = 0;
  @type("number") boneStage = 0;
  @type("number") boneCount = 0;
  // Redfang chain (Old Garrick of Saltmere), CHAINS[2]
  @type("number") redId = 0;
  @type("number") redStage = 0;
  @type("number") redCount = 0;
  // The guided first quest (First Steps), CHAINS[3] (TUT_CHAIN). New heroes start on step 1.
  @type("number") tutId = 0;
  @type("number") tutStage = 0;
  @type("number") tutCount = 0;
  // The Hollow Crown (CHAINS[4], the first zone's last story): id, stage and count packed in one number (QuestChain.packed),
  // because the Player schema is at Colyseus's 64-field limit. This is the 64th: a new synced field needs one packed too.
  @type("number") crown = 0;
  nextSummon = 0; // when the server may bring back this player's quest fused blob (QuestStep.summon)
  // Skill slots on keys 1..0 (shared/slots.ts): a skill id or "" (empty). Empty until the player assigns them.
  @type(["string"]) slots = new ArraySchema<string>(...Array(SLOT_COUNT).fill(""));

  input: InputState = { up: false, down: false, left: false, right: false };
  lastAttack = 0;
  portals = new Set<string>(); // portal stones this hero has woken (shared/portals.ts; saved, never synced)
  lastSpecial = -Infinity;
  // Hidden initiative / poise (shared/combat.ts)
  poiseLost = 0;
  lastPoiseHit = 0;
  brokenUntil = 0;
  steadyUntil = 0;
  guardUntil = 0;
  invulnUntil = 0;
  rollUntil = 0;
  rollInput: InputState = { up: false, down: false, left: false, right: false };
  lastDodge = -Infinity;
  lastRanged = -Infinity;
  lastWeaponNo = 0; // last "needs a bow" message (throttle)
  lastHurt = 0;
  wrathNext = 0; // next townsfolk blow on an outlaw
  lastPotion = 0;
  attackReadyAt = 0;
  lastVariant = -1;
  stunUntil = 0;
  slowUntil = 0;
  lastUlt = -Infinity;
  sk = newRuntime();
}

export class Mob extends Schema {
  @type("string") kind: MobKind = "slime";
  @type("number") level = 1;
  @type("string") weapon = ""; // skeletons: sword, axe, spear or bow (SKELETON_WEAPONS)
  @type("boolean") hidden = false; // tucked into a grave/tree: untouchable, only its eyes show
  @type("number") bones = 0; // Bone Demon: skeleton pieces it wears (DEMON.harvest), the client shows its sheet wearing them (mob_demon1..4)
  @type("number") merged = 1; // blobs inside this one (MERGE): the client draws it bigger
  @type("string") guard = ""; // id of the loot chest it guards (shared/chests.ts): the chest stays locked while it lives
  @type("string") work = ""; // skeleton at the siege works (shared/siege.ts): hammer, saw, haul, carry (with a plank), fetch (going for one)
  @type("number") job = -1; // its WORK_SLOTS index (-1: no job); the client reads it to know where it works
  @type("string") parts = ""; // kinds of the blobs swallowed, comma-separated: the client paints their colours, eyes and mouths on it
  summonFor = ""; // quest monster (QuestStep.summon): session id of the player it was spawned for
  summonChain = 0; // ...and the quest chain of that step
  @type("string") title = ""; // quest boss name shown over it instead of "Elite" (QuestStep.summon.title)
  mergeInto = ""; // answering a call: id of the blob it is rushing to fuse with
  mergeCap = 0; // most blobs this one may hold (set at its first call)
  canShoot = false; canCharge = false; canHeal = false; // abilities picked up by merging
  nextCall = 0; nextShot = 0;
  foe = ""; // blob vs undead feud (FEUD): the monster it is fighting
  riteX = NaN; riteY = 0; // BONES.ritual: the point of the star this skeleton walks to before it throws itself in
  ritual = false; banishAt = 0; nextStomp = 0; nextHarvest = 0; nextToss = 0; // BONES.ritual: given to a demon summoning; demon: when it goes back, next Hellfire Stomp
  leg = 0; restUntil = 0; // carriers: 0 = taking a plank to the engine, 1 = going back to the yard; pause at each end
  hist: number[] = []; // not synced: recent [time, x, y] samples, so a hero's swing can be judged where the monster was on their screen (REWIND_MS)
  dozeSlot = -1; lastTick = 0; dozy = false; // server tick bookkeeping for dozing monsters (TownRoom.dozing)
  flankA = NaN; // BONES: side of the hero this skeleton closes in from (NaN = straight at him)
  hateId = ""; hate = 0; nextAggro = 0; threat = 0; // AGGRO: who hit it last and how much it hates them; level gap of the scariest hero near

  spot = ""; // hiding spot (tile "x,y") it is heading to or sitting in
  spotX = 0; spotY = 0; outX = 0; outY = 0; // spot centre, and the walkable tile it steps in/out from
  seekUntil = 0; // give up reaching the spot after this
  hideUntil = 0; // leaves the spot on its own after this
  fleeing = false; // dizzy and running for cover
  chargeUntil = 0; nextCharge = 0; // warrior blob lunge
  nextHeal = 0; // healer blob
  specialKind = ""; specialAt = 0; nextBounce = 0; nextSlam = 0; // mother blob special moves (necromancer casts too)
  nextRaise = 0; nextCircle = 0; castX = 0; castY = 0; // necromancer: raise dead, Death Circle aim
  pools: [number, number][] = []; // the Hollow King's Gloam Pools waiting to burst (HOLLOW_KING.pools)
  nextSplurt = 0; nextNova = 0; nextBreath = 0; nextSparks = 0; aimX = 0; aimY = 1; // elemental blob moves (ELEM_BLOB)
  servant = false; // called up by the Hollow King: fights for him, never starts a bone ritual
  // Redfang Hollow bandits (shared/bandits.ts): camp member, its post (CAMP_POSTS index), patrol progress, horn alert
  camp = false; post = -1; perch = false; pLeg = 0; pDir = 1; stuckSince = 0; detourUntil = 0;
  alertUntil = 0; alertHero = ""; nextHorn = 0; nextVolley = 0; rallyUntil = 0; chargeMult = 1; dashHit = false; reinforced = false;
  nextSweep = 0; nextLeap = 0; nextCry = 0;
  path: [number, number][] = []; pathAt = 0; pathTX = 0; pathTY = 0; // the way round walls (gates), see seek
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("string") dir: Dir = "down";
  @type("boolean") moving = false;
  @type("number") hp = 0;
  @type("number") maxHp = 0;
  @type("boolean") dead = false;
  @type("boolean") stunned = false;
  @type("boolean") slowed = false;
  @type("boolean") broken = false; // poise broken: dizzy, runs away (shared/combat.ts)
  @type("boolean") winding = false; // winding up an attack (telegraph)
  @type("string") fx = ""; // skill effects on it (burn, mark, weak), see Player.fx
  sk = newRuntime();

  stunUntil = 0;
  slowUntil = 0;
  poiseLost = 0;
  lastPoiseHit = 0;
  brokenUntil = 0;
  steadyUntil = 0;
  windUntil = 0;
  zone = 0; // index into SPAWN_ZONES (-1 for bloblings, which belong to their mother, not a zone)
  mother = ""; // bloblings: id of the Mother Blob that budded them
  nextBrood = 0; // Mother Blob: when she next tries to bud a blobling
  homeX = 0;
  homeY = 0;
  target = ""; // player session id being chased
  wander: InputState = { up: false, down: false, left: false, right: false };
  nextWander = 0;
  lastAttack = 0;
}

export class Projectile extends Schema {
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("string") dir: Dir = "down";
  @type("float32") vx = 0; // flight direction (unit vector, may be diagonal)
  @type("float32") vy = 1;
  @type("string") owner = "";
  @type("number") size = 1; // visual scale (combo finisher fireballs are bigger)
  @type("string") kind = "fireball"; // "fireball" | "arrow" (client picks the visual)
  @type("string") imb = ""; // FxStyle of the enchantment it carries (Fire Arrows: "fire"), "" = none

  knockback = 1;
  basic = false; // a basic attack (builds stacks, carries enchantments)
  spec?: ShotSpec; // a skill projectile (shared/skillEngine.ts)
  pierce = 0; // extra targets it can pass through
  mobLevel = 0; // > 0: a monster's shot (only hurts players); its level, kept even if the shooter dies mid-flight
  mobName = "";
  mobEl?: Element; // a monster's magic shot element (MOB_SHOT_ELEMENT)
  parts?: ElemPart[]; // a hero's elemental share (basic attacks)
  hitIds = new Set<string>();
  traveled = 0;
  pulsed = 0; // distance at the last pulse (ShotSpec.pulse)
  speed = 0;
  range = 0;
  radius = 0;
  damage = 0;
}

export class Item extends Schema {
  @type("string") kind: ItemKind = "gold";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") amount = 1;
  @type("string") gear = ""; // kind "gear": the item id; kind "quest": the quest item id (shared/quests.ts QUEST_ITEMS)
  @type("string") owner = ""; // kind "quest": only this player sees and picks it up

  expires = 0;
}

/** Live status of a monster spawn zone (see shared/spawns.ts). */
export class Zone extends Schema {
  @type("string") name = "";
  @type("number") alive = 0;
  @type("number") cap = 0;
  @type("number") nextIn = 0; // seconds until the next monster respawns (0 = zone is full)

  nextAt = 0; // server time of the next respawn, 0 when full
}

/** A skill's ground effect (Consecration, Blizzard, traps, auras that follow a hero...). shared/skillEngine.ts runs it. */
export class Field extends Schema {
  @type("string") kind = "";
  @type("string") skill = "";
  @type("string") owner = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") r = 0;
  @type("number") ms = 0; // total length
  @type("boolean") follow = false;
  inst!: FieldInst;
}

/** A watchman of the village gate (shared/watch.ts). Can't be hurt; the client plays his walk/idle/thrust. */
export class Watchman extends Schema {
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("boolean") moving = false;
  @type("float32") ax = 0; // facing (world vector)
  @type("float32") ay = 1;
  @type("number") swing = 0; // bumped on every spear thrust

  post!: WatchPost;
  target = ""; // monster id he is fighting
  foe = ""; // outlaw hero he is hunting (shared/wrath.ts), before any monster
  nextLook = 0; nextHit = 0; strikeAt = 0;
  crossing = false; // walking through the gate opening
  stuckSince = 0; // when he last stopped making progress
  ignore = ""; ignoreUntil = 0; // a monster he couldn't reach
}

export class TownState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Mob }) mobs = new MapSchema<Mob>();
  @type({ map: Projectile }) projectiles = new MapSchema<Projectile>();
  @type({ map: Item }) items = new MapSchema<Item>();
  @type({ map: Zone }) zones = new MapSchema<Zone>();
  @type({ map: Field }) fields = new MapSchema<Field>();
  @type({ map: Watchman }) watch = new MapSchema<Watchman>();
}

/** Extra effects of a hit. */
interface HitOpts {
  atkLevel?: number; kb?: number; stunMs?: number; slowMs?: number; crit?: boolean; skill?: boolean;
  basic?: boolean; dot?: boolean; thorn?: boolean; burn?: [number, number]; markMs?: number; weakMs?: number; fearMs?: number;
  from?: string; // attacker id (hero or monster), for counters and thorns
  wrath?: boolean; // the village punishing an outlaw: lands even on the safe square
  parts?: ElemPart[]; // a hero's elemental damage on top of the (physical) dmg (shared/elements.ts)
  el?: Element; // the element the hit shows as (damage number colour)
  mobEl?: Element; // a monster's elemental attack: the hero's resistance cuts it
}

const COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1];
const STILL: InputState = { up: false, down: false, left: false, right: false };
const DIR_OFFSET: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const pushInput = (o: [number, number]): InputState => ({ up: o[1] < 0, down: o[1] > 0, left: o[0] < 0, right: o[0] > 0 });

/** Unit vector of the keys held (diagonals included), or null when not moving. */
function aimFromInput(i: InputState): [number, number] | null {
  const x = (i.right ? 1 : 0) - (i.left ? 1 : 0), y = (i.down ? 1 : 0) - (i.up ? 1 : 0);
  if (!x && !y) return null;
  const l = Math.hypot(x, y);
  return [x / l, y / l];
}

/** Where a hero attacks: the keys held right now, else the last direction they moved. */
function aimOf(p: Player): [number, number] {
  const a = !p.rolling && aimFromInput(p.input);
  if (a) { p.ax = a[0]; p.ay = a[1]; }
  return [p.ax, p.ay];
}

type Poised = { poiseLost: number; lastPoiseHit: number; brokenUntil: number; steadyUntil: number; broken: boolean; dead: boolean };

const mobPoiseMax = (m: Mob) => MOB_COMBAT[m.kind].poise * mobScale(m.level, "hp") * (m.kind === "bandit" ? BANDIT_ROLES[roleOf(m.weapon)].poise : 1);
const heroPoiseMax = (p: Player) => heroPoise(p.cls, p.level);

/** Recover poise over time; end the broken state (poise refills and the target is steady for a moment). */
function tickPoise(t: Poised, max: number, dt: number, now: number) {
  if (t.dead) { t.poiseLost = 0; t.broken = false; t.brokenUntil = 0; return; }
  if (t.broken) {
    if (now < t.brokenUntil) return;
    t.broken = false; t.poiseLost = 0; t.steadyUntil = now + POISE.steadyMs;
    return;
  }
  if (t.poiseLost > 0 && now - t.lastPoiseHit >= POISE.regenDelayMs) t.poiseLost = Math.max(0, t.poiseLost - max * POISE.regenPerSec * dt);
}

/** Attack speed multiplier from current poise. */
/** Drain poise; returns true when this hit breaks the target. Steady or already broken targets ignore it. */
function drainPoise(t: Poised, max: number, amount: number, now: number, brokenMs: number): boolean {
  if (amount <= 0 || t.broken || now < t.steadyUntil) return false;
  t.poiseLost += amount;
  t.lastPoiseHit = now;
  if (t.poiseLost < max) return false;
  t.poiseLost = max; t.broken = true; t.brokenUntil = now + brokenMs;
  return true;
}

const poiseFrac = (t: Poised, max: number) => (t.broken ? 0 : Math.max(0, 1 - t.poiseLost / max));

/**
 * Replace the whole bag instead of editing it in place: several in-place edits of an ArraySchema in one patch
 * (e.g. a double-click sending two swaps) desync the client copy and showed the same item in several cells.
 */
const bagItems = (p: Player): string[] => p.bag.toArray().filter((g): g is string => !!g);

function setBag(p: Player, items: string[]) {
  p.bag = new ArraySchema<string>(...items);
}

function dirFromInput(i: InputState, fallback: Dir): Dir {
  if (i.left) return "left";
  if (i.right) return "right";
  if (i.up) return "up";
  if (i.down) return "down";
  return fallback;
}

/** Input that walks from (x,y) toward (tx,ty). */
function toward(x: number, y: number, tx: number, ty: number): InputState {
  const dx = tx - x, dy = ty - y;
  return { right: dx > 2, left: dx < -2, down: dy > 2, up: dy < -2 };
}

const FEUD_CELL = 128; // px, >= FEUD.range
const BOOT = Date.now();
/** Time of day on the server (the wall clock, like every client); DAY_TIME=day|night|0..1 forces it for local tests. */
function worldDayFrac(now: number): number {
  const f = process.env.DAY_TIME;
  if (f === "night") return 0.8;
  if (f === "day") return 0.3;
  if (f && !isNaN(Number(f))) return (Number(f) + (now - BOOT) / DAY_CYCLE_MS) % 1;
  return dayFrac(now);
}
/** Spawn zones of the dead (every kind in them is undead): they keep the night (shared/daynight.ts). */
const UNDEAD_ZONES = new Set(SPAWN_ZONES.flatMap((z, zi) => (Object.keys(z.mobs) as MobKind[]).every((k) => FACTION[k] === "undead") ? [zi] : []));

/** Monsters with no player within this many px (square) doze until someone comes by. */
const SLEEP_RANGE = 28 * TILE; // the screen shows about 12 tiles each way, so they are always awake well before they come into view
/** A dozing monster (no hero within SLEEP_RANGE) is updated once every this many ticks. */
const DOZE_EVERY = 5;
/**
 * Lag forgiveness for melee basic attacks (Murat 2026-11-04: clicked monsters still got missed). A hero aims at the
 * monster where their screen showed it, which is a network trip old; by the time the swing reaches the server, a
 * walking (or fleeing) monster has moved on by a few px. A swing also hits a monster if it was in reach at any
 * point during the last REWIND_MS.
 */
const REWIND_MS = 220;
/** Monsters never (re)appear this close to a living hero (Murat): the zone tries another spot or waits. */
const NO_SPAWN_RANGE = 10 * TILE;

/** Monsters that fight from range: how close they let you come, how far they chase, and their shot (none for healers). */
type RangedCfg = { keepAway: number; far: number; range: number; shot: string; shotSpeed: number; shotRadius: number; mult?: number };
const RANGED: Partial<Record<MobKind, RangedCfg>> = {
  shooterblob: { ...BLOB_AI.shooter, far: BLOB_AI.shooter.range * 0.85, shot: "slimeball" },
  healerblob: { keepAway: BLOB_AI.healer.keepAway, far: BLOB_AI.healer.range, range: BLOB_AI.healer.range, shot: "", shotSpeed: 0, shotRadius: 0 },
  skeletonmage: { ...SKELETON_AI.mage, far: SKELETON_AI.mage.range * 0.85, shot: "magicbolt" },
  venomblob: { keepAway: ELEM_BLOB.splurt.keepAway, far: ELEM_BLOB.splurt.range * 0.85, range: ELEM_BLOB.splurt.range, shot: "", shotSpeed: 0, shotRadius: 0 }, // lobs poison (elemSpecial)
  necromancer: { ...SKELETON_AI.necro, far: SKELETON_AI.necro.range * 0.8, shot: "shadowbolt", mult: SKELETON_AI.necro.boltMult },
};

const BOW_SKELETON: RangedCfg = { ...SKELETON_BOW, range: SKELETON_WEAPONS.bow.range, far: SKELETON_WEAPONS.bow.range * 0.85, shot: "arrow", mult: SKELETON_WEAPONS.bow.dmg };
const BANDIT_BOW: RangedCfg = { ...BANDIT_AI.bow, far: BANDIT_AI.bow.range * 0.85, shot: "arrow" };
const LOOKOUT_BOW: RangedCfg = { ...BANDIT_AI.lookoutBow, keepAway: 0, far: 1e9, shot: "arrow" }; // never leaves its tower
const rangedOf = (m: Mob): RangedCfg | undefined =>
  m.kind === "skeleton" && m.weapon === "bow" ? BOW_SKELETON
  : m.kind === "bandit" ? (m.weapon === "archer" ? BANDIT_BOW : m.weapon === "lookout" ? LOOKOUT_BOW : undefined)
  : RANGED[m.kind];
/** A monster's stats: its kind's numbers, a bandit's role on top, and the camp's horn alert (they come from far). */
function mobDef(m: Mob, now = Date.now()): MobDef {
  const base = MOBS[m.kind];
  // The Hollow King grows faster once badly hurt (HOLLOW_KING.wrath)
  if (m.kind === "hollowking") return m.hp < m.maxHp * HOLLOW_KING.wrath.hpFrac
    ? { ...base, speed: base.speed * HOLLOW_KING.wrath.speed, attackCooldownMs: base.attackCooldownMs * HOLLOW_KING.wrath.cooldown } : base;
  if (m.kind !== "bandit" && m.kind !== "banditchief") return base;
  const r = m.kind === "bandit" ? BANDIT_ROLES[roleOf(m.weapon)] : undefined;
  const rally = now < m.rallyUntil;
  const alert = now < m.alertUntil;
  const H = BANDIT_AI.horn;
  return {
    ...base,
    name: r?.name ?? base.name,
    maxHp: base.maxHp * (r?.hp ?? 1),
    damage: base.damage * (r?.dmg ?? 1) * (rally ? CHIEF.warCry.dmg : 1),
    speed: base.speed * (r?.speed ?? 1) * (rally ? CHIEF.warCry.speed : 1),
    attackCooldownMs: base.attackCooldownMs * (r?.cooldown ?? 1),
    xp: base.xp * (r?.xp ?? 1),
    aggroRange: m.weapon === "lookout" ? H.sight : alert ? Math.max(base.aggroRange, H.alertAggro) : base.aggroRange,
    leash: m.weapon === "lookout" ? 1e9 : alert ? Math.max(base.leash, H.alertLeash) : base.leash,
  };
}
/** Melee reach, damage, cooldown and wind-up of a monster (skeletons depend on their weapon). */
const meleeOf = (m: Mob) => {
  const w = m.kind === "skeleton" ? SKELETON_WEAPONS[(m.weapon || "sword") as SkeletonWeapon] : undefined;
  return { range: w?.range ?? MOB_ATTACK_RANGE, dmg: w?.dmg ?? (m.kind === "demon" ? 1 + DEMON.harvest.dmgPer * m.bones : 1), cooldown: w?.cooldown ?? 1, windupMs: w?.windupMs ?? MOB_COMBAT[m.kind].windupMs };
};

/** A trade between players a and b (server only). `v` goes up with every change of an offer. */
interface Trade { a: string; b: string; v: number; offer: Record<string, Offer>; ready: Record<string, boolean> }

const liveRooms = new Set<TownRoom>();
let announced = false;
/** The server is about to restart for an update: tell every player right away (TownScene shows the update notice). */
export function announceUpgrade() {
  if (announced) return;
  announced = true;
  liveRooms.forEach((r) => r.broadcast("upgrading", {}));
}

export class TownRoom extends Room<TownState> {
  maxClients = 50;
  private mobSeq = 0;
  private shotSeq = 0;
  private itemSeq = 0;

  onCreate() {
    liveRooms.add(this);
    this.setState(new TownState());
    this.setPatchRate(1000 / TICK_RATE);
    this.setSimulationInterval((dt) => this.update(dt), 1000 / TICK_RATE);
    // Autosave everyone every 30 s, so a crash loses at most that much
    this.clock.setInterval(() => this.state.players.forEach((p) => saveHero(p.name, p.cls, this.snapshot(p))), 30_000);

    // Fill every spawn zone at start; after that each zone's timer brings monsters back one at a time
    SPAWN_ZONES.forEach((z, zi) => {
      const zone = new Zone();
      zone.name = z.name; zone.cap = zoneCap(z);
      this.state.zones.set(z.name, zone);
      for (const [kind, n] of Object.entries(z.mobs) as [MobKind, number][]) {
        for (let i = 0; i < n; i++) this.spawnMob(kind, zi);
      }
      zone.alive = zone.cap;
    });

    // The gate watch takes up its posts
    for (const post of WATCH_POSTS) {
      const w = new Watchman();
      w.post = post; w.x = post.x; w.y = post.y; w.ax = -post.nx; w.ay = -post.ny; // looking out of the gate
      this.state.watch.set(post.id, w);
    }

    this.onMessage("input", (client, msg: InputState & { seq: number }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.input = { up: !!msg.up, down: !!msg.down, left: !!msg.left, right: !!msg.right };
      p.seq = msg.seq | 0;
    });

    this.onMessage("attack", (client) => this.playerAttack(client.sessionId));
    // Point-and-click: turn toward a world point (the clicked enemy or spot) before an attack or skill
    this.onMessage("face", (client, msg: { x: number; y: number }) => {
      const p = this.state.players.get(client.sessionId);
      const x = Number(msg?.x), y = Number(msg?.y);
      if (!p || p.dead || p.rolling || !Number.isFinite(x) || !Number.isFinite(y)) return;
      this.host.face(client.sessionId, x - p.x, y - p.y);
      p.aimDist = Math.hypot(x - p.x, y - p.y);
    });
    this.onMessage("cast", (client, skill: string) => this.cast(client.sessionId, skill));
    this.onMessage("potion", (client) => this.drinkPotion(client.sessionId));
    this.onMessage("manapotion", (client) => this.drinkManaPotion(client.sessionId));
    this.onMessage("dodge", (client) => this.dodge(client.sessionId));
    this.onMessage("equip", (client, i: number) => this.equip(client.sessionId, i));
    this.onMessage("unequip", (client, slot: GearSlot) => this.unequip(client.sessionId, slot));
    this.onMessage("dropgear", (client, i: number) => this.dropGear(client.sessionId, i));
    this.onMessage("ranged", (client) => this.fireRanged(client.sessionId));
    this.onMessage("useslot", (client, n: number) => this.useSlot(client.sessionId, n));
    this.onMessage("assign", (client, msg: { slot: number; skill: string }) => this.assignSlot(client.sessionId, msg));
    this.onMessage("learn", (client, tid: string) => this.learnTalent(client.sessionId, tid));
    this.onMessage("respec", (client) => this.respec(client.sessionId));
    this.onMessage("stat", (client, k: string) => this.assignStat(client.sessionId, k));
    this.onMessage("resetstats", (client) => this.resetStats(client.sessionId));

    this.onMessage("quest", (client, msg: { chain?: number }) => this.advanceQuest(client.sessionId, CHAINS[Number(msg?.chain)] ? Number(msg.chain) : 0));
    this.onMessage("use", (client, msg: { id: string }) => this.useQuestObject(client.sessionId, msg?.id));
    this.onMessage("chest", (client, msg: { id: string }) => this.openChest(client, msg?.id));
    this.onMessage("chests", (client) => this.sendChests(client));
    this.onMessage("pray", (client) => this.pray(client));
    this.onMessage("portals", (client) => this.sendPortals(client));
    this.onMessage("travel", (client, msg: { to?: string }) => this.travel(client, msg?.to));
    this.onMessage("shrine", (client) => client.send("shrine", { left: Math.max(0, this.shrineReadyAt - Date.now()) }));
    // The client is ready (loading screen gone): a hero on the first step of First Steps gets its banner
    this.onMessage("tutorial", (client) => {
      const p = this.state.players.get(client.sessionId);
      if (p && p.tutId === 0 && p.tutStage === 1) this.sendQuest(client.sessionId, p, TUT_CHAIN);
    });
    this.onMessage("buy", (client, msg: { i: number }) => this.shopBuy(client, msg?.i));
    this.onMessage("sell", (client, msg: { i: number }) => this.shopSell(client, msg?.i));
    // Trading between players and the account stash (shared/trade.ts)
    this.onMessage("trade", (client, msg: { id?: string; name?: string }) => this.tradeAsk(client.sessionId, msg));
    this.onMessage("tradeyes", (client, msg: { from?: string }) => this.tradeAnswer(client.sessionId, msg?.from, true));
    this.onMessage("tradeno", (client, msg: { from?: string }) => this.tradeAnswer(client.sessionId, msg?.from, false));
    this.onMessage("tradeoffer", (client, msg: { items?: unknown; gold?: unknown }) => this.tradeOffer(client.sessionId, msg));
    this.onMessage("tradeready", (client, msg: { v?: number; ready?: boolean }) => this.tradeReady(client.sessionId, msg));
    this.onMessage("tradecancel", (client) => this.tradeStop(client.sessionId, "Trade cancelled."));
    this.onMessage("stash", (client) => this.stashSend(client));
    this.onMessage("stashput", (client, msg: { i?: number }) => this.stashMove(client, "put", msg?.i));
    this.onMessage("stashtake", (client, msg: { i?: number }) => this.stashMove(client, "take", msg?.i));
    this.onMessage("stashgold", (client, msg: { n?: number }) => this.stashGold(client, msg?.n));

    // Player ideas: suggest (once a day), vote, and every hour the best idea wins (shared/ideas.ts)
    this.onMessage("idea", (client, text: string) => this.submitIdea(client, text));
    this.onMessage("ideavote", (client, msg: { id: number; v: number }) => this.voteIdea(client, Number(msg?.id), Number(msg?.v)));
    this.onMessage("ideas", (client) => this.sendBoard(client));
    this.clock.setInterval(() => this.ideaRound(), 5000);

    this.onMessage("pinvite", (client, msg: { id?: string; name?: string }) => this.partyInvite(client.sessionId, msg));
    this.onMessage("paccept", (client, msg: { from?: string }) => this.partyAnswer(client.sessionId, msg?.from, true));
    this.onMessage("pdecline", (client, msg: { from?: string }) => this.partyAnswer(client.sessionId, msg?.from, false));
    this.onMessage("pleave", (client) => this.partyLeave(client.sessionId));

    this.onMessage("chat", (client, text: string) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof text !== "string") return;
      const idea = text.trim().match(/^\/idea\s+([\s\S]+)$/i);
      if (idea) return this.submitIdea(client, idea[1]);
      const v = text.trim().match(/^\/(up|down|unvote)\s+#?(\d+)$/i);
      if (v) return this.voteIdea(client, Number(v[2]), v[1].toLowerCase() === "up" ? 1 : v[1].toLowerCase() === "down" ? -1 : 0);
      if (/^\/max$/i.test(text.trim())) return this.maxHero(client);
      const tr = text.trim().match(/^\/trade\s+(.+)$/i);
      if (tr) return this.tradeAsk(client.sessionId, { name: tr[1] });
      const inv = text.trim().match(/^\/(?:invite|inv|group)\s+(.+)$/i);
      if (inv) return this.partyInvite(client.sessionId, { name: inv[1] });
      if (/^\/(leave|ungroup)$/i.test(text.trim())) return this.partyLeave(client.sessionId);
      const clean = text.slice(0, 120).trim();
      const cmd = clean.toLowerCase().replace(/^\//, "");
      if (clean.startsWith("/") && (EMOTES as readonly string[]).includes(cmd)) {
        if (!p.dead) p.emote = cmd;
        return;
      }
      if (clean) this.broadcast("chat", { id: client.sessionId, name: p.name, text: clean });
    });
  }

  /** Remembers a hashed network address per player, so one person can't suggest or vote twice with alt heroes. */
  private addrs = new Map<string, string | undefined>();

  /** Name + password check (server/accounts.ts); a new name creates the account. Also notes the network address for ideas. */
  onAuth(client: Client, options: { name?: string; password?: string }, request?: IncomingMessage) {
    const name = login(options?.name, options?.password);
    let online = false;
    this.state.players.forEach((o) => { if (o.name.toLowerCase() === name.toLowerCase()) online = true; });
    if (online) throw new Error("This hero is already playing");
    const fwd = process.env.TRUST_PROXY ? String(request?.headers["x-forwarded-for"] ?? "").split(",")[0].trim() : "";
    const ip = fwd || request?.socket?.remoteAddress || "";
    // Local addresses are skipped so several tabs on one computer can still test ideas and votes
    const local = !ip || ip === "::1" || ip.startsWith("127.") || ip.startsWith("::ffff:127.");
    this.addrs.set(client.sessionId, local ? undefined : hashAddr(ip));
    return { name };
  }

  private asker(client: Client): Asker | undefined {
    const p = this.state.players.get(client.sessionId);
    // IDEAS_ANY_LEVEL=1 lets fresh heroes suggest ideas (handy for local testing)
    return p && { name: p.name, level: process.env.IDEAS_ANY_LEVEL ? 99 : p.level, addr: this.addrs.get(client.sessionId) };
  }

  private ideaNote(client: Client, text: string, ok = false) { client.send("ideanote", { text, ok }); }

  private sendBoard(client: Client) {
    const a = this.asker(client);
    if (a) client.send("ideas", boardFor(ideaLog, a, Date.now()));
  }

  private ideasChanged() {
    saveIdeas();
    for (const c of this.clients) this.sendBoard(c);
  }

  private submitIdea(client: Client, text: unknown) {
    const a = this.asker(client);
    if (!a) return;
    const r = submit(ideaLog, a, text, Date.now());
    if (!r.ok) return this.ideaNote(client, r.error);
    const i = r.idea!;
    console.log(`Idea #${i.id} by ${i.author}: ${i.text}`);
    this.ideaNote(client, `Idea #${i.id} received! Players can vote on it now.`, true);
    this.broadcast("chat", { id: "", name: "Ideas", text: `${i.author} suggested idea #${i.id}: "${i.text.slice(0, 80)}" (/up ${i.id} or /down ${i.id})` });
    this.ideasChanged();
  }

  private voteIdea(client: Client, id: number, v: number) {
    const a = this.asker(client);
    if (!a || !Number.isInteger(id)) return;
    const r = ideaVote(ideaLog, a, id, v, Date.now());
    if (!r.ok) return this.ideaNote(client, r.error);
    if (r.idea!.status === "votedDown") this.broadcast("chat", { id: "", name: "Ideas", text: `Idea #${id} was voted down.` });
    this.ideasChanged();
  }

  private ideaRound() {
    const { winners, expired } = ideaTick(ideaLog, Date.now());
    for (const w of winners) {
      console.log(`Idea #${w.id} won this hour's vote: ${w.text}`);
      this.broadcast("ideawin", { id: w.id, text: w.text, author: w.author });
    }
    if (winners.length || expired.length) this.ideasChanged();
  }

  onJoin(client: Client, options: { name?: string; color?: number; cls?: string; newGame?: boolean }, auth?: { name: string }) {
    const p = new Player();
    p.name = auth?.name ?? `Hero${Math.floor(Math.random() * 1000)}`;
    p.color = typeof options?.color === "number" ? options.color : COLORS[Math.floor(Math.random() * COLORS.length)];
    p.cls = isClassKind(options?.cls) ? options.cls : "knight";
    // "New game" on the login screen: start this class over (the old save is overwritten right away) and refill all chests
    if (options?.newGame) resetChests(p.name);
    const save = options?.newGame ? undefined : loadHero(p.name, p.cls);
    if (save) this.restore(p, save);
    this.syncPotions(p);
    // A new hero (or New game) starts the guided first quest right away; heroes from before it existed skip it
    if (!save) this.qset(p, TUT_CHAIN, { questId: 0, questStage: 1, questCount: 0 });
    // New heroes (and saves from before class kits existed) put on the class's starting kit
    if (!save?.kit) this.wearKit(p);
    this.applyStats(p);
    if (options?.newGame) saveHero(p.name, p.cls, this.snapshot(p));
    p.hp = p.maxHp;
    const s = randomSpawn();
    p.x = s.x; p.y = s.y;
    this.state.players.set(client.sessionId, p);
    this.sendBoard(client); // the Ideas board is ready as soon as it is opened
    console.log(`${p.name} the ${CLASSES[p.cls].name} joined (${this.clients.length} online)`);
  }

  onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) saveHero(p.name, p.cls, this.snapshot(p));
    this.partyLeave(client.sessionId);
    this.invites.delete(client.sessionId);
    this.tradeStop(client.sessionId, "The other hero left: trade cancelled.");
    this.tradeAsks.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.unsummon(client.sessionId);
    this.addrs.delete(client.sessionId);
  }

  onDispose() {
    liveRooms.delete(this);
    this.state.players.forEach((p) => saveHero(p.name, p.cls, this.snapshot(p)));
    flush();
  }

  // ---- Saves (server/accounts.ts) -------------------------------------------

  private snapshot(p: Player): HeroSave {
    const talents: Record<string, number> = {};
    p.talents.forEach((v, k) => { talents[k] = v; });
    return {
      color: p.color, xp: p.xp, level: p.level, kills: p.kills, gold: p.gold, potions: total(p.pots.potion), pots: { potion: [...p.pots.potion], mpotion: [...p.pots.mpotion] },
      ptSta: p.ptSta, ptStr: p.ptStr, ptMag: p.ptMag, ptDex: p.ptDex,
      weapon: p.weapon, armour: p.armour, shoes: p.shoes, hat: p.hat, shield: p.shield, ranged: p.ranged,
      bag: p.bag.toArray(), talents, slots: p.slots.toArray(),
      questId: p.questId, questStage: p.questStage, questCount: p.questCount, questVer: CHAINS[0].version,
      boneId: p.boneId, boneStage: p.boneStage, boneCount: p.boneCount, boneVer: CHAINS[1].version,
      redId: p.redId, redStage: p.redStage, redCount: p.redCount, redVer: CHAINS[2].version, kit: 1,
      tutId: p.tutId, tutStage: p.tutStage, tutCount: p.tutCount, tutVer: CHAINS[TUT_CHAIN].version,
      ...(() => { const q = this.qs(p, CROWN_CHAIN); return { crownId: q.questId, crownStage: q.questStage, crownCount: q.questCount, crownVer: CHAINS[CROWN_CHAIN].version }; })(),
      portals: [...p.portals],
    };
  }

  private restore(p: Player, s: HeroSave) {
    const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    const gear = (v: unknown) => (typeof v === "string" && isGearId(v) && canWear(p.cls, v) ? v : "");
    p.color = num(s.color, p.color);
    p.xp = Math.min(MAX_XP, num(s.xp)); p.level = capLevel(num(s.level, 1)); p.kills = num(s.kills);
    p.gold = num(s.gold);
    // Potions by size; saves from before potion sizes had plain counts (all Minor), and a few mana potions for heroes older than mana
    const cnt = (v: unknown): Counts => (Array.isArray(v) ? [0, 1, 2].map((i) => Math.min(120, Math.max(0, Math.floor(num(v[i]))))) : [0, 0, 0]) as Counts;
    p.pots = s.pots ? { potion: cnt(s.pots.potion), mpotion: cnt(s.pots.mpotion) } : { potion: [Math.min(50, num(s.potions)), 0, 0], mpotion: [Math.min(50, num(s.mpotions, 2)), 0, 0] };
    p.ptSta = num(s.ptSta); p.ptStr = num(s.ptStr); p.ptMag = num(s.ptMag); p.ptDex = num(s.ptDex);
    // A hero saved above today's level cap spent more points than his level gives: hand them back to place again
    if (p.ptSta + p.ptStr + p.ptMag + p.ptDex > statPoints(p.level)) p.ptSta = p.ptStr = p.ptMag = p.ptDex = 0;
    p.weapon = gear(s.weapon); p.armour = gear(s.armour); p.shoes = gear(s.shoes);
    p.hat = gear(s.hat); p.shield = gear(s.shield); p.ranged = gear(s.ranged);
    // The bag may hold items for other classes (bought, traded or taken from the stash for another hero)
    if (Array.isArray(s.bag)) setBag(p, s.bag.filter((v): v is string => isGearId(v)).slice(0, BAG_SIZE));
    // Old saves (before the skill tree rework) had other skill ids: those points come back to spend again
    for (const [k, v] of Object.entries(cleanRanks(p.cls, p.level, s.talents ?? {}))) p.talents.set(k, v);
    if (Array.isArray(s.slots)) s.slots.slice(0, SLOT_COUNT).forEach((v, i) => {
      p.slots[i] = typeof v === "string" && skillLearned(p.cls, p.talents, v) && skillOf(p.cls, v)?.passive === undefined ? v : "";
    });
    for (const id of cleanPortals(s.portals)) p.portals.add(id);
    const sv = s as unknown as Record<string, unknown>;
    // Saves from before the guided first quest count it as done
    if (sv.tutVer === undefined) sv.tutId = TUT_QUESTS.length;
    CHAINS.forEach((ch, c) => {
      const [a, b, n] = ch.keys;
      const st = { questId: Math.min(ch.quests.length, num(sv[a])), questStage: num(sv[b]), questCount: num(sv[n]) };
      // The steps of a quest changed since this save: start the current quest again from its offer
      if (num(sv[ch.verKey], 1) !== ch.version && st.questStage > 0) { st.questStage = 0; st.questCount = 0; }
      this.qset(p, c, st);
    });
  }

  /** A spawn spot in the zone away from every hero, or null if none turned up (the hero stands in a small zone). */
  private freeSpawnPoint(zi: number, kind: MobKind) {
    if (kind === "bandit" && SPAWN_ZONES[zi].name === "Redfang Hollow") {
      const post = this.freePost("");
      if (post < 0) return null;
      const at = postPos(CAMP_POSTS[post]);
      return this.playerNear(at.x, at.y, NO_SPAWN_RANGE) ? null : { ...at, level: spawnPoint(SPAWN_ZONES[zi], kind).level };
    }
    for (let i = 0; i < 12; i++) {
      const pt = spawnPoint(SPAWN_ZONES[zi], kind);
      if (!this.playerNear(pt.x, pt.y, NO_SPAWN_RANGE)) return pt;
    }
    return null;
  }

  private spawnMob(kind: MobKind, zi: number, id = `m${++this.mobSeq}`, at?: ReturnType<typeof spawnPoint>) {
    const m = this.state.mobs.get(id) ?? new Mob();
    let home = at ?? spawnPoint(SPAWN_ZONES[zi], kind);
    m.kind = kind;
    m.weapon = kind === "skeleton" ? rollSkeletonWeapon() : "";
    m.camp = false; m.post = -1; m.perch = false; m.pLeg = 0; m.pDir = 1; m.stuckSince = 0; m.detourUntil = 0;
    m.alertUntil = 0; m.alertHero = ""; m.nextHorn = 0; m.nextVolley = 0; m.rallyUntil = 0; m.chargeMult = 1; m.dashHit = false; m.reinforced = false;
    m.nextSweep = 0; m.nextLeap = 0; m.nextCry = 0;
    m.nextSplurt = 0; m.nextNova = 0; m.nextBreath = 0; m.nextSparks = 0;
    if (kind === "bandit" && SPAWN_ZONES[zi]?.name === "Redfang Hollow") {
      // The camp: every bandit takes the first free post (its role, spot and patrol route)
      const post = this.freePost(id);
      if (post >= 0) {
        const P = CAMP_POSTS[post];
        m.camp = true; m.post = post; m.weapon = P.role; m.perch = P.role === "lookout";
        home = { ...postPos(P), level: home.level };
      }
    } else if (kind === "bandit" && SPAWN_ZONES[zi]?.name === "Gullrock Cove") {
      m.weapon = (["cutthroat", "brute", "archer", "cutthroat"] as const)[this.mobSeq % 4]; // the raiding party: a mix of roles
    }
    const def = mobDef(m);
    m.zone = zi;
    m.x = m.homeX = home.x;
    m.y = m.homeY = home.y;
    m.level = home.level;
    m.hp = m.maxHp = Math.round(def.maxHp * mobScale(m.level, "hp"));
    m.dead = false;
    m.target = "";
    m.hidden = false; m.spot = ""; m.fleeing = false;
    m.specialKind = ""; m.specialAt = 0; m.nextBounce = 0; m.nextSlam = 0; m.nextRaise = 0; m.nextCircle = 0;
    m.ritual = false; m.riteX = NaN; m.banishAt = 0; m.nextStomp = 0; m.nextHarvest = 0; m.nextToss = 0; m.bones = 0;
    m.foe = ""; m.hateId = ""; m.hate = 0; m.nextAggro = 0; m.threat = 0;
    m.work = ""; m.job = -1; m.leg = 1; m.restUntil = 0;
    if (kind === "skeleton" && zi >= 0) this.takeJob(m, id, SPAWN_ZONES[zi].name);
    m.merged = 1; m.parts = ""; m.summonFor = ""; m.mergeInto = ""; m.mergeCap = 0; m.nextCall = 0; m.nextShot = 0;
    m.canShoot = kind === "shooterblob"; m.canCharge = kind === "warriorblob"; m.canHeal = kind === "healerblob";
    if (kind === "motherblob") m.nextBrood = Date.now() + BROOD.minMs + Math.random() * (BROOD.maxMs - BROOD.minMs);
    if (!this.state.mobs.has(id)) this.state.mobs.set(id, m);
  }

  // ---- Siege works (shared/siege.ts) ------------------------------------------
  // The necromancer's skeletons build siege engines. Each job slot holds one worker; a skeleton that spawns in a
  // zone with sites takes a free one, works there while no hero is near, and drops it to fight.

  private jobs = new Map<number, string>(); // WORK_SLOTS index -> mob id

  private takeJob(m: Mob, id: string, zone: string) {
    const slots = SLOTS_BY_ZONE.get(zone);
    if (!slots) return;
    const free = slots.filter((k) => { const o = this.state.mobs.get(this.jobs.get(k) ?? ""); return !o || o.dead || o.job !== k || this.jobs.get(k) === id; });
    if (!free.length) return; // every job taken: this one patrols
    const k = free[Math.floor(Math.random() * free.length)];
    this.jobs.set(k, id);
    m.job = k;
    const w = WORK_SLOTS[k];
    m.homeX = w.x; m.homeY = w.y; // its leash is the work site
    // nobody watching: it is already at work (else it walks over from where it rose)
    if (!this.playerNear(w.x, w.y, NO_SPAWN_RANGE)) { m.x = w.x; m.y = w.y; }
  }

  /** Walks to its post and works there (carriers go back and forth between the yard and the engine). */
  private work(m: Mob, now: number): InputState {
    const w = WORK_SLOTS[m.job];
    const carrier = w.job === "carry";
    const gx = carrier && m.leg === 1 ? w.fromX! : w.x, gy = carrier && m.leg === 1 ? w.fromY! : w.y;
    const d = Math.hypot(gx - m.x, gy - m.y);
    if (carrier) {
      if (!m.work) m.work = m.leg === 0 ? "carry" : "fetch";
      if (d > 4) { m.restUntil = 0; return toward(m.x, m.y, gx, gy); }
      if (!m.restUntil) m.restUntil = now + 1000 + Math.random() * 1200; // put the plank down / pick one up
      else if (now >= m.restUntil) { m.leg = 1 - m.leg; m.work = m.leg === 0 ? "carry" : "fetch"; m.restUntil = 0; }
      const lx = m.leg === 1 ? 2 * gx - w.x : w.lookX, ly = m.leg === 1 ? gy : w.lookY; // the yard lies beyond its pick-up spot
      m.dir = Math.abs(lx - m.x) > Math.abs(ly - m.y) ? (lx > m.x ? "right" : "left") : (ly > m.y ? "down" : "up");
      return STILL;
    }
    if (d > (m.work ? 10 : 4)) { m.work = ""; return toward(m.x, m.y, gx, gy); }
    m.work = w.job;
    m.dir = Math.abs(w.lookX - m.x) > Math.abs(w.lookY - m.y) ? (w.lookX > m.x ? "right" : "left") : (w.lookY > m.y ? "down" : "up");
    return STILL;
  }

  /** Interrupted: tools down (the client shows it), and the rest of the site's gang turns on the same enemy. */
  private dropWork(m: Mob, id: string, now: number) {
    this.broadcast("workdrop", { id, work: m.work, x: Math.round(m.x), y: Math.round(m.y) });
    m.work = ""; m.leg = 1; m.restUntil = 0;
    if (m.job < 0 || !m.target) return;
    const site = WORK_SLOTS[m.job].site;
    for (const [k, oid] of this.jobs) {
      if (oid === id || WORK_SLOTS[k].site !== site) continue;
      const o = this.state.mobs.get(oid);
      if (!o || o.dead || o.job !== k || o.target) continue;
      o.hateId = m.target; o.hate = Math.max(o.hate, 0.5); o.nextAggro = Math.min(o.nextAggro, now + 150 + Math.random() * 350);
    }
  }

  /** First camp post nobody alive holds (-1 if all are taken). */
  private freePost(self: string): number {
    const held = new Set<number>();
    this.state.mobs.forEach((o, oid) => { if (oid !== self && o.camp && !o.dead && o.post >= 0) held.add(o.post); });
    return CAMP_POSTS.findIndex((_, i) => !held.has(i));
  }

  // ---- Special blobs --------------------------------------------------------

  /** Ranged monsters' shot at (tx,ty): shooter blob slime ball, skeleton mage magic bolt, necromancer shadow bolt. Only hurts players. */
  private mobShot(m: Mob, id: string, tx: number, ty: number, cfg: RangedCfg = rangedOf(m)!) {
    const s = new Projectile();
    const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy) || 1;
    s.x = m.x; s.y = m.y - 4; s.vx = dx / d; s.vy = dy / d;
    const def = mobDef(m);
    s.owner = id; s.kind = cfg.shot; s.mobLevel = m.level || 1; s.mobName = def.name; s.mobEl = MOB_SHOT_ELEMENT[m.kind as keyof typeof MOB_SHOT_ELEMENT];
    s.speed = cfg.shotSpeed; s.range = cfg.range * 1.4; s.radius = cfg.shotRadius;
    s.damage = Math.round(def.damage * mobScale(m.level, "damage") * (cfg.mult ?? 1));
    this.state.projectiles.set(`s${++this.shotSeq}`, s);
    this.broadcast("swing", { id });
  }

  /** Healer blob mends the most hurt blob (itself included) within range. */
  private blobHeal(m: Mob, id: string, now: number) {
    m.nextHeal = now + BLOB_AI.healer.everyMs;
    let best: Mob | undefined, bestId = "", worst = 0.999;
    this.state.mobs.forEach((o, oid) => {
      const R = BLOB_AI.healer.range;
      if (Math.abs(o.x - m.x) > R || Math.abs(o.y - m.y) > R) return; // cheap box test first
      if (o.dead || o.hidden || !BLOB_KINDS.includes(o.kind as MobKind) || Math.hypot(o.x - m.x, o.y - m.y) > R) return;
      const f = o.hp / o.maxHp;
      if (f < worst) { worst = f; best = o; bestId = oid; }
    });
    if (!best) return;
    const amount = Math.max(1, Math.round(best.maxHp * BLOB_AI.healer.frac));
    best.hp = Math.min(best.maxHp, best.hp + amount);
    this.broadcast("blobheal", { from: id, to: bestId, amount });
  }

  // ---- Hiding in graves / trees ---------------------------------------------

  /** Pick the nearest free hiding spot and start walking to it. */
  private claimSpot(m: Mob, x: number, y: number, radius: number, now: number, fleeing: boolean) {
    if (m.merged > 1 || m.mergeInto) return; // a big merged blob doesn't fit in a tree
    const taken = new Set<string>();
    this.state.mobs.forEach((o) => { if (o !== m && o.spot && !o.dead) taken.add(o.spot); });
    const s = findHideSpot(m.kind, x, y, radius, taken);
    if (!s) return;
    m.spot = s.key; m.spotX = s.x; m.spotY = s.y; m.outX = s.outX; m.outY = s.outY;
    m.seekUntil = now + HIDE.seekMs; m.fleeing = fleeing;
  }

  private hide(m: Mob, id: string, now: number) {
    m.hidden = true; m.fleeing = false; m.target = ""; m.moving = false;
    m.winding = false; m.windUntil = 0;
    m.x = m.spotX; m.y = m.spotY;
    m.hideUntil = now + HIDE.minMs + Math.random() * (HIDE.maxMs - HIDE.minMs);
    this.broadcast("hide", { id });
  }

  /** Hidden: heal a little, wait for a victim to walk by, or leave after a while. */
  private updateHidden(m: Mob, id: string, dt: number, now: number) {
    m.moving = false;
    if (m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * HIDE.regenPerSec * dt);
    let victim = "", best = HIDE.ambushRange;
    this.state.players.forEach((p, pid) => {
      if (p.dead || isSafeZone(p.x, p.y)) return;
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < best) { best = d; victim = pid; }
    });
    if (m.broken) return;
    if (victim) this.popOut(m, id, victim);
    else if (now > m.hideUntil) this.popOut(m, id, "");
  }

  private popOut(m: Mob, id: string, victim: string) {
    m.hidden = false; m.spot = "";
    m.x = m.outX; m.y = m.outY;
    m.target = victim;
    m.lastAttack = 0; // strike right away
    if (victim) this.broadcast("ambush", { id, x: m.x, y: m.y, victim });
  }

  /** A Mother Blob buds a blobling next to her, unless she already has a full brood (or the world is full of them). */
  private brood(mother: Mob, motherId: string, now: number) {
    mother.nextBrood = now + BROOD.minMs + Math.random() * (BROOD.maxMs - BROOD.minMs);
    let mine = 0, total = 0;
    this.state.mobs.forEach((c) => {
      if (c.kind !== "blobling" || c.dead) return;
      total++;
      if (c.mother === motherId) mine++;
    });
    if (mine >= BROOD.perMother || total >= BROOD.worldCap) return;
    if (this.budBlobling(mother, motherId)) this.broadcast("brood", { id: motherId });
  }

  /** Put one blobling next to its mother (false if there was no free spot). */
  private budBlobling(mother: Mob, motherId: string, spread = 6): boolean {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * spread;
      const x = mother.x + Math.cos(a) * r, y = mother.y + Math.sin(a) * r;
      if (isSolidAt(x, y) || isSafeZone(x, y)) continue;
      const c = new Mob();
      c.kind = "blobling"; c.zone = -1; c.mother = motherId;
      c.x = c.homeX = x; c.y = c.homeY = y;
      c.level = mother.level;
      c.hp = c.maxHp = Math.round(MOBS.blobling.maxHp * mobScale(c.level, "hp"));
      c.target = mother.target; // join the fight if mum is busy
      if (mother.parts) {
        // A merged Mother Blob buds mixed bloblings: one or two of the blobs she swallowed show on each
        const kinds = mother.parts.split(",");
        const pick = new Set([kinds[Math.floor(Math.random() * kinds.length)], kinds[Math.floor(Math.random() * kinds.length)]]);
        c.parts = [...pick].join(",");
      }
      this.state.mobs.set(`b${++this.mobSeq}`, c);
      return true;
    }
    return false;
  }

  /**
   * Mother Blob special moves. Returns true while she is busy with one (she stands still).
   * A move is telegraphed (wind-up + "mbwind" so the client can warn), then lands as a shockwave.
   */
  private motherSpecial(m: Mob, id: string, dist: number, now: number): boolean {
    if (m.specialAt) {
      if (now < m.specialAt) return true;
      const move = m.specialKind === "slam" ? MOTHER.slam : MOTHER.bounce;
      m.specialAt = 0; m.winding = false; m.lastAttack = now;
      const dmg = Math.round(MOBS.motherblob.damage * mobScale(m.level, "damage") * move.dmgMult);
      this.state.players.forEach((p, pid) => {
        if (p.dead) return;
        const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy);
        if (d > move.radius) return;
        const push: [number, number] = d > 0.1 ? [dx / d, dy / d] : [0, 1];
        this.damagePlayer(pid, dmg, m.specialKind === "slam" ? "Mother Blob's Ground Slam" : "Mother Blob's Belly Bounce", push, move.knockback, { atkLevel: m.level, from: id });
      });
      if (m.specialKind === "slam") {
        // the slam shakes loose a swarm of bloblings (world cap still applies)
        let total = 0;
        this.state.mobs.forEach((c) => { if (c.kind === "blobling" && !c.dead) total++; });
        for (let i = 0; i < MOTHER.slam.swarm && total < BROOD.worldCap; i++) if (this.budBlobling(m, id, 18)) total++;
      }
      this.broadcast("mbhit", { id, kind: m.specialKind, x: m.x, y: m.y, r: move.radius });
      m.specialKind = "";
      return true;
    }
    if (m.broken || m.windUntil) return false;
    if (m.level >= MOTHER.slam.level && now >= m.nextSlam && dist <= MOTHER.slam.range) {
      m.specialKind = "slam"; m.specialAt = now + MOTHER.slam.windupMs; m.nextSlam = now + MOTHER.slam.cooldownMs;
      m.nextBounce = Math.max(m.nextBounce, now + 2000);
    } else if (m.level >= MOTHER.bounce.level && now >= m.nextBounce && dist <= MOTHER.bounce.range) {
      m.specialKind = "bounce"; m.specialAt = now + MOTHER.bounce.windupMs; m.nextBounce = now + MOTHER.bounce.cooldownMs;
    } else return false;
    m.winding = true;
    this.broadcast("mbwind", { id, kind: m.specialKind, ms: m.specialKind === "slam" ? MOTHER.slam.windupMs : MOTHER.bounce.windupMs });
    return true;
  }

  // ---- Elemental blobs (ELEM_BLOB) -----------------------------------------------

  /** Venom puddles and storm sparks on the ground: they hurt heroes standing in them every tick. */
  private hazards: { x: number; y: number; r: number; until: number; next: number; tickMs: number; dmg: number; el: Element; by: string; level: number; name: string }[] = [];

  /** The elemental moves of a blob: its own, and those of every elemental blob it swallowed. */
  private static elemMoves(m: Mob): string[] {
    const own = ELEM_MOVE[m.kind];
    if (!m.parts) return own ? [own] : [];
    const out = own ? [own] : [];
    for (const k of m.parts.split(",")) { const mv = ELEM_MOVE[k as MobKind]; if (mv && !out.includes(mv)) out.push(mv); }
    return out;
  }
  /** The blob's own damage at its level, times `mult`. */
  private elemDmg(m: Mob, mult: number) { return Math.max(1, Math.round(MOBS[m.kind].damage * mobScale(m.level, "damage") * mult)); }
  /** A ground hazard; `ms` long, hurting every `tickMs`. */
  private addHazard(m: Mob, id: string, x: number, y: number, r: number, ms: number, tickMs: number, dmg: number, el: Element, now: number) {
    this.hazards.push({ x, y, r, until: now + ms, next: now + 150, tickMs, dmg, el, by: id, level: m.level, name: mobDef(m).name });
  }
  private updateHazards(now: number) {
    if (!this.hazards.length) return;
    this.hazards = this.hazards.filter((h) => h.until > now);
    for (const h of this.hazards) {
      if (now < h.next) continue;
      h.next = now + h.tickMs;
      this.state.players.forEach((p, pid) => {
        if (p.dead || Math.abs(p.x - h.x) > h.r || Math.abs(p.y - h.y) > h.r || Math.hypot(p.x - h.x, p.y - h.y) > h.r) return;
        this.damagePlayer(pid, h.dmg, h.name, [0, 0], 0, { dot: true, mobEl: h.el, atkLevel: h.level, el: h.el });
      });
    }
  }

  /**
   * Splurt (venom), Frost Nova (frost) and Fire Breath (fire): a wind-up painted on the ground, then the move lands.
   * Returns true while it is busy (it stands still). `t` may be gone while a move it started is still landing.
   */
  private elemSpecial(m: Mob, id: string, t: Player | undefined, dist: number, now: number): boolean {
    const E = ELEM_BLOB;
    if (m.specialAt && (m.specialKind === "splurt" || m.specialKind === "nova" || m.specialKind === "breath")) {
      if (now < m.specialAt) return true;
      const kind = m.specialKind;
      m.specialAt = 0; m.specialKind = ""; m.winding = false; m.lastAttack = now;
      const name = mobDef(m).name;
      if (kind === "splurt") {
        // the glob flies to where the hero stands NOW (step out of the marked spot to dodge it)
        const tx = t ? t.x : m.castX, ty = t ? t.y : m.castY, S = E.splurt;
        this.broadcast("venomspit", { id, x0: Math.round(m.x), y0: Math.round(m.y - 6), x: Math.round(tx), y: Math.round(ty), ms: S.flightMs, r: S.puddle.radius, puddleMs: S.puddle.ms });
        const dmg = this.elemDmg(m, S.dmgMult), tick = this.elemDmg(m, S.puddle.dmgMult), level = m.level;
        this.host.later(S.flightMs, () => {
          this.state.players.forEach((p, pid) => {
            if (p.dead || Math.hypot(p.x - tx, p.y - ty) > S.puddle.radius) return;
            this.damagePlayer(pid, dmg, `${name}'s venom`, [0, 0], 0, { mobEl: "poison", atkLevel: level, from: id });
          });
          this.addHazard(m, id, tx, ty, S.puddle.radius, S.puddle.ms, S.puddle.tickMs, tick, "poison", Date.now());
        });
      } else if (kind === "nova") {
        const N = E.nova, dmg = this.elemDmg(m, N.dmgMult);
        this.state.players.forEach((p, pid) => {
          const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy);
          if (p.dead || d > N.radius) return;
          this.damagePlayer(pid, dmg, `${name}'s Frost Nova`, d > 0.1 ? [dx / d, dy / d] : [0, 1], 1, { mobEl: "cold", slowMs: N.slowMs, atkLevel: m.level, from: id });
        });
        this.broadcast("frostnova", { id, x: Math.round(m.x), y: Math.round(m.y), r: N.radius });
      } else {
        const B = E.breath, dmg = this.elemDmg(m, B.dmgMult), burn = this.elemDmg(m, B.burn.dmgMult), cos = Math.cos(B.halfAngle);
        this.state.players.forEach((p, pid) => {
          const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy);
          if (p.dead || d > B.reach || (d > 8 && (dx * m.aimX + dy * m.aimY) / d < cos)) return;
          if (!this.damagePlayer(pid, dmg, `${name}'s Fire Breath`, d > 0.1 ? [dx / d, dy / d] : [m.aimX, m.aimY], 1, { mobEl: "fire", atkLevel: m.level, from: id })) {
            for (let i = 1; i <= B.burn.ticks; i++) this.host.later(B.burn.tickMs * i, () => this.damagePlayer(pid, burn, `${name}'s flames`, [0, 0], 0, { dot: true, mobEl: "fire", el: "fire" }));
          }
        });
        this.broadcast("firebreath", { id, x: Math.round(m.x), y: Math.round(m.y), ax: m.aimX, ay: m.aimY, reach: B.reach, half: B.halfAngle });
      }
      return true;
    }
    if (!t || m.specialAt || m.broken || m.windUntil) return false;
    const moves = TownRoom.elemMoves(m);
    const face = () => { m.dir = Math.abs(t.x - m.x) > Math.abs(t.y - m.y) ? (t.x > m.x ? "right" : "left") : (t.y > m.y ? "down" : "up"); };
    if (moves.includes("nova") && now >= m.nextNova && dist <= E.nova.range) {
      m.specialKind = "nova"; m.specialAt = now + E.nova.windupMs; m.nextNova = now + E.nova.cooldownMs;
      this.broadcast("elemwind", { id, kind: "nova", ms: E.nova.windupMs, x: Math.round(m.x), y: Math.round(m.y), r: E.nova.radius });
    } else if (moves.includes("breath") && now >= m.nextBreath && dist <= E.breath.range) {
      const d = Math.max(0.1, dist);
      m.aimX = (t.x - m.x) / d; m.aimY = (t.y - m.y) / d;
      m.specialKind = "breath"; m.specialAt = now + E.breath.windupMs; m.nextBreath = now + E.breath.cooldownMs;
      this.broadcast("elemwind", { id, kind: "breath", ms: E.breath.windupMs, x: Math.round(m.x), y: Math.round(m.y), ax: m.aimX, ay: m.aimY, reach: E.breath.reach, half: E.breath.halfAngle });
    } else if (moves.includes("splurt") && now >= m.nextSplurt && dist <= E.splurt.range && dist > 20) {
      m.castX = t.x; m.castY = t.y;
      m.specialKind = "splurt"; m.specialAt = now + E.splurt.windupMs; m.nextSplurt = now + E.splurt.cooldownMs;
      this.broadcast("elemwind", { id, kind: "splurt", ms: E.splurt.windupMs });
    } else return false;
    face();
    m.winding = true; m.windUntil = 0;
    return true;
  }

  /** A Storm Blob that is hit throws off sparks that crackle on the ground around it for a moment. */
  private stormSparks(m: Mob, id: string, now: number) {
    const S = ELEM_BLOB.sparks;
    if (now < m.nextSparks || !TownRoom.elemMoves(m).includes("sparks")) return;
    m.nextSparks = now + S.everyMs;
    let mine = 0;
    for (const h of this.hazards) if (h.by === id && h.el === "shock") mine++;
    const n = Math.min(S.count, S.max - mine);
    if (n <= 0) return;
    const pts: [number, number][] = [], dmg = this.elemDmg(m, S.dmgMult);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = 12 + Math.random() * (S.spread - 12);
      const x = m.x + Math.cos(a) * d, y = m.y + Math.sin(a) * d * 0.8;
      if (isSolidAt(x, y)) continue;
      pts.push([Math.round(x), Math.round(y)]);
      this.addHazard(m, id, x, y, S.radius, S.ms, S.tickMs, dmg, "shock", now);
    }
    if (pts.length) this.broadcast("sparks", { id, pts, ms: S.ms, r: S.radius });
  }

  // ---- Blob vs undead feud ------------------------------------------------------

  /** The enemy monster this one is fighting, if it is still there to fight. */
  private foeOf(m: Mob, def: MobDef): Mob | undefined {
    const o = m.foe ? this.state.mobs.get(m.foe) : undefined;
    if (o && !o.dead && !o.hidden && Math.hypot(m.x - m.homeX, m.y - m.homeY) <= def.leash && Math.hypot(o.x - m.x, o.y - m.y) <= FEUD.range * 2) return o;
    m.foe = "";
    return undefined;
  }

  /** Generated aggro: a blow makes the victim hate its attacker (hero or monster). */
  private addHate(m: Mob, id: string, dmg: number) {
    const add = AGGRO.hitBase + AGGRO.dmgMult * dmg / Math.max(1, m.maxHp);
    m.hate = Math.min(AGGRO.max, (m.hateId === id ? m.hate : 0) + add);
    m.hateId = id;
    m.nextAggro = 0;
  }

  /**
   * Aggro: score every hero in range and (blobs/undead) every rival monster around by closeness, level and the
   * hate it has for them, and fight the top one. Also notes the level gap of the scariest hero around (m.threat).
   */
  private pickTarget(m: Mob, def: MobDef) {
    let best = 0, target = "", foe = "";
    m.threat = 0;
    const alerted = Date.now() < m.alertUntil;
    this.state.players.forEach((p, pid) => {
      if (p.dead || isSafeZone(p.x, p.y) || Math.hypot(p.x - m.homeX, p.y - m.homeY) >= def.leash) return;
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      // a hero the horn (or a shout) called the camp against counts as hated
      const hated = (pid === m.hateId ? m.hate : 0) + (alerted && pid === m.alertHero ? 0.5 : 0);
      const range = hated > 0 ? def.aggroRange * 2 : def.aggroRange;
      if (d >= range) return;
      if (d < def.aggroRange) m.threat = Math.max(m.threat, p.level - m.level);
      const lf = m.merged > 1 || m.kind === "demon" ? Math.max(1, aggroLevelFactor(m.level, p.level)) : aggroLevelFactor(m.level, p.level); // a merged blob regrouped to fight, a demon was called against him: no hero scares them
      const score = Math.max(0, 1 - d / def.aggroRange) * lf + hated + (pid === m.target ? AGGRO.stick : 0);
      if (score > best) { best = score; target = pid; }
    });
    const side = m.perch ? undefined : FACTION[m.kind]; // lookouts stay up on their tower
    const fr = m.camp && CAMP_POSTS[m.post]?.route ? BANDIT_AI.patrolFeud : FEUD.range; // patrols go looking for trouble
    if (side && !m.mergeInto && !m.summonFor && Math.hypot(m.x - m.homeX, m.y - m.homeY) <= def.leash) {
      const cx = Math.floor(m.x / FEUD_CELL), cy = Math.floor(m.y / FEUD_CELL);
      for (let gy = cy - 1; gy <= cy + 1; gy++) for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (const [oid, o] of this.feudGrid.get(gx * 4096 + gy) ?? []) {
          if (FACTION[o.kind] === side || o.dead || o.hidden || o.mergeInto) continue;
          const d = Math.hypot(o.x - m.x, o.y - m.y);
          const hated = oid === m.hateId ? m.hate : 0;
          if (d >= (hated > 0 || oid === m.foe ? fr * 2 : fr)) continue;
          const score = AGGRO.rival * Math.max(0.05, 1 - d / fr) * aggroLevelFactor(m.level, o.level) + hated + (oid === m.foe ? AGGRO.stick : 0);
          if (score > best) { best = score; target = ""; foe = oid; }
        }
      }
    }
    m.target = target; m.foe = foe;
  }

  /** Blobs and undead by map cell, rebuilt every tick, so a monster only checks its neighbours for a foe. */
  private feudGrid = new Map<number, [string, Mob][]>();
  private buildFeudGrid() {
    this.feudGrid.clear();
    this.state.mobs.forEach((o, oid) => {
      if (o.dead || o.summonFor || !FACTION[o.kind]) return;
      const k = Math.floor(o.x / FEUD_CELL) * 4096 + Math.floor(o.y / FEUD_CELL);
      const cell = this.feudGrid.get(k);
      if (cell) cell.push([oid, o]); else this.feudGrid.set(k, [[oid, o]]);
    });
  }

  /** A monster's blow on another monster: no loot and no XP when it dies; the victim fights back. */
  private mobHitsMob(m: Mob, id: string, o: Mob, oid: string, dmg: number) {
    // Redfang bandits are seasoned fighters: they cut through the beasts of the woods and shrug off their blows
    if (FACTION[m.kind] === "outlaw") dmg = Math.round(dmg * BANDIT_AI.feud.dealt);
    if (FACTION[o.kind] === "outlaw") dmg = Math.max(1, Math.round(dmg * BANDIT_AI.feud.taken));
    o.hp -= dmg;
    this.addHate(o, id, dmg);
    if (!o.target && !o.foe) o.foe = id;
    const d = Math.hypot(o.x - m.x, o.y - m.y) || 1;
    const k = moveStep(o.x, o.y, pushInput([(o.x - m.x) / d, (o.y - m.y) / d]), 0.05);
    if (!isSafeZone(k.x, k.y) && !noMobsAt(k.x, k.y)) { o.x = k.x; o.y = k.y; }
    this.broadcast("hit", { id: oid, dmg, crit: false, dot: false });
    if (o.hp <= 0) { this.mobDied(o, oid, id, MOBS[m.kind].name); m.foe = ""; }
  }

  // ---- Blob merging -----------------------------------------------------------

  /** Blobs that can call for help and fuse (Mother Blobs too, Murat 2026-11-03). */
  private static canMerge(m: Mob) { return BLOB_KINDS.includes(m.kind) && !m.servant; } // the Hollow King's servants stay his

  /** Blobs below MERGE.minLevel don't merge, unless a hero close by is on the "watch a blob call for help" quest step. */
  private mergeLevelOk(m: Mob) {
    if (m.level >= MERGE.minLevel) return true;
    const r2 = (10 * TILE) ** 2;
    let ok = false;
    this.state.players.forEach((p) => {
      if (ok || p.dead) return;
      const dx = m.x - p.x, dy = m.y - p.y;
      if (dx * dx + dy * dy > r2) return;
      for (let c = 0; c < CHAINS.length; c++) if (questStep(this.qs(p, c))?.type === "merge") { ok = true; return; }
    });
    return ok;
  }

  /** In danger: call the blobs around to fuse into this one, up to its cap. */
  private blobCall(m: Mob, id: string, now: number) {
    m.nextCall = now + MERGE.callEveryMs;
    m.mergeCap ||= m.level < MERGE.highLevel ? MERGE.capLow : MERGE.capHigh;
    let room = m.mergeCap - m.merged;
    this.state.mobs.forEach((o) => { if (o.mergeInto === id && !o.dead) room -= o.merged; });
    if (room <= 0) return;
    const near: [number, string, Mob][] = [];
    const lowOk = m.level < MERGE.minLevel; // a quest-witness call: low blobs may answer it too
    this.state.mobs.forEach((o, oid) => {
      if (o === m || o.dead || o.hidden || o.mergeInto || !TownRoom.canMerge(o)) return;
      if (o.level < MERGE.minLevel && !lowOk) return;
      const d = Math.hypot(o.x - m.x, o.y - m.y);
      if (d <= MERGE.callRange) near.push([d, oid, o]);
    });
    near.sort((a, b) => a[0] - b[0]);
    let called = 0;
    for (const [, , o] of near) {
      if (o.merged > room) continue;
      o.mergeInto = id; o.spot = ""; o.windUntil = 0; o.winding = false;
      room -= o.merged; called++;
      if (room <= 0) break;
    }
    if (called) { this.broadcast("blobcall", { id }); this.questWitness("merge", m.x, m.y); }
  }

  /** o melts into h: levels, HP and abilities add up; o is gone (its zone brings a fresh one back later). */
  private absorb(h: Mob, hid: string, o: Mob, oid: string) {
    // A Mother Blob always ends up on the outside, so the merged blob keeps budding (with a mixed look)
    if (o.kind === "motherblob" && h.kind !== "motherblob") {
      o.mergeCap = Math.max(o.mergeCap, h.mergeCap); o.target ||= h.target; o.foe ||= h.foe;
      [h, hid, o, oid] = [o, oid, h, hid];
    }
    h.merged += o.merged; h.level = regionSpecialLevel(h.level + o.level); // levels add up, to the region's Lv 30 ceiling
    h.parts = [h.parts, o.kind, o.parts].filter(Boolean).join(",");
    h.maxHp += o.maxHp; h.hp = Math.min(h.maxHp, h.hp + o.hp);
    h.canShoot ||= o.canShoot; h.canCharge ||= o.canCharge; h.canHeal ||= o.canHeal;
    o.dead = true; o.hp = 0; o.mergeInto = ""; o.moving = false;
    this.state.mobs.forEach((c) => { if (c.mergeInto === oid) c.mergeInto = c === h ? "" : hid; }); // its callers come to the new body
    h.mergeInto = "";
    if (o.zone < 0) this.clock.setTimeout(() => this.state.mobs.delete(oid), 500);
    else { const zone = this.state.zones.get(SPAWN_ZONES[o.zone].name); if (zone) zone.alive--; }
    h.nextAggro = 0; // done merging: pick a fight right away
    this.broadcast("blobmerge", { into: hid, from: oid, x: Math.round(o.x), y: Math.round(o.y), level: h.level, merged: h.merged });
    this.questWitness("merge", h.x, h.y);
  }

  // ---- Necromancer ----------------------------------------------------------

  /**
   * Necromancer spells. Returns true while casting (it stands still).
   * Raise Dead: skeletons climb out of the ground around it (they belong to it and crumble when it dies).
   * Death Circle: marks the ground under the target, then blasts everyone still inside.
   */
  private necroSpell(m: Mob, id: string, t: Player, dist: number, now: number): boolean {
    const N = SKELETON_AI.necro;
    if (m.specialAt) {
      if (now < m.specialAt) return true;
      m.specialAt = 0; m.winding = false; m.lastAttack = now;
      if (m.specialKind === "circle") {
        const dmg = Math.round(MOBS.necromancer.damage * mobScale(m.level, "damage") * N.circle.dmgMult);
        this.state.players.forEach((p, pid) => {
          if (p.dead) return;
          const dx = p.x - m.castX, dy = p.y - m.castY, d = Math.hypot(dx, dy);
          if (d > N.circle.radius) return;
          this.damagePlayer(pid, dmg, "Necromancer's Death Circle", d > 0.1 ? [dx / d, dy / d] : [0, 1], 1.5, { atkLevel: m.level, from: id, mobEl: "poison" });
        });
        this.broadcast("necrohit", { id, x: m.castX, y: m.castY, r: N.circle.radius });
      } else {
        const pts: [number, number][] = [];
        let mine = 0;
        this.state.mobs.forEach((c) => { if (c.mother === id && !c.dead) mine++; });
        for (let i = 0; i < N.raise.count && mine < N.raise.max; i++) {
          const c = this.raiseSkeleton(m, id);
          if (c) { pts.push([Math.round(c.x), Math.round(c.y)]); mine++; }
        }
        this.broadcast("necroraise", { id, pts });
      }
      m.specialKind = "";
      return true;
    }
    if (m.broken) return false;
    let mine = 0;
    this.state.mobs.forEach((c) => { if (c.mother === id && !c.dead) mine++; });
    if (now >= m.nextRaise && mine < N.raise.max) {
      m.specialKind = "raise"; m.specialAt = now + N.raise.castMs; m.nextRaise = now + N.raise.everyMs;
      this.broadcast("necrowind", { id, kind: "raise", ms: N.raise.castMs });
    } else if (now >= m.nextCircle && dist <= N.circle.range) {
      m.specialKind = "circle"; m.specialAt = now + N.circle.windupMs; m.nextCircle = now + N.circle.cooldownMs;
      m.castX = t.x; m.castY = t.y;
      m.lastAttack = Math.max(m.lastAttack, now); // no bolt on top of the circle
      this.broadcast("necrowind", { id, kind: "circle", ms: N.circle.windupMs, x: Math.round(t.x), y: Math.round(t.y), r: N.circle.radius });
    } else return false;
    m.winding = true; m.windUntil = 0;
    return true;
  }

  /** One skeleton climbs out of the ground next to the necromancer (same level, belongs to it, never respawns). */
  private raiseSkeleton(n: Mob, necroId: string): Mob | undefined {
    const spread = SKELETON_AI.necro.raise.spread;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * spread;
      const x = n.x + Math.cos(a) * r, y = n.y + Math.sin(a) * r;
      if (isSolidAt(x, y) || isSafeZone(x, y) || noMobsAt(x, y)) continue;
      const c = new Mob();
      c.kind = "skeleton"; c.weapon = rollSkeletonWeapon(); c.zone = -1; c.mother = necroId;
      c.x = c.homeX = x; c.y = c.homeY = y;
      c.level = n.level;
      c.hp = c.maxHp = Math.round(MOBS.skeleton.maxHp * mobScale(c.level, "hp"));
      c.target = n.target;
      c.stunUntil = Date.now() + 500; // climbing out
      this.state.mobs.set(`r${++this.mobSeq}`, c);
      return c;
    }
    return undefined;
  }

  /** The upper half of a broken skeleton: slow, frail, still swinging (no zone, never respawns). */
  private spawnCrawler(x: number, y: number, level: number, weapon: string, mother: string, killer: string) {
    if (isSafeZone(x, y)) return;
    const c = new Mob();
    c.kind = "crawler"; c.weapon = weapon; c.zone = -1; c.mother = mother;
    c.x = c.homeX = x; c.y = c.homeY = y;
    c.level = level;
    c.hp = c.maxHp = Math.round(MOBS.crawler.maxHp * mobScale(level, "hp"));
    if (this.state.players.has(killer)) { c.target = killer; this.addHate(c, killer, 0); }
    else if (this.state.mobs.get(killer)?.dead === false) c.foe = killer;
    c.stunUntil = Date.now() + 300;
    const id = `c${++this.mobSeq}`;
    this.state.mobs.set(id, c);
    this.broadcast("bonebreak", { id, x: Math.round(x), y: Math.round(y) });
  }

  /**
   * Skeleton packs: when two or more skeletons go for the same hero, give each its own side of him,
   * spread evenly around the circle starting from where the first one already is (BONES).
   */
  private flankKeys = new Map<string, string>(); // hero -> ids of the pack whose sides are handed out
  private assignFlanks() {
    const packs = new Map<string, [string, Mob][]>();
    this.state.mobs.forEach((m, id) => {
      if (m.dead || m.hidden || !m.target || (m.kind !== "skeleton" && m.kind !== "crawler") || m.weapon === "bow") { m.flankA = NaN; return; }
      const list = packs.get(m.target);
      if (list) list.push([id, m]); else packs.set(m.target, [[id, m]]);
    });
    for (const pid of this.flankKeys.keys()) if (!packs.has(pid)) this.flankKeys.delete(pid);
    packs.forEach((list, pid) => {
      const p = this.state.players.get(pid);
      if (!p || list.length < 2) { for (const [, m] of list) m.flankA = NaN; this.flankKeys.delete(pid); return; }
      const key = list.map(([id]) => id).sort().join();
      if (this.flankKeys.get(pid) === key) return; // same pack: everyone keeps its side
      this.flankKeys.set(pid, key);
      // spread evenly round the hero, centred on where the pack comes from, keeping their left-to-right order
      const ang = list.map(([, m]) => Math.atan2(m.y - p.y, m.x - p.x));
      const mean = Math.atan2(ang.reduce((s, a) => s + Math.sin(a), 0), ang.reduce((s, a) => s + Math.cos(a), 0));
      const rel = ang.map((a) => Math.atan2(Math.sin(a - mean), Math.cos(a - mean)));
      const order = list.map((_, i) => i).sort((a, b) => rel[a] - rel[b]);
      const step = (Math.PI * 2) / list.length;
      order.forEach((i, k) => { list[i][1].flankA = mean + (k - (list.length - 1) / 2) * step; });
    });
  }

  // ---- Bone Demon ritual (BONES.ritual) ----------------------------------------

  private nextRitualCheck = 0;
  private ritualCd = new Map<string, number>(); // hero -> no new ritual against him before this time
  private static RITUAL_KINDS: MobKind[] = ["skeleton", "skeletonmage", "crawler"];

  /** Rituals whose skeletons are still walking to the star (BONES.ritual.gatherMs). */
  private rites: { x: number; y: number; level: number; pid: string; ids: string[]; until: number }[] = [];

  /** Skeletons that are losing badly to a hero give their bones to summon a demon. */
  private checkRituals(now: number) {
    this.updateRites(now);
    if (!this.undeadUp || now < this.nextRitualCheck) return; // the dead only give their bones under the night sky
    const R = BONES.ritual;
    this.nextRitualCheck = now + R.checkMs;
    let demons = 0;
    this.state.mobs.forEach((m) => { if (m.kind === "demon" && !m.dead) demons++; });
    if (demons >= R.maxDemons) return;
    const cells = Math.ceil(R.near / FEUD_CELL);
    for (const [pid, p] of this.state.players) {
      if (p.dead || isSafeZone(p.x, p.y) || (this.ritualCd.get(pid) ?? 0) > now) continue;
      // skeletons around this hero (from the feud grid: blobs and undead by map cell)
      const near: [string, Mob][] = [];
      const gx0 = Math.floor(p.x / FEUD_CELL), gy0 = Math.floor(p.y / FEUD_CELL);
      for (let gy = gy0 - cells; gy <= gy0 + cells; gy++) for (let gx = gx0 - cells; gx <= gx0 + cells; gx++) {
        for (const [id, m] of this.feudGrid.get(gx * 4096 + gy) ?? []) {
          if (m.dead || m.hidden || m.ritual || m.servant || !TownRoom.RITUAL_KINDS.includes(m.kind) || Math.hypot(m.x - p.x, m.y - p.y) > R.near) continue;
          near.push([id, m]);
        }
      }
      if (near.length < R.minPack) continue;
      const avg = (l: [string, Mob][]) => l.reduce((s, [, m]) => s + m.level, 0) / l.length;
      // losing a fight to him, or just seeing a hero far beyond them walk past (Murat 2026-11-03)
      const fighting = near.filter(([, m]) => m.target === pid);
      const hp = fighting.length ? fighting.reduce((s, [, m]) => s + m.hp, 0) / fighting.reduce((s, [, m]) => s + m.maxHp, 0) : 1;
      const losing = fighting.length >= R.minPack && (p.level - avg(fighting) >= R.gap || hp <= R.hpFrac);
      const outclassed = p.level - avg(near) >= R.passGap;
      if (!losing && !outclassed) continue;
      const pack = losing ? fighting : near;
      const cx = pack.reduce((s, [, m]) => s + m.x, 0) / pack.length, cy = pack.reduce((s, [, m]) => s + m.y, 0) / pack.length;
      if (isSafeZone(cx, cy) || isSolidAt(cx, cy)) continue;
      const chosen = pack.sort((a, b) => Math.hypot(a[1].x - cx, a[1].y - cy) - Math.hypot(b[1].x - cx, b[1].y - cy)).slice(0, R.maxPack);
      this.ritualCd.set(pid, now + R.cooldownMs);
      // the demon answers the threat: never far below the hero it was called against
      const level = regionSpecialLevel(Math.max(Math.max(...chosen.map(([, m]) => m.level)) + R.levelUp, p.level - R.belowHero));
      // Murat 2026-11-03: they first walk up to the points of the star, then throw themselves in (updateRites)
      chosen.forEach(([, m], k) => {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 5;
        m.ritual = true; m.riteX = cx + Math.cos(a) * R.radius * R.rim; m.riteY = cy + Math.sin(a) * R.radius * R.rim;
        m.target = ""; m.foe = ""; m.winding = false; m.windUntil = 0;
      });
      this.rites.push({ x: cx, y: cy, level, pid, ids: chosen.map(([id]) => id), until: now + R.gatherMs });
      this.broadcast("ritualcall", { x: Math.round(cx), y: Math.round(cy), r: R.radius, ms: R.gatherMs });
      this.questWitness("ritual", cx, cy);
      if (++demons >= R.maxDemons) return;
    }
  }

  /** Gathered (or out of time): the skeletons leap into the star and burst into its bones; the demon climbs out. */
  private updateRites(now: number) {
    if (!this.rites.length) return;
    const R = BONES.ritual;
    this.rites = this.rites.filter((rt) => {
      const alive = rt.ids.map((id) => [id, this.state.mobs.get(id)] as const).filter(([, m]) => m && !m.dead && m.ritual) as [string, Mob][];
      if (!alive.length) return false; // all cut down on the way: no demon
      const ready = alive.every(([, m]) => Math.hypot(m.x - m.riteX, m.y - m.riteY) < 4);
      if (!ready && now < rt.until) return true;
      const bones = alive.map(([id, m]) => [Math.round(m.x), Math.round(m.y), m.kind, m.weapon, m.level, id]);
      for (const [id, m] of alive) { m.riteX = NaN; this.mobDied(m, id, "", ""); }
      this.broadcast("ritual", { x: Math.round(rt.x), y: Math.round(rt.y), r: R.radius, bones, ms: R.castMs });
      this.clock.setTimeout(() => this.summonDemon(rt.x, rt.y, rt.level, rt.pid), R.castMs);
      return false;
    });
  }

  private summonDemon(x: number, y: number, level: number, pid: string) {
    const d = new Mob();
    d.kind = "demon"; d.zone = -1;
    d.x = d.homeX = x; d.y = d.homeY = y;
    d.level = level;
    d.hp = d.maxHp = Math.round(MOBS.demon.maxHp * mobScale(level, "hp"));
    const now = Date.now();
    d.banishAt = now + BONES.ritual.lifeMs; d.nextStomp = now + 2500; d.stunUntil = now + 700; // climbing out
    if (this.state.players.get(pid)?.dead === false) { d.target = pid; this.addHate(d, pid, 0); }
    const id = `d${++this.mobSeq}`;
    this.state.mobs.set(id, d);
    this.broadcast("demonrise", { id, x: Math.round(x), y: Math.round(y) });
  }

  /** The nearest living skeleton within r px of the demon (to rip apart or to throw). */
  private skeletonNear(m: Mob, r: number): [string, Mob] | undefined {
    let best: [string, Mob] | undefined, bd = r;
    const cells = Math.ceil(r / FEUD_CELL), gx0 = Math.floor(m.x / FEUD_CELL), gy0 = Math.floor(m.y / FEUD_CELL);
    for (let gy = gy0 - cells; gy <= gy0 + cells; gy++) for (let gx = gx0 - cells; gx <= gx0 + cells; gx++) {
      for (const [id, o] of this.feudGrid.get(gx * 4096 + gy) ?? []) {
        if (o.dead || o.hidden || o.ritual || !TownRoom.RITUAL_KINDS.includes(o.kind)) continue;
        const d = Math.hypot(o.x - m.x, o.y - m.y);
        if (d < bd) { bd = d; best = [id, o]; }
      }
    }
    return best;
  }

  /** Bone Demon uses the skeletons around it: throws one at a hero who keeps away, or wears one as armour. */
  private demonBones(m: Mob, id: string, t: Player, dist: number, now: number) {
    const H = DEMON.harvest, S = DEMON.toss;
    if (dist >= S.min && dist <= S.max && now >= m.nextToss) {
      const s = this.skeletonNear(m, S.grab);
      if (s) {
        m.nextToss = now + S.everyMs;
        const [sid, sk] = s;
        sk.ritual = true; this.mobDied(sk, sid, "", "");
        this.broadcast("demongrab", { id, from: [Math.round(sk.x), Math.round(sk.y)] });
        this.mobShot(m, id, t.x, t.y, { keepAway: 0, far: 0, range: S.max, shot: "skelthrow", shotSpeed: S.speed, shotRadius: S.radius, mult: S.dmgMult });
        return;
      }
    }
    if (m.bones < H.max && now >= m.nextHarvest) {
      const s = this.skeletonNear(m, H.range);
      if (!s) return;
      m.nextHarvest = now + H.everyMs + H.ripMs;
      const [sid, sk] = s;
      // Bone Harvest takes a while (Murat 2026-11-03): it grabs the skeleton, lifts it, snaps it in two between its
      // fists and straps the piece on; it stands still meanwhile (demonSpecial "rip") and only wears it at equipMs
      const from = [Math.round(sk.x), Math.round(sk.y)], look = { kind: sk.kind, weapon: sk.weapon, level: sk.level };
      sk.ritual = true; this.mobDied(sk, sid, "", "");
      m.dir = Math.abs(sk.x - m.x) > Math.abs(sk.y - m.y) ? (sk.x > m.x ? "right" : "left") : (sk.y > m.y ? "down" : "up");
      m.specialKind = "rip"; m.specialAt = now + H.ripMs; m.moving = false; m.winding = false;
      this.broadcast("demonrip", { id, sid, from, ...look, piece: m.bones + 1, ms: H.ripMs, equipMs: H.equipMs });
      this.clock.setTimeout(() => {
        if (m.dead || m.bones >= H.max) return;
        m.bones++;
        this.broadcast("demonharvest", { id, bones: m.bones });
      }, H.equipMs);
    }
  }

  /** Bone Demon's Hellfire Stomp; true while it is busy with it (it stands still). */
  private demonSpecial(m: Mob, id: string, dist: number, now: number): boolean {
    const S = DEMON.stomp;
    if (m.specialAt && m.specialKind === "rip") {
      if (now < m.specialAt) return true; // busy tearing a skeleton apart
      m.specialAt = 0; m.specialKind = ""; m.lastAttack = now;
      return false;
    }
    if (m.specialAt) {
      if (now < m.specialAt) return true;
      m.specialAt = 0; m.winding = false; m.lastAttack = now; m.specialKind = "";
      const dmg = Math.round(MOBS.demon.damage * mobScale(m.level, "damage") * S.dmgMult);
      this.state.players.forEach((p, pid) => {
        if (p.dead) return;
        const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy);
        if (d > S.radius) return;
        this.damagePlayer(pid, dmg, "Bone Demon's Hellfire Stomp", d > 0.1 ? [dx / d, dy / d] : [0, 1], S.knockback, { atkLevel: m.level, from: id, mobEl: "fire" });
      });
      this.broadcast("demonfire", { id, x: Math.round(m.x), y: Math.round(m.y), r: S.radius });
      return true;
    }
    if (m.broken || m.windUntil || now < m.nextStomp || dist > S.range) return false;
    m.specialKind = "stomp"; m.specialAt = now + S.windupMs; m.nextStomp = now + S.everyMs; m.winding = true;
    this.broadcast("demonwind", { id, ms: S.windupMs });
    return true;
  }

  // ---- Tick ---------------------------------------------------------------

  private tickNo = 0;
  private dozeSeq = 0;

  /**
   * True when updateMob would do nothing but let the monster doze: no hero within SLEEP_RANGE, no target or rival,
   * not burning, stunned, walking to a rite, being banished or merging. Mirrors the early returns of updateMob.
   */
  private dozing(m: Mob, heroes: Player[], now: number): boolean {
    if (m.dead || m.target || m.foe || m.banishAt || m.ritual || m.mergeInto || m.spot || m.specialAt || m.windUntil) return false;
    if (now < m.stunUntil || now < m.sk.burnUntil || m.broken || m.moving) return false;
    return !this.heroNear(m, heroes);
  }

  private heroNear(m: Mob, heroes: Player[]): boolean {
    const x = m.x, y = m.y;
    for (const p of heroes) if (Math.abs(p.x - x) < SLEEP_RANGE && Math.abs(p.y - y) < SLEEP_RANGE) return true;
    return false;
  }

  private update(dtMs: number) {
    let dt = dtMs / 1000;
    const now = Date.now();
    this.tradeTick();
    this.state.players.forEach((p, pid) => {
      tickUnit(this.host, pid);
      p.stunned = now < p.stunUntil;
      p.slowed = now < p.slowUntil;
      p.guarding = blocking(p, now);
      p.stacks = p.sk.stacks;
      const fx = statusOf(p, now);
      if (p.fx !== fx) p.fx = fx;
      const timers = timersOf(p, now), sig = timerSig(timers);
      if (sig !== p.timerSig) { p.timerSig = sig; p.timers = encodeTimers(++p.timerSeq, timers, now); }
      const spd = Math.round(speedMult(p, now) * talentMult(p.cls, p.talents, "speed") * 1000) / 1000;
      if (p.spd !== spd) p.spd = spd;
      tickPoise(p, heroPoiseMax(p), dt, now);
      if (p.dead) { p.moving = false; p.energy = ENERGY.max; p.mana = p.maxMana; this.syncMana(p); return; }
      for (let c = 0; c < CHAINS.length; c++) this.checkQuestPlace(pid, p, c);
      this.wakePortals(pid, p);
      if (p.energy < ENERGY.max) p.energy = Math.min(ENERGY.max, p.energy + staminaRegen(p.cls) * dt);
      if (p.mana < p.maxMana) {
        const resting = now - p.lastHurt > REGEN_DELAY_MS;
        p.mana = Math.min(p.maxMana, p.mana + manaRegen(this.stats(p), resting, talentBonus(p.cls, p.talents, "mana")) * dt);
      }
      this.syncMana(p);
      p.rolling = now < p.rollUntil;
      const r = p.stunned || charging(p, now) // a buildup roots the hero
        ? { x: p.x, y: p.y, moving: false }
        : p.rolling
        ? moveStep(p.x, p.y, p.rollInput, dt, DODGE.distance / (DODGE.durationMs / 1000))
        : moveStep(p.x, p.y, p.input, dt, heroSpeed(p.cls, p.slowed, p.spd) * gearSpeedMult(this.equipped(p)));
      p.x = r.x; p.y = r.y; p.moving = r.moving;
      if (!p.rolling) { p.dir = dirFromInput(p.input, p.dir); aimOf(p); }
      if (r.moving) p.emote = "";
      // Regeneration from Stamina: always a trickle, ramping up smoothly out of combat, fastest in the safe plaza
      if (!p.dead && p.hp > 0 && p.hp < p.maxHp) {
        const ramp = Math.min(1, Math.max(0, (now - p.lastHurt - REGEN_DELAY_MS) / REGEN_RAMP_MS));
        const [fight, rest] = regenFromStamina(p.sta);
        const full = rest * (isSafeZone(p.x, p.y) ? SAFE_REGEN_MULT : 1);
        p.hp = Math.min(p.maxHp, p.hp + (fight + (full - fight) * ramp) * dt);
      }
      // Skill tree regen works all the time, even in combat
      const treeRegen = talentBonus(p.cls, p.talents, "regen") + buffRegen(p, now) * 100;
      if (treeRegen > 0 && !p.dead && p.hp > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * treeRegen / 100 * dt);
      this.pickUp(p, pid);
      this.updateWrath(pid, p, now);
    });
    this.state.items.forEach((it, id) => { if (now > it.expires) this.state.items.delete(id); });
    const tick = ++this.tickNo;
    if (tick % 2 === 0) this.buildFeudGrid(); // monsters move a few px per tick, a grid cell is 128 px
    this.assignFlanks();
    this.updateUndeadNight(now);
    this.checkRituals(now);
    // Live heroes, gathered once so each monster's "anyone near?" check is a plain array scan
    const awake: Player[] = [];
    this.state.players.forEach((p) => { if (!p.dead) awake.push(p); });
    this.state.mobs.forEach((m, id) => {
      // A dozing monster far from every hero (nothing it could do this tick) only gets its upkeep every DOZE_EVERY ticks
      if (m.dozeSlot < 0) m.dozeSlot = this.dozeSeq++ % DOZE_EVERY;
      const slot = (tick + m.dozeSlot) % DOZE_EVERY === 0;
      // between its upkeep ticks a dozing monster only checks whether a hero came near
      if (m.dozy && !slot && !this.heroNear(m, awake)) return;
      m.dozy = this.dozing(m, awake, now);
      if (m.dozy) {
        if (!slot) return;
        dt = Math.min(1, (now - (m.lastTick || now - dtMs)) / 1000); // poise recovers for the whole time it dozed
      } else dt = dtMs / 1000;
      m.lastTick = now;
      tickUnit(this.host, id);
      const fx = statusOf(m, now);
      if (m.fx !== fx) m.fx = fx;
      this.updateMob(m, id, dt, now);
      if (m.perch) { m.x = m.homeX; m.y = m.homeY; m.moving = false; } // lookouts never leave their tower
      // Position history for lag-forgiving swings (only kept while it moves)
      const h = m.hist, n = h.length;
      if (m.dead) { if (n) h.length = 0; }
      else if (!n || h[n - 2] !== m.x || h[n - 1] !== m.y) {
        h.push(now, m.x, m.y);
        while (h.length > 3 && h[0] < now - REWIND_MS - 100) h.splice(0, 3);
      }
    });
    dt = dtMs / 1000;
    this.updateZones(now);
    this.updateGuards(now);
    this.updateWatch(dt, now);
    this.state.projectiles.forEach((s, id) => this.updateProjectile(s, id, dt));
    this.updateHazards(now);
    this.state.fields.forEach((f, id) => {
      if (!tickField(this.host, f.inst)) { this.state.fields.delete(id); return; }
      if (f.follow) { f.x = f.inst.x; f.y = f.inst.y; }
    });
    // Timed skill steps (waves, buildups, multi-hits)
    if (this.pending.length) {
      const due = this.pending.filter((x) => x.at <= now);
      if (due.length) { this.pending = this.pending.filter((x) => x.at > now); for (const x of due) x.fn(); }
    }
  }

  // ---- The gate watch (shared/watch.ts) -----------------------------------------

  /** Monsters near the stockade, gathered once per look so 8 watchmen don't each scan the whole map. */
  private watchSeen: [string, Mob][] = [];
  private watchLookAt = 0;

  private updateWatch(dt: number, now: number) {
    if (now >= this.watchLookAt) {
      this.watchLookAt = now + 400;
      const m = (WATCH.leashTiles + 2) * TILE, x0 = VILLAGE.x0 * TILE - m, x1 = (VILLAGE.x1 + 1) * TILE + m, y0 = VILLAGE.y0 * TILE - m, y1 = (VILLAGE.y1 + 1) * TILE + m;
      this.watchSeen = [];
      this.state.mobs.forEach((o, oid) => { if (!o.dead && !o.hidden && o.x > x0 && o.x < x1 && o.y > y0 && o.y < y1) this.watchSeen.push([oid, o]); });
    }
    this.outlaws = [];
    this.state.players.forEach((p, pid) => { if (p.outlaw && !p.dead) this.outlaws.push([pid, p]); });
    this.state.watch.forEach((w) => this.updateWatchman(w, dt, now));
  }

  /** Heroes the village is after right now (shared/wrath.ts). */
  private outlaws: [string, Player][] = [];

  private updateWatchman(w: Watchman, dt: number, now: number) {
    const P = w.post, sight = WATCH.sightTiles * TILE, leash = WATCH.leashTiles * TILE;
    // An outlaw in the village comes first: hunt them anywhere inside the stockade
    let foe = w.foe ? this.state.players.get(w.foe) : undefined;
    if (foe && (foe.dead || !foe.outlaw)) { foe = undefined; w.foe = ""; }
    if (!foe && this.outlaws.length) {
      let bd = Infinity;
      for (const [pid, o] of this.outlaws) { const d = Math.hypot(o.x - w.x, o.y - w.y); if (d < bd) { bd = d; w.foe = pid; foe = o; } }
    }
    let t: Mob | Player | undefined = foe ?? (w.target ? this.state.mobs.get(w.target) : undefined);
    if (foe) w.target = "";
    if (!foe && t && ((t as Mob).dead || (t as Mob).hidden || Math.hypot(t.x - P.x, t.y - P.y) > leash)) { t = undefined; w.target = ""; }
    if (now >= w.nextLook && !t) {
      w.nextLook = now + 400;
      let bd = sight;
      for (const [oid, o] of this.watchSeen) {
        if (o.dead || o.hidden || (oid === w.ignore && now < w.ignoreUntil)) continue;
        const d = Math.hypot(o.x - P.x, o.y - P.y);
        if (d < bd) { bd = d; w.target = oid; t = o; }
      }
    }
    // A thrust in progress lands, if the monster is still in reach
    if (w.strikeAt && now >= w.strikeAt) {
      w.strikeAt = 0;
      if (foe && Math.hypot(foe.x - w.x, foe.y - w.y) <= WATCH.reach * 1.6) {
        const d = Math.hypot(foe.x - w.x, foe.y - w.y) || 1;
        this.damagePlayer(w.foe, WRATH.watchDamage(foe.maxHp), "The village watch", [(foe.x - w.x) / d, (foe.y - w.y) / d], 1.5, { wrath: true, stunMs: WRATH.stunMs });
      } else if (!foe && t && Math.hypot(t.x - w.x, t.y - w.y) <= WATCH.reach * 1.4) this.watchHits(w, w.target, t as Mob, now);
    }
    if (w.strikeAt) { w.moving = false; return; } // planted for the thrust
    let gx: number, gy: number, stop: number;
    if (t) { gx = t.x; gy = t.y; stop = WATCH.reach * 0.8; }
    else { gx = P.x; gy = P.y; stop = 2; }
    // Out through the gate and back in through it, never straight into the stakes
    const outW = beyondWall(P, w.x, w.y), outG = beyondWall(P, gx, gy);
    if (outW !== outG) {
      // line up a tile in front of the opening on his side, then step straight through it
      const sd = outW ? -1 : 1, ax = P.gx + P.nx * sd * TILE, ay = P.gy + P.ny * sd * TILE;
      if (!w.crossing && Math.hypot(w.x - ax, w.y - ay) > 4) { gx = ax; gy = ay; }
      else { w.crossing = true; gx = P.gx - P.nx * sd * 1.2 * TILE; gy = P.gy - P.ny * sd * 1.2 * TILE; }
      stop = 1;
    } else w.crossing = false;
    const dx = gx - w.x, dy = gy - w.y, d = Math.hypot(dx, dy);
    if (d > stop) {
      const step = Math.min(d - stop, WATCH.speed * (foe ? WRATH.watchSpeed : 1) * dt), ux = dx / d, uy = dy / d;
      const nx = w.x + ux * step, ny = w.y + uy * step;
      const free = (x: number, y: number) => { for (const [ox, oy] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) if (isSolidAt(x + ox, y + oy) || isDecorSolidAt(x + ox, y + oy)) return false; return true; };
      const ox = w.x, oy = w.y;
      if (free(nx, w.y)) w.x = nx;
      if (free(w.x, ny)) w.y = ny;
      w.ax = ux; w.ay = uy;
      // Only walk when he really gets somewhere (Murat: guards marched on the spot when a wall was in the way)
      const moved = Math.hypot(w.x - ox, w.y - oy) > step * 0.3;
      w.moving = moved;
      if (moved) w.stuckSince = 0;
      else if (!w.stuckSince) w.stuckSince = now;
      else if (now - w.stuckSince > 1200) {
        // can't get there: give up on that monster (and ignore it a while), or stand where he is if it was his post
        if (t && !foe) { w.ignore = w.target; w.ignoreUntil = now + 8000; w.target = ""; }
        w.stuckSince = 0;
      }
      return;
    }
    w.stuckSince = 0;
    w.moving = false;
    if (t) {
      const td = Math.hypot(t.x - w.x, t.y - w.y) || 1;
      w.ax = (t.x - w.x) / td; w.ay = (t.y - w.y) / td;
      if (now >= w.nextHit) { w.nextHit = now + (foe ? WRATH.watchHitEveryMs : WATCH.hitEveryMs); w.strikeAt = now + WATCH.windMs; w.swing++; }
    } else if (Math.hypot(w.x - P.x, w.y - P.y) <= 2) { w.ax = -P.nx; w.ay = -P.ny; } // back on post, eyes on the road
  }

  /** A watchman's spear finds its mark: knockback, a short stagger, no loot or XP if it dies. */
  private watchHits(w: Watchman, oid: string, o: Mob, now: number) {
    const dmg = WATCH.damage(o.maxHp);
    o.hp -= dmg;
    o.stunUntil = Math.max(o.stunUntil, now + WATCH.stunMs);
    const d = Math.hypot(o.x - w.x, o.y - w.y) || 1;
    const k = moveStep(o.x, o.y, pushInput([(o.x - w.x) / d, (o.y - w.y) / d]), WATCH.knockback / 100, 100);
    if (!isSafeZone(k.x, k.y)) { o.x = k.x; o.y = k.y; }
    this.broadcast("hit", { id: oid, dmg, crit: false, dot: false });
    if (o.hp <= 0) { this.mobDied(o, oid, "watch", "The village watch"); w.target = ""; }
  }

  /** When each lair chest's missing guardians come back (chest id -> server time). */
  private guardBack = new Map<string, number>();

  /** Lair chests (shared/chests.ts) keep their guardians: a missing one returns GUARD_RESPAWN_MS after it fell. */
  private updateGuards(now: number) {
    const alive = new Map<string, number>(); // "chestId|kind" -> living guardians
    this.state.mobs.forEach((m) => { if (m.guard && !m.dead) alive.set(`${m.guard}|${m.kind}`, (alive.get(`${m.guard}|${m.kind}`) ?? 0) + 1); });
    for (const c of CHESTS) {
      if (!c.guards) continue;
      const missing = (Object.entries(c.guards) as [MobKind, number][]).flatMap(([k, n]) => Array(Math.max(0, n - (alive.get(`${c.id}|${k}`) ?? 0))).fill(k) as MobKind[]);
      if (!missing.length) { this.guardBack.delete(c.id); continue; }
      const at = this.guardBack.get(c.id);
      if (at === undefined) { this.guardBack.set(c.id, this.guardsSpawned ? now + GUARD_RESPAWN_MS : now); continue; }
      if (now < at) continue;
      if (this.playerNear(c.x, c.y, NO_SPAWN_RANGE)) continue; // guardians return once nobody is around the chest
      for (const k of missing) this.spawnGuard(k, c);
      this.guardBack.delete(c.id);
    }
    this.guardsSpawned = true;
  }
  private guardsSpawned = false;

  private spawnGuard(kind: MobKind, c: (typeof CHESTS)[number]) {
    const id = `g${++this.mobSeq}`;
    this.spawnMob(kind, 0, id);
    const m = this.state.mobs.get(id)!;
    m.zone = -1; // not part of a zone count; deleted when it dies, updateGuards brings a new one
    m.guard = c.id;
    // stands around the chest, on free ground
    let x = c.x, y = c.y + TILE;
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2, r = TILE * (0.9 + Math.random() * 0.9);
      const tx = c.x + Math.cos(a) * r, ty = c.y + Math.sin(a) * r;
      if (!isSolidAt(tx, ty)) { x = tx; y = ty; break; }
    }
    m.x = m.homeX = x; m.y = m.homeY = y;
    m.level = kind === "banditchief" ? regionSpecialLevel(c.level - 1) : regionMobLevel(c.level - 1);
    m.hp = m.maxHp = Math.round(MOBS[kind].maxHp * mobScale(m.level, "hp"));
    if (kind === "banditchief") { m.camp = true; m.post = -1; } // leads the camp: hears the horn, rallies his men
  }

  /** Living guardians of a chest (near it: one lured far away still counts until it dies). */
  private guardsAlive(cid: string): number {
    let n = 0;
    this.state.mobs.forEach((m) => { if (m.guard === cid && !m.dead) n++; });
    return n;
  }

  // ---- The dead keep the night (shared/daynight.ts, Murat 2026-11-05) -------------------------------------

  /** True from mid-dusk to late dawn: skeleton zones are full, rituals happen, necromancers and other undead bosses walk. */
  private undeadUp = isUndeadNight(worldDayFrac(Date.now()));
  private nextUndeadCheck = 0;

  /** How many of an undead zone's monsters stay up by day (never its necromancers). */
  private dayCap(zi: number, cap: number): number {
    const bosses = NIGHT_BOSSES.reduce((n, k) => n + (SPAWN_ZONES[zi].mobs[k] ?? 0), 0);
    return Math.ceil(Math.max(0, cap - bosses) * UNDEAD_NIGHT.dayShare);
  }

  /** Dusk and dawn: tell everyone; by day the idle dead away from heroes sink back into the earth. */
  private updateUndeadNight(now: number) {
    if (now < this.nextUndeadCheck) return;
    this.nextUndeadCheck = now + 1000;
    const up = isUndeadNight(worldDayFrac(now));
    if (up !== this.undeadUp) {
      this.undeadUp = up;
      this.broadcast("undeadnight", { up });
      SPAWN_ZONES.forEach((z) => { const zone = this.state.zones.get(z.name); if (zone) zone.nextAt = 0; }); // restart the timers at the new pace
    }
    if (up) return;
    // Who could go to ground this second: per undead zone, plus the bosses out of their zone (quest and ritual summons)
    const idle = (m: Mob) => !m.dead && !m.target && !m.ritual && !m.guard && !m.mergeInto && m.specialAt === 0 && !this.playerNear(m.x, m.y, UNDEAD_NIGHT.sinkClear);
    const byZone = new Map<number, [string, Mob][]>();
    this.state.mobs.forEach((m, id) => {
      if (m.dead) return;
      if (m.zone < 0) {
        if (NIGHT_BOSSES.includes(m.kind) && !m.target && m.specialAt === 0) this.sinkMob(m, id); // no fight on: back to the grave
        return;
      }
      if (!UNDEAD_ZONES.has(m.zone) || !idle(m)) return;
      (byZone.get(m.zone) ?? byZone.set(m.zone, []).get(m.zone)!).push([id, m]);
    });
    byZone.forEach((list, zi) => {
      const zone = this.state.zones.get(SPAWN_ZONES[zi].name);
      if (!zone) return;
      // bosses first, then the idle, the siege workers last (they are the busy few who stay up)
      list.sort(([, a], [, b]) => Number(NIGHT_BOSSES.includes(b.kind)) - Number(NIGHT_BOSSES.includes(a.kind)) || Number(!!a.work) - Number(!!b.work));
      let over = zone.alive - this.dayCap(zi, zone.cap);
      for (const [id, m] of list.slice(0, 4)) {
        if (NIGHT_BOSSES.includes(m.kind)) { this.sinkMob(m, id); continue; }
        if (over-- <= 0) break;
        this.sinkMob(m, id);
      }
    });
  }

  /** One of the dead lies back down in the earth until night: gone without loot or XP, back when its zone refills. */
  private sinkMob(m: Mob, id: string) {
    this.broadcast(NIGHT_BOSSES.includes(m.kind) ? "banish" : "gravesink", { id, x: Math.round(m.x), y: Math.round(m.y) });
    m.dead = true; m.hp = 0; m.hidden = false; m.work = ""; m.spot = ""; m.target = ""; m.moving = false; m.banishAt = 0;
    this.state.mobs.forEach((c, cid) => { // its raised dead (a necromancer's, the Hollow King's servants) go with it
      if (c.mother !== id || c.dead) return;
      c.dead = true; c.hp = 0;
      this.clock.setTimeout(() => this.state.mobs.delete(cid), 500);
    });
    if (m.zone < 0) { this.clock.setTimeout(() => this.state.mobs.delete(id), 500); return; }
    const zone = this.state.zones.get(SPAWN_ZONES[m.zone].name);
    if (zone) zone.alive--;
  }

  /** Per-zone respawn timers: while a zone is below its cap, revive one dead monster every respawnMs. */
  private updateZones(now: number) {
    SPAWN_ZONES.forEach((z, zi) => {
      const zone = this.state.zones.get(z.name)!;
      // The dead keep the night: by day only a few of them are up and no necromancer walks; by night they climb out fast
      const undead = UNDEAD_ZONES.has(zi), day = undead && !this.undeadUp;
      const cap = day ? this.dayCap(zi, zone.cap) : zone.cap;
      const every = undead && !day ? Math.min(z.respawnMs, UNDEAD_NIGHT.riseMs) : z.respawnMs;
      if (zone.alive >= cap) { zone.nextAt = 0; if (zone.nextIn) zone.nextIn = 0; return; }
      if (!zone.nextAt || zone.nextAt > now + every) zone.nextAt = now + every;
      if (now >= zone.nextAt) {
        let revived = false, blocked = false;
        this.state.mobs.forEach((m, id) => {
          if (revived || blocked || !m.dead || m.zone !== zi) return;
          if (day && NIGHT_BOSSES.includes(m.kind)) return;
          const at = this.freeSpawnPoint(zi, m.kind);
          if (!at) { blocked = true; return; }
          this.spawnMob(m.kind, zi, id, at);
          if (undead) this.broadcast("necroraise", { pts: [[Math.round(m.x), Math.round(m.y)]], rise: 1 }); // climbing out of the ground
          revived = true;
        });
        if (revived) zone.alive++;
        // No free spot (a hero is standing all over a small zone): try again shortly
        zone.nextAt = blocked ? now + 2000 : zone.alive < cap ? now + every : 0;
      }
      const secs = zone.nextAt ? Math.ceil((zone.nextAt - now) / 1000) : 0;
      if (zone.nextIn !== secs) zone.nextIn = secs;
    });
  }

  private playerNear(x: number, y: number, r: number): boolean {
    for (const p of this.state.players.values()) if (!p.dead && Math.abs(p.x - x) < r && Math.abs(p.y - y) < r) return true;
    return false;
  }

  private updateMob(m: Mob, id: string, dt: number, now: number) {
    tickPoise(m, mobPoiseMax(m), dt, now);
    if (m.dead) { m.moving = false; m.winding = false; m.windUntil = 0; return; }
    if (m.banishAt && now >= m.banishAt && !m.specialAt) {
      // the summoned demon's time is up: it sinks back into the ground
      this.broadcast("banish", { id, x: Math.round(m.x), y: Math.round(m.y) });
      m.dead = true; m.hp = 0;
      this.clock.setTimeout(() => this.state.mobs.delete(id), 500);
      return;
    }
    const def = mobDef(m, now);
    if (m.ritual && !Number.isNaN(m.riteX)) {
      // walking to its place at the star (BONES.ritual), deaf to everything else
      const d = Math.hypot(m.riteX - m.x, m.riteY - m.y);
      m.winding = false;
      if (d < 4) { m.moving = false; m.dir = m.riteY > m.y + 2 ? "down" : "up"; return; }
      const go = toward(m.x, m.y, m.riteX, m.riteY), r = moveStep(m.x, m.y, go, dt, Math.min(def.speed * 1.15, d / dt));
      if (this.canStep(m, r.x, r.y)) { m.x = r.x; m.y = r.y; }
      m.moving = r.moving; m.dir = dirFromInput(go, m.dir);
      return;
    }
    m.stunned = now < m.stunUntil;
    if (m.stunned || m.broken) { m.winding = false; m.windUntil = 0; }
    m.slowed = now < m.slowUntil;
    if (m.stunned) { m.moving = false; return; }
    // Nobody around: the monster dozes (no wandering, no budding), which keeps big monster counts cheap
    if (!m.target && !this.playerNear(m.x, m.y, SLEEP_RANGE)) { if (m.moving) m.moving = false; return; }
    if (m.kind === "motherblob" && now >= m.nextBrood) this.brood(m, id, now);
    if (m.hidden) return this.updateHidden(m, id, dt, now);
    // Answering a merge call: rush to the caller and fuse on contact
    if (m.mergeInto) {
      const h = this.state.mobs.get(m.mergeInto);
      if (!h || h.dead || h.hidden) m.mergeInto = "";
      else {
        if (Math.hypot(h.x - m.x, h.y - m.y) <= MERGE.touch) return this.absorb(h, m.mergeInto, m, id);
        const go = toward(m.x, m.y, h.x, h.y);
        const r = moveStep(m.x, m.y, go, dt, def.speed * MERGE.speedMult * (m.slowed ? SLOW_MOB : 1));
        if (this.canStep(m, r.x, r.y)) { m.x = r.x; m.y = r.y; }
        else m.mergeInto = "";
        m.moving = r.moving; m.dir = dirFromInput(go, m.dir);
        return;
      }
    }

    // Drop target if it died, left, went into the safe zone, or pulled us too far from home
    let t = m.target ? this.state.players.get(m.target) : undefined;
    if (t && (t.dead || isSafeZone(t.x, t.y) || Math.hypot(m.x - m.homeX, m.y - m.homeY) > def.leash)) {
      m.target = ""; t = undefined;
    }
    let foe: Mob | undefined = FACTION[m.kind] && !t ? this.foeOf(m, def) : undefined;
    // Aggro: pick whoever it hates most, hero or rival monster
    if (m.hate > 0) m.hate = Math.max(0, m.hate - AGGRO.decayPerSec * dt);
    if (now >= m.nextAggro) {
      m.nextAggro = now + AGGRO.everyMs * (0.8 + Math.random() * 0.4);
      this.pickTarget(m, def);
      t = m.target ? this.state.players.get(m.target) : undefined;
      foe = m.foe ? this.state.mobs.get(m.foe) : undefined;
    }

    // A worker drops its tools the moment it has someone to fight (and its gang looks up too)
    if (m.work && (t || foe || m.spot)) this.dropWork(m, id, now);
    // Redfang Hollow: lookouts blow the horn, the chief rallies his camp and calls for more men
    if (t && m.perch && now >= m.nextHorn) this.blowHorn(m, id, now);
    if (t && m.kind === "banditchief") this.chiefOrders(m, id, now);

    // Dizzy: run for the nearest grave/tree if there is one
    if (t && m.broken && !m.spot && HIDE.spots[m.kind]) this.claimSpot(m, m.x, m.y, HIDE.fleeRadius, now, true);
    // Heading for a hiding spot (a calm monster forgets it as soon as it has someone to fight)
    if (m.spot && !m.fleeing && t) m.spot = "";
    if (m.spot && now > m.seekUntil) { m.spot = ""; m.fleeing = false; }
    if (m.spot) {
      if (Math.hypot(m.outX - m.x, m.outY - m.y) < 5) return this.hide(m, id, now);
      const go = toward(m.x, m.y, m.outX, m.outY);
      const r = moveStep(m.x, m.y, go, dt, def.speed * (m.fleeing ? POISE.fleeSpeed : 0.6) * (m.slowed ? SLOW_MOB : 1));
      if (this.canStep(m, r.x, r.y)) { m.x = r.x; m.y = r.y; }
      m.moving = r.moving;
      m.dir = dirFromInput(go, m.dir);
      return;
    }

    if (m.canHeal && now >= m.nextHeal) this.blobHeal(m, id, now);
    // A blob in danger calls for help
    if ((t || m.threat >= AGGRO.dangerGap) && TownRoom.canMerge(m) && now >= m.nextCall && !m.broken && this.mergeLevelOk(m)) {
      let crowd = 0;
      this.state.players.forEach((p) => { if (!p.dead && Math.hypot(p.x - m.x, p.y - m.y) <= MERGE.crowdRange) crowd++; });
      // In danger: badly hurt, crowded, or facing a hero far above its level (merging adds up their levels)
      if (m.hp < m.maxHp * MERGE.hpFrac || crowd >= MERGE.crowd || m.threat >= AGGRO.dangerGap) this.blobCall(m, id, now);
    }

    if (t && m.kind === "demon" && !m.broken && !m.specialAt) this.demonBones(m, id, t, Math.hypot(t.x - m.x, t.y - m.y), now);
    let input: InputState;
    const ranged = !!rangedOf(m) && m.merged <= 1; // a merged blob is a brawler that also spits if it can
    if (t && m.broken) {
      // Broken: dizzy, can't fight back, tries to get away from the attacker
      input = toward(m.x, m.y, m.x * 2 - t.x, m.y * 2 - t.y);
    } else if (t && ranged) {
      // Shooters, healers and casters hang back: step away when crowded, close in when too far
      const dist = Math.hypot(t.x - m.x, t.y - m.y);
      const cfg = rangedOf(m)!;
      const melee = meleeOf(m);
      input = dist < cfg.keepAway ? toward(m.x, m.y, m.x * 2 - t.x, m.y * 2 - t.y) : dist > cfg.far ? this.go(m, t.x, t.y, now) : STILL;
      if (m.kind === "necromancer" && this.necroSpell(m, id, t, dist, now)) input = STILL;
      else if (ELEM_MOVE[m.kind] && this.elemSpecial(m, id, t, dist, now)) input = STILL;
      else if (cfg.shot) {
        if (m.windUntil) {
          input = STILL;
          if (now >= m.windUntil) {
            m.windUntil = 0; m.winding = false; m.lastAttack = now;
            if (dist <= cfg.range * 1.2) {
              this.mobShot(m, id, t.x, t.y);
              if (m.kind === "bandit" && now >= m.nextVolley) this.volley(m, id, t, now);
            }
          }
        } else if (dist <= cfg.range && now - m.lastAttack >= def.attackCooldownMs * melee.cooldown / poiseSpeed(poiseFrac(m, mobPoiseMax(m)))) {
          m.windUntil = now + melee.windupMs; m.winding = true;
        }
      }
      if (input === STILL) m.dir = Math.abs(t.x - m.x) > Math.abs(t.y - m.y) ? (t.x > m.x ? "right" : "left") : (t.y > m.y ? "down" : "up");
    } else if (t && m.kind === "demon" && this.demonSpecial(m, id, Math.hypot(t.x - m.x, t.y - m.y), now)) {
      input = STILL;
    } else if ((t || m.specialAt) && m.kind === "hollowking" && this.kingSpecial(m, id, t, t ? Math.hypot(t.x - m.x, t.y - m.y) : 0, now)) {
      input = STILL;
    } else if ((t || m.specialAt) && (ELEM_MOVE[m.kind] || m.parts) && TownRoom.elemMoves(m).length && this.elemSpecial(m, id, t, t ? Math.hypot(t.x - m.x, t.y - m.y) : 0, now)) {
      input = STILL;
    } else if (t && m.kind === "motherblob" && this.motherSpecial(m, id, Math.hypot(t.x - m.x, t.y - m.y), now)) {
      input = STILL;
    } else if ((t || m.specialAt) && (m.kind === "banditchief" || m.weapon === "brute") && this.banditSpecial(m, id, t, t ? Math.hypot(t.x - m.x, t.y - m.y) : 0, now)) {
      input = STILL;
    } else if (t) {
      const dist = Math.hypot(t.x - m.x, t.y - m.y);
      // Warrior blob: lunge at a target a few steps away
      if (m.canCharge && !m.windUntil && now >= m.nextCharge && dist >= BLOB_AI.warrior.chargeMin && dist <= BLOB_AI.warrior.chargeMax) {
        m.chargeUntil = now + BLOB_AI.warrior.chargeMs; m.nextCharge = now + BLOB_AI.warrior.cooldownMs; m.chargeMult = BLOB_AI.warrior.chargeMult;
        this.broadcast("blobcharge", { id });
      }
      // Cutthroat: darts in and stabs on arrival
      const D = BANDIT_AI.dash;
      if (m.kind === "bandit" && m.weapon === "cutthroat" && !m.broken && !m.windUntil && now >= m.nextCharge && dist >= D.min && dist <= D.max) {
        m.chargeUntil = now + D.ms; m.nextCharge = now + D.cooldownMs; m.chargeMult = D.mult; m.dashHit = true;
        this.broadcast("bdash", { id });
      }
      if (m.dashHit && now > m.chargeUntil + 250) m.dashHit = false; // missed
      const melee = meleeOf(m);
      // Merged blob that swallowed a shooter: spits slime balls while closing in
      if (m.merged > 1 && m.canShoot && !m.windUntil && now >= m.nextShot && dist > melee.range * 2 && dist <= BLOB_AI.shooter.range) {
        m.nextShot = now + MERGE.shotEveryMs;
        this.mobShot(m, id, t.x, t.y, RANGED.shooterblob!);
      }
      if (m.dashHit && dist <= melee.range + 4) {
        // the dash lands: a stab right away, no wind-up
        m.dashHit = false; m.chargeUntil = 0; m.lastAttack = now;
        this.broadcast("swing", { id });
        this.damagePlayer(m.target, Math.round(def.damage * D.dmgMult * mobScale(m.level, "damage")), def.name, DIR_OFFSET[m.dir], 1.5, { atkLevel: m.level, from: id });
      }
      if (dist <= melee.range || m.windUntil) {
        input = STILL;
        m.dir = Math.abs(t.x - m.x) > Math.abs(t.y - m.y) ? (t.x > m.x ? "right" : "left") : (t.y > m.y ? "down" : "up");
        if (m.windUntil) {
          // Wind-up done: the blow lands if the target is still close
          if (now >= m.windUntil) {
            m.windUntil = 0; m.winding = false; m.lastAttack = now;
            if (dist <= melee.range + 6) {
              this.broadcast("swing", { id });
              const mel = MOB_MELEE_ELEMENT[m.kind];
              this.damagePlayer(m.target, Math.round(def.damage * melee.dmg * mobScale(m.level, "damage")), def.name, DIR_OFFSET[m.dir], 1,
                { atkLevel: m.level, from: id, mobEl: mel, slowMs: mel === "cold" ? ELEMENT_FX.cold.heroSlowMs : undefined });
            }
          }
        } else if (now - m.lastAttack >= def.attackCooldownMs * melee.cooldown / poiseSpeed(poiseFrac(m, mobPoiseMax(m)))) {
          m.windUntil = now + melee.windupMs; m.winding = true; // telegraph, a hit interrupts it
        }
      } else if (!Number.isNaN(m.flankA)) {
        // Pack attack: swing round to its own side of the hero while closing in
        const cur = Math.atan2(m.y - t.y, m.x - t.x);
        let diff = m.flankA - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const a = cur + Math.max(-BONES.flankTurn, Math.min(BONES.flankTurn, diff));
        // circle round outside its reach until on its side, then close in
        const r = Math.abs(diff) > 0.35 ? Math.max(melee.range + 12, dist * 0.9) : Math.max(melee.range * BONES.flankRadius, dist * 0.75);
        input = toward(m.x, m.y, t.x + Math.cos(a) * r, t.y + Math.sin(a) * r);
      } else {
        input = this.go(m, t.x, t.y, now);
      }
    } else if (foe && !m.broken) {
      // Fighting a monster of the other side: walk up and hit it (everyone brawls here, no special moves)
      const dist = Math.hypot(foe.x - m.x, foe.y - m.y);
      const melee = meleeOf(m);
      if (dist <= melee.range || m.windUntil) {
        input = STILL;
        m.dir = Math.abs(foe.x - m.x) > Math.abs(foe.y - m.y) ? (foe.x > m.x ? "right" : "left") : (foe.y > m.y ? "down" : "up");
        if (m.windUntil) {
          if (now >= m.windUntil) {
            m.windUntil = 0; m.winding = false; m.lastAttack = now;
            if (dist <= melee.range + 6) {
              this.broadcast("swing", { id });
              this.mobHitsMob(m, id, foe, m.foe, Math.round(def.damage * melee.dmg * mobScale(m.level, "damage") * FEUD.dmgMult));
            }
          }
        } else if (now - m.lastAttack >= def.attackCooldownMs * melee.cooldown) {
          m.windUntil = now + melee.windupMs; m.winding = true;
        }
      } else input = this.go(m, foe.x, foe.y, now);
    } else if (m.job >= 0 && !m.guard) {
      input = this.work(m, now); // back to the siege works
    } else if (m.camp && CAMP_POSTS[m.post]?.route) {
      input = this.patrolStep(m, now); // walk the trail, back and forth
    } else if (Math.hypot(m.x - m.homeX, m.y - m.homeY) > 40) {
      input = this.go(m, m.homeX, m.homeY, now); // walk back home
    } else {
      if (now > m.nextWander) {
        // Idle or stroll in a random 8-way direction
        const dx = Math.floor(Math.random() * 3) - 1, dy = Math.floor(Math.random() * 3) - 1;
        m.wander = Math.random() < 0.4 ? STILL : { right: dx > 0, left: dx < 0, down: dy > 0, up: dy < 0 };
        m.nextWander = now + 800 + Math.random() * 2000;
        if (HIDE.spots[m.kind] && Math.random() < HIDE.idleChance) this.claimSpot(m, m.homeX, m.homeY, HIDE.idleRadius, now, false);
      }
      input = m.wander;
    }

    const charge = now < m.chargeUntil ? m.chargeMult : 1;
    const speed = (t || foe ? def.speed * (m.broken ? POISE.fleeSpeed : 1) * charge : def.speed * 0.5) * (m.slowed ? SLOW_MOB : 1);
    const r = moveStep(m.x, m.y, input, dt, speed);
    if (m.camp && r.moving && !t && !foe) {
      // a patrol stuck on a tree steps aside for a moment
      if (Math.hypot(r.x - m.x, r.y - m.y) < speed * dt * 0.25) { m.stuckSince ||= now; } else m.stuckSince = 0;
      if (m.stuckSince && now - m.stuckSince > 900) {
        m.stuckSince = 0; m.detourUntil = now + 700 + Math.random() * 500;
        const a = Math.floor(Math.random() * 8) * Math.PI / 4;
        m.wander = { right: Math.cos(a) > 0.3, left: Math.cos(a) < -0.3, down: Math.sin(a) > 0.3, up: Math.sin(a) < -0.3 };
      }
    }
    if (this.canStep(m, r.x, r.y)) { m.x = r.x; m.y = r.y; }
    m.moving = r.moving;
    m.dir = dirFromInput(input, m.dir);
  }

  /** May a walking monster step to (x,y)? Never into the safe zone or a peaceful place; a Mother Blob never closer to Oakvale than MOTHER_KEEP_OUT (she may still step back out). */
  private canStep(m: Mob, x: number, y: number): boolean {
    if (isSafeZone(x, y) || noMobsAt(x, y)) return false;
    if (m.kind === "motherblob") { const d = villageDist(x, y); if (d < MOTHER_KEEP_OUT && d < villageDist(m.x, m.y)) return false; }
    return true;
  }

  // ---- Redfang Hollow bandits (shared/bandits.ts) -----------------------------

  /** Patrol: walk to the next point of the route; at the end turn round. Home follows, so after a fight it carries on. */
  private patrolStep(m: Mob, now: number): InputState {
    if (now < m.detourUntil) return m.wander;
    const route = CAMP_POSTS[m.post].route!;
    m.pLeg = Math.max(0, Math.min(route.length - 1, m.pLeg));
    const [tx, ty] = route[m.pLeg], x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    m.homeX = x; m.homeY = y;
    if (Math.hypot(x - m.x, y - m.y) < 10) {
      if (m.pLeg + m.pDir < 0 || m.pLeg + m.pDir >= route.length) m.pDir = -m.pDir;
      m.pLeg += m.pDir;
      if (Math.random() < 0.3) m.detourUntil = now + 1200; // a short halt to look around
      m.wander = STILL;
      return STILL;
    }
    return this.go(m, x, y, now);
  }

  /** Walk toward (x,y): camp bandits find their way round walls through the gates, others go straight. */
  private go(m: Mob, x: number, y: number, now: number): InputState {
    if (!m.camp || clearWalk(m.x, m.y, x, y)) { m.path = []; return toward(m.x, m.y, x, y); }
    const moved = Math.hypot(x - m.pathTX, y - m.pathTY) > TILE;
    if (!m.path.length || moved || now > m.pathAt + 1500) {
      m.path = findPath(m.x, m.y, x, y); m.pathAt = now; m.pathTX = x; m.pathTY = y;
    }
    // skip the points already reached, and any we can see past
    while (m.path.length > 1 && (Math.hypot(m.path[0][0] - m.x, m.path[0][1] - m.y) < 8 || clearWalk(m.x, m.y, m.path[1][0], m.path[1][1]))) m.path.shift();
    const p = m.path[0];
    return p ? toward(m.x, m.y, p[0], p[1]) : toward(m.x, m.y, x, y);
  }

  private lastHorn = 0;
  /** A lookout spots a hero: the horn sounds and the whole camp (and the patrols nearby) comes for him. */
  private blowHorn(m: Mob, id: string, now: number) {
    const H = BANDIT_AI.horn;
    m.nextHorn = now + H.cooldownMs;
    if (now - this.lastHorn > 6000) { this.lastHorn = now; this.broadcast("horn", { id, x: Math.round(m.x), y: Math.round(m.y) }); }
    this.alertCamp(m.x, m.y, H.range, m.target, now);
  }

  /** Every camp bandit (and the chief) within r px drops what it was doing and goes for the hero. */
  private alertCamp(x: number, y: number, r: number, heroId: string, now: number) {
    if (!this.state.players.has(heroId)) return;
    const ids: string[] = [];
    this.state.mobs.forEach((o, oid) => {
      if (o.dead || !(o.camp || o.kind === "banditchief") || Math.hypot(o.x - x, o.y - y) > r) return;
      o.alertUntil = now + BANDIT_AI.horn.alertMs; o.alertHero = heroId;
      if (o.perch) return; // lookouts keep shooting from their towers
      if (!o.target) { o.target = heroId; o.foe = ""; o.nextAggro = now + AGGRO.everyMs; ids.push(oid); }
      if (o.hateId !== heroId || o.hate < AGGRO.hitBase) this.addHate(o, heroId, 0);
    });
    if (ids.length) this.broadcast("alert", { ids });
  }

  /** Bandit hit by a hero: shouts for the others close by. */
  private banditShout(m: Mob, id: string, heroId: string, now: number) {
    if (now < m.nextCall) return;
    m.nextCall = now + BANDIT_AI.shout.cooldownMs;
    this.broadcast("bshout", { id });
    this.alertCamp(m.x, m.y, BANDIT_AI.shout.range, heroId, now);
  }

  /** Archers now and then loose two more arrows beside the aimed one. */
  private volley(m: Mob, id: string, t: Player, now: number) {
    const V = BANDIT_AI.volley;
    m.nextVolley = now + V.everyMs * (0.8 + Math.random() * 0.4);
    const a0 = Math.atan2(t.y - m.y, t.x - m.x), d = Math.hypot(t.x - m.x, t.y - m.y);
    for (let k = 1; k < V.arrows; k++) {
      const a = a0 + (k % 2 ? 1 : -1) * V.spread * Math.ceil(k / 2);
      this.mobShot(m, id, m.x + Math.cos(a) * d, m.y + Math.sin(a) * d);
    }
    this.broadcast("volley", { id });
  }

  /** The chief: War Cry (rallies everyone around him) and, once badly hurt, two more cutthroats out of the huts. */
  private chiefOrders(m: Mob, id: string, now: number) {
    const W = CHIEF.warCry;
    if (now >= m.nextCry && !m.broken) {
      m.nextCry = now + W.cooldownMs;
      const ids: string[] = [id];
      m.rallyUntil = now + W.buffMs;
      this.state.mobs.forEach((o, oid) => {
        if (oid === id || o.dead || !o.camp || Math.hypot(o.x - m.x, o.y - m.y) > W.range) return;
        o.rallyUntil = now + W.buffMs; ids.push(oid);
      });
      this.broadcast("warcry", { id, ids, ms: W.buffMs });
      this.alertCamp(m.x, m.y, W.range, m.target, now);
    }
    if (!m.reinforced && m.hp < m.maxHp * CHIEF.reinforce.hpFrac) {
      m.reinforced = true;
      const pts: [number, number][] = [];
      let extra = 0; // his men still alive from an earlier fight count too
      this.state.mobs.forEach((o) => { if (!o.dead && o.kind === "bandit" && o.camp && o.post < 0) extra++; });
      for (let i = extra; i < CHIEF.reinforce.count; i++) {
        const c = this.callReinforcement(m, id);
        if (c) pts.push([Math.round(c.x), Math.round(c.y)]);
      }
      this.broadcast("reinforce", { id, pts });
    }
  }

  /** One extra cutthroat runs out next to the chief (his own man: no post, never respawns). */
  private callReinforcement(chief: Mob, chiefId: string): Mob | undefined {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 30;
      const x = chief.x + Math.cos(a) * r, y = chief.y + Math.sin(a) * r;
      if (isSolidAt(x, y) || isSafeZone(x, y) || noMobsAt(x, y)) continue;
      const c = new Mob();
      c.kind = "bandit"; c.weapon = "cutthroat"; c.zone = -1; c.mother = chiefId; c.camp = true; c.post = -1;
      c.x = c.homeX = x; c.y = c.homeY = y; c.level = chief.level;
      c.hp = c.maxHp = Math.round(mobDef(c).maxHp * mobScale(c.level, "hp"));
      c.target = chief.target; c.alertUntil = Date.now() + BANDIT_AI.horn.alertMs; c.rallyUntil = chief.rallyUntil;
      c.stunUntil = Date.now() + 350;
      this.state.mobs.set(`k${++this.mobSeq}`, c);
      return c;
    }
    return undefined;
  }

  /**
   * Telegraphed moves (true while busy, it stands still). Brute: Cleave. Chief: Sweep, and Leap: marks the
   * ground under the hero, jumps, and lands there hitting everyone around (stuns).
   */
  private banditSpecial(m: Mob, id: string, t: Player | undefined, dist: number, now: number): boolean {
    const chief = m.kind === "banditchief", S = chief ? CHIEF.sweep : BANDIT_AI.cleave, L = CHIEF.leap;
    if (m.specialAt) {
      if (now < m.specialAt) return true;
      const kind = m.specialKind;
      m.specialAt = 0; m.winding = false; m.lastAttack = now; m.specialKind = "";
      if (kind === "leap") {
        // take off toward the mark; lands after the flight
        m.specialKind = "land"; m.specialAt = now + L.flightMs;
        this.broadcast("chiefleap", { id, x: Math.round(m.castX), y: Math.round(m.castY), ms: L.flightMs });
        return true;
      }
      if (kind === "land" && !isSolidAt(m.castX, m.castY) && !isSafeZone(m.castX, m.castY) && !noMobsAt(m.castX, m.castY)) { m.x = m.castX; m.y = m.castY; }
      const radius = kind === "land" ? L.radius : S.radius;
      const dmg = Math.round(mobDef(m, now).damage * mobScale(m.level, "damage") * (kind === "land" ? L.dmgMult : S.dmgMult));
      const name = chief ? (kind === "land" ? "Redfang Chief's Leap" : "Redfang Chief's Sweep") : "Brute's Cleave";
      this.state.players.forEach((p, pid) => {
        if (p.dead) return;
        const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy);
        if (d > radius) return;
        this.damagePlayer(pid, dmg, name, d > 0.1 ? [dx / d, dy / d] : [0, 1], kind === "land" ? 1.5 : S.knockback, { atkLevel: m.level, from: id, stunMs: kind === "land" ? L.stunMs : undefined });
      });
      this.broadcast("bhit", { id, kind: kind === "land" ? "leap" : chief ? "sweep" : "cleave", x: Math.round(m.x), y: Math.round(m.y), r: radius });
      return true;
    }
    if (!t || m.broken || m.windUntil || m.stunned) return false;
    if (chief && now >= m.nextLeap && dist >= L.min && dist <= L.max) {
      m.specialKind = "leap"; m.specialAt = now + L.windupMs; m.nextLeap = now + L.cooldownMs;
      m.castX = t.x; m.castY = t.y;
      this.broadcast("bwind", { id, kind: "leap", ms: L.windupMs + L.flightMs, x: Math.round(t.x), y: Math.round(t.y), r: L.radius });
    } else if (now >= m.nextSweep && dist <= S.range) {
      m.specialKind = "sweep"; m.specialAt = now + S.windupMs; m.nextSweep = now + S.cooldownMs;
      this.broadcast("bwind", { id, kind: chief ? "sweep" : "cleave", ms: S.windupMs, x: Math.round(m.x), y: Math.round(m.y), r: S.radius });
    } else return false;
    m.winding = true;
    return true;
  }

  /**
   * The Hollow King's moves (HOLLOW_KING): every one is marked on the ground first ("hkwind"), then lands ("hkhit").
   * Crown Cleave round him up close; Gloam Pools under the heroes near him; below 60% HP he calls his servants;
   * below 30% Crown's Wrath, a ring of ash round him that only spares those standing close.
   */
  private kingSpecial(m: Mob, id: string, t: Player | undefined, dist: number, now: number): boolean {
    const K = HOLLOW_KING, frac = m.hp / Math.max(1, m.maxHp);
    const dmgOf = (mult: number) => Math.round(mobDef(m, now).damage * mobScale(m.level, "damage") * mult);
    if (m.specialAt) {
      if (now < m.specialAt) return true;
      const kind = m.specialKind;
      m.specialAt = 0; m.winding = false; m.lastAttack = now; m.specialKind = "";
      if (kind === "cleave" || kind === "wrath") {
        const C = kind === "cleave" ? K.cleave : K.wrath, inner = kind === "wrath" ? K.wrath.inner : 0, dmg = dmgOf(C.dmgMult);
        this.state.players.forEach((p, pid) => {
          if (p.dead) return;
          const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy);
          if (d > C.radius || d < inner) return;
          this.damagePlayer(pid, dmg, kind === "cleave" ? "Hollow King's Crown Cleave" : "Hollow King's Crown's Wrath", d > 0.1 ? [dx / d, dy / d] : [0, 1],
            kind === "cleave" ? K.cleave.knockback : 1.5, { atkLevel: m.level, from: id, mobEl: kind === "cleave" ? undefined : "cold" });
        });
        this.broadcast("hkhit", { id, kind, x: Math.round(m.x), y: Math.round(m.y), r: C.radius, inner });
      } else if (kind === "pools") {
        const dmg = dmgOf(K.pools.dmgMult);
        for (const [x, y] of m.pools) this.state.players.forEach((p, pid) => {
          if (p.dead || Math.hypot(p.x - x, p.y - y) > K.pools.radius) return;
          this.damagePlayer(pid, dmg, "Hollow King's Gloam Pool", [0, 0], 0, { atkLevel: m.level, from: id, slowMs: K.pools.slowMs, mobEl: "cold" });
        });
        this.broadcast("hkhit", { id, kind, pts: m.pools.map(([x, y]) => [Math.round(x), Math.round(y)]), r: K.pools.radius });
        m.pools = [];
      } else if (kind === "servants") {
        const pts: [number, number][] = [];
        let mine = 0;
        this.state.mobs.forEach((c) => { if (c.mother === id && !c.dead) mine++; });
        for (const k of K.servants.kinds) {
          if (mine >= K.servants.max) break;
          const c = this.raiseServant(m, id, k);
          if (c) { pts.push([Math.round(c.x), Math.round(c.y)]); mine++; }
        }
        this.broadcast("hkhit", { id, kind, pts });
      }
      return true;
    }
    if (!t || m.broken || m.windUntil || m.stunned) return false;
    let mine = 0;
    if (frac < K.servants.hpFrac) this.state.mobs.forEach((c) => { if (c.mother === id && !c.dead) mine++; });
    const wind = (kind: string, ms: number, extra: Record<string, unknown> = {}) => {
      m.specialKind = kind; m.specialAt = now + ms; m.winding = true;
      this.broadcast("hkwind", { id, kind, ms, x: Math.round(m.x), y: Math.round(m.y), ...extra });
    };
    if (frac < K.wrath.hpFrac && now >= m.nextLeap && dist <= K.wrath.radius) {
      m.nextLeap = now + K.wrath.cooldownMs;
      wind("wrath", K.wrath.windupMs, { r: K.wrath.radius, inner: K.wrath.inner });
    } else if (frac < K.servants.hpFrac && now >= m.nextRaise && mine < K.servants.max) {
      m.nextRaise = now + K.servants.everyMs;
      wind("servants", K.servants.castMs);
    } else if (now >= m.nextCircle && dist <= K.pools.range && dist > K.cleave.range) {
      // under the target and up to two more heroes close to him (or beside the target when alone)
      m.nextCircle = now + K.pools.cooldownMs;
      const near: Player[] = [t];
      this.state.players.forEach((p) => { if (p !== t && !p.dead && near.length < K.pools.count && Math.hypot(p.x - m.x, p.y - m.y) <= K.pools.range) near.push(p); });
      m.pools = [[t.x, t.y]];
      for (let i = 1; i < K.pools.count; i++) {
        const o = near[i], a = Math.random() * Math.PI * 2, r = K.pools.spread * (0.6 + Math.random() * 0.4);
        m.pools.push(o ? [o.x, o.y] : [t.x + Math.cos(a) * r, t.y + Math.sin(a) * r * 0.8]);
      }
      wind("pools", K.pools.windupMs, { pts: m.pools.map(([x, y]) => [Math.round(x), Math.round(y)]), r: K.pools.radius });
    } else if (now >= m.nextSweep && dist <= K.cleave.range) {
      m.nextSweep = now + K.cleave.cooldownMs;
      wind("cleave", K.cleave.windupMs, { r: K.cleave.radius });
    } else return false;
    return true;
  }

  /** One of the Hollow King's servants comes out of the ground beside him (belongs to him, crumbles when he falls). */
  private raiseServant(k: Mob, kingId: string, kind: MobKind): Mob | undefined {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 40;
      const x = k.x + Math.cos(a) * r, y = k.y + Math.sin(a) * r;
      if (isSolidAt(x, y) || isSafeZone(x, y)) continue;
      const c = new Mob();
      c.kind = kind; c.zone = -1; c.mother = kingId; c.servant = true;
      if (kind === "skeleton") c.weapon = rollSkeletonWeapon();
      if (kind === "shooterblob") c.canShoot = true;
      if (kind === "warriorblob") c.canCharge = true;
      c.x = c.homeX = x; c.y = c.homeY = y;
      c.level = regionMobLevel(k.level - HOLLOW_KING.servants.levelDrop);
      c.hp = c.maxHp = Math.round(MOBS[kind].maxHp * mobScale(c.level, "hp"));
      c.target = k.target;
      if (c.target) this.addHate(c, c.target, 0);
      c.stunUntil = Date.now() + 600; // climbing out
      this.state.mobs.set(`r${++this.mobSeq}`, c);
      return c;
    }
    return undefined;
  }

  private updateProjectile(s: Projectile, id: string, dt: number) {
    const ox = s.vx, oy = s.vy;
    // Sub-step so fast shots never skip over a target or a thin wall
    const total = s.speed * dt;
    const steps = Math.max(1, Math.ceil(total / 4));
    for (let i = 0; i < steps; i++) {
      s.x += (ox * total) / steps;
      s.y += (oy * total) / steps;
      s.traveled += total / steps;
      if (isSolidAt(s.x, s.y) || s.traveled >= s.range) return this.explode(s, id);
      const pulse = s.spec?.pulse;
      if (pulse && s.traveled - s.pulsed >= pulse.every) { s.pulsed = s.traveled; shotPulse(this.host, s.spec!, s.x, s.y); }
      if (s.mobLevel > 0) {
        // A monster's shot only hits players, once: it is used up on the first player it can hurt.
        // (It used to stay alive unless the hit was a kill, so it pushed and hurt the player every tick.)
        const now = Date.now();
        let pid = "";
        this.state.players.forEach((p, k) => {
          if (!pid && !p.dead && !isSafeZone(p.x, p.y) && now >= p.invulnUntil && Math.hypot(p.x - s.x, p.y - s.y) <= s.radius + HIT_RADIUS) pid = k;
        });
        if (pid) {
          this.damagePlayer(pid, s.damage, s.mobName, [s.vx, s.vy], 0.5, { atkLevel: s.mobLevel, mobEl: s.mobEl });
          return this.explode(s, id, pid);
        }
        continue;
      }
      // Monsters are hit on their body: big ones are wider than a hero (HIT_RADIUS)
      const hit = this.firstTargetAt(s.x, s.y, s.radius + HIT_RADIUS, s.owner, s.hitIds, (m) => Math.max(0, mobBody(m.kind) - HIT_RADIUS));
      if (hit) {
        if (s.spec) shotHit(this.host, s.spec, hit);
        else this.hitTarget(s.owner, hit, s.damage, [s.vx, s.vy], { kb: s.knockback, basic: s.basic, parts: s.parts });
        // Piercing arrows keep flying through a few targets
        if (s.pierce > 0) { s.pierce--; s.hitIds.add(hit); continue; }
        return this.explode(s, id, hit);
      }
    }
  }

  private explode(s: Projectile, id: string, _directHit = "") {
    this.broadcast("boom", { x: s.x, y: s.y, r: s.spec?.explode ?? 0, kind: s.kind, imb: s.imb || undefined });
    this.state.projectiles.delete(id);
    if (s.spec) shotEnd(this.host, s.spec, s.x, s.y);
  }

  // ---- Loot -------------------------------------------------------------

  private dropItem(kind: ItemKind, x: number, y: number, amount: number, gear = "", owner = "") {
    const it = new Item();
    it.kind = kind; it.amount = amount; it.gear = gear; it.owner = owner;
    // Scatter a little so several drops don't stack exactly
    it.x = x + (Math.random() - 0.5) * 10;
    it.y = y + (Math.random() - 0.5) * 10;
    it.expires = Date.now() + ITEM_LIFETIME_MS;
    this.state.items.set(`i${++this.itemSeq}`, it);
  }

  /** Loot scales with the monster's level: more gold, more potions, more and better gear (shared/gear.ts LOOT_LEVEL). */
  private dropLoot(kind: MobKind, x: number, y: number, goldMult = 1, level = 1) {
    const def = LOOT[kind];
    const gold = Math.round((def.gold[0] + Math.floor(Math.random() * (def.gold[1] - def.gold[0] + 1))) * goldMult);
    if (gold > 0) this.dropItem("gold", x, y, gold);
    if (Math.random() < potionChance(def.potionChance, level)) this.dropItem("potion", x, y, 1, String(dropSize(level)));
    if (Math.random() < potionChance(def.potionChance, level) * MANA_POTION_DROP) this.dropItem("mpotion", x, y, 1, String(dropSize(level)));
    // the Hollow King, the first zone's final boss, leaves a little hoard
    for (let i = kind === "hollowking" ? 3 : 1; i > 0; i--) {
      const gear = rollGear(kind, level);
      if (gear) this.dropItem("gear", x, y, 1, gear);
    }
  }

  private pickUp(p: Player, pid: string) {
    this.state.items.forEach((it, id) => {
      if (Math.hypot(it.x - p.x, it.y - p.y) > PICKUP_RADIUS) return;
      if (it.kind === "quest") {
        if (it.owner !== pid) return; // someone else's quest drop
        this.state.items.delete(id);
        const c = CHAINS.findIndex((_, i) => { const s = questStep(chainState(p, i)); return s?.type === "collect" && s.item === it.gear; });
        if (c < 0) return; // left over from an earlier step
        this.clients.find((cl) => cl.sessionId === pid)?.send("pickup", { kind: it.kind, amount: 1, x: it.x, y: it.y, gear: it.gear, name: "" });
        this.questProgress(pid, p, c, this.qs(p, c).questCount + 1);
        return;
      }
      if (it.kind === "potion" || it.kind === "mpotion") {
        if (this.addPotions(p, it.kind, potSize(it.gear), it.amount) < it.amount) return; // no room in the bag: leave it on the ground
      } else if (it.kind === "gear") {
        if (this.bagFull(p) || !isGearId(it.gear)) return; // bag full: leave it
        setBag(p, [...bagItems(p), it.gear]);
      } else {
        p.gold += it.amount;
      }
      this.state.items.delete(id);
      this.clients.find((c) => c.sessionId === pid)?.send("pickup", { kind: it.kind, amount: it.amount, x: it.x, y: it.y, gear: it.gear, name: it.kind === "gear" && it.gear ? lvlName(it.gear, p.cls) : it.kind === "potion" || it.kind === "mpotion" ? potionName(it.kind, potSize(it.gear)) : "" });
    });
  }

  /** Bag slots used: gear items plus potion stacks (POTION_STACK per slot). */
  private bagUsed(p: Player) { return p.bag.length + potionSlots(p.pots); }
  private bagFull(p: Player) { return this.bagUsed(p) >= BAG_SIZE; }

  /** Puts up to `n` potions of one size in the bag, as far as the stacks have room. Returns how many went in. */
  private addPotions(p: Player, kind: PotionKind, size: number, n: number): number {
    let added = 0;
    while (added < n && p.bag.length + slotsAfter(p.pots, kind, size, 1) <= BAG_SIZE) { p.pots[kind][size]++; added++; }
    if (added) this.syncPotions(p);
    return added;
  }
  private syncPotions(p: Player) {
    const v = packPotions(p.pots);
    if (p.potions !== v) p.potions = v;
  }

  /** Drinks the smallest potion of `kind` carried (Q healing, V mana). Returns the amount restored, 0 if none. */
  private drink(p: Player, kind: PotionKind): number {
    const size = nextSize(p.pots[kind]);
    if (size < 0) return 0;
    p.pots[kind][size]--;
    this.syncPotions(p);
    return potionAmount(kind, size);
  }

  private drinkPotion(id: string) {
    const p = this.state.players.get(id);
    const now = Date.now();
    if (!p || p.dead || p.hp >= p.maxHp || now - p.lastPotion < POTION_COOLDOWN_MS) return;
    const heal = this.drink(p, "potion");
    if (!heal) return;
    p.lastPotion = now;
    p.hp = Math.min(p.maxHp, p.hp + heal);
    this.broadcast("heal", { id, amount: heal });
  }

  /** Mana potion (V): the smallest one carried, a fixed amount of mana (shared/potions.ts). */
  private drinkManaPotion(id: string) {
    const p = this.state.players.get(id);
    const now = Date.now();
    if (!p || p.dead || p.mana >= p.maxMana || now - p.lastManaPotion < POTION_COOLDOWN_MS) return;
    const amount = this.drink(p, "mpotion");
    if (!amount) return;
    p.lastManaPotion = now;
    p.mana = Math.min(p.maxMana, p.mana + amount);
    this.syncMana(p);
    this.broadcast("mana", { id, amount });
  }

  // ---- Dodge roll ---------------------------------------------------------

  private dodge(id: string) {
    const p = this.state.players.get(id);
    const now = Date.now();
    if (!p || p.dead || p.stunned || now - p.lastDodge < DODGE.cooldownMs || p.energy < ENERGY.cost.dodge) return;
    p.energy -= ENERGY.cost.dodge;
    const i = p.input;
    const moving = i.up !== i.down || i.left !== i.right;
    p.rollInput = moving ? { ...i } : pushInput(aimOf(p));
    p.lastDodge = now;
    p.rollUntil = now + DODGE.durationMs;
    p.rolling = true;
    p.invulnUntil = Math.max(p.invulnUntil, now + DODGE.invulnMs);
    p.emote = "";
    this.broadcast("dodge", { id, dir: p.dir });
  }

  // ---- Stat points (hero panel) -------------------------------------------

  private assignStat(id: string, k: string) {
    const p = this.state.players.get(id);
    if (!p || (k !== "sta" && k !== "str" && k !== "mag" && k !== "dex")) return;
    if (p.ptSta + p.ptStr + p.ptMag + p.ptDex >= statPoints(p.level)) return;
    if (k === "sta") p.ptSta++; else if (k === "str") p.ptStr++; else if (k === "mag") p.ptMag++; else p.ptDex++;
    this.applyStats(p);
  }

  /** Free reset of stat points, only out of combat. */
  private resetStats(id: string) {
    const p = this.state.players.get(id);
    if (!p || p.dead || Date.now() - p.lastHurt < 5000) return;
    p.ptSta = p.ptStr = p.ptMag = p.ptDex = 0;
    this.applyStats(p);
  }

  // ---- Skill tree ---------------------------------------------------------

  /**
   * Test command "/max": the hero jumps to the max level, learns every skill at max rank (actives go on free keys),
   * spreads all stat points over the 4 stats, and gets full potions and gold. Any player can use it. Saved like normal progress.
   */
  private maxHero(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const from = p.level;
    p.xp = MAX_XP;
    p.level = levelFromXp(MAX_XP);
    // Skills are in tree order (parents first), so one pass per rank learns them all
    for (let pass = 0; pass < MAX_RANK; pass++) for (const sk of classSkills(p.cls)) this.learnTalent(client.sessionId, sk.id);
    // Every stat point the level gives, spread evenly over the 4 stats (points already placed are reset first)
    const pts = statPoints(p.level), each = Math.floor(pts / 4), left = pts % 4;
    p.ptSta = each + (left > 0 ? 1 : 0); p.ptStr = each + (left > 1 ? 1 : 0); p.ptMag = each + (left > 2 ? 1 : 0); p.ptDex = each;
    p.pots = { potion: [0, 0, 10], mpotion: [0, 0, 10] };
    this.syncPotions(p);
    p.gold = Math.max(p.gold, 100000);
    this.applyStats(p);
    if (!p.dead) p.hp = p.maxHp;
    if (p.level > from) this.broadcast("levelup", { id: client.sessionId, level: p.level, from });
    client.send("chat", { id: "", name: "Test", text: `Level ${p.level}, every skill at max rank, ${pts} stat points spread over all stats.` });
  }

  private learnTalent(id: string, tid: string) {
    const p = this.state.players.get(id);
    if (!p || typeof tid !== "string" || !canLearn(p.cls, p.level, p.talents, tid)) return;
    const first = !p.talents.get(tid);
    p.talents.set(tid, (p.talents.get(tid) ?? 0) + 1);
    const sk = skillOf(p.cls, tid)!;
    if (first && !sk.passive) {
      this.broadcast("power", { id, name: sk.name });
      this.questDo(id, "learn");
      // A new active goes on the first free key
      const free = p.slots.toArray().indexOf("");
      if (free >= 0) p.slots.setAt(free, tid);
    }
    this.applyStats(p);
  }

  private cast(id: string, skill: string) {
    const p = this.state.players.get(id);
    if (!p || typeof skill !== "string" || p.rolling) return;
    const def = skillOf(p.cls, skill);
    if (def && skillLearned(p.cls, p.talents, skill) && !weaponOk(def, p.cls, this.equipped(p))) {
      // Wrong weapon in hand (a Volley needs a bow): say so, at most once a second while the key is held
      const now = Date.now();
      if (now - p.lastWeaponNo > 1000) {
        p.lastWeaponNo = now;
        this.clients.find((c) => c.sessionId === id)?.send("gearno", { text: `${def.name} needs ${NEED_TEXT[def.needs!]}` });
      }
      return;
    }
    if (castSkill(this.host, id, skill)) {
      p.emote = "";
      this.questDo(id, "cast");
      if (!p.outlaw && inVillage(p.x, p.y)) this.setOutlaw(id, p, true);
    }
  }

  /** No magic in Oakvale (shared/wrath.ts): the caster becomes an outlaw until they leave the village or die. */
  private setOutlaw(id: string, p: Player, on: boolean) {
    if (p.outlaw === on) return;
    p.outlaw = on;
    if (on) p.wrathNext = Date.now() + 600;
    // left = walked out of the village (false when the outlaw died: no "you left" banner over the death screen)
    this.broadcast("wrath", { id, on, left: !on && !p.dead, shout: WRATH.shouts[Math.floor(Math.random() * WRATH.shouts.length)] });
  }

  /** The townsfolk mob an outlaw: a heavy blow every WRATH.mobEveryMs while they stay inside the stockade. */
  private updateWrath(id: string, p: Player, now: number) {
    if (!p.outlaw) return;
    if (p.dead || !inVillage(p.x, p.y)) { this.setOutlaw(id, p, false); return; }
    if (now < p.wrathNext) return;
    p.wrathNext = now + WRATH.mobEveryMs;
    const a = Math.random() * Math.PI * 2;
    this.damagePlayer(id, WRATH.mobDamage(p.maxHp), "The angry villagers", [Math.cos(a), Math.sin(a)], 0.6, { wrath: true });
    if (p.dead) this.setOutlaw(id, p, false);
  }

  /** Press a slot key: use whatever skill is in that slot. */
  private useSlot(id: string, n: number) {
    const p = this.state.players.get(id);
    if (!p || typeof n !== "number" || n < 0 || n >= SLOT_COUNT) return;
    const s = p.slots.at(n);
    if (s) this.cast(id, s);
  }

  /** Put a learned active skill in a slot (moving it out of any other slot), or clear the slot with skill "". */
  private assignSlot(id: string, msg: { slot: number; skill: string }) {
    const p = this.state.players.get(id);
    if (!p || !msg || typeof msg.slot !== "number" || msg.slot < 0 || msg.slot >= SLOT_COUNT) return;
    const skill = msg.skill;
    if (typeof skill !== "string") return;
    if (skill && (!skillLearned(p.cls, p.talents, skill) || skillOf(p.cls, skill)?.passive)) return;
    if (skill) for (let i = 0; i < SLOT_COUNT; i++) if (p.slots.at(i) === skill) p.slots.setAt(i, "");
    p.slots.setAt(msg.slot, skill);
  }

  /** Free reset of all skill points, only out of combat. */
  private respec(id: string) {
    const p = this.state.players.get(id);
    if (!p || p.dead || Date.now() - p.lastHurt < 5000) return;
    p.talents.clear();
    for (let i = 0; i < SLOT_COUNT; i++) p.slots.setAt(i, "");
    this.applyStats(p);
  }

  // ---- Equipment ----------------------------------------------------------

  /** Fills the empty slots with the class's starting kit (shared/gear.ts starterKit); kit items already carried are not doubled. */
  private wearKit(p: Player) {
    const have = new Set([...GEAR_SLOTS.map((s) => p[s]), ...bagItems(p)]);
    for (const [slot, id] of Object.entries(starterKit(p.cls)) as [GearSlot, string][]) if (!p[slot] && !have.has(id)) p[slot] = id;
  }

  /** Worn items that count (requirements met, see shared/gear.ts activeGear). */
  private equipped(p: Player): Equipped {
    return activeGear(Object.fromEntries(GEAR_SLOTS.map((s) => [s, p[s]])), this.reqInfo(p));
  }

  private reqInfo(p: Player): HeroReqInfo {
    return { cls: p.cls, level: p.level, pts: { sta: p.ptSta, str: p.ptStr, mag: p.ptMag, dex: p.ptDex } };
  }

  /** Wear the bag item at index `i`; whatever was in that slot goes back to the bag. */
  private equip(id: string, i: number) {
    const p = this.state.players.get(id);
    if (!p || typeof i !== "number" || i < 0 || i >= p.bag.length) return;
    const gid = p.bag.at(i), def = gid ? gearDef(gid) : undefined;
    if (!gid || !def || !canWear(p.cls, gid)) return;
    const why = reqProblem(gid, this.reqInfo(p)); // item level and stat requirements
    if (why) { this.clients.find((c) => c.sessionId === id)?.send("gearno", { text: why }); return; }
    const slot: GearSlot = def.slot;
    const old = p[slot];
    const items = [...bagItems(p)];
    if (old) items[i] = old; else items.splice(i, 1);
    setBag(p, items);
    p[slot] = gid;
    this.applyStats(p);
    this.questDo(id, "equip");
  }

  private unequip(id: string, slot: GearSlot) {
    const p = this.state.players.get(id);
    if (!p || !GEAR_SLOTS.includes(slot) || !p[slot] || this.bagFull(p)) return;
    setBag(p, [...bagItems(p), p[slot]]);
    p[slot] = "";
    this.applyStats(p);
  }

  /** Throw a bag item on the ground (anyone can pick it up). */
  private dropGear(id: string, i: number) {
    const p = this.state.players.get(id);
    if (!p || typeof i !== "number" || i < 0 || i >= p.bag.length) return;
    const items = [...bagItems(p)];
    const [gid] = items.splice(i, 1);
    setBag(p, items);
    // Drop it out of pickup range so it isn't grabbed straight back
    const off = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.dir];
    this.dropItem("gear", p.x + off[0] * (PICKUP_RADIUS + 10), p.y + off[1] * (PICKUP_RADIUS + 10), 1, gid);
  }

  // ---- Player groups (shared/party.ts) --------------------------------------

  /** Pending invites: invited player -> who asked, and until when. */
  private invites = new Map<string, { from: string; until: number }>();
  private partySeq = 0;

  private members(party: string): string[] {
    const out: string[] = [];
    if (party) this.state.players.forEach((p, id) => { if (p.party === party) out.push(id); });
    return out;
  }

  /** `id`'s live group members (with `id` itself) fighting together around (x, y). */
  private groupNear(id: string, x: number, y: number): string[] {
    const me = this.state.players.get(id);
    if (!me?.party) return [id];
    return this.members(me.party).filter((pid) => {
      const p = this.state.players.get(pid)!;
      return pid === id || (!p.dead && together(p.x, p.y, x, y));
    });
  }

  private tell(id: string, text: string) {
    this.clients.find((c) => c.sessionId === id)?.send("party", { text });
  }

  private partyInvite(id: string, msg: { id?: string; name?: string }) {
    const me = this.state.players.get(id);
    if (!me) return;
    let tid = typeof msg?.id === "string" ? msg.id : "";
    if (!tid && typeof msg?.name === "string") {
      const want = msg.name.trim().toLowerCase();
      this.state.players.forEach((p, pid) => { if (!tid && pid !== id && p.name.toLowerCase() === want) tid = pid; });
    }
    const t = this.state.players.get(tid);
    if (!t || tid === id) return this.tell(id, "No such player here.");
    if (me.party && t.party === me.party) return this.tell(id, `${t.name} is already in your group.`);
    if (t.party) return this.tell(id, `${t.name} is already in another group.`);
    if (me.party && this.members(me.party).length >= PARTY.maxSize) return this.tell(id, `Your group is full (${PARTY.maxSize}).`);
    const prev = this.invites.get(tid);
    if (prev && prev.from === id && prev.until > Date.now()) return this.tell(id, `You already invited ${t.name}.`);
    this.invites.set(tid, { from: id, until: Date.now() + PARTY.inviteMs });
    this.clients.find((c) => c.sessionId === tid)?.send("pinvite", { from: id, name: me.name, ms: PARTY.inviteMs });
    this.tell(id, `Invited ${t.name} to your group.`);
  }

  private partyAnswer(id: string, from: unknown, yes: boolean) {
    const inv = this.invites.get(id);
    const me = this.state.players.get(id);
    if (!me || !inv || inv.from !== from) return;
    this.invites.delete(id);
    const host = this.state.players.get(inv.from);
    if (!host || inv.until < Date.now()) return this.tell(id, "That invite has run out.");
    if (!yes) return this.tell(inv.from, `${me.name} declined your invite.`);
    if (me.party) this.partyLeave(id);
    if (host.party && this.members(host.party).length >= PARTY.maxSize) return this.tell(id, `${host.name}'s group is full.`);
    if (!host.party) host.party = `g${++this.partySeq}`;
    me.party = host.party;
    for (const pid of this.members(host.party)) this.tell(pid, pid === id ? `You joined ${host.name}'s group.` : `${me.name} joined the group.`);
  }

  private partyLeave(id: string) {
    const me = this.state.players.get(id);
    if (!me?.party) return;
    const party = me.party;
    me.party = "";
    this.tell(id, "You left the group.");
    const rest = this.members(party);
    if (rest.length === 1) { this.state.players.get(rest[0])!.party = ""; this.tell(rest[0], `${me.name} left: the group is disbanded.`); }
    else for (const pid of rest) this.tell(pid, `${me.name} left the group.`);
  }

  // ---- Combat -------------------------------------------------------------

  /** All live, hittable targets (players and mobs) within `r` of (x,y), except `exclude`. */
  private targetsAround(x: number, y: number, r: number, exclude: string, mobPad?: (m: Mob) => number): string[] {
    const out: string[] = [];
    const me = this.state.players.get(exclude);
    this.state.players.forEach((t, tid) => {
      if (me?.party && t.party === me.party) return; // no friendly fire inside a group
      if (tid !== exclude && !t.dead && Math.hypot(t.x - x, t.y - y) <= r) out.push(tid);
    });
    this.state.mobs.forEach((m, mid) => {
      const dx = m.x - x, R = mobPad ? r + 64 : r; // cheap box test first (thousands of monsters, most far away; bodies < 64 px)
      if (dx > R || dx < -R) return;
      const dy = m.y - y;
      if (dy > R || dy < -R) return;
      if (!m.dead && !m.hidden && Math.hypot(dx, dy) <= r + (mobPad ? mobPad(m) : 0)) out.push(mid);
    });
    return out;
  }

  private firstTargetAt(x: number, y: number, r: number, exclude: string, skip?: Set<string>, mobPad?: (m: Mob) => number): string | undefined {
    // Skip players who cannot be hurt right now (safe zone, dash) so shots pass through them
    const now = Date.now();
    return this.targetsAround(x, y, r, exclude, mobPad).find((id) => {
      if (skip?.has(id)) return false;
      const p = this.state.players.get(id);
      return !p || (!isSafeZone(p.x, p.y) && now >= p.invulnUntil);
    });
  }

  /** Direction to push `targetId` away from (x,y). */
  private pushFrom(x: number, y: number, targetId: string): [number, number] {
    const t = this.state.players.get(targetId) ?? this.state.mobs.get(targetId)!;
    const dx = t.x - x, dy = t.y - y;
    return Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy) || 1];
  }

  /** Lifesteal (passives like Bloodthirst, and buffs): heal a share of the damage dealt. */
  private bloodthirst(a: Player | undefined, id: string, dealt: number) {
    if (!a || a.dead || dealt <= 0) return;
    const share = talentBonus(a.cls, a.talents, "lifesteal") / 100 + buffLifesteal(a, Date.now());
    if (share <= 0) return;
    const heal = dealt * share;
    a.hp = Math.min(a.maxHp, a.hp + heal);
  }

  /** A player (`attackerId`) hits a player or mob. */
  private hitTarget(attackerId: string, targetId: string, dmg: number, push: [number, number], opts: HitOpts = {}) {
    const a = this.state.players.get(attackerId);
    if (a?.party && this.state.players.get(targetId)?.party === a.party) return; // group mates can't hurt each other
    // Elemental parts (shared/elements.ts): monsters take more or less of each, heroes resist; poison comes later
    const riders: ElemPart[] = [];
    if (opts.parts?.length) {
      const tp0 = this.state.players.get(targetId), tm0 = tp0 ? undefined : this.state.mobs.get(targetId);
      let top = 0;
      for (const p of opts.parts) {
        const amt = p.amt * (tp0 ? 1 - gearResist(this.equipped(tp0), p.el) : tm0 ? mobAffinity(tm0.kind, p.el) : 1);
        if (amt <= 0) continue;
        if (p.el !== "poison") dmg += amt;
        riders.push({ el: p.el, amt });
        if (amt > top) { top = amt; opts = { ...opts, el: p.el }; }
      }
      const cold = riders.find((r) => r.el === "cold");
      if (cold) opts = { ...opts, slowMs: Math.max(opts.slowMs ?? 0, tp0 ? ELEMENT_FX.cold.heroSlowMs : ELEMENT_FX.cold.mobSlowMs) };
      opts = { ...opts, parts: undefined };
      if (riders.length) this.elementRiders(attackerId, targetId, riders);
    }
    if (a) dmg = dmg * talentMult(a.cls, a.talents, "dmg") * (opts.skill && !opts.dot ? talentMult(a.cls, a.talents, "skill") : 1) * dealtMult(a, Date.now());
    dmg = Math.max(1, Math.round(dmg));
    opts = { ...opts, from: attackerId };
    const name = a?.name ?? "???";
    const kb = opts.kb ?? 1;
    const tp = this.state.players.get(targetId);
    if (tp) {
      const hpBefore = tp.hp;
      if (a) dmg = Math.max(1, Math.round(dmg * pvpDamageMult(a.level, tp.level))); // hero vs hero (shared/combat.ts)
      const killed = this.damagePlayer(targetId, dmg, name, push, kb, { ...opts, atkLevel: a?.level });
      this.bloodthirst(a, attackerId, hpBefore - tp.hp);
      if (killed && a) {
        const victim = this.state.players.get(targetId)!;
        a.kills++;
        this.grantXp(attackerId, PVP_KILL_XP, victim);
        const lost = Math.floor(victim.gold * PVP_GOLD_DROP);
        if (lost > 0) { victim.gold -= lost; this.dropItem("gold", victim.x, victim.y, lost); }
      }
      return;
    }
    const m = this.state.mobs.get(targetId);
    if (!m || m.dead) return;
    const def = mobDef(m);
    if (a && (m.camp || m.kind === "banditchief")) this.banditShout(m, targetId, attackerId, Date.now());
    dmg = Math.max(1, Math.round(dmg * takenMult(m, Date.now())));
    // A group fighting together faces a tougher monster (shared/party.ts): it soaks more per hit
    if (a?.party) dmg = Math.max(1, Math.round(dmg / groupHpMult(this.groupNear(attackerId, m.x, m.y).length)));
    if (m.bones) dmg = Math.max(1, Math.round(dmg * (1 - DEMON.harvest.armorPer * m.bones))); // Bone Demon's bone armour
    this.bloodthirst(a, attackerId, Math.min(dmg, m.hp));
    m.hp = Math.max(0, m.hp - dmg);
    this.addHate(m, attackerId, dmg); // fight back (generated aggro)
    if (!opts.dot && (m.kind === "stormblob" || m.parts)) this.stormSparks(m, targetId, Date.now());
    if (!m.foe) m.target = attackerId;
    const now = Date.now();
    // Initiative: drain poise; a solid hit interrupts the wind-up and delays the next attack
    const pmax = mobPoiseMax(m);
    // Higher-level monsters are harder to make dizzy
    const pdmg = dmg * (opts.skill ? POISE.skillMult : 1) * poiseLevelMult(a?.level ?? 1, m.level);
    if (drainPoise(m, pmax, pdmg, now, POISE.mobBrokenMs)) this.broadcast("broken", { id: targetId, ms: POISE.mobBrokenMs });
    if (pdmg >= pmax * 0.15) {
      m.windUntil = 0; m.winding = false;
      m.lastAttack = Math.max(m.lastAttack, now - def.attackCooldownMs + POISE.mobFlinchMs);
    }
    if (opts.stunMs) m.stunUntil = Math.max(m.stunUntil, now + opts.stunMs);
    if (opts.slowMs) m.slowUntil = Math.max(m.slowUntil, now + opts.slowMs);
    if (kb > 0) {
      const k = moveStep(m.x, m.y, pushInput(push), 0.1 * kb);
      if (!isSafeZone(k.x, k.y) && !noMobsAt(k.x, k.y)) { m.x = k.x; m.y = k.y; }
    }
    this.broadcast("hit", { id: targetId, dmg, crit: !!opts.crit, dot: !!opts.dot, el: opts.el, ...(opts.dot ? {} : hitDir(push)) });
    if (m.hp > 0) { afterHit(this.host, attackerId, targetId, opts); return; }
    if (a) for (let c = 0; c < CHAINS.length; c++) this.questKill(attackerId, a, m, c);
    // Kill XP: every group member in the same zone gets it (the killer alone when solo)
    const xp = Math.round(def.xp * mobScale(m.level, "xp"));
    for (const pid of a?.party ? this.groupNear(attackerId, m.x, m.y) : [attackerId]) this.grantXp(pid, xp, m);
    this.dropLoot(m.kind, m.x, m.y, mobScale(m.level, "gold") * (m.kind === "bandit" ? BANDIT_ROLES[roleOf(m.weapon)].loot : 1), m.level);
    this.mobDied(m, targetId, attackerId, a?.name ?? "");
  }

  /** Burns and poison of a hero's elemental hit: damage ticks over the next seconds (shared/elements.ts ELEMENT_FX). */
  private elementRiders(attackerId: string, targetId: string, riders: ElemPart[]) {
    for (const r of riders) {
      if (r.el === "shock") { this.shockArc(attackerId, targetId, r.amt); continue; }
      const f = r.el === "fire" ? (Math.random() < ELEMENT_FX.fire.chance ? ELEMENT_FX.fire : undefined) : r.el === "poison" ? ELEMENT_FX.poison : undefined;
      if (!f) continue;
      const each = (r.amt * f.total) / f.ticks;
      if (each < 0.5) continue;
      for (let i = 1; i <= f.ticks; i++) {
        this.host.later(f.tickMs * i, () => this.hitTarget(attackerId, targetId, each, [0, 0], { dot: true, kb: 0, el: r.el }));
      }
    }
  }

  /** Electric: part of the shock leaps from the monster that was hit to the nearest other monster close by. */
  private shockArc(attackerId: string, targetId: string, amt: number) {
    const from = this.state.mobs.get(targetId), F = ELEMENT_FX.shock;
    if (!from || amt * F.arc < 0.5) return;
    let best = "", bd = F.range;
    this.state.mobs.forEach((o, oid) => {
      if (oid === targetId || o.dead || o.hidden || Math.abs(o.x - from.x) > bd || Math.abs(o.y - from.y) > bd) return;
      const d = Math.hypot(o.x - from.x, o.y - from.y);
      if (d < bd) { bd = d; best = oid; }
    });
    if (!best) return;
    const to = this.state.mobs.get(best)!;
    this.broadcast("arc", { x0: Math.round(from.x), y0: Math.round(from.y), x1: Math.round(to.x), y1: Math.round(to.y) });
    this.hitTarget(attackerId, best, amt * F.arc * mobAffinity(to.kind, "shock"), [0, 0], { kb: 0, el: "shock" });
  }

  /** A monster is down: its raised dead crumble, it leaves its zone (which brings a fresh one back later). */
  private mobDied(m: Mob, targetId: string, attackerId: string, killerName: string) {
    m.dead = true; m.hp = 0;
    m.hidden = false; m.spot = ""; m.fleeing = false; m.foe = "";
    // A skeleton may break in two: its upper body drags itself on at whoever killed it
    if (m.kind === "skeleton" && !m.ritual && Math.random() < BONES.crawlChance) {
      const x = m.x, y = m.y, level = m.level, weapon = m.weapon === "bow" ? "sword" : m.weapon, mother = m.mother;
      this.clock.setTimeout(() => this.spawnCrawler(x, y, level, weapon, mother, attackerId), BONES.crawlDelayMs);
    }
    if (m.kind === "necromancer" || m.kind === "hollowking") {
      // Its raised skeletons (the Hollow King's servants) fall apart with it
      this.state.mobs.forEach((c, cid) => {
        if (c.mother !== targetId || c.dead) return;
        c.dead = true; c.hp = 0;
        this.clock.setTimeout(() => this.state.mobs.delete(cid), 500);
      });
    }
    if (m.zone < 0) { this.clock.setTimeout(() => this.state.mobs.delete(targetId), 500); return; } // bloblings, raised skeletons don't respawn
    const zone = this.state.zones.get(SPAWN_ZONES[m.zone].name);
    if (zone) {
      zone.alive--;
      // Last monster of the zone down: tell everyone (the killer gets a big banner)
      if (zone.alive <= 0 && attackerId) {
        const z = SPAWN_ZONES[m.zone];
        this.broadcast("zonecleared", { zone: z.name, by: attackerId, name: killerName, respawnSec: Math.round(z.respawnMs / 1000) });
      }
    }
  }

  // ---- Shops (shared/shops.ts) ----------------------------------------------

  /** The shop of the trader the player stands next to. */
  private shopNear(p: Player) {
    const n = npcNear(p.x, p.y, TALK_RANGE * 1.5);
    return n?.shop ? SHOPS[n.shop] : undefined;
  }

  private shopBuy(client: Client, i: unknown) {
    const p = this.state.players.get(client.sessionId);
    const shop = p && !p.dead ? this.shopNear(p) : undefined;
    const e = shop && typeof i === "number" ? shop.stock[i] : undefined;
    if (!p || !e) return;
    const no = (text: string) => client.send("shop", { ok: false, text });
    if (p.gold < e.price) return no("Not enough gold");
    if (e.item === "potion" || e.item === "mpotion") {
      const qty = e.qty ?? 1, size = e.size ?? 0;
      if (p.bag.length + slotsAfter(p.pots, e.item, size, qty) > BAG_SIZE) return no("No room in your bag");
      this.addPotions(p, e.item, size, qty);
    } else {
      if (!gearDef(e.item)) return;
      if (this.bagFull(p)) return no("Your bag is full");
      setBag(p, [...bagItems(p), e.item]);
    }
    p.gold -= e.price;
    client.send("shop", { ok: true, text: `-${e.price} gold` });
  }

  private shopSell(client: Client, i: unknown) {
    const p = this.state.players.get(client.sessionId);
    const shop = p && !p.dead ? this.shopNear(p) : undefined;
    if (!p || !shop?.buys || typeof i !== "number" || i < 0 || i >= p.bag.length) return;
    const gid = p.bag.at(i), def = gid ? gearDef(gid) : undefined;
    if (!gid || !def || !shop.buys.includes(def.slot)) return;
    const items = [...bagItems(p)];
    items.splice(i, 1);
    setBag(p, items);
    const price = sellPrice(gid);
    p.gold += price;
    client.send("shop", { ok: true, text: `+${price} gold` });
  }

  // ---- Trading and the stash (shared/trade.ts) --------------------------------
  // The server owns every trade: offers are item ids taken from the bag, any change takes back both "Ready"
  // marks (and bumps the version, so a Ready click made on an older view doesn't count), and the swap is
  // checked again against both bags and purses at the moment it happens. Both heroes are saved right away.

  /** Trade requests: asked player -> who asked, and until when. */
  private tradeAsks = new Map<string, { from: string; until: number }>();
  /** Open trades, under both players' ids. */
  private trades = new Map<string, Trade>();

  private tradeNote(id: string, text: string) {
    this.clients.find((c) => c.sessionId === id)?.send("tradenote", { text });
  }

  private tradeAsk(id: string, msg: { id?: string; name?: string }) {
    const me = this.state.players.get(id);
    if (!me) return;
    let tid = typeof msg?.id === "string" ? msg.id : "";
    if (!tid && typeof msg?.name === "string") {
      const want = msg.name.trim().toLowerCase();
      this.state.players.forEach((p, pid) => { if (!tid && pid !== id && p.name.toLowerCase() === want) tid = pid; });
    }
    const t = this.state.players.get(tid);
    if (!t || tid === id) return this.tradeNote(id, "No such player here.");
    if (me.dead || t.dead) return this.tradeNote(id, "Nobody can trade while dead.");
    if (this.trades.has(id)) return this.tradeNote(id, "You are already trading.");
    if (this.trades.has(tid)) return this.tradeNote(id, `${t.name} is busy trading.`);
    if (Math.hypot(me.x - t.x, me.y - t.y) > TRADE.range) return this.tradeNote(id, `Walk closer to ${t.name} to trade.`);
    const prev = this.tradeAsks.get(tid);
    if (prev && prev.from === id && prev.until > Date.now()) return this.tradeNote(id, `You already asked ${t.name}.`);
    this.tradeAsks.set(tid, { from: id, until: Date.now() + TRADE.askMs });
    this.clients.find((c) => c.sessionId === tid)?.send("tradeask", { from: id, name: me.name, ms: TRADE.askMs });
    this.tradeNote(id, `Asked ${t.name} to trade.`);
  }

  private tradeAnswer(id: string, from: unknown, yes: boolean) {
    const ask = this.tradeAsks.get(id);
    const me = this.state.players.get(id);
    if (!me || !ask || ask.from !== from) return;
    this.tradeAsks.delete(id);
    const host = this.state.players.get(ask.from);
    if (!host || ask.until < Date.now()) return this.tradeNote(id, "That trade request has run out.");
    if (!yes) return this.tradeNote(ask.from, `${me.name} doesn't want to trade.`);
    if (this.trades.has(id) || this.trades.has(ask.from)) return this.tradeNote(id, "One of you is already trading.");
    if (me.dead || host.dead || Math.hypot(me.x - host.x, me.y - host.y) > TRADE.breakRange) return this.tradeNote(id, `You are too far from ${host.name}.`);
    const t: Trade = { a: ask.from, b: id, v: 1, offer: { [ask.from]: { items: [], gold: 0 }, [id]: { items: [], gold: 0 } }, ready: {} };
    this.trades.set(ask.from, t); this.trades.set(id, t);
    this.tradeView(t);
  }

  /** Sends both players the trade as they see it (theirs and the other side's offer). */
  private tradeView(t: Trade) {
    for (const [me, other] of [[t.a, t.b], [t.b, t.a]]) {
      this.clients.find((c) => c.sessionId === me)?.send("tradeview", {
        v: t.v, with: other, name: this.state.players.get(other)?.name ?? "",
        mine: { ...t.offer[me], ready: !!t.ready[me] }, theirs: { ...t.offer[other], ready: !!t.ready[other] },
      });
    }
  }

  private tradeOffer(id: string, msg: { items?: unknown; gold?: unknown }) {
    const t = this.trades.get(id), p = this.state.players.get(id);
    if (!t || !p) return;
    t.offer[id] = offerFrom(bagItems(p), p.gold, msg?.items, msg?.gold);
    t.ready = {}; t.v++; // a changed offer must be looked at again by both
    this.tradeView(t);
  }

  private tradeReady(id: string, msg: { v?: number; ready?: boolean }) {
    const t = this.trades.get(id);
    if (!t) return;
    if (msg?.v !== t.v) return this.tradeView(t); // clicked on an older view of the offers
    t.ready[id] = msg?.ready !== false;
    if (!t.ready[t.a] || !t.ready[t.b]) return this.tradeView(t);
    const pa = this.state.players.get(t.a), pb = this.state.players.get(t.b);
    if (!pa || !pb) return this.tradeStop(id, "Trade cancelled.");
    const r = settle(
      { bag: bagItems(pa), gold: pa.gold, offer: t.offer[t.a], reserved: potionSlots(pa.pots) },
      { bag: bagItems(pb), gold: pb.gold, offer: t.offer[t.b], reserved: potionSlots(pb.pots) },
    );
    if (typeof r === "string") {
      // Something moved since the offer (an item worn, sold, dropped, gold spent): show the trade again, unready
      t.ready = {}; t.v++;
      for (const [who, pp] of [[t.a, pa], [t.b, pb]] as const) t.offer[who] = { items: t.offer[who].items.filter((g) => bagItems(pp).includes(g)), gold: Math.min(t.offer[who].gold, pp.gold) };
      this.tradeNote(t.a, `${r}: check the offers again.`); this.tradeNote(t.b, `${r}: check the offers again.`);
      return this.tradeView(t);
    }
    setBag(pa, r.a.bag); pa.gold = r.a.gold;
    setBag(pb, r.b.bag); pb.gold = r.b.gold;
    saveHero(pa.name, pa.cls, this.snapshot(pa)); saveHero(pb.name, pb.cls, this.snapshot(pb));
    flush(); // a finished trade is on disk at once
    this.trades.delete(t.a); this.trades.delete(t.b);
    console.log(`Trade ${pa.name} <-> ${pb.name}: [${t.offer[t.a].items}] ${t.offer[t.a].gold}g for [${t.offer[t.b].items}] ${t.offer[t.b].gold}g`);
    for (const [me, other] of [[t.a, pb], [t.b, pa]] as const) this.clients.find((c) => c.sessionId === me)?.send("tradeend", { ok: true, text: `Trade with ${other.name} done!` });
  }

  /** Ends a player's trade (if any) for both sides. */
  private tradeStop(id: string, text: string) {
    const t = this.trades.get(id);
    if (!t) return;
    this.trades.delete(t.a); this.trades.delete(t.b);
    for (const pid of [t.a, t.b]) this.clients.find((c) => c.sessionId === pid)?.send("tradeend", { ok: false, text: pid === id && text.startsWith("The other") ? "Trade cancelled." : text });
  }

  /** Called every tick: a trade ends when a hero dies or they walk apart. */
  private tradeTick() {
    if (!this.trades.size) return;
    for (const t of new Set(this.trades.values())) {
      const pa = this.state.players.get(t.a), pb = this.state.players.get(t.b);
      if (!pa || !pb) this.tradeStop(t.a, "Trade cancelled.");
      else if (pa.dead || pb.dead) this.tradeStop(t.a, "Someone fell: trade cancelled.");
      else if (Math.hypot(pa.x - pb.x, pa.y - pb.y) > TRADE.breakRange) this.tradeStop(t.a, "You walked apart: trade cancelled.");
    }
  }

  private nearStash(p: Player | undefined): p is Player {
    return !!p && !p.dead && Math.hypot(p.x - STASH.x, p.y - STASH.y) <= STASH_RANGE * 1.6;
  }

  private stashSend(client: Client, text = "") {
    const p = this.state.players.get(client.sessionId);
    if (!this.nearStash(p)) return;
    client.send("stashview", { ...loadStash(p.name), text });
  }

  /** Bag item `i` into the stash, or stash item `i` into the bag. */
  private stashMove(client: Client, dir: "put" | "take", i: unknown) {
    const p = this.state.players.get(client.sessionId);
    if (!this.nearStash(p) || typeof i !== "number" || !Number.isInteger(i) || i < 0) return;
    const st = loadStash(p.name), bag = bagItems(p);
    if (dir === "put") {
      if (i >= bag.length || !isGearId(bag[i])) return;
      if (st.items.length >= STASH_SIZE) return this.stashSend(client, "The stash is full");
      st.items.push(bag.splice(i, 1)[0]);
    } else {
      if (i >= st.items.length) return;
      if (bag.length + potionSlots(p.pots) >= BAG_SIZE) return this.stashSend(client, "Your bag is full");
      bag.push(st.items.splice(i, 1)[0]);
    }
    setBag(p, bag);
    saveStash(p.name, st, p.cls, this.snapshot(p));
    this.stashSend(client);
  }

  /** n > 0 puts gold in, n < 0 takes it out. */
  private stashGold(client: Client, n: unknown) {
    const p = this.state.players.get(client.sessionId);
    if (!this.nearStash(p) || typeof n !== "number" || !Number.isFinite(n)) return;
    const st = loadStash(p.name);
    const amt = n > 0 ? Math.min(Math.floor(n), p.gold, STASH_GOLD_MAX - st.gold) : -Math.min(Math.floor(-n), st.gold);
    if (!amt) return this.stashSend(client);
    st.gold += amt; p.gold -= amt;
    saveStash(p.name, st, p.cls, this.snapshot(p));
    this.stashSend(client);
  }

  // ---- Quest -------------------------------------------------------------
  // Quest chains (shared/quests.ts CHAINS: the blob story, the skeleton story), each with its own progress on the
  // player. The server owns progress; the client gets "quest" {chain, qid, stage, done?}.

  /** One chain's progress on this player. */
  private qs(p: Player, c: number): QuestState { return chainState(p, c)!; }
  private qset(p: Player, c: number, v: Partial<QuestState>) {
    const [a, b, n] = CHAINS[c].keys, r = p as unknown as Record<string, number>, pk = CHAINS[c].packed;
    if (pk) { const q = { ...this.qs(p, c), ...v }; r[pk] = packQuest(q.questId, q.questStage, q.questCount); return; }
    if (v.questId !== undefined) r[a] = v.questId;
    if (v.questStage !== undefined) r[b] = v.questStage;
    if (v.questCount !== undefined) r[n] = v.questCount;
  }

  private sendQuest(id: string, p: Player, c: number, done = false) {
    const q = this.qs(p, c);
    this.clients.find((cl) => cl.sessionId === id)?.send("quest", { chain: c, qid: q.questId, stage: q.questStage, done });
  }

  /** Move to the next step (or claim the reward and move on to the next quest). */
  private nextStep(id: string, p: Player, c: number) {
    const q = this.qs(p, c), d = CHAINS[c].quests[q.questId];
    if (!d) return;
    this.qset(p, c, { questCount: 0 });
    this.unsummon(id, c);
    const done = d.steps[q.questStage - 1];
    if (done?.levelTo && p.level < done.levelTo) this.grantXp(id, xpForLevel(done.levelTo) - p.xp, p);
    if (q.questStage < d.steps.length) {
      this.qset(p, c, { questStage: q.questStage + 1 });
      this.sendQuest(id, p, c);
      // Already did what the new step teaches (learned an active skill before getting here): straight on
      const s = d.steps[q.questStage];
      if (s.type === "learn" && activeSkills(p.cls).some((k) => skillLearned(p.cls, p.talents, k.id))) this.nextStep(id, p, c);
      return;
    }
    p.gold += d.reward.gold;
    // Reward potions fit the hero's level; what the bag can't hold is put down at their feet
    const rs = dropSize(p.level, () => 0.5);
    for (const [kind, n] of [["potion", d.reward.potions], ["mpotion", Math.ceil(d.reward.potions / 2)]] as const) {
      const left = n - this.addPotions(p, kind, rs, n);
      if (left > 0) this.dropItem(kind, p.x, p.y + 8, left, String(rs));
    }
    this.qset(p, c, { questId: q.questId + 1, questStage: 0 });
    this.sendQuest(id, p, c, true);
    this.grantXp(id, d.reward.xp, p);
  }

  /** Progress on a kill / collect / use step; finishes the step at its goal. */
  private questProgress(id: string, p: Player, c: number, count: number) {
    const s = questStep(this.qs(p, c));
    if (!s) return;
    this.qset(p, c, { questCount: count });
    const n = s.type === "use" ? (count === (1 << s.objects!.length) - 1 ? stepGoal(s) : 0) : count;
    if (n >= stepGoal(s)) this.nextStep(id, p, c);
  }

  /** The hero did something a step teaches (wore an item, learned or used a skill): finish that step on every chain. */
  private questDo(id: string, type: "equip" | "learn" | "cast") {
    const p = this.state.players.get(id);
    if (!p) return;
    for (let c = 0; c < CHAINS.length; c++) if (questStep(this.qs(p, c))?.type === type) this.nextStep(id, p, c);
  }

  private nearNpc(p: Player, npc: string): boolean {
    const n = npcById(npc);
    return !!n && npcPresent(npc, p) && Math.hypot(n.x - p.x, n.y - p.y) <= TALK_RANGE * 1.5;
  }

  /** Accept a quest at its giver, or finish a "talk" step next to that NPC. */
  private advanceQuest(id: string, c: number) {
    const p = this.state.players.get(id);
    if (!p || p.dead) return;
    const q = this.qs(p, c), d = CHAINS[c].quests[q.questId];
    if (!d) return;
    if (q.questStage === 0) {
      if (p.level >= d.minLevel && chainOpen(p, c) && this.nearNpc(p, d.giver)) this.nextStep(id, p, c);
      return;
    }
    const s = questStep(q);
    if (s?.type === "talk" && this.nearNpc(p, s.npc!)) this.nextStep(id, p, c);
  }

  /** E on a quest object (lantern, shrine, cocoon, Brood Heart, catapult, crypt...). */
  private useQuestObject(id: string, oid: string) {
    const p = this.state.players.get(id);
    if (!p || p.dead) return;
    for (let c = 0; c < CHAINS.length; c++) {
      const q = this.qs(p, c), s = questStep(q);
      if (s?.type !== "use") continue;
      const i = s.objects!.findIndex((o) => o.id === oid);
      const o = s.objects![i];
      if (!o || q.questCount & (1 << i) || Math.hypot(o.x - p.x, o.y - p.y) > USE_RANGE * 1.5) continue;
      this.clients.find((cl) => cl.sessionId === id)?.send("questuse", { id: o.id });
      this.questProgress(id, p, c, q.questCount | (1 << i));
      return;
    }
  }

  /**
   * Loot chest (shared/chests.ts): once per account until it refills. Loot goes straight to the hero
   * (gold, potions up to the cap, gear into the bag); what doesn't fit is dropped at the chest.
   */
  /** Loot chests this account already emptied, with the ms left until each refills (asked by the client once it listens). */
  private sendChests(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const now = Date.now();
    client.send("chests", Object.fromEntries(Object.entries(openedChests(p.name, now)).map(([id, t]) => [id, t - now])));
  }

  private openChest(client: Client, cid: unknown) {
    const p = this.state.players.get(client.sessionId);
    const c = chestById(cid);
    if (!p || p.dead || !c || Math.hypot(c.x - p.x, c.y - p.y) > CHEST_RANGE * 1.5) return;
    const now = Date.now();
    if (openedChests(p.name, now)[c.id]) return;
    const lock = chestLock(c, p, this.guardsAlive(c.id));
    if (lock) { client.send("chestlocked", { id: c.id, text: lock }); return; }
    const refill = now + CHEST_RESPAWN_MS;
    markChest(p.name, c.id, refill);
    client.send("chestopen", { id: c.id, refill: CHEST_RESPAWN_MS });
    const loot = rollChest(c.level, c.tier);
    let row = 0; // stack the "+loot" texts so they don't overlap
    const got = (kind: ItemKind, amount: number, gear = "") =>
      client.send("pickup", { kind, amount, x: c.x, y: c.y - 8 - 9 * row++, gear, name: kind === "gear" ? lvlName(gear, p.cls) : kind === "potion" || kind === "mpotion" ? potionName(kind, potSize(gear)) : "" });
    p.gold += loot.gold;
    got("gold", loot.gold);
    for (let i = 0; i < loot.potions; i++) {
      // Every other potion in a chest is a mana potion; its size follows the chest's level
      const kind: PotionKind = i % 2 === 1 ? "mpotion" : "potion", size = dropSize(c.level);
      if (this.addPotions(p, kind, size, 1)) got(kind, 1, String(size)); else this.dropItem(kind, c.x, c.y + 10, 1, String(size));
    }
    for (const g of loot.gear) {
      if (!this.bagFull(p)) { setBag(p, [...bagItems(p), g]); got("gear", 1, g); } else this.dropItem("gear", c.x, c.y + 10, 1, g);
    }
  }

  /** The Whispering Woods shrine (shared/shrine.ts): ready again at this server time. One shrine for everyone. */
  private shrineReadyAt = 0;

  /** Pray at the shrine: a random boon for this hero, then it is spent for everyone until it recharges. */
  private pray(client: Client) {
    const id = client.sessionId, p = this.state.players.get(id);
    const now = Date.now();
    if (!p || p.dead || Math.hypot(SHRINE.x - p.x, SHRINE.y - p.y) > SHRINE_RANGE * 1.5) return;
    if (now < this.shrineReadyAt) { client.send("shrine", { left: this.shrineReadyAt - now }); return; }
    this.shrineReadyAt = now + SHRINE_COOLDOWN_MS;
    const boon = rollBoon(p.hp < p.maxHp || p.energy < ENERGY.max || p.mana < p.maxMana);
    let amount = 0;
    if (boon === "heal") {
      amount = Math.round(p.maxHp - p.hp);
      p.hp = p.maxHp;
      p.energy = ENERGY.max;
      p.mana = p.maxMana;
      this.syncMana(p);
      if (amount > 0) this.broadcast("heal", { id, amount });
    } else if (boon === "xp") {
      amount = shrineXp(p.level);
      this.grantXp(id, amount, { x: p.x, y: p.y });
    } else {
      p.sk.buffs = p.sk.buffs.filter((b) => b.id !== WIND_BLESSING_ID);
      p.sk.buffs.push({ id: WIND_BLESSING_ID, until: now + WIND_BLESSING.ms, b: WIND_BLESSING, rank: 1, stacks: 0 });
      amount = WIND_BLESSING.ms;
    }
    this.broadcast("shrine", { left: SHRINE_COOLDOWN_MS, by: id, boon, amount });
  }

  // ---- Portal stones (shared/portals.ts) -----------------------------------------

  private sendPortals(client: Client, woke?: string) {
    const p = this.state.players.get(client.sessionId);
    if (p) client.send("portals", { found: [...p.portals], woke });
  }

  /** Walking up to a sleeping portal stone wakes it for this hero (saved right away). */
  private wakePortals(pid: string, p: Player) {
    if (p.portals.size >= PORTALS.length) return;
    for (const o of PORTALS) {
      if (p.portals.has(o.id) || Math.hypot(o.x - p.x, o.y - p.y) > PORTAL_WAKE_RANGE) continue;
      p.portals.add(o.id);
      saveHero(p.name, p.cls, this.snapshot(p));
      const c = this.clients.find((cl) => cl.sessionId === pid);
      if (c) this.sendPortals(c, o.id);
    }
  }

  /** Step through a woken portal to another one this hero has woken. */
  private travel(client: Client, to: unknown) {
    const id = client.sessionId, p = this.state.players.get(id);
    const now = Date.now();
    const dest = portalById(to);
    if (!p || p.dead || !dest || !p.portals.has(dest.id)) return;
    const from = PORTALS.find((o) => p.portals.has(o.id) && Math.hypot(o.x - p.x, o.y - p.y) <= PORTAL_RANGE * 1.5);
    if (!from || from.id === dest.id) return;
    if (now - p.lastHurt < PORTAL_COMBAT_MS) { client.send("travelno", { why: "fight" }); return; }
    const at = arrivalOf(dest);
    p.x = at.x; p.y = at.y; p.moving = false;
    p.rollUntil = 0; p.rolling = false;
    p.emote = "";
    this.broadcast("travel", { id, from: from.id, to: dest.id, x: at.x, y: at.y });
  }

  /** A blob called for help / fused ("merge"), or skeletons began a bone ritual ("ritual"), near (x, y): players on that step close by have seen it. */
  private questWitness(type: "merge" | "ritual", x: number, y: number) {
    const r2 = (10 * TILE) ** 2;
    this.state.players.forEach((p, pid) => {
      if (p.dead) return;
      const dx = x - p.x, dy = y - p.y;
      if (dx * dx + dy * dy > r2) return;
      for (let c = 0; c < CHAINS.length; c++) if (questStep(this.qs(p, c))?.type === type) this.nextStep(pid, p, c);
    });
  }

  /**
   * Put a quest monster in the world for this player: several blobs already melted into one (like absorb()),
   * or a single monster (a Bone Demon, a necromancer...) with a name tag and extra HP.
   */
  private summonFused(pid: string, sm: Summon, c: number) {
    const [host, ...rest] = sm.parts;
    const m = new Mob();
    m.kind = host; m.zone = -1; m.summonFor = pid; m.summonChain = c;
    m.x = m.homeX = sm.x; m.y = m.homeY = sm.y;
    m.level = regionSpecialLevel(sm.level);
    m.title = sm.title ?? "";
    const id = `q${++this.mobSeq}`;
    if (!isBlob(host)) {
      m.hp = m.maxHp = Math.round(MOBS[host].maxHp * mobScale(m.level, "hp") * (sm.hpMult ?? 1));
      if (host === "demon") { m.nextStomp = Date.now() + 2500; m.stunUntil = Date.now() + 700; } // climbing out
      this.state.mobs.set(id, m);
      if (host === "demon") this.broadcast("demonrise", { id, x: Math.round(m.x), y: Math.round(m.y) });
      if (host === "hollowking") {
        m.stunUntil = Date.now() + 1200; // rising from his throne
        const t0 = Date.now(); m.nextSweep = t0 + 2500; m.nextCircle = t0 + 4500; // a breath before his first moves
        this.broadcast("kingrise", { id, x: Math.round(m.x), y: Math.round(m.y) });
      }
      return;
    }
    m.merged = sm.parts.length; m.parts = rest.join(","); m.mergeCap = m.merged;
    // HP of all the parts together, a little under the sum so the fight stays fair at the quest's level
    m.hp = m.maxHp = Math.round(sm.parts.reduce((t, k) => t + MOBS[k].maxHp, 0) * mobScale(sm.level, "hp") * 0.7 * (sm.hpMult ?? 1));
    m.canShoot = sm.parts.includes("shooterblob"); m.canCharge = sm.parts.includes("warriorblob"); m.canHeal = sm.parts.includes("healerblob");
    this.state.mobs.set(id, m);
    this.broadcast("blobmerge", { into: id, from: "", x: Math.round(m.x), y: Math.round(m.y), level: m.level, merged: m.merged });
  }

  /** Remove the quest monster spawned for this player (step done on that chain, or they left: every chain). */
  private unsummon(pid: string, c?: number) {
    this.state.mobs.forEach((m, mid) => {
      if (m.summonFor !== pid || m.dead || (c !== undefined && m.summonChain !== c)) return;
      m.dead = true; m.hp = 0;
      this.state.mobs.forEach((s, sid) => { // and whatever it called up (the Hollow King's servants)
        if (s.mother !== mid || s.dead) return;
        s.dead = true; s.hp = 0;
        this.clock.setTimeout(() => this.state.mobs.delete(sid), 500);
      });
      this.clock.setTimeout(() => this.state.mobs.delete(mid), 500);
    });
  }

  /** "see" a monster in a zone, or "reach" a spot; keeps a quest monster around while the player is near its zone. */
  private checkQuestPlace(id: string, p: Player, c: number) {
    const s = questStep(this.qs(p, c));
    if (s?.summon && s.zone && inZone(s.zone, p.x, p.y)) {
      const now = Date.now();
      if (now >= p.nextSummon && (this.undeadUp || !NIGHT_BOSSES.includes(s.summon.parts[0]))) { // the dead's bosses only rise at night
        p.nextSummon = now + 15000;
        let mine = false;
        this.state.mobs.forEach((m) => { if (m.summonFor === id && m.summonChain === c && !m.dead) mine = true; });
        if (!mine) this.summonFused(id, s.summon, c);
      }
      return;
    }
    if (s?.type === "reach") {
      if (Math.hypot(s.at!.x - p.x, s.at!.y - p.y) <= s.at!.r) this.nextStep(id, p, c);
      return;
    }
    if (s?.type !== "see" || !inZone(s.zone!, p.x, p.y)) return;
    const r2 = (9 * TILE) ** 2;
    for (const m of this.state.mobs.values()) {
      if (m.dead || m.hidden || !s.kinds!.includes(m.kind)) continue;
      const dx = m.x - p.x, dy = m.y - p.y;
      if (dx * dx + dy * dy <= r2) { this.nextStep(id, p, c); return; }
    }
  }

  /** A monster died to this player: count it, or maybe drop a quest item only they can see. */
  private questKill(id: string, p: Player, m: Mob, c: number) {
    const q = this.qs(p, c), s = questStep(q);
    // Kills and drops count anywhere on the map: only the monster's type matters (Murat's rule)
    if (!s || !s.kinds?.includes(m.kind)) return;
    if (s.type === "kill" && (m.merged ?? 1) < (s.fused ?? 1)) return;
    if (s.type === "kill" && s.own && m.summonFor !== id) return; // a named leader: only the one summoned for this player
    if (s.type === "kill" && s.gift && q.questCount + 1 >= stepGoal(s)) this.giveGift(id, p, s.gift, m);
    if (s.type === "kill") this.questProgress(id, p, c, q.questCount + 1);
    else if (s.type === "collect" && Math.random() < (s.chance?.[m.kind] ?? 0)) this.dropItem("quest", m.x, m.y, 1, s.item!, id);
  }

  /** A quest step's gift: straight into the bag with a "+item" pop at the monster (on the ground if the bag is full). */
  private giveGift(id: string, p: Player, gear: string, at: { x: number; y: number }) {
    if (!isGearId(gear)) return;
    if (this.bagFull(p)) { this.dropItem("gear", at.x, at.y, 1, gear); return; }
    setBag(p, [...bagItems(p), gear]);
    this.clients.find((cl) => cl.sessionId === id)?.send("pickup", { kind: "gear", amount: 1, x: at.x, y: at.y - 8, gear, name: lvlName(gear, p.cls) });
  }

  private grantXp(id: string, amount: number, at: { x: number; y: number }) {
    const p = this.state.players.get(id);
    if (!p) return;
    if (p.xp >= MAX_XP) return; // max level: XP stops
    amount = Math.min(amount, MAX_XP - p.xp);
    p.xp += amount;
    this.clients.find((c) => c.sessionId === id)?.send("xp", { amount, x: at.x, y: at.y });
    const lvl = levelFromXp(p.xp);
    if (lvl > p.level) {
      const from = p.level;
      p.level = lvl;
      this.applyStats(p); // new stat points are assigned by the player in the hero panel
      if (!p.dead) p.hp = p.maxHp; // full heal on level up
      this.broadcast("levelup", { id, level: lvl, from });
    }
  }

  /** Recompute stats and max HP from class + level + equipped gear. */
  private applyStats(p: Player) {
    const st = statsFor(p.cls, { sta: p.ptSta, str: p.ptStr, mag: p.ptMag, dex: p.ptDex });
    const g = gearStats(p.cls, this.equipped(p));
    st.sta += g.sta; st.str += g.str; st.mag += g.mag; st.dex += g.dex;
    p.sta = st.sta; p.str = st.str; p.mag = st.mag; p.dex = st.dex;
    const newMax = Math.round(maxHpFromStats(p.cls, st, p.level) * talentMult(p.cls, p.talents, "hp"));
    p.hp = Math.min(newMax, p.hp + Math.max(0, newMax - p.maxHp));
    p.maxHp = newMax;
    const newMana = maxManaFor(st, p.level);
    p.mana = Math.min(newMana, p.mana + Math.max(0, newMana - p.maxMana));
    p.maxMana = newMana;
    this.syncMana(p);
  }

  /** Writes the packed mana field (Player.mp) when the whole-number value changed. */
  private syncMana(p: Player) {
    const mp = packMana(p.mana, p.maxMana, 0);
    if (p.mp !== mp) p.mp = mp;
  }

  private stats(p: Player) { return { sta: p.sta, str: p.str, mag: p.mag, dex: p.dex }; }

  /** Applies damage to a player. Returns true if it killed them. */
  private damagePlayer(tid: string, dmg: number, byName: string, push: [number, number], kbMul = 1, opts: HitOpts = {}): boolean {
    const t = this.state.players.get(tid);
    const now = Date.now();
    if (!t || t.dead || (isSafeZone(t.x, t.y) && !opts.wrath) || now < t.invulnUntil) return false;
    // A counter stance (Riposte, Mirror Ice...) eats the hit and strikes back
    if (counterHit(this.host, tid, opts.from, dmg, opts)) return false;
    // Weakened monsters hit softer
    const fromMob = opts.from ? this.state.mobs.get(opts.from) : undefined;
    if (fromMob) dmg *= dealtMult(fromMob, now);
    // ...and hit a group harder
    if (fromMob && t.party) dmg *= groupDmgMult(this.groupNear(tid, fromMob.x, fromMob.y).length);
    const guarded = blocking(t, now);
    if (guarded) dmg = Math.max(1, Math.round(dmg * (1 - GUARD_REDUCTION)));
    dmg = Math.max(1, Math.round(dmg * talentReduce(t.cls, t.talents, "armor") * takenMult(t, now)));
    const block = gearBlock(this.equipped(t)); // equipped shield
    if (block) dmg = Math.max(1, Math.round(dmg * (1 - block)));
    // A monster's fire, cold or poison attack: the hero's resistances (armour, shield, hat) cut it
    if (opts.mobEl) dmg = Math.max(1, Math.round(dmg * (1 - gearResist(this.equipped(t), opts.mobEl))));
    // Unstoppable buffs (Berserk, Whirlwind): ignore stun, slow and knockback
    const unstoppable = ccImmune(t, now);
    if (opts.stunMs && !guarded && !unstoppable) t.stunUntil = Math.max(t.stunUntil, now + opts.stunMs);
    if (opts.slowMs && !unstoppable) t.slowUntil = Math.max(t.slowUntil, now + opts.slowMs);
    t.hp = Math.max(0, t.hp - dmg);
    t.lastHurt = now;
    // Initiative: drain poise (shield blocks most of it, Unstoppable ignores it) and flinch
    if (!unstoppable) {
      const pdmg = dmg * (opts.skill ? POISE.skillMult : 1) * (guarded ? POISE.guardMult : 1) * poiseLevelMult(opts.atkLevel ?? t.level, t.level);
      if (drainPoise(t, heroPoiseMax(t), pdmg, now, POISE.heroBrokenMs)) this.broadcast("broken", { id: tid, ms: POISE.heroBrokenMs });
      if (!guarded) t.attackReadyAt = Math.max(t.attackReadyAt, now + POISE.heroFlinchMs);
    }
    t.emote = "";
    if (!guarded && !unstoppable && kbMul > 0 && (push[0] || push[1])) {
      const kb = moveStep(t.x, t.y, pushInput(push), 0.12 * kbMul);
      t.x = kb.x; t.y = kb.y;
    }
    this.broadcast("hit", { id: tid, dmg, blocked: guarded, crit: !!opts.crit, dot: !!opts.dot, el: opts.el ?? opts.mobEl, ...(opts.dot ? {} : hitDir(push)) });
    if (t.hp > 0) { afterHit(this.host, opts.from, tid, opts); return false; }
    t.dead = true;
    t.guarding = false;
    this.broadcast("kill", { killer: byName, victim: t.name });
    // The victim gets a "You died - killed by ..." screen until they respawn
    this.clients.find((c) => c.sessionId === tid)?.send("died", { by: byName, ms: RESPAWN_MS });
    this.clock.setTimeout(() => {
      if (!this.state.players.has(tid)) return;
      const s = randomSpawn();
      t.x = s.x; t.y = s.y; t.hp = t.maxHp; t.dead = false;
    }, RESPAWN_MS);
    return true;
  }

  private playerAttack(id: string) {
    const a = this.state.players.get(id);
    const now = Date.now();
    if (!a || a.dead || a.stunned || a.broken || charging(a, now) || winding(a, now)) return; // a buildup or melee wind-up holds the swing
    if (now < a.attackReadyAt) return;
    // The main-hand weapon decides the attack (shared/weapons.ts): bow = arrows, sword = melee, wand = magic bolts...
    const def = attackProfile(a.cls, this.equipped(a));
    if (def.mana) { // a wand spends mana on every bolt (shared/mana.ts)
      if (!pay(a, { mana: def.mana })) return;
      this.syncMana(a);
    }
    // Chain into the next combo hit if pressed soon enough after the last one, else restart (3rd hit = finisher)
    const step = a.lastAttack > 0 && now - a.attackReadyAt <= COMBO_WINDOW_MS && a.combo < 2 ? a.combo + 1 : 0;
    const hit = def.combo[step];
    a.combo = step;
    a.lastAttack = now;
    // Attack speed: slower when your poise is low, faster with buffs (Rage, Blade Flurry, War Drums...)
    const atkSpeed = poiseSpeed(poiseFrac(a, heroPoiseMax(a))) * atkSpeedMult(a, now);
    a.attackReadyAt = now + (hit.cooldownMs ?? def.attackCooldownMs) / atkSpeed;
    const off = aimOf(a);
    let dmg = Math.round(def.damage * weaponAttackMult(a.cls, this.stats(a), def.type) * hit.damage);
    const crit = Math.random() < critChance(this.stats(a), talentBonus(a.cls, a.talents, "crit"));
    if (crit) dmg = Math.round(dmg * 2);
    // Fire, cold, poison and faith: part of the hit changes element, elemental bonuses add to it (shared/elements.ts)
    const split = splitHit(this.equipped(a), dmg, hit.damage * (crit ? 2 : 1));
    dmg = split.phys;
    const parts = split.parts.length ? split.parts : undefined;
    a.emote = "";
    let variant = 0;
    if (step < 2) {
      // Pick a different move than last time so normal attacks look varied
      if (a.lastVariant < 0) variant = Math.floor(Math.random() * ATTACK_VARIANTS);
      else {
        variant = Math.floor(Math.random() * (ATTACK_VARIANTS - 1));
        if (variant >= a.lastVariant) variant++;
      }
      a.lastVariant = variant;
    }
    this.broadcast("swing", { id, step, variant, ax: off[0], ay: off[1], w: def.type });

    if (hit.lunge) {
      for (let moved = 0; moved < hit.lunge; moved += 2) {
        const r = moveStep(a.x, a.y, pushInput(off), 1, 2);
        if (r.x === a.x && r.y === a.y) break;
        a.x = r.x; a.y = r.y;
      }
    }

    if (def.projectile) {
      this.shoot(a, id, dmg, hit.knockback, hit.shotScale ?? 1, 0, def.projectile, parts);
      return;
    }

    const reachMult = gearReachMult(this.equipped(a)); // long weapons
    const reach = (hit.range ?? def.attackRange) * reachMult;
    const hx = a.x + off[0] * SWING_AHEAD * reachMult, hy = a.y + off[1] * SWING_AHEAD * reachMult;
    // Monsters are hit on their body, not only at their feet (big ones are wide)
    const ids = this.targetsAround(hx, hy, reach, id, (m) => mobBody(m.kind));
    // ...and monsters that were in reach a moment ago, where the hero's screen still showed them (REWIND_MS)
    const since = now - REWIND_MS, R = reach + 16;
    this.state.mobs.forEach((m, mid) => {
      if (m.dead || m.hidden || Math.abs(m.x - hx) > R + 24 || Math.abs(m.y - hy) > R + 24 || ids.includes(mid)) return;
      const h = m.hist, r = reach + mobBody(m.kind);
      // newest first; the first sample older than the window still counts (it stood there into the window)
      for (let i = h.length - 3; i >= 0; i -= 3) {
        if (Math.hypot(h[i + 1] - hx, h[i + 2] - hy) <= r) { ids.push(mid); break; }
        if (h[i] < since) break;
      }
    });
    for (const tid of ids) this.hitTarget(id, tid, dmg, off, { kb: hit.knockback, crit, basic: true, parts });
  }

  /** Fire one projectile from `a` (fireball, arrow or magic bolt), offset sideways by `lane` px. */
  private shoot(a: Player, id: string, dmg: number, knockback: number, scale: number, lane: number, def: NonNullable<AttackProfile["projectile"]>, parts?: ElemPart[]) {
    const off = aimOf(a);
    const s = new Projectile();
    // Lanes are perpendicular to the aim (for Volley)
    s.x = a.x + off[0] * 6 - off[1] * lane; s.y = a.y - 4 + off[1] * 6 + off[0] * lane;
    s.dir = a.dir; s.vx = off[0]; s.vy = off[1]; s.owner = id; s.size = scale; s.kind = def.kind;
    s.speed = def.speed; s.radius = def.radius * scale;
    s.range = def.range * gearReachMult(this.equipped(a));
    s.damage = dmg; s.knockback = knockback; s.basic = true; s.parts = parts;
    s.imb = imbueOf(a as unknown as Unit, Date.now())?.style ?? ""; // enchanted arrows look the part
    this.state.projectiles.set(`s${++this.shotSeq}`, s);
  }

  /** Secondary ranged weapon (sling, knives, crossbow) on R: its own cooldown, scales with the attack stat. */
  private fireRanged(id: string) {
    const a = this.state.players.get(id);
    const now = Date.now();
    const ranged = a ? this.equipped(a).ranged : undefined;
    const shot = ranged ? gearDef(ranged)?.shot : undefined;
    if (!a || !shot || a.dead || a.stunned || a.broken || a.rolling || now - a.lastRanged < shot.cooldownMs) return;
    a.lastRanged = now;
    a.emote = "";
    const off = aimOf(a);
    const s = new Projectile();
    s.x = a.x + off[0] * 6; s.y = a.y - 4 + off[1] * 6;
    s.dir = a.dir; s.vx = off[0]; s.vy = off[1]; s.owner = id; s.kind = shot.kind;
    s.speed = shot.speed; s.radius = 3; s.range = shot.range;
    s.damage = Math.round(shot.damage * attackMult(a.cls, this.stats(a)));
    s.knockback = 0.6;
    this.state.projectiles.set(`s${++this.shotSeq}`, s);
    this.broadcast("rangedshot", { id, kind: shot.kind });
  }

  // ---- Skills (shared/skills.ts, run by shared/skillEngine.ts) ------------------------------------------

  private pending: { at: number; fn: () => void }[] = [];
  private fieldSeq = 0;

  /** What the skill engine needs from the room. */
  private host: SkillHost = {
    now: () => Date.now(),
    later: (ms, fn) => { this.pending.push({ at: Date.now() + ms, fn }); },
    unit: (id) => (this.state.players.get(id) ?? this.state.mobs.get(id)) as Unit | undefined,
    canAct: (id) => {
      const p = this.state.players.get(id);
      return !!p && !p.dead && Date.now() >= p.stunUntil && !p.broken;
    },
    enemies: (x, y, r, of) => {
      const now = Date.now();
      return this.targetsAround(x, y, r, of).filter((tid) => {
        const t = this.state.players.get(tid);
        return !t || (!isSafeZone(t.x, t.y) && now >= t.invulnUntil);
      });
    },
    hit: (a, t, dmg, push, o) => {
      // Skills crit too (Dexterity), except damage over time and the counters that already crit
      const p = o?.skill && !o.dot && !o.crit ? this.state.players.get(a) : undefined;
      if (p && Math.random() < critChance(this.stats(p), talentBonus(p.cls, p.talents, "crit"))) { dmg *= 2; o = { ...o, crit: true }; }
      this.hitTarget(a, t, dmg, push, o);
    },
    heal: (id, amount) => {
      const p = this.state.players.get(id);
      if (!p || p.dead || amount <= 0) return;
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + amount);
      if (p.hp - before >= 3) this.broadcast("heal", { id, amount: Math.round(p.hp - before) });
    },
    aim: (id) => {
      const p = this.state.players.get(id);
      if (p) return [p.ax, p.ay];
      const m = this.state.mobs.get(id);
      return m ? DIR_OFFSET[m.dir] : [0, 1];
    },
    aimDist: (id) => {
      const p = this.state.players.get(id);
      if (!p || p.aimDist < 0) return undefined;
      const d = p.aimDist;
      p.aimDist = -1;
      return d;
    },
    face: (id, dx, dy) => {
      const p = this.state.players.get(id);
      const l = Math.hypot(dx, dy);
      if (!p || l < 0.01) return;
      p.ax = dx / l; p.ay = dy / l;
      p.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    },
    move: (id, dx, dy, dist, each) => {
      const u = this.state.players.get(id) ?? this.state.mobs.get(id);
      if (!u) return;
      const mob = !this.state.players.has(id);
      const l = Math.hypot(dx, dy) || 1;
      // Small steps so walls stop the move instead of being skipped
      for (let moved = 0; moved < dist; moved += 4) {
        const step = Math.min(4, dist - moved);
        const nx = u.x + (dx / l) * step, ny = u.y + (dy / l) * step;
        if (isSolidAt(nx, ny) || (mob && (isSafeZone(nx, ny) || noMobsAt(nx, ny)))) break;
        u.x = nx; u.y = ny;
        each?.();
      }
    },
    place: (id, x, y) => {
      const p = this.state.players.get(id);
      if (!p || isSolidAt(x, y)) return false;
      p.x = x; p.y = y;
      return true;
    },
    invuln: (id, until) => { const p = this.state.players.get(id); if (p) p.invulnUntil = Math.max(p.invulnUntil, until); },
    shoot: (spec) => {
      const s = new Projectile();
      s.x = spec.x; s.y = spec.y; s.vx = spec.vx; s.vy = spec.vy; s.owner = spec.owner;
      s.dir = Math.abs(spec.vx) > Math.abs(spec.vy) ? (spec.vx > 0 ? "right" : "left") : spec.vy > 0 ? "down" : "up";
      s.kind = spec.kind; s.size = spec.size; s.speed = spec.speed; s.range = spec.range; s.radius = spec.radius;
      s.damage = spec.dmg; s.knockback = spec.kb ?? 1; s.pierce = spec.pierce; s.spec = spec;
      s.imb = spec.imb?.style ?? "";
      this.state.projectiles.set(`s${++this.shotSeq}`, s);
    },
    addField: (inst) => {
      const f = new Field();
      f.kind = inst.def.kind; f.skill = inst.skill; f.owner = inst.owner; f.x = inst.x; f.y = inst.y; f.r = inst.def.r;
      f.ms = inst.until - Date.now(); f.follow = !!inst.def.follow; f.inst = inst;
      // Only one of each ground effect per hero (recasting a trap moves it)
      this.state.fields.forEach((o, oid) => { if (o.owner === inst.owner && o.skill === inst.skill && inst.def.trap) this.state.fields.delete(oid); });
      this.state.fields.set(`f${++this.fieldSeq}`, f);
    },
    fear: (id, ms) => {
      const now = Date.now();
      const m = this.state.mobs.get(id);
      if (m) {
        // Terrified monsters act like dizzy ones: they run for cover
        m.poiseLost = mobPoiseMax(m); m.broken = true; m.brokenUntil = Math.max(m.brokenUntil, now + ms);
        this.broadcast("broken", { id, ms });
        return;
      }
      const p = this.state.players.get(id);
      if (p) { p.slowUntil = Math.max(p.slowUntil, now + ms); p.sk.weakUntil = Math.max(p.sk.weakUntil, now + ms); }
    },
    weaponHit: (id) => {
      const p = this.state.players.get(id);
      return p ? CLASSES[p.cls].damage * attackMult(p.cls, this.stats(p)) : 0;
    },
    magic: (id) => { const p = this.state.players.get(id); return p ? magicMult(p.cls, this.stats(p)) : 1; },
    stats: (id) => { const p = this.state.players.get(id); return p ? this.stats(p) : undefined; },
    cooldownMult: (id) => { const p = this.state.players.get(id); return p ? cooldownMult(p.cls, this.stats(p), p.talents) : 1; },
    fx: (ev) => this.broadcast("sfx", ev),
  };
}
