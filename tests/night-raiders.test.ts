import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE, WORLD_H } from "../shared/constants";
import { DESERT_Y0 } from "../shared/constants";
import { blocked } from "../shared/movement";
import { isSafeZone, SAFE_ZONE } from "../shared/map";
import { noMobsAt } from "../shared/spawns";
import { RAIDERS } from "../shared/raiders";
import { startRoom, wait } from "./helpers/room";

process.env.DAY_TIME = "night";

/** A clear patch of open ground (radius r px) near (tx, ty) tiles. */
function openAt(tx: number, ty: number, r = 80): { x: number; y: number } {
  for (let d = 0; d < 60; d++) for (let a = 0; a < 16; a++) {
    const x = (tx + Math.cos(a / 16 * Math.PI * 2) * d) * TILE, y = (ty + Math.sin(a / 16 * Math.PI * 2) * d) * TILE;
    let ok = true;
    for (let k = 0; k < 12 && ok; k++) { const px = x + Math.cos(k) * r * (k % 3) / 2, py = y + Math.sin(k) * r * (k % 3) / 2; ok = !blocked(px, py) && !isSafeZone(px, py) && !noMobsAt(px, py); }
    if (ok) return { x, y };
  }
  throw new Error("no open ground");
}

test("Night Raiders: ride by night at the act's top level, hunt the living, spare the dead, fall to dust", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    const said: string[] = [], dust: { id: string; killed: boolean }[] = [], came: { id: string; act: number }[] = [];
    c.onMessage("bosssay", ({ text }: { text: string }) => said.push(text));
    c.onMessage("raiderdust", (d: { id: string; killed: boolean }) => dust.push(d));
    c.onMessage("raider", (d: { id: string; act: number }) => came.push(d));
    await wait(200);
    const room = srv.room, pid = c.sessionId, p = room.state.players.get(pid);
    p.hp = p.maxHp = 999999; p.level = 30;
    const o = openAt(40, 120);
    p.x = o.x; p.y = o.y;

    // Act 1: one rider, Lv 30, comes out of the dark off screen
    const id = room.raidArrive(1, Date.now(), "vharn", p);
    assert.ok(id, "a rider arrives");
    const m = room.state.mobs.get(id);
    assert.equal(m.kind, "nightraider");
    assert.equal(m.level, 30, "Act 1 riders are Lv 30");
    assert.equal(m.title, "Vharn, the Ashbrand");
    assert.ok(Math.hypot(m.x - p.x, m.y - p.y) >= 15 * TILE, "arrives off screen");
    await wait(100);
    assert.equal(came.at(-1)?.id, id, "everyone hears it come");

    // it rides at a hero it sees and cuts him
    m.x = p.x + 70; m.y = p.y; m.nextAggro = 0;
    const hp0 = p.hp;
    for (let i = 0; i < 40 && p.hp === hp0; i++) await wait(100);
    assert.ok(p.hp < hp0, "the rider attacks the hero");

    // the dead are spared, the living cut down
    p.x = (SAFE_ZONE.x + SAFE_ZONE.w / 2) * TILE; p.y = (SAFE_ZONE.y + SAFE_ZONE.h / 2) * TILE; // out of reach in the square
    m.target = ""; m.foe = ""; m.x = o.x; m.y = o.y; m.nextAggro = 0;
    room.state.mobs.forEach((x: any, xid: string) => { if (xid !== id && Math.hypot(x.x - o.x, x.y - o.y) < 400) room.state.mobs.delete(xid); }); // a quiet patch of land
    room.spawnMob("skeleton", -1, "tskel", { x: o.x + 26, y: o.y, level: 10 });
    room.spawnMob("slime", -1, "tslime", { x: o.x - 40, y: o.y, level: 10 });
    const skel = room.state.mobs.get("tskel"), slime = room.state.mobs.get("tslime");
    const skelHp = skel.hp;
    for (let i = 0; i < 40 && !slime.dead; i++) { skel.x = m.x + 26; skel.y = m.y; await wait(100); }
    assert.ok(slime.dead || slime.hp < slime.maxHp, "a living monster is cut down");
    assert.equal(skel.hp, skelHp, "the dead are never touched");
    assert.notEqual(m.foe, "tskel");

    // only one at a time in Act 1
    assert.equal(room.raidArrive(1, Date.now(), "vharn", o), undefined, "a rider is never out twice");

    // cut down: a cloud of dust and its last words
    m.hp = 1;
    room.hitTarget(pid, id, 50, [0, 0], {});
    await wait(700);
    assert.ok(dust.some((d) => d.id === id && d.killed), "falls to dust");
    assert.ok(said.includes(RAIDERS[0].death), "its last words");
    assert.ok(!room.state.mobs.has(id), "gone from the map");

    // Act 2: Lv 50, two can ride at once
    const d = openAt(60, DESERT_Y0 + 80);
    p.x = d.x; p.y = d.y;
    const a = room.raidArrive(2, Date.now(), "moragh", p), b = room.raidArrive(2, Date.now(), "skarde", p);
    assert.ok(a && b, "two riders in the desert");
    assert.equal(room.state.mobs.get(a).level, 50, "Act 2 riders are Lv 50");
    assert.ok(room.state.mobs.get(a).y >= DESERT_Y0 * TILE && room.state.mobs.get(b).y >= DESERT_Y0 * TILE, "they ride in the act of the hero");
    assert.ok(room.state.mobs.get(a).y > WORLD_H * TILE);

    // dawn: they ride off into the dust
    process.env.DAY_TIME = "day";
    room.nextRaidCheck = 0;
    await wait(1300);
    assert.ok(dust.some((x) => x.id === a && !x.killed) && dust.some((x) => x.id === b && !x.killed), "gone at dawn");
  } finally {
    process.env.DAY_TIME = "night";
    await srv.stop();
  }
});
