import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { GOLEM_H, GOLEM_W, paintGolemFrame, type GolemDir, type GolemElement } from "./golems";
import { createCanvas } from "@napi-rs/canvas";
import { addChampPose, MOB_POSES, posed, setPainted, type Dir } from "../characters";
import { C2, P, blobPath, css, ellipseP, fillShape, glow, limb, line, mix, sh, vol } from "./brush";
import { lastMob3D, lastRig, MOB3D, pixelAlpha, pixelize, setMob3D, shrink } from "./body";
import { paintRaider, RAIDER_H, RAIDER_W } from "./raiders";
import { HOUND_H, HOUND_W, WRAITH_H, WRAITH_W, paintHound, paintWraith } from "./moors";
import { RATTLER_H, RATTLER_W, VULTURE_H, VULTURE_W, WARHOUND_H, WARHOUND_W, paintRattler, paintVulture, paintWarhound } from "./badlands";
import { CROWNCROW_PAL, GILDHOUND_PAL } from "./crown";
import { SINKWORM_H, SINKWORM_W, paintSinkworm } from "./sinkholes";
import { paintWisp, WISP_H, WISP_W, type WispElement } from "./wisps";
import { renderMob, SIN, YAW, type MobFrame } from "./mob3d";
import { blobModel, blobRadius, type BlobOpts, type BlobPal } from "./blobs3d";
import { RAIDERS } from "../../../shared/raiders";
import { AFFIX_KEYS, AFFIXES, type AffixKey } from "../../../shared/champions";
import { CHAMP_WEAPONS } from "./look";
import { WAR_SOLDIERS } from "./warLooks";
import { CART_FRAMES, CART_H, CART_W, WAR_CARTS, paintCart } from "./warCarts";
import { WAR_RAMS, paintRam } from "./warRam";
import { TUNNEL_FRAMES, TUNNEL_H, TUNNEL_W, WAR_TUNNELS, paintTunnel } from "./warTunnel";

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
/** Soldiers (warLooks.ts) get two more frames after the 12: 12 staggers, 13 lies fallen (side view, facing right). */
const FALL_FRAMES = 2;
/** Facing and pose of sheet frame f. */
function frameOf(f: number): { dir: Dir; pose: "stand" | "step" | "wind" | "strike" } {
  if (f < 6) return { dir: DIRS[f], pose: f % 2 ? "step" : "stand" };
  const k = f - 6;
  return { dir: (["down", "up", "right"] as Dir[])[k >> 1], pose: k % 2 ? "strike" : "wind" };
}

