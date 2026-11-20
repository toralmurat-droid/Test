// Troop roles phase 4 in the room: a contested town's gate guard stands in its roles (ROLE_PLAN.gate: weapon, HP with
// the squad multipliers, fighter, a pike tethered to its post), pikes on the road side and archers behind them; the head
// count and the fallen posts keep their meaning. (Tunnel waves and ritual acolytes: tests/wartunnels-room.test.ts and
// tests/warrituals-room.test.ts check their weapons; here their HP and places too.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, wait } from "./helpers/room";
import { TILE } from "../shared/constants";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { RITUAL, ritualSite, ritualSpot, ritualTime } from "../shared/war/rituals";
import { newWar } from "../shared/war/rules";
import { gatePx, onTownGround, TOWN, townById, townPatron } from "../shared/war/towns";
import { gateGuardPosts } from "../shared/war/troopRoles";
import { planRole, ROLE_FORM, squadMod, troopStats, troopWeapon, WAR_TROOPS } from "../shared/war/troops";
import { tunnelMouth, tunnelStrikes, TUNNEL } from "../shared/war/tunnels";
import { targetsOf } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { SAFE_ZONE } from "../shared/map";
import { _resetWar, _setTown, _setWarOrders, warState } from "../server/war";
import { _resetTowns } from "../server/warTowns";
import { _resetRituals } from "../server/warRituals";
import { _resetTunnels } from "../server/warTunnels";

const TOWN_ = townById("saltmere")!, GATE = gatePx(TOWN_), P = townPatron("saltmere");
const HOLDER: ClanKey = "wardens"; // (longbows and pikes: both roles at the gate)

test("gate guards (room): the captain on the gate, pikes in front, archers behind, in their roles; fallen posts stay down", async () => {
  const srv = await startRoom();
  try {
    _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] }); _resetTowns();
    const st = warState()!, foe = CLAN_KEYS.find((k) => k !== HOLDER)!;
    st.owner[P] = foe; _setTown("saltmere", { k: HOLDER, c: { by: foe, until: st.tick + 3, ext: 0 } });
    const c = await srv.join({ cls: "wizard" });
    await wait(150);
    const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
    p.level = 30; p.hp = p.maxHp = 1_000_000; p.invulnUntil = Date.now() + 1e9; p.clan = foe; p.lastAct = Date.now(); p.lastHurt = 0;
    p.x = GATE.x; p.y = GATE.y;
    const tick: (now: number) => void = room.towns.tick.bind(room.towns);
    room.towns.tick = () => {}; room.warTroops.tick = () => {};
    room.state.mobs.forEach((_m: any, mid: string) => room.state.mobs.delete(mid));
    tick(Date.now());
    const ids: string[] = room.towns._guards("saltmere");
    assert.equal(ids.length, TOWN.captain + TOWN.guards, "the same head count");
    const posts = gateGuardPosts(TOWN_, HOLDER), seen = new Set<string>();
    for (const gid of ids) {
      const m = room.state.mobs.get(gid), gd = room.towns.guards.get(gid), i = gd.post, officer = i === 0;
      const role = officer ? "foot" : planRole(HOLDER, "gate", i), mod = squadMod("gate", role);
      assert.equal(gd.role, role, `post ${i}`);
      assert.equal(m.weapon, troopWeapon(HOLDER, officer, false, false, false, role));
      assert.equal(m.maxHp, troopStats(HOLDER, m.level, officer, role, mod).hp, `post ${i}: HP in its role`);
      assert.deepEqual(gd.mod, mod);
      assert.equal(!!gd.g.post, role !== "foot", "a role guard is tethered to its post (a pike)");
      assert.ok(Math.hypot(m.x - posts[i].x, m.y - posts[i].y) < 1, `post ${i} where gateGuardPosts puts it`);
      assert.ok(!onTownGround(m.x, m.y));
      seen.add(role);
    }
    assert.deepEqual([...seen].sort(), ["archer", "foot", "pike"]);
    // its turn with nothing to fight: back to its role's post (an archer a step behind its ring spot)
    const archer = ids.find((gid) => room.towns.guards.get(gid).role === "archer")!, am = room.state.mobs.get(archer), ag = room.towns.guards.get(archer);
    am.x += 20; am.y += 20; p.x = GATE.x + 20 * TILE; // (a hero near enough to see it, too far to fight)
    for (let n = 0; n < 40; n++) room.towns.step(am, archer, 0.05, Date.now());
    assert.ok(Math.hypot(am.x - posts[ag.post].x, am.y - posts[ag.post].y) < 3, "the archer walks back to its post behind the pikes");
    // a fallen pike's post stays empty until the next war tick, and the others keep theirs
    const pike = ids.find((gid) => room.towns.guards.get(gid).role === "pike")!, pm = room.state.mobs.get(pike), pp = room.towns.guards.get(pike).post;
    pm.dead = true; pm.hp = 0;
    tick(Date.now());
    const after = room.towns._guards("saltmere").map((gid: string) => room.towns.guards.get(gid).post);
    assert.equal(after.length, TOWN.captain + TOWN.guards - 1);
    assert.ok(!after.includes(pp), "the fallen pike's post is not refilled");
    assert.equal(room.towns.guardsDue("saltmere"), TOWN.captain + TOWN.guards - 1);
    await c.leave();
  } finally { await srv.stop(); }
});

