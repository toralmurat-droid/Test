/**
 * Standards and swearing (roadmap M1): heroes swear their oath at a standard, and a besieged land's standards are its
 * siege fronts (siege.ts). Since W2c a standard's ring adds no valor by itself (STANDARD.valorPerMin 0): valor comes from
 * fighting. Standards sit on free ground inside each territory, the same on server and client (from the map).
 */
import { MAP_H, MAP_W, TILE } from "../constants";
import { BORDERS, endPath } from "../borders";
import { CR, CROWN_LANDS } from "../crown";
import { isSafeZone, isSolidAt, PORTAL_SPOTS, WORLD } from "../map";
import { noMobsAt } from "../spawns";
import { inVillage } from "../wrath";
import { CLANS, type ClanKey } from "./clans";
import { TERRITORIES, warProof } from "./territories";
import { TOWNS } from "./townSites";

export const STANDARD = {
  /** Ring radius (px): stand inside to hold the standard. */
  range: 3 * TILE,
  /** Valor a hero brings per minute in a ring: none since W2c (Murat found standing at a standard clunky). Valor comes from
   * fighting now (kills of clans at war, Hold sacks, fronts, caravans, rams, tunnels, rituals, writs, bounties); the
   * standards stay as oath points and siege fronts (siege.ts siegeFronts), and an old `hold` writ still counts minutes. */
  valorPerMin: 0,
  /** Heroes below this level cannot swear (the war is for heroes who know the world a little). */
  minLevel: 5,
  /** Changing clan after the first oath waits this long. */
  swearCooldownMs: 24 * 60 * 60_000,
  /** A hero who has not moved, attacked or cast for this long counts as idle: no weight at a siege front, a ritual circle,
   * a ram or a tunnel mouth, and no defender at a Hold (the standards' own minutes no longer check it: they pay nothing). */
  idleMs: 3 * 60_000,
  /** Heroes this many levels above a territory's monsters bring only `overLevelShare` of their valor there. */
  overLevel: 5, overLevelShare: 0.25,
};

/** Valor a hero of `level` brings per minute in territory `t`. */
export function heroValor(level: number, t: number): number {
  const top = TERRITORIES[t]?.levels[1] ?? 0;
  return STANDARD.valorPerMin * (level > top + STANDARD.overLevel ? STANDARD.overLevelShare : 1);
}

export interface Standard { id: number; t: number; x: number; y: number }

/** Tiles a standard keeps from a portal stone (the ring and the stone's prompt must not overlap). */
const KEEP_CLEAR = 6;

/**
 * Hold spots a land was built round (map tiles): the Crown's lands (shared/crown.ts CROWN_LANDS) each keep a 7x7 patch
 * clear for their Hold, off the king's roads that would leave its fort only gaps. Tried first; the search below is the
 * fallback (and how every older land got its Hold). Standards keep off a patch, as off the Hold's spot.
 */
const HOLD_PATCHES = new Map(CROWN_LANDS.map((l) => [l.name, { x: l.hold[0], y: CR(l.hold[1]) }]));

/** A walkable spot near (tx, ty) inside territory `t`'s rect, with a little room around it. */
function freeSpot(t: (typeof TERRITORIES)[number], tx: number, ty: number): { x: number; y: number } | undefined {
  const patch = HOLD_PATCHES.get(t.name);
  const free = (x: number, y: number) => {
    if (x < t.x + 1 || y < t.y + 1 || x >= t.x + t.w - 1 || y >= t.y + t.h - 1) return false;
    if (PORTAL_SPOTS.some((p) => Math.hypot(p.x - x, p.y - y) < KEEP_CLEAR)) return false; // its own E prompt there
    if (patch && Math.hypot(patch.x - x, patch.y - y) <= STANDARD.range / TILE + 2) return false; // the Hold's patch
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isSolidAt((x + 0.5 + dx) * TILE, (y + 0.5 + dy) * TILE)) return false;
    return true;
  };
  for (let r = 0; r < 14; r++)
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !free(tx + dx, ty + dy)) continue;
      return { x: (tx + dx + 0.5) * TILE, y: (ty + dy + 0.5) * TILE };
    }
  return undefined;
}

