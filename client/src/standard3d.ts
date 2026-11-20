import { CLAN_KEYS } from "../../shared/war/clans";

/** Baked 3D standards (tools/art/paint/standards3d.ts): sheet size, foot texel, frames, texels per world px. */
export const STD3D = { w: 72, h: 156, ox: 36, oy: 150, frames: 8, fps: 7, tx: 1.5 };
/** Every baked standard sheet: one per clan, its Reckoning-crowned twin, and the unsworn rag (loaded with the baked props). */
export const STD3D_KEYS = [...CLAN_KEYS.flatMap((k) => [`warstd3_${k}`, `warstd3_${k}_crowned`]), "warstd3_rogue"];
