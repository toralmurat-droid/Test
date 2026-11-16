import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actOfTile, CITIES_H, CITIES_Y0, CITY_ACTS, CITY_PLOT, cityPlotOf, CROWN_H, CROWN_Y0, inCitiesBand, inCrownBand, MAP_H, MAP_W, TILE,
} from "../shared/constants";
import { AREAS, areaAt, GROUND, isSafeZone, isSolidTile, OBJECTS, PORTAL_SPOTS, randomSpawn, T } from "../shared/map";
import {
  buildCities, CITIES, CITY, CITY_CLANS, CITY_TEMPLATE, cityAdmits, cityAt, cityNpcId, cityNpcPx, cityNpcRole, cityOf, cityOfPortal, cityPrice,
  cityRoleNear, cityShopId, cityText, cityTile, cityTitle, cleanCapPaid, cleanHome, plotBox, plotsFit, rankRewardGold,
} from "../shared/capitals";
import { actOpen, actSpawn, cityGateOf, gateColdNote, gateOpen, waygateArrival, waygateById, WAYGATES } from "../shared/act2";
import { isDecorSolidAt, NPCS } from "../shared/npcs";
import { SHOPS } from "../shared/shops";
import { STASHES } from "../shared/trade";
import { TITLES } from "../shared/cosmetics";
import { nearCityGate, randomPointInZone, SPAWN_ZONES } from "../shared/spawns";
import { POSTS } from "../shared/bandits";
import { HOLDS, STANDARDS } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { RENOWN_RANKS } from "../shared/war/renown";

const W = CITIES.find((c) => c.clan === "wardens")!;
const tileOf = (p: { x: number; y: number }) => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)] as const;
function flood(x0: number, y0: number) {
  const seen = new Uint8Array(MAP_W * MAP_H), q = [y0 * MAP_W + x0];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % MAP_W, y = (q[i] / MAP_W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (isSolidTile(nx, ny) || seen[ny * MAP_W + nx]) continue;
      seen[ny * MAP_W + nx] = 1; q.push(ny * MAP_W + nx);
    }
  }
  return seen;
}

test("capitals: the cities' band is appended under the Crown, five plots side by side, the Crown's band bounded", () => {
  assert.equal(CITIES_Y0, CROWN_Y0 + CROWN_H + 8);
  assert.equal(MAP_H, CITIES_Y0 + CITIES_H + 4);
  assert.equal(CITY_CLANS.length, CITY_ACTS.length);
  assert.ok(plotsFit());
  for (let i = 0; i < CITY_ACTS.length; i++) {
    const b = plotBox(i);
    assert.ok(b.y >= CITIES_Y0 && b.y + b.h <= CITIES_Y0 + CITIES_H, `plot ${i} inside the band`);
    if (i) assert.ok(b.x >= plotBox(i - 1).x + plotBox(i - 1).w + 2, "rock between plots");
    for (let x = b.x; x < b.x + b.w; x++) assert.equal(cityPlotOf(x), i);
  }
  // the Crown's band ends where the cities' rock strip begins; the cities' band runs to the bottom
  assert.ok(inCrownBand(CROWN_Y0) && inCrownBand(CROWN_Y0 + CROWN_H + 3) && !inCrownBand(CITIES_Y0 - 4) && !inCrownBand(MAP_H - 1));
  assert.ok(!inCitiesBand(CITIES_Y0 - 5) && inCitiesBand(CITIES_Y0 - 4) && inCitiesBand(MAP_H - 1));
  assert.equal(actOfTile(100, CROWN_Y0 + 10), 6, "the Crown is still Act 6");
  assert.equal(actOfTile(100, CITIES_Y0 - 5), 6, "the Crown's share of the rock");
  // each plot's columns are its clan's land
  CITY_ACTS.forEach((a, i) => { const b = plotBox(i); assert.equal(actOfTile(b.x + 5, b.y + 5), a); assert.equal(actOfTile(b.x + b.w - 1, CITIES_Y0 + CITIES_H + 3), a); });
  assert.equal(actOfTile(cityTile(W, CITY_TEMPLATE.gate).x, cityTile(W, CITY_TEMPLATE.gate).y), 1, "Hearthhold is in the Oakvale lands");
  // all five cities are built, one per plot, west to east in CITY_CLANS order, each in its clan's homeland
  assert.deepEqual(CITIES.map((c) => c.clan), ["wardens", "veiled", "host", "redfang", "hidekin"]);
  assert.deepEqual(CITIES.map((c) => c.act), [1, 2, 3, 4, 5]);
  for (const c of CITIES) {
    assert.equal(c.act, CITY_ACTS[c.plot]); assert.equal(CITY_CLANS[c.plot], c.clan);
    const g = cityTile(c, CITY_TEMPLATE.gate);
    assert.equal(actOfTile(g.x, g.y), c.act, `${c.clan}'s city counts as its homeland`);
    assert.equal(actOfTile(c.outer.x, c.outer.y), c.act, `${c.clan}'s city gate stands in its homeland`);
  }
});

