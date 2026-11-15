import { test } from "node:test";
import assert from "node:assert/strict";
import { dirInput, MAP_H, MAP_W, PLAYER_RADIUS, TILE } from "../shared/constants";
import { DOORS, isSolidTile, PORTAL_SPOTS, WORLD } from "../shared/map";
import { blocked, moveStep, nearestFree } from "../shared/movement";
import { NPCS } from "../shared/npcs";
import { BOARDS } from "../shared/bounty";
import { CHESTS } from "../shared/chests";
import { LINKS } from "../shared/dungeon";
import { CLAN_KEYS, type ClanKey } from "../shared/war/clans";
import {
  anyHoldWall, BLOCKING, FORT_PLANS, fortOf, HOLD_WALL_KEEP, holdReachPx, holdTiles, holdWallAt, liveHoldWall, REACH_BOX, setHoldOwners, touchesHoldWall, type FortCell,
} from "../shared/war/holdWalls";
import { fortDetour } from "../shared/war/holdRoutes";
import { garrisonSpots, patrolOf, TROOP } from "../shared/war/patrols";
import { HOLDS, STANDARDS } from "../shared/war/standards";
import { TERRITORIES } from "../shared/war/territories";

const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const allOwned = (k: ClanKey) => TERRITORIES.map(() => k);

/** Tiles reachable 4-way from the edge of the box (half-size B round (cx, cy)) over open ground; `wall` blocks too. */
function reachable(cx: number, cy: number, B: number, wall: (x: number, y: number) => boolean): Set<number> {
  const open = (x: number, y: number) => Math.abs(x - cx) <= B && Math.abs(y - cy) <= B && !isSolidTile(x, y) && !wall(x, y);
  const seen = new Set<number>(), q: [number, number][] = [];
  for (let y = cy - B; y <= cy + B; y++) for (let x = cx - B; x <= cx + B; x++)
    if ((Math.abs(x - cx) === B || Math.abs(y - cy) === B) && open(x, y)) { seen.add(y * MAP_W + x); q.push([x, y]); }
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy, k = ny * MAP_W + nx; if (!seen.has(k) && open(nx, ny)) { seen.add(k); q.push([nx, ny]); } }
  }
  return seen;
}

/** Ways in through the wall: groups of 4-adjacent gate cells. */
const openings = (cells: FortCell[]) => {
  const gates = cells.filter((c) => c.kind === "gate"), seen = new Set<FortCell>();
  let n = 0;
  for (const g of gates) {
    if (seen.has(g)) continue;
    n++;
    const q = [g]; seen.add(g);
    while (q.length) { const c = q.pop()!; for (const o of gates) if (!seen.has(o) && Math.abs(o.dx - c.dx) + Math.abs(o.dy - c.dy) === 1) { seen.add(o); q.push(o); } }
  }
  return n;
};

