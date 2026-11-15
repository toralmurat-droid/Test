/**
 * Hide-Kin tunnels in the world (roadmap M2). In the war rules (rules.ts) a clan with the tunnel doctrine strikes land two
 * borders away: an attack on a target with none of its own land next to it goes through a tunnel that starts at its land
 * behind. Here those strikes become places: a tunnel mouth at the target land's edge facing the start, from which
 * Hide-Kin soldiers come out in waves when a hero is near (server/warTunnels.ts). Heroes hostile to the Hide-Kin
 * collapse it for valor; Hide-Kin heroes who stand by it earn valor in the land. The mouth is a "trooper" with weapon
 * "<clan>~" (troops.ts parseTroop part "mouth", an object), so every trooper gate holds. Pure rules, spots and numbers.
 */
import { MAP_W, TILE } from "../constants";
import { WAYGATE_DESERT, WAYGATE_OAKVALE } from "../desert";
import { CRYPT_DOOR, LINKS, SINKHOLE, UNDER_SHAFT, underground } from "../dungeon";
import { DOORS, isSolidAt, PORTAL_SPOTS, SHRINE_SPOT } from "../map";
import { NPC_DECOR, NPCS } from "../npcs";
import { BOARDS } from "../bounty";
import { caravanOffLimits } from "./caravans";
import { CLANS, CLAN_KEYS, type ClanKey } from "./clans";
import { patrolOf } from "./patrols";
import { cleanOrders, supplyMap, targetsOf, type Orders, type WarState } from "./rules";
import { anyHoldWall, holdReachPx } from "./holdWalls";
import { HOLDS, STANDARD, STANDARDS } from "./standards";
import { TERRITORIES } from "./territories";
import { troopStats } from "./troops";

export const TUNNEL = {
  /** Master switch: off, no mouth ever opens. */
  live: true,
  /** A mouth opens when a living hero above ground is this close to its spot (tiles)... */
  wakeTiles: 22,
  /** ...and closes again (keeping its wounds) after this long with no hero that close. */
  sleepMs: 30_000,
  /** Soldiers that come out of the mouth per wave (the first wave as it opens). */
  perWave: 3,
  /** A new wave every this long while the mouth stands, filling up to maxTunnelTroops. */
  waveMs: 40_000,
  /** Tunnel monsters (the mouth included) alive in one room at most. */
  maxTunnelTroops: 10,
  /** The mouth's hit points: a Hide-Kin soldier's at the land's soldier level times this. It has no attack. */
  mouthHp: 3,
  /** After a collapse the soldiers fight on this long round the rubble, then go back down. */
  scatterMs: 6000,
  /** Soldiers fight anything within this of the mouth (px); wild monsters only when one strikes first. */
  leashPx: 7 * TILE,
  /** Soldiers stand in a ring this far from the mouth (px) when nothing is to be fought. */
  ringPx: 40,
  /** A hero hostile to the Hide-Kin who collapses the mouth: valor for their clan in the land (if the war lets it fight there), renown for them. */
  collapseValor: 6, collapseRenown: 10,
  /** Holding: every valorEveryMs the mouth stands with an active Hide-Kin-sworn hero within holdPx, mouthValor for the Hide-Kin there... */
  valorEveryMs: 60_000, mouthValor: 2, holdPx: 3 * TILE,
  /** ...at most this much per land per room per war tick. */
  maxValorPerTick: 10,
  /** Mouth spot: this many tiles in from the land's edge toward the start, searched outward up to searchTiles. */
  edgeTiles: 4, searchTiles: 12,
  /** ...and at least this many tiles from every landmark (tunnelLandmarks: people, props, entrances, waygates, the shrine, boards). */
  keepTiles: 4,
};

/** A tunnel strike this war tick: target land t, reached from own land `from` (two borders back), by clan `clan`. */
export interface TunnelStrike { t: number; from: number; clan: ClanKey }

/**
 * The attacks of the last orders that go through a tunnel, as rules.ts warTick decides them: a clan with the tunnel
 * doctrine, a legal target (targetsOf) with a share, and none of its own land next to it. `from` is the own land two
 * borders back with the best supply (the one rules.ts feeds the strike from; first in near order on a tie).
 */
