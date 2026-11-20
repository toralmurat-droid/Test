import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, wait } from "./helpers/room";
import { TILE, WORLD_H } from "../shared/constants";
import { SAFE_ZONE } from "../shared/map";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { newWar, targetsOf, type Orders } from "../shared/war/rules";
import { atWar } from "../shared/war/feuds";
import { STANDARD } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { parseTroop, planRole, troopLevel, troopWeapon, WAR_TROOPS } from "../shared/war/troops";
import { mouthHp, TUNNEL, tunnelMouth, tunnelStrikes } from "../shared/war/tunnels";
import { _resetWar, _setWarOrders, _valorOf, step, warOrders, warState, warStrikes } from "../server/war";
import { _resetTunnels, WarTunnels } from "../server/warTunnels";

const HK: ClanKey = "hidekin";
/**
 * A tunnel target of the opening war away from Oakvale, with a clan that may not fight there: an Act 1 one if there is
 * any (since the fronts follow the border roads, 2026-11-20, the Hide-Kin no longer border Oakvale, so it is another land's).
 */
const PICK = (() => {
  const s = newWar();
  for (const act1 of [true, false]) for (const t of targetsOf(s, HK)) {
    const T = TERRITORIES[t], g = tunnelStrikes(s, { [HK]: { defend: 0.5, attack: [{ t, share: 1 }] } })[0];
    if (!g || (act1 && T.act !== 1) || T.capitalOf || Math.hypot(T.cx - (SAFE_ZONE.x + SAFE_ZONE.w / 2), T.cy - (SAFE_ZONE.y + SAFE_ZONE.h / 2)) < 60) continue;
    const outsider = CLAN_KEYS.find((k) => k !== HK && k !== s.owner[t] && !targetsOf(s, k).includes(t));
    if (outsider) return { land: T, from: g.from, def: s.owner[t], outsider };
  }
  throw new Error("no tunnel target");
})();
const LAND = PICK.land, DEF: ClanKey = PICK.def, OUT: ClanKey = PICK.outsider, MOUTH = tunnelMouth(LAND.id, PICK.from)!;
const ORDER: Orders = { defend: 0.5, attack: [{ t: LAND.id, share: 1 }] };

function tunnelWar(ordered = true) {
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });
  _setWarOrders(ordered ? { [HK]: ORDER } : undefined);
  _resetTunnels();
}
const saved = { ...TUNNEL }, savedTroops = { ...WAR_TROOPS };
const restore = () => { Object.assign(TUNNEL, saved); Object.assign(WAR_TROOPS, savedTroops); _resetTunnels(); _setWarOrders(undefined); };

async function setup(srv: Awaited<ReturnType<typeof startRoom>>, clan?: ClanKey) {
  const c = await srv.join({ cls: "wizard" });
  await wait(150);
  const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
  p.level = 30; p.hp = p.maxHp = 1_000_000; p.invulnUntil = 0; p.clan = clan; p.renown = 0; p.lastAct = Date.now();
  const sent: [string, any][] = [], bc = room.broadcast.bind(room);
  room.broadcast = (t: string, m: any, o?: any) => { sent.push([t, m]); return bc(t, m, o); };
  const at = (pt: { x: number; y: number }) => { p.x = pt.x; p.y = pt.y; };
  const tn = () => room.tunnels._tunnel(LAND.id);
  const mouth = () => { const x = tn(); return x?.mouth ? room.state.mobs.get(x.mouth) : undefined; };
  const soldiers = () => [...(tn()?.soldiers ?? [])].map((sid: string) => room.state.mobs.get(sid)).filter((m: any) => m && !m.dead);
  return { c, room, id, p, sent, at, tn, mouth, soldiers };
}

