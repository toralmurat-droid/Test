import Phaser from "phaser";
import { Client, Room } from "colyseus.js";
import { InputState, MAP_H, MAP_W, regenFromStamina, TILE } from "../../shared/constants";
import { CLASSES, ClassKind, DODGE, ENERGY, energyName, xpForLevel } from "../../shared/classes";
import { GROUND, areaAt, isSafeZone } from "../../shared/map";
import { heroPoise, RAGE_ATTACK_SPEED } from "../../shared/combat";
import { moveStep } from "../../shared/movement";
import { SPAWN_ZONES } from "../../shared/spawns";
import {
  attackMult, cooldownMult, heroSpeed, STATS, magicMult, POWERS, STAT_NAMES, StatKind, statPoints, HP_PER_STR, ULTS, hasSpecial, hasUlt, ultPower,
} from "../../shared/powers";
import { displayGrid } from "./tileset";
import { heroTexture, itemTexture, makeTileset, MOB_LOOK, mobTexture } from "./textures";
import { Minimap } from "./minimap";
import { DayDial } from "./daydial";
import { SignPanel } from "./signpanel";
import { NpcLayer } from "./npcs";
import { pixelText } from "./pixeltext";
import { ART_K, CHARACTERS, CHAR_ORIGIN, CharacterName, createArtAnims, playCharAnim, preloadArt } from "./artAssets";
import { Ambient } from "./ambient";
import { Details } from "./details";
import { GearLayer, GearMenu, preloadGear, TIER_COLORS } from "./gear";
import { GEAR, gearSpeedMult } from "../../shared/gear";
import { COMBO_NODE, talentMult, talentPoints, spentPoints, talentReduce } from "../../shared/talents";
import { activeSkills, SLOT_COUNT, SLOT_KEYS, skillLearned } from "../../shared/slots";
import { TalentMenu } from "./talents";

interface Entity {
  sprite: Phaser.GameObjects.Sprite;
  label?: Phaser.GameObjects.Text;
  lvlColor?: string; // monsters: current colour of the "Lv N" label
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
/** On-screen hero size: 0.75 of a 32px design frame (frames are ART_K times finer). */
const HERO_SCALE = 0.75 / ART_K;
const HERO_TOP = 24 * 0.75; // drawn hero height above the feet (24 of the 32 design px)

/** Random line under the "zone cleared" banner. */
const CONGRATS = [
  "Well fought, hero!",
  "The land is safe, for now.",
  "Victory is yours!",
  "Nothing left standing. Impressive!",
  "The villagers will sing of this.",
  "Great job, champion!",
  "Not a single monster left!",
  "You make it look easy.",
];

export class TownScene extends Phaser.Scene {
  private room!: Room;
  private me = "";
  private entities = new Map<string, Entity>();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private input_: InputState = { up: false, down: false, left: false, right: false };
  private seq = 0;
  private npcs?: NpcLayer;
  private chatEl = document.getElementById("chat") as HTMLInputElement;
  private minimap?: Minimap;
  private dial?: DayDial;
  private signPanel = new SignPanel();
  private ambient?: Ambient;
  private details?: Details;
  private areaName = "";
  private areaTimer?: number;
  private shots = new Map<string, { g: Phaser.GameObjects.Shape; tx: number; ty: number }>();
  private items = new Map<string, Phaser.GameObjects.Image>();
  private lastSpecial = -Infinity; // local clock (ms) of my last special, for the cooldown bar
  private lastDodge = -Infinity;
  private lastRanged = -Infinity;
  private actionsHtml = ""; // local clock (ms) of my last dodge roll
  private lastUlt = -Infinity;
  private heroFrom?: number;
  private heroSig = "";
  private levelFrom?: number; // level before the level-ups the player hasn't looked at yet
  private clearedTimer?: number;
  private gearMenu?: GearMenu;
  private talentMenu?: TalentMenu;
  private hotbarHtml = "";

