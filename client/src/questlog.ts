import { npcById } from "../../shared/npcs";
import { CHAINS, chainOpen, chainState, QuestDef, questObjective, Quester, QuestState as QState, stepGoal, stepProgress } from "../../shared/quests";

type QuestState = Quester | undefined;

const TRACK_KEY = "quest:untracked";

/** Quest log window (J): active and finished quests, steps, progress and rewards, with a "track" switch. */
export class QuestLog {
  private el = document.createElement("div");
  private html = "";
  /** Quest shown on the right ("chain:index"); "" = the current one */
  private sel = "";
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
      if (item) { this.sel = item.dataset.q ?? ""; this.html = ""; }
      if (t.closest(".ql-track")) {
        this.tracked = (t.closest(".ql-track") as HTMLInputElement).checked;
        try { localStorage.setItem(TRACK_KEY, this.tracked ? "0" : "1"); } catch { /* ignore */ }
        this.html = "";
      }
    });
  }

  get open() { return !this.el.hidden; }

  toggle(open = !this.open) { this.el.hidden = !open; this.html = ""; if (open) this.sel = ""; }

  render(p: QuestState) {
    if (!this.open) return;
    // Every chain (the blob story, the skeleton story) has its own active quest and finished ones
    type Entry = { key: string; d: QuestDef; q: QState; done: boolean };
    const active: Entry[] = [], finished: Entry[] = [], hints: string[] = [];
    CHAINS.forEach((ch, c) => {
      const q = chainState(p, c) ?? { chain: c, questId: 0, questStage: 0, questCount: 0 };
      const qid = q.questId;
      if (ch.quests[qid] && q.questStage > 0) active.push({ key: `${c}:${qid}`, d: ch.quests[qid], q, done: false });
      for (let i = qid - 1; i >= 0; i--) finished.push({ key: `${c}:${i}`, d: ch.quests[i], q, done: true });
      const next = ch.quests[qid];
      if (next && q.questStage === 0 && chainOpen(p, c) && (qid > 0 || c > 0 || (q.level ?? 1) >= next.minLevel)) {
        hints.push((q.level ?? 1) >= next.minLevel ? `<b class="bang">!</b> ${npcById(next.giver)?.name} has a new quest for you.` : `${ch.name}: next quest at level ${next.minLevel}.`);
      }
    });
    let body: string;
    if (!active.length && !finished.length) {
      body = `<p class="ql-none">No quests yet. Look for a <b class="bang">!</b> over someone's head: Elder Rowan by the village bonfire needs help.</p>`;
    } else {
      const all = [...active, ...finished];
      const cur = all.find((e) => e.key === this.sel) ?? all[0];
      const { d, q, done } = cur;
      const stage = q.questStage, count = q.questCount;
      const item = (e: Entry) => `<div class="ql-item${e === cur ? " sel" : ""}" data-q="${e.key}">${e.d.title}</div>`;
      const hint = hints.map((h) => `<p class="ql-next">${h}</p>`).join("");
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
        (active.length ? `<div class="ql-cat">Active</div>${active.map(item).join("")}` : "") +
        (finished.length ? `<div class="ql-cat">Completed</div>${finished.map(item).join("")}` : "") +
        `${hint}</div>` +
        `<div class="ql-detail">` +
        `<h3>${d.title} ${done ? `<span class="ql-badge">Complete</span>` : ""}</h3>` +
        `<div class="ql-meta">${CHAINS[q.chain ?? 0].name} · Given by ${npcById(d.giver)?.name} · ${d.zone} · Lv ${d.minLevel}+</div>` +
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
