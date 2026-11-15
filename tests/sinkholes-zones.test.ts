// Act 5 made playable: Ropewell (the sinkholes' outpost: safe square, monster-free walls, portal stone, board, traders),
// the sinkholes' monsters (every per-kind table, server/hidekin.ts), their zones (levels 30-45, own density), Hidehall as
// a Hide-Kin camp (shared/bandits.ts CAMPS), the Maw-Father's ledge and the sinkholes' bounty board. The Redfang camps
// are unchanged. Room tests are kept to two rooms (suite time).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actOfTile, BEAST, BEAST_BROOD, BEAST_MOVES, BEAST_RIDER, BOSS, ELITE, FACTION, HIDEKIN_KINDS, MOBS, PACK_KINDS, SINKHOLES_AI, SINKHOLES_KINDS,
  SINKHOLES_LEVEL, type MobKind, TILE,
} from "../shared/constants";
import { LOOT } from "../shared/items";
import { GEAR_DROP } from "../shared/gear";
import { MOB_COMBAT } from "../shared/combat";
import { MOB_AFFINITY, MOB_SHOT_ELEMENT } from "../shared/elements";
import { NIGHT_BOSSES } from "../shared/daynight";
import { RAIDER_SPARES } from "../shared/raiders";
import { familyOf } from "../shared/devour";
import { FAMILY_OF } from "../shared/champions";
import { AREAS, EMPTY, GROUND, isSafeZone, isSolidAt, isSolidTile, OBJECTS, PORTAL_SPOTS, T } from "../shared/map";
import { GREAT_MAW, HIDEHALL, MAW_LEDGE, MAW_LEDGE_RECT, PIT_HOLES, ROPEWELL, ROPEWELL_SQUARE, SINK_LANDS, SR } from "../shared/sinkholes";
import { DENSITY, findHideSpot, HIDE, noMobsAt, randomPointInZone, SPAWN_ZONES, zoneAt } from "../shared/spawns";
import { BOARDS, bountyOffers, huntable } from "../shared/bounty";
import { PORTALS } from "../shared/portals";
import { NPCS, TALK_RANGE } from "../shared/npcs";
import { SHOPS } from "../shared/shops";
import { actAt, sinkholesSpawn } from "../shared/act2";
import { CAMP_TOWERS, CAMPS, campMobs, campOfZone, POSTS, postKind, postPos } from "../shared/bandits";
import { startRoom, until, wait } from "./helpers/room";

const sinkZones = SPAWN_ZONES.filter((z) => actOfTile(z.x, z.y) === 5);
/** Ropewell's walls in map tiles, with the 2-tile margin NO_MOB_AREAS keeps. */
const well = { x0: ROPEWELL.x - 2, y0: SR(ROPEWELL.y) - 2, x1: ROPEWELL.x + ROPEWELL.w + 2, y1: SR(ROPEWELL.y) + ROPEWELL.h + 2 };
const inRopewell = (px: number, py: number) => { const tx = px / TILE, ty = py / TILE; return tx >= well.x0 && tx < well.x1 && ty >= well.y0 && ty < well.y1; };
const cx = ROPEWELL.x + ROPEWELL.w / 2, cy = SR(ROPEWELL.y + ROPEWELL.h / 2);
const HIDEHALL_CAMP = campOfZone("Hidehall");

