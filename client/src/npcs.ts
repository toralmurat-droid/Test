import { armouryTextures, armouryOrigin, AR_TX } from "./armoury";
import "@fontsource/pixelify-sans/400.css";
import { actionKey } from "./keymode";
import { icon as pxIcon } from "./pixelicons";
import "@fontsource/pixelify-sans/700.css";
import "./npcs.css";
import { pixelText } from "./pixeltext";
import Phaser from "phaser";
import { CAMP_PIVOT, TX as CAMP_TX, witchCampTextures } from "./witchCamp";
import { worldPropTextures } from "./worldProps";
import { ANVIL_TOP, FORGE_FLUE, SMITHY_ORIGIN, TX as SMITHY_TX, smithyTextures } from "./smithy";
import { smokeTexture } from "./bonfireArt";
import { NPCS, NPC_DECOR, Npc, npcById, npcNear, TALK_RANGE } from "../../shared/npcs";
import {
  CHAINS, chainOpen, chainState, questSig, TUT_CHAIN, npcPresent, ZONE_ARCS, npcQuestMark, questDef, questDialog, questObjective, questStep, Quester, QuestTarget, questTargets, stepGoal, stepProgress,
} from "../../shared/quests";
import { QuestObjects } from "./questObjects";
import { TILE } from "../../shared/constants";
import { ISO } from "./isoflag";
import { routeVia } from "../../shared/dungeon";
import { actAt, WAYGATES } from "../../shared/act2";
import type { MapMarker } from "./minimap";
import { QuestLog } from "./questlog";
import { MASTER_LEVELS, SHOPS, sellPrice, shopBuys, shopFuses } from "../../shared/shops";
import { GEAR_SLOTS, GearSlot, gearDef, gearName, itemLevel, itemRarity, itemText, reqProblem, TIER_NAMES } from "../../shared/gear";
import { CHAR_GROW, CHAR_SCALE, CHAR_ORIGIN, CharacterName, playCharAnim } from "./artAssets";
import { iconCanvas, itemColor, rarityLabel, reqInfoOf } from "./gear";
import { fuseCost, fuseProblem, looseRuneCounts, parseRune, RUNE_FUSE_COUNT, RUNE_KIND_NAMES, RUNES, runeName, runeText } from "../../shared/runes";
import { runeCanvas, runeCss } from "./runeArt";
import { itemTexture, potionTex } from "./textures";
import { potionAmount, potionName, potionSlots, slotsAfter, total, unpackPotions } from "../../shared/potions";
import { BAG_SIZE } from "../../shared/gear";
import { isoAnchor } from "./iso";
import { speechBubble } from "./weathered";
import { msUntilUndeadNight } from "../../shared/daynight";
import { dayTime } from "./details";
import { TEXT_FONT, TITLE_FONT, TEXT_PX, TITLE_PX, WT } from "./pixelfont";
import { own } from "./own";

type Me = { x: number; y: number } | undefined;
/** The local player's synced state (only the fields NPCs care about). */
type QuestState = (Quester & { cls?: string } & Partial<Record<GearSlot, string>>) | undefined; // bag, gold, points: own(q)

/**
 * Village NPCs (shared/npcs.ts): sprites by the bonfire, "!"/"?" quest markers, an "E Talk" prompt when close,
 * a dialog panel and the quest tracker. The server checks distance and owns quest progress.
 */
/** Where the way to the other act starts, for the tracker (shared/desert.ts WAYGATE_OAKVALE / WAYGATE_DESERT). */
const GATE_HINT: Record<1 | 2, string> = {
  1: "Step through the waygate, just outside Oakvale's south gate",
  2: "Step through the waygate in the Sunstone Circle, south-west of Kel Ashar",
};

/** Who gives a zone arc (shared/quests.ts ZONE_ARCS), and the first quest's level of their arc. */
const ZONE_GIVERS = new Map(ZONE_ARCS.map((a) => [a.quests[0].giver, a.quests[0].minLevel]));
/** A zone arc fits a hero from its first quest's level to a few levels past it (beyond that it is only a "!" on the map). */
export const arcFits = (giver: string, level: number) => { const l = ZONE_GIVERS.get(giver); return l !== undefined && level >= l && level <= l + 6; };

