/**
 * PvP balance simulator: duels every class pair at a few levels with typical builds and gear.
 * Run: npx tsx tools/balance/duel.ts [fightsPerPair]
 *
 * It reuses the real numbers and formulas from shared/ (classes, powers, skills, gear, combat), runs every skill with
 * the real skill engine (shared/skillEngine.ts, through a 1D SkillHost) and re-implements the server's hit rules
 * (server/TownRoom.ts: damagePlayer, hitTarget, playerAttack) on a 1D line (no walls). Bots play "sensibly": melee heroes chase, ranged heroes kite and shoot, everyone uses
 * skills, ultimates, dodge rolls and the gear ranged shot when it makes sense. Projectiles can be side-stepped
 * (a miss chance that grows with flight time) since the real game is 2D.
 * Summoner golems are fighters too (GolemF): they follow the server's summon rules (life, damage in the owner's name,
 * Colossus slam, Vital Link) and can be hit by the other hero's swings, shots and areas. The bots aim at the hero.
 * Keep the server rules in sync with this file when changing combat code.
 */
import { basicDrain, CLASSES, ACTIVE_CLASSES, ClassKind, COMBO_WINDOW_MS, DODGE, ENERGY, GUARD_REDUCTION, staminaRegen } from "../../shared/classes";
import { attackMult, cooldownMult, critChance, heroSpeed, magicMult, maxHpFromStats, statPoints, statsFor, STATS, Stats } from "../../shared/powers";
import { activeSkills, canLearn, levelPower, rankPower, scalePower, skillById, SKILLS, SkillDef, talentBonus, talentMult, talentReduce } from "../../shared/skills";
import { canPay, manaRegen, maxManaFor, skillCost } from "../../shared/mana";
import {
  afterHit, atkSpeedMult, blocking, buffLifesteal, buffRegen, castSkill, ccImmune, charging, winding, cooldownLeft, counterHit, dealtMult, FieldInst, HitOpts,
  newRuntime, shotEnd, shotHit, shotPulse, ShotSpec, SkillHost, speedMult, takenMult, tickField, tickUnit,
} from "../../shared/skillEngine";
import { Equipped, GEAR, gearBlock, gearDef, gearReachMult, gearSpeedMult, gearStats, meetsReq, withLevel } from "../../shared/gear";
import { heroPoise, POISE, poiseLevelMult, poiseSpeed, pvpDamageMult } from "../../shared/combat";
import { COMBAT_REGEN_PER_STA, HIT_RADIUS, MOBS, mobScale, PLAYER_SPEED, REGEN_DELAY_MS, REGEN_PER_STA, REGEN_RAMP_MS } from "../../shared/constants";
import { MOB_COMBAT, mobBody } from "../../shared/combat";
import { attuneOf, bondShare, GOLEM_OF, SUMMON, summonScaleLevel, type SummonKind } from "../../shared/summons";

const TICK = 50; // ms, server runs at 20 Hz
const MAX_MS = 60000;
const ARENA = 480; // px: fights happen between walls / obstacles, so kiting can't go on forever // a duel longer than this is decided on HP %
const REACT = 0.55; // chance per tick that a bot acts (about 40ms average reaction delay)
const KB_PX = PLAYER_SPEED * 0.12; // knockback distance per kb unit (moveStep(.., 0.12 * kb) at default speed)

type Ranks = Record<string, number>;
type Build = 0 | 1 | 2; // the branch the build rushes up first
interface Shot { owner: F; x: number; dir: number; speed: number; range: number; traveled: number; pulsed?: number; radius: number; dmg: number; kb: number; miss: boolean; hit: boolean; basic: boolean; spec?: ShotSpec; pierced: boolean }
interface Pending { at: number; fn: () => void }

