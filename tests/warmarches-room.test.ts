import { LEADERS } from "../shared/war/heralds";
import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, until, wait } from "./helpers/room";
import { TILE, WORLD_H } from "../shared/constants";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { atWar } from "../shared/war/feuds";
import { COLUMN, columnPos, columnTrip, marchMult, type ColumnsMsg, type March } from "../shared/war/marches";
import { warPath, type RoadEntry } from "../shared/war/roads";
import { newWar, targetsOf, WAR, type Orders } from "../shared/war/rules";
import { parseTroop, troopWeapon, WAR_TROOPS } from "../shared/war/troops";
import { TERRITORIES } from "../shared/war/territories";
import { _marchMults, _resetWar, _setWarOrders, _valorOf, columnHalting, columnJoined, columnLost, marchCol, warMarches } from "../server/war";

/** A clan, a target and its orders whose column walks a real road long enough to watch (the opening war). */
const PICK = (() => {
  const s = newWar();
  for (const k of CLAN_KEYS) for (const t of targetsOf(s, k)) {
    const from = TERRITORIES[t].near.find((n) => s.owner[n] === k);
    if (from === undefined) continue;
    const p = warPath(from, t);
    if (p?.kind === "road" && columnTrip(p).moveMs > 60_000) return { k, t, foe: s.owner[t], orders: { [k]: { defend: 0.5, attack: [{ t, share: 1 }] } } as Partial<Record<ClanKey, Orders>> };
  }
  throw new Error("no column on a long road");
})();

const savedCol = { ...COLUMN }, savedTroops = { ...WAR_TROOPS };
function restore() { Object.assign(COLUMN, savedCol); Object.assign(WAR_TROOPS, savedTroops); _setWarOrders(undefined); }

/** A war whose last tick was `ago` ms after its columns left: the column is `ago` ms into its march. */
function warMarching(ago = 15_000): March {
  const next = Date.now() + WAR.tickMs - COLUMN.musterMs - ago;
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next, log: [] });
  _setWarOrders(PICK.orders);
  const m = warMarches().find((x) => x.clan === PICK.k && x.to === PICK.t);
  assert.ok(m, "the column marches");
  return m!;
}

async function setup(srv: Awaited<ReturnType<typeof startRoom>>) {
  const c = await srv.join({ cls: "wizard" });
  await wait(150);
  const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
  p.level = 30; p.hp = p.maxHp = 1_000_000; p.invulnUntil = 0; p.clan = undefined; p.renown = 0;
  const sent: [string, any][] = [], bc = room.broadcast.bind(room);
  room.broadcast = (t: string, msg: any, o?: any) => { sent.push([t, msg]); return bc(t, msg, o); };
  const told: string[] = [], tell = room.marches.h.tell;
  room.marches.h.tell = (pid: string, text: string) => { if (pid === id) told.push(text); return tell(pid, text); };
  const hsend = room.marches.h.send; // "columns" goes to each hero (filtered): seen here like a broadcast
  room.marches.h.send = (pid: string, t: string, msg: any) => { if (pid === id) sent.push([t, msg]); return hsend(pid, t, msg); };
  const wild = () => room.state.mobs.forEach((m: any, mid: string) => { if (m.kind !== "trooper" || !room.marches.owns(mid)) room.state.mobs.delete(mid); });
  return { c, room, id, p, sent, told, wild };
}
const at = (m: March, now = Date.now()) => columnPos(warPath(m.from, m.to)!, m.dep, now, marchCol(m.id).halt);

