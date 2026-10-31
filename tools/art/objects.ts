import { mkdirSync, writeFileSync } from "node:fs";
import { Canvas, shade } from "./canvas";

const OUT_C = 0x1a1420;
const WOOD = 0x9c6b3e, WOOD_D = 0x6e4526, WOOD_L = 0xc28a54, IRON = 0x6b7280, STONE = 0x9aa1a8, STONE_D = 0x6b7178;
const RED = 0xd62839, GOLD = 0xf2c14e, CLOTH = 0xf3ead8, GREEN = 0x4f9d3a, GREEN_D = 0x2f6b28;

type Draw = (c: Canvas, f: number) => void;
interface Obj { name: string; w: number; h: number; frames?: number; fps?: number; shadow?: [number, number] | false; draw: Draw; kind: "prop" | "item" }

const P = (name: string, w: number, h: number, draw: Draw, extra: Partial<Obj> = {}): Obj => ({ name, w, h, draw, kind: "prop", ...extra });
const I = (name: string, rows: string[], pal: Record<string, number>): Obj => ({
  name, w: 16, h: 16, kind: "item", shadow: false,
  draw: (c) => c.sprite(Math.floor((16 - rows[0].length) / 2), Math.floor((16 - rows.length) / 2), rows, pal),
});

function planks(c: Canvas, x: number, y: number, w: number, h: number, vertical = false) {
  c.box(x, y, w, h, WOOD);
  if (vertical) for (let i = x + 3; i < x + w - 1; i += 3) c.rect(i, y + 1, 1, h - 2, WOOD_D);
  else for (let j = y + 3; j < y + h - 1; j += 3) c.rect(x + 1, j, w - 2, 1, WOOD_D);
}

