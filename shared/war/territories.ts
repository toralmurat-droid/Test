/**
 * The war map: every monster zone of every land becomes a territory (Murat 2026-11-14), built from SPAWN_ZONES and the
 * lands of regions.ts. Borders run between zones of one land; lands meet only through their links (the Waygate, the Barrowgate, the Red Pass, the Sinkway,
 * the five Crownways).
 * A future land needs a region entry (with `contains` and its capitals) and a link: buildTerritories does the rest.
 * Sanctuaries never change hands and are not territories: villages (already outside every zone), dungeon floors,
 * quest-boss lairs (zones with no spawns of their own, or only their boss: the Throne Hall) and the broad wild zones (countryside, open desert, open moor, open badlands, open sinkholes, the open Crown)
 * where heroes level. Deterministic, like the map.
 */
import { actOfTile, type Act, BOSS, inDeepRow, UNDER_END, WORLD_H } from "../constants";
import { SPAWN_ZONES, type SpawnZone } from "../spawns";
import { CLAN_KEYS, type ClanKey } from "./clans";
import { capitalsOf, REGION_LINKS, REGIONS, type Region, type RegionLink } from "./regions";

export interface Territory {
  id: number;
  name: string; // = the spawn zone's name
  act: Act;
  /** The land it lies in (a REGIONS key): borders, starting shares and cart roads stay inside a land. */
  region: string;
  x: number; y: number; w: number; h: number; // tiles
  cx: number; cy: number; // centre, tiles
  /** Monster level band: the war is fought at the zone's level, so a meadow is a skirmish and a dune a hard front. */
  levels: [number, number];
  /** Set on a clan's capital: it never flips. */
  capitalOf?: ClanKey;
  /** A forward capital: the clan's homeland is not built yet (it becomes an ordinary territory when it is). */
  forward?: true;
  /** A `wards` land's gate territory (regions.ts): the clan it starts with, the home clan behind its gate. */
  wards?: ClanKey;
  /**
   * Never changes hands by war pressure: no clan may attack, besiege, sack or raid it (rules.ts targetsOf), so it is no
   * border to defend either. Only a Reckoning (Crown PR4) hands it on. The Crown Keep.
   */
  reckoningOnly?: true;
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
  const lair = Object.entries(z.mobs).every(([k, n]) => !n || BOSS[k as keyof typeof BOSS]); // no spawns, or only its boss (the Barrow-King's Mound)
  return underground || lair || !!z.wild;
}

const gap = (a: SpawnZone, b: SpawnZone) => Math.hypot(Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)), Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h)));

/** The lands that hold at least one territory. */
export const builtRegions = (ts: readonly Territory[]) => new Set(ts.map((t) => t.region));

/** The territory of land `region` nearest the tile (x, y), if the land has any. */
function nearestIn(ts: readonly Territory[], region: string, x: number, y: number): Territory | undefined {
  let best: Territory | undefined;
  for (const t of ts) if (t.region === region && (!best || Math.hypot(t.cx - x, t.cy - y) < Math.hypot(best.cx - x, best.cy - y))) best = t;
  return best;
}

/** The live links between lands as territory pairs: the territory nearest each end, for links whose lands are both built. */
export function linkPairs(ts: readonly Territory[], links: readonly RegionLink[] = REGION_LINKS): { link: RegionLink; a: number; b: number }[] {
  return links.flatMap((link) => {
    const a = nearestIn(ts, link.a, link.pa.x, link.pa.y), b = nearestIn(ts, link.b, link.pb.x, link.pb.y);
    return a && b ? [{ link, a: a.id, b: b.id }] : [];
  });
}

/**
 * The war map from these zones, lands and links. Zones outside every built land, and sanctuaries, are left out.
 * Exported so a test can plug in a land that is not built yet.
 */
