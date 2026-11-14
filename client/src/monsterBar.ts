import "./monsterBar.css";
import { ELEMENT_COLORS, ELEMENT_NAMES, type Element } from "../../shared/elements";
import { skillIcon } from "./skillIcons";
import { BAR_HOLD_MS, TONE_COLOR, type MonsterInfo } from "./monsterInfo";

/**
 * The bar at the top of the screen that tells what the monster under the mouse (or your click target) is: name,
 * level in its difficulty colour, health, rank, champion affixes, weak / resist, status chips and, for a Songweaver,
 * how it hears. It is the only place for monster specifics (the world only shows the HP bar). Cosmetic: DOM only.
 * Re-renders its markup only when `MonsterInfo.key` changes; the HP fill and number update every frame.
 */
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const col = (n: number) => "#" + n.toString(16).padStart(6, "0");
const elChip = (e: Element) => `<span class="mb-el" style="color:${col(ELEMENT_COLORS[e])}"><i style="background:${col(ELEMENT_COLORS[e])}"></i>${ELEMENT_NAMES[e]}</span>`;
const list = (els: Element[]) => els.map(elChip).join(" ");

export class MonsterBar {
  private el = document.createElement("div");
  private key = "";
  private seenAt = -1e9;
  private shown = false;
  private fill?: HTMLElement;
  private num?: HTMLElement;
  private lastHp = "";
  private affixes: { key: string; icon: number[]; color: number }[] = [];

  constructor(hud: HTMLElement) {
    this.el.id = "monsterbar";
    this.el.hidden = true;
    hud.appendChild(this.el);
  }

  /** The monster to describe now, or undefined when nothing is hovered / targeted (the bar lingers BAR_HOLD_MS). */
  show(info: MonsterInfo | undefined, now: number) {
    if (!info) {
      if (this.shown && now - this.seenAt > BAR_HOLD_MS) this.hide();
      return;
    }
    this.seenAt = now;
    if (info.key !== this.key) this.render(info);
    const hp = `${Math.max(0, Math.ceil(info.hp))}/${Math.ceil(info.maxHp)}`;
    if (hp !== this.lastHp) {
      this.lastHp = hp;
      this.fill!.style.width = `${Math.max(0, Math.min(100, (info.hp / info.maxHp) * 100)).toFixed(1)}%`;
      this.num!.textContent = `${Math.max(0, Math.ceil(info.hp))} / ${Math.ceil(info.maxHp)}`;
    }
    if (!this.shown) { this.shown = true; this.el.hidden = false; }
  }

  /** At once (the monster died or left the view). */
  hide() {
    this.shown = false; this.key = ""; this.lastHp = "";
    this.el.hidden = true;
  }

  private render(i: MonsterInfo) {
    this.key = i.key; this.lastHp = "";
    const lines: string[] = [];
    const info: string[] = [];
    if (i.weak.length) info.push(`<span class="mb-k">Weak</span> ${list(i.weak)}`);
    if (i.resist.length) info.push(`<span class="mb-k">Resists</span> ${list(i.resist)}`);
    if (i.hits.length) info.push(`<span class="mb-k">Hits with</span> ${list(i.hits)}`);
    if (i.weapon) info.push(`<span class="mb-k">Wields</span> ${esc(i.weapon)}`);
    for (const x of i.extras) info.push(esc(x));
    const chips = i.states.map((s) => `<span class="mb-chip" style="color:${s.color};border-color:${s.color}">${esc(s.label)}</span>`).join("");
    if (info.length || chips) lines.push(`<div class="mb-line mb-main"><div class="mb-info">${info.join('<span class="mb-sep"></span>')}</div>${chips ? `<div class="mb-states">${chips}</div>` : ""}</div>`);
    if (i.ear) {
      const ear = skillIcon("sgear_" + i.ear.tier), note = i.ear.pitch ? skillIcon("sgpitch_" + i.ear.pitch) : "";
      lines.push(`<div class="mb-line mb-ear">${ear ? `<img src="${ear}" alt="">` : ""}${note ? `<img src="${note}" alt="">` : ""}<span>${esc(i.ear.tip)}</span></div>`);
    }
    this.affixes = i.affixes.map((a) => ({ key: a.key, icon: a.icon, color: a.color }));
    for (const a of i.affixes) {
      lines.push(`<div class="mb-line mb-affix"><canvas width="5" height="5" data-a="${a.key}"></canvas><b style="color:${col(a.color)}">${esc(a.name)}</b><span>${esc(a.text)}</span></div>`);
    }
    this.el.className = `mb-${i.frame}`;
    this.el.innerHTML =
      `<div class="mb-head"><span class="mb-name">${esc(i.name)}</span>${i.sub ? `<span class="mb-sub">${esc(i.sub)}</span>` : ""}` +
      `<span class="mb-lv" style="color:${TONE_COLOR[i.tone]}">Lv ${i.level}</span>${i.badge ? `<span class="mb-badge mb-${i.rank}">${i.badge}</span>` : ""}</div>` +
      `<div class="mb-hp"><i></i><b></b></div>` + lines.join("");
    this.fill = this.el.querySelector(".mb-hp i") as HTMLElement;
    this.num = this.el.querySelector(".mb-hp b") as HTMLElement;
    for (const c of this.el.querySelectorAll<HTMLCanvasElement>("canvas[data-a]")) {
      const a = this.affixes.find((x) => x.key === c.dataset.a)!, g = c.getContext("2d")!;
      g.fillStyle = col(a.color);
      a.icon.forEach((bits, r) => { for (let b = 0; b < 5; b++) if (bits & (1 << (4 - b))) g.fillRect(b, r, 1, 1); });
    }
  }
}
