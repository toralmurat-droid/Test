import assert from "node:assert/strict";
import { test } from "node:test";
import { CITIES, CITY_TEMPLATE, cityTile } from "../shared/capitals";
import { REGIONS } from "../shared/war/regions";
import { CR, CROWNWAYS, crownGateTile, TOLLCROSS_SQUARE } from "../shared/crown";
import { TERRITORIES, territoryByName } from "../shared/war/territories";
import { CROWN_LAND, STONES, WAYS, findRoute, hereAt, hereCaption, nodeName, routeLines } from "../client/src/warRoute";

const id = (name: string) => territoryByName(name)!.id;

test("hereAt: a tile inside a zone is that territory, with its land", () => {
  const t = territoryByName("Mirror Pond")!;
  const h = hereAt(t.x + 2, t.y + 2);
  assert.equal(h.terr, t.id); assert.equal(h.node, t.id); assert.equal(h.land, "oakvale"); assert.equal(h.near, false);
  const m = territoryByName("The Cairnfield")!;
  assert.equal(hereAt(m.x + 1, m.y + 1).land, "moors");
});

test("hereAt: a village outside every zone counts as its nearest territory of the same land", () => {
  const h = hereAt(86, 50); // Oakvale's market square
  assert.equal(h.terr, undefined); assert.equal(h.near, true); assert.equal(h.land, "oakvale");
  assert.ok(h.node !== undefined && TERRITORIES[h.node].region === "oakvale");
  assert.match(hereCaption(h, "Market Square"), /^You: Market Square, near .+, The Oakvale Lands$/);
});

test("hereAt: the Crown's territories are nodes like any other (since Crown PR3); Tollcross counts as its nearest; underground has none", () => {
  const k = territoryByName("The Crown Keep")!, h = hereAt(Math.floor(k.cx), Math.floor(k.cy));
  assert.equal(h.node, k.id); assert.equal(h.land, CROWN_LAND); assert.equal(h.near, false);
  const sq = hereAt(TOLLCROSS_SQUARE.x + 2, CR(TOLLCROSS_SQUARE.y + 2)); // the safe hub, outside every zone
  assert.equal(sq.land, CROWN_LAND); assert.equal(sq.near, true); assert.equal(TERRITORIES[sq.node!].region, CROWN_LAND);
  assert.match(hereCaption(sq, "Tollcross Square"), /^You: Tollcross Square, near .+, The Crown of the Marches$/);
  assert.equal(hereAt(10, 250).node, undefined); // the underground band holds no land
});

test("WAYS: the four land links, five Crownways and ten border roads, each end in its own land; a Crownway leads into its approach", () => {
  // the gates, then the ten border roads (shared/borders.ts), each from its lower land to the land that asks more
  const roads = WAYS.filter((w) => w.id.startsWith("road_"));
  assert.equal(WAYS.length - roads.length, 9);
  assert.equal(roads.length, 10);
  assert.ok(roads.every((w) => TERRITORIES[w.a].region !== CROWN_LAND), "into the Crown, never out of it");
  assert.equal(roads.find((w) => w.name === "The Eastmarch Pass")!.req, "Lv 20");
  assert.equal(roads.find((w) => w.name === "The Ashen Pass")!.req, "after Act 1's bosses");
  for (const w of WAYS) assert.notEqual(TERRITORIES[w.a].region, TERRITORIES[w.b].region);
  const crown = WAYS.filter((w) => !w.id.startsWith("road_") && TERRITORIES[w.b].region === CROWN_LAND);
  assert.deepEqual(crown.map((w) => w.id), CROWNWAYS.map((c) => `crownway_${c.from}`));
  for (const c of CROWNWAYS) {
    const w = crown.find((x) => x.name === c.name)!, g = crownGateTile(c);
    assert.equal(TERRITORIES[w.a].region, c.from, `${c.name} starts in ${c.from}`);
    assert.deepEqual(w.tb, g);
    assert.equal(w.req, c.from === "sunscar" ? "Lv 40, after Act 1's bosses" : "Lv 40");
    assert.equal(hereAt(g.x, g.y + 2).node, w.b, `${c.name}: the approach you arrive in`);
  }
});

