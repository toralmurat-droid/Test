// The war's brakes (roadmap M2): the Night Raiders hunt the clan that holds clearly the most land, the Rally helps the weakest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { bordersOf, huntedClan, landOf, newWar, nightRaid, rallyClan, rallyRenown, targetsOf, WAR, warTick, type WarState } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { warPhase, warView } from "../shared/war/view";
import { writRally, WRIT } from "../shared/war/writs";
import { STANDARDS } from "../shared/war/standards";
import { _resetWar, addValor, attachWar, raidLine, rallyLine, rallyTell, step, warNow, warState } from "../server/war";
import { Presence, type WarHero } from "../server/warHeroes";

/** The fought land: the heartland havens never count toward a clan's share (rules.ts landOf, 2026-11-20). */
const N = TERRITORIES.filter((t) => !t.haven).length;
/** Owners with `k` holding `n` fought lands (non-capitals, non-havens handed over from the others), the rest as at the start. */
function withLand(k: ClanKey, n: number): WarState {
  const s = newWar();
  for (const t of TERRITORIES) {
    if (landOf(s, k) >= n) break;
    if (s.owner[t.id] !== k && !t.capitalOf && !t.haven) s.owner[t.id] = k;
  }
  return s;
}
const count = (s: Pick<WarState, "owner">, k: ClanKey) => landOf(s, k);
/**
 * A new war where the Hide-Kin have lost land to the Wardens just until the war rallies for them: the opening map is too
 * even for a Rally since the badlands joined (11/11/10/10/10), and one more land lifts them over the line again.
 */
function rallyWar(): WarState {
  const s = newWar();
  for (const t of TERRITORIES) { if (rallyClan(s)) break; if (s.owner[t.id] === "hidekin" && !t.capitalOf) s.owner[t.id] = "wardens"; }
  return s;
}

/**
 * Owners only, from counts of fought land per clan in CLAN_KEYS order (the shares are what huntedClan / rallyClan read);
 * the havens stay their home clan's and count for nobody.
 */
const split = (...n: number[]) => {
  const fought = CLAN_KEYS.flatMap((k, i) => Array<ClanKey>(n[i]).fill(k));
  return { owner: TERRITORIES.map((t) => t.haven ?? fought.shift()!) };
};

test("huntedClan: over leaderShare, or huntShare with a clear lead; never a close race", () => {
  assert.equal(huntedClan(newWar()), undefined, "the opening map has no runaway clan");
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const lead = Math.ceil(N * WAR.huntShare), rest = N - lead; // just at huntShare
  const clear = [Math.ceil(rest / 4) , lead, ...[0, 0, 0]]; clear[2] = clear[3] = Math.floor((rest - clear[0]) / 3); clear[4] = rest - clear[0] - clear[2] - clear[3];
  assert.equal(sum(clear), N);
  assert.ok(lead - Math.max(clear[0], clear[2], clear[3], clear[4]) >= WAR.huntLead, "the test map has a clear lead");
  assert.equal(huntedClan(split(...clear)), "redfang", "huntShare and a clear lead");
  const close = [lead - 1, lead, 0, 0, 0]; close[2] = close[3] = Math.floor((N - 2 * lead + 1) / 3); close[4] = N - sum(close);
  assert.equal(huntedClan(split(...close)), undefined, "a close second: nobody is clearly ahead");
  const over = Math.floor(N * WAR.leaderShare) + 1, o2 = [over - 1, over, 0, 0, 0]; o2[2] = o2[3] = Math.floor((N - 2 * over + 1) / 3); o2[4] = N - sum(o2);
  assert.equal(huntedClan(split(...o2)), "redfang", "over leaderShare: hunted even with a rival close behind");
  const tie = [over, over, 0, 0, 0]; tie[2] = tie[3] = Math.floor((N - 2 * over) / 3); tie[4] = N - sum(tie);
  assert.equal(huntedClan(split(...tie)), undefined, "two clans level at the top: neither is the prey");
});

test("nightRaid: only by night, the hunted clan's weakest non-capital borders, at most huntLands", () => {
  const s = withLand("redfang", Math.floor(N * WAR.leaderShare) + 1);
  for (const p of [0, 1]) assert.equal(nightRaid(s, p), undefined, `phase ${p}: no raid`);
  const b = bordersOf(s, "redfang").filter((t) => !TERRITORIES[t].capitalOf);
  s.control[b[b.length - 1]] = 40; // the weakest
  const r = nightRaid(s, 2)!;
  assert.equal(r.clan, "redfang");
  assert.ok(r.ts.length > 0 && r.ts.length <= WAR.huntLands);
  assert.equal(r.ts[0], b[b.length - 1], "weakest Control first");
  for (const t of r.ts) { assert.equal(s.owner[t], "redfang"); assert.ok(!TERRITORIES[t].capitalOf); assert.ok(b.includes(t)); }
  assert.equal(nightRaid(newWar(), 2), undefined, "nobody hunted: no raid");
});