test("sinkholes monsters: an entry in every per-kind table, all living, bosses tagged, the Hide-Kin's moves set", () => {
  assert.equal(SINKHOLES_KINDS.length, 8, "seven monsters and the Maw-Father");
  for (const k of SINKHOLES_KINDS) {
    assert.ok(MOBS[k] && LOOT[k] && GEAR_DROP[k] && MOB_COMBAT[k], `${k}: MOBS, LOOT, GEAR_DROP, MOB_COMBAT`);
    assert.ok(MOB_AFFINITY[k], `${k}: an elemental affinity`);
    assert.ok(MOBS[k].xp > 0 && LOOT[k].gold[1] > 0 && GEAR_DROP[k].chance > 0, `${k}: pays out`);
    const t = GEAR_DROP[k].tiers;
    assert.ok(Math.abs(t[0] + t[1] + t[2] - 1) < 1e-9, `${k}: gear tiers add up`);
    for (const m of BEAST_MOVES[k] ?? []) assert.ok(BEAST[m], `${k}: move ${m} exists`);
    for (const b of BEAST_BROOD[k] ?? []) assert.ok(SINKHOLES_KINDS.includes(b), `${k} calls its own kind of kin (${b})`);
    // living things all: flesh for the vampire, the Night Raiders leave them be, nobody keeps the night, no feud side
    assert.equal(familyOf(k), "beast", `${k} is a beast to devour`);
    assert.ok(!RAIDER_SPARES.includes(k) && !NIGHT_BOSSES.includes(k) && !FACTION[k], `${k} is alive and takes no side`);
    assert.equal(HIDEKIN_KINDS.includes(k), k !== "sinkworm", `${k}: the worms are the only ones not Hide-Kin`);
    if (!ELITE[k]) assert.equal(!!FAMILY_OF[k], k !== "sinkworm", `${k}: Hide-Stitched champions, never a worm`);
  }
  assert.ok(ELITE.hidechief && !BOSS.hidechief && ELITE.mawfather && BOSS.mawfather);
  assert.ok(SINKHOLES_AI.burrow.delver && SINKHOLES_AI.burrow.mawfather, "the Delvers and the Maw-Father burrow");
  assert.ok(SINKHOLES_AI.warlords.hidechief, "a Hide-Chieftain cries war");
  assert.deepEqual(BEAST_BROOD.hidechief, ["cackler", "cackler"], "and howls up his cacklers");
  assert.ok(BEAST_MOVES.hidechief?.includes("howl") && BEAST_MOVES.stagkin?.includes("stampede") && BEAST_MOVES.mawfather?.includes("rockfall"));
  assert.ok(PACK_KINDS.includes("cackler") && PACK_KINDS.includes("warhound"), "cacklers bay for their pack like warhounds");
  assert.equal(BEAST_RIDER.cackler, "bleed");
  assert.equal(MOB_SHOT_ELEMENT.stitcher, "poison", "the stitcher's hex");
  assert.ok(HIDE.spots.sinkworm?.includes(T.PIT), "the worms lie in the pits");
  const living = new Set(sinkZones.flatMap((z) => Object.keys(z.mobs)));
  for (const k of SINKHOLES_KINDS) assert.ok(living.has(k), `${k} has a zone`);
});

