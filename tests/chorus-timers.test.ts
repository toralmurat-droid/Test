// The HUD buff row shows each Chorus (Ballad, March, Dirge) with the song's real time left (shared/buffTimers.ts
// chorusTimers / timersOf `extra`), and generic weapons are never named "Lute" (shared/gear.ts gearName).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { chorusTimers, decodeTimers, timerSig, timersOf } from "../shared/buffTimers";
import { newRuntime } from "../shared/skillEngine";
import { cleanRanks, SKILLS } from "../shared/skills";
import { GEAR, gearName, WEAPON_TYPE_NAMES } from "../shared/gear";
import { SONG } from "../shared/songs";
import { isSafeZone, isSolidAt, VILLAGE } from "../shared/map";
import { TILE } from "../shared/constants";
import { startRoom, until, wait } from "./helpers/room";

// ---- unit ----------------------------------------------------------------------------------------------------------

test("timersOf: an extra merges with a buff of the same id (later end wins), new ids are added, ended ones skipped", () => {
  const sk = newRuntime(), now = 1000;
  sk.buffs.push({ id: "sg_ballad", until: now + 2600 } as any, { id: "sg_jig", until: now + 5000 } as any);
  const list = timersOf({ sk }, now, [{ id: "sg_ballad", until: now + 28_000 }, { id: "sg_dirge", until: now + 30_000 }, { id: "sg_march", until: now }]);
  assert.deepEqual(list.filter((t) => t.id === "sg_ballad"), [{ id: "sg_ballad", until: now + 28_000 }], "one chip, the Chorus's end");
  assert.ok(list.some((t) => t.id === "sg_dirge" && t.until === now + 30_000));
  assert.ok(!list.some((t) => t.id === "sg_march"), "an ended Chorus shows nothing");
  assert.ok(list.some((t) => t.id === "sg_jig" && t.until === now + 5000), "other buffs untouched");
  // a party buff outlasting the song (lingering after it ended early) keeps its own end
  const late = timersOf({ sk }, now, [{ id: "sg_ballad", until: now + 1000 }]);
  assert.equal(late.find((t) => t.id === "sg_ballad")!.until, now + 2600);
  // without extras: as before
  assert.deepEqual(timersOf({ sk }, now).map((t) => t.id), ["sg_ballad", "sg_jig"]);
  // re-applying the short party buff doesn't change the sig while the Chorus runs
  const a = timerSig(timersOf({ sk }, now, [{ id: "sg_ballad", until: now + 28_000 }]));
  sk.buffs[0].until = now + 3600;
  assert.equal(timerSig(timersOf({ sk }, now + 1000, [{ id: "sg_ballad", until: now + 28_000 }])), a);
});

test("chorusTimers: live song fields by owner; non-songs and ended songs are left out", () => {
  const now = 5000, f = (owner: string, skill: string, u: number) => ({ owner, skill, inst: { until: u } });
  const m = chorusTimers([f("a", "sg_dirge", now + 100), f("a", "sg_shrill", now + 9000), f("b", "sg_ballad", now), f("c", "sg_march", now + 7)], now);
  assert.deepEqual(m.get("a"), [{ id: "sg_dirge", until: now + 100 }]);
  assert.equal(m.get("b"), undefined);
  assert.deepEqual(m.get("c"), [{ id: "sg_march", until: now + 7 }]);
});

test("gearName: generic weapons are a Sword for a Songweaver, never a Lute; the real lute and other classes unchanged", () => {
  const generic = Object.keys(GEAR).filter((id) => GEAR[id].slot === "weapon" && !GEAR[id].wtype && !GEAR[id].cls);
  assert.ok(generic.length >= 6);
  for (const id of generic) {
    assert.ok(gearName(id, "songweaver").endsWith(` ${WEAPON_TYPE_NAMES.sword}`), gearName(id, "songweaver"));
    assert.ok(!gearName(id, "songweaver").includes("Lute"));
    assert.ok(gearName(id, "wizard").endsWith(" Staff"), gearName(id, "wizard"));
  }
  assert.equal(gearName("w_bronze", "songweaver"), "Bronze Sword");
  assert.equal(gearName("songweaver_weapon@12", "songweaver"), "Fine Lute");
});

// ---- room ----------------------------------------------------------------------------------------------------------

function openSpot(): [number, number] {
  for (let tx = VILLAGE.x0 - 12; tx > 0; tx--) {
    const x = (tx + 0.5) * TILE, y = (VILLAGE.y0 + 10.5) * TILE;
    if (!isSolidAt(x, y) && !isSafeZone(x, y) && !isSolidAt(x + 40, y)) return [x, y];
  }
  throw new Error("no open spot");
}

