import Phaser from "phaser";
import { sheet } from "./worldProps";
import { LUTIER_DRAW, LU_FRAMES, BN_W, BN_H, BN_BX, BN_BY, RK_W, RK_H, RK_BX, RK_BY } from "./lutierDraw";

/**
 * Wren the lute-maker's stall (props for shared/npcs.ts NPC_DECOR): a workbench `lu_bench` with a lute being built, and a
 * rack `lu_rack` of three finished lutes on cords (they sway). Painted by lutierDraw.ts in the armourers' pixel style, so
 * wire them like the `ar_*` props in npcs.ts: call `lutierTextures(scene)` once, draw each prop animated with
 * `${prop}_idle`, origin from `lutierOrigin(prop)`, texel scale 1 / LU_TX. Cosmetic only (collision is NPC_DECOR.solid).
 */
export const LU_TX = 1.5;

/** Paints the stall's textures and their idle animations (a bench and a rack). */
export function lutierTextures(scene: Phaser.Scene) {
  for (const [key, d] of Object.entries(LUTIER_DRAW)) {
    sheet(scene, key, d.w, d.h, LU_FRAMES, d.draw, 0);
    if (!scene.anims.exists(`${key}_idle`)) scene.anims.create({ key: `${key}_idle`, frames: scene.anims.generateFrameNumbers(key, { start: 0, end: LU_FRAMES - 1 }), frameRate: 6, repeat: -1 });
  }
}

/** Origin (x, y fractions) of each stall texture: the spot that stands on the decor's tile position. */
export function lutierOrigin(prop: string): [number, number] {
  return prop === "lu_bench" ? [BN_BX / BN_W, (BN_BY - 2) / BN_H] : [RK_BX / RK_W, (RK_BY - 2) / RK_H];
}
