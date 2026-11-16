// Capturable towns in the room (W6, server/warTowns.ts): the gate guard stands only while contested, outside the town;
// the claim is refused with a guard owed, a defender at the gate, for the unsworn, the low-level, the holder's own and a
// third clan; junk is rejected; the 12 s banner flips the town; the shop discount goes only to the holder's sworn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, until, wait } from "./helpers/room";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { newWar } from "../shared/war/rules";
import { isSafeZone } from "../shared/map";
import { noMobsAt } from "../shared/spawns";
import { npcById } from "../shared/npcs";
import { SHOPS } from "../shared/shops";
import { gatePx, onTownGround, TOWN, townById, townPatron } from "../shared/war/towns";
import { _resetWar, _setTown, _valorOf, townClaim, warState, warTowns } from "../server/war";
import { pairOf, setWarPairs } from "../shared/war/feuds";
import { _resetTowns } from "../server/warTowns";

const TOWN_ = townById("saltmere")!, GATE = gatePx(TOWN_), P = townPatron("saltmere");

async function setup(srv: Awaited<ReturnType<typeof startRoom>>, contested = true) {
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] }); _resetTowns();
  const st = warState()!, own = st.owner[P], foe = CLAN_KEYS.find((k) => k !== own)!, third = CLAN_KEYS.find((k) => k !== own && k !== foe)!;
  if (contested) { st.owner[P] = foe; _setTown("saltmere", { k: own, c: { by: foe, until: st.tick + 3, ext: 0 } }); }
  const c = await srv.join({ cls: "wizard" });
  await wait(150);
  const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
  p.level = 30; p.hp = p.maxHp = 1_000_000; p.invulnUntil = Date.now() + 1e9; p.clan = foe; p.renown = 0; p.lastAct = Date.now(); p.lastHurt = 0;
  p.x = GATE.x; p.y = GATE.y;
  const tick: (now: number) => void = room.towns.tick.bind(room.towns);
  room.towns.tick = () => {}; room.warTroops.tick = () => {}; // the test drives the gate; no patrols in the way
  room.state.mobs.forEach((m: any, mid: string) => room.state.mobs.delete(mid));
  const got: any[] = [];
  c.onMessage("townclaim", (m: any) => got.push(m));
  const guards = (): any[] => room.towns._guards("saltmere").map((g: string) => room.state.mobs.get(g)).filter((m: any) => m && !m.dead);
  const rout = (now = Date.now()) => { for (const m of guards()) { m.dead = true; m.hp = 0; } tick(now); };
  return { c, room, id, p, tick, got, guards, rout, own: own as ClanKey, foe: foe as ClanKey, third: third as ClanKey };
}

test("towns (room): no contest, no gate guard", async () => {
  const srv = await startRoom();
  try {
    const s = await setup(srv, false);
    s.tick(Date.now());
    assert.equal(s.guards().length, 0);
    await s.c.leave();
  } finally { await srv.stop(); }
});

test("towns (room): the gate guard stands only while contested, at the muster outside the town, and only near a hero", async () => {
  const srv = await startRoom();
  try {
    const s = await setup(srv);
    s.p.x = GATE.x + 80 * 32; s.tick(Date.now());
    assert.equal(s.guards().length, 0, "no hero near: no guard");
    s.p.x = GATE.x; s.tick(Date.now());
    const g = s.guards();
    assert.equal(g.length, TOWN.guards + TOWN.captain, "a captain and four soldiers");
    for (const m of g) {
      assert.equal(m.kind, "trooper"); assert.ok(m.weapon.startsWith(s.own), "the old holder's men");
      assert.ok(!isSafeZone(m.x, m.y) && !noMobsAt(m.x, m.y) && !onTownGround(m.x, m.y), "never on town ground");
    }
    assert.equal(s.room.towns.count, g.length);
    // the land goes back: the contest is over and the guard goes
    warState()!.owner[P] = s.own; _setTown("saltmere", { k: s.own }); s.tick(Date.now());
    assert.equal(s.guards().length, 0);
    await s.c.leave();
  } finally { await srv.stop(); }
});

