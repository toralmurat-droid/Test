import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE } from "../shared/constants";
import { CITIES, CITY, cityAtPx, cityGates, cityText, cityTile, plotBox, stripBox, type City } from "../shared/capitals";
import { portalById } from "../shared/portals";
import { randomSpawn } from "../shared/map";
import { pairOf, setWarPairs, _resetWarRelations, FEUD } from "../shared/war/feuds";
import { gateRefusal } from "../server/cityGates";
import { startRoom, until, wait } from "./helpers/room";

/**
 * The walk-in gates of the cities in their lands in the room (settlement network step 5, server/cityGates.ts), for each
 * city with a site: heroes walk in and out of every gate, the untried, the clan's enemies and the Wanted are put back
 * outside with the gate-shut line, a blink over the walls is refused like a walk, a waystone from outside is no way round,
 * and a hero remembered in the old band plot by a deploy's hand-off comes back at the same spot in the city.
 */
const W = CITIES.find((c) => c.clan === "wardens")!;
/** Per city: a clan at war with it, a stone outside to travel from, and a blink from outside a wall (local tiles of its plot: from, to). */
const ROWS: { clan: City["clan"]; foe: "redfang" | "wardens"; stone: string; blink: [[number, number], [number, number]] }[] = [
  { clan: "wardens", foe: "redfang", stone: "huntcamp", blink: [[-1.5, 15.5], [3.5, 15.5]] },
  { clan: "veiled", foe: "redfang", stone: "mirage", blink: [[10.5, 40.5], [10.5, 36.5]] },
  { clan: "host", foe: "redfang", stone: "cairnwatch", blink: [[10.5, 40.5], [10.5, 36.5]] },
  { clan: "redfang", foe: "wardens", stone: "rustwater", blink: [[10.5, 40.5], [10.5, 36.5]] },
];
const px = (t: { x: number; y: number }) => ({ x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE });
const at = (p: any, x: number, y: number) => { p.x = x; p.y = y; p.moving = false; };
const still = { up: false, down: false, left: false, right: false };
const dirs = { south: { ...still, up: true }, west: { ...still, right: true }, east: { ...still, left: true } } as const;
const outward = { south: { ...still, down: true }, west: { ...still, left: true }, east: { ...still, right: true } } as const;

test("cities in their lands: the room table covers every city with a site", () => {
  assert.deepEqual(ROWS.map((r) => r.clan), CITIES.filter((c) => c.site).map((c) => c.clan));
});

test("gate ward: the level comes first, then the war and the Wanted mark (shared/capitals.ts cityAdmits)", () => {
  const hero = (o: object) => ({ level: 5, clan: undefined, feud: {}, ...o }) as never;
  assert.equal(gateRefusal(hero({ level: 4 }), W), "level");
  assert.equal(gateRefusal(hero({}), W), "ok");
  assert.equal(gateRefusal(hero({ feud: { wardens: { pts: FEUD.tiers[0], at: Date.now() } } }), W), "wanted");
  assert.equal(gateRefusal(hero({ level: 4, feud: { wardens: { pts: FEUD.tiers[0], at: Date.now() } } }), W), "level");
  setWarPairs([pairOf("redfang", "wardens")]);
  try { assert.equal(gateRefusal(hero({ clan: "redfang" }), W), "war"); assert.equal(gateRefusal(hero({ clan: "wardens" }), W), "ok"); } finally { _resetWarRelations(); }
});

