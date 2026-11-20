/**
 * "Where am I, and how do I get there" on the zone map (Murat 2026-11-16): the same names the war table uses.
 * On the big map it outlines the territory you stand in and the one you picked, names every gate and portal stone with
 * the land and territory it leads to, and shows the route to the picked territory as a card. Also the small text helpers
 * (wrap, card) the war table's side panel shares. Cosmetic: nothing here is sent to the server.
 */
import { MAP_KEY, MAP_LINE } from "./mapLayers";
import { regionName } from "../../shared/war/regions";
import { TERRITORIES } from "../../shared/war/territories";
import { findRoute, hereAt, landOfNode, nodeName, routeLines, STONES, WAYS, type Here, type Step } from "./warRoute";

const GOLD = "#ffd166", CYAN = "#8fe0ff", INK = "rgba(10,8,6,0.9)";

/** Greedy word wrap of `text` into lines no wider than `maxW` px in the context's current font. */
export function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    const t = line ? `${line} ${w}` : w;
    if (line && g.measureText(t).width > maxW) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

/** A dark plate with a coloured edge strip and lines of text (first line bright). Returns its height. */
export function drawCard(g: CanvasRenderingContext2D, x: number, y: number, w: number, lines: string[], color: string, font: string, px = 12): number {
  g.save(); g.font = `${px}px ${font}`; g.textAlign = "left"; g.textBaseline = "middle";
  const rows = lines.flatMap((l, i) => wrap(g, l, w - 20).map((t) => [t, i] as const)), lh = px + 4, h = rows.length * lh + 10;
  g.fillStyle = "rgba(13,10,7,0.92)"; g.fillRect(x, y, w, h);
  g.strokeStyle = "#3a2a1c"; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle = color; g.fillRect(x + 3, y + 3, 3, h - 6);
  rows.forEach(([t, i], k) => { g.fillStyle = "#000"; g.fillText(t, x + 13, y + 5 + lh / 2 + k * lh + 1); g.fillStyle = i ? "#d8c8a0" : "#ffe8a3"; g.fillText(t, x + 12, y + 5 + lh / 2 + k * lh); });
  g.restore();
  return h;
}

/** The lines of the route card: how many steps, then each leg. */
export function routeCard(steps: readonly Step[] | undefined, target: number): string[] {
  if (!steps) return [`Way to ${nodeName(target)}`, "No road from here."];
  return [`Way to ${nodeName(target)}`, `${steps.length} step${steps.length === 1 ? "" : "s"}`, ...routeLines(steps)];
}

/** Everything the zone map needs to say where you are. */
export interface HereView {
  /** Tile (map units) to canvas px, with the map's turn applied. */
  toScreen: (tx: number, ty: number) => [number, number];
  /** Canvas px per tile, canvas size, performance.now(). */
  s: number; w: number; h: number; now: number;
  font: string;
  here: Here; sel?: number; woken?: ReadonlySet<string>;
  /** The hero, in map tiles (floats). */
  me?: { x: number; y: number };
  /** Is this tile discovered (gate ends wait for it)? And the legend's layers (mapLayers.ts): outlines, gates, the "Ways out" card. */
  seen?: (tx: number, ty: number) => boolean; lands?: boolean; ways?: boolean; exits?: boolean;
}

/** A row of the "Ways out" card: where it sits on the canvas and the tile it leads you to. */
export interface ExitRow { x: number; y: number; w: number; h: number; tx: number; ty: number; /** a card with nothing to show: it only swallows the click */ card?: true }

const short = (s: string) => s.replace(/^The /, "");

/** A small dark label chip centred on (x, y): one or two lines. */
function chip(g: CanvasRenderingContext2D, x: number, y: number, lines: string[], color: string, font: string) {
  g.save(); g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `12px ${font}`;
  const w = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width))) + 12, h = lines.length * 14 + 6;
  const cx = Math.round(Math.max(w / 2 + 2, Math.min(g.canvas.width - w / 2 - 2, x))), cy = Math.round(Math.max(h / 2 + 2, Math.min(g.canvas.height - h / 2 - 2, y)));
  g.fillStyle = INK; g.fillRect(cx - w / 2, cy - h / 2, w, h);
  g.strokeStyle = color; g.lineWidth = 1; g.strokeRect(cx - w / 2 + 0.5, cy - h / 2 + 0.5, w - 1, h - 1);
  lines.forEach((l, i) => { g.fillStyle = "#000"; g.fillText(l, cx + 1, cy - h / 2 + 10 + i * 14 + 1); g.fillStyle = i ? "#cfc4aa" : color; g.fillText(l, cx, cy - h / 2 + 10 + i * 14); });
  g.restore();
}

