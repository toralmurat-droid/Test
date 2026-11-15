import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, until, wait } from "./helpers/room";
import { TILE, WORLD_H } from "../shared/constants";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { CARAVAN, caravanGold, caravanHp, caravanLand, caravanLevel, caravanLines, caravanRoute, caravansOnRoad, caravanTripMs, routePos, type CaravanRoute } from "../shared/war/caravans";
import { newWar, targetsOf } from "../shared/war/rules";
import { parseTroop, WAR_TROOPS } from "../shared/war/troops";
import { _resetWar } from "../server/war";
import { _resetCaravans, caravanOutcome } from "../server/warCaravans";

const freshWar = () => _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });

/** A line of the opening war whose every land along the road one rival clan may push into (so a raid's valor counts wherever it falls). */
const PICK = (() => {
  const s = newWar();
  for (const line of caravanLines(s.owner)) {
    const r = caravanRoute(line.a, line.b);
    if (!r || caravanTripMs(r) < 20_000) continue;
    const lands = new Set<number>();
    for (let d = 0; d <= r.len; d += 16) { const q = routePos(r, d); lands.add(caravanLand(line, q.x, q.y).id); }
    const rival = CLAN_KEYS.find((k) => k !== line.clan && [...lands].every((t) => targetsOf(s, k).includes(t)));
    if (rival) return { line, r, rival };
  }
  throw new Error("no caravan line with a rival that can raid all of it");
})();
const { line: LINE, r: ROAD, rival: RIVAL } = PICK;

const saved = { ...CARAVAN }, savedTroops = WAR_TROOPS.maxTroops;
function restore() { Object.assign(CARAVAN, saved); WAR_TROOPS.maxTroops = savedTroops; _resetCaravans(); }
/** One cart always on the road (the next leaves as the last arrives), at least `leftMs` before it arrives. */
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
  await wait(150);
  const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
  p.level = 30; p.hp = p.maxHp = 1_000_000; p.invulnUntil = 0; p.clan = undefined; p.renown = 0;
  const sent: [string, any][] = [], bc = room.broadcast.bind(room);
  room.broadcast = (t: string, m: any, o?: any) => { sent.push([t, m]); return bc(t, m, o); };
  const onCart = (cid: string) => { const at = routePos(ROAD, caravansOnRoad(ROAD, Date.now()).find((x) => x.id === cid)?.d ?? 0); p.x = at.x; p.y = at.y; };
  const wild = () => room.state.mobs.forEach((m: any, mid: string) => { if (m.kind !== "trooper") room.state.mobs.delete(mid); });
  return { c, room, id, p, sent, onCart, wild };
}

