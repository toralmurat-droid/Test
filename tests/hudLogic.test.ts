// client/src/hudLogic.ts holds the pure bits behind the orbs, the level-up note and the Group panel.
import { test } from "node:test";
import assert from "node:assert/strict";
import { orbNeedsRedraw, orbTexts, showLevelNote, nearbyEmptyMessage, type OrbShown } from "../client/src/hudLogic";

const prev = (o: Partial<OrbShown> = {}): OrbShown => ({ hp: 1, mp: 1, at: 1000, hpTxt: "100 / 100", mpTxt: "50 / 50", ...o });

test("orbNeedsRedraw: a max that grows at full HP redraws although the fill is unchanged", () => {
  assert.equal(orbNeedsRedraw(prev(), 1, 1, "500 / 500", "50 / 50", 1010), true);
});

test("orbNeedsRedraw: same fill and text, not moving, does not redraw", () => {
  assert.equal(orbNeedsRedraw(prev(), 1, 1, "100 / 100", "50 / 50", 5000), false);
});

test("orbNeedsRedraw: partial fill with a changed text is throttled to 120 ms", () => {
  const p = prev({ hp: 0.5 });
  assert.equal(orbNeedsRedraw(p, 0.5, 1, "49 / 100", "50 / 50", 1119), false);
  assert.equal(orbNeedsRedraw(p, 0.5, 1, "49 / 100", "50 / 50", 1120), true);
});

test("orbNeedsRedraw: a fill change of 0.004 or more redraws", () => {
  assert.equal(orbNeedsRedraw(prev({ hp: 1, mp: 1 }), 1, 0.99, "100 / 100", "50 / 50", 5000), true);
  assert.equal(orbNeedsRedraw(prev({ hp: 0.5, mp: 1 }), 0.504, 1, "100 / 100", "50 / 50", 1010), true);
  assert.equal(orbNeedsRedraw(prev({ hp: 0.5, mp: 1 }), 0.503, 1, "100 / 100", "50 / 50", 1010), false); // partial fill: throttled
});

test("orbNeedsRedraw: a hit that moves fill and text redraws at once, even inside the slosh throttle", () => {
  assert.equal(orbNeedsRedraw(prev({ hp: 0.5, mp: 1, hpTxt: "50 / 100" }), 0.3, 1, "30 / 100", "50 / 50", 1030), true);
});

test("orbTexts: hp rounds up, mp down, maxima round", () => {
  assert.deepEqual(orbTexts(10.2, 99.5, 7.9, 20.4), { hpTxt: "11 / 100", mpTxt: "7 / 20" });
});

test("showLevelNote: only while stat points are free", () => {
  assert.equal(showLevelNote(0), false);
  assert.equal(showLevelNote(1), true);
  assert.equal(showLevelNote(-3), false);
});

test("nearbyEmptyMessage: tells apart nobody nearby from everyone in the group", () => {
  assert.match(nearbyEmptyMessage(0), /^Nobody close by/);
  assert.match(nearbyEmptyMessage(1), /^Everyone nearby is in your group/);
  assert.match(nearbyEmptyMessage(4), /^Everyone nearby is in your group/);
});
