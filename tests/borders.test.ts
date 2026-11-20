import { test } from "node:test";
import assert from "node:assert/strict";
import { actOfTile, MAP_H, MAP_W, TILE } from "../shared/constants";
import { isSolidTile, OBJECTS, SIGNPOSTS, T } from "../shared/map";
import { ARRIVE, BORDERS, BORDER_BOXES, crossTo, edgeTile, endPath, LAND_ROWS, otherEnd, outward, roadTiles, SEAM, seamAt } from "../shared/borders";
import { actAt, actSpawn, borderOpen, borderShutNote } from "../shared/act2";
import { randomSpawn } from "../shared/map";
import { startRoom, until, wait } from "./helpers/room";

/** 4-way flood over free tiles from (sx, sy). */
function flood(sx: number, sy: number) {
  const seen = new Uint8Array(MAP_W * MAP_H), q = [sy * MAP_W + sx];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % MAP_W, y = (q[i] / MAP_W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || isSolidTile(nx, ny) || seen[ny * MAP_W + nx]) continue;
      seen[ny * MAP_W + nx] = 1; q.push(ny * MAP_W + nx);
    }
  }
  return seen;
}
const tileOf = (p: { x: number; y: number }) => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)] as const;

test("borders: every road runs from its land's open ground to the band's edge, free all the way", () => {
  const ends = BORDERS.flatMap((b) => [b.a, b.b]);
  assert.equal(new Set(BORDERS.map((b) => b.id)).size, BORDERS.length);
  // each land is joined to its neighbours on the continent: every land has a road, and they link all six
  const seen = new Set<number>([1]);
  for (let k = 0; k < 6; k++) for (const b of BORDERS) if (seen.has(b.a.land) || seen.has(b.b.land)) { seen.add(b.a.land); seen.add(b.b.land); }
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5, 6], "all six lands joined on foot");
  const floods = new Map<number, Uint8Array>();
  for (const e of ends) {
    const { y0, h } = LAND_ROWS[e.land], [ex, ey] = edgeTile(e);
    const onEdge = e.side === "w" ? ex === 0 : e.side === "e" ? ex === MAP_W - 1 : e.side === "n" ? ey === y0 : ey === y0 + h - 1;
    assert.ok(onEdge, `${e.side} end at ${ex},${ey} is on its band's edge`);
    for (const k of roadTiles(e).all) {
      const x = k % MAP_W, y = Math.floor(k / MAP_W);
      assert.ok(!isSolidTile(x, y), `road tile ${x},${y} is free`);
      assert.equal(actOfTile(x, y), e.land, `road tile ${x},${y} lies in its land`);
    }
    // the road joins the land's own open ground (the spawn there)
    const s = actSpawn(e.land, randomSpawn), [sx, sy] = tileOf(s);
    if (!floods.has(e.land)) floods.set(e.land, flood(sx, sy));
    assert.ok(floods.get(e.land)![ey * MAP_W + ex], `the ${e.side} edge of land ${e.land} at ${ex},${ey} is reachable on foot`);
    const [px, py] = endPath(e)[0];
    assert.ok(BORDER_BOXES.some((b) => px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1));
  }
});

test("borders: the roads leave every signpost standing", () => {
  for (const sp of SIGNPOSTS) assert.equal(OBJECTS[sp.y][sp.x], T.SIGNPOST, `signpost at ${sp.x},${sp.y}`);
});

