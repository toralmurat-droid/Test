import { test } from "node:test";
import assert from "node:assert/strict";
import { TERRITORIES } from "../shared/war/territories";
import { REGIONS } from "../shared/war/regions";
import { BANNER_BOX, inPoly, layoutTerritories, SLOTS, WT_H, WT_W } from "../client/src/warTableLayout";

const placed = layoutTerritories(TERRITORIES);
const slot = (k: string) => SLOTS.find((s) => s.key === k)!;

test("war table: every land of REGIONS has a slot, the Crown sits in the centre", () => {
  for (const r of REGIONS) assert.ok(slot(r.key), r.key);
  const c = slot("crown").core;
  assert.ok(Math.abs(c[0] - WT_W / 2) < 120 && Math.abs(c[1] - WT_H / 2) < 120);
});

test("war table: slots do not overlap", () => {
  for (let x = 2.5; x < WT_W; x += 5) for (let y = 2.5; y < WT_H; y += 5) {
    const n = SLOTS.filter((s) => inPoly([x, y], s.poly)).length;
    assert.ok(n <= 1, `(${x},${y}) lies in ${n} lands`);
  }
});

test("war table: every territory is placed inside its own land, apart from the others", () => {
  assert.equal(placed.length, TERRITORIES.length);
  for (const p of placed) assert.ok(inPoly([p.x, p.y], slot(TERRITORIES[p.id].region).poly), `territory ${p.id}`);
  for (const a of placed) for (const b of placed) {
    if (a.id < b.id && TERRITORIES[a.id].region === TERRITORIES[b.id].region) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 28, `${a.id} / ${b.id}`);
  }
});

test("war table: the layout is deterministic and keeps the west-east order inside a land", () => {
  assert.deepEqual(layoutTerritories(TERRITORIES), placed);
  const oak = TERRITORIES.filter((t) => t.region === "oakvale"), by = (id: number) => placed.find((p) => p.id === id)!;
  const w = oak.reduce((a, b) => (b.cx < a.cx ? b : a)), e = oak.reduce((a, b) => (b.cx > a.cx ? b : a));
  assert.ok(by(w.id).x < by(e.id).x);
});

test("war table: territories keep clear of the standing banners", () => {
  for (const s of SLOTS) {
    if (!s.banner) continue;
    for (const p of placed) {
      if (TERRITORIES[p.id].region !== s.key) continue;
      const inBox = Math.abs(p.x - s.banner.x) < BANNER_BOX.x && p.y > s.banner.y + BANNER_BOX.y0 && p.y < s.banner.y + BANNER_BOX.y1;
      assert.ok(!inBox, `territory ${p.id} under the ${s.key} banner`);
    }
  }
});

test("war table: a land's frame maps tiles to the sheet and back, so the painted ground lines up with the markers", async () => {
  const { landFrame, sheetToTile, tileToSheet } = await import("../client/src/warTableLayout");
  for (const s of SLOTS) {
    const mine = TERRITORIES.filter((t) => t.region === s.key), f = landFrame(s, mine);
    if (!mine.length) { assert.equal(f, undefined); continue; }
    for (const t of mine) {
      const [x, y] = tileToSheet(f!, t.cx, t.cy), [tx, ty] = sheetToTile(f!, x, y);
      assert.ok(Math.abs(tx - t.cx) < 1e-6 && Math.abs(ty - t.cy) < 1e-6, `${s.key} ${t.id}`);
    }
  }
});
