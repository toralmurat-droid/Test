import Phaser from "phaser";
import { quake } from "./camfx";
import { chargeIcon } from "./chargeIcon";
import { leaving, noteBuild, reconnectSoon, returnToStart, takeCarried, upgradeAnnounced } from "./reconnect";
import { Client, Room } from "colyseus.js";
import { BOSS, ELITE, InputState, MERGE, MAP_H, MAP_W, regenFromStamina, TICK_RATE, TILE } from "../../shared/constants";
import { CLASSES, ClassKind, ENERGY, MAX_LEVEL, xpForLevel } from "../../shared/classes";
import { canPay, MANA, manaRegen, maxManaFor, skillCost, unpackMana } from "../../shared/mana";
import { nextSize, potionAmount, PotionKind, potionName, POTION_SIZES, total, unpackPotions } from "../../shared/potions";
import { GROUND, areaAt, isSafeZone } from "../../shared/map";
import { heroPoise, meleeReach, mobBody } from "../../shared/combat";
import { moveStep } from "../../shared/movement";
import { SPAWN_ZONES, zoneAt } from "../../shared/spawns";
import { musicCombat, setMusicZone } from "./music";
import { bindSfx, play as playSfx, sfxFrame } from "./sfx";
import { attackMult, cooldownMult, critChance, heroSpeed, STATS, magicMult, STAT_KINDS, STAT_NAMES, StatKind, statPoints, HP_PER_STR } from "../../shared/powers";
import { NEED_TEXT, pointRange, SkillDef, skillOf, skillTarget, MAX_STACKS, STACK_DECAY_MS, STACK_NAME, talentBonus } from "../../shared/skills";
import { SkillFx } from "./skillfx";
import { movesSheet, SkillMoves } from "./skillMoves";
import { displayGrid } from "./tileset";
import { CRAWL_CROP, heroTexture, itemTexture, potionTex, makeTileset, MOB_LOOK, mobTexture, preloadPaintedMobs } from "./textures";
import { Minimap } from "./minimap";
import { GameMenu } from "./gamemenu";
import { showMusicPanel, musicPanelOpen } from "./music";
import { DayDial } from "./daydial";
import { SignPanel } from "./signpanel";
import { NpcLayer } from "./npcs";
import { ANVIL_TOP, FORGE_FIRE } from "./smithy";
import { Villagers } from "./villagers";
import { WatchLayer } from "./watch";
import { WrathBanner } from "./wrath";
import { inVillage } from "../../shared/wrath";
import { GateTorches } from "./gateTorches";
import { npcPresent, QUEST_ITEMS, usableObjects, USE_RANGE } from "../../shared/quests";
import { NPCS, NPC_DECOR, TALK_RANGE } from "../../shared/npcs";
import { CHESTS, CHEST_RANGE } from "../../shared/chests";
import { SHRINE, SHRINE_RANGE } from "../../shared/shrine";
import { PORTALS, PORTAL_RANGE } from "../../shared/portals";
import { PointerControls, type ClickEnemy, type ClickSpot } from "./pointer";
import { warmPaths } from "./pathfind";
import { pixelText } from "./pixeltext";
import { speechBubble } from "./weathered";
import { ART_K, CHAR_GROW, CHAR_SCALE, CHARACTERS, CHAR_ORIGIN, CharacterName, createArtAnims, ensureCharSheet, HD_CHARS, playCharAnim, preloadArt } from "./artAssets";
import { Ambient } from "./ambient";
import { Details } from "./details";
import { activeOf, GearLayer, GearMenu, iconCanvas, itemColor, preloadGear, RARITY_HEX } from "./gear";
/** pickSlot value while the slot list is choosing the left-click action. */
const LEFT_PICK = -2;
/** pickSlot value while the slot list is choosing the right-click (and Space) action. */
const RIGHT_PICK = -3;
type ClickSide = "left" | "right";
/** "12 mana · 20 stamina" for a skill list. */
const costWords = (s: { cost?: number; mana?: number }) => [s.mana ? `${s.mana} mana` : "", s.cost ? `${s.cost} stamina` : ""].filter(Boolean).join(" · ") || "free";
import { GearFx } from "./gearfx";
import { Element, ELEMENT_COLORS } from "../../shared/elements";
import { baseId, gearDef, gearReachMult, gearSpeedMult, itemRarity, WEAPON_TYPE_NAMES } from "../../shared/gear";
import { attackProfile, ATTACK_WORDS, isWeaponType, poseSheet, profileOf, weaponAttackMult, weaponOk } from "../../shared/weapons";
import { talentMult, talentPoints, spentPoints } from "../../shared/talents";
import { activeSkills, SLOT_COUNT, SLOT_KEYS, skillLearned } from "../../shared/slots";
import { iconImg } from "./skillIcons";
import { TalentMenu } from "./talents";
import { IdeaBoard } from "./ideas";
import { PatchNotesPanel } from "./patchnotes";
import { PartyUI } from "./party";
import { StashUI, TradeUI } from "./trade";
import { STASH, STASH_RANGE } from "../../shared/trade";
import { afterLoading, hideLoading, loadingActive, loadingFor, setLoading } from "./loading";
import { ISO, IsoView, isoAnchor, isoInput, screenDir, screenDir8 } from "./iso";
import { SMOOTH } from "./isoflag";
import { addPixelGrid } from "./pixelgrid";
import { paintSmoothProps } from "./smoothProps";
import { ChestLayer } from "./chests";
import { ShrineLayer } from "./shrine";
import { PortalLayer } from "./portal";
import { BOON_NAMES, WIND_BLESSING } from "../../shared/shrine";
import { BuffBar } from "./buffbar";
import { addWorldProps } from "./worldProps";
import { addSiegeWorks } from "./siegeArt";
import { SiegeWork } from "./siegeWork";
import { PERCH_LIFT } from "../../shared/bandits";
import { icon, fillIcons } from "./pixelicons";
import { ResourceBars } from "./resourceBars";
import { bindElemFx } from "./elemFx";

/** One painted bit on a merged blob, in body-relative units (-1..1 across the body). */
interface BlobPart { kind: "patch" | "eye" | "mouth"; u: number; v: number; r: number; col: number }
/** Body colours of the blob kinds, for the patches and eye rims of merged blobs. */
const BLOB_COLORS: Record<string, number> = { slime: 0x7bd36b, blobling: 0xa6e86b, shooterblob: 0x9b6bd6, warriorblob: 0xd9573b, healerblob: 0xf5d0e6, venomblob: 0x8fd13a, frostblob: 0x8fd0f0, fireblob: 0xe8622a, stormblob: 0x7f7cf0 };

/**
 * Layout of a merged blob's extra features: a colour patch per swallowed blob, about two eyes and one mouth
 * each, capped so a 10-blob monster stays readable. Seeded by the monster id so it doesn't jump around.
 */
function blobPartsLayout(id: string, parts: string[]): BlobPart[] {
  let seed = 0;
  for (const ch of id + parts.join()) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) | 0; return ((seed >>> 8) & 0xffff) / 0x10000; };
  const out: BlobPart[] = [];
  const free = (u: number, v: number, r: number) => out.every((o) => o.kind === "patch" || Math.hypot(o.u - u, (o.v - v) * 1.4) > o.r + r + 0.06);
  const place = (kind: BlobPart["kind"], r: number, col: number, vMin: number, vMax: number) => {
    for (let i = 0; i < 30; i++) {
      const u = (rnd() * 2 - 1) * 0.8, v = vMin + rnd() * (vMax - vMin);
      if (u * u + v * v > 0.85 || (kind !== "patch" && !free(u, v, r))) continue;
      out.push({ kind, u, v, r, col });
      return;
    }
  };
  const kinds = parts.slice(0, 6);
  for (const k of kinds) place("patch", 0.32 + rnd() * 0.18, BLOB_COLORS[k] ?? 0x7bd36b, -0.7, 0.7);
  const eyes = Math.min(2 * parts.length, 6), mouths = Math.min(parts.length, 3);
  for (let i = 0; i < eyes; i++) place("eye", 0.11 + rnd() * 0.07, BLOB_COLORS[kinds[i % kinds.length]] ?? 0xffffff, -0.6, 0.3);
  for (let i = 0; i < mouths; i++) place("mouth", 0.16 + rnd() * 0.08, 0, 0.25, 0.75);
  return out;
}

interface Entity {
  merged?: number; // blobs fused into this monster (MERGE)
  base?: number; // a monster's resting scale (kind size x merge growth): every squash/stretch starts and ends there
  parts?: Phaser.GameObjects.Graphics; // merged blob: colour patches, extra eyes and mouths of the blobs inside
  partsKey?: string; partsLayout?: BlobPart[];
  sprite: Phaser.GameObjects.Sprite;
  label?: Phaser.GameObjects.Text;
  lvlColor?: string; // monsters: current colour of the "Lv N" label
  mob: boolean;
  hero?: CharacterName; // set when drawn with the animated 32x32 sheets
  culled?: boolean; // monster off screen: not drawn this frame
  top: number; // px from the feet to the top of the head, for the name label and chat bubble
  bar: Phaser.GameObjects.Graphics;
  bubble?: Phaser.GameObjects.Image;
  shield?: Phaser.GameObjects.Graphics;
  tx: number; ty: number; // server target position
  snaps?: Snap[]; // recent server positions with local arrival time, played back a little late (see interpolate)
  chaseUntil?: number; // a dash/blink/knockback event: ease to tx/ty instead of playing back the snapshots
  state: any;
  statusTint?: boolean;
  gear?: GearLayer; // equipment overlays (heroes only)
  vdir?: string; // iso view: facing on screen, from the last movement or attack
  strikeUntil?: number; // monster: show its strike frame until then (after a "swing")
  rip?: { start: number; end: number }; // Bone Demon tearing a skeleton apart: its harvest frames (demonRip)
  leapUntil?: number;
  rallyUntil?: number; // bandit under the chief's War Cry (local time) // Redfang Chief in the air: glide to the landing spot instead of snapping there
  lastX?: number; lastY?: number;
  idleSince?: number; // local time the hero stopped moving, for idle fidgets
  nextFidget?: number;
}

/** A server position and the local time it arrived. */
interface Snap { t: number; x: number; y: number }
/**
 * Other heroes and monsters are drawn this far in the past, so there is always a newer server position to glide
 * towards. The server sends 20 updates a second (one per 50 ms) and some arrive late; 2 updates of slack hides that.
 */
const INTERP_DELAY = 2.2 * (1000 / TICK_RATE);
/**
 * Server update clock. Updates leave the server every 50 ms but reach us unevenly (network, a busy server, a second
 * player's traffic), so each one is stamped with a smoothed time: the last stamp + 50 ms, nudged slowly towards
 * when it really arrived. `patchSeq` counts updates (bumped after each one), so all changes of one update share a stamp.
 */
