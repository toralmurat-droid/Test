// The owner-only shield total (PlayerPrivate.shield, shared/shields.ts shieldLeft): the hero's own client sees what
// is left of its absorb shields (Pedal Point, Lydian's overheal shield), every other client sees nothing of it.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { absorbDamage, allyHeal, ActiveBuff } from "../shared/skillEngine";
import { shieldLeft } from "../shared/shields";
import { cleanRanks, SKILLS } from "../shared/skills";
import { isSafeZone, isSolidAt, VILLAGE } from "../shared/map";
import { TILE } from "../shared/constants";
import { startRoom, until, wait } from "./helpers/room";

const buff = (id: string, until: number, shield?: number): ActiveBuff => ({ id, until, b: { ms: 1000 }, rank: 1, stacks: 0, shield });

test("shieldLeft sums the live pools, rounded, and skips expired or empty ones", () => {
  const now = 1000;
  assert.equal(shieldLeft({ sk: { buffs: [] } }, now), 0);
  assert.equal(shieldLeft({ sk: { buffs: [buff("a", 2000, 10.4), buff("b", 2000, 5.3), buff("c", 2000)] } }, now), 16);
  assert.equal(shieldLeft({ sk: { buffs: [buff("a", 1000, 50), buff("b", 999, 50), buff("c", 2000, 0)] } }, now), 0, "expired / empty");
});

const allRanks = () => cleanRanks("songweaver", 30, Object.fromEntries(SKILLS.songweaver.map((s) => [s.id, 1])));
function openSpot(): [number, number] {
  for (let tx = VILLAGE.x0 - 12; tx > 0; tx--) {
    const x = (tx + 0.5) * TILE, y = (VILLAGE.y0 + 10.5) * TILE;
    if (!isSolidAt(x, y) && !isSafeZone(x, y)) return [x, y];
  }
  throw new Error("no open spot");
}

let shared: ReturnType<typeof startRoom> | undefined;
after(async () => { if (shared) await (await shared).stop(); });

test("me.shield follows Pedal Point and Lydian pools, reaches only the owner, and is 0 when dead", async () => {
  const srv = await (shared ??= startRoom());
  const a = await srv.join({ cls: "songweaver" }), b = await srv.join({ cls: "wizard" });
  try {
    await wait(300);
    const room = srv.room, id = a.sessionId, p = room.state.players.get(id);
    const [x, y] = openSpot();
    p.x = x; p.y = y; p.level = 30; p.mana = 0;
    for (const [k, v] of Object.entries(allRanks())) p.talents.set(k, v);
    const own = () => a.state.players.get(id)?.me?.shield;
    const pool = (s: string) => p.sk.buffs.find((q: ActiveBuff) => q.id === s && q.until > Date.now())?.shield ?? 0;
    await until(() => own() === 0);
    assert.equal(own(), 0, "no shield yet");

    // Pedal Point: the owner sees the whole pool
    room.cast(id, "sg_pedal");
    const full = pool("sg_pedal");
    assert.ok(full > 0, "Pedal Point made a pool");
    assert.ok(await until(() => own() === Math.round(full)), `me.shield ${own()} = pool ${full}`);

    // the other client never gets A's me (so never its shield)
    assert.equal(b.state.players.get(id)?.me, undefined, "B does not see A's me");
    assert.ok(b.state.players.get(id), "B still sees A");

    // a soaked blow lowers it by what the pool took
    const before = own();
    assert.equal(absorbDamage(room.host, id, 10), 0, "all 10 soaked");
    assert.ok(await until(() => own() === before - 10), `me.shield ${own()} = ${before} - 10`);

    // a full soak empties it
    absorbDamage(room.host, id, 99999);
    assert.ok(await until(() => own() === 0), "full soak: 0");

    // expiry brings it back to 0
    p.sk.last = {}; if (p.sk.song) p.sk.song.at = 0;
    room.cast(id, "sg_pedal");
    assert.ok(await until(() => (own() ?? 0) > 0), "second Pedal Point shows");
    for (const q of p.sk.buffs) if (q.id === "sg_pedal") q.until = Date.now() + 50;
    assert.ok(await until(() => own() === 0), "expired: 0");

    // Lydian: an overheal shield counts too
    p.sk.mode = "lydian"; p.hp = p.maxHp;
    allyHeal(room.host, id, id, 200);
    const lyd = pool("sg_lydian");
    assert.ok(lyd > 0, "Lydian made a shield");
    assert.ok(await until(() => own() === Math.round(lyd)), `me.shield ${own()} = Lydian pool ${lyd}`);
    assert.equal(b.state.players.get(id)?.me, undefined, "still owner-only");

    // a dead hero shows 0 (the pool itself is left to the engine)
    p.dead = true;
    assert.ok(await until(() => own() === 0), "dead: 0");
    p.dead = false;
  } finally { await a.leave(); await b.leave(); }
});
