import { addHeat } from "../shared/overload";
import { AFFIX_FX as F, championHp, championName, packAffixes, pickAffixes, rollChampion, taintElement, type AffixKey } from "../shared/champions";
import { rollRune } from "../shared/runes";
import type { Element } from "../shared/elements";
import type { MobKind } from "../shared/constants";

/**
 * Champions on the server (shared/champions.ts has the rules): makes a zone monster a champion and runs its affixes.
 * TownRoom calls in at a few points only (spawn, its AI tick, when it is hurt, when it strikes a hero, its loot and
 * death, and once per tick for the ballistae), through the small ChampHost below, so the room stays in charge.
 */

/** What a champion remembers (not synced: the client only needs Mob.champion and the "champ" messages). */
export interface ChampState {
  affixes: AffixKey[];
  split: boolean; rose: boolean; shifted: boolean; called: boolean;
  nextPool: number; nextBallista: number; castUntil: number;
  nextBlink: number; goneUntil: number; goneKind: "" | "buried" | "veil";
  nextAura: number;
}

/** The parts of a monster this module touches (TownRoom's Mob). */
export interface ChampMob {
  kind: MobKind; level: number; weapon: string; x: number; y: number; hp: number; maxHp: number;
  dead: boolean; hidden: boolean; moving: boolean; winding: boolean; target: string; title: string; champion: number;
  stunUntil: number; champ?: ChampState;
}
export interface ChampHero { x: number; y: number; dead: boolean; energy: number; dir: string }

export interface ChampHost {
  mob(id: string): ChampMob | undefined;
  heroes(): Iterable<[string, ChampHero]>;
  hero(id: string): ChampHero | undefined;
  broadcast(type: string, msg: unknown): void;
  /** A plain helper monster (zone -1, never a champion) at a spot; returns its id. */
  spawnHelper(kind: MobKind, x: number, y: number, level: number, weapon?: string): string | undefined;
  /** The champion's own damage at its level, times mult. */
  dmg(m: ChampMob, mult: number): number;
  hurtHero(pid: string, dmg: number, fromId: string, o: { el?: Element; dot?: boolean }): void;
  hazard(m: ChampMob, id: string, x: number, y: number, r: number, ms: number, tickMs: number, dmg: number, el: Element, now: number): void;
  shoot(fromId: string, m: ChampMob, x: number, y: number, tx: number, ty: number, speed: number, range: number, radius: number, dmg: number): void;
  canStand(x: number, y: number): boolean;
}

interface Ballista { key: string; owner: string; x: number; y: number; until: number; nextShot: number }

/** Beast-folk whose other skin is only a look (gnawkin's other half is a slinger: it keeps its own). */
const SKIN_SWAP: MobKind[] = ["tuskborn", "silkwretch", "duskwing"];

export class Champions {
  private ballistae: Ballista[] = [];
  private brands = new Map<string, { n: number; until: number }>(); // "champion id:hero id"
  private seq = 0;
  constructor(private host: ChampHost) {}

  /** A zone monster that just (re)spawned: maybe it comes as a champion (CHAMPION.chance). */
  roll(m: ChampMob, id: string, rnd: () => number = Math.random): boolean {
    const a = rollChampion(m.kind, rnd);
    if (!a) return false;
    this.make(m, id, a, rnd);
    return true;
  }

  /** Makes it a champion with these affixes (all of its family's when none are given). */
  make(m: ChampMob, id: string, affixes: AffixKey[] = pickAffixes(m.kind), rnd: () => number = Math.random) {
    const now = Date.now();
    m.champion = packAffixes(affixes);
    m.title = championName(m.kind, affixes, rnd);
    m.hp = m.maxHp = championHp(m.maxHp);
    if (m.kind === "skeleton") m.weapon = "sword"; // its champion sheet holds a bone blade: it fights with sword reach
    m.champ = {
      affixes, split: false, rose: false, shifted: false, called: false,
      nextPool: 0, nextBallista: 0, castUntil: 0,
      nextBlink: now + (affixes.includes("veil") ? F.veil.firstMs : F.buried.firstMs), goneUntil: 0, goneKind: "", nextAura: 0,
    };
    void id;
  }

  /** Back to a plain monster (a respawn reusing the same Mob). */
  clear(m: ChampMob) { m.champion = 0; m.champ = undefined; }

  /** Speed and attack cooldown multipliers (Hide-Stitched in its other skin). */
  speedMult(m: ChampMob) { return m.champ?.shifted ? F.stitched.speed : 1; }
  cooldownMult(m: ChampMob) { return m.champ?.shifted ? F.stitched.cooldown : 1; }

