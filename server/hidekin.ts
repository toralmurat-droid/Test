import { BOSS, ELITE, HIDEKIN_KINDS, SINKHOLES_AI, type MobKind } from "../shared/constants";

/**
 * The Hide-Kin of the Mawdeep Sinkholes on the server (shared/constants.ts SINKHOLES_AI has the numbers): the Delvers'
 * and the Maw-Father's burrow, the Hide-Stitchers' stitch, and the Gullet Worms buried in the pit floors. The rest of
 * the sinkholes' moves are shared ones (BEAST_MOVES, the pack call, war cries, camp posts) and stay in TownRoom.
 * TownRoom calls in at a few points only (spawn, the AI tick, a hidden monster popping out) through the small
 * HideKinHost below, like server/champions.ts, so the room stays in charge.
 *
 * Every move speaks to the client through one "hidekin" message, `ev` saying which:
 *   burrow {id, x, y}            it digs in where it stands (hidden from now on)
 *   mark   {id, x, y, r, ms}     where it will come up, `ms` from now (step off)
 *   up     {id, x, y, r}         it bursts out (r = 0: it only surfaced, nobody was hurt)
 *   sew    {id, to, ms}          a stitcher starts sewing a kinsman
 *   stitch {id, to, amount}      ...and mends him
 *   burst  {id, x, y, r}         a Gullet Worm bursts out of its pit at a hero
 */

/** What a Hide-Kin remembers (not synced). */
export interface HideKinState {
  phase: "" | "under" | "mark"; until: number; next: number; mx: number; my: number; // the burrow
  nextStitch: number; stitchTo: string; castUntil: number; // the stitch
  nextSeek: number; // a worm looking for a pit to lie in
}

/** The parts of a monster this module touches (TownRoom's Mob). */
export interface HideKinMob {
  kind: MobKind; level: number; x: number; y: number; hp: number; maxHp: number; homeX: number; homeY: number;
  dead: boolean; hidden: boolean; moving: boolean; winding: boolean; broken: boolean; stunned: boolean; owner: string;
  target: string; spot: string; specialAt: number; rushUntil: number; windUntil: number; lastAttack: number; hideUntil: number;
  hk?: HideKinState;
}
export interface HideKinHero { x: number; y: number; dead: boolean }

export interface HideKinHost {
  hero(id: string): HideKinHero | undefined;
  heroes(): Iterable<[string, HideKinHero]>;
  mob(id: string): HideKinMob | undefined;
  /** Monsters whose square lies within r px of (x, y) (a box: check the distance yourself). */
  mobsNear(x: number, y: number, r: number): Iterable<[string, HideKinMob]>;
  broadcast(type: string, msg: unknown): void;
  /** The monster's own damage at its level, times mult. */
  dmg(m: HideKinMob, mult: number): number;
  hurtHero(pid: string, dmg: number, fromId: string, what: string, push: [number, number], kb: number, stunMs: number): void;
  /** Open ground a monster may stand on (not solid, not a safe square, not a monster-free place). */
  canStand(x: number, y: number): boolean;
  /** Hide it now in a free spot of its kind within `radius` tiles (shared/spawns.ts HIDE); false if none is free. */
  hideNow(m: HideKinMob, id: string, radius: number): boolean;
  /** Walk to a free hiding spot within `radius` tiles of home (hides on arrival). */
  seekSpot(m: HideKinMob, radius: number): void;
}

const fresh = (now: number, first = 0): HideKinState => ({ phase: "", until: 0, next: now + first, mx: 0, my: 0, nextStitch: now + 1500, stitchTo: "", castUntil: 0, nextSeek: 0 });

export class HideKin {
  constructor(private host: HideKinHost) {}

  /** Kinds that have a move of their own here (TownRoom asks before calling tick). */
  static moves(kind: MobKind): boolean { return kind === "sinkworm" || kind === "stitcher" || !!SINKHOLES_AI.burrow[kind]; }

  /** A monster that just (re)spawned: a Gullet Worm is already down in a pit when it comes (nobody is near). */
  spawned(m: HideKinMob, id: string) {
    m.hk = undefined;
    if (m.kind === "sinkworm" && this.host.hideNow(m, id, SINKHOLES_AI.burst.seekRadius)) m.hideUntil = Infinity;
  }

  /** Its AI tick, before the room's: true while busy (burrowed, coming up, sewing), the room then leaves it be. */
  tick(m: HideKinMob, id: string, now: number): boolean {
    if (m.kind === "sinkworm") return this.worm(m, now);
    const B = SINKHOLES_AI.burrow[m.kind];
    if (B && this.burrow(m, id, B, now)) return true;
    return m.kind === "stitcher" && this.stitch(m, id, now);
  }

