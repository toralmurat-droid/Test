// Act 4 made playable: the Rustwater Post (the badlands' outpost: safe square, monster-free walls, portal stone, board,
// traders), the badlands' monsters (every per-kind table), their zones (levels 25-40, own density), Fangrock and Talon
// Fort as Redfang camps (shared/bandits.ts CAMPS) and the badlands' bounty board. Redfang Hollow (Act 1) is unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actOfTile, BADLANDS_AI, BADLANDS_KINDS, BADLANDS_LEVEL, BEAST, BEAST_BROOD, BEAST_MOVES, BOSS, ELEM_MOVE, ELITE, FACTION, MOBS, REDFANG_KINDS, type MobKind, TILE,
} from "../shared/constants";
import { LOOT } from "../shared/items";
import { GEAR_DROP } from "../shared/gear";
import { MOB_COMBAT } from "../shared/combat";
import { MOB_AFFINITY } from "../shared/elements";
import { NIGHT_BOSSES } from "../shared/daynight";
import { RAIDER_SPARES } from "../shared/raiders";
import { familyOf } from "../shared/devour";
import { AREAS, isSafeZone, isSolidAt, isSolidTile, PORTAL_SPOTS, T } from "../shared/map";
import { BR, FANGROCK, FANGROCK_KEEP, RUSTWATER_POST, RUSTWATER_SQUARE, TALON_FORT } from "../shared/badlands";
import { DENSITY, findHideSpot, HIDE, noMobsAt, randomPointInZone, SPAWN_ZONES, zoneAt } from "../shared/spawns";
import { BOARDS, bountyOffers, huntable } from "../shared/bounty";
import { PORTALS } from "../shared/portals";
import { NPCS, TALK_RANGE } from "../shared/npcs";
import { SHOPS } from "../shared/shops";
import { badlandsSpawn, actAt } from "../shared/act2";
import { CAMP_POSTS, CAMP_TOWERS, CAMPS, campMobs, campOfZone, POSTS, postKind, postPos, REDFANG_HOLLOW_HIDE } from "../shared/bandits";
import { startRoom, until, wait } from "./helpers/room";

const badZones = SPAWN_ZONES.filter((z) => actOfTile(z.x, z.y) === 4);
/** The Post's walls in map tiles, with the 2-tile margin NO_MOB_AREAS keeps. */
const post = { x0: RUSTWATER_POST.x - 2, y0: BR(RUSTWATER_POST.y) - 2, x1: RUSTWATER_POST.x + RUSTWATER_POST.w + 2, y1: BR(RUSTWATER_POST.y) + RUSTWATER_POST.h + 2 };
const inPost = (px: number, py: number) => { const tx = px / TILE, ty = py / TILE; return tx >= post.x0 && tx < post.x1 && ty >= post.y0 && ty < post.y1; };
const cx = RUSTWATER_POST.x + RUSTWATER_POST.w / 2, cy = BR(RUSTWATER_POST.y + RUSTWATER_POST.h / 2);

