import { TILE, type MobKind } from "../shared/constants";
import { isBlob } from "../shared/quests";
import { rollRune } from "../shared/runes";
import { marchTime, TIDE, TIDE_GATE, TIDE_GOAL, TIDE_SPAWNS, tideHome, tideMarcher, tidePayouts, tideShares } from "../shared/tide";
import type { WorldState } from "./worldStore";

/**
 * The Gloam Tide (shared/tide.ts has the numbers and the pure rules): fills a world meter from blob kills, schedules the
 * march for the next dusk, sends it out wave by wave, counts who fought it near the west gate and pays them at the end.
 * TownRoom calls in at four points (tick, a monster's death, a hit on a marcher, "/tide" on dev servers) through the small
 * TideHost below; the marchers themselves are ordinary monsters with `tide` set (no merging, no dozing; TownRoom).
 *
 * The meter is one per world (server/worldStore.ts), but past maxClients there are several TownRooms, each with its own
 * Tide. One of them owns the event (`owner`: the first to need it, until its room closes): only it schedules, marches
 * and pays, so the marchers are in its room. Every room still counts its kills toward the meter, sends the meter to its
 * own Act 1 heroes, and hears the meter fill.
 */

/** The parts of a hero this module reads (TownRoom's Player). */
export interface TideHero { name: string; level: number; x: number; y: number; dead: boolean }
/** The parts of a monster this module reads (TownRoom's Mob). */
export interface TideMob { kind: string; dead: boolean; owner: string; summonFor: string; qwave: boolean; tide: boolean }

export interface TideHost {
  heroes(): Iterable<[string, TideHero]>;
  hero(pid: string): TideHero | undefined;
  mob(id: string): TideMob | undefined;
  /** A marcher: a plain monster of this kind and level at `at`, at home on `home`, titled TIDE.title, `tide` set. Its id. */
  spawn(kind: MobKind, level: number, at: { x: number; y: number }, home: { x: number; y: number }): string | undefined;
  removeMob(id: string): void;
  send(pid: string, type: string, msg: unknown): void;
  /** Whether the hero stands in Act 1 (the Tide is an Act 1 event: only they get its news). */
  act1(p: TideHero): boolean;
  /** Time of day 0..1 (TownRoom's worldDayFrac, so DAY_TIME works). */
  dayFrac(now: number): number;
  /** Pay a hero: gold, and a rune into the bag (on the ground at their feet if it is full). */
  pay(pid: string, gold: number, rune?: string): void;
  /** The saved world state (server/worldStore.ts) and its "write me" call. */
  world(): WorldState;
  changed(): void;
  /**
   * Ages (server/worldStore.ts): true when another server owns the world's meter. Then a blob kill here is queued for
   * that owner (`queueKill`) and shown on this server's meter, and only the owner fills it, calls the march and moves a
   * missed one; this server still marches at the saved dusk for its own heroes. Absent: this server owns (as before).
   */
  follows?(): boolean;
  queueKill?(): void;
}

/** A march under way. Transient: a restart (or the room closing) drops it, and the full meter calls the next one. */
interface March { start: number; wave: number; sent: number; ids: string[]; nextPack: number; dmg: Map<string, number> }
/** What every hero is told at the end ("tide" result). */
interface Result { cleared: boolean; top: { name: string; share: number }[] }

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const rint = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

/** Every live room's Tide, and the one that owns the march (claimed on first use, given up when its room closes). */
const rooms = new Set<Tide>();
let owner: Tide | undefined;

/**
 * Ages: the world's owner keeps the meter going when none of its rooms runs a Tide (all closed, or none opened yet), so
 * a meter the followers filled through the queue does not sit full forever: a full meter with no march booked gets the
 * next dusk; a booked march is counted as run (by the followers, for their heroes) once its time is up
 * (marchAt + TIDE.limitMs): the meter empties as at a march's end. With a room open its Tide does all this (and may be
 * marching: a full meter with no march booked is then the march under way). True when `w` changed (the caller writes
 * it). `frac`: time of day 0..1.
 */
