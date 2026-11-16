/**
 * Big battles (W5): a few times a day two clan armies clash in the open at a war front. Three kinds: a pitched battle at
 * fixed times of day (pickPitched places it at the most pressed front), a storming (a siege that comes due on a close
 * margin, isDecisive, fights its last war tick out at the gate approach) and a meeting battle (a W4 meeting of two big
 * columns). Each side has a pool of men (battleMen of its force); without heroes near, the pools wear each other down by
 * a Lanchester step with no randomness (battleStep), so the war sim (tools/balance/war.ts --battles) and the live war
 * play a virtual battle alike. Heroes tip it through the banners (frontStep hysteresis, siege.ts) and the captains; the
 * live ring's deaths count toward each step's quota (only kills beyond it swing the battle). The outcome goes into the
 * next war tick as rules.ts TickExtra.battle. Pure rules and numbers: the server, the client, the tests and the sim.
 */
import { TILE } from "../constants";
import { CLAN_KEYS, CLANS, type ClanKey } from "./clans";
import { routePos, searchBox, warPath } from "./roads";
import { supplyMap, targetsOf, defenceAt, WAR, type BattleKind, type BattleOutcome, type BattleResult, type WarState } from "./rules";
import { siegeApproach, attackAxis, type FrontHold, type Side } from "./siege";
import { TERRITORIES } from "./territories";
import type { March } from "./marches";

export type { BattleKind, BattleOutcome, BattleResult } from "./rules";

export const BATTLE = {
  /** Master switch: off, no battle is announced or fought (the war ticks as before W5). */
  live: true,
  // ---- when ----
  /** The local time the pitched battles follow, and their start times there [hour, minute] (Murat's default: 3 a day). */
  tz: "Europe/Zurich",
  pitched: [[13, 0], [19, 0], [21, 30]] as [number, number][],
  /** Notice before a pitched battle (ms), and the reminder before the start. */
  noticeMs: 30 * 60_000, remindMs: 5 * 60_000,
  /** Battles a (local) day at most, all kinds; meeting battles at most; men each column needs (officer counted). */
  perDay: 6, meetPerDay: 2, meetMin: 6,
  /** A storming: the siege's attack x mult within this share of defence x siegeHold (either way) when it comes due. */
  decisive: 0.3,
  // ---- the pools ----
  /** Men a side = clamp(round(force / perMan), menMin, menMax): force is the attack on the land, or its defence. */
  perMan: 1, menMin: 60, menMax: 300,
  // ---- the maths (Lanchester, no randomness) ----
  /** A step every stepMs; each side loses k x the other side's men x that side's mult x dt (s) per step. */
  stepMs: 2000, k: 0.00175,
  /** Each banner a side holds: its mult x bannerMult. Each captain it lost: x captainMult. */
  bannerMult: 1.15, captainMult: 0.92,
  /** Holders at the start: left flank, centre, right flank (the attackers come on at both flanks, the defender holds the centre;
   *  its force already has the defender's edge, rules.ts defenceAt). */
  startBanners: ["atk", "def", "atk"] as Side[],
  /** A side below breakAt of its starting men breaks; after maxMs it ends anyway. The higher share left wins, within drawWithin a draw. */
  breakAt: 0.3, maxMs: 12 * 60_000, drawWithin: 0.05,
  // ---- the field ----
  /** The clear walkable box (tiles; the long side across the road) sought within fieldReach tiles of the war road's middle. */
  fieldLong: 20, fieldShort: 12, fieldReach: 24,
  /** Share of the box's tiles that must be walkable (trees and rocks may dot it); its middle third must be all clear. */
  fieldClear: 0.85,
  /** Flank banners stand this far in from the box's short ends (tiles). */
  flankInset: 3,
  // ---- live (server) ----
  /** A battle goes live when a living hero above ground is this close to the field (tiles). */
  wakeTiles: 30,
  /** Real troopers at most (both sides), and per side; reserves walk in from behind the lines this often (ms). */
  liveMax: 140, perSide: 70, reserveMs: 20_000,
  /** A battle trooper fights within this of its place (px). */
  leashPx: 6 * TILE,
  /** While a battle is live in a room, its trooper cap is WAR_TROOPS.maxTroops + extraTroops. */
  extraTroops: 140,
  /** Captains per side (officers with captainHp x the officer's HP); each one killed pays its killer captainValor. */
  captains: 2, captainHp: 3, captainValor: 5,
  /** Kill valor per hero per battle at most (instead of WAR_TROOPS.killValorPerTick). */
  killValorCap: 30,
  /** At the end: active sworn heroes (in the field activeMs or more) of the winner, of the loser. */
  activeMs: 120_000,
  winValor: 15, winRenown: 25, loseValor: 5, loseRenown: 10,
  /** Gold for a winner: base + perLevel x the land's soldier level. */
  gold: { base: 20, perLevel: 5 },
  /** Renown per hero per battle at most; valor per clan per battle at most. */
  renownCap: 60, valorCap: 60,
  // ---- the client ----
  /** Painted reserve ranks per side at most; corpses kept at most; the battle bar shows within this many tiles. */
  paintedMax: 40, corpseCap: 30, barTiles: 40,
};

