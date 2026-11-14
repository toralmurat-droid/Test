// Quest concept #9 (The Apprentice, WP7): the pure rules (bossesBeaten, isRecruit, mentor state, titles), and the room
// flow (server/apprentice.ts, server/titles.ts): the switch at Hale, kill credit for a recruit's own boss, the payout,
// the owned titles and the saves. Numbers are read from MENTOR, chains are looked up by id, no text is asserted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startRoom, wait } from "./helpers/room"; // first: sets SAVE_FILE / IDEAS_FILE to a temp dir
import { bossesBeaten, CHAINS, chainState, cleanMentor, isRecruit, MENTOR, mentorNext, mentorOffer, packQuest } from "../shared/quests";
import { cleanOwned, earnTitle, ownedTitles, packCosmetics, pickTitle, TITLES, unpackCosmetics } from "../shared/cosmetics";
import { META, metaOf } from "../shared/questSteps";
import { MOBS, mobScale, TILE } from "../shared/constants";
import { xpForLevel } from "../shared/classes";
import { npcById } from "../shared/npcs";
import { RUMOURS } from "../shared/rumours";
import { award } from "../server/titles";

const ci = (id: string) => CHAINS.findIndex((c) => c.id === id);
const HUNT = ci("hunt"), BONES = ci("bones"), MILL = ci("mill"), RED = ci("redfang");
const drag = CHAINS[HUNT].quests.find((q) => q.id === "dragmark")!, dragStep = drag.steps[0];
const dragIdx = CHAINS[HUNT].quests.indexOf(drag);
const tutDone = (p: any) => { p.quests.set("tut", packQuest(CHAINS[ci("tutorial")].quests.length, 0, 0)); };
const [T_MENTOR, T_CAPTAIN, T_WARDEN] = MENTOR.titles.map((t) => t.title);
const T_RUMOUR = TITLES.length - 1; // Rumour-Chaser: a title that is not a mentor title
const asc = (a: number[]) => [...a].sort((x, y) => x - y);
const shown = (p: any) => unpackCosmetics(metaOf(p, META.cosm)).title;

async function until(f: () => boolean, what: string, ms = 20_000) {
  const t0 = Date.now();
  while (!f()) { if (Date.now() - t0 > ms) assert.fail(`timed out waiting for: ${what}`); await wait(25); }
}

// ---------------------------------------------------------------- pure

test("bossesBeaten: only own-boss steps behind the hero count", () => {
  assert.equal(dragStep.own, true);
  assert.equal(bossesBeaten(undefined as any), 0);
  assert.equal(bossesBeaten({ level: 5, quests: {} } as any), 0);
  assert.equal(bossesBeaten({ level: 5, quests: { hunt: packQuest(dragIdx, 1, 0) } } as any), 0, "on the boss step: not beaten yet");
  assert.equal(bossesBeaten({ level: 5, quests: { hunt: packQuest(dragIdx, 2, 0) } } as any), 1, "past the boss step");
  assert.equal(bossesBeaten({ level: 5, quests: { hunt: packQuest(dragIdx + 1, 0, 0) } } as any), 1, "next quest");
  assert.equal(bossesBeaten({ level: 30, quests: { red: packQuest(CHAINS[RED].quests.length, 0, 0) } } as any), 1, "a finished Redfang chain");
  assert.equal(bossesBeaten({ level: 30, quests: { bone: packQuest(CHAINS[BONES].quests.length, 0, 0) } } as any), 0, "main-story bosses are not own");
  const two = { level: 10, quests: { mill: packQuest(CHAINS[MILL].quests.length, 0, 0), hunt: packQuest(CHAINS[HUNT].quests.length, 0, 0) } } as any;
  assert.ok(bossesBeaten(two) >= 2, "arcs add up");
});

