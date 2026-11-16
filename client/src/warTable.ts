/**
 * The war table (roadmap M2): with "War table" on, the big map shows one compass-laid continent instead of the world
 * bands (design: riven-marches-map.png). Each built land is a slot round the Crown of the Marches (warTableLayout.ts),
 * every territory a cell of its land tinted in its holder's colours (nearest-territory cells, front lines in ember
 * where two clans meet), capitals and holds as markers, the ways between lands as dashed lines, the clans' banners
 * standing in their homelands, a legend on the right. Cosmetic: it draws the server's "war" snapshot and nothing else.
 */
import { CLANS, CLAN_KEYS, type ClanKey } from "../../shared/war/clans";
import { REGIONS } from "../../shared/war/regions";
import { LAND_LINKS, TERRITORIES } from "../../shared/war/territories";
import type { WarView } from "../../shared/war/view";
import { viewTier } from "../../shared/war/intel";
import { CITIES, cityText } from "../../shared/capitals";
import { inPoly, layoutTerritories, SLOTS, WT_H, WT_W, type Pt } from "./warTableLayout";

const KEY = "wartable";
let on = (() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })();
export const warTableOn = () => on;
export function setWarTableOn(v: boolean) { on = v; try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private mode */ } }

/** Bright map colours per clan (banner cloth is too dark to read on the table). */
const MAP: Record<string, number> = { wardens: 0xe08a2a, redfang: 0xd03a2a, host: 0x5fb0a0, hidekin: 0xa0703a, veiled: 0x5a5ad8 };
const rgba = (c: number, a: number) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
const mix = (a: number, b: number, t: number) => [16, 8, 0].reduce((o, s) => o | (Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s), 0);
const short = (k: ClanKey) => CLANS[k].name.replace(/^The /, "");
/** The names under the banners, as the design has them. */
const TAG: Record<ClanKey, string> = { wardens: "Wardens", redfang: "Redfang", host: "Ossuary Host", hidekin: "Hide-Kin", veiled: "Veiled Circle" };

const UNIT = 4; // sheet units per art pixel
const AW = WT_W / UNIT, AH = WT_H / UNIT;
const PARCH = 0x2b231a, CROWN = 0x4b4740, VOID = 0x120e0a, INK = 0x0d0a07, GOLD = "#ffe8a3", EMBER = [0xf6b040, 0xd8782a];

const PLACED = layoutTerritories(TERRITORIES);
const POS = new Map(PLACED.map((p) => [p.id, p]));
const LAND_OF = SLOTS.map((s) => s.key);
const NAMES: Record<string, string> = Object.fromEntries(REGIONS.map((r) => [r.key, r.name]));
const idsOf = (key: string) => TERRITORIES.filter((t) => t.region === key).map((t) => t.id);

/** Static per-pixel maps: which land, which territory's cell (-1 none), a little grain. Built once. */
const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const LAND = new Int8Array(AW * AH), CELL = new Int16Array(AW * AH), GRAIN = new Float32Array(AW * AH);
for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) {
  const i = y * AW + x, p: Pt = [x * UNIT + 2 + (hash(x, y) - 0.5) * 7, y * UNIT + 2 + (hash(y, x) - 0.5) * 7]; // jittered, so land edges are ragged
  const l = SLOTS.findIndex((s) => inPoly(p, s.poly));
  LAND[i] = l; GRAIN[i] = hash(x + 91, y + 17) - 0.5;
  let best = -1, bd = Infinity;
  if (l >= 0) for (const t of TERRITORIES) {
    if (t.region !== LAND_OF[l]) continue;
    const q = POS.get(t.id)!, d = (q.x - x * UNIT) ** 2 + (q.y - y * UNIT) ** 2;
    if (d < bd) { bd = d; best = t.id; }
  }
  CELL[i] = best;
}