/** Two standards per territory (one in a small one), a third of the way in from each side along its long axis. */
function build(): Standard[] {
  const out: Standard[] = [];
  for (const t of TERRITORIES) {
    const wide = t.w >= t.h, n = Math.max(t.w, t.h) >= 24 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0.5 : (i + 1) / 3;
      const tx = Math.floor(wide ? t.x + t.w * f : t.cx), ty = Math.floor(wide ? t.cy : t.y + t.h * f);
      const at = freeSpot(t, tx, ty);
      if (at) out.push({ id: out.length, t: t.id, ...at });
    }
  }
  return out;
}

export const STANDARDS: Standard[] = build();


/** What a fort was placed beside (HOLD_SITES): a capital, a border road's pass end, a town's gate, or a road junction. */
export type HoldSite = "capital" | "pass" | "town" | "junction";
export interface Hold { t: number; x: number; y: number; site?: HoldSite; anchor?: string }
/** Tiles round its middle a Hold's placement keeps clear (each clan's fort plan is in shared/war/holdWalls.ts). */
export const HOLD_RADIUS = 3;
/** Half-size in px of the 7x7 clearing a Hold is placed on. The forts themselves differ by clan and are bigger: troops, guards, rituals and tunnels keep outside holdWalls.ts holdReachPx. */
export const HOLD_FORT_PX = (HOLD_RADIUS + 0.5) * TILE;
/** Each territory's muster before the forts moved to the roads: a clear spot near its middle (px). */
function buildMusters(): Hold[] {
  const out: Hold[] = [];
  // local copies: under tsx (the tests) each use of an import is a getter call, slow in these tile loops
  const TILE_ = TILE, solidAt = isSolidAt, portals = PORTAL_SPOTS;
  const INNER = 2; // the inner 5x5 must hold no solid tile at all: the ground layer paints over map objects there
  for (const t of TERRITORIES) {
    const mine = STANDARDS.filter((s) => s.t === t.id);
    let best: { x: number; y: number; score: number } | undefined;
    const patch = HOLD_PATCHES.get(t.name);
    if (patch) {
      const x = (patch.x + 0.5) * TILE_, y = (patch.y + 0.5) * TILE_;
      let clear = !portals.some((p) => Math.hypot(p.x - patch.x, p.y - patch.y) < KEEP_CLEAR) && mine.every((s) => Math.hypot(s.x - x, s.y - y) > STANDARD.range + 2 * TILE_);
      for (let dy = -INNER; dy <= INNER && clear; dy++) for (let dx = -INNER; dx <= INNER; dx++) if (solidAt(x + dx * TILE_, y + dy * TILE_)) clear = false;
      if (clear) { out.push({ t: t.id, x, y }); continue; }
    }
    // only the outer ring of the 7x7 clearing may relax and the fort may hang over the land's edge by a tile before the land gets none
    for (const [ringMax, edge] of [[3, HOLD_RADIUS + 1], [8, HOLD_RADIUS + 1], [24, HOLD_RADIUS + 1], [24, INNER + 1], [24, 1]]) {
      for (let ty = t.y + edge; ty < t.y + t.h - edge; ty++) for (let tx = t.x + edge; tx < t.x + t.w - edge; tx++) {
        if (portals.some((p) => Math.hypot(p.x - tx, p.y - ty) < KEEP_CLEAR)) continue; // leave the portal stone room
        let inner = 0, ring = 0;
        for (let dy = -HOLD_RADIUS; dy <= HOLD_RADIUS; dy++) for (let dx = -HOLD_RADIUS; dx <= HOLD_RADIUS; dx++)
          if (solidAt((tx + dx + 0.5) * TILE_, (ty + dy + 0.5) * TILE_)) { if (Math.max(Math.abs(dx), Math.abs(dy)) <= INNER) inner++; else ring++; }
        if (inner || ring > ringMax) continue;
        const x = (tx + 0.5) * TILE_, y = (ty + 0.5) * TILE_;
        const far = Math.min(Infinity, ...mine.map((s) => Math.hypot(s.x - x, s.y - y))) / TILE;
        // away from the rings first (up to 8 tiles counts), then close to the middle, then clear ground
        if (far * TILE <= STANDARD.range + 2 * TILE) continue; // never inside a standard's ring or right at it
        const score = Math.min(far, 8) * 10 - Math.hypot(tx - t.cx, ty - t.cy) - ring * 3;
        if (!best || score > best.score) best = { x, y, score };
      }
      if (best) break;
    }
    if (best) out.push({ t: t.id, x: best.x, y: best.y });
  }
  return out;
}

