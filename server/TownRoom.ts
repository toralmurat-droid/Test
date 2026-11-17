import { addHeat, coolHeat, isOverheated, OVERLOAD } from "../shared/overload";
import { spreadCrowd } from "./crowd";
import { MOB_CELL, MobGrid, trackSchemaMoves } from "./mobGrid";
import { fastFields } from "./schemaFast";
import { type AuthContext, Client, Room } from "colyseus";
import { MapSchema, Schema, StateView, type } from "@colyseus/schema";
import {
  AGGRO, aggroLevelFactor, BLOB_AI, BONES, DEMON, BROOD, Dir, FACTION, FEUD, MERGE, MobDef, MOTHER, SKELETON_AI, HIT_RADIUS, mobScale, regionMobLevel, regionSpecialLevel, InputState, MOB_ATTACK_RANGE, MOBS, MobKind, rollSkeletonWeapon, SKELETON_BOW, SKELETON_WEAPONS, SkeletonWeapon, REGEN_DELAY_MS, REGEN_RAMP_MS, regenFromStamina, SAFE_REGEN_MULT,
  RESPAWN_MS, TICK_RATE, TILE,
  HOLLOW_KING, ELEM_BLOB, ELEM_MOVE, inputDir, ELITE, BOSS, URSK, SUNWRIGHT, act2MobLevel, act2SpecialLevel, BEAST, BEAST_BROOD, BEAST_FOLK, BEAST_KINDS, BEAST_MOVES, BEAST_RIDER, type BeastMove,
  MAP_W, MAP_H, WORLD_H, inDeepRow, actOfTile, actMobLevel, actSpecialLevel, MOORS_AI, BADLANDS_AI, REDFANG_KINDS,
  SINKHOLES_AI, HIDEKIN_KINDS, PACK_KINDS, CROWN_AI, CROWN_KINDS, RIVEN_KING,
} from "../shared/constants";
import { HideKin, type HideKinState } from "./hidekin";
import { CrownCourt, type CrownState } from "./crownMobs";
import { ambushRoomAt, arrivalAt, CRACK_OPEN_MS, LINK_RANGE, linkById, LINKS, SHORTCUT_OPEN_MS, underground } from "../shared/dungeon";
import {
  ATTACK_VARIANTS, basicDrain, CLASSES, ClassKind, COMBO_WINDOW_MS, DODGE, EMOTES, DASH_INVULN_MS, GUARD_REDUCTION, isActiveClass, isClassKind, levelFromXp, MAX_XP, XP_CURVE_VERSION, convertOldXp, capLevel, PVP_KILL_XP, xpForLevel,
} from "../shared/classes";
import { MANA_POTION_DROP, manaRegen, maxManaFor, packMana, pay, usesGauge } from "../shared/mana";
import { Counts, dropSize, Potions, nextSize, packPotions, potionAmount, potionName, PotionKind, potionSlots, POTION_COOLDOWN_MS, POTION_STACK, slotsAfter, SIZES, total } from "../shared/potions";
/** Potion size from a ground item's `gear` field ("0".."2"). */
const potSize = (g: string) => Math.max(0, Math.min(SIZES - 1, Math.floor(Number(g) || 0)));
import { attackMult, cooldownMult, critChance, heroSpeed, magicMult, maxHpFromStats, SLOW_MOB, STATS, statPoints } from "../shared/powers";
import { AttackProfile, attackProfile, weaponAttackMult, weaponOk } from "../shared/weapons";
import { Element, ElemPart, ELEMENT_FX, mobAffinity, MOB_MELEE_ELEMENT, MOB_SHOT_ELEMENT } from "../shared/elements";
import { applyElementHit, corrodeBonus, lingerReaction, newReactState, purifies, REACTIONS, reactionWords, steamMiss, type ReactionHit, type ReactState } from "../shared/elements";
import { gearResist, splitHit } from "../shared/gear";
import { cleanFilter, LootFilter, passesFilter } from "../shared/heroSheet";
import { activeSkills, canLearn, classSkills, cleanRanks, levelPower, REPLACED_SKILLS, maxRank, topRank, NEED_TEXT, rankOf, rankPower, scalePower, skillById, skillLearned, skillOf, talentBonus, talentMult, talentReduce } from "../shared/skills";
import {
  afterHit, atkSpeedMult, blocking, bloodCost, buffLifesteal, buffRegen, castSkill, CastOut, ccImmune, fangTarget, onKill, riseAgain, charging, winding, counterHit, dealtMult, FieldInst, newRuntime,
  imbueOf, buffPoise, shotEnd, shotHit, shotPulse, ShotSpec, SkillHost, speedMult, statusOf, takenMult, tickField, tickUnit, quietUnit, Unit,
  gainEssence, toVoid, voidSlip, inVoid, absorbDamage, fillGauge, gaugeSwing,
} from "../shared/skillEngine";
import { golemDeath, golemStrike, golemTick, newMind, type GolemMind } from "../shared/golemAI";
import { newWisp, openArsenal, wispEnd, wispTick, type WispMind } from "../shared/voidConjure";
import {
  ITEM_LIFETIME_MS, ItemKind, LOOT, GOLD_PICKUP_RADIUS, PICKUP_RADIUS, PVP_GOLD_DROP,
} from "../shared/items";
import { bountyCounts, bountyOffers, cleanBounty, nearestBoard } from "../shared/bounty";
import { DOORS, DOOR_RANGE, doorById, doorDist, doorWorkable, isSafeZone, isSolidAt, randomSpawn, setDoorOpen, VILLAGE, type Door } from "../shared/map";
import { boxedInAt, isDecorSolidAt, npcById, npcNear, openGroundNear, TALK_RANGE, type Npc } from "../shared/npcs";
import { beyondWall, WATCH, WATCH_POSTS, WatchPost } from "../shared/watch";
import { inVillage, WRATH } from "../shared/wrath";
import { afterRespec, bounceWave, busking, buskingAudience, BuskingLines, ChordSync, heroSound, LazyStash, migrateSongweaver, mobSound, refillKit, oldSongTree, relevelLute, restoreMode, SONG_POTION_TEXT, SongCollector, songSave, stowItem, stringShot, SW_KIT_VERSION } from "./songs";
import { songById } from "../shared/songbook";
import { matItemId, rollMats } from "../shared/lutemaker";
import { atLutemaker, breakItem, fitTrait, pickMat } from "./lutemaker";
import { GAUGE, modeColour, PHRYGIAN, RESONANCE } from "../shared/songs";
import { soundMult } from "../shared/combat";
import type { SoundFx } from "../shared/skills";
import { sellPrice, shopBuys, shopFuses, shopWithForged } from "../shared/shops";
import { BLOB_KINDS, CHAINS, CROWN_CHAIN, packQuest, chainDone, chainOpen, chainState, cleanMentor, inZone, isBlob, type MentorState, npcPresent, QuestState, questFinished, questStep, stepFor, stepGoal, Summon, type BossVoice, TUT_CHAIN, TUT_QUESTS, USE_RANGE } from "../shared/quests";
import { bossHallAt, findHideSpot, HIDE, type HideSpot, MOTHER_KEEP_OUT, noMobsAt, spawnPoint, SPAWN_ZONES, villageDist, zoneCap } from "../shared/spawns";
import { blocked, moveStep } from "../shared/movement";
import { NIGHT_RAID, raiderByKey, raiderIgnores, RAIDERS } from "../shared/raiders";
import { SLOTS_BY_ZONE, WORK_SLOTS } from "../shared/siege";
import { DAY_CYCLE_MS, dayFrac, isUndeadNight, NIGHT_BOSSES, UNDEAD_NIGHT } from "../shared/daynight";
import { AMBUSH, BANDIT_AI, BANDIT_ROLES, CAMPS, campOfZone, CHIEF, clearWalk, findPath, POSTS, postKind, postPos, roleOf } from "../shared/bandits";
import { accountsShared, claimAccount, onAccountLost, flush, flushFinal, HeroSave, leaveAccount, loadHero, loadStash, login, markChest, openedChests, resetChests, saveHero, saveStash, type Stash } from "./accounts";
import { ACCOUNT_LEASE } from "./accountGuard";
import { offerFrom, Offer, settle, stashNear, STASH_GOLD_MAX, STASH_RANGE, STASH_SIZE, TRADE } from "../shared/trade";
import { arrivalOf, cleanPortals, PORTAL_COMBAT_MS, PORTAL_RANGE, PORTAL_WAKE_RANGE, portalById, PORTALS } from "../shared/portals";
import { rideFerry } from "./ferry";
import { rollBoon, shrineXp, SHRINE, SHRINE_COOLDOWN_MS, SHRINE_RANGE, WIND_BLESSING, WIND_BLESSING_ID } from "../shared/shrine";
import { chestById, chestLock, CHEST_RANGE, CHEST_RESPAWN_MS, CHESTS, GUARD_CHECK_MS, GUARD_RESPAWN_MS, rollChest } from "../shared/chests";
import { chorusTimers, encodeTimers, timerSig, timersOf } from "../shared/buffTimers";
import { shieldLeft } from "../shared/shields";
import { SLOT_COUNT } from "../shared/slots";
import { groupDmgMult, groupHpMult, PARTY, together } from "../shared/party";
import { canExecute, executeDamage, executeRefund, heroPoise, MOB_COMBAT, mobBody, POISE, poiseLevelMult, poiseSpeed, PVP_PROTECT_LEVEL, pvpDamageMult, pvpProtected, SWING_AHEAD } from "../shared/combat";
import {
  BAG_SIZE, baseId, isLute, wearProblem, Equipped, gearDef, GEAR_SLOTS, activeGear, heroStats, reqProblem, itemLevel, HeroReqInfo, GearSlot, gearBlock, gearName, gearReachMult, gearSpeedMult, gearStats, isGearId, potionChance, rollGear, canWear, starterKit,
  isBagItem, keepsBoundOf, socketProblem, itemRunes, withRunes, runeEffects, stripRunes, GEAR_DROP,
} from "../shared/gear";
import { fuseRunes, parseRune, rollMobRune, rollRune, RUNE_DROP, runeId, runeIdName, RUNE_KEYS, RUNES, RuneKey } from "../shared/runes";
/** "Frost Katana Lv 17" for pickup messages. */
/** Hit direction for the client's flinch nudge (unit vector, 1 decimal), or undefined when there is no push. */
const hitDir = (push: [number, number]) => {
  const l = Math.hypot(push[0], push[1]);
  return l > 0 ? { kx: Math.round((push[0] / l) * 10) / 10, ky: Math.round((push[1] / l) * 10) / 10 } : {};
};
const lvlName = (id: string, cls: string) => parseRune(id) ? runeIdName(id) : `${gearName(id, cls)}${itemLevel(id) > 1 ? ` Lv ${itemLevel(id)}` : ""}`;
import { Asker, boardFor, submit, tick as ideaTick, vote as ideaVote } from "../shared/ideas";
import { hashAddr, ideaLog, saveIdeas } from "./ideaStore";
import { dropLive, LiveState, rememberLive, takeLive } from "./handoff";
import { MobView } from "./mobView";
import { copyPatches } from "./patchCopy";
import { act1Home, actAt, actOpen, actSpawn, cityGateOf, gateColdNote, gateOpen, WAYGATE_RANGE, waygateArrival, waygateById, WAYGATES } from "../shared/act2";
import { respecCost } from "../shared/upkeep";
import { ARSENAL, ATTUNE_ORDER, attuneOf, bondShare, DEFAULT_GRIMOIRE, SUMMONER_TREE, ESSENCE, GOLEM, GOLEM_OF, golemSlots, isElement, isSummonKind, parseGrimoire, PORTAL, SUMMON, summonElement, summonScaleLevel, WISP, wispEls, type AttuneElement, type SummonKind } from "../shared/summons";
import { cleanFeast, familyOf, type Feast, feastMult, THRALL, thrallMax } from "../shared/devour";
import { Champions, type ChampState } from "./champions";
import { forgeQuery, forgedStock, onForge, packFor } from "./forge";
import { forgedGoldMult, forgedKillDrop, forgedOf, isChampion, mobDmgK, zoneVariant } from "./forgeMobs";
import { applyVariant, type ForgedMob } from "../shared/forge";
import { QuestSteps, setMeta } from "./questSteps";
import { Tide } from "./tide";
import { Rumours } from "./rumours";
import { Apprentice } from "./apprentice";
import { award, titleMsg } from "./titles";
import { cleanOwned } from "../shared/cosmetics";
import { cleanRumour, rumourDay, RUMOURS, type RumourState } from "../shared/rumours";
import { TIDE } from "../shared/tide";
import { world, worldChanged } from "./worldStore";
import { META, metaOf, nextStage, withChoice } from "../shared/questSteps";
import { traitTakenMult } from "../shared/talents";
import { AFFIX_FX, CHAMPION } from "../shared/champions";
/** A champion's helpers (its Splitting twin, a Ringleader's cutthroats) leave this long after they came. */
const CHAMP_HELPER_MS = 90_000;
import { ASK_BURST, ASK_PER_SEC, Bucket, CHAT_BURST, CHAT_PER_SEC, CRAFT_BURST, CRAFT_PER_SEC, clientIp, isLocalIp, MSG_BURST, MSG_KICK_AFTER, MSG_KICK_WINDOW_MS, MSG_PER_SEC } from "./ratelimit";

import { Player } from "./player";
import { byPart, hitBy } from "./hitBy";
import { addValor, attachWar, onWar, rallyTell, relate, warNow, warState, warTowns } from "./war";
import { boonGold, boonGoldMult, WarCrown } from "./warCrown";
import { HoldWalls } from "./holdWalls";
import { routeFrame } from "../shared/war/holdRoutes";
import { clanView, cleanOath, Presence, swear } from "./warHeroes";
import { WarTroops } from "./warTroops";
import { planAll, sendPlan } from "./warIntel";
import { WarCaravans } from "./warCaravans";
import { WarSieges } from "./warSieges";
import { WarTunnels } from "./warTunnels";
import { WarMarches } from "./warMarches";
import { WarBattles } from "./warBattles";
import { WarRituals } from "./warRituals";
import { WarHolds } from "./warHolds";
import { WarTowns } from "./warTowns";
import { townAt, townPrice } from "../shared/war/towns";
import { WarOaths } from "./warOaths";
import { WarFeuds } from "./warFeuds";
import { homeAfterOath, respawnAt, WarCapitals } from "./warCapitals";
import { cityNpcRole, cityOfPortal, cityPrice, cityRoleNear, cleanCapPaid, cleanHome } from "../shared/capitals";
import { cleanFeud } from "../shared/war/feuds";
import { WarWrits } from "./warWrits";
import { cleanWrit } from "../shared/war/writs";
import { parseTroop, WAR_TROOPS } from "../shared/war/troops";
import { huntedClan, rallyClan } from "../shared/war/rules";
import type { ClanKey } from "../shared/war/clans";
import { cleanRenown } from "../shared/war/renown";
export { Player, PlayerPrivate } from "./player"; // moved out; tests and tools import them from here

export class Mob extends Schema {
  _gm: MobGrid<Mob> | null = null; _gid = ""; _gk = NaN; _gs = 0; _gb = false; _gv = 0; // MobGrid bookkeeping (server/mobGrid.ts): it hears every move, see below
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
  summonAt = 0; nextPick = 0; // when it was called (the oldest goes first past SUMMON.max), next target choice
  drink = 0; // the vampire's Brides (v_brides): % of the damage this one deals that heals its owner
  thrall = false; // Bite (shared/devour.ts): a monster turned into a vampire's thrall (a summon that keeps its own kind)
  slot = -1; // a Summoner's permanent golem: its grimoire slot (0, 1); -1 for other summons
  mind?: GolemMind; // a golem's own powers (shared/golemAI.ts): elements, timers
  wisp?: WispMind; // a Summoner's wisp (shared/voidConjure.ts): its element, power and next shot
  react?: ReactState; // elemental reactions (shared/elements.ts REACTIONS): its mark, cooldown, Steam and Corrosion; shown through fx
  fusedSlots = 0; // a Colossus: how many golems fused into it (they come back out when it ends)
  charmUntil = 0; // Charm (v_gaze): a zone monster fighting for a vampire (owner set) until then, then it goes back to being itself
  sPower = 1; // a summon's damage multiplier (skill rank, the owner's Ruin talent, the golems fused into a Colossus)
  summonChain = 0; // ...and the quest chain of that step
  qwave = false; // a hold step's wave monster (server/questSteps.ts): counts for nothing else (the Tide)
  tide = false; // a Gloam Tide marcher (server/tide.ts): never merges or dozes, walks round walls, fills no meter
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
  dozeSlot = -1; lastTick = 0; dozy = false; // server tick bookkeeping for dozing monsters (TownRoom.dozing). Only the tick loop may clear dozy: it then calls mobs.wake(m). Clearing it anywhere else without wake() leaves the monster unvisited
  flankA = NaN; // BONES: side of the hero this skeleton closes in from (NaN = straight at him)
  hateId = ""; hate = 0; nextAggro = 0; threat = 0; // AGGRO: who hit it last and how much it hates them; level gap of the scariest hero near

  spot = ""; // hiding spot (tile "x,y") it is heading to or sitting in
  spotRetry = 0; // no new search for a spot before this (the last one found none free, HIDE.retryMs)
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
  // Beast-folk of the Mawdeep (BEAST): each move's next use, and a rush in progress (gore, stampede, swoop, pounce)
  bcd: Partial<Record<BeastMove, number>> = {};
  rushUntil = 0; rushVX = 0; rushVY = 0; rushTurn = 0; rushKind = ""; rushHit: string[] = []; rushDone = false;
  // Redfang camps (shared/bandits.ts: the Hollow, Fangrock, Talon Fort): camp member, its post (POSTS index), patrol progress, horn alert
  camp = false; post = -1; perch = false; pLeg = 0; pDir = 1; stuckSince = 0; detourUntil = 0;
  alertUntil = 0; alertHero = ""; nextHorn = 0; nextVolley = 0; rallyUntil = 0; chargeMult = 1; dashHit = false; reinforced = false;
  nextSweep = 0; nextLeap = 0; nextCry = 0;
  // Ambushers (AMBUSH): up in a tree; a call from their group to drop on a hero; the jump out in flight
  ambusher = false; ambushAt = 0; ambushHero = ""; flyUntil = 0; flyMs = 0; flyX0 = 0; flyY0 = 0; flyX = 0; flyY = 0;
  // The Night Raiders (shared/raiders.ts): the act it rides in, when it fades, its next stop on the road, where a chase began
  raidAct = 0; raidEnd = 0; rideX = NaN; rideY = 0; rideStuck = 0; chaseX = 0; chaseY = 0; nextSay = 0;
  voice?: BossVoice; halfSaid = false; // a quest boss with a voice (Summon.voice): its lines, and whether it has had its say at half health
  uPhase = 0; nextTaunt = 0; hookHero = ""; // Grandam Ursk (URSK): her phase (0 not her), next taunt, the hero her hook is flying at
  lurk = ""; // a Mawdeep ambush room it lurks in (shared/dungeon.ts AMBUSH_ROOMS), until a hero walks in
  path: [number, number][] = []; pathAt = 0; pathTX = 0; pathTY = 0; // the way round walls (gates), see seek
  pathFail = false; // the last findPath found no way: wait for the goal to move or the normal re-path time (see go)
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
  // Keep the synced fields in the order of shared/mobView.ts MOB_FIELDS (server/mobView.ts sends them by index)
  @type("string") owner = ""; // a hero's summon (shared/summons.ts): session id of the hero it fights for
  @type("number") champion = 0; // a champion's affixes, packed (shared/champions.ts packAffixes); 0 = a plain monster
  @type("string") forge = ""; // a clan's forged monster (server/forgeMobs.ts): its forging's id ("fm12"); "" = none
  champ?: ChampState; // a champion's own state (server/champions.ts)
  hk?: HideKinState; // a Hide-Kin's burrow, stitch or pit (server/hidekin.ts)
  cr?: CrownState; // one of the Crown's court: its oath, shield, decree, the Riven King's fight (server/crownMobs.ts)
  sk = newRuntime();

  stunUntil = 0;
  slowUntil = 0;
  poiseLost = 0;
  lastPoiseHit = 0;
  brokenUntil = 0;
  execSpent = false; // this break was already executed (shared/combat.ts EXECUTE)
  steadyUntil = 0;
  windUntil = 0;
  zone = 0; // index into SPAWN_ZONES (-1 for bloblings, which belong to their mother, not a zone)
  mother = ""; // bloblings: id of the Mother Blob that budded them
  nextBrood = 0; // Mother Blob: when she next tries to bud a blobling
  homeX = 0;
  homeY = 0;
  /** Player session id being chased. A monster with a target is never frozen: setting one wakes it (MobGrid.wake). */
  get target() { return this._tg; }
  set target(v: string) { this._tg = v; if (v) this._gm?.wake(this); }
  private _tg = "";
  wander: InputState = { up: false, down: false, left: false, right: false };
  nextWander = 0;
  lastAttack = 0;
}

fastFields(Player); fastFields(Mob); // the hot loops read their fields all the time (server/schemaFast.ts)
trackSchemaMoves(Mob); // TownState.mobs (a MobGrid) keeps its squares right as monsters move

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
  troop?: ClanKey; // a clan trooper's javelin: it only hurts heroes that clan fights (server/warTroops.ts)
  parts?: ElemPart[]; // a hero's elemental share (basic attacks)
  burst = 0; // a basic bolt that bursts where it lands (ComboHit.burst): foes this close take half its damage
  hitIds = new Set<string>();
  traveled = 0;
  pulsed = 0; // distance at the last pulse (ShotSpec.pulse)
  sound?: SoundFx; // a Songweaver's basic wave: a sound hit
  bounced = 0; bouncedAt = 0; // wall bounces so far, distance flown at the last one (ShotSpec.bounce)
  bounces = 0; keep = false; // a basic wave's own bounces (Steel Strings), bounces lose no damage (Silk Strings): server/songs.ts stringShot
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
  @type("string") target = ""; // Blood Link: the enemy on the other end of the cord
  @type("boolean") ally = false; // Blood Link bound to a group ally (Transfusion): the blood flows to them
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
  /** Not synced: each hero gets only the monsters near them, see server/mobView.ts. */
  mobs = new MobGrid<Mob>(); // a Map that also knows who is in each 128 px square (server/mobGrid.ts)
  @type({ map: Projectile }) projectiles = new MapSchema<Projectile>();
  @type({ map: Item }) items = new MapSchema<Item>();
  @type({ map: Zone }) zones = new MapSchema<Zone>();
  @type({ map: Field }) fields = new MapSchema<Field>();
  @type({ map: Watchman }) watch = new MapSchema<Watchman>();
  @type("string") doors = ""; // open Mawdeep gates, comma separated (shared/map.ts DOORS)
}
for (const c of [Projectile, Item, Zone, Field, Watchman, TownState]) fastFields(c);

/** Extra effects of a hit. */
interface HitOpts {
  atkLevel?: number; kb?: number; stunMs?: number; slowMs?: number; crit?: boolean; skill?: boolean;
  basic?: boolean; dot?: boolean; thorn?: boolean; burn?: [number, number]; markMs?: number; weakMs?: number; fearMs?: number;
  from?: string; // attacker id (hero or monster), for counters and thorns
  troop?: ClanKey; // a clan trooper's javelin (no `from`): whose soldiers killed the hero (server/warFeuds.ts)
  wrath?: boolean; // the village punishing an outlaw: lands even on the safe square
  parts?: ElemPart[]; // a hero's elemental damage on top of the (physical) dmg (shared/elements.ts)
  el?: Element; // the element the hit shows as (damage number colour)
  mobEl?: Element; // a monster's elemental attack: the hero's resistance cuts it
  drain?: number; // % of the damage dealt that heals the attacker (vampire skills)
  rune?: boolean; // damage from a rune effect (shared/runes.ts): never fires runes again
  pet?: boolean; // dealt by a hero's creature (golem, wisp) in their name: SUMMON.pvp applies on heroes
  poiseAdd?: number; // extra poise damage, as a share of the monster's whole poise bar (Fracture)
  sound?: SoundFx; // a Songweaver's sound hit: the target's hearing scales it (shared/combat.ts soundMult)
  poiseMul?: number; // x poise drained (Phrygian sound)
}

const COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1];
const STILL: InputState = { up: false, down: false, left: false, right: false };
const DIR_OFFSET: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const pushInput = (o: [number, number]): InputState => ({ up: o[1] < 0, down: o[1] > 0, left: o[0] < 0, right: o[0] > 0 });

/** Unit vector of the keys held (diagonals included), or null when not moving. */
function aimFromInput(i: InputState): [number, number] | null {
  const v = (i.up || i.down || i.left || i.right) && inputDir(i);
  if (v) return v;
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

type Poised = { poiseLost: number; lastPoiseHit: number; brokenUntil: number; steadyUntil: number; broken: boolean; dead: boolean; execSpent?: boolean };

const mobPoiseMax = (m: Mob) => MOB_COMBAT[m.kind].poise * mobScale(m.level, "hp") * (m.kind === "bandit" ? BANDIT_ROLES[roleOf(m.weapon)].poise : 1);
const heroPoiseMax = (p: Player) => heroPoise(p.cls, p.level);
/**
 * Drops the [time, x, y] samples older than `before` from the front of a position history, always keeping the newest.
 * Same result as `while (h.length > 3 && h[0] < before) h.splice(0, 3)`, in one move and without splice's garbage.
 */
export function dropOldSamples(h: number[], before: number) {
  let k = 0;
  while (h.length - k > 3 && h[k] < before) k += 3;
  if (!k) return;
  const len = h.length;
  for (let i = k; i < len; i++) h[i - k] = h[i];
  h.length = len - k;
}
/** An empty feud grid cell (read only), so the scans of the 9 cells round a monster allocate nothing for empty ones. */
const NO_FEUD: readonly [string, Mob][] = [];

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
  t.poiseLost = max; t.broken = true; t.brokenUntil = now + brokenMs; t.execSpent = false; // a fresh break: one execution (EXECUTE)
  return true;
}

const poiseFrac = (t: Poised, max: number) => (t.broken ? 0 : Math.max(0, 1 - t.poiseLost / max));

const bagItems = (p: Player): string[] => p.bag.toArray().filter((g): g is string => !!g);

/**
 * Rewrite the whole bag as one clear + push: several piecemeal edits of an ArraySchema in one patch (e.g. a
 * double-click sending two swaps) desynced the client copy and showed the same item in several cells. It used to
 * swap in a new ArraySchema, but the bag lives in the owner-only `me` now: a new array is a tree the owner's view never
 * saw (server/player.ts), so it is edited in place. clear() drops the patch's earlier ops on it and queues a CLEAR,
 * the pushes ADD 0..n-1 after it, so a patch carries the whole new bag whatever else changed it that tick.
 */
function setBag(p: Player, items: string[]) {
  const bag = p.bag;
  if (bag.length === items.length && items.every((g, i) => bag.at(i) === g)) return; // nothing to send
  bag.clear();
  bag.push(...items);
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
const LURK_RANGE = 3.2 * TILE; // a hero this close to a beast lurking in an ambush room springs the whole room
const DOOR_OPEN_MS = 60_000; // an opened Mawdeep gate swings shut a minute later, once nobody stands in it
/** A square (centre px, half side px) that holds every tile of a door's gate, kept per door (doors never move). */
const gateBoxes = new Map<string, [number, number, number]>();
function gateBox(d: Door): [number, number, number] {
  let b = gateBoxes.get(d.id);
  if (!b) {
    const tx = d.gate.map((k) => k % MAP_W), ty = d.gate.map((k) => Math.floor(k / MAP_W));
    const x0 = Math.min(...tx) * TILE, x1 = (Math.max(...tx) + 1) * TILE, y0 = Math.min(...ty) * TILE, y1 = (Math.max(...ty) + 1) * TILE;
    gateBoxes.set(d.id, (b = [(x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, y1 - y0) / 2 + 1]));
  }
  return b;
}
/** Time of day on the server (the wall clock, like every client); DAY_TIME=day|night|0..1 forces it for local tests. */
function worldDayFrac(now: number): number {
  const f = process.env.DAY_TIME;
  if (f === "night") return 0.8;
  if (f === "day") return 0.3;
  if (f && !isNaN(Number(f))) return (Number(f) + (now - BOOT) / DAY_CYCLE_MS) % 1;
  return dayFrac(now);
}
/** Spawn zones of the dead (every kind in them is undead): they keep the night (shared/daynight.ts). */
const UNDEAD_ZONES = new Set(SPAWN_ZONES.flatMap((z, zi) => (Object.keys(z.mobs) as MobKind[]).every((k) => FACTION[k] === "undead") && !underground(z.y * TILE) ? [zi] : [])); // below ground there is no day
/** Lairs of the dead (zones of elites only, the Barrow-King's mound): their boss does not climb straight back out by night. */
const SLOW_RISE = new Set(SPAWN_ZONES.flatMap((z, zi) => { const k = Object.keys(z.mobs) as MobKind[]; return k.length && k.every((x) => ELITE[x]) ? [zi] : []; }));

/** Monsters with no player within this many px (square) doze until someone comes by. */
const SLEEP_RANGE = 28 * TILE; // the screen shows about 12 tiles each way, so they are always awake well before they come into view
/** A dozing monster (no hero within SLEEP_RANGE) is updated once every this many ticks. */
const DOZE_EVERY = 5;
/**
 * Frozen monsters: the map is cut into WARM_CELL squares, and each tick the squares that reach within
 * SLEEP_RANGE + WARM_PAD of a living hero are marked warm. A dozing monster in a cold square is skipped outright
 * (no upkeep, no checks), so monsters where nobody plays cost nothing and the world can grow without slowing the tick.
 */
const WARM_CELL = 8 * TILE;
const WARM_PAD = 4 * TILE; // > FEUD.range: an awake monster still sees every rival it could pick a fight with
const WARM_COLS = Math.ceil(MAP_W * TILE / WARM_CELL), WARM_ROWS = Math.ceil(MAP_H * TILE / WARM_CELL);
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
  crowseer: { ...SKELETON_AI.mage, range: 135, keepAway: 70, far: 135 * 0.85, shot: "shadowbolt", mult: 1.1 }, // the crow-folk's hexes
  veiled: { ...SKELETON_AI.mage, range: 140, keepAway: 72, far: 140 * 0.85, shot: "sunbolt", shotSpeed: 160, mult: 1.1 }, // the Veiled Circle's sun-fire
  // Act 3: the bog hags' rot and the mist wraiths' grave-cold (MOORS_AI)
  boghag: { ...MOORS_AI.hag, far: MOORS_AI.hag.range * 0.85, shot: "shadowbolt" },
  mistwraith: { ...MOORS_AI.wraith, far: MOORS_AI.wraith.range * 0.85, shot: "magicbolt" },
  // Act 4: the Redfang crossbowmen's heavy bolts; the firebrands lob fire pots (elemSpecial "firepot"), no plain shot
  crossbowman: { ...BADLANDS_AI.crossbow, far: BADLANDS_AI.crossbow.range * 0.85, shot: "arrow" },
  firebrand: { keepAway: BADLANDS_AI.firepot.keepAway, far: BADLANDS_AI.firepot.range * 0.85, range: BADLANDS_AI.firepot.range, shot: "", shotSpeed: 0, shotRadius: 0 },
  // Act 5: the Quillbacks' quills; the Hide-Stitchers' hexes (and their stitch, server/hidekin.ts)
  quillback: { ...SINKHOLES_AI.quills, far: SINKHOLES_AI.quills.range * 0.85, shot: "arrow" },
  stitcher: { ...SINKHOLES_AI.hex, far: SINKHOLES_AI.hex.range * 0.85, shot: "shadowbolt" },
  // Act 6: the Hollow Herald's cold decree and the Court Magus's bolt (their decrees and blinks, server/crownMobs.ts)
  hollowherald: { ...CROWN_AI.decree, far: CROWN_AI.decree.range * 0.85, shot: "magicbolt" },
  courtmagus: { ...CROWN_AI.arcane, far: CROWN_AI.arcane.range * 0.85, shot: "magicbolt" },
};
/** Dustrider archers (the nomads' other half, BEAST_FOLK "folk"): short desert bows. */
const NOMAD_BOW: RangedCfg = { range: 125, keepAway: 60, far: 125 * 0.85, shot: "arrow", shotSpeed: 175, shotRadius: 3, mult: 0.85 };
/** Gnawkin bone-slingers (the half-folk variant, BEAST_FOLK): stones from a sling. */
const BONE_SLING: RangedCfg = { range: 115, keepAway: 55, far: 115 * 0.85, shot: "stone", shotSpeed: 150, shotRadius: 3, mult: 0.9 };

const BOW_SKELETON: RangedCfg = { ...SKELETON_BOW, range: SKELETON_WEAPONS.bow.range, far: SKELETON_WEAPONS.bow.range * 0.85, shot: "arrow", mult: SKELETON_WEAPONS.bow.dmg };
const BANDIT_BOW: RangedCfg = { ...BANDIT_AI.bow, far: BANDIT_AI.bow.range * 0.85, shot: "arrow" };
const LOOKOUT_BOW: RangedCfg = { ...BANDIT_AI.lookoutBow, keepAway: 0, far: 1e9, shot: "arrow" }; // never leaves its tower
/** A Redfang crossbowman on a fort's tower (shared/bandits.ts CAMPS): a lookout's sight and reach, a crossbow's bolt. */
const LOOKOUT_CROSSBOW: RangedCfg = { ...BADLANDS_AI.crossbow, range: BANDIT_AI.lookoutBow.range, keepAway: 0, far: 1e9, shot: "arrow" };
/** A Quillback on a Hidehall lookout tower: a lookout's sight and reach, its quills. */
const LOOKOUT_QUILLS: RangedCfg = { ...SINKHOLES_AI.quills, range: BANDIT_AI.lookoutBow.range, keepAway: 0, far: 1e9, shot: "arrow" };
const rangedOf = (m: Mob): RangedCfg | undefined =>
  m.kind === "skeleton" && m.weapon === "bow" ? BOW_SKELETON
  : m.kind === "crossbowman" && m.perch ? LOOKOUT_CROSSBOW
  : m.kind === "quillback" && m.perch ? LOOKOUT_QUILLS
  : m.kind === "bandit" ? (m.weapon === "archer" ? BANDIT_BOW : m.weapon === "lookout" ? LOOKOUT_BOW : undefined)
  : m.kind === "gnawkin" && m.weapon === "folk" ? BONE_SLING
  : m.kind === "nomad" ? (m.weapon === "folk" ? NOMAD_BOW : undefined)
  : RANGED[m.kind];
/** A warlord's war cry (the badlands' captains and Old Rourke, the sinkholes' Hide-Chieftains), if it cries war. */
const warlordOf = (k: MobKind) => BADLANDS_AI.warlords[k] ?? SINKHOLES_AI.warlords[k] ?? CROWN_AI.warlords[k];
/** A monster's stats: its kind's numbers, a bandit's role on top, and the camp's horn alert (they come from far). */
function mobDef(m: Mob, now = Date.now()): MobDef {
  let d = mobDefOf(m, now);
  const fv = m.forge ? forgedOf(m) : undefined;
  if (fv) d = applyVariant(d, fv); // a clan's forged monster (shared/forge.ts): its life, damage, speed and XP
  if (!m.champion) return d;
  // a champion hits harder and is worth more (shared/champions.ts CHAMPION); Hide-Stitched in its other skin is faster.
  // A forged monster's affixes run like a champion's, without those multipliers
  const sh = m.champ?.shifted, ch = !m.forge;
  return { ...d, damage: ch ? d.damage * CHAMPION.dmgMult : d.damage, xp: ch ? d.xp * CHAMPION.xpMult : d.xp,
    speed: sh ? d.speed * AFFIX_FX.stitched.speed : d.speed, attackCooldownMs: sh ? d.attackCooldownMs * AFFIX_FX.stitched.cooldown : d.attackCooldownMs };
}
function mobDefOf(m: Mob, now: number): MobDef {
  const base = MOBS[m.kind];
  // The Hollow King grows faster once badly hurt (HOLLOW_KING.wrath)
  if (m.kind === "hollowking") return m.hp < m.maxHp * HOLLOW_KING.wrath.hpFrac
    ? { ...base, speed: base.speed * HOLLOW_KING.wrath.speed, attackCooldownMs: base.attackCooldownMs * HOLLOW_KING.wrath.cooldown } : base;
  // The Hide-Mother rages when badly hurt; the Packlord's Howl drives his kin wild (BEAST)
  // The Sunwright as the Second Sun (SUNWRIGHT.sun)
  if (m.kind === "sunwright" && m.uPhase >= 3) return { ...base, speed: base.speed * SUNWRIGHT.sun.speed, attackCooldownMs: base.attackCooldownMs * SUNWRIGHT.sun.cooldown };
  if (m.kind === "hidemother" && m.hp < m.maxHp * BEAST.rockfall.hpFrac) return { ...base, speed: base.speed * BEAST.rockfall.speed, attackCooldownMs: base.attackCooldownMs * BEAST.rockfall.cooldown };
  if (CROWN_KINDS.includes(m.kind)) return CrownCourt.def(m, base, now); // the Crown's court: a broken oath, a decree or war cry, Kingsfall (server/crownMobs.ts)
  if (BEAST_KINDS.includes(m.kind)) return now < m.rallyUntil ? { ...base, speed: base.speed * BEAST.howl.rallySpeed, damage: base.damage * BEAST.howl.rallyDmg } : base;
  // the Redfang (and the Hide-Kin, Hidehall's camp): a Hollow bandit's role, war cries (the Chief's, a badlands captain's,
  // a Hide-Chieftain's and his howl) and the horn alert; a camp's lookout sees far
  if (m.kind !== "bandit" && m.kind !== "banditchief" && !REDFANG_KINDS.includes(m.kind) && !HIDEKIN_KINDS.includes(m.kind)) return base;
  const r = m.kind === "bandit" ? BANDIT_ROLES[roleOf(m.weapon)] : undefined;
  const rally = now < m.rallyUntil;
  const alert = now < m.alertUntil;
  const H = BANDIT_AI.horn, look = m.weapon === "lookout" || m.perch;
  return {
    ...base,
    name: r?.name ?? base.name,
    maxHp: base.maxHp * (r?.hp ?? 1),
    damage: base.damage * (r?.dmg ?? 1) * (rally ? CHIEF.warCry.dmg : 1),
    speed: base.speed * (r?.speed ?? 1) * (rally ? CHIEF.warCry.speed : 1),
    attackCooldownMs: base.attackCooldownMs * (r?.cooldown ?? 1),
    xp: base.xp * (r?.xp ?? 1),
    aggroRange: look ? H.sight : alert ? Math.max(base.aggroRange, H.alertAggro) : base.aggroRange,
    leash: look ? 1e9 : alert ? Math.max(base.leash, H.alertLeash) : base.leash,
  };
}
/** Melee reach, damage, cooldown and wind-up of a monster (skeletons depend on their weapon). */
const meleeOf = (m: Mob) => {
  const w = m.kind === "skeleton" ? SKELETON_WEAPONS[(m.weapon || "sword") as SkeletonWeapon] : undefined;
  return { range: w?.range ?? MOB_ATTACK_RANGE, dmg: w?.dmg ?? (m.kind === "demon" ? 1 + DEMON.harvest.dmgPer * m.bones : 1), cooldown: w?.cooldown ?? 1, windupMs: w?.windupMs ?? MOB_COMBAT[m.kind].windupMs };
};

/** A trade between players a and b (server only). `v` goes up with every change of an offer. */
interface Trade { a: string; b: string; v: number; offer: Record<string, Offer>; ready: Record<string, boolean> }

/** Skill clip capture: an open meadow south-east of Oakvale, outside the village (no magic there). */
const CAPTURE_SPOT: [number, number] = [101, 72];
const liveRooms = new Set<TownRoom>();
let announced = false;
/** The server is about to restart for an update: tell every player right away (TownScene shows the update notice). */
// Another server took the account of a hero playing here (server/accountGuard.ts): saves are refused, so send them away
onAccountLost((k) => liveRooms.forEach((r) => r.sendAway(k)));
export function announceUpgrade() {
  if (announced) return;
  announced = true;
  liveRooms.forEach((r) => { r.rememberAll(); r.broadcast("upgrading", {}); });
}

/** Only active classes can be played (shared/classes.ts ACTIVE_CLASSES); tests may still run archived ones. */
const playable = (c: unknown): c is ClassKind => isActiveClass(c) || (process.env.ALLOW_ARCHIVED_CLASSES === "1" && isClassKind(c));

export class TownRoom extends Room<TownState> {
  maxClients = 50;
  private mobSeq = 0;
  private shotSeq = 0;
  private mobView = new MobView();
  /** Skill clip capture (stageCapture): blobs that only stand and take the hits. */
  private dummies = new Set<string>();
  private crowdStand = (m: Mob, x: number, y: number) => this.canStep(m, x, y); // spreadCrowd's wall/safe-zone test
  /** Champions (shared/champions.ts, server/champions.ts): the room lends them a few of its powers. */
  private champs = new Champions({
    mob: (id) => this.state.mobs.get(id),
    heroes: () => this.state.players.entries(),
    hero: (id) => this.state.players.get(id),
    broadcast: (type, msg) => this.broadcast(type, msg),
    spawnHelper: (kind, x, y, level, weapon) => {
      const id = `c${++this.mobSeq}`;
      this.spawnMob(kind, -1, id, { x, y, level });
      const h = this.state.mobs.get(id);
      if (h && weapon) h.weapon = weapon;
      if (h) { h.hp = h.maxHp = Math.round(mobDef(h).maxHp * mobScale(h.level, "hp")); h.homeX = x; h.homeY = y; h.banishAt = Date.now() + CHAMP_HELPER_MS; } // gone again if nobody kills it
      return id;
    },
    dmg: (m, mult) => Math.max(1, Math.round(mobDef(m as Mob).damage * mobScale(m.level, "damage") * mult)),
    hurtHero: (pid, dmg, fromId, o) => { const m = this.state.mobs.get(fromId); this.damagePlayer(pid, dmg, m?.title || (m ? mobDef(m).name : "?"), [0, 0], 0, { atkLevel: m?.level, el: o.el, mobEl: o.el, dot: o.dot }); },
    hazard: (m, id, x, y, r, ms, tickMs, dmg, el, now) => this.addHazard(m as Mob, id, x, y, r, ms, tickMs, dmg, el, now),
    shoot: (fromId, m, x, y, tx, ty, speed, range, radius, dmg) => {
      const s = new Projectile();
      const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy) || 1;
      s.x = x; s.y = y; s.vx = dx / d; s.vy = dy / d;
      s.owner = fromId; s.kind = "arrow"; s.mobLevel = m.level || 1; s.mobName = m.title || mobDef(m as Mob).name;
      s.speed = speed; s.range = range; s.radius = radius; s.damage = dmg;
      this.state.projectiles.set(`s${++this.shotSeq}`, s);
    },
    canStand: (x, y) => !isSolidAt(x, y) && !isSafeZone(x, y) && !noMobsAt(x, y),
  });
  /** The Hide-Kin's own moves (server/hidekin.ts): burrow, stitch, the worms in the pits. */
  private hidekin = new HideKin({
    hero: (id) => this.state.players.get(id),
    heroes: () => this.state.players.entries(),
    mob: (id) => this.state.mobs.get(id),
    mobsNear: (x, y, r) => this.state.mobs.inBox(x, y, r),
    broadcast: (type, msg) => this.broadcast(type, msg),
    dmg: (m, mult) => Math.max(1, Math.round(mobDef(m as Mob).damage * mobScale(m.level, "damage") * mult)),
    hurtHero: (pid, dmg, fromId, what, push, kb, stunMs) => {
      const m = this.state.mobs.get(fromId);
      this.damagePlayer(pid, dmg, `${m ? mobDef(m).name : "?"}'s ${what}`, push, kb, { atkLevel: m?.level, from: fromId, stunMs });
    },
    canStand: (x, y) => !isSolidAt(x, y) && !isSafeZone(x, y) && !noMobsAt(x, y),
    hideNow: (m, id, radius) => {
      const s = findHideSpot(m.kind, m.x, m.y, radius, this.takenSpots(m as Mob));
      if (!s) return false;
      this.takeSpot(m as Mob, s);
      this.hide(m as Mob, id, Date.now());
      return true;
    },
    seekSpot: (m, radius) => this.claimSpot(m as Mob, m.homeX, m.homeY, radius, Date.now(), false),
  });
  /** The Crown's court (server/crownMobs.ts): oaths, shields, decrees, blinks, the hunt, ramparts, usurpers, the Riven King. */
  private crown = new CrownCourt({
    hero: (id) => this.state.players.get(id),
    heroes: () => this.state.players.entries(),
    mob: (id) => this.state.mobs.get(id),
    mobsNear: (x, y, r) => this.state.mobs.inBox(x, y, r),
    broadcast: (type, msg) => this.broadcast(type, msg),
    dmg: (m, mult) => Math.max(1, Math.round(mobDef(m as Mob).damage * mobScale(m.level, "damage") * mult)),
    hurtHero: (pid, dmg, fromId, what, push, kb, o) => {
      const m = this.state.mobs.get(fromId);
      this.damagePlayer(pid, dmg, `${m ? mobDef(m).name : "?"}'s ${what}`, push, kb, { atkLevel: m?.level, from: fromId, ...o });
    },
    canStand: (m, x, y) => { const h = bossHallAt(Math.floor(x / TILE), Math.floor(y / TILE)); return !isSolidAt(x, y) && !isSafeZone(x, y) && !noMobsAt(x, y) && (!h || h === SPAWN_ZONES[m.zone]?.name); },
    clearLine: (x0, y0, x1, y1) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8); for (let i = 1; i <= n; i++) if (isSolidAt(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)) return false; return true; },
    say: (id, lines) => this.bossSay(id, lines),
    provoke: (m, heroId) => { const o = m as Mob; o.target = heroId; o.foe = ""; o.nextAggro = Date.now() + AGGRO.everyMs; this.addHate(o, heroId, 0); },
  });
  private itemSeq = 0;
  /** The quest steps that need more than a count (server/questSteps.ts): choices, NPCs in any order, picks. */
  private qsteps!: QuestSteps;
  /** The Gloam Tide (server/tide.ts): the world meter from blob kills, and the march on the west gate. */
  private tide!: Tide;
  /** Tavern Rumours (server/rumours.ts): Mags' three daily side quests. */
  private rumours!: Rumours;
  /** The Apprentice (server/apprentice.ts): veterans standing by recruits at their first boss. */
  private apprentice!: Apprentice;

  private offWar?: () => void;
  private warPresence = new Presence();
  /** Clan troops that fight (server/warTroops.ts): the holders' soldiers on the lands near heroes, as real monsters. */
  private warTroops: WarTroops = new WarTroops({
    spawn: (id, level, x, y, weapon) => { this.spawnMob("trooper", -1, id, { x, y, level }); const m = this.state.mobs.get(id); if (m) m.weapon = weapon; return m; },
    remove: (id) => { this.state.mobs.delete(id); },
    mob: (id) => this.state.mobs.get(id), mobsInBox: (x, y, r) => this.state.mobs.inBox(x, y, r),
    heroes: () => this.state.players.entries(), hero: (id) => this.state.players.get(id),
    hidden: (id, now) => inVoid(this.state.players.get(id), now),
    strikeHero: (mid, pid, dmg, by) => { const m = this.state.mobs.get(mid); if (m) { this.broadcast("swing", { id: mid }); this.damagePlayer(pid, dmg, by, DIR_OFFSET[m.dir], 1, { atkLevel: m.level, from: mid }); this.battles.struck(mid, pid); } }, // (a battle soldier's blow keeps the hero active in the battle)
    shoot: (mid, clan, tx, ty, dmg, by) => {
      const m = this.state.mobs.get(mid), J = WAR_TROOPS.javelin;
      if (!m) return;
      this.mobShot(m, mid, tx, ty, { keepAway: 0, far: 0, range: J.max, shot: "arrow", shotSpeed: J.speed, shotRadius: J.radius });
      const s = this.state.projectiles.get(`s${this.shotSeq}`);
      if (s) { s.damage = dmg; s.mobName = by; s.troop = clan; }
    },
    strikeMob: (mid, tid, dmg) => { const m = this.state.mobs.get(mid), o = this.state.mobs.get(tid); if (m && o && !o.dead) { this.broadcast("swing", { id: mid }); this.mobHitsMob(m, mid, o, tid, dmg * this.battles.dmgMult(mid, tid)); } }, // (battle lines on each other: BATTLE.troopDmg)
    ranked: (pid, rank) => { const c = this.clients.getById(pid), p = this.state.players.get(pid); if (c && p) { c.send("clan", clanView(p)); c.send("chat", { id: "", name: "Herald", text: `Your renown grows: you are now ${rank}.` }); } },
    reserved: (): number => this.caravans.count + this.sieges.count + this.tunnels.count + this.rituals.count + this.feuds.count + this.marches.count + this.towns.count, // caravans, sieges, tunnels, rituals, manhunters, columns, town gates, then patrols
  });
  /** Caravans (server/warCaravans.ts): supply carts on the clans' roads, spawned with their escorts near heroes. */
  private caravans: WarCaravans = new WarCaravans({
    spawn: (id, level, x, y, weapon) => { this.spawnMob("trooper", -1, id, { x, y, level }); const m = this.state.mobs.get(id); if (m) m.weapon = weapon; return m; },
    remove: (id) => { this.state.mobs.delete(id); }, mob: (id) => this.state.mobs.get(id),
    heroes: () => this.state.players.entries(), hero: (id) => this.state.players.get(id),
    dropGold: (x, y, n) => this.dropItem("gold", x, y, n), broadcast: (type, msg) => this.broadcast(type, msg),
    tell: (pid, text) => this.clients.getById(pid)?.send("chat", { id: "", name: "Herald", text }),
    ranked: (pid, rank) => { const c = this.clients.getById(pid), p = this.state.players.get(pid); if (c && p) { c.send("clan", clanView(p)); c.send("chat", { id: "", name: "Herald", text: `Your renown grows: you are now ${rank}.` }); } },
    writ: (pid, kind, line) => this.writs.caravan(pid, kind, line), // escort and raid writs (server/warWrits.ts)
  }, this.warTroops);
  /** Siege battles (server/warSieges.ts): both sides at the fronts of the besieged land nearest a hero. */
  private sieges: WarSieges = new WarSieges({
    spawn: (id, level, x, y, weapon) => { this.spawnMob("trooper", -1, id, { x, y, level }); const m = this.state.mobs.get(id); if (m) m.weapon = weapon; return m; },
    remove: (id) => { this.state.mobs.delete(id); }, mob: (id) => this.state.mobs.get(id), mobsInBox: (x, y, r) => this.state.mobs.inBox(x, y, r),
    heroes: () => this.state.players.entries(), hero: (id) => this.state.players.get(id),
    broadcast: (type, msg) => this.broadcast(type, msg), budget: () => WAR_TROOPS.maxTroops - this.caravans.count,
    ranked: (pid, rank) => { const c = this.clients.getById(pid), p = this.state.players.get(pid); if (c && p) { c.send("clan", clanView(p)); c.send("chat", { id: "", name: "Herald", text: `Your renown grows: you are now ${rank}.` }); } },
  }, this.warTroops);
  /** Hide-Kin tunnels (server/warTunnels.ts): the mouth of a tunnel strike and its soldiers, near a hero. */
  private tunnels: WarTunnels = new WarTunnels({
    spawn: (id, level, x, y, weapon) => { this.spawnMob("trooper", -1, id, { x, y, level }); const m = this.state.mobs.get(id); if (m) m.weapon = weapon; return m; },
    remove: (id) => { this.state.mobs.delete(id); }, mob: (id) => this.state.mobs.get(id),
    heroes: () => this.state.players.entries(), hero: (id) => this.state.players.get(id),
    broadcast: (type, msg) => this.broadcast(type, msg), budget: () => WAR_TROOPS.maxTroops - this.caravans.count - this.sieges.count,
    ranked: (pid, rank) => { const c = this.clients.getById(pid), p = this.state.players.get(pid); if (c && p) { c.send("clan", clanView(p)); c.send("chat", { id: "", name: "Herald", text: `Your renown grows: you are now ${rank}.` }); } },
  }, this.warTroops);

  /** Veiled rituals (server/warRituals.ts): the noon ritual circle and its acolytes, near a hero. */
  private rituals: WarRituals = new WarRituals({
    spawn: (id, level, x, y, weapon) => { this.spawnMob("trooper", -1, id, { x, y, level }); const m = this.state.mobs.get(id); if (m) m.weapon = weapon; return m; },
    remove: (id) => { this.state.mobs.delete(id); }, mob: (id) => this.state.mobs.get(id), mobsInBox: (x, y, r) => this.state.mobs.inBox(x, y, r),
    heroes: () => this.state.players.entries(), hero: (id) => this.state.players.get(id),
    broadcast: (type, msg) => this.broadcast(type, msg), budget: () => WAR_TROOPS.maxTroops - this.caravans.count - this.sieges.count - this.tunnels.count,
    ranked: (pid, rank) => { const c = this.clients.getById(pid), p = this.state.players.get(pid); if (c && p) { c.send("clan", clanView(p)); c.send("chat", { id: "", name: "Herald", text: `Your renown grows: you are now ${rank}.` }); } },
  }, this.warTroops);

  /** Feuds (server/warFeuds.ts): provocations, Wanted heroes, bounties and the manhunters sent after them. */
  private feuds: WarFeuds = new WarFeuds({
    heroes: () => this.state.players.entries(), hero: (id) => this.state.players.get(id),
    group: (pid) => { const p = this.state.players.get(pid); return p?.party ? [pid, ...this.members(p.party).filter((x) => x !== pid)] : [pid]; },
    mob: (id) => this.state.mobs.get(id), remove: (id) => { this.state.mobs.delete(id); },
    spawn: (id, level, x, y, weapon) => { this.spawnMob("trooper", -1, id, { x, y, level }); const m = this.state.mobs.get(id); if (m) m.weapon = weapon; return m; },
    send: (id, type, msg) => this.clients.getById(id)?.send(type, msg), broadcast: (type, msg) => this.broadcast(type, msg),
    budget: () => WAR_TROOPS.maxTroops - this.caravans.count - this.sieges.count - this.tunnels.count - this.rituals.count - this.feuds.count,
    ranked: (pid, rank) => { const c = this.clients.getById(pid), p = this.state.players.get(pid); if (c && p) { c.send("clan", clanView(p)); c.send("chat", { id: "", name: "Herald", text: `Your renown grows: you are now ${rank}.` }); } },
  }, this.warTroops);

  /** Marching columns (server/warMarches.ts, W4): the war's attacks on the road, spawned near heroes; the war roads and columns to clients. */
  private marches: WarMarches = new WarMarches({
    spawn: (id, level, x, y, weapon) => { this.spawnMob("trooper", -1, id, { x, y, level }); const m = this.state.mobs.get(id); if (m) m.weapon = weapon; return m; },
    remove: (id) => { this.state.mobs.delete(id); }, mob: (id) => this.state.mobs.get(id),
    heroes: () => this.state.players.entries(), hero: (id) => this.state.players.get(id), broadcast: (type, msg) => this.broadcast(type, msg),
    tell: (pid, text) => this.clients.getById(pid)?.send("chat", { id: "", name: "Herald", text }),
    send: (pid, type, msg) => this.clients.getById(pid)?.send(type, msg),
    budget: () => WAR_TROOPS.maxTroops - this.caravans.count - this.sieges.count - this.tunnels.count - this.rituals.count - this.feuds.count - this.marches.count,
    ranked: (pid, rank) => { const c = this.clients.getById(pid), p = this.state.players.get(pid); if (c && p) { c.send("clan", clanView(p)); c.send("chat", { id: "", name: "Herald", text: `Your renown grows: you are now ${rank}.` }); } },
  }, this.warTroops);

  /** Big battles (server/warBattles.ts, W5): both armies' lines near heroes, in BATTLE.extraTroops slots of their own; the "battle" message. */
  private battles: WarBattles = new WarBattles({
    spawn: (id, level, x, y, weapon) => { this.spawnMob("trooper", -1, id, { x, y, level }); const m = this.state.mobs.get(id); if (m) m.weapon = weapon; return m; },
    remove: (id) => { this.state.mobs.delete(id); }, mob: (id) => this.state.mobs.get(id),
    heroes: () => this.state.players.entries(), hero: (id) => this.state.players.get(id), broadcast: (type, msg) => this.broadcast(type, msg),
    tell: (pid, text) => this.clients.getById(pid)?.send("chat", { id: "", name: "Herald", text }), pay: (pid, gold) => this.payHero(pid, gold),
    ranked: (pid, rank) => { const c = this.clients.getById(pid), p = this.state.players.get(pid); if (c && p) { c.send("clan", clanView(p)); c.send("chat", { id: "", name: "Herald", text: `Your renown grows: you are now ${rank}.` }); } },
  }, this.warTroops);

  /** Sacking Holds (server/warHolds.ts): a hero the holder fights raises their banner in an unguarded Hold. */
  private holds = new WarHolds({
    heroes: () => this.state.players.entries(), hero: (id) => this.state.players.get(id), mobsInBox: (x, y, r) => this.state.mobs.inBox(x, y, r),
    send: (id, type, msg) => this.clients.getById(id)?.send(type, msg), broadcast: (type, msg) => this.broadcast(type, msg),
    dropGold: (x, y, n) => this.dropItem("gold", x, y, n),
    guardsAlive: (t, near) => this.warTroops.guardsAlive(t, near), guardsDue: (t) => this.warTroops.guardsDue(t), guardsOff: (t, until) => this.warTroops.holdGuardsOff(t, until),
    ranked: (pid, rank) => { const c = this.clients.getById(pid), p = this.state.players.get(pid); if (c && p) { c.send("clan", clanView(p)); c.send("chat", { id: "", name: "Herald", text: `Your renown grows: you are now ${rank}.` }); } },
  });

  /** Capturable towns (server/warTowns.ts, W6): the old holder's guard at a contested town's gate, and the claim. */
  private towns: WarTowns = new WarTowns({
    spawn: (id, level, x, y, weapon) => { this.spawnMob("trooper", -1, id, { x, y, level }); const m = this.state.mobs.get(id); if (m) m.weapon = weapon; return m; },
    remove: (id) => { this.state.mobs.delete(id); }, mob: (id) => this.state.mobs.get(id),
    heroes: () => this.state.players.entries(), hero: (id) => this.state.players.get(id),
    send: (id, type, msg) => this.clients.getById(id)?.send(type, msg), broadcast: (type, msg) => this.broadcast(type, msg),
    budget: () => WAR_TROOPS.maxTroops - this.caravans.count - this.sieges.count - this.tunnels.count - this.rituals.count - this.feuds.count - this.marches.count - this.towns.count,
    ranked: (pid, rank) => { const c = this.clients.getById(pid), p = this.state.players.get(pid); if (c && p) { c.send("clan", clanView(p)); c.send("chat", { id: "", name: "Herald", text: `Your renown grows: you are now ${rank}.` }); } },
  }, this.warTroops);

  /** War writs (server/warWrits.ts): clan work from the bounty boards, apart from the hunts. */
  private writs = new WarWrits({
    hero: (id) => this.state.players.get(id), heroes: () => this.state.players.entries(),
    send: (id, type, msg) => this.clients.getById(id)?.send(type, msg),
    chat: (id, name, text) => this.clients.getById(id)?.send("chat", { id: "", name, text }),
    war: () => warState(), addValor, pay: (id, gold) => this.payHero(id, gold),
    ranked: (pid, rank) => { const c = this.clients.getById(pid), p = this.state.players.get(pid); if (c && p) { c.send("clan", clanView(p)); c.send("chat", { id: "", name: "Herald", text: `Your renown grows: you are now ${rank}.` }); } },
    save: (id) => { const p = this.state.players.get(id); if (p) saveHero(p.name, p.cls, this.snapshot(p)); },
  });

  /** The clans' capitals (server/warCapitals.ts): gate and waystone admission, the altar's oath, the leader's rewards, home. */
  private caps = new WarCapitals({
    hero: (id) => this.state.players.get(id),
    send: (id, type, msg) => this.clients.getById(id)?.send(type, msg),
    note: (id, text) => this.note(id, text),
    oathChanged: (id) => this.oathChanged(id),
    award: (id, i) => { const p = this.state.players.get(id); return !!p && award(p, i); },
    sfx: (msg) => this.broadcast("sfx", msg),
  });

  /** The Reckoning (server/warCrown.ts): the Herald's news, the notice, the pay of heroes who took part. */
  private reckoning = new WarCrown({
    heroes: () => this.state.players.entries(), hero: (id) => this.state.players.get(id),
    broadcast: (type, msg) => this.broadcast(type, msg), send: (id, type, msg) => this.clients.getById(id)?.send(type, msg),
    ranked: (pid, rank) => { const c = this.clients.getById(pid), p = this.state.players.get(pid); if (c && p) { c.send("clan", clanView(p)); c.send("chat", { id: "", name: "Herald", text: `Your renown grows: you are now ${rank}.` }); } },
    renowned: (pid) => { const c = this.clients.getById(pid), p = this.state.players.get(pid); if (c && p) c.send("clan", clanView(p)); },
  });

  /** Hold walls (server/holdWalls.ts): the forts follow the war's holders; nobody is left standing in a wall. */
  private holdWalls = new HoldWalls({ heroes: () => this.state.players.entries(), mobs: () => this.state.mobs.entries() });

  /** Tabards (server/warOaths.ts): every hero's clan and Renown rank, by message (the Player schema is full). */
  private oaths = new WarOaths({ heroes: () => this.state.players.entries(), broadcast: (msg) => this.broadcast("oaths", msg) });

  onCreate() {
    liveRooms.add(this);
    const offNews = attachWar(this), offTroops = onWar((v, _e, news) => {
      this.holdWalls.syncWar(warState()); // a land that changed hands raises its new holder's fort at once, a Hold that grew its new tier's
      this.sieges.tick(Date.now()); this.marches.onWar(); this.battles.onWar(); this.warTroops.onWar(v); this.writs.onWar(v);
      this.towns.onWar(); // contested towns' gates follow the war; every client gets the towns (server/warTowns.ts)
      planAll(this.state.players.entries(), (id) => this.clients.getById(id)); // each clan's new plan to its sworn only (server/warIntel.ts)
      const r = news.rally?.clan; // the Rally came to a clan: its sworn heroes here hear what it means for them
      if (r) for (const [id, p] of this.state.players.entries()) if (p.clan === r) this.clients.getById(id)?.send("chat", { id: "", name: "Herald", text: rallyTell(r) });
    }); // the clan war (server/war.ts) runs on its own; the room passes on the news
    const offCrown = this.reckoning.attach();
    // The Forge (server/forge.ts): a forging went live, retired or was revoked: every client gets the pack, every hero's stats follow
    const offForge = onForge((pack) => { this.broadcast("forge", pack); this.state.players.forEach((p) => this.applyStats(p)); });
    this.offWar = () => { offNews(); offTroops(); offCrown(); offForge(); };
    this.limitMessages();
    this.qsteps = new QuestSteps({
      player: (pid) => this.state.players.get(pid),
      qs: (p, c) => this.qs(p as unknown as Player, c),
      nextStep: (pid, c) => { const p = this.state.players.get(pid); if (p) this.nextStep(pid, p, c); },
      setStage: (pid, c, stage, count = 0) => { const p = this.state.players.get(pid); if (!p) return; this.qset(p, c, { questStage: stage, questCount: count }); this.sendQuest(pid, p, c); this.qsteps.changed(pid, c); },
      summon: (pid, sm, tag, home, lifeMs, wave) => {
        const id = this.summonFused(pid, sm, tag), m = this.state.mobs.get(id);
        if (m && home) { m.homeX = home.x; m.homeY = home.y; }
        if (m && lifeMs) m.banishAt = Date.now() + lifeMs; // sinks back if nobody kills it (updateMob)
        if (m && wave) { m.qwave = true; m.hp = m.maxHp = Math.round(mobDef(m).maxHp * mobScale(m.level, "hp")); } // a plain monster of its kind, not a fused one
        return id;
      },
      removeMob: (id) => { const m = this.state.mobs.get(id); if (!m || m.dead) return; m.dead = true; m.hp = 0; this.clock.setTimeout(() => this.state.mobs.delete(id), 500); },
      send: (pid, type, msg) => this.clients.find((cl) => cl.sessionId === pid)?.send(type, msg),
      broadcast: (type, msg) => this.broadcast(type, msg),
      forEachHero: (fn) => this.state.players.forEach((p, pid) => fn(pid, p)),
      mob: (id) => this.state.mobs.get(id),
      group: (pid) => { const p = this.state.players.get(pid); return p?.party ? this.members(p.party) : [pid]; },
      together: (a, b) => { const p = this.state.players.get(a), o = this.state.players.get(b); return !!p && !!o && !o.dead && together(p.x, p.y, o.x, o.y); },
      dayFrac: (now) => worldDayFrac(now),
      mobsNear: (x, y, r) => this.state.mobs.inBox(x, y, r),
      forget: (mid, pid) => { const m = this.state.mobs.get(mid); if (m && !m.dead && !m.owner) this.forgetHero(m, pid); },
      warp: (pid, x, y) => this.warp(pid, x, y),
      summonsOf: (pid) => { const out: { x: number; y: number }[] = []; for (const m of this.summons.values()) if (m.owner === pid && !m.dead) out.push({ x: m.x, y: m.y }); return out; },
    });
    this.tide = new Tide({
      heroes: () => this.state.players.entries(), hero: (pid) => this.state.players.get(pid), mob: (id) => this.state.mobs.get(id),
      spawn: (kind, level, at, home) => { const id = `t${++this.mobSeq}`; this.spawnMob(kind, -1, id, { ...at, level }); const m = this.state.mobs.get(id)!; m.tide = true; m.title = TIDE.title; m.homeX = home.x; m.homeY = home.y; return id; },
      removeMob: (id) => { const m = this.state.mobs.get(id); if (!m || m.dead) return; m.dead = true; m.hp = 0; this.clock.setTimeout(() => this.state.mobs.delete(id), 500); },
      send: (pid, type, msg) => this.clients.find((cl) => cl.sessionId === pid)?.send(type, msg),
      act1: (p) => actAt(p.y, p.x) === 1, dayFrac: (now) => worldDayFrac(now), world, changed: worldChanged,
      pay: (pid, gold, rune) => this.payHero(pid, gold, rune),
    });
    this.rumours = new Rumours({
      heroes: () => this.state.players.entries(), hero: (pid) => this.state.players.get(pid), mob: (id) => this.state.mobs.get(id),
      summon: (pid, sm, lifeMs) => { const id = this.summonFused(pid, sm, RUMOURS.tag), m = this.state.mobs.get(id); if (m) m.banishAt = Date.now() + lifeMs; return id; },
      removeMob: (id) => { const m = this.state.mobs.get(id); if (!m || m.dead) return; m.dead = true; m.hp = 0; this.clock.setTimeout(() => this.state.mobs.delete(id), 500); },
      send: (pid, type, msg) => this.clients.find((cl) => cl.sessionId === pid)?.send(type, msg),
      pay: (pid, gold, rune) => this.payHero(pid, gold, rune), dayFrac: (now) => worldDayFrac(now),
      save: (pid) => { const p = this.state.players.get(pid); if (p) saveHero(p.name, p.cls, this.snapshot(p)); },
    });
    this.apprentice = new Apprentice({
      hero: (pid) => this.state.players.get(pid),
      group: (pid) => { const p = this.state.players.get(pid); return p?.party ? this.members(p.party) : [pid]; },
      together: (a, b) => { const p = this.state.players.get(a), o = this.state.players.get(b); return !!p && !!o && !o.dead && together(p.x, p.y, o.x, o.y); },
      send: (pid, type, msg) => this.clients.find((cl) => cl.sessionId === pid)?.send(type, msg),
      note: (pid, text) => this.note(pid, text),
      reward: (pid, gold, potions) => {
        const p = this.state.players.get(pid);
        if (!p) return;
        p.gold += gold;
        const rs = dropSize(p.level, () => 0.5), left = potions - this.addPotions(p, "potion", rs, potions); // sized like quest reward potions
        if (left > 0) this.dropItem("potion", p.x, p.y + 8, left, String(rs));
      },
      save: (pid) => { const p = this.state.players.get(pid); if (p) saveHero(p.name, p.cls, this.snapshot(p)); },
    });
    // Clan war heroes (server/warHeroes.ts): oaths, and minutes at the standards reported as valor
    this.clock.setInterval(() => {
      for (const [id, rank] of this.warPresence.tick(this.state.players.entries(), Date.now(), (id, t) => this.writs.standardMinute(id, t))) {
        const c = this.clients.getById(id), p = this.state.players.get(id);
        if (c && p) { c.send("clan", clanView(p)); c.send("chat", { id: "", name: "Herald", text: `Your renown grows: you are now ${rank}.` }); }
      }
      this.holdWalls.syncWar(warState());
      this.caravans.tick(Date.now()); // (caravans claim their share of WAR_TROOPS.maxTroops first, then the sieges)
      this.sieges.tick(Date.now());
      this.tunnels.tick(Date.now());
      this.rituals.tick(Date.now());
      relate(); this.feuds.tick(Date.now()); // the clans at war (shared/war/feuds.ts), feuds decay, manhunters out and home
      this.marches.tick(Date.now()); // marching columns near heroes (server/warMarches.ts), before the patrols take what is left
      this.battles.tick(Date.now()); // big battles: the clock, and the lines near heroes in slots of their own (server/warBattles.ts)
      this.holds.tick(Date.now()); // banners going up in sacked Holds; a sacked Hold's guards stay down (server/warHolds.ts)
      this.towns.tick(Date.now()); // contested towns' gate guards and banners going up (server/warTowns.ts), before the patrols
      this.warTroops.tick(Date.now());
      this.oaths.sync(); // a rank up from any source (standards, kills, writs, caravans) reaches the tabards
    }, 1000);
    this.onMessage("clan", (client, msg: { swear?: unknown }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !this.allow("ask", client)) return;
      const err = msg && msg.swear !== undefined ? swear(p, msg.swear) : "";
      if (err) client.send("clan", { ...clanView(p), err });
      else this.oathChanged(client.sessionId);
    });
    // The clans' capitals (server/warCapitals.ts): swear at a city's altar, the leader's rank reward, bind / unbind home ({on}), {} = resend
    this.onMessage("cityoath", (client) => { if (this.allow("ask", client)) this.caps.oath(client.sessionId); });
    this.onMessage("cityreward", (client) => { if (this.allow("ask", client)) this.caps.reward(client.sessionId); });
    this.onMessage("cityhome", (client, msg: unknown) => { if (this.allow("ask", client)) this.caps.home(client.sessionId, msg); });
    this.onMessage("city", (client) => { if (this.allow("ask", client)) this.caps.view(client.sessionId); });
    this.setState(new TownState());
    copyPatches(this); // each socket gets its own copy of a patch (deflate compresses later; server/patchCopy.ts)
    // Monsters near each hero go out just before every state patch, so both halves of an update arrive together
    this.onMessage("mvready", (c) => this.mobView.ready(c));
    this.onBeforePatch = () => this.mobView.send(this.clients, this.state.mobs, (sid) => this.state.players.get(sid));
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
        for (let i = 0; i < n; i++) this.zoneSpawn(kind, zi, `m${++this.mobSeq}`);
      }
      zone.alive = zone.cap;
    });

    // The gate watch takes up its posts
    for (const post of WATCH_POSTS) {
      const w = new Watchman();
      w.post = post; w.x = post.x; w.y = post.y; w.ax = -post.nx; w.ay = -post.ny; // looking out of the gate
      this.state.watch.set(post.id, w);
    }

    // Connection check: the client times the round trip and shows it next to the online count
    this.onMessage("ping", (client, t: number) => { if (typeof t === "number") client.send("pong", t); });
    this.onMessage("input", (client, msg: InputState & { seq: number }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.input = { up: !!msg.up, down: !!msg.down, left: !!msg.left, right: !!msg.right };
      if (msg.up || msg.down || msg.left || msg.right) p.lastAct = Date.now(); // the clan war counts only heroes at the keys
      const v = inputDir(msg); // point-and-click: exact walking angle
      if (v) { p.input.vx = v[0]; p.input.vy = v[1]; }
      p.seq = msg.seq | 0;
    });

    this.onMessage("attack", (client) => { const p = this.state.players.get(client.sessionId); if (p) p.lastAct = Date.now(); this.playerAttack(client.sessionId); });
    // Point-and-click: turn toward a world point (the clicked enemy or spot) before an attack or skill
    this.onMessage("face", (client, msg: { x: number; y: number }) => {
      const p = this.state.players.get(client.sessionId);
      const x = Number(msg?.x), y = Number(msg?.y);
      if (!p || p.dead || p.rolling || !Number.isFinite(x) || !Number.isFinite(y)) return;
      this.host.face(client.sessionId, x - p.x, y - p.y);
      p.aimDist = Math.hypot(x - p.x, y - p.y);
    });
    this.onMessage("cast", (client, skill: string) => { const p = this.state.players.get(client.sessionId); if (p) p.lastAct = Date.now(); this.cast(client.sessionId, skill); });
    this.onMessage("potion", (client) => this.drinkPotion(client.sessionId));
    this.onMessage("manapotion", (client) => this.drinkManaPotion(client.sessionId));
    this.onMessage("dodge", (client) => this.dodge(client.sessionId));
    this.onMessage("equip", (client, i: number) => this.equip(client.sessionId, i));
    this.onMessage("unequip", (client, slot: GearSlot) => this.unequip(client.sessionId, slot));
    this.onMessage("dropgear", (client, i: number) => this.dropGear(client.sessionId, i));
    this.onMessage("dropgears", (client, list: number[]) => this.dropGears(client.sessionId, list));
    this.onMessage("socket", (client, m: { rune?: number; slot?: GearSlot; item?: number }) => this.socketRune(client, m));
    this.onMessage("unsocket", (client, m: { slot?: GearSlot; item?: number; n?: number }) => this.unsocketRune(client, m));
    this.onMessage("droppotion", (client, m: { kind?: string; size?: number; n?: number }) => this.dropPotions(client.sessionId, m));
    this.onMessage("lootfilter", (client, f: unknown) => { this.lootFilters.set(client.sessionId, cleanFilter(f)); });
    this.onMessage("ranged", (client) => this.fireRanged(client.sessionId));
    this.onMessage("useslot", (client, n: number) => this.useSlot(client.sessionId, n));
    this.onMessage("assign", (client, msg: { slot: number; skill: string }) => this.assignSlot(client.sessionId, msg));
    this.onMessage("learn", (client, tid: string) => this.learnTalent(client.sessionId, tid));
    this.onMessage("respec", (client) => this.respec(client.sessionId));
    this.onMessage("golems", (client) => { const p = this.state.players.get(client.sessionId); if (p) p.golemSig = ""; }); // the grimoire HUD asks to be sent again
    this.onMessage("grimoire", (client, msg: { slot?: unknown; el?: unknown }) => this.chooseGrimoire(client.sessionId, msg));
    this.onMessage("stat", (client, k: string) => this.assignStat(client.sessionId, k));
    this.onMessage("resetstats", (client) => this.resetStats(client.sessionId));

    // opt: a choice step's answer (shared/questSteps.ts ChoiceSpec), an integer the step's options are checked against
    this.onMessage("quest", (client, msg: { chain?: number; opt?: unknown }) => this.advanceQuest(client.sessionId, CHAINS[Number(msg?.chain)] ? Number(msg.chain) : 0, Number.isInteger(msg?.opt) ? (msg.opt as number) : undefined));
    this.onMessage("use", (client, msg: { id?: unknown }) => { if (typeof msg?.id === "string" && msg.id.length <= 40) this.useQuestObject(client.sessionId, msg.id); });
    // put down what a carry step has you holding (no payload; only its holder can, server/questSteps.ts)
    this.onMessage("qdrop", (client) => { if (this.allow("ask", client)) this.qsteps.drop(client.sessionId); });
    this.onMessage("chest", (client, msg: { id: string }) => this.openChest(client, msg?.id));
    this.onMessage("chests", (client) => this.sendChests(client));
    this.onMessage("door", (client, msg: { id: string }) => this.workDoor(client, msg?.id));
    this.onMessage("pray", (client) => this.pray(client));
    this.onMessage("portals", (client) => this.sendPortals(client));
    this.onMessage("travel", (client, msg: { to?: string }) => this.travel(client, msg?.to));
    this.onMessage("waygate", (client) => this.useWaygate(client));
    // Pell's ferry: {to: stop id} (checked in server/ferry.ts; refusals answer "ferryno" {why})
    this.onMessage("ferry", (client, msg: unknown) => {
      if (!this.allow("ask", client)) return;
      const pid = client.sessionId, p = this.state.players.get(pid);
      rideFerry({ send: (t, m) => client.send(t, m), broadcast: (t, m) => this.broadcast(t, m), lanternHeld: () => !!p && this.lanternHeld(pid, p) }, pid, p, msg);
    });
    this.onMessage("bounty", (client, msg: { take?: number; drop?: boolean }) => this.bountyMsg(client, msg ?? {}));
    // War writs: {} = resend, {take: 0..2} at a bounty board when sworn, {drop: true} (checked in server/warWrits.ts)
    this.onMessage("writ", (client, msg: unknown) => { if (this.allow("ask", client)) this.writs.msg(client.sessionId, msg); });
    // Feuds (server/warFeuds.ts): strike at a clan that leaves the hero alone, on purpose ({id: trooper} or {hold: territory})
    this.onMessage("townclaim", (client, msg: unknown) => { if (!this.allow("ask", client)) return; const err = this.towns.claim(client.sessionId, msg); if (err) client.send("townclaim", { id: "", err }); }); // raise a banner at a contested town's gate ({id}, server/warTowns.ts)
    this.onMessage("sack", (client, msg: unknown) => { if (!this.allow("ask", client)) return; const err = this.holds.sack(client.sessionId, msg); if (err) client.send("sack", { t: -1, err }); }); // raise a banner in a Hold ({t}, server/warHolds.ts)
    this.onMessage("provoke", (client, msg: unknown) => { if (!this.allow("ask", client)) return; const err = this.feuds.provoke(client.sessionId, msg); if (err) this.feuds.push(client.sessionId, Date.now(), err); });
    // Tavern Rumours: {take: 0..2} by Mags, {drop: true}, {} = resend (checked in server/rumours.ts)
    this.onMessage("rumour", (client, msg: unknown) => { if (this.allow("ask", client)) this.rumours.msg(client.sessionId, msg); });
    // The Apprentice: {on: boolean} by Captain Hale, {} = resend (checked in server/apprentice.ts)
    this.onMessage("mentor", (client, msg: unknown) => { if (this.allow("ask", client)) this.apprentice.msg(client.sessionId, msg); });
    // Titles: {i} shows an earned title (0 = none), {} = resend; the reply is "title" {i, owned} (server/titles.ts)
    this.onMessage("title", (client, msg: unknown) => { const p = this.state.players.get(client.sessionId); if (p && this.allow("ask", client)) client.send("title", titleMsg(p, msg)); });
    // The Forge: {ids: up to 20 forged ids} the pack lacks (retired or revoked forgings in bags); the answer is "forgeQ" {defs}
    this.onMessage("forgeQ", (client, msg: unknown) => { if (!this.allow("ask", client)) return; const ids = forgeQuery(msg); if (ids) client.send("forgeQ", { defs: packFor(ids).defs }); });
    this.onMessage("shrine", (client) => client.send("shrine", { left: Math.max(0, this.shrineReadyAt - Date.now()) }));
    // The client is ready (loading screen gone): a hero on the first step of First Steps gets its banner
    this.onMessage("tutorial", (client) => {
      const p = this.state.players.get(client.sessionId);
      const q = p && this.qs(p, TUT_CHAIN);
      if (p && q && q.questId === 0 && q.questStage === 1) this.sendQuest(client.sessionId, p, TUT_CHAIN);
    });
    this.onMessage("buy", (client, msg: { i: number }) => this.shopBuy(client, msg?.i));
    this.onMessage("sell", (client, msg: { i: number }) => this.shopSell(client, msg?.i));
    this.onMessage("fuse", (client, msg: { id?: unknown }) => this.fuseRunesMsg(client, msg?.id));
    // Wren the lute-maker (server/lutemaker.ts): break a bag item into material, fit a trait to the lute
    this.onMessage("break", (client, msg: { bag?: unknown }) => { if (this.allow("craft", client)) this.breakMsg(client, msg?.bag); });
    this.onMessage("lutefit", (client, msg: { trait?: unknown }) => { if (this.allow("craft", client)) this.luteFitMsg(client, msg?.trait); });
    // Trading between players and the account stash (shared/trade.ts)
    this.onMessage("trade", (client, msg: { id?: string; name?: string }) => { if (this.allow("ask", client)) this.tradeAsk(client.sessionId, msg); });
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
    this.clock.setInterval(() => this.tickDoors(), 1000);
    // Heartbeat: a hero standing still where nothing moves gets no state patch at all (monsters left the state
    // in the area-of-interest change), so the client's "connection died" check needs something to hear.
    this.clock.setInterval(() => this.broadcast("hb", 0), 4000);

    this.onMessage("pinvite", (client, msg: { id?: string; name?: string }) => { if (this.allow("ask", client)) this.partyInvite(client.sessionId, msg); });
    this.onMessage("paccept", (client, msg: { from?: string }) => this.partyAnswer(client.sessionId, msg?.from, true));
    this.onMessage("pdecline", (client, msg: { from?: string }) => this.partyAnswer(client.sessionId, msg?.from, false));
    this.onMessage("pleave", (client) => this.partyLeave(client.sessionId));

    this.onMessage("chat", (client, text: string) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof text !== "string" || !this.allow("chat", client)) return;
      const idea = text.trim().match(/^\/idea\s+([\s\S]+)$/i);
      if (idea) return this.submitIdea(client, idea[1]);
      const v = text.trim().match(/^\/(up|down|unvote)\s+#?(\d+)$/i);
      if (v) return this.voteIdea(client, Number(v[2]), v[1].toLowerCase() === "up" ? 1 : v[1].toLowerCase() === "down" ? -1 : 0);
      if (/^\/max$/i.test(text.trim())) return this.maxHero(client);
      // Skill clip capture only (tools/skill-clips, SKILL_CAPTURE=1, never set on the live server): a fresh stage per clip
      const stage = process.env.SKILL_CAPTURE === "1" && text.trim().match(/^\/stage(\s+weak)?$/i);
      if (stage) return this.stageCapture(client.sessionId, !!stage[1]);
      const tp = process.env.NODE_ENV !== "production" && text.trim().match(/^\/tp\s+(\d+)\s+(\d+)$/i); // dev servers only: jump to a tile
      if (tp) { p.x = (Number(tp[1]) + 0.5) * TILE; p.y = (Number(tp[2]) + 0.5) * TILE; return; }
      // Secret cheat (Murat 2026-11-13): wakes the waygate to Act 2 for this hero, on the live server too. The code is
      // private (never shown in chat or patch notes); ACT2_CODE on the server overrides it. A wrong code says nothing.
      const gate = text.trim().match(/^\/waygate\s+(\S+)$/i);
      if (gate) {
        if (gate[1] === (process.env.ACT2_CODE || "sunscar-ember-7731")) {
          for (const id of ["tutorial", "crown", "beast"]) { const c = CHAINS.findIndex((ch) => ch.id === id); if (!chainDone(p, c)) this.qset(p, c, { questId: CHAINS[c].quests.length, questStage: 0, questCount: 0 }); }
          saveHero(p.name, p.cls, this.snapshot(p));
          client.send("chat", { id: "", name: "Waygate", text: "The waygate south of Oakvale is awake for this hero." });
        }
        return;
      }
      if (process.env.NODE_ENV !== "production" && /^\/act2open$/i.test(text.trim())) { // dev servers only: both Act 1 finales done
        for (const id of ["tutorial", "crown", "beast"]) { const c = CHAINS.findIndex((ch) => ch.id === id); this.qset(p, c, { questId: CHAINS[c].quests.length, questStage: 0, questCount: 0 }); }
        return;
      }
      const nr = process.env.NODE_ENV !== "production" && text.trim().match(/^\/raider(?:\s+(\w+))?$/i); // dev servers only: a Night Raider rides up close
      if (nr) {
        const act = TownRoom.raidActAt(p.x, p.y);
        const id = act ? this.raidArrive(act, Date.now(), nr[1]?.toLowerCase(), p) : undefined;
        const m = id ? this.state.mobs.get(id) : undefined;
        if (m) for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, x = p.x + Math.cos(a) * 5 * TILE, y = p.y + Math.sin(a) * 3 * TILE; if (this.rideOk(x, y, act as 1 | 2)) { m.x = x; m.y = y; break; } }
        return;
      }
      if (process.env.NODE_ENV !== "production" && this.tide.dev(text.trim())) return; // dev servers only: /tide N, /tidemarch, /tideend
      if (process.env.NODE_ENV !== "production" && /^\/god$/i.test(text.trim())) { p.invulnUntil = Date.now() + 10 * 60_000; return; } // dev servers only: 10 min unhurt, to watch a fight
      if (process.env.NODE_ENV !== "production" && /^\/sunfinale$/i.test(text.trim())) { // dev servers only: on the Second Sun's last quest
        const c = CHAINS.findIndex((ch) => ch.id === "sun");
        this.qset(p, c, { questId: CHAINS[c].quests.length - 1, questStage: 1, questCount: 0 });
        return;
      }
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

  // ---- Anti-abuse (server/ratelimit.ts) -------------------------------------
  private msgBuckets = new Map<string, { b: Bucket; over: number; since: number }>();
  private chatBuckets = new Map<string, Bucket>();
  private askBuckets = new Map<string, Bucket>();
  private craftBuckets = new Map<string, Bucket>(); // Wren's break / lutefit (CRAFT_PER_SEC)

  /**
   * Every message handler registered after this goes through a per-client budget: past it, messages are dropped,
   * and a client that keeps flooding is disconnected. Colyseus 0.15 has no built-in limit (maxMessagesPerSecond is 0.16+).
   */
  private limitMessages() {
    const on = this.onMessage.bind(this) as (type: string, cb: (c: Client, m: any) => void) => void;
    (this as any).onMessage = (type: string, cb: (c: Client, m: any) => void) => on(type, (c: Client, m: any) => {
      let e = this.msgBuckets.get(c.sessionId);
      const now = Date.now();
      if (!e) this.msgBuckets.set(c.sessionId, (e = { b: new Bucket(MSG_PER_SEC, MSG_BURST), over: 0, since: now }));
      if (!e.b.take(now)) {
        if (now - e.since > MSG_KICK_WINDOW_MS) { e.over = 0; e.since = now; }
        if (++e.over === MSG_KICK_AFTER) { console.warn(`Flood: ${c.sessionId} disconnected`); c.leave(4429); }
        return;
      }
      cb(c, m);
    });
  }

  /** Chat lines, invites: a smaller budget per client (each one reaches other players' screens). */
  private allow(kind: "chat" | "ask" | "craft", c: Client) {
    const map = kind === "chat" ? this.chatBuckets : kind === "ask" ? this.askBuckets : this.craftBuckets;
    let b = map.get(c.sessionId);
    if (!b) map.set(c.sessionId, (b = kind === "chat" ? new Bucket(CHAT_PER_SEC, CHAT_BURST) : kind === "ask" ? new Bucket(ASK_PER_SEC, ASK_BURST) : new Bucket(CRAFT_PER_SEC, CRAFT_BURST)));
    if (b.take()) return true;
    if (kind === "chat") c.send("chat", { id: "", name: "Oakvale", text: "You are talking too fast. Wait a moment." });
    return false;
  }

  /** Remembers a hashed network address per player, so one person can't suggest or vote twice with alt heroes. */
  private addrs = new Map<string, string | undefined>();
  /** Account leases on (server/accountGuard.ts): the account each session claimed, given back when it leaves. */
  private accts = new Map<string, string>();

  /** Another server has this account now (lower-case name): its heroes here leave, their changes no longer saved. */
  sendAway(k: string) {
    for (const c of this.clients) {
      if (this.accts.get(c.sessionId)?.toLowerCase() !== k) continue;
      c.send("chat", { id: "", name: "Oakvale", text: "This hero was opened on another server." });
      c.leave(4409);
    }
  }

  /** Name + password check (server/accounts.ts); a new name creates the account. Also notes the network address for ideas. */
  async onAuth(client: Client, options: { name?: string; password?: string; cls?: string }, context: AuthContext) {
    if (!playable(options?.cls)) throw new Error("This class is archived and cannot be played for now");
    const ip = clientIp(context?.req ?? { headers: context?.headers ?? {}, socket: { remoteAddress: String(context?.ip ?? "") } });
    const name = await login(options?.name, options?.password, ip);
    let online = false;
    this.state.players.forEach((o) => { if (o.name.toLowerCase() === name.toLowerCase()) online = true; });
    if (online) throw new Error("This hero is already playing");
    if (accountsShared()) {
      // One account, one server: the hero's account is taken here (counted across every room) or refused
      const c = await claimAccount(name);
      if (c === "playing") throw new Error("This hero is already playing");
      if (c === "elsewhere") throw new Error("This hero is playing on another server");
      const sid = client.sessionId;
      this.accts.set(sid, name);
      // A seat whose client left before onJoin never reaches onLeave (Colyseus): give the account back here
      setTimeout(() => {
        if (this.accts.get(sid) !== name || this.clients.some((c) => c.sessionId === sid)) return;
        this.accts.delete(sid); void leaveAccount(name);
      }, ACCOUNT_LEASE.orphanMs).unref();
    }
    // Local addresses are skipped so several tabs on one computer can still test ideas and votes
    this.addrs.set(client.sessionId, isLocalIp(ip) ? undefined : hashAddr(ip));
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
    p.cls = playable(options?.cls) ? options.cls : "vampire";
    // "New game" on the login screen: start this class over (the old save is overwritten right away) and refill all chests
    if (options?.newGame) resetChests(p.name);
    const save = options?.newGame ? undefined : loadHero(p.name, p.cls);
    const loaded = save ? this.restore(p, save) : undefined;
    for (const text of loaded?.moved ?? []) client.send("chat", { id: "", name: "Oakvale", text }); // what a save migration moved
    this.syncPotions(p);
    // A new hero (or New game) starts the guided first quest right away; heroes from before it existed skip it
    if (!save) this.qset(p, TUT_CHAIN, { questId: 0, questStage: 1, questCount: 0 });
    // New heroes (and saves from before class kits existed) put on the class's starting kit
    if (!save?.kit) this.wearKit(p);
    this.applyStats(p);
    p.hp = p.maxHp;
    // left from the desert: back in Kel Ashar; from the moors: Cairnwatch; from the badlands: the Rustwater Post
    // (a save that no longer fits, its gate cold for the hero or an act unknown: Oakvale)
    const s = save?.act && actOpen(save.act, p) ? actSpawn(save.act, randomSpawn) : randomSpawn();
    p.x = s.x; p.y = s.y;
    // Back after an update (or a dropped connection): right where they stood, as hurt as they were, in their group
    if (options?.newGame) dropLive(p.name, p.cls);
    const back = options?.newGame ? undefined : takeLive(p.name, p.cls);
    if (back) this.resume(p, back);
    // Never start boxed in (between crates and a barrel, say): step out to the nearest open ground
    if (boxedInAt(p.x, p.y)) { const o = openGroundNear(p.x, p.y); if (o) { p.x = o.x; p.y = o.y; } }
    this.holdWalls.admitWar(p, warState()); // a Hold wall rose where they stood: step out of it now
    if (options?.newGame) saveHero(p.name, p.cls, this.snapshot(p));
    else if (loaded) this.writeLoaded(p, loaded);
    // A quest that carries on by itself (QuestDef.auto) but did not start (they left right after the last one, or its
    // steps changed in an update): it is simply under way when they come back
    for (let c = 0; c < CHAINS.length; c++) {
      const q = this.qs(p, c), d = CHAINS[c].quests[q.questId];
      if (d?.auto && q.questId > 0 && q.questStage === 0 && p.level >= d.minLevel && chainOpen(p, c)) this.qset(p, c, { questStage: nextStage(d, 0, p), questCount: 0 });
    }
    this.state.players.set(client.sessionId, p);
    // This client alone sees its hero's owner-only fields (Player.me). After players.set: StateView#add throws on an
    // instance not in the state yet. Adds `me` and its quests map too; never replace `p.me` or `p.me.quests` later.
    client.view = new StateView();
    client.view.add(p);
    if (back?.group.length) this.regroupOnJoin(client.sessionId, p, back.group);
    this.sendBoard(client); // the Ideas board is ready as soon as it is opened
    this.tide.join(client.sessionId); // the Gloam Tide's meter (server/tide.ts)
    this.rumours.join(client.sessionId); // today's rumours (server/rumours.ts)
    this.apprentice.join(client.sessionId); // mentoring state (server/apprentice.ts)
    if (Object.keys(p.feast).length) client.send("feast", { feast: p.feast }); // Devour: what this hero has eaten
    if (p.cls === "songweaver") client.send("songbook", this.songs.msg(p)); // her songs and materials (owner only)
    client.send("forge", packFor()); // the live forgings: names, stats and palettes of forged items and monsters (server/forge.ts)
    const war = warNow(); if (war) client.send("war", war); // the clan war front plaque (client/src/warPlaque.ts)
    client.send("siege", this.sieges.view()); // the live siege battle's fronts (server/warSieges.ts)
    client.send("tunnels", this.tunnels.view()); // Hide-Kin tunnel mouths (server/warTunnels.ts)
    this.marches.join(client, p); // the war roads and the marching columns (server/warMarches.ts)
    this.battles.join(client); // the big battles announced and fought (server/warBattles.ts)
    client.send("rituals", this.rituals.view()); // the Veiled noon ritual circle (server/warRituals.ts)
    client.send("holds", this.holds.view()); // sacked Holds and banners going up (server/warHolds.ts)
    client.send("towns", this.towns.view()); // capturable towns: holders, contests, banners going up (server/warTowns.ts)
    client.send("clan", clanView(p));
    sendPlan(client, p); // the clan's marches, sworn heroes only (server/warIntel.ts)
    { const ws = warState(); if (p.clan && ws && rallyClan(ws) === p.clan) client.send("chat", { id: "", name: "Herald", text: rallyTell(p.clan) }); } // Rally for the weakest
    this.oaths.sync(); client.send("oaths", this.oaths.full()); // tabards: others learn this hero's oath, this client gets everyone's
    this.writs.join(client.sessionId); // a war writ in progress (or withdrawn while away)
    this.feuds.join(client.sessionId); // their feuds (owner only) and everyone's Wanted marks (server/warFeuds.ts)
    this.reckoning.join(client.sessionId); // a Reckoning's pay waiting, and a word when one runs or is near (server/warCrown.ts)
    console.log(`${p.name} the ${CLASSES[p.cls].name} joined (${this.clients.length} online)`);
  }

  onLeave(client: Client) {
    this.mobView.leave(client);
    const p = this.state.players.get(client.sessionId);
    if (p) saveHero(p.name, p.cls, this.snapshot(p));
    if (p && !announced) this.rememberHero(client.sessionId, p); // during an update everyone was remembered together (groups intact)
    this.partyLeave(client.sessionId);
    this.qsteps.leave(client.sessionId);
    this.rumours.leave(client.sessionId);
    this.apprentice.leave(client.sessionId);
    this.lastDrainFx.delete(client.sessionId);
    this.runeCache.delete(client.sessionId); // per-session caches: a returning hero gets a new session id
    for (const k of RUNE_KEYS) this.runeReady.delete(`${client.sessionId}:${k}`);
    this.ritualCd.delete(client.sessionId);
    this.chords.drop(client.sessionId);
    this.invites.delete(client.sessionId);
    this.lootFilters.delete(client.sessionId);
    this.tradeStop(client.sessionId, "The other hero left: trade cancelled.");
    this.tradeAsks.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.warTroops.forget(client.sessionId); this.holds.forget(client.sessionId); this.caravans.forget(client.sessionId); this.sieges.forget(client.sessionId); this.tunnels.forget(client.sessionId); this.rituals.forget(client.sessionId); this.marches.forget(client.sessionId); this.battles.forget(client.sessionId); this.towns.forget(client.sessionId);
    this.oaths.leave(client.sessionId); // (after players.delete) the tabard goes for everyone
    this.feuds.forget(client.sessionId); this.feuds.leave(client.sessionId); // (likewise) the Wanted mark goes, the manhunters go home
    this.caps.leave(client.sessionId);
    this.unsummon(client.sessionId);
    this.dismissAll(client.sessionId);
    this.addrs.delete(client.sessionId);
    this.msgBuckets.delete(client.sessionId);
    this.chatBuckets.delete(client.sessionId);
    this.askBuckets.delete(client.sessionId);
    this.craftBuckets.delete(client.sessionId);
    // (last, after every save above) the account is written, then its lease given back (server/accountGuard.ts)
    const acct = this.accts.get(client.sessionId);
    if (acct !== undefined) { this.accts.delete(client.sessionId); void leaveAccount(acct); }
  }

  onDispose() {
    liveRooms.delete(this);
    this.tide?.release(); // another room may own the Gloam Tide now (server/tide.ts)
    this.offWar?.();
    this.state.players.forEach((p) => saveHero(p.name, p.cls, this.snapshot(p)));
    return flushFinal();
  }

  // ---- Seamless updates (server/handoff.ts) --------------------------------

  /** Groups to put back together after an update: hero name (lower case) -> the names they grouped with. */
  private regroup = new Map<string, { names: string[]; until: number }>();

  private rememberHero(id: string, p: Player) {
    if (p.dead) return; // the dead come back at the square anyway
    const group = p.party ? this.members(p.party).filter((m) => m !== id).map((m) => this.state.players.get(m)!.name) : [];
    rememberLive(p.name, p.cls, { x: p.x, y: p.y, dir: p.dir, hp: p.hp, mana: p.mana, energy: p.energy, group });
  }

  /** The server is going down for an update: remember every hero at once, before anyone leaves and groups break up. */
  rememberAll() { this.state.players.forEach((p, id) => this.rememberHero(id, p)); }

  private resume(p: Player, s: LiveState) {
    const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
    if (fin(s.x) && fin(s.y) && !isSolidAt(s.x, s.y) && !isDecorSolidAt(s.x, s.y)) { p.x = s.x; p.y = s.y; }
    if (s.dir === "up" || s.dir === "down" || s.dir === "left" || s.dir === "right") p.dir = s.dir;
    if (fin(s.hp)) p.hp = Math.max(1, Math.min(p.maxHp, Math.round(s.hp)));
    if (fin(s.mana) && !usesGauge(p.cls)) { p.mana = Math.max(0, Math.min(p.maxMana, s.mana)); this.syncMana(p); } // a song gauge starts empty
    // Heat (s.energy) is not restored: saves from before the overload gauge held full Stamina (100), which would read as
    // nearly overheated; a hero comes back cool.
  }

  /** A returning hero finds the friends they grouped with before the update (whoever comes back second joins them up). */
  private regroupOnJoin(id: string, me: Player, names: string[]) {
    const now = Date.now();
    const mine = me.name.toLowerCase();
    this.regroup.forEach((v, k) => { if (v.until < now) this.regroup.delete(k); });
    this.regroup.set(mine, { names: names.map((n) => n.toLowerCase()), until: now + 3 * 60_000 });
    if (me.party) return;
    this.state.players.forEach((o, oid) => {
      if (me.party || oid === id) return;
      const theirs = this.regroup.get(o.name.toLowerCase());
      if (!theirs?.names.includes(mine) || !names.some((n) => n.toLowerCase() === o.name.toLowerCase())) return;
      if (o.party && this.members(o.party).length >= PARTY.maxSize) return;
      if (!o.party) o.party = `g${++this.partySeq}`;
      me.party = o.party;
      for (const pid of this.members(o.party)) this.tell(pid, pid === id ? `Back together with ${o.name}'s group.` : `${me.name} is back in the group.`);
    });
  }

  // ---- Saves (server/accounts.ts) -------------------------------------------

  private snapshot(p: Player): HeroSave {
    const talents: Record<string, number> = {};
    p.talents.forEach((v, k) => { talents[k] = v; });
    return {
      color: p.color, xp: p.xp, xpv: XP_CURVE_VERSION, level: p.level, kills: p.kills, gold: p.gold, potions: total(p.pots.potion), pots: { potion: [...p.pots.potion], mpotion: [...p.pots.mpotion] },
      ptSta: p.ptSta, ptStr: p.ptStr, ptMag: p.ptMag, ptDex: p.ptDex,
      weapon: p.weapon, armour: p.armour, shoes: p.shoes, hat: p.hat, shield: p.shield, ranged: p.ranged,
      bag: p.bag.toArray(), talents, slots: p.slots.toArray(),
      kit: 1,
      // every chain is saved under its own three names (CHAINS[].keys: questId/questStage/questCount for the Gloam) and its verKey
      ...Object.fromEntries(CHAINS.flatMap((ch, c) => {
        const q = this.qs(p, c), [a, b, n] = ch.keys;
        return [[a, q.questId], [b, q.questStage], [n, q.questCount], [ch.verKey, ch.version]];
      })) as Record<string, number> & Pick<HeroSave, "questStage" | "questCount">, // CHAINS[0] always writes these two
      portals: [...p.portals], act: actAt(p.y, p.x),
      bounty: p.bounty, bountyDone: p.bountyDone, feast: { ...p.feast }, rumour: p.rumour && { ...p.rumour },
      // choices made (owner-only me.flags) and cosmetics (public Player.cosm), shared/questSteps.ts META; missing = 0
      flags: metaOf(p, META.flags) || undefined, cosm: metaOf(p, META.cosm) || undefined,
      titles: p.titles || undefined, mentor: p.mentor && { ...p.mentor, names: [...p.mentor.names] },
      ...(p.clan ? { clan: p.clan, clanAt: p.clanAt } : {}), ...(p.renown > 0 ? { renown: p.renown } : {}),
      ...(p.home ? { home: p.home } : {}), ...(p.capPaid > 0 ? { capPaid: p.capPaid } : {}), // the capitals: bound home, ranks paid (server/warCapitals.ts)
      ...(p.writ ? { writ: { ...p.writ } } : {}), ...(p.writN > 0 ? { writDay: p.writDay, writN: p.writN } : {}),
      ...(Object.keys(p.feud).length ? { feud: cleanFeud(p.feud, Date.now()) } : {}), // grudges, kill points, bounty day (server/warFeuds.ts)
      ...(p.claims > 0 ? { claimDay: p.claimDay, claims: p.claims } : {}), // feud bounties claimed today (FEUD.bounty.perDay)
      ...(p.cls === "summoner" ? { grimoire: this.grimoireOf(p), suTree: SUMMONER_TREE } : {}),
      ...songSave(p.cls, p.sk),
      ...this.songs.save(p),
    };
  }

  /**
   * After restore, once the hero stands somewhere (the snapshot saves her act): a load that changed the save (a
   * migration, a moved or sold item) is written back, and a stash it used goes in the same write, so nothing is in both.
   */
  private writeLoaded(p: Player, r: { dirty: boolean; stash?: Stash }) {
    if (r.stash) saveStash(p.name, r.stash, p.cls, this.snapshot(p));
    else if (r.dirty) saveHero(p.name, p.cls, this.snapshot(p));
  }

  /**
   * Loads a save into the hero (onJoin then calls writeLoaded). Returns chat lines about items a migration moved (the room sends them on join), whether
   * the save changed (`dirty`) and the stash to write with it, if a migration touched it.
   */
  private restore(p: Player, s: HeroSave): { moved: string[]; dirty: boolean; stash?: Stash } {
    const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    // gear she may not wear (a kit of another class, the Songweaver's musical-only rule) goes to the bag, not away
    const misfit: string[] = [];
    const gear = (v: unknown) => (typeof v !== "string" || !isGearId(v) ? "" : canWear(p.cls, v) ? v : (misfit.push(v), ""));
    p.color = num(s.color, p.color);
    p.level = capLevel(num(s.level, 1)); p.kills = num(s.kills);
    // Saves from before the slower XP curve (2026-11-08) keep their level and their share of the way to the next one
    p.xp = Math.min(MAX_XP, s.xpv === XP_CURVE_VERSION ? num(s.xp) : convertOldXp(num(s.xp), p.level));
    if (levelFromXp(p.xp) < p.level) p.xp = xpForLevel(p.level); // never a bar below the hero's level
    p.gold = num(s.gold);
    // Potions by size; saves from before potion sizes had plain counts (all Minor), and a few mana potions for heroes older than mana
    const cnt = (v: unknown): Counts => (Array.isArray(v) ? [0, 1, 2].map((i) => Math.min(120, Math.max(0, Math.floor(num(v[i]))))) : [0, 0, 0]) as Counts;
    p.pots = s.pots ? { potion: cnt(s.pots.potion), mpotion: cnt(s.pots.mpotion) } : { potion: [Math.min(50, num(s.potions)), 0, 0], mpotion: [Math.min(50, num(s.mpotions, 2)), 0, 0] };
    // The Songweaver's kit (server/songs.ts): before the gear filter, so a shield she wore moves instead of vanishing
    const stash = new LazyStash(() => loadStash(p.name)), toStash = (item: string) => stash.put(item);
    const kitWas = typeof s.swKit === "number" ? s.swKit : 0;
    const moved = migrateSongweaver(p, s, stash);
    p.ptSta = num(s.ptSta); p.ptStr = num(s.ptStr); p.ptMag = num(s.ptMag); p.ptDex = num(s.ptDex);
    // A hero saved above today's level cap spent more points than his level gives: hand them back to place again
    if (p.ptSta + p.ptStr + p.ptMag + p.ptDex > statPoints(p.level)) p.ptSta = p.ptStr = p.ptMag = p.ptDex = 0;
    p.weapon = gear(s.weapon); p.armour = gear(s.armour); p.shoes = gear(s.shoes);
    p.hat = gear(s.hat); p.shield = gear(s.shield); p.ranged = gear(s.ranged);
    // The bag may hold items for other classes (bought, traded or taken from the stash for another hero)
    const bag = Array.isArray(s.bag) ? s.bag.filter((v): v is string => isBagItem(v)).slice(0, BAG_SIZE) : [];
    for (const v of misfit) moved.push(stowItem(p, bag, v, toStash, "you can't wear it."));
    const loose: string[] = [];
    relevelLute(p, bag, loose); // the Songweaver's lute is at her level (DI-5)
    for (const v of loose) moved.push(stowItem(p, bag, v, toStash, "your lute had fewer sockets."));
    moved.push(...refillKit(p, bag, stash.peek())); // a lost lute or Songbook comes back
    if (Array.isArray(s.bag) || bag.length) setBag(p, bag);
    // Old saves (before the skill tree rework) had other skill ids: those points come back to spend again
    // The Summoner's tree was rebuilt (Void Lord, 2026-11-08): a save from the old tree gets every skill point back
    const oldTree = (p.cls === "summoner" && s.suTree !== SUMMONER_TREE) || oldSongTree(p.cls, s.swTree);
    if (!oldTree) for (const [k, v] of Object.entries(cleanRanks(p.cls, p.level, s.talents ?? {}))) p.talents.set(k, v);
    restoreMode(p as unknown as Unit, s.swMode); // the Songweaver's mode, if she still knows it
    if (p.cls === "summoner") this.setGrimoire(p, oldTree ? DEFAULT_GRIMOIRE : String(s.grimoire ?? DEFAULT_GRIMOIRE));
    if (Array.isArray(s.slots)) s.slots.slice(0, SLOT_COUNT).forEach((v, i) => {
      if (typeof v === "string" && REPLACED_SKILLS[v]) v = REPLACED_SKILLS[v]; // a replaced skill keeps its key
      p.slots[i] = typeof v === "string" && skillLearned(p.cls, p.talents, v) && skillOf(p.cls, v)?.passive === undefined ? v : "";
    });
    for (const id of cleanPortals(s.portals)) p.portals.add(id);
    p.bountyDone = Math.max(0, Math.floor(num(s.bountyDone)));
    p.bounty = cleanBounty(s.bounty);
    p.rumour = cleanRumour(s.rumour, rumourDay(Date.now()), p.level); // another day's rumours start over
    { const o = cleanOath(s.clan, s.clanAt); p.clan = o.clan; p.clanAt = o.clanAt; p.renown = cleanRenown(s.renown); } // clan war oath (server/warHeroes.ts)
    p.home = cleanHome(s.home); p.capPaid = cleanCapPaid(s.capPaid); homeAfterOath(p); // the capitals (server/warCapitals.ts): older saves have neither
    p.writ = cleanWrit(s.writ, p.clan); p.writDay = Math.max(0, Math.floor(num(s.writDay))); p.writN = Math.max(0, Math.floor(num(s.writN))); // war writs (server/warWrits.ts)
    p.feast = cleanFeast(s.feast);
    p.feud = cleanFeud(s.feud, Date.now(), true); // feuds (shared/war/feuds.ts): time away decays at half rate; older saves have none
    p.claimDay = Math.max(0, Math.floor(num(s.claimDay))); p.claims = Math.max(0, Math.floor(num(s.claims)));
    setMeta(p, META.flags, num(s.flags)); setMeta(p, META.cosm, num(s.cosm)); // choices (me.flags) and cosmetics (cosm), kept apart from the chains' progress
    p.titles = cleanOwned(s.titles, num(s.cosm)); // titles earned; saves from before the list own the one they show
    p.mentor = cleanMentor(s.mentor);
    const sv = s as unknown as Record<string, unknown>;
    // Saves from before the guided first quest count it as done
    if (sv.tutVer === undefined) sv.tutId = TUT_QUESTS.length;
    CHAINS.forEach((ch, c) => {
      const [a, b, n] = ch.keys;
      // whole numbers in packQuest's range, so a corrupt save can't spill one value into another
      const whole = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(num(v))));
      const st = { questId: whole(sv[a], ch.quests.length), questStage: whole(sv[b], 99), questCount: whole(sv[n], 99) };
      // The steps of a quest changed since this save: start the current quest again from its offer
      if (num(sv[ch.verKey], 1) !== ch.version && st.questStage > 0) { st.questStage = 0; st.questCount = 0; }
      this.qset(p, c, st);
    });
    // collected songs and materials (server/songs.ts SongCollector); kit v3: songs of quests finished before them
    this.songs.load(p, s, (q) => questFinished(p, q), kitWas < SW_KIT_VERSION);
    // onJoin writes the hero back (with the stash, in one go) once she stands somewhere: a migration or a moved item
    // changed the save (gold from a sold item included), and the snapshot's act needs her position
    const dirty = moved.length > 0 || !!stash.loaded || (p.cls === "songweaver" && kitWas < SW_KIT_VERSION);
    return { moved, dirty, stash: stash.loaded };
  }

  /** A spawn spot in the zone away from every hero, or null if none turned up (the hero stands in a small zone). */
  private freeSpawnPoint(zi: number, kind: MobKind) {
    const camp = campOfZone(SPAWN_ZONES[zi].name);
    if (camp >= 0) {
      const post = this.freePost("", camp, kind);
      if (post < 0) return null;
      const at = postPos(POSTS[post]);
      return this.playerNear(at.x, at.y, NO_SPAWN_RANGE) ? null : { ...at, level: spawnPoint(SPAWN_ZONES[zi], kind).level };
    }
    for (let i = 0; i < 12; i++) {
      const pt = spawnPoint(SPAWN_ZONES[zi], kind);
      if (!this.playerNear(pt.x, pt.y, NO_SPAWN_RANGE)) return pt;
    }
    return null;
  }

  /** A zone monster (re)spawns: in a land a clan holds, maybe as its forged monster (server/forgeMobs.ts), else maybe a champion. */
  private zoneSpawn(kind: MobKind, zi: number, id: string, at?: ReturnType<typeof spawnPoint>) {
    const fv = zoneVariant(zi, kind);
    this.spawnMob(kind, zi, id, at, fv);
    if (!fv) this.champs.roll(this.state.mobs.get(id)!, id); // about one in twenty comes as a champion (shared/champions.ts)
  }

  private spawnMob(kind: MobKind, zi: number, id = `m${++this.mobSeq}`, at?: ReturnType<typeof spawnPoint>, fv?: ForgedMob) {
    const m = this.state.mobs.get(id) ?? new Mob();
    let home = at ?? spawnPoint(SPAWN_ZONES[zi], kind);
    m.kind = kind;
    m.forge = fv?.id ?? ""; // (before mobDef below: a forging's life)
    m.title = ""; this.champs.clear(m); // a respawn reusing this Mob starts plain (zone spawns may roll a champion after)
    m.weapon = kind === "skeleton" ? rollSkeletonWeapon() : Math.random() < (BEAST_FOLK[kind] ?? 0) ? "folk" : ""; // beast-folk: half get the other half-folk look
    m.camp = false; m.post = -1; m.perch = false; m.pLeg = 0; m.pDir = 1; m.stuckSince = 0; m.detourUntil = 0;
    m.alertUntil = 0; m.alertHero = ""; m.nextHorn = 0; m.nextVolley = 0; m.rallyUntil = 0; m.chargeMult = 1; m.dashHit = false; m.reinforced = false;
    m.nextSweep = 0; m.nextLeap = 0; m.nextCry = 0;
    m.ambusher = false; m.ambushAt = 0; m.ambushHero = ""; m.flyUntil = 0;
    m.nextSplurt = 0; m.nextNova = 0; m.nextBreath = 0; m.nextSparks = 0;
    const camp = zi >= 0 ? campOfZone(SPAWN_ZONES[zi]?.name) : -1;
    if (camp >= 0) {
      // The camp: every bandit takes the first free post of its kind (its role, spot and patrol route). A Hollow bandit
      // wears its role in Mob.weapon; the badlands' Redfang kinds keep theirs in the flags (a lookout's "lookout" too, so
      // the client draws it up on its tower)
      const post = this.freePost(id, camp, kind);
      if (post >= 0) {
        const P = POSTS[post];
        m.camp = true; m.post = post; m.weapon = kind === "bandit" || P.role === "lookout" ? P.role : ""; m.perch = P.role === "lookout"; m.ambusher = P.role === "ambusher";
        home = { ...postPos(P), level: home.level };
      }
    } else if (kind === "rourke") {
      m.camp = true; m.post = -1; // Old Rourke leads Fangrock: hears its horn, rallies his men
    } else if (kind === "bandit" && SPAWN_ZONES[zi]?.name === "Gullrock Cove") {
      m.weapon = (["cutthroat", "brute", "archer", "cutthroat"] as const)[this.mobSeq % 4]; // the raiding party: a mix of roles
    }
    if (fv?.weapon !== undefined && !m.camp) m.weapon = fv.weapon; // a forging's skeleton weapon or bandit role
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
    m.react = undefined; // no elemental mark left from its last life
    m.work = ""; m.job = -1; m.leg = 1; m.restUntil = 0;
    if (kind === "skeleton" && zi >= 0) this.takeJob(m, id, SPAWN_ZONES[zi].name);
    m.merged = 1; m.parts = ""; m.summonFor = ""; m.mergeInto = ""; m.mergeCap = 0; m.nextCall = 0; m.nextShot = 0;
    m.canShoot = kind === "shooterblob"; m.canCharge = kind === "warriorblob"; m.canHeal = kind === "healerblob";
    if (kind === "motherblob") m.nextBrood = Date.now() + BROOD.minMs + Math.random() * (BROOD.maxMs - BROOD.minMs);
    if (!this.state.mobs.has(id)) this.state.mobs.set(id, m);
    if (fv) this.champs.makeForged(m, fv.affixes); // its affixes, run by the champion machinery
    // An ambusher is already up in its tree when it comes (nobody is near: spawns keep NO_SPAWN_RANGE from heroes)
    if (m.ambusher && this.treeFor(m, Date.now())) this.hide(m, id, Date.now());
    this.hidekin.spawned(m, id); // (a Gullet Worm is already down in its pit)
    this.crown.spawned(m); // (a Riven King on his throne gets his voice)
    m.lurk = "";
    if (zi >= 0) this.lurkIfAmbush(m, id);
  }

    /** Beast-folk in a Mawdeep ambush room wait in the dark (only their eyes show) for a hero to walk in. */
  private lurkIfAmbush(m: Mob, id: string) {
    const room = !ELITE[m.kind] && !BOSS[m.kind] ? ambushRoomAt(m.x, m.y) : undefined;
    if (!room) return;
    m.lurk = room; m.spot = "lurk"; m.spotX = m.outX = m.x; m.spotY = m.outY = m.y;
    this.hide(m, id, Date.now());
    m.hideUntil = Infinity;
  }
  /** A hero walked into an ambush room: everything lurking there rushes them at once. */
  private springAmbush(room: string, victim: string) {
    this.state.mobs.forEach((o, oid) => { if (o.lurk === room && o.hidden && !o.dead) { o.lurk = ""; this.popOut(o, oid, victim); } });
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

  /** First post of the camp (CAMPS index) for this kind that nobody alive holds (a POSTS index; -1 if all are taken). */
  private freePost(self: string, camp: number, kind: MobKind): number {
    const held = new Set<number>();
    this.state.mobs.forEach((o, oid) => { if (oid !== self && o.camp && !o.dead && o.post >= 0) held.add(o.post); });
    return POSTS.findIndex((p, i) => p.camp === camp && postKind(p) === kind && !held.has(i));
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
    const R = BLOB_AI.healer.range;
    for (const [oid, o] of this.state.mobs.inBox(m.x, m.y, R)) { // the grid gives what the old box test kept, same order
      if (o.dead || o.hidden || !BLOB_KINDS.includes(o.kind as MobKind) || Math.hypot(o.x - m.x, o.y - m.y) > R) continue;
      const f = o.hp / o.maxHp;
      if (f < worst) { worst = f; best = o; bestId = oid; }
    }
    if (!best) return;
    const amount = Math.max(1, Math.round(best.maxHp * BLOB_AI.healer.frac));
    best.hp = Math.min(best.maxHp, best.hp + amount);
    this.broadcast("blobheal", { from: id, to: bestId, amount });
  }

  // ---- Hiding in graves / trees ---------------------------------------------

  /** Pick the nearest free hiding spot and start walking to it. */
  private claimSpot(m: Mob, x: number, y: number, radius: number, now: number, fleeing: boolean) {
    if (m.merged > 1 || m.mergeInto) return; // a big merged blob doesn't fit in a tree
    if (now < m.spotRetry) return; // it looked a moment ago and found nothing free
    const s = findHideSpot(m.kind, x, y, radius, this.takenSpots(m));
    if (!s) { m.spotRetry = now + HIDE.retryMs; return; }
    this.takeSpot(m, s);
    m.seekUntil = now + HIDE.seekMs; m.fleeing = fleeing;
  }

  /**
   * Spots held by living monsters other than m. Built at most once per tick (a broken monster with no cover in reach
   * asks every tick) and kept up to date with new claims; a spot freed during the tick stays taken until the next one.
   */
  private takenSpots(m: Mob): Set<string> {
    if (m.spot) { // (callers have none) its own spot does not count: the old full scan, exactly
      const own = new Set<string>();
      this.state.mobs.forEach((o) => { if (o !== m && o.spot && !o.dead) own.add(o.spot); });
      return own;
    }
    if (this.takenTick !== this.tickNo) {
      this.takenTick = this.tickNo;
      this.taken.clear();
      this.state.mobs.forEach((o) => { if (o.spot && !o.dead) this.taken.add(o.spot); });
    }
    return this.taken;
  }
  private taken = new Set<string>();
  private takenTick = -1;
  private takeSpot(m: Mob, s: HideSpot) {
    m.spot = s.key; m.spotX = s.x; m.spotY = s.y; m.outX = s.outX; m.outY = s.outY;
    if (this.takenTick === this.tickNo) this.taken.add(s.key);
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
    if (m.ambusher && m.ambushAt && now >= m.ambushAt) {
      // its group has dropped on a hero: it follows
      const p = this.state.players.get(m.ambushHero);
      m.ambushAt = 0;
      if (p && !p.dead && !isSafeZone(p.x, p.y) && Math.hypot(p.x - m.x, p.y - m.y) < AMBUSH.callRange * 1.5) return this.leapOut(m, id, m.ambushHero, now);
    }
    let victim = "", best = m.ambusher ? AMBUSH.range : m.lurk ? LURK_RANGE : HIDE.ambushRange;
    this.state.players.forEach((p, pid) => {
      if (p.dead || isSafeZone(p.x, p.y)) return;
      if (m.ambusher && aggroLevelFactor(m.level, p.level) <= 0) return; // a hero far above them is left to pass (same as aggro)
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < best) { best = d; victim = pid; }
    });
    if (m.broken) return;
    if (m.ambusher) { if (victim) this.leapOut(m, id, victim, now); return; } // they wait up there as long as it takes
    if (m.lurk) { if (victim) this.springAmbush(m.lurk, victim); return; } // and these in the dark
    if (victim) this.popOut(m, id, victim);
    else if (now > m.hideUntil) this.popOut(m, id, "");
  }

  /** An ambusher picks a free tree near its post to climb (walks to it, hides on arrival). False if none is free. */
  private treeFor(m: Mob, now: number): boolean {
    if (now < m.spotRetry) return false; // it looked a moment ago and found no free tree
    const s = findHideSpot(m.kind, m.homeX, m.homeY, AMBUSH.treeRadius, this.takenSpots(m), CAMPS[POSTS[m.post]?.camp ?? 0].hide); // the Hollow's trees, the badlands' rocks
    if (!s) { m.spotRetry = now + HIDE.retryMs; return false; }
    this.takeSpot(m, s);
    m.seekUntil = now + AMBUSH.seekMs; m.fleeing = false;
    return true;
  }

  /** Drop out of the tree onto a hero: a jump that lands beside him (see the flight in updateMob); the group follows. */
  private leapOut(m: Mob, id: string, heroId: string, now: number) {
    const p = this.state.players.get(heroId)!;
    m.hidden = false; m.spot = ""; m.ambushAt = 0;
    const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy) || 1;
    // land between the tree and the hero, a step from him (or on either side, or by the tree if those are blocked)
    let lx = m.outX, ly = m.outY;
    for (const a of [0, 0.7, -0.7, 1.4, -1.4]) {
      const c = Math.cos(a), sn = Math.sin(a), ux = (dx * c - dy * sn) / d, uy = (dx * sn + dy * c) / d;
      const x = p.x + ux * AMBUSH.landGap, y = p.y + uy * AMBUSH.landGap;
      if (!isSolidAt(x - 5, y - 5) && !isSolidAt(x + 5, y + 5) && !isSolidAt(x - 5, y + 5) && !isSolidAt(x + 5, y - 5) && this.canStep(m, x, y)) { lx = x; ly = y; break; }
    }
    m.flyX0 = m.x; m.flyY0 = m.y; m.flyX = lx; m.flyY = ly; m.flyMs = AMBUSH.flightMs; m.flyUntil = now + AMBUSH.flightMs;
    m.target = heroId; m.foe = ""; m.nextAggro = now + AGGRO.everyMs * 2;
    this.addHate(m, heroId, 0);
    m.dir = Math.abs(lx - m.x) > Math.abs(ly - m.y) ? (lx > m.x ? "right" : "left") : (ly > m.y ? "down" : "up");
    this.broadcast("bambush", { id, x0: Math.round(m.x), y0: Math.round(m.y), x: Math.round(lx), y: Math.round(ly), ms: AMBUSH.flightMs, victim: heroId });
    // the rest of its group drops too, one after another
    let k = 0;
    for (const [, o] of this.state.mobs.inBox(m.x, m.y, AMBUSH.callRange)) { // the circle lies inside this box
      if (o === m || !o.ambusher || !o.hidden || o.dead || o.ambushAt || Math.hypot(o.x - m.x, o.y - m.y) > AMBUSH.callRange) continue;
      const [a, b] = AMBUSH.staggerMs;
      o.ambushAt = now + a + k++ * (b - a) / 2 + Math.random() * 120; o.ambushHero = heroId;
    }
  }

  /** The jump out of the tree: glides to the landing spot, then stabs everyone it lands next to. */
  private ambushFlight(m: Mob, id: string, now: number) {
    m.moving = false; m.winding = false; m.windUntil = 0;
    if (now < m.flyUntil) {
      const k = 1 - (m.flyUntil - now) / m.flyMs;
      m.x = m.flyX0 + (m.flyX - m.flyX0) * k; m.y = m.flyY0 + (m.flyY - m.flyY0) * k;
      return;
    }
    m.flyUntil = 0; m.x = m.flyX; m.y = m.flyY; m.lastAttack = now;
    const dmg = Math.round(mobDef(m, now).damage * mobScale(m.level, "damage") * AMBUSH.dmgMult);
    this.state.players.forEach((p, pid) => {
      if (p.dead) return;
      const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy);
      if (d > AMBUSH.radius) return;
      this.damagePlayer(pid, dmg, "Ambusher's Drop", d > 0.1 ? [dx / d, dy / d] : [0, 1], 0.6, { atkLevel: m.level, from: id, stunMs: AMBUSH.stunMs });
    });
  }

  private popOut(m: Mob, id: string, victim: string) {
    m.hidden = false; m.spot = "";
    m.x = m.outX; m.y = m.outY;
    m.target = victim;
    m.lastAttack = 0; // strike right away
    if (victim) this.broadcast("ambush", { id, x: m.x, y: m.y, victim });
    if (victim && m.kind === "sinkworm") this.hidekin.burst(m, id); // a Gullet Worm bursts out of its pit (server/hidekin.ts)
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
      const dmg = Math.round(MOBS.motherblob.damage * mobScale(m.level, "damage") * move.dmgMult * mobDmgK(m));
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
  private elemDmg(m: Mob, mult: number) { return Math.max(1, Math.round(MOBS[m.kind].damage * mobScale(m.level, "damage") * mult * mobDmgK(m))); }
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
    if (m.specialAt && (m.specialKind === "splurt" || m.specialKind === "nova" || m.specialKind === "breath" || m.specialKind === "firepot")) {
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
      } else if (kind === "firepot") {
        // a Firebrand's pot flies to where the hero stands NOW, bursts, and the ground burns a while (BADLANDS_AI.firepot)
        const tx = t ? t.x : m.castX, ty = t ? t.y : m.castY, F = BADLANDS_AI.firepot;
        this.broadcast("firepot", { id, x0: Math.round(m.x), y0: Math.round(m.y - 8), x: Math.round(tx), y: Math.round(ty), ms: F.flightMs, r: F.burn.radius, burnMs: F.burn.ms });
        const dmg = this.elemDmg(m, F.dmgMult), tick = this.elemDmg(m, F.burn.dmgMult), level = m.level;
        this.host.later(F.flightMs, () => {
          this.state.players.forEach((p, pid) => {
            if (p.dead || Math.hypot(p.x - tx, p.y - ty) > F.burn.radius) return;
            this.damagePlayer(pid, dmg, `${name}'s fire pot`, [0, 0], 0, { mobEl: "fire", atkLevel: level, from: id });
          });
          this.addHazard(m, id, tx, ty, F.burn.radius, F.burn.ms, F.burn.tickMs, tick, "fire", Date.now());
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
    } else if (moves.includes("firepot") && now >= m.nextSplurt && dist <= BADLANDS_AI.firepot.range && dist > 20) {
      const F = BADLANDS_AI.firepot;
      m.castX = t.x; m.castY = t.y;
      m.specialKind = "firepot"; m.specialAt = now + F.windupMs; m.nextSplurt = now + F.cooldownMs;
      this.broadcast("elemwind", { id, kind: "firepot", ms: F.windupMs, x: Math.round(t.x), y: Math.round(t.y), r: F.burn.radius });
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
    const now0 = Date.now(), alerted = now0 < m.alertUntil, blob = isBlob(m.kind);
    const hero = (p: Player, pid: string) => {
      if (p.dead || isSafeZone(p.x, p.y) || Math.hypot(p.x - m.homeX, p.y - m.homeY) >= def.leash || inVoid(p, now0)) return;
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      // a hero the horn (or a shout) called the camp against counts as hated
      const hated = (pid === m.hateId ? m.hate : 0) + (alerted && pid === m.alertHero ? 0.5 : 0);
      // a carried lantern draws the blobs from further (Player.lureMul); a hero going unseen is seen from less far (Player.aggroMul)
      const reach = def.aggroRange * p.aggroMul * (blob ? p.lureMul : 1);
      const range = hated > 0 ? reach * 2 : reach;
      if (d >= range) return;
      if (d < def.aggroRange) m.threat = Math.max(m.threat, p.level - m.level);
      const lf = m.merged > 1 || m.kind === "demon" ? Math.max(1, aggroLevelFactor(m.level, p.level)) : aggroLevelFactor(m.level, p.level); // a merged blob regrouped to fight, a demon was called against him: no hero scares them
      const score = Math.max(0, 1 - d / reach) * lf + hated + (pid === m.target ? AGGRO.stick : 0);
      if (score > best) { best = score; target = pid; }
    };
    // In the monster loop: the living heroes in state order (those dead at its start would leave on the first test),
    // and one at least twice their own aggro reach away in x or y (a carried lantern or an unseen step scales it, as
    // in hero above) is out of every range here (the tests above have no effects)
    const hs = this.loopHeroes;
    if (hs) {
      const reach2 = def.aggroRange * 2, mx = m.x, my = m.y, ids = this.loopIds;
      for (let i = 0; i < hs.length; i++) {
        const p = hs[i], reach = reach2 * p.aggroMul * (blob ? p.lureMul : 1);
        if (Math.abs(p.x - mx) >= reach || Math.abs(p.y - my) >= reach) continue;
        hero(p, ids[i]);
      }
    } else this.state.players.forEach(hero);
    const side = m.perch ? undefined : FACTION[m.kind]; // lookouts stay up on their tower
    const fr = m.camp && POSTS[m.post]?.route ? BANDIT_AI.patrolFeud : FEUD.range; // patrols go looking for trouble
    if (side && !m.mergeInto && !m.summonFor && Math.hypot(m.x - m.homeX, m.y - m.homeY) <= def.leash) {
      const cx = Math.floor(m.x / FEUD_CELL), cy = Math.floor(m.y / FEUD_CELL);
      for (let gy = cy - 1; gy <= cy + 1; gy++) for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (const [oid, o] of this.feudGrid.get(gx * 4096 + gy) ?? NO_FEUD) {
          if (FACTION[o.kind] === side || o.dead || o.hidden || o.mergeInto) continue;
          const d = Math.hypot(o.x - m.x, o.y - m.y);
          const hated = oid === m.hateId ? m.hate : 0;
          if (d >= (hated > 0 || oid === m.foe ? fr * 2 : fr)) continue;
          const score = AGGRO.rival * Math.max(0.05, 1 - d / fr) * aggroLevelFactor(m.level, o.level) + hated + (oid === m.foe ? AGGRO.stick : 0);
          if (score > best) { best = score; target = ""; foe = oid; }
        }
      }
    }
    // Heroes' summons are fair game for every monster (they are hit like a rival monster)
    // (forEach: same order as for...of, without an [id, summon] pair per summon per monster)
    if (!m.mergeInto && !m.summonFor && !m.perch) this.summons.forEach((o, sid) => {
      if (o.dead || Math.abs(o.x - m.x) > def.aggroRange || Math.abs(o.y - m.y) > def.aggroRange) return;
      const d = Math.hypot(o.x - m.x, o.y - m.y), hated = sid === m.hateId ? m.hate : 0;
      if (d >= (hated > 0 ? def.aggroRange * 2 : def.aggroRange) || Math.hypot(o.x - m.homeX, o.y - m.homeY) >= def.leash) return;
      const score = Math.max(0, 1 - d / def.aggroRange) + SUMMON.taunt + hated + (sid === m.foe ? AGGRO.stick : 0);
      if (score > best) { best = score; target = ""; foe = sid; }
    });
    // A Night Rider (or a clan trooper) that cut into it: the living fight back (the dead are never touched by them)
    const rider = m.hateId && m.hate > 0 && !m.perch && !m.mergeInto && !m.summonFor ? this.state.mobs.get(m.hateId) : undefined;
    if ((rider?.kind === "nightraider" || rider?.kind === "trooper") && !rider.dead && Math.hypot(rider.x - m.x, rider.y - m.y) < FEUD.range * 2 && Math.hypot(rider.x - m.homeX, rider.y - m.homeY) < def.leash) {
      const score = m.hate + (m.hateId === m.foe ? AGGRO.stick : 0);
      if (score > best) { best = score; target = ""; foe = m.hateId; }
    }
    m.target = target; m.foe = foe;
  }

  /** Blobs and undead by map cell, rebuilt every tick, so a monster only checks its neighbours for a foe. */
  private feudGrid = new Map<number, [string, Mob][]>();
  private buildFeudGrid() {
    this.feudGrid.clear();
    this.state.mobs.eachPass((o, oid) => { // (this tick's pass holds every monster that is not frozen: see markWarm)
      if (o.dead || o.summonFor || !FACTION[o.kind] || (o.dozy && this.cold(o.x, o.y))) return; // frozen ones fight no one
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
    this.broadcast("hit", { id: oid, dmg, crit: false, dot: false, ...byPart(hitBy(this.state.players, this.state.mobs, id)) }); // a hero's creature: its owner
    if (o.hp <= 0) { this.mobDied(o, oid, id, MOBS[m.kind].name); m.foe = ""; }
  }

  /** Void Slip: every monster after this hero loses them and turns on their nearest golem, if one is close. */
  private loseHero(id: string) {
    this.state.mobs.forEach((m) => { if (!m.dead && !m.owner && (m.target === id || m.hateId === id)) this.forgetHero(m, id); });
  }
  /** One monster stops fighting a hero and forgets its hate (loseHero; an unseen hero who was seen, server/questSteps.ts). */
  private forgetHero(m: Mob, id: string) {
    if (m.target === id) m.target = "";
    if (m.hateId === id) { m.hateId = ""; m.hate = 0; }
    m.windUntil = 0; m.winding = false;
    const g = this.guardOf(id, m) ?? this.bondOf(id, m)?.[0];
    if (g) { m.foe = g; this.addHate(m, g, 10); }
  }

  /**
   * Black Hole (shared/skillEngine.ts voidHop): a swallowed monster is spat out at a random walkable spot 2-4 tiles
   * from the hole, dazed a moment; a hero is thrown 3-4 tiles out of it, never into the safe zone.
   */
  private voidHop(owner: string, tid: string, swallowed: boolean, x: number, y: number): boolean {
    const p = this.state.players.get(tid), m = p ? undefined : this.state.mobs.get(tid);
    const u = p ?? m;
    if (!u || u.dead || (m && (m.owner || BOSS[m.kind] || !this.canHurtMob(owner, m)))) return false; // bosses are too big to swallow; own clan's troops are spared
    const [min, max] = p ? [3 * TILE, 4 * TILE] : [2 * TILE, 4 * TILE];
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, d = min + Math.random() * (max - min);
      const nx = x + Math.cos(a) * d, ny = y + Math.sin(a) * d;
      if (isSolidAt(nx, ny) || isSafeZone(nx, ny) || (m && noMobsAt(nx, ny))) continue;
      const fx = Math.round(u.x), fy = Math.round(u.y);
      u.x = nx; u.y = ny;
      if (m) { m.homeX = Math.abs(m.homeX - nx) < 400 ? m.homeX : nx; m.stunUntil = Math.max(m.stunUntil, Date.now() + 400); m.windUntil = 0; m.winding = false; }
      this.broadcast("sfx", { ev: "voidhop", id: owner, t: tid, swallowed, fx, fy, x: Math.round(nx), y: Math.round(ny) });
      return true;
    }
    return false;
  }

  /** Black Holes eat enemy projectiles: is (x, y) inside a hole of someone this shot's owner fights? */
  private holeEats(s: Projectile): boolean {
    let eat = false;
    this.state.fields.forEach((f) => {
      if (eat || !f.inst.def.hole || f.owner === s.owner || Math.hypot(s.x - f.x, s.y - f.y) > f.r) return;
      const om = this.state.mobs.get(s.owner);
      if (om) { eat = om.owner !== f.owner; return; } // a monster's shot (not the hole owner's own creatures)
      const op = this.state.players.get(s.owner), hp = this.state.players.get(f.owner);
      eat = !!op && !!hp && !(op.party && op.party === hp.party) && !pvpProtected(op.level, hp.level);
    });
    return eat;
  }

  // ---- Summons (shared/summons.ts) --------------------------------------------

  /** Black holes open this tick (only then do projectiles look for one). */
  private holes = 0;
  /** Living summons by id, so monsters and heroes find them without scanning every monster. */
  private summons = new Map<string, Mob>();
  private summonSeq = 0;

  /** May this hero hurt that summon? Never their own or their group's, never across newcomer protection, never in the safe zone. */
  private canHurtSummon(heroId: string, m: Mob): boolean {
    if (m.owner === heroId) return false;
    const a = this.state.players.get(heroId), o = this.state.players.get(m.owner);
    if (!a || !o) return !!a;
    if (a.party && a.party === o.party) return false;
    return !pvpProtected(a.level, o.level) && !isSafeZone(m.x, m.y);
  }

  /** May this hero hurt that monster? The one gate for every hero blow: summons (canHurtSummon) and clan troopers (WarTroops.canHurt). */
  private canHurtMob(heroId: string, m: Mob): boolean {
    return m.owner ? this.canHurtSummon(heroId, m) : m.kind !== "trooper" || (this.warTroops.canHurt(heroId, m) && this.towns.canHurt(heroId, m)); // (a town's gate guard: never from town ground, server/warTowns.ts)
  }

  /**
   * A hero calls up a summon next to them. A Summoner's permanent golem takes grimoire slot `slot` (the golem already in
   * it goes back); any other summon follows SUMMON.max (past it, their oldest goes back). Returns its id.
   */
  summon(ownerId: string, kind: SummonKind, level?: number, power = 1, fused = 0, slot = -1): string | undefined {
    const p = this.state.players.get(ownerId);
    if (!p || p.dead || !isSummonKind(kind)) return undefined;
    if (slot >= 0) {
      for (const [oid, o] of [...this.summons]) if (o.owner === ownerId && o.slot === slot) this.dismiss(oid, false);
    } else {
      const mine = [...this.summons].filter(([, m]) => m.owner === ownerId && m.slot < 0 && isSummonKind(m.kind)).sort((x, y) => x[1].summonAt - y[1].summonAt);
      while (mine.length >= SUMMON.max) { const [oid] = mine.shift()!; this.dismiss(oid); }
    }
    const m = new Mob(), now = Date.now();
    m.kind = kind; m.zone = -1; m.owner = ownerId; m.summonAt = now;
    m.level = capLevel(level ?? p.level);
    const fuse = 1 + SUMMON.colossusPerGolem * fused;
    // Life does not take the skill's power (rank, Magic): it made golems 3-4x tougher than monsters of their level
    m.hp = m.maxHp = Math.round(MOBS[kind].maxHp * mobScale(summonScaleLevel(m.level), "hp") * fuse * talentMult(p.cls, p.talents, "summonHp"));
    m.sPower = power * fuse * talentMult(p.cls, p.talents, "summonDmg");
    m.weapon = kind === "golem_colossus" ? attuneOf(p.attune) : "";
    m.slot = slot;
    m.fusedSlots = kind === "golem_colossus" ? fused : 0;
    // its powers: the golem's element; a Colossus has those of every golem in the grimoire, stronger
    const book = parseGrimoire(this.grimoireOf(p)).slice(0, golemSlots(p.level, rankOf(p.talents, "su_twin")));
    if (kind === "golem_colossus") m.mind = newMind(book, 1.25);
    else if (summonElement(kind, "") && kind.startsWith("golem_")) m.mind = newMind([summonElement(kind, "")]);
    // a free spot beside the hero (behind them if blocked)
    let x = p.x, y = p.y;
    for (const [dx, dy] of [[-18, 6], [18, 6], [0, 16], [0, -16], [0, 0]]) {
      if (!isSolidAt(p.x + dx, p.y + dy)) { x = p.x + dx; y = p.y + dy; break; }
    }
    m.x = m.homeX = x; m.y = m.homeY = y;
    // permanent golems never crumble; the Colossus lasts its time; other summons SUMMON.lifeMs
    m.banishAt = slot >= 0 ? Number.MAX_SAFE_INTEGER : now + (kind === "golem_colossus" ? this.colossusMs : SUMMON.lifeMs); m.stunUntil = now + 500; // rising out of the ground
    const id = `s${++this.summonSeq}`;
    this.state.mobs.set(id, m);
    this.summons.set(id, m);
    this.broadcast("summon", { id, owner: ownerId, kind, x: Math.round(x), y: Math.round(y) });
    return id;
  }

  private colossusMs = 30_000;
  /**
   * Summoner ultimate: the hero's golems fuse into one Colossus (alone if none is out) with every grimoire element's
   * aura and power. When its time is up it splits back into the golems; if it dies they climb back out as usual.
   */
  private summonColossus(ownerId: string, power: number, ms: number) {
    const p = this.state.players.get(ownerId);
    if (!p || isSafeZone(p.x, p.y)) return undefined;
    const fused = [...this.summons].filter(([, m]) => m.owner === ownerId && !m.dead && (m.slot >= 0 || m.kind === "golem_colossus"));
    for (const [id] of fused) this.dismiss(id, false);
    this.colossusMs = ms;
    p.golemAt = [0, 0];
    return this.summon(ownerId, "golem_colossus", undefined, power, Math.max(1, fused.length));
  }

  /** The Summoner's grimoire as "el,el" (Player.attune packs it). */
  private grimoireOf(p: Player): string {
    const a = Math.max(0, Math.floor(p.attune));
    return `${attuneOf(a % 4)},${attuneOf(Math.floor(a / 4) % 4)}`;
  }
  private setGrimoire(p: Player, book: string) {
    const [a, b] = parseGrimoire(book);
    p.attune = ATTUNE_ORDER.indexOf(a) + 4 * ATTUNE_ORDER.indexOf(b);
  }

  /**
   * The grimoire: a Summoner picks the element of golem `slot`. Saved with the hero. A golem out in that slot in another
   * element goes back and rises again in the new one (GOLEM.enterMs later, no Essence).
   */
  private chooseGrimoire(id: string, msg: { slot?: unknown; el?: unknown }) {
    const p = this.state.players.get(id), now = Date.now();
    const slot = Number(msg?.slot);
    if (!p || p.cls !== "summoner" || (slot !== 0 && slot !== 1) || !isElement(msg?.el) || now - p.grimoireAt < GOLEM.grimoireMs) return;
    p.grimoireAt = now;
    const book = parseGrimoire(this.grimoireOf(p));
    if (book[slot] === msg.el) return;
    book[slot] = msg.el;
    this.setGrimoire(p, book.join(","));
    for (const [gid, g] of [...this.summons]) if (g.owner === id && g.slot === slot && !g.dead) { this.dismiss(gid); p.golemAt[slot] = now + GOLEM.enterMs; }
    this.broadcast("sfx", { ev: "grimoire", id, slot, el: msg.el });
  }

  /** The elements of a Summoner's living golems (a Colossus counts for each of its powers): their auras. */
  private golemEls(id: string): AttuneElement[] {
    const out: AttuneElement[] = [];
    for (const g of this.summons.values()) if (g.owner === id && !g.dead && g.mind && (g.slot >= 0 || g.kind === "golem_colossus")) out.push(...g.mind.els);
    return out;
  }

  // ---- Wisps and the Void Arsenal (shared/voidConjure.ts) ----------------------------

  /**
   * The Summoner calls wisps of these elements for `ms` (su_wisps, Void Arsenal). Their wisps already out go back
   * first (no Essence: they were replaced), so there are never more than WISP.max. Not in the safe zone.
   */
  private spawnWisps(id: string, power: number, els: AttuneElement[], ms: number) {
    const p = this.state.players.get(id);
    if (!p || p.dead || isSafeZone(p.x, p.y)) return;
    for (const [sid, m] of [...this.summons]) if (m.owner === id && m.kind === "wisp") this.dismiss(sid);
    const now = Date.now(), def = MOBS.wisp, ids: string[] = [];
    els.slice(0, WISP.max).forEach((el, i, all) => {
      const a = (i / all.length) * Math.PI * 2;
      const w = new Mob();
      w.kind = "wisp"; w.weapon = el; w.zone = -1; w.owner = id; w.summonAt = now + i; w.level = p.level;
      w.hp = w.maxHp = Math.round(def.maxHp * mobScale(summonScaleLevel(p.level), "hp") * talentMult(p.cls, p.talents, "summonHp"));
      w.x = w.homeX = p.x + Math.cos(a) * WISP.float; w.y = w.homeY = p.y + Math.sin(a) * WISP.float * 0.6 - 6;
      w.banishAt = now + ms;
      w.wisp = newWisp(el, power, now, i);
      const sid = `w${++this.summonSeq}`;
      this.state.mobs.set(sid, w);
      this.summons.set(sid, w);
      ids.push(sid);
    });
    this.broadcast("sfx", { ev: "wisps", id, ids, x: Math.round(p.x), y: Math.round(p.y) });
  }

  /** A wisp's turn: it floats round its owner (no walls: it flies) and shoots the nearest of their foes in reach. */
  private updateWisp(m: Mob, o: Player, dt: number, now: number) {
    const w = m.wisp!;
    const toOwner = Math.hypot(o.x - m.x, o.y - m.y);
    if (toOwner > SUMMON.leash * 2.5) { m.x = o.x; m.y = o.y - 6; m.target = ""; }
    // each wisp has its own place on a slowly turning ring round the owner
    const a = (m.summonAt % 4) / 4 * Math.PI * 2 + now / 1600;
    const tx = o.x + Math.cos(a) * WISP.float, ty = o.y + Math.sin(a) * WISP.float * 0.6 - 6;
    const k = Math.min(1, dt * 5);
    m.moving = Math.hypot(tx - m.x, ty - m.y) > 2;
    m.x += (tx - m.x) * k; m.y += (ty - m.y) * k; m.homeX = m.x; m.homeY = m.y;
    m.slowed = now < m.slowUntil;
    if (now < m.stunUntil) return;
    if (now >= m.nextPick) { m.nextPick = now + 400; m.target = this.summonTarget(m, m.owner, o); }
    const t = m.target ? this.state.players.get(m.target) ?? this.state.mobs.get(m.target) : undefined;
    if (!t || t.dead) { m.target = ""; return; }
    m.dir = Math.abs(t.x - m.x) > Math.abs(t.y - m.y) ? (t.x > m.x ? "right" : "left") : (t.y > m.y ? "down" : "up");
    wispTick(this.host, m.owner, m, w, m.target);
  }

  /** The Void Arsenal (su_arsenal): its blade, lance and axe (shared/voidConjure.ts), and all four wisps for its time. */
  private voidArsenal(id: string, power: number, ms: number) {
    const p = this.state.players.get(id);
    if (!p || p.dead || isSafeZone(p.x, p.y)) return;
    openArsenal(this.host, id, power, ms);
    this.spawnWisps(id, power, ARSENAL.wisps, ms);
  }

  // ---- The Brides (v_brides) ----------------------------------------------------

  /** The vampire's Brides: `n` pale companions rise round him for `ms` (a new call sends the last ones away). */
  private callBrides(id: string, power: number, n: number, ms: number, drain: number) {
    const p = this.state.players.get(id);
    if (!p) return;
    for (const [sid, m] of [...this.summons]) if (m.owner === id && m.kind === "bride") this.dismiss(sid);
    const now = Date.now(), def = MOBS.bride, ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      let x = p.x + Math.cos(a) * 18, y = p.y + Math.sin(a) * 12;
      if (isSolidAt(x, y)) { x = p.x; y = p.y; }
      const b = new Mob();
      b.kind = "bride"; b.zone = -1; b.owner = id; b.summonAt = now + i; b.level = p.level; b.drink = drain;
      b.hp = b.maxHp = Math.round(def.maxHp * mobScale(summonScaleLevel(p.level), "hp"));
      b.sPower = power;
      b.x = b.homeX = x; b.y = b.homeY = y;
      b.banishAt = now + ms; b.stunUntil = now + 450; // rising out of the dark
      const sid = `t${++this.summonSeq}`;
      this.state.mobs.set(sid, b);
      this.summons.set(sid, b);
      ids.push(sid);
    }
    this.broadcast("sfx", { ev: "brides", id, ids, x: Math.round(p.x), y: Math.round(p.y) });
  }

  // ---- Devour and Bite (shared/devour.ts) ---------------------------------------

  /** Can the vampire eat / turn this monster? Not heroes, summons and thralls, elites and bosses, quest monsters, the fleshless. */
  private fangable(tid: string): Mob | undefined {
    const m = this.state.mobs.get(tid);
    if (!m || m.dead || m.owner || m.summonFor || m.servant || m.kind === "trooper" || ELITE[m.kind] || BOSS[m.kind] || !familyOf(m.kind)) return undefined;
    return m;
  }

  /** Can a vampire Charm this monster? Not heroes, summons and thralls, elites and bosses, quest monsters or the Hollow King's servants. */
  private charmable(tid: string): Mob | undefined {
    const m = this.state.mobs.get(tid);
    if (!m || m.dead || m.owner || m.summonFor || m.servant || m.hidden || m.kind === "trooper" || ELITE[m.kind] || BOSS[m.kind]) return undefined;
    return m;
  }

  /** Charm: the monster fights for the vampire as a summon until charmUntil, then it is a plain monster of its zone again. */
  private charm(id: string, tid: string, ms: number): boolean {
    const m = this.charmable(tid), now = Date.now();
    if (!m || !this.state.players.get(id)) return false;
    m.owner = id; m.charmUntil = now + ms; m.banishAt = m.charmUntil; m.sPower = 1;
    m.target = ""; m.foe = ""; m.hateId = ""; m.hate = 0; m.windUntil = 0; m.winding = false; m.broken = false;
    this.summons.set(tid, m);
    return true;
  }

  /** The charm wears off (or its vampire left or died): the monster is itself again and turns on whoever is closest. */
  private uncharm(id: string, m: Mob) {
    this.summons.delete(id);
    m.owner = ""; m.charmUntil = 0; m.banishAt = 0; m.target = ""; m.foe = ""; m.windUntil = 0; m.winding = false;
    this.broadcast("sfx", { ev: "uncharm", t: id, x: Math.round(m.x), y: Math.round(m.y) });
  }

  /** The blow that finishes a weak monster for Devour / Bite: an ordinary kill (XP, loot, quests), shown with the skill's damage. */
  private fangKill(id: string, tid: string, m: Mob, dmg: number): boolean {
    const p = this.state.players.get(id);
    if (!p) return false;
    m.hp = 1;
    const d = Math.hypot(m.x - p.x, m.y - p.y) || 1;
    this.hitTarget(id, tid, dmg, [(m.x - p.x) / d, (m.y - p.y) / d], { skill: true, kb: 0 });
    return m.dead;
  }

  /** Devour: the weak monster is eaten whole. The vampire heals and keeps one more meal of its family (FEAST). */
  private devour(id: string, tid: string, dmg: number, heal: number): boolean {
    const p = this.state.players.get(id), m = this.fangable(tid);
    const fam = m && familyOf(m.kind);
    if (!p || !m || !fam) return false;
    const x = Math.round(m.x), y = Math.round(m.y);
    if (!this.fangKill(id, tid, m, dmg)) return false;
    p.feast = { ...p.feast, [fam]: (p.feast[fam] ?? 0) + 1 };
    p.feast = cleanFeast(p.feast); // capped at FEAST_MAX
    this.host.heal(id, p.maxHp * heal / 100);
    this.applyStats(p); // blobs give life
    this.broadcast("sfx", { ev: "devour", id, t: tid, x, y, fam });
    this.sendFeast(id, p, fam);
    return true;
  }

  /** Tells a hero what they have eaten so far (their character sheet shows it). `fam`: the family just eaten. */
  private sendFeast(id: string, p: Player, fam?: string) {
    this.clients.find((c) => c.sessionId === id)?.send("feast", { feast: p.feast, fam });
  }

  /** Bite: the weak monster falls and rises as the vampire's thrall, as the monster it was. Past the cap the oldest goes. */
  private makeThrall(id: string, tid: string, dmg: number, power: number, rank: number): boolean {
    const p = this.state.players.get(id), m = this.fangable(tid);
    if (!p || !m) return false;
    const kind = m.kind, level = m.level, weapon = m.weapon, x = m.x, y = m.y;
    if (!this.fangKill(id, tid, m, dmg)) return false;
    const mine = [...this.summons].filter(([, t]) => t.owner === id && t.thrall).sort((a, b) => a[1].summonAt - b[1].summonAt);
    while (mine.length >= thrallMax(rank)) { const [oid] = mine.shift()!; this.dismiss(oid); }
    const t = new Mob(), now = Date.now();
    t.kind = kind; t.zone = -1; t.owner = id; t.thrall = true; t.summonAt = now; t.weapon = weapon;
    t.level = capLevel(Math.min(level, p.level));
    t.hp = t.maxHp = Math.round(MOBS[kind].maxHp * mobScale(t.level, "hp"));
    t.sPower = THRALL.dmg * power;
    t.x = t.homeX = x; t.y = t.homeY = y;
    t.banishAt = now + THRALL.lifeMs; t.stunUntil = now + 700; // getting back up
    const sid = `t${++this.summonSeq}`;
    this.state.mobs.set(sid, t);
    this.summons.set(sid, t);
    this.broadcast("sfx", { ev: "thrall", id, t: sid, x: Math.round(x), y: Math.round(y) });
    return true;
  }

  /** Sends a summon back (its time is up, its owner left or died, or it was replaced). */
  private dismiss(id: string, show = true) {
    const m = this.summons.get(id);
    if (m?.charmUntil && !m.dead) return this.uncharm(id, m); // a charmed monster isn't sent away, it wakes up
    this.summons.delete(id);
    if (!m || m.dead) return;
    // The Colossus's time is up: it splits back into the golems (the owner is still out of town)
    if (m.kind === "golem_colossus" && Date.now() >= m.banishAt) this.splitColossus(m);
    m.dead = true; m.hp = 0;
    if (show) this.broadcast("banish", { id, x: Math.round(m.x), y: Math.round(m.y) });
    this.clock.setTimeout(() => this.state.mobs.delete(id), 500);
  }

  /** The hero's living summon closest to them, within SUMMON.bondRange (Stone Bond takes part of their blows). */
  private bondOf(heroId: string, p: { x: number; y: number }): [string, Mob] | undefined {
    let best: [string, Mob] | undefined, bd: number = SUMMON.bondRange;
    for (const [sid, g] of this.summons) {
      if (g.owner !== heroId || g.dead || g.wisp) continue; // wisps are too frail to take blows for their owner
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      if (d < bd) { bd = d; best = [sid, g]; }
    }
    return best;
  }

  /** The owner's living summon closest to monster m, within SUMMON.guardRange (the one that takes its anger). */
  private guardOf(ownerId: string, m: Mob): string | undefined {
    let best: string | undefined, bd = SUMMON.guardRange;
    for (const [sid, g] of this.summons) {
      if (g.owner !== ownerId || g.dead || g.wisp) continue; // monsters turn on the golems, not on the wisps
      const d = Math.hypot(g.x - m.x, g.y - m.y);
      if (d < bd) { bd = d; best = sid; }
    }
    return best;
  }

  /**
   * Permanent golems (Void Lord rework): out of the safe zone, each grimoire slot of a Summoner (one, two with Twin
   * Bond from Lv 18) holds a golem. An empty slot rises GOLEM.enterMs after the hero leaves the safe zone, or
   * GOLEM.respawnMs after its golem died. In the safe zone the golems go back. Nothing rises while a Colossus is out.
   */
  private autoAt = 0;
  private autoGolems(now: number) {
    this.state.players.forEach((p, pid) => {
      if (p.cls !== "summoner") return;
      const mine = [...this.summons].filter(([, g]) => g.owner === pid && !g.dead && (g.slot >= 0 || g.kind === "golem_colossus"));
      if (p.dead || isSafeZone(p.x, p.y)) {
        for (const [gid] of mine) this.dismiss(gid, !p.dead);
        p.golemAt = [0, 0];
        return;
      }
      if (mine.some(([, g]) => g.kind === "golem_colossus")) return;
      const slots = golemSlots(p.level, rankOf(p.talents, "su_twin")), book = parseGrimoire(this.grimoireOf(p));
      for (const [gid, g] of mine) if (g.slot >= slots) this.dismiss(gid);
      for (let i = 0; i < slots; i++) {
        if (mine.some(([, g]) => g.slot === i)) { p.golemAt[i] = 0; continue; }
        if (!p.golemAt[i]) { p.golemAt[i] = now + GOLEM.enterMs; continue; }
        if (now < p.golemAt[i]) continue;
        p.golemAt[i] = 0;
        this.summon(pid, GOLEM_OF[book[i]], undefined, this.golemPower(p), 0, i);
      }
    });
  }

  /**
   * The grimoire HUD (client/src/grimoire.ts): each Summoner is told, only when it changes, the element of each golem
   * slot and what it is doing: "up" (out and fighting), "wait" (back in `ms`), "town" (resting, safe zone or dead),
   * "colossus" (fused), or why slot 2 is shut ("lv" before GOLEM.twinLevel, "twin" without Twin Bond).
   * Sent as a message to that Summoner only, and only when it changes; it could become a field in Player.me (CLAUDE.md
   * "Owner-only player data").
   */
  private golemNews(now: number) {
    this.state.players.forEach((p, pid) => {
      if (p.cls !== "summoner") return;
      const book = parseGrimoire(this.grimoireOf(p)), slots = golemSlots(p.level, rankOf(p.talents, "su_twin"));
      const mine = [...this.summons.values()].filter((g) => g.owner === pid && !g.dead && (g.slot >= 0 || g.kind === "golem_colossus"));
      const town = p.dead || isSafeZone(p.x, p.y), col = mine.some((g) => g.kind === "golem_colossus");
      const st = [0, 1].map((i) => {
        if (i >= slots) return { st: p.level < GOLEM.twinLevel ? "lv" : "twin" };
        if (town) return { st: "town" };
        if (col) return { st: "colossus" };
        if (mine.some((g) => g.slot === i)) return { st: "up" };
        return p.golemAt[i] > now ? { st: "wait", until: p.golemAt[i] } : { st: "wait", until: now + GOLEM.enterMs };
      });
      const sig = book.join() + "|" + st.map((s) => s.st + ("until" in s ? Math.round(s.until! / 250) : "")).join();
      if (sig === p.golemSig) return;
      p.golemSig = sig;
      this.clients.find((c) => c.sessionId === pid)?.send("golems", { book, slots: st.map((s) => ("until" in s ? { st: s.st, ms: Math.max(0, Math.round(s.until! - now)) } : s)) });
    });
  }

  /** Elemental Golem (su_golem): the hero's golems come back out of the Void at once, whole (a Colossus is mended). */
  private recallGolems(id: string, power: number) {
    const p = this.state.players.get(id);
    if (!p || p.dead || isSafeZone(p.x, p.y)) return;
    const col = [...this.summons.values()].find((g) => g.owner === id && !g.dead && g.kind === "golem_colossus");
    if (col) { col.hp = col.maxHp; return; }
    const book = parseGrimoire(this.grimoireOf(p));
    for (let i = 0; i < golemSlots(p.level, rankOf(p.talents, "su_twin")); i++) { p.golemAt[i] = 0; this.summon(id, GOLEM_OF[book[i]], undefined, power, 0, i); }
  }

  /** The Colossus's time is up: it splits back into the hero's golems where it stood. */
  private splitColossus(c: Mob) {
    const p = this.state.players.get(c.owner);
    if (!p || p.dead || isSafeZone(p.x, p.y)) return;
    const book = parseGrimoire(this.grimoireOf(p));
    for (let i = 0; i < golemSlots(p.level, rankOf(p.talents, "su_twin")); i++) {
      const gid = this.summon(c.owner, GOLEM_OF[book[i]], undefined, this.golemPower(p), 0, i);
      const g = gid && this.state.mobs.get(gid);
      if (g && !isSolidAt(c.x + (i ? 12 : -12), c.y)) { g.x = g.homeX = c.x + (i ? 12 : -12); g.y = g.homeY = c.y; }
    }
    this.broadcast("sfx", { ev: "colossussplit", id: c.owner, x: Math.round(c.x), y: Math.round(c.y) });
  }

  /** A Summoner's golem or Colossus died: its elements burst out, a charge of Essence, its slot rises again later. */
  private golemFell(m: Mob) {
    const p = this.state.players.get(m.owner);
    if (!p || !m.mind) return;
    golemDeath(this.host, m.owner, m.mind.els, m.x, m.y, this.golemPower(p) * m.mind.boost);
    toVoid(this.host, m.owner);
    const now = Date.now();
    if (m.slot >= 0) p.golemAt[m.slot] = now + GOLEM.respawnMs;
    if (m.kind === "golem_colossus") p.golemAt = [now + GOLEM.respawnMs, now + GOLEM.respawnMs];
  }

  /** What the Elemental Golem skill would give this hero (castSkill's power: rank, skill level, Magic). */
  private golemPower(p: Player) {
    const s = skillById("su_golem");
    if (!s) return 1;
    return rankPower(Math.max(1, Math.min(maxRank(s), rankOf(p.talents, s.id)))) * levelPower(s) * scalePower(s, this.stats(p), STATS[p.cls].base);
  }

  /** Every summon of this hero goes back (they left, or died). */
  private dismissAll(ownerId: string) {
    for (const [id, m] of [...this.summons]) if (m.owner === ownerId) this.dismiss(id);
  }

  /** The enemy a summon fights: the nearest foe of its owner around it, first whoever is attacking the owner. */
  private summonTarget(m: Mob, ownerId: string, o: Player): string {
    let best = "", bs = 0;
    const R = SUMMON.aggroRange;
    const whim = () => (m.drink ? Math.random() * 0.6 : 0); // a frantic Bride flits from foe to foe
    const near = (x: number, y: number) => Math.hypot(x - m.x, y - m.y) < R && Math.hypot(x - o.x, y - o.y) < SUMMON.leash;
    for (const [tid, t] of this.state.mobs.inBox(m.x, m.y, R)) {
      if (t === m || t.dead || t.hidden) continue;
      if (t.owner || t.kind === "trooper" ? !this.canHurtMob(ownerId, t) : isSafeZone(t.x, t.y)) continue;
      if (!near(t.x, t.y)) continue;
      const score = 1 - Math.hypot(t.x - m.x, t.y - m.y) / R + (t.target === ownerId || t.foe === ownerId ? 1 : 0) + (tid === m.target ? AGGRO.stick : 0) + whim();
      if (score > bs) { bs = score; best = tid; }
    }
    this.state.players.forEach((t, tid) => {
      if (tid === ownerId || t.dead || isSafeZone(t.x, t.y) || (o.party && t.party === o.party) || pvpProtected(o.level, t.level)) return;
      if (!near(t.x, t.y)) return;
      const score = 1 - Math.hypot(t.x - m.x, t.y - m.y) / R + (tid === m.target ? AGGRO.stick : 0) + whim();
      if (score > bs) { bs = score; best = tid; }
    });
    return best;
  }

  /** A summon's turn: follow the owner, fight their enemies, crumble when its time is up. */
  private updateSummon(m: Mob, id: string, dt: number, now: number) {
    const o = this.state.players.get(m.owner);
    if (o && !o.dead && m.wisp && now >= m.banishAt) { wispEnd(this.host, m.owner, m.wisp, m.x, m.y); return this.dismiss(id); } // its time is up: back to the Void
    if (!o || o.dead || now >= m.banishAt) return this.dismiss(id);
    if (m.wisp) return this.updateWisp(m, o, dt, now);
    m.stunned = now < m.stunUntil;
    m.slowed = now < m.slowUntil;
    if (m.stunned || m.broken) { m.winding = false; m.windUntil = 0; }
    if (m.stunned) { m.moving = false; return; }
    const def = mobDef(m, now);
    // Vital Link (su_link): close to its owner, a golem mends a little every second
    const link = talentBonus(o.cls, o.talents, "golemRegen") / 100;
    if (link && m.hp < m.maxHp && Math.hypot(o.x - m.x, o.y - m.y) < SUMMON.followRange * 2) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * link * dt);
    if (now >= m.nextPick) { m.nextPick = now + 400; m.target = this.summonTarget(m, m.owner, o); }
    const tp = m.target ? this.state.players.get(m.target) : undefined;
    const tm = !tp && m.target ? this.state.mobs.get(m.target) : undefined;
    const t = tp ?? tm;
    if (t && ((tp && (tp.dead || isSafeZone(tp.x, tp.y))) || (tm && (tm.dead || tm.hidden)))) m.target = "";
    // A golem's own powers (shared/golemAI.ts): flames, venom pools, chain lightning, on their own timers
    if (m.mind && m.target && !m.broken) golemTick(this.host, m.owner, m, m.mind, m.target, this.summonBlow(m, def), this.golemPower(o));
    let input: InputState = STILL;
    const toOwner = Math.hypot(o.x - m.x, o.y - m.y);
    if (toOwner > SUMMON.leash * 2.5) {
      // left far behind (the owner went through a portal, or into the village): it comes back beside them
      if (!isSolidAt(o.x, o.y + 12) && !isSafeZone(o.x, o.y + 12)) { m.x = o.x; m.y = o.y + 12; m.target = ""; }
    } else if (m.target && t && !m.broken) {
      const dist = Math.hypot(t.x - m.x, t.y - m.y), melee = meleeOf(m), reach = melee.range + (tm ? mobBody(tm.kind) : 4);
      if (dist <= reach || m.windUntil) {
        m.dir = Math.abs(t.x - m.x) > Math.abs(t.y - m.y) ? (t.x > m.x ? "right" : "left") : (t.y > m.y ? "down" : "up");
        if (m.windUntil) {
          if (now >= m.windUntil) {
            m.windUntil = 0; m.winding = false; m.lastAttack = now;
            if (dist <= reach + 6) this.summonStrike(m, id, m.target, t, def);
          }
        } else if (now - m.lastAttack >= def.attackCooldownMs) { m.windUntil = now + MOB_COMBAT[m.kind].windupMs; m.winding = true; }
      } else input = toward(m.x, m.y, t.x, t.y);
    } else if (toOwner > SUMMON.followRange) input = toward(m.x, m.y, o.x, o.y);
    // A Bride rushes at her prey even faster than she walks
    const rush = m.drink && m.target && t ? 1.35 : 1;
    const r = moveStep(m.x, m.y, input, dt, def.speed * rush * (m.slowed ? SLOW_MOB : 1));
    if (this.canStep(m, r.x, r.y)) { m.x = r.x; m.y = r.y; m.homeX = m.x; m.homeY = m.y; }
    m.moving = r.moving && input !== STILL;
    if (input !== STILL) m.dir = dirFromInput(input, m.dir);
  }

  /** A summon's blow: dealt in its owner's name (they get the kill), part of it in the golem's element; a monster turns on the golem. */
  /** The damage of one of a summon's blows (before the owner's own bonuses, which hitTarget adds). */
  private summonBlow(m: Mob, def: MobDef) { return def.damage * mobScale(summonScaleLevel(m.level), "damage") * m.sPower; }

  private summonStrike(m: Mob, id: string, tid: string, t: { x: number; y: number }, def: MobDef) {
    const dmg = this.summonBlow(m, def);
    const extra = m.mind ? golemStrike(m.mind) : {}; // the frost golem freezes with every third blow
    const el = summonElement(m.kind, m.weapon), share = m.thrall || m.drink || m.charmUntil ? 0 : SUMMON.elementShare; // a thrall, bride or charmed monster hits as what it is
    this.broadcast("swing", { id });
    // The Colossus slams the ground: everyone of the owner's foes close to its target is hit
    const targets = m.kind === "golem_colossus" ? this.summonFoesAround(m, t.x, t.y, SUMMON.colossusSlam) : [tid];
    if (m.kind === "golem_colossus") this.broadcast("bhit", { kind: "slam", x: Math.round(t.x), y: Math.round(t.y) });
    for (const fid of targets) {
      const f = this.state.players.get(fid) ?? this.state.mobs.get(fid);
      if (!f) continue;
      const d = Math.hypot(f.x - m.x, f.y - m.y) || 1, push: [number, number] = [(f.x - m.x) / d, (f.y - m.y) / d];
      this.hitTarget(m.owner, fid, dmg * (1 - share), push, { kb: m.drink ? 0.2 : 0.6, parts: share ? [{ el, amt: dmg * share }] : undefined, pet: true, ...extra });
      // A Bride drinks: part of the blood comes back to the vampire (red drops fly to him)
      if (m.drink) { this.host.heal(m.owner, dmg * m.drink / 100); this.broadcast("sfx", { ev: "drain", id: m.owner, t: fid }); }
      const victim = this.state.mobs.get(fid);
      if (victim && !victim.dead && !victim.owner) { this.addHate(victim, id, dmg); victim.foe = id; victim.target = ""; } // the golem tanks
    }
    // Brides are frantic: after a slash they often throw themselves at another foe close by
    if (m.drink && Math.random() < 0.45) { m.target = ""; m.nextPick = 0; }
  }

  /** The summon owner's foes within r of (x, y): the same rules as summonTarget. */
  private summonFoesAround(m: Mob, x: number, y: number, r: number): string[] {
    const o = this.state.players.get(m.owner), out: string[] = [];
    if (!o) return out;
    for (const [tid, t] of this.state.mobs.inBox(x, y, r)) {
      if (t === m || t.dead || t.hidden || Math.hypot(t.x - x, t.y - y) > r) continue;
      if (t.owner || t.kind === "trooper" ? this.canHurtMob(m.owner, t) : !isSafeZone(t.x, t.y)) out.push(tid);
    }
    this.state.players.forEach((t, tid) => {
      if (tid === m.owner || t.dead || isSafeZone(t.x, t.y) || (o.party && t.party === o.party) || pvpProtected(o.level, t.level)) return;
      if (Math.hypot(t.x - x, t.y - y) <= r) out.push(tid);
    });
    return out;
  }

  // ---- Blob merging -----------------------------------------------------------

  /** Blobs that can call for help and fuse (Mother Blobs too, Murat 2026-11-03). */
  private static canMerge(m: Mob) { return BLOB_KINDS.includes(m.kind) && !m.servant && !m.champion && !m.tide; } // a champion stays itself // the Hollow King's servants stay his

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
    for (const [oid, o] of this.state.mobs.inBox(m.x, m.y, MERGE.callRange)) { // map order, so the sort breaks ties as before
      if (o === m || o.dead || o.hidden || o.mergeInto || !TownRoom.canMerge(o)) continue;
      if (o.level < MERGE.minLevel && !lowOk) continue;
      const d = Math.hypot(o.x - m.x, o.y - m.y);
      if (d <= MERGE.callRange) near.push([d, oid, o]);
    }
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
    if (now >= m.nextRaise && this.kidsOf(id) < N.raise.max) { // counted only when a raise is due
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

  /** Living monsters whose mother is `id` (a necromancer's raised dead, the Hollow King's servants). */
  private kidsOf(id: string): number {
    let n = 0;
    this.state.mobs.forEach((c) => { if (c.mother === id && !c.dead) n++; });
    return n;
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
    // This tick's pass (markWarm): every monster with a target, or with a side still to clear, is in its busy set
    this.state.mobs.eachPass((m, id) => {
      // target first: a plain field (the rest are schema getters) and empty for nearly every monster; write only a change
      if (!m.target || m.dead || m.hidden || (m.kind !== "skeleton" && m.kind !== "crawler") || m.weapon === "bow") { if (!Number.isNaN(m.flankA)) m.flankA = NaN; return; }
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
        for (const [id, m] of this.feudGrid.get(gx * 4096 + gy) ?? NO_FEUD) {
          if (m.dead || m.hidden || m.ritual || m.servant || m.champion || !TownRoom.RITUAL_KINDS.includes(m.kind) || Math.hypot(m.x - p.x, m.y - p.y) > R.near) continue;
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
      for (const [id, o] of this.feudGrid.get(gx * 4096 + gy) ?? NO_FEUD) {
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
  /** 1 = a hero is within reach of this WARM_CELL square (see WARM_CELL). */
  private warm = new Uint8Array(WARM_COLS * WARM_ROWS);

  /**
   * Marks the warm squares and opens this tick's pass over the monsters (MobGrid.beginPass): the busy ones plus
   * everyone in a warm square, which is every monster that is not frozen. Only those are visited.
   */
  private markWarm(heroes: Player[]) {
    const w = this.warm, mobs = this.state.mobs, k = WARM_CELL / MOB_CELL;
    w.fill(0);
    mobs.beginPass();
    const r = SLEEP_RANGE + WARM_PAD;
    for (const p of heroes) {
      const x0 = Math.max(0, Math.floor((p.x - r) / WARM_CELL)), x1 = Math.min(WARM_COLS - 1, Math.floor((p.x + r) / WARM_CELL));
      const y0 = Math.max(0, Math.floor((p.y - r) / WARM_CELL)), y1 = Math.min(WARM_ROWS - 1, Math.floor((p.y + r) / WARM_CELL));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * WARM_COLS + x;
        if (w[i]) continue;
        w[i] = 1;
        mobs.passCells(x * k, y * k, x * k + k - 1, y * k + k - 1);
      }
    }
    mobs.sortPass();
  }

  /** The old first line of the monster loop: dozing, no target, no hero anywhere near. Nothing to do this tick. */
  private frozen(m: Mob): boolean { return m.dozy && !m.target && this.cold(m.x, m.y); }

  /** True when no living hero is anywhere near: a dozing monster here is frozen (see WARM_CELL). */
  private cold(x: number, y: number): boolean {
    const cx = Math.floor(x / WARM_CELL), cy = Math.floor(y / WARM_CELL);
    if (cx < 0 || cy < 0 || cx >= WARM_COLS || cy >= WARM_ROWS) return true;
    return this.warm[cy * WARM_COLS + cx] === 0;
  }

  /**
   * True when updateMob would do nothing but let the monster doze: no hero within SLEEP_RANGE, no target or rival,
   * not burning, stunned, walking to a rite, being banished or merging. Mirrors the early returns of updateMob.
   */
  private dozing(m: Mob, heroes: Player[], now: number): boolean {
    if (m.kind === "nightraider" || m.kind === "trooper" || m.tide) return false; // a rider never sleeps (nor a clan trooper: its land sleeps instead) (there are at most two), nor a Gloam Tide marcher (at most TIDE.maxAlive)
    if (m.dead || m.target || m.foe || m.banishAt || m.ritual || m.mergeInto || m.spot || m.specialAt || m.windUntil) return false;
    if (now < m.stunUntil || now < m.sk.burnUntil || m.broken || m.moving) return false;
    return !this.heroNear(m, heroes);
  }

  private heroNear(m: Mob, heroes: Player[]): boolean {
    const x = m.x, y = m.y;
    for (const p of heroes) if (Math.abs(p.x - x) < SLEEP_RANGE && Math.abs(p.y - y) < SLEEP_RANGE) { this.nearHero = p; return true; }
    return false;
  }
  /** The hero heroNear last found near the monster being ticked: updateMob tries it first for its own "anyone near?". */
  private nearHero: Player | undefined;
  /** During the monster loop: the heroes alive when it began, in state order, and their ids (see heroesNear). */
  private loopHeroes: Player[] | undefined;
  private loopIds: string[] = [];

  /**
   * playerNear, inside the monster loop. A hero can die during the loop but not come back (respawns run on the clock,
   * before the tick) and nobody joins or leaves in it, so the living heroes are exactly those of loopHeroes not dead.
   */
  private heroesNear(x: number, y: number, r: number): boolean {
    const hs = this.loopHeroes;
    if (!hs) return this.playerNear(x, y, r);
    for (const p of hs) if (!p.dead && Math.abs(p.x - x) < r && Math.abs(p.y - y) < r) return true;
    return false;
  }

  private update(dtMs: number) {
    let dt = dtMs / 1000;
    const now = Date.now();
    routeFrame(); // a fresh budget of route fields round the Hold walls (shared/war/holdRoutes.ts)
    this.tradeTick();
    if (now >= this.autoAt) { this.autoAt = now + 500; this.autoGolems(now); this.golemNews(now); }
    const chorus = chorusTimers(this.state.fields, now); // each Songweaver's own Chorus, for her HUD buff row
    this.state.players.forEach((p, pid) => {
      tickUnit(this.host, pid);
      p.stunned = now < p.stunUntil;
      p.slowed = now < p.slowUntil;
      p.guarding = blocking(p, now);
      p.stacks = usesGauge(p.cls) ? 0 : p.sk.stacks; // the Songweaver has no Tempo: her song gauge is in mana
      const fx = statusOf(p, now);
      if (p.fx !== fx) p.fx = fx;
      this.chords.tick(pid, p as unknown as Unit, now, (m) => this.clients.find((c) => c.sessionId === pid)?.send("chord", m));
      const timers = timersOf(p, now, chorus.get(pid)), sig = timerSig(timers);
      if (sig !== p.timerSig) { p.timerSig = sig; p.timers = encodeTimers(++p.timerSeq, timers, now); }
      const spd = Math.round(speedMult(p, now) * talentMult(p.cls, p.talents, "speed") * feastMult(p.feast, "speed") * 1000) / 1000;
      if (p.spd !== spd) p.spd = spd;
      tickPoise(p, heroPoiseMax(p), dt, now);
      const sh = p.dead ? 0 : shieldLeft(p, now); if (p.me.shield !== sh) p.me.shield = sh; // owner's orb (shared/shields.ts)
      if (p.dead) { p.moving = false; p.energy = 0; p.mana = usesGauge(p.cls) ? 0 : p.maxMana; this.syncMana(p); return; }
      for (let c = 0; c < CHAINS.length; c++) this.checkQuestPlace(pid, p, c);
      this.wakePortals(pid, p);
      this.useLinks(pid, p);
      if (p.energy !== 0) coolHeat(p, p.cls, dt);
      if (p.mana < p.maxMana && !usesGauge(p.cls)) { // a song gauge never regenerates
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
    this.qsteps.tick(now, dtMs); // carried lanterns, hold runs (server/questSteps.ts)
    this.tide.tick(now); // the Gloam Tide's march (server/tide.ts)
    this.rumours.tick(now); // rumours: reach steps, ambushers, walking up to Mags (server/rumours.ts)
    this.apprentice.tick(now); // mentoring state for heroes who just joined (server/apprentice.ts)
    this.state.items.forEach((it, id) => { if (now > it.expires) this.state.items.delete(id); });
    const tick = ++this.tickNo;
    // Live heroes, gathered once so each monster's "anyone near?" check is a plain array scan
    const awake: Player[] = [], awakeIds = this.loopIds;
    awakeIds.length = 0;
    this.state.players.forEach((p, pid) => { if (!p.dead) { awake.push(p); awakeIds.push(pid); } });
    this.markWarm(awake);
    if (tick % 2 === 0) this.buildFeudGrid(); // monsters move a few px per tick, a grid cell is 128 px
    this.assignFlanks();
    this.updateUndeadNight(now);
    this.updateRaids(now);
    if (tick % 10 === 0) this.bossVoices(now);
    this.checkRituals(now);
    const mobs = this.state.mobs;
    this.loopHeroes = awake;
    try {
      mobs.runPass((m, id) => { // (the monsters that may not be frozen, in map order: see markWarm)
        // Frozen: dozing where no hero is anywhere near. Nothing to do; it wakes when a hero's warm squares reach it.
        // It leaves the busy set, unless assignFlanks still has to clear its side
        if (this.frozen(m)) { if (Number.isNaN(m.flankA)) mobs.rest(m); return; }
        // A dozing monster far from every hero (nothing it could do this tick) only gets its upkeep every DOZE_EVERY ticks
        if (m.dozeSlot < 0) m.dozeSlot = this.dozeSeq++ % DOZE_EVERY;
        const slot = (tick + m.dozeSlot) % DOZE_EVERY === 0;
        this.nearHero = undefined;
        // between its upkeep ticks a dozing monster only checks whether a hero came near
        if (m.dozy && !slot && !this.heroNear(m, awake)) return;
        m.dozy = this.dozing(m, awake, now);
        if (m.dozy) {
          if (!slot) return;
          dt = Math.min(600, (now - (m.lastTick || now - dtMs)) / 1000); // poise recovers for the whole time it dozed (or lay frozen); a dozing monster does nothing else with dt
        } else { dt = dtMs / 1000; mobs.wake(m); } // awake: it must be visited wherever it goes, warm square or not
        m.lastTick = now;
        if (!quietUnit(m, now)) tickUnit(this.host, id); // (most monsters have nothing on them: tickUnit would do nothing)
        const fx = TownRoom.mobFx(m, now);
        if (m.fx !== fx) m.fx = fx;
        this.updateMob(m, id, dt, now);
        if (m.perch) { m.x = m.homeX; m.y = m.homeY; m.moving = false; } // lookouts never leave their tower
        // In a fight: keep its body out of the others' (server/crowd.ts), so packs ring their target instead of stacking
        else if ((m.target || m.foe) && !m.dead && !m.hidden && now >= m.rushUntil && !this.dummies.has(id)) spreadCrowd(mobs, m, this.crowdStand);
        // Position history for lag-forgiving swings (only kept while it moves)
        const h = m.hist, n = h.length;
        if (m.dead) { if (n) h.length = 0; }
        else {
          const x = m.x, y = m.y;
          if (!n || h[n - 2] !== x || h[n - 1] !== y) {
            h.push(now, x, y);
            dropOldSamples(h, now - REWIND_MS - 100);
          }
        }
      });
    } finally { this.loopHeroes = undefined; this.nearHero = undefined; }
    dt = dtMs / 1000;
    this.updateZones(now);
    this.updateGuards(now);
    this.updateWatch(dt, now);
    this.holes = 0;
    this.state.fields.forEach((f) => { if (f.inst.def.hole) this.holes++; });
    this.state.projectiles.forEach((s, id) => this.updateProjectile(s, id, dt));
    this.updateHazards(now);
    this.champs.update(now); // Siegewrights' ballistae
    this.state.fields.forEach((f, id) => {
      if (!tickField(this.host, f.inst)) { this.state.fields.delete(id); return; }
      if (f.follow) { f.x = f.inst.x; f.y = f.inst.y; }
      const r = f.inst.reach ?? f.inst.def.r; // a Dorian song (Modulate) or one near a well reaches further
      if (f.r !== r) f.r = r;
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
      // (the squares round the stockade only, in map order: the same monsters and order as a full scan)
      this.watchSeen = this.state.mobs.inBox((x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, y1 - y0) / 2)
        .filter(([, o]) => !o.dead && !o.hidden && o.kind !== "trooper" && o.x > x0 && o.x < x1 && o.y > y0 && o.y < y1); // the watch leaves the clans' troops be
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
    if (now < this.guardsAt) return; // its timers run in minutes: once a second is plenty (every tick until the first spawn)
    this.guardsAt = this.guardsSpawned ? now + GUARD_CHECK_MS : 0;
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
  private guardsAt = 0;

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
    m.level = kind === "banditchief" || ELITE[kind] ? regionSpecialLevel(c.level - 1) : regionMobLevel(c.level - 1);
    m.hp = m.maxHp = Math.round(MOBS[kind].maxHp * mobScale(m.level, "hp"));
    if (kind === "banditchief") { m.camp = true; m.post = -1; } // leads the camp: hears the horn, rallies his men
    this.lurkIfAmbush(m, id); // an ambush room's hoard: its keepers wait in the dark round it
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
    // (no hero near is checked last, below, and only until four are found: it was a hero scan for every idle undead)
    const idle = (m: Mob) => !m.dead && !m.target && !m.ritual && !m.guard && !m.mergeInto && m.specialAt === 0;
    const byZone = new Map<number, [string, Mob][]>();
    this.state.mobs.forEach((m, id) => {
      if (m.dead) return;
      if (m.zone < 0) {
        if (NIGHT_BOSSES.includes(m.kind) && !underground(m.y) && !m.target && m.specialAt === 0) this.sinkMob(m, id); // no fight on: back to the grave (no day underground)
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
      let over = zone.alive - this.dayCap(zi, zone.cap), took = 0;
      for (const [id, m] of list) {
        if (took >= 4) break;
        if (this.playerNear(m.x, m.y, UNDEAD_NIGHT.sinkClear)) continue; // (the first four with no hero near, in sorted order)
        took++;
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
      const every = undead && !day && !SLOW_RISE.has(zi) ? Math.min(z.respawnMs, UNDEAD_NIGHT.riseMs) : z.respawnMs;
      if (zone.alive >= cap) { zone.nextAt = 0; if (zone.nextIn) zone.nextIn = 0; return; }
      if (!zone.nextAt || zone.nextAt > now + every) zone.nextAt = now + every;
      if (now >= zone.nextAt) {
        let revived = false, blocked = false;
        // the first dead one of the zone, in map order (it stops there: the rest of the map has nothing to say)
        for (const [id, m] of this.state.mobs) {
          if (!m.dead || m.zone !== zi) continue;
          if (day && NIGHT_BOSSES.includes(m.kind)) continue;
          const at = this.freeSpawnPoint(zi, m.kind);
          if (!at) { blocked = true; break; }
          this.zoneSpawn(m.kind, zi, id, at); // maybe a champion (about one in twenty) or its land's forged monster
          if (undead) this.broadcast("necroraise", { pts: [[Math.round(m.x), Math.round(m.y)]], rise: 1 }); // climbing out of the ground
          revived = true;
          break;
        }
        if (revived) zone.alive++;
        // No free spot (a hero is standing all over a small zone): try again shortly
        zone.nextAt = blocked ? now + 2000 : zone.alive < cap ? now + every : 0;
      }
      const secs = zone.nextAt ? Math.ceil((zone.nextAt - now) / 1000) : 0;
      if (zone.nextIn !== secs) zone.nextIn = secs;
    });
  }

  /** Like playerNear, but fallen heroes count too (they still watch). */
  private anyPlayerNear(x: number, y: number, r: number): boolean {
    for (const p of this.state.players.values()) if (Math.abs(p.x - x) < r && Math.abs(p.y - y) < r) return true;
    return false;
  }

  private playerNear(x: number, y: number, r: number): boolean {
    for (const p of this.state.players.values()) if (!p.dead && Math.abs(p.x - x) < r && Math.abs(p.y - y) < r) return true;
    return false;
  }

  /**
   * playerNear(m.x, m.y, SLEEP_RANGE), asked in updateMob. The hero heroNear just found near this monster (dozing asks
   * nearly the same) settles it when still alive and near; otherwise the full scan.
   */
  private sleepNear(m: Mob): boolean {
    const w = this.nearHero;
    this.nearHero = undefined;
    if (w && !w.dead && Math.abs(w.x - m.x) < SLEEP_RANGE && Math.abs(w.y - m.y) < SLEEP_RANGE) return true;
    return this.heroesNear(m.x, m.y, SLEEP_RANGE);
  }

  private updateMob(m: Mob, id: string, dt: number, now: number) {
    tickPoise(m, m.poiseLost > 0 ? mobPoiseMax(m) : 0, dt, now); // (the max only matters while some poise is lost)
    if (m.dead) { m.moving = false; m.winding = false; m.windUntil = 0; return; }
    if (m.owner) return this.updateSummon(m, id, dt, now);
    if (this.dummies.has(id)) { m.moving = false; m.winding = false; return; } // skill clip targets stand still
    if (m.kind === "trooper") return this.caravans.owns(id) ? this.caravans.step(m, id, dt, now) : this.sieges.owns(id) ? this.sieges.step(m, id, dt, now) : this.tunnels.owns(id) ? this.tunnels.step(m, id, dt, now) : this.rituals.owns(id) ? this.rituals.step(m, id, dt, now) : this.marches.owns(id) ? this.marches.step(m, id, dt, now) : this.battles.owns(id) ? this.battles.step(m, id, dt, now) : this.towns.owns(id) ? this.towns.step(m, id, dt, now) : this.feuds.owns(id) ? this.feuds.step(m, id, dt, now) : this.warTroops.step(m, id, dt, now); // clan troops and caravans (server/warTroops.ts, server/warCaravans.ts)
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
    if (m.flyUntil) return this.ambushFlight(m, id, now);
    if (m.kind === "nightraider") { m.stunUntil = 0; m.slowUntil = 0; } // no stun, root or slow holds a Night Raider (NIGHT_RAID)
    m.stunned = now < m.stunUntil;
    if (m.stunned || m.broken) { m.winding = false; m.windUntil = 0; }
    m.slowed = now < m.slowUntil;
    if (m.stunned) { m.moving = false; if (m.cr) this.crown.stunned(m, id, now); return; } // (a Crownguard's shield drops, a herald's decree is cut off)
    if (m.kind === "nightraider") return this.raiderStep(m, id, dt, now);
    // Nobody around: the monster dozes (no wandering, no budding), which keeps big monster counts cheap
    if (!m.target && !m.tide && !this.sleepNear(m)) {
      if (m.moving) m.moving = false;
      // an ambusher left standing about with nobody (not even a fallen hero) to see: it is back up its tree
      if (m.ambusher && !m.hidden && !m.broken && !this.anyPlayerNear(m.x, m.y, SLEEP_RANGE) && (m.spot || this.treeFor(m, now))) this.hide(m, id, now);
      return;
    }
    if (m.kind === "motherblob" && now >= m.nextBrood) this.brood(m, id, now);
    if (m.champ && this.champs.tick(m, id, now)) return; // a champion's affixes (server/champions.ts): busy under the sand, veiled, building
    if (HideKin.moves(m.kind) && this.hidekin.tick(m, id, now)) return; // the Hide-Kin's own (server/hidekin.ts): burrowed, coming up, sewing
    if (CrownCourt.moves(m.kind) && this.crown.tick(m, id, now)) return; // the Crown's court (server/crownMobs.ts): a shield up, a decree read, a king's move
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
    const foeKind = m.foe ? this.state.mobs.get(m.foe) : undefined;
    let foe: Mob | undefined = (FACTION[m.kind] || foeKind?.owner || foeKind?.kind === "nightraider" || foeKind?.kind === "trooper") && !t ? this.foeOf(m, def) : undefined;
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
    if (t && (m.kind === "banditchief" || warlordOf(m.kind))) this.chiefOrders(m, id, now);
    if (t && PACK_KINDS.includes(m.kind) && now >= m.nextCall) this.packCall(m, id, m.target, now); // its pack runs in (warhounds, cacklers, gildhounds, crows)

    // Dizzy: run for the nearest grave/tree if there is one
    if (t && m.broken && !m.spot && HIDE.spots[m.kind]) this.claimSpot(m, m.x, m.y, HIDE.fleeRadius, now, true);
    // Heading for a hiding spot (a calm monster forgets it as soon as it has someone to fight)
    if (m.spot && !m.fleeing && t) m.spot = "";
    if (m.spot && now > m.seekUntil) { m.spot = ""; m.fleeing = false; }
    if (m.spot) {
      if (Math.hypot(m.outX - m.x, m.outY - m.y) < 5) return this.hide(m, id, now);
      const go = m.ambusher ? this.go(m, m.outX, m.outY, now) : toward(m.x, m.y, m.outX, m.outY); // ambushers know their woods
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
              if ((m.kind === "bandit" || m.kind === "quillback") && now >= m.nextVolley) this.volley(m, id, t, now);
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
    } else if ((t || m.specialAt || m.rushUntil) && BEAST_MOVES[m.kind] && this.beastSpecial(m, id, t, t ? Math.hypot(t.x - m.x, t.y - m.y) : 0, now)) {
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
      // Cutthroat (and a badlands outrider): darts in and stabs on arrival
      const D = BANDIT_AI.dash;
      if (((m.kind === "bandit" && m.weapon === "cutthroat") || m.kind === "outrider") && !m.broken && !m.windUntil && now >= m.nextCharge && dist >= D.min && dist <= D.max) {
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
              const died = this.damagePlayer(m.target, Math.round(def.damage * melee.dmg * mobScale(m.level, "damage")), def.name, DIR_OFFSET[m.dir], 1,
                { atkLevel: m.level, from: id, mobEl: mel, slowMs: mel === "cold" ? ELEMENT_FX.cold.heroSlowMs : undefined });
              if (!died && BEAST_RIDER[m.kind]) this.beastRider(m, id, m.target);
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
    } else if (m.ambusher && !m.broken && this.treeFor(m, now)) {
      input = STILL; // nothing left to fight: back up into a tree (walks there next tick)
    } else if (m.camp && POSTS[m.post]?.route) {
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

  // ---- The Night Raiders (shared/raiders.ts) ----------------------------------

  /** Riders out now, by mob id. */
  private raiders = new Map<string, Mob>();
  private nextRaidCheck = 0;
  private nextRaidRoll = 0;
  /** No new rider in an act before this (after one fades or falls). */
  private raidRest: Record<1 | 2, number> = { 1: 0, 2: 0 };

  /** Which act's open land a point is in (not the Mawdeep under Act 1). */
  private static raidActAt(x: number, y: number): 0 | 1 | 2 {
    if (inDeepRow(Math.floor(y / TILE))) return 0; // the deep dungeons
    if (actAt(y, x) === 2) return 2;
    return y < WORLD_H * TILE ? 1 : 0;
  }

  /** Once a second: riders fade at dawn or when their ride is over; by night a free slot may fill (NIGHT_RAID). */
  private updateRaids(now: number) {
    if (now < this.nextRaidCheck) return;
    this.nextRaidCheck = now + 1000;
    const night = isUndeadNight(worldDayFrac(now));
    for (const [id, m] of this.raiders) {
      if (m.dead || !this.state.mobs.has(id)) { this.raiders.delete(id); continue; }
      // it rides off into the dark: at dawn, or its time is up and nobody is fighting it
      if (!night || (now >= m.raidEnd && !m.target && !m.foe && !m.windUntil)) this.raiderGone(m, id, false);
    }
    if (!night) { this.nextRaidRoll = 0; return; }
    if (!this.nextRaidRoll) { this.nextRaidRoll = now + NIGHT_RAID.rollMs * (0.3 + Math.random() * 0.7); return; }
    if (now < this.nextRaidRoll) return;
    this.nextRaidRoll = now + NIGHT_RAID.rollMs;
    for (const act of [1, 2] as const) {
      const A = NIGHT_RAID.acts[act];
      if (now < this.raidRest[act] || (act === 1 && this.tide.marching)) continue; // no riders while the Gloam Tide marches
      const out = [...this.raiders.values()].filter((m) => m.raidAct === act).length;
      for (let slot = out; slot < A.max; slot++) if (Math.random() < A.chance) this.raidArrive(act, now);
    }
  }

  /** A rider comes out of the dark off screen near a hero in that act. Returns its id (none when nobody is there). */
  raidArrive(act: 1 | 2, now = Date.now(), key?: string, near?: { x: number; y: number }): string | undefined {
    const heroes = [...this.state.players.values()].filter((p) => !p.dead && TownRoom.raidActAt(p.x, p.y) === act);
    const hero = near ?? heroes[Math.floor(Math.random() * heroes.length)];
    if (!hero) return undefined;
    const busy = new Set([...this.raiders.values()].map((m) => m.weapon));
    const free = RAIDERS.filter((r) => !busy.has(r.key));
    const R = key ? raiderByKey(key) : free[Math.floor(Math.random() * free.length)];
    if (!R || busy.has(R.key)) return undefined;
    const [a0, a1] = NIGHT_RAID.arrive;
    let at: { x: number; y: number } | undefined;
    for (let i = 0; i < 40 && !at; i++) {
      const a = Math.random() * Math.PI * 2, d = (a0 + Math.random() * (a1 - a0)) * TILE;
      const x = hero.x + Math.cos(a) * d, y = hero.y + Math.sin(a) * d;
      if (this.rideOk(x, y, act)) at = { x, y };
    }
    if (!at) return undefined;
    const A = NIGHT_RAID.acts[act];
    const id = `nr${++this.mobSeq}`;
    this.spawnMob("nightraider", -1, id, { ...at, level: capLevel(A.level) });
    const m = this.state.mobs.get(id)!;
    m.weapon = R.key; m.title = R.title;
    m.raidAct = act; m.raidEnd = now + NIGHT_RAID.rideMs[0] + Math.random() * (NIGHT_RAID.rideMs[1] - NIGHT_RAID.rideMs[0]);
    m.rideX = NaN; m.rideStuck = 0; m.nextSay = now + 2500 + Math.random() * 4000; m.nextCharge = now + 2000;
    this.raiders.set(id, m);
    this.broadcast("raider", { id, act, title: R.title, x: Math.round(m.x), y: Math.round(m.y) });
    return id;
  }

  /** Open ground a rider may stand on in that act: not a wall, a town or the safe square. */
  private rideOk(x: number, y: number, act: 1 | 2): boolean {
    if (x < TILE || y < TILE || x > (MAP_W - 1) * TILE || y > (MAP_H - 1) * TILE) return false;
    if (TownRoom.raidActAt(x, y) !== act) return false;
    return !blocked(x, y) && !isSafeZone(x, y) && !noMobsAt(x, y) && villageDist(x, y) > 4;
  }

  /** It falls (killed) or rides off (killer ""): gone in a cloud of dust, and the act rests a while. */
  private raiderGone(m: Mob, id: string, killed: boolean, killerName = "") {
    if (!this.raiders.has(id)) return;
    this.raiders.delete(id);
    const R = raiderByKey(m.weapon), act = (m.raidAct === 2 ? 2 : 1) as 1 | 2;
    this.raidRest[act] = Math.max(this.raidRest[act], Date.now() + NIGHT_RAID.acts[act].restMs);
    if (killed && R) this.bossSay(id, [R.death]);
    this.broadcast("raiderdust", { id, x: Math.round(m.x), y: Math.round(m.y), title: m.title, killed, by: killerName });
    if (killed) return; // mobDied does the rest
    m.dead = true; m.hp = 0; m.target = ""; m.foe = ""; m.moving = false; m.winding = false; m.windUntil = 0;
    this.clock.setTimeout(() => this.state.mobs.delete(id), 500);
  }

  /** Living things a rider may cut down: every hero, every monster except the dead and the golems. */
  private raiderPrey(m: Mob, id: string, now: number): void {
    const S = NIGHT_RAID.sight, ws = warState(), hunt = ws && huntedClan(ws); // the war's leading clan is their prey first (shared/war/rules.ts)
    let best = 0, target = "", foe = "";
    this.state.players.forEach((p, pid) => {
      if (p.dead || isSafeZone(p.x, p.y)) return;
      const d = Math.hypot(p.x - m.x, p.y - m.y), hated = pid === m.hateId ? m.hate : 0;
      if (d >= (hated > 0 ? S * 2 : S)) return;
      const score = 0.3 + Math.max(0, 1 - d / S) + hated + (pid === m.target ? AGGRO.stick : 0) + (hunt && p.clan === hunt ? NIGHT_RAID.huntPrey : 0);
      if (score > best) { best = score; target = pid; foe = ""; }
    });
    for (const [oid, o] of this.state.mobs.inBox(m.x, m.y, S)) {
      if (o === m || o.dead || o.hidden || raiderIgnores(o.kind) || o.kind === "bride") continue;
      const d = Math.hypot(o.x - m.x, o.y - m.y);
      if (d >= S) continue;
      const prey = hunt && o.kind === "trooper" && parseTroop(o.weapon)?.clan === hunt ? NIGHT_RAID.huntPrey : 0; // the hunted clan's soldiers and carts
      const score = Math.max(0, 1 - d / S) + (oid === m.hateId ? m.hate : 0) + (oid === m.foe ? AGGRO.stick : 0) + prey;
      if (score > best) { best = score; target = ""; foe = oid; }
    }
    const had = m.target || m.foe;
    if ((target || foe) && !had) { m.chaseX = m.x; m.chaseY = m.y; }
    // a hero in its way hears it first
    if (target && target !== m.target && now >= m.nextTaunt) {
      m.nextTaunt = now + 12_000;
      const R = raiderByKey(m.weapon);
      if (R) this.bossSay(id, R.fight);
    }
    m.target = target; m.foe = foe;
  }

  /** One rider's tick: hunt what lives near, else ride on to the next stop, talking about what it is looking for. */
  private raiderStep(m: Mob, id: string, dt: number, now: number) {
    const def = mobDef(m, now), R = NIGHT_RAID, act = (m.raidAct === 2 ? 2 : 1) as 1 | 2;
    m.homeX = m.x; m.homeY = m.y; // no home: it never walks back anywhere
    if (m.broken) { m.moving = false; m.chargeUntil = 0; return; }
    if (m.hate > 0) m.hate = Math.max(0, m.hate - AGGRO.decayPerSec * dt);
    if (now >= m.nextAggro) { m.nextAggro = now + AGGRO.everyMs; this.raiderPrey(m, id, now); }
    const hero = m.target ? this.state.players.get(m.target) : undefined;
    const mob = !hero && m.foe ? this.state.mobs.get(m.foe) : undefined;
    let t: { x: number; y: number } | undefined = hero ?? mob;
    // lost it: dead, hidden in town, or chased too far
    if ((hero && (hero.dead || isSafeZone(hero.x, hero.y))) || (mob && (mob.dead || mob.hidden)) || (t && Math.hypot(m.x - m.chaseX, m.y - m.chaseY) > R.chase)) {
      m.target = ""; m.foe = ""; t = undefined; m.chargeUntil = 0; m.windUntil = 0; m.winding = false;
    }
    let input: InputState = STILL, speed = def.speed * 0.72;
    if (t) {
      const dist = Math.hypot(t.x - m.x, t.y - m.y), reach = 22 + (mob ? mobBody(mob.kind) : 4);
      const C = R.charge;
      const charging = now < m.chargeUntil;
      if (!charging && !m.windUntil && now >= m.nextCharge && dist >= C.min && dist <= C.max) {
        m.chargeUntil = now + C.ms; m.nextCharge = now + C.cooldownMs;
        this.broadcast("raidercharge", { id });
      }
      if (now < m.chargeUntil) {
        // spurring the horse: straight at it, the blow lands the moment it gets there
        if (dist <= reach + 4) {
          m.chargeUntil = 0; m.lastAttack = now;
          this.broadcast("swing", { id });
          this.raiderBlow(m, id, t, C.mult);
        } else { input = toward(m.x, m.y, t.x, t.y); speed = def.speed * C.speed; }
      } else if (dist <= reach || m.windUntil) {
        m.dir = Math.abs(t.x - m.x) > Math.abs(t.y - m.y) ? (t.x > m.x ? "right" : "left") : (t.y > m.y ? "down" : "up");
        if (m.windUntil) {
          if (now >= m.windUntil) {
            m.windUntil = 0; m.winding = false; m.lastAttack = now;
            if (dist <= reach + 8) { this.broadcast("swing", { id }); this.raiderBlow(m, id, t, 1); }
          }
        } else if (now - m.lastAttack >= def.attackCooldownMs / poiseSpeed(poiseFrac(m, mobPoiseMax(m)))) {
          m.windUntil = now + MOB_COMBAT.nightraider.windupMs; m.winding = true;
        }
        m.moving = false;
        return;
      } else { input = toward(m.x, m.y, t.x, t.y); speed = def.speed; }
    } else {
      // riding the land: on to the next stop, a new one when it gets there or is stuck on something
      if (Number.isNaN(m.rideX) || Math.hypot(m.rideX - m.x, m.rideY - m.y) < 14 || m.rideStuck > 1.2) this.nextStop(m, act);
      input = toward(m.x, m.y, m.rideX, m.rideY);
      if (now >= m.nextSay && this.playerNear(m.x, m.y, 14 * TILE)) {
        m.nextSay = now + R.sayMs[0] + Math.random() * (R.sayMs[1] - R.sayMs[0]);
        const lines = raiderByKey(m.weapon)?.seek;
        if (lines) this.bossSay(id, lines);
      }
    }
    if (m.slowed) speed *= SLOW_MOB;
    const r = moveStep(m.x, m.y, input, dt, speed);
    const ok = this.canStep(m, r.x, r.y) && TownRoom.raidActAt(r.x, r.y) === act;
    const moved = ok ? Math.hypot(r.x - m.x, r.y - m.y) : 0;
    if (ok) { m.x = r.x; m.y = r.y; }
    m.rideStuck = input !== STILL && moved < speed * dt * 0.25 ? m.rideStuck + dt : 0;
    if (t && m.rideStuck > 1.5) { m.target = ""; m.foe = ""; m.rideStuck = 0; } // can't reach it: rides on
    m.moving = ok && r.moving;
    m.dir = dirFromInput(input, m.dir);
  }

  /** Picks the rider's next stop on its endless search: somewhere ahead-ish on open ground of its act. */
  private nextStop(m: Mob, act: 1 | 2) {
    const [w0, w1] = NIGHT_RAID.wander;
    const heading = Number.isNaN(m.rideX) ? Math.random() * Math.PI * 2 : Math.atan2(m.rideY - m.y, m.rideX - m.x);
    m.rideStuck = 0;
    for (let i = 0; i < 24; i++) {
      // mostly keeps its heading (it is crossing the land), sometimes turns sharply (it heard something)
      const a = i < 12 && Math.random() < 0.7 ? heading + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
      const d = (w0 + Math.random() * (w1 - w0)) * TILE, x = m.x + Math.cos(a) * d, y = m.y + Math.sin(a) * d;
      if (this.rideOk(x, y, act)) { m.rideX = x; m.rideY = y; return; }
    }
    m.rideX = m.x + (Math.random() - 0.5) * 6 * TILE; m.rideY = m.y + (Math.random() - 0.5) * 6 * TILE;
  }

  /** The massive weapon comes down on its prey and sweeps everyone living next to it. */
  private raiderBlow(m: Mob, id: string, t: { x: number; y: number }, mult: number) {
    const def = mobDef(m), base = def.damage * mobScale(m.level, "damage") * mult, C = NIGHT_RAID.cleave;
    const d = Math.hypot(t.x - m.x, t.y - m.y) || 1, push: [number, number] = [(t.x - m.x) / d, (t.y - m.y) / d];
    const hitHero = (pid: string, k: number) => this.damagePlayer(pid, Math.round(base * k), m.title.split(",")[0] || def.name, push, 1.6, { atkLevel: m.level, from: id });
    const hitMob = (oid: string, o: Mob, k: number) => { if (!o.dead) this.mobHitsMob(m, id, o, oid, Math.round(base * k * FEUD.dmgMult)); };
    const main = m.target || m.foe;
    let killed = false;
    if (m.target) killed = hitHero(m.target, 1);
    else if (m.foe) { const o = this.state.mobs.get(m.foe); if (o) hitMob(m.foe, o, 1); }
    // the sweep: everyone else within reach of the blow
    this.state.players.forEach((p, pid) => {
      if (pid === main || p.dead || Math.hypot(p.x - t.x, p.y - t.y) > C.r) return;
      if (hitHero(pid, C.mult)) killed = true;
    });
    this.state.mobs.forEach((o, oid) => {
      if (oid === main || oid === id || o.dead || o.hidden || raiderIgnores(o.kind) || o.kind === "bride" || Math.abs(o.x - t.x) > C.r || Math.abs(o.y - t.y) > C.r) return;
      if (Math.hypot(o.x - t.x, o.y - t.y) <= C.r) hitMob(oid, o, C.mult);
    });
    if (killed && Math.random() < 0.6) { const R = raiderByKey(m.weapon); if (R) this.bossSay(id, R.kill); }
  }

  /** May a walking monster step to (x,y)? Never into the safe zone or a peaceful place; a Mother Blob never closer to Oakvale than MOTHER_KEEP_OUT (she may still step back out). */
  private canStep(m: Mob, x: number, y: number): boolean {
    if (isSafeZone(x, y)) return false;
    // monster-free ground (the towns, the Sun Furnace's plateau): only a quest boss and what it calls walk there
    if (noMobsAt(x, y) && !m.summonFor && !(m.mother && this.state.mobs.get(m.mother)?.summonFor)) return false;
    if (m.kind === "motherblob") { const d = villageDist(x, y); if (d < MOTHER_KEEP_OUT && d < villageDist(m.x, m.y)) return false; }
    return true;
  }

  // ---- Redfang Hollow bandits (shared/bandits.ts) -----------------------------

  /** Patrol: walk to the next point of the route; at the end turn round. Home follows, so after a fight it carries on. */
  private patrolStep(m: Mob, now: number): InputState {
    if (now < m.detourUntil) return m.wander;
    const route = POSTS[m.post].route!;
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

  /** Walk toward (x,y): camp bandits (and Gloam Tide marchers) find their way round walls, others go straight. */
  private go(m: Mob, x: number, y: number, now: number): InputState {
    if (!(m.camp || m.tide) || clearWalk(m.x, m.y, x, y)) { m.path = []; m.pathFail = false; return toward(m.x, m.y, x, y); }
    const moved = Math.hypot(x - m.pathTX, y - m.pathTY) > TILE;
    // (no way found last time: the BFS would only fail again until the goal moves or the usual re-path time comes)
    if ((!m.path.length && !m.pathFail) || moved || now > m.pathAt + 1500) {
      m.path = findPath(m.x, m.y, x, y); m.pathAt = now; m.pathTX = x; m.pathTY = y; m.pathFail = !m.path.length;
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
    for (const [oid, o] of this.state.mobs.inBox(x, y, r)) {
      if (o.dead || o.hidden || !(o.camp || o.kind === "banditchief") || Math.hypot(o.x - x, o.y - y) > r) continue; // ambushers stay up in their trees
      o.alertUntil = now + BANDIT_AI.horn.alertMs; o.alertHero = heroId;
      if (o.perch) continue; // lookouts keep shooting from their towers
      if (!o.target) { o.target = heroId; o.foe = ""; o.nextAggro = now + AGGRO.everyMs; ids.push(oid); }
      if (o.hateId !== heroId || o.hate < AGGRO.hitBase) this.addHate(o, heroId, 0);
    }
    if (ids.length) this.broadcast("alert", { ids });
  }

  /** Bandit hit by a hero: shouts for the others close by. */
  private banditShout(m: Mob, id: string, heroId: string, now: number) {
    if (now < m.nextCall) return;
    m.nextCall = now + BANDIT_AI.shout.cooldownMs;
    this.broadcast("bshout", { id });
    this.alertCamp(m.x, m.y, BANDIT_AI.shout.range, heroId, now);
  }

  /** Archers (and Quillbacks, SINKHOLES_AI.quills) now and then loose two more arrows beside the aimed one. */
  private volley(m: Mob, id: string, t: Player, now: number) {
    const V = m.kind === "quillback" ? SINKHOLES_AI.quills.volley : BANDIT_AI.volley;
    m.nextVolley = now + V.everyMs * (0.8 + Math.random() * 0.4);
    const a0 = Math.atan2(t.y - m.y, t.x - m.x), d = Math.hypot(t.x - m.x, t.y - m.y);
    for (let k = 1; k < V.arrows; k++) {
      const a = a0 + (k % 2 ? 1 : -1) * V.spread * Math.ceil(k / 2);
      this.mobShot(m, id, m.x + Math.cos(a) * d, m.y + Math.sin(a) * d);
    }
    this.broadcast("volley", { id });
  }

  /**
   * The chief: War Cry (rallies everyone around him) and, once badly hurt, two more cutthroats out of the huts. The
   * badlands' warlords (BADLANDS_AI.warlords: a Redfang Captain, Old Rourke) cry war the same way, rallying the clan's
   * own round them (camp or not); Old Rourke calls outriders out of his keep once badly hurt. A Hide-Chieftain
   * (SINKHOLES_AI.warlords) rallies the Hide-Kin round him the same way.
   */
  private chiefOrders(m: Mob, id: string, now: number) {
    const lord = m.kind === "banditchief" ? undefined : warlordOf(m.kind), kin = HIDEKIN_KINDS.includes(m.kind) ? HIDEKIN_KINDS : CROWN_KINDS.includes(m.kind) ? CROWN_KINDS : REDFANG_KINDS;
    const W = lord ?? CHIEF.warCry;
    if (now >= m.nextCry && !m.broken) {
      m.nextCry = now + W.cooldownMs;
      const ids: string[] = [id];
      m.rallyUntil = now + W.buffMs;
      for (const [oid, o] of this.state.mobs.inBox(m.x, m.y, W.range)) {
        if (oid === id || o.dead || !(o.camp || (lord && kin.includes(o.kind) && !o.owner)) || Math.hypot(o.x - m.x, o.y - m.y) > W.range) continue;
        o.rallyUntil = now + W.buffMs; ids.push(oid);
      }
      this.broadcast("warcry", { id, ids, ms: W.buffMs });
      this.alertCamp(m.x, m.y, W.range, m.target, now);
    }
    if (lord) {
      const R = lord.reinforce;
      if (!R || m.reinforced || m.hp >= m.maxHp * R.hpFrac) return;
      m.reinforced = true;
      let mine = 0; // his men still alive from an earlier fight count too
      this.state.mobs.forEach((o) => { if (!o.dead && o.mother === id) mine++; });
      const pts: [number, number][] = [];
      for (let i = mine; i < R.count; i++) {
        const c = this.callReinforcement(m, id, R.kind, "");
        if (c) pts.push([Math.round(c.x), Math.round(c.y)]);
      }
      this.broadcast("reinforce", { id, pts });
      return;
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

  /**
   * A Warhound (or a Cackler, PACK_KINDS) bays (BADLANDS_AI.pack): every one of its kind within range that has nobody to
   * chase comes for its prey too. Each bays at most once per cooldown.
   */
  private packCall(m: Mob, id: string, heroId: string, now: number) {
    const P = BADLANDS_AI.pack;
    m.nextCall = now + P.cooldownMs;
    if (!this.state.players.has(heroId)) return;
    const ids: string[] = [];
    for (const [oid, o] of this.state.mobs.inBox(m.x, m.y, P.range)) {
      if (oid === id || o.kind !== m.kind || o.dead || o.hidden || o.owner || o.target || Math.hypot(o.x - m.x, o.y - m.y) > P.range) continue;
      o.target = heroId; o.foe = ""; o.nextAggro = now + AGGRO.everyMs; o.nextCall = now + P.cooldownMs; // (they don't bay on in a chain)
      this.addHate(o, heroId, 0);
      ids.push(oid);
    }
    if (ids.length) this.broadcast("bay", { id, ids }); // a lone hound keeps quiet: no howl spam every cooldown
  }

  /** One extra cutthroat (or a lord's `kind`) runs out next to the chief (his own man: no post, never respawns). */
  private callReinforcement(chief: Mob, chiefId: string, kind: MobKind = "bandit", weapon = "cutthroat"): Mob | undefined {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 30;
      const x = chief.x + Math.cos(a) * r, y = chief.y + Math.sin(a) * r;
      if (isSolidAt(x, y) || isSafeZone(x, y) || noMobsAt(x, y)) continue;
      const c = new Mob();
      c.kind = kind; c.weapon = weapon; c.zone = -1; c.mother = chiefId; c.camp = true; c.post = -1;
      c.x = c.homeX = x; c.y = c.homeY = y;
      c.level = kind === "bandit" ? chief.level : actMobLevel(actOfTile(Math.floor(x / TILE), Math.floor(y / TILE)), chief.level); // a lord's men: his land's regular ceiling
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
    const wind = (kind: string, ms: number, extra: Record<string, unknown> = {}) => {
      m.specialKind = kind; m.specialAt = now + ms; m.winding = true;
      this.broadcast("hkwind", { id, kind, ms, x: Math.round(m.x), y: Math.round(m.y), ...extra });
    };
    if (frac < K.wrath.hpFrac && now >= m.nextLeap && dist <= K.wrath.radius) {
      m.nextLeap = now + K.wrath.cooldownMs;
      wind("wrath", K.wrath.windupMs, { r: K.wrath.radius, inner: K.wrath.inner });
    } else if (frac < K.servants.hpFrac && now >= m.nextRaise && this.kidsOf(id) < K.servants.max) { // counted only when due
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

  // ---- The Mawdeep Warrens (shared/dungeon.ts): ropes and stairs, and the beast-folk's moves (BEAST) ----------------

  /** Walking onto a rope or stair takes the hero to its other end (not straight back: they must step off first). */
  private useLinks(pid: string, p: Player) {
    if (p.linkLock) {
      const l = linkById(p.linkLock);
      if (l && Math.hypot(l.x - p.x, l.y - p.y) <= LINK_RANGE * 1.6) return;
      p.linkLock = "";
    }
    for (const l of LINKS) {
      if (Math.abs(l.x - p.x) > LINK_RANGE || Math.abs(l.y - p.y) > LINK_RANGE || Math.hypot(l.x - p.x, l.y - p.y) > LINK_RANGE) continue;
      const dest = linkById(l.to);
      if (!dest || this.lanternHeld(pid, p)) return;
      const at = arrivalAt(dest);
      p.x = at.x; p.y = at.y; p.moving = false;
      p.rollUntil = 0; p.rolling = false; p.emote = "";
      p.linkLock = dest.id;
      this.broadcast("descend", { id: pid, from: l.id, to: dest.id, down: l.down, x: Math.round(at.x), y: Math.round(at.y) });
      return;
    }
  }

  /**
   * A hero carrying a quest lantern (Player.qlock, server/questSteps.ts) walks it: no portal stone, waygate, rope or stair
   * takes them (skills are locked already). True = blocked; they hear why, at most every 3 s. The lantern stays in hand.
   */
  private lanternHeld(pid: string, p: Player): boolean {
    if (!p.qlock) return false;
    const now = Date.now();
    if (now - p.qlockNoteAt > 3000) { p.qlockNoteAt = now; this.note(pid, "The lantern won't survive the portal. Walk it."); }
    return true;
  }

  /**
   * Act 2's waygates (shared/act2.ts): used like a portal stone, by clicking it or pressing E next to it (Murat
   * 2026-11-13), which takes the hero to the other act once they have beaten the first zone's two last bosses.
   * Walking into it used to cross, and a hero still walking north came out next to the other gate and went straight
   * back. Before Act 2 is open, the gate is cold: a note says who still stands in the way. The homelands' gates (the
   * moorgate, Act 3; the Red Pass, Act 4) work the same way and wake at their act's hero level (shared/act2.ts HOMELAND_GATES).
   */
  private useWaygate(client: Client) {
    const pid = client.sessionId, p = this.state.players.get(pid);
    if (!p || p.dead) return;
    const g = WAYGATES.find((o) => Math.hypot(o.x - p.x, o.y - p.y) <= WAYGATE_RANGE * 1.5);
    if (!g) return;
    if (!gateOpen(g, p)) {
      const now = Date.now();
      if (now - p.gateNoteAt > 3000) {
        p.gateNoteAt = now;
        this.note(pid, gateColdNote(g, p));
      }
      return;
    }
    const cg = cityGateOf(g);
    if (cg && !cg.inner && !this.caps.admit(pid, cg.city)) return; // a capital's gate stays shut to its enemies (server/warCapitals.ts)
    if (this.lanternHeld(pid, p)) return;
    if (Date.now() - p.lastHurt < PORTAL_COMBAT_MS) { client.send("travelno", { why: "fight" }); return; }
    const dest = waygateById(g.to)!, at = waygateArrival(dest);
    p.x = at.x; p.y = at.y; p.moving = false;
    p.rollUntil = 0; p.rolling = false; p.emote = "";
    this.broadcast("waygate", { id: pid, to: dest.id, x: Math.round(at.x), y: Math.round(at.y) });
  }

  /** The sickness, bleeding or venom a beast's plain bite leaves (BEAST.plague / bleed / venom). */
  private beastRider(m: Mob, id: string, pid: string) {
    const kind = BEAST_RIDER[m.kind]!, R = BEAST[kind], name = `${mobDef(m).name}'s ${kind === "plague" ? "plague" : kind === "bleed" ? "rending bite" : "venom"}`;
    const tick = Math.max(1, Math.round(MOBS[m.kind].damage * mobScale(m.level, "damage") * R.dmgMult * mobDmgK(m)));
    const el = kind === "bleed" ? undefined : "poison";
    for (let i = 1; i <= R.ticks; i++) this.host.later(R.tickMs * i, () => this.damagePlayer(pid, tick, name, [0, 0], 0, { dot: true, mobEl: el, el, atkLevel: m.level }));
  }

  /** A beast's called kin (the Packlord's Howl, the Hide-Mother's brood): out of the dark beside it, fights for it, gone when it falls. */
  /** A boss speaks (a speech bubble over it, for everyone near): one line picked from `lines`. */
  private bossSay(id: string, lines: readonly string[]) {
    const m = this.state.mobs.get(id);
    if (!m || !lines.length) return;
    this.broadcast("bosssay", { id, text: lines[Math.floor(Math.random() * lines.length)] });
  }
  /** Quest bosses with a voice (Summon.voice): a taunt now and then while they fight, a line at half health. */
  private bossVoices(now: number) {
    this.state.mobs.forEach((m, id) => {
      if (!m.voice || m.dead) return;
      if (!m.halfSaid && m.voice.half && m.hp < m.maxHp * 0.5) { m.halfSaid = true; this.bossSay(id, m.voice.half); m.nextTaunt = now + 9000; return; }
      if (m.target && now >= m.nextTaunt) { this.bossSay(id, m.voice.taunt); m.nextTaunt = now + 11000 + Math.random() * 7000; }
    });
  }
  /** Grandam Ursk's fight (URSK): her phases, and her voice while she fights. */
  private urskPhases(m: Mob, id: string, t: Player | undefined, now: number) {
    if (m.dead || !m.uPhase) return;
    const frac = m.hp / Math.max(1, m.maxHp);
    if (m.uPhase < 2 && frac < URSK.phase[0]) {
      m.uPhase = 2; // the Rite: her brood, her hook, her needle
      this.bossSay(id, URSK.lines.rite);
      m.bcd.brood = now + 400; m.bcd.hook = now + 3500; m.bcd.gather = now + 10000;
      this.broadcast("ursk", { id, phase: 2 });
    }
    if (m.uPhase < 3 && frac < URSK.phase[1]) {
      m.uPhase = 3; // the Bear: she tears off what is left of the woman
      this.bossSay(id, URSK.lines.bear);
      m.bcd.roar = now + 900; m.bcd.rockfall = now + 3000;
      this.broadcast("ursk", { id, phase: 3 });
    }
    if (t && now >= m.nextTaunt) {
      if (m.nextTaunt) this.bossSay(id, URSK.lines.taunt);
      m.nextTaunt = now + URSK.tauntMs[0] + Math.random() * (URSK.tauntMs[1] - URSK.tauntMs[0]);
    }
  }

  /** The Sunwright's fight (SUNWRIGHT): the Dawn, the Choir, the Second Sun, and her voice. */
  private sunPhases(m: Mob, id: string, t: Player | undefined, now: number) {
    if (m.dead || !m.uPhase) return;
    const frac = m.hp / Math.max(1, m.maxHp);
    if (m.uPhase < 2 && frac < SUNWRIGHT.phase[0]) {
      m.uPhase = 2; // the Choir: her adepts come up the stair singing, and Zenith begins
      this.bossSay(id, SUNWRIGHT.lines.choir);
      m.bcd.brood = now + 400; m.bcd.zenith = now + 6000;
      this.broadcast("sunwright", { id, phase: 2 });
    }
    if (m.uPhase < 3 && frac < SUNWRIGHT.phase[1]) {
      m.uPhase = 3; // the Second Sun: she takes the Furnace's fire into herself
      this.bossSay(id, SUNWRIGHT.lines.sun);
      m.bcd.flare = now + 900; m.bcd.sunfall = now + 2500;
      this.broadcast("sunwright", { id, phase: 3 });
    }
    if (t && now >= m.nextTaunt) {
      if (m.nextTaunt) this.bossSay(id, SUNWRIGHT.lines.taunt);
      m.nextTaunt = now + SUNWRIGHT.tauntMs[0] + Math.random() * (SUNWRIGHT.tauntMs[1] - SUNWRIGHT.tauntMs[0]);
    }
  }

  private raiseKin(b: Mob, bid: string, kind: MobKind, levelDrop: number): Mob | undefined {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 50;
      const x = b.x + Math.cos(a) * r, y = b.y + Math.sin(a) * r;
      if (isSolidAt(x, y) || isSolidAt(x - 6, y - 6) || isSolidAt(x + 6, y + 6)) continue;
      const c = new Mob();
      c.kind = kind; c.zone = -1; c.mother = bid; c.servant = true;
      c.x = c.homeX = x; c.y = c.homeY = y;
      c.level = actMobLevel(actOfTile(Math.floor(b.x / TILE), Math.floor(b.y / TILE)), b.level - levelDrop);
      c.hp = c.maxHp = Math.round(MOBS[kind].maxHp * mobScale(c.level, "hp"));
      c.target = b.target;
      if (c.target) this.addHate(c, c.target, 0);
      c.stunUntil = Date.now() + 500; // scrambling out of a burrow
      const cid = `k${++this.mobSeq}`;
      this.state.mobs.set(cid, c);
      return c;
    }
    return undefined;
  }

  /**
   * The beast-folk's moves (BEAST, BEAST_MOVES): each is marked on the ground first ("bwind"), then lands ("bhit").
   * Gore, Stampede, Swoop and Pounce are rushes: the beast hurtles along for a moment, hitting whoever it touches.
   * Returns true while busy (it stands still or rushes on its own). `t` may be gone while a move it started lands.
   */
  private beastSpecial(m: Mob, id: string, t: Player | undefined, dist: number, now: number): boolean {
    const B = BEAST, def = mobDef(m, now), name = def.name;
    const dmgOf = (mult: number) => Math.max(1, Math.round(def.damage * mobScale(m.level, "damage") * mult));
    const facing = (x: number, y: number) => { m.dir = Math.abs(x - m.x) > Math.abs(y - m.y) ? (x > m.x ? "right" : "left") : (y > m.y ? "down" : "up"); };
    // every hero in a shape: f(dx, dy, d) decides
    const heroes = (f: (dx: number, dy: number, d: number, p: Player) => boolean, hit: (pid: string, p: Player, dx: number, dy: number, d: number) => void) =>
      this.state.players.forEach((p, pid) => {
        if (p.dead) return;
        const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy);
        if (f(dx, dy, d, p)) hit(pid, p, dx, dy, d);
      });
    const away = (dx: number, dy: number, d: number): [number, number] => (d > 0.1 ? [dx / d, dy / d] : [m.aimX, m.aimY]);
    if (m.kind === "hidemother") this.urskPhases(m, id, t, now);
    if (m.kind === "sunwright") this.sunPhases(m, id, t, now);

    // ---- a rush in progress
    if (m.rushUntil) {
      const kind = m.rushKind as BeastMove;
      const dt = 1 / TICK_RATE;
      if (kind === "stampede" && m.rushTurn && now >= m.rushTurn && t) {
        // the bull swings round once toward its target, mid-charge
        m.rushTurn = 0;
        const sp = Math.hypot(m.rushVX, m.rushVY), d = Math.max(0.1, dist);
        const nx = (t.x - m.x) / d, ny = (t.y - m.y) / d, ox = m.rushVX / sp, oy = m.rushVY / sp;
        const k = 0.6; // not a full turn: it can still be sidestepped
        const vx = ox * (1 - k) + nx * k, vy = oy * (1 - k) + ny * k, l = Math.hypot(vx, vy) || 1;
        m.rushVX = vx / l * sp; m.rushVY = vy / l * sp; m.aimX = vx / l; m.aimY = vy / l;
        this.broadcast("bturn", { id, ax: m.aimX, ay: m.aimY });
      }
      let stop = now >= m.rushUntil;
      if (!stop) {
        // sub-steps so it never jumps a wall or a hero
        const steps = 3;
        for (let i = 0; i < steps && !stop; i++) {
          const nx = m.x + m.rushVX * dt / steps, ny = m.y + m.rushVY * dt / steps;
          if (isSolidAt(nx, ny) || isSolidAt(nx + Math.sign(m.rushVX) * 6, ny) || isSolidAt(nx, ny + Math.sign(m.rushVY) * 4) || !this.canStep(m, nx, ny)) { stop = true; break; }
          m.x = nx; m.y = ny;
          if (kind === "gore" || kind === "stampede") {
            const G = kind === "gore" ? B.gore : B.stampede, w = G.width / 2 + 6;
            heroes((dx, dy, d) => d <= w, (pid, _p, dx, dy) => {
              if (m.rushHit.includes(pid)) return;
              m.rushHit.push(pid);
              // thrown off to the side it was standing on, and forward
              const side = dx * -m.aimY + dy * m.aimX >= 0 ? 1 : -1;
              const push: [number, number] = [m.aimX * 0.6 - m.aimY * side * 0.8, m.aimY * 0.6 + m.aimX * side * 0.8];
              this.damagePlayer(pid, dmgOf(G.dmgMult), `${name}'s ${kind === "gore" ? "Gore" : "Stampede"}`, push, G.knockback, { atkLevel: m.level, from: id });
            });
          } else if (kind === "swoop" && t && !m.rushHit.length && dist <= 14) {
            m.rushHit.push(m.target);
            const dmg = dmgOf(B.swoop.dmgMult);
            this.damagePlayer(m.target, dmg, `${name}'s Swoop`, [m.aimX, m.aimY], 1, { atkLevel: m.level, from: id });
            m.hp = Math.min(m.maxHp, m.hp + Math.round(dmg * B.swoop.heal)); // drinks the blood it draws
            this.broadcast("bhit", { id, kind: "swoop", x: Math.round(m.x), y: Math.round(m.y), heal: Math.round(dmg * B.swoop.heal) });
            stop = true;
          }
        }
      }
      m.moving = true;
      if (stop) {
        m.rushUntil = 0; m.moving = false; m.lastAttack = now;
        if (kind === "pounce") {
          const P = B.pounce;
          heroes((_dx, _dy, d) => d <= P.radius, (pid, _p, dx, dy, d) => this.damagePlayer(pid, dmgOf(P.dmgMult), `${name}'s Pounce`, away(dx, dy, d), P.knockback, { atkLevel: m.level, from: id }));
          this.broadcast("bhit", { id, kind, x: Math.round(m.x), y: Math.round(m.y), r: P.radius });
        } else if (kind !== "swoop" || !m.rushHit.length) this.broadcast("bhit", { id, kind, x: Math.round(m.x), y: Math.round(m.y) });
        m.rushHit = [];
      }
      return true;
    }

    // ---- a move landing
    if (m.specialAt && m.specialKind.startsWith("b:")) {
      if (now < m.specialAt) return true;
      const kind = m.specialKind.slice(2) as BeastMove;
      m.specialAt = 0; m.specialKind = ""; m.winding = false; m.lastAttack = now;
      const x = Math.round(m.x), y = Math.round(m.y);
      const rush = (ms: number, tx: number, ty: number, speed?: number) => {
        const dx = tx - m.x, dy = ty - m.y, d = Math.max(1, Math.hypot(dx, dy));
        const sp = speed ?? d / (ms / 1000);
        m.aimX = dx / d; m.aimY = dy / d; m.rushVX = m.aimX * sp; m.rushVY = m.aimY * sp;
        m.rushUntil = now + ms; m.rushKind = kind; m.rushHit = []; m.rushTurn = kind === "stampede" ? now + ms * 0.45 : 0;
        facing(tx, ty);
        this.broadcast("brush", { id, kind, ms, ax: m.aimX, ay: m.aimY });
      };
      switch (kind) {
        case "gore": rush(B.gore.rushMs, m.x + m.aimX * B.gore.reach, m.y + m.aimY * B.gore.reach); break;
        case "stampede": rush(B.stampede.rushMs, m.x + m.aimX * B.stampede.reach, m.y + m.aimY * B.stampede.reach); break;
        case "pounce": rush(B.pounce.rushMs, m.castX, m.castY); break;
        case "swoop": rush(B.swoop.rushMs, t ? t.x : m.castX, t ? t.y : m.castY, (t ? Math.max(dist, 40) : 80) / (B.swoop.rushMs / 1000) * 1.15); break;
        case "web": {
          const W = B.web, tx = m.castX, ty = m.castY, level = m.level, dmg = dmgOf(W.dmgMult);
          this.broadcast("bshot", { id, kind, x0: x, y0: y - 8, x: Math.round(tx), y: Math.round(ty), ms: W.flightMs, r: W.radius });
          this.host.later(W.flightMs, () => this.state.players.forEach((p, pid) => {
            if (p.dead || Math.hypot(p.x - tx, p.y - ty) > W.radius) return;
            this.damagePlayer(pid, dmg, `${name}'s Web`, [0, 0], 0, { atkLevel: level, from: id, stunMs: W.rootMs, slowMs: W.rootMs + 800 });
          }));
          break;
        }
        case "screech": case "maul": {
          const C = kind === "screech" ? B.screech : B.maul, cos = Math.cos(C.halfAngle);
          heroes((dx, dy, d) => d <= C.reach && (d < 8 || (dx * m.aimX + dy * m.aimY) / d >= cos), (pid, _p, dx, dy, d) => {
            if (kind === "screech") this.damagePlayer(pid, dmgOf(C.dmgMult), `${name}'s Screech`, away(dx, dy, d), 0.5, { atkLevel: m.level, from: id, slowMs: B.screech.slowMs });
            else this.damagePlayer(pid, dmgOf(C.dmgMult), `${name}'s Maul`, away(dx, dy, d), B.maul.knockback, { atkLevel: m.level, from: id });
          });
          this.broadcast("bhit", { id, kind, x, y, ax: m.aimX, ay: m.aimY, reach: C.reach, half: C.halfAngle });
          break;
        }
        case "stomp": case "roar": {
          const R = kind === "stomp" ? B.stomp : B.roar;
          heroes((_dx, _dy, d) => d <= R.radius, (pid, _p, dx, dy, d) => {
            if (kind === "stomp") this.damagePlayer(pid, dmgOf(R.dmgMult), `${name}'s Stomp`, away(dx, dy, d), B.stomp.knockback, { atkLevel: m.level, from: id, stunMs: B.stomp.stunMs });
            else this.damagePlayer(pid, dmgOf(R.dmgMult), `${name}'s Roar`, away(dx, dy, d), 1.2, { atkLevel: m.level, from: id, slowMs: B.roar.slowMs });
          });
          this.broadcast("bhit", { id, kind, x, y, r: R.radius });
          break;
        }
        case "beam": {
          // a lance of sunlight down the marked lane
          const L = B.beam, w = L.width / 2 + 6;
          heroes((dx, dy) => { const along = dx * m.aimX + dy * m.aimY, side = Math.abs(dx * -m.aimY + dy * m.aimX); return along >= -6 && along <= L.reach && side <= w; },
            (pid) => this.damagePlayer(pid, dmgOf(L.dmgMult), `${name}'s Sunlance`, [m.aimX, m.aimY], L.knockback, { atkLevel: m.level, from: id, mobEl: "fire" }));
          this.broadcast("bhit", { id, kind, x, y, x2: Math.round(m.x + m.aimX * L.reach), y2: Math.round(m.y + m.aimY * L.reach), w: L.width });
          break;
        }
        case "flare": {
          const F = B.flare;
          heroes((_dx, _dy, d) => d <= F.radius, (pid, _p, dx, dy, d) => this.damagePlayer(pid, dmgOf(F.dmgMult), `${name}'s Flare`, away(dx, dy, d), F.knockback, { atkLevel: m.level, from: id, mobEl: "fire" }));
          this.broadcast("bhit", { id, kind, x, y, r: F.radius });
          break;
        }
        case "sunfall": {
          const R = B.sunfall, dmg = dmgOf(R.dmgMult);
          for (const [px, py] of m.pools) heroes((dx, dy) => Math.hypot(dx + m.x - px, dy + m.y - py) <= R.radius, (pid) =>
            this.damagePlayer(pid, dmg, `${name}'s Sunfall`, [0, 0], 0, { atkLevel: m.level, from: id, mobEl: "fire" }));
          this.broadcast("bhit", { id, kind, pts: m.pools.map(([a, b]) => [Math.round(a), Math.round(b)]), r: R.radius });
          m.pools = [];
          break;
        }
        case "zenith": {
          // noon over the whole plateau: only her shadow is safe, and each adept still singing makes it hotter
          const Z = B.zenith;
          let choir = 0;
          this.state.mobs.forEach((c) => { if (c.mother === id && !c.dead) choir++; });
          const dmg = dmgOf(Z.dmgMult * (1 + Z.perAdept * choir));
          heroes((_dx, _dy, d) => d > Z.inner && d <= Z.radius, (pid, _p, dx, dy, d) =>
            this.damagePlayer(pid, dmg, `${name}'s Zenith`, away(dx, dy, d), 1.5, { atkLevel: m.level, from: id, mobEl: "fire" }));
          this.broadcast("bhit", { id, kind, x, y, r: Z.radius, inner: Z.inner, choir });
          break;
        }
        case "rockfall": {
          const R = B.rockfall, dmg = dmgOf(R.dmgMult);
          for (const [px, py] of m.pools) heroes((dx, dy) => Math.hypot(dx + m.x - px, dy + m.y - py) <= R.radius, (pid) =>
            this.damagePlayer(pid, dmg, `${name}'s Falling Stones`, [0, 0], 0, { atkLevel: m.level, from: id, stunMs: 400 }));
          this.broadcast("bhit", { id, kind, pts: m.pools.map(([a, b]) => [Math.round(a), Math.round(b)]), r: R.radius });
          m.pools = [];
          break;
        }
        case "hook": {
          // the hooked gut line bites into the hero, and she hauls them in to her claws
          const H = B.hook, p = this.state.players.get(m.hookHero);
          if (!p || p.dead || isSafeZone(p.x, p.y)) break;
          const d0 = Math.hypot(p.x - m.x, p.y - m.y);
          if (d0 > H.max * 1.3) break; // slipped out of reach
          this.broadcast("bhit", { id, kind, x, y, tx: Math.round(p.x), ty: Math.round(p.y), hero: m.hookHero });
          this.damagePlayer(m.hookHero, dmgOf(H.dmgMult), `${name}'s Hook`, [0, 0], 0, { atkLevel: m.level, from: id });
          if (p.dead) break;
          const steps = Math.ceil(Math.max(0, d0 - H.stopAt) / H.pullSpeed / 0.03);
          for (let i = 0; i < steps; i++) {
            const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy);
            if (d <= H.stopAt) break;
            const k = moveStep(p.x, p.y, pushInput([dx / d, dy / d]), 0.03, H.pullSpeed);
            if (k.x === p.x && k.y === p.y) break; // caught on a wall
            p.x = k.x; p.y = k.y;
          }
          break;
        }
        case "gather": {
          // every child of hers in reach is pulled back into her hide: it dies, she mends
          const G = B.gather, pts: [number, number][] = [];
          this.state.mobs.forEach((c, cid) => {
            if (c.mother !== id || c.dead || Math.hypot(c.x - m.x, c.y - m.y) > G.range) return;
            pts.push([Math.round(c.x), Math.round(c.y)]);
            c.dead = true; c.hp = 0;
            this.clock.setTimeout(() => this.state.mobs.delete(cid), 500);
          });
          const heal = Math.round(m.maxHp * G.heal * pts.length);
          m.hp = Math.min(m.maxHp, m.hp + heal);
          this.broadcast("bhit", { id, kind, x, y, pts, heal });
          break;
        }
        case "howl": case "brood": {
          const H = kind === "howl" ? B.howl : B.brood, pts: [number, number][] = [];
          let mine = 0;
          this.state.mobs.forEach((c) => { if (c.mother === id && !c.dead) mine++; });
          for (const k of (BEAST_BROOD[m.kind] ?? (kind === "howl" ? B.howl.summon : B.brood.kinds))) {
            if (mine >= H.max) break;
            const c = this.raiseKin(m, id, k, H.levelDrop);
            if (c) { pts.push([Math.round(c.x), Math.round(c.y)]); mine++; }
          }
          if (kind === "howl") {
            // every beast in earshot is driven wild for a while (faster, harder blows)
            const until = now + B.howl.rallyMs;
            for (const [, c] of this.state.mobs.inBox(m.x, m.y, B.howl.range)) if (!c.dead && (BEAST_KINDS.includes(c.kind) || HIDEKIN_KINDS.includes(c.kind)) && Math.hypot(c.x - m.x, c.y - m.y) <= B.howl.range) c.rallyUntil = until;
          }
          this.broadcast("bhit", { id, kind, x, y, pts, r: kind === "howl" ? B.howl.range : 0 });
          break;
        }
      }
      return true;
    }

    // ---- pick a move
    if (!t || m.broken || m.windUntil || m.stunned || m.specialAt) return false;
    const frac = m.hp / Math.max(1, m.maxHp);
    let mine = -1;
    const kin = () => { if (mine < 0) { mine = 0; this.state.mobs.forEach((c) => { if (c.mother === id && !c.dead) mine++; }); } return mine; };
    const wind = (kind: BeastMove, ms: number, extra: Record<string, unknown>) => {
      m.specialKind = `b:${kind}`; m.specialAt = now + ms; m.winding = true;
      this.broadcast("bwind", { id, kind, ms, x: Math.round(m.x), y: Math.round(m.y), ...extra });
    };
    const aimAt = (x: number, y: number) => { const d = Math.max(0.1, Math.hypot(x - m.x, y - m.y)); m.aimX = (x - m.x) / d; m.aimY = (y - m.y) / d; facing(x, y); };
    for (const kind of BEAST_MOVES[m.kind]!) {
      const C = B[kind] as { cooldownMs?: number; everyMs?: number };
      const cd = C.cooldownMs ?? C.everyMs ?? 6000;
      const next = m.bcd[kind];
      if (next === undefined) { m.bcd[kind] = now + cd * (0.25 + Math.random() * 0.5); continue; } // not all at once when it first sees you
      if (now < next) continue;
      let ok = true;
      switch (kind) {
        case "gore": case "stampede": {
          const G = B[kind];
          if (dist < G.min || dist > G.max) { ok = false; break; }
          aimAt(t.x, t.y);
          wind(kind, G.windupMs, { x2: Math.round(m.x + m.aimX * G.reach), y2: Math.round(m.y + m.aimY * G.reach), w: G.width });
          break;
        }
        case "pounce": case "swoop": case "web": {
          const P = B[kind];
          if (dist < P.min || dist > P.max) { ok = false; break; }
          m.castX = t.x; m.castY = t.y; aimAt(t.x, t.y);
          wind(kind, P.windupMs, kind === "swoop" ? {} : { tx: Math.round(t.x), ty: Math.round(t.y), r: (P as { radius: number }).radius });
          break;
        }
        case "screech": case "maul": {
          const C2 = B[kind];
          if (dist > C2.range) { ok = false; break; }
          aimAt(t.x, t.y);
          wind(kind, C2.windupMs, { ax: m.aimX, ay: m.aimY, reach: C2.reach, half: C2.halfAngle });
          break;
        }
        case "stomp": case "roar": {
          const R = B[kind];
          if (dist > R.range) { ok = false; break; }
          wind(kind, R.windupMs, { r: R.radius });
          break;
        }
        case "howl": {
          if (dist > B.howl.range) { ok = false; break; }
          wind(kind, B.howl.castMs, { r: B.howl.range });
          break;
        }
        case "brood": {
          if (frac >= (m.kind === "hidemother" ? URSK.phase[0] : m.kind === "sunwright" ? SUNWRIGHT.phase[0] : B.brood.hpFrac) || kin() >= B.brood.max) { ok = false; break; }
          wind(kind, B.brood.castMs, {});
          break;
        }
        case "hook": {
          // the hero farthest from her (but in range) gets the hook
          if (frac >= B.hook.hpFrac) { ok = false; break; }
          let far = "", fd = 0, fx = 0, fy = 0;
          this.state.players.forEach((p, pid) => {
            if (p.dead || isSafeZone(p.x, p.y)) return;
            const d = Math.hypot(p.x - m.x, p.y - m.y);
            if (d >= B.hook.min && d <= B.hook.max && d > fd) { far = pid; fd = d; fx = p.x; fy = p.y; }
          });
          if (!far) { ok = false; break; }
          m.hookHero = far; aimAt(fx, fy);
          wind(kind, B.hook.windupMs, { tx: Math.round(fx), ty: Math.round(fy), hero: far });
          if (Math.random() < 0.6) this.bossSay(id, URSK.lines.hook);
          break;
        }
        case "gather": {
          if (frac >= B.gather.hpFrac) { ok = false; break; }
          let near = 0;
          this.state.mobs.forEach((c) => { if (c.mother === id && !c.dead && Math.hypot(c.x - m.x, c.y - m.y) <= B.gather.range) near++; });
          if (!near) { ok = false; break; }
          wind(kind, B.gather.castMs, { r: B.gather.range });
          this.bossSay(id, URSK.lines.gather);
          break;
        }
        case "beam": {
          const L = B.beam;
          if (dist < L.min || dist > L.max) { ok = false; break; }
          aimAt(t.x, t.y);
          wind(kind, L.windupMs, { x2: Math.round(m.x + m.aimX * L.reach), y2: Math.round(m.y + m.aimY * L.reach), w: L.width });
          break;
        }
        case "flare": {
          // only when someone is crowding her
          if (dist > B.flare.range) { ok = false; break; }
          wind(kind, B.flare.windupMs, { r: B.flare.radius });
          break;
        }
        case "zenith": {
          if (frac >= B.zenith.hpFrac) { ok = false; break; }
          wind(kind, B.zenith.windupMs, { r: B.zenith.radius, inner: B.zenith.inner });
          this.bossSay(id, SUNWRIGHT.lines.zenith);
          break;
        }
        case "sunfall": {
          const R = B.sunfall, count = m.uPhase >= 3 ? SUNWRIGHT.sun.sunfallCount : R.count;
          if (dist > R.range) { ok = false; break; }
          m.pools = [[t.x, t.y]];
          this.state.players.forEach((p) => { if (p !== t && !p.dead && m.pools.length < count && Math.hypot(p.x - m.x, p.y - m.y) <= R.range) m.pools.push([p.x, p.y]); });
          while (m.pools.length < count) {
            const a = Math.random() * Math.PI * 2, r = R.spread * (0.6 + Math.random() * 0.8);
            m.pools.push([t.x + Math.cos(a) * r, t.y + Math.sin(a) * r * 0.8]);
          }
          wind(kind, R.windupMs, { pts: m.pools.map(([a, b]) => [Math.round(a), Math.round(b)]), r: R.radius });
          break;
        }
        case "rockfall": {
          const R = B.rockfall;
          if (frac >= R.hpFrac || dist > R.range) { ok = false; break; }
          // under the target and the heroes near her, and a few stones at random round them
          m.pools = [[t.x, t.y]];
          this.state.players.forEach((p) => { if (p !== t && !p.dead && m.pools.length < R.count && Math.hypot(p.x - m.x, p.y - m.y) <= R.range) m.pools.push([p.x, p.y]); });
          while (m.pools.length < R.count) {
            const a = Math.random() * Math.PI * 2, r = R.spread * (0.6 + Math.random() * 0.6);
            m.pools.push([t.x + Math.cos(a) * r, t.y + Math.sin(a) * r * 0.8]);
          }
          wind(kind, R.windupMs, { pts: m.pools.map(([a, b]) => [Math.round(a), Math.round(b)]), r: R.radius });
          break;
        }
      }
      if (!ok) continue;
      m.bcd[kind] = now + (kind === "sunfall" && m.uPhase >= 3 ? cd * SUNWRIGHT.sun.sunfallCd : cd);
      return true;
    }
    return false;
  }

  private updateProjectile(s: Projectile, id: string, dt: number) {
    // Sub-step so fast shots never skip over a target or a thin wall
    const total = s.speed * dt;
    const steps = Math.max(1, Math.ceil(total / 4));
    for (let i = 0; i < steps; i++) {
      const px = s.x, py = s.y;
      s.x += (s.vx * total) / steps;
      s.y += (s.vy * total) / steps;
      s.traveled += total / steps;
      if (s.traveled >= s.range) return this.explode(s, id);
      if (isSolidAt(s.x, s.y)) { if (this.bounce(s, px, py)) continue; return this.explode(s, id); }
      if (this.holes && this.holeEats(s)) { this.state.projectiles.delete(id); this.broadcast("sfx", { ev: "eatshot", x: Math.round(s.x), y: Math.round(s.y) }); return; }
      const pulse = s.spec?.pulse;
      if (pulse && s.traveled - s.pulsed >= pulse.every) { s.pulsed = s.traveled; shotPulse(this.host, s.spec!, s.x, s.y); }
      if (s.mobLevel > 0) {
        // A monster's shot only hits players, once: it is used up on the first player it can hurt.
        // (It used to stay alive unless the hit was a kill, so it pushed and hurt the player every tick.)
        const now = Date.now();
        let pid = "";
        this.state.players.forEach((p, k) => {
          if (!pid && !p.dead && !isSafeZone(p.x, p.y) && now >= p.invulnUntil && Math.hypot(p.x - s.x, p.y - s.y) <= s.radius + HIT_RADIUS && (!s.troop || this.warTroops.stance(s.troop, k) === "enemy")) pid = k;
        });
        if (pid) {
          if (this.steamMissed(s.owner, pid)) return this.explode(s, id); // Steam: the shot goes wide
          this.damagePlayer(pid, s.damage, s.mobName, [s.vx, s.vy], 0.5, { atkLevel: s.mobLevel, mobEl: s.mobEl, troop: s.troop });
          return this.explode(s, id, pid);
        }
        continue;
      }
      // Monsters are hit on their body: big ones are wider than a hero (HIT_RADIUS)
      const hit = this.firstTargetAt(s.x, s.y, s.radius + HIT_RADIUS, s.owner, s.hitIds, (m) => Math.max(0, mobBody(m.kind) - HIT_RADIUS));
      if (hit) {
        if (s.spec) shotHit(this.host, s.spec, hit);
        else this.hitTarget(s.owner, hit, s.damage, [s.vx, s.vy], { kb: s.knockback, basic: s.basic, parts: s.parts, sound: s.sound });
        // Piercing arrows keep flying through a few targets
        if (s.pierce > 0) { s.pierce--; s.hitIds.add(hit); continue; }
        return this.explode(s, id, hit);
      }
    }
  }

  /** A wave ran into a wall: it may bounce off it (server/songs.ts bounceWave). */
  private bounce(s: Projectile, px: number, py: number): boolean {
    return bounceWave(s, px, py, (ev) => this.broadcast("sfx", ev));
  }

  private explode(s: Projectile, id: string, _directHit = "") {
    this.broadcast("boom", { x: s.x, y: s.y, r: s.spec?.explode ?? s.burst, kind: s.kind, imb: s.imb || undefined });
    this.state.projectiles.delete(id);
    // The Summoner's finisher bursts: the other foes close by take half of it, in the same elements
    if (s.burst > 0 && !s.mobLevel) for (const e of this.host.enemies(s.x, s.y, s.burst, s.owner)) {
      if (e === _directHit) continue;
      const t = this.state.players.get(e) ?? this.state.mobs.get(e);
      if (!t) continue;
      const d = Math.hypot(t.x - s.x, t.y - s.y) || 1;
      this.hitTarget(s.owner, e, s.damage * 0.5, [(t.x - s.x) / d, (t.y - s.y) / d], { kb: s.knockback * 0.5, basic: true, parts: s.parts?.map((p) => ({ ...p, amt: p.amt * 0.5 })), sound: s.sound });
    }
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
    for (let i = kind === "hollowking" || kind === "sunwright" ? 3 : 1; i > 0; i--) {
      const gear = rollGear(kind, level);
      if (gear) this.dropItem("gear", x, y, 1, gear);
    }
    // Songweaver materials lie on the ground too (shared/lutemaker.ts, LOOT[kind].mats)
    for (const m of rollMats(def.mats)) this.dropItem("mat", x, y, m.n, matItemId(m.mat));
    // Runes (shared/runes.ts) lie on the ground like gear
    const rune = rollMobRune(GEAR_DROP[kind]?.chance ?? 0, level);
    if (rune) this.dropItem("gear", x, y, 1, rune);
  }

  /** What a champion leaves on top of its normal loot (shared/champions.ts CHAMPION): gear rolls, potions, a rune. */
  private champLoot(m: Mob) {
    for (let i = 0; i < CHAMPION.gearRolls; i++) { const g = rollGear(m.kind, m.level); if (g) this.dropItem("gear", m.x, m.y, 1, g); }
    for (let i = 0; i < CHAMPION.potions; i++) this.dropItem("potion", m.x, m.y, 1, String(dropSize(m.level)));
    const rune = this.champs.loot(m);
    if (rune) this.dropItem("gear", m.x, m.y, 1, rune);
  }

  private pickUp(p: Player, pid: string) {
    this.state.items.forEach((it, id) => {
      if (Math.hypot(it.x - p.x, it.y - p.y) > (it.kind === "gold" ? GOLD_PICKUP_RADIUS : PICKUP_RADIUS)) return;
      if (it.kind === "quest") {
        if (it.owner !== pid) return; // someone else's quest drop
        this.state.items.delete(id);
        const c = CHAINS.findIndex((_, i) => { const s = questStep(chainState(p, i)); return s?.type === "collect" && s.item === it.gear; });
        if (c < 0) return; // left over from an earlier step
        this.clients.find((cl) => cl.sessionId === pid)?.send("pickup", { kind: it.kind, amount: 1, x: it.x, y: it.y, gear: it.gear, name: "" });
        this.questProgress(pid, p, c, this.qs(p, c).questCount + 1);
        return;
      }
      if (it.kind === "mat") { // a Songweaver's material (DI-5): into her counters, nobody else picks it up
        const got = pickMat(p, it.gear, it.amount, this.songs);
        if (!got?.n) return;
        this.state.items.delete(id);
        this.broadcast("sfx", { ev: "matpick", id: pid, mat: got.mat, n: got.n, x: Math.round(it.x), y: Math.round(it.y) });
        this.sendSongbook(pid, p);
        return;
      }
      if (it.kind === "potion" || it.kind === "mpotion") {
        if (this.addPotions(p, it.kind, potSize(it.gear), it.amount) < it.amount) return; // no room in the bag: leave it on the ground
      } else if (it.kind === "gear") {
        if (this.bagFull(p) || !isBagItem(it.gear)) return; // bag full: leave it
        const f = this.lootFilters.get(pid);
        if (f && !passesFilter(f, p.cls, it.gear)) return; // the hero's loot filter skips it (side panel, Inventory tab)
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
    // No cooldown, no limit: every press drinks one and heals its full amount at once (Murat 2026-11-07)
    if (!p || p.dead || p.hp >= p.maxHp) return;
    const heal = this.drink(p, "potion");
    if (!heal) return;
    p.hp = Math.min(p.maxHp, p.hp + heal);
    this.broadcast("heal", { id, amount: heal });
  }

  /** Mana potion (V): the smallest one carried, a fixed amount of mana (shared/potions.ts). */
  private drinkManaPotion(id: string) {
    const p = this.state.players.get(id);
    const now = Date.now();
    if (!p || p.dead) return;
    // the Songweaver's bubble is a song gauge (DI-3): a potion does nothing for it, so none is drunk
    if (usesGauge(p.cls)) { this.clients.find((c) => c.sessionId === id)?.send("gearno", { text: SONG_POTION_TEXT }); return; }
    if (p.mana >= p.maxMana || now - p.lastManaPotion < POTION_COOLDOWN_MS) return;
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
    if (!p || p.dead || p.stunned || now - p.lastDodge < DODGE.cooldownMs || isOverheated(p)) return;
    addHeat(p, OVERLOAD.dodge);
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
    if (!(p.ptSta || p.ptStr || p.ptMag || p.ptDex)) return;
    if (!this.payReset(id, p, "stat points")) return;
    p.ptSta = p.ptStr = p.ptMag = p.ptDex = 0;
    this.applyStats(p);
  }

  /** Takes the reset fee (shared/upkeep.ts respecCost); false with a note when the hero can't pay. */
  private payReset(id: string, p: Player, what: string): boolean {
    const cost = cityPrice(respecCost(p.level), cityRoleNear("trainer", p.x, p.y), p.clan); // less beside a capital's trainer for its clan's sworn
    if (p.gold < cost) { this.note(id, `Resetting your ${what} costs ${cost} gold at level ${p.level}. You have ${p.gold}.`); return false; }
    if (cost) { p.gold -= cost; this.note(id, `Your ${what} are reset (${cost} gold).`); }
    return true;
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
    for (let pass = 0; pass < topRank(p.cls); pass++) for (const sk of classSkills(p.cls)) this.learnTalent(client.sessionId, sk.id);
    // Every stat point the level gives, spread evenly over the 4 stats (points already placed are reset first)
    const pts = statPoints(p.level), each = Math.floor(pts / 4), left = pts % 4;
    p.ptSta = each + (left > 0 ? 1 : 0); p.ptStr = each + (left > 1 ? 1 : 0); p.ptMag = each + (left > 2 ? 1 : 0); p.ptDex = each;
    p.pots = { potion: [0, 0, 10], mpotion: [0, 0, 10] };
    this.syncPotions(p);
    p.gold = Math.max(p.gold, 1000000); // enough to try the masterwork gear (up to 100 000 a piece)
    this.applyStats(p);
    if (!p.dead) p.hp = p.maxHp;
    if (p.level > from) this.broadcast("levelup", { id: client.sessionId, level: p.level, from });
    client.send("chat", { id: "", name: "Test", text: `Level ${p.level}, every skill at max rank, ${pts} stat points spread over all stats.` });
  }

  /**
   * Skill clip capture (tools/skill-clips/capture.mjs): the hero stands rested on an open meadow (CAPTURE_SPOT) with
   * fresh cooldowns, mana and no buffs, every other monster around is cleared and three blobs wait in front of him.
   * They hold a lot of life so they live through the clip; `weak` leaves them low for Devour and Bite.
   */
  private stageCapture(id: string, weak: boolean) {
    const p = this.state.players.get(id);
    if (!p) return;
    const [tx, ty] = CAPTURE_SPOT, x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    p.x = x - 1.5 * TILE; p.y = y; p.dead = false; p.hp = p.maxHp; p.mana = usesGauge(p.cls) ? 0 : p.maxMana; p.energy = 0; this.syncMana(p);
    p.sk.last = {}; p.sk.buffs = []; p.sk.counter = undefined; p.sk.chargeUntil = 0; p.sk.windUntil = 0;
    this.state.fields.forEach((f, fid) => { if (f.owner === id) this.state.fields.delete(fid); }); // the last clip's black hole, pools...
    this.state.mobs.forEach((m, mid) => {
      if (m.owner || Math.hypot(m.x - x, m.y - y) > 14 * TILE) return;
      m.dead = true; m.hp = 0; m.target = ""; m.moving = false;
      this.clock.setTimeout(() => { this.state.mobs.delete(mid); this.dummies.delete(mid); }, 300);
    });
    for (const [dx, dy] of [[0.8, 0], [1.6, -1], [1.6, 1]]) {
      const mid = `m${++this.mobSeq}`;
      this.spawnMob("slime", -1, mid, { x: x + dx * TILE, y: y + dy * TILE, level: p.level });
      const m = this.state.mobs.get(mid);
      if (m) { m.maxHp = 1_000_000; m.hp = weak ? 2000 : m.maxHp; this.dummies.add(mid); }
    }
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
      if (free >= 0) p.slots[free] = tid;
    }
    this.applyStats(p);
  }

  private cast(id: string, skill: string) {
    const p = this.state.players.get(id);
    if (!p || typeof skill !== "string" || p.rolling || p.qlock) return; // qlock: hands full with a quest lantern (server/questSteps.ts)
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
    if (def && skillLearned(p.cls, p.talents, skill) && bloodCost(def, p) > 0 && p.hp <= bloodCost(def, p) + 1) {
      // Blood magic with too little life left to pay for it
      const now = Date.now();
      if (now - p.lastWeaponNo > 1000) { p.lastWeaponNo = now; this.clients.find((c) => c.sessionId === id)?.send("gearno", { text: `Too little blood left for ${def.name}` }); }
      return;
    }
    const fang = def && skillLearned(p.cls, p.talents, skill) ? def.devour ?? def.bite : undefined;
    if (fang && !fangTarget(this.host, id, fang.range)) {
      // Devour / Bite with nothing that has flesh in reach (skeletons and golems have none)
      const now = Date.now();
      if (now - p.lastWeaponNo > 1000) { p.lastWeaponNo = now; this.clients.find((c) => c.sessionId === id)?.send("gearno", { text: def!.devour ? "Nothing to eat here" : "Nothing to bite here" }); }
      return;
    }
    // No magic in Oakvale, but a Songweaver may busk (server/songs.ts busking); a finisher the cast set off counts too,
    // also one a charged note completes when it goes off
    const lawful = (chord?: string) => { if (!p.outlaw && inVillage(p.x, p.y) && !busking(p.cls, p.sk.mode, def!, chord)) this.setOutlaw(id, p, true); };
    const out: CastOut = { onChord: lawful };
    if (castSkill(this.host, id, skill, out)) {
      p.emote = "";
      this.runesOnCast(id, p);
      this.questDo(id, "cast");
      lawful(out.chord);
      // ...and the villagers close by answer a bright tune (a chat line from the NPC, id "npc:<id>", to heroes nearby)
      this.buskers.heard(p.cls, p.sk.mode, def!, p.x, p.y, Date.now(), (n, text) => this.npcSay(n, id, text), out.chord);
      // a Chorus can earn a song: Odo hears a bright one, Mirror Pond's shore takes any (server/songs.ts SongCollector)
      for (const sd of this.songs.chorus(p, def!, p.sk.mode ?? "major", p.x, p.y, Date.now(), (npc, text) => { const n = npcById(npc); if (n) this.npcSay(n, id, text); }))
        this.songLearned(id, p, sd.id);
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
    if (!p || typeof n !== "number" || n < 0 || n >= SLOT_COUNT || p.qlock) return;
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
    if (skill) for (let i = 0; i < SLOT_COUNT; i++) if (p.slots.at(i) === skill) p.slots[i] = "";
    p.slots[msg.slot] = skill;
  }

  /** Free reset of all skill points, only out of combat. */
  private respec(id: string) {
    const p = this.state.players.get(id);
    if (!p || p.dead || Date.now() - p.lastHurt < 5000) return;
    if (!p.talents.size) return;
    if (!this.payReset(id, p, "skill points")) return;
    p.talents.clear();
    afterRespec(p as unknown as Unit); // the Songweaver's mode and song (server/songs.ts)
    for (let i = 0; i < SLOT_COUNT; i++) p.slots[i] = "";
    this.applyStats(p);
  }

  // ---- Equipment ----------------------------------------------------------

  /** Fills the empty slots with the class's starting kit (shared/gear.ts starterKit); kit items already carried are not doubled. */
  private wearKit(p: Player) {
    const have = new Set([...GEAR_SLOTS.map((s) => p[s]), ...bagItems(p)].map((id) => baseId(id ?? ""))); // a levelled lute is still the lute
    for (const [slot, id] of Object.entries(starterKit(p.cls)) as [GearSlot, string][]) if (!p[slot] && !have.has(id)) p[slot] = id;
  }

  /** Worn items that count (requirements met, see shared/gear.ts activeGear). */
  private equipped(p: Player): Equipped {
    return activeGear(Object.fromEntries(GEAR_SLOTS.map((s) => [s, p[s]])), this.reqInfo(p));
  }

  private reqInfo(p: Player): HeroReqInfo {
    return { cls: p.cls, level: p.level, pts: { sta: p.ptSta, str: p.ptStr, mag: p.ptMag, dex: p.ptDex }, worn: Object.fromEntries(GEAR_SLOTS.map((s) => [s, p[s]])) };
  }

  /** Wear the bag item at index `i`; whatever was in that slot goes back to the bag. */
  private equip(id: string, i: number) {
    const p = this.state.players.get(id);
    if (!p || typeof i !== "number" || i < 0 || i >= p.bag.length) return;
    const gid = p.bag.at(i), def = gid ? gearDef(gid) : undefined;
    if (!gid || !def) return;
    const no = wearProblem(p.cls, gid); // a kit of another class, the Songweaver's musical-only rule
    if (no) { this.clients.find((c) => c.sessionId === id)?.send("gearno", { text: no }); return; }
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

  // ---- Runes (shared/runes.ts) ----
  /** Set the loose rune at bag index `rune` into a worn item (`slot`) or another bag item (`item`). */
  private socketRune(client: Client, m: { rune?: number; slot?: GearSlot; item?: number }) {
    const p = this.state.players.get(client.sessionId);
    if (!p || p.dead || !m || !Number.isInteger(m.rune)) return;
    const items = [...bagItems(p)];
    const ri = m.rune!, r = ri >= 0 && ri < items.length ? parseRune(items[ri]) : undefined;
    if (!r) return;
    const worn = typeof m.slot === "string" && GEAR_SLOTS.includes(m.slot) ? m.slot : undefined;
    const bi = !worn && Number.isInteger(m.item) && m.item! >= 0 && m.item! < items.length && m.item !== ri ? m.item! : -1;
    const target = worn ? p[worn] : bi >= 0 ? items[bi] : "";
    if (!target || !gearDef(target)) return;
    const why = socketProblem(target, r);
    if (why) { client.send("gearno", { text: why }); return; }
    const next = withRunes(target, [...itemRunes(target), r]);
    if (worn) p[worn] = next; else items[bi] = next;
    items.splice(ri, 1);
    setBag(p, items);
    if (worn) this.applyStats(p);
    client.send("runeset", { name: runeIdName(runeId(r.key, r.rank)), on: true });
  }

  /** Take rune `n` out of a worn item or bag item: it goes back to the bag whole. */
  private unsocketRune(client: Client, m: { slot?: GearSlot; item?: number; n?: number }) {
    const p = this.state.players.get(client.sessionId);
    if (!p || p.dead || !m || !Number.isInteger(m.n)) return;
    if (this.bagFull(p)) { client.send("gearno", { text: "No room in your bag for the rune" }); return; }
    const items = [...bagItems(p)];
    const worn = typeof m.slot === "string" && GEAR_SLOTS.includes(m.slot) ? m.slot : undefined;
    const bi = !worn && Number.isInteger(m.item) && m.item! >= 0 && m.item! < items.length ? m.item! : -1;
    const target = worn ? p[worn] : bi >= 0 ? items[bi] : "";
    const runes = target ? itemRunes(target) : [];
    const r = runes[m.n!];
    if (!r) return;
    runes.splice(m.n!, 1);
    const next = withRunes(target, runes);
    if (worn) p[worn] = next; else items[bi] = next;
    items.push(runeId(r.key, r.rank));
    setBag(p, items);
    if (worn) this.applyStats(p);
    client.send("runeset", { name: runeIdName(runeId(r.key, r.rank)), on: false });
  }

  /** Rune effects of a hero's worn items that count (cached per worn set). */
  private runeCache = new Map<string, { sig: string; fx: ReturnType<typeof runeEffects> }>();
  private runesOf(id: string, p: Player) {
    const sig = GEAR_SLOTS.map((s) => p[s]).join("|") + `|${p.level}|${p.ptSta},${p.ptStr},${p.ptMag},${p.ptDex}`;
    const hit = this.runeCache.get(id);
    if (hit && hit.sig === sig) return hit.fx;
    const fx = sig.includes("^") ? runeEffects(this.equipped(p)) : {};
    this.runeCache.set(id, { sig, fx });
    return fx;
  }

  private runeReady = new Map<string, number>();
  /** Rolls rune `key` for hero `id`: true when it fires (chance, then its own short cooldown). */
  private runeRoll(id: string, p: Player, key: RuneKey): number {
    const e = this.runesOf(id, p)[key];
    if (!e) return 0;
    const now = Date.now(), k = `${id}:${key}`;
    if (now < (this.runeReady.get(k) ?? 0) || Math.random() >= e.chance) return 0;
    this.runeReady.set(k, now + RUNES[key].icdMs);
    return e.power;
  }

  private runeFx(k: RuneKey, x: number, y: number, extra: Record<string, unknown> = {}) {
    this.broadcast("rune", { k, x: Math.round(x), y: Math.round(y), ...extra });
  }

  /** Weapon runes when a hero's basic attack or skill lands on a foe (`dealt` = the hit's damage). */
  private runesOnHit(aid: string, a: Player, tid: string, dealt: number) {
    if (a.dead || dealt <= 0) return;
    const at = this.state.players.get(tid) ?? this.state.mobs.get(tid);
    if (!at) return;
    const tx = at.x, ty = at.y;
    let v: number;
    if ((v = this.runeRoll(aid, a, "ember"))) {
      this.runeFx("ember", tx, ty);
      const amt = dealt * v;
      this.host.later(80, () => { for (const o of this.targetsAround(tx, ty, 40, aid)) this.hitTarget(aid, o, amt * (this.state.mobs.has(o) ? mobAffinity(this.state.mobs.get(o)!.kind, "fire") : 1), [0, 0], { kb: 0, el: "fire", rune: true }); });
    }
    if ((v = this.runeRoll(aid, a, "rime"))) {
      this.runeFx("rime", tx, ty);
      this.host.later(40, () => this.hitTarget(aid, tid, 1, [0, 0], { kb: 0, el: "cold", rune: true, stunMs: v, slowMs: v + 800 }));
    }
    if ((v = this.runeRoll(aid, a, "venom"))) {
      this.runeFx("venom", tx, ty);
      const m = this.state.mobs.get(tid), each = (dealt * v * (m ? mobAffinity(m.kind, "poison") : 1)) / 4;
      if (each >= 0.5) for (let i = 1; i <= 4; i++) this.host.later(500 * i, () => this.hitTarget(aid, tid, each, [0, 0], { dot: true, kb: 0, el: "poison", rune: true }));
    }
    if ((v = this.runeRoll(aid, a, "storm"))) {
      // lightning leaps from the target to the nearest foes in turn
      const n = v >= 0.7 ? 4 : v >= 0.55 ? 3 : 2, hit = new Set([tid]);
      let fx = tx, fy = ty;
      this.runeFx("storm", tx, ty);
      for (let j = 0; j < n; j++) {
        let best = "", bd = 96;
        for (const [oid, o] of this.state.mobs.inBox(fx, fy, bd)) { // the starting box; it shrinks as nearer foes turn up
          if (hit.has(oid) || o.dead || o.hidden || !this.canHurtMob(aid, o) || Math.abs(o.x - fx) > bd || Math.abs(o.y - fy) > bd) continue;
          const d = Math.hypot(o.x - fx, o.y - fy);
          if (d < bd) { bd = d; best = oid; }
        }
        if (!best) break;
        const to = this.state.mobs.get(best)!;
        hit.add(best);
        this.broadcast("arc", { x0: Math.round(fx), y0: Math.round(fy), x1: Math.round(to.x), y1: Math.round(to.y) });
        const target = best, amt = dealt * v * mobAffinity(to.kind, "shock");
        this.host.later(60 * (j + 1), () => this.hitTarget(aid, target, amt, [0, 0], { kb: 0, el: "shock", rune: true }));
        fx = to.x; fy = to.y;
      }
    }
    if ((v = this.runeRoll(aid, a, "blood"))) {
      a.hp = Math.min(a.maxHp, a.hp + a.maxHp * v);
      this.runeFx("blood", a.x, a.y, { id: aid });
    }
  }

  /** Weapon runes when a hero casts a skill. */
  private runesOnCast(id: string, p: Player) {
    const v = this.runeRoll(id, p, "echo");
    if (!v) return;
    if (usesGauge(p.cls)) fillGauge(this.host, id, GAUGE.max * v); // the Songweaver's song gauge fills by the rune's share
    else p.mana = Math.min(p.maxMana, p.mana + p.maxMana * v);
    this.syncMana(p);
    this.runeFx("echo", p.x, p.y, { id });
  }

  /** Armour runes before a blow lands on a hero: the Ward rune can stop most of it. Returns the damage left. */
  private runesWard(tid: string, t: Player, dmg: number): number {
    const v = this.runeRoll(tid, t, "ward");
    if (!v) return dmg;
    this.runeFx("ward", t.x, t.y, { id: tid });
    return Math.max(1, Math.round(dmg * (1 - v)));
  }

  /** Armour runes after a blow from `from` (a monster or hero) landed on a living hero. */
  private runesStruck(tid: string, t: Player, from: string, dmg: number) {
    let v: number;
    const foe = this.state.mobs.get(from) ?? this.state.players.get(from);
    if (foe && (v = this.runeRoll(tid, t, "thorn"))) {
      this.runeFx("thorn", foe.x, foe.y);
      const amt = dmg * v;
      this.host.later(60, () => this.hitTarget(tid, from, amt, [0, 0], { kb: 0, rune: true, thorn: true }));
    }
    if (foe && (v = this.runeRoll(tid, t, "frost"))) {
      this.runeFx("frost", foe.x, foe.y);
      foe.slowUntil = Math.max(foe.slowUntil, Date.now() + v);
    }
    if ((v = this.runeRoll(tid, t, "mend"))) {
      t.hp = Math.min(t.maxHp, t.hp + t.maxHp * v);
      this.runeFx("mend", t.x, t.y, { id: tid });
    }
  }

  /** Which bound items this hero must keep (shared/gear.ts keepsBoundOf: a Songweaver's last lute and Songbook). */
  private keeps(p: Player) { return keepsBoundOf(p.cls, [p.weapon, p.shield], bagItems(p)); }

  /** Throw a bag item on the ground (anyone can pick it up). */
  private dropGear(id: string, i: number) {
    const p = this.state.players.get(id);
    if (!p || typeof i !== "number" || i < 0 || i >= p.bag.length) return;
    if (this.keeps(p)(p.bag.at(i))) return this.note(id, "That stays with you: it is bound to you."); // her lute, the Songbook
    const items = [...bagItems(p)];
    const [gid] = items.splice(i, 1);
    setBag(p, items);
    // Drop it out of pickup range so it isn't grabbed straight back
    const off = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.dir];
    this.dropItem("gear", p.x + off[0] * (PICKUP_RADIUS + 10), p.y + off[1] * (PICKUP_RADIUS + 10), 1, gid);
  }

  /** Throw several bag items on the ground at once (the bag's "Drop useless" button), in one bag update. */
  private dropGears(id: string, list: number[]) {
    const p = this.state.players.get(id);
    if (!p || !Array.isArray(list)) return;
    const keep = this.keeps(p), idx = new Set<number>(), gone: string[] = [];
    for (const i of list) {
      if (!Number.isInteger(i) || i < 0 || i >= p.bag.length || idx.has(i) || keep(p.bag.at(i), gone)) continue;
      idx.add(i); gone.push(p.bag.at(i)!);
    }
    if (!idx.size) return;
    const items = [...bagItems(p)];
    setBag(p, items.filter((_, i) => !idx.has(i)));
    const off = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.dir];
    for (const i of idx) this.dropItem("gear", p.x + off[0] * (PICKUP_RADIUS + 10), p.y + off[1] * (PICKUP_RADIUS + 10), 1, items[i]);
  }

  /** Throw one bag stack of potions on the ground (right-click on a potion slot in the bag): one ground item for the stack. */
  private dropPotions(id: string, m: { kind?: string; size?: number; n?: number }) {
    const p = this.state.players.get(id);
    if (!p || !m || (m.kind !== "potion" && m.kind !== "mpotion") || !Number.isInteger(m.size) || m.size! < 0 || m.size! >= SIZES) return;
    const kind: PotionKind = m.kind, size = m.size!;
    const n = Math.min(p.pots[kind][size], POTION_STACK, Number.isInteger(m.n) && m.n! > 0 ? m.n! : POTION_STACK);
    if (n <= 0) return;
    p.pots[kind][size] -= n;
    this.syncPotions(p);
    const off = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.dir];
    this.dropItem(kind, p.x + off[0] * (PICKUP_RADIUS + 10), p.y + off[1] * (PICKUP_RADIUS + 10), n, String(size));
  }

  /** Loot filters by session (not synced: only this server needs them; the client sends its own on join). */
  private lootFilters = new Map<string, LootFilter>();

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
      if (me && pvpProtected(me.level, t.level)) return; // newcomer protection (shared/combat.ts): shots pass through
      if (tid !== exclude && !t.dead && Math.hypot(t.x - x, t.y - y) <= r) out.push(tid);
    });
    // Only the monsters in the squares around (bodies < 64 px), not the thousands on the map
    for (const [mid, m] of this.state.mobs.inBox(x, y, mobPad ? r + 64 : r)) {
      if (me && !this.canHurtMob(exclude, m)) continue; // own / group / protected heroes' summons, own clan's troops
      if (!m.dead && !m.hidden && Math.hypot(m.x - x, m.y - y) <= r + (mobPad ? mobPad(m) : 0)) out.push(mid);
    }
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
  private lastDrainFx = new Map<string, number>();
  private bloodthirst(a: Player | undefined, id: string, dealt: number, drain = 0, target?: string) {
    if (!a || a.dead || dealt <= 0) return;
    const share = talentBonus(a.cls, a.talents, "lifesteal") / 100 + buffLifesteal(a, Date.now()) + drain / 100; // drain: the skill's own (vampire)
    if (share <= 0) return;
    const heal = dealt * share;
    a.hp = Math.min(a.maxHp, a.hp + heal);
    // A skill that drinks blood shows it: a red thread from the victim back to the vampire (client/src/skillfx.ts "drain")
    if (drain > 0 && target) {
      const now = Date.now();
      if (now - (this.lastDrainFx.get(id) ?? 0) >= 120) { this.lastDrainFx.set(id, now); this.broadcast("sfx", { ev: "drain", id, t: target }); }
    }
  }

  /** A player (`attackerId`) hits a player or mob. */
  private hitTarget(attackerId: string, targetId: string, dmg: number, push: [number, number], opts: HitOpts = {}) {
    const a = this.state.players.get(attackerId);
    if (a?.party && this.state.players.get(targetId)?.party === a.party) return; // group mates can't hurt each other
    const tp1 = a && this.state.players.get(targetId);
    if (a && tp1 && pvpProtected(a.level, tp1.level)) return; // newcomer protection, also for damage over time and riders
    if (opts.basic && a && basicDrain(a.cls)) opts = { ...opts, drain: (opts.drain ?? 0) + basicDrain(a.cls) }; // vampire trait
    // Elemental parts (shared/elements.ts): monsters take more or less of each, heroes resist; poison comes later
    const riders: ElemPart[] = [];
    if (opts.parts?.length) {
      const tp0 = this.state.players.get(targetId), tm0 = tp0 ? undefined : this.state.mobs.get(targetId);
      const corrode = tm0 ? corrodeBonus(tm0.react, Date.now()) : 0; // Corrosion (REACTIONS.corrode)
      let top = 0;
      for (const p of opts.parts) {
        const amt = p.amt * (tp0 ? 1 - gearResist(this.equipped(tp0), p.el) : tm0 ? mobAffinity(tm0.kind, p.el) + corrode : 1);
        if (amt <= 0) continue;
        if (p.el !== "poison") dmg += amt;
        riders.push({ el: p.el, amt });
        if (amt > top) { top = amt; opts = { ...opts, el: p.el }; }
      }
      const cold = riders.find((r) => r.el === "cold");
      if (cold) opts = { ...opts, slowMs: Math.max(opts.slowMs ?? 0, tp0 ? ELEMENT_FX.cold.heroSlowMs : ELEMENT_FX.cold.mobSlowMs) };
      opts = { ...opts, parts: undefined };
      if (riders.length) this.elementRiders(attackerId, targetId, riders);
      // Elemental reactions (shared/elements.ts REACTIONS): a hero's hit on a wild monster, never on heroes or creatures
      if (tm0 && a && !tm0.owner && !tm0.dead && riders.length) {
        const r = this.elementReaction(attackerId, targetId, tm0, riders, dmg);
        if (r) { dmg *= r.mult; if (r.poise) opts = { ...opts, poiseAdd: r.poise }; }
      }
    }
    if (a) dmg = dmg * talentMult(a.cls, a.talents, "dmg") * feastMult(a.feast, "dmg") * (opts.skill && !opts.dot ? talentMult(a.cls, a.talents, "skill") * feastMult(a.feast, "skill") : 1) * dealtMult(a, Date.now());
    const snd = opts.sound;
    if (snd) { // a Songweaver's sound: how the target hears scales it (shared/combat.ts soundMult)
      const m = soundMult(this.host.soundOf!(targetId), snd);
      dmg *= m.dmg;
      opts = { ...opts, slowMs: opts.slowMs && opts.slowMs * m.cc };
      if (a && snd.mode === "phrygian") opts = { ...opts, poiseMul: 1 + PHRYGIAN.poise * modeColour("phrygian", (k) => a.talents.get(k) ?? 0) };
    }
    dmg = Math.max(1, Math.round(dmg));
    opts = { ...opts, from: attackerId };
    const name = a?.name ?? "???";
    const kb = opts.kb ?? 1;
    const tp = this.state.players.get(targetId);
    if (tp) {
      const hpBefore = tp.hp;
      if (a) dmg = Math.max(1, Math.round(dmg * pvpDamageMult(a.level, tp.level))); // hero vs hero (shared/combat.ts)
      // A Summoner's creatures on a hero: their PvP settings (shared/summons.ts SUMMON.pvp)
      if (a && opts.pet) { dmg = Math.max(1, Math.round(dmg * SUMMON.pvp.dmg)); if (opts.stunMs) opts = { ...opts, stunMs: opts.stunMs * SUMMON.pvp.cc }; }
      const killed = this.damagePlayer(targetId, dmg, name, push, kb, { ...opts, atkLevel: a?.level });
      this.bloodthirst(a, attackerId, hpBefore - tp.hp, opts.drain, targetId);
      if (a && (opts.basic || opts.skill) && !opts.dot && !opts.rune && hpBefore > tp.hp) this.runesOnHit(attackerId, a, targetId, hpBefore - tp.hp);
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
    if (a && !this.canHurtMob(attackerId, m)) return;
    if (a && m.kind === "trooper") { this.warTroops.hit(attackerId, m); this.caravans.hit(attackerId, targetId); this.sieges.hit(attackerId, targetId); this.tunnels.hit(attackerId, targetId); this.rituals.hit(attackerId, targetId); this.marches.hit(attackerId, targetId); this.battles.hit(attackerId, targetId); this.towns.hit(attackerId, targetId); const tc = parseTroop(m.weapon)?.clan; if (tc) this.feuds.struck(attackerId, tc); } // an enemy hero's blow (a grudge with its clan starts over): the trooper (and a caravan's escort) turns on them
    if (m.owner && a) dmg = Math.max(1, Math.round(dmg / SUMMON.pvp.hp)); // a hero's blow on someone's creature (SUMMON.pvp)
    const def = mobDef(m);
    if (a && (m.camp || m.kind === "banditchief")) this.banditShout(m, targetId, attackerId, Date.now());
    dmg = Math.max(1, Math.round(dmg * takenMult(m, Date.now())));
    if (m.cr) { const src = a ?? this.state.mobs.get(attackerId); dmg = Math.max(1, Math.round(dmg * this.crown.taken(m, src?.x, src?.y, Date.now()))); } // a Crownguard's shield, a Thronewarden's rampart
    const exec = a && !m.owner ? this.execute(a, m, dmg, opts) : 0; // a broken monster's first blow (shared/combat.ts EXECUTE)
    if (exec) dmg = exec;
    // A group fighting together faces a tougher monster (shared/party.ts): it soaks more per hit
    if (a?.party) dmg = Math.max(1, Math.round(dmg / groupHpMult(this.groupNear(attackerId, m.x, m.y).length)));
    if (m.bones) dmg = Math.max(1, Math.round(dmg * (1 - DEMON.harvest.armorPer * m.bones))); // Bone Demon's bone armour
    this.bloodthirst(a, attackerId, Math.min(dmg, m.hp), opts.drain, targetId);
    if (a && m.tide) this.tide.hit(attackerId, m, Math.min(dmg, m.hp)); // damage to a marcher near the gate (server/tide.ts)
    m.hp = Math.max(0, m.hp - dmg);
    if (m.champ) this.champs.hurt(m, targetId, Date.now()); // Risen, Splitting, Hide-Stitched (server/champions.ts)
    this.addHate(m, attackerId, dmg); // fight back (generated aggro)
    if (a && (opts.basic || opts.skill) && !opts.dot && !opts.rune) this.runesOnHit(attackerId, a, targetId, dmg); // weapon runes (shared/runes.ts)
    // Guardian (shared/summons.ts): a Summoner's golem close by draws the monster's anger instead of its owner
    const guard = a && !m.owner ? this.guardOf(attackerId, m) : undefined;
    if (guard) { this.addHate(m, guard, dmg); m.foe = guard; m.target = ""; }
    if (!opts.dot && (m.kind === "stormblob" || m.parts)) this.stormSparks(m, targetId, Date.now());
    if (!m.foe) m.target = attackerId;
    const now = Date.now();

    // Initiative: drain poise; a solid hit interrupts the wind-up and delays the next attack
    const pmax = mobPoiseMax(m);
    // Higher-level monsters are harder to make dizzy
    const pdmg = dmg * (opts.skill ? POISE.skillMult : 1) * poiseLevelMult(a?.level ?? 1, m.level) * (opts.poiseMul ?? 1) + (opts.poiseAdd ?? 0) * pmax;
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
    this.broadcast("hit", { id: targetId, dmg, crit: !!opts.crit && !exec, dot: !!opts.dot, el: opts.el, ...(exec ? { ex: 1 } : {}), ...(opts.dot ? {} : hitDir(push)), ...byPart(hitBy(this.state.players, this.state.mobs, attackerId)) });
    if (m.hp > 0) { afterHit(this.host, attackerId, targetId, opts); return; }
    if (a) onKill(this.host, attackerId); // Bloodlust
    if ((m.owner && !m.charmUntil) || m.kind === "trooper") { this.mobDied(m, targetId, attackerId, a?.name ?? ""); return; } // a summon or a clan trooper: no XP, no loot, no quest credit
    if (a && !m.tide) for (let c = 0; c < CHAINS.length; c++) this.questKill(attackerId, a, m, c); // marchers fill no quest or bounty
    if (a && !m.tide) this.ownerCredit(attackerId, a, m); // someone's own quest monster, felled by their group (decision 9)
    if (a && !m.tide) this.bountyKill(attackerId, a, m);
    if (a && !m.tide) this.writs.mobKilled(attackerId, m); // a clear writ (server/warWrits.ts)
    if (a) this.tide.kill(attackerId, m); // a blob fills the Gloam Tide's meter (server/tide.ts)
    if (a) this.rumours.kill(attackerId, targetId); // a rumour's ambusher (server/rumours.ts)
    // Kill XP: every group member in the same zone gets it (the killer alone when solo)
    const xp = Math.round(def.xp * mobScale(m.level, "xp") * (m.tide ? TIDE.xpMult : 1));
    for (const pid of a?.party ? this.groupNear(attackerId, m.x, m.y) : [attackerId]) this.grantXp(pid, xp, m);
    this.dropLoot(m.kind, m.x, m.y, mobScale(m.level, "gold") * (m.kind === "bandit" ? BANDIT_ROLES[roleOf(m.weapon)].loot : 1) * (isChampion(m) ? CHAMPION.goldMult : 1) * forgedGoldMult(m) * boonGoldMult(a?.clan), m.level); // (the crowned clan's boon: server/warCrown.ts)
    if (isChampion(m)) this.champLoot(m); // a champion: more gold, gear rolls, a potion and a rune
    if (m.forge) { const g = forgedKillDrop(m); if (g) this.dropItem("gear", m.x, m.y, 1, g); } // a forged monster: maybe its clan's forged weapon
    this.mobDied(m, targetId, attackerId, a?.name ?? "");
  }

  /** A monster's status words: its skill effects (statusOf) and its elemental mark, Steam and Corrosion (reactionWords). */
  private static mobFx(m: Mob, now: number): string {
    const fx = statusOf(m, now), rw = m.react ? reactionWords(m.react, now) : "";
    return rw ? (fx ? fx + "," + rw : rw) : fx;
  }

  /**
   * A hero's elemental hit on a wild monster (shared/elements.ts REACTIONS): leaves its mark, or sets off the reaction of
   * the mark and the hit. `attackerId` is always the hero: their creatures hit in their name, so they count as them.
   * Returns what the hit itself gains (a damage multiplier, extra poise damage); the rest happens here.
   */
  private elementReaction(attackerId: string, targetId: string, m: Mob, riders: ElemPart[], dmg: number): { mult: number; poise: number } | undefined {
    const now = Date.now();
    const els = riders.slice().sort((x, y) => y.amt - x.amt).map((r) => r.el);
    const r: ReactionHit | undefined = applyElementHit((m.react ??= newReactState()), els, attackerId, now);
    if (!r) return undefined;
    const f = r.factor, x = Math.round(m.x), y = Math.round(m.y);
    this.broadcast("react", { id: targetId, r: r.id, f, x, y });
    lingerReaction(m.react, r.id, f, now); // Steam, Corrosion
    if (r.id === "fracture") return { mult: 1 + REACTIONS.fracture.dmg * f, poise: REACTIONS.fracture.poise * f };
    if (r.id === "toxic") {
      // the blast lands just after the hit, on every wild monster round the target (the target too)
      const T = REACTIONS.toxic, amt = dmg * T.dmg * f;
      this.host.later(60, () => {
        for (const [oid, o] of this.state.mobs.inBox(x, y, T.radius)) {
          if (o.dead || o.hidden || o.owner || Math.hypot(o.x - x, o.y - y) > T.radius) continue;
          this.hitTarget(attackerId, oid, amt * mobAffinity(o.kind, "poison"), [0, 0], { kb: 0, el: "poison", rune: true });
        }
      });
    }
    if (r.id === "purify") {
      // a small heal to the hero, the one who left the mark and the hero's group close by
      const P = REACTIONS.purify, who = new Set([attackerId, r.markBy, ...this.groupNear(attackerId, x, y)]);
      for (const pid of who) {
        const p = this.state.players.get(pid);
        if (p && !p.dead && (pid === attackerId || Math.hypot(p.x - x, p.y - y) <= P.radius)) this.host.heal(pid, p.maxHp * P.heal * f);
      }
      if (purifies(m.kind)) return { mult: 1 + (P.mult - 1) * f, poise: 0 };
    }
    return undefined;
  }

  /** Steam (REACTIONS.steam): a monster's attack may miss. True when it does (the hero sees "Miss"). */
  private steamMissed(mobId: string, heroId: string): boolean {
    const m = this.state.mobs.get(mobId), chance = m?.react ? steamMiss(m.react, Date.now()) : 0;
    if (!chance || Math.random() >= chance) return false;
    this.broadcast("rmiss", { id: heroId });
    return true;
  }

  /**
   * Execution (shared/combat.ts EXECUTE): the hero's first own blow on a broken monster. Returns the new damage (0 = no
   * execution), spends the break's execution and gives the hero Heat or Mana back.
   */
  private execute(a: Player, m: Mob, dmg: number, opts: HitOpts): number {
    if (!canExecute(opts, m)) return 0;
    m.execSpent = true;
    const boss = !!(ELITE[m.kind] || BOSS[m.kind] || m.kind === "nightraider" || (m.title && !m.tide)); // a Gloam Tide marcher is a plain blob
    executeRefund(a, a.cls, OVERLOAD.max);
    this.syncMana(a);
    return Math.max(1, Math.round(executeDamage(dmg, !!opts.crit, boss)));
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
    for (const [oid, o] of this.state.mobs.inBox(from.x, from.y, bd)) { // the starting box; it shrinks as nearer ones turn up
      if (oid === targetId || o.dead || o.hidden || Math.abs(o.x - from.x) > bd || Math.abs(o.y - from.y) > bd) continue;
      if (this.state.players.has(attackerId) && !this.canHurtMob(attackerId, o)) continue; // never onto a creature or trooper the hero may not hurt
      const d = Math.hypot(o.x - from.x, o.y - from.y);
      if (d < bd) { bd = d; best = oid; }
    }
    if (!best) return;
    const to = this.state.mobs.get(best)!;
    this.broadcast("arc", { x0: Math.round(from.x), y0: Math.round(from.y), x1: Math.round(to.x), y1: Math.round(to.y) });
    this.hitTarget(attackerId, best, amt * F.arc * mobAffinity(to.kind, "shock"), [0, 0], { kb: 0, el: "shock" });
  }

  /** A monster is down: its raised dead crumble, it leaves its zone (which brings a fresh one back later). */
  private mobDied(m: Mob, targetId: string, attackerId: string, killerName: string) {
    if (m.kind === "hidemother" && m.uPhase) this.bossSay(targetId, URSK.lines.death); // her last words
    if (m.kind === "sunwright" && m.uPhase) this.bossSay(targetId, SUNWRIGHT.lines.death);
    if (m.voice) this.bossSay(targetId, m.voice.death);
    if (m.kind === "gildhound") this.crown.died(m, targetId, attackerId); // a Gildhound's hunt goes wild (server/crownMobs.ts)
    if (m.kind === "nightraider") this.raiderGone(m, targetId, true, killerName);
    if (m.kind === "trooper") { // its slot refills at the Hold; valor for a sworn killer, and a rout writ counts it
      this.caravans.killed(m, targetId, attackerId); // a caravan's cart or escort (server/warCaravans.ts)
      this.sieges.killed(targetId, attackerId, m); // a siege trooper: its place waits for the next wave; a wrecked ram pays (server/warSieges.ts, warWorks.ts)
      this.tunnels.killed(m, targetId, attackerId); // a tunnel mouth collapses, or one of its soldiers falls (server/warTunnels.ts)
      this.rituals.killed(m, targetId, attackerId); // an acolyte falls; the last one breaks the ritual (server/warRituals.ts)
      this.marches.killed(m, targetId, attackerId); // a column soldier: one man fewer reaches the target (server/warMarches.ts)
      const tr = parseTroop(m.weapon), kid = this.state.players.has(attackerId) ? attackerId : this.state.mobs.get(attackerId)?.owner || undefined; // (a hero's creature kills in their name)
      const inBattle = this.battles.killed(m, targetId, kid); // a battle soldier: the pools' quota, kill valor under the battle's cap (server/warBattles.ts)
      const patrol = this.warTroops.owns(targetId), k = this.warTroops.killed(m, targetId, kid ?? attackerId); // (a patrol's kill valor is paid there)
      if (k) this.writs.trooperKilled(kid ?? attackerId, k.t, k.clan);
      this.feuds.killed(targetId); // a manhunter (server/warFeuds.ts)
      this.towns.killed(targetId); // a town gate guard: its post waits for the next war tick (server/warTowns.ts)
      if (tr && kid) this.feuds.onKill(kid, tr.clan, tr.part); // kill points with its clan: Wanted, Hunted, Marked
      if (tr && kid && !patrol && !inBattle && !tr.object) this.warTroops.killValor(kid, tr.clan, tr.officer ? "officer" : "soldier"); // siege, escort, tunnel, acolyte, manhunter: valor for a clan at war (W2c)
    }
    if (m.champ) this.champs.died(m, targetId); // its ballista falls with it
    m.dead = true; m.hp = 0;
    if (m.owner) this.summons.delete(targetId);
    if (m.owner && m.mind) this.golemFell(m); // a Summoner's golem: its element bursts out, Essence, it rises again later
    if (m.owner && m.wisp) wispEnd(this.host, m.owner, m.wisp, m.x, m.y); // a wisp destroyed: back to the Void all the same
    if (m.charmUntil) { m.owner = ""; m.charmUntil = 0; m.banishAt = 0; } // a charmed monster dies as the zone monster it is
    m.hidden = false; m.spot = ""; m.fleeing = false; m.foe = "";
    // A skeleton may break in two: its upper body drags itself on at whoever killed it
    if (m.kind === "skeleton" && !m.ritual && Math.random() < BONES.crawlChance) {
      const x = m.x, y = m.y, level = m.level, weapon = m.weapon === "bow" ? "sword" : m.weapon, mother = m.mother;
      this.clock.setTimeout(() => this.spawnCrawler(x, y, level, weapon, mother, attackerId), BONES.crawlDelayMs);
    }
    if (m.kind === "necromancer" || m.kind === "hollowking" || m.kind === "packlord" || m.kind === "hidemother" || m.kind === "sunwright") {
      // Its raised skeletons (the Packlord's and the Hide-Mother's called kin) (the Hollow King's servants) fall apart with it
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
      if (zone.alive <= 0 && attackerId && this.state.mobs.get(attackerId)?.kind !== "trooper") { // (a clan trooper's kill is no hero's feat)
        const z = SPAWN_ZONES[m.zone];
        this.broadcast("zonecleared", { zone: z.name, by: attackerId, name: killerName, respawnSec: Math.round(z.respawnMs / 1000) });
      }
    }
  }

  // ---- Wren the lute-maker (server/lutemaker.ts) -------------------------------

  /** "break" { bag }: at Wren's stall, a Songweaver breaks the bag item at that index into material. */
  private breakMsg(client: Client, i: unknown) {
    const p = this.state.players.get(client.sessionId);
    if (!p || p.dead || typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= p.bag.length || !atLutemaker(p)) return;
    const bag = [...bagItems(p)], r = breakItem(p, bag, i, this.songs, potionSlots(p.pots));
    if (!("mat" in r)) { client.send("shop", { ok: false, text: r.text }); return; }
    setBag(p, bag);
    client.send("shop", { ok: true, text: r.text });
    this.broadcast("sfx", { ev: "break", id: client.sessionId, mat: r.mat, n: r.n });
    this.sendSongbook(client.sessionId, p);
  }

  /** "lutefit" { trait }: at Wren's stall, fit a trait to the lute in her hands (gold and materials paid). */
  private luteFitMsg(client: Client, trait: unknown) {
    const p = this.state.players.get(client.sessionId);
    if (!p || p.dead || typeof trait !== "string" || trait.length > 16 || !atLutemaker(p)) return;
    const r = fitTrait(p, this.songs, trait);
    if (!r.ok) { client.send("shop", { ok: false, text: r.text }); return; }
    this.applyStats(p); // the engine's lute (SkillRuntime.lute) takes the new trait
    client.send("shop", { ok: true, text: r.text });
    this.broadcast("sfx", { ev: "lutefit", id: client.sessionId, trait: r.trait });
    this.sendSongbook(client.sessionId, p);
  }

  // ---- Shops (shared/shops.ts) ----------------------------------------------

  /** The shop of the trader the player stands next to. */
  private shopNear(p: Player) {
    const n = npcNear(p.x, p.y, TALK_RANGE * 1.5, (o) => npcPresent(o.id, p)); // a trader who isn't there for this hero doesn't trade
    return n?.shop ? shopWithForged(n.shop, n.shop.startsWith("cap_") ? forgedStock(n.shop.slice(4)) : []) : undefined; // (a capital also sells its clan's forged weapons)
  }
  /** What hero p pays for `base` at the trader beside them: less in a capturable town its clan holds (shared/war/towns.ts townPrice). */
  private priceFor(p: Player, base: number): number {
    const n = npcNear(p.x, p.y, TALK_RANGE * 1.5, (o) => npcPresent(o.id, p)), t = n && townAt(n.x, n.y);
    const city = n && cityNpcRole(n.id)?.city; // a capital's quartermaster: its clan's sworn pay less (shared/capitals.ts cityPrice)
    if (city) return cityPrice(base, city, p.clan);
    return t ? townPrice(base, t, warTowns()[t.id]?.k, p.clan) : base;
  }

  private shopBuy(client: Client, i: unknown) {
    const p = this.state.players.get(client.sessionId);
    const shop = p && !p.dead ? this.shopNear(p) : undefined;
    const e = shop && typeof i === "number" ? shop.stock[i] : undefined;
    if (!p || !e) return;
    const no = (text: string) => client.send("shop", { ok: false, text }), price = this.priceFor(p, e.price);
    if (p.gold < price) return no("Not enough gold");
    if (e.item === "potion" || e.item === "mpotion") {
      const qty = e.qty ?? 1, size = e.size ?? 0;
      if (p.bag.length + slotsAfter(p.pots, e.item, size, qty) > BAG_SIZE) return no("No room in your bag");
      this.addPotions(p, e.item, size, qty);
    } else {
      if (!gearDef(e.item)) return;
      if (this.bagFull(p)) return no("Your bag is full");
      setBag(p, [...bagItems(p), e.item]);
    }
    p.gold -= price;
    client.send("shop", { ok: true, text: `-${price} gold` });
  }

  private shopSell(client: Client, i: unknown) {
    const p = this.state.players.get(client.sessionId);
    const shop = p && !p.dead ? this.shopNear(p) : undefined;
    if (!p || !shop?.buys || typeof i !== "number" || i < 0 || i >= p.bag.length) return;
    const gid = p.bag.at(i);
    if (!gid || !shopBuys(shop, gid, !this.keeps(p)(gid))) return; // a gear slot it lists, or loose runes (Morwen)
    const items = [...bagItems(p)];
    items.splice(i, 1);
    // runes set in a sold item come back to the bag; with no room the shop pays for them
    let price = sellPrice(gid);
    for (const r of itemRunes(gid)) {
      const rid = runeId(r.key, r.rank);
      if (items.length + potionSlots(p.pots) < BAG_SIZE) items.push(rid); else price += sellPrice(rid);
    }
    setBag(p, items);
    p.gold += price;
    client.send("shop", { ok: true, text: `+${price} gold` });
  }

  /**
   * Rune fusion (shared/runes.ts fuseRunes): four identical loose runes + gold -> one rank higher, next to a trader who
   * buys runes. Bag and gold are checked and swapped in the same synchronous step, so nothing is duplicated or lost.
   * Rate-limited by the per-client message bucket like every other message.
   */
  private fuseRunesMsg(client: Client, id: unknown) {
    const p = this.state.players.get(client.sessionId);
    if (!p || p.dead) return;
    const no = (text: string) => client.send("shop", { ok: false, text });
    if (!shopFuses(this.shopNear(p))) return no("Stand next to a rune trader to fuse runes");
    const res = fuseRunes(id, { bag: bagItems(p), gold: p.gold, reserved: potionSlots(p.pots), bagSize: BAG_SIZE });
    if (typeof res === "string") return no(res);
    setBag(p, res.bag);
    p.gold = res.gold;
    client.send("shop", { ok: true, text: `-${res.cost} gold: ${runeIdName(res.made)}` });
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
    t.offer[id] = offerFrom(bagItems(p), p.gold, msg?.items, msg?.gold, this.keeps(p));
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
    // Re-checked now: a spare offered earlier may have become her last lute or Songbook (the other one sold or dropped)
    const lastKept = ([who, pp]: readonly [string, Player]) => { const keep = this.keeps(pp), gone: string[] = []; return t.offer[who].items.some((g) => { if (keep(g, gone)) return true; gone.push(g); return false; }); };
    const r = [[t.a, pa], [t.b, pb]].some((e) => lastKept(e as [string, Player])) ? "A bound item can't leave its hero" : settle(
      { bag: bagItems(pa), gold: pa.gold, offer: t.offer[t.a], reserved: potionSlots(pa.pots) },
      { bag: bagItems(pb), gold: pb.gold, offer: t.offer[t.b], reserved: potionSlots(pb.pots) },
    );
    if (typeof r === "string") {
      // Something moved since the offer (an item worn, sold, dropped, gold spent): show the trade again, unready
      t.ready = {}; t.v++;
      for (const [who, pp] of [[t.a, pa], [t.b, pb]] as const) {
        const keep = this.keeps(pp), gone: string[] = [];
        const items = t.offer[who].items.filter((g) => bagItems(pp).includes(g) && !keep(g, gone) && !!gone.push(g));
        t.offer[who] = { items, gold: Math.min(t.offer[who].gold, pp.gold) };
      }
      this.tradeNote(t.a, `${r}: check the offers again.`); this.tradeNote(t.b, `${r}: check the offers again.`);
      return this.tradeView(t);
    }
    setBag(pa, r.a.bag); pa.gold = r.a.gold;
    setBag(pb, r.b.bag); pb.gold = r.b.gold;
    saveHero(pa.name, pa.cls, this.snapshot(pa)); saveHero(pb.name, pb.cls, this.snapshot(pb));
    void flush(); // a finished trade is on disk at once
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
    return !!p && !p.dead && !!stashNear(p.x, p.y, STASH_RANGE * 1.6); // any chest (Oakvale's, Saltmere's): one account stash
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
      if (i >= bag.length || !isBagItem(bag[i])) return;
      if (this.keeps(p)(bag[i])) return this.stashSend(client, "That stays with you: it is bound to you");
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
    const q = { ...this.qs(p, c), ...v }, n = packQuest(q.questId, q.questStage, q.questCount), k = CHAINS[c].packed;
    if (n) p.quests.set(k, n); else p.quests.delete(k); // a chain not begun takes no room in the map
  }

  private sendQuest(id: string, p: Player, c: number, done = false, auto = false) {
    const q = this.qs(p, c);
    this.clients.find((cl) => cl.sessionId === id)?.send("quest", { chain: c, qid: q.questId, stage: q.questStage, done, ...(auto ? { auto } : {}) });
  }

  /** Move to the next step (or claim the reward and move on to the next quest). */
  private nextStep(id: string, p: Player, c: number) {
    const q = this.qs(p, c), d = CHAINS[c].quests[q.questId];
    if (!d) return;
    this.qset(p, c, { questCount: 0 });
    this.unsummon(id, c);
    const done = d.steps[q.questStage - 1];
    if (done?.levelTo && p.level < done.levelTo) this.grantXp(id, xpForLevel(done.levelTo) - p.xp, p);
    const ns = nextStage(d, q.questStage, p); // steps for another choice are skipped (QuestStep.onlyIf)
    if (ns <= d.steps.length) {
      this.qset(p, c, { questStage: ns });
      this.sendQuest(id, p, c);
      this.qsteps.changed(id, c);
      // Already did what the new step teaches (learned an active skill before getting here): straight on
      const s = d.steps[ns - 1];
      if (s.type === "learn" && activeSkills(p.cls).some((k) => skillLearned(p.cls, p.talents, k.id))) this.nextStep(id, p, c);
      return;
    }
    p.gold += boonGold(p.clan, d.reward.gold);
    if (d.sets) setMeta(p, META.flags, withChoice(metaOf(p, META.flags), d.sets.flag, d.sets.v)); // QuestDef.sets: e.g. Penance done
    if (d.reward.song) this.learnSong(id, p, d.reward.song); // a Songweaver learns the quest's song (shared/songbook.ts)
    // Reward potions fit the hero's level; what the bag can't hold is put down at their feet
    const rs = dropSize(p.level, () => 0.5);
    for (const [kind, n] of [["potion", d.reward.potions], ["mpotion", Math.ceil(d.reward.potions / 2)]] as const) {
      const left = n - this.addPotions(p, kind, rs, n);
      if (left > 0) this.dropItem(kind, p.x, p.y + 8, left, String(rs));
    }
    this.qset(p, c, { questId: q.questId + 1, questStage: 0 });
    this.sendQuest(id, p, c, true);
    this.qsteps.changed(id, c);
    if (d.reward.xp) this.grantXp(id, d.reward.xp, p); // the side arcs give none
    // The next quest of the chain carries on from here by itself (QuestDef.auto: no walk back to its giver), a breath
    // after the "Quest complete" banner; below its level it waits for its giver as usual
    const next = CHAINS[c].quests[q.questId + 1];
    if (next?.auto) this.clock.setTimeout(() => this.autoStart(id, c, q.questId + 1), 2600);
  }

  /** Start quest `qid` of chain c where the hero stands, if they are still on its offer and up to its level. */
  private autoStart(id: string, c: number, qid: number) {
    const p = this.state.players.get(id), d = CHAINS[c].quests[qid];
    if (!p || !d) return;
    const q = this.qs(p, c);
    if (q.questId !== qid || q.questStage !== 0 || p.level < d.minLevel || !chainOpen(p, c)) return;
    this.qset(p, c, { questStage: nextStage(d, 0, p), questCount: 0 });
    this.sendQuest(id, p, c, false, true);
    this.qsteps.changed(id, c);
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
  private advanceQuest(id: string, c: number, opt?: number) {
    const p = this.state.players.get(id);
    if (!p || p.dead) return;
    const q = this.qs(p, c), d = CHAINS[c].quests[q.questId];
    if (!d) return;
    if (q.questStage === 0) {
      if (p.level >= d.minLevel && chainOpen(p, c) && this.nearNpc(p, d.giver)) this.nextStep(id, p, c);
      return;
    }
    if (this.qsteps.talk(id, c, opt)) return; // a choice, or several NPCs to hear (server/questSteps.ts)
    const s = questStep(q);
    if (s?.type === "talk" && this.nearNpc(p, s.npc!)) this.nextStep(id, p, c);
  }

  /** E on a quest object (lantern, shrine, cocoon, Brood Heart, catapult, crypt...). */
  private useQuestObject(id: string, oid: string) {
    const p = this.state.players.get(id);
    if (!p || p.dead) return;
    if (this.qsteps.use(id, oid)) return; // pick and the like (server/questSteps.ts)
    if (this.rumours.use(id, oid)) return; // a rumour's objects (server/rumours.ts)
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

  // ---- Mawdeep gates (shared/map.ts DOORS) ---------------------------------
  /** Open gate id -> when it may swing shut on its own. */
  private openDoors = new Map<string, number>();
  private doorBusy(d: Door): boolean {
    const inIt = (x: number, y: number) => Math.abs(x - d.x * TILE) < 6 * TILE && Math.abs(y - d.y * TILE) < 6 * TILE && doorDist(d, x, y) < 1.1;
    for (const p of this.state.players.values()) if (inIt(p.x, p.y)) return true;
    for (const [, m] of this.state.mobs.inBox(d.x * TILE, d.y * TILE, 6 * TILE)) if (!m.dead && inIt(m.x, m.y)) return true;
    return false;
  }
  /** Someone stands right in the gate's tiles (stuck there). */
  private inGate(d: Door): boolean {
    const inIt = (x: number, y: number) => d.gate.includes(Math.floor(y / TILE) * MAP_W + Math.floor(x / TILE));
    for (const p of this.state.players.values()) if (!p.dead && inIt(p.x, p.y)) return true;
    // only monsters in a box round the gate's tiles can stand on one (the grid instead of every monster on the map)
    const [cx, cy, r] = gateBox(d);
    for (const [, m] of this.state.mobs.inBox(cx, cy, r)) if (!m.dead && inIt(m.x, m.y)) return true;
    return false;
  }
  private setDoor(d: Door, open: boolean) {
    setDoorOpen(d.id, open);
    if (open) this.openDoors.set(d.id, Date.now() + (d.kind === "crack" ? CRACK_OPEN_MS : d.from ? SHORTCUT_OPEN_MS : DOOR_OPEN_MS)); else this.openDoors.delete(d.id);
    this.state.doors = [...this.openDoors.keys()].join(",");
  }
  /** E at a gate: open it, or pull it shut again if nobody stands in it. */
  private workDoor(client: Client, id: unknown) {
    const p = this.state.players.get(client.sessionId), d = doorById(id);
    if (!p || p.dead || !d || doorDist(d, p.x, p.y) > DOOR_RANGE + 0.6 || !doorWorkable(d, p.x, p.y)) return;
    if (!this.openDoors.has(d.id)) this.setDoor(d, true);
    else if (d.kind !== "crack" && !this.doorBusy(d)) this.setDoor(d, false); // a broken wall can't be put back
  }
  private tickDoors() {
    const now = Date.now();
    for (const d of DOORS) {
      const open = this.openDoors.get(d.id);
      if (open === undefined) { if (this.inGate(d)) this.setDoor(d, true); continue; } // never shut anyone inside a gate (e.g. after a deploy)
      if (now >= open && !this.doorBusy(d) && !(d.kind === "crack" && this.playerNear(d.x * TILE, d.y * TILE, 8 * TILE))) this.setDoor(d, false); // never wall anyone into a secret room
    }
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
    if (Math.random() < RUNE_DROP.chest * (1 + 0.5 * (c.tier - 1))) loot.gear.push(rollRune(c.level)); // a rune (shared/runes.ts)
    let row = 0; // stack the "+loot" texts so they don't overlap
    const got = (kind: ItemKind, amount: number, gear = "") =>
      client.send("pickup", { kind, amount, x: c.x, y: c.y - 8 - 9 * row++, gear, name: kind === "gear" ? lvlName(gear, p.cls) : kind === "potion" || kind === "mpotion" ? potionName(kind, potSize(gear)) : "" });
    loot.gold = boonGold(p.clan, loot.gold); // (the crowned clan's boon)
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
    const boon = rollBoon(p.hp < p.maxHp || p.energy !== 0 || (p.mana < p.maxMana && !usesGauge(p.cls)));
    let amount = 0;
    if (boon === "heal") {
      amount = Math.round(p.maxHp - p.hp);
      p.hp = p.maxHp;
      p.energy = 0;
      if (!usesGauge(p.cls)) p.mana = p.maxMana; // a song gauge is played full, not prayed full
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

  // ---- Bounty boards (shared/bounty.ts) ------------------------------------------------------------------

  /** "bounty": {} = show me (offers if I'm at a board, and my hunt), {take: i} = take offer i, {drop: true} = give up. */
  private bountyMsg(client: Client, msg: { take?: number; drop?: boolean }) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const board = nearestBoard(p.x, p.y);
    const offers = board ? bountyOffers(p.level, p.bountyDone, actOfTile(Math.floor(board.x / TILE), Math.floor(board.y / TILE))) : []; // the board's own act
    if (msg.drop) p.bounty = undefined;
    else if (typeof msg.take === "number" && board && !p.bounty && offers[msg.take]) p.bounty = { ...offers[msg.take], n: 0 };
    client.send("bounty", { board: board?.id ?? "", offers, active: p.bounty ?? null });
  }

  /** Pay a hero (the Tide, rumours): gold, and a rune into the bag, or at their feet if it is full. */
  private payHero(pid: string, gold: number, rune?: string) {
    const p = this.state.players.get(pid);
    if (!p) return;
    p.gold += boonGold(p.clan, gold); // (the crowned clan's boon: server/warCrown.ts)
    if (rune) { if (this.bagFull(p)) this.dropItem("gear", p.x, p.y, 1, rune, pid); else setBag(p, [...bagItems(p), rune]); }
  }

  /** A monster died to this hero: does it count for their bounty? The last kill pays out on the spot. */
  private bountyKill(id: string, p: Player, m: Mob) {
    const b = p.bounty;
    if (!bountyCounts(b, m.kind, m.level)) return;
    b!.n++;
    const client = this.clients.find((c) => c.sessionId === id);
    if (b!.n < b!.goal) { client?.send("bounty", { active: b }); return; }
    p.bounty = undefined;
    p.bountyDone++;
    p.gold += boonGold(p.clan, b!.gold);
    this.grantXp(id, b!.xp, p);
    client?.send("bounty", { active: null, done: b });
  }

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
    const city = cityOfPortal(dest.id);
    if (city && !this.caps.admit(id, city)) return; // a capital's waystone lets in whom its gate does
    if (this.lanternHeld(id, p)) return;
    if (now - p.lastHurt < PORTAL_COMBAT_MS) { client.send("travelno", { why: "fight" }); return; }
    const at = arrivalOf(dest);
    p.x = at.x; p.y = at.y; p.moving = false;
    p.rollUntil = 0; p.rolling = false;
    p.emote = "";
    this.broadcast("travel", { id, from: from.id, to: dest.id, x: at.x, y: at.y });
  }

  /**
   * A quest moves the hero (an unseen hero who was seen goes back to their last hiding place, server/questSteps.ts):
   * the same "travel" message as a portal, so the client snaps instead of walking (from / to "" = no portal stones,
   * why = what moved them). A lantern carrier is never moved (lanternHeld), as on every other jump across the map.
   */
  private warp(pid: string, x: number, y: number): boolean {
    const p = this.state.players.get(pid);
    if (!p || p.dead || this.lanternHeld(pid, p)) return false;
    p.x = x; p.y = y; p.moving = false;
    p.rollUntil = 0; p.rolling = false;
    p.emote = "";
    this.broadcast("travel", { id: pid, from: "", to: "", x: Math.round(x), y: Math.round(y), why: "quest" });
    return true;
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
  private summonFused(pid: string, sm: Summon, c: number): string {
    const [host, ...rest] = sm.parts;
    const m = new Mob();
    m.kind = host; m.zone = -1; m.summonFor = pid; m.summonChain = c;
    m.x = m.homeX = sm.x; m.y = m.homeY = sm.y;
    m.level = actSpecialLevel(actOfTile(Math.floor(sm.x / TILE), Math.floor(sm.y / TILE)), sm.level);
    m.title = sm.title ?? "";
    const id = `q${++this.mobSeq}`;
    if (sm.voice) { // a boss with something to say: it has its say as it rises, then speaks now and then (bossVoices)
      const t0 = Date.now(), V = sm.voice;
      m.voice = V; m.nextTaunt = t0 + 12000; m.stunUntil = t0 + 900 + V.wake.length * 1250;
      V.wake.forEach((line, i) => this.clock.setTimeout(() => { if (!m.dead) this.broadcast("bosssay", { id, text: line }); }, 300 + i * 1250));
    }
    if (!isBlob(host)) {
      m.hp = m.maxHp = Math.round(MOBS[host].maxHp * mobScale(m.level, "hp") * (sm.hpMult ?? 1));
      if (host === "demon") { m.nextStomp = Date.now() + 2500; m.stunUntil = Date.now() + 700; } // climbing out
      this.state.mobs.set(id, m);
      if (host === "demon") this.broadcast("demonrise", { id, x: Math.round(m.x), y: Math.round(m.y) });
      if (host === "hidemother") {
        const t0 = Date.now(), W = URSK.lines.wake;
        m.stunUntil = t0 + 3800; // heaving herself up off her bed of hides, and having her say
        m.bcd = { maul: t0 + 4600, roar: t0 + 7000 };
        m.uPhase = 1; m.nextTaunt = t0 + 14000; m.hookHero = "";
        this.broadcast("beastrise", { id, x: Math.round(m.x), y: Math.round(m.y) });
        W.forEach((line, i) => this.clock.setTimeout(() => { if (!m.dead) this.broadcast("bosssay", { id, text: line }); }, 300 + i * 1250));
      }
      if (host === "sunwright") {
        const t0 = Date.now(), W = SUNWRIGHT.lines.wake;
        m.stunUntil = t0 + 3800; // turning from the Furnace to greet you, and having her say
        m.bcd = { beam: t0 + 4600, flare: t0 + 6000, sunfall: t0 + 8000 };
        m.uPhase = 1; m.nextTaunt = t0 + 14000;
        this.broadcast("sunrise", { id, x: Math.round(m.x), y: Math.round(m.y) });
        W.forEach((line, i) => this.clock.setTimeout(() => { if (!m.dead) this.broadcast("bosssay", { id, text: line }); }, 300 + i * 1250));
      }
      if (host === "hollowking") {
        m.stunUntil = Date.now() + 1200; // rising from his throne
        const t0 = Date.now(); m.nextSweep = t0 + 2500; m.nextCircle = t0 + 4500; // a breath before his first moves
        this.broadcast("kingrise", { id, x: Math.round(m.x), y: Math.round(m.y) });
      }
      return id;
    }
    m.merged = sm.parts.length; m.parts = rest.join(","); m.mergeCap = m.merged;
    // HP of all the parts together, a little under the sum so the fight stays fair at the quest's level
    m.hp = m.maxHp = Math.round(sm.parts.reduce((t, k) => t + MOBS[k].maxHp, 0) * mobScale(sm.level, "hp") * 0.7 * (sm.hpMult ?? 1));
    m.canShoot = sm.parts.includes("shooterblob"); m.canCharge = sm.parts.includes("warriorblob"); m.canHeal = sm.parts.includes("healerblob");
    this.state.mobs.set(id, m);
    this.broadcast("blobmerge", { into: id, from: "", x: Math.round(m.x), y: Math.round(m.y), level: m.level, merged: m.merged });
    return id;
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
      if (now >= p.nextSummon && (this.undeadUp || !NIGHT_BOSSES.includes(s.summon.parts[0]) || underground(p.y))) { // the dead's bosses only rise at night (no night down there: always)
        p.nextSummon = now + 15000;
        let mine = false;
        this.state.mobs.forEach((m) => { if (m.summonFor === id && m.summonChain === c && !m.dead) mine = true; });
        if (!mine) this.qsteps.rose(id, c, this.summonFused(id, s.summon, c)); // a boss with a bargain makes its offer (server/questSteps.ts)
      }
      return;
    }
    if (s?.type === "reach") {
      if (Math.hypot(s.at!.x - p.x, s.at!.y - p.y) <= s.at!.r) this.nextStep(id, p, c);
      return;
    }
    if (s?.type !== "see" || !inZone(s.zone!, p.x, p.y)) return;
    const r2 = (9 * TILE) ** 2;
    for (const [, m] of this.state.mobs.inBox(p.x, p.y, 9 * TILE)) { // the circle lies inside this box
      if (m.dead || m.hidden || !s.kinds!.includes(m.kind)) continue;
      const dx = m.x - p.x, dy = m.y - p.y;
      if (dx * dx + dy * dy <= r2) { this.nextStep(id, p, c); return; }
    }
  }

  /**
   * A monster died to this player: count it, or maybe drop a quest item only they can see. `ownOnly`: the kill was a
   * group member's (ownerCredit), so only this hero's own-boss step may take it.
   */
  private questKill(id: string, p: Player, m: Mob, c: number, ownOnly = false) {
    const q = this.qs(p, c), s = questStep(q);
    // Kills and drops count anywhere on the map: only the monster's type matters (Murat's rule)
    if (!s || !s.kinds?.includes(m.kind)) return;
    if (ownOnly && !(s.type === "kill" && s.own)) return;
    if (s.type === "kill" && (m.merged ?? 1) < (s.fused ?? 1)) return;
    if (s.type === "kill" && s.own && (m.summonFor !== id || m.summonChain !== c)) return; // a named leader: only the one summoned for this player on this chain (not a rumour's or a wrong grave's)
    if (s.type === "kill" && s.own && q.questCount + 1 >= stepGoal(s)) this.apprentice.bossDown(id); // a mentor standing by pays out (server/apprentice.ts), while it still is their first
    const gift = stepFor(s, p.cls).gift; // the Songweaver's first gift is a book (shared/quests.ts byCls)
    if (s.type === "kill" && gift && q.questCount + 1 >= stepGoal(s)) this.giveGift(id, p, gift, m);
    if (s.type === "kill") this.questProgress(id, p, c, q.questCount + 1);
    else if (s.type === "collect" && Math.random() < (s.chance?.[m.kind] ?? 0)) this.dropItem("quest", m.x, m.y, 1, s.item!, id);
  }

  /**
   * Decision 9: a hero's own quest monster felled by a member of their group who stands with them (shared/party.ts
   * together) counts for that hero, on its own chain only. Rumour and wrong-grave ambushers (summonChain < 0) and hold
   * waves never count; questKill still checks summonFor and summonChain.
   */
  private ownerCredit(id: string, a: Player, m: Mob) {
    const oid = m.summonFor, o = oid && oid !== id ? this.state.players.get(oid) : undefined;
    if (!o || o.dead || !a.party || o.party !== a.party || m.qwave || !CHAINS[m.summonChain] || !together(a.x, a.y, o.x, o.y)) return;
    this.questKill(oid, o, m, m.summonChain, true);
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
      this.relevel(id, p);
      this.applyStats(p); // new stat points are assigned by the player in the hero panel
      if (!p.dead) p.hp = p.maxHp; // full heal on level up
      this.broadcast("levelup", { id, level: lvl, from });
      if (from <= PVP_PROTECT_LEVEL && lvl > PVP_PROTECT_LEVEL) this.note(id, `Level ${lvl}: PvP is open for you outside the Market Square.`);
      // A quest that carries on by itself (QuestDef.auto) and was waiting for this level starts now
      for (let c = 0; c < CHAINS.length; c++) {
        const q = this.qs(p, c), d = CHAINS[c].quests[q.questId];
        if (d?.auto && q.questId > 0 && q.questStage === 0 && from < d.minLevel && lvl >= d.minLevel) this.clock.setTimeout(() => this.autoStart(id, c, q.questId), 1800);
      }
    }
  }

  /** A villager's line (chat id "npc:<id>") to the hero it answers and the heroes close by (server/songs.ts buskingAudience). */
  private npcSay(n: Npc, singer: string, text: string) {
    const near = buskingAudience(n, singer, this.state.players.entries());
    for (const c of this.clients) if (near.has(c.sessionId)) c.send("chat", { id: `npc:${n.id}`, name: n.name, text });
  }

  /** A Songweaver learns a song from a quest: the teacher's lines first, then the song (songLearned). */
  private learnSong(id: string, p: Player, song: string) {
    const sd = songById(song);
    if (!sd || p.cls !== "songweaver" || !this.songs.learn(p, song)) return;
    const cl = this.clients.find((c) => c.sessionId === id);
    for (const text of sd.teach ?? []) cl?.send("chat", { id: "", name: sd.teacher ?? "Oakvale", text });
    this.songLearned(id, p, song);
  }

  /** A song went into her Songbook: the "newsong" event, the learned line, the owner's "songbook" message. */
  private songLearned(id: string, p: Player, song: string) {
    const sd = songById(song);
    this.broadcast("sfx", { ev: "newsong", id, song });
    if (sd) this.note(id, sd.learned);
    this.sendSongbook(id, p);
  }

  /** The owner-only "songbook" message { songs, mats } (on join and on every change). */
  private sendSongbook(id: string, p: Player) {
    this.clients.find((c) => c.sessionId === id)?.send("songbook", this.songs.msg(p));
  }

  /** A hero's oath changed (a standard's "clan" message or a capital's altar): the reply, writs, tabards, plan, home. */
  private oathChanged(id: string) {
    const p = this.state.players.get(id), client = this.clients.getById(id);
    if (!p) return;
    homeAfterOath(p); // a home in another clan's city is unbound (server/warCapitals.ts)
    client?.send("clan", { ...clanView(p), err: "" });
    this.writs.oathChanged(id); this.oaths.sync(); // a writ for the old clan is withdrawn; tabards update
    if (client) sendPlan(client, p, true); // the new clan's plan
  }

  /** A line in one player's chat from the game itself. */
  private note(id: string, text: string) {
    this.clients.find((c) => c.sessionId === id)?.send("chat", { id: "", name: "Oakvale", text });
  }

  /**
   * The Songweaver's lute follows her level (server/songs.ts relevelLute); runes it can no longer hold are stowed like
   * on load (stowItem: bag, else stash, else sold), never thrown away.
   */
  private relevel(id: string, p: Player) {
    const bag = [...bagItems(p)], loose: string[] = [];
    if (!relevelLute(p, bag, loose)) return;
    const stash = new LazyStash(() => loadStash(p.name));
    for (const r of loose) this.note(id, stowItem(p, bag, r, (v) => stash.put(v), "your lute had fewer sockets."));
    setBag(p, bag);
    if (stash.loaded) saveStash(p.name, stash.loaded, p.cls, this.snapshot(p));
  }

  /** Recompute stats and max HP from class + level + equipped gear. */
  private applyStats(p: Player) {
    const st = heroStats(this.reqInfo(p));
    p.sta = st.sta; p.str = st.str; p.mag = st.mag; p.dex = st.dex;
    const newMax = Math.round(maxHpFromStats(p.cls, st, p.level) * talentMult(p.cls, p.talents, "hp") * feastMult(p.feast, "hp"));
    p.hp = Math.min(newMax, p.hp + Math.max(0, newMax - p.maxHp));
    p.maxHp = newMax;
    if (usesGauge(p.cls)) { p.maxMana = GAUGE.max; p.mana = Math.min(GAUGE.max, Math.max(0, p.mana)); } // a song gauge: no pool to grow
    else {
      const newMana = maxManaFor(st, p.level);
      p.mana = Math.min(newMana, p.mana + Math.max(0, newMana - p.maxMana));
      p.maxMana = newMana;
    }
    p.sk.book = this.equipped(p).shield || undefined; // the book she can read fires when her song gauge fills (shared/skillEngine.ts swell)
    p.sk.lute = isLute(p.weapon) ? p.weapon : undefined; // her lute's traits (shared/lute.ts LUTE_FX)
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
    // Steam (shared/elements.ts REACTIONS): a scalded monster misses some of its blows
    if (opts.from && !opts.dot && this.steamMissed(opts.from, tid)) return false;
    // A counter stance (Riposte, Mirror Ice...) eats the hit and strikes back
    if (counterHit(this.host, tid, opts.from, dmg, opts)) return false;
    // Weakened monsters hit softer
    const fromMob = opts.from ? this.state.mobs.get(opts.from) : undefined;
    if (fromMob) dmg *= dealtMult(fromMob, now);
    // A quest trait's talent (shared/talents.ts TRAIT_TALENTS, Hidebound): x1 while it is off
    if (fromMob) dmg *= traitTakenMult(fromMob.kind, metaOf(t, META.cosm));
    // ...and hit a group harder
    if (fromMob && t.party) dmg *= groupDmgMult(this.groupNear(tid, fromMob.x, fromMob.y).length);
    const guarded = blocking(t, now);
    if (guarded) dmg = Math.max(1, Math.round(dmg * (1 - GUARD_REDUCTION)));
    dmg = Math.max(1, Math.round(dmg * talentReduce(t.cls, t.talents, "armor") * takenMult(t, now)));
    const block = gearBlock(this.equipped(t)); // equipped shield
    if (block) dmg = Math.max(1, Math.round(dmg * (1 - block)));
    // A monster's fire, cold or poison attack: the hero's resistances (armour, shield, hat) cut it
    if (opts.mobEl) dmg = Math.max(1, Math.round(dmg * (1 - gearResist(this.equipped(t), opts.mobEl))));
    // Armour runes (shared/runes.ts): a Ward rune may stop most of a real blow
    const struck = !opts.dot && !opts.rune && !opts.wrath && !!opts.from && opts.from !== tid;
    if (struck) dmg = this.runesWard(tid, t, dmg);
    // Stone Bond (shared/summons.ts): the hero's nearest golem takes part of the blow
    const bond = this.bondOf(tid, t);
    if (bond && dmg > 1) {
      const part = Math.round(dmg * Math.min(0.6, bondShare(t.level) + talentBonus(t.cls, t.talents, "bond") / 100));
      dmg -= part;
      bond[1].hp -= part;
      // the Void pays the Summoner for every blow their golem takes for them (at most a charge per ESSENCE.bondEveryMs)
      if (t.cls === "summoner" && part > 0 && now - t.bondEssenceAt >= ESSENCE.bondEveryMs) { t.bondEssenceAt = now; gainEssence(this.host, tid); }
      if (bond[1].hp <= 0) this.mobDied(bond[1], bond[0], opts.from ?? "", byName);
    }
    dmg = absorbDamage(this.host, tid, dmg); // shields (BuffDef.shield) soak up what is left first
    // Unstoppable buffs (Berserk, Whirlwind): ignore stun, slow and knockback
    const unstoppable = ccImmune(t, now);
    if (opts.stunMs && !guarded && !unstoppable) t.stunUntil = Math.max(t.stunUntil, now + opts.stunMs);
    if (opts.slowMs && !unstoppable) t.slowUntil = Math.max(t.slowUntil, now + opts.slowMs);
    t.hp = Math.max(0, t.hp - dmg);
    t.lastHurt = now;
    // Initiative: drain poise (shield blocks most of it, Unstoppable ignores it) and flinch
    if (!unstoppable) {
      const pdmg = dmg * (opts.skill ? POISE.skillMult : 1) * (guarded ? POISE.guardMult : 1) * poiseLevelMult(opts.atkLevel ?? t.level, t.level) * (opts.poiseMul ?? 1) * (1 - buffPoise(t, now));
      if (drainPoise(t, heroPoiseMax(t), pdmg, now, POISE.heroBrokenMs)) this.broadcast("broken", { id: tid, ms: POISE.heroBrokenMs });
      if (!guarded) t.attackReadyAt = Math.max(t.attackReadyAt, now + POISE.heroFlinchMs);
    }
    t.emote = "";
    if (!guarded && !unstoppable && kbMul > 0 && (push[0] || push[1])) {
      const kb = moveStep(t.x, t.y, pushInput(push), 0.12 * kbMul);
      t.x = kb.x; t.y = kb.y;
    }
    this.broadcast("hit", { id: tid, dmg, blocked: guarded, crit: !!opts.crit, dot: !!opts.dot, el: opts.el ?? opts.mobEl, ...(opts.dot ? {} : hitDir(push)), ...byPart(hitBy(this.state.players, this.state.mobs, opts.from)) });
    if (t.hp > 0) {
      this.qsteps.hurt(tid); // unseen steps (server/questSteps.ts)
      afterHit(this.host, opts.from, tid, opts);
      if (struck) this.runesStruck(tid, t, opts.from!, dmg);
      if (struck && fromMob?.champ) this.champs.struck(fromMob, opts.from!, tid, now); // Sun-Branded

      if (voidSlip(this.host, tid) > 0) this.loseHero(tid); // Void Slip: gone into the Void, monsters lose them
      return false;
    }
    if (riseAgain(this.host, tid)) return false; // Blood Pact: a killing blow leaves the vampire standing
    t.dead = true;
    this.warTroops.forget(tid); this.caravans.forget(tid); this.sieges.forget(tid); this.tunnels.forget(tid); this.rituals.forget(tid); this.marches.forget(tid); this.battles.forget(tid); this.feuds.forget(tid); this.towns.forget(tid); // the troops are done with a fallen hero
    { // feuds (server/warFeuds.ts): who killed them (a hero, a hero's creature, a clan's trooper or its javelin)
      const fm = opts.from ? this.state.mobs.get(opts.from) : undefined, hero = opts.from && this.state.players.has(opts.from) ? opts.from : fm?.owner || undefined;
      this.feuds.onHeroDeath(tid, { hero, clan: opts.troop ?? (fm?.kind === "trooper" ? parseTroop(fm.weapon)?.clan : undefined) });
      const kh = hero ? this.state.players.get(hero) : undefined; // a hero sworn to a clan at war with the victim's: kill valor (never a party mate)
      if (kh && hero !== tid && t.clan && !(t.party && t.party === kh.party)) this.warTroops.heroKillValor(hero!, tid, t.clan); // (once per victim per killer per war tick)
    }
    this.qsteps.died(tid); // a carried lantern falls here, a hold run may fail (server/questSteps.ts)
    if (opts.from && this.state.players.has(opts.from)) onKill(this.host, opts.from); // Bloodlust
    const killer = opts.from ? this.state.mobs.get(opts.from) : undefined;
    if (killer?.kind === "hidemother" && !killer.dead) this.bossSay(opts.from!, URSK.lines.kill);
    if (killer?.kind === "sunwright" && !killer.dead) this.bossSay(opts.from!, SUNWRIGHT.lines.kill);
    if (killer?.kind === "rivenking" && !killer.dead) this.bossSay(opts.from!, RIVEN_KING.lines.kill);
    t.guarding = false;
    // No magic in Oakvale: dying pays for it, the hero comes back a free citizen (villagers and watch stand down)
    this.setOutlaw(tid, t, false);
    this.broadcast("kill", { killer: byName, victim: t.name });
    // The victim gets a "You died - killed by ..." screen until they respawn
    this.clients.find((c) => c.sessionId === tid)?.send("died", { by: byName, ms: RESPAWN_MS });
    this.clock.setTimeout(() => {
      if (!this.state.players.has(tid)) return;
      // back at the act's own town (the moors: Cairnwatch; the badlands: the Rustwater Post); Act 1: Oakvale, or Saltmere when nearer and its waystone is woken
      // a hero who bound a capital of their clan as home wakes there when it is nearer, in the same land only (server/warCapitals.ts)
      const s = respawnAt(t, t.x, t.y, actSpawn(actAt(t.y, t.x), () => act1Home(t.x, t.y, (id) => t.portals.has(id))));
      t.x = s.x; t.y = s.y; t.hp = t.maxHp; t.dead = false;
      if (usesGauge(t.cls)) { t.mana = 0; this.syncMana(t); } // the song gauge starts over empty
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
    if (def.mana && !usesGauge(a.cls)) { // a wand spends mana on every bolt (shared/mana.ts); a song gauge is not Mana
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
    // Summoner finisher: part of the burst is in the attuned element (ComboHit.attune)
    if (hit.attune && a.cls === "summoner") {
      const amt = dmg * hit.attune, el = attuneOf(a.attune);
      dmg = Math.max(1, Math.round(dmg - amt));
      const p = split.parts.find((x) => x.el === el);
      if (p) p.amt += amt; else split.parts.push({ el, amt });
    }
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
    gaugeSwing(a as unknown as Unit, now); // a Songweaver's swing holds her song gauge's drain off (DI-3)
    this.broadcast("swing", { id, step, variant, ax: off[0], ay: off[1], w: def.type });

    if (hit.lunge) {
      for (let moved = 0; moved < hit.lunge; moved += 2) {
        const r = moveStep(a.x, a.y, pushInput(off), 1, 2);
        if (r.x === a.x && r.y === a.y) break;
        a.x = r.x; a.y = r.y;
      }
    }

    if (def.projectile) {
      const sid = this.shoot(a, id, dmg, hit.knockback, hit.shotScale ?? 1, 0, def.projectile, parts);
      const s = this.state.projectiles.get(sid);
      if (s && hit.burst) s.burst = hit.burst;
      if (s && def.type === "lute" && a.cls === "songweaver") {
        // the Songweaver's lute: a sound wave, and the combo step is a note (pluck, pluck, strum)
        const mode = a.sk.mode ?? "major", deg = step === 1 ? "V" : "I";
        s.sound = { pitch: "M", deg, mode, basic: true, res: step === 2 ? RESONANCE.basic : 0, strum: step === 2 };
        stringShot(s, a as unknown as Unit, true); // Steel and Silk Strings (DI-5)
        this.broadcast("sfx", { ev: "note", id, s: "basic", deg, mode, pitch: "M", x: Math.round(a.x), y: Math.round(a.y) });
      }
      return;
    }

    const reachMult = gearReachMult(this.equipped(a)); // long weapons
    const reach = (hit.range ?? def.attackRange) * reachMult;
    const hx = a.x + off[0] * SWING_AHEAD * reachMult, hy = a.y + off[1] * SWING_AHEAD * reachMult;
    // Monsters are hit on their body, not only at their feet (big ones are wide)
    const ids = this.targetsAround(hx, hy, reach, id, (m) => mobBody(m.kind));
    // ...and monsters that were in reach a moment ago, where the hero's screen still showed them (REWIND_MS)
    const since = now - REWIND_MS, R = reach + 16;
    for (const [mid, m] of this.state.mobs.inBox(hx, hy, R + 24)) {
      if (m.dead || m.hidden || ids.includes(mid)) continue;
      const h = m.hist, r = reach + mobBody(m.kind);
      // newest first; the first sample older than the window still counts (it stood there into the window)
      for (let i = h.length - 3; i >= 0; i -= 3) {
        if (Math.hypot(h[i + 1] - hx, h[i + 2] - hy) <= r) { ids.push(mid); break; }
        if (h[i] < since) break;
      }
    }
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
    if ("portal" in def && def.portal) this.portalShot(a, id, s);
    const sid = `s${++this.shotSeq}`;
    this.state.projectiles.set(sid, s);
    return sid;
  }

  /**
   * The Summoner's staff bolt goes through the Void (shared/summons.ts PORTAL): when a foe is within the staff's reach
   * near the aim, a second portal opens PORTAL.exitGap px short of it and the bolt comes out there with only
   * PORTAL.exitRange px left to fly. A wall between the hero and that spot keeps the bolt on its normal way.
   */
  private portalShot(a: Player, id: string, s: Projectile) {
    const off = aimOf(a);
    let best: { x: number; y: number } | undefined, bd = Infinity;
    for (const e of this.host.enemies(a.x, a.y, s.range, id)) {
      const t = this.state.players.get(e) ?? this.state.mobs.get(e);
      if (!t) continue;
      const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy) || 1;
      if ((dx * off[0] + dy * off[1]) / d < PORTAL.cone || d >= bd) continue;
      bd = d; best = t;
    }
    if (!best || bd < PORTAL.minDist) return;
    const vx = (best.x - a.x) / bd, vy = (best.y - a.y) / bd;
    const ex = best.x - vx * PORTAL.exitGap, ey = best.y - 4 - vy * PORTAL.exitGap;
    for (let d = 8; d < bd - PORTAL.exitGap; d += 8) if (isSolidAt(a.x + vx * d, a.y - 4 + vy * d)) return;
    if (isSolidAt(ex, ey)) return;
    this.broadcast("sfx", { ev: "portal", id, x1: Math.round(s.x), y1: Math.round(s.y), x2: Math.round(ex), y2: Math.round(ey) });
    s.x = ex; s.y = ey; s.vx = vx; s.vy = vy;
    s.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? "right" : "left") : vy > 0 ? "down" : "up";
    s.range = PORTAL.exitRange;
  }

  /** Secondary ranged weapon (sling, knives, crossbow) on R: its own cooldown, scales with the attack stat. */
  private fireRanged(id: string) {
    const a = this.state.players.get(id);
    const now = Date.now();
    const ranged = a ? this.equipped(a).ranged : undefined;
    const shot = ranged ? gearDef(ranged)?.shot : undefined;
    if (!a || !shot || a.dead || a.stunned || a.broken || a.rolling || a.qlock || now - a.lastRanged < shot.cooldownMs) return;
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
  private buskers = new BuskingLines(); // Oakvale villagers answer a busking tune (server/songs.ts)
  private songs = new SongCollector(); // collected songs and materials per hero (server/songs.ts)
  private chords = new ChordSync(); // the Songweaver's owner-only "chord" message (server/songs.ts)

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
    summon: (id, power) => this.recallGolems(id, power),
    golemEls: (id) => this.golemEls(id),
    wisps: (id, power, n, ms) => this.spawnWisps(id, power, wispEls(this.golemEls(id), n), ms),
    arsenal: (id, power, ms) => this.voidArsenal(id, power, ms),
    voidHop: (owner, tid, swallowed, x, y) => this.voidHop(owner, tid, swallowed, x, y),
    colossus: (id, power, ms) => { this.summonColossus(id, power, ms); },
    brides: (id, power, n, ms, drain) => this.callBrides(id, power, n, ms, drain),
    flesh: (id) => {
      if (this.state.players.has(id)) return true;
      const m = this.state.mobs.get(id);
      return !!m && !!familyOf(m.kind);
    },
    devour: (id, tid, dmg, heal) => this.devour(id, tid, dmg, heal),
    allies: (x, y, r, of) => {
      const me = this.state.players.get(of);
      if (!me?.party) return [];
      return this.members(me.party).filter((pid) => {
        const p = this.state.players.get(pid)!;
        return pid !== of && !p.dead && Math.hypot(p.x - x, p.y - y) <= r;
      });
    },
    charmable: (id) => !!this.charmable(id),
    soundOf: (id) => {
      const p = this.state.players.get(id);
      if (p) return heroSound(p.cls);
      const m = this.state.mobs.get(id);
      return m ? mobSound(m.kind, !!(ELITE[m.kind] || BOSS[m.kind] || m.kind === "nightraider" || m.title)) : undefined;
    },
    charm: (id, tid, ms) => this.charm(id, tid, ms),
    thrall: (id, tid, dmg, power, rank) => this.makeThrall(id, tid, dmg, power, rank),
    isNight: (id) => {
      const u = this.state.players.get(id) ?? this.state.mobs.get(id);
      if (!u) return false;
      if (isUndeadNight(worldDayFrac(Date.now()))) return true;
      let inside = false;
      this.state.fields.forEach((f) => { if (!inside && f.inst.def.night && Math.hypot(u.x - f.x, u.y - f.y) <= f.r) inside = true; });
      return inside;
    },
    hit: (a, t, dmg, push, o) => {
      // Skills crit too (Dexterity), except damage over time and the counters that already crit
      const p = o?.skill && !o.dot && !o.crit ? this.state.players.get(a) : undefined;
      if (p && Math.random() < critChance(this.stats(p), talentBonus(p.cls, p.talents, "crit"))) { dmg *= 2; o = { ...o, crit: true }; }
      this.hitTarget(a, t, dmg, push, o);
    },
    heal: (id, amount, from) => {
      const p = this.state.players.get(id);
      if (!p || p.dead || amount <= 0) return;
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + amount);
      if (p.hp - before >= 3) this.broadcast("heal", { id, amount: Math.round(p.hp - before), ...(from && from !== id ? { by: from } : {}) });
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
      stringShot(s, this.state.players.get(spec.owner) as unknown as Unit | undefined, false); // Silk Strings (DI-5)
      this.state.projectiles.set(`s${++this.shotSeq}`, s);
    },
    addField: (inst) => {
      const f = new Field();
      f.kind = inst.def.kind; f.skill = inst.skill; f.owner = inst.owner; f.x = inst.x; f.y = inst.y; f.r = inst.def.r;
      f.ms = inst.until - Date.now(); f.follow = !!inst.def.follow; f.inst = inst; f.target = inst.target ?? ""; f.ally = !!inst.ally;
      // Only one of each ground effect per hero (recasting a trap moves it)
      this.state.fields.forEach((o, oid) => { if (o.owner === inst.owner && o.skill === inst.skill && inst.def.trap) this.state.fields.delete(oid); });
      this.state.fields.set(`f${++this.fieldSeq}`, f);
    },
    fear: (id, ms) => {
      const now = Date.now();
      const m = this.state.mobs.get(id);
      if (m) {
        // Terrified monsters act like dizzy ones: they run for cover
        if (!m.broken) m.execSpent = false; // a fresh break: one execution (EXECUTE); a longer one keeps its state
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
