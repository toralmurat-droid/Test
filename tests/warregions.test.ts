import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { SPAWN_ZONES, type SpawnZone } from "../shared/spawns";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { CAIRNWATCH, MR } from "../shared/moors";
import { capitalsOf, REGION_LINKS, REGIONS, regionOf, type Region } from "../shared/war/regions";
import { caravanLines, caravanRoute } from "../shared/war/caravans";
import { newWar, warTick, type WarState } from "../shared/war/rules";
import { writOffers } from "../shared/war/writs";
import { buildTerritories, builtRegions, initialOwners, isSanctuary, LAND_LINKS, TERRITORIES, territoryByName } from "../shared/war/territories";
import { _resetWar, migrateWar, PRE_MOORS_NAMES, startWar, stopWar, warLog, warState, type SavedWar } from "../server/war";
import type { Kv } from "../server/store";

/**
 * The war map's fingerprint (ids, names, borders, capitals, starting owners). Refreshed on purpose when the Grey Barrow
 * Moors joined the war (2026-11-15): 11 moors territories (ids 31-41), the Barrowgate border, the Host's forward capitals
 * stepped down. Acts 1 and 2 keep their ids (PRE_MOORS_NAMES). Any other change to it must be on purpose too.
 */
const GOLDEN = "4b78fa3d5c3ecd03de546cafbe3949966de06943405dc68722d418a4828307a2";

const names = () => TERRITORIES.map((t) => t.name);

test("regions: territory names are unique (the saved war is matched by name)", () => {
  assert.equal(new Set(TERRITORIES.map((t) => t.name)).size, TERRITORIES.length);
});

test("regions: today's war map is unchanged (golden fingerprint of borders, capitals and starting owners)", () => {
  const s = JSON.stringify({ t: TERRITORIES.map((t) => [t.id, t.name, [...t.near].sort((a, b) => a - b), t.capitalOf ?? null]), o: initialOwners() });
  assert.equal(createHash("sha256").update(s).digest("hex"), GOLDEN);
});

test("regions: every territory lies in exactly one built land (Oakvale 21, Sunscar 10, Moors 11)", () => {
  const byAct = { 1: "oakvale", 2: "sunscar", 3: "moors" } as const;
  for (const t of TERRITORIES) {
    assert.equal(REGIONS.filter((r) => r.contains?.(Math.floor(t.x + (t.w >> 1)), Math.floor(t.y + (t.h >> 1)))).length, 1, t.name);
    assert.equal(regionOf(t.x + (t.w >> 1), t.y + (t.h >> 1))?.key, t.region, t.name);
    assert.equal(t.region, byAct[t.act], `${t.name}: the acts are today's lands`);
  }
  assert.deepEqual([...builtRegions(TERRITORIES)].sort(), ["moors", "oakvale", "sunscar"]);
  assert.equal(TERRITORIES.filter((t) => t.region === "oakvale").length, 21);
  assert.equal(TERRITORIES.filter((t) => t.region === "sunscar").length, 10);
  assert.equal(TERRITORIES.filter((t) => t.region === "moors").length, 11);
  // the old lands keep their ids: a save's unnamed ids and the frozen pre-moors list still line up
  assert.deepEqual(TERRITORIES.slice(0, PRE_MOORS_NAMES.length).map((t) => t.name), [...PRE_MOORS_NAMES]);
  // a capital per built land for the clans whose homeland is elsewhere or unbuilt; the Host is at home only
  for (const k of CLAN_KEYS) assert.deepEqual(TERRITORIES.filter((t) => t.capitalOf === k).map((t) => t.region).sort(), k === "host" ? ["moors"] : ["oakvale", "sunscar"], k);
  assert.deepEqual(TERRITORIES.filter((t) => t.forward).map((t) => t.name).sort(), ["Dustrider Camp", "Redfang Hollow", "The Humpback Mesas", "Thornwood"]);
});

test("regions: two borders cross lands, the Waygate's and the Barrowgate's", () => {
  const cross = TERRITORIES.flatMap((t) => t.near.filter((n) => n > t.id && TERRITORIES[n].region !== t.region).map((n) => [t.id, n]));
  assert.deepEqual(REGION_LINKS.map((l) => l.name), ["The Waygate", "The Barrowgate"]);
  assert.equal(LAND_LINKS.length, 2);
  assert.deepEqual(cross, LAND_LINKS.map((l) => [l.a, l.b]));
  assert.deepEqual(cross.map(([a, b]) => [TERRITORIES[a].name, TERRITORIES[b].name]),
    [["Stonecrag Quarry", "The Glasswind Flats"], ["Rimewater Hollow", "Sorrow Mire"]]);
});

