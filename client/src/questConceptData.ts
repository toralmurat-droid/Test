/**
 * Pixel data of the quest-concept objects and the hide-bound hero overlay (docs/quest-concepts-progress.md).
 * Pure data, no Phaser, so tools/art/preview/quest-objects.ts can render it too. questConceptArt.ts turns it into textures.
 * Row strings: one char per texel, "." is empty, the letters index the palette. Cosmetic only: nothing here is seen by the server.
 */
export interface PixelArt { rows: string[]; pal: Record<string, number> }

const K = 0x1a1420;
const stone = { K, S: 0x8a8f96, L: 0xb9bec4, D: 0x5a5f66 };

// ---- grave: headstone with a cross, earth mound; dug up: a dark pit, the heap beside it and the spade left standing
const GRAVE = [
  "......KKKKKK....",
  ".....KSLLLSSK...",
  "....KSLSSSSSK...",
  "....KSSSGSSSK...",
  "....KSSGGGSSK...",
  "....KSSSGSSDK...",
  "....KSSSGSSDK...",
  "...KKSSSSSSDKK..",
  "..KMMMMMMMMMMMK.",
  ".KMMLMMMMMMLMMMK",
  "KMMMMMMMMMMMMMMK",
  "KMMMLMMMMMMMMMDK",
  ".KDDDDDDDDDDDDK.",
  "..KKKKKKKKKKKK..",
];
const GRAVE_OPEN = [
  "......KKKKKK..B.",
  ".....KSLLLSSK.B.",
  "....KSLSSSSSK.B.",
  "....KSSSGSSSK.B.",
  "....KSSGGGSSK.B.",
  "....KSSSGSSDK.BK",
  "....KSSSGSSDKIII",
  "...KKSSSSSSDKIII",
  "..KMKPPPPPPKMMMK",
  ".KMMKPPPPPPPKMMK",
  "KMMMKPPPPPPPPKMK",
  "KMMLMKPPPPPPPKMK",
  ".KDDDKKKKKKKKDK.",
  "..KKKKKKKKKKKK..",
];

// ---- seal: a round stone slab in the floor (iso, flat), a ring of runes round a hub; turned: the runes burn gold
const SEAL = [
  "......KKKKKKKK......",
  "....KKSSSSSSSSKK....",
  "..KKSSLLSSSSSSSSKK..",
  ".KSSLLSSGGGGSSSSSSK.",
  "KSSLSSGGSSSSGGSSSSDK",
  "KSSSSGSSSRRSSSGSSSDK",
  "KSSSSGSSSRRSSSGSSSDK",
  "KDSSSSGGSSSSGGSSSDDK",
  ".KDDSSSSGGGGSSSSDDK.",
  "..KKDDDDDDDDDDDDKK..",
  "....KKKKKKKKKKKK....",
];
/** The Crown Seal: Ostrevar's crown stamped over the hub. */
const CROWN = ["C.CC.C", "CCCCCC", "CCYYCC", "CCCCCC"];
const SEAL_CROWN = SEAL.map((r, y) => {
  if (y < 4 || y > 7) return r;
  const s = CROWN[y - 4], a = [...r];
  [...s].forEach((ch, i) => { if (ch !== ".") a[7 + i] = ch; });
  return a.join("");
});

// ---- ward-lamp: an iron lantern on a weathered post in a stone footing
const WARDLAMP = [
  "....KKKK....",
  "...KIIIIK...",
  "..KIIIIIIK..",
  "..KKKKKKKK..",
  "..KGWWWWGK..",
  "..KGWYYWGK..",
  "..KGWYYWGK..",
  "..KGGWWGGK..",
  "..KKKKKKKK..",
  "....KPPK....",
  "....KPLK....",
  "....KPPK....",
  "....KPLK....",
  "....KPPK....",
  "....KPPK....",
  "...KPPPPK...",
  "..KSSSSSSK..",
  ".KSLSSSSDDK.",
  ".KKKKKKKKKK.",
];

