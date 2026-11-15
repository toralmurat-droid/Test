import "./questlog.css";
import { npcById } from "../../shared/npcs";
import { act2Missing } from "../../shared/act2";
import { icon as pxIcon } from "./pixelicons";
import { plateArt } from "./plateArt";
import { CHAINS, chainOpen, chainState, SUN_CHAIN, tutorialDone, Quester } from "../../shared/quests";
import { groupByChain, logEntries, mapAreaOf, mapFocus, objectiveRows, type LogEntry, type MapFocus } from "./questLogView";

type QuestState = (Quester & { cls?: string }) | undefined;
type Tab = "active" | "done" | "rumours";

/** Old switch: "1" = nothing tracked */
const OLD_TRACK_KEY = "quest:untracked";
/** Chain ids (CHAINS[].id) the player chose not to track, as JSON */
const TRACK_KEY = "quest:untrackedChains";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Quest log window (J or the Quests button under the minimap): Active / Completed / Rumours tabs, quests grouped by
 *  story chain, steps, progress and rewards. The player picks which active quests are tracked on screen and on the
 *  map, and can open the world map on a quest's objective. */
export class QuestLog {
  private el = document.createElement("div");
  private html = "";
  /** Quest shown on the right ("chain:index"); "" = the first of the tab */
  private sel = "";
  /** The tab chosen by the player; "" = Active, or Completed when nothing is active */
  private tab: Tab | "" = "";
  /** Chains whose active quest is hidden from the tracker and the map */
  private untracked = new Set<string>();
  /** Where "Show on map" points for the quest on show (set by render) */
  private focus?: MapFocus;
  /** The scene's world map: open it on a world point (px), and say whether it can (it only shows the hero's area) */
  map?: { show: (x: number, y: number) => void; can: (x: number, y: number) => boolean };
  /** Tavern Rumours (client/src/rumours.ts): detail page, active flag, how many offers the hero could take now (undefined: Mags has sent nothing yet, no badge) */
  rumours?: { html: () => string; active: () => boolean; count?: (hero: QuestState) => number | undefined };

