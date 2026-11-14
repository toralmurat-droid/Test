import * as R from "../../shared/rumours";
import { rumoursFor, RUMOURS, RUMOUR_GIVER, type Rumour } from "../../shared/rumours";
import type { QuestObject, QuestStep, QuestTarget } from "../../shared/quests";

/** One offer as the server sends it ("rumour" message, server/rumours.ts). */
export interface RumourOffer { i: number; kind: string; title: string; text: string[]; zone: string; level: number; reward: { gold: number; xp: number; rune: number }; done: boolean }
export interface RumourActive { i: number; stage: number; count: number; goal: number; steps: number; obj: string; night?: boolean }
export type RumourEnd = { why: "done"; name: string; gold: number; outro: string; rune?: unknown; title?: string } | { why: "drop" | "stale"; name: string };
export interface RumourMsg { day: number; lv: number; offers: RumourOffer[]; done: number; n: number; active?: RumourActive; end?: RumourEnd }

/** Mags' NPC id, for the dialog. */
export const MAGS: string = RUMOUR_GIVER;
/** Mags' lines (shared/rumours.ts MAGS_LINES, written by the content writer); the fallback keeps this building until it lands. */
const LINES: { greeting: string; allDone: string } = (R as any).MAGS_LINES ?? {
  greeting: "Three things I've heard today. Pick one, and bring me what you find.",
  allDone: "That's all the talk I have today. Come back tomorrow. The tavern never runs dry of it.",
};

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Client side of Tavern Rumours (shared/rumours.ts, server/rumours.ts): keeps the last "rumour" message, rebuilds the
 * active rumour's steps and objects with the same `rumoursFor` call as the server, and gives the dialog, tracker, log and
 * map what to show. It only draws; the server takes, advances and pays.
 */
export class RumourBook {
  st?: RumourMsg;
  /** Bumped on every message: the dialog and log redraw when it changes. */
  rev = 0;
  /** The end banner (done / dropped / stale) is shown by the scene. */
  onEnd?: (e: RumourEnd) => void;

  onMessage(m: any) {
    if (!m || typeof m !== "object" || !Array.isArray(m.offers) || !Number.isFinite(m.day) || !Number.isFinite(m.lv)) return;
    const offers: RumourOffer[] = m.offers.filter((o: any) => o && Number.isInteger(o.i) && typeof o.title === "string").map((o: any) => ({
      i: o.i, kind: String(o.kind), title: o.title, text: Array.isArray(o.text) ? o.text.map(String) : [], zone: String(o.zone), level: +o.level || 1,
      reward: { gold: +o.reward?.gold || 0, xp: +o.reward?.xp || 0, rune: +o.reward?.rune || 0 }, done: !!o.done,
    }));
    const a = m.active, active: RumourActive | undefined = a && Number.isInteger(a.i) && Number.isInteger(a.stage)
      ? { i: a.i, stage: a.stage, count: +a.count || 0, goal: Math.max(1, +a.goal || 1), steps: +a.steps || 1, obj: String(a.obj ?? ""), ...(a.night ? { night: true } : {}) } : undefined;
    const e = m.end, end = e && typeof e === "object" && (e.why === "done" || e.why === "drop" || e.why === "stale") ? e as RumourEnd : undefined;
    this.st = { day: m.day, lv: m.lv, offers, done: +m.done || 0, n: +m.n || 0, ...(active ? { active } : {}) };
    this.rev++;
    if (end) this.onEnd?.(end);
  }

  /** The active rumour, its current step and the other steps, rebuilt like the server does. */
  current(): { r: Rumour; s: QuestStep; a: RumourActive } | undefined {
    const st = this.st, a = st?.active;
    if (!st || !a) return undefined;
    const r = rumoursFor(st.day, st.lv, 1)[a.i], s = r?.steps[a.stage - 1];
    return r && s ? { r, s, a } : undefined;
  }

  /** The active rumour's objects only, with whether each is done (an earlier step's, or used on this one). */
  objects(): { o: QuestObject; done: boolean }[] {
    const c = this.current();
    if (!c) return [];
    return c.r.steps.flatMap((s, k) => (s.objects ?? []).map((o) => ({ o, done: k + 1 < c.a.stage || (k + 1 === c.a.stage && c.a.count >= c.a.goal) })));
  }

  /** The object a hero can use right now (current "use" step, not yet used). */
  usable(): QuestObject | undefined {
    const c = this.current();
    return c && c.s.type === "use" && c.a.count < c.a.goal ? c.s.objects?.[0] : undefined;
  }

