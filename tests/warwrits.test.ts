import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newWar, targetsOf, bordersOf } from "../shared/war/rules";
import { STANDARD, STANDARDS } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { patrolOf } from "../shared/war/patrols";
import { cleanWrit, isRoadKind, writDay, writLands, writLines, writNamesLine, writOffers, writPay, writProgress, writRally, writTitle, writWhere, WRIT, WRIT_KINDS, type Writ, type WritState } from "../shared/war/writs";
import { caravanLines, caravanRoute } from "../shared/war/caravans";
import { WRIT_LINES, writFlavour } from "../shared/war/writText";

const s = newWar();
/** A clan and level with offers in Act 1 (any land's band). */
const L = 12;

test("war writs: offers are deterministic and follow the seed", () => {
  for (const k of CLAN_KEYS) for (const act of [1, 2]) {
    const lvl = act === 1 ? L : 40;
    assert.deepEqual(writOffers(s, k, lvl, act, 7), writOffers(s, k, lvl, act, 7));
  }
  const any = CLAN_KEYS.some((k) => JSON.stringify(writOffers(s, k, L, 1, 1)) !== JSON.stringify(writOffers(s, k, L, 1, 2)));
  assert.ok(any, "another seed can change the offers");
});

test("war writs: at most 3 offers, one land each, legal land per kind, the board's act and the hero's level", () => {
  let seen = 0;
  for (const k of CLAN_KEYS) for (const act of [1, 2]) for (const lvl of [5, 10, 15, 20, 30, 40, 50]) for (const seed of [0, 1, 5]) {
    const o = writOffers(s, k, lvl, act, seed);
    assert.ok(o.length <= WRIT.offers);
    assert.equal(new Set(o.map((w) => w.t)).size, o.length, "one land per offer");
    for (const w of o) {
      seen++;
      const T = TERRITORIES[w.t];
      assert.equal(T.act, act, "the board's act");
      assert.ok(T.levels[0] <= lvl + 3 && T.levels[1] >= lvl - 5, `level band ${T.levels} vs ${lvl}`);
      assert.equal(w.clan, k); assert.equal(w.holder, s.owner[w.t]); assert.equal(w.land, T.name);
      assert.equal(!!w.road, isRoadKind(w.kind), "a road on escort and raid only");
      if (w.kind === "escort" || w.kind === "raid") continue; // checked in their own test
      if (w.kind === "rout") {
        assert.ok(targetsOf(s, k).includes(w.t) && s.owner[w.t] !== k && !!patrolOf(w.t));
        assert.ok(w.goal >= WRIT.routMin && w.goal <= WRIT.routMax);
      } else if (w.kind === "hold") {
        assert.fail("the boards no longer offer hold writs (W2c: standing at a standard pays nothing)");
      } else {
        assert.equal(s.owner[w.t], k, "clear: own land");
        assert.equal(w.goal, WRIT.clearN); assert.equal(w.minLevel, T.levels[0]);
      }
    }
  }
  assert.ok(seen > 50, `offers exist (${seen})`);
});

test("war writs: unsworn or under the oath level gets nothing", () => {
  assert.deepEqual(writOffers(s, "nope" as ClanKey, L, 1, 0), []);
  assert.deepEqual(writOffers(s, "wardens", STANDARD.minLevel - 1, 1, 0), []);
});

test("war writs: a siege the clan is in comes first", () => {
  const w = newWar();
  for (const k of CLAN_KEYS) {
    const t = writLands(w, k, "rout").find((t) => TERRITORIES[t].act === 1);
    if (t === undefined) continue;
    const T = TERRITORIES[t], lvl = Math.max(STANDARD.minLevel, T.levels[0]);
    w.siege[t] = { by: k, at: 99 };
    for (const seed of [0, 1, 2, 3]) {
      const o = writOffers(w, k, lvl, 1, seed);
      assert.equal(o[0]?.t, t, `${k}: the besieged land first (seed ${seed})`);
    }
    w.siege[t] = null;
  }
});

