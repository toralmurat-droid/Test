// Summoner Void Lord rework (2026-11-08): permanent golems and their respawn, Twin Bond, the grimoire, auras and
// Resonance, golem death bursts, Void Essence, the Black Hole on monsters, heroes and projectiles, Void Slip, the PvP
// settings, the Colossus splitting back, and old saves getting their skill points back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafeZone, isSolidAt, VILLAGE } from "../shared/map";
import { TILE } from "../shared/constants";
import { AURA, GOLEM, RESONANCE, SUMMON, SUMMONER_TREE } from "../shared/summons";
import { startRoom, wait } from "./helpers/room";

/** A walkable spot outside the stockade and the safe zone, with room around it. */
function openSpot(): [number, number] {
  for (let tx = VILLAGE.x0 - 14; tx > 0; tx--) {
    const x = (tx + 0.5) * TILE, y = (VILLAGE.y0 + 10.5) * TILE;
    let ok = !isSafeZone(x, y);
    for (let dx = -5 * TILE; ok && dx <= 5 * TILE; dx += TILE / 2) for (let dy = -2 * TILE; ok && dy <= 2 * TILE; dy += TILE / 2) if (isSolidAt(x + dx, y + dy)) ok = false;
    if (ok) return [x, y];
  }
  throw new Error("no open spot");
}

async function setup(n = 1) {
  const srv = await startRoom();
  const cs = [];
  for (let i = 0; i < n; i++) cs.push(await srv.join({ cls: "summoner" }));
  await wait(250);
  const room = srv.room;
  room.state.mobs.forEach((_m: any, mid: string) => room.state.mobs.delete(mid));
  room.summons.clear();
  const [x, y] = openSpot();
  const ps = cs.map((c) => room.state.players.get(c.sessionId));
  ps.forEach((p: any, i: number) => { p.x = x + i * 40; p.y = y; p.invulnUntil = 0; });
  const golems = (id: string) => [...room.summons.values()].filter((m: any) => m.owner === id && !m.dead && (m.slot >= 0 || m.kind === "golem_colossus"));
  return { srv, room, cs, ps, x, y, golems };
}

test("permanent golems: none in town, rise outside, come back 12 s after dying with a death burst and Essence; Twin Bond gives a second one at Lv 18", async () => {
  const { srv, room, cs, ps, x, y, golems } = await setup();
  try {
    const id = cs[0].sessionId, p = ps[0];
    // In the safe zone no golem rises, however long
    p.x = (VILLAGE.x0 + VILLAGE.x1) / 2 * TILE; p.y = (VILLAGE.y0 + VILLAGE.y1) / 2 * TILE;
    assert.ok(isSafeZone(p.x, p.y));
    const t0 = Date.now();
    room.autoGolems(t0); room.autoGolems(t0 + 60_000);
    assert.equal(golems(id).length, 0, "no golem in the safe zone");
    // Outside: one golem, fire (the default grimoire), GOLEM.enterMs after leaving
    p.x = x; p.y = y; p.golemAt = [0, 0];
    room.autoGolems(t0);
    assert.equal(golems(id).length, 0, "not at once");
    room.autoGolems(t0 + GOLEM.enterMs + 10);
    assert.deepEqual(golems(id).map((g: any) => [g.kind, g.slot]), [["golem_fire", 0]]);
    const g = golems(id)[0];
    assert.ok(g.banishAt > Date.now() + 3600_000, "a permanent golem never crumbles");
    // It dies next to a monster: the fire bursts out, the Summoner gains Essence, the slot waits GOLEM.respawnMs
    room.spawnMob("skeleton", 0, "burnt", { x: g.x + 10, y: g.y, level: 1 });
    const sk = room.state.mobs.get("burnt");
    sk.hp = sk.maxHp = 9999;
    const gid = [...room.summons].find(([, m]: any) => m === g)![0];
    const before = p.sk.stacks;
    room.mobDied(g, gid, "", "test");
    assert.ok(sk.hp < 9999, "the fire golem's death burst hurt the skeleton");
    assert.equal(p.sk.stacks, before + 1, "a creature back in the Void gives a charge of Essence");
    const back = p.golemAt[0];
    assert.ok(Math.abs(back - (Date.now() + GOLEM.respawnMs)) < 500, "it waits GOLEM.respawnMs");
    room.state.mobs.delete("burnt");
    room.autoGolems(back - 2000);
    assert.equal(golems(id).length, 0, "still in the Void");
    room.autoGolems(back + 10);
    assert.equal(golems(id).length, 1, "back out of the Void");
    // Lv 18 without Twin Bond: still one. With it: a second golem in the second grimoire slot
    p.level = 18;
    room.autoGolems(Date.now()); room.autoGolems(Date.now() + GOLEM.enterMs + 10);
    assert.equal(golems(id).length, 1);
    p.talents.set("su_might", 1); p.talents.set("su_twin", 1);
    room.autoGolems(Date.now()); room.autoGolems(Date.now() + GOLEM.enterMs + 10);
    assert.deepEqual(golems(id).map((x: any) => x.slot).sort(), [0, 1]);
    // ...and only from Lv 18
    p.level = 17;
    room.autoGolems(Date.now());
    assert.equal(golems(id).length, 1, "the second golem needs Lv 18");
    // Back into town: the golems go back
    p.x = (VILLAGE.x0 + VILLAGE.x1) / 2 * TILE; p.y = (VILLAGE.y0 + VILLAGE.y1) / 2 * TILE;
    room.autoGolems(Date.now());
    assert.equal(golems(id).length, 0);
    for (const c of cs) await c.leave();
  } finally {
    await srv.stop();
  }
});