export function tunnelStrikes(st: WarState, orders: Partial<Record<ClanKey, Orders>> | undefined): TunnelStrike[] {
  if (!orders) return [];
  const out: TunnelStrike[] = [];
  let supply: number[] | undefined;
  for (const k of CLAN_KEYS) {
    if (CLANS[k].doctrine !== "tunnel" || !orders[k]) continue;
    const o = cleanOrders(orders[k]), legal = new Set(targetsOf(st, k)), seen = new Set<number>();
    for (const a of o.attack) {
      const T = TERRITORIES[a.t];
      if (!T || seen.has(a.t) || !legal.has(a.t) || !(a.share > 0) || T.near.some((n) => st.owner[n] === k)) continue;
      supply ??= supplyMap(st);
      let from = -1;
      for (const n of T.near) for (const m of TERRITORIES[n].near) if (st.owner[m] === k && (from < 0 || supply[m] > supply[from])) from = m;
      if (from < 0) continue;
      seen.add(a.t);
      out.push({ t: a.t, from, clan: k });
    }
  }
  return out;
}

/** The tunnel's soldiers' level and the mouth's hit points in land t (a soldier of `clan` at that level x mouthHp). */
export const mouthHp = (clan: ClanKey, level: number) => Math.round(troopStats(clan, level).hp * TUNNEL.mouthHp);

let doorTiles: Set<number> | undefined;
const nearDoor = (tx: number, ty: number) => {
  if (!doorTiles) { doorTiles = new Set(); for (const d of DOORS) for (const k of d.tiles) doorTiles.add(k); }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (doorTiles.has((ty + dy) * MAP_W + tx + dx)) return true;
  return false;
};
let marks: { x: number; y: number }[] | undefined;
/**
 * Overworld spots a mouth keeps TUNNEL.keepTiles from (tile units, fractional): NPCs and their props, the entrances
 * below ground (every above-ground stair or rope, the sinkhole, the crypt door, the well-shaft), both waygates, the shrine
 * and the bounty boards. Portal stones keep a wider berth (6 tiles, like the standards).
 */
