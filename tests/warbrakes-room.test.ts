// The war's brakes in the room: the Rally told to the weakest clan's sworn on login, the writ board's Rally flag, and the
// Night Raiders going for the hunted clan's soldiers first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { huntedClan, landOf, newWar, rallyClan, WAR, type WarState } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { troopWeapon } from "../shared/war/troops";
import { BOARDS } from "../shared/bounty";
import { TILE } from "../shared/constants";
import { _resetWar } from "../server/war";
import { startRoom, wait } from "./helpers/room";

const freshWar = (state: WarState = newWar()) => { _resetWar({ v: 1, state, minds: newMinds(), next: Date.now() + 1e9, log: [] }); return state; };
/**
 * A war where the Hide-Kin have lost land to the Wardens until the war rallies for them (the opening map is too even
 * for a Rally since the badlands joined: 11/11/10/10/10).
 */
function rallyWar(): WarState {
  const s = newWar();
  for (const t of TERRITORIES) { if (rallyClan(s)) break; if (s.owner[t.id] === "hidekin" && !t.capitalOf) s.owner[t.id] = "wardens"; }
  return s;
}
let seq = 0;
/** onJoin as an account through a fake client (test rooms skip onAuth), like tests/moors.test.ts; collects what it is sent. */
function fakeJoin(room: any, name: string) {
  const sid = `brake${++seq}`, got: [string, any][] = [];
  room.onJoin({ sessionId: sid, send: (t: string, m: unknown) => got.push([t, m]) }, { cls: "wizard" }, { name });
  return { p: room.state.players.get(sid), got, done: () => room.state.players.delete(sid) };
}

test("Rally (room): a hero sworn to the weakest clan hears it on login, others do not", async () => {
  const { login, saveHero } = await import("../server/accounts");
  const { dropLive } = await import("../server/handoff");
  const srv = await startRoom();
  const state = freshWar(rallyWar()), r = rallyClan(state)!;
  assert.ok(r, "rallyWar() gives a Rally");
  const other = CLAN_KEYS.find((k) => k !== r)!;
  const name = `Rallier${process.pid % 1000}`;
  try {
    await login(name, "testpass1", "127.0.0.1");
    const c = await srv.join({ cls: "wizard" });
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    p.level = 20;
    const base = structuredClone(room.snapshot(p));
    await c.leave();
    const rallyChat = (got: [string, any][]) => got.filter(([t, m]) => t === "chat" && m.name === "Herald" && /^Rally!/.test(m.text));
    for (const [clan, hears] of [[r, true], [other, false]] as [ClanKey, boolean][]) {
      saveHero(name, "wizard", { ...base, clan, clanAt: 1 });
      dropLive(name, "wizard");
      const j = fakeJoin(room, name);
      try {
        assert.equal(j.p.clan, clan);
        assert.equal(rallyChat(j.got).length, hears ? 1 : 0, `${clan}: ${hears ? "told" : "not told"}`);
      } finally { j.done(); }
    }
  } finally { await srv.stop(); }
});

test("Rally (room): the writ view carries rally for the rallied clan's sworn at a board", async () => {
  const srv = await startRoom();
  const state = freshWar(rallyWar()), r = rallyClan(state)!;
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(200);
    const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
    p.level = 20; p.x = BOARDS[0].x; p.y = BOARDS[0].y;
    p.clan = r;
    assert.equal(room.writs.view(id).rally, true);
    p.clan = CLAN_KEYS.find((k) => k !== r);
    assert.equal(room.writs.view(id).rally, undefined);
    p.clan = undefined;
    assert.equal(room.writs.view(id).rally, undefined, "unsworn: no flag");
    await c.leave();
  } finally { await srv.stop(); }
});

test("Night Raiders (room): a rider goes for the hunted clan's soldier before another clan's at the same distance", async () => {
  const srv = await startRoom();
  // Redfang over leaderShare: the Raiders' prey
  // (shares of the fought land: the heartland havens count for nobody and never change hands, rules.ts landOf)
  const s = newWar(), want = Math.floor(TERRITORIES.filter((t) => !t.haven).length * WAR.leaderShare) + 1;
  for (const t of TERRITORIES) { if (landOf(s, "redfang") >= want) break; if (s.owner[t.id] !== "redfang" && !t.capitalOf && !t.haven) s.owner[t.id] = "redfang"; }
  assert.equal(huntedClan(s), "redfang");
  freshWar(s);
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(200);
    const room = srv.room;
    const land = TERRITORIES.find((t) => t.act === 1 && !t.capitalOf && !t.haven)!;
    let rid: string | undefined;
    for (let i = 0; i < 20 && !rid; i++) rid = room.raidArrive(1, Date.now(), undefined, { x: land.cx * TILE, y: land.cy * TILE });
    assert.ok(rid, "a rider came");
    const m = room.state.mobs.get(rid);
    for (const [id, o] of room.state.mobs.entries()) if (id !== rid && Math.hypot(o.x - m.x, o.y - m.y) < 200) { o.dead = true; } // nothing else near
    const put = (id: string, clan: ClanKey, dx: number) => { room.spawnMob("trooper", -1, id, { x: m.x + dx, y: m.y, level: 10 }); room.state.mobs.get(id).weapon = troopWeapon(clan); };
    put("tw", "wardens", -10); put("tr", "redfang", 10);
    room.state.players.forEach((p: any) => { p.x = m.x + 4000; p.y = m.y; }); // heroes far away
    m.target = ""; m.foe = ""; m.hate = 0; m.hateId = "";
    room.raiderPrey(m, rid, Date.now());
    assert.equal(m.foe, "tr", "the hunted clan's soldier first");
    // with nobody hunted the nearer one wins (here: the Wardens soldier, a touch closer)
    freshWar(newWar());
    room.state.mobs.get("tw").x = m.x - 8;
    m.foe = ""; room.raiderPrey(m, rid, Date.now());
    assert.equal(m.foe, "tw", "no hunt: just the nearest");
    await c.leave();
  } finally { await srv.stop(); }
});