  /** Its part of the AI tick. True while it is busy (under the sand, behind its veil, setting up a ballista). */
  tick(m: ChampMob, id: string, now: number): boolean {
    const c = m.champ;
    if (!c || m.dead) return false;
    const H = this.host, has = (k: AffixKey) => c.affixes.includes(k);
    if (c.goneUntil) {
      m.moving = false;
      if (now < c.goneUntil) return true;
      this.surface(m, id, c);
      return false;
    }
    if (c.castUntil) {
      m.moving = false;
      if (now < c.castUntil) return true;
      c.castUntil = 0; m.winding = false;
      this.plant(m, id, now);
      return false;
    }
    if (has("sunborn") && now >= c.nextAura) {
      c.nextAura = now + F.sunborn.everyMs;
      const dmg = H.dmg(m, F.sunborn.dmgMult);
      for (const [pid, p] of H.heroes()) {
        if (p.dead || Math.abs(p.x - m.x) > F.sunborn.radius || Math.abs(p.y - m.y) > F.sunborn.radius || Math.hypot(p.x - m.x, p.y - m.y) > F.sunborn.radius) continue;
        H.hurtHero(pid, dmg, id, { el: "fire", dot: true });
        addHeat(p, F.sunborn.heat);
      }
    }
    const t = m.target ? H.hero(m.target) : undefined;
    if (!t || t.dead) return false;
    const dist = Math.hypot(t.x - m.x, t.y - m.y);
    if ((has("taint") || has("deepvenom")) && now >= c.nextPool) {
      const P = has("taint") ? F.taint : F.deepvenom, el: Element = has("taint") ? taintElement(m.kind) : "poison";
      c.nextPool = now + P.everyMs;
      H.hazard(m, id, m.x, m.y, P.radius, P.ms, P.tickMs, H.dmg(m, P.dmgMult), el, now);
      H.broadcast("champ", { ev: "pool", id, x: Math.round(m.x), y: Math.round(m.y), r: P.radius, ms: P.ms, el });
    }
    if (has("gang") && !c.called) {
      c.called = true;
      for (let i = 0; i < F.gang.count; i++) {
        const a = (i / F.gang.count) * Math.PI * 2 + Math.random();
        let x = m.x + Math.cos(a) * F.gang.spread, y = m.y + Math.sin(a) * F.gang.spread;
        if (!H.canStand(x, y)) { x = m.x; y = m.y; }
        const hid = H.spawnHelper("bandit", x, y, Math.max(1, m.level - F.gang.levelDrop), "cutthroat");
        const h = hid ? H.mob(hid) : undefined;
        if (h) h.target = m.target;
      }
      H.broadcast("champ", { ev: "gang", id, x: Math.round(m.x), y: Math.round(m.y) });
    }
    if (has("siege") && now >= c.nextBallista && dist <= F.siege.range && !this.ballistae.some((b) => b.owner === id)) {
      c.nextBallista = now + F.siege.cooldownMs;
      c.castUntil = now + F.siege.castMs;
      m.winding = true; m.moving = false;
      H.broadcast("champ", { ev: "build", id, ms: F.siege.castMs });
      return true;
    }
    const blink: AffixKey | undefined = has("buried") ? "buried" : has("veil") ? "veil" : undefined;
    if (blink && now >= c.nextBlink && (blink === "veil" || dist >= F.buried.minDist)) {
      const B = blink === "buried" ? F.buried : F.veil;
      c.nextBlink = now + B.everyMs;
      c.goneUntil = now + (blink === "buried" ? F.buried.underMs : F.veil.goneMs);
      c.goneKind = blink;
      m.hidden = true; m.moving = false; m.winding = false;
      H.broadcast("champ", { ev: blink === "buried" ? "burrow" : "veil", id, x: Math.round(m.x), y: Math.round(m.y) });
      return true;
    }
    return false;
  }

  /** Out of the sand (beside its hero) or out of the veil (behind them). */
  private surface(m: ChampMob, id: string, c: ChampState) {
    const H = this.host, t = m.target ? H.hero(m.target) : undefined;
    if (t && !t.dead) {
      let x: number, y: number;
      if (c.goneKind === "veil") {
        const dx = t.x - m.x, dy = t.y - m.y, d = Math.hypot(dx, dy) || 1;
        x = t.x + (dx / d) * F.veil.behind; y = t.y + (dy / d) * F.veil.behind; // past them: behind their back
      } else {
        const a = Math.random() * Math.PI * 2;
        x = t.x + Math.cos(a) * F.buried.surfaceDist; y = t.y + Math.sin(a) * F.buried.surfaceDist;
      }
      if (H.canStand(x, y)) { m.x = x; m.y = y; }
    }
    m.hidden = false;
    H.broadcast("champ", { ev: c.goneKind === "veil" ? "unveil" : "surface", id, x: Math.round(m.x), y: Math.round(m.y) });
    c.goneUntil = 0; c.goneKind = "";
  }

  /** The Siegewright's ballista goes up where it stands. */
  private plant(m: ChampMob, id: string, now: number) {
    const b: Ballista = { key: `bal${++this.seq}`, owner: id, x: m.x + 10, y: m.y + 4, until: now + F.siege.lifeMs, nextShot: now + 600 };
    if (!this.host.canStand(b.x, b.y)) { b.x = m.x; b.y = m.y; }
    this.ballistae.push(b);
    this.host.broadcast("champ", { ev: "ballista", id: b.key, owner: id, x: Math.round(b.x), y: Math.round(b.y), ms: F.siege.lifeMs });
  }