test("towns (room): the claim is refused with the guard owed, a defender at the gate, or for the wrong hero; junk is rejected", async () => {
  const srv = await startRoom();
  try {
    const s = await setup(srv), { room, id, p, c } = s;
    s.tick(Date.now());
    assert.match(room.towns.claim(id, { id: "saltmere" }), /guard/);
    s.rout();
    assert.equal(s.guards().length, 0);
    for (const bad of [undefined, null, 5, "x", {}, { id: 3 }, { id: "oakvale" }, { id: "x".repeat(40) }]) assert.notEqual(room.towns.claim(id, bad), "", JSON.stringify(bad));
    c.send("townclaim", { id: { nested: true } }); c.send("townclaim", null);
    await wait(150);
    assert.equal(room.towns.raises.size, 0, "junk starts nothing");
    p.x = GATE.x + 3 * 32; assert.match(room.towns.claim(id, { id: "saltmere" }), /gate muster/); p.x = GATE.x;
    p.clan = undefined; assert.match(room.towns.claim(id, { id: "saltmere" }), /Swear/);
    p.clan = s.own; assert.match(room.towns.claim(id, { id: "saltmere" }), /own clan/);
    p.clan = s.third; assert.match(room.towns.claim(id, { id: "saltmere" }), /Only heroes sworn/);
    p.clan = s.foe; p.level = 4; assert.match(room.towns.claim(id, { id: "saltmere" }), /level 5/); p.level = 30;
    const d = await srv.join({ cls: "wizard" });
    await wait(150);
    const q = room.state.players.get(d.sessionId);
    q.level = 30; q.invulnUntil = Date.now() + 1e9; q.clan = s.own; q.lastAct = Date.now(); q.x = GATE.x + 3 * 32; q.y = GATE.y;
    assert.match(room.towns.claim(id, { id: "saltmere" }), /holds the gate/, "an active defender keeps the banner down");
    q.lastAct = 0;
    assert.equal(room.towns.claim(id, { id: "saltmere" }), "", "an idle one does not");
    await d.leave(); await c.leave();
  } finally { await srv.stop(); }
});

test("towns (room): the banner takes 12 s, a defender pauses it; the town flips at once, valor and renown; guards stay down this tick", async () => {
  const srv = await startRoom();
  try {
    const s = await setup(srv), { room, id, p } = s;
    const t0 = Date.now();
    s.tick(t0); s.rout(t0);
    s.tick(t0); assert.equal(s.guards().length, 0, "felled guards stay down until the next war tick");
    assert.equal(room.towns.claim(id, { id: "saltmere" }, t0), "");
    for (let i = 1; i <= 6; i++) s.tick(t0 + i * 1000);
    const r = [...room.towns.raises.values()][0];
    assert.ok(Math.abs(r.progress - 0.5) < 1e-6, `half way after 6 s (${r.progress})`);
    const d = await srv.join({ cls: "wizard" });
    await wait(150);
    const q = room.state.players.get(d.sessionId);
    q.level = 30; q.invulnUntil = Date.now() + 1e9; q.clan = s.own; q.lastAct = t0 + 6500; q.x = GATE.x + 2 * 32; q.y = GATE.y;
    s.tick(t0 + 7000); s.tick(t0 + 8000);
    assert.ok(r.paused && Math.abs(r.progress - 0.5) < 1e-6, "paused while a defender stands in the reach");
    q.x = GATE.x + 40 * 32;
    let took = 0;
    for (let i = 9; i < 30 && room.towns.raises.size; i++) { s.tick(t0 + i * 1000); took = i; }
    assert.equal(took - 8, TOWN.raiseMs / 2000, "the other 6 s once the defender left");
    assert.deepEqual(warTowns().saltmere, { k: s.foe }, "the town flipped at once");
    assert.equal(_valorOf(P, s.foe), TOWN.claimValor);
    assert.equal(p.renown, TOWN.claimRenown);
    assert.ok(await until(() => s.got.some((m) => m.state === "done")));
    await d.leave(); await s.c.leave();
  } finally { await srv.stop(); }
});

test("towns (room): the holder's sworn pay 10% less at the town's trader, everyone else the plain price", async () => {
  const srv = await startRoom();
  try {
    const s = await setup(srv, false), { room, p, c } = s;
    const n = npcById("saltarmourer")!, e = SHOPS.saltarmourer.stock[0];
    p.x = n.x; p.y = n.y + 10; p.level = 30;
    const buy = (clan: ClanKey | undefined) => { p.clan = clan; p.gold = 100_000; room.shopBuy(c, 0); return 100_000 - p.gold; };
    assert.equal(buy(s.own), Math.round(e.price * 0.9), "holder's sworn: 10% off");
    assert.equal(buy(s.foe), e.price, "an enemy pays the plain price");
    assert.equal(buy(undefined), e.price, "unsworn: plain price");
    // Oakvale's traders (not a capturable town): plain price for everyone
    const b = npcById("weaponsmith")!;
    p.x = b.x; p.y = b.y + 10; p.clan = s.own; p.gold = 100_000; room.shopBuy(c, 0);
    assert.equal(100_000 - p.gold, SHOPS.weaponsmith.stock[0].price);
    await c.leave();
  } finally { await srv.stop(); }
});

