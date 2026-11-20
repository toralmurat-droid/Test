// Falling Holds (shared/war/holdFall.ts): every Hold's works (barracks, props by tier, fortifications), the work weapon,
// and the war rules of a fallen land (rules.ts fellHold / claimFallen / warTick).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAN_KEYS } from "../shared/war/clans";
import { barracksOf, canFall, HOLD_FALL, holdWorks, isFortification, parseWork, workWeapon, cleanHoldWorksMsg } from "../shared/war/holdFall";
import { HOLD_TIERS } from "../shared/war/holdTiers";
import { claimFallen, fellHold, isFallen, newWar, WAR, warTick, landOf } from "../shared/war/rules";
import { HOLDS } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { parseTroop } from "../shared/war/troops";
import { warView } from "../shared/war/view";
import { isSolidTile } from "../shared/map";
import { TILE } from "../shared/constants";

test("holdFall: every Hold that can fall has a barracks, its tier's props and fortifications; capitals and heartland havens have none", () => {
  for (const h of HOLDS) {
    const t = TERRITORIES[h.t];
    if (!canFall(h.t)) { assert.ok(t.capitalOf || t.reckoningOnly || t.haven, `${t.name} cannot fall`); for (const k of CLAN_KEYS) assert.equal(holdWorks(h.t, k, 1).length, 0); continue; }
    for (const k of CLAN_KEYS) for (const tier of HOLD_TIERS) {
      const w = holdWorks(h.t, k, tier), props = w.filter((x) => !isFortification(x.kind));
      assert.ok(barracksOf(w), `${t.name} ${k} ${tier}: a barracks`);
      assert.equal(w[0].kind, "barracks");
      assert.equal(props.length, HOLD_FALL.props[tier], `${t.name} ${k} tier ${tier}: props`);
      assert.ok(w.some((x) => isFortification(x.kind)), `${t.name} ${k} ${tier}: fortifications`);
      w.forEach((x, i) => assert.equal(x.i, i));
      for (const p of props) assert.ok(!isSolidTile(Math.floor(p.x / TILE), Math.floor(p.y / TILE)), `${t.name} ${k} ${tier}: ${p.kind} on open ground`);
      assert.equal(new Set(w.map((x) => `${x.x},${x.y}`)).size, w.length, "no two works on one tile");
      assert.deepEqual(holdWorks(h.t, k, tier), w, "deterministic");
    }
    // the bigger the Hold, the more to burn
    for (const k of CLAN_KEYS) assert.ok(holdWorks(h.t, k, 2).length > holdWorks(h.t, k, 0).length, `${t.name} ${k}: a fortress has more works than an outpost`);
  }
});

test("holdFall: a work's weapon round-trips and parses as a trooper object", () => {
  for (const k of CLAN_KEYS) for (const kind of ["barracks", "stores", "rack", "tower", "gate"] as const) {
    const w = workWeapon(k, kind);
    assert.deepEqual(parseWork(w), { clan: k, kind });
    const tr = parseTroop(w)!;
    assert.equal(tr.clan, k); assert.equal(tr.part, "work"); assert.equal(tr.object, true); assert.equal(tr.work, kind); assert.equal(tr.officer, false);
  }
  for (const bad of ["", "%b", "nobody%b", "wardens%x", "wardens", 5, undefined]) assert.equal(parseWork(bad), undefined);
  assert.deepEqual(cleanHoldWorksMsg({ wrecked: [[1, 2, 0, 1], [1, 2, 9, 1], ["x"], [1, 2, 0, 5]] }), { wrecked: [[1, 2, 0, 1]] });
  assert.deepEqual(cleanHoldWorksMsg(null), { wrecked: [] });
});

test("rules: a fallen land yields nothing, has no defence and no regrowth; a claim or a won siege gives it a holder again", () => {
  const s = newWar(), t = TERRITORIES.find((x) => canFall(x.id))!.id, own = s.owner[t];
  const cap = TERRITORIES.find((x) => x.capitalOf)!.id;
  assert.equal(fellHold(s, cap), false, "a capital never falls");
  assert.equal(fellHold(s, t), true);
  assert.equal(fellHold(s, t), false, "only once");
  assert.ok(isFallen(s, t)); assert.equal(s.control[t], 0); assert.equal(s.fort[t], 0);
  assert.deepEqual(warView(s, 0).fallen, [t]);
  // income: the same war without the fall earns one land's worth more
  const a = newWar(), b = newWar();
  fellHold(b, t);
  warTick(a, {}); warTick(b, {});
  assert.ok(a.army[own] > b.army[own], "the fallen land pays its holder nothing");
  assert.equal(b.control[t], 0, "nobody rebuilds a fallen Hold");
  assert.ok(isFallen(b, t));
  // a hero's claim
  const k = CLAN_KEYS.find((c) => c !== own)!;
  assert.equal(claimFallen(newWar(), t, k), false, "only a fallen land is claimed");
  assert.equal(claimFallen(b, t, k), true);
  assert.equal(b.owner[t], k); assert.equal(b.control[t], WAR.claimControl); assert.equal(b.fallen, undefined, "no fallen land left: the field goes");
  assert.equal(landOf(b, k), landOf(newWar(), k) + 1);
  // a siege won by an army claims it too
  const c = newWar();
  fellHold(c, t);
  const atk = CLAN_KEYS.find((x) => x !== own && TERRITORIES[t].near.some((n) => c.owner[n] === x))!;
  c.siege[t] = { by: atk, at: c.tick };
  warTick(c, { [atk]: { defend: 0, attack: [{ t, share: 1 }] } });
  assert.equal(c.owner[t], atk, "the besieger takes the empty land");
  assert.ok(!isFallen(c, t));
});
