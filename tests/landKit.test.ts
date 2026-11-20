import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { actOfTile, TILE } from "../shared/constants";
import { AREAS, EMPTY, GROUND, HIGHWAY_TILES, isSolidAt, NATURE, OBJECTS, PORTAL_SPOTS, SIGNPOSTS, T } from "../shared/map";
import { isDecorSolidAt, NPCS, NPC_DECOR } from "../shared/npcs";
import { landmarkBoxes, LANDMARKS, LANDMARK_SOLIDS } from "../shared/landmarks";
import { CHESTS } from "../shared/chests";
import { SIEGE_SITES } from "../shared/siege";
import { HOLDS, MUSTERS } from "../shared/war/standards";
import { CAPITAL_FORTS, FORT_SKIP, HIGHWAYS, legLine } from "../shared/highways";
import { bodySolidAt } from "../shared/movement";
import { buildLandKit, IN_PEN, inSeat, KIT_BUDGET, kitFree, LAND_KIT_SPOTS, LANDMARK_LIGHT, LANDMARK_PARTS, LANDMARK_SHEET, LK_SHEETS, ON_FIELD, SEAT_MARGIN, type LkKind } from "../client/src/landKit";
import { allObjects } from "../shared/quests";
import { cityAt } from "../shared/capitals";

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
    assert.ok(kitFree(tx, ty, [], 0, ON_FIELD.has(s.kind), IN_PEN.has(s.kind)), `${at}: not clear`);
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
      const o = OBJECTS[ty + j][tx + i], penSide = IN_PEN.has(s.kind) && (o === T.FENCE || o === T.FENCE_V || o === T.PALISADE || o === T.HAY);
      assert.ok(o === EMPTY || NATURE.has(o) || penSide, `${at}: against a built object`);
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

test("no kit prop in a clan seat: a capital fort's box + SEAT_MARGIN", () => {
  const R = FORT_SKIP + SEAT_MARGIN;
  assert.equal(R, 16, "the seats' margin (step 5 builds there): change it on purpose");
  for (const [fx, fy] of CAPITAL_FORTS) for (const s of LAND_KIT_SPOTS) {
    const [tx, ty] = tileOf(s.x, s.y);
    assert.ok(Math.abs(tx - fx) > R || Math.abs(ty - fy) > R, `${s.kind} at ${tx},${ty} in the seat at ${fx},${fy}`);
  }
});

test("Oakvale, the moors and the badlands have their kit and landmarks", () => {
  const ids = LANDMARKS.map((l) => l.id);
  for (const id of ["windmill", "beacon", "headframe"]) assert.ok(ids.includes(id), `no ${id}`);
  const kinds = (land: number) => new Set(LAND_KIT_SPOTS.filter((s) => s.land === land).map((s) => s.kind));
  for (const k of ["lk_peat_stack", "lk_peat_bank", "lk_way_cairn"] as const) assert.ok(kinds(3).has(k), `moors: no ${k}`);
  for (const k of ["lk_longhorn", "lk_trough", "lk_ore_cart"] as const) assert.ok(kinds(4).has(k), `badlands: no ${k}`);
  // the drovers' pen: longhorns and the trough inside it, between its fence row (y 875) and the palisade (y 879)
  const pen = LAND_KIT_SPOTS.filter((s) => s.area === "The Rustwater Post" && IN_PEN.has(s.kind));
  assert.ok(pen.some((s) => s.kind === "lk_longhorn") && pen.some((s) => s.kind === "lk_trough"), "Rustwater's pen is empty");
  for (const s of pen) { const [tx, ty] = tileOf(s.x, s.y); assert.ok(tx >= 238 && tx <= 244 && ty >= 876 && ty <= 878, `${s.kind} at ${tx},${ty}: out of the pen`); }
  // the ore carts stand by the headframe (Redlode's own, a highway village's, by Redlode: tests/villages.test.ts)
  const hf = LANDMARKS.find((l) => l.id === "headframe")!;
  for (const s of LAND_KIT_SPOTS.filter((q) => q.kind === "lk_ore_cart" && !q.village)) assert.ok(Math.hypot(s.x / TILE - hf.x, s.y / TILE - hf.y) < 9, "an ore cart far from the Cinnabar Pits");
});

