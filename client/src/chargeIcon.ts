import type { ClassKind } from "../../shared/classes";

/**
 * Pixel icon of a class's charges (Valor, Ki, Arcane, Focus, Fury), shown by the skill keys when an equipped skill
 * spends them. A small faceted crystal in the class colour, drawn in code at 16x16 and scaled up crisp.
 */
const PAL: Record<ClassKind, [string, string, string]> = {
  // dark, body, light
  knight: ["#5a1a12", "#c8402e", "#ffd2a0"],
  ninja: ["#0f3a3a", "#2fa39a", "#bff5e4"],
  wizard: ["#2a1450", "#7b4fd6", "#e2d0ff"],
  archer: ["#203812", "#6aa43a", "#e3f5b0"],
  barbarian: ["#4a1408", "#d0601e", "#ffe08a"],
};

// Crystal shape: o = outline, d = dark facet, b = body, l = light facet, w = glint
const SHAPE = [
  "......oo........",
  ".....owlo.......",
  "....owllbo......",
  "...owllbbbo.....",
  "..owllbbbbdo....",
  "..olllbbbbddo...",
  ".olllbbbbbddo...",
  ".ollbbbbbbddo...",
  ".olbbbbbbbddo...",
  "..obbbbbbddo....",
  "..obbbbbdddo....",
  "...obbbbddo.....",
  "....obbddo......",
  ".....oddo.......",
  "......oo........",
  "................",
];

const cache = new Map<string, string>();

export function chargeIcon(cls: ClassKind): string {
  const hit = cache.get(cls);
  if (hit) return hit;
  const [d, b, l] = PAL[cls] ?? PAL.knight;
  const col: Record<string, string> = { o: "#120a06", d, b, l, w: "#ffffff" };
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const g = c.getContext("2d")!;
  SHAPE.forEach((row, y) => [...row].forEach((ch, x) => {
    // shift right so the crystal sits in the middle of the cell
    if (col[ch]) { g.fillStyle = col[ch]; g.fillRect(x + 2, y + 1, 1, 1); }
  }));
  const url = c.toDataURL();
  cache.set(cls, url);
  return url;
}
