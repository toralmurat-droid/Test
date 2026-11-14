// The hero's synced schema (moved out of TownRoom.ts). Owner-only fields sit in the PlayerPrivate child `me`.
import { ArraySchema, MapSchema, Schema, type, view } from "@colyseus/schema";
import type { BountyState } from "../shared/bounty";
import type { ClassKind } from "../shared/classes";
import type { Dir, InputState } from "../shared/constants";
import type { Feast } from "../shared/devour";
import { noPotions, type Potions } from "../shared/potions";
import { newRuntime } from "../shared/skillEngine";
import { SLOT_COUNT } from "../shared/slots";
import type { ClanKey } from "../shared/war/clans";

// Per-client views need a schema buffer that never resizes (a library bug corrupts resized view patches):
// Encoder.BUFFER_SIZE is set in server/patchCopy.ts, imported by the room before its state is created.

/**
 * What only the hero's own client needs. Behind `@view()` on Player.me, so other clients never get it (less to
 * encode and send per patch); the owner's client reads it as `player.me`.
 */
export class PlayerPrivate extends Schema {
  // Timed buffs/debuffs with ms left for the HUD buff row (shared/buffTimers.ts), rewritten only when they change
  @type("string") timers = "";
  // Every quest chain's progress (shared/quests.ts CHAINS, read with chainState): packed quest, step and count under the
  // chain's QuestChain.packed key, one synced field for all of them. A chain not begun has no key (qset drops zeros).
  // readonly: a replaced map would be a new tree the owner's view never saw (see Player.me)
  @type({ map: "number" }) readonly quests = new MapSchema<number>();
  @type("number") kills = 0;
  @type("number") xp = 0;
  @type("number") gold = 0;
  // Healing and mana potions by size (shared/potions.ts), packed in one synced number (packPotions); Player.pots is the server copy
  @type("number") potions = 0;
  // Mana (shared/mana.ts): current, max and mana potions packed in one synced number (packMana); Player.mana / maxMana
  // are the server-side values. Took the old `raging` flag's place (the client reads Rage from `fx`).
  @type("number") mp = 0;
  @type("number") energy = 0; // Heat / overload (shared/overload.ts): 0..100, below 0 = overheated; spells spend mana
  // Skills (shared/skillEngine.ts): stacks built by basic hits, and the speed multiplier from buffs and passives (own
  // movement prediction; other heroes are drawn from their synced x / y, never predicted)
  @type("number") stacks = 0;
  @type("number") spd = 1;
  @type("number") seq = 0; // last processed input sequence (own client's reconciliation and ping)
  // Stat points the player assigned in the hero panel (shared/powers.ts statPoints). Other clients don't get them, so
  // they draw another hero's worn gear without the requirement check (client/src/gear.ts activeOf).
  @type("number") ptSta = 0;
  @type("number") ptStr = 0;
  @type("number") ptMag = 0;
  @type("number") ptDex = 0;
  // Equipment (shared/gear.ts): the unequipped items carried (the worn slots stay public on Player).
  // readonly like quests: edited in place (server/TownRoom.ts setBag clears and refills it), never replaced
  @type(["string"]) readonly bag = new ArraySchema<string>();
  // Skill tree (shared/talents.ts): ranks per talent id. readonly: set / delete / clear, never replaced
  @type({ map: "number" }) readonly talents = new MapSchema<number>();
  // Skill slots on keys 1..0 (shared/slots.ts): a skill id or "" (empty). Empty until the player assigns them.
  // readonly: written by index, never replaced
  @type(["string"]) readonly slots = new ArraySchema<string>(...Array(SLOT_COUNT).fill(""));
}

