// The acoustic material grid (shared/acoustics.ts) is built from the map's tiles only: the same in every process.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { MAP_W, TILE } from "../shared/constants";
import { GROUND, OBJECTS, T } from "../shared/map";
import { ACOUSTIC, acousticsAt, materialAt, materialGrid } from "../shared/acoustics";

const hash = (g: Uint8Array) => createHash("sha1").update(g).digest("hex");

test("the material grid is deterministic: another process builds the very same one", () => {
  const here = hash(materialGrid());
  assert.equal(hash(materialGrid()), here, "built once, the same each time");
  const root = path.resolve(__dirname, "..");
  const code = `const { materialGrid } = require("./shared/acoustics"); const { createHash } = require("node:crypto"); console.log(createHash("sha1").update(materialGrid()).digest("hex"));`;
  const other = execFileSync(process.execPath, ["--import", "tsx", "-e", code], { cwd: root, encoding: "utf8" }).trim();
  assert.equal(other, here);
});

test("materials follow the tiles: stone, wood, metal, foliage, water", () => {
  const find = (pred: (tx: number, ty: number) => boolean): [number, number] => {
    for (let ty = 0; ty < OBJECTS.length; ty++) for (let tx = 0; tx < MAP_W; tx++) if (pred(tx, ty)) return [tx, ty];
    throw new Error("not found");
  };
  assert.equal(materialAt(...find((x, y) => OBJECTS[y][x] === T.ROCK)), "stone");
  assert.equal(materialAt(...find((x, y) => OBJECTS[y][x] === T.FENCE)), "wood");
  assert.equal(materialAt(...find((x, y) => OBJECTS[y][x] === T.WELL)), "metal");
  assert.equal(materialAt(...find((x, y) => OBJECTS[y][x] === T.ANVIL)), "metal");
  assert.equal(materialAt(...find((x, y) => OBJECTS[y][x] === T.TREE)), "foliage");
  assert.equal(materialAt(...find((x, y) => GROUND[y][x] === T.WATER && OBJECTS[y][x] < 0)), "water");
  assert.equal(materialAt(-1, 5), "stone", "off the map");
  // song modifiers near a well and near water
  const [wx, wy] = find((x, y) => OBJECTS[y][x] === T.WELL);
  assert.equal(acousticsAt((wx + 1.5) * TILE, (wy + 0.5) * TILE).radius, ACOUSTIC.well);
  const [ax, ay] = find((x, y) => GROUND[y][x] === T.WATER);
  assert.equal(acousticsAt((ax + 0.5) * TILE, (ay + 0.5) * TILE).slow, ACOUSTIC.water);
});
