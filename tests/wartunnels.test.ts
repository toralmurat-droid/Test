import { test } from "node:test";
import assert from "node:assert/strict";
import { MAP_W, TILE } from "../shared/constants";
import { isSolidAt, PORTAL_SPOTS, SHRINE_SPOT } from "../shared/map";
import { WAYGATE_DESERT, WAYGATE_OAKVALE } from "../shared/desert";
import { CRYPT_DOOR, LINKS, SINKHOLE, UNDER_SHAFT, underground } from "../shared/dungeon";
import { NPC_DECOR, NPCS } from "../shared/npcs";
import { BOARDS } from "../shared/bounty";
import { HOLD_FORT_PX, HOLDS, STANDARD, STANDARDS } from "../shared/war/standards";
import { caravanOffLimits } from "../shared/war/caravans";
import { CLAN_KEYS, CLANS, type ClanKey } from "../shared/war/clans";
import { newMinds, scriptedOrders } from "../shared/war/doctrine";
import { patrolOf } from "../shared/war/patrols";
import { newWar, supplyMap, targetsOf, WAR, warTick, type Orders, type WarState } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { parseTroop, troopName, troopStats, troopWeapon } from "../shared/war/troops";
import { mouthHp, TUNNEL, tunnelLandmarks, tunnelMouth, tunnelPairs, tunnelStrikes } from "../shared/war/tunnels";

const HK: ClanKey = "hidekin";
const clone = (s: WarState): WarState => JSON.parse(JSON.stringify(s));
/** A few war states: the opening and some played on by the scripted leaders (fronts move, tunnels change). */
const STATES: WarState[] = (() => {
  const out = [newWar()], s = newWar(), minds = newMinds();
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 1; i <= 240; i++) { warTick(s, scriptedOrders(s, minds, rnd)); if (i % 60 === 0) out.push(clone(s)); }
  return out;
})();
const only = (o: Orders): Partial<Record<ClanKey, Orders>> => ({ [HK]: o });

test("tunnels: tunnelStrikes lists only Hide-Kin targets with no Hide-Kin land next to them", () => {
  assert.equal(CLANS[HK].doctrine, "tunnel");
  let tunnels = 0, plain = 0;
  for (const s of STATES) {
    const legal = targetsOf(s, HK), got: ReturnType<typeof tunnelStrikes> = [];
    for (let i = 0; i < legal.length; i += 8) got.push(...tunnelStrikes(s, only({ defend: 0.5, attack: legal.slice(i, i + 8).map((t) => ({ t, share: 1 })) }))); // (orders carry 8 attacks at most)
    for (const t of legal) {
      const adj = TERRITORIES[t].near.some((n) => s.owner[n] === HK), g = got.find((x) => x.t === t);
      assert.equal(!!g, !adj, `${TERRITORIES[t].name}: a tunnel iff no Hide-Kin land next to it`);
      if (!g) { plain++; continue; }
      tunnels++;
      assert.equal(g.clan, HK);
      assert.equal(s.owner[g.from], HK, "starts on Hide-Kin land");
      assert.ok(TERRITORIES[t].near.some((n) => TERRITORIES[n].near.includes(g.from)), "two borders back");
    }
    assert.equal(new Set(got.map((g) => g.t)).size, got.length, "one per target");
  }
  assert.ok(tunnels > 0 && plain > 0, `both kinds seen (${tunnels} tunnels, ${plain} plain)`);
});

test("tunnels: no Hide-Kin attack, no tunnels (other clans' attacks, no orders, broken orders)", () => {
  const s = STATES[0];
  assert.deepEqual(tunnelStrikes(s, undefined), []);
  assert.deepEqual(tunnelStrikes(s, {}), []);
  assert.deepEqual(tunnelStrikes(s, only({ defend: 1, attack: [] })), []);
  assert.deepEqual(tunnelStrikes(s, only({ defend: NaN, attack: [{ t: targetsOf(s, HK)[0], share: 1 }] })), [], "broken orders only defend");
  const legal = targetsOf(s, HK);
  assert.deepEqual(tunnelStrikes(s, only({ defend: 0.5, attack: legal.map((t) => ({ t, share: 0 })) })), [], "no share, no strike");
  const others = Object.fromEntries(CLAN_KEYS.filter((k) => k !== HK).map((k) => [k, { defend: 0, attack: TERRITORIES.map((t) => ({ t: t.id, share: 1 })).slice(0, 8) }]));
  assert.deepEqual(tunnelStrikes(s, others), [], "other clans never tunnel");
  const illegal = TERRITORIES.find((t) => s.owner[t.id] !== HK && !legal.includes(t.id))!;
  assert.deepEqual(tunnelStrikes(s, only({ defend: 0, attack: [{ t: illegal.id, share: 1 }] })), [], "an illegal target is dropped");
});

