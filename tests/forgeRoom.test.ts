// The Forge's live loop (M4 PR2: server/forge.ts, server/forgeMobs.ts, the room's hooks): the registry and its save,
// commissions (cost, gate, research, caps), forged monsters only in their clan's lands, their damage and loot, the kill
// switch, retire and revoke on items and online heroes, the "forgeQ" message, and forged ids in saves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FORGE, mobPower, type ForgedMob, type ForgedWeapon, type MonsterRecipe, type WeaponRecipe } from "../shared/forge";
import { GEAR, gearDef, isGearId, withLevel } from "../shared/gear";
import { shopWithForged } from "../shared/shops";
import { SPAWN_ZONES } from "../shared/spawns";
import type { ClanKey } from "../shared/war/clans";
import { warDay } from "../shared/war/council";
import { newMinds } from "../shared/war/doctrine";
import { newWar } from "../shared/war/rules";
import {
  _forgeNow, _forgeSave, _gatesDone, _resetForge, _setGateRunner, cleanForge, commission, forgeClock, forgedDrop, forgedStock, forgeKilled,
  forgeQuery, initForge, killForge, packFor, retireForged, revokeForged, runGate,
} from "../server/forge";
import { mobDmgK, variantFor, ZONE_TERRITORY } from "../server/forgeMobs";
import { _resetWar, warState } from "../server/war";
import type { Kv } from "../server/store";
import { startRoom, until, wait } from "./helpers/room";

const WEAPON: WeaponRecipe = { kind: "weapon", clan: "redfang", name: "Fang of Rourke", base: "ws_bastard", implicit: [{ key: "atk", value: 2 }, { key: "str", value: 1 }], palette: "redfang" };
/** A territory (not a camp) whose zone spawns a forgeable kind, its zone index and that kind. */
const SITE = (() => {
  for (let zi = 0; zi < SPAWN_ZONES.length; zi++) {
    const t = ZONE_TERRITORY[zi];
    if (!t) continue;
    for (const [k, n] of Object.entries(SPAWN_ZONES[zi].mobs)) if (n && ["skeleton", "slime", "tuskborn", "wight", "bandit", "wolf"].includes(k)) return { zi, t, kind: k as MonsterRecipe["base"] };
  }
  throw new Error("no forgeable site");
})();
const monster = (clan: ClanKey, name = "Grave Tusker"): MonsterRecipe =>
  ({ kind: "monster", clan, name, base: SITE.kind, affixes: [], hp: 1.3, dmg: 1.2, speed: 1, palette: "bone" });
const memKv = (init: Record<string, unknown> = {}): Kv & { data: Record<string, unknown> } => {
  const data = { ...init };
  return { data, get: async <T>(k: string) => data[k] as T | undefined, set: async (k, v) => { data[k] = JSON.parse(JSON.stringify(v)); } };
};
const warWith = (owner?: (t: number) => ClanKey) => {
  const state = newWar();
  if (owner) state.owner = state.owner.map((_, i) => owner(i));
  _resetWar({ v: 1, state, minds: newMinds(), next: Date.now() + 1e12, log: [] });
  return state;
};

test("forge save: garbage never throws, unreadable forgings are kept aside, good ones load", () => {
  for (const raw of [undefined, null, "x", 42, [], { defs: "no" }, { defs: [null, 1, { kind: "weapon" }], projects: 5, log: [{}] }]) {
    const s = cleanForge(raw);
    assert.equal(s.v, 1); assert.deepEqual(s.defs, []);
  }
  _resetForge();
  const w = _forgeNow(WEAPON) as ForgedWeapon;
  const saved = JSON.parse(JSON.stringify(_forgeSave()));
  saved.defs.push({ kind: "weapon", seq: 7, id: "fg7_nope", status: "active" }, { ...saved.defs[0] }); // garbage, and a duplicate seq
  const s = cleanForge(saved);
  assert.deepEqual(s.defs.map((d) => d.id), [w.id]);
  assert.equal(s.lost?.length, 2, "kept aside, not thrown away");
  assert.equal(s.seq, w.seq);
});