  /** Called once per room tick: ballistae shoot at the nearest hero, and go when their time is up or their builder falls. */
  update(now: number) {
    if (!this.ballistae.length) { if (this.brands.size) this.dropOldBrands(now); return; }
    const H = this.host;
    this.ballistae = this.ballistae.filter((b) => {
      const m = H.mob(b.owner);
      if (!m || m.dead || !m.champ || now >= b.until) { H.broadcast("champ", { ev: "ballistaend", id: b.key }); return false; }
      if (now < b.nextShot) return true;
      let best: ChampHero | undefined, bd = F.siege.shotRange;
      for (const [, p] of H.heroes()) {
        if (p.dead || Math.abs(p.x - b.x) > bd || Math.abs(p.y - b.y) > bd) continue;
        const d = Math.hypot(p.x - b.x, p.y - b.y);
        if (d < bd) { bd = d; best = p; }
      }
      if (!best) return true;
      b.nextShot = now + F.siege.shotEveryMs;
      H.shoot(b.owner, m, b.x, b.y - 6, best.x, best.y, F.siege.shotSpeed, F.siege.shotRange * 1.3, F.siege.shotRadius, H.dmg(m, F.siege.dmgMult));
      H.broadcast("champ", { ev: "fire", id: b.key, x: Math.round(best.x), y: Math.round(best.y) });
      return true;
    });
    if (this.brands.size) this.dropOldBrands(now);
  }
  private dropOldBrands(now: number) { for (const [k, v] of this.brands) if (now >= v.until) this.brands.delete(k); }

  /** Live ballistae (tests, bench). */
  ballistaCount(owner?: string) { return owner ? this.ballistae.filter((b) => b.owner === owner).length : this.ballistae.length; }

  /**
   * After a hero's blow took its HP (m.hp already lowered). Risen: a killing blow leaves it standing (once).
   * Splitting: at half health a twin breaks off. Hide-Stitched: at half health it tears into its other skin.
   */
  hurt(m: ChampMob, id: string, now: number) {
    const c = m.champ;
    if (!c || m.dead) return;
    const H = this.host, has = (k: AffixKey) => c.affixes.includes(k);
    if (m.hp <= 0) {
      if (has("risen") && !c.rose) {
        c.rose = true;
        m.hp = Math.max(1, Math.round(m.maxHp * F.risen.hpFrac));
        m.stunUntil = Math.max(m.stunUntil, now + F.risen.stunMs);
        H.broadcast("champ", { ev: "rise", id, x: Math.round(m.x), y: Math.round(m.y) });
      }
      return;
    }
    if (has("split") && !c.split && m.hp <= m.maxHp * F.split.hpFrac) {
      c.split = true;
      let x = m.x + 12, y = m.y + 4;
      if (!H.canStand(x, y)) { x = m.x - 12; if (!H.canStand(x, y)) x = m.x; }
      const tid = H.spawnHelper(m.kind, x, y, m.level);
      const tw = tid ? H.mob(tid) : undefined;
      if (tw) { tw.maxHp = Math.round(m.maxHp / 2); tw.hp = Math.min(tw.maxHp, m.hp); tw.target = m.target; }
      H.broadcast("champ", { ev: "split", id, twin: tid, x: Math.round(m.x), y: Math.round(m.y) });
    }
    if (has("stitched") && !c.shifted && m.hp <= m.maxHp * F.stitched.hpFrac) {
      c.shifted = true;
      if (SKIN_SWAP.includes(m.kind)) m.weapon = m.weapon === "folk" ? "" : "folk";
      H.broadcast("champ", { ev: "shift", id, x: Math.round(m.x), y: Math.round(m.y) });
    }
  }

  /** It landed a real blow on a hero (not a burn or a puddle). Sun-Branded: the third brand flares. */
  struck(m: ChampMob, id: string, pid: string, now: number) {
    if (!m.champ?.affixes.includes("brand")) return;
    const k = `${id}:${pid}`, b = this.brands.get(k);
    const n = b && now < b.until ? b.n + 1 : 1;
    if (n < F.brand.stacks) { this.brands.set(k, { n, until: now + F.brand.ms }); this.host.broadcast("champ", { ev: "brand", id, hero: pid, n }); return; }
    this.brands.delete(k);
    const p = this.host.hero(pid);
    this.host.broadcast("champ", { ev: "flare", id, hero: pid });
    this.host.hurtHero(pid, this.host.dmg(m, F.brand.dmgMult), id, { el: "fire", dot: true });
    if (p && !p.dead) addHeat(p, F.brand.heat);
  }

  /** Brands on a hero right now (tests). */
  brandsOn(id: string, pid: string) { return this.brands.get(`${id}:${pid}`)?.n ?? 0; }

  /** What a champion leaves besides its normal loot: a rune, always. */
  loot(m: ChampMob, rnd: () => number = Math.random): string | undefined {
    return m.champion ? rollRune(m.level, rnd) : undefined;
  }

  /** It is down for good: its ballista falls with it. */
  died(_m: ChampMob, id: string) {
    this.ballistae = this.ballistae.filter((b) => {
      if (b.owner !== id) return true;
      this.host.broadcast("champ", { ev: "ballistaend", id: b.key });
      return false;
    });
  }
}
