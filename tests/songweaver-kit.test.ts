// The Songweaver's kit after the DI review: a lost lute or Songbook comes back on load (refillKit), the v2 migration
// takes a stashed lute instead of making a second one, a spare bound item can leave her (keepsBound), and a load that
// changed the save is written back after she has a position (the act and the gold of a sold item are kept).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { keepsBound, keepsBoundOf, isLute, starterKit, BAG_SIZE } from "../shared/gear";
import { offerFrom, STASH } from "../shared/trade";
import { breakYield } from "../shared/lutemaker";
import { shopBuys, sellPrice, SHOPS } from "../shared/shops";
import { CHAINS } from "../shared/quests";
import { npcById } from "../shared/npcs";
import { LazyStash, migrateSongweaver, refillKit, SW_KIT_VERSION } from "../server/songs";
import { startRoom, wait } from "./helpers/room";

const pots = { potion: [0, 0, 0], mpotion: [0, 0, 0] } as any;
const LUTE = "songweaver_weapon", BOOK = "songweaver_shield";

let shared: ReturnType<typeof startRoom> | undefined;
const server = () => (shared ??= startRoom());
after(async () => { if (shared) await (await shared).stop(); });

let seq = 0;
/** A fresh account with a Songweaver save made from a live hero's snapshot, changed by `edit`. */
async function account(edit: (s: any) => void, stash?: string[]) {
  const { login, saveHero, saveStash } = await import("../server/accounts");
  const srv = await server();
  const name = `Kit${process.pid % 1000}y${++seq}`;
  await login(name, "testpass1", "127.0.0.1"); // test rooms skip onAuth: the account must exist
  const c = await srv.join({ cls: "songweaver" });
  await wait(200);
  const room = srv.room, save = structuredClone(room.snapshot(room.state.players.get(c.sessionId)));
  await c.leave();
  edit(save);
  saveHero(name, "songweaver", save);
  if (stash) saveStash(name, { items: stash, gold: 0 }, "songweaver", save);
  return { room, name, save };
}
/** onJoin as that account through a fake client (what onAuth would hand it); returns the hero and her chat lines. */
function join(room: any, name: string) {
  const sid = `kit${++seq}`, lines: string[] = [], got: Record<string, any[]> = {};
  const client = { sessionId: sid, send: (type: string, m: any) => { (got[type] ??= []).push(m); if (type === "chat" && m?.text) lines.push(m.text); } };
  room.onJoin(client, { cls: "songweaver" }, { name });
  return { client, p: room.state.players.get(sid), lines, got, done: () => room.state.players.delete(sid) };
}

// ---- 1. a lost lute or Songbook comes back ------------------------------------------------------------------------

test("refillKit (pure): no lute or book anywhere gives the starter ones back at her level; one in the bag or stash is enough", () => {
  const kit = starterKit("songweaver");
  let p = { cls: "songweaver", level: 14, weapon: "", shield: "" };
  assert.equal(refillKit(p, [], []).length, 2);
  assert.deepEqual([p.weapon, p.shield], [`${kit.weapon}@14`, kit.shield]);
  p = { cls: "songweaver", level: 14, weapon: "", shield: "" };
  assert.deepEqual(refillKit(p, ["songweaver_weapon@3#gut"], ["bk_hymnal"]), [], "a lute in the bag, a book in the stash");
  assert.deepEqual([p.weapon, p.shield], ["", ""], "she fetches them herself");
  p = { cls: "songweaver", level: 14, weapon: "", shield: "" };
  refillKit(p, [], ["songweaver_weapon@9"]);
  assert.equal(p.weapon, "", "a stashed lute is not doubled");
  assert.equal(p.shield, BOOK);
  const k = { cls: "wizard", level: 5, weapon: "", shield: "" };
  assert.deepEqual(refillKit(k, [], []), []);
  assert.equal(k.weapon, "");
});

