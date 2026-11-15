import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, until, wait } from "./helpers/room";
import { TILE } from "../shared/constants";
import { SAFE_ZONE } from "../shared/map";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { atWar, borderPairs, FEUD, killPoints, pairOf, snapPts, utcDay, wantedTier } from "../shared/war/feuds";
import { garrisonSpots, patrolOf, TROOP } from "../shared/war/patrols";
import { newWar } from "../shared/war/rules";
import { HOLDS } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { parseTroop, WAR_TROOPS } from "../shared/war/troops";
import { _resetWar, _valorOf, warState } from "../server/war";

/** An Act 1 land with a patrol and guard posts, away from Oakvale, whose holder borders some clans and not others. */
const W0 = newWar(), B0 = borderPairs(W0.owner);
const LAND = TERRITORIES.find((t) => CLAN_KEYS.some((k) => k !== W0.owner[t.id] && !B0.has(pairOf(k, W0.owner[t.id]))) && patrolOf(t.id) && garrisonSpots(t.id, TROOP.garrisonMax).length >= 4 && t.act === 1 && !t.capitalOf
  && HOLDS.some((h) => h.t === t.id) && Math.hypot(t.cx - (SAFE_ZONE.x + SAFE_ZONE.w / 2), t.cy - (SAFE_ZONE.y + SAFE_ZONE.h / 2)) > 60)!;
const freshWar = () => _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });

const landTroops = (room: any): [string, any][] =>
  (room.warTroops._land(LAND.id)?.slots ?? []).filter((s: any) => s.id && room.state.mobs.has(s.id)).map((s: any) => [s.id, room.state.mobs.get(s.id)]);

async function setup(srv: Awaited<ReturnType<typeof startRoom>>, opts: Record<string, unknown> = {}) {
  const c = await srv.join({ cls: "wizard", ...opts });
  await wait(150);
  const room = srv.room, id = c.sessionId, p = room.state.players.get(id);
  p.level = 30; p.hp = p.maxHp = 1_000_000; p.invulnUntil = 0; p.clan = undefined; p.renown = 0; p.feud = {};
  const gate = patrolOf(LAND.id)!.pts[0];
  p.x = gate.x; p.y = gate.y;
  room.warTroops.tick(Date.now());
  room.state.mobs.forEach((m: any, mid: string) => { if (m.kind !== "trooper") room.state.mobs.delete(mid); });
  const got: [string, any][] = [];
  for (const t of ["feud", "wanted", "chat"]) c.onMessage(t, (m: any) => got.push([t, m]));
  return { c, room, id, p, got };
}
const OWNER = () => warState()!.owner[LAND.id] as ClanKey;
/** A living soldier of LAND (not an officer), and the hero put right next to it. */
function soldier(room: any): [string, any] {
  return landTroops(room).find(([, m]) => !m.dead && parseTroop(m.weapon)?.part === "soldier")!;
}

