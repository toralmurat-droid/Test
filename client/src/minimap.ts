import { MAP_H, MAP_W, TILE } from "../../shared/constants";
import { AREAS, EMPTY, GROUND, OBJECTS } from "../../shared/map";
import { createTilesetCanvas, tileColors } from "./tileset";
import { ISO } from "./isoflag";

const VIEW_W = 56, VIEW_H = 56; // tiles shown around the player on the (round) minimap
const PX = 3; // minimap canvas pixels per tile (56x56 tiles -> 168x168)
const BIG = 5; // world map canvas pixels per tile
const REVEAL = 9; // tiles around the player that become discovered
const FADE = 3; // soft edge of the discovered area, in tiles
const FOG = "#15151d";

type P = { x: number; y: number };
/** Something to point at on the maps: a quest giver ("!" / "?"), a trader, or a quest area (circle). */
export interface MapMarker { x: number; y: number; glyph: string; color: string; r?: number; label?: string; track?: boolean }

/**
 * Minimap with fog of war: only places the player has been near are shown, and the minimap only
 * shows the surroundings. Clicking it (or pressing M) opens the whole world map, also fogged.
 * Discovery is remembered per hero name in localStorage.
 */
export class Minimap {
  private colors = document.createElement("canvas"); // 1 px per tile
  private fog = document.createElement("canvas"); // 1 px per tile, alpha = undiscovered
  private fogCtx: CanvasRenderingContext2D;
  private seen = new Uint8Array(MAP_W * MAP_H); // 0 = unknown .. 255 = discovered
  private ctx: CanvasRenderingContext2D;
  private flat?: HTMLCanvasElement; // iso view: unrotated minimap
  private last = 0;
  private lastSave = 0;
  private dirty = false;
  private overlay: HTMLDivElement;
  private big: HTMLCanvasElement;
  private key: string;
  /** Quest and NPC markers, set by the NPC layer every frame. */
  markers: MapMarker[] = [];

  constructor(private el: HTMLCanvasElement, name = "") {
    el.width = VIEW_W * PX;
    el.height = VIEW_H * PX;
    this.ctx = el.getContext("2d")!;
    this.key = "fog:" + (name || "hero");

    const colors = tileColors(createTilesetCanvas());
    this.colors.width = this.fog.width = MAP_W;
    this.colors.height = this.fog.height = MAP_H;
    const b = this.colors.getContext("2d")!;
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const o = OBJECTS[y][x];
      b.fillStyle = colors[o !== EMPTY ? o : GROUND[y][x]];
      b.fillRect(x, y, 1, 1);
    }
    this.fogCtx = this.fog.getContext("2d")!;
    this.load();
    this.paintFog(0, 0, MAP_W, MAP_H);

