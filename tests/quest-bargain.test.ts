// Quest concept #6 (WP4): Grandam Ursk's Bargain, the Penance side quest, and the Hidebound talent (ships off).
// Numbers come from BARGAIN, the step specs and TRAIT_TALENTS; quest text is never asserted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BEAST_CHAIN, CHAINS, CROWN_CHAIN, SUN_CHAIN, chainDone, chainOpen, chainState, packQuest, questDialog, questStep } from "../shared/quests";
import { BARGAIN, META, choiceOf, metaOf, withChoice } from "../shared/questSteps";
import { hasTrait, withTrait } from "../shared/cosmetics";
import { TRAIT_TALENTS, traitTakenMult } from "../shared/talents";
import { act2Open } from "../shared/act2";
import { npcById } from "../shared/npcs";
import { DEN } from "../shared/dungeon";
import { MOBS, TILE } from "../shared/constants";
import { startRoom, wait } from "./helpers/room";

const ix = (id: string) => CHAINS.findIndex((c) => c.id === id);
const B = BEAST_CHAIN, PEN = ix("penance"), TUT = ix("tutorial");
const MOTHER = CHAINS[B].quests.findIndex((d) => d.id === "mother");
const done = (c: number) => packQuest(CHAINS[c].quests.length, 0, 0);
const bx = (DEN.x + 0.5) * TILE, by = (DEN.y - 1.5) * TILE;
const until = async (f: () => unknown, ms = 15_000) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await wait(50); return !!f(); };

const stories = () => ({ questId: CHAINS[0].quests.length, bone: done(1), red: done(2), crown: done(CROWN_CHAIN) });
/** A level-30 hero on the Hide-Mother's kill step, close to the den and unkillable (her blows must not move the test). */
function setup(p: any) {
  Object.assign(p, stories());
  p.tut = done(TUT);
  p.level = 30;
  p.hp = p.maxHp = 10_000_000;
  p.invulnUntil = Date.now() + 600_000;
  p.beast = packQuest(MOTHER, 3, 0);
  p.x = bx + 3 * TILE; p.y = by;
  p.nextSummon = 0;
}
const ursk = (room: any, pid: string) => [...room.state.mobs.entries()].find(([, m]: any) => m.kind === "hidemother" && m.summonFor === pid && !m.dead) as [string, any] | undefined;
const prompts = (g: any[]) => g.filter((m) => m.options);

test("invariants: Hide Rite step count, version, Hidebound off and its beast list", () => {
  assert.equal(CHAINS[B].quests[MOTHER].steps.length, 4, "the Hide-Mother quest keeps 4 steps");
  assert.equal(CHAINS[B].version, 2, "the beast chain stays at version 2");
  assert.equal(TRAIT_TALENTS.hidebound.taken, 1, "ships at 1.0 (off)");
  assert.equal(traitTakenMult("gnawkin", withTrait(0, "beast")), 1, "off: no effect even with the trait");
  const from = TRAIT_TALENTS.hidebound.from;
  for (const k of from) assert.ok(k in MOBS, `${k} is a real MobKind`);
  // drift check: the beast-folk the Hide Rite quests name (kill and collect steps) + the crowseer
  const named = new Set<string>(["crowseer"]);
  for (const c of [B, PEN]) for (const q of CHAINS[c].quests) for (const s of q.steps) if (s.kinds && s.kinds.includes("gnawkin")) s.kinds.forEach((k) => named.add(k));
  assert.deepEqual([...from].sort(), [...named].sort(), "Hidebound list matches the beast-folk the Hide Rite uses");

  const was = TRAIT_TALENTS.hidebound.taken;
  TRAIT_TALENTS.hidebound.taken = 0.95;
  try {
    const t = withTrait(0, "beast");
    for (const k of from) { assert.equal(traitTakenMult(k, t), 0.95, k); assert.equal(traitTakenMult(k, 0), 1, `${k} without the trait`); }
    assert.equal(traitTakenMult("slime", t), 1, "other kinds untouched");
    assert.equal(traitTakenMult("hornbrute", t), 1);
  } finally { TRAIT_TALENTS.hidebound.taken = was; }
  assert.equal(TRAIT_TALENTS.hidebound.taken, 1, "restored");
});

