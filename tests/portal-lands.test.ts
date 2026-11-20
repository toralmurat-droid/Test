import { test } from "node:test";
import assert from "node:assert/strict";
import { arrivalOf, PORTAL_LANDS, PORTALS, portalLand } from "../shared/portals";
import { isSolidAt } from "../shared/map";
import { REGIONS } from "../shared/war/regions";

test("portal lands: every stone in exactly one land, every built land has two or more, in REGIONS order", () => {
  assert.equal(PORTAL_LANDS.reduce((n, l) => n + l.portals.length, 0), PORTALS.length);
  for (const p of PORTALS) assert.ok(portalLand(p).portals.includes(p), p.id);
  assert.deepEqual(PORTAL_LANDS.map((l) => l.key), REGIONS.filter((r) => r.contains).map((r) => r.key));
  for (const l of PORTAL_LANDS) assert.ok(l.portals.length >= 2, `${l.name}: ${l.portals.length} stones`);
  // the towns that had none (Murat 2026-11-19), and the capitals' waystones count in their homelands
  assert.equal(portalLand(PORTALS.find((p) => p.id === "kelashar")!).key, "sunscar");
  assert.equal(portalLand(PORTALS.find((p) => p.id === "tollcross")!).key, "crown");
  assert.equal(portalLand(PORTALS.find((p) => p.id === "city_host")!).key, "moors");
});

test("portal lands: ids unique, every stone and its arrival on open ground", () => {
  assert.equal(new Set(PORTALS.map((p) => p.id)).size, PORTALS.length);
  for (const p of PORTALS) {
    const a = arrivalOf(p);
    assert.ok(!isSolidAt(p.x, p.y) && !isSolidAt(a.x, a.y), p.id);
  }
});
