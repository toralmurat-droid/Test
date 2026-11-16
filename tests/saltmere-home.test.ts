// Saltmere rework phase 4 (docs/saltmere-rework-progress.md): an Act 1 hero who has woken Saltmere's waystone comes
// back at the nearer of Oakvale and Saltmere (overworld deaths only), and Saltmere's harbour square has a second
// chest of the same account stash.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { RESPAWN_MS, TILE } from "../shared/constants";
import { act1Home, actAt, saltmereSpawn, waygateArrival, waygateById } from "../shared/act2";
import { AREAS, isSafeZone, isSolidAt, isSolidTile, SAFE_ZONE } from "../shared/map";
import { SALT_SQUARE, SALT_STASH } from "../shared/saltmere";
import { CRYPT_FLOORS, FLOORS, underground } from "../shared/dungeon";
import { STASH, STASH_RANGE, STASHES, stashNear } from "../shared/trade";
import { startRoom, until, wait } from "./helpers/room";

const inRect = (r: { x: number; y: number; w: number; h: number }, px: number, py: number) => {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  return tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h;
};
const mid = (r: { x: number; y: number; w: number; h: number }) => ({ x: (r.x + r.w / 2) * TILE, y: (r.y + r.h / 2) * TILE });
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
/** A free tile (px centre) in a tile rect, nearest its middle. */
function freeIn(r: { x: number; y: number; w: number; h: number }) {
  let best: { x: number; y: number } | undefined, bd = Infinity;
  for (let ty = r.y; ty < r.y + r.h; ty++) for (let tx = r.x; tx < r.x + r.w; tx++) {
    const p = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
    if (isSolidTile(tx, ty) || isSafeZone(p.x, p.y)) continue;
    const d = dist(p, mid(r));
    if (d < bd) { bd = d; best = p; }
  }
  return best!;
}
const area = (name: string) => AREAS.find((a) => a.name === name)!;
const GULL = freeIn(area("Gullrock Cove")), FARMS = freeIn(area("Goldenreach Farms"));
const maw = FLOORS.find((f) => f.dungeon === "maw")!, ch = maw.chambers[3];
const MAW = { x: (maw.x + ch.x + 0.5) * TILE, y: (maw.y + ch.y + 0.5) * TILE };
const cr = CRYPT_FLOORS[0], cc = cr.chambers[0];
const CRYPT = { x: (cr.x + cc.x + 0.5) * TILE, y: (cr.y + cc.y + 0.5) * TILE };
const DESERT = waygateArrival(waygateById("desert")!);
const yes = (id: string) => id === "saltmere", no = () => false;
const onSalt = (s: { x: number; y: number }) => inRect(SALT_SQUARE, s.x, s.y) && isSafeZone(s.x, s.y);
const onOak = (s: { x: number; y: number }) => inRect(SAFE_ZONE, s.x, s.y) && isSafeZone(s.x, s.y);

test("saltmereSpawn: free ground on the harbour square, never in a wall", () => {
  for (let i = 0; i < 200; i++) {
    const s = saltmereSpawn(), r = 5;
    assert.ok(onSalt(s), `${s.x},${s.y} on the square`);
    assert.ok(![[-r, -r], [r, -r], [-r, r], [r, r]].some(([dx, dy]) => isSolidAt(s.x + dx, s.y + dy)), `${s.x},${s.y} clear`);
    assert.equal(actAt(s.y, s.x), 1);
  }
});

test("act1Home: the nearer town once Saltmere's waystone is woken, Oakvale underground or without it", () => {
  assert.ok(dist(GULL, mid(SALT_SQUARE)) < dist(GULL, mid(SAFE_ZONE)), "Gullrock Cove is nearer Saltmere");
  assert.ok(dist(FARMS, mid(SAFE_ZONE)) < dist(FARMS, mid(SALT_SQUARE)), "the farms are nearer Oakvale");
  for (const [name, at] of [["Mawdeep", MAW], ["Lantern Crypt", CRYPT]] as const) {
    assert.ok(underground(at.y) && actAt(at.y, at.x) === 1, `${name} is Act 1, underground`);
    assert.ok(dist(at, mid(SALT_SQUARE)) < dist(at, mid(SAFE_ZONE)), `${name}: Saltmere is nearer in a straight line, so the rule is what sends it to Oakvale`);
  }
  for (let i = 0; i < 20; i++) {
    assert.ok(onSalt(act1Home(GULL.x, GULL.y, yes)), "Gullrock, waystone woken: Saltmere");
    assert.ok(onOak(act1Home(GULL.x, GULL.y, no)), "Gullrock, never been to Saltmere: Oakvale");
    assert.ok(onOak(act1Home(FARMS.x, FARMS.y, yes)), "the farms, woken: still Oakvale");
    assert.ok(onOak(act1Home(MAW.x, MAW.y, yes)), "the Mawdeep: Oakvale");
    assert.ok(onOak(act1Home(CRYPT.x, CRYPT.y, yes)), "the Lantern Crypt: Oakvale");
    assert.ok(onSalt(act1Home(mid(SALT_SQUARE).x, mid(SALT_SQUARE).y, yes)), "on Saltmere's square itself: Saltmere");
  }
  assert.ok(onOak(act1Home(DESERT.x, DESERT.y, yes)), "not an Act 1 point: Oakvale (the room never asks)");
  const woke: string[] = [];
  act1Home(GULL.x, GULL.y, (id) => (woke.push(id), false));
  assert.deepEqual(woke, ["saltmere"], "only Saltmere's waystone is asked about");
});

