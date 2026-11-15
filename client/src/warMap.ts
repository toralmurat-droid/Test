/**
 * War overlays for the normal world map and the minimap (W1 of the clan-war overhaul): the Holds the hero has found,
 * announced sieges with a countdown, front lines, the own clan's marches, caravans and tunnel mouths, the active writ's
 * land and a "calls to arms" list. Cosmetic: it draws the server's "war" snapshot, the clan's "warplan" and the "writ"
 * and "tunnels" messages, and decides nothing. The pure helpers (layout, geometry, texts) have tests (tests/warMap.test.ts).
 */
import { TILE } from "../../shared/constants";
import type { ClanKey } from "../../shared/war/clans";
import { CLAN_KEYS } from "../../shared/war/clans";
import { caravanLines } from "../../shared/war/caravans";
import { callsToArms, frontEdges, holdIntel, landPin, type CallToArms, type WarPlan } from "../../shared/war/intel";
import { HOLDS } from "../../shared/war/standards";
import { TERRITORIES, WAR_MAP, type Territory } from "../../shared/war/territories";
import type { MouthView } from "../../shared/war/tunnels";
import type { WarView } from "../../shared/war/view";
import type { WritKind } from "../../shared/war/writs";

/** Bright map colours per clan (as on the war table). */
export const CLAN_COL: Record<ClanKey, string> = { wardens: "#e08a2a", redfang: "#d03a2a", host: "#5fb0a0", hidekin: "#a0703a", veiled: "#7a7aff" };
const LABEL: Record<ClanKey, string> = { wardens: "Wardens", redfang: "Redfang", host: "Ossuary Host", hidekin: "Hide-Kin", veiled: "Veiled Circle" };
const FORT: Record<ClanKey, string> = { wardens: "stockade", redfang: "war camp", host: "keep", hidekin: "burrow-fort", veiled: "sanctum" };
const GOLD = "#ffd166", EMBER = "#f6b040";

// ---------- pure helpers (tested) ----------

/** "34:10", or "1:05:10" from an hour up: the badge and the list. */
export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
}

