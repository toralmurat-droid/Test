/**
 * The war table (roadmap M2): a layer on the world map (M, "War table" button) that tints every war territory in its
 * holder's colours, marks capitals and flashes lands under siege. The lands (shared/war/regions.ts) get a dashed outline
 * and a name, the ways between them (the Waygate, the Barrowgate) a dashed line to the gate in each land. Cosmetic: it draws the server's "war" snapshot.
 */
import { CLANS, CLAN_KEYS } from "../../shared/war/clans";
import { REGIONS } from "../../shared/war/regions";
import { LAND_LINKS, TERRITORIES } from "../../shared/war/territories";
import type { WarView } from "../../shared/war/view";

const KEY = "wartable";
let on = (() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })();
export const warTableOn = () => on;
export function setWarTableOn(v: boolean) { on = v; try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private mode */ } }

/** Bright map colours per clan (banner cloth is too dark to read over the terrain). */
const MAP: Record<string, number> = { wardens: 0xe08a2a, redfang: 0xd03a2a, host: 0x5fb0a0, hidekin: 0xa0703a, veiled: 0x5a5ad8 };
const rgba = (c: number, a: number) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

/** The built lands in REGIONS order, with the box around their territories (tiles, PAD tiles of margin). */
const PAD = 3;
const LANDS = REGIONS.flatMap((r) => {
  const ts = TERRITORIES.filter((t) => t.region === r.key);
  if (!ts.length) return [];
  const x0 = Math.min(...ts.map((t) => t.x)) - PAD, y0 = Math.min(...ts.map((t) => t.y)) - PAD;
  const x1 = Math.max(...ts.map((t) => t.x + t.w)) + PAD, y1 = Math.max(...ts.map((t) => t.y + t.h)) + PAD;
  return [{ key: r.key, name: r.name, ids: ts.map((t) => t.id), x0, y0, x1, y1 }];
});
const LAND_EDGE = "rgba(255,232,163,0.75)", LINK_EDGE = "rgba(150,215,255,0.9)";

/** Both ends of every live way between lands: the territory's centre and the gate tile in that land (tiles). */
const LINK_ENDS = LAND_LINKS.flatMap((p) => [[p.a, p.link.pa], [p.b, p.link.pb]].map(([t, q]) => {
  const T = TERRITORIES[t as number], g = q as { x: number; y: number };
  return { name: p.link.name, cx: T.cx, cy: T.cy, x: g.x + 0.5, y: g.y + 0.5 };
}));

/** Where each land's name goes (tiles): just above its box's top corner, which is the top of the turned world map. */
export const warLandLabels = () => LANDS.map((l) => ({ name: l.name, x: l.x0, y: l.y0 }));
/** Where each way's name goes (tiles): at its gate in both lands. */
export const warLinkLabels = () => LINK_ENDS.map((e) => ({ name: e.name, x: e.x, y: e.y }));

