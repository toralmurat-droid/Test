/**
 * PvE balance simulator: bot heroes play the first zone (Lv 1-30) against its monsters and bosses.
 * Run: npx tsx tools/balance/pve.ts [runsPerCase] [--bosses] [--zones] [--act2]
 *
 * It reuses the PvP simulator (tools/balance/duel.ts): the same hero bot, skill engine, builds (rushing one branch),
 * stat points and gear by level. The other side is a monster with its real numbers (shared/constants.ts MOBS, level
 * scaling, poise, wind-ups) and a 1D version of its moves from server/TownRoom.ts (ranged casters keep their distance,
 * warrior blobs and cutthroats lunge, bosses telegraph their big blows and the bot rolls out of about half of them).
 *
 * Zones: a hero walks a zone and fights `CHAIN` monsters of its level band in a row (a few seconds between fights),
 * carrying a few healing / mana potions of its level's size. Bosses: each quest boss alone, the hero 1 level below.
 * Monsters raised or called mid-fight (Necromancer skeletons, Chief reinforcements, the King's servants) are left out,
 * so boss win rates read a bit high.
 */
import { ACTIVE_CLASSES, ClassKind } from "../../shared/classes";
import { BANDIT_AI, BANDIT_ROLES, CHIEF } from "../../shared/bandits";
import { BEAST, BLOB_AI, DEMON, HOLLOW_KING, MOB_ATTACK_RANGE, MOB_LEVEL, MOBS, MobKind, mobScale, MOTHER, SKELETON_AI, SKELETON_BOW, SKELETON_WEAPONS, SkeletonWeapon, SUNWRIGHT, REGEN_DELAY_MS, REGEN_PER_STA } from "../../shared/constants";
import { MOB_COMBAT, mobBody, POISE, poiseSpeed } from "../../shared/combat";
import { POTION_COOLDOWN_MS, POTION_SIZES } from "../../shared/potions";
import { activeSkills, SKILLS } from "../../shared/skills";
import { canPay, manaRegen, skillCost } from "../../shared/mana";
import { castSkill, cooldownLeft } from "../../shared/skillEngine";
import { coolHeat, isOverheated } from "../../shared/overload";
import { Duel, F, GolemF, make } from "./duel";
import { SUMMON } from "../../shared/summons";

type Build = 0 | 1 | 2;

interface Special {
  name: string; every: number; windup: number; min: number; max: number; radius: number; mult: number;
  at: "self" | "target"; inner?: number; kb?: number; stunMs?: number; slowMs?: number; hpBelow?: number; first?: number;
  leap?: boolean; // the monster lands on the spot
  shot?: { speed: number; radius: number }; // thrown instead of a ground blast (Skeleton Toss)
}
interface MobSpec {
  kind: MobKind; label: string; level: number; hp: number; dmg: number; cd: number; speed: number; reach: number; windup: number; poise: number; body: number;
  ranged?: { range: number; keepAway: number; speed: number; radius: number; mult: number };
  lunge?: { min: number; max: number; every: number; mult: number }; // warrior blob charge / cutthroat dash: a hard blow on arrival
  specials: Special[];
  enrage?: { hpBelow: number; speed: number; cd: number };
}

