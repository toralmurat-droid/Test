/**
 * Feuds on the server (shared/war/feuds.ts has the rules and numbers): provocations, kill points and Wanted tiers,
 * the bounty on a Wanted hero, and the manhunters a clan sends after a Hunted one. Each hero's feuds live in a plain
 * (unsynced) Player field, saved with the hero (HeroSave.feud). The hero's own client gets a "feud" message whenever
 * its feuds change; every client gets the Wanted marks of the heroes in the room by a diff message ("wanted", like
 * server/warOaths.ts). Manhunters are troopers (kind "trooper", clan in Mob.weapon) that borrow the patrol soldiers'
 * moves (WarTroops.think / fight / walk, like the caravan escorts) and count inside WAR_TROOPS.maxTroops.
 * TownRoom calls in through the narrow FeudHost below.
 */
import { TILE } from "../shared/constants";
import { MAX_LEVEL } from "../shared/classes";
import { underground } from "../shared/dungeon";
import { isSafeZone } from "../shared/map";
import { noMobsAt } from "../shared/spawns";
import { inVillage } from "../shared/wrath";
import { CLANS, CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import {
  addGrudge, addKill, decayFeud, FEUD, killPoints, feudView, grudgeActive, marksOf, settleFeud, utcDay, WANTED_TIERS, wantedTier,
  type FeudState, type WantedMsg,
} from "../shared/war/feuds";
import { feudLine } from "../shared/war/heralds";
import { patrolOf } from "../shared/war/patrols";
import { RENOWN_RANKS, rankOf } from "../shared/war/renown";
import { rallyRenown } from "../shared/war/rules";
import { HOLDS, STANDARD } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { parseTroop, TROOP_SHORT, troopStance, troopStats, troopWeapon, type TroopPart } from "../shared/war/troops";
import { territoryAt } from "../shared/war/view";
import { addValor, warNow, warState } from "./war";
import { newFighter, type FightGround, type Fighter, type TroopHero, type TroopMob, type WarTroops } from "./warTroops";

/** A hero as the feuds read and change it (TownRoom's Player). */
export interface FeudHero extends TroopHero { feud: FeudState }

export interface FeudHost {
  heroes(): Iterable<[string, FeudHero]>;
  hero(id: string): FeudHero | undefined;
  /** The hero and the members of their party in this room (session ids, the hero first). */
  group(id: string): string[];
  mob(id: string): TroopMob | undefined;
  /** A plain trooper monster (the troops' spawn), and gone without a death. */
  spawn(id: string, level: number, x: number, y: number, weapon: string): TroopMob | undefined;
  remove(id: string): void;
  send(id: string, type: string, msg: unknown): void;
  broadcast(type: string, msg: unknown): void;
  /** Troopers the manhunters may still field (WAR_TROOPS.maxTroops less everyone else ahead of the patrols). */
  budget(): number;
  /** A hero reached a new renown rank (a bounty). */
  ranked(heroId: string, rank: string): void;
}
/** The soldier's moves the manhunters borrow from the troops. */
export type Soldiers = Pick<WarTroops, "think" | "fight" | "walk" | "speedOf">;

interface Squad { quarry: string; name: string; clan: ClanKey; ids: string[]; until: number }
interface Hunter extends Fighter { squad: Squad; i: number; g: FightGround }

const offLimits = (x: number, y: number) => isSafeZone(x, y) || inVillage(x, y) || noMobsAt(x, y);
const near = (a: { x: number; y: number }, b: { x: number; y: number }, tiles: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tiles * TILE;

export class WarFeuds {
  private squads: Squad[] = [];
  private hunters = new Map<string, Hunter>();
  /** Hero name -> when they may be hunted again (FEUD.hunt.cooldownMs after a squad ends). */
  private rest = new Map<string, number>();
  /** What each hero's own client was last told, and what every client knows of the marks. */
  private told = new Map<string, string>();
  private marks = new Map<string, string>();
  private seq = 0;

  constructor(private h: FeudHost, private soldiers: Soldiers) {}

  /** Manhunters alive now (they count against WAR_TROOPS.maxTroops). */
  get count(): number { return this.hunters.size; }
  owns(id: string): boolean { return this.hunters.has(id); }

  /**
   * The "provoke" message: the hero strikes at a clan that leaves them alone, on purpose (so no stray blow ever starts a
   * fight). `{id}`: one of its troopers, `{hold}`: a territory whose Hold it holds. Returns "" or why not.
   */
  provoke(heroId: string, msg: unknown, now = Date.now()): string {
    const p = this.h.hero(heroId), m = msg && typeof msg === "object" ? (msg as { id?: unknown; hold?: unknown }) : undefined;
    if (!p || p.dead || !m) return "";
    if (p.level < STANDARD.minLevel) return `Only heroes of level ${STANDARD.minLevel} and above take part in the clan war.`;
    if (isSafeZone(p.x, p.y) || inVillage(p.x, p.y)) return "Not here: blood is never spilled on safe ground.";
    let clan: ClanKey | undefined, at: { x: number; y: number } | undefined;
    if (typeof m.id === "string" && m.id.length <= 32) {
      const o = this.h.mob(m.id), tr = o && !o.dead && o.kind === "trooper" ? parseTroop(o.weapon) : undefined;
      if (tr && o) { clan = tr.clan; at = o; }
    } else if (Number.isInteger(m.hold)) {
      const hold = HOLDS.find((x) => x.t === m.hold), owner = warNow()?.owner[m.hold as number];
      if (hold && owner !== undefined && CLAN_KEYS[owner]) { clan = CLAN_KEYS[owner]; at = hold; }
    }
    if (!clan || !at) return "There is nothing of a clan's there to strike at.";
    if (!near(p, at, FEUD.provokeTiles)) return "Too far: get closer to strike at them.";
    const st = troopStance(clan, p, now);
    if (st === "ally") return "They are your own clan.";
    if (st === "enemy") return "";
    this.grudge(heroId, clan, now);
    for (const id of this.h.group(heroId)) {
      this.push(id, now);
      this.h.send(id, "chat", { id: "", name: "Herald", text: id === heroId ? `You strike at ${CLANS[clan].name}: their soldiers will fight you for ${Math.round(FEUD.grudgeMs / 60_000)} min.` : `${p.name} struck at ${CLANS[clan].name}: their soldiers will fight your party for ${Math.round(FEUD.grudgeMs / 60_000)} min.` });
    }
    return "";
  }

  /** A grudge with `clan` for the hero and the members of their party here (never one sworn to that clan). */
  private grudge(heroId: string, clan: ClanKey, now: number) {
    for (const id of this.h.group(heroId)) {
      const q = this.h.hero(id);
      if (q && q.clan !== clan && q.level >= STANDARD.minLevel) addGrudge(q.feud, clan, now + FEUD.grudgeMs);
    }
  }

  /** A hero's blow landed on a trooper of `clan` (only one they may hurt): a running grudge with it starts over. */
  struck(heroId: string, clan: ClanKey, now = Date.now()) {
    const p = this.h.hero(heroId), e = p?.feud[clan];
    if (!p || !e || (e.until ?? 0) <= now || (e.until ?? 0) - now > FEUD.grudgeMs - 1000) return; // (at most once a second)
    this.grudge(heroId, clan, now);
  }

  /**
   * Someone of clan `clan` fell to hero `heroId`: a trooper (its part) or a hero sworn to it. Kill points, a grudge, and
   * the clan's word when the hero rises a tier.
   */
  onKill(heroId: string, clan: ClanKey, part: TroopPart | "hero", now = Date.now()) {
    const p = this.h.hero(heroId);
    if (!p || p.clan === clan || p.level < STANDARD.minLevel) return;
    const r = addKill(p.feud, clan, killPoints(part, p.clan, clan), now); // (a third for a clan at war with theirs: FEUD.warKillWeight)
    this.grudge(heroId, clan, now);
    if (r.tier > r.was) this.rose(heroId, p, clan, r.tier);
    this.push(heroId, now);
  }

  /** The hero rose to Wanted / Hunted / Marked with `clan`: they hear it, and so does the room from Hunted on. */
  private rose(heroId: string, p: FeudHero, clan: ClanKey, tier: number) {
    const line = feudLine(clan, tier >= 3 ? "marked" : tier === 2 ? "hunted" : "wanted", p.name, p.name.length + tier);
    this.h.send(heroId, "chat", { id: "", name: "Herald", text: `You are ${WANTED_TIERS[tier]} by ${CLANS[clan].name}.${tier >= 2 ? " They will send manhunters after you." : ""}` });
    if (tier >= 2) this.h.broadcast("chat", { id: "", name: line.name, text: line.text });
    else this.h.send(heroId, "chat", { id: "", name: line.name, text: line.text });
    this.h.broadcast("sfx", { ev: "wanted_up", id: heroId, x: Math.round(p.x), y: Math.round(p.y), tier, clan });
  }

  /**
   * A hero died. `killer`: the hero who struck the last blow, or `clan`: the trooper's clan (or a javelin's). A hero sworn
   * to a clan who killed one of its enemies earns kill points; death at a clan's hands settles that clan's account, and
   * a sworn killer of a Wanted hero claims the bounty (once per target per UTC day).
   */
  onHeroDeath(victimId: string, killer: { hero?: string; clan?: ClanKey }, now = Date.now()) {
    const v = this.h.hero(victimId);
    if (!v) return;
    const k = killer.hero ? this.h.hero(killer.hero) : undefined;
    if (k && killer.hero !== victimId && v.clan) this.onKill(killer.hero!, v.clan, "hero", now);
    const clan = k ? k.clan : killer.clan;
    if (!clan || !v.feud[clan]) return;
    decayFeud(v.feud, now);
    const tier = wantedTier(v.feud, clan, now), e = v.feud[clan];
    if (k && k.clan === clan && tier >= 1 && e && e.paid !== utcDay(now)) {
      e.paid = utcDay(now);
      const was = rankOf(k.renown);
      k.renown += FEUD.bounty.renown * rallyRenown(warState(), clan);
      const t = territoryAt(Math.floor(v.x / TILE), Math.floor(v.y / TILE));
      if (t) addValor(t.id, clan, FEUD.bounty.valor);
      const rank = rankOf(k.renown);
      if (rank > was) this.h.ranked(killer.hero!, RENOWN_RANKS[rank].name);
      const line = feudLine(clan, "bounty", v.name, v.name.length);
      this.h.broadcast("chat", { id: "", name: line.name, text: line.text });
      this.h.send(killer.hero!, "chat", { id: "", name: "Herald", text: `Bounty claimed on ${v.name}: +${FEUD.bounty.renown} renown for you, +${FEUD.bounty.valor} valor for ${CLANS[clan].name}.` });
      this.h.broadcast("sfx", { ev: "bounty_claimed", id: killer.hero, x: Math.round(v.x), y: Math.round(v.y), clan });
    }
    const had = tier >= 1 || grudgeActive(v.feud, clan, now);
    settleFeud(v.feud, clan);
    if (had) this.h.send(victimId, "chat", { id: "", name: "Herald", text: `Your blood paid your debt to ${CLANS[clan].name}: they no longer hunt you.` });
    for (const s of this.squads) if (s.quarry === victimId && s.clan === clan) s.until = 0; // the manhunters go home
    this.push(victimId, now);
  }

  /** The hero's own client: their feuds now (and why a provocation failed). */
  push(id: string, now = Date.now(), err = "") {
    const p = this.h.hero(id);
    if (!p) return;
    const v = feudView(p.feud, now);
    this.told.set(id, this.sig(v.c));
    this.h.send(id, "feud", err ? { ...v, err } : v);
  }
  /** What the client shows, coarsely (points, and the grudge to 5 s): a change worth a new message. */
  private sig(c: ReturnType<typeof feudView>["c"]): string {
    return CLAN_KEYS.map((k) => { const e = c[k]; return e ? `${e.p}:${Math.ceil(e.g / 5000)}` : ""; }).join("|");
  }

  /** All the marks, for a client that just joined. */
  full(now = Date.now()): WantedMsg {
    const w: WantedMsg["w"] = {};
    for (const [id, p] of this.h.heroes()) { const m = marksOf(p.feud, now); if (m.length) w[id] = m; }
    return { full: true, w };
  }

  /** A hero joined: their feuds to their client, everyone's marks to them. */
  join(id: string, now = Date.now()) {
    this.push(id, now);
    this.h.send(id, "wanted", this.full(now));
  }

  /** A hero left (after the player is removed): their mark goes for everyone, their manhunters go home. */
  leave(id: string) {
    this.told.delete(id);
    if (this.marks.delete(id)) this.h.broadcast("wanted", { w: {}, gone: [id] });
    for (const s of this.squads) if (s.quarry === id) s.until = 0;
  }

  /** Once a second: decay, the owner's view and the marks when they changed, the manhunters out and home. */
  tick(now = Date.now()) {
    const w: WantedMsg["w"] = {}, seen = new Set<string>(), gone: string[] = [];
    let n = 0;
    for (const [id, p] of this.h.heroes()) {
      decayFeud(p.feud, now);
      const v = feudView(p.feud, now), s = this.sig(v.c);
      if (this.told.get(id) !== s) { this.told.set(id, s); this.h.send(id, "feud", v); }
      const m = marksOf(p.feud, now);
      if (!m.length) continue;
      seen.add(id);
      const ms = m.map((x) => x.join(":")).join(",");
      if (this.marks.get(id) !== ms) { this.marks.set(id, ms); w[id] = m; n++; }
    }
    for (const id of this.marks.keys()) if (!seen.has(id)) { this.marks.delete(id); gone.push(id); }
    if (n || gone.length) this.h.broadcast("wanted", gone.length ? { w, gone } : { w });
    this.hunt(now);
  }

  // ---- manhunters ---------------------------------------------------------------------------------------------

  private hunt(now: number) {
    for (const [id] of this.hunters) { const m = this.h.mob(id); if (!m || m.dead) this.hunters.delete(id); }
    for (const s of this.squads) {
      s.ids = s.ids.filter((id) => this.hunters.has(id));
      const q = this.h.hero(s.quarry);
      const lost = !q || q.dead || underground(q.y) || wantedTier(q.feud, s.clan, now) < 2 || now >= s.until
        || !s.ids.some((id) => { const m = this.h.mob(id); return !!m && near(m, q, FEUD.hunt.loseTiles); });
      if (!lost && s.ids.length) continue;
      for (const id of s.ids) { this.hunters.delete(id); this.h.remove(id); }
      s.ids = [];
      this.rest.set(s.name, now + FEUD.hunt.cooldownMs);
      if (q && !q.dead && lost && s.until > 0) this.h.send(s.quarry, "chat", { id: "", name: "Herald", text: `The ${TROOP_SHORT[s.clan]} manhunters lost your trail.` });
    }
    this.squads = this.squads.filter((s) => s.ids.length);
    for (const [k, t] of this.rest) if (t <= now) this.rest.delete(k);
    if (this.squads.length >= FEUD.hunt.perRoom) return;
    const v = warNow();
    if (!v) return;
    for (const [id, p] of this.h.heroes()) {
      if (this.squads.length >= FEUD.hunt.perRoom) return;
      if (p.dead || underground(p.y) || offLimits(p.x, p.y) || this.rest.has(p.name) || this.squads.some((s) => s.quarry === id)) continue;
      let clan: ClanKey | undefined, tier = 0;
      for (const k of CLAN_KEYS) { const t = wantedTier(p.feud, k, now); if (t >= 2 && t > tier && k !== p.clan) { clan = k; tier = t; } }
      if (clan) this.sendSquad(id, p, clan, tier, v.owner, now);
    }
  }

  /** A squad of `clan` after hero `id` from its nearest Hold within FEUD.hunt.fromTiles (none in reach: none comes). */
  private sendSquad(id: string, p: FeudHero, clan: ClanKey, tier: number, owner: readonly number[], now: number) {
    const H = FEUD.hunt, ci = CLAN_KEYS.indexOf(clan);
    let from: { x: number; y: number } | undefined, t = -1, best = Infinity;
    for (const hold of HOLDS) {
      if (owner[hold.t] !== ci) continue;
      const gate = patrolOf(hold.t)?.pts[0], d = gate ? Math.hypot(gate.x - p.x, gate.y - p.y) : Infinity;
      if (gate && d <= H.fromTiles * TILE && d < best) { best = d; from = gate; t = hold.t; }
    }
    if (!from) return;
    const n = Math.min(1 + H.soldiers[tier], this.h.budget());
    if (n < 2) return;
    const s: Squad = { quarry: id, name: p.name, clan, ids: [], until: now + H.lifeMs };
    const level = Math.max(1, Math.min(MAX_LEVEL, p.level + H.levelUp[tier]));
    for (let i = 0; i < n; i++) {
      const hid = `wh${++this.seq}`, officer = i === 0, x = from.x + ((i % 3) - 1) * 14, y = from.y + Math.floor(i / 3) * 14;
      const m = this.h.spawn(hid, level, x, y, troopWeapon(clan, officer));
      if (!m) continue;
      m.hp = m.maxHp = troopStats(clan, level, officer).hp;
      m.title = `${TROOP_SHORT[clan]} manhunter${officer ? " captain" : ""}`;
      const g: FightGround = { leash: (x2, y2) => { const q = this.h.hero(s.quarry); return !!q && Math.hypot(q.x - x2, q.y - y2) <= H.leashTiles * TILE; }, hunt: () => false };
      this.hunters.set(hid, { ...newFighter(clan, officer), squad: s, i, g });
      s.ids.push(hid);
    }
    if (!s.ids.length) return;
    this.squads.push(s);
    this.h.broadcast("chat", { id: "", name: "Herald", text: `${TROOP_SHORT[clan]} manhunters march out of ${TERRITORIES[t]?.name ?? "their Hold"} after ${p.name}.` });
    this.h.send(id, "chat", { id: "", name: "Herald", text: `${CLANS[clan].name} send manhunters after you from ${TERRITORIES[t]?.name ?? "their Hold"}. Fight them, flee to safe ground, or die to them to settle the debt.` });
  }

  /** A manhunter's turn (TownRoom.updateMob): fight what it picked, else close in on the quarry in a loose pack. */
  step(m: TroopMob, id: string, dt: number, now: number) {
    const hu = this.hunters.get(id);
    if (!hu) { this.h.remove(id); return; }
    if (this.soldiers.think(m, id, hu, hu.g, now)) return;
    if (this.soldiers.fight(m, id, hu, hu.g, dt, now)) return;
    const q = this.h.hero(hu.squad.quarry);
    if (!q || q.dead) { m.moving = false; return; }
    const a = (hu.i / Math.max(1, hu.squad.ids.length)) * Math.PI * 2, gx = q.x + Math.cos(a) * 20, gy = q.y + Math.sin(a) * 20;
    if (Math.hypot(gx - m.x, gy - m.y) < 4 || offLimits(gx, gy)) { m.moving = false; return; } // (they wait at the edge of safe ground)
    this.soldiers.walk(m, gx, gy, dt, this.soldiers.speedOf(m, hu));
  }

  /** A manhunter fell: its place in the squad is gone (no loot, no XP: it is a trooper). */
  killed(id: string): boolean { return this.hunters.delete(id); }

  /** A hero left or died: no manhunter keeps fighting them (the squad goes home in the next tick). */
  forget(heroId: string) {
    for (const id of this.hunters.keys()) { const m = this.h.mob(id); if (m && m.target === heroId) m.target = ""; }
  }

  /** Tests: the squads, read-only. */
  get _squads(): readonly Squad[] { return this.squads; }
}
