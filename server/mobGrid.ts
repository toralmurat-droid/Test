/** Side of a MobGrid square, in px. */
export const MOB_CELL = 128;

/** What a MobGrid needs on each monster: its position, plus its own bookkeeping (not synced). */
export interface GridUnit {
  x: number;
  y: number;
  /** The grid holding it (null: in none), its id there, its square key and its place in the map's order. */
  _gm: MobGrid<any> | null;
  _gid: string;
  _gk: number;
  _gs: number;
  /** In the grid's busy set (see MobGrid.wake), and the number of the pass that last listed it. */
  _gb: boolean;
  _gv: number;
}

const keyOf = (x: number, y: number) => Math.floor(x / MOB_CELL) * 65536 + Math.floor(y / MOB_CELL);

/**
 * The monsters by id (a plain Map, same iteration order), also bucketed by MOB_CELL squares so "who is near (x, y)"
 * only looks at the squares around it instead of every monster on the map. Always up to date: set/delete keep the
 * squares in step, and a monster tells its grid when it moves (see trackSchemaMoves). A monster belongs to one map only.
 */
export class MobGrid<T extends GridUnit> extends Map<string, T> {
  private cells = new Map<number, Map<string, T>>();
  private seq = 0;

  set(id: string, m: T): this {
    const old = super.get(id);
    if (old === m) return this;
    let order: number;
    if (old) { order = old._gs; this.unlink(old); } // same place in the map's order (Map.set keeps it)
    else order = ++this.seq;
    super.set(id, m);
    if (m._gm && m._gm !== this) m._gm.delete(m._gid); // moved over from another map
    else if (m._gm === this) { super.delete(m._gid); this.unlink(m); } // the same monster under a new id
    if (old) old._gm = null; // the monster it replaced is out: its moves must not put it back into a square
    m._gm = this; m._gid = id; m._gs = order;
    this.link(m, keyOf(m.x, m.y));
    this.wake(m); // new (or back): it gets a visit, like a Map.forEach running now would give it
    return this;
  }

  delete(id: string): boolean {
    const m = super.get(id);
    if (!m) return false;
    this.unlink(m);
    this.rest(m);
    m._gm = null;
    return super.delete(id);
  }

  clear() {
    this.forEach((m) => { m._gm = null; m._gb = false; });
    this.cells.clear();
    this.busy.clear();
    super.clear();
  }

  /** Called by the monster when x or y changed. */
  moved(m: T) {
    const k = keyOf(m.x, m.y);
    if (k === m._gk) return;
    this.unlink(m); this.link(m, k);
    if (this.cur >= 0 && m._gs > this.cur) this.schedule(m); // may have walked (or been pushed) into a warm square ahead of the pass
  }

  /** The monsters in one MOB_CELL square (cx, cy), in no particular order; undefined when empty. Read only. */
  cell(cx: number, cy: number): ReadonlyMap<string, T> | undefined { return this.cells.get(cx * 65536 + cy); }

  // ---- Passes: visiting only the monsters that may have something to do (TownRoom.update) ----
  // The room's tick used to walk every monster and drop the frozen ones (dozing, no target, no hero near) on the
  // first line. A pass lists instead the busy set (every monster that may be doing something wherever it is) plus
  // whoever stands in the squares the room names, in map order, so the visits, their order and the random numbers
  // drawn come out exactly as before. The room keeps the busy set right: a monster joins it when it is set into the
  // grid and when it is woken (Mob.target, a dozing monster waking up), and leaves it when the room finds it frozen.

  /** Monsters that may have something to do wherever they are. */
  private busy = new Set<T>();
  /** The open pass: its monsters and their places in map order (sorted), how far runPass got (-1: no pass open). */
  private pm: T[] = []; private pg: number[] = []; private pn = 0;
  private cur = -1;
  /** Monsters woken ahead of the running pass's cursor, sorted by place, with the place they were woken at. */
  private lm: T[] = []; private lg: number[] = [];

  /** Puts a monster in the busy set (and into the open pass if that has not reached it yet). */
  wake(m: T) {
    if (m._gm !== this) return;
    if (!m._gb) { m._gb = true; this.busy.add(m); }
    if (this.cur >= 0 && m._gs > this.cur) this.schedule(m);
  }

  /** Takes a monster out of the busy set: it was seen frozen. */
  rest(m: T) { if (m._gb) { m._gb = false; this.busy.delete(m); } }


  /** Opens a pass: the busy set to start with; add squares with passCells, then sortPass. */
  beginPass() {
    const pm = this.pm, v = ++this.pn;
    pm.length = 0; this.lm.length = 0; this.lg.length = 0;
    this.cur = 0; // every place is > 0: from here on a woken monster joins the pass
    for (const m of this.busy) { if (m._gm === this) { m._gv = v; pm.push(m); } else this.rest(m); }
  }

