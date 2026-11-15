/** Map sizes (w, h) that saved fog may have been stored at; rows keep their coordinates when the map grows downward. */
export const OLD_FOG_SIZES: [number, number][] = [[288, 592], [288, 288], [288, 216], [224, 168], [160, 120]];

/**
 * Fills `seen` (mapW*mapH bytes) from a saved fog string: loads directly when it matches the current size,
 * otherwise copies row by row from a known older size. Returns false when nothing matched.
 */
export function loadFog(bin: string, seen: Uint8Array, mapW: number, mapH: number): boolean {
  if (bin.length === seen.length) { for (let i = 0; i < bin.length; i++) seen[i] = bin.charCodeAt(i); return true; }
  for (const [ow, oh] of OLD_FOG_SIZES) {
    if (bin.length !== ow * oh) continue;
    for (let y = 0; y < oh && y < mapH; y++) for (let x = 0; x < ow && x < mapW; x++) seen[y * mapW + x] = bin.charCodeAt(y * ow + x);
    return true;
  }
  return false;
}
