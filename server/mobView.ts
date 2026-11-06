import type { Client } from "colyseus";
import { MOB_FIELDS, POS_SCALE, VIEW_ADD, VIEW_DROP, X_FIELD, Y_FIELD, type MobViewMsg } from "../shared/mobView";
import { TILE } from "../shared/constants";

/** What the server sends: the value of a field as it goes on the wire (positions as whole 1/POS_SCALE px). */
function wire(m: any, i: number): unknown {
  const v = m[MOB_FIELDS[i]];
  return i === X_FIELD || i === Y_FIELD ? Math.round(v * POS_SCALE) : v;
}

const CELL = 8; // tiles per bucket of the grid used to find the monsters near a hero

/**
 * Sends each hero only the monsters around them (shared/mobView.ts), with what changed since last time.
 * Call `send` once per patch, before the state patch goes out, so a hero gets both parts of an update together.
 */
export class MobView {
  /** Per client: monster id -> the values it was last sent. Only clients that said "mvready" are fed. */
  private known = new Map<string, Map<string, unknown[]>>();
  private tick = 0;

  ready(c: Client) { this.known.set(c.sessionId, new Map()); }
  leave(c: Client) { this.known.delete(c.sessionId); }

  send(clients: Iterable<Client>, mobs: Map<string, any>, heroAt: (sid: string) => { x: number; y: number } | undefined) {
    if (!this.known.size) return;
    const n = MOB_FIELDS.length;
    const tick = ++this.tick;
    // Bucket the monsters once, then every hero only looks at the buckets around them
    const grid = new Map<number, [string, any][]>();
    mobs.forEach((m, id) => {
      // Each monster's wire values, kept up to date from its own schema change list (field index -> change), so a
      // monster that did nothing costs nothing and a busy one is worked out once however many heroes see it
      const ch: Map<number, unknown> = m.$changes.changes;
      if (!m._wv) { m._wv = new Array(n); for (let i = 0; i < n; i++) m._wv[i] = wire(m, i); m._wt = tick; }
      else if (ch.size) { for (const i of ch.keys()) if (i >= 0 && i < n) m._wv[i] = wire(m, i); m._wt = tick; }
      if (ch.size) ch.clear();
      const k = Math.floor(m.x / TILE / CELL) * 4096 + Math.floor(m.y / TILE / CELL);
      let b = grid.get(k); if (!b) grid.set(k, (b = []));
      b.push([id, m]);
    });
    for (const c of clients) {
      const known = this.known.get(c.sessionId);
      const at = known && heroAt(c.sessionId);
      if (!known || !at) continue;
      const hx = at.x / TILE, hy = at.y / TILE;
      const a: unknown[][] = [], ch: unknown[][] = [], r: string[] = [];
      const seen = new Set<string>();
      const cx0 = Math.floor((hx - VIEW_DROP) / CELL), cx1 = Math.floor((hx + VIEW_DROP) / CELL);
      const cy0 = Math.floor((hy - VIEW_DROP) / CELL), cy1 = Math.floor((hy + VIEW_DROP) / CELL);
      for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
        const b = grid.get(cx * 4096 + cy);
        if (!b) continue;
        for (const [id, m] of b) {
          const d = Math.max(Math.abs(m.x / TILE - hx), Math.abs(m.y / TILE - hy));
          let was = known.get(id);
          if (was && was[n] !== m) { r.push(id); known.delete(id); was = undefined; } // same id, another monster: send it fresh
          if (was) {
            if (d > VIEW_DROP) continue; // left the view: removed below
            seen.add(id);
            if (m._wt !== tick) continue; // nothing changed on it since the last patch
            let row: unknown[] | undefined;
            const cur: unknown[] = m._wv;
            for (let i = 0; i < n; i++) {
              const v = cur[i];
              if (v !== was[i]) { was[i] = v; (row ??= [id]).push(i, v); }
            }
            if (row) ch.push(row);
          } else if (d <= VIEW_ADD) {
            seen.add(id);
            const vals = (m._wv as unknown[]).slice();
            a.push([id, ...vals]);
            vals.push(m); // (not sent) which monster these values belong to
            known.set(id, vals);
          }
        }
      }
      if (seen.size < known.size) for (const id of known.keys()) if (!seen.has(id)) { known.delete(id); r.push(id); }
      if (!a.length && !ch.length && !r.length) continue;
      const msg: MobViewMsg = {};
      if (a.length) msg.a = a;
      if (ch.length) msg.c = ch;
      if (r.length) msg.r = r;
      c.send("mv", msg);
    }
  }
}
