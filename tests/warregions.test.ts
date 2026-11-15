import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { SPAWN_ZONES, type SpawnZone } from "../shared/spawns";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { CAIRNWATCH, MR } from "../shared/moors";
import { BR, RUSTWATER_POST } from "../shared/badlands";
import { ROPEWELL, SR } from "../shared/sinkholes";
import { capitalsOf, REGION_LINKS, REGIONS, regionOf, type Region } from "../shared/war/regions";
import { caravanLines, caravanRoute } from "../shared/war/caravans";
import { newWar, warTick, type WarState } from "../shared/war/rules";
import { writOffers } from "../shared/war/writs";
import { buildTerritories, builtRegions, initialOwners, isSanctuary, LAND_LINKS, TERRITORIES, territoryByName } from "../shared/war/territories";
import { _resetWar, migrateWar, PRE_BADLANDS_NAMES, PRE_MOORS_NAMES, PRE_SINKHOLES_NAMES, startWar, stopWar, warLog, warState, type SavedWar } from "../server/war";
import type { Kv } from "../server/store";

/**
 * The war map's fingerprint (ids, names, borders, capitals, starting owners). Refreshed on purpose when the Grey Barrow
 * Moors joined the war (2026-11-15): 11 moors territories (ids 31-41), the Barrowgate border, the Host's forward capitals
 * stepped down, the Wardens' Grey Ring capital. Acts 1 and 2 keep their ids (PRE_MOORS_NAMES). Refreshed on purpose again when
 * the Red Badlands joined (2026-11-15): 10 badlands territories (ids 42-51), the Red Pass border, Redfang's forward capitals
 * stepped down, its seat at Fangrock, new starting owners in Oakvale and the Sunscar. Acts 1-3 keep their ids (PRE_BADLANDS_NAMES).
 * Refreshed on purpose again when the Mawdeep Sinkholes joined (2026-11-15): 10 sinkholes territories (ids 52-61), the
 * Sinkway border, the Hide-Kin's forward capitals stepped down (none are left), their seat at Hidehall, the Host's and
 * Redfang's Oakvale footholds (Stormbreak Crags, Heronwreck Strand), new starting owners in Oakvale and the Sunscar.
 * Acts 1-4 keep their ids (PRE_SINKHOLES_NAMES). Any other change to it must be on purpose too.
 */
const GOLDEN = "49dad8f31e57c62b2b567a7826bda2042a5040a4723f832fab79aeda8ac9ad80";

const names = () => TERRITORIES.map((t) => t.name);

test("regions: territory names are unique (the saved war is matched by name)", () => {
  assert.equal(new Set(TERRITORIES.map((t) => t.name)).size, TERRITORIES.length);
});

test("regions: today's war map is unchanged (golden fingerprint of borders, capitals and starting owners)", () => {
  const s = JSON.stringify({ t: TERRITORIES.map((t) => [t.id, t.name, [...t.near].sort((a, b) => a - b), t.capitalOf ?? null]), o: initialOwners() });
  assert.equal(createHash("sha256").update(s).digest("hex"), GOLDEN);
});

