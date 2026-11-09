import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { GOLEM_H, GOLEM_W, paintGolemFrame, type GolemDir, type GolemElement } from "./golems";
import { createCanvas } from "@napi-rs/canvas";
import { MOB_POSES, posed, setPainted, type Dir } from "../characters";
import { C2, P, blobPath, css, ellipseP, poly, fillShape, glow, limb, line, metal, mix, rng, sh, vol } from "./brush";
import { lastRig, pixelAlpha, pixelize, shrink } from "./body";
import { paintRaider, RAIDER_H, RAIDER_W } from "./raiders";
import { paintWisp, WISP_H, WISP_W, type WispElement } from "./wisps";
import { RAIDERS } from "../../../shared/raiders";
import { AFFIX_KEYS, type AffixKey } from "../../../shared/champions";

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

interface Sheet { key: string; w: number; h: number; draw: (c: C2, f: number) => void; frames?: number; hands?: number[][] }

/**
 * Bone Demon's Bone Harvest (client TownScene demonRip): 9 more frames after the 12, 3 per facing (down, up, right):
 * "hold" lifts a skeleton overhead in both fists, "snap" tears it apart at chest height, "don" presses a piece onto
 * its body. Hands are in the old 32px rig's coordinates (posed() moves them onto the painted body).
 */
const RIP_FRAMES = 9;
const RIP: Record<"down" | "up" | "right", { hold: [P, P]; snap: [P, P]; don: [P, P] }> = {
  down: { hold: [[13, 9], [19, 9]], snap: [[6, 16], [26, 16]], don: [[12, 15], [20, 15]] },
  up: { hold: [[19, 9], [13, 9]], snap: [[26, 16], [6, 16]], don: [[20, 15], [12, 15]] },
  right: { hold: [[19, 8], [17, 8]], snap: [[23, 15], [12, 14]], don: [[17, 16], [16, 15]] },
};

// ---------------------------------------------------------------- humanoid monsters (character painter)
const PK = 5; // painter resolution for these
/** `lift`: flyers hover this many px above their shadow, bobbing with each wingbeat. */
function humanoid(key: string, kind: string, w: number, h: number, oy: number, scale: number, rip = false, lift = 0): Sheet {
  // Frames are painted on first use, so rebuilding a few sheets (buildMobs ONLY) doesn't paint every humanoid
  let frames: ReturnType<typeof humanoidFrame>[] | undefined;
  const hands: number[][] = [];
  const paint = () => frames ??= [...Array(FRAMES + (rip ? RIP_FRAMES : 0)).keys()].map((f) => {
    const fr = humanoidFrame(kind, f);
    // the hands in sheet px (world px from the frame's top-left): where the client puts the skeleton it holds
    const toSheet = (q: P) => [+(w / 2 + (q[0] - 16) * scale).toFixed(2), +(oy * h + (q[1] - 29) * scale).toFixed(2)];
    if (rip && lastRig) hands.push([...toSheet(lastRig.nearH), ...toSheet(lastRig.farH)]);
    return fr;
  });
  return {
    key, w, h, frames: FRAMES + (rip ? RIP_FRAMES : 0), get hands() { if (!rip) return undefined; paint(); return hands; },
    draw: (c, f) => {
      const fr = paint()[f], n = createCanvas(fr.w, fr.h), x = n.getContext("2d"), img = x.createImageData(fr.w, fr.h);
      img.data.set(fr.data); x.putImageData(img, 0, 0);
      if (SH) { SH.save(); SH.translate(w / 2, oy * h); SH.scale(1, 0.3); SH.fillStyle = "rgba(0,0,0,0.42)"; SH.beginPath(); SH.arc(0, 0, 6.5 * scale, 0, Math.PI * 2); SH.fill(); SH.restore(); }
      // logical unit (16, 29) = the feet -> (w/2, oy*h) in world px
      const up = lift ? lift + Math.sin(f * 1.7) * 1.2 : 0;
      c.save(); c.translate(w / 2, oy * h - up); c.scale(scale, scale); c.translate(-16, -29);
      c.imageSmoothingEnabled = true; (c as any).imageSmoothingQuality = "high";
      c.drawImage(n, 0, 0, 32, 32);
      c.restore();
    },
  };
}

function humanoidFrame(kind: string, f: number) {
  if (f >= FRAMES) {
    const k = f - FRAMES, dir = (["down", "up", "right"] as const)[Math.floor(k / 3)], step = (["hold", "snap", "don"] as const)[k % 3];
    const [hand, farHand] = RIP[dir][step];
    return posed(MOB_POSES[kind], { dir, t: f, hand, farHand, noWeapon: true, wAng: 90, crouch: step === "snap" ? 1 : 0, bob: step === "hold" ? -1 : 0, expr: step === "snap" ? "squint" : "n" }, false);
  }
  {
    const { dir, pose } = frameOf(f);
    if (pose === "wind") return posed(MOB_POSES[kind], { dir, t: f, attack: 0, crouch: 1, lean: 1, expr: "squint" }, false);
    if (pose === "strike") return posed(MOB_POSES[kind], { dir, t: f, attack: 2, bob: 1 }, false);
    return posed(MOB_POSES[kind], { dir, t: f, stride: pose === "step" ? (dir === "right" ? -1 : 1) : 0, bob: pose === "step" ? -1 : 0 }, false);
  }
}

