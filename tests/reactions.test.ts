import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyElementHit, ELEMENTS, newReactState, reactionActor, reactionOf, REACTIONS, REACTION_COOLDOWN_MS, REACTION_IDS,
  REACTION_MARK_MS, REACTION_SELF_FACTOR, reactionWords, lingerReaction, steamMiss, corrodeBonus, purifies, type Element,
} from "../shared/elements";
import { isSafeZone, isSolidAt, VILLAGE } from "../shared/map";
import { MOBS, TILE } from "../shared/constants";
import { startRoom, wait } from "./helpers/room";

// ---- Pure rules (shared/elements.ts) ----------------------------------------------------------------------------

test("reactions: the five pairs of the table, and nothing else", () => {
  assert.equal(reactionOf("cold", "shock"), "fracture");
  assert.equal(reactionOf("fire", "poison"), "toxic");
  assert.equal(reactionOf("fire", "cold"), "steam");
  assert.equal(reactionOf("shock", "poison"), "corrode");
  assert.equal(reactionOf("faith", "fire"), "purify");
  let pairs = 0;
  for (const a of ELEMENTS) for (const b of ELEMENTS) if (reactionOf(a, b)) pairs++;
  assert.equal(pairs, REACTION_IDS.length * 2, "each pair both ways, no other pair");
  for (const e of ELEMENTS) assert.equal(reactionOf(e, e), undefined, "an element never reacts with itself");
});

test("reactions: symmetric (mark A + hit B = mark B + hit A)", () => {
  for (const id of REACTION_IDS) {
    const [x, y] = REACTIONS[id].els as [Element, Element];
    for (const [m, h] of [[x, y], [y, x]] as [Element, Element][]) {
      const s = newReactState();
      assert.equal(applyElementHit(s, [m], "a", 0), undefined, "the first hit only marks");
      assert.equal(applyElementHit(s, [h], "b", 100)?.id, id, `${m} then ${h}`);
    }
  }
});

test("reactions: another hero's mark = 100%, own mark = 30%; the mark is used up", () => {
  const s = newReactState();
  applyElementHit(s, ["cold"], "a", 0);
  const r = applyElementHit(s, ["shock"], "b", 10)!;
  assert.equal(r.factor, 1);
  assert.equal(r.markBy, "a");
  assert.equal(s.el, undefined, "mark consumed");
  const t = newReactState();
  applyElementHit(t, ["cold"], "a", 0);
  assert.equal(applyElementHit(t, ["shock"], "a", 10)!.factor, REACTION_SELF_FACTOR);
  assert.equal(REACTION_SELF_FACTOR, 0.3);
});

test("reactions: a creature counts as its owner (reactionActor)", () => {
  const owners: Record<string, string> = { golem1: "hero", wisp7: "hero", blade3: "hero" };
  const own = (id: string) => owners[id];
  for (const c of Object.keys(owners)) assert.equal(reactionActor(c, own), "hero");
  assert.equal(reactionActor("other", own), "other");
  const s = newReactState();
  applyElementHit(s, ["fire"], reactionActor("hero", own), 0);
  assert.equal(applyElementHit(s, ["cold"], reactionActor("golem1", own), 10)!.factor, REACTION_SELF_FACTOR);
});

test("reactions: never in PvP", () => {
  const s = newReactState();
  assert.equal(applyElementHit(s, ["cold"], "a", 0, true), undefined);
  assert.equal(s.el, undefined, "no mark on a hero");
  applyElementHit(s, ["cold"], "a", 0);
  assert.equal(applyElementHit(s, ["shock"], "b", 10, true), undefined);
  assert.equal(s.el, "cold", "the mark is untouched");
});

test("reactions: the mark lasts 4 s", () => {
  assert.equal(REACTION_MARK_MS, 4000);
  const s = newReactState();
  applyElementHit(s, ["cold"], "a", 1000);
  assert.equal(reactionWords(s, 4999), "em_cold");
  assert.equal(applyElementHit({ ...s }, ["shock"], "b", 4999)?.id, "fracture", "just before 4 s");
  assert.equal(applyElementHit(s, ["shock"], "b", 5000), undefined, "at 4 s it is gone");
  assert.equal(s.el, "shock", "the late hit leaves its own mark instead");
});

