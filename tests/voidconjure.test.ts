// Summoner Void Lord rework, session B (2026-11-08): the elemental wisps (AI, cap, expiry into the Void, last bursts),
// the Void Arsenal (blade, lance, axe, four wisps), Void Blades taking the golems' element, and the staff bolt going
// through a Void portal (longer reach, short last stretch) with its bursting finisher.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafeZone, isSolidAt, VILLAGE } from "../shared/map";
import { TILE } from "../shared/constants";
import { CLASSES } from "../shared/classes";
import { GOLEM, PORTAL, WISP, wispEls } from "../shared/summons";
import { startRoom, wait } from "./helpers/room";

/** A walkable spot outside the stockade and the safe zone, with room around it. */
function openSpot(): [number, number] {
  for (let tx = VILLAGE.x0 - 14; tx > 0; tx--) {
    const x = (tx + 0.5) * TILE, y = (VILLAGE.y0 + 10.5) * TILE;
    let ok = !isSafeZone(x, y);
    for (let dx = -8 * TILE; ok && dx <= 8 * TILE; dx += TILE / 2) for (let dy = -2 * TILE; ok && dy <= 2 * TILE; dy += TILE / 2) if (isSolidAt(x + dx, y + dy)) ok = false;
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
  ps.forEach((p: any, i: number) => { p.x = x + i * 40; p.y = y; p.invulnUntil = 0; p.mana = p.maxMana = 9999; });
  const wisps = (id: string) => [...room.summons.values()].filter((m: any) => m.owner === id && !m.dead && m.kind === "wisp");
  const tough = (id: string, mx: number, my: number) => {
    room.spawnMob("skeleton", 0, id, { x: mx, y: my, level: 1 });
    const m = room.state.mobs.get(id);
    m.hp = m.maxHp = 99999;
    m.stunUntil = Date.now() + 600_000; // it stays put
    return m;
  };
  return { srv, room, cs, ps, x, y, wisps, tough };
}

/** Record every hit the room deals (attacker, target, options) while still dealing it. */
function spyHits(room: any) {
  const log: { a: string; t: string; dmg: number; o: any }[] = [];
  const orig = room.hitTarget.bind(room);
  room.hitTarget = (a: string, t: string, dmg: number, push: [number, number], o: any = {}) => { log.push({ a, t, dmg, o }); return orig(a, t, dmg, push, o); };
  return log;
}

test("wisps: one per golem element in turn, +1 with Swarm (at most 4), shoot foes in reach as pets, go back to the Void with Essence and their last burst", async () => {
  const { srv, room, cs, ps, x, y, wisps, tough } = await setup();
  try {
    const id = cs[0].sessionId, p = ps[0];
    p.level = 20;
    for (const s of ["su_golem", "su_might", "su_twin", "su_blades", "su_wisps"]) p.talents.set(s, 1);
    room.setGrimoire(p, "cold,shock");
    room.autoGolems(Date.now()); room.autoGolems(Date.now() + GOLEM.enterMs + 10);
    assert.deepEqual(wispEls(["fire"], 3), ["fire", "fire", "fire"]);
    assert.deepEqual(wispEls([], 2), ["fire", "fire"], "no golem out: fire wisps");
    room.cast(id, "su_wisps");
    assert.deepEqual(wisps(id).map((w: any) => w.weapon), ["cold", "shock", "cold"], "three wisps, the golems' elements in turn");
    // Swarm: a fourth one; casting again sends the old ones back without Essence
    p.talents.set("su_swarm", 1);
    const st0 = p.sk.stacks;
    p.sk.last["su_wisps"] = -1e12;
    room.cast(id, "su_wisps");
    assert.equal(wisps(id).length, 4, "Swarm: four wisps");
    assert.equal(p.sk.stacks, st0, "replaced wisps give no Essence");
    assert.equal(room.summons.size, 2 + 4, "two golems and four wisps, the old wisps are gone");
    // They shoot a foe in reach (flagged as a creature's shot), and float round their owner
    const log = spyHits(room);
    const sk = tough("target", x + 90, y);
    await wait(1600);
    assert.ok(sk.hp < 99999, "the wisps' shots hit the skeleton");
    assert.ok(log.some((h) => h.a === id && h.t === "target" && h.o.pet), "wisp shots are dealt as a pet in the owner's name");
    for (const w of wisps(id)) assert.ok(Math.hypot(w.x - p.x, w.y - p.y) < WISP.float + 16, "they float close to their owner");
    // Stone Bond never picks a wisp
    const near = room.bondOf(id, p);
    assert.ok(near && near[1].kind.startsWith("golem_"), "the bond goes to a golem");
    // Time up: each goes back to the Void (a charge of Essence each, up to 5); the storm wisp speeds its owner up
    room.state.mobs.delete("target");
    p.sk.stacks = 0;
    for (const w of wisps(id)) w.banishAt = Date.now() - 1;
    await wait(200);
    assert.equal(wisps(id).length, 0);
    assert.equal(p.sk.stacks, 4, "four wisps back in the Void: four charges");
    assert.ok(p.sk.buffs.some((b: any) => b.id === "wisp_shock" && b.until > Date.now()), "the storm wisp's last spark: a rush of speed");
    // A venom wisp destroyed heals its owner a little, and still gives Essence
    room.setGrimoire(p, "poison,poison");
    room.dismissAll(id);
    room.autoGolems(Date.now()); room.autoGolems(Date.now() + GOLEM.enterMs + 10);
    p.sk.last["su_wisps"] = -1e12;
    room.cast(id, "su_wisps");
    const [wid, w] = [...room.summons].find(([, m]: any) => m.kind === "wisp" && !m.dead)!;
    assert.equal((w as any).weapon, "poison");
    p.hp = Math.round(p.maxHp / 2);
    const hp0 = p.hp, s0 = p.sk.stacks;
    room.mobDied(w, wid, "", "test");
    assert.ok(p.hp > hp0, "the venom wisp heals its owner as it goes");
    assert.equal(p.sk.stacks, Math.min(5, s0 + 1));
    await cs[0].leave();
  } finally {
    await srv.stop();
  }
});

test("Void Arsenal: a circling blade, a piercing lance, a wide axe and all four wisps; it spends the Essence", async () => {
  const { srv, room, cs, ps, x, y, wisps, tough } = await setup();
  try {
    const id = cs[0].sessionId, p = ps[0];
    p.level = 22;
    for (const s of ["su_blades", "su_edge", "su_arsenal"]) p.talents.set(s, 1);
    p.sk.stacks = 3; p.sk.stackAt = Date.now();
    const far = tough("far", x + 150, y), close = tough("close", x + 40, y);
    const log = spyHits(room);
    room.cast(id, "su_arsenal");
    await wait(600); // its charge
    assert.equal(p.sk.stacks, 0, "it spent the Essence");
    assert.deepEqual(wisps(id).map((w: any) => w.weapon).sort(), ["cold", "fire", "poison", "shock"], "all four wisps");
    let blade: any;
    room.state.fields.forEach((f: any) => { if (f.skill === "su_arsenal") blade = f; });
    assert.ok(blade && blade.follow, "the blade circles its owner");
    await wait(2400);
    const lance = log.some((h) => h.a === id && h.t === "far" && !h.o.pet && h.o.skill);
    assert.ok(lance, "the lance reached the far skeleton");
    assert.ok(log.filter((h) => h.t === "close" && h.o.skill && !h.o.dot).length >= 1, "the axe swept the close one");
    assert.ok(far.hp < 99999 && close.hp < 99999);
    await cs[0].leave();
  } finally {
    await srv.stop();
  }
});

test("Void Blades take the golems' element (alternating with two), and more blades cut harder", async () => {
  const { srv, room, cs, ps, x, y, tough } = await setup();
  try {
    const id = cs[0].sessionId, p = ps[0];
    p.level = 20;
    for (const s of ["su_golem", "su_might", "su_twin", "su_blades"]) p.talents.set(s, 1);
    room.setGrimoire(p, "fire,cold");
    room.autoGolems(Date.now()); room.autoGolems(Date.now() + GOLEM.enterMs + 10);
    tough("cut", x + 10, y + 6);
    const log = spyHits(room);
    room.cast(id, "su_blades");
    await wait(1500);
    const cuts = log.filter((h) => h.a === id && h.t === "cut" && h.o.dot && h.o.el); // (burn ticks have no element)
    assert.ok(cuts.length >= 2, "the blades keep cutting");
    const els = new Set(cuts.map((h) => h.o.el));
    assert.deepEqual([...els].sort(), ["cold", "fire"], "two golems: the blades alternate their elements");
    assert.ok(cuts.some((h) => h.o.el === "fire" && h.o.burn), "fire blades burn");
    assert.ok(cuts.some((h) => h.o.el === "cold" && h.o.slowMs), "frost blades slow");
    // Void Edge rank 5: five blades instead of three, and they cut 5/3 as hard (on top of Edge's own bonus)
    const base = cuts[0].dmg;
    room.state.fields.forEach((_f: any, fid: string) => room.state.fields.delete(fid));
    p.talents.set("su_edge", 5);
    p.sk.last["su_blades"] = -1e12;
    log.length = 0;
    room.cast(id, "su_blades");
    await wait(600);
    let f: any;
    room.state.fields.forEach((v: any) => { if (v.skill === "su_blades") f = v; });
    assert.equal(f.inst.def.blades, 5);
    const more = log.find((h) => h.t === "cut" && h.o.dot && h.o.el)!;
    assert.ok(more.dmg > base * 1.5, `five blades cut harder (${base.toFixed(1)} -> ${more.dmg.toFixed(1)})`);
    await cs[0].leave();
  } finally {
    await srv.stop();
  }
});

test("staff bolt through the Void: longer reach, comes out of a portal next to the foe, the finisher bursts on the foes around", async () => {
  const { srv, room, cs, ps, x, y, tough } = await setup();
  try {
    const id = cs[0].sessionId, p = ps[0];
    assert.equal(CLASSES.summoner.projectile!.range, 220, "reach 220 px (was 160)");
    p.ax = 1; p.ay = 0; p.dir = "right";
    const shots = () => [...room.state.projectiles.values()].filter((s: any) => s.owner === id);
    // No foe in reach: a plain bolt from the staff over the whole range
    room.state.projectiles.clear();
    p.attackReadyAt = 0; p.lastAttack = 0;
    room.playerAttack(id);
    let s: any = shots()[0];
    assert.ok(s && Math.abs(s.x - p.x) < 10 && s.range >= 220, "no foe: the bolt flies from the staff");
    // A foe 180 px away (beyond the old reach): the bolt comes out of a portal just short of it
    room.state.projectiles.clear();
    const sk = tough("portal", x + 180, y);
    p.attackReadyAt = 0; p.lastAttack = 0;
    room.playerAttack(id);
    s = shots()[0];
    assert.ok(s, "a bolt");
    assert.ok(Math.abs(s.x - (sk.x - PORTAL.exitGap)) < 3, `it comes out ${PORTAL.exitGap} px short of the foe (x ${Math.round(s.x)} vs ${Math.round(sk.x)})`);
    assert.equal(s.range, PORTAL.exitRange, "only the last stretch left to fly");
    await wait(400);
    assert.ok(sk.hp < 99999, "it lands");
    // The third hit of the combo bursts: a second foe right next to the first one is hurt too
    room.state.projectiles.clear();
    const by = tough("beside", sk.x + 4, sk.y + 18);
    const log = spyHits(room);
    p.combo = 0; p.lastAttack = 0; p.attackReadyAt = 0;
    for (let i = 0; i < 3; i++) { p.attackReadyAt = Date.now(); room.playerAttack(id); await wait(i < 2 ? 20 : 500); }
    assert.equal(p.combo, 2, "the finisher went off");
    assert.ok(log.some((h) => h.t === "beside" && h.o.basic), "the finisher's burst hurt the foe beside");
    assert.ok(by.hp < 99999);
    await cs[0].leave();
  } finally {
    await srv.stop();
  }
});
