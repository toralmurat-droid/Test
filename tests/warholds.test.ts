// Sacking a Hold (W2b): the pure rules (shared/war/holdSack.ts, rules.ts sackHold).
import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE } from "../shared/constants";
import { CLAN_KEYS } from "../shared/war/clans";
import { bannerSpot, cleanHoldsMsg, HOLD_SACK, inSackReach, sackGold, sackReachPx, sackStep, type SackRaise } from "../shared/war/holdSack";
import { fortOf, holdReachPx, setHoldOwners, tierReachPx } from "../shared/war/holdWalls";
import { HOLD_TIERS } from "../shared/war/holdTiers";
import { garrisonSpots, TROOP } from "../shared/war/patrols";
import { newWar, sackHold, targetsOf, WAR, warTick, type WarState } from "../shared/war/rules";
import { HOLDS } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";

test("holdSack: the banner is the fort's middle cell (a courtyard in every clan's plan), the guard posts lie in the reach", () => {
  for (const h of HOLDS) {
    const b = bannerSpot(h.t)!;
    assert.ok(b, TERRITORIES[h.t].name);
    for (const k of CLAN_KEYS) {
      const f = fortOf(h.t, k);
      if (!f) continue;
      assert.deepEqual([Math.floor(b.x / TILE), Math.floor(b.y / TILE)], [f.cx, f.cy]);
      assert.equal(f.cells.find((c) => c.dx === 0 && c.dy === 0)?.kind, "court", `${TERRITORIES[h.t].name} ${k}: the banner stands in the open`);
    }
    assert.ok(sackReachPx(h.t) > holdReachPx(h.t));
    for (const g of garrisonSpots(h.t, TROOP.garrisonMax)) assert.ok(inSackReach(h.t, g.x, g.y), `${TERRITORIES[h.t].name}: guard post inside the reach`);
    assert.ok(!inSackReach(h.t, b.x + sackReachPx(h.t) + 2, b.y));
  }
  assert.equal(bannerSpot(9999), undefined);
});

test("holdSack (W3): the reach follows the Hold's tier (the live one by default); the banner spot is the same at every tier", () => {
  const h = HOLDS[0], b = bannerSpot(h.t)!;
  try {
    setHoldOwners([]);
    assert.equal(sackReachPx(h.t), holdReachPx(h.t) + HOLD_SACK.marginPx, "no war known: the widest reach");
    const r = HOLD_TIERS.map((tier) => sackReachPx(h.t, tier));
    assert.deepEqual(r, HOLD_TIERS.map((tier) => tierReachPx(h.t, tier) + HOLD_SACK.marginPx));
    assert.ok(r[0] < r[2], "an outpost's reach is smaller than a fortress's");
    for (const tier of HOLD_TIERS) {
      setHoldOwners(TERRITORIES.map(() => "host"), TERRITORIES.map(() => tier));
      assert.equal(sackReachPx(h.t), r[tier], `live tier ${tier}`);
      assert.ok(inSackReach(h.t, b.x + r[tier] - 1, b.y) && !inSackReach(h.t, b.x + r[tier] + 1, b.y));
      for (const k of CLAN_KEYS) { const f = fortOf(h.t, k, tier)!; assert.deepEqual([Math.floor(b.x / TILE), Math.floor(b.y / TILE)], [f.cx, f.cy]); }
    }
  } finally { setHoldOwners([]); }
});

test("sackStep: raiseMs of work, a defender pauses it, a blow starts it over", () => {
  const r: SackRaise = { progress: 0, paused: false }, sec = 1000, n = HOLD_SACK.raiseMs / sec;
  assert.equal(HOLD_SACK.raiseMs, 12_000);
  for (let i = 1; i < n; i++) assert.equal(sackStep(r, sec, 0, false), "raise");
  assert.ok(Math.abs(r.progress - (n - 1) / n) < 1e-9);
  assert.equal(sackStep(r, sec, 1, false), "paused"); assert.ok(r.paused);
  assert.ok(Math.abs(r.progress - (n - 1) / n) < 1e-9, "no work while a defender stands in the reach");
  assert.equal(sackStep(r, sec, 0, true), "restart"); assert.equal(r.progress, 0, "hurt: from nothing");
  assert.equal(sackStep(r, 60_000, 0, false), "raise", "a stalled tick never jumps it");
  assert.ok(r.progress <= 2000 / HOLD_SACK.raiseMs + 1e-9);
  r.progress = 1 - 1e-6;
  assert.equal(sackStep(r, sec, 0, false), "done"); assert.equal(r.progress, 1);
  assert.equal(sackGold(10), HOLD_SACK.gold.base + HOLD_SACK.gold.perLevel * 10);
});