test("isRecruit: the level gap is exactly MENTOR's, the veteran's minimum holds, a boss behind rules it out", () => {
  const fresh = { level: 5, quests: {} } as any;
  assert.ok(isRecruit({ level: 5 + MENTOR.gap } as any, fresh), "gap exactly MENTOR.gap");
  assert.ok(!isRecruit({ level: 5 + MENTOR.gap - 1 } as any, fresh), "one short");
  assert.ok(!isRecruit({ level: MENTOR.minLevel - 1 } as any, { level: 1, quests: {} } as any), "veteran below the minimum level");
  assert.ok(isRecruit({ level: MENTOR.minLevel } as any, { level: Math.max(1, MENTOR.minLevel - MENTOR.gap), quests: {} } as any), "veteran at the minimum");
  assert.ok(!isRecruit({ level: 30 } as any, { level: 5, quests: { hunt: packQuest(CHAINS[HUNT].quests.length, 0, 0) } } as any), "already beat a boss");
});

test("mentor state, offers and titles (pure)", () => {
  assert.equal(cleanMentor(undefined), undefined);
  assert.equal(cleanMentor("junk"), undefined);
  assert.deepEqual(cleanMentor({ on: "yes", n: -3, names: [1, "Bob", "bob", "x".repeat(41)] }), { on: false, n: 0, names: ["bob"] });
  assert.equal(cleanMentor({ names: Array.from({ length: 80 }, (_, i) => `n${i}`) })!.names.length, MENTOR.names);
  let n = 0;
  for (const t of MENTOR.titles) { assert.deepEqual(mentorNext(n), { at: t.at, title: t.title }); n = t.at; }
  assert.equal(mentorNext(n), undefined);
  assert.deepEqual(MENTOR.titles.map((t) => t.at), [1, 5, 15]);
  assert.equal(mentorOffer(MENTOR.minLevel - 1, false), undefined);
  assert.equal(mentorOffer(MENTOR.minLevel, false)!.send, true);
  assert.equal(mentorOffer(30, true)!.send, false);
  // titles: earning shows only when none shows; picking only owned; old saves own the shown one
  let e = earnTitle(0, 0, T_RUMOUR);
  assert.equal(unpackCosmetics(e.cosm).title, T_RUMOUR); assert.ok(e.fresh);
  e = earnTitle(e.cosm, e.owned, T_MENTOR);
  assert.equal(unpackCosmetics(e.cosm).title, T_RUMOUR, "a new title keeps the shown one");
  assert.deepEqual(ownedTitles(e.owned), asc([T_MENTOR, T_RUMOUR]));
  assert.equal(earnTitle(e.cosm, e.owned, T_MENTOR).fresh, false);
  assert.equal(pickTitle(e.cosm, e.owned, T_WARDEN), undefined);
  assert.equal(unpackCosmetics(pickTitle(e.cosm, e.owned, T_MENTOR)!).title, T_MENTOR);
  assert.equal(unpackCosmetics(pickTitle(e.cosm, e.owned, 0)!).title, 0);
  assert.equal(unpackCosmetics(pickTitle(packCosmetics({ title: T_RUMOUR, traits: 1 }), 1 << T_RUMOUR, 0)!).traits, 1, "picking keeps traits");
  assert.equal(cleanOwned(undefined, packCosmetics({ title: T_RUMOUR, traits: 0 })), 1 << T_RUMOUR, "old save: the shown title is owned");
  assert.equal(cleanOwned("x", 0), 0);
  assert.equal(cleanOwned(0xffffffff, 0), ((1 << TITLES.length) - 2) >>> 0, "unknown bits dropped");
});

// ---------------------------------------------------------------- room

type H = { c: any; p: any; id: string; msgs: any[] };
async function mk(srv: any, cls: string, level: number): Promise<H> {
  const c = await srv.join({ cls }), msgs: any[] = [];
  for (const k of ["mentor", "chat", "title", "sfx"]) c.onMessage(k, (m: any) => msgs.push(typeof m === "object" && m ? { ...m, T: k } : { v: m, T: k }));
  await until(() => !!srv.room?.state.players.get(c.sessionId), "joined");
  const p = srv.room.state.players.get(c.sessionId);
  tutDone(p); p.level = level; p.xp = xpForLevel(level); p.invulnUntil = 0;
  return { c, p, id: c.sessionId, msgs };
}
const hale = () => npcById(MENTOR.npc)!;
const byHale = (h: H) => { h.p.x = hale().x; h.p.y = hale().y + TILE; h.p.dead = false; };
const farFromHale = (h: H) => { h.p.x = hale().x + 20 * TILE; h.p.y = hale().y; };
const pots = (p: any) => p.pots.potion.reduce((a: number, b: number) => a + b, 0);
const sm = dragStep.summon!;

