import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, wait } from "./helpers/room";
import { MOB_ATTACK_RANGE, TILE } from "../shared/constants";
import { isSolidAt, SAFE_ZONE } from "../shared/map";
import { blocked } from "../shared/movement";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { atWar } from "../shared/war/feuds";
import { newMinds } from "../shared/war/doctrine";
import { garrisonSpots, patrolOf, TROOP } from "../shared/war/patrols";
import { newWar, targetsOf } from "../shared/war/rules";
import { SIEGE_BATTLE, siegeFronts } from "../shared/war/siege";
import { TERRITORIES } from "../shared/war/territories";
import { bowRange, shotClear, wallPosts } from "../shared/war/troopRoles";
import { parseTroop, planRole, ROLE_FORM, TROOP_ROLE, troopStats, troopWeapon, WAR_TROOPS } from "../shared/war/troops";
import { _resetWar, warState } from "../server/war";

const open = (x: number, y: number) => !blocked(x, y) && !isSolidAt(x, y - 4);
const farFromTown = (t: { cx: number; cy: number }) => Math.hypot(t.cx - (SAFE_ZONE.x + SAFE_ZONE.w / 2), t.cy - (SAFE_ZONE.y + SAFE_ZONE.h / 2)) > 60;

// ---- sieges ----------------------------------------------------------------------------------------------------

/** An Act 1 land away from Oakvale with three fronts and a rival next door that may attack it (as tests/warsiege-room.test.ts). */
const SIEGE = (() => {
  const s = newWar();
  for (const t of TERRITORIES) {
    if (t.act !== 1 || t.capitalOf || !patrolOf(t.id) || siegeFronts(t.id).length < 3 || !farFromTown(t)) continue;
    const atk = CLAN_KEYS.find((k) => k !== s.owner[t.id] && targetsOf(s, k).includes(t.id));
    if (atk) return { land: t, atk, def: s.owner[t.id] as ClanKey };
  }
  throw new Error("no land to besiege");
})();

test("sieges (room): each front's places stand in their roles by side (ROLE_PLAN.siege): weapon, HP, fighter; archers behind the line, riders out on its flank", async () => {
  const srv = await startRoom();
  const state = newWar();
  state.siege[SIEGE.land.id] = { by: SIEGE.atk, at: state.tick + 6 };
  state.control[SIEGE.land.id] = 100; // (a full defence: every place of the plan is filled where the cap allows)
  _resetWar({ v: 1, state, minds: newMinds(), next: Date.now() + 1e9, log: [] });
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(150);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    p.level = 30; p.hp = p.maxHp = 1e6; p.clan = undefined;
    const gate = siegeFronts(SIEGE.land.id).find((f) => f.gate)!;
    p.x = gate.x; p.y = gate.y;
    room.sieges.tick(Date.now());
    const s = room.sieges._siege(SIEGE.land.id);
    assert.ok(s?.live, "the siege is live");
    const seen = new Set<string>();
    let n = 0;
    for (const [id, tr] of room.sieges.troops as Map<string, any>) {
      const m = room.state.mobs.get(id), sl = tr.slot, fr = s.fronts[sl.front], officer = fr.gate && sl.i === 0, clan = sl.side === "atk" ? SIEGE.atk : SIEGE.def;
      const role = officer ? "foot" : planRole(clan, sl.side === "atk" ? "siegeAtk" : "siegeDef", sl.i);
      assert.equal(tr.role, role, `${sl.side} front ${sl.front} place ${sl.i}`);
      assert.equal(m.weapon, troopWeapon(clan, officer, false, false, false, role));
      assert.equal(m.maxHp, troopStats(clan, m.level, officer, role).hp);
      assert.equal(!!tr.g.post, role !== "foot", "a role soldier is tethered to its place (a pike)");
      seen.add(`${sl.side}:${role}`); n++;
    }
    assert.ok(n > 0, "troops fielded");
    assert.ok([...seen].some((k) => !k.endsWith(":foot")), `roles in the field (${[...seen].join(", ")})`);
    // the formation at each front: an archer's place deeper behind the line than a foot soldier's; a rider's farther out
    let checked = 0;
    for (const side of ["atk", "def"] as const) for (let fi = 0; fi < s.fronts.length; fi++) {
      const fr = s.fronts[fi], sd = side === "atk" ? 1 : -1, ax = s.axis;
      const slots = [...s.slots.values()].filter((sl: any) => sl.side === side && sl.front === fi);
      const place = (sl: any) => { sl.post = undefined; const q = room.sieges.postOf(s, sl); return { depth: (q.x - fr.x) * ax.x * sd + (q.y - fr.y) * ax.y * sd, lat: Math.abs(-(q.x - fr.x) * ax.y + (q.y - fr.y) * ax.x) }; };
      const roleOf = (sl: any) => (fr.gate && sl.i === 0 ? "foot" : planRole(side === "atk" ? SIEGE.atk : SIEGE.def, side === "atk" ? "siegeAtk" : "siegeDef", sl.i));
      for (const sl of slots) {
        const q = place(sl), r = roleOf(sl);
        if (Math.abs(q.depth) < 1 && q.lat < 1) continue; // (blocked ground: the front itself, as before the roles)
        if (r === "archer") { assert.ok(q.depth >= SIEGE_BATTLE.depthPx + ROLE_FORM.archerBack - 1, `an archer behind the line (${q.depth.toFixed(0)} px)`); checked++; }
        if (r === "foot" || r === "pike") assert.ok(Math.abs(q.depth - SIEGE_BATTLE.depthPx) < 1, "foot and pikes on the line");
        if (r === "rider") { assert.ok(q.lat > Math.abs((sl.i - (SIEGE_BATTLE.perFront - 1) / 2) * SIEGE_BATTLE.spacingPx) + ROLE_FORM.riderWide - 1, "a rider out on the flank"); checked++; }
      }
    }
    assert.ok(checked > 0, "some archers or riders placed");
    await c.leave();
  } finally { await srv.stop(); }
});

