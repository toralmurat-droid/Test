/**
 * Veiled Circle rituals in the world (roadmap M2). In the war rules (rules.ts) a clan with the ritual doctrine fights
 * harder at noon (timeBonus: phase 0 of warPhase). Here that noon becomes a place: one ritual circle per day phase, on
 * the Veiled border land under the most pressure (defence) or the land the Veiled besiege (attack). When a hero comes
 * near, three acolytes (plain "veiled" troopers) stand on the circle while it channels; Veiled-sworn heroes in the ring
 * speed it up, rivals in the ring pause it. Completed, it pays the Veiled valor in the land; three dead acolytes break it
 * and pay the disruptor (server/warRituals.ts). Pure rules, spots and numbers, the same for the server and the tests.
 */
import { MAP_W, TILE } from "../constants";
import { DAY_CYCLE_MS } from "../daynight";
import { CRYPT_DOOR, LINKS, SINKHOLE, UNDER_SHAFT, underground } from "../dungeon";
import { BOARDS } from "../bounty";
import { WAYGATE_DESERT, WAYGATE_OAKVALE } from "../desert";
import { DOORS, isSolidAt, PORTAL_SPOTS, SHRINE_SPOT } from "../map";
import { NPC_DECOR, NPCS } from "../npcs";
import { caravanOffLimits } from "./caravans";
import { patrolOf } from "./patrols";
import { type ClanKey } from "./clans";
import { LEADERS } from "./heralds";
import { bordersOf, timeBonus, type WarState } from "./rules";
import { anyHoldWall, holdReachPx } from "./holdWalls";
import { HOLDS, STANDARD, STANDARDS } from "./standards";
import { TERRITORIES } from "./territories";
import { warPhase } from "./view";

export const RITUAL = {
  /** Master switch: off, no circle ever appears. */
  live: true,
  /** The clan that holds rituals (the one with the ritual doctrine). */
  clan: "veiled" as ClanKey,
  /** The circle appears when a living hero above ground is this close to it (tiles)... */
  wakeTiles: 22,
  /** ...and its acolytes go (progress and the fallen kept) after this long with no hero that close (ms). */
  sleepMs: 30_000,
  /** Acolytes on the circle (plain Veiled troopers, never replaced in the same day phase). */
  acolytes: 3,
  /** Channel time with nobody helping (ms). Noon lasts about 19 minutes of the 30-minute day. */
  channelMs: 240_000,
  /** Each active Veiled-sworn hero in the ring adds this much speed (x1), counting at most maxHelpers. */
  heroSpeed: 0.5, maxHelpers: 3,
  /** The ring (px): heroes and troopers within this of the centre count for speed and pause. */
  ringPx: 4 * TILE,
  /** Acolytes stand this far from the centre (px), and fight only within leashPx of it. */
  postPx: 40, leashPx: 6 * TILE,
  /** Pause count: rival troopers + heroWeight x active hostile-sworn heroes, less heroWeight x active Veiled-sworn heroes. */
  heroWeight: 2,
  /** Hysteresis: the count must be >= pauseMargin for pauseMs straight to pause, and <= 0 for resumeMs straight to resume. */
  pauseMargin: 1, pauseMs: 3000, resumeMs: 5000,
  /** A completed ritual: valor for the Veiled in the land (if the war lets them fight there). */
  ritualValor: 8,
  /** The hero who kills the last acolyte: renown, and valor for their clan in the land (legal-gated). */
  disruptValor: 6, disruptRenown: 10,
  /** Ritual valor per land per clan per room per war tick at most. */
  maxValorPerTick: 10,
  /** After completion the acolytes stay this long round the glowing circle, then go (ms). */
  lingerMs: 6000,
  /** Spot: tiles kept from NPCs and their props, and from portal stones and overworld entrances (sinkhole, crypt, shaft, waygates, shrine). */
  npcKeepTiles: 4, entranceKeepTiles: 6,
  /** Progress reaches the clients at most this often (state changes go at once) (ms). */
  sendMs: 2000,
};

/** The war phase the ritual doctrine's bonus falls in (noon, 0): rituals run then and only then. */
export const RITUAL_PHASE = [0, 1, 2].find((p) => timeBonus(RITUAL.clan, p) > 1) ?? 0;
/** True while rituals may run (warPhase of the world clock is the ritual phase). */
export const ritualTime = (now: number) => warPhase(now) === RITUAL_PHASE;
/** Where noon starts on the world clock (warPhase: night ends at 0.965); a day phase never spans a change of ritualDay. */
export const NOON_FROM = 0.965;
/** Which day phase it is: the same number from the start of one noon (dayFrac 0.965) to the start of the next. */
export const ritualDay = (now: number) => Math.floor(now / DAY_CYCLE_MS + (1 - NOON_FROM));

/** The ring search keeps from every standard: their ring plus ours, so the two never overlap (strict pass). */

