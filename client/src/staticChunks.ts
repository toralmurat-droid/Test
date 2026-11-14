import Phaser from "phaser";
import { ISO } from "./isoflag";

/**
 * Static world objects (trees, fences, rocks, cliffs, crops, house strips, props, fires and their smoke) kept out of
 * the scene's display list and update list unless they are near the camera. The whole map is built at startup, about
 * 30,000 objects: every one of them, on screen or not, cost time each frame in IsoView.pre/post, the pixel-grid sync,
 * Phaser's visibility filter and depth sort, and (Sprites, emitters) the update list.
 *
 * Objects are registered in a grid of screen-space (iso) cells by their drawn bounds, so tall trees, towers and smoke
 * columns are live while any part of them could be on screen. Cells round the camera view plus a margin are live;
 * the live set is only recomputed when the view crosses a cell border. Registered objects stay real game objects
 * (callers keep their references, tweens keep running): leaving the display list only stops drawing them and, for
 * Sprites and emitters, their per-frame update (animations and particles freeze and resume where they were).
 * Iso view only: the top-down view (?iso=0) keeps every object in the lists as before.
 */

/** Screen-space cell size (px at zoom 1) and the margin round the view that is kept live. */
const CELL = 256, MARGIN = 96, PAD = 16;

type Obj = Phaser.GameObjects.GameObject & { x: number; y: number; depth: number; [k: string]: any };
type Box = [left: number, top: number, right: number, bottom: number];
/** `n`: how many of its cells are live; `in`: whether it is in the display list now. */
interface Entry { o: Obj; seq: number; n: number; in: boolean; touched: boolean; dead: boolean; warm: number; onLive?: (on: boolean) => void }
export interface StaticOpts {
  /** Screen-space bounds (iso px) when the object's own bounds don't say it (particle emitters, glows that pulse). */
  box?: Box;
  /** Called when the object enters (true) or leaves (false) the display list. */
  onLive?: (on: boolean) => void;
  /** Emitters: ms of particles simulated the first time it comes into view, so smoke doesn't start from nothing. */
  warm?: number;
}

const key = (cx: number, cy: number) => cy * 4096 + cx + 2048;
const chunks = new WeakMap<Phaser.Scene, StaticChunks>();
let seq = 0;

/** Drawn bounds on screen of an upright object standing at its world x/y (the iso projection of iso.ts). */
function boundsOf(o: Obj): Box {
  const sx = o.x - o.y, sy = (o.x + o.y) / 2;
  const w = o.displayWidth ?? 0, h = o.displayHeight ?? 0;
  let l = sx - (o.originX ?? 0.5) * w, t = sy - (o.originY ?? 0.5) * h, r = l + w, b = t + h;
  const c = o.isCropped ? o._crop : undefined;
  if (c && c.width > 0) {
    const kx = Math.abs(o.scaleX ?? 1), ky = Math.abs(o.scaleY ?? 1);
    l += c.x * kx; r = l + c.width * kx; t += c.y * ky; b = t + c.height * ky;
  }
  return [l - PAD, t - PAD, r + PAD, b + PAD];
}

export class StaticChunks {
  private cells = new Map<number, Entry[]>();
  private entries = new Map<Phaser.GameObjects.GameObject, Entry>();
  private live = new Set<number>();
  private range = "";
  private touched: Entry[] = [];

  /** The scene's registry, if static objects are chunked (iso view). */
  static get(scene: Phaser.Scene) { return chunks.get(scene); }

  /** The scene's registry, made on first use (undefined in the top-down view). */
  static of(scene: Phaser.Scene) {
    if (!ISO) return undefined;
    let c = chunks.get(scene);
    if (!c) { c = new StaticChunks(scene); chunks.set(scene, c); }
    return c;
  }

