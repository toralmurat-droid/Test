// Ages (roadmap M5) part 2: the Forge's lease (server/forge.ts). One server holds `lease:forge`: it runs the research
// clock and the gates, takes commissions and writes the "forge" row; the others reload the row and rebuild the registry,
// so items forged elsewhere stay known. A forge save of a newer FORGE_API (shared/forgeApi.ts) is never written.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEASE, Leases, buildId, memLeases, type LeaseBackend } from "../server/lease";
import {
  _forgeNow, _forgePulse, _forgeSave, _gatesDone, _resetForge, _setGateRunner, commission, flushForge, forgeClock, forgedStock, forgeRole,
  initForge, killForge, onForge, packFor, type ForgeSave,
} from "../server/forge";
import { _pulse, _resetWar, flushWar, startWar, stopWar, warRole, warState } from "../server/war";
import type { Kv } from "../server/store";
import { FORGE_API, forgeAccess } from "../shared/forgeApi";
import type { WeaponRecipe } from "../shared/forge";
import { gearDef } from "../shared/gear";
import { warDay } from "../shared/war/council";
import { newMinds } from "../shared/war/doctrine";
import { newWar } from "../shared/war/rules";

const WEAPON: WeaponRecipe = { kind: "weapon", clan: "redfang", name: "Fang of Rourke", base: "ws_bastard", implicit: [{ key: "atk", value: 2 }, { key: "str", value: 1 }], palette: "redfang" };
const W2: WeaponRecipe = { ...WEAPON, name: "Second Fang" };
/** A kv in memory with every optional part and a count of writes per key. */
function memKv(leases?: LeaseBackend) {
  const m = new Map<string, string>(), writes = new Map<string, number>();
  const kv: Kv = {
    get: async (k) => (m.has(k) ? JSON.parse(m.get(k)!) : undefined),
    set: async (k, v) => { m.set(k, JSON.stringify(v)); writes.set(k, (writes.get(k) ?? 0) + 1); },
    insertIfAbsent: async (k, v) => { if (m.has(k)) return false; await kv.set(k, v); return true; },
    list: async <T>(p: string) => Object.fromEntries([...m].filter(([k]) => k.startsWith(p)).map(([k, v]) => [k, JSON.parse(v) as T])),
    leases,
  };
  return { kv, m, writes };
}
const clock = (t = 1_000_000) => { const c = { t, now: () => c.t }; return c; };
/** A war this server owns (commissions are paid from it). */
const ownWar = () => { const state = newWar(); _resetWar({ v: 1, state, minds: newMinds(), next: Date.now() + 1e12, log: [] }); return state; };
/** A forge row as another server wrote it, with the given weapons forged. */
function otherRow(recipes: WeaponRecipe[], wrote = "other-1"): ForgeSave {
  _resetForge();
  for (const r of recipes) _forgeNow(r);
  const s = JSON.parse(JSON.stringify(_forgeSave())) as ForgeSave;
  s.wrote = wrote;
  return s;
}
const pre = () => `forge-pre-${buildId().replace(/[^a-z0-9_-]/gi, "_").slice(0, 80)}`;
const gate = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };

test("forge api: own and older versions are written, a newer one read only when minReader allows; old saves with no v load", () => {
  assert.equal(FORGE_API, 1);
  assert.equal(forgeAccess({ v: 1 }), "write");
  assert.equal(forgeAccess({ defs: [] }), "write", "no usable version: cleaned as version 1, as before the Ages");
  assert.equal(forgeAccess({ v: "1" }), "write");
  assert.equal(forgeAccess({ v: 2 }), "hide");
  assert.equal(forgeAccess({ v: 2, minReader: 1 }), "read");
  assert.equal(forgeAccess({ v: 3, minReader: 2 }), "hide");
  for (const junk of [null, 5, "forge", [], true]) assert.equal(forgeAccess(junk), "corrupt", JSON.stringify(junk));
});