test("grimoire: validated, picks each golem's element, auras and Resonance, saved with the hero; old saves get their points back", async () => {
  const { srv, room, cs, ps, golems } = await setup();
  try {
    const c = cs[0], id = c.sessionId, p = ps[0];
    p.level = 20; p.talents.set("su_golem", 1); p.talents.set("su_might", 1); p.talents.set("su_twin", 1);
    // bad messages are ignored
    c.send("grimoire", { slot: 0, el: "faith" }); c.send("grimoire", { slot: 2, el: "cold" }); c.send("grimoire", { slot: "x", el: "cold" });
    await wait(150);
    assert.equal(p.attune, 0, "fire, fire");
    c.send("grimoire", { slot: 0, el: "cold" });
    await wait(GOLEM.grimoireMs + 150);
    c.send("grimoire", { slot: 1, el: "cold" });
    await wait(150);
    assert.equal(room.grimoireOf(p), "cold,cold");
    room.autoGolems(Date.now()); room.autoGolems(Date.now() + GOLEM.enterMs + 10);
    assert.deepEqual(golems(id).map((g: any) => g.kind), ["golem_cold", "golem_cold"]);
    await wait(200); // the server tick tops the auras up
    const aura = (el: string) => p.sk.buffs.find((b: any) => b.id === `aura_${el}` && b.until > Date.now());
    assert.equal(aura("cold")?.b.armor, AURA.cold.armor! * RESONANCE, "two frost golems resonate");
    // a different element in slot 2: both auras, normal strength; the old golem goes back and the new one rises
    await wait(GOLEM.grimoireMs);
    c.send("grimoire", { slot: 1, el: "shock" });
    await wait(GOLEM.grimoireMs + 150);
    assert.equal(room.grimoireOf(p), "cold,shock");
    room.autoGolems(Date.now() + GOLEM.enterMs + 10);
    await wait(200);
    assert.deepEqual(golems(id).map((g: any) => g.kind).sort(), ["golem_cold", "golem_shock"]);
    assert.equal(aura("cold")?.b.armor, AURA.cold.armor);
    assert.equal(aura("shock")?.b.speed, AURA.shock.speed);
    // Resonance (the passive) makes every aura stronger
    p.talents.set("su_bond", 1); p.talents.set("su_resonance", 2);
    await wait(200);
    assert.ok(aura("shock")!.b.speed! > AURA.shock.speed!, "Resonance passive");
    // no golem, no aura
    for (const [gid] of [...room.summons]) room.dismiss(gid, false);
    p.x = (VILLAGE.x0 + VILLAGE.x1) / 2 * TILE; p.y = (VILLAGE.y0 + VILLAGE.y1) / 2 * TILE;
    await wait(250);
    assert.equal(aura("cold"), undefined);
    // saved with the hero
    const save = room.snapshot(p);
    assert.equal(save.grimoire, "cold,shock");
    assert.equal(save.suTree, SUMMONER_TREE);
    p.attune = 0; p.talents.clear();
    room.restore(p, save);
    assert.equal(room.grimoireOf(p), "cold,shock");
    assert.equal(p.talents.get("su_twin"), 1, "a save of today's tree keeps its points");
    // a save from the old tree: every point back, the default grimoire, no stale key
    p.talents.clear();
    room.restore(p, { ...save, suTree: undefined, talents: { su_golem: 3, su_attune: 1, su_blade: 2 }, slots: ["su_attune", "su_golem"], grimoire: "shock,shock" });
    assert.equal(p.talents.size, 0, "old tree: skill points come back");
    assert.equal(room.grimoireOf(p), "fire,fire");
    assert.deepEqual(p.slots.toArray().filter((s: string) => s), []);
    await c.leave();
  } finally {
    await srv.stop();
  }
});