test("the Sinkholes and the Sunscar have their kit and landmarks: rope and lifts, caravans and salt", () => {
  const ids = LANDMARKS.map((l) => l.id);
  for (const id of ["lift", "caravan"]) assert.ok(ids.includes(id), `no ${id}`);
  const kinds = (land: number) => new Set(LAND_KIT_SPOTS.filter((s) => s.land === land).map((s) => s.kind));
  for (const k of ["lk_rope_walk", "lk_rope_coil", "lk_gantry"] as const) assert.ok(kinds(5).has(k), `sinkholes: no ${k}`);
  for (const k of ["lk_camel", "lk_camel_load", "lk_salt_stack", "lk_salt_pan"] as const) assert.ok(kinds(2).has(k), `sunscar: no ${k}`);
  const at = (k: LkKind) => LAND_KIT_SPOTS.filter((s) => s.kind === k).map((s) => [...tileOf(s.x, s.y), s] as const);
  // the rope walk runs north-south in Ropewell's east yard, between the palisade and the crates
  for (const [tx, ty] of at("lk_rope_walk")) assert.ok(tx >= 122 && tx <= 123 && ty >= 989 && ty <= 992, `rope walk at ${tx},${ty}: out of the east yard`);
  // every gantry stands on a pit's rim (a pit within 2 tiles), off the pit itself
  for (const [tx, ty] of at("lk_gantry")) {
    let pit = false;
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (OBJECTS[ty + j][tx + i] === T.PIT) pit = true;
    assert.ok(pit, `gantry at ${tx},${ty}: no pit beside it`);
  }
  // the camel string rests by the caravan halt; every oasis and the Flats get something (Last Well's camels and
  // Saltglass's pans are a highway village's own, by the village: tests/villages.test.ts)
  const cv = LANDMARKS.find((l) => l.id === "caravan")!;
  assert.ok(LAND_KIT_SPOTS.filter((s) => s.area === "The Sunscar" && s.kind.startsWith("lk_camel") && !s.village).every((s) => Math.hypot(s.x / TILE - cv.x, s.y / TILE - cv.y) < 7), "a camel far from the caravan halt");
  for (const area of ["Kel Ashar", "Jackal Springs", "Palmshade Oasis", "Mirage Wells", "The Glasswind Flats"]) assert.ok(LAND_KIT_SPOTS.some((s) => s.area === area), `${area}: undressed`);
  assert.ok(at("lk_salt_pan").every(([, , s]) => s.area === "The Glasswind Flats" || s.village === "saltglass"), "a salt pan off the Flats");
  // the clan seats in these lands stay clear for step 5: Hidehall, the Veiled Sanctum. By position, not by the spot's
  // area name (no Place names them, so that could never fail): no kit prop stands in their area or their seat box
  const R = FORT_SKIP + SEAT_MARGIN;
  for (const area of ["Hidehall", "The Veiled Sanctum"]) {
    const a = AREAS.find((r) => r.name === area)!, forts = CAPITAL_FORTS.filter(([x, y]) => x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h);
    assert.equal(forts.length, 1, `${area}: its capital fort`);
    const [fx, fy] = forts[0];
    for (const s of LAND_KIT_SPOTS) {
      const [tx, ty] = tileOf(s.x, s.y);
      assert.ok(!(tx >= a.x && tx < a.x + a.w && ty >= a.y && ty < a.y + a.h), `${s.kind} at ${tx},${ty}: in ${area}`);
      assert.ok(Math.abs(tx - fx) > R || Math.abs(ty - fy) > R, `${s.kind} at ${tx},${ty}: in ${area}'s seat`);
    }
  }
});

