import Phaser from "phaser";
import { MobFeed } from "./mobFeed";
import type { MobViewMsg } from "../../shared/mobView";
import { quake } from "./camfx";
import { chargeIcon } from "./chargeIcon";
import { leaving, noteBuild, reconnectSoon, returnToStart, takeCarried, upgradeAnnounced } from "./reconnect";
import { Client, getStateCallbacks, Room } from "colyseus.js";
/** Beast-folk that lurk in the Mawdeep's ambush rooms (their eyes show through the dark). */
const LURKERS = new Set<string>(["gnawkin", "tuskborn", "silkwretch", "duskwing", "crowseer"]);
import { BOSS, ELITE, InputState, MERGE, MOBS, type MobKind, URSK, SUNWRIGHT, DESERT_Y0, DESERT_H, actOfTile, MAP_H, MAP_W, regenFromStamina, TICK_RATE, TILE } from "../../shared/constants";
import { CLASSES, ClassKind, MAX_LEVEL, xpForLevel } from "../../shared/classes";
import { canPay, shortOf, MANA, manaRegen, maxManaFor, skillCost, unpackMana, usesGauge } from "../../shared/mana";
import { nextSize, potionAmount, PotionKind, potionName, POTION_SIZES, total, unpackPotions } from "../../shared/potions";
import { GROUND, areaAt, isSafeZone } from "../../shared/map";
import { heroPoise, meleeReach, mobBody, POISE, pvpProtected } from "../../shared/combat";
import { respecCost } from "../../shared/upkeep";
import { ESSENCE, isSummonKind } from "../../shared/summons";
import { FEAST, FEAST_MAX, feastLines, type Family } from "../../shared/devour";
import { moveStep } from "../../shared/movement";
import { SPAWN_ZONES, zoneAt } from "../../shared/spawns";
import { musicCombat, setMusicZone } from "./music";
import { CityLayer } from "./capitals";
import { CLANS, type ClanKey } from "../../shared/war/clans";
import { bindSfx, play as playSfx, sfxFrame } from "./sfx";
import { songweaverSfx, setSwornClan } from "./sfx";
import { DI_EVENTS, diEvent } from "./songbookFx";
import { setSongbook } from "./songbookData";
import { matOfItem } from "../../shared/lutemaker";
import { MATERIALS } from "../../shared/lute";
import { MAT_COLOR, matTexture, matTip } from "./matArt";
import { SoundCues } from "./soundCues";
import { MonsterBar } from "./monsterBar";
import { isMineOrGroup, monsterInfo, showWorldBar } from "./monsterInfo";
import { placeFloat, type FloatBox } from "./floatLanes";
import { CHORD_NAMES, MODE_COLOR, hasSongShield } from "./songTables";

const SONG_SFX = new Set(["note", "chord", "swell", "newsong", "matpick", "lutefit", "break", "resonate", "bounce", "soundhit", "shieldbreak"]);
import { attackMult, cooldownMult, critChance, heroSpeed, STATS, magicMult, STAT_KINDS, STAT_NAMES, StatKind, statPoints, HP_PER_STR } from "../../shared/powers";
import { NEED_TEXT, pointRange, SkillDef, skillOf, skillTarget, MAX_STACKS, STACK_DECAY_MS, STACK_NAME, talentBonus, withMods } from "../../shared/skills";
import { SkillFx } from "./skillfx";
import { BeastForms } from "./beastForms";
import { movesSheet, SkillMoves } from "./skillMoves";
import { displayGrid } from "./tileset";
import { CRAWL_CROP, heroTexture, itemTexture, potionTex, makeTileset, MOB_LOOK, mobLook, mobTexture, preloadPaintedMobs } from "./textures";
import { parseTroop, troopName, troopStance, type TroopStance } from "../../shared/war/troops";
import type { RoadEntry } from "../../shared/war/roads";
import type { ColumnsMsg } from "../../shared/war/marches";
import { WarFeud } from "./warFeud";
import { clanOfIndex } from "../../shared/war/view";
import { Minimap } from "./minimap";
import { fullscreenSupported, isFullscreen, onFullscreen, toggleFullscreen } from "./fullscreen";
import { SCREEN_SIZES, isSharp, onWorldScale, pct, setWorldScale, uiScale, worldScale, worldScaleName, worldScaleSetting } from "./worldscale";
import { showLevelNote } from "./hudLogic";
import { GameMenu } from "./gamemenu";
import { showMusicPanel, musicPanelOpen } from "./music";
import { DayDial } from "./daydial";
import { SignPanel } from "./signpanel";
import { NpcLayer } from "./npcs";
import { ANVIL_TOP, FORGE_FIRE } from "./smithy";
import { Villagers } from "./villagers";
import { keepOff, SALT_AREA, SALT_FOLK, saltmereSpots } from "./saltmereFolk";
import { SALT_TOWN } from "../../shared/saltmere";
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
import { refreshWalk, warmPaths } from "./pathfind";
import { holdTiles, setHoldOwners } from "../../shared/war/holdWalls";
import { pixelText } from "./pixeltext";
import { speechBubble } from "./weathered";
import { hasTrait, TITLES, unpackCosmetics } from "../../shared/cosmetics";
import { META, metaOf } from "../../shared/questSteps";
import { updateHidebound } from "./questConceptArt";
import { WarPlaque } from "./warPlaque";
import { WarRituals } from "./warRituals";
import { WarTroops } from "./warTroops";
import { WarStandards } from "./warStandards";
import { WarSack } from "./warSack";
import { WarTowns } from "./warTowns";
import { WarTabards } from "./warTabards";
import { WarNotice } from "./warNotice";
import { WarColumns } from "./warColumns";
import { WarBattle } from "./warBattle";
import { BATTLE } from "../../shared/war/battles";
import { CLAN_KEYS } from "../../shared/war/clans";
import { WarRoadFx } from "./warRoads";
import type { WarView } from "../../shared/war/view";
import { ART_K, CHAR_GROW, CHAR_SCALE, CHARACTERS, CHAR_ORIGIN, CharacterName, createArtAnims, ensureCharSheet, HD_CHARS, playCharAnim, preloadArt } from "./artAssets";
import { Ambient } from "./ambient";
import { Details, dayPhase, dayTime } from "./details";
import { activeOf, GearLayer, reqInfoOf, statsOf, GearMenu, iconCanvas, itemColor, preloadGear, RARITY_HEX, showItemCard } from "./gear";
import { hideCard } from "./gearCard";
/** pickSlot value while the slot list is choosing the left-click action. */
const LEFT_PICK = -2;
/** pickSlot value while the slot list is choosing the right-click (and Space) action. */
const RIGHT_PICK = -3;
type ClickSide = "left" | "right";
/** "12 mana · 20 heat" for a skill list. */
const costWords = (s: { cost?: number; mana?: number; blood?: number }) => [s.mana ? `${s.mana} mana` : "", s.cost ? `${s.cost} heat` : "", s.blood ? `${s.blood}% HP` : ""].filter(Boolean).join(" · ") || "free";
import { GearFx } from "./gearfx";
import { Element, ELEMENT_COLORS } from "../../shared/elements";
import { baseId, canWear, GEAR_SLOTS, gearName, gearDef, reqProblem, gearReachMult, gearSpeedMult, gearStats, itemRarity, WEAPON_TYPE_NAMES } from "../../shared/gear";
import { attackProfile, ATTACK_WORDS, isWeaponType, poseSheet, profileOf, weaponAttackMult, weaponOk } from "../../shared/weapons";
import { talentMult, talentPoints, spentPoints } from "../../shared/talents";
import { activeSkills, skillLearned } from "../../shared/slots";
import { TideHud } from "./tide";
import { DROP_KEY, LOCK_TIP, QuestCarry } from "./questCarry";
import { actionKey, actionOfKey, type KeyAction, keyMode, keyModeName, onKeyMode, setKeyMode, slotCount, slotKey, slotOfKey, wasdWalks } from "./keymode";
import { iconImg } from "./skillIcons";
import { TalentMenu } from "./talents";
import { feastOf, reactionHelp, setMyFeast, SidePanel, SideTab, wornOf } from "./sidepanel";
import { heroPanelParts } from "./heroPanelView";
import { lootFilter, onLootFilter } from "./lootfilter";
import { passesFilter, wearing } from "../../shared/heroSheet";
import { IdeaBoard } from "./ideas";
import { PatchNotesPanel } from "./patchnotes";
import { PartyUI } from "./party";
import { StashUI, TradeUI } from "./trade";
import { STASH_RANGE, STASHES } from "../../shared/trade";
import { afterLoading, hideLoading, loadingActive, loadingFor, setLoading, showLoading } from "./loading";
import { WaygateLayer } from "./waygate";
import { FerryLayer, FERRY_NO } from "./ferry";
import { WAYGATE_RANGE, WAYGATES } from "../../shared/act2";
import { CROWNWAYS } from "../../shared/crown";
import { ISO, IsoView, isoAnchor, isoInput, isoX, isoY, screenDir, screenDir8, screenOf, setBaseDepth } from "./iso";
import { hudOccludes, hudSlot } from "./hudSlots";
import { setupChatToggle } from "./chatToggle";
import { SMOOTH } from "./isoflag";
import { addPixelGrid } from "./pixelgrid";
import { paintSmoothProps } from "./smoothProps";
import { ChestLayer } from "./chests";
import { ShrineLayer } from "./shrine";
import { BOARD_H, BOARD_W, BountyUI } from "./bounty";
import { BOARDS, BOARD_RANGE } from "../../shared/bounty";
import { PortalLayer } from "./portal";
import { BOON_NAMES, WIND_BLESSING } from "../../shared/shrine";
import { BuffBar } from "./buffbar";
import { GrimoirePanel } from "./grimoire";
import { addWorldProps } from "./worldProps";
import { addSiegeWorks } from "./siegeArt";
import { SiegeWork } from "./siegeWork";
import { PERCH_LIFT } from "../../shared/bandits";
import { icon, fillIcons } from "./pixelicons";
import { ResourceBars } from "./resourceBars";
import { OverloadGauge } from "./overloadGauge";
import { bindElemFx } from "./elemFx";
import { bindHidekinFx } from "./hidekinFx";
import { ChampionFx } from "./championFx";
import { bindBeastFx } from "./beastFx";
import { bindRaiderFx, raiderTrail } from "./raiderFx";
import { hudRects, invalidateHud } from "./hudcache";
import { DungeonView } from "./dungeon";
import { TEXT_FONT, TEXT_PX, WT } from "./pixelfont";
import { parseRune, RUNES, RuneKey } from "../../shared/runes";
import { runeCss, runeTexture } from "./runeArt";
import { own } from "./own";

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
  titleLabel?: Phaser.GameObjects.Text; // heroes: the shown title, small and dim, between the name and the head
  pennant?: Phaser.GameObjects.Image; stripe?: Phaser.GameObjects.Image; // heroes sworn to a clan: pennant beside the name, stripe under it (warTabards.ts)
  feudMark?: Phaser.GameObjects.Text; // "Wanted by ..." over a marked hero's name (warFeud.ts)
  nameLift?: number;
  lvlColor?: string; // monsters: current colour of the "Lv N" label
  artOn?: boolean; // a clan trooper drawn with its painted sheet (until then an old monster look stands in)
  cartHp?: number; cartHurtAt?: number; // a supply cart: last seen hp and when it last took a hit (stagger frame)
  deadAt?: number; // a clan trooper: local time it fell (its fall frames)
  mob: boolean;
  hero?: CharacterName; // set when drawn with the animated 32x32 sheets
  waiting?: CharacterName; // a hero whose sheet is still loading: hidden and not animated until it arrives (sheetReady)
  culled?: boolean; // monster off screen: not drawn this frame
  top: number; // px from the feet to the top of the head, for the name label and chat bubble
  bar: Phaser.GameObjects.Graphics;
  bubble?: Phaser.GameObjects.Image;
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
interface Snap { t: number; x: number; y: number; rest?: boolean }
/**
 * Other heroes and monsters are drawn this far in the past, so there is always a newer server position to glide
 * towards. The server sends 20 updates a second (one per 50 ms) and some arrive late; 2 updates of slack hides that.
 */
const INTERP_DELAY = 2.2 * (1000 / TICK_RATE); // the least we play back behind the server
/** How late updates arrive (ms past their smoothed stamp): the peak, fading over a few seconds. */
let lateness = 0;
/**
 * How far behind the newest update others are played back (ms). A fixed 110 ms ran dry on a jittery connection or
 * a busy server: monsters froze, then jumped ahead when the late updates came in. It now grows with the lateness
 * seen lately (up to 350 ms) and shrinks back slowly on a steady one; see stepInterpDelay.
 */
let interpDelay = INTERP_DELAY;
function stepInterpDelay(dtMs: number) {
  const want = Math.min(350, Math.max(INTERP_DELAY, 60 + lateness * 1.2));
  const max = dtMs * 0.03; // at most 3% faster or slower playback, so the change itself isn't seen
  interpDelay += Math.max(-max, Math.min(max, want - interpDelay));
}
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
  // Late by a lot (a quiet spot with no updates, or a long stall): start the clock again from now. Otherwise keep the
  // 50 ms rhythm, even for updates that arrive bunched up right after a late one: capping those at "now" stamped them
  // a millisecond apart, so their steps played back in a few ms and heroes and monsters jumped instead of walking.
  stamp = now - guess > 250 || guess - now > 300 ? now : guess + (now - guess) * 0.1;
  lateness = Math.max(now - stamp, lateness * 0.99);
  if (stamp > now) lateness = Math.max(stamp - now, lateness); // early stamps (a bunch after a late one) need the slack too
  return stamp;
}
/**
 * Record a server position for an entity (several field changes of one update count once). An entity that stood still
 * sends no updates, so before the first step after a pause the old spot is stamped again one tick earlier: otherwise
 * the blend runs over the whole pause and the first step jumps. Only after a real stop (the last two snaps at one
 * spot, or a single snap), so a stall in the updates of a moving entity doesn't pull it back; marked `rest` so
 * interpolate doesn't carry a one-off step (a knockback) on at that one-tick speed.
 */
function pushSnap(e: { snaps?: Snap[] }, x: number, y: number) {
  const s = (e.snaps ??= []), t = patchTime(), tick = 1000 / TICK_RATE;
  const last = s[s.length - 1];
  if (last && t - last.t < 1) { last.x = x; last.y = y; return; }
  const prev = s[s.length - 2], stood = !prev || (prev.x === last?.x && prev.y === last?.y);
  if (last && stood && t - last.t > 2 * tick && (last.x !== x || last.y !== y)) s.push({ t: t - tick, x: last.x, y: last.y, rest: true });
  s.push({ t, x, y });
  if (s.length > 12) s.splice(0, s.length - 12);
}
/**
 * A teleport (respawn, portal, a monster moved home) rather than movement: the new server spot is far from the last
 * one, or the drawn sprite is very far behind. Played-back entities trail the server by interpDelay, so measuring
 * from the sprite (as before, at 48 px) snapped fast movers on a laggy connection.
 */
/** Camera follow smoothing (per frame); snapCamera() sets it to 1 for a jump. */
const CAM_LERP = 0.15;
function teleported(e: { snaps?: Snap[]; sprite: { x: number; y: number } }, x: number, y: number): boolean {
  const s = e.snaps, n = s?.length ?? 0;
  const prev = n >= 2 ? s![n - 2] : undefined; // the newest snap is the spot just pushed
  return (!!prev && Math.hypot(x - prev.x, y - prev.y) > 64) || Math.hypot(e.sprite.x - x, e.sprite.y - y) > 240;
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
  if (!a || a.rest || b.t - a.t < 1) return b; // a first step from rest: no speed to carry on yet
  const over = Math.min(t - b.t, 1000 / TICK_RATE * 1.5), k = over / Math.max(1, b.t - a.t);
  return { x: b.x + (b.x - a.x) * k, y: b.y + (b.y - a.y) * k };
}

const FRAME_BASE: Record<string, number> = { down: 0, up: 2, right: 4, left: 4 };
/** Iso monster sheets have attack frames after the walk ones: wind-up, then strike, per facing. */
const ATTACK_BASE: Record<string, number> = { down: 6, up: 8, right: 10, left: 10 };
/** Name colours of clan troopers by how their clan sees this hero (TownScene.trooperLabel). */
const TROOP_COLOURS: Record<TroopStance, string> = { ally: "#8fe388", neutral: "#c8c8c8", enemy: "#ff6b5e" };
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
const PIXEL_FONT = TEXT_FONT;

/** Goo colours of the blobs (match their painted sheets), for the splash when one is struck. */
const GOO: Record<string, number> = { slime: 0x5fae4c, blobling: 0x8cc955, shooterblob: 0x7f5cb8, warriorblob: 0xb94a32, healerblob: 0xd9aec6, venomblob: 0x6aa82a, frostblob: 0x9fd8f4, fireblob: 0xd04a1a, stormblob: 0x6a6ad8 };

const tipEsc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** While a skill key, the right mouse button or Space is held, the spell is asked for this often (ms). */
const CAST_REPEAT_MS = 90;