// ---- the give-up rule (Hold guards) -------------------------------------------------------------------------

/** An Act 1 land with room for a fortress's guards, held by a clan with archers and pikes whose fortress has courtyard archers (as tests/troopRiders-room.test.ts). */
const HOLD = TERRITORIES.find((t) => {
  const own = newWar().owner[t.id] as ClanKey;
  return patrolOf(t.id) && garrisonSpots(t.id, 8, 2).length >= 8 && t.act === 1 && !t.capitalOf && ["wardens", "host"].includes(own) && farFromTown(t) && wallPosts(t.id, own, 2).length >= 2;
})!;

async function holdSetup(srv: Awaited<ReturnType<typeof startRoom>>) {
  const s = newWar();
  for (const n of HOLD.near) s.owner[n] = s.owner[HOLD.id];
  s.fort[HOLD.id] = 0.7;
  _resetWar({ v: 1, state: s, minds: newMinds(), next: Date.now() + 1e9, log: [] });
  const c = await srv.join({ cls: "wizard" });
  await wait(150);
  const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
  p.level = 30; p.hp = p.maxHp = 100_000; p.invulnUntil = 0;
  const gate = patrolOf(HOLD.id)!.pts[0];
  p.x = gate.x; p.y = gate.y;
  room.holdWalls.syncWar(warState());
  room.warTroops.tick(Date.now());
  room.state.mobs.forEach((m: any, mid: string) => { if (m.kind !== "trooper") room.state.mobs.delete(mid); });
  const owner = warState()!.owner[HOLD.id] as ClanKey, foe = CLAN_KEYS.find((k) => k !== owner && atWar(k, owner))!;
  const guard = (role: string, perched?: boolean): [string, any, any] => {
    for (const sl of room.warTroops._land(HOLD.id).slots) {
      const m = sl.id && room.state.mobs.get(sl.id);
      if (sl.role === "guard" && m && (parseTroop(m.weapon)?.role ?? "foot") === role && (perched === undefined || room.warTroops.perched(sl.id) === perched)) return [sl.id, m, room.warTroops.troops.get(sl.id)];
    }
    throw new Error(`no ${role} guard`);
  };
  return { c, room, id, p, owner, foe, guard };
}
/** A rival soldier nobody runs (the patrols would take it for a stray): `${clan}` at (x, y). */
function rival(room: any, id: string, clan: ClanKey, x: number, y: number, level: number) {
  room.spawnMob("trooper", -1, id, { x, y, level });
  const o = room.state.mobs.get(id);
  o.weapon = clan; o.hp = o.maxHp = 1e6;
  return o;
}