test("badlands monsters: an entry in every per-kind table, all living, bosses tagged", () => {
  assert.equal(BADLANDS_KINDS.length, 8, "seven monsters and Old Rourke");
  for (const k of BADLANDS_KINDS) {
    assert.ok(MOBS[k] && LOOT[k] && GEAR_DROP[k] && MOB_COMBAT[k], `${k}: MOBS, LOOT, GEAR_DROP, MOB_COMBAT`);
    assert.ok(MOB_AFFINITY[k], `${k}: an elemental affinity`);
    assert.ok(MOBS[k].xp > 0 && LOOT[k].gold[1] > 0 && GEAR_DROP[k].chance > 0, `${k}: pays out`);
    const t = GEAR_DROP[k].tiers;
    assert.ok(Math.abs(t[0] + t[1] + t[2] - 1) < 1e-9, `${k}: gear tiers add up`);
    for (const m of BEAST_MOVES[k] ?? []) assert.ok(BEAST[m], `${k}: move ${m} exists`);
    assert.equal(BEAST_BROOD[k], undefined, `${k}: calls no brood`);
    // living things all: flesh for the vampire, the Night Raiders ride them down, nobody keeps the night
    assert.ok(familyOf(k), `${k} has a devour family`);
    assert.ok(!RAIDER_SPARES.includes(k) && !NIGHT_BOSSES.includes(k) && FACTION[k] !== "undead", `${k} is alive`);
    // (so no badlands zone is a zone of the dead: server UNDEAD_ZONES thins only those by day, the Redfang keep the day)
    assert.equal(FACTION[k] === "outlaw", REDFANG_KINDS.includes(k), `${k}: the Redfang are outlaws, the beasts of the land no side`);
  }
  assert.ok(ELITE.redcaptain && !BOSS.redcaptain && ELITE.rourke && BOSS.rourke);
  assert.equal(ELEM_MOVE.firebrand, "firepot", "the firebrand throws fire pots");
  assert.ok(BADLANDS_AI.warlords.redcaptain && BADLANDS_AI.warlords.rourke?.reinforce, "captains and Old Rourke cry war");
  // every badlands kind lives somewhere in the badlands
  const living = new Set(badZones.flatMap((z) => Object.keys(z.mobs)));
  for (const k of BADLANDS_KINDS) assert.ok(living.has(k), `${k} has a zone`);
});

test("badlands zones: 10+ zones and a wild one, levels 25-38 (Old Rourke 40), climbing west from the Post", () => {
  assert.ok(badZones.length >= 11, `${badZones.length} zones`);
  assert.equal(badZones.filter((z) => z.wild).length, 1, "one broad wild zone");
  assert.equal(badZones[badZones.length - 1].name, "The Red Badlands", "the wild zone is last in its block");
  for (const z of badZones) {
    const kinds = Object.keys(z.mobs) as MobKind[];
    assert.ok(kinds.every((k) => BADLANDS_KINDS.includes(k)), `${z.name}: only badlands monsters`);
    const special = kinds.every((k) => ELITE[k]);
    assert.ok(z.levels[0] >= BADLANDS_LEVEL.min && z.levels[1] <= (special ? BADLANDS_LEVEL.special : BADLANDS_LEVEL.mob), `${z.name}: ${z.levels}`);
    assert.ok(z.levels[0] <= z.levels[1]);
    assert.ok(AREAS.some((a) => a.name === z.name), `${z.name} is a map area`);
  }
  const boss = badZones.find((z) => z.mobs.rourke)!;
  assert.equal(boss.name, "Fangrock Keep");
  assert.deepEqual(boss.levels, [40, 40], "Old Rourke is Lv 40");
  assert.equal(boss.mobs.rourke, 1);
  const wild = badZones.find((z) => z.wild)!;
  assert.equal(wild.levels[0], BADLANDS_LEVEL.min, "the open badlands start at Lv 25 by the Red Pass");
  assert.equal(wild.levels[1], BADLANDS_LEVEL.mob, "and top out at the badlands' ceiling");
  // the named zones climb with the distance from the Post: the nearest are Lv 25, Fangrock (far west) tops out at 38
  const named = badZones.filter((z) => !z.wild && !z.mobs.rourke).map((z) => ({ z, d: Math.hypot(z.x + z.w / 2 - cx, z.y + z.h / 2 - cy) })).sort((a, b) => a.d - b.d);
  assert.equal(named[0].z.levels[0], BADLANDS_LEVEL.min, `${named[0].z.name} near the Post is Lv 25`);
  assert.equal(named[named.length - 1].z.name, "Fangrock");
  assert.equal(named[named.length - 1].z.levels[1], BADLANDS_LEVEL.mob, "Fangrock at the far edge is Lv 38");
  for (let i = 1; i < named.length; i++) assert.ok(named[i].z.levels[0] >= named[i - 1].z.levels[0] - 1, `${named[i].z.name} (${named[i].z.levels}) is not lower than ${named[i - 1].z.name} (${named[i - 1].z.levels})`);
  // the badlands' own density (not Act 1's): thinner, the wild zone thinner than the named ones
  assert.ok(DENSITY.badlandsTilesPerMob > DENSITY.tilesPerMob && DENSITY.badlandsWildTilesPerMob > DENSITY.badlandsTilesPerMob);
  const total = badZones.reduce((n, z) => n + Object.values(z.mobs).reduce((a, b) => a + (b ?? 0), 0), 0);
  assert.ok(total > 600 && total < 2000, `${total} monsters in the badlands`);
  // rattlers hide under the badlands' rocks
  assert.ok(HIDE.spots.rattler?.includes(T.ROCK));
});