export function mobSpec(kind: MobKind, level: number, opt: { weapon?: string; hpMult?: number } = {}): MobSpec {
  const d = MOBS[kind], hpS = mobScale(level, "hp"), dmS = mobScale(level, "damage");
  const role = kind === "bandit" ? BANDIT_ROLES[(opt.weapon ?? "cutthroat") as keyof typeof BANDIT_ROLES] : undefined;
  const sw = kind === "skeleton" ? SKELETON_WEAPONS[(opt.weapon ?? "sword") as SkeletonWeapon] : undefined;
  const body = mobBody(kind);
  const spec: MobSpec = {
    kind, label: role ? role.name : kind === "skeleton" ? `skeleton (${opt.weapon ?? "sword"})` : d.name, level,
    hp: d.maxHp * hpS * (role?.hp ?? 1) * (opt.hpMult ?? 1),
    dmg: d.damage * dmS * (role?.dmg ?? 1) * (sw?.dmg ?? 1),
    cd: d.attackCooldownMs * (role?.cooldown ?? 1) * (sw?.cooldown ?? 1),
    speed: d.speed * (role?.speed ?? 1),
    reach: (sw?.range ?? MOB_ATTACK_RANGE) + body, windup: sw?.windupMs ?? MOB_COMBAT[kind].windupMs,
    poise: MOB_COMBAT[kind].poise * hpS * (role?.poise ?? 1), body, specials: [],
  };
  const ranged = (range: number, keepAway: number, speed: number, radius: number, mult = 1) => { spec.ranged = { range, keepAway, speed, radius, mult }; };
  if (kind === "shooterblob") ranged(BLOB_AI.shooter.range, BLOB_AI.shooter.keepAway, BLOB_AI.shooter.shotSpeed, 3);
  if (kind === "skeletonmage") ranged(SKELETON_AI.mage.range, SKELETON_AI.mage.keepAway, SKELETON_AI.mage.shotSpeed, 3);
  if (kind === "skeleton" && opt.weapon === "bow") { ranged(SKELETON_WEAPONS.bow.range, SKELETON_BOW.keepAway, SKELETON_BOW.shotSpeed, 3); }
  if (kind === "bandit" && opt.weapon === "archer") ranged(BANDIT_AI.bow.range, BANDIT_AI.bow.keepAway, BANDIT_AI.bow.shotSpeed, 3);
  // Act 2 (server/TownRoom.ts RANGED / NOMAD_BOW, BEAST gore + stomp)
  if (kind === "veiled") ranged(140, 72, 160, 3, 1.1);
  if (kind === "nomad" && opt.weapon === "folk") ranged(125, 60, 175, 3, 0.85);
  if (kind === "scorpion") spec.lunge = { min: BEAST.gore.min, max: BEAST.gore.max, every: BEAST.gore.cooldownMs, mult: BEAST.gore.dmgMult };
  if (kind === "camelfolk") { const S = BEAST.stomp; spec.specials.push({ name: "Stomp", every: S.cooldownMs, windup: S.windupMs, min: 0, max: S.range, radius: S.radius, mult: S.dmgMult, at: "self", kb: S.knockback, stunMs: S.stunMs }); }
  if (kind === "necromancer") {
    const N = SKELETON_AI.necro;
    ranged(N.range, N.keepAway, N.shotSpeed, N.shotRadius, N.boltMult);
    spec.specials.push({ name: "Death Circle", every: N.circle.cooldownMs, windup: N.circle.windupMs, min: 0, max: N.circle.range, radius: N.circle.radius, mult: N.circle.dmgMult, at: "target" });
  }
  if (kind === "warriorblob") spec.lunge = { min: BLOB_AI.warrior.chargeMin, max: BLOB_AI.warrior.chargeMax, every: BLOB_AI.warrior.cooldownMs, mult: 1 };
  if (kind === "bandit" && (opt.weapon ?? "cutthroat") === "cutthroat") spec.lunge = { min: BANDIT_AI.dash.min, max: BANDIT_AI.dash.max, every: BANDIT_AI.dash.cooldownMs, mult: BANDIT_AI.dash.dmgMult };
  if (kind === "bandit" && opt.weapon === "brute") {
    const C = BANDIT_AI.cleave;
    spec.specials.push({ name: "Cleave", every: C.cooldownMs, windup: C.windupMs, min: 0, max: C.range, radius: C.radius, mult: C.dmgMult, at: "self", kb: C.knockback });
  }
  if (kind === "motherblob") {
    const B = MOTHER.bounce, S = MOTHER.slam;
    if (level >= B.level) spec.specials.push({ name: "Belly Bounce", every: B.cooldownMs, windup: B.windupMs, min: 0, max: B.range, radius: B.radius, mult: B.dmgMult, at: "self", kb: B.knockback });
    if (level >= S.level) spec.specials.push({ name: "Ground Slam", every: S.cooldownMs, windup: S.windupMs, min: 0, max: S.range, radius: S.radius, mult: S.dmgMult, at: "self", kb: S.knockback });
  }
  if (kind === "demon") {
    const S = DEMON.stomp, T = DEMON.toss;
    spec.specials.push({ name: "Hellfire Stomp", every: S.everyMs, windup: S.windupMs, min: 0, max: S.range, radius: S.radius, mult: S.dmgMult, at: "self", kb: S.knockback });
    spec.specials.push({ name: "Skeleton Toss", every: T.everyMs, windup: 500, min: T.min, max: T.max, radius: T.radius, mult: T.dmgMult, at: "target", shot: { speed: T.speed, radius: T.radius } });
  }
  if (kind === "banditchief") {
    const S = CHIEF.sweep, L = CHIEF.leap;
    spec.specials.push({ name: "Sweep", every: S.cooldownMs, windup: S.windupMs, min: 0, max: S.range, radius: S.radius, mult: S.dmgMult, at: "self", kb: S.knockback });
    spec.specials.push({ name: "Leap", every: L.cooldownMs, windup: L.windupMs, min: L.min, max: L.max, radius: L.radius, mult: L.dmgMult, at: "target", stunMs: L.stunMs, leap: true });
  }
  if (kind === "hollowking") {
    const K = HOLLOW_KING;
    spec.specials.push({ name: "Crown Cleave", every: K.cleave.cooldownMs, windup: K.cleave.windupMs, min: 0, max: K.cleave.range, radius: K.cleave.radius, mult: K.cleave.dmgMult, at: "self", kb: K.cleave.knockback });
    spec.specials.push({ name: "Gloam Pools", every: K.pools.cooldownMs, windup: K.pools.windupMs, min: 0, max: K.pools.range, radius: K.pools.radius, mult: K.pools.dmgMult, at: "target", slowMs: K.pools.slowMs });
    spec.specials.push({ name: "Crown's Wrath", every: K.wrath.cooldownMs, windup: K.wrath.windupMs, min: 0, max: K.wrath.radius, radius: K.wrath.radius, inner: K.wrath.inner, mult: K.wrath.dmgMult, at: "self", hpBelow: K.wrath.hpFrac, first: 0 });
    spec.enrage = { hpBelow: K.wrath.hpFrac, speed: K.wrath.speed, cd: K.wrath.cooldown };
  }
  if (kind === "sunwright") {
    // Act 2's final boss (BEAST beam/flare/sunfall/zenith, SUNWRIGHT): Zenith counted with one adept of her choir alive
    const L = BEAST.beam, Fl = BEAST.flare, S = BEAST.sunfall, Z = BEAST.zenith, W = SUNWRIGHT;
    spec.specials.push({ name: "Sunlance", every: L.cooldownMs, windup: L.windupMs, min: L.min, max: L.max, radius: L.width / 2 + 6, mult: L.dmgMult, at: "target" });
    spec.specials.push({ name: "Flare", every: Fl.cooldownMs, windup: Fl.windupMs, min: 0, max: Fl.range, radius: Fl.radius, mult: Fl.dmgMult, at: "self", kb: Fl.knockback });
    spec.specials.push({ name: "Sunfall", every: S.cooldownMs, windup: S.windupMs, min: 0, max: S.range, radius: S.radius, mult: S.dmgMult, at: "target" });
    spec.specials.push({ name: "Zenith", every: Z.everyMs, windup: Z.windupMs, min: 0, max: Z.radius, radius: Z.radius, inner: Z.inner, mult: Z.dmgMult * (1 + Z.perAdept), at: "self", hpBelow: Z.hpFrac, first: 0 });
    spec.enrage = { hpBelow: W.phase[1], speed: W.sun.speed, cd: W.sun.cooldown };
  }
  return spec;
}

