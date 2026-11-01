import { ClassKind, CLASSES } from "../../shared/classes";
import { EFFECT_TEXT, lockReason, nodeRank, spentPoints, talentPoints, TREE_LEVELS, treeNodes, TREES } from "../../shared/talents";

/**
 * Skill tree screen (T): one tree with the class skills (keys 1 and 2, plus passives like Iron Skin) and the
 * passive skill branches. Rows are levels 1/3/5/8/10; a node needs the one above it. Click a node to spend a point.
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
    const heads = TREES[cls].map((b) => `<div class="thead" style="color:${b.color}">${b.name}</div>`).join("");
    let cells = `<div></div>${heads}`;
    TREE_LEVELS.forEach((lvl, row) => {
      cells += `<div class="tlvl">Lv ${lvl}</div>`;
      for (let col = 0; col < 3; col++) {
        const n = nodes.find((x) => x.row === row && x.col === col);
        if (!n) { cells += "<div></div>"; continue; }
        const r = nodeRank(cls, ranks, n.id);
        const why = lockReason(cls, state.level, ranks, n.id);
        const st = why === "max" ? "max" : why === "" ? "can" : why === "points" ? (r > 0 ? "has" : "off") : "locked";
        const fx = n.talent ? (r > 0 ? EFFECT_TEXT[n.talent.effect](+(n.talent.perRank * r).toFixed(1)) : EFFECT_TEXT[n.talent.effect](n.talent.perRank) + " per rank") : n.desc;
        const req = why === "level" ? `🔒 Level ${n.level}` : why === "above" ? "🔒 Learn the skill above first" : "";
        const key = n.key ? ` <kbd>${n.key}</kbd>` : "";
        cells += `<button class="talent ${n.kind} ${st}" data-talent="${n.id}" style="--c:${n.kind === "power" ? "#ffd166" : n.color}">` +
          `<b>${n.name}${key}</b><span class="rank">${r}/${n.max}</span><span class="fx">${fx}</span>${req ? `<span class="req">${req}</span>` : ""}</button>`;
      }
    });
    document.getElementById("treebranches")!.innerHTML = cells;
  }
}