  /** Where the current step points: a reach spot, the object to use, or the ambusher's spot. */
  targets(): QuestTarget[] {
    const c = this.current();
    if (!c) return [];
    const { s } = c;
    if (s.type === "reach" && s.at) return [{ x: s.at.x, y: s.at.y, r: s.at.r, kind: "area", label: s.at.label }];
    if (s.type === "use") return (s.objects ?? []).slice(0, 1).map((o) => ({ x: o.x, y: o.y, kind: "object" as const, label: o.name }));
    if (s.type === "kill" && s.summon) return [{ x: s.summon.x, y: s.summon.y, r: RUMOURS.summonR, kind: "area", label: s.obj }];
    return [];
  }

  /** Dialog body for Mags (HTML), or "" before the server has told us anything. */
  dialogHtml(canTake: boolean): string {
    const st = this.st;
    if (!st) return "";
    const cur = this.current();
    const offerHtml = (o: RumourOffer, i: number) => {
      const reward = `${o.reward.gold} gold${o.reward.rune > 0 ? `, ${Math.round(o.reward.rune * 100)}% rune` : ""}`;
      return `<button class="nd-opt rm-offer" data-take="${o.i}"${o.done || cur || !canTake ? " disabled" : ""}>${i < 3 ? `<kbd>${i + 1}</kbd>` : ""}` +
        `<span class="rm-t">${esc(o.title)}${o.done ? ` <i class="rm-done">done today</i>` : ""}</span>` +
        `<span class="rm-x">${esc(o.text[0] ?? "")}</span>` +
        `<span class="rm-m">${esc(o.zone)} · Lv ${o.level} · ${reward}</span></button>`;
    };
    if (cur) {
      return `<p>${esc(cur.r.text[0] ?? "")}</p><div class="rm-now"><b>${esc(cur.r.title)}</b> (${cur.a.stage}/${cur.a.steps})<br>${esc(cur.a.obj)}${cur.a.night ? " (only at night)" : ""}</div>` +
        `<div class="nd-opts"><button class="nd-opt rm-drop" data-drop="1"><kbd>1</kbd>Drop it</button></div>`;
    }
    const lead = !canTake ? `<p>Finish what Elder Rowan asked of you first, love. Then come back, and I'll have a tale for you.</p>`
      : st.offers.every((o) => o.done) ? `<p>${esc(LINES.allDone)}</p>`
        : `<p>${esc(LINES.greeting)}</p>`;
    return lead + `<div class="nd-opts">${st.offers.slice(0, RUMOURS.offers).map(offerHtml).join("")}</div>`;
  }

  /** Quest-log detail (HTML): today's offers with their state, the active one, and the count toward the title. */
  logHtml(): string {
    const st = this.st;
    if (!st) return `<p class="ql-none">Mags the alewife, at her cart on the Oakvale square, hears three rumours a day.</p>`;
    const cur = this.current();
    const rows = st.offers.map((o) => {
      const on = cur?.r.i === o.i;
      return `<li class="${o.done ? "done" : on ? "now" : ""}"><span class="ic">${o.done ? "✓" : on ? "➜" : "•"}</span><b>${esc(o.title)}</b> · ${esc(o.zone)} · Lv ${o.level}` +
        `<br><small>${o.reward.gold} gold${o.reward.rune > 0 ? `, ${Math.round(o.reward.rune * 100)}% chance of a rune` : ""}${o.done ? " · done today" : ""}</small></li>`;
    }).join("");
    const act = cur
      ? `<h4>Under way</h4><p><b>${esc(cur.r.title)}</b> (step ${cur.a.stage} of ${cur.a.steps})</p><p class="ql-now">${esc(cur.a.obj)}${cur.a.night ? " (only at night)" : ""}</p>` +
        (cur.a.goal > 1 ? `<div class="ql-bar"><div style="width:${Math.min(1, cur.a.count / cur.a.goal) * 100}%"></div><span>${cur.a.count} / ${cur.a.goal}</span></div>` : "")
      : "";
    return `<h3>Tavern rumours</h3><div class="ql-meta">Given by Mags · Oakvale · new every day (UTC)</div>` +
      `<p>Short errands near your level. They pay gold and sometimes a rune, never XP.</p>${act}` +
      `<h4>Today</h4><ul class="ql-steps">${rows}</ul>` +
      `<p class="ql-next">Finished: ${st.n} / ${RUMOURS.titleAt}${st.n >= RUMOURS.titleAt ? " · title earned" : ` · ${RUMOURS.titleAt} of them earn a title`}</p>`;
  }

  /** Banner text for the end of a rumour: [big line, small line, colour]. */
  static endLines(e: RumourEnd): [string, string, string] {
    if (e.why === "done") return ["Rumour solved", `${e.name}: +${e.gold} gold${e.rune ? " and a rune" : ""}${e.title ? ` · Title: ${e.title}` : ""}`, "#b9f27c"];
    if (e.why === "drop") return ["Rumour dropped", e.name, "#c8b8a0"];
    return ["The rumour went cold overnight", e.name, "#c8b8a0"];
  }
}