test("the Crown has its kit and the Lists: pavilions and a shrine round Tollcross, ribbon posts on the Pilgrims' Way", () => {
  assert.ok(LANDMARKS.some((l) => l.id === "lists" && l.land === 6), "no Lists");
  const crown = LAND_KIT_SPOTS.filter((s) => s.land === 6), at = (s: (typeof crown)[number]) => tileOf(s.x, s.y);
  for (const k of ["lk_pavilion", "lk_pavilion_blue", "lk_candle_shrine", "lk_quintain", "lk_pilgrim_staves", "lk_ribbon_post"] as const) assert.ok(crown.some((s) => s.kind === k), `crown: no ${k}`);
  // Tollcross: pavilions on both sides of the square, none behind the herald at its head; the shrine in the north-west
  const herald = NPCS.find((n) => n.id === "crownherald")!, tc = crown.filter((s) => s.area === "Tollcross");
  const pav = tc.filter((s) => s.kind.startsWith("lk_pavilion"));
  assert.ok(pav.some((s) => at(s)[0] < 138) && pav.some((s) => at(s)[0] >= 150), "Tollcross: pavilions on one side only");
  for (const s of pav) assert.ok(Math.abs(s.x - herald.x) / TILE > 8, `pavilion at ${at(s)}: behind the herald`);
  for (const s of tc.filter((q) => q.kind === "lk_candle_shrine")) assert.ok(at(s)[0] < 134 && at(s)[1] < 1193, `shrine at ${at(s)}: not in the north-west`);
  assert.ok(tc.some((s) => s.kind === "lk_quintain") && crown.some((s) => s.area === "The Tourney Grounds" && s.kind === "lk_quintain"), "a quintain in Tollcross and at the Lists");
  // ribbon posts beside the Greenward road through the Pilgrims' Way, off its paving (Kneelstone's are a highway village's
  // own, by the village: tests/villages.test.ts)
  const h = HIGHWAYS.find((q) => q.land === 6)!, mid = h.legs.flatMap((leg) => legLine(h, leg));
  const posts = crown.filter((s) => s.kind === "lk_ribbon_post" && !s.village);
  assert.ok(posts.length >= 2 && posts.every((s) => s.area === "The Pilgrims' Way"), "ribbon posts on the Way");
  for (const s of posts) {
    const [tx, ty] = at(s), d = Math.min(...mid.map((k) => Math.hypot((k % MW) - tx, Math.floor(k / MW) - ty)));
    assert.ok(d >= 2.5 && d <= 6, `ribbon post at ${tx},${ty}: ${d.toFixed(1)} tiles from the road`);
  }
  // nothing in the Crown Keep; the quest's shrines and pennants keep their ground
  assert.ok(!crown.some((s) => s.area === "The Crown Keep" || s.area === "The Throne Hall"), "the Keep dressed");
  const objs = allObjects().filter((o) => o.y / TILE > 1148);
  for (const s of crown) for (const o of objs) assert.ok(Math.hypot(s.x - o.x, s.y - o.y) / TILE >= 2, `${s.kind} at ${at(s)}: on ${o.id}`);
});

test("the Lists: a stand and a tilt barrier with the riders' lane open between them, clear of the King's Hunt pennant", () => {
  const l = LANDMARKS.find((q) => q.id === "lists")!, [stand, tilt] = landmarkBoxes(l);
  assert.ok(stand && tilt && landmarkBoxes(l).length === 2, "the Lists: stand and barrier");
  // the lane: the barrier south of the stand, more than a tile of open ground between them, walkable all along
  const lane0 = stand[1] + stand[3], lane1 = tilt[1];
  assert.ok(lane1 - lane0 >= 1, `the riders' lane is ${(lane1 - lane0).toFixed(2)} tiles`);
  for (let x = Math.max(stand[0], tilt[0]) + 0.2; x < Math.min(stand[0] + stand[2], tilt[0] + tilt[2]); x += 0.25)
    assert.ok(!bodySolidAt(x * TILE, ((lane0 + lane1) / 2) * TILE), `lane blocked at ${x.toFixed(2)}`);
  // its pennant ("they hang from the old lists") stays in reach
  const pennant = allObjects().find((o) => o.id === "throne_pennant2")!, px = pennant.x / TILE, py = pennant.y / TILE;
  for (const [x, y, w, h] of landmarkBoxes(l)) assert.ok(Math.max(x - px, px - x - w, 0) + Math.max(y - py, py - y - h, 0) >= 2.5, "the Lists crowd the pennant");
  // the barrier is drawn on its own (it stands in front of the lane, the stand behind it), its foot on the box's south edge
  const part = LANDMARK_PARTS.lists[0];
  assert.equal(part.kind, "lk_tilt");
  assert.ok(Math.abs(part.y - (tilt[1] + tilt[3])) < 0.01 && Math.abs(part.x - (tilt[0] + tilt[2] / 2)) < 0.01, "the tilt's sprite is not at its box");
  assert.ok(l.y <= lane0 + 0.01, "the stand's sprite sorts in front of the lane");
});

