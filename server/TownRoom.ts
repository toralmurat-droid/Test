import type { IncomingMessage } from "node:http";
import { Client, Room } from "colyseus";
import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import {
  BLOB_AI, BROOD, Dir, MERGE, MOTHER, SKELETON_AI, HIT_RADIUS, mobScale, InputState, MOB_ATTACK_RANGE, MOBS, MobKind, rollSkeletonWeapon, SKELETON_BOW, SKELETON_WEAPONS, SkeletonWeapon, REGEN_DELAY_MS, REGEN_RAMP_MS, regenFromStamina, SAFE_REGEN_MULT,
  RESPAWN_MS, TICK_RATE, TILE,
} from "../shared/constants";
import {
  ATTACK_VARIANTS, CLASSES, ClassKind, COMBO_WINDOW_MS, DODGE, EMOTES, ENERGY, DASH_INVULN_MS, GUARD_REDUCTION, isClassKind, levelFromXp, PVP_KILL_XP,
} from "../shared/classes";
import { attackMult, cooldownMult, heroSpeed, magicMult, maxHpFromStats, SLOW_MOB, statsFor, statPoints } from "../shared/powers";
import { activeSkills, canLearn, cleanRanks, skillLearned, skillOf, talentBonus, talentMult, talentReduce } from "../shared/skills";
import {
  afterHit, atkSpeedMult, blocking, buffLifesteal, buffRegen, castSkill, ccImmune, charging, counterHit, dealtMult, FieldInst, newRuntime,
  shotEnd, shotHit, ShotSpec, SkillHost, speedMult, statusOf, takenMult, tickField, tickUnit, Unit,
} from "../shared/skillEngine";
import {
  ITEM_LIFETIME_MS, ItemKind, LOOT, MAX_POTIONS, PICKUP_RADIUS, POTION_COOLDOWN_MS, POTION_HEAL, PVP_GOLD_DROP,
} from "../shared/items";
import { isSafeZone, isSolidAt, randomSpawn } from "../shared/map";
import { npcById, npcNear, TALK_RANGE } from "../shared/npcs";
import { sellPrice, SHOPS } from "../shared/shops";
import { BLOB_KINDS, inZone, npcPresent, QUESTS, questStep, stepGoal, USE_RANGE } from "../shared/quests";
import { findHideSpot, HIDE, noMobsAt, spawnPoint, SPAWN_ZONES, zoneCap } from "../shared/spawns";
import { moveStep } from "../shared/movement";
import { flush, HeroSave, loadHero, login, markChest, openedChests, saveHero } from "./accounts";
import { chestById, chestLock, CHEST_RANGE, CHEST_RESPAWN_MS, CHESTS, GUARD_RESPAWN_MS, rollChest } from "../shared/chests";
import { SLOT_COUNT } from "../shared/slots";
import { heroPoise, MOB_COMBAT, POISE, poiseLevelMult, poiseSpeed } from "../shared/combat";
import {
  BAG_SIZE, Equipped, GEAR, GEAR_SLOTS, GearSlot, gearBlock, gearName, gearReachMult, gearSpeedMult, gearStats, isGearId, potionChance, rollGear,
} from "../shared/gear";
import { Asker, boardFor, submit, tick as ideaTick, vote as ideaVote } from "../shared/ideas";
import { hashAddr, ideaLog, saveIdeas } from "./ideaStore";

export class Player extends Schema {
  @type("string") name = "";
  @type("string") cls: ClassKind = "knight";
  @type("number") color = 0xffffff;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("string") dir: Dir = "down";
  // Aim: unit vector of the last movement direction, diagonals included (attacks and shots go this way)
  @type("number") ax = 0;
  @type("number") ay = 1;
  @type("boolean") moving = false;
  @type("number") hp = 100;
  @type("number") maxHp = 100;
  @type("boolean") dead = false;
  @type("boolean") guarding = false; // knight shield up
  @type("number") kills = 0;
  @type("number") xp = 0;
  @type("number") level = 1;
  @type("string") emote = ""; // current emote animation ("" = none)
  @type("number") combo = 0; // which hit of the 3-hit combo was thrown last (0..2)
  @type("number") gold = 0;
  @type("number") potions = 0;
  @type("number") seq = 0; // last processed input sequence (for client reconciliation)
  // Stats, auto-allocated on level up (see shared/powers.ts)
  @type("number") sta = 0;
  @type("number") str = 0;
  @type("number") mag = 0;
  // Stat points the player assigned in the hero panel (shared/powers.ts statPoints)
  @type("number") ptSta = 0;
  @type("number") ptStr = 0;
  @type("number") ptMag = 0;
  @type("boolean") stunned = false;
  @type("boolean") slowed = false;
  @type("boolean") raging = false; // barbarian Rage active
  @type("boolean") rolling = false; // dodge roll in progress
  @type("boolean") broken = false; // poise broken: dizzy, can't attack (shared/combat.ts)
  @type("number") energy = 100; // Stamina / Magic (ENERGY in shared/classes.ts)
  // Skills (shared/skillEngine.ts): stacks built by basic hits, speed multiplier from buffs and passives (client
  // prediction), and status words for the effects on screen (burn, mark, active auras and enchantments...)
  @type("number") stacks = 0;
  @type("number") spd = 1;
  @type("string") fx = "";
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
  // Skill slots on keys 1..0 (shared/slots.ts): a skill id or "" (empty). Empty until the player assigns them.
  @type(["string"]) slots = new ArraySchema<string>(...Array(SLOT_COUNT).fill(""));

  input: InputState = { up: false, down: false, left: false, right: false };
  lastAttack = 0;
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
  lastHurt = 0;
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
  @type("number") merged = 1; // blobs inside this one (MERGE): the client draws it bigger
  @type("string") guard = ""; // id of the loot chest it guards (shared/chests.ts): the chest stays locked while it lives
  @type("string") parts = ""; // kinds of the blobs swallowed, comma-separated: the client paints their colours, eyes and mouths on it
  mergeInto = ""; // answering a call: id of the blob it is rushing to fuse with
  mergeCap = 0; // most blobs this one may hold (set at its first call)
  canShoot = false; canCharge = false; canHeal = false; // abilities picked up by merging
  nextCall = 0; nextShot = 0;

