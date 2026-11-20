// Capturable towns (W6, shared/war/towns.ts; server/war.ts keeps their state): the table's spots, the contest rules,
// the price, the save, the war's income hook (golden without it), and the NPCs a town changing hands never touches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE } from "../shared/constants";
import { AREAS, isSafeZone, isSolidTile } from "../shared/map";
import { blocked } from "../shared/movement";
import { NPCS, isDecorSolidAt, npcById } from "../shared/npcs";
import { noMobsAt } from "../shared/spawns";
import { inVillage } from "../shared/wrath";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds, scriptedOrders } from "../shared/war/doctrine";
import { inSackReach } from "../shared/war/holdSack";
import { newWar, townCount, WAR, warTick, type TickExtra } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { STEWARD_LINES, STEWARD_NAMES, stewardLine, stewardName } from "../shared/war/townText";
import {
  cleanTownsMsg, gatePosts, gatePx, keepOut, onTownGround, TOWN, TOWN_IDS, townAt, townCounts, townIncome, townPatron, townPrice, TOWNS, townStep, townsView,
} from "../shared/war/towns";
import { QUESTS } from "../shared/quests";
import { _resetWar, _setTown, _stepTowns, _townsHeld, cleanTownSave, migrateWar, townClaim, townHeld, townsNow, warLog, warState, warTowns, type SavedWar } from "../server/war";

const C = (x: number, y: number) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE });

test("towns: the table (patrons exist and are not capitals, spots on free ground, gates off town ground and safe squares)", () => {
  // the highway villages (settlement network step 4, shared/villages.ts) after the first four, appended
  assert.deepEqual(TOWN_IDS, ["saltmere", "rustwater", "ropewell", "millbrook", "turfhallow", "staithe", "barrowstead", "redlode", "hornstead", "windlass", "hempfield", "saltglass", "lastwell"]);
  assert.equal(new Set(TOWN_IDS).size, TOWNS.length);
  for (const n of ["Oakvale", "Cairnwatch", "Hunter's Camp", "Kel Ashar"]) assert.ok(!TOWNS.some((t) => t.area === n || t.name === n), `${n} is never capturable`);
  for (const t of TOWNS) {
    const p = townPatron(t.id), a = AREAS.find((z) => z.name === t.area)!, r = keepOut(t)!;
    assert.ok(a, `${t.id}: its area exists`);
    assert.ok(p >= 0, `${t.id}: its patron land ${t.patron} is a territory`);
    assert.ok(!TERRITORIES[p].capitalOf, `${t.id}: its patron is not a capital`);
    for (const s of [t.gate, t.steward, ...t.banners]) {
      assert.ok(!isSolidTile(s.x, s.y) && !isDecorSolidAt(C(s.x, s.y).x, C(s.x, s.y).y), `${t.id}: tile ${s.x},${s.y} is free`);
    }
    for (const s of [t.steward, ...t.banners]) assert.equal(townAt(C(s.x, s.y).x, C(s.x, s.y).y)?.id, t.id, `${t.id}: steward and banners stand in the town`);
    const g = gatePx(t), out = Math.max(r.x0 - t.gate.x - 1, t.gate.x - r.x1 + 1, r.y0 - t.gate.y - 1, t.gate.y - r.y1 + 1) + 1;
    assert.ok(out >= TOWN.gateClearTiles, `${t.id}: the gate stands ${TOWN.gateClearTiles}+ tiles off town ground (${out})`);
    for (const q of gatePosts(t)) {
      assert.ok(!isSafeZone(q.x, q.y) && !noMobsAt(q.x, q.y) && !inVillage(q.x, q.y) && !onTownGround(q.x, q.y), `${t.id}: guard post off safe and town ground`);
      assert.ok(!blocked(q.x, q.y), `${t.id}: guard post on walkable ground`);
      assert.ok(Math.hypot(q.x - g.x, q.y - g.y) <= TOWN.reachPx, `${t.id}: guard post within the gate's reach`);
    }
    // the gate's whole reach and leash stay off town ground near the gate: no guard post, and the gate itself, ever on it
    assert.ok(!TERRITORIES.some((l) => inSackReach(l.id, g.x, g.y)), `${t.id}: the gate is clear of every Hold's reach`);
  }
});

