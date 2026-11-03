/**
 * PvP balance simulator: duels every class pair at a few levels with typical builds and gear.
 * Run: npx tsx tools/balance/duel.ts [fightsPerPair]
 *
 * It reuses the real numbers and formulas from shared/ (classes, powers, skills, gear, combat), runs every skill with
 * the real skill engine (shared/skillEngine.ts, through a 1D SkillHost) and re-implements the server's hit rules
 * (server/TownRoom.ts: damagePlayer, hitTarget, playerAttack) on a 1D line (no walls). Bots play "sensibly": melee heroes chase, ranged heroes kite and shoot, everyone uses
 * skills, ultimates, dodge rolls and the gear ranged shot when it makes sense. Projectiles can be side-stepped
 * (a miss chance that grows with flight time) since the real game is 2D.
 * Keep the server rules in sync with this file when changing combat code.
 */
import { CLASSES, CLASS_KINDS, ClassKind, COMBO_WINDOW_MS, DODGE, ENERGY, GUARD_REDUCTION } from "../../shared/classes";
import { attackMult, cooldownMult, critChance, heroSpeed, magicMult, maxHpFromStats, statPoints, statsFor, STATS, Stats } from "../../shared/powers";
import { activeSkills, canLearn, SKILLS, SkillDef, talentBonus, talentMult, talentReduce } from "../../shared/skills";
import {
  afterHit, atkSpeedMult, blocking, buffLifesteal, buffRegen, castSkill, ccImmune, charging, cooldownLeft, counterHit, dealtMult, FieldInst, HitOpts,
  newRuntime, shotEnd, shotHit, ShotSpec, SkillHost, speedMult, takenMult, tickField, tickUnit,
} from "../../shared/skillEngine";
import { Equipped, GEAR, gearBlock, gearReachMult, gearSpeedMult, gearStats } from "../../shared/gear";
import { heroPoise, POISE, poiseLevelMult, poiseSpeed } from "../../shared/combat";
import { COMBAT_REGEN_PER_STA, HIT_RADIUS, PLAYER_SPEED, REGEN_DELAY_MS, REGEN_PER_STA, REGEN_RAMP_MS } from "../../shared/constants";

const TICK = 50; // ms, server runs at 20 Hz
const MAX_MS = 60000;
const ARENA = 480; // px: fights happen between walls / obstacles, so kiting can't go on forever // a duel longer than this is decided on HP %
const REACT = 0.55; // chance per tick that a bot acts (about 40ms average reaction delay)
const KB_PX = PLAYER_SPEED * 0.12; // knockback distance per kb unit (moveStep(.., 0.12 * kb) at default speed)

type Ranks = Record<string, number>;
type Build = 0 | 1 | 2; // the branch the build rushes up first
interface Shot { owner: F; x: number; dir: number; speed: number; range: number; traveled: number; radius: number; dmg: number; kb: number; miss: boolean; hit: boolean; basic: boolean; spec?: ShotSpec; pierced: boolean }
interface Pending { at: number; fn: () => void }

class F {
  x = 0; y = 0; face = 1; hp = 0; maxHp = 0; s: Stats; energy = ENERGY.max; dead = false;
  poiseLost = 0; lastPoiseHit = 0; brokenUntil = 0; steadyUntil = 0; broken = false;
  invulnUntil = 0; rollUntil = 0; rollDir = 0; lastDodge = -1e9; lastRanged = -1e9; lastHurt = 0;
  attackReadyAt = 0; lastAttack = 0; combo = 0; stunUntil = 0; slowUntil = 0; dealt = 0; lastMove = 0;
  sk = newRuntime();
  get talents() { return this.t; }
  constructor(public id: string, public cls: ClassKind, public level: number, public t: Ranks, public eq: Equipped, pts: Stats) {
    const st = statsFor(cls, pts);
    const g = gearStats(cls, eq);
    st.sta += g.sta; st.str += g.str; st.mag += g.mag; st.dex += g.dex;
    this.s = st;
    this.maxHp = Math.round(maxHpFromStats(cls, st, level) * talentMult(cls, t, "hp"));
    this.hp = this.maxHp;
  }
  get poiseMax() { return heroPoise(this.cls, this.level); }
  get ranged() { return !!CLASSES[this.cls].projectile; }
}