test("warTick: the Night Raiders shake the struck lands and bleed the hunted army, only at night", () => {
  const mk = () => withLand("redfang", Math.floor(N * WAR.leaderShare) + 1);
  const s0 = mk(), r = nightRaid(s0, 2)!;
  for (const t of r.ts) s0.control[t] = 80;
  const night = warTick(structuredClone(s0), {}, { phase: 2 }), day = warTick(structuredClone(s0), {}, { phase: 0 });
  for (const t of r.ts) {
    assert.equal(day.control[t], 80 + WAR.regrow, "by day a quiet land regrows");
    assert.equal(night.control[t], 80 - WAR.huntControl + WAR.regrow, "by night the struck land loses huntControl (then regrows as quiet)");
  }
  assert.ok(Math.abs(night.army.redfang - day.army.redfang * (1 - WAR.raidersHit)) < 1e-6 * day.army.redfang, "the hunted army bleeds raidersHit by night");
  // an unhunted war is left alone at night
  const calm = newWar(), a = warTick(structuredClone(calm), {}, { phase: 2 }), b = warTick(structuredClone(calm), {}, { phase: 0 });
  assert.deepEqual(a.control, b.control);
});

test("rallyClan: the clan with the least land under rallyBelow x a fair share; ties by CLAN_KEYS order", () => {
  const s = newWar(), min = Math.min(...CLAN_KEYS.map((k) => count(s, k)));
  const want = min < WAR.rallyBelow * (N / CLAN_KEYS.length) ? CLAN_KEYS.find((k) => count(s, k) === min) : undefined;
  assert.equal(rallyClan(s), want);
  // everyone at a fair share or close: no Rally
  const even = { owner: TERRITORIES.map((_, i) => CLAN_KEYS[i % CLAN_KEYS.length]) };
  assert.equal(rallyClan(even), undefined);
  // two clans tied at the bottom, both under the line: the first in CLAN_KEYS order
  const tie = { owner: TERRITORIES.map((_, i) => (i < 2 ? "veiled" : i < 4 ? "redfang" : CLAN_KEYS[i % 3 === 0 ? 0 : i % 3 === 1 ? 2 : 3])) as ClanKey[] };
  assert.equal(rallyClan(tie), "redfang");
  assert.equal(rallyRenown(tie, "redfang"), WAR.rallyRenown);
  assert.equal(rallyRenown(tie, "veiled"), 1);
  assert.equal(rallyRenown(undefined, "redfang"), 1);
  assert.equal(rallyRenown(tie, undefined), 1);
});

test("Rally: the weakest clan's valor pushes harder (still capped by valorCap), others' does not change", () => {
  assert.equal(rallyClan(newWar()), undefined, "the opening map is even: no Rally");
  const base = rallyWar(), r = rallyClan(base)!;
  assert.equal(r, "hidekin");
  const t = targetsOf(base, r).find((x) => !TERRITORIES[x].capitalOf)!;
  const war = () => { const s = rallyWar(); s.army[s.owner[t]] = 0; return s; };
  const push = (v: number, mult: number) => {
    const was = WAR.rallyValor; WAR.rallyValor = mult;
    try { return warTick(war(), {}, { phase: 0, valor: TERRITORIES.map((_, i) => (i === t ? { [r]: v } : {})) }).control[t]; } finally { WAR.rallyValor = was; }
  };
  assert.ok(push(10, WAR.rallyValor) < push(10, 1), "rallied valor lowers Control more");
  assert.equal(push(1e6, WAR.rallyValor), push(1e6, 1), "a crowd hits valorCap either way");
});

test("writs: the rallied clan's writs pay WRIT.rallyClan more on top of the underdog bonus", () => {
  const s = rallyWar(), r = rallyClan(s)!;
  assert.ok(r);
  // (fair share over fought land only: the havens never count, as in rallyClan)
  const fair = N / CLAN_KEYS.length, under = 1 + WRIT.rally * Math.max(0, 1 - count(s, r) / fair);
  assert.equal(writRally(s, r), under * WRIT.rallyClan);
  for (const k of CLAN_KEYS) if (k !== r) assert.equal(writRally(s, k), 1 + WRIT.rally * Math.max(0, 1 - count(s, k) / fair));
});

test("war view: names the hunted and the rallied clan and the struck lands", () => {
  const s = withLand("redfang", Math.floor(N * WAR.leaderShare) + 1), r = rallyClan(s);
  const v = warView(s, 0, [3, -1, 9999, 1.5]);
  assert.equal(v.hunt, CLAN_KEYS.indexOf("redfang"));
  assert.deepEqual(v.raided, [3], "junk ids dropped");
  assert.equal(v.rally, r ? CLAN_KEYS.indexOf(r) : undefined);
  const calm = warView(newWar(), 0);
  assert.equal(calm.hunt, undefined); assert.equal(calm.raided, undefined);
});