/** Helpers around the recruit's "Drag Mark" own boss (hunt arc). */
function boss(srv: any, R: H) {
  const room = srv.room;
  return {
    /** The recruit stands on the boss step (nothing beaten). */
    onBoss: () => R.p.quests.set("hunt", packQuest(dragIdx, 1, 0)),
    summon: () => room.summonFused(R.id, sm, HUNT) as string,
    kill: (by: string, mid: string) => { const m = room.state.mobs.get(mid); m.stunUntil = Date.now() + 60_000; room.hitTarget(by, mid, 1e9, [0, 0]); },
    /** The boss step is done (the quest moved on or the step advanced). */
    beaten: () => bossesBeaten(R.p) > 0,
    place: (h: H, dx = 0) => { h.p.x = sm.x + dx; h.p.y = sm.y + 2 * TILE; h.p.dead = false; h.p.hp = h.p.maxHp; },
    /** Remove foreign mobs near the spot (only our own are counted). */
    stray: () => { for (const [id, m] of [...room.state.mobs.entries()]) if (!m.owner && !m.summonFor && Math.hypot(m.x - sm.x, m.y - sm.y) < 30 * TILE) room.state.mobs.delete(id); },
  };
}
/** Send with a fresh "ask" bucket (the limit itself is checked in its own test). */
const tx = (srv: any, h: H, type: string, msg: unknown) => { srv.room.askBuckets.delete(h.id); h.c.send(type, msg); };
async function switchOn(srv: any, V: H) {
  byHale(V);
  await until(() => { tx(srv, V, "mentor", { on: true }); return V.p.mentor?.on === true; }, "mentoring on");
}

test("room: payout when the mentor kills the recruit's own boss", async () => {
  const srv = await startRoom();
  try {
    const V = await mk(srv, "wizard", 25), R = await mk(srv, "vampire", 5), room = srv.room;
    const B = boss(srv, R);
    await switchOn(srv, V);
    assert.deepEqual(V.p.mentor, { on: true, n: 0, names: [] });
    R.p.party = V.p.party = "pty";
    B.onBoss(); B.place(R); B.place(V, TILE); B.stray();
    assert.equal(B.beaten(), false);
    const g0 = R.p.gold, p0 = pots(R.p), vx0 = V.p.xp, rx0 = R.p.xp;
    const mid = B.summon(), mob = room.state.mobs.get(mid), def = MOBS[mob.kind as keyof typeof MOBS], lvl = mob.level;
    const kv = V.msgs.length, kr = R.msgs.length;
    B.kill(V.id, mid);
    await until(() => B.beaten(), "recruit advanced");
    assert.equal(R.p.gold - g0, MENTOR.gold, "exactly MENTOR.gold");
    assert.equal(pots(R.p) - p0, MENTOR.potions, "exactly MENTOR.potions");
    assert.equal(V.p.mentor.n, 1);
    assert.deepEqual(V.p.mentor.names, [R.p.name.toLowerCase()]);
    assert.equal(shown(V.p), T_MENTOR, "the first title is shown");
    assert.deepEqual(ownedTitles(V.p.titles), [T_MENTOR]);
    const killXp = Math.round(def.xp * mobScale(lvl, "xp"));
    assert.equal(V.p.xp - vx0, killXp, "mentor: only the normal kill XP");
    assert.equal(R.p.xp - rx0, killXp, "recruit: only the normal kill XP");
    await until(() => V.msgs.slice(kv).some((m) => m.T === "mentor" && m.n === 1 && m.recruit === R.p.name && m.title === TITLES[T_MENTOR]), "mentor message to the veteran");
    await until(() => V.msgs.slice(kv).some((m) => m.T === "chat") && R.msgs.slice(kr).some((m) => m.T === "chat"), "notes to both");
    await until(() => V.msgs.slice(kv).some((m) => m.T === "sfx") && R.msgs.slice(kr).some((m) => m.T === "sfx"), "sfx to both");
    // a boss behind them: no second payout
    const g1 = R.p.gold;
    room.apprentice.bossDown(R.id);
    assert.equal(R.p.gold, g1, "no second payout");
    assert.equal(V.p.mentor.n, 1);
  } finally { await srv.stop(); }
});

