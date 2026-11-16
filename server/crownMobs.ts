import { CHIEF } from "../shared/bandits";
import { CROWN_AI, CROWN_KINDS, RIVEN_KING, type MobDef, type MobKind } from "../shared/constants";
import type { BossVoice } from "../shared/quests";

/**
 * The court of the Crown of the Marches on the server (shared/constants.ts CROWN_AI and RIVEN_KING have the numbers):
 * the Oathbroken Knights' broken oath, the Crownguard's shield ward, the Hollow Heralds' proclamations, the Court Magi's
 * blink, the Gildhounds' hunt, the Thronewarden's rampart, the Pretenders' usurping, and the Riven King's own fight.
 * The rest of the Crown's moves are shared ones (BEAST_MOVES, the pack call, war cries, RANGED shots) and stay in
 * TownRoom. TownRoom calls in at a few points only (spawn, the AI tick, a blow landing on one, one dying, its stats)
 * through the small CrownHost below, like server/hidekin.ts, so the room stays in charge.
 *
 * Every move speaks to the client through one "crown" message, `ev` saying which:
 *   oath     {id}                       a knight breaks its last oath (faster and harder from now on)
 *   ward     {id, ax, ay, ms}           a Crownguard plants its shield facing (ax, ay)
 *   proclaim {id, ms, r}                a herald starts reading a decree...
 *   decree   {id, ids, r}               ...and the court in `r` is rallied
 *   hush     {id}                       ...or it was cut off
 *   blink    {id, x0, y0, x, y}         a magus steps through the air
 *   hunt     {id, ids}                  a hound fell (id): the hounds in ids go wild
 *   rampart  {id, to, ms}               a Thronewarden wards a hurt kinsman
 *   usurp    {id, to, x0, y0, x, y}     a Pretender trades places with one of its court
 *   phase    {id, phase}                the Riven King's next phase (2 the Shards, 3 Kingsfall)
 *   edge     {id, x, y, x2, y2, w, ms}  his Riven Edge marks a lane...  edgecut {id, x, y, x2, y2, w}  ...and cuts it
 *   shards   {id, pts, r, ms}           crown shards will fall there... shardfall {id, pts, r}             ...and do
 *   fall     {id, x, y, r, ms}          Kingsfall: the hall round him will come down...  fallen {id, x, y, r}  ...and does
 */

/** What one of the court remembers (not synced). */
export interface CrownState {
  oath: boolean; // an Oathbroken Knight past its oath
  wardUntil: number; nextWard: number; wardX: number; wardY: number; // a Crownguard's shield and where it faces
  shieldUntil: number; // a Thronewarden's rampart over it (any of the court)
  castUntil: number; nextCast: number; // a herald's decree
  nextBlink: number; nextRampart: number; nextUsurp: number;
  // the Riven King: his phase, the move on its way (and where), each move's next time, whether he has had his say
  phase: number; move: "" | "edge" | "shards" | "fall"; at: number; ax: number; ay: number; pts: [number, number][];
  nextEdge: number; nextShards: number; nextFall: number; woke: boolean;
}

/** The parts of a monster this module touches (TownRoom's Mob). */
export interface CrownMob {
  kind: MobKind; level: number; x: number; y: number; hp: number; maxHp: number; zone: number;
  dead: boolean; hidden: boolean; moving: boolean; winding: boolean; broken: boolean; stunned: boolean; owner: string;
  target: string; specialAt: number; rushUntil: number; windUntil: number; lastAttack: number; rallyUntil: number;
  aimX: number; aimY: number; dir: string; voice?: BossVoice;
  cr?: CrownState;
}
export interface CrownHero { x: number; y: number; dead: boolean }

export interface CrownHost {
  hero(id: string): CrownHero | undefined;
  heroes(): Iterable<[string, CrownHero]>;
  mob(id: string): CrownMob | undefined;
  /** Monsters whose square lies within r px of (x, y) (a box: check the distance yourself). */
  mobsNear(x: number, y: number, r: number): Iterable<[string, CrownMob]>;
  broadcast(type: string, msg: unknown): void;
  /** The monster's own damage at its level, times mult. */
  dmg(m: CrownMob, mult: number): number;
  hurtHero(pid: string, dmg: number, fromId: string, what: string, push: [number, number], kb: number, opts: { stunMs?: number; slowMs?: number }): void;
  /** Open ground a monster may stand on (not solid, not a safe square, not a monster-free place). */
  canStand(x: number, y: number): boolean;
  /** A line in a speech bubble over the monster. */
  say(id: string, lines: readonly string[]): void;
  /** Make a monster chase a hero (sets its target and anger). */
  provoke(m: CrownMob, heroId: string): void;
}

