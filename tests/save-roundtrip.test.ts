// Golden save test: tests/fixtures/save-quests.json was captured from the code BEFORE the Player.quests restructure
// (snapshot() of heroes with progress in every chain). Saves must keep loading and writing the same keys forever.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CHAINS, TUT_CHAIN, chainState, packQuest } from "../shared/quests";
import { startRoom, wait } from "./helpers/room";

const fixture: Record<string, Record<string, unknown>> = JSON.parse(fs.readFileSync(new URL("./fixtures/save-quests.json", import.meta.url), "utf8"));
const chainKeys = CHAINS.flatMap((ch) => [...ch.keys, ch.verKey]);
// Compare only the keys the fixture holds: a chain added later is not in the fixture, and the fixture must never be
// regenerated from new code (that would defeat the point of a golden test).
const pick = (s: Record<string, unknown>, from: Record<string, unknown>) =>
  Object.fromEntries(chainKeys.filter((k) => k in from).map((k) => [k, s[k]]));

test("save fixture holds the Gloam, the packed story chains and at least two zone arcs", () => {
  for (const save of Object.values(fixture)) {
    for (const k of ["questId", "questStage", "questCount", "questVer", "boneId", "redId", "tutId", "crownId", "beastId", "sunId"])
      assert.equal(typeof save[k], "number", `fixture has ${k}`);
    const arcs = CHAINS.filter((c) => c.local && typeof save[c.keys[0]] === "number");
    assert.ok(arcs.length >= 2, "fixture has at least two zone arcs");
  }
});

for (const name of Object.keys(fixture)) {
  test(`save round trip (${name}): restore then snapshot gives the same chain keys, the client sees the packed map`, async () => {
    const srv = await startRoom();
    try {
      const c = await srv.join({ cls: "wizard" });
      await wait(300);
      const room = srv.room, p = room.state.players.get(c.sessionId), save = fixture[name];
      room.restore(p, structuredClone(save));
      assert.deepEqual(pick(room.snapshot(p), save), pick(save, save), "same chain keys and values");
      await wait(300);
      const own = c.state.players.get(c.sessionId).me; // owner-only child schema (server/player.ts PlayerPrivate)
      for (const ch of CHAINS) {
        const [a, b, n] = ch.keys, want = a in save ? packQuest(save[a] as number, save[b] as number, save[n] as number) : 0;
        assert.equal(own.quests.get(ch.packed) ?? 0, want, `client sees ${ch.packed}`);
        assert.equal(p.quests.has(ch.packed), want !== 0, `${ch.packed} key present only when non-zero`);
      }
      await c.leave();
    } finally { await srv.stop(); }
  });
}

test("save round trip: tutorial state is distinct between the two fixtures", () => {
  assert.equal(fixture.tutDone.tutId, CHAINS[TUT_CHAIN].quests.length);
  assert.equal(fixture.tutDone.tutStage, 0);
  assert.ok((fixture.tutInProgress.tutStage as number) > 0);
});

test("saves: no tutVer counts the tutorial as done; new hero starts First Steps on step 1; progress 0 removes the key", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(300);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    // a brand-new hero: First Steps step 1, nothing else
    assert.deepEqual([...p.quests.keys()], ["tut"]);
    // First Steps starts on step 1 ("walk to Elder Rowan"); a hero that spawns next to Rowan clears it before we look
    const tut = chainState(p, TUT_CHAIN)!;
    assert.equal(tut.questId, 0);
    assert.ok(tut.questStage === 1 || tut.questStage === 2, `new hero on step 1 or 2, got ${tut.questStage}`);
    // an old save without tutVer
    const old = structuredClone(fixture.tutInProgress) as Record<string, unknown>;
    for (const k of ["tutId", "tutStage", "tutCount", "tutVer"]) delete old[k];
    room.restore(p, old);
    assert.equal(p.quests.get("tut"), packQuest(CHAINS[TUT_CHAIN].quests.length, 0, 0), "tutorial counts as done");
    assert.equal(room.snapshot(p).tutId, CHAINS[TUT_CHAIN].quests.length);
    // a very old save with no chain keys at all: no quest keys but the done tutorial
    room.restore(p, { color: 1, level: 1 });
    assert.deepEqual([...p.quests.keys()], ["tut"]);
    // progress 0 removes the key
    room.qset(p, 0, { questId: 3, questStage: 1, questCount: 2 });
    assert.equal(p.quests.get("gloam"), packQuest(3, 1, 2));
    room.qset(p, 0, { questId: 0, questStage: 0, questCount: 0 });
    assert.equal(p.quests.has("gloam"), false);
    assert.equal(room.snapshot(p).questId, 0);
    await c.leave();
  } finally { await srv.stop(); }
});

test("restore clamps corrupt chain values to whole numbers in range instead of spilling them into other fields", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard" });
    await wait(300);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    const save = { ...structuredClone(Object.values(fixture)[0]), questId: 1, questStage: -1, questCount: 150.5 };
    room.restore(p, save);
    const s = room.snapshot(p);
    assert.deepEqual([s.questId, s.questStage, s.questCount], [1, 0, 99], "negative stage = not accepted; values only clamp, never spill");
    room.restore(p, { ...save, questStage: 2.7, questCount: 150 });
    const t = room.snapshot(p);
    assert.deepEqual([t.questId, t.questStage, t.questCount], [1, 2, 99]);
    await c.leave();
  } finally { await srv.stop(); }
});

