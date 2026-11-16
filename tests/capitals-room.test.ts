import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE } from "../shared/constants";
import { CITIES, CITY, cityAt, cityAtPx, cityNpcPx, cityText, cityTitle } from "../shared/capitals";
import { waygateById } from "../shared/act2";
import { portalById } from "../shared/portals";
import { pairOf, setWarPairs, _resetWarRelations, FEUD } from "../shared/war/feuds";
import { RENOWN_RANKS } from "../shared/war/renown";
import { respawnAt } from "../server/warCapitals";
import { desertSpawn } from "../shared/act2";
import { startRoom, until, wait } from "./helpers/room";

const W = CITIES.find((c) => c.clan === "wardens")!;
const at = (p: any, x: number, y: number) => { p.x = x; p.y = y; p.moving = false; };
/** In front of a city NPC (px). */
const before = (role: "leader" | "quartermaster" | "oathkeeper" | "trainer") => { const n = cityNpcPx(W, role); return { x: n.x, y: n.y + TILE * 0.8 }; };

test("room: the Wardens' city gate admits the right heroes, its waystone the same; the way out is always open", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join();
    const notes: string[] = [];
    c.onMessage("chat", (m: any) => { if (!m.id) notes.push(m.text); });
    await wait(300);
    const room = srv.room, pid = c.sessionId, p = room.state.players.get(pid), client = room.clients.getById(pid);
    const out = waygateById("citygate_wardens")!, inn = waygateById("cityexit_wardens")!;
    const tryGate = () => { at(p, out.x, out.y); p.gateNoteAt = 0; room.caps.noted.clear(); room.useWaygate(client); return !!cityAtPx(p.x, p.y); };
    // below Lv 5 the gate is barred
    p.level = 4;
    assert.equal(tryGate(), false, "Lv 4 stays outside");
    await until(() => notes.some((t) => /level 5/.test(t)));
    p.level = 5;
    assert.equal(tryGate(), true, "Lv 5, unsworn: in");
    assert.equal(cityAtPx(p.x, p.y), W);
    // out again through the city's own gate
    at(p, inn.x, inn.y); room.useWaygate(client);
    assert.equal(cityAtPx(p.x, p.y), undefined, "out through the city gate");
    assert.ok(Math.hypot(p.x - out.x, p.y - out.y) < 3 * TILE, "back beside the city gate at Goldenreach");
    // a hero sworn to a clan at war with the Wardens is refused, with a note; at peace, let in
    p.clan = "redfang"; p.clanAt = 1;
    setWarPairs([pairOf("redfang", "wardens")]);
    notes.length = 0;
    assert.equal(tryGate(), false, "at war: refused");
    await until(() => notes.some((t) => /gate stays shut/.test(t)));
    assert.ok(notes.some((t) => t.includes(cityText(W).name)));
    _resetWarRelations();
    assert.equal(tryGate(), true, "at peace: in");
    // Wanted by the Wardens: refused, even unsworn
    p.clan = undefined;
    p.feud = { wardens: { pts: FEUD.tiers[0], at: Date.now() } };
    assert.equal(tryGate(), false, "Wanted: refused");
    // the waystone: the same rule
    p.portals.add("farms"); p.portals.add("city_wardens");
    const farms = portalById("farms")!, ws = portalById("city_wardens")!;
    const travel = () => { at(p, farms.x, farms.y); room.travel(client, "city_wardens"); return Math.hypot(p.x - ws.x, p.y - ws.y) < 2 * TILE; };
    assert.equal(travel(), false, "Wanted: the waystone refuses too");
    p.feud = {};
    setWarPairs([pairOf("redfang", "wardens")]); p.clan = "redfang";
    assert.equal(travel(), false, "at war: the waystone refuses too");
    p.clan = "wardens";
    assert.equal(travel(), true, "own sworn: the waystone takes them");
    _resetWarRelations();
    // nobody is thrown out when the war changes, and the way out works for anyone
    p.clan = "redfang"; setWarPairs([pairOf("redfang", "wardens")]);
    at(p, inn.x, inn.y); room.useWaygate(client);
    assert.equal(cityAtPx(p.x, p.y), undefined, "an enemy inside can always leave");
    _resetWarRelations();
    await c.leave();
  } finally { _resetWarRelations(); await srv.stop(); }
});