  private constructor(private scene: Phaser.Scene) {
    const dl = scene.sys.displayList as any;
    // Objects re-enter the list at its end: on equal depth, order by creation instead of list position, so the
    // draw order stays what it was when everything was in the list from the start (Phaser's sort is stable).
    dl.sortByDepth = (a: any, b: any) => a._depth - b._depth || (a.__seq ?? 0) - (b.__seq ?? 0);
    const stamp = (o: any) => { if (o.__seq === undefined) o.__seq = ++seq; };
    for (const o of dl.list) stamp(o);
    scene.sys.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, stamp);
    scene.sys.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.sys.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, stamp);
      chunks.delete(scene);
    });
  }

  /** Registers an object that never moves (it may change frame, tint, alpha, visibility or be destroyed). */
  add<O extends Phaser.GameObjects.GameObject>(obj: O, opts: StaticOpts = {}): O {
    const o = obj as unknown as Obj;
    if (this.entries.has(o) || o.parentContainer || (o as any).input) return obj;
    const [l, t, r, b] = opts.box ?? boundsOf(o);
    const e: Entry = { o, seq: o.__seq ?? 0, n: 0, in: !!o.displayList, touched: false, dead: false, warm: opts.warm ?? 0, onLive: opts.onLive };
    const ks: number[] = [];
    for (let cy = Math.floor(t / CELL); cy <= Math.floor(b / CELL); cy++) for (let cx = Math.floor(l / CELL); cx <= Math.floor(r / CELL); cx++) {
      const k = key(cx, cy);
      ks.push(k);
      let list = this.cells.get(k);
      if (!list) this.cells.set(k, (list = []));
      list.push(e);
      if (this.live.has(k)) e.n++;
    }
    this.entries.set(o, e);
    o.once(Phaser.GameObjects.Events.DESTROY, () => {
      e.dead = true; this.entries.delete(o);
      for (const k of ks) { const list = this.cells.get(k), i = list ? list.indexOf(e) : -1; if (i >= 0) list!.splice(i, 1); } // or the cells would hold it for good
    });
    this.touch(e);
    return obj;
  }

  private touch(e: Entry) { if (!e.touched) { e.touched = true; this.touched.push(e); } }

  /**
   * Called once per frame before the iso projection (IsoView.pre). `follow`: the camera target in world x/y, so
   * the view it is about to snap to (waygate, respawn) is live in the same frame.
   */
  sync(cam: Phaser.Cameras.Scene2D.Camera, follow?: { x: number; y: number }) {
    const w = cam.width / cam.zoom, h = cam.height / cam.zoom;
    const mx = cam.scrollX + cam.width / 2, my = cam.scrollY + cam.height / 2;
    // view centres: where the camera is, and where it is heading (the camera eases between the two)
    const fx = follow ? follow.x - follow.y : mx, fy = follow ? (follow.x + follow.y) / 2 : my;
    const near = Math.abs(fx - mx) < 2 * CELL && Math.abs(fy - my) < 2 * CELL;
    const rects: [number, number, number, number][] = near
      ? [[Math.min(mx, fx), Math.min(my, fy), Math.max(mx, fx), Math.max(my, fy)]] // both and all in between
      : [[mx, my, mx, my], [fx, fy, fx, fy]]; // a jump: the old and the new view
    const ranges = rects.map(([x0, y0, x1, y1]) => [
      Math.floor((x0 - w / 2 - MARGIN) / CELL), Math.floor((y0 - h / 2 - MARGIN) / CELL),
      Math.floor((x1 + w / 2 + MARGIN) / CELL), Math.floor((y1 + h / 2 + MARGIN) / CELL)]);
    const sig = ranges.join(";");
    if (sig !== this.range) {
      this.range = sig;
      const want = new Set<number>();
      for (const [x0, y0, x1, y1] of ranges) for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) want.add(key(cx, cy));
      for (const k of this.live) if (!want.has(k)) for (const e of this.cells.get(k) ?? []) { e.n--; this.touch(e); }
      for (const k of want) if (!this.live.has(k)) for (const e of this.cells.get(k) ?? []) { e.n++; this.touch(e); }
      this.live = want;
    }
    if (this.touched.length) this.apply();
  }

  /** Moves the objects whose wanted state changed in or out of the lists, in one pass over the display list. */
  private apply() {
    const dl = this.scene.sys.displayList as any, list = dl.list as Obj[];
    const outs = new Set<Obj>(), ins: Entry[] = [];
    for (const e of this.touched) {
      e.touched = false;
      if (e.dead) continue;
      const want = e.n > 0;
      if (want === e.in) continue;
      if (e.o.parentContainer) { this.entries.delete(e.o); e.dead = true; continue; } // taken over by other code: leave it be
      if (want) ins.push(e); else outs.add(e.o);
    }
    this.touched.length = 0;
    const scene = this.scene, ev = scene.sys.events;
    if (outs.size) {
      let j = 0;
      for (let i = 0; i < list.length; i++) if (!outs.has(list[i])) list[j++] = list[i];
      list.length = j;
      for (const o of outs) {
        const e = this.entries.get(o)!;
        e.in = false;
        (o as any).displayList = null;
        o.emit(Phaser.GameObjects.Events.REMOVED_FROM_SCENE, o, scene); // Sprites and emitters leave the update list
        ev.emit(Phaser.Scenes.Events.REMOVED_FROM_SCENE, o, scene);
        e.onLive?.(false);
      }
    }
    if (ins.length) {
      ins.sort((a, b) => a.seq - b.seq);
      for (const e of ins) {
        const o = e.o;
        e.in = true;
        list.push(o);
        o.displayList = dl;
        o.emit(Phaser.GameObjects.Events.ADDED_TO_SCENE, o, scene);
        ev.emit(Phaser.Scenes.Events.ADDED_TO_SCENE, o, scene);
        if (e.warm > 0) { (o as any).fastForward?.(e.warm, 100); e.warm = 0; }
        e.onLive?.(true);
      }
    }
    if (outs.size || ins.length) dl.queueDepthSort();
  }
}

/** Registers a static world object for chunked drawing (iso view); returns it unchanged. */
export function staticObj<O extends Phaser.GameObjects.GameObject>(scene: Phaser.Scene, o: O, opts?: StaticOpts): O {
  StaticChunks.of(scene)?.add(o, opts);
  return o;
}
