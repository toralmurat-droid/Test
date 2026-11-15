/** Map sizes (w, h) that saved fog may have been stored at; rows keep their coordinates when the map grows downward. */
export const OLD_FOG_SIZES: [number, number][] = [[288, 960], [288, 776], [288, 592], [288, 288], [288, 216], [224, 168], [160, 120]];

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

/** Prefix of a compressed save (":" is not in base64, so raw saves, which are plain base64, never match). */
const Z1 = "z1:";
const b64 = (u: Uint8Array) => { let bin = ""; for (let i = 0; i < u.length; i += 4096) bin += String.fromCharCode(...u.subarray(i, i + 4096)); return btoa(bin); };

/**
 * The stored form of the fog: "z1:" + base64 of run-length pairs (count 1..255, value) over the bytes.
 * Fog is long runs of 0 (unknown) and 255 (seen) with a 3-tile soft edge, so an explored map is a fraction of the
 * raw 276 KB (368 KB in base64), which could hit the localStorage quota.
 */
export function encodeFog(d: Uint8Array): string {
  const out: number[] = [];
  for (let i = 0; i < d.length;) {
    const v = d[i]; let n = 1;
    while (n < 255 && i + n < d.length && d[i + n] === v) n++;
    out.push(n, v); i += n;
  }
  return Z1 + b64(Uint8Array.from(out));
}

/** A stored fog string (compressed "z1:" or the old raw base64) back to the binary string loadFog takes. Throws on bad data. */
export function decodeFog(stored: string): string {
  if (!stored.startsWith(Z1)) return atob(stored);
  const rle = atob(stored.slice(Z1.length)), parts: string[] = [];
  for (let i = 0; i + 1 < rle.length; i += 2) parts.push(rle[i + 1].repeat(rle.charCodeAt(i)));
  return parts.join("");
}