// ---------------- props ----------------
const props: Obj[] = [
  P("barrel", 16, 16, (c) => {
    c.box(3, 2, 10, 13, WOOD); c.rect(3, 2, 10, 2, WOOD_L); c.ellipse(7.5, 2.5, 4.5, 1.2, WOOD_D);
    c.rect(4, 3, 8, 1, shade(WOOD_D, 0.8));
    for (const y of [5, 11]) { c.rect(3, y, 10, 1, IRON); c.px(3, y, shade(IRON, 1.3)); }
    c.rect(5, 6, 1, 5, WOOD_L); c.rect(9, 4, 1, 10, WOOD_D);
  }),
  P("crate", 16, 16, (c) => {
    c.box(2, 3, 12, 12, WOOD, { top: true }); c.rect(3, 4, 10, 10, WOOD_L);
    c.box(4, 6, 8, 6, WOOD);
    c.line(4, 11, 11, 6, WOOD_D); c.line(4, 12, 12, 6, WOOD_D);
    for (const [x, y] of [[3, 4], [12, 4], [3, 13], [12, 13]]) c.px(x, y, IRON);
  }),
  P("sack", 16, 16, (c) => {
    const S = 0xd9c08a;
    c.ellipse(8, 10, 5, 4.5, S); c.rect(6, 3, 4, 3, S); c.rect(6, 5, 4, 1, 0x8b5a2b);
    c.ellipse(6, 9, 1.5, 2, shade(S, 1.12)); c.rect(5, 14, 7, 1, shade(S, 0.75)); c.rect(12, 9, 1, 4, shade(S, 0.8));
    c.px(7, 2, S); c.px(9, 2, S);
  }),
  P("pot", 16, 16, (c) => {
    const T = 0xc1683c;
    c.ellipse(8, 10, 5, 4.5, T); c.rect(5, 3, 6, 3, T); c.rect(4, 3, 8, 1, shade(T, 1.2));
    c.rect(6, 3, 4, 1, shade(T, 0.55)); c.rect(4, 9, 9, 1, shade(T, 0.75)); c.ellipse(6, 8, 1, 2, shade(T, 1.2));
  }),
  P("crate_stack", 32, 32, (c) => {
    const one = (x: number, y: number) => { c.box(x, y, 12, 12, WOOD, { top: true }); c.rect(x + 1, y + 1, 10, 10, WOOD_L); c.box(x + 2, y + 3, 8, 6, WOOD); c.line(x + 2, y + 8, x + 9, y + 3, WOOD_D); };
    one(3, 18); one(16, 18); one(9, 6);
  }),
  P("haystack", 32, 32, (c) => {
    const H = 0xe2b84a;
    c.ellipse(16, 22, 13, 8, H); c.ellipse(16, 15, 9, 7, H); c.ellipse(13, 13, 4, 3, shade(H, 1.15));
    for (let i = 0; i < 26; i++) { const x = 5 + ((i * 7) % 22), y = 10 + ((i * 5) % 18); c.line(x, y, x + 1, y + 2, shade(H, i % 2 ? 0.8 : 1.15)); }
    c.rect(4, 29, 24, 1, shade(H, 0.7));
  }),
  P("well", 32, 32, (c) => {
    c.rect(6, 4, 2, 16, WOOD_D); c.rect(24, 4, 2, 16, WOOD_D);
    c.box(4, 1, 24, 4, RED, { top: true }); c.rect(4, 3, 24, 1, shade(RED, 0.75)); c.rect(6, 7, 20, 1, WOOD); c.rect(15, 7, 1, 7, 0x8b6b4a);
    c.box(14, 13, 4, 3, WOOD);
    c.ellipse(16, 20, 11, 4, STONE); c.ellipse(16, 20, 8, 2.4, 0x1c3b5a); c.ellipse(14, 20, 3, 1, 0x2f80ed);
    c.box(5, 20, 22, 9, STONE);
    for (let y = 22; y < 29; y += 3) for (let x = 6 + ((y / 3) % 2) * 2; x < 26; x += 5) c.rect(x, y, 1, 2, STONE_D);
    c.rect(5, 22, 22, 1, STONE_D);
  }),
  P("market_stall", 32, 32, (c) => {
    c.rect(4, 9, 2, 20, WOOD_D); c.rect(26, 9, 2, 20, WOOD_D);
    for (let x = 2; x < 30; x++) { const col = Math.floor((x - 2) / 4) % 2 ? CLOTH : RED; c.rect(x, 3, 1, 7, col); c.px(x, 10, x % 4 < 2 ? col : 0, x % 4 < 2 ? 255 : 0); }
    c.rect(2, 3, 28, 1, shade(RED, 1.2)); c.rect(2, 8, 28, 1, 0x000000, 50);
    planks(c, 3, 19, 26, 9); c.rect(3, 19, 26, 2, WOOD_L);
    // goods
    for (const [x, col] of [[6, 0xe23b3b], [9, 0xe23b3b], [12, 0xf6a623], [15, 0xf6a623], [21, 0x7bc043], [24, 0x7bc043]] as const) { c.ellipse(x, 17, 1.4, 1.4, col); c.px(x - 1, 16, shade(col, 1.3)); }
    c.box(17, 15, 3, 4, 0xd9c08a);
  }),
  P("signpost", 16, 32, (c) => {
    c.box(7, 8, 2, 22, WOOD_D);
    c.box(1, 6, 13, 6, WOOD, { top: true }); c.px(14, 8, WOOD); c.px(14, 9, WOOD); c.px(15, 9, WOOD);
    c.rect(3, 8, 7, 1, WOOD_D); c.rect(3, 10, 5, 1, WOOD_D);
    c.box(3, 14, 11, 5, WOOD); c.px(2, 16, WOOD); c.px(1, 16, WOOD); c.rect(5, 16, 6, 1, WOOD_D);
  }),
  P("lamppost", 16, 32, (c, f) => {
    c.box(7, 9, 2, 21, 0x3a3f47); c.rect(5, 28, 6, 2, 0x3a3f47);
    c.rect(4, 3, 8, 1, 0x3a3f47); c.rect(6, 2, 4, 1, 0x3a3f47);
    c.box(5, 4, 6, 6, 0xffe08a); c.rect(5, 4, 1, 6, 0x3a3f47); c.rect(10, 4, 1, 6, 0x3a3f47); c.rect(5, 9, 6, 1, 0x3a3f47);
    c.rect(7, 5, 2, 3, f % 2 ? 0xfff6d0 : 0xffffff);
  }, { frames: 2, fps: 3 }),
  P("bench", 32, 16, (c) => {
    c.rect(5, 9, 2, 6, WOOD_D); c.rect(25, 9, 2, 6, WOOD_D);
    c.box(2, 3, 28, 3, WOOD, { top: true }); c.box(2, 7, 28, 3, WOOD_L, { top: true });
    c.rect(6, 6, 1, 1, WOOD_D); c.rect(25, 6, 1, 1, WOOD_D);
  }),
  P("fence", 16, 16, (c) => {
    for (const x of [1, 12]) { c.box(x, 3, 3, 12, WOOD); c.px(x + 1, 2, WOOD); }
    c.box(0, 5, 16, 2, WOOD_L); c.box(0, 10, 16, 2, WOOD_L);
  }, { shadow: false }),
  P("fence_post", 16, 16, (c) => { c.box(6, 3, 4, 12, WOOD); c.px(7, 2, WOOD); c.px(8, 2, WOOD); }),
  P("cart", 32, 32, (c) => {
    c.line(27, 18, 31, 24, WOOD_D); c.line(27, 19, 31, 25, WOOD_D);
    planks(c, 3, 9, 24, 11, true); c.rect(3, 9, 24, 2, WOOD_L);
    c.ellipse(8, 11, 2, 1.5, 0xe2b84a); c.ellipse(12, 10, 3, 2, 0xe2b84a); c.ellipse(20, 11, 3, 2, 0xd9c08a);
    for (const x of [9, 21]) { c.ellipse(x, 23, 5, 5, 0x5a3a22); c.ellipse(x, 23, 3, 3, WOOD); c.ellipse(x, 23, 1, 1, IRON); c.line(x - 3, 23, x + 3, 23, 0x5a3a22); c.line(x, 20, x, 26, 0x5a3a22); }
  }),
  P("anvil", 16, 16, (c) => {
    const A = 0x4b5563;
    c.box(5, 11, 6, 4, WOOD_D); c.box(3, 4, 11, 3, A, { top: true }); c.rect(1, 4, 2, 2, A); c.px(0, 4, A);
    c.box(6, 7, 4, 4, A); c.rect(4, 4, 8, 1, shade(A, 1.4));
  }),
  P("campfire", 16, 16, (c, f) => {
    c.line(2, 13, 13, 11, WOOD_D); c.line(2, 11, 13, 14, WOOD); c.line(3, 14, 13, 12, WOOD_D);
    for (const [x, y] of [[1, 13], [14, 13], [4, 15], [11, 15]]) { c.box(x - 1, y - 1, 2, 2, STONE); }
    const sway = [0, 1, 0, -1][f];
    c.ellipse(8, 9, 3.5, 3.5, 0xff6b1a); c.rect(7 + sway, 3, 2, 6, 0xff6b1a); c.px(8 + sway, 2, 0xff6b1a);
    c.ellipse(8, 10, 2, 2, 0xffc93c); c.rect(8 - sway, 6, 1, 4, 0xffc93c); c.px(8, 11, 0xfff3b0);
    c.px(5 - sway, 4 + (f % 2), 0xffc93c); c.px(11 + sway, 3 + ((f + 1) % 2), 0xff6b1a);
  }, { frames: 4, fps: 8 }),
  P("torch", 16, 16, (c, f) => {
    c.box(7, 7, 2, 8, WOOD_D); c.rect(6, 7, 4, 1, IRON);
    const s = [0, 1, 0, -1][f];
    c.ellipse(8, 5, 2, 2, 0xff6b1a); c.rect(8 + s, 1, 1, 3, 0xff6b1a); c.rect(7, 4, 2, 2, 0xffc93c); c.px(8 - s, 3, 0xffe08a);
  }, { frames: 4, fps: 8, shadow: false }),
  P("banner", 16, 32, (c, f) => {
    c.box(7, 3, 2, 27, WOOD_D); c.ellipse(8, 2, 1.5, 1.5, GOLD);
    c.rect(3, 5, 10, 1, WOOD);
    const wave = f % 2;
    c.box(4, 6, 8, 12, 0x2a5db0); c.rect(4, 18, 3, 2 + wave, 0x2a5db0); c.rect(9, 18, 3, 2 - wave + 1, 0x2a5db0);
    c.rect(7, 8, 2, 8, GOLD); c.rect(5, 10, 6, 2, GOLD);
  }, { frames: 2, fps: 2 }),
  P("chest", 16, 16, (c) => {
    c.box(2, 7, 12, 8, WOOD); c.box(2, 3, 12, 5, WOOD_L, { top: true }); c.rect(2, 7, 12, 1, WOOD_D);
    for (const x of [3, 12]) c.rect(x, 3, 1, 12, GOLD);
    c.box(7, 7, 2, 3, GOLD); c.px(7, 9, 0x2a1a0a);
  }),
  P("chest_open", 16, 16, (c) => {
    c.box(2, 1, 12, 4, WOOD_D); c.rect(3, 2, 10, 2, 0x3a2412);
    c.box(2, 7, 12, 8, WOOD); c.rect(3, 6, 10, 2, GOLD); c.px(5, 5, 0xfff3b0); c.px(9, 5, GOLD); c.px(11, 6, 0xfff3b0);
    for (const x of [3, 12]) c.rect(x, 7, 1, 8, GOLD);
  }),
  P("woodpile", 32, 16, (c) => {
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) {
      const x = 6 + i * 6 + r * 3, y = 11 - r * 4;
      c.ellipse(x, y, 2.6, 2.6, WOOD); c.ellipse(x, y, 1.4, 1.4, 0xd9b27c); c.px(x, y, WOOD);
    }
  }),
  P("bush", 16, 16, (c) => {
    c.ellipse(8, 10, 6, 4.5, GREEN); c.ellipse(5, 8, 3, 3, GREEN); c.ellipse(11, 8, 3, 3, GREEN);
    c.ellipse(6, 7, 1.5, 1.2, shade(GREEN, 1.3)); c.ellipse(10, 7, 1.2, 1, shade(GREEN, 1.3)); c.rect(3, 13, 11, 1, GREEN_D);
    c.px(5, 11, 0xe23b3b); c.px(11, 10, 0xe23b3b);
  }),
  P("rock", 16, 16, (c) => {
    c.ellipse(8, 10, 6, 4, STONE); c.ellipse(6, 8, 3, 2, shade(STONE, 1.15)); c.rect(3, 13, 10, 1, STONE_D); c.px(10, 9, STONE_D); c.px(11, 10, STONE_D);
  }),
  P("stump", 16, 16, (c) => {
    c.box(4, 6, 8, 8, WOOD_D); c.ellipse(8, 6, 4, 1.8, 0xd9b27c); c.ellipse(8, 6, 2, 0.8, WOOD); c.px(3, 13, WOOD_D); c.px(12, 13, WOOD_D);
  }),
  P("cauldron", 16, 16, (c, f) => {
    c.ellipse(8, 10, 6, 4.5, 0x2e2e36); c.ellipse(8, 6.5, 5.5, 1.6, 0x4b4b56); c.ellipse(8, 6.5, 4.5, 1, 0x6fdc5a);
    c.px(6 + (f % 2) * 3, 5, 0xb5f5a0); c.px(10 - (f % 2) * 3, 3 - (f % 2), 0x6fdc5a);
    c.rect(4, 14, 2, 1, 0x2e2e36); c.rect(10, 14, 2, 1, 0x2e2e36); c.ellipse(5, 9, 1, 1.5, 0x4b4b56);
  }, { frames: 2, fps: 3 }),
  P("training_dummy", 16, 32, (c) => {
    const S = 0xd9c08a;
    c.box(7, 18, 2, 12, WOOD_D); c.rect(4, 28, 8, 2, WOOD_D);
    c.box(1, 13, 14, 3, WOOD); c.ellipse(8, 16, 4, 5, S); c.ellipse(8, 7, 3.5, 3.5, S);
    c.line(5, 13, 11, 19, 0x8b5a2b); c.px(7, 6, 0x5a3a22); c.px(10, 6, 0x5a3a22); c.rect(6, 9, 4, 1, 0x8b5a2b);
    c.ellipse(8, 16, 1.5, 1.5, RED); c.px(8, 16, CLOTH);
  }),
  P("notice_board", 32, 32, (c) => {
    c.rect(5, 6, 2, 23, WOOD_D); c.rect(25, 6, 2, 23, WOOD_D);
    c.box(3, 2, 26, 4, RED, { top: true });
    c.box(4, 7, 24, 15, WOOD_L); c.rect(4, 7, 24, 1, WOOD_D);
    for (const [x, y, w, h] of [[6, 9, 7, 9], [15, 10, 6, 7], [22, 9, 5, 10]]) { c.box(x, y, w, h, CLOTH); c.px(x + w / 2, y, RED); for (let j = y + 2; j < y + h - 1; j += 2) c.rect(x + 1, j, w - 2, 1, 0xa89f8c); }
  }),
];

