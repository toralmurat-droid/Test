/**
 * The lands of the Riven Marches (design: play.fmtpa.ch/design/riven-marches/, Murat 2026-11-14: one continent, the
 * acts are regions of it). Each land groups its territories on the war map: borders are drawn inside a land, and lands
 * meet only through REGION_LINKS (the border roads). A land is built when at least one war territory lies in it.
 * The homelands of the Host, Redfang and Hide-Kin were planned before they were built: until one was, its clan held
 * forward capitals in the built lands, which turned into ordinary territories once the homeland (with its own capital)
 * was built. All three are built now, so no forward capital is held; the mechanism stays for the lands to come.
 * The Crown of the Marches (Act 6) is nobody's homeland and has no capital: it is a `wards` land, where each territory a
 * gate leads into starts with the clan whose homeland lies behind that gate, and its Keep is `reckoning` ground.
 * Pure data, deterministic: territories.ts builds the war map from it.
 */
import { actOfTile } from "../constants";
import { WAYGATE_DESERT, WAYGATE_OAKVALE } from "../desert";
import { MOORSGATE_MOORS, MOORSGATE_OAKVALE } from "../moors";
import { REDPASS_BADLANDS, REDPASS_OAKVALE } from "../badlands";
import { SINKWAY_OAKVALE, SINKWAY_SINKHOLES } from "../sinkholes";
import { crownGateTile, CROWNWAYS } from "../crown";
import { BORDERS, edgeTile } from "../borders";
import type { ClanKey } from "./clans";

export type RegionKey = "oakvale" | "sunscar" | "moors" | "badlands" | "sinkholes" | "crown";

/** A capital zone (a SPAWN_ZONES name). `forward`: held only while the clan's home region is unbuilt. */
export interface Capital { clan: ClanKey; zone: string; forward?: boolean }

export interface Region {
  key: string;
  name: string;
  /** Where the land lies on the continent (the design page's sketch). */
  compass: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | "C";
  /** The clan whose homeland this is. */
  home?: ClanKey;
  /** Is this tile in the land? Unset while the land is not built. Checked in REGIONS order: the first match wins. */
  contains?: (tx: number, ty: number) => boolean;
  capitals: Capital[];
  /**
   * A neutral land (no home, no capital): each territory at a link's end in it starts held by the home clan of the land
   * on the link's other side (the gate's warden), and the rest of it is claimed after every homeland (initialOwners).
   */
  wards?: true;
  /** Zones that never change hands by war pressure (no attack, siege, sack or raid): they flip only at a Reckoning (Crown PR4). */
  reckoning?: string[];
  /**
   * The land's war-free heartland (coherence review, Murat 2026-11-20): its zones up to this monster level stay with the
   * home clan for good, no clan may strike them, so new heroes level in peace and the war comes only to the rim. A zone
   * at the end of a border road never is one (the road's front would be dead).
   */
  haven?: { maxLevel: number };
}

/** A way between two lands; pa / pb are its ends in each land (tiles): the territories nearest them border each other. */
export interface RegionLink { a: string; b: string; name: string; pa: { x: number; y: number }; pb: { x: number; y: number } }

