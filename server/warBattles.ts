/**
 * Big battles in the room (W5; shared/war/battles.ts has the rules and the maths, server/war.ts the battles, their
 * pools and the clock). While a battle is fought and a living hero above ground is within BATTLE.wakeTiles of it, the
 * room fields both armies as real "trooper" mobs: two lines a side facing each other along the field's axis, up to
 * BATTLE.perSide each (its share of the pools: battleFielded), the first BATTLE.captains of each side named captains
 * with BATTLE.captainHp x the officer's HP. They fight within BATTLE.leashPx of their places (WarTroops.think / fight /
 * walk); every trooper gate holds (only heroes the clan fights hurt them, no XP or loot). Every death fills the pools'
 * quota (battleDeath); empty places fill again from the rear every BATTLE.reserveMs while the pools have men. Banners
 * change hands by the siege fronts' hysteresis (battleFront); a fallen captain slows its side (battleCaptain) and pays
 * its killer. At the end the active sworn heroes of both sides are paid (winners more), under the per-battle caps.
 * Battle troopers live in their own BATTLE.extraTroops slots on top of WAR_TROOPS.maxTroops, so the patrols, sieges and
 * columns keep theirs, and the room's cap is back to normal the moment the battle's men are gone.
 * TownRoom calls in at the same points as for the columns, through the narrow BattleHost below.
 */
import { TILE, type Dir } from "../shared/constants";
import { underground } from "../shared/dungeon";
import { blocked } from "../shared/movement";
import { CLANS, type ClanKey } from "../shared/war/clans";
import { BATTLE, battleBanners, battleField, battleGold, battleView, type Battle, type BattleMsg } from "../shared/war/battles";
import { captainName, hashStr, leaderLine, type WarMoment } from "../shared/war/heralds";
import { RENOWN_RANKS, rankOf } from "../shared/war/renown";
import { roadOffLimits } from "../shared/war/roads";
import { rallyRenown, WAR } from "../shared/war/rules";
import { SIEGE_BATTLE } from "../shared/war/siege";
import { STANDARD } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { troopLevel, troopStance, troopStats, troopWeapon, WAR_TROOPS } from "../shared/war/troops";
import { atWar } from "../shared/war/feuds";
import {
  addValor, battleCaptain, battleClanValor, battleClock, battleDeath, battleFielded, battleFront, battleGrant, battleNewsSince, battlesVersion, warBattles, warNow, warState,
} from "./war";
import type { Soldiers } from "./warCaravans";
import { newFighter, type FightGround, type Fighter, type TroopHero, type TroopMob } from "./warTroops";

export interface BattleHost {
  /** A plain trooper monster with this id, level and weapon at (x, y) (the same as the troops'). */
  spawn(id: string, level: number, x: number, y: number, weapon: string): TroopMob | undefined;
  remove(id: string): void;
  mob(id: string): TroopMob | undefined;
  heroes(): Iterable<[string, TroopHero]>;
  hero(id: string): TroopHero | undefined;
  broadcast(type: string, msg: unknown): void;
  /** A Herald line to one hero. */
  tell(heroId: string, text: string): void;
  ranked(heroId: string, rank: string): void;
  /** Gold into a hero's purse. */
  pay(heroId: string, gold: number): void;
}

/** One place in a side's lines: who stands there ("" empty), and the fighter state. */
interface Place { id: string; f: Fighter; captain: boolean }
/** The battle this room has live: its places per side, the axis and centre, the ground. */
interface Live { b: Battle; places: [Place[], Place[]]; ax: { x: number; y: number }; c: { x: number; y: number }; long: number; g: FightGround; lastSeen: number; nextReserve: number; nextScore: number }

const SIDES = [0, 1] as const;

export class WarBattles {
  private live: Live | undefined;
  /** Mob id -> its side and place. */
  private mobs = new Map<string, { side: 0 | 1; i: number }>();
  /** Per battle id: hero name -> ms active in the field; and the last place and move time per hero (the idle check). */
  private active = new Map<string, Map<string, number>>();
  private lastPos = new Map<string, { x: number; y: number; moved: number }>();
  private paid = new Set<string>();
  private sentVer = -1;
  private sentAt = 0;
  private newsAt = 0;
  private lastTick = 0;
  private seq = 0;

  constructor(private h: BattleHost, private soldiers: Soldiers) { this.newsAt = battleNewsSince(Infinity).at; } // (a new room hears only news from now on)

