import Phaser from "phaser";
import { Client, Room } from "colyseus.js";
import { InputState, MAP_H, MAP_W, MAX_HP, TILE } from "../../shared/constants";
import { TOWN_MAP } from "../../shared/map";
import { moveStep } from "../../shared/movement";
import { makeTileset, personaTexture } from "./textures";

interface Entity {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Graphics;
  bubble?: Phaser.GameObjects.Text;
  tx: number; ty: number; // server target position
  state: any;
}

const FRAME_BASE: Record<string, number> = { down: 0, up: 2, right: 4, left: 4 };

export class TownScene extends Phaser.Scene {
  private room!: Room;
  private me = "";
  private entities = new Map<string, Entity>();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private input_: InputState = { up: false, down: false, left: false, right: false };
  private seq = 0;
  private chatEl = document.getElementById("chat") as HTMLInputElement;

  constructor(private opts: { name: string; color: number }) {
    super("town");
  }

  async create() {
    makeTileset(this);
    const map = this.make.tilemap({ data: TOWN_MAP, tileWidth: TILE, tileHeight: TILE });
    const tiles = map.addTilesetImage("tiles", "tiles", TILE, TILE, 0, 0)!;
    map.createLayer(0, tiles, 0, 0)!.setDepth(-1);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    cam.setZoom(3);
    cam.roundPixels = true;

    // Keys without capture so typing in chat still works
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE", false) as any;
    this.input.keyboard!.on("keydown-SPACE", () => { if (!this.chatting()) this.room?.send("attack"); });
    this.setupChat();

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = import.meta.env.DEV ? `${proto}://${location.hostname}:2567` : `${proto}://${location.host}`;
    try {
      this.room = await new Client(url).joinOrCreate("town", this.opts);
    } catch (e) {
      document.getElementById("status")!.textContent = "Could not connect to server.";
      document.getElementById("play")!.removeAttribute("disabled");
      this.game.destroy(true);
      return;
    }
    this.me = this.room.sessionId;
    document.getElementById("join")!.hidden = true;
    (document.getElementById("join") as HTMLElement).style.display = "none";
    document.getElementById("hud")!.hidden = false;

    const players = (this.room.state as any).players;
    players.onAdd((p: any, id: string) => {
      this.addEntity(id, p);
      p.onChange(() => {
        const e = this.entities.get(id);
        if (!e) return;
        e.tx = p.x; e.ty = p.y;
        // Snap on respawn / large correction
        if (Math.hypot(e.sprite.x - p.x, e.sprite.y - p.y) > 48) e.sprite.setPosition(p.x, p.y);
      });
    });
    players.onRemove((_p: any, id: string) => this.removeEntity(id));

    this.room.onMessage("swing", ({ id }) => this.showSwing(id));
    this.room.onMessage("hit", ({ id }) => {
      const e = this.entities.get(id);
      if (!e) return;
      e.sprite.setTintFill(0xffffff);
      this.time.delayedCall(80, () => e.sprite.clearTint());
      if (id === this.me) this.cameras.main.shake(100, 0.004);
    });
    this.room.onMessage("kill", ({ killer, victim }) => this.feed(`${killer} ⚔ ${victim}`));
    this.room.onMessage("chat", ({ id, name, text }) => this.chatMessage(id, name, text));
    this.room.onLeave(() => this.feed("Disconnected from server"));
  }

  private chatting() { return document.activeElement === this.chatEl; }

