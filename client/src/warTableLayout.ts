/**
 * The war table's continent (design: riven-marches-map.png): the lands lie round a centre by compass, not in the
 * stacked bands of the world map. Pure and deterministic, no DOM: each built land gets a polygon slot on a 1200 x 840
 * sheet, and its territories are spread inside it by their real map positions (normalised to the land's own box,
 * pulled inside the slot and pushed apart). Cosmetic: nothing here is sent to the server.
 */
import type { Territory } from "../../shared/war/territories";
import type { ClanKey } from "../../shared/war/clans";

export const WT_W = 1200, WT_H = 840;
export type Pt = [number, number];

export interface Slot {
  key: string;
  poly: Pt[];
  /** A point well inside the slot: territories that fall outside are pulled towards it. */
  core: Pt;
  /** Top-left of the land's name plate. */
  plate: Pt;
  /** The home clan's banner standing in the land (centre of the cloth). */
  banner?: { clan: ClanKey; x: number; y: number };
}

// Shared corners: neighbouring lands list the same vertices, so their borders meet without gaps or overlaps.
const M1: Pt = [560, 375], M2: Pt = [750, 430], D: Pt = [1200, 290];
const OAK_MOOR: Pt[] = [[600, 110], [615, 210], [590, 280], [610, 345]];

/** Lands by compass (regions.ts): Oakvale NW, Moors NE, Badlands W, Sunscar SE, Sinkholes S, the Crown in the centre. */
export const SLOTS: Slot[] = [
  { key: "oakvale", core: [300, 170], plate: [18, 18], banner: { clan: "wardens", x: 415, y: 95 },
    poly: [[0, 0], [560, 0], ...OAK_MOOR, M1, [500, 400], [425, 425], [340, 405], [290, 300], [200, 265], [0, 270]] },
  { key: "moors", core: [850, 200], plate: [660, 18], banner: { clan: "host", x: 810, y: 150 },
    poly: [[560, 0], [1200, 0], D, [900, 290], [900, 430], M2, M1, ...OAK_MOOR.slice().reverse()] },
  { key: "badlands", core: [150, 500], plate: [18, 600], banner: { clan: "redfang", x: 235, y: 400 },
    poly: [[0, 270], [200, 265], [290, 300], [340, 405], [425, 425], [425, 500], [300, 580], [270, 740], [250, 840], [0, 840]] },
  { key: "sunscar", core: [1020, 580], plate: [830, 726], banner: { clan: "veiled", x: 1010, y: 410 },
    poly: [[900, 290], D, [1200, 840], [920, 840], [900, 700], [780, 650], [710, 585], [750, 515], M2, [900, 430]] },
  { key: "sinkholes", core: [560, 730], plate: [330, 756], banner: { clan: "hidekin", x: 480, y: 625 },
    poly: [[300, 580], [425, 500], [560, 570], [600, 600], [710, 585], [780, 650], [900, 700], [920, 840], [250, 840], [270, 740]] },
  { key: "crown", core: [590, 470], plate: [470, 482],
    poly: [M1, M2, [750, 515], [710, 585], [600, 600], [560, 570], [425, 500], [425, 425], [500, 400]] },
];

/** Ray-cast point in polygon. */
export function inPoly(p: Pt, poly: readonly Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** Inside with room to spare: the point and its four neighbours `m` away are all in. */
const roomy = (p: Pt, poly: readonly Pt[], m: number) =>
  inPoly(p, poly) && inPoly([p[0] + m, p[1]], poly) && inPoly([p[0] - m, p[1]], poly) && inPoly([p[0], p[1] + m], poly) && inPoly([p[0], p[1] - m], poly);

export const SEP = 40, EDGE = 16;
/** The box a standing banner and its name plate take on the sheet (relative to its centre): territories keep out of it. */
export const BANNER_BOX = { x: 78, y0: -85, y1: 112 };
export interface Placed { id: number; x: number; y: number }

/** Where each territory stands on the sheet (sheet units), for the lands in `slots` that hold territories. */
export function layoutTerritories(ts: readonly Territory[], slots: readonly Slot[] = SLOTS): Placed[] {
  const out: Placed[] = [];
  for (const s of slots) {
    const mine = ts.filter((t) => t.region === s.key);
    if (!mine.length) continue;
    const xs = s.poly.map((p) => p[0]), ys = s.poly.map((p) => p[1]);
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
    const tx0 = Math.min(...mine.map((t) => t.cx)), tx1 = Math.max(...mine.map((t) => t.cx));
    const ty0 = Math.min(...mine.map((t) => t.cy)), ty1 = Math.max(...mine.map((t) => t.cy));
    const ix = (bx1 - bx0) * 0.12, iy = (by1 - by0) * 0.12;
    const pts = mine.map((t) => ({
      id: t.id,
      x: bx0 + ix + (tx1 > tx0 ? (t.cx - tx0) / (tx1 - tx0) : 0.5) * (bx1 - bx0 - 2 * ix),
      y: by0 + iy + (ty1 > ty0 ? (t.cy - ty0) / (ty1 - ty0) : 0.5) * (by1 - by0 - 2 * iy),
    }));
    for (let it = 0; it < 200; it++) {
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y, d = Math.hypot(dx, dy) || 0.01;
          if (d < SEP) { const k = (SEP - d) / 2 / d; pts[i].x -= dx * k; pts[i].y -= dy * k; pts[j].x += dx * k; pts[j].y += dy * k; }
        }
      }
      const bn = s.banner;
      for (const p of pts) {
        if (bn) { // out of the banner's box by its nearest side
          const dx = p.x - bn.x, dy = p.y - bn.y, ex = BANNER_BOX.x + 8, y0 = bn.y + BANNER_BOX.y0 - 8, y1 = bn.y + BANNER_BOX.y1 + 8;
          if (Math.abs(dx) < ex && p.y > y0 && p.y < y1) {
            const m = [ex - Math.abs(dx), p.y - y0, y1 - p.y], i = m.indexOf(Math.min(...m));
            if (i === 0) p.x = bn.x + Math.sign(dx || 1) * ex; else p.y = i === 1 ? y0 : y1;
          }
        }
        for (let n = 0; n < 40 && !roomy([p.x, p.y], s.poly, EDGE); n++) { p.x += (s.core[0] - p.x) * 0.06; p.y += (s.core[1] - p.y) * 0.06; }
      }
    }
    out.push(...pts.map((p) => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y) })));
  }
  return out;
}
