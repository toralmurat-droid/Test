import { ClassKind, CLASSES } from "../../shared/classes";
import { SLOT_KEYS } from "../../shared/slots";
import { iconImg } from "./skillIcons";
import {
  BRANCHES, EFFECT_TEXT, lockReason, MAX_RANK, RANK_POWER, rankOf, SKILLS, spentPoints, STACK_NAME, talentPoints, TREE_LEVELS,
} from "../../shared/skills";

/**
 * Skill tree screen (T): 3 branches of 5 skills (shared/skills.ts), drawn as a tree growing up from the hero:
 * Lv 1 at the bottom, the Lv 10 ultimates at the top; a skill needs the one below it. Click a skill to spend a point
 * (3 ranks each). Learned actives go on keys 1-0: click a slot at the bottom, or hover the skill here and press a number key.
 */
export class TalentMenu {
  private el = document.getElementById("tree")!;
  private sig = "";
  private hover = "";
  private cls?: ClassKind;

  constructor(private send: (type: string, msg?: unknown) => void) {
    // Learned active skills: hover one and press a number key to put it on that key
    this.el.addEventListener("mouseover", (ev) => {
      const t = (ev.target as HTMLElement).closest("[data-talent]") as HTMLElement | null;
      this.hover = t?.dataset.talent ?? "";
    });
    this.el.addEventListener("mouseleave", () => { this.hover = ""; });

    this.el.addEventListener("click", (ev) => {
      const t = (ev.target as HTMLElement).closest("[data-talent]") as HTMLElement | null;
      if (t && t.classList.contains("can")) this.send("learn", t.dataset.talent);
      if ((ev.target as HTMLElement).id === "treereset") this.send("respec");
    });
    // Buttons never keep keyboard focus, so Space in a fight can't click a node by accident
    this.el.addEventListener("mousedown", (ev) => { if ((ev.target as HTMLElement).closest("button")) ev.preventDefault(); });
  }

  get open() { return !this.el.hidden; }

  /** Learned active skill under the mouse, so a number key can slot it. */
  hoveredActive(): string | undefined {
    if (!this.open || !this.cls || !this.hover) return undefined;
    const btn = this.el.querySelector(`[data-talent="${this.hover}"][data-active]`) as HTMLElement | null;
    return btn?.dataset.active;
  }
  toggle(state: any) { if (this.open) this.el.hidden = true; else { this.el.hidden = false; this.sig = ""; this.refresh(state); } }

