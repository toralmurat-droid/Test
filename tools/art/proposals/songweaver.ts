/**
 * Songweaver art tools. The hero is in HEROES (characters.ts), so `npm run art` builds the sheets, the kit overlays
 * (gear/songweaver_songweaver_{armour,hat,shoes,weapon}.webp, the ids the game loads), the other weapon stances and the
 * icon atlas. This script is for previews and the viewer's copies:
 *
 *   npx tsx tools/art/proposals/songweaver.ts sheets          -> re-renders just the Songweaver sheets and also writes
 *                                                                gear/songweaver_{slot}.webp (the names the published viewer reads)
 *   npx tsx tools/art/proposals/songweaver.ts preview <all> <dirs>  -> every animation x direction next to the Wizard
 *   npx tsx tools/art/proposals/songweaver.ts lute <out>      -> the lute alone, big, in each stance
 *   npx tsx tools/art/proposals/songweaver.ts lying <out> [hero]  -> bare / overlay / dressed in the lying poses
 *   npx tsx tools/art/proposals/songweaver.ts wave <out>      -> the sound-wave shot (projectile + impact) frames
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import type { Canvas } from "../canvas";
import { ANIMS, HEROES, PAINT_COLS, PAINT_DIRS, SONGWEAVER, buildSheet, setPainted, sheetFrames, animsOf } from "../characters";
import { diff } from "../gear";
import { PAINT_K } from "../paint/sheets";
import { setPaintForm, setPaintGear, setPaintKit } from "../paint/body";
import { KITS } from "../paint/look";
import { SOUND_WAVE_FRAMES, SOUND_WAVE_H, SOUND_WAVE_W, drawSoundWaveSheet } from "../../../client/src/soundWaveArt";

const OUT = "client/public/assets/hd";
const SLOTS = ["armour", "shoes", "hat", "weapon"] as const;
const kit = (slot: (typeof SLOTS)[number] | null) => { setPaintGear(null); setPaintForm(null); setPaintKit(slot ? KITS.songweaver[slot]! : null); };

function toNative(f: Canvas) {
  const c = createCanvas(f.w, f.h), x = c.getContext("2d"), id = x.createImageData(f.w, f.h);
  id.data.set(f.data); x.putImageData(id, 0, 0);
  return c;
}
function saveWebp(f: Canvas, path: string, q = 90) { writeFileSync(path, toNative(f).encodeSync("webp", q)); }

const mode = process.argv[2];
setPainted(true, PAINT_K, true);

if (mode === "sheets") {
  mkdirSync(`${OUT}/characters`, { recursive: true });
  mkdirSync(`${OUT}/gear`, { recursive: true });
  kit(null);
  const plain = buildSheet(SONGWEAVER);
  saveWebp(plain, `${OUT}/characters/songweaver.webp`);
  for (const s of SLOTS) {
    kit(s);
    const d = diff(plain, buildSheet(SONGWEAVER));
    saveWebp(d, `${OUT}/gear/songweaver_songweaver_${s}.webp`, 88); // what the game loads (hero_itemId)
    saveWebp(d, `${OUT}/gear/songweaver_${s}.webp`, 88);            // what the published viewer reads
  }
  kit(null);
  console.log("songweaver sheets written", plain.w, "x", plain.h);
}

/** One frame with the whole starter kit layered the way GearLayer stacks it. */
function dressedFrame(hero: typeof SONGWEAVER, anim: string, dir: string, fi: number, wearKit: boolean) {
  const out = createCanvas(48, 48), x = out.getContext("2d");
  kit(null);
  const bare = sheetFrames(hero, anim, dir as any)[fi];
  x.drawImage(toNative(bare), 0, 0);
  if (wearKit) for (const s of SLOTS) { kit(s); x.drawImage(toNative(diff(bare, sheetFrames(hero, anim, dir as any)[fi])), 0, 0); }
  kit(null);
  return out;
}