test("room: kill credit for a recruit's own boss", async () => {
  const srv = await startRoom();
  try {
    const V = await mk(srv, "wizard", 25), R = await mk(srv, "vampire", 5), S = await mk(srv, "wizard", 25), F = await mk(srv, "summoner", 25), room = srv.room;
    const B = boss(srv, R);
    await switchOn(srv, V);
    B.onBoss(); B.place(R); B.place(S, TILE); B.stray();
    // a stranger (not in the party): no credit
    let mid = B.summon(); B.kill(S.id, mid); await wait(400);
    assert.equal(B.beaten(), false, "stranger's kill does not count");
    // a party member in another zone: no credit
    R.p.party = V.p.party = F.p.party = "pty";
    room.unsummon(R.id, HUNT);
    mid = B.summon(); F.p.x = hale().x; F.p.y = hale().y; B.kill(F.id, mid); await wait(400);
    assert.equal(B.beaten(), false, "far-away party member's kill does not count");
    // ambushers of the matching kind (rumour tag, wrong-grave -1): never fill the own step, whoever kills them
    B.place(F, -TILE);
    for (const tag of [RUMOURS.tag, -1]) {
      room.unsummon(R.id);
      let a = room.summonFused(R.id, sm, tag); B.kill(F.id, a); await wait(400);
      assert.equal(B.beaten(), false, `ambusher ${tag} killed by a party member`);
      a = room.summonFused(R.id, sm, tag); B.kill(R.id, a); await wait(400);
      assert.equal(B.beaten(), false, `ambusher ${tag} killed by the recruit`);
    }
    // the recruit dead: no credit
    room.unsummon(R.id);
    mid = B.summon(); R.p.dead = true; B.kill(F.id, mid); await wait(400); R.p.dead = false;
    assert.equal(B.beaten(), false, "dead recruit: no credit");
    // a party member with mentoring off gives credit, no payout
    room.unsummon(R.id); F.p.x = hale().x; F.p.y = hale().y; B.place(V, TILE); V.p.mentor.on = false;
    const g2 = R.p.gold; mid = B.summon(); B.kill(V.id, mid);
    await until(() => B.beaten(), "credit with mentoring off");
    assert.equal(R.p.gold, g2, "no payout with mentoring off");
    assert.equal(V.p.mentor.n, 0);
    // the recruit's own kill with the mentor nearby pays
    V.p.mentor.on = true; B.onBoss(); room.unsummon(R.id);
    const g3 = R.p.gold; mid = B.summon(); B.kill(R.id, mid);
    await until(() => B.beaten(), "recruit's own kill");
    assert.equal(R.p.gold - g3, MENTOR.gold);
    assert.equal(V.p.mentor.n, 1);
    // the same account again (quest set back): paid, n stays 1
    B.onBoss(); room.unsummon(R.id);
    const g4 = R.p.gold; mid = B.summon(); B.kill(V.id, mid);
    await until(() => R.p.gold - g4 === MENTOR.gold, "paid again");
    assert.equal(V.p.mentor.n, 1, "same account name: n unchanged");
  } finally { await srv.stop(); }
});

