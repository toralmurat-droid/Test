// server/mobView.ts sends monster fields by their index in the schema: MOB_FIELDS must list the synced Mob fields
// in the same order. A field added in the middle of Mob would silently send wrong values to every client.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOB_FIELDS } from "../shared/mobView";
import { Mob } from "../server/TownRoom";

test("MOB_FIELDS matches the order of the synced Mob fields", () => {
  const md = (Mob as any)[Symbol.metadata];
  const names: string[] = [];
  for (let i = 0; md?.[i] !== undefined; i++) names.push(md[i].name);
  assert.deepEqual(names, [...MOB_FIELDS]);
});

test("a client following the monster feed sees the monsters where the server has them", async () => {
  const { startRoom, wait } = await import("./helpers/room");
  const { POS_SCALE, X_FIELD, Y_FIELD } = await import("../shared/mobView");
  const srv = await startRoom();
  try {
    const c = await srv.join();
    const seen = new Map<string, unknown[]>();
    c.onMessage("mv", (msg: any) => {
      for (const row of msg.a ?? []) seen.set(row[0], row.slice(1));
      for (const row of msg.c ?? []) { const v = seen.get(row[0]); if (v) for (let i = 1; i < row.length; i += 2) v[row[i]] = row[i + 1]; }
      for (const id of msg.r ?? []) seen.delete(id);
    });
    c.send("mvready");
    await wait(300);
    const room = srv.room, me = room.state.players.get(c.sessionId);
    // Stand among monsters and let them move for a while (some chase the hero)
    let near: any;
    room.state.mobs.forEach((m: any) => { if (!near && !m.dead && !m.hidden && m.zone === 0) near = m; });
    me.x = near.x + 40; me.y = near.y; me.invulnUntil = Date.now() + 60_000;
    await wait(2500);
    // Monsters keep moving between the last feed message and this check (more so on a busy machine): try a few
    // times, a wrong field index (the bug this guards against) is off every time and by far more
    const check = () => {
      let checked = 0, off = 0;
      for (const [id, v] of seen) {
        const m = room.state.mobs.get(id);
        if (!m || m.dead) continue;
        checked++;
        if (Math.abs((v[X_FIELD] as number) / POS_SCALE - m.x) > 24 || Math.abs((v[Y_FIELD] as number) / POS_SCALE - m.y) > 24) off++;
        assert.equal(v[0], m.kind);
      }
      return { checked, off };
    };
    let { checked, off } = check();
    for (let i = 0; i < 10 && off > 0; i++) { await wait(150); ({ checked, off } = check()); }
    assert.ok(checked > 5, `checked ${checked} monsters`);
    assert.equal(off, 0, `${off} of ${checked} monsters are not where the server has them`);
    await c.leave();
  } finally {
    await srv.stop();
  }
});