test("the Rustwater Post: a safe square, no monster spawns in or walks into the walls, the badlands' respawn point", () => {
  const Q = RUSTWATER_SQUARE;
  for (let y = 0; y < Q.h; y++) for (let x = 0; x < Q.w; x++) assert.ok(isSafeZone((Q.x + x + 0.5) * TILE, (BR(Q.y + y) + 0.5) * TILE));
  assert.ok(!isSafeZone((RUSTWATER_POST.x - 4) * TILE, BR(RUSTWATER_POST.y) * TILE), "outside the walls is not safe");
  for (let y = post.y0; y < post.y1; y++) for (let x = post.x0; x < post.x1; x++) assert.ok(noMobsAt((x + 0.5) * TILE, (y + 0.5) * TILE), `monster-free at ${x},${y}`);
  // the Red Pass's arrival clearing too
  const pass = AREAS.find((a) => a.name === "The Red Pass")!;
  assert.ok(pass && actOfTile(pass.x, pass.y) === 4 && noMobsAt((pass.x + pass.w / 2) * TILE, (pass.y + pass.h / 2) * TILE));
  for (const z of badZones) for (let i = 0; i < 300; i++) {
    const p = randomPointInZone(z);
    assert.ok(!inPost(p.x, p.y) && !isSafeZone(p.x, p.y) && !noMobsAt(p.x, p.y), `${z.name} spawned at ${p.x},${p.y}`);
  }
  assert.equal(zoneAt(RUSTWATER_POST.x + 5, BR(RUSTWATER_POST.y) + 5), undefined, "the Post belongs to no monster zone");
  for (let i = 0; i < 40; i++) { const p = badlandsSpawn(); assert.ok(isSafeZone(p.x, p.y) && !isSolidAt(p.x, p.y) && actAt(p.y, p.x) === 4); }
});

test("the Rustwater Post: portal stone, bounty board, marshal and traders stand inside the walls and can be reached", () => {
  const spot = PORTAL_SPOTS.find((p) => p.id === "rustwater")!;
  assert.ok(spot && inPost((spot.x + 0.5) * TILE, (spot.y + 0.5) * TILE), "the portal stone is in the Post");
  const portal = PORTALS.find((p) => p.id === "rustwater")!;
  assert.ok(!isSolidAt(portal.x, portal.y + TILE * 0.9), "the arrival spot is free");
  const board = BOARDS.find((b) => b.id === "rustwater")!;
  assert.ok(board && inPost(board.x, board.y) && actOfTile(Math.floor(board.x / TILE), Math.floor(board.y / TILE)) === 4, "a board in the Post");
  for (const id of ["rustmarshal", "rustarmourer", "rusthealer"]) {
    const n = NPCS.find((x) => x.id === id)!;
    assert.ok(n && inPost(n.x, n.y), `${id} in the Post`);
    assert.ok([[0, TALK_RANGE * 0.8], [TALK_RANGE * 0.8, 0], [-TALK_RANGE * 0.8, 0], [0, -TALK_RANGE * 0.8]].some(([dx, dy]) => !isSolidAt(n.x + dx, n.y + dy)), `${id} can be reached`);
    if (n.shop) assert.ok(SHOPS[n.shop], `${id}'s shop ${n.shop}`);
  }
  assert.ok(NPCS.find((x) => x.id === "rustmarshal")!.where, "the marshal is a quest giver the log can point to");
  const heal = SHOPS.rusthealer;
  assert.deepEqual([...new Set(heal.stock.map((e) => `${e.item}${e.size}`))].sort(), ["mpotion1", "mpotion2", "potion1", "potion2"]);
  assert.ok(heal.buys?.includes("rune"));
});