test("reactions: 1 s cooldown per monster; hits meanwhile still mark", () => {
  assert.equal(REACTION_COOLDOWN_MS, 1000);
  const s = newReactState();
  applyElementHit(s, ["cold"], "a", 0);
  assert.ok(applyElementHit(s, ["shock"], "b", 100));
  applyElementHit(s, ["fire"], "a", 200); // marks fire
  assert.equal(applyElementHit(s, ["poison"], "b", 600), undefined, "still cooling down");
  assert.equal(s.el, "poison");
  applyElementHit(s, ["poison"], "b", 600);
  assert.equal(applyElementHit(s, ["shock"], "a", 1100)?.id, "corrode", "after 1 s it reacts again");
});

test("reactions: a hit with several elements reacts with the first that pairs", () => {
  const s = newReactState();
  applyElementHit(s, ["fire"], "a", 0);
  assert.equal(applyElementHit(s, ["fire", "poison"], "b", 10)?.id, "toxic");
});

test("reactions: Steam and Corrosion linger, scaled by the factor", () => {
  const s = newReactState();
  lingerReaction(s, "steam", 1, 0);
  assert.equal(steamMiss(s, 2999), REACTIONS.steam.miss);
  assert.equal(steamMiss(s, 3000), 0);
  lingerReaction(s, "corrode", REACTION_SELF_FACTOR, 0);
  assert.ok(Math.abs(corrodeBonus(s, 4999) - REACTIONS.corrode.resist * 0.3) < 1e-9);
  assert.equal(corrodeBonus(s, 5000), 0);
  assert.ok(purifies("skeleton") && purifies("demon") && !purifies("slime") && !purifies("bandit"));
});

// ---- Server (server/TownRoom.ts) --------------------------------------------------------------------------------

function openSpot(): [number, number] {
  for (let tx = VILLAGE.x0 - 14; tx > 0; tx--) {
    const x = (tx + 0.5) * TILE, y = (VILLAGE.y0 + 10.5) * TILE;
    if (!isSolidAt(x, y) && !isSafeZone(x, y) && !isSolidAt(x + 20, y) && !isSolidAt(x - 20, y)) return [x, y];
  }
  throw new Error("no open spot");
}

