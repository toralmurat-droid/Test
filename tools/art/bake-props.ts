/**
 * Bakes the 3D-built world props (paint/props3d.ts) to sheets in client/public/assets/hd/props/, loaded by the client
 * under the painted props' texture keys (worldProps.preloadBakedProps). `npx tsx tools/art/bake-props.ts [key ...]`;
 * PREVIEW=dir also writes painted-vs-baked comparison PNGs there.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { bakeSheet, renderProp } from "./paint/prop3d";
import { PROPS3D } from "./paint/props3d";
import { SIEGE_WORKS } from "./paint/siegeWorks3d";
import { DUNGEON3D } from "./paint/dungeon3d";
import { WRECK3D } from "./paint/wreck3d";
import { ELEMENTS3D } from "./paint/elements3d";
import * as el from "../../client/src/elementArt";
import { standingStone, throne } from "../../client/src/throneArt";
import { DEEP3D } from "./paint/deep3d";
import * as painted from "../../client/src/isoProps";
import { BLACKR, REDR } from "../../client/src/isoProps";
import { cow } from "../../client/src/farmArt";
import { millWheel } from "../../client/src/millArt";

const OUT = "client/public/assets/hd/props";
const only = process.argv.slice(2);

function png(argb: Uint32Array, w: number, h: number) {
  const cv = createCanvas(w, h), c = cv.getContext("2d"), img = c.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const v = argb[i]; img.data[i * 4] = (v >> 16) & 255; img.data[i * 4 + 1] = (v >> 8) & 255; img.data[i * 4 + 2] = v & 255; img.data[i * 4 + 3] = v >>> 24; }
  c.putImageData(img, 0, 0);
  return cv;
}
const PAINTED: Record<string, (p: any, f: number) => void> = {
  wp_lantern_pole: painted.lanternPole, wp_dummy: painted.dummy, wp_skull_pike: painted.skullPike, wp_net_rack: painted.netRack,
  wp_pennant_red: painted.warPennant(REDR, false), wp_pennant_black: painted.warPennant(BLACKR, true),
  wp_spear_rack: painted.spearRack(true), wp_watchtower: painted.watchtower, wp_cow0: cow(false), wp_cow1: cow(true), wp_millwheel: millWheel, wp_weapon_rack: painted.spearRack(false),
  wp_venom_caps: el.venomCaps, wp_ice_spikes: el.iceSpikes, wp_ember_vent: el.emberVent, wp_storm_stone: el.stormStone,
  wp_crownstone0: (p, f) => standingStone(p, f, 0, 0), wp_crownstone1: (p, f) => standingStone(p, f, 0, 1), wp_crownstone2: (p, f) => standingStone(p, f, 0, 2),
  wp_hollow_throne: throne, qobj_ward: (p, f) => standingStone(p, f, 1), qobj_ward_broken: (p, f) => standingStone(p, f, 2),
};
function paintedFrame(key: string, w: number, h: number, f: number) {
  const buf = new Uint32Array(w * h);
  const px = (x: number, y: number, c: number, a = 1) => {
    x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (a >= 1) { buf[i] = (0xff000000 | c) >>> 0; return; }
    if (!(buf[i] >>> 24)) buf[i] = ((Math.round(a * 255) << 24) | c) >>> 0;
  };
  const rect = (x: number, y: number, rw: number, rh: number, c: number) => { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) px(x + i, y + j, c); };
  const line = (x0: number, y0: number, x1: number, y1: number, c: number) => { const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) || 1; for (let i = 0; i <= n; i++) px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c); };
  PAINTED[key]({ px, rect, line }, f);
  return buf;
}

mkdirSync(OUT, { recursive: true });
const PREVIEW = process.env.PREVIEW;
if (PREVIEW) mkdirSync(PREVIEW, { recursive: true });
for (const P of [...PROPS3D, ...SIEGE_WORKS, ...DUNGEON3D, ...DEEP3D, ...WRECK3D, ...ELEMENTS3D]) {
  if (only.length && !only.includes(P.key)) continue;
  const t0 = Date.now();
  const sheet = bakeSheet(P.w, P.h, P.frames, (f) => renderProp(P.model(f), P.w, P.h, P.ox, P.oy), (P as { shadow?: number }).shadow ?? 0);
  writeFileSync(`${OUT}/${P.key}.png`, png(sheet, P.w * P.frames, P.h).toBuffer("image/png"));
  console.log(P.key, `${Date.now() - t0} ms`);
  if (PREVIEW && PAINTED[P.key]) {
    const before = bakeSheet(P.w, P.h, P.frames, (f) => paintedFrame(P.key, P.w, P.h, f), (P as { shadow?: number }).shadow ?? 0);
    const S = 4, W = P.w * P.frames, cv = createCanvas(W * S, P.h * 2 * S + 8), c = cv.getContext("2d");
    c.fillStyle = "#4a5a3a"; c.fillRect(0, 0, cv.width, cv.height);
    c.imageSmoothingEnabled = false;
    c.drawImage(png(before, W, P.h), 0, 0, W * S, P.h * S);
    c.drawImage(png(sheet, W, P.h), 0, P.h * S + 8, W * S, P.h * S);
    writeFileSync(`${PREVIEW}/${P.key}.png`, cv.toBuffer("image/png"));
  }
}
