import { Client, Room } from "colyseus";
import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import {
  Dir, HIT_RADIUS, InputState, MOB_ATTACK_RANGE, MOBS, MobKind, REGEN_DELAY_MS, REGEN_PER_SEC,
  RESPAWN_MS, SAFE_REGEN_PER_SEC, TICK_RATE,
} from "../shared/constants";
import {
  ATTACK_VARIANTS, CLASSES, ClassKind, COMBO_WINDOW_MS, DODGE, EMOTES, DASH_INVULN_MS, GUARD_REDUCTION, isClassKind, levelFromXp, PVP_KILL_XP,
} from "../shared/classes";
import {
  attackMult, cooldownMult, CRIT, FROST, hasPower, heroSpeed, IGNITE, IRONSKIN_REDUCTION, magicMult, maxHpFromStats,
  SECOND_WIND, SHADOW_STRIKE_DAMAGE, SLOW_MOB, statsFor, ULT_LEVEL, ULTS,
  BLOODTHIRST, EAGLE_EYE_RANGE, GROUND_SLAM_STUN_MS, PIERCE_EXTRA, PINNING, RAGE,
} from "../shared/powers";
import {
  ITEM_LIFETIME_MS, ItemKind, LOOT, MAX_POTIONS, PICKUP_RADIUS, POTION_COOLDOWN_MS, POTION_HEAL, PVP_GOLD_DROP,
} from "../shared/items";
import { isSafeZone, isSolidAt, randomSpawn } from "../shared/map";
import { randomPointInZone, SPAWN_ZONES, zoneCap } from "../shared/spawns";
import { moveStep } from "../shared/movement";
import { canLearn, talentMult, talentBonus, talentReduce, TREES } from "../shared/talents";
import { BAG_SIZE, Equipped, GEAR, GEAR_SLOTS, GearSlot, gearName, gearSpeedMult, gearStats, isGearId, rollGear } from "../shared/gear";

export class Player extends Schema {
  @type("string") name = "";
  @type("string") cls: ClassKind = "knight";
  @type("number") color = 0xffffff;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("string") dir: Dir = "down";
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
  @type("boolean") stunned = false;
  @type("boolean") slowed = false;
  @type("boolean") raging = false; // barbarian Rage active
  @type("boolean") rolling = false; // dodge roll in progress
  // Equipment (shared/gear.ts): equipped item ids ("" = empty) and the unequipped items carried
  @type("string") weapon = "";
  @type("string") armour = "";
  @type("string") shoes = "";
  @type("string") hat = "";
  @type(["string"]) bag = new ArraySchema<string>();
  // Skill tree (shared/talents.ts): ranks per talent id
  @type({ map: "number" }) talents = new MapSchema<number>();

  input: InputState = { up: false, down: false, left: false, right: false };
  lastAttack = 0;
  lastSpecial = -Infinity;
  guardUntil = 0;
  invulnUntil = 0;
  rollUntil = 0;
  rollInput: InputState = { up: false, down: false, left: false, right: false };
  lastDodge = -Infinity;
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
  @type("number") x = 0;
  @type("number") y = 0;
  @type("string") dir: Dir = "down";
  @type("boolean") moving = false;
  @type("number") hp = 0;
  @type("number") maxHp = 0;
  @type("boolean") dead = false;
  @type("boolean") stunned = false;
  @type("boolean") slowed = false;