test("columns (room): a column wakes near a hero, officer first, in its clan's colours; only heroes its clan fights hurt it; a fallen soldier counts against the attack", async () => {
  const srv = await startRoom();
  try {
    const m = warMarching();
    const { room, id, p, sent, wild } = await setup(srv);
    room.marches.tick(Date.now()); // (builds the road)
    p.y = (WORLD_H + 20) * TILE; // underground: nothing wakes
    room.marches.tick(Date.now());
    assert.equal(room.marches._live(m.id), undefined, "no hero near: it marches unseen");
    const q = at(m); p.x = q.x; p.y = q.y;
    room.marches.tick(Date.now());
    const lv = room.marches._live(m.id);
    assert.ok(lv, "a hero near: it wakes");
    wild();
    assert.equal(lv.men.filter(Boolean).length, m.size, "every man");
    const men = lv.men.map((x: string) => room.state.mobs.get(x));
    men.forEach((x: any, i: number) => { assert.equal(x.kind, "trooper"); assert.equal(x.weapon, troopWeapon(PICK.k, i === 0)); assert.equal(parseTroop(x.weapon)!.officer, i === 0); });
    assert.ok(men.every((x: any) => Math.hypot(x.x - q.x, x.y - q.y) < 5 * TILE), "in formation round the anchor");
    assert.ok(sent.some(([t, msg]) => t === "sfx" && msg.ev === "column_march" && msg.clan === PICK.k), "drums");
    // allies and unsworn heroes can't touch it
    const s1 = men[1], hp0 = s1.hp, xp0 = p.xp;
    for (const clan of [undefined, PICK.k]) {
      p.clan = clan; p.x = s1.x; p.y = s1.y;
      room.hitTarget(id, lv.men[1], 500, [0, 0], { basic: true });
      assert.equal(s1.hp, hp0, `${clan ?? "unsworn"}: 0 damage`);
    }
    // a hero of a clan at war with it can; the column turns on them and halts
    assert.ok(atWar(PICK.k, PICK.foe));
    p.clan = PICK.foe;
    room.hitTarget(id, lv.men[1], 50, [0, 0], {});
    assert.ok(s1.hp < hp0, "an enemy hurts it");
    assert.ok(lv.men.some((x: string) => room.state.mobs.get(x)?.target === id), "they answer");
    room.marches.tick(Date.now()); await wait(1100); room.marches.tick(Date.now());
    assert.ok(marchCol(m.id).halt > 0, "a fight with heroes halts the column");
    s1.hp = 1;
    room.hitTarget(id, lv.men[1], 50, [0, 0], {});
    assert.ok(s1.dead, "felled");
    assert.equal(p.xp, xp0, "no XP");
    assert.equal(marchCol(m.id).fallen, 1, "one man fewer reaches the target");
    assert.deepEqual(_marchMults(), [{ t: m.to, k: m.clan, mult: marchMult(m.size - 1, m.size) }], "the next tick's attack is cut by it");
    assert.ok(await until(() => sent.some(([t, msg]) => t === "columns" && msg.cols.some((r: any) => r[0] === m.id && r[6] === 1))), "the clients hear of the loss");
    // asleep and awake again: the fallen stay fallen
    COLUMN.sleepMs = 50;
    p.y = (WORLD_H + 20) * TILE;
    await wait(120);
    room.marches.tick(Date.now());
    assert.equal(room.marches._live(m.id), undefined, "asleep");
    const q2 = at(m); p.x = q2.x; p.y = q2.y; p.clan = undefined;
    room.marches.tick(Date.now());
    assert.equal(room.marches._live(m.id).men.filter(Boolean).length, m.size - 1, "the fallen do not come back");
  } finally { restore(); await srv.stop(); }
});

test("columns (room): a sworn hero who marches beside it for most of the trip joins it on arrival, once a war tick", async () => {
  const srv = await startRoom();
  try {
    const m = warMarching(0);
    const { room, p, told } = await setup(srv);
    COLUMN.live = false; // (no troopers: the march, the joins and the arrival still run)
    p.clan = PICK.k;
    const path = warPath(m.from, m.to)!, end = m.dep + columnTrip(path).moveMs;
    room.marches.tick(m.dep);
    for (let now = m.dep; now <= end + 4000; now += 2000) { const q = columnPos(path, m.dep, now); p.x = q.x; p.y = q.y; room.marches.tick(now); }
    assert.equal(p.renown, COLUMN.joinRenown, "renown on arrival");
    assert.equal(_valorOf(m.to, m.clan), COLUMN.joinValor, "valor for the clan in the target land");
    assert.ok(told.some((x) => /marched with/.test(x)), "the Herald tells them");
    room.marches.tick(end + 6000);
    assert.equal(p.renown, COLUMN.joinRenown, "paid once");
    assert.equal(columnJoined(m.id, p.name), false, "one join per hero per war tick");
  } finally { restore(); await srv.stop(); }
});