let art: HTMLCanvasElement | undefined, artKey = "";
/** The painted continent for these owners (cached: only a war tick changes it). */
function paintArt(v: WarView): HTMLCanvasElement {
  const key = v.owner.join(",");
  if (art && key === artKey) return art;
  artKey = key;
  art ??= Object.assign(document.createElement("canvas"), { width: AW, height: AH });
  const g = art.getContext("2d")!, img = g.createImageData(AW, AH);
  const own = (t: number) => (t < 0 ? -1 : v.owner[t]);
  const base = new Int32Array(AW * AH);
  for (let i = 0; i < AW * AH; i++) {
    const o = own(CELL[i]);
    base[i] = LAND[i] < 0 ? VOID : o < 0 ? CROWN : mix(PARCH, MAP[CLAN_KEYS[o]], 0.42);
  }
  for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) {
    const i = y * AW + x;
    let c = base[i];
    const grain = GRAIN[i], k = 1 + grain * 0.22;
    c = [16, 8, 0].reduce((o, s) => o | (Math.min(255, Math.round(((c >> s) & 255) * k)) << s), 0);
    for (const j of [x + 1 < AW ? i + 1 : -1, y + 1 < AH ? i + AW : -1]) { // a border where the neighbour is another cell
      if (j < 0 || CELL[j] === CELL[i] && LAND[j] === LAND[i]) continue;
      const a = own(CELL[i]), b = own(CELL[j]), sameLand = LAND[j] === LAND[i];
      if (a >= 0 && b >= 0 && a !== b) c = EMBER[(x + y) & 1]; // a front line: two clans meet
      else c = sameLand ? mix(c, INK, 0.55) : mix(c, INK, 0.8);
    }
    const o = i * 4;
    img.data[o] = (c >> 16) & 255; img.data[o + 1] = (c >> 8) & 255; img.data[o + 2] = c & 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return art;
}

/** A clan's standing banner as pixel art (20 x 36 art px): gold rail, cloth with trim, a swallow tail, the sigil. */
const SIGIL: Record<ClanKey, string[]> = {
  wardens: ["...#...", "..###..", ".#####.", "..###..", "...#...", "...#..."],
  redfang: ["#.....#", "##...##", ".##.##.", "..###..", "...#...", "......."],
  host: [".#####.", "#.###.#", "#.###.#", ".#####.", "..#.#..", "......."],
  hidekin: ["#.###.#", "#######", "#.###.#", ".#####.", "..#.#..", "......."],
  veiled: [".#####.", "##.#.##", "#.###.#", "##.#.##", ".#####.", "......."],
};
const banners = new Map<ClanKey, HTMLCanvasElement>();
function bannerArt(k: ClanKey): HTMLCanvasElement {
  let c = banners.get(k);
  if (c) return c;
  c = Object.assign(document.createElement("canvas"), { width: 20, height: 36 });
  const g = c.getContext("2d")!, cl = CLANS[k];
  const lift = (n: number, t: number) => hex(mix(n, 0xffffff, t));
  g.fillStyle = "#120c08"; g.fillRect(0, 0, 20, 3);
  g.fillStyle = "#c8962c"; g.fillRect(1, 1, 18, 1); g.fillRect(0, 0, 1, 3); g.fillRect(19, 0, 1, 3);
  for (let y = 3; y < 36; y++) for (let x = 2; x < 18; x++) {
    const notch = y >= 29 && Math.abs(x - 9.5) < (y - 28) * 0.9; // the swallow tail's cut
    if (notch) continue;
    const rim = x === 2 || x === 17 || y === 3;
    g.fillStyle = rim ? hex(cl.trim) : lift(cl.cloth, 0.12 + 0.05 * ((x + y) & 1));
    g.fillRect(x, y, 1, 1);
  }
  g.fillStyle = hex(cl.trim); g.fillRect(3, 5, 14, 1);
  g.fillStyle = hex(mix(cl.sigil, 0xffffff, 0.1));
  SIGIL[k].forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") g.fillRect(6 + x, 10 + y, 1, 1); }));
  banners.set(k, c);
  return c;
}

