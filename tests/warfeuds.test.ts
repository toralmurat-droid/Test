import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import {
  _resetWarRelations, addKill, atWar, killPoints, borderPairs, cleanFeud, clansOf, decayFeud, FEUD, feudFromView, feudView, grudgeActive, marksOf, pairOf,
  ptsOf, setWarPairs, setWarRelations, settleFeud, tierOf, utcDay, wantedTier, warPairs, warRelations, type FeudState,
} from "../shared/war/feuds";
import { feudLine, FEUD_LINES } from "../shared/war/heralds";
import { newWar } from "../shared/war/rules";
import { STANDARD } from "../shared/war/standards";
import { troopStance } from "../shared/war/troops";

const key = (a: ClanKey, b: ClanKey) => [a, b].sort().join("-");
const T0 = 1_800_000_000_000;

test("feuds: pair indexes are unique and round-trip", () => {
  const seen = new Set<number>();
  for (const a of CLAN_KEYS) for (const b of CLAN_KEYS) {
    if (a === b) { assert.equal(pairOf(a, b), -1); continue; }
    const p = pairOf(a, b);
    assert.equal(p, pairOf(b, a));
    assert.ok(p >= 0 && p < 10);
    assert.deepEqual(new Set(clansOf(p)), new Set([a, b]));
    seen.add(p);
  }
  assert.equal(seen.size, 10);
});

test("feuds: at war on the opening map = the pairs that can strike each other's land (targetsOf: neighbours, two borders for the Hide-Kin)", () => {
  try {
    setWarRelations(newWar().owner, 0);
    const war = new Set(warPairs().map((p) => key(...clansOf(p)!)));
    // the six pairs whose land touches...
    for (const [a, b] of [["host", "veiled"], ["redfang", "wardens"], ["host", "wardens"], ["veiled", "wardens"], ["host", "redfang"], ["hidekin", "wardens"]] as [ClanKey, ClanKey][])
      assert.ok(atWar(a, b) && atWar(b, a), `${a}-${b} at war`);
    // ...and the Hide-Kin reach the Redfang two borders away by tunnel
    assert.ok(atWar("hidekin", "redfang"), "hidekin-redfang: within tunnel reach");
    for (const [a, b] of [["hidekin", "host"], ["hidekin", "veiled"], ["redfang", "veiled"]] as [ClanKey, ClanKey][]) assert.ok(!atWar(a, b), `${a}-${b} at peace`);
    assert.equal(war.size, 7);
    assert.ok(!atWar("wardens", "wardens"));
  } finally { _resetWarRelations(); }
});

test("feuds: a pair stays at war FEUD.peaceTicks war ticks after its last shared border; the memory survives a restart", () => {
  try {
    const owner = newWar().owner;
    setWarRelations(owner, 10);
    assert.ok(atWar("redfang", "wardens"));
    // the Wardens lose every land: nobody borders them any more
    const gone = owner.map((k) => (k === "wardens" ? "host" : k));
    assert.ok(![...borderPairs(gone)].includes(pairOf("redfang", "wardens")));
    setWarRelations(gone, 10 + FEUD.peaceTicks);
    assert.ok(atWar("redfang", "wardens"), "still at war within the hysteresis");
    const saved = warRelations();
    _resetWarRelations();
    assert.ok(!atWar("redfang", "wardens"), "nothing known: no war");
    setWarRelations(gone, 10 + FEUD.peaceTicks, saved);
    assert.ok(atWar("redfang", "wardens"), "restored from the saved memory");
    setWarRelations(gone, 11 + FEUD.peaceTicks);
    assert.ok(!atWar("redfang", "wardens"), "peace after peaceTicks");
    setWarRelations(gone, 12 + FEUD.peaceTicks, ["junk", null, NaN, Infinity]);
    assert.ok(warPairs().every((p) => p >= 0 && p < 10), "junk memory reads as never");
    // the client takes the server's list as it is (junk dropped)
    setWarPairs([pairOf("hidekin", "veiled"), 99, -1, 1.5, "x"]);
    assert.deepEqual(warPairs(), [pairOf("hidekin", "veiled")]);
    assert.ok(atWar("veiled", "hidekin"));
  } finally { _resetWarRelations(); }
});

