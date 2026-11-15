// Act 3 made playable: Cairnwatch (the moors' outpost: safe square, monster-free walls, portal stone, board, traders),
// the moors' monsters (every per-kind table), their zones (levels 20-35, own density) and the moors' bounty board.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actOfTile, BEAST, BEAST_BROOD, BEAST_MOVES, BOSS, ELITE, FACTION, MOBS, MOORS_KINDS, MOORS_LEVEL, type MobKind, TILE,
} from "../shared/constants";
import { LOOT } from "../shared/items";
import { GEAR_DROP } from "../shared/gear";
import { MOB_COMBAT } from "../shared/combat";
import { MOB_AFFINITY } from "../shared/elements";
import { NIGHT_BOSSES } from "../shared/daynight";
import { RAIDER_SPARES } from "../shared/raiders";
import { familyOf } from "../shared/devour";
import { AREAS, isSafeZone, isSolidAt, PORTAL_SPOTS } from "../shared/map";
import { CAIRN_SQUARE, CAIRNWATCH, MR } from "../shared/moors";
import { DENSITY, noMobsAt, randomPointInZone, SPAWN_ZONES, zoneAt } from "../shared/spawns";
import { BOARDS, bountyOffers, huntable } from "../shared/bounty";
import { PORTALS } from "../shared/portals";
import { NPCS, TALK_RANGE } from "../shared/npcs";
import { SHOPS } from "../shared/shops";
import { moorsSpawn, actAt } from "../shared/act2";
import { startRoom, until, wait } from "./helpers/room";

const moorsZones = SPAWN_ZONES.filter((z) => actOfTile(z.x, z.y) === 3);
/** Cairnwatch's walls in map tiles, with the 2-tile margin NO_MOB_AREAS keeps. */
const fort = { x0: CAIRNWATCH.x - 2, y0: MR(CAIRNWATCH.y) - 2, x1: CAIRNWATCH.x + CAIRNWATCH.w + 2, y1: MR(CAIRNWATCH.y) + CAIRNWATCH.h + 2 };
const inFort = (px: number, py: number) => { const tx = px / TILE, ty = py / TILE; return tx >= fort.x0 && tx < fort.x1 && ty >= fort.y0 && ty < fort.y1; };

test("moors monsters: an entry in every per-kind table, undead keep the night, bosses tagged", () => {
  assert.equal(MOORS_KINDS.length, 7);
  for (const k of MOORS_KINDS) {
    assert.ok(MOBS[k] && LOOT[k] && GEAR_DROP[k] && MOB_COMBAT[k], `${k}: MOBS, LOOT, GEAR_DROP, MOB_COMBAT`);
    assert.ok(MOB_AFFINITY[k], `${k}: an elemental affinity`);
    assert.ok(MOBS[k].xp > 0 && LOOT[k].gold[1] > 0 && GEAR_DROP[k].chance > 0, `${k}: pays out`);
    const t = GEAR_DROP[k].tiers;
    assert.ok(Math.abs(t[0] + t[1] + t[2] - 1) < 1e-9, `${k}: gear tiers add up`);
    for (const m of BEAST_MOVES[k] ?? []) assert.ok(BEAST[m], `${k}: move ${m} exists`);
    for (const c of BEAST_BROOD[k] ?? []) assert.ok(MOORS_KINDS.includes(c), `${k} calls ${c}, a moors monster`);
    // the Host's dead: undead (no flesh for the vampire, spared by the Night Raiders); the bog hag is a living witch
    if (k === "boghag") { assert.equal(FACTION[k], undefined); assert.equal(familyOf(k), "outlaw"); }
    else { assert.equal(FACTION[k], "undead", k); assert.equal(familyOf(k), undefined, k); assert.ok(RAIDER_SPARES.includes(k), k); }
  }
  assert.ok(ELITE.cairnlord && !BOSS.cairnlord && ELITE.barrowking && BOSS.barrowking);
  assert.ok(NIGHT_BOSSES.includes("cairnlord") && NIGHT_BOSSES.includes("barrowking"), "the dead's bosses walk only at night");
  // every moors kind lives somewhere in the moors
  const living = new Set(moorsZones.flatMap((z) => Object.keys(z.mobs)));
  for (const k of MOORS_KINDS) assert.ok(living.has(k), `${k} has a zone`);
});

