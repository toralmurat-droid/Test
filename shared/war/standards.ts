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

/** The standard whose ring holds this point (px), if any. */
export function standardAt(px: number, py: number): Standard | undefined {
  for (const s of STANDARDS) if (Math.hypot(s.x - px, s.y - py) <= STANDARD.range) return s;
  return undefined;
}

export const isClan = (v: unknown): v is ClanKey => typeof v === "string" && Object.prototype.hasOwnProperty.call(CLANS, v);

/** When a hero sworn at `at` may swear to another clan (0 = now). */
export const nextOathAt = (clan: ClanKey | undefined, at: number) => (clan ? at + STANDARD.swearCooldownMs : 0);