// ---- Typical builds -----------------------------------------------------------------------------------
/** Spend the level's points: rush up branch `main`, then a second branch, ranks last. */
function talentsFor(cls: ClassKind, level: number, main: Build): Ranks {
  const r: Ranks = {};
  const order = [main, (main + 1) % 3, (main + 2) % 3];
  const byRow = (b: number) => SKILLS[cls].filter((x) => x.branch === b).sort((a, c) => a.req - c.req);
  const wish: string[] = [...byRow(order[0]), ...byRow(order[1]).slice(0, 3), ...byRow(order[0]), ...byRow(order[2]).slice(0, 2), ...byRow(order[0]), ...byRow(order[1])].map((x) => x.id);
  for (let pass = 0; pass < 4; pass++) for (const id of wish) if (canLearn(cls, level, r, id)) r[id] = (r[id] ?? 0) + 1;
  return r;
}

/** Stat points: ~50% into the attack stat, 20% Dexterity, the rest into Stamina. */
function pointsFor(cls: ClassKind, level: number): Stats {
  const n = statPoints(level);
  const atk = Math.round(n * 0.5), dex = Math.round(n * 0.2);
  const out: Stats = { sta: n - atk - dex, str: 0, mag: 0, dex };
  out[STATS[cls].attackStat] += atk;
  return out;
}

/** Gear by level: nothing at 1, common (tier 1) at 5, rare (tier 2) at 10. Melee heroes carry a shield. */
function gearFor(cls: ClassKind, level: number): Equipped {
  if (level < 5) return {};
  const t2 = level >= 10;
  return {
    weapon: t2 ? "w_frost" : "w_bronze",
    armour: t2 ? "a_chain" : "a_leather",
    shoes: t2 ? "s_swift" : "s_leather",
    hat: t2 ? "h_helm" : "h_cap",
    ranged: t2 ? "r_knives" : "r_sling",
    shield: t2 ? "sh_iron" : "sh_wood",
  };
}

