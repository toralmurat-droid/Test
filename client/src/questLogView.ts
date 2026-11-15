import { TILE } from "../../shared/constants";
import { AREAS } from "../../shared/map";
import { SPAWN_ZONES } from "../../shared/spawns";
import { npcById } from "../../shared/npcs";
import { stepOn } from "../../shared/questSteps";
import { CHAINS, chainState, questTargets, stepFor, stepGoal, stepProgress, type QuestDef, type QuestState, type Quester } from "../../shared/quests";

/** Pure helpers of the quest log (client/src/questlog.ts): what to list, group and show. No DOM here. */
export type LogHero = (Quester & { cls?: string }) | undefined;

export interface LogEntry { key: string; chain: number; index: number; d: QuestDef; done: boolean }
export interface ChainGroup { chain: number; name: string; /** quests of this chain finished */ finished: number; /** all quests the chain has */ total: number; entries: LogEntry[] }

/**
 * Chain progress "N of M": N = quests of the chain this hero has finished, M = every quest the chain defines.
 * Branches (QuestStep.onlyIf) and class changes (byCls) only change steps inside a quest, never the quest count,
 * so M is the same for every hero; a chain locked behind another one still counts from 0.
 */
export function chainProgress(p: LogHero, c: number): { finished: number; total: number } {
  const total = CHAINS[c]?.quests.length ?? 0;
  return { finished: Math.min(total, chainState(p, c)?.questId ?? 0), total };
}

/** Each chain's active quest (stage > 0) and its finished ones (oldest first), as list entries. */
export function logEntries(p: LogHero): { active: LogEntry[]; done: LogEntry[] } {
  const active: LogEntry[] = [], done: LogEntry[] = [];
  CHAINS.forEach((ch, c) => {
    const q = chainState(p, c);
    const id = q?.questId ?? 0;
    for (let i = 0; i < Math.min(id, ch.quests.length); i++) done.push({ key: `${c}:${i}`, chain: c, index: i, d: ch.quests[i], done: true });
    if (q && ch.quests[id] && q.questStage > 0) active.push({ key: `${c}:${id}`, chain: c, index: id, d: ch.quests[id], done: false });
  });
  return { active, done };
}

/** Entries grouped by story chain, in CHAINS order, each group with its progress. */
export function groupByChain(entries: LogEntry[], p: LogHero): ChainGroup[] {
  const out: ChainGroup[] = [];
  for (const e of entries) {
    let g = out.find((x) => x.chain === e.chain);
    if (!g) out.push(g = { chain: e.chain, name: CHAINS[e.chain].name, ...chainProgress(p, e.chain), entries: [] });
    g.entries.push(e);
  }
  return out.sort((a, b) => a.chain - b.chain);
}

export interface ObjRow { text: string; n: number; goal: number; state: "done" | "now" | "todo" }

/**
 * One row per objective (each step once): finished steps full, the current one with its count, later ones dimmed.
 * Steps a choice skipped (onlyIf) are left out.
 */
export function objectiveRows(d: QuestDef, q: QuestState | undefined, p: LogHero, finished: boolean): ObjRow[] {
  const stage = finished ? d.steps.length + 1 : q?.questStage ?? 0, count = q?.questCount ?? 0;
  const rows: ObjRow[] = [];
  d.steps.forEach((st, i) => {
    if (!stepOn(st, p)) return;
    const goal = stepGoal(st), state = i + 1 < stage ? "done" : i + 1 === stage ? "now" : "todo";
    rows.push({ text: stepFor(st, p?.cls).text, goal, state, n: state === "done" ? goal : state === "now" ? stepProgress(st, count) : 0 });
  });
  return rows;
}

export interface MapFocus { x: number; y: number; label: string; kind: "objective" | "giver" | "zone" }

/**
 * Where "Show on map" centres (world px): the quest's current objective point (questTargets) when the step has one,
 * else its giver, else the middle of its zone. Steps done in a menu (equip, learn) and finished quests have no point
 * and fall back to the giver.
 */
export function mapFocus(d: QuestDef, q: QuestState | undefined, finished: boolean): MapFocus | undefined {
  if (!finished && q && q.questStage > 0) {
    const t = questTargets(q)[0];
    if (t) return { x: t.x, y: t.y, label: t.label ?? d.zone, kind: "objective" };
  }
  const g = npcById(d.giver);
  if (g) return { x: g.x, y: g.y, label: g.name, kind: "giver" };
  const z = SPAWN_ZONES.find((s) => s.name === d.zone) ?? AREAS.find((a) => a.name === d.zone);
  return z ? { x: (z.x + z.w / 2) * TILE, y: (z.y + z.h / 2) * TILE, label: d.zone, kind: "zone" } : undefined;
}