test("tunnels (room): a mouth and a wave open near a hero only while a tunnel strike is ordered", async () => {
  const srv = await startRoom();
  try {
    tunnelWar(false);
    const { room, p, at, mouth, soldiers, sent, tn } = await setup(srv, DEF);
    at(MOUTH);
    room.tunnels.tick(Date.now());
    assert.equal(tn(), undefined, "no orders (a restart before the first tick): no tunnel");
    _setWarOrders({ [HK]: ORDER });
    p.y = (WORLD_H + 20) * TILE; // underground: nothing opens
    room.tunnels.tick(Date.now());
    assert.ok(tn() && !mouth(), "ordered, but no hero near");
    at({ x: MOUTH.x + (TUNNEL.wakeTiles + 3) * TILE, y: MOUTH.y });
    room.tunnels.tick(Date.now());
    assert.equal(mouth(), undefined, "a hero just out of reach: still shut");
    at({ x: MOUTH.x + 2 * TILE, y: MOUTH.y });
    room.tunnels.tick(Date.now());
    const m = mouth(), level = troopLevel(LAND.id);
    assert.ok(m && !m.dead, "the mouth opens");
    assert.equal(m.weapon, "hidekin~");
    assert.deepEqual(parseTroop(m.weapon), { clan: HK, part: "mouth", officer: false, cart: false, object: true });
    assert.equal(m.x, MOUTH.x); assert.equal(m.y, MOUTH.y);
    assert.equal(m.maxHp, mouthHp(HK, level));
    const wave = soldiers();
    assert.equal(wave.length, TUNNEL.perWave, "a wave comes out");
    assert.ok(wave.every((s: any) => parseTroop(s.weapon)?.clan === HK && parseTroop(s.weapon)?.part === "soldier" && Math.hypot(s.x - MOUTH.x, s.y - MOUTH.y) < 2 * TILE), "Hide-Kin soldiers at the mouth");
    assert.deepEqual(wave.map((s: any) => s.weapon), [0, 1, 2].map((n) => troopWeapon(HK, false, false, false, false, planRole(HK, "tunnel", n))), "in their roles by place in the wave (ROLE_PLAN.tunnel)");
    assert.ok(sent.some(([t, v]) => t === "sfx" && v.ev === "tunnel_open" && v.x === Math.round(MOUTH.x)), "tunnel_open");
    assert.ok(sent.some(([t, v]) => t === "tunnels" && v.mouths.some((x: any) => x.t === LAND.id && x.state === "open")), "the clients hear of it");
    // the mouth never moves, whatever pushes it
    m.x += 50; room.tunnels.step(m, tn().mouth, 0.1, Date.now());
    assert.equal(m.x, MOUTH.x);
    // the next wave after waveMs, never past maxTunnelTroops
    TUNNEL.maxTunnelTroops = 1 + TUNNEL.perWave + 1;
    tn().nextWave = 0;
    room.tunnels.tick(Date.now());
    assert.equal(soldiers().length, TUNNEL.perWave + 1, "the second wave fills up to the cap");
    assert.ok(room.tunnels.count <= TUNNEL.maxTunnelTroops);
    // the order is gone: the tunnel closes
    _setWarOrders({ [HK]: { defend: 1, attack: [] } });
    room.tunnels.tick(Date.now());
    assert.equal(tn(), undefined);
    assert.equal(room.tunnels.count, 0, "its monsters go");
  } finally { restore(); await srv.stop(); }
});

test("tunnels (room): it sleeps with no hero near and keeps its wounds; one live tunnel per room", async () => {
  const srv = await startRoom();
  try {
    tunnelWar();
    const { room, at, mouth, tn } = await setup(srv, DEF);
    at(MOUTH);
    room.tunnels.tick(Date.now());
    const m = mouth();
    m.hp = Math.round(m.maxHp / 2);
    at({ x: MOUTH.x + 200 * TILE, y: MOUTH.y });
    room.tunnels.tick(Date.now());
    assert.ok(mouth(), "lingers a while");
    room.tunnels.tick(Date.now() + TUNNEL.sleepMs + 1000);
    assert.equal(mouth(), undefined, "asleep");
    assert.equal(room.tunnels.count, 0);
    at(MOUTH);
    room.tunnels.tick(Date.now());
    assert.equal(mouth().hp, Math.round(mouth().maxHp / 2), "the wounds are kept");
    assert.equal(tn().live, true);
  } finally { restore(); await srv.stop(); }
});