test("hold walls: each clan builds a clearly different fort (size, shape, gates), the middle open, a front gate east", () => {
  const want: Record<ClanKey, { w: number; h: number; gates: [number, number] }> = {
    wardens: { w: 9, h: 9, gates: [2, 2] }, redfang: { w: 10, h: 6, gates: [3, 6] }, host: { w: 7, h: 7, gates: [1, 1] },
    hidekin: { w: 8, h: 8, gates: [2, 2] }, veiled: { w: 9, h: 9, gates: [1, 1] },
  };
  const sigs = new Set<string>();
  for (const k of CLAN_KEYS) {
    const p = FORT_PLANS[k], w = want[k], n = openings(p.cells);
    assert.equal(p.w, w.w, `${k} width`); assert.equal(p.h, w.h, `${k} height`);
    assert.ok(n >= w.gates[0] && n <= w.gates[1], `${k}: ${n} ways in`);
    assert.equal(p.cells.find((c) => c.dx === 0 && c.dy === 0)?.kind, "court", `${k}: the Hold's middle is open ground`);
    assert.ok(p.cells.some((c) => c.kind === "gate" && c.dy === 0 && c.dx > 0 && !p.cells.some((o) => o.dy === 0 && o.dx > c.dx)), `${k}: front gate on the east side`);
    const walls = p.cells.filter((c) => BLOCKING.has(c.kind)).map((c) => `${c.dx},${c.dy}`).sort().join(" ");
    sigs.add(walls);
    // on open ground, every courtyard cell is reachable through a gate (4-way: a hero never squeezes past a touching corner)
    const wallAt = new Set(p.cells.filter((c) => BLOCKING.has(c.kind)).map((c) => `${c.dx},${c.dy}`)), B = Math.max(p.w, p.h);
    const seen = new Set([`${-B},0`]), q: [number, number][] = [[-B, 0]];
    for (let y = -B; y <= B; y++) for (let x = -B; x <= B; x++) if (Math.abs(x) === B || Math.abs(y) === B) { seen.add(`${x},${y}`); q.push([x, y]); }
    while (q.length) { const [x, y] = q.pop()!; for (const [dx, dy] of N4) { const s = `${x + dx},${y + dy}`; if (Math.abs(x + dx) <= B && Math.abs(y + dy) <= B && !seen.has(s) && !wallAt.has(s)) { seen.add(s); q.push([x + dx, y + dy]); } } }
    for (const c of p.cells) if (c.kind === "court" || c.kind === "gate") assert.ok(seen.has(`${c.dx},${c.dy}`), `${k}: (${c.dx},${c.dy}) reachable`);
  }
  assert.equal(sigs.size, CLAN_KEYS.length, "no two clans share a wall layout");
  // features the art draws: the Wardens' tower, Redfang tents, the Host's corner towers, the Hide-Kin mound
  const has = (k: ClanKey, kind: string) => FORT_PLANS[k].cells.filter((c) => c.kind === kind).length;
  assert.ok(has("wardens", "tower") >= 1 && has("redfang", "tent") >= 4 && has("host", "tower") >= 4 && has("hidekin", "mound") >= 1 && has("veiled", "tower") >= 1);
});

test("hold walls: every Hold under every clan keeps its gates and courtyard reachable, covers no standard, portal stone, road, NPC, chest, board, stair or dungeon gate", () => {
  assert.ok(HOLDS.length >= 50);
  const doors = new Set(DOORS.flatMap((d) => d.tiles)), K = HOLD_WALL_KEEP;
  for (const h of HOLDS) {
    const T = TERRITORIES[h.t];
    for (const k of CLAN_KEYS) {
      const f = fortOf(h.t, k)!, name = `${T.name} (${k})`, walls = new Set(f.walls.map(([x, y]) => y * MAP_W + x));
      assert.ok(f.walls.length >= 6, `${name}: a fort, not a few posts (${f.walls.length})`);
      for (const [x, y] of f.walls) {
        assert.ok(x >= T.x && y >= T.y && x < T.x + T.w && y < T.y + T.h, `${name}: wall inside its land`);
        assert.ok(!isSolidTile(x, y), `${name}: no wall on a solid tile`);
        assert.ok(!WORLD.roads.has(y * MAP_W + x), `${name}: no wall on a road (${x},${y})`);
        assert.ok(!doors.has(y * MAP_W + x), `${name}: no wall on a dungeon gate`);
        assert.ok(!PORTAL_SPOTS.some((p) => Math.hypot(p.x - x, p.y - y) < K.portal), `${name}: clear of portal stones`);
        assert.ok(!NPCS.some((n) => Math.hypot(n.x / TILE - x - 0.5, n.y / TILE - y - 0.5) < K.npc), `${name}: clear of NPCs`);
        assert.ok(!STANDARDS.some((s) => Math.hypot(s.x / TILE - x - 0.5, s.y / TILE - y - 0.5) < K.standard), `${name}: clear of standards`);
        const prop = [...CHESTS, ...BOARDS, ...LINKS].find((o) => Math.hypot(o.x / TILE - x - 0.5, o.y / TILE - y - 0.5) < K.prop);
        assert.ok(!prop, `${name}: clear of chests, boards and stairs (${prop?.id})`);
      }
      for (const [x, y] of f.gates) assert.ok(!walls.has(y * MAP_W + x), `${name}: no wall on a gate`);
      // no wall of another Hold overlaps this one
      for (const [x, y] of f.walls) assert.ok(holdTiles(h.t).includes(y * MAP_W + x));
      const B = Math.max(...f.cells.map((c) => Math.max(Math.abs(c.dx), Math.abs(c.dy)))) + REACH_BOX, before = reachable(f.cx, f.cy, B, () => false), after = reachable(f.cx, f.cy, B, (x, y) => walls.has(y * MAP_W + x));
      for (const kk of before) assert.ok(walls.has(kk) || after.has(kk), `${name}: ground at ${kk % MAP_W},${Math.floor(kk / MAP_W)} stays reachable`);
      for (const c of f.cells) {
        const x = f.cx + c.dx, y = f.cy + c.dy;
        if ((c.kind === "gate" || c.kind === "court" || c.kind === "gap") && !isSolidTile(x, y) && before.has(y * MAP_W + x))
          assert.ok(after.has(y * MAP_W + x), `${name}: ${c.kind} at (${c.dx},${c.dy}) reachable from outside`);
      }
      assert.ok(!walls.has(f.cy * MAP_W + f.cx), `${name}: the Hold's middle stays open`);
    }
  }
});