test("give-up (room): a courtyard archer whose hero stays beyond its wall bow for giveUp.ms drops them and turns to another foe; it doesn't pick them again for shunMs", async () => {
  const srv = await startRoom();
  try {
    const { c, room, id, p, foe, guard } = await holdSetup(srv);
    const [aid, a, tr] = guard("archer", true), W = bowRange(true), G = TROOP_ROLE.giveUp;
    assert.equal(W.range, TROOP_ROLE.ranged.wall.range);
    p.clan = foe;
    // the hero beyond the wall bow (inside its sight), a rival soldier in bow range with a clear line
    const dirs = Array.from({ length: 32 }, (_, k) => [Math.cos((k * Math.PI) / 16), Math.sin((k * Math.PI) / 16)]);
    const dir = dirs.find(([ux, uy]) => shotClear(a.x, a.y, a.x + ux * (W.range - 30), a.y + uy * (W.range - 30)) && open(a.x + ux * (W.range - 30), a.y + uy * (W.range - 30)))!;
    assert.ok(dir, "a clear line from the wall");
    const hx = a.x + dir[0] * (W.range + 15), hy = a.y + dir[1] * (W.range + 15);
    const step = room.warTroops.step.bind(room.warTroops), now0 = Date.now();
    room.warTroops.step = () => {}; // (the turns below are driven by hand, at chosen times)
    p.x = hx; p.y = hy;
    a.target = id; tr.nextPick = now0 + 1e9; tr.outOf = ""; a.windUntil = 0; tr.aimUntil = 0;
    room.warTroops.fight(a, aid, tr, tr.g, 0.05, now0);
    assert.equal(a.target, id, "out of its bow: it holds on a while");
    room.warTroops.fight(a, aid, tr, tr.g, 0.05, now0 + G.ms - 50);
    assert.equal(a.target, id);
    room.warTroops.fight(a, aid, tr, tr.g, 0.05, now0 + G.ms + 50);
    assert.equal(a.target, "", "out of reach for giveUp.ms: dropped");
    assert.equal(tr.shun, id);
    // it picks another foe: a rival soldier in bow range; never the shunned hero while the shun lasts
    const o = rival(room, "rival1", foe, a.x + dir[0] * (W.range - 30), a.y + dir[1] * (W.range - 30), a.level);
    assert.ok(o);
    assert.equal(room.warTroops.pick(a, aid, tr, tr.g, now0 + G.ms + 100), "rival1", "another foe");
    room.state.mobs.delete("rival1");
    assert.equal(room.warTroops.pick(a, aid, tr, tr.g, now0 + G.ms + 100), "", "not the shunned hero");
    assert.equal(room.warTroops.pick(a, aid, tr, tr.g, now0 + G.ms + 60 + G.shunMs), id, "after shunMs it sees them again");
    // in range, it keeps its target (no give-up while it can shoot)
    p.x = a.x + dir[0] * (W.range - 30); p.y = a.y + dir[1] * (W.range - 30);
    a.target = id; tr.shun = ""; tr.outOf = "";
    for (const t of [0, G.ms, 2 * G.ms]) room.warTroops.fight(a, aid, tr, tr.g, 0.05, now0 + 3 * G.ms + t);
    assert.equal(a.target, id, "in bow range: it keeps shooting");
    room.warTroops.step = step;
    await c.leave();
  } finally { await srv.stop(); }
});

