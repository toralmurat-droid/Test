import { canvasPen, hsh, IsoPaint, mat, ramp, type Mat, type V3 } from "./isoPaint";
import { BLACKR, BONER, BRASSR, IRONR, REDR, ROPER, STRAWR, WOODR, wood } from "./isoProps";
import { dressSalt, type WinRect } from "./houseSalt";

/**
 * Life in and around the taller houses (Murat 2026-11-13: "as if the characters had to go inside"): an open door
 * with someone standing in it, and the trade of the house hung on its walls: nets, oars and creels for Saltmere's
 * fishers, sacks and a hoist for the miller, banners and spears for the Redfang barracks, rope coils and a cage on a
 * hoist for Ropewell's ropewrights.
 *
 * Painted straight onto a house canvas (isobuild.ts house()) in world px: an IsoPaint whose origin is the canvas
 * offset, so (u, v, z) here are the world (x, y, z) of the house.
 */
export type HouseStyle = "fisher" | "mill" | "barracks" | "tavern" | "smokehouse" | "chandlery" | "ropewright";
/** The base look a style builds on (Saltmere's tavern, smokehouse and chandlery are fisher houses with their own trade). */
const baseOf = (style: HouseStyle): "fisher" | "mill" | "barracks" | "ropewright" => (style === "mill" || style === "barracks" || style === "ropewright" ? style : "fisher");

const SKIN = [0x3a2418, 0x5a3a28, 0x7e5640, 0xa07458, 0xbe9070];
const BLUE = [0x0e141e, 0x1a2434, 0x28384e, 0x3a5068, 0x506a84];
const FLOUR = [0x4a463e, 0x6e685c, 0x948c7c, 0xbab2a0, 0xdcd6c6];
const OILSKIN = [0x2a2008, 0x4a3a10, 0x6e5818, 0x947826, 0xb89a3a];
const NET = [0x1e1a12, 0x3a3322, 0x5a5036, 0x7a6e4c];
const CORK = [0x3a2210, 0x6a4020, 0x9a6634, 0xc8944c];
const LEATHER = [0x1e140c, 0x342214, 0x4e341e, 0x6a482a, 0x86603a];
const WICKER = [0x2a1a0c, 0x463018, 0x664826, 0x866236, 0xa47c48];

function painter(ctx: CanvasRenderingContext2D, left: number, topY: number) {
  return new IsoPaint(canvasPen(ctx, 1), ctx.canvas.width, ctx.canvas.height, -left, -topY);
}

/** Someone standing in a doorway, facing out (+v). `dark` dims them: they stand in the shade of the house. */
function person(q: IsoPaint, u: number, v: number, full: HouseStyle, seed: number, dark = -0.12) {
  const style = baseOf(full);
  const top = style === "fisher" ? BLUE : style === "mill" ? FLOUR : style === "ropewright" ? LEATHER : REDR;
  const legs = style === "barracks" ? BLACKR : WOODR;
  const m = (pal: number[], b = 0): Mat => mat(pal, b + dark);
  for (const s of [-1, 1]) q.rod([u + s * 1.4, v, 0], [u + s * 1.3, v, 8.5], 1.15, m(legs, 0.1));
  q.blob([u, v, 12.8], 3.3, 2.1, 5, m(top));
  if (style === "mill") q.quad([u - 2.8, v + 2.1, 5], [5.6, 0, 0], [0, 0, 8.5], m(FLOUR, 0.25)); // floury apron
  if (full === "tavern") q.quad([u - 3, v + 2.2, 3], [6, 0, 0], [0, 0, 10], m(FLOUR, 0.3)); // the landlady's white apron
  else if (style === "fisher" && hsh(seed, 1) < 0.5) q.quad([u - 3, v + 2.2, 4], [6, 0, 0], [0, 0, 11], m(OILSKIN, 0.05));
  // arms: a bandit rests a hand on his blade, the others hang loose or hold a pipe
  q.rod([u - 3.4, v, 16], [u - 3.9, v + 1, 9.5], 1, m(top, -0.05));
  q.rod([u + 3.4, v, 16], [u + 3.6, v + 1.6, 10], 1, m(top, -0.05));
  q.blob([u, v + 0.3, 19.6], 2.3, 2.1, 2.5, m(SKIN));
  if (style === "barracks") {
    q.blob([u, v - 0.2, 20.2], 2.8, 2.6, 3, m(REDR, -0.05), 0.35, 1); // hood
    q.rod([u + 3.9, v + 2, 11], [u + 4.4, v + 4.5, 0.5], 0.45, mat(IRONR, 0.1 + dark)); // blade, point down
    q.rod([u + 3.8, v + 1.9, 11], [u + 3.7, v + 1.6, 13], 0.6, m(WOODR)); // grip
  } else if (style === "fisher") {
    q.blob([u, v, 21.2], 2.4, 2.3, 1.6, m(REDR, -0.1), 0.45, 1); // knitted cap
    q.blob([u, v + 1.6, 18.4], 1.6, 0.8, 1.3, m(BONER, -0.35)); // grey beard
  } else {
    q.blob([u, v, 21.4], 2.6, 2.5, 1.2, m(FLOUR, 0.1), 0.45, 1); // cap
  }
}

