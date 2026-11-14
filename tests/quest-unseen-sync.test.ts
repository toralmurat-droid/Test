// Quest concepts #4 (Unseen: go unseen past checkpoints) and #8 (Two Hands: sync two seals): the server rules of both steps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAINS, chainState, packQuest, questStep, questTargets, USE_RANGE } from "../shared/quests";
import { coverAt, stealthMult, syncOk, UNSEEN, SYNC } from "../shared/questSteps";
import { MOBS, TILE } from "../shared/constants";
import { ACTIVE_CLASSES, CLASSES } from "../shared/classes";
import { moveStep } from "../shared/movement";
import { isSolidAt } from "../shared/map";
import { actAt } from "../shared/act2";
import { startRoom, wait } from "./helpers/room";

const ci = (id: string) => CHAINS.findIndex((c) => c.id === id);
const U = ci("unseen"), H = ci("twohands");
const unseen = CHAINS[U].quests[0].steps[1].unseen!, sync = CHAINS[H].quests[0].steps[1].sync!;
const cps = unseen.checkpoints, seals = sync.seals;
const tutDone = (p: any) => { p.tut = packQuest(CHAINS.find((x) => x.id === "tutorial")!.quests.length, 0, 0); };

/** Poll until `f` is true (generous timeout: the room ticks on real time). */
async function until(f: () => boolean, what: string, ms = 6000) {
  const t0 = Date.now();
  while (!f()) { if (Date.now() - t0 > ms) assert.fail(`timed out waiting for: ${what}`); await wait(40); }
}
async function hero(srv: any, cls = "wizard") {
  const c = await srv.join({ cls });
  const msgs: any[] = [];
  for (const k of ["qstate", "sfx", "travel"]) c.onMessage(k, (m: any) => msgs.push({ ...m, T: k }));
  await wait(200);
  const p = srv.room.state.players.get(c.sessionId);
  tutDone(p); p.level = 45; p.invulnUntil = 0;
  return { c, p, id: c.sessionId as string, msgs };
}
/** Remove the wild monsters round (x, y) so nothing targets a hero by accident. */
const clearMobs = (room: any, x: number, y: number, r = 40 * TILE) => {
  for (const [id, m] of [...room.state.mobs.entries()]) if (Math.abs(m.x - x) < r && Math.abs(m.y - y) < r && !m.owner) room.state.mobs.delete(id);
};
const stage = (p: any, ch: number) => chainState(p, ch)!;
const sfxCount = (h: any, ev: string) => h.msgs.filter((m: any) => m.T === "sfx" && m.ev === ev).length;
const lastQ = (h: any, k: string) => h.msgs.filter((m: any) => m.T === "qstate" && m.k === k).pop();

/** On the climb (stage 2 of the Unseen quest) with the Thornspire arc far enough to open it. */
function onClimb(p: any, count = 0) { p.arcs.set("spire", packQuest(1, 0, 0)); p.arcs.set("unseen", packQuest(0, 2, count)); }
/** On the seal step of Two Hands, with the Under arc far enough to open it. */
function onSeals(p: any) { p.arcs.set("under", packQuest(4, 0, 0)); p.arcs.set("twohands", packQuest(0, 2, 0)); }
const at = (p: any, a: { x: number; y: number }) => { p.x = a.x; p.y = a.y; };

