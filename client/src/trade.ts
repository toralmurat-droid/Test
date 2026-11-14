import { songItemHtml } from "./songItems";
import { slotName } from "./songTables";
import Phaser from "phaser";
import "./trade.css";
import { BAG_SIZE, canWear, keepsBoundOf, gearDef, gearName, itemLevel, itemRarity, itemText, RARITY_NAMES, reqProblem, SLOT_NAMES, TIER_NAMES } from "../../shared/gear";
import { STASH, STASH_RANGE, STASH_SIZE, TRADE } from "../../shared/trade";
import { affixHtml, iconCanvas, itemColor, looseRuneHtml, reqInfoOf, runeHtml } from "./gear";
import { parseRune } from "../../shared/runes";
import { runeCanvas, runeCss } from "./runeArt";
import { chestImage, setChestOpen } from "./chests";
import { isoAnchor } from "./iso";
import { TEXT_FONT, TEXT_PX, WT } from "./pixelfont";

/**
 * Player trading and the account stash (shared/trade.ts; the server checks everything).
 *  - TradeUI: a trade request card (Accept / Decline), then a trade window: click bag items to offer them,
 *    add gold with the coin buttons, press Ready. Any change takes back both Ready marks.
 *  - StashUI: the iron-bound chest on the village square. E opens it; click a bag item to store it,
 *    a stash item to take it. Shared by every hero of the account.
 * All text uses the game's pixel font.
 */
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
type Send = (type: string, msg?: unknown) => void;

/** Item details in the pixel font (shown in the info line on hover). */
function itemHtml(id: string, state: any): string {
  const rune = parseRune(id);
  if (rune) return looseRuneHtml(rune);
  const d = gearDef(id);
  if (!d) return "";
  const r = itemRarity(id), aff = affixHtml(id);
  const who = d.cls && !canWear(state?.cls ?? "", id) ? `<span class="gbad">Only a ${d.cls} can wear this</span>` : "";
  const why = !who && state ? reqProblem(id, reqInfoOf(state)) : "";
  return `<b style="color:${itemColor(id)}">${esc(gearName(id, d.cls ?? state?.cls))}</b> <span class="glvl">Lv ${itemLevel(id)}</span> · `
    + `${r ? `<span style="color:${itemColor(id)}">${RARITY_NAMES[r]}</span> ` : ""}${TIER_NAMES[d.tier]} ${slotName(d.slot, undefined, id)}<br>`
    + `${itemText(id) || "No bonus"}${songItemHtml(id, state?.cls) ? `<br>${songItemHtml(id, state?.cls)}` : ""}${aff ? `<br>${aff}` : ""}${runeHtml(id) ? `<br>${runeHtml(id)}` : ""}${who ? `<br>${who}` : why ? `<br><span class="gbad">${why}</span>` : ""}`;
}

/** One item cell (icon, rarity border, level), or an empty one. */
/** `kept`: the bound items this hero must keep (shared/gear.ts keepsBoundOf); only cells that would part with an item pass it. */
function cell(scene: Phaser.Scene, id: string | undefined, info: HTMLElement, state: any, onClick?: () => void, picked = false, kept?: (id: string) => boolean): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "gcell tcell" + (picked ? " picked" : "");
  b.tabIndex = -1;
  const rune = id ? parseRune(id) : undefined;
  if (!id || (!gearDef(id) && !rune)) { b.disabled = true; return b; }
  b.appendChild(rune ? runeCanvas(id) : iconCanvas(scene, id));
  b.style.borderColor = rune ? runeCss(rune) : itemColor(id);
  if (itemRarity(id) >= 2) b.style.boxShadow = `inset 0 0 6px ${itemColor(id)}`;
  if (itemLevel(id) > 1) b.appendChild(Object.assign(document.createElement("span"), { className: "gcelllvl", textContent: String(itemLevel(id)) }));
  b.onmouseenter = () => { info.innerHTML = itemHtml(id, state); };
  b.onmouseleave = () => { info.textContent = ""; };
  if (onClick && !kept?.(id)) b.onclick = (ev) => { if (ev.detail !== 0) onClick(); }; // her last lute and Songbook are bound: no Trade, no Stash (a spare can go)
  else b.classList.add("still");
  return b;
}