test("stash chests: Oakvale's first (STASH kept), Saltmere's on the harbour square at SALT_STASH, both on free tiles", () => {
  assert.equal(STASHES.length, 7, "Oakvale's, Saltmere's and one in each of the five capitals (W7, shared/capitals.ts)");
  assert.deepEqual(STASHES[0], STASH);
  const s = STASHES[1];
  assert.equal(Math.floor(s.x / TILE), SALT_STASH.x);
  assert.equal(Math.floor(s.y / TILE), SALT_STASH.y);
  assert.ok(inRect(SALT_SQUARE, s.x, s.y) && isSafeZone(s.x, s.y));
  for (const c of STASHES) assert.ok(!isSolidAt(c.x, c.y), "the chest stands on open ground (it is not a map tile)");
  assert.equal(stashNear(STASH.x, STASH.y), STASH);
  assert.equal(stashNear(s.x + STASH_RANGE * 0.9, s.y), s);
  assert.equal(stashNear(s.x + STASH_RANGE * 1.1, s.y), undefined);
  assert.equal(stashNear(s.x + STASH_RANGE * 1.1, s.y, STASH_RANGE * 1.6), s, "a wider range (the server's)");
  assert.equal(stashNear(GULL.x, GULL.y), undefined);
});

// ---- the room ----------------------------------------------------------------------------------------------------

let shared: ReturnType<typeof startRoom> | undefined;
const server = () => (shared ??= startRoom());
after(async () => { if (shared) await (await shared).stop(); });

let seq = 0;
/** onJoin as a fresh account through a fake client (test rooms skip onAuth), like tests/moors.test.ts. */
async function hero() {
  const { login } = await import("../server/accounts");
  const srv = await server();
  if (!srv.room) { await srv.join({ cls: "wizard" }); await wait(200); } // a real client keeps the room up
  const room = srv.room, name = `Salt${process.pid % 1000}h${++seq}`, sid = `salthome${seq}`;
  await login(name, "testpass1", "127.0.0.1");
  const got: Record<string, any[]> = {};
  const client = { sessionId: sid, send: (type: string, m: any) => { (got[type] ??= []).push(m); } };
  room.onJoin(client, { cls: "wizard" }, { name });
  return { room, name, client, got, p: room.state.players.get(sid), done: () => room.state.players.delete(sid) };
}

test("room: a death respawns at Saltmere only when its waystone is woken, the death is overworld Act 1 and Saltmere is nearer", async () => {
  const cases = [
    { name: "Gullrock, woken", at: GULL, woke: true, want: onSalt },
    { name: "Gullrock, not woken", at: GULL, woke: false, want: onOak },
    { name: "Goldenreach Farms, woken", at: FARMS, woke: true, want: onOak },
    { name: "Mawdeep floor, woken", at: MAW, woke: true, want: onOak },
    { name: "the Sunscar (Act 2), woken", at: DESERT, woke: true, want: (s: { x: number; y: number }) => actAt(s.y, s.x) === 2 },
  ];
  const hs = await Promise.all(cases.map(() => hero()));
  try {
    hs.forEach((h, i) => {
      const c = cases[i], p = h.p;
      if (c.woke) p.portals.add("saltmere"); else p.portals.delete("saltmere");
      p.x = c.at.x; p.y = c.at.y; p.invulnUntil = 0;
      assert.equal(h.room.damagePlayer(h.client.sessionId, 1e9, "Test", [0, 0]), true, `${c.name}: the blow kills`);
      assert.ok(p.dead);
    });
    assert.ok(await until(() => hs.every((h) => !h.p.dead), RESPAWN_MS + 8000), "everyone is back up");
    hs.forEach((h, i) => assert.ok(cases[i].want(h.p), `${cases[i].name}: back at ${h.p.x},${h.p.y}`));
    assert.ok(hs.every((h) => h.p.hp === h.p.maxHp));
  } finally { hs.forEach((h) => h.done()); }
});

test("room: Saltmere's chest opens the same account stash as Oakvale's; away from both the stash refuses", async () => {
  const { loadStash } = await import("../server/accounts");
  const h = await hero(), { room, client, p, got } = h;
  try {
    const salt = STASHES[1];
    p.bag.clear(); p.bag.push("a_chain");
    // away from both chests: no window, nothing moves
    p.x = GULL.x; p.y = GULL.y;
    room.stashSend(client);
    room.stashMove(client, "put", 0);
    room.stashGold(client, 100);
    assert.equal(got.stashview, undefined, "no stash window away from the chests");
    assert.deepEqual([...p.bag], ["a_chain"], "the item stays in the bag");
    assert.deepEqual(loadStash(h.name), { items: [], gold: 0 });
    // banked at Saltmere
    p.x = salt.x; p.y = salt.y;
    room.stashSend(client);
    assert.equal(got.stashview?.length, 1, "Saltmere's chest opens the stash");
    room.stashMove(client, "put", 0);
    assert.deepEqual(loadStash(h.name).items, ["a_chain"]);
    assert.equal(p.bag.length, 0);
    // taken out in Oakvale
    p.x = STASH.x; p.y = STASH.y;
    room.stashMove(client, "take", 0);
    assert.deepEqual([...p.bag], ["a_chain"], "withdrawn at Oakvale");
    assert.deepEqual(loadStash(h.name).items, []);
  } finally { h.done(); }
});