test("forge without a shared store (JSON files): owner at once, commissions as before, nothing stamped", async () => {
  const { kv, m } = memKv();
  try {
    ownWar();
    await initForge(kv);
    assert.equal(forgeRole(), "owner");
    _setGateRunner(async () => ({ ok: true, reasons: [] }));
    const r = commission("redfang", WEAPON, warDay(warState()!.tick));
    assert.ok(r.ok && r.seq === 1);
    await _gatesDone();
    assert.equal(JSON.parse(m.get("forge")!).wrote, undefined, "a JSON save keeps its shape");
    assert.ok(![...m.keys()].some((k) => k.startsWith("forge-pre-")), "no snapshot without a shared store");
    await flushForge();
  } finally { _resetForge(); _resetWar(); }
});

test("forge follower: refuses commissions and admin changes (nothing spent or written), and learns what the owner forged", async () => {
  const t0 = 20_000_000, c = clock(t0), be = memLeases(c.now), { kv, m, writes } = memKv(be);
  be.rows.set("lease:forge", { holder: "main:owner", until: Infinity });
  const first = otherRow([WEAPON]), second = otherRow([WEAPON, W2], "other-2");
  m.set("forge", JSON.stringify(first));
  try {
    const state = ownWar(), army0 = state.army.redfang;
    _resetForge();
    await initForge(kv, new Leases(be, "main:me", true, c.now));
    assert.equal(forgeRole(), "follower");
    const w1 = first.defs[0].id;
    assert.equal(gearDef(w1)!.name, WEAPON.name, "the owner's forging is known here");
    assert.deepEqual(forgedStock("redfang"), [w1]);
    for (const mode of ["lead", "shadow"] as const) {
      const r = commission("redfang", W2, warDay(state.tick), mode);
      assert.equal(r.ok, false);
      assert.equal((r as { code: string }).code, "not_owner");
    }
    assert.equal(state.army.redfang, army0, "nothing spent");
    assert.equal(killForge(true), false, "no admin changes either");
    forgeClock(99);
    await _forgePulse();
    assert.equal(writes.get("forge"), undefined, "never wrote the forge");
    // the owner forges a second weapon and writes: the follower rebuilds its registry at its next beat
    const packs: string[][] = [];
    const off = onForge((p) => packs.push(p.defs.map((d) => d.id)));
    await _forgePulse();
    assert.equal(packs.length, 0, "nothing new: no rebuild");
    m.set("forge", JSON.stringify(second));
    await _forgePulse();
    const w2 = second.defs[1].id;
    assert.equal(gearDef(w2)!.name, W2.name, "an item forged on the other server is known");
    assert.deepEqual(forgedStock("redfang"), [w1, w2], "and sold at the capital");
    assert.deepEqual(packs[packs.length - 1], [w1, w2], "the rooms got the new pack");
    const n = packs.length;
    await _forgePulse();
    assert.equal(packs.length, n, "heard once");
    assert.equal(writes.get("forge"), undefined);
    off();
  } finally { _resetForge(); _resetWar(); }
});

