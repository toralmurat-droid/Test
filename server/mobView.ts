import type { Client } from "colyseus";
import { MOB_FIELDS, POS_SCALE, VIEW_ADD, VIEW_DROP, X_FIELD, Y_FIELD, type MobViewMsg } from "../shared/mobView";
import { TILE } from "../shared/constants";
import { MOB_CELL, type MobGrid } from "./mobGrid";

/** What the server sends: the value of a field as it goes on the wire (positions as whole 1/POS_SCALE px). */
function wire(m: any, i: number): unknown {
  const v = m[MOB_FIELDS[i]];
  return i === X_FIELD || i === Y_FIELD ? Math.round(v * POS_SCALE) : v;
}

/**
 * Each schema instance's change tree (@colyseus/schema 3: the "~changes" key, see its src/types/symbols.ts).
 * `indexedOperations` holds field index -> operation for every field set since the last discard().
 */
const CHANGES = "~changes";

/** A bucket's monsters (map order) with their ids and x, y in tiles, valid for the patch being sent. */
interface Bucket { m: any[]; id: string[]; x: number[]; y: number[] }

const CELL = 8; // tiles per bucket of the grid used to find the monsters near a hero (rows go out bucket by bucket)
const PER = (CELL * TILE) / MOB_CELL; // MobGrid squares per bucket side

/**
 * Sends each hero only the monsters around them (shared/mobView.ts), with what changed since last time.
 * Call `send` once per patch, before the state patch goes out, so a hero gets both parts of an update together.
 */
export class MobView {
  /** Per client: monster id -> the values it was last sent. Only clients that said "mvready" are fed. */
  private known = new Map<string, Map<string, unknown[]>>();
  private tick = 0;
  /** This patch's CELL buckets (bucket key -> its monsters in map order), built on first use; arrays are reused. */
  private buckets = new Map<number, Bucket>();
  private pool: Bucket[] = [];
  private fed = new Set<string>(); // clients fed this patch

  ready(c: Client) { this.known.set(c.sessionId, new Map()); }
  leave(c: Client) { this.known.delete(c.sessionId); }

