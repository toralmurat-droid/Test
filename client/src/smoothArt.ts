import Phaser from "phaser";
import { hiResTexture } from "./smooth";

/**
 * Smooth, painted versions of the world's trees and bushes (no pixel art): soft gradients, layered leaf clusters,
 * rim light from the top-left. Same texture keys, sizes, frames and pivots as the pixel ones in ambient.ts.
 */
const S = 6; // painted at 6x the texture size

function rng(seed: number) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const rgb = (c: number, k = 1, a = 1) => `rgba(${Math.min(255, ((c >> 16) & 255) * k) | 0},${Math.min(255, ((c >> 8) & 255) * k) | 0},${Math.min(255, (c & 255) * k) | 0},${a})`;

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0.5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(10,20,10,${a})`); g.addColorStop(0.7, `rgba(10,20,10,${a * 0.6})`); g.addColorStop(1, "rgba(10,20,10,0)");
  ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.translate(-x, -y);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

/** A soft round blob lit from the top-left. */
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, c: number, light = 1.35, dark = 0.55) {
  const g = ctx.createRadialGradient(x - rx * 0.35, y - ry * 0.4, 0, x, y, Math.max(rx, ry) * 1.1);
  g.addColorStop(0, rgb(c, light)); g.addColorStop(0.55, rgb(c)); g.addColorStop(1, rgb(c, dark));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}

/** A gnarled trunk: a twisting, uneven column flaring into roots at the base, deep bark furrows, light from the left. */
function trunk(ctx: CanvasRenderingContext2D, cx: number, top: number, base: number, w: number, seed = 5) {
  const r = rng(seed * 13 + 7);
  const n = 8, side = (k: number) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = top + (base - top) * t;
      const flare = Math.pow(t, 5) * w * 1.9; // the base spreads into roots
      pts.push([cx + k * (w * (0.5 + 0.18 * t) + flare) + Math.sin(t * 5 + seed) * w * 0.22 + (r() - 0.5) * w * 0.12, y]);
    }
    return pts;
  };
  const L = side(-1), R = side(1);
  const g = ctx.createLinearGradient(cx - w * 1.6, 0, cx + w * 1.6, 0);
  g.addColorStop(0, "#5a524a"); g.addColorStop(0.35, "#38302a"); g.addColorStop(0.75, "#1c1714"); g.addColorStop(1, "#0c0a08");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
  for (const p of L) ctx.lineTo(p[0], p[1]);
  // roots along the ground between the two sides
  ctx.quadraticCurveTo(cx - w * 0.6, base - 0.9, cx, base - 0.3); ctx.quadraticCurveTo(cx + w * 0.6, base - 0.9, R[n][0], R[n][1]);
  for (let i = n; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath(); ctx.fill();
  // furrows and ridges of the bark
  ctx.lineCap = "round";
  for (let k = 0; k < 9; k++) {
    const x0 = cx + (r() - 0.5) * w * 1.1, y0 = top + r() * (base - top) * 0.6, len = (base - top) * (0.3 + r() * 0.5);
    ctx.strokeStyle = k % 3 ? "rgba(8,6,5,0.55)" : "rgba(120,110,98,0.28)"; ctx.lineWidth = k % 3 ? 0.22 : 0.14;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0 + (r() - 0.5) * 0.8, y0 + len * 0.33, x0 + (r() - 0.5) * 0.8, y0 + len * 0.66, x0 + (r() - 0.5) * 0.6, y0 + len); ctx.stroke();
  }
  // moss creeping up the shaded side
  for (let k = 0; k < 18; k++) {
    const t = 0.55 + r() * 0.45, y = top + (base - top) * t;
    ctx.fillStyle = `rgba(${40 + r() * 20},${58 + r() * 20},${34},${0.35 + r() * 0.3})`;
    ctx.beginPath(); ctx.ellipse(cx + w * (0.2 + r() * 0.5), y, 0.25 + r() * 0.3, 0.18 + r() * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  }
}

/** Leafy canopy: shaded lobes, then hundreds of small leaf clusters, darker low and right, sunlit high and left. */
function canopy(ctx: CanvasRenderingContext2D, seed: number, cx: number, cy: number, rx: number, ry: number, pal: number[], sway: number) {
  const [dark, mid, light, hi] = pal;
  const r = rng(seed);
  cx += sway;
  // dark underside mass
  blob(ctx, cx, cy + ry * 0.15, rx * 1.02, ry * 0.95, dark, 1.0, 0.7);
  const lobes: [number, number, number, number][] = [
    [cx, cy, rx * 0.85, ry * 0.85], [cx - rx * 0.5, cy + ry * 0.2, rx * 0.5, ry * 0.5], [cx + rx * 0.5, cy + ry * 0.25, rx * 0.5, ry * 0.5],
    [cx - rx * 0.1, cy - ry * 0.45, rx * 0.65, ry * 0.55], [cx + rx * 0.35, cy - ry * 0.25, rx * 0.45, ry * 0.45],
  ];
  for (const [x, y, a, b] of lobes) blob(ctx, x, y, a, b, mid, 1.25, 0.62);
  // dark hollows between the leaf masses
  for (let k = 0; k < 26; k++) {
    const ang = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.8;
    ctx.fillStyle = rgb(dark, 0.6, 0.55);
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(ang) * rx * d, cy + Math.sin(ang) * ry * d + ry * 0.1, 0.9 + r() * 1.2, 0.6 + r() * 0.8, r() * 3, 0, Math.PI * 2); ctx.fill();
  }
  // leaf clusters (some past the edge, so the silhouette is ragged)
  for (let k = 0; k < 900; k++) {
    const ang = r() * Math.PI * 2, d = Math.sqrt(r()) * 1.06;
    const x = cx + Math.cos(ang) * rx * d, y = cy + Math.sin(ang) * ry * d;
    const lit = (-(x - cx) / rx - (y - cy) / ry) * 0.5 + 0.5 + (r() - 0.5) * 0.35; // 0 = shade, 1 = sun
    const c = lit > 0.78 ? hi : lit > 0.52 ? light : lit > 0.3 ? mid : dark;
    const s = 0.3 + r() * 0.45; // small, many: a painted leaf mass, not blobs
    ctx.fillStyle = rgb(c, 0.9 + r() * 0.2, 0.9);
    ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.7, r() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
  // soft rim light on the top-left edge
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  const g = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx * 0.3, cy + ry * 0.3);
  g.addColorStop(0, "rgba(170,190,200,0.07)"); g.addColorStop(0.5, "rgba(170,190,200,0)"); g.addColorStop(1, "rgba(4,8,12,0.55)");
  ctx.fillStyle = g; ctx.fillRect(cx - rx * 1.2, cy - ry * 1.2, rx * 2.4, ry * 2.4);
  ctx.restore();
}

/** A bare branch from (x0,y0) to (x1,y1), tapering. */
function limb(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number) {
  ctx.strokeStyle = "#2e241c"; ctx.lineCap = "round";
  const mx = (x0 + x1) / 2 + (y1 - y0) * 0.15, my = (y0 + y1) / 2 - Math.abs(x1 - x0) * 0.12;
  ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
  ctx.strokeStyle = "rgba(96,84,70,0.55)"; ctx.lineWidth = w * 0.3;
  ctx.beginPath(); ctx.moveTo(x0 - w * 0.2, y0 - w * 0.2); ctx.quadraticCurveTo(mx - w * 0.2, my - w * 0.2, x1, y1); ctx.stroke();
}

/** Oak frames: 24x28 design units plus a margin on the sides and top (the trunk base stays 2 units above the bottom). */
const OAK_PAD = 2, OAK_W = 24 + 2 * OAK_PAD, OAK_H = 28 + OAK_PAD;

export function smoothTrees(scene: Phaser.Scene, K: number) {
  // Oaks: 24x28 design units (x K texture px), trunk base bottom centre, 2 sway frames
  for (const [key, seed, pal] of [
    ["oak_a", 3, [0x111a14, 0x1d2a1f, 0x2e3a2a, 0x46503a]],
    ["oak_b", 7, [0x161c14, 0x252e20, 0x384030, 0x525642]],
  ] as const) {
    hiResTexture(scene, key, OAK_W * K, OAK_H * K, 2, S, (ctx, f) => {
      ctx.scale(K, K); ctx.translate(OAK_PAD, OAK_PAD);
      shadow(ctx, 12, 25.6, 9, 2.4);
      trunk(ctx, 12, 13, 26, 1.6);
      canopy(ctx, seed, 12, 10.5, 10.6, 8.8, pal as unknown as number[], f * 0.45);
    });
  }
  // More oaks, so a wood is not one tree repeated: a broad old one with a split crown, a sickly one with dead
  // branches through a thin canopy, a young narrow one; then a second, taller pine
  hiResTexture(scene, "oak_c", OAK_W * K, OAK_H * K, 2, S, (ctx, f) => {
    ctx.scale(K, K); ctx.translate(OAK_PAD, OAK_PAD); // margin so swaying crowns are not cut at the frame edge
    shadow(ctx, 12, 25.6, 10, 2.6);
    trunk(ctx, 12, 12, 26, 2);
    limb(ctx, 12, 15, 6.5, 9, 0.7); limb(ctx, 12, 14, 17.5, 8.5, 0.7);
    canopy(ctx, 31, 7.4, 9.6, 6.4, 6, [0x131a13, 0x222b1e, 0x343c2c, 0x4c5040], f * 0.4);
    canopy(ctx, 37, 16.4, 9, 6.6, 6.4, [0x131a13, 0x222b1e, 0x343c2c, 0x4c5040], f * 0.5);
    canopy(ctx, 41, 12, 5.6, 5.4, 4.4, [0x161c14, 0x262e21, 0x3a4132, 0x545744], f * 0.45);
  });
  hiResTexture(scene, "oak_d", OAK_W * K, OAK_H * K, 2, S, (ctx, f) => {
    ctx.scale(K, K); ctx.translate(OAK_PAD, OAK_PAD); // margin so swaying crowns are not cut at the frame edge
    shadow(ctx, 12, 25.6, 8, 2.2);
    trunk(ctx, 12, 9, 26, 1.5);
    canopy(ctx, 53, 12.5, 11.5, 8.4, 6.8, [0x1a1c14, 0x2c2e22, 0x42412f, 0x5c5842], f * 0.4);
    // dead limbs poking out of the thin crown
    limb(ctx, 11, 11, 3.5, 4.5, 0.75); limb(ctx, 13, 10, 19, 3, 0.65);
  });
  hiResTexture(scene, "oak_e", OAK_W * K, OAK_H * K, 2, S, (ctx, f) => {
    ctx.scale(K, K); ctx.translate(OAK_PAD, OAK_PAD); // margin so swaying crowns are not cut at the frame edge
    shadow(ctx, 12, 25.6, 6.5, 2);
    trunk(ctx, 12, 14, 26, 1.1);
    canopy(ctx, 67, 12, 11.5, 6.6, 9.4, [0x101914, 0x1c2a20, 0x2c3b2c, 0x424e3a], f * 0.55);
  });
  // Dead tree: a bare, twisted trunk with forked limbs and no leaves (a wood is not all green, Murat 2026-11-07)
  hiResTexture(scene, "oak_f", OAK_W * K, OAK_H * K, 2, S, (ctx, f) => {
    ctx.scale(K, K); ctx.translate(OAK_PAD, OAK_PAD);
    shadow(ctx, 12, 25.6, 6, 1.8);
    trunk(ctx, 12, 12, 26, 1.5, 9);
    const r = rng(91), sw = f * 0.3;
    // a gnarled crown: each branch splits into two or three twisting, thinner ones
    const branch = (x: number, y: number, ang: number, len: number, w: number, depth: number) => {
      const x1 = x + Math.cos(ang) * len + sw * (1 - y / 26), y1 = y + Math.sin(ang) * len;
      limb(ctx, x, y, x1, y1, w);
      if (depth <= 0 || w < 0.18) return;
      const kids = 2 + (r() < 0.35 ? 1 : 0);
      for (let k = 0; k < kids; k++) branch(x1, y1, ang + (k - (kids - 1) / 2) * (0.5 + r() * 0.35) + (r() - 0.5) * 0.3, len * (0.62 + r() * 0.15), w * 0.62, depth - 1);
    };
    branch(12, 13, -Math.PI / 2 - 0.55, 5, 0.9, 3);
    branch(12, 12.5, -Math.PI / 2 + 0.5, 5.4, 0.85, 3);
    branch(12, 12, -Math.PI / 2, 4.2, 0.7, 3);
  });
  // Pines: tall, dark, ragged conifers with drooping, uneven tiers (no two alike: a full one and a gaunt one)
  const conifer = (key: string, seed: number, tiers: number, gaunt: boolean) => hiResTexture(scene, key, 20 * K, 30 * K, 2, S, (ctx, f) => {
    ctx.scale(K, K);
    shadow(ctx, 10, 27.6, gaunt ? 5 : 6.8, 2);
    trunk(ctx, 10, gaunt ? 3 : 18, 28, gaunt ? 0.9 : 1.1);
    const r = rng(seed);
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1); // 0 = bottom tier, 1 = top
      const y1 = 26 - t * 21 + (r() - 0.5) * 1.2, y0 = y1 - (gaunt ? 4.2 : 6.5) + t * 1.2;
      const half = (gaunt ? 6 : 8.6) * (1 - t * 0.78) * (0.8 + r() * 0.35);
      if (gaunt && r() < 0.3 && i > 0 && i < tiers - 1) { // a bare gap: just dead twigs on this tier
        limb(ctx, 10, y1 - 1, 10 - half, y1 - 0.2, 0.3); limb(ctx, 10, y1 - 1.5, 10 + half * 0.8, y1 - 0.6, 0.3);
        continue;
      }
      const sway = f ? 0.2 + t * 0.6 : 0, cx = 10 + sway, lean = (r() - 0.5) * 1.6;
      const g = ctx.createLinearGradient(cx - half, y0, cx + half, y1);
      g.addColorStop(0, "#34463e"); g.addColorStop(0.45, "#17271f"); g.addColorStop(1, "#060d0a");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, y0);
      ctx.quadraticCurveTo(cx - half * 0.4, y0 + (y1 - y0) * 0.5, cx - half + lean, y1 + 0.8); // drooping skirt
      const teeth = 6 + Math.floor(r() * 4);
      for (let k = 0; k < teeth; k++) {
        const xa = cx - half + ((k + 0.5) / teeth) * half * 2 + lean * 0.5, xb = cx - half + ((k + 1) / teeth) * half * 2 + lean * (k === teeth - 1 ? 1 : 0.5);
        ctx.quadraticCurveTo(xa, y1 - 1.6 - r() * 1.2, xb, y1 + r() * 1.1);
      }
      ctx.quadraticCurveTo(cx + half * 0.4, y0 + (y1 - y0) * 0.5, cx, y0);
      ctx.fill();
      ctx.lineWidth = 0.2;
      for (let k = 0; k < 34; k++) {
        const q = r(), y = y0 + 1 + q * (y1 - y0 - 1.2), w = half * (y - y0) / (y1 - y0) * 0.95;
        const x = cx + (r() * 2 - 1) * w;
        ctx.strokeStyle = x < cx ? "rgba(110,135,125,0.28)" : "rgba(2,10,8,0.5)";
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (x < cx ? -0.6 : 0.6), y + 1); ctx.stroke();
      }
    }
  });
  conifer("pine", 17, 6, false);
  conifer("pine_b", 29, 7, true);
  // Bush: a dark thorny bramble, twigs poking out (no bright berries)
  hiResTexture(scene, "bush", 18 * K, 16 * K, 2, S, (ctx, f) => {
    ctx.scale(K, K); ctx.translate(1, 0); // 1 unit side margin so the swaying leaves are not cut
    shadow(ctx, 8, 14.6, 7, 1.8);
    for (const [x0, y0, x1, y1] of [[8, 13, 1.5, 6.5], [8, 13, 15, 6], [8, 12, 4, 4.5], [8.5, 12, 12.5, 4]]) limb(ctx, x0, y0, x1 + f * 0.3, y1, 0.35);
    canopy(ctx, 23, 8, 10.2, 6.4, 4.2, [0x0e1810, 0x1a2a19, 0x2a3c24, 0x3e5030], f * 0.4);
    ctx.strokeStyle = "#1a1410"; ctx.lineWidth = 0.22;
    const r = rng(5);
    for (let k = 0; k < 14; k++) { // thorny twigs
      const a = r() * Math.PI * 2, x = 8 + Math.cos(a) * 6.5, y = 10 + Math.sin(a) * 3.8;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 1.6 + f * 0.2, y + Math.sin(a) * 1.2 - 0.5); ctx.stroke();
    }
  });
}