test("feuds: the stance matrix (ally, at war, at peace, grudge, Wanted, newcomer, unsworn)", () => {
  try {
    setWarRelations(newWar().owner, 0);
    const L = STANDARD.minLevel, now = T0;
    const grudge: FeudState = { redfang: { until: now + 1000 } }, wanted: FeudState = { redfang: { pts: FEUD.tiers[0], at: now } };
    assert.equal(troopStance("redfang", { clan: "redfang", level: 20, feud: wanted }, now), "ally", "own clan stays an ally, even Wanted");
    assert.equal(troopStance("redfang", { clan: "wardens", level: 20 }, now), "enemy", "at war");
    assert.equal(troopStance("redfang", { clan: "veiled", level: 20 }, now), "neutral", "at peace");
    assert.equal(troopStance("redfang", { level: 20 }, now), "neutral", "unsworn");
    assert.equal(troopStance("redfang", { level: 20, feud: grudge }, now), "enemy", "a grudge");
    assert.equal(troopStance("redfang", { clan: "veiled", level: 20, feud: grudge }, now), "enemy", "a grudge beats peace");
    assert.equal(troopStance("redfang", { level: 20, feud: grudge }, now + 1000), "neutral", "the grudge ran out");
    assert.equal(troopStance("redfang", { level: 20, feud: wanted }, now + 60_000), "enemy", "Wanted implies a grudge");
    assert.equal(troopStance("host", { level: 20, feud: grudge }, now), "neutral", "a grudge is with one clan only");
    assert.equal(troopStance("redfang", { level: L - 1, feud: grudge }, now), "neutral", "newcomers stay out of it");
    assert.equal(troopStance("redfang", { clan: "wardens", level: L - 1 }, now), "neutral");
  } finally { _resetWarRelations(); }
});

test("feuds: kill points, tiers, grudge, decay and settling", () => {
  const f: FeudState = {}, now = T0;
  assert.equal(tierOf(0), 0); assert.equal(tierOf(FEUD.tiers[0]), 1); assert.equal(tierOf(FEUD.tiers[1]), 2); assert.equal(tierOf(FEUD.tiers[2]), 3);
  let r = addKill(f, "redfang", FEUD.pts.soldier, now);
  assert.deepEqual(r, { was: 0, tier: 0 });
  assert.ok(grudgeActive(f, "redfang", now + FEUD.grudgeMs - 1), "a kill is a grudge");
  assert.ok(!grudgeActive(f, "redfang", now + FEUD.grudgeMs), "that runs out");
  r = addKill(f, "redfang", FEUD.pts.hero, now);
  assert.deepEqual(r, { was: 0, tier: 1 }, "soldier + sworn hero = Wanted");
  assert.equal(wantedTier(f, "redfang", now), 1);
  assert.equal(wantedTier(f, "host", now), 0);
  for (let i = 0; i < 50; i++) addKill(f, "redfang", FEUD.pts.officer, now);
  assert.equal(f.redfang!.pts, FEUD.maxPts, "capped");
  assert.equal(wantedTier(f, "redfang", now), 3);
  // decay: a point per decayMs without a kill
  assert.equal(ptsOf(f, "redfang", now + FEUD.decayMs * 5 + 10), FEUD.maxPts - 5);
  decayFeud(f, now + FEUD.decayMs * 5 + 10);
  assert.equal(f.redfang!.pts, FEUD.maxPts - 5);
  assert.equal(f.redfang!.at, now + FEUD.decayMs * 5, "the step keeps the remainder");
  const changed = decayFeud(f, now + FEUD.decayMs * (FEUD.maxPts - FEUD.tiers[2] + 1));
  assert.deepEqual(changed, ["redfang"], "Marked -> Hunted is reported");
  decayFeud(f, now + FEUD.decayMs * 100 + FEUD.grudgeMs);
  assert.equal(f.redfang, undefined, "all forgiven: the entry goes");
  // death at the clan's hands
  addKill(f, "host", 10, now);
  f.host!.paid = utcDay(now);
  settleFeud(f, "host");
  assert.deepEqual(f.host, { paid: utcDay(now) }, "points and grudge gone, the bounty day stays");
  assert.ok(!grudgeActive(f, "host", now));
  decayFeud(f, now + 86_400_000);
  assert.equal(f.host, undefined, "another day: the bounty day goes too");
  addKill(f, "veiled", 1, now); settleFeud(f, "veiled");
  assert.equal(f.veiled, undefined);
});

test("feuds: cleanFeud drops junk and unknown clans, clamps, applies offline decay and drops spent entries", () => {
  const now = T0;
  assert.deepEqual(cleanFeud(undefined, now), {}, "old saves: none");
  for (const junk of [null, 5, "x", [], [1, 2]]) assert.deepEqual(cleanFeud(junk, now), {});
  const f = cleanFeud({
    redfang: { pts: 12, at: now - FEUD.decayMs * 3 - 5, until: now + 5000 },
    host: { until: now - 1 }, // spent
    veiled: { pts: "lots", until: now + 1e12 }, // clamped grudge, junk points
    wardens: { pts: 1e9, at: now + 1e9 }, // future step clamped to now, points capped
    hidekin: { paid: utcDay(now) },
    __proto__x: { pts: 5 }, goblins: { pts: 5 },
  }, now);
  assert.deepEqual(Object.keys(f).sort(), ["hidekin", "redfang", "veiled", "wardens"]);
  assert.equal(f.redfang!.pts, 9, "three decay steps while offline");
  assert.equal(f.redfang!.until, now + 5000);
  assert.deepEqual(f.veiled, { until: now + FEUD.grudgeMs });
  assert.equal(f.wardens!.pts, FEUD.maxPts);
  assert.equal(f.wardens!.at, now);
  assert.deepEqual(f.hidekin, { paid: utcDay(now) });
  assert.deepEqual(cleanFeud({ redfang: { pts: 2, at: now - FEUD.decayMs * 10 } }, now), {}, "decayed away offline");
  // a save being loaded: time away decays at FEUD.offlineDecay
  const away = cleanFeud({ redfang: { pts: 12, at: now - FEUD.decayMs * 6 } }, now, true);
  assert.equal(away.redfang!.pts, 12 - 6 * FEUD.offlineDecay, "six periods away count as three");
  assert.ok(FEUD.decayMs * FEUD.tiers[0] >= 40 * 60_000, "Wanted lasts about 40 minutes online");
  assert.deepEqual(cleanFeud({ redfang: { paid: utcDay(now) - 1 } }, now), {}, "yesterday's bounty day goes");
  // round trip through JSON (the save)
  assert.deepEqual(cleanFeud(JSON.parse(JSON.stringify(f)), now), f);
});

