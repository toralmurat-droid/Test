import "./npcs.css";
import Phaser from "phaser";
import { NPCS, Npc, npcNear, TALK_RANGE } from "../../shared/npcs";
import { druidDialog, Q, QUEST, questObjective, questTarget } from "../../shared/quests";
import { TILE } from "../../shared/constants";
import type { MapMarker } from "./minimap";
import { QuestLog } from "./questlog";
import { SHOPS, sellPrice } from "../../shared/shops";
import { GEAR, gearName, itemText, TIER_NAMES } from "../../shared/gear";
import { MAX_POTIONS } from "../../shared/items";
import { CHAR_ORIGIN, CharacterName, playCharAnim } from "./artAssets";
import { iconCanvas, TIER_COLORS } from "./gear";
import { itemTexture } from "./textures";

type Me = { x: number; y: number } | undefined;
/** The local player's synced state (only the fields NPCs care about). */
type QuestState = { questStage: number; questCount: number; gold?: number; potions?: number; cls?: string; bag?: Iterable<string> } | undefined;

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
    this.prompt.onclick = () => this.near && this.open(this.near);
    this.tracker.onclick = () => this.log.toggle(true);
    for (const n of NPCS) {
      const sprite = scene.add.sprite(n.x, n.y, n.sprite, 0).setOrigin(CHAR_ORIGIN.x, CHAR_ORIGIN.y).setScale(0.75).setDepth(n.y);
      playCharAnim(sprite, n.sprite as CharacterName, "idle", n.dir);
      sprite.setInteractive({ useHandCursor: true }).on("pointerdown", () => { if (this.near === n) this.open(n); });
      const label = scene.add.text(n.x, n.y - 21, n.name, {
        fontFamily: "monospace", fontSize: "16px", color: n.shop ? "#ffd166" : "#b9f27c", stroke: "#000", strokeThickness: 3,
      }).setOrigin(0.5, 1).setScale(0.25).setResolution(2).setDepth(n.y + 1);
      const mark = scene.add.text(n.x, n.y - 25, "", {
        fontFamily: "monospace", fontSize: "40px", fontStyle: "bold", color: "#ffd166", stroke: "#000", strokeThickness: 6,
      }).setOrigin(0.5, 1).setScale(0.25).setResolution(2).setDepth(n.y + 1);
      scene.tweens.add({ targets: mark, y: n.y - 27, duration: 600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.sprites.set(n.id, { sprite, label, mark });
    }
  }

  get isOpen() { return !!this.talking; }

  /** E key: talk to the NPC you stand next to (or close the dialog). */
  interact() {
    if (this.talking) this.close();
    else if (this.near) this.open(this.near);
  }

  close() {
    this.talking = undefined;
    this.dialog.classList.remove("open");
  }

  /** Server says the quest moved on: banner + refresh the open dialog. */
  onQuest(stage: number) {
    const msg: Record<number, [string, string]> = {
      [Q.INVESTIGATE]: ["New quest", QUEST.title],
      [Q.REPORT]: ["Blobs in the woods!", "Go back and tell Elder Rowan"],
      [Q.HUNT]: ["Quest updated", `Kill ${QUEST.killGoal} blobs`],
      [Q.RETURN]: [`${QUEST.killGoal} blobs slain!`, "Return to Elder Rowan"],
      [Q.DONE]: ["Quest complete", QUEST.title],
    };
    const m = msg[stage];
    this.tracker.classList.remove("flash"); void this.tracker.offsetWidth; this.tracker.classList.add("flash");
    if (m) {
      this.toast.innerHTML = `<div class="big">${m[0]}</div><div class="small">${m[1]}</div>`;
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
    const gold = q?.gold ?? 0, potions = q?.potions ?? 0, cls = q?.cls;
    const bag = [...(q?.bag ?? [])];
    const key = JSON.stringify([n.id, gold, potions, bag, this.shopMsg]);
    if (key === this.stage) return;
    this.stage = key;
    const row = (icon: string, name: string, color: string, desc: string, btn: string, cls2: string, i: number, off: boolean) =>
      `<div class="sh-row"><span class="sh-icon" data-icon="${icon}"></span><span class="sh-info"><b style="color:${color}">${name}</b><small>${desc}</small></span>` +
      `<button class="${cls2}" data-i="${i}"${off ? " disabled" : ""}>${btn}</button></div>`;
    const buy = shop.stock.map((e, i) => {
      if (e.item === "potion") {
        const qty = e.qty ?? 1;
        return row("potion", qty > 1 ? `${qty} Healing Potions` : "Healing Potion", "#ff8a8a", `You carry ${potions}/${MAX_POTIONS} · drink with Q`,
          `${e.price} 🪙`, "sh-buy", i, gold < e.price || potions + qty > MAX_POTIONS);
      }
      const d = GEAR[e.item];
      return row(e.item, gearName(e.item, cls), TIER_COLORS[d.tier], `${TIER_NAMES[d.tier]} · ${itemText(e.item)}`, `${e.price} 🪙`, "sh-buy", i, gold < e.price);
    }).join("");
    const sellable = shop.buys ? bag.map((id, i) => [id, i] as const).filter(([id]) => GEAR[id] && shop.buys!.includes(GEAR[id].slot)) : [];
    const sell = shop.buys
      ? `<h4>Sell from your bag</h4>` + (sellable.length
        ? sellable.map(([id, i]) => row(id, gearName(id, cls), TIER_COLORS[GEAR[id].tier], `${TIER_NAMES[GEAR[id].tier]} · ${itemText(id)}`, `Sell ${sellPrice(id)} 🪙`, "sh-sell", i, false)).join("")
        : `<p class="sh-empty">No weapons in your bag. Unequip one in the Bag (G) to sell it.</p>`)
      : "";
    this.dialog.innerHTML = this.head(n) + `<p>${shop.greeting}</p>` +
      `<div class="sh-gold">Your gold: <b>${gold} 🪙</b> ${this.shopMsg}</div>` +
      `<h4>For sale</h4><div class="sh-list">${buy}</div>${sell}` +
      `<div class="nd-btns"><button class="nd-bye">Goodbye <kbd>E</kbd></button></div>`;
    this.dialog.classList.add("shop");
    for (const el of this.dialog.querySelectorAll<HTMLElement>(".sh-icon")) {
      const id = el.dataset.icon!;
      el.appendChild(id === "potion" ? this.potionIcon() : iconCanvas(this.scene, id, 32));
    }
    for (const b of this.dialog.querySelectorAll<HTMLButtonElement>(".sh-buy, .sh-sell")) {
      b.onclick = () => { this.send(b.classList.contains("sh-buy") ? "buy" : "sell", { i: Number(b.dataset.i) }); b.disabled = true; };
    }
    this.dialog.querySelector<HTMLButtonElement>(".nd-bye")!.onclick = () => this.close();
  }

  private potionIcon(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const src = this.scene.textures.get(itemTexture(this.scene, "potion")).getSourceImage() as CanvasImageSource;
    ctx.drawImage(src, 0, 0, 8, 8, 0, 0, 32, 32);
    return c;
  }

  private renderDialog(q: QuestState) {
    const n = this.talking!;
    if (n.shop) return this.renderShop(n, q);
    this.dialog.classList.remove("shop");
    const stage = q?.questStage ?? 0, count = q?.questCount ?? 0;
    const key = stage * 1000 + count;
    if (key === this.stage) return;
    this.stage = key;
    const page = druidDialog(stage, count);
    this.dialog.innerHTML = this.head(n) +
      page.text.map((t) => `<p>${t}</p>`).join("") +
      `<div class="nd-btns">${page.accept ? `<button class="nd-accept">${page.accept}</button>` : ""}<button class="nd-bye">${page.bye} <kbd>E</kbd></button></div>`;
    const acc = this.dialog.querySelector<HTMLButtonElement>(".nd-accept");
    if (acc) acc.onclick = () => { this.send("quest"); acc.disabled = true; };
    this.dialog.querySelector<HTMLButtonElement>(".nd-bye")!.onclick = () => this.close();
  }

  update(me: Me, q: QuestState) {
    this.near = me ? npcNear(me.x, me.y) : undefined;
    if (this.talking && (!me || npcNear(me.x, me.y, TALK_RANGE * 1.6) !== this.talking)) this.close(); // walked away
    this.prompt.classList.toggle("open", !!this.near && !this.talking);
    if (this.near && !this.talking) this.prompt.innerHTML = `<kbd>E</kbd> ${this.near.shop ? "Trade with" : "Talk to"} ${this.near.name}`;
    if (this.talking) this.renderDialog(q);

    const stage = q?.questStage ?? 0, count = q?.questCount ?? 0;
    const druid = this.sprites.get(QUEST.giver);
    if (druid) {
      // "!" = quest to pick up, "?" = come back to me
      const mark = stage === Q.NONE ? "!" : stage === Q.REPORT || stage === Q.RETURN ? "?" : "";
      if (druid.mark.text !== mark) druid.mark.setText(mark);
    }
    // Map markers: "!" / "?" on the quest giver, coins on traders, and the current quest target
    const target = this.log.tracked ? questTarget(stage) : undefined;
    this.markers = NPCS.map((n): MapMarker => {
      if (n.id === QUEST.giver) {
        const g = druid?.mark.text ?? "";
        return { x: n.x, y: n.y, glyph: g || "•", color: g ? "#ffd166" : "#b9f27c", label: n.name, track: !!g && (stage === Q.NONE || target?.kind === "npc") };
      }
      return { x: n.x, y: n.y, glyph: "$", color: "#f2c14e", label: n.title };
    });
    if (target?.kind === "area") this.markers.push({ x: target.x, y: target.y, r: target.r, glyph: "", color: "#ffd166", label: target.label, track: true });
    this.log.render(q);

    // On-screen tracker: quest, current objective, progress bar and where to go
    const obj = questObjective(stage, count);
    let html = "";
    if (obj && this.log.tracked) {
      const bar = stage === Q.HUNT ? `<div class="qt-bar"><div style="width:${Math.min(1, count / QUEST.killGoal) * 100}%"></div></div>` : "";
      let dir = "";
      if (target && me) {
        const dx = target.x - me.x, dy = target.y - me.y, d = Math.hypot(dx, dy) - (target.r ?? 0);
        if (d > TILE * 2) {
          const arrows = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];
          const names = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
          const k = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
          dir = `<div class="qt-dir">${arrows[k]} ${Math.round(d / TILE)} tiles ${names[k]}</div>`;
        } else if (target.kind === "area") dir = `<div class="qt-dir">You are here</div>`;
      }
      html = `<div class="qt-title">${QUEST.title}</div><div class="qt-obj">${stage === Q.REPORT || stage === Q.RETURN ? "➜ " : "• "}${obj}</div>${bar}${dir}<div class="qt-hint">J: quest log</div>`;
    }
    if (html !== this.trackerHtml) {
      this.trackerHtml = html;
      this.tracker.innerHTML = html;
      this.tracker.classList.toggle("open", !!html);
    }
  }
}