test("spec: stealth multiplier, sync window, and the walk between the seals fits the solo time", () => {
  assert.equal(CHAINS[U].quests[0].steps[1].type, "unseen");
  assert.equal(CHAINS[H].quests[0].steps[1].type, "sync");
  assert.equal(stealthMult(unseen, false, false), 1);
  assert.equal(stealthMult(unseen, true, false), Math.max(unseen.floor, unseen.night));
  assert.equal(stealthMult(unseen, false, true), Math.max(unseen.floor, unseen.cover));
  assert.ok(stealthMult(unseen, true, false) < 1 && stealthMult(unseen, false, true) < 1, "night and cover both help");
  assert.ok(stealthMult(unseen, true, true) >= unseen.floor, "never below the floor");
  assert.equal(stealthMult({ ...unseen, night: 0.1, cover: 0.1 }, true, true), unseen.floor);
  assert.ok(UNSEEN.rearmMs > 0 && cps.length >= 2);
  for (const c of cps) assert.ok(!isSolidAt(c.x, c.y), `checkpoint ${c.label} is walkable`);
  assert.equal(syncOk(1000, 1000 + sync.windowMs, sync.windowMs), true);
  assert.equal(syncOk(1000, 1000 + sync.windowMs + 1, sync.windowMs), false);
  assert.equal(syncOk(0, 10, sync.windowMs), false, "a seal never turned does not count");
  assert.ok(sync.soloMs > sync.windowMs, "alone gets more time than a group");

  // the slowest active class walking from one seal to the other, straight, at base speed
  const slow = Math.min(...ACTIVE_CLASSES.map((c) => CLASSES[c].speed));
  const [a, b] = seals; let x = a.x, y = a.y, t = 0;
  const dt = 1 / 20;
  while (Math.hypot(b.x - x, b.y - y) > USE_RANGE && t < 30) {
    const d = Math.hypot(b.x - x, b.y - y), vx = (b.x - x) / d, vy = (b.y - y) / d;
    ({ x, y } = moveStep(x, y, { up: vy < -0.3, down: vy > 0.3, left: vx < -0.3, right: vx > 0.3, vx, vy } as any, dt, slow));
    t += dt;
  }
  assert.ok(Math.hypot(b.x - x, b.y - y) <= USE_RANGE, "the straight walk reaches the other seal");
  assert.ok(t * 1000 < sync.soloMs, `walk ${t.toFixed(1)} s < solo window ${sync.soloMs / 1000} s`);
  assert.ok((Math.hypot(b.x - a.x, b.y - a.y) / slow) * 1000 < sync.soloMs, "even seal centre to centre");
});

test("unseen: hiding, aggro multiplier, detection range, seen by target, seen by damage, no instant re-hide, lantern holder", async () => {
  process.env.DAY_TIME = "day";
  const srv = await startRoom();
  try {
    const A = await hero(srv), room = srv.room, id = A.id, p = A.p;
    onClimb(p);
    for (const c of cps) clearMobs(room, c.x, c.y);
    assert.deepEqual(questTargets(chainState(p, U)).map((t) => t.label), [cps[0].label], "the first checkpoint is the target");
    at(p, cps[0]);
    const sn = () => room.qsteps.sneaks.get(id);
    await until(() => sn()?.armed === true, "armed at the first checkpoint");
    assert.equal(stage(p, U).questCount, 1);
    assert.equal(p.aggroMul, stealthMult(unseen, false, coverAt(p.x, p.y)));
    await until(() => A.msgs.some((m) => m.T === "qstate" && m.chain === U && m.armed === true && m.cp === 1 && m.cps === cps.length), "armed qstate");

    // night: lower than by day; cover: lower than in the open
    const day = p.aggroMul;
    process.env.DAY_TIME = "night";
    await until(() => p.aggroMul === stealthMult(unseen, true, coverAt(p.x, p.y)), "night multiplier");
    assert.ok(p.aggroMul < stealthMult(unseen, false, false), "night is lower than open day");
    assert.ok(p.aggroMul <= day);
    process.env.DAY_TIME = "day";
    let spot: { x: number; y: number } | undefined;
    for (let r = 1; r < 14 && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) for (let dy = -r; dy <= r && !spot; dy++) {
      const x = p.x + dx * TILE, y = p.y + dy * TILE; if (!isSolidAt(x, y) && coverAt(x, y)) spot = { x, y };
    }
    assert.ok(spot, "a cover spot near the first checkpoint");
    const keep = { x: p.x, y: p.y }; at(p, spot!);
    await until(() => p.aggroMul === stealthMult(unseen, false, true), "cover multiplier");
    assert.ok(p.aggroMul < 1, "cover is lower than the open");
    at(p, keep); await until(() => p.aggroMul === stealthMult(unseen, false, coverAt(p.x, p.y)), "back in the open");

    // detection range: an exposed hero is seen at 0.8 x aggro range, a hidden one (x0.6) is not
    const def = MOBS.sphinx, fx = p.x + def.aggroRange * 0.8;
    const fake: any = { kind: "sphinx", x: fx, y: p.y, homeX: fx, homeY: p.y, level: 45, merged: 1, hateId: "", hate: 0, target: "", alertUntil: 0, perch: false };
    const saved = p.aggroMul;
    p.aggroMul = 1; room.pickTarget(fake, def); assert.equal(fake.target, id, "exposed hero seen at 0.8 of the range");
    fake.target = ""; fake.hateId = ""; fake.hate = 0;
    p.aggroMul = 0.6; room.pickTarget(fake, def); assert.equal(fake.target, "", "not seen at multiplier 0.6");
    p.aggroMul = saved;

    // reach the second checkpoint, then get targeted on the way to the third
    at(p, cps[1]);
    await until(() => stage(p, U).questCount === 2, "second checkpoint counted");
    const mobId = [...room.state.mobs.entries()].find(([, m]: any) => !m.dead && !m.owner)![0] as string, mob = room.state.mobs.get(mobId);
    p.x = cps[1].x + 6 * TILE; p.y = cps[1].y - 8 * TILE;
    mob.x = p.x + 3 * TILE; mob.y = p.y; mob.target = id; mob.hateId = id; mob.hate = 1;
    A.msgs.length = 0;
    await until(() => sn()?.armed === false, "caught when targeted");
    assert.equal(mob.target, "", "the monster forgets them"); assert.equal(mob.hateId, "");
    assert.equal(p.aggroMul, 1, "no longer hidden");
    await until(() => Math.hypot(p.x - cps[1].x, p.y - cps[1].y) < 2, "warped to the last checkpoint reached");
    await until(() => A.msgs.some((m) => m.T === "sfx" && m.ev === "seen" && m.id === id), "seen sfx");
    await until(() => A.msgs.some((m) => m.T === "travel" && m.id === id && m.why), "travel with a reason");
    await until(() => A.msgs.some((m) => m.T === "qstate" && m.chain === U && m.end === "seen"), "qstate end seen");
    assert.equal(stage(p, U).questCount, 2, "the count is kept");
    room.state.mobs.delete(mobId);

    // a breath before hiding again: not within rearmMs, yes after it
    await wait(Math.min(800, UNSEEN.rearmMs / 2));
    assert.equal(sn()?.armed, false, "no instant re-hide");
    await until(() => sn()?.armed === true, "hidden again after rearmMs", UNSEEN.rearmMs + 5000);

    // hurt while hidden does the same
    A.msgs.length = 0;
    p.x += 3 * TILE; p.invulnUntil = 0;
    room.damagePlayer(id, 3, "Test", [0, 0], 0, {});
    await until(() => sn()?.armed === false, "caught when hurt");
    await until(() => Math.hypot(p.x - cps[1].x, p.y - cps[1].y) < 2, "hurt: warped to the checkpoint");
    await until(() => sfxCount(A, "seen") >= 1 && A.msgs.some((m) => m.T === "travel" && m.why) && A.msgs.some((m) => m.T === "qstate" && m.end === "seen"), "hurt: seen sfx, travel and qstate");
    assert.equal(p.aggroMul, 1);

    // a lantern holder is never warped
    p.qlock = true; assert.equal(room.warp(id, cps[0].x, cps[0].y), false); p.qlock = false;
    await A.c.leave();
  } finally { delete process.env.DAY_TIME; await srv.stop(); }
});

