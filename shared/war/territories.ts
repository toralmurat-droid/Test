/**
 * The war map: every monster zone of every act becomes a territory (Murat 2026-11-14), built from SPAWN_ZONES so a
 * future act's zones join the war by themselves. Sanctuaries never change hands and are not territories: villages
 * (already outside every zone), dungeon floors, quest-boss lairs (zones with no spawns of their own) and the broad
 * wild zones (countryside, open desert) where new heroes level. Deterministic, like the map.
 */
import { actOfTile, inDeepRow, UNDER_END, WORLD_H } from "../constants";
import { SPAWN_ZONES, type SpawnZone } from "../spawns";
import { CLAN_KEYS, CLANS, type ClanKey } from "./clans";

export interface Territory {
  id: number;
  name: string; // = the spawn zone's name
  act: 1 | 2;
  x: number; y: number; w: number; h: number; // tiles
  cx: number; cy: number; // centre, tiles
  /** Monster level band: the war is fought at the zone's level, so a meadow is a skirmish and a dune a hard front. */
  levels: [number, number];
  /** Set on a clan's capital: it never flips. */
  capitalOf?: ClanKey;
  /** Ids of territories close enough to fight over (gap between the zones' rects <= WAR_MAP.adjacentTiles). */
  near: number[];
}

export const WAR_MAP = {
  adjacentTiles: 22, // zones whose rects are at most this far apart share a border
  minNeighbours: 2, // a zone left with fewer gets linked to its nearest ones, so no territory is an island
};

/** True for zones the war leaves alone (see the module comment). */
export function isSanctuary(z: SpawnZone): boolean {
  const underground = (z.y >= WORLD_H && z.y < UNDER_END) || inDeepRow(z.y);
  const lair = Object.values(z.mobs).every((n) => !n);
  return underground || lair || !!z.wild;
}

const gap = (a: SpawnZone, b: SpawnZone) => Math.hypot(Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)), Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h)));

function build(): Territory[] {
  const zones = SPAWN_ZONES.filter((z) => !isSanctuary(z));
  const capital = new Map<string, ClanKey>();
  for (const k of CLAN_KEYS) for (const n of Object.values(CLANS[k].capitals)) capital.set(n, k);
  const out: Territory[] = zones.map((z, id) => ({
    id, name: z.name, act: actOfTile(z.x + (z.w >> 1), z.y + (z.h >> 1)), x: z.x, y: z.y, w: z.w, h: z.h,
    cx: z.x + z.w / 2, cy: z.y + z.h / 2, levels: z.levels, capitalOf: capital.get(z.name), near: [],
  }));
  const link = (a: number, b: number) => { if (a !== b && !out[a].near.includes(b)) { out[a].near.push(b); out[b].near.push(a); } };
  for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++)
    if (out[i].act === out[j].act && gap(zones[i], zones[j]) <= WAR_MAP.adjacentTiles) link(i, j);
  for (const t of out) {
    if (t.near.length >= WAR_MAP.minNeighbours) continue;
    const by = out.filter((o) => o.act === t.act && o.id !== t.id).sort((a, b) => Math.hypot(a.cx - t.cx, a.cy - t.cy) - Math.hypot(b.cx - t.cx, b.cy - t.cy));
    for (const o of by.slice(0, WAR_MAP.minNeighbours)) link(t.id, o.id);
  }
  // The waygate joins the acts: the Act 1 territory nearest Oakvale's south gate and the Act 2 one nearest the Sunstone Circle
  const a1 = out.filter((t) => t.act === 1), a2 = out.filter((t) => t.act === 2);
  if (a1.length && a2.length) {
    const near = (ts: Territory[], x: number, y: number) => ts.reduce((b, t) => (Math.hypot(t.cx - x, t.cy - y) < Math.hypot(b.cx - x, b.cy - y) ? t : b));
    link(near(a1, 92, 79).id, near(a2, a2[0].cx, a2[0].cy).id);
  }
  return out;
}

export const TERRITORIES: Territory[] = build();
export const territoryByName = (name: string) => TERRITORIES.find((t) => t.name === name);

/**
 * Who holds what at the very start: clans take turns (the one with the least land first) claiming an unclaimed
 * territory next to their land in the same act, so every clan starts with a fair, connected share around its capitals.
 */
export function initialOwners(): ClanKey[] {
  const owner: (ClanKey | undefined)[] = TERRITORIES.map((t) => t.capitalOf);
  const count = (k: ClanKey) => owner.filter((o) => o === k).length;
  for (;;) {
    let claimed = false;
    for (const k of [...CLAN_KEYS].sort((a, b) => count(a) - count(b))) {
      const free = TERRITORIES.find((t) => owner[t.id] === k && t.near.some((n) => !owner[n] && TERRITORIES[n].act === t.act));
      if (!free) continue;
      const n = free.near.find((m) => !owner[m] && TERRITORIES[m].act === free.act)!;
      owner[n] = k; claimed = true;
      break;
    }
    if (!claimed) break;
  }
  return owner.map((o, i) => o ?? CLAN_KEYS[i % CLAN_KEYS.length]);
}
