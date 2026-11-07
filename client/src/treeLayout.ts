import { ClassKind } from "../../shared/classes";
import { childrenOf, SkillDef, SKILLS } from "../../shared/skills";

/**
 * Where every skill tile sits on the skill tree slab (Murat 2026-11-07: tiles must never overlap, e.g. when a skill
 * opens three others). Each school is a small grid, Diablo 2 style: tiles snap to lanes (half a lane apart at most)
 * and rows, a skill always sits lower than the one it grows from, two tiles never share a spot, and no arrow runs
 * under another tile. Among the layouts that fit, the search keeps the one with the fewest lanes, then the fewest
 * rows, then the straightest arrows. Busy schools get wider columns than quiet ones.
 */
export const TILE = 60; // tile size, CSS px (menus.css .tnode)
export const LANE = 72; // centre to centre of two tiles side by side
const PAD = 8; // free stone at each side of a school
const TOP = 96; // centre of the first row
const MIN_ROW = 92, MAX_ROW = 112; // row spacing range
const MAX_LANES = 4;
const FIT_ROWS = 4; // rows that fit on the slab at the tightest spacing

export interface Node { s: SkillDef; x: number; y: number }
export interface TreeLayout { nodes: Node[]; cols: { x0: number; x1: number; mid: number }[] }

interface Spot { lane: number; row: number } // lane in halves (0, 1 = half a lane, 2 = one lane...)
interface Grid { spots: Map<string, Spot>; lanes: number; rows: number }

const cache = new Map<string, TreeLayout>();