/** A panel that never takes keyboard focus from the game. */
function panel(id: string): HTMLDivElement {
  const el = document.createElement("div");
  el.id = id;
  el.hidden = true;
  el.addEventListener("mousedown", (ev) => ev.preventDefault());
  document.getElementById("hud")!.append(el);
  return el;
}

interface TradeView { v: number; with: string; name: string; mine: { items: string[]; gold: number; ready: boolean }; theirs: { items: string[]; gold: number; ready: boolean } }

export class TradeUI {
  private el = panel("tradepanel");
  private ask = panel("tradeask");
  private toast = document.createElement("div");
  private request?: { from: string; name: string; until: number };
  private view?: TradeView;
  private picked: number[] = []; // bag indices I offer
  private gold = 0;
  private sig = "";
  private toastTimer = 0;

  constructor(private scene: Phaser.Scene, private send: Send, private mine: () => any) {
    this.toast.id = "tradetoast";
    document.getElementById("hud")!.append(this.toast);
    this.ask.addEventListener("click", (ev) => {
      const b = (ev.target as HTMLElement).closest("button");
      if (!b || ev.detail === 0 || !this.request) return;
      this.send(b.dataset.act === "yes" ? "tradeyes" : "tradeno", { from: this.request.from });
      this.request = undefined;
      this.ask.hidden = true;
    });
  }

  get open() { return !this.el.hidden; }
  /** Esc / other menus: closing the window cancels the trade. */
  close() { if (this.open) this.send("tradecancel"); this.el.hidden = true; this.view = undefined; }

  /** Ask a nearby hero to trade (party panel button or /trade name). */
  askTo(id: string) { this.send("trade", { id }); }

  asked(from: string, name: string, ms = TRADE.askMs) {
    this.request = { from, name, until: Date.now() + ms };
    this.ask.hidden = false;
    this.ask.innerHTML = `<p><b>${esc(name)}</b> wants to trade <small></small></p><button data-act="yes">Trade</button> <button data-act="no">No thanks</button>`;
  }