test("the badlands' board offers badlands hunts only; the other acts' boards offer none of them", () => {
  for (const level of [25, 28, 32, 36, 40]) {
    const offers = bountyOffers(level, 0, 4);
    assert.ok(offers.length >= 2, `Lv ${level}: ${offers.length} offers`);
    for (const o of offers) {
      const z = SPAWN_ZONES.find((s) => s.name === o.zone)!;
      assert.equal(actOfTile(z.x, z.y), 4, `${o.zone} is in the badlands`);
      assert.ok(BADLANDS_KINDS.includes(o.kind) && !ELITE[o.kind], `hunt ${o.kind}`);
      assert.ok(o.minLevel >= BADLANDS_LEVEL.min - 2);
    }
    for (const act of [1, 2, 3]) for (const o of bountyOffers(level, 0, act)) assert.ok(!BADLANDS_KINDS.includes(o.kind), `act ${act} board: no badlands hunt`);
  }
  assert.ok(badZones.some((z) => huntable(z, 4)));
});

// ---- the Redfang camps (shared/bandits.ts CAMPS) ----------------------------------------------------------------

/** Redfang Hollow's posts as they were before the camps became a table (role, tile, patrol route). */
const HOLLOW_BEFORE = '[["lookout",[254,103],null],["lookout",[249,118],null],["lookout",[241,108],null],["brute",[251,110],null],["brute",[251,117],null],["cutthroat",[245,111],null],["cutthroat",[258,112],null],["archer",[255,115],null],["cutthroat",[251,100],[[251,100],[241,93],[233,88],[225,80]]],["archer",[252,100],[[252,100],[242,93],[234,88],[226,80]]],["cutthroat",[251,121],[[251,121],[250,126],[248,132],[245,138],[241,143]]],["archer",[252,121],[[252,121],[251,126],[249,132],[246,138],[242,143]]],["ambusher",[236,94],null],["ambusher",[236,94],null],["ambusher",[256,94],null],["ambusher",[256,94],null],["ambusher",[234,106],null],["ambusher",[234,106],null],["ambusher",[244,127],null],["ambusher",[244,127],null],["ambusher",[271,113],null],["ambusher",[271,113],null]]';

test("Redfang Hollow (Act 1) is the same camp as before: posts, zone, trees, first in the post index", () => {
  assert.equal(JSON.stringify(CAMP_POSTS.map((p) => [p.role, p.at, p.route ?? null])), HOLLOW_BEFORE);
  assert.equal(CAMPS[0].zone, "Redfang Hollow");
  assert.equal(campOfZone("Redfang Hollow"), 0);
  CAMP_POSTS.forEach((p, i) => { assert.equal(POSTS[i].camp, 0); assert.equal(postKind(POSTS[i]), "bandit"); assert.deepEqual(POSTS[i].at, p.at); });
  assert.equal(POSTS.filter((p) => p.camp === 0).length, CAMP_POSTS.length);
  assert.deepEqual(campMobs("Redfang Hollow"), { bandit: CAMP_POSTS.length });
  const z = SPAWN_ZONES.find((s) => s.name === "Redfang Hollow")!;
  assert.deepEqual({ mobs: z.mobs, levels: z.levels, respawnMs: z.respawnMs, x: z.x, y: z.y, w: z.w, h: z.h },
    { mobs: { bandit: 22 }, levels: [19, 22], respawnMs: 20000, x: 236, y: 98, w: 32, h: 26 });
  assert.deepEqual(CAMPS[0].hide, REDFANG_HOLLOW_HIDE);
  assert.deepEqual(REDFANG_HOLLOW_HIDE, HIDE.spots.slime, "its ambushers still climb the same trees");
  assert.ok(CAMP_POSTS.every((p) => p.kind === undefined), "held by bandits, roles in Mob.weapon");
});