const fresh = (now: number, m: CrownMob): CrownState => {
  const R = RIVEN_KING, W = CROWN_AI.ward, P = CROWN_AI.proclaim;
  return {
    oath: false, wardUntil: 0, nextWard: now + W.firstMs, wardX: 0, wardY: 1, shieldUntil: 0, castUntil: 0, nextCast: now + P.firstMs,
    nextBlink: 0, nextRampart: now + 2000, nextUsurp: 0,
    phase: m.kind === "rivenking" ? 1 : 0, move: "", at: 0, ax: 0, ay: 1, pts: [],
    nextEdge: now + R.edge.firstMs, nextShards: 0, nextFall: 0, woke: false,
  };
};
const isCourt = (o: CrownMob) => !o.dead && !o.hidden && !o.owner && CROWN_KINDS.includes(o.kind);

export class CrownCourt {
  constructor(private host: CrownHost) {}

  /** Kinds that have a move of their own here (TownRoom asks before calling tick). */
  static moves(kind: MobKind): boolean {
    return kind === "oathbreaker" || kind === "crownguard" || kind === "hollowherald" || kind === "courtmagus" || kind === "thronewarden" || kind === "pretender" || kind === "rivenking";
  }

  /** A monster that just (re)spawned: it starts afresh; a Riven King with no quest voice gets the throne's own. */
  spawned(m: CrownMob) {
    m.cr = undefined;
    if (m.kind === "rivenking" && !m.voice) m.voice = RIVEN_KING.voice;
  }

  /**
   * Its stats with the court's effects on top (TownRoom mobDefOf): a broken oath, a decree or a war cry (rallied like
   * the Redfang Chief's men), the Riven King's Kingsfall.
   */
  static def(m: CrownMob, base: MobDef, now: number): MobDef {
    let d = base;
    if (m.cr?.oath) { const O = CROWN_AI.oath; d = { ...d, speed: d.speed * O.speed, damage: d.damage * O.dmg, attackCooldownMs: d.attackCooldownMs * O.cooldown }; }
    if (m.kind === "rivenking" && (m.cr?.phase ?? 0) >= 3) { const W = RIVEN_KING.wrath; d = { ...d, speed: d.speed * W.speed, attackCooldownMs: d.attackCooldownMs * W.cooldown }; }
    if (now < m.rallyUntil) d = { ...d, speed: d.speed * CHIEF.warCry.speed, damage: d.damage * CHIEF.warCry.dmg };
    return d;
  }

  /** How much of a blow from (fx, fy) it takes: a Crownguard's shield from the front, a Thronewarden's rampart. */
  taken(m: CrownMob, fx: number | undefined, fy: number | undefined, now: number): number {
    const s = m.cr;
    if (!s) return 1;
    let k = 1;
    if (now < s.shieldUntil) k *= CROWN_AI.rampart.mult;
    if (now < s.wardUntil && fx !== undefined && fy !== undefined) {
      const dx = fx - m.x, dy = fy - m.y, d = Math.hypot(dx, dy);
      if (d < 1 || (dx * s.wardX + dy * s.wardY) / d >= CROWN_AI.ward.arc) k *= CROWN_AI.ward.mult; // (point-blank counts as the front)
    }
    return k;
  }

  /** One of the court is down: a Gildhound's fall drives the rest of its hunt wild, onto whoever felled it. */
  died(m: CrownMob, id: string, killer: string) {
    if (m.kind !== "gildhound") return;
    const H = CROWN_AI.hunt, now = Date.now(), ids: string[] = [], hero = this.host.hero(killer);
    for (const [oid, o] of this.host.mobsNear(m.x, m.y, H.range)) {
      if (oid === id || o.kind !== "gildhound" || !isCourt(o) || Math.hypot(o.x - m.x, o.y - m.y) > H.range) continue;
      o.rallyUntil = now + H.rallyMs; ids.push(oid);
      if (hero && !hero.dead) this.host.provoke(o, killer);
    }
    if (ids.length) this.host.broadcast("crown", { ev: "hunt", id, ids });
  }

