/**
 * Small pixel-art icons for menus and HUD buttons, in place of emoji (emoji clash with the pixel look).
 * Each icon is a 10x10 map of palette letters, drawn once to a data URL and shown at 2x (20px) with
 * `image-rendering: pixelated` (class "pxi", styled in menus.css).
 *
 * `icon(name)` returns an <img> HTML string to drop into innerHTML.
 */

const PAL: Record<string, string> = {
  o: "#080504", // outline
  s: "#c8c4bc", S: "#7a7670", w: "#f4ecd8", // steel, dark steel, highlight
  g: "#e3bf6a", G: "#a8823a", y: "#ffe7a0", // gold, dark gold, bright gold
  b: "#8a5a30", B: "#5a3a1e", // leather
  k: "#d8c08a", K: "#9a8050", // parchment
  r: "#c0402c", R: "#6e1a10", // red
  u: "#5a8ae0", U: "#2a3a78", // blue
  n: "#7fb04a", N: "#3e6a24", // green
  f: "#ffb030", F: "#e05a18", // flame
};

const MAPS: Record<string, string[]> = {
  // Hero: steel heater shield with a gold cross on red
  shield: [
    ".oooooooo.",
    "owssssssSo",
    "osrrggrRSo",
    "osrrggrRSo",
    "osggggggSo",
    "osrrggrRSo",
    ".osrggRSo.",
    ".oSrggRSo.",
    "..oSSSSo..",
    "...oooo...",
  ],
  // Skills: gold star
  star: [
    "....oo....",
    "...oyyo...",
    "...oygo...",
    "ooooygoooo",
    "oyyyyggGGo",
    ".oyygggGo.",
    "..oygggo..",
    ".oygGoGGo.",
    ".oyGo.oGo.",
    ".ooo...oo.",
  ],
  // Bag: leather pack with a gold buckle
  bag: [
    "...oooo...",
    "..oBooBo..",
    "..oB..Bo..",
    ".oobbbboo.",
    "obkbbbbbBo",
    "obbbbbbbBo",
    "obbbggbbBo",
    "obbbGGbbBo",
    "oBbbbbbBBo",
    ".oooooooo.",
  ],
  // Group: two crossed swords
  swords: [
    "oo......oo",
    "owo....oso",
    ".osw..oso.",
    "..osooso..",
    "...osso...",
    "...osso...",
    "..oGooGo..",
    ".ogGo.oGgo",
    "oBoo...oBo",
    "oo......oo",
  ],
  // Game menu: three bronze bars
  menu: [
    "..........",
    "oooooooooo",
    "oyggggggGo",
    "oooooooooo",
    "oyggggggGo",
    "oooooooooo",
    "oyggggggGo",
    "oooooooooo",
    "..........",
    "..........",
  ],
  // Music: a pair of eighth notes
  note: [
    "...ooooooo",
    "...oggggGo",
    "...ogoooGo",
    "...ogo.oGo",
    "...ogo.oGo",
    ".oooGooooG",
    "oyggoyggGo",
    "oggGoggGGo",
    ".ooo.ooo..",
    "..........",
  ],
  // Ideas: candle (a lit idea)
  candle: [
    "....oo....",
    "...ofyo...",
    "...ofFo...",
    "....oo....",
    "...okko...",
    "...okKo...",
    "...okKo...",
    "..ooKKoo..",
    ".oGGGGGGo.",
    "..oooooo..",
  ],
  // News: rolled parchment scroll
  scroll: [
    ".ooooooo..",
    "okKkkkkko.",
    "okoKkkkkko",
    ".ookKKKko.",
    "..okBBBko.",
    "..okkkkko.",
    "..okBBBko.",
    ".ookkkkKo.",
    "okKkkkkKo.",
    ".ooooooo..",
  ],
  // Save and return: a small campfire (the start screen is by the fire)
  fire: [
    ".....o....",
    "....ofo...",
    "...ofyfo..",
    "..ofyyFo..",
    "..ofyyfFo.",
    ".oFfyyfFo.",
    ".oFffffFo.",
    "oBbooooBbo",
    ".oBbbbbBo.",
    "..oooooo..",
  ],
  // Back / close: a bronze X
  close: [
    "oo......oo",
    "ogo....oGo",
    ".ogo..oGo.",
    "..ogooGo..",
    "...oggo...",
    "...oGGo...",
    "..oGooGo..",
    ".oGo..oGo.",
    "oGo....oGo",
    "oo......oo",
  ],
  coin: [
    "..oooooo..",
    ".oyyyggGo.",
    "oyggggggGo",
    "oygGGGGgGo",
    "oygGggGgGo",
    "oygGggGgGo",
    "oygGGGGgGo",
    "ogggggggGo",
    ".oGGGGGGo.",
    "..oooooo..",
  ],
  potion: [
    "...oooo...",
    "...oBBo...",
    "...okKo...",
    "..oowsoo..",
    ".owrrrrRo.",
    "orrrrrrrRo",
    "orwrrrrrRo",
    "orrrrrrRRo",
    ".oRRRRRRo.",
    "..oooooo..",
  ],
  lock: [
    "..oooooo..",
    ".oSSSSSSo.",
    ".oSo..oSo.",
    ".oSo..oSo.",
    "oooooooooo",
    "oyggggggGo",
    "ogggooggGo",
    "ogggoGggGo",
    "oGGGGGGGGo",
    "oooooooooo",
  ],
  check: [
    "..........",
    "........oo",
    ".......ono",
    "......onNo",
    "oo...onNo.",
    "ono.onNo..",
    ".ononNo...",
    "..onNo....",
    "...oo.....",
    "..........",
  ],
  sword: [
    "........oo",
    ".......owo",
    "......owSo",
    ".....owSo.",
    "....owSo..",
    ".oooowSo..",
    "..oGoSo...",
    "..oGGo....",
    ".oBooGo...",
    "oBo..oo...",
  ],
  // Online players: two hooded heads side by side (one gold, one blue)
  people: [
    "..oo......",
    ".oggo..oo.",
    ".oggo.ouuo",
    "..oo..ouuo",
    ".oGGo..oo.",
    "oGggGooUUo",
    "oGggGoUuuU",
    "oGggGoUuuU",
    "oGggGoUuuU",
    "oooooooooo",
  ],
};

const cache = new Map<string, string>();

/** Data URL of a pixel icon (10x10 art pixels). */
export function iconUrl(name: string): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const map = MAPS[name];
  if (!map) return "";
  const c = document.createElement("canvas");
  c.width = 10; c.height = 10;
  const g = c.getContext("2d")!;
  map.forEach((row, y) => [...row].forEach((ch, x) => {
    const col = PAL[ch];
    if (!col) return;
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  }));
  const url = c.toDataURL();
  cache.set(name, url);
  return url;
}

/** An <img> tag for innerHTML: `icon("shield")`. */
export function icon(name: string, cls = ""): string {
  return `<img class="pxi${cls ? ` ${cls}` : ""}" src="${iconUrl(name)}" alt="" draggable="false">`;
}

/** Fills every `<i data-icon="name">` placeholder under `root` (used by index.html buttons). */
export function fillIcons(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("i[data-icon]").forEach((el) => {
    el.outerHTML = icon(el.dataset.icon!);
  });
}