/** Draw on the world map canvas in map space (s px per tile, ox/oy = top-left tile), under the markers. */
export function drawWarTable(g: CanvasRenderingContext2D, v: WarView, s: number, ox: number, oy: number, now: number) {
  const pulse = 0.5 + 0.5 * Math.sin(now / 250);
  g.save();
  for (const t of TERRITORIES) {
    const k = CLAN_KEYS[v.owner[t.id]];
    if (!k) continue;
    const x = (t.x - ox) * s, y = (t.y - oy) * s, w = t.w * s, h = t.h * s;
    const edge = MAP[k];
    g.fillStyle = rgba(MAP[k], 0.42);
    g.fillRect(x, y, w, h);
    g.lineWidth = Math.max(1, s * 0.6);
    g.strokeStyle = rgba(edge, 0.8);
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (t.capitalOf) { // capitals: a double border
      g.strokeStyle = rgba(edge, 0.55);
      g.strokeRect(x + 3, y + 3, w - 6, h - 6);
    }
    if (v.raided?.includes(t.id)) { // struck by the Night Raiders last tick: a dark dashed ring inside the border
      g.lineWidth = Math.max(2.5, s * 1);
      g.setLineDash([Math.max(4, s * 1.5), Math.max(3, s)]);
      g.strokeStyle = `rgba(200,110,255,${0.7 + 0.3 * pulse})`;
      g.strokeRect(x + 2, y + 2, w - 4, h - 4);
      g.setLineDash([]);
    }
    if (v.sieges.some((sg) => sg[0] === t.id)) {
      g.lineWidth = Math.max(2, s);
      g.strokeStyle = `rgba(255,80,40,${0.4 + 0.6 * pulse})`;
      g.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }
  }
  // Lands: a dashed box around each; ways between lands: a dashed line from territory to territory
  const dash = Math.max(4, s * 2);
  g.lineWidth = Math.max(1.5, s * 0.5);
  g.setLineDash([dash, dash * 0.75]);
  g.strokeStyle = LAND_EDGE;
  for (const l of LANDS) g.strokeRect((l.x0 - ox) * s, (l.y0 - oy) * s, (l.x1 - l.x0) * s, (l.y1 - l.y0) * s);
  // Each end runs from its territory to the gate stone in that land: the lands lie in separate bands of the world map, so
  // one straight line would cross a third land (the Barrowgate's would run through the Sunscar)
  g.strokeStyle = LINK_EDGE;
  g.lineWidth = Math.max(2, s * 0.7);
  for (const e of LINK_ENDS) {
    g.beginPath(); g.moveTo((e.cx - ox) * s, (e.cy - oy) * s); g.lineTo((e.x - ox) * s, (e.y - oy) * s); g.stroke();
  }
  g.setLineDash([]);
  g.fillStyle = LINK_EDGE;
  for (const e of LINK_ENDS) { // the gate: a small diamond
    const x = (e.x - ox) * s, y = (e.y - oy) * s, r = Math.max(3, s * 1.2);
    g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fill();
  }
  g.restore();
}

/** Legend in screen space (bottom-left of the map canvas): the five clans and their land count, then a row per land with each clan's share of it. */
export function drawWarLegend(g: CanvasRenderingContext2D, v: WarView, font: string) {
  const H = g.canvas.height;
  g.save();
  g.font = `13px ${font}`; g.textAlign = "left"; g.textBaseline = "middle";
  const text = (t: string, x: number, y: number, c: string) => { g.fillStyle = "#000"; g.fillText(t, x + 1, y + 1); g.fillStyle = c; g.fillText(t, x, y); };
  CLAN_KEYS.forEach((k, i) => {
    const y = H - 14 - (CLAN_KEYS.length - 1 - i) * 18, n = v.owner.filter((o) => CLAN_KEYS[o] === k).length;
    const ci = CLAN_KEYS.indexOf(k), tag = v.hunt === ci ? "  hunted" : v.rally === ci ? "  Rally" : ""; // the war's brakes
    const label = `${CLANS[k].name}  ${n}`, lw = g.measureText(label).width;
    g.fillStyle = "rgba(10,8,6,0.75)"; g.fillRect(6, y - 9, Math.max(230, 32 + lw + (tag ? g.measureText(tag).width : 0)), 18);
    g.fillStyle = rgba(MAP[k], 0.9); g.fillRect(10, y - 5, 10, 10);
    text(label, 26, y, "#eadfc8");
    if (tag) text(tag, 26 + lw, y, v.hunt === ci ? "#c890ff" : "#9fe07a");
  });
  const nameW = Math.max(...LANDS.map((l) => g.measureText(l.name).width)), chip = 34;
  LANDS.forEach((l, i) => {
    const y = H - 14 - (CLAN_KEYS.length + LANDS.length - i) * 18 - 4;
    g.fillStyle = "rgba(10,8,6,0.75)"; g.fillRect(6, y - 9, 14 + nameW + CLAN_KEYS.length * chip, 18);
    text(l.name, 10, y, "#ffe8a3");
    CLAN_KEYS.forEach((k, j) => {
      const x = 16 + nameW + j * chip, n = l.ids.filter((id) => CLAN_KEYS[v.owner[id]] === k).length;
      g.fillStyle = rgba(MAP[k], n ? 0.9 : 0.3); g.fillRect(x, y - 4, 8, 8);
      text(`${n}`, x + 11, y, n ? "#eadfc8" : "#7a6e5a");
    });
  });
  g.restore();
}
