import { Client, Room } from "colyseus";
import { MapSchema, Schema, type } from "@colyseus/schema";
import {
  ATTACK_COOLDOWN_MS, ATTACK_DAMAGE, ATTACK_RANGE, Dir, InputState,
  MAX_HP, RESPAWN_MS, TICK_RATE,
} from "../shared/constants";
import { randomSpawn } from "../shared/map";
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
  @type("number") seq = 0; // last processed input sequence (for client reconciliation)

  input: InputState = { up: false, down: false, left: false, right: false };
  lastAttack = 0;
}

export class TownState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}

const COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1];

export class TownRoom extends Room<TownState> {
  maxClients = 50;

  onCreate() {
    this.setState(new TownState());
    this.setPatchRate(1000 / TICK_RATE);
    this.setSimulationInterval((dt) => this.update(dt), 1000 / TICK_RATE);

    this.onMessage("input", (client, msg: InputState & { seq: number }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.input = { up: !!msg.up, down: !!msg.down, left: !!msg.left, right: !!msg.right };
      p.seq = msg.seq | 0;
    });

    this.onMessage("attack", (client) => this.handleAttack(client.sessionId));

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

  private update(dtMs: number) {
    const dt = dtMs / 1000;
    this.state.players.forEach((p) => {
      if (p.dead) { p.moving = false; return; }
      const r = moveStep(p.x, p.y, p.input, dt);
      p.x = r.x; p.y = r.y; p.moving = r.moving;
      const i = p.input;
      if (i.left) p.dir = "left";
      else if (i.right) p.dir = "right";
      else if (i.up) p.dir = "up";
      else if (i.down) p.dir = "down";
    });
  }

  private handleAttack(id: string) {
    const a = this.state.players.get(id);
    const now = Date.now();
    if (!a || a.dead || now - a.lastAttack < ATTACK_COOLDOWN_MS) return;
    a.lastAttack = now;
    this.broadcast("swing", { id });

    // Hit point in front of attacker
    const off = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[a.dir];
    const hx = a.x + off[0] * 12, hy = a.y + off[1] * 12;

    this.state.players.forEach((t, tid) => {
      if (tid === id || t.dead) return;
      if (Math.hypot(t.x - hx, t.y - hy) > ATTACK_RANGE) return;
      t.hp = Math.max(0, t.hp - ATTACK_DAMAGE);
      // Knockback (only if not into a wall — reuse movement collision)
      const kb = moveStep(t.x, t.y, {
        up: off[1] < 0, down: off[1] > 0, left: off[0] < 0, right: off[0] > 0,
      }, 0.12);
      t.x = kb.x; t.y = kb.y;
      this.broadcast("hit", { id: tid, by: id });
      if (t.hp === 0) {
        t.dead = true;
        a.kills++;
        this.broadcast("kill", { killer: a.name, victim: t.name });
        this.clock.setTimeout(() => {
          if (!this.state.players.has(tid)) return;
          const s = randomSpawn();
          t.x = s.x; t.y = s.y; t.hp = MAX_HP; t.dead = false;
        }, RESPAWN_MS);
      }
    });
  }
}
