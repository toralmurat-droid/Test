import { TILE } from "./constants";
import { MAX_LEVEL } from "./classes";
import { isSafeZone, isSolidAt, PORTAL_SPOTS } from "./map";
import { isDecorSolidAt, NPCS } from "./npcs";
import { underground } from "./dungeon";
import { noMobsAt, SPAWN_ZONES, type SpawnZone } from "./spawns";
import { huntable, nearLevel, rng, signature, BOARDS } from "./bounty";
import { allObjects, spotNear, type QuestObject, type QuestObjectKind, type QuestStep } from "./quests";
import { stepObjects } from "./questSteps";
import { TITLES } from "./cosmetics";

/**
 * Tavern Rumours (docs/quest-concepts-progress.md, concept #10): Mags the alewife on the Oakvale square hears three
 * rumours a day, short side quests of 2-3 steps in zones about the hero's level. Each zone's rumour is rolled from the
 * UTC day alone (template, words, spots), so heroes who are offered the same zone get the very same errand and can team
 * up; only which three zones a hero is offered (and the pay) follows their level. Pure and deterministic: the server
 * runs them (server/rumours.ts) and the client builds the identical objects from the same `rumoursFor` call.
 * XP 0 (decision 11: levelling stays slow); gold, a rune now and then, and a title after RUMOURS.titleAt of them.
 */

/** The numbers (decision 10). */
export const RUMOURS = {
  /** Rumours on offer each day, and the level window (±) their zones are picked from */
  offers: 3, window: 2,
  /** Pay: gold base + per level of the rumour, a rune at this chance; no XP */
  goldBase: 10, goldPerLevel: 6, runeChance: 0.25, xp: 0,
  /** Finished rumours (all days together) that earn the title */
  titleAt: 7,
  /** reach steps: radius (tiles) */
  reachR: 2.5,
  /** Steps of one rumour stand at least this far apart (tiles) when the zone has the room (a third of its short side otherwise) */
  apart: 10,
  /** The `missing` ambusher: rises this many tiles from the spot it watches, with this HP multiplier */
  ambushNear: [3, 6] as [number, number], ambushHp: 1.5,
  /** It rises when its hero comes this close (px), goes when they wander this far off (px), comes back after this (ms) */
  summonR: 16 * TILE, leashR: 40 * TILE, resummonMs: 15_000,
  /** ...and sinks back after this long unfought (ms; it rises again while its hero is still on the step) */
  ambushLifeMs: 10 * 60_000,
  /** Its summonChain tag (TownRoom summonFused): not a chain (>= 0) and not a wrong-grave ambush (-1) */
  tag: -2,
  /** How often the server looks at heroes on a rumour (ms) */
  scanMs: 250,
};
/** Who hears the rumours (shared/npcs.ts). */
export const RUMOUR_GIVER = "alewife";
/** The title after RUMOURS.titleAt rumours (shared/cosmetics.ts TITLES index). */
export const RUMOUR_TITLE = TITLES.indexOf("Rumour-Chaser");

/** Mags's own lines for the dialog: when the hero walks up, and when all of today's rumours are done. */
export const MAGS_LINES = {
  greeting: "Come in, love, mind the cart. Folk tell me things over a cup, and I pass on what's worth passing. Three bits of gossip today. Fancy a look?",
  allDone: "That's the lot for today, love. You've heard all I have. Come back tomorrow; the valley never runs short of trouble, or of tongues.",
};

export type RumourKind ="lost" | "missing" | "light";
export const RUMOUR_KINDS: RumourKind[] = ["lost", "missing", "light"];

/**
 * A hero's rumours (unsynced Player.rumour, saved as HeroSave.rumour): the day and level today's offers were built for,
 * which of them are done (bit per offer), all finished ever (`n`), and the one under way (offer `i`, 1-based `stage`, `count`).
 */
export interface RumourState { day: number; lv: number; done: number; n: number; i?: number; stage?: number; count?: number }

export interface Rumour {
  /** Offer index 0..2; `id` = "r<day>z<zone index>", the prefix of its object ids */
  i: number; id: string; kind: RumourKind;
  zone: string; level: number;
  title: string; text: string[]; outro: string;
  steps: QuestStep[];
  reward: { gold: number; xp: number; rune: number };
}

/** The UTC day number: rumours roll over at UTC midnight. */
export const rumourDay = (now: number) => Math.floor(now / 86_400_000);

