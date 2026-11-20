/**
 * Sacking Holds (W2b; shared/war/holdSack.ts has the rules, spots and numbers). A hero the holder's soldiers fight walks
 * into a Hold's courtyard and asks to raise their banner ("sack" message, at the banner spot): allowed only while no
 * holder guard and no active holder-sworn hero stands within the Hold's reach and the land has no announced siege. The
 * raise takes HOLD_SACK.raiseMs; a holder trooper or defender in the reach pauses it, a blow on the raiser starts it over.
 * Done, the war hears of it (server/war.ts strikeHold: Control, maybe a siege, the Herald and the holder's leader), the
 * sacker's clan earns valor where the war lets it fight, its sworn heroes in the reach renown, a war chest drops, the
 * Hold's guards stay down until the next war tick and the sacker's banner flies on it (cosmetic, "holds" message).
 * One sack per land per war tick for every room of the process (memory, like the caravans' outcomes), and across servers
 * through the war's log (server/war.ts warSacked: a follower's sack is queued for the war's owner, Ages). On a follower
 * the banner goes up and the guards go home at once, but the rewards wait for the owner (server/war.ts sackAct): the
 * clan's valor and Reckoning credit travel with the act, the war chest and the renown are given here once the owner
 * applied it (warActFate "ok"); a sack the owner drops (a war tick passed, another server's sack came first) pays nothing.
 * TownRoom calls in through the narrow HoldSackHost below.
 */