  /** A Gullet Worm out of its pit at a hero (TownRoom popOut): everyone over the pit's lip is thrown back. */
  burst(m: HideKinMob, id: string) {
    const B = SINKHOLES_AI.burst, H = this.host, dmg = H.dmg(m, B.dmgMult);
    for (const [pid, p] of H.heroes()) {
      if (p.dead) continue;
      const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy);
      if (d <= B.radius) H.hurtHero(pid, dmg, id, "Gullet Burst", d > 0.1 ? [dx / d, dy / d] : [0, 1], B.knockback, B.stunMs);
    }
    H.broadcast("hidekin", { ev: "burst", id, x: Math.round(m.x), y: Math.round(m.y), r: B.radius });
  }

  /** A worm stays down until a hero walks over its pit (TownRoom updateHidden); out of it with nobody to fight, it goes back down. */
  private worm(m: HideKinMob, now: number): boolean {
    if (m.hidden) { m.hideUntil = Infinity; return false; }
    const s = (m.hk ??= fresh(now));
    if (!m.target && !m.spot && !m.broken && now >= s.nextSeek) { s.nextSeek = now + 3000; this.host.seekSpot(m, SINKHOLES_AI.burst.seekRadius); }
    return false;
  }

  /** Dig in, tunnel under the hero, mark the spot, burst out there (SINKHOLES_AI.burrow). */
  private burrow(m: HideKinMob, id: string, B: NonNullable<(typeof SINKHOLES_AI.burrow)[MobKind]>, now: number): boolean {
    const H = this.host, s = (m.hk ??= fresh(now, B.firstMs)), t = m.target ? H.hero(m.target) : undefined;
    if (s.phase === "under") {
      m.moving = false;
      if (now < s.until) return true;
      if (!t || t.dead || !H.canStand(t.x, t.y)) { this.surface(m, id, s, B.everyMs / 2, now); return true; }
      s.mx = t.x; s.my = t.y; s.phase = "mark"; s.until = now + B.markMs;
      H.broadcast("hidekin", { ev: "mark", id, x: Math.round(s.mx), y: Math.round(s.my), r: B.radius, ms: B.markMs });
      return true;
    }
    if (s.phase === "mark") {
      m.moving = false;
      if (now < s.until) return true;
      if (H.canStand(s.mx, s.my)) { m.x = s.mx; m.y = s.my; }
      m.hidden = false; s.phase = ""; s.next = now + B.everyMs; m.lastAttack = now;
      const dmg = H.dmg(m, B.dmgMult);
      for (const [pid, p] of H.heroes()) {
        if (p.dead) continue;
        const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy);
        if (d <= B.radius) H.hurtHero(pid, dmg, id, "Burrow", d > 0.1 ? [dx / d, dy / d] : [0, 1], 1.2, B.stunMs);
      }
      H.broadcast("hidekin", { ev: "up", id, x: Math.round(m.x), y: Math.round(m.y), r: B.radius });
      return true;
    }
    if (!t || t.dead || m.hidden || m.broken || m.stunned || m.specialAt || m.rushUntil || m.windUntil || now < s.next) return false;
    const d = Math.hypot(t.x - m.x, t.y - m.y);
    if (d < B.minDist || d > B.maxDist) return false;
    m.hidden = true; m.moving = false; m.winding = false;
    s.phase = "under"; s.until = now + B.underMs;
    H.broadcast("hidekin", { ev: "burrow", id, x: Math.round(m.x), y: Math.round(m.y) });
    return true;
  }

  /** Its hero is gone: it comes up where it is, hurting nobody. */
  private surface(m: HideKinMob, id: string, s: HideKinState, wait: number, now: number) {
    m.hidden = false; s.phase = ""; s.next = now + wait;
    this.host.broadcast("hidekin", { ev: "up", id, x: Math.round(m.x), y: Math.round(m.y), r: 0 });
  }

  /** A Hide-Stitcher sews the most hurt kinsman in reach back up (SINKHOLES_AI.stitch): a cast, then the heal. */
  private stitch(m: HideKinMob, id: string, now: number): boolean {
    const S = SINKHOLES_AI.stitch, H = this.host, s = (m.hk ??= fresh(now));
    if (s.castUntil) {
      m.moving = false;
      if (now < s.castUntil) return true;
      s.castUntil = 0; m.winding = false; m.lastAttack = now;
      const o = H.mob(s.stitchTo);
      if (o && !o.dead && !o.owner && Math.hypot(o.x - m.x, o.y - m.y) <= S.range * 1.3) {
        const amount = Math.max(1, Math.round(o.maxHp * (ELITE[o.kind as MobKind] || BOSS[o.kind as MobKind] ? S.eliteHeal : S.heal)));
        o.hp = Math.min(o.maxHp, o.hp + amount);
        H.broadcast("hidekin", { ev: "stitch", id, to: s.stitchTo, amount });
      }
      return true;
    }
    if (!m.target || m.hidden || m.broken || m.windUntil || now < s.nextStitch) return false;
    let best = "", worst = S.hpFrac;
    for (const [oid, o] of H.mobsNear(m.x, m.y, S.range)) {
      if (o.dead || o.hidden || o.owner || !HIDEKIN_KINDS.includes(o.kind) || Math.hypot(o.x - m.x, o.y - m.y) > S.range) continue;
      const f = o.hp / Math.max(1, o.maxHp);
      if (f < worst) { worst = f; best = oid; }
    }
    s.nextStitch = now + (best ? S.everyMs : 1000); // nobody hurt enough: it looks again in a moment
    if (!best) return false;
    s.stitchTo = best; s.castUntil = now + S.castMs;
    m.winding = true; m.moving = false;
    H.broadcast("hidekin", { ev: "sew", id, to: best, ms: S.castMs });
    return true;
  }
}