test("give-up (room): a guard pike drops a hero out of its reach after giveUp.ms and never picks one beyond its tether; a foot guard is unchanged", async () => {
  const srv = await startRoom();
  try {
    const { c, room, id, p, foe, guard } = await holdSetup(srv);
    const [kid, k, tr] = guard("pike"), G = TROOP_ROLE.giveUp, now0 = Date.now();
    room.warTroops.step = () => {};
    p.clan = foe;
    const post = tr.g.post(now0), reach = MOB_ATTACK_RANGE + WAR_TROOPS.heroBody + TROOP_ROLE.pike.reach + WAR_TROOPS.swingSlack;
    // a hero within the pike's tether but out of its reach; the pike can't step (dt 0)
    const dirs = Array.from({ length: 16 }, (_, i) => [Math.cos((i * Math.PI) / 8), Math.sin((i * Math.PI) / 8)]);
    const [ux, uy] = dirs.find(([x, y]) => open(k.x + x * (reach + 20), k.y + y * (reach + 20)))!;
    p.x = k.x + ux * (reach + 20); p.y = k.y + uy * (reach + 20);
    k.target = id; tr.nextPick = now0 + 1e9; k.windUntil = 0;
    room.warTroops.fight(k, kid, tr, tr.g, 0, now0);
    room.warTroops.fight(k, kid, tr, tr.g, 0, now0 + G.ms - 50);
    assert.equal(k.target, id, "a while out of reach: it holds on");
    room.warTroops.fight(k, kid, tr, tr.g, 0, now0 + G.ms + 50);
    assert.equal(k.target, "", "out of reach for giveUp.ms: dropped");
    assert.equal(tr.shun, id);
    // beyond its tether (but in its sight): never picked
    tr.shun = "";
    const far = TROOP_ROLE.pike.tetherTiles * TILE + MOB_ATTACK_RANGE + TROOP_ROLE.pike.reach + WAR_TROOPS.heroBody + 12;
    k.x = post.x; k.y = post.y; k.hateId = ""; k.hate = 0;
    const d2 = dirs.find(([x, y]) => open(post.x + x * far, post.y + y * far) && far < WAR_TROOPS.aggroPx);
    if (d2) {
      p.x = post.x + d2[0] * far; p.y = post.y + d2[1] * far;
      assert.equal(room.warTroops.pick(k, kid, tr, tr.g, now0 + 3 * G.ms), "", "beyond its tether: not picked");
      p.x = post.x + d2[0] * (far - 30); p.y = post.y + d2[1] * (far - 30);
      assert.equal(room.warTroops.pick(k, kid, tr, tr.g, now0 + 3 * G.ms), id, "within it: picked");
    }
    // a foot guard holds on to its target out of reach (the rule is for courtyard archers and guard pikes only)
    const [fid, f, ftr] = guard("foot");
    p.x = f.x + 120; p.y = f.y;
    f.target = id; ftr.nextPick = now0 + 1e9;
    for (const t of [0, G.ms, 2 * G.ms]) room.warTroops.fight(f, fid, ftr, ftr.g, 0, now0 + t);
    assert.ok(f.target === id || f.target === "", "the foot guard's turn as before");
    assert.equal(ftr.shun, "", "never shuns");
    await c.leave();
  } finally { await srv.stop(); }
});

test("troop roles (room): another module's role soldier is known to the pikes' brace (WarTroops' fighter lookup), and swept once it is gone", async () => {
  const srv = await startRoom();
  const state = newWar();
  state.siege[SIEGE.land.id] = { by: SIEGE.atk, at: state.tick + 6 };
  _resetWar({ v: 1, state, minds: newMinds(), next: Date.now() + 1e9, log: [] });
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(150);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    p.level = 30; p.hp = p.maxHp = 1e6; p.clan = undefined;
    const gate = siegeFronts(SIEGE.land.id).find((f) => f.gate)!;
    p.x = gate.x; p.y = gate.y;
    room.sieges.tick(Date.now());
    const roles = [...(room.sieges.troops as Map<string, any>)].filter(([, tr]) => tr.role !== "foot");
    assert.ok(roles.length > 0, "role soldiers at the siege");
    await wait(300); // (their turns run)
    const [rid, rtr] = roles[0];
    assert.equal(room.warTroops.roleCtx.fighter(rid), rtr, "found by id");
    room.state.mobs.delete(rid);
    room.warTroops.tick(Date.now());
    assert.equal(room.warTroops.others.has(rid), false, "swept once gone");
    await c.leave();
  } finally { await srv.stop(); }
});
