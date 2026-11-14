import type { GearDef } from "../../../shared/gear";
import { GEAR } from "../../../shared/gear";
import { C2, clipTo, css, curve, ellipseP, glow, line, poly, sh, vol } from "./brush";

/**
 * Books (shield slot): the Songweaver's Songbook and the three found books (docs/songweaver-di-plan.md). The painted
 * shield (body.ts `shield`) calls `paintBook` for any item id in BOOKS, whatever style the item table gives it.
 * ART_GEAR carries art-only stand-ins for the ids, so the overlays and icons are generated even before shared/gear.ts
 * lists them; once it does, the real entry wins (`gearDefs`).
 */
export interface BookLook { col: number; trim: number; page: number; emblem: number; mark: "lute" | "sun" | "drum" | "clef" }
export const BOOKS: Record<string, BookLook> = {
  // the kit book: a small leather songbook with a lute stamped in gold
  songweaver_shield: { col: 0x8a5a2c, trim: 0xe8d070, page: 0xe8e0c8, emblem: 0xe8d070, mark: "lute" },
  // Hymnal: warm gold and white, a radiant sun
  bk_hymnal: { col: 0xf1e9d0, trim: 0xe0a82c, page: 0xfffdf3, emblem: 0xe0a82c, mark: "sun" },
  // War March: rust red, a drum with crossed sticks
  bk_march: { col: 0xa8402a, trim: 0xd9a93a, page: 0xe8dcc0, emblem: 0xf0d9a0, mark: "drum" },
  // Dissonance: violet, a clef split by a crack
  bk_dissonance: { col: 0x5a2a8c, trim: 0xb890f0, page: 0xd8d0e8, emblem: 0xe6d0ff, mark: "clef" },
};

const stand = (id: string, name: string, tier: 1 | 2 | 3, cls?: string): GearDef => ({
  id, slot: "shield", tier, name, bonus: {}, color: BOOKS[id].col, accent: BOOKS[id].trim, style: "book", ...(cls ? { cls } : {}),
});
/** Art-only stand-ins (the real items live in shared/gear.ts). */
export const ART_GEAR: GearDef[] = [
  stand("songweaver_shield", "Songbook", 1, "songweaver"), stand("bk_hymnal", "Hymnal", 2), stand("bk_march", "War March", 2), stand("bk_dissonance", "Dissonance", 2),
];
/** Every item the generators draw: the item table, plus the book stand-ins it does not list yet. */
export function gearDefs(): GearDef[] {
  const all = [...Object.values(GEAR), ...ART_GEAR.filter((d) => !GEAR[d.id])];
  return only ? all.filter((d) => only!.includes(d.id)) : all;
}
let only: string[] | null = null;
/** Limits `gearDefs` to some item ids (new-books.ts renders just the books without redoing every overlay); null = all. */
export function setItemFilter(ids: string[] | null) { only = ids; }

const brown = 0x2a1a0e;

/**
 * Paints a book held on the arm at (cx, cy). `front`: the cover with its emblem (facing the viewer), `back`: the plain back
 * cover with a strap, `edge`: seen from the side as a thin slab (spine towards us). `K` dims colours like the rest of the body.
 */