  stunUntil = 0;
  slowUntil = 0;
  zone = 0; // index into SPAWN_ZONES
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
interface HitOpts { kb?: number; stunMs?: number; slowMs?: number; crit?: boolean; skill?: boolean }

const COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1];
const STILL: InputState = { up: false, down: false, left: false, right: false };
const DIR_OFFSET: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const pushInput = (o: [number, number]): InputState => ({ up: o[1] < 0, down: o[1] > 0, left: o[0] < 0, right: o[0] > 0 });

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
    this.onMessage("learn", (client, tid: string) => this.learnTalent(client.sessionId, tid));
    this.onMessage("respec", (client) => this.respec(client.sessionId));

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
    m.hp = m.maxHp = def.maxHp;
    m.dead = false;
    m.target = "";
    if (!this.state.mobs.has(id)) this.state.mobs.set(id, m);
  }

  // ---- Tick ---------------------------------------------------------------

  private update(dtMs: number) {
    const dt = dtMs / 1000;
    const now = Date.now();
    this.state.players.forEach((p, pid) => {
      p.stunned = now < p.stunUntil;
      p.slowed = now < p.slowUntil;
      p.raging = now < p.rageUntil;
      if (p.dead) { p.moving = false; return; }
      p.rolling = now < p.rollUntil;
      const r = p.stunned
        ? { x: p.x, y: p.y, moving: false }
        : p.rolling
        ? moveStep(p.x, p.y, p.rollInput, dt, DODGE.distance / (DODGE.durationMs / 1000))
        : moveStep(p.x, p.y, p.input, dt, heroSpeed(p.cls, p.level, p.slowed, p.raging) * gearSpeedMult(this.equipped(p)) * talentMult(p.cls, p.talents, "speed"));
      p.x = r.x; p.y = r.y; p.moving = r.moving;
      if (!p.rolling) p.dir = dirFromInput(p.input, p.dir);
      if (r.moving) p.emote = "";
      p.guarding = now < p.guardUntil;
      // Out-of-combat regeneration, faster in the safe plaza
      if (p.hp < p.maxHp && now - p.lastHurt > REGEN_DELAY_MS) {
        const rate = isSafeZone(p.x, p.y) ? SAFE_REGEN_PER_SEC : REGEN_PER_SEC;
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * rate * dt);
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
    if (m.dead) { m.moving = false; return; }
    const def = MOBS[m.kind];
    m.stunned = now < m.stunUntil;
    m.slowed = now < m.slowUntil;
    if (m.stunned) { m.moving = false; return; }

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

    let input: InputState;
    if (t) {
      const dist = Math.hypot(t.x - m.x, t.y - m.y);
      if (dist <= MOB_ATTACK_RANGE) {
        input = STILL;
        m.dir = Math.abs(t.x - m.x) > Math.abs(t.y - m.y) ? (t.x > m.x ? "right" : "left") : (t.y > m.y ? "down" : "up");
        if (now - m.lastAttack >= def.attackCooldownMs) {
          m.lastAttack = now;
          this.broadcast("swing", { id });
          this.damagePlayer(m.target, def.damage, def.name, DIR_OFFSET[m.dir]);
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
      }
      input = m.wander;
    }

    const speed = (t ? def.speed : def.speed * 0.5) * (m.slowed ? SLOW_MOB : 1);
    const r = moveStep(m.x, m.y, input, dt, speed);
    if (!isSafeZone(r.x, r.y)) { m.x = r.x; m.y = r.y; }
    m.moving = r.moving;
    m.dir = dirFromInput(input, m.dir);
  }

  private updateProjectile(s: Projectile, id: string, dt: number) {
    const [ox, oy] = DIR_OFFSET[s.dir];
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
        this.hitTarget(s.owner, hit, s.damage, DIR_OFFSET[s.dir], { kb: s.knockback, slowMs: s.slowMs || undefined });
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

  private dropLoot(kind: MobKind, x: number, y: number) {
    const def = LOOT[kind];
    const gold = def.gold[0] + Math.floor(Math.random() * (def.gold[1] - def.gold[0] + 1));
    if (gold > 0) this.dropItem("gold", x, y, gold);
    if (Math.random() < def.potionChance) this.dropItem("potion", x, y, 1);
    const gear = rollGear(kind);
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
        p.bag.push(it.gear);
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
    if (!p || p.dead || p.stunned || now - p.lastDodge < DODGE.cooldownMs) return;
    const i = p.input;
    const moving = i.up !== i.down || i.left !== i.right;
    p.rollInput = moving ? { ...i } : pushInput(DIR_OFFSET[p.dir]);
    p.lastDodge = now;
    p.rollUntil = now + DODGE.durationMs;
    p.rolling = true;
    p.invulnUntil = Math.max(p.invulnUntil, now + DODGE.invulnMs);
    p.emote = "";
    this.broadcast("dodge", { id, dir: p.dir });
  }

  // ---- Skill tree ---------------------------------------------------------

  private learnTalent(id: string, tid: string) {
    const p = this.state.players.get(id);
    if (!p || typeof tid !== "string" || !canLearn(p.cls, p.level, p.talents, tid)) return;
    p.talents.set(tid, (p.talents.get(tid) ?? 0) + 1);
    this.applyStats(p);
  }

  /** Free reset of all skill points, only out of combat. */
  private respec(id: string) {
    const p = this.state.players.get(id);
    if (!p || p.dead || Date.now() - p.lastHurt < 5000) return;
    p.talents.clear();
    this.applyStats(p);
  }

  // ---- Equipment ----------------------------------------------------------

  private equipped(p: Player): Equipped {
    return { weapon: p.weapon, armour: p.armour, shoes: p.shoes, hat: p.hat };
  }

  /** Wear the bag item at index `i`; whatever was in that slot goes back to the bag. */
  private equip(id: string, i: number) {
    const p = this.state.players.get(id);
    if (!p || typeof i !== "number" || i < 0 || i >= p.bag.length) return;
    const gid = p.bag.at(i), def = gid ? GEAR[gid] : undefined;
    if (!gid || !def) return;
    const slot: GearSlot = def.slot;
    const old = p[slot];
    if (old) p.bag.setAt(i, old); else p.bag.splice(i, 1);
    p[slot] = gid;
    this.applyStats(p);
  }

  private unequip(id: string, slot: GearSlot) {
    const p = this.state.players.get(id);
    if (!p || !GEAR_SLOTS.includes(slot) || !p[slot] || p.bag.length >= BAG_SIZE) return;
    p.bag.push(p[slot]);
    p[slot] = "";
    this.applyStats(p);
  }

  /** Throw a bag item on the ground (anyone can pick it up). */
  private dropGear(id: string, i: number) {
    const p = this.state.players.get(id);
    if (!p || typeof i !== "number" || i < 0 || i >= p.bag.length) return;
    const [gid] = p.bag.splice(i, 1);
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
      if (!m.dead && Math.hypot(m.x - x, m.y - y) <= r) out.push(mid);
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
    const share = (hasPower(a.cls, a.level, "bloodthirst") ? BLOODTHIRST : 0) + talentBonus(a.cls, a.talents, "lifesteal") / 100;
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
      const killed = this.damagePlayer(targetId, dmg, name, push, kb, opts);
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
    if (opts.stunMs) m.stunUntil = Math.max(m.stunUntil, now + opts.stunMs);
    if (opts.slowMs) m.slowUntil = Math.max(m.slowUntil, now + opts.slowMs);
    const k = moveStep(m.x, m.y, pushInput(push), 0.1 * kb);
    if (!isSafeZone(k.x, k.y)) { m.x = k.x; m.y = k.y; }
    this.broadcast("hit", { id: targetId, dmg, crit: !!opts.crit });
    if (m.hp > 0) return;
    m.dead = true;
    this.grantXp(attackerId, def.xp, m);
    this.dropLoot(m.kind, m.x, m.y);
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

  private grantXp(id: string, amount: number, at: { x: number; y: number }) {
    const p = this.state.players.get(id);
    if (!p) return;
    p.xp += amount;
    this.clients.find((c) => c.sessionId === id)?.send("xp", { amount, x: at.x, y: at.y });
    const lvl = levelFromXp(p.xp);
    if (lvl > p.level) {
      const from = p.level;
      p.level = lvl;
      this.applyStats(p); // stat points are allocated automatically by class
      if (!p.dead) p.hp = p.maxHp; // full heal on level up
      this.broadcast("levelup", { id, level: lvl, from });
    }
  }

  /** Recompute stats and max HP from class + level + equipped gear. */
  private applyStats(p: Player) {
    const st = statsFor(p.cls, p.level);
    const g = gearStats(p.cls, this.equipped(p));
    st.sta += g.sta; st.str += g.str; st.mag += g.mag;
    p.sta = st.sta; p.str = st.str; p.mag = st.mag;
    const newMax = Math.round(maxHpFromStats(p.cls, st) * talentMult(p.cls, p.talents, "hp"));
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
    if (hasPower(t.cls, t.level, "ironskin")) dmg = Math.max(1, Math.round(dmg * (1 - IRONSKIN_REDUCTION)));
    dmg = Math.max(1, Math.round(dmg * talentReduce(t.cls, t.talents, "armor")));
    // Barbarian Unstoppable: while raging, ignore stun, slow and knockback
    const unstoppable = now < t.rageUntil && hasPower(t.cls, t.level, "unstoppable");
    if (opts.stunMs && !guarded && !unstoppable) t.stunUntil = Math.max(t.stunUntil, now + opts.stunMs);
    if (opts.slowMs && !unstoppable) t.slowUntil = Math.max(t.slowUntil, now + opts.slowMs);
    t.hp = Math.max(0, t.hp - dmg);
    t.lastHurt = now;
    t.emote = "";
    if (!guarded && !unstoppable) {
      const kb = moveStep(t.x, t.y, pushInput(push), 0.12 * kbMul);
      t.x = kb.x; t.y = kb.y;
    }
    this.broadcast("hit", { id: tid, dmg, blocked: guarded, crit: !!opts.crit });
    // Knight Second Wind: an emergency heal when HP drops low
    if (t.hp > 0 && t.hp < t.maxHp * SECOND_WIND.threshold && hasPower(t.cls, t.level, "secondwind") && now >= t.secondWindAt) {
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
    if (!a || a.dead || a.stunned) return;
    const def = CLASSES[a.cls];
    if (now < a.attackReadyAt) return;
    // Chain into the next combo hit if pressed soon enough after the last one, else restart
    const step = a.lastAttack > 0 && now - a.attackReadyAt <= COMBO_WINDOW_MS && a.combo < 2 ? a.combo + 1 : 0;
    const hit = def.combo[step];
    a.combo = step;
    a.lastAttack = now;
    a.attackReadyAt = now + (hit.cooldownMs ?? def.attackCooldownMs);
    const off = DIR_OFFSET[a.dir];
    let dmg = Math.round(def.damage * attackMult(a.cls, this.stats(a)) * hit.damage);
    const critChance = (hasPower(a.cls, a.level, "crit") ? CRIT.chance : 0) + talentBonus(a.cls, a.talents, "crit") / 100;
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
    this.broadcast("swing", { id, step, variant });

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

    const reach = hit.range ?? def.attackRange;
    // Barbarian Ground Slam: the finisher stuns
    const slam = step === 2 && hasPower(a.cls, a.level, "groundslam") ? GROUND_SLAM_STUN_MS : undefined;
    // Knight Cleave: the finisher hits all around instead of only in front
    if (step === 2 && hasPower(a.cls, a.level, "cleave")) {
      for (const tid of this.targetsAround(a.x, a.y, reach, id)) this.hitTarget(id, tid, dmg, this.pushFrom(a.x, a.y, tid), { kb: hit.knockback, crit });
      return;
    }
    const hx = a.x + off[0] * 12, hy = a.y + off[1] * 12;
    for (const tid of this.targetsAround(hx, hy, reach, id)) this.hitTarget(id, tid, dmg, off, { kb: hit.knockback, crit, stunMs: slam });
  }

  /** Fire one projectile from `a` (fireball or arrow), offset sideways by `lane` px. */
  private shoot(a: Player, id: string, dmg: number, knockback: number, scale: number, lane = 0) {
    const def = CLASSES[a.cls].projectile!;
    const off = DIR_OFFSET[a.dir];
    const s = new Projectile();
    // Lanes are perpendicular to the facing direction (for Volley)
    s.x = a.x + off[0] * 6 + off[1] * lane; s.y = a.y - 4 + off[1] * 6 + off[0] * lane;
    s.dir = a.dir; s.owner = id; s.size = scale; s.kind = def.kind;
    s.speed = def.speed; s.radius = def.radius * scale;
    s.range = def.range * (hasPower(a.cls, a.level, "eagleeye") ? EAGLE_EYE_RANGE : 1);
    s.damage = dmg; s.knockback = knockback;
    s.ignite = hasPower(a.cls, a.level, "ignite");
    s.pierce = hasPower(a.cls, a.level, "pierce") ? PIERCE_EXTRA : 0;
    s.slowMs = hasPower(a.cls, a.level, "pinning") ? PINNING.durationMs : 0;
    this.state.projectiles.set(`s${++this.shotSeq}`, s);
  }

  private playerSpecial(id: string) {
    const a = this.state.players.get(id);
    const now = Date.now();
    if (!a || a.dead || a.stunned) return;
    const sp = CLASSES[a.cls].special;
    if (now - a.lastSpecial < sp.cooldownMs * cooldownMult(a.cls, this.stats(a), a.level) * talentReduce(a.cls, a.talents, "cdr")) return;
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
        const step = pushInput(DIR_OFFSET[a.dir]);
        const shadow = hasPower(a.cls, a.level, "shadowstrike");
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
        for (const tid of cut) this.hitTarget(id, tid, sdmg, DIR_OFFSET[a.dir], { kb: 0.5, skill: true });
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
        const frost = hasPower(a.cls, a.level, "frost");
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
    if (!a || a.dead || a.stunned || a.level < ULT_LEVEL) return;
    const u = ULTS[a.cls];
    if (now - a.lastUlt < u.cooldownMs * cooldownMult(a.cls, this.stats(a), a.level) * talentReduce(a.cls, a.talents, "cdr")) return;
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
      const off = DIR_OFFSET[a.dir];
      const x = a.x + off[0] * (u.ahead ?? 56), y = a.y + off[1] * (u.ahead ?? 56);
      this.broadcast("ult", { id, kind: "meteor", x, y, r: u.radius, delay: u.delayMs });
      this.clock.setTimeout(() => blast(x, y, { kb: 2 }), u.delayMs ?? 600);
    } else if (a.cls === "archer") {
      const off = DIR_OFFSET[a.dir];
      const x = a.x + off[0] * (u.ahead ?? 72), y = a.y + off[1] * (u.ahead ?? 72);
      this.broadcast("ult", { id, kind: "arrowrain", x, y, r: u.radius, delay: u.delayMs, hits: u.hits });
      for (let i = 0; i < (u.hits ?? 4); i++) {
        this.clock.setTimeout(() => blast(x, y, { kb: 0.3, slowMs: hasPower(a.cls, a.level, "pinning") ? PINNING.durationMs : undefined }), (u.delayMs ?? 400) + i * 250);
      }
    } else {
      // Barbarian Leap: jump forward (walls stop it), briefly untouchable, crash down on landing
      const fromX = a.x, fromY = a.y;
      const step = pushInput(DIR_OFFSET[a.dir]);
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
