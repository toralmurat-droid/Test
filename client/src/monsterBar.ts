import "./monsterBar.css";
import { ELEMENT_COLORS, type Element } from "../../shared/elements";
import { skillIcon } from "./skillIcons";
import { BAR_HOLD_MS, TONE_COLOR, detailLines, hpText, plateRows, type MonsterInfo } from "./monsterInfo";
import { FRAME_NAME_COLOR, glyphUrl, plateArt } from "./plateArt";

/**
 * The plate at the top centre of the screen that tells what the monster under the mouse (or your click target) is:
 * A (every monster) level tile, name in its rank's colour, weak / resist / status icons and a thin HP bar; B (ranked
 * monsters) one more row of affix names and, for a Songweaver, the ear and pitch icons; C (while Alt is held) the
 * sentence details and HP numbers. The frame (plateArt.ts) shows the rank. It is the only place for monster specifics
 * (the world only shows the HP bar). Cosmetic: DOM only. Re-renders its markup only when `MonsterInfo.key` or Alt
 * changes; the HP fill and number update every frame.
 */
/** A newly hovered monster shows its plate after this delay, so sweeping the mouse across a pack does not flicker. */
export const APPEAR_DELAY_MS = 120;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const col = (n: number) => "#" + n.toString(16).padStart(6, "0");
const glyph = (name: string, color: string, dim = false) => `<img class="mb-gl${dim ? " dim" : ""}" src="${glyphUrl(name, color)}" alt="">`;
const elGlyph = (e: Element, dim = false) => glyph(e, col(ELEMENT_COLORS[e]), dim);
const sepJoin = (groups: string[]) => groups.filter(Boolean).join('<i class="mb-sep"></i>');

export class MonsterBar {
  private el = document.createElement("div");
  private key = "";
  private seenAt = -1e9;
  private shown = false;
  private pendingId?: string;
  private pendingAt = 0;
  private alt = false;
  private fill?: HTMLElement;
  private num?: HTMLElement;
  private lastHp = "";
  private affixes: { key: string; icon: number[]; color: number }[] = [];

  constructor(hud: HTMLElement) {
    this.el.id = "monsterbar";
    this.el.hidden = true;
    hud.appendChild(this.el);
    // Alt shows the details. Its keydown is cancelled so the browser does not move focus to its menu (Alt+Enter, the
    // fullscreen shortcut in fullscreen.ts, is a keydown of Enter and unaffected).
    const set = (on: boolean) => { if (on !== this.alt) { this.alt = on; this.key = ""; } };
    window.addEventListener("keydown", (ev: KeyboardEvent) => { if (ev.key === "Alt") { ev.preventDefault(); set(true); } });
    window.addEventListener("keyup", (ev: KeyboardEvent) => { if (ev.key === "Alt") { ev.preventDefault(); set(false); } });
    window.addEventListener("blur", () => set(false));
  }

  /**
   * The monster to describe now (`id` tells a new one from the same), or undefined when nothing is hovered / targeted
   * (the plate lingers BAR_HOLD_MS). A plate not yet on screen waits APPEAR_DELAY_MS; switching from one monster to
   * another while it shows is immediate.
   */
  show(info: MonsterInfo | undefined, now: number, id?: string) {
    if (!info) {
      this.pendingId = undefined;
      if (this.shown && now - this.seenAt > BAR_HOLD_MS) this.hide();
      return;
    }
    if (!this.shown) {
      if (this.pendingId !== id) { this.pendingId = id; this.pendingAt = now; }
      if (now - this.pendingAt < APPEAR_DELAY_MS) return;
    }
    this.seenAt = now;
    const k = info.key + (this.alt ? "/alt" : "");
    if (k !== this.key) this.render(info, k);
    const hp = `${Math.max(0, Math.ceil(info.hp))}/${Math.ceil(info.maxHp)}`;
    if (hp !== this.lastHp) {
      this.lastHp = hp;
      this.fill!.style.width = `${Math.max(0, Math.min(100, (info.hp / info.maxHp) * 100)).toFixed(1)}%`;
      if (this.num) this.num.textContent = hpText(info.hp, info.maxHp);
    }
    if (!this.shown) { this.shown = true; this.el.hidden = false; }
  }