test("gates: Hide Rite, act 2 and the Second Sun read the same whichever way the Bargain went", () => {
  const base = { ...stories(), level: 30, tut: done(TUT), beast: done(B) };
  for (const v of [0, 1, 2, 3]) {
    const h = { ...base, arcs: v ? { $f: withChoice(0, "bargain", v) } : {} } as any;
    assert.equal(chainDone(h, B), true, `bargain ${v}: Hide Rite done`);
    assert.equal(act2Open(h), true, `bargain ${v}: act 2`);
    assert.equal(chainOpen(h, SUN_CHAIN), true, `bargain ${v}: Second Sun`);
  }
});

test("penance gate: needs bargain 1 and the Hide Rite handed in", () => {
  const base = { ...stories(), level: 30, tut: done(TUT), beast: done(B) };
  const open = (o: any) => chainOpen({ ...base, ...o } as any, PEN);
  assert.equal(open({ arcs: {} }), false, "bargain 0");
  assert.equal(open({ arcs: { $f: withChoice(0, "bargain", 2) } }), false, "bargain 2 (refused)");
  assert.equal(open({ arcs: { $f: withChoice(0, "bargain", 1) } }), true, "bargain 1 after the hand-in");
  assert.equal(open({ beast: packQuest(MOTHER, 4, 0), arcs: { $f: withChoice(0, "bargain", 1) } }), false, "not before the hand-in");
});

test("bargain: one prompt, bad answers ignored, resend, accept, Hale hand-in", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "knight" }), o = await srv.join({ cls: "knight" });
    const choices: any[] = [], sfx: any[] = [];
    a.onMessage("choice", (m: any) => choices.push({ ...m, t: Date.now() }));
    a.onMessage("sfx", (m: any) => { if (m.ev === "bargain") sfx.push(m); });
    await wait(250);
    const room = srv.room, pid = a.sessionId, p = room.state.players.get(pid), po = room.state.players.get(o.sessionId);
    setup(p); setup(po); po.beast = packQuest(MOTHER, 2, 0); po.x = bx + 2 * TILE; // the other hero is not on the kill step
    assert.ok(await until(() => ursk(room, pid)), "Ursk rises");
    const [mid, m] = ursk(room, pid)!;
    assert.ok(await until(() => choices.length >= 1), "prompt arrives");
    await wait(200);
    assert.equal(choices.length, 1, "exactly one prompt as she rises");
    const spec = CHAINS[B].quests[MOTHER].steps.find((s) => s.bargain)!.bargain!;
    assert.equal(choices[0].chain, B);
    assert.equal(typeof choices[0].title, "string");
    assert.ok(choices[0].title.length > 0);
    assert.deepEqual(choices[0].options.map((x: any) => x.v), spec.options.map((x) => x.v));
    assert.ok(Array.isArray(choices[0].text) && choices[0].text.length >= 1);

    // bad answers: ignored, the window stays open
    for (const opt of [3, 0, -1, 1.5, "1", null, NaN, true]) { a.send("quest", { chain: B, opt }); await wait(40); }
    a.send("quest", { chain: B }); await wait(60);       // no opt
    a.send("quest", { chain: 0, opt: 1 }); await wait(60); // wrong chain
    assert.equal(choiceOf(p, "bargain"), 0, "nothing recorded");
    assert.equal(chainState(p, B)!.questStage, 3, "still on the kill step");
    assert.ok(!m.dead && room.state.mobs.has(mid), "Ursk still up");
    // another hero's answer is not theirs to give
    o.send("quest", { chain: B, opt: spec.accept }); await wait(120);
    assert.equal(choiceOf(p, "bargain"), 0);
    assert.equal(choiceOf(po, "bargain"), 0);
    assert.equal(chainState(po, B)!.questStage, 2);

    // resent while the window is open
    const t0 = choices[0].t;
    assert.ok(await until(() => choices.length >= 2, BARGAIN.resendMs + 5000), "prompt resent");
    const dt = choices[1].t - t0;
    assert.ok(dt >= BARGAIN.resendMs - 300 && dt <= BARGAIN.resendMs + 2500, `resent after about ${BARGAIN.resendMs} ms (${dt})`);
    assert.ok(choices[1].options, "a full prompt, not a close");

    const gold = p.gold, xp = p.xp;
    a.send("quest", { chain: B, opt: spec.accept });
    assert.ok(await until(() => choiceOf(p, "bargain") === spec.accept), "flag set");
    assert.equal(choiceOf(p, "bargain"), 1);
    assert.ok(hasTrait(metaOf(p, META.cosm), "beast"), "trait bit set");
    assert.ok(await until(() => m.dead || !room.state.mobs.has(mid)), "Ursk gone");
    assert.ok(await until(() => sfx.length >= 1), "bargain sfx");
    await wait(200);
    assert.equal(sfx.length, 1, "one sfx");
    assert.equal(sfx[0].id, pid); assert.equal(typeof sfx[0].x, "number"); assert.equal(typeof sfx[0].y, "number");
    assert.equal(chainState(p, B)!.questStage, 4, "on the Hale hand-in step");
    assert.equal(p.xp, xp, "no boss kill XP");
    const n = prompts(choices).length;
    await wait(BARGAIN.resendMs + 500);
    assert.equal(prompts(choices).length, n, "no prompts after the answer");
    p.nextSummon = 0; await wait(400);
    assert.equal(ursk(room, pid), undefined, "she does not rise again for an answered hero");

    // the hand-in finishes the chain with the normal reward
    const hale = npcById("captain")!;
    p.x = hale.x; p.y = hale.y;
    assert.equal(questDialog("captain", p)!.chain, B);
    a.send("quest", { chain: B });
    assert.ok(await until(() => chainDone(p, B)), "Hide Rite done");
    assert.equal(p.gold, gold + CHAINS[B].quests[MOTHER].reward.gold, "normal gold reward");
    assert.equal(act2Open(p), true); assert.equal(chainOpen(p, SUN_CHAIN), true);
    await a.leave(); await o.leave();
  } finally { await srv.stop(); }
});