test("sinkholes zones: ten and a wild one, levels 30-43 (the Maw-Father 45) climbing from Ropewell, thin, the holds left clear", () => {
  assert.ok(sinkZones.length >= 12, `${sinkZones.length} zones`);
  assert.equal(sinkZones.filter((z) => z.wild).length, 1, "one broad wild zone");
  assert.equal(sinkZones[sinkZones.length - 1].name, "The Mawdeep Sinkholes", "the wild zone is last in its block");
  for (const z of sinkZones) {
    const kinds = Object.keys(z.mobs) as MobKind[];
    assert.ok(kinds.every((k) => SINKHOLES_KINDS.includes(k)), `${z.name}: only sinkholes monsters`);
    const special = kinds.every((k) => ELITE[k]);
    assert.ok(z.levels[0] >= SINKHOLES_LEVEL.min && z.levels[1] <= (special ? SINKHOLES_LEVEL.special : SINKHOLES_LEVEL.mob), `${z.name}: ${z.levels}`);
    assert.ok(AREAS.some((a) => a.name === z.name), `${z.name} is a map area`);
    if (!z.wild && z.name !== "The Great Maw") assert.ok(SINK_LANDS.some((l) => l.name === z.name), `${z.name} is one of the sinkholes' lands`);
  }
  // the Maw-Father on his ledge, Lv 45, his alone
  const boss = sinkZones.find((z) => z.mobs.mawfather)!;
  assert.equal(boss.name, "The Great Maw");
  assert.deepEqual(boss.levels, [45, 45]);
  assert.deepEqual(boss.mobs, { mawfather: 1 });
  assert.deepEqual([boss.x, boss.y, boss.w, boss.h], [MAW_LEDGE_RECT.x, SR(MAW_LEDGE_RECT.y), MAW_LEDGE_RECT.w, MAW_LEDGE_RECT.h], "his zone is the ledge only");
  const camp = sinkZones.find((z) => z.name === "Hidehall")!;
  assert.deepEqual(camp.levels, [40, 43]);
  const wild = sinkZones.find((z) => z.wild)!;
  assert.equal(wild.levels[0], SINKHOLES_LEVEL.min, "the open sinkholes start at Lv 30 by the Sinkway");
  assert.equal(wild.levels[1], SINKHOLES_LEVEL.mob, "and top out at the sinkholes' ceiling");
  // the named zones climb with the distance from Ropewell: the nearest Lv 30, Hidehall (far south-east) last at 40-43
  const named = sinkZones.filter((z) => !z.wild && !z.mobs.mawfather).map((z) => ({ z, d: Math.hypot(z.x + z.w / 2 - cx, z.y + z.h / 2 - cy) })).sort((a, b) => a.d - b.d);
  assert.ok(named.length >= 10, `${named.length} named zones`);
  assert.equal(named[0].z.levels[0], SINKHOLES_LEVEL.min, `${named[0].z.name} near Ropewell is Lv 30`);
  assert.equal(named[named.length - 1].z.name, "Hidehall");
  for (let i = 1; i < named.length; i++) assert.ok(named[i].z.levels[0] >= named[i - 1].z.levels[0] - 1, `${named[i].z.name} (${named[i].z.levels}) is not lower than ${named[i - 1].z.name} (${named[i - 1].z.levels})`);
  // its own density: as thin as the badlands, the wild thinner; about 1,200 monsters at most
  assert.ok(DENSITY.sinkholesTilesPerMob >= DENSITY.badlandsTilesPerMob && DENSITY.sinkholesWildTilesPerMob > DENSITY.sinkholesTilesPerMob);
  const total = sinkZones.reduce((n, z) => n + Object.values(z.mobs).reduce((a, b) => a + (b ?? 0), 0), 0);
  assert.ok(total > 500 && total <= 1200, `${total} monsters in the sinkholes`);
  // every land's 7x7 hold patch stays clear ground (the war's Holds come next)
  for (const l of SINK_LANDS) for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
    const x = l.hold[0] + i, y = SR(l.hold[1] + j);
    assert.ok(OBJECTS[y][x] === EMPTY && GROUND[y][x] !== T.WATER, `${l.name}: hold patch clear at ${x},${y}`);
  }
  // the Pitfields have pits for the worms
  for (const [x, y] of PIT_HOLES) assert.equal(zoneAt(x, SR(y))?.name, "The Pitfields", `pit hole ${x},${y} in the Pitfields`);
  assert.ok(PIT_HOLES.filter(([x, y]) => OBJECTS[SR(y)][x] === T.PIT).length >= PIT_HOLES.length - 2, "the holes are dug");
});

test("Ropewell: a safe square with its well, nothing spawns in or walks into the walls, the sinkholes' respawn point", () => {
  const Q = ROPEWELL_SQUARE;
  for (let y = 0; y < Q.h; y++) for (let x = 0; x < Q.w; x++) assert.ok(isSafeZone((Q.x + x + 0.5) * TILE, (SR(Q.y + y) + 0.5) * TILE));
  assert.ok(!isSafeZone((ROPEWELL.x - 4) * TILE, SR(ROPEWELL.y) * TILE), "outside the walls is not safe");
  assert.ok([...Array(Q.w * Q.h).keys()].some((i) => OBJECTS[SR(Q.y + Math.floor(i / Q.w))][Q.x + (i % Q.w)] === T.PIT), "the tame sinkhole in the square");
  for (let y = well.y0; y < well.y1; y++) for (let x = well.x0; x < well.x1; x++) assert.ok(noMobsAt((x + 0.5) * TILE, (y + 0.5) * TILE), `monster-free at ${x},${y}`);
  const gate = AREAS.find((a) => a.name === "The Sinkway")!;
  assert.ok(gate && actOfTile(gate.x, gate.y) === 5 && noMobsAt((gate.x + gate.w / 2) * TILE, (gate.y + gate.h / 2) * TILE), "the Sinkway's clearing too");
  for (const z of sinkZones) for (let i = 0; i < 200; i++) {
    const p = randomPointInZone(z);
    assert.ok(!inRopewell(p.x, p.y) && !isSafeZone(p.x, p.y) && !noMobsAt(p.x, p.y), `${z.name} spawned at ${p.x},${p.y}`);
  }
  assert.equal(zoneAt(ROPEWELL.x + 5, SR(ROPEWELL.y) + 5), undefined, "Ropewell belongs to no monster zone");
  for (let i = 0; i < 40; i++) { const p = sinkholesSpawn(); assert.ok(isSafeZone(p.x, p.y) && !isSolidAt(p.x, p.y) && actAt(p.y, p.x) === 5); }
});