test("boot: a missing forge starts empty; a garbage one is kept aside and a new registry begins", async () => {
  const empty = memKv();
  await initForge(empty);
  assert.equal(packFor().defs.length, 0);
  const bad = memKv({ forge: "garbage" });
  await initForge(bad);
  assert.equal(packFor().defs.length, 0);
  assert.ok(Object.keys(bad.data).some((k) => k.startsWith("forge-old-") && bad.data[k] === "garbage"));
  // a good save comes back with its forgings, and their items resolve
  _resetForge();
  const w = _forgeNow(WEAPON);
  const good = memKv({ forge: JSON.parse(JSON.stringify(_forgeSave())) });
  _resetForge();
  assert.match(gearDef(w.id)!.name, /^Forgotten/);
  await initForge(good);
  assert.equal(gearDef(w.id)!.name, WEAPON.name);
  _resetForge();
});

test("commission: validated, paid with the army, gated, live after the research days; caps per clan and per day", async () => {
  const state = warWith();
  _resetForge();
  const gated: string[] = [];
  _setGateRunner(async (d) => { gated.push(d.id); return { ok: d.name !== "Bad Tusker", reasons: d.name === "Bad Tusker" ? ["too strong"] : [] }; });
  const day = warDay(state.tick), army0 = state.army.host;
  assert.deepEqual(commission("host", { ...monster("host"), hp: 9 }, day), { ok: false, code: "mult_range", msg: "hp is 0.8-1.6" });
  assert.equal(commission("redfang", monster("host"), day).ok, false, "another clan's recipe");
  assert.equal(commission("nobody", monster("host"), day).ok, false);
  const shadow = commission("host", monster("host"), day, "shadow");
  assert.deepEqual(shadow, { ok: true });
  assert.equal(state.army.host, army0, "shadow: nothing spent");
  const r = commission("host", monster("host"), day);
  assert.ok(r.ok && r.seq === 1 && r.liveDay === day + FORGE.researchDays);
  assert.ok(Math.abs(warState()!.army.host - army0 * (1 - FORGE.armyCost)) < 1e-6, "the army paid");
  await _gatesDone();
  assert.deepEqual(gated, ["fm1"]);
  forgeClock(day);
  assert.equal(packFor().defs.length, 0, "still in research");
  forgeClock(day + FORGE.researchDays);
  assert.deepEqual(packFor().defs.map((d) => d.id), ["fm1"]);
  // a gate that fails: the project is dropped and logged
  assert.ok(commission("host", monster("host", "Bad Tusker"), day).ok);
  await _gatesDone();
  assert.equal(_forgeSave().projects.host?.length ?? 0, 0);
  assert.ok(_forgeSave().log.some((e) => e.kind === "gate_fail"));
  // per clan: past FORGE.perClan monsters the oldest retires
  for (let i = 0; i < FORGE.perClan.monster; i++) assert.ok(commission("host", monster("host", `Tusker ${i}`), day).ok);
  await _gatesDone(); forgeClock(day + FORGE.researchDays);
  const host = _forgeSave().defs.filter((d) => d.clan === "host");
  assert.equal(host.find((d) => d.id === "fm1")!.status, "retired");
  assert.equal(host.filter((d) => d.status === "active").length, FORGE.perClan.monster);
  // per day: FORGE.perDay commissions at most (4 so far today)
  assert.ok(commission("wardens", monster("wardens"), day).ok);
  const over = commission("wardens", monster("wardens", "One Too Many"), day);
  assert.ok(!over.ok && over.code === "day_cap");
  assert.ok(commission("wardens", monster("wardens", "Next Day"), day + 1).ok, "a new day");
  await _gatesDone();
  // the kill switch refuses commissions
  killForge(true);
  assert.equal((commission("veiled", monster("veiled"), day + 1) as { code?: string }).code, "killed");
  killForge(false);
  _setGateRunner();
  _resetForge();
});