test("feuds (room): an unsworn hero can't hurt a neutral trooper until they provoke; provoke is checked; the party shares the grudge; then blows land and the troops chase", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { c, room, id, p, got } = await setup(srv);
    const mate = await setup(srv);
    const owner = OWNER(), [mid, m] = soldier(room), hp0 = m.hp;
    const at = (x: number, y: number) => { p.x = x; p.y = y; };
    at(m.x + 20, m.y);
    room.hitTarget(id, mid, 50, [0, 0], { basic: true });
    assert.equal(m.hp, hp0, "neutral: 0 damage");
    // too far
    at(m.x + 20 * TILE, m.y);
    c.send("provoke", { id: mid });
    assert.ok(await until(() => got.some(([t, v]) => t === "feud" && /Too far/.test(v.err ?? ""))), "too far: told why");
    assert.deepEqual(p.feud, {}, "no grudge from 20 tiles");
    // on the safe square
    at((SAFE_ZONE.x + SAFE_ZONE.w / 2) * TILE, (SAFE_ZONE.y + SAFE_ZONE.h / 2) * TILE);
    assert.match(room.feuds.provoke(id, { id: mid }), /safe ground/);
    assert.deepEqual(p.feud, {});
    // junk
    at(m.x + 20, m.y);
    for (const junk of [null, 5, "x", {}, { id: 5 }, { id: "nope" }, { hold: "x" }, { hold: 1.5 }, { hold: 9999 }, { id: "x".repeat(100) }])
      room.feuds.provoke(id, junk);
    assert.deepEqual(p.feud, {}, "junk: no grudge");
    assert.match(room.feuds.provoke(id, { id: "nope" }), /nothing of a clan/);
    // under the oath level
    p.level = 4;
    assert.match(room.feuds.provoke(id, { id: mid }), /level/);
    p.level = 30;
    // a party: the grudge is shared
    p.party = mate.p.party = "fparty";
    const t0 = Date.now();
    c.send("provoke", { id: mid });
    assert.ok(await until(() => (p.feud[owner]?.until ?? 0) > 0), "provoked");
    assert.ok(Math.abs(p.feud[owner].until - (t0 + FEUD.grudgeMs)) < 2000);
    assert.ok((mate.p.feud[owner]?.until ?? 0) > Date.now(), "the party shares it");
    assert.ok(await until(() => got.some(([t, v]) => t === "feud" && v.c?.[owner]?.g > 0)), "the client is told");
    assert.ok(got.some(([t, v]) => t === "chat" && /their soldiers will fight you/.test(v.text)));
    // now the blows land and the troops answer
    room.hitTarget(id, mid, 50, [0, 0], { basic: true });
    assert.ok(m.hp < hp0, "after provoke: the blow lands");
    assert.ok(await until(() => landTroops(room).some(([, t]) => t.target === id), 4000), "the troops chase");
    // each blow keeps the grudge going (at most once a second)
    p.feud[owner].until = Date.now() + 1000;
    room.hitTarget(id, mid, 1, [0, 0], { basic: true });
    assert.ok(p.feud[owner].until > Date.now() + FEUD.grudgeMs - 2000, "a blow extends it");
    // the Hold: provoking another clan's Hold from beside it
    const hold = HOLDS.find((h) => h.t === LAND.id)!;
    p.feud = {};
    at(hold.x + 20 * TILE, hold.y);
    assert.match(room.feuds.provoke(id, { hold: LAND.id }), /Too far/);
    at(hold.x + 5 * TILE, hold.y);
    assert.equal(room.feuds.provoke(id, { hold: LAND.id }), "");
    assert.ok(p.feud[owner]?.until > Date.now(), "provoking its Hold is a grudge with the holder");
    // own clan: refused
    p.clan = owner; p.feud = {}; at(m.x + 20, m.y);
    assert.match(room.feuds.provoke(id, { id: mid }), /own clan/);
    assert.deepEqual(p.feud, {});
  } finally { await srv.stop(); }
});

test("feuds (room): a sworn hero is ignored by a clan their clan doesn't border and attacked by one at war", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { room, id, p } = await setup(srv);
    const owner = OWNER(), peace = CLAN_KEYS.find((k) => k !== owner && !atWar(k, owner)), war = CLAN_KEYS.find((k) => k !== owner && atWar(k, owner))!;
    assert.ok(peace, `the holder ${owner} borders every clan`);
    const [mid, m] = soldier(room), hp0 = m.hp;
    p.clan = peace; p.x = m.x + 20; p.y = m.y;
    await wait(1500);
    assert.ok(!landTroops(room).some(([, t]) => t.target === id), `${peace} hero: left alone by ${owner}`);
    room.hitTarget(id, mid, 50, [0, 0], { basic: true });
    assert.equal(m.hp, hp0, "and can't hurt them");
    p.clan = war;
    assert.ok(await until(() => landTroops(room).some(([, t]) => t.target === id), 4000), `${war} hero: attacked`);
    room.hitTarget(id, mid, 50, [0, 0], { basic: true });
    assert.ok(m.hp < hp0);
  } finally { await srv.stop(); }
});