// ---- when: pitched battles at fixed local times -----------------------------------------------------------------

let fmt: Intl.DateTimeFormat | undefined;
/** Minutes BATTLE.tz is ahead of UTC at instant `ms`. */
export function tzOffsetMin(ms: number): number {
  fmt ??= new Intl.DateTimeFormat("en-GB", { timeZone: BATTLE.tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
  const p: Record<string, number> = {};
  for (const x of fmt.formatToParts(ms)) if (x.type !== "literal") p[x.type] = Number(x.value);
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(ms / 60_000) * 60_000) / 60_000);
}
/** The local (BATTLE.tz) day number of instant `ms`: the day the per-day caps count in. */
export const battleDay = (ms: number) => Math.floor((ms + tzOffsetMin(ms) * 60_000) / 86_400_000);
/** The instant of local time h:m on local day `day`. */
function localAt(day: number, h: number, m: number): number {
  const guess = day * 86_400_000 + (h * 60 + m) * 60_000;
  let at = guess - tzOffsetMin(guess) * 60_000;
  at = guess - tzOffsetMin(at) * 60_000; // (once more, across a clock change)
  return at;
}
/** The pitched battles' start times (ms) of local day `day`. */
export const pitchedTimes = (day: number) => BATTLE.pitched.map(([h, m]) => localAt(day, h, m));
/** The next pitched battle's start (ms) at or after `now`, and its slot index of the day. */
export function pitchedSlot(now: number): { at: number; slot: number } {
  const d = battleDay(now);
  for (const day of [d - 1, d, d + 1, d + 2]) {
    const ts = pitchedTimes(day);
    for (let i = 0; i < ts.length; i++) if (ts[i] >= now) return { at: ts[i], slot: i };
  }
  return { at: Infinity, slot: -1 };
}
/** The war sim's clock: the day's tick indexes (ticks from local midnight) the pitched battles start at. */
export const pitchedTicks = () => BATTLE.pitched.map(([h, m]) => Math.round(((h * 60 + m) * 60_000) / WAR.tickMs));

// ---- the field -------------------------------------------------------------------------------------------------

/** A battlefield: the box (top-left tile, size), its centre (px), and the unit axis (along the short side) from a's side toward b's. */
export interface Field { a: number; b: number; tx: number; ty: number; w: number; h: number; x: number; y: number; dx: number; dy: number }
const fields = new Map<string, Field | null>();

/** The middle of the war way between a and b (px) and the way's direction there (a toward b). */
function midOf(a: number, b: number): { x: number; y: number; dx: number; dy: number } | undefined {
  const p = warPath(a, b);
  if (!p) return undefined;
  if (p.kind === "link") { const leg = p.legs[0].len >= p.legs[1].len ? p.legs[0] : p.legs[1]; return routePos(leg, leg.len / 2); }
  return routePos(p.legs[0], p.legs[0].len / 2);
}

