// Falling Holds in the room (server/warHoldWorks.ts, warTroops.ts, warHolds.ts): a Hold near a hero stands its works,
// its soldiers come out of the barracks and none come while it lies wrecked, the last work down brings the Hold down
// (no walls, no soldiers, the war's fallen land), and a sworn hero's banner at the ruin claims it for their clan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, wait } from "./helpers/room";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { atWar } from "../shared/war/feuds";
import { newMinds } from "../shared/war/doctrine";
import { bannerSpot } from "../shared/war/holdSack";
import { canFall, HOLD_FALL, holdWorks, parseWork } from "../shared/war/holdFall";
import { fortOf, liveHoldWall } from "../shared/war/holdWalls";
import { holdTier } from "../shared/war/holdTiers";
import { patrolOf } from "../shared/war/patrols";
import { fellHold, isFallen, newWar, targetsOf, WAR } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { WAR_TROOPS } from "../shared/war/troops";
import { isSafeZone, SAFE_ZONE } from "../shared/map";
import { _resetWar, _setWarRole, warNow, warState } from "../server/war";
import { _resetHolds } from "../server/warHolds";
import { _resetHoldWorks } from "../server/warHoldWorks";

const PICK = (() => {
  const s = newWar();
  _resetWar({ v: 1, state: s, minds: newMinds(), next: Date.now() + 1e9, log: [] });
  for (const t of TERRITORIES) {
    const b = bannerSpot(t.id);
    if (!b || !canFall(t.id) || t.act !== 1 || !patrolOf(t.id) || isSafeZone(b.x, b.y)) continue;
    if (Math.hypot(t.cx - (SAFE_ZONE.x + SAFE_ZONE.w / 2), t.cy - (SAFE_ZONE.y + SAFE_ZONE.h / 2)) < 60) continue;
    const own = s.owner[t.id], foe = CLAN_KEYS.find((k) => k !== own && atWar(k, own) && targetsOf(s, k).includes(t.id));
    if (foe) return { t: t.id, own, foe };
  }
  throw new Error("no land for the fall tests");
})();
const LAND = TERRITORIES[PICK.t], OWN: ClanKey = PICK.own, FOE: ClanKey = PICK.foe, SPOT = bannerSpot(LAND.id)!;

