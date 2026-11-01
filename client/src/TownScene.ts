import Phaser from "phaser";
import { Client, Room } from "colyseus.js";
import { InputState, MAP_H, MAP_W, TILE } from "../../shared/constants";
import { CLASSES, ClassKind, xpForLevel } from "../../shared/classes";
import { GROUND, areaAt, isSafeZone } from "../../shared/map";
import { moveStep } from "../../shared/movement";
import { SPAWN_ZONES } from "../../shared/spawns";
import {
  attackMult, cooldownMult, heroSpeed, STATS, magicMult, POWERS, STAT_NAMES, StatKind, statsFor, ULT_LEVEL, ULTS,
} from "../../shared/powers";
import { heroTexture, itemTexture, makeTileset, mobTexture } from "./textures";
import { Minimap } from "./minimap";
import { CHARACTERS, CHAR_ORIGIN, CharacterName, createArtAnims, playCharAnim, preloadArt } from "./artAssets";
import { Ambient } from "./ambient";
import { Details } from "./details";
import { GearLayer, GearMenu, preloadGear, TIER_COLORS } from "./gear";
import { GEAR, gearSpeedMult } from "../../shared/gear";
import { talentMult, talentPoints, spentPoints, talentReduce } from "../../shared/talents";
import { TalentMenu } from "./talents";

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
  statusTint?: boolean;
  gear?: GearLayer; // equipment overlays (heroes only)
  idleSince?: number; // local time the hero stopped moving, for idle fidgets
  nextFidget?: number;
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
  private ambient?: Ambient;
  private details?: Details;
  private areaName = "";
  private areaTimer?: number;
  private shots = new Map<string, { g: Phaser.GameObjects.Shape; tx: number; ty: number }>();
  private items = new Map<string, Phaser.GameObjects.Image>();
  private lastSpecial = -Infinity; // local clock (ms) of my last special, for the cooldown bar
  private lastUlt = -Infinity;
  private heroTimer?: number;
  private clearedTimer?: number;
  private gearMenu?: GearMenu;
  private talentMenu?: TalentMenu;

  constructor(private opts: { name: string; color: number; cls: ClassKind }) {
    super("town");
  }

  preload() {
    preloadArt(this);
    preloadGear(this);
  }

  async create() {
    makeTileset(this);
    createArtAnims(this);
    const map = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: MAP_W, height: MAP_H });
    const tiles = map.addTilesetImage("tiles", "tiles", TILE, TILE, 0, 0)!;
    map.createBlankLayer("ground", tiles)!.putTilesAt(GROUND, 0, 0).setDepth(-2);
    map.createBlankLayer("objects", tiles)!.putTilesAt(Ambient.objectLayerData(), 0, 0).setDepth(-1);
    this.ambient = new Ambient(this); // trees, shadows, smoke, wildlife… (cosmetic only)
    this.details = new Details(this); // roof shading, ground detail, ducks, lanterns, day/night
    this.details.onDarkness((d) => this.ambient?.setDarkness(d));

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    cam.setZoom(3);
    cam.roundPixels = true;

    // Keys without capture so typing in chat still works
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,E,SHIFT,Q,R,C,G,T", false) as any;
    this.input.keyboard!.on("keydown-SPACE", () => { if (!this.chatting()) this.room?.send("attack"); });
    const special = () => { if (!this.chatting()) this.room?.send("special"); };
    this.input.keyboard!.on("keydown-E", special);
    this.input.keyboard!.on("keydown-SHIFT", special);
    this.input.keyboard!.on("keydown-Q", () => { if (!this.chatting()) this.room?.send("potion"); });
    this.input.keyboard!.on("keydown-R", () => { if (!this.chatting()) this.room?.send("ult"); });
    this.input.keyboard!.on("keydown-C", () => { if (!this.chatting()) this.toggleHeroMenu(); });
    this.gearMenu = new GearMenu(this, (type, msg) => this.room?.send(type, msg));
    this.input.keyboard!.on("keydown-G", () => { if (!this.chatting()) this.gearMenu?.toggle(this.entities.get(this.me)?.state); });
    this.talentMenu = new TalentMenu((type, msg) => this.room?.send(type, msg));
    this.input.keyboard!.on("keydown-T", () => { if (!this.chatting()) this.talentMenu?.toggle(this.entities.get(this.me)?.state); });
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
      const size = s.size || 1;
      const g: Phaser.GameObjects.Shape = s.kind === "arrow"
        // Arrow: thin shaft along the flight direction
        ? this.add.rectangle(s.x, s.y, 9 * size, 1.5 * size, 0xe8d8b0).setStrokeStyle(0.5, 0x5d4037)
            .setAngle(s.dir === "up" || s.dir === "down" ? 90 : 0).setDepth(9000)
        : this.add.circle(s.x, s.y, 2.5 * size, 0xff9f1c).setStrokeStyle(1, 0xffe066).setDepth(9000);
      const shot = { g, tx: s.x, ty: s.y };
      this.shots.set(id, shot);
      s.onChange(() => { shot.tx = s.x; shot.ty = s.y; });
    });
    shots.onRemove((_s: any, id: string) => { this.shots.get(id)?.g.destroy(); this.shots.delete(id); });

    const items = (this.room.state as any).items;
    items.onAdd((it: any, id: string) => {
      const gear = it.kind === "gear" && GEAR[it.gear];
      const img = gear
        ? this.add.image(it.x, it.y, "gear_icons", it.gear).setScale(0.6).setDepth(it.y - 8)
        : this.add.image(it.x, it.y, itemTexture(this, it.kind)).setDepth(it.y - 8);
      if (gear && gear.tier > 1) {
        // Rare / epic drops sparkle
        this.tweens.add({ targets: img, alpha: 0.65, duration: 400, yoyo: true, repeat: -1 });
      }
      // Gentle bob so loot catches the eye
      this.tweens.add({ targets: img, y: it.y - 2, duration: 500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.items.set(id, img);
    });
    items.onRemove((_it: any, id: string) => { this.items.get(id)?.destroy(); this.items.delete(id); });
    this.room.onMessage("pickup", ({ kind, amount, x, y, gear, name }) => {
      if (kind === "gear") {
        this.floatText(x, y - 6, `+${name}`, TIER_COLORS[GEAR[gear]?.tier ?? 1]);
        this.feed(`Found ${name}! Press G to equip`);
        return;
      }
      this.floatText(x, y - 6, kind === "gold" ? `+${amount} gold` : "+1 potion", kind === "gold" ? "#ffc93c" : "#ff8fa3");
    });
    this.room.onMessage("heal", ({ id, amount }) => {
      const e = this.entities.get(id);
      if (e) this.floatText(e.sprite.x, e.sprite.y - 14, `+${amount}`, "#7cfc00");
    });

    this.room.onMessage("swing", ({ id, step, variant }) => this.showSwing(id, step ?? 0, variant ?? 0));
    this.room.onMessage("special", (msg) => this.showSpecial(msg));
    this.room.onMessage("boom", ({ x, y, r, kind }) =>
      kind === "arrow" ? this.burst(x, y, 3, 0xd7ccc8, 150) : this.burst(x, y, r ? r / 1.8 : 6, 0xff9f1c, r ? 300 : 200));
    this.room.onMessage("ult", (msg) => this.showUlt(msg));
    this.room.onMessage("zonecleared", ({ zone, by, name, respawnSec }) => {
      if (by === this.me) this.showCleared(zone, respawnSec);
      this.feed(`${name} cleared ${zone}!`);
    });
    this.room.onMessage("power", ({ id, name }) => {
      const e = this.entities.get(id);
      if (e) this.floatText(e.sprite.x, e.sprite.y - 24, name, "#7cfc00");
    });
    this.room.onMessage("levelup", ({ id, level, from }) => {
      const e = this.entities.get(id);
      if (e) this.floatText(e.sprite.x, e.sprite.y - 20, `LEVEL ${level}!`, "#7cfc00");
      if (id === this.me) {
        this.feed(`You reached level ${level}`);
        this.showHeroMenu(from ?? level - 1);
      }
    });
    this.room.onMessage("hit", ({ id, dmg, blocked, crit }) => {
      const e = this.entities.get(id);
      if (!e) return;
      this.floatText(e.sprite.x, e.sprite.y - 14, crit ? `CRIT -${dmg}` : `-${dmg}`,
        blocked ? "#9ad1ff" : crit ? "#ffd60a" : id === this.me ? "#ff5d5d" : "#ffffff");
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
    const gear = hero ? new GearLayer(this, hero) : undefined;
    this.entities.set(id, { sprite, label, bar, tx: p.x, ty: p.y, state: p, mob, hero, gear, top: hero ? HERO_TOP : 14 });
    if (id === this.me) this.cameras.main.startFollow(sprite, true, 0.15, 0.15);
  }

  private removeEntity(id: string) {
    const e = this.entities.get(id);
    if (!e) return;
    e.sprite.destroy(); e.label?.destroy(); e.bar.destroy(); e.bubble?.destroy(); e.shield?.destroy(); e.gear?.destroy();
    this.entities.delete(id);
  }

  /** Animation for an attack: finisher = attack3, normal hits = swing1..4 (falls back to attack/attack2). */
  private attackAnim(hero: CharacterName, step: number, variant: number): string {
    if (step === 2) return "attack3";
    const swing = `swing${variant + 1}`;
    if (this.anims.exists(`${hero}_${swing}_down`)) return swing;
    return variant % 2 ? "attack2" : "attack";
  }

  private showSwing(id: string, step: number, variant: number) {
    const e = this.entities.get(id);
    if (!e) return;
    const dir = e.state.dir as string;
    if (e.hero) playCharAnim(e.sprite, e.hero, this.attackAnim(e.hero, step, variant), dir as any);
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

  // ---- Hero menu (stats + powers) -----------------------------------------

  private toggleHeroMenu() {
    const el = document.getElementById("hero")!;
    if (el.hidden) this.showHeroMenu(); else el.hidden = true;
  }

  /** Opens the hero menu. After a level-up (`from` = previous level) it highlights the gains and auto-closes. */
  private showHeroMenu(from?: number) {
    const mine = this.entities.get(this.me)?.state;
    if (!mine) return;
    const cls = mine.cls as ClassKind, lvl = mine.level as number;
    const st = { sta: mine.sta, str: mine.str, mag: mine.mag }; // includes gear bonuses
    const base = statsFor(cls, lvl);
    const prev = from !== undefined ? statsFor(cls, from) : undefined;
    const el = document.getElementById("hero")!;
    document.getElementById("herobanner")!.textContent = from !== undefined ? `⬆ Level ${lvl}! Points added automatically.` : "";
    document.getElementById("herotitle")!.textContent = `${mine.name} · Lv ${lvl} ${CLASSES[cls].name}`;
    const notes: Record<StatKind, string> = {
      sta: `${mine.maxHp} max HP`,
      str: STATS[cls].attackStat === "str" ? `attack ×${attackMult(cls, st).toFixed(2)}, +2 HP each` : "+2 HP per point",
      mag: `${STATS[cls].attackStat === "mag" ? `attack ×${attackMult(cls, st).toFixed(2)}, ` : ""}skills ×${magicMult(cls, st).toFixed(2)}, ` +
        `cooldowns −${Math.round((1 - cooldownMult(cls, st, lvl)) * 100)}%`,
    };
    document.getElementById("herostats")!.innerHTML = (["sta", "str", "mag"] as StatKind[]).map((k) => {
      const gain = prev ? base[k] - prev[k] : 0;
      return `<span>${STAT_NAMES[k]}</span><b>${st[k]}${gain ? ` <span class="gain">+${gain}</span>` : ""}</b><span class="note">${notes[k]}</span>`;
    }).join("");
    document.getElementById("heropowers")!.innerHTML = POWERS[cls].map((pw) => {
      const state = lvl < pw.level ? "locked" : from !== undefined && pw.level > from ? "new" : "";
      const tag = state === "locked" ? `🔒 Lv ${pw.level}` : state === "new" ? "NEW!" : `Lv ${pw.level}`;
      const key = pw.key ? ` [${pw.key}]` : "";
      return `<li class="${state}"><b>${pw.name}${key}</b> · ${tag}<br>${pw.desc}</li>`;
    }).join("");
    el.hidden = false;
    clearTimeout(this.heroTimer);
    if (from !== undefined) this.heroTimer = window.setTimeout(() => { el.hidden = true; }, 7000);
  }

  private showUlt(msg: { id: string; kind: string; x: number; y: number; r: number; delay?: number; hits?: number }) {
    const e = this.entities.get(msg.id);
    if (msg.id === this.me) this.lastUlt = this.time.now;
    if (e?.hero) playCharAnim(e.sprite, e.hero, "skill", e.state.dir);
    if (msg.kind === "earthquake") {
      const g = this.add.circle(msg.x, msg.y, msg.r, 0x8d6e63, 0.35).setStrokeStyle(3, 0xd7ccc8).setDepth(10000).setScale(0.2);
      this.tweens.add({ targets: g, scale: 1, alpha: 0, duration: 450, onComplete: () => g.destroy() });
      this.cameras.main.shake(250, 0.008);
    } else if (msg.kind === "bladestorm") {
      for (let i = 0; i < (msg.hits ?? 3); i++) {
        this.time.delayedCall(i * 200, () => {
          const x = e?.sprite.x ?? msg.x, y = (e?.sprite.y ?? msg.y) - 5;
          const g = this.add.graphics({ x, y }).setDepth(10000);
          g.lineStyle(2, 0xe0e0ff, 1);
          for (let k = 0; k < 3; k++) { const a = k * 2.09 + i; g.beginPath(); g.arc(0, 0, msg.r * 0.7, a, a + 1.2); g.strokePath(); }
          this.tweens.add({ targets: g, angle: 180, alpha: 0, duration: 200, onComplete: () => g.destroy() });
        });
      }
    } else if (msg.kind === "arrowrain") {
      const warn = this.add.circle(msg.x, msg.y, msg.r, 0xd7ccc8, 0.12).setStrokeStyle(1, 0xbcaaa4).setDepth(9000);
      const hits = msg.hits ?? 4, delay = msg.delay ?? 400;
      for (let i = 0; i < hits; i++) {
        this.time.delayedCall(delay + i * 250, () => {
          // A handful of falling arrow streaks per wave
          for (let k = 0; k < 6; k++) {
            const a = Math.random() * Math.PI * 2, d = Math.random() * msg.r;
            const ax = msg.x + Math.cos(a) * d, ay = msg.y + Math.sin(a) * d;
            const streak = this.add.rectangle(ax, ay - 14, 1, 7, 0xe8d8b0).setDepth(10000);
            this.tweens.add({ targets: streak, y: ay, alpha: 0, duration: 160, onComplete: () => streak.destroy() });
          }
          if (i === hits - 1) warn.destroy();
        });
      }
    } else if (msg.kind === "leap") {
      const m = msg as any;
      if (e) { e.sprite.setPosition(m.x, m.y); e.tx = m.x; e.ty = m.y; }
      for (let i = 0; i < 4; i++) {
        const t = i / 4;
        const ghost = this.add.circle(m.fromX + (m.x - m.fromX) * t, m.fromY - 10 - Math.sin(t * Math.PI) * 10 + (m.y - m.fromY) * t, 4, 0xffffff, 0.35).setDepth(9000);
        this.tweens.add({ targets: ghost, alpha: 0, duration: 250 + i * 40, onComplete: () => ghost.destroy() });
      }
      this.burst(m.x, m.y, msg.r / 1.6, 0xa1887f, 350);
      this.cameras.main.shake(180, 0.006);
    } else if (msg.kind === "meteor") {
      // Warning circle, then the impact
      const warn = this.add.circle(msg.x, msg.y, msg.r, 0xff3d00, 0.15).setStrokeStyle(1, 0xff6d00).setDepth(9000);
      this.time.delayedCall(msg.delay ?? 600, () => {
        warn.destroy();
        this.burst(msg.x, msg.y, msg.r / 1.5, 0xff6d00, 450);
        this.cameras.main.shake(200, 0.006);
      });
    }
  }

  private showSpecial(msg: { id: string; kind: string; x?: number; y?: number; fromX?: number; fromY?: number; r?: number; frost?: boolean }) {
    const e = this.entities.get(msg.id);
    if (msg.id === this.me) this.lastSpecial = this.time.now;
    if (e?.hero) playCharAnim(e.sprite, e.hero, "skill", e.state.dir);
    if (msg.kind === "nova") {
      const [fill, line] = msg.frost ? [0x4cc9f0, 0xa2e8ff] : [0x9b5de5, 0xc77dff];
      const g = this.add.circle(msg.x!, msg.y! - 4, msg.r!, fill, 0.25).setStrokeStyle(2, line).setDepth(10000).setScale(0.2);
      this.tweens.add({ targets: g, scale: 1, alpha: 0, duration: 350, onComplete: () => g.destroy() });
    } else if (msg.kind === "dash") {
      // Afterimages along the dash path
      for (let i = 0; i < 4; i++) {
        const t = i / 4;
        const ghost = this.add.circle(msg.fromX! + (msg.x! - msg.fromX!) * t, msg.fromY! - 6 + (msg.y! - msg.fromY!) * t, 4, 0xffffff, 0.4).setDepth(9000);
        this.tweens.add({ targets: ghost, alpha: 0, duration: 250 + i * 40, onComplete: () => ghost.destroy() });
      }
      if (e) { e.sprite.setPosition(msg.x!, msg.y!); e.tx = msg.x!; e.ty = msg.y!; }
    } else if (msg.kind === "rage" && e) {
      this.burst(e.sprite.x, e.sprite.y - 6, 9, 0xe63946, 300);
      if (msg.id === this.me) this.cameras.main.shake(120, 0.004);
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
  /** Big on-screen "zone cleared" banner for the player who killed the zone's last monster. */
  private showCleared(zone: string, respawnSec: number) {
    const el = document.getElementById("cleared")!;
    el.querySelector(".big")!.textContent = `${zone} cleared!`;
    el.querySelector(".small")!.textContent = `Monsters return one by one every ${respawnSec}s`;
    el.classList.remove("show");
    void (el as HTMLElement).offsetWidth; // restart the pop animation
    el.classList.add("show");
    this.cameras.main.flash(250, 124, 252, 0);
    clearTimeout(this.clearedTimer);
    this.clearedTimer = window.setTimeout(() => el.classList.remove("show"), 3500);
  }

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
    this.ambient?.update(this.time.now, dtMs);
    this.details?.update(this.time.now, dtMs);
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
      if (id === this.me && !p.dead && !p.stunned) {
        // Client-side prediction with the same movement code the server runs
        const r = moveStep(e.sprite.x, e.sprite.y, this.input_, dtMs / 1000, heroSpeed(p.cls as ClassKind, p.level, p.slowed, p.raging) * gearSpeedMult(p) * talentMult(p.cls as ClassKind, p.talents, "speed"));
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
        const oneShot = e.sprite.anims.isPlaying && /_(attack\d?|swing\d|hit|skill|idle[23])_/.test(key);
        if (moving || p.dead) e.idleSince = undefined;
        else e.idleSince ??= now;
        if (p.dead) {
          if (!key.includes("_ko_")) playCharAnim(e.sprite, e.hero, "ko", p.dir);
        } else if (!oneShot) {
          if (!moving && p.emote && this.anims.exists(`${e.hero}_${p.emote}_down`)) {
            playCharAnim(e.sprite, e.hero, p.emote, p.dir);
          } else if (!moving && e.idleSince !== undefined && now - e.idleSince > 4000 && now > (e.nextFidget ?? 0)) {
            // Standing still for a while: an occasional fidget (look around / weapon flourish)
            e.nextFidget = now + 3000 + Math.random() * 4000;
            playCharAnim(e.sprite, e.hero, Math.random() < 0.5 ? "idle2" : "idle3", p.dir);
          } else {
            playCharAnim(e.sprite, e.hero, moving ? "walk" : "idle", p.dir);
          }
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
      // Status effects: yellow flicker for stunned, blue for slowed, red pulse for raging
      if (!p.dead && (p.stunned || p.slowed || p.raging)) {
        e.sprite.setTint(p.stunned ? (Math.floor(now / 120) % 2 ? 0xfff176 : 0xffffff)
          : p.slowed ? 0x90caf9 : (Math.floor(now / 200) % 2 ? 0xff8a80 : 0xffcdd2));
        e.statusTint = true;
      } else if (e.statusTint) { e.sprite.clearTint(); e.statusTint = false; }
      e.gear?.sync(e.sprite, p);

      const x = Math.round(e.sprite.x), y = Math.round(e.sprite.y);
      e.label?.setPosition(x, y - e.top - (p.hat ? 4 : 2)).setDepth(e.sprite.y + 1);
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
      this.gearMenu?.refresh(mine);
      this.talentMenu?.refresh(mine);
      const online = [...this.entities.values()].filter((x) => !x.mob).length;
      const safe = isSafeZone(meEnt.sprite.x, meEnt.sprite.y) ? "🛡 Safe zone · " : "";
      (document.getElementById("hpfill") as HTMLElement).style.width = `${(mine.hp / mine.maxHp) * 100}%`;
      const next = xpForLevel(mine.level + 1), cur = xpForLevel(mine.level);
      const cls0 = mine.cls as ClassKind;
      document.getElementById("stats")!.textContent =
        `${mine.dead ? "Respawning… " : safe}Lv ${mine.level} ${CLASSES[mine.cls as ClassKind].name} · ` +
        `XP ${mine.xp - cur}/${next - cur} · Gold ${mine.gold} · Potions ${mine.potions} · Kills ${mine.kills} · Online ${online}` +
        (talentPoints(mine.level) > spentPoints(cls0, mine.talents) ? ` · ⭐ ${talentPoints(mine.level) - spentPoints(cls0, mine.talents)} skill point(s): press T` : "");
      // Monster zone status: how many are alive and when the next one respawns
      const tx = meEnt.sprite.x / TILE, ty = meEnt.sprite.y / TILE;
      const zdef = SPAWN_ZONES.find((z) => tx >= z.x && ty >= z.y && tx < z.x + z.w && ty < z.y + z.h);
      const zone = zdef && (this.room.state as any).zones?.get(zdef.name);
      document.getElementById("zone")!.textContent = zone
        ? `⚔ ${zone.name}: ${zone.alive}/${zone.cap} monsters${zone.nextIn ? ` · next in ${zone.nextIn}s` : ""}`
        : "";
      const cls = mine.cls as ClassKind;
      const cdm = cooldownMult(cls, { sta: mine.sta, str: mine.str, mag: mine.mag }, mine.level) * talentReduce(cls, mine.talents, "cdr");
      const sp = CLASSES[cls].special;
      const spCd = sp.cooldownMs * cdm;
      const left = Math.max(0, spCd - (now - this.lastSpecial));
      (document.getElementById("skillfill") as HTMLElement).style.width = `${(1 - left / spCd) * 100}%`;
      document.getElementById("skilltext")!.textContent = left > 0 ? `${sp.name} ${(left / 1000).toFixed(1)}s` : `${sp.name} ready [E]`;
      const ultEl = document.getElementById("ult")!;
      ultEl.hidden = mine.level < ULT_LEVEL;
      if (!ultEl.hidden) {
        const u = ULTS[cls], uCd = u.cooldownMs * cdm;
        const uLeft = Math.max(0, uCd - (now - this.lastUlt));
        (document.getElementById("ultfill") as HTMLElement).style.width = `${(1 - uLeft / uCd) * 100}%`;
        document.getElementById("ulttext")!.textContent = uLeft > 0 ? `${u.name} ${(uLeft / 1000).toFixed(1)}s` : `${u.name} ready [R]`;
      }
    }
  }
}
