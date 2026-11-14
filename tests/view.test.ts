// Owner-only data (Player.me, @view()) reaches only the hero's own client; the shared quest rules read it there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chainState, tutorialDone, TUT_CHAIN } from "../shared/quests";
import { getStateCallbacks } from "colyseus.js";
import { Player, PlayerPrivate } from "../server/player";
import { classSkills, skillOf } from "../shared/skills";
import { Item } from "../server/TownRoom";
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
    // Only public data weighs on a join now (bag, talents and slots live in the owner-only me): 60 heroes and 1450
    // ground items make a join full state of about 80 KB. If the buffer is too small the per-view encode resizes and
    // the late joiner's state comes out truncated (server/patchCopy.ts). Fails at 64 KB, passes from 128 KB.
    for (let i = 0; i < 60; i++) {
      const p = new Player();
      p.name = `Heavy${i}`; p.cls = "wizard"; p.x = 2600 + i; p.y = 1800; p.weapon = "w_frost"; p.armour = "a_frost"; p.fx = "burn,mark,aura";
      room.state.players.set(`heavy${i}`, p);
    }
    const FAR = Date.now() + 3_600_000;
    for (let i = 0; i < 1450; i++) {
      const it = new Item();
      it.kind = "gear"; it.gear = "w_frost"; it.amount = 1000 + i; it.x = 2000 + (i % 90) * 7.5; it.y = 1500 + Math.floor(i / 90) * 7.5; it.expires = FAR;
      room.state.items.set(`far${i}`, it);
    }
    await wait(200);
    // measure the join full state the server encodes for the late joiner
    const enc = (room as any)._serializer.encoder, sizes: number[] = [], orig = enc.encodeAllView;
    enc.encodeAllView = function (...a: unknown[]) { const out = orig.apply(this, a); sizes.push(out.length); return out; };
    const c = await srv.join({ cls: "wizard" }), w = watch([c]);
    await wait(800);
    enc.encodeAllView = orig;
    w.stop();
    const joinBytes = Math.max(0, ...sizes);
    console.error(`late joiner full state: ${joinBytes} bytes`);
    assert.ok(joinBytes > 60 * 1024, `the join state is heavy enough to matter (${joinBytes} bytes)`);
    assert.deepEqual(w.errs, [], "no decode errors");
    assert.equal(c.state.players.size, room.state.players.size, "every hero decoded");
    assert.equal(c.state.items.size, room.state.items.size, "every ground item decoded");
    assert.equal(c.state.items.get("far1449")?.amount, 2449, "the last ground item arrived whole");
    assert.equal(c.state.players.get("heavy59")?.name, "Heavy59", "the last heavy hero arrived whole");
    assert.equal(c.state.players.get("heavy59")?.me, undefined, "other heroes' me is not sent");
    assert.ok(c.state.players.get(c.sessionId)?.me?.quests, "own me arrived");
    assert.equal(c.state.players.get(c.sessionId)?.me.slots.length, 10, "own slots arrived");
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

// 30 + cosm (public: every client draws titles and the beast trait) and 18 + flags (quest choices, owner-only)
test("schema sizes: Player has 31 synced fields, PlayerPrivate 19 (the owner-only move must not be undone)", () => {
  const count = (C: any) => Object.keys(C[Symbol.metadata]).filter((k) => /^\d+$/.test(k)).length;
  assert.equal(count(Player), 31);
  assert.equal(count(PlayerPrivate), 19);
  const md = (Player as any)[Symbol.metadata] as Record<string, any>;
  const names = Object.keys(md).filter((k) => /^\d+$/.test(k)).map((k) => md[k].name);
  for (const k of [...PRIVATE, ...MOVED]) assert.ok(!names.includes(k), `Player must not sync ${k}`);
  const pm = (PlayerPrivate as any)[Symbol.metadata] as Record<string, any>;
  const pnames = Object.keys(pm).filter((k) => /^\d+$/.test(k)).map((k) => pm[k].name);
  for (const k of MOVED) assert.ok(pnames.includes(k), `PlayerPrivate syncs ${k}`);
});

const MOVED = ["ptSta", "ptStr", "ptMag", "ptDex", "bag", "talents", "slots"] as const;
const mapObj = (m: any) => Object.fromEntries([...m.entries()].sort());
const arr = (a: any) => [...a];

/** Learns the first `n` wizard skills in tree order (parents first) through the real "learn" message. */
async function learnSome(c: any, room: any, n: number) {
  const p = room.state.players.get(c.sessionId);
  p.level = 30;
  const ids = classSkills("wizard").slice(0, n).map((s) => s.id);
  for (const id of ids) { c.send("learn", id); await wait(30); }
  await wait(150);
  return ids;
}

