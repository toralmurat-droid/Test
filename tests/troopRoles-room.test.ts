import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, until, wait } from "./helpers/room";
import { TILE } from "../shared/constants";
import { isSolidAt, SAFE_ZONE } from "../shared/map";
import { blocked } from "../shared/movement";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { atWar } from "../shared/war/feuds";
import { newMinds } from "../shared/war/doctrine";
import { garrisonSpots, patrolOf, TROOP } from "../shared/war/patrols";
import { newWar } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { bowOf, roleVs } from "../shared/war/troopRoles";
import { parseTroop, TROOP_ROLE, troopStats, WAR_TROOPS } from "../shared/war/troops";
import { _resetWar, warState } from "../server/war";

/** An Act 1 land with a patrol and guard posts away from Oakvale, held by a clan that fields archers and pikes. */
const LAND = TERRITORIES.find((t) => patrolOf(t.id) && garrisonSpots(t.id, TROOP.garrisonMax).length >= 4 && t.act === 1 && !t.capitalOf
  && Math.hypot(t.cx - (SAFE_ZONE.x + SAFE_ZONE.w / 2), t.cy - (SAFE_ZONE.y + SAFE_ZONE.h / 2)) > 60 && ["wardens", "host"].includes(newWar().owner[t.id]))!;
/** A new war, LAND's Hold a camp (its guards: officer, archer, pike, archer, foot, pike). */
const freshWar = () => { const s = newWar(); s.fort[LAND.id] = 0.3; _resetWar({ v: 1, state: s, minds: newMinds(), next: Date.now() + 1e9, log: [] }); };

const landTroops = (room: any): [string, any][] =>
  (room.warTroops._land(LAND.id)?.slots ?? []).filter((s: any) => s.id && room.state.mobs.has(s.id)).map((s: any) => [s.id, room.state.mobs.get(s.id)]);
/** A guard of LAND of this role (still at its post: the land just woke). */
const guard = (room: any, role: string): [string, any, { x: number; y: number }] => {
  const spots = garrisonSpots(LAND.id, TROOP.garrisonMax);
  for (const s of room.warTroops._land(LAND.id).slots) {
    const m = s.id && room.state.mobs.get(s.id);
    if (s.role === "guard" && m && (parseTroop(m.weapon)?.role ?? "foot") === role) return [s.id, m, spots[s.i]];
  }
  throw new Error(`no ${role} guard`);
};
/** A unit direction from (x, y) with open ground (no wall, no solid) for `d` px. */
const openDir = (x: number, y: number, d: number): [number, number] => {
  for (let a = 0; a < 16; a++) {
    const ux = Math.cos((a * Math.PI) / 8), uy = Math.sin((a * Math.PI) / 8);
    if (Array.from({ length: Math.ceil(d / 4) + 1 }, (_, k) => k * 4).every((s) => !blocked(x + ux * s, y + uy * s) && !isSolidAt(x + ux * s, y + uy * s - 4))) return [ux, uy];
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
  room.warTroops.tick(Date.now());
  room.state.mobs.forEach((m: any, mid: string) => { if (m.kind !== "trooper") room.state.mobs.delete(mid); }); // only the troops
  const owner = warState()!.owner[LAND.id] as ClanKey, foe = CLAN_KEYS.find((k) => k !== owner && atWar(k, owner))!;
  return { c, room, id, p, owner, foe };
}

test("troop roles (room): an archer shoots an enemy-sworn hero from range with its clan's shot, never a neutral one", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { c, room, id, p, owner, foe } = await setup(srv);
    const [aid, a] = guard(room, "archer");
    assert.equal(a.maxHp, troopStats(owner, a.level, false, "archer").hp, "an archer's HP");
    const shots: { kind: string; speed: number; dist: number }[] = [], ms = room.mobShot.bind(room);
    room.mobShot = (m: any, mid: string, tx: number, ty: number, cfg?: any) => { if (mid === aid) shots.push({ kind: cfg?.shot, speed: cfg?.shotSpeed, dist: Math.hypot(tx - m.x, ty - m.y) }); return ms(m, mid, tx, ty, cfg); };
    const [ux, uy] = openDir(a.x, a.y, 140);
    const stand = () => { p.x = a.x + ux * 130; p.y = a.y + uy * 130; };
    p.clan = undefined; stand();
    for (let i = 0; i < 30; i++) { stand(); await wait(100); }
    assert.equal(shots.length, 0, "an unsworn hero is never shot");
    assert.equal(a.target, "");
    p.clan = foe;
    assert.ok(await until(() => { stand(); return shots.length > 0; }, 8000), "the enemy-sworn hero is shot");
    const bow = bowOf(owner);
    assert.equal(shots[0].kind, bow.shot); assert.equal(shots[0].speed, bow.speed);
    assert.ok(shots[0].dist > TROOP_ROLE.ranged.keepAway, `from range (${Math.round(shots[0].dist)} px)`);
    let hit = false; // the projectile only hurts the heroes the clan fights, and it reaches this one
    const dp = room.damagePlayer.bind(room);
    room.damagePlayer = (tid: string, dmg: number, by: string, push: any, kb: number, o: any = {}) => { if (tid === id && o.troop === owner && /longbowman|bone archer|slinger|sun-caster/.test(by)) hit = true; return dp(tid, dmg, by, push, kb, o); };
    assert.ok(await until(() => { stand(); return hit; }, 8000), "the shot lands, in the archer's name");
    await c.leave();
  } finally { await srv.stop(); }
});

