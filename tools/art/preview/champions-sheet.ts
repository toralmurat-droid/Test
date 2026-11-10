// Preview sheet of the champions (shared/champions.ts): each one beside the plain monster, with the family tint, the
// glowing outline, the affix icons, the painted details (mob_champ_*) and the name, as the client draws them.
//   npx tsx tools/art/preview/champions-sheet.ts docs/art/champions-preview.png [zoom]
import { createCanvas, GlobalFonts, loadImage, type Image } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "node:fs";
import type { MobKind } from "../../../shared/constants";
import { AFFIXES, FAMILIES, FAMILY_OF, championName, overlayPlace, type AffixKey } from "../../../shared/champions";

const out = process.argv[2] ?? "docs/art/champions-preview.png", Z = Number(process.argv[3] ?? 4);
const DIR = "client/public/assets/hd/mobs", meta = JSON.parse(readFileSync(`${DIR}/mobs.json`, "utf8"));
try { GlobalFonts.registerFromPath("node_modules/@fontsource/pixelify-sans/files/pixelify-sans-latin-400-normal.woff2", "Pixel"); } catch { /* plain font */ }

/** Head height and feet line of the sheets shown (client/src/textures.ts PAINTED_LOOK). */
const LOOK: Partial<Record<string, { top: number; oy: number; sheet?: string }>> = {
  slime: { top: 13, oy: 0.9 }, fireblob: { top: 19, oy: 0.94 }, frostblob: { top: 20, oy: 0.94 }, motherblob: { top: 20, oy: 0.92, sheet: "mob_motherblob2" },
  skeleton: { top: 23, oy: 27.5 / 30 }, skeletonmage: { top: 25, oy: 0.975 }, tuskborn: { top: 28, oy: 29.5 / 32 }, gnawkin: { top: 25, oy: 27.5 / 30 },
  duskwing: { top: 34, oy: 36 / 38 }, bandit: { top: 23, oy: 27.5 / 30 }, veiled: { top: 26, oy: 31.2 / 32 }, sanddead: { top: 24, oy: 27.5 / 30 },
  sphinx: { top: 38, oy: 36.5 / 40 }, scorpion: { top: 20, oy: 27 / 30 }, nomad: { top: 24, oy: 27.5 / 30 }, camelfolk: { top: 36, oy: 33.5 / 36 },
};
const SHOW: [MobKind, AffixKey[]][] = [
  ["slime", ["split"]], ["fireblob", ["taint"]], ["frostblob", ["split", "taint"]], ["motherblob", ["split"]],
  ["skeleton", ["siege"]], ["skeletonmage", ["risen"]], ["skeleton", ["siege", "risen"]], ["tuskborn", ["stitched"]],
  ["duskwing", ["stitched"]], ["bandit", ["gang"]], ["veiled", ["sunborn"]], ["sanddead", ["buried"]],
  ["sphinx", ["buried"]], ["scorpion", ["deepvenom"]], ["nomad", ["veil"]], ["camelfolk", ["brand"]],
];
const COLS = 4, CW = 104, CH = 92; // one cell in world px: plain monster | champion, name under it

const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