test("feuds (room): kills raise Wanted (marks for everyone, wanted_up), a Wanted hero is seen from farther, and Hunted sends one squad of manhunters", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { room, id, p, got } = await setup(srv);
    const other = await setup(srv);
    const owner = OWNER(), sent: [string, any][] = [], bc = room.broadcast.bind(room);
    room.broadcast = (t: string, msg: any, o?: any) => { sent.push([t, msg]); return bc(t, msg, o); };
    { const [sid, sm] = soldier(room); p.x = sm.x + 20; p.y = sm.y; assert.equal(room.feuds.provoke(id, { id: sid }), "", "provoked"); }
    let kills = 0;
    while (wantedTier(p.feud, owner, Date.now()) < 1 && kills < 10) {
      const [mid, m] = soldier(room) ?? landTroops(room).find(([, t]) => !t.dead && !parseTroop(t.weapon)!.object)!;
      p.x = m.x + 20; p.y = m.y; m.hp = 1;
      room.hitTarget(id, mid, 50, [0, 0], { basic: true });
      assert.ok(m.dead, "killed");
      kills++;
    }
    assert.equal(wantedTier(p.feud, owner, Date.now()), 1, "Wanted");
    assert.ok(kills <= FEUD.tiers[0], `Wanted after ${kills} kills`);
    assert.ok(sent.some(([t, v]) => t === "sfx" && v.ev === "wanted_up" && v.id === id && v.clan === owner));
    room.feuds.tick(Date.now());
    assert.ok(await until(() => other.got.some(([t, v]) => t === "wanted" && v.w?.[id]?.some((x: any) => x[0] === owner && x[1] === 1))), "the others see the mark");
    // seen from farther: a guard picks a Wanted hero 1.5x its sight away, not one with only a grudge
    const [gid, g] = landTroops(room).find(([, t]) => !t.dead && parseTroop(t.weapon)!.part !== "cart")!, tr = room.warTroops.troops.get(gid);
    const R = WAR_TROOPS.aggroPx * 1.5;
    p.x = g.x + R; p.y = g.y; g.hateId = ""; g.hate = 0;
    assert.equal(room.warTroops.pick(g, gid, tr, tr.g, Date.now()), id, "Wanted: seen at 1.5x sight");
    const keep = p.feud[owner].pts;
    p.feud[owner].pts = 0;
    p.feud[owner].until = Date.now() + 60_000;
    assert.notEqual(room.warTroops.pick(g, gid, tr, tr.g, Date.now()), id, "a grudge only: not that far");
    // Hunted: one squad from the Hold, at most one per hero
    p.feud[owner].pts = Math.max(keep, FEUD.tiers[1]); p.feud[owner].at = Date.now();
    const gate = patrolOf(LAND.id)!.pts[0];
    p.x = gate.x + 6 * TILE; p.y = gate.y;
    room.feuds.tick(Date.now());
    assert.equal(room.feuds._squads.length, 1, "a squad marches");
    const sq = room.feuds._squads[0];
    assert.equal(sq.ids.length, 1 + FEUD.hunt.soldiers[2], "a captain and three");
    const hunters = sq.ids.map((h: string) => room.state.mobs.get(h));
    assert.ok(hunters.every((h: any) => h && h.kind === "trooper" && parseTroop(h.weapon)!.clan === owner && /manhunter/.test(h.title)));
    assert.ok(parseTroop(hunters[0].weapon)!.officer, "led by a captain");
    room.feuds.tick(Date.now());
    assert.equal(room.feuds._squads.length, 1, "no second squad for the same hero");
    assert.ok(sent.some(([t, v]) => t === "chat" && /manhunters march/.test(v.text)));
    assert.ok(await until(() => got.some(([t, v]) => t === "chat" && /send manhunters after you/.test(v.text))), "the quarry is warned");
    assert.ok(await until(() => hunters.some((h: any) => h.target === id), 5000), "they go for their quarry");
    // they count inside the room's trooper cap, ahead of the patrols
    assert.ok(room.warTroops.h.reserved() >= sq.ids.length);
    // the quarry dies to them: the debt is paid and they go home
    room.damagePlayer(id, 1e9, hunters[0].title, [0, 0], 0, { from: sq.ids[0] });
    assert.equal(wantedTier(p.feud, owner, Date.now()), 0, "death at the clan's hands clears Wanted");
    room.feuds.tick(Date.now());
    assert.equal(room.feuds._squads.length, 0, "the squad goes home");
    assert.ok(sq.ids.every((h: string) => !room.state.mobs.has(h)));
  } finally { await srv.stop(); }
});

