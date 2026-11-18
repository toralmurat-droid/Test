/**
 * Clan troops that fight (shared/war/troops.ts has the numbers and the pure rules). A land wakes when a hero comes
 * near it: its holder's patrol column and Hold guards appear as real monsters (kind "trooper", clan in Mob.weapon),
 * march the shared patrol loop, hunt the wild monsters of their land (never one a hero they don't fight is busy with)
 * and fight the heroes their clan fights (troopStance: sworn to a clan at war, provoked, Wanted: shared/war/feuds.ts); only
 * those heroes can hurt them. A Wanted hero is seen from farther and chased past the leash. Fallen troopers come back at the Hold gate; a
 * land with no hero near goes back to sleep. Each place in a column or a guard has its role (shared/war/troops.ts roleOf):
 * archers, pikes and riders fight their own way (server/troopRoles.ts), the foot soldier's turn below is that of before
 * the roles. A fort's courtyard archers (ROLE_PLAN.wall) stand on its walls or towers and never leave them.
 * TownRoom calls in at a few points (a tick a second, every trooper's turn, a hero's hit on one, its death, the war
 * news, a hero leaving) through the narrow WarTroopsHost below. Troopers give no XP and no loot (TownRoom.hitTarget).
 */
import { BOSS, dirInput, ELITE, MOB_ATTACK_RANGE, TILE, type Dir, type MobKind } from "../shared/constants";
import { MOB_COMBAT, mobBody } from "../shared/combat";
import { SLOW_MOB } from "../shared/powers";
import { underground } from "../shared/dungeon";
import { isSafeZone } from "../shared/map";
import { blocked, moveStep } from "../shared/movement";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { fortDetour } from "../shared/war/holdRoutes";
import { garrisonSpots, patrolCount, patrolOf, patrolPos, TROOP } from "../shared/war/patrols";
import { holdGuards, viewTier } from "../shared/war/intel";
import type { HoldTier } from "../shared/war/holdTiers";
import { RENOWN_RANKS, rankOf } from "../shared/war/renown";
import { TERRITORIES } from "../shared/war/territories";
import { columnLead, parseTroop, roleOf, TROOP_ROLE, troopLevel, troopStats, troopName, troopStance, troopWeapon, WAR_TROOPS, type TroopRole, type TroopStance } from "../shared/war/troops";
import { bowRange, chargeBreak, giveUpStep, newCharge, roleVs, shotClear, shunned, wallPost, type Charge, type GiveUp } from "../shared/war/troopRoles";
import type { WarView } from "../shared/war/view";
import { rallyRenown, targetsOf } from "../shared/war/rules";
import { atWar, FEUD, wantedTier, type FeudState } from "../shared/war/feuds";
import { STANDARD } from "../shared/war/standards";
import { territoryAt } from "../shared/war/view";
import { inSackReach } from "../shared/war/holdSack";
import { addValor, warNow, warState } from "./war";
import { boonRenown, keyOf } from "./warCrown";
import { archerFight, offLimits, pikeBrace, pikeHolds, pikeTether, riderFight, TroopArrows, type RoleCtx } from "./troopRoles";

/** The parts of a hero this module reads (TownRoom's Player). */
/** `cls`: the hero's class (a Reckoning keys its heroes by account and class: server/warCrown.ts keyOf). */
export interface TroopHero { name: string; cls?: string; clan?: ClanKey; level: number; x: number; y: number; dead: boolean; renown: number; feud?: FeudState }
/** The parts of a monster this module reads and moves (TownRoom's Mob). */
export interface TroopMob {
  kind: string; weapon: string; level: number; x: number; y: number; homeX: number; homeY: number; dir: Dir;
  hp: number; maxHp: number; dead: boolean; hidden: boolean; owner: string; target: string; hateId: string; hate: number; foe: string;
  summonFor: string; qwave: boolean; servant: boolean; title: string; tide: boolean;
  moving: boolean; stunned: boolean; slowed: boolean; broken: boolean; winding: boolean;
  windUntil: number; lastAttack: number; stunUntil: number; slowUntil: number;
}

export interface WarTroopsHost {
  /** A plain trooper monster with this id at (x, y) and this level and weapon (no zone: it never respawns by itself). */
  spawn(id: string, level: number, x: number, y: number, weapon: string): TroopMob | undefined;
  /** Gone without a death (its land sleeps, changed hands, or holds fewer men). */
  remove(id: string): void;
  mob(id: string): TroopMob | undefined;
  mobsInBox(x: number, y: number, r: number): Iterable<[string, TroopMob]>;
  heroes(): Iterable<[string, TroopHero]>;
  hero(id: string): TroopHero | undefined;
  /** The hero cannot be seen or touched right now (Void Slip). */
  hidden(id: string, now: number): boolean;
  /** A trooper's blow on a hero / on a monster (summons and other troopers included). `o`: a rider's charge (its lane as the push, a harder knockback, a stagger). */
  strikeHero(mobId: string, heroId: string, dmg: number, byName: string, o?: { push?: [number, number]; kb?: number; stunMs?: number }): void;
  /** `shot`: an archer's shot landing (server/troopRoles.ts TroopArrows), no swing. */
  strikeMob(mobId: string, targetId: string, dmg: number, shot?: boolean): void;
  /** A javelin from the trooper toward (tx, ty), or an archer's shot (`spec`): it only hurts heroes clan `clan` fights. */
  shoot(mobId: string, clan: ClanKey, tx: number, ty: number, dmg: number, byName: string, spec?: TroopShot): void;
  /** An `sfx` event for the clients (an archer's shot at a monster or a trooper: "troop_shot"; a rider's charge: "troop_charge", a pike stopping it: "troop_brace"). */
  sfx?(msg: { ev: string } & Record<string, unknown>): void;
  /** A hero reached a new renown rank (the room tells them, as for the standards). */
  ranked(heroId: string, rank: string): void;
  /** Troopers the caravans hold out of WAR_TROOPS.maxTroops right now (server/warCaravans.ts). */
  reserved?(): number;
}