// ---- Songweaver kit migration v1 (server/songs.ts migrateSongweaver, DI-3) ------------------------------------------

test("Songweaver kit v1: the old shield moves to the bag, else the stash, else it is sold; the Songbook takes the slot", async () => {
  const { SW_KIT_VERSION, migrateSongweaver } = await import("../server/songs");
  const { loadStash, login, saveStash } = await import("../server/accounts");
  const { sellPrice } = await import("../shared/shops");
  const { BAG_SIZE } = await import("../shared/gear");
  const pots = { potion: [0, 0, 0], mpotion: [0, 0, 0] } as any;
  const open = { put: () => true, take: () => undefined };
  // pure: other classes and up-to-date saves are left alone
  const keep = { shield: "sh_iron", bag: [] as string[] };
  assert.deepEqual(migrateSongweaver({ cls: "wizard", level: 1, gold: 0, pots }, keep, open), []);
  assert.equal(keep.shield, "sh_iron");
  const done = { shield: "sh_wood", bag: [], swKit: SW_KIT_VERSION };
  assert.deepEqual(migrateSongweaver({ cls: "songweaver", level: 1, gold: 0, pots }, done, open), []);
  assert.equal(done.shield, "sh_wood", "an already migrated save keeps what she chose since");
  // no shield at all: just the Songbook
  const bare: Record<string, unknown> = { bag: ["a_leather"] };
  assert.deepEqual(migrateSongweaver({ cls: "songweaver", level: 1, gold: 0, pots }, bare, open), []);
  assert.deepEqual([bare.shield, bare.bag, bare.swKit], ["songweaver_shield", ["a_leather"], SW_KIT_VERSION]);

  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "songweaver" });
    await wait(300);
    const room = srv.room, p = room.state.players.get(c.sessionId), base = room.snapshot(p);
    delete base.swKit;
    await login(p.name, "testpass1", "127.0.0.1"); // test rooms skip onAuth: the stash needs an account
    // 1. room in the bag
    let { moved } = room.restore(p, { ...structuredClone(base), shield: "sh_iron", bag: ["a_leather"] });
    assert.equal(p.shield, "songweaver_shield");
    assert.deepEqual([...p.bag], ["a_leather", "sh_iron"], "in the bag");
    assert.equal(moved.length, 1);
    assert.match(moved[0], /bag/);
    assert.equal(room.snapshot(p).swKit, SW_KIT_VERSION, "written back");
    // 2. a full bag: the stash
    const full = Array.from({ length: BAG_SIZE }, () => "a_leather");
    let r = room.restore(p, { ...structuredClone(base), shield: "sh_wood", bag: full });
    room.writeLoaded(p, r); moved = r.moved; // onJoin writes the stash with the hero
    assert.equal(p.shield, "songweaver_shield");
    assert.ok(loadStash(p.name).items.includes("sh_wood"), "in the stash");
    assert.match(moved[0], /stash/);
    // 3. bag and stash full: sold at sellPrice
    saveStash(p.name, { items: Array.from({ length: 24 }, () => "a_leather"), gold: 0 }, p.cls, room.snapshot(p));
    const gold = 123;
    ({ moved } = room.restore(p, { ...structuredClone(base), gold, shield: "sh_dragon", bag: full }));
    assert.equal(p.gold, gold + sellPrice("sh_dragon"));
    assert.match(moved[0], /sold for \d+ gold/);
    assert.equal(p.shield, "songweaver_shield");
    // 4. the migrated save loads as is: no second migration; a shield she wears anyway goes to the bag (DI-5 rule)
    ({ moved } = room.restore(p, { ...room.snapshot(p), shield: "sh_wood", bag: [] }));
    assert.equal(moved.length, 2, "the shield to the bag, the Songbook back (no book anywhere)");
    assert.equal(p.shield, "songweaver_shield");
    assert.ok([...p.bag].includes("sh_wood"), "not deleted: in the bag");
    await c.leave();
  } finally { await srv.stop(); }
});

test("Songweaver kit v1 on join: an old save gets the Songbook and is told where its shield went", async () => {
  const { login, saveHero } = await import("../server/accounts");
  const srv = await startRoom();
  try {
    const name = `Kit${process.pid % 1000}x${Date.now() % 1000}`;
    await login(name, "testpass1", "127.0.0.1");
    const c = await srv.join({ cls: "songweaver" });
    await wait(300);
    const room = srv.room, old = room.snapshot(room.state.players.get(c.sessionId));
    delete old.swKit; old.shield = "sh_iron"; old.bag = [];
    saveHero(name, "songweaver", old);
    // join as that account (test rooms skip onAuth, so hand onJoin the auth it would get)
    const lines: string[] = [];
    const fake = { sessionId: "kitfake", send: (type: string, m: { text?: string }) => { if (type === "chat" && m?.text) lines.push(m.text); } };
    room.onJoin(fake, { cls: "songweaver" }, { name });
    try {
      const p = room.state.players.get("kitfake");
      assert.equal(p.shield, "songweaver_shield");
      assert.ok([...p.bag].includes("sh_iron"));
      assert.ok(lines.some((t) => /Iron Shield/.test(t) && /bag/.test(t)), `told: ${lines.join(" | ")}`);
    } finally { room.state.players.delete("kitfake"); }
    await c.leave();
  } finally { await srv.stop(); }
});