// ---------------------------------------------------------------- blobs
interface BlobPal { G: number; L: number; D: number; E: number }
interface BlobOpts { bodyH: number; extra?: "shooter" | "warrior" | "healer" | "mother1" | "mother2" | "mother3" | "venom" | "frost" | "fire" | "storm"; seed?: number }

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
  // ---- body: a lumpy, sagging sack of slime (same lumps every frame, a little wobble per frame)
  const seed = o.seed ?? 3, sr = rng(seed * 977 + 13), ph = [sr() * 6.3, sr() * 6.3, sr() * 6.3], wob = f * 0.7;
  const lump = (a: number) => 0.06 * Math.sin(a * 3 + ph[0]) + 0.04 * Math.sin(a * 5 + ph[1]) + 0.018 * Math.sin(a * 8 + ph[2] + wob);
  const pts: P[] = [];
  const N = 30;
  for (let k = 0; k <= N; k++) {
    const a = Math.PI + (k / N) * Math.PI, sag = 1 + 0.16 * Math.pow(1 - Math.abs(Math.sin(a)), 1.6); // bulges low on the sides
    pts.push([cx + Math.cos(a) * rx * sag * (1 + lump(a)), base - 0.2 + Math.sin(a) * ry * (1 + lump(a) * 0.8)]);
  }
  // sloppy underside spreading onto the ground
  for (let k = 1; k < 8; k++) { const t = k / 8; pts.push([cx + rx * 1.12 - t * rx * 2.24, base + 0.35 + Math.sin(t * 9 + ph[1]) * 0.25]); }
  const dome = blobPath(pts);
  const bile = mix(pal.G, 0x8c8a3c, 0.3), gunk = mix(pal.D, 0x2b2a12, 0.35);
  // puddle of ooze it leaves under itself
  fillShape(c, ellipseP(cx + 0.2, base + 0.45, rx * 1.2, Math.max(0.7, rx * 0.22)), css(sh(pal.D, 0.75), 0.85));
  fillShape(c, ellipseP(cx - rx * 0.4, base + 0.3, rx * 0.35, 0.3), css(mix(pal.L, bile, 0.5), 0.6));
  // dark rim (outline), then the jelly
  c.save(); c.beginPath(); dome(c); c.strokeStyle = css(sh(gunk, 0.45), 0.9); c.lineWidth = 0.7; c.stroke(); c.restore();
  const g = c.createRadialGradient(cx - rx * 0.35, top + ry * 0.3, 0.2, cx, base - ry * 0.35, Math.max(rx, ry) * 1.25);
  g.addColorStop(0, css(mix(pal.L, bile, 0.5), 0.97)); g.addColorStop(0.4, css(bile, 0.95)); g.addColorStop(0.8, css(pal.D, 0.96)); g.addColorStop(1, css(sh(gunk, 0.6), 0.98));
  c.beginPath(); dome(c); c.fillStyle = g; c.fill();
  c.save(); c.beginPath(); dome(c); c.clip();
  const r = rng(seed + (squish ? 1 : 0));
  const rs = rng(seed * 31 + 7); // stable across frames (blotches, debris, pustules)
  // mottled, unhealthy skin: bilious and bruised blotches
  for (let k = 0; k < Math.max(5, w / 2); k++) {
    const bx = cx + (rs() - 0.5) * rx * 1.9, by = base - rs() * ry * 1.05, br = 0.5 + rs() * Math.max(0.8, rx * 0.22);
    fillShape(c, ellipseP(bx, by, br, br * (0.6 + rs() * 0.5), rs() * 3), css(rs() < 0.5 ? mix(bile, 0xb5b04a, 0.5) : sh(gunk, 0.9), 0.24));
  }
  // murky core with things floating in it (a bone, grit, a half-digested leaf)
  fillShape(c, ellipseP(cx + rx * 0.1, base - ry * 0.32, rx * 0.5, ry * 0.3), css(sh(gunk, 0.8), 0.45));
  if (w >= 10) {
    const bx = cx - rx * 0.2 + rs() * rx * 0.3, by = base - ry * 0.3;
    line(c, [[bx - 1.0, by + 0.3], [bx + 1.0, by - 0.4]], 0xd8d0b0, 0.35, 0.75);
    for (const [ex, ey] of [[bx - 1.0, by + 0.3], [bx + 1.0, by - 0.4]]) fillShape(c, ellipseP(ex, ey, 0.32, 0.32), css(0xd8d0b0, 0.75));
    fillShape(c, ellipseP(cx + rx * 0.45, base - ry * 0.22, 0.7, 0.4, 0.6), css(0x5a4a1c, 0.6));
  }
  for (let k = 0; k < Math.max(2, w / 5); k++) fillShape(c, ellipseP(cx + (rs() - 0.5) * rx * 1.2, base - 0.6 - rs() * ry * 0.5, 0.18, 0.18), css(0x2a2410, 0.7));
  // a few greasy bubbles
  for (let k = 0; k < Math.max(2, w / 5); k++) {
    const bx = cx + (r() - 0.5) * rx * 1.4, by = base - 0.8 - r() * ry * 0.75, br = 0.2 + r() * 0.35;
    c.beginPath(); c.arc(bx, by, br, 0, Math.PI * 2); c.strokeStyle = css(mix(pal.L, bile, 0.4), 0.5); c.lineWidth = 0.12; c.stroke();
  }
  if (o.extra?.startsWith("mother")) {
    // babies curled up inside her, half dissolved
    for (const [bx, by, s] of [[cx - rx * 0.5, base - 2.2, 1.6], [cx + rx * 0.45, base - 3.0, 1.4], [cx + 0.4, base - 1.4, 1.2]]) {
      fillShape(c, ellipseP(bx, by, s * 1.1, s * 0.8), css(mix(pal.L, bile, 0.5), 0.5));
      fillShape(c, ellipseP(bx + s * 0.3, by, s * 0.25, s * 0.25), css(gunk, 0.7));
    }
  }
  // elemental skins (Murat 2026-11-05): what each piece of the Gloam soaked up shows through its jelly
  const ex = o.extra;
  if (ex === "fire") {
    // a crust of black cinder plates floating on molten jelly, the cracks between them glowing
    const cr = rng(seed * 53 + 1);
    for (let k = 0; k < 9; k++) {
      const px = cx + (cr() - 0.5) * rx * 1.8, py = base - 0.6 - cr() * ry * 0.95, pr = 0.9 + cr() * rx * 0.22;
      const pts: P[] = [];
      for (let v = 0; v < 6; v++) { const a = v / 6 * Math.PI * 2 + cr() * 0.4; pts.push([px + Math.cos(a) * pr * (0.75 + cr() * 0.4), py + Math.sin(a) * pr * 0.65 * (0.75 + cr() * 0.4)]); }
      fillShape(c, poly(pts), css(0x231210, 0.92));
      line(c, [pts[0], pts[1], pts[2]], 0x4a2a20, 0.22, 0.8); // lit rim on the plate
    }
    glow(c, cx, base - ry * 0.35, rx * 0.9, 0xff8a2a, wind ? 0.55 : 0.32);
  } else if (ex === "frost") {
    // rime: white frost crusting over the top, frozen bubbles and a cold blue core
    const fr = rng(seed * 59 + 2);
    for (let k = 0; k < 16; k++) {
      const a = Math.PI * (1.05 + fr() * 0.9), d = 0.55 + fr() * 0.45;
      fillShape(c, ellipseP(cx + Math.cos(a) * rx * d, base - 0.2 + Math.sin(a) * ry * d, 0.35 + fr() * 0.5, 0.25 + fr() * 0.3), css(0xf4fbff, 0.75));
    }
    for (let k = 0; k < 4; k++) { const bx = cx + (fr() - 0.5) * rx, by = base - ry * (0.2 + fr() * 0.5); c.beginPath(); c.arc(bx, by, 0.3 + fr() * 0.4, 0, Math.PI * 2); c.strokeStyle = css(0xe8f8ff, 0.7); c.lineWidth = 0.14; c.stroke(); }
    glow(c, cx + rx * 0.1, base - ry * 0.35, rx * 0.6, 0x9fdcff, 0.3);
  } else if (ex === "venom") {
    // purple bruises and dark veins of poison running through it
    const vr = rng(seed * 61 + 3);
    for (let k = 0; k < 5; k++) {
      let x0 = cx + (vr() - 0.5) * rx * 1.4, y0 = base - vr() * ry * 0.3; const pts: P[] = [[x0, y0]];
      for (let v = 0; v < 4; v++) { x0 += (vr() - 0.5) * 1.6; y0 -= 0.6 + vr() * 0.9; pts.push([x0, y0]); }
      line(c, pts, 0x3a1440, 0.22, 0.7);
    }
    for (let k = 0; k < 6; k++) fillShape(c, ellipseP(cx + (vr() - 0.5) * rx * 1.6, base - vr() * ry * 0.9, 0.4 + vr() * 0.6, 0.3 + vr() * 0.4), css(0x6a2a6a, 0.3));
  } else if (ex === "storm") {
    // lightning trapped inside: a bright zigzag flickering through the jelly, a new shape every frame
    const lr = rng(seed * 67 + f * 7 + 4);
    for (let k = 0; k < 2; k++) {
      let x0 = cx - rx * 0.7 + lr() * rx * 0.3, y0 = base - ry * (0.2 + lr() * 0.5); const pts: P[] = [[x0, y0]];
      while (x0 < cx + rx * 0.7) { x0 += 0.8 + lr() * 1.0; y0 += (lr() - 0.5) * 1.6; pts.push([x0, Math.min(base - 0.5, Math.max(top + 1, y0))]); }
      line(c, pts, 0x8fa8ff, 0.55, 0.45); line(c, pts, 0xf6f8ff, 0.2, 0.95);
    }
    glow(c, cx, base - ry * 0.4, rx * 0.8, 0x8090f8, 0.35);
  }
  // dim rim light along the top-left edge
  c.beginPath(); dome(c); c.strokeStyle = css(mix(pal.L, bile, 0.3), 0.3); c.lineWidth = 0.5; c.translate(0.35, 0.35); c.stroke();
  c.restore();
  // pustules and warts swelling out of the skin
  const nP = Math.max(1, Math.round(w / 7));
  for (let k = 0; k < nP; k++) {
    const a = Math.PI * (1.15 + rs() * 0.7), d = 0.55 + rs() * 0.4;
    const px = cx + Math.cos(a) * rx * d, py = base - 0.2 + Math.sin(a) * ry * d, pr = 0.45 + rs() * Math.max(0.35, w / 20);
    fillShape(c, ellipseP(px, py, pr * 1.25, pr * 1.15), css(sh(bile, 0.7), 0.95));
    fillShape(c, ellipseP(px, py - pr * 0.15, pr, pr * 0.9), css(mix(0xd8cf6a, pal.L, 0.25), 0.95));
    fillShape(c, ellipseP(px - pr * 0.3, py - pr * 0.4, pr * 0.3, pr * 0.25), "rgba(255,255,230,0.85)");
  }
  // wet streaks instead of one clean shine
  for (let k = 0; k < 3; k++) {
    const hx = cx - rx * (0.55 - k * 0.22), hy = top + ry * (0.3 + k * 0.08);
    line(c, [[hx - rx * 0.08, hy + 0.15], [hx + rx * 0.08, hy - 0.15]], 0xf8f8e0, 0.25, 0.7 - k * 0.15);
  }
  // drips sliding down and hanging off the edge
  for (let k = 0; k < Math.max(2, Math.round(w / 6)); k++) {
    const dx = cx + (rs() - 0.5) * rx * 1.7, len = 0.8 + rs() * 1.2 + (f % 3) * 0.25;
    const dy = base - 0.3;
    limb(c, [dx, dy - len * 0.6], [dx + 0.05, dy + len * 0.45], 0.55, 0.35, bile);
    fillShape(c, ellipseP(dx + 0.05, dy + len * 0.5, 0.38, 0.45), css(mix(pal.L, bile, 0.3), 0.95));
  }
  // face: mismatched, bloodshot eyes and a drooling maw full of crooked teeth
  const ey = base - ry * 0.52, gap = Math.max(1, w / 6.5), es = Math.max(0.55, w / 18);
  const eye = (x: number, y: number, k: number, look: number) => {
    const s = es * k;
    fillShape(c, ellipseP(x, y, s * 1.05, s * 1.2), css(sh(gunk, 0.6)));
    fillShape(c, ellipseP(x, y, s * 0.92, s * 1.05), css(0xe6dfa8));
    if (s > 0.6) for (let v = 0; v < 3; v++) { const a = v * 2.1 + seed; line(c, [[x + Math.cos(a) * s * 0.9, y + Math.sin(a) * s], [x + Math.cos(a) * s * 0.35, y + Math.sin(a) * s * 0.4]], 0xc0392b, 0.1, 0.8); }
    fillShape(c, ellipseP(x + look * s * 0.3, y + s * 0.2, s * 0.42, s * 0.5), css(pal.E));
    fillShape(c, ellipseP(x + look * s * 0.3 - s * 0.15, y - s * 0.05, s * 0.13, s * 0.13), "rgba(255,255,240,0.9)");
    line(c, [[x - s, y - s * 0.75], [x + s, y - s * 0.95]], sh(gunk, 0.5), Math.max(0.25, s * 0.35), 0.9); // heavy lid
  };
  const maw = (mx: number, my: number, mw: number) => {
    const open = (wind ? 0.9 : strike ? 1.5 : 0.6) * es;
    const m = blobPath([[mx - mw, my], [mx - mw * 0.4, my - open * 0.3], [mx + mw * 0.5, my - open * 0.2], [mx + mw, my + open * 0.1], [mx + mw * 0.3, my + open], [mx - mw * 0.5, my + open * 0.8]]);
    fillShape(c, m, css(0x1e0a10));
    fillShape(c, ellipseP(mx, my + open * 0.7, mw * 0.45, open * 0.3), css(0x7a2633, 0.9)); // tongue
    for (let k = 0; k < 4; k++) { const tx = mx - mw * 0.7 + k * mw * 0.45; fillShape(c, poly([[tx - 0.22, my - open * 0.15], [tx + 0.22, my - open * 0.15], [tx + (k % 2 ? 0.1 : -0.05), my + open * (0.35 + (k % 3) * 0.12)]]), css(0xe8e0bc)); }
    limb(c, [mx + mw * 0.35, my + open * 0.8], [mx + mw * 0.4, my + open * 0.8 + 1.0 + (f % 2) * 0.4], 0.32, 0.18, mix(pal.L, 0xffffff, 0.3)); // drool
  };
  if (dir === "down") { eye(cx - gap, ey, 1.15, 0.6); eye(cx + gap * 1.05, ey + 0.25, 0.8, -0.4); maw(cx + 0.2, ey + es * 2.0, Math.max(0.9, gap * 0.85)); }
  else if (dir === "right") { eye(cx + rx * 0.52, ey, 1.05, 0.8); eye(cx + rx * 0.08, ey - 0.15, 0.75, 0.8); maw(cx + rx * 0.62, ey + es * 2.0, Math.max(0.7, gap * 0.6)); }
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
  } else if (x === "fire") {
    // flames licking up from the crown of its head, flickering per frame; it rears back to breathe them out
    const fl = rng(f * 13 + 5), n = 5;
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n, fx = cx - rx * 0.55 + u * rx * 1.1, fy = top + ry * 0.12 + Math.abs(u - 0.5) * ry * 0.5;
      const hgt = (1.6 + fl() * 1.6) * (1 - Math.abs(u - 0.5) * 0.9) * (wind ? 1.5 : 1), lean = (fl() - 0.5) * 0.8 - (dir === "right" ? 0.4 : 0);
      const tongue = blobPath([[fx - 0.7, fy + 0.4], [fx - 0.35, fy - hgt * 0.5], [fx + lean, fy - hgt], [fx + 0.4, fy - hgt * 0.45], [fx + 0.7, fy + 0.4]]);
      fillShape(c, tongue, css(0xe0461a, 0.95));
      fillShape(c, blobPath([[fx - 0.35, fy + 0.3], [fx + lean * 0.6, fy - hgt * 0.62], [fx + 0.35, fy + 0.3]]), css(0xffb347, 0.95));
      fillShape(c, ellipseP(fx, fy, 0.25, 0.3), css(0xfff0a8));
    }
    glow(c, cx, top, rx * 0.9, 0xff8a2a, 0.4);
    for (let k = 0; k < 3; k++) fillShape(c, ellipseP(cx + (fl() - 0.5) * rx * 1.4, top - 2 - fl() * 3, 0.22, 0.22), css(0xffd27a, 0.9)); // embers
  } else if (x === "frost") {
    // a crown of ice spikes growing out of its top, icicles hanging off the rim
    for (const [u, hgt, w2] of [[-0.55, 2.2, 0.9], [-0.15, 3.6, 1.1], [0.22, 2.9, 1.0], [0.55, 1.8, 0.8]] as const) {
      const bx = cx + u * rx, by = top + ry * (0.18 + Math.abs(u) * 0.35), tip: P = [bx + u * 0.9, by - hgt * (wind ? 1.2 : 1)];
      fillShape(c, poly([[bx - w2, by + 0.3], tip, [bx + w2, by + 0.3]]), css(0x9fd0f0, 0.96));
      fillShape(c, poly([[bx - w2, by + 0.3], tip, [bx - w2 * 0.1, by + 0.3]]), css(0xeaf8ff, 0.96)); // lit facet
      line(c, [[bx - w2 * 0.05, by + 0.2], tip], 0xffffff, 0.12, 0.9);
    }
    for (let k = 0; k < 4; k++) { const ix = cx - rx * 0.8 + k * rx * 0.5, iy = base - 0.4; fillShape(c, poly([[ix - 0.35, iy - 0.2], [ix + 0.35, iy - 0.2], [ix + 0.05, iy + 0.9 + (k % 2) * 0.5]]), css(0xdff4ff, 0.9)); }
    glow(c, cx - rx * 0.1, top - 1, rx * 0.7, 0xbfe8ff, 0.3);
  } else if (x === "venom") {
    // swollen poison sacs on its back, glowing green; they bulge when it is about to spit
    const sw = wind ? 1.35 : strike ? 0.8 : 1;
    for (const [u, v, r0] of [[-0.45, 0.25, 1.5], [0.35, 0.18, 1.8], [-0.02, 0.05, 1.2]] as const) {
      const sx2 = cx + u * rx, sy2 = top + ry * v + 0.8, r = r0 * sw * Math.max(0.8, w / 14);
      fillShape(c, ellipseP(sx2, sy2, r * 1.08, r), css(0x2a3e12, 0.95));
      fillShape(c, ellipseP(sx2, sy2 - 0.1, r * 0.95, r * 0.88), css(0x8fd13a, 0.92));
      line(c, [[sx2 - r * 0.6, sy2 + r * 0.2], [sx2 - r * 0.1, sy2 - r * 0.3], [sx2 + r * 0.4, sy2 + r * 0.1]], 0x3a5a14, 0.18, 0.8); // veins
      fillShape(c, ellipseP(sx2 - r * 0.35, sy2 - r * 0.4, r * 0.3, r * 0.22), "rgba(240,255,200,0.85)");
      glow(c, sx2, sy2, r * 1.8, 0x9be564, 0.25);
    }
    // a drip of venom off its lip
    if (dir !== "up") limb(c, [cx + 0.6, base - ry * 0.25], [cx + 0.7, base - ry * 0.25 + 1.2 + (f % 3) * 0.4], 0.35, 0.22, 0xb4e04e);
  } else if (x === "storm") {
    // hair of crackling static standing up on end, and sparks jumping off it
    const st = rng(f * 17 + 9);
    for (let k = 0; k < 6; k++) {
      const u = (k + 0.5) / 6 - 0.5, bx = cx + u * rx * 1.4, by = top + ry * (0.15 + Math.abs(u) * 0.6);
      const len = 1.4 + st() * 1.4 + (wind ? 0.8 : 0), pts: P[] = [[bx, by]];
      let px = bx, py = by;
      for (let v = 0; v < 3; v++) { px += u * 0.8 + (st() - 0.5) * 0.9; py -= len / 3; pts.push([px, py]); }
      line(c, pts, 0x4e4ac8, 0.45, 0.9); line(c, pts, 0xd8e0ff, 0.16, 0.95);
    }
    for (let k = 0; k < 3; k++) { const a = st() * Math.PI * 2, d = rx * (0.9 + st() * 0.4); const sx3 = cx + Math.cos(a) * d, sy3 = base - ry * 0.5 + Math.sin(a) * ry * 0.6;
      line(c, [[sx3, sy3], [sx3 + 0.5, sy3 - 0.4], [sx3 + 0.2, sy3 - 0.8], [sx3 + 0.8, sy3 - 1.2]], 0xf6f8ff, 0.2, 0.95); }
    glow(c, cx, top, rx * 0.8, 0x8090f8, 0.35);
  } else if (x === "mother1" || x === "mother3") {
    // a gold tiara with a ruby (tier 1), an iron spiked crown (tier 3)
    const iron = x === "mother3", tw = rx * 0.5, ty = top + 0.6;
    const pts: P[] = [[cx - tw, ty + 1], [cx - tw, ty - 1.2], [cx - tw * 0.5, ty - 0.2], [cx, ty - (iron ? 2.6 : 1.9)], [cx + tw * 0.5, ty - 0.2], [cx + tw, ty - 1.2], [cx + tw, ty + 1]];
    metal(c, (cc) => { cc.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) cc.lineTo(q[0], q[1]); cc.closePath(); }, iron ? 0x9aa3ad : 0xffc93c, [cx - tw, ty - 2], [cx + tw, ty + 1]);
    if (dir !== "up") { fillShape(c, ellipseP(cx, ty + 0.2, 0.55, 0.55), css(0xe63946)); glow(c, cx, ty + 0.2, 1.2, 0xe63946, 0.5); }
  }
}