  /** Adds every monster in the squares cx0..cx1, cy0..cy1 (inclusive) to the open pass. */
  passCells(cx0: number, cy0: number, cx1: number, cy1: number) {
    const pm = this.pm, v = this.pn;
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
      const c = this.cells.get(cx * 65536 + cy);
      if (c) for (const m of c.values()) if (m._gv !== v) { m._gv = v; pm.push(m); }
    }
  }

  /** Puts the open pass in map order (call once, after the last passCells). */
  sortPass() {
    const pm = this.pm, pg = this.pg;
    pm.sort((a, b) => a._gs - b._gs);
    pg.length = pm.length;
    for (let i = 0; i < pm.length; i++) pg[i] = pm[i]._gs;
  }

  /** The open pass as listed (no one woken since): what a Map.forEach would visit among them, in its order. */
  eachPass(fn: (m: T, id: string) => void) {
    const pm = this.pm, pg = this.pg;
    for (let i = 0; i < pm.length; i++) { const m = pm[i]; if (m._gm === this && m._gs === pg[i]) fn(m, m._gid); }
  }

  /**
   * Visits the open pass in map order, plus every monster woken or set into the grid ahead of the cursor meanwhile,
   * at its place (as Map.forEach visits an entry added while it runs), skipping the deleted. Closes the pass.
   */
  runPass(fn: (m: T, id: string) => void) {
    const pm = this.pm, pg = this.pg, lm = this.lm, lg = this.lg;
    let i = 0, j = 0;
    try {
      for (;;) {
        let m: T, g: number;
        if (j < lm.length && (i >= pm.length || lg[j] < pg[i])) { m = lm[j]; g = lg[j++]; }
        else if (i < pm.length) { m = pm[i]; g = pg[i++]; }
        else break;
        if (g <= this.cur || m._gm !== this || m._gs !== g) continue; // listed twice, gone, or back under a later place
        this.cur = g;
        fn(m, m._gid);
      }
    } finally { this.cur = -1; lm.length = 0; lg.length = 0; }
  }

  /** Adds a monster to the running pass at its place (late list, kept sorted; it holds the few woken meanwhile). */
  private schedule(m: T) {
    const lm = this.lm, lg = this.lg, g = m._gs;
    let k = lg.length;
    while (k > 0 && lg[k - 1] > g) k--;
    if (k > 0 && lg[k - 1] === g && lm[k - 1] === m) return; // already in
    lm.splice(k, 0, m); lg.splice(k, 0, g);
  }

  /**
   * Every monster with |m.x - x| <= r and |m.y - y| <= r (exactly what the old full-map box tests kept), in the order
   * the map would list them, so callers that take the first match or break ties by order behave as before.
   */
  inBox(x: number, y: number, r: number): [string, T][] {
    const out: [string, T][] = [];
    // (1 px wider than the box: a monster right on its edge is never lost to rounding)
    const x0 = Math.floor((x - r - 1) / MOB_CELL), x1 = Math.floor((x + r + 1) / MOB_CELL);
    const y0 = Math.floor((y - r - 1) / MOB_CELL), y1 = Math.floor((y + r + 1) / MOB_CELL);
    const keep = (m: T, id: string) => {
      const dx = m.x - x, dy = m.y - y;
      if (dx > r || dx < -r || dy > r || dy < -r) return;
      out.push([id, m]);
    };
    // A huge (or bad) box covers more squares than there are monsters: plain scan, already in map order
    if (!((x1 - x0 + 1) * (y1 - y0 + 1) <= this.cells.size)) { this.forEach(keep); return out; }
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) this.cells.get(cx * 65536 + cy)?.forEach(keep);
    if (out.length > 1) out.sort((a, b) => a[1]._gs - b[1]._gs);
    return out;
  }

  private link(m: T, k: number) {
    m._gk = k;
    let c = this.cells.get(k);
    if (!c) this.cells.set(k, (c = new Map()));
    c.set(m._gid, m);
  }

  private unlink(m: T) {
    const c = this.cells.get(m._gk);
    if (c?.get(m._gid) === m) { c.delete(m._gid); if (!c.size) this.cells.delete(m._gk); }
  }
}

/**
 * Makes every instance of a @colyseus/schema class tell its MobGrid whenever x or y is set. Schema 3 copies the
 * accessors in `cls[Symbol.metadata]["~descriptors"]` onto each new instance; wrapping those two, once, keeps each
 * monster's own setter (and its change tracking) and the object's shape, so nothing else gets slower.
 */
export function trackSchemaMoves(cls: Function) {
  const ds = (cls as any)[Symbol.metadata]?.["~descriptors"];
  for (const f of ["x", "y"]) {
    const d: PropertyDescriptor | undefined = ds?.[f];
    if (!d?.set) throw new Error(`trackSchemaMoves: no schema setter for ${f} (did @colyseus/schema change?)`);
    const set = d.set;
    ds[f] = { ...d, set(this: GridUnit, v: number) { set.call(this, v); this._gm?.moved(this); } };
  }
}