test("room: oath at the altar, the leader's rewards once per rank, home bound and the respawn it gives, prices", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join();
    const city: any[] = [], clan: any[] = [], fx: any[] = [];
    c.onMessage("city", (m: any) => city.push(m));
    c.onMessage("clan", (m: any) => clan.push(m));
    c.onMessage("sfx", (m: any) => { if (String(m.ev).startsWith("city")) fx.push(m); });
    await wait(300);
    const room = srv.room, pid = c.sessionId, p = room.state.players.get(pid);
    const ask = (type: string, msg?: unknown) => { room.askBuckets.delete(pid); const n = city.length; c.send(type, msg as never); return until(() => city.length > n); };
    p.level = 10;
    // the altar: too far, then an unsworn hero swears to the Wardens there
    await ask("cityoath");
    assert.ok(city.at(-1).err, "too far from the altar");
    assert.equal(p.clan, undefined);
    const o = before("oathkeeper"); at(p, o.x, o.y);
    await ask("cityoath");
    assert.equal(p.clan, "wardens", "sworn at the altar");
    assert.ok(clan.some((m) => m.clan === "wardens"), "the clan reply went out");
    await until(() => fx.some((m) => m.ev === "cityoath" && m.id === pid));
    // sworn to another clan inside the last day: the altar refuses
    p.clan = "veiled"; p.clanAt = Date.now();
    await ask("cityoath");
    assert.equal(p.clan, "veiled", "the day's cooldown holds");
    assert.match(city.at(-1).err, /less than a day/);
    p.clan = "wardens";
    // home: garbage changes nothing, {on: true} at the hall binds it, {on: false} unbinds
    for (const bad of [null, 5, "x", { on: "yes" }, {}]) { room.askBuckets.delete(pid); c.send("cityhome", bad as never); }
    await wait(200);
    assert.equal(p.home, undefined, "garbage binds nothing");
    await ask("cityhome", { on: true });
    assert.equal(p.home, "wardens");
    assert.equal(city.at(-1).home, "wardens");
    // the leader: unpaid ranks pay once, the title at Banneret
    const l = before("leader"); at(p, l.x, l.y);
    p.renown = RENOWN_RANKS[2].at + 1; const g0 = p.gold;
    await ask("cityreward");
    assert.equal(p.gold - g0, CITY.rankGold[1] + CITY.rankGold[2], "Shieldbearer and Standard-bearer paid");
    assert.equal(p.capPaid, 2);
    await until(() => fx.some((m) => m.ev === "cityreward"));
    await ask("cityreward");
    assert.equal(p.gold - g0, CITY.rankGold[1] + CITY.rankGold[2], "asking again pays nothing");
    p.renown = RENOWN_RANKS[3].at;
    await ask("cityreward");
    assert.equal(p.gold - g0, CITY.rankGold[1] + CITY.rankGold[2] + CITY.rankGold[3]);
    assert.ok(p.titles & (1 << cityTitle(W)), "the Wardens' title at Banneret");
    p.clan = "veiled";
    await ask("cityreward");
    assert.ok(city.at(-1).err, "the leader rewards only the Wardens' sworn");
    p.clan = "wardens";
    // prices: the quartermaster and the trainer, 10% less for the sworn
    const q = before("quartermaster"); at(p, q.x, q.y);
    assert.equal(room.priceFor(p, 100), 90);
    p.clan = "veiled"; assert.equal(room.priceFor(p, 100), 100); p.clan = "wardens";
    const t = before("trainer"); at(p, t.x, t.y);
    p.level = 20; p.gold = 1000; p.lastHurt = 0; p.ptSta = 1;
    room.resetStats(pid);
    assert.equal(1000 - p.gold, Math.round(15 * 20 * 0.9), "the trainer's sworn price");
    // respawn: a death in Act 1 nearer the city gate than Oakvale wakes in the city; another land's never does
    p.invulnUntil = 0; p.hp = 1;
    at(p, (W.outer.x + 3) * TILE, (W.outer.y + 4) * TILE);
    room.damagePlayer(pid, 1e6, "Test", [0, 0], 0, {});
    assert.ok(p.dead);
    await until(() => !p.dead, 8000);
    assert.equal(cityAtPx(p.x, p.y), W, "woke in Hearthhold");
    const kel = desertSpawn();
    assert.equal(respawnAt(p, 150 * TILE, 400 * TILE, kel), kel, "a death in the Sunscar: its own town");
    const oak = { x: 80 * TILE, y: 60 * TILE };
    assert.equal(respawnAt(p, 82 * TILE, 62 * TILE, oak), oak, "nearer Oakvale: Oakvale");
    assert.equal(respawnAt(p, 60 * TILE, 250 * TILE, oak), oak, "underground: never");
    p.feud = { wardens: { pts: FEUD.tiers[0], at: Date.now() } };
    assert.equal(respawnAt(p, (W.outer.x + 1) * TILE, W.outer.y * TILE, oak), oak, "Wanted by the Wardens: not in their city");
    p.feud = {};
    // a new oath elsewhere unbinds the Wardens' city
    p.clanAt = 0;
    room.askBuckets.delete(pid); c.send("clan", { swear: "veiled" });
    await until(() => p.clan === "veiled");
    assert.equal(p.home, undefined, "home unbound with the old clan");
    assert.equal(respawnAt(p, (W.outer.x + 1) * TILE, W.outer.y * TILE, oak), oak);
    await ask("cityhome", { on: false });
    assert.equal(city.at(-1).home, "");
    await c.leave();
  } finally { await srv.stop(); }
});

