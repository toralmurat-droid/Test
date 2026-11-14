// One sheet with everything made for the Songweaver DI phases (docs/songweaver-di-plan.md):
//   npx tsx tools/art/preview/songweaver-di-art.ts docs/art/songweaver-di-art.png
// skill icons, books (icons and worn on the four active heroes), materials, lute traits, the lute-maker and her stall.
import { writeFileSync } from "node:fs";
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import type { Canvas } from "../canvas";
import { HEROES, NPCS, PAINT_DIRS, setPainted, sheetFrames } from "../characters";
import { diff } from "../gear";
import { wear } from "../paint/sheets";
import { ART_GEAR, BOOKS } from "../paint/books";
import { starterKit, GEAR } from "../../../shared/gear";
import { ICON, paintSkill } from "../../../client/src/skillArt";
import { MATERIAL_IDS, TRAIT_IDS, BOOK_IDS, songItemIcon } from "../../../client/src/songItemArt";
import { LUTIER_DRAW } from "../../../client/src/lutierDraw";

const W = 1700, out = createCanvas(W, 1600), o: SKRSContext2D = out.getContext("2d");
o.fillStyle = "#2a2e24"; o.fillRect(0, 0, W, 1600); o.imageSmoothingEnabled = false;
o.font = "14px sans-serif"; o.textBaseline = "top";
let y = 8;
const title = (t: string) => { o.fillStyle = "#e8d070"; o.fillText(t, 10, y); y += 20; };
const label = (t: string, x: number, yy: number) => { o.fillStyle = "#c8c8c0"; o.font = "11px sans-serif"; o.fillText(t, x, yy); o.font = "14px sans-serif"; };

function blit(cols: (string | number)[], n: number, x0: number, y0: number, z: number) {
  cols.forEach((c, i) => {
    if (c === "" || c === undefined) return;
    o.fillStyle = typeof c === "number" ? "#" + c.toString(16).padStart(6, "0") : c;
    o.fillRect(x0 + (i % n) * z, y0 + Math.floor(i / n) * z, z, z);
  });
}
function frame(f: Canvas, x: number, yy: number, z: number) {
  const c = createCanvas(f.w, f.h), x2 = c.getContext("2d"), id = x2.createImageData(f.w, f.h);
  id.data.set(f.data); x2.putImageData(id, 0, 0);
  o.drawImage(c, x, yy, f.w * z, f.h * z);
}

// ---- skill icons ----
title("Skill icons (24 px, x6): full-gauge effects, then song finishers");
const skills = ["sg_g_refrain", "sg_g_bless", "sg_g_rally", "sg_g_cacoph", "sg_f_hum", "sg_f_round", "sg_f_undertow", "sg_f_picardy"];
skills.forEach((id, i) => {
  const g = paintSkill(id);
  if (g) blit(g, ICON, 10 + i * 170, y, 6);
  label(id, 10 + i * 170, y + ICON * 6 + 2);
});
y += ICON * 6 + 22;

// ---- items ----
title("Books, materials (16 px, x8) and lute traits (12 px, x8)");
let x = 10;
const items = [...BOOK_IDS, ...MATERIAL_IDS.map((m) => "mat_" + m), ...TRAIT_IDS.map((t) => "trait_" + t)];
items.forEach((id) => {
  const ic = songItemIcon(id)!, z = 8, s = ic.n * z + 8;
  if (x + s > W - 10) { x = 10; y += 16 * z + 30; }
  o.fillStyle = "#3d4333"; o.fillRect(x - 2, y - 2, s, ic.n * z + 4);
  blit(ic.cols, ic.n, x + 2, y, z);
  label(id.replace("trait_", "t:").replace("songweaver_shield", "songbook"), x, y + ic.n * z + 4);
  // the same icon at its in-game size on a ground tile
  x += s + 14;
});
y += 16 * 8 + 34;

