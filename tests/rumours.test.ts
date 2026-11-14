// Quest concept #10 (Tavern Rumours, WP6): the daily offers (shared/rumours.ts), where they put things, and the room
// flow (server/rumours.ts) for each template, the limits, saves and the UTC rollover. Numbers are read from RUMOURS,
// never text. The generation check covers a whole year x Lv 1-30 (about 2 s), so there is no sampling.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, wait } from "./helpers/room"; // first: sets SAVE_FILE / IDEAS_FILE to a temp dir
import { actOfTile, MAP_H, MAP_W, TILE } from "../shared/constants";
import { allObjects, CHAINS, chainState, inZone, packQuest } from "../shared/quests";
import { isSafeZone, isSolidAt, isSolidTile, randomSpawn } from "../shared/map";
import { isDecorSolidAt, npcById } from "../shared/npcs";
import { SPAWN_ZONES } from "../shared/spawns";
import { unpackCosmetics } from "../shared/cosmetics";
import { META, metaOf } from "../shared/questSteps";
import { cleanRumour, RUMOUR_GIVER, RUMOUR_TITLE, rumourDay, rumourGround, rumourObjects, rumoursFor, RUMOURS, type Rumour } from "../shared/rumours";

const TUT = CHAINS.findIndex((c) => c.id === "tutorial");
const tutDone = (p: any) => { p.tut = packQuest(CHAINS[TUT].quests.length, 0, 0); };
const mags = npcById(RUMOUR_GIVER)!;
const at = (p: any, x: number, y: number) => { p.x = x; p.y = y; };
const byMags = (p: any) => at(p, mags.x, mags.y + 8);
const spot = (z: string) => SPAWN_ZONES.find((s) => s.name === z)!;

async function until(f: () => boolean, what: string, ms = 20_000) {
  const t = Date.now();
  while (!f()) { if (Date.now() - t > ms) throw new Error(`timed out: ${what}`); await wait(20); }
}
/** Wait until the rumour runner has scanned n more times (for "nothing happened" checks, instead of a fixed wait). */
async function scans(room: any, n: number) {
  const h = room.rumours.h, orig = h.heroes; let k = 0;
  h.heroes = () => { k++; return orig(); };
  try { await until(() => k >= n, `${n} scans`); } finally { h.heroes = orig; }
}
/** A level where today's offers include a rumour of this kind (undefined: none today). */
function find(day: number, kind: string): { L: number; r: Rumour } | undefined {
  for (let L = 1; L <= 30; L++) { const r = rumoursFor(day, L).find((x) => x.kind === kind); if (r) return { L, r }; }
  return undefined;
}
/** A joined hero past the tutorial, safe from harm, with the "rumour" messages collected. */
async function hero(srv: any, cls: string) {
  const c = await srv.join({ cls }), msgs: any[] = [];
  c.onMessage("rumour", (m: any) => msgs.push(m));
  await until(() => !!srv.room.state.players.get(c.sessionId), "joined");
  const p = srv.room.state.players.get(c.sessionId);
  tutDone(p); p.invulnUntil = Date.now() + 600_000;
  return { c, p, msgs, room: srv.room };
}
/** Keep asking until a message that Mags' rate limit ate has been let through. */
const takeUntil = (c: any, p: any, i: number) => until(() => { if (p.rumour.i === undefined) c.send("rumour", { take: i }); return p.rumour.i === i; }, `offer ${i} taken`);

/** Send "use" until the condition holds (the room's rate limit may eat one). Re-using a used object does nothing. */
const useUntil = (c: any, id: string, cond: () => boolean, what: string) => until(() => { if (!cond()) c.send("use", { id }); return cond(); }, what);

/**
 * Run a room test on a day that has the given rumour kinds on offer (for some level), whatever today is: the clock this
 * process sees (and so the server's, which reads Date.now()) is shifted to about 12:00 UTC of that day, then keeps
 * flowing. Independent of the real date and of UTC midnight passing mid-run.
 */