test("borders: walking into the mist comes out at the other end, walking on, and back again", () => {
  for (const b of BORDERS) for (const e of [b.a, b.b]) {
    const [ex, ey] = edgeTile(e), [ox, oy] = outward(e.side), to = otherEnd(b, e);
    for (const side of [-1, 0, 1]) {
      // a hero one tile from the edge, on the left / middle / right of the road
      const lx = ox === 0 ? side : 0, ly = oy === 0 ? side : 0;
      const x = (ex + 0.5 - ox * 1 + lx * 0.9) * TILE, y = (ey + 0.5 - oy * 1 + ly * 0.9) * TILE;
      const s = seamAt(x, y);
      assert.ok(s && s.b === b && s.from === e, `${b.id}: in the seam`);
      const at = crossTo(b, e, x, y);
      assert.equal(at.to, to);
      assert.equal(actAt(at.y, at.x), to.land, `${b.id}: out in land ${to.land}`);
      assert.ok(!isSolidTile(...tileOf(at)), `${b.id}: out on free ground`);
      assert.equal(seamAt(at.x, at.y), undefined, `${b.id}: not straight back into the mist`);
      // walking back the way they came, they come out where they went in (on the same side of the road)
      const [tx, ty] = edgeTile(to), [px, py] = outward(to.side);
      const back = crossTo(b, to, at.x + px * (ARRIVE - 1) * TILE, at.y + py * (ARRIVE - 1) * TILE);
      assert.ok(Math.hypot(back.x - (x - ox * (ARRIVE - 1) * TILE), back.y - (y - oy * (ARRIVE - 1) * TILE)) < 2, `${b.id}: round trip`);
      void tx; void ty;
    }
    assert.equal(seamAt((ex + 0.5 - ox * (SEAM + 1)) * TILE, (ey + 0.5 - oy * (SEAM + 1)) * TILE), undefined, "further in: no crossing");
  }
});

test("borders: a road into a land opens like its gates, going home is always open", () => {
  const b = BORDERS.find((o) => o.id === "eastmarch")!;
  assert.equal(b.b.land, 3);
  assert.equal(borderOpen(b.b, { level: 19 } as never), false);
  assert.equal(borderOpen(b.b, { level: 20 } as never), true);
  assert.equal(borderOpen(b.a, { level: 1 } as never), true, "home to Oakvale");
  assert.equal(borderShutNote(b, b.b), "The mist of the Eastmarch Pass will not part. The Grey Barrow Moors wants level 20.");
  const sun = BORDERS.find((o) => o.id === "ashenpass")!;
  assert.equal(borderOpen(sun.b, { level: 29, quests: {} } as never), false, "the Sunscar wants level 30");
  assert.equal(borderOpen(sun.b, { level: 30, quests: {} } as never), true, "by level only, no bosses (coherence review 2026-11-20)");
  assert.match(borderShutNote(sun, sun.b), /wants level 30/);
});

test("room: a hero walks the Eastmarch Pass into the moors at Lv 20, and is stopped at Lv 19", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    const crossed: number[] = [], notes: string[] = [];
    c.onMessage("border", (m: { land: number }) => crossed.push(m.land));
    c.onMessage("chat", (m: { text: string }) => notes.push(m.text));
    await wait(200);
    const p = srv.room.state.players.get(c.sessionId);
    const b = BORDERS.find((o) => o.id === "eastmarch")!, [ex, ey] = edgeTile(b.a);
    const put = () => { p.x = (ex - 3.5) * TILE; p.y = (ey + 0.5) * TILE; p.lastHurt = 0; };
    // nobody in the way: no monster near the road's end to start a fight (a fight holds the hero at the mist)
    srv.room.state.mobs.forEach((m: any, id: string) => { if (Math.hypot(m.x - ex * TILE, m.y - ey * TILE) < 30 * TILE) srv.room.state.mobs.delete(id); });
    p.level = 19; put();
    c.send("input", { up: false, down: false, left: false, right: true, seq: 1 });
    assert.ok(await until(() => notes.some((t) => /will not part/.test(t)), 15000), "the shut note");
    assert.deepEqual(crossed, []);
    assert.equal(actAt(p.y, p.x), 1, "still in Oakvale");
    p.level = 20; put();
    assert.ok(await until(() => { p.lastHurt = 0; return crossed.length === 1; }, 15000), "crossed"); // (no stray monster's hit holds the hero)
    assert.deepEqual(crossed, [3]);
    assert.equal(actAt(p.y, p.x), 3, "in the moors");
    c.send("input", { up: false, down: false, left: false, right: false, seq: 2 });
  } finally { await srv.stop(); }
});