let patchSeq = 0, stampSeq = -1, stamp = 0;
function patchTime(): number {
  if (stampSeq === patchSeq) return stamp;
  stampSeq = patchSeq;
  const now = performance.now(), guess = stamp + 1000 / TICK_RATE;
  stamp = Math.abs(now - guess) > 250 ? now : Math.min(now, guess + (now - guess) * 0.1);
  return stamp;
}
/** Record a server position for an entity (several field changes of one update count once). */
function pushSnap(e: { snaps?: Snap[] }, x: number, y: number) {
  const s = (e.snaps ??= []), t = patchTime();
  const last = s[s.length - 1];
  if (last && t - last.t < 1) { last.x = x; last.y = y; return; }
  s.push({ t, x, y });
  if (s.length > 12) s.splice(0, s.length - 12);
}
/** Where the entity was at local time t, from its snapshots: blended between the two around t, or carried a little past the last. */
function interpolate(s: Snap[], t: number): { x: number; y: number } | undefined {
  if (!s.length) return undefined;
  if (t <= s[0].t) return s[0];
  for (let i = s.length - 1; i > 0; i--) {
    const a = s[i - 1], b = s[i];
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / Math.max(1, b.t - a.t);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  // Past the newest update (a late one): keep the last speed a moment so the entity doesn't stop and jump
  const b = s[s.length - 1], a = s[s.length - 2];
  if (!a || b.t - a.t < 1) return b;
  const over = Math.min(t - b.t, 1000 / TICK_RATE * 1.5), k = over / Math.max(1, b.t - a.t);
  return { x: b.x + (b.x - a.x) * k, y: b.y + (b.y - a.y) * k };
}

const FRAME_BASE: Record<string, number> = { down: 0, up: 2, right: 4, left: 4 };
/** Iso monster sheets have attack frames after the walk ones: wind-up, then strike, per facing. */
const ATTACK_BASE: Record<string, number> = { down: 6, up: 8, right: 10, left: 10 };
/** On-screen hero size: 0.75 of a 32px design frame (frames are ART_K times finer). */
const HERO_SCALE = CHAR_SCALE;
const HERO_TOP = 24 * 0.75 * CHAR_GROW; // drawn hero height above the feet (24 of the 32 design px)

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

/** Pixel font (loaded with the NPC styles) for new in-world text. */
const PIXEL_FONT = "'Pixelify Sans', monospace";

/** Goo colours of the blobs (match their painted sheets), for the splash when one is struck. */
const GOO: Record<string, number> = { slime: 0x5fae4c, blobling: 0x8cc955, shooterblob: 0x7f5cb8, warriorblob: 0xb94a32, healerblob: 0xd9aec6, venomblob: 0x6aa82a, frostblob: 0x9fd8f4, fireblob: 0xd04a1a, stormblob: 0x6a6ad8 };

const tipEsc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export class TownScene extends Phaser.Scene {
  private room!: Room;
  private me = "";
  private entities = new Map<string, Entity>();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private input_: InputState = { up: false, down: false, left: false, right: false };
  private stopSeq = 0; // seq of our last "stand still" input
  private stoppedAt = 0;
  private seq = 0;
  private pointer?: PointerControls;
  /**
   * What a left / right click (and Space) does: "" = the main-hand weapon's attack, or a skill / basic spell id.
   * Saved per hero in this browser (Murat 2026-11-05: both clicks take any skill or the weapon attack).
   */
  private clickPick: Partial<Record<ClickSide, { hero: string; skill: string }>> = {};
  private npcs?: NpcLayer;
  private villagers?: Villagers;
  private watch?: WatchLayer;
  private wrathBanner?: WrathBanner;
  private torches?: GateTorches;
  private chests?: ChestLayer;
  private shrine?: ShrineLayer;
  private portals?: PortalLayer;
  private chatEl = document.getElementById("chat") as HTMLInputElement;
  private onlineShown = -1; // online hero count last written next to the chat box
  private ideaBoard?: IdeaBoard;
  private party?: PartyUI;
  private trade?: TradeUI;
  private stash?: StashUI;
  private patchNotes?: PatchNotesPanel;
  private minimap?: Minimap;
  private gameMenu?: GameMenu;
  private quitting = false; // "Save and return to start screen" in progress
  private dial?: DayDial;
  private signPanel = new SignPanel();
  private ambient?: Ambient;
  private details?: Details;
  private siege!: SiegeWork;
  private areaName = "";
  private areaTimer?: number;
  private shots = new Map<string, { g: Phaser.GameObjects.GameObject & { x: number; y: number }; tx: number; ty: number; at: number; dx: number; dy: number; spd: number }>();
  private fx!: SkillFx;
  private moves!: SkillMoves; // melee skill micro sequences (skillMoves.ts)
  private gearFx!: GearFx; // item level effects on heroes
  private lastCast: Record<string, number> = {}; // local clock (ms) of my last cast of each skill, for cooldowns
  private items = new Map<string, Phaser.GameObjects.Image>();
  private lastDodge = -Infinity;
  private rootUntil = 0; // local clock: my dash is gliding to the server's spot until then (no prediction)
  private lastRanged = -Infinity;
  private heroFrom?: number;
  private heroSig = "";
  private levelFrom?: number; // level before the level-ups the player hasn't looked at yet
  private clearedTimer?: number;
  private gearMenu?: GearMenu;
  private talentMenu?: TalentMenu;
  private hotbarHtml = "";
  private buffBar?: BuffBar;
  private resBars?: ResourceBars;
  private statsShown = "";
  private deathTimer?: number;
  private iso?: IsoView;

  constructor(private opts: { name: string; password: string; color: number; cls: ClassKind; newGame?: boolean }) {
    super("town");
  }

  preload() {
    this.load.on("progress", (v: number) => setLoading("Loading the art", v * 0.45));
    preloadArt(this);
    preloadGear(this);
    preloadPaintedMobs(this);
  }

  async create() {
    this.fx = new SkillFx(this, (id) => this.entities.get(id), () => this.me);
    this.gearFx = new GearFx(this.fx);
    this.moves = new SkillMoves(this, this.fx);
    makeTileset(this);
    createArtAnims(this);
    if (SMOOTH) paintSmoothProps(this); // painted iso forge, anvil, witch hut… in place of the front-view pixel props
    if (ISO) IsoView.tilemap(this, displayGrid(GROUND), displayGrid(Ambient.objectLayerData()));
    else {
      const map = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: MAP_W, height: MAP_H });
      const tiles = map.addTilesetImage("tiles", "tiles", TILE, TILE, 0, 0)!;
      map.createBlankLayer("ground", tiles)!.putTilesAt(displayGrid(GROUND), 0, 0).setDepth(-2);
      map.createBlankLayer("objects", tiles)!.putTilesAt(displayGrid(Ambient.objectLayerData()), 0, 0).setDepth(-1);
    }
    this.ambient = new Ambient(this); // trees, shadows, smoke, wildlife… (cosmetic only)
    this.details = new Details(this); // roof shading, ground detail, ducks, lanterns, day/night
    this.details.onDarkness((d) => this.ambient?.setDarkness(d));
    addWorldProps(this, (x, y, lift, dx) => this.details?.addLight(x, y, 0xffb347, 2.2, 0.75, 0.08, lift, dx)); // spear racks, pennants, dummies, lantern poles...
    addSiegeWorks(this); // the necromancer's half-built siege engines in the skeleton lands
    this.siege = new SiegeWork(this);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    // ?zoom=N (viewing aid, like ?look): another camera zoom
    const zq = Number(new URLSearchParams(location.search).get("zoom"));
    cam.setZoom(zq > 0 && zq <= 6 ? zq : 3);
    cam.roundPixels = !SMOOTH;
    if (SMOOTH && cam.postFX) {
      // Moody grade for the painted world (the HUD is HTML, so it is not affected): muted colours, deeper contrast,
      // a dark vignette around the edges
      const cm = cam.postFX.addColorMatrix();
      cm.saturate(-0.22);
      cm.contrast(0.12, true);
      cam.postFX.addVignette(0.5, 0.5, 0.92, 0.42);
      addPixelGrid(cam); // one pixel density for everything in the world
    }
    if (ISO) this.iso = new IsoView(this);

    // Keys without capture so typing in chat still works
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,Q,C,G,T,F,R,E,J", false) as any;
    // Space = right click at the mouse cursor (Murat 2026-11-05; it used to be a plain basic attack)
    this.input.keyboard!.on("keydown-SPACE", (ev: KeyboardEvent) => { if (!ev.repeat && !this.chatting()) this.pointer?.spaceDown(); });
    this.input.keyboard!.on("keyup-SPACE", () => this.pointer?.spaceUp());
    // Skill slots 1..0 (top row or numpad). With the skill tree open and the mouse over a learned skill,
    // the number key puts that skill in the slot instead of using it.
    const names = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "ZERO"];
    names.forEach((k, n) => {
      const press = () => {
        if (this.chatting()) return;
        const hover = this.talentMenu?.open ? this.talentMenu.hoveredActive() : undefined;
        if (hover) this.room?.send("assign", { slot: n, skill: hover });
        else this.castSlot(n); // the key casts its skill right away, toward the mouse cursor (Murat 2026-11-05)
      };
      this.input.keyboard!.on(`keydown-${k}`, press);
      this.input.keyboard!.on(`keydown-NUMPAD_${k}`, press);
    });
    this.setupHotbar();
    this.input.keyboard!.on("keydown-Q", () => { if (!this.chatting()) this.room?.send("potion"); });
    this.input.keyboard!.on("keydown-V", () => { if (!this.chatting()) this.room?.send("manapotion"); });
    // Secondary ranged weapon from the equipment screen (sling, knives, crossbow)
    this.input.keyboard!.on("keydown-R", () => { if (!this.chatting()) this.room?.send("ranged"); });
    const dodge = () => { if (!this.chatting()) this.room?.send("dodge"); };
    // (Shift no longer rolls: held, it turns the left click into an attack in place, see pointer.ts)
    this.input.keyboard!.on("keydown-F", dodge);
    this.input.keyboard!.on("keydown-C", () => { if (!this.chatting()) this.toggleHeroMenu(); });
    this.input.keyboard!.on("keydown-E", () => {
      if (this.chatting()) return;
      if (!this.npcs?.isOpen && this.chests?.interact()) return; // a loot chest right here comes first
      if (!this.npcs?.isOpen && this.stash?.interact()) return; // the account stash on the square
      if (!this.npcs?.isOpen && this.shrine?.interact()) return; // then the forest shrine
      if (!this.npcs?.isOpen && this.portals?.interact()) return; // then a portal stone's travel list
      this.npcs?.interact();
    });
    const toggleQuestLog = () => {
      if (!this.npcs) return;
      const open = this.npcs.log.open;
      this.closeMenus();
      this.npcs.log.toggle(!open);
    };
    this.input.keyboard!.on("keydown-J", () => { if (!this.chatting()) toggleQuestLog(); });
    // Quests button under the minimap
    const questBtn = document.getElementById("questbtn")!;
    fillIcons(questBtn);
    questBtn.onclick = (ev) => { ev.stopPropagation(); toggleQuestLog(); questBtn.blur(); };
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
    fillIcons(document.getElementById("menubtns")!);
    fillIcons(document.getElementById("online")!);
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
    // Esc closes whatever is open; with nothing open it opens the game menu (music & sound, ideas, news)
    let escHadOpen = false;
    window.addEventListener("keydown", (ev) => { if (ev.key === "Escape") escHadOpen = this.anyMenuOpen(); }, true);
    window.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      const a = document.activeElement;
      const typing = a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement;
      this.closeMenus();
      if (!escHadOpen && !typing) this.gameMenu?.show();
    });
    this.talentMenu = new TalentMenu((type, msg) => this.room?.send(type, msg));
    this.input.keyboard!.on("keydown-T", () => { if (!this.chatting()) this.toggleTree(); });
    this.ideaBoard = new IdeaBoard((type, msg) => this.room?.send(type, msg));
    const toggleIdeas = () => { if (!this.ideaBoard!.open) this.closeMenus(); this.ideaBoard!.toggle(); };
    this.input.keyboard!.on("keydown-I", () => { if (!this.chatting()) toggleIdeas(); });
    // Player groups: invite nearby heroes / leave (P or the Group button)
    this.party = new PartyUI((type, msg) => this.room?.send(type, msg), () => (this.room?.state as any)?.players, () => this.me,
      (id) => { this.party?.close(); this.trade?.askTo(id); });
    const toggleParty = () => { if (!this.party!.open) this.closeMenus(); this.party!.toggle(); };
    this.input.keyboard!.on("keydown-P", () => { if (!this.chatting()) toggleParty(); });
    menuButton("partybtn", toggleParty);
    // Patch notes: what changed in each update (N, or News in the Esc game menu)
    const toggleNews = () => { if (!this.patchNotes!.open) this.closeMenus(); this.patchNotes!.toggle(); };
    const toggleMusic = () => { const open = musicPanelOpen(); this.closeMenus(); if (!open) showMusicPanel(true); };
    this.gameMenu = new GameMenu([ // before the patch notes: it holds their badge
      { id: "music", label: `${icon("note")}Music &amp; sound`, onClick: toggleMusic },
      { id: "ideas", label: `${icon("candle")}Ideas board`, key: "I", onClick: toggleIdeas },
      { id: "news", label: `${icon("scroll")}News`, key: "N", onClick: toggleNews },
      { id: "barnums", label: `${icon("potion")}Bar numbers on / off`, onClick: () => this.resBars?.toggleNumbers() },
      { id: "quit", label: `${icon("fire")}Save and return to start screen`, onClick: () => void this.saveAndQuit() },
    ]);
    this.patchNotes = new PatchNotesPanel(toggleNews);
    this.input.keyboard!.on("keydown-N", () => { if (!this.chatting()) toggleNews(); });
    this.setupChat();
    this.setupPointer();

    setLoading("Joining Oakvale", 0.5);
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = import.meta.env.DEV ? `${proto}://${location.hostname}:2567` : `${proto}://${location.host}`;
    try {
      this.room = await new Client(url).joinOrCreate("town", this.opts);
    } catch (e: any) {
      const msg = typeof e?.message === "string" && e.message && !/websocket|connect/i.test(e.message) ? e.message : "Could not connect to server.";
      document.getElementById("status")!.textContent = msg;
      document.getElementById("play")!.removeAttribute("disabled");
      hideLoading(true); // back to the login form
      this.game.destroy(true);
      return;
    }
    this.me = this.room.sessionId;
    document.getElementById("join")!.hidden = true;
    (document.getElementById("join") as HTMLElement).style.display = "none";
    document.getElementById("hud")!.hidden = false;
    this.minimap = new Minimap(document.getElementById("minimap") as HTMLCanvasElement, this.opts.name);
    this.npcs = new NpcLayer(this, (type, msg) => this.room.send(type, msg));
    // Morwen's camp and Brann's forge after dusk: coal glow under her brew, lantern light in the tent doorway
    for (const d of NPC_DECOR) {
      if (d.prop === "wc_rig") this.details?.addLight(d.x * TILE, d.y * TILE, 0xff6a2a, 1.5, 0.6, 0.15, 9, -7);
      if (d.prop === "wc_tent") this.details?.addLight(d.x * TILE, d.y * TILE, 0xffa040, 1.3, 0.5, 0.1, 17, 3);
      // Brann's forge: the coal bed and the ash-pit arch; a faint glow off the blade cooling on the anvil
      if (d.prop === "sm_forge") this.details?.addLight(d.x * TILE, d.y * TILE, 0xff7a2a, 2.1, 0.7, 0.2, FORGE_FIRE[1], FORGE_FIRE[0]);
      if (d.prop === "sm_anvil") this.details?.addLight(d.x * TILE, d.y * TILE, 0xff6a2a, 0.35, 0.3, 0.1, ANVIL_TOP, 2);
    }
    this.villagers = new Villagers(this); // townsfolk idling on the square
    this.watch = new WatchLayer(this, (this.room.state as any).watch); // watchmen at the gates
    this.torches = new GateTorches(this); // torches at the gates, lit by the watch at dusk
    this.watch.torches = this.torches;
    this.room.onMessage("quest", (msg) => this.npcs?.onQuest(msg));
    this.room.onMessage("questuse", ({ id }) => this.npcs?.objects.burst(id));
    this.room.onMessage("shop", (msg) => this.npcs?.onShop(msg));
    this.chests = new ChestLayer(this, (type, msg) => this.room.send(type, msg));
    this.room.onMessage("chests", (left) => this.chests?.setOpened(left));
    this.room.onMessage("chestopen", ({ id, refill }) => this.chests?.opened(id, refill));
    this.room.onMessage("chestlocked", () => {}); // the prompt already says why
    this.room.send("chests"); // which chests this account already emptied
    // Trading between players and the account stash (client/src/trade.ts)
    const myState = () => (this.room?.state as any)?.players?.get(this.me);
    this.trade = new TradeUI(this, (type, msg) => this.room.send(type, msg), myState);
    this.stash = new StashUI(this, (type, msg) => this.room.send(type, msg), myState);
    this.room.onMessage("tradeask", ({ from, name, ms }) => this.trade?.asked(from, name, ms));
    this.room.onMessage("tradeview", (v) => { if (!this.trade?.open) this.closeMenus(); this.trade?.show(v); });
    this.room.onMessage("tradeend", ({ text, ok }) => this.trade?.ended(text, ok));
    this.room.onMessage("tradenote", ({ text }) => this.trade?.notice(text));
    this.room.onMessage("stashview", (v) => { if (!this.stash?.open) this.closeMenus(); this.stash?.show(v); });
    // The Whispering Woods shrine: one for everyone, spent for a while after each prayer
    this.shrine = new ShrineLayer(this, (type, msg) => this.room.send(type, msg), PIXEL_FONT);
    this.room.onMessage("shrine", ({ left, by, boon }) => {
      this.shrine?.setLeft(left);
      if (!boon) return;
      this.shrine?.used();
      const e = this.entities.get(by);
      if (!e) return;
      const text = boon === "speed" ? `${BOON_NAMES.speed} (${Math.round(WIND_BLESSING.ms / 1000)}s)` : boon === "heal" ? `${BOON_NAMES.heal}!` : `${BOON_NAMES.xp}!`;
      this.floatText(e.sprite.x, e.sprite.y - 22, text, "#9cf3dc", PIXEL_FONT);
    });
    this.room.send("shrine"); // is the shrine spent right now?
    // Portal stones: woken one by one on foot, then fast travel between the woken ones
    this.portals = new PortalLayer(this, (type, msg) => this.room.send(type, msg));
    this.room.onMessage("portals", ({ found, woke }) => this.portals?.setFound(found ?? [], woke));
    this.room.onMessage("travel", ({ id, from, to, x, y }) => {
      this.portals?.travelled(from, to);
      const e = this.entities.get(id);
      if (!e) return;
      e.sprite.setPosition(x, y); e.tx = x; e.ty = y; e.lastX = x; e.lastY = y; // a jump, not a walk
      if (id === this.me) { this.portals?.close(); this.cameras.main.fadeIn(900, 40, 14, 4); } // a warm flash while the new place is drawn
    });
    this.room.onMessage("travelno", () => {
      const e = this.entities.get(this.me);
      if (e) this.floatText(e.sprite.x, e.sprite.y - 22, "Not while fighting", "#ffa22e", PIXEL_FONT);
    });
    this.room.send("portals"); // which stones this hero has woken
    afterLoading(() => this.patchNotes?.announce());
    // A new hero's guided first quest (First Steps) shows its banner once the loading screen is gone
    afterLoading(() => this.room?.send("tutorial"));
    this.dial = new DayDial(document.getElementById("daydial") as HTMLCanvasElement);

    this.room.onStateChange(() => { patchSeq++; });
    const players = (this.room.state as any).players;
    players.onAdd((p: any, id: string) => {
      this.addEntity(id, p);
      p.onChange(() => {
        const e = this.entities.get(id);
        if (!e) return;
        e.tx = p.x; e.ty = p.y;
        pushSnap(e, p.x, p.y);
        // Snap on respawn / large correction
        if (Math.hypot(e.sprite.x - p.x, e.sprite.y - p.y) > 48) { e.sprite.setPosition(p.x, p.y); e.snaps = [{ t: patchTime(), x: p.x, y: p.y }]; }
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
        pushSnap(e, m.x, m.y);
        // A respawned Mother Blob can come back at another level, a skeleton with another weapon
        if (m.kind === "motherblob" || m.kind === "skeleton" || m.kind === "bandit" || m.kind === "demon") {
          const key = mobTexture(this, m.kind, m.level, m.weapon, m.bones);
          if (e.sprite.texture.key !== key) { e.sprite.setTexture(key, 0); this.perch(e, m); }
        }
        if (Math.hypot(e.sprite.x - m.x, e.sprite.y - m.y) > 48 && !(this.time.now < (e.leapUntil ?? 0))) { e.sprite.setPosition(m.x, m.y); e.snaps = [{ t: patchTime(), x: m.x, y: m.y }]; }
        if ((m.merged || 1) !== (e.merged ?? 1)) this.growMob(e, m);
      });
    });
    mobs.onRemove((_m: any, id: string) => this.removeEntity(id));

    const shots = (this.room.state as any).projectiles;
    shots.onAdd((s: any, id: string) => {
      const size = s.size || 1;
      // Every kind has its own look, trail and impact in skillfx.ts; a plain fireball is the fallback
      const g = this.fx.addShot(id, s) ?? this.add.circle(s.x, s.y, 2.5 * size, 0xff9f1c).setStrokeStyle(1, 0xffe066).setDepth(9000);
      const shot = { g, tx: s.x, ty: s.y, at: this.time.now, dx: s.vx ?? 0, dy: s.vy ?? 0, spd: 0 };
      this.shots.set(id, shot);
      s.onChange(() => {
        // Learn the flight speed from the server updates so the shot can glide between them (see update)
        const now = this.time.now, gap = now - shot.at;
        if (gap > 5) {
          const v = Math.hypot(s.x - shot.tx, s.y - shot.ty) / (gap / 1000);
          shot.spd = shot.spd ? shot.spd * 0.5 + v * 0.5 : v;
        }
        shot.tx = s.x; shot.ty = s.y; shot.at = now; shot.dx = s.vx ?? shot.dx; shot.dy = s.vy ?? shot.dy;
      });
    });
    shots.onRemove((_s: any, id: string) => { this.shots.get(id)?.g.destroy(); this.shots.delete(id); this.fx.removeShot(id); });
    // Skill ground effects (shared/skills.ts fields)
    const fields = (this.room.state as any).fields;
    fields?.onAdd((f: any, id: string) => this.fx.addField(id, f));
    fields?.onRemove((_f: any, id: string) => this.fx.removeField(id));

    const items = (this.room.state as any).items;
    items.onAdd((it: any, id: string) => {
      if (it.kind === "quest" && it.owner !== this.room.sessionId) return; // someone else's quest drop
      const gear = it.kind === "gear" && gearDef(it.gear);
      const img = gear
        ? this.add.image(it.x, it.y, "gear_icons", baseId(it.gear)).setScale(0.6 / ART_K).setDepth(it.y - 8)
        : this.add.image(it.x, it.y, itemTexture(this, it.kind === "quest" ? `q_${it.gear}` : it.kind === "potion" || it.kind === "mpotion" ? potionTex(it.kind, Number(it.gear) || 0) : it.kind)).setDepth(it.y - 8);
      if (it.kind === "quest") {
        // Quest drops glow so they stand out from the gold
        const glow = this.add.circle(it.x, it.y, 6, 0xffd166, 0.3).setDepth(it.y - 9).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: glow, scale: 1.4, alpha: 0.1, duration: 600, yoyo: true, repeat: -1 });
        img.once("destroy", () => glow.destroy());
      }
      const rarity = gear ? itemRarity(it.gear) : 0;
      if (rarity > 0) this.lootGlow(img, it.x, it.y, rarity, it.y);
      // Gentle bob so loot catches the eye
      this.tweens.add({ targets: img, y: it.y - 2, duration: 500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.items.set(id, img);
    });
    items.onRemove((_it: any, id: string) => { this.items.get(id)?.destroy(); this.items.delete(id); });
    // Equipping an item the hero isn't strong enough for yet (item level / stat requirements, shared/gear.ts)
    this.room.onMessage("gearno", ({ text }) => {
      const me = this.entities.get(this.me);
      if (me) this.floatText(me.sprite.x, me.sprite.y - me.top - 6, text, "#ff6b6b", PIXEL_FONT);
      this.feed(text);
    });
    this.room.onMessage("pickup", ({ kind, amount, x, y, gear, name }) => {
      if (kind === "quest") {
        this.floatText(x, y - 6, `+1 ${QUEST_ITEMS[gear]?.name ?? ""}`, "#ffd166", PIXEL_FONT);
        return;
      }
      if (kind === "gear") {
        this.floatText(x, y - 6, `+${name}`, itemColor(gear), PIXEL_FONT);
        this.feed(`Found ${name}! Press G to equip`);
        return;
      }
      this.floatText(x, y - 6, kind === "gold" ? `+${amount} gold` : `+${amount > 1 ? `${amount} ` : ""}${name || (kind === "mpotion" ? "mana potion" : "potion")}`,
        kind === "gold" ? "#ffc93c" : kind === "mpotion" ? "#8ab4ff" : "#ff8fa3", PIXEL_FONT);
    });
    this.room.onMessage("heal", ({ id, amount }) => {
      const e = this.entities.get(id);
      if (e) this.floatText(e.sprite.x, e.sprite.y - 14, `+${amount}`, "#7cfc00");
    });
    this.room.onMessage("mana", ({ id, amount }) => {
      const e = this.entities.get(id);
      if (e) this.floatText(e.sprite.x, e.sprite.y - 14, `+${amount} mana`, "#8ab4ff", PIXEL_FONT);
    });

    // A Mother Blob budding a blobling: quick wobble
    // Healer blob mends another blob: green beam and a "+N" in the pixel font
    this.room.onMessage("blobheal", ({ from, to, amount }) => {
      const a = this.entities.get(from), b = this.entities.get(to);
      if (!b) return;
      if (a && a !== b) {
        const beam = this.add.graphics().setDepth(20000);
        beam.lineStyle(1, 0x7cfc00, 0.9).lineBetween(a.sprite.x, a.sprite.y - 6, b.sprite.x, b.sprite.y - 6);
        this.tweens.add({ targets: beam, alpha: 0, duration: 450, onComplete: () => beam.destroy() });
      }
      this.floatText(b.sprite.x, b.sprite.y - b.top - 6, `+${amount}`, "#7cfc00", PIXEL_FONT);
    });
    // Mother Blob special: she swells up (wind-up), then a shockwave ring; the slam also shakes the screen
    // The elemental blobs' moves: venom splurt, frost nova, fire breath, storm sparks (client/src/elemFx.ts)
    bindElemFx(this.room, {
      scene: this, fx: this.fx, ent: (id) => this.entities.get(id),
      say: (x, y, text, color) => this.floatText(x, y, text, color, PIXEL_FONT),
      squash: (id, kx, ky, ms) => { const e = this.entities.get(id); if (e) this.squash(e, kx, ky, ms / 2); },
    });
    this.room.onMessage("mbwind", ({ id, kind, ms }) => {
      const e = this.entities.get(id);
      if (!e) return;
      const b = this.bodyScale(e);
      this.tweens.add({ targets: e.sprite, scaleX: b * (kind === "slam" ? 1.3 : 1.15), scaleY: b * (kind === "slam" ? 1.3 : 0.85), duration: ms, yoyo: false,
        onComplete: () => e.sprite.setScale(b) });
      this.floatText(e.sprite.x, e.sprite.y - e.top - 6, kind === "slam" ? "GROUND SLAM!" : "BOUNCE!", kind === "slam" ? "#ff5252" : "#ffb74d", PIXEL_FONT);
    });
    this.room.onMessage("mbhit", ({ kind, x, y, r }) => {
      const ring = this.add.circle(x, y, 4).setStrokeStyle(kind === "slam" ? 3 : 2, kind === "slam" ? 0xff5252 : 0xffb74d, 0.9).setDepth(20000);
      this.tweens.add({ targets: ring, radius: r, alpha: 0, duration: kind === "slam" ? 420 : 300, onComplete: () => ring.destroy() });
      const me = this.entities.get(this.me);
      if (me && Math.hypot(me.sprite.x - x, me.sprite.y - y) < r * 2.5) quake(this, kind === "slam" ? 260 : 120, kind === "slam" ? 0.008 : 0.004);
    });
    // Necromancer: arms up while casting. Death Circle marks the ground first (a flat painting, so it lies on the iso ground too)
    this.room.onMessage("necrowind", ({ id, kind, ms, x, y, r }) => {
      const e = this.entities.get(id);
      if (e) {
        this.squash(e, 1, 1.12, ms / 2);
        this.floatText(e.sprite.x, e.sprite.y - e.top - 6, kind === "circle" ? "DEATH CIRCLE!" : "RISE!", kind === "circle" ? "#b388ff" : "#7dff6a", PIXEL_FONT);
      }
      if (kind !== "circle") return;
      const g = this.add.graphics().setDepth(2);
      const t0 = this.time.now;
      const draw = () => {
        const f = Math.min(1, (this.time.now - t0) / ms);
        g.clear().fillStyle(0x4a148c, 0.25).fillCircle(x, y, r).lineStyle(1.5, 0xb388ff, 0.9).strokeCircle(x, y, r);
        g.fillStyle(0x7c4dff, 0.35).fillCircle(x, y, r * f); // fills up until it goes off
      };
      draw();
      const ev = this.time.addEvent({ delay: 30, loop: true, callback: draw });
      this.time.delayedCall(ms, () => { ev.remove(); g.destroy(); });
    });
    this.room.onMessage("necrohit", ({ x, y, r }) => {
      const g = this.add.graphics().setDepth(2);
      g.fillStyle(0xb388ff, 0.7).fillCircle(x, y, r);
      this.tweens.add({ targets: g, alpha: 0, duration: 450, onComplete: () => g.destroy() });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2, d = Math.random() * r;
        this.burst(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.9, 3, 0x7c4dff, 380);
      }
      const me = this.entities.get(this.me);
      if (me && Math.hypot(me.sprite.x - x, me.sprite.y - y) < r * 2.5) quake(this, 220, 0.007);
    });
    // Skeletons climb out of the ground: green flash and dust where each one appears
    // Bone ritual: the skeletons fly apart, their bones arc through the air, land and slide into a pentagram that glows
    this.room.onMessage("ritual", (msg) => this.boneRitual(msg));
    // the skeletons give up the fight and walk to the points of a star: a faint circle draws itself on the ground
    this.room.onMessage("ritualcall", ({ x, y, r, ms }) => {
      this.floatText(x, y - 30, "BONE RITUAL!", "#ff5233", PIXEL_FONT);
      const g = this.add.graphics().setDepth(2), clock = { t: 0 };
      this.tweens.add({
        targets: clock, t: 1, duration: ms + 300, onComplete: () => g.destroy(),
        onUpdate: () => {
          const k = Math.min(1, clock.t * 1.15);
          g.clear().lineStyle(1, 0xff5252, 0.25 + 0.2 * Math.sin(clock.t * 40));
          g.beginPath(); g.arc(x, y, r * 1.15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.strokePath();
        },
      });
    });
    this.room.onMessage("demonrise", ({ id, x, y }) => {
      this.burst(x, y, 10, 0xff3d00, 520); this.burst(x, y - 10, 6, 0x2a0a0a, 640);
      const e = this.entities.get(id);
      if (e) { const b = this.bodyScale(e); this.tweens.add({ targets: e.sprite, scaleX: b, scaleY: { from: b * 0.2, to: b }, duration: 650, ease: "Back.Out" }); }
      this.floatText(x, y - 56, "BONE DEMON!", "#ff5233", PIXEL_FONT);
      const me = this.entities.get(this.me);
      if (me && Math.hypot(me.sprite.x - x, me.sprite.y - y) < 400) quake(this, 380, 0.01);
    });
    this.room.onMessage("demonwind", ({ id, ms }) => {
      const e = this.entities.get(id);
      if (!e) return;
      this.squash(e, 1, 1.12, ms * 0.8);
      e.sprite.setTint(0xff7043); this.time.delayedCall(ms, () => e.sprite.clearTint());
      this.floatText(e.sprite.x, e.sprite.y - e.top - 6, "HELLFIRE!", "#ff7043", PIXEL_FONT);
    });
    this.room.onMessage("demonfire", ({ x, y, r }) => {
      const g = this.add.graphics().setDepth(2); // scorched ground (flat, lies on the iso ground)
      g.fillStyle(0xff5722, 0.55).fillCircle(x, y, r).fillStyle(0xffc107, 0.5).fillCircle(x, y, r * 0.55);
      this.tweens.add({ targets: g, alpha: 0, duration: 650, onComplete: () => g.destroy() });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, d = r * (0.4 + Math.random() * 0.6);
        this.burst(x + Math.cos(a) * d, y + Math.sin(a) * d, 3 + Math.random() * 3, i % 2 ? 0xff7043 : 0xffca28, 420);
      }
      const me = this.entities.get(this.me);
      if (me && Math.hypot(me.sprite.x - x, me.sprite.y - y) < r * 3) quake(this, 260, 0.009);
    });
    // Bone Demon grabs a skeleton, lifts it, snaps it in two between its fists and straps the piece on
    this.room.onMessage("demonrip", (msg) => this.demonRip(msg));
    this.room.onMessage("demonharvest", ({ id, bones }) => {
      const e = this.entities.get(id);
      if (!e) return;
      const key = mobTexture(this, "demon", e.state.level, "", bones);
      if (e.sprite.texture.key !== key) e.sprite.setTexture(key, e.sprite.frame.name as any);
      e.sprite.setTint(0xfff4dc); this.time.delayedCall(60, () => e.sprite.clearTint());
      this.burst(e.sprite.x, e.sprite.y - e.top * 0.5, 6, 0xe8e2d0, 260);
      this.squash(e, 1.1, 0.92, 120);
      this.floatText(e.sprite.x, e.sprite.y - e.top - 6, ["", "BONE PAULDRONS!", "RIB CUIRASS!", "BONE BLADE!", "SKULL CROWN!"][Math.min(4, bones)], "#e8e2d0", PIXEL_FONT);
    });
    this.room.onMessage("demongrab", ({ id, from: [fx, fy] }) => {
      this.burst(fx, fy - 8, 6, 0xe8e2d0, 260);
      const e = this.entities.get(id);
      if (e) { this.squash(e, 0.9, 1.15, 110); this.floatText(e.sprite.x, e.sprite.y - e.top - 6, "THROW!", "#ff7043", PIXEL_FONT); }
    });
    // By day the dead lie back down in the earth (shared/daynight.ts): a puff of grave dirt where one stood
    this.room.onMessage("gravesink", ({ x, y }) => { this.burst(x, y, 5, 0x6d5a45, 520); this.burst(x, y - 6, 3, 0xe8e2d0, 380); });
    this.room.onMessage("undeadnight", ({ up }) => {
      this.feed(up ? "Night falls. The dead climb out of their graves..." : "Dawn breaks. The dead sink back into the earth.");
    });
    this.room.onMessage("banish", ({ x, y }) => { this.burst(x, y, 9, 0x4a148c, 600); this.burst(x, y - 12, 6, 0x111111, 700); });
    // A skeleton broke in two: bone chips fly, its upper half drags on
    this.room.onMessage("bonebreak", ({ x, y }) => {
      this.burst(x, y - 6, 6, 0xe8e2d0, 380);
      this.burst(x, y, 3, 0x8d8577, 260);
    });
    this.room.onMessage("necroraise", ({ pts }) => {
      for (const [x, y] of pts as [number, number][]) {
        this.burst(x, y, 4, 0x7dff6a, 420);
        this.burst(x, y + 1, 3, 0x8d6e63, 300);
      }
    });
    // Warrior blob lunges: quick stretch
    this.room.onMessage("blobcharge", ({ id }) => {
      const e = this.entities.get(id);
      if (e) this.squash(e, 1.25, 0.8, 140);
    });
    // ---- Redfang Hollow (shared/bandits.ts) ----
    // A lookout blows the horn: sound rings spread from the tower, the camp is warned
    this.room.onMessage("horn", ({ id, x, y }) => {
      const e = this.entities.get(id);
      const hx = e?.sprite.x ?? x, hy = e?.sprite.y ?? y;
      this.floatText(hx, hy - (e?.top ?? 40) - 6, "HORN!", "#ffb74d", PIXEL_FONT);
      for (let i = 0; i < 3; i++) this.time.delayedCall(i * 260, () => {
        const ring = isoAnchor(this.add.circle(hx, hy, 6).setStrokeStyle(2, 0xffcc80, 0.85).setDepth(20000), { x: hx, y: hy });
        this.tweens.add({ targets: ring, radius: 150, alpha: 0, duration: 1100, onComplete: () => ring.destroy() });
      });
      const me = this.entities.get(this.me);
      if (me && Math.hypot(me.sprite.x - hx, me.sprite.y - hy) < 26 * TILE) this.feed("A horn sounds from Redfang Hollow: the bandits are coming!");
    });
    // Bandits answering the horn or a shout: a red "!" over each
    this.room.onMessage("alert", ({ ids }) => {
      for (const id of ids as string[]) {
        const e = this.entities.get(id);
        if (e && !e.culled) this.floatText(e.sprite.x, e.sprite.y - e.top - 4, "!", "#ff5252", PIXEL_FONT);
      }
    });
    this.room.onMessage("bshout", ({ id }) => {
      const e = this.entities.get(id);
      if (e && !e.culled) this.floatText(e.sprite.x, e.sprite.y - e.top - 6, Phaser.Utils.Array.GetRandom(["TO ME!", "HERE!", "ALARM!"]), "#ffcc80", PIXEL_FONT);
    });
    // Cutthroat dash: a quick lean and a dust puff
    this.room.onMessage("bdash", ({ id }) => {
      const e = this.entities.get(id);
      if (!e) return;
      this.burst(e.sprite.x, e.sprite.y, 3, 0x8d6e63, 260);
      this.tweens.add({ targets: e.sprite, scaleX: e.sprite.scaleX * 1.15, scaleY: e.sprite.scaleY * 0.9, duration: 120, yoyo: true });
    });
    this.room.onMessage("volley", ({ id }) => {
      const e = this.entities.get(id);
      if (e && !e.culled) this.floatText(e.sprite.x, e.sprite.y - e.top - 6, "VOLLEY!", "#e0c080", PIXEL_FONT);
    });
    // Brute Cleave / Chief Sweep / Chief Leap: the ground is marked red until the blow lands
    this.room.onMessage("bwind", ({ id, kind, ms, x, y, r }) => {
      const e = this.entities.get(id);
      if (e) {
        const name = kind === "leap" ? "LEAP!" : kind === "sweep" ? "SWEEP!" : "CLEAVE!";
        this.floatText(e.sprite.x, e.sprite.y - e.top - 6, name, "#ff5252", PIXEL_FONT);
        if (kind !== "leap") this.tweens.add({ targets: e.sprite, scaleY: e.sprite.scaleY * 1.08, duration: ms * 0.8, yoyo: true });
      }
      const g = this.add.graphics().setDepth(2);
      const t0 = this.time.now;
      const draw = () => {
        const f = Math.min(1, (this.time.now - t0) / ms);
        const cx = kind === "leap" ? x : e?.sprite.x ?? x, cy = kind === "leap" ? y : e?.sprite.y ?? y;
        g.clear().fillStyle(0x8b0000, 0.22).fillCircle(cx, cy, r).lineStyle(1.5, 0xff5252, 0.9).strokeCircle(cx, cy, r);
        g.fillStyle(0xff3d2e, 0.3).fillCircle(cx, cy, r * f);
      };
      draw();
      const ev = this.time.addEvent({ delay: 30, loop: true, callback: draw });
      this.time.delayedCall(ms, () => { ev.remove(); g.destroy(); });
    });
    this.room.onMessage("bhit", ({ kind, x, y, r }) => {
      const ring = this.add.circle(x, y, 4).setStrokeStyle(3, kind === "cleave" ? 0xffb74d : 0xff5252, 0.9).setDepth(20000);
      isoAnchor(ring, { x, y });
      this.tweens.add({ targets: ring, radius: r, alpha: 0, duration: 320, onComplete: () => ring.destroy() });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        this.burst(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, 2.5, 0x8d6e63, 340);
      }
      const me = this.entities.get(this.me);
      if (me && Math.hypot(me.sprite.x - x, me.sprite.y - y) < r * 2.5) quake(this, kind === "leap" ? 260 : 140, kind === "leap" ? 0.009 : 0.005);
    });
    // The Hollow King (the first zone's final boss): every move is painted flat on the ground first, then lands.
    // No screen shake or flash (Murat 2026-11-04): the ground marks and dust carry it.
    this.room.onMessage("kingrise", ({ id, x, y }) => {
      this.burst(x, y, 14, 0x9dff6a, 700); this.burst(x, y - 12, 8, 0x1a1420, 800);
      const e = this.entities.get(id);
      if (e) { const b = this.bodyScale(e); this.tweens.add({ targets: e.sprite, scaleX: b, scaleY: { from: b * 0.15, to: b }, duration: 900, ease: "Back.Out" }); }
      this.floatText(x, y - 80, "THE HOLLOW KING RISES!", "#c8ff8a", PIXEL_FONT);
    });
    this.room.onMessage("hkwind", ({ id, kind, ms, x, y, r, inner, pts }) => {
      const e = this.entities.get(id);
      const NAME: Record<string, [string, string]> = { cleave: ["CROWN CLEAVE!", "#ffd27a"], pools: ["GLOAM POOLS!", "#9dff6a"], servants: ["RISE, MY SERVANTS!", "#c8ff8a"], wrath: ["CROWN'S WRATH! GET CLOSE!", "#e0b0ff"] };
      const [label, col] = NAME[kind] ?? ["", "#ffffff"];
      if (e) {
        this.floatText(e.sprite.x, e.sprite.y - e.top - 6, label, col, PIXEL_FONT);
        this.squash(e, 1, kind === "wrath" ? 1.14 : 1.08, ms * 0.8);
      }
      if (kind === "servants") { // green motes gather round his feet
        for (let i = 0; i < 6; i++) this.time.delayedCall(i * (ms / 6), () => { const a = Math.random() * Math.PI * 2; this.burst(x + Math.cos(a) * 40, y + Math.sin(a) * 30, 3, 0x9dff6a, 420); });
        return;
      }
      const g = this.add.graphics().setDepth(2);
      const t0 = this.time.now;
      const draw = () => {
        const f = Math.min(1, (this.time.now - t0) / ms);
        g.clear();
        if (kind === "pools") {
          for (const [px, py] of pts as [number, number][]) {
            g.fillStyle(0x1f4a12, 0.3).fillEllipse(px, py, r * 2, r * 1.8).lineStyle(1.5, 0x9dff6a, 0.9).strokeEllipse(px, py, r * 2, r * 1.8);
            g.fillStyle(0x6fdc3a, 0.35).fillEllipse(px, py, r * 2 * f, r * 1.8 * f);
          }
          return;
        }
        const cx = e?.sprite.x ?? x, cy = e?.sprite.y ?? y;
        if (kind === "wrath") {
          // a ring of ash: all of it hurts except the safe circle close to him
          g.fillStyle(0x2a1238, 0.28).fillCircle(cx, cy, r).lineStyle(1.5, 0xc792ff, 0.9).strokeCircle(cx, cy, r);
          g.lineStyle(2, 0xc792ff, 0.45 + 0.4 * f).strokeCircle(cx, cy, r * Math.max(inner / r, f));
          g.fillStyle(0x0e0a10, 0.0).fillCircle(cx, cy, inner).lineStyle(2, 0xfff0b0, 0.95).strokeCircle(cx, cy, inner);
          return;
        }
        g.fillStyle(0x2a1e08, 0.2).fillCircle(cx, cy, r).lineStyle(1.5, 0xe0b860, 0.85).strokeCircle(cx, cy, r);
        g.fillStyle(0xa8843a, 0.24).fillCircle(cx, cy, r * f);
      };
      draw();
      const ev = this.time.addEvent({ delay: 30, loop: true, callback: draw });
      this.time.delayedCall(ms, () => { ev.remove(); g.destroy(); });
    });
    this.room.onMessage("hkhit", ({ kind, x, y, r, inner, pts }) => {
      if (kind === "servants") {
        for (const [px, py] of pts as [number, number][]) { this.burst(px, py, 7, 0x9dff6a, 520); this.burst(px, py - 4, 5, 0x5d4a3a, 600); }
        return;
      }
      if (kind === "pools") {
        for (const [px, py] of pts as [number, number][]) {
          const g = this.add.graphics().setDepth(2);
          g.fillStyle(0x6fdc3a, 0.6).fillEllipse(px, py, r * 2, r * 1.8);
          this.tweens.add({ targets: g, alpha: 0, duration: 500, onComplete: () => g.destroy() });
          for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; this.burst(px + Math.cos(a) * r * 0.6, py + Math.sin(a) * r * 0.5, 2.5, 0x9dff6a, 420); }
        }
        return;
      }
      const wrath = kind === "wrath";
      const ring = this.add.circle(x, y, wrath ? inner : 4).setStrokeStyle(3, wrath ? 0xc792ff : 0xffd27a, 0.9).setDepth(20000);
      isoAnchor(ring, { x, y });
      this.tweens.add({ targets: ring, radius: r, alpha: 0, duration: wrath ? 520 : 320, onComplete: () => ring.destroy() });
      const n = wrath ? 16 : 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, d = wrath ? inner + (r - inner) * (0.4 + Math.random() * 0.6) : r * 0.7;
        this.burst(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85, 2.5, wrath ? 0x4a3a52 : 0x8d6e63, 380);
      }
    });
    // The chief jumps: he glides to the mark while rising and falling
    this.room.onMessage("chiefleap", ({ id, x, y, ms }) => {
      const e = this.entities.get(id);
      if (!e) return;
      e.leapUntil = this.time.now + ms + 300;
      e.tx = x; e.ty = y;
      const sx = e.sprite.scaleX, sy = e.sprite.scaleY;
      this.tweens.add({ targets: e.sprite, scaleX: sx * 1.3, scaleY: sy * 1.3, duration: ms / 2, yoyo: true, ease: "Sine.easeOut", onComplete: () => e.sprite.setScale(sx, sy) });
    });
    // War Cry: the chief roars, his men glow red while it lasts
    this.room.onMessage("warcry", ({ id, ids, ms }) => {
      const e = this.entities.get(id);
      if (e) {
        this.floatText(e.sprite.x, e.sprite.y - e.top - 6, "WAR CRY!", "#ff5252", PIXEL_FONT);
        const ring = isoAnchor(this.add.circle(e.sprite.x, e.sprite.y, 8).setStrokeStyle(3, 0xff3d2e, 0.8).setDepth(20000), { x: e.sprite.x, y: e.sprite.y });
        this.tweens.add({ targets: ring, radius: 110, alpha: 0, duration: 700, onComplete: () => ring.destroy() });
      }
      for (const oid of ids as string[]) { const o = this.entities.get(oid); if (o) o.rallyUntil = this.time.now + ms; }
    });
    // The chief calls his men: two cutthroats burst out
    this.room.onMessage("reinforce", ({ id, pts }) => {
      const e = this.entities.get(id);
      if (e) this.floatText(e.sprite.x, e.sprite.y - e.top - 6, "TO ARMS!", "#ffb74d", PIXEL_FONT);
      for (const [x, y] of pts as [number, number][]) this.burst(x, y, 4, 0x8d6e63, 380);
    });
    // A hidden monster jumps out of its grave / tree
    // A skeleton at the siege works spots a hero: tools down, "!"
    this.room.onMessage("workdrop", ({ id, work, x, y }) => {
      const e = this.entities.get(id);
      if (!e || e.culled) return;
      this.siege.drop(id, work, e.sprite.x, e.sprite.y);
      this.floatText(e.sprite.x, e.sprite.y - e.top - 4, "!", "#ff5252", PIXEL_FONT);
      e.chaseUntil = this.time.now + 200; // let the little hop play instead of the snapshot playback
      this.tweens.add({ targets: e.sprite, y: { from: e.sprite.y - 3, to: e.sprite.y }, duration: 180, ease: "Quad.easeIn" });
    });
    this.room.onMessage("ambush", ({ id, x, y, victim }) => {
      const e = this.entities.get(id);
      if (!e) return;
      e.sprite.setPosition(x, y); e.tx = x; e.ty = y; e.snaps = [{ t: patchTime(), x, y }];
      this.floatText(x, y - e.top - 4, "!", "#ff5252");
      const b = this.bodyScale(e);
      this.tweens.add({ targets: e.sprite, scaleX: { from: b * 0.4, to: b }, scaleY: { from: b * 1.6, to: b }, duration: 220, ease: "Back.Out" });
      if (victim === this.me) quake(this, 80, 0.002);
    });
    // Blob merging: the one in danger calls ("MERGE!"), the others rush in and melt into it
    this.room.onMessage("blobcall", ({ id }) => {
      const e = this.entities.get(id);
      if (!e) return;
      this.floatText(e.sprite.x, e.sprite.y - e.top - 6, "MERGE!", "#a5ff6b", PIXEL_FONT);
      this.squash(e, 1, 1.12, 160, 1);
    });
    this.room.onMessage("blobmerge", ({ into, x, y, level }) => {
      const h = this.entities.get(into);
      this.burst(x, y, 4, 0x8bd450, 260);
      if (!h) return;
      this.burst(h.sprite.x, h.sprite.y - 4, 7, 0x8bd450, 360);
      this.floatText(h.sprite.x, h.sprite.y - h.top - 8, `Lv${level}`, "#a5ff6b", PIXEL_FONT);
    });
    this.room.onMessage("brood", ({ id }) => {
      const e = this.entities.get(id);
      if (e) this.squash(e, 1.15, 0.85, 120, 1);
    });
    this.room.onMessage("swing", ({ id, step, variant, ax, ay, w }) => {
      if (id === this.me) this.pointer?.swung(); // the server took the click-attack
      this.showSwing(id, step ?? 0, variant ?? 0, ax, ay, w);
    });
    this.room.onMessage("sfx", (ev) => this.onSkillFx(ev));
    bindSfx(this.room, () => this.me, this.entities as any); // sound effects (client/src/sfx.ts)
    this.room.onMessage("boom", ({ x, y, r, kind, imb }) => this.fx.impact(x, y, kind, r, imb) ||
      (kind === "arrow" || kind === "stone" || kind === "knife" || kind === "bolt" ? this.burst(x, y, 3, 0xd7ccc8, 150)
      : kind === "magicbolt" || kind === "shadowbolt" ? this.burst(x, y, kind === "shadowbolt" ? 5 : 3, kind === "shadowbolt" ? 0x7dff6a : 0x7fe7ff, 220)
      : this.burst(x, y, 5, 0xff9f1c, 220))); // small impact puff only, never the splash area
    this.room.onMessage("dodge", (msg) => this.showDodge(msg));
    this.room.onMessage("rangedshot", ({ id }) => {
      const e = this.entities.get(id);
      if (id === this.me) this.lastRanged = this.time.now;
      if (e?.hero && !e.state.dead) playCharAnim(e.sprite, e.hero, "attack", this.dirOf(e));
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
    this.room.onMessage("hit", ({ id, dmg, blocked, crit, dot, kx, ky, el }) => {
      const e = this.entities.get(id);
      if (!e) return;
      if (id === this.me) this.portals?.hurt();
      // Battle music heat: hits on the hero count most, fights close by count too
      const meE = this.entities.get(this.me);
      if (id === this.me) musicCombat(3);
      else if (e.mob && meE && Math.hypot(e.sprite.x - meE.sprite.x, e.sprite.y - meE.sprite.y) < 10 * TILE) musicCombat(1);
      this.floatText(e.sprite.x, e.sprite.y - 14, crit ? `CRIT -${dmg}` : `-${dmg}`,
        blocked ? "#9ad1ff" : crit ? "#ffd60a" : id === this.me ? "#ff5d5d" : el && ELEMENT_COLORS[el as Element] ? `#${ELEMENT_COLORS[el as Element].toString(16).padStart(6, "0")}` : "#ffffff",
        PIXEL_FONT, crit ? 1.8 : dot ? 0.8 : 1);
      // damage type (shared/elements.ts): embers, frost shards, venom splash or a holy glint on the target
      if (el && ELEMENT_COLORS[el as Element] && el !== "physical") this.gearFx.impact(e.sprite.x, e.sprite.y, e.top, el as Element, !!dot);
      // Hit feel without freezes or camera effects (Murat wants fluid combat): a short white flash,
      // a tiny squash and a 2-3 px nudge away from the blow. Damage over time only flickers.
      e.sprite.setTintFill(0xffffff);
      this.time.delayedCall(dot ? 40 : 70, () => e.sprite.clearTint());
      if (!dot && !blocked) this.flinch(e, kx ?? 0, ky ?? 0, crit);
      // A flinch never cuts a swing short: the attack you started keeps playing, so the fight stays readable
      const cur = e.sprite.anims.currentAnim?.key ?? "";
      const busy = e.sprite.anims.isPlaying && /_(swing|attack|cast)/.test(cur);
      if (e.hero && !e.state.dead && !busy && !this.moves.active(id)) playCharAnim(e.sprite, e.hero, "hit", this.dirOf(e));
      if (e.mob) this.gooSplat(e, dmg);
      if (id === this.me) quake(this, 100, 0.004);
    });
    // Initiative broken (shared/combat.ts): the target is dizzy and can't attack for a moment
    this.room.onMessage("broken", ({ id }) => {
      const e = this.entities.get(id);
      if (!e) return;
      this.floatText(e.sprite.x, e.sprite.y - 22, id === this.me ? "Dizzy!" : "Broken!", "#ffd166");
    });
    this.room.onMessage("kill", ({ killer, victim }) => this.feed(`${killer} slew ${victim}`));
    // No magic in Oakvale (shared/wrath.ts): a hero cast a skill inside the village, or got out again
    this.room.onMessage("wrath", ({ id, on, left, shout }) => {
      const e = this.entities.get(id);
      if (!on && !left) return; // the outlaw died: the death screen says it all
      if (on && e) this.villagers?.shoutNear(e.sprite.x, e.sprite.y, shout);
      if (id === this.me) {
        (this.wrathBanner ??= new WrathBanner()).show(on, shout);
        if (on) quake(this, 300, 0.008);
      } else if (e) this.floatText(e.sprite.x, e.sprite.y - 22, on ? "Outlaw!" : "Pardoned", on ? "#ff5252" : "#d8f0c0", PIXEL_FONT);
    });
    // Our hero died: "You died - killed by <monster or player>" with a respawn countdown
    this.room.onMessage("died", ({ by, ms }) => {
      const el = document.getElementById("death")!;
      el.querySelector(".by")!.textContent = `Killed by ${by}`;
      const back = el.querySelector(".back")!;
      // Wall clock (not the scene clock, which can jump when the tab was in the background)
      const until = Date.now() + (ms ?? 2500);
      el.hidden = false;
      el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
      clearInterval(this.deathTimer);
      const tick = () => {
        const left = Math.max(0, until - Date.now());
        back.textContent = left > 0 ? `Back in ${Math.ceil(left / 1000)}s` : "";
        if (left <= 0) { el.hidden = true; clearInterval(this.deathTimer); }
      };
      tick();
      this.deathTimer = window.setInterval(tick, 100);
    });
    this.room.onMessage("xp", ({ amount, x, y }) => this.floatText(x, y - 10, `+${amount} XP`, "#ffd166"));
    this.room.onMessage("chat", ({ id, name, text }) => this.chatMessage(id, name, text));
    this.room.onMessage("pinvite", ({ from, name, ms }) => this.party?.invited(from, name, ms));
    this.room.onMessage("party", ({ text }) => this.party?.notice(text));
    this.room.onMessage("ideas", (view) => this.ideaBoard?.update(view));
    this.room.onMessage("ideanote", ({ text, ok }) => {
      this.ideaBoard?.note(text, ok);
      if (!this.ideaBoard?.open) this.feed(text);
    });
    this.room.onMessage("ideawin", ({ id, text, author }) => {
      this.feed(`Idea #${id} by ${author} won this hour's vote!`);
      this.chatMessage("", "Ideas", `Idea #${id} "${text.slice(0, 80)}" won this hour's vote! It goes to the builders.`);
    });
    // Server restart (every deploy): show a notice and log back in by itself
    const login = { name: this.opts.name, password: this.opts.password, cls: this.opts.cls, color: this.opts.color };
    noteBuild();
    // Back from a restart: the chat as it was (what changed shows in the patch notes' "New update" notice)
    const chatlog = document.getElementById("chatlog")!;
    for (const t of takeCarried()) { const el = document.createElement("div"); el.textContent = t; chatlog.prepend(el); }
    this.room.onMessage("upgrading", () => upgradeAnnounced());
    this.room.onLeave((code: number) => { if (this.quitting) return; this.feed("Disconnected from server"); reconnectSoon(login, code === 4000); });
    // A connection that silently died (no updates for 15s) is treated the same way
    let lastPatch = Date.now();
    this.room.onStateChange(() => { lastPatch = Date.now(); });
    window.setInterval(() => { if (!this.quitting && Date.now() - lastPatch > 15_000) reconnectSoon(login); }, 3000);
  }

  /**
   * Game keys must never "press" an on-screen button. Some browsers keep focus on a clicked button, and then
   * Space (right-click skill) or Enter would click it again, e.g. opening the bag. Keyboard clicks on HUD buttons are dropped.
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

  /** Send the held movement directions to the server when they change. */
  private sendInput(next: InputState) {
    const i = this.input_;
    if (next.up === i.up && next.down === i.down && next.left === i.left && next.right === i.right) return;
    this.input_ = { ...next };
    this.room?.send("input", { ...next, seq: ++this.seq });
    // Stopping: the server's position still runs behind ours until it has read this stop (see the idle easing)
    if (!next.up && !next.down && !next.left && !next.right) { this.stopSeq = this.seq; this.stoppedAt = this.time.now; }
  }

  /** Mouse controls (client/src/pointer.ts): click to walk, talk, open, attack; right click / Space for the right-click action. */
  private setupPointer() {
    warmPaths(); // the walk grid, while the loading screen is still up
    if (import.meta.env.DEV) (window as any).__town = this; // for local test scripts
    const meEnt = () => {
      const e = this.entities.get(this.me);
      return e && !e.state.dead ? e : undefined;
    };
    const attackable = (id: string, e: Entity) => {
      if (e.state.dead || id === this.me) return false;
      // A monster tucked into a grave or tree can't be hurt (the server skips it): don't let a click swing at it
      if (e.mob) return !e.state.hidden;
      const m = meEnt(); // other heroes only where fighting is allowed
      return !!m && !isSafeZone(e.sprite.x, e.sprite.y) && !isSafeZone(m.sprite.x, m.sprite.y);
    };
    // x/y: where it is drawn (for picking with the mouse); sx/sy: its newest server position (for reach and aim:
    // the drawn one plays ~110 ms behind, so a monster just knocked back still looked in reach)
    // Walking speed from the last server updates (px/s), so arrows and fireballs can be aimed where it will be
    const velocity = (e: Entity): [number, number] => {
      const s = e.snaps, n = s?.length ?? 0;
      if (!s || n < 2 || !e.state.moving) return [0, 0];
      const b = s[n - 1];
      let a = s[n - 2];
      for (let i = n - 2; i >= 0 && b.t - s[i].t < 160; i--) a = s[i];
      const dt = (b.t - a.t) / 1000;
      if (dt < 0.03) return [0, 0];
      let vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
      const v = Math.hypot(vx, vy);
      if (v > 140) { vx *= 140 / v; vy *= 140 / v; } // a knockback is not a walk
      return [vx, vy];
    };
    const asEnemy = (id: string, e: Entity): ClickEnemy => {
      const [vx, vy] = velocity(e);
      return {
        id, x: e.sprite.x, y: e.sprite.y, sx: e.tx ?? e.sprite.x, sy: e.ty ?? e.sprite.y, vx, vy,
        h: e.top || 20, body: e.mob ? mobBody(e.state.kind) : 0, dead: !!e.state.dead, sprite: e.sprite,
      };
    };
    const secondarySkill = () => {
      const p = meEnt()?.state, id = this.rightSkill();
      return p && id ? skillOf(p.cls, id) : undefined;
    };
    const basicReach = (p: any) => {
      const def = attackProfile(p.cls, activeOf(p));
      const k = gearReachMult(activeOf(p));
      // Melee: what the server hits, minus a small margin for the time the click takes to get there
      // (it used to be a few px MORE than the server's reach, so swings at the edge always missed)
      return def.projectile ? def.projectile.range * k * 0.8 : meleeReach(def.attackRange, k) - 4;
    };
    /** How close to an enemy the hero must be for a skill to reach it. */
    const skillReach = (s: SkillDef, p: any) => {
      if (skillTarget(s) === "point") return pointRange(s) * 0.9;
      if (s.shots) return s.shots.range * 0.8;
      if (s.move) return Math.max(basicReach(p), s.move.dist * 0.8);
      if (s.areas?.length) return Math.max(...s.areas.map((a) => (a.ahead ?? 0) + a.r * 0.7));
      if (s.cry) return s.cry.r * 0.8;
      if (s.field && !s.field.follow) return (s.field.ahead ?? 0) + s.field.r * 0.7;
      return basicReach(p);
    };
    this.pointer = new PointerControls(this, {
      me: () => { const e = meEnt(); return e ? { x: e.sprite.x, y: e.sprite.y, sx: e.tx, sy: e.ty, state: e.state } : undefined; },
      enemies: () => {
        const out: ClickEnemy[] = [];
        for (const [id, e] of this.entities) if (!e.culled && attackable(id, e)) out.push(asEnemy(id, e));
        return out;
      },
      enemy: (id) => { const e = this.entities.get(id); return e && attackable(id, e) ? asEnemy(id, e) : undefined; },
      spots: () => {
        const p = meEnt()?.state;
        const out: ClickSpot[] = [];
        for (const n of NPCS) if (npcPresent(n.id, p)) out.push({ x: n.x, y: n.y, w: 18, h: 30, range: TALK_RANGE, act: () => { if (!this.npcs?.isOpen) this.npcs?.interact(); } });
        for (const c of CHESTS) out.push({ x: c.x, y: c.y, w: 22, h: 18, range: CHEST_RANGE, act: () => this.chests?.interact() });
        out.push({ x: SHRINE.x, y: SHRINE.y, w: 26, h: 36, range: SHRINE_RANGE, act: () => this.shrine?.interact() });
        out.push({ x: STASH.x, y: STASH.y, w: 22, h: 18, range: STASH_RANGE, act: () => { if (!this.stash?.open) this.stash?.interact(); } });
        for (const o of PORTALS) out.push({ x: o.x, y: o.y, w: 26, h: 40, range: PORTAL_RANGE, act: () => this.portals?.interact() });
        for (const { o } of usableObjects(p)) out.push({ x: o.x, y: o.y, w: 22, h: 22, range: USE_RANGE, act: () => this.room?.send("use", { id: o.id }) });
        return out;
      },
      speed: () => {
        const p = meEnt()?.state;
        return p ? heroSpeed(p.cls as ClassKind, p.slowed, p.spd ?? 1) * gearSpeedMult(activeOf(p)) : 80;
      },
      shotSpeed: (secondary) => {
        const p = meEnt()?.state;
        if (!p) return 0;
        if (secondary && secondarySkill()) return 0; // skills aim their own way
        return CLASSES[p.cls as ClassKind].projectile?.speed ?? 0;
      },
      reach: (secondary) => {
        const p = meEnt()?.state;
        if (!p) return 0;
        if (!secondary) { const ls = this.leftSkill(); return ls ? skillReach(skillOf(p.cls, ls)!, p) : basicReach(p); }
        const s = secondarySkill();
        return s ? skillReach(s, p) : basicReach(p);
      },
      edgeReach: (secondary) => !secondary || !secondarySkill(),
      fire: (secondary) => {
        if (!secondary) {
          // Left click: the weapon's attack, or the spell / skill chosen for it
          const ls = this.leftSkill();
          if (ls) this.room?.send("cast", ls); else this.room?.send("attack");
          return;
        }
        // Right click / Space: the skill chosen for it, or the weapon's attack
        const rs = this.rightSkill();
        if (rs) this.room?.send("cast", rs); else this.room?.send("attack");
      },
      target: () => { const s = secondarySkill(); return s ? skillTarget(s) : "dir"; },
      pointRange: () => { const s = secondarySkill(); return s ? pointRange(s) : 0; },
      send: (type, msg) => this.room?.send(type, msg),
      stop: () => this.sendInput({ up: false, down: false, left: false, right: false }),
      blocked: () => !this.room || loadingActive(),
    });
  }

  /** True while typing (chat box or the idea box): game keys are off. */
  private chatting() { return document.activeElement === this.chatEl || !!this.ideaBoard?.typing(); }

  private setupChat() {
    window.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      if (this.ideaBoard?.typing()) return; // the idea box handles its own Enter
      if (document.activeElement === this.chatEl) {
        const t = this.chatEl.value.trim();
        if (/^\/ideas?$/i.test(t)) { this.closeMenus(); this.ideaBoard?.show(); }
        else if (t) this.room?.send("chat", t);
        this.chatEl.value = "";
        this.chatEl.blur();
      } else if (this.room) {
        this.chatEl.focus();
      }
      ev.preventDefault();
    });
  }

  /**
   * Magic, Rare and Legendary drops on the ground (shared/gear.ts rarity): a soft glow in the rarity colour,
   * plus a pixel light beam for Rare and Legendary, and a chime when one drops near you.
   */
  private lootGlow(img: Phaser.GameObjects.Image, x: number, y: number, rarity: number, depth: number) {
    const col = RARITY_HEX[rarity];
    const parts: Phaser.GameObjects.GameObject[] = [];
    const glow = this.add.ellipse(x, y + 1, 16, 7, col, 0.55).setDepth(depth - 9).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: glow, scaleX: 1.3, scaleY: 1.3, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 });
    parts.push(glow);
    if (rarity >= 2) {
      const w = rarity === 3 ? 5 : 3, h = rarity === 3 ? 72 : 48;
      const tint = Phaser.Display.Color.IntegerToColor(col).lighten(25).color;
      const beam = this.add.rectangle(x, y, w, h, col, 0.6).setOrigin(0.5, 1).setDepth(depth - 7);
      const core = this.add.rectangle(x, y, 1, h * 0.85, tint, 0.9).setOrigin(0.5, 1).setDepth(depth - 6).setBlendMode(Phaser.BlendModes.ADD);
      isoAnchor(beam, { x, y }); isoAnchor(core, { x, y });
      beam.scaleY = 0; core.scaleY = 0;
      this.tweens.add({ targets: [beam, core], scaleY: 1, duration: 260, ease: "Quad.easeOut" });
      this.tweens.add({ targets: beam, alpha: 0.3, duration: 900, yoyo: true, repeat: -1, delay: 260 });
      parts.push(beam, core);
      // Only drops that appear while you play chime (not the ones already lying there when you join)
      if (this.time.now > 4000) playSfx(rarity === 3 ? "lootLegendary" : "lootRare", x, y);
    }
    img.once("destroy", () => parts.forEach((p) => p.destroy()));
  }

  /**
   * Visual flinch of a hit: the sprite is nudged a few pixels along the hit direction and eases back, with a small
   * squash. Only the drawing moves (an offset on the sprite's origin), so movement smoothing and positions are untouched.
   */
  private flinch(e: Entity, kx: number, ky: number, crit: boolean) {
    const s = e.sprite as Phaser.GameObjects.Sprite & { flinchTween?: Phaser.Tweens.Tween };
    if (s.flinchTween?.isPlaying()) return;
    const px = (crit ? 3 : 2) * kx, py = (crit ? 3 : 2) * ky;
    const ox = s.originX, oy = s.originY, w = s.width || 1, h = s.height || 1;
    if (px || py) {
      s.flinchTween = this.tweens.add({
        targets: s, originX: ox - px / w, originY: oy - py / h, duration: 50, yoyo: true, ease: "Quad.easeOut",
        onComplete: () => s.setOrigin(ox, oy), onStop: () => s.setOrigin(ox, oy),
      });
    }
    if (e.mob) this.squash(e, crit ? 1.12 : 1.06, crit ? 0.88 : 0.94, 60);
  }

  private floatText(x: number, y: number, text: string, color: string, font = PIXEL_FONT, size = 1) {
    const t = this.add.text(x, y, text, {
      fontFamily: font, fontSize: "16px", color, stroke: "#000", strokeThickness: 3,
    }).setOrigin(0.5, 1).setScale(0.25 * size).setResolution(2).setDepth(30000);
    // iso view: callers lift the text above a hero's feet; rise straight up from there on screen
    isoAnchor(t, { x, y: y + 14 });
    if (size > 1) {
      // Big numbers (crits) pop in, then rise
      t.setScale(0.25 * size * 1.4);
      this.tweens.add({ targets: t, scale: 0.25 * size, duration: 120, ease: "Back.easeOut" });
    }
    this.tweens.add({ targets: t, y: y - 10, alpha: 0, duration: size > 1 ? 1000 : 800, delay: size > 1 ? 150 : 0, onComplete: () => t.destroy() });
  }

  /** Merged blob: paint the swallowed blobs' colours, eyes and mouths over its body (follows squash tweens). */
  private drawBlobParts(e: Entity, id: string, p: any, x: number, y: number) {
    if (e.partsKey !== p.parts) { e.partsKey = p.parts; e.partsLayout = blobPartsLayout(id, String(p.parts).split(",")); }
    const g = (e.parts ??= isoAnchor(this.add.graphics(), e.sprite) as Phaser.GameObjects.Graphics);
    g.clear().setVisible(true).setDepth(e.sprite.depth + 0.5);
    const above = e.sprite.displayHeight * e.sprite.originY; // frame height above the feet
    const hw = e.sprite.displayWidth * 0.38, hh = above * 0.26, cy = y - above * 0.3; // body ellipse
    const flip = e.sprite.flipX ? -1 : 1, back = this.dirOf(e) === "up";
    for (const b of e.partsLayout!) {
      const px = x + b.u * hw * flip, py = cy + b.v * hh, r = b.r * hw;
      if (b.kind === "patch") {
        g.fillStyle(b.col, 0.6).fillEllipse(px, py, r * 2, r * 1.5);
        g.fillStyle(0xffffff, 0.18).fillEllipse(px - r * 0.3, py - r * 0.3, r * 0.7, r * 0.45); // wet shine
      } else if (back) continue;
      else if (b.kind === "eye") {
        const blink = (this.time.now + b.u * 9000 + b.v * 5000) % 4200 < 140;
        g.fillStyle(b.col).fillCircle(px, py, r * 1.25);
        if (blink) { g.fillStyle(0x1a1a1a).fillRect(px - r, py - 0.25, r * 2, 0.5); continue; }
        g.fillStyle(0xffffff).fillCircle(px, py, r);
        g.fillStyle(0x111111).fillCircle(px + r * 0.25 * flip, py + r * 0.15, r * 0.5);
      } else {
        g.fillStyle(0x2a0d12, 0.9).fillEllipse(px, py, r * 2, r * 0.9);
        g.fillStyle(0xffffff).fillRect(px - r * 0.45, py - r * 0.45, r * 0.3, r * 0.35).fillRect(px + r * 0.2, py - r * 0.45, r * 0.3, r * 0.35); // teeth
      }
    }
  }

  /** Merged blobs (MERGE): bigger sprite, label and HP bar for every blob inside. */
  private growMob(e: Entity, p: any) {
    const n = p.merged || 1, prev = e.merged ?? 1;
    e.merged = n;
    const grow = 1 + MERGE.growPerBlob * (n - 1) * (p.kind === "motherblob" ? 0.5 : 1), base = MOB_LOOK[p.kind]?.scale ?? 1;
    e.top = (MOB_LOOK[p.kind]?.top ?? 14) * grow;
    e.base = base * grow;
    this.tweens.killTweensOf(e.sprite);
    if (n > prev) this.tweens.add({ targets: e.sprite, scaleX: base * grow, scaleY: base * grow, duration: 260, ease: "Back.Out" });
    else e.sprite.setScale(base * grow);
  }

  /** Redfang lookouts stand up on their watchtower's platform: drawn lifted, label and HP bar above them. */
  private perch(e: Entity, p: any) {
    const base = MOB_LOOK[p.kind]?.oy ?? 0.85, top = MOB_LOOK[p.kind]?.top ?? 14;
    const up = p.kind === "bandit" && p.weapon === "lookout";
    e.sprite.setOrigin(0.5, base + (up ? PERCH_LIFT / e.sprite.frame.height : 0));
    e.top = top + (up ? PERCH_LIFT : 0);
  }

  private addEntity(id: string, p: any, mob = false) {
    if (mob) {
      const sprite = this.add.sprite(p.x, p.y, mobTexture(this, p.kind, p.level, p.weapon, p.bones), 0).setOrigin(0.5, MOB_LOOK[p.kind]?.oy ?? 0.85)
        .setScale(MOB_LOOK[p.kind]?.scale ?? 1);
      if (p.kind === "crawler" && sprite.texture.key.startsWith("mob_skeleton")) sprite.setCrop(0, 0, sprite.frame.width, sprite.frame.height * CRAWL_CROP); // legs gone
      // The level tag is made when the monster comes on screen (see update): thousands of text canvases would cost a lot
      this.entities.set(id, { sprite, bar: isoAnchor(this.add.graphics(), sprite) as Phaser.GameObjects.Graphics, tx: p.x, ty: p.y, snaps: [{ t: patchTime(), x: p.x, y: p.y }], state: p, mob, top: MOB_LOOK[p.kind]?.top ?? 14 });
      if ((p.merged || 1) > 1) this.growMob(this.entities.get(id)!, p);
      this.perch(this.entities.get(id)!, p);
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
    isoAnchor(label, sprite);
    const bar = isoAnchor(this.add.graphics(), sprite) as Phaser.GameObjects.Graphics;
    const gear = hero ? new GearLayer(this, hero) : undefined;
    this.entities.set(id, { sprite, label, bar, tx: p.x, ty: p.y, snaps: [{ t: patchTime(), x: p.x, y: p.y }], state: p, mob, hero, gear, top: hero ? HERO_TOP : 14 });
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
    this.siege?.clear(id);
    e.sprite.destroy(); e.label?.destroy(); e.bar.destroy(); e.parts?.destroy(); e.bubble?.destroy(); e.shield?.destroy(); e.gear?.destroy();
    this.entities.delete(id);
  }

  /** Facing to draw: the server's direction, or in the iso view the direction on screen. */
  private dirOf(e: Entity): any {
    if (!ISO) return e.state.dir;
    return e.vdir ?? this.worldToScreenDir(e.state.dir, !!e.hero);
  }

  /** Heroes face 8 ways on screen (3/4 sheets), monsters 4. */
  private worldToScreenDir(dir: string, eight = false): string {
    const v = ({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as Record<string, number[]>)[dir] ?? [0, 1];
    return (eight ? screenDir8 : screenDir)(v[0], v[1], dir);
  }

  /** Animation for an attack: finisher = attack3, normal hits = swing1..4 (falls back to attack/attack2). */
  private attackAnim(hero: CharacterName, step: number, variant: number): string {
    if (step === 2) return "attack3";
    const swing = `swing${variant + 1}`;
    if (this.anims.exists(`${hero}_${swing}_down`)) return swing;
    return variant % 2 ? "attack2" : "attack";
  }

  private showSwing(id: string, step: number, variant: number, ax?: number, ay?: number, w?: string) {
    const e = this.entities.get(id);
    if (!e) return;
    const dir = e.state.dir as string;
    if (typeof ax === "number" && typeof ay === "number") e.vdir = (e.hero ? screenDir8 : screenDir)(ax, ay, e.vdir ?? dir);
    if (e.hero) { this.moves.stop(id, e); playCharAnim(e.sprite, e.hero, this.attackAnim(e.hero, step, variant), this.dirOf(e)); }
    if (e.mob) e.strikeUntil = this.time.now + 240;
    // Aim can be diagonal (the server sends it); mobs and old messages fall back to the facing direction
    const off = typeof ax === "number" && typeof ay === "number" ? [ax, ay]
      : { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir] ?? [0, 1];
    // The main-hand weapon decides the attack (shared/weapons.ts); the server says which one swung
    const cls = e.mob ? undefined : (isWeaponType(w) ? profileOf(w) : attackProfile(e.state.cls, activeOf(e.state)));
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
    if (cls) this.gearFx.swing(e, step, off[0], off[1], !!cls.projectile, id === this.me); // item level effects
    if (cls?.projectile) return; // the fireball itself is the visual
    // No hit-area shapes (Murat): the attack animation is the visual; the finisher still shakes the camera
    if (step === 2 && id === this.me) quake(this, 80, 0.003);
  }

  /** A struck blob loses some goo: blobs of slime fly off in little arcs and splat on the ground, then soak away. */
  private gooSplat(e: { sprite: Phaser.GameObjects.Sprite; state: any; top: number }, dmg: number) {
    const k = e.state.kind as string, lvl = e.state.level ?? 1;
    const col = k === "motherblob" ? (lvl >= 10 ? 0x553b96 : lvl >= 5 ? 0x2c8796 : 0x3a9684) : GOO[k];
    if (col === undefined) return;
    const dark = Phaser.Display.Color.ValueToColor(col).darken(25).color;
    const big = k === "motherblob" ? 1.6 : k === "blobling" ? 0.6 : 1;
    const bx = e.sprite.x, by = e.sprite.y, n = Math.min(12, Math.round((4 + dmg / 6) * big));
    for (let i = 0; i < n; i++) {
      const sz = Math.random() < 0.3 ? 2 : 1.5, c = Math.random() < 0.35 ? dark : col;
      const x0 = bx + (Math.random() - 0.5) * 6 * big, y0 = by - e.top * (0.35 + Math.random() * 0.3);
      const dx = (Math.random() - 0.5) * 44 * big, land = by + (Math.random() - 0.3) * 5 * big, peak = 5 + Math.random() * 10 * big;
      const d = this.add.rectangle(x0, y0, sz, sz, c).setDepth(by + 1); // world depth: iso view re-sorts it by the blob's feet
      isoAnchor(d, { x: bx, y: by });
      const ms = 260 + Math.random() * 200;
      this.tweens.addCounter({
        from: 0, to: 1, duration: ms,
        onUpdate: (tw) => { const t = tw.getValue() ?? 0; d.setPosition(x0 + dx * t, y0 + (land - y0) * t - peak * 4 * t * (1 - t)); },
        onComplete: () => {
          // splat: a flat little puddle that stays a moment
          d.setSize(sz + 1 + Math.random() * 2, 1).setDepth(by - 0.5).setAlpha(0.85);
          this.tweens.add({ targets: d, alpha: 0, delay: 500 + Math.random() * 700, duration: 700, onComplete: () => d.destroy() });
        },
      });
    }
    // a wobble of the body as the goo tears off
    if (!this.tweens.isTweening(e.sprite)) this.squash(e, 1.12, 0.86, 70);
  }

  /** A monster's resting scale: its kind's size times its merge growth. */
  private bodyScale(e: { sprite: Phaser.GameObjects.Sprite; state: any; base?: number }) { return e.base ?? MOB_LOOK[e.state?.kind]?.scale ?? 1; }

  /** Squash/stretch a monster from its resting size and back to exactly that size (never drifts, never deflates). */
  private squash(e: { sprite: Phaser.GameObjects.Sprite; state: any; base?: number }, kx: number, ky: number, ms: number, repeat = 0) {
    const b = this.bodyScale(e);
    this.tweens.add({ targets: e.sprite, scaleX: { from: b, to: b * kx }, scaleY: { from: b, to: b * ky }, duration: ms, yoyo: true, repeat, ease: "Quad.easeOut", onComplete: () => e.sprite.setScale(b) });
  }

  /**
   * Bone ritual (server BONES.ritual): each skeleton bursts into bones that fly in arcs (gravity, spin), land a little
   * short, bounce and slide on into place along the lines of a pentagram, skulls on its points; then the star glows
   * until the demon climbs out. Drawn on one flat ground painting, heights lifted straight up the screen.
   */
  private boneRitual({ x, y, r, bones: who, ms }: { x: number; y: number; r: number; bones: [number, number, string?, string?, number?, string?][]; ms: number }) {
    const g = this.add.graphics().setDepth(2);
    const V = [0, 1, 2, 3, 4].map((k) => { const a = -Math.PI / 2 + (k * Math.PI * 2) / 5; return [x + Math.cos(a) * r, y + Math.sin(a) * r * 0.9] as [number, number]; });
    // Murat 2026-11-03: each skeleton leaps from its place at the star into the point in front of it and shatters there
    const LEAP = 420, STAGGER = 160;
    const from: [number, number][] = who.map(([fx, fy], si) => {
      const [vx, vy] = V[si % 5], land: [number, number] = [fx + (vx - fx) * 0.85, fy + (vy - fy) * 0.85];
      this.skeletonLeap(fx, fy, land, who[si], si * STAGGER, LEAP);
      return land;
    });
    const PER = 7; // bones per skeleton: a skull and six long bones
    const long = from.length * (PER - 1), perSeg = Math.ceil(long / 5);
    type Bone = { sx: number; sy: number; lx: number; ly: number; tx: number; ty: number; a0: number; a1: number; spin: number; len: number; skull: boolean; delay: number; fly: number; h: number };
    const list: Bone[] = [];
    let li = 0;
    from.forEach(([fx, fy], si) => {
      for (let b = 0; b < PER; b++) {
        let tx: number, ty: number, a1: number;
        if (b === 0) { [tx, ty] = V[si % 5]; a1 = 0; } // skulls sit on the star's points
        else {
          const seg = li % 5, t = (Math.floor(li / 5) + 0.5) / perSeg; li++;
          const [ax, ay] = V[seg], [bx, by] = V[(seg + 2) % 5];
          tx = ax + (bx - ax) * t; ty = ay + (by - ay) * t; a1 = Math.atan2(by - ay, bx - ax);
        }
        const sx = fx + (Math.random() - 0.5) * 8, sy = fy - 8 + (Math.random() - 0.5) * 8, d = Math.hypot(tx - sx, ty - sy) || 1;
        const slide = 4 + Math.random() * 7; // lands short of its spot and skids on
        list.push({ sx, sy, tx, ty, lx: tx - ((tx - sx) / d) * slide, ly: ty - ((ty - sy) / d) * slide, a0: Math.random() * Math.PI, a1, spin: (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 6),
          len: b === 0 ? 0 : 4 + Math.random() * 3, skull: b === 0, delay: si * STAGGER + LEAP + Math.random() * 60, fly: 260 + d * 2.2, h: 8 + d * 0.25 });
      }
      this.time.delayedCall(si * STAGGER + LEAP, () => this.burst(fx, fy - 8, 7, 0xe8e2d0, 320));
    });
    const SLIDE = 380, settle = Math.max(...list.map((b) => b.delay + b.fly + SLIDE)), glowAt = settle + 100, end = ms + 1600;
    const lift = (px: number, py: number, z: number): [number, number] => (ISO ? [px - z, py - z] : [px, py - z]);
    const clock = { t: 0 };
    this.tweens.add({
      targets: clock, t: end, duration: end, onComplete: () => g.destroy(),
      onUpdate: () => {
        const t = clock.t;
        g.clear();
        g.setAlpha(t > ms ? Math.max(0, 1 - (t - ms) / 1600) : 1);
        // the star lights up once the bones are in place
        if (t > glowAt) {
          const k = Math.min(1, (t - glowAt) / 600), pulse = 0.65 + 0.35 * Math.sin(t / 90);
          g.lineStyle(5, 0xff1744, 0.22 * k * pulse);
          for (let s = 0; s < 5; s++) g.lineBetween(V[s][0], V[s][1], V[(s + 2) % 5][0], V[(s + 2) % 5][1]);
          g.lineStyle(1.5, 0xff5252, 0.85 * k);
          for (let s = 0; s < 5; s++) g.lineBetween(V[s][0], V[s][1], V[(s + 2) % 5][0], V[(s + 2) % 5][1]);
          g.strokeEllipse(x, y, r * 2.3, r * 2.1);
          g.fillStyle(0xff1744, 0.12 * k * pulse).fillEllipse(x, y, r * 2.3, r * 2.1);
        }
        for (const b of list) {
          const u = t - b.delay;
          if (u < 0) continue;
          let px: number, py: number, z = 0, ang: number;
          if (u < b.fly) {
            const v = u / b.fly; // ballistic arc: straight over the ground, a parabola in height
            px = b.sx + (b.lx - b.sx) * v; py = b.sy + (b.ly - b.sy) * v; z = 4 * b.h * v * (1 - v) + 8 * (1 - v);
            ang = b.a0 + b.spin * v;
          } else {
            const v = Math.min(1, (u - b.fly) / SLIDE), ease = 1 - (1 - v) * (1 - v); // friction: fast then slower
            px = b.lx + (b.tx - b.lx) * ease; py = b.ly + (b.ty - b.ly) * ease;
            z = v < 0.35 ? 3 * Math.sin((v / 0.35) * Math.PI) : 0; // one small bounce on landing
            const a = b.a0 + b.spin; ang = a + (b.a1 - a) * ease;
          }
          const [qx, qy] = lift(px, py, z);
          if (z > 0.5) g.fillStyle(0x000000, 0.25).fillEllipse(px, py, 4, 2); // shadow under a bone in the air
          if (b.skull) {
            g.fillStyle(0xe8e2d0).fillCircle(qx, qy, 2.4);
            g.fillStyle(0x1a1a1a).fillRect(qx - 1.3, qy - 0.6, 0.9, 0.9).fillRect(qx + 0.4, qy - 0.6, 0.9, 0.9);
            if (t > glowAt) g.fillStyle(0xff1744, 0.9).fillRect(qx - 1.3, qy - 0.6, 0.9, 0.9).fillRect(qx + 0.4, qy - 0.6, 0.9, 0.9);
          } else {
            const dx = Math.cos(ang) * b.len / 2, dy = Math.sin(ang) * b.len / 2;
            g.lineStyle(1.3, 0xd8d0b8).lineBetween(qx - dx, qy - dy, qx + dx, qy + dy);
            g.fillStyle(0xf0ead8).fillCircle(qx - dx, qy - dy, 0.9).fillCircle(qx + dx, qy + dy, 0.9);
          }
        }
      },
    });
  }

  /** A skeleton (a copy of its sprite; the real one is gone) jumps in an arc, arms flung up, and lands at `to`. */
  private skeletonLeap(fx: number, fy: number, to: [number, number], [, , kind, weapon, level, sid]: [number, number, string?, string?, number?, string?], delay: number, ms: number) {
    const victim = sid ? this.entities.get(sid)?.sprite : undefined;
    const k = kind ?? "skeleton", tex = victim?.texture.key ?? mobTexture(this, k === "crawler" ? "skeleton" : k, level ?? 1, weapon ?? "");
    const sp = this.add.sprite(fx, fy, tex, victim ? victim.frame.name : 0).setOrigin(0.5, victim?.originY ?? MOB_LOOK[k]?.oy ?? 0.85)
      .setScale(Math.abs(victim?.scaleX ?? 1)).setFlipX(to[0] < fx);
    if (victim?.isCropped) sp.setCrop(0, 0, sp.frame.width, sp.frame.height * CRAWL_CROP);
    const lift = (px: number, py: number, z: number): [number, number] => (ISO ? [px - z, py - z] : [px, py - z]);
    const strike = sp.texture.frameTotal > 12, side = Math.abs(to[0] - fx) > Math.abs(to[1] - fy);
    const dirK = side ? "right" : to[1] > fy ? "down" : "up";
    const clock = { t: 0 };
    this.tweens.add({
      targets: clock, t: 1, delay, duration: ms, ease: "Linear",
      onStart: () => { if (strike) sp.setFrame(ATTACK_BASE[dirK]); }, // crouch to spring
      onUpdate: () => {
        const u = clock.t, h = 22 * 4 * u * (1 - u);
        const [qx, qy] = lift(fx + (to[0] - fx) * u, fy + (to[1] - fy) * u, h);
        sp.setPosition(qx, qy).setDepth(qy + 20).setAngle((to[0] < fx ? -1 : 1) * 200 * u * u);
        if (strike && u > 0.15) sp.setFrame(ATTACK_BASE[dirK] + 1); // flung out
      },
      onComplete: () => sp.destroy(),
    });
  }

  /** Bone Harvest timeline (ms, server DEMON.harvest.ripMs/equipMs): reach, lift overhead, snap, press the piece on. */
  private static RIP = { grab: 450, snap: 1150, don: 1600, equip: 1950 };

  /** The demon's sheet frame during its harvest (painted sheets carry 9 harvest frames after the 12). */
  private ripFrame(e: Entity, now: number, dir: string): number {
    if (e.sprite.texture.frameTotal <= 21) return -1;
    const t = now - e.rip!.start, R = TownScene.RIP, di = dir === "down" ? 0 : dir === "up" ? 1 : 2;
    if (t < R.grab) return ATTACK_BASE[dir] + (t < R.grab * 0.45 ? 0 : 1);
    if (t < R.snap) return 12 + di * 3;
    if (t < R.don) return 12 + di * 3 + 1;
    if (t < R.equip + 250) return 12 + di * 3 + 2;
    return -1;
  }

  /** Where the demon's two fists are in this sheet frame, as offsets from its sprite position (screen px). */
  private ripHands(e: Entity, frame: number): [[number, number], [number, number]] | null {
    const meta = this.cache.json.get("hd_mobs")?.[e.sprite.texture.key], hd = meta?.hands?.[frame];
    if (!hd) return null;
    const s = e.sprite, flip = s.flipX ? -1 : 1, ox = meta.w * s.originX, oy = meta.h * s.originY;
    const at = (x: number, y: number): [number, number] => [(x - ox) * flip * Math.abs(s.scaleX), (y - oy) * Math.abs(s.scaleY)];
    return [at(hd[0], hd[1]), at(hd[2], hd[3])];
  }

  /**
   * Bone Harvest (Murat 2026-11-03): the demon reaches for the skeleton and drags it up, holds it overhead while it
   * kicks, snaps it in two between its fists (bone chips, a crack), then presses the pieces onto its body; the worn
   * piece appears on its sheet when the server's "demonharvest" comes (equip).
   */
  private demonRip({ id, sid, from: [fx, fy], kind, weapon, level, piece, ms }: { id: string; sid: string; from: [number, number]; kind: string; weapon: string; level: number; piece: number; ms: number }) {
    const e = this.entities.get(id);
    if (!e) return;
    const R = TownScene.RIP, start = this.time.now;
    e.rip = { start, end: start + ms };
    // face the skeleton (iso: on screen)
    const wx = fx - e.sprite.x, wy = fy - e.sprite.y;
    if (ISO) e.vdir = screenDir(wx, wy, e.vdir ?? e.state.dir);
    const scr = (x: number, y: number): [number, number] => (ISO ? [x - y, (x + y) / 2] : [x, y]);
    const s0 = scr(wx, wy);
    // a copy of the skeleton's own sprite (the real one is gone): whole, then its two halves
    const victim = this.entities.get(sid)?.sprite;
    const tex = victim?.texture.key ?? mobTexture(this, kind === "crawler" ? "skeleton" : kind, level, weapon);
    const sc = victim ? Math.abs(victim.scaleX) : (MOB_LOOK[kind]?.scale ?? 1);
    const make = () => isoAnchor(this.add.sprite(e.sprite.x, e.sprite.y, tex, FRAME_BASE.right).setScale(sc), e.sprite) as Phaser.GameObjects.Sprite;
    const whole = make().setOrigin(0.5, 0.5);
    const fh = whole.frame.height, fw = whole.frame.width;
    const top = make().setOrigin(0.5, 0.27).setCrop(0, 0, fw, fh * 0.5).setVisible(false);
    const low = make().setOrigin(0.5, 0.75).setCrop(0, fh * 0.5, fw, fh * 0.5).setVisible(false);
    if (kind === "crawler") whole.setCrop(0, 0, fw, fh * CRAWL_CROP);
    const chips = this.add.graphics();
    isoAnchor(chips, e.sprite);
    const debris: { x: number; y: number; vx: number; vy: number; h: number; vh: number; a: number; va: number; len: number }[] = [];
    let snapped = false;
    const H = e.sprite.displayHeight * e.sprite.originY;
    const clock = { t: 0 };
    this.tweens.add({
      targets: clock, t: ms, duration: ms,
      onUpdate: () => {
        const t = clock.t, ex = e.sprite.x, ey = e.sprite.y;
        const dir = this.dirOf(e), behind = dir === "up";
        const frame = Number(e.sprite.frame.name);
        const hands = this.ripHands(e, frame) ?? [[-6, -H * 0.8], [6, -H * 0.8]];
        const mid: [number, number] = [(hands[0][0] + hands[1][0]) / 2, (hands[0][1] + hands[1][1]) / 2];
        const d = e.sprite.depth + (behind ? -0.6 : 0.6);
        for (const o of [whole, top, low, chips]) o.setDepth(d);
        if (t < R.snap) {
          // dragged in and lifted: from where it stood to between the fists, turning to lie across them
          const u = Math.min(1, t / R.grab), ease = 1 - (1 - u) * (1 - u);
          const kick = t > R.grab ? Math.sin(t / 45) * 9 * (1 - (t - R.grab) / (R.snap - R.grab) * 0.4) : 0;
          const lift = 8 * Math.sin(u * Math.PI);
          whole.setPosition(ex + s0[0] + (mid[0] - s0[0]) * ease, ey + s0[1] - (fh * sc * 0.5) * (1 - ease) + (mid[1] - s0[1]) * ease - lift)
            .setAngle(90 * ease * (e.sprite.flipX ? -1 : 1) + kick).setFlipX(e.sprite.flipX);
          // a tremble just before it gives
          if (t > R.snap - 220) whole.x += Math.sin(t / 12) * 0.8;
          return;
        }
        if (!snapped) {
          snapped = true; whole.setVisible(false); top.setVisible(true); low.setVisible(true);
          const [cx, cy] = [ex + mid[0], ey + mid[1]];
          this.burst(cx, cy, 5, 0xe8e2d0, 300);
          this.floatText(cx, cy - 10, "CRACK!", "#e8e2d0", PIXEL_FONT);
          // chips fly from the break (height above its feet) and fall around it
          for (let i = 0; i < 9; i++) debris.push({ x: mid[0], y: (Math.random() - 0.5) * 4, vx: (Math.random() - 0.5) * 70, vy: (Math.random() - 0.5) * 24, h: -mid[1], vh: 20 + Math.random() * 45, a: Math.random() * 3, va: (Math.random() - 0.5) * 18, len: 2 + Math.random() * 2.5 });
          const me = this.entities.get(this.me);
          if (me && Math.hypot(me.sprite.x - ex, me.sprite.y - ey) < 260) quake(this, 160, 0.006);
        }
        // the halves in each fist, torn outward; then pressed onto the body until they are worn
        const fl = e.sprite.flipX ? -1 : 1;
        const pull = Math.min(1, (t - R.snap) / 160);
        const into = t > R.don ? Math.min(1, (t - R.don) / (R.equip - R.don)) : 0;
        // where this piece goes on: 1 the shoulders, 2 the chest, 3 the weapon hand, 4 the head
        const W = e.sprite.displayWidth * 0.2;
        const goal = (half: 0 | 1): [number, number] => piece === 1 ? [(half ? 1 : -1) * W, -H * 0.5] : piece === 2 ? [0, -H * 0.4]
          : piece === 3 ? hands[0] : [0, -H * 0.78];
        const place = (o: Phaser.GameObjects.Sprite, h: [number, number], ang: number) => {
          const body = goal(o === top ? 0 : 1);
          const x = h[0] + (body[0] - h[0]) * into, y = h[1] + (body[1] - h[1]) * into;
          o.setPosition(ex + x, ey + y).setAngle(ang * (1 - into * 0.6)).setScale(sc * (1 - into * 0.65)).setAlpha(1 - Math.max(0, into - 0.7) / 0.3).setFlipX(e.sprite.flipX);
        };
        place(top, hands[0], fl * (90 + 45 * pull));
        place(low, hands[1], fl * (90 - 45 * pull));
        // splinters and bone chips falling to the ground
        chips.clear();
        const dt = this.game.loop.delta / 1000;
        for (const b of debris) {
          if (b.h > 0 || b.vh > 0) { b.vh -= 280 * dt; b.h = Math.max(0, b.h + b.vh * dt); b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt; }
          if (b.h <= 0) b.vh = 0; // landed
          const qx = ex + b.x, qy = ey + b.y - b.h, dx = Math.cos(b.a) * b.len / 2, dy = Math.sin(b.a) * b.len / 2;
          chips.lineStyle(1.2, 0xd8d0b8).lineBetween(qx - dx, qy - dy, qx + dx, qy + dy);
        }
        chips.setAlpha(t > ms - 400 ? (ms - t) / 400 : 1);
      },
      onComplete: () => { whole.destroy(); top.destroy(); low.destroy(); chips.destroy(); },
    });
  }

  /**
   * Bone Demon's harvested bones (p.bones, server DEMON.harvest) for the ?pixel=1 look, which has no demon sheets:
   * 1 shoulder plates, 2 a rib cuirass, 3 a bone blade in its hand, 4 a spiked bone crown. (Painted sheets wear them.)
   */
  private drawDemonBones(e: Entity, p: any, x: number, y: number) {
    const g = (e.parts ??= isoAnchor(this.add.graphics(), e.sprite) as Phaser.GameObjects.Graphics);
    g.clear().setVisible(true).setDepth(e.sprite.depth + 0.5);
    const H = e.sprite.displayHeight * e.sprite.originY, W = e.sprite.displayWidth;
    const flip = e.sprite.flipX ? -1 : 1, dir = this.dirOf(e), side = dir === "left" || dir === "right";
    const B = 0xe8e2d0, S = 0x8f887a, n = p.bones;
    const shY = y - H * 0.66, chestY = y - H * 0.5, sw = side ? W * 0.12 : W * 0.2;
    // 1: shoulder plates with a spike each
    for (const k of side ? [flip] : [-1, 1]) {
      const sx = x + k * sw;
      g.fillStyle(S).fillEllipse(sx, shY + 0.4, 6.4, 4.2).fillStyle(B).fillEllipse(sx, shY, 5.6, 3.6);
      g.fillStyle(B).fillTriangle(sx + k * 1.5 - 1, shY - 1, sx + k * 1.5 + 1, shY - 1, sx + k * 3.2, shY - 5);
    }
    if (n >= 2 && dir !== "up") {
      // rib cuirass: curved ribs over the chest and a sternum
      for (let i = 0; i < 4; i++) {
        const ry = chestY - 3 + i * 2.2, rw = (side ? 3.2 : 5.2) - i * 0.5;
        g.lineStyle(1.6, S).beginPath().arc(x + (side ? flip * 1.5 : 0), ry - 2.2, rw, 0.35, Math.PI - 0.35).strokePath();
        g.lineStyle(1, B).beginPath().arc(x + (side ? flip * 1.5 : 0), ry - 2.2, rw, 0.35, Math.PI - 0.35).strokePath();
      }
      if (!side) g.fillStyle(B).fillRect(x - 0.6, chestY - 4.5, 1.2, 8);
    }
    if (n >= 3) {
      // bone blade held out to its weapon side: a jagged femur sword
      const hx = x + (side ? flip * W * 0.22 : W * 0.24), hy = y - H * 0.42, tip = side ? flip : 0.6;
      g.lineStyle(2.4, S).lineBetween(hx, hy, hx + tip * 9, hy - 11);
      g.lineStyle(1.6, B).lineBetween(hx, hy, hx + tip * 9, hy - 11);
      g.fillStyle(B).fillCircle(hx, hy, 1.4).fillCircle(hx + tip * 9, hy - 11, 1.3);
      for (let i = 1; i <= 3; i++) g.fillStyle(B).fillTriangle(hx + tip * i * 2.4, hy - i * 2.9, hx + tip * i * 2.4 + 0.8, hy - i * 2.9 - 1.2, hx + tip * i * 2.4 + tip * 2.4, hy - i * 2.9 + 0.4);
    }
    if (n >= 4) {
      // spiked crown of finger bones between the horns
      const cy = y - H * 0.9;
      for (let i = -2; i <= 2; i++) g.fillStyle(B).fillTriangle(x + i * 2 - 0.8, cy, x + i * 2 + 0.8, cy, x + i * 2, cy - 3.5 - (i === 0 ? 1.5 : 0));
      g.fillStyle(S).fillRect(x - 5, cy - 0.5, 10, 1.4);
    }
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
    this.closeSlotPicker();
    this.npcs?.close();
    this.npcs?.log.toggle(false);
    this.gearMenu?.close();
    this.ideaBoard?.close();
    this.party?.close();
    this.trade?.close();
    this.stash?.close();
    this.patchNotes?.close();
    this.portals?.close();
    this.gameMenu?.close();
    showMusicPanel(false);
  }

  /** Game menu: leave the world (the server saves the hero as they leave), then back to the fireside screens. */
  private async saveAndQuit() {
    if (this.quitting || leaving()) return;
    this.quitting = true;
    this.closeMenus();
    this.feed("Saving your hero…");
    const login = { name: this.opts.name, password: this.opts.password };
    try { await Promise.race([this.room?.leave(true), new Promise((r) => setTimeout(r, 3000))]); } catch { /* already gone */ }
    returnToStart(login);
  }

  /** True when any menu or panel is on screen (Esc then closes it instead of opening the game menu). */
  private anyMenuOpen() {
    const shown = (id: string) => { const e = document.getElementById(id); return !!e && !e.hidden; };
    return shown("hero") || shown("tree") || shown("slotpick") || musicPanelOpen() ||
      !!(this.npcs?.isOpen || this.npcs?.log.open || this.gearMenu?.open || this.ideaBoard?.open || this.party?.open ||
        this.trade?.open || this.stash?.open || this.patchNotes?.open || this.portals?.isOpen || this.minimap?.isOpen ||
        this.gameMenu?.open || this.talentMenu?.open);
  }

  /** Opens the hero menu. After level-ups (`from` = level before them) it highlights the gains. */
  private showHeroMenu(from?: number) {
    const mine = this.entities.get(this.me)?.state;
    if (!mine) return;
    this.heroFrom = from;
    const cls = mine.cls as ClassKind, lvl = mine.level as number;
    const st = { sta: mine.sta, str: mine.str, mag: mine.mag, dex: mine.dex ?? 0 }; // includes gear bonuses
    const free = statPoints(lvl) - (mine.ptSta + mine.ptStr + mine.ptMag + (mine.ptDex ?? 0));
    // Rebuild only when something shown changed (called every frame while open)
    const sig = [lvl, mine.xp, Math.ceil(mine.hp), mine.maxHp, st.sta, st.str, st.mag, st.dex, free, mine.kills, mine.gold, from].join("|");
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
        `cooldowns −${Math.round((1 - cooldownMult(cls, st, mine.talents)) * 100)}%, ${maxManaFor(st, lvl)} max mana`,
      dex: `${Math.round(critChance(st, talentBonus(cls, mine.talents, "crit")) * 100)}% critical hits (double damage), skills too`,
    };
    const pts: Record<StatKind, number> = { sta: mine.ptSta, str: mine.ptStr, mag: mine.ptMag, dex: mine.ptDex ?? 0 };
    document.getElementById("herostats")!.innerHTML = STAT_KINDS.map((k) => {
      const plus = free > 0 ? `<button class="statplus" data-stat="${k}" title="Add a point to ${STAT_NAMES[k]}">+</button>` : "<span></span>";
      const mine_ = pts[k] ? ` <span class="gain">(+${pts[k]})</span>` : "";
      return `${plus}<span>${STAT_NAMES[k]}</span><b>${st[k]}${mine_}</b><span class="note">${notes[k]}</span>`;
    }).join("");
    const wp = attackProfile(cls, activeOf(mine));
    const next = xpForLevel(lvl + 1), cur = xpForLevel(lvl);
    const dmg = Math.round(wp.damage * weaponAttackMult(cls, st, wp.type) * talentMult(cls, mine.talents, "dmg"));
    const speed = Math.round(heroSpeed(cls, false, mine.spd ?? 1) * gearSpeedMult(activeOf(mine)));
    const rows: [string, string][] = [
      ["Level", lvl >= MAX_LEVEL ? `${MAX_LEVEL} (max)` : `${lvl} · XP ${mine.xp - cur}/${next - cur}`],
      ["Health", `${Math.ceil(mine.hp)} / ${mine.maxHp}`],
      ["HP regen", `${regenFromStamina(st.sta)[1].toFixed(1)}/s resting · ${regenFromStamina(st.sta)[0].toFixed(1)}/s in a fight`],
      ["Mana", `${unpackMana(mine.mp).mana} / ${unpackMana(mine.mp).maxMana} · ${manaRegen(st, false, talentBonus(cls, mine.talents, "mana")).toFixed(1)}/s (×${MANA.restMult} resting)`],
      ["Attack", `${dmg} damage · ${WEAPON_TYPE_NAMES[wp.type]}: ${ATTACK_WORDS[wp.type]}`],
      ["Attack speed", `${(1000 / wp.attackCooldownMs).toFixed(1)} hits/s`],
      ["Critical hits", `${Math.round(critChance(st, talentBonus(cls, mine.talents, "crit")) * 100)}% chance, double damage`],
      ["Initiative", `${heroPoise(cls, lvl)} · dizzy at 0`],
      ["Move speed", `${speed}`],
      ["Kills · Gold", `${mine.kills} · ${mine.gold}`],
    ];
    document.getElementById("herochar")!.innerHTML = rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join("");
    el.hidden = false;
  }

  /**
   * Skill slot bar (keys 1..0). Click a slot to open a list of your skills (icon, name, where it is now) and pick
   * one; the mouse wheel over a slot scrolls through the choices directly; right-click empties it. Keys use the slot.
   */
  private setupHotbar() {
    const bar = document.getElementById("hotbar")!;
    const pick = document.getElementById("slotpick")!;
    const cellOf = (ev: Event) => (ev.target as HTMLElement).closest("[data-slot]") as HTMLElement | null;
    bar.addEventListener("click", (ev) => {
      // Potion cells left of the bar: click drinks one (same as Q / V)
      const potion = (ev.target as HTMLElement).closest("[data-potion]") as HTMLElement | null;
      if (potion) { this.room?.send(potion.dataset.potion === "mana" ? "manapotion" : "potion"); return; }
      const cell = cellOf(ev);
      if (!cell) return;
      for (const [key, n] of [["L", LEFT_PICK], ["R", RIGHT_PICK]] as const) {
        if (cell.dataset.slot === key) { if (!pick.hidden && this.pickSlot === n) this.closeSlotPicker(); else this.openSlotPicker(n); return; }
      }
      const n = Number(cell.dataset.slot);
      if (!pick.hidden && this.pickSlot === n) this.closeSlotPicker(); else this.openSlotPicker(n);
    });
    bar.addEventListener("contextmenu", (ev) => {
      const cell = cellOf(ev);
      if (!cell) return;
      ev.preventDefault();
      if (cell.dataset.slot === "L") { this.setClickSkill("left", ""); return; } // back to the weapon
      if (cell.dataset.slot === "R") { this.setClickSkill("right", ""); return; }
      if (cell.dataset.skill) this.room?.send("assign", { slot: Number(cell.dataset.slot), skill: "" });
    });
    // Wheel over a slot: cycle (empty) -> skill A -> skill B -> ... (learned skills only)
    bar.addEventListener("wheel", (ev) => {
      const cell = cellOf(ev);
      const mine = this.entities.get(this.me)?.state;
      if (!cell || !mine) return;
      ev.preventDefault();
      const cls = mine.cls as ClassKind;
      const choices = ["", ...activeSkills(cls).filter((a) => skillLearned(cls, mine.talents, a.id)).map((a) => a.id)];
      if (choices.length < 2) return;
      if (cell.dataset.slot === "L" || cell.dataset.slot === "R") {
        const side: ClickSide = cell.dataset.slot === "L" ? "left" : "right";
        const cur = Math.max(0, choices.indexOf(this.clickSkill(side)));
        this.setClickSkill(side, choices[(cur + (ev.deltaY > 0 ? 1 : -1) + choices.length) % choices.length]);
        return;
      }
      const n = Number(cell.dataset.slot);
      const cur = Math.max(0, choices.indexOf(mine.slots?.at(n) ?? ""));
      const next = choices[(cur + (ev.deltaY > 0 ? 1 : -1) + choices.length) % choices.length];
      this.room?.send("assign", { slot: n, skill: next });
    }, { passive: false });
    pick.addEventListener("click", (ev) => {
      const opt = (ev.target as HTMLElement).closest("[data-pick]") as HTMLElement | null;
      if (!opt || opt.classList.contains("locked")) return;
      if (this.pickSlot === LEFT_PICK) this.setClickSkill("left", opt.dataset.pick ?? "");
      else if (this.pickSlot === RIGHT_PICK) this.setClickSkill("right", opt.dataset.pick ?? "");
      else this.room?.send("assign", { slot: this.pickSlot, skill: opt.dataset.pick });
      this.closeSlotPicker();
    });
    // Clicking anywhere else closes the list
    document.addEventListener("mousedown", (ev) => {
      if (pick.hidden) return;
      const t = ev.target as HTMLElement;
      if (!t.closest("#slotpick") && !t.closest("#hotbar")) this.closeSlotPicker();
    });
  }

  private pickSlot = -1;

  /** The skill list for slot `n`: every active skill of the class, learned ones clickable, plus "Empty". */
  private openSlotPicker(n: number) {
    const mine = this.entities.get(this.me)?.state;
    if (!mine) return;
    const cls = mine.cls as ClassKind;
    if (n === LEFT_PICK || n === RIGHT_PICK) { this.openClickPicker(mine, cls, n === LEFT_PICK ? "left" : "right"); return; }
    const slots: string[] = [...(mine.slots ?? [])];
    const opts = activeSkills(cls).map((a) => {
      const learned = skillLearned(cls, mine.talents, a.id);
      const at = slots.indexOf(a.id);
      const where = !learned ? `${icon("lock")}learn it in the tree (T), Lv ${a.req}` : at === n ? "in this slot" : at >= 0 ? `now on key ${SLOT_KEYS[at]}` : "not on a key yet"
      const need = a.needs ? ` · needs ${NEED_TEXT[a.needs]}` : "";
      return `<button class="opt${learned ? "" : " locked"}${at === n ? " cur" : ""}" data-pick="${a.id}" data-tiphead="${a.name}" data-tip="${tipEsc(a.desc)}">` +
        `${iconImg(a.id, "picon")}<span><b>${a.name}</b><small>${where}${need}</small></span></button>`;
    }).join("");
    const empty = `<button class="opt clear" data-pick=""><span class="picon none">${icon("close")}</span><span><b>Empty</b><small>clear key ${SLOT_KEYS[n]}</small></span></button>`;
    const pick = document.getElementById("slotpick")!;
    pick.innerHTML = `<div class="ph">Key ${SLOT_KEYS[n]}: choose a skill</div><div class="plist">${opts}${slots[n] ? empty : ""}</div>`;
    this.pickSlot = n;
    pick.hidden = false;
    // Sit just above the clicked slot
    const cell = document.querySelector(`#hotbar [data-slot="${n}"]`) as HTMLElement | null;
    const hud = document.getElementById("hud")!.getBoundingClientRect();
    if (cell) {
      const r = cell.getBoundingClientRect();
      const w = pick.offsetWidth;
      pick.style.left = `${Math.max(8, Math.min(hud.width - w - 8, r.left - hud.left + r.width / 2 - w / 2))}px`;
      pick.style.bottom = `${hud.bottom - r.top + 6}px`;
    }
  }

  /** Left or right click: the weapon's attack or any learned skill / basic spell (Murat 2026-11-04 / 11-05). */
  private openClickPicker(mine: any, cls: ClassKind, side: ClickSide) {
    const cur = this.clickSkill(side);
    const w = attackProfile(cls, activeOf(mine));
    const weapon = `<button class="opt${cur ? "" : " cur"}" data-pick="" data-tiphead="${WEAPON_TYPE_NAMES[w.type]}" data-tip="${tipEsc(`Basic attack with what you hold: ${ATTACK_WORDS[w.type]}.`)}">` +
      `${this.weaponIcon(mine, "picon")}<span><b>Weapon attack</b><small>${WEAPON_TYPE_NAMES[w.type]}: ${ATTACK_WORDS[w.type]}</small></span></button>`;
    const opts = activeSkills(cls).map((a) => {
      const learned = skillLearned(cls, mine.talents, a.id);
      const where = !learned ? `${icon("lock")}learn it in the tree (T), Lv ${a.req}` : a.cantrip ? `basic spell · ${a.mana ?? 0} mana` : a.id === cur ? `on ${side} click` : costWords(a) + (a.needs ? ` · needs ${NEED_TEXT[a.needs]}` : "");
      return `<button class="opt${learned ? "" : " locked"}${a.id === cur ? " cur" : ""}" data-pick="${a.id}" data-tiphead="${a.name}" data-tip="${tipEsc(a.desc)}">` +
        `${iconImg(a.id, "picon")}<span><b>${a.name}</b><small>${where}</small></span></button>`;
    }).join("");
    const pick = document.getElementById("slotpick")!;
    const head = side === "left" ? "Left click on an enemy: choose" : "Right click and Space: choose";
    pick.innerHTML = `<div class="ph">${head}</div><div class="plist">${weapon}${opts}</div>`;
    this.pickSlot = side === "left" ? LEFT_PICK : RIGHT_PICK;
    pick.hidden = false;
    const cell = document.querySelector(`#hotbar [data-slot="${side === "left" ? "L" : "R"}"]`) as HTMLElement | null;
    const hud = document.getElementById("hud")!.getBoundingClientRect();
    if (cell) {
      const r = cell.getBoundingClientRect();
      pick.style.left = `${Math.max(8, Math.min(hud.width - pick.offsetWidth - 8, r.left - hud.left))}px`;
      pick.style.bottom = `${hud.bottom - r.top + 6}px`;
    }
  }

  /** The left- or right-click skill, if it is still one this hero knows ("" = the weapon). */
  private clickSkill(side: ClickSide): string {
    const mine = this.entities.get(this.me)?.state;
    if (!mine) return "";
    const hero = `${mine.name}|${mine.cls}`;
    let pick = this.clickPick[side];
    if (pick?.hero !== hero) {
      let saved = "";
      try { saved = localStorage.getItem(`${side}click:${hero}`) ?? ""; } catch { /* storage off */ }
      pick = this.clickPick[side] = { hero, skill: saved };
    }
    const id = pick.skill;
    return id && skillLearned(mine.cls, mine.talents, id) && !skillOf(mine.cls, id)?.passive ? id : "";
  }
  private leftSkill() { return this.clickSkill("left"); }
  private rightSkill() { return this.clickSkill("right"); }

  private setClickSkill(side: ClickSide, id: string) {
    this.clickSkill(side); // loads the pick for this hero
    const pick = this.clickPick[side];
    if (!pick) return;
    pick.skill = id;
    try { localStorage.setItem(`${side}click:${pick.hero}`, id); } catch { /* storage off */ }
    this.hotbarHtml = "";
  }

  /** Skill key 1..0: cast that slot's skill now, aimed at the mouse cursor (self skills just go off). */
  private castSlot(n: number) {
    const mine = this.entities.get(this.me)?.state;
    const id = mine?.slots?.at?.(n);
    const s = id ? skillOf(mine.cls, id) : undefined;
    if (!s || !this.room || loadingActive()) return;
    if (skillTarget(s) !== "self") { const aim = this.pointer?.cursorAim(); if (aim) this.room.send("face", aim); }
    this.room.send("useslot", n);
  }

  /** The main-hand weapon's icon (or a fist when empty-handed) as an <img>. */
  private weaponIcon(mine: any, cls = "") {
    const w = activeOf(mine).weapon;
    if (!w) return `<span class="${cls} fist">Fists</span>`;
    const key = baseId(w);
    let url = this.weaponIcons.get(key);
    if (!url) { url = iconCanvas(this, w, 32).toDataURL(); this.weaponIcons.set(key, url); }
    return `<img class="${cls}" src="${url}" alt="">`;
  }
  private weaponIcons = new Map<string, string>();

  /** Healing (Q) and mana (V) potion cells right of the skill bar: the flask in pixel art, how many you carry. */
  private potionCells(mine: any) {
    const pots = unpackPotions(mine.potions);
    const cell = (kind: PotionKind, key: string) => {
      const c = pots[kind], n = total(c), next = Math.max(0, nextSize(c)), tex = potionTex(kind, next);
      const name = n ? potionName(kind, next) : kind === "mpotion" ? "Mana potion" : "Healing potion";
      const sizes = c.map((k, s) => (k ? `${k} ${POTION_SIZES[s].name} (${potionAmount(kind, s)} ${kind === "mpotion" ? "mana" : "HP"})` : "")).filter(Boolean).join(", ");
      let url = this.weaponIcons.get(tex);
      if (!url) {
        const cv = document.createElement("canvas");
        cv.width = cv.height = 32;
        const ctx = cv.getContext("2d")!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.textures.get(itemTexture(this, tex)).getSourceImage() as CanvasImageSource, 0, 0, 8, 8, 0, 0, 32, 32);
        url = cv.toDataURL();
        this.weaponIcons.set(tex, url);
      }
      return `<div class="slot potion ${kind}${n > 0 ? "" : " wait"}" data-potion="${kind === "mpotion" ? "mana" : "hp"}" data-tiphead="${name}" ` +
        `data-tip="${tipEsc(sizes ? `You carry ${sizes}.` : "None left. Monsters, chests and Old Morwen have more.")}" data-tiphint="Key ${key} or click: drinks the smallest first">` +
        `<img src="${url}" alt=""><kbd>${key}</kbd><b class="count">${n}</b></div>`;
    };
    return `<div class="potions">${cell("potion", "Q")}${cell("mpotion", "V")}</div>`;
  }

  private closeSlotPicker() {
    document.getElementById("slotpick")!.hidden = true;
    this.pickSlot = -1;
  }

  /** "Needs a bow" when the hero holds the wrong weapon for this skill (shared/weapons.ts weaponOk), else "". */
  private unarmedFor(mine: any, cls: ClassKind, skill: string): string {
    const s = skillOf(cls, skill);
    return s?.needs && !weaponOk(s, cls, activeOf(mine)) ? `Needs ${NEED_TEXT[s.needs]}` : "";
  }

  /** Name, cooldown and cost of an active skill for the HUD. */
  private skillHud(cls: ClassKind, skill: string, cdm: number) {
    const s = skillOf(cls, skill);
    return { name: s?.name ?? "?", cdMs: (s?.cd ?? 0) * cdm, last: this.lastCast[skill] ?? -Infinity, cost: s ? skillCost(s) : { stamina: 0, mana: 0 }, ult: s?.row === 4 };
  }

  private chargeSeen = { n: 0, at: 0 }; // our stacks last frame, and when the newest one was built

  /**
   * Charges (Valor, Ki, Arcane, Focus, Fury) left of the skill keys: a crystal icon, the count, 5 pips and a shade
   * that fills as they fade (STACK_DECAY_MS after the last hit). Only shown while a skill on the bar (or on the left
   * click) spends them (Murat 2026-11-04).
   */
  private chargeCell(mine: any, cls: ClassKind, clicks: string[], slots: string[], now: number): string {
    const n = Math.max(0, Math.min(MAX_STACKS, mine.stacks | 0));
    if (n > this.chargeSeen.n) this.chargeSeen.at = now; // a hit built one (the server's clock isn't sent)
    this.chargeSeen.n = n;
    const users = [...clicks, ...slots].filter((id, i, a) => id && a.indexOf(id) === i)
      .map((id) => skillOf(cls, id)).filter((sd) => sd?.consume && skillLearned(cls, mine.talents, sd.id));
    if (!users.length) return "";
    const name = STACK_NAME[cls];
    const left = n > 0 ? Math.max(0, STACK_DECAY_MS - (now - this.chargeSeen.at)) : 0;
    const shade = n > 0 ? `<div class="cd" style="height:${Math.round((1 - left / STACK_DECAY_MS) * 50) * 2}%"></div>` : "";
    const pips = Array.from({ length: MAX_STACKS }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("");
    const tip = `Built by your basic hits, up to ${MAX_STACKS}. They fade ${STACK_DECAY_MS / 1000} s after your last hit. ` +
      `Spent by ${users.map((u) => u!.name).join(", ")}: each one makes it stronger.`;
    return `<div class="slot charge${n ? "" : " wait"}" data-tiphead="${name} ${n}/${MAX_STACKS}" data-tip="${tipEsc(tip)}">` +
      `<img class="sicon" src="${chargeIcon(cls)}" alt="" draggable="false">${shade}${n ? `<b>${n}</b>` : ""}<span class="pips">${pips}</span></div>`;
  }

  /** Skill bar at the bottom: potions, the left-click cell and the 10 slots (the old text list of actions is gone, Murat 2026-11-04). */
  private renderActions(mine: any, cls: ClassKind, cdm: number, now: number) {
    const pools = { energy: mine.energy, mana: unpackMana(mine.mp).mana };
    const slots: string[] = [...(mine.slots ?? [])];
    // Slot bar at the bottom: 10 cells, cooldown shading, click to choose a skill
    const cells = Array.from({ length: SLOT_COUNT }, (_, i) => {
      const skill = slots[i] ?? "";
      const picking = (this.pickSlot === i ? " picking" : "");
      if (!skill) return `<div class="slot empty${picking}" data-slot="${i}" title="Click to put a skill on key ${SLOT_KEYS[i]}"><kbd>${SLOT_KEYS[i]}</kbd><i>+</i></div>`;
      const h = this.skillHud(cls, skill, cdm);
      const left = Math.max(0, h.cdMs - (now - h.last));
      const shade = left > 0 ? `<div class="cd" style="height:${(left / h.cdMs) * 100}%"></div>` : "";
      const wait = left > 0 || !canPay(pools, h.cost) ? " wait" : "";
      const power = skill;
      const unarmed = this.unarmedFor(mine, cls, skill);
      return `<div class="slot${h.ult ? " ult" : ""}${wait}${unarmed ? " unarmed" : ""}${picking}" data-slot="${i}" data-skill="${skill}" data-tiphead="${h.name}" data-tip="${tipEsc((unarmed ? `${unarmed}. ` : "") + (skillOf(cls, skill)?.desc ?? ""))}" data-tiphint="Key ${SLOT_KEYS[i]} · click to change · wheel to scroll · right-click to clear">` +
        `${iconImg(power)}${shade}${unarmed ? `<i class="xout"></i>` : ""}<kbd>${SLOT_KEYS[i]}</kbd>${left > 0 && !unarmed ? `<b>${Math.ceil(left / 1000)}</b>` : ""}</div>`;
    }).join("");
    // Left- and right-click cells first: the weapon, or the spell / skill picked for that click
    const clickCell = (side: ClickSide) => {
      const sk = this.clickSkill(side), key = side === "left" ? "L" : "R", Side = side === "left" ? "Left click" : "Right click / Space";
      const pk = this.pickSlot === (side === "left" ? LEFT_PICK : RIGHT_PICK) ? " picking" : "";
      if (sk) {
        const h = this.skillHud(cls, sk, cdm);
        const left = Math.max(0, h.cdMs - (now - h.last));
        const shade = left > 0 && h.cdMs >= 1000 ? `<div class="cd" style="height:${(left / h.cdMs) * 100}%"></div>` : "";
        const unarmed = this.unarmedFor(mine, cls, sk);
        return `<div class="slot lmb ${side}${!canPay(pools, h.cost) ? " wait" : ""}${unarmed ? " unarmed" : ""}${pk}" data-slot="${key}" data-tiphead="${Side}: ${h.name}" data-tip="${tipEsc((unarmed ? `${unarmed}. ` : "") + (skillOf(cls, sk)?.desc ?? ""))}" data-tiphint="Click to change · wheel to scroll · right-click: back to the weapon">` +
          `${iconImg(sk)}${shade}${unarmed ? `<i class="xout"></i>` : ""}<kbd>${key}</kbd></div>`;
      }
      const w = attackProfile(cls, activeOf(mine));
      return `<div class="slot lmb ${side}${w.mana && !canPay(pools, { mana: w.mana }) ? " wait" : ""}${pk}" data-slot="${key}" data-tiphead="${Side}: ${WEAPON_TYPE_NAMES[w.type]}" data-tip="${tipEsc(`Weapon attack: ${ATTACK_WORDS[w.type]}.`)}" data-tiphint="Click to put a spell or skill on this click instead">` +
        `${this.weaponIcon(mine)}<kbd>${key}</kbd></div>`;
    };
    const ls = this.leftSkill(), rs = this.rightSkill();
    const lcell = clickCell("left") + clickCell("right");
    const bar = document.getElementById("hotbar")!;
    const all = this.chargeCell(mine, cls, [ls, rs], slots, now) + lcell + cells + this.potionCells(mine); // potions right of the skill keys (Murat 2026-11-04)
    if (this.hotbarHtml !== all) { bar.innerHTML = all; this.hotbarHtml = all; }
  }

  private showDodge(msg: { id: string; dir: string }) {
    const e = this.entities.get(msg.id);
    if (!e) return;
    if (msg.id === this.me) this.lastDodge = this.time.now;
    if (e.hero) this.moves.stop(msg.id, e);
    if (e.hero) playCharAnim(e.sprite, e.hero, "dodge", (ISO ? this.worldToScreenDir(msg.dir, true) : msg.dir) as any);
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

  /** Skill visual event from the server (shared/skillEngine.ts): drawn by SkillFx, plus the hero's cast animation. */
  private onSkillFx(ev: any) {
    if (ev.ev === "cast") {
      const e = this.entities.get(ev.id);
      if (ev.id === this.me) this.lastCast[ev.s] = this.time.now;
      if (ev.id === this.me && ev.s === this.leftSkill()) this.pointer?.swung(); // a left-click spell went off: that click is done
      // Big melee skills play their own wind-up / action / recovery sequence; everything else the cast animation
      if (e?.hero && !this.moves.start(ev.id, e, ev, this.dirOf(e))) playCharAnim(e.sprite, e.hero, "skill", this.dirOf(e));
    }
    if (ev.ev === "move" || ev.ev === "countered") {
      const e = this.entities.get(ev.id);
      if (e) { e.tx = ev.x; e.ty = ev.y; e.chaseUntil = this.time.now + 250; }
      if (ev.ev === "move") this.moves.onMove(ev.id, ev);
      // A dash glides (skillfx no longer snaps it): hold our prediction off while the sprite catches up
      if (ev.ev === "move" && ev.kind === "dash" && ev.id === this.me) this.rootUntil = Math.max(this.rootUntil, this.time.now + 140);
    }
    this.fx.onEvent(ev);
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
    e.bubble = speechBubble(this, e.sprite.x, e.sprite.y - e.top - 12, text);
    isoAnchor(e.bubble, e.sprite);
    const b = e.bubble;
    this.time.delayedCall(4000, () => { if (e.bubble === b) { b.destroy(); e.bubble = undefined; } });
  }

  /** Where the outlaw heroes are (shared/wrath.ts): the townsfolk run at them. */
  private outlawSpots(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    (this.room.state as any).players?.forEach((p: any, id: string) => {
      if (!p.outlaw || p.dead) return;
      const e = this.entities.get(id);
      const x = e?.sprite.x ?? p.x, y = e?.sprite.y ?? p.y;
      if (inVillage(x, y)) out.push({ x, y });
    });
    return out;
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
    if (mine) quake(this, 260, 0.006);
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

  private guards = new Map<string, number>();
  private guardsAt = 0;
  private settled = 0;
  private lastMid = { x: NaN, y: NaN };
  /** Lift the loading screen once the hero is in, the camera has caught up with it and the ground around it is painted. */
  private checkLoaded() {
    if (!this.room) return;
    const cam = this.cameras.main;
    const moved = Math.hypot(cam.midPoint.x - this.lastMid.x, cam.midPoint.y - this.lastMid.y);
    this.lastMid = { x: cam.midPoint.x, y: cam.midPoint.y };
    const ground = IsoView.ground;
    const pending = ground?.pending ?? 0, painted = ground?.painted ?? 0;
    const hasMe = this.entities.has(this.me);
    const ready = hasMe && moved < 0.5 && pending === 0;
    if (!hasMe) setLoading("Joining Oakvale", 0.55);
    else if (ground) setLoading("Painting the land", 0.6 + 0.38 * (painted / Math.max(1, painted + pending)));
    else setLoading("Painting the land", 0.9);
    this.settled = ready ? this.settled + 1 : 0;
    // a few calm frames in a row so the first full frame is on screen; never hang longer than 20 s
    if (this.settled >= 4 || loadingFor() > 20_000) hideLoading();
  }

  update(_t: number, dtMs: number) {
    this.iso?.update(dtMs);
    if (loadingActive()) this.checkLoaded();
    this.ambient?.update(this.time.now, dtMs);
    this.details?.update(this.time.now, dtMs);
    if (!this.room) return;
    this.villagers?.update(dtMs, this.outlawSpots());
    this.party?.update();
    this.trade?.update();
    this.watch?.update(dtMs);
    this.torches?.update(this.time.now, (id) => !!this.watch?.striking(id));
    this.fx.update(dtMs);
    const k = this.keys;
    const typing = this.chatting();
    const next: InputState = typing
      ? { up: false, down: false, left: false, right: false }
      : isoInput(k.W.isDown || k.UP.isDown, k.S.isDown || k.DOWN.isDown, k.A.isDown || k.LEFT.isDown, k.D.isDown || k.RIGHT.isDown);
    // Point-and-click: the mouse steers until a movement key is pressed
    let want = next;
    if (next.up || next.down || next.left || next.right) { this.pointer?.cancel(); this.pointer?.drawRing(); }
    else want = this.pointer?.update(Math.min(dtMs, 100)) ?? next;
    this.sendInput(want);

    const now = this.time.now, wall = performance.now();
    // Long frames (a hiccup, a hidden tab) are capped so prediction never leaps through a wall
    const step = Math.min(dtMs, 100);
    // An easing written for 60 fps (k per frame), adjusted so it pulls just as hard at 30, 120 or 144 fps
    const ease = (k: number) => 1 - Math.pow(1 - k, step / (1000 / 60));
    for (const [id, e] of this.entities) {
      const p = e.state;
      const rooted = (typeof p.fx === "string" && p.fx.includes("charge")) || (id === this.me && this.time.now < this.rootUntil); // a buildup roots the hero, a dash glides
      if (id === this.me && !p.dead && !p.stunned && !p.rolling && !rooted) {
        // Client-side prediction with the same movement code the server runs
        const r = moveStep(e.sprite.x, e.sprite.y, this.input_, step / 1000, heroSpeed(p.cls as ClassKind, p.slowed, p.spd ?? 1) * gearSpeedMult(activeOf(p)));
        e.sprite.setPosition(r.x, r.y);
        // Just stopped: the server's hero is still walking up behind ours (it hasn't read the stop yet, and its last
        // update is older still). Easing toward that stale spot slid the hero back a step before each attack (Murat).
        // So wait until the server has the stop and stands still too, then settle on its spot.
        const settled = ((p.seq ?? 0) >= this.stopSeq && !p.moving) || now - this.stoppedAt > 1000;
        if (!r.moving && settled) {
          // Ease toward authoritative position while idle (same pull at any frame rate)
          const k = ease(0.2);
          e.sprite.x += (e.tx - e.sprite.x) * k;
          e.sprite.y += (e.ty - e.sprite.y) * k;
        }
      } else if (id === this.me || now < (e.leapUntil ?? 0) || now < (e.chaseUntil ?? 0)) {
        // Our own hero while rolling/stunned, a leap or a dash: follow the server closely
        const k = ease(id === this.me || p.rolling ? 0.5 : 0.25);
        e.sprite.x += (e.tx - e.sprite.x) * k;
        e.sprite.y += (e.ty - e.sprite.y) * k;
      } else {
        // Everyone else: play back their server positions a little late, so they glide at an even speed
        // instead of lurching once per server update (and stopping when one comes in late)
        const at = interpolate(e.snaps ?? [], wall - INTERP_DELAY);
        if (at) e.sprite.setPosition(at.x, at.y);
      }
      // Monsters off screen: hide them and skip the per-frame drawing (there are a lot of them)
      if (e.mob) {
        const v = this.cameras.main.worldView, M = 48;
        const off = e.sprite.x < v.x - M || e.sprite.x > v.right + M || e.sprite.y < v.y - M || e.sprite.y > v.bottom + M;
        if (off) {
          if (!e.culled) {
            e.culled = true; e.sprite.setVisible(false); e.bar.clear().setVisible(false); e.parts?.clear(); e.bubble?.setVisible(false);
            e.label?.destroy(); e.label = undefined; e.lvlColor = undefined; this.siege.clear(id);
          }
          continue;
        }
        if (e.culled) { e.culled = false; e.bubble?.setVisible(true); e.bar.setVisible(true); }
        if (!e.label) {
          e.label = this.add.text(e.sprite.x, e.sprite.y, "", {
            fontFamily: "monospace", fontSize: "14px", color: "#ffffff", stroke: "#000", strokeThickness: 3,
          }).setOrigin(0.5, 1).setScale(0.25).setResolution(2);
          isoAnchor(e.label, e.sprite);
        }
      }

      const moving = id === this.me ? (this.input_.up || this.input_.down || this.input_.left || this.input_.right) : p.moving;
      if (ISO) {
        // Face where the hero goes on screen (the server's 4 directions are world directions)
        const dx = e.sprite.x - (e.lastX ?? e.sprite.x), dy = e.sprite.y - (e.lastY ?? e.sprite.y);
        if (moving && Math.hypot(dx, dy) > 0.05) e.vdir = (e.hero ? screenDir8 : screenDir)(dx, dy, e.vdir ?? p.dir);
        e.lastX = e.sprite.x; e.lastY = e.sprite.y;
      }
      const dir = this.dirOf(e) as any;
      if (e.hero) {
        // Holding a weapon of another family switches the stance sheet (an archer with a sword fights like a fighter)
        const stance = (HD_CHARS ? poseSheet(p.cls, activeOf(p)) : p.cls) as CharacterName;
        if (stance !== e.hero && ensureCharSheet(this, stance)) {
          const cur = e.sprite.anims.currentAnim?.key.slice(e.hero.length) ?? "";
          e.hero = stance;
          e.gear?.setHero(stance);
          if (cur && this.anims.exists(`${stance}${cur}`)) e.sprite.play(`${stance}${cur}`, true);
        }
        // Skill-move sheets (and the gear for them) load ahead, so the first big skill already plays its sequence
        if (e.gear && this.moves.prefetch(e.hero)) e.gear.ready(movesSheet(e.hero), p);
        // Let one-shot attack/hit/skill animations finish before going back to walk/idle
        const key = e.sprite.anims.currentAnim?.key ?? "";
        const oneShot = e.sprite.anims.isPlaying && /_(attack\d?|swing\d|hit|skill|idle[23]|dodge)_/.test(key);
        if (moving || p.dead) e.idleSince = undefined;
        else e.idleSince ??= now;
        if (this.moves.tick(id, e, moving)) {
          // a skill sequence is drawing the hero this frame
        } else if (p.dead) {
          if (!key.includes("_ko_")) playCharAnim(e.sprite, e.hero, "ko", dir);
        } else if (!oneShot) {
          if (!moving && p.emote && this.anims.exists(`${e.hero}_${p.emote}_down`)) {
            playCharAnim(e.sprite, e.hero, p.emote, dir);
          } else if (!moving && e.idleSince !== undefined && now - e.idleSince > 4000 && now > (e.nextFidget ?? 0)) {
            // Standing still for a while: an occasional fidget (look around / weapon flourish)
            e.nextFidget = now + 3000 + Math.random() * 4000;
            playCharAnim(e.sprite, e.hero, Math.random() < 0.5 ? "idle2" : "idle3", dir);
          } else {
            playCharAnim(e.sprite, e.hero, moving ? "walk" : "idle", dir);
          }
        }
        e.sprite.setAlpha(p.dead ? 0.6 : 1);
      } else {
        const step = moving ? Math.floor(now / 150) % 2 : 0;
        // Monsters gather themselves before a blow (wind-up frame) and lunge when it lands (strike frame)
        const attackFrames = e.mob && e.sprite.texture.frameTotal > 12;
        const rip = e.rip && !p.dead && now < e.rip.end ? this.ripFrame(e, now, dir) : -1;
        if (rip >= 0) e.sprite.setFrame(rip);
        else if (attackFrames && !p.dead && p.winding) e.sprite.setFrame(ATTACK_BASE[dir]);
        else if (attackFrames && !p.dead && now < (e.strikeUntil ?? 0)) e.sprite.setFrame(ATTACK_BASE[dir] + 1);
        else e.sprite.setFrame(FRAME_BASE[dir] + step);
        if (e.mob && p.job >= 0) { const wf = this.siege.update(id, e, p, now, moving); if (wf !== undefined) e.sprite.setFrame(wf); } // siege works
        e.sprite.setFlipX(dir === "left");
        if (p.kind === "crawler" && e.sprite.isCropped) e.sprite.setAngle(dir === "left" ? -16 : dir === "right" ? 16 : 0); // leaning on its arms
        if (e.mob) e.sprite.setVisible(!p.dead && !p.hidden);
        else e.sprite.setAlpha(p.dead ? 0.35 : 1).setAngle(p.dead ? 90 : 0);
      }
      e.sprite.setDepth(e.sprite.y);
      // Status effects: yellow flicker for stunned, blue for slowed, red pulse for raging. A monster winding up shows
      // it in its pose; only sheets without attack frames (?pixel=1) still flash red.
      const windFlash = p.winding && e.sprite.texture.frameTotal <= 12;
      const raging = !e.mob && /(^|,)b_(rage|berserk)(,|$)/.test(p.fx ?? "");
      if (!p.dead && (p.stunned || windFlash || p.slowed || raging)) {
        e.sprite.setTint(p.stunned ? (Math.floor(now / 120) % 2 ? 0xfff176 : 0xffffff)
          : windFlash ? (Math.floor(now / 70) % 2 ? 0xff6b6b : 0xffffff)
          : p.slowed ? 0x90caf9 : (Math.floor(now / 200) % 2 ? 0xff8a80 : 0xffcdd2));
        e.statusTint = true;
      } else if (e.statusTint) { e.sprite.clearTint(); e.statusTint = false; }
      e.gear?.sync(e.sprite, p);
      if (e.gear) this.gearFx.tick(e, dtMs, moving);

      const x = Math.round(e.sprite.x), y = Math.round(e.sprite.y);
      // Monsters: HP bar over the head, level tag just above it
      const mobBarY = y - e.top - 4;
      e.label?.setPosition(x, e.mob ? mobBarY - 1 : y - e.top - (p.hat ? 4 : 2)).setDepth(e.sprite.y + 1);
      if (e.mob && e.label) {
        // Level tag coloured by how tough it is for me: grey easy, white even, orange tougher, red dangerous
        const diff = (p.level ?? 1) - ((this.room.state as any).players?.get(this.me)?.level ?? 1);
        const col = diff >= 3 ? "#ff5252" : diff >= 1 ? "#ffb74d" : diff >= -2 ? "#ffffff" : "#9e9e9e";
        const txt = p.title ? `${p.title} Lv${p.level ?? 1}` : BOSS[p.kind as keyof typeof BOSS] ? `Boss Lv${p.level ?? 1}` : ELITE[p.kind as keyof typeof ELITE] ? `Elite Lv${p.level ?? 1}` : `Lv${p.level ?? 1}`;
        if (e.label.text !== txt) e.label.setText(txt);
        if (e.lvlColor !== col) { e.label.setColor(col); e.lvlColor = col; }
        e.label.setVisible(!p.dead && !p.hidden);
      } else if (e.label && id !== this.me) {
        // Group members: green name
        const myParty = (this.room.state as any).players?.get(this.me)?.party;
        const col = myParty && p.party === myParty ? "#7cfc00" : "#ffffff";
        if (e.lvlColor !== col) { e.label.setColor(col); e.lvlColor = col; }
      }
      e.bubble?.setPosition(x, y - e.top - 12); // above the name label
      e.bar.clear().setDepth(e.sprite.y + 1);
      this.fx.status(e, e.bar, dtMs / 1000);
      // (Stacks built by basic hits are shown by the skill keys, see chargeCell: no pips under the hero, Murat 2026-11-04)
      const maxHp = p.maxHp;
      if (!e.mob) {
        if (p.guarding && !p.dead) {
          e.shield ??= isoAnchor(this.add.graphics(), e.sprite) as Phaser.GameObjects.Graphics;
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
      e.parts?.clear();
      if (e.mob && !p.dead && p.hidden) {
        // Hiding in a grave or tree: only a pair of eyes peeks out (and blinks now and then)
        e.bar.setDepth(20000);
        const blink = (now + x * 53 + y * 31) % 3200 < 160;
        if (!blink) {
          const col = p.kind === "skeleton" ? 0xff5252 : p.kind === "skeletonmage" ? 0x7fe7ff : 0xfff176;
          const ey = y - (p.kind === "skeleton" || p.kind === "skeletonmage" ? 2 : 5);
          e.bar.fillStyle(0x000000, 0.6).fillRect(x - 3, ey - 1, 7, 3);
          e.bar.fillStyle(col).fillRect(x - 2, ey, 1, 1).fillRect(x + 2, ey, 1, 1);
        }
      } else if (e.mob && !p.dead) {
        if (p.parts) this.drawBlobParts(e, id, p, x, y);
        else if (p.kind === "demon" && p.bones && !e.sprite.texture.key.startsWith("mob_demon")) this.drawDemonBones(e, p, x, y); // painted sheets wear them

        const bw = Math.min(40, (MOB_LOOK[p.kind]?.bar || 14) * (1 + MERGE.growPerBlob * ((p.merged || 1) - 1)));
        if (ELITE[p.kind as keyof typeof ELITE]) e.bar.fillStyle(BOSS[p.kind as keyof typeof BOSS] ? 0xc62828 : 0xffc93c).fillRect(x - bw / 2 - 1, mobBarY - 1, bw + 2, 4); // elite: gold frame, boss: red
        if (e.rallyUntil && now < e.rallyUntil) {
          // rallied by the chief's War Cry: a red glow under the feet
          e.bar.fillStyle(0xff3d2e, 0.18 + 0.1 * Math.sin(now / 120)).fillEllipse(x, y, 22, 9);
        }
        e.bar.fillStyle(0x000000).fillRect(x - bw / 2, mobBarY, bw, 2);
        e.bar.fillStyle(0xf4a261).fillRect(x - bw / 2, mobBarY, bw * (p.hp / maxHp), 2);
      } else if (!e.mob && !p.dead && p.hp < maxHp) {
        e.bar.fillStyle(0x000000).fillRect(x - 7, y + 3, 14, 2);
        e.bar.fillStyle(0xe63946).fillRect(x - 7, y + 3, 14 * (p.hp / maxHp), 2);
      }
    }

    for (const shot of this.shots.values()) {
      // Glide along the flight line between server updates (no stutter at 20 updates a second)
      const lead = Math.min(80, now - shot.at) / 1000;
      const px = shot.tx + shot.dx * shot.spd * lead, py = shot.ty + shot.dy * shot.spd * lead;
      shot.g.x += (px - shot.g.x) * 0.6;
      shot.g.y += (py - shot.g.y) * 0.6;
    }

    const meEnt = this.entities.get(this.me);
    // Other heroes for the minimap (a plain loop: the entity list holds thousands of monsters, no per-frame copies)
    const others: { x: number; y: number; name: string | undefined }[] = [];
    let online = 0;
    for (const [id, e] of this.entities) {
      if (e.mob) continue;
      online++;
      if (id !== this.me) others.push({ x: e.sprite.x, y: e.sprite.y, name: e.state?.name as string | undefined });
    }
    this.minimap?.draw(now, meEnt?.sprite, others);
    if (online !== this.onlineShown) { this.onlineShown = online; document.getElementById("onlinecount")!.textContent = String(online); }
    this.dial?.draw(now);
    if (meEnt) this.showArea(areaAt(meEnt.sprite.x, meEnt.sprite.y));
    this.signPanel.update(meEnt?.sprite);
    if (this.chests) {
      // lair chest id -> living guardians (counted a few times a second: walking all monsters every frame is wasteful)
      if (now >= this.guardsAt) {
        this.guardsAt = now + 250;
        const guards = this.guards; guards.clear();
        (this.room.state as any).mobs.forEach((m: any) => { if (m.guard && !m.dead) guards.set(m.guard, (guards.get(m.guard) ?? 0) + 1); });
      }
      const guards = this.guards;
      this.chests.update(meEnt && !meEnt.state.dead ? meEnt.sprite : undefined, !!this.npcs?.isOpen, meEnt?.state, (cid) => guards.get(cid) ?? 0);
    }
    this.shrine?.update(meEnt && !meEnt.state.dead && !this.chests?.near ? meEnt.sprite : undefined, !!this.npcs?.isOpen);
    this.stash?.update(meEnt && !meEnt.state.dead ? meEnt.sprite : undefined, !!this.npcs?.isOpen || !!this.chests?.near);
    if (this.npcs) this.npcs.hidePrompt = !!this.chests?.near || !!this.shrine?.near || !!this.portals?.near || !!this.stash?.near;
    this.npcs?.update(meEnt && !meEnt.state.dead ? meEnt.sprite : undefined, meEnt?.state);
    this.portals?.update(meEnt && !meEnt.state.dead ? meEnt.sprite : undefined, !!this.npcs?.isOpen || !!this.chests?.near || !!this.shrine?.near);
    if (this.minimap && this.npcs) this.minimap.markers = this.portals ? [...this.npcs.markers, ...this.portals.markers()] : this.npcs.markers;

    const mine = meEnt?.state;
    if (mine) {
      this.gearMenu?.refresh(mine);
      this.talentMenu?.refresh(mine);
      if (!document.getElementById("hero")!.hidden) this.showHeroMenu(this.heroFrom);
      const safe = isSafeZone(meEnt.sprite.x, meEnt.sprite.y) ? `${icon("shield")}Safe zone · ` : "";
      const next = xpForLevel(mine.level + 1), cur = xpForLevel(mine.level);
      const cls0 = mine.cls as ClassKind;
      // Level and XP live on the bars (resourceBars.ts), gold in the bag, potions on the flasks, skill points on the
      // Skills button badge: this line only flags the safe zone or a respawn
      const statsHtml = mine.dead ? "Respawning… " : safe.replace(" · ", "");
      if (statsHtml !== this.statsShown) { this.statsShown = statsHtml; document.getElementById("stats")!.innerHTML = statsHtml; }
      const freePts = talentPoints(mine.level) - spentPoints(cls0, mine.talents);
      const badge = document.getElementById("treebadge")!;
      badge.hidden = freePts <= 0;
      badge.textContent = String(freePts);
      const freeStats = statPoints(mine.level) - (mine.ptSta + mine.ptStr + mine.ptMag + (mine.ptDex ?? 0));
      const hb = document.getElementById("herobadge")!;
      hb.hidden = freeStats <= 0;
      hb.textContent = String(freeStats);
      // Zone under the hero drives the music
      const tx = meEnt.sprite.x / TILE, ty = meEnt.sprite.y / TILE;
      const zdef = zoneAt(Math.floor(tx), Math.floor(ty));
      setMusicZone(zdef?.name, zdef?.mobs, this.areaName);
      sfxFrame(this.me, this.entities as any);
      const cls = mine.cls as ClassKind;
      const cdm = cooldownMult(cls, { sta: mine.sta, str: mine.str, mag: mine.mag, dex: mine.dex ?? 0 }, mine.talents);
      // Top-left bars (resourceBars.ts): red HP, blue Mana (spells, shared/mana.ts), gold Stamina (dodge roll and physical skills), green XP
      const mn = unpackMana(mine.mp);
      (this.resBars ??= new ResourceBars(document.getElementById("hud")!)).update({
        level: mine.level, hp: mine.hp, maxHp: mine.maxHp, mp: mn.mana, maxMp: mn.maxMana, st: mine.energy, maxSt: ENERGY.max,
        xpFrac: mine.level >= MAX_LEVEL ? 1 : (mine.xp - cur) / Math.max(1, next - cur),
        xp: mine.xp - cur, xpNeed: mine.level >= MAX_LEVEL ? undefined : next - cur,
      });
      this.renderActions(mine, cls, cdm, now);
      (this.buffBar ??= new BuffBar(document.getElementById("hud")!)).update(mine.timers ?? "");
    }
  }
}
