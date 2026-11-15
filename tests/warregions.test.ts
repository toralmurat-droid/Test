import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { SPAWN_ZONES, type SpawnZone } from "../shared/spawns";
import { CLAN_KEYS } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { capitalsOf, REGION_LINKS, REGIONS, regionOf, type Region } from "../shared/war/regions";
import { newWar, warTick } from "../shared/war/rules";
import { buildTerritories, builtRegions, initialOwners, LAND_LINKS, TERRITORIES, territoryByName, type Territory } from "../shared/war/territories";
import { _resetWar, migrateWar, startWar, stopWar, warLog, warState, type SavedWar } from "../server/war";
import type { Kv } from "../server/store";

/** Captured on claude/war-regions before regions.ts existed: the war map and the starting shares must not move. */
const GOLDEN = "95e472c3a2d732c56d6da0e4761c1e3bccd61c0006ec6d6f037227554b5a9aa3";

test("regions: territory names are unique (the saved war is matched by name)", () => {
  assert.equal(new Set(TERRITORIES.map((t) => t.name)).size, TERRITORIES.length);
});

test("regions: today's war map is unchanged (golden fingerprint of borders, capitals and starting owners)", () => {
  const s = JSON.stringify({ t: TERRITORIES.map((t) => [t.id, t.name, [...t.near].sort((a, b) => a - b), t.capitalOf ?? null]), o: initialOwners() });
  assert.equal(createHash("sha256").update(s).digest("hex"), GOLDEN);
});

test("regions: every territory lies in exactly one built land (Oakvale 21, Sunscar 10)", () => {
  for (const t of TERRITORIES) {
    assert.equal(REGIONS.filter((r) => r.contains?.(Math.floor(t.x + (t.w >> 1)), Math.floor(t.y + (t.h >> 1)))).length, 1, t.name);
    assert.equal(regionOf(t.x + (t.w >> 1), t.y + (t.h >> 1))?.key, t.region, t.name);
    assert.equal(t.region, t.act === 1 ? "oakvale" : "sunscar", `${t.name}: the acts are today's lands`);
  }
  assert.deepEqual([...builtRegions(TERRITORIES)].sort(), ["oakvale", "sunscar"]);
  assert.equal(TERRITORIES.filter((t) => t.region === "oakvale").length, 21);
  assert.equal(TERRITORIES.filter((t) => t.region === "sunscar").length, 10);
  // every clan: one capital per built land; forward ones only where the homeland is not built
  for (const k of CLAN_KEYS) assert.deepEqual(TERRITORIES.filter((t) => t.capitalOf === k).map((t) => t.region).sort(), ["oakvale", "sunscar"], k);
  assert.deepEqual(TERRITORIES.filter((t) => t.forward).map((t) => t.name).sort(),
    ["Dustrider Camp", "Greywatch Keep", "Kharsun, the Buried City", "Redfang Hollow", "The Humpback Mesas", "Thornwood"]);
});

test("regions: one border crosses lands, and it is the waygate's", () => {
  const cross = TERRITORIES.flatMap((t) => t.near.filter((n) => n > t.id && TERRITORIES[n].region !== t.region).map((n) => [t.id, n]));
  assert.equal(cross.length, 1);
  assert.equal(REGION_LINKS[0].name, "The Waygate");
  assert.equal(LAND_LINKS.length, 1);
  assert.deepEqual(cross[0], [LAND_LINKS[0].a, LAND_LINKS[0].b]);
  assert.deepEqual([TERRITORIES[cross[0][0]].name, TERRITORIES[cross[0][1]].name], ["Stonecrag Quarry", "The Glasswind Flats"]);
});

test("regions: a new homeland plugs in (fake Grey Barrow Moors: Host capital moves home, forward ones step down)", () => {
  const zone = (name: string, x: number, y: number): SpawnZone => ({ name, x, y, w: 20, h: 20, mobs: { wolf: 3 } as SpawnZone["mobs"], levels: [20, 24], respawnMs: 30_000 });
  const moorZones = [zone("Barrow Keep", 400, 0), zone("Ashen Cairns", 425, 0), zone("Wailing Tor", 400, 25)];
  const moors: Region = { ...REGIONS.find((r) => r.key === "moors")!, contains: (x, y) => x >= 400 && x < 460 && y < 60,
    capitals: [{ clan: "host", zone: "Barrow Keep" }] };
  const regions = [moors, ...REGIONS.filter((r) => r.key !== "moors")]; // a new land's test comes before the acts' catch-all
  const links = [...REGION_LINKS, { a: "moors", b: "oakvale", name: "The Moor Road", pa: { x: 400, y: 10 }, pb: { x: 250, y: 10 } }];
  const ts: Territory[] = buildTerritories([...SPAWN_ZONES, ...moorZones], regions, links);
  const by = (n: string) => ts.find((t) => t.name === n)!;
  assert.equal(ts.length, TERRITORIES.length + 3);
  assert.deepEqual([...builtRegions(ts)].sort(), ["moors", "oakvale", "sunscar"]);
  assert.equal(by("Barrow Keep").capitalOf, "host");
  assert.equal(by("Barrow Keep").region, "moors");
  assert.equal(by("Greywatch Keep").capitalOf, undefined, "the Host's forward capital becomes an ordinary territory");
  assert.equal(by("Kharsun, the Buried City").capitalOf, undefined);
  assert.equal(by("Thornwood").capitalOf, "hidekin", "other forward capitals stay while their homeland is unbuilt");
  assert.equal(capitalsOf(builtRegions(ts), regions).size, 9);
  // borders two-way, the moors touch Oakvale only through the road, and the whole map is one piece
  for (const t of ts) for (const n of t.near) assert.ok(ts[n].near.includes(t.id));
  const cross = ts.flatMap((t) => t.near.filter((n) => n > t.id && ts[n].region !== t.region).map((n) => `${ts[t.id].region}-${ts[n].region}`));
  assert.deepEqual(cross.sort(), ["oakvale-moors", "oakvale-sunscar"]);
  const seen = new Set([0]), todo = [0];
  while (todo.length) for (const n of ts[todo.pop()!].near) if (!seen.has(n)) { seen.add(n); todo.push(n); }
  assert.equal(seen.size, ts.length, "every territory reachable");
  const owner = initialOwners(ts);
  for (const t of ts.filter((x) => x.region === "moors")) assert.equal(owner[t.id], "host", `${t.name} starts with the Host`);
  assert.ok(ts.filter((x) => x.region !== "moors").every((t) => owner[t.id] !== "host"), "the Host starts at home only");
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
const names = () => TERRITORIES.map((t) => t.name);

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
