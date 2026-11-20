import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { actOfTile, TILE } from "../shared/constants";
import { AREAS, EMPTY, GROUND, HIGHWAY_TILES, isSolidAt, NATURE, OBJECTS, PORTAL_SPOTS, SIGNPOSTS, T } from "../shared/map";
import { isDecorSolidAt, NPCS, NPC_DECOR } from "../shared/npcs";
import { LANDMARKS, LANDMARK_SOLIDS } from "../shared/landmarks";
import { CHESTS } from "../shared/chests";
import { SIEGE_SITES } from "../shared/siege";
import { HOLDS, MUSTERS } from "../shared/war/standards";
import { CAPITAL_FORTS } from "../shared/highways";
import { buildLandKit, inSeat, KIT_BUDGET, kitFree, LAND_KIT_SPOTS, LANDMARK_SHEET, LK_SHEETS, ON_FIELD, type LkKind } from "../client/src/landKit";

// Land identity (settlement network step 3): kit props (client, walk-through) and landmarks (shared, solid)
const MW = GROUND[0].length;
const tileOf = (x: number, y: number) => [Math.floor(x / TILE), Math.floor(y / TILE)] as const;

test("land kit spots are deterministic", () => {
  assert.deepEqual(buildLandKit(), LAND_KIT_SPOTS);
  assert.ok(LAND_KIT_SPOTS.length > 0);
});

test("every kit prop stands in its area and its land, and passes the keep-clear rule", () => {
  for (const s of LAND_KIT_SPOTS) {
    const [tx, ty] = tileOf(s.x, s.y), a = AREAS.find((r) => r.name === s.area)!;
    const at = `${s.kind} at ${tx},${ty}`;
    assert.ok(a && tx >= a.x && tx < a.x + a.w && ty >= a.y && ty < a.y + a.h, `${at}: outside ${s.area}`);
    assert.equal(actOfTile(tx, ty), s.land, `${at}: wrong land`);
    assert.ok(kitFree(tx, ty, [], 0, ON_FIELD.has(s.kind)), `${at}: not clear`);
  }
});

test("kit props keep off roads, water and highways, and clear of NPCs, signposts, chests, portals, forts and musters", () => {
  const near = (x: number, y: number, ps: readonly { x: number; y: number }[], r: number, px: boolean) =>
    ps.some((p) => Math.hypot((px ? p.x / TILE : p.x + 0.5) - x, (px ? p.y / TILE : p.y + 0.5) - y) < r);
  for (const s of LAND_KIT_SPOTS) {
    const [tx, ty] = tileOf(s.x, s.y), x = tx + 0.5, y = ty + 0.5, at = `${s.kind} at ${tx},${ty}`;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const g = GROUND[ty + j][tx + i];
      assert.ok(g !== T.WATER && g !== T.COBBLE && g !== T.BRIDGE && g !== T.MARBLE && !HIGHWAY_TILES.has((ty + j) * MW + tx + i), `${at}: by a road or water`);
      assert.ok(OBJECTS[ty + j][tx + i] === EMPTY || NATURE.has(OBJECTS[ty + j][tx + i]), `${at}: against a built object`);
    }
    assert.equal(OBJECTS[ty][tx], EMPTY, `${at}: on an object`);
    assert.ok(!near(x, y, NPCS, 2.5, true), `${at}: by an NPC`);
    assert.ok(!NPC_DECOR.some((d) => Math.hypot(d.x - x, d.y - y) < 2.5), `${at}: by an NPC's prop`);
    assert.ok(!near(x, y, SIGNPOSTS, 2, false) && !near(x, y, CHESTS, 2, true), `${at}: by a signpost or chest`);
    assert.ok(!near(x, y, PORTAL_SPOTS, 3, false), `${at}: by a portal stone`);
    assert.ok(!near(x, y, [...HOLDS, ...MUSTERS], 7, true), `${at}: by a fort or muster`);
    assert.ok(!SIEGE_SITES.some((t) => Math.abs(t.tx - tx) <= 9 && Math.abs(t.ty - ty) <= 4), `${at}: in a siege site`);
    assert.ok(!inSeat(tx, ty), `${at}: in a clan seat (dressed in step 5)`);
  }
});

