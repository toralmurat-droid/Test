/**
 * Small lists the Saltmere art fills while the village is built and the ambient layer reads later (gulls, smoke, lamp
 * glow). Kept free of imports so isobuild.ts, saltmereArt.ts and ambient.ts can share them without import cycles.
 * Cosmetic only. All points are world px: x, y on the ground, z up.
 */
export interface SaltPoint { x: number; y: number; z: number }
/** Places a gull can sit: roof ridges and pier posts. */
export const SALT_PERCHES: SaltPoint[] = [];
/** Where smoke rises from: the smokehouse's roof louvre. */
export const SALT_SMOKE: (SaltPoint & { scale: number })[] = [];
/** Warm light spilled by windows and lanterns after dusk (`r` = glow scale, `k` = strength). */
export const SALT_GLOWS: (SaltPoint & { r: number; k: number })[] = [];
