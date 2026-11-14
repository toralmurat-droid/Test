import Phaser from "phaser";
import { DEEP_END, DEEP_Y0, DESERT_H, DESERT_Y0, MAP_H, MAP_W, TILE, UNDER_END, WORLD_H } from "../../shared/constants";
import { SEA_END } from "../../shared/dungeon";
import { ELEMENT_LANDS, EMPTY, OBJECTS, T, TILE_COUNT } from "../../shared/map";
import type { GroundData } from "./groundPaint";

/**
 * Smooth isometric ground (replaces the pixel ground tiles): painted in Web Workers (groundPaint.ts), chunk by chunk,
 * only around the camera. Each chunk is a rectangle of iso screen space shown as one image at depth -1.9, above the
 * old diamond tiles, which stay underneath as a fallback until a chunk is ready.
 */
const CW = 512, CH = 256; // chunk size in iso screen px
const RES = 2; // texture pixels per screen px (camera zoom is 3, so the ground stays sharp)
const DEPTH = -1.9;
const PREFETCH = 384; // iso px painted beyond the screen margin, so new ground is ready before it scrolls into view
const FADE_MS = 220; // a chunk that still lands on screen blends in instead of popping over the plain tiles

const SOLID = new Set<number>([
  T.TREE, T.PINE, T.BUSH, T.ROCK, T.PALISADE, T.ROOF_THATCH, T.ROOF_RED, T.ROOF_SLATE, T.WALL_TIMBER, T.WALL_STONE,
  T.WINDOW_TIMBER, T.WINDOW_STONE, T.DOOR, T.WELL, T.RUIN, T.BEAM, T.STUMP, T.BARREL, T.CRATE, T.HAY,
  T.ADOBE, T.ADOBE_WALL, T.TENT, T.PALM,
]);

export class SmoothGround {
  private workers: Worker[] = [];
  private busy: boolean[] = [];
  private live = new Map<string, Phaser.GameObjects.Image | null>(); // null = being painted
  private queue: { key: string; cx: number; cy: number; d?: number }[] = [];
  private near = new Set<string>(); // chunks on screen (plus a small margin): the ones the loading screen waits for
  private pins: { x: number; y: number }[] = []; // far spots painted ahead and kept (see pin())

  constructor(private scene: Phaser.Scene, ground: number[][], private onImage: (img: Phaser.GameObjects.Image) => void) {
    const g = new Int16Array(MAP_W * MAP_H), solid = new Uint8Array(MAP_W * MAP_H), cliff = new Uint8Array(MAP_W * MAP_H);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      g[y * MAP_W + x] = ground[y][x];
      const o = OBJECTS[y][x];
      if (o === T.CLIFF) cliff[y * MAP_W + x] = 1;
      else if (o !== EMPTY && SOLID.has(o)) solid[y * MAP_W + x] = 1;
    }
    const data: GroundData = { w: MAP_W, h: MAP_H, tile: TILE, tileCount: TILE_COUNT, ground: g, solid, lands: ELEMENT_LANDS.map((l) => ({ x: l.x, y: l.y, w: l.w, h: l.h, el: l.el })), cave: { y0: WORLD_H, rock: SEA_END, end: UNDER_END, deep: [DEEP_Y0, DEEP_END] }, desert: { y0: DESERT_Y0, y1: DESERT_Y0 + DESERT_H }, cliff };
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL("./groundWorker.ts", import.meta.url), { type: "module" });
      w.postMessage({ type: "init", data });
      w.onmessage = (ev) => this.done(i, ev.data);
      this.workers.push(w); this.busy.push(false);
    }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.workers.forEach((w) => w.terminate()));
  }

  /** Chunks on screen still waiting to be painted or being painted (0 once everything the camera sees is drawn). */
  get pending() {
    let n = 0;
    for (const q of this.queue) if (this.near.has(q.key)) n++;
    for (const [key, img] of this.live) if (img === null && this.near.has(key)) n++;
    return n;
  }
  /**
   * True when every chunk on screen (and the small margin round it) is painted and fully faded in. The painted ground
   * is opaque, so the plain diamond tiles under it can then stay hidden; they are the fallback while a chunk paints.
   */
  get covered() {
    for (const key of this.near) { const img = this.live.get(key); if (!img || img.alpha < 1) return false; }
    return true;
  }
  /** Chunks on screen already painted. */
  get painted() {
    let n = 0;
    for (const img of this.live.values()) if (img) n++;
    return n;
  }

  /**
   * Paint the ground around far spots (iso screen px) ahead of time and keep it, after everything near the camera.
   * Used for the other end of an awake waygate: a chunk takes over a second to paint, so crossing used to wait for a
   * whole screen of them behind the loading screen (Murat 2026-11-13: "the loading time is awful").
   */
  pin(spots: { x: number; y: number }[]) { this.pins = spots; }

  /** Call every frame with the camera's centre and size in iso screen px. */
  update(midX: number, midY: number, viewW: number, viewH: number) {
    // Chunks are painted well ahead of the screen edge (PREFETCH), nearest first, so walking never shows the plain
    // tiles underneath being covered; only the ones near the screen count as pending.
    const m = 160 + PREFETCH;
    const n0x = Math.floor((midX - viewW / 2 - 160) / CW), n1x = Math.floor((midX + viewW / 2 + 160) / CW);
    const n0y = Math.floor((midY - viewH / 2 - 160) / CH), n1y = Math.floor((midY + viewH / 2 + 160) / CH);
    this.near.clear();
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
      if (cx >= n0x && cx <= n1x && cy >= n0y && cy <= n1y) this.near.add(key);
      if (!this.live.has(key)) add.push({ key, cx, cy, d: Math.hypot(sx0 + CW / 2 - midX, (sy0 + CH / 2 - midY) * 2) });
    }
    // pinned spots: the chunks a camera centred there would wait for, painted last and never dropped while pinned
    const pinned: typeof add = [];
    for (const p of this.pins) {
      const p0x = Math.floor((p.x - viewW / 2 - 160) / CW), p1x = Math.floor((p.x + viewW / 2 + 160) / CW);
      const p0y = Math.floor((p.y - viewH / 2 - 160) / CH), p1y = Math.floor((p.y + viewH / 2 + 160) / CH);
      for (let cy = p0y; cy <= p1y; cy++) for (let cx = p0x; cx <= p1x; cx++) {
        const key = `sg_${cx}_${cy}`;
        if (want.has(key)) continue;
        want.add(key);
        if (!this.live.has(key)) pinned.push({ key, cx, cy, d: 1e9 + Math.hypot(cx * CW + CW / 2 - p.x, (cy * CH + CH / 2 - p.y) * 2) });
      }
    }
    add.push(...pinned);
    // keep one extra ring before dropping chunks, so walking back and forth doesn't repaint
    for (const [key, img] of this.live) {
      const [, x, y] = key.split("_").map(Number);
      if (!want.has(key) && (x < cx0 - 1 || x > cx1 + 1 || y < cy0 - 1 || y > cy1 + 1)) {
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
      if (this.near.has(m.key)) { img.setAlpha(0); this.scene.tweens.add({ targets: img, alpha: 1, duration: FADE_MS }); }
      this.live.set(m.key, img);
    }
    this.pump();
  }
}
