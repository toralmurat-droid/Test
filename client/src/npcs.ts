import "@fontsource/pixelify-sans/400.css";
import { icon as pxIcon } from "./pixelicons";
import "@fontsource/pixelify-sans/700.css";
import "./npcs.css";
import { pixelText } from "./pixeltext";
import Phaser from "phaser";
import { CAMP_PIVOT, TX as CAMP_TX, witchCampTextures } from "./witchCamp";
import { worldPropTextures } from "./worldProps";
import { ANVIL_TOP, FORGE_FLUE, SMITHY_ORIGIN, TX as SMITHY_TX, smithyTextures } from "./smithy";
import { smokeTexture } from "./bonfireArt";
import { NPCS, NPC_DECOR, Npc, npcNear, TALK_RANGE } from "../../shared/npcs";
import {
  CHAINS, chainOpen, chainState, TUT_CHAIN, npcPresent, npcQuestMark, questDef, questDialog, questObjective, questStep, Quester, questTargets, stepGoal, stepProgress,
} from "../../shared/quests";
import { QuestObjects } from "./questObjects";
import { TILE } from "../../shared/constants";
import type { MapMarker } from "./minimap";
import { QuestLog } from "./questlog";
import { SHOPS, sellPrice } from "../../shared/shops";
import { gearDef, gearName, itemLevel, itemText, TIER_NAMES } from "../../shared/gear";
import { CHAR_GROW, CHAR_SCALE, CHAR_ORIGIN, CharacterName, playCharAnim } from "./artAssets";
import { iconCanvas, itemColor, rarityLabel } from "./gear";
import { itemTexture, potionTex } from "./textures";
import { potionAmount, potionName, slotsAfter, total, unpackPotions } from "../../shared/potions";
import { BAG_SIZE } from "../../shared/gear";
import { isoAnchor } from "./iso";
import { msUntilUndeadNight } from "../../shared/daynight";
import { dayTime } from "./details";

type Me = { x: number; y: number } | undefined;
/** The local player's synced state (only the fields NPCs care about). */
type QuestState = (Quester & { gold?: number; potions?: number; cls?: string; bag?: Iterable<string> }) | undefined;

/**
 * Village NPCs (shared/npcs.ts): sprites by the bonfire, "!"/"?" quest markers, an "E Talk" prompt when close,
 * a dialog panel and the quest tracker. The server checks distance and owns quest progress.
 */
export class NpcLayer {
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
  private stage: unknown = -1;
  private shopMsg = "";
  readonly log = new QuestLog();
  /** Quest giver / trader / quest area markers for the minimap and world map. */
  markers: MapMarker[] = [];