test("forge takeover: when the owner's lease runs out the follower snapshots the row, owns the forge and gates pending research", async () => {
  const t0 = 30_000_000, c = clock(t0), be = memLeases(c.now), { kv, m, writes } = memKv(be);
  be.rows.set("lease:forge", { holder: "main:owner", until: t0 + LEASE.ttlMs });
  const row = otherRow([WEAPON]);
  row.projects.redfang = [{ seq: 2, recipe: W2, day: 0, liveDay: 1, at: 0, gate: "pending" }]; row.seq = 2;
  m.set("forge", JSON.stringify(row));
  try {
    const state = ownWar();
    _resetForge();
    const gated: string[] = [];
    await initForge(kv, new Leases(be, "main:me", true, c.now));
    _setGateRunner(async (d) => { gated.push(d.id); return { ok: true, reasons: [] }; });
    assert.equal(forgeRole(), "follower");
    await _forgePulse(); await _gatesDone();
    assert.deepEqual(gated, [], "a follower runs no gates");
    c.t = t0 + LEASE.ttlMs + 1; // the owner went away without giving the lease back
    await _forgePulse();
    assert.equal(forgeRole(), "owner");
    assert.equal(be.rows.get("lease:forge")!.holder, "main:me");
    assert.deepEqual(JSON.parse(m.get(pre())!), row, "the forge as the last owner left it, kept before this build writes");
    await _gatesDone();
    assert.equal(gated.length, 1, "the pending research is gated by the new owner");
    assert.equal(_forgeSave().projects.redfang![0].gate, "pass");
    const saved = JSON.parse(m.get("forge")!) as ForgeSave;
    assert.equal(typeof saved.wrote, "string", "written, stamped");
    assert.notEqual(saved.wrote, "other-1");
    // the owner commissions now
    const r = commission("redfang", { ...W2, name: "Third Fang" }, warDay(state.tick));
    assert.ok(r.ok);
    await _gatesDone();
    assert.ok((writes.get("forge") ?? 0) >= 2);
    // a second takeover by the same build keeps the first snapshot
    const snap = m.get(pre());
    _resetForge();
    await initForge(kv, new Leases(be, "main:me", true, c.now));
    assert.equal(m.get(pre()), snap);
    await flushForge();
  } finally { _resetForge(); _resetWar(); }
});

test("forge: a save of a newer FORGE_API is shown read-only or hidden, never written; the lease is given back", async () => {
  const forged = otherRow([WEAPON]);
  for (const [head, want] of [[{ v: 2, minReader: 1 }, "read"], [{ v: 2 }, "hidden"]] as const) {
    const c = clock(), be = memLeases(c.now), { kv, m, writes } = memKv(be);
    const raw = JSON.stringify({ ...forged, ...head, future: { x: 1 } });
    m.set("forge", raw);
    try {
      const state = ownWar();
      _resetForge();
      await initForge(kv, new Leases(be, "main:old", true, c.now));
      assert.equal(forgeRole(), want);
      assert.equal(packFor().defs.length, want === "read" ? 1 : 0, want === "read" ? "its forgings shown" : "hidden");
      assert.equal(be.rows.size, 0, "lease given back");
      assert.equal((commission("redfang", W2, warDay(state.tick)) as { code?: string }).code, "not_owner");
      assert.equal(killForge(true), false);
      await _forgePulse();
      assert.equal(be.rows.size, 0, "and not taken again");
      await flushForge();
      assert.equal(m.get("forge"), raw, "the newer save is untouched");
      assert.equal(writes.size, 0, "nothing written at all");
    } finally { _resetForge(); _resetWar(); }
  }
});

test("forge shutdown: a takeover under way when flushForge runs writes nothing and gives the lease back", async () => {
  const t0 = 40_000_000, c = clock(t0), be = memLeases(c.now), { kv, m, writes } = memKv(be);
  be.rows.set("lease:forge", { holder: "main:owner", until: t0 + LEASE.ttlMs });
  m.set("forge", JSON.stringify(otherRow([WEAPON])));
  try {
    ownWar(); _resetForge();
    await initForge(kv, new Leases(be, "main:me", true, c.now));
    assert.equal(forgeRole(), "follower");
    c.t = t0 + LEASE.ttlMs + 1; // the owner is gone: the next beat takes over...
    const g = gate(), get = kv.get;
    kv.get = (async (k: string) => { if (k === "forge") await g.p; return get(k); }) as Kv["get"];
    const beat = _forgePulse();
    await new Promise((r) => setTimeout(r, 5));
    const done = flushForge(); // ...but the server shuts down meanwhile
    assert.ok(done instanceof Promise);
    g.open();
    await beat; await done;
    assert.notEqual(forgeRole(), "owner");
    assert.equal(writes.get("forge"), undefined, "never wrote the forge");
    assert.ok(![...m.keys()].some((k) => k.startsWith("forge-pre-")), "no snapshot either");
    assert.equal(be.rows.has("lease:forge"), false, "the lease it had just taken is given back");
  } finally { _resetForge(); _resetWar(); }
});

