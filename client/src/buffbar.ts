/**
 * HUD buff row (Murat 2026-11-04): every timed effect on your hero (skill buffs, counter stances, the shrine's
 * Blessing of the Wind, and debuffs like stun or burn) shows its pixel icon, a dark sweep that fills as it runs out,
 * and the time left in the pixel font. Data comes from Player.timers (shared/buffTimers.ts).
 */
import { decodeTimers, formatLeft, isDebuff, isLasting, STATUS_NAMES } from "../../shared/buffTimers";
import { skillById } from "../../shared/skills";
import { BOON_NAMES, WIND_BLESSING_ID } from "../../shared/shrine";
import { skillIcon } from "./skillIcons";

interface Entry { id: string; end: number; total: number; el: HTMLElement; sweep: HTMLElement; text: HTMLElement; shown: string }

/** The Summoner's golem auras (shared/summons.ts AURA) and the storm wisp's rush. */
const AURA_NAMES: Record<string, string> = {
  aura_fire: "Fire aura: harder blows that set foes alight",
  aura_cold: "Frost aura: less damage taken, attackers up close are chilled",
  aura_poison: "Venom aura: you drink part of the damage, your blows poison",
  aura_shock: "Storm aura: faster steps and blows",
  wisp_shock: "Storm spark: running faster",
};
const nameOf = (id: string) =>
  id === WIND_BLESSING_ID ? BOON_NAMES.speed : isDebuff(id) ? STATUS_NAMES[id] : AURA_NAMES[id] ?? skillById(id)?.name ?? id;

export class BuffBar {
  private root: HTMLElement;
  private raw = "";
  private list: Entry[] = [];

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.id = "buffs";
    parent.appendChild(this.root);
  }

  /** Call every frame with my Player.timers string. */
  update(timers: string) {
    const now = performance.now();
    if (timers !== this.raw) { this.raw = timers; this.rebuild(decodeTimers(timers), now); }
    for (const e of this.list) {
      if (isLasting(e.id)) continue; // kept up while its golem lives: no countdown
      const left = Math.max(0, e.end - now);
      const label = formatLeft(left);
      if (label !== e.shown) { e.text.textContent = label; e.shown = label; }
      e.sweep.style.height = `${Math.min(100, (1 - left / e.total) * 100)}%`;
      e.el.classList.toggle("ending", left < 5000);
      e.el.classList.toggle("gone", left <= 0);
    }
  }

  private rebuild(next: { id: string; left: number }[], now: number) {
    const old = new Map(this.list.map((e) => [e.id, e]));
    const list: Entry[] = [];
    for (const t of next) {
      const end = now + t.left;
      const prev = old.get(t.id);
      if (prev) {
        old.delete(t.id);
        // Same effect still running: keep its full length, unless it was refreshed (then the bar starts full again)
        if (end > prev.end + 150) prev.total = t.left;
        prev.end = end;
        list.push(prev);
        continue;
      }
      const el = document.createElement("div");
      el.className = "buff" + (isDebuff(t.id) ? " bad" : "") + (isLasting(t.id) ? " lasting" : "");
      el.title = nameOf(t.id);
      const url = skillIcon(t.id);
      el.innerHTML = (url ? `<img src="${url}" alt="" draggable="false">` : `<i>?</i>`) + `<div class="sweep"></div><span></span>`;
      list.push({ id: t.id, end, total: Math.max(1, t.left), el, sweep: el.querySelector(".sweep")!, text: el.querySelector("span")!, shown: "" });
    }
    for (const e of old.values()) e.el.remove();
    // Buffs first, debuffs after, each in the order the server lists them
    list.sort((a, b) => Number(isDebuff(a.id)) - Number(isDebuff(b.id)));
    for (const e of list) this.root.appendChild(e.el);
    this.list = list;
  }
}