test("room: titles at 1, 5 and 15 recruits keep the shown one; the names list is capped", async () => {
  const srv = await startRoom();
  try {
    const V = await mk(srv, "wizard", 25), R = await mk(srv, "vampire", 5), room = srv.room;
    const B = boss(srv, R);
    await switchOn(srv, V);
    R.p.party = V.p.party = "pty";
    const recruit = async (name: string) => {
      R.p.name = name; B.onBoss(); room.unsummon(R.id); B.place(R); B.place(V, TILE); B.stray();
      const n0 = V.p.mentor.n; B.kill(V.id, B.summon());
      await until(() => V.p.mentor.n === n0 + 1, `recruit ${name}`);
    };
    await recruit("First");
    assert.equal(shown(V.p), T_MENTOR);
    // the rumour award goes through the same helper and does not replace it
    assert.ok(award(V.p, T_RUMOUR)); assert.equal(shown(V.p), T_MENTOR);
    // show another one, then earn more: it stays
    await until(() => { tx(srv, V, "title", { i: T_RUMOUR }); return shown(V.p) === T_RUMOUR; }, "picked");
    V.p.mentor.n = MENTOR.titles[1].at - 1; V.p.mentor.names = ["a", "b", "c"];
    await recruit("Second");
    assert.equal(V.p.mentor.n, MENTOR.titles[1].at);
    assert.ok(ownedTitles(V.p.titles).includes(T_CAPTAIN)); assert.equal(shown(V.p), T_RUMOUR, "earning keeps the shown title");
    V.p.mentor.n = MENTOR.titles[2].at - 1; V.p.mentor.names = Array.from({ length: MENTOR.names }, (_, i) => `y${i}`);
    await recruit("Third");
    assert.equal(V.p.mentor.n, MENTOR.titles[2].at);
    assert.ok(ownedTitles(V.p.titles).includes(T_WARDEN)); assert.equal(shown(V.p), T_RUMOUR);
    assert.equal(V.p.mentor.names.length, MENTOR.names, "names capped");
    assert.equal(V.p.mentor.names.at(-1), "third"); assert.ok(!V.p.mentor.names.includes("y0"), "oldest dropped");
    assert.deepEqual(ownedTitles(V.p.titles), asc([T_MENTOR, T_CAPTAIN, T_WARDEN, T_RUMOUR]));
  } finally { await srv.stop(); }
});

test("room: the mentoring switch (Hale, level, bad payloads, rate limit)", async () => {
  const srv = await startRoom();
  try {
    const V = await mk(srv, "wizard", 25), L = await mk(srv, "summoner", 25), room = srv.room;
    const count = (h: H, k: number) => h.msgs.slice(k).filter((m) => m.T === "mentor").length;
    await until(() => V.msgs.some((m) => m.T === "mentor" && m.on === false && m.n === 0 && m.next?.at === MENTOR.titles[0].at), "state on join");
    // away from Hale: refused, state resent
    farFromHale(V); let k = V.msgs.length; tx(srv, V, "mentor", { on: true });
    await until(() => count(V, k) > 0, "reply far away");
    assert.equal(V.msgs.at(-1).on, false); assert.equal(V.p.mentor, undefined);
    // bad payloads: no reply, no change
    byHale(V); k = V.msgs.length;
    for (const bad of [{ on: 1 }, { on: "true" }, "on", 5, { on: null }]) tx(srv, V, "mentor", bad);
    await wait(500);
    assert.equal(count(V, k), 0, "bad payloads get no reply"); assert.equal(V.p.mentor, undefined);
    // below the minimum level
    byHale(L); L.p.level = MENTOR.minLevel - 1; k = L.msgs.length; tx(srv, L, "mentor", { on: true });
    await until(() => count(L, k) > 0, "low-level reply");
    assert.equal(L.msgs.at(-1).on, false); assert.equal(L.p.mentor, undefined);
    // on -> off -> on
    for (const on of [true, false, true]) {
      k = V.msgs.length; tx(srv, V, "mentor", { on });
      await until(() => V.msgs.slice(k).some((m) => m.T === "mentor" && m.on === on), `switch ${on}`);
      assert.equal(V.p.mentor.on, on);
    }
    // the ask bucket limits a burst
    room.askBuckets.delete(V.id); k = V.msgs.length;
    for (let i = 0; i < 30; i++) V.c.send("mentor", {});
    await wait(800);
    const n = count(V, k); assert.ok(n >= 1 && n < 30, `burst limited: ${n} replies of 30`);
  } finally { await srv.stop(); }
});

