import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, until, wait } from "./helpers/room";
import { TILE } from "../shared/constants";
import { isSolidAt, SAFE_ZONE } from "../shared/map";
import { blocked } from "../shared/movement";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { atWar } from "../shared/war/feuds";
import { newMinds } from "../shared/war/doctrine";
import { fortOf, liveHoldWall } from "../shared/war/holdWalls";
import { garrisonSpots, patrolOf, TROOP } from "../shared/war/patrols";
import { newWar } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { roleVs, shotClear, wallPost, wallPosts } from "../shared/war/troopRoles";
import { parseTroop, TROOP_ROLE, troopStats } from "../shared/war/troops";
import { _resetWar, warState } from "../server/war";

/** An Act 1 land away from Oakvale with room for a fortress's 8 guards, held by a clan whose fortress has two courtyard archers. */
const LAND = TERRITORIES.find((t) => {
  const own = newWar().owner[t.id] as ClanKey;
  return patrolOf(t.id) && garrisonSpots(t.id, 8, 2).length >= 8 && t.act === 1 && !t.capitalOf && ["wardens", "host"].includes(own)
    && Math.hypot(t.cx - (SAFE_ZONE.x + SAFE_ZONE.w / 2), t.cy - (SAFE_ZONE.y + SAFE_ZONE.h / 2)) > 60 && wallPosts(t.id, own, 2).length >= 2;
})!;
/** A new war with LAND's Hold a fortress (its neighbours held by the same clan: no front, so the fortress stands). */
const freshWar = () => {
  const s = newWar();
  for (const n of LAND.near) s.owner[n] = s.owner[LAND.id];
  s.fort[LAND.id] = 0.7;
  _resetWar({ v: 1, state: s, minds: newMinds(), next: Date.now() + 1e9, log: [] });
};

/** Guard of LAND with this role (and `perched` or not): [id, mob, slot]. */
const guard = (room: any, role: string, perched?: boolean): [string, any, any] => {
  for (const s of room.warTroops._land(LAND.id).slots) {
    const m = s.id && room.state.mobs.get(s.id);
    if (s.role === "guard" && m && (parseTroop(m.weapon)?.role ?? "foot") === role && (perched === undefined || room.warTroops.perched(s.id) === perched)) return [s.id, m, s];
  }
  throw new Error(`no ${role} guard`);
};
const open = (x: number, y: number) => !blocked(x, y) && !isSolidAt(x, y - 4);
/** A unit direction from (x, y) with open ground for `d` px. */
const openDir = (x: number, y: number, d: number): [number, number] => {
  for (let a = 0; a < 32; a++) {
    const ux = Math.cos((a * Math.PI) / 16), uy = Math.sin((a * Math.PI) / 16);
    if (Array.from({ length: Math.ceil(d / 4) + 1 }, (_, k) => k * 4).every((s) => open(x + ux * s, y + uy * s))) return [ux, uy];
  }
  throw new Error("no open ground");
};

async function setup(srv: Awaited<ReturnType<typeof startRoom>>) {
  const c = await srv.join({ cls: "wizard" });
  await wait(150);
  const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
  p.level = 30; p.hp = p.maxHp = 100_000; p.invulnUntil = 0;
  const gate = patrolOf(LAND.id)!.pts[0];
  p.x = gate.x; p.y = gate.y;
  room.holdWalls.syncWar(warState());
  room.warTroops.tick(Date.now());
  room.state.mobs.forEach((m: any, mid: string) => { if (m.kind !== "trooper") room.state.mobs.delete(mid); }); // only the troops
  const owner = warState()!.owner[LAND.id] as ClanKey, foe = CLAN_KEYS.find((k) => k !== owner && atWar(k, owner))!;
  return { c, room, id, p, owner, foe };
}

/** Rider `rid` gets a run-up on (x, y): the rest of the garrison is put out of the way (they would crowd the lane). */
const clearLane = (room: any, rid: string) => {
  for (const s of room.warTroops._land(LAND.id).slots) if (s.id && s.id !== rid && room.state.mobs.get(s.id)) { const m = room.state.mobs.get(s.id); m.stunUntil = Date.now() + 60_000; }
};

