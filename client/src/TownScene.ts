import Phaser from "phaser";
import { Client, Room } from "colyseus.js";
import { InputState, MAP_H, MAP_W, TILE } from "../../shared/constants";
import { CLASSES, ClassKind, xpForLevel } from "../../shared/classes";
import { GROUND, OBJECTS, areaAt, isSafeZone } from "../../shared/map";
import { moveStep } from "../../shared/movement";
import { heroTexture, itemTexture, makeTileset, mobTexture } from "./textures";
import { Minimap } from "./minimap";
import { CHARACTERS, CHAR_ORIGIN, CharacterName, createArtAnims, playCharAnim, preloadArt } from "./artAssets";

interface Entity {
  sprite: Phaser.GameObjects.Sprite;
  label?: Phaser.GameObjects.Text;
  mob: boolean;
  hero?: CharacterName; // set when drawn with the animated 32x32 sheets
  top: number; // px from the feet to the top of the head, for the name label and chat bubble
  bar: Phaser.GameObjects.Graphics;
  bubble?: Phaser.GameObjects.Text;
  shield?: Phaser.GameObjects.Graphics;
  tx: number; ty: number; // server target position
  state: any;
}

const FRAME_BASE: Record<string, number> = { down: 0, up: 2, right: 4, left: 4 };
const HERO_SCALE = 0.75;
const HERO_TOP = 24 * HERO_SCALE; // drawn hero height above the feet in the 32x32 frames

export class TownScene extends Phaser.Scene {
  private room!: Room;
  private me = "";
  private entities = new Map<string, Entity>();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private input_: InputState = { up: false, down: false, left: false, right: false };
  private seq = 0;
  private chatEl = document.getElementById("chat") as HTMLInputElement;
  private minimap?: Minimap;
  private areaName = "";
  private areaTimer?: number;
  private shots = new Map<string, { g: Phaser.GameObjects.Arc; tx: number; ty: number }>();
  private items = new Map<string, Phaser.GameObjects.Image>();
  private lastSpecial = -Infinity; // local clock (ms) of my last special, for the cooldown bar

  constructor(private opts: { name: string; color: number; cls: ClassKind }) {
    super("town");
  }

  preload() {
    preloadArt(this);
  }