// ---------------------------------------------------------------- crawling skeleton (BONES.crawlChance)
/**
 * The upper half of a broken skeleton dragging itself over the ground on its arms: skull low and forward,
 * ribcage and spine trailing back to a snapped end with loose vertebrae. Stand/step alternate the arms (one
 * reaches ahead and digs in, the other pulls under the chest); the wind-up rears the skull and one arm back,
 * the strike claws it forward. Facing right is a side view; down comes at the viewer, up crawls away.
 */
function crawlerFrame(c: C2, w: number, h: number, f: number) {
  const { dir, pose } = frameOf(f);
  const BONE = 0xd8d2bc, DARK = 0x2a2622, RAG = 0x3b3640, EYE = 0xff5a3c;
  const step = pose === "step", wind = pose === "wind", strike = pose === "strike";
  const g = h - 2.2; // ground line
  const sc = SH ?? c;
  const shadow = (x: number, y: number, rx: number, ry: number) => { sc.save(); sc.translate(x, y); sc.scale(1, ry / rx); sc.fillStyle = "rgba(0,0,0,0.4)"; sc.beginPath(); sc.arc(0, 0, rx, 0, Math.PI * 2); sc.fill(); sc.restore(); };
  const vert = (x: number, y: number, r: number) => { fillShape(c, ellipseP(x, y, r, r * 0.8), css(sh(BONE, 0.95))); fillShape(c, ellipseP(x - r * 0.25, y - r * 0.3, r * 0.45, r * 0.3), css(sh(BONE, 1.2), 0.8)); };
  const skull = (x: number, y: number, s: number, face: "side" | "front" | "back") => {
    fillShape(c, ellipseP(x, y, s * 1.05, s), css(sh(BONE, 0.55))); // outline
    fillShape(c, ellipseP(x, y - 0.1, s * 0.95, s * 0.9), css(BONE));
    fillShape(c, ellipseP(x - s * 0.3, y - s * 0.4, s * 0.45, s * 0.3), css(sh(BONE, 1.25), 0.9));
    if (face === "back") { line(c, [[x, y - s * 0.8], [x, y + s * 0.6]], sh(BONE, 0.7), 0.25, 0.7); return; }
    const ex = face === "side" ? [x + s * 0.45] : [x - s * 0.38, x + s * 0.38], ey = y - s * 0.05;
    for (const e of ex) { fillShape(c, ellipseP(e, ey, s * 0.27, s * 0.3), css(DARK)); glow(c, e, ey, s * 0.45, EYE, 0.55); fillShape(c, ellipseP(e, ey, s * 0.12, s * 0.12), css(EYE)); }
    const jx = face === "side" ? x + s * 0.55 : x, jy = y + s * 0.75, open = strike ? 0.5 : wind ? 0.35 : 0.15;
    fillShape(c, ellipseP(jx, jy + open * s * 0.4, s * (face === "side" ? 0.45 : 0.55), s * (0.22 + open * 0.3)), css(DARK));
    for (let k = -1; k <= 1; k++) line(c, [[jx + k * s * 0.22, jy - s * 0.05], [jx + k * s * 0.22, jy + s * 0.12]], 0xf0ead8, 0.22);
  };
  const ribs = (x0: number, y0: number, x1: number, y1: number, span: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, sp = span * (1 - t * 0.35);
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      line(c, [[x - nx * sp, y - ny * sp + 0.4], [x - nx * sp * 0.4, y - ny * sp * 0.4 - 0.3], [x, y]], sh(BONE, 0.85), 0.45);
      line(c, [[x + nx * sp, y + ny * sp + 0.4], [x + nx * sp * 0.4, y + ny * sp * 0.4 - 0.3], [x, y]], sh(BONE, 0.85), 0.45);
    }
  };
  const arm = (sx: number, sy: number, hx: number, hy: number, bend: number) => {
    const ex = (sx + hx) / 2 + bend * 0.6, ey = Math.min(sy, hy) - Math.abs(bend) * 0.9 - 0.6; // elbow up, like a push-up
    limb(c, [sx, sy], [ex, ey], 0.75, 0.6, BONE);
    limb(c, [ex, ey], [hx, hy], 0.6, 0.5, BONE);
    for (let k = -1; k <= 1; k++) line(c, [[hx, hy], [hx + 0.8 * Math.sign(hx - ex || 1) + k * 0.15, hy + 0.35 + k * 0.25]], sh(BONE, 1.05), 0.25); // finger bones
  };
  const lift = wind ? 1.4 : strike ? -0.3 : step ? 0.35 : 0; // how far it rears up
  if (dir === "right") {
    const hx = w - 6 + (strike ? 1.2 : 0), hy = g - 3.6 - lift; // skull
    const sx = hx - 3.2, sy = g - 2.4 - lift * 0.6; // shoulders
    const tx = 5.5, ty = g - 1.0; // snapped spine end
    shadow((tx + hx) / 2, g + 0.2, (hx - tx) / 2 + 2, 1.3);
    // loose vertebrae and a rag strip dragged behind
    vert(tx - 2.2, g - 0.4, 0.45); vert(tx - 3.6, g - 0.1, 0.35);
    line(c, [[tx + 1, ty - 0.6], [tx - 1.5, g - 0.2], [tx - 3, g + 0.1]], RAG, 0.9, 0.9);
    // far arm (behind the chest), then spine, ribs, near arm in front
    const far = step ? [sx + 3.6, g - 0.1] : [sx + 1.2, g];
    arm(sx - 0.3, sy - 0.4, far[0], far[1], 0.4);
    for (let k = 0; k <= 6; k++) { const t = k / 6; vert(tx + (sx - tx) * t, ty + (sy - ty) * t - Math.sin(t * Math.PI) * 0.6, 0.55 - t * 0.1); }
    ribs(sx - 4.6, sy - 0.5, sx - 0.3, sy - 0.8, 1.5, 4);
    fillShape(c, ellipseP(sx - 2.6, sy - 0.9, 2.6, 1.6), css(RAG, 0.55)); // tatters over the back
    const near = wind ? [sx - 1.5, sy - 2.6] : strike ? [hx + 3.4, g - 0.6] : step ? [sx + 1.0, g + 0.2] : [sx + 3.8, g + 0.1];
    arm(sx + 0.2, sy, near[0], near[1], wind ? -0.6 : 0.5);
    limb(c, [sx + 0.2, sy - 0.2], [hx - 1.1, hy + 0.7], 0.7, 0.55, BONE); // neck
    skull(hx, hy, 1.75, "side");
  } else {
    const toward = dir === "down", s = toward ? 1 : -1, cx = w / 2;
    const hy = toward ? g - 2.6 - lift : g - 7.6 - lift * 0.5; // skull nearest the viewer when coming down
    const shY = toward ? g - 4.4 - lift * 0.6 : g - 5.6, endY = toward ? g - 9.6 : g - 0.8;
    shadow(cx, (shY + endY) / 2 + (toward ? 3 : 0.5), 4.6, 2.2);
    if (!toward) { skull(cx, hy, 1.7, "back"); } // crawling away: its head is beyond the shoulders
    // spine trailing back (up the screen when it comes toward us), snapped at the end
    for (let k = 0; k <= 5; k++) { const t = k / 5; vert(cx + Math.sin(t * 3 + f) * 0.25, shY + (endY - shY) * t, 0.55 - t * 0.12); }
    vert(cx + 1.6, endY + 1.4 * s * -1 + (toward ? -1 : 1.2), 0.38);
    ribs(cx, shY + (endY - shY) * 0.15, cx, shY + (endY - shY) * 0.7, 2.6, 4);
    if (!toward) { fillShape(c, ellipseP(cx - 1.4, shY + 0.4, 1.4, 0.8), css(sh(BONE, 0.9))); fillShape(c, ellipseP(cx + 1.4, shY + 0.4, 1.4, 0.8), css(sh(BONE, 0.9))); } // shoulder blades
    fillShape(c, ellipseP(cx + 0.6, shY + (endY - shY) * 0.45, 2.2, 1.6), css(RAG, 0.5));
    // arms reach out to either side and claw the ground ahead, alternating
    const reachL = (step ? 1 : 0) + (wind ? -1.2 : 0), reachR = (step ? 0 : 1) + (strike ? 1.6 : 0);
    const ahead = toward ? 1 : -1, gy = (r: number) => (toward ? g - 1.6 + Math.min(1, r) * 1.2 : shY - 1.4 - r * 1.8);
    arm(cx - 2.2, shY, cx - 4.8 - reachL * 0.4, gy(reachL) + (wind ? -2.4 : 0), -0.8 * ahead);
    arm(cx + 2.2, shY, cx + 4.8 + reachR * 0.4, gy(reachR) - (strike ? 0.8 : 0), 0.8 * ahead);
    if (toward) skull(cx, hy, 1.85, "front");
  }
}