test("troop riders (room): a charge winds up, lands its bonus blow with a knockback and a stagger, then cools down", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { c, room, id, p, owner, foe } = await setup(srv);
    const [rid, r] = guard(room, "rider");
    assert.equal(r.weapon, `${owner}>`); assert.equal(r.maxHp, troopStats(owner, r.level, false, "rider").hp);
    clearLane(room, rid);
    const C = TROOP_ROLE.rider.charge, st = troopStats(owner, r.level, false, "rider");
    const [ux, uy] = openDir(r.x, r.y, 150), hx = r.x + ux * 140, hy = r.y + uy * 140;
    const hits: { dmg: number; kb: number; stun?: number; at: number }[] = [], charges: any[] = [];
    const dp = room.damagePlayer.bind(room), bc = room.broadcast.bind(room);
    room.damagePlayer = (tid: string, dmg: number, by: string, push: any, kb: number, o: any = {}) => { if (tid === id && o.from === rid) hits.push({ dmg, kb, stun: o.stunMs, at: Date.now() }); return dp(tid, dmg, by, push, kb, o); };
    room.broadcast = (t: string, m: any, o?: any) => { if (t === "sfx" && m?.ev === "troop_charge" && m.id === rid) charges.push({ ...m, at: Date.now() }); return bc(t, m, o); };
    p.clan = foe;
    const pin = () => { p.x = hx; p.y = hy; p.invulnUntil = 0; };
    assert.ok(await until(() => { pin(); return hits.length > 0; }, 10000), "the charge lands");
    assert.ok(charges.length >= 1 && charges[0].to === id && charges[0].ms === C.windupMs, "the wind-up went out to the clients (troop_charge with its lane)");
    assert.ok(hits[0].at - charges[0].at >= C.windupMs - 60, "after the wind-up");
    assert.deepEqual([hits[0].dmg, hits[0].kb, hits[0].stun], [Math.round(st.dmg * C.dmgMult), C.kb, C.stunMs], "the charge's blow: bonus damage, knockback, stagger");
    const ch = room.warTroops.troops.get(rid).charge;
    assert.ok(ch.next >= hits[0].at + C.everyMs - 200, "then it cools");
    // for the rest of the cooldown: no second charge (blows on foot only, at a foot soldier's damage)
    for (let i = 0; i < 40; i++) { pin(); await wait(50); }
    assert.equal(charges.length, 1, "no second charge while cooling");
    assert.ok(hits.slice(1).every((h) => h.dmg === st.dmg && h.kb === 1 && !h.stun), "only plain blows");
    await c.leave();
  } finally { await srv.stop(); }
});

test("troop riders (room): a hero who steps out of the lane during the wind-up is not hit by the charge", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { c, room, id, p, foe } = await setup(srv);
    const [rid, r] = guard(room, "rider");
    clearLane(room, rid);
    const C = TROOP_ROLE.rider.charge;
    const [ux, uy] = openDir(r.x, r.y, 150), hx = r.x + ux * 140, hy = r.y + uy * 140;
    // a spot 3 tiles to the side of where the hero stands
    const side = Array.from({ length: 48 }, (_, k) => ({ x: hx + Math.cos((k * Math.PI) / 24) * 96, y: hy + Math.sin((k * Math.PI) / 24) * 96 }))
      .find((q) => open(q.x, q.y) && Math.abs((q.x - r.x) * -uy + (q.y - r.y) * ux) > 64)!; // (well off the lane)
    assert.ok(side, "room to step aside");
    const hits: number[] = [];
    let wound = 0;
    const dp = room.damagePlayer.bind(room), bc = room.broadcast.bind(room);
    room.damagePlayer = (tid: string, dmg: number, by: string, push: any, kb: number, o: any = {}) => { if (tid === id && o.from === rid && kb === C.kb) hits.push(dmg); return dp(tid, dmg, by, push, kb, o); };
    room.broadcast = (t: string, m: any, o?: any) => { if (t === "sfx" && m?.ev === "troop_charge" && m.id === rid) wound = Date.now(); return bc(t, m, o); };
    p.clan = foe;
    assert.ok(await until(() => { if (!wound) { p.x = hx; p.y = hy; } return wound > 0; }, 10000), "the rider winds up");
    p.x = side.x; p.y = side.y; // the hero reads the wind-up and steps aside
    const end = wound + C.windupMs + C.gallopMs + 200;
    while (Date.now() < end) { p.x = side.x; p.y = side.y; await wait(40); }
    assert.equal(hits.length, 0, "the gallop missed");
    await c.leave();
  } finally { await srv.stop(); }
});