test("room: a lute whose id no longer checks out is replaced on load, at her level; a stashed lute stops that", async () => {
  // "#zzz" is no trait: isGearId rejects the id, so restore's gear filter drops it
  let a = await account((s) => { s.level = 9; s.weapon = `${LUTE}@9#zzz`; s.bag = []; });
  let j = join(a.room, a.name);
  try {
    assert.equal(j.p.weapon, `${LUTE}@9`, "a new lute in her hands");
    assert.ok(j.lines.some((t) => /lute was lost/.test(t)), j.lines.join(" | "));
  } finally { j.done(); }
  a = await account((s) => { s.level = 9; s.weapon = `${LUTE}@9#zzz`; s.bag = []; }, [`${LUTE}@4#gut`]);
  j = join(a.room, a.name);
  try { assert.equal(j.p.weapon, "", "her lute waits in the stash: no second one"); } finally { j.done(); }
});

// ---- 2. bound duplicates ---------------------------------------------------------------------------------------------

test("migration v2 takes her stashed lute (traits kept) instead of making a second one", () => {
  const items = ["a_leather", `${LUTE}@4#gut`];
  const st = new LazyStash(() => ({ items, gold: 0 }));
  const s: Record<string, unknown> = { weapon: "w_frost", shield: BOOK, bag: [], swKit: 1 };
  const notes = migrateSongweaver({ cls: "songweaver", level: 12, gold: 0, pots }, s, st);
  assert.equal(s.weapon, `${LUTE}@12#gut`);
  assert.deepEqual(st.loaded!.items, ["a_leather"], "out of the stash");
  assert.deepEqual(s.bag, ["w_frost"]);
  assert.ok(notes.some((t) => /stash into your hands/.test(t)));
  assert.equal(s.swKit, SW_KIT_VERSION);
});

test("room: a v1 save with her lute in the stash gets it back from there, and the stash is written with her", async () => {
  const { loadStash, loadHero } = await import("../server/accounts");
  const a = await account((s) => { s.swKit = 1; s.level = 7; s.weapon = "w_bronze"; s.bag = []; }, [`${LUTE}@2#gut`]);
  const j = join(a.room, a.name);
  try {
    assert.equal(j.p.weapon, `${LUTE}@7#gut`);
    assert.ok(!loadStash(a.name).items.some(isLute), "no lute left in the stash");
    assert.ok(![...j.p.bag].some((v: string) => isLute(v)), "and none in the bag: exactly one lute");
    assert.equal(loadHero(a.name, "songweaver")!.weapon, `${LUTE}@7#gut`, "hero written with the stash");
  } finally { j.done(); }
});

test("keepsBound: only a Songweaver's last lute or Songbook stays; a spare, or another class's copy, may go", () => {
  const spare = `${LUTE}@3`;
  assert.equal(keepsBound("songweaver", spare, [`${LUTE}@9`, BOOK, spare]), false, "she wears another lute");
  assert.equal(keepsBound("songweaver", spare, ["", BOOK, spare]), true, "her only lute");
  assert.equal(keepsBound("songweaver", BOOK, [`${LUTE}@9`, "", BOOK, BOOK]), false, "a second Songbook");
  assert.equal(keepsBound("songweaver", BOOK, [`${LUTE}@9`, "bk_hymnal", BOOK]), true, "another book is not a Songbook");
  assert.equal(keepsBound("wizard", spare, ["", "", spare]), false, "not hers to keep");
  assert.equal(keepsBound("songweaver", "w_frost", ["w_frost"]), false, "not bound");
  // one after another: two spares in the bag, none worn: one may leave, not both
  const keep = keepsBoundOf("songweaver", ["", BOOK], [spare, `${LUTE}@5`]);
  assert.deepEqual(offerFrom([spare, `${LUTE}@5`], 0, [0, 1], 0, keep).items, [spare]);
  assert.deepEqual(offerFrom([spare], 0, [0], 0).items, [], "default: every bound item stays");
  // sold and broken as spares
  const wren = SHOPS.lutemaker;
  assert.equal(shopBuys(wren, spare), false);
  assert.equal(shopBuys(wren, spare, true), true);
  assert.equal(breakYield(spare), undefined);
  assert.equal(breakYield(spare, true)?.mat, "tonewood");
});

