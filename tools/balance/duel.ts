/**
 * PvP balance simulator: duels every class pair at a few levels with typical builds and gear.
 * Run: npx tsx tools/balance/duel.ts [fightsPerPair]
 *
 * It reuses the real numbers and formulas from shared/ (classes, powers, talents, gear, combat) and re-implements
 * the server's hit rules (server/TownRoom.ts: damagePlayer, hitTarget, playerAttack, playerSpecial, playerUlt)
 * on a 1D line (no walls). Bots play "sensibly": melee heroes chase, ranged heroes kite and shoot, everyone uses
 * skills, ultimates, dodge rolls and the gear ranged shot when it makes sense. Projectiles can be side-stepped
 * (a miss chance that grows with flight time) since the real game is 2D.
 * Keep the server rules in sync with this file when changing combat code.
 */
import { CLASSES, CLASS_KINDS, ClassKind, COMBO_WINDOW_MS, DASH_INVULN_MS, DODGE, ENERGY, GUARD_REDUCTION } from "../../shared/classes";
import {
  attackMult, BLOODTHIRST, cooldownMult, CRIT, EAGLE_EYE_RANGE, FROST, GROUND_SLAM_STUN_MS, hasPower, hasSpecial, hasUlt, heroSpeed, IGNITE,
  IRONSKIN_REDUCTION, magicMult, maxHpFromStats, PINNING, POWERS, powerNodeId, RAGE, SECOND_WIND, SHADOW_STRIKE_DAMAGE, statPoints, VOLLEY_DAMAGE, statsFor, ULTS, STATS,
  Stats,
} from "../../shared/powers";
import { COMBO_NODE, talentBonus, talentMult, talentReduce, TREES } from "../../shared/talents";
import { Equipped, GEAR, gearBlock, gearReachMult, gearSpeedMult, gearStats } from "../../shared/gear";
import { heroPoise, POISE, poiseLevelMult, poiseSpeed, RAGE_ATTACK_SPEED } from "../../shared/combat";
import { COMBAT_REGEN_PER_STA, HIT_RADIUS, PLAYER_SPEED, REGEN_DELAY_MS, REGEN_PER_STA, REGEN_RAMP_MS } from "../../shared/constants";

const TICK = 50; // ms, server runs at 20 Hz
const MAX_MS = 60000;
const ARENA = 480; // px: fights happen between walls / obstacles, so kiting can't go on forever // a duel longer than this is decided on HP %
const REACT = 0.55; // chance per tick that a bot acts (about 40ms average reaction delay)
const KB_PX = PLAYER_SPEED * 0.12; // knockback distance per kb unit (moveStep(.., 0.12 * kb) at default speed)

type Ranks = Record<string, number>;
interface Opts { kb?: number; skill?: boolean; stunMs?: number; slowMs?: number; crit?: boolean }
interface Shot { owner: F; x: number; dir: number; speed: number; range: number; traveled: number; radius: number; dmg: number; kb: number; ignite: boolean; slowMs: number; miss: boolean; hit: boolean }
interface Pending { at: number; fn: () => void }

class F {
  x = 0; face = 1; hp = 0; maxHp = 0; s: Stats; energy = ENERGY.max; dead = false;
  poiseLost = 0; lastPoiseHit = 0; brokenUntil = 0; steadyUntil = 0; broken = false;
  guardUntil = 0; invulnUntil = 0; rollUntil = 0; rollDir = 0; lastDodge = -1e9; lastRanged = -1e9; lastHurt = 0;
  attackReadyAt = 0; lastAttack = 0; combo = 0; stunUntil = 0; slowUntil = 0; lastSpecial = -1e9; lastUlt = -1e9;
  secondWindAt = 0; rageUntil = 0; dealt = 0; lastMove = 0;
  constructor(public cls: ClassKind, public level: number, public t: Ranks, public eq: Equipped, pts: Stats) {
    const st = statsFor(cls, pts);
    const g = gearStats(cls, eq);
    st.sta += g.sta; st.str += g.str; st.mag += g.mag;
    this.s = st;
    this.maxHp = Math.round(maxHpFromStats(cls, st, level) * talentMult(cls, t, "hp"));
    this.hp = this.maxHp;
  }
  get poiseMax() { return heroPoise(this.cls, this.level); }
  get ranged() { return !!CLASSES[this.cls].projectile; }
}

