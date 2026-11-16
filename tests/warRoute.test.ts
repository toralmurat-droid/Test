import assert from "node:assert/strict";
import { test } from "node:test";
import { CROWNWAYS, crownGateTile } from "../shared/crown";
import { TERRITORIES, territoryByName } from "../shared/war/territories";
import { CROWN_NODE, CROWN_LAND, STONES, WAYS, findRoute, hereAt, hereCaption, nodeName, nodeTile, routeLines } from "../client/src/warRoute";

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

test("hereAt: the Crown is one node, underground has none", () => {
  const g = crownGateTile(CROWNWAYS[0]);
  const h = hereAt(g.x, g.y);
  assert.equal(h.node, CROWN_NODE); assert.equal(h.land, CROWN_LAND); assert.equal(nodeName(CROWN_NODE), "The Crown of the Marches");
  const keep = nodeTile(CROWN_NODE); assert.equal(hereAt(keep.x, keep.y).node, CROWN_NODE);
  assert.equal(hereAt(10, 250).node, undefined); // the underground band holds no land
});

test("WAYS: the four land links and five Crownways, each end in its own land", () => {
  assert.equal(WAYS.length, 9);
  for (const w of WAYS) assert.notEqual(TERRITORIES[w.a]?.region, w.b === CROWN_NODE ? "crown" : TERRITORIES[w.b].region);
  assert.equal(WAYS.filter((w) => w.b === CROWN_NODE).length, 5);
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

test("findRoute: every territory and the Crown can be reached from every other", () => {
  const from = id("Goldenreach Farms");
  for (let n = 0; n <= CROWN_NODE; n++) { const r = findRoute(from, n); assert.ok(r, `no route to ${nodeName(n)}`); if (r.length) assert.equal(r[r.length - 1].to, n); }
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
  assert.ok(r.every((s) => s.to !== CROWN_NODE));
  const home = findRoute(id("Fangrock"), id("The Host's Muster"))!; // lands meet through Oakvale, not through the Crown
  assert.deepEqual(home.filter((s) => s.via === "gate").map((s) => s.way!.name), ["The Red Pass", "The Barrowgate"]);
});