  /** Battle troopers alive now (in BATTLE.extraTroops slots of their own, on top of WAR_TROOPS.maxTroops). */
  get count(): number { return this.mobs.size; }
  /** Is this monster a soldier of the battle this room has live? */
  owns(id: string): boolean { return this.mobs.has(id); }
  /** Damage mult for a trooper's blow on another: battle soldier on battle soldier of the other side fights at BATTLE.troopDmg (the pools decide, the lines only show it). */
  dmgMult(fromId: string, toId: string): number {
    const a = this.mobs.get(fromId), b = this.mobs.get(toId);
    return a && b && a.side !== b.side ? BATTLE.troopDmg : 1;
  }

  /** Once a second: the battles' clock, news, the live battle waking, sleeping, filling, its banners, and the end's pay. */
  tick(now = Date.now()) {
    for (const [id, s] of this.mobs) { const m = this.h.mob(id); if (!m || m.dead) { this.mobs.delete(id); if (this.live) this.live.places[s.side][s.i].id = ""; } }
    const dt = Math.min(2000, Math.max(0, now - (this.lastTick || now)));
    this.lastTick = now;
    battleClock(now);
    if (!warNow()) { if (this.live) this.drop(); return; }
    this.news(now);
    const heroes: [string, TroopHero][] = [];
    for (const [hid, p] of this.h.heroes()) if (!p.dead && !underground(p.y)) heroes.push([hid, p]);
    for (const [hid, p] of heroes) { const q = this.lastPos.get(hid); if (!q || Math.hypot(q.x - p.x, q.y - p.y) > 4) this.lastPos.set(hid, { x: p.x, y: p.y, moved: now }); }
    for (const hid of this.lastPos.keys()) if (!this.h.hero(hid)) this.lastPos.delete(hid);
    const on = BATTLE.live && WAR_TROOPS.live;
    let want: Battle | undefined;
    for (const b of warBattles()) {
      if (!b.begun || now < b.start) continue;
      if (b.result) { this.pay(b); continue; }
      this.track(b, heroes, dt, now);
      if (!want && on && heroes.some(([, p]) => Math.hypot(p.x - b.x, p.y - b.y) <= BATTLE.wakeTiles * TILE)) want = b;
    }
    const l = this.live;
    if (l && (l.b.result || !warBattles().includes(l.b))) this.drop();
    else if (l && want === l.b) l.lastSeen = now;
    else if (l && now - l.lastSeen > SIEGE_BATTLE.sleepMs) this.drop();
    if (!this.live && want) this.wake(want, now);
    if (this.live) this.fill(this.live, now);
    this.send(now);
  }

  /** Battle news since this room last looked: Herald lines, the horn at the start, the end's sound. */
  private news(now: number) {
    const { news, at } = battleNewsSince(this.newsAt);
    this.newsAt = at;
    for (const n of news) {
      const b = n.b, land = TERRITORIES[b.t].name, A = CLANS[b.a].name, D = CLANS[b.b].name;
      const what = b.kind === "pitched" ? "A pitched battle" : b.kind === "storm" ? "The storming" : "A battle on the road";
      if (n.kind === "announce") {
        const mins = Math.max(0, Math.round((b.start - now) / 60_000));
        this.herald(b.kind === "storm" ? `${A} storm the walls of ${land}: the siege is fought out at the gate${mins ? ` in ${mins} min` : ""}!` : `${what} for ${land}: ${A} against ${D}${mins ? `, in ${mins} min` : ""}!`);
        this.say(b.a, "battle_called", b, b.b);
      } else if (n.kind === "start") {
        this.herald(`${what} for ${land} has begun: ${A} (${b.men0[0]} men) against ${D} (${b.men0[1]} men).`);
        this.h.broadcast("sfx", { ev: "battle_horn", id: b.id, x: Math.round(b.x), y: Math.round(b.y), a: b.a, b: b.b });
        this.say(b.a, "battle_start", b, b.b); this.say(b.b, "battle_start", b, b.a);
      } else if (n.kind === "end") {
        const won = b.result === "att" ? A : b.result === "def" ? D : "";
        this.herald(won ? `${won} won the battle for ${land}.` : `The battle for ${land} ends in a draw.`);
        this.h.broadcast("sfx", { ev: "battle_end", id: b.id, x: Math.round(b.x), y: Math.round(b.y), result: b.result });
        if (won) { const w = b.result === "att" ? b.a : b.b, l = b.result === "att" ? b.b : b.a; this.say(w, "battle_won", b, l); this.say(l, "battle_lost", b, w); }
      } else this.herald(`The battle for ${land} is called off.`);
    }
    // the reminder BATTLE.remindMs before a battle starts (once per battle per room)
    for (const b of warBattles()) if (!b.begun && b.start - now <= BATTLE.remindMs && b.start > now && !this.paid.has(`r${b.id}`)) {
      this.paid.add(`r${b.id}`);
      this.herald(`The battle for ${TERRITORIES[b.t].name} begins in ${Math.max(1, Math.round((b.start - now) / 60_000))} min.`);
    }
  }
  /** A clan leader speaks in the room's chat about a battle (called, start, banner, captain, won, lost), as in server/warMarches.ts. */
  private say(k: ClanKey, moment: WarMoment, b: Battle, foe: ClanKey, seed = 0) {
    const l = leaderLine(k, moment, TERRITORIES[b.t].name, foe, hashStr(b.id) + seed);
    this.h.broadcast("chat", { id: "", name: l.name, text: l.text });
  }
  private herald(text: string) { this.h.broadcast("chat", { id: "", name: "Herald", text }); }