(async () => {
  const img = new Map<string, Image>();
  const load = async (k: string) => { if (!img.has(k)) img.set(k, await loadImage(readFileSync(`${DIR}/${k}.webp`))); return img.get(k)!; };
  const rows = Math.ceil(SHOW.length / COLS);
  const cv = createCanvas(COLS * CW * Z, (rows * CH + 18) * Z), c = cv.getContext("2d");
  c.imageSmoothingEnabled = false;
  c.fillStyle = "#3b3a2c"; c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = "#f0e6c8"; c.font = `${6 * Z}px Pixel, sans-serif`; c.textAlign = "left";
  c.fillText("Champions: plain | champion (aura, icons; humanoids: another weapon; blobs, scorpion: a detail)", 4 * Z, 11 * Z);

  /** One frame of a sheet onto an offscreen canvas at world size x Z, tinted and outlined when asked. */
  const sprite = async (key: string, frame: number, tint?: number, aura?: number) => {
    const m = meta[key], src = await load(key), fw = m.w * m.scale, fh = m.h * m.scale;
    const pad = 2, w = fw + pad * 2, h = fh + pad * 2;
    const o = createCanvas(w, h), oc = o.getContext("2d");
    oc.drawImage(src, frame * fw, 0, fw, fh, pad, pad, fw, fh);
    if (tint !== undefined || aura !== undefined) {
      const d = oc.getImageData(0, 0, w, h), a0 = new Uint8ClampedArray(d.data);
      const [tr, tg, tb] = rgb(tint ?? 0xffffff), [ar, ag, ab] = rgb(aura ?? 0);
      for (let i = 0; i < d.data.length; i += 4) {
        if (a0[i + 3] > 200) { d.data[i] = d.data[i] * tr / 255; d.data[i + 1] = d.data[i + 1] * tg / 255; d.data[i + 2] = d.data[i + 2] * tb / 255; continue; }
        if (aura === undefined) continue;
        const x = (i / 4) % w, y = Math.floor(i / 4 / w);
        let near = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const j = ((y + dy) * w + x + dx) * 4; if (a0[j + 3] > 200) near = true; }
        if (near) { d.data[i] = ar; d.data[i + 1] = ag; d.data[i + 2] = ab; d.data[i + 3] = 210; }
      }
      oc.putImageData(d, 0, 0);
    }
    return { o, fw, fh, pad, scale: m.scale };
  };

  for (const [n, [kind, affixes]] of SHOW.entries()) {
    const col = n % COLS, row = Math.floor(n / COLS), x0 = col * CW, y0 = 18 + row * CH;
    if ((col + row) % 2) { c.fillStyle = "#353427"; c.fillRect(x0 * Z, y0 * Z, CW * Z, CH * Z); }
    const L = LOOK[kind]!, key = L.sheet ?? `mob_${kind}`, fam = FAMILIES[FAMILY_OF[kind]!];
    const feetY = y0 + 66;
    for (const champ of [false, true]) {
      const fx = x0 + (champ ? 70 : 26);
      const s = await sprite(champ && meta[`${key}_champ`] ? `${key}_champ` : key, 6, champ ? fam.tint : undefined, champ ? fam.aura : undefined);
      const w = s.fw / s.scale, h = s.fh / s.scale;
      if (champ) { // the ring under its feet
        c.fillStyle = `rgba(${rgb(fam.aura).join(",")},0.28)`; c.beginPath(); c.ellipse(fx * Z, feetY * Z, 11 * Z, 4 * Z, 0, 0, Math.PI * 2); c.fill();
      }
      c.drawImage(s.o, (fx - w / 2 - s.pad / s.scale) * Z, (feetY - h * L.oy - s.pad / s.scale) * Z, (w + 2 * s.pad / s.scale) * Z, (h + 2 * s.pad / s.scale) * Z);
      if (!champ) continue;
      for (const a of affixes.filter((k) => AFFIXES[k].overlay)) { // painted details (blobs, scorpions)
        const ov = await load(`mob_champ_${a}`), om = meta[`mob_champ_${a}`], P = overlayPlace(a, L.top);
        const ow = om.w * P.scale, oh = om.h * P.scale;
        c.drawImage(ov, 0, 0, om.w * om.scale, om.h * om.scale, (fx - ow / 2) * Z, (feetY + P.dy - oh * P.oy) * Z, ow * Z, oh * Z);
      }
      // affix icons over the HP bar
      const iy = feetY - L.top - 13, by = feetY - L.top;
      affixes.forEach((a, i) => {
        const ix = fx - affixes.length * 3.5 + i * 7 + 1, A = AFFIXES[a];
        c.fillStyle = "rgba(0,0,0,0.65)"; c.fillRect((ix - 1) * Z, (iy - 1) * Z, 7 * Z, 7 * Z);
        c.fillStyle = `rgb(${rgb(A.color).join(",")})`;
        A.icon.forEach((bits, y) => { for (let b = 0; b < 5; b++) if (bits & (1 << (4 - b))) c.fillRect((ix + b) * Z, (iy + y) * Z, Z, Z); });
      });
      c.fillStyle = "#f4a261"; c.fillRect((fx - 9) * Z, (by - 4) * Z, 18 * Z, 2 * Z);
    }
    let seed = n * 7 + 3; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    c.textAlign = "center"; c.font = `${5.5 * Z}px Pixel, sans-serif`;
    c.fillStyle = "#ffd166"; c.fillText(`${championName(kind, affixes, rnd)} Lv30`, (x0 + CW / 2) * Z, (feetY + 11) * Z);
    c.fillStyle = "#c8c0a8"; c.font = `${4.5 * Z}px Pixel, sans-serif`;
    c.fillText(`${kind} · ${affixes.map((a) => AFFIXES[a].name).join(" + ")}`, (x0 + CW / 2) * Z, (feetY + 19) * Z);
  }
  writeFileSync(out, cv.encodeSync("png"));
  console.log("wrote", out);
})();