test("moors zones: 8+ zones and a wild one, levels 20-33 (specials to 35), climbing away from Cairnwatch", () => {
  assert.ok(moorsZones.length >= 10, `${moorsZones.length} zones`);
  assert.equal(moorsZones.filter((z) => z.wild).length, 1, "one broad wild zone");
  const cx = CAIRNWATCH.x + CAIRNWATCH.w / 2, cy = MR(CAIRNWATCH.y + CAIRNWATCH.h / 2);
  for (const z of moorsZones) {
    const kinds = Object.keys(z.mobs) as MobKind[];
    assert.ok(kinds.every((k) => MOORS_KINDS.includes(k)), `${z.name}: only moors monsters`);
    const special = kinds.every((k) => ELITE[k]);
    assert.ok(z.levels[0] >= MOORS_LEVEL.min && z.levels[1] <= (special ? MOORS_LEVEL.special : MOORS_LEVEL.mob), `${z.name}: ${z.levels}`);
    assert.ok(z.levels[0] <= z.levels[1]);
    assert.ok(AREAS.some((a) => a.name === z.name), `${z.name} is a map area`);
  }
  const boss = moorsZones.find((z) => z.mobs.barrowking)!;
  assert.deepEqual(boss.levels, [35, 35], "the Barrow-King is Lv 35");
  assert.equal(boss.mobs.barrowking, 1);
  const wild = moorsZones.find((z) => z.wild)!;
  assert.equal(wild.levels[0], MOORS_LEVEL.min, "the open moor starts at Lv 20 by the gate");
  assert.equal(wild.levels[1], MOORS_LEVEL.mob, "and tops out at the moors' ceiling");
  // the named zones: the nearest to Cairnwatch is the lowest, the furthest the highest
  const named = moorsZones.filter((z) => !z.wild && !z.mobs.barrowking).map((z) => ({ z, d: Math.hypot(z.x + z.w / 2 - cx, z.y + z.h / 2 - cy) })).sort((a, b) => a.d - b.d);
  assert.ok(named[0].z.levels[0] <= 22, `${named[0].z.name} near Cairnwatch is low`);
  assert.ok(named[named.length - 1].z.levels[1] === MOORS_LEVEL.mob, `${named[named.length - 1].z.name} at the far edge is high`);
  // the moors' own density: thinner than Act 1, and the wild zone thinner than the named ones
  assert.ok(DENSITY.moorsTilesPerMob > DENSITY.tilesPerMob && DENSITY.moorsWildTilesPerMob > DENSITY.moorsTilesPerMob);
  const total = moorsZones.reduce((n, z) => n + Object.values(z.mobs).reduce((a, b) => a + (b ?? 0), 0), 0);
  assert.ok(total > 600 && total < 2200, `${total} monsters in the moors`);
});

test("Cairnwatch: a safe square, no monster spawns in or walks into the fort, the moors' respawn point", () => {
  for (let y = 0; y < CAIRN_SQUARE.h; y++) for (let x = 0; x < CAIRN_SQUARE.w; x++) assert.ok(isSafeZone((CAIRN_SQUARE.x + x + 0.5) * TILE, (MR(CAIRN_SQUARE.y + y) + 0.5) * TILE));
  assert.ok(!isSafeZone((CAIRNWATCH.x - 4) * TILE, MR(CAIRNWATCH.y) * TILE), "outside the walls is not safe");
  for (let y = fort.y0; y < fort.y1; y++) for (let x = fort.x0; x < fort.x1; x++) assert.ok(noMobsAt((x + 0.5) * TILE, (y + 0.5) * TILE), `monster-free at ${x},${y}`);
  for (const z of moorsZones) for (let i = 0; i < 300; i++) {
    const p = randomPointInZone(z);
    assert.ok(!inFort(p.x, p.y) && !isSafeZone(p.x, p.y), `${z.name} spawned at ${p.x},${p.y}`);
  }
  assert.equal(zoneAt(CAIRNWATCH.x + 5, MR(CAIRNWATCH.y) + 5), undefined, "Cairnwatch belongs to no monster zone");
  for (let i = 0; i < 40; i++) { const p = moorsSpawn(); assert.ok(isSafeZone(p.x, p.y) && !isSolidAt(p.x, p.y) && actAt(p.y, p.x) === 3); }
});