test("unseen: saves keep the count, a restored hero finishes the climb and the postern pays; death and leave end the hiding", async () => {
  process.env.DAY_TIME = "day";
  const srv = await startRoom();
  try {
    const A = await hero(srv), B = await hero(srv), room = srv.room;
    onClimb(A.p, 2);
    for (const c of cps) clearMobs(room, c.x, c.y);
    at(A.p, cps[1]);
    await until(() => room.qsteps.sneaks.get(A.id)?.armed === true, "hidden at the second checkpoint");
    const snap = JSON.parse(JSON.stringify(room.snapshot(A.p)));
    assert.equal(snap.unseenCount, 2, "snapshot has the checkpoint count");
    assert.equal(snap.unseenStage, 2);

    // death stops the hiding (the count stays)
    A.p.invulnUntil = 0;
    room.damagePlayer(A.id, 999999, "Test", [0, 0], 0, {});
    await until(() => A.p.dead === true, "dead");
    assert.equal(room.qsteps.sneaks.get(A.id)?.armed, false);
    assert.equal(A.p.aggroMul, 1);
    await until(() => A.msgs.some((m) => m.T === "qstate" && m.end === "dead"), "qstate end dead");
    assert.equal(stage(A.p, U).questCount, 2);

    // leaving clears the unseen state
    await A.c.leave();
    await until(() => !room.qsteps.sneaks.has(A.id), "leave forgets the sneak");

    // a loaded hero: the count is restored, they hide at the last checkpoint reached, finish the climb, and the postern pays
    room.restore(B.p, snap); B.p.dead = false; B.p.hp = B.p.maxHp; B.p.invulnUntil = Date.now() + 600_000;
    assert.equal(stage(B.p, U).questCount, 2, "count restored");
    assert.equal(stage(B.p, U).questStage, 2);
    at(B.p, cps[1]);
    await until(() => room.qsteps.sneaks.get(B.id)?.armed === true, "hidden again at the last checkpoint");
    assert.equal(stage(B.p, U).questCount, 2, "arming does not reset the count");
    for (let i = 2; i < cps.length; i++) { at(B.p, cps[i]); await until(() => stage(B.p, U).questCount === i + 1 || stage(B.p, U).questStage === 3, `checkpoint ${i + 1} reached`); }
    await until(() => stage(B.p, U).questStage === 3, "on to the postern");
    assert.equal(B.p.aggroMul, 1, "the step ending drops the hiding");
    const post = questStep(chainState(B.p, U))!.objects![0];
    at(B.p, post);
    const gold = B.p.gold, quest = stage(B.p, U).questId;
    await wait(100);
    B.c.send("use", { id: post.id });
    await until(() => stage(B.p, U).questId === quest + 1, "the postern step finishes the quest");
    assert.ok(B.p.gold > gold, "and pays its reward");
    await B.c.leave();
  } finally { delete process.env.DAY_TIME; await srv.stop(); }
});