test("ritual acolytes (room): HP in their roles, the archer inside the circle", async () => {
  const srv = await startRoom();
  const saved = { ...RITUAL };
  try {
    _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] }); _resetRituals();
    const site = ritualSite(newWar())!, spot = ritualSpot(site.t)!;
    let noon = Date.now(); while (ritualTime(noon)) noon += 10_000; while (!ritualTime(noon)) noon += 10_000;
    const c = await srv.join({ cls: "wizard" });
    await wait(150);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    p.level = 30; p.hp = p.maxHp = 1_000_000; p.lastAct = noon;
    const tick: (now: number) => void = room.rituals.tick.bind(room.rituals);
    room.rituals.tick = () => {};
    p.x = spot.x + 10 * TILE; p.y = spot.y;
    tick(noon);
    const r = room.rituals._ritual, ids: string[] = r.slots.map((s: any) => s.id);
    assert.equal(ids.filter(Boolean).length, RITUAL.acolytes);
    ids.forEach((aid, i) => {
      const m = room.state.mobs.get(aid), role = planRole(RITUAL.clan, "ritual", i), d = Math.hypot(m.x - spot.x, m.y - spot.y);
      assert.equal(m.maxHp, troopStats(RITUAL.clan, r.level, false, role, squadMod("ritual", role)).hp, `acolyte ${i} (${role})`);
      if (role === "archer") assert.ok(Math.abs(d - (RITUAL.postPx - ROLE_FORM.archerBack)) < 1, `the archer inside the ring (${d.toFixed(1)} px)`);
      else assert.ok(d < 1 || Math.abs(d - RITUAL.postPx) < 1, `acolyte ${i} on the circle`);
    });
    await c.leave();
  } finally { Object.assign(RITUAL, saved); _resetRituals(); await srv.stop(); }
});

test("tunnel waves (room): each wave in its roles by place, HP with the squad multipliers, a pike tethered by the mouth", async () => {
  const HK: ClanKey = "hidekin", s0 = newWar();
  // an Act 1 target if there is any; since the fronts follow the border roads (2026-11-20) the Hide-Kin no longer border
  // Oakvale, so another land's (as tests/wartunnels-room.test.ts): the waves and their roles are the same in every land
  const pick = (() => {
    for (const act1 of [true, false]) for (const t of targetsOf(s0, HK)) {
      const T = TERRITORIES[t], g = tunnelStrikes(s0, { [HK]: { defend: 0.5, attack: [{ t, share: 1 }] } })[0];
      if (g && (!act1 || T.act === 1) && !T.capitalOf && Math.hypot(T.cx - (SAFE_ZONE.x + SAFE_ZONE.w / 2), T.cy - (SAFE_ZONE.y + SAFE_ZONE.h / 2)) >= 60) return { t, from: g.from };
    }
    throw new Error("no tunnel target");
  })();
  const srv = await startRoom();
  const saved = { ...TUNNEL }, savedTroops = { ...WAR_TROOPS };
  try {
    _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });
    _setWarOrders({ [HK]: { defend: 0.5, attack: [{ t: pick.t, share: 1 }] } }); _resetTunnels();
    const c = await srv.join({ cls: "wizard" });
    await wait(150);
    const room = srv.room, p = room.state.players.get(c.sessionId), mouth = tunnelMouth(pick.t, pick.from)!;
    p.level = 30; p.hp = p.maxHp = 1_000_000; p.x = mouth.x + 2 * TILE; p.y = mouth.y;
    room.tunnels.tick(Date.now());
    const tn = room.tunnels._tunnel(pick.t), ids = [...tn.soldiers] as string[];
    assert.equal(ids.length, TUNNEL.perWave);
    ids.forEach((sid, n) => {
      const m = room.state.mobs.get(sid), role = planRole(HK, "tunnel", n), o = room.tunnels.mobs.get(sid);
      assert.equal(m.weapon, troopWeapon(HK, false, false, false, false, role));
      assert.equal(m.maxHp, troopStats(HK, tn.level, false, role, squadMod("tunnel", role)).hp, `place ${n} (${role})`);
      assert.equal(o.f.role, role);
      assert.equal(!!o.g?.post, role !== "foot", "a role soldier has its own ground (a pike's tether)");
    });
    await c.leave();
  } finally { Object.assign(TUNNEL, saved); Object.assign(WAR_TROOPS, savedTroops); _resetTunnels(); _setWarOrders(undefined); await srv.stop(); }
});