export function buildTerritories(allZones: readonly SpawnZone[], regions: readonly Region[] = REGIONS, links: readonly RegionLink[] = REGION_LINKS): Territory[] {
  const placed = allZones.filter((z) => !isSanctuary(z)).map((z) => ({ z, r: regions.find((r) => r.contains?.(z.x + (z.w >> 1), z.y + (z.h >> 1))) }));
  const zones = placed.filter((p) => p.r).map((p) => p.z), regionOfZone = placed.filter((p) => p.r).map((p) => p.r!.key);
  const capital = capitalsOf(new Set(regionOfZone), regions);
  const out: Territory[] = zones.map((z, id) => {
    const cap = capital.get(z.name);
    const t: Territory = {
      id, name: z.name, act: actOfTile(z.x + (z.w >> 1), z.y + (z.h >> 1)), region: regionOfZone[id], x: z.x, y: z.y, w: z.w, h: z.h,
      cx: z.x + z.w / 2, cy: z.y + z.h / 2, levels: z.levels, capitalOf: cap?.clan, near: [],
    };
    if (cap?.forward) t.forward = true;
    if (regions.find((r) => r.key === t.region)?.reckoning?.includes(z.name)) t.reckoningOnly = true;
    return t;
  });
  const link = (a: number, b: number) => { if (a !== b && !out[a].near.includes(b)) { out[a].near.push(b); out[b].near.push(a); } };
  for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++)
    if (out[i].region === out[j].region && gap(zones[i], zones[j]) <= WAR_MAP.adjacentTiles) link(i, j);
  for (const t of out) {
    if (t.near.length >= WAR_MAP.minNeighbours) continue;
    const by = out.filter((o) => o.region === t.region && o.id !== t.id).sort((a, b) => Math.hypot(a.cx - t.cx, a.cy - t.cy) - Math.hypot(b.cx - t.cx, b.cy - t.cy));
    for (const o of by.slice(0, WAR_MAP.minNeighbours)) link(t.id, o.id);
  }
  // Lands meet through their links: the waygate joins the territory nearest Oakvale's south gate and the one nearest the Sunstone Circle
  for (const p of linkPairs(out, links)) {
    link(p.a, p.b);
    // a wards land's gate territory starts with the home clan of the land behind the gate (the first link wins)
    for (const [mine, other, land] of [[p.b, p.a, p.link.a], [p.a, p.b, p.link.b]] as const) {
      const r = regions.find((x) => x.key === out[mine].region), home = regions.find((x) => x.key === land)?.home;
      if (r?.wards && home && !out[mine].wards && !out[mine].capitalOf && !out[mine].reckoningOnly && out[other].region !== r.key) out[mine].wards = home;
    }
  }
  return out;
}

export const TERRITORIES: Territory[] = buildTerritories(SPAWN_ZONES);
/** The live links between lands on today's map (the war table draws them). */
export const LAND_LINKS = linkPairs(TERRITORIES);
export const territoryByName = (name: string) => TERRITORIES.find((t) => t.name === name);

/** The territories of `wards` lands (the Crown): claimed after every homeland, so those lands start as before. */
const inWardsLand = (ts: readonly Territory[], regions: readonly Region[] = REGIONS) => {
  const wl = new Set(regions.filter((r) => r.wards).map((r) => r.key));
  return ts.map((t) => wl.has(t.region));
};
/** The clan holding the least land (ties: CLAN_KEYS order), the holder a Reckoning-only territory starts with. */
export function leastLanded(owner: readonly (ClanKey | undefined)[]): ClanKey {
  const count = (k: ClanKey) => owner.filter((o) => o === k).length;
  return CLAN_KEYS.reduce((a, b) => (count(b) < count(a) ? b : a));
}

/**
 * Who holds what at the very start: clans take turns (the one with the least land first) claiming an unclaimed
 * territory next to their land in the same land (region), so every clan starts with a connected share around its capitals (as even as the map allows: 12/15/15/10/10 in the homelands today, Wardens to Veiled).
 * The `wards` lands come after: their gate territories with their wardens, the rest claimed the same way (the clans with
 * the least land first, so the Crown evens the shares out a little), and a Reckoning-only territory (the Crown Keep) last,
 * with the clan holding the least land of all. `preset`: holders already known (a saved war on an older map,
 * server/war.ts migrateWar); only the territories it leaves unset are claimed.
 */
export function initialOwners(ts: readonly Territory[] = TERRITORIES, preset?: readonly (ClanKey | undefined)[]): ClanKey[] {
  const wardsLand = inWardsLand(ts);
  const owner: (ClanKey | undefined)[] = ts.map((t, i) => preset?.[i] ?? t.capitalOf);
  const count = (k: ClanKey) => owner.filter((o) => o === k).length;
  const claim = (open: (t: Territory) => boolean) => {
    for (;;) {
      let claimed = false;
      for (const k of [...CLAN_KEYS].sort((a, b) => count(a) - count(b))) {
        const free = ts.find((t) => owner[t.id] === k && t.near.some((n) => !owner[n] && open(ts[n]) && ts[n].region === t.region));
        if (!free) continue;
        const n = free.near.find((m) => !owner[m] && open(ts[m]) && ts[m].region === free.region)!;
        owner[n] = k; claimed = true;
        break;
      }
      if (!claimed) break;
    }
  };
  claim((t) => !wardsLand[t.id]);
  for (const t of ts) if (wardsLand[t.id] && !owner[t.id] && t.wards) owner[t.id] = t.wards;
  claim((t) => wardsLand[t.id] && !t.reckoningOnly);
  for (const t of ts) if (t.reckoningOnly && !owner[t.id]) owner[t.id] = leastLanded(owner);
  return owner.map((o, i) => o ?? CLAN_KEYS[i % CLAN_KEYS.length]);
}
