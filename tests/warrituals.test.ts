import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE } from "../shared/constants";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { CRYPT_DOOR, SINKHOLE, UNDER_SHAFT } from "../shared/dungeon";
import { WAYGATE_DESERT, WAYGATE_OAKVALE } from "../shared/desert";
import { isSafeZone, isSolidAt, PORTAL_SPOTS, SHRINE_SPOT } from "../shared/map";
import { NPC_DECOR, NPCS } from "../shared/npcs";
import { noMobsAt } from "../shared/spawns";
import { channelStep, pauseStep, RITUAL, RITUAL_PHASE, ritualDay, ritualPay, ritualRate, ritualSite, ritualSpot, ritualTime, type RitualHold } from "../shared/war/rituals";
import { bordersOf, newWar, timeBonus, WAR } from "../shared/war/rules";
import { HOLD_FORT_PX, HOLDS, STANDARD, STANDARDS } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";
import { warPhase } from "../shared/war/view";

test("rituals: every land has a deterministic, walkable, legal circle spot", () => {
  for (const T of TERRITORIES) {
    const s = ritualSpot(T.id);
    assert.ok(s, `${T.name}: a spot`);
    assert.deepEqual(ritualSpot(T.id), s, "cached and stable");
    const tx = Math.floor(s.x / TILE), ty = Math.floor(s.y / TILE);
    assert.ok(tx >= T.x && ty >= T.y && tx < T.x + T.w && ty < T.y + T.h, `${T.name}: inside the land`);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = s.x + dx * TILE, y = s.y + dy * TILE;
      assert.ok(!isSolidAt(x, y) && !isSafeZone(x, y) && !noMobsAt(x, y), `${T.name}: free 3x3`);
    }
    for (const h of HOLDS) assert.ok(Math.max(Math.abs(h.x - s.x), Math.abs(h.y - s.y)) >= HOLD_FORT_PX + TILE, `${T.name}: clear of every Hold's fort`);
    for (const st of STANDARDS) assert.ok(Math.hypot(st.x - s.x, st.y - s.y) >= STANDARD.range + TILE, `${T.name}: clear of every standard's ring`);
    for (const n of [...NPCS.map((n) => ({ x: n.x / TILE, y: n.y / TILE })), ...NPC_DECOR]) assert.ok(Math.hypot(n.x - s.x / TILE, n.y - s.y / TILE) >= RITUAL.npcKeepTiles, `${T.name}: clear of NPCs`);
    for (const p of [...PORTAL_SPOTS, SINKHOLE, CRYPT_DOOR, UNDER_SHAFT, WAYGATE_OAKVALE, WAYGATE_DESERT, SHRINE_SPOT])
      assert.ok(Math.hypot(p.x + 0.5 - s.x / TILE, p.y + 0.5 - s.y / TILE) >= RITUAL.entranceKeepTiles, `${T.name}: clear of portal stones and entrances`);
  }
});

test("rituals: the site is the most pressed Veiled border (defence) or the Veiled siege (attack), deterministically", () => {
  const s = newWar(), borders = bordersOf(s, "veiled");
  assert.ok(borders.length > 1);
  assert.deepEqual(ritualSite(s), { t: Math.min(...borders), mode: "defend" }, "no pressure: the lowest id");
  s.pressure[borders[1]] = 40; s.pressure[borders[0]] = 10;
  assert.deepEqual(ritualSite(s), { t: borders[1], mode: "defend" }, "the most pressed border");
  assert.deepEqual(ritualSite(s), ritualSite(JSON.parse(JSON.stringify(s))), "same state, same site");
  const foe = TERRITORIES.findIndex((t, i) => s.owner[i] !== "veiled" && !t.capitalOf);
  s.siege[foe] = { by: "veiled", at: s.tick + 3 };
  assert.deepEqual(ritualSite(s), { t: foe, mode: "attack" }, "a Veiled siege comes first");
  s.siege[foe] = { by: "redfang", at: s.tick + 3 };
  assert.equal(ritualSite(s)?.mode, "defend", "another clan's siege is not a ritual target");
  for (let i = 0; i < s.owner.length; i++) s.owner[i] = "wardens";
  s.siege.fill(null);
  assert.equal(ritualSite(s), undefined, "no Veiled land: no ritual");
});