export class NpcLayer {
  private bubbles = new Map<string, Phaser.GameObjects.Image>();
  private sprites = new Map<string, { sprite: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.Text; mark: Phaser.GameObjects.Text }>();
  private prompt = document.createElement("div");
  private dialog = document.createElement("div");
  private tracker = document.createElement("div");
  private toast = document.createElement("div");
  private near?: Npc;
  private talking?: Npc;
  /** Trader page instead of the quest talk (traders who also give quests get a "Trade" button) */
  private trading = false;
  private q: QuestState;
  readonly objects: QuestObjects;
  private nearObj?: ReturnType<QuestObjects["near"]>;
  private trackerHtml = "";
  private promptHtml = "";
  private trackQ: QuestState | undefined;
  private trackAt = 0;
  /**
   * Folding in the tracker (Murat 2026-11-07): a quest is folded to its title by default and opens once it is started;
   * a click on the title flips that, remembered per title ("opened" for folded-by-default ones, "folded" for started ones).
   */
  private folded = new Set<string>((() => { try { return JSON.parse(localStorage.getItem("qtfolded") ?? "[]") as string[]; } catch { return []; } })());
  private opened = new Set<string>((() => { try { return JSON.parse(localStorage.getItem("qtopened") ?? "[]") as string[]; } catch { return []; } })());
  private isFolded(title: string, started: boolean) { return started ? this.folded.has(title) : !this.opened.has(title); }
  /** Arrow around the hero pointing to the first tracked objective, with its distance in steps (tiles). */
  private pointer = document.createElement("div");
  private aim?: { dx: number; dy: number; d: number };
  /** The quest followed with the small button on its card: its objective gets a marker on the ground and the arrow. */
  private followed = (() => { try { return localStorage.getItem("qtfollow") ?? ""; } catch { return ""; } })();
  private goal?: { x: number; y: number; r: number };
  private goalRing?: Phaser.GameObjects.Graphics;
  private goalBeam?: Phaser.GameObjects.Image;
  /** The local hero's feet on the screen, HUD px (TownScene sets it every frame). */
  heroScreen?: { x: number; y: number; lift?: number };
  private stage: unknown = -1;
  private shopMsg = "";
  readonly log = new QuestLog();
  /** Quest giver / trader / quest area markers for the minimap and world map. */
  markers: MapMarker[] = [];
  /** Extra tracker block: the bounty hunt in progress (client/src/bounty.ts). */
  extraBlock = "";

  constructor(private scene: Phaser.Scene, private send: (type: string, msg?: unknown) => void) {
    const hud = document.getElementById("hud")!;
    this.prompt.id = "npcprompt";
    this.dialog.id = "npcdialog";
    this.tracker.id = "questtracker";
    this.pointer.id = "questpointer";
    this.toast.id = "questtoast";
    hud.append(this.prompt, this.dialog, this.tracker, this.toast, this.pointer);
    this.prompt.onclick = () => this.interact();
    // Click a quest's title to fold it down to that line (remembered); anywhere else opens the quest log
    // Each quest is a card: its follow button marks the objective on the ground, its header folds / opens it,
    // anywhere else opens the quest log
    this.tracker.onclick = (ev) => {
      const el = ev.target as HTMLElement;
      const fb = el.closest(".qt-follow") as HTMLElement | null;
      if (fb) {
        const k = (fb.closest(".qt-block") as HTMLElement).dataset.key ?? "";
        this.followed = this.followed === k ? "" : k;
        try { localStorage.setItem("qtfollow", this.followed); } catch { /* storage off */ }
        this.trackerHtml = ""; this.trackAt = 0;
        return;
      }
      const t = el.closest(".qt-head") as HTMLElement | null;
      const block = t?.closest(".qt-block") as HTMLElement | null;
      const key = block?.dataset.key ?? "";
      if (!block || !key) { this.log.toggle(true); return; }
      const started = block.dataset.started === "1";
      const set = started ? this.folded : this.opened;
      if (set.has(key)) set.delete(key); else set.add(key);
      try { localStorage.setItem("qtfolded", JSON.stringify([...this.folded])); localStorage.setItem("qtopened", JSON.stringify([...this.opened])); } catch { /* storage off */ }
      this.trackerHtml = ""; this.trackAt = 0; // redraw on the next update
      block.classList.toggle("folded", this.isFolded(key, started));
    };
    for (const n of NPCS) {
      const sprite = scene.add.sprite(n.x, n.y, n.sprite, 0).setOrigin(CHAR_ORIGIN.x, CHAR_ORIGIN.y).setScale(CHAR_SCALE).setDepth(n.y);
      playCharAnim(sprite, n.sprite as CharacterName, "idle", n.dir);
      sprite.setInteractive({ useHandCursor: true }).on("pointerdown", () => { if (this.near === n) this.open(n); });
      const label = scene.add.text(n.x, n.y - Math.round(21 * CHAR_GROW), n.name, {
        fontFamily: TEXT_FONT, fontSize: `${TEXT_PX}px`, color: n.shop ? "#ffd166" : "#b9f27c", stroke: "#000", strokeThickness: 2,
      }).setOrigin(0.5, 1).setScale(WT).setResolution(1).setDepth(n.y + 1);
      const mark = scene.add.text(n.x, n.y - Math.round(25 * CHAR_GROW), "", {
        fontFamily: TITLE_FONT, fontSize: `${TITLE_PX}px`, color: "#ffd166", stroke: "#000", strokeThickness: 2,
      }).setOrigin(0.5, 1).setScale(WT).setResolution(1).setDepth(n.y + 1);
      scene.tweens.add({ targets: mark, y: n.y - Math.round(27 * CHAR_GROW), duration: 600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      // iso view: name and quest mark stand straight above the NPC, not at a world point north of it
      isoAnchor(label, sprite); isoAnchor(mark, sprite);
      this.sprites.set(n.id, { sprite, label, mark });
    }
    this.addSurroundings(scene);
    this.objects = new QuestObjects(scene);
  }

  /** Morwen's tent and alchemy rig, Brann's forge… around the traders, plus Brann hammering at his anvil. */
  private addSurroundings(scene: Phaser.Scene) {
    worldPropTextures(scene);
    witchCampTextures(scene);
    smithyTextures(scene);
    armouryTextures(scene);
    for (const d of NPC_DECOR) {
      const x = d.x * TILE, y = d.y * TILE;
      if (d.prop.startsWith("wc_")) { // pixel-art camp props, 1.5 texels per world px
        scene.add.sprite(x, y, d.prop, 0).setOrigin(0.5, CAMP_PIVOT[d.prop]).setScale(1 / CAMP_TX).setDepth(y).setFlipX(!!d.flip).play(`${d.prop}_idle`);
        continue;
      }
      if (d.prop.startsWith("sm_")) { // Brann's smithy, same pixel grid
        const [ox, oy] = SMITHY_ORIGIN[d.prop];
        scene.add.sprite(x, y, d.prop, 0).setOrigin(ox, oy).setScale(1 / SMITHY_TX).setDepth(y).setFlipX(!!d.flip).play({ key: `${d.prop}_idle`, startFrame: Math.floor(d.x * 7) % 12 });
        if (d.prop === "sm_forge") this.chimneySmoke(scene, x, y);
        continue;
      }
      if (d.prop.startsWith("ar_")) { // the armourers' stands and racks (armoury.ts), same pixel grid
        const [ox, oy] = armouryOrigin(d.prop);
        scene.add.sprite(x, y, d.prop, 0).setOrigin(ox, oy).setScale(d.scale / AR_TX).setDepth(y).setFlipX(!!d.flip).play({ key: `${d.prop}_idle`, startFrame: Math.floor(d.x * 5) % 12 });
        continue;
      }
      if (d.prop === "weapon_rack") { // pixel-art rack shared with the camps (worldProps.ts)
        scene.add.sprite(x, y, "wp_weapon_rack", 0).setOrigin(0.5, 1).setScale(0.62).setDepth(y).setFlipX(!!d.flip);
        continue;
      }
      const img = scene.add.sprite(x, y, "props", d.animated ? `${d.prop}_0` : d.prop).setOrigin(0.5, 1).setScale(d.scale).setDepth(y).setFlipX(!!d.flip);
      if (d.animated && scene.anims.exists(`props_${d.prop}`)) img.play(`props_${d.prop}`);
    }
    const brann = NPCS.find((n) => n.id === "weaponsmith"), anvil = NPC_DECOR.find((d) => d.prop === "sm_anvil");
    const smith = brann && this.sprites.get(brann.id)?.sprite;
    if (brann && anvil && smith) {
      const ax = anvil.x * TILE - 2, ay = anvil.y * TILE - ANVIL_TOP;
      // A slower take on his attack swing, so the hammer blow reads clearly
      const dir = brann.dir === "left" ? "right" : brann.dir;
      const key = `${brann.sprite}_hammer_${dir}`;
      const swing = scene.cache.json.get("characters_meta")?.animations?.[`attack_${dir}`];
      if (swing && !scene.anims.exists(key)) {
        scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(brann.sprite, { frames: swing.frames }), frameRate: 7, repeat: 0 });
      }
      const strike = () => {
        if (this.talking === brann || !scene.anims.exists(key)) return; // stops to serve customers
        smith.setFlipX(brann.dir === "left");
        smith.play(key);
        smith.once("animationcomplete", () => playCharAnim(smith, brann.sprite as CharacterName, "idle", brann.dir));
        scene.time.delayedCall(400, () => this.sparks(ax, ay)); // hammer hits the anvil on the 3rd frame
      };
      scene.time.addEvent({ delay: 1600, loop: true, callback: strike });
    }
  }

