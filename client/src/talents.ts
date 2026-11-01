import { ClassKind, CLASSES } from "../../shared/classes";
import { branchPoints, canLearn, EFFECT_TEXT, MAX_RANK, rank, spentPoints, talentPoints, TIER_POINTS, TREES } from "../../shared/talents";

/** Skill tree screen (T): 3 branches per hero, click a skill to spend a point. */
export class TalentMenu {
  private el = document.getElementById("tree")!;
  private sig = "";

  constructor(private send: (type: string, msg?: unknown) => void) {
    this.el.addEventListener("click", (ev) => {
      const t = (ev.target as HTMLElement).closest("[data-talent]") as HTMLElement | null;
      if (t && !t.classList.contains("locked")) this.send("learn", t.dataset.talent);
      if ((ev.target as HTMLElement).id === "treereset") this.send("respec");
    });
  }

  get open() { return !this.el.hidden; }
  toggle(state: any) { if (this.open) this.el.hidden = true; else { this.el.hidden = false; this.sig = ""; this.refresh(state); } }

  /** Rebuild only when level or ranks changed. */
  refresh(state: any) {
    if (!this.open || !state) return;
    const ranks = state.talents;
    const cls = state.cls as ClassKind;
    const sig = [cls, state.level, ...TREES[cls].flatMap((b) => b.talents.map((t) => rank(ranks, t.id)))].join("|");
    if (sig === this.sig) return;
    this.sig = sig;
    const free = talentPoints(state.level) - spentPoints(cls, ranks);
    document.getElementById("treetitle")!.textContent = `${CLASSES[cls].name} skill tree`;
    document.getElementById("treepoints")!.innerHTML = free > 0
      ? `<b class="free">${free} skill point${free > 1 ? "s" : ""} to spend</b>`
      : state.level < 2 ? "Reach level 2 to earn your first skill point." : "No points left. You get 1 point per level.";
    document.getElementById("treebranches")!.innerHTML = TREES[cls].map((b) => {
      const spent = branchPoints(b, ranks);
      const nodes = b.talents.map((t, i) => {
        const r = rank(ranks, t.id);
        const learnable = canLearn(cls, state.level, ranks, t.id);
        const tierLocked = spent < TIER_POINTS[i];
        const cls_ = r >= MAX_RANK ? "max" : learnable ? "can" : tierLocked ? "locked" : r > 0 ? "has" : "off";
        const now = r > 0 ? EFFECT_TEXT[t.effect](+(t.perRank * r).toFixed(1)) : EFFECT_TEXT[t.effect](t.perRank) + " per rank";
        const lock = tierLocked ? `<span class="req">🔒 ${TIER_POINTS[i]} points in ${b.name}</span>` : "";
        return `<button class="talent ${cls_}" data-talent="${t.id}" style="--c:${b.color}">` +
          `<b>${t.name}</b><span class="rank">${r}/${MAX_RANK}</span><span class="fx">${now}</span>${lock}</button>`;
      }).join('<div class="link"></div>');
      return `<div class="branch"><h3 style="color:${b.color}">${b.name} <small>${spent}</small></h3>${nodes}</div>`;
    }).join("");
  }
}