  send(clients: Iterable<Client>, mobs: MobGrid<any>, heroAt: (sid: string) => { x: number; y: number } | undefined) {
    if (!this.known.size) return;
    const n = MOB_FIELDS.length;
    const tick = ++this.tick;
    // Only the monsters near some hero are looked at. A monster's wire values are brought up to date the first time
    // it is looked at in a patch (fresh), so what changed while nobody was near still goes out when someone comes
    for (const b of this.buckets.values()) { b.m.length = 0; this.pool.push(b); }
    this.buckets.clear();
    const fed = this.fed;
    fed.clear();
    for (const c of clients) {
      const known = this.known.get(c.sessionId);
      const at = known && heroAt(c.sessionId);
      if (!known || !at) continue;
      fed.add(c.sessionId);
      const hx = at.x / TILE, hy = at.y / TILE;
      const a: unknown[][] = [], ch: unknown[][] = [], r: string[] = [];
      // monsters still in view this patch: each known entry carries the patch it was last seen in (after the monster),
      // and they are counted (a monster sits in one bucket only, so none is counted twice)
      let seen = 0;
      const cx0 = Math.floor((hx - VIEW_DROP) / CELL), cx1 = Math.floor((hx + VIEW_DROP) / CELL);
      const cy0 = Math.floor((hy - VIEW_DROP) / CELL), cy1 = Math.floor((hy + VIEW_DROP) / CELL);
      for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
        const b = this.bucket(mobs, cx, cy, tick, n), bm = b.m, bid = b.id, bx = b.x, by = b.y;
        for (let bi = 0; bi < bm.length; bi++) {
          const m = bm[bi], id = bid[bi];
          const d = Math.max(Math.abs(bx[bi] - hx), Math.abs(by[bi] - hy));
          let was = known.get(id);
          if (was && was[n] !== m) { r.push(id); known.delete(id); was = undefined; } // same id, another monster: send it fresh
          if (was) {
            if (d > VIEW_DROP) continue; // left the view: removed below
            was[n + 1] = tick; seen++;
            if (m._wt !== tick) continue; // nothing changed on it since the last patch
            let row: unknown[] | undefined;
            const cur: unknown[] = m._wv;
            for (let i = 0; i < n; i++) {
              const v = cur[i];
              if (v !== was[i]) { was[i] = v; (row ??= [id]).push(i, v); }
            }
            if (row) ch.push(row);
          } else if (d <= VIEW_ADD) {
            seen++;
            const vals = (m._wv as unknown[]).slice();
            a.push([id, ...vals]);
            vals.push(m, tick); // (not sent) which monster these values belong to, and when it was last in view
            known.set(id, vals);
          }
        }
      }
      if (seen < known.size) known.forEach((v, id) => { if (v[n + 1] !== tick) { known.delete(id); r.push(id); } });
      if (!a.length && !ch.length && !r.length) continue;
      const msg: MobViewMsg = {};
      if (a.length) msg.a = a;
      if (ch.length) msg.c = ch;
      if (r.length) msg.r = r;
      c.send("mv", msg);
    }
    // A client not fed this patch (no hero yet) keeps what it knew: those monsters stay fresh, so that once it is fed
    // again it hears only what changed in that patch, exactly as when every monster was refreshed every patch
    if (fed.size < this.known.size) this.known.forEach((known, sid) => {
      if (!fed.has(sid)) for (const v of known.values()) { const m: any = v[n]; if (m._gm === mobs) fresh(m, tick, n); }
    });
  }

  /**
   * The monsters in one CELL bucket (PER x PER MobGrid squares), fresh, in map order (the order rows go out in), with
   * their ids and positions in tiles read once here: every hero near the bucket reads those instead of each monster.
   */
  private bucket(mobs: MobGrid<any>, bx: number, by: number, tick: number, n: number): Bucket {
    const key = bx * 4096 + by;
    let b = this.buckets.get(key);
    if (b) return b;
    b = this.pool.pop() ?? { m: [], id: [], x: [], y: [] };
    const ms = b.m;
    for (let sx = bx * PER; sx < bx * PER + PER; sx++) for (let sy = by * PER; sy < by * PER + PER; sy++) {
      const cell = mobs.cell(sx, sy);
      if (cell) for (const m of cell.values()) { fresh(m, tick, n); ms.push(m); }
    }
    if (ms.length > 1) ms.sort((p, q) => p._gs - q._gs);
    for (let i = 0; i < ms.length; i++) { const m = ms[i]; b.id[i] = m._gid; b.x[i] = m.x / TILE; b.y[i] = m.y / TILE; }
    b.id.length = b.x.length = b.y.length = ms.length;
    this.buckets.set(key, b);
    return b;
  }
}

/**
 * Brings a monster's wire values up to date from its own schema change list (field index -> change), once per patch,
 * so a monster that did nothing costs nothing and a busy one is worked out once however many heroes see it. `_wt`
 * marks a patch in which something changed. A monster nobody is near is not looked at and its change list waits:
 * @colyseus/schema keys it by field index (at most one entry per field), and it costs nothing meanwhile.
 */
function fresh(m: any, tick: number, n: number) {
  if (m._wp === tick) return;
  m._wp = tick;
  const ct = m[CHANGES], ops: Record<string, number> | undefined = ct?.indexedOperations;
  let changed = false;
  if (!m._wv) { m._wv = new Array(n); for (let i = 0; i < n; i++) m._wv[i] = wire(m, i); m._wt = tick; changed = true; }
  else if (ops) for (const k in ops) { const i = +k; if (i >= 0 && i < n) m._wv[i] = wire(m, i); m._wt = tick; changed = true; }
  if (ops && (changed || ct.changes.operations.length)) ct.discard(); // monsters are not in the synced state: nothing else reads these
}