test("hold works (room): works stand, soldiers come out of the barracks, the Hold falls and is claimed", async () => {
  const srv = await startRoom();
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] }); _resetHolds(); _resetHoldWorks();
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(150);
    const room: any = srv.room, id = c.sessionId, p = room.state.players.get(id);
    p.level = 30; p.hp = p.maxHp = 1_000_000; p.invulnUntil = Date.now() + 1e9; p.clan = FOE; p.renown = 0; p.lastAct = Date.now(); p.lastHurt = 0;
    p.x = SPOT.x; p.y = SPOT.y;
    const holdsTick: (now: number) => void = room.holds.tick.bind(room.holds);
    room.holds.tick = () => {};
    const chat: string[] = [];
    c.onMessage("chat", (m: any) => chat.push(m.text));
    room.state.mobs.forEach((m: any, mid: string) => { if (m.kind !== "trooper") room.state.mobs.delete(mid); });
    room.holdWorks.tick(Date.now());
    const tier = holdTier(warState()!, LAND.id), want = holdWorks(LAND.id, OWN, tier);
    const works = () => { const out: [string, any][] = []; room.state.mobs.forEach((m: any, mid: string) => { if (!m.dead && parseWork(m.weapon) && room.holdWorks.owns(mid)) out.push([mid, m]); }); return out; };
    assert.equal(works().length, want.length, "every work stands");
    assert.ok(works().every(([, m]) => parseWork(m.weapon)!.clan === OWN && m.hp > 0 && m.title));
    // only a hero the holder's soldiers fight may hurt a work
    const [bid, bm] = works().find(([, m]) => parseWork(m.weapon)!.kind === "barracks")!;
    assert.equal(room.canHurtMob(id, bm), true);
    p.clan = OWN; assert.equal(room.canHurtMob(id, bm), false); p.clan = FOE;
    // soldiers come out of the barracks door
    const door = room.holdWorks.barracks(LAND.id);
    assert.ok(door && Math.hypot(door.x - bm.x, door.y - bm.y) < 32);
    room.warTroops.tick(Date.now());
    const land = room.warTroops._land(LAND.id);
    assert.ok(land?.slots.length > 0, "the land fields soldiers");
    // wreck the barracks: no new soldier comes while it lies wrecked
    const kill = (mid: string, m: any) => { m.hp = 0; room.mobDied(m, mid, id, p.name); };
    kill(bid, bm);
    assert.equal(room.holdWorks.barracks(LAND.id), null);
    for (const s of land.slots) { const m = s.id && room.state.mobs.get(s.id); if (m) { m.dead = true; m.hp = 0; } }
    room.warTroops.tick(Date.now()); room.warTroops.tick(Date.now() + WAR_TROOPS.respawnMs + 1000);
    assert.equal(land.slots.filter((s: any) => s.id && !room.state.mobs.get(s.id)?.dead).length, 0, "no soldier comes out of a wrecked barracks");
    await wait(150);
    assert.ok(chat.some((t) => /wrecked the .* of /.test(t)), "the Herald tells the wrecker");
    room.holdWorks.tick(Date.now());
    assert.equal(works().length, want.length - 1, "the wrecked one stays down");
    // wreck the rest: the Hold falls
    const f = fortOf(LAND.id, OWN, tier)!, wall = f.walls[0];
    assert.equal(liveHoldWall(wall[0], wall[1]), true, "its walls stand");
    for (const [mid, m] of works()) kill(mid, m);
    assert.ok(isFallen(warState()!, LAND.id), "the Hold fell");
    assert.deepEqual(warNow()!.fallen, [LAND.id]);
    room.holdWalls.syncWar(warState());
    assert.equal(liveHoldWall(wall[0], wall[1]), false, "its walls are down");
    room.holdWorks.tick(Date.now()); room.warTroops.tick(Date.now());
    assert.equal(works().length, 0, "no works rise on a ruin");
    assert.equal(room.holdWorks.view().wrecked.filter((w: number[]) => w[0] === LAND.id).length, want.length, "the ruin lists every work");
    // an unsworn hero cannot claim it; a sworn one can, from any clan (here the old holder's foe)
    p.clan = undefined;
    assert.match(room.holds.sack(id, { t: LAND.id }), /sworn/);
    p.clan = FOE;
    assert.equal(room.holds.sack(id, { t: LAND.id }), "");
    const t0 = Date.now();
    for (let i = 1; i <= 20 && room.holds.count; i++) holdsTick(t0 + i * 1000);
    assert.equal(room.holds.count, 0);
    assert.equal(warState()!.owner[LAND.id], FOE, "the ruin is the claimer's clan's");
    assert.ok(!isFallen(warState()!, LAND.id));
    assert.equal(warState()!.control[LAND.id], WAR.claimControl);
    assert.ok(p.renown >= HOLD_FALL.claimRenown, "renown for the claim");
    // a new outpost with new works, and soldiers again
    room.holdWorks.tick(Date.now());
    assert.ok(works().length > 0 && works().every(([, m]) => parseWork(m.weapon)!.clan === FOE), "the new holder's works stand");
    assert.ok(room.holdWorks.barracks(LAND.id), "its barracks stands");
  } finally { await srv.stop(); _resetHoldWorks(); }
});

test("hold works (room): renown only for legal wrecks, capped per war tick; works outside the troop budget", async () => {
  const srv = await startRoom();
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] }); _resetHolds(); _resetHoldWorks();
  const cap = HOLD_FALL.wreckRenownPerTick;
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(150);
    const room: any = srv.room, id = c.sessionId, p = room.state.players.get(id);
    p.level = 30; p.hp = p.maxHp = 1_000_000; p.invulnUntil = Date.now() + 1e9; p.clan = undefined; p.renown = 0; p.lastAct = Date.now();
    p.x = SPOT.x; p.y = SPOT.y;
    room.holds.tick = () => {};
    room.state.mobs.forEach((m: any, mid: string) => { if (m.kind !== "trooper") room.state.mobs.delete(mid); });
    const before = room.warTroops.h.reserved();
    room.holdWorks.tick(Date.now());
    const works = () => { const out: [string, any][] = []; room.state.mobs.forEach((m: any, mid: string) => { if (!m.dead && parseWork(m.weapon) && room.holdWorks.owns(mid)) out.push([mid, m]); }); return out; };
    assert.ok(works().length >= 4);
    assert.equal(room.warTroops.h.reserved(), before, "standing works take no troop budget");
    const kill = (mid: string, m: any) => { m.hp = 0; room.mobDied(m, mid, id, p.name); };
    assert.equal(p.renown, 0);
    // a hero at war with the holder: paid up to the cap per war tick, then again in a new tick
    (HOLD_FALL as any).wreckRenownPerTick = 1;
    p.clan = FOE;
    const [b, bm] = works()[0]; kill(b, bm);
    const one = p.renown;
    assert.ok(one > 0, "renown for a legal wreck");
    const [c2, cm] = works()[0]; kill(c2, cm);
    assert.equal(p.renown, one, "nothing past the cap in one war tick");
    warState()!.tick++;
    room.holdWorks.tick(Date.now());
    const [d, dm] = works()[0]; kill(d, dm);
    assert.ok(p.renown > one, "a new war tick pays again");
    // the last works brought down by a sworn hero whose clan's war does not reach this land: the Hold falls, nothing is paid
    const st = warState()!, OFF = CLAN_KEYS.find((k) => k !== OWN && !(atWar(k, OWN) && targetsOf(st, k).includes(LAND.id))) ?? OWN;
    (HOLD_FALL as any).wreckRenownPerTick = cap; warState()!.tick++; room.holdWorks.tick(Date.now()); // (a fresh cap: only legality may refuse)
    p.clan = OFF; const paid = p.renown;
    assert.ok(works().length >= 1, "works left for the out-of-war hero");
    for (const [mid, m] of works()) kill(mid, m);
    assert.ok(isFallen(warState()!, LAND.id), "the Hold fell");
    assert.equal(p.renown, paid, "no fall renown for a kill the war does not count");
  } finally { (HOLD_FALL as any).wreckRenownPerTick = cap; await srv.stop(); _resetHoldWorks(); }
});

