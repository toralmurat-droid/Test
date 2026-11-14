// DI-1 / DI-4 (docs/songweaver-di-plan.md): songKind names the Songweaver's skills, chordProgress and the ch1 / ch2 /
// chlock status words show how far she is into a chord, to everyone who sees her.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { CANTRIPS, cleanRanks, FINISHERS, SKILLS, skillById } from "../shared/skills";
import { newRuntime, playableProgs, statusOf, type Unit } from "../shared/skillEngine";
import { chordProgress, NOTES, PROGRESSIONS, songKind, type Degree } from "../shared/songs";
import { isSafeZone, isSolidAt, VILLAGE } from "../shared/map";
import { TILE } from "../shared/constants";
import { startRoom, wait } from "./helpers/room";

const allRanks = () => cleanRanks("songweaver", 30, Object.fromEntries(SKILLS.songweaver.map((s) => [s.id, 1])));

test("songKind: songs are Choruses, Modulate a Key change, other notes Verses, passives nothing", () => {
  for (const s of SKILLS.songweaver) {
    const k = songKind(s);
    if (s.passive) assert.equal(k, undefined, s.id);
    else if (s.song) assert.equal(k, "Chorus", s.id);
    else assert.equal(k, "Verse", s.id);
  }
  assert.deepEqual(["sg_ballad", "sg_march", "sg_dirge"].map((id) => songKind(skillById(id)!)), ["Chorus", "Chorus", "Chorus"]);
  assert.equal(songKind(CANTRIPS.songweaver[0]), "Key change");
  assert.equal(songKind(skillById("sg_shrill")!), "Verse");
  for (const f of FINISHERS) assert.equal(songKind(f), undefined, `${f.id} is not a note`);
  assert.equal(songKind(SKILLS.wizard[0]), undefined, "other classes have no song kinds");
});

test("chordProgress: the longest run of the latest notes that starts a progression", () => {
  const at = (...notes: Degree[]) => chordProgress({ notes });
  assert.equal(at(), 0);
  assert.equal(at("vi"), 1, "vi starts Amen");
  assert.equal(at("vi", "IV"), 2);
  assert.equal(at("IV"), 1, "IV starts Perfect / Deceptive");
  assert.equal(at("IV", "V"), 2);
  assert.equal(at("V"), 0, "nothing starts on V");
  assert.equal(at("V", "vi"), 1, "only the tail counts");
  assert.equal(at("vi", "V"), 0);
  assert.equal(at("I", "ii", "V"), 2, "the last two of three");
  // a custom list (collected songs, C2)
  assert.equal(chordProgress({ notes: ["V"] }, [{ notes: ["V", "I", "I"] }]), 1);
  assert.equal(chordProgress({ notes: ["vi", "IV"] }, []), 0);
});

test("statusOf: ch1 / ch2 while building a progression she can finish, chlock while locked", () => {
  const u: Unit = { x: 0, y: 0, dead: false, level: 30, sk: newRuntime(), cls: "songweaver", talents: allRanks() };
  const now = 50_000;
  const words = () => statusOf(u, now).split(",");
  assert.equal(playableProgs(u).length, PROGRESSIONS.length, "every progression with the whole tree");
  u.sk.notes = ["vi"]; assert.ok(words().includes("ch1"));
  u.sk.notes = ["vi", "IV"]; assert.ok(words().includes("ch2"));
  u.sk.notes = ["V"]; assert.ok(!words().some((w) => /^ch\d$/.test(w)), "no word for a dead end");
  u.sk.chordLock = now + NOTES.lockMs;
  u.sk.notes = ["vi", "IV"];
  assert.ok(words().includes("chlock"));
  assert.ok(!words().includes("ch2"), "the lockout hides the progress");
  // without Mending Note (IV) she can't finish Amen, Perfect or Deceptive: vi is a dead end
  u.sk.chordLock = 0;
  u.talents = cleanRanks("songweaver", 30, { sg_ballad: 1, sg_pedal: 1 });
  u.sk.notes = ["vi"];
  assert.ok(!words().includes("ch1"));
  // other classes never get them
  const k: Unit = { x: 0, y: 0, dead: false, level: 30, sk: newRuntime(), cls: "wizard" };
  k.sk.notes = ["vi"];
  assert.ok(!statusOf(k, now).includes("ch1"));
});

// ---- Room ----------------------------------------------------------------------------------------------------

let shared: ReturnType<typeof startRoom> | undefined;
const server = () => (shared ??= startRoom());
after(async () => { if (shared) await (await shared).stop(); });

function openSpot(): [number, number] {
  for (let tx = VILLAGE.x0 - 12; tx > 0; tx--) {
    const x = (tx + 0.5) * TILE, y = (VILLAGE.y0 + 10.5) * TILE;
    if (!isSolidAt(x, y) && !isSafeZone(x, y) && !isSolidAt(x + 40, y)) return [x, y];
  }
  throw new Error("no open spot");
}

test("room: the synced fx shows ch1, ch2 and then chlock as Amen (vi IV I) is played", async () => {
  const srv = await server();
  const c = await srv.join({ cls: "songweaver" });
  try {
    await wait(200);
    const p = srv.room.state.players.get(c.sessionId), [x, y] = openSpot();
    p.x = x; p.y = y; p.level = 30; p.hp = p.maxHp = 99999; p.invulnUntil = Date.now() + 60_000;
    for (const [k, v] of Object.entries(allRanks())) p.talents.set(k, v);
    const fx = () => String(c.state.players.get(c.sessionId).fx).split(",");
    const again = () => { p.sk.last = {}; p.attackReadyAt = 0; };
    srv.room.cast(c.sessionId, "sg_pedal"); // vi
    await wait(200);
    assert.ok(fx().includes("ch1"), `after vi: ${fx()}`);
    again(); srv.room.cast(c.sessionId, "sg_mend"); // IV
    await wait(200);
    assert.ok(fx().includes("ch2"), `after vi IV: ${fx()}`);
    again(); srv.room.cast(c.sessionId, "sg_ballad"); // I: Amen fires
    await wait(200);
    assert.ok(fx().includes("chlock"), `after the chord: ${fx()}`);
    assert.ok(!fx().includes("ch2"));
  } finally { await c.leave(); await wait(50); }
});
