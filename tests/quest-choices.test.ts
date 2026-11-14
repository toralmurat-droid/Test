// Quest concepts #5 (Two Letters) and #11 (The Crown in the Sand), plus how choices and cosmetics are saved.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAINS, RED_CHAIN, SUN_CHAIN, SUN_QUESTS, chainDone, chainOpen, chainState, npcPresent, packQuest } from "../shared/quests";
import { META, choiceOf, metaOf, withChoice } from "../shared/questSteps";
import { packCosmetics } from "../shared/cosmetics";
import { SHOPS } from "../shared/shops";
import { npcById } from "../shared/npcs";
import { startRoom, wait } from "./helpers/room";

const ix = (id: string) => CHAINS.findIndex((c) => c.id === id);
const L = ix("letters"), S = ix("sandcrown");
const letters = CHAINS[L].quests[0];
const done = (c: number) => packQuest(CHAINS[c].quests.length, 0, 0);

test("Two Letters: gated on the Redfang Debt, choice must be a valid option, branches, hand-in pays gold only", async () => {
  assert.equal(CHAINS[L].local, true);
  assert.equal(chainOpen({ level: 30, tut: done(ix("tutorial")), arcs: {} } as any, L), false);
  assert.equal(chainOpen({ level: 30, tut: done(ix("tutorial")), red: done(RED_CHAIN), arcs: {} } as any, L), true);

  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "knight" }), b = await srv.join({ cls: "knight" });
    await wait(250);
    const room = srv.room, pa = room.state.players.get(a.sessionId), pb = room.state.players.get(b.sessionId);
    for (const p of [pa, pb]) {
      p.tut = packQuest(CHAINS[ix("tutorial")].quests.length, 0, 0);
      p.level = 25;
      p.hp = p.maxHp = 1_000_000;
    }
    const put = (p: any, id: string) => { const n = npcById(id)!; p.x = n.x; p.y = n.y; };
    const st = (p: any) => chainState(p, L)!;

    // gated: the Redfang Debt is not done
    put(pa, "oldfisher");
    await wait(100);
    a.send("quest", { chain: L });
    await wait(150);
    assert.equal(st(pa).questStage, 0, "closed before the Redfang Debt is done");
    pa.red = pb.red = done(RED_CHAIN);
    assert.equal(npcPresent("ilka", pa), true, "Ilka is by the fence before anything is chosen");
    a.send("quest", { chain: L });
    await wait(150);
    assert.equal(st(pa).questStage, 1, "accepted: the choose step");

    // bad choices leave the hero where they are
    for (const opt of [7, 1.5, 0, -1, "2", null, NaN]) { a.send("quest", { chain: L, opt }); await wait(60); }
    a.send("quest", { chain: L });
    await wait(100);
    assert.equal(st(pa).questStage, 1);
    assert.equal(choiceOf(pa, "letters"), 0);
    // right option, wrong place
    pa.x += 500;
    a.send("quest", { chain: L, opt: 2 });
    await wait(100);
    assert.equal(st(pa).questStage, 1, "too far from Garrick");
    assert.equal(choiceOf(pa, "letters"), 0);
    put(pa, "oldfisher");

    // mercy: skip Hale, go to Ilka
    const xp = pa.xp, level = pa.level, gold = pa.gold;
    await wait(50);
    a.send("quest", { chain: L, opt: 2 });
    await wait(150);
    assert.equal(choiceOf(pa, "letters"), 2);
    assert.equal(st(pa).questStage, 3, "Ilka's step; Hale's is skipped");
    assert.equal(letters.steps[2].npc, "ilka");
    put(pa, "captain");
    a.send("quest", { chain: L });
    await wait(100);
    assert.equal(st(pa).questStage, 3, "Hale is not who they need");
    put(pa, "ilka");
    a.send("quest", { chain: L });
    await wait(200);
    assert.equal(st(pa).questId, 1, "quest done");
    assert.equal(chainDone(pa, L), true);
    assert.equal(pa.gold, gold + letters.reward.gold);
    assert.equal(letters.reward.xp, 0);
    assert.equal(pa.xp, xp, "no XP");
    assert.equal(pa.level, level);

    // law: Hale
    put(pb, "oldfisher");
    await wait(100);
    b.send("quest", { chain: L });
    await wait(150);
    b.send("quest", { chain: L, opt: 1 });
    await wait(150);
    assert.equal(choiceOf(pb, "letters"), 1);
    assert.equal(st(pb).questStage, 2, "Hale's step");
    put(pb, "ilka");
    b.send("quest", { chain: L });
    await wait(100);
    assert.equal(st(pb).questStage, 2, "Ilka is not who they need");
    const gold2 = pb.gold, xp2 = pb.xp;
    put(pb, "captain");
    b.send("quest", { chain: L });
    await wait(200);
    assert.equal(chainDone(pb, L), true);
    assert.equal(pb.gold, gold2 + letters.reward.gold);
    assert.equal(pb.xp, xp2);

    // who is where, and who trades
    assert.deepEqual(["smuggler", "quartermaster", "ilka"].map((n) => npcPresent(n, pa)), [true, false, false], "mercy");
    assert.deepEqual(["smuggler", "quartermaster", "ilka"].map((n) => npcPresent(n, pb)), [false, true, false], "law");
    const at = (p: any, id: string) => { put(p, id); return room.shopNear(p); };
    assert.equal(at(pa, "smuggler"), SHOPS.smuggler, "mercy: the smuggler trades");
    assert.notEqual(at(pa, "quartermaster"), SHOPS.watch, "mercy: no quartermaster");
    assert.equal(at(pb, "quartermaster"), SHOPS.watch, "law: the quartermaster trades");
    assert.notEqual(at(pb, "smuggler"), SHOPS.smuggler, "law: no smuggler");
    // a hero who has not chosen sees neither
    const fresh = { level: 30, tut: pa.tut, red: done(RED_CHAIN), arcs: {} } as any;
    assert.deepEqual(["smuggler", "quartermaster"].map((n) => npcPresent(n, fresh)), [false, false]);
    assert.equal(npcPresent("ilka", fresh), true);
    assert.equal(npcPresent("ilka", { level: 30, tut: pa.tut, arcs: {} } as any), false, "Ilka only appears after the Redfang Debt");
  } finally {
    await srv.stop();
  }
});