test("hold works (room, follower): the fall waits on the owner with the ruin kept, one claim is queued, no rewards", async () => {
  const srv = await startRoom();
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] }); _resetHolds(); _resetHoldWorks();
  const capF = HOLD_FALL.wreckRenownPerTick;
  try {
    const c = await srv.join({ cls: "wizard" }), c2 = await srv.join({ cls: "wizard" });
    await wait(150);
    const room: any = srv.room, id = c.sessionId, p = room.state.players.get(id), id2 = c2.sessionId, p2 = room.state.players.get(id2);
    for (const h of [p, p2]) { h.level = 30; h.hp = h.maxHp = 1_000_000; h.invulnUntil = Date.now() + 1e9; h.clan = FOE; h.renown = 0; h.lastAct = Date.now(); h.x = SPOT.x; h.y = SPOT.y; }
    const holdsTick: (now: number) => void = room.holds.tick.bind(room.holds);
    room.holds.tick = () => {};
    room.state.mobs.forEach((m: any, mid: string) => { if (m.kind !== "trooper") room.state.mobs.delete(mid); });
    room.holdWorks.tick(Date.now());
    const tier = holdTier(warState()!, LAND.id), want = holdWorks(LAND.id, OWN, tier);
    const works = () => { const out: [string, any][] = []; room.state.mobs.forEach((m: any, mid: string) => { if (!m.dead && parseWork(m.weapon) && room.holdWorks.owns(mid)) out.push([mid, m]); }); return out; };
    assert.equal(works().length, want.length);
    _setWarRole("follower");
    (HOLD_FALL as any).wreckRenownPerTick = 0; // (only the fall's own rewards are looked at here)
    for (const [mid, m] of works()) { m.hp = 0; room.mobDied(m, mid, id, p.name); }
    assert.ok(!isFallen(warState()!, LAND.id), "the follower only queued the fall");
    assert.equal(p.renown, 0, "no fall rewards on a follower");
    assert.equal(room.holdWorks.barracks(LAND.id), null, "no soldiers while the fall waits");
    room.holdWorks.tick(Date.now() + 60_000);
    assert.equal(works().length, 0, "no works rise while the fall waits");
    assert.equal(room.holdWorks.view().wrecked.filter((w: number[]) => w[0] === LAND.id).length, want.length, "the ruin is kept while the fall waits");
    // the owner's fall arrives: one claim goes out from here, the second hero is told so
    fellHold(warState()!, LAND.id);
    assert.equal(room.holds.sack(id, { t: LAND.id }), "");
    const t0 = Date.now();
    for (let i = 1; i <= 20 && room.holds.count; i++) holdsTick(t0 + i * 1000);
    assert.equal(room.holds.count, 0);
    assert.ok(isFallen(warState()!, LAND.id), "the claim waits on the owner");
    assert.equal(p.renown, 0, "no claim rewards on a follower");
    assert.match(room.holds.sack(id2, { t: LAND.id }), /banner already flies/);
  } finally { (HOLD_FALL as any).wreckRenownPerTick = capF; _setWarRole("owner"); await srv.stop(); _resetHoldWorks(); }
});