export function bookIdleMarch(w: WorldState, now: number, frac: (now: number) => number): boolean {
  if (rooms.size) return false;
  if (w.marchAt !== undefined) {
    if (now <= w.marchAt + TIDE.limitMs) return false;
    w.tide = 0; w.marchAt = undefined; w.marches++;
    return true;
  }
  if (w.tide < TIDE.goal) return false;
  w.tide = TIDE.goal;
  w.marchAt = marchTime(now, frac(now));
  return true;
}
/**
 * The booked march time this process last set out for (any room): a follower's world is replaced by the owner's row
 * after its march (the same marchAt, the meter still full until the owner empties it), and must not march it again.
 */
let marched: number | undefined;
/** Tests: forget the last march set out for. */
export function _resetTideMarched() { marched = undefined; }

export class Tide {
  private m?: March;
  private checkAt = 0;
  private sendAt = 0;
  /** The last "tide" signature each hero in Act 1 was sent (rebuilt every send, so heroes who left drop out). */
  private sent = new Map<string, string>();
  private gone = false;

  constructor(private h: TideHost) { rooms.add(this); }

  /** A march is out in this room: its Act 1 Night Raiders stay away (TownRoom updateRaids). */
  get marching(): boolean { return !!this.m; }

  /** This room's Tide runs the event (schedules, marches, pays). */
  get owns(): boolean { return owner === this; }

  /** The room is closing (TownRoom onDispose): its march is dropped and another room may take the event (a full meter rebooks the next dusk). */
  release() {
    this.gone = true;
    rooms.delete(this);
    this.m = undefined;
    if (owner === this) owner = undefined;
  }

  /** The owner of the event: this one if nobody owns it yet (a closed room claims nothing). */
  private lead(): Tide {
    if (!owner && !this.gone) owner = this;
    return owner ?? this;
  }

  /** A monster fell to a hero (or a hero's creature, which kills in its owner's name): a blob fills the meter. */
  kill(_pid: string, m: TideMob, now = Date.now()) {
    if (m.tide || m.owner || m.summonFor || m.qwave || !isBlob(m.kind)) return; // not marchers, summons, quest or hold-wave monsters
    const w = this.h.world(), o = this.lead();
    if (o.m || w.marchAt !== undefined || w.tide >= TIDE.goal) return; // full: it waits for the march
    w.tide++;
    if (this.h.follows?.()) { this.h.queueKill?.(); return; } // (Ages: the world's owner counts it and calls the march)
    this.h.changed();
    if (w.tide >= TIDE.goal) o.full(now, true); // the owner books it, whichever room filled it
  }

  /** A hero (or their creature) hurt a marcher for `dmg`: it counts for them if they stand within TIDE.creditTiles of the west gate. */
  hit(pid: string, m: TideMob, dmg: number) {
    if (!m.tide || !this.m || !(dmg > 0)) return;
    const p = this.h.hero(pid);
    if (!p || Math.hypot(p.x - TIDE_GATE.x, p.y - TIDE_GATE.y) > TIDE.creditTiles * TILE) return;
    this.m.dmg.set(p.name, (this.m.dmg.get(p.name) ?? 0) + dmg);
  }

  /** Every server tick: (the owner only) the march's waves and end a couple of times a second; (every room) the news once a second. */
  tick(now: number) {
    const w = this.h.world();
    if (this.lead() !== this) { /* another room runs the event: this one only sends the news */ }
    else if (this.m) { if (now >= this.checkAt) { this.checkAt = now + TIDE.checkMs; this.tickMarch(now); } }
    else if (w.marchAt !== undefined && now >= w.marchAt && w.marchAt !== marched) {
      if (now - w.marchAt <= TIDE.lateMs) this.start(now);
      else if (!this.h.follows?.()) { w.marchAt = marchTime(now, this.h.dayFrac(now)); this.h.changed(); } // missed (server down at dusk)
    } else if (w.marchAt !== undefined && w.marchAt === marched && !this.h.follows?.() && now > w.marchAt + TIDE.limitMs) {
      w.tide = 0; w.marchAt = undefined; w.marches++; this.h.changed(); // marched here as a follower, then took the world over: that march is over
    } else if (w.marchAt === undefined && w.tide >= TIDE.goal && !this.h.follows?.()) this.full(now, false); // full with no march called (a restart mid-march)
    if (now >= this.sendAt) { this.sendAt = now + TIDE.sendMs; this.sendAll(); }
  }