let shared: ReturnType<typeof startRoom> | undefined;
const server = () => (shared ??= startRoom());
after(async () => { if (shared) await (await shared).stop(); });
const allRanks = () => cleanRanks("songweaver", 30, Object.fromEntries(SKILLS.songweaver.map((s) => [s.id, 1])));

async function setup(n: number) {
  const srv = await server();
  const cs = [];
  for (let i = 0; i < n; i++) cs.push(await srv.join({ cls: "songweaver" }));
  await wait(200);
  const room = srv.room, [x, y] = openSpot();
  const ids = cs.map((c) => c.sessionId), ps = ids.map((id) => room.state.players.get(id));
  for (const p of ps) {
    p.x = x; p.y = y; p.level = 30; p.invulnUntil = 0; p.sk.buffs = []; p.mana = 0;
    for (const [k, v] of Object.entries(allRanks())) p.talents.set(k, v);
  }
  const chips = (i: number) => decodeTimers(ps[i].timers);
  const chip = (i: number, id: string) => chips(i).filter((c) => c.id === id);
  const song = (id: string) => { let out: any; room.state.fields.forEach((f: any) => { if (f.owner === id && f.inst.song && f.inst.until > Date.now()) out = f; }); return out; };
  const done = async () => { for (const c of cs) await c.leave(); await wait(50); };
  return { room, ids, ps, chip, song, done };
}

test("Dirge shows in the owner's buff row with about 30 s; it goes when the Chorus ends", async () => {
  const t = await setup(1);
  try {
    const [a] = t.ids;
    t.room.cast(a, "sg_dirge");
    assert.ok(await until(() => t.chip(0, "sg_dirge").length === 1), "the Dirge chip shows");
    const left = t.chip(0, "sg_dirge")[0].left;
    assert.ok(left > 25_000 && left <= 31_000, `about 30 s left (${left})`);
    assert.ok(Math.abs(left - (t.song(a).inst.until - Date.now())) < 1500, "the Chorus's own end");
    t.song(a).inst.until = Date.now(); // the song runs out
    assert.ok(await until(() => t.chip(0, "sg_dirge").length === 0), "gone when it ends");
  } finally { await t.done(); }
});

test("Ballad: one chip with the Chorus's time for the singer; a group member inside gets only the party buff chip", async () => {
  const t = await setup(2);
  try {
    const [a] = t.ids;
    t.ps[0].party = t.ps[1].party = "gchip";
    t.room.cast(a, "sg_ballad");
    assert.ok(await until(() => t.chip(0, "sg_ballad").length === 1 && t.chip(1, "sg_ballad").length === 1));
    await wait(1200); // a beat re-applies the party buff
    assert.equal(t.chip(0, "sg_ballad").length, 1, "one chip");
    assert.ok(t.chip(0, "sg_ballad")[0].left > 20_000, `the singer sees the song's time (${t.chip(0, "sg_ballad")[0].left})`);
    const ally = t.chip(1, "sg_ballad");
    assert.equal(ally.length, 1);
    assert.ok(ally[0].left < 10_000, `the ally sees the short party buff (${ally[0].left})`);
    assert.equal(t.song(t.ids[1]), undefined, "the ally plays no Chorus of her own");
  } finally { await t.done(); }
});

test("a new Chorus replaces the last one in the buff row", async () => {
  const t = await setup(1);
  try {
    const [a] = t.ids, p = t.ps[0];
    t.room.cast(a, "sg_ballad");
    assert.ok(await until(() => t.chip(0, "sg_ballad").length === 1));
    p.sk.song.at -= SONG.changeMs; p.sk.last = {}; p.attackReadyAt = 0;
    t.room.cast(a, "sg_dirge");
    assert.ok(await until(() => t.chip(0, "sg_dirge").length === 1), "the new one shows");
    // the Ballad's song time is gone at once; at most its short party buff lingers a moment, then nothing
    const b = t.chip(0, "sg_ballad");
    assert.ok(!b.length || b[0].left < 6000, `no 30 s Ballad chip left (${b[0]?.left})`);
    assert.ok(await until(() => t.chip(0, "sg_ballad").length === 0, 8000), "the Ballad chip ends");
    assert.ok(t.chip(0, "sg_dirge")[0].left > 20_000);
  } finally { await t.done(); }
});
