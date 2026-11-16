import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAN_KEYS } from "../shared/war/clans";
import { newMinds } from "../shared/war/doctrine";
import { newWar, targetsOf, valorForce, WAR, warTick } from "../shared/war/rules";
import { TERRITORIES } from "../shared/war/territories";
import { territoryAt, warView } from "../shared/war/view";
import { _resetWar, addValor, onWar, step, warLog, warNow, type SavedWar } from "../server/war";
import type { Kv } from "../server/store";

const memKv = () => { const m = new Map<string, string>(); const kv: Kv = { get: async (k) => (m.has(k) ? JSON.parse(m.get(k)!) : undefined), set: async (k, v) => { m.set(k, JSON.stringify(v)); } }; return { kv, m }; };
const saved = (next: number): SavedWar => ({ v: 1, state: newWar(), minds: newMinds(), next, log: [] });

test("valor: players add troops, with diminishing returns and a cap", () => {
  assert.equal(valorForce(0), 0);
  assert.ok(valorForce(10) > 0 && valorForce(20) < 2 * valorForce(10));
  assert.ok(valorForce(1e6) <= WAR.valorCap);
});

test("valor for an attacker pushes Control down; valor for the holder holds it", () => {
  const base = newWar();
  // A territory some clan may attack
  const k = CLAN_KEYS.find((c) => targetsOf(base, c).some((t) => !TERRITORIES[t].capitalOf))!;
  const t = targetsOf(base, k).find((x) => !TERRITORIES[x].capitalOf)!;
  // the holder's army stood down, so the test reads the valor and not how thin the holder's borders are on today's map
  const war = () => { const s = newWar(); s.army[s.owner[t]] = 0; return s; };
  const quiet = warTick(war(), {}, { phase: 0 }).control[t];
  const push = warTick(war(), {}, { phase: 0, valor: TERRITORIES.map((_, i) => (i === t ? { [k]: 1000 } : {})) }).control[t];
  assert.ok(push < quiet, `attacker valor lowers Control (${push} < ${quiet})`);
  // Garbage valor is ignored
  const junk: any[] = TERRITORIES.map(() => ({ nope: 5, [k]: NaN }));
  assert.doesNotThrow(() => warTick(newWar(), {}, { valor: junk }));
});

test("live war: ticks when due, tells listeners, saves, and catches up only a little after downtime", async () => {
  const { kv, m } = memKv(), t0 = 1_000_000_000_000;
  _resetWar(saved(t0), kv);
  let calls = 0; const off = onWar(() => { calls++; });
  await step(t0 - 1);
  assert.equal(warNow()!.tick, 0, "not due yet");
  await step(t0);
  assert.equal(warNow()!.tick, 1);
  assert.equal(calls, 1);
  assert.ok(m.has("war"), "saved after the tick");
  assert.equal(warNow()!.next, t0 + WAR.tickMs);
  await step(t0 + WAR.tickMs * 50); // a long outage
  assert.equal(warNow()!.tick, 4, "at most 3 ticks caught up");
  assert.ok(warNow()!.next > t0 + WAR.tickMs * 50);
  off();
});

test("live war: valor is spent by the tick it counts in, and bad input is ignored", async () => {
  const t0 = 2_000_000_000_000;
  _resetWar(saved(t0));
  addValor(-1, "wardens", 5); addValor(0, "nope" as any, 5); addValor(0, "wardens", NaN);
  await step(t0);
  assert.equal(warNow()!.tick, 1);
});

test("live war: a long war produces herald news and keeps every capital", async () => {
  const t0 = 3_000_000_000_000;
  _resetWar(saved(t0));
  for (let i = 0; i < 144 * 3; i++) await step(t0 + i * WAR.tickMs);
  const v = warNow()!;
  for (const t of TERRITORIES) if (t.capitalOf) assert.equal(CLAN_KEYS[v.owner[t.id]], t.capitalOf, t.name);
  assert.ok(warLog(200).some((e) => e.kind === "siege"), "sieges were announced");
  assert.ok(warLog(200).every((e) => typeof e.text === "string" && e.text.length > 10));
});

test("war view: compact snapshot and territory lookup", () => {
  const s = newWar(); s.siege[3] = { by: "redfang", at: 5 };
  const v = warView(s, 100);
  assert.equal(v.owner.length, TERRITORIES.length);
  assert.deepEqual(v.sieges, [[3, CLAN_KEYS.indexOf("redfang"), 100 + 5 * WAR.tickMs]]);
  const t = TERRITORIES[0];
  assert.equal(territoryAt(t.x + 1, t.y + 1)?.id, t.id);
  assert.equal(territoryAt(-5, -5), undefined);
});

