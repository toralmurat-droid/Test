// Quest concepts #1 (The Last Lantern: carry) and #2 (Hold the Wheel: hold): the server rules of both steps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAINS, chainState, packQuest } from "../shared/quests";
import { HOLD, lightDrain, wetAt, isDark } from "../shared/questSteps";
import { ACTIVE_CLASSES, CLASSES } from "../shared/classes";
import { MOBS, TILE } from "../shared/constants";
import { npcById } from "../shared/npcs";
import { activeSkills } from "../shared/skills";
import { PORTALS } from "../shared/portals";
import { WAYGATES } from "../shared/act2";
import { LINKS } from "../shared/dungeon";
import { GROUND, T } from "../shared/map";
import { startRoom, wait } from "./helpers/room";

const ci = (id: string) => CHAINS.findIndex((c) => c.id === id);
const LAN = ci("lantern"), WHEEL = ci("wheel"), MILL = ci("mill");
const carryStep = CHAINS[LAN].quests[0].steps[1], carry = carryStep.carry!;
const holdStep = CHAINS[WHEEL].quests[0].steps[1], hold = holdStep.hold!;
const tutDone = (p: any) => { p.quests.set("tut", packQuest(CHAINS.find((x) => x.id === "tutorial")!.quests.length, 0, 0)); };
const near = (a: { x: number; y: number }, b: { x: number; y: number }, d: number) => Math.hypot(a.x - b.x, a.y - b.y) <= d;

/** Put a hero on the lantern's carry step, standing by the lantern, with nothing in the way. */
function onCarry(p: any) {
  tutDone(p); p.level = 10;
  p.quests.set("lantern", packQuest(0, 2, 0)); // stage 2 = the carry step
  p.x = carry.take.x + 4; p.y = carry.take.y; p.invulnUntil = Date.now() + 600_000; p.lastHurt = 0;
}
/** Put a hero on the hold step (stage 2 of Hold the Wheel), inside the area, safe from the waves. */
function onHold(p: any, dx = 10, dy = 10) {
  const odo = npcById(hold.npc)!;
  tutDone(p); p.level = 4;
  p.quests.set("mill", packQuest(CHAINS[MILL].quests.length, 0, 0));
  p.quests.set("wheel", packQuest(0, 2, 0));
  p.x = odo.x + dx; p.y = odo.y + dy; p.invulnUntil = Date.now() + 600_000;
}
const gone = (room: any, ids: string[]) => ids.every((id) => { const m = room.state.mobs.get(id); return !m || m.dead; });

test("carry spec: the walk from the lantern to the shrine fits well inside its light", () => {
  assert.equal(carryStep.type, "carry");
  const slowest = Math.min(...ACTIVE_CLASSES.map((c) => CLASSES[c].speed));
  const straight = Math.max(0, Math.hypot(carry.to.x - carry.take.x, carry.to.y - carry.take.y) - carry.to.r);
  const secs = straight / slowest;
  const used = lightDrain(carry, { water: false, dark: false, ground: false }, secs);
  assert.ok(used <= carry.light * 0.6, `a straight daytime walk uses ${used.toFixed(1)} of ${carry.light} light`);
  const base = lightDrain(carry, { water: false, dark: false, ground: false }, 10);
  assert.equal(lightDrain(carry, { water: false, dark: false, ground: true }, 10), base * carry.groundMult);
  assert.equal(lightDrain(carry, { water: true, dark: false, ground: false }, 10), base * carry.waterMult);
  assert.equal(lightDrain(carry, { water: false, dark: true, ground: false }, 10), base * carry.darkMult);
  assert.equal(lightDrain(carry, { water: false, dark: false, ground: false }, -5), 0, "no negative time");
  assert.ok(carry.groundMult > 1 && carry.darkMult > 1 && carry.waterMult > 1 && carry.lure > 1, "every multiplier makes things harder");
});