test("Ropewell: portal stone, bounty board, Lodge-Warden and traders stand inside the walls and can be reached", () => {
  const spot = PORTAL_SPOTS.find((p) => p.id === "ropewell")!;
  assert.ok(spot && inRopewell((spot.x + 0.5) * TILE, (spot.y + 0.5) * TILE), "the portal stone is in Ropewell");
  const portal = PORTALS.find((p) => p.id === "ropewell")!;
  assert.ok(!isSolidAt(portal.x, portal.y + TILE * 0.9), "the arrival spot is free");
  const board = BOARDS.find((b) => b.id === "ropewell")!;
  assert.ok(board && inRopewell(board.x, board.y) && actOfTile(Math.floor(board.x / TILE), Math.floor(board.y / TILE)) === 5, "a board in Ropewell");
  for (const id of ["ropewarden", "ropearmourer", "ropehealer"]) {
    const n = NPCS.find((x) => x.id === id)!;
    assert.ok(n && inRopewell(n.x, n.y), `${id} in Ropewell`);
    assert.ok([[0, TALK_RANGE * 0.8], [TALK_RANGE * 0.8, 0], [-TALK_RANGE * 0.8, 0], [0, -TALK_RANGE * 0.8]].some(([dx, dy]) => !isSolidAt(n.x + dx, n.y + dy)), `${id} can be reached`);
    if (n.shop) assert.ok(SHOPS[n.shop], `${id}'s shop ${n.shop}`);
  }
  assert.ok(NPCS.find((x) => x.id === "ropewarden")!.where, "the Lodge-Warden is a quest giver the log can point to");
  const heal = SHOPS.ropehealer;
  assert.deepEqual([...new Set(heal.stock.map((e) => `${e.item}${e.size}`))].sort(), ["mpotion1", "mpotion2", "potion1", "potion2"]);
  assert.ok(heal.buys?.includes("rune"));
});

test("the sinkholes' board offers sinkholes hunts only; the other acts' boards offer none of them", () => {
  for (const level of [30, 34, 38, 42, 44]) {
    const offers = bountyOffers(level, 0, 5);
    assert.ok(offers.length >= 2, `Lv ${level}: ${offers.length} offers`);
    for (const o of offers) {
      const z = SPAWN_ZONES.find((s) => s.name === o.zone)!;
      assert.equal(actOfTile(z.x, z.y), 5, `${o.zone} is in the sinkholes`);
      assert.ok(SINKHOLES_KINDS.includes(o.kind) && !ELITE[o.kind], `hunt ${o.kind}`);
    }
    for (const act of [1, 2, 3, 4]) for (const o of bountyOffers(level, 0, act)) assert.ok(!SINKHOLES_KINDS.includes(o.kind), `act ${act} board: no sinkholes hunt`);
  }
  assert.ok(sinkZones.some((z) => huntable(z, 5)));
});

