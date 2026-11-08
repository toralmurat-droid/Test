import type { Pen } from "./worldProps";

/**
 * Painting small iso solids texel by texel for the dungeon props: world texels (a east, b south, z up) seen from the
 * south-east like the map, X = ox + a - b, Y = oy + (a + b) / 2 - z. Boxes paint their three visible faces (top, the
 * south face lit from the top left, the east face in shade); each face's colour function returns -1 to leave a hole.
 */
export type Face = (u: number, v: number) => number;
export interface Iso {
  put(a: number, b: number, z: number, c: number, alpha?: number): void;
  box(a0: number, a1: number, b0: number, b1: number, z0: number, z1: number, top: Face | number, south: Face | number, east: Face | number): void;
  /** A thin square post or bar from z0 to z1 at (a, b), half-width r, colours [top, south, east]. */
  post(a: number, b: number, z0: number, z1: number, r: number, c: [number, number, number]): void;
  /** A straight rod between two world points, radius ~r, one colour per texel along it (lit side first). */
  rod(a0: number, b0: number, z0: number, a1: number, b1: number, z1: number, c: number, c2?: number): void;
  X(a: number, b: number): number;
  Y(a: number, b: number, z: number): number;
}

export function iso(p: Pen, ox: number, oy: number): Iso {
  const X = (a: number, b: number) => ox + a - b, Y = (a: number, b: number, z: number) => oy + (a + b) / 2 - z;
  const put = (a: number, b: number, z: number, c: number, alpha = 1) => { if (c >= 0) p.px(Math.floor(X(a, b)), Math.floor(Y(a, b, z)), c, alpha); };
  const f = (fc: Face | number) => (typeof fc === "number" ? () => fc : fc);
  const box: Iso["box"] = (a0, a1, b0, b1, z0, z1, top, south, east) => {
    const T = f(top), S = f(south), E = f(east);
    for (let b = b0; b <= b1; b += 0.5) for (let z = z0; z <= z1; z += 0.5) put(a1, b, z, E(b - b0, z - z0));
    for (let a = a0; a <= a1; a += 0.5) for (let z = z0; z <= z1; z += 0.5) put(a, b1, z, S(a - a0, z - z0));
    for (let b = b0; b <= b1; b += 0.5) for (let a = a0; a <= a1; a += 0.5) put(a, b, z1, T(a - a0, b - b0));
  };
  const post: Iso["post"] = (a, b, z0, z1, r, c) => box(a - r, a + r, b - r, b + r, z0, z1, c[0], c[1], c[2]);
  const rod: Iso["rod"] = (a0, b0, z0, a1, b1, z1, c, c2) => {
    const n = Math.ceil(Math.max(Math.abs(X(a1, b1) - X(a0, b0)), Math.abs(Y(a1, b1, z1) - Y(a0, b0, z0))) * 2) + 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = a0 + (a1 - a0) * t, b = b0 + (b1 - b0) * t, z = z0 + (z1 - z0) * t;
      put(a, b, z, c);
      if (c2 !== undefined) put(a + 0.7, b + 0.7, z, c2);
    }
  };
  return { put, box, post, rod, X, Y };
}
