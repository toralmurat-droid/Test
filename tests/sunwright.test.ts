import { test } from "node:test";
import assert from "node:assert/strict";
import { BEAST, SUNWRIGHT, TILE } from "../shared/constants";
import { D, FURNACE } from "../shared/desert";
import { startRoom, wait } from "./helpers/room";

test("Ishael the Sunwright: speaks on waking, calls her choir, Zenith spares only her shadow, becomes the Second Sun", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" });
    const said: string[] = [], phases: number[] = [], hits: { kind: string; choir?: number }[] = [];
    c.onMessage("bosssay", ({ text }: { text: string }) => said.push(text));
    c.onMessage("sunwright", ({ phase }: { phase: number }) => phases.push(phase));
    c.onMessage("bhit", (h: { kind: string; choir?: number }) => hits.push(h));
    const blows: Record<string, number> = {}; // biggest single hit taken by each hero
    c.onMessage("hit", ({ id, dmg }: { id: string; dmg: number }) => { blows[id] = Math.max(blows[id] ?? 0, dmg); });
    await wait(200);
    const room = srv.room, pid = c.sessionId, p = room.state.players.get(pid);
    p.hp = p.maxHp = 999999; p.level = 50;
    const bx = (FURNACE.x + 0.5) * TILE, by = (D(FURNACE.y) - 1) * TILE;
    p.x = bx + 120; p.y = by;
    room.summonFused(pid, { parts: ["sunwright"], level: 50, title: "Ishael, the Sunwright", hpMult: 2, x: bx, y: by }, 6);
    const [id, m] = [...room.state.mobs.entries()].find(([, o]: any) => o.kind === "sunwright")!;
    assert.equal(m.level, 50, "Act 2 boss level");
    await wait(4300);
    assert.deepEqual(said.slice(0, 3), [...SUNWRIGHT.lines.wake], "she has her say as she turns");

    // the Choir: below 65% her adepts come
    m.hp = Math.round(m.maxHp * 0.6); m.target = pid;
    const choir = () => [...room.state.mobs.values()].filter((o: any) => o.mother === id && !o.dead).length;
    for (let i = 0; i < 40 && !choir(); i++) { await wait(150); m.target = pid; }
    assert.ok(phases.includes(2), "the Choir begins");
    assert.ok(choir() > 0, "her adepts come up the stair");

    // Zenith: a hero far out burns, a hero hugging her is spared
    for (const k of Object.keys(m.bcd)) m.bcd[k] = Date.now() + 60000;
    m.bcd.zenith = 0;
    const far = await srv.join({ cls: "knight" });
    await wait(200);
    const q = room.state.players.get(far.sessionId);
    q.hp = q.maxHp = 999999;
    q.x = m.x + 150; q.y = m.y; p.x = m.x + 20; p.y = m.y;
    const hq0 = q.hp;
    for (let i = 0; i < 30 && !hits.some((h) => h.kind === "zenith"); i++) {
      p.x = m.x + 20; p.y = m.y; q.x = m.x + 150; q.y = m.y;
      await wait(150); m.target = pid;
    }
    const z = hits.find((h) => h.kind === "zenith");
    assert.ok(z, "Zenith lands");
    assert.ok(z!.choir! > 0, "her choir made it hotter");
    assert.ok(q.hp < hq0, "the far hero burns");
    await wait(100);
    // the near hero takes staff blows and sunbolts, but never the Zenith: no blow anywhere near as big
    assert.ok((blows[pid] ?? 0) < blows[far.sessionId] / 2, "her shadow is safe");

    // the Second Sun
    m.hp = Math.round(m.maxHp * 0.25);
    for (let i = 0; i < 10 && !phases.includes(3); i++) { await wait(150); m.target = pid; }
    assert.ok(phases.includes(3), "she becomes the Second Sun below 30%");
    assert.ok(BEAST.zenith.inner < 60);
    await far.leave();
    await c.leave();
  } finally {
    await srv.stop();
  }
});