function findField(a: number, b: number): Field | null {
  const m = midOf(a, b);
  if (!m) return null;
  const B = BATTLE, R = B.fieldReach + B.fieldLong, mx = Math.floor(m.x / TILE), my = Math.floor(m.y / TILE);
  const box = searchBox(mx - R, my - R, mx + R, my + R, true);
  // summed-area table of walkable tiles
  const W = box.w + 1, sat = new Int32Array(W * (box.h + 1));
  for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) sat[(y + 1) * W + x + 1] = box.walk[y * box.w + x] + sat[y * W + x + 1] + sat[(y + 1) * W + x] - sat[y * W + x];
  const open = (x0: number, y0: number, w: number, h: number) => {
    const x = x0 - box.x0, y = y0 - box.y0;
    if (x < 0 || y < 0 || x + w > box.w || y + h > box.h) return -1;
    return sat[(y + h) * W + x + w] - sat[y * W + x + w] - sat[(y + h) * W + x] + sat[y * W + x];
  };
  const clear = (x0: number, y0: number, w: number, h: number) => {
    const iw = Math.ceil(w / 3), ih = Math.ceil(h / 3);
    return open(x0, y0, w, h) >= B.fieldClear * w * h && open(x0 + Math.floor((w - iw) / 2), y0 + Math.floor((h - ih) / 2), iw, ih) === iw * ih;
  };
  // the long side across the road: a road running east-west gets a tall box (the lines face each other along it)
  const across = Math.abs(m.dx) >= Math.abs(m.dy);
  const shapes: [number, number][] = across ? [[B.fieldShort, B.fieldLong], [B.fieldLong, B.fieldShort]] : [[B.fieldLong, B.fieldShort], [B.fieldShort, B.fieldLong]];
  const cands: [number, number, number][] = [];
  for (let oy = -B.fieldReach; oy <= B.fieldReach; oy++) for (let ox = -B.fieldReach; ox <= B.fieldReach; ox++) {
    const d = ox * ox + oy * oy;
    if (d <= B.fieldReach * B.fieldReach) cands.push([d, ox, oy]);
  }
  cands.sort((p, q) => p[0] - q[0] || p[2] - q[2] || p[1] - q[1]);
  for (const [, ox, oy] of cands) for (const [w, h] of shapes) {
    const tx = mx + ox - Math.floor(w / 2), ty = my + oy - Math.floor(h / 2);
    if (!clear(tx, ty, w, h)) continue;
    const x = (tx + w / 2) * TILE, y = (ty + h / 2) * TILE;
    // the lines face each other along the short side, toward b's Hold
    const tB = TERRITORIES[b], wide = w > h;
    const dx = wide ? 0 : Math.sign(tB.cx * TILE - x) || 1, dy = wide ? Math.sign(tB.cy * TILE - y) || 1 : 0;
    return { a, b, tx, ty, w, h, x, y, dx, dy };
  }
  return null;
}

/**
 * The battlefield between neighbours a and b: a box (BATTLE.fieldLong x fieldShort tiles, the long side across the road
 * when it fits; at least fieldClear of it walkable, its middle third all clear) nearest the middle of their war way, off the safe squares, villages, monster-free
 * ground and every Hold's footprint; undefined when none fits within BATTLE.fieldReach. Cached per pair (no map change).
 * Axis (dx, dy) from a's side toward b's.
 */
export function battleField(a: number, b: number): Field | undefined {
  if (!TERRITORIES[a]?.near.includes(b)) return undefined;
  const lo = Math.min(a, b), hi = Math.max(a, b), key = `${lo}-${hi}`;
  if (!fields.has(key)) fields.set(key, findField(lo, hi));
  const f = fields.get(key);
  if (!f) return undefined;
  return a === lo ? f : { ...f, a, b, dx: -f.dx, dy: -f.dy };
}
/** The three banners of a field (px): left flank, centre, right flank (along the long side). */
export function battleBanners(f: Field): { x: number; y: number }[] {
  const half = (Math.max(f.w, f.h) / 2 - BATTLE.flankInset) * TILE, px = -f.dy, py = f.dx;
  return [{ x: f.x - px * half, y: f.y - py * half }, { x: f.x, y: f.y }, { x: f.x + px * half, y: f.y + py * half }];
}
/** Where a storming is fought: the gate approach of land t on the side facing the besieger's nearest land. */
export function stormField(owner: readonly unknown[], t: number, by: unknown): { x: number; y: number } | undefined {
  const ax = attackAxis(owner, t, by);
  const q = ax && siegeApproach(t, ax);
  return q ? { x: q.x, y: q.y } : undefined;
}
/** Tests: forget the fields found. */
export function _resetBattleFields() { fields.clear(); }

// ---- triggers --------------------------------------------------------------------------------------------------