test("hold walls: no fort cuts a way anywhere on the map, whoever holds which land (ground joined before stays joined with every wall up)", () => {
  const n = MAP_W * MAP_H, solid = new Uint8Array(n);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) solid[y * MAP_W + x] = isSolidTile(x, y) ? 1 : 0;
  const label = (wall: Uint8Array) => {
    const lab = new Int32Array(n), q = new Int32Array(n);
    let c = 0;
    for (let i = 0; i < n; i++) {
      if (lab[i] || solid[i] || wall[i]) continue;
      lab[i] = ++c;
      let head = 0, tail = 0;
      q[tail++] = i;
      while (head < tail) {
        const j = q[head++], jx = j % MAP_W;
        for (const k of [jx + 1 < MAP_W ? j + 1 : -1, jx > 0 ? j - 1 : -1, j + MAP_W < n ? j + MAP_W : -1, j - MAP_W]) {
          if (k < 0 || lab[k] || solid[k] || wall[k]) continue;
          lab[k] = c; q[tail++] = k;
        }
      }
    }
    return lab;
  };
  const before = label(new Uint8Array(n));
  const deals: ((t: number) => ClanKey)[] = [...CLAN_KEYS.map((k) => () => k), ...[1, 2, 3].map((s) => (t: number) => CLAN_KEYS[(t * s + s) % CLAN_KEYS.length])];
  for (const own of deals) {
    const wall = new Uint8Array(n);
    for (const h of HOLDS) for (const [x, y] of fortOf(h.t, own(h.t))!.walls) wall[y * MAP_W + x] = 1;
    const after = label(wall), seen = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      if (!after[i]) continue;
      const was = seen.get(before[i]);
      if (was === undefined) seen.set(before[i], after[i]);
      else assert.equal(after[i], was, `(${i % MAP_W},${Math.floor(i / MAP_W)}) cut off from ground it was joined to`);
    }
  }
});

test("hold walls: forts follow the holder; the live check, holdWallAt and the movement check agree", () => {
  const h = HOLDS[0], t = h.t;
  try {
    setHoldOwners([]);
    const f = fortOf(t, "wardens")!, [wx, wy] = f.walls[0];
    assert.ok(!liveHoldWall(wx, wy) && !blocked((wx + 0.5) * TILE, (wy + 0.5) * TILE), "no war known: no walls");
    assert.deepEqual(setHoldOwners(allOwned("wardens")).includes(t), true, "the land's fort changed");
    assert.ok(liveHoldWall(wx, wy) && blocked((wx + 0.5) * TILE, (wy + 0.5) * TILE) && touchesHoldWall((wx + 0.5) * TILE, (wy + 0.5) * TILE, PLAYER_RADIUS));
    assert.ok(holdWallAt(wx, wy, () => "wardens") && anyHoldWall(wx, wy));
    for (const k of CLAN_KEYS) {
      const g = fortOf(t, k)!, on = new Set(g.walls.map(([x, y]) => `${x},${y}`));
      for (let y = g.cy - 6; y <= g.cy + 6; y++) for (let x = g.cx - 6; x <= g.cx + 6; x++) assert.equal(holdWallAt(x, y, (u) => (u === t ? k : undefined)), on.has(`${x},${y}`));
    }
    assert.deepEqual(setHoldOwners(allOwned("wardens")), [], "nothing changed: nothing to redo");
    // client indexes work too, and a flip names only that land
    const idx = TERRITORIES.map(() => 0); idx[t] = CLAN_KEYS.indexOf("host");
    assert.deepEqual(setHoldOwners(idx), [t]);
  } finally { setHoldOwners([]); }
});