test("tunnels (room): only heroes hostile to the Hide-Kin hurt the mouth (no XP)", async () => {
  const srv = await startRoom();
  try {
    tunnelWar();
    const { room, id, p, at, mouth, tn } = await setup(srv);
    at(MOUTH);
    room.tunnels.tick(Date.now());
    const m = mouth(), mid = tn().mouth, hp0 = m.hp, xp0 = p.xp;
    for (const clan of [undefined, HK]) {
      p.clan = clan; at({ x: m.x + 20, y: m.y });
      room.hitTarget(id, mid, 500, [0, 0], { basic: true });
      room.hitTarget(id, mid, 500, [0, 0], { skill: true });
      assert.equal(m.hp, hp0, `${clan ?? "unsworn"}: 0 damage`);
    }
    p.clan = DEF; p.level = STANDARD.minLevel - 1;
    room.hitTarget(id, mid, 50, [0, 0], {});
    assert.equal(m.hp, hp0, "under the oath level: 0 damage");
    p.level = 30;
    for (const clan of [DEF, OUT]) {
      p.clan = clan; p.feud = {};
      if (!atWar(clan, HK)) { // since feuds (shared/war/feuds.ts) a clan not at war with the Hide-Kin needs a grudge first
        const before = m.hp;
        room.hitTarget(id, mid, 50, [0, 0], {});
        assert.equal(m.hp, before, `${clan}: not at war with the Hide-Kin, no grudge: 0 damage`);
        p.feud = { [HK]: { until: Date.now() + 60_000 } };
      }
      const h = m.hp;
      room.hitTarget(id, mid, 50, [0, 0], {});
      assert.ok(m.hp < h, `${clan}: hurts it`);
    }
    assert.equal(p.xp, xp0, "no XP");
  } finally { restore(); await srv.stop(); }
});

test("tunnels (room): a collapse pays legal valor once, renown, sfx and the Herald; shut in every room until the next war tick", async () => {
  const srv = await startRoom();
  try {
    tunnelWar();
    const { room, id, p, at, mouth, tn, sent, soldiers } = await setup(srv, DEF);
    at(MOUTH);
    room.tunnels.tick(Date.now());
    // a second room of the same process with the same tunnel open
    const mobs = new Map<string, any>(), other = new WarTunnels({
      spawn: (mid, level, x, y, weapon) => { const m = { kind: "trooper", weapon, level, x, y, homeX: x, homeY: y, hp: 1, maxHp: 1, dead: false, dir: "down", target: "" } as any; mobs.set(mid, m); return m; },
      remove: (mid) => { mobs.delete(mid); }, mob: (mid) => mobs.get(mid),
      heroes: () => room.state.players.entries(), hero: (hid) => room.state.players.get(hid),
      broadcast: () => {}, budget: () => 40,
    }, room.warTroops);
    other.tick(Date.now());
    const om = mobs.get(other._tunnel(LAND.id)!.mouth)!;
    assert.ok(om, "the other room has its copy");
    const m = mouth();
    at({ x: m.x + 20, y: m.y });
    m.hp = 1;
    room.hitTarget(id, tn().mouth, 50, [0, 0], {});
    assert.ok(m.dead, "collapsed");
    assert.equal(_valorOf(LAND.id, DEF), TUNNEL.collapseValor, "valor for the defender");
    assert.equal(_valorOf(LAND.id, HK), 0);
    assert.equal(p.renown, TUNNEL.collapseRenown, "renown for the killer");
    assert.ok(sent.some(([t, v]) => t === "sfx" && v.ev === "tunnel_collapse" && v.x === Math.round(MOUTH.x) && v.y === Math.round(MOUTH.y)));
    assert.ok(sent.some(([t, v]) => t === "chat" && v.name === "Herald" && /collapsed a tunnel/.test(v.text) && v.text.includes(LAND.name)));
    assert.ok(sent.some(([t, v]) => t === "tunnels" && v.mouths.some((x: any) => x.t === LAND.id && x.state === "shut")));
    // the soldiers fight on a moment, then go
    assert.ok(soldiers().length > 0, "soldiers stay round the rubble");
    room.tunnels.tick(Date.now() + TUNNEL.scatterMs + 1000);
    assert.equal(soldiers().length, 0, "then go back down");
    // no reopening in this war tick
    for (let i = 0; i < 3; i++) { room.tunnels.tick(Date.now()); await wait(20); }
    assert.equal(mouth(), undefined, "shut until the next war tick");
    // the other room's copy falls in too, and felling it there pays nothing more
    other.tick(Date.now());
    assert.equal(other._tunnel(LAND.id)!.mouth, "", "collapsed in the other room too");
    assert.ok(![...mobs.values()].some((x) => parseTroop(x.weapon)?.part === "mouth"), "its mouth is gone there (its soldiers scatter)");
    assert.equal(other._tunnel(LAND.id)!.shutTick, warState()!.tick);
    assert.equal(other.killed(om, "x", id), false, "nothing left to collapse there");
    assert.equal(_valorOf(LAND.id, DEF), TUNNEL.collapseValor, "paid once");
    // the next war tick: whole again
    warState()!.tick++;
    room.tunnels.tick(Date.now());
    assert.ok(mouth() && mouth().hp === mouth().maxHp, "reopens whole next war tick");
  } finally { restore(); await srv.stop(); }
});