import { TILE } from "../shared/constants";
import { underground } from "../shared/dungeon";
import { isSafeZone } from "../shared/map";
import { inVillage } from "../shared/wrath";
import { CLANS, CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { bannerSpot, HOLD_SACK, inSackReach, sackGold, sackReachPx, sackStep, type HoldsMsg, type SackRaise } from "../shared/war/holdSack";
import { RENOWN_RANKS, rankOf } from "../shared/war/renown";
import { rallyRenown, targetsOf } from "../shared/war/rules";
import { atWar } from "../shared/war/feuds";
import { STANDARD } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { parseTroop, troopLevel, troopStance } from "../shared/war/troops";
import { ACT_FATE_MS, addValor, holdClaim, sackAct, strikeHold, warActFate, warFallen, warNow, warRole, warSacked, warState } from "./war";
import { HOLD_FALL } from "../shared/war/holdFall";
import { boonRenown, crownCredit, keyOf } from "./warCrown";
import type { SiegeHero } from "./warSieges";
import type { TroopMob } from "./warTroops";

/** A hero as a sack reads it (TownRoom's Player): `lastHurt` is when they last took a blow. */
export interface HoldHero extends SiegeHero { lastHurt: number }

export interface HoldSackHost {
  heroes(): Iterable<[string, HoldHero]>;
  hero(id: string): HoldHero | undefined;
  mobsInBox(x: number, y: number, r: number): Iterable<[string, TroopMob]>;
  send(id: string, type: string, msg: unknown): void;
  broadcast(type: string, msg: unknown): void;
  dropGold(x: number, y: number, amount: number): void;
  /** Living guards of the land's Hold where `near` (server/warTroops.ts guardsAlive), and keeping them down (holdGuardsOff). */
  guardsAlive(t: number, near: (x: number, y: number) => boolean): number;
  /** Guards the land's Hold should field minus those felled this war tick, budget or not (warTroops guardsDue). */
  guardsDue(t: number): number;
  guardsOff(t: number, untilTick: number): void;
  ranked?(heroId: string, rank: string): void;
}

/** What the raiser's own client hears ("sack"): the banner's progress and state, or why not (t -1). */
export interface SackMsg { t: number; progress?: number; state?: "raise" | "paused" | "done" | "stop"; err?: string }

/** For every room of this process: the land sacked in each war tick, by whom (CLAN_KEYS index, -1 unsworn). */
const sacks = new Map<number, { tick: number; by: number }>();
/** Tests: forget every sack. */
export function _resetHolds() { sacks.clear(); }

/** `claim`: a banner over a fallen Hold's ruin (shared/war/holdFall.ts): it claims the land for the raiser's clan. */
interface Raise extends SackRaise { hero: string; t: number; lastStep: number; hurtAt: number; claim?: ClanKey }
/** A follower's sack waiting for the war's owner (Ages): who gets what once it counts. */
interface Waiting { act: string; id: string; t: number; clan?: ClanKey; holder: ClanKey; valor: number; heroes: string[]; gold: number; at: number }

const the = (name: string) => name.replace(/^The /, "the ");

export class WarHolds {
  /** Banners being raised in this room, by hero session id. */
  private raises = new Map<string, Raise>();
  /** Lands whose guards this room already sent home for a sack (key "tick:t"). */
  private off = new Set<string>();
  private told = ""; private toldAt = 0;
  /** Ages: this room's sacks queued for the war's owner, paid when it applies them (settle). */
  private waiting: Waiting[] = [];

  constructor(private h: HoldSackHost) {}

  /** Banners being raised now (tests). */
  get count(): number { return this.raises.size; }

  /** The clients' view: the Holds sacked this war tick and the banners going up here. */
  view(): HoldsMsg {
    const tick = warNow()?.tick ?? -1, sacked: [number, number][] = [];
    for (const [t, s] of sacks) if (s.tick === tick) sacked.push([t, s.by]);
    const raising: [number, number, number][] = [...this.raises.values()].map((r) => [r.t, Math.floor(r.progress * 100), r.paused ? 1 : 0]);
    return { tick, sacked: sacked.sort((a, b) => a[0] - b[0]), raising };
  }

  /** Why hero `id` may not raise a banner at land t's Hold now ("" when they may). */
  why(id: string, t: number, now = Date.now()): string {
    const p = this.h.hero(id), v = warNow(), at = bannerSpot(t);
    if (!HOLD_SACK.live || !p || p.dead || !v || !at || !TERRITORIES[t]) return "There is no banner to raise here.";
    if (p.level < STANDARD.minLevel) return `Only heroes of level ${STANDARD.minLevel} and above take part in the clan war.`;
    if (TERRITORIES[t].reckoningOnly) return `${TERRITORIES[t].name} is not won by sacking: it changes hands only at a Reckoning.`;
    if (underground(p.y) || Math.hypot(p.x - at.x, p.y - at.y) > HOLD_SACK.useTiles * TILE) return "Stand at the banner in the middle of the Hold.";
    if (isSafeZone(p.x, p.y) || inVillage(p.x, p.y)) return "Not here: blood is never spilled on safe ground.";
    if (warFallen(t)) return this.whyClaim(id, p, t, now);
    const holder = CLAN_KEYS[v.owner[t]];
    if (!holder) return "Nobody holds this Hold.";
    const st = troopStance(holder, p, now);
    if (st === "ally") return "This is your own clan's Hold.";
    if (st !== "enemy") return `${CLANS[holder].name} are not your enemies: provoke them first (Ctrl+click), or swear to a clan at war with them.`;
    if (v.sieges.some((s) => s[0] === t)) return "A siege is announced here: fight for it at the fronts.";
    if (sacks.get(t)?.tick === v.tick || warSacked(t)) return "This Hold was sacked already: its new banner flies until the next war tick.";
    for (const [oid, r] of this.raises) if (r.t === t && oid !== id) return "Another hero is raising a banner here.";
    if (this.h.guardsAlive(t, (x, y) => inSackReach(t, x, y)) > 0 || this.h.guardsDue(t) > 0) return "Its guards still stand: cut them down first.";
    if (this.defenders(t, holder, now, false) > 0) return `A hero sworn to ${CLANS[holder].name} stands watch here.`;
    return "";
  }

  /** Why hero `id` may not claim fallen land t's ruin now ("" when they may): a sworn hero, nobody else raising, no hero of another clan watching. */
  private whyClaim(id: string, p: HoldHero, t: number, now: number): string {
    if (!p.clan) return "This Hold has fallen. Only a hero sworn to a clan can claim it: swear an oath first.";
    for (const [oid, r] of this.raises) if (r.t === t && oid !== id) return "Another hero is raising a banner here.";
    if (this.rivals(t, p.clan, now) > 0) return "Heroes of another clan contest this ruin: drive them off first.";
    return "";
  }

  /** Active heroes of oath level sworn to a clan other than `clan` within fallen land t's reach (they contest a claim). */
  private rivals(t: number, clan: ClanKey, now: number): number {
    let n = 0;
    for (const [, o] of this.h.heroes()) if (!o.dead && o.clan && o.clan !== clan && o.level >= STANDARD.minLevel && now - o.lastAct <= STANDARD.idleMs && !underground(o.y) && inSackReach(t, o.x, o.y)) n++;
    return n;
  }

  /**
   * Active holder-sworn heroes of oath level within land t's reach, and (with `troops`) the holder's fighting troopers
   * there too: what keeps a banner from going up.
   */
  private defenders(t: number, holder: ClanKey, now: number, troops: boolean): number {
    let n = 0;
    for (const [, p] of this.h.heroes()) {
      if (p.dead || p.clan !== holder || p.level < STANDARD.minLevel || now - p.lastAct > STANDARD.idleMs || underground(p.y) || !inSackReach(t, p.x, p.y)) continue;
      n++;
    }
    if (!troops) return n;
    const at = bannerSpot(t)!;
    for (const [, o] of this.h.mobsInBox(at.x, at.y, sackReachPx(t) + TILE)) {
      if (o.dead || o.kind !== "trooper" || !inSackReach(t, o.x, o.y)) continue;
      const k = parseTroop(o.weapon);
      if (k && !k.object && k.clan === holder) n++;
    }
    return n;
  }

  /** The "sack" message `{t}` (a territory id): the hero starts raising their banner there. Returns "" or why not. */
  sack(id: string, msg: unknown, now = Date.now()): string {
    const raw = msg && typeof msg === "object" ? (msg as { t?: unknown }).t : undefined;
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw >= TERRITORIES.length) return "There is no banner to raise here.";
    const t = raw, err = this.why(id, t, now);
    if (err) return err;
    const p = this.h.hero(id)!;
    if (this.raises.get(id)?.t === t) return ""; // (already raising here)
    this.raises.set(id, { hero: id, t, progress: 0, paused: false, lastStep: now, hurtAt: p.lastHurt, ...(warFallen(t) && p.clan ? { claim: p.clan } : {}) });
    this.h.send(id, "sack", { t, progress: 0, state: "raise" } satisfies SackMsg);
    this.tell(now, true);
    return "";
  }

  /** The hero stops raising (they asked, left, fell or walked off): their client hears why, when there is a why. */
  private stop(id: string, why = "") {
    const r = this.raises.get(id);
    if (!r) return;
    this.raises.delete(id);
    this.h.send(id, "sack", { t: r.t, state: "stop", ...(why ? { err: why } : {}) } satisfies SackMsg);
  }

  /** A hero left or died: their banner stops. */
  forget(id: string) { if (this.raises.delete(id)) this.tell(Date.now(), true); }

  /** Once a second (before the patrols): sacks of other rooms send this room's guards home, every banner moves on. */
  tick(now = Date.now()) {
    const v = warNow(), tick = v?.tick ?? -1;
    for (const [t, s] of sacks) if (s.tick !== tick) sacks.delete(t);
    for (const k of this.off) if (!k.startsWith(`${tick}:`)) this.off.delete(k);
    for (const [t, s] of sacks) if (!this.off.has(`${tick}:${t}`)) { this.off.add(`${tick}:${t}`); this.h.guardsOff(t, s.tick + 1); }
    for (const [id, r] of this.raises) {
      const p = this.h.hero(id), at = bannerSpot(r.t), holder = v ? CLAN_KEYS[v.owner[r.t]] : undefined;
      if (!p || p.dead) { this.raises.delete(id); continue; }
      if (r.claim) { this.claimStep(id, p, r, now); continue; }
      if (!v || !holder || !at || underground(p.y) || Math.hypot(p.x - at.x, p.y - at.y) > HOLD_SACK.useTiles * TILE * 1.5) { this.stop(id, "You left the banner."); continue; }
      if (troopStance(holder, p, now) !== "enemy") { this.stop(id, `${CLANS[holder].name} are not your enemies any more.`); continue; }
      if (v.sieges.some((s) => s[0] === r.t)) { this.stop(id, "A siege is announced here: fight for it at the fronts."); continue; }
      if (sacks.get(r.t)?.tick === tick || warSacked(r.t)) { this.stop(id, "This Hold was sacked already."); continue; }
      const hurt = p.lastHurt > r.hurtAt;
      r.hurtAt = p.lastHurt;
      const dt = now - r.lastStep, was = r.paused;
      r.lastStep = now;
      const step = sackStep(r, dt, this.defenders(r.t, holder, now, true), hurt);
      if (step === "done") this.done(id, p, r, holder, tick, now);
      else if (step !== "raise" || r.paused !== was) this.h.send(id, "sack", { t: r.t, progress: r.progress, state: r.paused ? "paused" : "raise" } satisfies SackMsg);
      else this.h.send(id, "sack", { t: r.t, progress: Math.round(r.progress * 100) / 100, state: "raise" } satisfies SackMsg);
    }
    this.settle(now);
    this.tell(now);
  }

  /** One step of a banner going up over a fallen Hold's ruin: heroes of another clan in the reach hold it up, a blow starts it over. */
  private claimStep(id: string, p: HoldHero, r: Raise, now: number) {
    const at = bannerSpot(r.t), clan = r.claim!;
    if (!at || underground(p.y) || Math.hypot(p.x - at.x, p.y - at.y) > HOLD_SACK.useTiles * TILE * 1.5) { this.stop(id, "You left the banner."); return; }
    if (p.clan !== clan) { this.stop(id, "You are no longer sworn to the clan you raised this banner for."); return; }
    if (!warFallen(r.t)) { this.stop(id, "The ruin was claimed already."); return; }
    const hurt = p.lastHurt > r.hurtAt;
    r.hurtAt = p.lastHurt;
    const dt = now - r.lastStep, was = r.paused;
    r.lastStep = now;
    const step = sackStep(r, dt, this.rivals(r.t, clan, now), hurt);
    if (step === "done") { this.claimed(id, p, r, clan, now); return; }
    if (step !== "raise" || r.paused !== was) this.h.send(id, "sack", { t: r.t, progress: r.progress, state: r.paused ? "paused" : "raise" } satisfies SackMsg);
    else this.h.send(id, "sack", { t: r.t, progress: Math.round(r.progress * 100) / 100, state: "raise" } satisfies SackMsg);
  }

  /** The banner is up over the ruin: the land is the raiser's clan's (server/war.ts holdClaim), valor there, renown for its sworn heroes in the reach. */
  private claimed(id: string, p: HoldHero, r: Raise, clan: ClanKey, now: number) {
    this.raises.delete(id);
    const land = TERRITORIES[r.t].name;
    if (!holdClaim(r.t, clan, p.name, now)) { this.stop(id, "The war cannot hear of it now: try again in a moment."); return; }
    this.h.send(id, "sack", { t: r.t, progress: 1, state: "done" } satisfies SackMsg);
    if (warRole() === "follower") { this.h.send(id, "chat", { id: "", name: "Herald", text: `Your banner flies over the ruin of ${land}. The heralds carry the news to the war.` }); this.tell(now, true); return; }
    addValor(r.t, clan, HOLD_FALL.claimValor);
    const st = warState(), heroes = this.sharers(id, r.t, clan);
    for (const [hid, o] of heroes) {
      const was = rankOf(o.renown);
      o.renown += HOLD_FALL.claimRenown * rallyRenown(st, clan) * boonRenown(clan);
      const rank = rankOf(o.renown);
      if (rank > was) this.h.ranked?.(hid, RENOWN_RANKS[rank].name);
    }
    this.h.send(id, "chat", { id: "", name: "Herald", text: `You claimed the ruin of ${land} for ${the(CLANS[clan].name)}: +${HOLD_FALL.claimValor} valor. A new outpost rises, and its barracks will send out soldiers again.` });
    this.tell(now, true);
  }

  /** Ages: the sacks this room queued that the war's owner applied are paid (the war chest, renown); dropped ones are told. */
  private settle(now: number) {
    if (!this.waiting.length) return;
    this.waiting = this.waiting.filter((w) => {
      const fate = warActFate(w.act);
      if (fate === undefined && now - w.at < ACT_FATE_MS) return true;
      const land = TERRITORIES[w.t].name;
      if (fate !== "ok") {
        this.h.send(w.id, "chat", { id: "", name: "Herald", text: `The war did not count your sack of the Hold of ${land} (a war tick passed, or another hero sacked it first): no war chest, no renown.` });
        return false;
      }
      if (w.valor && w.clan) this.renown(w.heroes.flatMap((hid) => { const o = this.h.hero(hid); return o && !o.dead && o.clan === w.clan ? [[hid, o] as [string, HoldHero]] : []; }), w.t, w.clan, false);
      const at = bannerSpot(w.t)!;
      this.h.dropGold(at.x, at.y + 12, w.gold);
      this.h.send(w.id, "chat", { id: "", name: "Herald", text: this.paidLine(land, w.clan, w.holder, w.valor, w.gold, "") });
      return false;
    });
  }

  /** Renown for the sacker's clan heroes `heroes` at land t (and, `credit`, their Reckoning part: on a follower the owner gives it). */
  private renown(heroes: Iterable<[string, HoldHero]>, t: number, clan: ClanKey, credit: boolean) {
    const st = warState();
    for (const [hid, o] of heroes) {
      const was = rankOf(o.renown);
      o.renown += HOLD_SACK.sackRenown * rallyRenown(st, clan) * boonRenown(clan);
      if (credit) { const by = keyOf(o); if (by) crownCredit(t, by, clan, HOLD_SACK.sackValor); } // (a Reckoning: every sacker in the reach took part)
      const rank = rankOf(o.renown);
      if (rank > was) this.h.ranked?.(hid, RENOWN_RANKS[rank].name);
    }
  }

  /** The sacker's clan heroes who share the sack: the sacker, and those sworn to it of oath level in the reach. */
  private sharers(id: string, t: number, clan: ClanKey): [string, HoldHero][] {
    const out: [string, HoldHero][] = [];
    for (const [hid, o] of this.h.heroes()) if (!o.dead && o.clan === clan && o.level >= STANDARD.minLevel && (hid === id || inSackReach(t, o.x, o.y))) out.push([hid, o]);
    return out;
  }

  /** The Herald's word to the sacker on their pay. */
  private paidLine(land: string, clan: ClanKey | undefined, holder: ClanKey, valor: number, gold: number, siege: string): string {
    return valor
      ? `You sacked the Hold of ${land}: +${valor} valor for ${the(CLANS[clan!].name)}, a war chest of ${gold} gold.${siege}`
      : `You sacked the Hold of ${land} and took its war chest (${gold} gold).${clan ? (atWar(clan, holder) ? ` ${CLANS[clan].name} cannot push into ${land} yet: no valor, half the harm.` : ` ${CLANS[clan].name} are not at war with ${CLANS[holder].name}: no valor, half the harm.`) : " Unsworn, you fight for nobody: no valor, half the harm."}${siege}`;
  }

  /**
   * The banner is up: settled once per land per war tick for every room. The war hears of it (Control, maybe a siege),
   * the sacker's clan earns valor where the war lets it fight (an unsworn sacker, a clan not at war with the holder or kept out of the land does half the harm and
   * earns none), its sworn heroes in the reach renown, the war chest drops, the guards stay down until the next tick.
   */
  private done(id: string, p: HoldHero, r: Raise, holder: ClanKey, tick: number, now: number) {
    this.raises.delete(id);
    if (sacks.get(r.t)?.tick === tick || warSacked(r.t)) { this.stop(id, "This Hold was sacked already."); return; } // (warSacked: on another server, Ages)
    // a sacker whose clan is not at war with the holder (a grudge, Wanted only) robs it: no valor, no siege, half the harm
    const st = warState(), clan = p.clan, legal = !!st && !!clan && atWar(clan, holder) && targetsOf(st, clan).includes(r.t), at = bannerSpot(r.t)!;
    const gold = sackGold(troopLevel(r.t)), land = TERRITORIES[r.t].name;
    const follower = warRole() === "follower";
    if (follower) { // (Ages: the war's owner decides whether it counts; paid in settle once it does)
      const heroes = legal && clan ? this.sharers(id, r.t, clan) : [], valor = heroes.length ? HOLD_SACK.sackValor : 0;
      const credits = heroes.flatMap(([, o]) => { const by = keyOf(o); return by ? [by] : []; });
      const act = sackAct(r.t, clan, !legal, p.name, valor ? { valor, credits } : {});
      if (!act) { this.h.send(id, "sack", { t: r.t, state: "stop", err: "The war cannot hear of it now: try again in a moment." } satisfies SackMsg); return; }
      this.waiting.push({ act, id, t: r.t, clan, holder, valor, heroes: heroes.map(([hid]) => hid), gold, at: now });
    }
    sacks.set(r.t, { tick, by: clan ? CLAN_KEYS.indexOf(clan) : -1 });
    this.off.add(`${tick}:${r.t}`);
    this.h.guardsOff(r.t, tick + 1);
    if (follower) {
      this.h.broadcast("sfx", { ev: "hold_sacked", t: r.t, x: Math.round(at.x), y: Math.round(at.y), by: clan ?? "", from: holder });
      this.h.send(id, "sack", { t: r.t, progress: 1, state: "done" } satisfies SackMsg);
      this.h.send(id, "chat", { id: "", name: "Herald", text: `Your banner flies over the Hold of ${land}. The heralds carry the news to the war: its war chest${legal && clan ? " and renown" : ""} come when it counts.` });
      this.tell(now, true);
      return;
    }
    const hit = strikeHold(r.t, clan, !legal, p.name, now); // (the Herald, the holder's leader and every room's snapshot)
    let valor = 0;
    if (legal && clan && addValor(r.t, clan, HOLD_SACK.sackValor)) {
      valor = HOLD_SACK.sackValor;
      this.renown(this.sharers(id, r.t, clan), r.t, clan, true);
    }
    this.h.dropGold(at.x, at.y + 12, gold);
    this.h.broadcast("sfx", { ev: "hold_sacked", t: r.t, x: Math.round(at.x), y: Math.round(at.y), by: clan ?? "", from: holder });
    this.h.send(id, "sack", { t: r.t, progress: 1, state: "done" } satisfies SackMsg);
    const siege = hit?.siege ? ` Control fell to ${hit.control}: ${CLANS[clan!].name} lay siege.` : hit ? ` Control ${hit.control}.` : "";
    this.h.send(id, "chat", { id: "", name: "Herald", text: this.paidLine(land, clan, holder, valor, gold, siege) });
    this.tell(now, true);
  }

  /** The clients hear of the Holds at once on a change, of the progress at most every HOLD_SACK.sendMs. */
  private tell(now: number, force = false) {
    const v = this.view(), s = JSON.stringify([v.tick, v.sacked, v.raising.map((r) => [r[0], r[2]])]);
    const moved = v.raising.length > 0 && now - this.toldAt >= HOLD_SACK.sendMs;
    if (!force && s === this.told && !moved) return;
    this.told = s; this.toldAt = now;
    this.h.broadcast("holds", v);
  }
}