// ---- Text pools (draft text; the content writer polishes). {zone} = the zone's name. ----

interface Piece { kind: QuestObjectKind; name: string; verb: string; obj: string }
interface LostTale { title: string; text: string[]; a: Piece; b: Piece; outro: string }
interface MissingTale { title: string; text: string[]; seen: string; foe: string; find: Piece; outro: string }
interface LightTale { title: string; text: string[]; seen: string; find: Piece; outro: string }

const LOST: LostTale[] = [
  { title: "The Tinker's Satchel", text: ["A tinker came through swearing blue murder. Lost his satchel somewhere in {zone}.", "Tools, a bit of silver, and his late wife's letters. It's the letters he wants back."],
    a: { kind: "clue", name: "Trampled campsite", verb: "Search", obj: "Search the tinker's camp" },
    b: { kind: "urn", name: "Tinker's satchel", verb: "Take", obj: "Find the satchel" },
    outro: "The letters are dry. He says he'll stand you a drink for that. Make it a big one." },
  { title: "A Ring in the Grass", text: ["Young Tam went out to {zone} to ask his girl to marry him. He sneezed, and the ring went flying.", "She said yes anyway. He'd still like the ring."],
    a: { kind: "clue", name: "Flattened grass", verb: "Search", obj: "Find where Tam knelt" },
    b: { kind: "cairn", name: "Stone with a glint beside it", verb: "Look under", obj: "Find the ring" },
    outro: "A plain band, bent a little. Tam will cry. Don't tell him I said so." },
  { title: "The Shepherd's Bell", text: ["Old Hobb's lead ewe lost her bell in {zone}, and now the flock won't follow her.", "Sheep. Stupid as sacks, the lot of them. Hobb loves them."],
    a: { kind: "clue", name: "Tufts of wool on a thorn", verb: "Follow", obj: "Follow the wool" },
    b: { kind: "bell", name: "Shepherd's bell", verb: "Take", obj: "Find the bell" },
    outro: "One ring and every sheep in the valley looked up. Hobb owes you a cheese." },
  { title: "Grandmother's Recipe", text: ["Some thief lifted Nan Ostler's recipe jar and dropped it running through {zone}.", "Her honey cake. Lose that recipe and half of Oakvale loses its reason to get up."],
    a: { kind: "clue", name: "Torn recipe pages", verb: "Gather", obj: "Gather the torn pages" },
    b: { kind: "urn", name: "Clay recipe jar", verb: "Take", obj: "Find the recipe jar" },
    outro: "Most of the pages, and the jar. She can fill in the rest from memory. Probably." },
  { title: "The Courier's Pouch", text: ["A watch courier's horse threw him in {zone}. He walked in; the pouch didn't.", "Sealed orders, he says. Probably just the duty roster. Still."],
    a: { kind: "clue", name: "Hoofprints off the road", verb: "Follow", obj: "Follow the hoofprints" },
    b: { kind: "clue", name: "Dropped dispatch pouch", verb: "Take", obj: "Find the pouch" },
    outro: "Seal unbroken. Captain Hale will never know. Our secret." },
  { title: "The Drover's Whistle", text: ["Big Edda the drover lost her good whistle somewhere in {zone}.", "Her dogs won't work for anyone else. They just sit and look at her."],
    a: { kind: "clue", name: "Dog tracks in the dust", verb: "Follow", obj: "Follow the dog tracks" },
    b: { kind: "urn", name: "Bone whistle in the weeds", verb: "Take", obj: "Find the whistle" },
    outro: "One blast and three dogs came running from nowhere. Edda cried and blamed the dust." },
  { title: "The Widow's Spoons", text: ["Mother Brack buried her husband's silver spoons in {zone} years back, when the dead were marching for the Pale Marshal.", "She's old now and can't recall where. She wants them for her grandson's wedding."],
    a: { kind: "clue", name: "A scratched marker-stone", verb: "Search", obj: "Find her old marker" },
    b: { kind: "cairn", name: "Loose earth under a flat stone", verb: "Dig", obj: "Dig up the spoons" },
    outro: "Seven spoons, black with tarnish. She says that's six more than she expected." },
  { title: "A Lantern Borrowed", text: ["My cousin lent his father's old lantern to a friend bound for {zone}. The friend came back. The lantern didn't.", "It's got a dent shaped like a horse's head. He's been sulking for a week."],
    a: { kind: "clue", name: "Ashes of a small fire", verb: "Search", obj: "Search the old fire" },
    b: { kind: "urn", name: "Dented lantern", verb: "Take", obj: "Find the lantern" },
    outro: "Dented, as promised. He'll polish it every night and tell the story twice as long." },
  { title: "The Apprentice's Chisel", text: ["The mason's apprentice took his master's best chisel out to {zone} to practise on a rock. The chisel's gone.", "Master says the boy can carve with his teeth until it's found."],
    a: { kind: "clue", name: "Chipped rocks", verb: "Search", obj: "Look over the chipped rocks" },
    b: { kind: "cairn", name: "A glint among the stones", verb: "Look under", obj: "Find the chisel" },
    outro: "Not a nick on it. The boy hugged it like a puppy. His master pretended not to watch." },
  { title: "The Letter Never Sent", text: ["Berta wrote to her brother in Saltmere and gave it to a carter. The carter lost a wheel in {zone}, and the letter with it.", "She won't write another. Says it'd come out wrong the second time."],
    a: { kind: "clue", name: "A broken cart wheel", verb: "Search", obj: "Search the broken cart" },
    b: { kind: "clue", name: "A folded letter in the grass", verb: "Take", obj: "Find the letter" },
    outro: "Damp, but readable. Berta's already hunting for a better carter." },
];
const MISSING: MissingTale[] = [
  { title: "Where Did Wil Go?", text: ["Wil the woodcutter went into {zone} two days back and hasn't come home.", "His wife's been in every night asking. I've no answers for her. Maybe you'll find some."],
    seen: "Wil's last campfire", foe: "Old Scar", find: { kind: "cairn", name: "Rocks piled into a hiding place", verb: "Look behind", obj: "Find Wil" },
    outro: "He'd hidden from that thing for two nights on a mouthful of water. He'll be home for supper." },
  { title: "The Miller's Boy", text: ["Odo's youngest chased his kite into {zone} and nobody's seen him since.", "Kite came down somewhere out there. Find that, you'll find the boy."],
    seen: "where the kite came down", foe: "Gristletooth", find: { kind: "clue", name: "A small coat snagged on a root", verb: "Follow the trail", obj: "Find the boy" },
    outro: "Up a tree, sulking, quite unhurt. His mother will kill him herself." },
  { title: "A Guard Gone Quiet", text: ["One of Hale's lads stood watch in {zone} last night. This morning, no lad.", "Hale won't say he's worried. He's on his fourth ale. He's worried."],
    seen: "the cold watch fire", foe: "Grim Harrow", find: { kind: "clue", name: "A dropped spear and helm", verb: "Search", obj: "Find the guard" },
    outro: "Bruised, ashamed, alive. He ran when he should have stood. Hale will make him stand plenty now." },
  { title: "Sisters' Errand", text: ["The Fenn girls went to pick berries in {zone}. One came back.", "She won't stop shaking long enough to say what happened."],
    seen: "the spilled berry basket", foe: "The Skulker", find: { kind: "cairn", name: "A hollow under a boulder", verb: "Look in", obj: "Find the other sister" },
    outro: "Curled up in the hollow with her eyes shut tight. She opened them for you." },
  { title: "The Pedlar's Mule", text: ["A pedlar's mule bolted into {zone} with every ware he owns on its back.", "He'd go himself, but he says the mule bites. The mule's not the problem out there."],
    seen: "the hoofprints in the mud", foe: "Hollowjaw", find: { kind: "clue", name: "Saddlebags in the brush", verb: "Take", obj: "Find the mule's packs" },
    outro: "The mule came home on its own an hour later, smug as you like. The packs are the thing." },
  { title: "The Hunter's Hound", text: ["Ansel's hound never came back from {zone}. Ansel did, white as milk, and won't say why he left her.", "He'd go back, but his legs have other ideas."],
    seen: "the torn-up ground", foe: "Black Maw", find: { kind: "clue", name: "A frayed leash on a branch", verb: "Follow the trail", obj: "Find the hound" },
    outro: "Lame, hungry, and furious. She's with Ansel now. Neither will say who forgave whom." },
  { title: "The Pilgrim's Road", text: ["A pilgrim stopped in for one drink, then set off through {zone}. That was Tuesday.", "Quiet sort. Had a bell and a great deal of faith. I'd like to know it was enough."],
    seen: "the pilgrim's dropped bell", foe: "Widow Gnash", find: { kind: "cairn", name: "A prayer scratched in a stone", verb: "Look behind", obj: "Find the pilgrim" },
    outro: "Sheltering behind a rock, praying out loud. He says that's what kept him alive. I say it was the rock." },
  { title: "The Runaway Bride", text: ["Pretty Maren said she'd go out to {zone} for some air, an hour before her own wedding.", "The groom's sitting in my corner, turning his hat in his hands. Poor lamb."],
    seen: "the flowers dropped on the path", foe: "Redhand Jack", find: { kind: "clue", name: "A veil caught on a bush", verb: "Follow the trail", obj: "Find Maren" },
    outro: "She wasn't running away. She was running from that thing. The wedding's on for Sunday." },
  { title: "Two Boys and a Dare", text: ["Two lads dared each other to spend a night in {zone}. One's home, with a very good story.", "The other one's mother has stopped believing the story."],
    seen: "the boys' ring of stones", foe: "Old Gristle", find: { kind: "cairn", name: "A narrow gap between rocks", verb: "Look in", obj: "Find the second boy" },
    outro: "Wedged in a gap, cold and proud. He'll tell it better than his friend did. Both of them are grounded." },
  { title: "The Lamplighter's Round", text: ["Our lamplighter walks his round at dusk. Last night he walked it out past the edge, into {zone}, and I haven't seen him since.", "Without him half the lamps stay cold. I don't like cold lamps. Not these days."],
    seen: "the last lit lamp", foe: "Cold Tom", find: { kind: "cairn", name: "A shuttered lantern in a hollow", verb: "Look in", obj: "Find the lamplighter" },
    outro: "He'd kept his lamp covered and himself still. Says the dark was patient. He's lit every lamp in town since." },
];
const LIGHT: LightTale[] = [
  { title: "Lights over the Grass", text: ["Three drovers swear they saw a green light in {zone} after dark.", "Swamp gas, says I. But it moved against the wind."],
    seen: "where the green light was seen", find: { kind: "lastlantern", name: "A lamp nobody lit", verb: "Snuff", obj: "Put out the strange lamp" },
    outro: "An old lamp, burning without oil. It went out with a hiss, like a name nobody here remembers." },
  { title: "The Blue Fire", text: ["There's a blue fire burns in {zone} some nights, cold as well-water, they say.", "My gran called them corpse-candles. My gran said a lot of things."],
    seen: "where the blue fire burns", find: { kind: "wardlamp", name: "A cold lamp-post", verb: "Light", obj: "Light the cold lamp" },
    outro: "Lit with honest flame, the blue went out of it. Nobody's seen the cold fire since. Yet." },
  { title: "A Candle in the Dark", text: ["A candle shows in {zone} at night where there's no house to put it in.", "Somebody's waiting for somebody. That's how it looks to me."],
    seen: "where the candle shows", find: { kind: "lastlantern", name: "Candle-lantern on a stump", verb: "Snuff", obj: "Snuff the waiting candle" },
    outro: "There was a name scratched on the lantern's base. Nobody in Oakvale is called that. Not anymore." },
  { title: "The Wisp-Lights", text: ["Children have been following little lights into {zone} after dark. One got as far as the edge before her da caught her.", "Find what's making them. Before the next child goes further."],
    seen: "where the wisps gather", find: { kind: "cairn", name: "A glowing marked stone", verb: "Read", obj: "Read the glowing stone" },
    outro: "Old letters, a warding long worn off. You traced them over and the glow faded. The children will sulk." },
  { title: "The Watcher's Lantern", text: ["Someone keeps a lantern lit in {zone} at night, and it goes out the moment you get close.", "I don't like it. Ale's cheaper when I'm not nervous."],
    seen: "where the lantern was seen", find: { kind: "wardlamp", name: "A dead lantern post", verb: "Relight", obj: "Relight the lantern post" },
    outro: "Lit, it showed nothing but grass and your own shadow. Whoever kept it has gone. Or is waiting for dark again." },
  { title: "The Humming Light", text: ["A light hangs in {zone} after sundown, low and steady, and they say it hums.", "The first druids hung lanterns to keep something in its place, so the tale goes. Make of that what you will."],
    seen: "where the humming starts", find: { kind: "wardlamp", name: "A lantern gone dark", verb: "Light", obj: "Light the old lantern" },
    outro: "The hum stopped the moment the flame caught. Whatever it was leaning on, it let go." },
  { title: "The Fallen Star", text: ["Old Marl swears a star fell in {zone} last week and never went out. Pale as a fish-belly, he says.", "Marl also swears he caught a pike the size of a door. Still. Go and look."],
    seen: "where the star fell", find: { kind: "lastlantern", name: "A pale glowing lamp", verb: "Snuff", obj: "Put out the pale light" },
    outro: "Only a lamp, burning with no oil, and a bad feeling to go with it. Marl says he told you so." },
  { title: "Footprints and a Flame", text: ["Fresh prints lead into {zone}, and where they stop there's a little flame burning on bare ground.", "A watchman showed me. He wouldn't go near it, and neither would I."],
    seen: "where the prints end", find: { kind: "lastlantern", name: "A flame on bare ground", verb: "Snuff", obj: "Snuff the lonely flame" },
    outro: "A wick, no lamp, and a heap of cold ash. Whoever lit it wanted to be found. Or wanted somebody else lost." },
  { title: "The Lamp That Won't Burn", text: ["Hale's lads put a ward-lamp up in {zone} a month back. It won't stay lit.", "Every night someone snuffs it, and in the morning there's not a footprint near it."],
    seen: "the unlit ward-lamp", find: { kind: "wardlamp", name: "A ward-lamp, cold and dark", verb: "Light", obj: "Light the ward-lamp" },
    outro: "It caught on the first try and burned steady. Hale will want to know what changed. So would I." },
  { title: "Beacon of the Dead", text: ["There was a fight in {zone} long before you or I. Now a beacon-fire shows there in the dark, as if for an army still on its way.", "Old soldiers cross themselves. Old soldiers drink more, too."],
    seen: "the old beacon", find: { kind: "lastlantern", name: "A beacon-brazier", verb: "Snuff", obj: "Put out the beacon" },
    outro: "Cold ashes and a scrap of rust-red cloth. The Pale Marshal's men flew colours like that, they say. Best not to dwell." },
];