test("regions: every territory lies in exactly one built land (Oakvale 21, Sunscar 10, Moors 11, Badlands 10, Sinkholes 10)", () => {
  const byAct = { 1: "oakvale", 2: "sunscar", 3: "moors", 4: "badlands", 5: "sinkholes" } as const;
  for (const t of TERRITORIES) {
    assert.equal(REGIONS.filter((r) => r.contains?.(Math.floor(t.x + (t.w >> 1)), Math.floor(t.y + (t.h >> 1)))).length, 1, t.name);
    assert.equal(regionOf(t.x + (t.w >> 1), t.y + (t.h >> 1))?.key, t.region, t.name);
    assert.equal(t.region, byAct[t.act], `${t.name}: the acts are today's lands`);
  }
  assert.deepEqual([...builtRegions(TERRITORIES)].sort(), ["badlands", "moors", "oakvale", "sinkholes", "sunscar"]);
  assert.equal(TERRITORIES.filter((t) => t.region === "oakvale").length, 21);
  assert.equal(TERRITORIES.filter((t) => t.region === "sunscar").length, 10);
  assert.equal(TERRITORIES.filter((t) => t.region === "moors").length, 11);
  assert.equal(TERRITORIES.filter((t) => t.region === "badlands").length, 10);
  assert.equal(TERRITORIES.filter((t) => t.region === "sinkholes").length, 10);
  // the old lands keep their ids: a save's unnamed ids and the frozen pre-moors / pre-badlands / pre-sinkholes lists still
  // line up (Acts 1-4 are ids 0-51, the sinkholes come after)
  assert.deepEqual(TERRITORIES.slice(0, PRE_MOORS_NAMES.length).map((t) => t.name), [...PRE_MOORS_NAMES]);
  assert.deepEqual(TERRITORIES.slice(0, PRE_BADLANDS_NAMES.length).map((t) => t.name), [...PRE_BADLANDS_NAMES]);
  assert.equal(PRE_SINKHOLES_NAMES.length, 52);
  assert.deepEqual(TERRITORIES.slice(0, PRE_SINKHOLES_NAMES.length).map((t) => t.name), [...PRE_SINKHOLES_NAMES]);
  assert.ok(TERRITORIES.every((t) => (t.act <= 4) === (t.id < 52)), "Acts 1-4 keep ids 0-51, the sinkholes are 52 on");
  // every homeland built: each clan holds its seat at home; the Wardens and the Veiled their capitals in Oakvale and the
  // Sunscar, the Wardens also the Grey Ring (the Cairnwatch garrison); the Host and Redfang an Oakvale foothold each
  const caps: Record<ClanKey, string[]> = { wardens: ["moors", "oakvale", "sunscar"], redfang: ["badlands", "oakvale"], host: ["moors", "oakvale"],
    hidekin: ["sinkholes"], veiled: ["oakvale", "sunscar"] };
  for (const k of CLAN_KEYS) assert.deepEqual(TERRITORIES.filter((t) => t.capitalOf === k).map((t) => t.region).sort(), caps[k], k);
  // no forward capitals remain: none on the map, none from capitalsOf
  assert.deepEqual(TERRITORIES.filter((t) => t.forward).map((t) => t.name), []);
  assert.ok([...capitalsOf(builtRegions(TERRITORIES)).values()].every((c) => !c.forward));
});

test("regions: four borders cross lands, the Waygate's, the Barrowgate's, the Red Pass's and the Sinkway's", () => {
  const cross = TERRITORIES.flatMap((t) => t.near.filter((n) => n > t.id && TERRITORIES[n].region !== t.region).map((n) => [t.id, n]));
  assert.deepEqual(REGION_LINKS.map((l) => l.name), ["The Waygate", "The Barrowgate", "The Red Pass", "The Sinkway"]);
  assert.equal(LAND_LINKS.length, 4);
  assert.deepEqual(cross, LAND_LINKS.map((l) => [l.a, l.b]).sort((x, y) => x[0] - y[0]), "the borders are the links (listed by id here, by REGION_LINKS there)");
  assert.deepEqual(LAND_LINKS.map((l) => [TERRITORIES[l.a].name, TERRITORIES[l.b].name]),
    [["Stonecrag Quarry", "The Glasswind Flats"], ["Rimewater Hollow", "Sorrow Mire"], ["Mirror Pond", "The Saltlick Flats"], ["Sunken Lake", "Hollowbrook Dells"]]);
});

test("regions: the Grey Barrow Moors are the Host's homeland (seat at the Muster, the Wardens' Grey Ring, forward capitals step down)", () => {
  const by = (n: string) => territoryByName(n)!;
  assert.equal(by("The Host's Muster").capitalOf, "host");
  assert.equal(by("The Host's Muster").region, "moors");
  assert.equal(by("Greywatch Keep").capitalOf, undefined, "the Host's forward capital becomes an ordinary territory");
  assert.equal(by("Kharsun, the Buried City").capitalOf, undefined);
  assert.equal(by("Thornwood").capitalOf, undefined, "the Hide-Kin's forward capitals stepped down too (their homeland is built)");
  assert.equal(by("The Grey Ring").capitalOf, "wardens", "the Cairnwatch garrison's ring");
  assert.equal(by("The Grey Ring").forward, undefined);
  assert.equal(capitalsOf(builtRegions(TERRITORIES)).size, 10);
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
  // the Wardens (least land at the start since the sinkholes joined) claim Thane's Rest next to their Grey Ring; the rest is the Host's
  for (const t of TERRITORIES.filter((x) => x.region === "moors")) assert.equal(owner[t.id], ["The Grey Ring", "Thane's Rest"].includes(t.name) ? "wardens" : "host", `${t.name} starts with its clan`);
  assert.ok(TERRITORIES.filter((x) => owner[x.id] === "host").every((t) => t.region === "moors" || t.region === "oakvale"),
    "a new war: the Host starts at home and round its Oakvale foothold only");
});

