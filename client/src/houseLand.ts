import { rng } from "./smoothProps";

/**
 * Land house looks (settlement network step 3, "land identity"), painted over the low cottage (isobuild.ts house):
 * Cairnwatch's "cairn" halls get rough fieldstone walls and sod roofs with grass over the eaves; the Rustwater Post's
 * "drover" houses get bleached plank walls with hides stretched on them, a longhorn skull on the gable and a patched
 * shingle roof, so the post no longer looks like Ropewell. Cosmetic only. Points are world px: x, y on the ground, z up.
 */
export type LandDress = "cairn" | "drover";
/** Chimney tops of Cairnwatch's halls (world px, z up): ambient.ts gives each a peat-smoke plume. Filled by isobuild.ts. */
export const PEAT_SMOKE: { x: number; y: number; z: number }[] = [];
type Pt = { x: number; y: number };
type Proj = (x: number, y: number, z?: number) => Pt;

function quad(ctx: CanvasRenderingContext2D, pts: Pt[], fill: string) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y); ctx.closePath(); ctx.fill();
}
function line(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, col: string, w = 1) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}
const dot = (ctx: CanvasRenderingContext2D, p: Pt, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(p.x), Math.round(p.y), w, h); };

/** The house's box, its wall height and the front wall tiles that are plain wall (no door or window). */
export interface LandWallBox { X0: number; X1: number; Y0: number; Y1: number; facadeH: number; plain: number[] }

/** Walls, painted after the wall art and before the roof's front slope. */
export function landWalls(ctx: CanvasRenderingContext2D, S: Proj, dress: LandDress, b: LandWallBox, seed: number) {
  const R = rng(seed), { X0, X1, Y0, Y1, facadeH: H } = b;
  // a face: point on it at f (0..1 along) and height z; the front runs west-east at Y1, the side north-south at X1
  const front = (f: number, z: number) => S(X0 + f * (X1 - X0), Y1, z), side = (f: number, z: number) => S(X1, Y0 + f * (Y1 - Y0), z);
  if (dress === "cairn") {
    // rough courses of moor stone: a dark joint every few px up, the stones in each course of uneven length
    for (const [face, len] of [[front, X1 - X0], [side, Y1 - Y0]] as const) {
      for (let z = 3 + R() * 2; z < H - 1; z += 4 + R() * 2) {
        line(ctx, face(0, z), face(1, z), "rgba(16,14,14,0.42)", 0.8);
        for (let u = R() * 8; u < len; u += 6 + R() * 9) line(ctx, face(u / len, z), face(u / len, z + 4), "rgba(16,14,14,0.38)", 0.8);
        for (let k = 0; k < len / 9; k++) { const p = face(R(), z + 1 + R() * 2); dot(ctx, p, 2, 1, R() < 0.5 ? "rgba(190,186,176,0.22)" : "rgba(20,18,18,0.22)"); }
      }
      // moss and wet at the foot
      for (let k = 0; k < len / 3; k++) { const p = face(R(), R() * 6); dot(ctx, p, 1 + Math.floor(R() * 2), 1, ["rgba(60,82,44,0.55)", "rgba(44,62,34,0.5)", "rgba(80,96,54,0.45)"][Math.floor(R() * 3)]); }
    }
    return;
  }
  // drover: sun-bleached planks standing on end, cracked, nail heads; a darker sill board at the foot
  quad(ctx, [front(0, H), front(1, H), front(1, 0), front(0, 0)], "rgba(168,148,116,0.42)");
  quad(ctx, [side(0, H), side(1, H), side(1, 0), side(0, 0)], "rgba(120,104,82,0.45)");
  for (const [face, len, dk] of [[front, X1 - X0, 0.55], [side, Y1 - Y0, 0.65]] as const) {
    for (let u = 3 + R() * 2; u < len; u += 4.5 + R() * 1.5) {
      line(ctx, face(u / len, 0), face(u / len, H), `rgba(30,22,14,${dk})`, 0.8);
      if (R() < 0.4) { const z = 4 + R() * (H - 10); line(ctx, face(u / len + 0.01, z), face(u / len + 0.015, z + 4 + R() * 6), "rgba(30,22,14,0.35)", 0.6); }
      for (const z of [5, H - 5]) dot(ctx, face((u + 2) / len, z), 1, 1, "rgba(24,20,18,0.8)");
    }
    quad(ctx, [face(0, 3), face(1, 3), face(1, 0), face(0, 0)], "rgba(60,40,24,0.6)");
  }
  // hides pegged out to dry on the plain wall
  const hide = (cx: number, cz: number, w: number, h: number, onSide: boolean) => {
    const P = (u: number, v: number) => (onSide ? S(X1 + 0.5, cx + u, cz + v) : S(cx + u, Y1 + 0.5, cz + v));
    const pts: Pt[] = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, leg = i % 4 === 2 ? 1.25 : 1, r = (0.86 + R() * 0.12) * leg; pts.push(P(Math.cos(a) * w / 2 * r, Math.sin(a) * h / 2 * r)); }
    ctx.fillStyle = ["#a8743e", "#b88448", "#986636"][Math.floor(R() * 3)]; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(60,34,16,0.75)"; ctx.lineWidth = 0.8; ctx.stroke();
    line(ctx, P(0, -h / 2 + 1), P(0, h / 2 - 1), "rgba(70,40,18,0.55)", 1.4); // the spine
    for (let k = 0; k < 3; k++) dot(ctx, P((R() - 0.5) * w * 0.5, (R() - 0.5) * h * 0.5), 2, 1, "rgba(230,200,150,0.4)");
    // pegged out by the legs: a nail and a thong at each corner (no frame: on a wall a frame reads as a window)
    for (const [u, v] of [[-w / 2 - 2, -h / 2 - 1.5], [w / 2 + 2, -h / 2 - 1.5], [-w / 2 - 2, h / 2 + 1.5], [w / 2 + 2, h / 2 + 1.5]]) {
      line(ctx, P(u, v), P(u * 0.8, v * 0.8), "rgba(70,48,28,0.9)", 0.7); dot(ctx, P(u, v), 1, 1, "#1a1410");
    }
  };
  const TILE = 32;
  const spots = b.plain.filter((_, i) => i % 2 === 0).slice(0, 2);
  // low on the wall: in the iso view the eaves hide its upper half
  for (const i of spots) hide(X0 + (i + 0.5) * TILE, 9.5, 17, 11, false);
  if (Y1 - Y0 >= 2 * TILE) hide(Y0 + (Y1 - Y0) * 0.5, 9.5, 15, 10, true);
}