  async create() {
    makeTileset(this);
    createArtAnims(this);
    const map = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: MAP_W, height: MAP_H });
    const tiles = map.addTilesetImage("tiles", "tiles", TILE, TILE, 0, 0)!;
    map.createBlankLayer("ground", tiles)!.putTilesAt(GROUND, 0, 0).setDepth(-2);
    map.createBlankLayer("objects", tiles)!.putTilesAt(OBJECTS, 0, 0).setDepth(-1);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    cam.setZoom(3);
    cam.roundPixels = true;

    // Keys without capture so typing in chat still works
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,E,SHIFT,Q", false) as any;
    this.input.keyboard!.on("keydown-SPACE", () => { if (!this.chatting()) this.room?.send("attack"); });
    const special = () => { if (!this.chatting()) this.room?.send("special"); };
    this.input.keyboard!.on("keydown-E", special);
    this.input.keyboard!.on("keydown-SHIFT", special);
    this.input.keyboard!.on("keydown-Q", () => { if (!this.chatting()) this.room?.send("potion"); });
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
    this.minimap = new Minimap(document.getElementById("minimap") as HTMLCanvasElement);

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

    const mobs = (this.room.state as any).mobs;
    mobs.onAdd((m: any, id: string) => {
      this.addEntity(id, m, true);
      m.onChange(() => {
        const e = this.entities.get(id);
        if (!e) return;
        e.tx = m.x; e.ty = m.y;
        if (Math.hypot(e.sprite.x - m.x, e.sprite.y - m.y) > 48) e.sprite.setPosition(m.x, m.y);
      });
    });
    mobs.onRemove((_m: any, id: string) => this.removeEntity(id));

    const shots = (this.room.state as any).projectiles;
    shots.onAdd((s: any, id: string) => {
      const g = this.add.circle(s.x, s.y, 2.5 * (s.size || 1), 0xff9f1c).setStrokeStyle(1, 0xffe066).setDepth(9000);
      const shot = { g, tx: s.x, ty: s.y };
      this.shots.set(id, shot);
      s.onChange(() => { shot.tx = s.x; shot.ty = s.y; });
    });
    shots.onRemove((_s: any, id: string) => { this.shots.get(id)?.g.destroy(); this.shots.delete(id); });

    const items = (this.room.state as any).items;
    items.onAdd((it: any, id: string) => {
      const img = this.add.image(it.x, it.y, itemTexture(this, it.kind)).setDepth(it.y - 8);
      // Gentle bob so loot catches the eye
      this.tweens.add({ targets: img, y: it.y - 2, duration: 500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.items.set(id, img);
    });
    items.onRemove((_it: any, id: string) => { this.items.get(id)?.destroy(); this.items.delete(id); });
    this.room.onMessage("pickup", ({ kind, amount, x, y }) =>
      this.floatText(x, y - 6, kind === "gold" ? `+${amount} gold` : "+1 potion", kind === "gold" ? "#ffc93c" : "#ff8fa3"));
    this.room.onMessage("heal", ({ id, amount }) => {
      const e = this.entities.get(id);
      if (e) this.floatText(e.sprite.x, e.sprite.y - 14, `+${amount}`, "#7cfc00");
    });

    this.room.onMessage("swing", ({ id, step }) => this.showSwing(id, step ?? 0));
    this.room.onMessage("special", (msg) => this.showSpecial(msg));
    this.room.onMessage("boom", ({ x, y }) => this.burst(x, y, 6, 0xff9f1c, 200));
    this.room.onMessage("levelup", ({ id, level }) => {
      const e = this.entities.get(id);
      if (e) this.floatText(e.sprite.x, e.sprite.y - 20, `LEVEL ${level}!`, "#7cfc00");
      if (id === this.me) this.feed(`You reached level ${level}`);
    });
    this.room.onMessage("hit", ({ id, dmg, blocked }) => {
      const e = this.entities.get(id);
      if (!e) return;
      this.floatText(e.sprite.x, e.sprite.y - 14, `-${dmg}`, blocked ? "#9ad1ff" : id === this.me ? "#ff5d5d" : "#ffffff");
      e.sprite.setTintFill(0xffffff);
      this.time.delayedCall(80, () => e.sprite.clearTint());
      if (e.hero && !e.state.dead) playCharAnim(e.sprite, e.hero, "hit", e.state.dir);
      if (id === this.me) this.cameras.main.shake(100, 0.004);
    });
    this.room.onMessage("kill", ({ killer, victim }) => this.feed(`${killer} ⚔ ${victim}`));
    this.room.onMessage("xp", ({ amount, x, y }) => this.floatText(x, y - 10, `+${amount} XP`, "#ffd166"));
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

  private floatText(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, {
      fontFamily: "monospace", fontSize: "16px", color, stroke: "#000", strokeThickness: 3,
    }).setOrigin(0.5, 1).setScale(0.25).setResolution(2).setDepth(30000);
    this.tweens.add({ targets: t, y: y - 10, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  private addEntity(id: string, p: any, mob = false) {
    if (mob) {
      const sprite = this.add.sprite(p.x, p.y, mobTexture(this, p.kind), 0).setOrigin(0.5, 0.85);
      this.entities.set(id, { sprite, bar: this.add.graphics(), tx: p.x, ty: p.y, state: p, mob, top: 14 });
      return;
    }
    // Classes with a generated sheet use it; anything else falls back to the procedural persona
    const hero = (CHARACTERS as readonly string[]).includes(p.cls) ? (p.cls as CharacterName) : undefined;
    const sprite = hero
      ? this.add.sprite(p.x, p.y, hero, 0).setOrigin(CHAR_ORIGIN.x, CHAR_ORIGIN.y).setScale(HERO_SCALE)
      : this.add.sprite(p.x, p.y, heroTexture(this, p.cls, p.color), 0).setOrigin(0.5, 0.85);
    const label = this.add.text(p.x, p.y, p.name, {
      fontFamily: "monospace", fontSize: "16px", color: id === this.me ? "#ffd166" : "#ffffff",
      stroke: "#000", strokeThickness: 3,
    }).setOrigin(0.5, 1).setScale(0.25).setResolution(2);
    const bar = this.add.graphics();
    this.entities.set(id, { sprite, label, bar, tx: p.x, ty: p.y, state: p, mob, hero, top: hero ? HERO_TOP : 14 });
    if (id === this.me) this.cameras.main.startFollow(sprite, true, 0.15, 0.15);
  }

  private removeEntity(id: string) {
    const e = this.entities.get(id);
    if (!e) return;
    e.sprite.destroy(); e.label?.destroy(); e.bar.destroy(); e.bubble?.destroy(); e.shield?.destroy();
    this.entities.delete(id);
  }

  private showSwing(id: string, step: number) {
    const e = this.entities.get(id);
    if (!e) return;
    const dir = e.state.dir as string;
    if (e.hero) playCharAnim(e.sprite, e.hero, "attack", dir as any);
    const off = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir] ?? [0, 1];
    const cls = e.mob ? undefined : CLASSES[e.state.cls as ClassKind];
    const hit = cls?.combo[step];
    // Mirror our own lunge locally so client prediction doesn't fight the server
    if (id === this.me && hit?.lunge) {
      const push = { up: off[1] < 0, down: off[1] > 0, left: off[0] < 0, right: off[0] > 0 };
      for (let moved = 0; moved < hit.lunge; moved += 2) {
        const r = moveStep(e.sprite.x, e.sprite.y, push, 1, 2);
        if (r.x === e.sprite.x && r.y === e.sprite.y) break;
        e.sprite.setPosition(r.x, r.y);
      }
    }
    if (cls?.projectile) return; // the fireball itself is the visual
    const finisher = step === 2;
    const radius = finisher ? 12 : 8;
    const g = this.add.graphics({ x: e.sprite.x + off[0] * 10, y: e.sprite.y - 5 + off[1] * 10 });
    g.lineStyle(finisher ? 3 : 2, finisher ? 0xffd166 : 0xffffff, 1);
    const a = Math.atan2(off[1], off[0]);
    // Hit 1 sweeps one way, hit 2 the other, the finisher is a wide arc
    const [from, to] = step === 1 ? [a + 1, a - 1] : finisher ? [a - 1.6, a + 1.6] : [a - 1, a + 1];
    g.beginPath(); g.arc(0, 0, radius, Math.min(from, to), Math.max(from, to)); g.strokePath();
    g.setDepth(10000);
    this.tweens.add({ targets: g, alpha: 0, scale: finisher ? 1.7 : 1.4, duration: finisher ? 260 : 180, onComplete: () => g.destroy() });
    if (finisher && id === this.me) this.cameras.main.shake(80, 0.003);
  }

  private burst(x: number, y: number, r: number, color: number, ms: number) {
    const g = this.add.circle(x, y, r, color, 0.5).setStrokeStyle(1, color).setDepth(10000);
    this.tweens.add({ targets: g, scale: 1.8, alpha: 0, duration: ms, onComplete: () => g.destroy() });
  }

  private showSpecial(msg: { id: string; kind: string; x?: number; y?: number; fromX?: number; fromY?: number; r?: number }) {
    const e = this.entities.get(msg.id);
    if (msg.id === this.me) this.lastSpecial = this.time.now;
    if (e?.hero) playCharAnim(e.sprite, e.hero, "skill", e.state.dir);
    if (msg.kind === "nova") {
      const g = this.add.circle(msg.x!, msg.y! - 4, msg.r!, 0x9b5de5, 0.25).setStrokeStyle(2, 0xc77dff).setDepth(10000).setScale(0.2);
      this.tweens.add({ targets: g, scale: 1, alpha: 0, duration: 350, onComplete: () => g.destroy() });
    } else if (msg.kind === "dash") {
      // Afterimages along the dash path
      for (let i = 0; i < 4; i++) {
        const t = i / 4;
        const ghost = this.add.circle(msg.fromX! + (msg.x! - msg.fromX!) * t, msg.fromY! - 6 + (msg.y! - msg.fromY!) * t, 4, 0xffffff, 0.4).setDepth(9000);
        this.tweens.add({ targets: ghost, alpha: 0, duration: 250 + i * 40, onComplete: () => ghost.destroy() });
      }
      if (e) { e.sprite.setPosition(msg.x!, msg.y!); e.tx = msg.x!; e.ty = msg.y!; }
    } else if (msg.kind === "guard" && e) {
      this.burst(e.sprite.x, e.sprite.y - 6, 8, 0x9ad1ff, 250);
    }
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

  /** Shows the area banner briefly whenever the player enters a new named area. */
  private showArea(name: string) {
    if (name === this.areaName) return;
    this.areaName = name;
    document.getElementById("location")!.textContent = name;
    const el = document.getElementById("area")!;
    el.textContent = name;
    el.classList.add("show");
    clearTimeout(this.areaTimer);
    this.areaTimer = window.setTimeout(() => el.classList.remove("show"), 2500);
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
        const r = moveStep(e.sprite.x, e.sprite.y, this.input_, dtMs / 1000, CLASSES[p.cls as ClassKind].speed);
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
      if (e.hero) {
        // Let one-shot attack/hit/skill animations finish before going back to walk/idle
        const key = e.sprite.anims.currentAnim?.key ?? "";
        const oneShot = e.sprite.anims.isPlaying && /_(attack|hit|skill)_/.test(key);
        if (p.dead) {
          if (!key.includes("_ko_")) playCharAnim(e.sprite, e.hero, "ko", p.dir);
        } else if (!oneShot) {
          playCharAnim(e.sprite, e.hero, moving ? "walk" : "idle", p.dir);
        }
        e.sprite.setAlpha(p.dead ? 0.6 : 1);
      } else {
        const step = moving ? Math.floor(now / 150) % 2 : 0;
        e.sprite.setFrame(FRAME_BASE[p.dir] + step);
        e.sprite.setFlipX(p.dir === "left");
        if (e.mob) e.sprite.setVisible(!p.dead);
        else e.sprite.setAlpha(p.dead ? 0.35 : 1).setAngle(p.dead ? 90 : 0);
      }
      e.sprite.setDepth(e.sprite.y);

      const x = Math.round(e.sprite.x), y = Math.round(e.sprite.y);
      e.label?.setPosition(x, y - e.top - 2).setDepth(e.sprite.y + 1);
      e.bubble?.setPosition(x, y - e.top - 7);
      e.bar.clear().setDepth(e.sprite.y + 1);
      const maxHp = p.maxHp;
      if (!e.mob) {
        if (p.guarding && !p.dead) {
          e.shield ??= this.add.graphics();
          e.shield.clear().lineStyle(1, 0x9ad1ff, 0.9).strokeCircle(x, y - e.top / 2, e.top / 2 + 3).setDepth(e.sprite.y + 2);
        } else if (e.shield) { e.shield.destroy(); e.shield = undefined; }
      }
      if (!p.dead && p.hp < maxHp) {
        e.bar.fillStyle(0x000000).fillRect(x - 7, y + 3, 14, 2);
        e.bar.fillStyle(e.mob ? 0xf4a261 : 0xe63946).fillRect(x - 7, y + 3, 14 * (p.hp / maxHp), 2);
      }
    }

    for (const shot of this.shots.values()) {
      shot.g.x += (shot.tx - shot.g.x) * 0.5;
      shot.g.y += (shot.ty - shot.g.y) * 0.5;
    }

    const meEnt = this.entities.get(this.me);
    const others = [...this.entities].filter(([id, e]) => id !== this.me && !e.mob).map(([, e]) => e.sprite);
    this.minimap?.draw(now, meEnt?.sprite, others);
    if (meEnt) this.showArea(areaAt(meEnt.sprite.x, meEnt.sprite.y));

    const mine = meEnt?.state;
    if (mine) {
      const online = [...this.entities.values()].filter((x) => !x.mob).length;
      const safe = isSafeZone(meEnt.sprite.x, meEnt.sprite.y) ? "🛡 Safe zone · " : "";
      (document.getElementById("hpfill") as HTMLElement).style.width = `${(mine.hp / mine.maxHp) * 100}%`;
      const next = xpForLevel(mine.level + 1), cur = xpForLevel(mine.level);
      document.getElementById("stats")!.textContent =
        `${mine.dead ? "Respawning… " : safe}Lv ${mine.level} ${CLASSES[mine.cls as ClassKind].name} · ` +
        `XP ${mine.xp - cur}/${next - cur} · Gold: ${mine.gold} · Potions [Q]: ${mine.potions} · Kills: ${mine.kills} · Online: ${online}`;
      const sp = CLASSES[mine.cls as ClassKind].special;
      const left = Math.max(0, sp.cooldownMs - (now - this.lastSpecial));
      (document.getElementById("skillfill") as HTMLElement).style.width = `${(1 - left / sp.cooldownMs) * 100}%`;
      document.getElementById("skilltext")!.textContent = left > 0 ? `${sp.name} ${(left / 1000).toFixed(1)}s` : `${sp.name} ready [E]`;
    }
  }
}
