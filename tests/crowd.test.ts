// server/crowd.ts: monsters in a fight push out of each other's bodies, so a pack spreads instead of stacking.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MobGrid } from "../server/mobGrid";
import { bodyRadius, spreadCrowd, type CrowdUnit } from "../server/crowd";
import { CROWD, TILE, type MobKind } from "../shared/constants";
import { blocked } from "../shared/movement";

class Unit implements CrowdUnit {
  _gm: MobGrid<any> | null = null; _gid = ""; _gk = NaN; _gs = 0; _gb = false; _gv = 0;
  dead = false; hidden = false; merged = 1; winding = false;
  private _x: number; private _y: number;
  constructor(x: number, y: number, public kind: MobKind = "skeleton") { this._x = x; this._y = y; }
  get x() { return this._x; } set x(v) { this._x = v; this._gm?.moved(this); }
  get y() { return this._y; } set y(v) { this._y = v; this._gm?.moved(this); }
}

/** An open patch of ground (no wall within 3 tiles), so only the crowd moves them. */
function openSpot(): [number, number] {
  for (let ty = 20; ty < 200; ty++) for (let tx = 20; tx < 200; tx++) {
    const x = tx * TILE + 16, y = ty * TILE + 16;
    let ok = true;
    for (let dy = -96; dy <= 96 && ok; dy += 8) for (let dx = -96; dx <= 96 && ok; dx += 8) if (blocked(x + dx, y + dy)) ok = false;
    if (ok) return [x, y];
  }
  throw new Error("no open ground");
}
const anywhere = () => true;
const minGap = (us: Unit[]) => {
  let g = Infinity;
  for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) g = Math.min(g, Math.hypot(us[i].x - us[j].x, us[i].y - us[j].y));
  return g;
};

test("a pile of monsters on one spot spreads out to body distance", () => {
  const [x, y] = openSpot();
  const g = new MobGrid<Unit>();
  const us = Array.from({ length: 6 }, (_, i) => { const u = new Unit(x, y); g.set("m" + i, u); return u; });
  for (let t = 0; t < 120; t++) for (const u of us) spreadCrowd(g, u, anywhere);
  assert.ok(minGap(us) >= CROWD.r * 2 * 0.9, `closest pair ${minGap(us).toFixed(1)} px`);
});

test("a pack walking into one hero ends in a ring, not a stack", () => {
  const [x, y] = openSpot();
  const g = new MobGrid<Unit>();
  const us = Array.from({ length: 5 }, (_, i) => { const u = new Unit(x + 60 + i * 0.5, y + 1); g.set("m" + i, u); return u; });
  const reach = 22, speed = 1.5;
  for (let t = 0; t < 300; t++) for (const u of us) {
    const d = Math.hypot(x - u.x, y - u.y);
    if (d > reach) { u.x += (x - u.x) / d * speed; u.y += (y - u.y) / d * speed; } // walks straight at the hero like go()
    spreadCrowd(g, u, anywhere);
  }
  assert.ok(minGap(us) >= CROWD.r * 2 * 0.85, `closest pair ${minGap(us).toFixed(1)} px`);
  for (const u of us) assert.ok(Math.hypot(x - u.x, y - u.y) < reach + 30, "everyone still close to the hero");
});

test("a nudge is soft, never through a wall, and big monsters are wider", () => {
  const [x, y] = openSpot();
  const g = new MobGrid<Unit>();
  const a = new Unit(x, y), b = new Unit(x, y);
  g.set("a", a); g.set("b", b);
  spreadCrowd(g, a, anywhere);
  assert.ok(Math.hypot(a.x - x, a.y - y) <= CROWD.maxPush + 1e-6);
  const c = new Unit(x + 1, y);
  g.set("c", c);
  assert.equal(spreadCrowd(g, c, () => false), false, "nowhere to stand: stays");
  assert.ok(bodyRadius(new Unit(0, 0, "demon")) > bodyRadius(new Unit(0, 0, "skeleton")));
});