  spot = ""; // hiding spot (tile "x,y") it is heading to or sitting in
  spotX = 0; spotY = 0; outX = 0; outY = 0; // spot centre, and the walkable tile it steps in/out from
  seekUntil = 0; // give up reaching the spot after this
  hideUntil = 0; // leaves the spot on its own after this
  fleeing = false; // dizzy and running for cover
  chargeUntil = 0; nextCharge = 0; // warrior blob lunge
  nextHeal = 0; // healer blob
  specialKind = ""; specialAt = 0; nextBounce = 0; nextSlam = 0; // mother blob special moves (necromancer casts too)
  nextRaise = 0; nextCircle = 0; castX = 0; castY = 0; // necromancer: raise dead, Death Circle aim
  @type("number") x = 0;
  @type("number") y = 0;
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
  @type("number") x = 0;
  @type("number") y = 0;
  @type("string") dir: Dir = "down";
  @type("number") vx = 0; // flight direction (unit vector, may be diagonal)
  @type("number") vy = 1;
  @type("string") owner = "";
  @type("number") size = 1; // visual scale (combo finisher fireballs are bigger)
  @type("string") kind = "fireball"; // "fireball" | "arrow" (client picks the visual)

  knockback = 1;
  basic = false; // a basic attack (builds stacks, carries enchantments)
  spec?: ShotSpec; // a skill projectile (shared/skillEngine.ts)
  pierce = 0; // extra targets it can pass through
  mobLevel = 0; // > 0: a monster's shot (only hurts players); its level, kept even if the shooter dies mid-flight
  mobName = "";
  hitIds = new Set<string>();
  traveled = 0;
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

export class TownState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Mob }) mobs = new MapSchema<Mob>();
  @type({ map: Projectile }) projectiles = new MapSchema<Projectile>();
  @type({ map: Item }) items = new MapSchema<Item>();
  @type({ map: Zone }) zones = new MapSchema<Zone>();
  @type({ map: Field }) fields = new MapSchema<Field>();
}

/** Extra effects of a hit. */
interface HitOpts {
  atkLevel?: number; kb?: number; stunMs?: number; slowMs?: number; crit?: boolean; skill?: boolean;
  basic?: boolean; dot?: boolean; thorn?: boolean; burn?: [number, number]; markMs?: number; weakMs?: number; fearMs?: number;
  from?: string; // attacker id (hero or monster), for counters and thorns
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

const mobPoiseMax = (m: Mob) => MOB_COMBAT[m.kind].poise * mobScale(m.level, "hp");
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

/** Monsters with no player within this many px (square) doze until someone comes by. */
const SLEEP_RANGE = 40 * TILE;

/** Monsters that fight from range: how close they let you come, how far they chase, and their shot (none for healers). */
type RangedCfg = { keepAway: number; far: number; range: number; shot: string; shotSpeed: number; shotRadius: number; mult?: number };
const RANGED: Partial<Record<MobKind, RangedCfg>> = {
  shooterblob: { ...BLOB_AI.shooter, far: BLOB_AI.shooter.range * 0.85, shot: "slimeball" },
  healerblob: { keepAway: BLOB_AI.healer.keepAway, far: BLOB_AI.healer.range, range: BLOB_AI.healer.range, shot: "", shotSpeed: 0, shotRadius: 0 },
  skeletonmage: { ...SKELETON_AI.mage, far: SKELETON_AI.mage.range * 0.85, shot: "magicbolt" },
  necromancer: { ...SKELETON_AI.necro, far: SKELETON_AI.necro.range * 0.8, shot: "shadowbolt", mult: SKELETON_AI.necro.boltMult },
};

const BOW_SKELETON: RangedCfg = { ...SKELETON_BOW, range: SKELETON_WEAPONS.bow.range, far: SKELETON_WEAPONS.bow.range * 0.85, shot: "arrow", mult: SKELETON_WEAPONS.bow.dmg };
const rangedOf = (m: Mob): RangedCfg | undefined => m.kind === "skeleton" && m.weapon === "bow" ? BOW_SKELETON : RANGED[m.kind];
/** Melee reach, damage, cooldown and wind-up of a monster (skeletons depend on their weapon). */
const meleeOf = (m: Mob) => {
  const w = m.kind === "skeleton" ? SKELETON_WEAPONS[(m.weapon || "sword") as SkeletonWeapon] : undefined;
  return { range: w?.range ?? MOB_ATTACK_RANGE, dmg: w?.dmg ?? 1, cooldown: w?.cooldown ?? 1, windupMs: w?.windupMs ?? MOB_COMBAT[m.kind].windupMs };
};

export class TownRoom extends Room<TownState> {
  maxClients = 50;
  private mobSeq = 0;
  private shotSeq = 0;
  private itemSeq = 0;