test("room: a spare lute can be stashed, sold and dropped; her last one can't", async () => {
  const { loadStash } = await import("../server/accounts");
  const a = await account((s) => { s.level = 5; s.weapon = `${LUTE}@5`; s.bag = [`${LUTE}@2`, `${LUTE}@4`]; });
  const j = join(a.room, a.name), room = a.room, p = j.p;
  try {
    assert.deepEqual([...p.bag], [`${LUTE}@5`, `${LUTE}@5`], "levelled on load");
    p.x = STASH.x; p.y = STASH.y;
    room.stashMove(j.client, "put", 0);
    assert.equal(loadStash(a.name).items.filter(isLute).length, 1, "a spare goes into the stash");
    assert.equal(p.bag.length, 1);
    // sold at Wren's while she wears another
    const wren = npcById("lutemaker")!;
    p.x = wren.x; p.y = wren.y + 20;
    const gold = p.gold;
    room.shopSell(j.client, 0);
    assert.equal(p.gold, gold + sellPrice(`${LUTE}@5`));
    assert.equal(p.bag.length, 0);
    // her last lute: put in the bag, the hands empty, then refused everywhere
    p.bag.push(p.weapon); p.weapon = "";
    room.shopSell(j.client, 0);
    room.dropGear(j.client.sessionId, 0);
    room.dropGears(j.client.sessionId, [0]);
    p.x = STASH.x; p.y = STASH.y;
    room.stashMove(j.client, "put", 0);
    assert.deepEqual([...p.bag], [`${LUTE}@5`], "still hers");
    // two in the bag, none worn: the batch drop lets one go, never both
    p.bag.push(`${LUTE}@5`);
    room.dropGears(j.client.sessionId, [0, 1]);
    assert.equal(p.bag.length, 1);
  } finally { j.done(); }
});

// ---- 3 and 4. the load is written back, after the position ----------------------------------------------------------

test("room: a migration that sold her sword writes the gold, and the save keeps act 2", async () => {
  const { loadHero, loadStash } = await import("../server/accounts");
  const full = Array.from({ length: BAG_SIZE }, () => "a_leather");
  let old: any;
  const a = await account((s) => {
    s.swKit = 1; s.level = 30; s.weapon = "w_dragon"; s.bag = full; s.gold = 50; s.act = 2;
    for (const id of ["crown", "beast"]) { const ch = CHAINS.find((c) => c.id === id)!; s[ch.keys[0]] = ch.quests.length; s[ch.keys[1]] = 0; }
    old = s;
  }, Array.from({ length: 24 }, () => "a_leather"));
  const j = join(a.room, a.name);
  try {
    assert.equal(j.p.gold, 50 + sellPrice("w_dragon"));
    assert.ok(j.lines.some((t) => /sold for/.test(t)));
    const saved = loadHero(a.name, "songweaver")!;
    assert.notEqual(saved, old, "written back (a fresh snapshot replaced the loaded save)");
    assert.equal(saved.gold, 50 + sellPrice("w_dragon"), "the gold is in the save");
    assert.equal(saved.act, 2, "saved where she stands: Kel Ashar, not the origin");
    assert.equal(loadStash(a.name).items.length, 24);
  } finally { j.done(); }
});

test("room: a migration that only moved an item to the bag writes the hero too; an up-to-date save is not rewritten", async () => {
  const { loadHero } = await import("../server/accounts");
  let old: any;
  let a = await account((s) => { s.swKit = 1; s.weapon = "w_bronze"; s.bag = []; old = s; });
  let j = join(a.room, a.name);
  try {
    const saved = loadHero(a.name, "songweaver")!;
    assert.notEqual(saved, old);
    assert.ok(saved.bag!.includes("w_bronze"));
    assert.equal(saved.swKit, SW_KIT_VERSION);
  } finally { j.done(); }
  a = await account((s) => { old = s; });
  j = join(a.room, a.name);
  try { assert.equal(loadHero(a.name, "songweaver"), old, "nothing changed: no write"); } finally { j.done(); }
});