/**
 * An open door in the front wall (+y face at y = Y1) between world x xa..xa+32: a dark room behind with a lamp's
 * glow, its owner in the doorway, the plank door swung out on its hinges.
 */
export function openDoor(ctx: CanvasRenderingContext2D, left: number, topY: number, S: (x: number, y: number, z?: number) => { x: number; y: number },
  xa: number, Y1: number, style: HouseStyle, seed: number) {
  const a = xa + 9, b = xa + 23, H = 23, base = baseOf(style);
  const poly = (pts: { x: number; y: number }[], fill: string) => { ctx.fillStyle = fill; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill(); };
  const hole = [S(a, Y1, 0), S(b, Y1, 0), S(b, Y1, H), S(a, Y1, H)];
  ctx.save();
  ctx.beginPath(); hole.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.clip();
  poly(hole, "#120c08");
  poly([S(a, Y1, 0), S(b, Y1, 0), S(b, Y1 - 16, 0), S(a, Y1 - 16, 0)], "#2a1e14"); // floorboards
  poly([S(a + 2, Y1 - 15, 4), S(b - 1, Y1 - 15, 4), S(b - 1, Y1 - 15, 18), S(a + 2, Y1 - 15, 18)], style === "tavern" ? "rgba(255,170,80,0.34)" : style === "smokehouse" ? "rgba(255,96,30,0.36)" : "rgba(255,160,70,0.16)"); // lamp glow (the tavern's hearth, the smokehouse's fire)
  const q = painter(ctx, left, topY);
  // the trade inside, half seen in the dark
  if (style === "tavern") for (const du of [2.5, 6.5, 10.5]) q.blob([a + du, Y1 - 12, 3.6], 1.5, 1.5, 1.6, mat(BRASSR, -0.3)); // tankards on a shelf, glinting
  if (base === "fisher" && style !== "tavern") q.quad([a + 1, Y1 - 14, 6], [12, 0, 0], [0, 0, 14], (l, s, t, x, y) => ((x + y) & 3) && ((x - y) & 3) ? undefined : ramp(NET, l - 0.25, x, y));
  if (base === "mill") for (const [du, dz] of [[3, 0], [8, 0], [5.5, 4]]) q.blob([a + du, Y1 - 12, 2.3 + dz], 2.6, 2, 2.4, mat(STRAWR, -0.35));
  if (base === "ropewright") for (const [du, dz] of [[3.5, 0], [9.5, 0], [6.5, 3.2]]) q.blob([a + du, Y1 - 12, 1.6 + dz], 3, 2.4, 1.6, mat(ROPER, -0.3));
  if (base === "barracks") for (let k = 0; k < 4; k++) q.rod([a + 2 + k * 3, Y1 - 14, 0], [a + 2.5 + k * 3, Y1 - 14.5, 20], 0.5, mat(k % 2 ? IRONR : WOODR, -0.3));
  person(q, (a + b) / 2 + (hsh(seed, 3) - 0.5) * 3, Y1 - 3.5, style, seed);
  ctx.restore();
  // the inner side of the left jamb, and the door swung out on its left-hand hinges, clear of the opening
  poly([S(a, Y1, 0), S(a, Y1 - 3, 0), S(a, Y1 - 3, H), S(a, Y1, H)], "#3a2818");
  const leaf = (fa: number, fz: number) => S(a - fa * 3, Y1 + fa * 13.5, fz * H);
  poly([leaf(0, 0), leaf(1, 0), leaf(1, 1), leaf(0, 1)], "#5a3e24");
  ctx.strokeStyle = "rgba(24,14,8,0.8)"; ctx.lineWidth = 0.7;
  for (let k = 1; k < 4; k++) { const p0 = leaf(k / 4, 0), p1 = leaf(k / 4, 1); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
  for (const fz of [0.2, 0.8]) { const p0 = leaf(0.05, fz), p1 = leaf(0.95, fz); ctx.strokeStyle = "#2a2622"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
  // the doorway's dark frame
  ctx.strokeStyle = "#2a1a0e"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(hole[0].x, hole[0].y); ctx.lineTo(hole[3].x, hole[3].y); ctx.lineTo(hole[2].x, hole[2].y); ctx.lineTo(hole[1].x, hole[1].y); ctx.stroke();
}

/** A storey beam: the floor joists of the upper storey show as a dark band round the front and side. */
export function storeyBeam(ctx: CanvasRenderingContext2D, S: (x: number, y: number, z?: number) => { x: number; y: number },
  X0: number, X1: number, Y0: number, Y1: number, z: number) {
  const band = (p: { x: number; y: number }[], c: string) => { ctx.fillStyle = c; ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.fill(); };
  band([S(X0, Y1 + 1.5, z + 2), S(X1 + 1.5, Y1 + 1.5, z + 2), S(X1 + 1.5, Y1 + 1.5, z - 1.5), S(X0, Y1 + 1.5, z - 1.5)], "#3a2818");
  band([S(X1 + 1.5, Y1 + 1.5, z + 2), S(X1 + 1.5, Y0, z + 2), S(X1 + 1.5, Y0, z - 1.5), S(X1 + 1.5, Y1 + 1.5, z - 1.5)], "#2a1c10");
  band([S(X0, Y1 + 1.5, z + 2), S(X1 + 1.5, Y1 + 1.5, z + 2), S(X1 + 1.5, Y1 + 1.5, z + 1.2), S(X0, Y1 + 1.5, z + 1.2)], "rgba(190,150,100,0.45)");
  for (let x = X0 + 6; x < X1; x += 9) { const p = S(x, Y1 + 2, z - 1); ctx.fillStyle = "#24160c"; ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y), 3, 2); } // joist ends
}

