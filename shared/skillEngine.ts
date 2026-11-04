import { ClassKind } from "./classes";
import { pointRange, skillTarget,
  AreaDef, BuffDef, FieldDef, HitEffects, levelPower, MARK_TAKEN, MAX_STACKS, MoveDef, rankOf, rankPower, rankTime, Ranks, scalePower,
  ShotDef, SkillDef, skillOf, STACK_DECAY_MS, STACK_POWER, WEAK_DEALT,
} from "./skills";
import { Stats, STATS } from "./powers";
import { pay, skillCost } from "./mana";

/**
 * Runs the skills of shared/skills.ts. It knows nothing about the room: the server (server/TownRoom.ts) and the
 * balance simulator (tools/balance/duel.ts) each implement SkillHost, so both play skills by the same rules.
 *
 * The host calls:
 *   castSkill()    when a hero presses a skill key
 *   tickUnit()     every tick for every hero and monster (burning, buffs running out, stacks fading)
 *   tickField()    every tick for every ground effect
 *   shotHit() / shotEnd()   when a skill projectile hits someone / stops
 *   counterHit()   before applying damage to a hero (a counter stance can cancel the hit)
 *   afterHit()     after damage landed (debuffs, enchantments, stacks)
 *   dealtMult / takenMult / speedMult / ...   inside its own damage and movement code
 * and gets visual events through host.fx() (broadcast as "sfx" to the clients, see client/src/skillfx.ts).
 */

export interface ActiveBuff { id: string; until: number; b: BuffDef; rank: number; stacks: number }

export interface SkillRuntime {
  last: Record<string, number>; // skill id -> last cast time
  buffs: ActiveBuff[];
  counter?: { until: number; s: SkillDef; rank: number; power: number };
  chargeUntil: number; // buildup: rooted until then
  stacks: number; stackAt: number;
  burnUntil: number; burnDps: number; burnBy: string; burnNext: number;
  markUntil: number; weakUntil: number;
}
export const newRuntime = (): SkillRuntime => ({
  last: {}, buffs: [], chargeUntil: 0, stacks: 0, stackAt: 0,
  burnUntil: 0, burnDps: 0, burnBy: "", burnNext: 0, markUntil: 0, weakUntil: 0,
});

export interface Unit { x: number; y: number; dead: boolean; level: number; sk: SkillRuntime; cls?: ClassKind; talents?: Ranks; energy?: number; mana?: number; hp?: number; maxHp?: number }

export interface HitOpts extends HitEffects { skill?: boolean; basic?: boolean; dot?: boolean; thorn?: boolean; crit?: boolean }

export interface ShotSpec extends HitEffects {
  owner: string; skill: string; x: number; y: number; vx: number; vy: number;
  kind: string; speed: number; range: number; radius: number; size: number; dmg: number;
  pierce: number; explode: number; chain: number; field?: FieldDef; rank: number; power: number;
  pulse?: ShotDef["pulse"]; pulses?: number; // pulses so far (turns the shard ring)
}

export interface FieldInst {
  owner: string; skill: string; def: FieldDef; rank: number; power: number;
  x: number; y: number; until: number; nextTick: number;
}

export interface SkillHost {
  now(): number;
  later(ms: number, fn: () => void): void;
  unit(id: string): Unit | undefined;
  /** Can act: alive, not stunned or dizzy. */
  canAct(id: string): boolean;
  /** Live, hittable enemies of `id` within r of (x, y). */
  enemies(x: number, y: number, r: number, of: string): string[];
  hit(attacker: string, target: string, dmg: number, push: [number, number], o: HitOpts): void;
  heal(id: string, amount: number): void;
  aim(id: string): [number, number];
  /** Distance to the spot the hero clicked for this cast (point skills), read once; undefined = no click. */
  aimDist?(id: string): number | undefined;
  face(id: string, dx: number, dy: number): void;
  /** Walk `dist` px along (dx, dy), stopped by walls, in small steps; calls `each` after every step. */
  move(id: string, dx: number, dy: number, dist: number, each?: () => void): void;
  /** Teleport if the spot is walkable. */
  place(id: string, x: number, y: number): boolean;
  invuln(id: string, until: number): void;
  shoot(s: ShotSpec): void;
  addField(f: FieldInst): void;
  fear(id: string, ms: number): void;
  /** Weapon hit of the hero (class damage x attack stat), and the Magic multiplier for flat skill damage. */
  weaponHit(id: string): number;
  magic(id: string): number;
  /** Hero attributes (with gear), for skills that scale with one. */
  stats?(id: string): Stats | undefined;
  cooldownMult(id: string): number;
  fx(ev: Record<string, unknown>): void;
}