/** A monster in the arena: a fighter with no skills, stats from its MobSpec. */
export class MobF extends F {
  windUntil = 0; windKind?: Special; windX = 0; windPoise = 0; lastAtk = -1e9; next: Record<string, number> = {}; nextLunge = 0; lungeUntil = 0;
  constructor(public spec: MobSpec, id = "m") {
    super(id, "knight", spec.level, {}, {}, { sta: 0, str: 0, mag: 0, dex: 0 });
    this.maxHp = this.hp = Math.round(spec.hp);
    this.s = { sta: 0, str: 0, mag: 0, dex: 0 };
    this.body = spec.body;
    this.mob = { reach: spec.reach, ranged: !!spec.ranged };
    for (const s of spec.specials) this.next[s.name] = s.first ?? 1500 + Math.random() * 2000;
  }
  get poiseMax() { return this.spec.poise; }
  get enraged() { return !!this.spec.enrage && this.hp < this.maxHp * this.spec.enrage.hpBelow; }
}

interface Pack { heal: number; mana: number; healUsed: number; manaUsed: number; size: number; lastDrink: number }

export class PveDuel extends Duel {
  dodged = 0; teles = 0;
  constructor(public hero: F, public mobs: MobF[], public pack: Pack, t0: number) {
    super(hero, mobs[0], Math.random, t0);
    for (const m of mobs.slice(1)) m.x = Math.max(0, Math.min(480, mobs[0].x + (Math.random() - 0.3) * 40));
  }
  units(): F[] { return [this.hero, ...this.mobs, ...this.summons.filter((g) => !g.dead)]; }
  /** The hero and its golems fight the monsters; monsters fight the hero and the golems. */
  foes(f: F): F[] { return f === this.hero || f instanceof GolemF ? this.mobs : [this.hero, ...this.golemsOf(this.hero)]; }
  /**
   * Who a monster goes for: a golem close by (server: the golems take the anger of their owner's hits, SUMMON.guardRange,
   * and monsters favour them, SUMMON.taunt), else the hero.
   */
  mobTarget(m: MobF): F {
    let best: F = this.hero, bd = SUMMON.guardRange;
    for (const g of this.golemsOf(this.hero)) { const d = Math.abs(g.x - m.x); if (d < bd) { bd = d; best = g; } }
    return best;
  }
  other(f: F): F {
    if (f instanceof MobF) return this.mobTarget(f);
    if (f !== this.hero) return this.hero;
    let best = this.mobs[0], bd = Infinity;
    for (const m of this.mobs) if (!m.dead && Math.abs(m.x - f.x) < bd) { bd = Math.abs(m.x - f.x); best = m; }
    return best;
  }
  outcome(): F | null | undefined { return this.hero.dead ? this.mobs[0] : this.mobs.every((m) => m.dead) ? this.hero : undefined; }

