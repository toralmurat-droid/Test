// Owner-only data (Player.me, @view()) reaches only the hero's own client; the shared quest rules read it there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chainState, tutorialDone, TUT_CHAIN } from "../shared/quests";
import { getStateCallbacks } from "colyseus.js";
import { Player, PlayerPrivate } from "../server/player";
import { startRoom, wait } from "./helpers/room";

/** Collect client-side decode errors (room.onError and console errors mentioning refId / decode). */
function watch(clients: any[]) {
  const errs: string[] = [], orig = console.error;
  console.error = (...a: unknown[]) => { const s = a.map(String).join(" "); if (/refId|decode|not found/i.test(s)) errs.push(s); orig(...a); };
  for (const c of clients) c.onError((code: number, msg?: string) => errs.push(`${code} ${msg}`));
  return { errs, stop: () => { console.error = orig; } };
}

test("each client sees its own me (quests, timers) and never another hero's; public fields stay visible", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "wizard" }), b = await srv.join({ cls: "wizard" });
    const w = watch([a, b]);
    await wait(500);
    const aOwn = a.state.players.get(a.sessionId), aSeesB = a.state.players.get(b.sessionId);
    const bOwn = b.state.players.get(b.sessionId), bSeesA = b.state.players.get(a.sessionId);
    assert.ok(aOwn.me && bOwn.me, "own me arrived");
    assert.ok(aOwn.me.quests.has("tut"), "new hero has tut");
    assert.equal(typeof aOwn.me.timers, "string");
    assert.equal(aSeesB.me, undefined, "A does not see B's me");
    assert.equal(bSeesA.me, undefined, "B does not see A's me");
    const sb = srv.room.state.players.get(b.sessionId);
    assert.equal(aSeesB.name, sb.name);
    assert.equal(aSeesB.hp, sb.hp);
    assert.ok(Math.abs(aSeesB.x - sb.x) < 1 && Math.abs(aSeesB.y - sb.y) < 1);
    assert.equal(bSeesA.name, srv.room.state.players.get(a.sessionId).name);
    w.stop();
    assert.deepEqual(w.errs, []);
    await a.leave(); await b.leave();
  } finally { await srv.stop(); }
});

test("server writes after join reach only the owner; late joiners and leavers do not break decoding", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "wizard" }), b = await srv.join({ cls: "wizard" });
    const w = watch([a, b]);
    await wait(400);
    const room = srv.room, sa = room.state.players.get(a.sessionId);
    room.qset(sa, 0, { questId: 3, questStage: 1, questCount: 2 });
    sa.timers = "1|test";
    await wait(400);
    const aOwn = a.state.players.get(a.sessionId);
    assert.ok(aOwn.me.quests.get("gloam") > 0, "A sees the new quest progress");
    assert.equal(aOwn.me.quests.get("gloam"), sa.quests.get("gloam"));
    assert.equal(aOwn.me.timers, "1|test");
    assert.equal(b.state.players.get(a.sessionId).me, undefined, "B still has no me for A");
    assert.equal(b.state.players.get(b.sessionId).me.quests.has("gloam"), false, "B's own me is untouched");

    const c = await srv.join({ cls: "wizard" });
    w.stop(); const w2 = watch([c]);
    await wait(500);
    assert.ok(c.state.players.get(c.sessionId).me, "C sees its own me");
    assert.equal(c.state.players.get(a.sessionId).me, undefined);
    assert.equal(c.state.players.get(b.sessionId).me, undefined);
    assert.equal(c.state.players.get(c.sessionId).me.quests.has("gloam"), false);

    await b.leave();
    const d = await srv.join({ cls: "wizard" });
    await wait(500);
    room.qset(sa, 0, { questId: 4, questStage: 0, questCount: 0 });
    await wait(300);
    assert.equal(aOwn.me.quests.get("gloam"), sa.quests.get("gloam"), "A still decodes after B left and D joined");
    assert.ok(d.state.players.get(d.sessionId).me);
    assert.equal(d.state.players.get(a.sessionId).me, undefined);
    w2.stop();
    assert.deepEqual([...w.errs, ...w2.errs], []);
    await a.leave(); await c.leave(); await d.leave();
  } finally { await srv.stop(); }
});

