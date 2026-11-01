import { Client, Room } from "colyseus";
import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import {
  BROOD, Dir, HIT_RADIUS, mobScale, InputState, MOB_ATTACK_RANGE, MOBS, MobKind, REGEN_DELAY_MS, REGEN_RAMP_MS, regenFromStamina, SAFE_REGEN_MULT,
  RESPAWN_MS, TICK_RATE,
} from "../shared/constants";
import {
  ATTACK_VARIANTS, CLASSES, ClassKind, COMBO_WINDOW_MS, DODGE, EMOTES, ENERGY, DASH_INVULN_MS, GUARD_REDUCTION, isClassKind, levelFromXp, PVP_KILL_XP,
} from "../shared/classes";
import {
  attackMult, cooldownMult, CRIT, FROST, hasPower, heroSpeed, IGNITE, IRONSKIN_REDUCTION, magicMult, maxHpFromStats,
  POWERS, SECOND_WIND, SHADOW_STRIKE_DAMAGE, SLOW_MOB, statsFor, statPoints, ULTS, hasSpecial, hasUlt, powerNodeId,
  BLOODTHIRST, EAGLE_EYE_RANGE, GROUND_SLAM_STUN_MS, PIERCE_EXTRA, PINNING, RAGE,
} from "../shared/powers";
import {
  ITEM_LIFETIME_MS, ItemKind, LOOT, MAX_POTIONS, PICKUP_RADIUS, POTION_COOLDOWN_MS, POTION_HEAL, PVP_GOLD_DROP,
} from "../shared/items";
import { isSafeZone, isSolidAt, randomSpawn } from "../shared/map";
import { npcNear, TALK_RANGE } from "../shared/npcs";
import { sellPrice, SHOPS } from "../shared/shops";
import { inQuestZone, isBlob, Q, QUEST } from "../shared/quests";
import { findHideSpot, HIDE, randomPointInZone, rollLevel, SPAWN_ZONES, zoneCap } from "../shared/spawns";
import { moveStep } from "../shared/movement";
import { SLOT_COUNT, SlotSkill, skillLearned } from "../shared/slots";
import { heroPoise, MOB_COMBAT, POISE, poiseLevelMult, poiseSpeed, RAGE_ATTACK_SPEED } from "../shared/combat";
import { canLearn, COMBO_NODE, talentMult, talentBonus, talentReduce, TREES } from "../shared/talents";
import {
  BAG_SIZE, Equipped, GEAR, GEAR_SLOTS, GearSlot, gearBlock, gearName, gearReachMult, gearSpeedMult, gearStats, isGearId, potionChance, rollGear,
} from "../shared/gear";

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
  // Equipment (shared/gear.ts): equipped item ids ("" = empty) and the unequipped items carried
  @type("string") weapon = "";
  @type("string") armour = "";
  @type("string") shoes = "";
  @type("string") hat = "";
  @type("string") shield = "";
  @type("string") ranged = ""; // secondary ranged weapon, fired with R
  @type(["string"]) bag = new ArraySchema<string>();
  // Skill tree (shared/talents.ts): ranks per talent id
  @type({ map: "number" }) talents = new MapSchema<number>();
  // First quest (shared/quests.ts): step and blob kills
  @type("number") questStage = 0;
  @type("number") questCount = 0;
  // Skill slots on keys 1..0 (shared/slots.ts): "special" | "ult" | "" (empty). Empty until the player assigns them.
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
  secondWindAt = 0; // earliest time Second Wind can trigger again
  rageUntil = 0;
}

export class Mob extends Schema {
  @type("string") kind: MobKind = "slime";
  @type("number") level = 1;
  @type("boolean") hidden = false; // tucked into a grave/tree: untouchable, only its eyes show

