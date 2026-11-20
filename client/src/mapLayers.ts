/**
 * World map legend and layer toggles (Murat 2026-11-19: "I don't understand the different borders", "a toggle to show
 * or hide certain elements"). Each kind of mark on the zone map and the minimap belongs to one layer; the legend lists
 * them with a drawn sample of their line or icon, and a click hides or shows the layer. Remembered per browser.
 */
import { ROAD_STYLE } from "./columnArt";

export type MapLayer = "quests" | "people" | "ways" | "boards" | "lands" | "war" | "names" | "heroes" | "exits";

/** The colours the map draws each line in, shared with the drawing code so the legend always matches. */
export const MAP_LINE = {
  /** the territory you stand in: a calm solid line */
  here: "#f0e6d0",
  /** the territory you picked */
  picked: "#8fe0ff",
  /** where two clans' lands meet */
  front: "#e0503a",
  /** quest areas: dashed circles */
  quest: "#ffd166",
};

interface Row { key: MapLayer; label: string; sample: (g: CanvasRenderingContext2D) => void }

const glyph = (g: CanvasRenderingContext2D, x: number, ch: string, color: string) => {
  g.font = `bold 14px "Pixelify Sans", monospace`; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 3; g.strokeStyle = "#000"; g.strokeText(ch, x, 9); g.fillStyle = color; g.fillText(ch, x, 9);
};
const line = (g: CanvasRenderingContext2D, color: string, dash: number[] = [], w = 2) => {
  g.lineWidth = w + 2; g.strokeStyle = "rgba(0,0,0,0.7)"; g.setLineDash(dash); g.beginPath(); g.moveTo(2, 9); g.lineTo(34, 9); g.stroke();
  g.lineWidth = w; g.strokeStyle = color; g.stroke(); g.setLineDash([]);
};

const ROWS: Row[] = [
  { key: "quests", label: "Quests: givers and areas", sample: (g) => { glyph(g, 8, "!", "#ffd166"); g.strokeStyle = MAP_LINE.quest; g.lineWidth = 2; g.setLineDash([3, 2]); g.beginPath(); g.arc(26, 9, 7, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); } },
  { key: "people", label: "People and shops", sample: (g) => { glyph(g, 10, "•", "#b9f27c"); glyph(g, 26, "$", "#f2c14e"); } },
  { key: "ways", label: "Ways: gates, stones, roads", sample: (g) => { glyph(g, 10, "◆", "#e8dcc0"); glyph(g, 26, "◆", "#ff9a3c"); } },
  { key: "boards", label: "Bounty boards", sample: (g) => glyph(g, 18, "!", "#e3bf6a") },
  { key: "lands", label: "Your territory / picked", sample: (g) => { g.save(); g.beginPath(); g.rect(0, 0, 18, 18); g.clip(); line(g, MAP_LINE.here); g.restore(); g.save(); g.beginPath(); g.rect(18, 0, 18, 18); g.clip(); line(g, MAP_LINE.picked, [5, 3]); g.restore(); } },
  { key: "war", label: "Clan war: front, roads, Holds", sample: (g) => { g.save(); g.beginPath(); g.rect(0, 0, 18, 18); g.clip(); line(g, MAP_LINE.front, [], 2.5); g.restore(); g.save(); g.beginPath(); g.rect(18, 0, 18, 18); g.clip(); line(g, ROAD_STYLE.color, ROAD_STYLE.dash); g.restore(); } },
  { key: "names", label: "Place names", sample: (g) => { g.font = `12px "Pixelify Sans", monospace`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#000"; g.fillText("Abc", 19, 10); g.fillStyle = "#ffe8a3"; g.fillText("Abc", 18, 9); } },
  { key: "heroes", label: "Other heroes", sample: (g) => { g.fillStyle = "#000"; g.fillRect(13, 4, 10, 10); g.fillStyle = "#5ec8ff"; g.fillRect(15, 6, 6, 6); } },
  { key: "exits", label: "Ways out list", sample: (g) => { g.fillStyle = "rgba(13,10,7,0.9)"; g.fillRect(6, 2, 24, 14); g.strokeStyle = "#3a2a1c"; g.lineWidth = 2; g.strokeRect(7, 3, 22, 12); g.fillStyle = "#96d7ff"; g.fillRect(10, 6, 2, 2); g.fillRect(14, 6, 12, 2); g.fillRect(10, 10, 2, 2); g.fillRect(14, 10, 10, 2); } },
];

const KEY = "maplayers";
const off = new Set<MapLayer>();
let open = true;
try {
  const s = JSON.parse(localStorage.getItem(KEY) ?? "{}") as { off?: string[]; open?: boolean };
  for (const k of s.off ?? []) if (ROWS.some((r) => r.key === k)) off.add(k as MapLayer);
  if (s.open === false) open = false;
} catch { /* no storage: everything shown */ }
const store = () => { try { localStorage.setItem(KEY, JSON.stringify({ off: [...off], open })); } catch { /* ignore */ } };

/** Is this layer shown on the maps? */
export const layerOn = (k: MapLayer) => !off.has(k);

/** The legend panel (a header that folds it, then one row per layer: sample, name, on/off). */
export function legendPanel(): HTMLDivElement {
  const box = document.createElement("div");
  box.className = "wm-legend" + (open ? " open" : "");
  const head = document.createElement("button");
  head.type = "button"; head.tabIndex = -1; head.className = "wm-lg-head";
  const setHead = () => { head.textContent = open ? "Legend ▾" : "Legend ▸"; };
  setHead();
  head.addEventListener("mousedown", (ev) => ev.preventDefault());
  head.addEventListener("click", () => { open = !open; box.classList.toggle("open", open); setHead(); store(); });
  box.append(head);
  const list = document.createElement("div");
  list.className = "wm-lg-list";
  for (const r of ROWS) {
    const b = document.createElement("button");
    b.type = "button"; b.tabIndex = -1; b.className = "wm-lg-row" + (off.has(r.key) ? " off" : "");
    b.title = "Click to show or hide";
    const tick = document.createElement("span"); tick.className = "wm-lg-tick";
    const c = document.createElement("canvas"); c.width = 36; c.height = 18; c.className = "wm-lg-sample";
    const paint = () => { const g = c.getContext("2d")!; g.clearRect(0, 0, 36, 18); r.sample(g); };
    paint(); document.fonts?.ready.then(paint); // (again once the pixel font has loaded)
    const t = document.createElement("span"); t.textContent = r.label;
    b.append(tick, c, t);
    b.addEventListener("mousedown", (ev) => ev.preventDefault());
    b.addEventListener("click", () => {
      if (off.has(r.key)) off.delete(r.key); else off.add(r.key);
      b.classList.toggle("off", off.has(r.key)); store();
    });
    list.append(b);
  }
  box.append(list);
  // the map underneath must not start a drag or a pick from a click on the legend
  for (const ev of ["pointerdown", "wheel", "dblclick"] as const) box.addEventListener(ev, (e) => e.stopPropagation());
  return box;
}