test("towns (room): a hero who falls mid-raise is told it stopped; the gate is free for the next hero", async () => {
  const srv = await startRoom();
  try {
    const s = await setup(srv), { room, id, p } = s;
    const t0 = Date.now();
    s.tick(t0); s.rout(t0);
    assert.equal(room.towns.claim(id, { id: "saltmere" }, t0), "");
    s.tick(t0 + 1000);
    p.invulnUntil = 0; p.hp = 1;
    room.damagePlayer(id, 1e9, "Test", [0, 0]);
    assert.ok(p.dead, "the raiser fell");
    assert.equal(room.towns.raises.size, 0);
    assert.ok(await until(() => s.got.some((m) => m.id === "saltmere" && m.state === "stop")), "the raiser's client hears the banner stopped");
    const d = await srv.join({ cls: "wizard" });
    await wait(150);
    const q = room.state.players.get(d.sessionId);
    q.level = 30; q.invulnUntil = Date.now() + 1e9; q.clan = s.foe; q.lastAct = Date.now(); q.x = GATE.x; q.y = GATE.y;
    assert.equal(room.towns.claim(d.sessionId, { id: "saltmere" }, t0 + 2000), "", "the next hero may raise it");
    await d.leave(); await s.c.leave();
  } finally { await srv.stop(); }
});

test("towns (room): one raise per town for every room; the raiser leaving frees it", async () => {
  const srv = await startRoom();
  try {
    const s = await setup(srv), { room, id } = s;
    const t0 = Date.now();
    s.tick(t0); s.rout(t0);
    assert.equal(room.towns.claim(id, { id: "saltmere" }, t0), "");
    const Other = room.towns.constructor as any, other = new Other(room.towns.h, room.warTroops); // a second room of the same process
    const d = await srv.join({ cls: "wizard" });
    await wait(150);
    const q = room.state.players.get(d.sessionId);
    q.level = 30; q.invulnUntil = Date.now() + 1e9; q.clan = s.foe; q.lastAct = Date.now(); q.x = GATE.x; q.y = GATE.y;
    assert.match(other.why(d.sessionId, "saltmere", t0), /Another hero/, "another room's raise holds the town");
    // the raiser leaves: the town is free for the other room
    room.towns.forget(id);
    assert.doesNotMatch(other.why(d.sessionId, "saltmere", t0), /Another hero/);
    await d.leave(); await s.c.leave();
  } finally { await srv.stop(); }
});

test("towns (room): a guard drops a target past its leash or on town ground; nobody hurts a guard from town ground or below level 12", async () => {
  const srv = await startRoom();
  try {
    const s = await setup(srv), { room, id, p } = s;
    s.tick(Date.now());
    const [gid] = room.towns._guards("saltmere"), m = room.state.mobs.get(gid), gd = room.towns.guards.get(gid);
    setWarPairs([pairOf(s.own, s.foe)]);
    const fight = (x: number, y: number) => { p.x = x; p.y = y; m.target = id; room.warTroops.fight(m, gid, gd, gd.g, 0.05, Date.now()); return m.target; };
    assert.equal(fight(GATE.x + 32, GATE.y), id, "an enemy at the gate is fought");
    assert.equal(fight(GATE.x + TOWN.leashPx + 64, GATE.y), "", "past the leash: dropped");
    const st = TOWN_.steward;
    assert.equal(fight((st.x + 0.5) * 32, (st.y + 0.5) * 32), "", "on town ground: dropped");
    assert.equal(room.canHurtMob(id, m), false, "and from town ground the hero cannot hurt it");
    p.x = GATE.x + 32; p.y = GATE.y;
    assert.equal(room.canHurtMob(id, m), true, "outside, an enemy can");
    p.level = TOWN.minFoeLevel - 1;
    assert.equal(room.canHurtMob(id, m), false, "below minFoeLevel: no");
    assert.equal(fight(GATE.x + 32, GATE.y), "", "and the guard leaves them alone");
    await s.c.leave();
  } finally { await srv.stop(); }
});

test("towns (room): a claim in another room mid-tick sends this room's gate guard home", async () => {
  const srv = await startRoom();
  try {
    const s = await setup(srv);
    s.tick(Date.now());
    assert.equal(s.guards().length, TOWN.guards + TOWN.captain);
    assert.ok(townClaim("saltmere", s.foe, "Elsewhere"), "another room's hero raised the banner");
    s.tick(Date.now());
    assert.equal(s.guards().length, 0, "the contest is over: the guard goes");
    assert.equal(s.room.towns.count, 0);
    await s.c.leave();
  } finally { await srv.stop(); }
});