test("regions: the Grey Barrow Moors are the Host's homeland (seat at the Muster, forward capitals step down)", () => {
  const by = (n: string) => territoryByName(n)!;
  assert.equal(by("The Host's Muster").capitalOf, "host");
  assert.equal(by("The Host's Muster").region, "moors");
  assert.equal(by("Greywatch Keep").capitalOf, undefined, "the Host's forward capital becomes an ordinary territory");
  assert.equal(by("Kharsun, the Buried City").capitalOf, undefined);
  assert.equal(by("Thornwood").capitalOf, "hidekin", "other forward capitals stay while their homeland is unbuilt");
  assert.equal(capitalsOf(builtRegions(TERRITORIES)).size, 9);
  // Cairnwatch is outside every zone; the King's mound (his alone) and the open moor are sanctuaries
  for (const n of ["The Barrow-King's Mound", "The Grey Barrow Moors"]) {
    assert.ok(isSanctuary(SPAWN_ZONES.find((z) => z.name === n)!), n);
    assert.equal(territoryByName(n), undefined, n);
  }
  const cw = { ...CAIRNWATCH, y: MR(CAIRNWATCH.y) };
  for (const t of TERRITORIES) assert.ok(t.x >= cw.x + cw.w || cw.x >= t.x + t.w || t.y >= cw.y + cw.h || cw.y >= t.y + t.h, `${t.name} overlaps Cairnwatch`);
  // borders two-way, and the whole map is one piece
  for (const t of TERRITORIES) for (const n of t.near) assert.ok(TERRITORIES[n].near.includes(t.id));
  const seen = new Set([0]), todo = [0];
  while (todo.length) for (const n of TERRITORIES[todo.pop()!].near) if (!seen.has(n)) { seen.add(n); todo.push(n); }
  assert.equal(seen.size, TERRITORIES.length, "every territory reachable");
  const owner = initialOwners();
  for (const t of TERRITORIES.filter((x) => x.region === "moors")) assert.equal(owner[t.id], "host", `${t.name} starts with the Host`);
  assert.ok(TERRITORIES.filter((x) => x.region !== "moors").every((t) => owner[t.id] !== "host"), "a new war: the Host starts at home only");
});

test("regions: the next homeland plugs in the same way (fake Red Badlands through buildTerritories)", () => {
  const zone = (name: string, x: number, y: number): SpawnZone => ({ name, x, y, w: 20, h: 20, mobs: { wolf: 3 } as SpawnZone["mobs"], levels: [20, 24], respawnMs: 30_000 });
  const extra = [zone("Red Mesa", 2000, 0), zone("Bloodrock", 2025, 0)];
  const bad: Region = { ...REGIONS.find((r) => r.key === "badlands")!, contains: (x) => x >= 2000, capitals: [{ clan: "redfang", zone: "Red Mesa" }] };
  const regions = [bad, ...REGIONS.filter((r) => r.key !== "badlands")]; // a new land's test comes before the acts' catch-all
  const links = [...REGION_LINKS, { a: "badlands", b: "oakvale", name: "The Red Road", pa: { x: 2000, y: 10 }, pb: { x: 0, y: 10 } }];
  const ts = buildTerritories([...SPAWN_ZONES, ...extra], regions, links);
  assert.equal(ts.length, TERRITORIES.length + 2);
  assert.equal(ts.find((t) => t.name === "Redfang Hollow")!.capitalOf, undefined, "Redfang's forward capital steps down");
  assert.equal(ts.find((t) => t.name === "Red Mesa")!.capitalOf, "redfang");
});

test("regions: carts and writs stay inside one land; the Cairnwatch board offers the moors' writs", () => {
  const s = newWar(), lines = caravanLines(s.owner);
  assert.ok(lines.some((l) => TERRITORIES[l.a].region === "moors"), "the Host runs carts on the moors");
  for (const l of lines) assert.equal(TERRITORIES[l.a].region, TERRITORIES[l.b].region, "no cart through a gate");
  const rh = territoryByName("Rimewater Hollow")!.id, sm = territoryByName("Sorrow Mire")!.id;
  assert.equal(caravanRoute(rh, sm), undefined, "no road through the Barrowgate");
  let any = 0;
  for (const k of CLAN_KEYS) for (const lv of [22, 27, 32]) for (const w of writOffers(s, k, lv, 3, 5)) {
    any++;
    assert.equal(TERRITORIES[w.t].region, "moors", `${k} Lv ${lv}: ${w.land}`);
  }
  assert.ok(any > 0, "an Act 3 board has writs");
  for (const k of CLAN_KEYS) for (const w of writOffers(s, k, 27, 1, 5)) assert.notEqual(TERRITORIES[w.t].region, "moors", "Act 1 boards keep to Act 1");
});

