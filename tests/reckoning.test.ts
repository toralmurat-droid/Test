// The Reckoning (Crown PR4): the monthly fight for the Crown Keep. Pure rules (shared/war/crown.ts) and the war's side
// of it (server/warCrown.ts through server/war.ts): the window, the scores, the Keep changing hands, the boon, the pay
// and the save.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { newWar, WAR } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import {
  crownBoon, heroKey, inReckoning, reckonCountdown, spanText, keepOf, landPoints, RECKONING, reckoningAt, reckoningOf, reckonReward, reckonWinner, scoresOf, standings,
} from "../shared/war/crown";
import { _resetWar, addValor, migrateWar, step, warCrownSave, warNow, warState, type SavedWar } from "../server/war";
import { _reckoning, _startReckoning, boonGold, boonGoldMult, boonRenown, claimCrown, cleanCrown, crownClock, crownLine, crownTick, onCrown, type CrownNews } from "../server/warCrown";

const H = 3600_000;
const KEEP = keepOf(TERRITORIES)!;
const CROWN = TERRITORIES.filter((t) => t.region === "crown" && !t.reckoningOnly);
const zero = () => Object.fromEntries(CLAN_KEYS.map((k) => [k, 0])) as Record<ClanKey, number>;
const freshWar = () => { const state = newWar(); _resetWar({ v: 1, state, minds: newMinds(), next: Date.now() + 1e12, log: [] }); return state; };

test("reckoning: the first Saturday of each month, 18:00-21:00 UTC, across months and years", () => {
  const at = (y: number, m: number) => new Date(reckoningOf(y, m).start).toISOString();
  assert.equal(at(2026, 10), "2026-11-07T18:00:00.000Z"); // Nov 1 2026 is a Sunday
  assert.equal(at(2026, 11), "2026-12-05T18:00:00.000Z"); // a Tuesday
  assert.equal(at(2027, 0), "2027-01-02T18:00:00.000Z"); // a Friday, a new year
  assert.equal(at(2025, 1), "2025-02-01T18:00:00.000Z"); // the 1st itself a Saturday
  assert.equal(at(2028, 1), "2028-02-05T18:00:00.000Z"); // a leap year
  assert.equal(at(2026, 2), "2026-03-07T18:00:00.000Z"); // daylight saving changes nothing (UTC)
  for (let y = 2026; y <= 2030; y++) for (let m = 0; m < 12; m++) {
    const w = reckoningOf(y, m), d = new Date(w.start);
    assert.equal(d.getUTCDay(), 6); assert.ok(d.getUTCDate() <= 7); assert.equal(d.getUTCHours(), 18);
    assert.equal(w.end - w.start, RECKONING.hours * H);
  }
  // under way, or the next: this month's still to come, else next month's (December rolls into January)
  const nov = reckoningOf(2026, 10), dec = reckoningOf(2026, 11), jan = reckoningOf(2027, 0);
  assert.deepEqual(reckoningAt(Date.UTC(2026, 10, 1)), nov);
  assert.deepEqual(reckoningAt(nov.start + H), nov);
  assert.ok(inReckoning(nov.start) && inReckoning(nov.end - 1) && !inReckoning(nov.end) && !inReckoning(nov.start - 1));
  assert.deepEqual(reckoningAt(nov.end), dec);
  assert.deepEqual(reckoningAt(Date.UTC(2026, 11, 20)), jan);
});

test("reckoning: land points (the Keep thrice), valor at its rate, the top score wins, a tie or no score leaves the holder", () => {
  const s = newWar(), pts = landPoints(s.owner, TERRITORIES);
  const total = Object.values(pts).reduce((a, b) => a + (b ?? 0), 0);
  assert.equal(total, CROWN.length * RECKONING.landPts + RECKONING.keepPts);
  assert.ok((pts[s.owner[KEEP.id]] ?? 0) >= RECKONING.keepPts);
  const sc = scoresOf({ land: { wardens: 10 }, valor: { redfang: 40 } });
  assert.equal(sc.wardens, 10); assert.equal(sc.redfang, 40 * RECKONING.valorPts); assert.equal(sc.host, 0);
  assert.deepEqual(reckonWinner({ ...zero(), wardens: 12, redfang: 9 }, "hidekin"), { winner: "wardens", kept: false });
  assert.deepEqual(reckonWinner({ ...zero(), wardens: 12, redfang: 12 }, "hidekin"), { winner: "hidekin", kept: true }); // a tie at the top: the holder keeps it
  assert.deepEqual(reckonWinner({ ...zero(), hidekin: 12, redfang: 12 }, "hidekin"), { winner: "hidekin", kept: true });
  assert.deepEqual(reckonWinner(zero(), "veiled"), { winner: "veiled", kept: true });
  assert.deepEqual(standings({ ...zero(), host: 3, veiled: 7 }).slice(0, 2), ["veiled", "host"]);
});