/**
 * The trade of the house on its walls, drawn after the walls and before the roof (the eaves shade the tops).
 * `di`: the door's tile index along the front, so nothing is hung across it.
 */
export function dressHouse(ctx: CanvasRenderingContext2D, left: number, topY: number, style: HouseStyle,
  b: { X0: number; X1: number; Y0: number; Y1: number; wallH: number; door?: number; wins?: WinRect[] }, seed: number) {
  // (tavern, smokehouse and chandlery: houseSalt.ts)
  const q = painter(ctx, left, topY), { X0, X1, Y0, Y1, wallH } = b, R = (k: number) => hsh(seed, k, 77);
  const doorX = b.door === undefined ? -1e9 : X0 + b.door * 32;
  const clear = (x0: number, x1: number) => x1 < doorX - 2 || x0 > doorX + 34;
  if (style === "tavern" || style === "smokehouse" || style === "chandlery") return dressSalt(ctx, q, left, topY, style, b, R, doorX, clear);
  if (style === "fisher") {
    // a net hung to dry along the side wall, sagging between pegs, corks along its top line
    const nz = wallH * 0.92, len = Math.min(Y1 - Y0 - 12, 70), y0 = Y0 + 6 + R(1) * (Y1 - Y0 - 12 - len);
    q.quad([X1 + 1.2, y0, nz], [0, len, 0], [0, 0, -nz * 0.62], (l, s, t, x, y) => {
      const sag = Math.sin(s * Math.PI * 3) * 0.04;
      if (t > 0.94 - sag - (s * 7 % 1) * 0.08) return undefined; // ragged bottom edge
      return ((x + y) % 3 === 0 || (x - y + 99) % 3 === 0) ? ramp(NET, l - 0.05 + (hsh(x, y, 4) - 0.5) * 0.2, x, y) : undefined;
    }, (s) => Math.sin(s * Math.PI * 3) ** 2 * 1.4, 0.4);
    for (let k = 0; k <= 8; k++) q.blob([X1 + 1.6, y0 + len * k / 8, nz - 0.6], 0.9, 1.2, 0.9, mat(CORK, 0.05));
    // oars and a boat hook leaning on the front wall
    const ox = X0 + 10 + R(2) * 20;
    if (clear(ox - 4, ox + 10)) {
      q.rod([ox, Y1 + 5, 0], [ox + 2, Y1 + 0.8, 44], 0.9, wood(WOODR, 0.1, 40));
      q.quad([ox - 1.3, Y1 + 5.4, 0.5], [3, -0.2, 0], [0.3, -1, 11], wood(WOODR, 0.15, 10));
      q.rod([ox + 6, Y1 + 5, 0], [ox + 8.5, Y1 + 0.8, 47], 0.8, wood(WOODR, 0, 40));
      q.rod([ox + 8.5, Y1 + 0.8, 47], [ox + 9.5, Y1 + 1.6, 44], 0.45, mat(IRONR, 0.1));
    }
    // creels (lobster pots) stacked by the front corner
    const cx = X1 - 14;
    if (clear(cx - 6, cx + 12)) for (const [du, dv, dz] of [[0, 8, 0], [9, 8, 0], [4.5, 8.5, 7.2]]) {
      q.blob([cx + du, Y1 + dv, dz + 3.4], 4, 3.2, 3.6, (l, s, t, x, y) => ((x + (y >> 1)) % 3 ? ramp(ROPER, l * 0.9, x, y) : ramp(WOODR, l - 0.2, x, y)), 0.5, 1);
      q.box(cx + du - 4, cx + du + 4, Y1 + dv - 3.2, Y1 + dv + 3.2, dz, dz + 3.4, wood(WOODR, 0, 8));
    }
    // fish drying on a line under the eaves, and a red and white float
    const fy = wallH - 7, fx0 = X0 + 6, fx1 = X0 + 6 + Math.min(70, X1 - X0 - 20);
    q.rod([fx0, Y1 + 1.5, fy + 3], [fx1, Y1 + 1.5, fy + 3], 0.3, mat(ROPER));
    for (let x = fx0 + 4; x < fx1 - 2; x += 5 + R(x) * 2) if (clear(x, x + 1)) q.blob([x, Y1 + 2, fy - 1], 0.9, 0.6, 3.2, (l, s, t, xx, yy) => ramp([0x2a3036, 0x4a545c, 0x7a8890, 0xa8b4ba], l + t * 0.2, xx, yy));
    q.blob([X1 + 3, Y1 - 6, wallH * 0.45], 2.4, 2.4, 2.6, (l, s, t, x, y) => ramp(t > 0.5 ? REDR : BONER, l + 0.1, x, y));
  } else if (style === "mill") {
    // a hoist beam out of the upper storey with a sack on its rope, sacks piled by the door
    const hx = X0 + (X1 - X0) * 0.3;
    q.box(hx - 1.5, hx + 1.5, Y1, Y1 + 12, wallH - 9, wallH - 6, wood(WOODR, 0.05, 12));
    q.rod([hx, Y1 + 11, wallH - 9], [hx, Y1 + 11, wallH - 26], 0.35, mat(ROPER));
    q.blob([hx, Y1 + 11, wallH - 29], 3, 2.4, 3.6, mat(STRAWR, 0.05));
    for (const [du, dz] of [[0, 0], [6, 0], [3, 4.5]]) {
      const sx = (b.door === undefined ? X0 + 8 : doorX + 34) + du;
      if (sx < X1 - 4) q.blob([sx, Y1 + 5, 2.6 + dz], 3, 2.4, 2.8, mat(FLOUR, -0.05));
    }
  } else if (style === "ropewright") {
    // a hoist beam out of the upper storey with a pulley, a cage basket hung on its rope
    const hx = [0.72, 0.22, 0.88, 0.1].map((f) => X0 + (X1 - X0) * f).find((x) => clear(x - 6, x + 6));
    if (hx !== undefined) {
      q.box(hx - 1.5, hx + 1.5, Y1, Y1 + 14, wallH - 8, wallH - 5, wood(WOODR, 0.05, 14));
      q.blob([hx, Y1 + 13, wallH - 9], 1.2, 2.2, 2.2, mat(IRONR, 0.05));
      q.rod([hx, Y1 + 13, wallH - 11], [hx, Y1 + 13, 20], 0.35, mat(ROPER));
      q.blob([hx, Y1 + 13, 15.5], 4.6, 4.6, 4.6, mat(WICKER, 0.02), 0.5, 1);
      for (const s of [-1, 1]) q.rod([hx + s * 4, Y1 + 13, 19], [hx, Y1 + 13, 22], 0.3, mat(ROPER));
    }
    // coils of rope hung on pegs along the side wall, more coiled by the door
    for (let k = 0; k < 3; k++) {
      const yy = Y0 + 14 + k * Math.min(22, (Y1 - Y0 - 28) / 2);
      if (yy > Y1 - 8) break;
      q.rod([X1, yy, wallH * 0.42 + 2], [X1 + 3, yy, wallH * 0.42 + 2], 0.6, wood(WOODR, 0, 3));
      q.surf((s2, t) => { const r = 5 - t * 1.2, a2 = s2 * Math.PI * 2; return [[X1 + 2.2, yy + Math.cos(a2) * r, wallH * 0.42 - 3 + Math.sin(a2) * r], [1, 0, 0]]; }, 40, 4, (l, _s, _t, x, y) => ramp(ROPER, l + ((x + y) % 3 ? 0.05 : -0.15), x, y));
    }
    const cx = b.door === undefined ? X0 + 10 : doorX + 38;
    if (cx < X1 - 8) for (const [du, dz] of [[0, 0], [9, 0], [4.5, 2.4]]) q.blob([cx + du, Y1 + 6, 1.4 + dz], 4, 3.2, 1.4, (l, _s, _t, x, y) => ramp(ROPER, l + ((x - y) % 3 ? 0.05 : -0.18), x, y));
  } else {
    // a war banner on the front's upper storey, spears and round shields along the side wall
    const bx = X0 + (X1 - X0) * (0.25 + R(3) * 0.15);
    q.rod([bx - 2, Y1 + 1.6, wallH - 4], [bx + 20, Y1 + 1.6, wallH - 4], 0.6, wood(WOODR, 0, 22));
    q.quad([bx - 1, Y1 + 1.4, wallH - 4.5], [20, 0, 0], [0, 0, -34], (l, s, t, x, y) => {
      if (t > 0.86 && Math.abs(s - 0.5) < (t - 0.86) * 3.5) return undefined; // swallowtail
      const fang = Math.abs(s - 0.5) < 0.18 - Math.abs(t - 0.45) * 0.4 && t > 0.2 && t < 0.7;
      return fang ? ramp(BONER, l + 0.1, x, y) : ramp(REDR, l - (hsh(x, y, 5) < 0.06 ? 0.3 : 0), x, y);
    }, (s, t) => Math.sin(s * Math.PI) * 0.6 + Math.sin(t * 7) * 0.3, 0.5);
    for (let k = 0; k < 4; k++) {
      const yy = Y0 + 12 + k * Math.min(14, (Y1 - Y0 - 24) / 3);
      q.rod([X1 + 4, yy, 0], [X1 + 1.6, yy - 1, 34], 0.55, wood(WOODR, -0.05, 34));
      q.rod([X1 + 1.6, yy - 1, 34], [X1 + 1.3, yy - 1.1, 38.5], 0.6, mat(IRONR, 0.1));
    }
    for (let k = 0; k < 2; k++) {
      const yy = Y0 + 18 + k * 26;
      if (yy > Y1 - 6) break;
      q.surf((s, t) => { const r = 5.5 * t, a = s * Math.PI * 2; return [[X1 + 1.4 + (1 - t) * 0.8, yy + Math.cos(a) * r, wallH * 0.62 + Math.sin(a) * r], [1, 0, 0.1]]; }, 40, 8,
        (l, s, t, x, y) => t > 0.86 ? ramp(IRONR, l, x, y) : t < 0.18 ? ramp(BRASSR, l + 0.1, x, y) : ramp((s * 4 | 0) % 2 ? REDR : BLACKR, l + 0.05, x, y));
    }
  }
}