/** Where a battle is fought for: land t (held by b), attacked by clan a from its land `from`. */
export interface BattleSite { t: number; from: number; a: ClanKey; b: ClanKey }

/**
 * The pitched battle at announcement: the most pressed land (last tick's pressure; no capitals) that a neighbouring clan
 * can attack from its own adjacent land with a battlefield between them. The attacker is the strongest such clan (army;
 * CLAN_KEYS order on a tie), fed from its best-supplied adjacent land with a field (near order on a tie). Pure in `s`.
 * `skip`: lands not to take (one already given a battle).
 */
export function pickPitched(s: WarState, skip: (t: number) => boolean = () => false): BattleSite | undefined {
  const order = TERRITORIES.map((t) => t.id).filter((t) => !TERRITORIES[t].capitalOf && s.pressure[t] > 0 && !skip(t))
    .sort((p, q) => s.pressure[q] - s.pressure[p] || p - q);
  let supply: number[] | undefined;
  for (const t of order) {
    const b = s.owner[t];
    let best: BattleSite | undefined;
    for (const a of CLAN_KEYS) {
      if (a === b || (best && s.army[a] <= s.army[best.a]) || !targetsOf(s, a).includes(t)) continue;
      supply ??= supplyMap(s);
      let from = -1;
      for (const n of TERRITORIES[t].near) if (s.owner[n] === a && battleField(n, t) && (from < 0 || supply[n] > supply[from])) from = n;
      if (from >= 0) best = { t, from, a, b };
    }
    if (best) return best;
  }
  return undefined;
}

/**
 * The besieger's odds at land t when its siege comes due, as warTick reckons them: [attack x siege mult, defence x
 * siegeHold] (`attack`: the land's attack per clan, `defence` its raw defence: rules.ts deployments, valor added).
 * Undefined with no siege, at a capital, or with no attack by the besieger.
 */
export function siegeOdds(s: WarState, t: number, attack: Partial<Record<ClanKey, number>>, defence: number, phase: number, supply: number[] = supplyMap(s)): [number, number] | undefined {
  const sg = s.siege[t];
  if (!sg || TERRITORIES[t]?.capitalOf === s.owner[t]) return undefined;
  const by = attack[sg.by] ?? 0;
  if (!(by > 0)) return undefined;
  const mult = CLANS[sg.by].doctrine === "siege" ? WAR.hostSiege : WAR.siegeBonus;
  return [by * mult, defenceAt(s, t, defence, phase, supply) * WAR.siegeHold];
}
/**
 * The forces a battle for land t sets against each other, as this tick's fight reckons them: clan a's attack there and
 * the land's defence with its edge (defenceAt); for a storming the siege's odds (siegeOdds), so the battle stands for
 * the check it settles. `attack`/`defence`: rules.ts deployments of the orders for the tick the battle feeds.
 */
export function siteForces(s: WarState, kind: BattleKind, t: number, a: ClanKey, attack: Partial<Record<ClanKey, number>>, defence: number, phase: number, supply: number[] = supplyMap(s)): [number, number] {
  if (kind === "storm") { const o = siegeOdds(s, t, attack, defence, phase, supply); if (o) return o; }
  return [attack[a] ?? 0, defenceAt(s, t, defence, phase, supply)];
}
/** A storming: land t's siege is due this tick and its odds are within BATTLE.decisive of even. */
export function isDecisive(s: WarState, t: number, attack: Partial<Record<ClanKey, number>>, defence: number, phase: number, supply?: number[]): boolean {
  const sg = s.siege[t];
  if (!sg || s.tick < sg.at) return false;
  const o = siegeOdds(s, t, attack, defence, phase, supply);
  return !!o && o[1] > 0 && Math.abs(o[0] - o[1]) <= BATTLE.decisive * o[1];
}

/**
 * The meeting battle of two columns that meet (marches.ts meetingOf; the caller checks the clans are at war): both must
 * field BATTLE.meetMin men or more. The stronger column (force; the lower id on a tie) is the attacker, fighting for the
 * land it marches on; the other defends its own land. Undefined when either column is too small.
 */
