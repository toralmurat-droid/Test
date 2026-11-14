/**
 * Tiny pixel-art icons (12x12) for the active skills and the combo, used on the slot bar and in the skill tree.
 * Each icon is a character map; every letter is a colour from its palette, "." is transparent.
 * Rendered once to a data URL and shown with `image-rendering: pixelated`.
 */
import { skillById } from "../../shared/skills";
import { PALETTE } from "./skillfx";
import { paintSkill, paintStatus, ICON } from "./skillArt";
import { SONG_SMALL, Icon } from "./songIcons";

const ICONS: Record<string, Icon> = {
  ...SONG_SMALL, // Songweaver: mode badges (sgmode_*), ear tiers (sgear_*), pitch arrows (sgpitch_*)
  // Knight Shield: steel kite shield with a gold cross
  guard: {
    pal: { o: "#1b1b2a", s: "#a9b8d0", d: "#6d7d99", g: "#ffd166" },
    px: [
      "..oooooooo..",
      ".ossssssddo.",
      ".osssggsddo.",
      ".osssggsddo.",
      ".osggggggdo.",
      ".osggggggdo.",
      ".osssggsddo.",
      "..ossggsdo..",
      "..osssssdo..",
      "...ossddo...",
      "....osdo....",
      ".....oo.....",
    ],
  },
  // Knight Earthquake: cracked ground with flying rocks
  earthquake: {
    pal: { o: "#2b1d12", b: "#8d6e63", l: "#bcaaa4", y: "#ffd166" },
    px: [
      ".l........l.",
      "..l..l...l..",
      "...........l",
      ".l...y......",
      "....yy...l..",
      "...yyy......",
      "bbbbyobbbbbb",
      "bbbooobbbbbb",
      "bbbbbooobbbb",
      "bbbbbbbobbbb",
      "bbbbbboobbbb",
      "oooooooooooo",
    ],
  },
  // Ninja Dash: speed lines behind a purple blur
  dash: {
    pal: { p: "#9d4edd", l: "#e0c3fc", w: "#ffffff" },
    px: [
      "............",
      "......pp....",
      ".lll.ppppp..",
      "....pppppww.",
      ".llllpppppw.",
      "....pppppww.",
      ".lll.ppppp..",
      "......pp....",
      "..ll........",
      "............",
      ".lll........",
      "............",
    ],
  },
  // Ninja Blade Storm: four blades spinning around a centre
  bladestorm: {
    pal: { s: "#e0e0ff", d: "#8890b5", c: "#9d4edd" },
    px: [
      "....s.......",
      "....ss......",
      "....sd...ss.",
      ".....d.ssd..",
      "......dd....",
      "..d..cc..d..",
      "..d..cc..d..",
      "....dd......",
      "..dss.d.....",
      ".ss...ds....",
      "......ss....",
      ".......s....",
    ],
  },
  // Wizard Nova: blue burst
  nova: {
    pal: { b: "#4cc9f0", w: "#ffffff", p: "#7b2cbf" },
    px: [
      ".....b......",
      ".b...b...b..",
      "..b..p..b...",
      "...bpppb....",
      "....pwwp....",
      "bbppwwwwppbb",
      "....pwwp....",
      "...bpppb....",
      "..b..p..b...",
      ".b...b...b..",
      ".....b......",
      "............",
    ],
  },
  // Wizard Meteor: flaming rock with a trail
  meteor: {
    pal: { r: "#e63946", o: "#f77f00", y: "#ffd166", k: "#5d4037" },
    px: [
      "y...........",
      ".y.o........",
      "..oo.r......",
      "...ooor.....",
      "....oorr....",
      ".....oyrr...",
      "......ykkk..",
      ".....ykkkkk.",
      ".....kkkkkk.",
      ".....kkkkkk.",
      "......kkkk..",
      "............",
    ],
  },
  // Archer Volley: three arrows side by side
  volley: {
    pal: { w: "#e8d8b0", s: "#c0c0c0", f: "#7cfc00" },
    px: [
      "..s...s...s.",
      ".sss.sss.sss",
      "..w...w...w.",
      "..w...w...w.",
      "..w...w...w.",
      "..w...w...w.",
      "..w...w...w.",
      "..w...w...w.",
      ".fwf.fwf.fwf",
      ".f.f.f.f.f.f",
      "............",
      "............",
    ],
  },
  // Archer Arrow Rain: arrows falling on a target ring
  arrowrain: {
    pal: { w: "#e8d8b0", s: "#c0c0c0", r: "#e63946" },
    px: [
      ".w....w...w.",
      ".w..w.w...w.",
      ".w..w.w.w.w.",
      "sss.w.w.w.w.",
      ".s.sssw.w.w.",
      "....s.sss.w.",
      "......s.ssss",
      "........s.s.",
      "..rrrrrrrr..",
      ".r........r.",
      "..rrrrrrrr..",
      "............",
    ],
  },
  // Barbarian Rage: angry red face with flames
  rage: {
    pal: { r: "#e63946", o: "#f77f00", k: "#1b1b2a", y: "#ffd166" },
    px: [
      "..o..o..o...",
      ".oyo.oyooyo.",
      ".orrrrrrrro.",
      ".rrrrrrrrrr.",
      ".rkrrrrrrkr.",
      ".rrkkrrkkrr.",
      ".rrrrrrrrrr.",
      ".rrrkkkkrrr.",
      ".rrkrrrrkrr.",
      "..rrrrrrrr..",
      "...rrrrrr...",
      "............",
    ],
  },
  // Barbarian Leap: arc arrow over a crash mark
  leap: {
    pal: { y: "#ffd166", b: "#a68a64", o: "#2b1d12" },
    px: [
      "....yyyy....",
      "..yy....yy..",
      ".y........y.",
      ".y.......yyy",
      "y.........y.",
      "y...........",
      "y...........",
      "......b.b...",
      ".....b.b.b..",
      "....bbbbbbb.",
      "...ooooooooo",
      "............",
    ],
  },
  // 3-Hit Combo: three slashes
  combo: {
    pal: { w: "#ffffff", y: "#ffd166" },
    px: [
      ".........w..",
      "........w...",
      ".....w.w....",
      "....w.w.....",
      "...w.w...y..",
      "..w.w...y...",
      ".w.w...y....",
      "w.w...y.....",
      "..w..y......",
      ".w..y.......",
      "...y........",
      "............",
    ],
  },
};