  /** Time in the field per sworn hero of either side who moved in the last 15 s (the idle check). */
  private track(b: Battle, heroes: [string, TroopHero][], dt: number, now: number) {
    let m = this.active.get(b.id);
    for (const [hid, p] of heroes) {
      if ((p.clan !== b.a && p.clan !== b.b) || !this.inField(b, p.x, p.y) || now - (this.lastPos.get(hid)?.moved ?? -Infinity) > 15_000) continue;
      if (!m) this.active.set(b.id, (m = new Map()));
      m.set(p.name, (m.get(p.name) ?? 0) + dt);
    }
  }
  /** Is (x, y) on the battlefield (the pitched box and 4 tiles round it; for the others BATTLE.fieldLong / 2 + 4 tiles from the centre)? */
  private inField(b: Battle, x: number, y: number): boolean {
    const f = b.kind === "pitched" ? battleField(b.from, b.t) : undefined, m = 4;
    if (f) { const tx = x / TILE, ty = y / TILE; return tx >= f.tx - m && ty >= f.ty - m && tx < f.tx + f.w + m && ty < f.ty + f.h + m; }
    return Math.hypot(x - b.x, y - b.y) <= (BATTLE.fieldLong / 2 + m) * TILE;
  }

  /** The end: active sworn heroes of the winner and the loser are paid, once per battle (renown and valor under the caps). */
  private pay(b: Battle) {
    if (this.paid.has(b.id)) return;
    this.paid.add(b.id);
    if (this.paid.size > 64) this.paid.delete(this.paid.values().next().value!);
    const act = this.active.get(b.id);
    this.active.delete(b.id);
    if (!act || !b.result) return;
    const land = TERRITORIES[b.t].name, lvl = Math.round((TERRITORIES[b.t].levels[0] + TERRITORIES[b.t].levels[1]) / 2);
    for (const [hid, p] of this.h.heroes()) {
      if (!p.clan || (act.get(p.name) ?? 0) < BATTLE.activeMs || p.level < STANDARD.minLevel || (p.clan !== b.a && p.clan !== b.b)) continue;
      const side = p.clan === b.a ? "att" : "def", won = b.result === side, draw = b.result === "draw";
      const valor = won ? BATTLE.winValor : BATTLE.loseValor, renown = won ? BATTLE.winRenown : BATTLE.loseRenown;
      for (let left = battleClanValor(b.id, p.clan, valor); left > 0; left -= WAR.valorPerAdd) addValor(b.t, p.clan, Math.min(left, WAR.valorPerAdd));
      this.renown(hid, p, b, renown * rallyRenown(warState(), p.clan));
      const gold = won ? battleGold(lvl) : 0;
      if (gold) this.h.pay(hid, gold);
      this.h.tell(hid, draw ? `The battle for ${land} ends in a draw: you stood your ground.` : won ? `Victory at ${land}! +${gold} gold, and renown for the battle.` : `Defeat at ${land}; you fought on to the end, and that counts.`);
    }
  }
  private renown(hid: string, p: TroopHero, b: Battle, amount: number) {
    const add = battleGrant(b.id, p.name, "renown", amount);
    if (!add) return;
    const was = rankOf(p.renown);
    p.renown += add;
    const rank = rankOf(p.renown);
    if (rank > was) this.h.ranked(hid, RENOWN_RANKS[rank].name);
  }