  /** Its AI tick, before the room's: true while busy (a shield up, a decree read, a king's move on its way). */
  tick(m: CrownMob, id: string, now: number): boolean {
    const s = (m.cr ??= fresh(now, m));
    switch (m.kind) {
      case "oathbreaker": this.oath(m, id, s); return false;
      case "crownguard": return this.ward(m, id, s, now);
      case "hollowherald": return this.proclaim(m, id, s, now);
      case "courtmagus": this.blink(m, id, s, now); return false;
      case "thronewarden": this.rampart(m, id, s, now); return false;
      case "pretender": this.usurp(m, id, s, now); return false;
      case "rivenking": return this.king(m, id, s, now);
      default: return false;
    }
  }

  /** Busy with something else: a wind-up, a rush, a beast move, dizzy or stunned. */
  private static busy(m: CrownMob) { return m.hidden || m.broken || m.stunned || !!m.specialAt || !!m.rushUntil || !!m.windUntil; }
  private foe(m: CrownMob) { const t = m.target ? this.host.hero(m.target) : undefined; return t && !t.dead ? t : undefined; }
  private aim(m: CrownMob, x: number, y: number) {
    const d = Math.max(0.1, Math.hypot(x - m.x, y - m.y));
    m.aimX = (x - m.x) / d; m.aimY = (y - m.y) / d;
    m.dir = Math.abs(x - m.x) > Math.abs(y - m.y) ? (x > m.x ? "right" : "left") : (y > m.y ? "down" : "up");
  }

  /** An Oathbroken Knight past `hpFrac` breaks its last oath (once). */
  private oath(m: CrownMob, id: string, s: CrownState) {
    if (s.oath || m.hp >= m.maxHp * CROWN_AI.oath.hpFrac) return;
    s.oath = true;
    this.host.broadcast("crown", { ev: "oath", id });
  }

  /** A Crownguard plants its shield toward its foe and holds there a while (CROWN_AI.ward). */
  private ward(m: CrownMob, id: string, s: CrownState, now: number): boolean {
    const W = CROWN_AI.ward, t = this.foe(m);
    if (now < s.wardUntil) {
      if (!t || m.broken || m.stunned) { s.wardUntil = 0; return false; } // knocked off its feet: the shield drops
      m.moving = false;
      return true;
    }
    if (!t || CrownCourt.busy(m) || now < s.nextWard) return false;
    const d = Math.hypot(t.x - m.x, t.y - m.y);
    if (d < W.minDist || d > W.maxDist) return false;
    this.aim(m, t.x, t.y);
    s.wardX = m.aimX; s.wardY = m.aimY; s.wardUntil = now + W.ms; s.nextWard = now + W.everyMs;
    m.moving = false; m.lastAttack = now;
    this.host.broadcast("crown", { ev: "ward", id, ax: +m.aimX.toFixed(2), ay: +m.aimY.toFixed(2), ms: W.ms });
    return true;
  }

  /** A Hollow Herald reads out a decree: a cast (cut off by a stun or a break), then the court round it is rallied. */
  private proclaim(m: CrownMob, id: string, s: CrownState, now: number): boolean {
    const P = CROWN_AI.proclaim;
    if (s.castUntil) {
      if (m.broken || m.stunned) { s.castUntil = 0; s.nextCast = now + P.everyMs / 2; m.winding = false; this.host.broadcast("crown", { ev: "hush", id }); return false; }
      m.moving = false;
      if (now < s.castUntil) return true;
      s.castUntil = 0; m.winding = false; m.lastAttack = now;
      const ids: string[] = [];
      for (const [oid, o] of this.host.mobsNear(m.x, m.y, P.range)) {
        if (!isCourt(o) || Math.hypot(o.x - m.x, o.y - m.y) > P.range) continue;
        o.rallyUntil = now + P.buffMs; ids.push(oid);
      }
      this.host.broadcast("crown", { ev: "decree", id, ids, r: P.range });
      return true;
    }
    if (!this.foe(m) || CrownCourt.busy(m) || now < s.nextCast) return false;
    let court = 0;
    for (const [oid, o] of this.host.mobsNear(m.x, m.y, P.range)) if (oid !== id && isCourt(o) && Math.hypot(o.x - m.x, o.y - m.y) <= P.range) court++;
    s.nextCast = now + (court ? P.everyMs : 2000); // nobody to rally: it looks again in a moment
    if (!court) return false;
    s.castUntil = now + P.castMs; m.winding = true; m.moving = false;
    this.host.broadcast("crown", { ev: "proclaim", id, ms: P.castMs, r: P.range });
    return true;
  }