// ---- Duel -----------------------------------------------------------------------------------------------
export class Duel {
  now = 0; shots: Shot[] = []; pending: Pending[] = []; fields: FieldInst[] = [];
  host: SkillHost;
  constructor(public a: F, public b: F, public rnd = Math.random) {
    const d = 100 + rnd() * 60;
    a.x = (ARENA - d) / 2; b.x = a.x + d; a.face = 1; b.face = -1;
    const f = (id: string) => (id === a.id ? a : id === b.id ? b : undefined);
    const clamp = (x: number) => Math.max(0, Math.min(ARENA, x));
    this.host = {
      now: () => this.now,
      later: (ms, fn) => this.pending.push({ at: this.now + ms, fn }),
      unit: (id) => f(id),
      canAct: (id) => { const u = f(id); return !!u && !u.dead && this.now >= u.stunUntil && !u.broken; },
      enemies: (x, _y, r, of) => { const t = f(of) === a ? b : a; return !t.dead && this.now >= t.invulnUntil && Math.abs(t.x - x) <= r ? [t.id] : []; },
      hit: (att, tid, dmg, push, o) => {
        const A = f(att), T = f(tid);
        if (A && o?.skill && !o.dot && !o.crit && this.rnd() < critChance(A.s, talentBonus(A.cls, A.t, "crit"))) { dmg *= 2; o = { ...o, crit: true }; }
        if (T) this.hit(A, T, dmg, Math.sign(push[0]) || 0, o);
      },
      heal: (id, amount) => { const u = f(id); if (u && !u.dead) u.hp = Math.min(u.maxHp, u.hp + amount); },
      aim: (id) => [f(id)?.face ?? 1, 0],
      face: (id, dx) => { const u = f(id); if (u && dx) u.face = Math.sign(dx); },
      move: (id, dx, _dy, dist, each) => {
        const u = f(id);
        if (!u || !dx) return;
        for (let m = 0; m < dist; m += 4) { const nx = clamp(u.x + Math.sign(dx) * Math.min(4, dist - m) * Math.abs(dx)); if (nx === u.x) break; u.x = nx; each?.(); }
      },
      place: (id, x) => { const u = f(id); if (!u) return false; u.x = clamp(x); return true; },
      invuln: (id, until) => { const u = f(id); if (u) u.invulnUntil = Math.max(u.invulnUntil, until); },
      shoot: (sp) => {
        const o = f(sp.owner)!, t = o === a ? b : a;
        const dir = Math.sign(sp.vx) || o.face;
        // Fanned shots: in 2D they spread sideways, so only the ones whose line passes the target can hit
        const dist = Math.abs(t.x - sp.x);
        const side = Math.abs(sp.vy / (Math.abs(sp.vx) || 0.01)) * dist;
        const miss = side > sp.radius + HIT_RADIUS + 4 || this.rnd() < this.missChance(dist, sp.speed) * (sp.pierce > 50 ? 0.6 : 1);
        this.shots.push({ owner: o, x: sp.x, dir, speed: sp.speed, range: sp.range, traveled: 0, radius: sp.radius, dmg: sp.dmg, kb: sp.kb ?? 1, miss, hit: false, basic: false, spec: sp, pierced: false });
      },
      addField: (fi) => this.fields.push(fi),
      fear: (id, ms) => { const u = f(id); if (u) { u.slowUntil = Math.max(u.slowUntil, this.now + ms); u.sk.weakUntil = Math.max(u.sk.weakUntil, this.now + ms); } },
      weaponHit: (id) => { const u = f(id)!; return CLASSES[u.cls].damage * attackMult(u.cls, u.s); },
      magic: (id) => { const u = f(id)!; return magicMult(u.cls, u.s); },
      stats: (id) => f(id)?.s,
      cooldownMult: (id) => { const u = f(id)!; return cooldownMult(u.cls, u.s, u.t); },
      fx: () => {},
    };
  }
  other(f: F) { return f === this.a ? this.b : this.a; }

  damage(t: F, dmg: number, by: F | undefined, push: number, kbMul: number, o: HitOpts): boolean {
    const now = this.now;
    if (t.dead || now < t.invulnUntil) return false;
    if (counterHit(this.host, t.id, by?.id, dmg, o)) return false;
    const guarded = blocking(t, now);
    if (guarded) dmg = Math.max(1, Math.round(dmg * (1 - GUARD_REDUCTION)));
    dmg = Math.max(1, Math.round(dmg * talentReduce(t.cls, t.t, "armor") * takenMult(t, now)));
    const block = gearBlock(t.eq);
    if (block) dmg = Math.max(1, Math.round(dmg * (1 - block)));
    const unstoppable = ccImmune(t, now);
    if (o.stunMs && !guarded && !unstoppable) t.stunUntil = Math.max(t.stunUntil, now + o.stunMs);
    if (o.slowMs && !unstoppable) t.slowUntil = Math.max(t.slowUntil, now + o.slowMs);
    const before = t.hp;
    t.hp = Math.max(0, t.hp - dmg);
    t.lastHurt = now;
    if (!unstoppable) {
      const pd = dmg * (o.skill ? POISE.skillMult : 1) * (guarded ? POISE.guardMult : 1) * poiseLevelMult(by?.level ?? t.level, t.level);
      if (pd > 0 && !t.broken && now >= t.steadyUntil) {
        t.poiseLost += pd; t.lastPoiseHit = now;
        if (t.poiseLost >= t.poiseMax) { t.poiseLost = t.poiseMax; t.broken = true; t.brokenUntil = now + POISE.heroBrokenMs; }
      }
      if (!guarded) t.attackReadyAt = Math.max(t.attackReadyAt, now + POISE.heroFlinchMs);
    }
    if (!guarded && !unstoppable) t.x += push * KB_PX * kbMul;
    const dealt = before - t.hp;
    if (by) {
      by.dealt += dealt;
      const share = talentBonus(by.cls, by.t, "lifesteal") / 100 + buffLifesteal(by, now);
      if (share > 0 && !by.dead && dealt > 0) by.hp = Math.min(by.maxHp, by.hp + dealt * share);
    }
    if (t.hp <= 0) { t.dead = true; return true; }
    afterHit(this.host, by?.id, t.id, o);
    return false;
  }

