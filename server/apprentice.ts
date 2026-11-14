import { npcById, TALK_RANGE } from "../shared/npcs";
import { cleanMentor, isRecruit, MENTOR, mentorNext, type MentorState } from "../shared/quests";
import { TITLES } from "../shared/cosmetics";
import { award, type TitleHero } from "./titles";

/**
 * The Apprentice (shared/quests.ts MENTOR has the numbers and the pure rules): veterans switch mentoring on with
 * Captain Hale; when a recruit in their group finishes their first own-boss step with the veteran standing by, the
 * recruit is paid and the veteran counts that recruit's account once (titles at MENTOR.titles). No XP. State is the
 * hero's plain Player.mentor (saved); TownRoom calls in through the small ApprenticeHost below.
 */

/** The parts of a hero this module reads (TownRoom's Player). */
export type MentorHero = TitleHero & { name: string; level: number; mentor?: MentorState };

export interface ApprenticeHost {
  hero(pid: string): MentorHero | undefined;
  /** The hero's group with them in it ([pid] alone). */
  group(pid: string): string[];
  /** b is alive and in the same place as a (shared/party.ts together). */
  together(a: string, b: string): boolean;
  send(pid: string, type: string, msg: unknown): void;
  /** A line in the hero's chat from the game. */
  note(pid: string, text: string): void;
  /** Pay a hero gold and potions (sized to their level; what the bag can't hold lands at their feet). */
  reward(pid: string, gold: number, potions: number): void;
  /** Write the hero's save now (a payout is not lost to a crash). */
  save(pid: string): void;
}

/** How close to Hale a hero must stand to switch mentoring (the same slack as talking to any NPC in TownRoom). */
const HALE_R = TALK_RANGE * 1.5;
/** A joining hero's state goes out after this, once their client listens. */
const JOIN_MS = 1000;

export class Apprentice {
  /** Heroes who just joined -> when to send them their state. Transient. */
  private fresh = new Map<string, number>();

  constructor(private h: ApprenticeHost) {}

  join(pid: string, now = Date.now()) { this.fresh.set(pid, now + JOIN_MS); }
  leave(pid: string) { this.fresh.delete(pid); }

  /** Every tick: the state of heroes who joined a moment ago (nothing else runs on time). */
  tick(now: number) {
    if (!this.fresh.size) return;
    for (const [pid, at] of this.fresh) {
      if (now < at) continue;
      this.fresh.delete(pid);
      const p = this.h.hero(pid);
      if (p) this.send(pid, p);
    }
  }

  /**
   * "mentor" from the client: {on: boolean} by Hale switches mentoring (on needs MENTOR.minLevel), {} = send me my
   * state. Anything else is ignored; a refused switch just resends the state. TownRoom has already rate-limited it.
   */
  msg(pid: string, m: unknown) {
    const p = this.h.hero(pid);
    if (!p || (m !== undefined && m !== null && typeof m !== "object")) return;
    const on = ((m ?? {}) as { on?: unknown }).on;
    if (on !== undefined && typeof on !== "boolean") return;
    if (typeof on === "boolean" && this.byHale(p) && (!on || p.level >= MENTOR.minLevel)) {
      const st = p.mentor ?? { on: false, n: 0, names: [] };
      p.mentor = { ...st, on };
    }
    this.send(pid, p);
  }

  /**
   * The recruit `pid` is about to finish an own-boss step (TownRoom questKill, before the step moves on, so this is
   * still their first): every mentoring veteran of their group standing with them counts it; the recruit is paid once.
   */
  bossDown(pid: string) {
    const r = this.h.hero(pid);
    if (!r) return;
    const vets: [string, MentorHero][] = [];
    for (const vid of this.h.group(pid)) {
      const v = vid === pid ? undefined : this.h.hero(vid);
      if (v?.mentor?.on && v.name.toLowerCase() !== r.name.toLowerCase() && isRecruit(v, r) && this.h.together(pid, vid)) vets.push([vid, v]);
    }
    if (!vets.length) return;
    this.h.reward(pid, MENTOR.gold, MENTOR.potions);
    const under = vets.map(([, v]) => v.name).join(" and ");
    for (const [vid, v] of vets) {
      const title = this.count(v, r.name);
      this.h.note(vid, `Captain Hale's word: ${r.name} fought their first boss under ${v.name}'s eye.`);
      this.send(vid, v, { recruit: r.name, ...(title ? { title } : {}) });
      this.h.save(vid);
    }
    this.h.note(pid, `Captain Hale's word: ${r.name} fought their first boss under ${under}'s eye. The watch sends ${MENTOR.gold} gold and ${MENTOR.potions} potions.`);
    for (const id of [pid, ...vets.map(([vid]) => vid)]) this.h.send(id, "sfx", { ev: "graveright", x: Math.round(r.x), y: Math.round(r.y) }); // a warm chime and light on the recruit
    this.h.save(pid);
  }

  // ---- inside ----

  private byHale(p: MentorHero) {
    const hale = npcById(MENTOR.npc);
    return !p.dead && !!hale && Math.hypot(hale.x - p.x, hale.y - p.y) <= HALE_R;
  }

  /** One more recruit for the veteran, if this account is new to them: the title it brings (its name), if any. */
  private count(v: MentorHero, name: string): string | undefined {
    const st = cleanMentor(v.mentor) ?? { on: true, n: 0, names: [] }, key = name.toLowerCase();
    if (st.names.includes(key)) return undefined;
    st.names.push(key);
    if (st.names.length > MENTOR.names) st.names.splice(0, st.names.length - MENTOR.names);
    st.n++;
    v.mentor = st;
    const t = MENTOR.titles.find((x) => x.at === st.n);
    return t && award(v, t.title) ? TITLES[t.title] : undefined;
  }

  /** "mentor" {on, n, next?: {at, title}, recruit?, title?}: the switch, recruits counted, the next title; a new recruit and title when one came in. */
  private send(pid: string, p: MentorHero, extra?: { recruit: string; title?: string }) {
    const st = p.mentor, n = st?.n ?? 0, nx = mentorNext(n);
    this.h.send(pid, "mentor", { on: !!st?.on, n, ...(nx ? { next: { at: nx.at, title: TITLES[nx.title] } } : {}), ...(extra ?? {}) });
  }
}