for (const W of CITIES) test(`capitals: ${W.clan}'s city is walled shut but for its gate, every tile reachable from the gate, at least 50x36 inside, all safe`, () => {
  const b = plotBox(W.plot), [gx, gy] = tileOf(waygateArrival(waygateById(`cityexit_${W.clan}`)!));
  assert.ok(cityAt(gx, gy) === W && !isSolidTile(gx, gy), "the arrival is free, inside the city");
  const seen = flood(gx, gy);
  let walk = 0;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const inside = x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h;
    if (seen[y * MAP_W + x]) assert.ok(inside, `the flood never leaves the city (${x},${y})`);
    if (inside && !isSolidTile(x, y)) { walk++; assert.ok(seen[y * MAP_W + x], `reachable ${x},${y}`); }
  }
  assert.ok(walk > 1000, `mostly open (${walk})`);
  // the outer wall: every edge tile solid except the main gate's gap, which opens onto the band's rock
  for (let x = b.x; x < b.x + b.w; x++) for (const y of [b.y, b.y + b.h - 1]) {
    const gap = y === b.y + b.h - 1 && x - b.x >= CITY_TEMPLATE.gateGap[0] && x - b.x <= CITY_TEMPLATE.gateGap[1];
    assert.equal(isSolidTile(x, y), !gap, `wall at ${x},${y}`);
    if (gap) assert.ok(isSolidTile(x, y + 1), "rock beyond the gate");
  }
  for (let y = b.y; y < b.y + b.h; y++) assert.ok(isSolidTile(b.x, y) && isSolidTile(b.x + b.w - 1, y), `side walls at row ${y}`);
  assert.ok(b.w - 2 >= 50 && b.h - 2 >= 36, "at least 50x36 inside the walls");
  // safe ground, walls and all; nothing outside the plot is the city
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) assert.ok(isSafeZone((x + 0.5) * TILE, (y + 0.5) * TILE), `safe at ${x},${y}`);
  assert.ok(!isSafeZone((b.x - 1) * TILE, (b.y + 5) * TILE) && cityAt(b.x - 1, b.y) === undefined && cityAt(b.x, b.y) === W);
  // the districts are named areas; no monster zone or monster area in the band
  for (const d of CITY_TEMPLATE.districts) { const t = cityTile(W, { x: d.x + 1, y: d.y + 1 }); assert.equal(areaAt((t.x + 0.5) * TILE, (t.y + 0.5) * TILE), cityText(W).districts[d.d]); }
  assert.ok(AREAS.some((a) => a.name === cityText(W).name && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h));
  assert.ok(SPAWN_ZONES.every((z) => z.y + z.h <= CITIES_Y0 - 4), "no spawn zone in the band");
  assert.ok(AREAS.filter((a) => a.y >= CITIES_Y0 - 4).every((a) => !a.mobs?.length), "no monster area in the band");
  assert.ok(TERRITORIES.every((t) => t.y + t.h <= CITIES_Y0 - 4), "no war territory in the band");
  // built from the template, deterministic, with no new tile ids
  const g = GROUND.map((r) => [...r]), o = OBJECTS.map((r) => [...r]);
  for (const c of CITIES) { const pb = plotBox(c.plot); for (let y = pb.y; y < pb.y + pb.h; y++) for (let x = pb.x; x < pb.x + pb.w; x++) { g[y][x] = -2; o[y][x] = -2; } }
  buildCities(T, g, o, -1);
  assert.deepEqual(g.slice(b.y, b.y + b.h), GROUND.slice(b.y, b.y + b.h));
  assert.deepEqual(o.slice(b.y, b.y + b.h), OBJECTS.slice(b.y, b.y + b.h));
  const tiles = new Set<number>(Object.values(T));
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) assert.ok(tiles.has(GROUND[y][x]) && (OBJECTS[y][x] === -1 || tiles.has(OBJECTS[y][x])));
  // laid in its style: its walls, its streets, its ground
  assert.equal(OBJECTS[b.y][b.x], T[W.style.wall], "the outer wall");
  const st = cityTile(W, { x: 25, y: 20 }), gr = new Set(W.style.ground.map((k) => T[k]));
  assert.equal(GROUND[st.y][st.x], T[W.style.street], "the main street");
  const open = cityTile(W, { x: 45, y: 26 - 6 });
  assert.ok(gr.has(GROUND[open.y][open.x] as never) || GROUND[open.y][open.x] === T[W.style.street], "open ground in the city's own ground tiles");
});