test("herald lines read well", () => {
  assert.match(raidLine("redfang", [0, 1]), /^The Night Raiders ride against The Redfang Compact, the mightiest clan: .+ and .+ bleed\.$/);
  assert.match(rallyLine("hidekin", undefined), /^Rally for The Hide-Kin of Mawdeep!/);
  assert.match(rallyLine(undefined, "hidekin"), /Rally is over/);
  assert.match(rallyTell("hidekin"), /^Rally! .*x1\.3.*x1\.25/);
});

/** A wall-clock time whose war phase is night. */
function nightAt(from: number): number {
  for (let t = from; ; t += 60_000) if (warPhase(t) === 2) return t;
}

test("live war: a night tick against a runaway clan strikes, tells the room and marks the war view", async () => {
  const at = nightAt(7_000_000_000_000);
  const state = withLand("redfang", Math.floor(N * WAR.leaderShare) + 1);
  _resetWar({ v: 1, state, minds: newMinds(), next: at, log: [] });
  const want = nightRaid(state, 2)!.ts;
  const sent: [string, any][] = [];
  const off = attachWar({ broadcast: (t, m) => sent.push([t, m]) });
  await step(at);
  off();
  const raid = sent.find(([t]) => t === "warraid")?.[1];
  assert.deepEqual(raid, { clan: "redfang", ts: want });
  assert.ok(sent.some(([t, m]) => t === "chat" && m.name === "Herald" && m.text.startsWith("The Night Raiders ride against")));
  assert.deepEqual(warNow()!.raided, want, "the war table and plaque see the struck lands");
  assert.equal(warNow()!.hunt, CLAN_KEYS.indexOf("redfang"));
});

test("live war: the Rally is announced when it ends (or passes to another clan)", async () => {
  const at = 8_000_000_000_000, state = rallyWar(), r = rallyClan(state)!;
  assert.ok(r && count(state, r) + 1 >= WAR.rallyBelow * (N / CLAN_KEYS.length), "one more land lifts the opening's weakest over the line");
  // a siege the weakest clan has due on a land nobody defends: it falls to them this tick
  const L = targetsOf(state, r).find((t) => !TERRITORIES[t].capitalOf && count(state, state.owner[t]) - 1 > count(state, r) + 1)!;
  state.army[state.owner[L]] = 0; state.control[L] = 10; state.siege[L] = { by: r, at: 0 };
  _resetWar({ v: 1, state, minds: newMinds(), next: at, log: [] });
  for (let i = 0; i < 6; i++) addValor(L, r, 10);
  const sent: [string, any][] = [];
  const off = attachWar({ broadcast: (t, m) => sent.push([t, m]) });
  await step(at);
  off();
  assert.equal(warState()!.owner[L], r, "the land fell to the weakest clan");
  assert.notEqual(rallyClan(warState()!), r);
  assert.ok(sent.some(([t, m]) => t === "chat" && m.name === "Herald" && /Rally/.test(m.text)), "the Herald tells the room");
});

test("kill valor: a hero sworn to the rallied clan earns rallyRenown x renown for the same kill", async () => {
  const { WarTroops } = await import("../server/warTroops");
  const { atWar } = await import("../shared/war/feuds");
  const { WAR_TROOPS } = await import("../shared/war/troops");
  const s = rallyWar(), r = rallyClan(s)!;
  assert.ok(r);
  _resetWar({ v: 1, state: s, minds: newMinds(), next: Date.now() + 1e9, log: [] });
  // a land of a clan at war with the rallied clan that it may attack, and another clan at war with the holder that may too
  const land = TERRITORIES.find((t) => s.owner[t.id] !== r && atWar(r, s.owner[t.id]) && targetsOf(s, r).includes(t.id))!;
  assert.ok(land);
  const foe = s.owner[land.id], other = CLAN_KEYS.find((k) => k !== r && k !== foe && atWar(k, foe) && targetsOf(s, k).includes(land.id));
  const at = { x: (land.x + land.w / 2) * 32, y: (land.y + land.h / 2) * 32 };
  const earn = (clan: ClanKey) => {
    const p = { name: `h-${clan}`, clan, level: 20, x: at.x, y: at.y, dead: false, renown: 0 };
    const wt = new WarTroops({ hero: () => p, ranked: () => {} } as never);
    assert.equal(wt.killValor("a", foe, "soldier"), WAR_TROOPS.killPts.soldier);
    return p.renown;
  };
  const mine = earn(r);
  assert.ok(mine > 0);
  if (other) assert.ok(Math.abs(mine - earn(other) * WAR.rallyRenown) < 1e-9, "the Rally multiplies the same kill's renown");
});
