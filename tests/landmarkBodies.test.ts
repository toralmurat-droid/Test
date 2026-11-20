// A body slid or put down by the room (a hero's dash or pull through the skill host, a beast's rush) stops before a
// landmark's solid box (shared/landmarks.ts), the way walking does, and can walk on afterwards: never inside it or
// through it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, until, wait } from "./helpers/room";
import { LANDMARKS } from "../shared/landmarks";
import { blocked, moveStep } from "../shared/movement";
import { TILE } from "../shared/constants";

const hf = LANDMARKS.find((l) => l.id === "headframe")!, [bx, by, bw, bh] = hf.solid!;
const inBox = (x: number, y: number) => x >= bx * TILE && x < (bx + bw) * TILE && y >= by * TILE && y < (by + bh) * TILE;
/** Free to stand, and a step back the way it came is open (it isn't wedged). */
const walksOff = (x: number, y: number) => !blocked(x, y) && moveStep(x, y, { up: false, down: false, left: true, right: false } as never, 0.1).x < x;

test("a hero's dash and a beast's rush toward the headframe stop before it and walk on", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    await until(() => !!srv.room.state.players.get(c.sessionId));
    const room = srv.room, p = room.state.players.get(c.sessionId);
    const midY = (by + bh / 2) * TILE, west = (bx - 3) * TILE;
    // the hero dashes east at the box (the skill engine's move: dashes, leaps, pulls and pushes)
    p.x = west; p.y = midY; p.hp = p.maxHp = 1e7;
    room.host.move(c.sessionId, 1, 0, 6 * TILE);
    assert.ok(p.x > west + TILE, `the dash went nowhere (${p.x})`);
    assert.ok(p.x < bx * TILE, `the hero dashed through the headframe to ${p.x / TILE}`);
    assert.ok(!inBox(p.x, p.y) && walksOff(p.x, p.y), `the hero stopped in the headframe at ${p.x / TILE},${p.y / TILE}`);
    assert.equal(room.host.place(c.sessionId, (bx + bw / 2) * TILE, midY), false, "a leap may not land in the box");
    // a beast (a scorpion's straight rush, gore) charges the box from the west, its hero standing south of it
    const [id, m] = ([...room.state.mobs.entries()] as [string, any][]).find(([, q]) => (q.kind === "scorpion" || q.kind === "tuskborn") && !q.dead)!;
    assert.ok(m, "a scorpion or tuskborn in the world");
    p.x = (bx + bw / 2) * TILE; p.y = (by + bh + 3) * TILE;
    m.x = m.homeX = west; m.y = m.homeY = midY; m.hidden = false; m.target = c.sessionId; m.specialAt = 0; m.specialKind = "";
    for (let k = 0; k < 3; k++) {
      m.x = west; m.y = midY;
      m.rushUntil = Date.now() + 900; m.rushKind = "gore"; m.rushVX = 380; m.rushVY = 0; m.rushHit = []; m.rushTurn = 0;
      await until(() => !m.rushUntil, 3000);
      assert.ok(!m.rushUntil, `${m.kind} ${id}: the rush never ended`);
      assert.ok(m.x > west + 8, `${m.kind} didn't rush (${m.x})`);
      assert.ok(m.x < bx * TILE, `${m.kind} rushed through the headframe to ${m.x / TILE}`);
      assert.ok(!inBox(m.x, m.y) && walksOff(m.x, m.y), `${m.kind} ended its rush in the headframe at ${m.x / TILE},${m.y / TILE}`);
      await wait(50);
    }
  } finally { await srv.stop(); }
});

// the Lists on the Tourney Grounds (a monster zone): the tilt barrier is thin, so a slide must not skip across it
test("a hero's dash and a beast's rush north at the Lists' tilt barrier stop south of it and walk on", async () => {
  const lists = LANDMARKS.find((l) => l.id === "lists")!, [tx, ty, tw, th] = lists.parts![0];
  const inTilt = (x: number, y: number) => x >= tx * TILE && x < (tx + tw) * TILE && y >= ty * TILE && y < (ty + th) * TILE;
  const walksBack = (x: number, y: number) => !blocked(x, y) && moveStep(x, y, { up: false, down: true, left: false, right: false } as never, 0.1).y > y;
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    await until(() => !!srv.room.state.players.get(c.sessionId));
    const room = srv.room, p = room.state.players.get(c.sessionId);
    const midX = (tx + tw / 2) * TILE, south = (ty + th + 3) * TILE;
    p.x = midX; p.y = south; p.hp = p.maxHp = 1e7;
    room.host.move(c.sessionId, 0, -1, 6 * TILE);
    assert.ok(p.y < south - TILE, `the dash went nowhere (${p.y})`);
    assert.ok(p.y > (ty + th) * TILE, `the hero dashed over the tilt to ${p.y / TILE}`);
    assert.ok(!inTilt(p.x, p.y) && walksBack(p.x, p.y), `the hero stopped in the tilt at ${p.x / TILE},${p.y / TILE}`);
    const [id, m] = ([...room.state.mobs.entries()] as [string, any][]).find(([, q]) => (q.kind === "scorpion" || q.kind === "tuskborn") && !q.dead)!;
    p.x = midX + 4 * TILE; p.y = (ty - 3) * TILE;
    m.homeX = midX; m.homeY = south; m.hidden = false; m.target = c.sessionId; m.specialAt = 0; m.specialKind = "";
    for (let k = 0; k < 3; k++) {
      m.x = midX; m.y = south;
      m.rushUntil = Date.now() + 900; m.rushKind = "gore"; m.rushVX = 0; m.rushVY = -380; m.rushHit = []; m.rushTurn = 0;
      await until(() => !m.rushUntil, 3000);
      assert.ok(!m.rushUntil, `${m.kind} ${id}: the rush never ended`);
      assert.ok(m.y < south - 8, `${m.kind} didn't rush (${m.y})`);
      assert.ok(m.y > (ty + th) * TILE, `${m.kind} rushed over the tilt to ${m.y / TILE}`);
      assert.ok(!inTilt(m.x, m.y) && walksBack(m.x, m.y), `${m.kind} ended its rush in the tilt at ${m.x / TILE},${m.y / TILE}`);
      await wait(50);
    }
  } finally { await srv.stop(); }
});