test("shared quest rules read the client's me; a hero whose me has not arrived is not done", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "wizard" });
    await wait(400);
    const own = a.state.players.get(a.sessionId);
    assert.equal(tutorialDone(own), false);
    const tut = chainState(own, TUT_CHAIN)!;
    // a hero spawning next to Elder Rowan clears step 1 at once
    assert.ok(tut.questStage === 1 || tut.questStage === 2, `step 1 or 2, got ${tut.questStage}`);
    assert.equal(tutorialDone({ me: undefined } as any), false, "me not arrived yet");
    assert.equal(tutorialDone(undefined), true);
    assert.equal(tutorialDone({} as any), true, "bare object without me counts as done");
    await a.leave();
  } finally { await srv.stop(); }
});

test("Player schema guard: at most 64 synced fields, no collection or child schema at index 63", () => {
  const md = (Player as any)[Symbol.metadata] as Record<string, any>;
  const fields = Object.keys(md).filter((k) => /^\d+$/.test(k)).map((k) => md[k]);
  assert.ok(fields.length > 0);
  assert.ok(fields.length <= 64, `Player has ${fields.length} synced fields (max 64)`);
  assert.ok(Math.max(...fields.map((f) => f.index)) <= 63, "indexes fit 6 bits");
  const at63 = fields.find((f) => f.index === 63);
  if (at63) assert.equal(typeof at63.type, "string", `field ${at63.name} at 63 must be a primitive`);
});

test("a late joiner decodes a full state near the worst case (guards the Encoder.BUFFER_SIZE workaround)", async () => {
  const srv = await startRoom();
  try {
    const host = await srv.join({ cls: "wizard" }); // the room exists once someone joined
    await wait(200);
    const room = srv.room;
    // 120 heavy heroes (full bag, many talents): a join full state of about 80 KB. If the buffer is too
    // small the per-view encode resizes and the late joiner's state comes out truncated (server/patchCopy.ts). Fails at
    // 64 KB, passes from 128 KB.
    for (let i = 0; i < 120; i++) {
      const p = new Player();
      p.name = `Heavy${i}`; p.cls = "wizard"; p.x = 2600 + i; p.y = 1800;
      for (let k = 0; k < 24; k++) p.bag.push(`w_frost`);
      for (let k = 0; k < 30; k++) p.talents.set(`t${k}`, 1);
      room.state.players.set(`heavy${i}`, p);
    }
    await wait(200);
    const c = await srv.join({ cls: "wizard" }), w = watch([c]);
    await wait(600);
    w.stop();
    assert.deepEqual(w.errs, [], "no decode errors");
    assert.equal(c.state.players.size, room.state.players.size, "every hero decoded");
    assert.equal(c.state.players.get("heavy119")?.bag.length, 24, "the last heavy hero arrived whole");
    assert.ok(c.state.players.get(c.sessionId)?.me?.quests, "own me arrived");
    await c.leave(); await host.leave();
  } finally { await srv.stop(); }
});

test("a quest key dropped on the server (progress back to 0) is removed on the owner's client", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(300);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    room.qset(p, 0, { questId: 2, questStage: 1, questCount: 3 });
    await wait(300);
    const own = () => c.state.players.get(c.sessionId).me;
    assert.ok(own().quests.has("gloam"), "set arrives");
    room.qset(p, 0, { questId: 0, questStage: 0, questCount: 0 });
    await wait(300);
    assert.equal(own().quests.has("gloam"), false, "delete arrives");
    await c.leave();
  } finally { await srv.stop(); }
});

const PRIVATE = ["kills", "xp", "gold", "potions", "mp", "energy", "stacks", "seq", "spd"] as const;