/** The roof's front slope, as houseRoof sees it, and the ridge. */
export interface LandRoofBox { X0: number; X1: number; Y0: number; Y1: number; o: number; top: number; eave: number; alongX: boolean }

/** Roof, painted over the finished roof (after houseRoof and the weathering). */
export function landRoof(ctx: CanvasRenderingContext2D, S: Proj, dress: LandDress, b: LandRoofBox, seed: number) {
  const R = rng(seed), { X0, X1, Y0, Y1, o, top, eave, alongX } = b;
  // s along the ridge, t from ridge (0) to eave (1)
  const sp = (s0: number, t0: number): Pt => alongX
    ? S(X0 - o + s0 * (X1 - X0 + 2 * o), (Y0 + Y1) / 2 + t0 * ((Y1 - Y0) / 2 + o), top + t0 * (eave - top))
    : S((X0 + X1) / 2 + t0 * ((X1 - X0) / 2 + o), Y0 - o + s0 * (Y1 - Y0 + 2 * o), top + t0 * (eave - top));
  const len = Math.hypot(sp(1, 0).x - sp(0, 0).x, sp(1, 0).y - sp(0, 0).y);
  if (dress === "cairn") {
    // turf over the slates: a mat of grass and heather, darker where it's wet, bare earth showing in places
    quad(ctx, [sp(0, 0), sp(1, 0), sp(1, 1), sp(0, 1)], "rgba(62,76,40,0.88)");
    for (let k = 0; k < len * 3; k++) {
      const p = sp(R(), R()), c = ["#4e6230", "#3a4c26", "#5e6e36", "#2e3c20", "#6a6a3a", "#4a3a26"][Math.floor(R() * 6)];
      dot(ctx, p, 1 + Math.floor(R() * 3), 1, c);
    }
    for (let k = 0; k < 3; k++) { const p = sp(0.1 + R() * 0.8, 0.2 + R() * 0.6); dot(ctx, p, 2, 1, "#6a4e8a"); dot(ctx, { x: p.x + 1, y: p.y - 1 }, 1, 1, "#8a6aa8"); } // heather in flower
    // grass hanging over the eave, tufts along the ridge, a few stones holding the turf down
    for (let i = 0; i < len / 2; i++) {
      const f = i / (len / 2), e = sp(f, 1), h = 2 + Math.floor(R() * 3);
      dot(ctx, { x: e.x, y: e.y }, 1, h, R() < 0.5 ? "#3e5226" : "#526430");
      const r = sp(f, 0), t = 1 + Math.floor(R() * 3);
      dot(ctx, { x: r.x, y: r.y - t }, 1, t, R() < 0.5 ? "#4e6230" : "#6a7a3a");
    }
    for (let k = 0; k < 4; k++) { const p = sp(0.12 + k * 0.25 + R() * 0.05, 0.92); ctx.fillStyle = "#6e6a64"; ctx.beginPath(); ctx.ellipse(p.x, p.y - 1, 2.4, 1.6, 0, 0, Math.PI * 2); ctx.fill(); dot(ctx, { x: p.x - 1, y: p.y - 2 }, 2, 1, "#9a948c"); }
    return;
  }
  // drover: grey shingles bleached by the sun, courses down the slope, patched with new red-brown ones, a few missing
  quad(ctx, [sp(0, 0), sp(1, 0), sp(1, 1), sp(0, 1)], "rgba(150,132,104,0.5)");
  const rows = 7;
  for (let r = 1; r < rows; r++) {
    const t = r / rows; line(ctx, sp(0, t), sp(1, t), "rgba(40,30,20,0.55)", 0.8);
    for (let s = R() * 0.05; s < 1; s += 0.04 + R() * 0.03) line(ctx, sp(s, t - 1 / rows), sp(s, t), "rgba(40,30,20,0.3)", 0.6);
  }
  for (let k = 0; k < 4 + Math.floor(R() * 3); k++) {
    const s0 = 0.05 + R() * 0.82, r = Math.floor(R() * (rows - 1)), t0 = r / rows, ws = 0.05 + R() * 0.08;
    quad(ctx, [sp(s0, t0), sp(s0 + ws, t0), sp(s0 + ws, t0 + 1 / rows), sp(s0, t0 + 1 / rows)], R() < 0.75 ? "rgba(120,62,36,0.6)" : "rgba(14,10,8,0.4)");
  }
  // a longhorn skull nailed on the gable end, the drovers' sign (the eaves hide the wall over the door)
  const c = alongX ? S(X1 + 0.6, (Y0 + Y1) / 2 + 3, eave + (top - eave) * 0.25) : S((X0 + X1) / 2, Y1 + 0.6, eave + (top - eave) * 0.25);
  ctx.strokeStyle = "#d8ccb0"; ctx.lineWidth = 1.6;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(c.x + s * 2, c.y - 2); ctx.quadraticCurveTo(c.x + s * 9, c.y - 2, c.x + s * 12, c.y - 7); ctx.stroke(); }
  ctx.strokeStyle = "rgba(40,30,20,0.6)"; ctx.lineWidth = 0.6;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(c.x + s * 2, c.y - 1); ctx.quadraticCurveTo(c.x + s * 9, c.y - 1, c.x + s * 12, c.y - 6); ctx.stroke(); }
  ctx.fillStyle = "#e4dac4"; ctx.beginPath(); ctx.ellipse(c.x, c.y, 3, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#b8ac92"; ctx.fillRect(Math.round(c.x) - 1, Math.round(c.y) + 2, 3, 2);
  dot(ctx, { x: c.x - 2, y: c.y - 1 }, 1, 2, "#1a120c"); dot(ctx, { x: c.x + 1, y: c.y - 1 }, 1, 2, "#1a120c");
}