test("Hidehall: a Hide-Kin camp, every post on open ground, lookout towers, burrows for the Delvers; the Redfang camps keep their posts", () => {
  assert.deepEqual(CAMPS.slice(0, 3).map((c) => c.zone), ["Redfang Hollow", "Fangrock", "Talon Fort"], "the Redfang camps first: their post indices stay");
  assert.equal(HIDEHALL_CAMP, 3);
  const camp = CAMPS[HIDEHALL_CAMP], z = SPAWN_ZONES.find((s) => s.name === "Hidehall")!;
  assert.deepEqual(z.mobs, campMobs("Hidehall"), "one monster per post");
  const roles = new Set(camp.posts.map((p) => p.role));
  for (const r of ["lookout", "ambusher", "brute", "archer", "cutthroat"] as const) assert.ok(roles.has(r), `Hidehall has ${r}s`);
  assert.ok(camp.posts.some((p) => p.route), "it sends out patrols");
  assert.ok(camp.posts.filter((p) => postKind(p) === "hidechief").length >= 2, "two Hide-Chieftains");
  assert.deepEqual(camp.hide, [T.BURROW], "the Delvers lie in burrow mounds");
  for (const p of camp.posts) {
    const k = postKind(p);
    assert.ok(HIDEKIN_KINDS.includes(k), `${k} is Hide-Kin`);
    if (p.role === "lookout") {
      assert.equal(k, "quillback", "Quillbacks keep watch");
      assert.ok(camp.towers.some(([x, y]) => x === p.at[0] && y === p.at[1]) && CAMP_TOWERS.some(([x, y]) => x === p.at[0] && y === p.at[1]), "on a tower");
      continue;
    }
    assert.ok(!isSolidTile(p.at[0], p.at[1]), `${k} ${p.role} post ${p.at} is open ground`);
    for (const [x, y] of p.route ?? []) assert.ok(!isSolidTile(x, y), `patrol point ${x},${y} is open ground`);
    if (p.role === "ambusher") {
      const { x, y } = postPos(p);
      assert.equal(k, "delver");
      assert.ok(findHideSpot(k, x, y, 4, new Set(), camp.hide), `a Delver at ${p.at} has a burrow to lie in`);
    }
  }
  assert.equal(zoneAt(HIDEHALL.x + 10, SR(HIDEHALL.y) + 10)?.name, "Hidehall");
  // the Maw-Father's ledge: open ground down in the Great Maw, far below the rim path (he lets passers-by be)
  assert.equal(zoneAt(Math.floor(MAW_LEDGE.x), SR(Math.floor(MAW_LEDGE.y)))?.name, "The Great Maw");
  assert.ok(!isSolidTile(Math.floor(MAW_LEDGE.x), SR(Math.floor(MAW_LEDGE.y))));
  const M = GREAT_MAW, lx = MAW_LEDGE.x * TILE, ly = SR(MAW_LEDGE.y) * TILE;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2, x = Math.round(M.x + Math.cos(a) * (M.rx + 2.5)), y = Math.round(M.y + Math.sin(a) * (M.ry + 2.5));
    assert.ok(Math.hypot((x + 0.5) * TILE - lx, (SR(y) + 0.5) * TILE - ly) > MOBS.mawfather.aggroRange, `the rim path at ${x},${y} is out of his sight`);
  }
});

/** The room's player for a client, healthy and standing at (x, y). */
function place(room: any, c: { sessionId: string }, x: number, y: number, level = 36) {
  const p = room.state.players.get(c.sessionId);
  p.x = x; p.y = y; p.lastHurt = 0; p.level = level; p.invulnUntil = 0;
  return p;
}

