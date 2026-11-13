// Party buffs, shared buffs, shields and party auras (shared/skillEngine.ts: party, shareBuff, partyBuff, absorbDamage,
// FieldDef.party), run through the real room's SkillHost. No live skill uses them yet, so the tests use their own defs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { absorbDamage, FIELD_PARTY_LINGER_MS, newRuntime, party, partyBuff, shareBuff, SkillHost, Unit } from "../shared/skillEngine";
import type { BuffDef, FieldDef } from "../shared/skills";
import { isSafeZone, isSolidAt, VILLAGE } from "../shared/map";
import { TILE } from "../shared/constants";
import { startRoom, wait } from "./helpers/room";

/** A walkable spot outside the stockade and the safe zone (damage is ignored in the safe zone). */
function openSpot(): [number, number] {
  for (let tx = VILLAGE.x0 - 12; tx > 0; tx--) {
    const x = (tx + 0.5) * TILE, y = (VILLAGE.y0 + 10.5) * TILE;
    if (!isSolidAt(x, y) && !isSafeZone(x, y)) return [x, y];
  }
  throw new Error("no open spot");
}

/** Joins `n` heroes, puts them all on one open spot, and records every "sfx" event the room sends. */
async function setup(n: number) {
  const srv = await startRoom();
  const clients = [];
  for (let i = 0; i < n; i++) clients.push(await srv.join({ cls: "wizard" }));
  await wait(200);
  const room = srv.room, [x, y] = openSpot();
  const ids = clients.map((c) => c.sessionId);
  const ps = ids.map((id) => room.state.players.get(id));
  for (const p of ps) { p.x = x; p.y = y; p.invulnUntil = 0; p.sk.buffs = []; }
  const sfx: Record<string, unknown>[] = [];
  const bc = room.broadcast.bind(room);
  room.broadcast = (type: string, msg: any, ...rest: unknown[]) => { if (type === "sfx") sfx.push(msg); return bc(type, msg, ...rest); };
  const host: SkillHost = room.host;
  const buff = (i: number, s: string) => ps[i].sk.buffs.find((b: { id: string; until: number }) => b.id === s && b.until > Date.now());
  const done = async () => { for (const c of clients) await c.leave(); await srv.stop(); };
  return { room, host, ids, ps, x, y, sfx, buff, done };
}

test("party buff: reaches a group ally in radius, not a non-party hero or an ally out of range", async () => {
  const t = await setup(4);
  try {
    const [a, b] = t.ids;
    t.ps[0].party = t.ps[1].party = t.ps[3].party = "gtest"; // c (ps[2]) is not in the group
    t.ps[3].x += 300; // d: in the group but too far
    assert.deepEqual(party(t.host, a, t.x, t.y, 120).sort(), [a, b].sort());
    const def: BuffDef = { ms: 5000, dmg: 10, party: 120 };
    partyBuff(t.host, a, "t_hymn", def, 1, 1);
    assert.ok(t.buff(0, "t_hymn"), "the caster has it");
    assert.ok(t.buff(1, "t_hymn"), "the ally in range has it");
    assert.equal(t.buff(1, "t_hymn").from, a, "credited to the caster");
    assert.equal(t.buff(2, "t_hymn"), undefined, "a hero outside the group does not");
    assert.equal(t.buff(3, "t_hymn"), undefined, "an ally out of range does not");
    assert.equal(t.sfx.filter((e) => e.ev === "buff" && e.s === "t_hymn").length, 2);
    // the room's status words carry it (no new synced fields)
    await wait(150);
    assert.ok(t.ps[1].fx.split(",").includes("t_hymn"));
  } finally { await t.done(); }
});

test("shareBuff: the same skill from two casters doesn't stack, the stronger cast wins", async () => {
  const t = await setup(3);
  try {
    const [a, b, c] = t.ids;
    const def: BuffDef = { ms: 4000, dmg: 10 };
    shareBuff(t.host, a, c, "t_hymn", def, 1, 1);
    assert.equal(t.ps[2].sk.buffs.filter((x: { id: string }) => x.id === "t_hymn").length, 1);
    const ev = () => t.sfx.filter((e) => e.ev === "buff" && e.id === c && e.s === "t_hymn").length;
    assert.equal(ev(), 1);
    // a stronger cast from b replaces it
    shareBuff(t.host, b, c, "t_hymn", def, 3, 1.5);
    assert.equal(t.ps[2].sk.buffs.filter((x: { id: string }) => x.id === "t_hymn").length, 1, "never two of one skill");
    assert.equal(t.buff(2, "t_hymn").from, b);
    assert.equal(ev(), 2, "replaced: a new buff event");
    // a weaker cast from a later on only makes it last longer: b's stays, no event
    const until = t.buff(2, "t_hymn").until;
    await wait(20);
    shareBuff(t.host, a, c, "t_hymn", { ...def, ms: 60_000 }, 1, 1);
    const cur = t.buff(2, "t_hymn");
    assert.equal(cur.from, b, "the stronger buff stays");
    assert.equal(cur.rank, 3);
    assert.ok(cur.until > until, "extended");
    assert.equal(ev(), 2, "a refresh sends no buff event");
    assert.equal(t.ps[2].sk.buffs.filter((x: { id: string }) => x.id === "t_hymn").length, 1);
  } finally { await t.done(); }
});