// ---------------------------------------------------------------- the Sunscar's dune scorpion (Act 2)
/**
 * A giant desert scorpion, about as long as a man is tall: amber-brown plates, two heavy pincers, eight legs, and the
 * segmented tail curled over its back with a black sting and a drop of green venom. Wind-up: claws open, tail cocked
 * back; strike: the sting stabs forward over its head. Drawn in world px on a w x h frame, feet on the line g.
 */
function scorpionFrame(c: C2, w: number, h: number, f: number) {
  const { dir, pose } = frameOf(f);
  const SHELL = 0x8a4220, DARK = 0x3a2412, PALE = 0xe0a070, STING = 0x24160c, VENOM = 0x9dff6a, EYE = 0xffb030;
  const step = pose === "step", wind = pose === "wind", strike = pose === "strike";
  const g = h - 3, sc = SH ?? c;
  const shadow = (x: number, y: number, rx: number, ry: number) => { sc.save(); sc.translate(x, y); sc.scale(1, ry / rx); sc.fillStyle = "rgba(0,0,0,0.42)"; sc.beginPath(); sc.arc(0, 0, rx, 0, Math.PI * 2); sc.fill(); sc.restore(); };
  /** One chitin plate: dark rim, lit body, a pale glint along the top. */
  const plate = (x: number, y: number, rx: number, ry: number, col = SHELL, rot = 0) => {
    fillShape(c, ellipseP(x, y, rx + 0.35, ry + 0.35, rot), css(sh(col, 0.32)));
    vol(c, ellipseP(x, y, rx, ry, rot), col, [x - rx, y - ry, rx * 2, ry * 2], { ao: 0.3, spec: 0.35 });
    line(c, [[x - rx * 0.5, y - ry * 0.55], [x + rx * 0.3, y - ry * 0.7]], PALE, 0.22, 0.55);
  };
  /** A jointed leg from the body to the sand: up to a knee, down to a pointed foot. */
  const leg = (bx: number, by: number, kx: number, ky: number, fx: number, fy: number, far: boolean) => {
    const col = far ? sh(SHELL, 0.6) : SHELL;
    limb(c, [bx, by], [kx, ky], 0.75, 0.6, col);
    limb(c, [kx, ky], [fx, fy], 0.6, 0.25, col);
    fillShape(c, ellipseP(kx, ky, 0.38, 0.38), css(sh(col, 0.5)));
  };
  /** A pincer: arm to the wrist, then a fat claw with two fingers (open on the wind-up). */
  const pincer = (sx: number, sy: number, ex: number, ey: number, cx: number, cy: number, ang: number, far: boolean) => {
    const col = far ? sh(SHELL, 0.7) : SHELL, open = wind ? 0.75 : strike ? 0.1 : 0.3;
    limb(c, [sx, sy], [ex, ey], 1.1, 0.9, col);
    limb(c, [ex, ey], [cx, cy], 0.9, 1.2, col);
    const ux = Math.cos(ang), uy = Math.sin(ang);
    plate(cx + ux * 1.2, cy + uy * 1.2, 1.9, 1.25, col, ang);
    for (const k of [-1, 1]) {
      const a = ang + k * open, tx = cx + ux * 2.6 + Math.cos(a) * 2.4, ty = cy + uy * 2.6 + Math.sin(a) * 2.4;
      limb(c, [cx + ux * 2.4 + -uy * k * 0.5, cy + uy * 2.4 + ux * k * 0.5], [tx, ty], 0.75, 0.2, k < 0 ? sh(col, 1.1) : sh(col, 0.85));
    }
  };
  /** The tail: a chain of shrinking segments along a curve, then the bulb and the hooked sting. */
  const tail = (pts: P[], sx: number, sy: number, ang: number) => {
    const L = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) + Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
    const n = Math.max(6, Math.ceil(L / 1.7));
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), u = 1 - t;
      const x = u * u * pts[0][0] + 2 * u * t * pts[1][0] + t * t * pts[2][0], y = u * u * pts[0][1] + 2 * u * t * pts[1][1] + t * t * pts[2][1];
      plate(x, y, 1.35 - t * 0.35, 1.15 - t * 0.3);
    }
    plate(sx, sy, 1.3, 1.1, sh(SHELL, 1.1)); // the venom bulb
    const tx = sx + Math.cos(ang) * 2.4, ty = sy + Math.sin(ang) * 2.4;
    limb(c, [sx, sy], [tx, ty], 0.8, 0.15, STING);
    glow(c, tx, ty, 1.4, VENOM, strike ? 0.9 : 0.5);
    fillShape(c, ellipseP(tx, ty + 0.4, 0.28, 0.38), css(VENOM, 0.9));
  };
  const eyes = (pts: P[]) => { for (const [x, y] of pts) { glow(c, x, y, 1.1, EYE, 0.6); fillShape(c, ellipseP(x, y, 0.28, 0.28), css(mix(EYE, 0xffffff, 0.3))); } };
  const sw = step ? 1 : -1; // legs alternate on the step frame

  if (dir === "right") {
    const bx = w * 0.56 + (strike ? 0.8 : 0), by = g - 4.2;
    shadow(bx - 2, g + 0.2, 13, 2.4);
    // far legs, then the far pincer
    for (let i = 0; i < 4; i++) { const x = bx - 3.6 + i * 2.2, o = (i % 2 ? 1 : -1) * sw * 0.7; leg(x, by - 0.4, x + 1.4 + o * 0.3, by - 2.4, x + 3.0 + o, g - 1.0, true); }
    pincer(bx + 4.2, by - 0.6, bx + 7.4, by - 1.6, bx + 9.6 + (strike ? 1.4 : 0), by - 0.9, -0.1, true);
    // abdomen plates back from the head, then the tail up over the back
    for (let i = 0; i < 5; i++) plate(bx - 1.6 - i * 2.2, by - 0.2 + i * 0.15, 2.5 - i * 0.18, 2.1 - i * 0.12);
    const rx = bx - 11.6, ry = by - 0.4;
    if (strike) tail([[rx, ry], [rx - 3, by - 16], [bx + 4, by - 12]], bx + 5.4, by - 10.6, 0.55);
    else if (wind) tail([[rx, ry], [rx - 5, by - 14], [rx + 2, by - 17]], rx + 3.6, by - 16.4, 0.9);
    else tail([[rx, ry], [rx - 4, by - 13], [rx + 4, by - 16]], rx + 5.6 + (step ? 0.3 : 0), by - 15.2, 1.2);
    // head plate, eyes, near legs and the near pincer in front
    plate(bx + 2.4, by - 0.6, 3.6, 2.6);
    eyes([[bx + 3.6, by - 2.6], [bx + 4.6, by - 2.2]]);
    for (let i = 0; i < 4; i++) { const x = bx - 4.4 + i * 2.2, o = (i % 2 ? -1 : 1) * sw * 0.7; leg(x, by + 0.6, x + 1.0 + o * 0.3, by - 1.0, x + 2.0 + o, g + 0.4, false); }
    pincer(bx + 3.8, by + 0.6, bx + 6.6, by + 1.4, bx + 9.0 + (strike ? 1.6 : 0), by + 0.6, 0.05, false);
  } else if (dir === "down") {
    const cx = w / 2, hy = g - 4.6 + (strike ? 0.6 : 0); // head nearest us
    shadow(cx, g - 4, 11, 4);
    // legs splay out on both sides
    for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) {
      const y = hy - 2.6 - i * 1.6, o = (i % 2 ? 1 : -1) * sw * sd * 0.6;
      leg(cx + sd * 2.4, y, cx + sd * (5.2 + i * 0.4), y - 1.6, cx + sd * (7.4 + i * 0.6), y + 2.2 + o, true);
    }
    // abdomen up the screen, then the tail rising behind it and curling forward over the head
    for (let i = 3; i >= 0; i--) plate(cx, hy - 3.6 - i * 2.0, 2.7 - i * 0.2, 1.8 - i * 0.1);
    const ty0 = hy - 10.6;
    if (strike) tail([[cx, ty0], [cx, ty0 - 8], [cx + 0.3, ty0 - 2]], cx + 0.4, hy - 6.4, Math.PI / 2);
    else if (wind) tail([[cx, ty0], [cx + 0.4, ty0 - 7], [cx + 0.4, ty0 - 10.5]], cx + 0.4, ty0 - 11.6, -Math.PI / 2 + 0.6);
    else tail([[cx, ty0], [cx + 0.3, ty0 - 8], [cx + 0.3, ty0 - 9]], cx + 0.3, ty0 - 7.6 + (step ? 0.4 : 0), Math.PI / 2);
    plate(cx, hy, 3.4, 2.4);
    eyes([[cx - 1.0, hy - 0.7], [cx + 1.0, hy - 0.7]]);
    for (const sd of [-1, 1]) pincer(cx + sd * 2.6, hy + 0.4, cx + sd * 5.4, hy + 1.2, cx + sd * 5.0, hy + 3.4 + (strike ? 0.8 : 0), Math.PI / 2 - sd * 0.25, false);
  } else { // up: walking away, the tail nearest us
    const cx = w / 2, hy = g - 12.2;
    shadow(cx, g - 5, 11, 4);
    for (const sd of [-1, 1]) pincer(cx + sd * 2.4, hy - 0.4, cx + sd * 5.2, hy - 1.4, cx + sd * 4.8, hy - 3.6 - (strike ? 0.8 : 0), -Math.PI / 2 + sd * 0.25, true);
    for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) {
      const y = hy + 1.6 + i * 1.6, o = (i % 2 ? 1 : -1) * sw * sd * 0.6;
      leg(cx + sd * 2.4, y, cx + sd * (5.2 + i * 0.4), y - 1.6, cx + sd * (7.4 + i * 0.6), y + 2.2 + o, false);
    }
    plate(cx, hy, 3.4, 2.4);
    for (let i = 0; i < 4; i++) plate(cx, hy + 2.6 + i * 2.0, 2.7 - i * 0.2, 1.8 - i * 0.1);
    const ty0 = hy + 10.8;
    if (strike) tail([[cx, ty0], [cx, ty0 - 14], [cx, hy - 6]], cx, hy - 7.0, -Math.PI / 2);
    else if (wind) tail([[cx, ty0], [cx + 0.3, ty0 - 8], [cx + 0.3, ty0 - 14]], cx + 0.3, ty0 - 15.5, -Math.PI / 2 - 0.4);
    else tail([[cx, ty0], [cx + 0.3, ty0 - 9], [cx + 0.3, ty0 - 15]], cx + 0.3, ty0 - 16.0 + (step ? 0.4 : 0), -Math.PI / 2 + 0.5);
  }
}