test("sackHold: -8 Control (half for an unsworn or out-of-reach sacker); a siege at <= siegeAt only when legal, never at a capital", () => {
  assert.equal(HOLD_SACK.control, 8); assert.equal(WAR.sackControl, 8);
  const s = newWar();
  let pick: { t: number; k: (typeof CLAN_KEYS)[number]; out: (typeof CLAN_KEYS)[number] } | undefined;
  for (const k of CLAN_KEYS) for (const t of targetsOf(s, k)) {
    if (pick || TERRITORIES[t].capitalOf) continue;
    const out = CLAN_KEYS.find((o) => o !== k && o !== s.owner[t] && !targetsOf(s, o).includes(t));
    if (out) pick = { t, k, out };
  }
  assert.ok(pick);
  const { t, k, out } = pick!;
  assert.deepEqual(sackHold(s, t, k, false), { control: 92 });
  assert.deepEqual(sackHold(s, t, undefined, true), { control: 88 }, "unsworn: half");
  s.control[t] = 30;
  assert.deepEqual(sackHold(s, t, out, true), { control: 26 });
  s.control[t] = 28;
  assert.deepEqual(sackHold(s, t, out, true), { control: 24 }, "out of reach: no siege");
  assert.equal(s.siege[t], null);
  s.control[t] = 28;
  assert.deepEqual(sackHold(s, t, undefined, true), { control: 24 }, "unsworn: no siege");
  assert.equal(s.siege[t], null);
  s.control[t] = 30;
  const r = sackHold(s, t, k, false)!;
  assert.equal(r.control, 22);
  assert.deepEqual(r.siege, { by: k, at: s.tick + WAR.siegeWarnTicks, sack: true }, "a legal sacker lays siege (marked as a sack's)");
  assert.deepEqual(s.siege[t], r.siege);
  assert.equal(sackHold(s, t, k, false), undefined, "nothing during a siege");
  assert.equal(s.control[t], 22);
  assert.equal(sackHold(s, t, s.owner[t], false), undefined, "the holder's own clan");
  assert.equal(sackHold(s, -1, k, false), undefined); assert.equal(sackHold(s, 1.5, k, false), undefined);
  // a capital loses Control but never gets a siege (capitals never fall)
  const cap = TERRITORIES.find((x) => x.capitalOf && CLAN_KEYS.some((c) => targetsOf(s, c).includes(x.id)))!;
  const by = CLAN_KEYS.find((c) => targetsOf(s, c).includes(cap.id))!;
  s.control[cap.id] = 20;
  assert.deepEqual(sackHold(s, cap.id, by, false), { control: 12 });
  assert.equal(s.siege[cap.id], null);
  s.control[cap.id] = 3;
  assert.equal(sackHold(s, cap.id, by, false)!.control, 0, "never below 0");
});

test("holdSack: the clients' holds message is read safely", () => {
  assert.deepEqual(cleanHoldsMsg(undefined), { tick: -1, sacked: [], raising: [] });
  assert.deepEqual(cleanHoldsMsg({ tick: 4, sacked: [[3, 1], [2, -1], [1, 9], "x", [1.5, 0]], raising: [[3, 50, 1], [3, 101, 0], [3, 5, 2]] }),
    { tick: 4, sacked: [[3, 1], [2, -1]], raising: [[3, 50, 1]] });
});

test("a failed siege: a sack's keeps Control (+ WAR.sackSiegeFail), an army's resets it to 50; old saves' sieges are the army's", () => {
  // a land whose siege comes due this tick against a defence its attacker cannot beat (a token attack order)
  const run = (sack: boolean) => {
    const s: WarState = newWar();
    let pick: { t: number; k: (typeof CLAN_KEYS)[number] } | undefined;
    for (const k of CLAN_KEYS) for (const t of targetsOf(s, k)) if (!pick && !TERRITORIES[t].capitalOf) pick = { t, k };
    const { t, k } = pick!;
    s.control[t] = 20;
    s.siege[t] = sack ? { by: k, at: s.tick, sack: true } : { by: k, at: s.tick };
    s.army[k] = 1; // too weak to take it
    warTick(s, { [k]: { defend: 0, attack: [{ t, share: 1 }] } }, { phase: 1 });
    return { siege: s.siege[t], control: s.control[t], owner: s.owner[t], k };
  };
  const army = run(false), sack = run(true);
  assert.equal(army.siege, null); assert.equal(sack.siege, null, "both sieges end");
  assert.notEqual(army.owner, army.k); assert.notEqual(sack.owner, sack.k, "neither land falls");
  assert.equal(army.control, 50, "an army's failed siege: the holder's grip comes back to 50");
  assert.ok(sack.control <= 20 + WAR.maxShift + WAR.sackSiegeFail && sack.control < 50, `a sack's failed siege keeps Control low (${sack.control})`);
  assert.ok(WAR.sackSiegeFail >= 0 && WAR.sackSiegeFail < 25);
});

test("leaders follow their heroes' sacks: a pending sack siege comes first while the clan may attack it; one at a time", async () => {
  const { followedSack, newMinds, scriptedOrders } = await import("../shared/war/doctrine");
  const s = newWar(), k = CLAN_KEYS.find((c) => targetsOf(s, c).filter((t) => !TERRITORIES[t].capitalOf).length >= 2)!;
  const [a, b] = targetsOf(s, k).filter((t) => !TERRITORIES[t].capitalOf);
  const rnd = () => 0.5;
  assert.equal(followedSack(s, k), undefined, "no sack, nothing to follow");
  s.siege[a] = { by: k, at: s.tick + 3 }; // an army's siege: the leader's own business
  assert.equal(followedSack(s, k), undefined);
  s.siege[a] = { by: k, at: s.tick + 3, sack: true };
  s.siege[b] = { by: k, at: s.tick + 5, sack: true };
  assert.equal(followedSack(s, k), a, "the one due soonest");
  const o = scriptedOrders(s, newMinds(), rnd);
  assert.equal(o[k].attack[0].t, a, "first in the orders");
  assert.equal(o[k].attack.filter((x) => x.t === b).length, 0, "one followed sack at a time");
  assert.deepEqual(scriptedOrders(s, newMinds(), rnd)[k], o[k], "deterministic");
  const other = CLAN_KEYS.find((c) => c !== k && c !== s.owner[a])!;
  s.siege[a] = { by: other, at: s.tick + 1, sack: true };
  assert.equal(followedSack(s, k), b, "another clan's sack is not ours to follow");
  assert.equal(followedSack(s, k, []), undefined, "only where the clan may still attack");
});