test("carry: take-up locks skills, attacks still work, the lantern blocks portals, waygates and ropes", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "wizard" });
    const qa: any[] = [], notes: string[] = [];
    a.onMessage("qstate", (m: any) => qa.push(m));
    a.onMessage("chat", (m: any) => { if (!m.id) notes.push(m.text); });
    await wait(300);
    const room = srv.room, A = room.state.players.get(a.sessionId);
    onCarry(A);
    await wait(100);
    a.send("use", { id: "lantern_last" });
    await wait(300);
    assert.equal(A.qlock, true);
    assert.equal(A.lureMul, carry.lure);
    assert.equal(chainState(A, LAN)!.questCount, 1);
    assert.ok(qa.some((m) => m.k === "carry" && m.chain === LAN && m.holder === a.sessionId && m.max === carry.light), "qstate to the holder");

    // skills locked, basic attack not
    const sk = activeSkills("wizard")[0].id; A.talents.set(sk, 1); A.mana = A.maxMana;
    let casts = 0; const roc = room.runesOnCast.bind(room); room.runesOnCast = (...x: any[]) => { casts++; return roc(...x); };
    room.cast(a.sessionId, sk); room.useSlot(a.sessionId, 0);
    assert.equal(casts, 0, "no cast while carrying");
    const la = A.lastAttack; A.attackReadyAt = 0; room.playerAttack(a.sessionId);
    assert.ok(A.lastAttack > la, "basic attack works");
    A.qlock = false; room.cast(a.sessionId, sk);
    assert.equal(casts, 1, "control: the same cast works without the lantern"); A.qlock = true;

    // portal stone ("travel"), waygate, rope / stair: blocked, lantern stays in hand
    const [P1, P2] = PORTALS; A.portals.add(P1.id); A.portals.add(P2.id);
    A.x = P1.x; A.y = P1.y; a.send("travel", { to: P2.id }); await wait(250);
    assert.ok(near(A, P1, 40), "travel blocked");
    for (const k of ["tutorial", "crown", "beast"]) { const c = ci(k); room.qset(A, c, { questId: CHAINS[c].quests.length, questStage: 0, questCount: 0 }); }
    const g = WAYGATES[0]; A.x = g.x; A.y = g.y; A.lastHurt = 0; a.send("waygate"); await wait(250); // used with E / a click
    assert.ok(near(A, g, 1), "waygate blocked");
    const ln = LINKS[0]; A.x = ln.x; A.y = ln.y; A.linkLock = ""; room.useLinks(a.sessionId, A);
    assert.ok(near(A, ln, 1), "rope / stair blocked");
    await wait(250);
    assert.ok(notes.length > 0, "the holder is told why (a chat note)");
    assert.equal(room.qsteps.lanterns[0].holder, a.sessionId, "still holding it");
    assert.equal(A.qlock, true);
    // control: with qlock off the same portal works
    A.qlock = false; A.x = P1.x; A.y = P1.y; a.send("travel", { to: P2.id }); await wait(250);
    assert.ok(Math.hypot(A.x - P1.x, A.y - P1.y) > 100, "travel works without the lantern");
    A.level = 30; // (the Sunscar's waygate opens at level 30)
    A.x = g.x; A.y = g.y; A.lastHurt = 0; a.send("waygate"); await wait(250);
    assert.ok(Math.hypot(A.x - g.x, A.y - g.y) > 100, "the waygate works without the lantern");
    await a.leave();
  } finally { await srv.stop(); }
});