test("Fangrock and Talon Fort: Redfang camps of the clan's kinds, every post on open ground, towers, ledges for the ambushers", () => {
  for (const name of ["Fangrock", "Talon Fort"]) {
    const ci = campOfZone(name), camp = CAMPS[ci], z = SPAWN_ZONES.find((s) => s.name === name)!;
    assert.ok(ci > 0 && z, name);
    assert.deepEqual(z.mobs, campMobs(name), `${name}: one monster per post`);
    const roles = new Set(camp.posts.map((p) => p.role));
    for (const r of ["lookout", "ambusher"] as const) assert.ok(roles.has(r), `${name} has ${r}s`);
    assert.ok(camp.posts.some((p) => p.route), `${name} sends out patrols`);
    assert.ok(camp.posts.some((p) => postKind(p) === "redcaptain"), `${name} has a captain`);
    for (const p of camp.posts) {
      const k = postKind(p);
      assert.ok(REDFANG_KINDS.includes(k), `${name}: ${k} is the clan's`);
      if (p.role === "lookout") {
        assert.equal(k, "crossbowman", "the towers are manned by crossbowmen");
        assert.ok(camp.towers.some(([x, y]) => x === p.at[0] && y === p.at[1]) && CAMP_TOWERS.some(([x, y]) => x === p.at[0] && y === p.at[1]), "a lookout stands on a tower");
        continue;
      }
      assert.ok(!isSolidTile(p.at[0], p.at[1]), `${name}: ${k} ${p.role} post ${p.at} is open ground`);
      for (const [x, y] of p.route ?? []) assert.ok(!isSolidTile(x, y), `${name}: patrol point ${x},${y} is open ground`);
      if (p.role === "ambusher") {
        const { x, y } = postPos(p), s = findHideSpot(k, x, y, 4, new Set(), camp.hide);
        assert.ok(s, `${name}: an ambusher at ${p.at} has a rock to crouch behind`);
      }
    }
    assert.ok(camp.hide.includes(T.ROCK), "badlands ambushers hide among rocks, not trees");
  }
  // the keep sits inside Fangrock, its zone before Fangrock's (zoneAt finds Old Rourke's ground first)
  const K = FANGROCK_KEEP, F = FANGROCK;
  assert.ok(K.x > F.x && K.y > F.y && K.x + K.w < F.x + F.w && K.y + K.h < F.y + F.h);
  assert.equal(zoneAt(K.x + 5, BR(K.y) + 8)?.name, "Fangrock Keep");
  assert.equal(zoneAt(F.x + F.w - 6, BR(F.y) + 14)?.name, "Fangrock");
  assert.equal(zoneAt(TALON_FORT.x + 5, BR(TALON_FORT.y) + 5)?.name, "Talon Fort");
});

/** The room's player for a client, healthy and standing at (x, y). */
function place(room: any, c: { sessionId: string }, x: number, y: number, level = 30) {
  const p = room.state.players.get(c.sessionId);
  p.x = x; p.y = y; p.lastHurt = 0; p.level = level; p.invulnUntil = 0;
  return p;
}