// ---- Icons for the skill trees (shared/skills.ts) -----------------------------------------------------------
// The class skills that existed before keep their hand-made icon; the rest are drawn from a glyph (shape) in the
// colours of the skill's element. Glyph digits: 1 dark outline, 2 main, 3 light, 4 highlight.
const GLYPHS: Record<string, string[]> = {
  sword: ["..........44", ".........434", "........434.", ".......434..", "......434...", ".....434....", "..1.434.....", "..11341.....", "...131......", "..1.11......", ".1....1.....", "1..........."],
  swirl: ["....3333....", "..33....2...", ".3...222..2.", ".3..2...2.2.", "3..2..3..2.2", "3..2.3.3.2.2", "3..2..3..2.2", "3..2.....2..", ".3..2222.2..", ".3......2...", "..33...2....", "....222....."],
  burst: [".....4......", ".3...3...3..", "..3..3..3...", "...3.3.3....", "....333.....", "44333433344.", "....333.....", "...3.3.3....", "..3..3..3...", ".3...3...3..", ".....4......", "............"],
  flame: [".....3......", "....33......", "....323.....", "...3223..3..", "...32223.33.", "..322422323.", "..3224422223", ".32244442223", ".32244442223", ".3224444223.", "..32222223..", "...333333..."],
  flake: [".....4......", "...4.3.4....", "....333.....", ".4..343..4..", "..3..3..3...", "433334333334", "..3..3..3...", ".4..343..4..", "....333.....", "...4.3.4....", ".....4......", "............"],
  bolt: ["......4444..", ".....4332...", "....4332....", "...4332.....", "..433222222.", ".4333333332.", "..22222332..", ".....2332...", "....2332....", "...2332.....", "..232.......", "..2........."],
  orb: ["....2222....", "..22333322..", ".2334433322.", ".2344333332.", "233433333322", "233333333322", "233333333222", "223333332222", ".2233332222.", ".2222222222.", "..22222222..", "....2222...."],
  arrow: ["........4444", "..........34", ".........4.4", "........4...", ".......3....", "......3.....", ".....3......", "....3.......", "1..3........", ".13.........", "1.1.........", ".1.1........"],
  jaws: ["............", ".3.3.3.3.3..", "2.2.2.2.2.2.", "222222222222", "2..........2", "2..1111111.2", "2..........2", "222222222222", "2.2.2.2.2.2.", ".3.3.3.3.3..", "............", "............"],
  totem: ["....3333....", "...322223...", "...2.44.2...", "...222222...", "..11222211..", "...2.22.2...", "...222222...", "...2....2...", "...222222...", "...222222...", "..11111111..", "............"],
  mouth: ["...111111...", "..13333331..", ".1322222231.", ".1311111131.", "..1.....1...", "..1.4.4.1.3.", "..1.....1.3.", ".1311111131.", ".1322222231.", "..13333331.3", "...111111.3.", "...........3"],
  drum: ["..4......4..", "...4....4...", "..33333333..", ".3444444443.", ".2333333332.", ".2121212122.", ".2212121212.", ".2121212122.", ".2212121212.", ".2222222222.", "..22222222..", "............"],
  wind: ["............", ".3333333....", "........3...", "..44444..3..", ".......4.3..", "2222222..3..", "........3...", "..333333....", "............", "4444444.....", ".......4....", "............"],
  spikes: ["............", ".....4......", ".....3......", "..4..3......", "..3.323..4..", "..3.323..3..", ".323222.323.", ".322222.323.", "3222222.3223", "111111111111", "............", "............"],
  cloud: ["....3333....", "..33444433..", ".3344444433.", "333444444333", "222333333222", ".2222222222.", "....4..4....", "...4..4..4..", "..4..4..4...", "....4..4....", "...4........", "............"],
  eye: ["............", "....2222....", "..22333322..", ".2331111332.", "23314441332.", "233144413322", "23311111332.", ".2333333332.", "..22333322..", "....2222....", "............", "............"],
  drop: [".....3......", ".....3......", "....323.....", "....323.....", "...32223....", "..3222223...", "..3242223...", ".324422223..", ".322222223..", ".322222223..", "..3222223...", "...33333...."],
  star4: [".....4......", ".....3......", "....333.....", "....323.....", "...32223....", "4332212233.4", "...32223....", "....323.....", "....333.....", ".....3......", ".....4......", "............"],
  smoke: ["............", "......333...", "...33.3443..", "..34433443..", ".3444333333.", "334433333223", "333333332223", ".2333322222.", "..22222222..", "............", ".1.1.1.1.1..", "............"],
  beast: ["......4.....", ".....33.....", "4...3223....", ".3.322223...", "..322442233.", ".32224422223", "..322222223.", ".3.3222223..", "4...32223...", ".....323....", "......3.....", "............"],
  net: ["2..2..2..2..", ".22.22.22.2.", ".2..2..2..2.", "2.22.22.22..", "..2..2..2..2", ".2.22.22.22.", "2..2..2..2..", ".22.22.22.2.", ".2..2..2..2.", "2.22.22.22..", "..2..2..2..2", "............"],
  halo: ["...444444...", "..4......4..", "...444444...", "............", ".....33.....", "....3223....", "...322223...", "...322223...", "....3223....", "...32..23...", "..32....23..", "............"],
  mirror: [".....44.....", "....4334....", "...433334...", "..43344334..", ".4334444334.", "433444444334", ".4334444334.", "..43344334..", "...433334...", "....4334....", ".....44.....", "............"],
  wave: ["............", "............", "..333.......", ".34443...33.", "3444443.3443", "4333334344..", "222222222222", "222222222222", ".2222222222.", "............", "............", "............"],
  up: [".....4......", "....434.....", "...43334....", "..4333334...", ".433333334..", "....333.....", "....333.....", "....333.....", "....333.....", "....222.....", "....222.....", "............"],
  heart: ["............", ".222...222..", "23332.23332.", "234332333332", "233333333332", "233333333332", ".2333333332.", "..23333332..", "...233332...", "....2332....", ".....22.....", "............"],
  boot: ["............", "...22222....", "...23332....", "...23332....", "...23332..4.", "...233322.4.", "...2333332..", "..22333333..", ".2333333332.", ".1111111111.", "............", "4.4.4......."],
  crit: ["4..........4", ".4........4.", "..4..33..4..", "....3223....", "...322223...", "..32211223..", "..32211223..", "...322223...", "....3223....", "..4..33..4..", ".4........4.", "4..........4"],
  fist: ["............", "...1111.....", "..133331....", ".13232321...", ".13232321...", ".13333331...", ".13333331...", "..1333331...", "..133331....", "...1331.....", "....11......", "............"],
};