  notice(text: string) {
    this.toast.textContent = text;
    this.toast.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove("show"), 3500);
  }

  /** The server's view of the trade: my offer, theirs, who is ready. */
  show(v: TradeView) {
    this.view = v;
    this.el.hidden = false;
    // My picked bag cells follow the server's offer (each offered item matched to one bag slot)
    const bag: string[] = Array.from(this.mine()?.bag ?? []);
    const used = new Set<number>();
    this.picked = [];
    for (const id of v.mine.items) {
      const i = bag.findIndex((g, k) => g === id && !used.has(k));
      if (i >= 0) { used.add(i); this.picked.push(i); }
    }
    this.gold = v.mine.gold;
    this.sig = "";
    this.update();
  }

  ended(text: string, ok: boolean) {
    this.el.hidden = true;
    this.view = undefined;
    this.notice(text);
    if (ok) this.toast.classList.add("ok"); else this.toast.classList.remove("ok");
  }

  private offer() { this.send("tradeoffer", { items: this.picked, gold: this.gold }); }

  /** Called every frame: request countdown, and a redraw when my bag or the trade changed. */
  update() {
    if (this.request) {
      const left = Math.ceil((this.request.until - Date.now()) / 1000);
      if (left <= 0) { this.request = undefined; this.ask.hidden = true; }
      else { const s = this.ask.querySelector("small")!; if (s.textContent !== `(${left}s)`) s.textContent = `(${left}s)`; }
    }
    const v = this.view, me = this.mine();
    if (!v || this.el.hidden || !me) return;
    const bag: string[] = Array.from(me.bag ?? []);
    const sig = JSON.stringify([v, bag, me.gold, me.level, me.cls]);
    if (sig === this.sig) return;
    this.sig = sig;

    this.el.innerHTML = "";
    const info = Object.assign(document.createElement("p"), { className: "tinfo" });
    const h = document.createElement("h2");
    h.textContent = `Trade with ${v.name}`;
    const cols = document.createElement("div");
    cols.className = "tcols";
    const side = (title: string, o: TradeView["mine"], click?: (k: number) => void) => {
      const c = document.createElement("div");
      c.className = "tside" + (o.ready ? " ready" : "");
      c.innerHTML = `<h3>${esc(title)} <span class="tready">${o.ready ? "Ready" : "Not ready"}</span></h3>`;
      const g = document.createElement("div");
      g.className = "tgrid";
      for (let k = 0; k < TRADE.maxItems; k++) g.appendChild(cell(this.scene, o.items[k], info, me, click && o.items[k] ? () => click(k) : undefined));
      c.appendChild(g);
      c.appendChild(Object.assign(document.createElement("p"), { className: "tgold", textContent: `${o.gold} gold` }));
      return c;
    };
    cols.append(
      side("You give", v.mine, (k) => { this.picked.splice(k, 1); this.offer(); }),
      side(`${v.name} gives`, v.theirs),
    );

    // My bag: click to offer / take back
    const bt = Object.assign(document.createElement("h3"), { textContent: `Your bag (click to offer) · ${me.gold} gold` });
    const bg = document.createElement("div");
    bg.className = "tgrid tbag";
    const keep = keepsBoundOf(me.cls, [me.weapon, me.shield], bag), offered = this.picked.map((k) => bag[k]).filter(Boolean);
    for (let i = 0; i < BAG_SIZE; i++) {
      const pickedAt = this.picked.indexOf(i);
      bg.appendChild(cell(this.scene, bag[i], info, me, () => {
        if (pickedAt >= 0) this.picked.splice(pickedAt, 1);
        else if (this.picked.length < TRADE.maxItems) this.picked.push(i);
        this.offer();
      }, pickedAt >= 0, pickedAt >= 0 ? undefined : (id) => keep(id, offered)));
    }

    // Gold buttons
    const gr = document.createElement("div");
    gr.className = "trow";
    const coin = (label: string, f: (g: number) => number) => {
      const b = Object.assign(document.createElement("button"), { textContent: label, tabIndex: -1 });
      b.onclick = (ev) => { if (ev.detail === 0) return; const n = Math.max(0, Math.min(me.gold, f(this.gold))); if (n !== this.gold) { this.gold = n; this.offer(); } };
      gr.appendChild(b);
    };
    gr.append(Object.assign(document.createElement("span"), { textContent: "Gold:" }));
    coin("-100", (g) => g - 100); coin("-10", (g) => g - 10); coin("+10", (g) => g + 10); coin("+100", (g) => g + 100); coin("+1000", (g) => g + 1000); coin("All", () => me.gold); coin("None", () => 0);

    // Ready / Cancel
    const act = document.createElement("div");
    act.className = "trow tact";
    const ready = Object.assign(document.createElement("button"), { textContent: v.mine.ready ? "Not ready" : "Ready", tabIndex: -1, className: "tbig" + (v.mine.ready ? "" : " go") });
    ready.onclick = (ev) => { if (ev.detail !== 0) this.send("tradeready", { v: v.v, ready: !v.mine.ready }); };
    const cancel = Object.assign(document.createElement("button"), { textContent: "Cancel", tabIndex: -1, className: "tbig" });
    cancel.onclick = (ev) => { if (ev.detail !== 0) this.close(); };
    act.append(ready, cancel);

    const help = Object.assign(document.createElement("p"), { className: "help",
      textContent: "Both press Ready to swap. Any change to an offer takes back both Ready marks. Esc cancels." });
    this.el.append(h, cols, bt, bg, gr, info, act, help);
  }
}

export class StashUI {
  private el = panel("stashpanel");
  private prompt = document.createElement("div");
  private img: Phaser.GameObjects.Image;
  private items: string[] = [];
  private gold = 0;
  private note = "";
  private sig = "";
  near = false;