test("room: the camps are manned at their posts; Redfang Hollow exactly as before, the badlands forts by the clan's kinds", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(200);
    const room = srv.room, held = new Map<number, any>();
    room.state.mobs.forEach((m: any) => { if (m.camp && m.post >= 0 && !m.dead) { assert.ok(!held.has(m.post), `post ${m.post} held twice`); held.set(m.post, m); } });
    POSTS.forEach((p, i) => {
      const m = held.get(i);
      assert.ok(m, `post ${i} (${CAMPS[p.camp].zone} ${p.role}) is manned`);
      assert.equal(m.kind, postKind(p));
      assert.equal(SPAWN_ZONES[m.zone].name, CAMPS[p.camp].zone);
      assert.equal(m.perch, p.role === "lookout"); assert.equal(m.ambusher, p.role === "ambusher");
      // the Hollow's bandits wear their role (the client's sheet); the forts' kinds only a lookout's
      assert.equal(m.weapon, p.camp === 0 || p.role === "lookout" ? p.role : "", `post ${i}: weapon ${m.weapon}`);
      if (p.role !== "ambusher") { const at = postPos(p); assert.ok(Math.hypot(m.homeX - at.x, m.homeY - at.y) < 1, `post ${i} home`); }
    });
    // ambushers crouch out of sight from the start: up in the Hollow's trees, behind the forts' rocks
    for (const ci of [0, 1, 2]) {
      const amb = [...held.entries()].filter(([i]) => POSTS[i].camp === ci && POSTS[i].role === "ambusher").map(([, m]) => m);
      assert.ok(amb.length && amb.filter((m) => m.hidden).length >= amb.length - 1, `${CAMPS[ci].zone}: ${amb.filter((m) => m.hidden).length}/${amb.length} ambushers hidden`);
    }
    // Old Rourke leads Fangrock from his keep (hears the horn)
    let rourke: any;
    room.state.mobs.forEach((m: any) => { if (m.kind === "rourke" && !m.dead) rourke = m; });
    assert.ok(rourke && rourke.camp && rourke.level === 40 && SPAWN_ZONES[rourke.zone].name === "Fangrock Keep");
    let live = 0;
    room.state.mobs.forEach((m: any) => {
      if (m.dead || actOfTile(Math.floor(m.x / TILE), Math.floor(m.y / TILE)) !== 4) return;
      live++;
      assert.ok(BADLANDS_KINDS.includes(m.kind), `${m.kind} in the badlands`);
      assert.ok(!inPost(m.x, m.y), `${m.kind} spawned inside the Post at ${m.x},${m.y}`);
      assert.ok(m.level >= BADLANDS_LEVEL.min && m.level <= BADLANDS_LEVEL.special, `${m.kind} Lv ${m.level}`);
    });
    assert.ok(live > 600, `${live} badlands monsters up`);
    await c.leave();
  } finally {
    await srv.stop();
  }
});

test("room: a fort's lookout sees a hero far off, blows the horn and the garrison comes", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    const horns: unknown[] = [];
    c.onMessage("horn", (m: unknown) => horns.push(m));
    await wait(200);
    const room = srv.room;
    const li = POSTS.findIndex((p) => CAMPS[p.camp].zone === "Talon Fort" && p.role === "lookout");
    let look: any;
    room.state.mobs.forEach((m: any) => { if (m.post === li && !m.dead) look = m; });
    // just outside the gate, out of a plain monster's sight but inside a lookout's
    const p = place(room, c, look.x, look.y + 6 * TILE, 33);
    assert.ok(await until(() => horns.length > 0), "the horn sounds");
    let garrison = 0;
    room.state.mobs.forEach((m: any) => { if (m.camp && m.post >= 0 && CAMPS[POSTS[m.post].camp].zone === "Talon Fort" && !m.perch && !m.hidden && m.target === c.sessionId) garrison++; });
    assert.ok(garrison >= 3, `${garrison} of the garrison come for the hero`);
    p.hp = p.maxHp;
    await c.leave();
  } finally {
    await srv.stop();
  }
});

test("room: a firebrand's pot bursts where the hero stood and leaves the ground burning", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    const pots: any[] = [];
    c.onMessage("firepot", (m: any) => pots.push(m));
    await wait(200);
    const room = srv.room;
    // out on the Saltlick Flats, away from the camps: a lone firebrand set on the hero
    const z = SPAWN_ZONES.find((s) => s.name === "The Saltlick Flats")!, at = randomPointInZone(z);
    const p = place(room, c, at.x, at.y, 26);
    p.maxHp = p.hp = 100000; // (a fresh Lv 1 hero: a Lv 26 pot would fell him at once)
    room.state.mobs.forEach((m: any, id: string) => { if (!m.dead && Math.hypot(m.x - p.x, m.y - p.y) < 20 * TILE) room.state.mobs.delete(id); });
    room.spawnMob("firebrand", -1, "fb", { x: p.x + 100, y: p.y, level: 26 });
    const f = room.state.mobs.get("fb");
    f.target = c.sessionId; f.hateId = c.sessionId; f.hate = 3;
    assert.ok(await until(() => pots.length > 0, 8000), "a fire pot flies");
    assert.ok(Math.hypot(pots[0].x - p.x, pots[0].y - p.y) < 40, "aimed where the hero stood");
    assert.ok(await until(() => room.hazards.some((h: any) => h.el === "fire" && h.by === "fb")), "the ground burns");
    const hp0 = p.hp;
    assert.ok(await until(() => p.hp < hp0, 4000), "and the hero standing in it burns");
    await c.leave();
  } finally {
    await srv.stop();
  }
});