test("carry: drain table, qdrop only by the holder, partner pickup, death drop, light out, delivery", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "wizard" }), b = await srv.join({ cls: "vampire" });
    const sfx: any[] = [];
    a.onMessage("sfx", (m: any) => sfx.push(m));
    await wait(300);
    const room = srv.room, A = room.state.players.get(a.sessionId), B = room.state.players.get(b.sessionId);
    for (const P of [A, B]) { onCarry(P); P.invulnUntil = Date.now() + 600_000; } // wandering mobs must not kill them by accident
    A.party = B.party = "ptest";
    await wait(100);
    a.send("use", { id: "lantern_last" }); await wait(300);
    const L = room.qsteps.lanterns[0];
    assert.equal(L.holder, a.sessionId);
    assert.equal(wetAt(L.x, L.y), false, "the take spot is dry");

    // drain: held by day = base, ground x groundMult, then x darkMult in the dark, wet x waterMult
    const drained = (dark: boolean) => { room.qsteps.dayFrac = () => (dark ? 0.8 : 0.3); L.light = 100; room.qsteps.tickLantern(L, Date.now(), 10); return 100 - L.light; };
    assert.equal(isDark(0.8), true); assert.equal(isDark(0.3), false);
    const base = carry.drain * 10;
    const held = drained(false);
    assert.ok(Math.abs(held - base) < 1e-6, `held by day ${held}`);
    let wet: { x: number; y: number } | undefined;
    for (let ty = 0; ty < GROUND.length && !wet; ty++) for (let tx = 0; tx < GROUND[ty].length && !wet; tx++) {
      if (GROUND[ty][tx] === T.WATER) wet = { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
    }
    assert.ok(wet && wetAt(wet.x, wet.y));
    const hx = A.x, hy = A.y; A.x = wet!.x; A.y = wet!.y;
    const wetHeld = drained(false);
    assert.ok(Math.abs(wetHeld - base * carry.waterMult) < 1e-6, `wet ${wetHeld}`);
    A.x = hx; A.y = hy; L.x = hx; L.y = hy;

    // qdrop: nobody but the holder; junk payloads don't matter
    b.send("qdrop", {}); b.send("qdrop", "junk"); await wait(150);
    assert.equal(L.holder, a.sessionId, "only the holder can drop");
    a.send("qdrop", { x: 1, y: 1, holder: b.sessionId }); await wait(200);
    assert.equal(L.holder, "");
    assert.equal(A.qlock, false); assert.equal(A.lureMul, 1);
    assert.ok(near(L, A, 1), "dropped where the holder stood");
    const ground = drained(false), groundDark = drained(true);
    assert.ok(Math.abs(ground - base * carry.groundMult) < 1e-6, `ground ${ground}`);
    assert.ok(Math.abs(groundDark - ground * carry.darkMult) < 1e-6, `ground+dark ${groundDark}`);
    room.qsteps.dayFrac = () => 0.3; L.light = 100;

    // a partner picks it up from the ground
    B.x = L.x + 6; B.y = L.y; await wait(50);
    b.send("use", { id: "lantern_last" }); await wait(300);
    assert.equal(L.holder, b.sessionId); assert.equal(B.qlock, true);
    assert.ok(L.owners.includes(b.sessionId));
    assert.ok(sfx.some((m) => m.ev === "lanternpass" && m.id === b.sessionId), "lanternpass");

    // the holder dies: it drops where they fell, qlock clears
    const fx = B.x, fy = B.y;
    B.invulnUntil = 0;
    room.damagePlayer(b.sessionId, 99999, "test", [0, 0], 0);
    assert.equal(L.holder, ""); assert.equal(B.qlock, false); assert.equal(B.lureMul, 1);
    assert.ok(near(L, { x: fx, y: fy }, 1), "dropped at the death spot");

    // light 0: out, removed, everyone's count is 0
    L.light = 0.001; room.qsteps.tickLantern(L, Date.now(), 1);
    assert.equal(room.qsteps.lanterns.length, 0);
    await wait(200);
    assert.ok(sfx.some((m) => m.ev === "lanternout"));
    assert.equal(chainState(A, LAN)!.questCount, 0); assert.equal(chainState(B, LAN)!.questCount, 0);

    // delivery: A carries it in; B (alive, in the same party, nearby) finishes with them
    await wait(3200); // B respawns
    B.dead = false; B.invulnUntil = Date.now() + 600_000;
    A.x = carry.take.x + 4; A.y = carry.take.y; a.send("use", { id: "lantern_last" }); await wait(300);
    assert.equal(room.qsteps.lanterns[0]?.holder, a.sessionId);
    A.x = carry.to.x; A.y = carry.to.y; B.x = carry.to.x + 100; B.y = carry.to.y;
    await wait(300);
    assert.equal(chainState(A, LAN)!.questStage, 3, "holder delivered");
    assert.equal(chainState(B, LAN)!.questStage, 3, "together partner delivered");
    assert.equal(A.qlock, false);
    await a.leave(); await b.leave();
  } finally { await srv.stop(); }
});