export class F {
  x = 0; y = 0; face = 1; hp = 0; maxHp = 0; s: Stats; energy = ENERGY.max; mana = 0; maxMana = 0; dead = false;
  poiseLost = 0; lastPoiseHit = 0; brokenUntil = 0; steadyUntil = 0; broken = false;
  invulnUntil = 0; rollUntil = 0; rollDir = 0; lastDodge = -1e9; lastRanged = -1e9; lastHurt = 0;
  attackReadyAt = 0; lastAttack = 0; combo = 0; stunUntil = 0; slowUntil = 0; dealt = 0; lastMove = 0;
  sk = newRuntime();
  /** Monster fighters (tools/balance/pve.ts): body size (melee hits reach its edge) and its stats. */
  body = 0;
  mob?: { reach: number; ranged: boolean };
  get talents() { return this.t; }
  constructor(public id: string, public cls: ClassKind, public level: number, public t: Ranks, public eq: Equipped, pts: Stats) {
    const st = statsFor(cls, pts);
    const g = gearStats(cls, eq);
    st.sta += g.sta; st.str += g.str; st.mag += g.mag; st.dex += g.dex;
    this.s = st;
    this.maxHp = Math.round(maxHpFromStats(cls, st, level) * talentMult(cls, t, "hp"));
    this.hp = this.maxHp;
    this.mana = this.maxMana = maxManaFor(st, level);
  }
  get poiseMax() { return heroPoise(this.cls, this.level); }
  get ranged() { return this.mob ? this.mob.ranged : !!CLASSES[this.cls].projectile; }
  /** Summoner: element of the next golem (shared/summons.ts ATTUNE_ORDER index). */
  attune = 0;
}

/**
 * A Summoner's golem (shared/summons.ts, server TownRoom.summon / updateSummon): life and damage as on the server
 * (monster level scaling x skill power x Colossus fusion x the owner's summonHp / summonDmg talents). Its blows are
 * dealt in the owner's name (Duel.hit with the owner as attacker). It has no talents or gear of its own.
 */
export class GolemF extends F {
  windUntil = 0; lastAtk = -1e9; banishAt = 0; sPower = 1;
  constructor(id: string, public owner: F, public kind: SummonKind, power: number, fused: number, now: number) {
    super(id, owner.cls, owner.level, {}, {}, { sta: 0, str: 0, mag: 0, dex: 0 });
    const fuse = 1 + SUMMON.colossusPerGolem * fused, def = MOBS[kind];
    this.s = { sta: 0, str: 0, mag: 0, dex: 0 };
    this.maxHp = this.hp = Math.round(def.maxHp * mobScale(summonScaleLevel(owner.level), "hp") * fuse * talentMult(owner.cls, owner.t, "summonHp")); // no skill power on life, like the server
    this.sPower = power * fuse * talentMult(owner.cls, owner.t, "summonDmg");
    this.body = mobBody(kind);
    this.mob = { reach: 14, ranged: false };
    this.banishAt = now + (kind === "golem_colossus" ? 30_000 : SUMMON.lifeMs);
    this.stunUntil = now + 500; // rising out of the ground
    this.x = owner.x - owner.face * 12;
  }
  get poiseMax() { return MOB_COMBAT[this.kind].poise; }
}

// ---- Typical builds -----------------------------------------------------------------------------------
/** Spend the level's points: rush up branch `main`, then a second branch, ranks last. */
export function talentsFor(cls: ClassKind, level: number, main: Build): Ranks {
  const r: Ranks = {};
  const order = [main, (main + 1) % 3, (main + 2) % 3];
  const byRow = (b: number) => SKILLS[cls].filter((x) => x.branch === b).sort((a, c) => a.req - c.req);
  const wish: string[] = [...byRow(order[0]), ...byRow(order[1]).slice(0, 3), ...byRow(order[0]), ...byRow(order[2]).slice(0, 2), ...byRow(order[0]), ...byRow(order[1])].map((x) => x.id);
  for (let pass = 0; pass < 4; pass++) for (const id of wish) if (canLearn(cls, level, r, id)) r[id] = (r[id] ?? 0) + 1;
  return r;
}

/**
 * Stat points: ~50% into the attack stat, 20% Dexterity, the rest into Stamina. The vampire is a hybrid: a Blood or
 * Night build (branch 0/1, spells) puts its attack points into Magic, a Fang build (blade) into Strength.
 */
export function pointsFor(cls: ClassKind, level: number, build?: Build): Stats {
  const n = statPoints(level);
  const atk = Math.round(n * 0.5), dex = Math.round(n * 0.2);
  const out: Stats = { sta: n - atk - dex, str: 0, mag: 0, dex };
  out[cls === "vampire" && build !== undefined && build < 2 ? "mag" : STATS[cls].attackStat] += atk;
  return out;
}

