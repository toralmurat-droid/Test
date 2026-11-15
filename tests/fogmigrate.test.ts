import test from "node:test";
import assert from "node:assert/strict";
import { loadFog } from "../client/src/fogmigrate";
import { MAP_H, MAP_W } from "../shared/constants";

test("fog saved at the old 288x592 map size survives the moors band", () => {
  const bin = new Array(288 * 592).fill(String.fromCharCode(0)).map((c, i) => (i === 5 * 288 + 7 || i === 591 * 288 + 287 ? String.fromCharCode(255) : c)).join("");
  const seen = new Uint8Array(MAP_W * MAP_H);
  assert.equal(loadFog(bin, seen, MAP_W, MAP_H), true);
  assert.equal(seen[5 * MAP_W + 7], 255);
  assert.equal(seen[591 * MAP_W + 287], 255);
  assert.equal(seen.reduce((a, b) => a + (b ? 1 : 0), 0), 2);
});

test("fog at the current size loads directly; unknown sizes are ignored", () => {
  const seen = new Uint8Array(MAP_W * MAP_H);
  assert.equal(loadFog(String.fromCharCode(9).repeat(MAP_W * MAP_H), seen, MAP_W, MAP_H), true);
  assert.equal(seen[100], 9);
  assert.equal(loadFog("abc", new Uint8Array(MAP_W * MAP_H), MAP_W, MAP_H), false);
});