/** Glyph per skill id (skills with a hand-made icon above are not listed). */
const SKILL_GLYPH: Record<string, string> = {
  // wizard upgrade nodes (tinted in their school's colours)
  w_fb_split: "star4", w_fb_heat: "flame", w_fb_haste: "wind", w_fb_burst: "burst", w_fb_pierce: "arrow", w_fb_inferno: "up",
  w_bz_wide: "flake", w_bz_bite: "crit", w_bz_last: "halo", w_bz_freeze: "mirror", w_bz_age: "wind", w_bz_bite2: "spikes",
  w_th_fork: "bolt", w_th_charge: "up", w_th_wide: "cloud", w_th_stun: "star4", w_th_long: "halo", w_th_swift: "wind",
  k_lunge: "sword", k_whirl: "swirl", k_mastery: "up", k_rush: "sword", k_judgement: "sword", k_riposte: "crit", k_ironskin: "fist",
  k_taunt: "mouth", k_holyblade: "sword", k_consecrate: "halo", k_rally: "star4", k_aura: "halo", k_wrath: "burst",
  n_smoke: "smoke", n_swift: "boot", n_assassinate: "crit", n_cuts: "swirl", n_shuriken: "star4", n_flurry: "wind", n_parry: "mirror",
  n_vital: "crit", n_flame: "flame", n_poison: "drop", n_caltrops: "spikes", n_lightning: "bolt", n_dragon: "beast",
  w_wave: "wave", w_pyro: "flame", w_firewall: "flame", w_orb: "orb", w_shards: "flake", w_armor: "mirror", w_mirror: "mirror",
  w_blizzard: "flake", w_missiles: "orb", w_blink: "star4", w_static: "bolt", w_flow: "up", w_storm: "cloud",
  a_power: "arrow", a_aim: "eye", a_fan: "arrow", a_beartrap: "jaws", a_reflex: "wind", a_explosive: "burst", a_net: "net",
  a_sentry: "totem", a_firearrows: "arrow", a_frostarrow: "arrow", a_windwalk: "wind", a_feast: "heart", a_phoenix: "beast",
  b_cleave: "sword", b_bloodthirst: "drop", b_berserk: "mouth", b_whirlwind: "swirl", b_battlecry: "mouth", b_howl: "mouth",
  b_retaliate: "fist", b_drums: "drum", b_ancestors: "halo", b_slam: "fist", b_thick: "heart", b_seismic: "spikes", b_avalanche: "burst",
};
/** Skills that reuse a hand-made icon. */
const SAME_ICON: Record<string, string> = {
  k_shield: "guard", k_quake: "earthquake", n_step: "dash", n_storm: "bladestorm", w_nova: "nova", w_meteor: "meteor",
  a_volley: "volley", a_rain: "arrowrain", b_rage: "rage", b_leap: "leap",
};