test("towns: stewards are plain NPCs at the table's spot, clear of the traders; no quest gives from them", () => {
  for (const t of TOWNS) {
    const n = npcById(`steward_${t.id}`)!;
    assert.ok(n, `${t.id}: a steward NPC`);
    assert.equal(Math.floor(n.x / TILE), t.steward.x); assert.equal(Math.floor(n.y / TILE), t.steward.y);
    assert.equal(n.shop, undefined); assert.equal(n.where, undefined);
    assert.ok(!QUESTS.some((q) => q.giver === n.id), "no quest");
    for (const o of NPCS) if (o.id !== n.id) assert.ok(Math.hypot(o.x - n.x, o.y - n.y) >= 3 * TILE, `${n.id} stands 3+ tiles from ${o.id} (the trader beside a hero stays the nearest NPC)`);
    for (const k of CLAN_KEYS) { assert.ok(stewardName(k, t.id)); assert.ok(STEWARD_NAMES[k][t.id]); assert.ok(STEWARD_LINES[k].length > 0); assert.match(stewardLine(k, t.name, 7), new RegExp(t.name.replace(/^the /, ""))); }
  }
});

test("towns: townStep contests, extends (capped), calls off, restarts and submits", () => {
  assert.deepEqual(townStep(undefined, "redfang", 5), { s: { k: "redfang" } }, "a new town takes its land's holder");
  assert.deepEqual(townStep({ k: "wardens" }, "wardens", 5), { s: { k: "wardens" } }, "no change while the land stays");
  let r = townStep({ k: "wardens" }, "redfang", 10);
  assert.equal(r.change, "contested");
  assert.deepEqual(r.s, { k: "wardens", c: { by: "redfang", until: 13, ext: 0 } });
  r = townStep(r.s, "redfang", 11); assert.equal(r.change, undefined);
  r = townStep(r.s, "redfang", 12); assert.equal(r.change, undefined);
  r = townStep(r.s, "redfang", 13); assert.equal(r.change, "submitted"); assert.deepEqual(r.s, { k: "redfang" }, "submits after graceTicks");
  // held gates add a tick each, at most maxExt
  let s = townStep({ k: "wardens" }, "redfang", 0).s, t = 0;
  while (s.c) { t++; s = townStep(s, "redfang", t, true).s; }
  assert.equal(t, TOWN.graceTicks + TOWN.maxExt, "held every tick: graceTicks + maxExt ticks");
  // the land goes back: called off; a third clan takes it: starts over
  const c = townStep({ k: "wardens" }, "redfang", 0).s;
  assert.deepEqual(townStep(c, "wardens", 1), { s: { k: "wardens" }, change: "off" });
  const third = townStep(c, "veiled", 2);
  assert.equal(third.change, "contested"); assert.deepEqual(third.s.c, { by: "veiled", until: 2 + TOWN.graceTicks, ext: 0 });
});