export function tunnelLandmarks(): { x: number; y: number }[] {
  if (!marks) {
    const t = (p: { x: number; y: number }) => ({ x: p.x, y: p.y }), px = (p: { x: number; y: number }) => ({ x: p.x / TILE, y: p.y / TILE });
    marks = [...NPCS.map(px), ...NPC_DECOR.map(t), ...LINKS.filter((l) => !underground(l.y)).map(px), ...BOARDS.map(px),
      ...[SINKHOLE, CRYPT_DOOR, UNDER_SHAFT, WAYGATE_OAKVALE, WAYGATE_DESERT, SHRINE_SPOT].map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }))];
  }
  return marks;
}
/** Tile (tx, ty) can carry a mouth: its 3x3 free of solids and of any clan's Hold walls, not off limits (safe squares, stockade, monster-free ground), no door, no portal stone or landmark near. */
function clearTile(tx: number, ty: number): boolean {
  if (nearDoor(tx, ty) || PORTAL_SPOTS.some((p) => Math.hypot(p.x - tx, p.y - ty) < 6)) return false;
  if (tunnelLandmarks().some((p) => Math.hypot(p.x - (tx + 0.5), p.y - (ty + 0.5)) < TUNNEL.keepTiles)) return false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = (tx + dx + 0.5) * TILE, y = (ty + dy + 0.5) * TILE;
    if (isSolidAt(x, y) || caravanOffLimits(x, y) || anyHoldWall(tx + dx, ty + dy)) return false;
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

const mouthCache = new Map<string, { x: number; y: number } | undefined>();
/**
 * Where the tunnel from own land `from` breaks out in target land t (px, a tile centre): free walkable ground near t's
 * edge facing `from`, inside t's rect, clear of solid tiles, portal stones, landmarks, safe squares, dungeon doors, every
 * Hold's fort and every standard's ring (territory rects overlap: a neighbour's Hold can stand inside t), and reachable on foot from t's Hold gate. Deterministic (the map alone), cached; undefined
 * when the land has no such ground.
 */
export function tunnelMouth(t: number, from: number): { x: number; y: number } | undefined {
  const key = `${t}-${from}`;
  if (mouthCache.has(key)) return mouthCache.get(key);
  const T = TERRITORIES[t], F = TERRITORIES[from], reach = reachOf(t);
  let best: { x: number; y: number } | undefined;
  if (T && F && reach && t !== from) {
    const dx0 = F.cx - T.cx, dy0 = F.cy - T.cy, L = Math.hypot(dx0, dy0) || 1, ux = dx0 / L, uy = dy0 / L;
    // from the middle toward `from` until edgeTiles short of the rect's edge
    const fx = ux ? (ux > 0 ? T.x + T.w - T.cx : T.cx - T.x) / Math.abs(ux) : Infinity, fy = uy ? (uy > 0 ? T.y + T.h - T.cy : T.cy - T.y) / Math.abs(uy) : Infinity;
    const reachTo = Math.max(0, Math.min(fx, fy) - TUNNEL.edgeTiles);
    const ex = T.cx + ux * reachTo, ey = T.cy + uy * reachTo;
    const ok = (tx: number, ty: number, strict: boolean) => {
      if (tx < T.x + 1 || ty < T.y + 1 || tx >= T.x + T.w - 1 || ty >= T.y + T.h - 1 || !reach.has(ty * MAP_W + tx)) return false;
      if ((tx + 0.5 - T.cx) * ux + (ty + 0.5 - T.cy) * uy <= 0) return false; // on the side facing `from`
      if (!clearTile(tx, ty)) return false;
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
      if (HOLDS.some((h) => Math.max(Math.abs(h.x - x), Math.abs(h.y - y)) < holdReachPx(h.t) + (strict ? 2 * TILE : 0))) return false; // (clearTile keeps it off the walls)
      return !STANDARDS.some((s) => Math.hypot(s.x - x, s.y - y) < STANDARD.range + (strict ? 2 * TILE : TILE));
    };
    for (const strict of [true, false]) {
      let bd = Infinity;
      const cx = Math.floor(ex), cy = Math.floor(ey), R = TUNNEL.searchTiles;
      for (let r = 0; r <= R && bd === Infinity; r++)
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !ok(cx + dx, cy + dy, strict)) continue;
          const d = Math.hypot(cx + dx + 0.5 - ex, cy + dy + 0.5 - ey);
          if (d < bd) { bd = d; best = { x: (cx + dx + 0.5) * TILE, y: (cy + dy + 0.5) * TILE }; }
        }
      if (best) break;
      // nothing near the edge point: any good tile on that side, the nearest to it
      for (let ty = T.y + 1; ty < T.y + T.h - 1; ty++) for (let tx = T.x + 1; tx < T.x + T.w - 1; tx++) {
        if (!ok(tx, ty, strict)) continue;
        const d = Math.hypot(tx + 0.5 - ex, ty + 0.5 - ey);
        if (d < bd) { bd = d; best = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }; }
      }
      if (best) break;
    }
  }
  mouthCache.set(key, best);
  return best;
}

/** Every (target, start) pair a tunnel could ever join: own land two borders from the target, not next to it. */
export function tunnelPairs(): { t: number; from: number }[] {
  const out: { t: number; from: number }[] = [];
  for (const T of TERRITORIES) {
    const seen = new Set<number>();
    for (const n of T.near) for (const m of TERRITORIES[n].near)
      if (m !== T.id && !T.near.includes(m) && !seen.has(m)) { seen.add(m); out.push({ t: T.id, from: m }); }
  }
  return out;
}

/** One mouth for the clients ("tunnels" message, a war-table marker): `open` stands now, `shut` collapsed this war tick, `dormant` no hero near. */
export interface MouthView { t: number; x: number; y: number; state: "open" | "shut" | "dormant" }
export interface TunnelsView { mouths: MouthView[] }
