import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { FOOT, GOLEM_H, GOLEM_W, type GolemElement } from "./golems";
import { golem, wisp } from "./golems3d";
import { createCanvas } from "@napi-rs/canvas";
import { addChampPose, MOB_POSES, posed, setPainted, type Dir } from "../characters";
import { C2, P, blobPath, css, ellipseP, fillShape, glow, line, vol } from "./brush";
import { lastMob3D, lastRig, MOB3D, pixelAlpha, pixelize, setMob3D, shrink } from "./body";
import { RAIDER_G, RAIDER_H, RAIDER_W } from "./raiders";
import { raider } from "./raiders3d";
import { HOUND_H, HOUND_W, WRAITH_H, WRAITH_W } from "./moors";
import { RATTLER_H, RATTLER_W, VULTURE_H, VULTURE_PAL, VULTURE_W, WARHOUND_H, WARHOUND_PAL, WARHOUND_W } from "./badlands";
import { CROWNCROW_PAL, GILDHOUND_PAL } from "./crown";
import { bird, boneHound, crawler, hound, mistWraith, rattler, scorpion, sinkworm, type Pose } from "./beasts3d";
import { SINKWORM_H, SINKWORM_W } from "./sinkholes";
import { WISP_FOOT, WISP_H, WISP_W, type WispElement } from "./wisps";
import { renderMob, SIN, YAW, type MobFrame, type Model } from "./mob3d";
import { blobModel, blobRadius, type BlobOpts, type BlobPal } from "./blobs3d";
import { RAIDERS } from "../../../shared/raiders";
import { AFFIX_KEYS, AFFIXES, type AffixKey } from "../../../shared/champions";
import { CHAMP_WEAPONS } from "./look";
import { WAR_RIDERS, WAR_SOLDIERS, type WarRider } from "./warLooks";
import { mountModel, RIDER_GROUND, RIDER_H, RIDER_SEAT, RIDER_W } from "./warRiders";
import { CART_FRAMES, CART_H, CART_W, G, WAR_CARTS } from "./warCarts";
import { WAR_RAMS } from "./warRam";
import { WAR_WORKS, WORK_FRAMES, workModel } from "./warWorks";
import { TUNNEL_FRAMES, TUNNEL_H, TUNNEL_W, WAR_TUNNELS } from "./warTunnel";
import { cartModel, ramModel, siegeFrame, tunnelModel } from "./siege3d";

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
/** A beast built in 3D (beasts3d.ts): `oy` is the client origin row, where its feet stand. */
function beast3D(key: string, w: number, h: number, oy: number, model: (pose: Pose, f: number) => Model): Sheet {
  return { key, w, h, draw: () => {}, pix: (f) => { const { dir, pose } = frameOf(f); return renderMob(model(pose, f), YAW[dir as "down" | "up" | "right"], w, h, oy, TX); } };
}

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
  const pix = MOB3D.has(base) ? (f: number): MobFrame => {
    const up = lift ? lift + Math.sin(f * 1.7) * 1.2 : 0;
    setMob3D({ tw: Math.round(w * TX), th: Math.round(h * TX), k: scale * TX, x0: 16 - w / 2 / scale, y0: 29 - (oy * h - up) / scale, lift: up / scale, noShadow: fall && f >= FRAMES });
    humanoidFrame(kind, f, fall);
    let body = lastMob3D!;
    setMob3D(null);
    if (fall && f >= FRAMES) { // fall frames: the side view toppled backwards about the feet, as the painted sheet does
      const k = f - FRAMES, a = (k ? -86 : -24) * Math.PI / 180, tw = Math.round(w * TX), th = Math.round(h * TX);
      const px = w / 2 * TX + (k ? 9 : 2) * TX, py = oy * h * TX + (k ? -1.4 : 0) * TX, cx = w / 2 * TX, cy = oy * h * TX;
      const out = new Uint8ClampedArray(body.length), ca = Math.cos(a), sa = Math.sin(a);
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        const dx = x + 0.5 - px, dy = y + 0.5 - py, sx = Math.floor(cx + dx * ca + dy * sa), sy = Math.floor(cy - dx * sa + dy * ca);
        if (sx < 0 || sy < 0 || sx >= tw || sy >= th) continue;
        const i = (y * tw + x) * 4, j = (sy * tw + sx) * 4;
        for (let q = 0; q < 4; q++) out[i + q] = body[j + q];
      }
      // a flat shadow under where the body lies
      const sx0 = px - (k ? 12 : 3) * scale * TX, rx = 9 * scale * TX, ry = 2.2 * scale * TX;
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        const i = (y * tw + x) * 4; if (out[i + 3]) continue;
        const e = ((x + 0.5 - sx0) / rx) ** 2 + ((y + 0.5 - py) / ry) ** 2;
        if (e < 1) out[i + 3] = 105;
      }
      body = out;
    }
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


