/**
 * The townsfolk of a capital city (settlement network step 5): where they stand and which ways they walk. Phaser-free, so
 * tests/cityFolk.test.ts can check every spot and route of every city. All points are local city tiles from CITY_TEMPLATE
 * turned into px with cityPx, so the same plan dresses a band city and a city in its land. Cosmetic: nothing is synced.
 */
import { CITIES, CITY_TEMPLATE, cityGates, cityPx, plotBox, type City } from "../../shared/capitals";
import { TILE } from "../../shared/constants";
import { isSolidAt } from "../../shared/map";
import { isDecorSolidAt, NPCS } from "../../shared/npcs";
import type { CharacterName } from "./artAssets";

/** What a person does all day. */
export type CityJob = "warden" | "guard" | "patrol" | "recruit" | "keeper" | "shopper" | "well" | "houser" | "walker" | "crier" | "monk";
export type CitySpotKind = "post" | "drill" | "stall" | "well" | "crier" | "door";
export interface CitySpot { kind: CitySpotKind; x: number; y: number; look?: [number, number] }
export interface CityPerson {
  job: CityJob;
  /** Character sheet (a soldier's fallback sheet when the painted one is off). */
  sheet: CharacterName;
  /** Soldiers wear the clan's painted troop sprite. */
  soldier: boolean;
  /** Where they stand, or start walking (px). */
  x: number; y: number;
  face: string;
  /** A polyline (px) they walk: back and forth with a pause at each end, or round it when `loop`. */
  route?: [number, number][];
  loop?: boolean;
  /** Loop walkers: how far (px) behind the loop's start they begin, so a pair keeps its distance. */
  lag?: number;
  /** The post they keep (stalls, well, drill dummy, crier's stand, the door a house-goer lives behind). */
  spot?: CitySpot;
}
export interface CityFolkPlan { people: CityPerson[]; spots: CitySpot[]; routes: [number, number][][] }

/** People are only moved within this many tiles of a city's centre (the hero's distance from it). */
export const CITY_FOLK_TILES = 34;
/** Where a city's centre is (px), for the activity radius. */
export const cityCentre = (c: City) => cityPx(c, 26, 20);

const KEEP_CLEAR = 0.9 * TILE; // the same keep-off ring Villagers uses round NPCs
/** A place a person's feet may stand: no wall, prop or tree under the body (Villagers.free's four corners), and clear of NPCs. */
export function folkFree(x: number, y: number): boolean {
  for (const [ox, oy] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) if (isSolidAt(x + ox, y + oy) || isDecorSolidAt(x + ox, y + oy)) return false;
  return !NPCS.some((n) => Math.hypot(n.x - x, n.y - y) < KEEP_CLEAR);
}
/** A straight walk from a to b that stays free the whole way (5 px steps, like Villagers). */
export function folkLine(ax: number, ay: number, bx: number, by: number): boolean {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 5);
  for (let i = 0; i <= n; i++) if (!folkFree(ax + (bx - ax) * i / n, ay + (by - ay) * i / n)) return false;
  return true;
}

/** True when tile (tx, ty) lies within `pad` tiles of a city standing in its land (props and kits keep out: landKit.ts, worldPropSpots.ts). */
export function inCityBox(tx: number, ty: number, pad: number): boolean {
  for (const c of CITIES) {
    if (!c.site) continue;
    const b = plotBox(c);
    if (tx >= b.x - pad && ty >= b.y - pad && tx < b.x + b.w + pad && ty < b.y + b.h + pad) return true;
  }
  return false;
}

type Pt = [number, number];
/** Total length of a polyline (px). */
export const routeLength = (r: readonly Pt[], loop = false) => {
  let l = 0;
  for (let i = 1; i < r.length; i++) l += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
  return loop && r.length > 1 ? l + Math.hypot(r[0][0] - r[r.length - 1][0], r[0][1] - r[r.length - 1][1]) : l;
};
/** The point `d` px along a polyline (closed when `loop`) and its direction. */
export function routeAt(r: readonly Pt[], d: number, loop = false): { x: number; y: number; dx: number; dy: number } {
  const n = r.length, segs = loop ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = r[i], b = r[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= l || i === segs - 1) { const u = l ? Math.max(0, Math.min(1, d / l)) : 0; return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, dx: b[0] - a[0], dy: b[1] - a[1] }; }
    d -= l;
  }
  return { x: r[0][0], y: r[0][1], dx: 0, dy: 1 };
}

/** Whom each job is played by: existing townsfolk sheets only. */
const SHOPPERS: CharacterName[] = ["villager", "goodwife", "peasant", "farmwife", "villager", "labourer"];
const KEEPERS: CharacterName[] = ["merchant", "alewife", "farmwife", "merchant"];
const HOUSERS: CharacterName[] = ["villager", "peasant", "goodwife", "labourer"];

/**
 * The plan of one city: ~37 people (2 gate wardens at each gate, 2 keep guards, 2 patrol pairs, 3 recruits, 4 stall keepers,
 * 6 shoppers, 2 at the well, 4 house-goers, 3 route walkers, the town crier, 2 monks). A band city has its south gate only.
 */