/** Each city's quartermaster sells what its land's own armourer sells, and the flasks of its land's healers (no new power). */
const LAND_ARMOURER: Record<string, string> = { wardens: "armourer", veiled: "sandarmourer", host: "moorarmourer", redfang: "rustarmourer", hidekin: "ropearmourer" };
for (const W of CITIES) test(`capitals: ${W.clan}'s people, shop, waystone, stash and props stand on free ground in their districts`, () => {
  const seen = flood(...tileOf(waygateArrival(waygateById(`cityexit_${W.clan}`)!)));
  for (const n of CITY_TEMPLATE.npcs) {
    const id = cityNpcId(W, n.role), npc = NPCS.find((o) => o.id === id)!;
    assert.ok(npc, `${id} is an NPC`);
    assert.deepEqual({ x: npc.x, y: npc.y }, cityNpcPx(W, n.role));
    const [tx, ty] = tileOf(npc);
    assert.ok(!isSolidTile(tx, ty) && seen[ty * MAP_W + tx], `${id} stands on reachable ground`);
    assert.equal(cityNpcRole(id)?.role, n.role);
    assert.equal(cityRoleNear(n.role, npc.x, npc.y + TILE * 0.8), W, `${id} can be talked to from in front`);
  }
  assert.equal(cityNpcRole(`cap_${W.clan}_nobody`), undefined);
  assert.equal(cityNpcRole("steward_saltmere"), undefined);
  for (const r of ["leader", "oathkeeper", "trainer"] as const) assert.equal(W.sprites[r], `cap_${W.clan}_${r}`, "the city's own sheets");
  const qm = NPCS.find((o) => o.id === cityNpcId(W, "quartermaster"))!;
  assert.equal(qm.shop, cityShopId(W));
  assert.equal(qm.sprite, `steward_${W.clan}`, "the W6 steward's look of its clan");
  const shop = SHOPS[cityShopId(W)];
  assert.ok(shop && shop.stock.length > 0 && shop.greeting);
  const land = SHOPS[LAND_ARMOURER[W.clan]];
  assert.ok(shop.stock.every((e) => (e.item === "potion" || e.item === "mpotion" ? (e.size ?? 0) <= 2 : land.stock.some((a) => a.item === e.item && a.price === e.price))), "no new power: the land's own armour and flasks");
  assert.ok(land.stock.every((a) => shop.stock.some((e) => e.item === a.item)), "every step of the land's armourer");
  // the leader's, oath-keeper's and trainer's names, the title, every district named
  const t = cityText(W);
  assert.ok(t.name && t.leaderGreeting && t.oathGreeting && t.trainerGreeting && Object.values(t.districts).every(Boolean));
  assert.ok(!/Redfang Chief|Hide-Mother|Pale Marshal|Veiled Oracle|Captain Hale/.test(t.npcs.leader[0]), "the leader is a figure of their own, not a boss or the herald");
  // waystone (append only: the older stones keep their order)
  const ws = PORTAL_SPOTS.find((p) => p.id === `city_${W.clan}`)!;
  assert.ok(ws && cityAt(ws.x, ws.y) === W && !isSolidTile(ws.x, ws.y) && seen[(ws.y + 1) * MAP_W + ws.x]);
  assert.deepEqual(PORTAL_SPOTS.slice(0, 10).map((p) => p.id), ["oakvale", "farms", "barrow", "saltmere", "ruins", "keep", "gravemoor", "cairnwatch", "rustwater", "ropewell"]);
  assert.equal(cityOfPortal(`city_${W.clan}`), W);
  assert.deepEqual(PORTAL_SPOTS.slice(-CITIES.length).map((p) => p.id), CITIES.map((c) => `city_${c.clan}`));
  assert.equal(cityOfPortal("farms"), undefined);
  // the stash chest opens the account stash; the props that block movement do
  assert.ok(STASHES.some((s) => cityAt(...tileOf(s)) === W));
  for (const p of CITY_TEMPLATE.props) if (p.solid) {
    const at = cityTile(W, { x: 0, y: 0 });
    assert.ok(isDecorSolidAt((at.x + p.solid[0] + p.solid[2] / 2) * TILE, (at.y + p.solid[1] + p.solid[3] / 2) * TILE), `${p.kind} blocks`);
  }
});

