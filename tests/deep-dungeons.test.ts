import { test } from "node:test";
import assert from "node:assert/strict";
import { actOfTile, DEEP_END, DEEP_Y0, MAP_H, MAP_W, TILE } from "../shared/constants";
import { arrivalAt, CRYPT_FLOORS, FLOORS, floorAt, LINKS, linkById, routeVia, UNDER_FLOORS, underground } from "../shared/dungeon";
import { DOORS, isSolidTile, setDoorOpen } from "../shared/map";
import { SPAWN_ZONES } from "../shared/spawns";
import { CHAINS, chainState, packQuest, ZONE_ARCS } from "../shared/quests";
import { actAt } from "../shared/act2";
import { startRoom, wait } from "./helpers/room";

const deep = [...CRYPT_FLOORS, ...UNDER_FLOORS];

test("deep dungeons: in the deep band, the right act, every link and chamber reachable", () => {
  for (const f of deep) {
    assert.ok(f.y > DEEP_Y0 && f.y + f.h <= DEEP_END && f.x + f.w <= MAP_W && MAP_H >= DEEP_END, `${f.name} fits the deep band`);
    assert.ok(underground(f.y * TILE + TILE * 10), `${f.name} is below ground`);
    assert.equal(floorAt(f.x + 5, f.y + 5), f);
  }
  assert.equal(actOfTile(CRYPT_FLOORS[0].x + 9, CRYPT_FLOORS[0].y + 8), 1, "the Lantern Crypt is Act 1's");
  assert.equal(actOfTile(UNDER_FLOORS[1].x + 9, UNDER_FLOORS[1].y + 8), 2, "the Undercity is Act 2's");
  assert.equal(actAt(CRYPT_FLOORS[1].y * TILE + 400, CRYPT_FLOORS[1].x * TILE + 400), 1);
  // every link leads somewhere open, both ways
  for (const l of LINKS) {
    const to = linkById(l.to)!, at = arrivalAt(to);
    assert.ok(to, `${l.id} -> ${l.to}`);
    assert.ok(!isSolidTile(Math.floor(l.x / TILE), Math.floor(l.y / TILE)), `${l.id} stands on open ground`);
    assert.ok(!isSolidTile(Math.floor(at.x / TILE), Math.floor(at.y / TILE)), `arriving by ${l.id} lands on open ground`);
  }
  // with the gates open, each floor's chambers all join up with its landing (the secret rooms once broken into)
  for (const d of DOORS) setDoorOpen(d.id, true);
  try {
    for (const f of deep) {
      const land = LINKS.find((l) => l.floor === f.id && !l.down && l.id.endsWith("up"))!, a = arrivalAt(linkById(land.to)!);
      const start = [Math.floor(land.x / TILE), Math.floor(land.y / TILE)], seen = new Set([start[1] * MAP_W + start[0]]), q = [start];
      while (q.length) {
        const [x, y] = q.pop()!;
        for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + i, ny = y + j, k = ny * MAP_W + nx;
          if (seen.has(k) || isSolidTile(nx, ny)) continue;
          seen.add(k); q.push([nx, ny]);
        }
      }
      f.chambers.forEach((c, i) => assert.ok(seen.has(Math.round(f.y + c.y) * MAP_W + Math.round(f.x + c.x)), `${f.name}: chamber ${i} reachable`));
      for (const l of LINKS.filter((k) => k.floor === f.id)) assert.ok(seen.has(Math.floor(l.y / TILE) * MAP_W + Math.floor(l.x / TILE)), `${f.name}: ${l.id} reachable`);
      assert.ok(a, "landing");
    }
  } finally {
    for (const d of DOORS) setDoorOpen(d.id, false);
  }
  // monsters live on every floor, nothing spawns in the boss halls
  for (const f of deep) assert.ok(Object.keys(SPAWN_ZONES.find((z) => z.name === f.name)!.mobs).length, `${f.name} has monsters`);
});

test("deep dungeons: the quest tracker routes heroes down the right way", () => {
  const [C1, C2] = CRYPT_FLOORS, [U1, U2] = UNDER_FLOORS, px = (t: number) => (t + 0.5) * TILE;
  const boss = (f: typeof C2) => [px(f.x + f.chambers[5].x), px(f.y + f.chambers[5].y)] as const;
  assert.equal(routeVia(...boss(C2), px(40), px(150))?.id, "crypt", "from Barrow Downs: the crypt stair");
  assert.equal(routeVia(...boss(C2), px(C1.x + 20), px(C1.y + 20))?.id, "c1down", "from the Catacombs: on down");
  assert.equal(routeVia(px(C1.x + 20), px(C1.y + 20), ...boss(C2))?.id, "c2up", "from the Choir: back up");
  assert.equal(routeVia(...boss(U2), px(60), px(480))?.id, "shaft", "from Kharsun: the well");
  assert.equal(routeVia(...boss(U2), px(U1.x + 20), px(U1.y + 20))?.id, "u1down");
  assert.equal(routeVia(...boss(C2), px(FLOORS[0].x + 9), px(FLOORS[0].y + 8))?.id, "f1up", "from the Mawdeep: out first");
});

test("deep dungeons: the Hollow Abbot rises for his hero by day (no day underground), and speaks", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    const said: string[] = [];
    c.onMessage("bosssay", (m: { text: string }) => said.push(m.text));
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    const ci = CHAINS.findIndex((x) => x.id === "crypt"), arc = ZONE_ARCS.find((a) => a.id === "crypt")!;
    p.quests.set("tut", packQuest(CHAINS.find((x) => x.id === "tutorial")!.quests.length, 0, 0));
    p.level = 17;
    p.quests.set("crypt", packQuest(arc.quests.length - 1, 1, 0)); // on the last quest, step 1: the Abbot
    room.undeadUp = false; // broad day above
    const s = arc.quests[arc.quests.length - 1].steps[0].summon!;
    p.x = s.x; p.y = s.y + 3 * TILE;
    await wait(1500);
    let abbot: any;
    room.state.mobs.forEach((m: any) => { if (m.summonFor === c.sessionId && m.summonChain === ci) abbot = m; });
    assert.ok(abbot, "the Abbot rose");
    assert.equal(abbot.title, "Abbot Morrow, the Hollow Abbot");
    await wait(1500);
    assert.ok(said.some((t) => s.voice!.wake.includes(t)), "he had his say as he rose");
    assert.equal(chainState(p, ci)!.questStage, 1);
    await c.leave();
  } finally {
    await srv.stop();
  }
});