test("regions: the Red Badlands are Redfang's homeland (seat at Fangrock, forward capitals step down, the Rustwater Post out of the war)", () => {
  const by = (n: string) => territoryByName(n)!;
  assert.equal(by("Fangrock").capitalOf, "redfang");
  assert.equal(by("Fangrock").region, "badlands");
  assert.equal(by("Fangrock").forward, undefined);
  assert.equal(by("Redfang Hollow").capitalOf, undefined, "the forward capital in Oakvale becomes an ordinary territory");
  assert.equal(by("Dustrider Camp").capitalOf, undefined, "and the one in the Sunscar");
  // Old Rourke's keep (his alone) and the open badlands are sanctuaries; the Rustwater Post is outside every zone
  for (const n of ["Fangrock Keep", "The Red Badlands"]) {
    assert.ok(isSanctuary(SPAWN_ZONES.find((z) => z.name === n)!), n);
    assert.equal(territoryByName(n), undefined, n);
  }
  const rp = { ...RUSTWATER_POST, y: BR(RUSTWATER_POST.y) };
  for (const t of TERRITORIES) assert.ok(t.x >= rp.x + rp.w || rp.x >= t.x + t.w || t.y >= rp.y + rp.h || rp.y >= t.y + t.h, `${t.name} overlaps the Rustwater Post`);
  assert.deepEqual(TERRITORIES.filter((t) => t.region === "badlands").map((t) => t.name).sort(), ["Bloodstone Mesa", "Drovers' Draw", "Fangrock",
    "Gallows Canyon", "Rattlesnake Gulch", "Talon Fort", "The Cinnabar Pits", "The Hanging Arches", "The Saltlick Flats", "Vulture's Roost"]);
  const owner = initialOwners();
  for (const t of TERRITORIES.filter((x) => x.region === "badlands")) assert.equal(owner[t.id], "redfang", `${t.name} starts with Redfang`);
  assert.ok(TERRITORIES.filter((x) => owner[x.id] === "redfang").every((t) => t.region === "badlands" || t.region === "oakvale"),
    "a new war: Redfang starts at home and round its Oakvale foothold only");
});

test("regions: the Mawdeep Sinkholes are the Hide-Kin's homeland (seat at Hidehall, no forward capitals left, Ropewell out of the war)", () => {
  const by = (n: string) => territoryByName(n)!;
  assert.equal(by("Hidehall").capitalOf, "hidekin");
  assert.equal(by("Hidehall").region, "sinkholes");
  assert.equal(by("Hidehall").forward, undefined);
  assert.equal(by("Thornwood").capitalOf, undefined, "the forward capital in Oakvale becomes an ordinary territory");
  assert.equal(by("The Humpback Mesas").capitalOf, undefined, "and the one in the Sunscar");
  // the Maw-Father's ledge (his alone) and the open sinkholes are sanctuaries; Ropewell is outside every zone
  for (const n of ["The Great Maw", "The Mawdeep Sinkholes"]) {
    assert.ok(isSanctuary(SPAWN_ZONES.find((z) => z.name === n)!), n);
    assert.equal(territoryByName(n), undefined, n);
  }
  const rw = { ...ROPEWELL, y: SR(ROPEWELL.y) };
  for (const t of TERRITORIES) assert.ok(t.x >= rw.x + rw.w || rw.x >= t.x + t.w || t.y >= rw.y + rw.h || rw.y >= t.y + t.h, `${t.name} overlaps Ropewell`);
  assert.deepEqual(TERRITORIES.filter((t) => t.region === "sinkholes").map((t) => t.name).sort(), ["Hidehall", "Hollowbrook Dells", "Mosslight Fen",
    "Rootfall Slopes", "Rushmere Hollows", "Scratchroot Burrows", "The Gnawed Bank", "The Old Warren", "The Pitfields", "Tunneltop"]);
  // the Host's and Redfang's Oakvale footholds are capitals of their own, not forward ones: they stay
  assert.equal(by("Stormbreak Crags").capitalOf, "host"); assert.equal(by("Stormbreak Crags").forward, undefined);
  assert.equal(by("Heronwreck Strand").capitalOf, "redfang"); assert.equal(by("Heronwreck Strand").forward, undefined);
  const owner = initialOwners();
  for (const t of TERRITORIES.filter((x) => x.region === "sinkholes")) assert.equal(owner[t.id], "hidekin", `${t.name} starts with the Hide-Kin`);
  assert.ok(TERRITORIES.filter((x) => x.region !== "sinkholes").every((t) => owner[t.id] !== "hidekin"), "a new war: the Hide-Kin start at home only");
});