export class TownScene extends Phaser.Scene {
  private room!: Room;
  /** The monsters near the hero (the server only sends those), see mobFeed.ts. */
  private mobs = new MobFeed();
  private me = "";
  private entities = new Map<string, Entity>();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private input_: InputState = { up: false, down: false, left: false, right: false };
  private stopSeq = 0; // seq of our last "stand still" input
  private stoppedAt = 0;
  private seq = 0;
  // Reconciling our predicted hero with the server while walking (see reconcile)
  private sentAt = new Map<number, number>(); // input seq -> performance.now() it left
  private ackSeq = 0; // newest input seq the server has echoed back
  private reconciledAt = -1; // patchSeq of the update reconcile last ran for
  private rtt = 150; // smoothed ms from sending an input to seeing it in a server update
  private predHist: Snap[] = []; // where our predicted hero stood, recent frames (performance.now())
  private corrX = 0; private corrY = 0; // server - prediction still to be blended in
  private useKey = () => {}; // E / G: talk, open, use what is right here
  private bagKey = () => {};
  private heldSlot = -1;
  /** The torch (L): a wide pool of light (no flame drawn on the hero) at night and underground. Lit unless put out; remembered. */
  private torch = (() => { try { return localStorage.getItem("torch") !== "0"; } catch { return true; } })();
  private slotCastAt = 0;
  private pointer?: PointerControls;
  /**
   * What a left / right click (and Space) does: "" = the main-hand weapon's attack, or a skill / basic spell id.
   * Saved per hero in this browser (Murat 2026-11-05: both clicks take any skill or the weapon attack).
   */
  private clickPick: Partial<Record<ClickSide, { hero: string; skill: string }>> = {};
  private npcs?: NpcLayer;
  private villagers?: Villagers;
  private saltFolk?: Villagers;
  private watch?: WatchLayer;
  private wrathBanner?: WrathBanner;
  private torches?: GateTorches;
  private chests?: ChestLayer;
  private shrine?: ShrineLayer;
  private bounty?: BountyUI;
  private tide?: TideHud; // the Gloam Tide meter, banners and gate marker (client/src/tide.ts)
  private qcarry?: QuestCarry; // carried lantern and held mill (client/src/questCarry.ts)
  private portals?: PortalLayer;
  private waygates?: WaygateLayer;
  private ferry?: FerryLayer;
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
  private champFx?: ChampionFx; // champions (shared/champions.ts): tint, glow, icons, painted details, their moments
  private areaName = "";
  private areaTimer?: number;
  private shots = new Map<string, { g: Phaser.GameObjects.GameObject & { x: number; y: number }; tx: number; ty: number; at: number; dx: number; dy: number; spd: number }>();
  private fx!: SkillFx;
  /** Broken monsters a hero can still execute (shared/combat.ts EXECUTE), with when they broke (client clock). */
  private execReady = new Map<string, number>();
  private moves!: SkillMoves; // melee skill micro sequences (skillMoves.ts)
  private forms!: BeastForms; // the vampire's Bat Form / Wolf Form (beastForms.ts)
  private gearFx!: GearFx; // item level effects on heroes
  private attackHoldUntil = 0; // local clock (ms) the shared attack timer is estimated to run until
  private lastCast: Record<string, number> = {}; // local clock (ms) of my last cast of each skill, for cooldowns
  private monsterBar?: MonsterBar;
  private barId?: string; // the monster the top bar described last frame
  /** When I or my group last hurt each monster (ms, scene time): its world HP bar stays for RECENT_HIT_MS (monsterInfo.ts). */
  private lastMineHit = new Map<string, number>();
  private floatLive: FloatBox[] = [];
  private items = new Map<string, Phaser.GameObjects.Image>();
  private lastDodge = -Infinity;
  private rootUntil = 0; // local clock: my dash is gliding to the server's spot until then (no prediction)
  private lastRanged = -Infinity;
  private heroFrom?: number;
  private heroSig = "";
  private heroSigL = "";
  /** Titles this hero may pick (TITLES indices, server "title"). */
  private titlesOwned: number[] = [];
  private levelFrom?: number; // level before the level-ups the player hasn't looked at yet
  private clearedTimer?: number;
  private gearMenu?: GearMenu;
  private talentMenu?: TalentMenu;
  private side?: SidePanel;
  private hotbarHtml = "";
  private buffBar?: BuffBar;
  private grimoire?: GrimoirePanel;
  private resBars?: ResourceBars;
  private heatGauge?: OverloadGauge;
  private warPlaque?: WarPlaque;
  private warStd?: WarStandards;
  private tabards?: WarTabards; // clan pennants and Renown titles on heroes' name tags ("oaths")
  private warTroops?: WarTroops;
  private warRituals?: WarRituals; // the Veiled noon ritual circle ("rituals", server/warRituals.ts)
  private feud?: WarFeud; // feuds: provoke, Wanted badge and marks ("feud", "wanted", server/warFeuds.ts)
  private city?: CityLayer; // the capital cities: props, guards, the war table and the NPC panels (capitals.ts)
  private warTowns2?: WarTowns; // capturable towns: banners, watch, claim prompt ("towns", "townclaim", server/warTowns.ts)
  private sack?: WarSack; // sacking Holds: banner prompt, progress, sacked banners ("holds", "sack", server/warHolds.ts)
  /** W4 marching columns: the war roads and the columns as last sent (server/warMarches.ts); kept for the map overlay to draw. */
  warRoads: RoadEntry[] = [];
  warColumns?: ColumnsMsg;
  private warCols = new WarColumns(); // W4: roads and columns placed on the clock (warColumns.ts), read by the maps and the plaque
  private warRoadFx?: WarRoadFx; // the trampled-track ground decal near the hero (warRoads.ts)
  private warNotice?: WarNotice;
  private warBattle = new WarBattle((t) => this.warNotice?.say(t)); // W5 big battles: notices, bar, result, markers (warBattle.ts)
  private corpses = 0; // trooper corpses lying now (capped inside a big battle)
  /** How a server clan trooper sees this hero (shared/war/troops.ts troopStance), from the oath the "clan" message brought. */
  private troopStanceOf(weapon: string): TroopStance {
    const t = parseTroop(weapon), me = (this.room?.state as any)?.players?.get(this.me);
    if (!t || !me) return "neutral";
    return troopStance(t.clan, { clan: this.warStd?.clan || undefined, level: me.level, feud: this.feud?.state });
  }
  private warLast?: WarView;
  private soundCues = new SoundCues();
  private statsShown = "";
  private deathTimer?: number;
  private iso?: IsoView;
  private dungeon?: DungeonView;

  constructor(private opts: { name: string; password: string; color: number; cls: ClassKind; newGame?: boolean }) {
    super("town");
  }

  preload() {
    this.load.on("progress", (v: number) => setLoading("Loading the art", v * 0.45));
    preloadArt(this, this.opts.cls);
    preloadGear(this);
    preloadPaintedMobs(this);
  }