  constructor(private scene: Phaser.Scene, private send: (type: string, msg?: unknown) => void) {
    const hud = document.getElementById("hud")!;
    this.prompt.id = "npcprompt";
    this.dialog.id = "npcdialog";
    this.tracker.id = "questtracker";
    this.toast.id = "questtoast";
    hud.append(this.prompt, this.dialog, this.tracker, this.toast);
    this.prompt.onclick = () => this.interact();
    this.tracker.onclick = () => this.log.toggle(true);
    for (const n of NPCS) {
      const sprite = scene.add.sprite(n.x, n.y, n.sprite, 0).setOrigin(CHAR_ORIGIN.x, CHAR_ORIGIN.y).setScale(CHAR_SCALE).setDepth(n.y);
      playCharAnim(sprite, n.sprite as CharacterName, "idle", n.dir);
      sprite.setInteractive({ useHandCursor: true }).on("pointerdown", () => { if (this.near === n) this.open(n); });
      const label = scene.add.text(n.x, n.y - Math.round(21 * CHAR_GROW), n.name, {
        fontFamily: "monospace", fontSize: "16px", color: n.shop ? "#ffd166" : "#b9f27c", stroke: "#000", strokeThickness: 3,
      }).setOrigin(0.5, 1).setScale(0.25).setResolution(2).setDepth(n.y + 1);
      const mark = scene.add.text(n.x, n.y - Math.round(25 * CHAR_GROW), "", {
        fontFamily: "monospace", fontSize: "40px", fontStyle: "bold", color: "#ffd166", stroke: "#000", strokeThickness: 6,
      }).setOrigin(0.5, 1).setScale(0.25).setResolution(2).setDepth(n.y + 1);
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
  interact() {
    if (this.talking) this.close();
    else if (this.nearObj) this.send("use", { id: this.nearObj.id });
    else if (this.near) this.open(this.near);
  }

  close() {
    this.talking = undefined;
    this.dialog.classList.remove("open");
  }

  /** Server says the quest moved on: banner in the pixel font. */
  onQuest(msg: { qid: number; stage: number; done?: boolean; chain?: number }) {
    const quests = CHAINS[msg.chain ?? 0]?.quests ?? CHAINS[0].quests;
    let m: [string, string] | undefined;
    if (msg.done) m = ["Quest complete", quests[msg.qid - 1]?.title ?? ""];
    else m = quests[msg.qid]?.steps[msg.stage - 1]?.banner;
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
    const gold = q?.gold ?? 0, potions = q?.potions ?? 0, cls = q?.cls, pots = unpackPotions(potions);
    const bag = [...(q?.bag ?? [])];
    const key = JSON.stringify([n.id, gold, potions, bag, this.shopMsg, q?.questId, q?.questStage, q?.boneId, q?.boneStage, q?.redId, q?.redStage, q?.tutId, q?.tutStage]);
    if (key === this.stage) return;
    this.stage = key;
    const row = (icon: string, name: string, color: string, desc: string, btn: string, cls2: string, i: number, off: boolean) =>
      `<div class="sh-row"><span class="sh-icon" data-icon="${icon}"></span><span class="sh-info"><b style="color:${color}">${name}</b><small>${desc}</small></span>` +
      `<button class="${cls2}" data-i="${i}"${off ? " disabled" : ""}>${btn}</button></div>`;
    const buy = shop.stock.map((e, i) => {
      if (e.item === "potion" || e.item === "mpotion") {
        const qty = e.qty ?? 1, size = e.size ?? 0, mana = e.item === "mpotion";
        const room = bag.length + slotsAfter(pots, e.item, size, qty) <= BAG_SIZE;
        return row(`${e.item}:${size}`, `${qty > 1 ? `${qty} × ` : ""}${potionName(e.item, size)}`, mana ? "#8ab4ff" : "#ff8a8a",
          `${mana ? "+" : "Heals "}${potionAmount(e.item, size)}${mana ? " mana" : " HP"} · you carry ${total(pots[e.item])} · ${mana ? "V" : "Q"} · ${room ? "10 per bag slot" : "no room in your bag"}`,
          `${e.price}${pxIcon("coin")}`, "sh-buy", i, gold < e.price || !room);
      }
      const d = gearDef(e.item)!;
      return row(e.item, gearName(e.item, cls), itemColor(e.item), `${rarityLabel(e.item)}${TIER_NAMES[d.tier]} · Lv ${itemLevel(e.item)} · ${itemText(e.item)}`, `${e.price}${pxIcon("coin")}`, "sh-buy", i, gold < e.price);
    }).join("");
    const sellable = shop.buys ? bag.map((id, i) => [id, i] as const).filter(([id]) => gearDef(id) && shop.buys!.includes(gearDef(id)!.slot)) : [];
    const sell = shop.buys
      ? `<h4>Sell from your bag</h4>` + (sellable.length
        ? sellable.map(([id, i]) => row(id, gearName(id, cls), itemColor(id), `${rarityLabel(id)}${TIER_NAMES[gearDef(id)!.tier]} · Lv ${itemLevel(id)} · ${itemText(id)}`, `Sell ${sellPrice(id)}${pxIcon("coin")}`, "sh-sell", i, false)).join("")
        : `<p class="sh-empty">No weapons in your bag. Unequip one in the Bag (G) to sell it.</p>`)
      : "";
    const quest = questDialog(n.id, q);
    this.dialog.innerHTML = this.head(n) + `<p>${shop.greeting}</p>` +
      `<div class="sh-gold">Your gold: <b>${gold}${pxIcon("coin")}</b> ${this.shopMsg}</div>` +
      `<h4>For sale</h4><div class="sh-list">${buy}</div>${sell}` +
      `<div class="nd-btns">${quest ? `<button class="nd-talk">Talk</button>` : ""}<button class="nd-bye">Goodbye <kbd>E</kbd></button></div>`;
    this.dialog.classList.add("shop");
    const talk = this.dialog.querySelector<HTMLButtonElement>(".nd-talk");
    if (talk) talk.onclick = () => { this.trading = false; this.stage = -1; };
    for (const el of this.dialog.querySelectorAll<HTMLElement>(".sh-icon")) {
      const id = el.dataset.icon!;
      el.appendChild(id.startsWith("potion:") || id.startsWith("mpotion:") ? this.potionIcon(potionTex(id.split(":")[0], Number(id.split(":")[1]))) : iconCanvas(this.scene, id, 32));
    }
    for (const b of this.dialog.querySelectorAll<HTMLButtonElement>(".sh-buy, .sh-sell")) {
      b.onclick = () => { this.send(b.classList.contains("sh-buy") ? "buy" : "sell", { i: Number(b.dataset.i) }); b.disabled = true; };
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
    const key = JSON.stringify([n.id, q?.questId, q?.questStage, q?.questCount, q?.boneId, q?.boneStage, q?.boneCount, q?.redId, q?.redStage, q?.redCount, q?.tutId, q?.tutStage, q?.tutCount, q?.level]);
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
      this.prompt.innerHTML = this.nearObj
        ? `<kbd>E</kbd> ${this.nearObj.verb}: ${this.nearObj.name}`
        : `<kbd>E</kbd> ${this.near!.shop ? "Trade with" : "Talk to"} ${this.near!.name}`;
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
    // Map markers: "!" / "?" on NPCs, coins on traders, and the current quest targets of every chain
    // A story waiting for the guided first quest (chainOpen) shows nothing yet
    const states = CHAINS.map((_, c) => chainState(q, c)).map((st, c) => (st && st.questStage === 0 && !chainOpen(q, c) ? undefined : st));
    const tracked = states.map((st, c) => (this.log.isTracked(c) ? st : undefined));
    const targets = tracked.flatMap((st) => questTargets(st));
    this.markers = NPCS.filter(present).map((n): MapMarker => {
      const g = npcQuestMark(n.id, q);
      if (g) return { x: n.x, y: n.y, glyph: g, color: "#ffd166", label: n.name, track: this.log.anyTracked };
      if (n.shop) return { x: n.x, y: n.y, glyph: "$", color: "#f2c14e", label: n.title };
      return { x: n.x, y: n.y, glyph: "•", color: "#b9f27c", label: n.name };
    });
    for (const t of targets) {
      if (t.kind === "area") this.markers.push({ x: t.x, y: t.y, r: t.r, glyph: "", color: "#ffd166", label: t.label, track: true });
      else if (t.kind === "object") this.markers.push({ x: t.x, y: t.y, glyph: "◆", color: "#7ff3ff", label: t.label, track: true });
    }
    this.log.render(q);

    // On-screen tracker: one block per chain with its quest, current objective, progress bar and where to go
    let html = "";
    {
      // The guided first quest on top; only the quests the player chose to track
      const blocks = [tracked[TUT_CHAIN], ...tracked.filter((_, c) => c !== TUT_CHAIN)].map((st) => this.trackBlock(me, st)).filter(Boolean);
      if (blocks.length) html = blocks.join("") + `<div class="qt-hint">J: quest log</div>`;
    }
    if (html !== this.trackerHtml) {
      this.trackerHtml = html;
      this.tracker.innerHTML = html;
      this.tracker.classList.toggle("open", !!html);
    }
  }

  /** Tracker block for one chain ("" when it has nothing to show). */
  private trackBlock(me: Me, q: ReturnType<typeof chainState>): string {
    const def = questDef(q), step = questStep(q), obj = questObjective(q);
    if (!def || !q) return "";
    if (step && obj) {
      const targets = questTargets(q);
      const goal = stepGoal(step), n = stepProgress(step, q.questCount);
      const bar = goal > 1 ? `<div class="qt-bar"><div style="width:${(n / goal) * 100}%"></div></div>` : "";
      let dir = "";
      // Point at the nearest target
      const target = me && targets.length ? targets.reduce((a, b) => (Math.hypot(a.x - me.x, a.y - me.y) <= Math.hypot(b.x - me.x, b.y - me.y) ? a : b)) : undefined;
      if (target && me) {
        const dx = target.x - me.x, dy = target.y - me.y, d = Math.hypot(dx, dy) - (target.r ?? 0);
        if (d > TILE * 2) {
          const arrows = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];
          const names = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
          const k = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
          dir = `<div class="qt-dir">${arrows[k]} ${Math.round(d / TILE)} tiles ${names[k]}</div>`;
        } else if (target.kind === "area" && d <= 0) dir = `<div class="qt-dir">You are here</div>`;
      }
      let hint = step.hint ? `<div class="qt-hint2">${step.hint}</div>` : "";
      if (step.night) { // the dead's bosses only walk at night (shared/daynight.ts)
        const wait = msUntilUndeadNight(dayTime(Date.now()));
        hint += `<div class="qt-hint2 qt-night">${wait ? `Only at night. The dead rise in ${Math.max(1, Math.ceil(wait / 60000))} min.` : "Night: the dead are up."}</div>`;
      }
      return `<div class="qt-block"><div class="qt-title">${def.title}</div><div class="qt-obj">${step.type === "talk" ? "➜ " : "• "}${obj}</div>${bar}${dir}${hint}</div>`;
    }
    // Between quests: point to whoever has the next one (the blob chain's very first quest has its own "!" intro)
    if (q.questStage === 0 && (q.level ?? 1) >= def.minLevel && (q.questId > 0 || (q.chain ?? 0) > 0)) {
      const giver = NPCS.find((n) => n.id === def.giver);
      return `<div class="qt-block"><div class="qt-title">New quest available</div><div class="qt-obj">➜ Talk to ${giver?.name ?? ""} <b class="bang">!</b></div></div>`;
    }
    return "";
  }
}