test("bargain: refuse, damage, distance, timeout and death all close the window with flag 2", async () => {
  const srv = await startRoom();
  try {
    const cs = await Promise.all([0, 1, 2, 3, 4].map(() => srv.join({ cls: "knight" })));
    const got = cs.map(() => [] as any[]);
    cs.forEach((c, i) => c.onMessage("choice", (m: any) => got[i].push(m)));
    await wait(300);
    const room = srv.room, ids = cs.map((c) => c.sessionId), ps = ids.map((id) => room.state.players.get(id));
    ps.forEach(setup);
    assert.ok(await until(() => ids.every((id) => ursk(room, id)) && got.every((g) => prompts(g).length >= 1), 25_000), "every hero gets Ursk and a prompt");
    await wait(200);
    assert.ok(got.every((g) => prompts(g).length === 1), "one prompt each");
    const [refuser, hurt, far, slow, dies] = [0, 1, 2, 3, 4];
    const spec = CHAINS[B].quests[MOTHER].steps.find((s) => s.bargain)!.bargain!;
    cs[refuser].send("quest", { chain: B, opt: spec.refuse });
    ursk(room, ids[hurt])![1].hp -= 1;
    ps[far].x = bx + (BARGAIN.r / TILE + 2) * TILE;
    room.qsteps.bargains.get(ids[slow]).at = Date.now() - BARGAIN.ms - 1;
    ps[dies].invulnUntil = 0; room.damagePlayer(ids[dies], 1e9, "test", [0, 0], 0, {});
    assert.ok(await until(() => ps.every((p: any) => choiceOf(p, "bargain") === 2)), "all five windows closed with flag 2");
    assert.ok(await until(() => got.every((g) => g.some((m) => m.close))), "every hero is told to close the modal");
    for (const i of [refuser, hurt, far, slow, dies]) {
      assert.equal(hasTrait(metaOf(ps[i], META.cosm), "beast"), false, `hero ${i}: no trait`);
      assert.equal(chainState(ps[i], B)!.questStage, 3, `hero ${i}: the fight goes on`);
      assert.equal(got[i].find((m) => m.close).chain, B, `hero ${i}: close names the chain`);
    }
    for (const i of [refuser, hurt, far, slow]) assert.ok(ursk(room, ids[i]), `hero ${i}: Ursk still up`);
    // a late accept is ignored
    cs[refuser].send("quest", { chain: B, opt: spec.accept }); await wait(200);
    assert.equal(choiceOf(ps[refuser], "bargain"), 2);
    assert.equal(hasTrait(metaOf(ps[refuser], META.cosm), "beast"), false);
    assert.equal(chainState(ps[refuser], B)!.questStage, 3);
    assert.ok(ursk(room, ids[refuser]), "Ursk still up after a late accept");
    await wait(BARGAIN.resendMs + 500);
    assert.ok(got.every((g) => prompts(g).length === 1), "no resends once closed");
    // killing her still advances the step
    const [, m] = ursk(room, ids[refuser])!;
    room.questKill(ids[refuser], ps[refuser], m, B);
    assert.equal(chainState(ps[refuser], B)!.questStage, 4, "kill advances the step");
    for (const c of cs) await c.leave();
  } finally { await srv.stop(); }
});

