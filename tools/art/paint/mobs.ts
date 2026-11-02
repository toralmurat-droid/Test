import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { MOB_POSES, posed, setPainted, type Dir } from "../characters";
import { C2, P, css, ellipseP, fillShape, glow, limb, line, metal, mix, rng, sh, vol } from "./brush";
import { pixelAlpha, pixelize, shrink } from "./body";

/**
 * Monster sheets for the iso look. Same textures as client/src/textures.ts mobTexture (6 frames:
 * 0-1 down, 2-3 up, 4-5 right, the second of each pair is the step / squish), plus 6 attack frames (6-7 down,
 * 8-9 up, 10-11 right: wind-up, then the strike) so monsters visibly gather and lunge: painted HI times bigger, then turned
 * into pixel art at TX texels per world px (the shared pixel grid, like the heroes). The client uploads them
 * through hiResTexture, so frame sizes and pivots stay the same. Frame sizes are even so TX x size is whole.
 */
const HI = 8, TX = 1.5;
/** Ground shadows go on their own layer so pixelize does not cut them away. */
let SH: C2 | null = null;
const DIRS: Dir[] = ["down", "down", "up", "up", "right", "right"];
const FRAMES = 12;
/** Facing and pose of sheet frame f. */
function frameOf(f: number): { dir: Dir; pose: "stand" | "step" | "wind" | "strike" } {
  if (f < 6) return { dir: DIRS[f], pose: f % 2 ? "step" : "stand" };
  const k = f - 6;
  return { dir: (["down", "up", "right"] as Dir[])[k >> 1], pose: k % 2 ? "strike" : "wind" };
}

interface Sheet { key: string; w: number; h: number; draw: (c: C2, f: number) => void }

// ---------------------------------------------------------------- humanoid monsters (character painter)
const PK = 5; // painter resolution for these
function humanoid(key: string, kind: string, w: number, h: number, oy: number, scale: number): Sheet {
  const frames = [...Array(FRAMES).keys()].map((f) => {
    const { dir, pose } = frameOf(f);
    if (pose === "wind") return posed(MOB_POSES[kind], { dir, t: f, attack: 0, crouch: 1, lean: 1, expr: "squint" }, false);
    if (pose === "strike") return posed(MOB_POSES[kind], { dir, t: f, attack: 2, bob: 1 }, false);
    return posed(MOB_POSES[kind], { dir, t: f, stride: pose === "step" ? (dir === "right" ? -1 : 1) : 0, bob: pose === "step" ? -1 : 0 }, false);
  });
  return {
    key, w, h,
    draw: (c, f) => {
      const fr = frames[f], n = createCanvas(fr.w, fr.h), x = n.getContext("2d"), img = x.createImageData(fr.w, fr.h);
      img.data.set(fr.data); x.putImageData(img, 0, 0);
      if (SH) { SH.save(); SH.translate(w / 2, oy * h); SH.scale(1, 0.3); SH.fillStyle = "rgba(0,0,0,0.42)"; SH.beginPath(); SH.arc(0, 0, 6.5 * scale, 0, Math.PI * 2); SH.fill(); SH.restore(); }
      // logical unit (16, 29) = the feet -> (w/2, oy*h) in world px
      c.save(); c.translate(w / 2, oy * h); c.scale(scale, scale); c.translate(-16, -29);
      c.imageSmoothingEnabled = true; (c as any).imageSmoothingQuality = "high";
      c.drawImage(n, 0, 0, 32, 32);
      c.restore();
    },
  };
}

// ---------------------------------------------------------------- blobs
interface BlobPal { G: number; L: number; D: number; E: number }
interface BlobOpts { bodyH: number; extra?: "shooter" | "warrior" | "healer" | "mother1" | "mother2" | "mother3"; seed?: number }