  /** A Court Magus with a hero too close steps through the air, away from them, to open ground. */
  private blink(m: CrownMob, id: string, s: CrownState, now: number) {
    const B = CROWN_AI.blink, t = this.foe(m);
    if (!t || CrownCourt.busy(m) || now < s.nextBlink) return;
    const d = Math.hypot(t.x - m.x, t.y - m.y);
    if (d > B.near) return;
    const a0 = Math.atan2(m.y - t.y, m.x - t.x);
    for (const da of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) {
      const x = t.x + Math.cos(a0 + da) * B.dist, y = t.y + Math.sin(a0 + da) * B.dist;
      if (!this.host.canStand(x, y)) continue;
      const x0 = Math.round(m.x), y0 = Math.round(m.y);
      m.x = x; m.y = y; m.moving = false; s.nextBlink = now + B.cooldownMs;
      this.host.broadcast("crown", { ev: "blink", id, x0, y0, x: Math.round(x), y: Math.round(y) });
      return;
    }
    s.nextBlink = now + 1000; // hemmed in: try again soon
  }

  /** A Thronewarden throws its ward over the most hurt of the court near it (itself included). */
  private rampart(m: CrownMob, id: string, s: CrownState, now: number) {
    const R = CROWN_AI.rampart;
    if (!this.foe(m) || m.broken || m.stunned || now < s.nextRampart) return;
    let best = "", worst = R.hpFrac, bm: CrownMob | undefined;
    for (const [oid, o] of this.host.mobsNear(m.x, m.y, R.range)) {
      if (!isCourt(o) || Math.hypot(o.x - m.x, o.y - m.y) > R.range) continue;
      const f = o.hp / Math.max(1, o.maxHp);
      if (f < worst) { worst = f; best = oid; bm = o; }
    }
    s.nextRampart = now + (bm ? R.everyMs : 1000);
    if (!bm) return;
    (bm.cr ??= fresh(now, bm)).shieldUntil = now + R.ms;
    this.host.broadcast("crown", { ev: "rampart", id, to: best, ms: R.ms });
  }

  /** A hurt Pretender trades places with the nearest of its court: the blow meant for it lands on them. */
  private usurp(m: CrownMob, id: string, s: CrownState, now: number) {
    const U = CROWN_AI.usurp;
    if (!this.foe(m) || CrownCourt.busy(m) || now < s.nextUsurp || m.hp >= m.maxHp * U.hpFrac) return;
    let to = "", bd = U.range, bo: CrownMob | undefined;
    for (const [oid, o] of this.host.mobsNear(m.x, m.y, U.range)) {
      if (oid === id || !isCourt(o) || o.kind === "rivenking" || o.kind === "pretender") continue;
      const d = Math.hypot(o.x - m.x, o.y - m.y);
      if (d < bd) { bd = d; to = oid; bo = o; }
    }
    s.nextUsurp = now + (bo ? U.everyMs : 1500);
    if (!bo) return;
    const x0 = m.x, y0 = m.y;
    m.x = bo.x; m.y = bo.y; bo.x = x0; bo.y = y0;
    if (!bo.target) this.host.provoke(bo, m.target);
    this.host.broadcast("crown", { ev: "usurp", id, to, x0: Math.round(x0), y0: Math.round(y0), x: Math.round(m.x), y: Math.round(m.y) });
  }

  // ---- the Riven King (RIVEN_KING) ----