// ---- Where rumours happen ----

type Pt = { x: number; y: number };
/** Things already standing in the world: no rumour object right on top of one. */
let others: Pt[] | undefined;
const othersNear = (px: number, py: number) =>
  (others ??= [...allObjects(), ...NPCS, ...BOARDS, ...PORTAL_SPOTS.map((p) => ({ x: (p.x + 0.5) * TILE, y: (p.y + 0.5) * TILE }))])
    .some((o) => Math.abs(o.x - px) < 2 * TILE && Math.abs(o.y - py) < 2 * TILE);

/**
 * Open ground for a rumour object (feet px) in zone z: a tile at least one in from its edge, the tile and its
 * neighbours free of walls, water, trees and props, not in a safe or monster-free area, and not on top of another
 * quest object, NPC, board or portal. (Every spot a year of rumours puts down was checked to be reachable on foot
 * from the square; rumour zones are above ground, so no rope or waygate is needed.)
 */
export function rumourGround(z: { x: number; y: number; w: number; h: number }, px: number, py: number): boolean {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (tx < z.x + 1 || ty < z.y + 1 || tx >= z.x + z.w - 1 || ty >= z.y + z.h - 1) return false;
  const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
  if (isSafeZone(cx, cy) || noMobsAt(cx, cy)) return false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = cx + dx * TILE * 0.6, y = cy + dy * TILE * 0.6;
    if (isSolidAt(x, y) || isDecorSolidAt(x, y)) return false;
  }
  return !othersNear(px, py);
}

