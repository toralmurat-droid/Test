import { CHAINS, questDef, questStep, USE_RANGE, npcPresent, type Quester, type QuestState, type Summon } from "../shared/quests";
import { npcById, TALK_RANGE } from "../shared/npcs";
import { META, metaOf, type MetaKey, sayFor, withChoice } from "../shared/questSteps";

/**
 * The quest steps that need more than a count (shared/questSteps.ts has the specs and pure rules): choices, NPCs heard
 * in any order, picking the right one of several objects, and later carrying, holding, going unseen and turning seals
 * together. TownRoom calls in at a few points (a stage change, the "quest" and "use" messages, a hero leaving) through
 * the small StepHost below, so the room stays in charge of progress, rewards and monsters.
 */

/** The parts of a hero this module reads (TownRoom's Player). */
export type StepHero = Quester & { x: number; y: number; dead: boolean; arcs: { get(k: string): number | undefined; set(k: string, v: number): unknown; delete(k: string): unknown } };

export interface StepHost {
  player(pid: string): StepHero | undefined;
  qs(p: StepHero, c: number): QuestState;
  /** The room's own nextStep (reward, next quest, auto start). */
  nextStep(pid: string, c: number): void;
  /** Put the hero on stage `stage` of their current quest (count 0 unless given) and tell their client. */
  setStage(pid: string, c: number, stage: number, count?: number): void;
  /** A quest monster for this hero (summonFused); tag = its summonChain (-1 = an ambush that outlives the step), lifeMs = gone after that. */
  summon(pid: string, sm: Summon, tag: number, home?: { x: number; y: number }, lifeMs?: number): string;
  removeMob(id: string): void;
  send(pid: string, type: string, msg: unknown): void;
  broadcast(type: string, msg: unknown): void;
  // later work packages (carry / hold / unseen / sync) add what they need here
  mobsNear?(x: number, y: number, r: number): [string, { x: number; y: number }][];
  warp?(pid: string, x: number, y: number): void;
  group?(pid: string): string[];
  together?(a: string, b: string): boolean;
  dayFrac?(now: number): number;
  summonsOf?(pid: string): { x: number; y: number }[];
}

/** A wrong grave's ambush stays this long if nobody kills it. */
export const AMBUSH_MS = 120_000;
/** How close a hero must stand to an NPC to answer them, and to an object to use it (the same slack as TownRoom). */
const TALK_R = TALK_RANGE * 1.5, USE_R = USE_RANGE * 1.5;

/** Write a reserved arcs number (`$f` choices, `$c` cosmetics). Not through qset: 0 is a value here, kept as no key. */
export function setMeta(p: StepHero, key: MetaKey, v: number) {
  const n = Number.isFinite(v) ? Math.max(0, Math.floor(v)) >>> 0 : 0;
  if (n) p.arcs.set(key, n); else p.arcs.delete(key);
}

export class QuestSteps {
  /** Ambush monsters raised for each hero (wrong picks): removed when they leave. */
  private ambush = new Map<string, Set<string>>();

  constructor(private h: StepHost) {}

  /** The hero's stage changed on chain c: a choice with nobody to make it with comes up as a "choice" prompt. */
  changed(pid: string, c: number) {
    const p = this.h.player(pid);
    if (!p) return;
    const q = this.h.qs(p, c), s = questStep(q);
    if (s?.type !== "choose" || s.npc) return;
    this.h.send(pid, "choice", { chain: c, title: questDef(q)?.title ?? "", text: sayFor(s, p), options: s.choose!.options.map((o) => ({ label: o.label, v: o.v })) });
  }

  /** Per-tick work of the timed steps (carry, hold, unseen, sync: later work packages). */
  tick(_now: number, _dtMs: number) {}