  // ---- the lines ---------------------------------------------------------------------------------------------------

  private wake(b: Battle, now: number) {
    const f = b.kind === "pitched" ? battleField(b.from, b.t) : undefined;
    let ax = f ? { x: f.dx, y: f.dy } : { x: TERRITORIES[b.t].cx - TERRITORIES[b.from].cx, y: TERRITORIES[b.t].cy - TERRITORIES[b.from].cy };
    const n = Math.hypot(ax.x, ax.y) || 1; ax = { x: ax.x / n, y: ax.y / n };
    if (!f && !(n > 0)) ax = { x: 1, y: 0 };
    const c = { x: b.x, y: b.y }, long = (f ? Math.max(f.w, f.h) : BATTLE.fieldLong) * TILE;
    const l: Live = { b, places: [[], []], ax, c, long, lastSeen: now, nextReserve: 0, nextScore: now + BATTLE.scoreMs, g: { leash: () => false, hunt: () => false } };
    l.g = { leash: (x, y) => Math.hypot(x - c.x, y - c.y) <= long, hunt: () => false }; // (wild monsters only when they strike first)
    for (const side of SIDES) for (let i = 0; i < BATTLE.perSide; i++) l.places[side].push({ id: "", f: newFighter(side ? b.b : b.a, i < BATTLE.captains), captain: i < BATTLE.captains });
    this.live = l;
    this.fill(l, now, true);
  }

  /** Empty places fill from the rear while the pools have men for this room (every BATTLE.reserveMs; all at once on waking); extras go. */
  private fill(l: Live, now: number, first = false) {
    const have: [number, number] = [0, 0];
    for (const side of SIDES) have[side] = l.places[side].filter((p) => p.id).length;
    const may = battleFielded(l.b.id, this, have, now);
    for (const side of SIDES) { // fewer men left in the pools than this room fields (they fell elsewhere): the rearmost go
      let extra = have[side] - may[side];
      for (let i = l.places[side].length - 1; i >= 0 && extra > 0; i--) { const p = l.places[side][i]; if (p.id && !p.captain) { this.mobs.delete(p.id); this.h.remove(p.id); p.id = ""; extra--; } }
    }
    if (!first && now < l.nextReserve) return this.score(l, now);
    l.nextReserve = now + BATTLE.reserveMs;
    for (const side of SIDES) {
      let room = Math.min(may[side], BATTLE.perSide) - l.places[side].filter((p) => p.id).length;
      for (let i = 0; i < l.places[side].length && room > 0 && this.mobs.size < BATTLE.extraTroops; i++) {
        const p = l.places[side][i];
        if (p.id || (p.captain && l.b.captains[side] > i)) continue; // (a fallen captain does not come back)
        const at = first ? this.postOf(l, side, i) : this.rearOf(l, side, i), clan = side ? l.b.b : l.b.a;
        const id = `wb${++this.seq}`, level = troopLevel(l.b.t, p.captain), mob = this.h.spawn(id, level, at.x, at.y, troopWeapon(clan, p.captain));
        if (!mob) continue;
        mob.hp = mob.maxHp = troopStats(clan, level, p.captain).hp * (p.captain ? BATTLE.captainHp : 1);
        if (p.captain) mob.title = `${captainName(clan, l.b.id, side * BATTLE.captains + i)}, captain`;
        p.id = id; p.f = newFighter(clan, p.captain);
        this.mobs.set(id, { side, i });
        room--;
      }
    }
    battleFielded(l.b.id, this, [l.places[0].filter((p) => p.id).length, l.places[1].filter((p) => p.id).length], now); // (what it fields now, for the other rooms)
    this.score(l, now);
  }