test("capitals: the Wardens' city gate at Goldenreach, open from Lv 5; the city's own gate always lets heroes out", () => {
  const out = waygateById("citygate_wardens")!, inn = waygateById("cityexit_wardens")!;
  assert.equal(out.to, "cityexit_wardens"); assert.equal(inn.to, "citygate_wardens");
  assert.deepEqual(cityGateOf(out), { city: W, inner: false });
  assert.deepEqual(cityGateOf(inn), { city: W, inner: true });
  assert.equal(cityGateOf(waygateById("oakvale")!), undefined);
  assert.equal(WAYGATES.filter((g) => cityGateOf(g)).length, 2 * CITIES.length);
  // at Goldenreach Farms, on open ground reachable from Oakvale, south-west of the barn, inside its carve box
  const [ox, oy] = tileOf(out), oak = flood(...tileOf(randomSpawn())), [ax, ay] = tileOf(waygateArrival(out));
  assert.deepEqual([ox, oy], [W.outer.x, W.outer.y]);
  assert.equal(areaAt(out.x, out.y), "Goldenreach Farms");
  assert.ok(oak[oy * MAP_W + ox] && oak[ay * MAP_W + ax], "the gate and its arrival are reachable from Oakvale");
  assert.ok([T.FLAGS, T.RUBBLE].includes(GROUND[oy][ox] as 39 | 40), "on old flagstones");
  const B = W.outerBox;
  assert.ok(ox - 4 >= B.x0 && ox + 4 <= B.x1 && oy - 4 >= B.y0 && oy + 4 <= B.y1 && ay <= B.y1, "the dais and the arrival are inside the box");
  // the city's own gate: heroes come out north of it, into the gate square
  const [ix, iy] = tileOf(waygateArrival(inn));
  assert.ok(iy < tileOf(inn)[1] && cityAt(ix, iy) === W && !isSolidTile(ix, iy));
  // levels: the city gate opens at CITY.minLevel; the way out never shuts
  assert.equal(CITY.minLevel, 5);
  assert.ok(!gateOpen(out, { level: 4 } as never) && gateOpen(out, { level: 5 } as never));
  assert.ok(gateOpen(inn, { level: 1 } as never));
  assert.match(gateColdNote(out, { level: 1 } as never), /level 5/);
  // logging out inside: the city is Act 1, so the hero logs back in at Oakvale's square
  assert.ok(actOpen(1, { level: 1 } as never));
  const home = { x: -1, y: -1 };
  assert.equal(actSpawn(actOfTile(ix, iy), () => home), home);
});