test("carry: a blob between its aggro range and aggro x lure it targets only a lantern holder", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "wizard" });
    await wait(300);
    const room = srv.room, A = room.state.players.get(a.sessionId);
    tutDone(A); A.level = 10; A.invulnUntil = Date.now() + 600_000;
    const def = MOBS.slime;
    const m: any = [...room.state.mobs.values()].find((x: any) => x.kind === "slime" && !x.dead && !x.summonFor);
    m.x = m.homeX = 4000; m.y = m.homeY = 3000; m.level = A.level;
    A.x = 4000 + def.aggroRange * (1 + carry.lure) / 2; A.y = 3000; // between aggroRange and aggroRange x lure
    const pick = (mul: number) => { A.lureMul = mul; m.target = ""; m.hateId = ""; m.hate = 0; m.foe = ""; room.pickTarget(m, def); return m.target; };
    assert.equal(pick(1), "", "not carrying: out of range");
    assert.equal(pick(carry.lure), a.sessionId, "carrying: lured");
    A.x = 4000 + def.aggroRange * carry.lure * 1.2;
    assert.equal(pick(carry.lure), "", "beyond aggro x lure even a holder is not noticed");
    A.lureMul = 1;
    await a.leave();
  } finally { await srv.stop(); }
});

test("carry saves: a hero saved mid-carry loads with count 0 and the lantern at its spot", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "wizard" }), b = await srv.join({ cls: "wizard" });
    await wait(300);
    const room = srv.room, A = room.state.players.get(a.sessionId), B = room.state.players.get(b.sessionId);
    onCarry(A); await wait(100);
    a.send("use", { id: "lantern_last" }); await wait(300);
    assert.equal(chainState(A, LAN)!.questCount, 1);
    const snap = JSON.parse(JSON.stringify(room.snapshot(A)));
    room.restore(B, snap); // a login restores the snapshot over a fresh body
    assert.equal(B.qlock, false, "not holding anything after loading");
    B.invulnUntil = 0;
    await wait(600); // the scan puts a leftover count back to 0
    assert.equal(chainState(B, LAN)!.questStage, 2, "still on the step");
    assert.equal(chainState(B, LAN)!.questCount, 0, "count 0");
    assert.ok(!room.qsteps.lanterns.some((l: any) => l.owners.includes(b.sessionId)), "no lantern of theirs elsewhere");
    // the lantern is at its spot: the loaded hero can take it up fresh, at full light
    B.x = carry.take.x + 4; B.y = carry.take.y;
    b.send("use", { id: "lantern_last" }); await wait(300);
    const L = room.qsteps.lanterns.find((l: any) => l.holder === b.sessionId);
    assert.ok(L, "taken up again");
    assert.ok(L.light > carry.light - 5 && L.light <= carry.light, `fresh light (${L.light})`);
    await a.leave(); await b.leave();
  } finally { await srv.stop(); }
});