// ---- Typical builds -----------------------------------------------------------------------------------
/** Skill tree order for a "skills" build (class skills first) and an "ultimate" build (rush the Lv10 ult). */
function talentsFor(cls: ClassKind, level: number, build: "skills" | "ult"): Ranks {
  const [b0, b1, b2] = TREES[cls].map((b) => b.talents.map((x) => x.id));
  const pw = POWERS[cls].map((p) => powerNodeId(p.id));
  // [node id, level needed]; nodes listed in a valid order (each column's node below is learned first)
  const skills: [string, number][] = [
    [pw[0], 1], [COMBO_NODE, 1], [b0[0], 1], [pw[1], 3], [b2[0], 3], [pw[2], 5], [b0[1], 5], [pw[3], 8], [b0[0], 1], [b0[0], 1],
    [b1[0], 3], [b1[1], 5], [b1[2], 8], [pw[4], 10],
  ];
  const ult: [string, number][] = [
    [pw[0], 1], [COMBO_NODE, 1], [b1[0], 3], [b0[0], 1], [pw[1], 3], [b1[1], 5], [b1[2], 8], [pw[4], 10], [b0[0], 1],
    [b2[0], 3], [pw[2], 5],
  ];
  const r: Ranks = {};
  let pts = Math.max(0, level - 1);
  for (const [id, lv] of build === "ult" ? ult : skills) {
    if (pts <= 0) break;
    if (level < lv) continue;
    r[id] = (r[id] ?? 0) + 1;
    pts--;
  }
  return r;
}