// ---------------- items (16x16 icons) ----------------
const items: Obj[] = [
  I("potion_health", ["...KK...", "...WW...", "..WRRW..", ".WRRRRW.", "WRRLRRRW", "WRLRRRRW", "WRRRRRDW", ".WRRRDW.", "..WWWW.."], { K: 0x8b5a2b, W: 0xd8e6ef, R: 0xe23b3b, L: 0xffb3b3, D: 0xa21f2f }),
  I("potion_mana", ["...KK...", "...WW...", "..WBBW..", ".WBBBBW.", "WBBLBBBW", "WBLBBBBW", "WBBBBBDW", ".WBBBDW.", "..WWWW.."], { K: 0x8b5a2b, W: 0xd8e6ef, B: 0x3a7bff, L: 0xb6d2ff, D: 0x1f4fb0 }),
  I("potion_speed", ["...KK...", "...WW...", "..WGGW..", ".WGGGGW.", "WGGLGGGW", "WGLGGGGW", "WGGGGGDW", ".WGGGDW.", "..WWWW.."], { K: 0x8b5a2b, W: 0xd8e6ef, G: 0x6fdc5a, L: 0xd6ffcc, D: 0x2f8f2a }),
  I("coin", [".YYYY.", "YLYYYY", "YLYDYY", "YLYDYY", "YYYYDY", ".YDDY."], { Y: GOLD, L: 0xfff3b0, D: 0xc28a1e }),
  I("coin_pile", ["....YY....", "...YLYY...", "..YYYYDY..", ".YLYYDYYY.", "YYLYYYYDYY", "YDDYDDYDDY"], { Y: GOLD, L: 0xfff3b0, D: 0xc28a1e }),
  I("gem_red", ["..RRRR..", ".RLLRRR.", "RLRRRRRD", ".RRRRRD.", "..RRRD..", "...RD..."], { R: 0xe23b3b, L: 0xffc2c2, D: 0x8f1a26 }),
  I("gem_blue", ["..BBBB..", ".BLLBBB.", "BLBBBBBD", ".BBBBBD.", "..BBBD..", "...BD..."], { B: 0x3ab7ff, L: 0xd2f1ff, D: 0x1d6aa5 }),
  I("bread", ["...BBBBB..", ".BBLBLBLB.", "BBBBBBBBBB", "BDBBBBBBDB", ".DDDDDDDD."], { B: 0xd9a05b, L: 0xf3d29a, D: 0x9c6b3e }),
  I("apple", ["....S...", "...SL...", ".RRRRRR.", "RRLRRRRR", "RLRRRRRR", "RRRRRRRD", ".RRRRRD.", "..RRDD.."], { S: 0x6e4526, L: 0x7bc043, R: 0xe23b3b, D: 0x9e1f2b }),
  I("cheese", [".....YY", "...YYYY", ".YYOYYY", "YYYYYOY", "YOYYYYY", "DDDDDDD"], { Y: 0xffd34d, O: 0xe0a92a, D: 0xd49a1a }),
  I("meat", ["....RRRR", "...RRLRR", "..RRRRRR", "..RRRRRD", ".WWRRRD.", "WW......", "WW......"], { R: 0xc0504d, L: 0xe9897f, D: 0x8a2f2b, W: 0xf3ead8 }),
  I("key", [".YYY......", "Y...Y.....", "Y...YYYYYY", "Y...Y..Y.Y", ".YYY......"], { Y: GOLD }),
  I("scroll", ["WWWWWWWW", "DCCCCCCD", ".CLLLLC.", ".CCCCCC.", ".CLLLC..", ".CCCCCC.", "DCCCCCCD", "WWWWWWWW"], { W: 0xd9c08a, C: CLOTH, L: 0xa89f8c, D: 0x9c6b3e }),
  I("sword", [".........S", "........SL", ".......SL.", "......SL..", ".....SL...", "..G.SL....", "...GL.....", "...HG.....", "..H..G....", ".P........"], { S: 0xe6edf5, L: 0x9aa4b0, G: GOLD, H: 0x6b4226, P: GOLD }),
  I("shield", ["GGGGGGGG", "GBBGGBBG", "GBBGGBBG", "GGGGGGGG", "GBBGGBBG", ".GBGGBG.", "..GGGG..", "...GG..."], { G: GOLD, B: 0x2a5db0 }),
  I("shuriken", ["...S....", "...SS...", "SSSDS...", ".SSDDSSS", "..SDDSS.", "...SS...", "....S..."], { S: 0xb4bcc6, D: 0x4b5563 }),
  I("spellbook", ["PPPPPPP.", "PYPPPPPW", "PPPYPPPW", "PPYYYPPW", "PPPYPPPW", "PPPPPPPW", "DDDDDDDW"], { P: 0x6a3fb5, Y: GOLD, W: CLOTH, D: 0x3d2470 }),
  I("heart", [".RR.RR.", "RLRRRRR", "RLRRRRR", "RRRRRRD", ".RRRRD.", "..RRD..", "...D..."], { R: 0xe23b3b, L: 0xffb3b3, D: 0x9e1f2b }),
  I("helmet", ["..SSSS..", ".SLSSSS.", "SLSSSSSS", "SSKKKKSS", "SSSSKSSS", "SS.SS.SS"], { S: 0xb4bcc6, L: 0xe6edf5, K: 0x14141c }),
  I("mushroom", ["..RRRR..", ".RWRRWR.", "RRRRRRRR", "RRWRRRWR", "..SSSS..", "..SLSS..", "..SSSS.."], { R: 0xe23b3b, W: 0xffffff, S: CLOTH, L: 0xd9c08a }),
];