test("penance: offered after a bargain, charms from beast-folk only for the hero, Rowan then Hale gives flag 3", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "knight" });
    await wait(250);
    const room = srv.room, pid = a.sessionId, p = room.state.players.get(pid);
    setup(p);
    p.beast = done(B);
    p.arcs.set("$f", withChoice(0, "bargain", 1));
    p.arcs.set("$c", withTrait(0, "beast"));
    p.nextSummon = 1e18; // no Ursk needed here
    const hale = npcById("captain")!, rowan = npcById("druid")!;
    p.x = hale.x; p.y = hale.y;
    assert.equal(questDialog("captain", p)!.chain, PEN, "Hale offers the Penance");
    a.send("quest", { chain: PEN });
    assert.ok(await until(() => chainState(p, PEN)!.questStage === 1), "accepted");
    const st = questStep(chainState(p, PEN)!)!;
    assert.equal(st.type, "collect");
    const goal = st.goal!;
    assert.ok(goal > 0);
    const itemsOf = () => [...room.state.items.values()].filter((it: any) => it.kind === "quest");
    const kill = (kind: string) => room.questKill(pid, p, { kind, x: p.x + 400, y: p.y, merged: 1 }, PEN);
    for (let i = 0; i < 40; i++) kill("slime");
    assert.equal(itemsOf().length, 0, "no charms from a slime");
    for (let i = 0; i < 40; i++) kill("gnawkin");
    const drops = itemsOf();
    assert.ok(drops.length >= 3, `charms drop from beast-folk (${drops.length})`);
    assert.ok(drops.every((it: any) => it.owner === pid), "only for this hero");
    room.state.items.forEach((it: any, k: string) => { if (it.kind === "quest") room.state.items.delete(k); });
    room.questProgress(pid, p, PEN, goal);
    assert.equal(chainState(p, PEN)!.questStage, 2, "on to Rowan");
    a.send("quest", { chain: PEN }); await wait(200);
    assert.equal(chainState(p, PEN)!.questStage, 2, "Rowan is not here");
    p.x = rowan.x; p.y = rowan.y;
    a.send("quest", { chain: PEN });
    assert.ok(await until(() => chainState(p, PEN)!.questStage === 3), "Rowan done");
    assert.equal(choiceOf(p, "bargain"), 1, "flag is still 1 until Hale");
    p.x = hale.x; p.y = hale.y;
    const gold = p.gold, xp = p.xp;
    a.send("quest", { chain: PEN });
    assert.ok(await until(() => chainDone(p, PEN)), "Penance done");
    assert.equal(choiceOf(p, "bargain"), 3, "flag 3");
    assert.ok(hasTrait(metaOf(p, META.cosm), "beast"), "the trait is kept");
    assert.equal(p.xp, xp, "XP unchanged");
    assert.ok(p.gold > gold, "gold added");
    await a.leave();
  } finally { await srv.stop(); }
});