export function meetSite(ma: March, mb: March): (BattleSite & { forceA: number; forceB: number }) | undefined {
  if (ma.size < BATTLE.meetMin || mb.size < BATTLE.meetMin || ma.clan === mb.clan || ma.from !== mb.to || ma.to !== mb.from) return undefined;
  const [A, B] = ma.force > mb.force || (ma.force === mb.force && ma.id < mb.id) ? [ma, mb] : [mb, ma];
  return { t: A.to, from: A.from, a: A.clan, b: B.clan, forceA: A.force, forceB: B.force };
}
/** The meetings that grow into battles: the largest (men on both sides; ids on a tie) first, at most `n`. */
export function pickMeetings<T extends { a: March; b: March }>(ms: readonly T[], n: number): T[] {
  return ms.filter((m) => meetSite(m.a, m.b)).sort((p, q) => q.a.size + q.b.size - (p.a.size + p.b.size) || (p.a.id + p.b.id < q.a.id + q.b.id ? -1 : 1)).slice(0, Math.max(0, n));
}

// ---- the battle --------------------------------------------------------------------------------------------------

/** Men a side brings for `force` (an attack, or a defence): clamp(round(force / perMan), menMin, menMax). */
export function battleMen(force: number): number {
  const B = BATTLE, f = Number.isFinite(force) && force > 0 ? force : 0;
  return Math.max(B.menMin, Math.min(B.menMax, Math.round(f / B.perMan)));
}

/** One battle (the war save keeps the current and announced ones). Side index 0 is the attacker `a`, 1 the defender `b`. */
export interface Battle extends BattleSite {
  id: string; kind: BattleKind;
  /** Where (px): the field's centre, the storming's gate approach, the meeting point. */
  x: number; y: number;
  /** Start and latest end (ms). */
  start: number; end: number;
  /** Men at the start and now; the fractional losses not yet taken; seconds fought. */
  men0: [number, number]; men: [number, number]; acc: [number, number]; el: number;
  /** The three banners (left flank, centre, right flank): who holds each, siege.ts frontStep. */
  banners: FrontHold[];
  /** Captains each side has lost. */
  captains: [number, number];
  result?: BattleResult;
}

/** A battle at its start: pools from the forces, the banners at their start holders. */
export function newBattle(site: BattleSite, kind: BattleKind, x: number, y: number, start: number, forceA: number, forceB: number): Battle {
  const men0: [number, number] = [battleMen(forceA), battleMen(forceB)];
  return { ...site, id: `${kind}-${site.t}-${start}`, kind, x, y, start, end: start + BATTLE.maxMs, men0, men: [men0[0], men0[1]], acc: [0, 0], el: 0,
    banners: BATTLE.startBanners.map((h) => ({ holder: h, since: start })), captains: [0, 0] };
}

/** Side i's killing mult: bannerMult per banner held, captainMult per captain lost, times `kMult` (heroes in the sim). */
export function sideMult(b: Battle, i: 0 | 1, kMult = 1): number {
  const held = b.banners.filter((f) => f.holder === (i === 0 ? "atk" : "def")).length;
  return Math.pow(BATTLE.bannerMult, held) * Math.pow(BATTLE.captainMult, b.captains[i]) * kMult;
}

/** Who is ahead: the higher share of its starting men left; within BATTLE.drawWithin a draw. */
export function battleResult(b: Pick<Battle, "men0" | "men">): BattleResult {
  const sa = b.men[0] / Math.max(1, b.men0[0]), sb = b.men[1] / Math.max(1, b.men0[1]);
  return Math.abs(sa - sb) <= BATTLE.drawWithin ? "draw" : sa > sb ? "att" : "def";
}

/**
 * One step of `dt` seconds (the server and the sim use BATTLE.stepMs): each side's quota of losses is k x the other's
 * men x the other's mult x dt, kept in fractional accumulators; `live` are the deaths the live ring had meanwhile
 * (attacker, defender): they count toward the quota and only those beyond it take extra men. Then a side under breakAt
 * of its start, or maxMs fought, ends it (sets `result`). Returns the men taken per side. A finished battle stays put.
 */