  /** A hero joined: they get the meter on the next tick (once their client listens; they have no signature yet). */
  join(pid: string) {
    this.sent.delete(pid);
    this.sendAt = 0;
  }

  /**
   * The march sets out (at dusk; the bench and dev servers force it), in the owner's room (asked of another room, the
   * owner starts it). `worst`: the last wave, all of it at once (TIDE=1 bench).
   */
  start(now: number, worst = false): void {
    const o = this.lead();
    if (o !== this) return o.start(now, worst);
    if (this.m) return;
    const w = this.h.world();
    marched = w.marchAt ?? marched;
    w.marchAt = undefined;
    this.h.changed();
    this.m = { start: now, wave: worst ? TIDE.waves.length - 1 : 0, sent: 0, ids: [], nextPack: now, dmg: new Map() };
    this.checkAt = 0;
    if (worst) this.pack(TIDE.maxAlive);
    this.sendAt = 0;
  }

  /**
   * Dev servers only (TownRoom checks NODE_ENV): "/tide N" sets the meter (N = TIDE.goal fills it), "/tidemarch" sends
   * the march now, "/tideend" ends one (paid as at the time limit). True = it was one of these.
   */
  dev(text: string, now = Date.now()): boolean {
    const n = text.match(/^\/tide\s+(\d+)$/i), o = this.lead();
    if (n) {
      if (o.m) return true;
      const w = this.h.world();
      w.tide = Math.min(TIDE.goal, Number(n[1])); w.marchAt = undefined;
      this.h.changed();
      if (w.tide >= TIDE.goal) o.full(now, true);
      this.sendAt = 0;
      return true;
    }
    if (/^\/tidemarch$/i.test(text)) { o.start(now); return true; }
    if (/^\/tideend$/i.test(text)) { if (o.m) o.end(false); return true; }
    return false;
  }

  /** (The owner) The meter is full: the march is called for the next dusk; `loud`: every room's Act 1 heroes hear it fill. */
  private full(now: number, loud: boolean) {
    const w = this.h.world();
    w.tide = TIDE.goal;
    w.marchAt = marchTime(now, this.h.dayFrac(now));
    this.h.changed();
    for (const t of rooms.has(this) ? rooms : [this]) { if (loud) t.sfx("tidefull"); t.sendAt = 0; }
  }

  private tickMarch(now: number) {
    const M = this.m!;
    M.ids = M.ids.filter((id) => { const x = this.h.mob(id); return !!x && !x.dead && !x.owner; }); // a thrall or charmed marcher no longer marches
    if (now - M.start >= TIDE.limitMs) return this.end(false);
    const W = TIDE.waves[M.wave];
    if (M.sent >= W.n && !M.ids.length) {
      if (M.wave + 1 >= TIDE.waves.length) return this.end(true);
      M.wave++; M.sent = 0; M.nextPack = now + TIDE.waveGapMs;
      return;
    }
    if (M.sent < W.n && now >= M.nextPack && M.ids.length < TIDE.maxAlive) {
      this.pack(rint(TIDE.pack[0], TIDE.pack[1]));
      M.nextPack = now + TIDE.packMs;
    }
  }