/**
 * Where the forts go (settlement network step 2, Murat 2026-11-19: the Holds should make sense with the roads). Only some
 * lands are fortified, each fort beside what it guards; every land keeps a muster (MUSTERS) for its troops either way.
 */
export const HOLD_SITES = {
  /** Fewest tiles between two forts. */
  spacing: 18,
  /** A pass end or town gate looks for a fort land this far (tiles, to the land's rect); a junction only this far. */
  reach: 40, junctionReach: 18,
  /** A fort stands best this far (tiles) from what it guards, never farther than `farthest`. */
  best: 6, farthest: 30,
  /** A Crown land's prepared Hold patch (crown.ts CROWN_LANDS hold) wins if within this many tiles of the anchor. */
  patchReach: 12,
  /** Most solid tiles in the outer ring of the 7x7 clearing (the inner 5x5 must be clear, no road tile in the 7x7). */
  ringSolid: 8,
  /** No road tile this near (Chebyshev tiles: the 7x7 clearing): the fort stands beside the road, not on it. */
  roadClear: 3,
  /** ...and a road tile within this many tiles: the fort watches the road. */
  roadNear: 12,
  /** Tiles a fort's middle keeps inside its land's rect (HOLD_RADIUS + 1: holdWalls.ts squeezes the bigger plans in where the rect ends). */
  edge: 4,
  /** Tiles (Chebyshev) a fort keeps from a town's gate muster: its sack reach (fort + holdSack.ts marginPx) and the gate's (towns.ts TOWN.reachPx) never meet. */
  gateClear: 16,
  /** Score lost per solid tile 4-8 tiles out (the bigger forts' walls and their guards): the fort stands on open ground where it can. */
  wideSolid: 1,
  /**
   * The band round a fortress where its guards stand and walk (Chebyshev tiles from the middle) must stay one piece: a
   * lake, a cliff or rows of graves cutting it would leave a guard a long way round its walls. Pockets this small don't count.
   */
  band: [6, 8], bandPocket: 6,
  /** No safe ground, village or town tile this near (Chebyshev tiles): the fort and its guards stand where soldiers may (war/roads.ts roadOffLimits). */
  offLimits: 8,
  /** Junctions: a road tile whose rings at these Chebyshev radii each cross this many separate road runs; one per cluster. */
  junctionRings: [3, 5], junctionRuns: 3, junctionCluster: 10,
  /** Forts a land gets in all (junctions only fill up to it; capitals, passes and towns come first). */
  quota: { oakvale: 7, sunscar: 4, moors: 4, badlands: 4, sinkholes: 5, crown: 5 } as Record<string, number>,
};

type Land = (typeof TERRITORIES)[number];
interface Anchor { x: number; y: number; site: HoldSite; anchor: string; t?: number }

