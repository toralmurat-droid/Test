import { stepGoal, stepProgress, tutorialDone, USE_RANGE, type Summon } from "../shared/quests";
import { npcById, TALK_RANGE } from "../shared/npcs";
import { isDark } from "../shared/questSteps";
import { rollRune } from "../shared/runes";
import { cleanRumour, RUMOUR_GIVER, RUMOUR_TITLE, rumourDay, rumoursFor, rumourStep, RUMOURS, type Rumour, type RumourState } from "../shared/rumours";
import { type StepHero } from "./questSteps";
import { award } from "./titles";

/**
 * Tavern Rumours (shared/rumours.ts has the rumours and the numbers): Mags' three daily side quests, one at a time per
 * hero. The steps are ordinary QuestSteps (use, reach, an `own` kill) but belong to no chain (CHAINS is append-only and
 * saved by index; rumours change every day), so this module runs them itself with the same rules as TownRoom's chain
 * code (USE_RANGE slack, the quest monster raised near its spot and brought back if lost, only the hero's own one
 * counting). State is the hero's plain Player.rumour, saved; TownRoom calls in through the small RumourHost below.
 */

/** The parts of a hero this module reads (TownRoom's Player). */
export type RumourHero = StepHero & { name: string; level: number; rumour?: RumourState };
/** The parts of a monster this module reads. */
export interface RumourMob { dead: boolean }

export interface RumourHost {
  heroes(): Iterable<[string, RumourHero]>;
  hero(pid: string): RumourHero | undefined;
  mob(id: string): RumourMob | undefined;
  /** A rumour's quest monster for this hero (TownRoom summonFused, tagged RUMOURS.tag), gone after lifeMs if nobody kills it. Its id. */
  summon(pid: string, sm: Summon, lifeMs: number): string;
  removeMob(id: string): void;
  send(pid: string, type: string, msg: unknown): void;
  /** Pay a hero: gold, and a rune into the bag (on the ground at their feet if it is full). */
  pay(pid: string, gold: number, rune?: string): void;
  /** Time of day 0..1 (TownRoom's worldDayFrac, so DAY_TIME works): `night` reach steps wait for dark. */
  dayFrac(now: number): number;
  /** Write the hero's save now (a finished rumour is not done twice after a crash). */
  save(pid: string): void;
}

/** How close to Mags a hero must stand to take a rumour (the same slack as talking to any NPC in TownRoom). */
const GIVER_R = TALK_RANGE * 1.5;
const USE_R = USE_RANGE * 1.5;
/** "rumour" end reasons: finished, dropped, gone stale at UTC midnight. */
type End = { why: "done"; gold: number; rune?: string; title?: string; outro: string; name: string } | { why: "drop" | "stale"; name: string };

export class Rumours {
  /** The ambusher raised for each hero on a `missing` kill step, and when one may rise again. Transient. */
  private amb = new Map<string, string>();
  private ambAt = new Map<string, number>();
  /** Heroes standing by Mags (they get the offers when they walk up), and heroes who just joined (state on the next scan). */
  private near = new Set<string>();
  private fresh = new Set<string>();
  private scanAt = 0;

  constructor(private h: RumourHost) {}

  /** A hero joined: their state (stale day already reset on load) goes out on the next scan, once their client listens. */
  join(pid: string) { this.fresh.add(pid); }

  /** A hero left: their ambusher goes with them; the state stays on the hero (saved). */
  leave(pid: string) {
    this.unAmbush(pid);
    this.ambAt.delete(pid); this.near.delete(pid); this.fresh.delete(pid);
  }