/** A Hold whose `clan` fort stands whole (no wall left out), for the walking tests. */
const wholeHold = (clan: ClanKey) => HOLDS.find((h) => {
  const f = fortOf(h.t, clan)!;
  return f.walls.length === FORT_PLANS[clan].cells.filter((c) => BLOCKING.has(c.kind)).length && !f.cells.some((c) => c.kind === "gap");
})!;

test("hold walls: a hero walking into a wall stops at it; out through the front gate he walks on (shared moveStep)", () => {
  const h = wholeHold("wardens"), f = fortOf(h.t, "wardens")!;
  try {
    setHoldOwners(allOwned("wardens"));
    let x = h.x, y = h.y;
    for (let i = 0; i < 60; i++) ({ x, y } = moveStep(x, y, { up: true, down: false, left: false, right: false }, 0.05));
    assert.ok(y > (f.cy - 4 + 1) * TILE, `stopped by the north wall (y ${y.toFixed(0)})`);
    x = h.x; y = h.y;
    for (let i = 0; i < 60; i++) ({ x, y } = moveStep(x, y, { up: false, down: false, left: false, right: true }, 0.05));
    assert.ok(x > (f.cx + 5) * TILE, `out of the east gate (x ${x.toFixed(0)})`);
    setHoldOwners([]);
    x = h.x; y = h.y;
    for (let i = 0; i < 60; i++) ({ x, y } = moveStep(x, y, { up: true, down: false, left: false, right: false }, 0.05));
    assert.ok(y < (f.cy - 4) * TILE, "no war: the hero walks over the old line");
  } finally { setHoldOwners([]); }
});

test("hold walls: nearestFree takes someone standing in a wall to the closest open spot", () => {
  const h = wholeHold("host"), f = fortOf(h.t, "host")!;
  try {
    setHoldOwners(allOwned("host"));
    const [wx, wy] = f.walls.find(([x, y]) => Math.abs(x - f.cx) === 2 && y === f.cy)!; // the inner face of the thick west wall
    const px = (wx + 0.5) * TILE, py = (wy + 0.5) * TILE;
    assert.ok(blocked(px, py));
    const to = nearestFree(px, py)!;
    assert.ok(to && !blocked(to.x, to.y) && Math.hypot(to.x - px, to.y - py) <= 1.5 * TILE, "one tile over");
  } finally { setHoldOwners([]); }
});