async function onDay(kinds: string[], fn: (day: number) => Promise<void>) {
  const today = rumourDay(Date.now());
  let day = -1;
  for (let d = today; d < today + 400 && day < 0; d++) if (kinds.every((k) => find(d, k))) day = d;
  assert.ok(day >= 0, `no day in the next 400 with ${kinds.join(" + ")} on offer`);
  const real = Date.now, off = day * 86_400_000 + 43_200_000 - real();
  Date.now = () => real() + off;
  try { await fn(day); } finally { Date.now = real; }
}

// ---------- generation ----------

test("rumoursFor: deterministic, three in three different Act 1 zones, the same errand in a shared zone", () => {
  const day = rumourDay(Date.now());
  for (const L of [1, 5, 12, 20, 30]) {
    const rs = rumoursFor(day, L);
    assert.equal(rs.length, RUMOURS.offers);
    assert.equal(JSON.stringify(rs), JSON.stringify(rumoursFor(day, L)));
    assert.equal(new Set(rs.map((r) => r.zone)).size, RUMOURS.offers, "a different zone each");
    for (const r of rs) assert.equal(actOfTile(spot(r.zone).x, spot(r.zone).y), 1, "Act 1");
    rs.forEach((r, i) => assert.equal(r.i, i));
  }
  // two levels that share a zone see the same objects there
  let shared = 0;
  for (let L = 1; L < 30; L++) for (const r of rumoursFor(day, L)) {
    const o = rumoursFor(day, L + 1).find((s) => s.zone === r.zone);
    if (!o) continue;
    shared++;
    assert.equal(o.kind, r.kind);
    assert.deepEqual(rumourObjects(o).map(({ id, x, y }) => ({ id, x, y })), rumourObjects(r).map(({ id, x, y }) => ({ id, x, y })));
    assert.deepEqual(o.steps.map((s) => s.at), r.steps.map((s) => s.at));
  }
  assert.ok(shared > 0, "neighbouring levels do share zones");
  assert.notEqual(JSON.stringify(rumoursFor(day, 10)), JSON.stringify(rumoursFor(day + 1, 10)), "another day, other errands");
});

const DAYS = Array.from({ length: 365 }, (_, d) => d), LEVELS = Array.from({ length: 30 }, (_, i) => i + 1);

test("generation (365 days x Lv 1-30): in zone, on open ground, reachable, ids, pay", () => {
  const today = rumourDay(Date.now()), chainIds = new Set(allObjects().map((o) => o.id));
  const walk = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && !isSolidTile(x, y) && !isDecorSolidAt((x + 0.5) * TILE, (y + 0.5) * TILE);
  const seen = new Uint8Array(MAP_W * MAP_H), s0 = randomSpawn(), q = [Math.floor(s0.x / TILE) + Math.floor(s0.y / TILE) * MAP_W];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % MAP_W, y = (c / MAP_W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ny * MAP_W; if (walk(nx, ny) && !seen[k]) { seen[k] = 1; q.push(k); } }
  }
  const kinds = new Set<string>(), problems: string[] = [];
  let spots = 0;
  for (const d of DAYS) for (const L of LEVELS) {
    const day = today + d, rs = rumoursFor(day, L);
    if (rs.length !== RUMOURS.offers) problems.push(`${day}/${L}: ${rs.length} offers`);
    if (new Set(rs.map((r) => r.zone)).size !== rs.length) problems.push(`${day}/${L}: zone repeated`);
    for (const r of rs) {
      kinds.add(r.kind);
      const z = spot(r.zone);
      if (r.reward.gold !== RUMOURS.goldBase + RUMOURS.goldPerLevel * r.level || r.reward.xp !== 0) problems.push(`${day}/${L} ${r.zone}: pay ${JSON.stringify(r.reward)}`);
      const pts: { x: number; y: number; what: string }[] = [];
      for (const s of r.steps) { if (s.at) pts.push({ ...s.at, what: "reach" }); if (s.summon) pts.push({ x: s.summon.x, y: s.summon.y, what: "ambusher" }); }
      for (const o of rumourObjects(r)) {
        pts.push({ x: o.x, y: o.y, what: o.id });
        if (o.id.length > 40) problems.push(`id too long: ${o.id}`);
        if (chainIds.has(o.id)) problems.push(`id clashes with a chain object: ${o.id}`);
        if (!o.id.startsWith(r.id)) problems.push(`id ${o.id} not under ${r.id}`);
      }
      for (const p of pts) {
        spots++;
        const ok = inZone(r.zone, p.x, p.y) && rumourGround(z, p.x, p.y) && !isSolidAt(p.x, p.y) && !isDecorSolidAt(p.x, p.y) && !isSafeZone(p.x, p.y);
        if (!ok) problems.push(`${day}/${L} ${r.zone} ${p.what} (${p.x},${p.y}) not open ground in its zone`);
        else if (!seen[Math.floor(p.x / TILE) + Math.floor(p.y / TILE) * MAP_W]) problems.push(`${day}/${L} ${r.zone} ${p.what} (${p.x},${p.y}) not reachable on foot`);
      }
    }
  }
  assert.deepEqual(problems.slice(0, 10), []);
  assert.ok(spots > 0);
  assert.deepEqual([...kinds].sort(), ["light", "lost", "missing"], "every template shows up in the sample");
});