test("war writs: rally pays the underdog more, never less than the base", () => {
  const w = newWar();
  const counts = CLAN_KEYS.map((k) => w.owner.filter((o) => o === k).length);
  const big = CLAN_KEYS[counts.indexOf(Math.max(...counts))];
  assert.equal(writRally(w, big), 1 + WRIT.rally * Math.max(0, 1 - Math.max(...counts) / (w.owner.length / CLAN_KEYS.length)));
  const none = { owner: w.owner.map((o) => (o === "host" ? "wardens" : o)) as ClanKey[] };
  assert.equal(writRally(none, "host"), (1 + WRIT.rally) * WRIT.rallyClan, "no land at all: the full underdog bonus, and the war rallies for it");
  assert.ok(writPay(none, "host", 0).gold > writPay(w, big, 0).gold);
  for (const k of CLAN_KEYS) assert.ok(writRally(w, k) >= 1);
  assert.equal(writPay(w, big, 0).valor, WRIT.valor);
});

test("war writs: cleanWrit round-trips a writ and drops junk", () => {
  const o = [...writOffers(s, "wardens", L, 1, 3), ...writOffers(s, "redfang", L, 1, 3)].find((w) => w.goal > 2); // (progress 2 must fit below the goal)
  assert.ok(o);
  const st: WritState = { ...o, n: 2 };
  assert.deepEqual(cleanWrit(JSON.parse(JSON.stringify(st)), o.clan), st);
  assert.deepEqual(cleanWrit(st), st, "no clan given: no clan check");
  assert.equal(cleanWrit(st, CLAN_KEYS.find((k) => k !== o.clan)), undefined, "another clan's writ");
  for (const bad of [undefined, null, 3, "x", [], {}, { ...st, kind: "loot" }, { ...st, t: 999 }, { ...st, t: -1 }, { ...st, land: "Nowhere" },
    { ...st, goal: 0 }, { ...st, holder: "elves" }, { ...st, clan: 7 }, { ...st, t: "1" }])
    assert.equal(cleanWrit(bad), undefined, JSON.stringify(bad));
  assert.equal(cleanWrit({ ...st, n: 999 })!.n, st.goal - 1, "progress below the goal");
  assert.equal(cleanWrit({ ...st, n: -4 })!.n, 0);
});

test("war writs: every clan has 2-3 lines per kind in its voice; the day is UTC", () => {
  for (const k of CLAN_KEYS) for (const kind of WRIT_KINDS) {
    const lines = WRIT_LINES[k][kind];
    assert.ok(lines.length >= 2 && lines.length <= 3);
    for (const l of lines) assert.ok(isRoadKind(kind) ? l.includes("{from}") || l.includes("{to}") : l.includes("{land}"), l);
    const f = writFlavour(k, kind, "Barrow Ford", 4, { from: "Barrow Ford", to: "Barrow Ford" });
    assert.ok(f.text.includes("Barrow Ford") && f.name.length > 0 && !/[{}]/.test(f.text));
    assert.deepEqual(writFlavour(k, kind, "X", 4), writFlavour(k, kind, "X", 4));
  }
  assert.equal(writDay(Date.UTC(2026, 10, 15, 23, 59)), writDay(Date.UTC(2026, 10, 15, 0, 0)));
  assert.equal(writDay(Date.UTC(2026, 10, 16)), writDay(Date.UTC(2026, 10, 15)) + 1);
});

/** Every escort / raid offer across clans, acts, levels and seeds, with the state it came from. */
function roadOffers(st = s) {
  const out: Writ[] = [];
  for (const k of CLAN_KEYS) for (const act of [1, 2]) for (const lvl of [10, 12, 15, 20, 30, 40, 50]) for (const seed of [0, 1, 2, 5, 9])
    out.push(...writOffers(st, k, lvl, act, seed).filter((w) => isRoadKind(w.kind)));
  return out;
}

