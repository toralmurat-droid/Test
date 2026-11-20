/**
 * Falling Holds (Murat 2026-11-19: "the fort should spawn monsters from a barrack, all forts should have a number of props
 * depending on its fortification; when all the props and fortifications are destroyed the fort should fall and have to be
 * conquered by a clan to be claimed and start producing soldiers again").
 *
 * Every Hold stands a set of works heroes can wreck: its barracks (where its soldiers come out: server/warTroops.ts
 * fields no new man while it lies wrecked), supply props (stores, weapon racks: more the bigger the Hold, HOLD_FALL.props)
 * and its fortifications (each tower or mound and each gate of the fort its holder built at its tier). Works are
 * "trooper" objects of the holder's clan (Mob.weapon "<clan>%<code>"), so every trooper gate holds: only heroes the
 * holder's soldiers fight can hurt them (troops.ts troopStance), no XP, no loot. A wrecked work is rebuilt after
 * HOLD_FALL.rebuildMs unless the Hold falls first. When the last one goes, the Hold FALLS: its walls come down, its
 * soldiers are gone, its holder takes nothing from the land (rules.ts warTick) and the Hold stands neutral until a hero
 * sworn to a clan raises its clan's banner at the ruin (server/warHolds.ts, the sack's banner flow): the land is that
 * clan's (rules.ts claimFallen), a new outpost rises with a new barracks and its soldiers march out again. A siege won by
 * an army claims a fallen land the same way. Capitals and Reckoning-only ground never fall.
 * Pure: numbers, the works of each fort (deterministic from the map, same on server and client) and their names.
 */
import { TILE } from "../constants";
import { isSolidTile } from "../map";
import { CLANS, CLAN_KEYS, type ClanKey } from "./clans";
import { fortOf, type HoldFort } from "./holdWalls";
import type { HoldTier } from "./holdTiers";
import { HOLDS } from "./standards";
import { TERRITORIES } from "./territories";

export type WorkKind = "barracks" | "stores" | "rack" | "tower" | "gate";
/** Props stand in the courtyard; fortifications are parts of the fort itself (their art is the fort's: the client draws only a ruin once wrecked). */
export const PROP_KINDS: readonly WorkKind[] = ["barracks", "stores", "rack"];
export const isFortification = (k: WorkKind) => k === "tower" || k === "gate";

export const HOLD_FALL = {
  /** Master switch: off, no works stand and no Hold falls. */
  live: true,
  /** Props a Hold stands by tier (outpost, camp, fortress), the barracks included: the bigger the Hold, the more to burn. */
  props: [2, 4, 6] as readonly number[],
  /** A work's HP as a multiple of a line soldier's of the land's level (troops.ts troopStats). */
  hp: { barracks: 14, stores: 5, rack: 4, tower: 10, gate: 8 } as Record<WorkKind, number>,
  /** A wrecked work stands again after this long, unless the Hold fell (ms). */
  rebuildMs: 15 * 60_000,
  /** Valor for the wrecker's clan per work (only where the war lets it fight there, like a sack) and renown for the wrecker (the same, capped per war tick). */
  wreckValor: 3, wreckRenown: 6,
  /** Works a hero is paid wreck renown for in one war tick (a Hold's works rebuild: no endless renown). */
  wreckRenownPerTick: 8,
  /** The fall: valor for the clan that wrecked the last work, renown for each of its sworn heroes in the Hold's reach. */
  fallValor: 10, fallRenown: 25,
  /** Valor for the claiming clan in the land, renown for each of its sworn heroes in the reach. */
  claimValor: 10, claimRenown: 20,
};

/** The letter each work kind carries in Mob.weapon ("<clan>%<code>"). */
const CODE: Record<WorkKind, string> = { barracks: "b", stores: "s", rack: "r", tower: "t", gate: "g" };
const KIND: Record<string, WorkKind> = Object.fromEntries(Object.entries(CODE).map(([k, c]) => [c, k as WorkKind]));
/** The Mob.weapon of a work of clan `k` (troops.ts parseTroop reads it as part "work"). */
export const workWeapon = (k: ClanKey, kind: WorkKind) => `${k}%${CODE[kind]}`;
/** A work's clan and kind from its Mob.weapon, or undefined. */
export function parseWork(w: unknown): { clan: ClanKey; kind: WorkKind } | undefined {
  if (typeof w !== "string") return undefined;
  const i = w.indexOf("%"), k = w.slice(0, i) as ClanKey, kind = KIND[w.slice(i + 1)];
  return i > 0 && CLANS[k] && kind ? { clan: k, kind } : undefined;
}