test("no kit prop in a clan seat: a capital fort's box + 12", () => {
  for (const [fx, fy] of CAPITAL_FORTS) for (const s of LAND_KIT_SPOTS) {
    const [tx, ty] = tileOf(s.x, s.y);
    assert.ok(Math.abs(tx - fx) > 16 || Math.abs(ty - fy) > 16, `${s.kind} at ${tx},${ty} in the seat at ${fx},${fy}`);
  }
});

test("per-land budget: at most 40 kit props and one landmark", () => {
  const by = new Map<number, number>();
  for (const s of LAND_KIT_SPOTS) by.set(s.land, (by.get(s.land) ?? 0) + 1);
  for (const [land, n] of by) assert.ok(n <= KIT_BUDGET, `land ${land}: ${n} props`);
  const marks = new Map<number, number>();
  for (const l of LANDMARKS) marks.set(l.land, (marks.get(l.land) ?? 0) + 1);
  for (const [land, n] of marks) assert.ok(n <= 1, `land ${land}: ${n} landmarks`);
});

/** Width and height from a PNG's IHDR. */
const pngSize = (path: string) => { const b = readFileSync(path); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test("every kit kind and landmark has a sheet size and a baked sheet of that size", () => {
  const used = new Set<LkKind>([...LAND_KIT_SPOTS.map((s) => s.kind), ...LANDMARKS.map((l) => LANDMARK_SHEET[l.id])]);
  for (const k of used) {
    const s = LK_SHEETS[k];
    assert.ok(s, `${k}: no size`);
    assert.deepEqual(pngSize(`client/public/assets/hd/props/${k}.png`), [s.w * s.frames, s.h], `${k}: sheet size`);
    assert.ok(s.ox > 0 && s.ox < s.w && s.oy > 0 && s.oy <= s.h, `${k}: foot outside the frame`);
  }
});

test("landmarks: solid boxes on open ground in their area and land, blocking movement, not NPC_DECOR", () => {
  assert.equal(LANDMARK_SOLIDS.length, LANDMARKS.filter((l) => l.solid).length);
  for (const l of LANDMARKS) {
    const a = AREAS.find((r) => r.name === l.area)!;
    assert.ok(a && l.x >= a.x && l.x < a.x + a.w && l.y >= a.y && l.y < a.y + a.h, `${l.id}: outside ${l.area}`);
    assert.equal(actOfTile(Math.floor(l.x), Math.floor(l.y)), l.land, `${l.id}: wrong land`);
    assert.ok(LANDMARK_SHEET[l.id], `${l.id}: no art`);
    assert.ok(!NPC_DECOR.some((d) => d.prop === l.id || d.prop.startsWith("lk_")), "landmarks stay out of NPC_DECOR");
    if (!l.solid) continue;
    const [x, y, w, h] = l.solid;
    // the box and a ring of one tile round it: open ground, no road, water, highway or built object
    for (let ty = Math.floor(y) - 1; ty <= Math.floor(y + h); ty++) for (let tx = Math.floor(x) - 1; tx <= Math.floor(x + w); tx++) {
      const g = GROUND[ty][tx], o = OBJECTS[ty][tx];
      assert.ok(g !== T.WATER && g !== T.COBBLE && g !== T.BRIDGE && !HIGHWAY_TILES.has(ty * MW + tx), `${l.id}: road or water at ${tx},${ty}`);
      assert.ok(o === EMPTY || NATURE.has(o), `${l.id}: built object at ${tx},${ty}`);
    }
    for (const p of [...PORTAL_SPOTS.map((q) => [q.x + 0.5, q.y + 0.5]), ...SIGNPOSTS.map((q) => [q.x + 0.5, q.y + 0.5]), ...[...NPCS, ...CHESTS, ...HOLDS, ...MUSTERS].map((q) => [q.x / TILE, q.y / TILE])])
      assert.ok(Math.hypot(p[0] - (x + w / 2), p[1] - (y + h / 2)) > 3, `${l.id}: too close to a stone, post, NPC, chest or fort at ${p}`);
    assert.ok(isDecorSolidAt((x + w / 2) * TILE, (y + h / 2) * TILE), `${l.id}: does not block`);
    assert.ok(!isDecorSolidAt((x - 0.3) * TILE, (y + h / 2) * TILE) && !isDecorSolidAt((x + w + 0.3) * TILE, (y + h / 2) * TILE), `${l.id}: blocks outside its box`);
  }
});

test("landmarks leave every tile reachable that was reachable without them", () => {
  const inMark = (px: number, py: number) => LANDMARK_SOLIDS.some(([x, y, w, h]) => px >= x * TILE && py >= y * TILE && px < (x + w) * TILE && py < (y + h) * TILE);
  for (const l of LANDMARKS) {
    if (!l.solid) continue;
    // flood a window round the landmark from the nearest portal stone, with the landmark and without it
    const stone = [...PORTAL_SPOTS].sort((a, b) => Math.hypot(a.x - l.x, a.y - l.y) - Math.hypot(b.x - l.x, b.y - l.y))[0];
    const R = Math.max(45, Math.ceil(Math.hypot(stone.x - l.x, stone.y - l.y)) + 15);
    const x0 = Math.max(0, Math.floor(l.x) - R), y0 = Math.max(0, Math.floor(l.y) - R), x1 = Math.min(MW - 1, Math.floor(l.x) + R), y1 = Math.min(GROUND.length - 1, Math.floor(l.y) + R);
    const flood = (withMarks: boolean) => {
      const walk = (tx: number, ty: number) => { const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE; return !isSolidAt(cx, cy) && (!isDecorSolidAt(cx, cy) || (!withMarks && inMark(cx, cy))); };
      const seen = new Set<number>(), q = [[stone.x, stone.y + 2]];
      while (q.length) {
        const [tx, ty] = q.pop()!, k = ty * MW + tx;
        if (tx < x0 || ty < y0 || tx > x1 || ty > y1 || seen.has(k) || !walk(tx, ty)) continue;
        seen.add(k); q.push([tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]);
      }
      return seen;
    };
    const before = flood(false), after = flood(true);
    assert.ok(before.size > 500, `${l.id}: flood from ${stone.name} found too little`);
    for (const k of before) if (!after.has(k) && !inMark(((k % MW) + 0.5) * TILE, (Math.floor(k / MW) + 0.5) * TILE)) assert.fail(`${l.id}: ${k % MW},${Math.floor(k / MW)} cut off`);
  }
});

test("chests, siege sites, forts and musters did not move (digests from the commit before shared/landmarks.ts)", () => {
  const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
  const d = <X>(a: readonly X[], f: (x: X) => unknown) => `${a.length}:${fnv(JSON.stringify(a.map(f)))}`;
  assert.equal(d(SIEGE_SITES, (s) => [s.tx, s.ty]), "14:cac2c0c9");
  assert.equal(d(CHESTS, (c) => [c.id, Math.round(c.x), Math.round(c.y)]), "53:e7366e42");
  assert.equal(d(HOLDS, (h) => [h.t, Math.round(h.x), Math.round(h.y)]), "25:9caa51d");
  assert.equal(d(MUSTERS, (h) => [h.t, Math.round(h.x), Math.round(h.y)]), "72:82341353");
});

test("no monster spawns inside a landmark's solid box (it could never step out)", async () => {
  const { SPAWN_ZONES, randomPointInZone, underLandmark } = await import("../shared/spawns");
  for (const [x, y, w, h] of LANDMARK_SOLIDS) {
    for (let ty = Math.floor(y); ty < y + h; ty++) for (let tx = Math.floor(x); tx < x + w; tx++) assert.ok(underLandmark(tx, ty), `tile ${tx},${ty} under a landmark`);
    const zones = SPAWN_ZONES.filter((z) => x + w > z.x && x < z.x + z.w && y + h > z.y && y < z.y + z.h);
    assert.ok(zones.length, "the landmark stands in a monster zone (the case this guards)");
    for (const z of zones) for (let i = 0; i < 20000; i++) {
      const p = randomPointInZone(z);
      const px = p.x / TILE, py = p.y / TILE;
      assert.ok(!(px > x - 0.5 && px < x + w + 0.5 && py > y - 0.5 && py < y + h + 0.5), `${z.name} spawned at ${px},${py} inside a landmark`);
    }
  }
});