  spot = ""; // hiding spot (tile "x,y") it is heading to or sitting in
  spotX = 0; spotY = 0; outX = 0; outY = 0; // spot centre, and the walkable tile it steps in/out from
  seekUntil = 0; // give up reaching the spot after this
  hideUntil = 0; // leaves the spot on its own after this
  fleeing = false; // dizzy and running for cover
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
  ignite = false; // wizard Ignite power: splash on impact
  pierce = 0; // archer: extra targets the arrow can pass through
  slowMs = 0; // archer Pinning Shot
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
  @type("string") gear = ""; // kind "gear": the item id

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

export class TownState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Mob }) mobs = new MapSchema<Mob>();
  @type({ map: Projectile }) projectiles = new MapSchema<Projectile>();
  @type({ map: Item }) items = new MapSchema<Item>();
  @type({ map: Zone }) zones = new MapSchema<Zone>();
}

/** Extra effects of a hit. */
interface HitOpts { atkLevel?: number; kb?: number; stunMs?: number; slowMs?: number; crit?: boolean; skill?: boolean }

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

export class TownRoom extends Room<TownState> {
  maxClients = 50;
  private mobSeq = 0;
  private shotSeq = 0;
  private itemSeq = 0;

  onCreate() {
    this.setState(new TownState());
    this.setPatchRate(1000 / TICK_RATE);
    this.setSimulationInterval((dt) => this.update(dt), 1000 / TICK_RATE);

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
    this.onMessage("special", (client) => this.playerSpecial(client.sessionId));
    this.onMessage("ult", (client) => this.playerUlt(client.sessionId));
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
    this.onMessage("buy", (client, msg: { i: number }) => this.shopBuy(client, msg?.i));
    this.onMessage("sell", (client, msg: { i: number }) => this.shopSell(client, msg?.i));

    this.onMessage("chat", (client, text: string) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof text !== "string") return;
      const clean = text.slice(0, 120).trim();
      const cmd = clean.toLowerCase().replace(/^\//, "");
      if (clean.startsWith("/") && (EMOTES as readonly string[]).includes(cmd)) {
        if (!p.dead) p.emote = cmd;
        return;
      }
      if (clean) this.broadcast("chat", { id: client.sessionId, name: p.name, text: clean });
    });
  }

  onJoin(client: Client, options: { name?: string; color?: number; cls?: string }) {
    const p = new Player();
    p.name = String(options?.name ?? "").slice(0, 16).trim() || `Hero${Math.floor(Math.random() * 1000)}`;
    p.color = typeof options?.color === "number" ? options.color : COLORS[Math.floor(Math.random() * COLORS.length)];
    p.cls = isClassKind(options?.cls) ? options.cls : "knight";
    this.applyStats(p);
    p.hp = p.maxHp;
    const s = randomSpawn();
    p.x = s.x; p.y = s.y;
    this.state.players.set(client.sessionId, p);
    console.log(`${p.name} the ${CLASSES[p.cls].name} joined (${this.clients.length} online)`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }

  private spawnMob(kind: MobKind, zi: number, id = `m${++this.mobSeq}`) {
    const def = MOBS[kind];
    const home = randomPointInZone(SPAWN_ZONES[zi]);
    const m = this.state.mobs.get(id) ?? new Mob();
    m.kind = kind;
    m.zone = zi;
    m.x = m.homeX = home.x;
    m.y = m.homeY = home.y;
    m.level = rollLevel(SPAWN_ZONES[zi]);
    m.hp = m.maxHp = Math.round(def.maxHp * mobScale(m.level, "hp"));
    m.dead = false;
    m.target = "";
    m.hidden = false; m.spot = ""; m.fleeing = false;
    if (kind === "motherblob") m.nextBrood = Date.now() + BROOD.minMs + Math.random() * (BROOD.maxMs - BROOD.minMs);
    if (!this.state.mobs.has(id)) this.state.mobs.set(id, m);
  }

  // ---- Hiding in graves / trees ---------------------------------------------

  /** Pick the nearest free hiding spot and start walking to it. */
  private claimSpot(m: Mob, x: number, y: number, radius: number, now: number, fleeing: boolean) {
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
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 6;
      const x = mother.x + Math.cos(a) * r, y = mother.y + Math.sin(a) * r;
      if (isSolidAt(x, y) || isSafeZone(x, y)) continue;
      const c = new Mob();
      c.kind = "blobling"; c.zone = -1; c.mother = motherId;
      c.x = c.homeX = x; c.y = c.homeY = y;
      c.level = mother.level;
      c.hp = c.maxHp = Math.round(MOBS.blobling.maxHp * mobScale(c.level, "hp"));
      c.target = mother.target; // join the fight if mum is busy
      this.state.mobs.set(`b${++this.mobSeq}`, c);
      this.broadcast("brood", { id: motherId });
      return;
    }
  }

  // ---- Tick ---------------------------------------------------------------

  private update(dtMs: number) {
    const dt = dtMs / 1000;
    const now = Date.now();
    this.state.players.forEach((p, pid) => {
      p.stunned = now < p.stunUntil;
      p.slowed = now < p.slowUntil;
      p.raging = now < p.rageUntil;
      tickPoise(p, heroPoiseMax(p), dt, now);
      if (p.dead) { p.moving = false; p.energy = ENERGY.max; return; }
      if (p.questStage === Q.INVESTIGATE) this.checkQuestSight(pid, p);
      if (p.energy < ENERGY.max) p.energy = Math.min(ENERGY.max, p.energy + ENERGY.regenPerSec * dt);
      p.rolling = now < p.rollUntil;
      const r = p.stunned
        ? { x: p.x, y: p.y, moving: false }
        : p.rolling
        ? moveStep(p.x, p.y, p.rollInput, dt, DODGE.distance / (DODGE.durationMs / 1000))
        : moveStep(p.x, p.y, p.input, dt, heroSpeed(p.cls, p.talents, p.slowed, p.raging) * gearSpeedMult(this.equipped(p)) * talentMult(p.cls, p.talents, "speed"));
      p.x = r.x; p.y = r.y; p.moving = r.moving;
      if (!p.rolling) { p.dir = dirFromInput(p.input, p.dir); aimOf(p); }
      if (r.moving) p.emote = "";
      p.guarding = now < p.guardUntil;
      // Regeneration from Stamina: always a trickle, ramping up smoothly out of combat, fastest in the safe plaza
      if (!p.dead && p.hp > 0 && p.hp < p.maxHp) {
        const ramp = Math.min(1, Math.max(0, (now - p.lastHurt - REGEN_DELAY_MS) / REGEN_RAMP_MS));
        const [fight, rest] = regenFromStamina(p.sta);
        const full = rest * (isSafeZone(p.x, p.y) ? SAFE_REGEN_MULT : 1);
        p.hp = Math.min(p.maxHp, p.hp + (fight + (full - fight) * ramp) * dt);
      }
      // Skill tree regen works all the time, even in combat
      const treeRegen = talentBonus(p.cls, p.talents, "regen");
      if (treeRegen > 0 && !p.dead && p.hp > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * treeRegen / 100 * dt);
      this.pickUp(p, pid);
    });
    this.state.items.forEach((it, id) => { if (now > it.expires) this.state.items.delete(id); });
    this.state.mobs.forEach((m, id) => this.updateMob(m, id, dt, now));
    this.updateZones(now);
    this.state.projectiles.forEach((s, id) => this.updateProjectile(s, id, dt));
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

  private updateMob(m: Mob, id: string, dt: number, now: number) {
    tickPoise(m, mobPoiseMax(m), dt, now);
    if (m.dead) { m.moving = false; m.winding = false; m.windUntil = 0; return; }
    const def = MOBS[m.kind];
    m.stunned = now < m.stunUntil;
    if (m.stunned || m.broken) { m.winding = false; m.windUntil = 0; }
    m.slowed = now < m.slowUntil;
    if (m.stunned) { m.moving = false; return; }
    if (m.kind === "motherblob" && now >= m.nextBrood) this.brood(m, id, now);
    if (m.hidden) return this.updateHidden(m, id, dt, now);

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
      if (!isSafeZone(r.x, r.y)) { m.x = r.x; m.y = r.y; }
      m.moving = r.moving;
      m.dir = dirFromInput(go, m.dir);
      return;
    }

    let input: InputState;
    if (t && m.broken) {
      // Broken: dizzy, can't fight back, tries to get away from the attacker
      input = toward(m.x, m.y, m.x * 2 - t.x, m.y * 2 - t.y);
    } else if (t) {
      const dist = Math.hypot(t.x - m.x, t.y - m.y);
      if (dist <= MOB_ATTACK_RANGE || m.windUntil) {
        input = STILL;
        m.dir = Math.abs(t.x - m.x) > Math.abs(t.y - m.y) ? (t.x > m.x ? "right" : "left") : (t.y > m.y ? "down" : "up");
        if (m.windUntil) {
          // Wind-up done: the blow lands if the target is still close
          if (now >= m.windUntil) {
            m.windUntil = 0; m.winding = false; m.lastAttack = now;
            if (dist <= MOB_ATTACK_RANGE + 6) {
              this.broadcast("swing", { id });
              this.damagePlayer(m.target, Math.round(def.damage * mobScale(m.level, "damage")), def.name, DIR_OFFSET[m.dir], 1, { atkLevel: m.level });
            }
          }
        } else if (now - m.lastAttack >= def.attackCooldownMs / poiseSpeed(poiseFrac(m, mobPoiseMax(m)))) {
          m.windUntil = now + MOB_COMBAT[m.kind].windupMs; m.winding = true; // telegraph, a hit interrupts it
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

    const speed = (t ? def.speed * (m.broken ? POISE.fleeSpeed : 1) : def.speed * 0.5) * (m.slowed ? SLOW_MOB : 1);
    const r = moveStep(m.x, m.y, input, dt, speed);
    if (!isSafeZone(r.x, r.y)) { m.x = r.x; m.y = r.y; }
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
      const hit = this.firstTargetAt(s.x, s.y, s.radius + HIT_RADIUS, s.owner, s.hitIds);
      if (hit) {
        this.hitTarget(s.owner, hit, s.damage, [s.vx, s.vy], { kb: s.knockback, slowMs: s.slowMs || undefined });
        // Piercing arrows keep flying through a few targets
        if (s.pierce > 0) { s.pierce--; s.hitIds.add(hit); continue; }
        return this.explode(s, id, hit);
      }
    }
  }

  private explode(s: Projectile, id: string, directHit = "") {
    this.broadcast("boom", { x: s.x, y: s.y, r: s.ignite ? IGNITE.radius : 0, kind: s.kind });
    if (s.ignite) {
      const splash = Math.max(1, Math.round(s.damage * IGNITE.splash));
      for (const tid of this.targetsAround(s.x, s.y, IGNITE.radius, s.owner)) {
        if (tid !== directHit) this.hitTarget(s.owner, tid, splash, this.pushFrom(s.x, s.y, tid));
      }
    }
    this.state.projectiles.delete(id);
  }

  // ---- Loot -------------------------------------------------------------

  private dropItem(kind: ItemKind, x: number, y: number, amount: number, gear = "") {
    const it = new Item();
    it.kind = kind; it.amount = amount; it.gear = gear;
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
    p.talents.set(tid, (p.talents.get(tid) ?? 0) + 1);
    const pw = POWERS[p.cls].find((x) => powerNodeId(x.id) === tid);
    if (pw) this.broadcast("power", { id, name: pw.name });
    this.applyStats(p);
  }

  /** Press a slot key: use whatever skill is in that slot. */
  private useSlot(id: string, n: number) {
    const p = this.state.players.get(id);
    if (!p || typeof n !== "number" || n < 0 || n >= SLOT_COUNT) return;
    const s = p.slots.at(n);
    if (s === "special") this.playerSpecial(id);
    else if (s === "ult") this.playerUlt(id);
  }

  /** Put a learned active skill in a slot (moving it out of any other slot), or clear the slot with skill "". */
  private assignSlot(id: string, msg: { slot: number; skill: string }) {
    const p = this.state.players.get(id);
    if (!p || !msg || typeof msg.slot !== "number" || msg.slot < 0 || msg.slot >= SLOT_COUNT) return;
    const skill = msg.skill;
    if (skill !== "" && skill !== "special" && skill !== "ult") return;
    if (skill && !skillLearned(p.cls, p.talents, skill as SlotSkill)) return;
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

  /** Barbarian Bloodthirst: heal a share of the damage dealt. */
  private bloodthirst(a: Player | undefined, id: string, dealt: number) {
    if (!a || a.dead || dealt <= 0) return;
    const share = (hasPower(a.cls, a.talents, "bloodthirst") ? BLOODTHIRST : 0) + talentBonus(a.cls, a.talents, "lifesteal") / 100;
    if (share <= 0) return;
    const heal = dealt * share;
    a.hp = Math.min(a.maxHp, a.hp + heal);
  }

  /** A player (`attackerId`) hits a player or mob. */
  private hitTarget(attackerId: string, targetId: string, dmg: number, push: [number, number], opts: HitOpts = {}) {
    const a = this.state.players.get(attackerId);
    if (a) dmg = Math.round(dmg * talentMult(a.cls, a.talents, "dmg") * (opts.skill ? talentMult(a.cls, a.talents, "skill") : 1));
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
    const k = moveStep(m.x, m.y, pushInput(push), 0.1 * kb);
    if (!isSafeZone(k.x, k.y)) { m.x = k.x; m.y = k.y; }
    this.broadcast("hit", { id: targetId, dmg, crit: !!opts.crit });
    if (m.hp > 0) return;
    m.dead = true;
    if (a && a.questStage === Q.HUNT && isBlob(m.kind)) {
      a.questCount++;
      if (a.questCount >= QUEST.killGoal) this.setQuest(attackerId, a, Q.RETURN);
    }
    m.hidden = false; m.spot = ""; m.fleeing = false;
    this.grantXp(attackerId, Math.round(def.xp * mobScale(m.level, "xp")), m);
    this.dropLoot(m.kind, m.x, m.y, mobScale(m.level, "gold"), m.level);
    if (m.zone < 0) { this.clock.setTimeout(() => this.state.mobs.delete(targetId), 500); return; } // bloblings don't respawn
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

  private setQuest(id: string, p: Player, stage: number) {
    p.questStage = stage;
    this.clients.find((c) => c.sessionId === id)?.send("quest", { stage });
  }

  /** Accept / hand in at the druid. Only works standing next to him. */
  private advanceQuest(id: string) {
    const p = this.state.players.get(id);
    if (!p || p.dead || npcNear(p.x, p.y, TALK_RANGE * 1.5)?.id !== QUEST.giver) return;
    if (p.questStage === Q.NONE) this.setQuest(id, p, Q.INVESTIGATE);
    else if (p.questStage === Q.REPORT) { p.questCount = 0; this.setQuest(id, p, Q.HUNT); }
    else if (p.questStage === Q.RETURN) {
      p.gold += QUEST.reward.gold;
      p.potions = Math.min(MAX_POTIONS, p.potions + QUEST.reward.potions);
      this.setQuest(id, p, Q.DONE);
      this.grantXp(id, QUEST.reward.xp, p);
    }
  }

  /** Investigation step: a blob seen in the quest zone. */
  private checkQuestSight(id: string, p: Player) {
    if (!inQuestZone(p.x, p.y)) return;
    const r2 = QUEST.sightRange * QUEST.sightRange;
    for (const m of this.state.mobs.values()) {
      if (m.dead || m.hidden || !isBlob(m.kind)) continue;
      const dx = m.x - p.x, dy = m.y - p.y;
      if (dx * dx + dy * dy <= r2) { this.setQuest(id, p, Q.REPORT); return; }
    }
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
    const guarded = now < t.guardUntil;
    if (guarded) dmg = Math.max(1, Math.round(dmg * (1 - GUARD_REDUCTION)));
    if (hasPower(t.cls, t.talents, "ironskin")) dmg = Math.max(1, Math.round(dmg * (1 - IRONSKIN_REDUCTION)));
    dmg = Math.max(1, Math.round(dmg * talentReduce(t.cls, t.talents, "armor")));
    const block = gearBlock(this.equipped(t)); // equipped shield
    if (block) dmg = Math.max(1, Math.round(dmg * (1 - block)));
    // Barbarian Unstoppable: while raging, ignore stun, slow and knockback
    const unstoppable = now < t.rageUntil && hasPower(t.cls, t.talents, "unstoppable");
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
    if (!guarded && !unstoppable) {
      const kb = moveStep(t.x, t.y, pushInput(push), 0.12 * kbMul);
      t.x = kb.x; t.y = kb.y;
    }
    this.broadcast("hit", { id: tid, dmg, blocked: guarded, crit: !!opts.crit });
    // Knight Second Wind: an emergency heal when HP drops low
    if (t.hp > 0 && t.hp < t.maxHp * SECOND_WIND.threshold && hasPower(t.cls, t.talents, "secondwind") && now >= t.secondWindAt) {
      t.secondWindAt = now + SECOND_WIND.cooldownMs;
      const heal = Math.round(t.maxHp * SECOND_WIND.heal);
      t.hp = Math.min(t.maxHp, t.hp + heal);
      this.broadcast("heal", { id: tid, amount: heal });
      this.broadcast("power", { id: tid, name: "Second Wind" });
    }
    if (t.hp > 0) return false;
    t.dead = true;
    t.guardUntil = 0; t.guarding = false;
    this.broadcast("kill", { killer: byName, victim: t.name });
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
    if (!a || a.dead || a.stunned || a.broken) return;
    const def = CLASSES[a.cls];
    if (now < a.attackReadyAt) return;
    // Chain into the next combo hit if pressed soon enough after the last one, else restart
    // Without the 3-Hit Combo skill (skill tree) the attack alternates hits 1 and 2; the finisher needs the skill
    const lastStep = (a.talents.get(COMBO_NODE) ?? 0) > 0 ? 2 : 1;
    const step = a.lastAttack > 0 && now - a.attackReadyAt <= COMBO_WINDOW_MS && a.combo < lastStep ? a.combo + 1 : 0;
    const hit = def.combo[step];
    a.combo = step;
    a.lastAttack = now;
    // Attack speed: slower when your poise is low, faster while raging
    const atkSpeed = poiseSpeed(poiseFrac(a, heroPoiseMax(a))) * (now < a.rageUntil ? RAGE_ATTACK_SPEED : 1);
    a.attackReadyAt = now + (hit.cooldownMs ?? def.attackCooldownMs) / atkSpeed;
    const off = aimOf(a);
    let dmg = Math.round(def.damage * attackMult(a.cls, this.stats(a)) * hit.damage);
    const critChance = (hasPower(a.cls, a.talents, "crit") ? CRIT.chance : 0) + talentBonus(a.cls, a.talents, "crit") / 100;
    const crit = Math.random() < critChance;
    if (crit) dmg = Math.round(dmg * CRIT.mult);
    if (now < a.rageUntil) dmg = Math.round(dmg * RAGE.damage);
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
    // Barbarian Ground Slam: the finisher stuns
    const slam = step === 2 && hasPower(a.cls, a.talents, "groundslam") ? GROUND_SLAM_STUN_MS : undefined;
    // Knight Cleave: the finisher hits all around instead of only in front
    if (step === 2 && hasPower(a.cls, a.talents, "cleave")) {
      for (const tid of this.targetsAround(a.x, a.y, reach, id)) this.hitTarget(id, tid, dmg, this.pushFrom(a.x, a.y, tid), { kb: hit.knockback, crit });
      return;
    }
    const hx = a.x + off[0] * 12 * reachMult, hy = a.y + off[1] * 12 * reachMult;
    for (const tid of this.targetsAround(hx, hy, reach, id)) this.hitTarget(id, tid, dmg, off, { kb: hit.knockback, crit, stunMs: slam });
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
    s.range = def.range * (hasPower(a.cls, a.talents, "eagleeye") ? EAGLE_EYE_RANGE : 1) * gearReachMult(this.equipped(a));
    s.damage = dmg; s.knockback = knockback;
    s.ignite = hasPower(a.cls, a.talents, "ignite");
    s.pierce = hasPower(a.cls, a.talents, "pierce") ? PIERCE_EXTRA : 0;
    s.slowMs = hasPower(a.cls, a.talents, "pinning") ? PINNING.durationMs : 0;
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

  private playerSpecial(id: string) {
    const a = this.state.players.get(id);
    const now = Date.now();
    if (!a || a.dead || a.stunned || a.broken) return;
    const sp = CLASSES[a.cls].special;
    if (!hasSpecial(a.cls, a.talents)) return; // learned in the skill tree
    if (now - a.lastSpecial < sp.cooldownMs * cooldownMult(a.cls, this.stats(a), a.talents) * talentReduce(a.cls, a.talents, "cdr")) return;
    if (a.energy < ENERGY.cost.special) return;
    a.energy -= ENERGY.cost.special;
    a.lastSpecial = now;
    a.emote = "";

    switch (sp.kind) {
      case "guard":
        a.guardUntil = now + (sp.durationMs ?? 2000);
        a.guarding = true;
        this.broadcast("special", { id, kind: sp.kind });
        break;
      case "dash": {
        const fromX = a.x, fromY = a.y;
        const dist = sp.distance ?? 56;
        const step = pushInput(aimOf(a));
        const shadow = hasPower(a.cls, a.talents, "shadowstrike");
        const cut = new Set<string>();
        // Move in 4px steps so walls stop the dash instead of being skipped
        for (let moved = 0; moved < dist; moved += 4) {
          const r = moveStep(a.x, a.y, step, 1, 4);
          if (r.x === a.x && r.y === a.y) break;
          a.x = r.x; a.y = r.y;
          if (shadow) for (const tid of this.targetsAround(a.x, a.y, 12, id)) cut.add(tid);
        }
        // Ninja Shadow Strike: cut every enemy passed through
        const sdmg = Math.round(CLASSES[a.cls].damage * attackMult(a.cls, this.stats(a)) * SHADOW_STRIKE_DAMAGE);
        for (const tid of cut) this.hitTarget(id, tid, sdmg, aimOf(a), { kb: 0.5, skill: true });
        a.invulnUntil = now + DASH_INVULN_MS;
        this.broadcast("special", { id, kind: sp.kind, fromX, fromY, x: a.x, y: a.y });
        break;
      }
      case "volley": {
        const dmg = Math.round(CLASSES[a.cls].damage * attackMult(a.cls, this.stats(a)));
        const n = sp.arrows ?? 3;
        for (let i = 0; i < n; i++) this.shoot(a, id, dmg, 0.8, 1, (i - (n - 1) / 2) * 8);
        this.broadcast("special", { id, kind: sp.kind });
        break;
      }
      case "rage":
        a.rageUntil = now + (sp.durationMs ?? 5000);
        a.raging = true;
        this.broadcast("special", { id, kind: sp.kind });
        break;
      case "nova": {
        const r = sp.radius ?? 38;
        const dmg = Math.round((sp.damage ?? 30) * magicMult(a.cls, this.stats(a)));
        const frost = hasPower(a.cls, a.talents, "frost");
        this.broadcast("special", { id, kind: sp.kind, x: a.x, y: a.y, r, frost });
        for (const tid of this.targetsAround(a.x, a.y, r, id)) {
          this.hitTarget(id, tid, dmg, this.pushFrom(a.x, a.y, tid), frost ? { slowMs: FROST.durationMs, skill: true } : { skill: true });
        }
        break;
      }
    }
  }

  /** Level 10 ultimate on R. */
  private playerUlt(id: string) {
    const a = this.state.players.get(id);
    const now = Date.now();
    if (!a || a.dead || a.stunned || a.broken || !hasUlt(a.cls, a.talents)) return;
    const u = ULTS[a.cls];
    if (now - a.lastUlt < u.cooldownMs * cooldownMult(a.cls, this.stats(a), a.talents) * talentReduce(a.cls, a.talents, "cdr")) return;
    if (a.energy < ENERGY.cost.ult) return;
    a.energy -= ENERGY.cost.ult;
    a.lastUlt = now;
    a.emote = "";
    const dmg = Math.round(u.damage * magicMult(a.cls, this.stats(a)));
    const blast = (x: number, y: number, opts: HitOpts = {}) => {
      for (const tid of this.targetsAround(x, y, u.radius, id)) this.hitTarget(id, tid, dmg, this.pushFrom(x, y, tid), { ...opts, skill: true });
    };
    if (a.cls === "knight") {
      this.broadcast("ult", { id, kind: "earthquake", x: a.x, y: a.y, r: u.radius });
      blast(a.x, a.y, { stunMs: u.stunMs, kb: 0.5 });
    } else if (a.cls === "ninja") {
      this.broadcast("ult", { id, kind: "bladestorm", x: a.x, y: a.y, r: u.radius, hits: u.hits });
      for (let i = 0; i < (u.hits ?? 3); i++) {
        this.clock.setTimeout(() => { if (!a.dead) blast(a.x, a.y, { kb: 0.4 }); }, i * 200);
      }
    } else if (a.cls === "wizard") {
      const off = aimOf(a);
      const x = a.x + off[0] * (u.ahead ?? 56), y = a.y + off[1] * (u.ahead ?? 56);
      this.broadcast("ult", { id, kind: "meteor", x, y, r: u.radius, delay: u.delayMs });
      this.clock.setTimeout(() => blast(x, y, { kb: 2 }), u.delayMs ?? 600);
    } else if (a.cls === "archer") {
      const off = aimOf(a);
      const x = a.x + off[0] * (u.ahead ?? 72), y = a.y + off[1] * (u.ahead ?? 72);
      this.broadcast("ult", { id, kind: "arrowrain", x, y, r: u.radius, delay: u.delayMs, hits: u.hits });
      for (let i = 0; i < (u.hits ?? 4); i++) {
        this.clock.setTimeout(() => blast(x, y, { kb: 0.3, slowMs: hasPower(a.cls, a.talents, "pinning") ? PINNING.durationMs : undefined }), (u.delayMs ?? 400) + i * 250);
      }
    } else {
      // Barbarian Leap: jump forward (walls stop it), briefly untouchable, crash down on landing
      const fromX = a.x, fromY = a.y;
      const step = pushInput(aimOf(a));
      for (let moved = 0; moved < (u.ahead ?? 64); moved += 4) {
        const r = moveStep(a.x, a.y, step, 1, 4);
        if (r.x === a.x && r.y === a.y) break;
        a.x = r.x; a.y = r.y;
      }
      a.invulnUntil = now + 300;
      this.broadcast("ult", { id, kind: "leap", fromX, fromY, x: a.x, y: a.y, r: u.radius });
      blast(a.x, a.y, { kb: 2 });
    }
  }
}
