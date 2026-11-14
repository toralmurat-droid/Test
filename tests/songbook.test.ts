// DI-2 song collection (docs/songweaver-di-plan.md): four songs from quests, a villager and a place, never a drop.
// Each teaches a progression and its finisher, counted only while the Songbook is worn.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { FINISHERS, skillById } from "../shared/skills";
import { PROGRESSIONS } from "../shared/songs";
import { MIRROR_POND } from "../shared/map";
import { npcById } from "../shared/npcs";
import { TILE } from "../shared/constants";
import { GEAR, isGearId } from "../shared/gear";
import { CHAINS, QUESTS, questFinished } from "../shared/quests";
import { ODO_LINES, pondShore, progressionsFor, SONG_IDS, SONG_PROGRESSIONS, SONG_SOURCES, songOfQuest } from "../shared/songbook";
import { SongCollector, SW_KIT_VERSION } from "../server/songs";
import { play, singer, world } from "./helpers/songWorld";
import { startRoom, wait } from "./helpers/room";
import { newRuntime } from "../shared/skillEngine";

test("data: four songs with the contract's ids, each a new progression and a hidden finisher; never a drop", () => {
  assert.deepEqual(SONG_IDS, ["song_hum", "song_round", "song_pond", "song_lament"]);
  assert.deepEqual(SONG_PROGRESSIONS.map((p) => [p.id, p.skill, p.notes.join(" ")]), [
    ["hum", "sg_f_hum", "I V I"], ["round", "sg_f_round", "I V vi"], ["undertow", "sg_f_undertow", "i bII i"], ["picardy", "sg_f_picardy", "i V I"],
  ]);
  for (const p of SONG_PROGRESSIONS) assert.ok(FINISHERS.includes(skillById(p.skill)!) && skillById(p.skill)!.finisher, p.skill);
  for (const id of SONG_IDS) assert.ok(!(id in GEAR) && !isGearId(id), `${id} is not an item`);
  assert.equal(songOfQuest("jelly")?.id, "song_hum");
  assert.equal(songOfQuest("king")?.id, "song_lament");
  const jelly = CHAINS.flatMap((c) => c.quests).find((q) => q.id === "jelly")!, king = CHAINS.flatMap((c) => c.quests).find((q) => q.id === "king")!;
  assert.equal(jelly.reward.song, "song_hum");
  assert.equal(king.reward.song, "song_lament");
  for (const s of SONG_SOURCES) assert.ok(s.hint && s.learned && s.line && s.banner, s.id);
});

test("every progression is unique (the ones she starts with and the collected ones)", () => {
  const all = [...PROGRESSIONS, ...SONG_PROGRESSIONS];
  assert.equal(new Set(all.map((p) => p.notes.join(" "))).size, all.length, "notes");
  assert.equal(new Set(all.map((p) => p.id)).size, all.length, "ids");
  assert.equal(new Set(all.map((p) => p.skill)).size, all.length, "finishers");
});

test("progressionsFor: collected songs count only while a book that holds songs is worn", () => {
  const sk = newRuntime();
  assert.equal(progressionsFor(sk), PROGRESSIONS);
  sk.songs = ["song_hum", "song_pond"];
  assert.equal(progressionsFor(sk), PROGRESSIONS, "no book");
  sk.book = "bk_hymnal";
  assert.equal(progressionsFor(sk), PROGRESSIONS, "a Hymnal holds no songs");
  sk.book = "songweaver_shield";
  assert.deepEqual(progressionsFor(sk).slice(PROGRESSIONS.length).map((p) => p.id), ["hum", "undertow"]);
});

test("engine: I V I fires the Gloam's Hum with the song and the Songbook, and nothing without them", () => {
  for (const [book, songs, fires] of [["songweaver_shield", ["song_hum"], true], ["songweaver_shield", [], false], ["bk_march", ["song_hum"], false]] as const) {
    const w = world();
    const u = singer(w);
    w.add("foe", 30, { hp: 999, maxHp: 999 });
    u.sk.book = book; u.sk.songs = [...songs];
    for (const s of ["sg_chorale", "sg_call", "sg_chorale"]) assert.ok(play(w, s), s);
    const chord = w.fx.find((e) => e.ev === "chord");
    assert.equal(chord?.prog, fires ? "hum" : undefined, `${book} ${songs}`);
    if (fires) assert.ok(w.hits.some((h) => h.to === "foe" && h.o.sound?.res === 35), "the Hum's blast rings");
  }
});

