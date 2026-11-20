// The Crown of the Marches at war (Crown PR3, 2026-11-16): ten territories (ids 62-71), no capital, the five approaches
// held by the clans whose Crownways lead into them (`wards`), the Crown Keep held by the clan with the least land and
// never moved by the armies (`reckoningOnly`: only a Reckoning, Crown PR4, hands it on).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CROWN_LANDS, CROWNWAYS, crownGateTile, CR, TOLLCROSS } from "../shared/crown";
import { SPAWN_ZONES } from "../shared/spawns";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds, scriptedOrders } from "../shared/war/doctrine";
import { regionByKey } from "../shared/war/regions";
import { bordersOf, landOf, newWar, nightRaid, sackHold, targetsOf, warTick, WAR, type WarState } from "../shared/war/rules";
import { holdOf, musterOf, STANDARDS, STANDARD } from "../shared/war/standards";
import { initialOwners, isSanctuary, leastLanded, linkPairs, TERRITORIES, territoryByName } from "../shared/war/territories";

const CROWN = TERRITORIES.filter((t) => t.region === "crown");
const KEEP = territoryByName("The Crown Keep")!;
const homeOf = (land: string) => regionByKey(land)!.home!;

test("crown war: ten territories after the homelands (ids 62-71), no capital; the Throne Hall and the open Crown stay out", () => {
  assert.deepEqual(CROWN.map((t) => t.id), [62, 63, 64, 65, 66, 67, 68, 69, 70, 71]);
  assert.deepEqual(CROWN.map((t) => t.name).sort(), CROWN_LANDS.map((l) => l.name).sort());
  assert.ok(CROWN.every((t) => t.act === 6 && !t.capitalOf && !t.forward));
  for (const n of ["The Throne Hall", "The Crown of the Marches"]) {
    assert.ok(isSanctuary(SPAWN_ZONES.find((z) => z.name === n)!), n);
    assert.equal(territoryByName(n), undefined, n);
  }
  const X = { ...TOLLCROSS, y: CR(TOLLCROSS.y) }; // the Truce Market is a safe hub: in no territory
  for (const t of TERRITORIES) assert.ok(t.x >= X.x + X.w || X.x >= t.x + t.w || t.y >= X.y + X.h || X.y >= t.y + t.h, `${t.name} overlaps Tollcross`);
  // every Crown territory has its muster, on the patch its land keeps clear (shared/crown.ts CROWN_LANDS) unless the land
  // is fortified (then at its fort: beside a pass or junction, standards.ts HOLD_SITES), and its standards
  for (const t of CROWN) {
    const m = musterOf(t.id), f = holdOf(t.id), l = CROWN_LANDS.find((x) => x.name === t.name)!, h = f ?? m;
    assert.ok(m, `${t.name}: a muster`);
    if (f) assert.deepEqual([m!.x, m!.y], [f.x, f.y], `${t.name}: musters at its fort`);
    else assert.deepEqual([m!.x / 32 - 0.5, m!.y / 32 - 0.5], [l.hold[0], CR(l.hold[1])], `${t.name}: on its patch`);
    const st = STANDARDS.filter((s) => s.t === t.id);
    assert.ok(st.length >= 1, `${t.name}: a standard`);
    for (const s of st) assert.ok(Math.hypot(s.x - h!.x, s.y - h!.y) > STANDARD.range + 2 * 32, `${t.name}: standard clear of the Hold`);
  }
});

test("crown war: each homeland's border road to the Crown joins its rim to the approach its Crownway opens into, warded by that homeland's clan", () => {
  // since the coherence review (2026-11-20) the war links are the walkable border roads, not the Crownway gates
  const pairs = linkPairs(TERRITORIES).filter((p) => p.link.b === "crown");
  assert.equal(pairs.length, 5);
  assert.deepEqual(Object.fromEntries(pairs.map((p) => [p.link.a, p.link.name])), { oakvale: "The Greenward Road", moors: "The Mourning Road",
    badlands: "The Redgate Road", sinkholes: "The Deep Road", sunscar: "The Sun Road" });
  const wards = new Map<string, ClanKey>();
  for (const c of CROWNWAYS) {
    const p = pairs.find((x) => x.link.a === c.from)!, g = crownGateTile(c), A = TERRITORIES[p.b];
    assert.equal(TERRITORIES[p.a].region, c.from);
    // from an ordinary rim land (the Greenward Road leaves Oakvale at the Stormbreak Crags, no capital any more)
    assert.ok(!TERRITORIES[p.a].capitalOf && !TERRITORIES[p.a].haven, `${p.link.name}: from a fought rim land, not ${TERRITORIES[p.a].name}`);
    assert.ok(g.x >= A.x && g.x < A.x + A.w && g.y >= A.y && g.y < A.y + A.h + 4, `${c.name}: its gate opens into ${A.name}, where ${p.link.name} arrives`);
    assert.equal(A.wards, homeOf(c.from), `${A.name}: warded by ${homeOf(c.from)}`);
    wards.set(A.name, A.wards!);
  }
  assert.equal(TERRITORIES[pairs.find((p) => p.link.a === "oakvale")!.a].name, "Stormbreak Crags");
  assert.equal(TERRITORIES[pairs.find((p) => p.link.a === "oakvale")!.b].name, "The Pilgrims' Way");
  assert.deepEqual(Object.fromEntries(wards), { "The Pilgrims' Way": "wardens", "The Spirefall": "host", "The Field of Statues": "redfang",
    "The Sunken Courts": "hidekin", "The Ember Gardens": "veiled" });
  assert.equal(CROWN.filter((t) => t.wards).length, 5, "the inner lands and the Keep have no warden");
  assert.ok(KEEP.reckoningOnly && !KEEP.wards);
  assert.deepEqual(TERRITORIES.filter((t) => t.reckoningOnly).map((t) => t.name), ["The Crown Keep"]);
});

