// Waves bouncing off walls (server TownRoom.updateProjectile / bounce, shared/acoustics.ts BOUNCE): stone, wood and
// metal reflect with their falloff, foliage swallows, at most BOUNCE_RULES.max bounces and BOUNCE_RULES.minFlight apart.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAP_W, TILE } from "../shared/constants";
import { EMPTY, isSolidAt, OBJECTS, T } from "../shared/map";
import { BOUNCE, BOUNCE_RULES, materialAt } from "../shared/acoustics";
import type { ShotSpec } from "../shared/skillEngine";
import { startRoom, wait } from "./helpers/room";

/** A tile of `kinds` with three free tiles to its west (a wave can fly in from there). */
function wallWithRoom(kinds: number[]): [number, number] {
  for (let ty = 5; ty < 200; ty++) for (let tx = 5; tx < MAP_W - 5; tx++) {
    if (!kinds.includes(OBJECTS[ty][tx])) continue;
    let free = true;
    for (let i = 1; i <= 3 && free; i++) { const x = (tx - i + 0.5) * TILE, y = (ty + 0.5) * TILE; if (isSolidAt(x, y) || OBJECTS[ty][tx - i] !== EMPTY) free = false; }
    if (free) return [tx, ty];
  }
  throw new Error("no such wall");
}

const spec = (owner: string, x: number, y: number, bounce = 3): ShotSpec => ({
  owner, skill: "sg_shrill", x, y, vx: 1, vy: 0, kind: "wave", speed: 260, range: 400, radius: 6, size: 1, dmg: 100,
  pierce: 0, explode: 0, chain: 0, rank: 1, power: 1, bounce, sound: { pitch: "H", deg: "V", mode: "major" },
});

/** Waits (up to 3 s, the room may run slow under a full test run) until `ok` holds. */
async function until(ok: () => boolean) { for (let i = 0; i < 60 && !ok(); i++) await wait(50); }

async function setup() {
  const srv = await startRoom();
  const c = await srv.join({ cls: "songweaver" });
  await wait(200);
  const room = srv.room, id = c.sessionId;
  const sfx: any[] = [];
  const bc = room.broadcast.bind(room);
  room.broadcast = (type: string, msg: any, ...rest: unknown[]) => { if (type === "sfx") sfx.push(msg); return bc(type, msg, ...rest); };
  /** Fires a wave from two tiles west of the wall, flying east. */
  const fire = (tx: number, ty: number, bounce = 3) => {
    const p = room.state.players.get(id);
    p.x = (tx - 30) * TILE; p.y = (ty + 0.5) * TILE; // the hero stands well away
    const before = new Set(room.state.projectiles.keys());
    room.host.shoot(spec(id, (tx - 1.5) * TILE, (ty + 0.5) * TILE, bounce));
    const sid = [...room.state.projectiles.keys()].find((k: string) => !before.has(k));
    return { sid, s: room.state.projectiles.get(sid) };
  };
  return { srv, c, room, id, sfx, fire, done: async () => { await c.leave(); await srv.stop(); } };
}

test("a wave reflects off stone with its falloff, and sends a bounce event", async () => {
  const t = await setup();
  try {
    const [tx, ty] = wallWithRoom([T.ROCK, T.WALL_STONE]);
    assert.equal(materialAt(tx, ty), "stone");
    const { s } = t.fire(tx, ty);
    await until(() => t.sfx.some((e) => e.ev === "bounce"));
    const ev = t.sfx.find((e) => e.ev === "bounce");
    assert.ok(ev, "bounce event");
    assert.equal(ev.mat, "stone");
    assert.ok(s.vx < 0, "flies back west");
    assert.ok(Math.abs(s.spec.dmg - 100 * BOUNCE.stone!.dmg) < 1e-6, "x0.9 after one bounce off stone");
    assert.equal(s.bounced, 1);
  } finally { await t.done(); }
});

test("a tree swallows the wave", async () => {
  const t = await setup();
  try {
    const [tx, ty] = wallWithRoom([T.TREE, T.PINE]);
    assert.equal(materialAt(tx, ty), "foliage");
    const { sid } = t.fire(tx, ty);
    await until(() => !t.room.state.projectiles.has(sid));
    await wait(100);
    assert.equal(t.room.state.projectiles.has(sid), false, "gone");
    assert.equal(t.sfx.some((e) => e.ev === "bounce"), false, "no bounce");
  } finally { await t.done(); }
});

test("no bounce without ShotDef.bounce; at most 3 bounces, 24 px of flight apart; wood x0.6, metal x1 and +20 resonance", async () => {
  const t = await setup();
  try {
    const [tx, ty] = wallWithRoom([T.ROCK, T.WALL_STONE]);
    const plain = t.fire(tx, ty, 0);
    await until(() => !t.room.state.projectiles.has(plain.sid));
    assert.equal(t.room.state.projectiles.has(plain.sid), false, "a wave that can't bounce stops at the wall");
    // the rule itself, on a stand-in projectile: px/py is the free spot, x/y inside the wall
    const px = (tx - 0.5) * TILE, py = (ty + 0.5) * TILE, wx = (tx + 0.2) * TILE;
    const s: any = { x: wx, y: py, vx: 1, vy: 0, dir: "right", traveled: 100, bounced: 0, bouncedAt: 0, damage: 100, spec: { ...spec(t.id, px, py, 9) } };
    const hit = () => { s.x = wx; s.y = py; s.vx = 1; return t.room.bounce(s, px, py); };
    assert.equal(hit(), true);
    s.traveled += BOUNCE_RULES.minFlight - 1;
    assert.equal(hit(), false, "too soon after the last bounce");
    for (let i = 0; i < 5; i++) { s.traveled += BOUNCE_RULES.minFlight; hit(); }
    assert.equal(s.bounced, BOUNCE_RULES.max, "never more than 3");
    assert.ok(Math.abs(s.spec.dmg - 100 * Math.pow(BOUNCE.stone!.dmg, 3)) < 1e-6);
    // wood and metal
    const [wtx, wty] = wallWithRoom([T.FENCE, T.WALL_TIMBER, T.PALISADE, T.CRATE, T.BARREL]);
    const w: any = { x: (wtx + 0.2) * TILE, y: (wty + 0.5) * TILE, vx: 1, vy: 0, traveled: 50, bounced: 0, bouncedAt: 0, damage: 100, spec: spec(t.id, 0, 0) };
    assert.equal(t.room.bounce(w, (wtx - 0.5) * TILE, (wty + 0.5) * TILE), true);
    assert.ok(Math.abs(w.spec.dmg - 60) < 1e-6, "wood x0.6");
    const [mtx, mty] = wallWithRoom([T.WELL, T.ANVIL]);
    const m: any = { x: (mtx + 0.2) * TILE, y: (mty + 0.5) * TILE, vx: 1, vy: 0, traveled: 50, bounced: 0, bouncedAt: 0, damage: 100, spec: spec(t.id, 0, 0) };
    assert.equal(t.room.bounce(m, (mtx - 0.5) * TILE, (mty + 0.5) * TILE), true);
    assert.equal(m.spec.dmg, 100, "metal keeps it all");
    assert.equal(m.spec.sound.res, 20, "and it rings: +20 resonance");
    assert.ok(t.sfx.some((e) => e.ev === "bounce" && e.mat === "metal") && t.sfx.some((e) => e.ev === "bounce" && e.mat === "wood"));
  } finally { await t.done(); }
});