function glyphIcon(id: string): Icon | undefined {
  const s = skillById(id);
  const gl = SKILL_GLYPH[id] && GLYPHS[SKILL_GLYPH[id]];
  if (!s || !gl) return undefined;
  const pal = PALETTE[s.style];
  const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
  return { pal: { "1": "#1b1b2a", "2": hex(pal[Math.min(3, pal.length - 1)]), "3": hex(pal[2]), "4": hex(pal[0]) }, px: gl };
}

const cache = new Map<string, string>();

/** Data URL of the icon for a skill id (power id like "guard", or "combo"); "" if there is none. */
export function skillIcon(id: string): string {
  if (cache.has(id)) return cache.get(id)!;
  if (typeof document === "undefined") return "";
  // Skill tree skills: the 24x24 painted icon (client/src/skillArt.ts)
  const art = paintSkill(id) ?? paintStatus(id);
  if (art) {
    const c = document.createElement("canvas");
    c.width = ICON; c.height = ICON;
    const g = c.getContext("2d")!;
    art.forEach((col, i) => { if (col) { g.fillStyle = col; g.fillRect(i % ICON, Math.floor(i / ICON), 1, 1); } });
    const url = c.toDataURL();
    cache.set(id, url);
    return url;
  }
  const ic = ICONS[SAME_ICON[id] ?? id] ?? glyphIcon(id);
  if (!ic) return "";
  const c = document.createElement("canvas");
  c.width = 12; c.height = 12;
  const g = c.getContext("2d")!;
  ic.px.forEach((row, y) => [...row].forEach((ch, x) => {
    const col = ic.pal[ch];
    if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  }));
  const url = c.toDataURL();
  cache.set(id, url);
  return url;
}

/** <img> tag for a skill icon (empty string when there is no icon). */
export const iconImg = (id: string, cls = "sicon") => {
  const u = skillIcon(id);
  return u ? `<img class="${cls}" src="${u}" alt="" draggable="false">` : "";
};