/** An archer's shot: the client's projectile kind, its speed (px/s), range (px) and radius (px). */
export interface TroopShot { kind: string; speed: number; range: number; radius: number }

type Role = "march" | "guard";
/** One place in a land's force: who fills it (or when its man fell). */
interface Slot { role: Role; i: number; officer: boolean; id: string; fellAt: number }
/** `tier`: the Hold's tier its guards stand round (holdTiers.ts, from the war snapshot): their number and posts follow it. */
interface Land { t: number; clan?: ClanKey; tier: HoldTier; lastHero: number; slots: Slot[] }
/**
 * A soldier's fighting state: a patrol trooper's, or one of the other modules' (caravans, sieges, columns, battles,
 * manhunters...). `role`: archers, pikes and riders (nextShot / aimUntil: an archer's bow; charge: a rider's; braceUntil:
 * a pike braced against one; GiveUp: a courtyard archer's or guard pike's target out of its reach, TROOP_ROLE.giveUp).
 */
export interface Fighter extends GiveUp { clan: ClanKey; officer: boolean; role: TroopRole; /** A role soldier's squad multipliers (TROOP_ROLE.squad: columns, escorts, manhunters, the ram crew, tunnel waves, gate guards). */ mod?: { hp: number; dmg: number }; nextPick: number; near: boolean; nextRush: number; rushUntil: number; rushHit: boolean; nextThrow: number; throwing: boolean; nextShot: number; aimUntil: number; charge: Charge; braceUntil: number }
/**
 * Where a soldier fights: `leash` holds every foe and chase, `hunt` the wild monsters it goes for unprovoked, `far` (when
 * given) the wider leash for a hero its clan wants (shared/war/feuds.ts FEUD.leashTiles).
 */
export interface FightGround {
  leash(x: number, y: number): boolean; hunt(x: number, y: number): boolean; far?(x: number, y: number): boolean;
  /** Heroes it fights at all (unset: every enemy; a town's gate guard: TOWN.minFoeLevel and up). */ foe?(hero: TroopHero): boolean;
  /** Its post or column place now (a pike's tether, a guard archer's), and whether it is a Hold guard (server/troopRoles.ts). */
  post?(now: number): { x: number; y: number }; guard?: boolean;
  /** A courtyard archer on its wall post: it never steps off it and hunts no wild monster (only what it fights or what hit it). */
  perch?: boolean;
}
export const newFighter = (clan: ClanKey, officer: boolean, role: TroopRole = "foot", mod?: { hp: number; dmg: number }): Fighter =>
  ({ clan, officer, role: officer ? "foot" : role, ...(mod && !officer && role !== "foot" ? { mod } : {}), nextPick: 0, near: false, nextRush: 0, rushUntil: 0, rushHit: false, nextThrow: 0, throwing: false, nextShot: 0, aimUntil: 0, charge: newCharge(), braceUntil: 0,
    outOf: "", outSince: 0, shun: "", shunUntil: 0 });
interface Troop extends Fighter { t: number; slot: Slot; g: FightGround }

const SLEEPING = -Infinity;

export class WarTroops {
  private lands = new Map<number, Land>();
  private troops = new Map<string, Troop>();
  /** Kill valor per hero name in the current war tick (WAR_TROOPS.killValorPerTick). */
  private valor = new Map<string, { tick: number; n: number }>();
  /** Lands whose Hold guards stay down until a war tick (holdGuardsOff). */
  private guardsOff = new Map<number, number>();
  /** Hold guards fallen per land (war tick, time): guardsDue counts those of this war tick and those not back yet. */
  private guardFalls = new Map<number, { tick: number; at: number }[]>();
  /** Hero kills that paid kill valor this war tick, as `killer|victim` (one payout per victim per killer per tick). */
  private heroKills = new Map<string, number>();
  private seq = 0;
  /** Archers' shots in flight at monsters and troopers (server/troopRoles.ts). */
  private arrows = new TroopArrows();
  private roleCtx: RoleCtx;
  /**
   * The other modules' riders, pikes and archers (sieges, columns, battles, caravans, manhunters: they fight through
   * think / fight), by mob id, so a pike braces against any rival rider's charge and stops it (troopRoles.ts bracer).
   * Each enlists on its turn (think); the fallen and the gone are swept once a second (tick).
   */
  private others = new Map<string, Fighter>();

  constructor(private h: WarTroopsHost) {
    this.roleCtx = { h, arrows: this.arrows, walk: (m, gx, gy, dt, pace) => this.walk(m, gx, gy, dt, pace), fighter: (id) => this.troops.get(id) ?? this.others.get(id) };
  }

  /** Troopers alive now (tests, the bench). */
  get count(): number { return this.troops.size; }

  /** The stance of clan `k`'s troops toward hero `pid` (troopStance: the hero's oath, level and feuds, and the clans at war). */
  stance(k: ClanKey, pid: string): TroopStance {
    const p = this.h.hero(pid);
    return p ? troopStance(k, p) : "neutral";
  }