test("troop roles (room): an archer steps back from a foe at arm's length, a guard no farther than its tether", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { c, room, p, foe } = await setup(srv);
    const [, a, post] = guard(room, "archer");
    const [ux, uy] = openDir(a.x, a.y, 2 * TILE + 10);
    p.clan = foe;
    const hx = a.x - ux * 40, hy = a.y - uy * 40, d0 = Math.hypot(a.x - hx, a.y - hy);
    let far = 0;
    for (let i = 0; i < 40; i++) { p.x = hx; p.y = hy; far = Math.max(far, Math.hypot(a.x - post.x, a.y - post.y)); await wait(50); }
    const d1 = Math.hypot(a.x - hx, a.y - hy);
    assert.ok(d1 > d0 + 12, `it backed off (${Math.round(d0)} -> ${Math.round(d1)} px)`);
    assert.ok(far <= TROOP_ROLE.ranged.guardTetherTiles * TILE + 8, `a guard stays by its post (${Math.round(far)} px)`);
    await c.leave();
  } finally { await srv.stop(); }
});

test("troop roles (room): an archer's shot at another clan's pike lands after its flight with the counter (roleVs), and the clients get a troop_shot", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { c, room, p, owner, foe } = await setup(srv);
    p.clan = undefined; // neutral: the archer has only the rival trooper to shoot
    const [aid, a] = guard(room, "archer");
    const [ux, uy] = openDir(a.x, a.y, 130);
    // a rival pike, not run by any module (the patrols would take it for a stray and remove it)
    const pid = "rivalpike";
    room.spawnMob("trooper", -1, pid, { x: a.x + ux * 120, y: a.y + uy * 120, level: a.level });
    const pk = room.state.mobs.get(pid);
    pk.weapon = `${foe}|`; pk.hp = pk.maxHp = 1e6;
    const step = room.warTroops.step.bind(room.warTroops);
    room.warTroops.step = (m: any, mid: string, dt: number, now: number) => (mid === pid ? undefined : step(m, mid, dt, now));
    const sent: any[] = [], hits: number[] = [], bc = room.broadcast.bind(room), mhm = room.mobHitsMob.bind(room);
    room.broadcast = (t: string, m: any, o?: any) => { if (t === "sfx" && m?.ev === "troop_shot") sent.push(m); return bc(t, m, o); };
    room.mobHitsMob = (m: any, mid: string, o: any, tid: string, dmg: number) => { if (mid === aid && tid === pid) hits.push(dmg); return mhm(m, mid, o, tid, dmg); };
    const pin = () => { pk.x = a.x + ux * 120; pk.y = a.y + uy * 120; };
    assert.ok(await until(() => { pin(); return hits.length > 0; }, 10000), "the shot lands on the pike");
    assert.ok(sent.some((e) => e.id === aid && e.to === pid && e.kind === bowOf(owner).shot && e.ms > 0), "troop_shot for the clients");
    const st = troopStats(owner, a.level, false, "archer"), want = Math.round(st.shot! * roleVs("archer", "pike")) * room.battles.dmgMult(aid, pid);
    assert.equal(hits[0], want, `archer x${roleVs("archer", "pike")} on a pike`);
    await c.leave();
  } finally { await srv.stop(); }
});

test("troop roles (room): the foot soldier is unchanged (no mark, its HP, the javelin), pikes keep their place", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { c, room, p, owner, foe } = await setup(srv);
    const [oid, o] = guard(room, "foot"); // the officer
    assert.equal(o.weapon, `${owner}*`);
    assert.equal(o.maxHp, troopStats(owner, o.level, true).hp);
    const [, pk, ppost] = guard(room, "pike");
    assert.equal(pk.weapon, `${owner}|`); assert.equal(pk.maxHp, troopStats(owner, pk.level, false, "pike").hp);
    const shots: any[] = [], ms = room.mobShot.bind(room);
    room.mobShot = (m: any, mid: string, tx: number, ty: number, cfg?: any) => { if (mid === oid) shots.push(cfg); return ms(m, mid, tx, ty, cfg); };
    const [ux, uy] = openDir(o.x, o.y, 110);
    p.clan = foe;
    let far = 0;
    const ox = o.x, oy = o.y;
    assert.ok(await until(() => { p.x = ox + ux * 100; p.y = oy + uy * 100; far = Math.max(far, Math.hypot(pk.x - ppost.x, pk.y - ppost.y)); return shots.length > 0; }, 10000), "the officer throws its javelin");
    const J = WAR_TROOPS.javelin;
    assert.deepEqual(shots[0], { keepAway: 0, far: 0, range: J.max, shot: "arrow", shotSpeed: J.speed, shotRadius: J.radius }, "the javelin as before");
    // the hero far off the pike's post: it does not follow past its tether
    for (let i = 0; i < 30; i++) { p.x = ppost.x + 8 * TILE; p.y = ppost.y; far = Math.max(far, Math.hypot(pk.x - ppost.x, pk.y - ppost.y)); await wait(50); }
    assert.ok(far <= TROOP_ROLE.pike.tetherTiles * TILE + 8, `a pike keeps within its tether (${Math.round(far)} px)`);
    await c.leave();
  } finally { await srv.stop(); }
});
