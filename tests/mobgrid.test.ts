// server/mobGrid.ts: the monster map that also buckets monsters by square. Its inBox must give exactly what the old
// full-map box scan gave (same monsters, same order), however monsters move, come and go.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MobGrid, type GridUnit } from "../server/mobGrid";
import { Mob } from "../server/TownRoom";

/** The old way: every monster, map order, box test. */
function scan<T extends GridUnit>(g: Map<string, T>, x: number, y: number, r: number): string[] {
  const out: string[] = [];
  g.forEach((m, id) => { const dx = m.x - x, dy = m.y - y; if (!(dx > r || dx < -r || dy > r || dy < -r)) out.push(id); });
  return out;
}

/** A bare unit that reports its moves like a Mob does (trackSchemaMoves). */
class Unit implements GridUnit {
  _gm: MobGrid<any> | null = null; _gid = ""; _gk = NaN; _gs = 0; _gb = false; _gv = 0;
  private _x = 0; private _y = 0;
  constructor(x: number, y: number) { this._x = x; this._y = y; }
  get x() { return this._x; } set x(v) { this._x = v; this._gm?.moved(this); }
  get y() { return this._y; } set y(v) { this._y = v; this._gm?.moved(this); }
}
const plain = (x: number, y: number): GridUnit => new Unit(x, y);

function fuzz(make: (x: number, y: number) => GridUnit, seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const W = 3000;
  const g = new MobGrid<GridUnit>();
  let n = 0;
  for (let i = 0; i < 400; i++) g.set(`m${n++}`, make(rnd() * W, rnd() * W));
  for (let step = 0; step < 3000; step++) {
    const ids = [...g.keys()], pick = () => ids[Math.floor(rnd() * ids.length)];
    const a = rnd();
    if (a < 0.5) { const m = g.get(pick())!; m.x += (rnd() - 0.5) * 40; m.y += (rnd() - 0.5) * 40; }
    else if (a < 0.6) { const m = g.get(pick())!; m.x = rnd() * W; m.y = rnd() * W; } // teleport
    else if (a < 0.7) g.set(`m${n++}`, make(rnd() * W, rnd() * W));
    else if (a < 0.75) g.delete(pick());
    else if (a < 0.78) g.set(pick(), make(rnd() * W, rnd() * W)); // same id, another monster: keeps its place
    else if (a < 0.8) { const id = pick(), m = g.get(id)!; g.delete(id); g.set(id, m); } // back in, at the end
    const x = rnd() * W, y = rnd() * W, r = rnd() < 0.05 ? rnd() * 4 * W : rnd() * 300;
    assert.deepEqual(g.inBox(x, y, r).map(([id]) => id), scan(g, x, y, r), `step ${step}`);
  }
  // A monster exactly on the edge of the box, on a square boundary
  const e = make(256, 384); g.set("edge", e);
  assert.ok(g.inBox(128, 256, 128).some(([id]) => id === "edge"));
  assert.ok(!g.inBox(128, 256, 127.999).some(([id]) => id === "edge"));
}

test("inBox matches a full scan (plain objects)", () => fuzz(plain, 7));

test("inBox matches a full scan (real Mob schema instances, moves still tracked by the schema)", () => {
  fuzz((x, y) => { const m = new Mob(); m.x = x; m.y = y; return m; }, 11);
  const m = new Mob(), g = new MobGrid<Mob>();
  g.set("a", m);
  m.x = 1000; m.y = 1000;
  assert.deepEqual(g.inBox(1000, 1000, 1).map(([id]) => id), ["a"]);
  assert.equal(m.x, 1000);
  const ops = (m as any)["~changes"]?.indexedOperations ?? {};
  assert.ok(Object.keys(ops).length > 0, "the schema still sees the change (server/mobView.ts relies on it)");
});

test("a deleted or cleared monster is no longer found, and its moves are ignored", () => {
  const g = new MobGrid<GridUnit>(), a = plain(10, 10), b = plain(20, 20);
  g.set("a", a).set("b", b);
  g.delete("a");
  a.x = 20; a.y = 20;
  assert.deepEqual(g.inBox(20, 20, 5).map(([id]) => id), ["b"]);
  g.clear();
  b.x = 30;
  assert.deepEqual(g.inBox(30, 20, 5), []);
  assert.equal(g.size, 0);
});

// Passes (the room's tick): the busy set plus the warm squares, in map order, with monsters woken, added, replaced,
// deleted or moved while the pass runs, must visit exactly the not-frozen monsters a Map.forEach would have reached.
test("a pass visits what a full forEach with the frozen test would, while monsters change under it", () => {
  class S extends Unit { sleep = false; }
  const W = 4000, WARM = 256;
  const world = (useGrid: boolean, seed: number) => {
    let s = seed;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const g = new MobGrid<S>(), warm = new Set<number>();
    const isWarm = (x: number, y: number) => warm.has(Math.floor(x / WARM) * 1000 + Math.floor(y / WARM));
    const frozen = (u: S) => u.sleep && !isWarm(u.x, u.y);
    const wake = (u: S) => { u.sleep = false; g.wake(u); };
    let n = 0;
    const add = () => g.set(`u${n++}`, new S(rnd() * W, rnd() * W));
    for (let i = 0; i < 600; i++) add();
    const out: string[] = [];
    for (let tick = 0; tick < 60; tick++) {
      warm.clear();
      for (let k = 0; k < 6; k++) warm.add(Math.floor(rnd() * W / WARM) * 1000 + Math.floor(rnd() * W / WARM));
      const visit = (u: S, id: string) => {
        if (frozen(u)) { if (useGrid) g.rest(u); return; }
        out.push(`${tick}:${id}`);
        const ids = [...g.keys()], o = g.get(ids[Math.floor(rnd() * ids.length)]);
        const a = rnd();
        if (a < 0.5) u.sleep = true; // dozes off (the room's dozing test)
        else if (a < 0.55 && o) wake(o); // gives another a target
        else if (a < 0.6) add();
        else if (a < 0.63 && o) g.delete(o._gid);
        else if (a < 0.65 && o) g.set(o._gid, new S(rnd() * W, rnd() * W));
        else if (a < 0.67 && o) { const oid = o._gid; g.delete(oid); g.set(oid, o); }
        else if (a < 0.75 && o) { o.x = rnd() * W; o.y = rnd() * W; } // pushed somewhere (perhaps into a warm square)
        u.x += (rnd() - 0.5) * 300; u.y += (rnd() - 0.5) * 300;
      };
      if (!useGrid) { g.forEach(visit); continue; }
      g.beginPass();
      for (const k of warm) { const cx = Math.floor(k / 1000) * 2, cy = (k % 1000) * 2; g.passCells(cx, cy, cx + 1, cy + 1); }
      g.sortPass();
      g.runPass(visit);
    }
    return out;
  };
  for (const seed of [3, 5, 8]) {
    const want = world(false, seed), got = world(true, seed);
    assert.ok(want.length > 1000, `${want.length} visits`);
    assert.deepEqual(got, want, `seed ${seed}`);
  }
});
