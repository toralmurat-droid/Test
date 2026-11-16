import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE } from "../shared/constants";
import { isSolidAt } from "../shared/map";
import { SALT_BUILDINGS, SALT_PIERS, SALT_STASH, saltDoorStep } from "../shared/saltmere";
import { keepOff, pickKind, pierHead, saltmereSpots, SALT_FOLK } from "../client/src/saltmereFolk";

test("Saltmere fisherfolk: every kind of spot exists and is standable", () => {
  const spots = saltmereSpots();
  for (const k of ["net", "pier", "fire", "chat", "door"]) assert.ok(spots.some((s) => s.kind === k), `no ${k} spot`);
  assert.equal(spots.filter((s) => s.kind === "door").length, SALT_BUILDINGS.length);
  assert.equal(spots.filter((s) => s.kind === "pier").length, SALT_PIERS.length);
  for (const s of spots) assert.ok(!isSolidAt(s.x, s.y), `${s.kind} spot at ${s.x / TILE},${s.y / TILE} is solid`);
});

test("Saltmere fisherfolk: stash, buildings and door steps are kept clear, idle spots never sit on them", () => {
  assert.ok(keepOff((SALT_STASH.x + 0.5) * TILE, (SALT_STASH.y + 0.5) * TILE));
  for (const b of SALT_BUILDINGS) {
    assert.ok(keepOff((b.x + b.w / 2) * TILE, (b.y + 1) * TILE));
    const d = saltDoorStep(b);
    assert.ok(keepOff((d.x + 0.5) * TILE, (d.y + 0.5) * TILE));
  }
  for (const s of saltmereSpots()) if (s.kind !== "door") assert.ok(!keepOff(s.x, s.y), `${s.kind} spot at ${s.x / TILE},${s.y / TILE}`);
});

test("Saltmere fisherfolk: piers reach out over the water, and the folk count is 6-8", () => {
  for (const x of SALT_PIERS) assert.ok(pierHead(x) > 186 + 3);
  assert.ok(SALT_FOLK.length >= 6 && SALT_FOLK.length <= 8);
});

test("pickKind covers every kind over 0..1", () => {
  const seen = new Set<string>();
  for (let r = 0; r < 1; r += 0.01) seen.add(pickKind(r));
  assert.deepEqual([...seen].sort(), ["chat", "door", "fire", "net", "pier", "stroll"]);
});