test("shield: absorbs damage, then breaks with a shieldbreak event; the same skill's shields keep the bigger pool", async () => {
  const t = await setup(2);
  try {
    const [a, b] = t.ids;
    const pa = t.ps[0], pb = t.ps[1];
    t.ps[0].party = t.ps[1].party = "gtest";
    partyBuff(t.host, a, "t_ward", { ms: 10_000, shield: 20, party: 120 }, 1, 1);
    const pool = pa.maxHp * 0.2;
    assert.ok(Math.abs(t.buff(1, "t_ward").shield - pool) < 1e-6, "pool = 20% of the caster's max HP");
    // a smaller shield of the same skill doesn't replace or add to it
    shareBuff(t.host, b, b, "t_ward", { ms: 10_000, shield: 5 }, 1, 1);
    assert.ok(Math.abs(t.buff(1, "t_ward").shield - pool) < 1e-6, "the bigger pool stays");
    // a small blow is soaked up whole
    const hp0 = pb.hp;
    t.room.damagePlayer(b, 5, "test", [0, 0], 0, {});
    assert.equal(pb.hp, hp0, "no life lost");
    const left = t.buff(1, "t_ward").shield;
    assert.ok(left < pool && left > 0, "the pool shrank");
    assert.equal(t.sfx.some((e) => e.ev === "shieldbreak"), false);
    // a big one breaks it: the rest goes to life
    t.room.damagePlayer(b, Math.ceil(left) + 10, "test", [0, 0], 0, {});
    assert.ok(pb.hp < hp0, "the overflow hurts");
    assert.ok(hp0 - pb.hp <= 10 + 1, "only the overflow hurts");
    assert.equal(t.buff(1, "t_ward"), undefined, "the shield buff is gone");
    const brk = t.sfx.find((e) => e.ev === "shieldbreak");
    assert.ok(brk, "shieldbreak event");
    assert.equal(brk!.id, b); assert.equal(brk!.s, "t_ward");
  } finally { await t.done(); }
});

test("party aura: a FieldDef.party buff runs out about 0.6 s after stepping out of the field", async () => {
  const t = await setup(2);
  try {
    const [a, b] = t.ids;
    t.ps[0].party = t.ps[1].party = "gtest";
    const tickMs = 250;
    const def: FieldDef = { kind: "aura", r: 100, ms: 30_000, tickMs, party: { ms: 0, speed: 10 } };
    t.host.addField({ owner: a, skill: "t_march", def, rank: 1, power: 1, x: t.x, y: t.y, until: Date.now() + 30_000, nextTick: Date.now() });
    await wait(400);
    assert.ok(t.buff(1, "t_march"), "the ally inside has it");
    assert.ok(t.buff(0, "t_march"), "so does the owner");
    const events = t.sfx.filter((e) => e.ev === "buff" && e.id === b && e.s === "t_march").length;
    assert.equal(events, 1, "topped up every tick without a new buff event");
    // step out
    t.ps[1].x += 400;
    const left = Date.now(), until = t.buff(1, "t_march").until;
    assert.ok(until - left >= FIELD_PARTY_LINGER_MS - 100 && until - left <= tickMs + FIELD_PARTY_LINGER_MS + 100, `lingers ${until - left} ms`);
    await wait(300);
    assert.ok(t.buff(1, "t_march"), "still up just after leaving");
    await wait(tickMs + FIELD_PARTY_LINGER_MS + 150 - 300);
    assert.equal(t.buff(1, "t_march"), undefined, "gone shortly after");
    assert.ok(t.buff(0, "t_march"), "the owner inside keeps it");
  } finally { await t.done(); }
});

test("absorbDamage / party without groups (the balance sims): just the caster, no shield = damage unchanged", () => {
  const u: Unit = { x: 0, y: 0, dead: false, level: 10, sk: newRuntime(), hp: 100, maxHp: 100 };
  const fx: Record<string, unknown>[] = [];
  const h = { now: () => 1000, unit: (id: string) => (id === "u" ? u : undefined), fx: (e: Record<string, unknown>) => fx.push(e), heal: () => {} } as unknown as SkillHost;
  assert.deepEqual(party(h, "u", 0, 0, 500), ["u"]);
  assert.equal(absorbDamage(h, "u", 30), 30);
  shareBuff(h, "u", "u", "t_ward", { ms: 5000, shield: 10 }, 1, 2); // 10% x 100 HP x power 2 = 20
  assert.equal(absorbDamage(h, "u", 15), 0);
  assert.equal(absorbDamage(h, "u", 15), 10);
  assert.equal(u.sk.buffs.length, 0);
  assert.equal(fx.filter((e) => e.ev === "shieldbreak").length, 1);
});
