/**
 * Songweaver small icons (12x12 character maps, same format as the ICONS table in skillIcons.ts): the five mode badges,
 * the five monster ear tiers and the three pitch arrows. No DOM or Phaser here, so the art preview can import it.
 * Ids: sgmode_<mode>, sgear_<tier>, sgpitch_<L|M|H>. The 24x24 skill icons (sg_*) are painted in skillArt.ts.
 */
export type Icon = { pal: Record<string, string>; px: string[] };

const MODE_BADGE: Record<string, { rim: string; fill: string; hi: string; glyph: string; art: string[] }> = {
  // major: a sun
  major: { rim: "#7a5a0a", fill: "#ffd166", hi: "#fff3b0", glyph: "#6b4a12", art: ["...c..c...", "..........", "c..cccc..c", "..cccccc..", "..cccccc..", "..cccccc..", "c..cccc..c", "..........", "...c..c...", ".........."] },
  // minor: a crescent moon
  minor: { rim: "#16305c", fill: "#4a90e2", hi: "#a6cdfa", glyph: "#ffffff", art: [".........", "..ccccc..", ".cc......", ".cc......", ".cc......", ".cc......", ".cc......", "..ccccc..", ".........", "........."] },
  // lydian: a sharp sign (the raised fourth)
  lydian: { rim: "#5b4a99", fill: "#d9c8ff", hi: "#f6efff", glyph: "#3d2f80", art: ["...c..c...", "...c..c...", ".cccccccc.", "...c..c...", "...c..c...", ".cccccccc.", "...c..c...", "...c..c...", "..........", ".........."] },
  // dorian: a leaf
  dorian: { rim: "#1f4d16", fill: "#6fbf4a", hi: "#c4f0a8", glyph: "#1f4d16", art: ["........cc", "......cccc", "....cccccc", "...ccccc.c", "..cccc.c..", ".cccc.c...", ".ccc.c....", "cc.c......", "c.........", ".........."] },
  // phrygian: a flat sign
  phrygian: { rim: "#5a0a16", fill: "#d62839", hi: "#ff8a8a", glyph: "#ffffff", art: ["..c.......", "..c.......", "..c.cc....", "..cc..c...", "..c....c..", "..c....c..", "..cc..c...", "..c.cc....", "..........", ".........."] },
};
function modeBadge(m: { rim: string; fill: string; hi: string; glyph: string; art: string[] }): Icon {
  const px: string[] = [];
  for (let y = 0; y < 12; y++) {
    let row = "";
    for (let x = 0; x < 12; x++) {
      const d = Math.hypot(x - 5.5, y - 5.5);
      const gl = m.art[y - 1]?.[x - 1];
      row += d > 5.7 ? "." : d > 4.7 ? "o" : gl === "c" ? "c" : x + y < 7 && d > 3 ? "h" : "f";
    }
    px.push(row);
  }
  return { pal: { o: m.rim, f: m.fill, h: m.hi, c: m.glyph }, px };
}

const EAR = [
  "..oooooo....", ".oeeeeeeo...", "oeeeeeeeeo..", "oeeooooeeo..", "oeoeeeoeeo..", "oeoeooeeeo..",
  "oeeeoeeeo...", ".oeeeeeeo...", "..oeeeeo....", "..oeeeo.....", "...ooo......", "............",
];
/** Overlay: an overlay char replaces the ear pixel (".") leaves it. */
function overlay(base: string[], over: string[]): string[] {
  return base.map((r, y) => [...r].map((ch, x) => (over[y]?.[x] && over[y][x] !== "." ? over[y][x] : ch)).join(""));
}
const EAR_PAL = { o: "#3b2414", e: "#e8b58c", x: "#e63946", s: "#8890a8", t: "#c9d2e6", l: "#ffd166", k: "#1b1b2a", i: "#bfeaff", j: "#6fb6d9" };
const EAR_ICONS: Record<string, Icon> = {
  // deaf: the ear crossed out
  sgear_deaf: { pal: EAR_PAL, px: overlay(EAR, ["xx.........x", ".xx.......xx", "..xx.....xx.", "...xx...xx..", "....xx.xx...", ".....xxx....", ".....xxx....", "....xx.xx...", "...xx...xx..", "..xx.....xx.", ".xx.......xx", "xx.........x"].map((r) => r.slice(0, 12))) },
  // dull: the ear behind a small shield
  sgear_dull: { pal: EAR_PAL, px: overlay(EAR, ["............", "............", "............", ".......ssss.", "......sttts.", "......sttts.", "......sttts.", "......sttts.", ".......stts.", "........ss..", "............", "............"]) },
  sgear_normal: { pal: EAR_PAL, px: EAR },
  // keen: the open ear with sound lines
  sgear_keen: { pal: EAR_PAL, px: overlay(EAR, ["..........l.", "........l...", ".........l.l", "...........l", ".........l.l", "........l...", "..........l.", "............", "............", "............", "............", "............"]) },
  // fragile: a crystal ear, faceted, with a dark crack splitting it and a falling shard
  sgear_fragile: { pal: { ...EAR_PAL, e: "#bfeaff", o: "#2a6fa0", i: "#f2fbff", j: "#6fb6d9" }, px: overlay(EAR, ["............", "...ii.......", "..i.........", "....k.......", "...kk.i.....", "....k.jj....", ".....kk.....", "....kk......", "....k.j.....", "...j........", "............", "........j..."]) },
};

const PITCH_ICONS: Record<string, Icon> = {
  sgpitch_L: { pal: { o: "#16305c", a: "#4a90e2", h: "#a6cdfa" }, px: ["............", "....oooo....", "...oaaaao...", "...oahhao...", "...oaaaao...", "...oaaaao...", ".ooooaaoooo.", ".oaaaaaaaao.", "..oaaaaaao..", "...oaaaao...", "....oaao....", ".....oo....."] },
  sgpitch_M: { pal: { o: "#6b4a12", a: "#ffd166", h: "#fff3b0" }, px: ["............", "............", "...o....o...", "..oao..oao..", ".oaaaooaaao.", "oaaaaaaaaaao", "oahhhhhhhhao", ".oaaaooaaao.", "..oao..oao..", "...o....o...", "............", "............"] },
  sgpitch_H: { pal: { o: "#5a0a16", a: "#ff6b6b", h: "#ffc2c2" }, px: [".....oo.....", "....oaao....", "...oaaaao...", "..oaahaaao..", ".oaaahaaaao.", ".ooooaaoooo.", "...oaaaao...", "...oaaaao...", "...oahhao...", "...oaaaao...", "....oooo....", "............"] },
};

/** All small Songweaver icons by id. */
export const SONG_SMALL: Record<string, Icon> = {
  ...EAR_ICONS, ...PITCH_ICONS, ...Object.fromEntries(Object.entries(MODE_BADGE).map(([k, v]) => ["sgmode_" + k, modeBadge(v)])),
};
