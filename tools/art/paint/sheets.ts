import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import type { Canvas } from "../canvas";
import { buildSheet, HEROES, NPCS, setPainted } from "../characters";
import { diff } from "../gear";
import { GEAR, GEAR_IDS } from "../../../shared/gear";
import { gearDefs } from "./books";
import { setPaintForm, setPaintGear, setPaintKit } from "./body";
import { KITS } from "./look";

/** Painted-then-pixelated character sheets: same layout and animations as the old ones, 36px frames (1.5 texels per world px), PNG-quality WebP. */
export const PAINT_K = 1.5; // 48px frames: 1.5 texels per world px (a hero frame is 32 world px, a third taller than the old heroes)

function saveWebp(c: Canvas, path: string, q = 90) {
  const n = createCanvas(c.w, c.h), x = n.getContext("2d");
  const img = x.createImageData(c.w, c.h);
  img.data.set(c.data);
  x.putImageData(img, 0, 0);
  writeFileSync(path, n.encodeSync("webp", q));
}

/** Puts one item on the bare hero for the next render: a class kit adds its Look fields, found gear restyles a part. */
export function wear(d: (typeof GEAR)[string] | null) {
  const kit = d?.cls ? KITS[d.cls]?.[d.slot as keyof (typeof KITS)[string]] ?? null : null;
  setPaintKit(kit);
  setPaintGear(d && !d.cls ? d : null);
  setPaintForm(d?.slot === "weapon" ? d : null);
}

export function buildPainted(out: string, opts: { gear?: boolean; only?: string[] } = {}) {
  setPainted(true, PAINT_K, true);
  mkdirSync(`${out}/characters`, { recursive: true });
  mkdirSync(`${out}/gear`, { recursive: true });
  const want = (n: string) => !opts.only?.length || opts.only.includes(n);
  for (const h of [...HEROES, ...NPCS]) {
    if (!want(h.name)) continue;
    wear(null);
    const plain = buildSheet(h);
    saveWebp(plain, `${out}/characters/${h.name}.webp`);
    console.log("painted", h.name);
    if (opts.gear === false || !HEROES.includes(h)) continue;
    for (const d of gearDefs()) {
      const id = d.id;
      if (d.cls && d.cls !== h.name) continue; // class kits only fit their own class
      wear(d);
      saveWebp(diff(plain, buildSheet(h)), `${out}/gear/${h.name}_${id}.webp`, 88);
    }
    wear(null);
    console.log("  gear", h.name);
  }
  setPainted(false, 2);
}
