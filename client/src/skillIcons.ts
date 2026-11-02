/**
 * Tiny pixel-art icons (12x12) for the active skills and the combo, used on the slot bar and in the skill tree.
 * Each icon is a character map; every letter is a colour from its palette, "." is transparent.
 * Rendered once to a data URL and shown with `image-rendering: pixelated`.
 */
type Icon = { pal: Record<string, string>; px: string[] };

const ICONS: Record<string, Icon> = {
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

const cache = new Map<string, string>();

/** Data URL of the icon for a skill id (power id like "guard", or "combo"); "" if there is none. */
export function skillIcon(id: string): string {
  if (cache.has(id)) return cache.get(id)!;
  const ic = ICONS[id];
  if (!ic || typeof document === "undefined") return "";
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