// ---- postern: a small hidden door in a cliff face; open: a black doorway with the stone leaf swung back
const POSTERN = [
  ".....KKKKKK.....",
  "...KKCCCCCCKK...",
  "..KCCLCCCCCCCK..",
  ".KCCCKKKKKKCCCK.",
  "KCCLKSSSSSSKCCCK",
  "KCCCKSLSSSSKCCCK",
  "KCCCKSSSSSSKCDCK",
  "KCCCKSSSRSSKCCCK",
  "KCDCKSSSSSSKCCCK",
  "KCCCKSSSSSSKCCDK",
  "KCCCKSSSSSSKCCCK",
  "KDCCKSSSSSSKCCCK",
  "KCCCKKKKKKKKCCCK",
  "KCCDDCCCCCCDCCCK",
  "KDDDDDDDDDDDDDDK",
  "KKKKKKKKKKKKKKKK",
];
const POSTERN_OPEN = POSTERN.map((r, y) => (y >= 4 && y <= 11 ? r.slice(0, 5) + r.slice(5, 11).replace(/[SLR]/g, "D") + r.slice(11) : r))
  .map((r, y) => (y >= 4 && y <= 11 ? r.slice(0, 5) + "H" + r.slice(6) : r));

// ---- lantern on the ground (Last Lantern): a small hand lantern, warm flame; and the same, burned out
const LAMP = [
  "...KKKK...",
  "..KIIIIK..",
  ".KKKKKKKK.",
  ".KGWWWWGK.",
  ".KGWYYWGK.",
  ".KGWYYWGK.",
  ".KGGWWGGK.",
  ".KKKKKKKK.",
  "..KPPPPK..",
  "...KKKK...",
];
/** Smaller lantern shown over a hero's head while carried. */
const LAMP_SMALL = [
  ".KKK.",
  "KGWGK",
  "KWYWK",
  "KGWGK",
  ".KKK.",
];

// ---- Mags' ale-cart (NPC_DECOR prop "ale_cart"): two barrels on a small two-wheeled cart with pulling shafts
const ALE_CART = [
  "...KKKKK...KKKKK.........",
  "..KBLLBBK.KBLLBBK........",
  "..KHHHHHK.KHHHHHK........",
  "..KBLBBBK.KBLBBBK........",
  "..KBBBBDK.KBBBBDK........",
  "..KHHHHHK.KHHHHHK........",
  "..KBBBBDK.KBBBBDK........",
  "..KKKKKKK.KKKKKKK........",
  "KWWLWWWWWWWWWWWWWWWKKKKKK",
  "KDDDDDDDDDDDDDDDDDDSSSSSK",
  ".KKKKKKKKKKKKKKKKKKKKKKK.",
  "..KWWWWK........KWWWWK...",
  ".KWKWWKWK......KWKWWKWK..",
  ".KWWWHWWK......KWWWHWWK..",
  ".KWKWWKWK......KWKWWKWK..",
  "..KWWWWK........KWWWWK...",
  "...KKKK..........KKKK....",
];

const iron = { I: 0x4b5563, P: 0x6a5238 };
export const CONCEPT_ART: Record<string, PixelArt> = {
  qobj_grave: { rows: GRAVE, pal: { K, S: 0x8a8f96, L: 0xb9bec4, D: 0x5a5f66, G: 0x5a5f66, M: 0x6a4a2e } },
  qobj_grave_dug: { rows: GRAVE_OPEN, pal: { K, S: 0x8a8f96, L: 0xb9bec4, D: 0x5a5f66, G: 0x5a5f66, M: 0x6a4a2e, P: 0x0e0a10, B: 0x7a5a36, I: 0x8a5a36 } },
  qobj_seal: { rows: SEAL, pal: { ...stone, G: 0x4a4a52, R: 0x3a3a42 } },
  qobj_seal_turned: { rows: SEAL, pal: { ...stone, G: 0xffd166, R: 0xfff0b0 } },
  qobj_seal_crown: { rows: SEAL_CROWN, pal: { ...stone, G: 0x4a4a52, R: 0x3a3a42, C: 0xa08a58, Y: 0x6a5a3a } },
  qobj_seal_crown_turned: { rows: SEAL_CROWN, pal: { ...stone, G: 0xffd166, R: 0xfff0b0, C: 0xffd166, Y: 0xfff0b0 } },
  qobj_wardlamp: { rows: WARDLAMP, pal: { K, ...iron, S: 0x8a8f96, L: 0xb9bec4, D: 0x5a5f66, G: 0x24342a, W: 0x2c3e30, Y: 0x34483a } },
  qobj_wardlamp_lit: { rows: WARDLAMP, pal: { K, ...iron, S: 0x8a8f96, L: 0xb9bec4, D: 0x5a5f66, G: 0x3f9f3a, W: 0x9dff6a, Y: 0xf0ffd8 } },
  qobj_postern: { rows: POSTERN, pal: { K, C: 0x7a7468, L: 0x9a9486, D: 0x544e44, S: 0x6c685e, R: 0x8a8070 } },
  qobj_postern_open: { rows: POSTERN_OPEN, pal: { K, C: 0x7a7468, L: 0x9a9486, D: 0x08060a, S: 0x6c685e, R: 0x8a8070, H: 0x8a8478 } },
  qobj_lamp: { rows: LAMP, pal: { K, ...iron, G: 0xc8781e, W: 0xffc060, Y: 0xfff0b8 } },
  qobj_lamp_out: { rows: LAMP, pal: { K, ...iron, G: 0x2a2a2e, W: 0x34343a, Y: 0x3c3c44 } },
  ale_cart: { rows: ALE_CART, pal: { K, B: 0x8a5a2e, L: 0xb88a52, D: 0x5a3a1c, H: 0x4b5563, W: 0x7a5a36, S: 0x6a4a2a } },
  qobj_lamp_small: { rows: LAMP_SMALL, pal: { K, G: 0xc8781e, W: 0xffc060, Y: 0xfff0b8 } },
};

