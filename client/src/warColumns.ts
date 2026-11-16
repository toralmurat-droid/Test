/**
 * Client model of the W4 war roads and marching columns: the "warroads" entries rebuilt into paths (pathOfEntry), the
 * "columns" message placed with columnPos (the same clock as the server), and the texts that describe a column. No
 * drawing here (warMap.ts, warRoads.ts and the plaque use it); it decides nothing, the server owns every column.
 */
import { TILE } from "../../shared/constants";
import { CLAN_KEYS, type ClanKey } from "../../shared/war/clans";
import { COLUMN, columnPos, type ColumnsMsg } from "../../shared/war/marches";
import { pathOfEntry, reverseRoad, type RoadEntry, type WarPath } from "../../shared/war/roads";
import { TERRITORIES } from "../../shared/war/territories";

/** One column as the map draws it (px = world px). */
export interface ColView {
  id: string; clan: ClanKey; from: number; to: number;
  x: number; y: number; state: number;
  /** Men alive: size minus fallen, the officer included. */
  men: number;
  /** Two columns fight here: draw crossed swords. */
  clash: boolean;
}

const CLAN_NAME: Record<ClanKey, string> = { wardens: "Wardens", redfang: "Redfang", host: "Ossuary Host", hidekin: "Hide-Kin", veiled: "Veiled Circle" };

/** The tooltip text of a column: "Redfang column · 5 men · marching on Ashfall". */
export function columnTip(c: ColView): string {
  const land = TERRITORIES[c.to]?.name ?? "?";
  const what = c.state === 0 ? `mustering for ${land}` : c.state === 2 ? `halted by heroes, bound for ${land}` : c.state === 3 ? `in a clash, bound for ${land}`
    : c.state === 4 ? `in a waygate, bound for ${land}` : c.state === 5 ? `camped before ${land}` : `marching on ${land}`;
  return `${CLAN_NAME[c.clan]} column · ${c.men} ${c.men === 1 ? "man" : "men"} · ${what}`;
}

export class WarColumns {
  private entries = new Map<string, RoadEntry>();
  private paths = new Map<string, WarPath | null>();
  private msg?: ColumnsMsg;
  private recv = 0;
  /** Server clock minus this one (ms), from the message's `now`: columns are placed on the server's clock. */
  private offset = 0;
  private cache: { at: number; list: ColView[] } = { at: -1, list: [] };
  /** Bumped when the roads change (the ground decal redraws). */
  roadsVersion = 0;

  /** Every road entry known (also for drawing: pts are flat tile coordinates). */
  get roads(): readonly RoadEntry[] { return [...this.entries.values()]; }
  get hasColumns() { return !!this.msg; }
  get tick() { return this.msg?.tick ?? -1; }
  get ids(): string[] { return this.msg?.cols.map((c) => c[0]) ?? []; }

  setRoads(list: RoadEntry[]) {
    this.entries.clear(); this.paths.clear();
    for (const e of list) if (Array.isArray(e) && e.length >= 3 && Array.isArray(e[2])) this.entries.set(`${e[0]}-${e[1]}`, e);
    this.roadsVersion++; this.cache.at = -1;
  }
  setColumns(m: ColumnsMsg, now = Date.now()) {
    if (typeof m.now === "number" && Number.isFinite(m.now)) this.offset = m.now - now;
    this.msg = m; this.recv = now + this.offset; this.cache.at = -1;
  }

  /** The path from `from` to `to` (the entry's own order is a < b: walk b -> a reversed). */
  pathFor(from: number, to: number): WarPath | undefined {
    const key = `${from}-${to}`;
    let p = this.paths.get(key);
    if (p === undefined) {
      const e = this.entries.get(from < to ? key : `${to}-${from}`);
      p = null;
      if (e) {
        const f = pathOfEntry(e);
        p = from < to ? f : { ...f, a: from, b: to, legs: [...f.legs].reverse().map(reverseRoad) };
      }
      this.paths.set(key, p);
    }
    return p ?? undefined;
  }

  /** Every column placed on the clock (cached 100 ms: the maps ask a few times a frame). */
  all(now = Date.now()): ColView[] {
    if (!this.msg) return [];
    if (this.cache.at >= 0 && Math.abs(now - this.cache.at) < 100) return this.cache.list;
    const m = this.msg, meet = new Map<string, number>(), list: ColView[] = [];
    for (const [a, b, , , at] of m.meets ?? []) { meet.set(a, at); meet.set(b, at); }
    for (const [id, ci, from, to, dep, size, fallen, haltMs, state] of m.cols) {
      const clan = CLAN_KEYS[ci], p = clan && this.pathFor(from, to);
      if (!p) continue;
      // halted by heroes: it stands where it was when the halt began (the message came then)
      const q = columnPos(p, dep, state === 2 ? this.recv : now + this.offset, haltMs, meet.get(id));
      list.push({ id, clan, from, to, x: q.x, y: q.y, state: state === 2 ? 2 : q.state, men: Math.max(1, size - fallen), clash: state === 3 || q.state === 3 });
    }
    this.cache = { at: now, list };
    return list;
  }

  /** The columns to show a hero at `me` (px): the own clan's always, the others within COLUMN.scoutTiles. */
  visible(own: ClanKey | undefined, me: { x: number; y: number } | undefined, now = Date.now()): ColView[] {
    const r = COLUMN.scoutTiles * TILE;
    return this.all(now).filter((c) => c.clan === own || (!!me && Math.hypot(c.x - me.x, c.y - me.y) <= r));
  }

  /** A column that marches on land t or leaves it (the plaque line), if any. */
  touching(t: number, now = Date.now()): ColView | undefined {
    const l = this.all(now);
    return l.find((c) => c.to === t) ?? l.find((c) => c.from === t);
  }
}