test("tunnels (room): a clan the war keeps out of the land collapses it for renown only", async () => {
  const srv = await startRoom();
  try {
    tunnelWar();
    const { room, id, p, at, mouth, tn } = await setup(srv, OUT);
    if (!atWar(OUT, HK)) p.feud = { [HK]: { until: Date.now() + 60_000 } }; // a clan not at war with the Hide-Kin fights them on a grudge (shared/war/feuds.ts)
    at(MOUTH);
    room.tunnels.tick(Date.now());
    const m = mouth();
    at({ x: m.x + 20, y: m.y }); m.hp = 1;
    room.hitTarget(id, tn().mouth, 50, [0, 0], {});
    assert.ok(m.dead);
    for (const k of CLAN_KEYS) assert.equal(_valorOf(LAND.id, k), 0, `no valor for ${k}`);
    assert.equal(p.renown, TUNNEL.collapseRenown);
  } finally { restore(); await srv.stop(); }
});

test("tunnels (room): holding the mouth pays the Hide-Kin with an active sworn hero, capped; nothing without one", async () => {
  const srv = await startRoom();
  try {
    tunnelWar();
    const { room, p, at, tn, mouth } = await setup(srv, DEF);
    at({ x: MOUTH.x + 2 * TILE, y: MOUTH.y });
    let T = Date.now();
    room.tunnels.tick(T);
    assert.ok(mouth());
    // a rival hero by it: nothing
    tn().nextPay = 0;
    room.tunnels.tick(T);
    assert.equal(_valorOf(LAND.id, HK), 0, "a rival hero holds nothing");
    // a Hide-Kin hero, idle: nothing
    p.clan = HK; p.lastAct = T - STANDARD.idleMs - 1000;
    tn().nextPay = 0;
    room.tunnels.tick(T);
    assert.equal(_valorOf(LAND.id, HK), 0, "an idle hero holds nothing");
    // too far: nothing
    p.lastAct = T; at({ x: MOUTH.x + TUNNEL.holdPx + 2 * TILE, y: MOUTH.y });
    tn().nextPay = 0;
    room.tunnels.tick(T);
    assert.equal(_valorOf(LAND.id, HK), 0, "outside holdPx");
    // active and close: mouthValor a minute, up to maxValorPerTick
    at({ x: MOUTH.x + TILE, y: MOUTH.y });
    for (let i = 0; i < 20; i++) { T += TUNNEL.valorEveryMs; p.lastAct = T; room.tunnels.tick(T); }
    assert.equal(_valorOf(LAND.id, HK), TUNNEL.maxValorPerTick, "capped per war tick");
    // a new war tick pays again
    warState()!.tick++;
    T += TUNNEL.valorEveryMs; p.lastAct = T; room.tunnels.tick(T);
    assert.ok(_valorOf(LAND.id, HK) > TUNNEL.maxValorPerTick, "the cap is per war tick");
  } finally { restore(); await srv.stop(); }
});

