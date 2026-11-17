// The Forge, part 4 (M4 PR4): war councils order forgings. The forge order is checked apart from the targets, a lead
// council commissions (server/forge.ts commission), a shadow council only logs, one a clan a war day, the Herald's
// lines, the remote route's round trip, the briefing's forge section and the digest's.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { FORGE, forgeCodex, validateRecipe, type MonsterRecipe, type WeaponRecipe } from "../shared/forge";
import { CLAN_KEYS, CLANS, type ClanKey } from "../shared/war/clans";
import { dailyDigest, ORDER_SCHEMA, validateForgeOrder, type CouncilLogEntry } from "../shared/war/council";
import { newMinds } from "../shared/war/doctrine";
import { newWar, WAR } from "../shared/war/rules";
import { _forgeSave, _gatesDone, _resetForge, _setGateRunner, forgeBrief, forgeLine, killForge } from "../server/forge";
import { _resetWar, attachWar, step, type SavedWar } from "../server/war";
import {
  _resetCouncils, _setScriptedForge, cleanCouncil, councilBriefings, councilClock, mountCouncilRoutes, setCouncilMode, setCouncilProvider, submitCouncilOrders,
  type CouncilSave,
} from "../server/warCouncil";

const T0 = 1_000_000_000_000;
const K: ClanKey = "redfang";
const BEAST: Omit<MonsterRecipe, "clan"> = { kind: "monster", name: "Gore-Sewn Tusker", base: "tuskborn", affixes: ["stitched"], hp: 1.2, dmg: 1.1, speed: 1, palette: "hidekin" };
const BLADE: Omit<WeaponRecipe, "clan"> = { kind: "weapon", name: "Fang of Rourke", base: "ws_bastard", implicit: [{ key: "atk", value: 2 }, { key: "str", value: 1 }], palette: "redfang" };
const BAD = { kind: "monster", name: "Doom Tusker", base: "tuskborn", affixes: [], hp: 9, dmg: 1, speed: 1, palette: "hidekin" };

/** A fresh war, councils and forge; every gate passes unless the forging's name says "Doomed". */
function fresh(): SavedWar {
  _resetCouncils(); _resetForge();
  _setGateRunner(async (d) => (/Doomed/.test(d.name) ? { ok: false, reasons: ["too strong"] } : { ok: true, reasons: [] }));
  const sv: SavedWar = { v: 1, state: newWar(), minds: newMinds(), next: T0, log: [] };
  _resetWar(sv);
  return sv;
}
const cs = (sv: SavedWar) => sv.council as CouncilSave;
const heraldLines = () => {
  const sent: string[] = [];
  const off = attachWar({ broadcast: (t, m) => { const x = m as { name?: string; text?: string }; if (t === "chat" && x.name === "Herald") sent.push(x.text!); } });
  return { sent, off };
};
const projects = (k: ClanKey) => _forgeSave().projects[k] ?? [];

// ---- The order and the Codex ------------------------------------------------------------------------------------------

test("forge order: checked apart, the clan filled in, another clan's refused, codes named; the Codex's examples are legal", () => {
  const ok = validateForgeOrder(BEAST, K);
  assert.ok(ok.ok, ok.errors.join("; "));
  assert.equal(ok.recipe!.clan, K);
  assert.match(validateForgeOrder({ ...BEAST, clan: "host" }, K).errors[0], /^forge\.bad_clan/);
  assert.match(validateForgeOrder("a sword", K).errors[0], /^forge\.not_object/);
  assert.ok(validateForgeOrder(BAD, K).errors.some((e) => /^forge\.mult_range/.test(e)));
  const c = forgeCodex();
  for (const k of CLAN_KEYS) for (const ex of [c.examples.weapon, c.examples.monster]) assert.ok(validateRecipe({ ...ex, clan: k }).ok, `${k} ${ex.name}`);
  assert.ok(c.weapon.bases.length > 5 && c.monster.bases.some((b) => b.kind === "tuskborn"));
  assert.equal(ORDER_SCHEMA.orders.forge.codex, c);
  assert.ok(JSON.stringify(c).length < 16_000, "the Codex stays small enough to read in one briefing");
});

// ---- Sessions -----------------------------------------------------------------------------------------------------------

test("a bad forge order is rejected on its own: the clan's targets still lead, nothing is commissioned", async () => {
  const sv = fresh();
  setCouncilMode(K, "lead");
  _setScriptedForge(() => BAD);
  const army = sv.state.army[K];
  await councilClock(T0);
  const e = cs(sv).log.find((x) => x.k === K)!;
  assert.equal(e.status, "led");
  assert.equal(cs(sv).intents[K]?.mode, "lead", "the targets lead");
  assert.equal(e.forge?.status, "rejected");
  assert.ok(e.forge!.errors!.some((m) => /mult_range/.test(m)));
  assert.equal(e.orders?.forge, undefined);
  assert.equal(projects(K).length, 0);
  assert.equal(sv.state.army[K], army, "nothing paid");
});