/** Zones that can have a rumour (SPAWN_ZONES indices): a monster to hunt, in this act, above ground (no crypts or warrens: no night down there). */
export function rumourZones(act = 1): number[] {
  return SPAWN_ZONES.flatMap((z, zi) => (huntable(z, act) && !underground((z.y + z.h / 2) * TILE) ? [zi] : []));
}

/** A spot (feet px) of open ground in z, from the seeded rng: spread from `taken`, or `around` a point (ring of tiles). */
function spotFor(z: SpawnZone, r: () => number, taken: Pt[], around?: { at: Pt; ring: [number, number] }): Pt {
  const apart = Math.min(RUMOURS.apart, Math.min(z.w, z.h) / 3) * TILE;
  const clear = (s: Pt, d: number) => taken.every((t) => Math.hypot(t.x - s.x, t.y - s.y) >= d);
  for (let k = 0; k < 160; k++) {
    let tx: number, ty: number;
    if (around) {
      const a = r() * Math.PI * 2, d = around.ring[0] + r() * (around.ring[1] - around.ring[0]);
      tx = around.at.x / TILE + Math.cos(a) * d; ty = around.at.y / TILE + Math.sin(a) * d;
    } else { tx = z.x + 2 + r() * (z.w - 4); ty = z.y + 2 + r() * (z.h - 4); }
    const s = spotNear(tx, ty);
    if (rumourGround(z, s.x, s.y) && clear(s, around || k >= 100 ? 2 * TILE : apart)) return s;
  }
  // a crowded zone: the first open tile from a seeded start, row by row
  const n = z.w * z.h, start = Math.floor(r() * n);
  for (let k = 0; k < n; k++) {
    const j = (start + k) % n, s = { x: (z.x + (j % z.w) + 0.5) * TILE, y: (z.y + Math.floor(j / z.w) + 0.7) * TILE };
    if (rumourGround(z, s.x, s.y) && clear(s, 2 * TILE)) return s;
  }
  return { x: (z.x + z.w / 2 + 0.5) * TILE, y: (z.y + z.h / 2 + 0.7) * TILE }; // never reached on today's map (tests check every day)
}