  /**
   * May this hero hurt that trooper? Only a hero the troops fight (sworn to another clan, of oath level), never on the
   * safe square: allies and neutrals can't touch them, so nobody starts a fight by a stray Blizzard (the client's
   * attack cursor reads the same stance).
   */
  canHurt(heroId: string, m: TroopMob): boolean {
    const tr = parseTroop(m.weapon);
    if (!tr) return true;
    return this.stance(tr.clan, heroId) === "enemy" && !isSafeZone(m.x, m.y);
  }

  /** A hero's blow landed on a trooper (only an enemy's can, canHurt): it turns on them. */
  hit(heroId: string, m: TroopMob) {
    const tr = parseTroop(m.weapon);
    if (tr && this.stance(tr.clan, heroId) === "enemy") m.target = heroId;
  }

  /** Is this one of the patrol troopers (a land's column or guards)? */
  owns(id: string): boolean { return this.troops.has(id); }

  /** Is this a courtyard archer standing on its fort's wall (the wall sweep, server/holdWalls.ts, leaves it there)? */
  perched(id: string): boolean { return !!this.troops.get(id)?.g.perch; }

  /** Once per room tick: the archers' shots at monsters and troopers in flight land. */
  frame(now = Date.now()) { if (this.arrows.size) this.arrows.fly(this.h, now); }

  /**
   * A patrol trooper died (by any hand). A hero sworn to another clan standing in its land gets the writ credit (returned:
   * the land and the trooper's clan, cap or not), and kill valor when the clans are at war (killValor).
   */
  killed(m: TroopMob, id: string, killerId: string, now = Date.now()): { t: number; clan: ClanKey } | undefined {
    const tr = this.troops.get(id);
    if (!tr) return undefined;
    this.troops.delete(id);
    tr.slot.id = ""; tr.slot.fellAt = now;
    if (tr.slot.role === "guard") this.guardFell(tr.t, now);
    const p = this.h.hero(killerId), t = TERRITORIES[tr.t];
    if (!p || !p.clan || p.clan === tr.clan || !t || !warNow()) return undefined;
    const tx = p.x / TILE, ty = p.y / TILE;
    if (tx < t.x || ty < t.y || tx >= t.x + t.w || ty >= t.y + t.h) return undefined;
    this.killValor(killerId, tr.clan, tr.officer ? "officer" : "soldier", tr.t);
    return { t: tr.t, clan: tr.clan };
  }