test("hold: waves, cap of 6, Odo hurt, Odo down ends the run, leaving resets, 90 s moves on, leaving removes waves", async () => {
  assert.equal(holdStep.type, "hold");
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    const sfx: any[] = [], qs: any[] = [];
    c.onMessage("sfx", (m: any) => sfx.push(m)); c.onMessage("qstate", (m: any) => qs.push(m));
    await wait(300);
    const room = srv.room, P = room.state.players.get(c.sessionId), odo = npcById(hold.npc)!;
    tutDone(P); P.level = 4; P.quests.set("mill", packQuest(CHAINS[MILL].quests.length, 0, 0));
    P.x = odo.x + 10; P.y = odo.y + 10; P.invulnUntil = Date.now() + 600_000;
    await wait(100);
    c.send("quest", { chain: WHEEL }); await wait(200);
    assert.equal(chainState(P, WHEEL)!.questStage, 1, "accepted");
    c.send("quest", { chain: WHEEL }); await wait(500);
    assert.equal(chainState(P, WHEEL)!.questStage, 2, "on the hold step");
    const r = room.qsteps.holds[0];
    assert.ok(r, "walking into the area starts a run");
    assert.equal(r.hp, hold.npcHp);
    await wait(1800);
    assert.ok(r.mobs.length >= hold.waves.n[0] && r.mobs.length <= hold.waves.n[1], `first wave ${r.mobs.length}`);
    assert.ok(r.mobs.every((id: string) => room.state.mobs.get(id).qwave), "wave marker");
    assert.ok(sfx.some((m) => m.ev === "wavehorn"));
    assert.ok(qs.some((m) => m.k === "hold" && m.on && m.max === hold.npcHp), "hold qstate");

    // forced waves never pass maxAlive
    assert.equal(hold.maxAlive, 6);
    for (let i = 0; i < 8; i++) { r.nextWave = 0; room.qsteps.tickHold(r, Date.now()); assert.ok(r.mobs.length <= hold.maxAlive); }
    assert.equal(r.mobs.length, 6, "the run fills up to 6");

    // a wave mob parked next to Odo with no target takes his HP
    P.x = odo.x + 6 * TILE;
    const m = room.state.mobs.get(r.mobs[0]);
    for (const id of r.mobs.slice(1)) room.state.mobs.get(id).x = odo.x + 200;
    const hp0 = r.hp; m.x = odo.x + 5; m.y = odo.y; m.target = ""; r.nextHurt = 0;
    room.qsteps.tickHold(r, Date.now());
    assert.equal(r.hp, hp0 - hold.npcDmg, "one parked mob = npcDmg");
    await wait(200); assert.ok(sfx.some((x) => x.ev === "odohurt"));

    // Odo at 0: run over, waves removed, no restart until the hero walks out and back in
    const ids = [...r.mobs];
    r.hp = 1; m.x = odo.x + 5; m.y = odo.y; m.target = ""; r.nextHurt = 0; room.qsteps.tickHold(r, Date.now());
    assert.equal(room.qsteps.holds.length, 0);
    assert.ok(gone(room, ids), "waves removed");
    await wait(400);
    assert.ok(qs.some((x) => x.k === "hold" && x.end === "fail"));
    assert.equal(chainState(P, WHEEL)!.questStage, 2, "still on the step");
    assert.equal(room.qsteps.holds.length, 0, "no restart while still inside");
    P.x = odo.x + 20 * TILE; await wait(400); P.x = odo.x + 10; await wait(400);
    assert.equal(room.qsteps.holds.length, 1, "walked out and back in: restarted");

    // out of the area for more than leaveMs: reset
    const r2 = room.qsteps.holds[0];
    P.x = odo.x + 20 * TILE; await wait(100);
    r2.outSince = Date.now() - (hold.leaveMs - 1000); room.qsteps.tickHold(r2, Date.now());
    assert.equal(room.qsteps.holds.length, 1, "away for less than leaveMs: still running");
    r2.outSince = Date.now() - hold.leaveMs - 1000; room.qsteps.tickHold(r2, Date.now());
    assert.equal(room.qsteps.holds.length, 0, "away too long: reset");
    await wait(400); P.x = odo.x + 10; await wait(500);

    // surviving the time moves the hero on
    const r3 = room.qsteps.holds[0];
    assert.ok(r3, "restarted after the reset");
    r3.start = Date.now() - hold.ms - 1; await wait(200);
    assert.equal(chainState(P, WHEEL)!.questStage, 3, "held: on to stage 3");
    assert.equal(room.qsteps.holds.length, 0);

    // a hero leaving mid-run removes its waves
    const d = await srv.join({ cls: "wizard" }); await wait(300);
    const Q = room.state.players.get(d.sessionId); onHold(Q, -10, 0); await wait(500);
    const r4 = room.qsteps.holds.find((x: any) => x.owners.includes(d.sessionId)); assert.ok(r4);
    r4.nextWave = 0; await wait(200);
    const w = [...r4.mobs]; assert.ok(w.length > 0);
    await d.leave(); await wait(300);
    assert.ok(gone(room, w), "waves removed on leave");
    assert.ok(!room.qsteps.holds.includes(r4));
    await c.leave();
  } finally { await srv.stop(); }
});

test("hold: the server-wide cap on wave monsters holds with several runs at once", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(300);
    const room = srv.room, P = room.state.players.get(c.sessionId);
    onHold(P); await wait(500);
    const first = room.qsteps.holds[0]; assert.ok(first, "a run is up");
    // synthetic extra runs (as if many groups were on the step): same step, own mob lists
    for (let i = 0; i < 7; i++) room.qsteps.holds.push({ ...first, mobs: [], nextWave: 0, nextHurt: Date.now() + 1e9, sig: "x" });
    for (let round = 0; round < 6; round++) for (const r of [...room.qsteps.holds]) { r.nextWave = 0; room.qsteps.tickHold(r, Date.now()); }
    const total = room.qsteps.holds.reduce((t: number, r: any) => t + r.mobs.length, 0);
    assert.ok(total > hold.maxAlive, `more than one run's worth spawned (${total})`);
    assert.ok(total <= HOLD.serverCap, `server cap ${HOLD.serverCap} holds (${total})`);
    for (const r of room.qsteps.holds) assert.ok(r.mobs.length <= hold.maxAlive);
    await c.leave();
  } finally { await srv.stop(); }
});
