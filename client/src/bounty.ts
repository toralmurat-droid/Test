import Phaser from "phaser";
import { BOARD_RANGE, BOARDS, bountyTitle, type Bounty, type BountyState } from "../../shared/bounty";
import { BOARD_FOOT, boardTexture } from "./bountyArt";
import { isoAnchor } from "./iso";
import type { MapMarker } from "./minimap";
import { TEXT_FONT, TEXT_PX, WT } from "./pixelfont";
import { hudSlot } from "./hudSlots";
import { CLANS } from "../../shared/war/clans";
import { WRIT, writProgress, writTitle, writWhere, type Writ, type WritState } from "../../shared/war/writs";
import { writFlavour } from "../../shared/war/writText";

/**
 * Bounty boards (shared/bounty.ts): the board sprites with a gold "!" while you have no hunt, an "E Read the
 * board" prompt when close, the board panel (pick one of three hunts, or give up the current one) and the
 * tracker block of the hunt in progress. The server owns offers and progress ("bounty" messages).
 */
const SCALE = 0.72;

interface View { board?: string; offers?: Bounty[]; active?: BountyState | null; done?: Bounty }
/** Server "writ" (server/warWrits.ts WritMsg). */
export interface WritView { board?: string; offers?: Writ[]; active?: WritState | null; left?: number; note?: string; done?: Writ & { valor: number }; err?: string; rally?: true }

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export class BountyUI {
  private prompt = document.createElement("div");
  private el = document.createElement("div");
  private marks: Phaser.GameObjects.Text[] = [];
  private active: BountyState | null = null;
  private offers: Bounty[] = [];
  private writ: WritState | null = null;
  private writOffers: Writ[] = [];
  private writNote = "";
  private writRally = false;
  private writErr = "";
  private writLeft = 0;
  near?: (typeof BOARDS)[number];
  open = false;

  constructor(private scene: Phaser.Scene, private send: (type: string, msg?: unknown) => void, font: string) {
    boardTexture(scene);
    for (const b of BOARDS) {
      scene.add.image(b.x, b.y, "bounty_board").setOrigin(0.5, BOARD_FOOT).setScale(SCALE).setDepth(b.y);
      const m = scene.add.text(b.x, b.y - 46, "!", { fontFamily: TEXT_FONT, fontSize: `${TEXT_PX}px`, color: "#ffd166", stroke: "#000", strokeThickness: 2 })
        .setOrigin(0.5, 1).setScale(WT).setResolution(1).setDepth(29000);
      isoAnchor(m, { x: b.x, y: b.y });
      scene.tweens.add({ targets: m, y: b.y - 49, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.marks.push(m);
    }
    this.prompt.id = "boardprompt";
    this.prompt.onclick = () => this.interact();
    this.el.id = "bountypanel";
    this.el.hidden = true;
    this.el.addEventListener("mousedown", (ev) => ev.preventDefault());
    hudSlot("promptstack").append(this.prompt);
    document.getElementById("hud")!.append(this.el);
    send("bounty"); // my hunt in progress, if any
    send("writ"); // my war writ in progress, if any
  }

  /** The server's "writ": offers (at a board), my writ, the day's count, a finished one to celebrate. */
  showWrit(v: WritView, floatText: (text: string, color: string) => void) {
    if (v.active !== undefined) this.writ = v.active;
    if (v.offers) this.writOffers = v.offers;
    if (v.left !== undefined) this.writLeft = v.left;
    if (v.note !== undefined || v.offers) this.writNote = v.note ?? "";
    if (v.offers || v.note !== undefined) this.writRally = !!v.rally; // a full board view says whether the war rallies for the hero's clan
    this.writErr = v.err ?? "";
    if (v.done) floatText(`War writ done! +${v.done.gold} gold +${v.done.renown} renown`, "#ffd166");
    if (this.open) this.render();
  }

  /** The server's answer: offers (at a board), my hunt, and a finished one to celebrate. */
  show(v: View, floatText: (text: string, color: string) => void) {
    if (v.active !== undefined) this.active = v.active;
    if (v.offers) this.offers = v.offers;
    if (v.done) floatText(`Bounty done! +${v.done.xp} XP +${v.done.gold} gold`, "#ffd166");
    if (this.open) this.render();
  }

  interact(): boolean {
    if (!this.near) return false;
    this.open = true;
    this.el.hidden = false;
    this.offers = [];
    this.writOffers = [];
    this.writErr = "";
    this.render();
    this.send("bounty");
    this.send("writ");
    return true;
  }

  close() { this.open = false; this.el.hidden = true; }

  private render() {
    const a = this.active;
    let body: string;
    if (a) {
      body = `<p class="bt-help">Your hunt</p>${this.row(a, `${a.n} / ${a.goal}`)}<p class="bt-help">It pays the moment the last one falls, wherever you are.</p>
        <div class="bt-btns"><button data-drop>Give up this hunt</button></div>`;
    } else if (this.offers.length) {
      body = `<p class="bt-help">Pick one hunt. Monsters of the level shown or higher count, anywhere.</p>` +
        this.offers.map((o, i) => this.row(o, `<button data-take="${i}">Take</button>`)).join("");
    } else body = `<p class="bt-help">No bounties for a hero of your level here. Come back later.</p>`;
    this.el.innerHTML = `<h2>${this.near?.name ?? "Bounty Board"}</h2>${body}${this.writSection()}<p class="help">E or Esc to close</p>`;
    this.el.querySelectorAll<HTMLButtonElement>("[data-take]").forEach((b) => b.onclick = () => this.send("bounty", { take: Number(b.dataset.take) }));
    this.el.querySelector<HTMLButtonElement>("[data-drop]")?.addEventListener("click", () => this.send("bounty", { drop: true }));
    this.el.querySelectorAll<HTMLButtonElement>("[data-wtake]").forEach((b) => b.onclick = () => this.send("writ", { take: Number(b.dataset.wtake) }));
    this.el.querySelector<HTMLButtonElement>("[data-wdrop]")?.addEventListener("click", () => this.send("writ", { drop: true }));
  }

  /** The "War Writs" part of the board, under the hunts. */
  private writSection(): string {
    const w = this.writ, err = this.writErr ? `<p class="wr-err">${esc(this.writErr)}</p>` : "";
    let body: string;
    if (w) body = `<p class="bt-help">Your writ</p>${this.writRow(w, `${w.n} / ${w.goal}`)}<div class="bt-btns"><button data-wdrop>Tear up this writ</button></div>`;
    else if (this.writNote) body = `<p class="bt-help">${esc(this.writNote)}</p>`;
    else if (this.writOffers.length) body = `<p class="bt-help">Clan work: one writ at a time, ${this.writLeft} left today. Pays gold, renown and valor.</p>` +
      (this.writRally ? `<p class="bt-help wr-rally">Rally! Your clan holds the least land: its writs pay more.</p>` : "") +
      this.writOffers.map((o, i) => this.writRow(o, `<button data-wtake="${i}">Take</button>`)).join("");
    else body = `<p class="bt-help">No war writs for a hero of your level here.</p>`;
    return `<h3 class="wr-head">War Writs</h3>${err}${body}`;
  }

  private writRow(w: Writ, right: string) {
    const c = CLANS[w.holder], col = c ? hex(c.sigil) : "#e3bf6a", say = writFlavour(w.clan, w.kind, w.land, w.t, w.road);
    return `<div class="bt-row wr-row" style="border-left:4px solid ${c ? hex(c.trim === 0x1a1414 ? c.cloth : c.trim) : "#6b5a3a"}"><div><div class="bt-title">${esc(writTitle(w))}</div>` +
      `<div class="bt-sub"><span style="color:${col}">${esc(writWhere(w))}</span> · <span class="bt-gold">${w.gold} gold</span> · <span class="wr-renown">${w.renown} renown</span> · <span class="wr-valor">${WRIT.valor} valor</span></div>` +
      (say.text ? `<div class="wr-say">${esc(say.name)}: "${esc(say.text)}"</div>` : "") + `</div><div class="bt-right">${right}</div></div>`;
  }

  private row(b: Bounty, right: string) {
    return `<div class="bt-row"><div><div class="bt-title">${bountyTitle(b)}</div><div class="bt-sub">${b.zone} · Lv ${b.minLevel}+ · <span class="bt-xp">${b.xp} XP</span> · <span class="bt-gold">${b.gold} gold</span></div></div><div class="bt-right">${right}</div></div>`;
  }

  /** Tracker block for the hunt in progress ("" when none). */
  trackerBlock(): string {
    const a = this.active;
    if (!a) return "";
    return `<div class="qt-block"><div class="qt-title">Bounty</div><div class="qt-obj">• ${bountyTitle(a)}: ${a.n} / ${a.goal}</div>` +
      `<div class="qt-bar"><div style="width:${(a.n / a.goal) * 100}%"></div></div><div class="qt-dir">${a.zone} · Lv ${a.minLevel}+</div></div>`;
  }

  /** Tracker block for the war writ in progress ("" when none). */
  writBlock(): string {
    const w = this.writ;
    if (!w) return "";
    return `<div class="qt-block"><div class="qt-title">War Writ</div><div class="qt-obj">• ${esc(writProgress(w))}</div>` +
      `<div class="qt-bar"><div style="width:${(w.n / w.goal) * 100}%"></div></div><div class="qt-dir">${esc(writWhere(w))}</div></div>`;
  }

  /** The boards on the minimap and world map. */
  markers(): MapMarker[] {
    return BOARDS.map((b) => ({ x: b.x, y: b.y, glyph: this.active ? "▪" : "!", color: "#e3bf6a", label: b.name, layer: "boards" as const }));
  }

  update(me: { x: number; y: number } | undefined, blocked: boolean) {
    for (const m of this.marks) m.setVisible(!this.active);
    let near: (typeof BOARDS)[number] | undefined;
    if (me && !blocked) for (const b of BOARDS) if (Math.hypot(b.x - me.x, b.y - me.y) <= BOARD_RANGE) near = b;
    if (near !== this.near) { this.near = near; if (!near) this.close(); }
    this.prompt.classList.toggle("open", !!near && !this.open);
    const html = near ? `<kbd>E</kbd> Read the ${near.name}` : "";
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
  }
}

/** Click box of a board (px). */
export const BOARD_W = 26, BOARD_H = 34;