/**
 * Gear by level, the way drops come in (shared/gear.ts gearDropOdds): nothing below 5, Basic (tier 1) pieces from 5,
 * Fine (tier 2) weapon and armour from 10 and the rest from 15, Superior (tier 3) weapon and armour from 20 and the
 * rest from 25. Items are a couple of levels under the hero. A piece whose requirements the hero can't meet falls back
 * to a lower tier or item level.
 */
const GEAR_SETS: Record<1 | 2 | 3, Equipped> = {
  1: { weapon: "w_bronze", armour: "a_leather", shoes: "s_leather", hat: "h_cap", ranged: "r_sling", shield: "sh_wood" },
  2: { weapon: "w_frost", armour: "a_chain", shoes: "s_swift", hat: "h_helm", ranged: "r_knives", shield: "sh_iron" },
  3: { weapon: "w_dragon", armour: "a_royal", shoes: "s_winged", hat: "h_crown", ranged: "r_crossbow", shield: "sh_dragon" },
};
const MAIN_SLOTS = new Set(["weapon", "armour"]);
export function gearFor(cls: ClassKind, level: number, pts?: Stats): Equipped {
  if (level < 5) return {};
  const who = { cls, level, pts: pts ?? pointsFor(cls, level) };
  const out: Equipped = {};
  for (const slot of Object.keys(GEAR_SETS[1]) as (keyof Equipped)[]) {
    const lead = MAIN_SLOTS.has(slot) ? 0 : 5;
    const top = level >= 20 + lead ? 3 : level >= 10 + lead ? 2 : 1;
    search: for (let t = top; t >= 1; t--) for (let l = level - 2; l >= 1; l -= 2) {
      const id = withLevel(GEAR_SETS[t as 1 | 2 | 3][slot]!, l);
      if (meetsReq(id, who)) { out[slot] = id; break search; }
    }
  }
  return out;
}

// ---- Duel -----------------------------------------------------------------------------------------------
export class Duel {
  now = 0; shots: Shot[] = []; pending: Pending[] = []; fields: FieldInst[] = [];
  /** Summoner golems on both sides (GolemF), alive or not. */
  summons: GolemF[] = []; summonSeq = 0;
  host: SkillHost;
  t0: number;
  constructor(public a: F, public b: F, public rnd = Math.random, t0 = 0) {
    this.now = t0; this.t0 = t0;
    const d = 100 + rnd() * 60;
    a.x = (ARENA - d) / 2; b.x = a.x + d; a.face = 1; b.face = -1;
    const f = (id: string) => this.byId(id);
    const clamp = (x: number) => Math.max(0, Math.min(ARENA, x));
    this.host = {
      now: () => this.now,
      later: (ms, fn) => this.pending.push({ at: this.now + ms, fn }),
      unit: (id) => f(id),
      canAct: (id) => { const u = f(id); return !!u && !u.dead && this.now >= u.stunUntil && !u.broken; },
      enemies: (x, _y, r, of) => { const o = f(of); return o ? this.foes(o).filter((t) => !t.dead && this.now >= t.invulnUntil && Math.abs(t.x - x) <= r + t.body).map((t) => t.id) : []; },
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
        const o = f(sp.owner)!, t = this.other(o);
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
      summon: (id, power) => { const o = f(id); if (o) this.addGolem(o, GOLEM_OF[attuneOf(o.attune)], power, 0); },
      colossus: (id, power) => {
        const o = f(id);
        if (!o) return;
        const mine = this.golemsOf(o);
        for (const g of mine) g.dead = true;
        this.addGolem(o, "golem_colossus", power, mine.length);
      },
      attune: (id) => { const o = f(id); if (o) o.attune = (o.attune + 1) % 4; },
    };
  }
  /** Living golems of this hero. */
  golemsOf(o: F) { return this.summons.filter((g) => g.owner === o && !g.dead); }
  /** Bound golem (server TownRoom.autoGolems): a Summoner with no golem gets one after SUMMON.autoMs (the fight starts with one out). */
  autoAt = new Map<F, number>();
  autoGolems() {
    for (const o of this.units()) {
      if (o.cls !== "summoner" || o.dead || o instanceof GolemF || o.mob) continue;
      if (this.golemsOf(o).length) { this.autoAt.delete(o); continue; }
      const at = this.autoAt.get(o);
      if (at === undefined) { this.autoAt.set(o, this.now + (this.now <= this.t0 ? 0 : SUMMON.autoMs)); continue; }
      if (this.now < at) continue;
      this.autoAt.delete(o);
      this.addGolem(o, GOLEM_OF[attuneOf(o.attune)], golemPower(o), 0);
    }
  }
  /** Call a golem (server TownRoom.summon): past SUMMON.max the oldest goes back. */
  addGolem(o: F, kind: SummonKind, power: number, fused: number) {
    const mine = this.golemsOf(o);
    while (mine.length >= SUMMON.max) mine.shift()!.dead = true;
    this.summons.push(new GolemF(`g${++this.summonSeq}`, o, kind, power, fused, this.now));
  }
  other(f: F) { return f === this.a ? this.b : this.a; }
  /** Everyone in the fight, and the ones `f` fights (PvE packs override these). */
  units(): F[] { return [this.a, this.b, ...this.summons.filter((g) => !g.dead)]; }
  /** A hero fights the other hero and their golems; a golem fights its owner's foes. */
  foes(f: F): F[] {
    if (f instanceof GolemF) return this.foes(f.owner);
    const o = this.other(f);
    return [o, ...this.golemsOf(o)];
  }
  byId(id: string): F | undefined { return this.units().find((u) => u.id === id); }
  /** undefined = still fighting, null = draw. */
  outcome(): F | null | undefined { return this.a.dead || this.b.dead ? (this.a.dead && this.b.dead ? null : this.a.dead ? this.b : this.a) : undefined; }

