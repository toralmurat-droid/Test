// A Hold guard pike struck by a ranged hero beyond its tether (TROOP_ROLE.pike.call) in the room: through the room's hit
// path it calls its nearest squad mates onto the hero (they pick them from beyond their usual sight); with no mate left it
// sallies past its tether for call.ms, then holds its post again. Turns are driven by hand at chosen times.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, wait } from "./helpers/room";
import { MOB_ATTACK_RANGE, TILE } from "../shared/constants";
import { isSolidAt, SAFE_ZONE } from "../shared/map";
import { blocked } from "../shared/movement";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { atWar } from "../shared/war/feuds";
import { newMinds } from "../shared/war/doctrine";
import { fortDetour } from "../shared/war/holdRoutes";
import { garrisonSpots, patrolOf } from "../shared/war/patrols";
import { newWar } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { called } from "../shared/war/troopRoles";
import { parseTroop, TROOP_ROLE, WAR_TROOPS } from "../shared/war/troops";
import { _resetWar, warState } from "../server/war";

const open = (x: number, y: number) => !blocked(x, y) && !isSolidAt(x, y - 4);
const farFromTown = (t: { cx: number; cy: number }) => Math.hypot(t.cx - (SAFE_ZONE.x + SAFE_ZONE.w / 2), t.cy - (SAFE_ZONE.y + SAFE_ZONE.h / 2)) > 60;
/** An Act 1 land with room for a fortress's guards, held by a clan with pikes (as tests/troopRoles-phase3-room.test.ts). */
const HOLD = TERRITORIES.find((t) => {
  const own = newWar().owner[t.id] as ClanKey;
  return patrolOf(t.id) && garrisonSpots(t.id, 8, 2).length >= 8 && t.act === 1 && !t.capitalOf && ["wardens", "host"].includes(own) && farFromTown(t);
})!;
const C = TROOP_ROLE.pike.call, LIM = TROOP_ROLE.pike.tetherTiles * TILE;
const HOLDS = LIM + MOB_ATTACK_RANGE + TROOP_ROLE.pike.reach + WAR_TROOPS.heroBody; // (pikeHolds: from its post)

