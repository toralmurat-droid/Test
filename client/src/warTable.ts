/**
 * The war table (roadmap M2): a layer on the world map (M, "War table" button) that tints every war territory in its
 * holder's colours, marks capitals and flashes lands under siege. Cosmetic: it draws the server's "war" snapshot.
 */
import { CLANS, CLAN_KEYS } from "../../shared/war/clans";
import { TERRITORIES } from "../../shared/war/territories";
import type { WarView } from "../../shared/war/view";

const KEY = "wartable";
let on = (() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })();
export const warTableOn = () => on;
export function setWarTableOn(v: boolean) { on = v; try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private mode */ } }

/** Bright map colours per clan (banner cloth is too dark to read over the terrain). */
const MAP: Record<string, number> = { wardens: 0xe08a2a, redfang: 0xd03a2a, host: 0x5fb0a0, hidekin: 0xa0703a, veiled: 0x5a5ad8 };
const rgba = (c: number, a: number) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

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
    if (v.sieges.some((sg) => sg[0] === t.id)) {
      g.lineWidth = Math.max(2, s);
      g.strokeStyle = `rgba(255,80,40,${0.4 + 0.6 * pulse})`;
      g.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }
  }
  g.restore();
}

/** Legend in screen space (bottom-left of the map canvas): the five clans and their land count. */
export function drawWarLegend(g: CanvasRenderingContext2D, v: WarView, font: string) {
  const H = g.canvas.height;
  g.save();
  g.font = `13px ${font}`; g.textAlign = "left"; g.textBaseline = "middle";
  CLAN_KEYS.forEach((k, i) => {
    const y = H - 14 - (CLAN_KEYS.length - 1 - i) * 18, n = v.owner.filter((o) => CLAN_KEYS[o] === k).length;
    g.fillStyle = "rgba(10,8,6,0.75)"; g.fillRect(6, y - 9, 230, 18);
    g.fillStyle = rgba(MAP[k], 0.9); g.fillRect(10, y - 5, 10, 10);
    g.fillStyle = "#000"; g.fillText(`${CLANS[k].name}  ${n}`, 27, y + 1);
    g.fillStyle = "#eadfc8"; g.fillText(`${CLANS[k].name}  ${n}`, 26, y);
  });
  g.restore();
}