test("Black Hole: pulls in, swallows worn monsters (Essence), eats enemy projectiles, throws heroes out without swallowing them", async () => {
  const { srv, room, cs, ps, x, y } = await setup(2);
  try {
    const id = cs[0].sessionId, p = ps[0], foe = ps[1];
    p.level = 20; foe.level = 20; p.mana = p.maxMana = 9999;
    p.talents.set("su_blackhole", 1);
    p.x = x - 60; p.y = y; p.ax = 1; p.ay = 0; foe.x = x + 200;
    room.spawnMob("skeleton", 0, "pulled", { x: x + 40, y, level: 1 });
    const sk = room.state.mobs.get("pulled");
    sk.hp = sk.maxHp = 99999;
    p.aimDist = 60; // the click: the hole opens at (x, y)
    room.cast(id, "su_blackhole");
    let hole: any;
    room.state.fields.forEach((f: any) => { if (f.inst.def.hole) hole = f; });
    assert.ok(hole && Math.abs(hole.x - x) < 2, "the hole opens on the clicked spot");
    const d0 = Math.hypot(sk.x - hole.x, sk.y - hole.y);
    await wait(700);
    assert.ok(Math.hypot(sk.x - hole.x, sk.y - hole.y) < d0, "the skeleton is dragged in");
    assert.ok(sk.hp < 99999, "it is torn at");
    // an enemy projectile entering the hole vanishes
    const { Projectile } = await import("../server/TownRoom");
    const shot = new Projectile();
    shot.x = hole.x - 30; shot.y = hole.y; shot.vx = 1; shot.vy = 0; shot.speed = 100; shot.range = 400; shot.radius = 3;
    shot.owner = "pulled"; shot.mobLevel = 1; shot.damage = 5; shot.kind = "bone";
    room.state.projectiles.set("eaten", shot);
    await wait(150);
    assert.ok(!room.state.projectiles.has("eaten"), "the hole swallowed the projectile");
    // worn below 15%: swallowed and spat out further away, a charge of Essence
    const st0 = p.sk.stacks;
    sk.hp = Math.round(sk.maxHp * 0.1);
    await wait(650);
    assert.ok(Math.hypot(sk.x - hole.x, sk.y - hole.y) >= 2 * TILE - 1, "spat out at least 2 tiles away");
    assert.equal(p.sk.stacks, st0 + 1, "a swallowed foe gives Essence");
    assert.ok(!sk.dead);
    // a hero inside when it closes is hurt and thrown 3-4 tiles out, never swallowed
    room.state.mobs.delete("pulled");
    foe.x = hole.x + 20; foe.y = hole.y; foe.invulnUntil = 0;
    const hp0 = foe.hp;
    hole.inst.until = Date.now() + 600;
    await wait(1000);
    const dist = Math.hypot(foe.x - hole.x, foe.y - hole.y);
    assert.ok(foe.hp < hp0, "the hero is torn at");
    assert.ok(!foe.dead);
    assert.ok(dist >= 3 * TILE - 1 && dist <= 4 * TILE + 1, `thrown out ${Math.round(dist)} px`);
    assert.ok(!isSafeZone(foe.x, foe.y) && !isSolidAt(foe.x, foe.y));
    for (const c of cs) await c.leave();
  } finally {
    await srv.stop();
  }
});

test("Void Slip: below 25% the Summoner slips into the Void once a minute, monsters lose them", async () => {
  const { srv, room, cs, ps, x, y } = await setup();
  try {
    const id = cs[0].sessionId, p = ps[0];
    p.level = 20; p.talents.set("su_slip", 1);
    room.spawnMob("skeleton", 0, "hunter", { x: x + 20, y, level: 1 });
    const sk = room.state.mobs.get("hunter");
    sk.target = id;
    p.hp = Math.round(p.maxHp * 0.3);
    room.damagePlayer(id, Math.round(p.maxHp * 0.1), "test", [0, 0], 0, { from: "hunter" });
    const now = Date.now();
    assert.ok(p.invulnUntil >= now + 1400, "untouchable for ~1.5 s");
    assert.equal(sk.target, "", "the monster lost them");
    room.pickTarget(sk, { aggroRange: 200, leash: 400 });
    assert.notEqual(sk.target, id, "and can't find them in the Void");
    const hp = p.hp;
    room.damagePlayer(id, 50, "test", [0, 0], 0, { from: "hunter" });
    assert.equal(p.hp, hp, "no damage in the Void");
    // once a minute
    p.invulnUntil = 0; p.sk.last.slipUntil = 0;
    room.damagePlayer(id, 5, "test", [0, 0], 0, { from: "hunter" });
    assert.ok(p.invulnUntil < Date.now() + 500, "not again before its cooldown");
    await cs[0].leave();
  } finally {
    await srv.stop();
  }
});