test("bad targets never stop a legal forge order (it is commissioned, the doctrine leads)", async () => {
  const sv = fresh();
  setCouncilMode(K, "lead");
  setCouncilProvider(K, "scripted");
  _setScriptedForge(() => BEAST);
  const { registerProvider } = await import("../server/warCouncil");
  registerProvider({ name: "junk-targets", decide: async () => ({ targets: ["x"], forge: BEAST }) });
  setCouncilProvider(K, "junk-targets");
  await councilClock(T0);
  const e = cs(sv).log.find((x) => x.k === K)!;
  assert.equal(e.status, "fallback");
  assert.equal(e.forge?.status, "commissioned");
  assert.equal(projects(K).length, 1);
});

test("shadow councils never commission: the order is only logged", async () => {
  const sv = fresh();
  for (const k of CLAN_KEYS) setCouncilMode(k, "shadow");
  _setScriptedForge(() => BEAST);
  const h = heraldLines();
  await step(T0);
  h.off();
  const es = cs(sv).log.filter((x) => x.day === 0);
  assert.equal(es.length, 5);
  assert.ok(es.every((x) => x.status === "shadow" && x.forge?.status === "shadow"));
  assert.equal(_forgeSave().seq, 0, "no registry number taken");
  assert.ok(CLAN_KEYS.every((k) => projects(k).length === 0));
  assert.ok(!_forgeSave().log.some((x) => x.kind === "cost" || x.kind === "commission"));
  assert.equal(_forgeSave().log.filter((x) => x.kind === "shadow").length, 5);
  assert.ok(!h.sent.some((t) => /forge/i.test(t)), "no Herald line in shadow mode");
});