/** What each clan calls its works (name tags, the Herald). */
const NAMES: Record<ClanKey, Record<WorkKind, string>> = {
  wardens: { barracks: "barracks", stores: "stores", rack: "weapon rack", tower: "watchtower", gate: "gate" },
  redfang: { barracks: "war tent", stores: "plunder pile", rack: "spear rack", tower: "lookout", gate: "gate" },
  host: { barracks: "ossuary", stores: "bone stores", rack: "blade rack", tower: "bone tower", gate: "gate" },
  hidekin: { barracks: "warren lodge", stores: "hoard", rack: "tusk rack", tower: "burrow mound", gate: "gate" },
  veiled: { barracks: "pavilion", stores: "stores", rack: "staff rack", tower: "rune spire", gate: "gate" },
};
const SHORT: Record<ClanKey, string> = { wardens: "Warden", redfang: "Redfang", host: "Ossuary", hidekin: "Hide-Kin", veiled: "Veiled" };
/** "Warden barracks", "Redfang war tent", "Hide-Kin burrow mound"... */
export const workName = (k: ClanKey, kind: WorkKind) => `${SHORT[k]} ${NAMES[k][kind]}`;
export const workNoun = (k: ClanKey, kind: WorkKind) => NAMES[k][kind];

/** One work of a Hold: its index (stable for the fort), kind and spot (px, its feet). */
export interface HoldWork { i: number; kind: WorkKind; x: number; y: number }

/** Can territory t's Hold fall at all (a Hold, not a capital, not Reckoning-only ground)? */
export function canFall(t: number): boolean {
  const tr = TERRITORIES[t];
  return HOLD_FALL.live && !!tr && !tr.capitalOf && !tr.reckoningOnly && HOLDS.some((h) => h.t === t);
}

const cache = new Map<string, HoldWork[]>();
/**
 * The works of territory t's Hold as clan `clan` builds it at `tier` (empty when it cannot fall): the barracks first, then
 * the supply props (spread over the courtyard, away from the banner and the gates; outside the walls when the yard is too
 * small), then one fortification per tower group and per gate group of the fitted fort. Deterministic.
 */