/**
 * A hero as the room syncs it. Fields only the owner needs live in `me`, which the per-client StateView (TownRoom
 * onJoin) sends to that hero's client alone; the forwarding accessors at the end (timers, quests, kills, xp, gold, potions,
 * mp, energy, stacks, spd, seq, ptSta..ptDex, bag, talents, slots) keep server code reading them as before. The client
 * reads them as `player.me` (client/src/own.ts).
 */
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
  @type("number") level = 1;
  @type("string") emote = ""; // current emote animation ("" = none)
  @type("boolean") outlaw = false; // cast a skill inside Oakvale: the village attacks until they leave (shared/wrath.ts)
  combo = 0; // which hit of the 3-hit combo was thrown last (0..2); server only (the client never reads it)
  pots: Potions = noPotions(); // healing and mana potions by size (shared/potions.ts); synced packed as me.potions
  // Stats with gear (shared/gear.ts heroStats), set by applyStats. Server only: the owner's client computes the same
  // numbers from synced cls, level, me.ptSta..ptDex and the gear slots
  sta = 0;
  str = 0;
  mag = 0;
  dex = 0; // Dexterity: critical hit chance
  @type("boolean") stunned = false;
  @type("boolean") slowed = false;
  // Mana (shared/mana.ts), server-side values; synced packed as me.mp (packMana)
  mana = 0;
  maxMana = 0;
  lastManaPotion = 0;
  @type("boolean") rolling = false; // dodge roll in progress
  @type("boolean") broken = false; // poise broken: dizzy, can't attack (shared/combat.ts)
  // Skills (shared/skillEngine.ts): status words for the effects on screen (burn, mark, active auras and enchantments...),
  // seen by everyone. Stacks and the speed multiplier are owner-only, in `me`.
  @type("string") fx = "";
  // Owner-only data (PlayerPrivate): the per-client view (onJoin) sends it to this hero's client alone
  // Owner-only (StateView in TownRoom onJoin). Two traps, both silent: never replace `me` or a collection inside it after
  // join (the owner's view only holds the trees it was given), and never set a synced Player field to undefined / null
  // (with a @view field on the class, every DELETE on Player goes to the filtered changes, so only the owner sees it).
  @view() @type(PlayerPrivate) readonly me = new PlayerPrivate();
  // Dedupe for me.timers (shared/buffTimers.ts timerSig): rewritten only when the set of effects changes
  timerSig = "";
  timerSeq = 0;
  @type("string") party = ""; // player group id ("" = solo); shared/party.ts
  // Summoner grimoire (shared/summons.ts): the elements of golem 1 and golem 2, packed as el1 + 4 x el2 (indexes into
  // ATTUNE_ORDER; attuneOf(attune) is golem 1's). One number to keep the schema small (Colyseus caps it at 64).
  @type("number") attune = 0;
  golemAt = [0, 0]; // Summoner: when each golem slot rises again (0 = not waiting); server only
  golemSig = ""; // Summoner: the grimoire HUD last sent to them ("golems" message), to send it only when it changes
  grimoireAt = 0; // last grimoire change (throttle)
  bondEssenceAt = 0; // last Essence charge from Stone Bond
  // Equipment (shared/gear.ts): equipped item ids ("" = empty); the unequipped items carried are me.bag (owner-only).
  // Each slot must stay a synced @type field, or the client never sees it (the sword vanished from the menu).
  @type("string") weapon = "";
  @type("string") armour = "";
  @type("string") shoes = "";
  @type("string") hat = "";
  @type("string") shield = "";
  @type("string") ranged = ""; // secondary ranged weapon, fired with R
  gateNoteAt = 0; // last "the waygate is cold" note (Act 2, shared/act2.ts)
  linkLock = ""; // the Mawdeep rope/stair a hero just came out of (shared/dungeon.ts LINKS): not taken again until they step off it
  nextSummon = 0; // when the server may bring back this player's quest fused blob (QuestStep.summon)
  feast: Feast = {}; // Devour (shared/devour.ts): monsters eaten per family, saved; sent to the owner as "feast"

  input: InputState = { up: false, down: false, left: false, right: false };
  lastAttack = 0;
  portals = new Set<string>(); // portal stones this hero has woken (shared/portals.ts; saved, never synced)
  bounty?: BountyState; // bounty board hunt in progress (shared/bounty.ts; saved, sent by message)
  bountyDone = 0;
  clan?: ClanKey; // clan war oath (shared/war/standards.ts; saved, sent by message)
  clanAt = 0;
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
  attackReadyAt = 0;
  lastVariant = -1;
  stunUntil = 0;
  slowUntil = 0;
  lastUlt = -Infinity;
  sk = newRuntime();

  /** The HUD buff row, kept in `me` (owner-only). */
  get timers() { return this.me.timers; }
  set timers(v: string) { this.me.timers = v; }
  /** Every quest chain's progress, kept in `me` (owner-only). Never replace the map: the client's view holds this one. */
  get quests() { return this.me.quests; }
  // Owner-only numbers kept in `me` (other clients never get them): server code, saves and tests read them here as before
  get kills() { return this.me.kills; }
  set kills(v: number) { this.me.kills = v; }
  get xp() { return this.me.xp; }
  set xp(v: number) { this.me.xp = v; }
  get gold() { return this.me.gold; }
  set gold(v: number) { this.me.gold = v; }
  /** Potions packed for the owner's HUD (packPotions); the server's own copy is `pots`. */
  get potions() { return this.me.potions; }
  set potions(v: number) { this.me.potions = v; }
  /** Mana packed for the owner's HUD (packMana); the server's own values are `mana` / `maxMana`. */
  get mp() { return this.me.mp; }
  set mp(v: number) { this.me.mp = v; }
  /** Heat (shared/overload.ts); skill engine code reads it as Unit.energy. */
  get energy() { return this.me.energy; }
  set energy(v: number) { this.me.energy = v; }
  get stacks() { return this.me.stacks; }
  set stacks(v: number) { this.me.stacks = v; }
  /** Speed multiplier: only the owner predicts its own movement with it. */
  get spd() { return this.me.spd; }
  set spd(v: number) { this.me.spd = v; }
  /** Last processed input: only the owner's client acks it. */
  get seq() { return this.me.seq; }
  set seq(v: number) { this.me.seq = v; }
  // Stat points, kept in `me` (owner-only)
  get ptSta() { return this.me.ptSta; }
  set ptSta(v: number) { this.me.ptSta = v; }
  get ptStr() { return this.me.ptStr; }
  set ptStr(v: number) { this.me.ptStr = v; }
  get ptMag() { return this.me.ptMag; }
  set ptMag(v: number) { this.me.ptMag = v; }
  get ptDex() { return this.me.ptDex; }
  set ptDex(v: number) { this.me.ptDex = v; }
  /** Unequipped items, kept in `me`. Getter only: edit in place (setBag in TownRoom.ts), the owner's view holds this array. */
  get bag() { return this.me.bag; }
  /** Talent ranks, kept in `me`. Getter only: set / delete / clear in place, never replace. */
  get talents() { return this.me.talents; }
  /** Skill hotkeys, kept in `me`. Getter only: write by index, never replace. */
  get slots() { return this.me.slots; }
}
