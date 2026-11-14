import { CHAINS, questDef, questStep, USE_RANGE, npcPresent, type Quester, type QuestState, type QuestStep, type Summon } from "../shared/quests";
import { npcById, TALK_RANGE } from "../shared/npcs";
import { CARRY, coverAt, HOLD, isDark, lightDrain, META, metaOf, type MetaKey, QSTATE_MS, sayFor, stealthMult, SYNC, syncOk, UNSEEN, wetAt, withChoice } from "../shared/questSteps";
import { dayFrac as clockDayFrac } from "../shared/daynight";
import { isSafeZone, isSolidAt } from "../shared/map";
import { noMobsAt } from "../shared/spawns";

/**
 * The quest steps that need more than a count (shared/questSteps.ts has the specs and pure rules): choices, NPCs heard
 * in any order, picking the right one of several objects, and later carrying, holding, going unseen and turning seals
 * together. TownRoom calls in at a few points (a stage change, the "quest" and "use" messages, a hero leaving) through
 * the small StepHost below, so the room stays in charge of progress, rewards and monsters.
 */

/** The parts of a hero this module reads (TownRoom's Player). */
export type StepHero = Quester & {
  x: number; y: number; dead: boolean; arcs: { get(k: string): number | undefined; set(k: string, v: number): unknown; delete(k: string): unknown };
  /** Carrying something (carry): no skills, no ranged shots (TownRoom cast / useSlot / fireRanged); basic attacks still work */
  qlock?: boolean;
  /** Blob aggro range multiplier on this hero (TownRoom pickTarget); 1 = normal */
  lureMul?: number;
  /** Aggro range multiplier on this hero for every monster (TownRoom pickTarget): below 1 while going unseen; 1 = normal */
  aggroMul?: number;
};
/** The parts of a monster this module reads. */
export interface StepMob { x: number; y: number; dead: boolean; target: string }

export interface StepHost {
  player(pid: string): StepHero | undefined;
  qs(p: StepHero, c: number): QuestState;
  /** The room's own nextStep (reward, next quest, auto start). */
  nextStep(pid: string, c: number): void;
  /** Put the hero on stage `stage` of their current quest (count 0 unless given) and tell their client. */
  setStage(pid: string, c: number, stage: number, count?: number): void;
  /**
   * A quest monster for this hero (summonFused); tag = its summonChain (-1 = an ambush that outlives the step), lifeMs = gone
   * after that, wave = a hold wave monster (marked so it counts for nothing else, e.g. the Tide).
   */
  summon(pid: string, sm: Summon, tag: number, home?: { x: number; y: number }, lifeMs?: number, wave?: boolean): string;
  removeMob(id: string): void;
  send(pid: string, type: string, msg: unknown): void;
  broadcast(type: string, msg: unknown): void;
  /** Every hero in the room (carry / hold look for who walked onto their step). */
  forEachHero?(fn: (pid: string, p: StepHero) => void): void;
  /** A monster by id (hold: its wave monsters). */
  mob?(id: string): StepMob | undefined;
  /** The hero's group with them in it ([pid] alone), and whether two heroes count as the same place (shared/party.ts together). */
  group?(pid: string): string[];
  together?(a: string, b: string): boolean;
  /** Time of day 0..1 (TownRoom's worldDayFrac, so DAY_TIME works). */
  dayFrac?(now: number): number;
  /** Monsters with |dx|, |dy| <= r of (x, y) (unseen: who has the hero as their target). */
  mobsNear?(x: number, y: number, r: number): [string, StepMob][];
  /** The monster stops fighting this hero and forgets its hate for them (TownRoom forgetHero, as when a hero slips into the Void). */
  forget?(mobId: string, pid: string): void;
  /**
   * Put the hero at (x, y) with the same client snap as a portal ("travel"). False = not moved: a hero carrying a
   * lantern is never moved (TownRoom lanternHeld), like every other way of jumping across the map.
   */
  warp?(pid: string, x: number, y: number): boolean;
  /** Where the hero's living summons stand (golems, pets, wisps): sync lets one at the other seal turn it. */
  summonsOf?(pid: string): { x: number; y: number }[];
}