  hit(a: F | undefined, t: F, dmg: number, push: number, o: HitOpts = {}) {
    if (a) dmg = dmg * talentMult(a.cls, a.t, "dmg") * (o.skill && !o.dot ? talentMult(a.cls, a.t, "skill") : 1) * dealtMult(a, this.now);
    this.damage(t, Math.max(1, Math.round(dmg)), a, push, o.kb ?? 1, o);
  }

  /** Targets within r of point x (the other fighter only). */
  around(a: F, x: number, r: number) { const t = this.other(a); return !t.dead && Math.abs(t.x - x) <= r ? [t] : []; }

  attack(a: F) {
    const now = this.now;
    if (a.dead || now < a.stunUntil || a.broken || now < a.attackReadyAt || now < a.rollUntil || charging(a, now)) return;
    const def = CLASSES[a.cls];
    const step = a.lastAttack > 0 && now - a.attackReadyAt <= COMBO_WINDOW_MS && a.combo < 2 ? a.combo + 1 : 0;
    const h = def.combo[step];
    a.combo = step; a.lastAttack = now;
    const frac = a.broken ? 0 : Math.max(0, 1 - a.poiseLost / a.poiseMax);
    const spd = poiseSpeed(frac) * atkSpeedMult(a, now);
    a.attackReadyAt = now + (h.cooldownMs ?? def.attackCooldownMs) / spd;
    let dmg = Math.round(def.damage * attackMult(a.cls, a.s) * h.damage);
    const crit = this.rnd() < critChance(a.s, talentBonus(a.cls, a.t, "crit"));
    if (crit) dmg *= 2;
    if (h.lunge) a.x += a.face * h.lunge;
    if (def.projectile) return this.shoot(a, dmg, h.knockback, h.shotScale ?? 1);
    const rm = gearReachMult(a.eq);
    const reach = (h.range ?? def.attackRange) * rm;
    const hx = a.x + a.face * 12 * rm;
    for (const t of this.around(a, hx, reach)) this.hit(a, t, dmg, a.face, { kb: h.knockback, crit, basic: true });
  }

  /** Side-step chance: the longer a shot flies, the easier it is to walk out of its line in 2D. */
  missChance(dist: number, speed: number) { return Math.min(0.45, Math.max(0, (dist / speed - 0.3) * 0.6)); }

  shoot(a: F, dmg: number, kb: number, scale: number) {
    const def = CLASSES[a.cls].projectile!;
    const t = this.other(a);
    const range = def.range * gearReachMult(a.eq);
    const miss = this.rnd() < this.missChance(Math.abs(t.x - a.x), def.speed);
    this.shots.push({ owner: a, x: a.x + a.face * 6, dir: a.face, speed: def.speed, range, traveled: 0, radius: def.radius * scale, dmg, kb, miss, hit: false, basic: true, pierced: false });
  }

  fireRanged(a: F) {
    const shot = a.eq.ranged ? GEAR[a.eq.ranged]?.shot : undefined;
    const now = this.now;
    if (!shot || a.dead || now < a.stunUntil || a.broken || now < a.rollUntil || now - a.lastRanged < shot.cooldownMs || charging(a, now)) return false;
    a.lastRanged = now;
    const t = this.other(a);
    this.shots.push({ owner: a, x: a.x + a.face * 6, dir: a.face, speed: shot.speed, range: shot.range, traveled: 0, radius: 3,
      dmg: Math.round(shot.damage * attackMult(a.cls, a.s)), kb: 0.6, miss: this.rnd() < this.missChance(Math.abs(t.x - a.x), shot.speed), hit: false, basic: false, pierced: false });
    return true;
  }