interface Sheet { key: string; w: number; h: number; draw: (c: C2, f: number) => void; frames?: number; hands?: number[][]; pix?: (f: number) => MobFrame }

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
const HUMANOIDS = new Map<string, [number, number, number, number, boolean, number]>(); // sheet key -> its frame and scale (champion sheets copy them)
function humanoid(key: string, kind: string, w: number, h: number, oy: number, scale: number, rip = false, lift = 0, fall = false): Sheet {
  HUMANOIDS.set(key, [w, h, oy, scale, rip, lift]);
  const nf = FRAMES + (rip ? RIP_FRAMES : 0) + (fall ? FALL_FRAMES : 0);
  // Frames are painted on first use, so rebuilding a few sheets (buildMobs ONLY) doesn't paint every humanoid
  let frames: ReturnType<typeof humanoidFrame>[] | undefined;
  const hands: number[][] = [];
  const paint = () => frames ??= [...Array(nf).keys()].map((f) => {
    const fr = humanoidFrame(kind, f, fall);
    // the hands in sheet px (world px from the frame's top-left): where the client puts the skeleton it holds
    const toSheet = (q: P) => [+(w / 2 + (q[0] - 16) * scale).toFixed(2), +(oy * h + (q[1] - 29) * scale).toFixed(2)];
    if (rip && lastRig) hands.push([...toSheet(lastRig.nearH), ...toSheet(lastRig.farH)]);
    return fr;
  });
  // 3D-built bodies (body3d.ts via body.ts MOB3D): ray-cast straight onto this sheet's texel grid
  const base = kind.replace(/_(axe|spear|bow|champ|folk)$/, "").replace(/_champ$/, "");
  const pix = MOB3D.has(base) && !rip && !fall ? (f: number): MobFrame => {
    const up = lift ? lift + Math.sin(f * 1.7) * 1.2 : 0;
    setMob3D({ tw: Math.round(w * TX), th: Math.round(h * TX), k: scale * TX, x0: 16 - w / 2 / scale, y0: 29 - (oy * h - up) / scale });
    humanoidFrame(kind, f, fall);
    const body = lastMob3D!;
    setMob3D(null);
    return { body, under: new Uint8ClampedArray(body.length), done: true };
  } : undefined;
  return {
    key, w, h, frames: nf, pix, get hands() { if (!rip) return undefined; paint(); return hands; },
    draw: (c, f) => {
      const fr = paint()[f], n = createCanvas(fr.w, fr.h), x = n.getContext("2d"), img = x.createImageData(fr.w, fr.h);
      img.data.set(fr.data); x.putImageData(img, 0, 0);
      if (SH) { SH.save(); SH.translate(w / 2, oy * h); SH.scale(1, 0.3); SH.fillStyle = "rgba(0,0,0,0.42)"; SH.beginPath(); SH.arc(0, 0, 6.5 * scale, 0, Math.PI * 2); SH.fill(); SH.restore(); }
      // logical unit (16, 29) = the feet -> (w/2, oy*h) in world px
      const up = lift ? lift + Math.sin(f * 1.7) * 1.2 : 0;
      c.save(); c.translate(w / 2, oy * h - up);
      if (fall && f >= FRAMES) { // fall frames: the body topples backwards (to the left) about its feet
        const k = f - FRAMES, a = (k ? -86 : -24) * Math.PI / 180;
        c.translate(k ? 9 : 2, k ? -1.4 : 0); c.rotate(a);
      }
      c.scale(scale, scale); c.translate(-16, -29);
      c.imageSmoothingEnabled = true; (c as any).imageSmoothingQuality = "high";
      c.drawImage(n, 0, 0, 32, 32);
      c.restore();
    },
  };
}

function humanoidFrame(kind: string, f: number, fall = false) {
  if (fall && f >= FRAMES) { // soldiers' fall (sheet frames 12 = staggering, 13 = down): the side view, rotated by the sheet code
    return posed(MOB_POSES[kind], { dir: "right", t: f, crouch: f === FRAMES ? 1 : 2, lean: 1, expr: "squint", attack: -1 }, false);
  }
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

// ---------------------------------------------------------------- blobs (3D-built: blobs3d.ts)

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
  // 3D-built (blobs3d.ts, Murat 2026-11-17); the footprint centre sits half its depth above the old painted base line
  const oy = h - 1.3 - blobRadius(w) * SIN;
  return { key, w, h, draw: () => {}, pix: (f) => { const { dir, pose } = frameOf(f); return renderMob(blobModel(w, pal, o, pose, f), YAW[dir as "down" | "up" | "right"], w, h, oy, TX); } };
}


/**
 * Champions (shared/champions.ts): one painted detail per affix of the blobs and the scorpions, drawn by the client
 * over the monster (client/src/championFx.ts), 20x20 world px, 2 frames (a drip, a glow). "body" ones on the body
 * (centred), "feet" ones on the ground (their foot at y 18). Humanoid champions carry another weapon instead (look.ts CHAMP_WEAPONS).
 */
