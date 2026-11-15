// client/src/warMap.ts: the pure helpers behind the war overlays on the maps (layout, geometry, texts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrowHead, cartAt, edgeSegment, fmtCountdown, fmtIn, frontSegments, holdTip, panelLayout, panelRowAt, placeTip, rimPoint, rimTargets } from "../client/src/warMap";
import { CLAN_KEYS } from "../shared/war/clans";
import { frontEdges } from "../shared/war/intel";
import { TERRITORIES } from "../shared/war/territories";
import type { WarView } from "../shared/war/view";

const view = (over: Partial<WarView> = {}): WarView => ({ tick: 1, next: 0, owner: TERRITORIES.map((t) => Math.max(0, CLAN_KEYS.indexOf(t.capitalOf ?? "wardens"))), control: TERRITORIES.map(() => 72), sieges: [], ...over });

test("fmtCountdown and fmtIn", () => {
  assert.equal(fmtCountdown(34 * 60000 + 10000), "34:10");
  assert.equal(fmtCountdown(3600000 + 5 * 60000 + 9000), "1:05:09");
  assert.equal(fmtCountdown(-5), "0:00");
  assert.equal(fmtIn(34 * 60000), "34 min");
  assert.equal(fmtIn(65 * 60000), "1 h 5 min");
  assert.equal(fmtIn(20000), "under a minute");
});

test("calls panel: rows stack inside the box, hit test finds them", () => {
  assert.equal(panelLayout(0, 600), undefined);
  const l = panelLayout(5, 600)!;
  assert.equal(l.rows.length, 5);
  for (const r of l.rows) assert.ok(r.x >= l.x && r.x + r.w <= l.x + l.w && r.y + r.h <= l.y + l.h);
  assert.equal(panelRowAt(l, l.rows[2].x + 4, l.rows[2].y + 4), 2);
  assert.equal(panelRowAt(l, 500, 500), -1);
  assert.ok(panelLayout(1, 200)!.w <= 200 - 16); // never wider than a small canvas
});

test("tooltip stays inside the canvas", () => {
  for (const [px, py] of [[0, 0], [790, 10], [10, 590], [795, 595], [400, 300]]) {
    const p = placeTip(px, py, 220, 70, 800, 600);
    assert.ok(p.x >= 0 && p.y >= 0 && p.x + 220 <= 800 && p.y + 70 <= 600, `${px},${py} -> ${p.x},${p.y}`);
  }
});

test("rimPoint: inside stays, outside lands on the rim", () => {
  assert.equal(rimPoint(90, 80, 84, 84, 70).off, false);
  const r = rimPoint(284, 84, 84, 84, 70);
  assert.equal(r.off, true);
  assert.ok(Math.abs(r.x - 154) < 1e-6 && Math.abs(r.y - 84) < 1e-6 && Math.abs(r.a) < 1e-9);
});

test("arrowHead points at the target with wings behind it", () => {
  const [tip, l, r] = arrowHead(0, 0, 100, 0, 10);
  assert.deepEqual(tip, [100, 0]);
  assert.ok(l[0] < 100 && r[0] < 100 && Math.abs(l[1] + r[1]) < 1e-9 && l[1] !== r[1]);
});

test("cartAt runs along the line and wraps", () => {
  const a = { x: 0, y: 0 }, b = { x: 100, y: 50 };
  assert.deepEqual(cartAt(a, b, 0, 1000, 0), { x: 0, y: 0 });
  assert.deepEqual(cartAt(a, b, 500, 1000, 0), { x: 50, y: 25 });
  assert.deepEqual(cartAt(a, b, 1500, 1000, 0), { x: 50, y: 25 });
  assert.deepEqual(cartAt(a, b, 0, 1000, 0.25), { x: 25, y: 12.5 });
});

test("edgeSegment: facing rects share a straight border, links give none", () => {
  const T = (id: number, x: number, y: number, w: number, h: number) => ({ id, name: "", act: 1, region: "r", x, y, w, h, cx: x + w / 2, cy: y + h / 2, levels: [1, 1], near: [] }) as never;
  assert.deepEqual(edgeSegment(T(0, 0, 0, 10, 10), T(1, 14, 2, 10, 10)), [12, 2, 12, 10]);
  assert.deepEqual(edgeSegment(T(0, 0, 0, 10, 10), T(1, 2, 14, 10, 10)), [2, 12, 10, 12]);
  assert.equal(edgeSegment(T(0, 0, 0, 10, 10), T(1, 500, 500, 10, 10)), undefined);
  const d = edgeSegment(T(0, 0, 0, 10, 10), T(1, 14, 14, 10, 10))!;
  assert.equal(d.length, 4);
});

test("frontSegments: at most one segment per front edge, none when one clan holds all", () => {
  const v = view();
  assert.ok(frontSegments(v.owner).length <= frontEdges(v.owner).length);
  assert.equal(frontSegments(TERRITORIES.map(() => 0)).length, 0);
});

test("holdTip names the camp, Control and the siege", () => {
  const t = TERRITORIES.find((x) => x.capitalOf === "redfang") ?? TERRITORIES[0];
  const tip = holdTip(view({ sieges: [[t.id, 0, 1_000_000 + 34 * 60000]] }), t.id, 1_000_000);
  assert.match(tip[0], /· /);
  assert.ok(tip.some((l) => l === "Control 72%"));
  assert.ok(tip.some((l) => l === "Siege by Wardens in 34 min"));
  assert.deepEqual(holdTip(view({ sieges: [[t.id, 0, 1_000_000 + 34 * 60000]] }), t.id, 1_000_000, false), [t.name, "Siege by Wardens in 34 min"]);
});

test("rimTargets: the writ land and the nearest own siege, none for the unsworn", () => {
  const a = TERRITORIES[0].id, b = TERRITORIES[TERRITORIES.length - 1].id;
  const v = view({ owner: TERRITORIES.map(() => 0), sieges: [[a, 1, 5], [b, 1, 5]] });
  const me = { x: TERRITORIES[0].cx * 32, y: TERRITORIES[0].cy * 32 };
  const out = rimTargets(v, "wardens", { t: b, clan: "wardens" }, me);
  assert.equal(out.length, 2);
  assert.equal(out[0].color, "#ffd166");
  assert.deepEqual(rimTargets(v, undefined, null, me), []);
});