export function holdWorks(t: number, clan: ClanKey, tier: HoldTier): HoldWork[] {
  const ck = `${t}:${clan}:${tier}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const f = canFall(t) ? fortOf(t, clan, tier) : undefined, out: HoldWork[] = [];
  if (f) {
    const at = (x: number, y: number) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE });
    for (const [kind, [x, y]] of propSpots(f, HOLD_FALL.props[tier] ?? 2)) out.push({ i: out.length, kind, ...at(x, y) });
    for (const g of groups(f, (k) => k === "tower" || k === "mound", true)) out.push({ i: out.length, kind: "tower", ...at(g[0], g[1]) });
    for (const g of groups(f, (k) => k === "gate", false)) out.push({ i: out.length, kind: "gate", ...at(g[0], g[1]) });
  }
  cache.set(ck, out);
  return out;
}

/** The barracks of a Hold's works (where its soldiers come out). */
export const barracksOf = (works: readonly HoldWork[]) => works.find((w) => w.kind === "barracks");

/** Courtyard spots for `n` props: the barracks on the cell farthest from the gates, the rest spread out. [kind, tile]. */
function propSpots(f: HoldFort, n: number): [WorkKind, [number, number]][] {
  const gates = f.cells.filter((c) => c.kind === "gate" || c.kind === "gap");
  const nearGate = (dx: number, dy: number) => gates.some((g) => Math.abs(g.dx - dx) + Math.abs(g.dy - dy) <= 1);
  let free = f.cells.filter((c) => c.kind === "court" && (c.dx || c.dy) && !nearGate(c.dx, c.dy) && !isSolidTile(f.cx + c.dx, f.cy + c.dy)).map((c) => [c.dx, c.dy] as [number, number]);
  // a yard too small (an outpost): a ring of spots just outside the walls, on open ground
  if (free.length < n) {
    const r = f.reach + 2;
    for (const [ax, ay] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [-1, 0], [0, 1], [1, 0]] as [number, number][]) {
      const dx = ax * r, dy = ay * r;
      if (!isSolidTile(f.cx + dx, f.cy + dy) && !free.some(([x, y]) => x === dx && y === dy)) free.push([dx, dy]);
    }
  }
  const gd = (dx: number, dy: number) => Math.min(99, ...gates.map((g) => Math.hypot(g.dx - dx, g.dy - dy)));
  const out: [WorkKind, [number, number]][] = [];
  const order = (a: [number, number], b: [number, number]) => a[1] - b[1] || a[0] - b[0];
  free = free.sort(order);
  // the barracks: far from the gates, at the back of the yard (north, the far side in iso), not on the banner
  let best = free[0];
  for (const c of free) if (gd(c[0], c[1]) - c[1] * 0.3 > gd(best[0], best[1]) - best[1] * 0.3 + 1e-9) best = c;
  if (!best) return out;
  out.push(["barracks", best]);
  const taken: [number, number][] = [best];
  for (let k = 1; k < n; k++) {
    let pick: [number, number] | undefined, score = -1;
    for (const c of free) {
      if (taken.some((x) => x[0] === c[0] && x[1] === c[1])) continue;
      const s = Math.min(...taken.map((x) => Math.hypot(x[0] - c[0], x[1] - c[1])), Math.hypot(c[0], c[1]) * 1.5);
      if (s > score + 1e-9) { score = s; pick = c; }
    }
    if (!pick) break;
    taken.push(pick);
    out.push([PROP_KINDS[1 + ((k - 1) % 2)], pick]);
  }
  return out.map(([k, [dx, dy]]) => [k, [f.cx + dx, f.cy + dy]]);
}

/** Groups of the fitted fort's cells of the kinds `is` (8-connected when `diag`, else 4): each group's cell nearest its middle (absolute tiles). */
function groups(f: HoldFort, is: (k: string) => boolean, diag: boolean): [number, number][] {
  const cells = f.cells.filter((c) => is(c.kind)).map((c) => [c.dx, c.dy] as [number, number]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const seen = new Set<string>(), out: [number, number][] = [];
  for (const c of cells) {
    const k0 = `${c[0]},${c[1]}`;
    if (seen.has(k0)) continue;
    const g: [number, number][] = [], q = [c];
    seen.add(k0);
    while (q.length) {
      const [x, y] = q.pop()!;
      g.push([x, y]);
      for (const n of cells) {
        const d = Math.abs(n[0] - x) + Math.abs(n[1] - y), k = `${n[0]},${n[1]}`;
        if (!seen.has(k) && (d === 1 || (diag && d === 2 && Math.abs(n[0] - x) === 1))) { seen.add(k); q.push(n); }
      }
    }
    const mx = g.reduce((a, p) => a + p[0], 0) / g.length, my = g.reduce((a, p) => a + p[1], 0) / g.length;
    const mid = g.reduce((a, p) => (Math.hypot(p[0] - mx, p[1] - my) < Math.hypot(a[0] - mx, a[1] - my) ? p : a));
    out.push([f.cx + mid[0], f.cy + mid[1]]);
  }
  return out;
}

/**
 * What the clients get ("holdworks" message): the wrecked works this process knows of ([territory, work index, clan index,
 * the tier the works were laid out at]; a fallen Hold lists every work), so the client draws their ruins.
 */
export interface HoldWorksMsg { wrecked: [number, number, number, number][] }
/** The client's reading of a "holdworks" message (junk dropped). */
export function cleanHoldWorksMsg(m: unknown): HoldWorksMsg {
  const o = m && typeof m === "object" ? (m as Partial<HoldWorksMsg>) : {};
  const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  return { wrecked: Array.isArray(o.wrecked) ? o.wrecked.filter((x) => Array.isArray(x) && int(x[0], 0, 9999) && int(x[1], 0, 99) && int(x[2], 0, CLAN_KEYS.length - 1) && int(x[3], 0, 2)) : [] };
}