  /** Pixel smoke rising slowly out of the forge chimney, drifting with the wind like the village chimneys. */
  private chimneySmoke(scene: Phaser.Scene, x: number, y: number) {
    smokeTexture(scene);
    const smoke = scene.add.particles(x + FORGE_FLUE[0], y - FORGE_FLUE[1], "smoke_px", {
      frame: [0, 1, 2, 3],
      lifespan: { min: 4200, max: 6000 },
      speedY: { min: -11, max: -7 },
      speedX: { min: 1, max: 4 },
      accelerationX: 1.5,
      scale: { start: 0.35, end: 1.2 },
      alpha: { start: 0.55, end: 0 },
      frequency: 380,
    }).setDepth(25000);
    isoAnchor(smoke, { x, y });
  }

  private sparks(x: number, y: number) {
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, d = 8 + Math.random() * 10;
      const sp = this.scene.add.rectangle(x, y, 1.5, 1.5, Math.random() < 0.5 ? 0xffd166 : 0xff8c42).setDepth(y + 60);
      this.scene.tweens.add({ targets: sp, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d + 6, alpha: 0, duration: 350 + Math.random() * 200, onComplete: () => sp.destroy() });
    }
  }

  get isOpen() { return !!this.talking; }
  /** Another prompt (a loot chest) has the spot this frame. */
  hidePrompt = false;

  /** E key: use the quest object you stand next to, talk to the NPC next to you, or close the dialog. */
  /** A villager speaks (server `chat` from `npc:<id>`): a speech bubble over its sprite for a few seconds. */
  say(id: string, text: string): boolean {
    const s = this.sprites.get(id);
    if (!s) return false;
    this.bubbles.get(id)?.destroy();
    const b = speechBubble(this.scene, s.sprite.x, s.sprite.y - Math.round(21 * CHAR_GROW) - 14, text).setDepth(s.sprite.depth + 5);
    isoAnchor(b, s.sprite);
    this.bubbles.set(id, b);
    this.scene.time.delayedCall(4000, () => { if (this.bubbles.get(id) === b) { b.destroy(); this.bubbles.delete(id); } });
    return true;
  }

  interact() {
    if (this.story) this.closeStory();
    else if (this.talking) this.close();
    else if (this.nearObj) this.send("use", { id: this.nearObj.id });
    else if (this.near) this.open(this.near);
  }

  /** The scene opens the bag beside a shop (stats to compare) and shows what a piece for sale would change. */
  onShopOpen?: (open: boolean) => void;
  onPreview?: (id?: string) => void;
  private shopOpen = false;
  /** Masterwork level picked in the shop (undefined: the best the hero can wear). */
  private masterLv?: number;

  close() {
    if (this.shopOpen) { this.shopOpen = false; this.onPreview?.(); this.onShopOpen?.(false); }
    this.talking = undefined;
    this.dialog.classList.remove("open");
  }

  /**
   * The story card (Murat 2026-11-10: quests end and carry on out in the field): what the hero finds when a quest ends
   * away from any giver (QuestDef.outro), then the next quest when it starts by itself (QuestDef.auto). Same look as a
   * talk with an NPC; E or the button closes it.
   */
  private story?: { parts: string[] };
  private showStory(head: string, sub: string, lines: string[], add = false) {
    if (this.talking) this.close();
    const part = `<div class="nd-head"><span class="nd-name">${head}</span><span class="nd-title">${sub}</span></div>` + lines.map((t) => `<p>${t}</p>`).join("");
    this.story = { parts: add && this.story ? [...this.story.parts, part] : [part] };
    this.dialog.classList.remove("shop");
    this.dialog.innerHTML = this.story.parts.join("") + `<div class="nd-btns"><button class="nd-bye">On my way <kbd>E</kbd></button></div>`;
    this.dialog.querySelector<HTMLButtonElement>(".nd-bye")!.onclick = () => this.closeStory();
    this.dialog.classList.add("open");
  }
  private closeStory() {
    this.story = undefined;
    this.dialog.classList.remove("open");
  }

  /** Server says the quest moved on: banner in the pixel font. */
  onQuest(msg: { qid: number; stage: number; done?: boolean; chain?: number; auto?: boolean }) {
    const ch = CHAINS[msg.chain ?? 0] ?? CHAINS[0], quests = ch.quests;
    const ended = msg.done ? quests[msg.qid - 1] : undefined;
    if (ended?.outro) this.showStory(ended.title, "Quest complete", ended.outro);
    if (msg.auto && quests[msg.qid]) {
      // carried on by itself: a zone arc's trail goes on; a story quest comes as word from its giver
      const d = quests[msg.qid], who = npcById(d.giver)?.name ?? "";
      this.showStory(d.title, ch.local ? "The trail goes on" : `Word from ${who}`, d.offer, !!this.story);
    }
    let m: [string, string] | undefined;
    if (msg.done) m = ["Quest complete", quests[msg.qid - 1]?.title ?? ""];
    else {
      const step = quests[msg.qid]?.steps[msg.stage - 1];
      m = step?.banner;
      // A night step reached by day (the Hollow King, the Marshal...): nothing rises yet, so the banner says to wait
      if (m && step?.night && msUntilUndeadNight(dayTime(Date.now())) > 0) m = ["Wait for nightfall", m[1]];
    }
    if (m && m[0] === "New quest") m = ["New quest", quests[msg.qid].title];
    this.tracker.classList.remove("flash"); void this.tracker.offsetWidth; this.tracker.classList.add("flash");
    if (m) {
      // Same pixel lettering as the zone banners
      this.toast.replaceChildren(pixelText(m[0], "#b9f27c", 13, 3), pixelText(m[1], "#ffffff", 11, 2));
      this.toast.classList.remove("show"); void this.toast.offsetWidth; this.toast.classList.add("show");
      clearTimeout((this.toast as any)._t);
      (this.toast as any)._t = setTimeout(() => this.toast.classList.remove("show"), 3500);
    }
  }

  /** Server answer to a buy / sell. */
  onShop(msg: { ok: boolean; text: string }) {
    this.shopMsg = `<span class="${msg.ok ? "ok" : "no"}">${msg.text}</span>`;
    this.stage = -1;
  }

  private open(n: Npc) {
    this.talking = n;
    this.trading = !questDialog(n.id, this.q);
    this.shopMsg = "";
    this.stage = -1; // force a redraw
    this.dialog.classList.add("open");
  }

  private head(n: Npc) {
    return `<div class="nd-head"><span class="nd-name">${n.name}</span><span class="nd-title">${n.title}</span></div>`;
  }

  /** Shop page: stock to buy, and (for traders who buy) the player's matching bag items to sell. */
  private renderShop(n: Npc, q: QuestState) {
    const shop = SHOPS[n.shop!];
    const o = own(q), { gold, potions } = o, cls = q?.cls, pots = unpackPotions(potions);
    const bag = [...o.bag];
    // masterwork: one level shown at a time (picked with the buttons), by default the best one the hero can wear
    const master = this.masterLv ?? [...MASTER_LEVELS].reverse().find((l) => l <= (q?.level ?? 1)) ?? MASTER_LEVELS[0];
    const key = JSON.stringify([n.id, master, gold, potions, bag, q?.level, o.ptSta, o.ptStr, o.ptMag, o.ptDex, ...GEAR_SLOTS.map((s) => q?.[s]), this.shopMsg, questSig(q)]);
    if (key === this.stage) return;
    this.stage = key;
    const row = (icon: string, name: string, color: string, desc: string, btn: string, cls2: string, i: number, off: boolean) =>
      `<div class="sh-row"><span class="sh-icon" data-icon="${icon}"></span><span class="sh-info"><b style="color:${color}">${name}</b><small>${desc}</small></span>` +
      `<button class="${cls2}" data-i="${i}"${off ? " disabled" : ""}>${btn}</button></div>`;
    let masterHead = false, lastLv = 0;
    const buy = shop.stock.map((e, i) => {
      if (e.item === "potion" || e.item === "mpotion") {
        const qty = e.qty ?? 1, size = e.size ?? 0, mana = e.item === "mpotion";
        const room = bag.length + slotsAfter(pots, e.item, size, qty) <= BAG_SIZE;
        return row(`${e.item}:${size}`, `${qty > 1 ? `${qty} × ` : ""}${potionName(e.item, size)}`, mana ? "#8ab4ff" : "#ff8a8a",
          `${mana ? "+" : "Heals "}${potionAmount(e.item, size)}${mana ? " mana" : " HP"} · you carry ${total(pots[e.item])} · ${actionKey(mana ? "mana" : "potion")} · ${room ? "10 per bag slot" : "no room in your bag"}`,
          `${e.price}${pxIcon("coin")}`, "sh-buy", i, gold < e.price || !room);
      }
      const d = gearDef(e.item)!, lv = itemLevel(e.item), isMaster = itemRarity(e.item) === 3;
      if (isMaster && lv !== master) return "";
      let head = "";
      if (shop.levelHeads && !isMaster && lv !== lastLv) { lastLv = lv; head = `<h5 class="sh-lv">Lv ${lv}</h5>`; } // armourers: one heading per level step
      if (isMaster && !masterHead) {
        masterHead = true;
        head = `<h5 class="sh-lv">Masterwork · Legendary, forged by Brann</h5><div class="sh-lvpick">` +
          MASTER_LEVELS.map((l) => `<button data-lv="${l}"${l === master ? ' class="on"' : ""}>Lv ${l}</button>`).join("") + `</div>`;
      }
      const why = q ? reqProblem(e.item, reqInfoOf(q)) : "";
      return head + row(e.item, gearName(e.item, cls), itemColor(e.item), `${rarityLabel(e.item)}${TIER_NAMES[d.tier]} · Lv ${itemLevel(e.item)} · ${itemText(e.item)}${why ? ` · <span class="sh-need">${why}</span>` : ""}`,
        `${e.price.toLocaleString("en-US")}${pxIcon("coin")}`, "sh-buy", i, gold < e.price);
    }).join("");
    const sellable = shop.buys ? bag.map((id, i) => [id, i] as const).filter(([id]) => shopBuys(shop, id)) : [];
    const sellRow = (id: string, i: number) => {
      const r = parseRune(id); // a loose rune (shared/runes.ts): Morwen buys them
      return r
        ? row(id, runeName(r), runeCss(r), `${RUNE_KIND_NAMES[RUNES[r.key].kind]} · ${runeText(r)}`, `Sell ${sellPrice(id)}${pxIcon("coin")}`, "sh-sell", i, false)
        : row(id, gearName(id, cls), itemColor(id), `${rarityLabel(id)}${TIER_NAMES[gearDef(id)!.tier]} · Lv ${itemLevel(id)} · ${itemText(id)}`, `Sell ${sellPrice(id)}${pxIcon("coin")}`, "sh-sell", i, false);
    };
    const onlyRunes = shop.buys?.length === 1 && shop.buys[0] === "rune";
    const sell = shop.buys
      ? `<h4>${onlyRunes ? "Sell runes from your bag" : "Sell from your bag"}</h4>` + (sellable.length
        ? sellable.map(([id, i]) => sellRow(id, i)).join("")
        : `<p class="sh-empty">${onlyRunes ? "No loose runes in your bag. Take one out of an item in the Bag to sell it." : "Nothing to sell in your bag. Take a piece off in the Bag to sell it."}</p>`)
      : "";
    // rune fusion (shared/runes.ts): one row per key and rank the hero carries loose, the button says why it's off
    const fuseRows = shopFuses(shop) ? [...looseRuneCounts(bag)].sort(([a], [b]) => a.localeCompare(b)).map(([id, have]) => {
      const r = parseRune(id)!, cost = fuseCost(r.rank);
      const why = fuseProblem(id, { bag, gold, reserved: potionSlots(pots), bagSize: BAG_SIZE });
      const into = cost === undefined ? "already the highest rank" : `${RUNE_FUSE_COUNT} → 1 ${runeName({ key: r.key, rank: r.rank + 1 })}`;
      return `<div class="sh-row"><span class="sh-icon" data-icon="${id}"></span><span class="sh-info"><b style="color:${runeCss(r)}">${runeName(r)} × ${have}</b>` +
        `<small>${into}${why ? ` · <span class="sh-need">${why}</span>` : ""}</small></span>` +
        `<button class="sh-fuse" data-id="${id}"${why ? ` disabled title="${why}"` : ""}>${cost === undefined ? "Max rank" : `Fuse ${cost}${pxIcon("coin")}`}</button></div>`;
    }).join("") : "";
    const fuse = shopFuses(shop)
      ? `<h4>Rune fusion</h4><p class="sh-empty">${RUNE_FUSE_COUNT} identical loose runes and gold make one rune of the next rank. Runes set in items don't count.</p>` +
        (fuseRows || `<p class="sh-empty">No loose runes in your bag.</p>`)
      : "";
    const quest = questDialog(n.id, q);
    this.dialog.innerHTML = this.head(n) + `<p>${shop.greeting}</p>` +
      `<div class="sh-gold">Your gold: <b>${gold}${pxIcon("coin")}</b> ${this.shopMsg}</div>` +
      `<h4>For sale</h4><div class="sh-list">${buy}</div>${sell}${fuse}` +
      `<div class="nd-btns">${quest ? `<button class="nd-talk">Talk</button>` : ""}<button class="nd-bye">Goodbye <kbd>E</kbd></button></div>`;
    this.dialog.classList.add("shop");
    const talk = this.dialog.querySelector<HTMLButtonElement>(".nd-talk");
    if (talk) talk.onclick = () => { this.trading = false; this.stage = -1; };
    for (const b of this.dialog.querySelectorAll<HTMLButtonElement>(".sh-lvpick button")) b.onclick = () => { this.masterLv = Number(b.dataset.lv); this.stage = -1; };
    // hovering a piece for sale shows what wearing it would change in the stats beside (the bag opens with the shop)
    for (const r of this.dialog.querySelectorAll<HTMLElement>(".sh-row")) {
      const id = r.querySelector<HTMLElement>(".sh-icon")?.dataset.icon;
      if (!id || !gearDef(id) || !r.querySelector(".sh-buy")) continue;
      r.onmouseenter = () => this.onPreview?.(id);
      r.onmouseleave = () => this.onPreview?.();
    }
    if (!this.shopOpen) { this.shopOpen = true; this.onShopOpen?.(true); }
    for (const el of this.dialog.querySelectorAll<HTMLElement>(".sh-icon")) {
      const id = el.dataset.icon!;
      el.appendChild(id.startsWith("potion:") || id.startsWith("mpotion:") ? this.potionIcon(potionTex(id.split(":")[0], Number(id.split(":")[1]))) : parseRune(id) ? runeCanvas(id, 32) : iconCanvas(this.scene, id, 32));
    }
    for (const b of this.dialog.querySelectorAll<HTMLButtonElement>(".sh-buy, .sh-sell")) {
      b.onclick = () => { this.send(b.classList.contains("sh-buy") ? "buy" : "sell", { i: Number(b.dataset.i) }); b.disabled = true; };
    }
    for (const b of this.dialog.querySelectorAll<HTMLButtonElement>(".sh-fuse")) {
      b.onclick = () => { this.send("fuse", { id: b.dataset.id }); b.disabled = true; };
    }
    this.dialog.querySelector<HTMLButtonElement>(".nd-bye")!.onclick = () => this.close();
  }

  private potionIcon(kind = "potion"): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const src = this.scene.textures.get(itemTexture(this.scene, kind)).getSourceImage() as CanvasImageSource;
    ctx.drawImage(src, 0, 0, 8, 8, 0, 0, 32, 32);
    return c;
  }

  private renderDialog(q: QuestState) {
    const n = this.talking!;
    const page = questDialog(n.id, q);
    if (n.shop && (this.trading || !page)) return this.renderShop(n, q);
    this.dialog.classList.remove("shop");
    if (this.shopOpen) { this.shopOpen = false; this.onPreview?.(); }
    const key = JSON.stringify([n.id, questSig(q), q?.level]);
    if (key === this.stage) return;
    this.stage = key;
    const p = page ?? { text: ["Good day to you."], bye: "Farewell", chain: 0 };
    this.dialog.innerHTML = this.head(n) +
      p.text.map((t) => `<p>${t}</p>`).join("") +
      `<div class="nd-btns">${p.accept ? `<button class="nd-accept">${p.accept}</button>` : ""}` +
      `${n.shop ? `<button class="nd-trade">Trade</button>` : ""}<button class="nd-bye">${p.bye} <kbd>E</kbd></button></div>`;
    const acc = this.dialog.querySelector<HTMLButtonElement>(".nd-accept");
    if (acc) acc.onclick = () => { this.send("quest", { chain: p.chain }); acc.disabled = true; };
    const trade = this.dialog.querySelector<HTMLButtonElement>(".nd-trade");
    if (trade) trade.onclick = () => { this.trading = true; this.stage = -1; };
    this.dialog.querySelector<HTMLButtonElement>(".nd-bye")!.onclick = () => this.close();
  }

  update(me: Me, q: QuestState) {
    this.q = q;
    const present = (n: Npc) => npcPresent(n.id, q);
    this.objects.update(q);
    this.nearObj = this.talking ? undefined : this.objects.near(me, q);
    this.near = me ? npcNear(me.x, me.y, TALK_RANGE, present) : undefined;
    if (this.talking && (!me || npcNear(me.x, me.y, TALK_RANGE * 1.6, present) !== this.talking)) this.close(); // walked away
    const showPrompt = (!!this.near || !!this.nearObj) && !this.talking && !this.hidePrompt;
    this.prompt.classList.toggle("open", showPrompt);
    if (showPrompt) {
      const html = this.nearObj
        ? `<kbd>E</kbd> ${this.nearObj.verb}: ${this.nearObj.name}`
        : `<kbd>E</kbd> ${this.near!.shop ? "Trade with" : "Talk to"} ${this.near!.name}`;
      if (html !== this.promptHtml) { this.promptHtml = html; this.prompt.innerHTML = html; }
    }
    if (this.talking) this.renderDialog(q);

    // "!" = quest to pick up, "?" = come and talk to me
    for (const n of NPCS) {
      const s = this.sprites.get(n.id);
      if (!s) continue;
      const here = present(n);
      s.sprite.setVisible(here); s.label.setVisible(here); s.mark.setVisible(here);
      const mark = here ? npcQuestMark(n.id, q) : "";
      if (s.mark.text !== mark) s.mark.setText(mark);
    }
    // Markers and the tracker are rebuilt about 8 times a second (or at once when the quest state or the tracker changed)
    const t = performance.now();
    if (q === this.trackQ && t - this.trackAt < 125) { this.drawPointer(); this.drawGoal(); return; }
    this.trackQ = q; this.trackAt = t;
    // Map markers: "!" / "?" on NPCs, coins on traders, and the current quest targets of every chain
    // A story waiting for the guided first quest (chainOpen) shows nothing yet
    const states = CHAINS.map((_, c) => chainState(q, c)).map((st, c) => (st && st.questStage === 0 && !chainOpen(q, c) ? undefined : st));
    const tracked = states.map((st, c) => (this.log.isTracked(c) ? st : undefined));
    const targets = tracked.flatMap((st) => questTargets(st));
    this.markers = NPCS.filter(present).map((n): MapMarker => {
      const g = npcQuestMark(n.id, q);
      // a zone quest giver's "!" gets a rim arrow on the minimap only while their arc fits the hero's level
      if (g) return { x: n.x, y: n.y, glyph: g, color: "#ffd166", label: n.name, track: this.log.anyTracked && (g === "?" || !ZONE_GIVERS.has(n.id) || arcFits(n.id, q?.level ?? 1)) };
      if (n.shop) return { x: n.x, y: n.y, glyph: "$", color: "#f2c14e", label: n.title };
      return { x: n.x, y: n.y, glyph: "•", color: "#b9f27c", label: n.name };
    });
    for (const g of targets) {
      if (g.kind === "area") this.markers.push({ x: g.x, y: g.y, r: g.r, glyph: "", color: "#ffd166", label: g.label, track: true });
      else if (g.kind === "object") this.markers.push({ x: g.x, y: g.y, glyph: "◆", color: "#7ff3ff", label: g.label, track: true });
    }
    this.log.render(q);

    // On-screen tracker: one block per chain with its quest, current objective, progress bar and where to go
    let html = "";
    this.aim = undefined;
    this.goal = undefined;
    {
      // The guided first quest on top; only the quests the player chose to track
      const blocks = [tracked[TUT_CHAIN], ...tracked.filter((_, c) => c !== TUT_CHAIN)].map((st) => this.trackBlock(me, st)).filter(Boolean);
      if (this.extraBlock) blocks.push(this.extraBlock);
      if (blocks.length) html = blocks.join("") + `<div class="qt-hint">J: quest log</div>`;
    }
    if (html !== this.trackerHtml) {
      this.trackerHtml = html;
      this.tracker.innerHTML = html;
      this.tracker.classList.toggle("open", !!html);
    }
    this.drawPointer();
    this.drawGoal();
  }

  /** The quest pointer: an arrow on a ring around the hero (the middle of the screen) toward the objective, and its distance. */
  private drawPointer() {
    const a = this.aim;
    const h = this.heroScreen;
    if (!a || !h) { this.pointer.hidden = true; return; }
    // iso view: a world direction turns on screen (screen x = x - y, screen y = (x + y) / 2)
    const sx = ISO ? a.dx - a.dy : a.dx, sy = ISO ? (a.dx + a.dy) / 2 : a.dy;
    // the ring is centred on the middle of the hero's body (lift: half his height on screen, it follows the zoom)
    const lift = h.lift ?? 20, ang = Math.atan2(sy, sx), R = Math.max(56, lift * 1.9);
    this.pointer.hidden = false;
    this.pointer.style.left = `${h.x + Math.cos(ang) * R}px`;
    this.pointer.style.top = `${h.y - lift + Math.sin(ang) * R * 0.8}px`;
    const steps = String(Math.round(a.d / TILE));
    if (this.pointer.dataset.s !== steps) { this.pointer.dataset.s = steps; this.pointer.innerHTML = `<i></i><b>${steps}</b>`; }
    (this.pointer.firstElementChild as HTMLElement).style.transform = `rotate(${ang}rad)`;
  }

  /** The followed quest's objective, marked on the ground: a pulsing gold ring and a soft beam of light. */
  private drawGoal() {
    const g = this.goal;
    if (!g) { this.goalRing?.setVisible(false); this.goalBeam?.setVisible(false); return; }
    this.goalRing ??= this.scene.add.graphics();
    this.goalBeam ??= this.scene.add.image(0, 0, "light").setTint(0xffd27a).setBlendMode(Phaser.BlendModes.ADD).setOrigin(0.5, 0.85);
    const t = this.scene.time.now / 1000, r = Math.max(10, Math.min(g.r || 12, 60)), k = 1 + Math.sin(t * 3) * 0.08;
    // circles in world space at the target: the iso view lays the Graphics flat on the ground, centred on the spot
    this.goalRing.clear().setVisible(true).setPosition(0, 0).setDepth(1);
    this.goalRing.lineStyle(2, 0xe3bf6a, 0.9).strokeCircle(g.x, g.y, r * k);
    this.goalRing.lineStyle(1, 0xffe9a8, 0.5).strokeCircle(g.x, g.y, r * 0.65 * k);
    this.goalBeam.setVisible(true).setPosition(g.x, g.y).setDepth(g.y).setScale(0.6, 2.6).setAlpha(0.45 + Math.sin(t * 3) * 0.12);
  }

  /** Tracker block for one chain ("" when it has nothing to show). */
  /** A step that only happens at night (the dead's bosses and rituals): by day the tracker says when night falls. */
  private nightLine(step: ReturnType<typeof questStep>): string {
    if (!step?.night) return "";
    const ms = msUntilUndeadNight(dayTime(Date.now()));
    return ms > 0 ? `<div class="qt-hint2 qt-night">Only at night. The dead rise in ${Math.max(1, Math.ceil(ms / 60000))} min.</div>` : "";
  }

  /** Point the arrow / ground marker at the nearest of these targets, by way of a rope, stair or waygate if it is elsewhere. */
  private aimAt(me: Me, targets: QuestTarget[], follow: boolean): boolean {
    let target = me && targets.length ? targets.reduce((a, b) => (Math.hypot(a.x - me.x, a.y - me.y) <= Math.hypot(b.x - me.x, b.y - me.y) ? a : b)) : undefined;
    // On another floor of the Mawdeep (or above it): point at the rope or stair first
    const via = target && me ? routeVia(target.x, target.y, me.x, me.y) : undefined;
    if (via) target = { x: via.x, y: via.y, kind: "object", label: via.label };
    // In the other act: point at this side's waygate
    const gate = target && me && actAt(target.y, target.x) !== actAt(me.y, me.x) ? WAYGATES.find((g) => actAt(g.y, g.x) === actAt(me.y, me.x)) : undefined;
    if (gate) target = { x: gate.x, y: gate.y, kind: "object", label: gate.label };
    if (follow && target && me) {
      const dx = target.x - me.x, dy = target.y - me.y, d = Math.hypot(dx, dy) - (target.r ?? 0);
      if (d > TILE * 2) this.aim = { dx, dy, d };
      this.goal = { x: target.x, y: target.y, r: target.r ?? 0 };
    }
    return !!gate;
  }

  private followBtn(follow: boolean) {
    return `<button class="qt-follow" title="${follow ? "Stop following" : "Follow: mark it on the ground"}">${follow ? "◉" : "○"}</button>`;
  }

  private trackBlock(me: Me, q: ReturnType<typeof chainState>): string {
    const def = questDef(q), step = questStep(q), obj = questObjective(q);
    if (!def || !q) return "";
    if (step && obj) {
      const goal = stepGoal(step), n = stepProgress(step, q.questCount);
      const bar = goal > 1 ? `<div class="qt-bar"><div style="width:${(n / goal) * 100}%"></div></div>` : "";
      // The followed quest: its nearest target gets the ground marker and the arrow
      const follow = this.followed === def.title;
      const viaGate = this.aimAt(me, questTargets(q), follow);
      const started = q.questStage > 0;
      const gateLine = viaGate ? `<div class="qt-where">${GATE_HINT[actAt(me!.y, me!.x)]}</div>` : "";
      // the card: header (title, follow button), then just the objective and its progress bar
      return `<div class="qt-block${this.isFolded(def.title, started) ? " folded" : ""}${follow ? " following" : ""}" data-key="${def.title}" data-started="${started ? 1 : 0}">` +
        `<div class="qt-head"><span class="qt-title">${def.title}</span>${this.followBtn(follow)}</div>` +
        `<div class="qt-body"><div class="qt-obj">${obj}</div>${bar}${gateLine}${this.nightLine(step)}</div></div>`;
    }
    // Between quests: point to whoever has the next one and say where they stand (Murat 2026-11-08: "where is Rakhim?"),
    // with a follow button that leads there, through the waygate if they are in the other act
    // (the blob chain's very first quest has its own "!" intro)
    // (a zone arc not begun shows only its giver's "!" on the map: the tracker is for quests under way)
    if (q.questStage === 0 && (q.level ?? 1) >= def.minLevel && (q.questId > 0 || ((q.chain ?? 0) > 0 && !CHAINS[q.chain ?? 0]?.local))) {
      const giver = NPCS.find((n) => n.id === def.giver);
      const key = `new:${def.title}`, follow = this.followed === key;
      const viaGate = this.aimAt(me, questTargets(q), follow);
      const where = giver?.where ? `<div class="qt-where">${giver.where}</div>` : "";
      // In the other act (the step into Act 2): the waygate comes first, then the giver beyond it
      const talk = `${giver?.name ?? ""} <b class="bang">!</b>`;
      const body = viaGate
        ? `<div class="qt-obj">${GATE_HINT[actAt(me!.y, me!.x)]}</div><div class="qt-where">Then talk to ${giver?.name ?? ""}: ${giver?.where ?? ""}</div>`
        : `<div class="qt-obj">Talk to ${talk}</div>${where}`;
      const title = viaGate && actAt(me!.y, me!.x) === 1 ? "The waygate is awake" : "New quest available";
      return `<div class="qt-block${this.isFolded(key, false) ? " folded" : ""}${follow ? " following" : ""}" data-key="${key}" data-started="0">` +
        `<div class="qt-head"><span class="qt-title">${title}</span>${this.followBtn(follow)}</div>` +
        `<div class="qt-body">${body}</div></div>`;
    }
    return "";
  }
}