test("pike call (room): a guard pike shot from beyond its tether calls its mates onto the hero; alone, it sallies for call.ms", async () => {
  const srv = await startRoom();
  try {
    const s = newWar();
    for (const n of HOLD.near) s.owner[n] = s.owner[HOLD.id];
    s.fort[HOLD.id] = 0.7;
    _resetWar({ v: 1, state: s, minds: newMinds(), next: Date.now() + 1e9, log: [] });
    const c = await srv.join({ cls: "wizard" });
    await wait(150);
    const room = srv.room, id = c.sessionId, p = room.state.players.get(id), wt = room.warTroops;
    p.level = 30; p.hp = p.maxHp = 100_000; p.invulnUntil = Date.now() + 1e9;
    const gate = patrolOf(HOLD.id)!.pts[0];
    p.x = gate.x; p.y = gate.y;
    room.holdWalls.syncWar(warState());
    wt.tick(Date.now());
    wt.step = () => {}; wt.tick = () => {}; // (the turns below are driven by hand)
    room.state.mobs.forEach((m: any, mid: string) => { if (m.kind !== "trooper") room.state.mobs.delete(mid); });
    const owner = warState()!.owner[HOLD.id] as ClanKey;
    p.clan = CLAN_KEYS.find((k) => k !== owner && atWar(k, owner))!;
    const guards: [string, any, any][] = wt._land(HOLD.id).slots.filter((sl: any) => sl.role === "guard" && sl.id && room.state.mobs.get(sl.id)).map((sl: any) => [sl.id, room.state.mobs.get(sl.id), wt.troops.get(sl.id)]);
    const [kid, k, tr] = guards.find(([, m]) => parseTroop(m.weapon)?.role === "pike")!;
    const now0 = Date.now(), post = tr.g.post(now0);
    k.x = k.homeX = post.x; k.y = k.homeY = post.y; k.target = "";
    // the hero beyond the pike's tether, a Wizard's shot (170 px) from it, on open ground in its land
    const dirs = Array.from({ length: 32 }, (_, i) => [Math.cos((i * Math.PI) / 16), Math.sin((i * Math.PI) / 16)]);
    const D = 170, straight = (x: number, y: number) => { const to = fortDetour(post.x + x * (LIM - 2), post.y + y * (LIM - 2), post.x + x * D, post.y + y * D); return to.x === post.x + x * D && to.y === post.y + y * D; }; // (no wall to walk round)
    const [ux, uy] = dirs.find(([x, y]) => [40, 90, LIM - 2, LIM + 10, LIM + 30, D].every((r) => open(post.x + x * r, post.y + y * r)) && tr.g.leash(post.x + x * D, post.y + y * D) && straight(x, y))!;
    assert.ok(D > HOLDS, "a Wizard's reach is beyond what a pike can answer from its post");
    p.x = post.x + ux * D; p.y = post.y + uy * D;
    assert.equal(wt.pick(k, kid, tr, tr.g, now0), "", "beyond its tether: the pike never picks them by itself");
    // mates: two soldiers of its squad standing near the pike, everyone else gone
    const mates = guards.filter(([gid, m]) => gid !== kid && parseTroop(m.weapon)?.role !== "pike" && !wt.perched(gid)).slice(0, 2);
    assert.equal(mates.length, 2, "two guards that can answer");
    room.state.mobs.forEach((_m: any, mid: string) => { if (mid !== kid && !mates.some(([gid]) => gid === mid)) room.state.mobs.delete(mid); }); // (the column and the other guards: none of them answers)
    mates.forEach(([, m], i) => { m.x = m.homeX = post.x - ux * (30 + 20 * i); m.y = m.homeY = post.y - uy * (30 + 20 * i); m.target = ""; });
    // the hero's shot lands on the pike (the room's hit path)
    room.hitTarget(id, kid, 1, [0, 0]);
    assert.equal(k.target, id, "it turns on them");
    for (const [gid, , f] of mates) {
      assert.ok(called(f, id, Date.now()), `${gid}: called onto the hero`);
      const m = room.state.mobs.get(gid), d = Math.hypot(p.x - m.x, p.y - m.y);
      assert.ok(d > WAR_TROOPS.aggroPx * (f.role === "archer" ? 1.25 : 1), "beyond its usual sight");
      assert.equal(wt.pick(m, gid, f, f.g, Date.now()), id, `${gid}: picks the hero`);
    }
    assert.ok(!called(tr, id, Date.now()), "its mates answered: the pike holds its post");
    // the pike's own turn: the hero stays beyond its tether, so it drops them (as before) and keeps its place
    wt.fight(k, kid, tr, tr.g, 0.1, Date.now());
    assert.equal(k.target, "", "no sally while its mates answer");
    // alone (its mates fell): a hit sallies the pike; it runs the hero down past its tether
    for (const [gid] of mates) room.state.mobs.delete(gid);
    const t1 = Date.now() + C.everyMs;
    k.x = k.homeX = post.x + ux * (LIM - 2); k.y = k.homeY = post.y + uy * (LIM - 2);
    wt.hit(id, k, kid, t1);
    assert.ok(called(tr, id, t1), "no one to call: it sallies");
    assert.equal(wt.pick(k, kid, tr, tr.g, t1), id, "it picks the hero beyond its tether");
    tr.nextThrow = tr.nextRush = t1 + 1e9; k.windUntil = 0; k.lastAttack = t1; // (no javelin, no rush: a plain walk)
    for (let n = 0; n < 4; n++) wt.fight(k, kid, tr, tr.g, 0.1, t1 + n * 100);
    assert.equal(k.target, id);
    assert.ok(Math.hypot(k.x - post.x, k.y - post.y) > LIM + 1, "past its tether toward the hero");
    // the sally ends after call.ms: the hero beyond its tether is dropped again
    wt.fight(k, kid, tr, tr.g, 0.1, t1 + C.ms + 1);
    assert.equal(k.target, "", "back to holding its post");
    await c.leave();
  } finally { await srv.stop(); }
});