test("room: home and capPaid are saved and restored, old and broken saves load with defaults; logging out in the city", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join();
    await wait(300);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    p.clan = "wardens"; p.clanAt = 1; p.home = "wardens"; p.capPaid = 3;
    const save = room.snapshot(p);
    assert.equal(save.home, "wardens"); assert.equal(save.capPaid, 3);
    p.home = undefined; p.capPaid = 0;
    room.restore(p, structuredClone(save));
    assert.equal(p.home, "wardens"); assert.equal(p.capPaid, 3);
    // an old save has neither field: no home, nothing paid; and writes neither back
    const old = structuredClone(save); delete old.home; delete old.capPaid;
    room.restore(p, old);
    assert.equal(p.home, undefined); assert.equal(p.capPaid, 0);
    const s2 = room.snapshot(p);
    assert.ok(!("home" in s2) && !("capPaid" in s2), "no new keys for a hero who never used a city");
    // broken values; a home whose clan the hero no longer serves
    room.restore(p, { ...structuredClone(save), home: "nowhere", capPaid: "lots" });
    assert.equal(p.home, undefined); assert.equal(p.capPaid, 0);
    room.restore(p, { ...structuredClone(save), clan: "veiled" });
    assert.equal(p.home, undefined, "a home in another clan's city is dropped on load");
    // logging out inside the city saves Act 1: the hero logs back in at Oakvale
    const g = waygateById("cityexit_wardens")!;
    at(p, g.x, g.y - 3 * TILE);
    assert.ok(cityAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE)));
    assert.equal(room.snapshot(p).act, 1);
    await c.leave();
  } finally { await srv.stop(); }
});

test("room: the other four capitals' gates let in and out, refuse their enemies, give their sworn the discount; logging out inside keeps the land", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join();
    await wait(300);
    const room = srv.room, pid = c.sessionId, p = room.state.players.get(pid), client = room.clients.getById(pid);
    p.level = 5;
    for (const C of CITIES.filter((o) => o.clan !== "wardens")) {
      const out = waygateById(`citygate_${C.clan}`)!, inn = waygateById(`cityexit_${C.clan}`)!;
      const tryGate = () => { at(p, out.x, out.y); p.gateNoteAt = 0; room.caps.noted.clear(); room.useWaygate(client); return cityAtPx(p.x, p.y); };
      p.clan = undefined; p.feud = {};
      assert.equal(tryGate(), C, `Lv 5, unsworn: into ${cityText(C).name}`);
      assert.equal(room.snapshot(p).act, C.act, "logging out inside saves the city's land");
      at(p, inn.x, inn.y); room.useWaygate(client);
      assert.equal(cityAtPx(p.x, p.y), undefined, "out through the city gate");
      assert.ok(Math.hypot(p.x - out.x, p.y - out.y) < 3 * TILE, "back beside the city gate in the land");
      const foe = C.clan === "redfang" ? "wardens" : "redfang";
      p.clan = foe; p.clanAt = 1; setWarPairs([pairOf(foe, C.clan)]);
      assert.equal(tryGate(), undefined, "a clan at war with the city stays outside");
      _resetWarRelations();
      assert.equal(tryGate(), C, "at peace: in");
      // the quartermaster: the city's sworn pay less, others the base price
      const q = cityNpcPx(C, "quartermaster"); at(p, q.x, q.y + TILE * 0.8);
      assert.equal(room.priceFor(p, 100), 100);
      p.clan = C.clan; assert.equal(room.priceFor(p, 100), 90);
    }
    await c.leave();
  } finally { _resetWarRelations(); await srv.stop(); }
});