export function paintBook(c: C2, id: string, cx: number, cy: number, view: "front" | "back" | "edge", K: (n: number) => number) {
  const b = BOOKS[id];
  if (!b) return;
  const col = K(b.col), trim = K(b.trim), page = K(b.page), em = K(b.emblem);
  if (view === "edge") {
    // the slab seen from the side: cover, page block, cover, a bright spine line
    const x = cx, y = cy;
    const s = poly([[x - 0.5, y - 0.4], [x + 1.2, y - 0.4], [x + 1.2, y + 7], [x - 0.5, y + 7]]);
    vol(c, s, col, [x - 0.5, y - 0.4, 1.7, 7.4], { ao: 0.3 });
    line(c, [[x + 0.45, y - 0.2], [x + 0.45, y + 6.8]], page, 0.35);
    line(c, [[x - 0.35, y], [x - 0.35, y + 6.6]], trim, 0.25, 0.9);
    return;
  }
  const x0 = cx - 2.8, x1 = cx + 2.8, y0 = cy - 3.7, y1 = cy + 3.7;
  const cover = poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  // pages peeking out at the right and bottom
  line(c, [[x1 + 0.3, y0 + 0.5], [x1 + 0.3, y1 + 0.3], [x0 + 0.8, y1 + 0.3]], page, 0.7);
  line(c, [[x1 + 0.7, y0 + 0.9], [x1 + 0.7, y1 - 0.2]], sh(page, 0.8), 0.25);
  vol(c, cover, col, [x0, y0, x1 - x0, y1 - y0], { ao: 0.4, spec: 0.12 });
  // the spine band and the trim
  vol(c, poly([[x0, y0], [x0 + 1.1, y0], [x0 + 1.1, y1], [x0, y1]]), sh(col, 0.72), [x0, y0, 1.1, y1 - y0], { ao: 0.2 });
  clipTo(c, cover, () => {
    c.beginPath(); cover(c); c.strokeStyle = css(view === "back" ? sh(trim, 0.8) : trim); c.lineWidth = 0.55; c.stroke();
  });
  line(c, [[x0 + 1.1, y0 + 0.2], [x0 + 1.1, y1 - 0.2]], trim, 0.25, 0.8);
  if (view === "back") { // a leather strap and a clasp
    line(c, [[x0 + 1.1, cy + 0.4], [x1 + 0.2, cy + 0.4]], sh(col, 0.6), 0.7);
    line(c, [[x1 - 0.8, cy - 0.6], [x1 - 0.8, cy + 1.4]], trim, 0.45);
    return;
  }
  const ex = cx + 0.6, ey = cy, W = 0.35;
  switch (b.mark) {
    case "lute": { // pear body, neck up and to the right, a dark sound hole
      c.beginPath(); ellipseP(ex - 0.7, ey + 1, 1.5, 1.7, -0.5)(c); c.fillStyle = css(em); c.fill();
      line(c, [[ex + 0.1, ey + 0.1], [ex + 1.9, ey - 2.2]], em, 0.45);
      c.beginPath(); ellipseP(ex - 0.7, ey + 1.1, 0.45, 0.45)(c); c.fillStyle = css(brown); c.fill();
      c.beginPath(); c.arc(ex + 2.0, ey - 2.4, 0.4, 0, 7); c.fillStyle = css(sh(em, 1.25)); c.fill();
      break;
    }
    case "sun": { // a gold disc with eight rays
      glow(c, ex, ey, 2.6, em, 0.35);
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; line(c, [[ex + Math.cos(a) * 1.5, ey + Math.sin(a) * 1.5], [ex + Math.cos(a) * 2.5, ey + Math.sin(a) * 2.5]], em, W); }
      c.beginPath(); ellipseP(ex, ey, 1.1, 1.1)(c); c.fillStyle = css(sh(em, 1.15)); c.fill();
      break;
    }
    case "drum": { // a drum with two crossed sticks
      line(c, [[ex - 2, ey - 2.5], [ex + 1.6, ey + 0.2]], em, 0.3); line(c, [[ex + 2.2, ey - 2.5], [ex - 1.4, ey + 0.2]], em, 0.3);
      vol(c, poly([[ex - 1.8, ey - 0.4], [ex + 1.8, ey - 0.4], [ex + 1.8, ey + 2.2], [ex - 1.8, ey + 2.2]]), em, [ex - 1.8, ey - 0.4, 3.6, 2.6], { ao: 0.3 });
      c.beginPath(); ellipseP(ex, ey - 0.4, 1.8, 0.6)(c); c.fillStyle = css(sh(em, 1.2)); c.fill();
      line(c, [[ex - 1.8, ey + 0.4], [ex - 0.6, ey + 2.2], [ex + 0.6, ey + 0.4], [ex + 1.8, ey + 2.2]], sh(col, 0.7), 0.2);
      break;
    }
    case "clef": { // a clef (stem, loop, curl) and a crack tearing across the cover
      curve(c, [ex, ey - 2.8], [ex + 1.7, ey - 1.2], [ex - 0.2, ey - 0.2], em, 0.4);
      curve(c, [ex - 0.2, ey - 0.2], [ex - 1.6, ey - 1.5], [ex + 0.4, ey - 2.2], em, 0.3);
      line(c, [[ex, ey - 3], [ex, ey + 1.8]], em, 0.4);
      curve(c, [ex, ey + 1.8], [ex - 1.7, ey + 3], [ex - 1.2, ey + 1.5], em, 0.35);
      line(c, [[x1 - 0.6, y0 + 0.2], [ex + 0.8, ey - 1.4], [ex + 1.4, ey + 0.2], [ex - 0.3, ey + 1.2], [ex + 0.4, y1 - 0.2]], 0x12061f, 0.3, 0.95);
      break;
    }
  }
}