test("room: the sinkholes come alive (Hidehall manned, worms in their pits, the Maw-Father on his ledge); Ropewell's stone, board", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    const lists: { found: string[]; woke?: string }[] = [], got: { board: string; offers: { zone: string; kind: MobKind }[] }[] = [];
    c.onMessage("portals", (m: { found: string[]; woke?: string }) => lists.push(m));
    c.onMessage("bounty", (m: any) => got.push(m));
    await wait(200);
    const room = srv.room, held = new Map<number, any>();
    room.state.mobs.forEach((m: any) => { if (m.camp && m.post >= 0 && !m.dead) { assert.ok(!held.has(m.post), `post ${m.post} held twice`); held.set(m.post, m); } });
    POSTS.forEach((p, i) => {
      const m = held.get(i);
      assert.ok(m, `post ${i} (${CAMPS[p.camp].zone} ${p.role}) is manned`);
      assert.equal(m.kind, postKind(p));
      assert.equal(SPAWN_ZONES[m.zone].name, CAMPS[p.camp].zone);
      assert.equal(m.perch, p.role === "lookout"); assert.equal(m.ambusher, p.role === "ambusher");
    });
    const amb = [...held.entries()].filter(([i]) => POSTS[i].camp === HIDEHALL_CAMP && POSTS[i].role === "ambusher").map(([, m]) => m);
    assert.ok(amb.length && amb.filter((m) => m.hidden).length >= amb.length - 1, `${amb.filter((m) => m.hidden).length}/${amb.length} Delvers lie in their burrows`);
    let maw: any, live = 0, worms = 0, buried = 0;
    room.state.mobs.forEach((m: any) => {
      if (m.dead || actOfTile(Math.floor(m.x / TILE), Math.floor(m.y / TILE)) !== 5) return;
      live++;
      assert.ok(SINKHOLES_KINDS.includes(m.kind), `${m.kind} in the sinkholes`);
      assert.ok(!inRopewell(m.x, m.y), `${m.kind} spawned inside Ropewell at ${m.x},${m.y}`);
      assert.ok(m.level >= SINKHOLES_LEVEL.min && m.level <= SINKHOLES_LEVEL.special, `${m.kind} Lv ${m.level}`);
      if (m.kind === "mawfather") maw = m;
      if (m.kind === "sinkworm" && SPAWN_ZONES[m.zone]?.name === "The Pitfields") {
        worms++;
        if (m.hidden) { buried++; assert.equal(OBJECTS[Math.floor(m.y / TILE)][Math.floor(m.x / TILE)], T.PIT, "down in a pit"); }
      }
    });
    assert.ok(live > 500, `${live} sinkholes monsters up`);
    assert.ok(worms && buried >= worms / 2, `${buried}/${worms} Pitfields worms buried in their pits`);
    assert.ok(maw && maw.level === 45 && SPAWN_ZONES[maw.zone].name === "The Great Maw", "the Maw-Father is up");
    const R = MAW_LEDGE_RECT;
    assert.ok(maw.x >= R.x * TILE && maw.x < (R.x + R.w) * TILE && maw.y >= SR(R.y) * TILE && maw.y < SR(R.y + R.h) * TILE, "on his ledge");
    // Ropewell's portal stone wakes on a walk-up, and the hero travels home and back
    const portal = PORTALS.find((x) => x.id === "ropewell")!, oak = PORTALS.find((x) => x.id === "oakvale")!;
    const p = place(room, c, oak.x, oak.y + TILE * 0.5, 30);
    assert.ok(await until(() => p.portals.has("oakvale")), "Oakvale's stone woke");
    place(room, c, portal.x, portal.y + TILE, 30);
    assert.ok(await until(() => p.portals.has("ropewell") && lists.some((l) => l.woke === "ropewell")), "Ropewell's stone woke, the client hears of it");
    p.lastHurt = 0;
    c.send("travel", { to: "oakvale" });
    assert.ok(await until(() => actAt(p.y, p.x) === 1), "travelled home to Oakvale");
    p.lastHurt = 0; p.x = oak.x; p.y = oak.y + TILE * 0.5;
    c.send("travel", { to: "ropewell" });
    assert.ok(await until(() => actAt(p.y, p.x) === 5), "and back to the sinkholes");
    assert.ok(Math.hypot(p.x - portal.x, p.y - portal.y) < TILE * 1.5, "in front of Ropewell's stone");
    // the board beside it offers the sinkholes' hunts
    const board = BOARDS.find((b) => b.id === "ropewell")!;
    place(room, c, board.x, board.y + 4, 30);
    c.send("bounty", {});
    assert.ok(await until(() => got.length > 0));
    assert.equal(got[0].board, "ropewell");
    assert.ok(got[0].offers.length >= 2, "offers");
    for (const o of got[0].offers) assert.ok(SINKHOLES_KINDS.includes(o.kind), `${o.kind} (${o.zone}) is a sinkholes hunt`);
    await c.leave();
  } finally {
    await srv.stop();
  }
});

