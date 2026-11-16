/**
 * Where you are and how to get anywhere, in the war table's terms (Murat 2026-11-16: "understandable where I am, and
 * how I can move from my territory map to the other territories"). Pure and deterministic, no DOM, nothing sent to the
 * server: it reads the shared tables (territories, region links, Crownways, portal stones) and answers three things.
 *  - `hereAt(tile)`: the territory and land a tile lies in (a village, outside every zone, counts as its nearest one).
 *  - `WAYS`: every gate pair that joins two territories (the four land links and the five Crownways), with the tile of
 *    each end, so both maps can name the same exits.
 *  - `findRoute(a, b)`: the shortest way between two territories over borders (walk), gate pairs and, for the stones
 *    the hero has woken, portal stones. The Crown holds no territories yet, so it is one node of its own (`CROWN_NODE`).
 */
import { cityAt } from "../../shared/capitals";
import { HOMELAND_GATES } from "../../shared/act2";
import { inCrownBand, inDeepRow, UNDER_END, WORLD_H } from "../../shared/constants";
import { CR, CROWN_KEEP, CROWNWAYS, crownGateTile } from "../../shared/crown";
import { PORTAL_SPOTS } from "../../shared/map";
import { REGION_LINKS, regionName, regionOf } from "../../shared/war/regions";
import { TERRITORIES, type Territory } from "../../shared/war/territories";

export interface Tile { x: number; y: number }
/** The Crown of the Marches has no territory yet: the table and the router treat it as one node after the last territory. */
export const CROWN_NODE = TERRITORIES.length;
export const CROWN_LAND = "crown";

export const nodeName = (n: number) => (n === CROWN_NODE ? regionName(CROWN_LAND) : TERRITORIES[n]?.name ?? "?");
/** The middle of a node, in map tiles (the Crown: its Keep). */
export function nodeTile(n: number): Tile {
  if (n === CROWN_NODE) return { x: CROWN_KEEP.x + CROWN_KEEP.w / 2, y: CR(CROWN_KEEP.y + CROWN_KEEP.h / 2) };
  const t = TERRITORIES[n];
  return { x: t.cx, y: t.cy };
}
/** The land (a REGIONS key) a node lies in. */
export const landOfNode = (n: number) => (n === CROWN_NODE ? CROWN_LAND : TERRITORIES[n]?.region ?? "");

const inRect = (t: Territory, x: number, y: number) => x >= t.x && y >= t.y && x < t.x + t.w && y < t.y + t.h;
/** The territory of land `land` whose centre is nearest the tile. */
export function nearestIn(land: string, x: number, y: number, ts: readonly Territory[] = TERRITORIES): Territory | undefined {
  let best: Territory | undefined, bd = Infinity;
  for (const t of ts) { if (t.region !== land) continue; const d = Math.hypot(t.cx - x, t.cy - y); if (d < bd) { bd = d; best = t; } }
  return best;
}

export interface Here {
  /** A REGIONS key, or undefined in the underground, where no land is drawn. */
  land?: string;
  /** The territory the tile lies in; undefined in a village, a lair or a dungeon floor. */
  terr?: number;
  /** The node the maps mark: `terr`, else the nearest territory of the land (or the Crown). Undefined underground. */
  node?: number;
  /** True when `node` is only the nearest territory, not the one you stand in. */
  near: boolean;
}

/** The territory and land of a map tile (underground: the land only, no node). */
export function hereAt(tx: number, ty: number): Here {
  const city = cityAt(tx, ty);
  if (city) return hereAt(city.outer.x, city.outer.y); // inside a capital: where its city gate stands in its land
  const land = regionOf(tx, ty)?.key ?? (inCrownBand(ty) ? CROWN_LAND : undefined);
  if ((ty >= WORLD_H && ty < UNDER_END) || inDeepRow(ty)) return { land, near: false }; // dungeon floors and caves lie under the lands: no territory to mark
  const hit = TERRITORIES.find((t) => inRect(t, tx, ty));
  if (hit) return { land: hit.region, terr: hit.id, node: hit.id, near: false };
  if (land === CROWN_LAND) return { land, node: CROWN_NODE, near: false };
  const n = land ? nearestIn(land, tx, ty) : undefined;
  return { land, node: n?.id, near: !!n };
}

/** "You: Mirror Pond, The Oakvale Lands" (a village: "You: Market Square, near Mirror Pond, ..."). `area` is the place name under your feet. */
export function hereCaption(h: Here, area?: string): string {
  if (h.node === undefined) return area ? `You: ${area}` : "You: underground";
  const land = h.land ? regionName(h.land) : "";
  if (h.node === CROWN_NODE) return `You: ${area && area !== land ? area + ", " : ""}${land}`;
  if (!h.near) return `You: ${nodeName(h.node)}, ${land}`;
  return `You: ${area ? area + ", near " : "near "}${nodeName(h.node)}, ${land}`;
}

/** A pair of gates joining two nodes. `ta` / `tb`: the tile of each gate (map tiles); `req`: what the hero needs. */
export interface Way { id: string; name: string; a: number; b: number; ta: Tile; tb: Tile; req: string }

const actLevel = (act: number) => HOMELAND_GATES.find((h) => h.act === act)?.level;
const LAND_ACT: Record<string, number> = { moors: 3, badlands: 4, sinkholes: 5, crown: 6 };
/** What a gate into `land` asks for, as short text ("Lv 25", or the Sunscar's two bosses). */
export function gateReq(land: string): string {
  const lv = LAND_ACT[land] ? actLevel(LAND_ACT[land]) : undefined;
  return lv ? `Lv ${lv}` : "after Act 1's bosses";
}