  constructor(private scene: Phaser.Scene, private send: Send, private mine: () => any) {
    this.img = chestImage(scene, STASH.x, STASH.y, 2);
    const label = scene.add.text(STASH.x, STASH.y - 18, "Stash", {
      fontFamily: TEXT_FONT, fontSize: `${TEXT_PX}px`, color: "#e9c35a", stroke: "#000", strokeThickness: 2,
    }).setOrigin(0.5, 1).setScale(WT).setResolution(1).setDepth(STASH.y + 1);
    isoAnchor(label, { x: STASH.x, y: STASH.y });
    this.prompt.id = "stashprompt";
    this.prompt.innerHTML = `<kbd>E</kbd> Open your stash`;
    this.prompt.onclick = () => this.interact();
    document.getElementById("hud")!.append(this.prompt);
  }

  get open() { return !this.el.hidden; }
  close() { this.el.hidden = true; setChestOpen(this.img, 2, false); }

  /** E key / click: open the stash when standing next to it. */
  interact(): boolean {
    if (!this.near) return false;
    if (this.open) { this.close(); return true; }
    this.send("stash");
    return true;
  }

  /** The server's copy of the stash. */
  show(v: { items: string[]; gold: number; text?: string }) {
    this.items = v.items ?? [];
    this.gold = v.gold ?? 0;
    this.note = v.text ?? "";
    this.el.hidden = false;
    setChestOpen(this.img, 2, true);
    this.sig = "";
  }

  update(me: { x: number; y: number } | undefined, blocked: boolean) {
    const d = me ? Math.hypot(me.x - STASH.x, me.y - STASH.y) : Infinity;
    this.near = !blocked && d <= STASH_RANGE;
    this.prompt.classList.toggle("open", this.near && !this.open);
    if (this.open && d > STASH_RANGE * 1.6) this.close();
    if (!this.open) return;
    const st = this.mine();
    if (!st) return;
    const bag: string[] = Array.from(st.bag ?? []);
    const sig = JSON.stringify([this.items, this.gold, this.note, bag, st.gold, st.cls, st.level]);
    if (sig === this.sig) return;
    this.sig = sig;

    this.el.innerHTML = "";
    const info = Object.assign(document.createElement("p"), { className: "tinfo" });
    const h = Object.assign(document.createElement("h2"), { textContent: "Stash" });
    const sub = Object.assign(document.createElement("p"), { className: "help", textContent: "Shared by all your heroes. Items and gold here are safe." });
    const t1 = Object.assign(document.createElement("h3"), { textContent: `Stash ${this.items.length}/${STASH_SIZE} · ${this.gold} gold (click to take)` });
    const g1 = document.createElement("div");
    g1.className = "tgrid tstash";
    for (let i = 0; i < STASH_SIZE; i++) g1.appendChild(cell(this.scene, this.items[i], info, st, () => this.send("stashtake", { i })));
    const t2 = Object.assign(document.createElement("h3"), { textContent: `Bag ${bag.length}/${BAG_SIZE} · ${st.gold} gold (click to store)` });
    const g2 = document.createElement("div");
    g2.className = "tgrid tbag";
    for (let i = 0; i < BAG_SIZE; i++) g2.appendChild(cell(this.scene, bag[i], info, st, () => this.send("stashput", { i }), false, keepsBoundOf(st.cls, [st.weapon, st.shield], bag)));
    const row = document.createElement("div");
    row.className = "trow";
    const coin = (label: string, n: () => number) => {
      const b = Object.assign(document.createElement("button"), { textContent: label, tabIndex: -1 });
      b.onclick = (ev) => { if (ev.detail !== 0) this.send("stashgold", { n: n() }); };
      row.appendChild(b);
    };
    row.append(Object.assign(document.createElement("span"), { textContent: "Store:" }));
    coin("100", () => 100); coin("1000", () => 1000); coin("All", () => st.gold);
    row.append(Object.assign(document.createElement("span"), { textContent: " Take:", className: "tsp" }));
    coin("100", () => -100); coin("1000", () => -1000); coin("All", () => -this.gold);
    const note = Object.assign(document.createElement("p"), { className: "gbad tnote", textContent: this.note });
    const act = document.createElement("div");
    act.className = "trow tact";
    const close = Object.assign(document.createElement("button"), { textContent: "Close", tabIndex: -1, className: "tbig" });
    close.onclick = (ev) => { if (ev.detail !== 0) this.close(); };
    act.append(close);
    this.el.append(h, sub, t1, g1, t2, g2, row, note, info, act);
  }
}