test("the nine owner-only numbers reach only the owner, under me, with the server's values", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "wizard" }), b = await srv.join({ cls: "wizard" });
    const w = watch([a, b]);
    await wait(400);
    const sa = srv.room.state.players.get(a.sessionId);
    sa.gold = 4321; sa.xp = 777; sa.kills = 12; sa.energy = 33; sa.stacks = 3; sa.potions = 258;
    await wait(500);
    const own = a.state.players.get(a.sessionId), seen = b.state.players.get(a.sessionId);
    assert.equal(seen.me, undefined, "B has no me for A");
    for (const k of PRIVATE) assert.equal((seen as any)[k], undefined, `B sees no Player.${k} for A`);
    for (const k of PRIVATE) assert.equal((own as any)[k], undefined, `A's Player has no ${k} either (it lives in me)`);
    for (const k of PRIVATE) {
      assert.equal(typeof (own.me as any)[k], "number", `me.${k} arrived`);
      // mp and energy drift every tick, so the client is always a patch behind: only check it is close
      if (k === "mp" || k === "energy") assert.ok(Math.abs((own.me as any)[k] - (sa as any)[k]) < 5, `me.${k} tracks the server`);
      else assert.equal((own.me as any)[k], (sa as any)[k], `me.${k} matches the server`);
    }
    assert.equal(own.me.gold, 4321); assert.equal(own.me.xp, 777); assert.equal(own.me.kills, 12);
    assert.equal(own.me.potions, 258);
    assert.ok(own.me.mp > 0, "mp arrived (wizard has mana)");
    assert.ok(own.me.spd > 0, "spd arrived");
    w.stop();
    assert.deepEqual(w.errs, []);
    await a.leave(); await b.leave();
  } finally { await srv.stop(); }
});

test("a seq-only change reaches the owner (me.onChange fires) and is invisible to other clients", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "wizard" }), b = await srv.join({ cls: "wizard" });
    const w = watch([a, b]);
    await wait(500);
    const sa = srv.room.state.players.get(a.sessionId);
    const own = a.state.players.get(a.sessionId), seen = b.state.players.get(a.sessionId);
    // settle: a stop input
    a.send("input", { up: false, down: false, left: false, right: false, seq: 100 });
    await wait(400);
    assert.equal(own.me.seq, 100);
    const pos = { x: sa.x, y: sa.y };
    let meChanges = 0, playerChanges = 0, bChanges = 0;
    const $a = getStateCallbacks(a) as any, $b = getStateCallbacks(b) as any;
    $a(own.me).onChange(() => meChanges++);
    $a(own).onChange(() => playerChanges++);
    $b(seen).onChange(() => bChanges++);
    a.send("input", { up: false, down: false, left: false, right: false, seq: 101 });
    await wait(400);
    assert.equal(sa.seq, 101, "server took the seq");
    assert.equal(sa.x, pos.x); assert.equal(sa.y, pos.y);
    assert.equal(own.me.seq, 101, "owner's me.seq updated");
    assert.ok(meChanges >= 1, "me onChange fired");
    assert.equal(playerChanges, 0, "Player onChange did not fire for a seq-only change (why the client also listens on me)");
    assert.equal(bChanges, 0, "B saw no change on A");
    assert.equal(seen.me, undefined);
    w.stop();
    assert.deepEqual(w.errs, []);
    await a.leave(); await b.leave();
  } finally { await srv.stop(); }
});

// 37 + cosm (public: every client draws titles and the beast trait) and 11 + flags (quest choices, owner-only)
test("schema sizes: Player has 38 synced fields, PlayerPrivate 12 (the owner-only move must not be undone)", () => {
  const count = (C: any) => Object.keys(C[Symbol.metadata]).filter((k) => /^\d+$/.test(k)).length;
  assert.equal(count(Player), 38);
  assert.equal(count(PlayerPrivate), 12);
  const md = (Player as any)[Symbol.metadata] as Record<string, any>;
  const names = Object.keys(md).filter((k) => /^\d+$/.test(k)).map((k) => md[k].name);
  for (const k of PRIVATE) assert.ok(!names.includes(k), `Player must not sync ${k}`);
});