  /**
   * "quest" {chain, opt?} on a step this module runs: a choice (needs a valid `opt`) or several NPCs to hear. True =
   * handled here, the room does nothing else with the message.
   */
  talk(pid: string, c: number, opt?: number): boolean {
    const p = this.h.player(pid);
    if (!p || p.dead) return false;
    const s = questStep(this.h.qs(p, c));
    if (s?.type === "choose") { if (opt !== undefined) this.choose(pid, c, opt); return true; }
    if (s?.type !== "talk" || !s.npcs) return false;
    const q = this.h.qs(p, c);
    const i = s.npcs.findIndex((id, k) => !(q.questCount & (1 << k)) && this.near(p, id));
    if (i < 0) return true;
    const count = q.questCount | (1 << i);
    if (count === (1 << s.npcs.length) - 1) this.h.nextStep(pid, c);
    else this.h.setStage(pid, c, q.questStage, count);
    return true;
  }

  /** Make the current step's choice: `opt` must be one of its options, at its NPC if it has one. False = ignored. */
  choose(pid: string, c: number, opt: number): boolean {
    const p = this.h.player(pid);
    if (!p || p.dead || !Number.isInteger(opt)) return false;
    const s = questStep(this.h.qs(p, c));
    if (s?.type !== "choose" || !s.choose!.options.some((o) => o.v === opt)) return false;
    if (s.npc && !this.near(p, s.npc)) return false;
    setMeta(p, META.flags, withChoice(this.flags(p), s.choose!.flag, opt));
    this.h.nextStep(pid, c);
    return true;
  }

  /** E on an object a step of this module owns (pick candidates). True = handled here. */
  use(pid: string, oid: string): boolean {
    const p = this.h.player(pid);
    if (!p || p.dead) return false;
    for (let c = 0; c < CHAINS.length; c++) {
      const q = this.h.qs(p, c), s = questStep(q);
      if (s?.type !== "pick") continue;
      const pk = s.pick!, i = pk.objects.findIndex((o) => o.id === oid), o = pk.objects[i];
      if (!o) continue;
      if (Math.hypot(o.x - p.x, o.y - p.y) > USE_R) return true; // theirs, but too far: nothing happens
      this.h.send(pid, "questuse", { id: o.id });
      if (i === pk.answer) {
        if (pk.sets) setMeta(p, META.flags, withChoice(this.flags(p), pk.sets.flag, pk.sets.v));
        this.h.broadcast("sfx", { ev: "graveright", id: pid, x: Math.round(o.x), y: Math.round(o.y) });
        this.h.nextStep(pid, c);
        return true;
      }
      // the wrong one: what lies there gets up (it outlives the step: summonChain -1), and the hero starts over at `back`
      const mid = this.h.summon(pid, { ...pk.wrong, x: o.x, y: o.y }, -1, undefined, AMBUSH_MS);
      (this.ambush.get(pid) ?? this.ambush.set(pid, new Set()).get(pid)!).add(mid);
      this.h.broadcast("sfx", { ev: "gravewrong", id: pid, m: mid, x: Math.round(o.x), y: Math.round(o.y) });
      this.h.setStage(pid, c, Math.max(1, Math.min(pk.back, q.questStage)), 0);
      return true;
    }
    return false;
  }

  /** The hero put down what they carry (carry, a later work package). */
  drop(_pid: string) {}
  /** The hero took damage (unseen, a later work package). */
  hurt(_pid: string) {}
  /** The hero died (carry / hold / unseen / sync, later work packages). */
  died(_pid: string) {}

  /** The hero left: their ambushes go with them. */
  leave(pid: string) {
    for (const id of this.ambush.get(pid) ?? []) this.h.removeMob(id);
    this.ambush.delete(pid);
  }

  private flags(p: StepHero) { return metaOf(p, META.flags); }

  private near(p: StepHero, npc: string) {
    const n = npcById(npc);
    return !!n && npcPresent(npc, p) && Math.hypot(n.x - p.x, n.y - p.y) <= TALK_R;
  }
}
