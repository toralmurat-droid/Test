import { test } from "node:test";
import assert from "node:assert/strict";
import { FERRY_FEE, FERRY_STOPS } from "../shared/ferry";
import { TILE } from "../shared/constants";
import { FERRY_NO, ferryRows, jettyAt } from "../client/src/ferry";

test("ferry client: a jetty head or its plank is a boarding spot, the middle of town is not", () => {
  for (const s of FERRY_STOPS) {
    assert.equal(jettyAt((s.tile.x + 0.5) * TILE, (s.tile.y + 0.5) * TILE)?.id, s.id);
    assert.equal(jettyAt(s.x, s.y)?.id, s.id);
  }
  assert.equal(jettyAt(0, 0), undefined);
});

test("ferry client: the list holds the other two stops at the fare", () => {
  for (const s of FERRY_STOPS) {
    const rows = ferryRows(s);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.id !== s.id && r.fee === FERRY_FEE));
  }
});

test("ferry client: every refusal the server sends has words", () => {
  for (const why of ["closed", "far", "fight", "gold"]) assert.ok(FERRY_NO[why]);
});
