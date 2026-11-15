// Bakes the clan Hold pieces to one atlas per clan (PNG + JSON) in client/public/assets/holds/.
// Run by `npm run art`, or alone: npx tsx tools/art/holds.ts [outDir]. The client loads them lazily (client/src/holdAssets.ts).
// Every look any Hold of that clan can need is baked: all pieces of fortLayout and all ground tiles of groundPlan,
// over every Hold, so the game never paints a piece at run time (a piece takes 20 to 125 ms to paint).
import { createCanvas } from "@napi-rs/canvas";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { atlasFile, ATLAS_PAD, ATLAS_W, type AtlasMeta, fortLayout, groundPlan, paintGround, paintPiece, type Painted, type PieceSpec } from "../../client/src/holdArt";
import { CLAN_KEYS, type ClanKey } from "../../shared/war/clans";
import { fortOf } from "../../shared/war/holdWalls";
import { HOLDS } from "../../shared/war/standards";

/** Every distinct piece and ground tile one clan's forts need across all Holds. */
export function looksOf(clan: ClanKey) {
  const pieces = new Map<string, PieceSpec>(), ground = new Map<string, { mask: number; v: number; road: boolean }>();
  for (const h of HOLDS) {
    const f = fortOf(h.t, clan);
    if (!f) continue;
    for (const i of fortLayout(f)) pieces.set(i.key, i.spec);
    for (const g of groundPlan(f).tiles) ground.set(g.key, g);
  }
  return { pieces, ground };
}

export function buildHolds(out: string) {
  mkdirSync(out, { recursive: true });
  for (const clan of CLAN_KEYS) {
    const t0 = Date.now(), { pieces, ground } = looksOf(clan), items: { key: string; p: Painted }[] = [];
    for (const [key, spec] of pieces) items.push({ key, p: paintPiece(spec) });
    for (const [key, g] of ground) items.push({ key, p: paintGround(clan, g.mask, g.v, g.road) });
    // shelf packing, tallest first, with a transparent gap so NEAREST scaling never bleeds a neighbour in
    items.sort((a, b) => b.p.h - a.p.h);
    const frames: AtlasMeta["frames"] = {};
    let x = ATLAS_PAD, y = ATLAS_PAD, row = 0;
    for (const { key, p } of items) {
      if (x + p.w + ATLAS_PAD > ATLAS_W) { x = ATLAS_PAD; y += row + ATLAS_PAD; row = 0; }
      frames[key] = { x, y, w: p.w, h: p.h, ox: p.ox, oy: p.oy };
      x += p.w + ATLAS_PAD; row = Math.max(row, p.h);
    }
    const H = y + row + ATLAS_PAD, cv = createCanvas(ATLAS_W, H), c = cv.getContext("2d");
    for (const { key, p } of items) {
      const f = frames[key], img = c.createImageData(p.w, p.h);
      img.data.set(p.data); c.putImageData(img, f.x, f.y);
    }
    const png = `${out}/${atlasFile(clan, "png")}`, json = `${out}/${atlasFile(clan, "json")}`;
    writeFileSync(png, cv.encodeSync("png"));
    writeFileSync(json, JSON.stringify({ w: ATLAS_W, h: H, frames } satisfies AtlasMeta));
    console.log(png, `${items.length} looks`, Math.round(statSync(png).size / 1024), "KB", `${Date.now() - t0} ms`);
  }
}
if (process.argv[1]?.endsWith("holds.ts")) buildHolds(process.argv[2] ?? "client/public/assets/holds");
