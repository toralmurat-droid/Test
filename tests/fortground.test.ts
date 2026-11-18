import { test } from "node:test";
import assert from "node:assert/strict";
import { MAP_W, TILE, type MobKind } from "../shared/constants";
import { POSTS } from "../shared/bandits";
import { CHESTS } from "../shared/chests";
import { LAIRS } from "../shared/dungeon";
import { QUESTS } from "../shared/quests";
import { SPAWN_ZONES } from "../shared/spawns";
import { TIDE_GOAL, TIDE_SPAWNS } from "../shared/tide";
import { FORT_GROUND_MARGIN, fortGroundAt, fortGroundTile, isWildMob, nearestOffFort, wildSpawnPoint } from "../shared/war/fortGround";
import { holdTiles } from "../shared/war/holdWalls";
import { HOLDS } from "../shared/war/standards";
import { HoldWalls, type WallBody } from "../server/holdWalls";

const plain = { kind: "slime", owner: "", summonFor: "" };

test("fort ground: every tile of every clan's fort at every tier, and its margin, is fort ground", () => {
  assert.ok(HOLDS.length > 0);
  for (const h of HOLDS) {
    assert.ok(fortGroundAt(h.x, h.y), `Hold ${h.t}'s middle`);
    for (const k of holdTiles(h.t)) {
      const tx = k % MAP_W, ty = (k - tx) / MAP_W;
      for (let dy = -FORT_GROUND_MARGIN; dy <= FORT_GROUND_MARGIN; dy++) for (let dx = -FORT_GROUND_MARGIN; dx <= FORT_GROUND_MARGIN; dx++)
        assert.ok(fortGroundTile(tx + dx, ty + dy), `Hold ${h.t}: tile ${tx + dx},${ty + dy}`);
    }
  }
  assert.equal(fortGroundTile(-1, 0), false, "off the map: not fort ground");
});

test("fort ground: wild spawn rolls never land on it, and every zone still finds a spot", () => {
  let found = 0;
  SPAWN_ZONES.forEach((z) => {
    const kind = Object.keys(z.mobs)[0] as MobKind | undefined;
    if (!kind) return;
    let got = 0;
    for (let i = 0; i < 30; i++) {
      const pt = wildSpawnPoint(z, kind);
      if (!pt) continue;
      got++;
      assert.ok(!fortGroundAt(pt.x, pt.y), `${z.name}: (${pt.x}, ${pt.y}) is fort ground`);
    }
    assert.ok(got >= 25, `${z.name}: only ${got}/30 spawns found ground off the forts`);
    found += got;
  });
  assert.ok(found > 0);
  assert.equal(wildSpawnPoint(SPAWN_ZONES[0], Object.keys(SPAWN_ZONES[0].mobs)[0] as MobKind, () => false), null, "gives up after its tries");
});

test("fort ground: who counts as wild", () => {
  assert.equal(isWildMob(plain), true);
  assert.equal(isWildMob({ ...plain, kind: "trooper" }), false, "a clan's trooper");
  assert.equal(isWildMob({ ...plain, owner: "hero" }), false, "a hero's summon (or a charmed monster)");
  assert.equal(isWildMob({ ...plain, summonFor: "hero" }), false, "a quest monster");
  assert.equal(isWildMob({ ...plain, tide: true }), false, "a Gloam Tide marcher");
  assert.equal(isWildMob({ ...plain, camp: true }), false, "a Redfang camp bandit");
  assert.equal(isWildMob({ ...plain, guard: "lair_2" }), false, "a lair chest's guardian");
});

test("fort ground: lairs, the Tide and quest spawns stay clear; camp posts and guarded chests inside a fort belong to exempt monsters", () => {
  for (const l of LAIRS) for (let x = l.x; x < l.x + l.w; x++) for (let y = l.y; y < l.y + l.h; y++) assert.ok(!fortGroundTile(x, y), `${l.name} (${x},${y})`);
  assert.ok(!fortGroundAt(TIDE_GOAL.x, TIDE_GOAL.y) && TIDE_SPAWNS.every((p) => !fortGroundAt(p.x, p.y)), "the Gloam Tide's march");
  // Redfang Hollow, Fangrock and Hidehall have their Hold in the camp: those bandits are camp mobs (Mob.camp, exempt),
  // spawned on their posts (TownRoom freeSpawnPoint), never through the wild re-roll. Pinned so a new one is looked at.
  const campPosts = POSTS.filter((p) => [p.at, ...(p.route ?? [])].some(([x, y]) => fortGroundTile(x, y)));
  assert.deepEqual([...new Set(campPosts.map((p) => p.camp))].sort(), [0, 1, 2, 3]);
  // a few lair chests lie in a Hold's courtyard: their guardians carry Mob.guard (exempt)
  const chests = CHESTS.filter((c) => c.guards && fortGroundAt(c.x, c.y)).map((c) => c.id);
  assert.ok(chests.length <= 8, `guarded chests in forts: ${chests.join(", ")}`);
  // quest bosses carry Mob.summonFor (exempt) wherever their step puts them; two (jelly, thorn) are on fort ground today
  const summons = QUESTS.filter((q) => q.steps.some((s) => s.summon && fortGroundAt(s.summon.x, s.summon.y))).map((q) => q.id);
  assert.ok(summons.length <= 4, `quest summons in forts: ${summons.join(", ")}`);
});

test("fort ground: the wall sweep gives a wild monster whose home lies in a fort a home outside, and leaves the others", () => {
  const h = HOLDS[0];
  const wild: WallBody & { id: string } = { id: "w", x: h.x, y: h.y, homeX: h.x, homeY: h.y };
  const tame: WallBody & { id: string } = { id: "t", x: h.x, y: h.y, homeX: h.x, homeY: h.y };
  const walls = new HoldWalls({ heroes: () => [], mobs: () => [["w", wild], ["t", tame]], wild: (m) => m === wild });
  walls.sync(undefined);
  assert.ok(!fortGroundAt(wild.homeX!, wild.homeY!), "the wild one's home moved out");
  assert.ok(Math.hypot(wild.homeX! - h.x, wild.homeY! - h.y) < 20 * TILE, "to the nearest ground outside");
  assert.equal(tame.homeX, h.x); assert.equal(tame.homeY, h.y);
  const out = nearestOffFort(h.x, h.y)!;
  assert.ok(out && !fortGroundAt(out.x, out.y));
});