  damage(t: F, dmg: number, by: F | undefined, push: number, kbMul: number, o: HitOpts): boolean {
    const now = this.now;
    if (t.dead || now < t.invulnUntil) return false;
    if (counterHit(this.host, t.id, by?.id, dmg, o)) return false;
    const guarded = blocking(t, now);
    if (guarded) dmg = Math.max(1, Math.round(dmg * (1 - GUARD_REDUCTION)));
    dmg = Math.max(1, Math.round(dmg * talentReduce(t.cls, t.t, "armor") * takenMult(t, now)));
    // Stone Bond (server damagePlayer): the hero's nearest golem within SUMMON.bondRange takes part of the blow
    if (!(t instanceof GolemF) && dmg > 1) {
      let g: GolemF | undefined, bd: number = SUMMON.bondRange;
      for (const c of this.golemsOf(t)) if (Math.abs(c.x - t.x) < bd) { bd = Math.abs(c.x - t.x); g = c; }
      if (g) { const part = Math.round(dmg * bondShare(t.level)); dmg -= part; g.hp -= part; if (g.hp <= 0) g.dead = true; }
    }
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
      const share = talentBonus(by.cls, by.t, "lifesteal") / 100 + buffLifesteal(by, now) + (o.drain ?? 0) / 100;
      if (share > 0 && !by.dead && dealt > 0) by.hp = Math.min(by.maxHp, by.hp + dealt * share);
    }
    if (t.hp <= 0) { t.dead = true; return true; }
    afterHit(this.host, by?.id, t.id, o);
    return false;
  }

  hit(a: F | undefined, t: F, dmg: number, push: number, o: HitOpts = {}) {
    if (a && o.basic && basicDrain(a.cls)) o = { ...o, drain: (o.drain ?? 0) + basicDrain(a.cls) }; // vampire trait, like server hitTarget
    if (a) dmg = dmg * talentMult(a.cls, a.t, "dmg") * (o.skill && !o.dot ? talentMult(a.cls, a.t, "skill") : 1) * dealtMult(a, this.now);
    if (a && !a.mob && !t.mob) dmg *= pvpDamageMult(a.level, t.level); // hero vs hero, like server hitTarget
    this.damage(t, Math.max(1, Math.round(dmg)), a, push, o.kb ?? 1, o);
  }

  /** Targets within r of point x (the other fighter only). */
  around(a: F, x: number, r: number) { return this.foes(a).filter((t) => !t.dead && Math.abs(t.x - x) <= r + t.body); }

  attack(a: F) {
    const now = this.now;
    if (a.dead || now < a.stunUntil || a.broken || now < a.attackReadyAt || now < a.rollUntil || charging(a, now) || winding(a, now)) return;
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
    const shot = a.eq.ranged ? gearDef(a.eq.ranged)?.shot : undefined;
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
    if (s.summon) return this.golemsOf(a).length < SUMMON.max;
    if (s.colossus) return this.golemsOf(a).length >= SUMMON.max || (this.golemsOf(a).length >= 1 && a.hp < a.maxHp * 0.5);
    if (s.attune) return false; // the element only changes the golem's look and elemental share: not modelled
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
    if (s.field?.link) return d <= s.field.link.range - 10; // Blood Link: anyone in reach
    if (s.field) return s.field.trap ? d < 70 : d <= (s.field.ahead ?? 0) + s.field.r - 4;
    if (s.cry) return d <= s.cry.r - 6;
    if (s.move) return a.ranged ? false : d > 40 && d < s.move.dist + 30;
    if (s.buff) return d < 80;
    return false;
  }

  /** Bot: cast the best ready skill (highest level first). */
  castSkills(a: F, d: number, toward: number, incoming: boolean, tReach: number) {
    if (charging(a, this.now)) return;
    const ready = activeSkills(a.cls).filter((s) => (s.cantrip || (a.t[s.id] ?? 0) > 0) && cooldownLeft(s, a.sk, this.now, cooldownMult(a.cls, a.s, a.t)) <= 0 && canPay(a, skillCost(s)))
      .sort((x, y) => y.req - x.req);
    for (const s of ready) {
      if (s.consume && a.sk.stacks < 3 && !s.buff) continue; // wait for some stacks
      // A melee hero in reach swings its weapon instead of casting a weaker basic spell (vampire Leech)
      if (s.cantrip && !a.ranged && d <= (12 + CLASSES[a.cls].attackRange) * gearReachMult(a.eq)) continue;
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

  /** Hooks for the PvE simulator (tools/balance/pve.ts): monster brains and speeds. */
  brain(f: F): number { return f instanceof GolemF ? this.golemBrain(f) : this.think(f); }

  /** A golem's turn (server TownRoom.updateSummon): wind up and slam the nearest foe; the Colossus hits all around it. */
  golemBrain(g: GolemF): number {
    const now = this.now, o = g.owner;
    if (o.dead || now >= g.banishAt) { g.dead = true; return 0; }
    // Vital Link (su_link): close to its owner it mends
    const link = o.t["su_link"] ?? 0;
    if (link && g.hp < g.maxHp && Math.abs(o.x - g.x) < SUMMON.followRange * 2) g.hp = Math.min(g.maxHp, g.hp + g.maxHp * SUMMON.linkRegen * link * TICK / 1000);
    if (now < g.stunUntil || g.broken) { g.windUntil = 0; return 0; }
    let t: F | undefined, bd = SUMMON.aggroRange;
    for (const c of this.foes(g)) if (!c.dead && Math.abs(c.x - g.x) < bd && Math.abs(c.x - o.x) < SUMMON.leash) { bd = Math.abs(c.x - g.x); t = c; }
    if (!t) return Math.abs(o.x - g.x) > SUMMON.followRange ? Math.sign(o.x - g.x) : 0;
    const toward = Math.sign(t.x - g.x) || 1, reach = 14 + t.body + 6, def = MOBS[g.kind];
    g.face = toward;
    if (g.windUntil) {
      if (now < g.windUntil) return 0;
      g.windUntil = 0; g.lastAtk = now;
      const dmg = def.damage * mobScale(summonScaleLevel(g.level), "damage") * g.sPower;
      const hits = g.kind === "golem_colossus" ? this.foes(g).filter((c) => !c.dead && Math.abs(c.x - t!.x) <= SUMMON.colossusSlam + c.body) : Math.abs(t.x - g.x) <= reach + 6 ? [t] : [];
      for (const c of hits) this.hit(o, c, dmg, Math.sign(c.x - g.x) || toward, { kb: 0.6 });
      return 0;
    }
    if (Math.abs(t.x - g.x) <= reach) {
      if (now - g.lastAtk >= def.attackCooldownMs) g.windUntil = now + MOB_COMBAT[g.kind].windupMs;
      return 0;
    }
    return toward;
  }
  speedOf(f: F): number {
    if (f instanceof GolemF) return MOBS[f.kind].speed * (this.now < f.slowUntil ? 0.5 : 1);
    return heroSpeed(f.cls, this.now < f.slowUntil, speedMult(f, this.now) * talentMult(f.cls, f.t, "speed")) * gearSpeedMult(f.eq); }

  // ---- Bot -----------------------------------------------------------------------------------------------
  /** Returns the move direction (-1, 0, 1) for this tick and fires actions. */
  think(a: F): number {
    const t = this.other(a);
    const now = this.now;
    const d = Math.abs(t.x - a.x), toward = Math.sign(t.x - a.x) || 1;
    const def = CLASSES[a.cls];
    const rm = gearReachMult(a.eq);
    const meleeReach = (12 + def.attackRange) * rm;
    const tReach = t.ranged ? 999 : t.mob ? t.mob.reach + 6 : (12 + CLASSES[t.cls].attackRange) * gearReachMult(t.eq) + 6;
    const canSpend = (c: number) => a.energy - c >= 20; // keep some for skills
    const incoming = this.shots.find((s) => s.owner === t && !s.hit && Math.sign(a.x - s.x) === s.dir && Math.abs(a.x - s.x) < 40 && !s.miss);
    if (now < a.stunUntil) return 0;
    // Human reaction: a player doesn't act on every server tick
    if (this.rnd() > REACT) return a.lastMove;
    if (charging(a, now)) return 0;
    this.castSkills(a, d, toward, !!incoming, tReach);
    // Dodge incoming shots sometimes (human reaction), ranged heroes roll away from melee
    if (incoming && this.rnd() < 0.3 && canSpend(ENERGY.cost.dodge + 10)) this.dodge(a, a.ranged ? -toward : toward);
    // Melee heroes roll in on shooters (what players do: the roll is the gap closer everyone has)
    if (!a.ranged && t.ranged && d > 50 && d < 160 && canSpend(ENERGY.cost.dodge + 10) && this.rnd() < 0.35) this.dodge(a, toward);
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
    // Melee: chase and swing, but don't swing into a raised counter stance (players see it and wait it out)
    a.face = toward;
    if (t.sk.counter && now < t.sk.counter.until && d <= meleeReach + 10 && this.rnd() < 0.75) return d < meleeReach ? -toward : 0;
    if (d <= meleeReach) { this.attack(a); return d < meleeReach * 0.5 ? 0 : toward; }
    if (d > meleeReach + 20 && d < 150) this.fireRanged(a);
    return toward;
  }

  step(): F | null | undefined {
    const now = this.now;
    this.autoGolems();
    for (const f of this.units()) {
      tickUnit(this.host, f.id);
      if (f.broken && now >= f.brokenUntil) { f.broken = false; f.poiseLost = 0; f.steadyUntil = now + POISE.steadyMs; }
      else if (!f.broken && f.poiseLost > 0 && now - f.lastPoiseHit >= POISE.regenDelayMs) f.poiseLost = Math.max(0, f.poiseLost - f.poiseMax * POISE.regenPerSec * TICK / 1000);
      f.energy = Math.min(ENERGY.max, f.energy + staminaRegen(f.cls) * TICK / 1000);
      f.mana = Math.min(f.maxMana, f.mana + manaRegen(f.s, false, talentBonus(f.cls, f.t, "mana")) * TICK / 1000);
    }
    const order = this.rnd() < 0.5 ? this.units() : this.units().reverse();
    const moves = new Map<F, number>();
    for (const f of order) if (!f.dead) { const m = this.brain(f); f.lastMove = m; moves.set(f, m); }
    for (const f of this.units()) f.x = Math.max(0, Math.min(ARENA, f.x));
    for (const f of this.units()) {
      if (f.dead) continue;
      const dt = TICK / 1000;
      if (now < f.stunUntil || charging(f, now)) continue;
      if (now < f.rollUntil) { f.x += f.rollDir * DODGE.distance / (DODGE.durationMs / 1000) * dt; continue; }
      const m = moves.get(f) ?? 0;
      const sp = this.speedOf(f);
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
    for (const f of this.units()) f.x = Math.max(0, Math.min(ARENA, f.x));
    for (const s of this.shots) {
      if (s.hit) continue;
      const total = s.speed * TICK / 1000, n = Math.max(1, Math.ceil(total / 4));
      for (let i = 0; i < n && !s.hit; i++) {
        s.x += s.dir * total / n; s.traveled += total / n;
        if (s.traveled >= s.range) { s.hit = true; if (s.spec) shotEnd(this.host, s.spec, s.x, 0); break; }
        if (s.spec?.pulse && s.traveled - (s.pulsed ?? 0) >= s.spec.pulse.every) { s.pulsed = s.traveled; shotPulse(this.host, s.spec, s.x, 0); }
        const t = this.foes(s.owner).find((t) => !t.dead && Math.abs(t.x - s.x) <= s.radius + HIT_RADIUS + t.body && now >= t.invulnUntil);
        if (t && !s.miss && !s.pierced) {
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
    return this.outcome();
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

/** What the Elemental Golem skill gives this hero (castSkill's power: rank, skill level, Magic); rank 1 if not learned. */
export function golemPower(o: F) {
  const s = skillById("su_golem");
  if (!s) return 1;
  return rankPower(Math.max(1, Math.min(3, o.t[s.id] ?? 0))) * levelPower(s) * scalePower(s, o.s, STATS[o.cls].base);
}

export function make(id: string, cls: ClassKind, level: number, build: Build) {
  const pts = pointsFor(cls, level, build);
  return new F(id, cls, level, talentsFor(cls, level, build), gearFor(cls, level, pts), pts);
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

/** Overall win rate of every class against the others at one level (random builds unless `build` is set). */
export function overallAt(level: number, n: number, build?: Build): Record<ClassKind, number> {
  const out = {} as Record<ClassKind, number>;
  for (const x of ACTIVE_CLASSES) out[x] = ACTIVE_CLASSES.filter((y) => y !== x).reduce((s, y) => s + winRate(x, y, level, n, build), 0) / (ACTIVE_CLASSES.length - 1);
  return out;
}

if (process.argv[1]?.includes("duel")) {
  const n = Number(process.argv[2]) || 400;
  const brief = process.argv.includes("--brief");
  const levels = [1, 5, 10, 15, 20, 25, 30];
  const summary: Record<string, string[]> = Object.fromEntries(ACTIVE_CLASSES.map((c) => [c, []]));
  for (const level of levels) {
    if (!brief) {
      console.log(`\nLevel ${level} (random builds): row hero's win rate vs column hero`);
      console.log("          " + ACTIVE_CLASSES.map((c) => c.slice(0, 6).padStart(7)).join("") + "  overall");
    }
    for (const x of ACTIVE_CLASSES) {
      const row = ACTIVE_CLASSES.map((y) => (x === y ? 0.5 : winRate(x, y, level, n)));
      const overall = row.reduce((s, v, i) => s + (ACTIVE_CLASSES[i] === x ? 0 : v), 0) / (ACTIVE_CLASSES.length - 1);
      summary[x].push(pct(overall));
      if (!brief) console.log(x.padEnd(10) + row.map((v, i) => (ACTIVE_CLASSES[i] === x ? "    -  " : pct(v) + "  ")).join("") + pct(overall));
    }
  }
  console.log("\nOverall PvP win rate by level (random builds)");
  console.log("          " + levels.map((l) => `Lv${l}`.padStart(6)).join(""));
  for (const c of ACTIVE_CLASSES) console.log(c.padEnd(10) + summary[c].map((v) => v.padStart(6)).join(""));
  if (process.argv.includes("--branches")) for (const b of [0, 1, 2] as Build[]) {
    console.log(`\nBranch ${b + 1} builds, overall`);
    for (const level of [10, 20, 30]) {
      const o = overallAt(level, n, b);
      console.log(`Lv${level}`.padEnd(6) + ACTIVE_CLASSES.map((c) => `${c.slice(0, 6)} ${pct(o[c])}`).join("  "));
    }
  }
}