test("regions: the next land plugs in the same way (fake Crown of the Marches through buildTerritories); a forward capital still steps down", () => {
  const zone = (name: string, x: number, y: number): SpawnZone => ({ name, x, y, w: 20, h: 20, mobs: { wolf: 3 } as SpawnZone["mobs"], levels: [20, 24], respawnMs: 30_000 });
  const extra = [zone("Crown Hill", 2000, 0), zone("Kingsway", 2025, 0)];
  const crown: Region = { ...REGIONS.find((r) => r.key === "crown")!, contains: (x) => x >= 2000, capitals: [{ clan: "veiled", zone: "Crown Hill" }] };
  const regions = [crown, ...REGIONS.filter((r) => r.key !== "crown")]; // a new land's test comes before the acts' catch-all
  const links = [...REGION_LINKS, { a: "crown", b: "oakvale", name: "The Crown Road", pa: { x: 2000, y: 10 }, pb: { x: 0, y: 10 } }];
  const ts = buildTerritories([...SPAWN_ZONES, ...extra], regions, links);
  assert.equal(ts.length, TERRITORIES.length + 2);
  assert.equal(ts.find((t) => t.name === "Crown Hill")!.capitalOf, "veiled");
  assert.ok(ts.find((t) => t.name === "Kingsway")!.near.some((n) => ts[n].region === "oakvale") || ts.find((t) => t.name === "Crown Hill")!.near.some((n) => ts[n].region === "oakvale"), "linked to Oakvale");
  // the forward-capital rule is still there for lands to come: a forward capital in a built land drops out once its
  // clan's homeland is built, and is held while it is not
  const fwd: Region[] = REGIONS.map((r) => (r.key === "oakvale" ? { ...r, capitals: [...r.capitals, { clan: "hidekin" as const, zone: "Thornwood", forward: true }] } : r));
  assert.equal(capitalsOf(builtRegions(TERRITORIES), fwd).get("Thornwood"), undefined);
  assert.equal(capitalsOf(new Set(["oakvale", "sunscar", "moors", "badlands"]), fwd).get("Thornwood")?.clan, "hidekin");
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

test("regions: the Rustwater board offers the badlands' writs (it came back empty before the badlands were at war)", () => {
  const s = newWar(), lines = caravanLines(s.owner);
  assert.ok(lines.some((l) => TERRITORIES[l.a].region === "badlands"), "Redfang runs carts in the badlands");
  const mp = territoryByName("Mirror Pond")!.id, sf = territoryByName("The Saltlick Flats")!.id;
  assert.equal(caravanRoute(mp, sf), undefined, "no road through the Red Pass");
  // on a new war Redfang holds the whole land (clear and hold writs at home) and the Wardens, over the Red Pass from
  // Mirror Pond, can strike at it; clans with no way into the badlands get none there
  const lands = new Set<string>(), count = Object.fromEntries(CLAN_KEYS.map((k) => [k, 0])) as Record<ClanKey, number>;
  for (const k of CLAN_KEYS) for (const lv of [25, 30, 35, 40]) for (const w of writOffers(s, k, lv, 4, 7)) {
    count[k]++; lands.add(w.land);
    assert.equal(TERRITORIES[w.t].region, "badlands", `${k} Lv ${lv}: ${w.land}`);
  }
  assert.ok(count.redfang > 0 && count.wardens > 0, `the Rustwater board has writs (${JSON.stringify(count)})`);
  assert.ok(lands.size >= 3, `writs across the badlands (${[...lands].join(", ")})`);
  for (const k of CLAN_KEYS) for (const lv of [22, 30]) for (const w of writOffers(s, k, lv, 3, 5)) assert.notEqual(TERRITORIES[w.t].region, "badlands", "the moors' board keeps to the moors");
});

test("regions: the Ropewell board offers the sinkholes' writs (it came back empty before the sinkholes were at war)", () => {
  const s = newWar(), lines = caravanLines(s.owner);
  assert.ok(lines.some((l) => TERRITORIES[l.a].region === "sinkholes"), "the Hide-Kin run carts in the sinkholes");
  const sl = territoryByName("Sunken Lake")!.id, hd = territoryByName("Hollowbrook Dells")!.id;
  assert.equal(caravanRoute(sl, hd), undefined, "no road through the Sinkway");
  // on a new war the Hide-Kin hold the whole land (clear and hold writs at home) and the Wardens, over the Sinkway from
  // Sunken Lake, can strike at it; clans with no way into the sinkholes get none there
  const lands = new Set<string>(), count = Object.fromEntries(CLAN_KEYS.map((k) => [k, 0])) as Record<ClanKey, number>;
  for (const k of CLAN_KEYS) for (const lv of [30, 35, 40, 45]) for (const w of writOffers(s, k, lv, 5, 7)) {
    count[k]++; lands.add(w.land);
    assert.equal(TERRITORIES[w.t].region, "sinkholes", `${k} Lv ${lv}: ${w.land}`);
  }
  assert.ok(count.hidekin > 0 && count.wardens > 0, `the Ropewell board has writs (${JSON.stringify(count)})`);
  assert.ok(lands.size >= 3, `writs across the sinkholes (${[...lands].join(", ")})`);
  for (const k of CLAN_KEYS) for (const lv of [30, 35]) for (const w of writOffers(s, k, lv, 4, 5)) assert.notEqual(TERRITORIES[w.t].region, "sinkholes", "the Rustwater board keeps to the badlands");
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

/**
 * The Host's and Redfang's Oakvale footholds (capitals since the sinkholes joined): a capital always starts with its
 * clan, so an old save's holder there gives way (Control 100, no siege); forts and pressure stay.
 */
const FOOTHOLDS: Record<string, ClanKey> = { "Stormbreak Crags": "host", "Heronwreck Strand": "redfang" };
/** An old land carried by name: holder, Control, forts, pressure and siege as saved (or the foothold's clan, see FOOTHOLDS). */
function assertKept(m: SavedWar, w: SavedWar, n: string, i: number, j: number) {
  const cap = FOOTHOLDS[n], took = !!cap && w.state.owner[j] !== cap;
  assert.equal(m.state.owner[i], cap ?? w.state.owner[j], `${n} keeps its holder${cap ? " (or its foothold clan's)" : ""}`);
  assert.equal(m.state.control[i], took ? 100 : w.state.control[j], `${n} keeps its Control`);
  assert.equal(m.state.fort[i], w.state.fort[j]);
  assert.equal(m.state.pressure[i], w.state.pressure[j]);
  assert.deepEqual(m.state.siege[i], took ? null : w.state.siege[j]);
}

/** The sinkholes as a migrated save must have them: all the Hide-Kin's (home clan; Hidehall their capital), Control 100, no forts, sieges or pressure. */
function assertSinkholesSeeded(m: SavedWar) {
  const sink = TERRITORIES.filter((t) => t.region === "sinkholes");
  assert.equal(sink.length, 10);
  for (const t of sink) {
    assert.equal(m.state.owner[t.id], "hidekin", `${t.name}: the Hide-Kin's`); assert.equal(m.state.control[t.id], 100, t.name);
    assert.equal(m.state.fort[t.id], 0); assert.equal(m.state.siege[t.id], null); assert.equal(m.state.pressure[t.id], 0);
  }
}

/** Checks a pre-moors war carried onto today's map: by name the same everywhere; in the moors the Grey Ring the Wardens' (a capital), the rest the Host's, all at Control 100. */
function assertCarried(m: SavedWar, w: SavedWar) {
  const all = names();
  assert.deepEqual(m.names, all);
  assert.equal(m.state.owner.length, TERRITORIES.length);
  LIVE_PRE_MOORS.forEach(([n], j) => {
    const i = all.indexOf(n);
    assert.ok(i >= 0, `${n} is still on the map`);
    assertKept(m, w, n, i, j);
  });
  assert.equal(m.state.owner[all.indexOf("Stormbreak Crags")], "host", "Redfang held the crags: the Host's foothold now");
  assert.equal(m.state.owner[all.indexOf("Thornwood")], "hidekin", "the Hide-Kin's former forward capitals keep their holder");
  assert.equal(m.state.owner[all.indexOf("The Humpback Mesas")], "hidekin");
  const gk = all.indexOf("Greywatch Keep"), kh = all.indexOf("Kharsun, the Buried City");
  assert.equal(m.state.owner[gk], "redfang", "the former forward capital keeps its holder (and its siege)");
  assert.deepEqual(m.state.siege[gk], { by: "host", at: 812 });
  assert.equal(m.state.owner[kh], "host");
  const moors = TERRITORIES.filter((t) => t.region === "moors");
  assert.equal(moors.length, 11);
  for (const t of moors) {
    assert.equal(m.state.owner[t.id], t.name === "The Grey Ring" ? "wardens" : "host", `${t.name}: its clan's`); assert.equal(m.state.control[t.id], 100, t.name);
    assert.equal(m.state.fort[t.id], 0); assert.equal(m.state.siege[t.id], null); assert.equal(m.state.pressure[t.id], 0);
  }
  assertBadlandsSeeded(m);
  assertSinkholesSeeded(m);
  const rh = all.indexOf("Redfang Hollow"), dc = all.indexOf("Dustrider Camp");
  assert.equal(m.state.owner[rh], "redfang", "Redfang's former forward capitals keep their holder");
  assert.equal(m.state.owner[dc], "redfang");
  assert.equal(m.state.tick, w.state.tick);
  assert.deepEqual(m.state.army, w.state.army);
  assert.equal(m.minds.host.target, gk);
  assert.equal(m.minds.veiled.feint, kh);
  assert.deepEqual(m.log, [{ ...w.log[0], t: gk }]);
}

/** The badlands as a migrated save must have them: all Redfang's (home clan; Fangrock its capital), Control 100, no forts, sieges or pressure. */
function assertBadlandsSeeded(m: SavedWar) {
  const bad = TERRITORIES.filter((t) => t.region === "badlands");
  assert.equal(bad.length, 10);
  for (const t of bad) {
    assert.equal(m.state.owner[t.id], "redfang", `${t.name}: Redfang's`); assert.equal(m.state.control[t.id], 100, t.name);
    assert.equal(m.state.fort[t.id], 0); assert.equal(m.state.siege[t.id], null); assert.equal(m.state.pressure[t.id], 0);
  }
}

/**
 * The live war on the moors map, before the badlands joined (PRE_BADLANDS_NAMES order): the pre-moors holders, the moors
 * held by the Host but the Grey Ring (the Wardens) and Sorrow Mire (taken by the Veiled), Redfang still on its forward capitals.
 */
const LIVE_PRE_BADLANDS: [string, ClanKey][] = [...LIVE_PRE_MOORS, ["The Grey Ring", "wardens"], ["Sorrow Mire", "veiled"], ["Thane's Rest", "host"],
  ["The Cairnfield", "host"], ["Blackwater Fen", "host"], ["The Hollow Mounds", "host"], ["The Drowned Hollow", "host"], ["The Nine Widows", "host"],
  ["The Weeping Stones", "host"], ["Kingsbarrow", "host"], ["The Host's Muster", "host"]];

/** That war as the server saved it (named, as every save on that map is; or not, the unnamed fallback), mid-fight. */
function livePreBadlands(named: boolean): SavedWar {
  const n = LIVE_PRE_BADLANDS.length, owner = LIVE_PRE_BADLANDS.map(([, k]) => k);
  const control = owner.map((_, i) => 30 + ((i * 13) % 70)), fort = owner.map((_, i) => (i % 5) / 5), pressure = owner.map((_, i) => (i * 11) % 40);
  const rh = LIVE_PRE_BADLANDS.findIndex(([x]) => x === "Redfang Hollow"), sm = LIVE_PRE_BADLANDS.findIndex(([x]) => x === "Sorrow Mire");
  const siege: WarState["siege"] = Array(n).fill(null); siege[rh] = { by: "veiled", at: 2003 }; siege[sm] = { by: "host", at: 2001 };
  const minds = newMinds(); minds.veiled.target = rh; minds.veiled.since = 1990; minds.host.feint = sm;
  const army = Object.fromEntries(CLAN_KEYS.map((k, i) => [k, 300 - i * 30])) as Record<ClanKey, number>;
  const log = [{ at: 2, tick: 1999, kind: "siege" as const, t: rh, by: "veiled" as const, from: "redfang" as const, text: "The Veiled Circle lay siege to Redfang Hollow" }];
  return { v: 1, state: { tick: 2000, owner, control, fort, siege, pressure, army }, minds, next: 5_000_000_000_000, log, ...(named ? { names: LIVE_PRE_BADLANDS.map(([x]) => x) } : {}) };
}

/** Checks a pre-badlands war carried onto today's map: Acts 1-3 by name unchanged (ids too), the badlands seeded for Redfang. */
function assertCarriedBadlands(m: SavedWar, w: SavedWar) {
  const all = names();
  assert.deepEqual(m.names, all);
  LIVE_PRE_BADLANDS.forEach(([n], j) => {
    assert.equal(all.indexOf(n), j, `${n} keeps its id`);
    assertKept(m, w, n, j, j);
  });
  const rh = all.indexOf("Redfang Hollow"), dc = all.indexOf("Dustrider Camp");
  assert.equal(m.state.owner[rh], "redfang", "the former forward capital keeps its holder and its siege (no capital override)");
  assert.deepEqual(m.state.siege[rh], { by: "veiled", at: 2003 });
  assert.equal(m.state.owner[dc], "redfang");
  assertBadlandsSeeded(m);
  assertSinkholesSeeded(m);
  assert.equal(m.state.tick, w.state.tick);
  assert.deepEqual(m.state.army, w.state.army);
  assert.equal(m.minds.veiled.target, rh);
  assert.equal(m.minds.host.feint, all.indexOf("Sorrow Mire"));
  assert.deepEqual(m.log, w.log);
}

/**
 * The live war on the badlands map, before the sinkholes joined (PRE_SINKHOLES_NAMES order): the pre-badlands holders,
 * the badlands Redfang's but the Saltlick Flats (taken by the Wardens over the Red Pass), the Hide-Kin still on their
 * forward capitals (Thornwood, the Humpback Mesas).
 */
const LIVE_PRE_SINKHOLES: [string, ClanKey][] = [...LIVE_PRE_BADLANDS, ["The Saltlick Flats", "wardens"], ["Drovers' Draw", "redfang"],
  ["The Hanging Arches", "redfang"], ["The Cinnabar Pits", "redfang"], ["Bloodstone Mesa", "redfang"], ["Talon Fort", "redfang"],
  ["Vulture's Roost", "redfang"], ["Rattlesnake Gulch", "redfang"], ["Gallows Canyon", "redfang"], ["Fangrock", "redfang"]];

/** That war as the server saved it (named, as every save on that map is; or not, the unnamed fallback), mid-fight. */
function livePreSinkholes(named: boolean): SavedWar {
  const n = LIVE_PRE_SINKHOLES.length, owner = LIVE_PRE_SINKHOLES.map(([, k]) => k);
  const control = owner.map((_, i) => 25 + ((i * 19) % 75)), fort = owner.map((_, i) => (i % 3) / 3), pressure = owner.map((_, i) => (i * 5) % 45);
  const th = LIVE_PRE_SINKHOLES.findIndex(([x]) => x === "Thornwood"), sf = LIVE_PRE_SINKHOLES.findIndex(([x]) => x === "The Saltlick Flats");
  const sc = LIVE_PRE_SINKHOLES.findIndex(([x]) => x === "Stormbreak Crags");
  const siege: WarState["siege"] = Array(n).fill(null); siege[th] = { by: "wardens", at: 3005 }; siege[sf] = { by: "redfang", at: 3002 }; siege[sc] = { by: "veiled", at: 3004 };
  const minds = newMinds(); minds.wardens.target = th; minds.wardens.since = 2990; minds.redfang.feint = sf;
  const army = Object.fromEntries(CLAN_KEYS.map((k, i) => [k, 250 + i * 20])) as Record<ClanKey, number>;
  const log = [{ at: 3, tick: 2999, kind: "siege" as const, t: th, by: "wardens" as const, from: "hidekin" as const, text: "The Wardens lay siege to Thornwood" }];
  return { v: 1, state: { tick: 3000, owner, control, fort, siege, pressure, army }, minds, next: 5_000_000_000_000, log, ...(named ? { names: LIVE_PRE_SINKHOLES.map(([x]) => x) } : {}) };
}

/** Checks a pre-sinkholes war carried onto today's map: Acts 1-4 by name unchanged (ids too) but the footholds, the sinkholes seeded for the Hide-Kin. */
function assertCarriedSinkholes(m: SavedWar, w: SavedWar) {
  const all = names();
  assert.deepEqual(m.names, all);
  assert.equal(m.state.owner.length, TERRITORIES.length);
  LIVE_PRE_SINKHOLES.forEach(([n], j) => {
    assert.equal(all.indexOf(n), j, `${n} keeps its id`);
    assertKept(m, w, n, j, j);
  });
  const th = all.indexOf("Thornwood"), hm = all.indexOf("The Humpback Mesas"), sc = all.indexOf("Stormbreak Crags");
  assert.equal(m.state.owner[th], "hidekin", "the former forward capital keeps its holder and its siege (no capital override)");
  assert.deepEqual(m.state.siege[th], { by: "wardens", at: 3005 });
  assert.equal(m.state.owner[hm], "hidekin");
  assert.equal(m.state.owner[sc], "host", "Redfang held the crags: the Host's foothold now, at Control 100, the siege lifted");
  assert.equal(m.state.control[sc], 100); assert.equal(m.state.siege[sc], null);
  assert.equal(m.state.owner[all.indexOf("Heronwreck Strand")], "redfang");
  assert.equal(m.state.owner[all.indexOf("The Saltlick Flats")], "wardens", "the badlands keep their holders");
  assertSinkholesSeeded(m);
  assert.equal(m.state.tick, w.state.tick);
  assert.deepEqual(m.state.army, w.state.army);
  assert.equal(m.minds.wardens.target, th);
  assert.equal(m.minds.redfang.feint, all.indexOf("The Saltlick Flats"));
  assert.deepEqual(m.log, w.log);
}

test("migrateWar: the live pre-sinkholes war goes on (Acts 1-4 unchanged but the footholds, the sinkholes all the Hide-Kin's at Control 100)", () => {
  assert.deepEqual(LIVE_PRE_SINKHOLES.map(([n]) => n), [...PRE_SINKHOLES_NAMES], "the server's frozen list is the badlands-era map");
  const w = livePreSinkholes(true);
  assertCarriedSinkholes(migrateWar(w, w.names!, names()), w);
});

test("war save: the live pre-sinkholes save loads onto the sinkholes map (named or not), the old save kept aside", async () => {
  try {
    for (const named of [true, false]) {
      const w = livePreSinkholes(named), store = memKv(w);
      _resetWar(undefined); stopWar();
      await startWar(store.kv);
      assertCarriedSinkholes({ ...w, state: warState()!, names: names(), minds: w.minds, log: warLog() } as SavedWar, w);
      const kept = [...store.m.keys()].filter((k) => k.startsWith("war-old-"));
      assert.equal(kept.length, 1, "the old save is kept aside");
      assert.deepEqual(JSON.parse(store.m.get(kept[0])!), w);
      stopWar();
    }
  } finally { stopWar(); _resetWar(); }
});

test("migrateWar: the live pre-badlands war goes on (Acts 1-3 unchanged, the badlands all Redfang's at Control 100)", () => {
  assert.deepEqual(LIVE_PRE_BADLANDS.map(([n]) => n), [...PRE_BADLANDS_NAMES], "the server's frozen list is the moors-era map");
  const w = livePreBadlands(true);
  assertCarriedBadlands(migrateWar(w, w.names!, names()), w);
});

test("war save: the live pre-badlands save loads onto the badlands map (named or not), the old save kept aside", async () => {
  try {
    for (const named of [true, false]) {
      const w = livePreBadlands(named), store = memKv(w);
      _resetWar(undefined); stopWar();
      await startWar(store.kv);
      assertCarriedBadlands({ ...w, state: warState()!, names: names(), minds: w.minds, log: warLog() } as SavedWar, w);
      const kept = [...store.m.keys()].filter((k) => k.startsWith("war-old-"));
      assert.equal(kept.length, 1, "the old save is kept aside");
      assert.deepEqual(JSON.parse(store.m.get(kept[0])!), w);
      stopWar();
    }
  } finally { stopWar(); _resetWar(); }
});

test("migrateWar: the live pre-moors war goes on (holders unchanged elsewhere; the Grey Ring the Wardens', the other moors the Host's, Control 100)", () => {
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
  // added: the save predates Stormbreak Crags (the Host's foothold, in the Wardens' land) and the plain Mirror Pond
  const gone = ["Stormbreak Crags", "Mirror Pond"], keep = all.map((n, i) => i).filter((i) => !gone.includes(all[i]));
  const pick = <T>(a: T[]) => keep.map((i) => a[i]);
  const older: SavedWar = { ...w, state: { ...w.state, owner: pick(w.state.owner), control: pick(w.state.control), fort: pick(w.state.fort), siege: pick(w.state.siege), pressure: pick(w.state.pressure) },
    minds: newMinds(), log: [] };
  const m = migrateWar(older, keep.map((i) => all[i]), all);
  const th = all.indexOf("Stormbreak Crags"), mp = all.indexOf("Mirror Pond");
  assert.equal(m.state.owner[th], "host", "a new capital goes to its clan, not its land's home clan");
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
