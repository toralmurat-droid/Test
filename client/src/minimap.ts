import { uiScale } from "./worldscale";
import { DESERT_H, DESERT_Y0, inDeepRow, MAP_H, MAP_W, TILE, UNDER_END, WORLD_H } from "../../shared/constants";
import { floorAt, SEA_END } from "../../shared/dungeon";
import { AREAS, EMPTY, GROUND, OBJECTS, T } from "../../shared/map";
import { createTilesetCanvas, tileColors } from "./tileset";
import { ISO } from "./isoflag";
import { pixelText } from "./pixeltext";
import { clasp, frameBorderImage, plaque, FRAME } from "./mapframe";
import { drawWarLegend, drawWarTable, warTableOn, setWarTableOn } from "./warTable";
import type { WarView } from "../../shared/war/view";

const VIEW_W = 56, VIEW_H = 56; // tiles shown around the player on the (round) minimap
const PX = 3; // minimap canvas pixels per tile (56x56 tiles -> 168x168)
const MIN_VIEW = 24; // minimap zoom when almost nothing is explored (tiles across)
const MAP_PAD = 6; // fog tiles kept around the explored area on the world map
const PF = '"Pixelify Sans", monospace';
const REVEAL = 9; // tiles around the player that become discovered
const FADE = 3; // soft edge of the discovered area, in tiles
const FOG = "#15151d";
const MAP_SIZE = 0.82; // world map frame: share of the screen's width and height it may take
const MAX_ZOOM = 32; // world map: most canvas pixels per tile when zoomed in
const PAN_SPEED = 700; // world map: canvas pixels per second while I/J/K/L are held
const ZOOM_SPEED = 2.2; // world map: zoom factor per second while + / - are held
const ISO_K = 0.78, C45 = Math.SQRT1_2; // the iso world map is turned 45 degrees and shrunk to fit
/** Keys that steer the open world map (matched by the letter typed). The game never sees them while it is open. */
const PAN_KEYS: Record<string, [number, number]> = { I: [0, -1], K: [0, 1], J: [-1, 0], L: [1, 0] };

