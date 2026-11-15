import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TILE_COUNT } from "../shared/map";

test("groundPaint's tileCount fallback literal follows TILE_COUNT (the worker cannot import map.ts)", () => {
  const src = readFileSync(new URL("../client/src/groundPaint.ts", import.meta.url), "utf8");
  assert.equal(src.match(/g\.tileCount \?\? (\d+)/)?.[1], String(TILE_COUNT));
});