test("live war: a saved war that no longer fits is kept aside, and a broken tick never stops the clock", async () => {
  const { kv, m } = memKv(), t0 = 4_000_000_000_000;
  const old = saved(t0) as any; delete old.minds.veiled; m.set("war", JSON.stringify(old));
  const { startWar, stopWar } = await import("../server/war");
  await startWar(kv); stopWar();
  assert.ok([...m.keys()].some((k) => k.startsWith("war-old-")), "old war kept");
  assert.equal(warNow()!.tick, 0);
  const bad = saved(t0) as any; bad.minds = {}; _resetWar(bad);
  await step(t0);
  assert.ok(warNow()!.next > t0, "the broken tick was skipped, the clock moved on");
});

test("live war: the save names its territories and loads back the same war", async () => {
  const { kv, m } = memKv(), t0 = 6_000_000_000_000;
  const { startWar, stopWar, warState } = await import("../server/war");
  _resetWar(saved(t0), kv);
  await step(t0); await step(t0 + WAR.tickMs);
  const disk = JSON.parse(m.get("war")!) as SavedWar;
  assert.deepEqual(disk.names, TERRITORIES.map((t) => t.name), "names written with the save (still v: 1)");
  assert.equal(disk.v, 1);
  const before = JSON.parse(JSON.stringify(warState()));
  _resetWar(undefined); stopWar();
  await startWar(kv); stopWar();
  assert.deepEqual(warState(), before, "loaded back unchanged");
  assert.deepEqual(warLog(), disk.log);
  assert.ok(![...m.keys()].some((k) => k.startsWith("war-old-")), "same map: nothing kept aside");
});

test("heralds: every leader has a line for every moment, filled in and capitalised", async () => {
  const { LEADERS, leaderLine, eventVoice } = await import("../shared/war/heralds");
  for (const k of CLAN_KEYS) for (const m of Object.keys(LEADERS[k].lines) as any[]) {
    const l = leaderLine(k, m, "Brinewood", k === "host" ? "wardens" : "host", 3);
    assert.ok(l.text.length > 10 && !/[{}]/.test(l.text) && l.text[0] === l.text[0].toUpperCase(), `${k} ${m}: ${l.text}`);
  }
  for (const k of CLAN_KEYS) for (const m of ["march", "ambushed", "clash"] as const) assert.equal(LEADERS[k].lines[m].length, 2, `${k} ${m}`);
  assert.deepEqual(eventVoice("siege", "redfang", "wardens"), { k: "wardens", foe: "redfang", moment: "besieged" });
  assert.deepEqual(eventVoice("flip", "redfang", "wardens"), { k: "redfang", foe: "wardens", moment: "took" });
});

test("attachWar: each event gives the herald, a leader's voice and a war event to the room", async () => {
  const { attachWar } = await import("../server/war");
  const t0 = 6_000_000_000_000;
  _resetWar(saved(t0));
  const sent: [string, any][] = [];
  const off = attachWar({ broadcast: (t, m) => sent.push([t, m]) });
  for (let i = 0; i < 144 && !sent.some(([t]) => t === "warev"); i++) await step(t0 + i * WAR.tickMs);
  off();
  const ev = sent.findIndex(([t]) => t === "warev");
  assert.ok(ev > 1, "a war event came");
  assert.equal(sent[ev - 2][1].name, "Herald");
  assert.ok(sent[ev - 1][1].name && sent[ev - 1][1].name !== "Herald", "a leader spoke");
});

test("attachWar (W3): Holds built up to a camp or a fortress: a few Herald lines a tick and a hammer chord at the Hold, no leader, no horn", async () => {
  const { attachWar } = await import("../server/war");
  const t0 = 7_000_000_000_000, sv = saved(t0);
  sv.state.fort = sv.state.fort.map(() => 0.195); // every quiet land crosses the camp line this tick
  _resetWar(sv);
  const sent: [string, any][] = [];
  const off = attachWar({ broadcast: (t, m) => sent.push([t, m]) });
  await step(t0);
  off();
  const grew = warLog().filter((e) => e.kind === "grow");
  assert.ok(grew.length >= 1 && grew.length <= 3, `${grew.length} announced (a new war raises every camp at once: a few only)`);
  for (const e of grew) {
    assert.equal(e.by, e.from);
    assert.equal(e.by, warNow()!.owner[e.t] !== undefined ? CLAN_KEYS[warNow()!.owner[e.t]] : undefined);
    assert.equal(e.tier, 1);
    assert.match(e.text, new RegExp(`raise a camp at ${TERRITORIES[e.t].name}$`));
    assert.ok(!TERRITORIES[e.t].capitalOf || TERRITORIES[e.t].capitalOf !== e.by, "a capital is a fortress from the start");
    assert.ok(sent.some(([t, m]) => t === "chat" && m.name === "Herald" && m.text === e.text));
    assert.ok(sent.some(([t, m]) => t === "sfx" && m.ev === "hold_grow" && m.t === e.t && m.tier === 1 && Number.isFinite(m.x) && Number.isFinite(m.y)));
  }
  assert.ok(!sent.some(([t, m]) => t === "warev" && m.kind === "grow"), "no horn for growth");
});