export interface WarHover { x: number; y: number }
/** The territory under the hero (its tile), if one is: the table marks it. */
export interface WarHero { tx: number; ty: number }

/** Draw the war table over the whole big-map canvas (screen space). Returns nothing; the minimap clears the canvas first. */
export function drawWarTable(g: CanvasRenderingContext2D, v: WarView, font: string, now: number, hover?: WarHover, hero?: WarHero) {
  const W = g.canvas.width, H = g.canvas.height;
  const legW = Math.max(190, Math.min(215, Math.round(W * 0.19))), pad = 8;
  const avail = { w: W - legW - pad * 3, h: H - pad * 2 };
  let ds = Math.min(avail.w / AW, avail.h / AH);
  if (ds > 1) ds = Math.floor(ds * 4) / 4; // keep art pixels near-whole
  const mw = AW * ds, mh = AH * ds, mx = Math.round(pad + (avail.w - mw) / 2), my = Math.round(pad + (avail.h - mh) / 2);
  const u = ds / UNIT; // screen px per sheet unit
  const P = (id: number): [number, number] => { const p = POS.get(id)!; return [mx + p.x * u, my + p.y * u]; };
  const pulse = 0.5 + 0.5 * Math.sin(now / 250);
  g.save();
  g.imageSmoothingEnabled = false;
  g.textBaseline = "middle"; g.textAlign = "left";
  const text = (t: string, x: number, y: number, c: string, px = 13) => { g.font = `${px}px ${font}`; g.fillStyle = "#000"; g.fillText(t, x + 1, y + 1); g.fillStyle = c; g.fillText(t, x, y); };
  g.fillStyle = "#0d0a07"; g.fillRect(0, 0, W, H);
  // the table: a gilt frame round the painted continent
  g.fillStyle = "#6e5326"; g.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
  g.fillStyle = "#1a130b"; g.fillRect(mx - 2, my - 2, mw + 4, mh + 4);
  g.drawImage(paintArt(v), mx, my, mw, mh);

  // ways between lands: a dashed road from one territory to the other, named at its middle
  g.lineWidth = Math.max(2, Math.round(ds * 0.8)); g.setLineDash([Math.max(5, ds * 3), Math.max(4, ds * 2)]);
  g.strokeStyle = "rgba(150,215,255,0.9)";
  for (const l of LAND_LINKS) { const [ax, ay] = P(l.a), [bx, by] = P(l.b); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); }
  g.setLineDash([]);
  // banners of the homelands
  for (const s of SLOTS) {
    if (!s.banner) continue;
    const b = bannerArt(s.banner.clan), bs = Math.max(1, Math.round(ds * 1.1)), bx = Math.round(mx + s.banner.x * u - 10 * bs), by = Math.round(my + s.banner.y * u - 18 * bs);
    g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(bx + 3, by + 3, 20 * bs, 36 * bs);
    g.drawImage(b, bx, by, 20 * bs, 36 * bs);
    g.textAlign = "center"; g.font = `13px ${font}`;
    const label = TAG[s.banner.clan], lw = g.measureText(label).width + 10;
    g.fillStyle = "rgba(10,8,6,0.85)"; g.fillRect(Math.round(bx + 10 * bs - lw / 2), by + 36 * bs + 3, Math.round(lw), 17);
    text(label, bx + 10 * bs, by + 36 * bs + 12, GOLD); g.textAlign = "left";
  }

  // the Crown of the Marches: neutral, not yet there
  { const cx = Math.round(mx + 590 * u), cy = Math.round(my + 430 * u), k = Math.max(2, Math.round(ds));
    g.fillStyle = "#8a7a52"; // a crown, greyed
    for (const [x, y, w, h] of [[0, 3, 11, 3], [0, 0, 1, 3], [5, 0, 1, 3], [10, 0, 1, 3], [1, 1, 1, 2], [4, 1, 1, 2], [6, 1, 1, 2], [9, 1, 1, 2]]) g.fillRect(cx - 5 * k + x * k, cy + y * k, w * k, h * k);
  }

  // territories: holds and capitals in holder colours
  const sz = Math.max(8, Math.round(15 * u));
  const near: { id: number; d: number }[] = [];
  for (const t of TERRITORIES) {
    const [x0, y0] = P(t.id), x = Math.round(x0), y = Math.round(y0), k = CLAN_KEYS[v.owner[t.id]], col = k ? MAP[k] : 0x888888;
    const cap = !!t.capitalOf, s = cap ? Math.round(sz * 1.5) : Math.round(sz * [0.75, 1, 1.25][viewTier(v, t.id)]), h = s >> 1; // (a bigger marker for a bigger Hold)
    if (v.sieges.some((sg) => sg[0] === t.id)) { g.lineWidth = 2; g.strokeStyle = `rgba(255,80,40,${0.45 + 0.55 * pulse})`; g.strokeRect(x - h - 5, y - h - 5, s + 10, s + 10); }
    if (v.raided?.includes(t.id)) { g.lineWidth = 2; g.setLineDash([4, 3]); g.strokeStyle = `rgba(200,110,255,${0.7 + 0.3 * pulse})`; g.strokeRect(x - h - 3, y - h - 3, s + 6, s + 6); g.setLineDash([]); }
    g.fillStyle = "#0d0a07"; g.fillRect(x - h - 1, y - h - 1, s + 2, s + 2);
    g.fillStyle = hex(mix(col, 0x000000, cap ? 0.15 : 0.35)); g.fillRect(x - h, y - h, s, s);
    g.strokeStyle = cap ? "#ffd860" : hex(mix(col, 0xffffff, 0.35)); g.lineWidth = cap ? 2 : 1; g.strokeRect(x - h + 0.5, y - h + 0.5, s - 1, s - 1);
    if (cap) { g.fillStyle = "#ffd860"; g.fillRect(x - 1, y - h - 6, 2, 6); g.fillStyle = hex(col); g.fillRect(x + 1, y - h - 6, 5, 3); } // a flag on the keep
    if (hero && t.x <= hero.tx && hero.tx < t.x + t.w && t.y <= hero.ty && hero.ty < t.y + t.h) {
      g.fillStyle = `rgba(255,209,102,${0.6 + 0.4 * pulse})`; g.fillRect(x - 3, y - 3, 6, 6); g.strokeStyle = "#000"; g.lineWidth = 1; g.strokeRect(x - 3.5, y - 3.5, 7, 7);
    }
    if (hover) near.push({ id: t.id, d: Math.hypot(hover.x - x, hover.y - y) });
  }
  // the capital cities' gates (shared/capitals.ts): a small gilt arch in the clan's colour beside the territory the gate stands in
  for (const c of CITIES) {
    const t = TERRITORIES.find((q) => q.x <= c.outer.x && c.outer.x < q.x + q.w && q.y <= c.outer.y && c.outer.y < q.y + q.h);
    if (!t) continue;
    const [x0, y0] = P(t.id), k = Math.max(2, Math.round(sz / 5)), gx = Math.round(x0 + sz * 0.9), gy = Math.round(y0 + sz * 0.5);
    g.fillStyle = "#0d0a07"; g.fillRect(gx - 3 * k - 1, gy - 3 * k - 1, 6 * k + 2, 6 * k + 2);
    g.fillStyle = hex(MAP[c.clan]); g.fillRect(gx - 3 * k, gy - 3 * k, 6 * k, 6 * k);
    g.fillStyle = "#0d0a07"; g.fillRect(gx - k, gy, 2 * k, 3 * k);
    g.fillStyle = "#ffd860"; g.fillRect(gx - 3 * k, gy - 3 * k, 6 * k, Math.max(1, k >> 1));
    g.textAlign = "left"; text(`${cityText(c).name} gate`, gx + 3 * k + 5, gy, GOLD, 11);
  }

  // land plates: the land's name and each clan's share of it
  for (const s of SLOTS) {
    const name = NAMES[s.key] ?? s.key, ids = idsOf(s.key);
    const sm = ds < 2.2, fs = sm ? 12 : 14;
    g.font = `${fs}px ${font}`;
    const nw = g.measureText(name).width, chip = sm ? 26 : 30, built = ids.length > 0;
    const sub = built ? "" : "coming";
    g.font = `11px ${font}`;
    const w = Math.round(Math.max(nw, built ? CLAN_KEYS.length * chip : g.measureText(sub).width) + 14), h = sm ? 34 : 38;
    const px = Math.round(mx + s.plate[0] * u), py = Math.round(my + s.plate[1] * u);
    g.fillStyle = "rgba(10,8,6,0.88)"; g.fillRect(px, py, w, h);
    g.strokeStyle = built ? "#c8962c" : "#6a604c"; g.lineWidth = 1; g.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
    text(name, px + 7, py + (sm ? 11 : 12), built ? GOLD : "#a8a08a", fs);
    if (built) CLAN_KEYS.forEach((k, j) => {
      const n = ids.filter((id) => CLAN_KEYS[v.owner[id]] === k).length, x = px + 7 + j * chip;
      g.fillStyle = rgba(MAP[k], n ? 1 : 0.3); g.fillRect(x, py + h - 14, 8, 8);
      text(`${n}`, x + 11, py + h - 9.5, n ? "#eadfc8" : "#7a6e5a", 11);
    }); else text(sub, px + 7, py + h - 11, "#8a8470", 11);
  }

  // the ways' names, on top of everything on the map
  for (const l of LAND_LINKS) {
    const [ax, ay] = P(l.a), [bx, by] = P(l.b), x = Math.round(ax + (bx - ax) * 0.4), y = Math.round(ay + (by - ay) * 0.4);
    g.font = `12px ${font}`;
    const w = g.measureText(l.link.name).width + 8;
    g.fillStyle = "rgba(10,8,6,0.85)"; g.fillRect(Math.round(x - w / 2), y - 8, Math.round(w), 16);
    g.textAlign = "center"; text(l.link.name, x, y + 1, "#96d7ff", 12); g.textAlign = "left";
  }

  // legend on the right
  const lx = W - legW - pad + 6, lw = legW - 6;
  g.fillStyle = "rgba(10,8,6,0.85)"; g.fillRect(lx - 6, pad, lw + 6, H - pad * 2);
  g.strokeStyle = "#6e5326"; g.lineWidth = 1; g.strokeRect(lx - 5.5, pad + 0.5, lw + 5, H - pad * 2 - 1);
  const tight = H < 560, rowH = tight ? 16 : 19, keyH = tight ? 14 : 17;
  let y = pad + 16;
  text("The Riven Marches", lx + 4, y, "#f6b040", 16); y += 18;
  text(`War table, tick ${v.tick}`, lx + 4, y, "#a39680", 11); y += 22;
  CLAN_KEYS.forEach((k, i) => {
    const n = v.owner.filter((o) => CLAN_KEYS[o] === k).length, tag = v.hunt === i ? "hunted" : v.rally === i ? "Rally" : "";
    g.fillStyle = "#0d0a07"; g.fillRect(lx + 3, y - 6, 12, 12); g.fillStyle = hex(MAP[k]); g.fillRect(lx + 4, y - 5, 10, 10);
    text(short(k), lx + 21, y, "#eadfc8", 12);
    g.textAlign = "right"; text(`${n}`, lx + lw - 6, y, "#ffe8a3", 13); g.textAlign = "left";
    if (tag) { y += 13; text(tag, lx + 21, y, v.hunt === i ? "#c890ff" : "#9fe07a", 11); }
    y += rowH;
  });
  y += 4;
  const key = (draw: () => void, label: string) => { draw(); text(label, lx + 28, y, "#cfc4aa", 11); y += keyH; };
  key(() => { g.fillStyle = hex(EMBER[0]); g.fillRect(lx + 3, y - 1, 18, 3); }, "Front line");
  key(() => { g.fillStyle = "#0d0a07"; g.fillRect(lx + 7, y - 6, 10, 10); g.strokeStyle = "#c9b27a"; g.lineWidth = 1; g.strokeRect(lx + 7.5, y - 5.5, 9, 9); }, "Hold");
  key(() => { g.fillStyle = "#0d0a07"; g.fillRect(lx + 6, y - 7, 13, 13); g.strokeStyle = "#ffd860"; g.lineWidth = 2; g.strokeRect(lx + 7, y - 6, 11, 11); }, "Capital (cannot fall)");
  if (CITIES.length) key(() => { g.fillStyle = "#0d0a07"; g.fillRect(lx + 6, y - 7, 13, 13); g.fillStyle = hex(MAP[CITIES[0].clan]); g.fillRect(lx + 7, y - 6, 11, 11); g.fillStyle = "#0d0a07"; g.fillRect(lx + 11, y - 1, 3, 6); }, "City gate");
  key(() => { g.strokeStyle = "rgba(150,215,255,0.9)"; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(lx + 3, y); g.lineTo(lx + 21, y); g.stroke(); g.setLineDash([]); }, "Way between lands");
  key(() => { g.strokeStyle = `rgba(255,80,40,${0.5 + 0.5 * pulse})`; g.lineWidth = 2; g.strokeRect(lx + 6, y - 6, 12, 12); }, "Under siege");
  key(() => { g.strokeStyle = "rgba(200,110,255,0.9)"; g.lineWidth = 2; g.setLineDash([3, 2]); g.strokeRect(lx + 6, y - 6, 12, 12); g.setLineDash([]); }, "Struck by raiders");
  y += 6;
  const caps = TERRITORIES.filter((t) => t.capitalOf).length;
  text(`${TERRITORIES.length} territories, ${caps} capitals`, lx + 4, y, "#a39680", 11);
  y += tight ? 20 : 26;
  text("Homelands", lx + 4, y, "#f6b040", 14); y += tight ? 17 : 20;
  for (const k of CLAN_KEYS) { // each clan's home land, as in the design
    g.fillStyle = "#0d0a07"; g.fillRect(lx + 3, y - 6, 12, 12); g.fillStyle = hex(MAP[k]); g.fillRect(lx + 4, y - 5, 10, 10);
    text(TAG[k], lx + 21, y, "#eadfc8", 12);
    text(REGIONS.find((r) => r.home === k)?.name ?? "", lx + 21, y + 12, "#8f866f", 10);
    y += tight ? 25 : 30;
  }

  // hover: the nearest territory within reach
  const h = near.sort((a, b) => a.d - b.d)[0];
  if (hover && h && h.d < Math.max(16, sz)) {
    const t = TERRITORIES[h.id], k = CLAN_KEYS[v.owner[h.id]], sg = v.sieges.find((s) => s[0] === h.id);
    const lines = [t.name, `${k ? short(k) : "Unclaimed"}${t.capitalOf ? "  (capital)" : ""}`, `Level ${t.levels[0]}-${t.levels[1]}  Control ${v.control[h.id] ?? 0}`];
    if (sg) lines.push(`Siege by ${short(CLAN_KEYS[sg[1]])}`);
    g.font = `12px ${font}`;
    const w = Math.round(Math.max(...lines.map((l) => g.measureText(l).width)) + 14), hh = lines.length * 16 + 8;
    const tx = Math.round(Math.min(W - w - 4, hover.x + 14)), ty = Math.round(Math.max(4, Math.min(H - hh - 4, hover.y + 10)));
    g.fillStyle = "rgba(10,8,6,0.95)"; g.fillRect(tx, ty, w, hh);
    g.strokeStyle = k ? hex(MAP[k]) : "#888"; g.lineWidth = 1; g.strokeRect(tx + 0.5, ty + 0.5, w - 1, hh - 1);
    lines.forEach((l, i) => text(l, tx + 7, ty + 12 + i * 16, i === 0 ? GOLD : "#eadfc8", 12));
  }
  g.restore();
}