test("troop riders (room): a pike facing the charge braces and stops it (the pike's counter blow, the rider staggered)", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { c, room, p, owner, foe } = await setup(srv);
    p.clan = undefined; // neutral: the rider has only the rival pike to fight
    const [rid, r] = guard(room, "rider");
    clearLane(room, rid);
    const [ux, uy] = openDir(r.x, r.y, 150);
    const pid = "rivalpike";
    room.spawnMob("trooper", -1, pid, { x: r.x + ux * 140, y: r.y + uy * 140, level: r.level });
    const pk = room.state.mobs.get(pid);
    pk.weapon = `${foe}|`; pk.hp = pk.maxHp = 1e6;
    const step = room.warTroops.step.bind(room.warTroops);
    room.warTroops.step = (m: any, mid: string, dt: number, now: number) => (mid === pid ? undefined : step(m, mid, dt, now));
    const px = r.x + ux * 140, py = r.y + uy * 140;
    const pin = () => { pk.x = px; pk.y = py; pk.dir = Math.abs(ux) > Math.abs(uy) ? (ux > 0 ? "left" : "right") : (uy > 0 ? "up" : "down"); }; // it faces the rider
    const C = TROOP_ROLE.rider.charge, st = troopStats(owner, r.level, false, "rider");
    const braces: any[] = [], fromRider: number[] = [], fromPike: number[] = [];
    const bc = room.broadcast.bind(room), mhm = room.mobHitsMob.bind(room);
    room.broadcast = (t: string, m: any, o?: any) => { if (t === "sfx" && m?.ev === "troop_brace") braces.push(m); return bc(t, m, o); };
    room.mobHitsMob = (m: any, mid: string, o: any, tid: string, dmg: number) => { if (mid === rid && tid === pid) fromRider.push(dmg); if (mid === pid && tid === rid) fromPike.push(dmg); return mhm(m, mid, o, tid, dmg); };
    r.hp = r.maxHp = 1e6;
    assert.ok(await until(() => { pin(); return braces.length > 0; }, 10000), "the pike braces");
    assert.equal(braces[0].id, pid); assert.equal(braces[0].to, rid);
    assert.ok(r.stunUntil > Date.now() - 200, "the rider is thrown off its stride");
    assert.ok(pk.winding, "the brace shows (winding)");
    assert.ok(!fromRider.includes(Math.round(st.dmg * C.dmgMult)), "the charge's blow never landed");
    const want = Math.round(troopStats(foe, pk.level, false, "pike").dmg * roleVs("pike", "rider") * TROOP_ROLE.pike.brace.dmgMult) * room.battles.dmgMult(pid, rid);
    assert.equal(fromPike[0], want, "the pike's counter blow (x vs.pike.rider)");
    assert.ok(room.warTroops.troops.get(rid).charge.next > Date.now(), "the charge cools");
    await c.leave();
  } finally { await srv.stop(); }
});

test("courtyard archers (room): they stand on the fort's wall, stay there, and shoot an enemy hero outside", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { c, room, p, owner, foe } = await setup(srv);
    const [aid, a, slot] = guard(room, "archer", true);
    const post = wallPost(LAND.id, owner, 2, slot.i)!;
    assert.ok(post, "a wall post for its place");
    assert.deepEqual([a.x, a.y], [post.x, post.y], "on its post");
    assert.ok(liveHoldWall(Math.floor(a.x / TILE), Math.floor(a.y / TILE)), "which is a live wall");
    // the hero outside the fort, in bow range: out from the fort's middle through the archer's post
    const f = fortOf(LAND.id, owner, 2)!, mx = (f.cx + 0.5) * TILE, my = (f.cy + 0.5) * TILE;
    const d0 = Math.hypot(post.x - mx, post.y - my), ox = (post.x - mx) / d0, oy = (post.y - my) / d0;
    let spot: { x: number; y: number } | undefined;
    for (let k = 3; k <= 4 && !spot; k++) for (let a2 = -6; a2 <= 6 && !spot; a2++) {
      const ang = Math.atan2(oy, ox) + a2 * 0.12, q = { x: post.x + Math.cos(ang) * k * TILE, y: post.y + Math.sin(ang) * k * TILE };
      if (open(q.x, q.y) && Math.hypot(q.x - mx, q.y - my) > d0 + 2 * TILE) spot = q;
    }
    assert.ok(spot, "open ground outside");
    const shots: number[] = [], ms = room.mobShot.bind(room);
    room.mobShot = (m: any, mid: string, tx: number, ty: number, cfg?: any) => { if (mid === aid) shots.push(Date.now()); return ms(m, mid, tx, ty, cfg); };
    p.clan = foe;
    let moved = 0;
    assert.ok(await until(() => { p.x = spot!.x; p.y = spot!.y; p.invulnUntil = 0; if (a.x !== post.x || a.y !== post.y) moved++; return shots.length >= 2; }, 12000), "it shoots the enemy hero outside");
    for (let i = 0; i < 25; i++) { p.x = spot!.x; p.y = spot!.y; if (a.x !== post.x || a.y !== post.y) moved++; await wait(50); } // (the wall sweep runs every second)
    assert.equal(moved, 0, "it never leaves its post (no kiting off the wall, the wall sweep leaves it)");
    await c.leave();
  } finally { await srv.stop(); }
});

