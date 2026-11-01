import { npcById } from "../../shared/npcs";
import { QUESTS, questObjective, QuestState as QState, stepGoal, stepProgress } from "../../shared/quests";

type QuestState = QState | undefined;

const TRACK_KEY = "quest:untracked";

/** Quest log window (J): active and finished quests, steps, progress and rewards, with a "track" switch. */
export class QuestLog {
  private el = document.createElement("div");
  private html = "";
  /** Quest shown on the right (index in QUESTS); -1 = the current one */
  private sel = -1;
  tracked = true;

  constructor() {
    this.el.id = "questlog";
    this.el.hidden = true;
    document.getElementById("hud")?.appendChild(this.el);
    try { this.tracked = localStorage.getItem(TRACK_KEY) !== "1"; } catch { /* ignore */ }
    this.el.addEventListener("click", (ev) => {
      const t = ev.target as HTMLElement;
      if (t.closest(".ql-close")) this.toggle(false);
      const item = t.closest<HTMLElement>(".ql-item");
      if (item) { this.sel = Number(item.dataset.q); this.html = ""; }
      if (t.closest(".ql-track")) {
        this.tracked = (t.closest(".ql-track") as HTMLInputElement).checked;
        try { localStorage.setItem(TRACK_KEY, this.tracked ? "0" : "1"); } catch { /* ignore */ }
        this.html = "";
      }
    });
  }

  get open() { return !this.el.hidden; }

  toggle(open = !this.open) { this.el.hidden = !open; this.html = ""; if (open) this.sel = -1; }

  render(q: QuestState) {
    if (!this.open) return;
    const qid = q?.questId ?? 0, stage = q?.questStage ?? 0, count = q?.questCount ?? 0;
    const active = QUESTS[qid] && stage > 0 ? qid : -1;
    const finished = QUESTS.slice(0, qid).map((_, i) => i).reverse();
    let body: string;
    if (active < 0 && !finished.length) {
      body = `<p class="ql-none">No quests yet. Look for a <b class="bang">!</b> over someone's head: Elder Rowan by the village bonfire needs help.</p>`;
    } else {
      const sel = this.sel >= 0 && (this.sel === active || this.sel < qid) ? this.sel : active >= 0 ? active : finished[0];
      const d = QUESTS[sel], done = sel < qid;
      const item = (i: number) => `<div class="ql-item${i === sel ? " sel" : ""}" data-q="${i}">${QUESTS[i].title}</div>`;
      const next = QUESTS[qid];
      const hint = active < 0 && next
        ? `<p class="ql-next">${(q?.level ?? 1) >= next.minLevel ? `<b class="bang">!</b> ${npcById(next.giver)?.name} has a new quest for you.` : `Next quest at level ${next.minLevel}.`}</p>` : "";
      // Only steps already reached are shown; later ones stay hidden until the quest gets there
      const reached = done ? d.steps.length : stage;
      const steps = d.steps.slice(0, reached).map((st, i) => {
        const state = done || i + 1 < stage ? "done" : "now";
        const icon = state === "done" ? "✓" : "➜";
        const goal = stepGoal(st), n = state === "done" ? goal : stepProgress(st, count);
        const extra = goal > 1 && state === "now"
          ? `<div class="ql-bar"><div style="width:${(n / goal) * 100}%"></div><span>${n} / ${goal}</span></div>` : "";
        return `<li class="${state}"><span class="ic">${icon}</span>${st.text}${extra}</li>`;
      }).join("");
      const r = d.reward;
      body =
        `<div class="ql-list">` +
        (active >= 0 ? `<div class="ql-cat">Active</div>${item(active)}` : "") +
        (finished.length ? `<div class="ql-cat">Completed</div>${finished.map(item).join("")}` : "") +
        `${hint}</div>` +
        `<div class="ql-detail">` +
        `<h3>${d.title} ${done ? `<span class="ql-badge">Complete</span>` : ""}</h3>` +
        `<div class="ql-meta">Given by ${npcById(d.giver)?.name} · ${d.zone} · Lv ${d.minLevel}+</div>` +
        `<p>${d.description}</p>` +
        `<h4>Objectives</h4><ul class="ql-steps">${steps}</ul>` +
        (done ? "" : `<p class="ql-now">${questObjective(q)}</p>`) +
        `<h4>Reward${done ? " (received)" : ""}</h4><div class="ql-reward"><span>⭐ ${r.xp} XP</span><span>🪙 ${r.gold} gold</span><span>🧪 ${r.potions} potions</span></div>` +
        (done ? "" : `<label class="ql-trackrow"><input type="checkbox" class="ql-track"${this.tracked ? " checked" : ""}> Track on screen and map</label>`) +
        `</div>`;
    }
    const html = `<div class="ql-head"><h2>Quest log</h2><button class="ql-close">✕</button></div><div class="ql-body">${body}</div><p class="help">J to close</p>`;
    if (html !== this.html) { this.html = html; this.el.innerHTML = html; }
  }
}