test("tunnels: tunnelStrikes matches rules.ts (the strike is fed from `from` at WAR.tunnelSupply)", () => {
  let n = 0;
  for (const base of STATES) {
    const legal = targetsOf(base, HK);
    // the Hide-Kin army after income with nobody fighting (phase 0: no Night Raiders): the force with defend 0
    const quiet = clone(base);
    warTick(quiet, Object.fromEntries(CLAN_KEYS.map((k) => [k, { defend: 1, attack: [] }])), { phase: 0 });
    const force = quiet.army[HK], supply = supplyMap(base);
    for (const t of legal) {
      const s = clone(base);
      const orders = Object.fromEntries(CLAN_KEYS.map((k) => [k, k === HK ? { defend: 0, attack: [{ t, share: 1 }] } : { defend: 1, attack: [] }]));
      const strike = tunnelStrikes(base, orders).find((x) => x.t === t);
      warTick(s, orders, { phase: 0 });
      const adj = TERRITORIES[t].near.filter((m) => base.owner[m] === HK).map((m) => supply[m]);
      let src = Math.max(WAR.cutOff, ...adj);
      if (strike) src = Math.max(src, WAR.tunnelSupply * supply[strike.from]);
      const mult = CLANS[HK].counters === base.owner[t] ? WAR.counter : 1;
      assert.ok(Math.abs(s.pressure[t] - force * src * mult) < 1e-6, `${TERRITORIES[t].name}: ${s.pressure[t]} vs ${force * src * mult}`);
      if (strike) n++;
    }
  }
  assert.ok(n > 0, "tunnel strikes were checked");
});

test("tunnels: every possible mouth is deterministic, walkable, reachable and inside the target on the side facing the start", () => {
  // tiles of each land reachable from its Hold gate (4-way, centres free, never off limits)
  const reach = new Map<number, Set<number>>();
  const reachOf = (t: number) => {
    let r = reach.get(t);
    if (r) return r;
    const T = TERRITORIES[t], p = patrolOf(t)!, x0 = T.x - 2, y0 = T.y - 2, x1 = T.x + T.w + 1, y1 = T.y + T.h + 1;
    const ok = (x: number, y: number) => x >= x0 && y >= y0 && x <= x1 && y <= y1 && !isSolidAt((x + 0.5) * TILE, (y + 0.5) * TILE) && !caravanOffLimits((x + 0.5) * TILE, (y + 0.5) * TILE);
    const sx = Math.floor(p.pts[0].x / TILE), sy = Math.floor(p.pts[0].y / TILE), q = [[sx, sy]];
    r = new Set([sy * MAP_W + sx]);
    while (q.length) { const [x, y] = q.pop()!; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (y + dy) * MAP_W + x + dx; if (!r.has(k) && ok(x + dx, y + dy)) { r.add(k); q.push([x + dx, y + dy]); } } }
    reach.set(t, r);
    return r;
  };
  const pairs = tunnelPairs();
  assert.ok(pairs.length > 20, `${pairs.length} pairs`);
  for (const { t, from } of pairs) {
    const T = TERRITORIES[t], F = TERRITORIES[from], m = tunnelMouth(t, from), name = `${T.name} <- ${F.name}`;
    assert.ok(m, `${name}: a mouth`);
    assert.deepEqual(tunnelMouth(t, from), m, `${name}: deterministic`);
    const tx = Math.floor(m.x / TILE), ty = Math.floor(m.y / TILE);
    assert.equal(m.x, (tx + 0.5) * TILE); assert.equal(m.y, (ty + 0.5) * TILE);
    assert.ok(tx >= T.x && ty >= T.y && tx < T.x + T.w && ty < T.y + T.h, `${name}: inside the target`);
    assert.ok(!isSolidAt(m.x, m.y) && !caravanOffLimits(m.x, m.y), `${name}: walkable, not off limits`);
    assert.ok(reachOf(t).has(ty * MAP_W + tx), `${name}: reachable from the Hold gate`);
    assert.ok((m.x / TILE - T.cx) * (F.cx - T.cx) + (m.y / TILE - T.cy) * (F.cy - T.cy) > 0, `${name}: on the side facing the start`);
    // territory rects overlap (Saltwind Coast holds Gullrock Cove): no Hold's fort and no standard's ring of any land
    for (const h of HOLDS) assert.ok(Math.max(Math.abs(h.x - m.x), Math.abs(h.y - m.y)) >= HOLD_FORT_PX + TILE, `${name}: clear of ${TERRITORIES[h.t].name}'s fort`);
    for (const st of STANDARDS) assert.ok(Math.hypot(st.x - m.x, st.y - m.y) >= STANDARD.range + TILE, `${name}: clear of ${TERRITORIES[st.t].name}'s standard`);
  }
  // every strike the war can order has its pair
  for (const s of STATES) for (const t of targetsOf(s, HK)) for (const g of tunnelStrikes(s, only({ defend: 0.5, attack: [{ t, share: 1 }] }))) {
    assert.ok(pairs.some((p) => p.t === g.t && p.from === g.from), "strike pair is listed");
  }
});