// ---------- the room ----------

test("missing: Mags only, bad input ignored; reach, own ambusher, use; gold and no XP; title at 7", () => onDay(["missing"], async (day) => {
  const { L, r } = find(day, "missing")!, srv = await startRoom();
  try {
    const { c, p, msgs, room } = await hero(srv, "wizard");
    await until(() => msgs.length > 0, "rumour on join");
    p.level = L;
    p.rumour = { day, lv: L, done: 0, n: RUMOURS.titleAt - 1 };
    at(p, mags.x + 20 * TILE, mags.y);
    const m0 = msgs.length;
    c.send("rumour", { take: r.i });
    await until(() => msgs.length > m0, "reply to a take from afar");
    assert.equal(p.rumour.i, undefined, "not by Mags: no take");
    byMags(p);
    for (const bad of [{ take: RUMOURS.offers }, { take: "1" }, { take: 1.5 }, { take: -1 }, { take: null }, { drop: 1 }, "x", 7]) c.send("rumour", bad as any);
    await scans(room, 3);
    assert.equal(p.rumour.i, undefined, "bad takes ignored");
    await takeUntil(c, p, r.i);
    await until(() => msgs.at(-1)?.active?.stage === 1, "active sent");
    assert.equal(msgs.at(-1).active.goal, 1);
    // reach
    const reach = r.steps[0];
    at(p, reach.at!.x, reach.at!.y);
    await until(() => p.rumour.stage === 2, "reached");
    // the hero's own ambusher rises with the rumour tag and title
    await until(() => !!room.rumours.amb.get(c.sessionId), "ambusher up");
    const mid = room.rumours.amb.get(c.sessionId), m = room.state.mobs.get(mid);
    assert.equal(m.summonFor, c.sessionId);
    assert.equal(m.summonChain, RUMOURS.tag);
    assert.equal(m.title, r.steps[1].summon!.title);
    assert.ok(Math.hypot(m.x - reach.at!.x, m.y - reach.at!.y) <= (RUMOURS.ambushNear[1] + 1) * TILE);
    room.hitTarget(c.sessionId, mid, m.maxHp * 10, [0, 0]);
    await until(() => p.rumour.stage === 3, "ambusher down");
    // use: too far, then close
    const o = r.steps[2].objects![0];
    at(p, o.x + 6 * TILE, o.y);
    c.send("use", { id: o.id });
    await scans(room, 2);
    assert.equal(p.rumour.stage, 3, "too far: nothing");
    at(p, o.x + 4, o.y);
    const gold = p.gold, xp = p.xp;
    await useUntil(c, o.id, () => msgs.at(-1)?.end?.why === "done", "done");
    assert.equal(p.gold, gold + r.reward.gold, "gold paid exactly");
    assert.equal(r.reward.gold, RUMOURS.goldBase + RUMOURS.goldPerLevel * r.level);
    assert.equal(p.xp, xp, "no XP");
    assert.equal(p.rumour.i, undefined);
    assert.equal(p.rumour.done, 1 << r.i);
    assert.equal(p.rumour.n, RUMOURS.titleAt);
    assert.equal(unpackCosmetics(metaOf(p, META.cosm)).title, RUMOUR_TITLE, "the title at the 7th");
    assert.ok(msgs.at(-1).end.title);
    assert.equal(msgs.at(-1).offers[r.i].done, true);
  } finally { await srv.stop(); }
}));