  /** Every BATTLE.scoreMs: each banner's ring is counted (troopers + heroWeight x active sworn heroes a side) into its hysteresis. */
  private score(l: Live, now: number) {
    if (now < l.nextScore) return;
    l.nextScore = now + BATTLE.scoreMs;
    const pts = this.bannerPts(l), R = SIEGE_BATTLE.frontRadiusPx;
    pts.forEach((q, i) => {
      const n: [number, number] = [0, 0];
      for (const [id, s] of this.mobs) { const m = this.h.mob(id); if (m && !m.dead && Math.hypot(m.x - q.x, m.y - q.y) <= R) n[s.side]++; }
      for (const [hid, p] of this.h.heroes()) {
        if (p.dead || Math.hypot(p.x - q.x, p.y - q.y) > R || now - (this.lastPos.get(hid)?.moved ?? -Infinity) > 15_000) continue;
        if (p.clan === l.b.a && troopStance(l.b.b, p) === "enemy") n[0] += SIEGE_BATTLE.heroWeight;
        else if (p.clan === l.b.b && troopStance(l.b.a, p) === "enemy") n[1] += SIEGE_BATTLE.heroWeight;
      }
      const to = battleFront(l.b.id, i, n[0], n[1], now);
      if (to) this.h.broadcast("sfx", { ev: "battle_banner", id: l.b.id, i, x: Math.round(q.x), y: Math.round(q.y), clan: to === "atk" ? l.b.a : l.b.b });
      if (to) this.say(to === "atk" ? l.b.a : l.b.b, "battle_banner", l.b, to === "atk" ? l.b.b : l.b.a, i);
    });
  }
  private bannerPts(l: Live) {
    const f = l.b.kind === "pitched" ? battleField(l.b.from, l.b.t) : undefined;
    if (f) return battleBanners(f);
    const px = -l.ax.y, py = l.ax.x, half = (BATTLE.fieldLong / 2 - BATTLE.flankInset) * TILE;
    return [{ x: l.c.x - px * half, y: l.c.y - py * half }, { ...l.c }, { x: l.c.x + px * half, y: l.c.y + py * half }];
  }

  /** Place i of a side: two lines across the axis, the attackers on the near side, captains in the middle of the rear line. */
  private postOf(l: Live, side: 0 | 1, i: number): { x: number; y: number } {
    const per = Math.ceil(BATTLE.perSide / 2), sgn = side ? 1 : -1, px = -l.ax.y, py = l.ax.x;
    const line = i < BATTLE.captains ? 1 : Math.floor((i - BATTLE.captains) / per) % 2, k = i < BATTLE.captains ? (i ? 2 : -2) : ((i - BATTLE.captains) % per) - (per - 1) / 2;
    const gap = Math.min(l.long / per, 20), d = (BATTLE.lineGapTiles + line * 1.2) * TILE * sgn, along = i < BATTLE.captains ? k * TILE : k * gap;
    const x = l.c.x + l.ax.x * d + px * along, y = l.c.y + l.ax.y * d + py * along;
    if (!roadOffLimits(x, y) && !blocked(x, y)) return { x, y };
    const bx = l.c.x + l.ax.x * d, by = l.c.y + l.ax.y * d; // (a tree or a rock there: on the axis behind the line)
    return !roadOffLimits(bx, by) && !blocked(bx, by) ? { x: bx, y: by } : { ...l.c };
  }
  /** Where a reserve walks in from: 4 tiles behind its place. */
  private rearOf(l: Live, side: 0 | 1, i: number) {
    const p = this.postOf(l, side, i), sgn = side ? 1 : -1, x = p.x + l.ax.x * 4 * TILE * sgn, y = p.y + l.ax.y * 4 * TILE * sgn;
    return !roadOffLimits(x, y) && !blocked(x, y) ? { x, y } : p;
  }

  /** All its men go (the pools keep them); the battle goes on by the formula. */
  private drop() {
    const l = this.live;
    if (!l) return;
    for (const id of this.mobs.keys()) this.h.remove(id);
    this.mobs.clear();
    this.live = undefined;
  }

  /** A battle soldier's turn (TownRoom.updateMob, trooper branch): fight within the field, else keep its place in the line. */
  step(m: TroopMob, id: string, dt: number, now: number) {
    const s = this.mobs.get(id), l = this.live;
    if (!s || !l) { this.mobs.delete(id); this.h.remove(id); return; }
    const pl = l.places[s.side][s.i], f = pl.f;
    if (this.soldiers.think(m, id, f, l.g, now)) return;
    const post = this.postOf(l, s.side, s.i), face = dirOf(l.ax.x * (s.side ? -1 : 1), l.ax.y * (s.side ? -1 : 1));
    if (!f.near) { // nobody to see it: it keeps its place in the line (cheap)
      if (!roadOffLimits(post.x, post.y)) { m.x = m.homeX = post.x; m.y = m.homeY = post.y; }
      m.moving = false; m.windUntil = 0; m.winding = false; m.dir = face;
      return;
    }
    if (this.soldiers.fight(m, id, f, l.g, dt, now)) return;
    const d = Math.hypot(post.x - m.x, post.y - m.y);
    if (d > BATTLE.leashPx && !this.soldiers.seen(m, WAR_TROOPS.warpUnseenPx) && !roadOffLimits(post.x, post.y)) { m.x = post.x; m.y = post.y; m.moving = false; return; }
    if (d < 2) { m.moving = false; m.dir = face; return; }
    this.soldiers.walk(m, post.x, post.y, dt, this.soldiers.speedOf(m, f));
  }