function blobSheet(key: string, w: number, h: number, pal: BlobPal, o: BlobOpts): Sheet {
  return { key, w, h, draw: (c, f) => blobFrame(c, w, h, pal, o, f) };
}


/**
 * Champions (shared/champions.ts): one painted detail per affix, drawn by the client over any monster of the family
 * (client/src/championFx.ts), 20x20 world px, 2 frames (a flicker, a drip). "head" details sit on top of the head
 * (their foot at y 15), "body" ones on the chest (centred), "feet" ones on the ground (their foot at y 18).
 */
export const CHAMP_W = 20, CHAMP_H = 20;
function champOverlay(c: C2, k: AffixKey, f: number) {
  const cx = 10, t = f % 2;
  const bone = 0xe8e0c8, boneD = 0x8a7c60, iron = 0x6a6e78, wood = 0x8a5a2a, gold = 0xffc830, sand = 0xe0b868;
  switch (k) {
    case "risen": { // a crown of bones, its eye-sockets lit with the necromancer's purple
      glow(c, cx, 12, 6, 0xa070ff, 0.5 + t * 0.2);
      fillShape(c, ellipseP(cx, 14, 5.6, 1.6), css(boneD));
      vol(c, ellipseP(cx, 13.6, 5.2, 1.3), bone, [cx - 5, 12.3, 10.4, 2.6], { ao: 0.25 });
      for (const [dx, hgt] of [[-4.2, 3.2], [-2.1, 4.6], [0, 6], [2.1, 4.6], [4.2, 3.2]] as P[]) {
        limb(c, [cx + dx, 13.4], [cx + dx * 1.08, 13.4 - hgt], 0.85, 0.3, bone);
        fillShape(c, ellipseP(cx + dx * 1.08, 13.4 - hgt, 0.55, 0.55), css(bone));
      }
      fillShape(c, ellipseP(cx, 10.2, 1.1, 1.2), css(0xf4f0e0)); // a small skull at the front
      for (const ex of [-0.45, 0.45]) fillShape(c, ellipseP(cx + ex, 10.1, 0.28, 0.32), css(mix(0xa070ff, 0xffffff, t * 0.4)));
      break;
    }
    case "siege": { // a hammer and a ballista bolt crossed on its back, a dented iron cap
      limb(c, [cx - 6, 15], [cx + 5, 4], 0.7, 0.6, wood);
      fillShape(c, poly([[cx + 5.6, 2.6], [cx + 7.2, 4.2], [cx + 4.6, 4.8]]), css(iron));
      limb(c, [cx + 6, 15], [cx - 4, 5], 0.6, 0.6, wood);
      vol(c, poly([[cx - 6.4, 3.4], [cx - 2.4, 3.4], [cx - 2.4, 6.2], [cx - 6.4, 6.2]]), iron, [cx - 6.4, 3.4, 4, 2.8], { spec: 0.5 });
      vol(c, ellipseP(cx, 13.5, 4.6, 2.6), iron, [cx - 4.6, 11, 9.2, 5], { spec: 0.4, ao: 0.3 });
      line(c, [[cx - 4.4, 14.6], [cx + 4.4, 14.6]], sh(iron, 0.6), 0.6);
      fillShape(c, ellipseP(cx + 1.6, 12.6, 0.7, 0.5), css(sh(iron, 0.5))); // the dent
      break;
    }
    case "gang": { // the Redfang ringleader's red plume on a band of red cloth
      fillShape(c, ellipseP(cx, 14, 5.2, 1.5), css(0xb01818));
      line(c, [[cx + 4.6, 14], [cx + 7, 16.2 + t * 0.4]], 0xb01818, 0.9);
      line(c, [[cx + 4.6, 14.4], [cx + 6.2, 17.4 - t * 0.3]], 0x901010, 0.8);
      for (let i = 0; i < 6; i++) {
        const a = -1.9 + i * 0.12 + t * 0.05, L = 5.5 - i * 0.4;
        limb(c, [cx - 1, 13.4], [cx - 1 + Math.cos(a) * L * 0.5, 13.4 + Math.sin(a) * L], 1.1 - i * 0.12, 0.2, i % 2 ? 0xff3030 : 0xd82020);
      }
      fillShape(c, ellipseP(cx - 1, 13.6, 0.9, 0.9), css(gold));
      break;
    }
    case "sunborn": { // the second sun's brand: a small burning disc floating over its head, rays flickering
      glow(c, cx, 5.5, 5.5, gold, 0.6);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + t * 0.16, r0 = 2.8, r1 = i % 2 ? 4.6 : 5.6 + t * 0.5;
        limb(c, [cx + Math.cos(a) * r0, 5.5 + Math.sin(a) * r0], [cx + Math.cos(a) * r1, 5.5 + Math.sin(a) * r1], 0.7, 0.12, i % 2 ? 0xff9a20 : gold);
      }
      vol(c, ellipseP(cx, 5.5, 2.6, 2.6), 0xffd860, [cx - 2.6, 2.9, 5.2, 5.2], { spec: 0.6 });
      fillShape(c, ellipseP(cx, 5.5, 1.3, 1.3), css(0xfff6c8));
      break;
    }
    case "veil": { // a Veil Token on a cord, and the veil it unfolds
      fillShape(c, poly([[cx - 6, 15], [cx - 3, 6], [cx + 3, 6], [cx + 6, 15], [cx + 2, 13.6 + t * 0.6], [cx - 2, 14.2 - t * 0.6]]), css(0x7060c0, 0.6));
      line(c, [[cx - 3, 6.4], [cx + 3, 6.4]], 0xb4a4ff, 0.5);
      glow(c, cx, 4.4, 3.4, 0xb4a4ff, 0.5 + t * 0.25);
      vol(c, ellipseP(cx, 4.4, 2.1, 2.1), 0xd8c070, [cx - 2.1, 2.3, 4.2, 4.2], { spec: 0.6 });
      fillShape(c, poly([[cx - 1.3, 4.6], [cx, 3.2], [cx + 1.3, 4.6], [cx, 5.3]]), css(0x4a3a90)); // the veiled sun on it
      break;
    }
    case "split": { // a glowing seam down the middle where it is about to part, bubbles along it
      glow(c, cx, 10, 6, 0x8dff5a, 0.45);
      line(c, [[cx, 3], [cx - 1.2, 6.5], [cx + 1, 10], [cx - 0.8, 13.5], [cx, 17]], 0x2a6a1a, 1.4);
      line(c, [[cx, 3], [cx - 1.2, 6.5], [cx + 1, 10], [cx - 0.8, 13.5], [cx, 17]], 0xd6ffb0, 0.6);
      for (const [dx, y, r] of [[1.8, 5.5 + t, 0.9], [-2, 9.5 - t, 1.1], [1.6, 13 + t * 0.6, 0.8]] as [number, number, number][]) {
        vol(c, ellipseP(cx + dx, y, r, r), 0xa8ff80, [cx + dx - r, y - r, r * 2, r * 2], { spec: 0.8 });
      }
      break;
    }
    case "stitched": { // hide sewn on with coarse black thread: a seam across it and a raw red edge
      const seam: P[] = [[cx - 5.5, 7], [cx - 2.5, 9.2], [cx + 0.5, 8.4], [cx + 3.5, 10.6], [cx + 5.5, 9.6]];
      line(c, seam, 0x2a1a10, 0.5);
      line(c, seam.map(([x, y]) => [x, y + 0.6] as P), 0xc03a20, 0.35, 0.7 + t * 0.2); // raw skin under the seam
      for (let i = 0; i < seam.length - 1; i++) for (let j = 0; j <= 1; j++) {
        const [ax, ay] = seam[i], [bx, by] = seam[i + 1], u = 0.25 + j * 0.5, x = ax + (bx - ax) * u, y = ay + (by - ay) * u;
        line(c, [[x - 0.8, y - 1.1], [x + 0.8, y + 1.1]], 0xf0e0c0, 0.35); line(c, [[x - 0.8, y + 1.1], [x + 0.8, y - 1.1]], 0xf0e0c0, 0.35);
      }
      line(c, [[cx + 1, 12.5], [cx + 3.4, 15]], 0x2a1a10, 0.45); // a second, shorter seam
      for (const u of [0.3, 0.75]) { const x = cx + 1 + 2.4 * u, y = 12.5 + 2.5 * u; line(c, [[x - 0.8, y + 0.7], [x + 0.8, y - 0.7]], 0xf0e0c0, 0.35); }
      break;
    }
    case "deepvenom": { // old venom runes glowing on its shell, a drop forming
      glow(c, cx, 10, 6, 0x9dff6a, 0.35 + t * 0.15);
      line(c, [[cx - 4, 8], [cx - 2, 6], [cx, 8], [cx + 2, 6], [cx + 4, 8]], 0x9dff6a, 0.6);
      line(c, [[cx - 3, 11], [cx + 3, 11]], 0x9dff6a, 0.6);
      line(c, [[cx, 9.4], [cx, 13]], 0x9dff6a, 0.6);
      fillShape(c, blobPath([[cx + 3.6, 12.4], [cx + 4.4, 14 + t * 1.4], [cx + 3.6, 15 + t * 1.6], [cx + 2.8, 14 + t * 1.4]]), css(0xb8ff80, 0.95));
      break;
    }
    case "brand": { // the Circle's veiled sun burned into it, still hot
      glow(c, cx, 10, 3.6, 0xff9830, 0.5 + t * 0.25);
      line(c, [[cx - 2, 10.6], [cx - 1.2, 8.8], [cx + 1.2, 8.8], [cx + 2, 10.6]], mix(0xffb040, 0xffffff, t * 0.3), 0.55); // the veil
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; line(c, [[cx + Math.cos(a) * 2.4, 10 + Math.sin(a) * 2.4], [cx + Math.cos(a) * 3.3, 10 + Math.sin(a) * 3.3]], 0xff9830, 0.5); }
      line(c, [[cx - 1.4, 11.4], [cx + 1.4, 11.4]], 0xffd080, 0.5);
      break;
    }
    case "taint": { // it oozes: a puddle at its feet and drips falling into it
      fillShape(c, ellipseP(cx, 17, 8.5, 2.4), css(0x4aa02a, 0.85));
      fillShape(c, ellipseP(cx - 1.5, 16.6, 4.5, 1.1), css(0xa8ff80, 0.7));
      for (const [dx, y] of [[-4, 9 + t * 3], [3, 11 + (1 - t) * 3], [0.5, 6 + t * 4]] as P[]) {
        fillShape(c, blobPath([[cx + dx, y - 1.2], [cx + dx + 0.7, y + 0.4], [cx + dx, y + 1], [cx + dx - 0.7, y + 0.4]]), css(0x8dff5a, 0.95));
      }
      break;
    }
    case "buried": { // sand pouring off it into a little dune round its feet
      for (const [dx, w] of [[-4.5, 0.6], [4.2, 0.55]] as P[]) {
        line(c, [[cx + dx, 10 + t], [cx + dx + 0.3, 13.5 + t], [cx + dx - 0.2, 16.5]], sand, w, 0.85);
        for (let y = 10.5 + t * 1.5; y < 16; y += 2.5) fillShape(c, ellipseP(cx + dx + 0.5, y, 0.3, 0.3), css(0xfff0c0));
      }
      vol(c, blobPath([[cx - 9, 18.6], [cx - 5, 16.8], [cx, 16.2], [cx + 5, 16.8], [cx + 9, 18.6]]), sand, [cx - 9, 16.2, 18, 2.4], { ao: 0.3 });
      fillShape(c, ellipseP(cx - 3, 17.4, 2.4, 0.4), css(0xfff0c8, 0.6));
      break;
    }
  }
}