test("columns (room): a hero who strays off falls short of the join", async () => {
  const srv = await startRoom();
  try {
    const m = warMarching(0);
    const { room, p } = await setup(srv);
    COLUMN.live = false; p.clan = PICK.k;
    const path = warPath(m.from, m.to)!, end = m.dep + columnTrip(path).moveMs;
    for (let now = m.dep; now <= end + 4000; now += 2000) { const q = columnPos(path, m.dep, now); p.x = q.x; p.y = q.y + (now < m.dep + (end - m.dep) * 0.6 ? 20 * TILE : 0); room.marches.tick(now); }
    assert.equal(p.renown, 0, "beside it for less than half the trip");
  } finally { restore(); await srv.stop(); }
});

test("columns (room): the room's trooper cap holds; the officer spawns first and the rest march on virtually", async () => {
  const srv = await startRoom();
  try {
    const m = warMarching();
    const { room, p, wild } = await setup(srv);
    room.marches.tick(Date.now());
    WAR_TROOPS.maxTroops = 3;
    const q = at(m); p.x = q.x; p.y = q.y;
    room.marches.tick(Date.now());
    const lv = room.marches._live(m.id);
    assert.ok(lv);
    wild();
    assert.ok(lv.men[0], "the officer first");
    assert.ok(room.marches.count <= 3, `${room.marches.count} column troopers`);
    room.warTroops.tick(Date.now());
    let troopers = 0; room.state.mobs.forEach((x: any) => { if (x.kind === "trooper" && !x.dead) troopers++; });
    assert.ok(troopers <= WAR_TROOPS.maxTroops, `${troopers} troopers in the room`);
    // with the real cap: every man, and the room still within it
    Object.assign(WAR_TROOPS, savedTroops);
    COLUMN.sleepMs = 0; p.y = (WORLD_H + 20) * TILE; await wait(20); room.marches.tick(Date.now());
    COLUMN.sleepMs = savedCol.sleepMs; const q2 = at(m); p.x = q2.x; p.y = q2.y;
    room.marches.tick(Date.now()); room.warTroops.tick(Date.now());
    troopers = 0; room.state.mobs.forEach((x: any) => { if (x.kind === "trooper" && !x.dead) troopers++; });
    assert.equal(room.marches.count, m.size);
    assert.ok(troopers <= WAR_TROOPS.maxTroops);
  } finally { restore(); await srv.stop(); }
});

test("columns (room): \"warroads\" and \"columns\" come with the join", async () => {
  const m = warMarching();
  const { TownRoom } = await import("../server/TownRoom");
  const proto = TownRoom.prototype as any, onJoin = proto.onJoin, sent: [string, unknown][] = [];
  proto.onJoin = function (client: any, ...rest: unknown[]) { // the joiner comes back sworn to the marching clan (as from a save)
    const send = client.send.bind(client), stats = this.applyStats;
    client.send = (t: string, msg: unknown) => { sent.push([t, msg]); return send(t, msg); };
    this.applyStats = (p: any, ...a: unknown[]) => { p.level = 20; p.clan = PICK.k; return stats.call(this, p, ...a); };
    try { return onJoin.call(this, client, ...rest); } finally { this.applyStats = stats; }
  };
  const srv = await startRoom();
  try {
    await srv.join({ cls: "wizard" });
    await wait(200);
    const roads = sent.find(([t]) => t === "warroads")?.[1] as RoadEntry[], cols = sent.find(([t]) => t === "columns")?.[1] as ColumnsMsg;
    assert.ok(Array.isArray(roads), "warroads");
    roads.forEach((e) => { assert.ok(TERRITORIES[e[0]].near.includes(e[1]) && e[0] < e[1]); assert.ok(e[2].every(Number.isInteger)); });
    assert.ok(cols && Array.isArray(cols.cols), "columns");
    const row = cols.cols.find((r) => r[0] === m.id)!;
    assert.deepEqual(row.slice(0, 8), [m.id, CLAN_KEYS.indexOf(m.clan), m.from, m.to, m.dep, m.size, 0, 0]);
    assert.ok([1, 2, 5].includes(row[8]));
    assert.ok(typeof cols.now === "number" && Math.abs(cols.now - Date.now()) < 5000, "the server's clock");
  } finally { proto.onJoin = onJoin; restore(); await srv.stop(); }
});