// ---- hide-bound: a fur mantle and hide stitching worn over the hero (48 px design frame, feet at y 43.5, like the sheets)
export type HideDir = "down" | "up" | "side";
export const HIDE_FRAME = 48;
const HIDE_PAL: Record<string, [number, number, number]> = { // dark, mid, light of the pelt, by hero
  wizard: [0x4a3c2e, 0x6b5a48, 0x8a765c],
  vampire: [0x1c161a, 0x30262c, 0x4a3c44],
  summoner: [0x8a7e68, 0xa89c84, 0xcfc4aa],
};
const STITCH = 0xd8cfb8;
const h = (x: number, y: number) => { let v = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };

/** Texels [x, y, colour] of the overlay for a class and facing; 48x48 frame, same origin as the hero sprite. */
export function hideboundPixels(cls: string, dir: HideDir): [number, number, number][] {
  const [d, m, l] = HIDE_PAL[cls] ?? HIDE_PAL.wizard, out: [number, number, number][] = [];
  const put = (x: number, y: number, c: number) => out.push([x, y, c]);
  const fur = (x: number, y: number) => (h(x, y) < 0.25 ? l : h(x + 7, y) < 0.5 ? m : d);
  if (dir === "down") {
    // a shaggy collar over both shoulders, hanging in tufts, and a laced hide seam down the chest
    for (let x = 16; x <= 32; x++) {
      const edge = Math.abs(x - 24), top = 19 + Math.floor(edge * 0.15), bot = 22 + (edge > 6 ? 1 : 0) + (h(x, 1) < 0.45 ? 1 : 0);
      for (let y = top; y <= bot; y++) { if (edge < 2 && y < 21) continue; put(x, y, fur(x, y)); }
    }
    for (let y = 23; y <= 31; y++) { put(24, y, d); if (y % 2) { put(23, y, STITCH); put(25, y, STITCH); } }
  } else if (dir === "up") {
    // a pelt cape hanging down the back
    for (let y = 19; y <= 33; y++) {
      const w = y < 24 ? 8 : 8 - Math.floor((y - 24) / 4), jag = y > 29 && h(y, 3) < 0.4 ? 1 : 0;
      for (let x = 24 - w; x <= 23 + w + 1 - jag; x++) { if (y > 30 && h(x, y) < 0.3) continue; put(x, y, fur(x, y)); }
    }
    for (let y = 22; y <= 32; y += 2) put(24, y, STITCH); // spine seam
  } else {
    // side: a fur pauldron on the near shoulder and a pelt flap down the back
    for (let y = 18; y <= 25; y++) for (let x = 21; x <= 28; x++) {
      const dx = x - 24.5, dy = y - 21.5;
      if (dx * dx / 16 + dy * dy / 14 > 1 || (y > 23 && h(x, y) < 0.35)) continue;
      put(x, y, fur(x, y));
    }
    for (let y = 22; y <= 31; y++) for (let x = 19; x <= 21; x++) if (h(x, y) > 0.2 + (y - 22) * 0.05) put(x, y, fur(x, y));
    for (let x = 22; x <= 27; x += 2) put(x, 25, STITCH);
  }
  return out;
}
