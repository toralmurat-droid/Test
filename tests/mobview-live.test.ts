// In a live room (heroes walking and fighting, monsters waking, dying and respawning), every "mv" message the mob
// view sends must equal what a plain reference sends: every monster on the map, every patch, all wire values worked
// out from scratch, rows in map order within each CELL bucket (the old full-map view's order).
import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, wait } from "./helpers/room";
import { MOB_FIELDS, POS_SCALE, VIEW_ADD, VIEW_DROP, X_FIELD, Y_FIELD } from "../shared/mobView";
import { TILE } from "../shared/constants";

const n = MOB_FIELDS.length, CELL = 8;
const wire = (m: any, i: number) => { const v = m[MOB_FIELDS[i]]; return i === X_FIELD || i === Y_FIELD ? Math.round(v * POS_SCALE) : v; };

/** The reference: no change lists, no grid; every monster, every patch. */
class FullView {
  known = new Map<string, Map<string, unknown[]>>();
  send(clients: any[], mobs: Map<string, any>, heroAt: (sid: string) => { x: number; y: number } | undefined, out: Map<string, string>) {
    const cur = new Map<any, unknown[]>(), grid = new Map<number, [string, any][]>();
    mobs.forEach((m, id) => {
      const v: unknown[] = []; for (let i = 0; i < n; i++) v.push(wire(m, i)); cur.set(m, v);
      const k = Math.floor(m.x / TILE / CELL) * 4096 + Math.floor(m.y / TILE / CELL);
      (grid.get(k) ?? grid.set(k, []).get(k)!).push([id, m]);
    });
    for (const c of clients) {
      const known = this.known.get(c.sessionId), at = known && heroAt(c.sessionId);
      if (!known || !at) continue;
      const hx = at.x / TILE, hy = at.y / TILE, a: unknown[][] = [], ch: unknown[][] = [], r: string[] = [], seen = new Set<string>();
      for (let cx = Math.floor((hx - VIEW_DROP) / CELL); cx <= Math.floor((hx + VIEW_DROP) / CELL); cx++)
        for (let cy = Math.floor((hy - VIEW_DROP) / CELL); cy <= Math.floor((hy + VIEW_DROP) / CELL); cy++) for (const [id, m] of grid.get(cx * 4096 + cy) ?? []) {
          const d = Math.max(Math.abs(m.x / TILE - hx), Math.abs(m.y / TILE - hy)), now = cur.get(m)!;
          let was = known.get(id);
          if (was && was[n] !== m) { r.push(id); known.delete(id); was = undefined; }
          if (was) {
            if (d > VIEW_DROP) continue;
            seen.add(id);
            let row: unknown[] | undefined;
            for (let i = 0; i < n; i++) if (now[i] !== was[i]) { was[i] = now[i]; (row ??= [id]).push(i, now[i]); }
            if (row) ch.push(row);
          } else if (d <= VIEW_ADD) { seen.add(id); a.push([id, ...now]); known.set(id, [...now, m]); }
        }
      if (seen.size < known.size) for (const id of known.keys()) if (!seen.has(id)) { known.delete(id); r.push(id); }
      if (!a.length && !ch.length && !r.length) continue;
      const msg: any = {}; if (a.length) msg.a = a; if (ch.length) msg.c = ch; if (r.length) msg.r = r;
      out.set(c.sessionId, JSON.stringify(msg));
    }
  }
}

test("live room: the mob view sends what a full every-monster view sends", async () => {
  const srv = await startRoom();
  try {
    const cs = [await srv.join(), await srv.join(), await srv.join()];
    const room = srv.room, view = room.mobView, send = view.send, ref = new FullView();
    let patches = 0, msgs = 0;
    const bad: string[] = [];
    view.send = function (clients: any[], mobs: any, heroAt: any) {
      for (const sid of view.known.keys()) if (!ref.known.has(sid)) ref.known.set(sid, new Map()); // said "mvready" since
      const got = new Map<string, string>(), want = new Map<string, string>();
      const spy = clients.map((c: any) => ({ sessionId: c.sessionId, send: (t: string, m: unknown) => { got.set(c.sessionId, JSON.stringify(m)); c.send(t, m); } }));
      send.call(this, spy, mobs, heroAt);
      ref.send(clients, mobs, heroAt, want);
      patches++; msgs += got.size;
      for (const sid of new Set([...got.keys(), ...want.keys()])) if (got.get(sid) !== want.get(sid) && bad.length < 5) bad.push(`patch ${patches} ${sid}:\n got ${got.get(sid)?.slice(0, 300)}\nwant ${want.get(sid)?.slice(0, 300)}`);
    };
    for (const c of cs) c.send("mvready");
    await wait(300);
    const ps = cs.map((c) => room.state.players.get(c.sessionId));
    const spots: any[] = [];
    room.state.mobs.forEach((m: any) => { if (!m.dead && !m.hidden && m.zone >= 0 && spots.length < 300) spots.push(m); });
    const dirs = [{ right: true }, { down: true }, { left: true }, { up: true }];
    for (let leg = 0; leg < 6; leg++) {
      ps.forEach((p: any, i: number) => { const m = spots[(leg * 37 + i * 11) % spots.length]; p.x = m.x + 40; p.y = m.y; p.invulnUntil = Date.now() + 60_000; });
      for (let k = 0; k < 6; k++) {
        cs.forEach((c, i) => { c.send("input", { up: false, down: false, left: false, right: false, ...dirs[(leg + k + i) % 4], seq: leg * 10 + k }); c.send("attack"); });
        await wait(120);
      }
    }
    view.send = send;
    assert.deepEqual(bad, []);
    assert.ok(patches > 50 && msgs > 100, `${patches} patches, ${msgs} messages`);
    for (const c of cs) await c.leave();
  } finally { await srv.stop(); }
});