  async create() {
    this.fx = new SkillFx(this, (id) => this.entities.get(id), () => this.me);
    this.gearFx = new GearFx(this.fx);
    this.moves = new SkillMoves(this, this.fx);
    this.forms = new BeastForms(this, this.fx);
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
    // The Mawdeep Warrens below the woods: cave walls, braziers, ropes and stairs, and the dark down there
    this.dungeon = new DungeonView(this, {
      me: () => { const e = this.entities.get(this.me); return e ? { x: e.sprite.x, y: e.sprite.y } : undefined; },
      eachHero: (fn) => { for (const e of this.entities.values()) if (!e.mob && e.sprite.visible) fn(e.sprite.x, e.sprite.y); },
    }, PIXEL_FONT);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    // ?zoom=N (viewing aid, like ?look): another camera zoom
    const zq = Number(new URLSearchParams(location.search).get("zoom"));
    cam.setZoom(zq > 0 && zq <= 6 ? zq : 3);
    cam.roundPixels = !SMOOTH;
    if (SMOOTH && cam.postFX) {
      // Moody grade for the painted world (the HUD is HTML, so it is not affected): muted colours, deeper contrast,
      // a dark vignette around the edges
      // Gloomy and dark (Murat 2026-11-07: "too cute"): colour drained, darker overall, heavy vignette
      const cm = cam.postFX.addColorMatrix();
      this.grade = cm;
      this.setGrade(1);
      cam.postFX.addVignette(0.5, 0.5, 0.82, 0.55);
      addPixelGrid(cam); // one pixel density for everything in the world
    }
    if (ISO) this.iso = new IsoView(this);

    // Keys without capture so typing in chat still works
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,Q,C,G,T,F,R,E,J", false) as any;
    // Space = right click at the mouse cursor (Murat 2026-11-05; it used to be a plain basic attack)
    // In the spell keys layout, Space with no spell on the right click is a left click: walk there / attack (Murat 2026-11-07)
    this.input.keyboard!.on("keydown-SPACE", (ev: KeyboardEvent) => {
      if (!ev.repeat && !this.chatting()) this.pointer?.spaceDown(keyMode() === "spells" && !this.rightSkill() ? 0 : 2);
    });
    this.input.keyboard!.on("keyup-SPACE", () => this.pointer?.spaceUp());
    // Spell keys layout: hold Tab to stand still, so a click (or Space) attacks in place instead of walking
    window.addEventListener("keydown", (ev) => {
      if (ev.key !== "Tab" || keyMode() !== "spells" || this.chatting() || !this.pointer) return;
      ev.preventDefault(); // Tab must not move the browser's focus
      this.pointer.standHeld = true;
    });
    window.addEventListener("keyup", (ev) => { if (ev.key === "Tab" && this.pointer) this.pointer.standHeld = false; });
    window.addEventListener("blur", () => { if (this.pointer) this.pointer.standHeld = false; });
    // Skill slots and the other game keys come from the keyboard layout picked in the game menu (client/src/keymode.ts):
    // classic (skills on 1-0) or spell keys (W E R T 1-5). With the skill tree open and the mouse over a learned skill,
    // a slot key puts that skill in the slot instead of using it.
    const slotPress = (n: number, ev: KeyboardEvent) => {
      if (ev.repeat) return; // held keys repeat in update(), at the cast rate, not the OS key repeat
      const hover = this.talentMenu?.open ? this.talentMenu.hoveredActive() : undefined;
      if (hover) { this.room?.send("assign", { slot: n, skill: hover }); return; }
      this.castSlot(n); // the key casts its skill right away, toward the mouse cursor (Murat 2026-11-05)
      this.heldSlot = n; this.slotCastAt = this.time.now;
    };
    this.input.keyboard!.on("keydown", (ev: KeyboardEvent) => {
      if (this.chatting() || ev.ctrlKey || ev.metaKey || (ev.altKey && ev.key === "Enter")) return; // Alt is allowed: you can hold it to read a monster and still fight
      if (ev.key.toUpperCase() === DROP_KEY && !ev.repeat && this.qcarry?.carrying(this.me)) { this.qcarry.drop(); return; } // put the lantern down
      const n = slotOfKey(ev);
      // Spell keys: E is a spell key, but when a prompt says "E: talk / open / use" right here, E does that instead
      if (n >= 0 && ev.key.toUpperCase() === "E" && keyMode() === "spells" && this.canUse()) { if (!ev.repeat) this.useKey(); return; }
      if (n >= 0) { slotPress(n, ev); return; }
      const act = actionOfKey(ev);
      if (act && !ev.repeat) this.keyAction(act);
    });
    this.input.keyboard!.on("keyup", (ev: KeyboardEvent) => { if (this.heldSlot >= 0 && slotOfKey(ev) === this.heldSlot) this.heldSlot = -1; });
    window.addEventListener("blur", () => { this.heldSlot = -1; }); // the key-up never comes when the window loses focus
    // L: light or put out the torch (a wider light around the hero at night)
    this.input.keyboard!.on("keydown-L", (ev: KeyboardEvent) => {
      if (ev.repeat || this.chatting()) return;
      this.torch = !this.torch;
      try { localStorage.setItem("torch", this.torch ? "1" : "0"); } catch { /* storage off */ }
      this.chatMessage("", "Torch", this.torch ? "You light your torch (L to put it out)." : "You put out your torch.");
    });
    onKeyMode(() => { this.heldSlot = -1; this.hotbarHtml = ""; this.keyLabels(); });
    this.keyLabels();
    this.setupHotbar();
    this.useKey = () => {
      if (!this.npcs?.isOpen && this.chests?.interact()) return; // a loot chest right here comes first
      if (!this.npcs?.isOpen && this.dungeon?.nearDoor) { this.room?.send("door", { id: this.dungeon.nearDoor.id }); return; } // a Mawdeep gate
      if (!this.npcs?.isOpen && this.stash?.interact()) return; // the account stash on the square
      if (this.bounty?.open) { this.bounty.close(); return; }
      if (this.warStd?.open) { this.warStd.close(); return; }
      if (!this.npcs?.isOpen && this.bounty?.interact()) return; // a bounty board
      if (!this.npcs?.isOpen && this.shrine?.interact()) return; // then the forest shrine
      if (!this.npcs?.isOpen && this.portals?.interact()) return; // then a portal stone's travel list
      if (!this.npcs?.isOpen && this.waygates?.interact()) return; // then Act 2's waygate
      if (!this.npcs?.isOpen && this.ferry?.interact()) return; // Pell's boat at a jetty (also closes its list)
      if (!this.npcs?.isOpen && !this.npcs?.busy && this.sack?.interact()) return; // raise a banner in a hostile Hold (warSack.ts)
      if (!this.npcs?.isOpen && !this.npcs?.busy && this.city?.interact()) return; // study a capital's war table
      if (!this.npcs?.isOpen && !this.npcs?.busy && this.warTowns2?.interact()) return; // raise a banner at a contested town's gate (warTowns.ts)
      if (!this.npcs?.isOpen && !this.npcs?.busy && this.warStd?.interact()) return; // a clan war standard (anything else here comes first)
      this.npcs?.interact();
    };
    const toggleQuestLog = () => {
      if (!this.npcs) return;
      const open = this.npcs.log.open;
      this.closeMenus();
      this.npcs.log.toggle(!open);
    };
    this.input.keyboard!.on("keydown-J", () => { if (!this.chatting()) toggleQuestLog(); });
    // Quests button under the minimap
    const questBtn = document.getElementById("questbtn")!;
    document.getElementById("menubtns")!.prepend(questBtn); // with the other menu tiles beside the angel
    questBtn.title = "Quests (J)";
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
      else if (b?.dataset.title !== undefined) this.room?.send("title", { i: Number(b.dataset.title) }); // the server answers "title"; the label follows Player.cosm
    });
    // Hovering a + shows on the Character tab what that point would change
    heroEl.addEventListener("mouseover", (ev) => {
      const k = ((ev.target as HTMLElement).closest("button") as HTMLElement | null)?.dataset.stat as StatKind | undefined;
      const mine = this.entities.get(this.me)?.state;
      if (!k || !mine) { this.side?.setPreview(); return; }
      const pts = { sta: own(mine).ptSta, str: own(mine).ptStr, mag: own(mine).ptMag, dex: own(mine).ptDex };
      pts[k]++;
      this.side?.setPreview({ label: `add a point to ${STAT_NAMES[k]}`, pts });
    });
    heroEl.addEventListener("mouseleave", () => this.side?.setPreview());
    // Character / Inventory / Skills share one side panel with tabs (sidepanel.ts)
    this.side = new SidePanel((tab) => this.openSide(tab, false), () => this.side?.close());
    this.gearMenu = new GearMenu(this, (type, msg) => this.room?.send(type, msg));
    const toggleGear = () => this.openSide("gear");
    this.bagKey = toggleGear;
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
    this.ideaBoard = new IdeaBoard((type, msg) => this.room?.send(type, msg));
    const toggleIdeas = () => { if (!this.ideaBoard!.open) this.closeMenus(); this.ideaBoard!.toggle(); };
    this.input.keyboard!.on("keydown-I", () => { if (!this.chatting()) toggleIdeas(); });
    // Player groups: invite nearby heroes / leave (P or the Group button)
    this.monsterBar = new MonsterBar(document.getElementById("hud")!);
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
      { id: "keys", label: "", onClick: () => { setKeyMode(keyMode() === "classic" ? "spells" : "classic"); this.gameMenu?.show(); } },
      { id: "worldsize", label: "", onClick: () => {},
        // Screen size dropdown (client/src/worldscale.ts): world, menus and bars together
        choices: () => [
          { value: "auto", label: `Auto: fits window (${pct(worldScale())})`, on: worldScaleSetting() === "auto", wide: true },
          ...SCREEN_SIZES.map((k) => ({ value: String(k), label: pct(k), on: worldScaleSetting() === k, dim: !isSharp(k) })),
        ],
        note: "Bright sizes keep pixels sharp",
        onChoose: (v) => setWorldScale(v === "auto" ? "auto" : Number(v)) },
      { id: "fullscreen", label: "", onClick: () => toggleFullscreen() },
      { id: "quit", label: `${icon("fire")}Save and return to start screen`, onClick: () => void this.saveAndQuit() },
    ]);
    // Keyboard layout setting (client/src/keymode.ts): its entry says which one is on; clicking switches
    const keysLabel = () => this.gameMenu?.setLabel("keys", `${icon("scroll")}Keyboard: ${keyModeName()} <small>click to switch</small>`);
    keysLabel();
    onKeyMode(keysLabel);
    // Screen size (client/src/worldscale.ts): its entry shows the size in use
    const sizeLabel = () => this.gameMenu?.setLabel("worldsize", `${icon("star")}Screen size: ${worldScaleName()} <small>choose</small>`);
    sizeLabel();
    onWorldScale(sizeLabel);
    // Full screen (client/src/fullscreen.ts): its entry says on / off
    const fsLabel = () => this.gameMenu?.setLabel("fullscreen", fullscreenSupported()
      ? `${icon("star")}Full screen: ${isFullscreen() ? "on" : "off"} <small>[Alt+Enter]</small>`
      : `${icon("star")}Full screen: not on this browser`);
    fsLabel();
    onFullscreen(fsLabel);
    this.patchNotes = new PatchNotesPanel(toggleNews);
    this.input.keyboard!.on("keydown-N", () => { if (!this.chatting()) toggleNews(); });
    this.setupChat();
    this.setupPointer();

    setLoading("Joining Oakvale", 0.5);
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = import.meta.env.DEV ? `${proto}://${location.hostname}:2567` : `${proto}://${location.host}`;
    try {
      this.room = await new Client(url).joinOrCreate("town", this.opts);
      this.room.send("lootfilter", lootFilter());
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
    this.npcs.log.map = { show: (x, y) => this.minimap?.showAt(x, y), can: (x, y) => !!this.minimap?.canShow(x, y) }; // quest log: Show on map
    // A shop opens the bag beside it (Murat 2026-11-08): hovering a piece for sale shows its item card with what it would change
    let bagByShop = false;
    this.npcs.onShopOpen = (open) => {
      const side = this.side;
      if (!side) return;
      if (open && !side.open) { side.show("gear"); this.gearMenu?.reset(this.entities.get(this.me)?.state); bagByShop = true; }
      else if (open && side.tab !== "gear") { side.show("gear"); this.gearMenu?.reset(this.entities.get(this.me)?.state); }
      else if (!open && bagByShop) { side.close(); bagByShop = false; }
      document.body.classList.toggle("shopping", open);
    };
    this.npcs.onPreview = (id, row) => {
      const st = this.entities.get(this.me)?.state;
      if (!id || !st || !row) return hideCard();
      showItemCard(st, id, row, "For sale"); // the compare card, level with the row in the shop dialog
    };
    this.npcs.objects.setLight((x, y, lift, color = 0x7ff3ff, scale = 1.5) => this.details?.addLight(x, y, color, scale, 0.55, 0.06, lift)); // lit spirit lanterns and watch-fires shine at night
    // Morwen's camp and Brann's forge after dusk: coal glow under her brew, lantern light in the tent doorway
    for (const d of NPC_DECOR) {
      if (d.prop === "wc_rig") this.details?.addLight(d.x * TILE, d.y * TILE, 0xff6a2a, 1.5, 0.6, 0.15, 9, -7);
      if (d.prop === "wc_tent") this.details?.addLight(d.x * TILE, d.y * TILE, 0xffa040, 1.3, 0.5, 0.1, 17, 3);
      // Brann's forge: the coal bed and the ash-pit arch; a faint glow off the blade cooling on the anvil
      if (d.prop === "sm_forge") this.details?.addLight(d.x * TILE, d.y * TILE, 0xff7a2a, 2.1, 0.7, 0.2, FORGE_FIRE[1], FORGE_FIRE[0]);
      if (d.prop === "sm_anvil") this.details?.addLight(d.x * TILE, d.y * TILE, 0xff6a2a, 0.35, 0.3, 0.1, ANVIL_TOP, 2);
    }
    this.villagers = new Villagers(this); // townsfolk idling on the square
    // Saltmere's fisherfolk: cosmetic like Oakvale's, no outlaw rule here, idle unless the hero is within 30 tiles
    this.saltFolk = new Villagers(this, {
      area: SALT_AREA, folk: SALT_FOLK, wrath: false, spots: saltmereSpots(), keepOff, dark: () => dayPhase(dayTime(Date.now())).dark,
      active: { x: (SALT_TOWN.x + SALT_TOWN.w / 2) * TILE, y: (SALT_TOWN.y + SALT_TOWN.h / 2) * TILE, r: 30 * TILE },
    });
    // Colyseus 0.16: change callbacks go through the state callback proxy (the state itself only holds data)
    const $ = getStateCallbacks(this.room) as (v: any) => any;
    this.watch = new WatchLayer(this, $(this.room.state).watch); // watchmen at the gates
    this.torches = new GateTorches(this); // torches at the gates, lit by the watch at dusk
    this.watch.torches = this.torches;
    this.room.onMessage("quest", (msg) => this.npcs?.onQuest(msg));
    this.room.onMessage("choice", (msg) => this.npcs?.onChoice(msg));
    this.room.onMessage("questuse", ({ id }) => this.npcs?.objects.burst(id));
    this.room.onMessage("rumour", (m) => this.npcs?.rumours.onMessage(m)); // Mags' tavern rumours (client/src/rumours.ts)
    this.room.onMessage("mentor", (m) => this.npcs?.onMentor(m)); // Hale's mentoring (client/src/npcs.ts)
    this.room.onMessage("title", (m: { i?: number; owned?: number[] }) => { // owned titles for the picker in the hero panel
      if (Array.isArray(m?.owned)) this.titlesOwned = m.owned.filter((i) => Number.isInteger(i) && i > 0 && i < TITLES.length);
      this.heroSig = ""; this.heroSigL = "";
    });
    this.room.send("title", {}); // fetch the owned titles once
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
    this.qcarry = new QuestCarry(this, document.getElementById("hud")!, (type, msg) => this.room.send(type, msg));
    this.room.onMessage("qstate", (m) => this.qcarry?.onState(m));
    this.tide = new TideHud(document.getElementById("hud")!);
    this.room.onMessage("tide", (m) => this.tide?.onTide(m));
    // Bounty boards on the square and by every portal stone (shared/bounty.ts)
    this.bounty = new BountyUI(this, (type, msg) => this.room.send(type, msg), PIXEL_FONT);
    this.room.onMessage("bounty", (v) => this.bounty?.show(v, (text, color) => {
      const me = this.entities.get(this.me)?.sprite;
      if (me) this.floatText(me.x, me.y - 30, text, color, PIXEL_FONT, 1.3);
      this.feed(text);
    }));
    this.room.onMessage("writ", (v) => {
      if (v && v.active !== undefined && this.minimap) this.minimap.writ = v.active; // the writ's land is outlined on the maps
      this.bounty?.showWrit(v, (text, color) => {
        const me = this.entities.get(this.me)?.sprite;
        if (me) this.floatText(me.x, me.y - 30, text, color, PIXEL_FONT, 1.3);
        this.feed(text);
      });
    });
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
    this.room.onMessage("travel", ({ id, from, to, x, y, why }) => {
      if (!why) this.portals?.travelled(from, to); // a quest warp (seen while unseen) has no stone at either end
      const e = this.entities.get(id);
      if (!e) return;
      e.sprite.setPosition(x, y); e.tx = x; e.ty = y; e.lastX = x; e.lastY = y; // a jump, not a walk
      if (id === this.me && why === "ferry") { this.ferry?.close(); this.jumped(); this.arrive(8, 28, 44, 650); } // the boat: a short sea-blue fade
      else if (id === this.me && why) { this.jumped(); this.arrive(18, 4, 8, 650); } // seen, dragged back: a short dark-red fade
      else if (id === this.me) { this.portals?.close(); this.jumped(); this.arrive(40, 14, 4, 700); } // warm glow, then the new place
    });
    // Act 2's waygate (shared/act2.ts): through to the other act; the loading screen stays up while that land is drawn
    this.waygates = new WaygateLayer(this, (type) => this.room?.send(type));
    this.room.onMessage("waygate", ({ id, to, x, y }) => {
      const e = this.entities.get(id);
      if (!e) return;
      e.sprite.setPosition(x, y); e.tx = x; e.ty = y; e.lastX = x; e.lastY = y;
      if (id !== this.me) return;
      this.jumped(); this.snapCamera();
      showLoading(to === "desert" ? "Crossing into the Sunscar…" : to === "moors" ? "Crossing into the Grey Barrow Moors…" : to === "badlands" ? "Crossing into the Red Badlands…" : to === "sinkholes" ? "Going down into the Mawdeep Sinkholes…" : to === "sinkway" ? "Climbing back up to Oakvale…" : to.startsWith("crown_") ? "Crossing into the Crown of the Marches…" : to.startsWith("crownway_") ? `Crossing home to ${CROWNWAYS.find((c) => `crownway_${c.from}` === to)?.land ?? "your homeland"}…` : "Crossing home to Oakvale…");
      this.settled = 0;
      if (to === "moors") this.cameras.main.fadeIn(1200, 30, 36, 44); else if (to === "badlands") this.cameras.main.fadeIn(1200, 70, 28, 14); else if (to === "sinkholes") this.cameras.main.fadeIn(1200, 22, 30, 14); else if (to.startsWith("crown_")) this.cameras.main.fadeIn(1200, 44, 40, 34); else this.cameras.main.fadeIn(1200, 60, 30, 8);
    });
    // Down a rope or a stair in the Mawdeep (shared/dungeon.ts LINKS): a jump to the other end, a fade through the dark
    this.room.onMessage("descend", ({ id, x, y }) => {
      const e = this.entities.get(id);
      if (!e) return;
      e.sprite.setPosition(x, y); e.tx = x; e.ty = y; e.lastX = x; e.lastY = y;
      if (id === this.me) { this.jumped(); this.arrive(6, 4, 3, 600); }
    });
    this.ferry = new FerryLayer((type, msg) => this.room?.send(type, msg));
    this.npcs!.onFerry = () => this.ferry?.open();
    this.room.onMessage("ferryno", ({ why }) => {
      const e = this.entities.get(this.me);
      const text = FERRY_NO[String(why)];
      if (e && text) this.floatText(e.sprite.x, e.sprite.y - 22, text, "#ffa22e", PIXEL_FONT);
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

    this.room.onStateChange((st: any) => { patchSeq++; this.dungeon?.setDoors(st.doors ?? ""); });
    const players = $(this.room.state).players;
    players.onAdd((p: any, id: string) => {
      this.addEntity(id, p);
      $(p).onChange(() => {
        const e = this.entities.get(id);
        if (!e) return;
        e.tx = p.x; e.ty = p.y;
        pushSnap(e, p.x, p.y);
        if (id === this.me) { this.reconcile(e, p); return; }
        // Snap on respawn / large correction
        if (teleported(e, p.x, p.y)) { e.sprite.setPosition(p.x, p.y); e.snaps = [{ t: patchTime(), x: p.x, y: p.y }]; }
      });
      if (id !== this.me) return;
      // Our input ack (seq) lives in `me` (owner-only), whose changes don't fire Player's onChange: an update where only
      // seq moved (walking into a wall) must still ack the input and feed the RTT. Hooked on the `me` instance itself:
      // at once if it's here already, else when it lands (listen). Callbacks run after the whole patch is decoded, so
      // reconcile sees x / y and seq of the same update either way; reconciledAt keeps it to once per update.
      let hooked: unknown, off: (() => void) | undefined;
      const hookMe = (me: any) => {
        if (!me || me === hooked) return;
        hooked = me; off?.();
        off = $(me).onChange(() => {
          const e = this.entities.get(id);
          if (e && id === this.me) this.reconcile(e, p);
        });
      };
      hookMe(p.me);
      $(p).listen("me", (me: any) => { hooked = undefined; hookMe(me); }); // the decoded instance: (re)hook on it for sure
    });
    players.onRemove((_p: any, id: string) => this.removeEntity(id));

    // Monsters come in their own message (only those near the hero), just before the state patch of the same update
    const mobs = (this.mobs = new MobFeed()); // fresh each join: the server starts over too
    let mobSeq = -1;
    this.room.onMessage("mv", (msg: MobViewMsg) => {
      if (patchSeq === mobSeq) patchSeq++; // no state patch since the last one: this is a new update all the same
      mobSeq = patchSeq;
      mobs.apply(msg);
    });
    mobs.onAdd((m: any, id: string) => {
      this.addEntity(id, m, true);
      m.onChange(() => {
        const e = this.entities.get(id);
        if (!e) return;
        e.tx = m.x; e.ty = m.y;
        pushSnap(e, m.x, m.y);
        // A respawned Mother Blob can come back at another level, a skeleton with another weapon
        if (m.kind === "motherblob" || m.kind === "skeleton" || m.kind === "bandit" || m.kind === "demon" || m.kind === "trooper" || m.champion) { // a Hide-Stitched champion changes skin
          const key = mobTexture(this, m.kind, m.level, m.weapon, m.bones, !!m.champion);
          if (e.sprite.texture.key !== key) { e.sprite.setTexture(key, 0); this.perch(e, m); }
        }
        if (teleported(e, m.x, m.y) && !(this.time.now < (e.leapUntil ?? 0))) { e.sprite.setPosition(m.x, m.y); e.snaps = [{ t: patchTime(), x: m.x, y: m.y }]; }
        if ((m.merged || 1) !== (e.merged ?? 1)) this.growMob(e, m);
      });
    });
    mobs.onRemove((_m: any, id: string) => this.removeEntity(id));
    this.room.send("mvready");

    const shots = $(this.room.state).projectiles;
    shots.onAdd((s: any, id: string) => {
      const size = s.size || 1;
      // Every kind has its own look, trail and impact in skillfx.ts; a plain fireball is the fallback
      const g = this.fx.addShot(id, s) ?? this.add.circle(s.x, s.y, 2.5 * size, 0xff9f1c).setStrokeStyle(1, 0xffe066).setDepth(9000);
      const shot = { g, tx: s.x, ty: s.y, at: this.time.now, dx: s.vx ?? 0, dy: s.vy ?? 0, spd: 0 };
      this.shots.set(id, shot);
      $(s).onChange(() => {
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
    const fields = $(this.room.state).fields;
    fields?.onAdd((f: any, id: string) => this.fx.addField(id, f));
    fields?.onRemove((_f: any, id: string) => this.fx.removeField(id));

    const items = $(this.room.state).items;
    items.onAdd((it: any, id: string) => {
      if (it.kind === "quest" && it.owner !== this.room.sessionId) return; // someone else's quest drop
      const mat = it.kind === "mat" ? matOfItem(it.gear) : undefined; // a Songweaver material: Item.gear is `mat_<id>`, Item.amount the count
      const gear = !mat && it.kind === "gear" && gearDef(it.gear);
      const rune = it.kind === "gear" ? parseRune(it.gear) : undefined; // a loose rune (shared/runes.ts)
      const matGrey = !!mat && this.opts.cls !== "songweaver"; // only a Songweaver can pick it up: others see it greyed
      const img = mat
        ? this.add.image(it.x, it.y, matTexture(this, mat, matGrey)).setScale(0.9).setDepth(it.y - 8)
        : rune
        ? this.add.image(it.x, it.y, runeTexture(this, rune)).setScale(0.6).setDepth(it.y - 8)
        : gear
        ? this.add.image(it.x, it.y, "gear_icons", baseId(it.gear)).setScale(0.6 / ART_K).setDepth(it.y - 8)
        : this.add.image(it.x, it.y, itemTexture(this, it.kind === "quest" ? `q_${it.gear}` : it.kind === "potion" || it.kind === "mpotion" ? potionTex(it.kind, Number(it.gear) || 0) : it.kind)).setDepth(it.y - 8);
      if (rune) {
        // runes glow faintly in their own colour
        const glow = this.add.circle(it.x, it.y, 5, RUNES[rune.key].color, 0.35).setDepth(it.y - 9).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: glow, scale: 1.5, alpha: 0.08, duration: 700, yoyo: true, repeat: -1 });
        img.once("destroy", () => glow.destroy());
      }
      if (it.kind === "quest") {
        // Quest drops glow so they stand out from the gold
        const glow = this.add.circle(it.x, it.y, 6, 0xffd166, 0.3).setDepth(it.y - 9).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: glow, scale: 1.4, alpha: 0.1, duration: 600, yoyo: true, repeat: -1 });
        img.once("destroy", () => glow.destroy());
      }
      if (mat) {
        img.setData("mat", mat);
        img.setInteractive({ useHandCursor: false }); // tooltip on hover (content doc, section 7)
        img.on("pointerover", () => matTip(`<b>${MATERIALS[mat].name}${it.amount > 1 ? ` x${it.amount}` : ""}</b><br>${MATERIALS[mat].desc}<br>${MATERIALS[mat].source}${matGrey ? `<br><span class="gbad">Only a minstrel can use this.</span>` : ""}`));
        img.on("pointerout", () => matTip());
        img.once("destroy", () => matTip());
        if (matGrey) img.setAlpha(0.55);
        else { const glow = this.add.circle(it.x, it.y, 5, MAT_COLOR[mat].color, 0.3).setDepth(it.y - 9).setBlendMode(Phaser.BlendModes.ADD); this.tweens.add({ targets: glow, scale: 1.5, alpha: 0.08, duration: 700, yoyo: true, repeat: -1 }); img.once("destroy", () => glow.destroy()); }
      }
      const rarity = gear ? itemRarity(it.gear) : 0;
      if (gear) img.setData("gear", it.gear);
      // gear the loot filter skips is drawn faded and without its glow
      const skip = gear && !passesFilter(lootFilter(), this.opts.cls, it.gear);
      if (skip) img.setAlpha(0.4);
      else if (rarity > 0) this.lootGlow(img, it.x, it.y, rarity, it.y);
      // Gentle bob so loot catches the eye
      this.tweens.add({ targets: img, y: it.y - 2, duration: 500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.items.set(id, img);
    });
    items.onRemove((_it: any, id: string) => { this.items.get(id)?.destroy(); this.items.delete(id); });
    onLootFilter("town", () => {
      this.room?.send("lootfilter", lootFilter());
      for (const img of this.items.values()) {
        const g = img.getData("gear");
        if (g) img.setAlpha(passesFilter(lootFilter(), this.opts.cls, g) ? 1 : 0.4);
      }
    });
    // Runes (shared/runes.ts): set in / taken out, and a rune firing in a fight
    this.room.onMessage("runeset", ({ name, on }) => this.feed(on ? `${name} set in` : `${name} taken out, back in your bag`));
    this.room.onMessage("rune", (m: { k: RuneKey; x: number; y: number; id?: string }) => this.runeFlash(m));
    // Equipping an item the hero isn't strong enough for yet (item level / stat requirements, shared/gear.ts)
    this.room.onMessage("gearno", ({ text }) => {
      const me = this.entities.get(this.me);
      if (me) this.floatText(me.sprite.x, me.sprite.y - me.top - 6, text, "#ff6b6b", PIXEL_FONT);
      this.feed(text);
    });
    // Devour (shared/devour.ts): what my hero has eaten so far, and a note for the monster just eaten
    this.room.onMessage("feast", ({ feast, fam }) => {
      setMyFeast(feast);
      const d = fam ? FEAST[fam as Family] : undefined;
      if (!d) return;
      const n = Math.min(FEAST_MAX, feast?.[fam] ?? 0), me = this.entities.get(this.me);
      const text = `Devoured: ${d.name} ${n}/${FEAST_MAX}, +${Math.round(d.per * n * 10) / 10}% ${d.what}`;
      if (me) this.floatText(me.sprite.x, me.sprite.y - me.top - 6, text, "#ff8a80", PIXEL_FONT);
      this.feed(text);
    });
    this.room.onMessage("pickup", ({ kind, amount, x, y, gear, name }) => {
      if (kind === "quest") {
        this.floatText(x, y - 6, `+1 ${QUEST_ITEMS[gear]?.name ?? ""}`, "#ffd166", PIXEL_FONT);
        return;
      }
      if (kind === "gear" && parseRune(gear)) {
        this.floatText(x, y - 6, `+${name}`, runeCss(parseRune(gear)!), PIXEL_FONT);
        this.feed(`Found a ${name}! Open the bag (G), click it, then click an item to set the rune into it`);
        return;
      }
      if (kind === "gear") {
        this.floatText(x, y - 6, `+${name}`, itemColor(gear), PIXEL_FONT);
        this.feed(`Found ${name}! Press G to equip`);
        return;
      }
      const meS = this.entities.get(this.me)?.sprite;
      if (kind === "gold" && meS) {
        // Scooped up from a short way off: the coin hops into the hero's purse
        const coin = this.add.image(x, y, itemTexture(this, "gold")).setDepth(y);
        this.tweens.add({ targets: coin, x: meS.x, y: meS.y - 6, duration: 180, ease: "Quad.easeIn", onComplete: () => coin.destroy() });
        x = meS.x; y = meS.y - 8;
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
    this.champFx = new ChampionFx({
      scene: this, fx: this.fx, ent: (id) => this.entities.get(id),
      say: (x, y, text, color) => this.floatText(x, y, text, color, PIXEL_FONT),
      squash: (id, kx, ky, ms) => { const e = this.entities.get(id); if (e) this.squash(e, kx, ky, ms / 2); },
    }, this.room);
    bindElemFx(this.room, {
      scene: this, fx: this.fx, ent: (id) => this.entities.get(id),
      say: (x, y, text, color) => this.floatText(x, y, text, color, PIXEL_FONT),
      squash: (id, kx, ky, ms) => { const e = this.entities.get(id); if (e) this.squash(e, kx, ky, ms / 2); },
      shout: (x, y, text, color) => this.floatText(x, y, text, color, PIXEL_FONT, 2),
      sound: (name, x, y, arg) => playSfx(name, x, y, 1, arg),
    });
    // The Hide-Kin's burrows, stitches and pit worms (client/src/hidekinFx.ts)
    bindHidekinFx(this.room, {
      scene: this, fx: this.fx, ent: (id) => this.entities.get(id),
      say: (x, y, text, color) => this.floatText(x, y, text, color, PIXEL_FONT),
      squash: (id, kx, ky, ms) => { const e = this.entities.get(id); if (e) this.squash(e, kx, ky, ms / 2); },
    });
    // The beast-folk's moves in the Mawdeep Warrens (client/src/beastFx.ts)
    bindBeastFx(this.room, {
      scene: this, fx: this.fx, ent: (id) => this.entities.get(id),
      say: (x, y, text, color) => this.floatText(x, y, text, color, PIXEL_FONT),
      squash: (id, kx, ky, ms) => { const e = this.entities.get(id); if (e) this.squash(e, kx, ky, ms / 2); },
    });
    // The Night Raiders (client/src/raiderFx.ts): smoke, dust and their coming and going
    bindRaiderFx(this.room, {
      scene: this, fx: this.fx, ent: (id) => this.entities.get(id) as any, feed: (t) => this.feed(t),
      me: () => this.entities.get(this.me)?.state,
    });
    // A boss speaks (Grandam Ursk talks through her fight): a speech bubble over her, above the Mawdeep's dark, and a chat line
    this.room.onMessage("bosssay", ({ id, text }) => {
      const e = this.entities.get(id);
      if (!e) return;
      const log = document.getElementById("chatlog");
      if (log) {
        const el = document.createElement("div");
        el.className = "bosssay";
        el.textContent = `${(e.state?.title || MOBS[e.state?.kind as MobKind]?.name || "?").split(",")[0]}: ${text}`;
        log.appendChild(el);
        while (log.children.length > 8) log.firstChild!.remove();
      }
      e.bubble?.destroy();
      const b = speechBubble(this, e.sprite.x, e.sprite.y - e.top - 12, text).setDepth(27700);
      e.bubble = b;
      isoAnchor(b, e.sprite);
      this.time.delayedCall(3800, () => { if (e.bubble === b) { b.destroy(); e.bubble = undefined; } });
    });
    // Ishael the Sunwright changes: the Choir (her adepts sing, Zenith begins), then the Second Sun (she burns and grows)
    this.room.onMessage("sunwright", ({ id, phase }) => {
      const e = this.entities.get(id);
      if (!e) return;
      if (phase === 3) {
        const b = this.bodyScale(e) * SUNWRIGHT.sunScale;
        e.base = b; e.top *= SUNWRIGHT.sunScale;
        this.tweens.killTweensOf(e.sprite);
        this.tweens.add({ targets: e.sprite, scaleX: b, scaleY: b, duration: 700, ease: "Back.Out" });
        e.sprite.setTint(0xffe0a0);
        this.burst(e.sprite.x, e.sprite.y - 24, 16, 0xffb040, 620);
        this.floatText(e.sprite.x, e.sprite.y - e.top - 18, "THE SECOND SUN!", "#ffd060", PIXEL_FONT);
      } else {
        this.floatText(e.sprite.x, e.sprite.y - e.top - 18, "THE CHOIR!", "#c8b8ff", PIXEL_FONT);
      }
    });
    // Grandam Ursk changes: the Rite (her brood and needle), then the Bear (she tears off the last of the woman and grows)
    this.room.onMessage("ursk", ({ id, phase }) => {
      const e = this.entities.get(id);
      if (!e) return;
      if (phase === 3) {
        const b = this.bodyScale(e) * URSK.bearScale;
        e.base = b; e.top *= URSK.bearScale;
        this.tweens.killTweensOf(e.sprite);
        this.tweens.add({ targets: e.sprite, scaleX: b, scaleY: b, duration: 700, ease: "Back.Out" });
        e.sprite.setTint(0xffd0c0);
        this.burst(e.sprite.x, e.sprite.y - 20, 14, 0x6e2a22, 520);
        this.floatText(e.sprite.x, e.sprite.y - e.top - 18, "THE BEAR!", "#ff6a5a", PIXEL_FONT);
      } else {
        this.floatText(e.sprite.x, e.sprite.y - e.top - 18, "THE RITE!", "#e8c890", PIXEL_FONT);
      }
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
      if (me && Math.hypot(me.sprite.x - x, me.sprite.y - y) < r * 2.5 && kind === "slam") quake(this, 260, 0.008, "major-boss"); // Mother Blob slam
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
      // no screen shake: only major bosses shake the screen (Murat 2026-11-07)
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
      if (me && Math.hypot(me.sprite.x - x, me.sprite.y - y) < 400) quake(this, 380, 0.01, "major-boss"); // Bone Demon rises
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
      if (me && Math.hypot(me.sprite.x - x, me.sprite.y - y) < r * 3) quake(this, 260, 0.009, "major-boss"); // Bone Demon hellfire
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
      if (kind !== "cleave" && kind !== "leap" && kind !== "sweep") return; // the beast-folk's and the Sunwright's moves are marked in beastFx.ts
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
      if (kind !== "cleave" && kind !== "leap" && kind !== "sweep") return; // the beast-folk's moves land in beastFx.ts
      const ring = this.add.circle(x, y, 4).setStrokeStyle(3, kind === "cleave" ? 0xffb74d : 0xff5252, 0.9).setDepth(20000);
      isoAnchor(ring, { x, y });
      this.tweens.add({ targets: ring, radius: r, alpha: 0, duration: 320, onComplete: () => ring.destroy() });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        this.burst(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, 2.5, 0x8d6e63, 340);
      }
      const me = this.entities.get(this.me);
      if (me && Math.hypot(me.sprite.x - x, me.sprite.y - y) < r * 2.5 && kind === "leap") quake(this, 260, 0.009, "major-boss"); // Redfang Chief leap
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
    // A Redfang ambusher drops out of a tree (shared/bandits.ts AMBUSH): leaves shake loose, it jumps down beside the hero
    this.room.onMessage("bambush", ({ id, x0, y0, x, y, ms }) => {
      this.leafFall(x0, y0 - 18);
      const e = this.entities.get(id);
      if (!e) return;
      e.sprite.setPosition(x0, y0).setVisible(true);
      e.tx = x; e.ty = y; e.snaps = [{ t: patchTime(), x, y }];
      e.leapUntil = this.time.now + ms + 300;
      this.floatText(x0, y0 - e.top - 10, "!", "#ff5252", PIXEL_FONT);
      const b = this.bodyScale(e);
      this.tweens.add({ targets: e.sprite, scaleX: { from: b * 0.85, to: b * 1.25 }, scaleY: { from: b * 1.2, to: b * 1.25 }, duration: ms / 2, yoyo: true, ease: "Sine.easeOut", onComplete: () => e.sprite.setScale(b) });
      this.time.delayedCall(ms, () => { this.burst(x, y, 4, 0x8d6e63, 300); this.squash(e, 1.2, 0.8, 110, 1); });
    });
    this.room.onMessage("ambush", ({ id, x, y, victim }) => {
      const e = this.entities.get(id);
      if (!e) return;
      e.sprite.setPosition(x, y); e.tx = x; e.ty = y; e.snaps = [{ t: patchTime(), x, y }];
      this.floatText(x, y - e.top - 4, "!", "#ff5252");
      const b = this.bodyScale(e);
      this.tweens.add({ targets: e.sprite, scaleX: { from: b * 0.4, to: b }, scaleY: { from: b * 1.6, to: b }, duration: 220, ease: "Back.Out" });
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
      if (id === this.me) {
        this.pointer?.swung(); // the server took the click-attack
        // the swing holds the shared attack timer (the strum 850 ms): skill keys look unavailable until it ends (an estimate, the server decides)
        const mine = this.room?.state.players.get(this.me), def = mine && attackProfile(mine.cls, activeOf(mine));
        if (def) this.attackHoldUntil = performance.now() + (def.combo[step ?? 0]?.cooldownMs ?? def.attackCooldownMs);
      }
      this.showSwing(id, step ?? 0, variant ?? 0, ax, ay, w);
    });
    this.room.onMessage("sfx", (ev) => this.onSkillFx(ev));
    this.room.onMessage("songbook", (m) => setSongbook(m)); // owner-only { songs, mats }, on join and on change
    // The Summoner's grimoire on the HUD (client/src/grimoire.ts): its news, asked again now that we listen
    this.grimoire = new GrimoirePanel(document.getElementById("hud")!, (slot, el) => this.room.send("grimoire", { slot, el }));
    this.room.onMessage("golems", (m) => this.grimoire?.news(m));
    // The chord panel is gone (DI-1, rings under the feet); the server may still send its progress, ignored
    this.room.onMessage("chord", () => {});
    this.room.send("golems");
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
        note.textContent = `⬆ Level ${level}! Press ${actionKey("hero")} to assign your stat points`;
        note.hidden = false; this.noteAt = performance.now();
      }
    });
    this.room.onMessage("hit", ({ id, dmg: rawDmg, blocked, crit, dot, kx, ky, el, ex, by }) => {
      const e = this.entities.get(id);
      if (!e) return;
      const dmg = rawDmg > 0 ? Math.max(1, Math.round(rawDmg)) : 0; // whole numbers on screen (a town guard's hit was -58.7326...)
      if (e.mob && by && isMineOrGroup(by, this.me, this.groupIds())) this.lastMineHit.set(id, this.time.now);
      if (dmg === 0 && !ex) { // a shield took the whole hit (shared/skillEngine.ts absorbDamage): no wound, no flinch
        this.floatText(e.sprite.x, e.sprite.y - 14, "absorbed", "#9ad1ff", PIXEL_FONT, 1, true);
        this.fx.absorbed(e);
        return;
      }
      if (ex) { // an execution (shared/combat.ts EXECUTE): its own number and flash instead of the usual ones
        this.execReady.delete(id);
        this.floatText(e.sprite.x, e.sprite.y - 16, `EXECUTE -${dmg}`, "#ff4d3d", PIXEL_FONT, 2, true);
        this.fx.execute(e);
      }
      if (id === this.me) this.portals?.hurt();
      // Battle music heat: hits on the hero count most, fights close by count too
      const meE = this.entities.get(this.me);
      if (id === this.me) musicCombat(3);
      else if (e.mob && meE && Math.hypot(e.sprite.x - meE.sprite.x, e.sprite.y - meE.sprite.y) < 10 * TILE) musicCombat(1);
      if (e.culled) return; // off screen: no number, flash or flinch to draw (sounds come from sfx.ts, unchanged)
      const num = ex ? undefined : this.floatText(e.sprite.x, e.sprite.y - 14, crit ? `CRIT -${dmg}` : `-${dmg}`,
        blocked ? "#9ad1ff" : crit ? "#ffd60a" : id === this.me ? "#ff5d5d" : el && ELEMENT_COLORS[el as Element] ? `#${ELEMENT_COLORS[el as Element].toString(16).padStart(6, "0")}` : "#ffffff",
        PIXEL_FONT, crit ? 1.8 : dot ? 0.9 : 1.3, true);
      if (e.mob) this.soundCues.numberShown(id, num, this.time.now); // Songweaver: ringing / muffled tint from "soundhit"
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
    });
    // Initiative broken (shared/combat.ts): the target is dizzy and can't attack for a moment
    this.room.onMessage("broken", ({ id }) => {
      const e = this.entities.get(id);
      if (!e) return;
      if (e.mob && !e.state.owner) this.execReady.set(id, Date.now()); // a hero's next blow executes it (marker drawn with the dizzy stars)
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
        if (on) quake(this, 300, 0.008, "village-guards");
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
    this.room.onLeave((code: number) => { if (this.quitting) return; this.warBattle.disconnected(); this.feed("Disconnected from server"); reconnectSoon(login, code === 4000); }); // (the battle din stops with the connection)
    // A connection that silently died (nothing heard for 15s) is treated the same way. A quiet spot sends no
    // state patch, so the server's heartbeat ("hb", every 4s) and the monster feed also count as signs of life.
    let lastPatch = Date.now();
    const alive = () => { lastPatch = Date.now(); };
    this.room.onStateChange(alive);
    this.room.onMessage("hb", alive);
    this.warStd = new WarStandards(this, (type, msg) => this.room.send(type, msg)); // clan war standards and oaths
    this.warTroops = new WarTroops(this);
    this.warTroops.liveTroopers = () => { let n = 0; for (const e of this.entities.values()) if (e.mob && e.state.kind === "trooper" && !e.state.dead) n++; return n; }; // cosmetic clan patrols, derived from the war snapshot
    this.feud = new WarFeud(this, this.room, { // feuds (client/src/warFeud.ts): Shift+click provoke, Wanted badge and marks
      me: () => (this.room?.state as any)?.players?.get(this.me), clan: () => this.warStd?.clan || undefined,
      holder: (t) => clanOfIndex(this.warLast?.owner[t] ?? -1), entities: () => this.entities,
    });
    this.sack = new WarSack({ // sacking Holds (client/src/warSack.ts): the server decides in server/warHolds.ts
      stance: (k) => this.feud?.stance(k) ?? "neutral", holder: (t) => clanOfIndex(this.warLast?.owner[t] ?? -1),
      besieged: (t) => !!this.warLast?.sieges.some((x) => x[0] === t), send: (type, msg) => this.room.send(type, msg),
    });
    this.sack.onChange = (m) => this.warStd?.setSacked(m); // the sacker's banner over the Hold (the war map reads sack.sacked)
    this.room.onMessage("holds", (m) => { this.sack?.setHolds(m); (this.warPlaque ??= new WarPlaque(document.getElementById("hud")!)).setSack(this.sack!); });
    this.room.onMessage("sack", (m) => this.sack?.setSack(m));
    const towns = this.warTowns2 = new WarTowns(this, { clan: () => this.warStd?.clan, hostile: (k) => this.feud?.stance(k) === "enemy", send: (type, msg) => this.room.send(type, msg), say: (t) => this.warNotice?.say(t) }); // W6 towns (client/src/warTowns.ts)
    if (this.npcs) this.npcs.towns = towns;
    this.room.onMessage("towns", (m) => { if (this.npcs) this.npcs.towns = towns; towns.setTowns(m); this.npcs?.townsChanged(); (this.warPlaque ??= new WarPlaque(document.getElementById("hud")!)).setTowns(towns); });
    this.room.onMessage("townclaim", (m) => towns.setClaim(m));
    const city = this.city = new CityLayer(this, { clan: () => this.warStd?.clan, send: (type, msg) => this.room.send(type, msg), openWarTable: () => this.minimap?.showWarTable() }); // W7 capital cities (client/src/capitals.ts)
    if (this.npcs) { this.npcs.city = city; this.npcs.heroClan = () => this.warStd?.clan; }
    this.room.onMessage("city", (m) => city.setCity(m));
    this.room.send("city");
    this.room.onMessage("war", (v) => {
      // the Hold walls follow the holders (shared/war/holdWalls.ts): prediction and click-to-walk routes see the new forts
      const flipped = setHoldOwners(Array.isArray(v?.owner) ? v.owner : [], Array.isArray(v?.tier) ? v.tier : undefined); // (and their tiers, W3)
      if (flipped.length) refreshWalk(flipped.flatMap(holdTiles));
      this.warTroops?.setWar(v); (this.warPlaque ??= new WarPlaque(document.getElementById("hud")!)).set(v); this.warPlaque.setColumns(this.warCols); this.warStd?.setWar(v); this.warLast = v; });
    this.room.onMessage("clan", (m) => this.warStd?.setClan(m));
    this.room.onMessage("oaths", (m) => (this.tabards ??= new WarTabards(this)).set(m)); // server/warOaths.ts
    this.room.onMessage("siege", (m) => { // the server's live siege battle (server/warSieges.ts): front holders on the rings and the plaque
      if (!m || typeof m.t !== "number" || !Array.isArray(m.fronts)) return;
      this.warTroops?.setSiege(m.fronts.length ? m.t : -1); this.warStd?.setSiege(m); (this.warPlaque ??= new WarPlaque(document.getElementById("hud")!)).setSiege(m);
    });
    this.room.onMessage("rituals", (m) => { (this.warRituals ??= new WarRituals(this)).set(m); (this.warPlaque ??= new WarPlaque(document.getElementById("hud")!)).setRitual(this.warRituals); });
    this.room.onMessage("tunnels", (m) => { if (m && Array.isArray(m.mouths)) { this.tunnelMouths = m.mouths; if (this.minimap) this.minimap.tunnels = m.mouths; } });
    this.room.onMessage("warroads", (m) => { if (Array.isArray(m)) { this.warRoads = m; this.warCols.setRoads(m); this.warRoadFx ??= new WarRoadFx(this, this.warCols); } }); // W4: every war road, once on join (and again when the server has built them all)
    this.room.onMessage("columns", (m) => {
      if (!m || !Array.isArray(m.cols)) return;
      const first = !this.warCols.hasColumns, known = new Set(this.warCols.ids), own = this.warStd?.clan, v = this.warLast;
      this.warColumns = m; this.warCols.setColumns(m);
      if (first || !own || !v) return; // the join message only fills the map; later new columns on the clan's land are announced
      for (const [id, ci, , to] of m.cols) if (!known.has(id) && CLAN_KEYS[ci] !== own && v.owner[to] === CLAN_KEYS.indexOf(own)) { this.warNotice?.column(CLAN_KEYS[ci], to); break; }
    }); // W4: the marching columns (shared/war/marches.ts ColumnsMsg)
    this.warBattle.attach(this); setSwornClan(() => this.warStd?.clan || undefined);
    this.room.onMessage("battle", (m) => { this.warBattle.setMsg(m); this.warTroops?.setBattle(this.warBattle.fighting()); }); // W5: big battles (shared/war/battles.ts BattleMsg)
    this.room.onMessage("warplan", (m) => { if (this.minimap && m && Array.isArray(m.march)) this.minimap.plan = m; }); // the own clan's attacks of the last war tick (server/warIntel.ts)
    const warNotice = this.warNotice = new WarNotice(document.getElementById("hud")!);
    this.room.onMessage("warev", (e) => warNotice.show(e, this.entities.get(this.me)?.sprite));
    this.room.onMessage("warraid", (r) => warNotice.raid(r, this.entities.get(this.me)?.sprite)); // the Night Raiders strike the leading clan's lands
    this.room.onMessage("mv", alive);
    this.startPing();
    window.setInterval(() => { if (!this.quitting && Date.now() - lastPatch > 15_000) { this.warBattle.disconnected(); reconnectSoon(login); } }, 3000);
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

  /**
   * A server update for our own hero. While walking, the server's spot runs one round trip behind our prediction, so it
   * is compared with where we stood that long ago: the difference (a knockback, a push, a wall the two sides resolved
   * differently) is blended in over a few frames. Before, walking was never corrected and the gap grew until it passed
   * 48 px, then the hero jumped back to a stale spot (and on any lag spike, since the gap is speed x ping).
   */
  private reconcile(e: Entity, p: any) {
    // Called from Player's and from me's onChange: when both changed in one update, only the first one counts
    if (this.reconciledAt === patchSeq) return;
    this.reconciledAt = patchSeq;
    const now = performance.now();
    const s = own(p).seq;
    if (s > this.ackSeq) {
      const t0 = this.sentAt.get(s);
      if (t0 !== undefined) this.rtt += (Math.min(1000, Math.max(20, now - t0)) - this.rtt) * 0.2;
      this.ackSeq = s;
    }
    const dx = p.x - e.sprite.x, dy = p.y - e.sprite.y;
    // Respawn, portal, teleport: far beyond what lag explains
    if (Math.hypot(dx, dy) > 160 || p.dead) {
      const far = Math.hypot(dx, dy) > 640; // respawn at the bonfire, not a lag correction: the new spot is off screen
      e.sprite.setPosition(p.x, p.y); this.predHist = []; this.corrX = this.corrY = 0;
      if (far) this.arrive(6, 4, 3, 500); else this.snapCamera();
      return;
    }
    const then = interpolate(this.predHist, now - this.rtt);
    if (!then) return;
    const ex = p.x - then.x, ey = p.y - then.y;
    // Small gaps are timing noise (a server tick is ~5 px of walking): leave them to the idle settle
    if (Math.hypot(ex, ey) < 8) { this.corrX = this.corrY = 0; return; }
    this.corrX = ex; this.corrY = ey;
  }

  /** Frames drawn in the last second, shown next to the ping (a slow computer also makes the ping read high). */
  private fpsFrom = 0; private fpsFrames = 0; private fpsWorst = 0; private fpsLast = 0;
  private countFps(wall: number) {
    if (this.fpsLast) this.fpsWorst = Math.max(this.fpsWorst, wall - this.fpsLast);
    this.fpsLast = wall;
    if (!this.fpsFrom) { this.fpsFrom = wall; return; }
    this.fpsFrames++;
    if (wall - this.fpsFrom < 1000) return;
    const fps = Math.round(this.fpsFrames * 1000 / (wall - this.fpsFrom));
    const el = document.getElementById("fps");
    if (el) {
      el.textContent = `${fps}fps`;
      el.className = fps < 25 || this.fpsWorst > 250 ? "bad" : fps < 45 || this.fpsWorst > 100 ? "meh" : "";
      el.title = `Frames per second your computer draws (60 is smooth). Slowest frame in the last second: ${Math.round(this.fpsWorst)} ms`;
    }
    this.fpsFrom = wall; this.fpsFrames = 0; this.fpsWorst = 0;
  }

  /** Round trip to the server, measured every 2 s with a ping, shown next to the online count. */
  private startPing() {
    let ms = 0;
    this.room?.onMessage("pong", (t: number) => {
      const d = Math.max(0, performance.now() - t);
      ms = ms ? ms * 0.7 + d * 0.3 : d;
      const el = document.getElementById("ping");
      if (el) { el.textContent = `${Math.round(ms)}ms`; el.className = ms > 250 ? "bad" : ms > 140 ? "meh" : ""; }
    });
    const ping = () => this.room?.send("ping", performance.now());
    ping();
    const timer = window.setInterval(ping, 2000);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.clearInterval(timer));
  }

  /** Send the held movement directions to the server when they change. */
  private sendInput(next: InputState) {
    const i = this.input_;
    if (next.up === i.up && next.down === i.down && next.left === i.left && next.right === i.right && next.vx === i.vx && next.vy === i.vy) return;
    this.input_ = { ...next };
    this.room?.send("input", { ...next, seq: ++this.seq });
    this.sentAt.set(this.seq, performance.now());
    this.sentAt.delete(this.seq - 64);
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
      if (e.state.dead || id === this.me || e.waiting) return false; // waiting: a hero not drawn yet (its sheet is loading) is no target
      // A monster tucked into a grave or tree can't be hurt (the server skips it): don't let a click swing at it
      const m = meEnt();
      // Summons (shared/summons.ts): never my own or my group's, nor a newcomer's (the server skips them too)
      if (e.mob && e.state.owner) {
        const o = (this.room.state as any).players?.get(e.state.owner);
        return !!m && e.state.owner !== this.me && !(o && m.state.party && o.party === m.state.party) && !(o && pvpProtected(m.state.level, o.level)) && !isSafeZone(e.sprite.x, e.sprite.y);
      }
      if (e.mob && e.state.kind === "trooper") return this.troopStanceOf(e.state.weapon) === "enemy" && !isSafeZone(e.sprite.x, e.sprite.y); // allies and neutral troops are no target
      if (e.mob) return !e.state.hidden;
      // other heroes only where fighting is allowed, and not across newcomer protection
      return !!m && !isSafeZone(e.sprite.x, e.sprite.y) && !isSafeZone(m.sprite.x, m.sprite.y) && !pvpProtected(m.state.level, e.state.level);
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
      // my own and my group's summons: not attackable, but the monster bar can describe them
      friendlies: () => {
        const out: ClickEnemy[] = [];
        for (const [id, e] of this.entities) if (e.mob && (e.state.owner || e.state.kind === "trooper") && !e.culled && !e.state.hidden && !attackable(id, e)) out.push(asEnemy(id, e));
        return out;
      },
      spots: () => {
        const p = meEnt()?.state;
        const out: ClickSpot[] = [];
        for (const n of NPCS) if (npcPresent(n.id, p)) out.push({ x: n.x, y: n.y, w: 18, h: 30, range: TALK_RANGE, act: () => { if (!this.npcs?.isOpen) this.npcs?.interact(); } });
        for (const c of CHESTS) out.push({ x: c.x, y: c.y, w: 22, h: 18, range: CHEST_RANGE, act: () => this.chests?.interact() });
        for (const t of this.city?.tablesPx() ?? []) out.push({ x: t.x, y: t.y, w: 60, h: 30, range: 3 * TILE, act: () => { if (!this.npcs?.isOpen) this.city?.interact(); } });
        out.push({ x: SHRINE.x, y: SHRINE.y, w: 26, h: 36, range: SHRINE_RANGE, act: () => this.shrine?.interact() });
        for (const b of BOARDS) out.push({ x: b.x, y: b.y, w: BOARD_W, h: BOARD_H, range: BOARD_RANGE, act: () => { if (!this.bounty?.open) this.bounty?.interact(); } });
        for (const c of STASHES) out.push({ x: c.x, y: c.y, w: 22, h: 18, range: STASH_RANGE, act: () => { if (!this.stash?.open) this.stash?.interact(); } });
        for (const o of PORTALS) out.push({ x: o.x, y: o.y, w: 26, h: 40, range: PORTAL_RANGE, act: () => this.portals?.interact() });
        for (const g of WAYGATES) out.push({ x: g.x, y: g.y, w: 70, h: 96, range: WAYGATE_RANGE, act: () => this.waygates?.interact() });
        for (const { o } of usableObjects(p)) out.push({ x: o.x, y: o.y, w: 22, h: 22, range: USE_RANGE, act: () => this.room?.send("use", { id: o.id }) });
        return out;
      },
      speed: () => {
        const p = meEnt()?.state;
        return p ? heroSpeed(p.cls as ClassKind, p.slowed, own(p).spd) * gearSpeedMult(activeOf(p)) : 80;
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
    setupChatToggle(document.getElementById("hud")!, document.getElementById("chatlog")!, this.chatEl);
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
  /** A rune fired (shared/runes.ts): its stone pops up over the spot and a thin ring of its colour spreads. Small on purpose. */
  private runeFlash(m: { k: RuneKey; x: number; y: number; id?: string }) {
    const d = RUNES[m.k];
    if (!d) return;
    const who = m.id ? this.entities.get(m.id)?.sprite : undefined;
    const x = who?.x ?? m.x, y = (who?.y ?? m.y) - 14;
    const stone = this.add.image(x, y, runeTexture(this, { key: m.k, rank: 2 })).setScale(0.5).setDepth(y + 2000).setAlpha(0.95);
    this.tweens.add({ targets: stone, y: y - 10, scale: 0.75, alpha: 0, duration: 650, ease: "Quad.easeOut", onComplete: () => stone.destroy() });
    const r = m.k === "ember" ? 40 : 16;
    const ring = this.add.circle(x, y + 12, 4).setStrokeStyle(1, d.color, 0.9).setDepth(y + 1999).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: ring, radius: r, alpha: 0, duration: 320, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
  }

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

  private floatText(x: number, y: number, text: string, color: string, font = PIXEL_FONT, size = 1, jitter = false): Phaser.GameObjects.Text {
    // Damage numbers spread a little sideways so fast hits don't print on top of each other
    if (jitter) x += (Math.random() - 0.5) * 10;
    // A text that would start on top of a live one is lifted clear of it (floatLanes.ts)
    const lift = placeFloat(this.floatLive, { x, y: y - 5, w: text.length * 6 * Math.max(1, Math.round(size)), h: 10 * Math.max(1, Math.round(size)), t: this.time.now });
    y -= lift;
    // Pooled: a Text owns a canvas and a GL texture, and every hit prints one
    let t = this.floatPool.pop();
    if (t) t.setPosition(x, y).setText(text).setColor(color).setFontFamily(font).setAlpha(1).setVisible(true).setActive(true);
    else t = this.add.text(x, y, text, {
      fontFamily: font, fontSize: `${TEXT_PX}px`, color, stroke: "#000", strokeThickness: 2,
    }).setOrigin(0.5, 1).setResolution(1).setDepth(30000);
    t.setScale(WT * Math.max(1, Math.round(size)));
    const txt = t;
    // iso view: callers lift the text above a hero's feet; rise straight up from there on screen
    isoAnchor(t, { x, y: y + 14 });
    if (size > 1.5) {
      // Big numbers (crits) pop in, then rise
      // whole-number scales keep every font pixel square (2x2 or 4x4 screen px)
      t.setScale(WT * Math.round(size) * 1.5);
      this.tweens.add({ targets: t, scale: WT * Math.round(size), duration: 120, ease: "Back.easeOut" });
    }
    this.tweens.add({ targets: t, y: y - 10, alpha: 0, duration: size > 1.5 ? 1000 : 800, delay: size > 1.5 ? 150 : 0, onComplete: () => {
      txt.setVisible(false).setActive(false);
      if (this.floatPool.length < 48) this.floatPool.push(txt); else txt.destroy();
    } });
    return t;
  }
  private floatPool: Phaser.GameObjects.Text[] = [];

  /** Session ids of the players in my group (me not included). */
  private groupIds(): Set<string> {
    const out = new Set<string>(), players = (this.room?.state as any)?.players, party = players?.get(this.me)?.party;
    if (party) players.forEach((q: any, id: string) => { if (id !== this.me && q.party === party) out.add(id); });
    return out;
  }

  /** The top bar describes the monster under the mouse (or a friendly summon), else my click target while it lives. */
  private updateMonsterBar(now: number) {
    const bar = this.monsterBar, ptr = this.pointer;
    if (!bar) return;
    const live = (id?: string) => { const e = id ? this.entities.get(id) : undefined; return e?.mob && !e.state.dead && !e.state.hidden && !e.culled ? e : undefined; };
    const pid = [ptr?.inspectId, ptr?.targetId].find((id) => live(id)), e = live(pid);
    if (e) {
      this.barId = pid;
      const players = (this.room.state as any).players, me = players?.get(this.me);
      bar.show(monsterInfo(e.state as any, { myLevel: me?.level ?? 1, myClass: me?.cls, playerName: (id) => players?.get(id)?.name }), now, pid);
    } else if (this.barId && !live(this.barId)) { this.barId = undefined; bar.hide(); } // it died or left the view: no lingering
    else bar.show(undefined, now);
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
    const look = mobLook(p.kind, p.weapon), base = look?.oy ?? 0.85, top = look?.top ?? 14;
    const up = p.weapon === "lookout"; // a camp's lookout (shared/bandits.ts): a Hollow bandit or a badlands crossbowman
    e.sprite.setOrigin(0.5, base + (up ? PERCH_LIFT / e.sprite.frame.height : 0));
    e.top = top + (up ? PERCH_LIFT : 0);
  }

  private addEntity(id: string, p: any, mob = false) {
    if (mob) {
      const look = mobLook(p.kind, p.weapon);
      const sprite = this.add.sprite(p.x, p.y, mobTexture(this, p.kind, p.level, p.weapon, p.bones, !!p.champion), 0).setOrigin(0.5, look?.oy ?? 0.85)
        .setScale(look?.scale ?? 1);
      if (p.kind === "crawler" && sprite.texture.key.startsWith("mob_skeleton")) sprite.setCrop(0, 0, sprite.frame.width, sprite.frame.height * CRAWL_CROP); // legs gone
      // The level tag is made when the monster comes on screen (see update): thousands of text canvases would cost a lot
      this.entities.set(id, { sprite, bar: isoAnchor(this.add.graphics(), sprite) as Phaser.GameObjects.Graphics, tx: p.x, ty: p.y, snaps: [{ t: patchTime(), x: p.x, y: p.y }], state: p, mob, top: look?.top ?? 14 });
      if ((p.merged || 1) > 1) this.growMob(this.entities.get(id)!, p);
      this.perch(this.entities.get(id)!, p);
      return;
    }
    // Classes with a generated sheet use it; anything else falls back to the procedural persona
    const sheet = (CHARACTERS as readonly string[]).includes(p.cls) ? (p.cls as CharacterName) : undefined;
    // Another class's sheet loads when its first hero appears (ensureCharSheet): hidden until then
    const loaded = !sheet || ensureCharSheet(this, sheet, () => this.sheetReady(id, sheet), id === this.me ? -2 : -1);
    const hero = loaded ? sheet : undefined;
    const sprite = hero
      ? this.add.sprite(p.x, p.y, hero, 0).setOrigin(CHAR_ORIGIN.x, CHAR_ORIGIN.y).setScale(HERO_SCALE)
      : sheet ? this.add.sprite(p.x, p.y, "__DEFAULT").setOrigin(CHAR_ORIGIN.x, CHAR_ORIGIN.y).setScale(HERO_SCALE).setVisible(false)
      : this.add.sprite(p.x, p.y, heroTexture(this, p.cls, p.color), 0).setOrigin(0.5, 0.85);
    const label = this.add.text(p.x, p.y, p.name, {
      fontFamily: TEXT_FONT, fontSize: `${TEXT_PX}px`, color: id === this.me ? "#ffd166" : "#ffffff",
      stroke: "#000", strokeThickness: 2,
    }).setOrigin(0.5, 1).setScale(WT).setResolution(1);
    isoAnchor(label, sprite);
    const titleLabel = this.add.text(p.x, p.y, "", {
      fontFamily: TEXT_FONT, fontSize: `${TEXT_PX}px`, color: "#b8a98a", stroke: "#000", strokeThickness: 2,
    }).setOrigin(0.5, 1).setScale(WT * 0.8).setResolution(1).setAlpha(0.85);
    isoAnchor(titleLabel, sprite);
    const bar = isoAnchor(this.add.graphics(), sprite) as Phaser.GameObjects.Graphics;
    const gear = hero ? new GearLayer(this, hero) : undefined;
    if (!loaded) label.setVisible(false);
    this.entities.set(id, { sprite, label, titleLabel, bar, tx: p.x, ty: p.y, snaps: [{ t: patchTime(), x: p.x, y: p.y }], state: p, mob, hero, gear, top: hero ? HERO_TOP : 14, waiting: loaded ? undefined : sheet });
    if (id === this.me) {
      // ?look=tx,ty (map viewing aid, like ?time=): park the camera on a tile instead of following the hero
      const look = new URLSearchParams(location.search).get("look")?.split(",").map(Number);
      const target = look?.length === 2 && look.every(Number.isFinite) ? this.add.zone((look[0] + 0.5) * TILE, (look[1] + 0.5) * TILE, 1, 1) : sprite;
      this.cameras.main.startFollow(target, true, CAM_LERP, CAM_LERP);
      this.snapCamera(); // start on the hero, not panning over from the map corner
    }
  }

  /** A hero's class sheet has arrived: dress the hidden stand-in with it (the update loop animates it from the next frame). */
  private sheetReady(id: string, sheet: CharacterName) {
    const e = this.entities.get(id);
    if (!e || e.waiting !== sheet) return;
    e.waiting = undefined;
    e.hero = sheet;
    e.top = HERO_TOP;
    e.sprite.setTexture(sheet, 0).setVisible(true);
    e.label?.setVisible(true);
    e.gear = new GearLayer(this, sheet);
  }

  private removeEntity(id: string) {
    const e = this.entities.get(id);
    if (!e) return;
    this.siege?.clear(id);
    this.champFx?.drop(id);
    this.forms?.drop(id);
    this.lastMineHit.delete(id);
    if (e.mob && e.state.kind === "trooper" && e.state.dead && e.artOn && !e.culled) this.trooperCorpse(e);
    e.sprite.destroy(); e.label?.destroy(); e.titleLabel?.destroy(); e.pennant?.destroy(); e.stripe?.destroy(); e.feudMark?.destroy(); e.bar.destroy(); e.parts?.destroy(); e.bubble?.destroy(); e.gear?.destroy();
    this.entities.delete(id);
  }

  /** The Hide-Kin tunnel mouths the server last listed ("tunnels" message): look only, nothing drawn from it yet. */
  private tunnelMouths: { t: number; x: number; y: number; state: string }[] = [];

  /** A clan trooper's sheet: the painted one replaces the stand-in once loaded; fallen, it staggers (frame 12) and lies (13). */
  private trooperFrame(e: Entity, p: any, now: number) {
    if (!e.artOn) {
      const key = mobTexture(this, p.kind, p.level, p.weapon);
      if (key.startsWith("mob_war_")) { e.sprite.setTexture(key, 0); e.artOn = true; this.perch(e, p); }
    }
    const tp = parseTroop(p.weapon);
    if (e.artOn && e.sprite.texture.frameTotal > 14 && tp?.object && !p.dead) { // a supply cart, a siege ram or a tunnel mouth: idle frames when still, stagger on a hit
      if (e.cartHp !== undefined && p.hp < e.cartHp) e.cartHurtAt = now;
      e.cartHp = p.hp;
      if (now - (e.cartHurtAt ?? -1e9) < 260) e.sprite.setFrame(12);
      else if (tp.part === "mouth") e.sprite.setFrame(e.sprite.texture.key.includes("tunnel") ? Math.floor(now / 240) % 6 : 6); // the open mouth's idle loop (a cart stand-in just stands)
      else if (!p.moving) { const d = this.dirOf(e); e.sprite.setFrame(d === "down" ? 6 : d === "up" ? 7 : 8); }
    }
    if (!p.dead || !e.artOn || e.sprite.texture.frameTotal <= 14) return; // (frameTotal counts Phaser's __BASE frame)
    e.deadAt ??= now;
    e.sprite.setFrame(now - e.deadAt < 220 ? 12 : 13).setFlipX(false);
  }

  /** The fallen trooper lies a moment longer than the server keeps it, then fades. */
  private trooperCorpse(e: Entity) {
    if (this.warBattle.inField && this.corpses >= BATTLE.corpseCap) return; // a big battle: at most 30 lie at once
    const c = this.add.sprite(e.sprite.x, e.sprite.y, e.sprite.texture.key, 13).setOrigin(e.sprite.originX, e.sprite.originY).setScale(e.sprite.scaleX);
    setBaseDepth(c, e.sprite.y);
    this.corpses++;
    this.tweens.add({ targets: c, alpha: 0, delay: 1400, duration: 700, onComplete: () => { c.destroy(); this.corpses--; } });
  }

  /** "<Clan> soldier" / "<Clan> captain" over a trooper, coloured by how its clan sees this hero: ally, neutral, enemy. */
  private trooperLabel(e: Entity, p: any, x: number, y: number, id: string) {
    const t = parseTroop(p.weapon);
    if (!t || p.dead || p.hidden) { e.label?.setVisible(false); return; }
    // inside a big battle only officers and captains (Mob.title), the hovered trooper and the hero's target carry a name
    if (this.warBattle.inField && !p.title && !t.officer && id !== this.pointer?.hoverId && id !== this.pointer?.inspectId && id !== this.pointer?.targetId) { e.label?.setVisible(false); return; }
    if (!e.label) e.label = isoAnchor(this.add.text(x, y, p.title || troopName(t.clan, t.officer, t.cart, t.part === "ram", t.part === "mouth"), { // (manhunters carry a title)
      fontFamily: TEXT_FONT, fontSize: `${TEXT_PX}px`, color: "#c8c8c8", stroke: "#000", strokeThickness: 2,
    }).setOrigin(0.5, 1).setScale(WT * 0.85).setResolution(1), e.sprite) as Phaser.GameObjects.Text;
    const col = this.feud?.colour(t.clan) ?? TROOP_COLOURS[this.troopStanceOf(p.weapon)]; // orange: fighting only because the hero provoked them
    if (e.lvlColor !== col) { e.label.setColor(col); e.lvlColor = col; }
    setBaseDepth(e.label.setPosition(x, y - e.top - 2).setVisible(true), e.sprite.y + 1);
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
    const beast = !!e.hero && this.forms.active(id);
    if (beast) this.forms.attack(id); // Bat / Wolf Form: a bite, no weapon swing
    if (e.mob) e.strikeUntil = this.time.now + 240;
    // Aim can be diagonal (the server sends it); mobs and old messages fall back to the facing direction
    const off = typeof ax === "number" && typeof ay === "number" ? [ax, ay]
      : { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir] ?? [0, 1];
    // The main-hand weapon decides the attack (shared/weapons.ts); the server says which one swung
    const cls = e.mob ? undefined : (isWeaponType(w) ? profileOf(w, e.state.cls) : attackProfile(e.state.cls, activeOf(e.state)));
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
    if (cls && !beast) this.gearFx.swing(e, step, off[0], off[1], !!cls.projectile, id === this.me); // item level effects
    if (cls?.projectile) return; // the fireball itself is the visual
    // No hit-area shapes (Murat): the attack animation is the visual. No screen shake from hero attacks or skills.
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

  /** A handful of leaves shaken loose from a tree, fluttering down. */
  private leafFall(x: number, y: number) {
    const cols = [0x4f7a3a, 0x6b8f3e, 0x8a6b2f, 0x3d5e2c];
    for (let i = 0; i < 12; i++) {
      const lx = x + (Math.random() - 0.5) * 22, ly = y + (Math.random() - 0.5) * 10;
      const leaf = this.add.rectangle(lx, ly, 3, 2, cols[i % cols.length]).setDepth(20000);
      this.tweens.add({ targets: leaf, x: lx + (Math.random() - 0.5) * 18, y: ly + 18 + Math.random() * 14, alpha: 0, angle: Math.random() * 180, duration: 600 + Math.random() * 500, ease: "Sine.easeIn", onComplete: () => leaf.destroy() });
    }
  }

  private burst(x: number, y: number, r: number, color: number, ms: number) {
    const g = this.add.circle(x, y, r, color, 0.5).setStrokeStyle(1, color).setDepth(10000);
    this.tweens.add({ targets: g, scale: 1.8, alpha: 0, duration: ms, onComplete: () => g.destroy() });
  }

  // ---- Hero menu (stats + powers) -----------------------------------------

  private toggleHeroMenu() { this.openSide("hero"); }

  /** Skill tree tab of the side panel. */
  private toggleTree() { this.openSide("tree"); }

  /**
   * Opens the side panel on a tab (C, G, T, the HUD buttons or the panel's own tabs). The key of the tab already
   * shown closes the panel (`toggle`); another key switches tab. Other menus close when the panel opens.
   */
  private openSide(tab: SideTab, toggle = true) {
    const side = this.side;
    if (!side) return;
    if (side.open && side.tab === tab) { if (toggle) side.close(); return; }
    if (!side.open) this.closeMenus();
    side.show(tab);
    const mine = this.entities.get(this.me)?.state;
    if (tab === "hero") {
      this.heroSig = ""; this.heroSigL = "";
      this.showHeroMenu(this.levelFrom);
      this.levelFrom = undefined;
      document.getElementById("lvlnote")!.hidden = true;
    } else if (tab === "gear") this.gearMenu?.reset(mine);
    else this.talentMenu?.reset(mine);
    side.refresh(mine);
  }

  private closeMenus() {
    this.side?.close();
    this.closeSlotPicker();
    this.npcs?.close();
    this.npcs?.log.toggle(false);
    this.ideaBoard?.close();
    this.party?.close();
    this.trade?.close();
    this.stash?.close();
    this.bounty?.close();
    this.warStd?.close();
    this.patchNotes?.close();
    this.portals?.close();
    this.ferry?.close();
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
        this.trade?.open || this.stash?.open || this.bounty?.open || this.warStd?.open || this.patchNotes?.open || this.portals?.isOpen || this.ferry?.isOpen || this.minimap?.isOpen ||
        this.gameMenu?.open || this.talentMenu?.open);
  }

  /** Owned titles as small buttons (plus None); a pick is an intent, the server answers "title" and the label follows `Player.cosm`. */
  private titlePickerHtml(mine: any) {
    if (!this.titlesOwned.length) return "";
    const cur = unpackCosmetics(metaOf(mine, META.cosm)).title;
    const b = (i: number, name: string) => `<button class="titlepick${i === cur ? " on" : ""}" data-title="${i}">${name}</button>`;
    return `<div id="titlepick"><span>Title</span>${b(0, "None")}${this.titlesOwned.map((i) => b(i, TITLES[i])).join("")}</div>`;
  }

  /** Opens the hero menu. After level-ups (`from` = level before them) it highlights the stat points. */
  private showHeroMenu(from?: number) {
    const mine = this.entities.get(this.me)?.state;
    if (!mine) return;
    this.heroFrom = from;
    const cls = mine.cls as ClassKind, lvl = mine.level as number;
    const st = statsOf(mine); // includes gear bonuses
    const o = own(mine); // owner-only numbers, in `me` (server/player.ts)
    const free = statPoints(lvl) - (o.ptSta + o.ptStr + o.ptMag + o.ptDex);
    // Rebuild only when something shown changed (called every frame while open); the right column also follows the hover preview
    const sig = [this.titlesOwned.join(), unpackCosmetics(metaOf(mine, META.cosm)).title, lvl, o.xp, st.sta, st.str, st.mag, st.dex, free, from, mine.name].join("|");
    // the right column shows the sheet (defense, resistances, derived numbers) and the gauge size: key it on what the sheet is made of
    // (all six worn slots, talents, points), not on current hp/mana, so it neither rebuilds every regen tick nor goes stale after a gear change
    const sigR = [sig, o.spd, mine.maxHp, unpackMana(o.mp).maxMana, o.kills, o.gold, GEAR_SLOTS.map((g) => mine[g]).join(","), JSON.stringify(Array.from(o.talents.entries())), o.ptSta, o.ptStr, o.ptMag, o.ptDex, this.side?.previewSig ?? "", feastLines(feastOf()).join()].join("|");
    const el = document.getElementById("hero")!;
    if (!el.hidden && sigR === this.heroSig) return;
    const leftSame = !el.hidden && sig === this.heroSigL;
    this.heroSig = sigR;
    this.heroSigL = sig;
    const wp = attackProfile(cls, activeOf(mine));
    const next = xpForLevel(lvl + 1), cur = xpForLevel(lvl);
    const fromGear = gearStats(cls, activeOf(mine));
    const pts: Record<StatKind, number> = { sta: o.ptSta, str: o.ptStr, mag: o.ptMag, dex: o.ptDex };
    const sh0 = this.side!.sheets(mine);
    // Move speed as the game moves you: the skill-passive multiplier (own.spd) is not in the sheet; a preview scales by the sheet's own ratio
    const live = Math.round(heroSpeed(cls, false, o.spd) * gearSpeedMult(activeOf(mine)));
    const sh = { ...sh0, now: { ...sh0.now, speed: live }, next: sh0.next && { ...sh0.next, speed: sh0.now.speed ? Math.round(live * sh0.next.speed / sh0.now.speed) : live } };
    const mp = unpackMana(o.mp);
    const rest = regenFromStamina(st.sta);
    const parts = heroPanelParts({
      name: mine.name, cls, className: CLASSES[cls].name, level: lvl, maxLevel: MAX_LEVEL, xp: o.xp - cur, xpNeed: next - cur,
      free, levelUp: from !== undefined ? lvl : undefined,
      attrs: (["str", "sta", "mag", "dex"] as StatKind[]).map((k) => ({ k, name: STAT_NAMES[k], value: st[k], placed: pts[k], gear: fromGear[k] })),
      main: STATS[cls].attackStat, sheet: sh.now, next: sh.next, previewLabel: sh.label,
      attackWords: `${WEAPON_TYPE_NAMES[wp.type]}: ${ATTACK_WORDS[wp.type]}`, hitsPerSec: 1000 / wp.attackCooldownMs, poise: heroPoise(cls, lvl),
      hpRegenRest: rest[1], hpRegenFight: rest[0],
      gauge: usesGauge(cls), manaRegen: manaRegen(st, false, talentBonus(cls, o.talents, "mana")), manaRestMult: MANA.restMult, mana: mp.mana, maxMana: mp.maxMana,
      kills: o.kills, gold: o.gold, devoured: feastLines(feastOf()), titlesHtml: this.titlePickerHtml(mine), reactions: reactionHelp(),
    });
    if (!leftSame) {
      document.getElementById("herotitle")!.innerHTML = parts.title;
      document.getElementById("heroxp")!.innerHTML = parts.xp;
      document.getElementById("herostatpts")!.innerHTML = parts.pts;
      document.getElementById("herostats")!.innerHTML = parts.attrs;
      const rc = respecCost(lvl), rcEl = document.getElementById("statresetcost");
      if (rcEl) rcEl.textContent = rc ? `${rc} gold · out of combat` : "free up to level 5 · out of combat";
    }
    document.getElementById("herochar")!.innerHTML = parts.right;
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
      const choices = ["", ...activeSkills(cls).filter((a) => skillLearned(cls, own(mine).talents, a.id)).map((a) => a.id)];
      if (choices.length < 2) return;
      if (cell.dataset.slot === "L" || cell.dataset.slot === "R") {
        const side: ClickSide = cell.dataset.slot === "L" ? "left" : "right";
        const cur = Math.max(0, choices.indexOf(this.clickSkill(side)));
        this.setClickSkill(side, choices[(cur + (ev.deltaY > 0 ? 1 : -1) + choices.length) % choices.length]);
        return;
      }
      const n = Number(cell.dataset.slot);
      const cur = Math.max(0, choices.indexOf(own(mine).slots.at(n) ?? ""));
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
    const slots: string[] = [...own(mine).slots];
    const opts = activeSkills(cls).map((a) => {
      const learned = skillLearned(cls, own(mine).talents, a.id);
      const at = slots.indexOf(a.id);
      const where = !learned ? `${icon("lock")}learn it in the tree (${actionKey("tree")}), Lv ${a.req}` : at === n ? "in this slot" : at >= 0 ? `now on key ${slotKey(at)}` : "not on a key yet"
      const need = a.needs ? ` · needs ${NEED_TEXT[a.needs]}` : "";
      return `<button class="opt${learned ? "" : " locked"}${at === n ? " cur" : ""}" data-pick="${a.id}" data-tiphead="${a.name}" data-tip="${tipEsc(a.desc)}">` +
        `${iconImg(a.id, "picon")}<span><b>${a.name}</b><small>${where}${need}</small></span></button>`;
    }).join("");
    const empty = `<button class="opt clear" data-pick=""><span class="picon none">${icon("close")}</span><span><b>Empty</b><small>clear key ${slotKey(n)}</small></span></button>`;
    const pick = document.getElementById("slotpick")!;
    pick.innerHTML = `<div class="ph">Key ${slotKey(n)}: choose a skill</div><div class="plist">${opts}${slots[n] ? empty : ""}</div>`;
    this.pickSlot = n;
    pick.hidden = false;
    // Sit just above the clicked slot
    const cell = document.querySelector(`#hotbar [data-slot="${n}"]`) as HTMLElement | null;
    const hud = document.getElementById("hud")!.getBoundingClientRect();
    if (cell) {
      const r = cell.getBoundingClientRect(), z = uiScale(); // screen px -> the zoomed HUD's px
      const w = pick.offsetWidth;
      pick.style.left = `${Math.max(8, Math.min(hud.width / z - w - 8, (r.left - hud.left + r.width / 2) / z - w / 2))}px`;
      pick.style.bottom = `${(hud.bottom - r.top) / z + 6}px`;
    }
  }

  /** Left or right click: the weapon's attack or any learned skill / basic spell (Murat 2026-11-04 / 11-05). */
  private openClickPicker(mine: any, cls: ClassKind, side: ClickSide) {
    const cur = this.clickSkill(side);
    const w = attackProfile(cls, activeOf(mine));
    const weapon = `<button class="opt${cur ? "" : " cur"}" data-pick="" data-tiphead="${WEAPON_TYPE_NAMES[w.type]}" data-tip="${tipEsc(`Basic attack with what you hold: ${ATTACK_WORDS[w.type]}.`)}">` +
      `${this.weaponIcon(mine, "picon")}<span><b>Weapon attack</b><small>${WEAPON_TYPE_NAMES[w.type]}: ${ATTACK_WORDS[w.type]}</small></span></button>`;
    const opts = activeSkills(cls).map((a) => {
      const learned = skillLearned(cls, own(mine).talents, a.id);
      const where = !learned ? `${icon("lock")}learn it in the tree (${actionKey("tree")}), Lv ${a.req}` : a.cantrip ? `basic spell · ${a.mana ?? 0} mana` : a.id === cur ? `on ${side} click` : costWords(a) + (a.needs ? ` · needs ${NEED_TEXT[a.needs]}` : "");
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
      const r = cell.getBoundingClientRect(), z = uiScale(); // screen px -> the zoomed HUD's px
      pick.style.left = `${Math.max(8, Math.min(hud.width / z - pick.offsetWidth - 8, (r.left - hud.left) / z))}px`;
      pick.style.bottom = `${(hud.bottom - r.top) / z + 6}px`;
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
    return id && skillLearned(mine.cls, own(mine).talents, id) && !skillOf(mine.cls, id)?.passive ? id : "";
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

  /** Something to talk to, open or use right here (one of the "E: ..." prompts is up, or a dialog is open)? */
  private canUse(): boolean {
    return !!this.npcs?.isOpen || !!this.bounty?.open || !!this.dungeon?.nearDoor ||
      !!document.querySelector("#npcprompt.open, #chestprompt.open, #boardprompt.open, #portalprompt.open, #gateprompt.open, #ferryprompt.open, #shrineprompt.open, #stashprompt.open");
  }

  /** A game key of the current keyboard layout (client/src/keymode.ts) was pressed. */
  private keyAction(a: KeyAction) {
    switch (a) {
      case "potion": this.room?.send("potion"); break;
      case "mana": this.room?.send("manapotion"); break;
      case "ranged": this.room?.send("ranged"); break; // secondary ranged weapon (sling, knives, crossbow)
      case "dodge": this.room?.send("dodge"); break;
      case "hero": this.toggleHeroMenu(); break;
      case "interact": this.useKey(); break;
      case "bag": this.bagKey(); break;
      case "tree": this.toggleTree(); break;
    }
  }

  /** The key hints on the HUD buttons and side panel tabs follow the keyboard layout. */
  private keyLabels() {
    const set = (sel: string, a: KeyAction) => document.querySelectorAll(sel).forEach((el) => { el.textContent = `[${actionKey(a)}]`; });
    set("#herobtn small, [data-tab=hero] small", "hero");
    set("#bagbtn small, [data-tab=gear] small", "bag");
    set("#treebtn small, [data-tab=tree] small", "tree");
  }

  /** Skill key 1..0: cast that slot's skill now, aimed at the mouse cursor (self skills just go off). */
  private castSlot(n: number) {
    const mine = this.entities.get(this.me)?.state;
    const id = own(mine).slots.at(n);
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
    const pots = unpackPotions(own(mine).potions);
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
    return `<div class="potions">${cell("potion", actionKey("potion"))}${cell("mpotion", actionKey("mana"))}</div>`;
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
    const m = s && withMods(cls, own(this.entities.get(this.me)?.state).talents, s); // upgrade nodes change cooldown and cost
    return { name: s?.name ?? "?", cdMs: (m?.cd ?? 0) * cdm, last: this.lastCast[skill] ?? -Infinity, cost: m ? skillCost(m) : { heat: 0, mana: 0 }, ult: s?.row === 4 };
  }

  private chargeSeen = { n: 0, at: 0 }; // our stacks last frame, and when the newest one was built

  /**
   * Charges (Valor, Ki, Arcane, Focus, Fury, Blood) left of the skill keys: a crystal icon, the count, 5 pips and a shade
   * that fills as they fade (STACK_DECAY_MS after the last hit). Only shown while a skill on the bar (or on the left
   * click) spends them (Murat 2026-11-04).
   */
  private chargeCell(mine: any, cls: ClassKind, clicks: string[], slots: string[], now: number): string {
    if (cls === "songweaver") return ""; // the Songweaver has no Tempo charge any more (the gauge replaces it)
    const n = Math.max(0, Math.min(MAX_STACKS, own(mine).stacks | 0));
    if (n > this.chargeSeen.n) this.chargeSeen.at = now; // a hit built one (the server's clock isn't sent)
    this.chargeSeen.n = n;
    const users = [...clicks, ...slots].filter((id, i, a) => id && a.indexOf(id) === i)
      .map((id) => skillOf(cls, id)).filter((sd) => sd?.consume && skillLearned(cls, own(mine).talents, sd.id));
    if (!users.length) return "";
    const name = STACK_NAME[cls];
    // The Summoner's Void Essence comes from the Void, not from basic hits, and lasts longer (shared/summons.ts ESSENCE)
    const decay = cls === "summoner" ? ESSENCE.decayMs : STACK_DECAY_MS;
    const left = n > 0 ? Math.max(0, decay - (now - this.chargeSeen.at)) : 0;
    const shade = n > 0 ? `<div class="cd" style="height:${Math.round((1 - left / decay) * 50) * 2}%"></div>` : "";
    const pips = Array.from({ length: MAX_STACKS }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("");
    const tip = (cls === "summoner"
      ? `Void Essence, up to ${MAX_STACKS}: one each time one of your creatures goes back to the Void (dies or fades), each foe your Black Hole swallows, and now and then while a golem takes blows for you. It fades ${decay / 1000} s after the last one. `
      : `Built by your basic hits, up to ${MAX_STACKS}. They fade ${STACK_DECAY_MS / 1000} s after your last hit. `) +
      `Spent by ${users.map((u) => u!.name).join(", ")}: each one makes it stronger.`;
    return `<div class="slot charge${n ? "" : " wait"}" data-tiphead="${name} ${n}/${MAX_STACKS}" data-tip="${tipEsc(tip)}">` +
      `<img class="sicon" src="${chargeIcon(cls)}" alt="" draggable="false">${shade}${n ? `<b class="count">${n}</b>` : ""}<span class="pips">${pips}</span></div>`;
  }

  /** Skill bar at the bottom: potions, the left-click cell and the 10 slots (the old text list of actions is gone, Murat 2026-11-04). */
  private renderActions(mine: any, cls: ClassKind, cdm: number, now: number) {
    const pools = { energy: own(mine).energy, mana: unpackMana(own(mine).mp).mana };
    const blocked = !!(mine.stunned || mine.broken) || performance.now() < this.attackHoldUntil; // the server refuses a press now: dim the keys
    const slots: string[] = [...own(mine).slots];
    this.cdTrack.length = 0;
    // Slot bar at the bottom: 10 cells, cooldown shading, click to choose a skill
    const locked = !!this.qcarry?.carrying(this.me), lockTip = locked ? LOCK_TIP : "";
    const cells = Array.from({ length: slotCount() }, (_, i) => {
      const skill = slots[i] ?? "";
      const picking = (this.pickSlot === i ? " picking" : "");
      if (!skill) return `<div class="slot empty${picking}" data-slot="${i}" title="Click to put a skill on key ${slotKey(i)}"><kbd>${slotKey(i)}</kbd><i>+</i></div>`;
      const h = this.skillHud(cls, skill, cdm);
      const left = Math.max(0, h.cdMs - (now - h.last));
      // the shade height and the seconds are filled in per frame (below), so the markup only changes when a cooldown starts or ends
      const shade = left > 0 ? `<div class="cd" data-cdk="s${i}"></div>` : "";
      const wait = (left > 0 || blocked || !canPay(pools, h.cost) ? " wait" : "") + (shortOf(pools, h.cost) === "heat" ? " hot" : "");
      const power = skill;
      const unarmed = this.unarmedFor(mine, cls, skill);
      if (left > 0) this.cdTrack.push({ k: `s${i}`, left, cd: h.cdMs });
      return `<div class="slot${locked ? " locked" : ""}${h.ult ? " ult" : ""}${wait}${unarmed ? " unarmed" : ""}${picking}" data-slot="${i}" data-skill="${skill}" data-tiphead="${h.name}" data-tip="${tipEsc(lockTip + (unarmed ? `${unarmed}. ` : "") + (skillOf(cls, skill)?.desc ?? ""))}" data-tiphint="Key ${slotKey(i)} · click to change · wheel to scroll · right-click to clear">` +
        `${iconImg(power)}${shade}${unarmed ? `<i class="xout"></i>` : ""}<kbd>${slotKey(i)}</kbd>${left > 0 && !unarmed ? `<b class="cdn" data-cnk="s${i}"></b>` : ""}</div>`;
    }).join("");
    // Left- and right-click cells first: the weapon, or the spell / skill picked for that click
    const clickCell = (side: ClickSide) => {
      const sk = this.clickSkill(side), key = side === "left" ? "L" : "R", Side = side === "left" ? "Left click" : "Right click / Space";
      // Spell keys: R is a spell key there, so the click cells say which mouse button they are
      const label = keyMode() === "spells" ? (side === "left" ? "LMB" : "RMB") : key;
      const pk = this.pickSlot === (side === "left" ? LEFT_PICK : RIGHT_PICK) ? " picking" : "";
      if (sk) {
        const h = this.skillHud(cls, sk, cdm);
        const left = Math.max(0, h.cdMs - (now - h.last));
        const shade = left > 0 && h.cdMs >= 1000 ? `<div class="cd" data-cdk="${key}"></div>` : "";
        const unarmed = this.unarmedFor(mine, cls, sk);
        if (shade) this.cdTrack.push({ k: key, left, cd: h.cdMs });
        return `<div class="slot lmb ${side}${locked ? " locked" : ""}${!canPay(pools, h.cost) ? " wait" : ""}${shortOf(pools, h.cost) === "heat" ? " hot" : ""}${unarmed ? " unarmed" : ""}${pk}" data-slot="${key}" data-tiphead="${Side}: ${h.name}" data-tip="${tipEsc(lockTip + (unarmed ? `${unarmed}. ` : "") + (skillOf(cls, sk)?.desc ?? ""))}" data-tiphint="Click to change · wheel to scroll · right-click: back to the weapon">` +
          `${iconImg(sk)}${shade}${unarmed ? `<i class="xout"></i>` : ""}<kbd>${label}</kbd></div>`;
      }
      const w = attackProfile(cls, activeOf(mine));
      return `<div class="slot lmb ${side}${w.mana && !canPay(pools, { mana: w.mana }) ? " wait" : ""}${pk}" data-slot="${key}" data-tiphead="${Side}: ${WEAPON_TYPE_NAMES[w.type]}" data-tip="${tipEsc(`Weapon attack: ${ATTACK_WORDS[w.type]}.`)}" data-tiphint="Click to put a spell or skill on this click instead">` +
        `${this.weaponIcon(mine)}<kbd>${label}</kbd></div>`;
    };
    const ls = this.leftSkill(), rs = this.rightSkill();
    const lcell = clickCell("left") + clickCell("right");
    const bar = document.getElementById("hotbar")!;
    // vertical separators between the click attacks, the skill keys and the potions (Murat 2026-11-07)
    const all = this.chargeCell(mine, cls, [ls, rs], slots, now) + lcell + `<i class="hsep"></i>` + cells + `<i class="hsep"></i>` + this.potionCells(mine); // potions right of the skill keys (Murat 2026-11-04)
    if (this.hotbarHtml !== all) {
      bar.innerHTML = all; this.hotbarHtml = all;
      this.cdEls = this.cdTrack.map((t) => ({ shade: bar.querySelector<HTMLElement>(`[data-cdk="${t.k}"]`), num: bar.querySelector<HTMLElement>(`[data-cnk="${t.k}"]`), pct: -1, sec: -1 }));
      invalidateHud(); // the bar width may have changed
    }
    // Per frame only the cooldown shade height and seconds, and only when the rounded value changes
    for (let i = 0; i < this.cdTrack.length; i++) {
      const t = this.cdTrack[i], el = this.cdEls[i];
      if (!el) continue;
      const pct = Math.round((t.left / t.cd) * 100);
      if (el.shade && pct !== el.pct) { el.shade.style.height = `${pct}%`; el.pct = pct; }
      const sec = Math.ceil(t.left / 1000);
      if (el.num && sec !== el.sec) { el.num.textContent = String(sec); el.sec = sec; }
    }
  }
  /** Cooldown cells of the last renderActions call (values) and their elements (cached while the markup stays the same). */
  private cdTrack: { k: string; left: number; cd: number }[] = [];
  private cdEls: { shade: HTMLElement | null; num: HTMLElement | null; pct: number; sec: number }[] = [];

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
    if (typeof ev.ev === "string" && ev.ev.startsWith("tide")) { this.tideFx(ev); return; }
    if (SONG_SFX.has(ev.ev)) this.songEvent(ev);
    if (ev.ev === "cityoath" || ev.ev === "cityreward") { // W7: an oath sworn at a capital's altar, the leader's pay (sounds: sfx.ts)
      const e = this.entities.get(ev.id);
      if (e) {
        const oath = ev.ev === "cityoath";
        this.floatText(e.sprite.x, e.sprite.y - 30, oath ? `SWORN TO THE ${String(CLANS[ev.clan as ClanKey]?.name ?? "CLAN").replace(/^The /, "").toUpperCase()}!` : `+${Number(ev.gold) || 0} GOLD`, oath ? "#9cc8ff" : "#ffd166", PIXEL_FONT, 1.3);
        this.burst(e.sprite.x, e.sprite.y - 14, oath ? 8 : 6, oath ? 0xffe090 : 0xffd166, 450);
      }
    }
    if (DI_EVENTS.has(ev.ev)) this.diEvent(ev); // newsong, matpick, lutefit, break
    if (ev.ev === "cast") {
      const e = this.entities.get(ev.id);
      if (ev.id === this.me) this.lastCast[ev.s] = this.time.now;
      if (ev.id === this.me && ev.s === this.leftSkill()) this.pointer?.swung(); // a left-click spell went off: that click is done
      // Big melee skills play their own wind-up / action / recovery sequence; everything else the cast animation
      if (e?.hero && this.forms.keeps(ev.id, ev.s)) this.forms.attack(ev.id); // a beast casting its own school's skill bites instead (Bat / Wolf Form)
      else if (e?.hero && !this.moves.start(ev.id, e, ev, this.dirOf(e))) playCharAnim(e.sprite, e.hero, "skill", this.dirOf(e));
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

  /** Tide sfx: banners from the HUD, a slow violet ring and a burst at the goal point when a wave sets out (no shake). */
  private tideFx(ev: any) {
    const at = this.tide?.onSfx(ev);
    if (!at) return;
    this.burst(at.x, at.y, 16, 0x9b7ae0, 700);
    const ring = this.add.circle(at.x, at.y, 20, 0x9b7ae0, 0.18).setStrokeStyle(3, 0xd8c8ff, 0.8).setDepth(at.y + 50);
    this.tweens.add({ targets: ring, scale: 6, alpha: 0, duration: 1400, ease: "Sine.easeOut", onComplete: () => ring.destroy() });
  }

  /** DI-2 / DI-5 events: new song banner, material pickups, lute fitting, breaking (songbookFx.ts). */
  private diEvent(ev: any) {
    diEvent(ev, {
      me: this.me,
      pos: (id) => { const e = this.entities.get(id); return e ? { x: e.sprite.x, y: e.sprite.y - e.top } : undefined; },
      float: (x, y, text, color) => { this.floatText(x, y, text, color, PIXEL_FONT, 1.1); },
      burst: (x, y, r, color, ms) => this.burst(x, y, r, color, ms),
      feed: (text) => this.feed(text),
    });
  }

  /** True when another Songweaver within earshot plays in a different mode: their notes are then voiced as open fifths. */
  private modeClash(ev: any): boolean {
    if (!ev.mode || ev.x === undefined) return false;
    const players = (this.room?.state as any)?.players;
    let clash = false;
    players?.forEach?.((p: any, id: string) => {
      if (clash || id === ev.id || p.cls !== "songweaver") return;
      const m = /(?:^|\s|,)mode:(\w+)/.exec(p.fx ?? "")?.[1];
      if (m && m !== ev.mode && Math.hypot(p.x - ev.x, p.y - ev.y) < 480) clash = true;
    });
    return clash;
  }

  /** Songweaver sfx events (contract in docs/songweaver-progress.md): sound, HUD flash, sound-hit cues. The drawing is in skillfx.ts. */
  private songEvent(ev: any) {
    songweaverSfx(ev, this.me, this.modeClash(ev));
    if (ev.ev === "chord") {
      const c = (MODE_COLOR[ev.mode] ?? MODE_COLOR.major).toString(16).padStart(6, "0");
      const e = this.entities.get(ev.id);
      if (e) this.floatText(e.sprite.x, e.sprite.y - e.top - 14, CHORD_NAMES[ev.prog] ?? ev.prog, `#${c}`, PIXEL_FONT, 1.3);
    } else if (ev.ev === "soundhit") {
      const e = this.entities.get(ev.id);
      this.soundCues.onSoundHit(ev, this.time.now, (text, col) => { if (e) this.floatText(e.sprite.x, e.sprite.y - 28, text, col, PIXEL_FONT, 1); });
    }
  }

  /** A line in the chat log that no player wrote (hints). */
  private chatNote(text: string, color: string) {
    const log = document.getElementById("chatlog");
    if (!log) return;
    const el = document.createElement("div");
    el.textContent = text; el.style.color = color;
    log.appendChild(el);
    while (log.children.length > 8) log.firstChild!.remove();
  }

  /** A hero's name label that would be drawn under the top-right HUD column (minimap, dial, tracker) is hidden. */
  private labelUnderHud(label: Phaser.GameObjects.Text, anchor: { x: number; y: number }) {
    const p = screenOf(this.cameras.main, label.x, label.y, hudRects(this.game.canvas).cr, anchor);
    return hudOccludes(p.x, p.y);
  }

  private noteAt = 0;

  private feed(text: string) {
    const el = document.createElement("div");
    el.textContent = text;
    document.getElementById("feed")!.prepend(el);
    setTimeout(() => el.remove(), 5000);
  }

  private chatMessage(id: string, name: string, text: string) {
    const log = document.getElementById("chatlog")!;
    const el = document.createElement("div");
    el.textContent = `${name}: ${text}`;
    log.appendChild(el);
    while (log.children.length > 8) log.firstChild!.remove();
    if (id.startsWith("npc:")) { this.npcs?.say(id.slice(4), text); return; } // a villager answering a busker
    const e = this.entities.get(id);
    if (!e || e.waiting) return; // a hero still waiting for his sheet is not drawn: no bubble over nothing
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
    if (mine) quake(this, 260, 0.006, "level-up");
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

  /**
   * Teleports (portal stones, ropes and stairs, respawn): the camera jumps with the hero instead of gliding across the
   * map. The follow lerp is set to 1 for a few frames (the iso projection moves the target at render time).
   */
  private camSnap = 0;
  /**
   * Our hero was moved by the server (portal, rope, stair): forget the walking history. Kept, it made the next update
   * look like a huge prediction error, and the hero and camera slid back across the map toward the old spot.
   */
  private jumped() { this.predHist = []; this.corrX = this.corrY = 0; }
  private snapCamera() { this.camSnap = 3; this.cameras.main.setLerp(1, 1); }
  /**
   * Arriving somewhere new: snap the camera, hold the screen in a soft colour while the ground there is painted
   * (smoothground.ts paints in workers), then fade in. Without this the plain tiles showed first and the painted
   * ground appeared on top of them a moment later. Capped so a slow computer never waits long.
   */
  private cover?: { r: number; g: number; b: number; ms: number; since: number; calm: number };
  private arrive(r: number, g: number, b: number, ms: number) {
    this.snapCamera();
    const cam = this.cameras.main;
    cam.resetFX();
    cam.fadeOut(1, r, g, b);
    this.cover = { r, g, b, ms, since: performance.now(), calm: 0 };
  }
  private updateCover() {
    const c = this.cover;
    if (!c) return;
    const pending = IsoView.ground?.pending ?? 0;
    c.calm = pending === 0 && this.camSnap === 0 ? c.calm + 1 : 0;
    if (c.calm < 3 && performance.now() - c.since < 2500) return;
    this.cover = undefined;
    const cam = this.cameras.main;
    cam.resetFX();
    cam.fadeIn(c.ms, c.r, c.g, c.b);
  }
  /** The camera's colour grade (SMOOTH only): Oakvale drained and gloomy; the desert (Act 2) keeps a little more of its warm colour; the moors (Act 3) go cool grey; the badlands (Act 4) are warm, dusty and harsh (high contrast, red cast); the sinkholes (Act 5) are damp, earthy and dim (green-brown cast). */
  private grade?: Phaser.FX.ColorMatrix;
  private gradeAct?: 1 | 2 | 3 | 4 | 5 | 6;
  private setGrade(act: 1 | 2 | 3 | 4 | 5 | 6) {
    if (!this.grade || this.gradeAct === act) return;
    this.gradeAct = act;
    const desert = act === 2, moors = act === 3, badlands = act === 4, sink = act === 5, crown = act === 6;
    this.grade.reset();
    this.grade.saturate(crown ? -0.2 : sink ? -0.3 : moors ? -0.5 : badlands ? -0.12 : desert ? -0.22 : -0.4);
    this.grade.contrast(crown ? 0.15 : sink ? 0.14 : badlands ? 0.22 : desert ? 0.12 : 0.16, true);
    this.grade.brightness(crown ? 0.94 : sink ? 0.88 : moors ? 0.9 : badlands ? 0.97 : desert ? 0.92 : 0.86, true);
    if (moors) this.grade.multiply([0.93, 0, 0, 0, 0, 0, 0.98, 0, 0, 0, 0, 0, 1.08, 0, 0, 0, 0, 0, 1, 0], true); // the moors' cool grey cast (Act 3)
    if (sink) this.grade.multiply([0.95, 0, 0, 0, 0, 0, 1.04, 0, 0, 0, 0, 0, 0.93, 0, 0, 0, 0, 0, 1, 0], true); // the sinkholes' damp green-brown cast (Act 5)
    if (crown) this.grade.multiply([1.02, 0, 0, 0, 0, 0, 0.98, 0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 0, 1, 0], true); // the Crown's cool pale stone with a regal dusk-gold warmth (Act 6)
    if (badlands) this.grade.multiply([1.1, 0, 0, 0, 0, 0, 0.97, 0, 0, 0, 0, 0, 0.88, 0, 0, 0, 0, 0, 1, 0], true); // the badlands' hot dusty cast (Act 4)
  }

  update(_t: number, dtMs: number) {
    if (this.camSnap > 0 && --this.camSnap === 0) this.cameras.main.setLerp(CAM_LERP, CAM_LERP);
    this.iso?.update(dtMs);
    this.updateCover();
    { const me = this.entities?.get(this.me)?.state; if (me) this.setGrade(((a) => (a === 3 || a === 4 || a === 5 || a === 6 ? a : 0))(actOfTile(me.x / TILE, me.y / TILE)) || ( me.y >= DESERT_Y0 * TILE && me.y < (DESERT_Y0 + DESERT_H) * TILE ? 2 : 1)); }
    if (loadingActive()) this.checkLoaded();
    this.ambient?.update(this.time.now, dtMs);
    if (this.dungeon) { this.dungeon.torch = this.torch && !this.entities?.get(this.me)?.state?.dead; this.dungeon.night = this.details?.darkNow ?? 0; }
    this.dungeon?.update(this.time.now);
    if (this.details) {
      this.details.underground = !!this.dungeon?.underground;
      const me = this.entities?.get(this.me)?.state;
      this.details.nightOverride = me && this.fx ? this.fx.nightK(me.x, me.y) : 0; // a vampire's Nightfall: night around the local hero
      const meSprite = this.entities?.get(this.me)?.sprite;
      this.details.hero = meSprite && !me?.dead ? { x: meSprite.x, y: meSprite.y, torch: this.torch } : undefined;
      // where the hero stands on the screen, in HUD px (the quest pointer circles it)
      if (this.npcs) {
        if (meSprite && !me?.dead) {
          const cam = this.cameras.main, cv = this.game.canvas, { cr, hr, hudW } = hudRects(cv);
          const k = hr.width / (hudW || hr.width) || 1;
          const at = screenOf(cam, meSprite.x, meSprite.y, cr);
          const lift = (meSprite.displayHeight * 0.45 * cam.zoom * (cr.height / cv.height)) / k; // half the body, in HUD px
          this.npcs.heroScreen = { x: (at.x - hr.left) / k, y: (at.y - hr.top) / k, lift };
        } else this.npcs.heroScreen = undefined;
      }
    }
    this.details?.update(this.time.now, dtMs);
    if (!this.room) return;
    const meSprite0 = this.entities.get(this.me)?.sprite;
    this.villagers?.update(dtMs, this.outlawSpots(), meSprite0);
    this.saltFolk?.update(dtMs, [], meSprite0);
    this.party?.update();
    this.trade?.update();
    this.watch?.update(dtMs, meSprite0);
    this.torches?.update(this.time.now, (id) => !!this.watch?.striking(id));
    this.fx.update(dtMs);
    const k = this.keys;
    const typing = this.chatting();
    const next: InputState = typing
      ? { up: false, down: false, left: false, right: false }
      : wasdWalks() ? isoInput(k.W.isDown || k.UP.isDown, k.S.isDown || k.DOWN.isDown, k.A.isDown || k.LEFT.isDown, k.D.isDown || k.RIGHT.isDown)
      : isoInput(k.UP.isDown, k.DOWN.isDown, k.LEFT.isDown, k.RIGHT.isDown); // spell keys: W/E/R/T cast, the mouse (or arrows) walks
    // Point-and-click: the mouse steers until a movement key is pressed
    let want = next;
    if (next.up || next.down || next.left || next.right) { this.pointer?.cancel(); this.pointer?.drawRing(); this.pointer?.repick(); } // hover follows the scrolling world
    else want = this.pointer?.update(Math.min(dtMs, 100)) ?? next;
    // A skill key held down keeps casting toward the mouse, like holding a spell in Diablo 2 (the server drops
    // the tries that come before the cooldown or without the mana, so asking often just means no wasted time)
    if (this.heldSlot >= 0) {
      if (typing || !this.input.keyboard?.enabled) this.heldSlot = -1;
      else if (this.time.now - this.slotCastAt >= CAST_REPEAT_MS) { this.slotCastAt = this.time.now; this.castSlot(this.heldSlot); }
    }
    this.sendInput(want);

    const now = this.time.now, wall = performance.now();
    this.countFps(wall);
    this.updateMonsterBar(now);
    // Long frames (a hiccup, a hidden tab) are capped so prediction never leaps through a wall
    const step = Math.min(dtMs, 100);
    stepInterpDelay(step);
    // An easing written for 60 fps (k per frame), adjusted so it pulls just as hard at 30, 120 or 144 fps
    const ease = (k: number) => 1 - Math.pow(1 - k, step / (1000 / 60));
    for (const [id, e] of this.entities) {
      const p = e.state;
      const rooted = (typeof p.fx === "string" && p.fx.includes("charge")) || (id === this.me && this.time.now < this.rootUntil); // a buildup roots the hero, a dash glides
      if (id === this.me && !p.dead && !p.stunned && !p.rolling && !rooted) {
        // Client-side prediction with the same movement code the server runs
        const r = moveStep(e.sprite.x, e.sprite.y, this.input_, step / 1000, heroSpeed(p.cls as ClassKind, p.slowed, own(p).spd) * gearSpeedMult(activeOf(p)));
        e.sprite.setPosition(r.x, r.y);
        if (this.corrX || this.corrY) {
          // Blend in the server's correction; the history moves with it so the next update doesn't count it twice
          const k = ease(0.12), cx = this.corrX * k, cy = this.corrY * k;
          e.sprite.x += cx; e.sprite.y += cy; this.corrX -= cx; this.corrY -= cy;
          for (const h of this.predHist) { h.x += cx; h.y += cy; }
          if (Math.abs(this.corrX) + Math.abs(this.corrY) < 0.3) this.corrX = this.corrY = 0;
        }
        // Just stopped: the server's hero is still walking up behind ours (it hasn't read the stop yet, and its last
        // update is older still). Easing toward that stale spot slid the hero back a step before each attack (Murat).
        // So wait until the server has the stop and stands still too, then settle on its spot.
        const settled = (own(p).seq >= this.stopSeq && !p.moving) || now - this.stoppedAt > 1000;
        if (!r.moving && settled) {
          this.corrX = this.corrY = 0;
          // Ease toward authoritative position while idle (same pull at any frame rate)
          const k = ease(0.2);
          e.sprite.x += (e.tx - e.sprite.x) * k;
          e.sprite.y += (e.ty - e.sprite.y) * k;
        }
      } else if (id === this.me || now < (e.leapUntil ?? 0) || now < (e.chaseUntil ?? 0)) {
        // Our own hero while rolling/stunned, a leap or a dash: follow the server closely
        if (id === this.me) this.corrX = this.corrY = 0;
        const k = ease(id === this.me || p.rolling ? 0.5 : 0.25);
        e.sprite.x += (e.tx - e.sprite.x) * k;
        e.sprite.y += (e.ty - e.sprite.y) * k;
      } else {
        // Everyone else: play back their server positions a little late, so they glide at an even speed
        // instead of lurching once per server update (and stopping when one comes in late)
        const at = interpolate(e.snaps ?? [], wall - interpDelay);
        if (at) e.sprite.setPosition(at.x, at.y);
      }
      if (id === this.me) {
        const h = this.predHist;
        h.push({ t: wall, x: e.sprite.x, y: e.sprite.y });
        while (h.length > 2 && wall - h[0].t > 1500) h.shift();
      }
      if (e.waiting) { e.sprite.setVisible(false); e.label?.setVisible(false); e.titleLabel?.setVisible(false); e.pennant?.setVisible(false); e.stripe?.setVisible(false); e.feudMark?.setVisible(false); continue; } // its sheet is still loading
      // Monsters off screen: hide them and skip the per-frame drawing (there are a lot of them)
      if (e.mob) {
        const v = this.cameras.main.worldView, M = 48;
        const off = e.sprite.x < v.x - M || e.sprite.x > v.right + M || e.sprite.y < v.y - M || e.sprite.y > v.bottom + M;
        if (off) {
          if (!e.culled) {
            e.culled = true; e.sprite.setVisible(false); e.bar.clear().setVisible(false); e.parts?.clear(); e.bubble?.setVisible(false);
            e.label?.destroy(); e.label = undefined; e.lvlColor = undefined; this.siege.clear(id); this.champFx?.drop(id);
          }
          continue;
        }
        if (e.culled) { e.culled = false; e.bubble?.setVisible(true); e.bar.setVisible(true); }
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
        if (stance !== e.hero && ensureCharSheet(this, stance, undefined, -1)) {
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
        if (this.forms.tick(id, e, moving, this.dirOf(e), now)) e.sprite.setAlpha(0); // a beast in the hero's place
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
        if (e.mob && p.kind === "trooper") this.trooperFrame(e, p, now);
        e.sprite.setFlipX(dir === "left" && !(p.kind === "trooper" && parseTroop(p.weapon)?.part === "mouth")); // a tunnel mouth never turns
        if (p.kind === "crawler" && e.sprite.isCropped) e.sprite.setAngle(dir === "left" ? -16 : dir === "right" ? 16 : 0); // leaning on its arms
        if (e.mob) e.sprite.setVisible((!p.dead || (p.kind === "trooper" && !!e.artOn)) && !p.hidden);
        else e.sprite.setAlpha(p.dead ? 0.35 : 1).setAngle(p.dead ? 90 : 0);
      }
      setBaseDepth(e.sprite, e.sprite.y);
      if (e.mob && p.kind === "nightraider" && !p.dead && e.sprite.visible) raiderTrail(this.fx, e as any, moving, now);
      // Status effects: yellow flicker for stunned, blue for slowed, red pulse for raging. A monster winding up shows
      // it in its pose; only sheets without attack frames (?pixel=1) still flash red.
      const windFlash = p.winding && e.sprite.texture.frameTotal <= 12;
      const raging = !e.mob && /(^|,)b_(rage|berserk)(,|$)/.test(p.fx ?? "");
      if (!p.dead && (p.stunned || windFlash || p.slowed || raging)) {
        e.sprite.setTint(p.stunned ? (Math.floor(now / 120) % 2 ? 0xfff176 : 0xffffff)
          : windFlash ? (Math.floor(now / 70) % 2 ? 0xff6b6b : 0xffffff)
          : p.slowed ? 0x90caf9 : (Math.floor(now / 200) % 2 ? 0xff8a80 : 0xffcdd2));
        e.statusTint = true;
      } else if (e.mob && p.owner && !isSummonKind(p.kind) && p.kind !== "wisp" && !p.dead) {
        // A vampire's thrall (Bite, shared/devour.ts): drained pale with a blood-red cast
        e.sprite.setTint(0xe0a8b4); e.statusTint = true;
      } else if (e.statusTint) { e.sprite.clearTint(); e.statusTint = false; }
      e.gear?.sync(e.sprite, p);
      if (e.gear) this.gearFx.tick(e, dtMs, moving);
      if (e.hero) { // the beast trait (took the Hide-Mother's bargain): hide-bound mantle, only for heroes that carry it
        const on = !p.dead && hasTrait(metaOf(p as any, META.cosm), "beast");
        if (on || e.sprite.getData("hidebound")) {
          const k = e.sprite.anims.currentAnim?.key ?? "", i = k.lastIndexOf("_");
          updateHidebound(this, e.sprite, p.cls, i >= 0 ? k.slice(i + 1) : this.dirOf(e), on && e.sprite.visible);
        }
      }

      const x = Math.round(e.sprite.x), y = Math.round(e.sprite.y);
      if (e.mob && p.kind === "trooper") this.trooperLabel(e, p, x, y, id);
      // Monsters: HP bar over the head (only while it matters, see showWorldBar); their name and level are in the top bar
      const mobBarY = y - e.top - 4;
      if (e.label && !e.mob) { // (a clan trooper places its own name: trooperLabel)
        // Heroes: the name over the head, hidden when it would be drawn under the top-right HUD column
        setBaseDepth(e.label.setPosition(x, y - e.top - (p.hat ? 4 : 2)), e.sprite.y + 1);
        e.label.setVisible(!this.labelUnderHud(e.label, e.sprite));
        if (id !== this.me) {
          // Group members: green name
          const myParty = (this.room.state as any).players?.get(this.me)?.party;
          const col = myParty && p.party === myParty ? "#7cfc00" : "#ffffff";
          if (e.lvlColor !== col) { e.label.setColor(col); e.lvlColor = col; }
        }
      }
      if (e.titleLabel) { // the shown title (Player.cosm, public) sits right over the head; the name moves up above it
        const cosm = TITLES[unpackCosmetics(metaOf(p as any, META.cosm)).title] ?? "", rank = this.tabards?.title(id) ?? "";
        const t = cosm && rank ? `${cosm} · ${rank}` : cosm || rank; // the Renown rank of a sworn hero (warTabards.ts)
        if (e.titleLabel.text !== t) e.titleLabel.setText(t);
        const lift = t ? 9 : 0;
        setBaseDepth(e.titleLabel.setPosition(x, y - e.top - (p.hat ? 4 : 2)), e.sprite.y + 1).setVisible(!!t && !p.dead && !p.hidden && (id !== this.me || !!e.label?.visible));
        if (e.label) e.label.setY(e.label.y - lift);
        e.nameLift = lift;
      }
      e.bubble?.setPosition(x, y - e.top - 12 - (e.nameLift ?? 0)); // above the name label
      setBaseDepth(e.bar.clear(), e.sprite.y + 1);
      if (!e.mob) this.tabards?.sync(id, e, !p.dead && !p.hidden);
      if (!e.mob) this.feud?.sync(id, e, !p.dead && !p.hidden); // "Wanted by ..." over the name
      if (e.mob) this.champFx?.sync(id, e, p, x, y, now);
      this.fx.status(e, e.bar, dtMs / 1000);
      // (Stacks built by basic hits are shown by the skill keys, see chargeCell: no pips under the hero, Murat 2026-11-04)
      const maxHp = p.maxHp;
      if (!e.mob && p.guarding && !p.dead) this.fx.shieldMark(e, e.bar); // a raised guard: a mark on the bar, no bubble (own: health orb)
      if (p.broken && !p.dead) {
        // Dizzy: three little stars circling over the head
        const sy = y - e.top - (e.mob ? 8 : 4);
        for (let i = 0; i < 3; i++) {
          const a = now / 180 + (i * Math.PI * 2) / 3;
          e.bar.fillStyle(0xffd166).fillRect(x + Math.cos(a) * 6 - 1, sy + Math.sin(a) * 2 - 1, 2, 2);
        }
        // Execution ready (shared/combat.ts EXECUTE): a small red arrow bobbing above the stars, gone once it is spent
        if (this.execReady.has(id) && now - this.execReady.get(id)! < POISE.mobBrokenMs + 600) {
          const ay = Math.round(sy - 7 + Math.sin(now / 120));
          e.bar.fillStyle(0x3a0000, 0.8).fillRect(x - 4, ay - 1, 9, 2).fillRect(x - 3, ay + 1, 7, 2).fillRect(x - 2, ay + 3, 5, 2).fillRect(x - 1, ay + 5, 3, 1);
          e.bar.fillStyle(0xff4d3d).fillRect(x - 3, ay, 7, 1).fillRect(x - 2, ay + 1, 5, 2).fillRect(x - 1, ay + 3, 3, 2).fillRect(x, ay + 5, 1, 1);
        }
      } else if (this.execReady.size && Date.now() - (this.execReady.get(id) ?? 0) > 500) this.execReady.delete(id); // (the "broken" message can beat the state)
      e.parts?.clear();
      if (e.mob && !p.dead && p.hidden && p.weapon === "ambusher") {
        // up in a tree: nothing shows at all (that's the point of an ambush)
      } else if (e.mob && !p.dead && p.hidden) {
        // Hiding in a grave or tree: only a pair of eyes peeks out (and blinks now and then). Beast-folk lurking in a
        // Mawdeep ambush room: eyes at head height, glowing through the dark
        const lurk = LURKERS.has(p.kind);
        e.bar.setDepth(lurk ? 27600 : 20000);
        const blink = (now + x * 53 + y * 31) % 3200 < 160;
        if (lurk && !blink) {
          const ey = y - 24 + Math.round(Math.sin(now / 900 + x) * 1), col = p.kind === "tuskborn" ? 0xff4a2a : 0xffb020;
          e.bar.fillStyle(col, 0.25).fillRect(x - 4, ey - 1, 9, 3);
          e.bar.fillStyle(col).fillRect(x - 2, ey, 1, 1).fillRect(x + 2, ey, 1, 1);
        } else if (!blink) {
          const col = p.kind === "skeleton" ? 0xff5252 : p.kind === "skeletonmage" ? 0x7fe7ff : p.kind === "sanddead" ? 0xffb030 : p.kind === "scorpion" ? 0x9dff6a : p.kind === "wight" ? 0xa6e8ff : 0xfff176;
          const ey = y - (p.kind === "skeleton" || p.kind === "skeletonmage" || p.kind === "sanddead" || p.kind === "scorpion" || p.kind === "wight" ? 2 : 5);
          e.bar.fillStyle(0x000000, 0.6).fillRect(x - 3, ey - 1, 7, 3);
          e.bar.fillStyle(col).fillRect(x - 2, ey, 1, 1).fillRect(x + 2, ey, 1, 1);
        }
      } else if (e.mob && !p.dead) {
        if (p.parts) this.drawBlobParts(e, id, p, x, y);
        else if (p.kind === "demon" && p.bones && !e.sprite.texture.key.startsWith("mob_demon")) this.drawDemonBones(e, p, x, y); // painted sheets wear them

        const bw = Math.min(40, (MOB_LOOK[p.kind]?.bar || 14) * (1 + MERGE.growPerBlob * ((p.merged || 1) - 1)));
        const showBar = showWorldBar({ hovered: id === this.pointer?.hoverId || id === this.pointer?.inspectId, targeted: id === this.pointer?.targetId, lastMineHitAt: this.lastMineHit.get(id), now, dead: !!p.dead, hidden: !!p.hidden, ownSummon: p.owner === this.me, damaged: maxHp > 0 && p.hp < maxHp });
        if (showBar && ELITE[p.kind as keyof typeof ELITE]) e.bar.fillStyle(BOSS[p.kind as keyof typeof BOSS] ? 0xc62828 : 0xffc93c).fillRect(x - bw / 2 - 1, mobBarY - 1, bw + 2, 4); // elite: gold frame, boss: red
        if (e.rallyUntil && now < e.rallyUntil) {
          // rallied by the chief's War Cry: a red glow under the feet
          e.bar.fillStyle(0xff3d2e, 0.18 + 0.1 * Math.sin(now / 120)).fillEllipse(x, y, 22, 9);
        }
        if (showBar) {
          e.bar.fillStyle(0x000000).fillRect(x - bw / 2, mobBarY, bw, 2);
          e.bar.fillStyle(0xf4a261).fillRect(x - bw / 2, mobBarY, bw * (p.hp / maxHp), 2);
        }
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
    this.tide?.update(meEnt?.sprite.x, meEnt?.sprite.y);
    if (meEnt) this.showArea(areaAt(meEnt.sprite.x, meEnt.sprite.y));
    this.signPanel.update(meEnt?.sprite);
    if (this.chests) {
      // lair chest id -> living guardians (counted a few times a second: walking all monsters every frame is wasteful)
      if (now >= this.guardsAt) {
        this.guardsAt = now + 250;
        const guards = this.guards; guards.clear();
        this.mobs.forEach((m: any) => { if (m.guard && !m.dead) guards.set(m.guard, (guards.get(m.guard) ?? 0) + 1); });
      }
      const guards = this.guards;
      this.chests.update(meEnt && !meEnt.state.dead ? meEnt.sprite : undefined, !!this.npcs?.isOpen, meEnt?.state, (cid) => guards.get(cid) ?? 0);
    }
    this.shrine?.update(meEnt && !meEnt.state.dead && !this.chests?.near ? meEnt.sprite : undefined, !!this.npcs?.isOpen);
    this.stash?.update(meEnt && !meEnt.state.dead ? meEnt.sprite : undefined, !!this.npcs?.isOpen || !!this.chests?.near);
    this.bounty?.update(meEnt && !meEnt.state.dead ? meEnt.sprite : undefined, !!this.npcs?.isOpen || !!this.chests?.near || !!this.stash?.near);
    if (this.npcs) { this.npcs.hidePrompt = !!this.chests?.near || !!this.shrine?.near || !!this.portals?.near || !!this.waygates?.near || !!this.ferry?.near || !!this.stash?.near || !!this.bounty?.near; this.npcs.extraBlock = (this.bounty?.trackerBlock() ?? "") + (this.bounty?.writBlock() ?? "") + (this.qcarry?.trackerBlock(this.me, (id) => this.entities.get(id)?.state?.name ?? "A friend") ?? ""); }
    this.npcs?.objects.hideCarried(this.qcarry?.update(this.me, (id) => this.entities.get(id)));
    this.npcs?.update(meEnt && !meEnt.state.dead ? meEnt.sprite : undefined, meEnt?.state);
    this.grimoire?.update(meEnt?.state?.cls);
    this.ferry?.update(meEnt?.state, meEnt && !meEnt.state.dead ? meEnt.sprite : undefined, !!this.npcs?.isOpen || !!this.chests?.near || !!this.portals?.near);
    this.waygates?.update(meEnt?.state, meEnt && !meEnt.state.dead ? meEnt.sprite : undefined, !!this.npcs?.isOpen || !!this.chests?.near);
    this.portals?.update(meEnt && !meEnt.state.dead ? meEnt.sprite : undefined, !!this.npcs?.isOpen || !!this.chests?.near || !!this.shrine?.near);
    if (this.minimap) { this.minimap.war = this.warLast; this.minimap.clan = this.warStd?.clan || undefined; this.minimap.sacked = this.sack?.sacked; this.minimap.towns = this.warTowns2; this.minimap.lines = this.warCols; this.minimap.battles = this.warBattle; } // the war table layer (warTable.ts) and the war overlays (warMap.ts)
    if (this.minimap && this.npcs) this.minimap.markers = [...this.npcs.markers, ...(this.portals?.markers() ?? []), ...(this.bounty?.markers() ?? []), ...(this.dungeon?.markers() ?? []), ...(this.waygates?.markers() ?? []), ...(this.qcarry?.markers() ?? []), ...(this.tide?.markers() ?? [])];

    const mine = meEnt?.state;
    if (mine) {
      this.gearMenu?.refresh(mine);
      this.talentMenu?.refresh(mine);
      if (!document.getElementById("hero")!.hidden) this.showHeroMenu(this.heroFrom);
      this.side?.refresh(mine);
      const safe = isSafeZone(meEnt.sprite.x, meEnt.sprite.y) ? `${icon("shield")}Safe zone · ` : "";
      const next = xpForLevel(mine.level + 1), cur = xpForLevel(mine.level);
      const cls0 = mine.cls as ClassKind;
      // Level and XP live on the bars (resourceBars.ts), gold in the bag, potions on the flasks, skill points on the
      // Skills button badge: this line only flags the safe zone or a respawn
      const statsHtml = mine.dead ? "Respawning… " : ""; // (the safe zone line was removed, Murat 2026-11-07)
      void safe;
      if (statsHtml !== this.statsShown) { this.statsShown = statsHtml; document.getElementById("stats")!.innerHTML = statsHtml; }
      const freePts = talentPoints(mine.level) - spentPoints(cls0, own(mine).talents);
      const badge = document.getElementById("treebadge")!;
      badge.hidden = freePts <= 0;
      badge.textContent = String(freePts);
      const freeStats = statPoints(mine.level) - (own(mine).ptSta + own(mine).ptStr + own(mine).ptMag + own(mine).ptDex);
      const hb = document.getElementById("herobadge")!;
      hb.hidden = freeStats <= 0;
      hb.textContent = String(freeStats);
      this.side?.setBadges(freeStats, freePts);
      if (!showLevelNote(freeStats) && performance.now() - this.noteAt > 1500) { // (a moment of grace: the stat points sync a tick after the message)
         const ln = document.getElementById("lvlnote")!; if (!ln.hidden) ln.hidden = true; } // nothing left to assign
      // Zone under the hero drives the music
      const tx = meEnt.sprite.x / TILE, ty = meEnt.sprite.y / TILE;
      const zdef = zoneAt(Math.floor(tx), Math.floor(ty));
      setMusicZone(zdef?.name, zdef?.mobs, this.areaName, actOfTile(tx, ty));
      this.ambient?.setHero(tx, ty); // the moors' mist thickens in its hollows
      this.warStd?.update(meEnt.state.dead ? undefined : meEnt.sprite, !!this.npcs?.isOpen || !!this.npcs?.busy || !!this.chests?.near || !!this.stash?.near || !!this.bounty?.near || !!this.portals?.near || !!this.shrine?.near || !!this.waygates?.near || !!this.dungeon?.nearDoor, now);
      this.warTroops?.update(meEnt.state.dead ? undefined : meEnt.sprite, now);
      this.warBattle.update(meEnt.state.dead ? undefined : meEnt.sprite);
      this.warRituals?.update(meEnt.state.dead ? undefined : meEnt.sprite); // the Veiled ritual circle (warRituals.ts)
      this.sack?.update(meEnt.state.dead ? undefined : meEnt.sprite, !!this.npcs?.isOpen || !!this.npcs?.busy || !!this.chests?.near || !!this.stash?.near || !!this.bounty?.near || !!this.portals?.near); // a hostile Hold's banner (warSack.ts)
      this.city?.update(meEnt.state.dead ? undefined : meEnt.sprite, !!this.npcs?.isOpen || !!this.npcs?.busy || !!this.chests?.near || !!this.stash?.near || !!this.portals?.near || !!this.waygates?.near);
      this.warTowns2?.update(meEnt.state.dead ? undefined : meEnt.sprite, !!this.npcs?.isOpen || !!this.npcs?.busy || !!this.chests?.near || !!this.stash?.near || !!this.bounty?.near || !!this.portals?.near); // town banners, watch and the gate prompt (warTowns.ts)
      if (!meEnt.state.dead) this.warRoadFx?.update(meEnt.sprite.x, meEnt.sprite.y);
      this.warPlaque?.update(tx, ty, this.warStd?.standing(meEnt.sprite)); // the clan war front plaque (warPlaque.ts)
      sfxFrame(this.me, this.entities as any);
      const cls = mine.cls as ClassKind;
      const cdm = cooldownMult(cls, statsOf(mine), own(mine).talents);
      // Top-left bars (resourceBars.ts): red HP, blue Mana (spells, shared/mana.ts), green XP
      const ow = own(mine), mn = unpackMana(ow.mp); // owner-only numbers, in `me` (server/player.ts)
      (this.resBars ??= new ResourceBars(document.getElementById("hud")!)).update({
        song: cls === "songweaver", chordLock: !mine.dead && String(mine.fx ?? "").split(",").includes("chlock"), mode: /(?:^|,)mode:(\w+)/.exec(mine.fx ?? "")?.[1], rank: (id: string) => ow.talents.get(id) ?? 0, shield: !mine.dead && (!!mine.guarding || hasSongShield(mine.fx)), shieldAmt: mine.dead ? 0 : Math.max(0, Number(ow.shield) || 0), level: mine.level, hp: mine.hp, maxHp: mine.maxHp, mp: mn.mana, maxMp: mn.maxMana, // the gauge lives in mana / maxMana (shared/mana.ts usesGauge)
        xpFrac: mine.level >= MAX_LEVEL ? 1 : Math.max(0, Math.min(1, (ow.xp - cur) / Math.max(1, next - cur))),
        xp: Math.max(0, ow.xp - cur), xpNeed: mine.level >= MAX_LEVEL ? undefined : next - cur,
      });
      // Heat / overload gauge on the left (overloadGauge.ts, shared/overload.ts)
      const flip = (this.heatGauge ??= new OverloadGauge(document.getElementById("hud")!)).update(ow.energy);
      if (flip) playSfx(flip);
      this.renderActions(mine, cls, cdm, now);
      (this.buffBar ??= new BuffBar(hudSlot("statusrow"))).update(ow.timers);
    }
  }
}