/** A carried light (carry step): one per group on the step. Transient: a rejoin finds it back at its spot (count 0). */
interface Lantern { c: number; s: QuestStep; owners: string[]; holder: string; last: string; x: number; y: number; light: number; dim: boolean; sentAt: number; sig: string }
/** A hold run (hold step): one per group on the step, its wave monsters, the guarded NPC's HP. Transient. */
interface HoldRun { c: number; s: QuestStep; owners: string[]; lead: string; start: number; hp: number; mobs: string[]; nextWave: number; nextHurt: number; outSince: number; sentAt: number; sig: string }
/** A hero on an unseen step (one at a time): hidden (armed) from a checkpoint until seen, hurt or at the last one. Transient. */
interface Sneak { c: number; s: QuestStep; armed: boolean; seen: boolean; rearmAt: number; cover: boolean; dark: boolean; sentAt: number; sig: string }
/** A hero's seal turns on a sync step: when each seal last turned for them (0 = not). Transient. */
interface Turns { c: number; s: QuestStep; t: [number, number]; sentAt: number; sig: string }
/** Chains with a carry or hold step: the only ones the per-tick scan looks at. */
const TIMED = CHAINS.flatMap((ch, c) => ch.quests.some((d) => d.steps.some((s) => s.carry || s.hold)) ? [c] : []);
/** Chains with an unseen step (the scan looks for heroes reaching a checkpoint). */
const SNEAKY = CHAINS.flatMap((ch, c) => ch.quests.some((d) => d.steps.some((s) => s.unseen)) ? [c] : []);
const rint = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

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

  /** Lanterns being carried or lying about, hold runs under way (few: one per group on the step). */
  private lanterns: Lantern[] = [];
  private holds: HoldRun[] = [];
  /** Heroes whose hold run just ended without success: they walk out of the area before it can start again. */
  private holdOut = new Set<string>();
  private scanAt = 0;

  /** Heroes on an unseen step, and heroes with seal turns on a sync step, by hero id. */
  private sneaks = new Map<string, Sneak>();
  private turns = new Map<string, Turns>();

  /** Per-tick work of the timed steps: carried light, hold runs, hidden heroes, seal windows; a few times a second, who walked onto one. */
  tick(now: number, dtMs: number) {
    if (now >= this.scanAt) { this.scanAt = now + QSTATE_MS; this.scan(); this.scanSneaks(now); }
    for (const l of [...this.lanterns]) this.tickLantern(l, now, dtMs / 1000);
    for (const r of [...this.holds]) this.tickHold(r, now);
    for (const [pid, k] of [...this.sneaks]) this.tickSneak(pid, k, now);
    for (const [pid, t] of [...this.turns]) this.tickTurns(pid, t, now);
  }

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

  /** E on an object a step of this module owns (pick candidates, a carry step's thing to take up, sync seals). True = handled here. */
  use(pid: string, oid: string): boolean {
    const p = this.h.player(pid);
    if (!p || p.dead) return false;
    for (let c = 0; c < CHAINS.length; c++) {
      const q = this.h.qs(p, c), s = questStep(q);
      if (s?.type === "carry" && s.carry!.take.id === oid) { this.takeUp(pid, p, c, s); return true; }
      if (s?.type === "sync" && s.sync!.seals.some((o) => o.id === oid)) { this.turn(pid, p, c, s, oid); return true; }
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

  /** "qdrop": the hero puts down what they carry, where they stand (only its holder can). */
  drop(pid: string) {
    const l = this.lanterns.find((x) => x.holder === pid), p = this.h.player(pid);
    if (!l || !p) return;
    this.putDown(l, p);
    this.sendLantern(l, Date.now(), true);
  }
  /** The hero took damage: going unseen, they have been seen (handled on the next tick, out of the damage code). */
  hurt(pid: string) {
    const k = this.sneaks.get(pid);
    if (k?.armed) k.seen = true;
  }
  /**
   * The hero died: a carried light falls where they fell; a hold run with nobody else alive in it fails; a hidden hero
   * is no longer hidden (they come back in town as everyone does; the checkpoint count is kept); their seal turns go.
   */
  died(pid: string) {
    this.drop(pid);
    const k = this.sneaks.get(pid);
    if (k) this.disarm(pid, k, Date.now(), "dead");
    this.turns.delete(pid);
    for (const r of [...this.holds]) {
      if (!r.owners.includes(pid)) continue;
      if (!r.owners.some((o) => o !== pid && this.inHold(r, o))) this.endHold(r, "fail");
    }
  }

  /** The hero left: their ambushes go with them; a light they held stays for a partner on the step, a hold run without them ends. */
  leave(pid: string) {
    for (const id of this.ambush.get(pid) ?? []) this.h.removeMob(id);
    this.ambush.delete(pid);
    this.holdOut.delete(pid);
    this.sneaks.delete(pid); // the checkpoint count is saved; hidden is not
    this.turns.delete(pid);
    for (const l of [...this.lanterns]) {
      if (l.holder === pid) { const p = this.h.player(pid); if (p) this.putDown(l, p); else l.holder = ""; }
      l.owners = l.owners.filter((o) => o !== pid);
      if (!l.owners.length) this.dropLantern(l); else this.sendLantern(l, Date.now(), true);
    }
    for (const r of [...this.holds]) {
      r.owners = r.owners.filter((o) => o !== pid);
      if (!r.owners.length) this.endHold(r, "reset");
    }
  }

  // ---- carry: take a light somewhere before it goes out ----

  /** E on the carry step's thing: take it up from its spot, or from the ground where it (or a group member) left it. */
  private takeUp(pid: string, p: StepHero, c: number, s: QuestStep) {
    if (p.qlock) return; // already carrying
    const spec = s.carry!;
    let l = this.lanterns.find((x) => x.c === c && x.owners.includes(pid));
    if (!l) l = this.groupOf(pid).map((o) => this.lanterns.find((x) => x.c === c && x.s === s && x.owners.includes(o))).find((x) => !!x);
    if (l) {
      if (l.holder || Math.hypot(l.x - p.x, l.y - p.y) > CARRY.pickR) return; // someone has it, or it lies elsewhere
      if (!l.owners.includes(pid)) l.owners.push(pid);
    } else {
      if (Math.hypot(spec.take.x - p.x, spec.take.y - p.y) > USE_R) return;
      l = { c, s, owners: [pid], holder: "", last: pid, x: spec.take.x, y: spec.take.y, light: spec.light, dim: false, sentAt: 0, sig: "" };
      this.lanterns.push(l);
    }
    if (l.last !== pid) this.h.broadcast("sfx", { ev: "lanternpass", id: pid, from: l.last, x: Math.round(l.x), y: Math.round(l.y) });
    l.holder = l.last = pid;
    p.qlock = true; p.lureMul = spec.lure;
    const q = this.h.qs(p, c);
    if (!q.questCount) this.h.setStage(pid, c, q.questStage, 1); // count 1 = taken from its spot
    this.sendLantern(l, Date.now(), true);
  }

  private putDown(l: Lantern, p: StepHero) {
    l.x = p.x; l.y = p.y; l.holder = "";
    this.release(p);
  }
  private release(p: StepHero) { p.qlock = false; p.lureMul = 1; }
  private dropLantern(l: Lantern) {
    const hp = l.holder ? this.h.player(l.holder) : undefined;
    if (hp) this.release(hp);
    l.holder = "";
    this.lanterns = this.lanterns.filter((x) => x !== l);
  }

  private tickLantern(l: Lantern, now: number, dtS: number) {
    const spec = l.s.carry!;
    l.owners = l.owners.filter((o) => this.onStep(o, l.c, l.s));
    if (l.holder && !l.owners.includes(l.holder)) { const hp = this.h.player(l.holder); if (hp) this.putDown(l, hp); else l.holder = ""; }
    if (!l.owners.length) return this.dropLantern(l);
    const hp = l.holder ? this.h.player(l.holder) : undefined;
    if (hp) { l.x = hp.x; l.y = hp.y; }
    l.light -= lightDrain(spec, { water: wetAt(l.x, l.y), dark: isDark(this.dayFrac(now)), ground: !hp }, dtS);
    const at = { x: Math.round(l.x), y: Math.round(l.y) };
    if (!l.dim && l.light <= spec.light * CARRY.dimAt) { l.dim = true; this.h.broadcast("sfx", { ev: "lanterndim", id: l.holder || l.last, ...at }); }
    if (l.light <= 0) {
      // out: it lights again back at its spot, and everyone on the step starts the carry over
      this.dropLantern(l);
      this.h.broadcast("sfx", { ev: "lanternout", id: l.last, ...at });
      this.sendLantern({ ...l, x: spec.take.x, y: spec.take.y, light: spec.light, sig: "" }, now, true, "out");
      for (const o of l.owners) { const p = this.h.player(o); if (p) this.h.setStage(o, l.c, this.h.qs(p, l.c).questStage, 0); }
      return;
    }
    if (hp && Math.hypot(l.x - spec.to.x, l.y - spec.to.y) <= spec.to.r) {
      // delivered: the step is done for the holder and every group member on it with them
      const holder = l.holder, who = new Set([holder, ...l.owners, ...this.groupOf(holder)]);
      this.dropLantern(l);
      this.sendLantern(l, now, true, "done");
      for (const o of who) if (this.onStep(o, l.c, l.s) && (o === holder || this.together(holder, o))) this.h.nextStep(o, l.c);
      return;
    }
    this.sendLantern(l, now);
  }

  /**
   * "qstate" {chain, k: "carry", holder, x, y, light, max, end?} to the heroes on the step, at most every QSTATE_MS and only
   * on change; `end` ("out" / "done") is the last one of this lantern.
   */
  private sendLantern(l: Lantern, now: number, force = false, end?: "out" | "done") {
    if (!force && now - l.sentAt < QSTATE_MS) return;
    const light = Math.max(0, Math.ceil(l.light)), x = Math.round(l.x), y = Math.round(l.y);
    const sig = l.holder ? `${l.holder}|${light}` : `|${x}|${y}|${light}`; // held, it moves with its holder: only light and holder matter
    if (!force && sig === l.sig) return;
    l.sig = sig; l.sentAt = now;
    const msg = { chain: l.c, k: "carry", holder: l.holder, x, y, light, max: l.s.carry!.light, ...(end ? { end } : {}) };
    for (const o of new Set([...l.owners, ...this.groupOf(l.owners[0] ?? l.last)])) if (this.onStep(o, l.c, l.s)) this.h.send(o, "qstate", msg);
  }

  // ---- hold: keep someone alive in a spot while waves come ----

  /** Who walked onto a timed step: a carry count left from before a rejoin goes back to 0; a hero entering a hold area starts (or joins) a run. */
  private scan() {
    this.h.forEachHero?.((pid, p) => {
      for (const c of TIMED) {
        const q = this.h.qs(p, c), s = questStep(q);
        if (s?.type === "carry" && q.questCount && !this.lanterns.some((l) => l.c === c && l.owners.includes(pid))) this.h.setStage(pid, c, q.questStage, 0);
        if (s?.type !== "hold") continue;
        const a = s.hold!.at, inside = !p.dead && Math.hypot(p.x - a.x, p.y - a.y) <= a.r;
        if (!inside) { this.holdOut.delete(pid); continue; }
        if (this.holdOut.has(pid) || this.holds.some((r) => r.c === c && r.owners.includes(pid))) continue;
        const mate = this.groupOf(pid).map((o) => this.holds.find((r) => r.c === c && r.s === s && r.owners.includes(o))).find((r) => !!r);
        if (mate) { mate.owners.push(pid); mate.sig = ""; continue; }
        const now = Date.now();
        this.holds.push({ c, s, owners: [pid], lead: pid, start: now, hp: s.hold!.npcHp, mobs: [], nextWave: now + 1500, nextHurt: now + HOLD.hurtMs, outSince: 0, sentAt: 0, sig: "" });
      }
    });
  }

  private inHold(r: HoldRun, pid: string) {
    const p = this.h.player(pid), a = r.s.hold!.at;
    return !!p && !p.dead && Math.hypot(p.x - a.x, p.y - a.y) <= a.r;
  }

  private tickHold(r: HoldRun, now: number) {
    const spec = r.s.hold!, npc = npcById(spec.npc) ?? spec.at;
    r.owners = r.owners.filter((o) => this.onStep(o, r.c, r.s));
    if (!r.owners.length) return this.endHold(r, "reset");
    if (!r.owners.includes(r.lead)) r.lead = r.owners[0];
    r.mobs = r.mobs.filter((id) => { const m = this.h.mob?.(id); return !!m && !m.dead; });
    const inside = r.owners.filter((o) => this.inHold(r, o));
    if (inside.length) r.outSince = 0;
    else if (!r.outSince) r.outSince = now;
    else if (now - r.outSince > spec.leaveMs) return this.endHold(r, "reset");
    if (now - r.start >= spec.ms) {
      // held: done for everyone in the run who is there (or with someone who is)
      const won = r.owners.filter((o) => inside.includes(o) || inside.some((i) => this.together(i, o)));
      this.endHold(r, "done");
      for (const o of won) this.h.nextStep(o, r.c);
      return;
    }
    if (now >= r.nextWave) { r.nextWave = now + spec.waves.everyMs; this.wave(r, npc); }
    if (now >= r.nextHurt) {
      r.nextHurt = now + HOLD.hurtMs;
      let n = 0;
      for (const id of r.mobs) { const m = this.h.mob!(id)!; if (!m.target && Math.hypot(m.x - npc.x, m.y - npc.y) <= HOLD.reach) n++; }
      if (n) {
        r.hp = Math.max(0, r.hp - n * spec.npcDmg);
        this.h.broadcast("sfx", { ev: "odohurt", id: r.lead, npc: spec.npc, x: Math.round(npc.x), y: Math.round(npc.y), hp: r.hp });
        if (r.hp <= 0) return this.endHold(r, "fail");
      }
    }
    this.sendHold(r, now);
  }

  /** A wave: n[0]..n[1] monsters at the edge of the area, walking in on the guarded NPC (their home), within the caps. */
  private wave(r: HoldRun, npc: { x: number; y: number }) {
    const spec = r.s.hold!, W = spec.waves, a = spec.at;
    const total = this.holds.reduce((t, x) => t + x.mobs.length, 0);
    const n = Math.min(rint(W.n[0], W.n[1]), spec.maxAlive - r.mobs.length, HOLD.serverCap - total);
    let made = 0;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 8; k++) {
        const ang = Math.random() * Math.PI * 2, d = a.r * (0.75 + Math.random() * 0.2);
        const x = npc.x + Math.cos(ang) * d, y = npc.y + Math.sin(ang) * d;
        if (isSolidAt(x, y) || isSafeZone(x, y) || noMobsAt(x, y)) continue;
        const kind = W.kinds[Math.floor(Math.random() * W.kinds.length)];
        r.mobs.push(this.h.summon(r.lead, { parts: [kind], level: rint(W.level[0], W.level[1]), x, y }, r.c, { x: npc.x, y: npc.y }, undefined, true));
        made++;
        break;
      }
    }
    if (made) this.h.broadcast("sfx", { ev: "wavehorn", id: r.lead, x: Math.round(npc.x), y: Math.round(npc.y), n: made });
  }

  /** A run is over: its waves go; "fail" / "reset" heroes still standing in the area must walk out before it starts again. */
  private endHold(r: HoldRun, end: "done" | "fail" | "reset") {
    this.holds = this.holds.filter((x) => x !== r);
    for (const id of r.mobs) this.h.removeMob(id);
    const spec = r.s.hold!;
    for (const o of r.owners) {
      if (end !== "done") this.holdOut.add(o);
      this.h.send(o, "qstate", { chain: r.c, k: "hold", t: end === "done" ? 0 : spec.ms, hp: end === "done" ? r.hp : spec.npcHp, max: spec.npcHp, on: false, end });
    }
  }

  /** "qstate" {chain, k: "hold", t (ms left), hp, max, on: true} to the run's heroes, at most every QSTATE_MS and only on change. */
  private sendHold(r: HoldRun, now: number) {
    if (now - r.sentAt < QSTATE_MS) return;
    const spec = r.s.hold!, t = Math.max(0, spec.ms - (now - r.start)), sig = `${Math.ceil(t / 1000)}|${r.hp}|${r.owners.length}`;
    if (sig === r.sig) return;
    r.sig = sig; r.sentAt = now;
    const msg = { chain: r.c, k: "hold", t, hp: r.hp, max: spec.npcHp, on: true };
    for (const o of r.owners) this.h.send(o, "qstate", msg);
  }

  // ---- unseen: walk the checkpoints without a monster taking you for its target ----

  /** Who stands at a checkpoint on an unseen step: their sneak is made, and they hide there (arm) when nothing is on them. */
  private scanSneaks(now: number) {
    this.h.forEachHero?.((pid, p) => {
      for (const c of SNEAKY) {
        const q = this.h.qs(p, c), s = questStep(q);
        if (s?.type !== "unseen") continue;
        let k = this.sneaks.get(pid);
        if (k && (k.c !== c || k.s !== s)) continue; // hiding on another chain's step
        if (!k) this.sneaks.set(pid, (k = { c, s, armed: false, seen: false, rearmAt: 0, cover: false, dark: false, sentAt: 0, sig: "" }));
        if (k.armed || p.dead || now < k.rearmAt) continue;
        const cps = s.unseen!.checkpoints, at = cps[Math.max(0, Math.min(q.questCount, cps.length) - 1)];
        if (Math.hypot(p.x - at.x, p.y - at.y) > at.r || this.targeted(pid, p).length) continue;
        k.armed = true; k.seen = false;
        this.sneakMul(p, k, now);
        if (!q.questCount) this.h.setStage(pid, c, q.questStage, 1); // count = checkpoints reached: the first one now
        this.sendSneak(pid, k, now, true);
        if (cps.length <= 1) { this.disarm(pid, k, now, "done"); this.h.nextStep(pid, c); }
      }
    });
  }

  /** Monsters near the hero that have them as their target (UNSEEN.box). */
  private targeted(pid: string, p: StepHero) {
    return (this.h.mobsNear?.(p.x, p.y, UNSEEN.box) ?? []).filter(([, m]) => !m.dead && m.target === pid);
  }

  /** The hero's aggro multiplier for where they stand now (night, cover). */
  private sneakMul(p: StepHero, k: Sneak, now: number) {
    k.dark = isDark(this.dayFrac(now)); k.cover = coverAt(p.x, p.y);
    p.aggroMul = stealthMult(k.s.unseen!, k.dark, k.cover);
  }

  private tickSneak(pid: string, k: Sneak, now: number) {
    const p = this.h.player(pid);
    if (!p) { this.sneaks.delete(pid); return; }
    if (!this.onStep(pid, k.c, k.s)) { this.sneaks.delete(pid); p.aggroMul = 1; this.sendSneak(pid, k, now, true, "off"); return; }
    if (!k.armed) return this.sendSneak(pid, k, now);
    const spec = k.s.unseen!, cps = spec.checkpoints;
    const seenBy = this.targeted(pid, p);
    if (k.seen || seenBy.length) return this.caught(pid, p, k, seenBy, now);
    this.sneakMul(p, k, now);
    // the next checkpoint reached unseen: one more on the count; the last one ends the step
    const q = this.h.qs(p, k.c), next = cps[q.questCount];
    if (next && Math.hypot(p.x - next.x, p.y - next.y) <= next.r) {
      if (q.questCount + 1 >= cps.length) { this.disarm(pid, k, now, "done"); this.h.nextStep(pid, k.c); return; }
      this.h.setStage(pid, k.c, q.questStage, q.questCount + 1);
      return this.sendSneak(pid, k, now, true);
    }
    this.sendSneak(pid, k, now);
  }

  /** Seen (targeted, or hurt): whoever saw them forgets them, and the hero is back at the last checkpoint reached, not hidden. */
  private caught(pid: string, p: StepHero, k: Sneak, seenBy: [string, StepMob][], now: number) {
    for (const [id] of seenBy) this.h.forget?.(id, pid);
    this.h.broadcast("sfx", { ev: "seen", id: pid, x: Math.round(p.x), y: Math.round(p.y) });
    const cps = k.s.unseen!.checkpoints, at = cps[Math.max(0, Math.min(this.h.qs(p, k.c).questCount, cps.length) - 1)];
    this.disarm(pid, k, now, "seen");
    k.rearmAt = now + UNSEEN.rearmMs;
    this.h.warp?.(pid, at.x, at.y);
  }

  private disarm(pid: string, k: Sneak, now: number, end: "seen" | "done" | "dead") {
    const p = this.h.player(pid);
    if (p) p.aggroMul = 1;
    k.armed = false; k.seen = false;
    this.sendSneak(pid, k, now, true, end);
    if (end === "done") this.sneaks.delete(pid);
  }

  /**
   * "qstate" {chain, k: "unseen", armed, cp (checkpoints reached), cps (how many), cover, dark, end?} to the hero, at most
   * every QSTATE_MS and only on change; `end` ("seen" / "done" / "dead" / "off") says why it stopped.
   */
  private sendSneak(pid: string, k: Sneak, now: number, force = false, end?: "seen" | "done" | "dead" | "off") {
    if (!force && now - k.sentAt < QSTATE_MS) return;
    const p = this.h.player(pid), cp = p ? this.h.qs(p, k.c).questCount : 0;
    const sig = `${+k.armed}|${cp}|${+k.cover}|${+k.dark}`;
    if (!force && sig === k.sig) return;
    k.sig = sig; k.sentAt = now;
    this.h.send(pid, "qstate", { chain: k.c, k: "unseen", armed: k.armed, cp, cps: k.s.unseen!.checkpoints.length, cover: k.cover, dark: k.dark, ...(end ? { end } : {}) });
  }

  // ---- sync: two seals turned together (a group member, or a summon, at the other one) ----

  /** E on a seal: it turns for this hero now (and the other one too if a summon of theirs stands by it); then see if both did in time. */
  private turn(pid: string, p: StepHero, c: number, s: QuestStep, oid: string) {
    const spec = s.sync!, i = spec.seals.findIndex((o) => o.id === oid), o = spec.seals[i], now = Date.now();
    if (Math.hypot(o.x - p.x, o.y - p.y) > USE_R) return; // too far: nothing happens
    let t = this.turns.get(pid);
    if (t && (t.c !== c || t.s !== s)) t = undefined;
    if (!t) this.turns.set(pid, (t = { c, s, t: [0, 0], sentAt: 0, sig: "" }));
    if (now - t.t[i] < SYNC.turnMs) return;
    t.t[i] = now;
    this.h.send(pid, "questuse", { id: o.id });
    this.h.broadcast("sfx", { ev: "sealturn", id: pid, x: Math.round(o.x), y: Math.round(o.y), seal: i });
    const j = 1 - i, other = spec.seals[j];
    if ((this.h.summonsOf?.(pid) ?? []).some((m) => Math.hypot(m.x - other.x, m.y - other.y) <= spec.summonReach)) {
      t.t[j] = now;
      this.h.broadcast("sfx", { ev: "sealturn", id: pid, x: Math.round(other.x), y: Math.round(other.y), seal: j });
    }
    const mates = this.sealMates(pid, c, s), win = this.sealWindow(spec, mates);
    // the other seal's latest turn by this hero or a group member here on the step
    const tj = Math.max(0, ...[pid, ...mates].map((m) => this.turnOf(m, c, s, j)));
    if (syncOk(now, tj, win)) {
      const who = [pid, ...mates];
      for (const m of who) this.turns.delete(m);
      this.h.broadcast("sfx", { ev: "sealsync", id: pid, x: Math.round((spec.seals[0].x + spec.seals[1].x) / 2), y: Math.round((spec.seals[0].y + spec.seals[1].y) / 2) });
      for (const m of who) { this.h.send(m, "qstate", { chain: c, k: "sync", turned: [-1, -1], window: win, end: "done" }); this.h.nextStep(m, c); }
      return;
    }
    // the partners here see the seal go round too (a record each, so they also hear when it goes back)
    for (const m of mates) { const mt = this.turns.get(m); if (mt && mt.c === c && mt.s === s) mt.sig = ""; else this.turns.set(m, { c, s, t: [0, 0], sentAt: 0, sig: "" }); }
    this.sendTurns(pid, c, s, now, true);
  }

  /** Group members on the same sync step who count as here with the hero (shared/party.ts together). */
  private sealMates(pid: string, c: number, s: QuestStep) {
    return this.groupOf(pid).filter((o) => o !== pid && this.onStep(o, c, s) && this.together(pid, o));
  }
  /** The window both seals must turn in: tight with a partner here to turn the other one, wider alone (time to walk it). */
  private sealWindow(spec: NonNullable<QuestStep["sync"]>, mates: string[]) { return mates.length ? spec.windowMs : spec.soloMs; }
  private turnOf(pid: string, c: number, s: QuestStep, i: number) {
    const t = this.turns.get(pid);
    return t && t.c === c && t.s === s ? t.t[i] : 0;
  }

  /** Turns run out after the window: the hero hears when a seal goes back (qstate on change); once nothing is live, forget them. */
  private tickTurns(pid: string, t: Turns, now: number) {
    if (!this.onStep(pid, t.c, t.s)) { this.turns.delete(pid); return; }
    this.sendTurns(pid, t.c, t.s, now);
    if (t.sig.startsWith("00|") && t.t.every((x) => !x || now - x > t.s.sync!.soloMs)) this.turns.delete(pid);
  }

  /**
   * "qstate" {chain, k: "sync", turned: [ms ago | -1, ms ago | -1], window} to a hero on the step: each seal's latest live turn
   * by them or a group member here (-1 = not turned, or older than the window), at most every QSTATE_MS and only on change.
   */
  private sendTurns(pid: string, c: number, s: QuestStep, now: number, force = false) {
    const t = this.turns.get(pid);
    if (t && !force && now - t.sentAt < QSTATE_MS) return;
    const mates = this.sealMates(pid, c, s), win = this.sealWindow(s.sync!, mates);
    const turned = [0, 1].map((i) => { const at = Math.max(0, ...[pid, ...mates].map((m) => this.turnOf(m, c, s, i))); return at && now - at <= win ? now - at : -1; });
    const sig = `${turned.map((x) => +(x >= 0)).join("")}|${win}`;
    if (t) { if (!force && sig === t.sig) return; t.sig = sig; t.sentAt = now; }
    this.h.send(pid, "qstate", { chain: c, k: "sync", turned, window: win });
  }

  // ---- shared bits ----

  private onStep(pid: string, c: number, s: QuestStep) {
    const p = this.h.player(pid);
    return !!p && questStep(this.h.qs(p, c)) === s;
  }
  private groupOf(pid: string) { return this.h.group?.(pid) ?? [pid]; }
  private together(a: string, b: string) { return a === b || (this.h.together?.(a, b) ?? false); }
  private dayFrac(now: number) { return this.h.dayFrac?.(now) ?? clockDayFrac(now); }

  private flags(p: StepHero) { return metaOf(p, META.flags); }

  private near(p: StepHero, npc: string) {
    const n = npcById(npc);
    return !!n && npcPresent(npc, p) && Math.hypot(n.x - p.x, n.y - p.y) <= TALK_R;
  }
}