function render(o: Obj, f: number) {
  const c = new Canvas(o.w, o.h);
  o.draw(c, f);
  c.outline(OUT_C);
  if (o.shadow !== false && o.kind === "prop") {
    let maxY = 0, minX = o.w, maxX = 0;
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) if (c.alpha(x, y)) { maxY = y; minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    c.under((s) => s.ellipse((minX + maxX) / 2, Math.min(o.h - 1.5, maxY), (maxX - minX) / 2, 1.3, 0, 60));
  }
  return c;
}

/** Shelf-pack frames into one atlas image + Phaser JSON-hash. */
function pack(list: Obj[], file: string, dir: string, width = 256) {
  const frames: { key: string; img: Canvas; pivotY: number }[] = [];
  const anims: Record<string, { frames: string[]; fps: number; loop: boolean }> = {};
  for (const o of list) {
    const n = o.frames ?? 1;
    const keys: string[] = [];
    for (let f = 0; f < n; f++) { const key = n > 1 ? `${o.name}_${f}` : o.name; keys.push(key); frames.push({ key, img: render(o, f), pivotY: o.kind === "item" ? 0.5 : 1 }); }
    if (n > 1) anims[o.name] = { frames: keys, fps: o.fps ?? 6, loop: true };
  }
  let x = 0, y = 0, rowH = 0;
  const pos = frames.map((f) => {
    if (x + f.img.w > width) { x = 0; y += rowH + 1; rowH = 0; }
    const p = { x, y };
    x += f.img.w + 1; rowH = Math.max(rowH, f.img.h);
    return p;
  });
  const H = y + rowH;
  const atlas = new Canvas(width, H);
  const json: any = { frames: {}, meta: { image: `${file}.png`, size: { w: width, h: H }, scale: "1", app: "tools/art/generate.ts" }, animations: anims };
  frames.forEach((f, i) => {
    atlas.blit(f.img, pos[i].x, pos[i].y);
    json.frames[f.key] = {
      frame: { x: pos[i].x, y: pos[i].y, w: f.img.w, h: f.img.h }, rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: f.img.w, h: f.img.h }, sourceSize: { w: f.img.w, h: f.img.h },
      pivot: { x: 0.5, y: f.pivotY },
    };
  });
  atlas.save(`${dir}/${file}.png`);
  writeFileSync(`${dir}/${file}.json`, JSON.stringify(json, null, 1));
}

export function buildObjects(dir: string) {
  mkdirSync(dir, { recursive: true });
  pack(props, "props", dir);
  pack(items, "items", dir, 128);
}