  constructor(private opts: { name: string; password: string; color: number; cls: ClassKind }) {
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
    map.createBlankLayer("ground", tiles)!.putTilesAt(displayGrid(GROUND), 0, 0).setDepth(-2);
    map.createBlankLayer("objects", tiles)!.putTilesAt(displayGrid(Ambient.objectLayerData()), 0, 0).setDepth(-1);
    this.ambient = new Ambient(this); // trees, shadows, smoke, wildlife… (cosmetic only)
    this.details = new Details(this); // roof shading, ground detail, ducks, lanterns, day/night
    this.details.onDarkness((d) => this.ambient?.setDarkness(d));

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    cam.setZoom(3);
    cam.roundPixels = true;

    // Keys without capture so typing in chat still works
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,Q,C,G,T,F,R,E,J", false) as any;
    this.input.keyboard!.on("keydown-SPACE", () => { if (!this.chatting()) this.room?.send("attack"); });
    // Skill slots 1..0 (top row or numpad). With the skill tree open and the mouse over a learned skill,
    // the number key puts that skill in the slot instead of using it.
    const names = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "ZERO"];
    names.forEach((k, n) => {
      const press = () => {
        if (this.chatting()) return;
        const hover = this.talentMenu?.open ? this.talentMenu.hoveredActive() : undefined;
        if (hover) this.room?.send("assign", { slot: n, skill: hover });
        else this.room?.send("useslot", n);
      };
      this.input.keyboard!.on(`keydown-${k}`, press);
      this.input.keyboard!.on(`keydown-NUMPAD_${k}`, press);
    });
    this.setupHotbar();
    this.input.keyboard!.on("keydown-Q", () => { if (!this.chatting()) this.room?.send("potion"); });
    // Secondary ranged weapon from the equipment screen (sling, knives, crossbow)
    this.input.keyboard!.on("keydown-R", () => { if (!this.chatting()) this.room?.send("ranged"); });
    const dodge = () => { if (!this.chatting()) this.room?.send("dodge"); };
    this.input.keyboard!.on("keydown-SHIFT", dodge);
    this.input.keyboard!.on("keydown-F", dodge);
    this.input.keyboard!.on("keydown-C", () => { if (!this.chatting()) this.toggleHeroMenu(); });
    this.input.keyboard!.on("keydown-ESC", () => this.closeMenus());
    this.input.keyboard!.on("keydown-E", () => { if (!this.chatting()) this.npcs?.interact(); });
    this.input.keyboard!.on("keydown-J", () => {
      if (this.chatting() || !this.npcs) return;
      const open = this.npcs.log.open;
      this.closeMenus();
      this.npcs.log.toggle(!open);
    });
    document.getElementById("lvlnote")!.onclick = () => this.toggleHeroMenu();
    // Hero panel: assign stat points / reset them (buttons never keep focus, so Space can't click them)
    const heroEl = document.getElementById("hero")!;
    heroEl.addEventListener("mousedown", (ev) => { if ((ev.target as HTMLElement).closest("button")) ev.preventDefault(); });
    heroEl.addEventListener("click", (ev) => {
      if (ev.detail === 0) return;
      const b = (ev.target as HTMLElement).closest("button");
      if (b?.dataset.stat) this.room?.send("stat", b.dataset.stat);
      else if (b?.id === "statreset") this.room?.send("resetstats");
    });
    this.gearMenu = new GearMenu(this, (type, msg) => this.room?.send(type, msg));
    const toggleGear = () => this.gearMenu?.toggle(this.entities.get(this.me)?.state);
    this.input.keyboard!.on("keydown-G", () => { if (!this.chatting()) toggleGear(); });
    // Always reachable with the mouse too (even while typing in chat, in combat or while dead)
    const menuButton = (id: string, onClick: () => void) => {
      const b = document.getElementById(id)!;
      b.addEventListener("mousedown", (ev) => ev.preventDefault()); // never take focus (Space/Enter must not click it)
      b.tabIndex = -1;
      b.addEventListener("click", (ev) => { if (ev.detail === 0) return; b.blur(); onClick(); });
    };
    menuButton("bagbtn", toggleGear);
    menuButton("herobtn", () => this.toggleHeroMenu());
    menuButton("treebtn", () => this.toggleTree());
    this.guardHudButtons();
    window.addEventListener("keydown", (ev) => { if (ev.key === "Escape") this.closeMenus(); });
    this.talentMenu = new TalentMenu((type, msg) => this.room?.send(type, msg));
    this.input.keyboard!.on("keydown-T", () => { if (!this.chatting()) this.toggleTree(); });
    this.setupChat();

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = import.meta.env.DEV ? `${proto}://${location.hostname}:2567` : `${proto}://${location.host}`;
    try {
      this.room = await new Client(url).joinOrCreate("town", this.opts);
    } catch (e: any) {
      const msg = typeof e?.message === "string" && e.message && !/websocket|connect/i.test(e.message) ? e.message : "Could not connect to server.";
      document.getElementById("status")!.textContent = msg;
      document.getElementById("play")!.removeAttribute("disabled");
      this.game.destroy(true);
      return;
    }
    this.me = this.room.sessionId;
    document.getElementById("join")!.hidden = true;
    (document.getElementById("join") as HTMLElement).style.display = "none";
    document.getElementById("hud")!.hidden = false;
    this.minimap = new Minimap(document.getElementById("minimap") as HTMLCanvasElement, this.opts.name);
    this.npcs = new NpcLayer(this, (type, msg) => this.room.send(type, msg));
    this.room.onMessage("quest", ({ stage }) => this.npcs?.onQuest(stage));
    this.room.onMessage("shop", (msg) => this.npcs?.onShop(msg));
    this.dial = new DayDial(document.getElementById("daydial") as HTMLCanvasElement);

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
      const g: Phaser.GameObjects.Shape = s.kind === "stone"
        // Sling stone (equipment)
        ? this.add.circle(s.x, s.y, 1.5, 0x9e9e9e).setStrokeStyle(0.5, 0x424242).setDepth(9000)
        : s.kind === "knife" || s.kind === "bolt"
        // Thrown knife / crossbow bolt (equipment)
        ? this.add.rectangle(s.x, s.y, s.kind === "bolt" ? 8 : 5, s.kind === "bolt" ? 1.5 : 2, s.kind === "bolt" ? 0x8d6e63 : 0xe0e6ee)
            .setStrokeStyle(0.5, 0x37474f).setAngle(Math.atan2(s.vy ?? 0, s.vx ?? 1) * 180 / Math.PI).setDepth(9000)
        : s.kind === "arrow"
        // Arrow: thin shaft along the flight direction
        ? this.add.rectangle(s.x, s.y, 9 * size, 1.5 * size, 0xe8d8b0).setStrokeStyle(0.5, 0x5d4037)
            .setAngle(Math.atan2(s.vy ?? 0, s.vx ?? 1) * 180 / Math.PI).setDepth(9000)
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
        ? this.add.image(it.x, it.y, "gear_icons", it.gear).setScale(0.6 / ART_K).setDepth(it.y - 8)
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