test("room: the Hide-Kin's moves: a Delver burrows under the hero, a cackler bays for its pack, a stitcher sews a kinsman up, a Chieftain cries war, a worm bursts out of its pit", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    const hk: any[] = [], cries: any[] = [], bays: any[] = [];
    c.onMessage("hidekin", (m: any) => hk.push(m));
    c.onMessage("warcry", (m: any) => cries.push(m));
    c.onMessage("bay", (m: any) => bays.push(m));
    await wait(200);
    const room = srv.room;
    const fresh = () => ({ phase: "", until: 0, next: 0, mx: 0, my: 0, nextStitch: 0, stitchTo: "", castUntil: 0, nextSeek: 0 });
    const z = SPAWN_ZONES.find((s) => s.name === "Rootfall Slopes")!, at = randomPointInZone(z);
    const p = place(room, c, at.x, at.y, 36);
    p.maxHp = p.hp = 100000; // (a fresh Lv 1 hero: Lv 36 blows would fell him at once)
    const clear = () => room.state.mobs.forEach((m: any, id: string) => { if (Math.hypot(m.x - p.x, m.y - p.y) < 20 * TILE) room.state.mobs.delete(id); });
    const spawn = (kind: MobKind, id: string, dx: number, dy: number, target = true) => {
      room.spawnMob(kind, -1, id, { x: p.x + dx, y: p.y + dy, level: 34 });
      const m = room.state.mobs.get(id);
      if (target) { m.target = c.sessionId; m.hateId = c.sessionId; m.hate = 3; }
      return m;
    };
    clear();
    // a Delver digs in, marks the ground under the hero and bursts out there
    const dv = spawn("delver", "dv", 110, 0);
    dv.hk = fresh();
    assert.ok(await until(() => hk.some((e) => e.ev === "burrow" && e.id === "dv")), "it digs in");
    assert.ok(dv.hidden, "out of reach under the ground");
    assert.ok(await until(() => hk.some((e) => e.ev === "mark" && e.id === "dv")), "it marks where it comes up");
    const mark = hk.find((e) => e.ev === "mark" && e.id === "dv"), hp0 = p.hp;
    assert.ok(Math.hypot(mark.x - p.x, mark.y - p.y) < 20, "under the hero");
    assert.ok(await until(() => hk.some((e) => e.ev === "up" && e.id === "dv" && e.r > 0)), "it bursts out");
    assert.ok(!dv.hidden && Math.hypot(dv.x - p.x, dv.y - p.y) < 30 && p.hp < hp0, "beside the hero, who took the blow");
    clear(); p.hp = p.maxHp;
    // a cackler with prey bays: the pack runs in
    const c1 = spawn("cackler", "c1", 120, 4 * TILE), c2 = spawn("cackler", "c2", 150, 4 * TILE, false), c3 = spawn("cackler", "c3", 170, 4 * TILE, false);
    assert.ok(await until(() => c2.target === c.sessionId && c3.target === c.sessionId, 3000), "the pack comes");
    assert.ok(bays.some((b) => b.id === "c1" || b.ids.includes("c1")));
    void c1;
    clear(); p.hp = p.maxHp;
    // a stitcher sews up a hurt Quillback beside it
    const st = spawn("stitcher", "st", 100, 0), q = spawn("quillback", "qb", 110, 30, false);
    st.hk = fresh();
    q.hp = Math.round(q.maxHp * 0.3);
    const q0 = q.hp;
    assert.ok(await until(() => hk.some((e) => e.ev === "stitch" && e.id === "st" && e.to === "qb"), 5000), "it stitches the quillback");
    assert.ok(q.hp > q0, "mended");
    clear(); p.hp = p.maxHp;
    // a Hide-Chieftain cries war: a Delver beside him (no camp) is rallied
    const hc = spawn("hidechief", "hc", 60, 0), ally = spawn("delver", "ally", 90, 30, false);
    void hc;
    assert.ok(await until(() => cries.some((w) => w.id === "hc")), "the Chieftain cries war");
    assert.ok(cries.find((w) => w.id === "hc").ids.includes("ally") && ally.rallyUntil > Date.now(), "the Delver is rallied");
    clear(); p.hp = p.maxHp;
    // a Gullet Worm lies in a Pitfields pit; a hero walking over its lip gets the burst
    let worm: any, wid = "";
    room.state.mobs.forEach((m: any, id: string) => { if (!worm && m.kind === "sinkworm" && m.hidden && !m.dead && SPAWN_ZONES[m.zone]?.name === "The Pitfields") { worm = m; wid = id; } });
    assert.ok(worm, "a buried worm");
    const p2 = place(room, c, worm.outX, worm.outY, 38);
    p2.hp = p2.maxHp;
    const hp1 = p2.hp;
    assert.ok(await until(() => hk.some((e) => e.ev === "burst" && e.id === wid)), "it bursts out");
    assert.ok(!worm.hidden && worm.target === c.sessionId && p2.hp < hp1, "and the hero took it");
    await c.leave();
  } finally {
    await srv.stop();
  }
});