function blobFrame(c: C2, w: number, h: number, pal: BlobPal, o: BlobOpts, f: number) {
  const { dir, pose } = frameOf(f), squish = pose === "step";
  const wind = pose === "wind", strike = pose === "strike";
  // wind-up: sink low and wide, leaning away from the target; strike: spring up tall and narrow toward it
  const lean = dir === "right" ? (wind ? -0.9 : strike ? 1.1 : 0) : 0;
  const cx = w / 2 + lean, base = h - 1.3 + (dir === "down" && strike ? 0.4 : 0);
  const rx = wind ? w / 2 - 0.25 : strike ? w / 2 - 1.7 : (squish ? w / 2 - 0.35 : w / 2 - 1.0);
  const ry = o.bodyH * (wind ? 0.74 : strike ? 1.08 : squish ? 0.84 : 1) * 0.97;
  const top = base - ry;
  // ground shadow
  const sc = SH ?? c;
  sc.save(); sc.translate(cx, base + 0.3); sc.scale(1, 0.32);
  const sg = sc.createRadialGradient(0, 0, 0, 0, 0, rx + 1);
  sg.addColorStop(0, "rgba(0,0,0,0.45)"); sg.addColorStop(0.7, "rgba(0,0,0,0.35)"); sg.addColorStop(1, "rgba(0,0,0,0)");
  sc.fillStyle = sg; sc.beginPath(); sc.arc(0, 0, rx + 1, 0, Math.PI * 2); sc.fill(); sc.restore();
  const dome = (cc: C2) => {
    cc.moveTo(cx - rx, base - 0.3);
    cc.bezierCurveTo(cx - rx - 0.2, top + ry * 0.05, cx - rx * 0.45, top - ry * 0.02, cx, top);
    cc.bezierCurveTo(cx + rx * 0.45, top - ry * 0.02, cx + rx + 0.2, top + ry * 0.05, cx + rx, base - 0.3);
    cc.quadraticCurveTo(cx, base + 0.9, cx - rx, base - 0.3);
    cc.closePath();
  };
  // dark rim first (outline), then the jelly
  c.save(); c.beginPath(); dome(c); c.strokeStyle = css(sh(pal.D, 0.45), 0.9); c.lineWidth = 0.7; c.stroke(); c.restore();
  const g = c.createRadialGradient(cx - rx * 0.35, top + ry * 0.3, 0.2, cx, base - ry * 0.35, Math.max(rx, ry) * 1.25);
  g.addColorStop(0, css(mix(pal.L, pal.G, 0.35), 0.97)); g.addColorStop(0.45, css(pal.G, 0.94)); g.addColorStop(0.85, css(pal.D, 0.95)); g.addColorStop(1, css(sh(pal.D, 0.6), 0.97));
  c.beginPath(); dome(c); c.fillStyle = g; c.fill();
  c.save(); c.beginPath(); dome(c); c.clip();
  // subsurface glow near the ground, darker core, floating bubbles
  const sub = c.createLinearGradient(0, base - ry * 0.4, 0, base + 0.5);
  sub.addColorStop(0, css(pal.L, 0)); sub.addColorStop(1, css(pal.L, 0.35));
  c.fillStyle = sub; c.fillRect(cx - rx - 1, base - ry, rx * 2 + 2, ry + 2);
  const r = rng((o.seed ?? 3) + (squish ? 1 : 0));
  for (let k = 0; k < Math.max(3, w / 3); k++) {
    const bx = cx + (r() - 0.5) * rx * 1.4, by = base - 0.8 - r() * ry * 0.75, br = 0.2 + r() * 0.45;
    c.beginPath(); c.arc(bx, by, br, 0, Math.PI * 2); c.strokeStyle = css(pal.L, 0.45); c.lineWidth = 0.12; c.stroke();
    fillShape(c, ellipseP(bx - br * 0.35, by - br * 0.35, br * 0.3, br * 0.3), "rgba(255,255,255,0.5)");
  }
  if (o.extra?.startsWith("mother")) {
    // babies curled up inside her
    for (const [bx, by, s] of [[cx - rx * 0.5, base - 2.2, 1.6], [cx + rx * 0.45, base - 3.0, 1.4], [cx + 0.4, base - 1.4, 1.2]]) {
      fillShape(c, ellipseP(bx, by, s * 1.1, s * 0.8), css(sh(pal.L, 0.95), 0.55));
      fillShape(c, ellipseP(bx - s * 0.3, by - s * 0.3, s * 0.3, s * 0.2), "rgba(255,255,255,0.5)");
    }
  }
  // rim lighting along the left edge
  c.beginPath(); dome(c); c.strokeStyle = css(pal.L, 0.35); c.lineWidth = 0.5; c.translate(0.35, 0.35); c.stroke();
  c.restore();
  // glossy highlight
  fillShape(c, ellipseP(cx - rx * 0.42, top + ry * 0.32, rx * 0.26, ry * 0.15, -0.5), "rgba(255,255,255,0.55)");
  fillShape(c, ellipseP(cx - rx * 0.5, top + ry * 0.28, rx * 0.08, ry * 0.06), "rgba(255,255,255,0.95)");
  // face
  const ey = base - ry * 0.5, gap = Math.max(1, w / 6.5), es = Math.max(0.55, w / 18);
  const eye = (x: number, y: number) => {
    fillShape(c, ellipseP(x, y, es * 0.95, es * 1.15), css(0xf4f6ee));
    fillShape(c, ellipseP(x + (dir === "right" ? es * 0.35 : 0), y + es * 0.15, es * 0.6, es * 0.75), css(pal.E));
    fillShape(c, ellipseP(x - es * 0.2, y - es * 0.35, es * 0.22, es * 0.22), "rgba(255,255,255,0.95)");
  };
  if (dir === "down") { eye(cx - gap, ey); eye(cx + gap, ey); line(c, [[cx - es, ey + es * 2], [cx, ey + es * 2.5], [cx + es, ey + es * 2]], sh(pal.D, 0.4), 0.22, 0.8); }
  else if (dir === "right") { eye(cx + rx * 0.5, ey); eye(cx + rx * 0.05, ey - 0.1); }
  if ((wind || strike) && dir !== "up") {
    // angry brows slanting in toward the nose
    const bw = Math.max(0.35, es * 0.55), bc = sh(pal.D, 0.35);
    const xs = dir === "down" ? [cx - gap, cx + gap] : [cx + rx * 0.05, cx + rx * 0.5];
    for (const x of xs) { const s = dir === "down" ? (x < cx ? 1 : -1) : 1; line(c, [[x - es * 1.1 * s, ey - es * 1.7], [x + es * 0.8 * s, ey - es * 1.05]], bc, bw, 0.95); }
  }
  // extras
  const x = o.extra;
  if (x === "shooter") {
    const sx = dir === "right" ? cx + rx * 0.4 : cx, sy = top + 0.4;
    limb(c, [sx, sy + 1.4], [sx + (dir === "right" ? 1.6 : 0), sy - 2.0], 2.0, 1.6, 0x4a4458);
    fillShape(c, ellipseP(sx + (dir === "right" ? 1.6 : 0), sy - 2.0, 0.85, dir === "right" ? 0.85 : 0.45), css(0x0e0c14));
  } else if (x === "warrior") {
    const hs = (cc: C2) => { cc.moveTo(cx - rx * 0.78, top + ry * 0.38); cc.bezierCurveTo(cx - rx * 0.8, top - 1.4, cx + rx * 0.8, top - 1.4, cx + rx * 0.78, top + ry * 0.38); cc.closePath(); };
    metal(c, hs, 0xaeb6c2, [cx - rx, top - 1], [cx + rx, top + 2]);
    line(c, [[cx - rx * 0.8, top + ry * 0.36], [cx + rx * 0.8, top + ry * 0.36]], 0x5b6470, 0.5);
    for (let k = 0; k < 5; k++) line(c, [[cx + (k - 2) * 0.35, top - 0.6], [cx + (k - 2) * 0.6 - 0.5, top - 2.8 + Math.abs(k - 2) * 0.3]], k % 2 ? 0xe63946 : 0xb3262e, 0.55);
  } else if (x === "healer") {
    c.save(); c.translate(cx, top - 1.4); c.scale(1, 0.35);
    c.beginPath(); c.arc(0, 0, rx * 0.55, 0, Math.PI * 2); c.strokeStyle = css(0xffd54f, 0.95); c.lineWidth = 0.9; c.stroke(); c.restore();
    glow(c, cx, top - 1.4, rx * 0.8, 0xffd54f, 0.35);
    if (dir !== "up") { const gx = dir === "right" ? cx + rx * 0.3 : cx, gy = base - ry * 0.18; line(c, [[gx, gy - 1.1], [gx, gy + 1.1]], 0x43c463, 0.75); line(c, [[gx - 1.1, gy], [gx + 1.1, gy]], 0x43c463, 0.75); }
  } else if (x === "mother1" || x === "mother3") {
    // a gold tiara with a ruby (tier 1), an iron spiked crown (tier 3)
    const iron = x === "mother3", tw = rx * 0.5, ty = top + 0.6;
    const pts: P[] = [[cx - tw, ty + 1], [cx - tw, ty - 1.2], [cx - tw * 0.5, ty - 0.2], [cx, ty - (iron ? 2.6 : 1.9)], [cx + tw * 0.5, ty - 0.2], [cx + tw, ty - 1.2], [cx + tw, ty + 1]];
    metal(c, (cc) => { cc.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) cc.lineTo(q[0], q[1]); cc.closePath(); }, iron ? 0x9aa3ad : 0xffc93c, [cx - tw, ty - 2], [cx + tw, ty + 1]);
    if (dir !== "up") { fillShape(c, ellipseP(cx, ty + 0.2, 0.55, 0.55), css(0xe63946)); glow(c, cx, ty + 0.2, 1.2, 0xe63946, 0.5); }
  }
}

