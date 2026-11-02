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

function trunk(ctx: CanvasRenderingContext2D, cx: number, top: number, base: number, w: number) {
  const g = ctx.createLinearGradient(cx - w, 0, cx + w, 0);
  g.addColorStop(0, "#6e5440"); g.addColorStop(0.45, "#4a3424"); g.addColorStop(1, "#22160e");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.55, top);
  ctx.quadraticCurveTo(cx - w * 0.6, base - 3, cx - w * 1.5, base);
  ctx.quadraticCurveTo(cx, base - 0.8, cx + w * 1.5, base);
  ctx.quadraticCurveTo(cx + w * 0.6, base - 3, cx + w * 0.55, top);
  ctx.closePath(); ctx.fill();
  // bark lines
  ctx.strokeStyle = "rgba(40,22,10,0.45)"; ctx.lineWidth = 0.18;
  for (let i = 0; i < 4; i++) {
    const x = cx - w * 0.35 + i * w * 0.25;
    ctx.beginPath(); ctx.moveTo(x, top + 1 + i * 0.7); ctx.quadraticCurveTo(x + 0.2, (top + base) / 2, x - 0.1 + (i % 2) * 0.3, base - 0.8); ctx.stroke();
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
  for (let k = 0; k < 480; k++) {
    const ang = r() * Math.PI * 2, d = Math.sqrt(r()) * 1.06;
    const x = cx + Math.cos(ang) * rx * d, y = cy + Math.sin(ang) * ry * d;
    const lit = (-(x - cx) / rx - (y - cy) / ry) * 0.5 + 0.5 + (r() - 0.5) * 0.35; // 0 = shade, 1 = sun
    const c = lit > 0.78 ? hi : lit > 0.52 ? light : lit > 0.3 ? mid : dark;
    const s = 0.45 + r() * 0.55;
    ctx.fillStyle = rgb(c, 0.9 + r() * 0.2, 0.9);
    ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.7, r() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
  // soft rim light on the top-left edge
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  const g = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx * 0.3, cy + ry * 0.3);
  g.addColorStop(0, "rgba(255,230,170,0.12)"); g.addColorStop(0.5, "rgba(255,230,170,0)"); g.addColorStop(1, "rgba(5,10,15,0.4)");
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

export function smoothTrees(scene: Phaser.Scene, K: number) {
  // Oaks: 24x28 design units (x K texture px), trunk base bottom centre, 2 sway frames
  for (const [key, seed, pal] of [
    ["oak_a", 3, [0x1a2e16, 0x2c4620, 0x44592a, 0x66743a]],
    ["oak_b", 7, [0x22301a, 0x3a4a24, 0x52602c, 0x747840]],
  ] as const) {
    hiResTexture(scene, key, 24 * K, 28 * K, 2, S, (ctx, f) => {
      ctx.scale(K, K);
      shadow(ctx, 12, 25.6, 9, 2.4);
      trunk(ctx, 12, 13, 26, 1.6);
      canopy(ctx, seed, 12, 10.5, 10.6, 8.8, pal as unknown as number[], f * 0.45);
    });
  }
  // More oaks, so a wood is not one tree repeated: a broad old one with a split crown, a sickly one with dead
  // branches through a thin canopy, a young narrow one; then a second, taller pine
  hiResTexture(scene, "oak_c", 24 * K, 28 * K, 2, S, (ctx, f) => {
    ctx.scale(K, K);
    shadow(ctx, 12, 25.6, 10, 2.6);
    trunk(ctx, 12, 12, 26, 2);
    limb(ctx, 12, 15, 6.5, 9, 0.7); limb(ctx, 12, 14, 17.5, 8.5, 0.7);
    canopy(ctx, 31, 7.4, 9.6, 6.4, 6, [0x1e2c16, 0x34421f, 0x4c5629, 0x6c6c36], f * 0.4);
    canopy(ctx, 37, 16.4, 9, 6.6, 6.4, [0x1e2c16, 0x34421f, 0x4c5629, 0x6c6c36], f * 0.5);
    canopy(ctx, 41, 12, 5.6, 5.4, 4.4, [0x22301a, 0x3c4a24, 0x56602c, 0x7a7642], f * 0.45);
  });
  hiResTexture(scene, "oak_d", 24 * K, 28 * K, 2, S, (ctx, f) => {
    ctx.scale(K, K);
    shadow(ctx, 12, 25.6, 8, 2.2);
    trunk(ctx, 12, 9, 26, 1.5);
    canopy(ctx, 53, 12.5, 11.5, 8.4, 6.8, [0x26301a, 0x40462a, 0x5c5a32, 0x7c7040], f * 0.4);
    // dead limbs poking out of the thin crown
    limb(ctx, 11, 11, 3.5, 4.5, 0.75); limb(ctx, 13, 10, 19, 3, 0.65);
  });
  hiResTexture(scene, "oak_e", 24 * K, 28 * K, 2, S, (ctx, f) => {
    ctx.scale(K, K);
    shadow(ctx, 12, 25.6, 6.5, 2);
    trunk(ctx, 12, 14, 26, 1.1);
    canopy(ctx, 67, 12, 11.5, 6.6, 9.4, [0x182a16, 0x2a4422, 0x40582c, 0x5e7036], f * 0.55);
  });
  // Pine: 20x30, layered tiers
  hiResTexture(scene, "pine", 20 * K, 30 * K, 2, S, (ctx, f) => {
    ctx.scale(K, K);
    shadow(ctx, 10, 27.6, 6.8, 2);
    trunk(ctx, 10, 21, 28, 1.1);
    const r = rng(17);
    const tiers: [number, number, number][] = [[14, 25, 8.4], [8, 19, 6.4], [3, 13.5, 4.4], [0, 7.5, 2.4]];
    for (const [i, [y0, y1, half]] of tiers.entries()) {
      const sway = f ? (0.25 + i * 0.25) : 0;
      const cx = 10 + sway;
      // tier body: a drooping cone with a jagged needle hem
      const g = ctx.createLinearGradient(cx - half, y0, cx + half, y1);
      g.addColorStop(0, "#4a6e4c"); g.addColorStop(0.45, "#25452f"); g.addColorStop(1, "#0f2218");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, y0);
      ctx.quadraticCurveTo(cx - half * 0.45, y0 + (y1 - y0) * 0.55, cx - half, y1);
      const teeth = 7;
      for (let t = 0; t < teeth; t++) {
        const xa = cx - half + ((t + 0.5) / teeth) * half * 2, xb = cx - half + ((t + 1) / teeth) * half * 2;
        ctx.quadraticCurveTo(xa, y1 - 1.3 - r() * 0.5, xb, y1 + (t % 2 ? 0.3 : -0.1));
      }
      ctx.quadraticCurveTo(cx + half * 0.45, y0 + (y1 - y0) * 0.55, cx, y0);
      ctx.fill();
      // needle strokes
      ctx.lineWidth = 0.22;
      for (let k = 0; k < 40; k++) {
        const t = r(), y = y0 + 1 + t * (y1 - y0 - 1.5), w = half * (y - y0) / (y1 - y0) * 0.95;
        const x = cx + (r() * 2 - 1) * w;
        ctx.strokeStyle = x < cx ? "rgba(130,160,120,0.4)" : "rgba(10,40,25,0.4)";
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (x < cx ? -0.6 : 0.6), y + 0.9); ctx.stroke();
      }
    }
  });
  // Bush: 16x16, round, with berries
  hiResTexture(scene, "bush", 16 * K, 16 * K, 2, S, (ctx, f) => {
    ctx.scale(K, K);
    shadow(ctx, 8, 14.6, 7, 1.8);
    canopy(ctx, 23, 8, 10.2, 6.6, 4.6, [0x1a2e16, 0x2c4620, 0x48612e, 0x748a44], f * 0.4);
    for (const [x, y] of [[10.5, 10], [5, 12], [11, 12.2], [8, 13], [6.5, 9]]) {
      const g = ctx.createRadialGradient(x - 0.25, y - 0.25, 0, x, y, 0.75);
      g.addColorStop(0, "#e09080"); g.addColorStop(0.4, "#a8302a"); g.addColorStop(1, "#5a1210");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + f * 0.4, y, 0.7, 0, Math.PI * 2); ctx.fill();
    }
  });
}