/** One zone's rumour on one day, whatever the hero's level: the template, its words and its spots. */
interface Tale { kind: RumourKind; t: number; spots: Pt[] }
const tales = new Map<string, Tale>();
function taleOf(day: number, zi: number): Tale {
  const key = `${day}:${zi}`, hit = tales.get(key);
  if (hit) return hit;
  const z = SPAWN_ZONES[zi], r = rng(day * 4099 + zi * 131 + 7);
  const kind = RUMOUR_KINDS[Math.floor(r() * RUMOUR_KINDS.length)];
  const pool = kind === "lost" ? LOST : kind === "missing" ? MISSING : LIGHT, t = Math.floor(r() * pool.length);
  const a = spotFor(z, r, []), b = spotFor(z, r, [a]);
  // missing: the last sighting, then where the ambusher rises (near it), then where the missing one is
  const spots = kind === "missing" ? [a, spotFor(z, r, [a, b], { at: a, ring: RUMOURS.ambushNear }), b] : [a, b];
  if (tales.size > 512) tales.clear();
  const tale = { kind, t, spots };
  tales.set(key, tale);
  return tale;
}

const fillZone = (s: string, zone: string) => s.replace("{zone}", zone);
const objAt = (id: string, p: Piece, at: Pt): QuestObject => ({ id, kind: p.kind, name: p.name, verb: p.verb, x: at.x, y: at.y });
const useStep = (title: string, zone: string, p: Piece, o: QuestObject): QuestStep =>
  ({ type: "use", text: `${p.obj} in ${zone}.`, banner: [title, p.obj], zone, objects: [o], chest: false, obj: p.obj });