/** "34 min", "1 h 5 min", "under a minute": the tooltip. */
export function fmtIn(ms: number): string {
  const m = Math.ceil(Math.max(0, ms) / 60000);
  if (ms < 60000) return "under a minute";
  return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`;
}

/** The tooltip lines of territory t's Hold (or of a siege seen under fog when `held` is false: only the land and the siege). */
export function holdTip(v: WarView, t: number, wall: number, held = true): string[] {
  const i = holdIntel(v, t), out: string[] = [];
  const land = TERRITORIES[t]?.name ?? "";
  if (held && i.clan) {
    out.push(`${LABEL[i.clan]} ${FORT[i.clan]} · ${land}`);
    out.push(`Control ${i.control}%`);
    if (i.guards || i.patrol) out.push(`${i.guards} guards, ${i.patrol} on patrol`);
  } else out.push(land);
  if (i.siege) out.push(`Siege by ${LABEL[i.siege[0]]} in ${fmtIn(i.siege[1] - wall)}`);
  return out;
}

/** An arrow head at (x1, y1) for a line from (x0, y0): tip and the two wing points. */
export function arrowHead(x0: number, y0: number, x1: number, y1: number, size: number): [number, number][] {
  const a = Math.atan2(y1 - y0, x1 - x0), w = 0.5;
  return [[x1, y1], [x1 - Math.cos(a - w) * size, y1 - Math.sin(a - w) * size], [x1 - Math.cos(a + w) * size, y1 - Math.sin(a + w) * size]];
}

/** A cart on the straight line a -> b: `ms` the clock, `period` one trip, `phase` 0..1 to stagger the lines. */
export function cartAt(a: { x: number; y: number }, b: { x: number; y: number }, ms: number, period: number, phase: number): { x: number; y: number } {
  const f = (((ms / period + phase) % 1) + 1) % 1;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/**
 * The border between two neighbouring territories as a segment in tiles: along the gap between their rects when they
 * face each other, else a short stroke across the midpoint of the line between their centres. undefined when they only
 * meet through a link (a waygate), where there is no shared border.
 */
export function edgeSegment(a: Territory, b: Territory): [number, number, number, number] | undefined {
  const gx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)), gy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
  if (Math.hypot(Math.max(0, gx), Math.max(0, gy)) > WAR_MAP.adjacentTiles) return undefined;
  if (gx >= 0 && gy < 0) {
    const x = a.x + a.w <= b.x ? (a.x + a.w + b.x) / 2 : (b.x + b.w + a.x) / 2;
    return [x, Math.max(a.y, b.y), x, Math.min(a.y + a.h, b.y + b.h)];
  }
  if (gy >= 0 && gx < 0) {
    const y = a.y + a.h <= b.y ? (a.y + a.h + b.y) / 2 : (b.y + b.h + a.y) / 2;
    return [Math.max(a.x, b.x), y, Math.min(a.x + a.w, b.x + b.w), y];
  }
  const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2, dx = b.cx - a.cx, dy = b.cy - a.cy, d = Math.hypot(dx, dy) || 1, h = 5;
  return [mx - (dy / d) * h, my + (dx / d) * h, mx + (dy / d) * h, my - (dx / d) * h];
}

let edgeKey = "", edgeSegs: [number, number, number, number][] = [];
/** The front lines for these owners as tile segments (cached: only a war tick changes them). */
export function frontSegments(owner: readonly number[]): [number, number, number, number][] {
  const k = owner.join(",");
  if (k === edgeKey) return edgeSegs;
  edgeKey = k;
  edgeSegs = frontEdges(owner).flatMap(([a, b]) => { const s = edgeSegment(TERRITORIES[a], TERRITORIES[b]); return s ? [s] : []; });
  return edgeSegs;
}

/** The "calls to arms" panel geometry in canvas px: top-left corner, header, one rect per row. */
export interface PanelLayout { x: number; y: number; w: number; h: number; rows: { x: number; y: number; w: number; h: number }[] }
export const PANEL = { pad: 8, w: 270, head: 20, row: 21 };
export function panelLayout(n: number, cw: number): PanelLayout | undefined {
  if (n <= 0) return undefined;
  const w = Math.min(PANEL.w, cw - PANEL.pad * 2), x = PANEL.pad, y = PANEL.pad;
  return { x, y, w, h: PANEL.head + n * PANEL.row + 4, rows: Array.from({ length: n }, (_, i) => ({ x: x + 3, y: y + PANEL.head + i * PANEL.row, w: w - 6, h: PANEL.row - 1 })) };
}
export function panelRowAt(l: PanelLayout | undefined, px: number, py: number): number {
  return l ? l.rows.findIndex((r) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) : -1;
}

/** The row text of one call to arms. */
export function callLabel(c: CallToArms): string {
  switch (c.kind) {
    case "siege": return `${c.defend ? "Defend" : "Siege"} ${c.name}`;
    case "writ": return `Writ: ${c.name}`;
    case "march": return `${c.tunnel ? "Tunnel strike" : "March"}: ${c.name}`;
    default: return `Front: ${c.name}`;
  }
}

/** Where the tooltip box (w x h) goes beside a pointer at (px, py), kept inside the canvas (cw x ch). */
export function placeTip(px: number, py: number, w: number, h: number, cw: number, ch: number): { x: number; y: number } {
  let x = px + 16, y = py + 14;
  if (x + w > cw - 4) x = px - 16 - w;
  if (y + h > ch - 4) y = py - 14 - h;
  return { x: Math.max(4, Math.min(cw - w - 4, x)), y: Math.max(4, Math.min(ch - h - 4, y)) };
}

/** A point beyond the minimap rim, pulled onto the rim: the arrow's place and heading. `off` false when it is inside. */
export function rimPoint(x: number, y: number, cx: number, cy: number, rim: number): { x: number; y: number; a: number; off: boolean } {
  const a = Math.atan2(y - cy, x - cx), off = Math.hypot(x - cx, y - cy) > rim;
  return off ? { x: cx + Math.cos(a) * rim, y: cy + Math.sin(a) * rim, a, off } : { x, y, a, off };
}

/** What the minimap's rim arrows point at: the writ's land and the nearest siege the hero's clan attacks or defends (px). */
export function rimTargets(v: WarView, clan: ClanKey | undefined, writ: { t: number; clan?: ClanKey } | null | undefined, me: { x: number; y: number } | undefined): { x: number; y: number; color: string }[] {
  const out: { x: number; y: number; color: string }[] = [];
  if (writ && (!writ.clan || writ.clan === clan) && TERRITORIES[writ.t]) out.push({ ...landPin(writ.t), color: GOLD });
  const ci = clan ? CLAN_KEYS.indexOf(clan) : -1;
  if (ci >= 0 && me) {
    let best: { x: number; y: number; color: string } | undefined, bd = Infinity;
    for (const [t, by] of v.sieges) {
      if (by !== ci && v.owner[t] !== ci) continue;
      const p = landPin(t), d = Math.hypot(p.x - me.x, p.y - me.y);
      if (d < bd) { bd = d; best = { ...p, color: CLAN_COL[CLAN_KEYS[by]] ?? EMBER }; }
    }
    if (best) out.push(best);
  }
  return out;
}

// ---------- icons (cached canvases) ----------

const ART = ["#.#.#.#.#.#", "###########", "#sssssssss#", "#sscccccss#", "#sscccccss#", "#ssscccsss#", "#sssdddsss#", "#sssdddsss#", "###########"];
const icons = new Map<ClanKey, HTMLCanvasElement>();
/** A small fort in the clan's colour, 11 x 9 art px, built once per clan. */
function holdIcon(k: ClanKey): HTMLCanvasElement {
  let c = icons.get(k);
  if (c) return c;
  c = Object.assign(document.createElement("canvas"), { width: 11, height: 9 });
  const g = c.getContext("2d")!, pal: Record<string, string> = { "#": "#0d0a07", s: "#b8a888", c: CLAN_COL[k], d: "#2a1f16" };
  ART.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  icons.set(k, c);
  return c;
}
let hatch: CanvasPattern | undefined;
function hatchPattern(g: CanvasRenderingContext2D): CanvasPattern {
  if (hatch) return hatch;
  const c = Object.assign(document.createElement("canvas"), { width: 8, height: 8 }), p = c.getContext("2d")!;
  p.strokeStyle = "rgba(246,176,64,0.55)"; p.lineWidth = 1.5; p.beginPath();
  p.moveTo(-1, 9); p.lineTo(9, -1); p.moveTo(-1, 1); p.lineTo(1, -1); p.moveTo(7, 9); p.lineTo(9, 7); p.stroke();
  hatch = g.createPattern(c, "repeat")!;
  return hatch;
}

// ---------- drawing ----------

export interface WarMapData {
  war: WarView;
  clan?: ClanKey;
  plan?: WarPlan;
  writ?: { t: number; kind: WritKind; clan?: ClanKey } | null;
  tunnels?: MouthView[];
  /** Is this tile uncovered in the hero's fog? */
  seen(tx: number, ty: number): boolean;
}
export interface WarMapView {
  mini: boolean;
  /** Canvas px per tile, and the tile at the canvas's top-left (as the maps draw). */
  s: number; ox: number; oy: number;
  /** performance.now() and wall clock. */
  now: number; wall: number;
  /** After translating to a pin: undo the map's turn so icons and text stay upright. */
  upright(g: CanvasRenderingContext2D): void;
}

const pxs = (v: WarMapView, wx: number, wy: number): [number, number] => [(wx / TILE - v.ox) * v.s, (wy / TILE - v.oy) * v.s];

/** Everything that sits on the map itself (in the map's own, possibly turned, space). */
export function drawWarWorld(g: CanvasRenderingContext2D, d: WarMapData, v: WarMapView) {
  const war = d.war, mini = v.mini, t = v.now / 1000, ci = d.clan ? CLAN_KEYS.indexOf(d.clan) : -1;
  g.save();
  g.imageSmoothingEnabled = false;
  const rect = (T: Territory): [number, number, number, number] => [(T.x - v.ox) * v.s, (T.y - v.oy) * v.s, T.w * v.s, T.h * v.s];
  // Where the war is hot: a light hatching over the land
  if (!mini && war.hot?.length) {
    g.fillStyle = hatchPattern(g);
    for (const id of war.hot) { const T = TERRITORIES[id]; if (T) { const [x, y, w, h] = rect(T); g.globalAlpha = 0.5; g.fillRect(x, y, w, h); } }
    g.globalAlpha = 1;
  }
  // Front lines: the border where two holders meet
  g.lineCap = "round";
  for (const [x0, y0, x1, y1] of frontSegments(war.owner)) {
    g.beginPath(); g.moveTo((x0 - v.ox) * v.s, (y0 - v.oy) * v.s); g.lineTo((x1 - v.ox) * v.s, (y1 - v.oy) * v.s);
    g.strokeStyle = "rgba(13,10,7,0.8)"; g.lineWidth = mini ? 3 : 5; g.stroke();
    g.strokeStyle = EMBER; g.lineWidth = mini ? 1.5 : 2.5; g.stroke();
  }
  // The active writ's land, outlined in gold
  if (d.writ && TERRITORIES[d.writ.t] && (!d.writ.clan || d.writ.clan === d.clan)) {
    const [x, y, w, h] = rect(TERRITORIES[d.writ.t]);
    g.strokeStyle = "#000"; g.lineWidth = mini ? 3.5 : 5.5; g.strokeRect(x, y, w, h);
    g.strokeStyle = GOLD; g.lineWidth = mini ? 1.5 : 3; g.globalAlpha = 0.7 + Math.sin(t * 3) * 0.3; g.strokeRect(x, y, w, h); g.globalAlpha = 1;
  }
  // Own clan: caravans and marches (not on the minimap)
  if (!mini && d.clan) {
    const owner = war.owner.map((i) => CLAN_KEYS[i]);
    g.lineWidth = 2; g.strokeStyle = CLAN_COL[d.clan];
    const lines = caravanLinesOf(owner, d.clan);
    g.setLineDash([2, 6]);
    for (const [a, b] of lines) { const A = pxs(v, ...pt(landPin(a))), B = pxs(v, ...pt(landPin(b))); g.beginPath(); g.moveTo(...A); g.lineTo(...B); g.stroke(); }
    g.setLineDash([]);
    for (const [a, b] of lines) {
      const A = pxs(v, ...pt(landPin(a))), B = pxs(v, ...pt(landPin(b))), c = cartAt({ x: A[0], y: A[1] }, { x: B[0], y: B[1] }, v.wall, 16000 + ((a * 7 + b * 13) % 6) * 1500, ((a * 31 + b) % 10) / 10);
      g.fillStyle = "#000"; g.fillRect(c.x - 3.5, c.y - 3.5, 7, 7); g.fillStyle = "#e8d6a8"; g.fillRect(c.x - 2.5, c.y - 2.5, 5, 5);
    }
    for (const [from, to, tun] of d.plan?.march ?? []) {
      if (!TERRITORIES[from] || !TERRITORIES[to]) continue;
      const A = pxs(v, ...pt(landPin(from))), B = pxs(v, ...pt(landPin(to)));
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]); if (len < 6) continue;
      const ux = (B[0] - A[0]) / len, uy = (B[1] - A[1]) / len, ex = B[0] - ux * 12, ey = B[1] - uy * 12, sx = A[0] + ux * 10, sy = A[1] + uy * 10;
      const col = CLAN_COL[d.clan];
      for (const [c, w] of [["#000", 6], [col, 3]] as const) {
        g.strokeStyle = c; g.lineWidth = w; g.setLineDash(tun ? [7, 5] : []); g.lineDashOffset = -v.now / 60;
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
      }
      g.setLineDash([]);
      const head = arrowHead(sx, sy, B[0] - ux * 6, B[1] - uy * 6, 13);
      g.fillStyle = "#000"; g.beginPath(); g.moveTo(head[0][0] + ux * 2, head[0][1] + uy * 2); g.lineTo(head[1][0], head[1][1]); g.lineTo(head[2][0], head[2][1]); g.closePath(); g.fill();
      g.fillStyle = col; g.beginPath(); g.moveTo(...head[0]); g.lineTo(...head[1]); g.lineTo(...head[2]); g.closePath(); g.fill();
    }
  }
  // Tunnel mouths: open ones where the hero has been (or any of the Hide-Kin's own)
  for (const m of d.tunnels ?? []) {
    if (!(d.clan === "hidekin" || (m.state === "open" && d.seen(Math.floor(m.x / TILE), Math.floor(m.y / TILE))))) continue;
    const [x, y] = pxs(v, m.x, m.y), r = mini ? 3 : 6;
    g.save(); g.translate(x, y); v.upright(g);
    g.globalAlpha = m.state === "open" ? 1 : 0.5;
    g.fillStyle = "#000"; g.beginPath(); g.arc(0, 0, r + 1.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = m.state === "open" ? "#1a0f08" : "#4a3a2a"; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = CLAN_COL.hidekin; g.lineWidth = mini ? 1 : 2; g.stroke();
    g.restore();
  }
  // Announced sieges: a pulsing ring in the attacker's colour (shown under fog: the Herald tells everyone)
  for (const [tid, by, due] of war.sieges) {
    const T = TERRITORIES[tid], atk = CLAN_KEYS[by];
    if (!T || !atk) continue;
    const [x, y] = pxs(v, ...pt(landPin(tid)));
    const rad = Math.max(5, Math.min(T.w, T.h, 24) / 2) * v.s * (1 + Math.sin(t * 2.4) * 0.04);
    g.save(); g.strokeStyle = "#000"; g.lineWidth = mini ? 4 : 6; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = CLAN_COL[atk]; g.lineWidth = mini ? 2 : 3.5; g.globalAlpha = 0.65 + Math.sin(t * 4) * 0.3; g.setLineDash(mini ? [] : [10, 5]); g.lineDashOffset = -t * 10;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.stroke(); g.restore();
    if (!mini) {
      g.save(); g.translate(x, y); v.upright(g);
      const text = `Siege ${fmtCountdown(due - v.wall)}`;
      g.font = `bold 12px ${PF}`; g.textAlign = "center"; g.textBaseline = "middle";
      const w = Math.ceil(g.measureText(text).width) + 10, by0 = -rad - 11;
      g.fillStyle = "rgba(13,10,7,0.92)"; g.fillRect(-w / 2, by0 - 9, w, 18);
      g.strokeStyle = CLAN_COL[atk]; g.lineWidth = 2; g.strokeRect(-w / 2 + 1, by0 - 8, w - 2, 16);
      g.fillStyle = "#ffe8a3"; g.fillText(text, 0, by0 + 1);
      g.restore();
    }
  }
  // Discovered Holds (uncovered in the hero's fog)
  for (const h of HOLDS) {
    const clan = CLAN_KEYS[war.owner[h.t]];
    if (!clan || !d.seen(Math.floor(h.x / TILE), Math.floor(h.y / TILE))) continue;
    const [x, y] = pxs(v, h.x, h.y), k = mini ? 1 : 2, ic = holdIcon(clan);
    if (x < -20 || y < -20 || x > g.canvas.width + 20 || y > g.canvas.height + 20) continue;
    g.save(); g.translate(Math.round(x), Math.round(y)); v.upright(g);
    g.imageSmoothingEnabled = false;
    g.drawImage(ic, -Math.floor((11 * k) / 2), -Math.floor((9 * k) / 2), 11 * k, 9 * k);
    if (!mini && ci >= 0 && war.owner[h.t] === ci) { g.fillStyle = GOLD; g.fillRect(-2, 10, 4, 3); } // a pip under the own clan's Holds
    g.restore();
  }
  g.restore();
}

const PF = '"Pixelify Sans", monospace';
const pt = (p: { x: number; y: number }): [number, number] => [p.x, p.y];
let linesKey = "", linesOf: [number, number][] = [];
function caravanLinesOf(owner: (ClanKey | undefined)[], clan: ClanKey): [number, number][] {
  const k = owner.join(",") + clan;
  if (k !== linesKey) { linesKey = k; linesOf = caravanLines(owner).filter((l) => l.clan === clan).map((l) => [l.a, l.b]); }
  return linesOf;
}

/** The minimap's rim arrows to the writ and the nearest own siege when they are out of view (flat canvas space). */
export function drawRimArrows(g: CanvasRenderingContext2D, targets: { x: number; y: number; color: string }[], s: number, ox: number, oy: number) {
  const W = g.canvas.width, H = g.canvas.height, rim = W / 2 - 9;
  for (const tg of targets) {
    const r = rimPoint((tg.x / TILE - ox) * s, (tg.y / TILE - oy) * s, W / 2, H / 2, rim);
    if (!r.off) continue;
    g.save(); g.translate(r.x, r.y); g.rotate(r.a);
    g.fillStyle = "#000"; g.beginPath(); g.moveTo(9, 0); g.lineTo(-5, -7); g.lineTo(-5, 7); g.closePath(); g.fill();
    g.fillStyle = tg.color; g.beginPath(); g.moveTo(7, 0); g.lineTo(-3, -5); g.lineTo(-3, 5); g.closePath(); g.fill();
    g.restore();
  }
}

/** A tooltip box in canvas px. */
export function drawTip(g: CanvasRenderingContext2D, lines: string[], px: number, py: number, color: string) {
  if (!lines.length) return;
  g.save(); g.font = `13px ${PF}`; g.textAlign = "left"; g.textBaseline = "middle";
  const w = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width))) + 18, h = lines.length * 16 + 10;
  const p = placeTip(px, py, w, h, g.canvas.width, g.canvas.height);
  g.fillStyle = "rgba(13,10,7,0.95)"; g.fillRect(p.x, p.y, w, h);
  g.strokeStyle = "#3a2a1c"; g.lineWidth = 2; g.strokeRect(p.x + 1, p.y + 1, w - 2, h - 2);
  g.fillStyle = color; g.fillRect(p.x + 3, p.y + 3, 3, h - 6);
  lines.forEach((l, i) => { g.fillStyle = i ? "#d8c8a0" : "#ffe8a3"; g.fillText(l, p.x + 12, p.y + 5 + 8 + i * 16); });
  g.restore();
}

/** The calls-to-arms list in canvas px (top-left). `hot` the row under the pointer. */
export function drawCalls(g: CanvasRenderingContext2D, rows: CallToArms[], l: PanelLayout, wall: number, hot: number) {
  g.save(); g.font = `13px ${PF}`; g.textBaseline = "middle"; g.textAlign = "left";
  g.fillStyle = "rgba(13,10,7,0.88)"; g.fillRect(l.x, l.y, l.w, l.h);
  g.strokeStyle = "#3a2a1c"; g.lineWidth = 2; g.strokeRect(l.x + 1, l.y + 1, l.w - 2, l.h - 2);
  g.fillStyle = "#e8c27a"; g.fillText("Calls to arms", l.x + 10, l.y + 11);
  rows.forEach((c, i) => {
    const r = l.rows[i], cy = r.y + r.h / 2, ix = r.x + 11;
    if (i === hot) { g.fillStyle = "rgba(255,232,163,0.16)"; g.fillRect(r.x, r.y, r.w, r.h); }
    const col = c.kind === "siege" ? CLAN_COL[c.by ?? "wardens"] : c.kind === "writ" ? GOLD : c.kind === "march" ? CLAN_COL[c.holder ?? "wardens"] : EMBER;
    g.fillStyle = "#000"; g.strokeStyle = col; g.lineWidth = 2;
    if (c.kind === "siege") { g.beginPath(); g.arc(ix, cy, 5, 0, Math.PI * 2); g.stroke(); }
    else if (c.kind === "writ") { g.beginPath(); g.moveTo(ix, cy - 6); g.lineTo(ix + 6, cy); g.lineTo(ix, cy + 6); g.lineTo(ix - 6, cy); g.closePath(); g.fillStyle = col; g.fill(); }
    else if (c.kind === "march") { g.fillStyle = col; g.beginPath(); g.moveTo(ix + 6, cy); g.lineTo(ix - 5, cy - 5); g.lineTo(ix - 5, cy + 5); g.closePath(); g.fill(); }
    else { g.beginPath(); g.moveTo(ix - 5, cy + 5); g.lineTo(ix + 5, cy - 5); g.moveTo(ix - 5, cy); g.lineTo(ix, cy - 5); g.moveTo(ix, cy + 5); g.lineTo(ix + 5, cy); g.stroke(); }
    const time = c.kind === "siege" && c.due ? fmtCountdown(c.due - wall) : "";
    const tw = time ? g.measureText(time).width + 6 : 0;
    let text = callLabel(c);
    const room = r.w - 24 - tw - 4;
    while (text.length > 3 && g.measureText(text).width > room) text = text.slice(0, -2).trimEnd() + "…";
    g.fillStyle = "#e8dcc0"; g.fillText(text, r.x + 22, cy + 1);
    if (time) { g.fillStyle = col; g.textAlign = "right"; g.fillText(time, r.x + r.w - 5, cy + 1); g.textAlign = "left"; }
  });
  g.restore();
}

/** Hit test for the tooltip: the Hold (seen) or siege nearest the pointer within `r` px, as [territory, held]. */
export function tipTarget(d: WarMapData, toScreen: (wx: number, wy: number) => [number, number], px: number, py: number, r = 14): [number, boolean] | undefined {
  let best: [number, boolean] | undefined, bd = r;
  for (const [t] of d.war.sieges) {
    const [x, y] = toScreen(...pt(landPin(t))), dist = Math.hypot(x - px, y - py);
    if (dist < bd) { bd = dist; best = [t, false]; }
  }
  for (const h of HOLDS) {
    if (!CLAN_KEYS[d.war.owner[h.t]]) continue;
    if (!d.seen(Math.floor(h.x / TILE), Math.floor(h.y / TILE))) continue;
    const [x, y] = toScreen(h.x, h.y), dist = Math.hypot(x - px, y - py);
    if (dist <= bd) { bd = dist; best = [h.t, true]; }
  }
  return best;
}

/** The calls to arms for this hero, recomputed at most every 250 ms. */
let cache: { at: number; key: string; rows: CallToArms[] } | undefined;
export function currentCalls(d: WarMapData, me: { x: number; y: number } | undefined, now: number): CallToArms[] {
  if (!d.clan || !me) return [];
  const key = `${d.war.tick}|${d.plan?.tick}|${d.writ?.t}|${d.clan}|${d.war.sieges.length}`;
  if (cache && cache.key === key && now - cache.at < 250) return cache.rows;
  cache = { at: now, key, rows: callsToArms(d.war, d.plan, d.writ, d.clan, me) };
  return cache.rows;
}