  speedOf(f: F): number {
    if (!(f instanceof MobF)) return super.speedOf(f);
    if (f.broken) return f.spec.speed * POISE.fleeSpeed;
    return f.spec.speed * (f.enraged ? f.spec.enrage!.speed : 1) * (this.now < f.slowUntil ? 0.5 : 1) * (this.now < f.lungeUntil ? 3 : 1);
  }

  brain(f: F): number {
    if (f instanceof MobF) return this.mobBrain(f);
    if (f instanceof GolemF) return this.golemBrain(f);
    return this.heroBrain(f);
  }

  heroBrain(h: F): number {
    const now = this.now, P = this.pack;
    // Potions: heal under 40%, mana when a caster runs dry
    // Healing potions: no cooldown, instant (drinks until back above 40% or out)
    while (h.hp < h.maxHp * 0.4 && P.heal > 0) { P.heal--; P.healUsed++; h.hp = Math.min(h.maxHp, h.hp + POTION_SIZES[P.size].heal); }
    if (now - P.lastDrink >= POTION_COOLDOWN_MS) {
      if (h.mana < Math.min(30, h.maxMana * 0.25) && P.mana > 0 && activeSkills(h.cls).some((s) => s.mana && (s.cantrip || (h.t[s.id] ?? 0) > 0))) {
        P.mana--; P.manaUsed++; P.lastDrink = now; h.mana = Math.min(h.maxMana, h.mana + POTION_SIZES[P.size].mana);
      }
    }
    // A telegraphed blow is coming: roll out of it about half the time
    for (const m of this.mobs) if (!m.dead && m.windKind && m.windUntil - now < 450 && m.windUntil - now > 50 && !(h as any)._sawWind) {
      (h as any)._sawWind = m.windUntil;
      const s = m.windKind, cx = s.at === "self" ? m.x : m.windX;
      const inside = Math.abs(h.x - cx) <= s.radius + 6 && !(s.inner && Math.abs(h.x - cx) <= s.inner);
      if (inside && Math.random() < 0.5 && now >= h.stunUntil && !isOverheated(h) && now - h.lastDodge >= 1500) {
        const away = s.inner ? Math.sign(cx - h.x) || 1 : Math.sign(h.x - cx) || (Math.random() < 0.5 ? 1 : -1);
        if (this.dodge(h, away)) { this.dodged++; return 0; }
      }
      // roll on cooldown: an untouchable move skill (Shadow Step, Blink, Leap...) does the same job
      if (inside && Math.random() < 0.5 && isOverheated(h) || now - h.lastDodge < 1500) {
        const away = Math.sign(h.x - cx) || 1;
        const mv = activeSkills(h.cls).find((s) => s.move?.invulnMs && (h.t[s.id] ?? 0) > 0 && cooldownLeft(s, h.sk, now, 1) <= 0 && canPay(h, skillCost(s)));
        if (inside && mv) { h.face = s.inner ? -away : away; if (castSkill(this.host, h.id, mv.id)) { this.dodged++; return 0; } }
      }
      break;
    }
    if ((h as any)._sawWind && (h as any)._sawWind <= now) (h as any)._sawWind = 0;
    return this.think(h);
  }

