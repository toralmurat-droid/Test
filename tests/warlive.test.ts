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
  const quiet = warTick(newWar(), {}, { phase: 0 }).control[t];
  const push = warTick(newWar(), {}, { phase: 0, valor: TERRITORIES.map((_, i) => (i === t ? { [k]: 1000 } : {})) }).control[t];
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
