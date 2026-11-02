import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import type { Canvas } from "../canvas";
import { buildSheet, HEROES, NPCS, setPainted } from "../characters";
import { diff } from "../gear";
import { GEAR, GEAR_IDS } from "../../../shared/gear";
import { setPaintGear } from "./body";

/** Painted (smooth) character sheets: same layout and animations as the pixel ones, 96px frames, WebP. */
export const PAINT_K = 3;

function saveWebp(c: Canvas, path: string, q = 90) {
  const n = createCanvas(c.w, c.h), x = n.getContext("2d");
  const img = x.createImageData(c.w, c.h);
  img.data.set(c.data);
  x.putImageData(img, 0, 0);
  writeFileSync(path, n.encodeSync("webp", q));
}

export function buildPainted(out: string, opts: { gear?: boolean; only?: string[] } = {}) {
  setPainted(true, PAINT_K);
  mkdirSync(`${out}/characters`, { recursive: true });
  mkdirSync(`${out}/gear`, { recursive: true });
  const want = (n: string) => !opts.only?.length || opts.only.includes(n);
  for (const h of [...HEROES, ...NPCS]) {
    if (!want(h.name)) continue;
    setPaintGear(null);
    const plain = buildSheet(h);
    saveWebp(plain, `${out}/characters/${h.name}.webp`);
    console.log("painted", h.name);
    if (opts.gear === false || !HEROES.includes(h)) continue;
    for (const id of GEAR_IDS) {
      setPaintGear(GEAR[id]);
      saveWebp(diff(plain, buildSheet(h)), `${out}/gear/${h.name}_${id}.webp`, 88);
    }
    setPaintGear(null);
    console.log("  gear", h.name);
  }
  setPainted(false, 2);
}