test("tunnels: the mouth is a trooper object (weapon 'hidekin~'), named, with soldier HP x mouthHp", () => {
  const w = troopWeapon(HK, false, false, false, true);
  assert.equal(w, "hidekin~");
  assert.deepEqual(parseTroop(w), { clan: HK, part: "mouth", officer: false, cart: false, object: true });
  for (const k of CLAN_KEYS) for (const [o, c, r, mo] of [[false, false, false, false], [true, false, false, false], [false, true, false, false], [false, false, true, false], [false, false, false, true]]) {
    const t = parseTroop(troopWeapon(k, o, c, r, mo))!;
    assert.equal(t.clan, k);
    assert.equal(t.part, mo ? "mouth" : r ? "ram" : c ? "cart" : o ? "officer" : "soldier");
  }
  assert.equal(parseTroop("nobody~"), undefined);
  assert.equal(troopName(HK, false, false, false, true), "Hide-Kin tunnel");
  assert.equal(mouthHp(HK, 20), Math.round(troopStats(HK, 20).hp * TUNNEL.mouthHp));
});

test("tunnels: every mouth keeps clear of people, props, entrances, waygates, the shrine, boards and portal stones", () => {
  const tile = (p: { x: number; y: number }) => ({ x: p.x + 0.5, y: p.y + 0.5 }), px = (p: { x: number; y: number }) => ({ x: p.x / TILE, y: p.y / TILE });
  const named: [string, { x: number; y: number }][] = [
    ...NPCS.map((n) => [n.name, px(n)] as [string, { x: number; y: number }]), ...NPC_DECOR.map((d) => [d.prop, d] as [string, { x: number; y: number }]),
    ...LINKS.filter((l) => !underground(l.y)).map((l) => [l.label, px(l)] as [string, { x: number; y: number }]), ...BOARDS.map((b) => [b.name, px(b)] as [string, { x: number; y: number }]),
    ["sinkhole", tile(SINKHOLE)], ["crypt door", tile(CRYPT_DOOR)], ["well-shaft", tile(UNDER_SHAFT)], ["Oakvale waygate", tile(WAYGATE_OAKVALE)], ["desert waygate", tile(WAYGATE_DESERT)], ["shrine", tile(SHRINE_SPOT)],
  ];
  assert.ok(named.some(([n]) => n === "Hamid") && named.some(([n]) => n === "Amos"), "the wild quest givers are listed");
  assert.equal(tunnelLandmarks().length, named.length, "the module keeps the same landmarks");
  assert.ok(LINKS.filter((l) => !underground(l.y)).length >= 3, "the overworld entrances are found");
  for (const { t, from } of tunnelPairs()) {
    const m = tunnelMouth(t, from)!, mx = m.x / TILE, my = m.y / TILE, name = `${TERRITORIES[t].name} <- ${TERRITORIES[from].name}`;
    for (const [n, p] of named) assert.ok(Math.hypot(p.x - mx, p.y - my) >= TUNNEL.keepTiles, `${name}: ${Math.hypot(p.x - mx, p.y - my).toFixed(1)} tiles from ${n}`);
    for (const p of PORTAL_SPOTS) assert.ok(Math.hypot(p.x - (mx - 0.5), p.y - (my - 0.5)) >= 6, `${name}: clear of the ${p.name} stone`);
  }
});