// ---------------------------------------------------------------- the clan war's riders (warLooks.ts WAR_RIDERS, warRiders.ts mounts)
/** A rider sheet frame: the 3D mount pixelized, the humanoid rider (body.ts, same grid) laid over it. 12 / 13 topple the pair like the soldiers' fall. */
function riderFrame(key: WarRider, f: number): MobFrame {
  const w = RIDER_W, h = RIDER_H, oy = RIDER_GROUND, tw = Math.round(w * TX), th = Math.round(h * TX), SC = 0.9;
  const fall = f >= FRAMES, { dir, pose } = frameOf(fall ? 4 : f);
  const p = pose === "step" ? 1 : pose === "stand" ? 2 : pose === "strike" ? 1 : 0; // the gallop: the two strides on the walk frames
  const m = renderMob(mountModel(key, p, pose === "wind" ? 1.6 : 0), YAW[dir as "down" | "up" | "right"], w, h, oy, TX);
  pixelize(m.body, tw, th, true, { y0: Math.round(th * 0.7), y1: th, mud: 0.12, sat: 0.95 }); pixelAlpha(m.under);
  const seat = RIDER_SEAT[key], yaw = YAW[dir as "down" | "up" | "right"];
  const fx = w / 2 + seat.x * Math.cos(yaw), fy = oy - (seat.x * Math.sin(yaw) * SIN + seat.z * Math.sqrt(3) / 2) - (p === 1 ? 0.7 : 0);
  setMob3D({ tw, th, k: SC * TX, x0: 16 - fx / SC, y0: 29 - fy / SC, lift: 0, noShadow: true });
  const hero = MOB_POSES[key], d = dir as Dir;
  if (pose === "wind") posed(hero, { dir: d, t: f, attack: 0, crouch: 1, lean: 1, expr: "squint" }, false);
  else if (pose === "strike") posed(hero, { dir: d, t: f, attack: 2, bob: 1 }, false);
  else posed(hero, { dir: d, t: f, stride: 0, bob: 0 }, false);
  const rider = lastMob3D!;
  setMob3D(null);
  const body = m.body, front = dir === "down" ? Math.round((fy - 4) * TX) : th; // seen head-on the mount's chest and head stand in front of the rider's legs
  const mount = body.slice();
  for (let i = 0; i < body.length; i += 4) if (rider[i + 3]) for (let q = 0; q < 4; q++) body[i + q] = rider[i + q];
  for (let y = front; y < th; y++) for (let x = 0; x < tw; x++) { const i = (y * tw + x) * 4; if (mount[i + 3]) for (let q = 0; q < 4; q++) body[i + q] = mount[i + q]; }
  if (!fall) return { body, under: m.under, done: true };
  const k = f - FRAMES, a = (k ? -86 : -24) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const cx = w / 2 * TX, cy = oy * TX, px = cx + (k ? 7 : 1.5) * TX, py = cy + (k ? -1.4 : 0) * TX, out = new Uint8ClampedArray(body.length), under = new Uint8ClampedArray(body.length);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const dx = x + 0.5 - px, dy = y + 0.5 - py, sx = Math.floor(cx + dx * ca + dy * sa), sy = Math.floor(cy - dx * sa + dy * ca);
    if (sx < 0 || sy < 0 || sx >= tw || sy >= th) continue;
    const i = (y * tw + x) * 4, j = (sy * tw + sx) * 4;
    for (let q = 0; q < 4; q++) out[i + q] = body[j + q];
  }
  const sx0 = px - (k ? 12 : 3) * TX, rx = 14 * TX, ry = 2.6 * TX;
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) { const i = (y * tw + x) * 4; if (!out[i + 3] && ((x + 0.5 - sx0) / rx) ** 2 + ((y + 0.5 - py) / ry) ** 2 < 1) under[i + 3] = 105; }
  return { body: out, under, done: true };
}