let doorTiles: Set<number> | undefined;
/** Tiles (centres, in tiles) of things a circle keeps away from: overworld entrances and portal stones, NPCs and their props. */
const px = (p: { x: number; y: number }) => ({ x: p.x / TILE, y: p.y / TILE }), mid = (p: { x: number; y: number }) => ({ x: p.x + 0.5, y: p.y + 0.5 });
/** Tile centres a circle keeps entranceKeepTiles from: portal stones, every above-ground stair or rope, the sinkhole, crypt door, well-shaft, both waygates, the shrine. */
export const RITUAL_ENTRANCES = [...[...PORTAL_SPOTS, SINKHOLE, CRYPT_DOOR, UNDER_SHAFT, WAYGATE_OAKVALE, WAYGATE_DESERT, SHRINE_SPOT].map(mid), ...LINKS.filter((l) => !underground(l.y)).map(px)];
/** Tile spots a circle keeps npcKeepTiles from: NPCs, their props, the bounty boards. */
export const RITUAL_MARKS = [...NPCS.map(px), ...NPC_DECOR.map((d) => ({ x: d.x, y: d.y })), ...BOARDS.map(px)];

/**
 * Tile (tx, ty) can carry a circle: its 3x3 free of solid tiles and off-limits ground (safe squares, stockade,
 * monster-free ground), no dungeon door within 2 tiles, no portal stone or overworld entrance (above-ground stairs and
 * ropes included) within entranceKeepTiles, no NPC, NPC prop or bounty board within npcKeepTiles. (Own checks, not the tunnel mouth's, so the two can be tuned apart.)
 */
export function ritualClear(tx: number, ty: number): boolean {
  if (!doorTiles) { doorTiles = new Set(); for (const d of DOORS) for (const k of d.tiles) doorTiles.add(k); }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (doorTiles.has((ty + dy) * MAP_W + tx + dx)) return false;
  const cx = tx + 0.5, cy = ty + 0.5;
  if (RITUAL_ENTRANCES.some((p) => Math.hypot(p.x - cx, p.y - cy) < RITUAL.entranceKeepTiles)) return false;
  if (RITUAL_MARKS.some((n) => Math.hypot(n.x - cx, n.y - cy) < RITUAL.npcKeepTiles)) return false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = (tx + dx + 0.5) * TILE, y = (ty + dy + 0.5) * TILE;
    if (isSolidAt(x, y) || caravanOffLimits(x, y)) return false;
  }
  return true;
}

const reachCache = new Map<number, Set<number> | undefined>();
/** Tiles of land t (its rect + 2) a soldier can walk to from its Hold gate (4-way, centres free, never off limits). */
function reachOf(t: number): Set<number> | undefined {
  if (reachCache.has(t)) return reachCache.get(t);
  const T = TERRITORIES[t], p = patrolOf(t);
  let out: Set<number> | undefined;
  if (T && p) {
    const M = 2, x0 = T.x - M, y0 = T.y - M, x1 = T.x + T.w - 1 + M, y1 = T.y + T.h - 1 + M;
    const ok = (tx: number, ty: number) => tx >= x0 && ty >= y0 && tx <= x1 && ty <= y1 && !anyHoldWall(tx, ty) && !isSolidAt((tx + 0.5) * TILE, (ty + 0.5) * TILE) && !caravanOffLimits((tx + 0.5) * TILE, (ty + 0.5) * TILE);
    const sx = Math.floor(p.pts[0].x / TILE), sy = Math.floor(p.pts[0].y / TILE);
    if (ok(sx, sy)) {
      out = new Set([sy * MAP_W + sx]);
      const q = [[sx, sy]];
      while (q.length) {
        const [cx, cy] = q.pop()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy, k = ny * MAP_W + nx;
          if (!out.has(k) && ok(nx, ny)) { out.add(k); q.push([nx, ny]); }
        }
      }
    }
  }
  reachCache.set(t, out);
  return out;
}

/** Distance (px) from (x, y) to the edge of a Hold's fort (the square holdReachPx round its centre, any clan's fort); 0 inside. */
export const fortGap = (h: { t: number; x: number; y: number }, x: number, y: number) => {
  const r = holdReachPx(h.t);
  return Math.hypot(Math.max(0, Math.abs(h.x - x) - r), Math.max(0, Math.abs(h.y - y) - r));
};
/** Distance (px) from (x, y) to the edge of a standard's ring; negative inside. */
export const ringGap = (s: { x: number; y: number }, x: number, y: number) => Math.hypot(s.x - x, s.y - y) - STANDARD.range;

const spotCache = new Map<number, { x: number; y: number } | undefined>();
/**
 * Where land t's ritual circle lies (px, a tile centre). In every pass the whole counting ring (ringPx, wider than the
 * drawn circle) stays off EVERY Hold's fort and EVERY standard's ring (lands' rects overlap), the tile passes ritualClear
 * and is reachable on foot from the land's Hold gate. Passes, the first that finds one wins, nearest the land's middle:
 * (1) inside the rect by 2 tiles, a 5x5 free of solid tiles, one more tile of room from forts and rings; (2) inside the
 * rect by 1 tile; (3) the rect + 2 tiles (the reachable margin). Deterministic (the map alone), cached.
 */