  /** His phases, his voice, and his own three moves: the Riven Edge, the falling Shards, Kingsfall. */
  private king(m: CrownMob, id: string, s: CrownState, now: number): boolean {
    const R = RIVEN_KING, H = this.host, frac = m.hp / Math.max(1, m.maxHp), t = this.foe(m);
    if (t && !s.woke) { s.woke = true; if (m.zone >= 0 && m.voice) H.say(id, m.voice.wake); } // (a quest's king has had his say as he rose)
    if (s.phase < 2 && frac < R.phase[0]) { s.phase = 2; s.nextShards = now + R.shards.firstMs; H.say(id, R.lines.shards); H.broadcast("crown", { ev: "phase", id, phase: 2 }); }
    if (s.phase < 3 && frac < R.phase[1]) { s.phase = 3; s.nextFall = now + R.kingsfall.firstMs; H.say(id, R.lines.kingsfall); H.broadcast("crown", { ev: "phase", id, phase: 3 }); }
    // a move on its way
    if (s.move) {
      m.moving = false;
      if (now < s.at) return true;
      const move = s.move;
      s.move = ""; m.winding = false; m.lastAttack = now;
      if (move === "edge") this.edgeCut(m, id, s);
      else if (move === "shards") this.shardFall(m, id, s);
      else this.kingsfall(m, id);
      return true;
    }
    if (!t || CrownCourt.busy(m)) return false;
    const d = Math.hypot(t.x - m.x, t.y - m.y);
    // Kingsfall first (phase 3), then the Shards (phase 2+), then his Edge
    if (s.phase >= 3 && now >= s.nextFall && d <= R.kingsfall.radius * 1.6) {
      const K = R.kingsfall;
      s.move = "fall"; s.at = now + K.windupMs; s.nextFall = now + K.everyMs; m.winding = true;
      H.broadcast("crown", { ev: "fall", id, x: Math.round(m.x), y: Math.round(m.y), r: K.radius, ms: K.windupMs });
      return true;
    }
    if (s.phase >= 2 && now >= s.nextShards && d <= R.shards.range) {
      const S = R.shards;
      s.pts = [[t.x, t.y]];
      for (const [, p] of H.heroes()) if (p !== t && !p.dead && s.pts.length < S.count && Math.hypot(p.x - m.x, p.y - m.y) <= S.range) s.pts.push([p.x, p.y]);
      while (s.pts.length < S.count) { const a = Math.random() * Math.PI * 2, r = S.spread * (0.6 + Math.random() * 0.8); s.pts.push([t.x + Math.cos(a) * r, t.y + Math.sin(a) * r * 0.8]); }
      s.move = "shards"; s.at = now + S.windupMs; s.nextShards = now + S.everyMs; m.winding = true;
      H.broadcast("crown", { ev: "shards", id, pts: s.pts.map(([a, b]) => [Math.round(a), Math.round(b)]), r: S.radius, ms: S.windupMs });
      return true;
    }
    const E = R.edge;
    if (now >= s.nextEdge && d >= E.min && d <= E.max) {
      this.aim(m, t.x, t.y);
      s.ax = m.aimX; s.ay = m.aimY; s.move = "edge"; s.at = now + E.windupMs; s.nextEdge = now + E.everyMs; m.winding = true;
      H.broadcast("crown", { ev: "edge", id, x: Math.round(m.x), y: Math.round(m.y), x2: Math.round(m.x + s.ax * E.reach), y2: Math.round(m.y + s.ay * E.reach), w: E.width, ms: E.windupMs });
      if (Math.random() < 0.4) H.say(id, R.lines.edge);
      return true;
    }
    return false;
  }

  /** The Riven Edge cuts down its marked lane. */
  private edgeCut(m: CrownMob, id: string, s: CrownState) {
    const E = RIVEN_KING.edge, H = this.host, w = E.width / 2 + 6, dmg = H.dmg(m, E.dmgMult);
    for (const [pid, p] of H.heroes()) {
      if (p.dead) continue;
      const dx = p.x - m.x, dy = p.y - m.y, along = dx * s.ax + dy * s.ay, side = Math.abs(dx * -s.ay + dy * s.ax);
      if (along >= -6 && along <= E.reach && side <= w) H.hurtHero(pid, dmg, id, "Riven Edge", [s.ax, s.ay], E.knockback, {});
    }
    H.broadcast("crown", { ev: "edgecut", id, x: Math.round(m.x), y: Math.round(m.y), x2: Math.round(m.x + s.ax * E.reach), y2: Math.round(m.y + s.ay * E.reach), w: E.width });
  }

  /** The shards of his crown come down where they were marked. */
  private shardFall(m: CrownMob, id: string, s: CrownState) {
    const S = RIVEN_KING.shards, H = this.host, dmg = H.dmg(m, S.dmgMult);
    for (const [pid, p] of H.heroes()) {
      if (p.dead || !s.pts.some(([x, y]) => Math.hypot(p.x - x, p.y - y) <= S.radius)) continue;
      H.hurtHero(pid, dmg, id, "Crown Shards", [0, 0], 0, { stunMs: S.stunMs });
    }
    H.broadcast("crown", { ev: "shardfall", id, pts: s.pts.map(([a, b]) => [Math.round(a), Math.round(b)]), r: S.radius });
    s.pts = [];
  }

  /** Kingsfall: the hall comes down round him; only those who ran clear are spared. */
  private kingsfall(m: CrownMob, id: string) {
    const K = RIVEN_KING.kingsfall, H = this.host, dmg = H.dmg(m, K.dmgMult);
    for (const [pid, p] of H.heroes()) {
      if (p.dead) continue;
      const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy);
      if (d <= K.radius) H.hurtHero(pid, dmg, id, "Kingsfall", d > 0.1 ? [dx / d, dy / d] : [0, 1], K.knockback, {});
    }
    H.broadcast("crown", { ev: "fallen", id, x: Math.round(m.x), y: Math.round(m.y), r: K.radius });
  }
}