test("columns (room): the Herald announces a tick's columns once (a sack's news between ticks does not repeat it); sworn heroes hear of theirs", async () => {
  const srv = await startRoom();
  try {
    const m = warMarching();
    const { room, id, p, sent, told } = await setup(srv);
    p.clan = PICK.foe;
    room.marches.onWar(); room.marches.onWar();
    const lines = sent.filter(([t, msg]) => t === "chat" && msg.name === "Herald" && /^Columns march/.test(msg.text));
    assert.equal(lines.length, 1, "once");
    assert.ok(sent.some(([t, msg]) => t === "chat" && msg.name === LEADERS[m.clan].name), "the leader of the marching clan speaks");
    assert.ok(lines[0][1].text.includes(TERRITORIES[m.to].name));
    assert.ok(told.some((x) => x.includes(TERRITORIES[m.to].name) && /your clan's land/.test(x)), "the holder's sworn hear a column comes");
    assert.equal(sent.filter(([t]) => t === "columns").length >= 2, true, "the columns each time");
    assert.ok(id);
  } finally { restore(); await srv.stop(); }
});

test("columns (room): a fight with an enemy hero halts the column, at most COLUMN.haltMaxMs a trip, and the halt ends when the fight does", async () => {
  const srv = await startRoom();
  try {
    const m = warMarching();
    const { room, id, p, sent, wild } = await setup(srv);
    room.marches.tick(Date.now());
    p.clan = PICK.foe;
    const q = at(m); p.x = q.x; p.y = q.y;
    const t0 = Date.now();
    room.marches.tick(t0);
    const lv = room.marches._live(m.id);
    assert.ok(lv); wild();
    const engage = () => lv.men.forEach((x: string) => { const mob = room.state.mobs.get(x); if (mob) mob.target = id; });
    engage(); room.marches.tick(t0 + 1000);
    assert.ok(marchCol(m.id).halt > 0 && columnHalting(m.id, t0 + 1000), "halted");
    assert.ok(sent.some(([t, msg]) => t === "columns" && msg.cols.some((r: any) => r[0] === m.id && r[8] === 2)), "the clients see it stand");
    const stood = at(m, t0 + 1000);
    for (let t = t0 + 3000; t <= t0 + COLUMN.haltMaxMs + 30_000; t += 2000) { engage(); room.marches.tick(t); }
    assert.equal(marchCol(m.id).halt, COLUMN.haltMaxMs, "capped for the trip");
    // the fight ends: the halt ends, and the column marches on
    const tEnd = t0 + COLUMN.haltMaxMs + 40_000;
    lv.men.forEach((x: string) => { const mob = room.state.mobs.get(x); if (mob) mob.target = ""; });
    room.marches.tick(tEnd);
    assert.ok(!columnHalting(m.id, tEnd), "no longer halted");
    assert.ok(sent.filter(([t]) => t === "columns").at(-1)![1].cols.some((r: any) => r[0] === m.id && r[8] !== 2), "the clients hear it march on");
    assert.ok(stood);
  } finally { restore(); await srv.stop(); }
});

test("columns (room): losses in another room bring this room's men down to those still alive", async () => {
  const srv = await startRoom();
  try {
    const m = warMarching();
    const { room, p, wild } = await setup(srv);
    room.marches.tick(Date.now());
    const q = at(m); p.x = q.x; p.y = q.y;
    room.marches.tick(Date.now());
    const lv = room.marches._live(m.id);
    assert.ok(lv); wild();
    assert.equal(lv.men.filter(Boolean).length, m.size);
    columnLost(m.id, 2); // (two soldiers fell where another room has the same column)
    room.marches.tick(Date.now());
    assert.equal(lv.men.filter(Boolean).length, m.size - 2, "the extra men go");
    assert.equal(room.marches.count, m.size - 2);
    assert.ok(lv.men[0], "the officer stays");
  } finally { restore(); await srv.stop(); }
});