test("gate: fails closed on an id that doesn't match its forging", async () => {
  _resetForge();
  const w = _forgeNow(WEAPON) as ForgedWeapon;
  _resetForge();
  for (const bad of [{ ...w, id: "fg9_ws_bastard" }, { ...w, id: `fg${w.seq}_ws_short` }, { ...w, id: "nonsense" }]) {
    const v = await runGate(bad);
    assert.equal(v.ok, false); assert.match(v.reasons[0], /^bad_id/);
  }
  assert.equal((await runGate({ kind: "monster", id: "fm2", seq: 3 } as ForgedMob)).ok, false);
  // the sim gate itself fails closed too (it runs on its own in the worker and the CLI)
  const { forgeGate } = await import("../tools/balance/forgeGate");
  const g = forgeGate({ ...w, id: "fg9_ws_bastard" }, { runs: 1 });
  assert.equal(g.ok, false); assert.match(g.reasons[0], /^bad_id/);
});

test("forged monsters: only in their clan's own lands, never in sanctuaries or camps; damage, drop, kill switch", () => {
  _resetForge();
  const v = _forgeNow(monster("host")) as ForgedMob;
  const one = () => 0; // always within FORGE.spawnShare, first in the list
  assert.equal(variantFor(SITE.t, SITE.kind, "host", one)?.id, v.id);
  assert.equal(variantFor(SITE.t, SITE.kind, "redfang", one), undefined, "another clan's land");
  assert.equal(variantFor(undefined, SITE.kind, "host", one), undefined, "no territory (village, dungeon, lair, wild)");
  assert.equal(variantFor(SITE.t, "demon", "host", one), undefined, "another kind");
  assert.equal(variantFor(SITE.t, SITE.kind, "host", () => FORGE.spawnShare), undefined, "past the spawn share");
  // sanctuaries and camps have no territory here
  SPAWN_ZONES.forEach((z, zi) => { const t = ZONE_TERRITORY[zi]; if (t) assert.equal(t.name, z.name); });
  assert.ok(ZONE_TERRITORY.some((t) => !t));
  assert.equal(mobDmgK({ forge: v.id, champion: 0 }), 1.2);
  assert.equal(mobDmgK({ forge: v.id, champion: 5 }), 1.2, "its affixes don't make it a champion");
  // the kill switch: no spawns, drops or sales
  _forgeNow({ ...WEAPON, clan: "host" });
  assert.ok(forgedDrop("host", 10, () => 0));
  assert.equal(forgedStock("host").length, 1);
  killForge(true);
  assert.ok(forgeKilled());
  assert.equal(variantFor(SITE.t, SITE.kind, "host", one), undefined);
  assert.equal(forgedDrop("host", 10, () => 0), undefined);
  assert.deepEqual(forgedStock("host"), []);
  killForge(false);
  process.env.FORGE_KILL = "1";
  try { assert.equal(variantFor(SITE.t, SITE.kind, "host", one), undefined, "FORGE_KILL=1"); } finally { delete process.env.FORGE_KILL; }
  _resetForge();
});

test("capital quartermaster: lists its clan's forged weapons after the fixed stock, at tier-3 prices", () => {
  _resetForge();
  const w = _forgeNow(WEAPON);
  const plain = shopWithForged("cap_redfang", [])!, shop = shopWithForged("cap_redfang", forgedStock("redfang"))!;
  assert.equal(shop.stock.length, plain.stock.length + 1);
  assert.deepEqual(shop.stock.slice(0, plain.stock.length), plain.stock, "fixed stock indices never move");
  const e = shop.stock.at(-1)!;
  assert.ok(e.item.startsWith(w.id) && isGearId(e.item));
  assert.ok(e.price >= 450);
  assert.equal(shopWithForged("smith", forgedStock("redfang"))?.stock.length, shopWithForged("smith", [])?.stock.length, "only capitals");
  assert.equal(shopWithForged("toString", ["x"]), undefined);
  _resetForge();
});