test("a landmark with no box of its own stands on ground the map already blocks: the Ropewell Lift over its pit", () => {
  const open = LANDMARKS.filter((l) => !l.solid);
  assert.deepEqual(open.map((l) => l.id), ["lift"]);
  const lift = open[0];
  for (const [tx, ty] of [[115, 989], [116, 989], [115, 990], [116, 990]]) {
    assert.equal(OBJECTS[ty][tx], T.PIT, `${tx},${ty}: not the sinkhole`);
    for (const [fx, fy] of [[0.05, 0.05], [0.5, 0.5], [0.95, 0.95]]) assert.ok(isSolidAt((tx + fx) * TILE, (ty + fy) * TILE) && bodySolidAt((tx + fx) * TILE, (ty + fy) * TILE), `${tx},${ty}: walkable`);
  }
  assert.ok(lift.x === 116 && lift.y === 990, "the lift's foot is the middle of the pit");
});

test("way-cairns stand beside the Moors Highway, off its paving", () => {
  const h = HIGHWAYS.find((q) => q.land === 3)!, mid = h.legs.flatMap((leg) => legLine(h, leg));
  const cairns = LAND_KIT_SPOTS.filter((s) => s.kind === "lk_way_cairn" && !s.village); // (Barrowstead's own: tests/villages.test.ts)
  assert.ok(cairns.length >= 8, `only ${cairns.length} way-cairns`);
  for (const s of cairns) {
    const [tx, ty] = tileOf(s.x, s.y), d = Math.min(...mid.map((k) => Math.hypot((k % MW) - tx, Math.floor(k / MW) - ty)));
    assert.ok(d >= 2.5 && d <= 6, `way-cairn at ${tx},${ty}: ${d.toFixed(1)} tiles from the highway`);
  }
});