type P = { x: number; y: number };
/** Another online hero: shown on both maps in its own colour, named on the world map. */
export type OtherHero = P & { name?: string };
const ALLY = "#5ec8ff"; // other players (own hero is gold)
/** Something to point at on the maps: a quest giver ("!" / "?"), a trader, or a quest area (circle). */
export interface MapMarker { x: number; y: number; glyph: string; color: string; r?: number; label?: string; track?: boolean; /** a drawn stair icon (the Mawdeep's ways down and up) */ stair?: "down" | "up"; /** a drawn stone arch (Act 2's waygate); "awake" fills it with light */ gate?: "asleep" | "awake"; /** only once that spot is discovered */ fogged?: boolean }

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
  /** Bounding box of everything discovered so far (tiles, inclusive); the maps only frame this. */
  private bx0 = MAP_W; private by0 = MAP_H; private bx1 = -1; private by1 = -1;
  /** The same for Act 2's desert (shared/desert.ts): the maps frame the act the hero is in. */
  private dx0 = MAP_W; private dy0 = MAP_H; private dx1 = -1; private dy1 = -1;
  private inDesert = false;
  private view = MIN_VIEW; // tiles currently shown across the minimap (eases towards the explored size)
  /** Quest and NPC markers, set by the NPC layer every frame. */
  markers: MapMarker[] = [];
  /** The clan war snapshot, for the war table layer (warTable.ts). */
  war?: WarView;
  /** Last positions given to draw(): the world map redraws every frame while open. */
  private me?: P;
  private others: OtherHero[] = [];
  /**
   * World map camera: tile at the canvas centre and canvas pixels per tile. Undefined = the default framing
   * (explored area); the first pan or zoom starts from that framing. `follow` keeps the hero in the middle.
   */
  private cam?: { cx: number; cy: number; s: number };
  private follow = false;
  private held = new Set<string>(); // map keys held down
  private lastBig = 0;
  private ptrs = new Map<number, { x: number; y: number }>(); // pointers down on the world map (canvas px)
  private dragged = false; // the current press moved the map (not a tap)
  private downAt?: { x: number; y: number };
  private lastTap?: { t: number; x: number; y: number };

  constructor(private el: HTMLCanvasElement, name = "") {
    el.width = VIEW_W * PX;
    el.height = VIEW_H * PX;
    this.ctx = el.getContext("2d")!;
    this.key = "fog:" + (name || "hero");

    const colors = tileColors(createTilesetCanvas(1)); // colours come from row 0, so only that row is painted
    this.colors.width = this.fog.width = MAP_W;
    this.colors.height = this.fog.height = MAP_H;
    const b = this.colors.getContext("2d")!;
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const o = OBJECTS[y][x];
      // the Mawdeep: black rock, dim cave floors
      const g = GROUND[y][x];
      b.fillStyle = y >= DESERT_Y0 && y < DESERT_Y0 + DESERT_H ? (o === T.CLIFF ? "#7a4a2c" : o !== EMPTY && o !== T.BUSH ? colors[o] : g === T.SAND ? "#c99c60" : g === T.DIRT ? "#a8744a" : g === T.GRASS ? "#5e6e30" : colors[g]) // the desert
        : y >= SEA_END ? (o !== EMPTY ? "#0d0b0c" : "#4a3d33") : colors[o !== EMPTY ? o : g];
      b.fillRect(x, y, 1, 1);
    }
    this.fogCtx = this.fog.getContext("2d")!;
    this.load();
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (this.seen[y * MAP_W + x]) this.grow(x, y);
    this.view = this.targetView();
    this.paintFog(0, 0, MAP_W, MAP_H);

    // Big world map overlay
    this.overlay = document.createElement("div");
    this.overlay.id = "worldmap";
    this.overlay.innerHTML = `<div class="wm-box"><div class="wm-title"></div><canvas class="wm-map"></canvas><div class="wm-hint"><button type="button" class="wm-center" tabindex="-1" title="Centre on your hero (C)">◎ Centre</button><button type="button" class="wm-war" tabindex="-1" title="Show who holds each land in the clan war">War table</button><span class="wm-keys">Drag or I J K L to move · Wheel or + / − to zoom · C or double-click to centre · M / Esc to close</span><span class="wm-touch">Drag · Pinch to zoom · Double-tap to centre</span></div></div>`;
    this.big = this.overlay.querySelector("canvas")!;
    // Ornate frame: iron-bound oak with gem corners, a title plaque on top and clasps on the sides
    const box = this.overlay.querySelector<HTMLDivElement>(".wm-box")!;
    box.style.borderImage = frameBorderImage();
    box.style.borderWidth = `${FRAME * 3}px`;
    const title = pixelText("Map of Oakvale", "#e8c27a", 11, 2);
    const plate = plaque(title.width * 2, title.height * 2);
    const tbox = this.overlay.querySelector<HTMLDivElement>(".wm-title")!;
    tbox.append(plate, title);
    const l = clasp(true), r = clasp(true), bt = clasp(false);
    l.classList.add("wm-l"); r.classList.add("wm-r"); bt.classList.add("wm-b");
    box.append(l, r, bt);
    document.body.appendChild(this.overlay);
    // Only a click on the dark backdrop closes the map: the map itself is dragged and zoomed
    this.overlay.addEventListener("click", (ev) => { if (ev.target === this.overlay) this.toggle(false); });
    const centre = this.overlay.querySelector<HTMLButtonElement>(".wm-center")!;
    centre.addEventListener("mousedown", (ev) => ev.preventDefault());
    centre.addEventListener("click", () => { centre.blur(); this.recentre(); });
    const war = this.overlay.querySelector<HTMLButtonElement>(".wm-war")!;
    war.classList.toggle("on", warTableOn());
    war.addEventListener("mousedown", (ev) => ev.preventDefault());
    war.addEventListener("click", () => { war.blur(); setWarTableOn(!warTableOn()); war.classList.toggle("on", warTableOn()); });
    this.bindMapInput();
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
    // Map keys while the map is open: caught before the game (capture phase) so I/J/K/L/C/+/- don't open menus
    // or cast; the arrows and WASD still reach the game, so the hero keeps walking. Key-ups always go through.
    window.addEventListener("keydown", (ev) => {
      if (!this.isOpen || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) return;
      const k = this.mapKey(ev);
      if (!k) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      if (k === "C") { if (!ev.repeat) this.recentre(); return; }
      this.held.add(k);
    }, true);
    window.addEventListener("keyup", (ev) => { const k = this.mapKey(ev); if (k) this.held.delete(k); }, true);
    window.addEventListener("blur", () => this.held.clear());
  }

  /** The world-map key an event stands for: I/J/K/L (pan), C (centre), + / - (zoom). */
  private mapKey(ev: KeyboardEvent): string | undefined {
    const k = ev.key.length === 1 ? ev.key.toUpperCase() : "";
    if (k in PAN_KEYS || k === "C") return k;
    if (k === "+" || k === "=" || ev.code === "NumpadAdd") return "+";
    if (k === "-" || k === "_" || ev.code === "NumpadSubtract") return "-";
    return undefined;
  }

  /** Mouse, pen and touch on the world map: drag to move, wheel / pinch to zoom, double-click / double-tap to centre. */
  private bindMapInput() {
    const c = this.big;
    c.style.touchAction = "none";
    c.style.cursor = "grab";
    const at = (ev: { clientX: number; clientY: number }) => {
      const r = c.getBoundingClientRect(); // the overlay is CSS-zoomed: go back to canvas pixels
      return { x: (ev.clientX - r.left) * c.width / r.width, y: (ev.clientY - r.top) * c.height / r.height };
    };
    c.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0 && ev.pointerType === "mouse") return;
      c.setPointerCapture(ev.pointerId);
      const p = at(ev);
      this.ptrs.set(ev.pointerId, p);
      if (this.ptrs.size === 1) { this.dragged = false; this.downAt = p; }
      else this.dragged = true; // a second finger: pinch, never a tap
      c.style.cursor = "grabbing";
    });
    c.addEventListener("pointermove", (ev) => {
      const prev = this.ptrs.get(ev.pointerId);
      if (!prev) return;
      const p = at(ev);
      if (this.ptrs.size === 1) {
        if (!this.dragged && this.downAt && Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) < 5) return;
        this.dragged = true;
        this.pan(prev.x - p.x, prev.y - p.y);
        this.ptrs.set(ev.pointerId, p);
        return;
      }
      // Pinch: the two fingers' midpoint pans, their spread zooms around it
      const other = [...this.ptrs.entries()].find(([id]) => id !== ev.pointerId)![1];
      const m0 = { x: (other.x + prev.x) / 2, y: (other.y + prev.y) / 2 }, m1 = { x: (other.x + p.x) / 2, y: (other.y + p.y) / 2 };
      const d0 = Math.hypot(other.x - prev.x, other.y - prev.y), d1 = Math.hypot(other.x - p.x, other.y - p.y);
      this.pan(m0.x - m1.x, m0.y - m1.y);
      if (d0 > 10) this.zoomAt(d1 / d0, m1.x, m1.y);
      this.ptrs.set(ev.pointerId, p);
    });
    const up = (ev: PointerEvent) => {
      if (!this.ptrs.delete(ev.pointerId)) return;
      if (this.ptrs.size) { const [q] = this.ptrs.values(); this.downAt = q; return; } // pinch to one finger: keep dragging
      c.style.cursor = "grab";
      if (this.dragged || ev.type === "pointercancel") return;
      // A tap: two in a row (300 ms, close together) centre on the hero
      const p = at(ev), t = performance.now(), l = this.lastTap;
      if (l && t - l.t < 300 && Math.hypot(p.x - l.x, p.y - l.y) < 30) { this.lastTap = undefined; this.recentre(); }
      else this.lastTap = { t, x: p.x, y: p.y };
    };
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      const p = at(ev);
      const dy = ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaMode === 2 ? ev.deltaY * 400 : ev.deltaY;
      this.zoomAt(Math.pow(1.0015, -Math.max(-300, Math.min(300, dy))), p.x, p.y);
    }, { passive: false });
  }

  /** Canvas offset from the centre -> the same offset on the (possibly turned) map, in canvas pixels. */
  private unturn(dx: number, dy: number): [number, number] {
    if (!ISO) return [dx, dy];
    return [(dx * C45 + dy * C45) / ISO_K, (-dx * C45 + dy * C45) / ISO_K];
  }

  /** Bounds the world map camera may roam: the act (or dungeon floor) the hero is in, fog and all. */
  private bounds() {
    const me = this.me;
    const f = me && floorAt(Math.floor(me.x / TILE), Math.floor(me.y / TILE));
    if (f) return { x0: f.x, y0: f.y, x1: f.x + f.w, y1: f.y + f.h };
    if (me && me.y >= WORLD_H * TILE && me.y < UNDER_END * TILE) return { x0: 0, y0: WORLD_H, x1: MAP_W, y1: UNDER_END };
    return this.inDesert ? { x0: 0, y0: DESERT_Y0, x1: MAP_W, y1: DESERT_Y0 + DESERT_H } : { x0: 0, y0: 0, x1: MAP_W, y1: WORLD_H };
  }

  /** The camera, made from the default framing the first time the map is moved. */
  private camera() {
    if (!this.cam) {
      const cw = this.big.width, ch = this.big.height, R = this.region(cw, ch, this.me);
      this.cam = { cx: R.x + cw / R.s / 2, cy: R.y + ch / R.s / 2, s: R.s };
    }
    return this.cam;
  }

  /** Keeps the camera's zoom and centre inside the bounds (zoomed out, the whole act fits). */
  private clampCam() {
    const c = this.cam;
    if (!c) return;
    const B = this.bounds(), cw = this.big.width, ch = this.big.height;
    const fit = Math.min(cw / (B.x1 - B.x0), ch / (B.y1 - B.y0)) / (ISO ? 1.2 : 1);
    c.s = Math.max(Math.min(fit, this.region(cw, ch, this.me).s), Math.min(MAX_ZOOM, c.s));
    c.cx = Math.max(B.x0, Math.min(B.x1, c.cx));
    c.cy = Math.max(B.y0, Math.min(B.y1, c.cy));
  }

  /** Moves the world map by a canvas-pixel offset (screen directions, even on the turned iso map). */
  private pan(dx: number, dy: number) {
    const c = this.camera(), [mx, my] = this.unturn(dx, dy);
    c.cx += mx / c.s; c.cy += my / c.s;
    this.follow = false;
    this.clampCam();
  }

  /** Zooms the world map by `f`, keeping the spot under canvas point (px, py) in place. */
  private zoomAt(f: number, px: number, py: number) {
    const c = this.camera(), [ox, oy] = this.unturn(px - this.big.width / 2, py - this.big.height / 2);
    const tx = c.cx + ox / c.s, ty = c.cy + oy / c.s; // tile under the point
    c.s *= f;
    this.clampCam();
    if (!this.follow) { c.cx = tx - ox / c.s; c.cy = ty - oy / c.s; this.clampCam(); }
  }

  /** Centres the world map on the hero and keeps following them. */
  private recentre() {
    if (!this.me) return;
    const c = this.camera();
    c.cx = this.me.x / TILE; c.cy = this.me.y / TILE;
    this.follow = true;
    this.clampCam();
  }

  get isOpen() { return this.overlay.classList.contains("open"); }

  /** True while the turned (iso) world map draws its markers: their glyphs turn back upright. */
  private turned = false;

  toggle(open = !this.isOpen) {
    if (open && !this.isOpen) { this.cam = undefined; this.follow = false; } // opens on the explored area, as before
    this.overlay.classList.toggle("open", open);
    if (!open) { this.held.clear(); this.ptrs.clear(); }
    this.last = 0;
  }

  private load() {
    try {
      const s = localStorage.getItem(this.key);
      if (!s) return;
      const bin = atob(s);
      if (bin.length === this.seen.length) { for (let i = 0; i < bin.length; i++) this.seen[i] = bin.charCodeAt(i); return; }
      for (const [ow, oh] of [[288, 288], [288, 216], [224, 168], [160, 120]]) { // saved before the map grew: same coordinates, copy row by row
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

  private grow(x: number, y: number) {
    if (inDeepRow(y)) return; // the deep dungeons frame their floor
    if (y >= DESERT_Y0) {
      if (x < this.dx0) this.dx0 = x; if (x > this.dx1) this.dx1 = x;
      if (y < this.dy0) this.dy0 = y; if (y > this.dy1) this.dy1 = y;
      return;
    }
    if (y >= WORLD_H) return; // the world map frames the overworld; below ground it frames the floor you are on
    if (x < this.bx0) this.bx0 = x; if (x > this.bx1) this.bx1 = x;
    if (y < this.by0) this.by0 = y; if (y > this.by1) this.by1 = y;
  }
  /** The explored box of the act the hero is in. */
  private box() {
    return this.inDesert ? { x0: this.dx0, y0: this.dy0, x1: this.dx1, y1: this.dy1 } : { x0: this.bx0, y0: this.by0, x1: this.bx1, y1: this.by1 };
  }

  /** Minimap zoom: shows a little more than the explored area, up to VIEW_W tiles across. */
  private targetView() {
    const B = this.box();
    const ext = Math.max(B.x1 - B.x0, B.y1 - B.y0) + 1;
    return Math.max(MIN_VIEW, Math.min(VIEW_W, ext * 0.6 + 8));
  }

  /**
   * Part of the world shown on the opened map: the explored area plus a fog margin, widened to the canvas shape
   * and zoomed (whole pixels per tile) so it fills the fixed-size frame.
   */
  private region(cw: number, ch: number, me?: P) {
    const f = me && floorAt(Math.floor(me.x / TILE), Math.floor(me.y / TILE));
    if (f) {
      const s = Math.max(1, Math.floor(Math.min(cw / f.w, ch / f.h)));
      return { x: f.x + f.w / 2 - cw / s / 2, y: f.y + f.h / 2 - ch / s / 2, s };
    }
    const B = this.box();
    if (B.x1 < 0) return { x: 0, y: this.inDesert ? DESERT_Y0 : 0, s: Math.max(1, Math.floor(Math.min(cw / MAP_W, ch / WORLD_H))) };
    const w = Math.max(24, B.x1 - B.x0 + 1 + MAP_PAD * 2), hh = Math.max(18, B.y1 - B.y0 + 1 + MAP_PAD * 2);
    const s = Math.max(1, Math.floor(Math.min(cw / w, ch / hh)));
    const cx = (B.x0 + B.x1 + 1) / 2, cy = (B.y0 + B.y1 + 1) / 2;
    return { x: Math.round((cx - cw / s / 2) * s) / s, y: Math.round((cy - ch / s / 2) * s) / s, s };
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
      if (v > this.seen[k]) { this.seen[k] = v; changed = true; this.grow(x, y); }
    }
    if (changed) { this.paintFog(x0, y0, x1 - x0 + 1, y1 - y0 + 1); this.dirty = true; }
  }

  draw(now: number, me: P | undefined, others: OtherHero[]) {
    this.me = me; this.others = others;
    if (now - this.last >= 100) { this.last = now; this.drawMini(now, me, others); }
    // World map (only while open): every frame, so dragging, zooming and following are smooth
    if (this.isOpen) this.drawBig(now, me, others);
  }

  private dot(g: CanvasRenderingContext2D, p: P, s: number, ox: number, oy: number, color: string, r: number) {
    g.fillStyle = color;
    g.fillRect(Math.round((p.x / TILE - ox) * s) - r, Math.round((p.y / TILE - oy) * s) - r, r * 2, r * 2);
  }

  private drawMini(now: number, me: P | undefined, others: OtherHero[]) {
    if (me) this.inDesert = me.y >= DESERT_Y0 * TILE && !inDeepRow(Math.floor(me.y / TILE));
    if (me) this.reveal(Math.floor(me.x / TILE), Math.floor(me.y / TILE));
    if (this.dirty && now - this.lastSave > 3000) { this.save(); this.dirty = false; this.lastSave = now; }

    // Minimap: the player's surroundings
    // Iso view: drawn north-up off screen, then turned 45 degrees so "up" matches up on the screen
    if (ISO && !this.flat) { this.flat = document.createElement("canvas"); this.flat.width = this.el.width; this.flat.height = this.el.height; }
    const c = ISO ? this.flat!.getContext("2d")! : this.ctx;
    c.imageSmoothingEnabled = false;
    const cx = me ? me.x / TILE : MAP_W / 2, cy = me ? me.y / TILE : MAP_H / 2;
    // The minimap zooms out as more of the world is discovered, so the world's size isn't given away at the start.
    const tv = this.targetView();
    this.view += (tv - this.view) * 0.08;
    if (Math.abs(tv - this.view) < 0.05) this.view = tv;
    const mpx = this.el.width / this.view; // canvas pixels per tile right now
    // the player always sits in the middle of the round minimap; beyond the map edge is fog
    const sx = cx - this.view / 2, sy = cy - this.view / 2;
    c.fillStyle = FOG;
    c.fillRect(0, 0, this.el.width, this.el.height);
    c.drawImage(this.colors, -sx * mpx, -sy * mpx, MAP_W * mpx, MAP_H * mpx);
    c.drawImage(this.fog, -sx * mpx, -sy * mpx, MAP_W * mpx, MAP_H * mpx);
    const dot = this.dot.bind(this);
    // Other online heroes: blue dots with a dark outline, shown even in unexplored parts
    for (const o of others) { dot(c, o, mpx, sx, sy, "#000", 3); dot(c, o, mpx, sx, sy, ALLY, 2); }
    this.drawMarkers(c, mpx, sx, sy, true);
    if (me) { dot(c, me, mpx, sx, sy, "#000", 3); dot(c, me, mpx, sx, sy, "#ffd166", 2); }
    if (ISO) {
      const o = this.ctx, w = this.el.width, h = this.el.height;
      o.fillStyle = FOG; o.fillRect(0, 0, w, h);
      o.save(); o.translate(w / 2, h / 2); o.rotate(Math.PI / 4); o.translate(-w / 2, -h / 2);
      o.imageSmoothingEnabled = false; o.drawImage(this.flat!, 0, 0); o.restore();
    }

  }

  private drawBig(now: number, me: P | undefined, others: OtherHero[]) {
    const dt = Math.min(0.1, (now - (this.lastBig || now)) / 1000);
    this.lastBig = now;
    const dot = this.dot.bind(this);
    // Only the explored part (plus a fog margin) is framed, so the map grows as the world is discovered.
    // The frame keeps a fixed size; the explored part (plus a fog margin) is zoomed to fill it, so the map
    // zooms out as the world is discovered and never shows how big the world is.
    const z = uiScale(), vw = window.innerWidth / z, vh = window.innerHeight / z; // the map overlay is zoomed (worldscale.ts)
    // width: gutter, frame, padding + canvas border, the side clasps; height: the hint row can wrap on narrow screens
    const hintH = this.overlay.querySelector<HTMLElement>(".wm-hint")!.offsetHeight || 30;
    // The framed map takes at most MAP_SIZE of the screen, so the game stays visible around it
    const aw = Math.min(vw - 32, vw * MAP_SIZE), ah = Math.min(vh - 32, vh * MAP_SIZE);
    const cw = Math.max(240, Math.min(1100, Math.round(aw - FRAME * 6 - 28 - 78))), ch = Math.max(180, Math.round(ah - FRAME * 6 - 60 - hintH));
    if (this.big.width !== cw || this.big.height !== ch) {
      this.big.width = cw; this.big.height = ch;
      this.big.style.width = `${cw}px`; this.big.style.height = `${ch}px`;
    }
    // Held keys: I/J/K/L pan (screen directions), + / - zoom around the centre
    if (this.held.size) {
      let px = 0, py = 0;
      for (const k of this.held) { const d = PAN_KEYS[k]; if (d) { px += d[0]; py += d[1]; } }
      if (px || py) { const n = Math.hypot(px, py); this.pan((px / n) * PAN_SPEED * dt, (py / n) * PAN_SPEED * dt); }
      const zf = (this.held.has("+") ? 1 : 0) - (this.held.has("-") ? 1 : 0);
      if (zf) this.zoomAt(Math.pow(ZOOM_SPEED, zf * dt), cw / 2, ch / 2);
    }
    if (this.follow && me && this.cam) { this.cam.cx = me.x / TILE; this.cam.cy = me.y / TILE; }
    this.clampCam();
    const R = this.cam ? { x: this.cam.cx - cw / this.cam.s / 2, y: this.cam.cy - ch / this.cam.s / 2, s: this.cam.s } : this.region(cw, ch, me), BIG = R.s;
    const g = this.big.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.fillStyle = FOG;
    g.fillRect(0, 0, this.big.width, this.big.height);
    // Iso view (Murat 2026-11-07): the world map turns 45 degrees like the minimap, so up on the map is up on the
    // screen; the map is drawn turned, the labels are placed at the turned spots but stay upright
    const K = ISO_K;
    const T = (x: number, y: number): [number, number] => {
      if (!ISO) return [x, y];
      const dx = x - cw / 2, dy = y - ch / 2;
      return [cw / 2 + K * (dx * C45 - dy * C45), ch / 2 + K * (dx * C45 + dy * C45)];
    };
    g.save();
    if (ISO) { g.translate(cw / 2, ch / 2); g.rotate(Math.PI / 4); g.scale(K, K); g.translate(-cw / 2, -ch / 2); }
    g.drawImage(this.colors, -R.x * BIG, -R.y * BIG, MAP_W * BIG, MAP_H * BIG);
    g.drawImage(this.fog, -R.x * BIG, -R.y * BIG, MAP_W * BIG, MAP_H * BIG);
    if (this.war && warTableOn()) drawWarTable(g, this.war, BIG, R.x, R.y, now);
    this.turned = ISO;
    this.drawMarkers(g, BIG, R.x, R.y, false);
    this.turned = false;
    for (const o of others) { dot(g, o, BIG, R.x, R.y, "#000", 5); dot(g, o, BIG, R.x, R.y, ALLY, 3); }
    if (me) { dot(g, me, BIG, R.x, R.y, "#000", 6); dot(g, me, BIG, R.x, R.y, "#ffd166", 4); }
    g.restore();
    g.font = `13px ${PF}`;
    g.textAlign = "center";
    const named = new Set<string>();
    const boxes: [number, number, number][] = [];
    for (const a of AREAS) {
      if (named.has(a.name) || a.w * a.h > 2500) continue; // skip the huge background regions
      const ax = Math.floor(a.x + a.w / 2), ay = Math.floor(a.y + a.h / 2);
      if (this.seen[ay * MAP_W + ax] < 200) continue;
      const [lx, ly] = T((ax - R.x) * BIG, (ay - R.y) * BIG), half = g.measureText(a.name).width / 2 + 4;
      if (boxes.some(([bx, by, bh]) => Math.abs(by - ly) < 16 && Math.abs(bx - lx) < bh + half)) continue; // don't overlap labels
      boxes.push([lx, ly, half]);
      named.add(a.name);
      g.fillStyle = "#000"; g.fillText(a.name, lx + 1, ly + 1);
      g.fillStyle = "#ffe8a3"; g.fillText(a.name, lx, ly);
    }
    if (this.war && warTableOn()) drawWarLegend(g, this.war, PF);
    // Other online heroes: name above their dot (the dots are drawn with the map, above)
    g.font = `11px ${PF}`; g.textAlign = "center"; g.textBaseline = "alphabetic";
    for (const o of others) {
      if (!o.name) continue;
      const [px, py] = T((o.x / TILE - R.x) * BIG, (o.y / TILE - R.y) * BIG), lx = Math.round(px), ly = Math.round(py) - 8;
      g.fillStyle = "#000"; g.fillText(o.name, lx + 1, ly + 1);
      g.fillStyle = ALLY; g.fillText(o.name, lx, ly);
    }
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
      if (m.fogged && this.seen[Math.floor(m.y / TILE) * MAP_W + Math.floor(m.x / TILE)] < 100) continue;
      if (m.stair) {
        // a little flight of steps and an arrow, drawn in pixels so it reads at any size
        const u = mini ? 2 : 3;
        g.save(); g.translate(Math.round(x), Math.round(y));
        if ((mini || this.turned) && ISO) g.rotate(-Math.PI / 4);
        const box = (bx: number, by: number, bw: number, bh: number, c: string) => { g.fillStyle = c; g.fillRect(bx * u, by * u, bw * u, bh * u); };
        box(-4, -4, 9, 9, "#000");
        for (let k = 0; k < 3; k++) box(-3 + k * 2, -3 + k * 2, 7 - k * 2, 1, m.color); // steps
        if (m.stair === "down") { box(-1, 1, 3, 1, m.color); box(0, 2, 1, 2, m.color); box(-3, 2, 1, 1, m.color); box(-2, 3, 1, 1, m.color); }
        else { box(-3, 1, 1, 3, m.color); box(-4, 2, 3, 1, m.color); }
        g.restore();
      } else if (m.gate) {
        // the waygate: two pillars and a lintel in pixels, a veil of light between them once it is awake
        const u = mini ? 2 : 3;
        g.save(); g.translate(Math.round(x), Math.round(y));
        if ((mini || this.turned) && ISO) g.rotate(-Math.PI / 4);
        const box = (bx: number, by: number, bw: number, bh: number, c: string) => { g.fillStyle = c; g.fillRect(bx * u, by * u, bw * u, bh * u); };
        box(-5, -6, 11, 11, "#000");
        box(-4, -5, 9, 2, m.color); box(-3, -3, 2, 7, m.color); box(2, -3, 2, 7, m.color); // lintel and pillars
        box(-1, -3, 3, 7, m.gate === "awake" ? `rgba(255,214,120,${0.6 + Math.sin(t * 4) * 0.3})` : "#1a120c");
        g.restore();
      } else if (m.glyph) {
        const size = mini ? (m.track ? 14 : 11) : (m.track ? 18 : 14);
        g.font = `bold ${size}px ${PF}`; g.textAlign = "center"; g.textBaseline = "middle";
        g.save(); g.translate(x, y);
        if ((mini || this.turned) && ISO) g.rotate(-Math.PI / 4); // stays upright once the iso map is turned
        g.lineWidth = 3; g.strokeStyle = "#000"; g.strokeText(m.glyph, 0, 0);
        g.fillStyle = m.color; g.fillText(m.glyph, 0, 0);
        g.restore();
      }
      if (!mini && m.label && (m.track || m.r || m.stair || m.gate)) {
        g.font = `11px ${PF}`; g.textAlign = "center"; g.textBaseline = "alphabetic";
        g.save(); g.translate(x, y);
        if (this.turned && ISO) g.rotate(-Math.PI / 4); // upright on the turned world map
        g.fillStyle = "#000"; g.fillText(m.label, 1, (m.r ? 4 : m.stair || m.gate ? 22 : 18) + 1);
        g.fillStyle = m.color; g.fillText(m.label, 0, m.r ? 4 : m.stair || m.gate ? 22 : 18);
        g.restore();
      }
    }
  }
}
