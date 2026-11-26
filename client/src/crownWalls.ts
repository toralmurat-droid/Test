import { CR, CROWN_KEEP, THRONE_HALL } from "../../shared/crown";
import { T } from "../../shared/map";
import { CROWN_WALL_FRAMES } from "./crownWallFrames";

/**
 * The Crown Keep's walls as baked 3D pieces (Murat 2026-11-21: "3d isometric stone slabs for the outer one, a nice
 * wall with some moss for the inner one"). The curtain wall round the bailey is built of big cut slabs with a
 * battlement; the Throne Hall's walls are smaller coursed stones with moss. Each WALL_STONE tile of the Keep picks
 * the piece that matches its neighbours (wall arms N/E/S/W, crumbled ends against RUIN breaches), modelled and baked
 * by tools/art/paint/crownWalls3d.ts into one sheet (`cr_walls3d`); this file is pure so the bake can share it.
 */
export type WallStyle = "slab" | "moss";
/** Sheet frame size in texels, the tile centre's texel, texels per world px (like the other baked props). */
export const CRW = { key: "cr_walls3d", w: 96, h: 150, ox: 48, oy: 120, tx: 1.5, cols: 16 } as const;

const inRect = (x: number, y: number, r: { x: number; y: number; w: number; h: number }) => x >= r.x && x < r.x + r.w && y >= CR(r.y) && y < CR(r.y) + r.h;
const hsh = (x: number, y: number) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** The Keep wall style of a map tile, or undefined outside the Keep (other WALL_STONE keeps its usual block). */
export function wallStyleAt(tx: number, ty: number): WallStyle | undefined {
  if (inRect(tx, ty, THRONE_HALL)) return "moss";
  if (inRect(tx, ty, CROWN_KEEP)) return "slab";
  return undefined;
}

/**
 * The frame key of a Keep wall tile: style, wall-arm mask (N 1, E 2, S 4, W 8), crumbled-end mask (same bits, a RUIN
 * breach next to it) and a look variant. `obj(x, y)` = the object tile id there (-1 for none).
 */
export function wallKey(tx: number, ty: number, obj: (x: number, y: number) => number): string | undefined {
  const st = wallStyleAt(tx, ty);
  if (!st || obj(tx, ty) !== T.WALL_STONE) return undefined;
  let mask = 0, ruin = 0;
  ([[0, -1], [1, 0], [0, 1], [-1, 0]] as const).forEach(([dx, dy], i) => {
    const o = obj(tx + dx, ty + dy);
    if (o === T.WALL_STONE && wallStyleAt(tx + dx, ty + dy) === st) mask |= 1 << i;
    else if (o === T.RUIN) ruin |= 1 << i;
  });
  return `${st}_${mask}_${ruin}_${hsh(tx, ty) < 0.5 ? 0 : 1}`;
}

/** Every key the Keep uses on this map, sorted (the bake's frame order). */
export function wallKeys(objects: number[][], obj: (x: number, y: number) => number): string[] {
  const keys = new Set<string>();
  const K = CROWN_KEEP;
  for (let y = CR(K.y); y < CR(K.y) + K.h; y++) for (let x = K.x; x < K.x + K.w; x++) {
    if (objects[y]?.[x] === undefined) continue;
    const k = wallKey(x, y, obj);
    if (k) keys.add(k);
  }
  return [...keys].sort();
}

/** Parses a key back into its parts (for the bake). */
export function parseWallKey(k: string) {
  const [style, mask, ruin, v] = k.split("_");
  return { style: style as WallStyle, mask: +mask, ruin: +ruin, v: +v };
}

/** The sheet frame of a key, or -1 when the sheet has no such piece (the map changed since the bake: plain block). */
export const wallFrame = (key: string | undefined) => (key ? CROWN_WALL_FRAMES.indexOf(key) : -1);