test("unseen: a hidden hero who leaves the climb (far from every checkpoint, or another act) is no longer hidden and never warped back", async () => {
  process.env.DAY_TIME = "day";
  const srv = await startRoom();
  try {
    const A = await hero(srv), room = srv.room, id = A.id, p = A.p;
    const town = { x: p.x, y: p.y };
    assert.equal(actAt(town.y, town.x), 1, "a new hero starts in Act 1");
    p.invulnUntil = Date.now() + 600_000; p.hp = p.maxHp = 1e6;
    onClimb(p, 2);
    for (const c of cps) clearMobs(room, c.x, c.y);
    const sn = () => room.qsteps.sneaks.get(id);
    const far = (x: number, y: number) => cps.every((c) => Math.hypot(x - c.x, y - c.y) > (UNSEEN.leaveTiles + 5) * TILE);
    let spot: { x: number; y: number } | undefined;
    for (let r = UNSEEN.leaveTiles + 6; r < UNSEEN.leaveTiles + 30 && !spot; r++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const x = cps[1].x + dx * r * TILE, y = cps[1].y + dy * r * TILE;
      if (!spot && !isSolidAt(x, y) && far(x, y) && actAt(y, x) === actAt(cps[1].y, cps[1].x)) spot = { x, y };
    }
    assert.ok(spot, "a walkable spot in the same act, far from every checkpoint");
    /** Hidden at the second checkpoint, then put at `to` and targeted there: off, not warped, not seen. */
    const leaveAndGetSeen = async (to: { x: number; y: number }, what: string) => {
      at(p, cps[1]);
      await until(() => sn()?.armed === true, `${what}: hidden at the second checkpoint`, UNSEEN.rearmMs + 5000);
      A.msgs.length = 0;
      at(p, to);
      await until(() => sn()?.armed === false, `${what}: no longer hidden`);
      assert.equal(p.aggroMul, 1, `${what}: aggro back to normal`);
      await until(() => A.msgs.some((m) => m.T === "qstate" && m.chain === U && m.end === "off"), `${what}: qstate end off`);
      assert.ok(sn(), `${what}: still on the step (can hide again at the checkpoint)`);
      const mid = `tgt${Math.random()}`;
      room.spawnMob("slime", -1, mid, { x: p.x + 3 * TILE, y: p.y, level: 45 });
      const mob = room.state.mobs.get(mid);
      mob.target = id; mob.hateId = id; mob.hate = 1;
      await wait(1000);
      assert.ok(Math.hypot(p.x - to.x, p.y - to.y) < 2, `${what}: not warped back to the checkpoint`);
      assert.equal(A.msgs.filter((m) => m.T === "travel").length, 0, `${what}: no travel`);
      assert.equal(sfxCount(A, "seen"), 0, `${what}: not "seen"`);
      assert.equal(stage(p, U).questCount, 2, `${what}: the count is kept`);
      room.state.mobs.delete(mid);
    };
    await leaveAndGetSeen(spot!, "far away");
    await leaveAndGetSeen(town, "another act");
    await A.c.leave();
  } finally { delete process.env.DAY_TIME; await srv.stop(); }
});