  mobHit(m: MobF, mult: number, extra: { kb?: number; stunMs?: number; slowMs?: number } = {}, h: F = this.mobTarget(m)) {
    this.hit(m, h, Math.round(m.spec.dmg * mult), Math.sign(h.x - m.x) || 1, { kb: extra.kb ?? 1, stunMs: extra.stunMs, slowMs: extra.slowMs });
  }

  mobBrain(m: MobF): number {
    const now = this.now, h = this.mobTarget(m), S = m.spec;
    const d = Math.abs(h.x - m.x), toward = Math.sign(h.x - m.x) || 1;
    if (now < m.stunUntil) { m.windUntil = 0; m.windKind = undefined; return 0; }
    if (m.broken) { m.windUntil = 0; m.windKind = undefined; return -toward; }
    // Wind-up: a solid hit (15% of poise) interrupts a basic blow; specials go through
    if (m.windUntil) {
      if (!m.windKind && m.poiseLost - m.windPoise >= m.poiseMax * 0.15) { m.windUntil = 0; m.lastAtk = now - S.cd + POISE.mobFlinchMs; return 0; }
      if (now < m.windUntil) return 0;
      const s = m.windKind;
      m.windUntil = 0; m.windKind = undefined; m.lastAtk = now;
      if (!s) {
        if (S.ranged) this.mobShot(m, S.ranged.speed, S.ranged.radius, S.ranged.mult);
        else if (d <= S.reach + 6) this.mobHit(m, 1);
        return 0;
      }
      if (s.shot) { this.mobShot(m, s.shot.speed, s.shot.radius, s.mult); return 0; }
      if (s.leap) m.x = Math.max(0, Math.min(480, m.windX - toward * 10));
      const cx = s.at === "self" || s.leap ? m.x : m.windX, dist = Math.abs(h.x - cx);
      // an area special hits the hero and every golem inside it
      for (const v of this.foes(m)) {
        const dv = Math.abs(v.x - cx);
        if (!v.dead && dv <= s.radius + v.body && !(s.inner && dv <= s.inner)) this.mobHit(m, s.mult, { kb: s.kb, stunMs: s.stunMs, slowMs: s.slowMs }, v);
      }
      return 0;
    }
    // Specials first
    for (const s of S.specials) {
      if (now < m.next[s.name] || d < s.min || d > s.max) continue;
      if (s.hpBelow && m.hp >= m.maxHp * s.hpBelow) continue;
      m.next[s.name] = now + s.every;
      m.windKind = s; m.windUntil = now + s.windup; m.windX = h.x; this.teles++;
      return 0;
    }
    const cd = S.cd * (m.enraged ? S.enrage!.cd : 1) / poiseSpeed(Math.max(0, 1 - m.poiseLost / m.poiseMax));
    if (S.ranged) {
      if (d < S.ranged.keepAway) return -toward;
      if (d <= S.ranged.range && now - m.lastAtk >= cd) { m.windUntil = now + S.windup; m.windPoise = m.poiseLost; return 0; }
      return d > S.ranged.range * 0.85 ? toward : 0;
    }
    // Lunge: charge in from a few steps away, the first blow lands on arrival with no wind-up
    if (S.lunge && now >= m.nextLunge && d >= S.lunge.min && d <= S.lunge.max) { m.nextLunge = now + S.lunge.every; m.lungeUntil = now + 320; (m as any)._lungeHit = true; }
    if ((m as any)._lungeHit && d <= S.reach + 4) { (m as any)._lungeHit = false; m.lungeUntil = 0; m.lastAtk = now; this.mobHit(m, S.lunge!.mult * (S.kind === "warriorblob" ? 1.5 : 1), { kb: 1.5 }); return 0; }
    if (now > m.lungeUntil + 250) (m as any)._lungeHit = false;
    if (d <= S.reach) {
      if (now - m.lastAtk >= cd) { m.windUntil = now + S.windup; m.windPoise = m.poiseLost; }
      return 0;
    }
    return toward;
  }