test("Stone Bond gives Essence at most every 3 s; PvP settings: creatures' blows on heroes and heroes' blows on creatures", async () => {
  const { srv, room, cs, ps, golems } = await setup(2);
  try {
    const a = cs[0].sessionId, b = cs[1].sessionId, A = ps[0], B = ps[1];
    A.level = 20; B.level = 20;
    room.autoGolems(Date.now()); room.autoGolems(Date.now() + GOLEM.enterMs + 10);
    const g = golems(a)[0];
    g.x = A.x + 10; g.y = A.y; g.hp = g.maxHp = 99999;
    const st = A.sk.stacks;
    room.damagePlayer(a, 40, "test", [0, 0], 0); room.damagePlayer(a, 40, "test", [0, 0], 0); room.damagePlayer(a, 40, "test", [0, 0], 0);
    assert.equal(A.sk.stacks, st + 1, "one charge per ESSENCE.bondEveryMs");
    // a creature's blow on a hero is scaled by SUMMON.pvp.dmg
    B.invulnUntil = 0; B.hp = B.maxHp = 99999;
    room.hitTarget(a, b, 200, [0, 0], { kb: 0 });
    const plain = 99999 - B.hp;
    B.hp = 99999; B.invulnUntil = 0; B.sk.counter = undefined;
    room.hitTarget(a, b, 200, [0, 0], { kb: 0, pet: true });
    const pet = 99999 - B.hp;
    assert.ok(Math.abs(pet / plain - SUMMON.pvp.dmg) < 0.05, `pet ${pet} vs plain ${plain}`);
    // a hero's blow on a creature is divided by SUMMON.pvp.hp
    const pvp = SUMMON.pvp as { hp: number };
    const old = pvp.hp;
    try {
      pvp.hp = 2;
      g.hp = 99999;
      room.hitTarget(b, [...room.summons].find(([, m]: any) => m === g)![0], 400, [0, 0], { kb: 0 });
      const took = 99999 - g.hp;
      g.hp = 99999; pvp.hp = 1;
      room.hitTarget(b, [...room.summons].find(([, m]: any) => m === g)![0], 400, [0, 0], { kb: 0 });
      assert.ok(Math.abs(took / (99999 - g.hp) - 0.5) < 0.05, "half the damage with pvp.hp = 2");
    } finally { pvp.hp = old; }
    for (const c of cs) await c.leave();
  } finally {
    await srv.stop();
  }
});

test("Colossus: fuses the golems with both their powers, spends Essence, splits back into them when its time is up", async () => {
  const { srv, room, cs, ps, golems } = await setup();
  try {
    const id = cs[0].sessionId, p = ps[0];
    p.level = 20; p.mana = p.maxMana = 9999;
    for (const s of ["su_golem", "su_might", "su_twin", "su_colossus"]) p.talents.set(s, 1);
    room.setGrimoire(p, "fire,poison");
    room.autoGolems(Date.now()); room.autoGolems(Date.now() + GOLEM.enterMs + 10);
    assert.equal(golems(id).length, 2);
    p.sk.stacks = 4; p.sk.stackAt = Date.now();
    room.cast(id, "su_colossus");
    await wait(800); // its charge
    const col = golems(id);
    assert.deepEqual(col.map((g: any) => g.kind), ["golem_colossus"]);
    assert.deepEqual(col[0].mind.els, ["fire", "poison"], "both golems' powers");
    assert.equal(p.sk.stacks, 0, "it spent the Essence");
    await wait(200);
    assert.ok(p.sk.buffs.some((b: any) => b.id === "aura_fire") && p.sk.buffs.some((b: any) => b.id === "aura_poison"), "both auras");
    col[0].banishAt = Date.now() - 1;
    await wait(200);
    assert.deepEqual(golems(id).map((g: any) => g.kind).sort(), ["golem_fire", "golem_poison"], "split back into the golems");
    await cs[0].leave();
  } finally {
    await srv.stop();
  }
});