test("caravans (room): a cart wakes near a hero with its escorts; only rival-sworn heroes hurt it; a raid pays gold, renown and the Herald, and the cart never rolls again", async () => {
  const srv = await startRoom();
  freshWar(); _resetCaravans();
  try {
    const { room, id, p, sent, onCart, wild } = await setup(srv);
    const cur = await cartOnRoad(ROAD);
    p.y = (WORLD_H + 20) * TILE; // underground: nothing wakes
    room.caravans.tick(Date.now());
    assert.equal(room.caravans._live(cur.id), undefined, "no hero near: the cart travels unseen");
    onCart(cur.id);
    room.caravans.tick(Date.now());
    const lv = room.caravans._live(cur.id);
    assert.ok(lv, "a hero near: it wakes");
    wild();
    const cid = lv.cart, cart = room.state.mobs.get(cid), level = caravanLevel(LINE.b);
    assert.equal(cart.kind, "trooper");
    assert.deepEqual(parseTroop(cart.weapon), { clan: LINE.clan, officer: false, cart: true });
    assert.equal(cart.maxHp, caravanHp(LINE.clan, level));
    const escorts = lv.escorts.map((e: string) => room.state.mobs.get(e));
    assert.equal(escorts.length, CARAVAN.escorts);
    assert.ok(escorts.every((e: any) => e && e.weapon === LINE.clan && Math.hypot(e.x - cart.x, e.y - cart.y) < 3 * TILE), "escorts in formation round it");
    // it rolls where the clock says
    await wait(600);
    const q = routePos(ROAD, caravansOnRoad(ROAD, Date.now()).find((x) => x.id === cur.id)!.d);
    assert.ok(Math.hypot(cart.x - q.x, cart.y - q.y) < 30, "on the road, on time");
    // allies and unsworn heroes can't touch it
    const hp0 = cart.hp, xp0 = p.xp;
    for (const clan of [undefined, LINE.clan]) {
      p.clan = clan; onCart(cur.id);
      room.hitTarget(id, cid, 500, [0, 0], { basic: true });
      room.hitTarget(id, cid, 500, [0, 0], { skill: true });
      assert.equal(cart.hp, hp0, `${clan ?? "unsworn"}: 0 damage`);
    }
    // a rival can; its escorts turn on him
    p.clan = RIVAL; onCart(cur.id);
    let gold0 = 0; room.state.items.forEach((it: any) => { if (it.kind === "gold") gold0++; });
    room.hitTarget(id, cid, 100, [0, 0], {});
    assert.ok(cart.hp < hp0, "a rival-sworn hero hurts it");
    assert.ok(lv.escorts.some((e: string) => room.state.mobs.get(e)?.target === id), "the escorts answer");
    cart.hp = 1;
    room.hitTarget(id, cid, 50, [0, 0], {});
    assert.ok(cart.dead, "raided");
    assert.equal(caravanOutcome(cur.id), "raided");
    let gold1 = 0; room.state.items.forEach((it: any) => { if (it.kind === "gold") gold1++; });
    const gold: any[] = []; room.state.items.forEach((it: any) => { if (it.kind === "gold" && Math.hypot(it.x - cart.x, it.y - cart.y) < 20) gold.push(it); });
    assert.equal(gold1, gold0 + 1, "one gold drop");
    assert.equal(gold.length, 1, "at the cart");
    assert.equal(gold[0].amount, caravanGold(level));
    assert.equal(p.renown, CARAVAN.raidRenown, "renown for the raider (the war counted his valor)");
    assert.equal(p.xp, xp0, "no XP");
    assert.ok(sent.some(([t, m]) => t === "sfx" && m.ev === "caravan_raided" && m.by === RIVAL && m.from === LINE.clan));
    assert.ok(sent.some(([t, m]) => t === "chat" && m.name === "Herald" && /raided/.test(m.text)));
    // gone for good: the escorts march off, and the cart does not come back when a hero returns
    CARAVAN.scatterMs = 100; CARAVAN.sleepMs = 100;
    await wait(250);
    room.caravans.tick(Date.now());
    assert.equal(room.caravans._live(cur.id), undefined);
    assert.ok(lv.escorts.every((e: string) => !e || !room.state.mobs.has(e)), "escorts gone");
    onCart(cur.id);
    room.caravans.tick(Date.now());
    assert.equal(room.caravans._live(cur.id), undefined, "a raided cart never respawns");
  } finally { restore(); await srv.stop(); }
});