  /** At once (the monster died or left the view). */
  hide() {
    this.shown = false; this.key = ""; this.lastHp = ""; this.pendingId = undefined;
    this.el.hidden = true;
  }

  private render(i: MonsterInfo, key: string) {
    this.key = key; this.lastHp = "";
    const rows = plateRows(i, this.alt), art = plateArt(i.frame);
    // Row 1: level tile, name, then weak (bright) | resist (faded) | status icons at the right
    const weak = i.weak.map((e) => elGlyph(e)).join(""), resist = i.resist.map((e) => elGlyph(e, true)).join("");
    const status = i.states.map((s) => glyph(s.glyph, s.icon ? col(ELEMENT_COLORS[s.icon]) : s.color)).join("");
    const earImgs = () => {
      if (!i.ear) return "";
      const ear = skillIcon("sgear_" + i.ear.tier), note = i.ear.pitch ? skillIcon("sgpitch_" + i.ear.pitch) : "";
      return `${ear ? `<img class="mb-ear" src="${ear}" alt="">` : ""}${note ? `<img class="mb-ear" src="${note}" alt="">` : ""}`;
    };
    let body =
      `<div class="mb-r1"><span class="mb-lv" style="background:${TONE_COLOR[i.tone]}">${i.level}</span>` +
      `<span class="mb-name" style="color:${FRAME_NAME_COLOR[i.frame]}">${esc(i.name)}</span>` +
      `<span class="mb-ics">${sepJoin([weak, resist, status])}</span></div>` +
      `<div class="mb-hprow"><div class="mb-hp"><i></i></div><b class="mb-hpn"></b></div>`;
    this.affixes = i.affixes.map((a) => ({ key: a.key, icon: a.icon, color: a.color }));
    if (rows.traits) { // B
      const aff = i.affixes.map((a) => `<span class="mb-af"><canvas width="5" height="5" data-a="${a.key}"></canvas><b style="color:${col(a.color)}">${esc(a.name)}</b></span>`).join('<i class="mb-sep"></i>');
      body += `<div class="mb-r2">${aff}<span class="mb-sp"></span>${earImgs()}</div>`;
    }
    if (rows.details) { // C
      const d = detailLines(i);
      for (const a of d.affixes) body += `<div class="mb-d"><canvas width="5" height="5" data-a="${a.key}"></canvas><b style="color:${col(a.color)}">${esc(a.name)}</b><span>${esc(a.text)}</span></div>`;
      if (d.hint) body += `<div class="mb-d mb-hint">${earImgs()}<span>${esc(d.hint)}</span></div>`;
      if (d.affinity) body += `<div class="mb-d mb-dim"><span>${esc(d.affinity)}</span></div>`;
      if (d.status) body += `<div class="mb-d mb-dim"><span>${esc(d.status)}</span></div>`;
      if (d.extra) body += `<div class="mb-d mb-dim"><span>${esc(d.extra)}</span></div>`;
    }
    this.el.className = `mb-${i.frame}${rows.traits || rows.details ? " mb-wide" : ""}${rows.details ? " mb-alt" : ""}`;
    this.el.style.cssText = `top:${art.top}px;${art.style}`;
    this.el.innerHTML = art.ornaments + body;
    this.fill = this.el.querySelector(".mb-hp i") as HTMLElement;
    this.num = this.el.querySelector(".mb-hpn") as HTMLElement;
    for (const c of this.el.querySelectorAll<HTMLCanvasElement>("canvas[data-a]")) {
      const a = this.affixes.find((x) => x.key === c.dataset.a), g = c.getContext("2d")!;
      if (!a) continue;
      g.fillStyle = col(a.color);
      a.icon.forEach((bits, r) => { for (let b = 0; b < 5; b++) if (bits & (1 << (4 - b))) g.fillRect(b, r, 1, 1); });
    }
  }
}
