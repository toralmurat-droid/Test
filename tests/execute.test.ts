// Execution after a poise break (shared/combat.ts EXECUTE, server TownRoom.execute).
import { test } from "node:test";
import assert from "node:assert/strict";
import { canExecute, EXECUTE, executeDamage, executeRefund } from "../shared/combat";
import { OVERLOAD } from "../shared/overload";
import { TILE } from "../shared/constants";
import { blocked } from "../shared/movement";
import { isSafeZone } from "../shared/map";
import { noMobsAt } from "../shared/spawns";
import { startRoom, wait } from "./helpers/room";

test("rules: only the hero's own blow on a broken target, once", () => {
  const t = { broken: true, execSpent: false };
  assert.ok(canExecute({ basic: true }, t));
  assert.ok(canExecute({ skill: true }, t));
  assert.ok(!canExecute({ basic: true }, { broken: false }), "not broken");
  assert.ok(!canExecute({ basic: true }, { broken: true, execSpent: true }), "already executed");
  for (const o of [{ skill: true, pet: true }, { skill: true, dot: true }, { basic: true, rune: true }, { thorn: true }, {}]) assert.ok(!canExecute(o, t), JSON.stringify(o));
});

test("rules: x2, x1.5 on bosses, a crit is not doubled again", () => {
  assert.equal(executeDamage(100, false, false), 100 * EXECUTE.mult);
  assert.equal(executeDamage(100, false, true), 100 * EXECUTE.bossMult);
  assert.equal(executeDamage(200, true, false), 200, "a crit (x2) stays x2");
});

test("rules: Heat drops (a vent gets shorter), Wizard and Summoner get Mana", () => {
  const k = { energy: 50 };
  executeRefund(k, "vampire", OVERLOAD.max);
  assert.equal(k.energy, 50 - OVERLOAD.max * EXECUTE.heatBack);
  const low = { energy: 10 };
  executeRefund(low, "knight", OVERLOAD.max);
  assert.equal(low.energy, 0, "never below 0");
  const hot = { energy: -80 };
  executeRefund(hot, "knight", OVERLOAD.max);
  assert.equal(hot.energy, -80 + OVERLOAD.max * EXECUTE.heatBack, "still venting, but less");
  const w = { energy: 40, mana: 10, maxMana: 200 };
  executeRefund(w, "wizard", OVERLOAD.max);
  assert.deepEqual([w.energy, w.mana], [40, 10 + 200 * EXECUTE.manaBack]);
  const full = { mana: 195, maxMana: 200 };
  executeRefund(full, "summoner", OVERLOAD.max);
  assert.equal(full.mana, 200, "capped at max Mana");
});

/** A clear patch of open ground near (tx, ty) tiles. */
function openAt(tx: number, ty: number, r = 60): { x: number; y: number } {
  for (let d = 0; d < 60; d++) for (let a = 0; a < 16; a++) {
    const x = (tx + Math.cos(a / 16 * Math.PI * 2) * d) * TILE, y = (ty + Math.sin(a / 16 * Math.PI * 2) * d) * TILE;
    let ok = true;
    for (let k = 0; k < 12 && ok; k++) { const px = x + Math.cos(k) * r * (k % 3) / 2, py = y + Math.sin(k) * r * (k % 3) / 2; ok = !blocked(px, py) && !isSafeZone(px, py) && !noMobsAt(px, py); }
    if (ok) return { x, y };
  }
  throw new Error("no open ground");
}