test("no title before the 7th rumour", () => onDay(["lost"], async (day) => {
  const { L, r } = find(day, "lost")!, srv = await startRoom();
  try {
    const { c, p, msgs } = await hero(srv, "wizard");
    p.level = L; p.rumour = { day, lv: L, done: 0, n: RUMOURS.titleAt - 2 };
    byMags(p);
    await takeUntil(c, p, r.i);
    for (let k = 0; k < r.steps.length; k++) {
      const o = r.steps[k].objects![0];
      at(p, o.x, o.y);
      await useUntil(c, o.id, () => (p.rumour.stage ?? 99) > k + 1 || p.rumour.i === undefined, `step ${k + 1} done`);
    }
    await until(() => msgs.at(-1)?.end?.why === "done", "done");
    assert.equal(p.rumour.n, RUMOURS.titleAt - 1);
    assert.equal(msgs.at(-1).end.title, undefined);
    assert.notEqual(unpackCosmetics(metaOf(p, META.cosm)).title, RUMOUR_TITLE);
  } finally { await srv.stop(); }
}));

test("light: stays on its stage by day, advances at night; lost: only its objects, in order", () => onDay(["light", "lost"], async (day) => {
  const srv = await startRoom();
  try {
    const { c, p, msgs, room } = await hero(srv, "vampire");
    {
      const { L, r } = find(day, "light")!;
      p.level = L; p.rumour = { day, lv: L, done: 0, n: 0 };
      byMags(p);
      await takeUntil(c, p, r.i);
      assert.equal(r.steps[0].night, true);
      room.rumours.h.dayFrac = () => 0.3; // day
      at(p, r.steps[0].at!.x, r.steps[0].at!.y);
      await scans(room, 4);
      assert.equal(p.rumour.stage, 1, "by day the light is not there");
      assert.equal(msgs.at(-1).active.night, true);
      room.rumours.h.dayFrac = () => 0.8; // night
      await until(() => p.rumour.stage === 2, "after dark");
      const o = r.steps[1].objects![0];
      at(p, o.x, o.y);
      await useUntil(c, o.id, () => msgs.at(-1)?.end?.why === "done", "light done");
    }
    {
      const { L, r } = find(day, "lost")!;
      p.level = L; p.rumour = { day, lv: L, done: 0, n: 1 };
      byMags(p);
      await takeUntil(c, p, r.i);
      const [a, b] = [r.steps[0].objects![0], r.steps[1].objects![0]];
      at(p, b.x, b.y); c.send("use", { id: b.id });
      await scans(room, 2);
      assert.equal(p.rumour.stage, 1, "the second object does nothing on step 1");
      at(p, a.x, a.y);
      await useUntil(c, a.id, () => p.rumour.stage === 2, "first found");
      c.send("use", { id: a.id });
      await scans(room, 2);
      assert.equal(p.rumour.stage, 2, "the same object twice does nothing");
      at(p, b.x, b.y);
      await useUntil(c, b.id, () => msgs.at(-1)?.end?.why === "done", "lost done");
      assert.equal(p.rumour.n, 2);
    }
  } finally { await srv.stop(); }
}));