export function cityFolkPlan(c: City): CityFolkPlan {
  const P = CITY_TEMPLATE, at = (x: number, y: number): Pt => { const p = cityPx(c, x, y); return [p.x, p.y]; };
  const people: CityPerson[] = [], spots: CitySpot[] = [], routes: Pt[][] = [];
  const sides = new Set(c.site ? cityGates(c).map((g) => g.side) : ["south"]);
  /** A person standing at local tile (x, y), or at the start of their route. */
  const person = (job: CityJob, sheet: CharacterName, x: number, y: number, face: string, more: Partial<CityPerson> = {}) => {
    const p = more.route ? more.route[0] : at(x, y);
    people.push({ job, sheet, soldier: job === "warden" || job === "guard" || job === "patrol" || job === "recruit", x: p[0], y: p[1], face, ...more });
  };
  const spot = (kind: CitySpotKind, x: number, y: number, look?: [number, number]) => { const p = at(x, y), s: CitySpot = { kind, x: p[0], y: p[1], look }; spots.push(s); return s; };
  const route = (...pts: Pt[]) => { const r = pts.map(([x, y]) => at(x, y)); routes.push(r); return r; };
  const soldier = (job: CityJob, x: number, y: number, face: string, more: Partial<CityPerson> = {}) => person(job, "guard", x, y, face, more);

  // gate wardens: two flank each gate, facing out
  const flank: Record<string, [[number, number], [number, number], [number, number]]> = {
    south: [[23.3, 37.3], [28.7, 37.3], [0, 1]],
    west: [[2.4, 24.4], [2.4, 28.4], [-1, 0]],
    east: [[49.0, 24.4], [49.0, 28.4], [1, 0]],
  };
  for (const side of ["south", "west", "east"]) {
    if (!sides.has(side as "south")) continue;
    const [a, b, look] = flank[side], face = look[1] > 0 ? "down" : look[0] < 0 ? "left" : "right";
    for (const q of [a, b]) { const s = spot("post", q[0], q[1], look); soldier("warden", q[0], q[1], face, { spot: s }); }
  }
  // keep guards
  for (const q of [[24, 7.4], [29, 7.4]]) { const s = spot("post", q[0], q[1], [0, 1]); soldier("guard", q[0], q[1], "down", { spot: s }); }
  // patrol pairs: one up and down the main street, one along the cross street (two lanes each, closed loops)
  const lane = (...p: Pt[]) => route(...p);
  const rA = lane([24.7, 33.6], [24.7, 12.6], [26.9, 12.6], [26.9, 33.6]);
  const rB = lane([3.4, 25.7], [48.2, 25.7], [48.2, 26.9], [3.4, 26.9]);
  for (const [r, off] of [[rA, 0], [rB, 0]] as const) for (const lag of [0, 44]) {
    soldier("patrol", 0, 0, "down", { route: r, loop: true, lag: lag + off });
  }
  // recruits drill at the dummies
  for (const x of [4, 7, 10]) { const s = spot("drill", x + 0.5, 14.3, [0, -1]); soldier("recruit", x + 0.5, 14.3, "up", { spot: s }); }
  // stall keepers
  P.stalls.forEach(([x, y], i) => { const s = spot("stall", x + 0.5, y - 0.4, [0, 1]); person("keeper", KEEPERS[i % KEEPERS.length], x + 0.5, y - 0.4, "down", { spot: s }); });
  // shoppers: stall fronts <-> the gate square, the stalls along their front, the gate square <-> the houses
  const shop: Pt[][] = [
    route([3.5, 32.3], [3.5, 35.2], [18, 35.2], [22, 35.6]),
    route([6.5, 32.3], [6.5, 34.7], [19.5, 34.7], [22.8, 36.2]),
    route([10.5, 32.3], [10.5, 35.3], [21.5, 35.3], [23.2, 31.4]),
    route([13.5, 32.3], [13.5, 35.4], [30, 35.4]),
    route([3.5, 32.3], [12.2, 32.3]),
    route([14.2, 35.2], [33, 35.2], [38.5, 35.2]),
  ];
  shop.forEach((r, i) => person("shopper", SHOPPERS[i], 0, 0, "down", { route: r }));
  // the well
  for (const [dx, dy, face, sheet] of [[-1.5, 1.4, "right", "wellkeeper"], [1.5, 1.4, "left", "goodwife"]] as const) {
    const x = P.well.x + 0.5 + dx, y = P.well.y + dy, s = spot("well", x, y, [-dx, -1]);
    person("well", sheet, x, y, face, { spot: s });
  }
  // house-goers: a door step and a stroll to the street and back; they go in at dusk
  const doors: Pt[][] = [
    [[19.5, 24.5], [19.5, 26.3], [23.2, 26.3]],
    [[33.5, 24.5], [33.5, 26.3], [29.3, 26.3]],
    [[40.5, 34.6], [37.6, 35.6], [37.6, 36.6]],
    [[47.5, 34.6], [47.5, 36.6], [45.6, 36.8]],
  ];
  doors.forEach((pts, i) => {
    const r = route(...pts), s = spot("door", pts[0][0], pts[0][1], [0, -1]);
    person("houser", HOUSERS[i], 0, 0, "down", { route: r, spot: s });
  });
  // route walkers: market <-> barracks (labourer, peasant), the elder to the oath hall
  for (const [sheet, pts] of [
    ["labourer", [[4.4, 29.6], [4.4, 26.3], [9.2, 26.3], [9.2, 22.4]]],
    ["peasant", [[12.4, 30], [12.4, 26.6], [5.2, 26.6], [5.2, 19]]],
    ["elder", [[30.4, 26.6], [40.6, 26.6], [40.6, 17.4], [44, 16.2]]],
  ] as [CharacterName, Pt[]][]) {
    const r = route(...pts);
    person("walker", sheet, 0, 0, "down", { route: r });
  }
  // the town crier on the gate square, speaking to the street
  { const s = spot("crier", 28.6, 31.4, [0, 1]); person("crier", "merchant", 28.6, 31.4, "down", { spot: s }); }
  // monks pace the oath hall's court
  for (const pts of [[[40.2, 10], [47.8, 10]], [[40.2, 14.6], [47.8, 14.6]]] as Pt[][]) {
    const r = route(...pts);
    person("monk", "monk", 0, 0, "down", { route: r });
  }
  return { people, spots, routes };
}