/**
 * The live war as it stood before the moors joined: the territory names in id order (PRE_MOORS_NAMES, copied here so a
 * change to the server's list shows) with their holders (a starting map with a few flips: Redfang took Greywatch Keep,
 * the Host still holds Kharsun and its Sunscar dunes).
 */
const LIVE_PRE_MOORS: [string, ClanKey][] = [["North Meadow", "hidekin"], ["Goldenreach Farms", "wardens"], ["Mirror Pond", "wardens"],
  ["Misty Marsh", "wardens"], ["Stonecrag Quarry", "wardens"], ["Old Ruins", "hidekin"], ["Old Watchtower", "hidekin"], ["Sunken Lake", "wardens"],
  ["Barrow Downs", "wardens"], ["Gravemoor Cemetery", "redfang"], ["Thornwood", "hidekin"], ["Greywatch Keep", "redfang"], ["Redfang Hollow", "redfang"],
  ["Brinewood", "redfang"], ["Heronwreck Strand", "redfang"], ["Gullrock Cove", "redfang"], ["Blightmire Fen", "host"], ["Rimewater Hollow", "veiled"],
  ["Cinder Scar", "veiled"], ["Stormbreak Crags", "redfang"], ["Saltwind Coast", "redfang"], ["The Glasswind Flats", "host"], ["Palmshade Oasis", "wardens"],
  ["Jackal Springs", "hidekin"], ["Dustrider Camp", "redfang"], ["Kharsun, the Buried City", "host"], ["The Humpback Mesas", "hidekin"],
  ["The Saffron Dunes", "host"], ["Mirage Wells", "veiled"], ["The Veiled Sanctum", "veiled"], ["The Thornspire Heights", "veiled"]];

/** That live war as the server saved it (named or not), mid-fight: Control, forts, a siege, pressure, a target, a log line. */
function livePreMoors(named: boolean): SavedWar {
  const n = LIVE_PRE_MOORS.length, owner = LIVE_PRE_MOORS.map(([, k]) => k);
  const control = owner.map((_, i) => 40 + ((i * 17) % 60)), fort = owner.map((_, i) => (i % 4) / 4), pressure = owner.map((_, i) => (i * 7) % 30);
  const siege: WarState["siege"] = Array(n).fill(null); siege[11] = { by: "host", at: 812 };
  const minds = newMinds(); minds.host.target = 11; minds.host.since = 800; minds.veiled.feint = 25;
  const army = Object.fromEntries(CLAN_KEYS.map((k, i) => [k, 200 + i * 40])) as Record<ClanKey, number>;
  const log = [{ at: 1, tick: 805, kind: "siege" as const, t: 11, by: "host" as const, from: "redfang" as const, text: "The Ossuary Host lay siege to Greywatch Keep" }];
  return { v: 1, state: { tick: 810, owner, control, fort, siege, pressure, army }, minds, next: 5_000_000_000_000, log, ...(named ? { names: LIVE_PRE_MOORS.map(([x]) => x) } : {}) };
}