export function battleStep(b: Battle, dt: number, live: readonly [number, number] = [0, 0], kMult: readonly [number, number] = [1, 1]): [number, number] {
  if (b.result || !(dt > 0)) return [0, 0];
  const B = BATTLE, q = [B.k * b.men[1] * sideMult(b, 1, kMult[1]) * dt, B.k * b.men[0] * sideMult(b, 0, kMult[0]) * dt];
  const took: [number, number] = [0, 0];
  for (const i of [0, 1] as const) {
    b.acc[i] += q[i];
    const l = Math.max(0, Math.floor(Number.isFinite(live[i]) ? live[i] : 0)), take = Math.min(b.men[i], Math.max(Math.floor(b.acc[i]), l));
    b.acc[i] = Math.max(0, b.acc[i] - Math.max(take, Math.floor(b.acc[i])));
    b.men[i] -= take; took[i] = take;
  }
  b.el += dt;
  if (b.men[0] < B.breakAt * b.men0[0] || b.men[1] < B.breakAt * b.men0[1] || b.el * 1000 >= B.maxMs - 1e-6) b.result = battleResult(b);
  return took;
}

/** A battle fought out with no hero near (stepped every BATTLE.stepMs to its end). Deterministic: the same men give the same battle. */
export function virtualBattle(b: Battle, kMult: readonly [number, number] = [1, 1]): Battle {
  while (!b.result) battleStep(b, BATTLE.stepMs / 1000, [0, 0], kMult);
  return b;
}

/** What the battle hands the next war tick (rules.ts TickExtra.battle). Undefined while it is still being fought. */
export function battleOutcome(b: Battle): BattleOutcome | undefined {
  if (!b.result) return undefined;
  return { kind: b.kind, t: b.t, att: b.a, def: b.b, result: b.result, lostA: 1 - b.men[0] / Math.max(1, b.men0[0]), lostB: 1 - b.men[1] / Math.max(1, b.men0[1]) };
}

/** Gold a winning hero takes: base + perLevel x the land's soldier level. */
export const battleGold = (level: number) => Math.round(BATTLE.gold.base + BATTLE.gold.perLevel * level);

// ---- the message -------------------------------------------------------------------------------------------------

/**
 * One battle as the client sees it. `state` 0 announced, 1 being fought, 2 over (`result` set). `box`: the field
 * [tx, ty, w, h] in tiles (none for a storming or a meeting), `dx, dy` the axis from the attacker's side. `men0`/`men`
 * per side [attacker, defender]; `banners` [x, y (px), holder 0 attacker / 1 defender]; `captains` alive per side.
 */
export interface BattleView {
  id: string; kind: BattleKind; t: number; from: number; a: ClanKey; b: ClanKey;
  x: number; y: number; box?: [number, number, number, number]; dx: number; dy: number;
  start: number; end: number; state: 0 | 1 | 2;
  men0: [number, number]; men: [number, number];
  banners: [number, number, 0 | 1][]; captains: [number, number];
  result?: BattleResult;
}
/** The "battle" message (server -> client; on join, on announce, start, banner or captain change, every few seconds while fought, at the end): the server's clock and every battle announced, fought or just over. */
export interface BattleMsg { now: number; list: BattleView[] }

/** A battle's view at `now` (its field from battleField for a pitched battle; storming and meeting: no box). */
export function battleView(b: Battle, now: number): BattleView {
  const f = b.kind === "pitched" ? battleField(b.from, b.t) : undefined;
  const pts = f ? battleBanners(f) : [{ x: b.x - 6 * TILE, y: b.y }, { x: b.x, y: b.y }, { x: b.x + 6 * TILE, y: b.y }];
  const ax = f ? { x: f.dx, y: f.dy } : { x: 1, y: 0 };
  return {
    id: b.id, kind: b.kind, t: b.t, from: b.from, a: b.a, b: b.b, x: Math.round(b.x), y: Math.round(b.y),
    ...(f ? { box: [f.tx, f.ty, f.w, f.h] as [number, number, number, number] } : {}), dx: ax.x, dy: ax.y,
    start: b.start, end: b.end, state: b.result ? 2 : now >= b.start ? 1 : 0,
    men0: [b.men0[0], b.men0[1]], men: [b.men[0], b.men[1]],
    banners: b.banners.map((h, i) => [Math.round(pts[i]?.x ?? b.x), Math.round(pts[i]?.y ?? b.y), h.holder === "atk" ? 0 : 1]),
    captains: [BATTLE.captains - b.captains[0], BATTLE.captains - b.captains[1]],
    ...(b.result ? { result: b.result } : {}),
  };
}
