import { test } from "node:test";
import assert from "node:assert/strict";
import { URSK } from "../shared/constants";
import { DEN } from "../shared/dungeon";
import { TILE } from "../shared/constants";
import { startRoom, wait } from "./helpers/room";

const until = async (f: () => unknown, ms: number) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await wait(50); return !!f(); };

test("Grandam Ursk: speaks on waking, enters the Rite and the Bear, hooks a far hero in, sews her brood back to heal", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    const said: string[] = [], phases: number[] = [];
    c.onMessage("bosssay", ({ text }: { text: string }) => said.push(text));
    c.onMessage("ursk", ({ phase }: { phase: number }) => phases.push(phase));
    const hits: string[] = [];
    c.onMessage("bhit", ({ kind }: { kind: string }) => hits.push(kind));
    await wait(200);
    const room = srv.room, pid = c.sessionId, p = room.state.players.get(pid);
    p.hp = p.maxHp = 999999;
    const bx = (DEN.x + 0.5) * TILE, by = (DEN.y - 1.5) * TILE;
    p.x = bx + 150; p.y = by; // well out of her claws
    room.summonFused(pid, { parts: ["hidemother"], level: 30, title: "Grandam Ursk, the Hide-Mother", hpMult: 2, x: bx, y: by }, 5);
    const [id, m] = [...room.state.mobs.entries()].find(([, o]: any) => o.kind === "hidemother")!;
    await until(() => said.length >= 3, 15_000); // her lines come on the room's ticks, which lag under load
    assert.deepEqual(said.slice(0, 3), [...URSK.lines.wake], "she has her say as she rises");

    // the Rite: below 70% she calls her brood and starts hooking heroes in
    m.hp = Math.round(m.maxHp * 0.6); m.target = pid;
    // a ranged hero keeping well away from her (a step back every moment) until the hook comes
    for (let i = 0; i < 200 && !hits.includes("hook"); i++) {
      if (!m.specialKind) { p.x = m.x + 170; p.y = m.y; }
      await wait(150);
      m.target = pid;
    }
    const pulled = Math.hypot(p.x - m.x, p.y - m.y) < 60;
    assert.ok(phases.includes(2), "the Rite begins");
    assert.ok(pulled && hits.includes("hook"), "the hook drags the far hero in to her");

    // her brood, sewn back in, mend her
    const kin = () => [...room.state.mobs.values()].filter((o: any) => o.mother === id && !o.dead).length;
    for (let i = 0; i < 120 && !kin(); i++) { await wait(150); m.target = pid; }
    assert.ok(kin() > 0, "she calls her brood");
    m.bcd.gather = 0; m.bcd.hook = Date.now() + 60000; m.bcd.maul = Date.now() + 60000; m.bcd.roar = Date.now() + 60000;
    const before = m.hp;
    for (let i = 0; i < 100 && m.hp <= before; i++) { await wait(150); m.target = pid; }
    assert.ok(m.hp > before, "gathering her children heals her");

    // the Bear
    m.hp = Math.round(m.maxHp * 0.3);
    for (let i = 0; i < 60 && !phases.includes(3); i++) { await wait(150); m.target = pid; }
    assert.ok(phases.includes(3), "she becomes the Bear below 35%");
    await c.leave();
  } finally {
    await srv.stop();
  }
});