/** Each land's way in (its gate's arrival) and the clan's seat beside which its city gate stands. */
const LANDS: Record<string, { entry: string; seat: string }> = {
  veiled: { entry: "desert", seat: "The Veiled Sanctum" }, host: { entry: "moors", seat: "The Host's Muster" },
  redfang: { entry: "badlands", seat: "Fangrock" }, hidekin: { entry: "sinkholes", seat: "Hidehall" },
};
for (const C of CITIES.filter((c) => c.act !== 1)) test(`capitals: ${C.clan}'s city gate beside ${LANDS[C.clan].seat}, reachable, on open ground, out of its camps' sight`, () => {
  const L = LANDS[C.clan], out = waygateById(`citygate_${C.clan}`)!, inn = waygateById(`cityexit_${C.clan}`)!;
  assert.equal(out.to, `cityexit_${C.clan}`); assert.equal(inn.to, `citygate_${C.clan}`);
  assert.deepEqual(cityGateOf(out), { city: C, inner: false });
  const [ox, oy] = tileOf(out), [ax, ay] = tileOf(waygateArrival(out));
  assert.deepEqual([ox, oy], [C.outer.x, C.outer.y]);
  const land = flood(...tileOf(waygateArrival(waygateById(L.entry as never)!)));
  assert.ok(land[oy * MAP_W + ox] && land[ay * MAP_W + ax], "the gate and its arrival are reachable from the land's way in");
  assert.ok([T.FLAGS, T.RUBBLE].includes(GROUND[oy][ox] as 39 | 40), "on old flagstones");
  const B = C.outerBox;
  assert.ok(ox - 4 >= B.x0 && ox + 4 <= B.x1 && oy - 4 >= B.y0 && oy + 4 <= B.y1 && ay <= B.y1, "the dais and the arrival are inside the box");
  for (let y = B.y0; y <= B.y1; y++) for (let x = B.x0; x <= B.x1; x++) {
    const d = ((x - C.outer.x) / 3.6) ** 2 + ((y - C.outer.y) / 3.2) ** 2;
    if (d < 1) assert.ok(!isSolidTile(x, y), `open dais at ${x},${y}`);
  }
  // beside the seat, outside it, and out of sight of every camp post and patrol route (the horn's lookouts see 7.5 tiles)
  const seat = AREAS.find((a) => a.name === L.seat)!, sx = seat.x + seat.w / 2, sy = seat.y + seat.h / 2;
  assert.ok(!(ox >= seat.x - 6 && ox < seat.x + seat.w + 6 && oy >= seat.y - 6 && oy < seat.y + seat.h + 6), "outside the seat");
  assert.ok(Math.hypot(ox - sx, oy - sy) < 60, "near the seat");
  for (const p of POSTS) for (const [px, py] of [p.at, ...(p.route ?? [])]) assert.ok(Math.hypot(px - ox, py - oy) >= 20, `far from the post at ${px},${py}`);
  for (const h of [...HOLDS, ...STANDARDS]) assert.ok(Math.hypot(h.x / TILE - ox, h.y / TILE - oy) >= 8, "clear of Holds and standards");
  for (const g of WAYGATES) if (g !== out) assert.ok(Math.hypot(g.x / TILE - ox, g.y / TILE - oy) >= 8, `clear of the ${g.id} gate`);
  // its levels: the gate opens at CITY.minLevel; the city counts as the land, so a hero logging out inside wakes in its town
  assert.ok(!gateOpen(out, { level: 4 } as never) && gateOpen(out, { level: 5 } as never) && gateOpen(inn, { level: 1 } as never));
  const [ix, iy] = tileOf(waygateArrival(inn));
  assert.ok(iy < tileOf(inn)[1] && cityAt(ix, iy) === C && !isSolidTile(ix, iy));
  assert.equal(actOfTile(ix, iy), C.act);
});

test("capitals: Goldenreach's Hold and standards stand where they did, the war map is untouched", () => {
  const t = TERRITORIES.find((o) => o.name === "Goldenreach Farms")!;
  assert.deepEqual(HOLDS.filter((h) => h.t === t.id).map((h) => [h.x / TILE, h.y / TILE]), [[26.5, 58.5]]);
  assert.deepEqual(STANDARDS.filter((s) => s.t === t.id).map((s) => [s.x / TILE, s.y / TILE]), [[30.5, 49.5], [34.5, 68.5]]);
  assert.equal(t.capitalOf, "wardens");
});