test("room: a warhound bays and its pack runs in; a captain's war cry rallies the Redfang round him", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    const cries: any[] = [];
    c.onMessage("warcry", (m: any) => cries.push(m));
    await wait(200);
    const room = srv.room;
    const z = SPAWN_ZONES.find((s) => s.name === "The Saltlick Flats")!, at = randomPointInZone(z);
    const p = place(room, c, at.x, at.y, 30);
    room.state.mobs.forEach((m: any, id: string) => { if (!m.dead && Math.hypot(m.x - p.x, m.y - p.y) < 20 * TILE) room.state.mobs.delete(id); });
    for (const [id, dx] of [["h1", 120], ["h2", 150], ["h3", 170]] as const) room.spawnMob("warhound", -1, id, { x: p.x + dx, y: p.y + 4 * TILE, level: 28 });
    const h1 = room.state.mobs.get("h1"), h2 = room.state.mobs.get("h2"), h3 = room.state.mobs.get("h3");
    h2.target = ""; h3.target = "";
    h1.target = c.sessionId; h1.hateId = c.sessionId; h1.hate = 3;
    assert.ok(await until(() => h2.target === c.sessionId && h3.target === c.sessionId, 3000), "the pack comes");
    for (const id of ["h1", "h2", "h3"]) room.state.mobs.delete(id);
    // a captain with an outrider beside him (no camp: a band out on the flats)
    room.spawnMob("redcaptain", -1, "cap", { x: p.x + 60, y: p.y, level: 30 });
    room.spawnMob("outrider", -1, "out", { x: p.x + 90, y: p.y + 30, level: 30 });
    const cap = room.state.mobs.get("cap"), out = room.state.mobs.get("out");
    cap.target = c.sessionId; cap.hateId = c.sessionId; cap.hate = 3;
    assert.ok(await until(() => cries.length > 0), "the captain cries war");
    assert.ok(cries[0].ids.includes("out") && out.rallyUntil > Date.now(), "the outrider is rallied");
    p.hp = p.maxHp;
    await c.leave();
  } finally {
    await srv.stop();
  }
});

test("room: Old Rourke calls outriders out of his keep once badly hurt", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    const calls: any[] = [];
    c.onMessage("reinforce", (m: any) => calls.push(m));
    await wait(200);
    const room = srv.room;
    let rid = "", r: any;
    room.state.mobs.forEach((m: any, id: string) => { if (m.kind === "rourke" && !m.dead) { r = m; rid = id; } });
    const p = place(room, c, r.x + 40, r.y, 39);
    r.hp = Math.floor(r.maxHp * 0.4);
    r.target = c.sessionId; r.hateId = c.sessionId; r.hate = 3;
    assert.ok(await until(() => calls.length > 0), "he calls for his men");
    let men = 0;
    room.state.mobs.forEach((m: any) => { if (m.mother === rid && !m.dead) { men++; assert.equal(m.kind, "outrider"); assert.ok(m.level <= BADLANDS_LEVEL.mob); } });
    assert.equal(men, BADLANDS_AI.warlords.rourke!.reinforce!.count);
    p.hp = p.maxHp;
    await c.leave();
  } finally {
    await srv.stop();
  }
});