function blobSheet(key: string, w: number, h: number, pal: BlobPal, o: BlobOpts): Sheet {
  return { key, w, h, draw: (c, f) => blobFrame(c, w, h, pal, o, f) };
}

export function buildMobs(out: string) {
  mkdirSync(out, { recursive: true });
  setPainted(true, PK);
  const sheets: Sheet[] = [
    blobSheet("mob_slime", 12, 16, { G: 0x6cc35c, L: 0xc8f5b8, D: 0x2f7a32, E: 0x14301a }, { bodyH: 9 }),
    blobSheet("mob_blobling", 8, 10, { G: 0x9ade63, L: 0xf0ffd8, D: 0x4f8e30, E: 0x14301a }, { bodyH: 6, seed: 5 }),
    blobSheet("mob_shooterblob", 14, 18, { G: 0x9068cc, L: 0xe2ccff, D: 0x4e2f80, E: 0x1e0f33 }, { bodyH: 10, extra: "shooter" }),
    blobSheet("mob_warriorblob", 16, 18, { G: 0xd0543a, L: 0xffb59e, D: 0x7f2a19, E: 0x2a0d06 }, { bodyH: 10, extra: "warrior" }),
    blobSheet("mob_healerblob", 14, 18, { G: 0xf0c6de, L: 0xffffff, D: 0xb57a9b, E: 0x3a1a2e }, { bodyH: 10, extra: "healer" }),
    blobSheet("mob_motherblob", 24, 22, { G: 0x3a9684, L: 0xb8f2e0, D: 0x1c5448, E: 0x10302a }, { bodyH: 17, extra: "mother1", seed: 9 }),
    blobSheet("mob_motherblob2", 24, 22, { G: 0x2c8796, L: 0xb0eef5, D: 0x184c56, E: 0x0b2a30 }, { bodyH: 17, extra: "mother2", seed: 10 }),
    blobSheet("mob_motherblob3", 24, 22, { G: 0x553b96, L: 0xd3c2ff, D: 0x2f205f, E: 0x140a2a }, { bodyH: 17, extra: "mother3", seed: 11 }),
    // humanoids get taller frames than the pixel ones, about hero height (client: PAINTED_LOOK in textures.ts)
    humanoid("mob_skeleton", "skeleton", 20, 30, 27.5 / 30, 0.85),
    humanoid("mob_bandit", "bandit", 20, 30, 27.5 / 30, 0.85),
    humanoid("mob_skeletonmage", "skeletonmage", 24, 32, 31.2 / 32, 0.93),
    humanoid("mob_necromancer", "necromancer", 24, 32, 31.2 / 32, 0.93),
  ];
  const meta: Record<string, { w: number; h: number; scale: number; frames: number }> = {};
  for (const s of sheets) {
    const tw = s.w * TX, th = s.h * TX;
    const cv = createCanvas(tw * FRAMES, th), oc = cv.getContext("2d");
    const sheet = oc.createImageData(tw * FRAMES, th);
    for (let f = 0; f < FRAMES; f++) {
      const body = createCanvas(s.w * HI, s.h * HI), shadow = createCanvas(s.w * HI, s.h * HI);
      const c = body.getContext("2d"), sc = shadow.getContext("2d");
      c.scale(HI, HI); sc.scale(HI, HI);
      SH = sc; s.draw(c, f); SH = null;
      const blob = !/skeleton|bandit|necromancer/.test(s.key);
      const b = shrink(body, "mb", tw, th);
      pixelize(b, tw, th, true, blob ? { y0: Math.round(th * 0.7), y1: th, mud: 0.14, sat: 0.9 } : { y0: Math.round(th * 0.72), y1: th, mud: s.key.includes("bandit") ? 0.38 : 0.2 });
      const u = shrink(shadow, "ms", tw, th); pixelAlpha(u);
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        const i = (y * tw + x) * 4, o = (y * tw * FRAMES + f * tw + x) * 4, src = b[i + 3] ? b : u;
        for (let k = 0; k < 4; k++) sheet.data[o + k] = src[i + k];
      }
    }
    oc.putImageData(sheet, 0, 0);
    writeFileSync(`${out}/${s.key}.webp`, cv.encodeSync("webp", 100));
    meta[s.key] = { w: s.w, h: s.h, scale: TX, frames: FRAMES };
  }
  writeFileSync(`${out}/mobs.json`, JSON.stringify(meta, null, 1));
  setPainted(false, 2);
  console.log("painted monsters", Object.keys(meta).length);
}
