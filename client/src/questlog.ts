import { Q, QUEST, QUEST_LOG, questObjective } from "../../shared/quests";

type QuestState = { questStage: number; questCount: number } | undefined;

const TRACK_KEY = "quest:untracked";

/** Quest log window (J): active and finished quests, steps, progress and rewards, with a "track" switch. */
export class QuestLog {
  private el = document.createElement("div");
  private html = "";
  tracked = true;

  constructor() {
    this.el.id = "questlog";
    this.el.hidden = true;
    document.getElementById("hud")?.appendChild(this.el);
    try { this.tracked = localStorage.getItem(TRACK_KEY) !== "1"; } catch { /* ignore */ }
    this.el.addEventListener("click", (ev) => {
      const t = ev.target as HTMLElement;
      if (t.closest(".ql-close")) this.toggle(false);
      if (t.closest(".ql-track")) {
        this.tracked = (t.closest(".ql-track") as HTMLInputElement).checked;
        try { localStorage.setItem(TRACK_KEY, this.tracked ? "0" : "1"); } catch { /* ignore */ }
        this.html = "";
      }
    });
  }

  get open() { return !this.el.hidden; }

  toggle(open = !this.open) { this.el.hidden = !open; this.html = ""; }

  render(q: QuestState) {
    if (!this.open) return;
    const stage = q?.questStage ?? 0, count = q?.questCount ?? 0;
    let body: string;
    if (stage === Q.NONE) {
      body = `<p class="ql-none">No quests yet. Look for a <b class="bang">!</b> over someone's head: Elder Rowan by the village bonfire needs help.</p>`;
    } else {
      const done = stage === Q.DONE;
      const steps = QUEST_LOG.steps.map((st) => {
        const state = stage > st.stage ? "done" : stage === st.stage ? "now" : "todo";
        const icon = state === "done" ? "✓" : state === "now" ? "➜" : "○";
        const extra = st.stage === Q.HUNT && state !== "todo"
          ? `<div class="ql-bar"><div style="width:${Math.min(1, count / QUEST.killGoal) * 100}%"></div><span>${Math.min(count, QUEST.killGoal)} / ${QUEST.killGoal}</span></div>` : "";
        return `<li class="${state}"><span class="ic">${icon}</span>${st.text}${extra}</li>`;
      }).join("");
      const r = QUEST.reward;
      body =
        `<div class="ql-list"><div class="ql-cat">${done ? "Completed" : "Active"}</div><div class="ql-item sel">${QUEST.title}</div></div>` +
        `<div class="ql-detail">` +
        `<h3>${QUEST.title} ${done ? `<span class="ql-badge">Complete</span>` : ""}</h3>` +
        `<div class="ql-meta">Given by ${QUEST_LOG.giverName} · ${QUEST_LOG.where} · ${QUEST_LOG.level}</div>` +
        `<p>${QUEST_LOG.description}</p>` +
        `<h4>Objectives</h4><ul class="ql-steps">${steps}</ul>` +
        (done ? "" : `<p class="ql-now">${questObjective(stage, count)}</p>`) +
        `<h4>Reward${done ? " (received)" : ""}</h4><div class="ql-reward"><span>⭐ ${r.xp} XP</span><span>🪙 ${r.gold} gold</span><span>🧪 ${r.potions} potions</span></div>` +
        (done ? "" : `<label class="ql-trackrow"><input type="checkbox" class="ql-track"${this.tracked ? " checked" : ""}> Track on screen and map</label>`) +
        `</div>`;
    }
    const html = `<div class="ql-head"><h2>Quest log</h2><button class="ql-close">✕</button></div><div class="ql-body">${body}</div><p class="help">J to close</p>`;
    if (html !== this.html) { this.html = html; this.el.innerHTML = html; }
  }
}