export const CHAMP_W = 20, CHAMP_H = 20;
function champOverlay(c: C2, k: AffixKey, f: number) {
  const cx = 10, t = f % 2;
  switch (k) {
    case "split": { // a glowing seam down the middle where it is about to part, bubbles along it
      glow(c, cx, 10, 6, 0x8dff5a, 0.45);
      line(c, [[cx, 3], [cx - 1.2, 6.5], [cx + 1, 10], [cx - 0.8, 13.5], [cx, 17]], 0x2a6a1a, 1.4);
      line(c, [[cx, 3], [cx - 1.2, 6.5], [cx + 1, 10], [cx - 0.8, 13.5], [cx, 17]], 0xd6ffb0, 0.6);
      for (const [dx, y, r] of [[1.8, 5.5 + t, 0.9], [-2, 9.5 - t, 1.1], [1.6, 13 + t * 0.6, 0.8]] as [number, number, number][]) {
        vol(c, ellipseP(cx + dx, y, r, r), 0xa8ff80, [cx + dx - r, y - r, r * 2, r * 2], { spec: 0.8 });
      }
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
    case "taint": { // it oozes: a puddle at its feet and drips falling into it
      fillShape(c, ellipseP(cx, 17, 8.5, 2.4), css(0x4aa02a, 0.85));
      fillShape(c, ellipseP(cx - 1.5, 16.6, 4.5, 1.1), css(0xa8ff80, 0.7));
      for (const [dx, y] of [[-4, 9 + t * 3], [3, 11 + (1 - t) * 3], [0.5, 6 + t * 4]] as P[]) {
        fillShape(c, blobPath([[cx + dx, y - 1.2], [cx + dx + 0.7, y + 0.4], [cx + dx, y + 1], [cx + dx - 0.7, y + 0.4]]), css(0x8dff5a, 0.95));
      }
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
    // Act 3, the Grey Barrow Moors (look.ts wight..barrowking)
    humanoid("mob_wight", "wight", 24, 30, 27.5 / 30, 0.9),
    { key: "mob_bonehound", w: HOUND_W, h: HOUND_H, draw: (c: C2, f: number) => { const { dir, pose } = frameOf(f); paintHound(c, SH, dir as "down" | "up" | "right", pose, f); } },
    { key: "mob_mistwraith", w: WRAITH_W, h: WRAITH_H, draw: (c: C2, f: number) => { const { dir, pose } = frameOf(f); paintWraith(c, SH, dir as "down" | "up" | "right", pose, f); } },
    humanoid("mob_boghag", "boghag", 26, 32, 31.2 / 32, 0.93),
    humanoid("mob_legionary", "legionary", 32, 32, 29.5 / 32, 0.95),
    humanoid("mob_cairnlord", "cairnlord", 38, 40, 37.5 / 40, 1.15),
    humanoid("mob_barrowking", "barrowking", 46, 48, 42 / 48, 1.25, false, 0),
    // Act 4, the Red Badlands (look.ts outrider..rourke, badlands.ts warhound / vulture / rattler)
    humanoid("mob_outrider", "outrider", 22, 30, 27.5 / 30, 0.86),
    humanoid("mob_crossbowman", "crossbowman", 22, 30, 27.5 / 30, 0.9),
    humanoid("mob_firebrand", "firebrand", 24, 32, 31.2 / 32, 0.93),
    humanoid("mob_redcaptain", "redcaptain", 30, 34, 32 / 34, 1.0),
    humanoid("mob_rourke", "rourke", 40, 44, 40 / 44, 1.2),
    { key: "mob_warhound", w: WARHOUND_W, h: WARHOUND_H, draw: (c: C2, f: number) => { const { dir, pose } = frameOf(f); paintWarhound(c, SH, dir as "down" | "up" | "right", pose, f); } },
    { key: "mob_vulture", w: VULTURE_W, h: VULTURE_H, draw: (c: C2, f: number) => { const { dir, pose } = frameOf(f); paintVulture(c, SH, dir as "down" | "up" | "right", pose, f); } },
    { key: "mob_rattler", w: RATTLER_W, h: RATTLER_H, draw: (c: C2, f: number) => { const { dir, pose } = frameOf(f); paintRattler(c, SH, dir as "down" | "up" | "right", pose, f); } },
    // Act 5, the Mawdeep Sinkholes: the Hide-Kin (look.ts delver..mawfather) and the Gullet Worm (sinkholes.ts)
    humanoid("mob_delver", "delver", 24, 30, 27.5 / 30, 0.88),
    humanoid("mob_cackler", "cackler", 22, 30, 27.5 / 30, 0.86),
    humanoid("mob_stagkin", "stagkin", 28, 38, 35 / 38, 0.98),
    humanoid("mob_quillback", "quillback", 26, 30, 27.5 / 30, 0.88),
    humanoid("mob_stitcher", "stitcher", 24, 34, 31.5 / 34, 0.92),
    humanoid("mob_hidechief", "hidechief", 34, 38, 35 / 38, 1.12),
    humanoid("mob_mawfather", "mawfather", 46, 50, 46 / 50, 1.34),
    { key: "mob_sinkworm", w: SINKWORM_W, h: SINKWORM_H, draw: (c: C2, f: number) => { const { dir, pose } = frameOf(f); paintSinkworm(c, SH, dir as "down" | "up" | "right", pose, f); } },
    // Act 6, the Crown of the Marches: the court (look.ts oathbreaker..rivenking); the Gildhound and the Crown Crow are the
    // badlands' hound and vulture in the Crown's colours (crown.ts palettes)
    humanoid("mob_oathbreaker", "oathbreaker", 28, 32, 30 / 32, 0.95),
    humanoid("mob_crownguard", "crownguard", 32, 34, 32 / 34, 1.0),
    humanoid("mob_hollowherald", "hollowherald", 26, 32, 31.2 / 32, 0.93),
    humanoid("mob_courtmagus", "courtmagus", 24, 34, 31.5 / 34, 0.92),
    humanoid("mob_pretender", "pretender", 24, 32, 30 / 32, 0.9),
    humanoid("mob_thronewarden", "thronewarden", 36, 40, 37.5 / 40, 1.15),
    humanoid("mob_rivenking", "rivenking", 46, 50, 46 / 50, 1.3),
    { key: "mob_gildhound", w: WARHOUND_W, h: WARHOUND_H, draw: (c: C2, f: number) => { const { dir, pose } = frameOf(f); paintWarhound(c, SH, dir as "down" | "up" | "right", pose, f, GILDHOUND_PAL); } },
    { key: "mob_crowncrow", w: VULTURE_W, h: VULTURE_H, draw: (c: C2, f: number) => { const { dir, pose } = frameOf(f); paintVulture(c, SH, dir as "down" | "up" | "right", pose, f, CROWNCROW_PAL); } },
    // the clan war's soldiers (warLooks.ts): 36 px wide so the fallen body fits; officers are taller
    ...WAR_SOLDIERS.map((k) => k.endsWith("_cap") || k.endsWith("_chief") || k.endsWith("_adept") ? humanoid(`mob_${k}`, k, 36, 34, 32 / 34, 0.95, false, 0, true) : humanoid(`mob_${k}`, k, 36, 32, 30 / 32, 0.9, false, 0, true)),
    // the clan war's supply carts (warCarts.ts): 14 frames, 12 = staggering, 13 = wrecked
    ...WAR_CARTS.map((k) => ({ key: `mob_${k}`, w: CART_W, h: CART_H, frames: CART_FRAMES, draw: (c: C2, f: number) => paintCart(c, SH, k, f) })),
    // the Ossuary Host's bone siege ram (warRam.ts): same frame size and 14-frame layout
    ...WAR_RAMS.map((k) => ({ key: `mob_${k}`, w: CART_W, h: CART_H, frames: CART_FRAMES, draw: (c: C2, f: number) => paintRam(c, SH, k, f) })),
    // the Hide-Kin tunnel mouth (warTunnel.ts): 80x44 frames, the same 14-frame layout
    ...WAR_TUNNELS.map((k) => ({ key: `mob_${k}`, w: TUNNEL_W, h: TUNNEL_H, frames: TUNNEL_FRAMES, draw: (c: C2, f: number) => paintTunnel(c, SH, k, f) })),
    { key: "mob_scorpion", w: 36, h: 30, draw: (c: C2, f: number) => scorpionFrame(c, 36, 30, f) },
    // the Night Raiders (raiders.ts): one sheet for each of the Seven
    ...RAIDERS.map((R) => ({ key: `mob_nightraider_${R.key}`, w: RAIDER_W, h: RAIDER_H, draw: (c: C2, f: number) => { const { dir, pose } = frameOf(f); paintRaider(c, SH, R, dir as "down" | "up" | "right", pose, f); } })),
    // champion details (shared/champions.ts): one small painted sheet per affix, laid over the monster by the client
    ...AFFIX_KEYS.filter((k) => AFFIXES[k].overlay).map((k) => ({ key: `mob_champ_${k}`, w: CHAMP_W, h: CHAMP_H, frames: 2, draw: (c: C2, f: number) => champOverlay(c, k, f) })),
    // wearing 1-4 harvested skeletons (look.ts demon1..4)
    ...[1, 2, 3, 4].map((n) => humanoid(`mob_demon${n}`, `demon${n}`, 28, 34, 33 / 34, 1.0, true)),
    // drawn on a 24x16 layout, 1.35x up into a 32x22 frame (about as long as a skeleton is tall)
    { key: "mob_crawler", w: 32, h: 22, draw: (c: C2, f: number) => {
      for (const k of SH ? [c, SH] : [c]) { k.save(); k.translate(16, 20); k.scale(1.35, 1.35); k.translate(-12, -14); }
      crawlerFrame(c, 24, 16, f);
      c.restore(); SH?.restore();
    } },
  ];
  // humanoid champions: the same sheet with their champion weapon (look.ts CHAMP_WEAPONS)
  for (const k of Object.keys(CHAMP_WEAPONS)) {
    const a = HUMANOIDS.get(`mob_${k}`);
    if (!a) continue;
    addChampPose(`${k}_champ`, CHAMP_WEAPONS[k].weapon ?? "axe");
    sheets.push(humanoid(`mob_${k}_champ`, `${k}_champ`, ...a));
  }
  const todo = sheets.filter((s) => !ONLY || ONLY.includes(s.key));
  const meta: Record<string, { w: number; h: number; scale: number; frames: number; hands?: number[][] }> = {};
  for (const s of todo) {
    const tw = s.w * TX, th = s.h * TX;
    const NF = s.frames ?? FRAMES;
    const cv = createCanvas(tw * NF, th), oc = cv.getContext("2d");
    const sheet = oc.createImageData(tw * NF, th);
    for (let f = 0; f < NF; f++) {
      if (s.pix) { // 3D-built: already on the texel grid; pixelize only posterizes, rims, outlines and weathers it
        const m = s.pix(f), b = m.body, u = m.under;
        if (!m.done) { pixelize(b, tw, th, true, { y0: Math.round(th * 0.7), y1: th, mud: 0.12, sat: 0.95 }); pixelAlpha(u); }
        for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
          const i = (y * tw + x) * 4, o = (y * tw * NF + f * tw + x) * 4, src = b[i + 3] ? b : u;
          for (let k = 0; k < 4; k++) sheet.data[o + k] = src[i + k];
        }
        continue;
      }
      const body = createCanvas(s.w * HI, s.h * HI), shadow = createCanvas(s.w * HI, s.h * HI);
      const c = body.getContext("2d"), sc = shadow.getContext("2d");
      c.scale(HI, HI); sc.scale(HI, HI);
      SH = sc; s.draw(c, f); SH = null;
      const blob = !/wisp|war_|skeleton|bandit|bride|necromancer|demon|crawler|hollowking|gnawkin|tuskborn|silkwretch|duskwing|packlord|hornbrute|hidemother|crowseer|gnasher|weaver|nomad|scorpion|sanddead|veiled|camelfolk|sphinx|sunwright|wight|boghag|bonehound|mistwraith|legionary|cairnlord|barrowking|nightraider|outrider|crossbowman|firebrand|redcaptain|rourke|warhound|vulture|rattler|delver|cackler|stagkin|quillback|stitcher|hidechief|mawfather|sinkworm|oathbreaker|crownguard|hollowherald|courtmagus|pretender|thronewarden|rivenking|gildhound|crowncrow/.test(s.key);
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