test("a landmark that shines has a fire on its sheet: only the beacon, lit from above its foot", () => {
  assert.deepEqual(Object.keys(LANDMARK_LIGHT), ["beacon"]);
  for (const [id, g] of Object.entries(LANDMARK_LIGHT)) {
    const s = LK_SHEETS[LANDMARK_SHEET[id]];
    assert.ok(s && s.frames > 1, `${id}: no animated fire to light from`);
    assert.ok(g.lift > 20 && g.lift * 1.5 < s.oy, `${id}: the glow is not up at the fire`);
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
  const used = new Set<LkKind>([...LAND_KIT_SPOTS.map((s) => s.kind), ...LANDMARKS.map((l) => LANDMARK_SHEET[l.id]), ...Object.values(LANDMARK_PARTS).flat().map((p) => p.kind)]);
  for (const k of used) {
    const s = LK_SHEETS[k];
    assert.ok(s, `${k}: no size`);
    assert.deepEqual(pngSize(`client/public/assets/hd/props/${k}.png`), [s.w * s.frames, s.h], `${k}: sheet size`);
    assert.ok(s.ox > 0 && s.ox < s.w && s.oy > 0 && s.oy <= s.h, `${k}: foot outside the frame`);
  }
});

test("no land-kit sheet is in NPC_DECOR (siege works, tunnels and rituals read it)", () => {
  assert.ok(!NPC_DECOR.some((d) => d.prop.startsWith("lk_")));
});

test("landmarks: solid boxes on open ground in their area and land, blocking movement, not NPC_DECOR", () => {
  assert.equal(LANDMARK_SOLIDS.length, LANDMARKS.flatMap(landmarkBoxes).length);
  for (const l of LANDMARKS) {
    const a = AREAS.find((r) => r.name === l.area)!;
    assert.ok(a && l.x >= a.x && l.x < a.x + a.w && l.y >= a.y && l.y < a.y + a.h, `${l.id}: outside ${l.area}`);
    assert.equal(actOfTile(Math.floor(l.x), Math.floor(l.y)), l.land, `${l.id}: wrong land`);
    assert.ok(LANDMARK_SHEET[l.id], `${l.id}: no art`);
    assert.ok(!NPC_DECOR.some((d) => d.prop === l.id || d.prop === LANDMARK_SHEET[l.id] || (l.solid && d.solid && d.solid.every((v, i) => v === l.solid![i]))), `${l.id}: in NPC_DECOR`);
    for (const [x, y, w, h] of landmarkBoxes(l)) {
      // the box and a ring of one tile round it: open ground, no road, water, highway or built object
      for (let ty = Math.floor(y) - 1; ty <= Math.floor(y + h); ty++) for (let tx = Math.floor(x) - 1; tx <= Math.floor(x + w); tx++) {
        const g = GROUND[ty][tx], o = OBJECTS[ty][tx];
        assert.ok(g !== T.WATER && g !== T.COBBLE && g !== T.BRIDGE && !HIGHWAY_TILES.has(ty * MW + tx), `${l.id}: road or water at ${tx},${ty}`);
        // (a city's wall may stand in the ring, owner's default for Hearthhold, settlement network step 5: the windmill stays
        // where it stood, 0.6 tiles off the east wall; tests/hearthhold.test.ts keeps a body's way open between them)
        assert.ok(o === EMPTY || NATURE.has(o) || !!cityAt(tx, ty), `${l.id}: built object at ${tx},${ty}`);
      }
      for (const p of [...PORTAL_SPOTS.map((q) => [q.x + 0.5, q.y + 0.5]), ...SIGNPOSTS.map((q) => [q.x + 0.5, q.y + 0.5]), ...[...NPCS, ...CHESTS, ...HOLDS, ...MUSTERS].map((q) => [q.x / TILE, q.y / TILE])])
        assert.ok(Math.hypot(p[0] - (x + w / 2), p[1] - (y + h / 2)) > 3, `${l.id}: too close to a stone, post, NPC, chest or fort at ${p}`);
      assert.ok(isDecorSolidAt((x + w / 2) * TILE, (y + h / 2) * TILE), `${l.id}: does not block`);
      assert.ok(!isDecorSolidAt((x - 0.3) * TILE, (y + h / 2) * TILE) && !isDecorSolidAt((x + w + 0.3) * TILE, (y + h / 2) * TILE), `${l.id}: blocks outside its box`);
    }
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
  // the lift has no box (its pit blocks, see above); every other landmark is solid (the Lists twice) and checked here
  assert.deepEqual(LANDMARKS.filter((l) => !landmarkBoxes(l).length).map((l) => l.id), ["lift"]);
  assert.equal(LANDMARK_SOLIDS.length, LANDMARKS.flatMap(landmarkBoxes).length);
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

test("bodySolidAt blocks every landmark box and the feet's reach round it (the map alone does not); hide spots never step out under one", async () => {
  // the room's placements and slides test bodySolidAt; tests/landmarkBodies.test.ts drives a dash and a rush in a room
  const { findHideSpot, underLandmark } = await import("../shared/spawns");
  for (const [x, y, w, h] of LANDMARK_SOLIDS) {
    for (const [fx, fy] of [[0.05, 0.05], [0.5, 0.5], [0.95, 0.95], [0.05, 0.95], [0.95, 0.05]]) {
      const px = (x + w * fx) * TILE, py = (y + h * fy) * TILE;
      assert.ok(bodySolidAt(px, py), `${px / TILE},${py / TILE}: open to a body`);
      assert.ok(!isSolidAt(px, py), "the map alone does not block it (the case this guards)");
    }
    // a body centred just outside the box would have its feet in it: blocked too; a little farther out it is free
    const mid = (y + h / 2) * TILE;
    assert.ok(bodySolidAt(x * TILE - 3, mid) && bodySolidAt((x + w) * TILE + 3, mid), "the feet box reaches into the landmark");
    assert.ok(!bodySolidAt(x * TILE - 8, mid) && !bodySolidAt((x + w) * TILE + 8, mid), "blocked too far from the box");
    // a tree ambusher's step-out spot never falls under one
    const s = findHideSpot("rattler", (x + w / 2) * TILE, (y + h / 2) * TILE, 8, new Set(), [T.TREE, T.PINE, T.ROCK, T.CACTUS, T.BARROW, T.BONE_PILE, T.GRAVE]);
    if (s) assert.ok(!underLandmark(Math.floor(s.outX / TILE), Math.floor(s.outY / TILE)), "hide spot steps out under a landmark");
  }
});
