import { Client, Room } from "colyseus";
import { MapSchema, Schema, type } from "@colyseus/schema";
import {
  ATTACK_COOLDOWN_MS, ATTACK_DAMAGE, ATTACK_RANGE, Dir, InputState,
  MAX_HP, MOB_ATTACK_RANGE, MOBS, MobKind, RESPAWN_MS, TICK_RATE,
} from "../shared/constants";
import { isSafeZone, randomOutskirtsPoint, randomSpawn } from "../shared/map";
import { moveStep } from "../shared/movement";

export class Player extends Schema {
  @type("string") name = "";
  @type("number") color = 0xffffff;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("string") dir: Dir = "down";
  @type("boolean") moving = false;
  @type("number") hp = MAX_HP;
  @type("boolean") dead = false;
  @type("number") kills = 0;
  @type("number") xp = 0;
  @type("number") seq = 0; // last processed input sequence (for client reconciliation)

  input: InputState = { up: false, down: false, left: false, right: false };
  lastAttack = 0;
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

export class TownState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Mob }) mobs = new MapSchema<Mob>();
}

const COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1];
const STILL: InputState = { up: false, down: false, left: false, right: false };
const DIR_OFFSET: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

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

    this.onMessage("chat", (client, text: string) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof text !== "string") return;
      const clean = text.slice(0, 120).trim();
      if (clean) this.broadcast("chat", { id: client.sessionId, name: p.name, text: clean });
    });
  }

  onJoin(client: Client, options: { name?: string; color?: number }) {
    const p = new Player();
    p.name = String(options?.name ?? "").slice(0, 16).trim() || `Hero${Math.floor(Math.random() * 1000)}`;
    p.color = typeof options?.color === "number" ? options.color : COLORS[Math.floor(Math.random() * COLORS.length)];
    const s = randomSpawn();
    p.x = s.x; p.y = s.y;
    this.state.players.set(client.sessionId, p);
    console.log(`${p.name} joined (${this.clients.length} online)`);
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

  private update(dtMs: number) {
    const dt = dtMs / 1000;
    this.state.players.forEach((p) => {
      if (p.dead) { p.moving = false; return; }
      const r = moveStep(p.x, p.y, p.input, dt);
      p.x = r.x; p.y = r.y; p.moving = r.moving;
      p.dir = dirFromInput(p.input, p.dir);
    });
    const now = Date.now();
    this.state.mobs.forEach((m, id) => this.updateMob(m, id, dt, now));
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

  /** Applies damage to a player. Returns true if it killed them. */
  private damagePlayer(tid: string, dmg: number, byName: string, push: [number, number]): boolean {
    const t = this.state.players.get(tid);
    if (!t || t.dead || isSafeZone(t.x, t.y)) return false;
    t.hp = Math.max(0, t.hp - dmg);
    const kb = moveStep(t.x, t.y, { up: push[1] < 0, down: push[1] > 0, left: push[0] < 0, right: push[0] > 0 }, 0.12);
    t.x = kb.x; t.y = kb.y;
    this.broadcast("hit", { id: tid, dmg });
    if (t.hp > 0) return false;
    t.dead = true;
    this.broadcast("kill", { killer: byName, victim: t.name });
    this.clock.setTimeout(() => {
      if (!this.state.players.has(tid)) return;
      const s = randomSpawn();
      t.x = s.x; t.y = s.y; t.hp = MAX_HP; t.dead = false;
    }, RESPAWN_MS);
    return true;
  }

  private playerAttack(id: string) {
    const a = this.state.players.get(id);
    const now = Date.now();
    if (!a || a.dead || now - a.lastAttack < ATTACK_COOLDOWN_MS) return;
    a.lastAttack = now;
    this.broadcast("swing", { id });

    const off = DIR_OFFSET[a.dir];
    const hx = a.x + off[0] * 12, hy = a.y + off[1] * 12;
    const inReach = (x: number, y: number) => Math.hypot(x - hx, y - hy) <= ATTACK_RANGE;

    this.state.players.forEach((t, tid) => {
      if (tid === id || t.dead || !inReach(t.x, t.y)) return;
      if (this.damagePlayer(tid, ATTACK_DAMAGE, a.name, off)) a.kills++;
    });

    this.state.mobs.forEach((m, mid) => {
      if (m.dead || !inReach(m.x, m.y)) return;
      const def = MOBS[m.kind];
      m.hp = Math.max(0, m.hp - ATTACK_DAMAGE);
      m.target = id; // fight back
      const kb = moveStep(m.x, m.y, { up: off[1] < 0, down: off[1] > 0, left: off[0] < 0, right: off[0] > 0 }, 0.1);
      if (!isSafeZone(kb.x, kb.y)) { m.x = kb.x; m.y = kb.y; }
      this.broadcast("hit", { id: mid, dmg: ATTACK_DAMAGE });
      if (m.hp > 0) return;
      m.dead = true;
      a.xp += def.xp;
      const client = this.clients.find((c) => c.sessionId === id);
      if (client) client.send("xp", { amount: def.xp, x: m.x, y: m.y });
      this.clock.setTimeout(() => this.spawnMob(m.kind, mid), def.respawnMs);
    });
  }
}