test("forge owner: shutdown writes once more and releases; a lost lease stops writes; regained after an outage keeps unsaved progress", async () => {
  const t0 = 50_000_000, c = clock(t0), inner = memLeases(c.now), f = { down: false };
  const be: LeaseBackend = { acquire: (k, h, t) => (f.down ? Promise.reject(new Error("down")) : inner.acquire(k, h, t)), release: (k, h) => inner.release(k, h) };
  const { kv, m, writes } = memKv(be);
  try {
    const state = ownWar(); _resetForge();
    await initForge(kv, new Leases(be, "main:me", true, c.now));
    _setGateRunner(async () => ({ ok: true, reasons: [] }));
    assert.equal(forgeRole(), "owner");
    assert.ok(commission("redfang", WEAPON, warDay(state.tick)).ok);
    await _gatesDone();
    const n = writes.get("forge")!;
    _forgeSave().seq = 77; // progress not written yet
    f.down = true; c.t += LEASE.ttlMs; await _forgePulse();
    assert.equal(forgeRole(), "follower", "lost while the database was out");
    assert.equal((commission("redfang", W2, warDay(state.tick)) as { code?: string }).code, "not_owner");
    assert.equal(_forgeSave().seq, 77, "following its own last write keeps its own forge");
    f.down = false; await _forgePulse();
    assert.equal(forgeRole(), "owner");
    assert.equal(_forgeSave().seq, 77, "nobody wrote meanwhile: unsaved progress kept");
    assert.equal(writes.get("forge"), n, "no writes without the lease");
    // another server writes while this one is out: its forge is taken on regaining the lease
    f.down = true; c.t += LEASE.ttlMs; await _forgePulse();
    const theirs = JSON.parse(m.get("forge")!) as ForgeSave;
    theirs.seq = 500; theirs.wrote = "someone-else";
    m.set("forge", JSON.stringify(theirs));
    f.down = false; await _forgePulse();
    assert.equal(forgeRole(), "owner");
    assert.equal(_forgeSave().seq, 500, "another writer's forge reloaded");
    // shutdown: one last write, then the lease given back
    _forgeSave().seq = 501;
    const before = writes.get("forge")!;
    await flushForge();
    assert.equal(writes.get("forge"), before + 1, "written at shutdown");
    assert.equal(JSON.parse(m.get("forge")!).seq, 501);
    assert.equal(inner.rows.has("lease:forge"), false, "lease given back");
    assert.notEqual(forgeRole(), "owner");
    await _forgePulse();
    assert.equal(writes.get("forge"), before + 1, "no beat after the shutdown");
  } finally { _resetForge(); _resetWar(); }
});

test("forge gate: one finishing after the lease was lost is dropped, stays pending, and is gated exactly once on takeover", async () => {
  const t0 = 60_000_000, c = clock(t0), be = memLeases(c.now), { kv } = memKv(be);
  try {
    const state = ownWar(); _resetForge();
    await initForge(kv, new Leases(be, "main:me", true, c.now));
    const g = gate(), runs: string[] = [];
    _setGateRunner(async (d) => { runs.push(d.id); if (runs.length === 1) await g.p; return { ok: true, reasons: [] }; });
    assert.ok(commission("redfang", WEAPON, warDay(state.tick)).ok);
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(runs.length, 1, "gate under way");
    be.rows.set("lease:forge", { holder: "main:other", until: c.t + LEASE.ttlMs }); // (another server holds it now)
    await _forgePulse();
    assert.equal(forgeRole(), "follower");
    g.open(); await _gatesDone();
    assert.equal(_forgeSave().projects.redfang![0].gate, "pending", "the verdict came too late: dropped");
    c.t += LEASE.ttlMs + 1; // the other server is gone
    await _forgePulse();
    assert.equal(forgeRole(), "owner");
    await _gatesDone(); await _forgePulse(); await _gatesDone();
    assert.equal(runs.length, 2, "gated once more on takeover, and only once");
    assert.equal(_forgeSave().projects.redfang![0].gate, "pass");
    await flushForge();
  } finally { _resetForge(); _resetWar(); }
});