test("feuds: the owner's view rebuilds the same stance on the client; marks list the Wanted tiers", () => {
  const now = T0, f: FeudState = {};
  addKill(f, "redfang", FEUD.tiers[1], now);
  addKill(f, "host", 1, now);
  const v = feudView(f, now + 1000);
  assert.equal(v.c.redfang!.p, FEUD.tiers[1]);
  assert.equal(v.c.redfang!.g, FEUD.grudgeMs - 1000);
  assert.equal(v.c.redfang!.d, FEUD.decayMs - 1000);
  const local = feudFromView(JSON.parse(JSON.stringify(v)), 5_000);
  assert.equal(wantedTier(local, "redfang", 5_000), 2);
  assert.ok(grudgeActive(local, "host", 5_000));
  assert.equal(ptsOf(local, "redfang", 5_000 + FEUD.decayMs - 999), FEUD.tiers[1] - 1, "decays on the same beat as the server");
  assert.deepEqual(feudFromView({ c: { goblins: { p: 5 }, redfang: { p: "x", g: -5 } } }, 0), {}, "junk view");
  assert.deepEqual(marksOf(f, now), [["redfang", 2]], "only Wanted and above are marked");
});

test("feuds: every clan has leader lines for every feud moment", () => {
  for (const k of CLAN_KEYS) for (const m of ["wanted", "hunted", "marked", "bounty"] as const) {
    assert.ok(FEUD_LINES[k][m].length > 0);
    const l = feudLine(k, m, "Bob", 3);
    assert.ok(l.text.includes("Bob") && l.name.length > 0, `${k} ${m}`);
  }
});

test("feuds: a sworn hero fighting a clan at war builds Wanted only slowly; a provoked neutral clan's kills and an unsworn hero's count in full", () => {
  try {
    setWarRelations(newWar().owner, 0); // opening map: Redfang at war with the Wardens, at peace with the Veiled
    const now = T0;
    assert.equal(killPoints("soldier", "wardens", "redfang"), FEUD.pts.soldier * FEUD.warKillWeight);
    assert.equal(killPoints("hero", "wardens", "redfang"), FEUD.pts.hero * FEUD.warKillWeight);
    const war: FeudState = {};
    for (let i = 0; i < 10; i++) addKill(war, "redfang", killPoints("soldier", "wardens", "redfang"), now);
    assert.equal(wantedTier(war, "redfang", now), 0, "10 kills in an ordinary war fight: not Wanted");
    assert.ok(war.redfang!.pts! > 3 && war.redfang!.pts! < FEUD.tiers[0]);
    for (let i = 0; i < 2; i++) addKill(war, "redfang", killPoints("soldier", "wardens", "redfang"), now);
    assert.equal(war.redfang!.pts, FEUD.tiers[0], "thirds add up exactly: a rampage of 12 does make them Wanted");
    // the Veiled, at peace with Redfang, provoked them: full points
    const prov: FeudState = { redfang: { until: now + FEUD.grudgeMs } };
    for (let i = 0; i < 4; i++) addKill(prov, "redfang", killPoints("soldier", "veiled", "redfang"), now);
    assert.equal(wantedTier(prov, "redfang", now), 1, "4 kills of a provoked neutral clan: Wanted");
    assert.equal(killPoints("soldier", undefined, "redfang"), FEUD.pts.soldier, "unsworn: full");
    assert.equal(killPoints("officer", "redfang", "redfang"), FEUD.pts.officer, "(own clan never reaches here: the server skips it)");
    // fractions survive the save and the client view
    assert.equal(cleanFeud(JSON.parse(JSON.stringify(war)), now).redfang!.pts, war.redfang!.pts);
    const w1: FeudState = {}; addKill(w1, "redfang", 1 / 3, now);
    assert.equal(feudFromView(JSON.parse(JSON.stringify(feudView(w1, now))), now).redfang!.pts, 1 / 3);
  } finally { _resetWarRelations(); }
});