  /** Up to n marchers of the current wave come out of the west together; the first pack of a wave sounds the march (at the goal, so the gate hears it). */
  private pack(n: number) {
    const M = this.m!, W = TIDE.waves[M.wave];
    n = Math.min(n, W.n - M.sent, TIDE.maxAlive - M.ids.length);
    if (n <= 0) return;
    const heroes = [...this.h.heroes()].map(([, p]) => p).filter((p) => !p.dead);
    let base = TIDE_SPAWNS[Math.floor(Math.random() * TIDE_SPAWNS.length)];
    const clear = TIDE.clearTiles * TILE, spread = TIDE.packTiles * TILE;
    for (let i = 0; i < 8 && heroes.some((p) => Math.abs(p.x - base.x) < clear && Math.abs(p.y - base.y) < clear); i++) base = TIDE_SPAWNS[Math.floor(Math.random() * TIDE_SPAWNS.length)];
    const near = TIDE_SPAWNS.filter((s) => Math.abs(s.x - base.x) <= spread && Math.abs(s.y - base.y) <= spread);
    if (M.sent === 0) this.sfx("tidemarch", TIDE_GOAL);
    for (let i = 0; i < n; i++) {
      const { kind, level } = tideMarcher(W), at = near[Math.floor(Math.random() * near.length)];
      const id = this.h.spawn(kind, level, { x: at.x + (Math.random() - 0.5) * TIDE.jitterPx, y: at.y + (Math.random() - 0.5) * TIDE.jitterPx }, tideHome());
      M.sent++;
      if (id) M.ids.push(id);
    }
    this.sendAt = 0;
  }

  /** The last wave is down (cleared) or time is up: what is left melts away, the heroes near the gate are paid, the meter empties. */
  private end(cleared: boolean) {
    const M = this.m!;
    this.m = undefined;
    for (const id of M.ids) this.h.removeMob(id);
    const online = new Map<string, string>();
    for (const [pid, p] of this.h.heroes()) online.set(p.name, pid);
    const you = new Map<string, { share: number; gold: number; rune?: string }>();
    for (const s of tideShares(M.dmg)) you.set(s.name, { share: r3(s.share), gold: 0 });
    for (const pay of tidePayouts(M.dmg, (name) => { const pid = online.get(name); return pid ? this.h.hero(pid)?.level : undefined; })) {
      const rune = pay.rune ? rollRune(TIDE.runeLevel) : undefined;
      this.h.pay(online.get(pay.name)!, pay.gold, rune);
      you.set(pay.name, { share: r3(pay.share), gold: pay.gold, ...(rune ? { rune } : {}) });
    }
    const w = this.h.world();
    w.tide = 0; w.marchAt = undefined; w.marches++;
    this.h.changed();
    const result: Result = { cleared, top: tideShares(M.dmg).slice(0, TIDE.runeTop).map((s) => ({ name: s.name, share: r3(s.share) })) };
    const s = this.status(), sig = JSON.stringify(s);
    for (const [pid, p] of this.h.heroes()) {
      const mine = you.get(p.name);
      if (!mine && !this.h.act1(p)) continue;
      this.h.send(pid, "tide", { ...s, result: { ...result, ...(mine ? { you: mine } : {}) } });
      if (this.h.act1(p)) this.sent.set(pid, sig);
    }
    this.sfx("tideend");
  }

  /** The meter and the march as the client shows them (shared/tide.ts TIDE.goal; wave is 1-based). */
  private status(): { n: number; goal: number; marchAt?: number; wave?: number; waves?: number; alive?: number } {
    const w = this.h.world();
    if (this.m) return { n: w.tide, goal: TIDE.goal, wave: this.m.wave + 1, waves: TIDE.waves.length, alive: this.m.ids.length };
    return { n: w.tide, goal: TIDE.goal, ...(w.marchAt !== undefined ? { marchAt: w.marchAt } : {}) };
  }

  /** Once a second: every hero in Act 1 whose last news is out of date gets the meter. */
  private sendAll() {
    const s = this.status(), sig = JSON.stringify(s), next = new Map<string, string>();
    for (const [pid, p] of this.h.heroes()) {
      if (!this.h.act1(p)) continue;
      if (this.sent.get(pid) !== sig) this.h.send(pid, "tide", s);
      next.set(pid, sig);
    }
    this.sent = next;
  }

  /** A Tide sound for every hero in Act 1: at a point (the march coming out of the west) or everywhere. */
  private sfx(ev: "tidefull" | "tidemarch" | "tideend", at?: { x: number; y: number }) {
    const msg = { ev, ...(at ? { x: Math.round(at.x), y: Math.round(at.y) } : {}) };
    for (const [pid, p] of this.h.heroes()) if (this.h.act1(p)) this.h.send(pid, "sfx", msg);
  }
}