test("caravan writs: escort names one of the clan's lines, raid a rival line touching land the clan holds or can target", () => {
  const lines = caravanLines(s.owner), offers = roadOffers();
  assert.ok(offers.some((w) => w.kind === "escort") && offers.some((w) => w.kind === "raid"), "both kinds are offered in the opening war");
  for (const w of offers) {
    const r = w.road!, line = lines.find((l) => l.a === r.a && l.b === r.b);
    assert.ok(line, `${w.kind}: a running line ${r.from} to ${r.to}`);
    assert.ok(caravanRoute(r.a, r.b), "a line with a road");
    assert.ok(writNamesLine(w, line!));
    assert.equal(w.holder, line!.clan); assert.equal(s.owner[w.t], line!.clan);
    assert.equal(r.from, TERRITORIES[r.a].name); assert.equal(r.to, TERRITORIES[r.b].name);
    assert.equal(writWhere(w), `${r.from} to ${r.to}`);
    if (w.kind === "escort") {
      assert.equal(line!.clan, w.clan, "escort: the clan's own line");
      assert.equal(w.t, r.b, "escort: the destination");
      assert.equal(w.goal, WRIT.escortN);
      assert.equal(writTitle(w), "Escort a supply cart");
    } else {
      assert.notEqual(line!.clan, w.clan, "raid: a rival line");
      assert.ok(w.t === r.a || w.t === r.b);
      assert.ok(s.owner[w.t] === w.clan || targetsOf(s, w.clan).includes(w.t), "raid: the end it names is legal for the clan");
      assert.equal(w.goal, WRIT.raidN);
      assert.match(writTitle(w), /^Raid a .+ supply cart$/);
    }
    assert.match(writProgress({ ...w, n: 0 }), /0\/1$/);
  }
  // every raid candidate is legal, every escort candidate the clan's own
  for (const k of CLAN_KEYS) {
    for (const c of writLines(s, k, "raid")) {
      assert.notEqual(c.line.clan, k);
      assert.ok(c.t === c.line.a || c.t === c.line.b);
      assert.ok(targetsOf(s, k).includes(c.t) || s.owner[c.t] === k);
    }
    const legalEnds = (l: { a: number; b: number }) => [l.a, l.b].some((t) => targetsOf(s, k).includes(t) || s.owner[t] === k);
    for (const l of lines) if (l.clan !== k && !legalEnds(l)) assert.ok(!writLines(s, k, "raid").some((c) => c.line === l), "an illegal line is never a raid");
    for (const c of writLines(s, k, "escort")) { assert.equal(c.line.clan, k); assert.equal(c.t, c.line.b); }
    assert.deepEqual(writLines(s, k, "rout"), [], "land kinds have no lines");
  }
});

test("caravan writs: deterministic per hero, day and war state; no line, no offer of that kind", () => {
  assert.deepEqual(roadOffers(), roadOffers(), "the same state and seeds give the same offers");
  // one clan holds the whole map: no border lands, so no line runs anywhere
  const one = newWar();
  one.owner = one.owner.map(() => "wardens");
  assert.deepEqual(caravanLines(one.owner), []);
  for (const k of CLAN_KEYS) { assert.deepEqual(writLines(one, k, "escort"), []); assert.deepEqual(writLines(one, k, "raid"), []); }
  assert.deepEqual(roadOffers(one), [], "no escort or raid offer without lines");
  // a clan that lost its capital runs no carts (the supply tree starts at held capitals): no escort for it
  for (const k of CLAN_KEYS) {
    const caps = TERRITORIES.filter((t) => t.capitalOf === k);
    if (!caps.length) continue;
    const w = newWar();
    for (const cap of caps) w.owner[cap.id] = CLAN_KEYS.find((o) => o !== k)!;
    assert.ok(!caravanLines(w.owner).some((l) => l.clan === k), `${k}: no lines without the capital`);
    for (const act of [1, 2]) for (const lvl of [12, 20, 40]) for (const seed of [0, 1, 2])
      assert.ok(!writOffers(w, k, lvl, act, seed).some((o) => o.kind === "escort"), `${k}: no escort writ`);
  }
});

test("caravan writs: cleanWrit keeps a valid road and drops a broken one", () => {
  const o = roadOffers()[0];
  assert.ok(o);
  const st: WritState = { ...o, n: 0 };
  assert.deepEqual(cleanWrit(JSON.parse(JSON.stringify(st)), o.clan), st);
  for (const bad of [{ ...st, road: undefined }, { ...st, road: { ...st.road, from: "Nowhere" } }, { ...st, road: { ...st.road, a: 999 } },
    { ...st, road: { ...st.road, a: st.road!.b } }, { ...st, road: "x" }, { ...st, t: TERRITORIES.findIndex((T) => T.id !== st.road!.a && T.id !== st.road!.b), land: TERRITORIES.find((T) => T.id !== st.road!.a && T.id !== st.road!.b)!.name }])
    assert.equal(cleanWrit(bad), undefined, JSON.stringify(bad));
  // a land writ never carries a road
  const land = writOffers(s, "wardens", L, 1, 3).find((w) => !isRoadKind(w.kind)) ?? writOffers(s, "redfang", L, 1, 3).find((w) => !isRoadKind(w.kind))!;
  assert.equal("road" in cleanWrit({ ...land, n: 0, road: st.road })!, false);
});