  /** Would skill `s` reach the target from here (facing it)? A rough bot judgement. */
  useful(a: F, s: SkillDef, d: number, incoming: boolean, tReach: number): boolean {
    if (s.counter) return incoming || d <= tReach + 4;
    if (s.areas?.length) {
      const ar = s.areas[0];
      const at = s.move ? (s.move.kind === "behind" ? 0 : s.move.kind === "multi" ? 0 : s.move.dist) + (ar.ahead ?? 0) : ar.ahead ?? 0;
      if (s.move?.kind === "behind" || s.move?.kind === "multi") return d <= s.move.dist;
      if (ar.atStart) return d <= ar.r;
      const reach = at + ar.r + (ar.line ?? 0) * ((ar.waves ?? 1) - 1);
      return d <= reach - 4 && d >= at - ar.r;
    }
    if (s.shots) return d <= s.shots.range * 0.9;
    if (s.field) return s.field.trap ? d < 70 : d <= (s.field.ahead ?? 0) + s.field.r - 4;
    if (s.cry) return d <= s.cry.r - 6;
    if (s.move) return a.ranged ? false : d > 40 && d < s.move.dist + 30;
    if (s.buff) return d < 80;
    return false;
  }

  /** Bot: cast the best ready skill (highest level first). */
  castSkills(a: F, d: number, toward: number, incoming: boolean, tReach: number) {
    if (charging(a, this.now)) return;
    const ready = activeSkills(a.cls).filter((s) => (a.t[s.id] ?? 0) > 0 && cooldownLeft(s, a.sk, this.now, cooldownMult(a.cls, a.s, a.t)) <= 0 && a.energy >= (s.cost ?? 0))
      .sort((x, y) => y.req - x.req);
    for (const s of ready) {
      if (s.consume && a.sk.stacks < 3 && !s.buff) continue; // wait for some stacks
      if (!this.useful(a, s, d, incoming, tReach)) continue;
      a.face = toward;
      if (castSkill(this.host, a.id, s.id)) return;
    }
  }

  dodge(a: F, dir: number) {
    const now = this.now;
    if (a.dead || now < a.stunUntil || now - a.lastDodge < DODGE.cooldownMs || a.energy < ENERGY.cost.dodge) return false;
    a.energy -= ENERGY.cost.dodge; a.lastDodge = now; a.rollUntil = now + DODGE.durationMs; a.rollDir = dir;
    a.invulnUntil = Math.max(a.invulnUntil, now + DODGE.invulnMs);
    if (dir) a.face = dir;
    return true;
  }