  constructor() {
    this.el.id = "questlog";
    this.el.hidden = true;
    this.el.style.cssText += plateArt("elite").style; // the bronze frame of the elite monster plate, like the side panel
    document.getElementById("hud")?.appendChild(this.el);
    try {
      const raw = localStorage.getItem(TRACK_KEY);
      if (raw) for (const id of JSON.parse(raw) as string[]) this.untracked.add(id);
      else if (localStorage.getItem(OLD_TRACK_KEY) === "1") for (const ch of CHAINS) this.untracked.add(ch.id);
    } catch { /* ignore */ }
    this.el.addEventListener("click", (ev) => {
      const t = ev.target as HTMLElement;
      if (t.closest(".ql-close")) this.toggle(false);
      const tab = t.closest<HTMLElement>("[data-tab]");
      if (tab) { this.tab = tab.dataset.tab as Tab; this.sel = ""; this.html = ""; return; }
      if (t.closest("[data-map]")) {
        const f = this.focus;
        if (f && (!this.map || this.map.can(f.x, f.y))) { this.toggle(false); this.map?.show(f.x, f.y); }
        return;
      }
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

  toggle(open = !this.open) { this.el.hidden = !open; this.html = ""; if (open) { this.sel = ""; this.tab = ""; } }

  /** Hints for stories not begun: a quest waiting for the hero, or what unlocks a story */
  private hints(p: QuestState): string[] {
    const hints: string[] = [];
    CHAINS.forEach((ch, c) => {
      const q = chainState(p, c) ?? { chain: c, questId: 0, questStage: 0, questCount: 0 };
      const qid = q.questId, next = ch.quests[qid];
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
    return hints;
  }

  private row(e: LogEntry, cur: LogEntry | undefined) {
    const lead = e.done ? `<span class="ql-tick">${pxIcon("check")}</span>`
      : `<span class="ql-dia${this.isTracked(e.chain) ? " on" : ""}" data-track="${e.chain}" title="${this.isTracked(e.chain) ? "Tracked on screen and map: click to stop" : "Click to track on screen and map"}"><i></i></span>`;
    return `<div class="ql-item${e === cur ? " sel" : ""}${e.done ? " done" : this.isTracked(e.chain) ? " tracked" : ""}" data-q="${e.key}" title="${esc(e.d.title)}">${lead}` +
      `<span class="ql-name">${esc(e.d.title)}</span><span class="ql-lv">Lv ${e.d.minLevel}</span></div>`;
  }

  /** "Show on map", or where the quest is when the open map (the hero's area only) can't show it */
  private mapRow(): string {
    const f = this.focus;
    if (!f) return "";
    if (!this.map || this.map.can(f.x, f.y)) return `<div class="ql-acts"><button class="ql-map" data-map="1" title="Open the world map (M) on ${esc(f.label)}">Show on map</button></div>`;
    return `<div class="ql-acts"><span class="ql-away">In ${esc(mapAreaOf(f.x, f.y).name)}: travel there to see it on the map</span></div>`;
  }

  private detail(e: LogEntry, p: QuestState): string {
    const { d, done } = e;
    const q = chainState(p, e.chain), g = npcById(d.giver);
    const rows = objectiveRows(d, q, p, done).map((o) => {
      const fill = o.goal > 0 ? Math.min(100, (o.n / o.goal) * 100) : 0;
      const label = o.state === "done" && o.goal === 1 ? pxIcon("check") : `${o.n} / ${o.goal}`;
      return `<div class="ql-obj ${o.state}"><span class="t">${esc(o.text)}</span><div class="ql-bar"><div style="width:${fill}%"></div><span>${label}</span></div></div>`;
    }).join("");
    const r = d.reward;
    const track = done ? "" : `<button class="ql-trk${this.isTracked(e.chain) ? " on" : ""}" data-track="${e.chain}" title="Show this quest in the on-screen tracker and on the map"><span class="ql-dia${this.isTracked(e.chain) ? " on" : ""}"><i></i></span>${this.isTracked(e.chain) ? "Tracked" : "Track"}</button>`;
    return `<div class="ql-title"><h3>${esc(d.title)}</h3>${track}</div>` +
      `<div class="ql-meta">${done ? "Done · given" : "Given"} by ${esc(g?.name ?? "someone")} · ${esc(d.zone)} · level ${d.minLevel}+</div>` +
      `<p>${esc(d.description)}</p>` +
      `<h4>Objectives</h4>${rows}` +
      `<h4>Reward${done ? " (received)" : ""}</h4><div class="ql-reward"><span>${pxIcon("star")}${r.xp} XP</span><span>${pxIcon("coin")}${r.gold} gold</span><span>${pxIcon("potion")}${r.potions} potions</span></div>` +
      this.mapRow();
  }

  render(p: QuestState) {
    if (!this.open) return;
    const { active, done } = logEntries(p);
    const rum = this.rumours;
    const tab: Tab = this.tab === "rumours" && rum ? "rumours" : this.tab === "done" ? "done" : this.tab === "active" ? "active" : active.length || !done.length ? "active" : "done";
    const tabBtn = (t: Tab, name: string, n?: number) => `<button class="ql-tab${tab === t ? " on" : ""}" data-tab="${t}">${name}${n === undefined ? "" : `<small>${n}</small>`}</button>`;
    const tabs = `<div class="ql-tabs">${tabBtn("active", "Active", active.length)}${tabBtn("done", "Completed", done.length)}${rum ? tabBtn("rumours", "Rumours", rum.count?.(p)) : ""}</div>`;
    const entries = tab === "done" ? done : active;
    const cur = entries.find((e) => e.key === this.sel) ?? entries[0];
    this.focus = tab !== "rumours" && cur ? mapFocus(cur.d, chainState(p, cur.chain), cur.done) : undefined;
    let list = "", detail = "";
    if (tab === "rumours") {
      list = `<div class="ql-none">Short errands from Mags at the Oakvale tavern.</div>`;
      detail = rum!.html();
    } else {
      list = groupByChain(entries, p).map((gr) => `<div class="ql-story"><span>${esc(gr.name)}</span><small>${tab === "done" ? `${gr.entries.length} done` : `${gr.finished} of ${gr.total}`}</small></div>${gr.entries.map((e) => this.row(e, cur)).join("")}`).join("");
      if (tab === "active") list += this.hints(p).map((h) => `<p class="ql-next">${h}</p>`).join("");
      detail = cur ? this.detail(cur, p)
        : tab === "done" ? `<p class="ql-none">Nothing finished yet.</p>`
          : `<p class="ql-none">No quest under way. Look for a <b class="bang">!</b> over someone's head${done.length || this.hints(p).length ? "" : ": Elder Rowan by the village bonfire needs help"}.</p>`;
    }
    const html = `<div class="ql-head"><h2>Quests</h2>${tabs}<button class="ql-close" title="Close (J)">${pxIcon("close")}</button></div><div class="ql-body"><div class="ql-list">${list}</div><div class="ql-detail">${detail}</div></div>`;
    if (html === this.html) return;
    // a redraw keeps both scroll positions (the quest bars tick up while the log is open)
    const sc = [".ql-list", ".ql-detail"].map((s) => this.el.querySelector<HTMLElement>(s)?.scrollTop ?? 0);
    this.html = html; this.el.innerHTML = html;
    [".ql-list", ".ql-detail"].forEach((s, i) => { const n = this.el.querySelector<HTMLElement>(s); if (n) n.scrollTop = sc[i]; });
  }
}