    // A Mother Blob budding a blobling: quick wobble
    // A hidden monster jumps out of its grave / tree
    this.room.onMessage("ambush", ({ id, x, y, victim }) => {
      const e = this.entities.get(id);
      if (!e) return;
      e.sprite.setPosition(x, y); e.tx = x; e.ty = y;
      this.floatText(x, y - e.top - 4, "!", "#ff5252");
      this.tweens.add({ targets: e.sprite, scaleX: { from: 0.4, to: 1 }, scaleY: { from: 1.6, to: 1 }, duration: 220, ease: "Back.Out" });
      if (victim === this.me) this.cameras.main.shake(80, 0.002);
    });
    this.room.onMessage("brood", ({ id }) => {
      const e = this.entities.get(id);
      if (e) this.tweens.add({ targets: e.sprite, scaleX: 1.15, scaleY: 0.85, duration: 120, yoyo: true, repeat: 1 });
    });
    this.room.onMessage("swing", ({ id, step, variant, ax, ay }) => this.showSwing(id, step ?? 0, variant ?? 0, ax, ay));
    this.room.onMessage("special", (msg) => this.showSpecial(msg));
    this.room.onMessage("boom", ({ x, y, r, kind }) =>
      kind === "arrow" || kind === "stone" || kind === "knife" || kind === "bolt" ? this.burst(x, y, 3, 0xd7ccc8, 150) : this.burst(x, y, r ? r / 1.8 : 6, 0xff9f1c, r ? 300 : 200));
    this.room.onMessage("ult", (msg) => this.showUlt(msg));
    this.room.onMessage("dodge", (msg) => this.showDodge(msg));
    this.room.onMessage("rangedshot", ({ id }) => {
      const e = this.entities.get(id);
      if (id === this.me) this.lastRanged = this.time.now;
      if (e?.hero && !e.state.dead) playCharAnim(e.sprite, e.hero, "attack", e.state.dir);
    });
    this.room.onMessage("zonecleared", ({ zone, by, name }) => {
      if (by === this.me) this.showCleared(zone);
      this.feed(`${name} cleared ${zone}!`);
    });
    this.room.onMessage("power", ({ id, name }) => {
      const e = this.entities.get(id);
      if (e) this.floatText(e.sprite.x, e.sprite.y - 24, name, "#7cfc00");
    });
    this.room.onMessage("levelup", ({ id, level, from }) => {
      const e = this.entities.get(id);
      if (e) {
        this.floatText(e.sprite.x, e.sprite.y - 20, `LEVEL ${level}!`, "#7cfc00");
        this.levelBurst(e.sprite, id === this.me);
      }
      if (id === this.me) {
        this.feed(`You reached level ${level}`);
        // Don't pop the menu up mid-fight: show a small notice, the player opens it with C
        this.levelFrom = Math.min(this.levelFrom ?? Infinity, from ?? level - 1);
        const note = document.getElementById("lvlnote")!;
        note.textContent = `⬆ Level ${level}! Press C to assign your stat points`;
        note.hidden = false;
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
    // Initiative broken (shared/combat.ts): the target is dizzy and can't attack for a moment
    this.room.onMessage("broken", ({ id }) => {
      const e = this.entities.get(id);
      if (!e) return;
      this.floatText(e.sprite.x, e.sprite.y - 22, id === this.me ? "Dizzy!" : "Broken!", "#ffd166");
    });
    this.room.onMessage("kill", ({ killer, victim }) => this.feed(`${killer} ⚔ ${victim}`));
    this.room.onMessage("xp", ({ amount, x, y }) => this.floatText(x, y - 10, `+${amount} XP`, "#ffd166"));
    this.room.onMessage("chat", ({ id, name, text }) => this.chatMessage(id, name, text));
    this.room.onLeave(() => this.feed("Disconnected from server"));
  }

  /**
   * Game keys must never "press" an on-screen button. Some browsers keep focus on a clicked button, and then
   * Space (attack) or Enter would click it again, e.g. opening the bag. Keyboard clicks on HUD buttons are dropped.
   */
  private guardHudButtons() {
    const hud = document.getElementById("hud")!;
    const focusedButton = () => {
      const a = document.activeElement as HTMLElement | null;
      return a && a !== this.chatEl && hud.contains(a) && (a.tagName === "BUTTON" || a.getAttribute("role") === "button") ? a : null;
    };
    for (const type of ["keydown", "keyup"] as const) {
      window.addEventListener(type, (ev) => {
        if (ev.key !== " " && ev.key !== "Enter") return;
        const b = focusedButton();
        if (!b) return;
        if (ev.key === " ") ev.preventDefault(); // the game still sees the key; only the button click is cancelled
        b.blur();
      }, true);
    }
    // Clicks made with the keyboard have detail 0; real mouse/touch clicks have detail >= 1
    hud.addEventListener("click", (ev) => {
      const t = (ev.target as HTMLElement).closest("button");
      if (t && ev.detail === 0) { ev.preventDefault(); ev.stopImmediatePropagation(); }
    }, true);
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
      const sprite = this.add.sprite(p.x, p.y, mobTexture(this, p.kind), 0).setOrigin(0.5, MOB_LOOK[p.kind]?.oy ?? 0.85);
      const label = this.add.text(p.x, p.y, `Lv${p.level ?? 1}`, {
        fontFamily: "monospace", fontSize: "14px", color: "#ffffff", stroke: "#000", strokeThickness: 3,
      }).setOrigin(0.5, 1).setScale(0.25).setResolution(2);
      this.entities.set(id, { sprite, label, bar: this.add.graphics(), tx: p.x, ty: p.y, state: p, mob, top: MOB_LOOK[p.kind]?.top ?? 14 });
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
    if (id === this.me) {
      // ?look=tx,ty (map viewing aid, like ?time=): park the camera on a tile instead of following the hero
      const look = new URLSearchParams(location.search).get("look")?.split(",").map(Number);
      const target = look?.length === 2 && look.every(Number.isFinite) ? this.add.zone((look[0] + 0.5) * TILE, (look[1] + 0.5) * TILE, 1, 1) : sprite;
      this.cameras.main.startFollow(target, true, 0.15, 0.15);
    }
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

  private showSwing(id: string, step: number, variant: number, ax?: number, ay?: number) {
    const e = this.entities.get(id);
    if (!e) return;
    const dir = e.state.dir as string;
    if (e.hero) playCharAnim(e.sprite, e.hero, this.attackAnim(e.hero, step, variant), dir as any);
    // Aim can be diagonal (the server sends it); mobs and old messages fall back to the facing direction
    const off = typeof ax === "number" && typeof ay === "number" ? [ax, ay]
      : { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir] ?? [0, 1];
    const cls = e.mob ? undefined : CLASSES[e.state.cls as ClassKind];
    const hit = cls?.combo[step];
    // Mirror our own lunge locally so client prediction doesn't fight the server
    if (id === this.me && hit?.lunge) {
      const push = { up: off[1] < -0.1, down: off[1] > 0.1, left: off[0] < -0.1, right: off[0] > 0.1 };
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
    if (el.hidden) { this.closeMenus(); this.showHeroMenu(this.levelFrom); } else el.hidden = true;
    this.levelFrom = undefined;
    document.getElementById("lvlnote")!.hidden = true;
  }

  /** Skill tree on top of everything else (only one menu open at a time). */
  private toggleTree() {
    if (!this.talentMenu?.open) this.closeMenus();
    this.talentMenu?.toggle(this.entities.get(this.me)?.state);
  }

  private closeMenus() {
    for (const id of ["hero", "tree"]) document.getElementById(id)!.hidden = true;
    this.npcs?.close();
    this.npcs?.log.toggle(false);
    this.gearMenu?.close();
  }

  /** Opens the hero menu. After level-ups (`from` = level before them) it highlights the gains. */
  private showHeroMenu(from?: number) {
    const mine = this.entities.get(this.me)?.state;
    if (!mine) return;
    this.heroFrom = from;
    const cls = mine.cls as ClassKind, lvl = mine.level as number;
    const st = { sta: mine.sta, str: mine.str, mag: mine.mag }; // includes gear bonuses
    const free = statPoints(lvl) - (mine.ptSta + mine.ptStr + mine.ptMag);
    // Rebuild only when something shown changed (called every frame while open)
    const sig = [lvl, mine.xp, Math.ceil(mine.hp), mine.maxHp, st.sta, st.str, st.mag, free, mine.kills, mine.gold, from].join("|");
    const el = document.getElementById("hero")!;
    if (!el.hidden && sig === this.heroSig) return;
    this.heroSig = sig;
    const levelUp = from !== undefined ? `⬆ Level ${lvl}! ` : "";
    document.getElementById("herobanner")!.textContent = free > 0
      ? `${levelUp}${free} stat point${free > 1 ? "s" : ""} to assign: click + below.`
      : levelUp;
    document.getElementById("herotitle")!.textContent = `${mine.name} · Lv ${lvl} ${CLASSES[cls].name}`;
    const notes: Record<StatKind, string> = {
      sta: `${mine.maxHp} max HP, regen ${regenFromStamina(st.sta)[1].toFixed(1)} HP/s`,
      str: STATS[cls].attackStat === "str" ? `attack ×${attackMult(cls, st).toFixed(2)}, +${HP_PER_STR} HP each` : `+${HP_PER_STR} HP per point`,
      mag: `${STATS[cls].attackStat === "mag" ? `attack ×${attackMult(cls, st).toFixed(2)}, +${HP_PER_STR} HP each, ` : ""}skills ×${magicMult(cls, st).toFixed(2)}, ` +
        `cooldowns −${Math.round((1 - cooldownMult(cls, st, mine.talents)) * 100)}%`,
    };
    const pts: Record<StatKind, number> = { sta: mine.ptSta, str: mine.ptStr, mag: mine.ptMag };
    document.getElementById("herostats")!.innerHTML = (["sta", "str", "mag"] as StatKind[]).map((k) => {
      const plus = free > 0 ? `<button class="statplus" data-stat="${k}" title="Add a point to ${STAT_NAMES[k]}">+</button>` : "<span></span>";
      const mine_ = pts[k] ? ` <span class="gain">(+${pts[k]})</span>` : "";
      return `${plus}<span>${STAT_NAMES[k]}</span><b>${st[k]}${mine_}</b><span class="note">${notes[k]}</span>`;
    }).join("");
    const def = CLASSES[cls];
    const next = xpForLevel(lvl + 1), cur = xpForLevel(lvl);
    const dmg = Math.round(def.damage * attackMult(cls, st) * talentMult(cls, mine.talents, "dmg"));
    const speed = Math.round(heroSpeed(cls, mine.talents, false) * gearSpeedMult(mine) * talentMult(cls, mine.talents, "speed"));
    const rows: [string, string][] = [
      ["Level", lvl >= 20 ? "20 (max)" : `${lvl} · XP ${mine.xp - cur}/${next - cur}`],
      ["Health", `${Math.ceil(mine.hp)} / ${mine.maxHp}`],
      ["HP regen", `${regenFromStamina(st.sta)[1].toFixed(1)}/s resting · ${regenFromStamina(st.sta)[0].toFixed(1)}/s in a fight`],
      ["Attack", `${dmg} damage${def.projectile ? " (ranged)" : ""}`],
      ["Attack speed", `${(1000 / def.attackCooldownMs * (mine.raging ? RAGE_ATTACK_SPEED : 1)).toFixed(1)} hits/s`],
      ["Initiative", `${heroPoise(cls, lvl)} · dizzy at 0`],
      ["Move speed", `${speed}`],
      ["Kills · Gold", `${mine.kills} · ${mine.gold}`],
    ];
    document.getElementById("herochar")!.innerHTML = rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join("");
    el.hidden = false;
  }

  /** Bar label: name and current value right of centre, "/" exactly in the middle, max on the left of the right half,
   * so the HP and Stamina numbers line up with each other. */
  private barText(id: string, label: string, cur: number, max: number) {
    const html = `<span class="l">${label} <b>${cur}</b></span><span class="sep">/</span><span class="r">${max}</span>`;
    const el = document.getElementById(id)!;
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  /** Skill slot bar (keys 1..0): drop a skill from the tree (or another slot) on a slot; right-click clears it. */
  private setupHotbar() {
    const bar = document.getElementById("hotbar")!;
    bar.addEventListener("dragover", (ev) => { if ((ev.target as HTMLElement).closest("[data-slot]")) ev.preventDefault(); });
    bar.addEventListener("drop", (ev) => {
      const cell = (ev.target as HTMLElement).closest("[data-slot]") as HTMLElement | null;
      const skill = ev.dataTransfer?.getData("text/skill");
      if (!cell || !skill) return;
      ev.preventDefault();
      this.room?.send("assign", { slot: Number(cell.dataset.slot), skill });
    });
    bar.addEventListener("dragstart", (ev) => {
      const cell = (ev.target as HTMLElement).closest("[data-slot]") as HTMLElement | null;
      if (cell?.dataset.skill) ev.dataTransfer?.setData("text/skill", cell.dataset.skill);
    });
    bar.addEventListener("contextmenu", (ev) => {
      const cell = (ev.target as HTMLElement).closest("[data-slot]") as HTMLElement | null;
      if (!cell) return;
      ev.preventDefault();
      if (cell.dataset.skill) this.room?.send("assign", { slot: Number(cell.dataset.slot), skill: "" });
    });
    bar.addEventListener("click", (ev) => {
      const cell = (ev.target as HTMLElement).closest("[data-slot]") as HTMLElement | null;
      if (cell?.dataset.skill) this.room?.send("useslot", Number(cell.dataset.slot));
    });
  }

  /** Name, cooldown and cost of an active skill for the HUD. */
  private skillHud(cls: ClassKind, skill: string, cdm: number) {
    const sp = CLASSES[cls].special, u = ULTS[cls];
    return skill === "ult"
      ? { name: u.name, cdMs: u.cooldownMs * cdm, last: this.lastUlt, cost: ENERGY.cost.ult, ult: true }
      : { name: sp.name, cdMs: sp.cooldownMs * cdm, last: this.lastSpecial, cost: ENERGY.cost.special, ult: false };
  }

  /** HUD list of every action with its key and cooldown, under the skill bar. */
  private renderActions(mine: any, cls: ClassKind, cdm: number, now: number) {
    const row = (key: string, name: string, cdMs: number, last: number, extra = "", locked = "", cost = 0) => {
      const left = cdMs > 0 ? Math.max(0, cdMs - (now - last)) : 0;
      const short = cost > mine.energy;
      const state = locked ? "locked" : left > 0 || short ? "wait" : "";
      const status = locked || (left > 0 ? `${(left / 1000).toFixed(1)}s` : short ? `needs ${cost}` : extra || "ready");
      const fill = left > 0 ? `<div class="cd" style="width:${(1 - left / cdMs) * 100}%"></div>` : "";
      return `<li class="${state}${ult ? " ult" : ""}">${fill}<kbd>${key}</kbd><span class="n">${name}</span><span class="s">${status}</span></li>`;
    };
    let ult = false;
    const slots: string[] = [...(mine.slots ?? [])];
    // Assigned slots first, then learned skills still waiting for a slot
    const slotRows = slots.map((skill, i) => {
      if (!skill) return "";
      const h = this.skillHud(cls, skill, cdm);
      ult = h.ult;
      const r = row(SLOT_KEYS[i], h.name, h.cdMs, h.last, "", skillLearned(cls, mine.talents, skill as any) ? "" : "🔒", h.cost);
      ult = false;
      return r;
    });
    const unslotted = activeSkills(cls).filter((a) => skillLearned(cls, mine.talents, a.id) && !slots.includes(a.id))
      .map((a) => row("–", a.name, 0, 0, "", "no slot: drag it from T"));
    const html = [
      row("Space", CLASSES[cls].projectile ? "Shoot" : "Attack", 0, 0, (mine.talents?.get(COMBO_NODE) ?? 0) > 0 ? "3-hit combo" : "ready"),
      ...slotRows, ...unslotted,
      row("Shift", "Dodge roll", DODGE.cooldownMs, this.lastDodge, "", "", ENERGY.cost.dodge),
      row("Q", "Potion", 0, 0, `×${mine.potions}`, mine.potions > 0 ? "" : "×0"),
      // Secondary ranged weapon from the equipment screen, only when one is worn
      ...(mine.ranged && GEAR[mine.ranged]?.shot ? [row("R", GEAR[mine.ranged].name, GEAR[mine.ranged].shot!.cooldownMs, this.lastRanged)] : []),
    ].join("");
    const el = document.getElementById("actions")!;
    if (this.actionsHtml !== html) { el.innerHTML = html; this.actionsHtml = html; }
    // Slot bar at the bottom: 10 cells, cooldown shading, drag targets
    const cells = Array.from({ length: SLOT_COUNT }, (_, i) => {
      const skill = slots[i] ?? "";
      if (!skill) return `<div class="slot empty" data-slot="${i}"><kbd>${SLOT_KEYS[i]}</kbd></div>`;
      const h = this.skillHud(cls, skill, cdm);
      const left = Math.max(0, h.cdMs - (now - h.last));
      const shade = left > 0 ? `<div class="cd" style="height:${(left / h.cdMs) * 100}%"></div>` : "";
      const wait = left > 0 || h.cost > mine.energy ? " wait" : "";
      return `<div class="slot${h.ult ? " ult" : ""}${wait}" data-slot="${i}" data-skill="${skill}" draggable="true" title="${h.name}: click or press ${SLOT_KEYS[i]} · right-click to clear">` +
        `${shade}<kbd>${SLOT_KEYS[i]}</kbd><span>${h.name}</span>${left > 0 ? `<b>${Math.ceil(left / 1000)}</b>` : ""}</div>`;
    }).join("");
    const bar = document.getElementById("hotbar")!;
    if (this.hotbarHtml !== cells) { bar.innerHTML = cells; this.hotbarHtml = cells; }
    const zone = document.getElementById("zone")!;
    zone.style.top = `${el.offsetTop + el.offsetHeight + 4}px`;
  }

  private showDodge(msg: { id: string; dir: string }) {
    const e = this.entities.get(msg.id);
    if (!e) return;
    if (msg.id === this.me) this.lastDodge = this.time.now;
    if (e.hero) playCharAnim(e.sprite, e.hero, "dodge", msg.dir as any);
    // A couple of fading after-images and a dust puff
    for (let i = 1; i <= 3; i++) {
      this.time.delayedCall(i * 60, () => {
        const g = this.add.sprite(e.sprite.x, e.sprite.y, e.sprite.texture.key, e.sprite.frame.name)
          .setOrigin(e.sprite.originX, e.sprite.originY).setFlipX(e.sprite.flipX).setScale(e.sprite.scaleX, e.sprite.scaleY)
          .setAlpha(0.35).setTint(0xbde0fe).setDepth(e.sprite.depth - 0.1);
        this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
      });
    }
    this.burst(e.sprite.x, e.sprite.y + 4, 5, 0xd7ccc8, 250);
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
  /** Level-up: the hero radiates a short burst of gold light (everyone nearby sees it); your own also shakes the screen. */
  private levelBurst(sprite: Phaser.GameObjects.Sprite, mine: boolean) {
    const x = sprite.x, y = sprite.y - 6, depth = sprite.depth + 1;
    // Soft glow that swells and fades
    const glow = this.add.circle(x, y, 14, 0xffd166, 0.55).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: glow, scale: 3.2, alpha: 0, duration: 650, ease: "Cubic.easeOut", onComplete: () => glow.destroy() });
    // Expanding golden ring
    const ring = this.add.circle(x, y, 10).setStrokeStyle(2, 0xffe08a, 1).setDepth(depth);
    this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 550, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
    // Rays shooting outwards
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const ray = this.add.rectangle(x + Math.cos(a) * 8, y + Math.sin(a) * 8, 6, 1.5, 0xffd166, 1)
        .setRotation(a).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: ray, x: x + Math.cos(a) * 34, y: y + Math.sin(a) * 34, scaleX: 2, alpha: 0, duration: 500, ease: "Quad.easeOut", onComplete: () => ray.destroy() });
    }
    // The hero flashes gold for a moment
    sprite.setTintFill(0xffd166);
    this.time.delayedCall(120, () => sprite.clearTint());
    if (mine) this.cameras.main.shake(260, 0.006);
  }

  /** Big on-screen "zone cleared" banner for the player who killed the zone's last monster. */
  private showCleared(zone: string) {
    const el = document.getElementById("cleared")!;
    el.querySelector(".big")!.textContent = `${zone} cleared!`;
    el.querySelector(".small")!.textContent = CONGRATS[Math.floor(Math.random() * CONGRATS.length)];
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
    const z = SPAWN_ZONES.find((sz) => sz.name === name);
    el.replaceChildren(pixelText(name, "#fff0b8", 13, 3));
    if (z) el.appendChild(pixelText(`Lv ${z.levels[0]}-${z.levels[1]}`, "#ffb070", 11, 2));
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
      if (id === this.me && !p.dead && !p.stunned && !p.rolling) {
        // Client-side prediction with the same movement code the server runs
        const r = moveStep(e.sprite.x, e.sprite.y, this.input_, dtMs / 1000, heroSpeed(p.cls as ClassKind, p.talents, p.slowed, p.raging) * gearSpeedMult(p) * talentMult(p.cls as ClassKind, p.talents, "speed"));
        e.sprite.setPosition(r.x, r.y);
        if (!r.moving) {
          // Ease toward authoritative position while idle
          e.sprite.x += (e.tx - e.sprite.x) * 0.2;
          e.sprite.y += (e.ty - e.sprite.y) * 0.2;
        }
      } else {
        const ease = p.rolling ? 0.5 : 0.25; // rolls are fast: follow the server closely
        e.sprite.x += (e.tx - e.sprite.x) * ease;
        e.sprite.y += (e.ty - e.sprite.y) * ease;
      }

      const moving = id === this.me ? (this.input_.up || this.input_.down || this.input_.left || this.input_.right) : p.moving;
      if (e.hero) {
        // Let one-shot attack/hit/skill animations finish before going back to walk/idle
        const key = e.sprite.anims.currentAnim?.key ?? "";
        const oneShot = e.sprite.anims.isPlaying && /_(attack\d?|swing\d|hit|skill|idle[23]|dodge)_/.test(key);
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
        if (e.mob) e.sprite.setVisible(!p.dead && !p.hidden);
        else e.sprite.setAlpha(p.dead ? 0.35 : 1).setAngle(p.dead ? 90 : 0);
      }
      e.sprite.setDepth(e.sprite.y);
      // Status effects: yellow flicker for stunned, red flash for a monster winding up, blue for slowed, red pulse for raging
      if (!p.dead && (p.stunned || p.winding || p.slowed || p.raging)) {
        e.sprite.setTint(p.stunned ? (Math.floor(now / 120) % 2 ? 0xfff176 : 0xffffff)
          : p.winding ? (Math.floor(now / 70) % 2 ? 0xff6b6b : 0xffffff)
          : p.slowed ? 0x90caf9 : (Math.floor(now / 200) % 2 ? 0xff8a80 : 0xffcdd2));
        e.statusTint = true;
      } else if (e.statusTint) { e.sprite.clearTint(); e.statusTint = false; }
      e.gear?.sync(e.sprite, p);

      const x = Math.round(e.sprite.x), y = Math.round(e.sprite.y);
      // Monsters: HP bar over the head, level tag just above it
      const mobBarY = y - e.top - 4;
      e.label?.setPosition(x, e.mob ? mobBarY - 1 : y - e.top - (p.hat ? 4 : 2)).setDepth(e.sprite.y + 1);
      if (e.mob && e.label) {
        // Level tag coloured by how tough it is for me: grey easy, white even, orange tougher, red dangerous
        const diff = (p.level ?? 1) - ((this.room.state as any).players?.get(this.me)?.level ?? 1);
        const col = diff >= 3 ? "#ff5252" : diff >= 1 ? "#ffb74d" : diff >= -2 ? "#ffffff" : "#9e9e9e";
        const txt = `Lv${p.level ?? 1}`;
        if (e.label.text !== txt) e.label.setText(txt);
        if (e.lvlColor !== col) { e.label.setColor(col); e.lvlColor = col; }
        e.label.setVisible(!p.dead && !p.hidden);
      }
      e.bubble?.setPosition(x, y - e.top - 7);
      e.bar.clear().setDepth(e.sprite.y + 1);
      const maxHp = p.maxHp;
      if (!e.mob) {
        if (p.guarding && !p.dead) {
          e.shield ??= this.add.graphics();
          e.shield.clear().lineStyle(1, 0x9ad1ff, 0.9).strokeCircle(x, y - e.top / 2, e.top / 2 + 3).setDepth(e.sprite.y + 2);
        } else if (e.shield) { e.shield.destroy(); e.shield = undefined; }
      }
      if (p.broken && !p.dead) {
        // Dizzy: three little stars circling over the head
        const sy = y - e.top - (e.mob ? 8 : 4);
        for (let i = 0; i < 3; i++) {
          const a = now / 180 + (i * Math.PI * 2) / 3;
          e.bar.fillStyle(0xffd166).fillRect(x + Math.cos(a) * 6 - 1, sy + Math.sin(a) * 2 - 1, 2, 2);
        }
      }
      if (e.mob && !p.dead && p.hidden) {
        // Hiding in a grave or tree: only a pair of eyes peeks out (and blinks now and then)
        e.bar.setDepth(20000);
        const blink = (now + x * 53 + y * 31) % 3200 < 160;
        if (!blink) {
          const col = p.kind === "skeleton" ? 0xff5252 : 0xfff176;
          const ey = y - (p.kind === "skeleton" ? 2 : 5);
          e.bar.fillStyle(0x000000, 0.6).fillRect(x - 3, ey - 1, 7, 3);
          e.bar.fillStyle(col).fillRect(x - 2, ey, 1, 1).fillRect(x + 2, ey, 1, 1);
        }
      } else if (e.mob && !p.dead) {
        const bw = MOB_LOOK[p.kind]?.bar || 14;
        e.bar.fillStyle(0x000000).fillRect(x - bw / 2, mobBarY, bw, 2);
        e.bar.fillStyle(0xf4a261).fillRect(x - bw / 2, mobBarY, bw * (p.hp / maxHp), 2);
      } else if (!e.mob && !p.dead && p.hp < maxHp) {
        e.bar.fillStyle(0x000000).fillRect(x - 7, y + 3, 14, 2);
        e.bar.fillStyle(0xe63946).fillRect(x - 7, y + 3, 14 * (p.hp / maxHp), 2);
      }
    }

    for (const shot of this.shots.values()) {
      shot.g.x += (shot.tx - shot.g.x) * 0.5;
      shot.g.y += (shot.ty - shot.g.y) * 0.5;
    }

    const meEnt = this.entities.get(this.me);
    const others = [...this.entities].filter(([id, e]) => id !== this.me && !e.mob).map(([, e]) => e.sprite);
    this.minimap?.draw(now, meEnt?.sprite, others);
    this.dial?.draw(now);
    if (meEnt) this.showArea(areaAt(meEnt.sprite.x, meEnt.sprite.y));
    this.signPanel.update(meEnt?.sprite);
    this.npcs?.update(meEnt && !meEnt.state.dead ? meEnt.sprite : undefined, meEnt?.state);
    if (this.minimap && this.npcs) this.minimap.markers = this.npcs.markers;

    const mine = meEnt?.state;
    if (mine) {
      this.gearMenu?.refresh(mine);
      this.talentMenu?.refresh(mine);
      if (!document.getElementById("hero")!.hidden) this.showHeroMenu(this.heroFrom);
      const online = [...this.entities.values()].filter((x) => !x.mob).length;
      const safe = isSafeZone(meEnt.sprite.x, meEnt.sprite.y) ? "🛡 Safe zone · " : "";
      (document.getElementById("hpfill") as HTMLElement).style.width = `${(mine.hp / mine.maxHp) * 100}%`;
      this.barText("hptext", "HP", Math.ceil(mine.hp), Math.round(mine.maxHp));
      const next = xpForLevel(mine.level + 1), cur = xpForLevel(mine.level);
      const cls0 = mine.cls as ClassKind;
      document.getElementById("stats")!.textContent =
        `${mine.dead ? "Respawning… " : safe}Lv ${mine.level} ${CLASSES[mine.cls as ClassKind].name} · ` +
        `XP ${mine.xp - cur}/${next - cur} · Gold ${mine.gold} · Potions ${mine.potions} · Kills ${mine.kills} · Online ${online}` +
        (talentPoints(mine.level) > spentPoints(cls0, mine.talents) ? ` · ⭐ ${talentPoints(mine.level) - spentPoints(cls0, mine.talents)} skill point(s): press T` : "");
      const freePts = talentPoints(mine.level) - spentPoints(cls0, mine.talents);
      const badge = document.getElementById("treebadge")!;
      badge.hidden = freePts <= 0;
      badge.textContent = String(freePts);
      const freeStats = statPoints(mine.level) - (mine.ptSta + mine.ptStr + mine.ptMag);
      const hb = document.getElementById("herobadge")!;
      hb.hidden = freeStats <= 0;
      hb.textContent = String(freeStats);
      // Monster zone status: how many are alive
      const tx = meEnt.sprite.x / TILE, ty = meEnt.sprite.y / TILE;
      const zdef = SPAWN_ZONES.find((z) => tx >= z.x && ty >= z.y && tx < z.x + z.w && ty < z.y + z.h);
      const zone = zdef && (this.room.state as any).zones?.get(zdef.name);
      document.getElementById("zone")!.textContent = zone
        ? `⚔ ${zone.name} (Lv ${zdef!.levels[0]}-${zdef!.levels[1]}): ${zone.alive}/${zone.cap} monsters`
        : "";
      const cls = mine.cls as ClassKind;
      const cdm = cooldownMult(cls, { sta: mine.sta, str: mine.str, mag: mine.mag }, mine.talents) * talentReduce(cls, mine.talents, "cdr");
      const sp = CLASSES[cls].special;
      const spCd = sp.cooldownMs * cdm;
      const left = Math.max(0, spCd - (now - this.lastSpecial));
      // Blue bar = Stamina (Magic for the Wizard), spent by skills, the ultimate and the dodge roll
      const fill = document.getElementById("skillfill") as HTMLElement;
      fill.style.width = `${(mine.energy / ENERGY.max) * 100}%`;
      fill.classList.toggle("magic", cls === "wizard");
      this.barText("skilltext", energyName(cls), Math.floor(mine.energy), ENERGY.max);
      this.renderActions(mine, cls, cdm, now);
    }
  }
}