  // ---- Bot -----------------------------------------------------------------------------------------------
  /** Returns the move direction (-1, 0, 1) for this tick and fires actions. */
  think(a: F): number {
    const t = this.other(a);
    const now = this.now;
    const d = Math.abs(t.x - a.x), toward = Math.sign(t.x - a.x) || 1;
    const def = CLASSES[a.cls];
    const rm = gearReachMult(a.eq);
    const meleeReach = (12 + def.attackRange) * rm;
    const tReach = t.ranged ? 999 : (12 + CLASSES[t.cls].attackRange) * gearReachMult(t.eq) + 6;
    const canSpend = (c: number) => a.energy - c >= 20; // keep some for skills
    const incoming = this.shots.find((s) => s.owner === t && !s.hit && Math.sign(a.x - s.x) === s.dir && Math.abs(a.x - s.x) < 40 && !s.miss);
    if (now < a.stunUntil) return 0;
    // Human reaction: a player doesn't act on every server tick
    if (this.rnd() > REACT) return a.lastMove;
    if (charging(a, now)) return 0;
    this.castSkills(a, d, toward, !!incoming, tReach);
    // Dodge incoming shots sometimes (human reaction), ranged heroes roll away from melee
    if (incoming && this.rnd() < 0.3 && canSpend(ENERGY.cost.dodge + 10)) this.dodge(a, a.ranged ? -toward : toward);
    if (!a.ranged && t.ranged && d > 70 && canSpend(ENERGY.cost.dodge + ENERGY.cost.special) && this.rnd() < 0.1) this.dodge(a, toward);
    if (now < a.rollUntil) return 0;

    if (a.ranged) {
      const range = def.projectile!.range * rm;
      const kite = !t.ranged && d < tReach + 30;
      // Cornered against a wall: roll through the melee hero to get out
      const cornered = (a.x < 12 && toward < 0) || (a.x > ARENA - 12 && toward > 0) || (a.x < 12 && -toward < 0) || (a.x > ARENA - 12 && -toward > 0);
      if (kite && cornered && d < tReach + 10 && this.dodge(a, toward)) return 0;
      if (now >= a.attackReadyAt && !a.broken && d <= range * 0.95 && !(kite && d < tReach)) { a.face = toward; this.attack(a); return 0; }
      if (d <= range && this.fireRanged((a.face = toward, a))) return 0;
      if (kite || d < (t.ranged ? range * 0.7 : 60)) return -toward;
      if (d > range * 0.9) return toward;
      return 0;
    }
    // Melee: chase and swing
    a.face = toward;
    if (d <= meleeReach) { this.attack(a); return d < meleeReach * 0.5 ? 0 : toward; }
    if (d > meleeReach + 20 && d < 150) this.fireRanged(a);
    return toward;
  }

  step(): F | null | undefined {
    const now = this.now;
    for (const f of [this.a, this.b]) {
      tickUnit(this.host, f.id);
      if (f.broken && now >= f.brokenUntil) { f.broken = false; f.poiseLost = 0; f.steadyUntil = now + POISE.steadyMs; }
      else if (!f.broken && f.poiseLost > 0 && now - f.lastPoiseHit >= POISE.regenDelayMs) f.poiseLost = Math.max(0, f.poiseLost - f.poiseMax * POISE.regenPerSec * TICK / 1000);
      f.energy = Math.min(ENERGY.max, f.energy + ENERGY.regenPerSec * TICK / 1000);
    }
    const order = this.rnd() < 0.5 ? [this.a, this.b] : [this.b, this.a];
    const moves = new Map<F, number>();
    for (const f of order) if (!f.dead) { const m = this.think(f); f.lastMove = m; moves.set(f, m); }
    for (const f of [this.a, this.b]) f.x = Math.max(0, Math.min(ARENA, f.x));
    for (const f of [this.a, this.b]) {
      if (f.dead) continue;
      const dt = TICK / 1000;
      if (now < f.stunUntil || charging(f, now)) continue;
      if (now < f.rollUntil) { f.x += f.rollDir * DODGE.distance / (DODGE.durationMs / 1000) * dt; continue; }
      const m = moves.get(f) ?? 0;
      const sp = heroSpeed(f.cls, now < f.slowUntil, speedMult(f, now) * talentMult(f.cls, f.t, "speed")) * gearSpeedMult(f.eq);
      f.x += m * sp * dt;
      if (m) f.face = m;
      // regen
      if (f.hp < f.maxHp) {
        const ramp = Math.min(1, Math.max(0, (now - f.lastHurt - REGEN_DELAY_MS) / REGEN_RAMP_MS));
        const fight = f.s.sta * COMBAT_REGEN_PER_STA, rest = f.s.sta * REGEN_PER_STA;
        f.hp = Math.min(f.maxHp, f.hp + (fight + (rest - fight) * ramp) * dt + f.maxHp * (talentBonus(f.cls, f.t, "regen") / 100 + buffRegen(f, now)) * dt);
      }
    }
    // projectiles
    for (const f of [this.a, this.b]) f.x = Math.max(0, Math.min(ARENA, f.x));
    for (const s of this.shots) {
      if (s.hit) continue;
      const total = s.speed * TICK / 1000, n = Math.max(1, Math.ceil(total / 4));
      for (let i = 0; i < n && !s.hit; i++) {
        s.x += s.dir * total / n; s.traveled += total / n;
        if (s.traveled >= s.range) { s.hit = true; if (s.spec) shotEnd(this.host, s.spec, s.x, 0); break; }
        const t = this.other(s.owner);
        if (!t.dead && !s.miss && !s.pierced && Math.abs(t.x - s.x) <= s.radius + HIT_RADIUS && now >= t.invulnUntil) {
          if (s.spec) {
            shotHit(this.host, s.spec, t.id);
            if (s.spec.pierce > 0) { s.pierced = true; continue; }
            s.hit = true; shotEnd(this.host, s.spec, s.x, 0);
          } else {
            s.hit = true;
            this.hit(s.owner, t, s.dmg, s.dir, { kb: s.kb, basic: s.basic });
          }
        }
      }
    }
    this.shots = this.shots.filter((s) => !s.hit);
    this.fields = this.fields.filter((f) => tickField(this.host, f));
    const due = this.pending.filter((p) => p.at <= now);
    this.pending = this.pending.filter((p) => p.at > now);
    for (const p of due) p.fn();
    this.now += TICK;
    if (this.a.dead || this.b.dead) return this.a.dead && this.b.dead ? null : this.a.dead ? this.b : this.a;
    return undefined;
  }