test("forgeQ: only arrays of 1-20 forged ids", () => {
  assert.deepEqual(forgeQuery({ ids: ["fg3_ws_bastard", "fm4", "fm4"] }), ["fg3_ws_bastard", "fm4"]);
  for (const bad of [undefined, null, "fm1", { ids: [] }, { ids: "fm1" }, { ids: [1] }, { ids: ["fm0"] }, { ids: ["fg1_ws_bastard@10"] },
    { ids: ["ws_bastard"] }, { ids: ["fm1; drop"] }, { ids: Array.from({ length: 21 }, (_, i) => `fm${i + 1}`) }, { ids: ["fg1_" + "a".repeat(60)] }])
    assert.equal(forgeQuery(bad), undefined, JSON.stringify(bad));
});

test("forge (room): spawns in the owner's land with its stats, multiplied damage, rewards; items survive retire, revoke and unknown ids", async () => {
  const { login, saveHero } = await import("../server/accounts");
  const { dropLive } = await import("../server/handoff");
  const share = FORGE.spawnShare;
  warWith((i) => (i === SITE.t.id ? "host" : "redfang"));
  _resetForge();
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "vampire" });
    const packs: any[] = [], answers: any[] = [];
    c.onMessage("forge", (m: any) => packs.push(m));
    c.onMessage("forgeQ", (m: any) => answers.push(m));
    await until(() => packs.length > 0);
    assert.deepEqual(packs[0].defs, [], "the pack on join");
    const room = srv.room, p = room.state.players.get(c.sessionId);
    const v = _forgeNow(monster("host")) as ForgedMob;
    await until(() => packs.length > 1);
    assert.deepEqual(packs.at(-1).defs.map((d: any) => d.id), [v.id], "a new pack on change");
    // spawns: in the owner's land, at FORGE.spawnShare (forced to 1 here)
    FORGE.spawnShare = 1;
    room.zoneSpawn(SITE.kind, SITE.zi, "fz1");
    room.zoneSpawn(SITE.kind, SITE.zi, "fz2");
    FORGE.spawnShare = 0;
    room.zoneSpawn(SITE.kind, SITE.zi, "fz3");
    const m = room.state.mobs.get("fz1"), plain = room.state.mobs.get("fz3");
    assert.equal(m.forge, v.id); assert.equal(plain.forge, "");
    assert.equal(m.champion, 0, "no affixes: no champion bits");
    plain.level = m.level; plain.weapon = m.weapon;
    plain.champion = 0; // (a plain spawn may roll champion, which hits harder)
    for (const x of [m, plain]) { x.rallyUntil = 0; x.alertUntil = 0; } // (nor a war cry or horn on one of them)
    const host = room.champs.host;
    assert.ok(host.dmg(m, 10) > host.dmg(plain, 10), "a forging's damage");
    assert.ok(Math.abs(host.dmg(m, 10) / host.dmg(plain, 10) - 1.2) < 0.05);
    // another clan takes the land: no forged spawns there
    warState()!.owner[SITE.t.id] = "wardens";
    FORGE.spawnShare = 1;
    room.zoneSpawn(SITE.kind, SITE.zi, "fz4");
    assert.equal(room.state.mobs.get("fz4").forge, "");
    // a forging with affixes runs them through the champion machinery, without champion HP or title
    warState()!.owner[SITE.t.id] = "host";
    _resetForge();
    const fam = (await import("../shared/forge")).forgeMobAffixes(SITE.kind);
    if (fam.length) {
      const va = _forgeNow({ ...monster("host", "Affixed One"), affixes: [fam[0]], hp: 1, dmg: 1 }) as ForgedMob;
      room.zoneSpawn(SITE.kind, SITE.zi, "fz5");
      const ma = room.state.mobs.get("fz5");
      assert.equal(ma.forge, va.id); assert.ok(ma.champion > 0 && ma.champ); assert.equal(ma.title, "");
      FORGE.spawnShare = 0;
      let pa: any;
      for (let i = 0; i < 200 && !(pa && pa.level === ma.level && pa.weapon === ma.weapon); i++) { room.zoneSpawn(SITE.kind, SITE.zi, `fz6_${i}`); pa = room.state.mobs.get(`fz6_${i}`); }
      assert.equal(pa.level, ma.level, "a plain one of the same level");
      assert.equal(host.dmg(ma, 10), host.dmg(pa, 10), "no champion damage multiplier");
      assert.ok(Math.abs(ma.maxHp / pa.maxHp - 1) < 0.05, "no champion HP");
      assert.ok(mobPower(va) > 1);
    }
    FORGE.spawnShare = share;
    // items: a forged weapon worn; retire keeps its stats, revoke falls back to the base and the hero's stats follow
    _resetForge();
    const w = _forgeNow({ ...WEAPON, clan: "host", implicit: [{ key: "str", value: 3 }] }) as ForgedWeapon;
    p.level = 30; p.weapon = w.id; room.applyStats(p);
    const strForged = p.str;
    p.weapon = "ws_bastard"; room.applyStats(p);
    const strBase = p.str;
    assert.ok(strForged > strBase, `forged +3 str (${strForged} vs ${strBase})`);
    p.weapon = w.id; room.applyStats(p);
    assert.ok(retireForged(w.id));
    assert.equal(p.str, strForged, "retired: same stats");
    assert.equal(gearDef(w.id)!.name, w.name);
    assert.ok(revokeForged(w.id));
    assert.equal(p.str, strBase, "revoked: the online hero's stats fall back at once");
    assert.deepEqual(gearDef(w.id)!.bonus, GEAR.ws_bastard.bonus);
    // forgeQ: the client asks for forgings the pack lacks
    c.send("forgeQ", { ids: [w.id, "fm999"] });
    c.send("forgeQ", { ids: "nope" });
    await until(() => answers.length > 0);
    await wait(200);
    assert.equal(answers.length, 1, "bad queries get no answer");
    assert.deepEqual(answers[0].defs.map((d: any) => [d.id, d.status]), [[w.id, "revoked"]]);
    // a save with an unknown forged id keeps it
    const name = `Forger${process.pid % 1000}`;
    await login(name, "testpass1", "127.0.0.1");
    const base = structuredClone(room.snapshot(p)), lost = withLevel("fg4242_ws_bastard", 12);
    room.restore(p, { ...base, bag: [lost] });
    assert.deepEqual([...p.bag], [lost], "unknown forging: kept in the bag");
    assert.match(gearDef(lost)!.name, /^Forgotten/);
    saveHero(name, "vampire", room.snapshot(p));
    dropLive(name, "vampire");
    assert.ok(room.snapshot(p).bag.includes(lost));
  } finally {
    FORGE.spawnShare = share;
    _resetForge();
    await srv.stop();
  }
});