    // Big world map overlay
    this.overlay = document.createElement("div");
    this.overlay.id = "worldmap";
    this.overlay.innerHTML = `<div class="wm-box"><div class="wm-title">Map of Oakvale</div><canvas></canvas><div class="wm-hint">Click or press M / Esc to close</div></div>`;
    this.big = this.overlay.querySelector("canvas")!;
    this.big.width = MAP_W * BIG;
    this.big.height = MAP_H * BIG;
    document.body.appendChild(this.overlay);
    this.overlay.addEventListener("click", () => this.toggle(false));
    el.addEventListener("click", () => this.toggle(true));
    el.title = "Open map (M)";
    // Small globe button on the minimap's corner. Mouse/touch only: it never takes keyboard focus,
    // so Space/Enter (attack, chat) can't press it.
    const btn = document.createElement("button");
    btn.id = "worldbtn";
    btn.title = "World map (M)";
    btn.tabIndex = -1;
    btn.innerHTML = `<svg viewBox="0 0 12 12" width="20" height="20" shape-rendering="crispEdges" aria-hidden="true">
      <rect x="3" y="0" width="6" height="12" fill="#3a78b8"/><rect x="0" y="3" width="12" height="6" fill="#3a78b8"/><rect x="1" y="1" width="10" height="10" fill="#3a78b8"/>
      <rect x="2" y="2" width="3" height="2" fill="#5aa845"/><rect x="3" y="4" width="2" height="3" fill="#5aa845"/><rect x="7" y="3" width="3" height="2" fill="#5aa845"/>
      <rect x="6" y="5" width="3" height="3" fill="#5aa845"/><rect x="7" y="8" width="2" height="2" fill="#5aa845"/><rect x="2" y="8" width="2" height="1" fill="#5aa845"/>
      <rect x="3" y="1" width="2" height="1" fill="#9fd0ff"/><rect x="1" y="3" width="1" height="2" fill="#9fd0ff"/></svg>`;
    btn.addEventListener("mousedown", (ev) => ev.preventDefault());
    btn.addEventListener("click", (ev) => { if (ev.detail === 0) return; btn.blur(); this.toggle(true); });
    el.parentElement?.appendChild(btn);
    window.addEventListener("keydown", (ev) => {
      const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
      if (typing) return;
      if (ev.key === "m" || ev.key === "M") this.toggle();
      else if (ev.key === "Escape" && this.isOpen) this.toggle(false);
    });
  }

  get isOpen() { return this.overlay.classList.contains("open"); }

  toggle(open = !this.isOpen) {
    this.overlay.classList.toggle("open", open);
    this.last = 0;
  }

  private load() {
    try {
      const s = localStorage.getItem(this.key);
      if (!s) return;
      const bin = atob(s);
      if (bin.length === this.seen.length) { for (let i = 0; i < bin.length; i++) this.seen[i] = bin.charCodeAt(i); return; }
      for (const [ow, oh] of [[224, 168], [160, 120]]) { // saved before the map grew: same coordinates, copy row by row
        if (bin.length !== ow * oh) continue;
        for (let y = 0; y < oh && y < MAP_H; y++) for (let x = 0; x < ow && x < MAP_W; x++) this.seen[y * MAP_W + x] = bin.charCodeAt(y * ow + x);
      }
    } catch { /* storage unavailable: start with nothing discovered */ }
  }

  private save() {
    try {
      let bin = "";
      for (let i = 0; i < this.seen.length; i += 4096) bin += String.fromCharCode(...this.seen.subarray(i, i + 4096));
      localStorage.setItem(this.key, btoa(bin));
    } catch { /* ignore */ }
  }

  private paintFog(x0: number, y0: number, w: number, h: number) {
    const img = this.fogCtx.createImageData(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const o = (j * w + i) * 4;
      img.data[o] = 0x15; img.data[o + 1] = 0x15; img.data[o + 2] = 0x1d;
      img.data[o + 3] = 255 - this.seen[(y0 + j) * MAP_W + x0 + i];
    }
    this.fogCtx.putImageData(img, x0, y0);
  }

  /** Marks the tiles around the player as discovered. */
  private reveal(tx: number, ty: number) {
    const r = REVEAL + FADE;
    const x0 = Math.max(0, tx - r), y0 = Math.max(0, ty - r), x1 = Math.min(MAP_W - 1, tx + r), y1 = Math.min(MAP_H - 1, ty + r);
    let changed = false;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - tx, y - ty);
      const v = d <= REVEAL ? 255 : d < r ? Math.round(255 * (1 - (d - REVEAL) / FADE)) : 0;
      const k = y * MAP_W + x;
      if (v > this.seen[k]) { this.seen[k] = v; changed = true; }
    }
    if (changed) { this.paintFog(x0, y0, x1 - x0 + 1, y1 - y0 + 1); this.dirty = true; }
  }

  draw(now: number, me: P | undefined, others: P[]) {
    if (now - this.last < 100) return;
    this.last = now;
    if (me) this.reveal(Math.floor(me.x / TILE), Math.floor(me.y / TILE));
    if (this.dirty && now - this.lastSave > 3000) { this.save(); this.dirty = false; this.lastSave = now; }

    // Minimap: the player's surroundings
    // Iso view: drawn north-up off screen, then turned 45 degrees so "up" matches up on the screen
    if (ISO && !this.flat) { this.flat = document.createElement("canvas"); this.flat.width = this.el.width; this.flat.height = this.el.height; }
    const c = ISO ? this.flat!.getContext("2d")! : this.ctx;
    c.imageSmoothingEnabled = false;
    const cx = me ? me.x / TILE : MAP_W / 2, cy = me ? me.y / TILE : MAP_H / 2;
    // the player always sits in the middle of the round minimap; beyond the map edge is fog
    const sx = Math.round(cx - VIEW_W / 2), sy = Math.round(cy - VIEW_H / 2);
    c.fillStyle = FOG;
    c.fillRect(0, 0, this.el.width, this.el.height);
    c.drawImage(this.colors, -sx * PX, -sy * PX, MAP_W * PX, MAP_H * PX);
    c.drawImage(this.fog, -sx * PX, -sy * PX, MAP_W * PX, MAP_H * PX);
    const dot = (g: CanvasRenderingContext2D, p: P, s: number, ox: number, oy: number, color: string, r: number) => {
      g.fillStyle = color;
      g.fillRect(Math.round((p.x / TILE - ox) * s) - r, Math.round((p.y / TILE - oy) * s) - r, r * 2, r * 2);
    };
    const known = (p: P) => this.seen[Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)] > 128;
    for (const o of others) if (known(o)) dot(c, o, PX, sx, sy, "#fff", 2);
    this.drawMarkers(c, PX, sx, sy, true);
    if (me) { dot(c, me, PX, sx, sy, "#000", 3); dot(c, me, PX, sx, sy, "#ffd166", 2); }
    if (ISO) {
      const o = this.ctx, w = this.el.width, h = this.el.height;
      o.fillStyle = FOG; o.fillRect(0, 0, w, h);
      o.save(); o.translate(w / 2, h / 2); o.rotate(Math.PI / 4); o.translate(-w / 2, -h / 2);
      o.imageSmoothingEnabled = false; o.drawImage(this.flat!, 0, 0); o.restore();
    }

    // World map (only while open)
    if (!this.isOpen) return;
    const g = this.big.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.fillStyle = FOG;
    g.fillRect(0, 0, this.big.width, this.big.height);
    g.drawImage(this.colors, 0, 0, MAP_W * BIG, MAP_H * BIG);
    g.drawImage(this.fog, 0, 0, MAP_W * BIG, MAP_H * BIG);
    g.font = "bold 13px monospace";
    g.textAlign = "center";
    const named = new Set<string>();
    const boxes: [number, number, number][] = [];
    for (const a of AREAS) {
      if (named.has(a.name) || a.w * a.h > 2500) continue; // skip the huge background regions
      const ax = Math.floor(a.x + a.w / 2), ay = Math.floor(a.y + a.h / 2);
      if (this.seen[ay * MAP_W + ax] < 200) continue;
      const lx = ax * BIG, ly = ay * BIG, half = (a.name.length * 8) / 2 + 4;
      if (boxes.some(([bx, by, bh]) => Math.abs(by - ly) < 16 && Math.abs(bx - lx) < bh + half)) continue; // don't overlap labels
      boxes.push([lx, ly, half]);
      named.add(a.name);
      g.fillStyle = "#000"; g.fillText(a.name, ax * BIG + 1, ay * BIG + 1);
      g.fillStyle = "#ffe8a3"; g.fillText(a.name, ax * BIG, ay * BIG);
    }
    for (const o of others) if (known(o)) dot(g, o, BIG, 0, 0, "#fff", 3);
    this.drawMarkers(g, BIG, 0, 0, false);
    if (me) { dot(g, me, BIG, 0, 0, "#000", 6); dot(g, me, BIG, 0, 0, "#ffd166", 4); }
  }

  /**
   * Markers: dashed circle for quest areas, glyph for NPCs. On the round minimap a tracked target that is out of
   * view becomes an arrow on the rim pointing towards it.
   */
  private drawMarkers(g: CanvasRenderingContext2D, s: number, ox: number, oy: number, mini: boolean) {
    const W = g.canvas.width, H = g.canvas.height, cx = W / 2, cy = H / 2, rim = W / 2 - 9;
    const t = performance.now() / 1000;
    for (const m of this.markers) {
      let x = (m.x / TILE - ox) * s, y = (m.y / TILE - oy) * s;
      const off = mini && Math.hypot(x - cx, y - cy) > rim;
      if (off && !m.track) continue;
      if (m.r && !off) {
        // Quest area: pulsing dashed circle
        g.save();
        g.strokeStyle = m.color; g.lineWidth = mini ? 1.5 : 2.5; g.setLineDash([4, 3]); g.lineDashOffset = -t * 6;
        g.globalAlpha = 0.75 + Math.sin(t * 3) * 0.25;
        g.beginPath(); g.arc(x, y, (m.r / TILE) * s, 0, Math.PI * 2); g.stroke();
        g.fillStyle = m.color; g.globalAlpha = 0.12; g.fill();
        g.restore();
      }
      if (off) {
        // Arrow on the rim of the minimap
        const a = Math.atan2(y - cy, x - cx);
        x = cx + Math.cos(a) * rim; y = cy + Math.sin(a) * rim;
        g.save(); g.translate(x, y); g.rotate(a);
        g.fillStyle = "#000"; g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, -6); g.lineTo(-5, 6); g.closePath(); g.fill();
        g.fillStyle = m.color; g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, -4); g.lineTo(-4, 4); g.closePath(); g.fill();
        g.restore();
        continue;
      }
      if (m.glyph) {
        const size = mini ? (m.track ? 14 : 11) : (m.track ? 18 : 14);
        g.font = `bold ${size}px monospace`; g.textAlign = "center"; g.textBaseline = "middle";
        g.save(); g.translate(x, y);
        if (mini && ISO) g.rotate(-Math.PI / 4); // stays upright once the iso minimap is turned
        g.lineWidth = 3; g.strokeStyle = "#000"; g.strokeText(m.glyph, 0, 0);
        g.fillStyle = m.color; g.fillText(m.glyph, 0, 0);
        g.restore();
      }
      if (!mini && m.label && (m.track || m.r)) {
        g.font = "bold 11px monospace"; g.textAlign = "center"; g.textBaseline = "alphabetic";
        g.fillStyle = "#000"; g.fillText(m.label, x + 1, y + (m.r ? 4 : 18) + 1);
        g.fillStyle = m.color; g.fillText(m.label, x, y + (m.r ? 4 : 18));
      }
    }
  }
}
