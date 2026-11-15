import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, until, wait } from "./helpers/room";
import { BOARDS } from "../shared/bounty";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { CARAVAN, caravanLand, caravanLines, caravanRoute, caravansOnRoad, caravanTripMs, routePos, type CaravanLine, type CaravanRoute } from "../shared/war/caravans";
import { newWar, targetsOf } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { writDay, writPay, WRIT, type WritKind, type WritState } from "../shared/war/writs";
import { _resetWar, warState } from "../server/war";
import { _resetCaravans, caravanOutcome } from "../server/warCaravans";

const freshWar = () => _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });

/** A line of the opening war with a road, and a rival clan that may push into every land along it. */
const PICK = (() => {
  const s = newWar();
  for (const line of caravanLines(s.owner)) {
    const r = caravanRoute(line.a, line.b);
    if (!r || caravanTripMs(r) < 20_000) continue;
    const lands = new Set<number>();
    for (let d = 0; d <= r.len; d += 16) { const q = routePos(r, d); lands.add(caravanLand(line, q.x, q.y).id); }
    const rival = CLAN_KEYS.find((k) => k !== line.clan && [...lands].every((t) => targetsOf(s, k).includes(t)) && targetsOf(s, k).includes(line.b));
    if (rival) return { line, r, rival, s };
  }
  throw new Error("no caravan line with a rival that can raid all of it");
})();
const { line: LINE, r: ROAD, rival: RIVAL } = PICK;
/** Another running line (wrong-line checks). */
const OTHER = caravanLines(PICK.s.owner).find((l) => !(l.a === LINE.a && l.b === LINE.b))!;

const roadWrit = (kind: WritKind, clan: ClanKey, line: CaravanLine, t = line.b): WritState => ({
  kind, t, land: TERRITORIES[t].name, goal: 1, clan, holder: line.clan, minLevel: 0, gold: 1, renown: 1, n: 0,
  road: { a: line.a, b: line.b, from: TERRITORIES[line.a].name, to: TERRITORIES[line.b].name },
});

const saved = { ...CARAVAN };
function restore() { Object.assign(CARAVAN, saved); _resetCaravans(); }
async function cartOnRoad(r: CaravanRoute, leftMs = 8000) {
  CARAVAN.everyMs = Math.ceil(caravanTripMs(r));
  for (;;) {
    const c = caravansOnRoad(r, Date.now())[0];
    if (c && caravanTripMs(r) - (Date.now() - c.dep) >= leftMs) return c;
    await wait(200);
  }
}

async function setup(srv: Awaited<ReturnType<typeof startRoom>>) {
  const c = await srv.join({ cls: "wizard" });
  const got: any[] = [];
  c.onMessage("writ", (m: any) => got.push(m));
  await wait(150);
  const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
  p.level = 30; p.hp = p.maxHp = 1_000_000; p.invulnUntil = 0; p.clan = undefined; p.renown = 0;
  const valor: [number, string, number][] = [];
  const add = room.writs.h.addValor;
  room.writs.h.addValor = (t: number, k: string, v: number) => { valor.push([t, k, v]); return add(t, k, v); };
  const wild = () => room.state.mobs.forEach((m: any, mid: string) => { if (m.kind !== "trooper") room.state.mobs.delete(mid); });
  return { c, room, id, p, got, valor, wild };
}

test("caravan writs (room): an escort writ completes when the hero delivers a cart of its line; another line's writ does not", async () => {
  const srv = await startRoom();
  freshWar(); _resetCaravans();
  try {
    const { c, room, id, p, got, valor, wild } = await setup(srv);
    CARAVAN.speed = ROAD.len / 4; // a four-second trip
    CARAVAN.everyMs = Math.ceil(caravanTripMs(ROAD));
    const seen = new Set<string>();
    const follow = async (stop: () => boolean, ms: number) => {
      for (const end = Date.now() + ms; Date.now() < end && !stop(); ) {
        const cart = caravansOnRoad(ROAD, Date.now())[0];
        if (cart) { const q = routePos(ROAD, cart.d); p.x = q.x; p.y = q.y; seen.add(cart.id); }
        room.caravans.tick(Date.now()); wild();
        await wait(100);
      }
      return seen;
    };
    p.clan = LINE.clan;
    // a writ for another line of the clan rides along on a delivery: nothing
    const otherClanLine = caravanLines(warState()!.owner).find((l) => l.clan === LINE.clan && !(l.a === LINE.a && l.b === LINE.b));
    const wrong = roadWrit("escort", LINE.clan, otherClanLine ?? { a: LINE.b, b: LINE.a, clan: LINE.clan });
    p.writ = wrong;
    await follow(() => [...seen].some((i) => caravanOutcome(i) === "delivered"), 15_000);
    assert.ok([...seen].some((i) => caravanOutcome(i) === "delivered"), "a delivery happened");
    assert.deepEqual(p.writ, { ...wrong, n: 0 }, "another line's escort writ does not count");
    // the right writ: the next delivery completes it
    p.writ = roadWrit("escort", LINE.clan, LINE);
    const gold0 = p.gold, pay = writPay(warState()!, LINE.clan, LINE.b);
    await follow(() => !p.writ, 15_000);
    assert.equal(p.writ, undefined, "done on delivery");
    assert.equal(p.gold - gold0, pay.gold, "the writ's gold");
    assert.equal(p.writN, 1); assert.equal(p.writDay, writDay(Date.now()));
    assert.deepEqual(valor.at(-1), [LINE.b, LINE.clan, WRIT.valor], "writ valor at the destination");
    assert.ok(await until(() => !!got.at(-1)?.done));
    assert.equal(got.at(-1).done.kind, "escort"); assert.equal(got.at(-1).left, WRIT.perDay - 1);
    await c.leave();
  } finally { restore(); await srv.stop(); }
});