test("collector: only a Songweaver learns; Odo teaches for a bright Chorus within 4 tiles, grumbles at a dark one; the pond's shore", () => {
  const col = new SongCollector(), ballad = skillById("sg_ballad")!, dirge = skillById("sg_dirge")!, odo = npcById("miller")!;
  const sw = { cls: "songweaver", sk: newRuntime() }, kn = { cls: "knight", sk: newRuntime() };
  const said: string[] = [];
  const say = (_n: string, t: string) => said.push(t);
  assert.deepEqual(col.chorus(kn, ballad, "major", odo.x, odo.y, 0, say), [], "a knight collects nothing");
  assert.equal(col.learn(kn, "song_hum"), false);
  assert.deepEqual(col.chorus(sw, skillById("sg_call")!, "major", odo.x, odo.y, 0, say), [], "a Verse is not a Chorus");
  assert.deepEqual(col.chorus(sw, ballad, "major", odo.x + 5 * TILE, odo.y, 0, say), [], "too far");
  assert.deepEqual(col.chorus(sw, dirge, "minor", odo.x, odo.y, 0, say), []);
  assert.deepEqual(said, [ODO_LINES.dark]);
  assert.deepEqual(col.chorus(sw, ballad, "lydian", odo.x + 3 * TILE, odo.y, 1000, say).map((d) => d.id), ["song_round"], "Lydian is bright");
  assert.deepEqual(col.chorus(sw, ballad, "major", odo.x, odo.y, 2000, say), [], "once");
  const shore = [(MIRROR_POND.x + MIRROR_POND.rx * 1.1) * TILE, MIRROR_POND.y * TILE] as const;
  assert.ok(pondShore(...shore) && !pondShore(MIRROR_POND.x * TILE, (MIRROR_POND.y - 20) * TILE));
  assert.deepEqual(col.chorus(sw, dirge, "minor", ...shore, 3000, say).map((d) => d.id), ["song_pond"], "any Chorus on the shore");
  assert.deepEqual(col.msg(sw).songs, ["song_round", "song_pond"]);
  assert.deepEqual(sw.sk.songs, ["song_round", "song_pond"], "mirrored into the engine");
  assert.deepEqual(col.save(sw), { swSongs: ["song_round", "song_pond"], swMats: {} });
  assert.deepEqual(col.save(kn), {});
});

test("collector load: songs and materials cleaned; a save from before kit v3 gets the songs of quests it finished", () => {
  const col = new SongCollector(), sw = { cls: "songweaver", sk: newRuntime() };
  col.load(sw, { swSongs: ["song_pond", "song_pond", "bogus", 3], swMats: { bone: 4.7, silk: -1, gold: 9, horn: "x" } }, () => true, false);
  assert.deepEqual(col.msg(sw), { songs: ["song_pond"], mats: { bone: 4 } });
  col.load(sw, { swSongs: ["song_pond"] }, (q) => q === "jelly", true);
  assert.deepEqual(col.msg(sw).songs, ["song_pond", "song_hum"]);
  col.load(sw, {}, (q) => q === "king", false);
  assert.deepEqual(col.msg(sw).songs, [], "an up-to-date save is not granted again");
  const kn = { cls: "knight", sk: newRuntime() };
  col.load(kn, { swSongs: ["song_hum"] }, () => true, true);
  assert.deepEqual(col.msg(kn).songs, []);
});

let shared: ReturnType<typeof startRoom> | undefined;
const server = () => (shared ??= startRoom());
after(async () => { if (shared) await (await shared).stop(); });

test("room: an old save that finished jelly gets its song; finishing king teaches the Lament with newsong and a songbook message", async () => {
  const srv = await server();
  const c = await srv.join({ cls: "songweaver" });
  const books: any[] = [];
  c.onMessage("songbook", (m: any) => books.push(m));
  try {
    await wait(250);
    assert.ok(books.length >= 1, "sent on join");
    assert.deepEqual(books[0].songs, []);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    const jelly = QUESTS.findIndex((q) => q.id === "jelly");
    const save = { ...room.snapshot(p), swKit: 2, swSongs: undefined, quests: undefined, questId: jelly + 1, questStage: 0, questCount: 0 };
    room.restore(p, save);
    assert.ok(questFinished(p, "jelly"));
    assert.deepEqual(room.songs.msg(p).songs, ["song_hum"]);
    assert.deepEqual(room.snapshot(p).swSongs, ["song_hum"]);
    assert.equal(room.snapshot(p).swKit, SW_KIT_VERSION);
    // finishing king: its last step's reward
    const ci = CHAINS.findIndex((ch) => ch.quests.some((q) => q.id === "king")), qi = CHAINS[ci].quests.findIndex((q) => q.id === "king");
    const fx: any[] = [];
    c.onMessage("sfx", (e: any) => fx.push(e));
    room.qset(p, ci, { questId: qi, questStage: CHAINS[ci].quests[qi].steps.length, questCount: 0 });
    room.nextStep(c.sessionId, p, ci);
    await wait(250);
    assert.ok(room.songs.has(p, "song_lament"));
    assert.ok(fx.some((e) => e.ev === "newsong" && e.song === "song_lament" && e.id === c.sessionId));
    assert.deepEqual(books.at(-1).songs, ["song_hum", "song_lament"]);
    assert.deepEqual(p.sk.songs, ["song_hum", "song_lament"]);
  } finally { await c.leave(); await wait(50); }
});

test("room: a knight finishing jelly learns nothing and gets no songbook message", async () => {
  const srv = await server();
  const c = await srv.join({ cls: "knight" });
  const books: any[] = [];
  c.onMessage("songbook", (m: any) => books.push(m));
  try {
    await wait(250);
    const room = srv.room, p = room.state.players.get(c.sessionId), jelly = QUESTS.findIndex((q) => q.id === "jelly");
    room.qset(p, 0, { questId: jelly, questStage: QUESTS[jelly].steps.length, questCount: 0 });
    room.nextStep(c.sessionId, p, 0);
    await wait(150);
    assert.deepEqual(books, []);
    assert.equal(room.snapshot(p).swSongs, undefined);
  } finally { await c.leave(); await wait(50); }
});