test("lead: the council commissions; the Herald hears the forges burning, the forging go live, a failed gate", async () => {
  const sv = fresh();
  setCouncilMode(K, "lead"); setCouncilMode("host", "lead");
  _setScriptedForge((b) => (b.day !== 0 ? undefined : b.clan === K ? BEAST : b.clan === "host" ? { ...BLADE, name: "Doomed Edge", palette: "bone" } : undefined));
  const army = sv.state.army[K], h = heraldLines();
  await step(T0);
  const e = cs(sv).log.find((x) => x.k === K && x.day === 0)!;
  assert.equal(e.forge?.status, "commissioned");
  assert.equal(e.forge?.liveDay, FORGE.researchDays);
  assert.equal(e.orders?.forge?.name, BEAST.name);
  assert.equal(projects(K).length, 1);
  assert.ok(_forgeSave().log.some((x) => x.kind === "cost" && x.clan === K && x.text.includes(`spent ${Math.round(army * FORGE.armyCost)} men`)), "paid from the army");
  assert.ok(h.sent.includes(forgeLine("burning", K, BEAST.name, "monster")), h.sent.join("\n"));
  assert.ok(h.sent.includes(forgeLine("burning", "host", "Doomed Edge", "weapon")));
  await _gatesDone();
  assert.equal(projects("host").length, 0, "the failed gate's project is gone");
  // the next tick passes on the failed gate; a research day later the beast goes live
  for (let i = 1; i <= WAR.ticksPerDay + 1; i++) await step(T0 + i * WAR.tickMs);
  h.off();
  assert.ok(h.sent.includes(forgeLine("failed", "host", "Doomed Edge", "weapon")), h.sent.join("\n"));
  assert.ok(h.sent.includes(forgeLine("live", K, BEAST.name, "monster")));
  assert.equal(h.sent.filter((t) => t.startsWith("The forges of")).length, 2, "one commission a clan, day 1 orders no forge");
  assert.deepEqual(_forgeSave().defs.map((d) => [d.clan, d.name, d.status]), [[K, BEAST.name, "active"]]);
  assert.match(forgeLine("live", K, BEAST.name, "monster"), new RegExp(`^${CLANS[K].name} has forged ${BEAST.name}`));
  for (const t of h.sent) assert.ok(/^[\x20-\x7e]*$/.test(t), "plain text");
  // the war day's digest has the forge section
  const d0 = cs(sv).digests.find((x) => x.day === 0)!;
  assert.match(d0.text, /forge: commissioned monster "Gore-Sewn Tusker" on tuskborn as #1, live on war day 1/);
  assert.match(d0.text, /\nForge: \n- .*commissioned monster "Gore-Sewn Tusker"/);
  assert.match(d0.text, /failed the sim gate/);
});

test("one forge order a clan a war day; the forge's own refusals are logged, never fatal", async () => {
  const sv = fresh();
  setCouncilMode(K, "lead");
  _setScriptedForge(() => BEAST);
  await councilClock(T0);
  assert.equal(projects(K).length, 1);
  assert.equal(cs(sv).forged?.[K], 0);
  // a second session the same war day (as if the day's mark were lost): the forge order is refused, the targets lead
  delete cs(sv).held[K];
  await councilClock(T0 + 1);
  const e = cs(sv).log.filter((x) => x.k === K).at(-1)!;
  assert.equal(e.status, "led");
  assert.equal(e.forge?.status, "refused");
  assert.match(e.forge!.errors![0], /one forge order a war day/);
  assert.equal(projects(K).length, 1);
  // the kill switch: refused with its reason
  delete cs(sv).held[K]; delete cs(sv).forged;
  killForge(true);
  await councilClock(T0 + 2);
  assert.match(cs(sv).log.at(-1)!.forge!.errors![0], /^killed/);
  killForge(false);
  assert.equal(projects(K).length, 1);
});

test("the scripted council never forges by default", async () => {
  const sv = fresh();
  for (const k of CLAN_KEYS) setCouncilMode(k, "lead");
  await councilClock(T0);
  assert.ok(cs(sv).log.every((x) => x.forge === undefined && x.orders?.forge === undefined));
  assert.equal(_forgeSave().seq, 0);
});

// ---- Briefing, remote route, save, digest ------------------------------------------------------------------------------

test("briefing: a forge section with the clan's forgings, research, the day's cap and the army cost", async () => {
  const sv = fresh();
  setCouncilMode(K, "lead");
  _setScriptedForge(() => BEAST);
  await councilClock(T0);
  const b = (councilBriefings(K).body as any).clans[0].briefing;
  assert.equal(b.day, 1, "day 0 has sat: the briefing is for day 1");
  assert.equal(b.forge.leftToday, FORGE.perDay, "a new day's cap");
  assert.equal(forgeBrief(K, 0).leftToday, FORGE.perDay - 1, "day 0 used one");
  await _gatesDone();
  const b2 = (councilBriefings(K).body as any).clans[0].briefing;
  assert.deepEqual(b2.forge.projects.map((p: any) => [p.name, p.kind, p.liveDay, p.gate]), [[BEAST.name, "monster", 1, "pass"]]);
  assert.deepEqual(b.forge.live, []);
  assert.equal(b.forge.armyCost.share, FORGE.armyCost);
  assert.equal(b.forge.armyCost.men, Math.round(sv.state.army[K] * FORGE.armyCost));
  assert.equal(b.forge.codex.monsterBudget, FORGE.mobBudget);
  assert.ok((councilBriefings().body as any).schema.orders.forge.codex.monster.bases.length > 0);
});

const TOKEN = "s3cret-token-for-tests-0123";
test("remote: forge orders round-trip; a bad recipe is answered with its errors, the targets are kept; the session commissions", async () => {
  const sv = fresh();
  setCouncilMode(K, "lead"); setCouncilProvider(K, "remote");
  const app = express();
  mountCouncilRoutes(app, { WAR_COUNCIL_TOKEN: TOKEN });
  const srv = app.listen(0);
  await new Promise((ok) => srv.once("listening", ok));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const post = async (body: unknown) => {
    const r = await fetch(`${base}/api/war/council/orders`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, j: await r.json() as any };
  };
  try {
    const br = await (await fetch(`${base}/api/war/council/briefing?clan=${K}`, { headers: { authorization: `Bearer ${TOKEN}` } })).json() as any;
    const day = br.clans[0].day, t = br.clans[0].briefing.targets[0].id;
    assert.ok(br.clans[0].briefing.forge && br.schema.orders.forge.codex);
    // bad targets and a bad recipe: 422, both named
    const r0 = await post({ clan: K, day, orders: { targets: ["x"], forge: BAD } });
    assert.equal(r0.status, 422);
    assert.equal(r0.j.forge.accepted, false);
    assert.ok(r0.j.forge.errors.some((e: string) => /mult_range/.test(e)));
    assert.equal(cs(sv).log.at(-1)!.forge?.status, "rejected");
    // good targets, a bad recipe: the targets are stored, the recipe is not; logged as a forge rejection
    const r1 = await post({ clan: K, day, orders: { targets: [t], forge: BAD } });
    assert.equal(r1.status, 200);
    assert.equal(r1.j.ok, true);
    assert.equal(r1.j.forge.accepted, false);
    assert.ok(r1.j.forge.errors.length);
    assert.equal(cs(sv).pending[K]!.orders.forge, undefined);
    assert.equal(cs(sv).log.at(-1)!.status, "forge_rejected");
    // fixed: the recipe comes back with the orders (clan filled in)
    const r2 = await post({ clan: K, day, orders: { targets: [t], forge: BLADE } });
    assert.equal(r2.status, 200);
    assert.deepEqual(r2.j.forge, { accepted: true, errors: [], recipe: { ...BLADE, clan: K } });
    assert.deepEqual(r2.j.orders.forge, { ...BLADE, clan: K });
    assert.ok(JSON.stringify({ clan: K, day, orders: { targets: [t, t, t], stance: "attack", proclamation: "x".repeat(160), rationale: "y".repeat(200), forge: { ...BLADE, implicit: [{ key: "atk", value: 3 }, { key: "str", value: 3 }, { key: "dex", value: 3 }], elem: { el: "fire", share: 0.5 } } } }).length < 8000, "a full order set fits the 8 kB cap");
    // the pending orders survive a save round trip with their recipe
    assert.deepEqual(cleanCouncil(JSON.parse(JSON.stringify(cs(sv)))).pending[K], cs(sv).pending[K]);
    await councilClock(T0);
    const e = cs(sv).log.filter((x) => x.k === K).at(-1)!;
    assert.equal(e.status, "led");
    assert.equal(e.forge?.status, "commissioned");
    assert.deepEqual(projects(K).map((p) => p.recipe.name), [BLADE.name]);
    const r3 = submitCouncilOrders({ clan: K, day: day + 1, orders: { targets: [], forge: { ...BEAST, clan: "host" } } }).body as any;
    assert.equal(r3.ok, true);
    assert.match(r3.forge.errors[0], /^forge\.bad_clan/, "another clan's recipe");
  } finally { await new Promise((ok) => srv.close(ok)); }
});

test("save: forge notes, recipes in the log and the forged days round-trip; junk notes are dropped", async () => {
  const sv = fresh();
  setCouncilMode(K, "lead");
  _setScriptedForge(() => BEAST);
  await councilClock(T0);
  const c = cs(sv);
  assert.ok(c.log.some((x) => x.forge && x.orders?.forge));
  assert.deepEqual(cleanCouncil(JSON.parse(JSON.stringify(c))), c);
  const junk = cleanCouncil({ forged: { host: -1, redfang: "2", nope: 3 }, log: [{ at: 1, day: 0, k: "host", mode: "lead", provider: "x", status: "led", forge: { status: "boom" }, orders: { targets: [], forge: BAD } }] });
  assert.equal(junk.forged, undefined);
  assert.equal(junk.log[0].forge, undefined);
  assert.equal(junk.log[0].orders!.forge, undefined, "an illegal recipe is not kept");
});

test("digest: the forge section and the councils' forge notes, in plain text", () => {
  const e = (x: Partial<CouncilLogEntry>): CouncilLogEntry => ({ at: 1, day: 2, k: "host", mode: "lead", provider: "remote", status: "led", orders: { targets: [] }, ...x });
  const text = dailyDigest(2, {
    council: [
      e({ forge: { status: "commissioned", kind: "weapon", name: "Bone Saw", base: "wx_hand", seq: 4, liveDay: 3 } }),
      e({ k: "veiled", mode: "shadow", status: "shadow", forge: { status: "shadow", kind: "monster", name: "Sun Tusker", base: "tuskborn" } }),
      e({ k: "redfang", status: "forge_rejected", errors: ["forge.mult_range: hp is 0.8-1.6"], forge: { status: "rejected", errors: ["forge.mult_range: hp is 0.8-1.6"] } }),
    ],
    forge: ["The Ossuary Host commissioned weapon \"Bone Saw\" on wx_hand"],
  });
  for (const want of ['forge: commissioned weapon "Bone Saw" on wx_hand as #4, live on war day 3', 'forge: would forge monster "Sun Tusker"',
    "redfang (lead, remote) forge order rejected (targets accepted): forge.mult_range", "Forge: \n- The Ossuary Host commissioned"]) assert.ok(text.includes(want), `${want}\n---\n${text}`);
  assert.match(dailyDigest(2, { forge: [] }), /Forge: nothing forged/);
  assert.ok(!dailyDigest(2, {}).includes("Forge"), "no forge input, no section (the war sim)");
  assert.ok(/^[\x20-\x7e\n]*$/.test(text));
});