export function treeLayout(cls: ClassKind, W: number, H: number): TreeLayout {
  const key = `${cls}:${W}:${H}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const grids: { list: SkillDef[]; g: Grid }[] = [];
  for (let br = 0; br < 3; br++) {
    const list = SKILLS[cls].filter((s) => s.branch === br);
    grids.push({ list, g: list.length ? placeBranch(cls, list) : { spots: new Map(), lanes: 1, rows: 1 } });
  }
  // column widths: what each school needs, the rest of the slab shared out evenly
  const need = grids.map(({ g }) => (g.lanes - 1) * LANE + TILE + PAD * 2);
  const spare = Math.max(0, W - 20 - need.reduce((a, b) => a + b, 0)) / 3;
  const cols: TreeLayout["cols"] = [];
  let x = 10;
  for (const n of need) { cols.push({ x0: x, x1: x + n + spare, mid: x + (n + spare) / 2 }); x += n + spare; }
  const nodes: Node[] = [];
  const bottom = H - 96; // keep the last row clear of the "skill choices" bar
  grids.forEach(({ list, g }, br) => {
    const rowH = g.rows > 1 ? Math.max(MIN_ROW, Math.min(MAX_ROW, (bottom - TOP) / (g.rows - 1))) : 0;
    const mid = (g.lanes - 1) / 2;
    for (const s of list) {
      const sp = g.spots.get(s.id)!;
      nodes.push({ s, x: Math.round(cols[br].mid + (sp.lane / 2 - mid) * LANE), y: Math.round(TOP + sp.row * rowH) });
    }
  });
  const out = { nodes, cols };
  cache.set(key, out);
  return out;
}

/** Best grid for one school: fewest lanes first, then the lowest cost. */
function placeBranch(cls: ClassKind, list: SkillDef[]): Grid {
  const order: SkillDef[] = [];
  const walk = (s: SkillDef) => { order.push(s); childrenOf(cls, s.id).filter((k) => list.includes(k)).sort((a, b) => a.req - b.req).forEach(walk); };
  list.filter((s) => !s.parent || !list.some((p) => p.id === s.parent)).forEach(walk);
  const depth = new Map<string, number>();
  for (const s of order) depth.set(s.id, s.parent && depth.has(s.parent) ? depth.get(s.parent)! + 1 : 0);
  const maxDepth = Math.max(...depth.values());
  // fewest lanes that keep the school within the slab's rows; a very deep school takes more rows
  for (const rows of [FIT_ROWS, maxDepth + 3]) for (let lanes = 1; lanes <= MAX_LANES; lanes++) {
    const best = search(order, lanes, Math.max(rows, maxDepth + 1));
    if (best) return best;
  }
  // nothing fits (should not happen): one row per skill
  const spots = new Map<string, Spot>();
  order.forEach((s, i) => spots.set(s.id, { lane: 0, row: i }));
  return { spots, lanes: 1, rows: order.length };
}

// grid geometry for the checks: lanes and rows in px at the tightest spacing
const px = (sp: Spot) => ({ x: (sp.lane / 2) * LANE, y: sp.row * MIN_ROW });
/** The arrow from a parent's bottom edge to the child's top edge (as talents.ts paints it). */
function arrow(p: Spot, c: Spot) {
  const a = px(p), b = px(c);
  let x0 = a.x, x1 = b.x;
  if (Math.abs(b.x - a.x) > 20) { x0 += Math.sign(b.x - a.x) * 18; x1 -= Math.sign(b.x - a.x) * 10; }
  return { x0, y0: a.y + TILE / 2 + 4, x1, y1: b.y - TILE / 2 - 6 };
}
type Seg = ReturnType<typeof arrow>;
/** Does the segment pass through the tile at `sp` (grown by the groove's half width)? */
function cutsTile(s: Seg, sp: Spot): boolean {
  const c = px(sp), m = TILE / 2 + 10; // arrows keep clear of tiles, never squeeze between two
  const l = c.x - m, r = c.x + m, t = c.y - m, b = c.y + m;
  let t0 = 0, t1 = 1;
  const dx = s.x1 - s.x0, dy = s.y1 - s.y0;
  for (const [p, q] of [[-dx, s.x0 - l], [dx, r - s.x0], [-dy, s.y0 - t], [dy, b - s.y0]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const k = q / p;
    if (p < 0) { if (k > t1) return false; if (k > t0) t0 = k; } else { if (k < t0) return false; if (k < t1) t1 = k; }
  }
  return t0 < t1;
}
function crosses(a: Seg, b: Seg): boolean {
  const o = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
  return o(a.x0, a.y0, a.x1, a.y1, b.x0, b.y0) * o(a.x0, a.y0, a.x1, a.y1, b.x1, b.y1) < 0 &&
    o(b.x0, b.y0, b.x1, b.y1, a.x0, a.y0) * o(b.x0, b.y0, b.x1, b.y1, a.x1, a.y1) < 0;
}

/** Branch and bound over lanes and rows; returns the cheapest layout with this many lanes, if any. */
function search(order: SkillDef[], lanes: number, maxRows: number): Grid | undefined {
  const halfMax = (lanes - 1) * 2;
  const spots = new Map<string, Spot>();
  const segs: { seg: Seg; from: string; to: string }[] = [];
  let best: { cost: number; spots: Map<string, Spot>; rows: number } | undefined;
  let budget = 400000; // node visits: plenty for trees of up to ~10 skills a school
  const step = (i: number, cost: number, rows: number) => {
    if (--budget < 0) return;
    if (best && cost + rows * 100 >= best.cost) return;
    if (i === order.length) {
      const total = cost + rows * 100;
      if (!best || total < best.cost) best = { cost: total, spots: new Map(spots), rows };
      return;
    }
    const s = order[i], par = s.parent ? spots.get(s.parent) : undefined;
    const cands: { sp: Spot; c: number }[] = [];
    const r0 = par ? par.row + 1 : 0, r1 = par ? Math.min(maxRows - 1, par.row + 2) : 0;
    for (let row = r0; row <= r1; row++) for (let lane = 0; lane <= halfMax; lane++) {
      const sp = { lane, row };
      let c = 0;
      if (par) c += (row - par.row - 1) * 40 + Math.abs(lane - par.lane) * 3;
      else c += Math.abs(lane - halfMax / 2) * 2; // roots in the middle
      // no shared spot: tiles in one row stay a whole lane apart
      let ok = true;
      for (const o of spots.values()) if (o.row === row && Math.abs(o.lane - lane) < 2) { ok = false; break; }
      if (!ok) continue;
      // the new tile must not sit on an existing arrow
      for (const a of segs) if (cutsTile(a.seg, sp)) { ok = false; break; }
      if (!ok) continue;
      if (par) {
        const seg = arrow(par, sp);
        for (const [id, o] of spots) if (id !== s.parent && cutsTile(seg, o)) { ok = false; break; }
        if (!ok) continue;
        for (const a of segs) if (a.from !== s.parent && crosses(seg, a.seg)) c += 60;
        // keep siblings in level order from left to right
        for (const a of segs) if (a.from === s.parent && spots.get(a.to)!.lane > lane) c += 8;
      }
      cands.push({ sp, c });
    }
    cands.sort((a, b) => a.c - b.c || a.sp.row - b.sp.row);
    for (const { sp, c } of cands) {
      spots.set(s.id, sp);
      if (par) segs.push({ seg: arrow(par, sp), from: s.parent!, to: s.id });
      step(i + 1, cost + c, Math.max(rows, sp.row + 1));
      if (par) segs.pop();
      spots.delete(s.id);
    }
  };
  step(0, 0, 0);
  return best ? { spots: best.spots, lanes, rows: best.rows } : undefined;
}
