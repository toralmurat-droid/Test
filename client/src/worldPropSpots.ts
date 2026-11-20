import { TILE } from "../../shared/constants";
import { AREAS, BARNS, ELEMENT_LANDS, EMPTY, GROUND, HOLLOW, HOLLOW_WARDS, OBJECTS, SIGNPOSTS, T, VILLAGE, WRECK } from "../../shared/map";
import { CAMP_TOWERS } from "../../shared/bandits";
import { NPCS, NPC_DECOR } from "../../shared/npcs";
import { CHESTS } from "../../shared/chests";
import { SIEGE_SITES } from "../../shared/siege";
import { COW_FOOT_U, COW_FOOT_V } from "./farmArt";
import { MILL_FOOT_U, MILL_FOOT_V } from "./millArt";

/**
 * Where worldProps.ts stands its props (deterministic, the same on every client). Phaser-free, so the land kits
 * (landKit.ts) and their tests can keep clear of these spots.
 */
export type Kind = "wp_hollow_throne" | "wp_crownstone0" | "wp_crownstone1" | "wp_crownstone2" | "wp_shipwreck" | "wp_spear_rack" | "wp_pennant_red" | "wp_pennant_black" | "wp_dummy" | "wp_lantern_pole" | "wp_skull_pike" | "wp_net_rack" | "wp_spears_ground" | "wp_watchtower" | "wp_millwheel" | "wp_cow0" | "wp_cow1"
  | "wp_venom_caps" | "wp_ice_spikes" | "wp_ember_vent" | "wp_storm_stone";
export interface Spot { kind: Kind; x: number; y: number; flip?: boolean; depth?: number }

export const hash = (x: number, y: number, s: number) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const BAD_GROUND = new Set<number>([T.WATER, T.COBBLE, T.BRIDGE, T.CROPS, T.FIELD]);

/** Free tile for a standing prop: nothing on it or right around it, not on a road or in water, away from NPCs and chests. */
function free(tx: number, ty: number, taken: Spot[], gap: number): boolean {
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const o = OBJECTS[ty + j]?.[tx + i], g = GROUND[ty + j]?.[tx + i];
    if (o === undefined || o !== EMPTY || (i === 0 && j === 0 && BAD_GROUND.has(g)) || g === T.WATER) return false;
  }
  const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
  if (taken.some((s) => Math.hypot(s.x - cx, s.y - cy) < gap * TILE)) return false;
  if (NPCS.some((n) => Math.hypot(n.x - cx, n.y - cy) < 2.5 * TILE)) return false;
  if (NPC_DECOR.some((d) => Math.hypot(d.x * TILE - cx, d.y * TILE - cy) < 2 * TILE)) return false;
  if (CHESTS.some((c) => Math.hypot(c.x - cx, c.y - cy) < 2 * TILE)) return false;
  if (SIGNPOSTS.some((s) => Math.hypot((s.x + 0.5) * TILE - cx, (s.y + 0.5) * TILE - cy) < 2 * TILE)) return false;
  if (SIEGE_SITES.some((s) => Math.abs(s.tx - tx) <= 9 && Math.abs(s.ty - ty) <= 4)) return false; // siege works
  return true;
}

/** Up to `n` spots for `kind` inside the named area (deterministic, same on every client). */
function scatter(out: Spot[], area: string, kind: Kind, n: number, gap = 4, near?: (tx: number, ty: number) => boolean) {
  const a = AREAS.find((r) => r.name === area);
  if (!a) return;
  let placed = 0;
  for (let k = 0; k < 400 && placed < n; k++) {
    const tx = a.x + Math.floor(hash(k, n, kind.length * 31 + area.length) * a.w), ty = a.y + Math.floor(hash(n, k, kind.length * 17 + area.length * 3) * a.h);
    if (!free(tx, ty, out, gap) || (near && !near(tx, ty))) continue;
    out.push({ kind, x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, flip: hash(tx, ty, 5) < 0.5 && kind !== "wp_pennant_red" && kind !== "wp_pennant_black" && kind !== "wp_lantern_pole" });
    placed++;
  }
}

/** Within `r` tiles of a cobbled road (lantern poles line the roads). */
const byRoad = (r: number) => (tx: number, ty: number) => {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (GROUND[ty + j]?.[tx + i] === T.COBBLE) return true;
  return false;
};