  mobShot(m: MobF, speed: number, radius: number, mult: number) {
    const h = this.mobTarget(m);
    const miss = Math.random() < this.missChance(Math.abs(h.x - m.x), speed);
    this.shots.push({ owner: m, x: m.x, dir: Math.sign(h.x - m.x) || 1, speed, range: 260, traveled: 0, radius, dmg: Math.round(m.spec.dmg * mult), kb: 0.6, miss, hit: false, basic: false, pierced: false });
  }
}

// ---- Scenarios ------------------------------------------------------------------------------------------
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const skelWeapon = () => pick(["sword", "sword", "sword", "axe", "axe", "spear", "spear", "bow", "bow"]);
/** Monsters of a zone band around this level (the map's zones, shared/spawns.ts). */
function zoneMob(level: number): MobSpec {
  const L = Math.min(25, Math.max(1, level));
  const blobs: MobKind[] = L <= 3 ? ["slime"] : L <= 5 ? ["slime", "slime", "shooterblob", "warriorblob"] : ["slime", "shooterblob", "warriorblob", "warriorblob", "healerblob"];
  const pool: [MobKind, string?][] = blobs.map((k) => [k]);
  if (L >= 6) pool.push(["skeleton", skelWeapon()], ["skeleton", skelWeapon()], ["skeleton", skelWeapon()]);
  if (L >= 8) pool.push(["skeletonmage"]);
  if (L >= 17) pool.push(["bandit", "cutthroat"], ["bandit", "brute"], ["bandit", "archer"]);
  if (L >= 19) { pool.splice(0, blobs.length); pool.push(["skeleton", skelWeapon()], ["bandit", "cutthroat"]); }
  const [k, w] = pick(pool);
  return mobSpec(k, L, { weapon: w });
}

/** Act 2 (the Sunscar, shared/spawns.ts): its monsters at Lv 30-47. */
function desertMob(level: number): MobSpec {
  const L = Math.min(47, Math.max(30, level));
  const pool: [MobKind, string?][] = [["nomad"], ["nomad", "folk"], ["scorpion"], ["scorpion"]];
  if (L >= 36) pool.push(["sanddead"], ["sanddead"]);
  if (L >= 38) pool.push(["camelfolk"], ["camelfolk"]);
  if (L >= 41) pool.push(["veiled"], ["veiled"]);
  const [k, w] = pick(pool);
  return mobSpec(k, L, { weapon: w });
}
let ACT2 = false;

