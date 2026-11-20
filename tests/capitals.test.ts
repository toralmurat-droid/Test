import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actOfTile, CITIES_H, CITIES_Y0, CITY_ACTS, CITY_PLOT, cityPlotOf, CROWN_H, CROWN_Y0, inCitiesBand, inCrownBand, MAP_H, MAP_W, TILE,
} from "../shared/constants";
import { AREAS, GROUND, isSolidTile, OBJECTS, PORTAL_SPOTS, T } from "../shared/map";
import {
  buildCities, CITIES, CITY, CITY_CLANS, CITY_TEMPLATE, cityAdmits, cityAt, cityNpcId, cityNpcPx, cityNpcRole, cityOf, cityOfPortal, cityPrice,
  cityRoleNear, cityShopId, cityText, cityTile, cityTitle, cleanCapPaid, cleanHome, plotBox, plotsFit, rankRewardGold,
} from "../shared/capitals";
import { actOpen, actSpawn, cityGateOf, gateColdNote, gateOpen, waygateById, WAYGATES, type Waygate } from "../shared/act2";
import { isDecorSolidAt, NPCS } from "../shared/npcs";
import { SHOPS } from "../shared/shops";
import { STASHES } from "../shared/trade";
import { TITLES } from "../shared/cosmetics";
import { nearCityGate, randomPointInZone, SPAWN_ZONES } from "../shared/spawns";
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
/** Where a city is entered (map tiles): just inside its south gate (every city stands in its land). */
const entry = (c: (typeof CITIES)[number]) => (({ x, y }) => [x, y] as const)(cityTile(c, { x: 25, y: 37 }));

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

// The band holds no city any more (settlement network step 5: all five stand in their lands, tests/cityLand.test.ts). Its
// plots, the rock between them and the rows round them are solid rock: no area, no zone, no territory, nothing to walk on.
// The band and buildCities stay (a cleanup may remove them later); built on the band, buildCities lays no city.
test("capitals: the band holds no city: every plot is rock, no area, zone, territory or walkable tile in it", () => {
  assert.equal(CITIES.filter((c) => !c.site).length, 0, "every city stands in its land");
  for (let y = CITIES_Y0 - 4; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    assert.ok(isSolidTile(x, y), `rock at ${x},${y}`);
    assert.equal(cityAt(x, y), undefined);
  }
  assert.ok(!AREAS.some((a) => a.y + a.h > CITIES_Y0 - 4), "no area in the band");
  assert.ok(SPAWN_ZONES.every((z) => z.y + z.h <= CITIES_Y0 - 4), "no spawn zone in the band");
  assert.ok(TERRITORIES.every((t) => t.y + t.h <= CITIES_Y0 - 4), "no war territory in the band");
  const g = GROUND.map((r) => [...r]), o = OBJECTS.map((r) => [...r]);
  assert.deepEqual(buildCities(T, g, o, -1).areas, []);
  assert.deepEqual(g.slice(CITIES_Y0), GROUND.slice(CITIES_Y0)); assert.deepEqual(o.slice(CITIES_Y0), OBJECTS.slice(CITIES_Y0));
});

/** Each city's quartermaster sells what its land's own armourer sells, and the flasks of its land's healers (no new power). */
const LAND_ARMOURER: Record<string, string> = { wardens: "armourer", veiled: "sandarmourer", host: "moorarmourer", redfang: "rustarmourer", hidekin: "ropearmourer" };
for (const W of CITIES) test(`capitals: ${W.clan}'s people, shop, waystone, stash and props stand on free ground in their districts`, () => {
  const seen = flood(...entry(W));
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
  assert.deepEqual(PORTAL_SPOTS.slice(10, 10 + CITIES.length).map((p) => p.id), CITIES.map((c) => `city_${c.clan}`));
  assert.equal(cityOfPortal("farms"), undefined);
  // the stash chest opens the account stash; the props that block movement do
  assert.ok(STASHES.some((s) => cityAt(...tileOf(s)) === W));
  for (const p of CITY_TEMPLATE.props) if (p.solid) {
    const at = cityTile(W, { x: 0, y: 0 });
    assert.ok(isDecorSolidAt((at.x + p.solid[0] + p.solid[2] / 2) * TILE, (at.y + p.solid[1] + p.solid[3] / 2) * TILE), `${p.kind} blocks`);
  }
});

test("capitals: the cities in their lands have walk-in gates, no waygate pair; a city gate's rules (dormant) open from Lv 5", () => {
  // all five (settlement network step 5): no city gate dais and no waygate pair (tests/cityLand.test.ts has the cities)
  assert.deepEqual(CITIES.filter((c) => c.site).map((c) => c.clan), ["wardens", "veiled", "host", "redfang", "hidekin"]);
  for (const C of CITIES) {
    assert.ok(cityAt(C.outer.x, C.outer.y - 1) === C && cityAt(C.outer.x, C.outer.y) === undefined, `${C.clan}: its outer tile is just outside the south gate`);
    assert.equal(waygateById(`citygate_${C.clan}`), undefined); assert.equal(waygateById(`cityexit_${C.clan}`), undefined);
  }
  assert.equal(WAYGATES.filter((g) => cityGateOf(g)).length, 0);
  assert.equal(cityGateOf(waygateById("oakvale")!), undefined);
  // the band cities' gate rules stay in shared/act2.ts (unused while no city is in the band): open at CITY.minLevel, the
  // way out never shuts. A gate pair made up by id, as act2.ts named them
  const out = { id: "citygate_hidekin", x: 0, y: 0, to: "cityexit_hidekin", label: "" } as Waygate, inn = { ...out, id: "cityexit_hidekin", to: "citygate_hidekin" } as Waygate;
  assert.deepEqual(cityGateOf(out), { city: cityOf("hidekin"), inner: false });
  assert.deepEqual(cityGateOf(inn), { city: cityOf("hidekin"), inner: true });
  assert.equal(CITY.minLevel, 5);
  assert.ok(!gateOpen(out, { level: 4 } as never) && gateOpen(out, { level: 5 } as never));
  assert.ok(gateOpen(inn, { level: 1 } as never));
  assert.match(gateColdNote(out, { level: 1 } as never), /level 5/);
  // logging out inside Hearthhold: the city is Act 1, so the hero logs back in at Oakvale's square
  const [ix, iy] = entry(W);
  assert.ok(actOpen(1, { level: 1 } as never));
  const home = { x: -1, y: -1 };
  assert.equal(actSpawn(actOfTile(ix, iy), () => home), home);
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