if (mode === "preview") {
  const wiz = HEROES.find((h) => h.name === "wizard")!;
  const wizKit = (anim: string, dir: string, fi: number) => {
    // the wizard in his own kit, for scale: his look is HERO_BODIES + KITS.wizard
    const out = createCanvas(48, 48), x = out.getContext("2d");
    setPaintKit(null); setPaintGear(null); setPaintForm(null);
    const bare = sheetFrames(wiz, anim, dir as any)[fi];
    x.drawImage(toNative(bare), 0, 0);
    for (const s of ["armour", "shoes", "hat", "weapon"] as const) { setPaintKit(KITS.wizard[s]!); x.drawImage(toNative(diff(bare, sheetFrames(wiz, anim, dir as any)[fi])), 0, 0); }
    setPaintKit(null);
    return out;
  };
  const all = animsOf(true);
  const sample = (n: number, k: number) => [...new Set(Array.from({ length: Math.min(n, k) }, (_, i) => Math.round(i * (n - 1) / Math.max(1, Math.min(n, k) - 1))))];
  const dirs = PAINT_DIRS as readonly string[];
  const Z = 3, F = 48 * Z, LAB = 22;
  // sheet 1 (argv[3]): every animation, 4 sampled frames, facing down then right; the Wizard's first frame on the left for scale
  // sheet 2 (argv[4]): the main loops in all five facings
  const sheet = (rows: { a: string; fr: number[]; ds: string[] }[], path: string) => {
    const cols = 1 + Math.max(...rows.map((r) => r.fr.length * r.ds.length));
    const cv = createCanvas(F * cols, (F + LAB) * rows.length), o = cv.getContext("2d");
    o.fillStyle = "#3d4530"; o.fillRect(0, 0, cv.width, cv.height); o.imageSmoothingEnabled = false; o.font = "bold 16px sans-serif";
    rows.forEach(({ a, fr, ds }, r) => {
      const y = r * (F + LAB);
      o.fillStyle = "#f2e6c8"; o.fillText(`${a}   [${ds.join(", ")}]   (left: Wizard, same pose)`, 6, y + 16);
      o.drawImage(wizKit(a, "down", fr[0]), 0, y + LAB, F, F);
      let c = 1;
      for (const d of ds) for (const fi of fr) o.drawImage(dressedFrame(SONGWEAVER, a, d, fi, true), c++ * F, y + LAB, F, F);
    });
    writeFileSync(path, cv.encodeSync("png"));
  };
  sheet(all.map((an) => ({ a: an.name, fr: sample(an.frames, 4), ds: ["down", "right"] })), process.argv[3] ?? "songweaver-all-anims.png");
  const dsel = ["down", "downright", "right", "upright", "up"].filter((d) => dirs.includes(d));
  sheet(["idle", "walk", "run", "attack", "attack3", "skill"].map((a) => ({ a, fr: sample(all.find((x) => x.name === a)!.frames, 3), ds: dsel })), process.argv[4] ?? "songweaver-dirs.png");
  console.log("anims", all.map((a) => a.name).join(","));
}

if (mode === "lute") {
  const Z = 6, F = 48 * Z, shots: [string, string, number][] = [["idle", "down", 0], ["idle", "right", 0], ["idle", "up", 0], ["attack", "right", 0], ["attack", "right", 1], ["attack", "right", 2], ["attack", "right", 3], ["attack", "down", 2]];
  const cv = createCanvas(F * 4, F * 2), o = cv.getContext("2d");
  o.fillStyle = "#3d4530"; o.fillRect(0, 0, cv.width, cv.height); o.imageSmoothingEnabled = false;
  shots.forEach(([a, d, fi], i) => o.drawImage(dressedFrame(SONGWEAVER, a, d, fi, true), (i % 4) * F, Math.floor(i / 4) * F, F, F));
  writeFileSync(process.argv[3] ?? "songweaver-lute.png", cv.encodeSync("png"));
}

if (mode === "wave") {
  // the sheet at 1x written as a PNG (assets/hd/fx/soundwave.png, for a later texture load) and a 8x preview on grass
  const sheet = createCanvas(SOUND_WAVE_W * SOUND_WAVE_FRAMES, SOUND_WAVE_H);
  drawSoundWaveSheet(sheet.getContext("2d") as any);
  mkdirSync(`${OUT}/fx`, { recursive: true });
  writeFileSync(`${OUT}/fx/soundwave.png`, sheet.encodeSync("png"));
  const Z = 6, cv = createCanvas(sheet.width * Z, sheet.height * Z), o = cv.getContext("2d");
  o.fillStyle = "#3d4530"; o.fillRect(0, 0, cv.width, cv.height); o.imageSmoothingEnabled = false;
  o.drawImage(sheet, 0, 0, cv.width, cv.height);
  writeFileSync(process.argv[3] ?? "songweaver-wave.png", cv.encodeSync("png"));
}
if (mode === "lying") {
  // bare body vs kit overlay vs dressed, for the lying poses (ko, ko2, sleep) of the Songweaver and another hero (argv[4])
  const other = HEROES.find((h) => h.name === (process.argv[4] ?? "wizard"))!;
  const Z = 4, F = 48 * Z, rows: [typeof SONGWEAVER, string, number][] = [[SONGWEAVER, "ko", 2], [SONGWEAVER, "ko2", 2], [SONGWEAVER, "sleep", 0], [other, "ko", 2], [other, "ko2", 2], [other, "sleep", 0]];
  const cv = createCanvas(F * 3, F * rows.length), o = cv.getContext("2d");
  o.fillStyle = "#3d4530"; o.fillRect(0, 0, cv.width, cv.height); o.imageSmoothingEnabled = false;
  rows.forEach(([h, a, fi], r) => {
    const k = (KITS as any)[h.name];
    const wear = (slot: string | null) => { setPaintGear(null); setPaintForm(null); setPaintKit(slot ? k[slot] : null); };
    wear(null);
    const bare = sheetFrames(h, a, "right")[fi];
    o.drawImage(toNative(bare), 0, r * F, F, F);
    const lay = createCanvas(48, 48), lx = lay.getContext("2d");
    for (const sl of SLOTS) { wear(sl); lx.drawImage(toNative(diff(bare, sheetFrames(h, a, "right")[fi])), 0, 0); }
    wear(null);
    o.drawImage(lay, F, r * F, F, F);
    const both = createCanvas(48, 48), bx = both.getContext("2d");
    bx.drawImage(toNative(bare), 0, 0); bx.drawImage(lay, 0, 0);
    o.drawImage(both, 2 * F, r * F, F, F);
  });
  writeFileSync(process.argv[3] ?? "songweaver-lying.png", cv.encodeSync("png"));
}
void ANIMS; void PAINT_COLS;