test("tunnels (room): caravans, a siege and the tunnel stay within maxTroops; patrols yield", async () => {
  const srv = await startRoom();
  try {
    tunnelWar();
    const { room, at } = await setup(srv, DEF);
    WAR_TROOPS.maxTroops = 26;
    Object.defineProperty(room.caravans, "count", { get: () => 12, configurable: true });
    Object.defineProperty(room.sieges, "count", { get: () => 9, configurable: true });
    at(MOUTH);
    for (let i = 0; i < 3; i++) { room.tunnels.tick(Date.now()); room.warTroops.tick(Date.now()); await wait(50); }
    assert.ok(room.tunnels.count >= 1 && room.tunnels.count <= 26 - 12 - 9, `tunnel share ${room.tunnels.count}`);
    assert.ok(12 + 9 + room.tunnels.count + room.warTroops.count <= 26, `total ${12 + 9 + room.tunnels.count + room.warTroops.count}`);
    // the sieges grow: the tunnel's soldiers make room
    Object.defineProperty(room.sieges, "count", { get: () => 13, configurable: true });
    room.tunnels.tick(Date.now());
    assert.ok(room.tunnels.count <= 26 - 12 - 13, `trimmed to ${room.tunnels.count}`);
    // with the real caps the tunnel never passes maxTunnelTroops
    Object.assign(WAR_TROOPS, savedTroops);
    Object.defineProperty(room.caravans, "count", { get: () => 0, configurable: true });
    Object.defineProperty(room.sieges, "count", { get: () => 0, configurable: true });
    for (let i = 0; i < 6; i++) { room.tunnels._tunnel(LAND.id).nextWave = 0; room.tunnels.tick(Date.now()); }
    assert.equal(room.tunnels.count, TUNNEL.maxTunnelTroops);
    room.warTroops.tick(Date.now());
    assert.ok(room.tunnels.count + room.warTroops.count <= WAR_TROOPS.maxTroops);
  } finally { restore(); await srv.stop(); }
});

test("tunnels (war): the strikes are read on the state the war tick started from, as rules.ts feeds them", async () => {
  try {
    const state = newWar(), t0 = Date.UTC(2026, 10, 17, 20, 0); // (a fixed start: the war's day and night follow the clock, and some start hours bring no strike in 120 ticks)
    _resetWar({ v: 1, state, minds: newMinds(), next: t0, log: [] });
    let checked = 0;
    for (let i = 0; i < 120; i++) { // (on the moors map the Hide-Kin's first tunnels come after ~45 ticks)
      const before = JSON.parse(JSON.stringify(warState()));
      await step(t0 + i * 600_000);
      assert.equal(warState()!.tick, before.tick + 1);
      assert.deepEqual(warStrikes(), tunnelStrikes(before, warOrders()), `tick ${before.tick}`);
      checked += warStrikes().length;
    }
    assert.ok(checked > 0, "some ticks had tunnel strikes");
  } finally { restore(); }
});

test("tunnels (room): a mouth back after a budget squeeze keeps its wave clock and makes no new opening", async () => {
  const srv = await startRoom();
  try {
    tunnelWar();
    const { room, at, tn, mouth, soldiers, sent } = await setup(srv, DEF);
    at(MOUTH);
    room.tunnels.tick(Date.now());
    assert.ok(mouth());
    const wave = tn().nextWave, opens = () => sent.filter(([t, v]) => t === "sfx" && v.ev === "tunnel_open").length;
    assert.equal(opens(), 1);
    Object.defineProperty(room.caravans, "count", { get: () => WAR_TROOPS.maxTroops, configurable: true });
    room.tunnels.tick(Date.now());
    assert.equal(room.tunnels.count, 0, "squeezed out");
    Object.defineProperty(room.caravans, "count", { get: () => 0, configurable: true });
    room.tunnels.tick(Date.now());
    assert.ok(mouth(), "back");
    assert.equal(tn().nextWave, wave, "the wave clock is kept");
    assert.equal(soldiers().length, 0, "no wave at once");
    assert.equal(opens(), 1, "no second tunnel_open");
  } finally { restore(); await srv.stop(); }
});