const live = (h: SkillHost, id: string) => { const u = h.unit(id); return u && !u.dead ? u : undefined; };
const norm = (dx: number, dy: number): [number, number] => { const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
const pushFrom = (h: SkillHost, x: number, y: number, tid: string): [number, number] => {
  const t = h.unit(tid);
  return t ? norm(t.x - x || 0.01, t.y - y) : [0, 1];
};
const effects = (e: HitEffects, t: number): HitEffects => ({
  stunMs: e.stunMs && e.stunMs * t, slowMs: e.slowMs && e.slowMs * t, kb: e.kb,
  burn: e.burn && [e.burn[0], e.burn[1] * t], markMs: e.markMs && e.markMs * t, weakMs: e.weakMs && e.weakMs * t, fearMs: e.fearMs && e.fearMs * t,
});

function baseDmg(h: SkillHost, id: string, a: { wpn?: number; dmg?: number }): number {
  return (a.wpn ? a.wpn * h.weaponHit(id) : 0) + (a.dmg ? a.dmg * h.magic(id) : 0);
}

export function cooldownLeft(s: SkillDef, sk: SkillRuntime, now: number, cdm: number): number {
  return Math.max(0, (sk.last[s.id] ?? -Infinity) + (s.cd ?? 0) * cdm - now);
}

// ---- Casting -----------------------------------------------------------------------------------------

/** A hero presses a skill. Returns true if it was cast. */
export function castSkill(h: SkillHost, id: string, skillId: string): boolean {
  const u = live(h, id);
  if (!u || !u.cls || !h.canAct(id)) return false;
  const s = skillOf(u.cls, skillId);
  const rank = Math.min(3, rankOf(u.talents, skillId));
  const now = h.now();
  if (!s || s.passive || rank <= 0 || now < u.sk.chargeUntil) return false;
  if (cooldownLeft(s, u.sk, now, h.cooldownMult(id)) > 0) return false;
  if (!pay(u, skillCost(s))) return false; // Stamina and/or Mana (shared/mana.ts)
  u.sk.last[s.id] = now;
  // A clicked spot (point skills): how far from the hero it lands, within the skill's reach
  const clicked = h.aimDist?.(id);
  const at = skillTarget(s) === "point" && clicked !== undefined ? Math.max(0, Math.min(pointRange(s), clicked)) : undefined;
  let stacks = 0;
  if (s.consume) { stacks = u.sk.stacks; u.sk.stacks = 0; }
  const power = rankPower(rank) * levelPower(s) * scalePower(s, h.stats?.(id), STATS[u.cls].base) *
    (s.consume && !s.buff?.perStack ? 1 + STACK_POWER * stacks : 1);
  h.fx({ ev: "cast", id, s: s.id, rank, stacks, charge: s.chargeMs ?? 0, x: u.x, y: u.y });
  if (s.chargeMs) {
    u.sk.chargeUntil = now + s.chargeMs;
    h.later(s.chargeMs, () => {
      u.sk.chargeUntil = 0;
      if (!h.canAct(id)) { h.fx({ ev: "fizzle", id, s: s.id }); return; } // a stun breaks the buildup
      release(h, id, s, rank, power, stacks, at);
    });
  } else release(h, id, s, rank, power, stacks, at);
  return true;
}

/** `at`: distance to the clicked spot for a point skill (leap/blink length, centre of the blast or field). */
function release(h: SkillHost, id: string, s: SkillDef, rank: number, power: number, stacks: number, at?: number) {
  const u = live(h, id);
  if (!u) return;
  const t = rankTime(rank);
  const x0 = u.x, y0 = u.y;
  const [ax0, ay0] = h.aim(id);
  if (s.move) doMove(h, id, s, s.move, power, t, at);
  // Several blasts keep their spacing, scaled so the furthest lands on the clicked spot
  const far = Math.max(0, ...(s.areas ?? []).map((a) => a.ahead ?? 0));
  for (const a of s.areas ?? []) {
    const spot = a.atStart ? [x0, y0] as [number, number]
      : at !== undefined && (a.ahead ?? 0) > 0 && !s.move ? [x0 + ax0 * at * (a.ahead! / far), y0 + ay0 * at * (a.ahead! / far)] as [number, number]
      : undefined;
    area(h, id, s, a, power, t, spot);
  }
  if (s.shots) fire(h, id, s.id, s.shots, rank, power, u.x, u.y, h.aim(id));
  if (s.field) {
    const [ax, ay] = h.aim(id), d = at ?? s.field.ahead ?? 0;
    h.addField({ owner: id, skill: s.id, def: s.field, rank, power, x: u.x + ax * d, y: u.y + ay * d, until: h.now() + s.field.ms * t, nextTick: h.now() });
  }
  if (s.buff) addBuff(h, id, s.id, s.buff, rank, stacks);
  if (s.cry) {
    h.fx({ ev: "cry", id, s: s.id, x: u.x, y: u.y, r: s.cry.r });
    area(h, id, s, s.cry, power, t, undefined, true);
  }
  if (s.counter) {
    u.sk.counter = { until: h.now() + s.counter.ms * t, s, rank, power };
    h.fx({ ev: "counter", id, s: s.id, ms: s.counter.ms * t });
  }
}

export function addBuff(h: SkillHost, id: string, skill: string, b: BuffDef, rank: number, stacks = 0) {
  const u = live(h, id);
  if (!u) return;
  const until = h.now() + b.ms * rankTime(rank);
  u.sk.buffs = u.sk.buffs.filter((x) => x.id !== skill);
  u.sk.buffs.push({ id: skill, until, b, rank, stacks });
  if (b.heal && u.maxHp) h.heal(id, u.maxHp * b.heal / 100 * rankPower(rank));
  h.fx({ ev: "buff", id, s: skill, ms: until - h.now() });
}

function doMove(h: SkillHost, id: string, s: SkillDef, m: MoveDef, power: number, t: number, at?: number) {
  const u = live(h, id)!;
  const now = h.now();
  const [ax, ay] = h.aim(id);
  const fx0 = u.x, fy0 = u.y;
  if (m.invulnMs) h.invuln(id, now + m.invulnMs);
  switch (m.kind) {
    case "dash": case "leap": {
      const cut = new Set<string>();
      h.move(id, ax, ay, m.kind === "leap" && at !== undefined ? at : m.dist, () => { if (m.path) for (const e of h.enemies(u.x, u.y, 14, id)) cut.add(e); });
      for (const e of cut) h.hit(id, e, baseDmg(h, id, { wpn: m.path }) * power, [ax, ay], { skill: true, kb: 0.6 });
      break;
    }
    case "blink": case "back": {
      const dir = m.kind === "back" ? -1 : 1;
      for (let d = m.kind === "blink" && at !== undefined ? at : m.dist; d >= 8; d -= 8) if (h.place(id, u.x + ax * d * dir, u.y + ay * d * dir)) break;
      break;
    }
    case "behind": {
      const tid = nearest(h, id, u.x, u.y, m.dist);
      if (tid) behind(h, id, tid);
      else for (let d = m.dist / 2; d >= 8; d -= 8) if (h.place(id, u.x + ax * d, u.y + ay * d)) break;
      break;
    }
    case "multi": {
      const hits = m.hits ?? 3, every = m.everyMs ?? 150;
      h.invuln(id, now + Math.max(m.invulnMs ?? 0, hits * every + 100));
      let prev = "";
      for (let i = 0; i < hits; i++) {
        h.later(i * every, () => {
          const me = live(h, id);
          if (!me) return;
          const all = h.enemies(me.x, me.y, m.dist, id);
          const pick = all.filter((x) => x !== prev);
          const tid = (pick.length ? pick : all)[Math.floor(Math.random() * (pick.length || all.length))];
          if (!tid) return;
          prev = tid;
          const fx = me.x, fy = me.y;
          behind(h, id, tid);
          h.fx({ ev: "move", id, s: s.id, kind: "blink", fx, fy, x: me.x, y: me.y, i });
          h.hit(id, tid, baseDmg(h, id, { wpn: m.wpn ?? 1 }) * power, pushFrom(h, me.x, me.y, tid), { skill: true, kb: 0.3 });
        });
      }
      return;
    }
  }
  h.fx({ ev: "move", id, s: s.id, kind: m.kind, fx: fx0, fy: fy0, x: u.x, y: u.y });
}

/** Step just behind `tid` (seen from where `id` stands) and face it. */
function behind(h: SkillHost, id: string, tid: string) {
  const u = h.unit(id)!, t = h.unit(tid)!;
  const [dx, dy] = norm(t.x - u.x, t.y - u.y);
  if (!h.place(id, t.x + dx * 14, t.y + dy * 14)) h.place(id, t.x - dx * 14, t.y - dy * 14);
  h.face(id, t.x - u.x, t.y - u.y);
}

function nearest(h: SkillHost, id: string, x: number, y: number, r: number): string | undefined {
  let best: string | undefined, bd = Infinity;
  for (const e of h.enemies(x, y, r, id)) {
    const t = h.unit(e)!;
    const d = Math.hypot(t.x - x, t.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/** One area hit (and its waves). `at` fixes the centre; otherwise it is ahead of the hero (or on the hero, following them). */
export function area(h: SkillHost, id: string, s: SkillDef | { id: string }, a: AreaDef, power: number, t: number, at?: [number, number], cry = false) {
  const u = h.unit(id);
  if (!u) return;
  const [ax, ay] = h.aim(id);
  const fixed = at ?? (a.ahead || a.scatter ? [u.x + ax * (a.ahead ?? 0), u.y + ay * (a.ahead ?? 0)] as [number, number] : undefined);
  const waves = a.waves ?? 1;
  const dmg = baseDmg(h, id, a) * power;
  for (let i = 0; i < waves; i++) {
    const go = () => {
      const me = h.unit(id);
      if (!me || (me.dead && !fixed)) return;
      let [cx, cy] = fixed ?? [me.x, me.y];
      if (a.line) { cx += ax * a.line * i; cy += ay * a.line * i; }
      if (a.scatter) { const ang = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * a.scatter; cx += Math.cos(ang) * d; cy += Math.sin(ang) * d; }
      if (!cry) h.fx({ ev: "area", id, s: s.id, x: cx, y: cy, r: a.r, look: a.look ?? "burst", i, n: waves });
      for (const e of h.enemies(cx, cy, a.r, id)) {
        if (a.pull) {
          const tu = h.unit(e);
          if (tu) { const [px, py] = norm(cx - tu.x, cy - tu.y); h.move(e, px, py, Math.min(a.pull, Math.hypot(cx - tu.x, cy - tu.y))); }
        }
        h.hit(id, e, dmg, pushFrom(h, cx, cy, e), { ...effects(a, t), skill: true, kb: a.kb ?? (dmg > 0 ? 1 : 0) });
      }
    };
    const delay = (a.delayMs ?? 0) + i * (a.everyMs ?? 0);
    if (delay > 0) h.later(delay, go); else go();
  }
}

function fire(h: SkillHost, id: string, skill: string, d: ShotDef, rank: number, power: number, x: number, y: number, aim: [number, number]) {
  const n = d.n ?? 1;
  const base = Math.atan2(aim[1], aim[0]);
  const t = rankTime(rank);
  const dmg = baseDmg(h, id, d) * power;
  for (let i = 0; i < n; i++) {
    const k = n > 1 ? i - (n - 1) / 2 : 0;
    const ang = base + (d.spread && n > 1 ? (k * d.spread / (n - 1)) * Math.PI / 180 : 0);
    const vx = Math.cos(ang), vy = Math.sin(ang);
    const lane = d.lanes ? k * d.lanes : 0;
    h.shoot({
      owner: id, skill, x: x + vx * 6 - aim[1] * lane, y: y - 4 + vy * 6 + aim[0] * lane, vx, vy,
      kind: d.kind, speed: d.speed, range: d.range, radius: d.radius, size: d.size ?? 1, dmg,
      pierce: d.pierce ?? 0, explode: d.explode ?? 0, chain: d.chain ?? 0, field: d.field, rank, power, pulse: d.pulse,
      ...effects(d, t),
    });
  }
}

// ---- Projectiles -------------------------------------------------------------------------------------

/** A skill projectile hits `tid` (the host keeps flying it if it pierces). */
export function shotHit(h: SkillHost, s: ShotSpec, tid: string) {
  const exploding = s.explode > 0 && s.pierce <= 0;
  h.hit(s.owner, tid, s.dmg, [s.vx, s.vy], { stunMs: s.stunMs, slowMs: exploding ? undefined : s.slowMs, burn: s.burn, markMs: s.markMs, weakMs: s.weakMs, kb: s.kb ?? 1, skill: true });
  if (s.chain > 0) chain(h, s.owner, tid, s.chain, s.dmg, s);
}

function chain(h: SkillHost, owner: string, from: string, hops: number, dmg: number, e: HitEffects) {
  const done = new Set([from]);
  const f0 = h.unit(from);
  if (!f0) return;
  const pts: [number, number][] = [[f0.x, f0.y]];
  let cur = f0;
  for (let i = 0; i < hops; i++) {
    const next = h.enemies(cur.x, cur.y, 72, owner).filter((x) => !done.has(x))
      .sort((a, b) => { const A = h.unit(a)!, B = h.unit(b)!; return Math.hypot(A.x - cur.x, A.y - cur.y) - Math.hypot(B.x - cur.x, B.y - cur.y); })[0];
    if (!next) break;
    done.add(next);
    dmg *= 0.8;
    const n = h.unit(next)!;
    pts.push([n.x, n.y]);
    h.hit(owner, next, dmg, pushFrom(h, cur.x, cur.y, next), { stunMs: e.stunMs, slowMs: e.slowMs, kb: 0.3, skill: true });
    cur = n;
  }
  if (pts.length > 1) h.fx({ ev: "chain", id: owner, pts });
}

/** A skill projectile stops at (x, y): explosion and ground effect. */
/** A pulsing projectile (ShotDef.pulse) flew `every` px further: it sets off its area and/or shoots its shard ring from where it is now. */
export function shotPulse(h: SkillHost, s: ShotSpec, x: number, y: number) {
  const p = s.pulse;
  if (!p) return;
  const i = s.pulses = (s.pulses ?? 0) + 1;
  if (p.area) area(h, s.owner, { id: s.skill }, p.area, s.power, rankTime(s.rank), [x, y]);
  if (p.shards) {
    const n = p.shards.n ?? 1;
    const a = Math.atan2(s.vy, s.vx) + (i * (p.turn ?? 0)) * Math.PI / 180;
    // n shots fanned over 360 * (n-1)/n degrees = evenly all around; fire() lifts shots 4 px, so start 4 px lower
    fire(h, s.owner, s.skill, { ...p.shards, spread: 360 * (n - 1) / n }, s.rank, s.power, x, y + 4, [Math.cos(a), Math.sin(a)]);
  }
}

export function shotEnd(h: SkillHost, s: ShotSpec, x: number, y: number) {
  if (s.explode > 0) {
    area(h, s.owner, { id: s.skill }, { r: s.explode, dmg: 0, slowMs: s.slowMs, burn: s.burn, kb: s.kb, look: "burst" }, 1, 1, [x, y]);
    // the explosion's damage is the projectile's own
    if (s.dmg > 0) for (const e of h.enemies(x, y, s.explode, s.owner)) h.hit(s.owner, e, s.dmg * 0.6, pushFrom(h, x, y, e), { kb: s.kb ?? 1, skill: true });
  }
  if (s.field) h.addField({ owner: s.owner, skill: s.skill, def: s.field, rank: s.rank, power: s.power, x, y, until: h.now() + s.field.ms * rankTime(s.rank), nextTick: h.now() });
}

// ---- Ground effects ----------------------------------------------------------------------------------

/** Advance a ground effect. Returns false when it is over (the host removes it). */
export function tickField(h: SkillHost, f: FieldInst): boolean {
  const now = h.now();
  const o = h.unit(f.owner);
  if (now >= f.until) return false;
  if (f.def.follow) {
    if (!o || o.dead) return false;
    f.x = o.x; f.y = o.y;
  }
  if (now < f.nextTick) return true;
  f.nextTick = now + f.def.tickMs;
  const d = f.def, t = rankTime(f.rank);
  const inside = h.enemies(f.x, f.y, d.r, f.owner);
  if (d.trap) {
    if (!inside.length) return true;
    if (d.burst) area(h, f.owner, { id: f.skill }, d.burst, f.power, t, [f.x, f.y]);
    return false;
  }
  if (d.zap) {
    const pick = [...inside].sort(() => Math.random() - 0.5).slice(0, d.zap.n);
    for (const e of pick) {
      const tu = h.unit(e)!;
      h.fx({ ev: "zap", id: f.owner, s: f.skill, x1: f.x, y1: f.y, x2: tu.x, y2: tu.y, sky: f.def.kind === "storm" });
      h.hit(f.owner, e, d.zap.dmg * h.magic(f.owner) * f.power, [0, 0], { stunMs: d.zap.stunMs, kb: 0, skill: true });
    }
    // Storm: some bolts strike empty ground too, for the look
    if (d.kind === "storm" && pick.length < d.zap.n) {
      const ang = Math.random() * Math.PI * 2, rr = Math.random() * d.r;
      h.fx({ ev: "zap", id: f.owner, s: f.skill, x1: f.x, y1: f.y, x2: f.x + Math.cos(ang) * rr, y2: f.y + Math.sin(ang) * rr, sky: true });
    }
  }
  if (d.turret) {
    const tid = nearest(h, f.owner, f.x, f.y, d.r);
    if (tid) {
      const tu = h.unit(tid)!;
      const aim = norm(tu.x - f.x, tu.y - f.y);
      h.fx({ ev: "turret", id: f.owner, s: f.skill, x: f.x, y: f.y });
      fire(h, f.owner, f.skill, d.turret, f.rank, f.power, f.x, f.y - 6, aim);
    }
  }
  if (d.wpn || d.dmg || d.slowMs || d.weakMs) {
    const dmg = baseDmg(h, f.owner, d) * f.power;
    for (const e of inside) h.hit(f.owner, e, dmg, pushFrom(h, f.x, f.y, e), { ...effects(d, t), kb: d.kb ?? 0, skill: true, dot: !d.kb });
  }
  if (d.heal && o && !o.dead && o.maxHp && Math.hypot(o.x - f.x, o.y - f.y) <= d.r) h.heal(f.owner, o.maxHp * d.heal / 100 * f.power);
  return true;
}

// ---- Hooks for the host's damage code ----------------------------------------------------------------

const buffsOf = (u: Unit | undefined, now: number) => (u ? u.sk.buffs.filter((b) => b.until > now) : []);

/** Multiplier on damage dealt by `u` (buffs, stacks spent on Berserk, weakened). */
export function dealtMult(u: Unit | undefined, now: number): number {
  if (!u) return 1;
  let m = 1;
  for (const b of buffsOf(u, now)) m += ((b.b.dmg ?? 0) + (b.b.perStack ?? 0) * b.stacks) / 100;
  if (now < u.sk.weakUntil) m *= 1 - WEAK_DEALT;
  return m;
}
/** Multiplier on damage taken by `u` (armour buffs, marked). */
export function takenMult(u: Unit | undefined, now: number): number {
  if (!u) return 1;
  let m = 1;
  for (const b of buffsOf(u, now)) if (b.b.armor) m *= 1 - b.b.armor / 100;
  if (now < u.sk.markUntil) m *= 1 + MARK_TAKEN;
  return m;
}
const sum = (u: Unit | undefined, now: number, k: "speed" | "atkspd" | "lifesteal" | "regen") => buffsOf(u, now).reduce((s, b) => s + (b.b[k] ?? 0), 0);
export const speedMult = (u: Unit | undefined, now: number) => 1 + sum(u, now, "speed") / 100;
export const atkSpeedMult = (u: Unit | undefined, now: number) => 1 + sum(u, now, "atkspd") / 100;
export const buffLifesteal = (u: Unit | undefined, now: number) => sum(u, now, "lifesteal") / 100;
export const buffRegen = (u: Unit | undefined, now: number) => sum(u, now, "regen") / 100;
export const blocking = (u: Unit | undefined, now: number) => buffsOf(u, now).some((b) => b.b.block);
export const ccImmune = (u: Unit | undefined, now: number) => buffsOf(u, now).some((b) => b.b.immune);
export const charging = (u: Unit | undefined, now: number) => !!u && now < u.sk.chargeUntil;

/**
 * Before a hit lands on `tid`: a counter stance eats it and strikes back. Returns true when the hit is cancelled.
 * `from` is the attacker if known (else the counter goes for the nearest enemy).
 */
export function counterHit(h: SkillHost, tid: string, from: string | undefined, dmg: number, o: HitOpts): boolean {
  const u = live(h, tid);
  const now = h.now();
  const c = u?.sk.counter;
  if (!u || !c || o.dot || o.thorn) return false;
  if (now >= c.until) { u.sk.counter = undefined; return false; }
  u.sk.counter = undefined;
  const cd = c.s.counter!;
  const t = rankTime(c.rank);
  const fu = from ? live(h, from) : undefined;
  const foe = fu && Math.hypot(fu.x - u.x, fu.y - u.y) < 90 ? from : nearest(h, tid, u.x, u.y, 70);
  const fx0 = u.x, fy0 = u.y;
  const f = foe ? h.unit(foe) : undefined;
  if (f) h.face(tid, f.x - u.x, f.y - u.y);
  if (cd.blink === "behind" && foe) behind(h, tid, foe);
  if (cd.blink === "back") {
    const [dx, dy] = f ? norm(u.x - f.x, u.y - f.y) : h.aim(tid).map((v) => -v) as [number, number];
    h.move(tid, dx, dy, 50);
    if (f) h.face(tid, f.x - u.x, f.y - u.y);
  }
  h.invuln(tid, now + 250);
  h.fx({ ev: "countered", id: tid, s: c.s.id, fx: fx0, fy: fy0, x: u.x, y: u.y, tx: f?.x, ty: f?.y });
  if (foe && f) {
    const back = baseDmg(h, tid, cd) * c.power + (cd.reflect ? dmg * cd.reflect : 0);
    if (back > 0 || cd.effects) h.hit(tid, foe, back, norm(f.x - u.x, f.y - u.y), { ...effects(cd.effects ?? {}, t), kb: cd.effects?.kb ?? 1, skill: true, crit: cd.blink === "behind", thorn: true });
  }
  if (cd.area) area(h, tid, c.s, cd.area, c.power, t, [u.x, u.y]);
  if (cd.shot) fire(h, tid, c.s.id, cd.shot, c.rank, c.power, u.x, u.y, h.aim(tid));
  if (cd.buff) addBuff(h, tid, c.s.id, cd.buff, c.rank);
  return true;
}

/** After damage landed on `tid`: debuffs, enchantments on basic attacks, stacks, thorns. */
export function afterHit(h: SkillHost, from: string | undefined, tid: string, o: HitOpts) {
  const now = h.now();
  const t = h.unit(tid);
  if (!t || t.dead) return;
  const a = from ? h.unit(from) : undefined;
  const e: HitEffects[] = [o];
  if (a && o.basic) {
    // Basic hits build stacks and carry enchantments
    a.sk.stacks = Math.min(MAX_STACKS, a.sk.stacks + 1);
    a.sk.stackAt = now;
    for (const b of buffsOf(a, now)) if (b.b.onHit) {
      e.push(effects(b.b.onHit, rankTime(b.rank)));
      if (b.b.onHit.burn) h.fx({ ev: "enchanthit", id: from, s: b.id, x: t.x, y: t.y });
    }
  }
  const immune = ccImmune(t, now);
  for (const x of e) {
    if (x.burn && from) {
      const [dps, ms] = x.burn;
      // keep the stronger burn
      if (now >= t.sk.burnUntil || dps * ms >= t.sk.burnDps * (t.sk.burnUntil - now)) {
        t.sk.burnDps = dps * (a ? h.magic(from) : 1); t.sk.burnUntil = now + ms; t.sk.burnBy = from;
        if (t.sk.burnNext < now) t.sk.burnNext = now + 500;
      }
    }
    if (x.markMs) t.sk.markUntil = Math.max(t.sk.markUntil, now + x.markMs);
    if (x.weakMs) t.sk.weakUntil = Math.max(t.sk.weakUntil, now + x.weakMs);
    if (x.fearMs && !immune) h.fear(tid, x.fearMs);
  }
  // Thorns (Frost Armor): whoever hits you up close pays
  if (a && from && !o.dot && !o.thorn && Math.hypot(a.x - t.x, a.y - t.y) < 48) {
    for (const b of buffsOf(t, now)) if (b.b.thorns) {
      h.hit(tid, from, baseDmg(h, tid, b.b.thorns), norm(a.x - t.x, a.y - t.y), { ...effects(b.b.thorns, 1), kb: 0, skill: true, thorn: true });
      h.fx({ ev: "thorns", id: tid, s: b.id, x: a.x, y: a.y });
    }
  }
}

/** Every tick for every hero and monster. */
export function tickUnit(h: SkillHost, id: string) {
  const u = h.unit(id);
  if (!u) return;
  const now = h.now();
  const sk = u.sk;
  if (u.dead) { sk.burnUntil = 0; sk.buffs = []; sk.counter = undefined; sk.stacks = 0; sk.chargeUntil = 0; return; }
  if (sk.buffs.length && sk.buffs.some((b) => b.until <= now)) sk.buffs = sk.buffs.filter((b) => b.until > now);
  if (sk.counter && now >= sk.counter.until) sk.counter = undefined;
  if (sk.stacks > 0 && now - sk.stackAt > STACK_DECAY_MS) sk.stacks = 0;
  if (now < sk.burnUntil && now >= sk.burnNext) {
    sk.burnNext = now + 500;
    h.hit(sk.burnBy, id, Math.max(1, sk.burnDps * 0.5), [0, 0], { dot: true, kb: 0, skill: true });
  }
}

/** Status words for the client (comma list): burn, mark, weak, counter, charge and active buff skill ids. */
export function statusOf(u: Unit, now: number): string {
  const sk = u.sk, out: string[] = [];
  if (now < sk.burnUntil) out.push("burn");
  if (now < sk.markUntil) out.push("mark");
  if (now < sk.weakUntil) out.push("weak");
  if (sk.counter && now < sk.counter.until) out.push("counter:" + sk.counter.s.id);
  if (now < sk.chargeUntil) out.push("charge");
  for (const b of sk.buffs) if (b.until > now) out.push(b.id);
  return out.join(",");
}