/** Outline of a tile rect through the map's turn, dashed, in `color`. */
function outline(g: CanvasRenderingContext2D, v: HereView, t: { x: number; y: number; w: number; h: number }, color: string, phase: number, dashed: boolean) {
  const P = [v.toScreen(t.x, t.y), v.toScreen(t.x + t.w, t.y), v.toScreen(t.x + t.w, t.y + t.h), v.toScreen(t.x, t.y + t.h)];
  g.save(); g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
  g.lineWidth = 4; g.strokeStyle = "rgba(0,0,0,0.7)"; g.stroke();
  g.lineWidth = 2; g.strokeStyle = color; if (dashed) { g.setLineDash([8, 5]); g.lineDashOffset = -phase * 14; } g.stroke();
  g.restore();
  return P;
}

/** Territory outlines, named exits and the route card, drawn over the zone map in canvas px (upright). */
export function drawHereOnMap(g: CanvasRenderingContext2D, v: HereView): ExitRow[] {
  const t = v.now / 1000, pulse = 0.5 + 0.5 * Math.sin(t * 4);
  const onScreen = (x: number, y: number) => x > -20 && y > -20 && x < v.w + 20 && y < v.h + 20;
  g.save(); g.imageSmoothingEnabled = false;
  // the territory you stand in, and the one you picked (when it is in this land)
  // (the legend's colours: a calm solid line for yours, dashed for the picked one; no longer gold like quest areas)
  for (const [id, color, tag] of [[v.here.terr, MAP_LINE.here, "You are here"], [v.sel, MAP_LINE.picked, "Picked"]] as const) {
    if (id === undefined || !TERRITORIES[id] || v.lands === false) continue;
    const T = TERRITORIES[id], P = outline(g, v, T, color, t, tag === "Picked");
    const top = P.reduce((a, b) => (b[1] < a[1] ? b : a)), cx = P.reduce((a, b) => a + b[0], 0) / 4;
    if (onScreen(cx, top[1])) chip(g, cx, Math.max(14, top[1] + 12), [T.name, tag === "Picked" ? "Picked" : `You are here · ${short(regionName(T.region))}`], color, v.font);
  }
  // you: a pulsing ring round your dot, named, so the map says where you stand even in a village
  if (v.me) {
    const [x, y] = v.toScreen(v.me.x, v.me.y);
    if (onScreen(x, y)) {
      g.lineWidth = 4; g.strokeStyle = "rgba(0,0,0,0.6)"; g.beginPath(); g.arc(x, y, 12 + 3 * pulse, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 2; g.strokeStyle = GOLD; g.beginPath(); g.arc(x, y, 12 + 3 * pulse, 0, Math.PI * 2); g.stroke();
      chip(g, x, y - 26, ["You"], GOLD, v.font);
    }
  }
  // the exits: every gate end and woken portal stone, named by where it leads
  const route = v.sel !== undefined && v.here.node !== undefined ? findRoute(v.here.node, v.sel, v.woken) : undefined;
  const firstGate = route?.find((s) => s.via === "gate")?.way;
  for (const w of WAYS) for (const [mine, there, tile] of [[w.a, w.b, w.ta], [w.b, w.a, w.tb]] as const) {
    const [x, y] = v.toScreen(tile.x + 0.5, tile.y + 0.5);
    if (!onScreen(x, y) || v.ways === false || (v.seen && !v.seen(tile.x, tile.y))) continue; // undiscovered gates stay hidden
    const lit = firstGate === w && landOfNode(mine) === v.here.land;
    if (lit) { g.strokeStyle = GOLD; g.lineWidth = 3; g.globalAlpha = 0.5 + 0.5 * pulse; g.beginPath(); g.arc(x, y, 16 + 4 * pulse, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
    const where = regionName(landOfNode(there));
    const req = mine === w.a ? w.req : "";
    chip(g, x, y + 30, [`${w.name}: to ${short(where)}`, `${nodeName(there)}${req ? " · " + req : ""}`], lit ? GOLD : MAP_KEY.way, v.font);
  }
  for (const s of STONES) {
    if (!v.woken?.has(s.id) || v.ways === false) continue;
    const [x, y] = v.toScreen(s.tile.x + 0.5, s.tile.y + 0.5);
    if (!onScreen(x, y) || v.s < 2) continue;
    chip(g, x, y + 22, [`Portal stone: ${s.name}`], MAP_KEY.stone, v.font);
  }
  const rows = v.exits === false ? [] : exitCard(g, v);
  // the route to the picked territory, as a card in the bottom-left corner
  if (v.sel !== undefined && v.sel !== v.here.node) {
    const lines = routeCard(route, v.sel);
    g.font = `12px ${v.font}`;
    const w = Math.min(300, v.w - 16), h = lines.reduce((n, l) => n + wrap(g, l, w - 20).length, 0) * 16 + 10;
    drawCard(g, 8, v.h - h - 8, w, lines, CYAN, v.font);
    rows.push({ x: 8, y: v.h - h - 8, w, h, tx: 0, ty: 0, card: true });
  }
  g.restore();
  return rows;
}

/** One way out of the hero's land, nearest first: its name, where it leads, and the tile to show. */
interface Out { label: string; sub: string; tx: number; ty: number; color: string }
function exitsOf(v: HereView): Out[] {
  const land = v.here.land, out: Out[] = [];
  if (!land || !v.me) return out;
  for (const w of WAYS) for (const [mine, there, tile] of [[w.a, w.b, w.ta], [w.b, w.a, w.tb]] as const) {
    if (landOfNode(mine) !== land) continue;
    out.push({ label: `${w.name} to ${short(regionName(landOfNode(there)))}`, sub: mine === w.a ? w.req : "", tx: tile.x + 0.5, ty: tile.y + 0.5, color: MAP_KEY.way });
  }
  for (const s of STONES) if (v.woken?.has(s.id) && landOfNode(s.node) === land) out.push({ label: `Portal stone: ${s.name}`, sub: "", tx: s.tile.x + 0.5, ty: s.tile.y + 0.5, color: MAP_KEY.stone });
  return out.sort((a, b) => Math.hypot(a.tx - v.me!.x, a.ty - v.me!.y) - Math.hypot(b.tx - v.me!.x, b.ty - v.me!.y));
}

/** The "Ways out" card, top-right: each gate and woken stone of your land with an arrow towards it and its distance. Click a row to show it. */
function exitCard(g: CanvasRenderingContext2D, v: HereView): ExitRow[] {
  const list = exitsOf(v).slice(0, 8);
  if (!list.length || !v.me) return [];
  g.save(); g.font = `13px ${v.font}`; g.textBaseline = "middle"; g.textAlign = "left";
  const title = `Ways out of ${short(regionName(v.here.land!))}`;
  const texts = list.map((o) => `${o.label}${o.sub ? ` (${o.sub})` : ""}`);
  const dists = list.map((o) => `${Math.round(Math.hypot(o.tx - v.me!.x, o.ty - v.me!.y))}`);
  const w = Math.ceil(Math.max(g.measureText(title).width, ...texts.map((t) => g.measureText(t).width + 56))) + 24, lh = 19, h = (list.length + 1) * lh + 12;
  const x0 = v.w - w - 8, y0 = 8;
  g.fillStyle = "rgba(13,10,7,0.9)"; g.fillRect(x0, y0, w, h);
  g.strokeStyle = "#3a2a1c"; g.lineWidth = 2; g.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2);
  g.fillStyle = "#e8c27a"; g.fillText(title, x0 + 12, y0 + 6 + lh / 2);
  const [hx, hy] = v.toScreen(v.me.x, v.me.y), rows: ExitRow[] = [];
  list.forEach((o, i) => {
    const cy = y0 + 6 + (i + 1.5) * lh, [ex, ey] = v.toScreen(o.tx, o.ty), a = Math.atan2(ey - hy, ex - hx);
    g.save(); g.translate(x0 + 18, cy); g.rotate(a); // an arrow pointing the way, on the map as you see it
    g.fillStyle = "#000"; g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, -6); g.lineTo(-5, 6); g.closePath(); g.fill();
    g.fillStyle = o.color; g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, -4); g.lineTo(-4, 4); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = "#cfc4aa"; g.fillText(texts[i], x0 + 34, cy);
    g.textAlign = "right"; g.fillStyle = "#a39680"; g.fillText(dists[i], x0 + w - 10, cy); g.textAlign = "left";
    rows.push({ x: x0, y: cy - lh / 2, w, h: lh, tx: o.tx, ty: o.ty });
  });
  g.restore();
  return rows;
}

/** The territory (or the Crown) under a tile of the zone map, for picking by click. */
export function pickAt(tx: number, ty: number): number | undefined {
  const h = hereAt(tx, ty);
  return h.near ? undefined : h.node;
}