export const REGIONS: Region[] = [
  { key: "oakvale", name: "The Oakvale Lands", compass: "NW", home: "wardens", contains: (x, y) => actOfTile(x, y) === 1, capitals: [
    { clan: "wardens", zone: "Goldenreach Farms" },
    { clan: "redfang", zone: "Redfang Hollow", forward: true },
    { clan: "host", zone: "Greywatch Keep", forward: true },
    { clan: "hidekin", zone: "Thornwood", forward: true },
    // (Cinder Scar, the Stormbreak Crags and Heronwreck Strand were the Veiled's, Host's and Redfang's footholds here:
    // gone with the coherence review, Murat 2026-11-20. Each clan keeps one capital, in its own homeland.)
  ], haven: { maxLevel: 12 } },
  { key: "sunscar", name: "The Sunscar", compass: "SE", home: "veiled", contains: (x, y) => actOfTile(x, y) === 2, capitals: [
    { clan: "redfang", zone: "Dustrider Camp", forward: true },
    { clan: "host", zone: "Kharsun, the Buried City", forward: true },
    { clan: "hidekin", zone: "The Humpback Mesas", forward: true },
    { clan: "veiled", zone: "The Veiled Sanctum" },
  ] },
  // The Host's homeland (Act 3): its seat is the war camp on the far eastern moor. Built, so Greywatch Keep and Kharsun
  // step down to ordinary territories (capitalsOf); whoever holds them keeps them.
  { key: "moors", name: "The Grey Barrow Moors", compass: "NE", home: "host", contains: (x, y) => actOfTile(x, y) === 3, capitals: [
    { clan: "host", zone: "The Host's Muster" },
  ] },
  // Redfang's homeland (Act 4): its seat is Fangrock, the clan's stockade in the far west (Old Rourke's keep inside is a
  // lair, not a territory). Built, so Redfang Hollow and Dustrider Camp step down to ordinary territories (capitalsOf).
  // The Rustwater Post lies outside every zone: a safe hub and no territory, like Cairnwatch; since W6 a capturable town that follows The Saltlick Flats (shared/war/towns.ts), never fought in.
  { key: "badlands", name: "The Red Badlands", compass: "W", home: "redfang", contains: (x, y) => actOfTile(x, y) === 4, capitals: [
    { clan: "redfang", zone: "Fangrock" },
  ] },
  // The Hide-Kin's homeland (Act 5): their seat is Hidehall, the warren town in the far south-east (the Maw-Father's
  // ledge in the Great Maw is a lair, not a territory). Built, so Thornwood and the Humpback Mesas step down to ordinary
  // territories (capitalsOf): no forward capitals are left. Ropewell lies outside every zone: a safe hub and no territory; since W6 a capturable town that follows Rootfall Slopes (shared/war/towns.ts), never fought in.
  { key: "sinkholes", name: "The Mawdeep Sinkholes", compass: "S", home: "hidekin", contains: (x, y) => actOfTile(x, y) === 5, capitals: [
    { clan: "hidekin", zone: "Hidehall" },
  ] },
  // The Crown of the Marches (Act 6, shared/crown.ts): neutral ground in the middle, no home and no capital. Its five
  // approaches start with the clans whose Crownways lead into them (`wards`); the Crown Keep's bailey starts with the clan
  // holding the least land and never falls to the armies: only a Reckoning (Crown PR4) hands it on.
  { key: "crown", name: "The Crown of the Marches", compass: "C", contains: (x, y) => actOfTile(x, y) === 6, capitals: [], wards: true, reckoning: ["The Crown Keep"] },
];

/**
 * The gates between lands (waygates, passes, the Sinkway, the five Crownways). Since the coherence review (Murat
 * 2026-11-20) they are travel shortcuts only: heroes route through them (client/src/warRoute.ts), the war does not.
 */
export const GATE_LINKS: RegionLink[] = [
  { a: "oakvale", b: "sunscar", name: "The Waygate", pa: WAYGATE_OAKVALE, pb: WAYGATE_DESERT },
  { a: "oakvale", b: "moors", name: "The Barrowgate", pa: MOORSGATE_OAKVALE, pb: MOORSGATE_MOORS },
  { a: "oakvale", b: "badlands", name: "The Red Pass", pa: REDPASS_OAKVALE, pb: REDPASS_BADLANDS },
  { a: "oakvale", b: "sinkholes", name: "The Sinkway", pa: SINKWAY_OAKVALE, pb: SINKWAY_SINKHOLES },
  ...CROWNWAYS.map((c): RegionLink => ({ a: c.from, b: "crown", name: c.name, pa: c.home, pb: crownGateTile(c) })),
];

/** The land key of each act (shared/borders.ts names lands by act). */
export const ACT_REGION: Record<number, RegionKey> = { 1: "oakvale", 2: "sunscar", 3: "moors", 4: "badlands", 5: "sinkholes", 6: "crown" };

/**
 * Ways between lands for the war: the walkable border roads (shared/borders.ts), so war fronts run where heroes walk
 * (coherence review, Murat 2026-11-20). pa / pb are each road's edge tile in its land, where the crossing is. A link is
 * live only while both of its lands are built. Order follows BORDERS.
 */
export const REGION_LINKS: RegionLink[] = BORDERS.map((b): RegionLink => {
  const [ax, ay] = edgeTile(b.a), [bx, by] = edgeTile(b.b);
  return { a: ACT_REGION[b.a.land], b: ACT_REGION[b.b.land], name: b.name, pa: { x: ax, y: ay }, pb: { x: bx, y: by } };
});

/** The land a tile lies in (built lands only). */
export function regionOf(tx: number, ty: number, regions: readonly Region[] = REGIONS): Region | undefined {
  return regions.find((r) => r.contains?.(tx, ty));
}
export const regionByKey = (key: string, regions: readonly Region[] = REGIONS) => regions.find((r) => r.key === key);
export const regionName = (key: string) => regionByKey(key)?.name ?? key;

/**
 * Zone name -> its capital, for the built lands `built`: a forward capital drops out once its clan's homeland is built.
 * A zone named twice keeps the first entry.
 */
export function capitalsOf(built: ReadonlySet<string>, regions: readonly Region[] = REGIONS): Map<string, Capital> {
  const homeBuilt = (k: ClanKey) => regions.some((r) => r.home === k && built.has(r.key));
  const out = new Map<string, Capital>();
  for (const r of regions) {
    if (!built.has(r.key)) continue;
    for (const c of r.capitals) if (!(c.forward && homeBuilt(c.clan)) && !out.has(c.zone)) out.set(c.zone, c);
  }
  return out;
}