/** Stat points: ~60% into the attack stat, the rest into Stamina. */
function pointsFor(cls: ClassKind, level: number): Stats {
  const n = statPoints(level);
  const atk = Math.round(n * 0.6);
  const out: Stats = { sta: n - atk, str: 0, mag: 0 };
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
class Duel {
  now = 0; shots: Shot[] = []; pending: Pending[] = [];
  constructor(public a: F, public b: F, public rnd = Math.random) {
    const d = 100 + rnd() * 60;
    a.x = (ARENA - d) / 2; b.x = a.x + d; a.face = 1; b.face = -1;
  }
  other(f: F) { return f === this.a ? this.b : this.a; }

  damage(t: F, dmg: number, by: F, push: number, kbMul: number, o: Opts): boolean {
    const now = this.now;
    if (t.dead || now < t.invulnUntil) return false;
    const guarded = now < t.guardUntil;
    if (guarded) dmg = Math.max(1, Math.round(dmg * (1 - GUARD_REDUCTION)));
    if (hasPower(t.cls, t.t, "ironskin")) dmg = Math.max(1, Math.round(dmg * (1 - IRONSKIN_REDUCTION)));
    dmg = Math.max(1, Math.round(dmg * talentReduce(t.cls, t.t, "armor")));
    const block = gearBlock(t.eq);
    if (block) dmg = Math.max(1, Math.round(dmg * (1 - block)));
    const unstoppable = now < t.rageUntil && hasPower(t.cls, t.t, "unstoppable");
    if (o.stunMs && !guarded && !unstoppable) t.stunUntil = Math.max(t.stunUntil, now + o.stunMs);
    if (o.slowMs && !unstoppable) t.slowUntil = Math.max(t.slowUntil, now + o.slowMs);
    const before = t.hp;
    t.hp = Math.max(0, t.hp - dmg);
    t.lastHurt = now;
    if (!unstoppable) {
      const pd = dmg * (o.skill ? POISE.skillMult : 1) * (guarded ? POISE.guardMult : 1) * poiseLevelMult(by.level, t.level);
      if (pd > 0 && !t.broken && now >= t.steadyUntil) {
        t.poiseLost += pd; t.lastPoiseHit = now;
        if (t.poiseLost >= t.poiseMax) { t.poiseLost = t.poiseMax; t.broken = true; t.brokenUntil = now + POISE.heroBrokenMs; }
      }
      if (!guarded) t.attackReadyAt = Math.max(t.attackReadyAt, now + POISE.heroFlinchMs);
    }
    if (!guarded && !unstoppable) t.x += push * KB_PX * kbMul;
    if (t.hp > 0 && t.hp < t.maxHp * SECOND_WIND.threshold && hasPower(t.cls, t.t, "secondwind") && now >= t.secondWindAt) {
      t.secondWindAt = now + SECOND_WIND.cooldownMs;
      t.hp = Math.min(t.maxHp, t.hp + Math.round(t.maxHp * SECOND_WIND.heal));
    }
    // lifesteal (Bloodthirst + tree)
    const dealt = before - t.hp;
    by.dealt += dealt;
    const share = (hasPower(by.cls, by.t, "bloodthirst") ? BLOODTHIRST : 0) + talentBonus(by.cls, by.t, "lifesteal") / 100;
    if (share > 0 && !by.dead && dealt > 0) by.hp = Math.min(by.maxHp, by.hp + dealt * share);
    if (t.hp <= 0) { t.dead = true; return true; }
    return false;
  }

  hit(a: F, t: F, dmg: number, push: number, o: Opts = {}) {
    dmg = Math.round(dmg * talentMult(a.cls, a.t, "dmg") * (o.skill ? talentMult(a.cls, a.t, "skill") : 1));
    this.damage(t, dmg, a, push, o.kb ?? 1, o);
  }

  /** Targets within r of point x (the other fighter only). */
  around(a: F, x: number, r: number) { const t = this.other(a); return !t.dead && Math.abs(t.x - x) <= r ? [t] : []; }
  pushFrom(x: number, t: F) { return Math.sign(t.x - x) || 1; }

  attack(a: F) {
    const now = this.now;
    if (a.dead || now < a.stunUntil || a.broken || now < a.attackReadyAt || now < a.rollUntil) return;
    const def = CLASSES[a.cls];
    const lastStep = (a.t[COMBO_NODE] ?? 0) > 0 ? 2 : 1;
    const step = a.lastAttack > 0 && now - a.attackReadyAt <= COMBO_WINDOW_MS && a.combo < lastStep ? a.combo + 1 : 0;
    const h = def.combo[step];
    a.combo = step; a.lastAttack = now;
    const frac = a.broken ? 0 : Math.max(0, 1 - a.poiseLost / a.poiseMax);
    const spd = poiseSpeed(frac) * (now < a.rageUntil ? RAGE_ATTACK_SPEED : 1);
    a.attackReadyAt = now + (h.cooldownMs ?? def.attackCooldownMs) / spd;
    let dmg = Math.round(def.damage * attackMult(a.cls, a.s) * h.damage);
    const critChance = (hasPower(a.cls, a.t, "crit") ? CRIT.chance : 0) + talentBonus(a.cls, a.t, "crit") / 100;
    const crit = this.rnd() < critChance;
    if (crit) dmg = Math.round(dmg * CRIT.mult);
    if (now < a.rageUntil) dmg = Math.round(dmg * RAGE.damage);
    if (h.lunge) a.x += a.face * h.lunge;
    if (def.projectile) return this.shoot(a, dmg, h.knockback, h.shotScale ?? 1);
    const rm = gearReachMult(a.eq);
    const reach = (h.range ?? def.attackRange) * rm;
    const slam = step === 2 && hasPower(a.cls, a.t, "groundslam") ? GROUND_SLAM_STUN_MS : undefined;
    if (step === 2 && hasPower(a.cls, a.t, "cleave")) {
      for (const t of this.around(a, a.x, reach)) this.hit(a, t, dmg, this.pushFrom(a.x, t), { kb: h.knockback, crit });
      return;
    }
    const hx = a.x + a.face * 12 * rm;
    for (const t of this.around(a, hx, reach)) this.hit(a, t, dmg, a.face, { kb: h.knockback, crit, stunMs: slam });
  }

  /** Side-step chance: the longer a shot flies, the easier it is to walk out of its line in 2D. */
  missChance(dist: number, speed: number) { return Math.min(0.45, Math.max(0, (dist / speed - 0.3) * 0.6)); }

  shoot(a: F, dmg: number, kb: number, scale: number, lanes = 1) {
    const def = CLASSES[a.cls].projectile!;
    const t = this.other(a);
    const range = def.range * (hasPower(a.cls, a.t, "eagleeye") ? EAGLE_EYE_RANGE : 1) * gearReachMult(a.eq);
    const miss = this.rnd() < this.missChance(Math.abs(t.x - a.x), def.speed);
    for (let i = 0; i < lanes; i++) {
      this.shots.push({ owner: a, x: a.x + a.face * 6, dir: a.face, speed: def.speed, range, traveled: 0, radius: def.radius * scale, dmg, kb,
        ignite: hasPower(a.cls, a.t, "ignite"), slowMs: hasPower(a.cls, a.t, "pinning") ? PINNING.durationMs : 0, miss, hit: false });
    }
  }

  fireRanged(a: F) {
    const shot = a.eq.ranged ? GEAR[a.eq.ranged]?.shot : undefined;
    const now = this.now;
    if (!shot || a.dead || now < a.stunUntil || a.broken || now < a.rollUntil || now - a.lastRanged < shot.cooldownMs) return false;
    a.lastRanged = now;
    const t = this.other(a);
    this.shots.push({ owner: a, x: a.x + a.face * 6, dir: a.face, speed: shot.speed, range: shot.range, traveled: 0, radius: 3,
      dmg: Math.round(shot.damage * attackMult(a.cls, a.s)), kb: 0.6, ignite: false, slowMs: 0,
      miss: this.rnd() < this.missChance(Math.abs(t.x - a.x), shot.speed), hit: false });
    return true;
  }

  special(a: F) {
    const now = this.now;
    if (a.dead || now < a.stunUntil || a.broken || !hasSpecial(a.cls, a.t)) return false;
    const sp = CLASSES[a.cls].special;
    if (now - a.lastSpecial < sp.cooldownMs * cooldownMult(a.cls, a.s, a.t) * talentReduce(a.cls, a.t, "cdr")) return false;
    if (a.energy < ENERGY.cost.special) return false;
    a.energy -= ENERGY.cost.special; a.lastSpecial = now;
    switch (sp.kind) {
      case "guard": a.guardUntil = now + (sp.durationMs ?? 2000); break;
      case "dash": {
        const from = a.x;
        a.x += a.face * (sp.distance ?? 56);
        const t = this.other(a);
        if (hasPower(a.cls, a.t, "shadowstrike") && Math.min(from, a.x) - 12 <= t.x && t.x <= Math.max(from, a.x) + 12) {
          this.hit(a, t, Math.round(CLASSES[a.cls].damage * attackMult(a.cls, a.s) * SHADOW_STRIKE_DAMAGE), a.face, { kb: 0.5, skill: true });
        }
        a.invulnUntil = now + DASH_INVULN_MS;
        break;
      }
      case "volley": {
        // 3 arrows 8px apart sideways: all of them fit a single body (hit radius 4 + 6)
        this.shoot(a, Math.round(CLASSES[a.cls].damage * attackMult(a.cls, a.s) * VOLLEY_DAMAGE), 0.8, 1, sp.arrows ?? 3);
        break;
      }
      case "rage": a.rageUntil = now + (sp.durationMs ?? 5000); break;
      case "nova": {
        const dmg = Math.round((sp.damage ?? 30) * magicMult(a.cls, a.s));
        const frost = hasPower(a.cls, a.t, "frost");
        for (const t of this.around(a, a.x, sp.radius ?? 38)) this.hit(a, t, dmg, this.pushFrom(a.x, t), frost ? { slowMs: FROST.durationMs, skill: true } : { skill: true });
        break;
      }
    }
    return true;
  }

  ult(a: F) {
    const now = this.now;
    if (a.dead || now < a.stunUntil || a.broken || !hasUlt(a.cls, a.t)) return false;
    const u = ULTS[a.cls];
    if (now - a.lastUlt < u.cooldownMs * cooldownMult(a.cls, a.s, a.t) * talentReduce(a.cls, a.t, "cdr")) return false;
    if (a.energy < ENERGY.cost.ult) return false;
    a.energy -= ENERGY.cost.ult; a.lastUlt = now;
    const dmg = Math.round(u.damage * magicMult(a.cls, a.s));
    const blast = (x: number, o: Opts = {}) => { for (const t of this.around(a, x, u.radius)) this.hit(a, t, dmg, this.pushFrom(x, t), { ...o, skill: true }); };
    const later = (ms: number, fn: () => void) => this.pending.push({ at: now + ms, fn });
    if (a.cls === "knight") blast(a.x, { stunMs: u.stunMs, kb: 0.5 });
    else if (a.cls === "ninja") for (let i = 0; i < (u.hits ?? 3); i++) later(i * 200, () => { if (!a.dead) blast(a.x, { kb: 0.4 }); });
    else if (a.cls === "wizard") { const x = a.x + a.face * (u.ahead ?? 56); later(u.delayMs ?? 600, () => blast(x, { kb: 2 })); }
    else if (a.cls === "archer") {
      const x = a.x + a.face * (u.ahead ?? 72);
      for (let i = 0; i < (u.hits ?? 4); i++) later((u.delayMs ?? 400) + i * 250, () => blast(x, { kb: 0.3, slowMs: hasPower(a.cls, a.t, "pinning") ? PINNING.durationMs : undefined }));
    } else { a.x += a.face * (u.ahead ?? 64); a.invulnUntil = now + 300; blast(a.x, { kb: 2 }); }
    return true;
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
    const ultReserve = hasUlt(a.cls, a.t) && now - a.lastUlt > ULTS[a.cls].cooldownMs * 0.7 ? ENERGY.cost.ult : 0;
    const canSpend = (c: number) => a.energy - c >= ultReserve;
    const incoming = this.shots.find((s) => s.owner === t && !s.hit && Math.sign(a.x - s.x) === s.dir && Math.abs(a.x - s.x) < 40 && !s.miss);
    if (now < a.stunUntil) return 0;
    // Human reaction: a player doesn't act on every server tick
    if (this.rnd() > REACT) return a.lastMove;

    // Ultimate when the target is where it lands
    if (hasUlt(a.cls, a.t)) {
      const u = ULTS[a.cls];
      const inArea = a.cls === "knight" ? d <= u.radius - 4
        : a.cls === "ninja" ? d <= u.radius - 10
        : Math.abs(d - (u.ahead ?? 0)) <= u.radius - 8;
      if (inArea) { a.face = toward; this.ult(a); }
    }
    // Class skill
    if (canSpend(ENERGY.cost.special)) {
      switch (def.special.kind) {
        case "guard": if (d <= Math.max(tReach, 40) || incoming) this.special(a); break;
        case "nova": if (d <= (def.special.radius ?? 38) - 4) this.special(a); break;
        case "rage": if (d <= 50) this.special(a); break;
        case "volley": if (d <= def.projectile!.range * 0.9) { a.face = toward; this.special(a); } break;
        case "dash":
          if (incoming && this.rnd() < 0.5) { a.face = toward; this.special(a); } // blink through the shot
          else if (d > 40 && d < 80 && t.ranged) { a.face = toward; this.special(a); }
          break;
      }
    }
    // Dodge incoming shots sometimes (human reaction), ranged heroes roll away from melee
    if (incoming && this.rnd() < 0.3 && canSpend(ENERGY.cost.dodge + 10)) this.dodge(a, a.ranged ? -toward : toward);
    if (!a.ranged && t.ranged && d > 70 && canSpend(ENERGY.cost.dodge + ENERGY.cost.special) && this.rnd() < 0.1) this.dodge(a, toward);
    if (now < a.rollUntil) return 0;

    if (a.ranged) {
      const range = def.projectile!.range * (hasPower(a.cls, a.t, "eagleeye") ? EAGLE_EYE_RANGE : 1) * rm;
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
      if (now < f.stunUntil) continue;
      if (now < f.rollUntil) { f.x += f.rollDir * DODGE.distance / (DODGE.durationMs / 1000) * dt; continue; }
      const m = moves.get(f) ?? 0;
      const sp = heroSpeed(f.cls, f.t, now < f.slowUntil, now < f.rageUntil) * gearSpeedMult(f.eq) * talentMult(f.cls, f.t, "speed");
      f.x += m * sp * dt;
      if (m) f.face = m;
      // regen
      if (f.hp < f.maxHp) {
        const ramp = Math.min(1, Math.max(0, (now - f.lastHurt - REGEN_DELAY_MS) / REGEN_RAMP_MS));
        const fight = f.s.sta * COMBAT_REGEN_PER_STA, rest = f.s.sta * REGEN_PER_STA;
        f.hp = Math.min(f.maxHp, f.hp + (fight + (rest - fight) * ramp) * dt + f.maxHp * talentBonus(f.cls, f.t, "regen") / 100 * dt);
      }
    }
    // projectiles
    for (const f of [this.a, this.b]) f.x = Math.max(0, Math.min(ARENA, f.x));
    for (const s of this.shots) {
      if (s.hit) continue;
      const total = s.speed * TICK / 1000, n = Math.max(1, Math.ceil(total / 4));
      for (let i = 0; i < n && !s.hit; i++) {
        s.x += s.dir * total / n; s.traveled += total / n;
        if (s.traveled >= s.range) { s.hit = true; break; }
        const t = this.other(s.owner);
        if (!t.dead && !s.miss && Math.abs(t.x - s.x) <= s.radius + HIT_RADIUS && now >= t.invulnUntil) {
          s.hit = true;
          this.hit(s.owner, t, s.dmg, s.dir, { kb: s.kb, slowMs: s.slowMs || undefined });
          // Ignite: the explosion also burns the target that was hit
          if (s.ignite && !t.dead) this.hit(s.owner, t, Math.max(1, Math.round(s.dmg * IGNITE.splash)), s.dir, { kb: 0 });
        }
      }
    }
    this.shots = this.shots.filter((s) => !s.hit);
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

function make(cls: ClassKind, level: number, build: "skills" | "ult") {
  return new F(cls, level, talentsFor(cls, level, build), gearFor(cls, level), pointsFor(cls, level));
}

/** Win rate of `x` against `y` (draws count half), side swapped every fight. */
export function winRate(x: ClassKind, y: ClassKind, level: number, n: number, build: "skills" | "ult" = "skills"): number {
  let w = 0;
  for (let i = 0; i < n; i++) {
    const fx = make(x, level, build), fy = make(y, level, build);
    const d = i % 2 ? new Duel(fx, fy) : new Duel(fy, fx);
    const r = d.run();
    w += r === fx ? 1 : r === null ? 0.5 : 0;
  }
  return w / n;
}

const pct = (v: number) => `${Math.round(v * 100)}%`.padStart(5);

if (process.argv[1]?.includes("duel")) {
  const n = Number(process.argv[2]) || 400;
  const configs: [number, "skills" | "ult"][] = [[1, "skills"], [5, "skills"], [10, "skills"], [10, "ult"]];
  for (const [level, build] of configs) {
    console.log(`\nLevel ${level}${level >= 10 ? ` (${build} build)` : ""}: row hero's win rate vs column hero`);
    console.log("          " + CLASS_KINDS.map((c) => c.slice(0, 6).padStart(7)).join("") + "  overall");
    for (const x of CLASS_KINDS) {
      const row = CLASS_KINDS.map((y) => (x === y ? 0.5 : winRate(x, y, level, n, build)));
      const overall = row.reduce((s, v, i) => s + (CLASS_KINDS[i] === x ? 0 : v), 0) / (CLASS_KINDS.length - 1);
      console.log(x.padEnd(10) + row.map((v, i) => (CLASS_KINDS[i] === x ? "    -  " : pct(v) + "  ")).join("") + pct(overall));
    }
  }
}

