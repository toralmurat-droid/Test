import Phaser from "phaser";
import { MAP_H, MAP_W, TILE } from "../../shared/constants";
import { EMPTY, OBJECTS, T } from "../../shared/map";
import type { GroundData } from "./groundPaint";

/**
 * Smooth isometric ground (replaces the pixel ground tiles): painted in Web Workers (groundPaint.ts), chunk by chunk,
 * only around the camera. Each chunk is a rectangle of iso screen space shown as one image at depth -1.9, above the
 * old diamond tiles, which stay underneath as a fallback until a chunk is ready.
 */
const CW = 512, CH = 256; // chunk size in iso screen px
const RES = 2; // texture pixels per screen px (camera zoom is 3, so the ground stays sharp)
const DEPTH = -1.9;

const SOLID = new Set<number>([
  T.TREE, T.PINE, T.BUSH, T.ROCK, T.PALISADE, T.ROOF_THATCH, T.ROOF_RED, T.ROOF_SLATE, T.WALL_TIMBER, T.WALL_STONE,
  T.WINDOW_TIMBER, T.WINDOW_STONE, T.DOOR, T.WELL, T.RUIN, T.BEAM, T.STUMP, T.BARREL, T.CRATE, T.HAY,
]);

export class SmoothGround {
  private workers: Worker[] = [];
  private busy: boolean[] = [];
  private live = new Map<string, Phaser.GameObjects.Image | null>(); // null = being painted
  private queue: { key: string; cx: number; cy: number; d?: number }[] = [];

  constructor(private scene: Phaser.Scene, ground: number[][], private onImage: (img: Phaser.GameObjects.Image) => void) {
    const g = new Int16Array(MAP_W * MAP_H), solid = new Uint8Array(MAP_W * MAP_H);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      g[y * MAP_W + x] = ground[y][x];
      const o = OBJECTS[y][x];
      if (o !== EMPTY && SOLID.has(o)) solid[y * MAP_W + x] = 1;
    }
    const data: GroundData = { w: MAP_W, h: MAP_H, tile: TILE, ground: g, solid };
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL("./groundWorker.ts", import.meta.url), { type: "module" });
      w.postMessage({ type: "init", data });
      w.onmessage = (ev) => this.done(i, ev.data);
      this.workers.push(w); this.busy.push(false);
    }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.workers.forEach((w) => w.terminate()));
  }

  /** Call every frame with the camera's centre and size in iso screen px. */
  update(midX: number, midY: number, viewW: number, viewH: number) {
    const m = 160;
    const cx0 = Math.floor((midX - viewW / 2 - m) / CW), cx1 = Math.floor((midX + viewW / 2 + m) / CW);
    const cy0 = Math.floor((midY - viewH / 2 - m) / CH), cy1 = Math.floor((midY + viewH / 2 + m) / CH);
    const want = new Set<string>();
    const add: { key: string; cx: number; cy: number; d?: number }[] = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      // skip chunks entirely outside the map diamond
      const sx0 = cx * CW, sy0 = cy * CH;
      if (sy0 + CH < 0 || sy0 > (MAP_W + MAP_H) * TILE / 2 || sx0 + CW < -MAP_H * TILE || sx0 > MAP_W * TILE) continue;
      const key = `sg_${cx}_${cy}`;
      want.add(key);
      if (!this.live.has(key)) add.push({ key, cx, cy, d: Math.hypot(sx0 + CW / 2 - midX, (sy0 + CH / 2 - midY) * 2) });
    }
    // keep one extra ring before dropping chunks, so walking back and forth doesn't repaint
    for (const [key, img] of this.live) {
      const [, x, y] = key.split("_").map(Number);
      if (x < cx0 - 1 || x > cx1 + 1 || y < cy0 - 1 || y > cy1 + 1) {
        if (img) { img.destroy(); this.scene.textures.remove(key); }
        this.live.delete(key);
      }
    }
    if (add.length) {
      add.sort((a, b) => a.d! - b.d!);
      this.queue = add.concat(this.queue.filter((q) => want.has(q.key) && !add.some((a) => a.key === q.key)));
    } else this.queue = this.queue.filter((q) => want.has(q.key));
    this.pump();
  }

  private pump() {
    for (let i = 0; i < this.workers.length && this.queue.length; i++) {
      if (this.busy[i]) continue;
      const q = this.queue.shift()!;
      if (this.live.has(q.key)) { i--; continue; }
      this.live.set(q.key, null);
      this.busy[i] = true;
      this.workers[i].postMessage({ type: "paint", key: q.key, sx0: q.cx * CW - 1, sy0: q.cy * CH - 1, cw: CW + 2, ch: CH + 2, res: RES }); // 1px overlap: no seams
    }
  }

  private done(i: number, m: { key: string; W: number; H: number; px: Uint8ClampedArray }) {
    this.busy[i] = false;
    if (this.live.get(m.key) === null) {
      const [, cx, cy] = m.key.split("_").map(Number);
      if (this.scene.textures.exists(m.key)) this.scene.textures.remove(m.key);
      const tex = this.scene.textures.createCanvas(m.key, m.W, m.H)!;
      tex.getContext().putImageData(new ImageData(m.px as any, m.W, m.H), 0, 0);
      tex.refresh();
      const img = this.scene.add.image(cx * CW - 1, cy * CH - 1, m.key).setOrigin(0, 0).setScale(1 / RES).setDepth(DEPTH);
      this.onImage(img);
      this.live.set(m.key, img);
    }
    this.pump();
  }
}