test("room: the Rustwater Post's portal stone wakes on a walk-up and is listed; travel there and back", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    const lists: { found: string[]; woke?: string }[] = [];
    c.onMessage("portals", (m: { found: string[]; woke?: string }) => lists.push(m));
    await wait(200);
    const room = srv.room, portal = PORTALS.find((x) => x.id === "rustwater")!, oak = PORTALS.find((x) => x.id === "oakvale")!;
    const p = place(room, c, oak.x, oak.y + TILE * 0.5);
    assert.ok(await until(() => p.portals.has("oakvale")), "Oakvale's stone woke");
    place(room, c, portal.x, portal.y + TILE);
    assert.ok(await until(() => p.portals.has("rustwater")), "the Post's stone woke");
    assert.ok(await until(() => lists.some((l) => l.woke === "rustwater" && l.found.includes("rustwater"))), "the client hears of it");
    lists.length = 0;
    c.send("portals");
    assert.ok(await until(() => lists.length > 0));
    assert.ok(lists[0].found.includes("rustwater") && lists[0].found.includes("oakvale"), "listed for travel");
    p.lastHurt = 0;
    c.send("travel", { to: "oakvale" });
    assert.ok(await until(() => actAt(p.y, p.x) === 1), "travelled home to Oakvale");
    p.lastHurt = 0; p.x = oak.x; p.y = oak.y + TILE * 0.5;
    c.send("travel", { to: "rustwater" });
    assert.ok(await until(() => actAt(p.y, p.x) === 4), "and back to the badlands");
    assert.ok(Math.hypot(p.x - portal.x, p.y - portal.y) < TILE * 1.5, "in front of the Post's stone");
    await c.leave();
  } finally {
    await srv.stop();
  }
});

test("room: at the Rustwater Post's board the badlands' hunts are offered; a monster chasing a hero stops at the walls", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    const got: { board: string; offers: { zone: string; kind: MobKind }[] }[] = [];
    c.onMessage("bounty", (m: any) => got.push(m));
    await wait(200);
    const room = srv.room, board = BOARDS.find((b) => b.id === "rustwater")!;
    place(room, c, board.x, board.y + 4);
    c.send("bounty", {});
    assert.ok(await until(() => got.length > 0));
    assert.equal(got[0].board, "rustwater");
    assert.ok(got[0].offers.length >= 2, "offers");
    for (const o of got[0].offers) assert.ok(BADLANDS_KINDS.includes(o.kind), `${o.kind} (${o.zone}) is a badlands hunt`);
    // a hero just inside the south gate, an outrider outside set on him: it never sets foot inside the walls
    const sx = (RUSTWATER_SQUARE.x + 5.5) * TILE, sy = (BR(RUSTWATER_POST.y + RUSTWATER_POST.h) - 1) * TILE;
    const p = place(room, c, sx, sy, 26);
    assert.ok(!isSafeZone(p.x, p.y) && inPost(p.x, p.y));
    room.spawnMob("outrider", -1, "postout", { x: sx, y: (post.y1 + 1.5) * TILE, level: 26 });
    const w = room.state.mobs.get("postout"), y0 = w.y;
    w.target = c.sessionId; w.hateId = c.sessionId; w.hate = 3;
    for (let i = 0; i < 60; i++) {
      await wait(50);
      assert.ok(!inPost(w.x, w.y), `the outrider got in at ${w.x},${w.y}`);
      p.hp = p.maxHp;
    }
    assert.ok(w.y < y0 - TILE, "it came for the hero, up to the walls");
    await c.leave();
  } finally {
    await srv.stop();
  }
});

test("room: a Fangrock ambusher crouching on a rock ledge drops on a hero who walks by", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    const drops: any[] = [];
    c.onMessage("bambush", (m: any) => drops.push(m));
    await wait(200);
    const room = srv.room;
    let amb: any, aid = "";
    room.state.mobs.forEach((m: any, id: string) => { if (!amb && m.ambusher && m.hidden && POSTS[m.post] && CAMPS[POSTS[m.post].camp].zone === "Fangrock") { amb = m; aid = id; } });
    assert.ok(amb, "a hidden Fangrock ambusher");
    assert.ok(amb.spot, "it sits in a spot behind a rock");
    const p = place(room, c, amb.outX, amb.outY + 12, 36);
    p.maxHp = p.hp = 100000;
    assert.ok(await until(() => drops.some((d) => d.id === aid)), "it leaps out of the rocks");
    assert.ok(await until(() => !amb.hidden && amb.target === c.sessionId), "and fights the hero");
    await c.leave();
  } finally {
    await srv.stop();
  }
});
