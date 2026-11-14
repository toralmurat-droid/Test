// Player.sta/str/mag/dex are server-only: the client computes them with shared heroStats from synced fields.
// This checks both sides agree after gear, stat points and level changes (including gear whose requirements are unmet).
import { test } from "node:test";
import assert from "node:assert/strict";
import { GEAR_SLOTS, gearDef, gearReq, gearStats, heroStats, rollGear } from "../shared/gear";
import { ACTIVE_CLASSES } from "../shared/classes";
import { startRoom, wait } from "./helpers/room";

const clientStats = (s: any) => heroStats({
  cls: s.cls, level: s.level, pts: { sta: s.ptSta, str: s.ptStr, mag: s.ptMag, dex: s.ptDex },
  worn: Object.fromEntries(GEAR_SLOTS.map((k) => [k, s[k]])),
});
const serverStats = (p: any) => ({ sta: p.sta, str: p.str, mag: p.mag, dex: p.dex });

test("hero stats: client heroStats from synced fields equals the server's stats", async () => {
  const srv = await startRoom();
  try {
    for (const cls of ACTIVE_CLASSES) {
      const c = await srv.join({ cls, newGame: true });
      await wait(300);
      const room = srv.room, p = room.state.players.get(c.sessionId);
      const check = async (what: string) => {
        room.applyStats(p);
        await wait(250);
        assert.deepEqual(clientStats(c.state.players.get(c.sessionId)), serverStats(p), `${cls}: ${what}`);
      };
      await check("starting kit");
      p.level = 10; p.ptSta = 2; p.ptStr = 1; p.ptMag = 4; p.ptDex = 3;
      await check("level 10 with assigned points");
      // high-level gear with stats in every slot: some pieces' requirements are unmet, so they count for neither side
      let n = 0, unmet = 0;
      for (let i = 1; i < 2000 && n < 8; i++) {
        const id = rollGear("demon", 40, () => (i * 0.6180339887) % 1), d = id ? gearDef(id) : undefined;
        if (!id || !d) continue;
        const g = gearStats(cls, { [d.slot]: id });
        if (!g.sta && !g.str && !g.mag && !g.dex) continue;
        if (gearReq(id, cls).level > p.level) unmet++;
        p[d.slot] = id; n++;
        await check(`${d.slot} ${id}`);
      }
      assert.ok(n >= 3, `wore at least 3 pieces with stats (${n})`);
      assert.ok(unmet > 0, "covered a piece whose level requirement is unmet");
      p.level = 50;
      await check("level 50: requirements now met");
      await c.leave();
    }
  } finally { await srv.stop(); }
});

test("hero stats: the real stat-point and equip messages keep client and server in step", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "wizard", newGame: true });
    await wait(300);
    const room = srv.room, p = room.state.players.get(c.sessionId);
    const agree = async (what: string) => {
      await wait(300);
      assert.deepEqual(clientStats(c.state.players.get(c.sessionId)), serverStats(p), what);
    };
    p.level = 10; room.applyStats(p);
    const mag = p.mag;
    c.send("stat", "mag");
    await agree("after spending a stat point");
    assert.equal(p.mag, mag + 1, "the point counted");
    p.bag.push("w_frost"); // +1 Magic
    c.send("equip", p.bag.length - 1);
    await agree("after equipping through the equip message");
    assert.equal(p.weapon, "w_frost", "equipped");
    await c.leave();
  } finally { await srv.stop(); }
});