  run(): F | null {
    while (this.now < MAX_MS) {
      const w = this.step();
      if (w !== undefined) return w;
    }
    const fa = this.a.hp / this.a.maxHp, fb = this.b.hp / this.b.maxHp;
    return Math.abs(fa - fb) < 0.02 ? null : fa > fb ? this.a : this.b;
  }
}

export function make(id: string, cls: ClassKind, level: number, build: Build) {
  return new F(id, cls, level, talentsFor(cls, level, build), gearFor(cls, level), pointsFor(cls, level));
}

/** Win rate of `x` against `y` (draws count half), side swapped every fight; each hero picks a random build. */
export function winRate(x: ClassKind, y: ClassKind, level: number, n: number, build?: Build): number {
  let w = 0;
  for (let i = 0; i < n; i++) {
    const bx = build ?? (Math.floor(Math.random() * 3) as Build), by = (Math.floor(Math.random() * 3) as Build);
    const fx = make("x", x, level, bx), fy = make("y", y, level, by);
    const d = i % 2 ? new Duel(fx, fy) : new Duel(fy, fx);
    const r = d.run();
    w += r === fx ? 1 : r === null ? 0.5 : 0;
  }
  return w / n;
}

const pct = (v: number) => `${Math.round(v * 100)}%`.padStart(5);

if (process.argv[1]?.includes("duel")) {
  const n = Number(process.argv[2]) || 400;
  const configs: [number, Build | undefined, string][] = [[1, undefined, ""], [5, undefined, ""], [10, undefined, " (random builds)"], [25, undefined, " (random builds)"], [25, 0, " (branch 1 build)"], [25, 1, " (branch 2 build)"], [25, 2, " (branch 3 build)"]];
  for (const [level, build, label] of configs) {
    console.log(`\nLevel ${level}${label}: row hero's win rate vs column hero`);
    console.log("          " + CLASS_KINDS.map((c) => c.slice(0, 6).padStart(7)).join("") + "  overall");
    for (const x of CLASS_KINDS) {
      const row = CLASS_KINDS.map((y) => (x === y ? 0.5 : winRate(x, y, level, n, build)));
      const overall = row.reduce((s, v, i) => s + (CLASS_KINDS[i] === x ? 0 : v), 0) / (CLASS_KINDS.length - 1);
      console.log(x.padEnd(10) + row.map((v, i) => (CLASS_KINDS[i] === x ? "    -  " : pct(v) + "  ")).join("") + pct(overall));
    }
  }
}