export function ritualSpot(t: number): { x: number; y: number } | undefined {
  if (spotCache.has(t)) return spotCache.get(t);
  const T = TERRITORIES[t], reach = T ? reachOf(t) : undefined;
  let best: { x: number; y: number } | undefined;
  if (T && reach) {
    const ok = (tx: number, ty: number, pass: number) => {
      const m = pass === 0 ? 2 : pass === 1 ? 1 : -2;
      if (tx < T.x + m || ty < T.y + m || tx >= T.x + T.w - m || ty >= T.y + T.h - m || !reach.has(ty * MAP_W + tx)) return false;
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE, keep = RITUAL.ringPx + (pass === 0 ? TILE : 0);
      if (HOLDS.some((h) => fortGap(h, x, y) < keep) || STANDARDS.some((s) => ringGap(s, x, y) < keep)) return false;
      if (!ritualClear(tx, ty)) return false;
      if (pass === 0) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (isSolidAt((tx + dx + 0.5) * TILE, (ty + dy + 0.5) * TILE)) return false;
      return true;
    };
    for (let pass = 0; pass < 3 && !best; pass++) {
      let bd = Infinity;
      for (let ty = T.y - 2; ty < T.y + T.h + 2; ty++) for (let tx = T.x - 2; tx < T.x + T.w + 2; tx++) {
        const d = Math.hypot(tx + 0.5 - T.cx, ty + 0.5 - T.cy);
        if (d < bd && ok(tx, ty, pass)) { bd = d; best = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }; }
      }
    }
  }
  spotCache.set(t, best);
  return best;
}

/**
 * The land of today's ritual from the war state: the land the Veiled besiege (attack; the lowest Control, then the
 * lowest id), else their border land under the most pressure (defence; then the lowest id). Lands with no circle spot
 * are skipped. Deterministic; undefined when the Veiled hold no border land and besiege nothing.
 */
export function ritualSite(st: WarState): { t: number; mode: "attack" | "defend" } | undefined {
  const V = RITUAL.clan;
  const atk = st.siege.flatMap((sg, i) => (sg && sg.by === V && st.owner[i] !== V ? [i] : [])).sort((a, b) => st.control[a] - st.control[b] || a - b);
  for (const t of atk) if (ritualSpot(t)) return { t, mode: "attack" };
  const def = bordersOf(st, V).sort((a, b) => (st.pressure[b] ?? 0) - (st.pressure[a] ?? 0) || a - b);
  for (const t of def) if (ritualSpot(t)) return { t, mode: "defend" };
  return undefined;
}

/** Channel speed with `helpers` active Veiled-sworn heroes in the ring (1 alone, at most 1 + heroSpeed x maxHelpers). */
export const ritualRate = (helpers: number) => 1 + RITUAL.heroSpeed * Math.min(RITUAL.maxHelpers, Math.max(0, Math.floor(helpers)));

/** Progress after `dtMs` more of channelling (0..1); a paused ritual stands still. */
export function channelStep(progress: number, dtMs: number, helpers: number, paused: boolean): number {
  if (paused || !(dtMs > 0)) return progress;
  return Math.min(1, progress + (dtMs * ritualRate(helpers)) / RITUAL.channelMs);
}

/** A ritual's pause: paused or not, which way the count leans now, and since when. */
export interface RitualHold { paused: boolean; lead?: boolean; since: number }

/**
 * The ring's count at `now` (rivals and guards already weighted): returns true when the pause flips. Rivals ahead by
 * pauseMargin for pauseMs straight pause it; rivals no longer ahead for resumeMs straight resume it; any break starts
 * the clock over (like frontStep in siege.ts).
 */
export function pauseStep(h: RitualHold, rivals: number, guards: number, now: number): boolean {
  const d = rivals - guards, want = d >= RITUAL.pauseMargin ? true : d <= 0 ? false : undefined;
  if (want === undefined || want === h.paused) { h.lead = undefined; return false; }
  if (h.lead !== want) { h.lead = want; h.since = now; return false; }
  if (now - h.since < (want ? RITUAL.pauseMs : RITUAL.resumeMs)) return false;
  h.paused = want; h.lead = undefined; h.since = now;
  return true;
}

/** Ritual valor `v` that may still be paid with `used` already paid to that clan in that land this war tick. */
export const ritualPay = (v: number, used: number) => Math.max(0, Math.min(v, RITUAL.maxValorPerTick - used));

/** What the Veiled leader says when a ritual completes ({land}), picked by `seed`. */
export const RITUAL_LINES = [
  "The rite at {land} is complete. The veil thickens.",
  "Noon has spoken at {land}. The Circle sees further.",
  "The circle at {land} is closed. As foretold.",
];
export function ritualLine(land: string, seed: number): { name: string; text: string } {
  return { name: LEADERS[RITUAL.clan].name, text: RITUAL_LINES[Math.abs(Math.floor(seed)) % RITUAL_LINES.length].replace(/\{land\}/g, land) };
}

export type RitualState = "channel" | "paused" | "done" | "broken";
/** What the server sends ("rituals"): the room's circle while a hero is near; t -1 when none. */
export interface RitualView { t: number; x: number; y: number; progress: number; state: RitualState }
export const NO_RITUAL: RitualView = { t: -1, x: 0, y: 0, progress: 0, state: "channel" };