test("crown war: a new war gives the approaches to their wardens, the inner lands to the clans with the least land, the Keep to the least of all", () => {
  const o = initialOwners();
  for (const t of CROWN) if (t.wards) assert.equal(o[t.id], t.wards, t.name);
  const before = o.map((k, i) => (i === KEEP.id ? undefined : k));
  assert.equal(o[KEEP.id], leastLanded(before), "the Keep: the clan holding the least land without it");
  // the claims in the Crown keep each clan's share of the fought land near a fair one (no clan starts above 16 of the
  // 66 outside the heartland; the Wardens' six Oakvale havens count for nobody, rules.ts landOf)
  for (const k of CLAN_KEYS) { const n = landOf({ owner: o }, k); assert.ok(n >= 12 && n <= 16, `${k}: ${n}`); }
  assert.equal(o.filter((x, i) => x === "wardens" && TERRITORIES[i].haven).length, 6, "the havens start the Wardens'");
  assert.equal(leastLanded(["wardens", "redfang", "redfang", "host", "host", "hidekin", "hidekin", "veiled", "veiled"]), "wardens");
  assert.equal(leastLanded(["wardens", "redfang", "host", "hidekin", "veiled"]), "wardens", "a tie goes to the first in CLAN_KEYS order");
  // a preset (a saved war) is kept; only the unset territories are claimed
  const preset: (ClanKey | undefined)[] = TERRITORIES.map((t) => (t.region === "crown" ? undefined : "redfang"));
  const p = initialOwners(TERRITORIES, preset);
  for (const t of TERRITORIES) if (t.region !== "crown") assert.equal(p[t.id], "redfang");
  for (const t of CROWN) if (t.wards) assert.equal(p[t.id], t.wards);
  assert.notEqual(p[KEEP.id], "redfang", "the Keep goes to a clan with little land");
});

test("crown war: the Keep is never a target, a border to man, a raid's prey or a sack's (it flips only at a Reckoning)", () => {
  const s = newWar(), holder = s.owner[KEEP.id];
  for (const k of CLAN_KEYS) {
    assert.ok(!targetsOf(s, k).includes(KEEP.id), `${k} cannot strike the Keep`);
    assert.ok(!bordersOf(s, k).includes(KEEP.id), `${k}: the Keep needs no defenders`);
  }
  // every clan throws everything at it, valor too: the orders and the valor are dropped, the Keep stays
  const all = Object.fromEntries(CLAN_KEYS.map((k) => [k, { defend: 0, attack: [{ t: KEEP.id, share: 1 }] }]));
  const valor = TERRITORIES.map((t) => (t.id === KEEP.id ? Object.fromEntries(CLAN_KEYS.map((k) => [k, 1000])) : {}));
  for (let i = 0; i < 30; i++) warTick(s, all, { phase: i % 3, valor });
  assert.equal(s.owner[KEEP.id], holder);
  assert.equal(s.pressure[KEEP.id], 0);
  assert.equal(s.siege[KEEP.id], null);
  // a sack does nothing there, even at Control 0
  s.control[KEEP.id] = 0;
  for (const k of CLAN_KEYS) assert.equal(sackHold(s, KEEP.id, k, false), undefined);
  assert.equal(s.siege[KEEP.id], null);
  // the Night Raiders hunt its holder's other lands, never the Keep
  const hunted: WarState = newWar();
  for (const t of TERRITORIES) if (!t.capitalOf || t.capitalOf === holder) hunted.owner[t.id] = holder;
  const raid = nightRaid(hunted, 2);
  assert.ok(raid && raid.clan === holder && !raid.ts.includes(KEEP.id));
});

test("crown war: over long scripted wars the Keep never changes hands and the other Crown lands do", () => {
  let flips = 0;
  for (const seed of [11, 23, 37]) {
    const s = newWar(), minds = newMinds(), holder = s.owner[KEEP.id], start = [...s.owner];
    let a = seed;
    const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
    for (let i = 0; i < 6 * WAR.ticksPerDay; i++) {
      warTick(s, scriptedOrders(s, minds, rnd));
      assert.equal(s.owner[KEEP.id], holder, `seed ${seed}, tick ${i}: the Keep held`);
    }
    flips += CROWN.filter((t) => t.id !== KEEP.id && s.owner[t.id] !== start[t.id]).length;
  }
  assert.ok(flips > 0, "the Crown's other lands are fought over");
});