test("Cairnwatch: portal stone, bounty board, captain and traders stand inside the walls and can be reached", () => {
  const spot = PORTAL_SPOTS.find((p) => p.id === "cairnwatch")!;
  assert.ok(spot && inFort((spot.x + 0.5) * TILE, (spot.y + 0.5) * TILE), "the portal stone is in Cairnwatch");
  const portal = PORTALS.find((p) => p.id === "cairnwatch")!;
  assert.ok(!isSolidAt(portal.x, portal.y + TILE * 0.9), "the arrival spot is free");
  const board = BOARDS.find((b) => b.id === "cairnwatch")!;
  assert.ok(board && inFort(board.x, board.y) && actOfTile(Math.floor(board.x / TILE), Math.floor(board.y / TILE)) === 3, "a board in Cairnwatch");
  for (const id of ["cairncaptain", "moorherbalist", "moorarmourer"]) {
    const n = NPCS.find((x) => x.id === id)!;
    assert.ok(n && inFort(n.x, n.y), `${id} in Cairnwatch`);
    // a free spot in talking range (the NPC itself stands in the open)
    assert.ok([[0, TALK_RANGE * 0.8], [TALK_RANGE * 0.8, 0], [-TALK_RANGE * 0.8, 0], [0, -TALK_RANGE * 0.8]].some(([dx, dy]) => !isSolidAt(n.x + dx, n.y + dy)), `${id} can be reached`);
    if (n.shop) assert.ok(SHOPS[n.shop], `${id}'s shop ${n.shop}`);
  }
  // the herbwife sells Medium and Greater flasks of both kinds and buys runes
  const herbs = SHOPS.moorherbalist;
  assert.deepEqual([...new Set(herbs.stock.map((e) => `${e.item}${e.size}`))].sort(), ["mpotion1", "mpotion2", "potion1", "potion2"]);
  assert.ok(herbs.buys?.includes("rune"));
});

test("the moors' board offers moors hunts only; Act 1's and Act 2's offer none of them", () => {
  for (const level of [20, 24, 28, 32, 35]) {
    const offers = bountyOffers(level, 0, 3);
    assert.ok(offers.length >= 2, `Lv ${level}: ${offers.length} offers`);
    for (const o of offers) {
      const z = SPAWN_ZONES.find((s) => s.name === o.zone)!;
      assert.equal(actOfTile(z.x, z.y), 3, `${o.zone} is in the moors`);
      assert.ok(MOORS_KINDS.includes(o.kind) && !ELITE[o.kind], `hunt ${o.kind}`);
      assert.ok(o.minLevel >= MOORS_LEVEL.min - 2);
    }
    for (const act of [1, 2]) for (const o of bountyOffers(level, 0, act)) assert.ok(!MOORS_KINDS.includes(o.kind), `act ${act} board: no moors hunt`);
  }
  assert.ok(moorsZones.some((z) => huntable(z, 3)));
});

/** The room's player for a client, healthy and standing at (x, y). */
function place(room: any, c: { sessionId: string }, x: number, y: number) {
  const p = room.state.players.get(c.sessionId);
  p.x = x; p.y = y; p.lastHurt = 0; p.level = 25;
  return p;
}