test("courtyard archers (room): a shot at a monster behind a wall is not released; one in the open is", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { c, room } = await setup(srv);
    const [aid, a] = guard(room, "archer", true);
    const tr = room.warTroops.troops.get(aid), R = TROOP_ROLE.ranged;
    // a spot in bow range with a wall in the way, and one with a clear line
    let hid: { x: number; y: number } | undefined, clear: { x: number; y: number } | undefined;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const q = { x: a.x + dx * TILE, y: a.y + dy * TILE }, d = Math.hypot(q.x - a.x, q.y - a.y);
      if (d < 2 * TILE || d > R.range - 10 || !open(q.x, q.y)) continue;
      if (!hid && !shotClear(a.x, a.y, q.x, q.y)) hid = q;
      if (!clear && shotClear(a.x, a.y, q.x, q.y)) clear = q;
    }
    assert.ok(hid && clear, "both spots");
    const sent: any[] = [], bc = room.broadcast.bind(room);
    room.broadcast = (t: string, m: any, o?: any) => { if (t === "sfx" && m?.ev === "troop_shot" && m.id === aid) sent.push(m); return bc(t, m, o); };
    const loose = (q: { x: number; y: number }, mid: string) => { // (synchronous: the room's loop can't run in between)
      room.spawnMob("slime", -1, mid, { x: q.x, y: q.y, level: a.level });
      const now = Date.now(), n0 = room.warTroops.arrows.size;
      a.target = mid; tr.aimUntil = now - 1; a.windUntil = 0; tr.nextPick = now + 1e4;
      room.warTroops.fight(a, aid, tr, tr.g, 0.05, now);
      const n = room.warTroops.arrows.size - n0;
      room.state.mobs.delete(mid);
      return n;
    };
    assert.equal(loose(hid!, "behindwall"), 0, "behind the wall: no shot");
    assert.equal(sent.length, 0, "and no troop_shot");
    assert.equal(loose(clear!, "inopen"), 1, "in the open: the shot leaves");
    assert.equal(sent.length, 1);
    await c.leave();
  } finally { await srv.stop(); }
});

test("archer shots (room): a shot at a monster that reaches the safe squares before it lands does no harm", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { c, room } = await setup(srv);
    const hit: string[] = [];
    const mhm = room.mobHitsMob.bind(room);
    room.mobHitsMob = (m: any, mid: string, o: any, tid: string, dmg: number) => { hit.push(tid); return mhm(m, mid, o, tid, dmg); };
    const [aid] = guard(room, "archer", false);
    room.spawnMob("slime", -1, "safe1", { x: SAFE_ZONE.x * TILE + 64, y: SAFE_ZONE.y * TILE + 64, level: 5 });
    room.spawnMob("slime", -1, "out1", { x: patrolOf(LAND.id)!.pts[0].x, y: patrolOf(LAND.id)!.pts[0].y, level: 5 });
    room.state.mobs.get("safe1").hp = room.state.mobs.get("out1").hp = 1e6;
    const now = Date.now();
    room.warTroops.arrows.add(aid, "safe1", 5, now - 1); room.warTroops.arrows.add(aid, "out1", 5, now - 1);
    room.warTroops.frame(now);
    assert.deepEqual(hit, ["out1"], "only the one off the safe squares is hit");
    assert.equal(room.warTroops.arrows.size, 0);
    await c.leave();
  } finally { await srv.stop(); }
});