test("reckoning: the boon only for the crowned clan while it holds the Keep; pay for taking part, more for the winners", () => {
  assert.deepEqual(crownBoon("redfang", "redfang", "redfang"), { gold: 1 + RECKONING.boon.gold, renown: 1 + RECKONING.boon.renown });
  assert.deepEqual(crownBoon("redfang", "redfang", "host"), { gold: 1, renown: 1 });
  assert.deepEqual(crownBoon("redfang", "host", "redfang"), { gold: 1, renown: 1 }); // (no longer holds it)
  assert.deepEqual(crownBoon(undefined, "host", "host"), { gold: 1, renown: 1 }); // before any Reckoning: the first holder was only given it
  assert.deepEqual(crownBoon("host", "host", undefined), { gold: 1, renown: 1 });
  assert.ok(reckonReward(true).gold > reckonReward(false).gold && reckonReward(true).renown > reckonReward(false).renown);
  assert.equal(heroKey("Ann", "wizard"), "Ann/wizard");
});

test("reckoning (war): a window scores the Crown's land each tick and its valor; the top clan takes the Keep and its heroes are owed pay", async () => {
  const s = freshWar(), t0 = Date.now(), holder = s.owner[KEEP.id], winner = CLAN_KEYS.find((k) => k !== holder)!;
  const news: CrownNews[] = [], off = onCrown((n) => news.push(n));
  try {
    _startReckoning(t0, 10 * 60_000);
    assert.equal(news[0]?.kind, "start");
    crownTick(t0 + 1);
    const land = landPoints(s.owner, TERRITORIES);
    assert.deepEqual(_reckoning()!.land, land);
    // valor in the Crown scores for the clan and the hero who earned it; valor elsewhere does not
    const outside = TERRITORIES.find((t) => t.region !== "crown")!;
    assert.ok(addValor(outside.id, winner, 10, heroKey("Elsewhere", "wizard")));
    assert.equal(_reckoning()!.valor[winner], undefined);
    assert.equal(_reckoning()!.heroes[heroKey("Elsewhere", "wizard")], undefined);
    const need = Math.ceil((Math.max(...Object.values(land).map((x) => x ?? 0)) + 1) / RECKONING.valorPts / WAR.valorPerAdd) + 1;
    for (let i = 0; i < need; i++) assert.ok(addValor(CROWN[0].id, winner, 10, heroKey("Champion", "wizard"), ));
    assert.ok(addValor(CROWN[0].id, holder, 3, heroKey("Loyal", "vampire")));
    assert.equal(_reckoning()!.heroes[heroKey("Champion", "wizard")].v, need * 10);
    assert.equal(_reckoning()!.valor[winner], need * WAR.valorPerAdd);
    assert.equal(warNow()!.reck!.on, true);
    // the boon is not there yet
    assert.equal(boonGold(winner, 100), 100);
    // the window closes on the war's clock
    await step(t0 + 10 * 60_000);
    assert.equal(_reckoning(), undefined);
    assert.equal(warState()!.owner[KEEP.id], winner, "the top scorer takes the Keep");
    assert.equal(warState()!.control[KEEP.id], 100);
    const c = warCrownSave()!;
    assert.equal(c.crowned, winner);
    assert.deepEqual(c.last && [c.last.winner, c.last.kept], [winner, false]);
    assert.equal(news.at(-1)?.kind, "result");
    assert.match(crownLine(news.at(-1)!), /take The Crown Keep/);
    assert.equal(warNow()!.reck!.crowned, CLAN_KEYS.indexOf(winner));
    // the boon: +10% gold and renown for the winners' sworn, nothing for the others
    assert.equal(boonGold(winner, 100), 110); assert.equal(boonGoldMult(winner), 1.1); assert.equal(boonRenown(winner), 1.1);
    assert.equal(boonGold(holder, 100), 100); assert.equal(boonRenown(holder), 1);
    // pay: once each, the winners' more
    const won = claimCrown(heroKey("Champion", "wizard"))!, lost = claimCrown(heroKey("Loyal", "vampire"))!;
    assert.deepEqual([won.gold, won.renown, won.won], [reckonReward(true).gold, reckonReward(true).renown, true]);
    assert.deepEqual([lost.gold, lost.renown, lost.won], [reckonReward(false).gold, reckonReward(false).renown, false]);
    assert.equal(claimCrown(heroKey("Champion", "wizard")), undefined, "paid once only");
    assert.equal(claimCrown(heroKey("Elsewhere", "wizard")), undefined, "no part in the Crown: no pay");
    // valor after the window scores nothing
    assert.ok(addValor(CROWN[0].id, winner, 10, heroKey("Late", "wizard")));
    assert.equal(c.cur, undefined);
  } finally { off(); }
});

