import Phaser from "phaser";
import { TILE } from "../../shared/constants";
import { LANDMARKS } from "../../shared/landmarks";
import { staticObj } from "./staticChunks";
import { LAND_KIT_SPOTS, LANDMARK_LIGHT, LANDMARK_PARTS, LANDMARK_SHEET, LK_SHEETS, type LkKind } from "./landKit";

/**
 * Draws the land kits and landmarks (landKit.ts, shared/landmarks.ts) from their baked sheets
 * (tools/art/paint/landKit/). Cosmetic: the windmill's sails turn and the beacon burns here, their solid boxes are
 * shared; a landmark in parts (the Lists) draws each part at its own foot. A sheet that failed to load is skipped, so
 * a missing file costs a prop, never a missing-texture box.
 */
const TX = 1.5; // texels per world px

export function preloadLandKit(scene: Phaser.Scene) {
  for (const [k, s] of Object.entries(LK_SHEETS)) if (!scene.textures.exists(k)) scene.load.spritesheet(k, `assets/hd/props/${k}.png`, { frameWidth: s.w, frameHeight: s.h });
}

const hash = (x: number, y: number) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function place(scene: Phaser.Scene, kind: LkKind, x: number, y: number, flip: boolean) {
  const s = LK_SHEETS[kind];
  const spr = scene.add.sprite(x, y, kind, 0).setOrigin(s.ox / s.w, s.oy / s.h).setScale(1 / TX).setDepth(y).setFlipX(flip);
  if (s.frames > 1) spr.play({ key: `${kind}_idle`, startFrame: Math.floor(hash(Math.round(x), Math.round(y)) * s.frames) }); // out of step with each other
  staticObj(scene, spr); // animated only while near the view (staticChunks.ts)
}

/**
 * Adds every kit prop and landmark to the scene. `light` (the day/night layer's addLight) gets the landmarks that burn
 * (LANDMARK_LIGHT): their glow fades in after dusk round the fire drawn on the sheet.
 */
export function addLandKit(scene: Phaser.Scene, light?: (x: number, y: number, color: number, scale: number, lift: number) => void) {
  const ok = (k: LkKind) => scene.textures.exists(k) && scene.textures.get(k).frameTotal > 1;
  for (const [k, s] of Object.entries(LK_SHEETS) as [LkKind, (typeof LK_SHEETS)[LkKind]][]) {
    const key = `${k}_idle`;
    if (s.frames > 1 && ok(k) && !scene.anims.exists(key)) scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(k, { start: 0, end: s.frames - 1 }), frameRate: s.fps, repeat: -1 });
  }
  for (const p of LAND_KIT_SPOTS) if (ok(p.kind)) place(scene, p.kind, p.x, p.y, p.flip);
  for (const l of LANDMARKS) {
    const k = LANDMARK_SHEET[l.id], g = LANDMARK_LIGHT[l.id];
    if (!k || !ok(k)) continue;
    place(scene, k, l.x * TILE, l.y * TILE, false);
    for (const p of LANDMARK_PARTS[l.id] ?? []) if (ok(p.kind)) place(scene, p.kind, p.x * TILE, p.y * TILE, false);
    if (g) light?.(l.x * TILE, l.y * TILE, g.color, g.scale, g.lift);
  }
}