test("findRoute: inside a land it walks the borders, between lands it takes the gate", () => {
  assert.deepEqual(findRoute(id("Mirror Pond"), id("Mirror Pond")), []);
  const walk = findRoute(id("Goldenreach Farms"), id("Misty Marsh"))!;
  assert.ok(walk.length >= 1 && walk.every((s) => s.via === "walk"));
  const pass = findRoute(id("Mirror Pond"), id("The Saltlick Flats"))!;
  assert.deepEqual(pass.map((s) => s.via), ["gate"]);
  assert.equal(pass[0].way!.name, "The Red Pass");
  assert.match(routeLines(pass)[0], /Take The Red Pass at Mirror Pond \(Lv 25\), arriving in The Saltlick Flats/);
});

test("findRoute: every territory (the Crown's too) can be reached from every other", () => {
  const from = id("Goldenreach Farms");
  for (let n = 0; n < TERRITORIES.length; n++) { const r = findRoute(from, n); assert.ok(r, `no route to ${nodeName(n)}`); if (r.length) assert.equal(r[r.length - 1].to, n); }
  const back = findRoute(id("Fangrock"), id("Hidehall"))!;
  assert.ok(back.some((s) => s.via === "gate")); // the lands only meet through gates
  for (let i = 1; i < back.length; i++) assert.equal(back[i].from, back[i - 1].to);
});

test("findRoute: a woken pair of portal stones is a shortcut, cold stones are not", () => {
  const far = id("Gravemoor Cemetery"), start = id("Goldenreach Farms");
  const stones = STONES.filter((s) => ["farms", "gravemoor"].includes(s.id));
  assert.equal(stones.length, 2);
  const slow = findRoute(start, far)!;
  assert.ok(slow.every((s) => s.via === "walk"));
  const fast = findRoute(start, far, new Set(["farms", "gravemoor"]))!;
  assert.deepEqual(fast.map((s) => s.via), ["portal"]);
  assert.match(routeLines(fast)[0], /^Portal stone: Goldenreach Farms to Gravemoor Cemetery$/);
  assert.deepEqual(findRoute(start, far, new Set(["farms"]))!.map((s) => s.via), slow.map((s) => s.via)); // one woken stone is no hop
});

test("routeLines: runs of borders merge into one line", () => {
  const r = findRoute(id("Goldenreach Farms"), id("Heronwreck Strand"))!;
  const lines = routeLines(r);
  assert.equal(lines.length, 1);
  assert.match(lines[0], r.length === 1 ? /^Walk to / : /^Walk \d+ territories to Heronwreck Strand$/);
});

test("findRoute: a hero in Oakvale reaches the Badlands by the Red Pass, never by the Crown (Lv 40) or the Sunscar", () => {
  const r = findRoute(id("Stonecrag Quarry"), id("Fangrock"))!;
  assert.deepEqual(r.filter((s) => s.via === "gate").map((s) => s.way!.name), ["The Red Pass"]);
  assert.ok(r.every((s) => TERRITORIES[s.to].region !== CROWN_LAND));
  const home = findRoute(id("Fangrock"), id("The Host's Muster"))!; // lands meet through Oakvale, not through the Crown
  assert.deepEqual(home.filter((s) => s.via === "gate").map((s) => s.way!.name), ["The Red Pass", "The Barrowgate"]);
});

test("findRoute: into the Crown by the nearest Crownway, then over its borders to the Keep", () => {
  const r = findRoute(id("Hidehall"), id("The Crown Keep"))!;
  assert.deepEqual(r.filter((s) => s.via === "gate").map((s) => s.way!.name), ["The Deep Gate"]);
  assert.equal(r[r.length - 1].to, id("The Crown Keep"));
  assert.match(routeLines(r)[0], /^Take The Deep Gate at Hidehall \(Lv 40\)/);
  const out = findRoute(id("The Spirefall"), id("The Host's Muster"))!; // back home through the gate you came in by
  assert.deepEqual(out.map((s) => s.via), ["gate"]);
  assert.match(routeLines(out)[0], /^Take The Mourning Gate back from The Spirefall to The Host's Muster$/);
});

test("warRoute: inside a capital you stand where its city gate stands in its land (W7)", () => {
  for (const c of CITIES) {
    const t = cityTile(c, CITY_TEMPLATE.gate), h = hereAt(t.x, t.y - 3);
    assert.deepEqual(h, hereAt(c.outer.x, c.outer.y), c.clan);
    assert.ok(h.node !== undefined && h.land === REGIONS.find((r) => r.home === c.clan)?.key, `${c.clan}: its own homeland`);
  }
});