test("forge and war leases split: no commission while the war is elsewhere; the forge moves to the war's owner within a beat or two", async () => {
  const t0 = 70_000_000_000_000, c = clock(t0), be = memLeases(c.now), { kv, m, writes } = memKv(be);
  m.set("war", JSON.stringify({ v: 1, state: newWar(), minds: newMinds(), next: t0 + 1e12, log: [] }));
  try {
    _resetWar(undefined); stopWar(); _resetForge();
    await startWar(kv, new Leases(be, "main:me", true, c.now)); stopWar();
    await initForge(kv, new Leases(be, "main:me", true, c.now));
    assert.equal(warRole(), "owner"); assert.equal(forgeRole(), "owner");
    // the war's lease goes to another server (B); this one (A) still holds the forge's until its next beat
    be.rows.set("lease:war", { holder: "main:b", until: Infinity });
    await _pulse(c.t);
    assert.equal(warRole(), "follower");
    const army0 = warState()!.army.redfang;
    const r = commission("redfang", WEAPON, warDay(warState()!.tick));
    assert.equal((r as { code?: string }).code, "not_owner");
    assert.equal(warState()!.army.redfang, army0, "nothing spent");
    assert.ok(_forgeSave().log.some((e) => e.kind === "refused" && /not_owner/.test(e.text)), "in the forge's log (/admin/forge)");
    const n = writes.get("forge") ?? 0;
    await _forgePulse();
    assert.equal(forgeRole(), "follower", "handed on with the war");
    assert.equal(be.rows.has("lease:forge"), false, "lease given back for the war's owner");
    assert.equal(writes.get("forge"), n + 1, "written once more on the way out");
    await _forgePulse();
    assert.equal(be.rows.has("lease:forge"), false, "not taken again while the war is elsewhere");
    // the other way round: this server gets the war back; its forge follows at its next beat
    be.rows.delete("lease:war");
    await _pulse(c.t);
    assert.equal(warRole(), "owner");
    await _forgePulse();
    assert.equal(forgeRole(), "owner");
    assert.equal(be.rows.get("lease:forge")!.holder, "main:me");
    _setGateRunner(async () => ({ ok: true, reasons: [] }));
    assert.ok(commission("redfang", WEAPON, warDay(warState()!.tick)).ok, "commissions again");
    await _gatesDone(); await flushForge(); await flushWar();
  } finally { stopWar(); _resetForge(); _resetWar(); }
});

test("forge: a second init as a follower installs the registry it loaded, not the previous one", async () => {
  const c = clock(), be = memLeases(c.now), { kv, m } = memKv(be);
  be.rows.set("lease:forge", { holder: "main:owner", until: Infinity });
  m.set("forge", JSON.stringify("garbage")); // (a row this build cannot read: a follower leaves it and shows nothing)
  try {
    ownWar(); _resetForge();
    const w = _forgeNow(WEAPON); // (a registry from before the init)
    assert.equal(gearDef(w.id)!.name, WEAPON.name);
    await initForge(kv, new Leases(be, "main:me", true, c.now));
    assert.equal(forgeRole(), "follower");
    assert.match(gearDef(w.id)!.name, /^Forgotten/);
    assert.equal(packFor().defs.length, 0);
  } finally { _resetForge(); _resetWar(); }
});