// The mob view used to refresh and re-bucket every monster on every patch; it now only looks at the MobGrid squares
// near a fed hero. OldView below is the previous send, kept verbatim as the reference: both are driven through the
// same scripted scene (two identical worlds, since each discards its monsters' change lists) and must send the
// very same messages, rows in the same order.
test("the mob view sends exactly what the old full-map view sent (adds, changes, removals, order)", async () => {
  const { MobView } = await import("../server/mobView");
  const { MobGrid } = await import("../server/mobGrid");
  const { MOB_FIELDS, POS_SCALE, VIEW_ADD, VIEW_DROP, X_FIELD, Y_FIELD } = await import("../shared/mobView");
  const TILE = 32, CELL = 8, n = MOB_FIELDS.length;
  const wire = (m: any, i: number) => { const v = m[MOB_FIELDS[i]]; return i === X_FIELD || i === Y_FIELD ? Math.round(v * POS_SCALE) : v; };
  class OldView {
    known = new Map<string, Map<string, unknown[]>>(); tick = 0;
    ready(c: any) { this.known.set(c.sessionId, new Map()); }
    leave(c: any) { this.known.delete(c.sessionId); }
    send(clients: Iterable<any>, mobs: Map<string, any>, heroAt: (sid: string) => { x: number; y: number } | undefined) {
      if (!this.known.size) return;
      const tick = ++this.tick;
      const grid = new Map<number, [string, any][]>();
      mobs.forEach((m, id) => {
        const ct = m["~changes"], ops: Record<string, number> | undefined = ct?.indexedOperations;
        let changed = false;
        if (!m._wv) { m._wv = new Array(n); for (let i = 0; i < n; i++) m._wv[i] = wire(m, i); m._wt = tick; changed = true; }
        else if (ops) for (const k in ops) { const i = +k; if (i >= 0 && i < n) m._wv[i] = wire(m, i); m._wt = tick; changed = true; }
        if (ops && (changed || ct.changes.operations.length)) ct.discard();
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
            if (was && was[n] !== m) { r.push(id); known.delete(id); was = undefined; }
            if (was) {
              if (d > VIEW_DROP) continue;
              seen.add(id);
              if (m._wt !== tick) continue;
              let row: unknown[] | undefined;
              const cur: unknown[] = m._wv;
              for (let i = 0; i < n; i++) { const v = cur[i]; if (v !== was[i]) { was[i] = v; (row ??= [id]).push(i, v); } }
              if (row) ch.push(row);
            } else if (d <= VIEW_ADD) {
              seen.add(id);
              const vals = (m._wv as unknown[]).slice();
              a.push([id, ...vals]);
              vals.push(m);
              known.set(id, vals);
            }
          }
        }
        if (seen.size < known.size) for (const id of known.keys()) if (!seen.has(id)) { known.delete(id); r.push(id); }
        if (!a.length && !ch.length && !r.length) continue;
        const msg: any = {};
        if (a.length) msg.a = a;
        if (ch.length) msg.c = ch;
        if (r.length) msg.r = r;
        c.send("mv", msg);
      }
    }
  }

  /** One world: monsters, three heroes, a view and what each client received, driven by a seeded script. */
  function run(view: { ready(c: any): void; leave(c: any): void; send(cl: any[], mobs: any, at: (s: string) => any): void }) {
    let s = 12345;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const W = 260 * TILE, mobs = new MobGrid<Mob>(), log: string[] = [];
    const kinds = ["slime", "skeleton", "wolf"] as const;
    const make = () => { const m = new Mob(); m.kind = kinds[Math.floor(rnd() * 3)] as any; m.x = rnd() * W; m.y = rnd() * W; m.hp = m.maxHp = 50; return m; };
    let seq = 0;
    for (let i = 0; i < 1500; i++) mobs.set(`m${seq++}`, make());
    const heroes: Record<string, { x: number; y: number } | undefined> = { A: { x: W / 2, y: W / 2 }, B: { x: W / 2 + 900, y: W / 2 }, C: { x: 2000, y: 2000 } };
    const client = (sid: string) => ({ sessionId: sid, send: (t: string, msg: unknown) => log.push(`${sid} ${t} ${JSON.stringify(msg)}`) });
    const clients = [client("A"), client("B"), client("C")];
    view.ready(clients[0]); view.ready(clients[1]);
    for (let step = 0; step < 300; step++) {
      if (step === 20) view.ready(clients[2]);
      if (step === 60) heroes.C = undefined; // no hero for a while (a client known but not fed)
      if (step === 90) heroes.C = { x: 2050, y: 2000 };
      if (step === 150) heroes.B = { x: 300, y: W - 300 }; // a waygate jump: everything known is removed, the rest added
      if (step === 220) heroes.B = { x: W / 2 + 600, y: W / 2 + 200 };
      if (step === 250) view.leave(clients[0]);
      if (step === 270) view.ready(clients[0]);
      for (const h of Object.values(heroes)) if (h) { h.x += (rnd() - 0.5) * 60; h.y += (rnd() - 0.4) * 60; }
      const ids = [...mobs.keys()], pick = () => mobs.get(ids[Math.floor(rnd() * ids.length)]);
      for (let k = 0; k < 200; k++) {
        const a = rnd(), m = pick();
        if (!m) continue; // deleted earlier this step
        if (a < 0.6) { m.x += (rnd() - 0.5) * 20; m.y += (rnd() - 0.5) * 20; m.moving = rnd() < 0.5; m.dir = rnd() < 0.5 ? "left" : "up"; }
        else if (a < 0.75) m.hp = Math.max(0, m.hp - 5);
        else if (a < 0.8) { m.dead = true; m.fx = "burn"; }
        else if (a < 0.83) { m.dead = false; m.hp = m.maxHp; m.fx = ""; }
        else if (a < 0.86) { m.x = rnd() * W; m.y = rnd() * W; } // teleport
        else if (a < 0.88) mobs.delete(m._gid);
        else if (a < 0.9) mobs.set(`m${seq++}`, make());
        else if (a < 0.91) mobs.set(m._gid, make()); // same id, another monster
        else if (a < 0.92) { const id = m._gid; mobs.delete(id); mobs.set(id, m); } // back in, at the end of the order
        else if (a < 0.93) { m.stunned = !m.stunned; m.title = rnd() < 0.5 ? "" : "Elite"; }
      }
      // monsters right round each hero, so every patch has adds, changes and removals near them
      for (const h of Object.values(heroes)) if (h && rnd() < 0.3) { const m = make(); m.x = h.x + (rnd() - 0.5) * 2 * VIEW_DROP * TILE; m.y = h.y + (rnd() - 0.5) * 2 * VIEW_DROP * TILE; mobs.set(`m${seq++}`, m); }
      view.send(clients, mobs, (sid) => heroes[sid]);
    }
    return log;
  }

  const want = run(new OldView()), got = run(new MobView() as any);
  assert.ok(want.length > 500, `${want.length} messages`);
  const kinds = { a: 0, c: 0, r: 0 };
  for (const l of want) for (const k of ["a", "c", "r"] as const) if (l.includes(`"${k}":`)) kinds[k]++;
  assert.ok(kinds.a > 50 && kinds.c > 200 && kinds.r > 50, JSON.stringify(kinds));
  assert.equal(got.length, want.length);
  for (let i = 0; i < want.length; i++) assert.equal(got[i], want[i], `message ${i}`);
});