  private setupChat() {
    window.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      if (this.chatting()) {
        const t = this.chatEl.value.trim();
        if (t) this.room?.send("chat", t);
        this.chatEl.value = "";
        this.chatEl.blur();
      } else if (this.room) {
        this.chatEl.focus();
      }
      ev.preventDefault();
    });
  }

  private addEntity(id: string, p: any) {
    const sprite = this.add.sprite(p.x, p.y, personaTexture(this, p.color), 0).setOrigin(0.5, 0.85);
    const label = this.add.text(p.x, p.y, p.name, {
      fontFamily: "monospace", fontSize: "16px", color: id === this.me ? "#ffd166" : "#ffffff",
      stroke: "#000", strokeThickness: 3,
    }).setOrigin(0.5, 1).setScale(0.25).setResolution(2);
    const bar = this.add.graphics();
    this.entities.set(id, { sprite, label, bar, tx: p.x, ty: p.y, state: p });
    if (id === this.me) this.cameras.main.startFollow(sprite, true, 0.15, 0.15);
  }

  private removeEntity(id: string) {
    const e = this.entities.get(id);
    if (!e) return;
    e.sprite.destroy(); e.label.destroy(); e.bar.destroy(); e.bubble?.destroy();
    this.entities.delete(id);
  }

  private showSwing(id: string) {
    const e = this.entities.get(id);
    if (!e) return;
    const dir = e.state.dir as string;
    const off = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir] ?? [0, 1];
    const g = this.add.graphics({ x: e.sprite.x + off[0] * 10, y: e.sprite.y - 5 + off[1] * 10 });
    g.lineStyle(2, 0xffffff, 1);
    const a = Math.atan2(off[1], off[0]);
    g.beginPath(); g.arc(0, 0, 8, a - 1, a + 1); g.strokePath();
    g.setDepth(10000);
    this.tweens.add({ targets: g, alpha: 0, scale: 1.4, duration: 180, onComplete: () => g.destroy() });
  }

  private feed(text: string) {
    const el = document.createElement("div");
    el.textContent = text;
    const feed = document.getElementById("feed")!;
    feed.prepend(el);
    setTimeout(() => el.remove(), 5000);
  }

  private chatMessage(id: string, name: string, text: string) {
    const log = document.getElementById("chatlog")!;
    const el = document.createElement("div");
    el.textContent = `${name}: ${text}`;
    log.appendChild(el);
    while (log.children.length > 8) log.firstChild!.remove();
    const e = this.entities.get(id);
    if (!e) return;
    e.bubble?.destroy();
    e.bubble = this.add.text(0, 0, text, {
      fontFamily: "monospace", fontSize: "16px", color: "#000", backgroundColor: "#ffffffdd",
      padding: { x: 4, y: 2 }, wordWrap: { width: 400 },
    }).setOrigin(0.5, 1).setScale(0.25).setResolution(2).setDepth(20000);
    const b = e.bubble;
    this.time.delayedCall(4000, () => { if (e.bubble === b) { b.destroy(); e.bubble = undefined; } });
  }

  update(_t: number, dtMs: number) {
    if (!this.room) return;
    const k = this.keys;
    const typing = this.chatting();
    const next: InputState = typing
      ? { up: false, down: false, left: false, right: false }
      : { up: k.W.isDown || k.UP.isDown, down: k.S.isDown || k.DOWN.isDown, left: k.A.isDown || k.LEFT.isDown, right: k.D.isDown || k.RIGHT.isDown };
    const i = this.input_;
    if (next.up !== i.up || next.down !== i.down || next.left !== i.left || next.right !== i.right) {
      this.input_ = next;
      this.room.send("input", { ...next, seq: ++this.seq });
    }

    const now = this.time.now;
    for (const [id, e] of this.entities) {
      const p = e.state;
      if (id === this.me && !p.dead) {
        // Client-side prediction with the same movement code the server runs
        const r = moveStep(e.sprite.x, e.sprite.y, this.input_, dtMs / 1000);
        e.sprite.setPosition(r.x, r.y);
        if (!r.moving) {
          // Ease toward authoritative position while idle
          e.sprite.x += (e.tx - e.sprite.x) * 0.2;
          e.sprite.y += (e.ty - e.sprite.y) * 0.2;
        }
      } else {
        e.sprite.x += (e.tx - e.sprite.x) * 0.25;
        e.sprite.y += (e.ty - e.sprite.y) * 0.25;
      }

      const moving = id === this.me ? (this.input_.up || this.input_.down || this.input_.left || this.input_.right) : p.moving;
      const step = moving ? Math.floor(now / 150) % 2 : 0;
      e.sprite.setFrame(FRAME_BASE[p.dir] + step);
      e.sprite.setFlipX(p.dir === "left");
      e.sprite.setAlpha(p.dead ? 0.35 : 1).setAngle(p.dead ? 90 : 0);
      e.sprite.setDepth(e.sprite.y);

      const x = Math.round(e.sprite.x), y = Math.round(e.sprite.y);
      e.label.setPosition(x, y - 16).setDepth(e.sprite.y + 1);
      e.bubble?.setPosition(x, y - 21);
      e.bar.clear().setDepth(e.sprite.y + 1);
      if (!p.dead && p.hp < MAX_HP) {
        e.bar.fillStyle(0x000000).fillRect(x - 7, y + 3, 14, 2);
        e.bar.fillStyle(0xe63946).fillRect(x - 7, y + 3, 14 * (p.hp / MAX_HP), 2);
      }
    }

    const mine = this.entities.get(this.me)?.state;
    if (mine) {
      (document.getElementById("hpfill") as HTMLElement).style.width = `${(mine.hp / MAX_HP) * 100}%`;
      document.getElementById("stats")!.textContent =
        `${mine.dead ? "Respawning… " : ""}Kills: ${mine.kills} · Online: ${this.entities.size}`;
    }
  }
}