test("room: Cairnwatch's portal stone wakes on a walk-up and is listed; travel there and back", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    const lists: { found: string[]; woke?: string }[] = [];
    c.onMessage("portals", (m: { found: string[]; woke?: string }) => lists.push(m));
    await wait(200);
    const room = srv.room, portal = PORTALS.find((x) => x.id === "cairnwatch")!, oak = PORTALS.find((x) => x.id === "oakvale")!;
    const p = place(room, c, oak.x, oak.y + TILE * 0.5);
    assert.ok(await until(() => p.portals.has("oakvale")), "Oakvale's stone woke");
    place(room, c, portal.x, portal.y + TILE);
    assert.ok(await until(() => p.portals.has("cairnwatch")), "Cairnwatch's stone woke");
    assert.ok(await until(() => lists.some((l) => l.woke === "cairnwatch" && l.found.includes("cairnwatch"))), "the client hears of it");
    lists.length = 0;
    c.send("portals");
    assert.ok(await until(() => lists.length > 0));
    assert.ok(lists[0].found.includes("cairnwatch") && lists[0].found.includes("oakvale"), "listed for travel");
    // from Cairnwatch's stone to Oakvale's and back
    p.lastHurt = 0;
    c.send("travel", { to: "oakvale" });
    assert.ok(await until(() => actAt(p.y, p.x) === 1), "travelled home to Oakvale");
    p.lastHurt = 0; p.x = oak.x; p.y = oak.y + TILE * 0.5;
    c.send("travel", { to: "cairnwatch" });
    assert.ok(await until(() => actAt(p.y, p.x) === 3), "and back to the moors");
    assert.ok(Math.hypot(p.x - portal.x, p.y - portal.y) < TILE * 1.5, "in front of Cairnwatch's stone");
    await c.leave();
  } finally {
    await srv.stop();
  }
});

test("room: moors zones fill with moors monsters outside Cairnwatch; a monster chasing a hero stops at the fort", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    await wait(200);
    const room = srv.room;
    let moors = 0;
    room.state.mobs.forEach((m: any) => {
      if (m.dead || actOfTile(Math.floor(m.x / TILE), Math.floor(m.y / TILE)) !== 3) return;
      moors++;
      assert.ok(MOORS_KINDS.includes(m.kind), `${m.kind} in the moors`);
      assert.ok(!inFort(m.x, m.y), `${m.kind} spawned inside Cairnwatch at ${m.x},${m.y}`);
      assert.ok(m.level >= MOORS_LEVEL.min && m.level <= MOORS_LEVEL.special, `${m.kind} Lv ${m.level}`);
    });
    assert.ok(moors > 300, `${moors} moors monsters up`);
    // a hero in the square, a Barrow-Wight just outside the south gate set on him: it never sets foot inside the walls
    // (the hero just inside the south gate, off the square: in reach, but the fort and its margin are monster-free)
    const sx = (CAIRN_SQUARE.x + 4.5) * TILE, sy = (MR(CAIRNWATCH.y + CAIRNWATCH.h) - 1) * TILE;
    const p = place(room, c, sx, sy);
    assert.ok(!isSafeZone(p.x, p.y) && inFort(p.x, p.y));
    const id = "moorswight";
    room.spawnMob("wight", -1, id, { x: sx, y: (fort.y1 + 1.5) * TILE, level: 22 });
    const w = room.state.mobs.get(id), y0 = w.y;
    w.target = c.sessionId; w.hateId = c.sessionId; w.hate = 3; // it hates him: it would follow him anywhere it may walk
    for (let i = 0; i < 60; i++) {
      await wait(50);
      assert.ok(!inFort(w.x, w.y), `the wight got in at ${w.x},${w.y}`);
      p.hp = p.maxHp;
    }
    assert.ok(w.y < y0 - TILE, "it came for the hero, up to the walls");
    await c.leave();
  } finally {
    await srv.stop();
  }
});

test("room: at Cairnwatch's board the moors' hunts are offered", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    const got: { board: string; offers: { zone: string; kind: MobKind }[] }[] = [];
    c.onMessage("bounty", (m: any) => got.push(m));
    await wait(200);
    const room = srv.room, board = BOARDS.find((b) => b.id === "cairnwatch")!;
    place(room, c, board.x, board.y + 4);
    c.send("bounty", {});
    assert.ok(await until(() => got.length > 0));
    assert.equal(got[0].board, "cairnwatch");
    assert.ok(got[0].offers.length >= 2, "offers");
    for (const o of got[0].offers) assert.ok(MOORS_KINDS.includes(o.kind), `${o.kind} (${o.zone}) is a moors hunt`);
    await c.leave();
  } finally {
    await srv.stop();
  }
});