function spots(): Spot[] {
  const out: Spot[] = [];
  // Oakvale: lantern poles along the roads, pennants, dummies to practise on (the smithy has its own weapon rack)
  scatter(out, "Oakvale", "wp_dummy", 2, 5, (tx, ty) => tx < VILLAGE.x0 + 9);
  scatter(out, "Oakvale", "wp_pennant_red", 2, 8);
  scatter(out, "Oakvale", "wp_lantern_pole", 6, 4, byRoad(1));
  // Hunter's Camp: a spear rack and a dummy
  scatter(out, "Hunter's Camp", "wp_spear_rack", 1, 3);
  scatter(out, "Hunter's Camp", "wp_dummy", 1, 3);
  // Skeleton lands (Watchtower, Keep, Barrows, Ruins): no flags or pennants, the dead don't camp. Their siege
  // works are in siegeArt.ts; only old broken spears lie around.
  scatter(out, "Old Watchtower", "wp_spears_ground", 2, 4);
  scatter(out, "Greywatch Keep", "wp_spears_ground", 4, 4);
  scatter(out, "Barrow Downs", "wp_spears_ground", 4, 6);
  scatter(out, "Old Ruins", "wp_spears_ground", 2, 5);
  // Redfang Hollow: skull pikes and the bandits' spear rack
  // the watchtowers first (fixed spots by the gates, manned by lookouts), so nothing else is put under them
  for (const [tx, ty] of CAMP_TOWERS) out.push({ kind: "wp_watchtower", x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }); // and Fangrock's and Talon Fort's (shared/bandits.ts CAMPS)
  scatter(out, "Redfang Hollow", "wp_skull_pike", 6, 3);
  scatter(out, "Redfang Hollow", "wp_spear_rack", 1, 4);
  // Heronwreck Strand: the Grey Heron (fixed spot, see WRECK in shared/map.ts)
  out.push({ kind: "wp_shipwreck", x: (WRECK.x + 0.5) * TILE, y: (WRECK.y + 0.6) * TILE });
  // The Hollow Throne: Ostrevar's throne on its dais, and a ring of crown-stones round the clearing (the three
  // ward-stones on the ring are quest objects, client/src/questObjects.ts)
  out.push({ kind: "wp_hollow_throne", x: (HOLLOW.cx + 0.5) * TILE, y: (HOLLOW.cy - 3.6) * TILE });
  const wardAng = HOLLOW_WARDS.map(([x, y]) => Math.atan2(y - HOLLOW.cy, x - HOLLOW.cx));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2;
    if (wardAng.some((w) => Math.abs(Math.atan2(Math.sin(a - w), Math.cos(a - w))) < 0.4)) continue;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.3) continue; // the King's Way comes in from the south
    const tx = HOLLOW.cx + 0.5 + Math.cos(a) * HOLLOW.r * 1.1, ty = HOLLOW.cy + 0.5 + Math.sin(a) * HOLLOW.r;
    out.push({ kind: `wp_crownstone${i % 3}` as Kind, x: tx * TILE, y: ty * TILE, flip: hash(i, 3, 7) < 0.5 });
  }
  // Millbrook: the water wheel and its lean-to on pilings, against the mill's east wall (millArt.ts)
  const mill = AREAS.find((r) => r.name === "Millbrook Mill");
  if (mill) {
    let x1 = -1, y0 = 1e9, y1 = -1;
    for (let ty = mill.y; ty < mill.y + mill.h; ty++) for (let tx = mill.x; tx < mill.x + mill.w; tx++) {
      const o = OBJECTS[ty]?.[tx];
      if (o === T.ROOF_THATCH || o === T.DOOR || o === T.WALL_TIMBER || o === T.WINDOW_TIMBER) { x1 = Math.max(x1, tx); y0 = Math.min(y0, ty); y1 = Math.max(y1, ty); }
    }
    if (x1 >= 0) out.push({ kind: "wp_millwheel", x: (x1 + 1) * TILE + MILL_FOOT_U, y: (y0 + y1 + 1) / 2 * TILE + MILL_FOOT_V, depth: (y1 + 1) * TILE + 2 });
  }
  // Goldenreach barn: two cows in the straw, out of the doorway's line (farmArt.ts)
  for (const b of BARNS) for (const [du, dv, k, fl] of [[2.6, 2.2, 0, false], [b.w - 3.4, 3.6, 1, true]] as const)
    // a flipped iso sprite swaps u and v, so its foot offset swaps too
    out.push({ kind: `wp_cow${k}`, x: (b.x + du) * TILE + (fl ? COW_FOOT_V : COW_FOOT_U), y: (b.y + dv) * TILE + (fl ? COW_FOOT_U : COW_FOOT_V), flip: fl });
  // Saltmere: nets drying by the beach, lantern poles on the lane
  scatter(out, "Saltmere", "wp_net_rack", 3, 5);
  scatter(out, "Saltmere", "wp_lantern_pole", 3, 6);
  // The elemental wilds (elementArt.ts): each land's own growths and scars
  const LAND_PROP = { poison: "wp_venom_caps", cold: "wp_ice_spikes", fire: "wp_ember_vent", shock: "wp_storm_stone" } as const;
  for (const l of ELEMENT_LANDS) scatter(out, l.name, LAND_PROP[l.el], Math.round(l.w * l.h / 90), 4);
  return out;
}

export const WORLD_PROP_SPOTS: readonly Spot[] = spots();
