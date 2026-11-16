// The Reckoning in the room (Crown PR4, server/warCrown.ts WarCrown): pay waiting is paid on login once, heroes online
// at the result are paid at once, the crowned clan's boon on gold, and the Herald's notice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAN_KEYS } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { newWar } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { heroKey, keepOf, reckonReward } from "../shared/war/crown";
import { _resetWar, addValor, step, warCrownSave, warState } from "../server/war";
import { _startReckoning } from "../server/warCrown";
import { startRoom, wait } from "./helpers/room";

const KEEP = keepOf(TERRITORIES)!, CROWN_LAND = TERRITORIES.find((t) => t.region === "crown" && !t.reckoningOnly)!;
let seq = 0;
/** onJoin as an account through a fake client (test rooms skip onAuth), like tests/warbrakes-room.test.ts. */
function fakeJoin(room: any, name: string) {
  const sid = `reck${++seq}`, got: [string, any][] = [], client = { sessionId: sid, send: (t: string, m: unknown) => got.push([t, m]) };
  const byId = room.clients.getById;
  room.clients.getById = (id: string) => (id === sid ? client : byId.call(room.clients, id)); // (the room's own sends to this hero reach the fake client too)
  room.onJoin(client, { cls: "wizard" }, { name });
  return { sid, p: room.state.players.get(sid), got, done: () => { room.state.players.delete(sid); room.clients.getById = byId; } };
}
const paidLines = (got: [string, any][]) => got.filter(([t, m]) => t === "chat" && m.name === "Herald" && /^For your part in the Reckoning/.test(m.text));

test("reckoning (room): pay waiting is paid on login, once; heroes online at the result are paid at once; the crowned clan's gold boon", async () => {
  const { login, saveHero } = await import("../server/accounts");
  const { dropLive } = await import("../server/handoff");
  const srv = await startRoom();
  const state = newWar();
  _resetWar({ v: 1, state, minds: newMinds(), next: Date.now() + 1e12, log: [] });
  const holder = state.owner[KEEP.id], winner = CLAN_KEYS.find((k) => k !== holder)!;
  const name = `Reckoner${process.pid % 1000}`;
  try {
    await login(name, "testpass1", "127.0.0.1");
    const c = await srv.join({ cls: "wizard" });
    await wait(200);
    const room = srv.room, base = structuredClone(room.snapshot(room.state.players.get(c.sessionId)));
    // (the real client stays: an empty room disposes, and its Reckoning listener with it)
    saveHero(name, "wizard", { ...base, level: 45, clan: winner, clanAt: 1, gold: 0 });
    dropLive(name, "wizard");
    // 1. pay waiting from a Reckoning: paid on login, once
    warCrownSave()!.pay = { [heroKey(name, "wizard")]: { gold: 777, renown: 12, until: Date.now() + 1e9, won: true } };
    let j = fakeJoin(room, name);
    try {
      assert.equal(j.p.gold, 777); assert.equal(Math.round(j.p.renown), 12);
      assert.equal(paidLines(j.got).length, 1);
      assert.equal(warCrownSave()!.pay?.[heroKey(name, "wizard")], undefined);
    } finally { j.done(); }
    dropLive(name, "wizard");
    j = fakeJoin(room, name);
    try { assert.equal(paidLines(j.got).length, 0, "paid once only"); } finally { j.done(); }
    // 2. a Reckoning runs while the hero is online: they fight in the Crown, the window closes, they are paid there and then
    dropLive(name, "wizard");
    j = fakeJoin(room, name);
    try {
      const gold0 = j.p.gold, t0 = Date.now();
      _startReckoning(t0, 60_000);
      for (let i = 0; i < 20; i++) addValor(CROWN_LAND.id, winner, 10, heroKey(name, "wizard"));
      await step(t0 + 60_000);
      assert.equal(warState()!.owner[KEEP.id], winner, "the hero's clan took the Keep");
      assert.equal(j.p.gold, gold0 + reckonReward(true).gold);
      assert.equal(paidLines(j.got).length, 1);
      // 3. the boon: gold paid to a hero sworn to the crowned clan counts x1.1; another clan's hero gets the plain sum
      const g = j.p.gold;
      room.payHero(j.sid, 100);
      assert.equal(j.p.gold, g + 110);
      j.p.clan = holder;
      room.payHero(j.sid, 100);
      assert.equal(j.p.gold, g + 210);
    } finally { j.done(); }
    await c.leave();
  } finally { await srv.stop(); }
});
