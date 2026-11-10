import { test } from "node:test";
import assert from "node:assert/strict";
import { ACT2_LEVEL, actOfTile, DESERT_KINDS, DESERT_Y0, MobKind, TILE } from "../shared/constants";
import { levelsAt, noMobsAt, SPAWN_ZONES, spawnPoint } from "../shared/spawns";
import { isSafeZone } from "../shared/map";

const desert = SPAWN_ZONES.filter((z) => actOfTile(z.x, z.y) === 2); // the desert and the Undercity under it (the Lantern Crypt down there is Act 1's)

test("Act 2: the Sunscar's zones hold only desert monsters, at Lv 30-47", () => {
  assert.ok(desert.length >= 10);
  for (const z of desert) {
    for (const k of Object.keys(z.mobs) as MobKind[]) assert.ok(DESERT_KINDS.includes(k), `${z.name}: ${k}`);
    assert.ok(z.levels[0] >= ACT2_LEVEL.min && z.levels[1] <= ACT2_LEVEL.special, `${z.name} ${z.levels}`);
    for (const k of Object.keys(z.mobs) as MobKind[]) for (let i = 0; i < 5; i++) {
      const p = spawnPoint(z, k);
      assert.ok(p.level >= ACT2_LEVEL.min && p.level <= ACT2_LEVEL.mob, `${z.name} ${k} Lv${p.level}`);
      assert.ok(p.y >= DESERT_Y0 * TILE && !isSafeZone(p.x, p.y), `${z.name} spawns outside the desert or in Kel Ashar`);
    }
  }
  // the open desert reads its levels from the spot: Lv 30 by the waygate, higher out east
  const wild = SPAWN_ZONES.find((z) => z.name === "The Sunscar")!;
  assert.ok(levelsAt(wild, 112, DESERT_Y0 + 140)[0] <= 31);
  assert.ok(levelsAt(wild, 260, DESERT_Y0 + 200)[0] >= 40);
});

test("Act 2: Kel Ashar and the waygate's circle stay free of monsters; Act 1's zones are untouched", () => {
  assert.ok(noMobsAt(148.5 * TILE, (DESERT_Y0 + 110) * TILE), "Kel Ashar is monster-free");
  assert.ok(noMobsAt(112.5 * TILE, (DESERT_Y0 + 128) * TILE), "the Sunstone Circle is monster-free");
  const wild = SPAWN_ZONES.find((z) => z.name === "The Sunscar")!;
  for (let i = 0; i < 200; i++) { const p = spawnPoint(wild, "scorpion"); assert.ok(!noMobsAt(p.x, p.y)); }
  for (const z of SPAWN_ZONES.filter((z) => z.y < DESERT_Y0)) {
    for (const k of Object.keys(z.mobs) as MobKind[]) assert.ok(!DESERT_KINDS.includes(k), `${z.name}: ${k}`);
    assert.ok(z.levels[1] <= 30, `${z.name} ${z.levels}`);
  }
});