test("capitals: who gets in, prices, rank rewards, the title, save values", () => {
  const war = (a: string, b: string) => [a, b].sort().join() === "redfang,wardens";
  assert.equal(cityAdmits({}, W, war), "ok", "unsworn");
  assert.equal(cityAdmits({ clan: "wardens" }, W, war), "ok", "own sworn");
  assert.equal(cityAdmits({ clan: "veiled" }, W, war), "ok", "a clan at peace");
  assert.equal(cityAdmits({ clan: "redfang" }, W, war), "war", "a clan at war");
  assert.equal(cityAdmits({ clan: "veiled", wanted: 1 }, W, war), "wanted");
  assert.equal(cityAdmits({ wanted: 2 }, W, war), "wanted", "unsworn but Wanted");
  assert.equal(cityAdmits({ clan: "wardens", wanted: 1 }, W, war), "wanted", "even their own clan's");
  assert.equal(cityAdmits({ clan: "wardens", wanted: 0 }, W, () => true), "ok", "the city's clan is never at war with itself");
  // 10% less for the city's sworn only, never a surcharge
  assert.equal(cityPrice(100, W, "wardens"), 90);
  assert.equal(cityPrice(100, W, "veiled"), 100);
  assert.equal(cityPrice(100, W, undefined), 100);
  assert.equal(cityPrice(100, undefined, "wardens"), 100);
  assert.equal(cityPrice(1, W, "wardens"), 1);
  assert.equal(cityPrice(0, W, "wardens"), 0, "a free respec stays free");
  // rank rewards: once per rank, in shared/ numbers
  assert.equal(CITY.rankGold.length, RENOWN_RANKS.length);
  assert.equal(CITY.rankGold[0], 0);
  assert.equal(rankRewardGold(0, 0), 0);
  assert.equal(rankRewardGold(0, 2), CITY.rankGold[1] + CITY.rankGold[2]);
  assert.equal(rankRewardGold(2, 2), 0);
  assert.equal(rankRewardGold(2, 3), CITY.rankGold[3]);
  assert.equal(rankRewardGold(5, 3), 0, "a rank already paid is never paid again");
  assert.equal(RENOWN_RANKS[CITY.titleRank].name, "Banneret");
  for (const c of CITIES) assert.equal(TITLES[cityTitle(c)], cityText(c).title, `${c.clan}'s title`);
  assert.equal(new Set(CITIES.map((c) => cityText(c).title)).size, CITIES.length, "a title per city");
  assert.deepEqual(TITLES.slice(0, 5), ["", "Mentor", "Captain's Own", "Warden of Oakvale", "Rumour-Chaser"], "titles are append only");
  // save values
  assert.equal(cleanCapPaid(undefined), 0); assert.equal(cleanCapPaid(-1), 0); assert.equal(cleanCapPaid(2.5), 0); assert.equal(cleanCapPaid("3"), 0);
  assert.equal(cleanCapPaid(3), 3); assert.equal(cleanCapPaid(99), CITY.rankGold.length - 1);
  assert.equal(cleanHome("wardens"), "wardens"); assert.equal(cleanHome("veiled"), "veiled", "Duskveil is built"); assert.equal(cleanHome("nowhere"), undefined); assert.equal(cleanHome(7), undefined);
  assert.equal(cityOf("__proto__"), undefined);
});

test("no spawn zone places a monster within CITY.gateClear tiles of any city's outer gate", () => {
  assert.ok(CITY.gateClear >= 8, "a real ring");
  for (const c of CITIES) {
    assert.ok(nearCityGate(c.outer.x, c.outer.y) && nearCityGate(c.outer.x + CITY.gateClear - 1, c.outer.y), `${c.clan}: the ring covers the gate`);
    assert.ok(!nearCityGate(c.outer.x + CITY.gateClear + 1, c.outer.y), `${c.clan}: and ends at its radius`);
    const R = CITY.gateClear, near = SPAWN_ZONES.filter((z) => z.x < c.outer.x + R && z.x + z.w > c.outer.x - R && z.y < c.outer.y + R && z.y + z.h > c.outer.y - R);
    assert.ok(near.length > 0, `${c.clan}: some zone reaches the gate (else this test proves nothing)`);
    for (const z of near) for (let i = 0; i < 400; i++) {
      const p = randomPointInZone(z), d = Math.hypot(Math.floor(p.x / TILE) - c.outer.x, Math.floor(p.y / TILE) - c.outer.y);
      assert.ok(d >= R, `${c.clan}: ${z.name} spawned ${d.toFixed(1)} tiles from the gate`);
    }
  }
});
