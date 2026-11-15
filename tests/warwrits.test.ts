import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newWar, targetsOf, bordersOf } from "../shared/war/rules";
import { STANDARD, STANDARDS } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { patrolOf } from "../shared/war/patrols";
import { cleanWrit, writDay, writLands, writOffers, writPay, writRally, WRIT, WRIT_KINDS, type WritState } from "../shared/war/writs";
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
      if (w.kind === "rout") {
        assert.ok(targetsOf(s, k).includes(w.t) && s.owner[w.t] !== k && !!patrolOf(w.t));
        assert.ok(w.goal >= WRIT.routMin && w.goal <= WRIT.routMax);
      } else if (w.kind === "hold") {
        assert.ok([...bordersOf(s, k), ...targetsOf(s, k)].includes(w.t) && STANDARDS.some((st) => st.t === w.t));
        assert.equal(w.goal, WRIT.holdMin);
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
  assert.equal(writRally(none, "host"), 1 + WRIT.rally);
  assert.ok(writPay(none, "host", 0).gold > writPay(w, big, 0).gold);
  for (const k of CLAN_KEYS) assert.ok(writRally(w, k) >= 1);
  assert.equal(writPay(w, big, 0).valor, WRIT.valor);
});

test("war writs: cleanWrit round-trips a writ and drops junk", () => {
  const o = writOffers(s, "wardens", L, 1, 3)[0] ?? writOffers(s, "redfang", L, 1, 3)[0];
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
    for (const l of lines) assert.ok(l.includes("{land}"), l);
    const f = writFlavour(k, kind, "Barrow Ford", 4);
    assert.ok(f.text.includes("Barrow Ford") && f.name.length > 0);
    assert.deepEqual(writFlavour(k, kind, "X", 4), writFlavour(k, kind, "X", 4));
  }
  assert.equal(writDay(Date.UTC(2026, 10, 15, 23, 59)), writDay(Date.UTC(2026, 10, 15, 0, 0)));
  assert.equal(writDay(Date.UTC(2026, 10, 16)), writDay(Date.UTC(2026, 10, 15)) + 1);
});