  /** An enemy hero's blow on a battle soldier: it turns on them (the rest of the line holds). */
  hit(heroId: string, id: string) {
    const s = this.mobs.get(id), p = this.h.hero(heroId), l = this.live, m = this.h.mob(id);
    if (!s || !p || !l || !m || troopStance(s.side ? l.b.b : l.b.a, p) !== "enemy") return;
    m.target = heroId;
  }

  /** A hero left or died: no battle soldier keeps chasing them. */
  forget(heroId: string) {
    for (const id of this.mobs.keys()) { const m = this.h.mob(id); if (m && m.target === heroId) m.target = ""; }
    this.lastPos.delete(heroId);
  }

  /**
   * A battle soldier died (TownRoom.mobDied), whatever killed it: it fills its side's quota (battleDeath). `killerId`:
   * the hero (or a hero's creature's owner) who felled it: kill valor (WAR_TROOPS.killPts, under BATTLE.killValorCap a
   * battle instead of the war tick's cap) and as much renown; a captain pays BATTLE.captainValor more and slows its side.
   * True when it was a battle soldier (the room then pays no other kill valor for it).
   */
  killed(m: TroopMob, id: string, killerId: string | undefined, now = Date.now()): boolean {
    const s = this.mobs.get(id), l = this.live;
    if (!s || !l) return false;
    this.mobs.delete(id);
    const pl = l.places[s.side][s.i];
    pl.id = "";
    battleDeath(l.b.id, s.side, 1);
    const clan = s.side ? l.b.b : l.b.a, p = killerId ? this.h.hero(killerId) : undefined;
    if (pl.captain && battleCaptain(l.b.id, s.side, now)) {
      this.h.broadcast("sfx", { ev: "battle_officer", id: l.b.id, x: Math.round(m.x), y: Math.round(m.y), clan });
      this.herald(`${p ? p.name : "A blade"} cut down a captain of the ${CLANS[clan].name} at ${TERRITORIES[l.b.t].name}!`);
      this.say(clan, "battle_captain", l.b, clan === l.b.a ? l.b.b : l.b.a, l.b.captains[s.side]);
    }
    if (p && killerId && p.clan && !p.dead && p.level >= STANDARD.minLevel && p.clan !== clan && atWar(p.clan, clan) && troopStance(clan, p) === "enemy") {
      const pts = WAR_TROOPS.killPts[pl.captain ? "officer" : "soldier"] + (pl.captain ? BATTLE.captainValor : 0);
      const add = battleGrant(l.b.id, p.name, "kill", pts);
      // (valor in the battle's land: the war counts it for the holder or a clan that may attack there, a third clan's too)
      if (add > 0 && addValor(l.b.t, p.clan, add)) this.renown(killerId, p, l.b, add * rallyRenown(warState(), p.clan));
    }
    return true;
  }

  /** "battle" to every hero when the battles changed (at most every 2 s while one is fought). */
  private send(now: number, all = false) {
    const v = battlesVersion();
    if (!all && (v === this.sentVer || now - this.sentAt < 2000)) return;
    this.sentVer = v; this.sentAt = now;
    this.h.broadcast("battle", this.view(now));
  }
  /** War news (after every war tick): the battles to the room. */
  onWar() { this.send(Date.now(), true); }
  /** A hero joined: the battles. */
  join(client: { send(type: string, msg: unknown): void }, now = Date.now()) { client.send("battle", this.view(now)); }
  /** The "battle" message (shared/war/battles.ts BattleMsg). */
  view(now = Date.now()): BattleMsg { return { now, list: warBattles().map((b) => battleView(b, now)) }; }

  /** Tests: the live battle, read-only. */
  _live() { return this.live; }
}

const dirOf = (dx: number, dy: number): Dir => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