test("server: a broken monster takes one execution per break, never from a creature, never on a hero", async () => {
  const srv = await startRoom();
  try {
    const c = await srv.join({ cls: "knight" }), c2 = await srv.join({ cls: "knight" });
    const ex: string[] = [];
    c.onMessage("hit", (m: { id: string; ex?: number }) => { if (m.ex) ex.push(m.id); });
    await wait(200);
    const room = srv.room, pid = c.sessionId, p = room.state.players.get(pid), q = room.state.players.get(c2.sessionId);
    const o = openAt(40, 120);
    room.state.mobs.forEach((x: any, xid: string) => { if (Math.hypot(x.x - o.x, x.y - o.y) < 400) room.state.mobs.delete(xid); });
    p.hp = p.maxHp = 999999; p.x = o.x; p.y = o.y; p.invulnUntil = 0;

    const mob = (id: string, kind: string) => {
      room.spawnMob(kind, -1, id, { x: o.x + 30, y: o.y, level: p.level });
      const m = room.state.mobs.get(id);
      m.hp = m.maxHp = 1e7; m.lastAttack = Date.now() + 1e6;
      return m;
    };
    const breakIt = (m: any) => { m.broken = true; m.brokenUntil = Date.now() + 60000; m.execSpent = false; };
    const blow = (id: string, dmg: number, opts: Record<string, unknown>) => {
      const m = room.state.mobs.get(id), before = m.hp;
      room.hitTarget(pid, id, dmg, [0, 0], { kb: 0, ...opts });
      return before - m.hp;
    };

    // Plain monster: x2, then plain hits until it breaks again
    const s = mob("xslime", "slime");
    assert.equal(blow("xslime", 100, { basic: true }), 100, "not broken: a plain hit");
    breakIt(s);
    p.energy = 60;
    assert.equal(blow("xslime", 100, { basic: true }), 200, "execution: x2");
    assert.equal(p.energy, 60 - OVERLOAD.max * EXECUTE.heatBack, "Heat comes back down");
    assert.equal(blow("xslime", 100, { skill: true }), 100, "one execution per break");
    assert.equal(blow("xslime", 200, { basic: true, crit: true }), 200, "still spent, even for a crit");
    // a fresh break (a real poise break from a hit) brings a new execution
    s.broken = false; s.steadyUntil = 0; s.poiseLost = 0;
    blow("xslime", 1e6, { basic: true });
    assert.ok(s.broken, "a big hit breaks it");
    assert.equal(blow("xslime", 100, { skill: true }), 200, "the new break can be executed by a skill");
    // a critical execution is not doubled twice
    breakIt(s);
    assert.equal(blow("xslime", 200, { basic: true, crit: true }), 200, "crit + execution = x2");

    // Boss (elite): x1.5
    const n = mob("xnecro", "necromancer");
    breakIt(n);
    assert.equal(blow("xnecro", 100, { basic: true }), 150, "x1.5 on an elite");
    // Quest boss (any monster with a title): x1.5
    const b = mob("xboss", "bandit");
    b.title = "Rask the Reaver";
    breakIt(b);
    assert.equal(blow("xboss", 100, { basic: true }), 150, "x1.5 on a quest boss");

    // A hero's creature never executes, and leaves the execution for the hero
    const g = mob("xslime2", "slime");
    breakIt(g);
    assert.equal(blow("xslime2", 100, { skill: true, pet: true }), 100, "a golem's blow is a plain hit");
    assert.equal(blow("xslime2", 100, { dot: true }), 100, "damage over time is a plain hit");
    assert.equal(g.execSpent, false, "still there for the hero");
    assert.equal(blow("xslime2", 100, { basic: true }), 200);

    // Never on a hero
    q.hp = q.maxHp = 999999; q.x = o.x + 10; q.y = o.y; q.invulnUntil = 0;
    const heroHit = () => { const before = q.hp; room.hitTarget(pid, c2.sessionId, 100, [0, 0], { kb: 0, basic: true }); return before - q.hp; };
    const plain = heroHit();
    q.broken = true; q.brokenUntil = Date.now() + 60000;
    assert.ok(plain > 0, "the hero can be hurt here");
    assert.equal(heroHit(), plain, "a broken hero takes a plain hit");

    await wait(100);
    assert.deepEqual(ex.sort(), ["xboss", "xnecro", "xslime", "xslime", "xslime", "xslime2"].sort(), "the clients are told about each execution");
  } finally {
    await srv.stop();
  }
});