  /**
   * Kill valor (W2c: valor comes from fighting): a hero of oath level sworn to a clan at war with `victim` who fells one
   * of its soldiers or officers, or a hero sworn to it, earns WAR_TROOPS.killPts for their clan in land `t` (default: the
   * land the killer stands in; none in a village or a lair) if the war lets that clan fight there (it holds it or may
   * attack it: targetsOf), at most killValorPerTick per hero per war tick, and as much
   * renown (more under the Rally). Returns the valor paid. The room calls it for every trooper that is not a patrol's
   * (sieges, escorts, tunnels, acolytes, manhunters) and for heroes; killed() calls it for the patrols.
   */
  killValor(killerId: string, victim: ClanKey, part: "soldier" | "officer" | "hero", t?: number): number {
    const p = this.h.hero(killerId), v = warNow();
    if (!p || !p.clan || !v || p.dead || p.level < STANDARD.minLevel || p.clan === victim || !atWar(p.clan, victim)) return 0;
    const land = t ?? territoryAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE))?.id, st = warState();
    if (land === undefined || !st || !(st.owner[land] === p.clan || targetsOf(st, p.clan).includes(land))) return 0; // only where the war lets that clan fight (as the rituals' and caravans' valor)
    for (const [k, c] of this.valor) if (c.tick !== v.tick) this.valor.delete(k); // counts of past war ticks are done with
    const c = this.valor.get(p.name), used = c && c.tick === v.tick ? c.n : 0;
    const add = Math.min(WAR_TROOPS.killPts[part], WAR_TROOPS.killValorPerTick - used);
    if (add <= 0) return 0;
    this.valor.set(p.name, { tick: v.tick, n: used + add });
    const was = rankOf(p.renown);
    if (!addValor(land, p.clan, add, keyOf(p))) return 0;
    p.renown += add * rallyRenown(warState(), p.clan) * boonRenown(p.clan); // effort the war counted earns renown (shared/war/renown.ts)
    const rank = rankOf(p.renown);
    if (rank > was) this.h.ranked(killerId, RENOWN_RANKS[rank].name);
    return add;
  }

  /**
   * Kill valor for felling hero `victimId` (sworn to `victim`): at most once per victim per killer per war tick, so a
   * pair of heroes can't farm valor off each other's respawns.
   */
  heroKillValor(killerId: string, victimId: string, victim: ClanKey): number {
    const p = this.h.hero(killerId), q = this.h.hero(victimId), v = warNow();
    if (!p || !q || !v) return 0;
    for (const [k, tick] of this.heroKills) if (tick !== v.tick) this.heroKills.delete(k);
    const key = `${p.name}|${q.name}`;
    if (this.heroKills.has(key)) return 0;
    const add = this.killValor(killerId, victim, "hero");
    if (add > 0) this.heroKills.set(key, v.tick);
    return add;
  }

  /** A guard of land t's Hold fell. */
  private guardFell(t: number, now: number) {
    const l = this.guardFalls.get(t) ?? [];
    l.push({ tick: warNow()?.tick ?? -1, at: now });
    this.guardFalls.set(t, l);
  }

  /** Guards of land t's Hold that fell this war tick or are not back yet (WAR_TROOPS.respawnMs). */
  private guardsDown(t: number, now: number): number {
    const tick = warNow()?.tick ?? -1, l = (this.guardFalls.get(t) ?? []).filter((f) => f.tick === tick || now - f.at < WAR_TROOPS.respawnMs);
    if (l.length) this.guardFalls.set(t, l); else this.guardFalls.delete(t);
    return l.length;
  }

  /** How many guards territory t's Hold should field now (its tier and Control, its garrison spots; none while sacked), whatever the room's budget. */
  private guardsWanted(t: number): number {
    const v = warNow();
    if (!v || !CLAN_KEYS[v.owner[t]] || !patrolOf(t)) return 0;
    const off = this.guardsOff.get(t);
    if (off !== undefined && v.tick < off) return 0;
    return holdGuards(t, v.control[t] ?? 100, viewTier(v, t));
  }

  /**
   * Guards territory t's Hold still owes a fight: those it should field minus those felled this war tick (or not back
   * yet). A busy room's budget may field fewer (or none), but a sack must still cut through them all (server/warHolds.ts).
   */
  guardsDue(t: number, now = Date.now()): number {
    return Math.max(0, this.guardsWanted(t) - this.guardsDown(t, now));
  }

  /** Living guards of territory t's Hold (the guard slots of its patrol force), only those where `near(x, y)` when given. */
  guardsAlive(t: number, near?: (x: number, y: number) => boolean): number {
    let n = 0;
    for (const s of this.lands.get(t)?.slots ?? []) {
      if (s.role !== "guard" || !s.id) continue;
      const m = this.h.mob(s.id);
      if (m && !m.dead && (!near || near(m.x, m.y))) n++;
    }
    return n;
  }

  /** Territory t's Hold fields no guards until war tick `untilTick` (a sacked Hold, server/warHolds.ts): the next tick() trims them. */
  holdGuardsOff(t: number, untilTick: number) {
    this.guardsOff.set(t, Math.max(this.guardsOff.get(t) ?? -Infinity, untilTick));
  }

  /** A hero left or died: no trooper keeps chasing them. */
  forget(heroId: string) {
    for (const id of this.troops.keys()) { const m = this.h.mob(id); if (m && m.target === heroId) m.target = ""; }
  }

  /** War news (after every war tick): owners and control may have changed, so the lands are set right at once. */
  onWar(_v: WarView) { this.tick(Date.now()); }

  /** Once a second: wake lands near heroes, put the others to sleep, fill and trim each land's force, bring back the fallen. */
  tick(now = Date.now()) {
    for (const id of this.others.keys()) { const m = this.h.mob(id); if (!m || m.dead) this.others.delete(id); }
    // troopers that vanished without a death (a test, a reset) free their slot at once
    for (const [id, tr] of this.troops) {
      const m = this.h.mob(id);
      if (!m || m.dead) { this.troops.delete(id); tr.slot.id = ""; tr.slot.fellAt = m ? now : SLEEPING; if (m && tr.slot.role === "guard") this.guardFell(tr.t, now); }
    }
    const v = WAR_TROOPS.live ? warNow() : undefined;
    const heroes: TroopHero[] = [];
    if (v) for (const [, p] of this.h.heroes()) if (!p.dead && !underground(p.y)) heroes.push(p);
    const near: [number, number][] = []; // [territory, tiles to the nearest hero]
    if (v) for (const t of TERRITORIES) {
      let best = Infinity;
      for (const p of heroes) {
        const tx = p.x / TILE, ty = p.y / TILE;
        const d = Math.hypot(Math.max(0, t.x - tx, tx - (t.x + t.w)), Math.max(0, t.y - ty, ty - (t.y + t.h)));
        if (d < best) best = d;
      }
      const land = this.lands.get(t.id);
      if (best <= WAR_TROOPS.wakeTiles) {
        if (!land) this.lands.set(t.id, { t: t.id, tier: viewTier(v, t.id), lastHero: now, slots: [] }); else land.lastHero = now;
      }
      const l = this.lands.get(t.id);
      if (l && now - l.lastHero < WAR_TROOPS.sleepMs && patrolOf(t.id)) near.push([t.id, best]);
    }
    const awake = new Set(near.map(([t]) => t));
    for (const [t, land] of this.lands) if (!awake.has(t)) { this.clearLand(land); this.lands.delete(t); }
    // a land with a hero at its banner comes first, guards before marchers, so a busy room still fields the guards a sack must fight
    const atBanner = new Set<number>();
    for (const [t] of near) if (heroes.some((p) => inSackReach(t, p.x, p.y))) atBanner.add(t);
    near.sort((a, b) => (atBanner.has(b[0]) ? 1 : 0) - (atBanner.has(a[0]) ? 1 : 0) || a[1] - b[1]);
    let budget = Math.max(0, WAR_TROOPS.maxTroops - (this.h.reserved?.() ?? 0)); // caravans (server/warCaravans.ts) claim their share first
    for (const [t] of near) {
      const land = this.lands.get(t)!, clan = CLAN_KEYS[v!.owner[t]];
      if (!clan) { this.clearLand(land); continue; }
      const flipped = !!land.clan && land.clan !== clan;
      if (flipped) this.clearLand(land);
      const fresh = !land.clan || flipped;
      land.clan = clan;
      const control = v!.control[t] ?? 100, siege = v!.sieges.some((s) => s[0] === t);
      // the Hold grew or shrank (W3): its guards walk to the new tier's posts, the count follows like a Control change
      land.tier = viewTier(v!, t);
      const off = this.guardsOff.get(t);
      if (off !== undefined && v!.tick >= off) this.guardsOff.delete(t);
      const marchers = siege ? 0 : patrolCount(control), guards = this.guardsOff.has(t) ? 0 : holdGuards(t, control, land.tier); // (a sacked Hold's guards stay down)
      const want = Math.min(marchers + guards, budget);
      budget -= want;
      const slots: Slot[] = [], m: Slot[] = [], g: Slot[] = [];
      for (let i = 0; i < marchers; i++) m.push(this.slotOf(land, "march", i));
      for (let i = 0; i < guards; i++) g.push(this.slotOf(land, "guard", i));
      slots.push(...(atBanner.has(t) ? [...g, ...m] : [...m, ...g]));
      // fewer men now (lower control, a siege, the room's cap): the extra ones go
      for (const s of land.slots) if (!slots.slice(0, want).includes(s) && s.id) this.drop(s);
      land.slots = slots.slice(0, want);
      for (const s of land.slots) {
        if (s.id) { const tr = this.troops.get(s.id); if (tr) this.perch(tr, this.h.mob(s.id)); continue; } // (the Hold's tier may have changed: on or off the wall)

        if (s.fellAt !== SLEEPING && now - s.fellAt < WAR_TROOPS.respawnMs) continue;
        // a land that just woke has its men at their posts; a new holder, the fallen and new recruits come out of the Hold gate
        this.spawn(land, s, fresh && !flipped && s.fellAt === SLEEPING ? this.postOf(t, s, now) : { ...patrolOf(t)!.pts[0] }, clan);
      }
    }
  }

  /** The slot for role/index in a land, reusing the existing one (it keeps its man and its fall time). */
  private slotOf(land: Land, role: Role, i: number): Slot {
    return land.slots.find((s) => s.role === role && s.i === i) ?? { role, i, officer: i === 0, id: "", fellAt: SLEEPING };
  }

  private spawn(land: Land, s: Slot, at: { x: number; y: number }, clan: ClanKey) {
    const id = `wt${++this.seq}`, level = troopLevel(land.t, s.officer), role = s.officer ? "foot" : roleOf(clan, s.role, land.tier, s.i);
    const m = this.h.spawn(id, level, at.x, at.y, troopWeapon(clan, s.officer, false, false, false, role));
    if (!m) return;
    m.hp = m.maxHp = troopStats(clan, level, s.officer, role).hp;
    s.id = id; s.fellAt = SLEEPING;
    const t = land.t, W = WAR_TROOPS;
    const g: FightGround = { leash: (x, y) => this.inLand(t, x, y, W.leashTiles), hunt: (x, y) => !g.perch && this.inLand(t, x, y, W.mobMarginTiles), far: (x, y) => this.inLand(t, x, y, W.leashTiles + FEUD.leashTiles) };
    if (role !== "foot") { g.post = (now) => this.postOf(t, s, now); g.guard = s.role === "guard"; } // (a pike's tether, a guard archer's)
    const tr: Troop = { ...newFighter(clan, s.officer, role), t, slot: s, g };
    this.troops.set(id, tr);
    this.perch(tr, m);
  }

  /**
   * A courtyard archer (ROLE_PLAN.wall: a guard archer whose fort at its land's tier has a wall post for its place) stands
   * on its post: put there at once (it climbs up; it never walks onto a wall). Called at spawn and every tick (the tier may change).
   */
  private perch(tr: Troop, m: TroopMob | undefined) {
    const land = this.lands.get(tr.t), p = tr.role === "archer" && tr.slot.role === "guard" && land?.clan ? wallPost(tr.t, land.clan, land.tier, tr.slot.i) : undefined;
    tr.g.perch = !!p;
    if (p && m && (m.x !== p.x || m.y !== p.y)) { m.x = m.homeX = p.x; m.y = m.homeY = p.y; m.moving = false; }
  }

  private drop(s: Slot) {
    if (s.id) { this.troops.delete(s.id); this.h.remove(s.id); }
    s.id = ""; s.fellAt = SLEEPING;
  }

  private clearLand(land: Land) {
    for (const s of land.slots) this.drop(s);
    land.slots = []; land.clan = undefined;
  }

  /** Guard post i round territory t's Hold at the tier its land stands at now. */
  private guardPost(t: number, i: number) {
    const tier = this.lands.get(t)?.tier ?? 1;
    return garrisonSpots(t, TROOP.garrison[tier][1], tier)[i];
  }

  /** Where a trooper of this slot belongs now: its place in the marching column, or its guard post. */
  private postOf(t: number, s: Slot, now: number): { x: number; y: number } {
    const p = patrolOf(t)!;
    if (s.role === "guard") {
      const tr = s.id ? this.troops.get(s.id) : undefined, land = this.lands.get(t), w = tr?.g.perch && land?.clan ? wallPost(t, land.clan, land.tier, s.i) : undefined;
      if (w) return w; // a courtyard archer's place on the wall
      const g = this.guardPost(t, s.i); return g ? { x: g.x, y: g.y } : { ...p.pts[0] };
    }
    const lead = columnLead(p, now), q = patrolPos(p, lead.d - (s.i >> 1) * TROOP.rankGap), side = s.i & 1 ? 1 : -1;
    const ox = q.x - q.dy * side * TROOP.lateral, oy = q.y + q.dx * side * TROOP.lateral;
    return offLimits(ox, oy) || blocked(ox, oy) ? { x: q.x, y: q.y } : { x: ox, y: oy };
  }

  /** Is (x, y) within `tiles` of territory t's rect? */
  private inLand(t: number, x: number, y: number, tiles: number): boolean {
    const r = TERRITORIES[t], tx = x / TILE, ty = y / TILE;
    return !!r && tx >= r.x - tiles && ty >= r.y - tiles && tx < r.x + r.w + tiles && ty < r.y + r.h + tiles;
  }

  /**
   * Is wild monster `o` busy with someone clan `k` doesn't fight (a hero, or a hero's creature)? The troops keep out of
   * that fight: no stealing a neutral's kill (or its quest credit), no taking sides for an ally.
   */
  private busyElsewhere(o: TroopMob, k: ClanKey): boolean {
    for (const id of [o.target, o.hateId, o.foe]) {
      if (!id) continue;
      const owner = this.h.hero(id) ? id : this.h.mob(id)?.owner;
      if (owner && this.stance(k, owner) !== "enemy") return true;
    }
    return false;
  }

  /**
   * The foe a trooper fights now: an enemy hero, an enemy's creature, a trooper of another clan, a wild monster of its
   * land that no hero they leave alone is fighting, or whatever hit it.
   */
  private pick(m: TroopMob, id: string, tr: Fighter, g: FightGround, now: number): string {
    const W = WAR_TROOPS, R = tr.role === "archer" ? bowRange(g.perch).sightPx : W.aggroPx; // (an archer sees farther, from a wall farther still)
    const tether = tr.role === "pike" && !!g.post; // (a pike with a post or a column place: only foes it can reach from its tether)
    let best = "", bs = 0;
    const consider = (tid: string, x: number, y: number, bonus: number, wanted = false) => {
      const d = Math.hypot(x - m.x, y - m.y), hated = tid === m.hateId ? m.hate : 0;
      if (d >= (hated > 0 ? R * 2 : R) * (wanted ? FEUD.sight : 1) || offLimits(x, y) || !(wanted && g.far ? g.far(x, y) : g.leash(x, y))) return;
      if (shunned(tr, tid, now) || (tether && !pikeHolds(g, x, y, now))) return; // (a target it gave up on: TROOP_ROLE.giveUp)
      const s = Math.max(0.05, 1 - d / R) + bonus + hated + (tid === m.target ? W.stick : 0);
      if (s > bs) { bs = s; best = tid; }
    };
    for (const [pid, p] of this.h.heroes()) {
      const wanted = wantedTier(p.feud, tr.clan, now) > 0, far = R * 2 * (wanted ? FEUD.sight : 1); // a Wanted hero is seen from farther
      if (p.dead || Math.abs(p.x - m.x) > far || Math.abs(p.y - m.y) > far) continue;
      if (troopStance(tr.clan, p, now) !== "enemy" || this.h.hidden(pid, now) || (g.foe && !g.foe(p))) continue;
      consider(pid, p.x, p.y, W.heroBonus, wanted); // a soldier goes for the enemy hero first
    }
    const hated = m.hateId && m.hate > 0 ? this.h.mob(m.hateId) : undefined; // (the only one it sees from twice as far)
    for (const [oid, o] of hated ? [...this.h.mobsInBox(m.x, m.y, R), [m.hateId, hated] as [string, TroopMob]] : this.h.mobsInBox(m.x, m.y, R)) {
      if (oid === id || o.dead || o.hidden) continue;
      if (g.perch && !shotClear(m.x, m.y, o.x, o.y)) continue; // a courtyard archer only goes for what it can shoot from its wall
      if (o.kind === "trooper") { const k = parseTroop(o.weapon); if (k && k.clan !== tr.clan && !k.object) consider(oid, o.x, o.y, W.troopBonus); continue; } // (carts and rams are for heroes to wreck)
      if (o.owner) { if (this.stance(tr.clan, o.owner) === "enemy") consider(oid, o.x, o.y, 0); continue; }
      const fought = oid === m.hateId && m.hate > 0; // whatever hit it, it answers (within its leash)
      if (!fought && (o.summonFor || o.qwave || o.servant || o.title || o.tide || ELITE[o.kind as MobKind] || BOSS[o.kind as MobKind] || o.kind === "nightraider")) continue;
      if (!fought && (!g.hunt(o.x, o.y) || this.busyElsewhere(o, tr.clan))) continue;
      consider(oid, o.x, o.y, 0);
    }
    return best;
  }

  /** A trooper's turn (TownRoom.updateMob): fight what it picked, else keep its place in the column or at its post. */
  step(m: TroopMob, id: string, dt: number, now: number) {
    const tr = this.troops.get(id);
    if (!tr) { this.h.remove(id); return; } // left over from a land that is gone (should not happen)
    if (tr.g.perch) { const p = this.postOf(tr.t, tr.slot, now); if (m.x !== p.x || m.y !== p.y) { m.x = m.homeX = p.x; m.y = m.homeY = p.y; } } // (a knock never throws a courtyard archer off its wall)
    if (this.think(m, id, tr, tr.g, now)) return;
    if (!tr.near) { // no hero near enough to see it: it just keeps its place, no walking and no fights (cheap)
      const post = this.postOf(tr.t, tr.slot, now);
      if ((Math.abs(post.x - m.x) > 1 || Math.abs(post.y - m.y) > 1) && !offLimits(post.x, post.y)) { m.x = m.homeX = post.x; m.y = m.homeY = post.y; }
      m.moving = false; m.windUntil = 0; m.winding = false; tr.aimUntil = 0; tr.braceUntil = 0;
      chargeBreak(tr.charge, now);
      return;
    }
    if (this.fight(m, id, tr, tr.g, dt, now)) return;
    const post = this.postOf(tr.t, tr.slot, now), d = Math.hypot(post.x - m.x, post.y - m.y);
    if (d > WAR_TROOPS.warpPx && !this.seen(m, WAR_TROOPS.warpUnseenPx) && !offLimits(post.x, post.y)) { m.x = post.x; m.y = post.y; m.moving = false; return; }
    if (d < 2) { m.moving = false; this.face(m, tr, now); return; }
    // in step with the column, a little quicker to catch up
    this.walk(m, post.x, post.y, dt, d > WAR_TROOPS.slackPx ? this.speedOf(m, tr) : TROOP.speed * WAR_TROOPS.catchUp);
  }

  /** A soldier's walking speed now (slowed or not). */
  speedOf(m: TroopMob, f: Fighter): number { return troopStats(f.clan, m.level, f.officer, f.role).speed * (m.slowed ? SLOW_MOB : 1); }

  /**
   * The start of a soldier's turn (patrols and caravan escorts alike): stun and break end its wind-ups, and every
   * pickMs it looks whether a hero is near (`f.near`) and picks a foe on `g`. True when the turn is over (stunned).
   */
  think(m: TroopMob, id: string, f: Fighter, g: FightGround, now: number): boolean {
    if (f.role !== "foot" && !this.troops.has(id) && this.others.get(id) !== f) this.others.set(id, f); // (another module's soldier: a pike's brace finds it)
    m.stunned = now < m.stunUntil; m.slowed = now < m.slowUntil;
    if (m.stunned || m.broken) { m.winding = false; m.windUntil = 0; f.throwing = false; f.rushHit = false; f.aimUntil = 0; f.braceUntil = 0; chargeBreak(f.charge, now); } // (a stun breaks a charge off)
    if (m.stunned) { m.moving = false; return true; }
    if (now >= f.nextPick) {
      f.nextPick = now + WAR_TROOPS.pickMs;
      f.near = this.seen(m, WAR_TROOPS.livePx);
      m.target = f.near ? this.pick(m, id, f, g, now) : "";
    }
    return false;
  }

  /**
   * A soldier fights its target: the rush, the javelin at an enemy hero, the wound-up blow, else it closes in. True when
   * it did; false when it has no foe (left), so the caller walks it back to its place. Shared with the caravan escorts.
   */
  fight(m: TroopMob, id: string, tr: Fighter, g: FightGround, dt: number, now: number): boolean {
    // the target must still be fair game (a hero can swear another oath or step onto the safe square)
    const tp = m.target ? this.h.hero(m.target) : undefined, tm = !tp && m.target ? this.h.mob(m.target) : undefined;
    const t = tp ?? tm;
    const far = !!tp && !!g.far && wantedTier(tp.feud, tr.clan, now) > 0; // a Wanted hero is chased past the usual leash
    if (m.target && (!t || (tp && (tp.dead || this.stance(tr.clan, m.target) !== "enemy" || this.h.hidden(m.target, now) || (g.foe && !g.foe(tp))))
      || (tm && (tm.dead || tm.hidden)) || offLimits(t.x, t.y) || !(far ? g.far!(t.x, t.y) : g.leash(t.x, t.y)))) { m.target = ""; m.windUntil = 0; m.winding = false; }
    if (tr.role === "pike" && m.target && t && !pikeHolds(g, t.x, t.y, now)) { m.target = ""; m.windUntil = 0; m.winding = false; } // a pike keeps its place
    if (m.target && t && (g.perch || (g.guard && tr.role === "pike")) && giveUpStep(tr, m.target, this.outOfReach(m, tr, g, tm, t), now)) { m.target = ""; m.windUntil = 0; m.winding = false; } // (TROOP_ROLE.giveUp)
    if (!m.target || !t) {
      tr.throwing = false; tr.rushHit = false; if (tr.aimUntil) { tr.aimUntil = 0; m.winding = false; }
      if (tr.charge.phase === 1 || tr.charge.phase === 2) { chargeBreak(tr.charge, now); m.winding = false; } // (its foe is gone: the charge is off)
      if (tr.braceUntil) { tr.braceUntil = 0; m.winding = false; }
      return false;
    }
    if (tr.role === "archer") return archerFight(this.roleCtx, m, id, tr, g, tp, tm, dt, now);
    if (tr.role === "rider" && riderFight(this.roleCtx, m, id, tr, g, tp, tm, dt, now)) return true;
    if (tr.role === "pike" && pikeBrace(this.roleCtx, m, tr, tm, now)) return true;
    const st = troopStats(tr.clan, m.level, tr.officer, tr.role, tr.mod), speed = st.speed * (m.slowed ? SLOW_MOB : 1);
    const W = WAR_TROOPS, dist = Math.hypot(t.x - m.x, t.y - m.y), reach = MOB_ATTACK_RANGE + (tm ? mobBody(tm.kind as MobKind) : W.heroBody) + (tr.role === "pike" ? TROOP_ROLE.pike.reach : 0);
    const R = W.rush, J = WAR_TROOPS.javelin, by = troopName(tr.clan, tr.officer, false, false, false, tr.role);
    const vs = tm && tr.role !== "foot" && tm.kind === "trooper" ? roleVs(tr.role, parseTroop(tm.weapon)?.role ?? "foot") : 1; // (counters between troops: TROOP_ROLE.vs)
    // the rush lands: a blow on arrival, no wind-up
    if (tr.rushHit && dist <= reach + W.rushSlack && !m.broken) {
      tr.rushHit = false; tr.rushUntil = 0; m.lastAttack = now;
      const dmg = Math.round(st.dmg * R.dmgMult);
      if (tp) this.h.strikeHero(id, m.target, dmg, by); else this.h.strikeMob(id, m.target, vs === 1 ? dmg : Math.round(dmg * vs));
      return true;
    }
    if (tr.rushHit && now > tr.rushUntil + R.missGraceMs) tr.rushHit = false; // missed
    // a javelin at an enemy hero a few steps away
    if (tp && tr.role !== "rider" && !m.broken && !m.windUntil && !tr.rushHit && (tr.throwing || (now >= tr.nextThrow && dist >= J.min && dist <= J.max))) { // (a rider charges instead)
      if (!tr.throwing) { tr.throwing = true; tr.nextThrow = now + J.windupMs; m.winding = true; }
      m.moving = false;
      m.dir = Math.abs(t.x - m.x) > Math.abs(t.y - m.y) ? (t.x > m.x ? "right" : "left") : (t.y > m.y ? "down" : "up");
      if (now < tr.nextThrow) return true;
      tr.throwing = false; m.winding = false; tr.nextThrow = now + J.everyMs; m.lastAttack = now;
      this.h.shoot(id, tr.clan, t.x, t.y, Math.round(st.dmg * J.dmgMult), by);
      return true;
    }
    if (tr.role !== "rider" && !m.broken && !m.windUntil && now >= tr.nextRush && dist >= R.min && dist <= R.max) { tr.nextRush = now + R.everyMs; tr.rushUntil = now + R.ms; tr.rushHit = true; }
    if ((dist <= reach || m.windUntil) && !m.broken) {
      m.moving = false;
      m.dir = Math.abs(t.x - m.x) > Math.abs(t.y - m.y) ? (t.x > m.x ? "right" : "left") : (t.y > m.y ? "down" : "up");
      if (m.windUntil) {
        if (now >= m.windUntil) {
          m.windUntil = 0; m.winding = false; m.lastAttack = now;
          if (dist <= reach + W.swingSlack) {
            if (tp) this.h.strikeHero(id, m.target, st.dmg, by); else this.h.strikeMob(id, m.target, vs === 1 ? st.dmg : Math.round(st.dmg * vs));
          }
        }
      } else if (now - m.lastAttack >= st.cd) { m.windUntil = now + MOB_COMBAT.trooper.windupMs; m.winding = true; }
      return true;
    }
    if (tr.role === "pike") { const ox = m.x, oy = m.y; this.walk(m, t.x, t.y, dt, speed * (now < tr.rushUntil ? R.speedMult : 1)); pikeTether(m, ox, oy, g, now); return true; }
    this.walk(m, t.x, t.y, dt, speed * (now < tr.rushUntil ? R.speedMult : 1));
    return true;
  }

  /**
   * Is target t out of a courtyard archer's or a guard pike's reach (the give-up rule, TROOP_ROLE.giveUp)? The archer's:
   * beyond its wall bow, or (a monster or a trooper) with no clear shot; the pike's: beyond its blow, even if it is moving in.
   */
  private outOfReach(m: TroopMob, f: Fighter, g: FightGround, tm: TroopMob | undefined, t: { x: number; y: number }): boolean {
    const dist = Math.hypot(t.x - m.x, t.y - m.y);
    if (g.perch) return dist > bowRange(true).range || (!!tm && !shotClear(m.x, m.y, t.x, t.y));
    return f.role === "pike" && dist > MOB_ATTACK_RANGE + (tm ? mobBody(tm.kind as MobKind) : WAR_TROOPS.heroBody) + TROOP_ROLE.pike.reach + WAR_TROOPS.swingSlack;
  }

  /** One step toward (gx, gy) at `pace` px/s, never into the safe squares, the stockade or monster-free ground. */
  walk(m: TroopMob, gx: number, gy: number, dt: number, pace: number) {
    const to = fortDetour(m.x, m.y, gx, gy), dx = to.x - m.x, dy = to.y - m.y, d = Math.hypot(dx, dy); // round a Hold's walls, not into them
    const r = moveStep(m.x, m.y, dirInput(dx, dy), dt, Math.min(pace, d / Math.max(dt, 1e-3)));
    if (!offLimits(r.x, r.y)) { m.x = r.x; m.y = r.y; m.moving = r.moving; } else m.moving = false;
    m.homeX = m.x; m.homeY = m.y;
    m.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  }

  /** At its place: a guard looks out from the Hold, a marcher along the route. */
  private face(m: TroopMob, tr: Troop, now: number) {
    let fx: number, fy: number;
    if (tr.slot.role === "guard") { const g = this.guardPost(tr.t, tr.slot.i); fx = g?.fx ?? 0; fy = g?.fy ?? 1; }
    else { const p = patrolOf(tr.t)!, q = patrolPos(p, columnLead(p, now).d); fx = q.dx; fy = q.dy; }
    m.dir = Math.abs(fx) > Math.abs(fy) ? (fx > 0 ? "right" : "left") : (fy > 0 ? "down" : "up");
  }

  /** Is a living hero within r (px, square) of the trooper? */
  seen(m: TroopMob, r: number): boolean {
    for (const [, p] of this.h.heroes()) if (!p.dead && Math.abs(p.x - m.x) < r && Math.abs(p.y - m.y) < r) return true;
    return false;
  }

  /** Tests: the land state, read-only. */
  _land(t: number) { return this.lands.get(t); }
}
