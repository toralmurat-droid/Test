import { ClassKind, CLASSES } from "../../shared/classes";
import { EFFECT_TEXT, lockReason, nodeRank, spentPoints, talentPoints, TREE_LEVELS, treeNodes, TREES } from "../../shared/talents";

/**
 * Skill tree screen (T): one tree with the class skills (keys 1 and 2, plus passives like Iron Skin) and the
 * passive skill branches, drawn as a tree growing up from the hero: Lv 1 at the bottom, ultimate at the top; a node needs the one below it. Click a node to spend a point.
 */
export class TalentMenu {
  private el = document.getElementById("tree")!;
  private sig = "";

  constructor(private send: (type: string, msg?: unknown) => void) {
    this.el.addEventListener("click", (ev) => {
      const t = (ev.target as HTMLElement).closest("[data-talent]") as HTMLElement | null;
      if (t && t.classList.contains("can")) this.send("learn", t.dataset.talent);
      if ((ev.target as HTMLElement).id === "treereset") this.send("respec");
    });
    // Buttons never keep keyboard focus, so Space in a fight can't click a node by accident
    this.el.addEventListener("mousedown", (ev) => { if ((ev.target as HTMLElement).closest("button")) ev.preventDefault(); });
  }

  get open() { return !this.el.hidden; }
  toggle(state: any) { if (this.open) this.el.hidden = true; else { this.el.hidden = false; this.sig = ""; this.refresh(state); } }

  /** Rebuild only when level or ranks changed. */
  refresh(state: any) {
    if (!this.open || !state) return;
    const ranks = state.talents;
    const cls = state.cls as ClassKind;
    const nodes = treeNodes(cls);
    const sig = [cls, state.level, ...nodes.map((n) => nodeRank(cls, ranks, n.id))].join("|");
    if (sig === this.sig) return;
    this.sig = sig;
    const free = talentPoints(state.level) - spentPoints(cls, ranks);
    document.getElementById("treetitle")!.textContent = `${CLASSES[cls].name} skills`;
    document.getElementById("treepoints")!.innerHTML = free > 0
      ? `<b class="free">${free} skill point${free > 1 ? "s" : ""} to spend</b>`
      : state.level < 2 ? "You start with a basic attack only. Reach level 2 for your first skill point." : "No points left. You get 1 point per level.";
    // A real tree: root (the hero) at the bottom, level 1 just above it, the ultimate at the top.
    // Rows are drawn top-down from Lv 10 to Lv 1; branch lines are an SVG layer drawn after layout (drawLinks).
    const b = TREES[cls];
    let cells = "";
    [...TREE_LEVELS].map((lvl, row) => ({ lvl, row })).reverse().forEach(({ lvl, row }) => {
      const reached = state.level >= lvl;
      cells += `<div class="tlvl${reached ? " on" : ""}">Lv ${lvl}</div>`;
      for (let col = 0; col < 3; col++) {
        const n = nodes.find((x) => x.row === row && x.col === col);
        if (!n) { cells += "<div></div>"; continue; }
        const r = nodeRank(cls, ranks, n.id);
        const why = lockReason(cls, state.level, ranks, n.id);
        const st = why === "max" ? "max" : why === "" ? "can" : why === "points" ? (r > 0 ? "has" : "off") : "locked";
        const fx = n.talent ? (r > 0 ? EFFECT_TEXT[n.talent.effect](+(n.talent.perRank * r).toFixed(1)) : EFFECT_TEXT[n.talent.effect](n.talent.perRank) + " per rank") : n.desc;
        const req = why === "level" ? `🔒 Level ${n.level}` : why === "above" ? "🔒 Learn the skill below first" : "";
        const key = n.key ? ` <kbd>${n.key}</kbd>` : "";
        const pips = Array.from({ length: n.max }, (_, i) => `<i class="${i < r ? "on" : ""}"></i>`).join("");
        cells += `<button class="talent ${n.kind} ${st}" data-talent="${n.id}" data-col="${col}" data-row="${row}" data-rank="${r}" style="--c:${n.kind === "power" ? "#ffd166" : n.color}">` +
          `<b>${n.kind === "power" ? "★ " : ""}${n.name}${key}</b><span class="pips">${pips}</span><span class="fx">${fx}</span>${req ? `<span class="req">${req}</span>` : ""}</button>`;
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