test("caravans (room): asleep and awake again it keeps its wounds and its fallen escorts; the caps hold", async () => {
  const srv = await startRoom();
  freshWar(); _resetCaravans();
  try {
    const { room, id, p, onCart, wild } = await setup(srv);
    const cur = await cartOnRoad(ROAD, 12_000);
    WAR_TROOPS.maxTroops = CARAVAN.escorts; // not room for a cart and its escorts
    onCart(cur.id);
    room.caravans.tick(Date.now());
    assert.equal(room.caravans._live(cur.id), undefined, "the troop budget is full");
    WAR_TROOPS.maxTroops = savedTroops; CARAVAN.maxLive = 0;
    room.caravans.tick(Date.now());
    assert.equal(room.caravans.carts, 0, "maxLive");
    CARAVAN.maxLive = saved.maxLive;
    room.caravans.tick(Date.now());
    const lv = room.caravans._live(cur.id);
    assert.ok(lv);
    wild();
    room.warTroops.tick(Date.now());
    assert.ok(room.caravans.count + room.warTroops.count <= WAR_TROOPS.maxTroops, "caravans share the troop budget");
    assert.ok(room.caravans.carts <= CARAVAN.maxLive);
    // wound the cart, fell an escort
    p.clan = RIVAL; onCart(cur.id);
    const cart = room.state.mobs.get(lv.cart);
    room.hitTarget(id, lv.cart, 300, [0, 0], {});
    const hp = cart.hp, eid = lv.escorts[1], e = room.state.mobs.get(eid);
    e.hp = 1; room.hitTarget(id, eid, 50, [0, 0], {});
    assert.ok(e.dead);
    assert.ok(hp < cart.maxHp);
    // nobody near for sleepMs: back to the road unseen
    CARAVAN.sleepMs = 200;
    p.y = (WORLD_H + 20) * TILE;
    await wait(350);
    room.caravans.tick(Date.now());
    assert.equal(room.caravans._live(cur.id), undefined, "asleep");
    assert.ok(!room.state.mobs.has(lv.cart), "its monsters are gone");
    onCart(cur.id);
    room.caravans.tick(Date.now());
    const again = room.caravans._live(cur.id);
    assert.ok(again, "awake again");
    assert.equal(room.state.mobs.get(again.cart).hp, hp, "the same wounds");
    assert.equal(again.escorts.filter((x: string) => x && room.state.mobs.has(x)).length, CARAVAN.escorts - 1, "the fallen escort stays fallen");
  } finally { restore(); await srv.stop(); }
});

test("caravans (room): delivered with a sworn escort hero of its clan for most of the trip: valor and renown; with no escort: nothing", async () => {
  const srv = await startRoom();
  freshWar(); _resetCaravans();
  try {
    const { room, p, sent, wild } = await setup(srv);
    CARAVAN.speed = ROAD.len / 4; // a four-second trip
    CARAVAN.everyMs = Math.ceil(caravanTripMs(ROAD));
    const follow = async (until: () => boolean, ms: number) => {
      const seen = new Set<string>();
      for (const end = Date.now() + ms; Date.now() < end && !until(); ) {
        const c = caravansOnRoad(ROAD, Date.now())[0];
        if (c) { const q = routePos(ROAD, c.d); p.x = q.x; p.y = q.y; seen.add(c.id); }
        room.caravans.tick(Date.now()); wild();
        await wait(100);
      }
      return seen;
    };
    p.clan = LINE.clan as ClanKey;
    const ids = await follow(() => [...sent].some(([t, m]) => t === "sfx" && m.ev === "caravan_delivered"), 15_000);
    assert.ok([...ids].some((i) => caravanOutcome(i) === "delivered"), "delivered");
    assert.equal(p.renown, CARAVAN.escortRenown, "renown for the escort");
    const d = sent.find(([t, m]) => t === "sfx" && m.ev === "caravan_delivered")![1];
    assert.equal(d.clan, LINE.clan); assert.equal(d.t, LINE.b);
    // unsworn: the carts arrive, nothing happens
    p.clan = undefined; sent.length = 0;
    const before = new Set(ids);
    const ids2 = await follow(() => false, 10_000);
    const fresh = [...ids2].filter((i) => !before.has(i) && caravanOutcome(i));
    assert.ok(fresh.length >= 1, "a cart arrived meanwhile");
    assert.ok(fresh.every((i) => caravanOutcome(i) === "lost"), "no hero escort: not delivered");
    assert.equal(p.renown, CARAVAN.escortRenown);
    assert.ok(!sent.some(([t, m]) => t === "sfx" && m.ev === "caravan_delivered"));
  } finally { restore(); await srv.stop(); }
});