  /** A few times a second: the day's rollover, walking up to Mags, reach steps, the ambusher of a kill step. */
  tick(now: number) {
    if (now < this.scanAt) return;
    this.scanAt = now + RUMOURS.scanMs;
    const today = rumourDay(now), mags = npcById(RUMOUR_GIVER);
    for (const [pid, p] of this.h.heroes()) {
      const st = this.state(p, today, pid);
      const by = !!mags && !p.dead && Math.hypot(mags.x - p.x, mags.y - p.y) <= GIVER_R;
      if (by && !this.near.has(pid)) { this.near.add(pid); this.fresh.add(pid); } else if (!by) this.near.delete(pid);
      if (this.fresh.delete(pid)) this.send(pid, p);
      const cur = rumourStep(st);
      if (!cur || p.dead && cur.s.type !== "kill") continue;
      const s = cur.s;
      if (s.type === "reach" && Math.hypot(s.at!.x - p.x, s.at!.y - p.y) <= s.at!.r && (!s.night || isDark(this.h.dayFrac(now)))) this.advance(pid, p, st);
      else if (s.type === "kill") this.tickAmbush(pid, p, s.summon!, now);
    }
  }

  /**
   * "rumour" from the client: {take: 0..2} by Mags, {drop: true} anywhere, {} = send me my state. Anything else is
   * ignored. TownRoom has already rate-limited it.
   */
  msg(pid: string, m: unknown) {
    const p = this.h.hero(pid);
    if (!p || (m !== undefined && m !== null && typeof m !== "object")) return;
    const o = (m ?? {}) as { take?: unknown; drop?: unknown };
    if (o.take !== undefined && (typeof o.take !== "number" || !Number.isInteger(o.take) || o.take < 0 || o.take >= RUMOURS.offers)) return;
    if (o.drop !== undefined && o.drop !== true) return;
    const st = this.state(p, rumourDay(Date.now()), pid);
    if (o.drop) {
      const cur = rumourStep(st);
      if (!cur) return this.send(pid, p);
      this.clear(pid, st);
      return this.send(pid, p, { why: "drop", name: cur.r.title });
    }
    if (typeof o.take === "number") this.take(pid, p, st, o.take);
    this.send(pid, p);
  }

  /** E on an object: true when it is one of the hero's rumour objects (TownRoom does nothing more with it). */
  use(pid: string, oid: string): boolean {
    const p = this.h.hero(pid);
    if (!p || p.dead || !/^r\d+z\d+o\d+$/.test(oid)) return false;
    const st = this.state(p, rumourDay(Date.now()), pid), cur = rumourStep(st);
    if (!cur || cur.s.type !== "use") return true; // a rumour object, but not one to use now: nothing happens
    const objs = cur.s.objects!, i = objs.findIndex((o) => o.id === oid), o = objs[i], count = st.count ?? 0;
    if (!o || count & (1 << i) || Math.hypot(o.x - p.x, o.y - p.y) > USE_R) return true;
    this.h.send(pid, "questuse", { id: o.id });
    st.count = count | (1 << i);
    if (stepProgress(cur.s, st.count) >= stepGoal(cur.s)) this.advance(pid, p, st);
    else this.send(pid, p);
    return true;
  }

  /** A monster fell to this hero: their own ambusher ends the kill step (a summon's kills never get here; nor do anyone else's). */
  kill(pid: string, mobId: string) {
    if (this.amb.get(pid) !== mobId) return;
    this.amb.delete(pid);
    const p = this.h.hero(pid), st = p?.rumour, cur = rumourStep(st);
    if (p && st && cur?.s.type === "kill") this.advance(pid, p, st);
  }

  // ---- inside ----

  /** The hero's state for today: made if missing, started over (and their client told) if it is from another day. */
  private state(p: RumourHero, today: number, pid: string): RumourState {
    const st = p.rumour;
    if (st && st.day === today) return st;
    const was = rumourStep(st);
    p.rumour = cleanRumour(st, today, p.level);
    if (was) { this.unAmbush(pid); this.send(pid, p, { why: "stale", name: was.r.title }); }
    return p.rumour;
  }

  /** Take offer i: by Mags, after the guided first quest, with none under way and this one not done today. */
  private take(pid: string, p: RumourHero, st: RumourState, i: number) {
    const mags = npcById(RUMOUR_GIVER);
    if (p.dead || !mags || Math.hypot(mags.x - p.x, mags.y - p.y) > GIVER_R || !tutorialDone(p)) return;
    if (st.i !== undefined || st.done & (1 << i) || !rumoursFor(st.day, st.lv)[i]) return;
    st.i = i; st.stage = 1; st.count = 0;
    this.ambAt.delete(pid);
  }