test("reckoning (war): a tie at the top leaves the Keep with its holder; pay waits RECKONING.reward.keepMs, then lapses", async () => {
  const s = freshWar(), t0 = Date.now(), holder = s.owner[KEEP.id], other = CLAN_KEYS.find((k) => k !== holder)!;
  _startReckoning(t0, 60_000);
  addValor(CROWN[0].id, other, 4, heroKey("Tier", "wizard"));
  const cur = _reckoning()!;
  cur.land = { [holder]: 9, [other]: 9 - 4 * RECKONING.valorPts };
  assert.equal(scoresOf(cur)[holder], scoresOf(cur)[other]);
  await step(t0 + 60_000);
  assert.equal(warState()!.owner[KEEP.id], holder);
  assert.equal(warCrownSave()!.last!.kept, true);
  assert.equal(warCrownSave()!.crowned, holder, "the holder that kept it at a Reckoning is crowned");
  assert.equal(boonGold(holder, 100), 110);
  const key = heroKey("Tier", "wizard");
  assert.equal(warCrownSave()!.pay![key].won, false);
  crownClock(t0 + 60_000 + RECKONING.reward.keepMs + 1);
  assert.equal(warCrownSave()!.pay?.[key], undefined, "unclaimed pay lapses");
});

test("reckoning (war): the clock warns an hour before, opens, tells the standings hourly and closes, once each", () => {
  freshWar();
  const w = reckoningOf(2031, 4), news: string[] = [], off = onCrown((n) => news.push(n.kind));
  try {
    crownClock(w.start - 2 * H); assert.deepEqual(news, []);
    crownClock(w.start - H + 1); crownClock(w.start - H + 2); assert.deepEqual(news, ["warn"]);
    crownClock(w.start); crownClock(w.start + 5); assert.deepEqual(news, ["warn", "start"]);
    crownClock(w.start + H); crownClock(w.start + H + 5); crownClock(w.start + 2 * H); assert.deepEqual(news, ["warn", "start", "standings", "standings"]);
    crownClock(w.end); crownClock(w.end + 5); assert.deepEqual(news, ["warn", "start", "standings", "standings", "result"]);
    // a server down for the whole window holds no Reckoning that month
    const w2 = reckoningOf(2031, 5);
    crownClock(w2.end + 1); assert.deepEqual(news.length, 5);
  } finally { off(); }
});

test("reckoning (save): the crown field round-trips, old war saves without it load, a broken one reads as none, a map change keeps it", async () => {
  const s = freshWar(), t0 = Date.now();
  _startReckoning(t0, 60_000);
  crownTick(t0);
  addValor(CROWN[1].id, "veiled", 5, heroKey("Saver", "summoner"));
  const c = warCrownSave()!;
  c.crowned = "host"; c.pay = { [heroKey("Waiting", "wizard")]: { gold: 500, renown: 30, until: t0 + 1e9, won: false } };
  const back = cleanCrown(JSON.parse(JSON.stringify(c)));
  assert.deepEqual(back, JSON.parse(JSON.stringify(c)));
  assert.deepEqual(cleanCrown(undefined), {});
  assert.deepEqual(cleanCrown({ crowned: "nobody", cur: { start: 5, end: 1 }, pay: { a: { gold: "x" } }, last: { winner: 3 } }), {});
  // a war save written before the Reckoning (no `crown`) loads as one with none so far
  const old: SavedWar = { v: 1, state: newWar(), minds: newMinds(), next: Date.now() + 1e9, log: [] };
  _resetWar(old);
  assert.deepEqual(warCrownSave(), {});
  assert.equal(warNow()!.reck!.crowned, undefined);
  assert.equal(boonGold(s.owner[KEEP.id], 100), 100);
  // a map change remaps the war and keeps its Reckoning
  const names = TERRITORIES.map((t) => t.name), withCrown: SavedWar = { ...old, crown: back };
  assert.deepEqual(migrateWar(withCrown, names, names).crown, back);
  assert.deepEqual(migrateWar(withCrown, names.slice(0, 62), names).crown, back);
});

test("reckoning: the countdown text before and during a window", () => {
  const w = reckoningOf(2026, 11);
  assert.equal(spanText(2 * 24 * H + 5 * H), "2d 5h");
  assert.equal(spanText(H + 20 * 60_000), "1h 20m");
  assert.equal(spanText(59_000), "1m");
  assert.equal(reckonCountdown(w, w.start - 3 * H), "in 3h 0m");
  assert.equal(reckonCountdown({ ...w, on: true }, w.start + H), "ends in 2h 0m");
});