test("towns: townPrice gives the holder's sworn 10% off, never a surcharge; the view and its cleaner", () => {
  const salt = TOWNS[0];
  assert.equal(townPrice(60, salt, "redfang", "redfang"), 54);
  assert.equal(townPrice(60, salt, "redfang", "wardens"), 60);
  assert.equal(townPrice(60, salt, "redfang", undefined), 60);
  assert.equal(townPrice(60, undefined, "redfang", "redfang"), 60, "outside a capturable town");
  for (const b of [1, 2, 7, 60, 999, 10000]) for (const k of [...CLAN_KEYS, undefined]) assert.ok(townPrice(b, salt, "host", k) <= b && townPrice(b, salt, "host", k) >= 1);
  const v = townsView({ saltmere: { k: "wardens", c: { by: "redfang", until: 13, ext: 0 } }, ropewell: { k: "host" } }, 10, 1_000_000, { saltmere: 42.7 });
  assert.deepEqual(v.list[0], { id: "saltmere", k: 0, c: { by: 1, until: 1_000_000 + 2 * WAR.tickMs }, raise: 42 }, "submits when the war ticks to 13: two ticks after the next");
  assert.deepEqual(cleanTownsMsg(v), v);
  assert.deepEqual(cleanTownsMsg({ list: [{ id: "oakvale", k: 0 }, { id: "saltmere", k: 9 }, null, { id: "ropewell", k: 2, c: { by: "x" }, raise: 500 }] }), { list: [{ id: "ropewell", k: 2, raise: 100 }] });
  assert.deepEqual(cleanTownsMsg("junk"), { list: [] });
  assert.deepEqual(townCounts({ saltmere: { k: "wardens" }, ropewell: { k: "wardens" }, millbrook: { k: "host" } }), { wardens: 2, host: 1 });
  // the highway villages count half a town each (owner question Q1 of step 4: half the income); Millbrook stays whole
  assert.deepEqual(townCounts({ saltmere: { k: "wardens" }, turfhallow: { k: "wardens" }, redlode: { k: "host" }, hornstead: { k: "host" }, staithe: { k: "veiled" } }), { wardens: 1.5, host: 1, veiled: 0.5 });
  assert.deepEqual(TOWNS.map((t) => townIncome(t)), [1, 1, 1, 1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
  assert.equal(townCount({ wardens: 1.5 }, "wardens"), 1.5);
  assert.equal(townCount({ wardens: 1.7 }, "wardens"), 1.5, "steps of a half");
  assert.equal(townCount({ wardens: 0.5 }, "wardens"), 0.5);
  const k: ClanKey = "redfang", inc = (n: number) => warTick(newWar(), {}, { towns: { [k]: n } }).army[k] - warTick(newWar(), {}, { towns: {} }).army[k];
  assert.ok(Math.abs(inc(0.5) - WAR.townIncome * 0.5) < 1e-9 && Math.abs(inc(1) - WAR.townIncome) < 1e-9, "a held village adds half WAR.townIncome a tick");
});

test("towns: the save field is cleaned on load (missing: the lands' holders), a map change drops it, the same map keeps it", () => {
  const owner = newWar().owner;
  const none = cleanTownSave(undefined, owner);
  for (const t of TOWNS) assert.deepEqual(none[t.id], { k: owner[townPatron(t.id)] }, `${t.id}: its land's holder`);
  const got = cleanTownSave({ saltmere: { k: "host", c: { by: "host", until: 5, ext: 0 } }, ropewell: { k: "nobody" }, rustwater: { k: "veiled", c: { by: "redfang", until: 7.5, ext: 99 } }, atlantis: { k: "host" } }, owner);
  assert.deepEqual(got.saltmere, { k: "host" }, "a contest by the holder itself is dropped");
  assert.deepEqual(got.ropewell, { k: owner[townPatron("ropewell")] }, "a bad holder: the land's");
  assert.deepEqual(got.rustwater, { k: "veiled", c: { by: "redfang", until: 7, ext: TOWN.maxExt } });
  assert.ok(!("atlantis" in got));
  const names = TERRITORIES.map((t) => t.name);
  const saved: SavedWar = { v: 1, state: newWar(), minds: newMinds(), next: 0, log: [], names, towns: { saltmere: { k: "host" } } };
  assert.deepEqual(migrateWar(saved, names, names).towns, { saltmere: { k: "host" } }, "same map: kept");
  assert.equal(migrateWar(saved, names, [...names, "Somewhere New"], [...TERRITORIES]).towns, undefined, "a map change drops it");
});

function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** tests/warbattles.test.ts golden (refreshed with it for the Crown's map): 600 seeded ticks with valor and march extras, plus a towns extra. */
function golden(towns?: TickExtra["towns"]): string {
  const s = newWar(), minds = newMinds(), rnd = mulberry(5005), trace: number[] = [];
  for (let i = 0; i < 600; i++) {
    const o = scriptedOrders(s, minds, rnd);
    warTick(s, o, { valor: i % 5 === 2 ? s.owner.map((_, t) => (t % 4 === 1 ? { [CLAN_KEYS[i % 5]]: 15 } : {})) : undefined,
      march: i % 3 === 0 ? [{ t: i % s.owner.length, k: CLAN_KEYS[(i >> 1) % 5], mult: 0.6 }] : undefined, ...(towns ? { towns } : {}) });
    trace.push(s.pressure.reduce((a, b) => a + b, 0), s.control.reduce((a, b) => a + b, 0));
  }
  const json = JSON.stringify({ s, trace }, (_k, v) => (typeof v === "number" ? Number(v.toFixed(6)) : v));
  let h = 2166136261;
  for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}

test("towns: warTick without towns (or with none held, or junk) plays exactly as before W6; held towns add WAR.townIncome", () => {
  assert.equal(golden(), "84b1edf0");
  assert.equal(golden({}), "84b1edf0");
  assert.equal(golden({ wardens: 0, redfang: -3, host: NaN, nobody: 4 } as unknown as TickExtra["towns"]), "84b1edf0");
  assert.notEqual(golden({ redfang: 2 }), "84b1edf0");
  const a = newWar(), b = newWar();
  warTick(a, {}, { phase: 0 }); warTick(b, {}, { phase: 0, towns: { redfang: 2, host: 99 } });
  assert.ok(Math.abs(b.army.redfang - a.army.redfang - 2 * WAR.townIncome) < 1e-9, "two towns: +1 troop");
  assert.ok(Math.abs(b.army.host - a.army.host - 16 * WAR.townIncome) < 1e-9, "a silly count is capped");
});

test("towns (war): a land changing hands contests its town; held gates extend; it submits; the land back calls it off; a claim flips at once", () => {
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });
  const s = warState()!, p = townPatron("saltmere"), own = s.owner[p], foe = CLAN_KEYS.find((k) => k !== own)!;
  assert.deepEqual(warTowns().saltmere, { k: own }, "an old save without towns: each town takes its land's holder");
  assert.equal(_stepTowns().length, 0, "no town is contested while its land stays");
  assert.equal(townHeld("saltmere"), false, "a gate is only held in a contest");
  s.owner[p] = foe;
  let ev = _stepTowns();
  assert.equal(ev.length, 1); assert.equal(ev[0].kind, "town"); assert.equal(ev[0].change, "contested"); assert.equal(ev[0].by, foe);
  assert.deepEqual(warTowns().saltmere.c, { by: foe, until: s.tick + TOWN.graceTicks, ext: 0 });
  assert.equal(townsNow().list.find((x) => x.id === "saltmere")!.c!.by, CLAN_KEYS.indexOf(foe));
  s.tick++; assert.ok(townHeld("saltmere")); assert.deepEqual(_townsHeld(), ["saltmere"]);
  _stepTowns(); assert.equal(warTowns().saltmere.c!.ext, 1, "held: a tick more"); assert.deepEqual(_townsHeld(), [], "cleared each tick");
  for (let i = 0; i < 2; i++) { s.tick++; _stepTowns(); }
  assert.ok(warTowns().saltmere.c);
  s.tick++; ev = _stepTowns();
  assert.equal(ev[0]?.change, "submitted"); assert.deepEqual(warTowns().saltmere, { k: foe });
  // the land goes back during a contest: called off
  s.owner[p] = own; s.tick++; assert.equal(_stepTowns()[0]?.change, "contested");
  s.owner[p] = foe; s.tick++; assert.equal(_stepTowns()[0]?.change, "off"); assert.deepEqual(warTowns().saltmere, { k: foe });
  // a claim: only by the contester, at once
  s.owner[p] = own; s.tick++; _stepTowns();
  const third = CLAN_KEYS.find((k) => k !== own && k !== foe)!;
  assert.equal(townClaim("saltmere", third), false); assert.equal(townClaim("saltmere", foe), false); assert.equal(townClaim("atlantis", own), false);
  assert.equal(townClaim("saltmere", own, "Tester"), true);
  assert.deepEqual(warTowns().saltmere, { k: own });
  assert.ok(warLog(5).some((e) => e.kind === "town" && e.change === "claimed" && /Tester/.test(e.text)));
  _setTown("saltmere", { k: own });
});

test("towns: no NPC moves, changes or loses its quests when towns change hands", () => {
  const before = JSON.stringify(NPCS);
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] });
  const s = warState()!;
  for (const t of TOWNS) { s.owner[townPatron(t.id)] = CLAN_KEYS.find((k) => k !== s.owner[townPatron(t.id)])!; }
  for (let i = 0; i < 5; i++) { s.tick++; _stepTowns(); }
  assert.ok(TOWNS.every((t) => warTowns()[t.id].k === s.owner[townPatron(t.id)]), "every town submitted");
  assert.equal(JSON.stringify(NPCS), before);
});