  /** On to the next step; past the last one the rumour pays out. */
  private advance(pid: string, p: RumourHero, st: RumourState) {
    const cur = rumourStep(st)!;
    this.unAmbush(pid);
    this.ambAt.delete(pid); // a kill step's ambusher rises as soon as its hero is near
    st.count = 0;
    if (st.stage! < cur.r.steps.length) { st.stage!++; this.send(pid, p); return; }
    this.finish(pid, p, st, cur.r);
  }

  /** Done: gold, maybe a rune, no XP (RUMOURS); the offer can't be taken again today; the title at RUMOURS.titleAt. */
  private finish(pid: string, p: RumourHero, st: RumourState, r: Rumour) {
    const rune = Math.random() < r.reward.rune ? rollRune(r.level) : undefined;
    this.h.pay(pid, r.reward.gold, rune);
    st.done |= 1 << r.i; st.n++;
    this.clear(pid, st);
    let title: string | undefined;
    if (st.n === RUMOURS.titleAt && RUMOUR_TITLE > 0) { award(p, RUMOUR_TITLE); title = "Rumour-Chaser"; } // shown only if no title is (server/titles.ts)
    this.send(pid, p, { why: "done", name: r.title, gold: r.reward.gold, outro: r.outro, ...(rune ? { rune } : {}), ...(title ? { title } : {}) });
    this.h.save(pid);
  }

  private clear(pid: string, st: RumourState) {
    this.unAmbush(pid);
    this.ambAt.delete(pid);
    delete st.i; delete st.stage; delete st.count;
  }

  /** The kill step's monster: up when its hero comes near its spot, gone if they wander far off, back a while after it is lost. */
  private tickAmbush(pid: string, p: RumourHero, sm: Summon, now: number) {
    const id = this.amb.get(pid), m = id ? this.h.mob(id) : undefined, d = Math.hypot(sm.x - p.x, sm.y - p.y);
    if (m && !m.dead) { if (d > RUMOURS.leashR) this.unAmbush(pid); return; }
    if (id) this.amb.delete(pid); // killed by someone else, or sunk back
    if (p.dead || d > RUMOURS.summonR || now < (this.ambAt.get(pid) ?? 0)) return;
    this.ambAt.set(pid, now + RUMOURS.resummonMs);
    this.amb.set(pid, this.h.summon(pid, sm, RUMOURS.ambushLifeMs));
  }

  private unAmbush(pid: string) {
    const id = this.amb.get(pid);
    if (id) this.h.removeMob(id);
    this.amb.delete(pid);
  }

  /**
   * "rumour" {day, lv, offers: [{i, kind, title, text, zone, level, reward, done}], done, n, active?: {i, stage, count,
   * goal, obj, night?}, end?}: today's offers (the client builds their objects with rumoursFor(day, lv)), the one under
   * way, and why the last one ended.
   */
  private send(pid: string, p: RumourHero, end?: End) {
    const st = p.rumour;
    if (!st) return;
    const rs = rumoursFor(st.day, st.lv), cur = rumourStep(st);
    const offers = rs.map((r) => ({ i: r.i, kind: r.kind, title: r.title, text: r.text, zone: r.zone, level: r.level, reward: r.reward, done: !!(st.done & (1 << r.i)) }));
    const active = cur && {
      i: st.i!, stage: st.stage!, count: stepProgress(cur.s, st.count ?? 0), goal: stepGoal(cur.s), steps: cur.r.steps.length, obj: cur.s.obj, ...(cur.s.night ? { night: true } : {}),
    };
    this.h.send(pid, "rumour", { day: st.day, lv: st.lv, offers, done: st.done, n: st.n, ...(active ? { active } : {}), ...(end ? { end } : {}) });
  }
}