/** Checks a pre-moors war carried onto today's map: by name the same everywhere, the moors all the Host's at Control 100. */
function assertCarried(m: SavedWar, w: SavedWar) {
  const all = names();
  assert.deepEqual(m.names, all);
  assert.equal(m.state.owner.length, TERRITORIES.length);
  LIVE_PRE_MOORS.forEach(([n], j) => {
    const i = all.indexOf(n);
    assert.ok(i >= 0, `${n} is still on the map`);
    assert.equal(m.state.owner[i], w.state.owner[j], `${n} keeps its holder`);
    assert.equal(m.state.control[i], w.state.control[j], `${n} keeps its Control`);
    assert.equal(m.state.fort[i], w.state.fort[j]);
    assert.equal(m.state.pressure[i], w.state.pressure[j]);
    assert.deepEqual(m.state.siege[i], w.state.siege[j]);
  });
  const gk = all.indexOf("Greywatch Keep"), kh = all.indexOf("Kharsun, the Buried City");
  assert.equal(m.state.owner[gk], "redfang", "the former forward capital keeps its holder (and its siege)");
  assert.deepEqual(m.state.siege[gk], { by: "host", at: 812 });
  assert.equal(m.state.owner[kh], "host");
  const moors = TERRITORIES.filter((t) => t.region === "moors");
  assert.equal(moors.length, 11);
  for (const t of moors) {
    assert.equal(m.state.owner[t.id], "host", `${t.name}: the Host's`); assert.equal(m.state.control[t.id], 100, t.name);
    assert.equal(m.state.fort[t.id], 0); assert.equal(m.state.siege[t.id], null); assert.equal(m.state.pressure[t.id], 0);
  }
  assert.equal(m.state.tick, w.state.tick);
  assert.deepEqual(m.state.army, w.state.army);
  assert.equal(m.minds.host.target, gk);
  assert.equal(m.minds.veiled.feint, kh);
  assert.deepEqual(m.log, [{ ...w.log[0], t: gk }]);
}

test("migrateWar: the live pre-moors war goes on (holders unchanged elsewhere, the moors the Host's at Control 100)", () => {
  assert.deepEqual(LIVE_PRE_MOORS.map(([n]) => n), [...PRE_MOORS_NAMES], "the server's frozen list is the live one");
  const w = livePreMoors(true);
  assertCarried(migrateWar(w, w.names!, names()), w);
});

test("war save: the live pre-moors save loads onto the moors map (named or not), the old save kept aside", async () => {
  try {
    for (const named of [true, false]) {
      const w = livePreMoors(named), store = memKv(w);
      _resetWar(undefined); stopWar();
      await startWar(store.kv);
      assertCarried({ ...w, state: warState()!, names: names(), minds: w.minds, log: warLog() } as SavedWar, w);
      const kept = [...store.m.keys()].filter((k) => k.startsWith("war-old-"));
      assert.equal(kept.length, 1, "the old save is kept aside");
      assert.deepEqual(JSON.parse(store.m.get(kept[0])!), w);
      stopWar();
    }
  } finally { stopWar(); _resetWar(); }
});

const memKv = (init?: unknown) => {
  const m = new Map<string, string>();
  if (init !== undefined) m.set("war", JSON.stringify(init));
  const kv: Kv = { get: async (k) => (m.has(k) ? JSON.parse(m.get(k)!) : undefined), set: async (k, v) => { m.set(k, JSON.stringify(v)); } };
  return { kv, m };
};
/** A war some ticks in, with a siege, forts, a leader's target and log lines, as the server would save it. */
function played(): SavedWar {
  const s = newWar();
  for (let i = 0; i < 40; i++) warTick(s, {}, { phase: i % 3 });
  const t = TERRITORIES.findIndex((x) => !x.capitalOf);
  s.siege[t] = { by: "redfang", at: s.tick + 3 }; s.control[t] = 20; s.fort[t + 1] = 0.7; s.pressure[t + 2] = 55;
  const minds = newMinds(); minds.host.target = t; minds.host.since = 7; minds.veiled.feint = t + 1;
  const log = [{ at: 1, tick: 3, kind: "siege" as const, t, by: "redfang" as const, from: s.owner[t], text: "x" }];
  return { v: 1, state: s, minds, next: 5_000_000_000_000, log };
}

test("migrateWar: the same names give the same war back", () => {
  const w = played();
  assert.deepEqual(migrateWar(w, names(), names()), { ...w, names: names() });
});

test("migrateWar: reordered names remap every list, the leaders' targets and the log", () => {
  const w = played(), old = names(), perm = old.map((_, i) => i).reverse(), oldRev = perm.map((i) => old[i]);
  // the save was written with the reversed order: its lists follow oldRev
  const saved: SavedWar = { ...w, state: { ...w.state, owner: perm.map((i) => w.state.owner[i]), control: perm.map((i) => w.state.control[i]),
    fort: perm.map((i) => w.state.fort[i]), siege: perm.map((i) => w.state.siege[i]), pressure: perm.map((i) => w.state.pressure[i]) },
    minds: { ...w.minds, host: { ...w.minds.host, target: perm.indexOf(w.minds.host.target!) }, veiled: { ...w.minds.veiled, feint: perm.indexOf(w.minds.veiled.feint!) } },
    log: w.log.map((e) => ({ ...e, t: perm.indexOf(e.t) })) };
  assert.deepEqual(migrateWar(saved, oldRev, old), { ...w, names: old });
});