test("saves: flags and trait round-trip; an old save gets bargain 0 and no prompt; leaving records nothing", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "knight" }), b = await srv.join({ cls: "knight" }), c = await srv.join({ cls: "knight" });
    const gb: any[] = [], gc: any[] = [];
    b.onMessage("choice", (m: any) => gb.push(m)); c.onMessage("choice", (m: any) => gc.push(m));
    await wait(300);
    const room = srv.room, pa = room.state.players.get(a.sessionId), pb = room.state.players.get(b.sessionId), pc = room.state.players.get(c.sessionId);
    pa.beast = done(B);
    pa.arcs.set("$f", withChoice(0, "bargain", 1));
    pa.arcs.set("$c", withTrait(0, "beast"));
    const snap = JSON.parse(JSON.stringify(room.snapshot(pa)));
    room.restore(pb, snap);
    assert.equal(choiceOf(pb, "bargain"), 1, "flag restored");
    assert.ok(hasTrait(metaOf(pb, META.cosm), "beast"), "trait restored");
    assert.equal(chainDone(pb, B), true);

    // an old save: Hide Rite done before WP4, no flags, no cosmetics
    const old = JSON.parse(JSON.stringify(snap));
    delete old.flags; delete old.cosm;
    room.restore(pb, old);
    assert.equal(choiceOf(pb, "bargain"), 0, "old save: bargain 0");
    assert.equal(hasTrait(metaOf(pb, META.cosm), "beast"), false);
    assert.equal(chainDone(pb, B), true, "old save: Hide Rite still done");
    setup(pb); pb.beast = done(B);
    await wait(BARGAIN.resendMs / 2);
    assert.equal(gb.length, 0, "old save: no prompt");
    assert.equal(ursk(room, b.sessionId), undefined, "old save: no Ursk");

    // leaving during the window records nothing
    setup(pc);
    assert.ok(await until(() => prompts(gc).length >= 1), "prompt for the leaver");
    assert.equal(room.qsteps.bargains.has(c.sessionId), true, "window open");
    await c.leave();
    assert.ok(await until(() => !room.qsteps.bargains.has(c.sessionId)), "window dropped on leave");
    assert.equal(choiceOf(pc, "bargain"), 0, "nothing recorded");
    await a.leave(); await b.leave();
  } finally { await srv.stop(); }
});

test("Hidebound in damagePlayer: off = same damage; on = 0.95 from beast-folk only, with the trait only", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "knight" });
    await wait(250);
    const room = srv.room, pid = a.sessionId, p = room.state.players.get(pid);
    p.tut = done(TUT); p.level = 30;
    p.x = bx + 3 * TILE; p.y = by + 6 * TILE;
    const mk = (kind: string) => { const id = room.summonFused(pid, { parts: [kind], level: 25, x: p.x + 200, y: p.y }, 0); const m = room.state.mobs.get(id); m.summonFor = "nobody"; m.stunUntil = Date.now() + 1e6; return id; };
    const gn = mk("gnawkin"), cr = mk("crowseer"), other = mk("hornbrute");
    const hit = (from: string) => { p.hp = p.maxHp = 1_000_000; p.invulnUntil = 0; p.lastHurt = 0; p.guarding = false; const h0 = p.hp; room.damagePlayer(pid, 1000, "t", [0, 0], 0, { from, dot: true }); return h0 - p.hp; };
    const base = [hit(gn), hit(cr), hit(other)];
    p.arcs.set("$c", withTrait(0, "beast"));
    assert.deepEqual([hit(gn), hit(cr), hit(other)], base, "off: the trait changes nothing");
    const was = TRAIT_TALENTS.hidebound.taken;
    TRAIT_TALENTS.hidebound.taken = 0.95;
    try {
      const on = [hit(gn), hit(cr), hit(other)];
      assert.equal(on[0], Math.round(base[0] * 0.95)); assert.equal(on[1], Math.round(base[1] * 0.95)); assert.equal(on[2], base[2]);
      p.arcs.delete("$c");
      assert.deepEqual([hit(gn), hit(cr), hit(other)], base, "on, but no trait: no change");
    } finally { TRAIT_TALENTS.hidebound.taken = was; }
    await a.leave();
  } finally { await srv.stop(); }
});