test("rituals: they run in the Veiled's doctrine phase (noon) only, one day phase per noon", () => {
  assert.equal(RITUAL_PHASE, 0, "rules.ts gives the Veiled their bonus at noon");
  assert.ok(timeBonus("veiled", RITUAL_PHASE) === WAR.doctrine && timeBonus("veiled", 1) === 1 && timeBonus("veiled", 2) === 1);
  const day0 = 100 * DAY_CYCLE_MS;
  for (let f = 0; f < 1; f += 0.005) assert.equal(ritualTime(day0 + f * DAY_CYCLE_MS), warPhase(day0 + f * DAY_CYCLE_MS) === 0);
  assert.ok(ritualTime(day0 + 0.3 * DAY_CYCLE_MS) && !ritualTime(day0 + 0.62 * DAY_CYCLE_MS) && !ritualTime(day0 + 0.8 * DAY_CYCLE_MS));
  // one noon runs from 0.965 of one day to 0.6 of the next: one ritualDay all through, a new one at the next noon
  const noon = ritualDay(day0 + 0.97 * DAY_CYCLE_MS);
  assert.equal(ritualDay(day0 + 1.3 * DAY_CYCLE_MS), noon);
  assert.equal(ritualDay(day0 + 1.59 * DAY_CYCLE_MS), noon);
  assert.equal(ritualDay(day0 + 1.97 * DAY_CYCLE_MS), noon + 1);
  assert.equal(ritualDay(day0 + 0.9 * DAY_CYCLE_MS), noon - 1, "night before belongs to the earlier day phase");
});

test("rituals: channel speed, pause hysteresis and the valor cap", () => {
  assert.equal(ritualRate(0), 1);
  assert.equal(ritualRate(1), 1 + RITUAL.heroSpeed);
  assert.equal(ritualRate(99), ritualRate(RITUAL.maxHelpers), "helpers capped");
  assert.equal(channelStep(0, RITUAL.channelMs / 2, 0, false), 0.5);
  assert.equal(channelStep(0.5, RITUAL.channelMs, 0, false), 1, "never past 1");
  assert.equal(channelStep(0.3, 5000, 2, true), 0.3, "paused: stands still");
  assert.ok(channelStep(0, 1000, 2, false) > channelStep(0, 1000, 0, false), "helpers speed it up");
  const h: RitualHold = { paused: false, since: 0 };
  assert.equal(pauseStep(h, 1, 0, 0), false, "a rival trooper starts the clock");
  assert.equal(pauseStep(h, 1, 0, RITUAL.pauseMs - 1), false);
  assert.equal(pauseStep(h, 1, 0, RITUAL.pauseMs), true, "paused after pauseMs straight");
  assert.ok(h.paused);
  assert.equal(pauseStep(h, 0, 0, RITUAL.pauseMs + 100), false);
  assert.equal(pauseStep(h, 1, 0, RITUAL.pauseMs + 200), false, "a rival back: the resume clock starts over");
  assert.equal(pauseStep(h, 0, 0, RITUAL.pauseMs + 300), false);
  assert.equal(pauseStep(h, 0, 0, RITUAL.pauseMs + 300 + RITUAL.resumeMs - 1), false);
  assert.equal(pauseStep(h, 0, 0, RITUAL.pauseMs + 300 + RITUAL.resumeMs), true, "resumed after resumeMs straight");
  const g: RitualHold = { paused: false, since: 0 };
  pauseStep(g, RITUAL.heroWeight, RITUAL.heroWeight, 0); pauseStep(g, RITUAL.heroWeight, RITUAL.heroWeight, 60_000);
  assert.equal(g.paused, false, "a Veiled hero holds off a rival hero");
  assert.equal(ritualPay(RITUAL.ritualValor, 0), Math.min(RITUAL.ritualValor, RITUAL.maxValorPerTick));
  assert.equal(ritualPay(RITUAL.disruptValor, RITUAL.maxValorPerTick - 2), 2, "capped per land, clan and war tick");
  assert.equal(ritualPay(5, RITUAL.maxValorPerTick), 0);
});