test("migrateWar: a territory new to the map is seeded (capital's clan, full Control); one gone is dropped", () => {
  const w = played(), all = names();
  // added: the save predates Thornwood (a Hide-Kin capital) and the plain Mirror Pond
  const gone = ["Thornwood", "Mirror Pond"], keep = all.map((n, i) => i).filter((i) => !gone.includes(all[i]));
  const pick = <T>(a: T[]) => keep.map((i) => a[i]);
  const older: SavedWar = { ...w, state: { ...w.state, owner: pick(w.state.owner), control: pick(w.state.control), fort: pick(w.state.fort), siege: pick(w.state.siege), pressure: pick(w.state.pressure) },
    minds: newMinds(), log: [] };
  const m = migrateWar(older, keep.map((i) => all[i]), all);
  const th = all.indexOf("Thornwood"), mp = all.indexOf("Mirror Pond");
  assert.equal(m.state.owner[th], "hidekin");
  assert.equal(m.state.owner[mp], "wardens", "a plain new territory goes to its land's home clan");
  for (const i of [th, mp]) { assert.equal(m.state.control[i], 100); assert.equal(m.state.fort[i], 0); assert.equal(m.state.siege[i], null); assert.equal(m.state.pressure[i], 0); }
  keep.forEach((o, j) => { assert.equal(m.state.owner[o], older.state.owner[j]); assert.equal(m.state.control[o], older.state.control[j]); });
  assert.deepEqual(m.names, all);
  assert.equal(m.state.owner.length, all.length);
  // removed: the save has a territory today's map no longer knows (with a log line and a leader's target on it)
  const withOld: SavedWar = { ...w, state: { ...w.state, owner: [...w.state.owner, "veiled"], control: [...w.state.control, 3], fort: [...w.state.fort, 1], siege: [...w.state.siege, { by: "host", at: 99 }], pressure: [...w.state.pressure, 9] },
    minds: { ...w.minds, wardens: { since: 1, target: all.length } }, log: [...w.log, { ...w.log[0], t: all.length }] };
  const d = migrateWar(withOld, [...all, "The Lost Vale"], all);
  assert.equal(d.state.owner.length, all.length);
  assert.deepEqual(d.state, w.state);
  assert.equal(d.minds.wardens.target, undefined);
  assert.deepEqual(d.log, w.log);
});

test("war save: a legacy save (no names, same size) loads unchanged; a renamed one is remapped; a malformed one restarts", async () => {
  try {
    const w = played();
    const legacy = memKv(w);
    _resetWar(undefined); stopWar();
    await startWar(legacy.kv);
    assert.deepEqual(warState(), w.state, "legacy save loads unchanged");
    assert.deepEqual(warLog(), w.log);
    stopWar();

    // a save named in another order is remapped by name
    const all = names(), rev = [...all].reverse(), perm = all.map((_, i) => all.length - 1 - i);
    const named = memKv({ ...w, names: rev, state: { ...w.state, owner: perm.map((i) => w.state.owner[i]), control: perm.map((i) => w.state.control[i]),
      fort: perm.map((i) => w.state.fort[i]), siege: perm.map((i) => w.state.siege[i]), pressure: perm.map((i) => w.state.pressure[i]) }, log: [], minds: newMinds() });
    _resetWar(undefined); stopWar();
    await startWar(named.kv);
    assert.deepEqual(warState()!.owner, w.state.owner);
    assert.deepEqual(warState()!.control, w.state.control);
    assert.ok([...named.m.keys()].some((k) => k.startsWith("war-old-")), "the old save is kept aside when the map changed");
    stopWar();

    // malformed (lists of different lengths), or unnamed and of another size: a new war, the old one kept aside
    for (const bad of [{ ...w, state: { ...w.state, control: w.state.control.slice(1) } }, { ...w, state: { ...w.state, owner: w.state.owner.slice(1), control: w.state.control.slice(1), fort: w.state.fort.slice(1), siege: w.state.siege.slice(1), pressure: w.state.pressure.slice(1) } }]) {
      const b = memKv(bad);
      _resetWar(undefined); stopWar();
      await startWar(b.kv);
      assert.equal(warState()!.tick, 0, "a new war");
      assert.ok([...b.m.keys()].some((k) => k.startsWith("war-old-")));
      stopWar();
    }
  } finally { stopWar(); _resetWar(); }
});