const CHAIN = 6; // encounters per zone run: 1 monster (55%), 2 (35%) or 3 (10%)
const potionSize = (level: number) => (level >= 20 ? 2 : level >= 10 ? 1 : 0);

export interface RunResult { won: boolean; kills: number; hpLostPerKill: number; secPerKill: number; heals: number; manas: number }

/** One hero walks a zone: CHAIN fights in a row. */
function zoneRun(cls: ClassKind, level: number, build: Build, mobLevel: (i: number) => number, potions = 3): RunResult {
  const h = make("h", cls, level, build);
  const pack: Pack = { heal: potions, mana: potions, healUsed: 0, manaUsed: 0, size: potionSize(level), lastDrink: -1e9 };
  let t = 0, kills = 0, lost = 0, fightMs = 0;
  for (let i = 0; i < CHAIN; i++) {
    const r = Math.random(), size = r < 0.55 ? 1 : r < 0.9 ? 2 : 3;
    const ms = Array.from({ length: size }, (_, k) => new MobF((ACT2 ? desertMob : zoneMob)(mobLevel(i)), "m" + k));
    const d = new PveDuel(h, ms, pack, t);
    const hp0 = h.hp, t0 = d.now;
    let w: F | null | undefined;
    while (d.now - t0 < 90000 && (w = d.step()) === undefined) { /* fight */ }
    t = d.now; fightMs += t - t0;
    lost += Math.max(0, hp0 - h.hp);
    if (h.dead || w !== h) return { won: false, kills: kills + ms.filter((m) => m.dead).length, hpLostPerKill: lost / Math.max(1, kills) / h.maxHp, secPerKill: fightMs / 1000 / Math.max(1, kills), heals: pack.healUsed, manas: pack.manaUsed };
    kills += size;
    // a few seconds walking to the next one: regen ramps up, Heat cools, mana refills
    const gap = 3000 + Math.random() * 3000;
    const restMs = Math.max(0, gap - REGEN_DELAY_MS);
    h.hp = Math.min(h.maxHp, h.hp + h.s.sta * REGEN_PER_STA * restMs / 1000 * 0.5);
    coolHeat(h, h.cls, gap / 1000);
    h.mana = Math.min(h.maxMana, h.mana + manaRegen(h.s, false) * gap / 1000);
    h.poiseLost = 0; h.broken = false;
    t += gap;
  }
  return { won: true, kills, hpLostPerKill: lost / kills / h.maxHp, secPerKill: fightMs / 1000 / kills, heals: pack.healUsed, manas: pack.manaUsed };
}

export interface BossDef { name: string; kind: MobKind; level: number; hero: number; hpMult?: number; weapon?: string }
export const BOSSES: BossDef[] = [
  { name: "Mother Blob Lv8", kind: "motherblob", level: 8, hero: 7 },
  { name: "Bone Demon Lv14", kind: "demon", level: 14, hero: 13 },
  { name: "Raiser (Necro) Lv16", kind: "necromancer", level: 16, hero: 15 },
  { name: "Gravemoor Horror Lv19", kind: "demon", level: 19, hero: 18, hpMult: 1.6 },
  { name: "Redfang Chief Lv21", kind: "banditchief", level: 21, hero: 20 },
  { name: "Rask the Reaver Lv21", kind: "bandit", level: 21, hero: 20, hpMult: 3.5, weapon: "brute" },
  { name: "Pale Marshal Lv24", kind: "necromancer", level: 24, hero: 23, hpMult: 2.5 },
  { name: "Hollow King Lv30", kind: "hollowking", level: 30, hero: 30, hpMult: 2 },
  { name: "Sunwright Lv50", kind: "sunwright", level: 50, hero: 49, hpMult: 2 },
];