test("limits: a finished offer once a day (another is fine), one at a time, a dropped one can be taken again", () => onDay([], async (day) => {
  const L = 5, srv = await startRoom();
  try {
    const { c, p, msgs, room } = await hero(srv, "wizard");
    p.level = L;
    p.rumour = { day, lv: L, done: 1 << 0, n: 1 }; // offer 0 already done today
    byMags(p);
    c.send("rumour", { take: 0 });
    await scans(room, 3);
    assert.equal(p.rumour.i, undefined, "a finished offer can't be taken again today");
    await takeUntil(c, p, 1);
    c.send("rumour", { take: 2 });
    await scans(room, 3);
    assert.equal(p.rumour.i, 1, "only one at a time");
    assert.equal(p.rumour.stage, 1);
    await until(() => { if (p.rumour.i !== undefined) c.send("rumour", { drop: true }); return msgs.at(-1)?.end?.why === "drop"; }, "dropped");
    assert.equal(p.rumour.i, undefined);
    assert.equal(p.rumour.done, 1, "dropping isn't finishing");
    await takeUntil(c, p, 1); // a dropped one can be taken again
  } finally { await srv.stop(); }
}));

test("a rumour can't be taken before the first quest is done", () => onDay([], async (day) => {
  const srv = await startRoom();
  try {
    const { c, p, room } = await hero(srv, "wizard");
    p.tut = 0; p.rumour = { day, lv: 1, done: 0, n: 0 };
    byMags(p);
    c.send("rumour", { take: 0 });
    await scans(room, 3);
    assert.equal(p.rumour.i, undefined, "tutorial first");
  } finally { await srv.stop(); }
}));

// ---------- saves and the day's end ----------

test("saves: same day keeps the rumour; a stale day or an old/garbage save loads fresh (total kept)", () => onDay([], async (day) => {
  assert.deepEqual(cleanRumour(undefined, day, 7), { day, lv: 7, done: 0, n: 0 });
  for (const junk of ["junk", 5, null, [], { day: "x", n: "y" }, { day: NaN, n: Infinity }]) assert.deepEqual(cleanRumour(junk, day, 7), { day, lv: 7, done: 0, n: 0 });
  assert.deepEqual(cleanRumour({ day: day - 1, lv: 3, done: 7, n: 4, i: 1, stage: 2 }, day, 9), { day, lv: 9, done: 0, n: 4 });
  assert.deepEqual(cleanRumour({ day, lv: 3, done: 1, n: 4, i: 0, stage: 2 }, day, 9), { day, lv: 3, done: 1, n: 4 }, "a done offer can't be under way");
  assert.equal(cleanRumour({ day, lv: 3, done: 0, n: 0, i: 2, stage: 99 }, day, 9).stage, rumoursFor(day, 3)[2].steps.length, "stage clamped");
  assert.equal(cleanRumour({ day, lv: 3, done: 0, n: 0, i: 7, stage: 1 }, day, 9).i, undefined, "offer out of range");
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" }), d = await srv.join({ cls: "wizard" });
    const room = srv.room;
    await until(() => !!room.state.players.get(c.sessionId) && !!room.state.players.get(d.sessionId), "joined");
    const p = room.state.players.get(c.sessionId), q = room.state.players.get(d.sessionId);
    const disk = (x: any) => JSON.parse(JSON.stringify(x)); // a save goes through JSON on disk
    p.rumour = { day, lv: 5, done: 2, n: 3, i: 0, stage: 2, count: 0 };
    room.restore(q, disk(room.snapshot(p)));
    assert.deepEqual({ ...q.rumour }, { day, lv: 5, done: 2, n: 3, i: 0, stage: 2, count: 0 }, "same day: kept");
    p.rumour = { day: day - 1, lv: 5, done: 2, n: 3, i: 0, stage: 2, count: 0 };
    room.restore(q, disk(room.snapshot(p)));
    assert.deepEqual({ ...q.rumour }, { day, lv: q.level, done: 0, n: 3 }, "stale: fresh, total kept");
    const old = disk(room.snapshot(p)); delete old.rumour; // a save from before rumours
    room.restore(q, old);
    assert.deepEqual({ ...q.rumour }, { day, lv: q.level, done: 0, n: 0 }, "pre-rumour save: fresh");
    const bad = disk(room.snapshot(p)); bad.rumour = "garbage";
    room.restore(q, bad);
    assert.deepEqual({ ...q.rumour }, { day, lv: q.level, done: 0, n: 0 }, "garbage save: fresh");
  } finally { await srv.stop(); }
}));