test("The Crown in the Sand: opens once the Sun chain is past Kharsun; the Envoy counts only for its owner", async () => {
  const kh = SUN_QUESTS.findIndex((d) => d.id === "kharsun");
  assert.ok(kh >= 0);
  const hero = (sun: number) => ({ level: 40, tut: done(ix("tutorial")), sun, arcs: {} }) as any;
  assert.equal(chainOpen(hero(0), S), false);
  assert.equal(chainOpen(hero(packQuest(kh, 1, 0)), S), false, "on 'kharsun'");
  assert.equal(chainOpen(hero(packQuest(kh, 0, 0)), S), false, "offered, not begun");
  assert.equal(chainOpen(hero(packQuest(kh + 1, 0, 0)), S), true, "past it");
  assert.equal(chainOpen(hero(done(SUN_CHAIN)), S), true);
  assert.equal(chainOpen({ level: 40, tut: packQuest(0, 1, 0), sun: packQuest(kh + 1, 0, 0), arcs: {} } as any, S), false, "tutorial first");

  const envoyQ = CHAINS[S].quests[1], step = envoyQ.steps[0];
  assert.equal(step.type, "kill");
  assert.equal(step.own, true, "the Envoy is an own boss");

  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "knight" }), b = await srv.join({ cls: "knight" });
    await wait(250);
    const room = srv.room, pa = room.state.players.get(a.sessionId), pb = room.state.players.get(b.sessionId);
    for (const p of [pa, pb]) { p.tut = done(ix("tutorial")); p.level = 40; room.qset(p, S, { questId: 1, questStage: 1, questCount: 0 }); }
    const mobFor = (pid: string) => room.state.mobs.get(room.summonFused(pid, step.summon, S));
    const stage = (p: any) => chainState(p, S)!;

    // a kill by B on A's Envoy: A's step does not move (and B has no step with this kind)
    const forA = mobFor(a.sessionId);
    room.questKill(b.sessionId, pb, forA, S);
    assert.equal(stage(pa).questId, 1);
    assert.equal(stage(pb).questId, 1);
    // B's kill of an Envoy raised for A does not count for B either
    room.questKill(a.sessionId, pa, mobFor(b.sessionId), S);
    assert.equal(stage(pa).questId, 1, "someone else's Envoy does not count for A");
    // the owner's kill counts
    room.questKill(a.sessionId, pa, forA, S);
    assert.equal(stage(pa).questId, 2, "A's own Envoy finishes the arc");
    assert.equal(chainDone(pa, S), true);
    assert.equal(stage(pb).questId, 1, "B untouched");
  } finally {
    await srv.stop();
  }
});

test("saves: choices, cosmetics and arcs round-trip; old saves restore clean", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "knight" }), b = await srv.join({ cls: "knight" });
    await wait(250);
    const room = srv.room, pa = room.state.players.get(a.sessionId), pb = room.state.players.get(b.sessionId);
    let flags = withChoice(0, "letters", 2);
    flags = withChoice(flags, "grave", 1);
    flags = withChoice(flags, "bargain", 3);
    const cosm = packCosmetics({ title: 1, traits: 1 });
    pa.arcs.set(META.flags, flags); pa.arcs.set(META.cosm, cosm);
    room.qset(pa, L, { questId: 1, questStage: 0, questCount: 0 });
    room.qset(pa, S, { questId: 1, questStage: 2, questCount: 5 });
    const snap = JSON.parse(JSON.stringify(room.snapshot(pa)));
    assert.equal(snap.flags, flags);
    assert.equal(snap.cosm, cosm);

    room.restore(pb, snap);
    assert.equal(metaOf(pb, META.flags), flags);
    assert.equal(metaOf(pb, META.cosm), cosm);
    assert.deepEqual(["letters", "bargain", "grave"].map((k) => choiceOf(pb, k as any)), [2, 3, 1]);
    assert.deepEqual([chainState(pb, L)!.questId, chainState(pb, S)!.questId, chainState(pb, S)!.questStage, chainState(pb, S)!.questCount], [1, 1, 2, 5]);
    assert.equal(chainState(pb, S)!.questId, chainState(pa, S)!.questId);

    // an old save has neither field: restoring over a hero that has them clears them
    const old = JSON.parse(JSON.stringify(snap));
    delete old.flags; delete old.cosm;
    room.restore(pb, old);
    assert.equal(pb.arcs.has(META.flags), false);
    assert.equal(pb.arcs.has(META.cosm), false);
    for (const k of ["letters", "bargain", "grave"]) assert.equal(choiceOf(pb, k as any), 0);
    // garbage values read as nothing
    for (const bad of [-5, "x", NaN, null, {}]) {
      room.restore(pb, { ...old, flags: bad, cosm: bad });
      assert.ok(!pb.arcs.has(META.flags) || Number.isInteger(pb.arcs.get(META.flags)), `flags=${String(bad)}`);
    }
    // a fresh hero has no meta keys
    const c = await srv.join({ cls: "knight" });
    await wait(150);
    const pc = room.state.players.get(c.sessionId);
    assert.equal(pc.arcs.has(META.flags), false);
    assert.equal(pc.arcs.has(META.cosm), false);
  } finally {
    await srv.stop();
  }
});
