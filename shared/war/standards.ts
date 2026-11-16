/**
 * Standards and swearing (roadmap M1): a hero sworn to a clan who stands in a standard's ring adds valor to the war
 * there (server/war.ts addValor -> rules.ts valorForce): for the holder it defends, for a clan that can reach the
 * land it attacks. Standards sit on free ground inside each territory, the same on server and client (from the map).
 */
import { TILE } from "../constants";
import { isSolidAt, PORTAL_SPOTS } from "../map";
import { CLANS, type ClanKey } from "./clans";
import { TERRITORIES } from "./territories";

export const STANDARD = {
  /** Ring radius (px): stand inside to hold the standard. */
  range: 3 * TILE,
  /** Valor a hero brings per minute in a ring (WAR.valorPerAdd caps one report). */
  valorPerMin: 1,
  /** Heroes below this level cannot swear (the war is for heroes who know the world a little). */
  minLevel: 5,
  /** Changing clan after the first oath waits this long. */
  swearCooldownMs: 24 * 60 * 60_000,
  /** A hero who has not moved, attacked or cast for this long adds nothing (no parking a hero in a ring). */
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

/** A walkable spot near (tx, ty) inside territory `t`'s rect, with a little room around it. */
function freeSpot(t: (typeof TERRITORIES)[number], tx: number, ty: number): { x: number; y: number } | undefined {
  const free = (x: number, y: number) => {
    if (x < t.x + 1 || y < t.y + 1 || x >= t.x + t.w - 1 || y >= t.y + t.h - 1) return false;
    if (PORTAL_SPOTS.some((p) => Math.hypot(p.x - x, p.y - y) < KEEP_CLEAR)) return false; // its own E prompt there
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


export interface Hold { t: number; x: number; y: number }
/** Tiles round its middle a Hold's placement keeps clear (each clan's fort plan is in shared/war/holdWalls.ts). */
export const HOLD_RADIUS = 3;
/** Half-size in px of the 7x7 clearing a Hold is placed on. The forts themselves differ by clan and are bigger: troops, guards, rituals and tunnels keep outside holdWalls.ts holdReachPx. */
export const HOLD_FORT_PX = (HOLD_RADIUS + 0.5) * TILE;
/** Where each territory's Hold stands (px, the middle of its fort). */
function buildHolds(): Hold[] {
  const out: Hold[] = [];
  // local copies: under tsx (the tests) each use of an import is a getter call, slow in these tile loops
  const TILE_ = TILE, solidAt = isSolidAt, portals = PORTAL_SPOTS;
  const INNER = 2; // the inner 5x5 must hold no solid tile at all: the ground layer paints over map objects there
  for (const t of TERRITORIES) {
    const mine = STANDARDS.filter((s) => s.t === t.id);
    let best: { x: number; y: number; score: number } | undefined;
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
export const HOLDS: Hold[] = buildHolds();

/** The standard whose ring holds this point (px), if any. */
export function standardAt(px: number, py: number): Standard | undefined {
  for (const s of STANDARDS) if (Math.hypot(s.x - px, s.y - py) <= STANDARD.range) return s;
  return undefined;
}

export const isClan = (v: unknown): v is ClanKey => typeof v === "string" && Object.prototype.hasOwnProperty.call(CLANS, v);

/** When a hero sworn at `at` may swear to another clan (0 = now). */
export const nextOathAt = (clan: ClanKey | undefined, at: number) => (clan ? at + STANDARD.swearCooldownMs : 0);