  /** Rebuild only when level or ranks changed. */
  refresh(state: any) {
    if (!this.open || !state) return;
    const ranks = state.talents;
    const cls = state.cls as ClassKind;
    this.cls = cls;
    const nodes = SKILLS[cls];
    const slots: string[] = [...(state.slots ?? [])];
    const sig = [cls, state.level, slots.join(","), ...nodes.map((n) => rankOf(ranks, n.id))].join("|");
    if (sig === this.sig) return;
    this.sig = sig;
    const free = talentPoints(state.level) - spentPoints(cls, ranks);
    document.getElementById("treetitle")!.textContent = `${CLASSES[cls].name} skills`;
    document.getElementById("treepoints")!.innerHTML = (free > 0
      ? `<b class="free">${free} skill point${free > 1 ? "s" : ""} to spend</b>`
      : state.level < 2 ? "You start with a basic attack only. Reach level 2 for your first skill point." : "No points left. You get 1 point per level.") +
      `<span class="treehint">Basic hits build ${STACK_NAME[cls]} (up to 5): some skills spend it for more power.</span>`;
    // A real tree: root (the hero) at the bottom, level 1 just above it, the ultimates at the top.
    // Rows are drawn top-down from Lv 10 to Lv 1; branch lines are an SVG layer drawn after layout (drawLinks).
    const b = BRANCHES[cls];
    let cells = "";
    [...TREE_LEVELS].map((lvl, row) => ({ lvl, row })).reverse().forEach(({ lvl, row }) => {
      const reached = state.level >= lvl;
      cells += `<div class="tlvl${reached ? " on" : ""}">Lv ${lvl}</div>`;
      for (let col = 0; col < 3; col++) {
        const n = nodes.find((x) => x.row === row && x.branch === col);
        if (!n) { cells += "<div></div>"; continue; }
        const r = rankOf(ranks, n.id);
        const why = lockReason(cls, state.level, ranks, n.id);
        const st = why === "max" ? "max" : why === "" ? "can" : why === "points" ? (r > 0 ? "has" : "off") : "locked";
        const pas = n.passive;
        const fx = pas
          ? (r > 0 ? EFFECT_TEXT[pas.effect](+(pas.perRank * r).toFixed(1)) : EFFECT_TEXT[pas.effect](pas.perRank) + " per rank")
          : n.desc;
        const rankNote = !pas && r > 0 && r < MAX_RANK ? `<span class="rk">Next rank: +${Math.round(RANK_POWER * 100)}% power, longer effects</span>` : "";
        const cost = !pas ? `<span class="cost">${(n.cd ?? 0) / 1000}s · ${n.cost ?? 0} ${cls === "wizard" ? "magic" : "stamina"}${n.chargeMs ? ` · charge ${n.chargeMs / 1000}s` : ""}</span>` : "";
        const req = why === "level" ? `🔒 Level ${TREE_LEVELS[n.row]}` : why === "above" ? "🔒 Learn the skill below first" : "";
        const slot = !pas ? slots.indexOf(n.id) : -1;
        const key = slot >= 0 ? ` <kbd>${SLOT_KEYS[slot]}</kbd>` : "";
        const actAttr = !pas && r > 0 ? ` data-active="${n.id}"` : "";
        const hint = !pas && r > 0 && slot < 0 ? `<span class="req">⇩ Click a key slot at the bottom to use it (or hover here + press 1-0)</span>` : "";
        const pips = Array.from({ length: MAX_RANK }, (_, i) => `<i class="${i < r ? "on" : ""}"></i>`).join("");
        const ult = n.row === 4;
        const tag = `<span class="ttype${pas ? " pas" : ""}">${n.type}</span>`;
        cells += `<button class="talent ${pas ? "passive" : "power"}${ult ? " ult" : ""} ${st}" data-talent="${n.id}" data-col="${col}" data-row="${row}" data-rank="${r}"${actAttr} style="--c:${b[col].color}">` +
          `<b>${iconImg(n.id, "ticon")}${n.name}${key}</b>${tag}<span class="pips">${pips}</span><span class="fx">${fx}</span>${cost}${rankNote}${req ? `<span class="req">${req}</span>` : hint}</button>`;
      }
    });
    const roots = b.map((x, i) => `<div class="troot" data-col="${i}" style="color:${x.color}">${x.name}</div>`).join("");
    cells += `<div></div>${roots}<div></div><div class="trunk">${CLASSES[cls].name} · Lv ${state.level}</div>`;
    const box = document.getElementById("treebranches")!;
    box.innerHTML = `<svg class="treelinks"></svg>${cells}`;
    requestAnimationFrame(() => this.drawLinks(box, b.map((x) => x.color)));
  }

  /** Branch lines: trunk -> branch roots -> level 1 node -> ... up each column. Lit when the lower node is learned. */
  private drawLinks(box: HTMLElement, colors: string[]) {
    const svg = box.querySelector("svg.treelinks") as SVGSVGElement | null;
    if (!svg || !box.offsetParent) return;
    const o = box.getBoundingClientRect();
    svg.setAttribute("width", `${box.scrollWidth}`);
    svg.setAttribute("height", `${box.scrollHeight}`);
    const pos = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - o.left + r.width / 2, top: r.top - o.top, bottom: r.bottom - o.top };
    };
    const lines: string[] = [];
    const seg = (x1: number, y1: number, x2: number, y2: number, color: string, lit: boolean, w: number) => {
      const my = (y1 + y2) / 2;
      lines.push(`<path d="M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}" stroke="${lit ? color : "#3a3d55"}" stroke-width="${w}" fill="none"` +
        `${lit ? "" : ' stroke-dasharray="4 4"'} stroke-linecap="round"/>`);
    };
    const trunk = box.querySelector(".trunk");
    const tp = trunk && pos(trunk);
    for (let col = 0; col < 3; col++) {
      const root = box.querySelector(`.troot[data-col="${col}"]`);
      if (!root || !tp) continue;
      const rp = pos(root);
      seg(tp.x, tp.top, rp.x, rp.bottom, "#a68a64", true, 6);
      let prev = rp, lit = true;
      for (let row = 0; ; row++) {
        const n = box.querySelector(`.talent[data-col="${col}"][data-row="${row}"]`) as HTMLElement | null;
        if (!n) break;
        const np = pos(n);
        seg(prev.x, prev.top, np.x, np.bottom, colors[col], lit, 4);
        lit = +(n.dataset.rank ?? 0) > 0;
        prev = np;
      }
    }
    svg.innerHTML = lines.join("");
  }
}