// ---------------------------------------------------------------- blobs (3D-built: blobs3d.ts)

// ---------------------------------------------------------------- crawling skeleton (BONES.crawlChance)
// ---------------------------------------------------------------- the Sunscar's dune scorpion (Act 2)
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
    ...(["fire", "cold", "poison", "shock"] as GolemElement[]).flatMap((el) => [
      beast3D(`mob_golem_${el}`, GOLEM_W, GOLEM_H, FOOT, (pose, f) => golem(el, pose, f)),
      beast3D(`mob_golem_colossus_${el}`, GOLEM_W, GOLEM_H, FOOT, (pose, f) => golem(el, pose, f, true)),
    ]),
    // the Summoner's elemental wisps (wisps.ts): small orbs floating above their shadow
    ...(["fire", "cold", "poison", "shock"] as WispElement[]).map((el) => beast3D(`mob_wisp_${el}`, WISP_W, WISP_H, WISP_FOOT, (pose, f) => wisp(el, pose, f))),
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
    // Act 2, the Sunscar (look.ts nomad..camelfolk) and its giant scorpion (beasts3d.ts)
    humanoid("mob_nomad", "nomad", 22, 30, 27.5 / 30, 0.86),
    humanoid("mob_nomad_folk", "nomad_folk", 22, 30, 27.5 / 30, 0.86),
    humanoid("mob_sanddead", "sanddead", 22, 30, 27.5 / 30, 0.88),
    humanoid("mob_veiled", "veiled", 24, 32, 31.2 / 32, 0.93),
    humanoid("mob_camelfolk", "camelfolk", 34, 36, 33.5 / 36, 1.08),
    humanoid("mob_sphinx", "sphinx", 40, 40, 36.5 / 40, 1.12), // winged: a wider, taller frame
    humanoid("mob_sunwright", "sunwright", 44, 48, 42 / 48, 1.25), // Act 2's final boss, drawn big like the Hollow King
    // Act 3, the Grey Barrow Moors (look.ts wight..barrowking)
    humanoid("mob_wight", "wight", 24, 30, 27.5 / 30, 0.9),
    beast3D("mob_bonehound", HOUND_W, HOUND_H, 19, (pose, f) => boneHound(pose, f)),
    beast3D("mob_mistwraith", WRAITH_W, WRAITH_H, 35, (pose, f) => mistWraith(pose, f)),
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
    beast3D("mob_warhound", WARHOUND_W, WARHOUND_H, 21, (pose, f) => hound(WARHOUND_PAL, pose, f)),
    beast3D("mob_vulture", VULTURE_W, VULTURE_H, 31, (pose, f) => bird(VULTURE_PAL, pose, f, { bald: true })),
    beast3D("mob_rattler", RATTLER_W, RATTLER_H, 19, (pose, f) => rattler(pose, f)),
    // Act 5, the Mawdeep Sinkholes: the Hide-Kin (look.ts delver..mawfather) and the Gullet Worm (sinkholes.ts)
    humanoid("mob_delver", "delver", 24, 30, 27.5 / 30, 0.88),
    humanoid("mob_cackler", "cackler", 22, 30, 27.5 / 30, 0.86),
    humanoid("mob_stagkin", "stagkin", 28, 38, 35 / 38, 0.98),
    humanoid("mob_quillback", "quillback", 26, 30, 27.5 / 30, 0.88),
    humanoid("mob_stitcher", "stitcher", 24, 34, 31.5 / 34, 0.92),
    humanoid("mob_hidechief", "hidechief", 34, 38, 35 / 38, 1.12),
    humanoid("mob_mawfather", "mawfather", 46, 50, 46 / 50, 1.34),
    beast3D("mob_sinkworm", SINKWORM_W, SINKWORM_H, 25, (pose, f) => sinkworm(pose, f)),
    // Act 6, the Crown of the Marches: the court (look.ts oathbreaker..rivenking); the Gildhound and the Crown Crow are the
    // badlands' hound and vulture in the Crown's colours (crown.ts palettes)
    humanoid("mob_oathbreaker", "oathbreaker", 28, 32, 30 / 32, 0.95),
    humanoid("mob_crownguard", "crownguard", 32, 34, 32 / 34, 1.0),
    humanoid("mob_hollowherald", "hollowherald", 26, 32, 31.2 / 32, 0.93),
    humanoid("mob_courtmagus", "courtmagus", 24, 34, 31.5 / 34, 0.92),
    humanoid("mob_pretender", "pretender", 24, 32, 30 / 32, 0.9),
    humanoid("mob_thronewarden", "thronewarden", 36, 40, 37.5 / 40, 1.15),
    humanoid("mob_rivenking", "rivenking", 46, 50, 46 / 50, 1.3),
    beast3D("mob_gildhound", WARHOUND_W, WARHOUND_H, 21, (pose, f) => hound(GILDHOUND_PAL, pose, f, { lean: true })),
    beast3D("mob_crowncrow", VULTURE_W, VULTURE_H, 31, (pose, f) => bird(CROWNCROW_PAL, pose, f)),
    // the clan war's soldiers (warLooks.ts): 36 px wide so the fallen body fits; officers are taller
    ...WAR_SOLDIERS.map((k) => k.endsWith("_cap") || k.endsWith("_chief") || k.endsWith("_adept") ? humanoid(`mob_${k}`, k, 36, 34, 32 / 34, 0.95, false, 0, true) : humanoid(`mob_${k}`, k, 36, 32, 30 / 32, 0.9, false, 0, true)),
    // the clan war's riders (warRiders.ts): 48 x 48, the soldiers' 14-frame layout
    ...WAR_RIDERS.map((k) => ({ key: `mob_${k}`, w: RIDER_W, h: RIDER_H, frames: FRAMES + FALL_FRAMES, draw: () => {}, pix: (f: number) => riderFrame(k, f) })),
    // the clan war's supply carts (warCarts.ts): 14 frames, 12 = staggering, 13 = wrecked
    ...WAR_CARTS.map((k) => ({ key: `mob_${k}`, w: CART_W, h: CART_H, frames: CART_FRAMES, draw: () => {}, pix: (f: number) => siegeFrame(cartModel(k, f), CART_W, CART_H, G, TX) })),
    // the Ossuary Host's bone siege ram (warRam.ts): same frame size and 14-frame layout
    ...WAR_RAMS.map((k) => ({ key: `mob_${k}`, w: CART_W, h: CART_H, frames: CART_FRAMES, draw: () => {}, pix: (f: number) => siegeFrame(ramModel(f), CART_W, CART_H, G, TX) })),
    // the Hold works (warWorks.ts): barracks, stores, weapon rack, rubble per clan; the 14-frame layout again
    ...WAR_WORKS.map((k) => ({ key: `mob_${k.key}`, w: k.w, h: k.h, frames: WORK_FRAMES, draw: () => {}, pix: (f: number) => siegeFrame(workModel(k.kind, k.clan, f), k.w, k.h, k.oy, TX) })),
    // the Hide-Kin tunnel mouth (warTunnel.ts): 80x44 frames, the same 14-frame layout
    ...WAR_TUNNELS.map((k) => ({ key: `mob_${k}`, w: TUNNEL_W, h: TUNNEL_H, frames: TUNNEL_FRAMES, draw: () => {}, pix: (f: number) => siegeFrame({ m: tunnelModel(f), dir: "down" }, TUNNEL_W, TUNNEL_H, G, TX) })),
    beast3D("mob_scorpion", 36, 30, 27, (pose, f) => scorpion(pose, f)),
    // the Night Raiders (raiders.ts): one sheet for each of the Seven
    ...RAIDERS.map((R) => beast3D(`mob_nightraider_${R.key}`, RAIDER_W, RAIDER_H, RAIDER_G, (pose, f) => raider(R, pose, f))),
    // champion details (shared/champions.ts): one small painted sheet per affix, laid over the monster by the client
    ...AFFIX_KEYS.filter((k) => AFFIXES[k].overlay).map((k) => ({ key: `mob_champ_${k}`, w: CHAMP_W, h: CHAMP_H, frames: 2, draw: (c: C2, f: number) => champOverlay(c, k, f) })),
    // wearing 1-4 harvested skeletons (look.ts demon1..4)
    ...[1, 2, 3, 4].map((n) => humanoid(`mob_demon${n}`, `demon${n}`, 28, 34, 33 / 34, 1.0, true)),
    // drawn on a 24x16 layout, 1.35x up into a 32x22 frame (about as long as a skeleton is tall)
    beast3D("mob_crawler", 32, 22, 20, (pose, f) => crawler(pose, f)),
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