const reachStep = (title: string, zone: string, label: string, at: Pt, night: boolean): QuestStep => ({
  type: "reach", text: `${night ? "After dark, go" : "Go"} to ${label} in ${zone}.`, banner: [title, night ? `After dark: ${label}` : `Go to ${label}`],
  zone, at: { x: at.x, y: at.y, r: RUMOURS.reachR * TILE, label }, obj: night ? `After dark, go to ${label}` : `Go to ${label}`, ...(night ? { night: true } : {}),
});

/** Zone zi's rumour today, as offer i to a hero of level L (its level, and so the ambusher and the pay, follow the hero within the zone's range). */
function rumourAt(day: number, zi: number, i: number, L: number): Rumour {
  const z = SPAWN_ZONES[zi], tale = taleOf(day, zi), zone = z.name, id = `r${day}z${zi}`;
  const level = Math.max(z.levels[0], Math.min(z.levels[1], L));
  const reward = { gold: RUMOURS.goldBase + RUMOURS.goldPerLevel * level, xp: RUMOURS.xp, rune: RUMOURS.runeChance };
  const [a, b, c] = tale.spots;
  if (tale.kind === "lost") {
    const T = LOST[tale.t];
    return { i, id, kind: "lost", zone, level, title: T.title, text: T.text.map((s) => fillZone(s, zone)), outro: T.outro, reward,
      steps: [useStep(T.title, zone, T.a, objAt(`${id}o1`, T.a, a)), useStep(T.title, zone, T.b, objAt(`${id}o2`, T.b, b))] };
  }
  if (tale.kind === "missing") {
    const T = MISSING[tale.t], kind = signature(z)!;
    const kill: QuestStep = {
      type: "kill", text: `Something is waiting at ${T.seen}. Defeat ${T.foe}.`, banner: [T.title, `${T.foe} attacks!`], zone, kinds: [kind], own: true, goal: 1,
      summon: { parts: [kind], level, x: b.x, y: b.y, title: T.foe, hpMult: RUMOURS.ambushHp }, obj: `Defeat ${T.foe}`,
    };
    return { i, id, kind: "missing", zone, level, title: T.title, text: T.text.map((s) => fillZone(s, zone)), outro: T.outro, reward,
      steps: [reachStep(T.title, zone, T.seen, a, false), kill, useStep(T.title, zone, T.find, objAt(`${id}o3`, T.find, c))] };
  }
  const T = LIGHT[tale.t];
  return { i, id, kind: "light", zone, level, title: T.title, text: T.text.map((s) => fillZone(s, zone)), outro: T.outro, reward,
    steps: [reachStep(T.title, zone, T.seen, a, true), useStep(T.title, zone, T.find, objAt(`${id}o2`, T.find, b))] };
}