test("sync: party window, solo window, partner credit, window in qstate", async () => {
  const srv = await startRoom();
  try {
    const A = await hero(srv), B = await hero(srv), room = srv.room;
    for (const h of [A, B]) onSeals(h.p);
    clearMobs(room, seals[0].x, seals[0].y);
    at(B.p, { x: seals[0].x + 60 * TILE, y: seals[0].y }); // B is out of the way for the solo part
    const turns = () => room.qsteps.turns;
    const press = async (h: any, i: number) => { h.c.send("use", { id: seals[i].id }); await wait(250); };

    // solo: the window in qstate, a turn too old does not count, one inside soloMs does
    at(A.p, seals[0]); await wait(100);
    await press(A, 0);
    await until(() => sfxCount(A, "sealturn") >= 1, "sealturn sfx");
    assert.ok(A.msgs.some((m) => m.T === "sfx" && m.ev === "sealturn" && m.seal === 0));
    await until(() => lastQ(A, "sync")?.turned[0] >= 0, "turned shown");
    assert.equal(lastQ(A, "sync").turned[1], -1);
    assert.equal(lastQ(A, "sync").window, sync.soloMs, "solo window in qstate");
    turns().get(A.id).t[0] = Date.now() - (sync.soloMs + 500);
    at(A.p, seals[1]); await wait(100); await press(A, 1);
    assert.equal(stage(A.p, H).questStage, 2, "too slow alone: no");
    turns().get(A.id).t[1] = Date.now() - (sync.soloMs - 1000);
    at(A.p, seals[0]); await wait(100); await press(A, 0);
    await until(() => stage(A.p, H).questId === 1, "in time alone: done");
    assert.equal(sfxCount(A, "sealsync"), 1);

    // a group: a partner at the other seal
    onSeals(A.p); onSeals(B.p);
    A.p.party = B.p.party = "pty";
    at(A.p, seals[0]); at(B.p, seals[1]); await wait(150);
    await press(A, 0);
    await until(() => lastQ(B, "sync")?.turned?.[0] >= 0, "the partner sees the turn");
    assert.equal(lastQ(A, "sync").window, sync.windowMs, "party window in qstate");
    assert.equal(lastQ(B, "sync").window, sync.windowMs);
    turns().get(A.id).t[0] = Date.now() - (sync.windowMs + 500);
    await press(B, 1);
    assert.equal(stage(A.p, H).questStage, 2, "party: too far apart"); assert.equal(stage(B.p, H).questStage, 2);
    await wait(SYNC.turnMs + 100);
    turns().get(B.id).t[1] = Date.now() - (sync.windowMs - 500);
    await press(A, 0);
    await until(() => stage(A.p, H).questId === 1 && stage(B.p, H).questId === 1, "party: close enough, both credited");
    await A.c.leave(); await B.c.leave();
  } finally { await srv.stop(); }
});

test("sync: a summoner's golem by the other seal turns it", async () => {
  const srv = await startRoom();
  try {
    const S = await hero(srv, "summoner"), room = srv.room;
    onSeals(S.p); clearMobs(room, seals[0].x, seals[0].y);
    at(S.p, seals[0]); await wait(150);
    const gid = room.summon(S.id, "golem_fire", 45);
    assert.ok(gid, "summoned a golem");
    const g = room.state.mobs.get(gid);
    g.x = seals[1].x + 10; g.y = seals[1].y;
    S.c.send("use", { id: seals[0].id });
    await until(() => stage(S.p, H).questId === 1, "the golem at seal B turned it");
    assert.equal(sfxCount(S, "sealturn"), 2, "both seals turn");
    assert.equal(sfxCount(S, "sealsync"), 1);
    await S.c.leave();
  } finally { await srv.stop(); }
});

test("sync: death and leave clear the turns, a repeated press inside turnMs sends nothing extra", async () => {
  const srv = await startRoom();
  try {
    const A = await hero(srv), B = await hero(srv), room = srv.room;
    onSeals(A.p); onSeals(B.p); clearMobs(room, seals[0].x, seals[0].y);
    at(B.p, { x: seals[0].x + 60 * TILE, y: seals[0].y });
    const turns = () => room.qsteps.turns;
    at(A.p, seals[0]); await wait(150);

    A.c.send("use", { id: seals[0].id });
    await until(() => sfxCount(A, "sealturn") === 1, "first turn");
    for (let i = 0; i < 5; i++) A.c.send("use", { id: seals[0].id });
    await wait(Math.min(250, SYNC.turnMs - 150));
    assert.equal(sfxCount(A, "sealturn"), 1, "presses inside turnMs are ignored");
    await wait(SYNC.turnMs);
    A.c.send("use", { id: seals[0].id });
    await until(() => sfxCount(A, "sealturn") === 2, "after turnMs it turns again");

    assert.ok(turns().has(A.id));
    room.qsteps.died(A.id);
    assert.ok(!turns().has(A.id), "death clears the turns");

    await wait(SYNC.turnMs + 100);
    A.c.send("use", { id: seals[0].id });
    await until(() => turns().has(A.id), "turned again after the death");
    await A.c.leave();
    await until(() => !turns().has(A.id), "leave clears the turns");
    await B.c.leave();
  } finally { await srv.stop(); }
});