export const WAYS: Way[] = [
  ...REGION_LINKS.flatMap((l): Way[] => {
    const a = nearestIn(l.a, l.pa.x, l.pa.y), b = nearestIn(l.b, l.pb.x, l.pb.y);
    return a && b ? [{ id: l.name, name: l.name, a: a.id, b: b.id, ta: l.pa, tb: l.pb, req: gateReq(l.b) }] : [];
  }),
  ...CROWNWAYS.flatMap((c): Way[] => {
    const a = nearestIn(c.from, c.home.x, c.home.y);
    return a ? [{ id: `crownway_${c.from}`, name: c.name, a: a.id, b: CROWN_NODE, ta: c.home, tb: crownGateTile(c), req: c.from === "sunscar" ? `${gateReq(CROWN_LAND)}, after Act 1's bosses` : gateReq(CROWN_LAND) }] : [];
  }),
];

/** A portal stone: its id, name and the node it stands in. */
export interface Stone { id: string; name: string; node: number; tile: Tile }
export const STONES: Stone[] = PORTAL_SPOTS.flatMap((p) => {
  const h = hereAt(p.x, p.y);
  return h.node === undefined ? [] : [{ id: p.id, name: p.name, node: h.node, tile: { x: p.x, y: p.y } }];
});

export type Via = "walk" | "gate" | "portal";
export interface Step { from: number; to: number; via: Via; way?: Way; stones?: [Stone, Stone] }

/** Walking costs the real distance between two territories' centres (40 tiles = 1); a gate costs 2, much more when it leads in or out of the Crown (Lv 40) or to the Sunscar (needs Act 1's bosses), so the route takes the natural land gate unless the Crown is the goal. */
const WALK_TILES = 40;
const stepCost = (s: Step) => s.via === "walk" ? Math.max(1, Math.hypot(TERRITORIES[s.from].cx - TERRITORIES[s.to].cx, TERRITORIES[s.from].cy - TERRITORIES[s.to].cy) / WALK_TILES)
  : s.via === "portal" ? 1.5 : 2 + (s.way!.a === CROWN_NODE || s.way!.b === CROWN_NODE ? 25 : s.way!.id === "The Waygate" ? 6 : 0);
/** Borders inside a land only: `near` also lists the territories a gate joins, and those are ways, not walks. */
const BORDER: [number, number][] = TERRITORIES.flatMap((t) => t.near.filter((n) => n > t.id && TERRITORIES[n].region === t.region).map((n): [number, number] => [t.id, n]));

/**
 * The cheapest route from node `a` to node `b` (costs: see `stepCost`). `woken`: ids of the portal stones the hero may use (each hop goes between two
 * woken stones; you must walk to the stone first, which the route does as ordinary steps). Undefined when unreachable.
 */
export function findRoute(a: number, b: number, woken?: ReadonlySet<string>): Step[] | undefined {
  if (a === b) return [];
  const n = TERRITORIES.length + 1;
  const adj: Step[][] = Array.from({ length: n }, () => []);
  const add = (s: Step) => adj[s.from].push(s);
  for (const [x, y] of BORDER) { add({ from: x, to: y, via: "walk" }); add({ from: y, to: x, via: "walk" }); }
  for (const w of WAYS) { add({ from: w.a, to: w.b, via: "gate", way: w }); add({ from: w.b, to: w.a, via: "gate", way: w }); }
  if (woken) {
    const ws = STONES.filter((s) => woken.has(s.id));
    for (const s of ws) for (const t of ws) if (s.node !== t.node) add({ from: s.node, to: t.node, via: "portal", stones: [s, t] });
  }
  const dist = new Array<number>(n).fill(Infinity), prev: (Step | undefined)[] = new Array(n), done = new Array<boolean>(n).fill(false);
  dist[a] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === b) break;
    done[u] = true;
    for (const s of adj[u]) { const d = dist[u] + stepCost(s); if (d < dist[s.to]) { dist[s.to] = d; prev[s.to] = s; } }
  }
  if (!prev[b]) return undefined;
  const out: Step[] = [];
  for (let at = b; at !== a;) { const s = prev[at]!; out.unshift(s); at = s.from; }
  return out;
}

/** The route as a few plain lines: runs of borders merged ("Walk 3 territories to X"), gates and stones named. */
export function routeLines(steps: readonly Step[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.via === "walk") {
      let j = i; while (j + 1 < steps.length && steps[j + 1].via === "walk") j++;
      const k = j - i + 1;
      out.push(k === 1 ? `Walk to ${nodeName(steps[j].to)}` : `Walk ${k} territories to ${nodeName(steps[j].to)}`);
      i = j;
    } else if (s.via === "gate") {
      if (i === steps.length - 1) out.push(s.from === s.way!.a ? `Take ${s.way!.name} at ${nodeName(s.from)} (${s.way!.req}), arriving in ${nodeName(s.to)}` : `Take ${s.way!.name} back from ${nodeName(s.from)} to ${nodeName(s.to)}`);
      else out.push(s.from === s.way!.a ? `Take ${s.way!.name} at ${nodeName(s.from)} (${s.way!.req})` : `Take ${s.way!.name} back from ${nodeName(s.from)}`);
    } else {
      out.push(`Portal stone: ${s.stones![0].name} to ${s.stones![1].name}`);
    }
  }
  return out;
}