/**
 * Today's three rumours for a hero of this level: zones of this act (Act 1 for now) whose levels are within
 * RUMOURS.window of theirs, nearest first with a day-seeded shuffle (the nearest zones outside the window if there are
 * not three in it). Same day, level and act: the same rumours, on the server and in every client.
 */
const offered = new Map<string, Rumour[]>();
export function rumoursFor(day: number, level: number, act = 1): Rumour[] {
  const L = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level) || 1)), key = `${day}:${L}:${act}`, hit = offered.get(key);
  if (hit) return hit; // the server asks a few times a second per hero on a rumour; callers never change what they get
  const r = rng(day * 64 + L * 3 + act);
  const scored = rumourZones(act).map((zi) => {
    const z = SPAWN_ZONES[zi];
    return { zi, s: (nearLevel(z, L, RUMOURS.window) ? 0 : 1000) + Math.abs((z.levels[0] + z.levels[1]) / 2 - L) + r() * 1.5 };
  }).sort((a, b) => a.s - b.s || a.zi - b.zi);
  const out = scored.slice(0, RUMOURS.offers).map(({ zi }, i) => rumourAt(day, zi, i, L));
  if (offered.size > 256) offered.clear();
  offered.set(key, out);
  return out;
}

/** Every map object of a rumour (the client draws these while it is under way). */
export const rumourObjects = (r: Rumour): QuestObject[] => r.steps.flatMap(stepObjects);
/** The step a rumour state is on (undefined: none under way). */
export function rumourStep(st: RumourState | undefined): { r: Rumour; s: QuestStep } | undefined {
  if (!st || st.i === undefined || !st.stage) return undefined;
  const r = rumoursFor(st.day, st.lv)[st.i], s = r?.steps[st.stage - 1];
  return r && s ? { r, s } : undefined;
}

/** A saved rumour state, checked (saves are plain JSON); another day's (or none) starts today fresh, keeping only the total. */
export function cleanRumour(v: unknown, today: number, level: number): RumourState {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof RumourState, unknown>>;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0);
  const n = num(o.n), lvNow = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level) || 1));
  if (num(o.day) !== today) return { day: today, lv: lvNow, done: 0, n };
  const st: RumourState = { day: today, lv: Math.max(1, Math.min(MAX_LEVEL, num(o.lv) || lvNow)), done: num(o.done) & ((1 << RUMOURS.offers) - 1), n };
  const i = o.i;
  if (typeof i === "number" && Number.isInteger(i) && i >= 0 && i < RUMOURS.offers && !(st.done & (1 << i))) {
    const r = rumoursFor(today, st.lv)[i];
    if (r) { st.i = i; st.stage = Math.max(1, Math.min(r.steps.length, num(o.stage) || 1)); st.count = 0; }
  }
  return st;
}
