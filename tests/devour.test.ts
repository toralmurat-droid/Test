import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafeZone, isSolidAt, VILLAGE } from "../shared/map";
import { TILE } from "../shared/constants";
import { cleanFeast, FEAST, FEAST_MAX, feastBonus, familyOf, thrallMax } from "../shared/devour";
import { skillOf } from "../shared/skills";
import { startRoom, wait } from "./helpers/room";

function openSpot(): [number, number] {
  for (let tx = VILLAGE.x0 - 14; tx > 0; tx--) {
    const x = (tx + 0.5) * TILE, y = (VILLAGE.y0 + 10.5) * TILE;
    if (!isSolidAt(x, y) && !isSafeZone(x, y) && !isSolidAt(x + 20, y) && !isSolidAt(x - 20, y)) return [x, y];
  }
  throw new Error("no open spot");
}

test("devour: families with flesh, bonuses per meal capped, saves checked", () => {
  assert.equal(familyOf("skeleton"), undefined);
  assert.equal(familyOf("golem_fire"), undefined);
  assert.equal(familyOf("hollowking"), undefined);
  assert.equal(familyOf("slime"), "blob");
  assert.equal(familyOf("bandit"), "outlaw");
  assert.equal(familyOf("gnawkin"), "beast");
  assert.equal(feastBonus({ blob: 4 }, "hp"), 4 * FEAST.blob.per);
  assert.equal(feastBonus({ outlaw: 999 }, "dmg"), FEAST_MAX * FEAST.outlaw.per);
  assert.deepEqual(cleanFeast({ blob: 3.7, outlaw: -1, nope: 5, beast: 999 }), { blob: 3, beast: FEAST_MAX });
  assert.deepEqual(cleanFeast("junk"), {});
  assert.equal(thrallMax(1), 2);
  assert.equal(thrallMax(3), 3);
  assert.ok(skillOf("vampire", "v_devour") && skillOf("vampire", "v_bite"));
});

test("Devour eats weak fleshy monsters (not skeletons); Bite turns them into capped thralls", async () => {
  const srv = await startRoom();
  const random = Math.random;
  try {
    const c = await srv.join({ cls: "vampire" });
    await wait(200);
    const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
    room.maxHero(room.clients.find((x: any) => x.sessionId === id));
    for (const k of ["v_rend", "v_devour", "v_bite"]) p.talents.set(k, 3);
    const [x, y] = openSpot();
    room.state.mobs.forEach((_m: any, mid: string) => room.state.mobs.delete(mid));
    p.x = x; p.y = y; p.ax = 1; p.ay = 0; p.invulnUntil = Date.now() + 120_000;
    p.mana = p.maxMana = 9999; p.energy = 100;
    const ready = () => { p.sk.last = {}; p.attackReadyAt = 0; p.sk.chargeUntil = 0; p.sk.windUntil = 0; p.stunUntil = 0; p.energy = 100; p.mana = 9999; };
    const mob = (kind: string, mid: string, frac: number) => {
      room.spawnMob(kind, 0, mid, { x: x + 20, y, level: 5 });
      const m = room.state.mobs.get(mid);
      m.hp = Math.max(1, Math.round(m.maxHp * frac));
      return m;
    };

    // A skeleton has nothing to eat: the skill is not cast
    const sk = mob("skeleton", "skel", 0.1);
    ready(); room.cast(id, "v_devour"); await wait(50);
    assert.equal(p.sk.last.v_devour, undefined, "no cast on a skeleton");
    assert.ok(!sk.dead);
    room.state.mobs.delete("skel");

    // A healthy blob is only bitten
    const blob = mob("slime", "blob1", 1);
    blob.maxHp = blob.hp = 5000;
    ready(); room.cast(id, "v_devour"); await wait(50);
    assert.ok(!blob.dead && blob.hp < 5000, "a healthy monster is just hurt");
    assert.deepEqual(p.feast, {});
    room.state.mobs.delete("blob1");

    // A weak bandit is eaten whole: it dies, XP comes, one bandit meal is kept
    p.level = 5; p.xp = 0; // low enough that a Lv 5 monster gives XP
    const xp0 = p.xp;
    const b = mob("bandit", "band1", 0.1);
    ready(); room.cast(id, "v_devour"); await wait(50);
    assert.ok(b.dead, "eaten");
    assert.ok(p.xp > xp0, "the kill counts");
    assert.deepEqual(p.feast, { outlaw: 1 });
    assert.deepEqual(room.snapshot(p).feast, { outlaw: 1 }, "saved");

    // Blobs give life
    const hpBefore = p.maxHp;
    const s = mob("slime", "blob2", 0.1);
    ready(); room.cast(id, "v_devour"); await wait(50);
    assert.ok(s.dead);
    assert.ok(p.maxHp > hpBefore, `life grows (${hpBefore} -> ${p.maxHp})`);

    // Bite (always succeeds here): a weak bandit falls and rises as a thrall; the cap keeps the newest 3
    Math.random = () => 0;
    const thralls = () => [...room.summons.values()].filter((m: any) => m.owner === id && m.thrall && !m.dead);
    for (let i = 0; i < 4; i++) {
      const v = mob("bandit", `bite${i}`, 0.1);
      ready(); room.cast(id, "v_bite"); await wait(50);
      assert.ok(v.dead, "the bitten one falls");
    }
    Math.random = random;
    assert.equal(thralls().length, 3);
    assert.ok(thralls().every((m: any) => m.kind === "bandit" && m.hp === m.maxHp));
    // Skeletons can't be bitten either
    mob("skeleton", "skel2", 0.1);
    ready(); room.cast(id, "v_bite"); await wait(50);
    assert.equal(p.sk.last.v_bite, undefined);
    await c.leave();
    await wait(200);
    assert.equal(thralls().length, 0, "thralls go when their vampire leaves");
  } finally {
    Math.random = random;
    await srv.stop();
  }
});