test("hold walls: patrol routes, gate spots and guard posts lie outside every clan's walls, and troopers walk to every post round any fort", () => {
  let lands = 0, posts = 0;
  try {
    for (const t of TERRITORIES) {
      const p = patrolOf(t.id), hold = HOLDS.find((h) => h.t === t.id);
      if (!p || !hold) continue;
      lands++;
      for (const q of p.pts) assert.ok(!anyHoldWall(Math.floor(q.x / TILE), Math.floor(q.y / TILE)), `${t.name}: route clear of walls`);
      const g0 = p.pts[0], gd = Math.max(Math.abs(g0.x - hold.x), Math.abs(g0.y - hold.y));
      assert.ok(gd >= holdReachPx(t.id), `${t.name}: the gate spot is outside every fort`);
      const spots = garrisonSpots(t.id, TROOP.garrisonMax);
      for (const s of spots) assert.ok(Math.max(Math.abs(s.x - hold.x), Math.abs(s.y - hold.y)) >= holdReachPx(t.id), `${t.name}: guard post outside every fort`);
      // a guard comes out of the gate and walks to its post, as server/warTroops.ts walk does, with each clan's fort up
      for (const k of CLAN_KEYS) {
        setHoldOwners(allOwned(k));
        for (const s of spots) {
          let x = g0.x, y = g0.y;
          for (let i = 0; i < 600 && Math.hypot(s.x - x, s.y - y) > 4; i++) {
            const to = fortDetour(x, y, s.x, s.y), dx = to.x - x, dy = to.y - y, d = Math.hypot(dx, dy), dt = 0.1;
            ({ x, y } = moveStep(x, y, dirInput(dx, dy), dt, Math.min(TROOP.speed * 3, d / dt)));
          }
          const ok = Math.hypot(s.x - x, s.y - y) <= 4;
          if (!ok) {
            // only a rock in the open (not the fort) may stop him: with the fort down he fails as well
            setHoldOwners([]);
            let x2 = g0.x, y2 = g0.y;
            for (let i = 0; i < 600 && Math.hypot(s.x - x2, s.y - y2) > 4; i++) {
              const to = fortDetour(x2, y2, s.x, s.y), dx = to.x - x2, dy = to.y - y2, d = Math.hypot(dx, dy);
              ({ x: x2, y: y2 } = moveStep(x2, y2, dirInput(dx, dy), 0.05, Math.min(TROOP.speed * 3, d / 0.1)));
            }
            assert.ok(Math.hypot(s.x - x2, s.y - y2) > 4, `${t.name} (${k}): a guard got stuck on the fort on the way to (${s.x.toFixed(0)},${s.y.toFixed(0)}), at (${x.toFixed(0)},${y.toFixed(0)})`);
            setHoldOwners(allOwned(k));
          } else posts++;
        }
      }
    }
  } finally { setHoldOwners([]); }
  assert.ok(lands >= 50 && posts >= lands * 4 * CLAN_KEYS.length * 0.9, `${lands} lands, ${posts} posts reached`);
});

test("hold walls: troopers chasing a hero round a fort build a route field only when the hero changes tile", async () => {
  const { _fieldBuilds } = await import("../shared/war/holdRoutes");
  const h = wholeHold("host"), f = fortOf(h.t, "host")!;
  try {
    setHoldOwners(allOwned("host"));
    // the hero walks about the keep's courtyard; twenty troopers outside the walls chase him every tick for 4 s
    const men = Array.from({ length: 20 }, (_, i) => { const a = (i / 20) * 2 * Math.PI; return { x: h.x + Math.cos(a) * 6 * TILE, y: h.y + Math.sin(a) * 6 * TILE }; });
    const before = _fieldBuilds(), path = [[0, 0], [-1, -1], [-1, 1], [1, 1], [1, -1]];
    let ticks = 0;
    for (let i = 0; i < 80; i++) {
      const [px, py] = path[Math.floor(i / 16)], gx = (f.cx + px + 0.5) * TILE + (i % 16) * 0.5, gy = (f.cy + py + 0.5) * TILE; // drifts inside one tile, then moves on
      for (const m of men) {
        const to = fortDetour(m.x, m.y, gx, gy), dx = to.x - m.x, dy = to.y - m.y, d = Math.hypot(dx, dy);
        ({ x: m.x, y: m.y } = moveStep(m.x, m.y, dirInput(dx, dy), 0.05, Math.min(TROOP.speed * 3, d / 0.05)));
      }
      ticks++;
    }
    const built = _fieldBuilds() - before;
    assert.ok(built <= path.length, `${built} fields for ${ticks} ticks of 20 chasers (one per tile the hero stood on)`);
    assert.ok(men.filter((m) => Math.hypot(m.x - h.x, m.y - h.y) < 3 * TILE).length >= 10, "most chasers came in through the gate");
  } finally { setHoldOwners([]); }
});