/** Fortified lands' forts (HOLDS) and every land's muster, from the map alone (the same on server and client). */
function buildSites(): { holds: Hold[]; musters: Hold[] } {
  // local copies: under tsx (the tests) each use of an import is a getter call, slow in these tile loops
  const musters = buildMusters(), S = HOLD_SITES, W = MAP_W, H = MAP_H, TILE_ = TILE, solidAt = isSolidAt, portals = PORTAL_SPOTS, safe = isSafeZone, village = inVillage, noMobs = noMobsAt;
  const roads = WORLD.roads, std = STANDARDS, terr = TERRITORIES, E = S.edge, ringPx = STANDARD.range + 2 * TILE;
  const has = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && roads.has(y * W + x);
  const runs = (x: number, y: number, r: number) => { // separate road runs a Chebyshev ring crosses
    const p: boolean[] = [];
    for (let i = -r; i < r; i++) p.push(has(x + i, y - r));
    for (let i = -r; i < r; i++) p.push(has(x + r, y + i));
    for (let i = r; i > -r; i--) p.push(has(x + i, y + r));
    for (let i = r; i > -r; i--) p.push(has(x - r, y + i));
    let n = 0;
    for (let i = 0; i < p.length; i++) if (p[i] && !p[(i + p.length - 1) % p.length]) n++;
    return n;
  };
  const anchors: Anchor[] = [];
  for (const t of terr) if (t.capitalOf) anchors.push({ x: Math.floor(t.cx), y: Math.floor(t.cy), site: "capital", anchor: t.name, t: t.id });
  for (const b of BORDERS) for (const e of [b.a, b.b]) { const [x, y] = endPath(e)[0]; anchors.push({ x, y, site: "pass", anchor: b.id }); }
  for (const tw of TOWNS) anchors.push({ x: tw.gate.x, y: tw.gate.y, site: "town", anchor: tw.id });
  const junc: Anchor[] = [];
  for (const k of [...roads].sort((p, q) => p - q)) {
    const x = k % W, y = Math.floor(k / W);
    if (S.junctionRings.every((r) => runs(x, y, r) >= S.junctionRuns) && !junc.some((j) => Math.hypot(j.x - x, j.y - y) < S.junctionCluster))
      junc.push({ x, y, site: "junction", anchor: `${x},${y}` });
  }
  anchors.push(...junc);
  // per tile, once: can a fort's 7x7 clearing stand here (-1 no, else the outer ring's solid tiles)?
  const fit = new Int8Array(W * H).fill(-2), wide = new Int16Array(W * H);
  const fitAt = (tx: number, ty: number) => {
    const k = ty * W + tx;
    if (fit[k] !== -2) return fit[k];
    const x = (tx + 0.5) * TILE_, y = (ty + 0.5) * TILE_;
    let ring = 0, ok = !portals.some((p) => Math.hypot(p.x - tx, p.y - ty) < KEEP_CLEAR) && !std.some((s) => Math.hypot(s.x - x, s.y - y) <= ringPx);
    for (let dy = -HOLD_RADIUS; dy <= HOLD_RADIUS && ok; dy++) for (let dx = -HOLD_RADIUS; dx <= HOLD_RADIUS && ok; dx++) {
      if (has(tx + dx, ty + dy)) ok = false; // beside the road, never on it
      else if (solidAt((tx + dx + 0.5) * TILE_, (ty + dy + 0.5) * TILE_)) { if (Math.max(Math.abs(dx), Math.abs(dy)) <= 2) ok = false; else ring++; }
    }
    for (let dy = -S.roadClear; dy <= S.roadClear && ok; dy++) for (let dx = -S.roadClear; dx <= S.roadClear && ok; dx++) if (has(tx + dx, ty + dy)) ok = false;
    if (ok) { // ...but beside one: a road tile within roadNear
      let near = false;
      for (let dy = -S.roadNear; dy <= S.roadNear && !near; dy++) for (let dx = -S.roadNear; dx <= S.roadNear && !near; dx++) if (dx * dx + dy * dy <= S.roadNear * S.roadNear && has(tx + dx, ty + dy)) near = true;
      ok = near;
    }
    if (ok && TOWNS.some((g) => Math.max(Math.abs(g.gate.x - tx), Math.abs(g.gate.y - ty)) < S.gateClear)) ok = false;
    // the fort and its guards' band stay off safe ground, villages and towns (no soldier stands there: war/roads.ts roadOffLimits)
    const R1 = S.offLimits;
    for (let dy = -R1; dy <= R1 && ok; dy++) for (let dx = -R1; dx <= R1 && ok; dx++) {
      const px = (tx + dx + 0.5) * TILE_, py = (ty + dy + 0.5) * TILE_;
      if (safe(px, py) || village(px, py) || noMobs(px, py)) ok = false;
    }
    if (ok && ring <= S.ringSolid) for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++)
      if (Math.max(Math.abs(dx), Math.abs(dy)) > HOLD_RADIUS && solidAt((tx + dx + 0.5) * TILE_, (ty + dy + 0.5) * TILE_)) wide[k]++;
    if (ok && ring <= S.ringSolid && !bandWhole(tx, ty)) ok = false;
    return (fit[k] = ok && ring <= S.ringSolid ? ring : -1);
  };
  /** Is the open ground of the guards' band round (tx, ty) one piece (4-way, inside the band; small pockets aside)? */
  function bandWhole(tx: number, ty: number): boolean {
    const [r0, r1] = S.band, n = 2 * r1 + 1, open = new Uint8Array(n * n), seen = new Uint8Array(n * n);
    let total = 0;
    for (let dy = -r1; dy <= r1; dy++) for (let dx = -r1; dx <= r1; dx++)
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= r0 && !solidAt((tx + dx + 0.5) * TILE_, (ty + dy + 0.5) * TILE_)) { open[(dy + r1) * n + dx + r1] = 1; total++; }
    let big = 0;
    for (let i = 0; i < n * n; i++) {
      if (!open[i] || seen[i]) continue;
      let size = 0;
      const q = [i]; seen[i] = 1;
      while (q.length) {
        const j = q.pop()!, x = j % n, y = (j - x) / n;
        size++;
        for (const [ax, ay] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          const o = ay * n + ax;
          if (ax >= 0 && ay >= 0 && ax < n && ay < n && open[o] && !seen[o]) { seen[o] = 1; q.push(o); }
        }
      }
      big = Math.max(big, size);
    }
    return total - big <= S.bandPocket;
  }
  const holds: Hold[] = [], used = new Set<number>(), per: Record<string, number> = {};
  const spaced = (x: number, y: number) => holds.every((h) => Math.hypot(h.x - x, h.y - y) >= S.spacing * TILE_);
  const inner = (t: Land, x: number, y: number) => x >= t.x + E && y >= t.y + E && x < t.x + t.w - E && y < t.y + t.h - E;
  const free = (t: Land) => !warProof(t) && !used.has(t.id);
  const take = (t: Land, h: Hold) => { holds.push(h); used.add(t.id); per[t.region] = (per[t.region] ?? 0) + 1; };
  /** The best fort spot (px) in t's rect near tile (ax, ay); undefined: none fits. */
  const spot = (t: Land, ax: number, ay: number): { x: number; y: number } | undefined => {
    const patch = HOLD_PATCHES.get(t.name);
    if (patch && Math.hypot(patch.x - ax, patch.y - ay) <= S.patchReach && inner(t, patch.x, patch.y)) {
      const x = (patch.x + 0.5) * TILE_, y = (patch.y + 0.5) * TILE_;
      let clear = !portals.some((p) => Math.hypot(p.x - patch.x, p.y - patch.y) < KEEP_CLEAR) && std.every((s) => Math.hypot(s.x - x, s.y - y) > ringPx) && spaced(x, y);
      for (let dy = -2; dy <= 2 && clear; dy++) for (let dx = -2; dx <= 2; dx++) if (solidAt(x + dx * TILE_, y + dy * TILE_)) clear = false;
      if (clear) return { x, y };
    }
    let best: { x: number; y: number; sc: number } | undefined;
    for (let ty = Math.max(t.y + E, ay - S.farthest); ty < Math.min(t.y + t.h - E, ay + S.farthest + 1); ty++)
      for (let tx = Math.max(t.x + E, ax - S.farthest); tx < Math.min(t.x + t.w - E, ax + S.farthest + 1); tx++) {
        const d = Math.hypot(tx - ax, ty - ay);
        if (d > S.farthest) continue;
        const ring = fitAt(tx, ty);
        if (ring < 0) continue;
        const x = (tx + 0.5) * TILE_, y = (ty + 0.5) * TILE_;
        if (!spaced(x, y)) continue;
        const sc = -Math.max(0, Math.abs(d - S.best) - 1) * 2 - ring - wide[ty * W + tx] * S.wideSolid; // about `best` tiles off, then open ground
        if (!best || sc > best.sc) best = { x, y, sc };
      }
    return best && { x: best.x, y: best.y };
  };
  /** From a pass end or town gate, along the road (breadth first, at most `reach` steps) to the first tile inside a free land's rect. */
  const roadWalk = (ax: number, ay: number): [number, number] | undefined => {
    let sx = ax, sy = ay, bd = Infinity;
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (has(ax + dx, ay + dy) && Math.hypot(dx, dy) < bd) { bd = Math.hypot(dx, dy); sx = ax + dx; sy = ay + dy; }
    const ok = (x: number, y: number) => terr.some((t) => free(t) && inner(t, x, y));
    const seen = new Set([sy * W + sx]);
    let q: [number, number][] = [[sx, sy]];
    for (let step = 0; step <= S.reach && q.length; step++) {
      const nq: [number, number][] = [];
      for (const [x, y] of q) {
        if (ok(x, y)) return [x, y];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const k = (y + dy) * W + x + dx;
          if (has(x + dx, y + dy) && !seen.has(k)) { seen.add(k); nq.push([x + dx, y + dy]); }
        }
      }
      q = nq;
    }
    return undefined;
  };
  for (const a0 of anchors) {
    let a = a0;
    if (a.site === "capital") { // a capital's fort keeps the spot its Hold always had
      const m = musters.find((h) => h.t === a.t), t = terr[a.t!];
      if (m && free(t)) take(t, { ...m, site: a.site, anchor: a.anchor });
      continue;
    }
    if (a.site !== "junction") { const w = roadWalk(a.x, a.y); if (w) a = { ...a, x: w[0], y: w[1] }; }
    const reach = a.site === "junction" ? S.junctionReach : S.reach;
    const cands = terr.filter(free)
      .map((t) => ({ t, d: Math.hypot(Math.max(0, t.x - a.x, a.x - (t.x + t.w - 1)), Math.max(0, t.y - a.y, a.y - (t.y + t.h - 1))) }))
      .filter((c) => c.d <= reach).sort((p, q) => p.d - q.d || p.t.id - q.t.id);
    for (const { t } of cands) {
      if (a.site === "junction" && (per[t.region] ?? 0) >= (S.quota[t.region] ?? 0)) continue;
      const at = spot(t, a.x, a.y);
      if (at) { take(t, { t: t.id, ...at, site: a.site, anchor: a.anchor }); break; }
    }
  }
  holds.sort((p, q) => p.t - q.t);
  // a fortified land musters at its fort; the rest where their Holds stood before
  const byT = new Map(holds.map((h) => [h.t, h]));
  return { holds, musters: musters.map((m) => { const h = byT.get(m.t); return h ? { t: m.t, x: h.x, y: h.y } : m; }) };
}
const SITES = buildSites();
/** The forts (about 25-30, at most one per territory, none on war-proof land), beside capitals, passes, town gates and road junctions. */
export const HOLDS: Hold[] = SITES.holds;
/** One muster per territory (px): where its patrols start and end, so its siege fronts, marches, rituals and tunnels are reckoned from it. A fortified land's is its fort. */
export const MUSTERS: Hold[] = SITES.musters;
const HOLD_BY_T = new Map(HOLDS.map((h) => [h.t, h])), MUSTER_BY_T = new Map(MUSTERS.map((h) => [h.t, h]));
/** Territory t's fort, if it has one (only fortified lands have walls, a garrison, a banner to sack and tiers to show). */
export const holdOf = (t: number): Hold | undefined => HOLD_BY_T.get(t);
/** Territory t's muster: every land has one (unless the map left it no room at all). */
export const musterOf = (t: number): Hold | undefined => MUSTER_BY_T.get(t);


/** The standard whose ring holds this point (px), if any. */
export function standardAt(px: number, py: number): Standard | undefined {
  for (const s of STANDARDS) if (Math.hypot(s.x - px, s.y - py) <= STANDARD.range) return s;
  return undefined;
}

export const isClan = (v: unknown): v is ClanKey => typeof v === "string" && Object.prototype.hasOwnProperty.call(CLANS, v);

/** When a hero sworn at `at` may swear to another clan (0 = now). */
export const nextOathAt = (clan: ClanKey | undefined, at: number) => (clan ? at + STANDARD.swearCooldownMs : 0);