export function buildMobs(out: string, ONLY?: string[]) {
  mkdirSync(out, { recursive: true });
  setPainted(true, PK);
  const sheets: Sheet[] = [
    blobSheet("mob_slime", 12, 16, { G: 0x6cc35c, L: 0xc8f5b8, D: 0x2f7a32, E: 0x14301a }, { bodyH: 9 }),
    blobSheet("mob_blobling", 8, 10, { G: 0x9ade63, L: 0xf0ffd8, D: 0x4f8e30, E: 0x14301a }, { bodyH: 6, seed: 5 }),
    blobSheet("mob_shooterblob", 14, 18, { G: 0x9068cc, L: 0xe2ccff, D: 0x4e2f80, E: 0x1e0f33 }, { bodyH: 10, extra: "shooter" }),
    blobSheet("mob_warriorblob", 16, 18, { G: 0xd0543a, L: 0xffb59e, D: 0x7f2a19, E: 0x2a0d06 }, { bodyH: 10, extra: "warrior" }),
    blobSheet("mob_healerblob", 14, 18, { G: 0xf0c6de, L: 0xffffff, D: 0xb57a9b, E: 0x3a1a2e }, { bodyH: 10, extra: "healer" }),
    // the elemental blobs of the eastern wilds (Murat 2026-11-05)
    blobSheet("mob_venomblob", 14, 18, { G: 0x7aa82e, L: 0xe0ff9a, D: 0x34501a, E: 0x1a0a20 }, { bodyH: 10, extra: "venom", seed: 21 }),
    blobSheet("mob_frostblob", 16, 20, { G: 0x86bfe6, L: 0xf2fcff, D: 0x2f5f8f, E: 0x0e1a2c }, { bodyH: 11, extra: "frost", seed: 22 }),
    blobSheet("mob_fireblob", 16, 20, { G: 0xd8521e, L: 0xffd27a, D: 0x6a1a08, E: 0x1a0604 }, { bodyH: 11, extra: "fire", seed: 23 }),
    blobSheet("mob_stormblob", 14, 18, { G: 0x6a6ad8, L: 0xd8e0ff, D: 0x26206e, E: 0x0a0820 }, { bodyH: 10, extra: "storm", seed: 24 }),
    blobSheet("mob_motherblob", 24, 22, { G: 0x3a9684, L: 0xb8f2e0, D: 0x1c5448, E: 0x10302a }, { bodyH: 17, extra: "mother1", seed: 9 }),
    blobSheet("mob_motherblob2", 24, 22, { G: 0x2c8796, L: 0xb0eef5, D: 0x184c56, E: 0x0b2a30 }, { bodyH: 17, extra: "mother2", seed: 10 }),
    blobSheet("mob_motherblob3", 24, 22, { G: 0x553b96, L: 0xd3c2ff, D: 0x2f205f, E: 0x140a2a }, { bodyH: 17, extra: "mother3", seed: 11 }),
    // the Summoner's golems (Murat 2026-11-07: style 2, bodies made of the element), and the Colossus they fuse into
    ...(["fire", "cold", "poison", "shock"] as GolemElement[]).flatMap((el, i) => [
      { key: `mob_golem_${el}`, w: GOLEM_W, h: GOLEM_H, draw: (c: C2, f: number) => { const { dir, pose } = frameOf(f); paintGolemFrame(c, "elemental", el, dir as GolemDir, pose, 7 + i, SH ?? undefined); } },
      { key: `mob_golem_colossus_${el}`, w: GOLEM_W, h: GOLEM_H, draw: (c: C2, f: number) => { const { dir, pose } = frameOf(f); paintGolemFrame(c, "elemental", el, dir as GolemDir, pose, 31 + i, SH ?? undefined); } },
    ]),
    // the Summoner's elemental wisps (wisps.ts): small orbs floating above their shadow
    ...(["fire", "cold", "poison", "shock"] as WispElement[]).map((el) => ({
      key: `mob_wisp_${el}`, w: WISP_W, h: WISP_H,
      draw: (c: C2, f: number) => { const { dir, pose } = frameOf(f); paintWisp(c, SH, el, dir as "down" | "up" | "right", pose, f); },
    })),
    // humanoids get taller frames than the pixel ones, about hero height (client: PAINTED_LOOK in textures.ts)
    humanoid("mob_skeleton", "skeleton", 20, 30, 27.5 / 30, 0.85),
    humanoid("mob_skeleton_axe", "skeleton_axe", 20, 30, 27.5 / 30, 0.85),
    humanoid("mob_skeleton_spear", "skeleton_spear", 32, 30, 27.5 / 30, 0.85),
    humanoid("mob_skeleton_bow", "skeleton_bow", 20, 30, 27.5 / 30, 0.85),
    humanoid("mob_bandit", "bandit", 20, 30, 27.5 / 30, 0.85),
    humanoid("mob_bandit_brute", "bandit_brute", 24, 30, 27.5 / 30, 0.9),
    humanoid("mob_bandit_archer", "bandit_archer", 20, 30, 27.5 / 30, 0.85),
    humanoid("mob_banditchief", "banditchief", 28, 34, 32 / 34, 0.95),
    humanoid("mob_skeletonmage", "skeletonmage", 24, 32, 31.2 / 32, 0.93),
    humanoid("mob_necromancer", "necromancer", 24, 32, 31.2 / 32, 0.93),
    humanoid("mob_bride", "bride", 20, 30, 27.5 / 30, 0.85),
    humanoid("mob_demon", "demon", 28, 34, 33 / 34, 1.0, true),
    humanoid("mob_hollowking", "hollowking", 44, 48, 42 / 48, 1.25),
    // the beast-folk of the Mawdeep Warrens (look.ts gnawkin..hidemother): elites and the boss drawn bigger
    humanoid("mob_gnawkin", "gnawkin", 20, 30, 27.5 / 30, 0.82),
    humanoid("mob_tuskborn", "tuskborn", 26, 32, 29.5 / 32, 0.95),
    humanoid("mob_silkwretch", "silkwretch", 20, 30, 27.5 / 30, 0.86),
    humanoid("mob_duskwing", "duskwing", 32, 38, 36 / 38, 0.88, false, 7),
    // the half-folk variants (Mob.weapon "folk"), the crow-folk seers that fly and cast, and the mini-bosses
    humanoid("mob_gnawkin_folk", "gnawkin_folk", 24, 30, 27.5 / 30, 0.82),
    humanoid("mob_tuskborn_folk", "tuskborn_folk", 26, 32, 29.5 / 32, 0.95),
    humanoid("mob_silkwretch_folk", "silkwretch_folk", 30, 30, 27.5 / 30, 0.86),
    humanoid("mob_duskwing_folk", "duskwing_folk", 32, 38, 36 / 38, 0.88, false, 7),
    humanoid("mob_crowseer", "crowseer", 32, 40, 38 / 40, 0.9, false, 8),
    humanoid("mob_gnasher", "gnasher", 34, 38, 35.5 / 38, 1.15),
    humanoid("mob_weaver", "weaver", 42, 40, 37.5 / 40, 1.15),
    humanoid("mob_packlord", "packlord", 30, 36, 34 / 36, 1.08),
    humanoid("mob_hornbrute", "hornbrute", 40, 40, 37.5 / 40, 1.2),
    humanoid("mob_hidemother", "hidemother", 44, 48, 44 / 48, 1.32),
    // Act 2, the Sunscar (look.ts nomad..camelfolk) and its giant scorpion (scorpionFrame)
    humanoid("mob_nomad", "nomad", 22, 30, 27.5 / 30, 0.86),
    humanoid("mob_nomad_folk", "nomad_folk", 22, 30, 27.5 / 30, 0.86),
    humanoid("mob_sanddead", "sanddead", 22, 30, 27.5 / 30, 0.88),
    humanoid("mob_veiled", "veiled", 24, 32, 31.2 / 32, 0.93),
    humanoid("mob_camelfolk", "camelfolk", 34, 36, 33.5 / 36, 1.08),
    humanoid("mob_sphinx", "sphinx", 40, 40, 36.5 / 40, 1.12), // winged: a wider, taller frame
    humanoid("mob_sunwright", "sunwright", 44, 48, 42 / 48, 1.25), // Act 2's final boss, drawn big like the Hollow King
    { key: "mob_scorpion", w: 36, h: 30, draw: (c: C2, f: number) => scorpionFrame(c, 36, 30, f) },
    // the Night Raiders (raiders.ts): one sheet for each of the Seven
    ...RAIDERS.map((R) => ({ key: `mob_nightraider_${R.key}`, w: RAIDER_W, h: RAIDER_H, draw: (c: C2, f: number) => { const { dir, pose } = frameOf(f); paintRaider(c, SH, R, dir as "down" | "up" | "right", pose, f); } })),
    // champion details (shared/champions.ts): one small painted sheet per affix, laid over the monster by the client
    ...AFFIX_KEYS.map((k) => ({ key: `mob_champ_${k}`, w: CHAMP_W, h: CHAMP_H, frames: 2, draw: (c: C2, f: number) => champOverlay(c, k, f) })),
    // wearing 1-4 harvested skeletons (look.ts demon1..4)
    ...[1, 2, 3, 4].map((n) => humanoid(`mob_demon${n}`, `demon${n}`, 28, 34, 33 / 34, 1.0, true)),
    // drawn on a 24x16 layout, 1.35x up into a 32x22 frame (about as long as a skeleton is tall)
    { key: "mob_crawler", w: 32, h: 22, draw: (c: C2, f: number) => {
      for (const k of SH ? [c, SH] : [c]) { k.save(); k.translate(16, 20); k.scale(1.35, 1.35); k.translate(-12, -14); }
      crawlerFrame(c, 24, 16, f);
      c.restore(); SH?.restore();
    } },
  ].filter((s) => !ONLY || ONLY.includes(s.key));
  const meta: Record<string, { w: number; h: number; scale: number; frames: number; hands?: number[][] }> = {};
  for (const s of sheets) {
    const tw = s.w * TX, th = s.h * TX;
    const NF = s.frames ?? FRAMES;
    const cv = createCanvas(tw * NF, th), oc = cv.getContext("2d");
    const sheet = oc.createImageData(tw * NF, th);
    for (let f = 0; f < NF; f++) {
      const body = createCanvas(s.w * HI, s.h * HI), shadow = createCanvas(s.w * HI, s.h * HI);
      const c = body.getContext("2d"), sc = shadow.getContext("2d");
      c.scale(HI, HI); sc.scale(HI, HI);
      SH = sc; s.draw(c, f); SH = null;
      const blob = !/wisp|skeleton|bandit|bride|necromancer|demon|crawler|hollowking|gnawkin|tuskborn|silkwretch|duskwing|packlord|hornbrute|hidemother|crowseer|gnasher|weaver|nomad|scorpion|sanddead|veiled|camelfolk|sphinx|sunwright|nightraider/.test(s.key);
      const b = shrink(body, "mb", tw, th);
      if (s.key.startsWith("mob_champ_")) pixelize(b, tw, th, true); // a detail, not a body: no ground grime
      else pixelize(b, tw, th, true, blob ? { y0: Math.round(th * 0.7), y1: th, mud: 0.14, sat: 0.9 } : { y0: Math.round(th * 0.72), y1: th, mud: s.key.includes("bandit") ? 0.38 : 0.2 });
      const u = shrink(shadow, "ms", tw, th); pixelAlpha(u);
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        const i = (y * tw + x) * 4, o = (y * tw * NF + f * tw + x) * 4, src = b[i + 3] ? b : u;
        for (let k = 0; k < 4; k++) sheet.data[o + k] = src[i + k];
      }
    }
    oc.putImageData(sheet, 0, 0);
    writeFileSync(`${out}/${s.key}.webp`, cv.encodeSync("webp", 100));
    meta[s.key] = { w: s.w, h: s.h, scale: TX, frames: NF, ...(s.hands ? { hands: s.hands } : {}) };
  }
  // Only some sheets rebuilt (ONLY): keep the others' entries
  let all = meta;
  if (ONLY) { try { all = { ...JSON.parse(readFileSync(`${out}/mobs.json`, "utf8")), ...meta }; } catch { /* first build */ } }
  writeFileSync(`${out}/mobs.json`, JSON.stringify(all, null, 1));
  setPainted(false, 2);
  console.log("painted monsters", Object.keys(meta).length);
}