test("rollover mid-session: yesterday's active rumour is cleared and the client told (stale)", () => onDay([], async (day) => {
  const srv = await startRoom();
  try {
    const { p, msgs, room } = await hero(srv, "wizard");
    p.rumour = { day: day - 1, lv: 4, done: 1, n: 2, i: 1, stage: 1, count: 0 };
    await until(() => msgs.some((m) => m.end?.why === "stale"), "stale note");
    assert.equal(p.rumour.day, day);
    assert.equal(p.rumour.i, undefined);
    assert.equal(p.rumour.done, 0);
    assert.equal(p.rumour.n, 2, "total kept");
    // walking up to Mags brings the offers without asking; standing there doesn't repeat them
    at(p, mags.x + 20 * TILE, mags.y);
    await scans(room, 2);
    const k = msgs.length;
    byMags(p);
    await until(() => msgs.length === k + 1, "offers on walking up");
    assert.equal(msgs.at(-1).offers.length, RUMOURS.offers);
    assert.equal(msgs.at(-1).day, day);
    await scans(room, 4);
    assert.equal(msgs.length, k + 1, "once per walk-up");
  } finally { await srv.stop(); }
}));

// ---------- the ambusher guard ----------

test("a rumour ambusher of a chain's own-boss kind does not fill that chain's own-boss step", () => onDay([], async () => {
  // any chain step that is an own-boss kill, with a plain monster kind
  let found: { c: number; qi: number; stage: number; kind: string } | undefined;
  CHAINS.forEach((ch, c) => ch.quests.forEach((qd, qi) => qd.steps.forEach((s, si) => {
    if (!found && s.type === "kill" && s.own && s.kinds?.length && (s.goal ?? 1) === 1 && !s.fused && !s.gift) found = { c, qi, stage: si + 1, kind: s.kinds[0] };
  })));
  assert.ok(found, "the game has an own-boss kill step");
  const { c: ch, qi, stage, kind } = found!, srv = await startRoom();
  try {
    const { c, p, room } = await hero(srv, "wizard");
    p.hp = p.maxHp = 1_000_000;
    const step = () => { const s = chainState(p, ch)!; return [s.questId, s.questStage, s.questCount]; };
    const sm = { parts: [kind], level: 10, x: mags.x + 12 * TILE, y: mags.y + 12 * TILE, hpMult: 1 } as any;
    at(p, sm.x, sm.y + 24);
    const kill = (tag: number) => {
      room.qset(p, ch, { questId: qi, questStage: stage, questCount: 0 });
      const before = step(), id = room.summonFused(c.sessionId, sm, tag), m = room.state.mobs.get(id);
      assert.equal(m.summonChain, tag);
      room.hitTarget(c.sessionId, id, m.maxHp * 10, [0, 0]);
      return { before, id };
    };
    // a rumour's ambusher (tag RUMOURS.tag) of the boss's kind: the step stays
    let r = kill(RUMOURS.tag);
    await until(() => room.state.mobs.get(r.id)?.dead ?? true, "ambusher dead");
    await scans(room, 3);
    assert.deepEqual(step(), r.before, "a rumour ambusher fills nothing");
    // control: the chain's own summon does move the step on (so the guard, not the setup, kept it still)
    r = kill(ch);
    await until(() => JSON.stringify(step()) !== JSON.stringify(r.before), "own summon counts");
  } finally { await srv.stop(); }
}));