test("caravan writs (room): a raid writ completes on the hero's killing blow on a cart of its line; the wrong clan or line counts nothing; the daily cap holds", async () => {
  const srv = await startRoom();
  freshWar(); _resetCaravans();
  try {
    const { c, room, id, p, got, valor, wild } = await setup(srv);
    const cur = await cartOnRoad(ROAD);
    const onCart = () => { const at = routePos(ROAD, caravansOnRoad(ROAD, Date.now()).find((x) => x.id === cur.id)?.d ?? 0); p.x = at.x; p.y = at.y; };
    p.clan = RIVAL; onCart();
    room.caravans.tick(Date.now());
    const lv = room.caravans._live(cur.id);
    assert.ok(lv, "the cart woke");
    wild();
    // the hook with the wrong line, clan or kind: nothing
    const raid = roadWrit("raid", RIVAL, LINE);
    p.writ = { ...raid };
    room.caravans.h.writ(id, "raid", OTHER);
    room.caravans.h.writ(id, "escort", LINE);
    room.caravans.h.writ(id, "raid", { ...LINE, clan: CLAN_KEYS.find((k) => k !== LINE.clan && k !== RIVAL)! });
    assert.deepEqual(p.writ, raid, "wrong line, kind or clan");
    const own = roadWrit("raid", LINE.clan, LINE); // a "raid" on one's own line never counts
    p.clan = LINE.clan; p.writ = { ...own };
    room.writs.caravan(id, "raid", LINE);
    assert.deepEqual(p.writ, own);
    const esc = roadWrit("escort", RIVAL, OTHER.clan === RIVAL ? OTHER : { ...OTHER, clan: RIVAL });
    p.clan = RIVAL; p.writ = { ...esc };
    room.writs.caravan(id, "escort", LINE);
    assert.deepEqual(p.writ, esc, "an escort writ is not done by another clan's delivery");
    // the last writ of the day: a raid writ of this line, the hero fells the cart
    p.writ = { ...raid };
    p.writDay = writDay(Date.now()); p.writN = WRIT.perDay - 1;
    const gold0 = p.gold, pay = writPay(warState()!, RIVAL, LINE.b);
    const cart = room.state.mobs.get(lv.cart);
    onCart();
    room.hitTarget(id, lv.cart, 100, [0, 0], {});
    assert.ok(p.writ, "a blow is not a raid");
    cart.hp = 1;
    onCart();
    room.hitTarget(id, lv.cart, 50, [0, 0], {});
    assert.ok(cart.dead); assert.equal(caravanOutcome(cur.id), "raided");
    assert.equal(p.writ, undefined, "raid writ done");
    assert.ok(p.gold - gold0 >= pay.gold, "the writ's gold (the cart's spilled gold is on the ground)");
    assert.ok(valor.some(([t, k, v]) => t === LINE.b && k === RIVAL && v === WRIT.valor), "writ valor in the named land");
    assert.equal(p.writN, WRIT.perDay);
    assert.ok(await until(() => !!got.at(-1)?.done));
    assert.equal(got.at(-1).done.kind, "raid"); assert.equal(got.at(-1).left, 0);
    // the cap: no offers at a board, and a take is refused
    p.x = BOARDS[0].x; p.y = BOARDS[0].y;
    room.writs.msg(id, { take: 0 }); await wait(100);
    assert.equal(p.writ, undefined, "the day's writs are done");
    assert.deepEqual(got.at(-1).offers, []); assert.equal(got.at(-1).left, 0); assert.ok(got.at(-1).err);
    await c.leave();
  } finally { restore(); await srv.stop(); }
});

test("caravan writs (room): a writ whose line stops running is withdrawn on join; save round trip keeps the road", async () => {
  const srv = await startRoom();
  freshWar(); _resetCaravans();
  try {
    const { c, room, id, p } = await setup(srv);
    p.clan = LINE.clan;
    p.writ = roadWrit("escort", LINE.clan, LINE);
    const save = structuredClone(room.snapshot(p));
    assert.deepEqual(save.writ, p.writ);
    p.writ = undefined;
    room.restore(p, structuredClone(save));
    assert.deepEqual(p.writ, roadWrit("escort", LINE.clan, LINE), "the road survives a save");
    room.writs.join(id);
    assert.ok(p.writ, "the line runs: kept");
    p.writ = roadWrit("escort", LINE.clan, { a: LINE.b, b: LINE.a, clan: LINE.clan }, LINE.b); // a reversed road never runs
    room.writs.join(id);
    assert.equal(p.writ, undefined, "withdrawn");
    await c.leave();
  } finally { restore(); await srv.stop(); }
});
