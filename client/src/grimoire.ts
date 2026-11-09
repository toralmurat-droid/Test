/**
 * The Summoner's grimoire on the HUD (Void Lord rework, Murat 2026-11-08): one page per golem slot, with the golem's
 * element and what it is doing (fighting, back from the Void in N s, resting in town, fused into the Colossus, or why
 * the second page is still shut). Click or tap a page to choose its element among the four; the server checks the
 * choice, saves it with the hero, and a golem out in the old element goes back and rises in the new one.
 * Data: the private "golems" message (server/TownRoom.ts golemNews), sent only when something changes.
 */
import { ATTUNE_ORDER, GOLEM, type AttuneElement } from "../../shared/summons";
import { skillIcon } from "./skillIcons";

export const ELEMENT_NAME: Record<AttuneElement, string> = { fire: "Fire", cold: "Frost", poison: "Venom", shock: "Storm" };
export const ELEMENT_COLOR: Record<AttuneElement, string> = { fire: "#ff9f1c", cold: "#4cc9f0", poison: "#7cfc00", shock: "#b3ecff" };
const AURA_TEXT: Record<AttuneElement, string> = {
  fire: "Aura: harder blows that set foes alight. Its golem bursts into flames now and then.",
  cold: "Aura: less damage taken, attackers chilled. Its golem freezes with every third blow.",
  poison: "Aura: drink part of the damage, poisoned blows. Its golem leaves pools of venom.",
  shock: "Aura: faster steps and blows. Its golem throws chain lightning.",
};

type SlotState = { st: "up" | "wait" | "town" | "colossus" | "lv" | "twin"; end?: number };
export interface GolemNews { book: AttuneElement[]; slots: { st: SlotState["st"]; ms?: number }[] }

export class GrimoirePanel {
  readonly root: HTMLElement;
  private book: AttuneElement[] = ["fire", "fire"];
  private slots: SlotState[] = [{ st: "town" }, { st: "lv" }];
  private picking = -1;
  private shown = "";

  constructor(parent: HTMLElement, private send: (slot: number, el: AttuneElement) => void) {
    this.root = document.createElement("div");
    this.root.id = "grimoire";
    this.root.hidden = true;
    parent.appendChild(this.root);
    this.root.addEventListener("click", (ev) => {
      const t = ev.target as HTMLElement;
      const pick = t.closest<HTMLElement>("[data-el]");
      if (pick && this.picking >= 0) {
        const el = pick.dataset.el as AttuneElement;
        if (el !== this.book[this.picking]) { this.book[this.picking] = el; this.send(this.picking, el); }
        this.picking = -1; this.shown = "";
        return;
      }
      const page = t.closest<HTMLElement>("[data-slot]");
      if (!page) return;
      const i = Number(page.dataset.slot);
      if (this.slots[i].st === "lv" || this.slots[i].st === "twin") return;
      this.picking = this.picking === i ? -1 : i; this.shown = "";
    });
    // a click anywhere else closes the element choice
    document.addEventListener("pointerdown", (ev) => {
      if (this.picking >= 0 && !this.root.contains(ev.target as Node)) { this.picking = -1; this.shown = ""; }
    });
  }

  /** The server's news (its `ms` are anchored to our clock now). */
  news(m: GolemNews) {
    const now = performance.now();
    if (Array.isArray(m?.book)) this.book = m.book.map((e) => (ATTUNE_ORDER.includes(e) ? e : "fire"));
    if (Array.isArray(m?.slots)) this.slots = m.slots.map((s) => ({ st: s.st, end: s.ms !== undefined ? now + s.ms : undefined }));
    this.shown = "";
  }

  /** Every frame: shown only for a Summoner; redrawn when its text changes (the countdowns tick once a second). */
  update(cls: string | undefined) {
    const on = cls === "summoner";
    if (this.root.hidden === on) this.root.hidden = !on;
    if (!on) { this.picking = -1; return; }
    const now = performance.now();
    const status = this.slots.map((s) => this.statusText(s, now));
    // Rebuilt only when the pages change; a running countdown only rewrites its own text (a rebuild under the pointer
    // would swallow the click or tap)
    const key = this.book.join() + this.slots.map((s) => s.st).join() + this.picking;
    if (key === this.shown) {
      this.root.querySelectorAll<HTMLElement>(".gstate").forEach((el, i) => { if (el.textContent !== status[i]) el.textContent = status[i]; });
      return;
    }
    this.shown = key;
    const pages = this.slots.map((s, i) => {
      const el = this.book[i] ?? "fire", shut = s.st === "lv" || s.st === "twin";
      const tip = shut ? (s.st === "lv" ? `A second golem from level ${GOLEM.twinLevel}, with Twin Bond.` : "Learn Twin Bond (Golems branch) for a second golem.")
        : `${ELEMENT_NAME[el]} golem. ${AURA_TEXT[el]} Click to choose its element.`;
      return `<button class="gpage${shut ? " shut" : ""}${this.picking === i ? " open" : ""} st-${s.st}" data-slot="${i}" data-tiphead="Grimoire, page ${i + 1}" data-tip="${tip}">` +
        (shut ? `<i class="glock"></i>` : `<img src="${skillIcon(`aura_${el}`)}" alt="" draggable="false">`) +
        `<span class="gname" style="color:${shut ? "#888" : ELEMENT_COLOR[el]}">${shut ? "Locked" : ELEMENT_NAME[el]}</span><span class="gstate">${status[i]}</span></button>`;
    }).join("");
    const choice = this.picking >= 0
      ? `<div class="gpick">${ATTUNE_ORDER.map((el) => `<button data-el="${el}" class="${el === this.book[this.picking] ? "cur" : ""}" title="${ELEMENT_NAME[el]}"><img src="${skillIcon(`aura_${el}`)}" alt="" draggable="false"><span style="color:${ELEMENT_COLOR[el]}">${ELEMENT_NAME[el]}</span></button>`).join("")}</div>`
      : "";
    this.root.innerHTML = choice + `<div class="gpages">${pages}</div>`;
  }

  private statusText(s: SlotState, now: number): string {
    switch (s.st) {
      case "up": return "fighting";
      case "wait": return s.end !== undefined && s.end > now ? `back in ${Math.ceil((s.end - now) / 1000)}s` : "rising";
      case "town": return "resting";
      case "colossus": return "fused";
      case "lv": return `level ${GOLEM.twinLevel}`;
      case "twin": return "Twin Bond";
    }
  }
}
