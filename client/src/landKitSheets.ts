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
  // the Grey Barrow Moors: peat and barrows
  lk_peat_stack: { w: 64, h: 60, frames: 1, ox: 32, oy: 46, fps: 0 },
  lk_peat_bank: { w: 100, h: 70, frames: 1, ox: 50, oy: 48, fps: 0 },
  lk_way_cairn: { w: 48, h: 62, frames: 1, ox: 24, oy: 50, fps: 0 },
  lk_beacon: { w: 150, h: 196, frames: 6, ox: 75, oy: 150, fps: 8 },
  // the Red Badlands: mines and cattle
  lk_longhorn: { w: 124, h: 92, frames: 6, ox: 62, oy: 66, fps: 3 },
  lk_trough: { w: 96, h: 54, frames: 1, ox: 48, oy: 36, fps: 0 },
  lk_ore_cart: { w: 96, h: 72, frames: 1, ox: 48, oy: 50, fps: 0 },
  lk_headframe: { w: 330, h: 330, frames: 6, ox: 180, oy: 268, fps: 4 },
  // the Mawdeep Sinkholes: rope and lifts
  lk_rope_coil: { w: 60, h: 62, frames: 1, ox: 30, oy: 45, fps: 0 },
  lk_rope_walk: { w: 166, h: 116, frames: 6, ox: 83, oy: 72, fps: 4 },
  lk_gantry: { w: 104, h: 102, frames: 6, ox: 44, oy: 80, fps: 3 },
  lk_lift: { w: 228, h: 238, frames: 12, ox: 104, oy: 186, fps: 3 },
  // the Sunscar: caravans and salt
  lk_camel: { w: 112, h: 66, frames: 6, ox: 41, oy: 47, fps: 3 },
  lk_camel_load: { w: 112, h: 66, frames: 6, ox: 41, oy: 47, fps: 3 },
  lk_salt_stack: { w: 88, h: 56, frames: 1, ox: 36, oy: 37, fps: 0 },
  lk_salt_pan: { w: 106, h: 62, frames: 1, ox: 52, oy: 32, fps: 0 },
  lk_caravan: { w: 266, h: 146, frames: 6, ox: 108, oy: 88, fps: 3 },
  // the Crown of the Marches: pilgrims and tourneys
  lk_pavilion: { w: 186, h: 124, frames: 6, ox: 82, oy: 88, fps: 4 },
  lk_pavilion_blue: { w: 186, h: 124, frames: 6, ox: 82, oy: 88, fps: 4 },
  lk_candle_shrine: { w: 92, h: 86, frames: 6, ox: 39, oy: 66, fps: 6 },
  lk_quintain: { w: 128, h: 105, frames: 6, ox: 49, oy: 76, fps: 3 },
  lk_pilgrim_staves: { w: 74, h: 56, frames: 1, ox: 27, oy: 43, fps: 0 },
  lk_ribbon_post: { w: 72, h: 63, frames: 6, ox: 22, oy: 50, fps: 4 },
  lk_lists: { w: 286, h: 198, frames: 6, ox: 106, oy: 148, fps: 4 },
  lk_tilt: { w: 398, h: 248, frames: 6, ox: 175, oy: 159, fps: 4 },
} satisfies Record<string, LkSheet>;
export type LkKind = keyof typeof LK_SHEETS;