test("the seven moved fields (stat points, bag, talents, slots) reach only the owner, under me, with the server's values", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "wizard" }), b = await srv.join({ cls: "wizard" });
    const w = watch([a, b]);
    await wait(400);
    const room = srv.room, sa = room.state.players.get(a.sessionId);
    const ids = await learnSome(a, room, 4); // learn sets the parents first, so cleanRanks keeps them
    assert.ok(sa.talents.size >= 2, "the server learned talents");
    const active = ids.find((id) => !skillOf("wizard", id)?.passive)!;
    a.send("assign", { slot: 5, skill: active });
    a.send("stat", "mag"); a.send("stat", "sta"); a.send("stat", "mag");
    await wait(100);
    sa.bag.push("w_frost"); sa.bag.push("w_frost");
    await wait(500);
    assert.equal(sa.slots.at(5), active, "server assigned the slot");
    assert.equal(sa.ptMag, 2); assert.equal(sa.ptSta, 1);
    const own = a.state.players.get(a.sessionId), seen = b.state.players.get(a.sessionId);
    assert.equal(seen.me, undefined, "B has no me for A");
    for (const k of MOVED) assert.equal((seen as any)[k], undefined, `B sees no Player.${k} for A`);
    for (const k of MOVED) assert.equal((own as any)[k], undefined, `A's Player has no ${k} either (it lives in me)`);
    assert.equal(own.me.ptMag, 2); assert.equal(own.me.ptSta, 1); assert.equal(own.me.ptStr, 0); assert.equal(own.me.ptDex, 0);
    assert.deepEqual(arr(own.me.bag), arr(sa.bag));
    assert.deepEqual(arr(own.me.slots), arr(sa.slots));
    assert.equal(own.me.slots.at(5), active);
    assert.deepEqual(mapObj(own.me.talents), mapObj(sa.talents));
    assert.ok(own.me.talents.size >= 2);
    w.stop();
    assert.deepEqual(w.errs, []);
    await a.leave(); await b.leave();
  } finally { await srv.stop(); }
});

test("in-place bag rewrites reach the owner: equip, unequip, two rewrites in one tick, clear and refill", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "wizard" }), b = await srv.join({ cls: "wizard" });
    const w = watch([a, b]);
    await wait(400);
    const room = srv.room, sa = room.state.players.get(a.sessionId);
    sa.level = 10;
    const same = async (what: string) => {
      await wait(350);
      assert.deepEqual(arr(a.state.players.get(a.sessionId).me.bag), arr(sa.bag), what);
      assert.equal(b.state.players.get(a.sessionId).me, undefined, "B still has no me for A");
    };
    sa.bag.push("w_frost"); sa.bag.push("w_frost");
    await same("pushed items");
    a.send("equip", 0);
    await same("after the equip message");
    assert.equal(sa.weapon, "w_frost", "equipped");
    a.send("unequip", "weapon");
    await same("after the unequip message");
    assert.equal(sa.weapon, "");
    // two real rewrites back to back (they land in the same patch), then two raw rewrites in one tick
    a.send("equip", 0); a.send("unequip", "weapon");
    await same("equip and unequip back to back");
    assert.equal(sa.weapon, "");
    a.send("equip", 0); a.send("unequip", "weapon"); a.send("equip", 0);
    await same("equip, unequip, equip back to back");
    assert.notEqual(sa.weapon, "", "something is worn");
    sa.weapon = "";
    sa.bag.clear(); for (const k of ["w_frost", "w_frost", "w_frost"]) sa.bag.push(k);
    sa.bag.clear(); for (const k of ["w_frost", "w_frost"]) sa.bag.push(k);
    await same("two clear+push rewrites in one tick");
    assert.equal(a.state.players.get(a.sessionId).me.bag.length, 2);
    // clear to empty, then (later) refill
    sa.bag.clear();
    await same("cleared to empty");
    assert.equal(a.state.players.get(a.sessionId).me.bag.length, 0);
    sa.bag.push("w_frost"); sa.bag.push("w_frost"); sa.bag.push("w_frost");
    await same("refilled");
    assert.equal(a.state.players.get(a.sessionId).me.bag.length, 3);
    // clear and refill within one tick
    sa.bag.clear(); sa.bag.push("w_frost");
    await same("clear and refill in one tick");
    w.stop();
    assert.deepEqual(w.errs, []);
    await a.leave(); await b.leave();
  } finally { await srv.stop(); }
});

test("a talents respec reaches the owner, also when they learn again in the same tick", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join({ cls: "wizard" }), b = await srv.join({ cls: "wizard" });
    const w = watch([a, b]);
    await wait(400);
    const room = srv.room, sa = room.state.players.get(a.sessionId);
    const ids = await learnSome(a, room, 3);
    sa.gold = 1_000_000; sa.lastHurt = 0;
    const same = async (what: string) => {
      await wait(400);
      assert.deepEqual(mapObj(a.state.players.get(a.sessionId).me.talents), mapObj(sa.talents), what);
      assert.deepEqual(arr(a.state.players.get(a.sessionId).me.slots), arr(sa.slots), `${what} (slots)`);
    };
    await same("after learning");
    assert.ok(sa.talents.size > 0);
    a.send("respec");
    await same("after respec");
    assert.equal(sa.talents.size, 0, "server respecced");
    assert.equal(a.state.players.get(a.sessionId).me.talents.size, 0);
    // respec and relearn in one tick: one patch holds the clear and the sets
    sa.talents.clear();
    for (const id of ids) sa.talents.set(id, 1);
    sa.talents.clear();
    sa.talents.set(ids[0], 1);
    await same("clear + set in one tick");
    assert.equal(a.state.players.get(a.sessionId).me.talents.size, 1);
    // the real messages back to back: learn, respec and learn again land in the same patch
    a.send("learn", ids[0]); a.send("respec"); a.send("learn", ids[0]);
    await same("learn, respec, learn back to back");
    assert.ok(sa.talents.size <= 1);
    a.send("learn", ids[1]);
    await same("learn after respec");
    w.stop();
    assert.deepEqual(w.errs, []);
    await a.leave(); await b.leave();
  } finally { await srv.stop(); }
});
