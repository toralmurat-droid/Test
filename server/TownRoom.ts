import { Client, Room } from "colyseus";
import { MapSchema, Schema, type } from "@colyseus/schema";
import {
  Dir, HIT_RADIUS, InputState, MOB_ATTACK_RANGE, MOBS, MobKind, REGEN_DELAY_MS, REGEN_PER_SEC,
  RESPAWN_MS, SAFE_REGEN_PER_SEC, TICK_RATE,
} from "../shared/constants";
import {
  CLASSES, ClassKind, damageFor, DASH_INVULN_MS, GUARD_REDUCTION, isClassKind, levelFromXp, maxHpFor, PVP_KILL_XP,
} from "../shared/classes";
import { isSafeZone, isSolidAt, randomOutskirtsPoint, randomSpawn } from "../shared/map";
import { moveStep } from "../shared/movement";

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
  @type("number") seq = 0; // last processed input sequence (for client reconciliation)

  input: InputState = { up: false, down: false, left: false, right: false };
  lastAttack = 0;
  lastSpecial = -Infinity;
  guardUntil = 0;
  invulnUntil = 0;
  lastHurt = 0;
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

  traveled = 0;
  speed = 0;
  range = 0;
  radius = 0;
  damage = 0;
}

export class TownState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Mob }) mobs = new MapSchema<Mob>();
  @type({ map: Projectile }) projectiles = new MapSchema<Projectile>();
}

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

  onCreate() {
    this.setState(new TownState());
    this.setPatchRate(1000 / TICK_RATE);
    this.setSimulationInterval((dt) => this.update(dt), 1000 / TICK_RATE);

    for (const kind of Object.keys(MOBS) as MobKind[]) {
      for (let i = 0; i < MOBS[kind].count; i++) this.spawnMob(kind);
    }

    this.onMessage("input", (client, msg: InputState & { seq: number }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.input = { up: !!msg.up, down: !!msg.down, left: !!msg.left, right: !!msg.right };
      p.seq = msg.seq | 0;
    });

    this.onMessage("attack", (client) => this.playerAttack(client.sessionId));
    this.onMessage("special", (client) => this.playerSpecial(client.sessionId));

    this.onMessage("chat", (client, text: string) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof text !== "string") return;
      const clean = text.slice(0, 120).trim();
      if (clean) this.broadcast("chat", { id: client.sessionId, name: p.name, text: clean });
    });
  }

  onJoin(client: Client, options: { name?: string; color?: number; cls?: string }) {
    const p = new Player();
    p.name = String(options?.name ?? "").slice(0, 16).trim() || `Hero${Math.floor(Math.random() * 1000)}`;
    p.color = typeof options?.color === "number" ? options.color : COLORS[Math.floor(Math.random() * COLORS.length)];
    p.cls = isClassKind(options?.cls) ? options.cls : "knight";
    p.hp = p.maxHp = maxHpFor(p.cls, 1);
    const s = randomSpawn();
    p.x = s.x; p.y = s.y;
    this.state.players.set(client.sessionId, p);
    console.log(`${p.name} the ${CLASSES[p.cls].name} joined (${this.clients.length} online)`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }

  private spawnMob(kind: MobKind, id = `m${++this.mobSeq}`) {
    const def = MOBS[kind];
    const home = randomOutskirtsPoint();
    const m = this.state.mobs.get(id) ?? new Mob();
    m.kind = kind;
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
    this.state.players.forEach((p) => {
      if (p.dead) { p.moving = false; return; }
      const r = moveStep(p.x, p.y, p.input, dt, CLASSES[p.cls].speed);
      p.x = r.x; p.y = r.y; p.moving = r.moving;
      p.dir = dirFromInput(p.input, p.dir);
      p.guarding = now < p.guardUntil;
      // Out-of-combat regeneration, faster in the safe plaza
      if (p.hp < p.maxHp && now - p.lastHurt > REGEN_DELAY_MS) {
        const rate = isSafeZone(p.x, p.y) ? SAFE_REGEN_PER_SEC : REGEN_PER_SEC;
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * rate * dt);
      }
    });
    this.state.mobs.forEach((m, id) => this.updateMob(m, id, dt, now));
    this.state.projectiles.forEach((s, id) => this.updateProjectile(s, id, dt));
  }

  private updateMob(m: Mob, id: string, dt: number, now: number) {
    if (m.dead) { m.moving = false; return; }
    const def = MOBS[m.kind];

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

    const speed = t ? def.speed : def.speed * 0.5;
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
      const hit = this.firstTargetAt(s.x, s.y, s.radius + HIT_RADIUS, s.owner);
      if (hit) {
        this.hitTarget(s.owner, hit, s.damage, DIR_OFFSET[s.dir]);
        return this.explode(s, id);
      }
    }
  }

  private explode(s: Projectile, id: string) {
    this.broadcast("boom", { x: s.x, y: s.y });
    this.state.projectiles.delete(id);
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

  private firstTargetAt(x: number, y: number, r: number, exclude: string): string | undefined {
    // Skip players who cannot be hurt right now (safe zone, dash) so shots pass through them
    const now = Date.now();
    return this.targetsAround(x, y, r, exclude).find((id) => {
      const p = this.state.players.get(id);
      return !p || (!isSafeZone(p.x, p.y) && now >= p.invulnUntil);
    });
  }

  /** A player (`attackerId`) hits a player or mob. */
  private hitTarget(attackerId: string, targetId: string, dmg: number, push: [number, number]) {
    const a = this.state.players.get(attackerId);
    const name = a?.name ?? "???";
    if (this.state.players.has(targetId)) {
      if (this.damagePlayer(targetId, dmg, name, push) && a) {
        a.kills++;
        this.grantXp(attackerId, PVP_KILL_XP, this.state.players.get(targetId)!);
      }
      return;
    }
    const m = this.state.mobs.get(targetId);
    if (!m || m.dead) return;
    const def = MOBS[m.kind];
    m.hp = Math.max(0, m.hp - dmg);
    m.target = attackerId; // fight back
    const kb = moveStep(m.x, m.y, pushInput(push), 0.1);
    if (!isSafeZone(kb.x, kb.y)) { m.x = kb.x; m.y = kb.y; }
    this.broadcast("hit", { id: targetId, dmg });
    if (m.hp > 0) return;
    m.dead = true;
    this.grantXp(attackerId, def.xp, m);
    this.clock.setTimeout(() => this.spawnMob(m.kind, targetId), def.respawnMs);
  }

  private grantXp(id: string, amount: number, at: { x: number; y: number }) {
    const p = this.state.players.get(id);
    if (!p) return;
    p.xp += amount;
    this.clients.find((c) => c.sessionId === id)?.send("xp", { amount, x: at.x, y: at.y });
    const lvl = levelFromXp(p.xp);
    if (lvl > p.level) {
      p.level = lvl;
      const newMax = maxHpFor(p.cls, lvl);
      p.hp += newMax - p.maxHp;
      p.maxHp = newMax;
      if (!p.dead) p.hp = p.maxHp; // full heal on level up
      this.broadcast("levelup", { id, level: lvl });
    }
  }

  /** Applies damage to a player. Returns true if it killed them. */
  private damagePlayer(tid: string, dmg: number, byName: string, push: [number, number]): boolean {
    const t = this.state.players.get(tid);
    const now = Date.now();
    if (!t || t.dead || isSafeZone(t.x, t.y) || now < t.invulnUntil) return false;
    const guarded = now < t.guardUntil;
    if (guarded) dmg = Math.max(1, Math.round(dmg * (1 - GUARD_REDUCTION)));
    t.hp = Math.max(0, t.hp - dmg);
    t.lastHurt = now;
    if (!guarded) {
      const kb = moveStep(t.x, t.y, pushInput(push), 0.12);
      t.x = kb.x; t.y = kb.y;
    }
    this.broadcast("hit", { id: tid, dmg, blocked: guarded });
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
    if (!a || a.dead) return;
    const def = CLASSES[a.cls];
    if (now - a.lastAttack < def.attackCooldownMs) return;
    a.lastAttack = now;
    const off = DIR_OFFSET[a.dir];
    const dmg = damageFor(def.damage, a.level);
    this.broadcast("swing", { id });

    if (def.projectile) {
      const s = new Projectile();
      s.x = a.x + off[0] * 6; s.y = a.y - 4 + off[1] * 6;
      s.dir = a.dir; s.owner = id;
      s.speed = def.projectile.speed; s.range = def.projectile.range; s.radius = def.projectile.radius;
      s.damage = dmg;
      this.state.projectiles.set(`s${++this.shotSeq}`, s);
      return;
    }

    const hx = a.x + off[0] * 12, hy = a.y + off[1] * 12;
    for (const tid of this.targetsAround(hx, hy, def.attackRange, id)) this.hitTarget(id, tid, dmg, off);
  }

  private playerSpecial(id: string) {
    const a = this.state.players.get(id);
    const now = Date.now();
    if (!a || a.dead) return;
    const sp = CLASSES[a.cls].special;
    if (now - a.lastSpecial < sp.cooldownMs) return;
    a.lastSpecial = now;

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
        // Move in 4px steps so walls stop the dash instead of being skipped
        for (let moved = 0; moved < dist; moved += 4) {
          const r = moveStep(a.x, a.y, step, 1, 4);
          if (r.x === a.x && r.y === a.y) break;
          a.x = r.x; a.y = r.y;
        }
        a.invulnUntil = now + DASH_INVULN_MS;
        this.broadcast("special", { id, kind: sp.kind, fromX, fromY, x: a.x, y: a.y });
        break;
      }
      case "nova": {
        const r = sp.radius ?? 38;
        const dmg = damageFor(sp.damage ?? 30, a.level);
        this.broadcast("special", { id, kind: sp.kind, x: a.x, y: a.y, r });
        for (const tid of this.targetsAround(a.x, a.y, r, id)) {
          const t = this.state.players.get(tid) ?? this.state.mobs.get(tid)!;
          const dx = t.x - a.x, dy = t.y - a.y;
          const push: [number, number] = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy) || 1];
          this.hitTarget(id, tid, dmg, push);
        }
        break;
      }
    }
  }
}
