import { MAP_H, MAP_W, TILE } from "../../shared/constants";
import { EMPTY, GROUND, OBJECTS } from "../../shared/map";
import { createTilesetCanvas, tileColors } from "./tileset";

const SCALE = 2; // minimap pixels per tile

/** Renders the world once at 2px/tile, then overlays player dots each frame. */
export class Minimap {
  private base = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private last = 0;

  constructor(private el: HTMLCanvasElement) {
    el.width = this.base.width = MAP_W * SCALE;
    el.height = this.base.height = MAP_H * SCALE;
    this.ctx = el.getContext("2d")!;
    const colors = tileColors(createTilesetCanvas());
    const b = this.base.getContext("2d")!;
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const o = OBJECTS[y][x];
      b.fillStyle = colors[o !== EMPTY ? o : GROUND[y][x]];
      b.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
    }
  }

  draw(now: number, me: { x: number; y: number } | undefined, others: { x: number; y: number }[]) {
    if (now - this.last < 100) return;
    this.last = now;
    const c = this.ctx;
    c.drawImage(this.base, 0, 0);
    const dot = (p: { x: number; y: number }, color: string, r: number) => {
      c.fillStyle = color;
      c.fillRect(Math.round((p.x / TILE) * SCALE) - r, Math.round((p.y / TILE) * SCALE) - r, r * 2, r * 2);
    };
    for (const o of others) dot(o, "#fff", 1);
    if (me) { dot(me, "#000", 3); dot(me, "#ffd166", 2); }
  }
}
