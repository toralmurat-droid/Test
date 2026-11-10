import { npcById } from "../../shared/npcs";
import { act2Missing } from "../../shared/act2";
import { icon as pxIcon } from "./pixelicons";
import { CHAINS, chainOpen, chainState, SUN_CHAIN, tutorialDone, QuestDef, questObjective, Quester, QuestState as QState, stepGoal, stepProgress } from "../../shared/quests";

type QuestState = Quester | undefined;

/** Old switch: "1" = nothing tracked */
const OLD_TRACK_KEY = "quest:untracked";
/** Chain ids (CHAINS[].id) the player chose not to track, as JSON */
const TRACK_KEY = "quest:untrackedChains";

/** Quest log window (J or the Quests button under the minimap): active and finished quests, steps,
 *  progress and rewards. The player picks which active quests are tracked on screen and on the map. */
export class QuestLog {
  private el = document.createElement("div");
  private html = "";
  /** Quest shown on the right ("chain:index"); "" = the current one */
  private sel = "";
  /** Chains whose active quest is hidden from the tracker and the map */
  private untracked = new Set<string>();

  constructor() {
    this.el.id = "questlog";
    this.el.hidden = true;
    document.getElementById("hud")?.appendChild(this.el);
    try {
      const raw = localStorage.getItem(TRACK_KEY);
      if (raw) for (const id of JSON.parse(raw) as string[]) this.untracked.add(id);
      else if (localStorage.getItem(OLD_TRACK_KEY) === "1") for (const ch of CHAINS) this.untracked.add(ch.id);
    } catch { /* ignore */ }
    this.el.addEventListener("click", (ev) => {
      const t = ev.target as HTMLElement;
      if (t.closest(".ql-close")) this.toggle(false);
      const tr = t.closest<HTMLElement>("[data-track]");
      if (tr) { this.setTracked(Number(tr.dataset.track), !this.isTracked(Number(tr.dataset.track))); ev.stopPropagation(); return; }
      const item = t.closest<HTMLElement>(".ql-item");
      if (item) { this.sel = item.dataset.q ?? ""; this.html = ""; }
    });
  }

  /** Is chain c's active quest shown in the tracker and on the map? */
  isTracked(c: number) { return !this.untracked.has(CHAINS[c]?.id ?? ""); }

  /** At least one chain tracked (NPC "!" marks then get a rim arrow on the minimap) */
  get anyTracked() { return CHAINS.some((_, c) => this.isTracked(c)); }

  setTracked(c: number, on: boolean) {
    const id = CHAINS[c]?.id;
    if (!id) return;
    if (on) this.untracked.delete(id); else this.untracked.add(id);
    try { localStorage.setItem(TRACK_KEY, JSON.stringify([...this.untracked])); } catch { /* ignore */ }
    this.html = "";
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
      // a zone arc not begun is only hinted while it fits the hero's level (from its first quest's level to 6 past it)
      const arcHidden = ch.local && qid === 0 && ((q.level ?? 1) < next?.minLevel || (q.level ?? 1) > (next?.minLevel ?? 0) + 6);
      if (next && q.questStage === 0 && chainOpen(p, c) && !arcHidden && (qid > 0 || c > 0 || (q.level ?? 1) >= next.minLevel)) {
        const g = npcById(next.giver), where = g?.where ? ` (${g.where})` : "";
        hints.push((q.level ?? 1) >= next.minLevel ? `<b class="bang">!</b> ${g?.name} has a new quest for you${where}.` : `${ch.name}: next quest at level ${next.minLevel}${where ? `, from ${g?.name}${where}` : ""}.`);
      } else if (c === SUN_CHAIN && qid === 0 && q.questStage === 0 && !chainOpen(p, c) && tutorialDone(p)) {
        // The desert story is still locked: say how to get there (Murat 2026-11-08: "where is Rakhim?")
        const g = npcById(next!.giver);
        hints.push(`${ch.name} (Act 2): defeat ${act2Missing(p).join(" and ")} to wake the waygate south of Oakvale. ${g?.name} waits on the other side (${g?.where}).`);
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
      const chainOf = (e: Entry) => e.q.chain ?? 0;
      // Active quests carry a small track box right in the list
      const box = (e: Entry) => e.done ? "" :
        `<span class="ql-tbox${this.isTracked(chainOf(e)) ? " on" : ""}" data-track="${chainOf(e)}">${this.isTracked(chainOf(e)) ? pxIcon("check") : ""}</span>`;
      const item = (e: Entry) => `<div class="ql-item${e === cur ? " sel" : ""}${!e.done && this.isTracked(chainOf(e)) ? " tracked" : ""}" data-q="${e.key}">${box(e)}<span class="ql-name">${e.d.title}</span></div>`;
      const hint = hints.map((h) => `<p class="ql-next">${h}</p>`).join("");
      // Only steps already reached are shown; later ones stay hidden until the quest gets there
      const reached = done ? d.steps.length : stage;
      const steps = d.steps.slice(0, reached).map((st, i) => {
        const state = done || i + 1 < stage ? "done" : "now";
        const icon = state === "done" ? pxIcon("check") : "➜";
        const goal = stepGoal(st), n = state === "done" ? goal : stepProgress(st, count);
        const extra = goal > 1 && state === "now"
          ? `<div class="ql-bar"><div style="width:${(n / goal) * 100}%"></div><span>${n} / ${goal}</span></div>` : "";
        return `<li class="${state}"><span class="ic">${icon}</span>${st.text}${extra}</li>`;
      }).join("");
      const r = d.reward;
      body =
        `<div class="ql-list">` +
        (active.length ? `<div class="ql-cat">Active <span class="ql-cathint">track</span></div>${active.map(item).join("")}` : "") +
        (finished.length ? `<div class="ql-cat">Completed</div>${finished.map(item).join("")}` : "") +
        `${hint}</div>` +
        `<div class="ql-detail">` +
        `<h3>${d.title} ${done ? `<span class="ql-badge">Complete</span>` : ""}</h3>` +
        `<div class="ql-meta">${CHAINS[q.chain ?? 0].name} · Given by ${npcById(d.giver)?.name} · ${d.zone} · Lv ${d.minLevel}+</div>` +
        `<p>${d.description}</p>` +
        `<h4>Objectives</h4><ul class="ql-steps">${steps}</ul>` +
        (done ? "" : `<p class="ql-now">${questObjective(q)}</p>`) +
        `<h4>Reward${done ? " (received)" : ""}</h4><div class="ql-reward"><span>${pxIcon("star")}${r.xp} XP</span><span>${pxIcon("coin")}${r.gold} gold</span><span>${pxIcon("potion")}${r.potions} potions</span></div>` +
        (done ? "" : `<button class="ql-trackbtn${this.isTracked(q.chain ?? 0) ? " on" : ""}" data-track="${q.chain ?? 0}">${this.isTracked(q.chain ?? 0) ? `${pxIcon("check")} Tracked on screen and map` : "Track this quest"}</button>`) +
        `</div>`;
    }
    const html = `<div class="ql-head"><h2>Quest log</h2><button class="ql-close">${pxIcon("close")}</button></div><div class="ql-body">${body}</div><p class="help">Tick the quests to follow on screen and on the map · J to close</p>`;
    if (html !== this.html) { this.html = html; this.el.innerHTML = html; }
  }
}