function bossRun(cls: ClassKind, b: BossDef, build: Build, potions = 5): RunResult & { bossLeft: number } {
  const h = make("h", cls, b.hero, build);
  const pack: Pack = { heal: potions, mana: potions, healUsed: 0, manaUsed: 0, size: potionSize(b.hero), lastDrink: -1e9 };
  const m = new MobF(mobSpec(b.kind, b.level, { hpMult: b.hpMult, weapon: b.weapon }));
  const d = new PveDuel(h, [m], pack, 0);
  let w: F | null | undefined;
  while (d.now < 240000 && (w = d.step()) === undefined) { /* fight */ }
  const won = w === h;
  return { won, kills: won ? 1 : 0, hpLostPerKill: 0, secPerKill: d.now / 1000, heals: pack.healUsed, manas: pack.manaUsed, bossLeft: m.hp / m.maxHp };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** Try other numbers without editing the game: --hp=0.4 --dmg=0.15 (MOB_LEVEL per-level growth). */
for (const a of process.argv) {
  const m = /^--(hp|dmg)=([\d.]+)$/.exec(a);
  if (m) MOB_LEVEL[m[1] === "hp" ? "hp" : "damage"] = Number(m[2]);
  const k = /^--scale=([\d.]+)$/.exec(a); // skill attribute scaling x this
  if (k) for (const list of Object.values(SKILLS)) for (const sk of list) if (sk.scale) sk.scale.per *= Number(k[1]);
}

if (process.argv[1]?.includes("pve")) {
  const n = Number(process.argv[2]) || 30;
  const doBosses = !process.argv.includes("--zones"), doZones = !process.argv.includes("--bosses");
  if (doZones) {
    ACT2 = process.argv.includes("--act2"); // the desert's monsters, heroes Lv 30-48
    const levels = ACT2 ? [30, 33, 36, 39, 42, 45, 48] : [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30];
    console.log(`Zone runs: ${CHAIN} encounters (1-3 monsters) in a row vs monsters of the hero's level to +2 (capped 25), 3 heal + 3 mana potions.`);
    console.log("Cell = cleared% / HP lost per kill / seconds per kill / potions drunk per run");
    console.log("Lv".padEnd(5) + ACTIVE_CLASSES.map((c) => c.padEnd(22)).join(""));
    const tot: Record<string, { w: number; n: number }> = {};
    for (const L of levels) {
      let line = String(L).padEnd(5);
      for (const c of ACTIVE_CLASSES) {
        let won = 0, hp = 0, sec = 0, pots = 0;
        for (let i = 0; i < n; i++) {
          const r = zoneRun(c, L, (i % 3) as Build, () => L + Math.floor(Math.random() * 3));
          won += r.won ? 1 : 0; hp += r.hpLostPerKill; sec += r.secPerKill; pots += r.heals + r.manas;
        }
        (tot[c] ??= { w: 0, n: 0 }).w += won; tot[c].n += n;
        line += `${pct(won / n)}/${pct(hp / n)}/${(sec / n).toFixed(1)}s/${(pots / n).toFixed(1)}`.padEnd(22);
      }
      console.log(line);
    }
    console.log("all".padEnd(5) + ACTIVE_CLASSES.map((c) => pct(tot[c].w / tot[c].n).padEnd(22)).join(""));
  }
  if (doBosses) {
    console.log("\nBosses (solo, hero 1 level below unless capped, 5 heal + 5 mana potions). Cell = win% / avg fight s / boss HP left when lost");
    console.log("".padEnd(24) + ACTIVE_CLASSES.map((c) => c.padEnd(18)).join(""));
    for (const b of BOSSES) {
      let line = b.name.padEnd(24);
      for (const c of ACTIVE_CLASSES) {
        let won = 0, sec = 0, left = 0, lostN = 0;
        for (let i = 0; i < n; i++) {
          const r = bossRun(c, b, (i % 3) as Build);
          won += r.won ? 1 : 0; sec += r.secPerKill; if (!r.won) { left += r.bossLeft; lostN++; }
        }
        line += `${pct(won / n)}/${(sec / n).toFixed(0)}s/${lostN ? pct(left / lostN) : "-"}`.padEnd(18);
      }
      console.log(line);
    }
  }
}