// ---- books worn ----
setPainted(true, 1.5, true);
const F = 48, Z = 2.5, ZK = 2.6;
title("Books worn: down, right and up (bare hero + book overlay), then the Songweaver in her full kit");
const active = HEROES.filter((h) => ["wizard", "vampire", "summoner", "songweaver"].includes(h.name));
const dirs = ["down", "right", "up"];
const bookIds = ART_GEAR.map((d) => d.id);
for (const h of active) {
  label(h.name, 10, y + 2);
  let cx = 70;
  for (const id of bookIds) {
    const d = [...ART_GEAR, ...Object.values(GEAR)].find((g) => g.id === id)!;
    if (d.cls && d.cls !== h.name) { cx += dirs.length * F * Z + 6; continue; }
    for (const dir of dirs) {
      wear(null);
      const bare = sheetFrames(h, "idle", dir as any)[0];
      wear(d);
      const ov = diff(bare, sheetFrames(h, "idle", dir as any)[0]);
      wear(null);
      o.fillStyle = "#3d4530"; o.fillRect(cx, y, F * Z, F * Z);
      frame(bare, cx, y, Z); frame(ov, cx, y, Z);
      cx += F * Z;
    }
    cx += 6;
  }
  y += F * Z + 4;
}
// the Songweaver in her whole kit (armour, hat, shoes, lute) with each book in the shield slot, 2x bigger
label("Songweaver in kit, book on the arm (x4)", 10, y + 2); y += 16;
{
  const h = HEROES.find((x) => x.name === "songweaver")!, kit = starterKit("songweaver");
  const slots = ["armour", "shoes", "ranged", "hat", "weapon"] as const;
  let cx = 10;
  for (const bid of bookIds) for (const dir of ["down", "downright", "up"]) {
    if (!(PAINT_DIRS as readonly string[]).includes(dir)) continue;
    wear(null);
    const bare = sheetFrames(h, "idle", dir as any)[0];
    const layers: Canvas[] = [];
    const defs = [...ART_GEAR, ...Object.values(GEAR)];
    for (const slot of slots) {
      const kid = kit[slot];
      if (!kid) continue;
      wear(GEAR[kid]); layers.push(diff(bare, sheetFrames(h, "idle", dir as any)[0]));
    }
    wear(defs.find((g) => g.id === bid)!); layers.push(diff(bare, sheetFrames(h, "idle", dir as any)[0])); wear(null);
    o.fillStyle = "#3d4530"; o.fillRect(cx, y, F * ZK, F * ZK);
    for (const f of [bare, ...layers]) frame(f, cx, y, ZK);
    cx += F * ZK + 2;
  }
  y += F * ZK + 10;
}

// ---- NPC and stall ----
title("Wren the lute-maker (x4, four facings) and her stall (x4, frame 0 and 6)");
{
  const npc = NPCS.find((n) => n.name === "lutemaker")!;
  let cx = 10;
  wear(null);
  for (const dir of ["down", "downright", "right", "up"]) {
    o.fillStyle = "#3d4530"; o.fillRect(cx, y, F * ZK, F * ZK);
    frame(sheetFrames(npc, "idle", dir as any)[0], cx, y, ZK); cx += F * ZK + 4;
  }
  // props: paint into a buffer and outline like sheet()
  const prop = (key: "lu_bench" | "lu_rack", f: number, px0: number) => {
    const d = LUTIER_DRAW[key], buf = new Uint32Array(d.w * d.h);
    const pen = {
      px(xx: number, yy: number, c: number) { xx = Math.round(xx); yy = Math.round(yy); if (xx >= 0 && yy >= 0 && xx < d.w && yy < d.h) buf[yy * d.w + xx] = 0xff000000 | c; },
      line(x0: number, y0: number, x1: number, y1: number, c: number) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) pen.px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c); },
      rect(xx: number, yy: number, w: number, h: number, c: number) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) pen.px(xx + i, yy + j, c); },
    };
    d.draw(pen, f);
    const solid = (a: number, b: number) => a >= 0 && b >= 0 && a < d.w && b < d.h && buf[b * d.w + a] >>> 24 > 140;
    const z = 4;
    o.fillStyle = "#3d4530"; o.fillRect(px0, y, d.w * z, d.h * z);
    for (let b = 0; b < d.h; b++) for (let a = 0; a < d.w; a++) {
      const v = buf[b * d.w + a];
      if (v >>> 24) { o.fillStyle = "#" + (v & 0xffffff).toString(16).padStart(6, "0"); o.fillRect(px0 + a * z, y + b * z, z, z); }
      else if (solid(a - 1, b) || solid(a + 1, b) || solid(a, b - 1) || solid(a, b + 1)) { o.fillStyle = "#15100d"; o.fillRect(px0 + a * z, y + b * z, z, z); }
    }
    return d.w * z;
  };
  cx += 10;
  cx += prop("lu_bench", 0, cx) + 10;
  cx += prop("lu_rack", 0, cx) + 6;
  prop("lu_rack", 6, cx);
  y += Math.max(F * ZK, 76 * 4) + 10;
}
void BOOKS;
writeFileSync(process.argv[2] ?? "songweaver-di-art.png", out.encodeSync("png"));
console.log("height used", y);
