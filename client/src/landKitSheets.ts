/**
 * Frame sizes of the land-kit sheets (client/public/assets/hd/props/lk_*.png), in texels (1.5 per world px), with the
 * texel the model's foot is baked at (ox, oy). Import-free, so the bake (tools/art/bake-props.ts), the client and
 * the tests read one table and can't drift apart.
 */
export interface LkSheet { w: number; h: number; frames: number; ox: number; oy: number; fps: number }

export const LK_SHEETS = {
  // Oakvale: farms and mills
  lk_stook: { w: 48, h: 50, frames: 1, ox: 24, oy: 42, fps: 0 },
  lk_scarecrow: { w: 56, h: 82, frames: 6, ox: 28, oy: 76, fps: 3 },
  lk_grain_cart: { w: 96, h: 70, frames: 1, ox: 48, oy: 54, fps: 0 },
  lk_beehives: { w: 76, h: 58, frames: 6, ox: 38, oy: 46, fps: 6 },
  lk_hide_frame: { w: 64, h: 74, frames: 6, ox: 32, oy: 64, fps: 3 },
  lk_windmill: { w: 284, h: 236, frames: 6, ox: 138, oy: 202, fps: 5 },
} satisfies Record<string, LkSheet>;
export type LkKind = keyof typeof LK_SHEETS;