test("forged monster dies: rewards scaled by its power, no champion loot", async () => {
  warWith((i) => (i === SITE.t.id ? "veiled" : "redfang"));
  _resetForge();
  const share = FORGE.spawnShare, drop = FORGE.dropChance;
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "vampire" });
    await wait(200);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    const v = _forgeNow({ ...monster("veiled"), hp: 0.8, dmg: 0.8 }) as ForgedMob;
    _forgeNow({ ...WEAPON, clan: "veiled" });
    FORGE.spawnShare = 1; FORGE.dropChance = 1;
    room.zoneSpawn(SITE.kind, SITE.zi, "fd1");
    const m = room.state.mobs.get("fd1");
    assert.equal(m.forge, v.id);
    p.x = m.x + 20; p.y = m.y; p.invulnUntil = Date.now() + 60_000;
    const items0 = room.state.items.size;
    room.hitTarget(c.sessionId, "fd1", 1e7, [0, 1], {});
    assert.equal(m.dead, true);
    let forged = 0;
    room.state.items.forEach((it: any) => { if (it.gear?.startsWith("fg")) forged++; });
    assert.equal(forged, 1, "its clan's forged weapon");
    assert.ok(room.state.items.size > items0);
  } finally {
    FORGE.spawnShare = share; FORGE.dropChance = drop;
    _resetForge();
    await srv.stop();
  }
});