  onCreate() {
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

    this.onMessage("input", (client, msg: InputState & { seq: number }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.input = { up: !!msg.up, down: !!msg.down, left: !!msg.left, right: !!msg.right };
      p.seq = msg.seq | 0;
    });

    this.onMessage("attack", (client) => this.playerAttack(client.sessionId));
    this.onMessage("cast", (client, skill: string) => this.cast(client.sessionId, skill));
    this.onMessage("potion", (client) => this.drinkPotion(client.sessionId));
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

    this.onMessage("quest", (client) => this.advanceQuest(client.sessionId));
    this.onMessage("use", (client, msg: { id: string }) => this.useQuestObject(client.sessionId, msg?.id));
    this.onMessage("chest", (client, msg: { id: string }) => this.openChest(client, msg?.id));
    this.onMessage("chests", (client) => this.sendChests(client));
    this.onMessage("buy", (client, msg: { i: number }) => this.shopBuy(client, msg?.i));
    this.onMessage("sell", (client, msg: { i: number }) => this.shopSell(client, msg?.i));

    // Player ideas: suggest (once a day), vote, and every hour the best idea wins (shared/ideas.ts)
    this.onMessage("idea", (client, text: string) => this.submitIdea(client, text));
    this.onMessage("ideavote", (client, msg: { id: number; v: number }) => this.voteIdea(client, Number(msg?.id), Number(msg?.v)));
    this.onMessage("ideas", (client) => this.sendBoard(client));
    this.clock.setInterval(() => this.ideaRound(), 5000);

    this.onMessage("chat", (client, text: string) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof text !== "string") return;
      const idea = text.trim().match(/^\/idea\s+([\s\S]+)$/i);
      if (idea) return this.submitIdea(client, idea[1]);
      const v = text.trim().match(/^\/(up|down|unvote)\s+#?(\d+)$/i);
      if (v) return this.voteIdea(client, Number(v[2]), v[1].toLowerCase() === "up" ? 1 : v[1].toLowerCase() === "down" ? -1 : 0);
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

  onJoin(client: Client, options: { name?: string; color?: number; cls?: string }, auth?: { name: string }) {
    const p = new Player();
    p.name = auth?.name ?? `Hero${Math.floor(Math.random() * 1000)}`;
    p.color = typeof options?.color === "number" ? options.color : COLORS[Math.floor(Math.random() * COLORS.length)];
    p.cls = isClassKind(options?.cls) ? options.cls : "knight";
    const save = loadHero(p.name, p.cls);
    if (save) this.restore(p, save);
    this.applyStats(p);
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
    this.state.players.delete(client.sessionId);
    this.addrs.delete(client.sessionId);
  }

  onDispose() {
    this.state.players.forEach((p) => saveHero(p.name, p.cls, this.snapshot(p)));
    flush();
  }

  // ---- Saves (server/accounts.ts) -------------------------------------------

  private snapshot(p: Player): HeroSave {
    const talents: Record<string, number> = {};
    p.talents.forEach((v, k) => { talents[k] = v; });
    return {
      color: p.color, xp: p.xp, level: p.level, kills: p.kills, gold: p.gold, potions: p.potions,
      ptSta: p.ptSta, ptStr: p.ptStr, ptMag: p.ptMag,
      weapon: p.weapon, armour: p.armour, shoes: p.shoes, hat: p.hat, shield: p.shield, ranged: p.ranged,
      bag: p.bag.toArray(), talents, slots: p.slots.toArray(),
      questId: p.questId, questStage: p.questStage, questCount: p.questCount,
    };
  }

  private restore(p: Player, s: HeroSave) {
    const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    const gear = (v: unknown) => (typeof v === "string" && isGearId(v) ? v : "");
    p.color = num(s.color, p.color);
    p.xp = num(s.xp); p.level = Math.max(1, num(s.level, 1)); p.kills = num(s.kills);
    p.gold = num(s.gold); p.potions = Math.min(MAX_POTIONS, num(s.potions));
    p.ptSta = num(s.ptSta); p.ptStr = num(s.ptStr); p.ptMag = num(s.ptMag);
    p.weapon = gear(s.weapon); p.armour = gear(s.armour); p.shoes = gear(s.shoes);
    p.hat = gear(s.hat); p.shield = gear(s.shield); p.ranged = gear(s.ranged);
    if (Array.isArray(s.bag)) setBag(p, s.bag.map(gear).filter(Boolean).slice(0, BAG_SIZE));
    // Old saves (before the skill tree rework) had other skill ids: those points come back to spend again
    for (const [k, v] of Object.entries(cleanRanks(p.cls, p.level, s.talents ?? {}))) p.talents.set(k, v);
    if (Array.isArray(s.slots)) s.slots.slice(0, SLOT_COUNT).forEach((v, i) => {
      p.slots[i] = typeof v === "string" && skillLearned(p.cls, p.talents, v) && skillOf(p.cls, v)?.passive === undefined ? v : "";
    });
    p.questId = Math.min(QUESTS.length, num(s.questId)); p.questStage = num(s.questStage); p.questCount = num(s.questCount);
  }

  private spawnMob(kind: MobKind, zi: number, id = `m${++this.mobSeq}`) {
    const def = MOBS[kind];
    const home = spawnPoint(SPAWN_ZONES[zi], kind);
    const m = this.state.mobs.get(id) ?? new Mob();
    m.kind = kind;
    m.weapon = kind === "skeleton" ? rollSkeletonWeapon() : "";
    m.zone = zi;
    m.x = m.homeX = home.x;
    m.y = m.homeY = home.y;
    m.level = home.level;
    m.hp = m.maxHp = Math.round(def.maxHp * mobScale(m.level, "hp"));
    m.dead = false;
    m.target = "";
    m.hidden = false; m.spot = ""; m.fleeing = false;
    m.specialKind = ""; m.specialAt = 0; m.nextBounce = 0; m.nextSlam = 0; m.nextRaise = 0; m.nextCircle = 0;
    m.merged = 1; m.parts = ""; m.mergeInto = ""; m.mergeCap = 0; m.nextCall = 0; m.nextShot = 0;
    m.canShoot = kind === "shooterblob"; m.canCharge = kind === "warriorblob"; m.canHeal = kind === "healerblob";
    if (kind === "motherblob") m.nextBrood = Date.now() + BROOD.minMs + Math.random() * (BROOD.maxMs - BROOD.minMs);
    if (!this.state.mobs.has(id)) this.state.mobs.set(id, m);
  }

  // ---- Special blobs --------------------------------------------------------

  /** Ranged monsters' shot at (tx,ty): shooter blob slime ball, skeleton mage magic bolt, necromancer shadow bolt. Only hurts players. */
  private mobShot(m: Mob, id: string, tx: number, ty: number, cfg: RangedCfg = rangedOf(m)!) {
    const s = new Projectile();
    const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy) || 1;
    s.x = m.x; s.y = m.y - 4; s.vx = dx / d; s.vy = dy / d;
    s.owner = id; s.kind = cfg.shot; s.mobLevel = m.level || 1; s.mobName = MOBS[m.kind].name;
    s.speed = cfg.shotSpeed; s.range = cfg.range * 1.4; s.radius = cfg.shotRadius;
    s.damage = Math.round(MOBS[m.kind].damage * mobScale(m.level, "damage") * (cfg.mult ?? 1));
    this.state.projectiles.set(`s${++this.shotSeq}`, s);
    this.broadcast("swing", { id });
  }

  /** Healer blob mends the most hurt blob (itself included) within range. */
  private blobHeal(m: Mob, id: string, now: number) {
    m.nextHeal = now + BLOB_AI.healer.everyMs;
    let best: Mob | undefined, bestId = "", worst = 0.999;
    this.state.mobs.forEach((o, oid) => {
      if (o.dead || o.hidden || !BLOB_KINDS.includes(o.kind as MobKind) || Math.hypot(o.x - m.x, o.y - m.y) > BLOB_AI.healer.range) return;
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

  // ---- Blob merging -----------------------------------------------------------

  /** Blobs that can call for help and fuse (not Mother Blobs). */
  private static canMerge(m: Mob) { return m.kind !== "motherblob" && BLOB_KINDS.includes(m.kind); }

  /** In danger: call the blobs around to fuse into this one, up to its cap. */
  private blobCall(m: Mob, id: string, now: number) {
    m.nextCall = now + MERGE.callEveryMs;
    m.mergeCap ||= m.level < MERGE.highLevel ? MERGE.capLow : MERGE.capHigh;
    let room = m.mergeCap - m.merged;
    this.state.mobs.forEach((o) => { if (o.mergeInto === id && !o.dead) room -= o.merged; });
    if (room <= 0) return;
    const near: [number, string, Mob][] = [];
    this.state.mobs.forEach((o, oid) => {
      if (o === m || o.dead || o.hidden || o.mergeInto || !TownRoom.canMerge(o)) return;
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
    if (called) this.broadcast("blobcall", { id });
  }

  /** o melts into h: levels, HP and abilities add up; o is gone (its zone brings a fresh one back later). */
  private absorb(h: Mob, hid: string, o: Mob, oid: string) {
    h.merged += o.merged; h.level += o.level;
    h.parts = [h.parts, o.kind, o.parts].filter(Boolean).join(",");
    h.maxHp += o.maxHp; h.hp = Math.min(h.maxHp, h.hp + o.hp);
    h.canShoot ||= o.canShoot; h.canCharge ||= o.canCharge; h.canHeal ||= o.canHeal;
    o.dead = true; o.hp = 0; o.mergeInto = ""; o.moving = false;
    this.state.mobs.forEach((c) => { if (c.mergeInto === oid) c.mergeInto = ""; });
    if (o.zone < 0) this.clock.setTimeout(() => this.state.mobs.delete(oid), 500);
    else { const zone = this.state.zones.get(SPAWN_ZONES[o.zone].name); if (zone) zone.alive--; }
    this.broadcast("blobmerge", { into: hid, from: oid, x: Math.round(o.x), y: Math.round(o.y), level: h.level, merged: h.merged });
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
          this.damagePlayer(pid, dmg, "Necromancer's Death Circle", d > 0.1 ? [dx / d, dy / d] : [0, 1], 1.5, { atkLevel: m.level, from: id });
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

  // ---- Tick ---------------------------------------------------------------

  private update(dtMs: number) {
    const dt = dtMs / 1000;
    const now = Date.now();
    this.state.players.forEach((p, pid) => {
      tickUnit(this.host, pid);
      p.stunned = now < p.stunUntil;
      p.slowed = now < p.slowUntil;
      p.raging = p.sk.buffs.some((b) => b.until > now && (b.id === "b_rage" || b.id === "b_berserk"));
      p.guarding = blocking(p, now);
      p.stacks = p.sk.stacks;
      const fx = statusOf(p, now);
      if (p.fx !== fx) p.fx = fx;
      const spd = Math.round(speedMult(p, now) * talentMult(p.cls, p.talents, "speed") * 1000) / 1000;
      if (p.spd !== spd) p.spd = spd;
      tickPoise(p, heroPoiseMax(p), dt, now);
      if (p.dead) { p.moving = false; p.energy = ENERGY.max; return; }
      this.checkQuestPlace(pid, p);
      if (p.energy < ENERGY.max) p.energy = Math.min(ENERGY.max, p.energy + ENERGY.regenPerSec * dt);
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
    });
    this.state.items.forEach((it, id) => { if (now > it.expires) this.state.items.delete(id); });
    this.state.mobs.forEach((m, id) => {
      tickUnit(this.host, id);
      const fx = statusOf(m, now);
      if (m.fx !== fx) m.fx = fx;
      this.updateMob(m, id, dt, now);
    });
    this.updateZones(now);
    this.updateGuards(now);
    this.state.projectiles.forEach((s, id) => this.updateProjectile(s, id, dt));
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
    m.level = Math.max(1, c.level - 1);
    m.hp = m.maxHp = Math.round(MOBS[kind].maxHp * mobScale(m.level, "hp"));
  }

  /** Living guardians of a chest (near it: one lured far away still counts until it dies). */
  private guardsAlive(cid: string): number {
    let n = 0;
    this.state.mobs.forEach((m) => { if (m.guard === cid && !m.dead) n++; });
    return n;
  }

  /** Per-zone respawn timers: while a zone is below its cap, revive one dead monster every respawnMs. */
  private updateZones(now: number) {
    SPAWN_ZONES.forEach((z, zi) => {
      const zone = this.state.zones.get(z.name)!;
      if (zone.alive >= zone.cap) { zone.nextAt = 0; if (zone.nextIn) zone.nextIn = 0; return; }
      if (!zone.nextAt) zone.nextAt = now + z.respawnMs;
      if (now >= zone.nextAt) {
        let revived = false;
        this.state.mobs.forEach((m, id) => {
          if (revived || !m.dead || m.zone !== zi) return;
          this.spawnMob(m.kind, zi, id);
          revived = true;
        });
        if (revived) zone.alive++;
        zone.nextAt = zone.alive < zone.cap ? now + z.respawnMs : 0;
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
    const def = MOBS[m.kind];
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
        if (!isSafeZone(r.x, r.y) && !noMobsAt(r.x, r.y)) { m.x = r.x; m.y = r.y; }
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
    // Look for the nearest player in aggro range
    if (!t) {
      let best = def.aggroRange;
      this.state.players.forEach((p, pid) => {
        if (p.dead || isSafeZone(p.x, p.y)) return;
        const d = Math.hypot(p.x - m.x, p.y - m.y);
        if (d < best && Math.hypot(p.x - m.homeX, p.y - m.homeY) < def.leash) { best = d; m.target = pid; t = p; }
      });
    }

    // Dizzy: run for the nearest grave/tree if there is one
    if (t && m.broken && !m.spot && HIDE.spots[m.kind]) this.claimSpot(m, m.x, m.y, HIDE.fleeRadius, now, true);
    // Heading for a hiding spot (a calm monster forgets it as soon as it has someone to fight)
    if (m.spot && !m.fleeing && t) m.spot = "";
    if (m.spot && now > m.seekUntil) { m.spot = ""; m.fleeing = false; }
    if (m.spot) {
      if (Math.hypot(m.outX - m.x, m.outY - m.y) < 5) return this.hide(m, id, now);
      const go = toward(m.x, m.y, m.outX, m.outY);
      const r = moveStep(m.x, m.y, go, dt, def.speed * (m.fleeing ? POISE.fleeSpeed : 0.6) * (m.slowed ? SLOW_MOB : 1));
      if (!isSafeZone(r.x, r.y) && !noMobsAt(r.x, r.y)) { m.x = r.x; m.y = r.y; }
      m.moving = r.moving;
      m.dir = dirFromInput(go, m.dir);
      return;
    }

    if (m.canHeal && now >= m.nextHeal) this.blobHeal(m, id, now);
    // A blob in danger calls for help
    if (t && TownRoom.canMerge(m) && now >= m.nextCall && !m.broken) {
      let crowd = 0;
      this.state.players.forEach((p) => { if (!p.dead && Math.hypot(p.x - m.x, p.y - m.y) <= MERGE.crowdRange) crowd++; });
      if (m.hp < m.maxHp * MERGE.hpFrac || crowd >= MERGE.crowd) this.blobCall(m, id, now);
    }

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
      input = dist < cfg.keepAway ? toward(m.x, m.y, m.x * 2 - t.x, m.y * 2 - t.y) : dist > cfg.far ? toward(m.x, m.y, t.x, t.y) : STILL;
      if (m.kind === "necromancer" && this.necroSpell(m, id, t, dist, now)) input = STILL;
      else if (cfg.shot) {
        if (m.windUntil) {
          input = STILL;
          if (now >= m.windUntil) {
            m.windUntil = 0; m.winding = false; m.lastAttack = now;
            if (dist <= cfg.range * 1.2) this.mobShot(m, id, t.x, t.y);
          }
        } else if (dist <= cfg.range && now - m.lastAttack >= def.attackCooldownMs * melee.cooldown / poiseSpeed(poiseFrac(m, mobPoiseMax(m)))) {
          m.windUntil = now + melee.windupMs; m.winding = true;
        }
      }
      if (input === STILL) m.dir = Math.abs(t.x - m.x) > Math.abs(t.y - m.y) ? (t.x > m.x ? "right" : "left") : (t.y > m.y ? "down" : "up");
    } else if (t && m.kind === "motherblob" && this.motherSpecial(m, id, Math.hypot(t.x - m.x, t.y - m.y), now)) {
      input = STILL;
    } else if (t) {
      const dist = Math.hypot(t.x - m.x, t.y - m.y);
      // Warrior blob: lunge at a target a few steps away
      if (m.canCharge && !m.windUntil && now >= m.nextCharge && dist >= BLOB_AI.warrior.chargeMin && dist <= BLOB_AI.warrior.chargeMax) {
        m.chargeUntil = now + BLOB_AI.warrior.chargeMs; m.nextCharge = now + BLOB_AI.warrior.cooldownMs;
        this.broadcast("blobcharge", { id });
      }
      const melee = meleeOf(m);
      // Merged blob that swallowed a shooter: spits slime balls while closing in
      if (m.merged > 1 && m.canShoot && !m.windUntil && now >= m.nextShot && dist > melee.range * 2 && dist <= BLOB_AI.shooter.range) {
        m.nextShot = now + MERGE.shotEveryMs;
        this.mobShot(m, id, t.x, t.y, RANGED.shooterblob!);
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
              this.damagePlayer(m.target, Math.round(def.damage * melee.dmg * mobScale(m.level, "damage")), def.name, DIR_OFFSET[m.dir], 1, { atkLevel: m.level, from: id });
            }
          }
        } else if (now - m.lastAttack >= def.attackCooldownMs * melee.cooldown / poiseSpeed(poiseFrac(m, mobPoiseMax(m)))) {
          m.windUntil = now + melee.windupMs; m.winding = true; // telegraph, a hit interrupts it
        }
      } else {
        input = toward(m.x, m.y, t.x, t.y);
      }
    } else if (Math.hypot(m.x - m.homeX, m.y - m.homeY) > 40) {
      input = toward(m.x, m.y, m.homeX, m.homeY); // walk back home
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

    const charge = now < m.chargeUntil ? BLOB_AI.warrior.chargeMult : 1;
    const speed = (t ? def.speed * (m.broken ? POISE.fleeSpeed : 1) * charge : def.speed * 0.5) * (m.slowed ? SLOW_MOB : 1);
    const r = moveStep(m.x, m.y, input, dt, speed);
    if (!isSafeZone(r.x, r.y) && !noMobsAt(r.x, r.y)) { m.x = r.x; m.y = r.y; }
    m.moving = r.moving;
    m.dir = dirFromInput(input, m.dir);
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
      if (s.mobLevel > 0) {
        // A monster's shot only hits players, once: it is used up on the first player it can hurt.
        // (It used to stay alive unless the hit was a kill, so it pushed and hurt the player every tick.)
        const now = Date.now();
        let pid = "";
        this.state.players.forEach((p, k) => {
          if (!pid && !p.dead && !isSafeZone(p.x, p.y) && now >= p.invulnUntil && Math.hypot(p.x - s.x, p.y - s.y) <= s.radius + HIT_RADIUS) pid = k;
        });
        if (pid) {
          this.damagePlayer(pid, s.damage, s.mobName, [s.vx, s.vy], 0.5, { atkLevel: s.mobLevel });
          return this.explode(s, id, pid);
        }
        continue;
      }
      const hit = this.firstTargetAt(s.x, s.y, s.radius + HIT_RADIUS, s.owner, s.hitIds);
      if (hit) {
        if (s.spec) shotHit(this.host, s.spec, hit);
        else this.hitTarget(s.owner, hit, s.damage, [s.vx, s.vy], { kb: s.knockback, basic: s.basic });
        // Piercing arrows keep flying through a few targets
        if (s.pierce > 0) { s.pierce--; s.hitIds.add(hit); continue; }
        return this.explode(s, id, hit);
      }
    }
  }

  private explode(s: Projectile, id: string, _directHit = "") {
    this.broadcast("boom", { x: s.x, y: s.y, r: s.spec?.explode ?? 0, kind: s.kind });
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
    if (Math.random() < potionChance(def.potionChance, level)) this.dropItem("potion", x, y, 1);
    const gear = rollGear(kind, level);
    if (gear) this.dropItem("gear", x, y, 1, gear);
  }

  private pickUp(p: Player, pid: string) {
    this.state.items.forEach((it, id) => {
      if (Math.hypot(it.x - p.x, it.y - p.y) > PICKUP_RADIUS) return;
      if (it.kind === "quest") {
        if (it.owner !== pid) return; // someone else's quest drop
        const s = questStep(p);
        this.state.items.delete(id);
        if (s?.type !== "collect" || s.item !== it.gear) return; // left over from an earlier step
        this.clients.find((c) => c.sessionId === pid)?.send("pickup", { kind: it.kind, amount: 1, x: it.x, y: it.y, gear: it.gear, name: "" });
        this.questProgress(pid, p, p.questCount + 1);
        return;
      }
      if (it.kind === "potion") {
        if (p.potions >= MAX_POTIONS) return; // full: leave it on the ground
        p.potions += it.amount;
      } else if (it.kind === "gear") {
        if (p.bag.length >= BAG_SIZE || !isGearId(it.gear)) return; // bag full: leave it
        setBag(p, [...bagItems(p), it.gear]);
      } else {
        p.gold += it.amount;
      }
      this.state.items.delete(id);
      this.clients.find((c) => c.sessionId === pid)?.send("pickup", { kind: it.kind, amount: it.amount, x: it.x, y: it.y, gear: it.gear, name: it.gear ? gearName(it.gear, p.cls) : "" });
    });
  }

  private drinkPotion(id: string) {
    const p = this.state.players.get(id);
    const now = Date.now();
    if (!p || p.dead || p.potions <= 0 || p.hp >= p.maxHp || now - p.lastPotion < POTION_COOLDOWN_MS) return;
    p.lastPotion = now;
    p.potions--;
    const heal = Math.round(p.maxHp * POTION_HEAL);
    p.hp = Math.min(p.maxHp, p.hp + heal);
    this.broadcast("heal", { id, amount: heal });
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
    if (!p || (k !== "sta" && k !== "str" && k !== "mag")) return;
    if (p.ptSta + p.ptStr + p.ptMag >= statPoints(p.level)) return;
    if (k === "sta") p.ptSta++; else if (k === "str") p.ptStr++; else p.ptMag++;
    this.applyStats(p);
  }

  /** Free reset of stat points, only out of combat. */
  private resetStats(id: string) {
    const p = this.state.players.get(id);
    if (!p || p.dead || Date.now() - p.lastHurt < 5000) return;
    p.ptSta = p.ptStr = p.ptMag = 0;
    this.applyStats(p);
  }

  // ---- Skill tree ---------------------------------------------------------

  private learnTalent(id: string, tid: string) {
    const p = this.state.players.get(id);
    if (!p || typeof tid !== "string" || !canLearn(p.cls, p.level, p.talents, tid)) return;
    const first = !p.talents.get(tid);
    p.talents.set(tid, (p.talents.get(tid) ?? 0) + 1);
    const sk = skillOf(p.cls, tid)!;
    if (first && !sk.passive) {
      this.broadcast("power", { id, name: sk.name });
      // A new active goes on the first free key
      const free = p.slots.toArray().indexOf("");
      if (free >= 0) p.slots.setAt(free, tid);
    }
    this.applyStats(p);
  }

  private cast(id: string, skill: string) {
    const p = this.state.players.get(id);
    if (!p || typeof skill !== "string" || p.rolling) return;
    if (castSkill(this.host, id, skill)) p.emote = "";
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

  private equipped(p: Player): Equipped {
    return Object.fromEntries(GEAR_SLOTS.map((s) => [s, p[s]]));
  }

  /** Wear the bag item at index `i`; whatever was in that slot goes back to the bag. */
  private equip(id: string, i: number) {
    const p = this.state.players.get(id);
    if (!p || typeof i !== "number" || i < 0 || i >= p.bag.length) return;
    const gid = p.bag.at(i), def = gid ? GEAR[gid] : undefined;
    if (!gid || !def) return;
    const slot: GearSlot = def.slot;
    const old = p[slot];
    const items = [...bagItems(p)];
    if (old) items[i] = old; else items.splice(i, 1);
    setBag(p, items);
    p[slot] = gid;
    this.applyStats(p);
  }

  private unequip(id: string, slot: GearSlot) {
    const p = this.state.players.get(id);
    if (!p || !GEAR_SLOTS.includes(slot) || !p[slot] || p.bag.length >= BAG_SIZE) return;
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

  // ---- Combat -------------------------------------------------------------

  /** All live, hittable targets (players and mobs) within `r` of (x,y), except `exclude`. */
  private targetsAround(x: number, y: number, r: number, exclude: string): string[] {
    const out: string[] = [];
    this.state.players.forEach((t, tid) => {
      if (tid !== exclude && !t.dead && Math.hypot(t.x - x, t.y - y) <= r) out.push(tid);
    });
    this.state.mobs.forEach((m, mid) => {
      if (!m.dead && !m.hidden && Math.hypot(m.x - x, m.y - y) <= r) out.push(mid);
    });
    return out;
  }

  private firstTargetAt(x: number, y: number, r: number, exclude: string, skip?: Set<string>): string | undefined {
    // Skip players who cannot be hurt right now (safe zone, dash) so shots pass through them
    const now = Date.now();
    return this.targetsAround(x, y, r, exclude).find((id) => {
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
    if (a) dmg = dmg * talentMult(a.cls, a.talents, "dmg") * (opts.skill && !opts.dot ? talentMult(a.cls, a.talents, "skill") : 1) * dealtMult(a, Date.now());
    dmg = Math.max(1, Math.round(dmg));
    opts = { ...opts, from: attackerId };
    const name = a?.name ?? "???";
    const kb = opts.kb ?? 1;
    const tp = this.state.players.get(targetId);
    if (tp) {
      const hpBefore = tp.hp;
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
    const def = MOBS[m.kind];
    dmg = Math.max(1, Math.round(dmg * takenMult(m, Date.now())));
    this.bloodthirst(a, attackerId, Math.min(dmg, m.hp));
    m.hp = Math.max(0, m.hp - dmg);
    m.target = attackerId; // fight back
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
    this.broadcast("hit", { id: targetId, dmg, crit: !!opts.crit, dot: !!opts.dot });
    if (m.hp > 0) { afterHit(this.host, attackerId, targetId, opts); return; }
    m.dead = true;
    if (a) this.questKill(attackerId, a, m);
    m.hidden = false; m.spot = ""; m.fleeing = false;
    this.grantXp(attackerId, Math.round(def.xp * mobScale(m.level, "xp")), m);
    this.dropLoot(m.kind, m.x, m.y, mobScale(m.level, "gold"), m.level);
    if (m.kind === "necromancer") {
      // Its raised skeletons fall apart with it
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
      if (zone.alive <= 0) {
        const z = SPAWN_ZONES[m.zone];
        this.broadcast("zonecleared", { zone: z.name, by: attackerId, name: a?.name ?? "", respawnSec: Math.round(z.respawnMs / 1000) });
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
    if (e.item === "potion") {
      const qty = e.qty ?? 1;
      if (p.potions + qty > MAX_POTIONS) return no(`You can carry ${MAX_POTIONS} potions at most`);
      p.potions += qty;
    } else {
      if (!GEAR[e.item]) return;
      if (p.bag.length >= BAG_SIZE) return no("Your bag is full");
      setBag(p, [...bagItems(p), e.item]);
    }
    p.gold -= e.price;
    client.send("shop", { ok: true, text: `-${e.price} gold` });
  }

  private shopSell(client: Client, i: unknown) {
    const p = this.state.players.get(client.sessionId);
    const shop = p && !p.dead ? this.shopNear(p) : undefined;
    if (!p || !shop?.buys || typeof i !== "number" || i < 0 || i >= p.bag.length) return;
    const gid = p.bag.at(i), def = gid ? GEAR[gid] : undefined;
    if (!gid || !def || !shop.buys.includes(def.slot)) return;
    const items = [...bagItems(p)];
    items.splice(i, 1);
    setBag(p, items);
    const price = sellPrice(gid);
    p.gold += price;
    client.send("shop", { ok: true, text: `+${price} gold` });
  }

  // ---- Quest -------------------------------------------------------------
  // The blob quest chain (shared/quests.ts). The server owns progress; the client gets "quest" {qid, stage, done?}.

  private sendQuest(id: string, p: Player, done = false) {
    this.clients.find((c) => c.sessionId === id)?.send("quest", { qid: p.questId, stage: p.questStage, done });
  }

  /** Move to the next step (or claim the reward and move on to the next quest). */
  private nextStep(id: string, p: Player) {
    const d = QUESTS[p.questId];
    if (!d) return;
    p.questCount = 0;
    if (p.questStage < d.steps.length) { p.questStage++; this.sendQuest(id, p); return; }
    p.gold += d.reward.gold;
    p.potions = Math.min(MAX_POTIONS, p.potions + d.reward.potions);
    p.questId++;
    p.questStage = 0;
    this.sendQuest(id, p, true);
    this.grantXp(id, d.reward.xp, p);
  }

  /** Progress on a kill / collect / use step; finishes the step at its goal. */
  private questProgress(id: string, p: Player, count: number) {
    const s = questStep(p);
    if (!s) return;
    p.questCount = count;
    const n = s.type === "use" ? (count === (1 << s.objects!.length) - 1 ? stepGoal(s) : 0) : count;
    if (n >= stepGoal(s)) this.nextStep(id, p);
  }

  private nearNpc(p: Player, npc: string): boolean {
    const n = npcById(npc);
    return !!n && npcPresent(npc, p) && Math.hypot(n.x - p.x, n.y - p.y) <= TALK_RANGE * 1.5;
  }

  /** Accept a quest at its giver, or finish a "talk" step next to that NPC. */
  private advanceQuest(id: string) {
    const p = this.state.players.get(id);
    const d = p && QUESTS[p.questId];
    if (!p || !d || p.dead) return;
    if (p.questStage === 0) {
      if (p.level >= d.minLevel && this.nearNpc(p, d.giver)) this.nextStep(id, p);
      return;
    }
    const s = questStep(p);
    if (s?.type === "talk" && this.nearNpc(p, s.npc!)) this.nextStep(id, p);
  }

  /** E on a quest object (lantern, shrine, cocoon, Brood Heart). */
  private useQuestObject(id: string, oid: string) {
    const p = this.state.players.get(id);
    const s = p && questStep(p);
    if (!p || p.dead || s?.type !== "use") return;
    const i = s.objects!.findIndex((o) => o.id === oid);
    const o = s.objects![i];
    if (!o || p.questCount & (1 << i) || Math.hypot(o.x - p.x, o.y - p.y) > USE_RANGE * 1.5) return;
    this.clients.find((c) => c.sessionId === id)?.send("questuse", { id: o.id });
    this.questProgress(id, p, p.questCount | (1 << i));
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
      client.send("pickup", { kind, amount, x: c.x, y: c.y - 8 - 9 * row++, gear, name: gear ? gearName(gear, p.cls) : "" });
    p.gold += loot.gold;
    got("gold", loot.gold);
    for (let i = 0; i < loot.potions; i++) {
      if (p.potions < MAX_POTIONS) { p.potions++; got("potion", 1); } else this.dropItem("potion", c.x, c.y + 10, 1);
    }
    for (const g of loot.gear) {
      if (p.bag.length < BAG_SIZE) { setBag(p, [...bagItems(p), g]); got("gear", 1, g); } else this.dropItem("gear", c.x, c.y + 10, 1, g);
    }
  }

  /** "see" a blob in a zone, or "reach" a spot. */
  private checkQuestPlace(id: string, p: Player) {
    const s = questStep(p);
    if (s?.type === "reach") {
      if (Math.hypot(s.at!.x - p.x, s.at!.y - p.y) <= s.at!.r) this.nextStep(id, p);
      return;
    }
    if (s?.type !== "see" || !inZone(s.zone!, p.x, p.y)) return;
    const r2 = (9 * TILE) ** 2;
    for (const m of this.state.mobs.values()) {
      if (m.dead || m.hidden || !s.kinds!.includes(m.kind)) continue;
      const dx = m.x - p.x, dy = m.y - p.y;
      if (dx * dx + dy * dy <= r2) { this.nextStep(id, p); return; }
    }
  }

  /** A monster died to this player: count it, or maybe drop a quest item only they can see. */
  private questKill(id: string, p: Player, m: Mob) {
    const s = questStep(p);
    if (!s || !s.kinds?.includes(m.kind) || (s.zone && !inZone(s.zone, m.x, m.y))) return;
    if (s.type === "kill") this.questProgress(id, p, p.questCount + 1);
    else if (s.type === "collect" && Math.random() < (s.chance?.[m.kind] ?? 0)) this.dropItem("quest", m.x, m.y, 1, s.item!, id);
  }

  private grantXp(id: string, amount: number, at: { x: number; y: number }) {
    const p = this.state.players.get(id);
    if (!p) return;
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
    const st = statsFor(p.cls, { sta: p.ptSta, str: p.ptStr, mag: p.ptMag });
    const g = gearStats(p.cls, this.equipped(p));
    st.sta += g.sta; st.str += g.str; st.mag += g.mag;
    p.sta = st.sta; p.str = st.str; p.mag = st.mag;
    const newMax = Math.round(maxHpFromStats(p.cls, st, p.level) * talentMult(p.cls, p.talents, "hp"));
    p.hp = Math.min(newMax, p.hp + Math.max(0, newMax - p.maxHp));
    p.maxHp = newMax;
  }

  private stats(p: Player) { return { sta: p.sta, str: p.str, mag: p.mag }; }

  /** Applies damage to a player. Returns true if it killed them. */
  private damagePlayer(tid: string, dmg: number, byName: string, push: [number, number], kbMul = 1, opts: HitOpts = {}): boolean {
    const t = this.state.players.get(tid);
    const now = Date.now();
    if (!t || t.dead || isSafeZone(t.x, t.y) || now < t.invulnUntil) return false;
    // A counter stance (Riposte, Mirror Ice...) eats the hit and strikes back
    if (counterHit(this.host, tid, opts.from, dmg, opts)) return false;
    // Weakened monsters hit softer
    const fromMob = opts.from ? this.state.mobs.get(opts.from) : undefined;
    if (fromMob) dmg *= dealtMult(fromMob, now);
    const guarded = blocking(t, now);
    if (guarded) dmg = Math.max(1, Math.round(dmg * (1 - GUARD_REDUCTION)));
    dmg = Math.max(1, Math.round(dmg * talentReduce(t.cls, t.talents, "armor") * takenMult(t, now)));
    const block = gearBlock(this.equipped(t)); // equipped shield
    if (block) dmg = Math.max(1, Math.round(dmg * (1 - block)));
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
    this.broadcast("hit", { id: tid, dmg, blocked: guarded, crit: !!opts.crit, dot: !!opts.dot });
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
    if (!a || a.dead || a.stunned || a.broken || charging(a, now)) return;
    const def = CLASSES[a.cls];
    if (now < a.attackReadyAt) return;
    // Chain into the next combo hit if pressed soon enough after the last one, else restart (3rd hit = finisher)
    const step = a.lastAttack > 0 && now - a.attackReadyAt <= COMBO_WINDOW_MS && a.combo < 2 ? a.combo + 1 : 0;
    const hit = def.combo[step];
    a.combo = step;
    a.lastAttack = now;
    // Attack speed: slower when your poise is low, faster with buffs (Rage, Blade Flurry, War Drums...)
    const atkSpeed = poiseSpeed(poiseFrac(a, heroPoiseMax(a))) * atkSpeedMult(a, now);
    a.attackReadyAt = now + (hit.cooldownMs ?? def.attackCooldownMs) / atkSpeed;
    const off = aimOf(a);
    let dmg = Math.round(def.damage * attackMult(a.cls, this.stats(a)) * hit.damage);
    const crit = Math.random() < talentBonus(a.cls, a.talents, "crit") / 100;
    if (crit) dmg = Math.round(dmg * 2);
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
    this.broadcast("swing", { id, step, variant, ax: off[0], ay: off[1] });

    if (hit.lunge) {
      for (let moved = 0; moved < hit.lunge; moved += 2) {
        const r = moveStep(a.x, a.y, pushInput(off), 1, 2);
        if (r.x === a.x && r.y === a.y) break;
        a.x = r.x; a.y = r.y;
      }
    }

    if (def.projectile) {
      this.shoot(a, id, dmg, hit.knockback, hit.shotScale ?? 1);
      return;
    }

    const reachMult = gearReachMult(this.equipped(a)); // long weapons
    const reach = (hit.range ?? def.attackRange) * reachMult;
    const hx = a.x + off[0] * 12 * reachMult, hy = a.y + off[1] * 12 * reachMult;
    for (const tid of this.targetsAround(hx, hy, reach, id)) this.hitTarget(id, tid, dmg, off, { kb: hit.knockback, crit, basic: true });
  }

  /** Fire one projectile from `a` (fireball or arrow), offset sideways by `lane` px. */
  private shoot(a: Player, id: string, dmg: number, knockback: number, scale: number, lane = 0) {
    const def = CLASSES[a.cls].projectile!;
    const off = aimOf(a);
    const s = new Projectile();
    // Lanes are perpendicular to the aim (for Volley)
    s.x = a.x + off[0] * 6 - off[1] * lane; s.y = a.y - 4 + off[1] * 6 + off[0] * lane;
    s.dir = a.dir; s.vx = off[0]; s.vy = off[1]; s.owner = id; s.size = scale; s.kind = def.kind;
    s.speed = def.speed; s.radius = def.radius * scale;
    s.range = def.range * gearReachMult(this.equipped(a));
    s.damage = dmg; s.knockback = knockback; s.basic = true;
    this.state.projectiles.set(`s${++this.shotSeq}`, s);
  }

  /** Secondary ranged weapon (sling, knives, crossbow) on R: its own cooldown, scales with the attack stat. */
  private fireRanged(id: string) {
    const a = this.state.players.get(id);
    const now = Date.now();
    const shot = a?.ranged ? GEAR[a.ranged]?.shot : undefined;
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
    hit: (a, t, dmg, push, o) => this.hitTarget(a, t, dmg, push, o),
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
    cooldownMult: (id) => { const p = this.state.players.get(id); return p ? cooldownMult(p.cls, this.stats(p), p.talents) : 1; },
    fx: (ev) => this.broadcast("sfx", ev),
  };
}
