// Contact sheet of the clan Holds as the game builds them from the fort cells (client/src/holdArt.ts):
//   npx tsx tools/art/preview/holds-sheet.ts out.png [zoom] [t1,t2]
// Top: one row per clan with its outpost, camp and fortress plan side by side. Below: real Holds (territory ids, default two) with the clan that fits them, trimmed to the map.
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { composeGround, fortLayout, paintPiece, pieceKey, type Painted } from "../../../client/src/holdArt";
import { CLAN_KEYS, type ClanKey } from "../../../shared/war/clans";
import { fortOf, planOf, type HoldFort } from "../../../shared/war/holdWalls";
import { HOLD_TIER_KEYS, type HoldTier } from "../../../shared/war/holdTiers";
import { HOLDS } from "../../../shared/war/standards";

const out = process.argv[2] ?? "holds-forts.png", Z = Number(process.argv[3] ?? 1);
const ts = (process.argv[4] ?? "").split(",").filter(Boolean).map(Number);

const toCanvas = (p: Painted): Canvas => {
  const c = createCanvas(p.w, p.h), g = c.getContext("2d"), img = g.createImageData(p.w, p.h);
  img.data.set(p.data); g.putImageData(img, 0, 0); return c;
};
const cache = new Map<string, Canvas>(), meta = new Map<string, Painted>();
function piece(k: string, spec: Parameters<typeof paintPiece>[0]) {
  let c = cache.get(k);
  if (!c) { const p = paintPiece(spec); meta.set(k, p); cache.set(k, c = toCanvas(p)); }
  return { c, p: meta.get(k)! };
}
/** Draws a fort (ground, then pieces by depth) with the middle cell at (cx, cy) of `g`; returns its size in texels. */
export function drawFort(g: ReturnType<Canvas["getContext"]>, f: HoldFort, cx: number, cy: number) {
  const ground = composeGround(f);
  g.drawImage(toCanvas(ground), cx - ground.ox, cy - ground.oy);
  const insts = fortLayout(f).sort((a, b) => (a.dx + a.dy) * 24 + a.foot / 1.5 - ((b.dx + b.dy) * 24 + b.foot / 1.5));
  for (const i of insts) {
    const { c, p } = piece(i.key, i.spec);
    g.drawImage(c, cx + (i.dx - i.dy) * 48 - p.ox, cy + (i.dx + i.dy) * 24 - p.oy);
  }
}
const planFort = (clan: ClanKey, tier: HoldTier): HoldFort => ({ t: -1, clan, tier, cx: 1000, cy: 1000, cells: planOf(clan, tier).cells, walls: [], gates: [], reach: 0 });

const items: { name: string; f: HoldFort }[] = CLAN_KEYS.flatMap((k) => ([0, 1, 2] as HoldTier[]).map((n) => ({ name: `${k} ${HOLD_TIER_KEYS[n]}`, f: planFort(k, n) })));
const real: { name: string; f: HoldFort }[] = [];
for (const t of ts.length ? ts : [HOLDS[3].t, HOLDS[HOLDS.length - 1].t]) {
  const clan = CLAN_KEYS[(real.length * 2 + 1) % CLAN_KEYS.length], f = fortOf(t, clan);
  if (f) real.push({ name: `Hold ${t} (${clan})`, f });
}
const all = [...items, ...real], COLS = 3, CW = 1300, CH = 800, ROWS = Math.ceil(all.length / COLS);
const cv = createCanvas(COLS * CW * Z, ROWS * CH * Z), g = cv.getContext("2d");
g.fillStyle = "#2c3a20"; g.fillRect(0, 0, cv.width, cv.height);
g.imageSmoothingEnabled = false;
all.forEach((r, i) => {
  const t = createCanvas(CW, CH), tg = t.getContext("2d"); tg.imageSmoothingEnabled = false;
  drawFort(tg, r.f, CW / 2, CH / 2 + 90);
  g.drawImage(t, (i % COLS) * CW * Z, Math.floor(i / COLS) * CH * Z, CW * Z, CH * Z);
  g.fillStyle = "#fff"; g.font = `${16 * Z}px sans-serif`; g.fillText(r.name, ((i % COLS) * CW + 12) * Z, (Math.floor(i / COLS) * CH + 24) * Z);
});
writeFileSync(out, cv.encodeSync("png"));
console.log(out, cv.width, cv.height);
void pieceKey;