test("room: \"title\" accepts only owned titles and 0; awards never replace the shown one", async () => {
  const srv = await startRoom();
  try {
    const V = await mk(srv, "wizard", 25);
    award(V.p, T_MENTOR); award(V.p, T_CAPTAIN);
    assert.equal(shown(V.p), T_MENTOR);
    const ask = async (m: unknown) => { const k = V.msgs.length; tx(srv, V, "title", m); await until(() => V.msgs.slice(k).some((x) => x.T === "title"), "title reply"); return V.msgs.slice(k).find((x) => x.T === "title"); };
    let r = await ask({ i: T_CAPTAIN });
    assert.equal(r.i, T_CAPTAIN); assert.deepEqual(r.owned, asc([T_MENTOR, T_CAPTAIN])); assert.equal(shown(V.p), T_CAPTAIN);
    r = await ask({ i: T_WARDEN }); assert.equal(r.i, T_CAPTAIN, "not owned: unchanged");
    for (const bad of [{ i: "1" }, { i: 1.5 }, { i: -1 }, { i: 99 }, { i: null }, "x", null, 7, {}]) {
      r = await ask(bad); assert.equal(r.i, T_CAPTAIN, `garbage ${JSON.stringify(bad)}`);
    }
    assert.equal(shown(V.p), T_CAPTAIN);
    r = await ask({ i: 0 });
    assert.equal(r.i, 0); assert.equal(shown(V.p), 0); assert.deepEqual(ownedTitles(V.p.titles), asc([T_MENTOR, T_CAPTAIN]), "still owned");
    assert.ok(award(V.p, T_RUMOUR)); assert.equal(shown(V.p), T_RUMOUR, "shown when none shows");
    assert.ok(award(V.p, T_WARDEN)); assert.equal(shown(V.p), T_RUMOUR, "not replaced when one shows");
    assert.ok(!award(V.p, T_RUMOUR), "already owned: not fresh");
    assert.ok(!award(V.p, 0) && !award(V.p, 999), "invalid indices are not awarded");
  } finally { await srv.stop(); }
});

test("room: saves round-trip mentor and titles; old and junk saves load clean; leaving clears transient state", async () => {
  const srv = await startRoom();
  try {
    const V = await mk(srv, "wizard", 25), room = srv.room;
    V.p.mentor = { on: true, n: 6, names: ["a", "b"] };
    award(V.p, T_MENTOR); award(V.p, T_CAPTAIN);
    const snap = JSON.parse(JSON.stringify(room.snapshot(V.p)));
    assert.equal(snap.titles, V.p.titles); assert.deepEqual(snap.mentor, V.p.mentor);
    const P = room.state.players.get(V.id).constructor;
    const q = new P(); room.restore(q, snap);
    assert.deepEqual(q.mentor, V.p.mentor); assert.equal(q.titles, V.p.titles); assert.equal(metaOf(q, META.cosm), metaOf(V.p, META.cosm));
    // a save from before WP7: no mentor, no titles; the shown title counts as owned
    const old = { ...snap, cosm: packCosmetics({ title: T_RUMOUR, traits: 0 }) }; delete old.titles; delete old.mentor;
    const q2 = new P(); room.restore(q2, old);
    assert.equal(q2.mentor, undefined); assert.equal(q2.titles, 1 << T_RUMOUR);
    // junk loads clean
    for (const junk of ["junk", 5, [], { on: {}, n: "x", names: "y" }]) {
      const q3 = new P(); room.restore(q3, { ...old, mentor: junk, titles: "junk" });
      const m = q3.mentor;
      assert.ok(m === undefined || (m.on === false && m.n === 0 && m.names.length === 0), `junk ${JSON.stringify(junk)}`);
      assert.equal(q3.titles, 1 << T_RUMOUR);
    }
    // leaving clears the join timer (the state message is pending for a moment after joining)
    await V.c.leave(); await until(() => !room.state.players.get(V.id), "left");
    assert.equal(room.apprentice.fresh.has(V.id), false);
  } finally { await srv.stop(); }
});