test("reactions in the room: two heroes, own creatures, PvP, damage and effects", async () => {
  const srv = await startRoom();
  try {
    const a = await srv.join(), b = await srv.join();
    await wait(200);
    const room = srv.room, A = room.state.players.get(a.sessionId), B = room.state.players.get(b.sessionId);
    const [x, y] = openSpot();
    let mobId = "", mob: any;
    room.state.mobs.forEach((m: any, id: string) => { if (!mobId && !m.owner && m.kind === "slime") { mobId = id; mob = m; } });
    room.state.mobs.forEach((_m: any, id: string) => { if (id !== mobId) room.state.mobs.delete(id); });
    assert.ok(mob, "a slime to hit");
    mob.x = x + 30; mob.y = y; mob.level = 20;
    for (const p of [A, B]) { p.x = x; p.y = y; p.level = 20; p.invulnUntil = 0; }
    const reacts: any[] = [];
    const bc = room.broadcast.bind(room);
    room.broadcast = (t: string, msg: any, ...r: any[]) => { if (t === "react") reacts.push(msg); return bc(t, msg, ...r); };
    const full = () => { mob.hp = mob.maxHp = 1e6; mob.dead = false; };
    const hit = (who: string, el: Element, opts: any = {}) => {
      const before = mob.hp;
      room.hitTarget(who, mobId, 10, [0, 0], { kb: 0, parts: [{ el, amt: 10 }], ...opts });
      return before - mob.hp;
    };
    full();

    // A marks cold, B's shock sets off Fracture at 100%; the mark shows in the monster's status words
    hit(a.sessionId, "cold");
    room.update(16);
    assert.match(mob.fx, /em_cold/);
    hit(b.sessionId, "shock");
    assert.equal(reacts.at(-1)?.r, "fracture");
    assert.equal(reacts.at(-1)?.f, 1);
    assert.equal(mob.react.el, undefined);

    // Same hero's own mark: 30%
    mob.react.cdUntil = 0;
    hit(a.sessionId, "fire");
    hit(a.sessionId, "cold");
    assert.equal(reacts.at(-1)?.r, "steam");
    assert.equal(reacts.at(-1)?.f, REACTION_SELF_FACTOR);

    // A's golem on A's mark: still A (30%), never "another hero"
    mob.react.cdUntil = 0;
    const gid = room.summon(a.sessionId, "golem_fire");
    const g = room.state.mobs.get(gid);
    g.x = x + 20; g.y = y;
    hit(a.sessionId, "poison");
    const n = reacts.length;
    room.summonStrike(g, gid, mobId, mob, MOBS.golem_fire);
    assert.equal(reacts.length, n + 1, "the golem's fire set off a reaction");
    assert.equal(reacts.at(-1)?.r, "toxic");
    assert.equal(reacts.at(-1)?.f, REACTION_SELF_FACTOR, "the golem counts as its owner");

    // B's golem... no: B hitting A's mark through a creature of B counts as B (100%)
    mob.react.cdUntil = 0;
    hit(a.sessionId, "shock");
    hit(b.sessionId, "poison", { pet: true });
    assert.equal(reacts.at(-1)?.r, "corrode");
    assert.equal(reacts.at(-1)?.f, 1);

    // Fracture adds 40% on the hit (no crit, same raw hit)
    mob.react = undefined; full();
    const plain = hit(b.sessionId, "shock"); // marks
    mob.react = undefined;
    hit(a.sessionId, "cold");
    const frac = hit(b.sessionId, "shock");
    assert.ok(frac > plain * 1.3, `fracture ${frac} vs plain ${plain}`);

    // Steam: a scalded monster's blow can miss (here always)
    mob.react.steamUntil = Date.now() + 3000; mob.react.steamMiss = 1;
    const hpA = A.hp;
    assert.equal(room.damagePlayer(a.sessionId, 5, "Slime", [0, 0], 0, { from: mobId }), false);
    assert.equal(A.hp, hpA, "the blow missed");
    mob.react.steamUntil = 0;

    // Toxic Blast: another monster next to the target takes poison
    const otherId = room.state.mobs.size + "_x";
    const { Mob } = await import("../server/TownRoom");
    const o = new Mob(); o.kind = "slime"; o.level = 20; o.hp = o.maxHp = 1e6; o.x = mob.x + 20; o.y = mob.y;
    room.state.mobs.set(otherId, o);
    mob.react = undefined;
    hit(a.sessionId, "fire");
    hit(b.sessionId, "poison");
    assert.equal(reacts.at(-1)?.r, "toxic");
    await wait(150);
    assert.ok(o.hp < o.maxHp, "the blast hurt the monster next to it");

    // Purification: heals the hero, and doubles on the undead
    mob.react = undefined;
    A.hp = Math.round(A.maxHp / 2);
    const hurt = A.hp;
    hit(b.sessionId, "faith");
    hit(a.sessionId, "fire");
    assert.equal(reacts.at(-1)?.r, "purify");
    assert.ok(A.hp > hurt, "a small heal");
    mob.kind = "skeleton"; mob.react = undefined;
    const fireSk = hit(a.sessionId, "fire"); // marks
    mob.react = undefined;
    hit(b.sessionId, "faith");
    const pur = hit(a.sessionId, "fire");
    assert.ok(pur > fireSk * 1.8, `purify on undead ${pur} vs ${fireSk}`);
    mob.kind = "slime";

    // PvP: heroes never get marked or react
    const n2 = reacts.length;
    room.hitTarget(a.sessionId, b.sessionId, 1, [0, 0], { kb: 0, parts: [{ el: "cold", amt: 1 }] });
    room.hitTarget(a.sessionId, b.sessionId, 1, [0, 0], { kb: 0, parts: [{ el: "shock", amt: 1 }] });
    assert.equal(reacts.length, n2);
    assert.equal(B.react, undefined);
    // ...nor a hero's creature (B hits A's golem)
    room.hitTarget(b.sessionId, gid, 1, [0, 0], { kb: 0, parts: [{ el: "cold", amt: 1 }] });
    room.hitTarget(a.sessionId, gid, 1, [0, 0], { kb: 0, parts: [{ el: "shock", amt: 1 }] });
    assert.equal(reacts.length, n2);
    assert.equal(g.react, undefined);
  } finally {
    await srv.stop();
  }
});