for (const R of ROWS) {
  const C = CITIES.find((c) => c.clan === R.clan)!, foe = R.foe;

  test(`room: heroes walk in and out of ${cityText(C).name}'s gates; the untried, its enemies and the Wanted are put back outside`, async () => {
    const srv = await startRoom();
    try {
      const c = await srv.join();
      const notes: string[] = [], snaps: any[] = [];
      c.onMessage("chat", (m: any) => { if (!m.id) notes.push(m.text); });
      c.onMessage("travel", (m: any) => { if (m.why === "gate") snaps.push(m); });
      await wait(300);
      const room = srv.room, pid = c.sessionId, p = room.state.players.get(pid);
      const fresh = () => { p.dead = false; p.hp = p.maxHp; p.lastHurt = 0; room.caps.noted.clear(); };
      /** Walks from outside the gate towards the city for up to `ms`; true once inside. */
      const walkIn = async (g: ReturnType<typeof cityGates>[number], ms = 3000) => {
        fresh(); p.input = { ...still }; const o = px(g.out); at(p, o.x, o.y);
        await wait(150); // (the ward sees the hero outside)
        p.input = { ...dirs[g.side] };
        const inside = await until(() => cityAtPx(p.x, p.y) === C && !g.tiles.some((t) => Math.floor(p.x / TILE) === t.x && Math.floor(p.y / TILE) === t.y), ms);
        p.input = { ...still }; await wait(100);
        return inside;
      };
      const walkOut = async (g: ReturnType<typeof cityGates>[number]) => {
        fresh(); p.input = { ...still };
        const t = g.tiles[1], inner = g.side === "south" ? { x: t.x, y: t.y - 2 } : g.side === "west" ? { x: t.x + 2, y: t.y } : { x: t.x - 2, y: t.y };
        const i = px(inner); at(p, i.x, i.y); await wait(150);
        p.input = { ...outward[g.side] };
        const out = await until(() => cityAtPx(p.x, p.y) === undefined && Math.hypot(p.x - px(g.out).x, p.y - px(g.out).y) < 2 * TILE, 4000);
        p.input = { ...still }; await wait(100);
        return out;
      };
      p.level = 5;
      for (const g of cityGates(C)) {
        assert.ok(await walkIn(g), `${g.side}: a Lv 5 hero walks in`);
        assert.ok(await walkOut(g), `${g.side}: and out again`);
      }
      // below Lv 5: every gate puts them back, with the level line
      p.level = 4; notes.length = 0; snaps.length = 0;
      for (const g of cityGates(C)) {
        assert.equal(await walkIn(g, 1200), false, `${g.side}: Lv 4 stays outside`);
        assert.equal(cityAtPx(p.x, p.y), undefined);
        assert.ok(Math.hypot(p.x - px(g.out).x, p.y - px(g.out).y) < 1.5 * TILE, `${g.side}: back where they stood`);
      }
      assert.ok(await until(() => notes.some((t) => t.includes(`level ${CITY.minLevel}`))), "the level line");
      assert.ok(snaps.length >= cityGates(C).length && snaps.every((m) => m.id === pid), "the clients snap the hero back");
      // at war with the city's clan: refused with the war line; at peace: in
      p.level = 30; p.clan = foe; p.clanAt = 1; notes.length = 0;
      setWarPairs([pairOf(foe, C.clan)]);
      const S = cityGates(C)[0];
      assert.equal(await walkIn(S, 1200), false, "at war: refused");
      assert.ok(await until(() => notes.some((t) => /gate stays shut/.test(t) && t.includes(cityText(C).name))), "the war line");
      _resetWarRelations();
      assert.ok(await walkIn(S), "at peace: in");
      // nobody inside is thrown out when a war starts
      setWarPairs([pairOf(foe, C.clan)]);
      await wait(300);
      assert.equal(cityAtPx(p.x, p.y), C, "a war does not throw anyone out");
      assert.ok(await walkOut(S), "and the way out is open to an enemy");
      _resetWarRelations();
      // Wanted by the city's clan: refused even unsworn
      p.clan = undefined; p.feud = { [C.clan]: { pts: FEUD.tiers[0], at: Date.now() } }; notes.length = 0;
      assert.equal(await walkIn(cityGates(C).at(-1)!, 1200), false, "Wanted: refused");
      assert.ok(await until(() => notes.some((t) => /want your blood/.test(t))));
      p.feud = {};
      await c.leave();
    } finally { _resetWarRelations(); await srv.stop(); }
  });

  test(`room: a blink over ${cityText(C).name}'s wall is refused like a walk; a waystone from outside is no way round the gate`, async () => {
    const srv = await startRoom();
    try {
      const c = await srv.join();
      await wait(300);
      const room = srv.room, pid = c.sessionId, p = room.state.players.get(pid), client = room.clients.getById(pid);
      const B = plotBox(C), [[fx, fy], [tx, ty]] = R.blink;
      // a blink (any jump the server makes: dash, roll, blink) from beside a wall to inside it
      p.level = 4; p.input = { ...still };
      const outside = { x: (B.x + fx) * TILE, y: (B.y + fy) * TILE }, inside = { x: (B.x + tx) * TILE, y: (B.y + ty) * TILE };
      assert.equal(cityAtPx(outside.x, outside.y), undefined); assert.equal(cityAtPx(inside.x, inside.y), C);
      at(p, outside.x, outside.y); room.gateWard.tick();
      at(p, inside.x, inside.y); room.gateWard.tick();
      assert.deepEqual([p.x, p.y], [outside.x, outside.y], "Lv 4: back where they jumped from");
      p.level = 5;
      at(p, inside.x, inside.y); room.gateWard.tick();
      assert.equal(cityAtPx(p.x, p.y), C, "Lv 5: a jump in is a way in like the gate");
      // the waystone, travelled to from a stone outside (Hunter's Camp's is three tiles off Hearthhold's west wall)
      const from = portalById(R.stone)!, ws = portalById(`city_${C.clan}`)!;
      p.portals.add(R.stone); p.portals.add(`city_${C.clan}`);
      const travel = async () => { at(p, from.x, from.y); p.lastHurt = 0; room.caps.noted.clear(); await wait(150); room.travel(client, `city_${C.clan}`); await wait(250); return cityAtPx(p.x, p.y) === C; };
      assert.ok(await travel(), "Lv 5: the waystone takes them, and the ward lets them stay");
      assert.ok(Math.hypot(p.x - ws.x, p.y - ws.y) < 3 * TILE);
      // a hero who woke the stone and lost a level since: the waystone keeps the gate's level rule, from any stone
      p.level = 4; assert.equal(await travel(), false, "Lv 4: the waystone refuses");
      p.level = 5; p.clan = foe; p.clanAt = 1; setWarPairs([pairOf(foe, C.clan)]);
      assert.equal(await travel(), false, "at war: the waystone refuses");
      _resetWarRelations(); p.clan = undefined;
      await c.leave();
    } finally { _resetWarRelations(); await srv.stop(); }
  });

  test(`room: a deploy's hand-off from ${cityText(C).name}'s old band plot resumes at the same spot in the city; old saves load; logging out inside saves its land`, async () => {
    const srv = await startRoom();
    try {
      const c = await srv.join();
      await wait(300);
      const room = srv.room, p = room.state.players.get(c.sessionId), o = stripBox(C.plot), B = plotBox(C);
      const live = (x: number, y: number) => ({ x, y, dir: "down", hp: p.maxHp, mana: 0, energy: 0, group: [] });
      room.resume(p, live((o.x + 25.5) * TILE, (o.y + 33.5) * TILE));
      assert.deepEqual([p.x, p.y], [(B.x + 25.5) * TILE, (B.y + 33.5) * TILE], "the gate square, where it stands now");
      assert.equal(cityAtPx(p.x, p.y), C);
      const was = [p.x, p.y];
      room.resume(p, live((o.x + 0.5) * TILE, (o.y + 10.5) * TILE));
      assert.deepEqual([p.x, p.y], was, "a spot on the wall: not moved");
      const sq = randomSpawn();
      room.resume(p, live(sq.x, sq.y));
      assert.deepEqual([p.x, p.y], [sq.x, sq.y], "anywhere else: as remembered");
      // a save from before the move (home in the clan's city, ranks paid) loads as it was
      p.clan = C.clan; p.clanAt = 1; p.home = C.clan; p.capPaid = 2;
      const save = room.snapshot(p);
      p.home = undefined; p.capPaid = 0;
      room.restore(p, structuredClone(save));
      assert.equal(p.home, C.clan); assert.equal(p.capPaid, 2);
      const g = cityTile(C, { x: 25, y: 33 });
      p.x = (g.x + 0.5) * TILE; p.y = (g.y + 0.5) * TILE;
      assert.equal(room.snapshot(p).act, C.act, "logging out inside: back in the land's town");
      await c.leave();
    } finally { await srv.stop(); }
  });
}