test("feuds (room): a sworn killer claims the bounty on a Wanted hero once per UTC day; a javelin settles it too; PvP kills earn points", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const V = await setup(srv), K = await setup(srv);
    const room = V.room, owner = OWNER(), sent: [string, any][] = [], bc = room.broadcast.bind(room);
    room.broadcast = (t: string, msg: any, o?: any) => { sent.push([t, msg]); return bc(t, msg, o); };
    const other = CLAN_KEYS.find((k) => k !== owner)!;
    K.p.clan = owner; V.p.clan = other;
    const wanted = () => { V.p.feud[owner] = { ...(V.p.feud[owner] ?? {}), pts: FEUD.tiers[0] + 1, at: Date.now(), until: Date.now() + 60_000 }; };
    const revive = () => { V.p.dead = false; V.p.hp = V.p.maxHp; };
    wanted();
    room.damagePlayer(V.id, 1e9, K.p.name, [0, 0], 0, { from: K.id });
    assert.equal(wantedTier(V.p.feud, owner, Date.now()), 0, "settled");
    assert.equal(V.p.feud[owner].paid, utcDay(Date.now()));
    assert.equal(K.p.renown, FEUD.bounty.renown, "bounty renown");
    assert.equal(_valorOf(LAND.id, owner), FEUD.bounty.valor, "bounty valor for the clan where the hero fell");
    assert.ok(sent.some(([t, v]) => t === "sfx" && v.ev === "bounty_claimed" && v.id === K.id));
    assert.equal(K.p.feud[other]?.pts, snapPts(killPoints("hero", owner, other)), "killing a hero sworn to another clan: points with it (a third if at war)");
    // again the same day: no second bounty
    revive(); wanted();
    room.damagePlayer(V.id, 1e9, K.p.name, [0, 0], 0, { from: K.id });
    assert.equal(K.p.renown, FEUD.bounty.renown, "once per target per day");
    assert.equal(wantedTier(V.p.feud, owner, Date.now()), 0, "still settled");
    // a javelin of the clan settles it too (no bounty: no hero killed them)
    revive(); wanted();
    room.damagePlayer(V.id, 1e9, "Redfang soldier", [0, 0], 0, { troop: owner });
    assert.equal(wantedTier(V.p.feud, owner, Date.now()), 0, "a javelin of that clan settles it");
    // another clan's blow settles nothing
    revive(); wanted();
    room.damagePlayer(V.id, 1e9, "x", [0, 0], 0, { troop: CLAN_KEYS.find((k) => k !== owner && k !== other)! });
    assert.equal(wantedTier(V.p.feud, owner, Date.now()), 1, "another clan's kill: still Wanted");
    // a save keeps the feud (and the bounty day); an old save without one loads with none
    const snap = room.snapshot(V.p);
    assert.equal(snap.feud[owner].pts, FEUD.tiers[0] + 1);
    assert.equal(snap.feud[owner].paid, utcDay(Date.now()));
    revive(); V.p.feud = {};
    room.restore(V.p, JSON.parse(JSON.stringify(snap)));
    assert.equal(wantedTier(V.p.feud, owner, Date.now()), 1, "round trip");
    assert.equal(V.p.feud[owner].paid, utcDay(Date.now()));
    const old = JSON.parse(JSON.stringify(snap)); delete old.feud;
    room.restore(V.p, old);
    assert.deepEqual(V.p.feud, {}, "an old save: no feud");
    assert.equal(room.snapshot(V.p).feud, undefined, "nothing written when there is none");
  } finally { await srv.stop(); }
});

test("feuds (room): a hero's saved feud is read back on loading (offline decay applied) and the join messages carry it", async () => {
  const srv = await startRoom();
  freshWar();
  try {
    const { room, p } = await setup(srv);
    const other = await setup(srv);
    const owner = OWNER();
    p.feud = { [owner]: { pts: FEUD.tiers[0] + 2, at: Date.now(), until: Date.now() + 60_000 } };
    const saved = JSON.parse(JSON.stringify(room.snapshot(p))); // what the store keeps (accounts.ts HeroSave.feud)
    saved.feud[owner].at -= 2 * FEUD.decayMs; // two decay steps pass while they are away
    const q = other.p;
    room.restore(q, saved);
    assert.equal(q.feud[owner].pts, FEUD.tiers[0], "loaded, with offline decay");
    other.got.length = 0;
    room.feuds.join(other.id);
    assert.ok(await until(() => other.got.some(([t, v]) => t === "feud" && v.c?.[owner]?.p === FEUD.tiers[0])), "the owner's view");
    assert.ok(await until(() => other.got.some(([t, v]) => t === "wanted" && v.full && v.w?.[other.id]?.[0]?.[0] === owner)), "the marks");
  } finally { await srv.stop(); }
});