test("siege windows: valor counts more at a territory under siege", () => {
  const base = newWar();
  const k = CLAN_KEYS.find((c) => targetsOf(base, c).some((t) => !TERRITORIES[t].capitalOf))!;
  const t = targetsOf(base, k).find((x) => !TERRITORIES[x].capitalOf)!;
  const valor = TERRITORIES.map((_, i) => (i === t ? { [k]: 10 } : {}));
  const calm = warTick(newWar(), {}, { phase: 0, valor }).pressure[t];
  const s = newWar(); s.siege[t] = { by: k, at: 99 };
  const sieged = warTick(s, {}, { phase: 0, valor }).pressure[t];
  assert.ok(Math.abs(sieged - calm * WAR.siegeValor) < 1e-9, `${sieged} = ${calm} x ${WAR.siegeValor}`);
});

test("live war (W4): the orders ahead and the columns' losses go into the war save (throttled) and come back after a restart", async () => {
  const { kv, m } = memKv(), t0 = 7_000_000_000_000;
  const { startWar, stopWar, warMarches, marchCol, columnLost, warState, _warDirty } = await import("../server/war");
  _resetWar(saved(t0), kv);
  await step(t0);
  const ms = warMarches();
  assert.ok(ms.length > 0, "columns march for the next tick");
  let disk = JSON.parse(m.get("war")!) as SavedWar;
  assert.ok(disk.ahead && Object.keys(disk.ahead).length, "the orders ahead are saved");
  assert.deepEqual(disk.cols, {}, "no losses yet");
  const c = ms[0];
  assert.ok(columnLost(c.id, 2, t0 + 1000));
  assert.ok(!columnLost("nope", 1, t0 + 1000), "an unknown column");
  assert.ok(_warDirty());
  await step(t0 + 30_000);
  assert.equal((JSON.parse(m.get("war")!) as SavedWar).cols![c.id], undefined, "not saved again within COLUMN.saveMs");
  await step(t0 + 61_000);
  disk = JSON.parse(m.get("war")!) as SavedWar;
  assert.equal(disk.cols![c.id].fallen, 2, "saved after a minute");
  assert.ok(!_warDirty());
  const before = JSON.parse(JSON.stringify(warState())), ids = ms.map((x) => x.id);
  _resetWar(undefined); stopWar();
  await startWar(kv); stopWar();
  assert.deepEqual(warState(), before, "the war loads back unchanged");
  assert.deepEqual(warMarches().map((x) => x.id), ids, "the same columns, on the same roads, to the same targets");
  assert.equal(marchCol(c.id).fallen, 2, "with their fallen");
  assert.deepEqual(warMarches().find((x) => x.id === c.id), c);
});

test("live war (W4): an old save without orders ahead loads and plays its next tick exactly as before W4", async () => {
  const t0 = 8_000_000_000_000, { kv, m } = memKv();
  const { startWar, stopWar, warState, warMarches } = await import("../server/war");
  const old = saved(t0);
  for (let i = 0; i < 40; i++) warTick(old.state, {}); // (some war behind it)
  m.set("war", JSON.stringify(old));
  await startWar(kv); stopWar();
  assert.ok(warMarches().length > 0, "orders given on load: the columns march");
  await step(t0);
  const a = JSON.parse(JSON.stringify(warState()));
  _resetWar(JSON.parse(JSON.stringify(old))); // no orders ahead: given at the tick, as before W4
  await step(t0);
  assert.deepEqual(warState(), a);
});

test("live war (W4): a column's fallen soldiers weaken its attack at the next tick; an untouched one lands in full", async () => {
  const t0 = 9_000_000_000_000;
  const { warMarches, columnLost, columnHalt, warState } = await import("../server/war");
  const run = async (cut: boolean, halt = false) => {
    const s = saved(t0);
    for (let i = 0; i < 30; i++) warTick(s.state, {});
    _resetWar(s);
    await step(t0);
    const c = warMarches()[0];
    if (cut) columnLost(c.id, c.size);
    if (halt) columnHalt(c.id, 30_000);
    await step(t0 + WAR.tickMs);
    return { c, st: JSON.parse(JSON.stringify(warState())) };
  };
  const full = await run(false), cut = await run(true), halted = await run(false, true);
  assert.deepEqual(halted.st, full.st, "a halt alone changes nothing");
  assert.ok(cut.st.pressure[cut.c.to] < full.st.pressure[full.c.to], "a column cut down lands weaker");
  cut.st.pressure.forEach((p: number, t: number) => { if (t !== cut.c.to) assert.equal(p, full.st.pressure[t]); });
});
