import { MobKind, TILE } from "./constants";
import { AREAS, GULLROCK, HOLLOW, HOLLOW_WARDS, isSafeZone, isSolidAt, REDFANG, VILLAGE, WRECK } from "./map";
import { SPAWN_ZONES, SpawnZone } from "./spawns";
import { npcById } from "./npcs";

/**
 * The blob quest chain. Quests are done one after the other, each in a blob zone a little further from
 * Oakvale and a little tougher (North Meadow → Goldenreach Farms → Misty Marsh → Mirror Pond → Sunken Lake →
 * Brinewood → the wreck of the Grey Heron on Heronwreck Strand). The whole chain stays west of River Ashwell
 * and ends on the coast, where the Gloam first came ashore (Murat 2026-11-03).
 *
 * Progress lives on the server: Player.questId = index in QUESTS, Player.questStage = 0 before the quest is
 * accepted, then 1..steps.length for the step being worked on (stage s = steps[s - 1]); Player.questCount =
 * progress on that step (kills / items, or a bitmask of the objects already used). Claiming the reward at
 * the last step moves on to the next quest (questId + 1, stage 0). questId === QUESTS.length = chain done.
 */
export const BLOB_KINDS: MobKind[] = ["slime", "motherblob", "blobling", "shooterblob", "warriorblob", "healerblob"];

export function isBlob(kind: string): boolean {
  return (BLOB_KINDS as string[]).includes(kind);
}
/** The Pale Marshal's army (skeleton quest chain). */
export const UNDEAD_KINDS: MobKind[] = ["skeleton", "skeletonmage", "crawler", "necromancer", "demon"];
const SKELETONS: MobKind[] = ["skeleton", "skeletonmage", "crawler"];

/** A spawn zone by name, else a map area (the Hollow Throne has no monsters of its own), else the first zone. */
const zoneByName = (name: string): { name: string; x: number; y: number; w: number; h: number } =>
  SPAWN_ZONES.find((z) => z.name === name) ?? AREAS.find((a) => a.name === name) ?? SPAWN_ZONES[0];
const VCX = (VILLAGE.x0 + VILLAGE.x1) / 2, VCY = (VILLAGE.y0 + VILLAGE.y1) / 2;

/**
 * The first quest's zone: the spawn zone closest to Oakvale that has blobs and only low monsters
 * (max level below 4, Murat's rule). Picked from SPAWN_ZONES, so it follows changes to the monster zones.
 */
function pickFirstZone(): SpawnZone {
  const hasBlobs = (z: SpawnZone) => BLOB_KINDS.some((k) => (z.mobs[k] ?? 0) > 0);
  const dist = (z: SpawnZone) => Math.hypot(z.x + z.w / 2 - VCX, z.y + z.h / 2 - VCY);
  const byDist = (a: SpawnZone, b: SpawnZone) => dist(a) - dist(b);
  const low = SPAWN_ZONES.filter((z) => hasBlobs(z) && z.levels[1] < 4).sort(byDist);
  if (low.length) return low[0];
  return SPAWN_ZONES.filter(hasBlobs).sort((a, b) => a.levels[1] - b.levels[1] || byDist(a, b))[0] ?? SPAWN_ZONES[0];
}
export const QUEST_ZONE = pickFirstZone();

/** Rough compass direction of a zone (or point in tiles) from the village. */
function dirFromVillage(tx: number, ty: number): string {
  const k = (Math.round(Math.atan2(ty - VCY, tx - VCX) / (Math.PI / 4)) + 8) % 8;
  return ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"][k];
}
const zdir = (z: { x: number; y: number; w: number; h: number }) => dirFromVillage(z.x + z.w / 2, z.y + z.h / 2);

/** Is (px, py) inside the named spawn zone's rect? */
export function inZone(zone: string, px: number, py: number): boolean {
  const z = zoneByName(zone), tx = px / TILE, ty = py / TILE;
  return tx >= z.x && ty >= z.y && tx < z.x + z.w && ty < z.y + z.h;
}

/**
 * A walkable spot (px, feet) in an area, near the point at fractions (fx, fy) of its rect. Searches outwards
 * tile by tile so map edits never put a quest object inside a wall, tree or lake.
 */
function spotIn(area: string, fx: number, fy: number): { x: number; y: number } {
  const a = AREAS.find((r) => r.name === area) ?? zoneByName(area);
  const cx = Math.floor(a.x + a.w * fx), cy = Math.floor(a.y + a.h * fy);
  const free = (tx: number, ty: number) => {
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    if (isSafeZone(x, y)) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isSolidAt(x + dx * TILE * 0.6, y + dy * TILE * 0.6)) return false;
    return true;
  };
  for (let r = 0; r < 14; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (free(cx + dx, cy + dy)) return { x: (cx + dx + 0.5) * TILE, y: (cy + dy + 0.7) * TILE };
    }
  }
  return { x: (cx + 0.5) * TILE, y: (cy + 0.7) * TILE };
}

// ---- Quest items (dropped by blobs, only visible to and picked up by the player on that step) ----

export interface QuestItemDef { name: string; plural: string }
export const QUEST_ITEMS: Record<string, QuestItemDef> = {
  jelly: { name: "Blob Jelly", plural: "Blob Jelly" },
  core: { name: "Blob Core", plural: "Blob Cores" },
  rot: { name: "Rot Seed", plural: "Rot Seeds" },
  shot: { name: "Sigil Stone", plural: "Sigil Stones" },
  dust: { name: "Grave Dust", plural: "Grave Dust" },
  cod: { name: "Salted Cod", plural: "Salted Cod" },
};

// ---- Map objects you use with E ----

export type QuestObjectKind = "lantern" | "shrine" | "cocoon" | "heart" | "engine" | "beacon" | "crypt" | "phylactery" | "ward";
export interface QuestObject { id: string; kind: QuestObjectKind; x: number; y: number; name: string; verb: string }

const obj = (id: string, kind: QuestObjectKind, name: string, verb: string, area: string, fx: number, fy: number): QuestObject =>
  ({ id, kind, name, verb, ...spotIn(area, fx, fy) });

/** How close (px) you must stand to use a quest object. */
export const USE_RANGE = 1.3 * TILE;

// ---- Quest definitions ----

export type StepType = "see" | "reach" | "talk" | "kill" | "collect" | "use" | "merge" | "ritual" | "equip" | "learn" | "cast";

/** Bump when steps change: saves from an older version restart their current quest at the offer. */
export const QUEST_VERSION = 3;

/**
 * A monster the server puts in the world for a player on this step (one at a time, back if lost): a fused blob
 * when `parts` are blobs, else one monster of kind parts[0] (a Bone Demon, the Pale Marshal...), with a name tag.
 */
export interface Summon { parts: MobKind[]; level: number; x: number; y: number; title?: string; hpMult?: number }
export interface QuestStep {
  type: StepType;
  /** Quest log line */
  text: string;
  /** Banner when the step starts: [title, line] */
  banner: [string, string];
  /** Where to go (spawn zone name) for see / use / merge; for kill / collect it is only where to find them */
  zone?: string;
  /** talk: who to talk to */
  npc?: string;
  /** see / kill / collect / merge / ritual: which monsters (kills and drops count anywhere on the map, Murat's rule) */
  kinds?: MobKind[];
  /** kill: only blobs with at least this many fused inside count */
  fused?: number;
  /** kill: a fused blob spawned for the player in the zone */
  summon?: Summon;
  /** kill: only the monster summoned for this player counts (a named leader of a common kind, like Rask the Reaver) */
  own?: boolean;
  /** kill / collect: how many */
  goal?: number;
  /** collect: item id in QUEST_ITEMS, and drop chance per kind */
  item?: string;
  chance?: Partial<Record<MobKind, number>>;
  /** use: the objects to use (goal = all of them) */
  objects?: QuestObject[];
  /** use: false = no story chest by the last object (chests only at lairs and quest finales) */
  chest?: boolean;
  /** reach: point (px) and radius */
  at?: { x: number; y: number; r: number; label: string };
  /** talk: the NPC's lines and the button that moves on */
  say?: string[];
  accept?: string;
  /** Short line for the tracker; "{n}" and "{goal}" are filled in */
  obj: string;
  /** What the quest giver says while this step is in progress */
  nag?: string;
  /** How-to line under the objective in the tracker (the guided first quest teaches one control per step) */
  hint?: string;
  /** kill: this item goes into the player's bag when the step is done (the first quest's weapon) */
  gift?: string;
  /** Finishing this step brings the hero up to at least this level (so the first quest can teach the skill tree) */
  levelTo?: number;
}

export interface Reward { xp: number; gold: number; potions: number }
export interface QuestDef {
  id: string;
  title: string;
  giver: string; // NPC id
  zone: string; // main zone (for the log)
  minLevel: number;
  description: string;
  /** Offer dialog (stage 0) */
  offer: string[];
  acceptText: string;
  steps: QuestStep[];
  reward: Reward;
  /** What the giver says once it's done (until the next quest is offered) */
  after: string;
}

const FZ = QUEST_ZONE.name;
const FZN = `the ${FZ}`, FZD = zdir(QUEST_ZONE);
const Z = {
  farms: zoneByName("Goldenreach Farms"), marsh: zoneByName("Misty Marsh"), pond: zoneByName("Mirror Pond"),
  lake: zoneByName("Sunken Lake"), brine: zoneByName("Brinewood"), strand: zoneByName("Heronwreck Strand"),
};

export const LANTERNS: QuestObject[] = [
  obj("lantern1", "lantern", "Spirit lantern", "Light", "Misty Marsh", 0.18, 0.3),
  obj("lantern2", "lantern", "Spirit lantern", "Light", "Misty Marsh", 0.42, 0.72),
  obj("lantern3", "lantern", "Spirit lantern", "Light", "Misty Marsh", 0.64, 0.28),
  obj("lantern4", "lantern", "Spirit lantern", "Light", "Misty Marsh", 0.86, 0.66),
];
export const COCOON = obj("cocoon", "cocoon", "Blob cocoon", "Free Tobin", "Sunken Lake", 0.3, 0.35);
export const SHRINES: QuestObject[] = [
  obj("shrine1", "shrine", "Rotting shrine", "Cleanse", "Brinewood", 0.2, 0.3),
  obj("shrine2", "shrine", "Rotting shrine", "Cleanse", "Brinewood", 0.5, 0.75),
  obj("shrine3", "shrine", "Rotting shrine", "Cleanse", "Brinewood", 0.8, 0.35),
];
/** In the breach of the Grey Heron's hull, where it has lain since the wreck. */
export const BROOD_HEART: QuestObject = { id: "heart", kind: "heart", name: "Brood Heart", verb: "Burn", x: (WRECK.x + 0.8) * TILE, y: (WRECK.y + 0.9) * TILE };

const back = (npc: string, name: string, where: string, say: string[], accept: string, nag?: string): QuestStep =>
  ({ type: "talk", npc, text: `Return to ${name}`, banner: ["Quest updated", `Return to ${name}`], say, accept, obj: `Return to ${name} (${where})`, nag });

/**
 * The story: long ago a ship, the Grey Heron, ran onto the rocks of the west coast in a storm. In her hold was a
 * sealed cask of something no one should have carried: the Gloam, one vast ooze. It crawled out of the wreck and
 * swallowed half the valley. The first druids could not kill it, so they broke it into a thousand pieces and bound
 * them with spirit lanterns and forest shrines, so the pieces would forget one another. Those pieces are the
 * blobs. Its heart they could not break, so they left it in the wreck and ringed the strand with the Brinewood
 * shrines. Now the bindings are failing and the blobs remember: a hurt blob calls the others and they fuse (MERGE
 * in constants), and every fusion brings the Gloam closer to whole. Mother Blobs are pieces that remember enough
 * to bud new ones, and the Brood Heart in the wreck on Heronwreck Strand is the Gloam's own heart, pulling every
 * piece home.
 * The chain follows that discovery: first you see blobs fuse, then fused blobs grow armed and bigger,
 * until the Gloam itself rises when you burn its heart.
 */
export const QUESTS: QuestDef[] = [
  {
    id: "meadow", title: "Trouble Near Oakvale", giver: "druid", zone: FZ, minLevel: 1,
    description: `The trees around Oakvale are whispering of something that does not belong. Elder Rowan, the old druid by the village bonfire, asked you to find out what is going on in ${FZN}, ${FZD} of the village.`,
    offer: [
      "Ah, a traveller. Sit by the fire a moment.",
      `The trees have been whispering to me. Something stirs in ${FZN}, ${FZD} of here, something that does not belong.`,
      "My old bones can't make the walk. Will you go and see what is going on?",
    ],
    acceptText: "I'll look into it",
    steps: [
      { type: "see", zone: FZ, kinds: BLOB_KINDS, text: `Investigate ${FZN}`, banner: ["New quest", "Trouble Near Oakvale"],
        obj: `Investigate ${FZN}, ${FZD} of the village`, nag: `${FZ} lies ${FZD} of the village. Look carefully, and come back when you have seen it.` },
      { type: "talk", npc: "druid", text: "Tell Elder Rowan what you saw", banner: [`Blobs in ${FZN}!`, "Go back and tell Elder Rowan"],
        obj: "Tell Elder Rowan what you saw (village bonfire)",
        say: [`Blobs? In ${FZN}? So that is what the trees are afraid of.`, "Blobs are simple things. They wander, they wobble, they keep to themselves. Or they used to.", "Slay 10 of them. And watch them closely while you fight. Tell me what they do when they are hurt."],
        accept: "I'll kill 10 blobs" },
      { type: "kill", kinds: BLOB_KINDS, goal: 10, text: "Kill 10 blobs", banner: ["Quest updated", "Kill 10 blobs"], obj: "Kill blobs: {n} / {goal}",
        nag: "You have slain {n} of {goal}. And watch what the wounded ones do." },
      { type: "merge", kinds: BLOB_KINDS, zone: FZ, text: "Watch a wounded blob call for help", banner: ["Something is strange...", "Wound a blob and watch it"],
        obj: "Wound a blob and watch what it does", nag: "Hurt one, but do not finish it. See what it does." },
      back("druid", "Elder Rowan", "village bonfire", ["They called to each other... and melted into one? You are certain?", "Blobs have not done that since the old tale of the Gloam. I hoped it was only a tale.", "Take this, with the thanks of Oakvale. I must think."], "Claim reward"),
    ],
    reward: { xp: 120, gold: 40, potions: 2 },
    after: "Morwen knows blob jelly better than anyone. Her red tent is on the west side of the square. Ask her what makes them stick together.",
  },
  {
    id: "jelly", title: "Jelly That Crawls", giver: "witch", zone: Z.farms.name, minLevel: 2,
    description: `Morwen wants blob jelly to find out why the blobs have started to fuse. ${Z.farms.name}, ${zdir(Z.farms)} of Oakvale, is crawling with them.`,
    offer: [
      "Rowan sent you? Of course he did. He never comes himself. Blobs that melt into each other, I heard. Nasty.",
      "Jelly is jelly, darling. It should not want anything. Bring me some and we shall see what it wants.",
      `Six lumps of blob jelly, then. ${Z.farms.name} is full of them. Squash them and pick up what they leave behind.`,
    ],
    acceptText: "I'll fetch the jelly",
    steps: [
      { type: "collect", zone: Z.farms.name, kinds: ["slime", "motherblob", "blobling"], item: "jelly", goal: 6, chance: { slime: 0.5, motherblob: 1, blobling: 0.25 },
        text: "Collect 6 Blob Jelly", banner: ["New quest", "Jelly That Crawls"], obj: "Blob Jelly: {n} / {goal}",
        nag: `{n} of {goal}. Any blob will do, but ${Z.farms.name} has plenty.` },
      { type: "talk", npc: "witch", text: "Bring the jelly to Morwen", banner: ["The jelly is moving!", "Bring it to Morwen"],
        obj: "Bring the jelly to Morwen (her tent)",
        say: ["Into the flask with it... oh. Oh, look at that, darling. The lumps are crawling toward each other.", "They want to be one thing. Not two blobs, not six. One.", `I need jelly from a blob that has already fused. Find a big one in ${Z.farms.name} and squash it.`],
        accept: "I'll find a fused blob" },
      { type: "kill", zone: Z.farms.name, kinds: BLOB_KINDS, fused: 2, goal: 1,
        summon: { parts: ["slime", "slime"], level: 4, ...spotIn(Z.farms.name, 0.55, 0.5) },
        text: "Squash a fused blob", banner: ["Quest updated", "Squash a fused blob"], obj: "Fused blob squashed: {n} / {goal}",
        nag: `A big one, two blobs or more in one skin. There is one lurking in ${Z.farms.name}.` },
      back("witch", "Morwen", "her tent", ["This jelly hums, darling. Hums! Like it remembers a song.", "Here, potions from my last batch, and some coin. You earned them. Then go and tell Rowan it hums. He will know what that means."], "Claim reward"),
    ],
    reward: { xp: 220, gold: 60, potions: 3 },
    after: "Rowan has gone pale as milk since you told him. Go and see him, darling. And come back for potions. I do not bite. Much.",
  },
  {
    id: "marsh", title: "Lights in the Mist", giver: "druid", zone: Z.marsh.name, minLevel: 3,
    description: `Elder Rowan told you the tale of the Gloam, the ooze the first druids broke into pieces. The spirit lanterns of ${Z.marsh.name} kept the pieces apart. They have gone dark.`,
    offer: [
      "Jelly that hums. Then it is true. Listen, friend, and I will tell you the tale of the Gloam.",
      "Long ago a ship, the Grey Heron, broke on the rocks of the west coast. In her hold was a sealed cask, and in the cask was the Gloam.",
      "It crawled out of the wreck and swallowed half this valley. The first druids could not kill it, so they broke it into a thousand pieces. Those pieces are the blobs.",
      `They hung spirit lanterns in ${Z.marsh.name}, ${zdir(Z.marsh)} of here. Their light makes the pieces forget one another. Now the lanterns are dark, and the pieces remember.`,
      "Light the four lanterns. And slay a Mother Blob: a piece that remembers enough to bud new pieces.",
    ],
    acceptText: "I'll light them",
    steps: [
      { type: "use", zone: Z.marsh.name, objects: LANTERNS, text: `Light the 4 spirit lanterns in ${Z.marsh.name}`, banner: ["New quest", "Lights in the Mist"],
        obj: "Spirit lanterns lit: {n} / {goal}", nag: "{n} of {goal} lanterns burn. Walk up to one and press E." },
      { type: "kill", zone: Z.marsh.name, kinds: ["motherblob"], goal: 1, text: "Slay a Mother Blob", banner: ["The lanterns burn!", "Now slay a Mother Blob"],
        obj: "Mother Blob slain: {n} / {goal}", nag: "Now a Mother Blob. She is big, and her little ones will swarm you. Strike her first." },
      back("druid", "Elder Rowan", "village bonfire", ["I can see the glow from here. In the light, the marsh blobs scatter and forget.", "But lanterns only slow it. Something is calling the pieces home. Take this, you have earned it."], "Claim reward"),
    ],
    reward: { xp: 320, gold: 80, potions: 2 },
    after: "Brann the smith wants a word with you. Blobs with blades, he says. I fear the fused ones are learning.",
  },
  {
    id: "pond", title: "Armed and Oozing", giver: "weaponsmith", zone: Z.pond.name, minLevel: 4,
    description: `At ${Z.pond.name} blobs that swallow shooters and warriors keep all their tricks. Brann wants them thinned, their cores studied, and the big fused one up there gone.`,
    offer: [
      "You're the one Rowan keeps bragging about? Good. I have a job that needs a sharp blade.",
      `Up at ${Z.pond.name}, ${zdir(Z.pond)} of here, blobs are shooting stones and swinging blades. And when one swallows another, it keeps the trick. A blob that spits AND swings!`,
      "Kill 4 shooters. Bring me 3 cores from the warrior blobs. Then kill that big fused brute that's been seen at the water.",
    ],
    acceptText: "Leave it to me",
    steps: [
      { type: "kill", zone: Z.pond.name, kinds: ["shooterblob"], goal: 4, text: "Kill 4 shooter blobs", banner: ["New quest", "Armed and Oozing"],
        obj: "Shooter blobs: {n} / {goal}", nag: "{n} of {goal} shooters. Close in fast, they're weak up close." },
      { type: "collect", zone: Z.pond.name, kinds: ["warriorblob"], item: "core", goal: 3, chance: { warriorblob: 0.6 },
        text: "Collect 3 Blob Cores from warrior blobs", banner: ["Shooters down!", "Collect 3 Blob Cores"], obj: "Blob Cores: {n} / {goal}",
        nag: "{n} of {goal} cores. Watch out for the lunge, step aside when they crouch." },
      { type: "kill", zone: Z.pond.name, kinds: BLOB_KINDS, fused: 3, goal: 1,
        summon: { parts: ["warriorblob", "shooterblob", "slime"], level: 7, ...spotIn(Z.pond.name, 0.5, 0.45) },
        text: "Slay a blob of 3 or more fused together", banner: ["Cores collected!", "Slay the fused brute"], obj: "Fused brute slain: {n} / {goal}",
        nag: `Three blobs in one, spitting and swinging. It lurks at ${Z.pond.name}. Don't let it call more.` },
      back("weaponsmith", "Brann", "his forge", ["Look at these cores. Three of them, welded into one like hot iron.", "It's building itself a body, piece by piece. Here, you've earned this. The forge is always open to you."], "Claim reward"),
    ],
    reward: { xp: 450, gold: 150, potions: 2 },
    after: "Rowan's got bad news, I hear. Tobin the fisherman never came home.",
  },
  {
    id: "lake", title: "Lost at the Lake", giver: "druid", zone: Z.lake.name, minLevel: 6,
    description: `Tobin the fisherman went to ${Z.lake.name} three days ago and never came back. Elder Rowan fears the blobs have wrapped him in a fused cocoon.`,
    offer: [
      `Tobin the fisherman went to ${Z.lake.name} three days ago. He never came back.`,
      "Hunters saw blobs there fusing around something on the shore, layer over layer, and healer blobs feeding it.",
      "If the Gloam is learning, it may want to learn what we are. Please, find him. Bring him home.",
    ],
    acceptText: "I'll find Tobin",
    steps: [
      { type: "reach", at: { x: COCOON.x, y: COCOON.y, r: 5 * TILE, label: "Tobin's last camp" }, zone: Z.lake.name,
        text: `Search ${Z.lake.name} for Tobin`, banner: ["New quest", "Lost at the Lake"], obj: `Search ${Z.lake.name} for Tobin`,
        nag: "His camp was on the north shore of the lake. Start there." },
      { type: "kill", zone: Z.lake.name, kinds: ["healerblob"], goal: 3, text: "Kill 3 healer blobs feeding the cocoon",
        banner: ["Tobin is inside a fused cocoon!", "Kill the healer blobs that feed it"], obj: "Healer blobs: {n} / {goal}",
        nag: "Healer blobs keep the cocoon alive. Kill them, then cut him free." },
      { type: "use", zone: Z.lake.name, objects: [COCOON], text: "Free Tobin from the cocoon", banner: ["The cocoon weakens!", "Free Tobin"],
        obj: "Free Tobin from the cocoon", nag: "Hurry, cut him free!" },
      { type: "talk", npc: "fisher", text: "Check on Tobin back in Oakvale", banner: ["Tobin is free!", "He ran home to Oakvale"],
        obj: "Check on Tobin in Oakvale (east of the bonfire)",
        say: ["You came for me! They kept melting into each other around me, bigger and bigger.", "And they hummed. One word, over and over. Gloam. Gloam. Gloam.", "Here, it's all my savings. Thank you, friend. I am never fishing there again."],
        accept: "Claim reward", nag: "" },
    ],
    reward: { xp: 650, gold: 200, potions: 3 },
    after: "Tobin heard them say its name. The Gloam is waking. And the pieces drift west, toward the old wreck on the coast. Talk to me when you are ready.",
  },
  {
    id: "woods", title: "The Rotting Shrines", giver: "druid", zone: Z.brine.name, minLevel: 10,
    description: `The shrines of ${Z.brine.name}, behind the beach where the Grey Heron was wrecked, are the last binding stones of the Gloam, and they are rotting under blob slime. Elder Rowan asked you to cleanse them, gather the rot seeds, and destroy the great fused blob that guards them.`,
    offer: [
      "Tobin's cocoon was full of tiny black seeds. Rot seeds. Bits of the Gloam's memory, carried by the healers.",
      `The old shrines of ${Z.brine.name}, ${zdir(Z.brine)} of here by the sea, were the druids' last binding stones. They ring the strand where the Grey Heron broke up, to keep what is left in her hold from the valley.`,
      "The rot eats them, and with every shrine that falls the blobs fuse bigger.",
      "Cleanse the three shrines and bring me 4 rot seeds. Something huge has fused there to guard them. Bring it down.",
    ],
    acceptText: "I'll cleanse them",
    steps: [
      { type: "use", zone: Z.brine.name, objects: SHRINES, text: "Cleanse the 3 rotting shrines", banner: ["New quest", "The Rotting Shrines"],
        obj: "Shrines cleansed: {n} / {goal}", nag: "{n} of {goal} shrines are clean. Press E at each one." },
      { type: "collect", zone: Z.brine.name, kinds: ["healerblob"], item: "rot", goal: 4, chance: { healerblob: 0.7 },
        text: "Collect 4 Rot Seeds from healer blobs", banner: ["The shrines are clean!", "Collect 4 Rot Seeds"], obj: "Rot Seeds: {n} / {goal}",
        nag: "{n} of {goal} seeds. The healers hide behind the others, go for them first." },
      { type: "kill", zone: Z.brine.name, kinds: BLOB_KINDS, fused: 4, goal: 1,
        summon: { parts: ["warriorblob", "healerblob", "shooterblob", "slime"], level: 14, ...spotIn(Z.brine.name, 0.5, 0.5) },
        text: "Slay a blob of 4 or more fused together", banner: ["The seeds stir...", "Slay the Brinewood Amalgam"], obj: "Brinewood Amalgam slain: {n} / {goal}",
        nag: `Four blobs in one skin, and it heals itself. It guards the heart of ${Z.brine.name}.` },
      back("druid", "Elder Rowan", "village bonfire", ["These seeds all point the same way. Down to the strand, to the wreck of the Grey Heron.", "Her hold never let go of the Brood Heart. It is the Gloam's own heart, pulling every piece back home. Rest, and take this."], "Claim reward"),
    ],
    reward: { xp: 900, gold: 260, potions: 3 },
    after: "The Gloam's heart still beats in the wreck of the Grey Heron. Come to me when you are strong enough to face it.",
  },
  {
    id: "thorn", title: "The Gloam Awakens", giver: "druid", zone: Z.strand.name, minLevel: 12,
    description: `The Brood Heart lies in the broken hold of the Grey Heron, wrecked on ${Z.strand.name}, where the Gloam first came ashore. Two Mother Blobs guard it. Burn it, and every piece near it will fuse into the Gloam itself.`,
    offer: [
      `It is time. The Brood Heart lies in the wreck of the Grey Heron on ${Z.strand.name}, ${zdir(Z.strand)} of here.`,
      "That is where it all began. The Gloam crawled out of her hold, and its heart never left it. The sea has been rotting her timbers for a hundred years, and still it beats.",
      "Two Mother Blobs guard it. Slay them, then burn the heart with this torch of oak fire.",
      "When the heart burns, the Gloam will try to become whole one last time. Every blob near it will fuse into one. You must destroy what rises.",
    ],
    acceptText: "I will end it",
    steps: [
      { type: "kill", zone: Z.strand.name, kinds: ["motherblob"], goal: 2, text: "Slay 2 Mother Blobs", banner: ["New quest", "The Gloam Awakens"],
        obj: "Mother Blobs slain: {n} / {goal}", nag: "{n} of {goal} Mother Blobs. Take potions, and do not fight them both at once." },
      { type: "use", zone: Z.strand.name, objects: [BROOD_HEART], text: "Burn the Brood Heart", banner: ["The guardians have fallen!", "Burn the Brood Heart"],
        obj: "Burn the Brood Heart", nag: "The heart is unguarded. Burn it!" },
      { type: "kill", zone: Z.strand.name, kinds: BLOB_KINDS, fused: 6, goal: 1,
        summon: { parts: ["warriorblob", "shooterblob", "healerblob", "warriorblob", "slime", "shooterblob"], level: 16, x: BROOD_HEART.x + 3 * TILE, y: BROOD_HEART.y },
        text: "Destroy the Gloam", banner: ["THE GLOAM RISES", "Destroy it before it grows"], obj: "The Gloam destroyed: {n} / {goal}",
        nag: "It rose from the wreck by the burning heart. Six pieces in one. Destroy it!" },
      back("druid", "Elder Rowan", "village bonfire", ["I felt it, all the way here. The whole valley sighed, and the sea with it.", "There will always be blobs, friend, but with no heart to call them, they will never find each other again. Oakvale owes you everything."], "Claim reward"),
    ],
    reward: { xp: 1600, gold: 500, potions: 5 },
    after: "The land is quieter thanks to you. The pieces wander alone again. May the old oaks shelter you, friend.",
  },
];

// ---- The skeleton quest chain: the Pale Marshal ----

/** A quest object standing on a given tile (feet just inside it). */
const objAt = (id: string, kind: QuestObjectKind, name: string, verb: string, tx: number, ty: number): QuestObject =>
  ({ id, kind, name, verb, x: (tx + 0.5) * TILE, y: (ty + 0.7) * TILE });

const BZ = {
  quarry: zoneByName("Stonecrag Quarry"), ruins: zoneByName("Old Ruins"), tower: zoneByName("Old Watchtower"),
  barrow: zoneByName("Barrow Downs"), grave: zoneByName("Gravemoor Cemetery"), keep: zoneByName("Greywatch Keep"),
};
/**
 * The half-built siege engines at Stonecrag Quarry. Their real spots are the skeletons' work sites, which
 * shared/siege.ts works out (it needs the chests, which need these quests, so it moves these objects onto the
 * sites itself when it loads); the spots here are only a fallback.
 */
export const ENGINES: QuestObject[] = [0, 1, 2, 3].map((i) =>
  obj(`engine${i + 1}`, "engine", "Half-built siege engine", "Burn", "Stonecrag Quarry", 0.2 + 0.6 * (i % 2), 0.3 + 0.4 * Math.floor(i / 2)));
export const BEACON = obj("beacon", "beacon", "Green signal fire", "Douse", "Old Watchtower", 0.5, 0.62);
/** The four crypts of Gravemoor (see the cemetery in shared/map.ts): the seal stands in each doorway. */
export const CRYPTS: QuestObject[] = ([[189, 133], [209, 133], [189, 148], [209, 148]] as const)
  .map(([cx, cy], i) => objAt(`crypt${i + 1}`, "crypt", "Open crypt", "Seal", cx, cy + 1)); // in the doorway
export const PHYLACTERY = obj("phylactery", "phylactery", "The Marshal's phylactery", "Shatter", "Greywatch Keep", 0.485, 0.5);

/**
 * The story: three hundred years ago Vaeloth was the last Marshal of Greywatch Keep. When the keep fell he would
 * not lie down: he bound his soul into a phylactery and learned the necromancer's art, so that death could never
 * end his watch. Now he wants more than a keep. He raises every grave in the valley as a soldier, and his dead
 * march in ranks, quarry stone, build catapults and give their bones to summon Bone Demons, an army that
 * means to conquer the world, starting with Oakvale.
 * The chain starts around level 6 (mid-way through the blob story) and climbs zone by zone away from the village:
 * Stonecrag Quarry → Old Ruins → Old Watchtower → Barrow Downs → Gravemoor Cemetery → Greywatch Keep.
 * Captain Hale of the Oakvale watch gives most of it; Brann knows siege work and Elder Rowan knows the old tales.
 */
export const BONE_QUESTS: QuestDef[] = [
  {
    id: "quarry", title: "The Marching Dead", giver: "captain", zone: BZ.quarry.name, minLevel: 6,
    description: `The night watch saw skeletons marching in step on the road by ${BZ.quarry.name}. Captain Hale wants to know what the dead are doing there.`,
    offer: [
      "You there. You have the look of someone who can swing a blade. I have a job the watch can't spare men for.",
      `Last night my sentries saw skeletons on the road by ${BZ.quarry.name}, ${zdir(BZ.quarry)} of the gate. Marching. In step. Four abreast.`,
      "The dead don't march, friend. Not unless someone is giving the orders. Go and see what they are up to.",
    ],
    acceptText: "I'll scout the quarry",
    steps: [
      { type: "see", zone: BZ.quarry.name, kinds: SKELETONS, text: `Scout ${BZ.quarry.name}`, banner: ["New quest", "The Marching Dead"],
        obj: `Scout ${BZ.quarry.name}, ${zdir(BZ.quarry)} of the village`, nag: `${BZ.quarry.name} is ${zdir(BZ.quarry)} of the gate. Keep your head down.` },
      { type: "kill", zone: BZ.quarry.name, kinds: UNDEAD_KINDS, goal: 8, text: "Break the quarry work gang: slay 8 undead",
        banner: ["They are cutting stone!", "Slay 8 of the undead"], obj: "Undead slain: {n} / {goal}",
        nag: "{n} of {goal}. They fight together, so don't let them circle you." },
      { type: "collect", zone: BZ.quarry.name, kinds: SKELETONS, item: "shot", goal: 4, chance: { skeleton: 0.4, crawler: 0.3, skeletonmage: 0.5 },
        text: "Take 4 of the stones they carry", banner: ["They carry round stones...", "Bring back 4 of them"], obj: "Sigil Stones: {n} / {goal}",
        nag: "{n} of {goal} stones. The skeletons haul them, take them off the bodies." },
      back("captain", "Captain Hale", "east gate", [
        "Round stones, every one the same size, and carved with a sigil. These aren't for building walls.",
        "This is catapult shot. Somebody is building an army out there, and arming it for a siege.",
        "Here, your pay. Then go and show Brann. He served on the siege lines in his youth.",
      ], "Claim reward"),
    ],
    reward: { xp: 600, gold: 150, potions: 2 },
    after: "Show those stones to Brann at the forge. If anyone knows siege work, he does.",
  },
  {
    id: "engines", title: "Engines of the Dead", giver: "weaponsmith", zone: BZ.quarry.name, minLevel: 8,
    description: `The dead are building siege engines in ${BZ.quarry.name}, and their bone-wrights, the skeleton mages of ${BZ.ruins.name}, bind them with dark magic. Brann wants the engines burned and the bone-wrights put down.`,
    offer: [
      "Hale sent you? Let me see those stones. Hmph. Sigil shot. The old marshals of Greywatch used this mark.",
      `Stone shot means catapults. And the dead aren't only cutting stone in ${BZ.quarry.name}, they're building the engines right there. I've seen the timber from the road.`,
      `Burn every engine before it's finished. Then go to ${BZ.ruins.name}: the mages there bind the beams with bone-magic. Bone-wrights, we called them. Kill four.`,
    ],
    acceptText: "I'll burn them",
    steps: [
      { type: "use", zone: BZ.quarry.name, objects: ENGINES, chest: false, text: `Burn the siege engines in ${BZ.quarry.name}`,
        banner: ["New quest", "Engines of the Dead"], obj: "Siege engines burned: {n} / {goal}",
        nag: "{n} of {goal} engines burn. Walk up to one and press E. The workers will drop their tools and come for you." },
      { type: "kill", zone: BZ.ruins.name, kinds: ["skeletonmage"], goal: 4, text: `Slay 4 skeleton mages, the bone-wrights of ${BZ.ruins.name}`,
        banner: ["The engines burn!", "Now slay 4 bone-wrights"], obj: "Skeleton mages: {n} / {goal}",
        nag: `{n} of {goal} bone-wrights. They hide in the graves around ${BZ.ruins.name}, so watch your step.` },
      back("weaponsmith", "Brann", "his forge", [
        "I could see the smoke from the forge. Good work. And no more bone-wrights to rebuild them.",
        "But listen: an engine needs a target, and an army needs a commander. Somebody gives these bones their orders.",
        "Hale says the Old Watchtower has been burning green at night. Go and see him. Here, for your trouble.",
      ], "Claim reward"),
    ],
    reward: { xp: 800, gold: 200, potions: 2 },
    after: "Captain Hale wants you. Something about green fire on the Old Watchtower.",
  },
  {
    id: "signal", title: "Green Fire on the Tower", giver: "captain", zone: BZ.tower.name, minLevel: 10,
    description: `A green signal fire burns on ${BZ.tower.name} every night, calling the dead to muster. Captain Hale wants it put out and wants to know who lit it.`,
    offer: [
      `Every night a green fire burns on ${BZ.tower.name}, ${zdir(BZ.tower)} of here. Every night, more of them on the roads.`,
      "It's a muster signal. The dead gather to it like soldiers to a drum.",
      "Put it out. And be careful: my scouts say when the bones are losing, they do something... unholy. If you see it, I want to know.",
    ],
    acceptText: "I'll put it out",
    steps: [
      { type: "use", zone: BZ.tower.name, objects: [BEACON], chest: false, text: "Douse the green signal fire", banner: ["New quest", "Green Fire on the Tower"],
        obj: "Douse the green signal fire", nag: "The fire is at the foot of the old tower. Press E to douse it." },
      { type: "ritual", zone: BZ.tower.name, kinds: SKELETONS, text: "Beat a pack of skeletons and watch what they do",
        banner: ["The fire is out!", "Beat a skeleton pack, and watch"], obj: "Beat a pack of 3+ skeletons and watch what they do",
        nag: "Fight a pack of them. Hurt them badly, and see what they do when they are losing." },
      { type: "kill", zone: BZ.tower.name, kinds: ["demon"], goal: 1,
        summon: { parts: ["demon"], level: 14, title: "Bone Demon", ...spotIn(BZ.tower.name, 0.5, 0.75) },
        text: "Slay a Bone Demon", banner: ["They gave their bones to a demon!", "Slay the Bone Demon"], obj: "Bone Demon slain: {n} / {goal}",
        nag: "A demon made of their own bones. Stay out of its stomp, and bring it down." },
      back("captain", "Captain Hale", "east gate", [
        "A demon, built from the bones of the fallen. Gods.",
        "And this was nailed to the beacon: marching orders, signed with the same sigil as the stones. Vaeloth, Marshal of Greywatch.",
        "Vaeloth died three hundred years ago. Take this. Then ask Elder Rowan who he was. I don't like the answer I'm thinking of.",
      ], "Claim reward"),
    ],
    reward: { xp: 1000, gold: 250, potions: 3 },
    after: "Ask Elder Rowan about Vaeloth. The old man knows every tale in this valley.",
  },
  {
    id: "barrows", title: "What the Barrows Hold", giver: "druid", zone: BZ.barrow.name, minLevel: 12,
    description: `Elder Rowan told you of Vaeloth, the Pale Marshal, who traded his death for a necromancer's power. His necromancers raise soldiers in ${BZ.barrow.name}. Rowan needs grave dust for a ward, and one of the necromancers dead.`,
    offer: [
      "Vaeloth. I hoped never to hear that name outside a tale.",
      "He was the last Marshal of Greywatch Keep. When the keep fell, he would not lie down. He bound his soul in a phylactery and learned the dark art, so his watch would never end.",
      "Now he wants more than a keep. He wants the world, and every grave is a soldier to him.",
      `His necromancers raise the old kings' warriors in ${BZ.barrow.name}, ${zdir(BZ.barrow)} of here. Bring me 5 handfuls of grave dust for a ward, and kill one of his raisers.`,
    ],
    acceptText: "I'll go to the barrows",
    steps: [
      { type: "collect", zone: BZ.barrow.name, kinds: SKELETONS, item: "dust", goal: 5, chance: { skeleton: 0.35, crawler: 0.6, skeletonmage: 0.45 },
        text: "Collect 5 Grave Dust from the undead", banner: ["New quest", "What the Barrows Hold"], obj: "Grave Dust: {n} / {goal}",
        nag: "{n} of {goal}. The crawlers shed the most dust." },
      { type: "kill", zone: BZ.barrow.name, kinds: ["necromancer"], goal: 1,
        summon: { parts: ["necromancer"], level: 16, title: "Raiser of the Barrows", ...spotIn(BZ.barrow.name, 0.49, 0.6) },
        text: "Slay the necromancer raising the barrow kings", banner: ["Dust gathered!", "Slay the Raiser of the Barrows"], obj: "Necromancer slain: {n} / {goal}",
        nag: "He stands before the old mausoleum. Kill him and his raised dead crumble with him." },
      back("druid", "Elder Rowan", "village bonfire", [
        "With this dust I can make a ward that holds a crypt shut. One handful per crypt.",
        "The raiser carried a map. Look: Gravemoor Cemetery, deep in the south-eastern woods. The great graveyard of the old valley. A thousand graves.",
        "That is where he raises his army. Take the ward to Captain Hale, he is mustering the watch.",
      ], "Claim reward"),
    ],
    reward: { xp: 1300, gold: 300, potions: 3 },
    after: "Captain Hale has the ward now. Gravemoor Cemetery lies deep in the south-eastern woods.",
  },
  {
    id: "gravemoor", title: "The Recruiting Ground", giver: "captain", zone: BZ.grave.name, minLevel: 15,
    description: `Gravemoor Cemetery is where the Pale Marshal raises his recruits. Captain Hale sends you with Rowan's ward to thin the ranks, seal its four crypts and destroy what guards them.`,
    offer: [
      "Rowan's ward. Four handfuls, four crypts. It will have to do.",
      `${BZ.grave.name} lies ${zdir(BZ.grave)} of here, past the Smugglers' Path. Every grave there is a recruit waiting for its orders.`,
      "Thin their ranks, seal the crypts so no more rise, and kill whatever he has set to guard them. I'll hold the gate.",
    ],
    acceptText: "For Oakvale",
    steps: [
      { type: "kill", zone: BZ.grave.name, kinds: UNDEAD_KINDS, goal: 20, text: "Thin the ranks: slay 20 undead", banner: ["New quest", "The Recruiting Ground"],
        obj: "Undead slain: {n} / {goal}", nag: "{n} of {goal}. They rise in ranks there, so fight with your back to a wall." },
      { type: "use", zone: BZ.grave.name, objects: CRYPTS, text: "Seal the 4 crypts with Rowan's ward", banner: ["The ranks are broken!", "Seal the 4 crypts"],
        obj: "Crypts sealed: {n} / {goal}", nag: "{n} of {goal} crypts sealed. One in each corner of the cemetery." },
      { type: "kill", zone: BZ.grave.name, kinds: ["demon"], goal: 1,
        summon: { parts: ["demon"], level: 19, title: "Gravemoor Horror", hpMult: 1.6, ...spotIn(BZ.grave.name, 0.51, 0.53) },
        text: "Destroy the Gravemoor Horror", banner: ["THE GROUND SHAKES", "The Gravemoor Horror rises"], obj: "Gravemoor Horror slain: {n} / {goal}",
        nag: "It rose before the mausoleum. Every bone the crypts held, in one body. Destroy it!" },
      back("captain", "Captain Hale", "east gate", [
        "Sealed. All four. No more recruits for the Marshal.",
        "But my scouts say the dead are falling back east, all of them. To Greywatch Keep.",
        "He's pulling his army home to his throne. That's where we finish this. Rest first, you've earned it.",
      ], "Claim reward"),
    ],
    reward: { xp: 1700, gold: 400, potions: 4 },
    after: "The dead are gathering at Greywatch Keep. Come to me when you're ready for the last fight.",
  },
  {
    id: "marshal", title: "The Pale Marshal", giver: "captain", zone: BZ.keep.name, minLevel: 18,
    description: `Vaeloth, the Pale Marshal, waits in ${BZ.keep.name} with what is left of his army. Kill his lieutenants, shatter the phylactery that holds his soul, and end him.`,
    offer: [
      `It's time. Vaeloth sits in the great hall of ${BZ.keep.name}, ${zdir(BZ.keep)} of here, with his best around him.`,
      "Rowan says as long as his phylactery stands, he can't truly die. Two of his necromancers guard it.",
      "Kill them. Shatter the phylactery. And when he comes for you, and he will, put the Pale Marshal in the ground for good.",
    ],
    acceptText: "I will end his watch",
    steps: [
      { type: "kill", zone: BZ.keep.name, kinds: ["necromancer"], goal: 2, text: "Slay 2 of the Marshal's necromancers", banner: ["New quest", "The Pale Marshal"],
        obj: "Necromancers slain: {n} / {goal}", nag: "{n} of {goal}. Kill them fast, before they raise more dead around you." },
      { type: "use", zone: BZ.keep.name, objects: [PHYLACTERY], text: "Shatter the Marshal's phylactery", banner: ["His guard has fallen!", "Shatter the phylactery"],
        obj: "Shatter the phylactery", nag: "It stands before the great hall. Break it!" },
      { type: "kill", zone: BZ.keep.name, kinds: ["necromancer"], goal: 1,
        summon: { parts: ["necromancer"], level: 24, title: "Vaeloth, the Pale Marshal", hpMult: 2.5, ...spotIn(BZ.keep.name, 0.5, 0.65) },
        text: "Defeat Vaeloth, the Pale Marshal", banner: ["THE PALE MARSHAL RISES", "Defeat Vaeloth"], obj: "The Pale Marshal defeated: {n} / {goal}",
        nag: "He's out of his hall and he's angry. Finish him!" },
      back("captain", "Captain Hale", "east gate", [
        "My sentries say every skeleton on the roads just... fell. Collapsed where it stood, like puppets with the strings cut.",
        "Vaeloth's watch is over. Three hundred years, and you ended it.",
        "Oakvale won't forget this. Neither will I.",
      ], "Claim reward"),
    ],
    reward: { xp: 2600, gold: 700, potions: 5 },
    after: "Some bones still rattle out there, without a master. But no army will march on Oakvale again. Well done, friend.",
  },
];

// ---- The Redfang chain: Old Garrick of Saltmere ----

const SALT = AREAS.find((a) => a.name === "Saltmere")!;
const RED_AREA = "Redfang Hollow";
const COVE = "Gullrock Cove";

/**
 * The story: the Redfang bandits come down the Smugglers' Path from their hollow in the eastern woods and bleed
 * Saltmere dry: the winter stores of salted cod, the boats, and now young Pell, Old Garrick's grandson, who went
 * up the path to get his boat back and never came down. Captain Hale hears of it from a gull-runner and sends the
 * hero to Saltmere (a town, no monsters); Old Garrick, the eldest fisherman, sends them first to Gullrock Cove down
 * the coast, where a raiding party is pillaging the fishers' smokehouse, then up the path to Redfang Hollow.
 * Starts at level 16 (beside the end of the Pale Marshal story): Hale → Saltmere → Gullrock Cove (Lv 17-19) → Redfang Hollow (Lv 18-20)
 * → the Redfang Chief.
 */
export const RED_QUESTS: QuestDef[] = [
  {
    id: "saltmere", title: "Word from Saltmere", giver: "captain", zone: SALT.name, minLevel: 16,
    description: `A gull-runner came up the Coast Road: the fisherfolk of ${SALT.name}, ${dirFromVillage(SALT.x + SALT.w / 2, SALT.y + SALT.h / 2)} of Oakvale by the sea, are being robbed blind. Captain Hale asked you to go and hear Old Garrick out.`,
    offer: [
      "A gull-runner came up the Coast Road this morning, half dead on his feet. From Saltmere.",
      `Saltmere is a fishing town down by the sea, ${dirFromVillage(SALT.x + SALT.w / 2, SALT.y + SALT.h / 2)} of here. Honest folk. No soldiers, no walls. Someone has been bleeding them dry.`,
      "Their eldest, Old Garrick, begs for help. I can't spare the watch, not with the dead on the roads. Will you go and hear him out?",
    ],
    acceptText: "I'll go to Saltmere",
    steps: [
      { type: "reach", at: { x: (SALT.x + SALT.w / 2) * TILE, y: (SALT.y + 10) * TILE, r: 8 * TILE, label: SALT.name }, zone: SALT.name,
        text: `Travel to ${SALT.name}`, banner: ["New quest", "Word from Saltmere"], obj: `Travel to ${SALT.name}, down the Coast Road by the sea`,
        nag: "Follow the Coast Road past Sunken Lake, down to the sea. You can't miss the smell of fish." },
      { type: "talk", npc: "oldfisher", text: "Find Old Garrick", banner: [`You reached ${SALT.name}`, "Find Old Garrick by the beach fire"],
        obj: "Find Old Garrick (by the fire on the beach)",
        say: [
          "Hale sent you? Then the watch hasn't forgotten us. Sit, sit. The fire's warm, even if the news isn't.",
          "Eighty winters I've fished this coast. Storms, sea-wolves, a whale that ate my best net. Never anything like the Redfang.",
          "Here, a little for your trouble on the road. Now listen, and I'll tell you what they've done.",
        ],
        accept: "Claim reward", nag: "" },
    ],
    reward: { xp: 900, gold: 120, potions: 2 },
    after: "Old Garrick will be by the fire on the beach. Saltmere has nobody else to ask.",
  },
  {
    id: "cod", title: "Salt and Steel", giver: "oldfisher", zone: COVE, minLevel: 17,
    description: `A Redfang raiding party burned the fishers' smokehouse at ${COVE}, along the coast east of Saltmere, and is carrying off the town's winter stores. Old Garrick asked you to drive them off and bring back the salted cod.`,
    offer: [
      "Three nights ago they came down the Smugglers' Path. Red rags on their arms, axes on their backs. The Redfang.",
      `They didn't go home. They burned our smokehouse at ${COVE}, a little way east along the shore, and they've camped in the ashes, eating our winter stores.`,
      "Every barrel of salted cod we put by is in that cove. Without it, half this town won't see spring.",
      "Drive them off and bring back what you can. Their leader is a big brute with a red-dyed beard. Rask, they call him.",
    ],
    acceptText: "I'll drive them off",
    steps: [
      { type: "kill", zone: COVE, kinds: ["bandit"], goal: 6, text: `Drive off the raiders: slay 6 Redfang bandits`, banner: ["New quest", "Salt and Steel"],
        obj: "Redfang raiders slain: {n} / {goal}", nag: `{n} of {goal}. They are camped in the burned smokehouse at ${COVE}, east along the shore.` },
      { type: "collect", zone: COVE, kinds: ["bandit"], item: "cod", goal: 5, chance: { bandit: 0.5 },
        text: "Take back 5 Salted Cod from the raiders", banner: ["The raiders bleed!", "Take back the stolen cod"], obj: "Salted Cod: {n} / {goal}",
        nag: "{n} of {goal}. They stuff it in their packs, the thieving gulls." },
      { type: "kill", zone: COVE, kinds: ["bandit"], goal: 1,
        summon: { parts: ["bandit"], level: 21, title: "Rask the Reaver", hpMult: 3.5, x: (GULLROCK.x + 15) * TILE, y: (GULLROCK.y + 7.7) * TILE }, own: true,
        text: "Slay Rask, the raid leader", banner: ["Rask comes for you!", "Slay Rask the Reaver"], obj: "Rask the Reaver slain: {n} / {goal}",
        nag: "Rask won't leave his share of the cod. He's by the raiders' fire." },
      { type: "talk", npc: "oldfisher", text: "Bring the cod to Old Garrick", banner: ["The raiders are beaten", "Bring the cod to Old Garrick"],
        obj: "Bring the cod to Old Garrick (Saltmere beach)",
        say: [
          "Our cod! That's Saltmere salt on it, I'd know it anywhere. And Rask dead in the ashes? Bless you.",
          "There's something else, and I've not had the heart to say it. My grandson Pell went up the Smugglers' Path to take his boat back from their camp, Redfang Hollow. Alone. Three weeks ago.",
          "He never came down. Here, take this. And when you're ready, come back to me. Please.",
        ],
        accept: "Claim reward" },
    ],
    reward: { xp: 1500, gold: 300, potions: 3 },
    after: "Pell... come back to me when you're ready. I can't ask anyone else.",
  },
  {
    id: "chief", title: "The Redfang Chief", giver: "oldfisher", zone: RED_AREA, minLevel: 19,
    description: `Old Garrick's grandson Pell went up to ${RED_AREA} to take back his boat and never came down. Find him, and put an end to the Redfang Chief who holds the camp together.`,
    offer: [
      "A smuggler passed through last night. He says the Redfang keep a boy chained by their chief's tent. A boy with a fisherman's hands.",
      "It's Pell. It has to be.",
      "The chief is a brute of a man, they say, with an axe as long as an oar. While he lives, the camp holds together. Kill him, and the rest will scatter like gulls.",
      "Bring my boy home.",
    ],
    acceptText: "I'll bring Pell home",
    steps: [
      { type: "reach", at: { x: (REDFANG.x + REDFANG.w / 2) * TILE, y: (REDFANG.y + REDFANG.h / 2) * TILE, r: 7 * TILE, label: "Redfang camp" }, zone: RED_AREA,
        text: `Find Pell inside ${RED_AREA}`, banner: ["New quest", "The Redfang Chief"], obj: `Find Pell inside the camp at ${RED_AREA}`,
        nag: "They keep him in the middle of the camp, by the chief's tent. Get inside the fence." },
      { type: "kill", zone: RED_AREA, kinds: ["banditchief"], goal: 1, text: "Defeat the Redfang Chief",
        banner: ["Pell is chained by the chief's tent!", "Defeat the Redfang Chief"], obj: "Redfang Chief defeated: {n} / {goal}",
        nag: "The chief guards his tent. Watch for his leap, and don't let his war cry rally the camp around you." },
      { type: "talk", npc: "oldfisher", text: "Bring the news to Old Garrick", banner: ["The Redfang Chief has fallen!", "Pell is free. Go back to Saltmere"],
        obj: "Go back to Old Garrick (Saltmere beach)",
        say: [
          "Pell! He came running down the path at dawn, thin as a rake and grinning like a fool. He's home. He's home.",
          "And no red rags on the Smugglers' Path since. They say the Redfang are fighting each other over what the chief left behind.",
          "I've nothing worth what you've done. Take what Saltmere has, and know there's always a warm fire for you on this beach.",
        ],
        accept: "Claim reward" },
    ],
    reward: { xp: 2400, gold: 600, potions: 5 },
    after: "Pell's mending his boat again. Saltmere sleeps easy now. Sit by the fire whenever you pass, friend.",
  },
];

// ---- The Hollow Crown: the first zone's last story, once the other three are over ----

const THRONE = "The Hollow Throne";
const CROWN_DIR = dirFromVillage(HOLLOW.cx, HOLLOW.cy);
/** The three ward-stones round the Hollow Throne (shared/map.ts HOLLOW_WARDS). */
export const WARDS: QuestObject[] = HOLLOW_WARDS.map(([tx, ty], i) => objAt(`ward${i + 1}`, "ward", "Crown ward-stone", "Break", tx, ty));

/**
 * The story: a thousand years before Oakvale, Ostrevar was the first king of this valley. He would not give up his
 * crown to death, so the first druids sealed him alive in his barrow under the Hollow Throne, far in the north-east
 * woods, and ringed it with three ward-stones. In the long dark he learned to turn their wards into his strength,
 * and to reach out: his crowned seal is on the cask that brought the Gloam ashore in the Grey Heron, on the
 * phylactery that taught Vaeloth to cheat death, and on the grave-gold that paid the Redfang to bleed Saltmere. All
 * three were to weaken the valley until he could rise. With his servants broken, he must rise himself.
 * Opens once the Gloam, the Pale Marshal and the Redfang Debt are all done (chainOpen). Lv 24 talk quest, then the
 * Lv 30 final boss of the first zone (Murat 2026-11-04: a final boss, not an endgame: it is beaten once, like the others).
 */
export const CROWN_QUESTS: QuestDef[] = [
  {
    id: "seal", title: "The Crowned Seal", giver: "druid", zone: "Oakvale", minLevel: 24,
    description: "Elder Rowan found the same crowned seal on the Gloam's cask, the Marshal's phylactery and the Redfang's gold. One hand moved all three. Ask Captain Hale and Old Garrick what they know.",
    offer: [
      "Sit, friend. The Gloam is scattered, the Pale Marshal is dust, the Redfang have fled. Oakvale should sleep easy. I don't.",
      "One thing has gnawed at me. The cask the Gloam came ashore in bore a seal: a crown, burned into the wood.",
      "Hale's men found the same crown carved inside the Marshal's phylactery. And Old Garrick swears the Redfang paid their debts in old gold, stamped with a crown.",
      "Three shadows, one hand. Ask Hale and Garrick what they know. I fear I already know the name.",
    ],
    acceptText: "I'll find out who",
    steps: [
      { type: "talk", npc: "captain", text: "Ask Captain Hale about the crowned seal", banner: ["New quest", "The Crowned Seal"],
        obj: "Ask Captain Hale about the seal (east gate)",
        say: [
          "The crown? Aye, my sentries found it carved inside that cursed phylactery. I had a scholar look at it.",
          "It's the crown of Ostrevar, the first king of this valley, from before Oakvale had a single roof. Old songs say he was buried far in the north-east woods, on a hill they called the Hollow Throne.",
          "There's worse. Vaeloth's last orders were scratched on the wall of his hall. Three words: WAKE THE KING.",
        ],
        accept: "Garrick next", nag: "" },
      { type: "talk", npc: "oldfisher", text: "Ask Old Garrick about the Redfang's gold", banner: ["The seal has a name", "Ask Old Garrick about the gold"],
        obj: "Ask Old Garrick about the gold (Saltmere beach)",
        say: [
          "The crowned gold? Pell saw where it came from, poor lad. He heard everything, chained by that tent.",
          "A tall figure in old rusted iron came to the chief by night, never once showing a face. It paid in grave-gold and wanted only one thing: blood and fear in the valley, as much as he could make.",
          "It came down from the north-east, Pell said, by an old road past the forest shrine. The King's Way, it called it.",
        ],
        accept: "Back to Rowan", nag: "" },
      back("druid", "Elder Rowan", "village bonfire", [
        "Ostrevar. The Hollow King. So the old tale is true.",
        "When he would not give up his crown to death, the first druids sealed him alive in his barrow and set three ward-stones round it. A thousand years he has lain there, reaching out through the Gloam, the dead and greedy men, to bleed the valley dry until he could rise.",
        "You broke his servants. Now he must come out himself. Rest, and grow strong. When you are ready, I will tell you how to face him.",
      ], "Claim reward"),
    ],
    reward: { xp: 2200, gold: 400, potions: 4 },
    after: "Rest and grow strong, friend. When you are ready, the Hollow King is waiting.",
  },
  {
    id: "king", title: "The Hollow King", giver: "druid", zone: THRONE, minLevel: 25,
    description: `Ostrevar, the Hollow King, is rising from his barrow under ${THRONE}, far ${CROWN_DIR} of Oakvale up the King's Way from the forest shrine. Break the three ward-stones that feed him and end him.`,
    offer: [
      `Follow the King's Way from the forest shrine on the Bandit Trail, ${CROWN_DIR} to ${THRONE}. Three ward-stones stand round his dais.`,
      "The wards were made to hold him, but he has turned them into his strength. Break all three and he will come out weaker. But he will come.",
      "He fights with a crown-forged blade, the Gloam's ooze and his dead servants. Watch the ground: when it darkens, move. When the ash rises round him, get in close.",
      "This is the last fight of this valley. Go, and come back to us.",
    ],
    acceptText: "I will end his reign",
    steps: [
      { type: "reach", at: { x: (HOLLOW.cx + 0.5) * TILE, y: (HOLLOW.cy + 0.5) * TILE, r: 9 * TILE, label: THRONE }, zone: THRONE,
        text: `Find ${THRONE}`, banner: ["New quest", "The Hollow King"], obj: `Follow the King's Way ${CROWN_DIR} to ${THRONE}`,
        nag: "The King's Way starts at the forest shrine on the Bandit Trail. Follow it into the deep woods." },
      { type: "use", zone: THRONE, objects: WARDS, chest: false, text: "Break the three crown ward-stones", banner: [THRONE, "Break the three ward-stones"],
        obj: "Ward-stones broken: {n} / {goal}", nag: "{n} of {goal}. They stand round his dais. Break them all." },
      { type: "kill", zone: THRONE, kinds: ["hollowking"], goal: 1,
        summon: { parts: ["hollowking"], level: 30, title: "Ostrevar, the Hollow King", hpMult: 2, x: (HOLLOW.cx + 0.5) * TILE, y: (HOLLOW.cy - 3.3) * TILE },
        text: "Defeat Ostrevar, the Hollow King", banner: ["THE HOLLOW KING RISES", "Defeat Ostrevar"], obj: "The Hollow King defeated: {n} / {goal}",
        nag: "He is on his throne and he is awake. End him!" },
      back("druid", "Elder Rowan", "village bonfire", [
        "I felt it. The whole wood breathed out at once, like a sleeper waking from a long, bad dream.",
        "The Hollow King is gone, and his crown with him. No more seals, no more grave-gold, no more whispers in the dark.",
        "You came to Oakvale a stranger and you saved this whole valley. Whatever lies beyond it, the road is yours now. Take this, with all our thanks.",
      ], "Claim reward"),
    ],
    reward: { xp: 6000, gold: 1500, potions: 6 },
    after: "The valley is free, thanks to you. Whatever lies beyond it, there is always a seat for you at this fire.",
  },
];

// ---- First Steps: the guided first quest, one control per step (replaces the old wall-of-text intro) ----

const ROWAN = npcById("druid")!;
/**
 * Every new hero starts this quest on their first login (no offer to accept). Each step teaches one thing:
 * walking, talking, fighting, gear, the skill tree and the hotbar. The other chains' first offers wait until it
 * is done (chainOpen). Heroes saved before it existed count it as done.
 */
export const TUT_QUESTS: QuestDef[] = [
  {
    id: "firststeps", title: "First Steps", giver: "druid", zone: FZ, minLevel: 1,
    description: `Elder Rowan, the old druid by the village bonfire, is showing you how to look after yourself outside Oakvale's walls.`,
    offer: ["Welcome to Oakvale, traveller. Let an old druid show you how to survive out there."],
    acceptText: "Show me",
    steps: [
      { type: "reach", at: { x: ROWAN.x, y: ROWAN.y, r: 2.5 * TILE, label: "Elder Rowan" }, text: "Walk to Elder Rowan at the bonfire",
        banner: ["New quest", "First Steps"], obj: "Walk to Elder Rowan at the bonfire",
        hint: "Left-click the ground to walk there. Hold the button to keep walking. WASD works too." },
      { type: "talk", npc: "druid", text: "Talk to Elder Rowan", banner: ["Well walked!", "Now talk to Elder Rowan"], obj: "Talk to Elder Rowan",
        hint: "Left-click Rowan to talk to him, or press E when you stand next to him.",
        say: [
          "Ah, a new face by the fire. Welcome to Oakvale, traveller.",
          `Blobs have been creeping out of ${FZN}, ${FZD} of the village. Slimy things, but weak. A good first fight.`,
          "Go out of the gate and squash three of them. Then come and find me, I have a few more things to show you.",
        ],
        accept: "I'll squash 3 blobs" },
      { type: "kill", kinds: BLOB_KINDS, zone: FZ, goal: 3, gift: "w_bronze", text: "Kill 3 blobs", banner: ["Quest updated", "Kill 3 blobs"],
        obj: "Kill blobs: {n} / {goal}",
        hint: `Leave the village ${FZD}. Left-click a blob to attack it, keep clicking to chain a combo. Q drinks a potion.`,
        nag: `{n} of {goal}. ${FZ} lies ${FZD} of the village.` },
      { type: "equip", levelTo: 2, text: "Wear the weapon the blob dropped", banner: ["A blob dropped a weapon!", "Wear it"],
        obj: "Wear your new weapon", hint: "It went into your bag. Press G, then click the weapon to wear it.",
        nag: "Press G and click that weapon to wear it." },
      { type: "learn", text: "Learn a skill", banner: ["Level up!", "Learn your first skill"], obj: "Learn an active skill",
        hint: "Each level gives a skill point. Press T and click a skill at the top of the tree to learn it.",
        nag: "Press T and learn a skill with your point." },
      { type: "cast", text: "Use your skill", banner: ["Skill learned!", "Now use it on a blob"], obj: "Use your new skill outside the village",
        hint: "It sits on hotbar key 1. Press 1, then right-click to use it. No magic inside Oakvale: the villagers hate it!",
        nag: "Press 1, then right-click. But not inside the village!" },
      back("druid", "Elder Rowan", "village bonfire", [
        "Look at you! Walking, fighting, a real weapon and a skill of your own.",
        "Each level brings more: stat points in the hero panel (C) and skill points in the tree (T). Your quest log is on J, the map on M.",
        "Take these potions. And sit a moment, friend. There is something else stirring out there.",
      ], "Claim reward"),
    ],
    reward: { xp: 60, gold: 25, potions: 3 },
    after: "The trees have been whispering to me. Sit by the fire, friend.",
  },
];
export const TUT_CHAIN = 3;
/** Is the guided first quest done (or from before it existed)? */
export const tutorialDone = (p: Quester | undefined) => (p?.tutId ?? TUT_QUESTS.length) >= TUT_QUESTS.length;
/** Can this chain offer new quests yet? Every story waits for the guided first quest. */
export const chainOpen = (p: Quester | undefined, c: number) =>
  c === TUT_CHAIN || (tutorialDone(p) && (c !== CROWN_CHAIN || STORY_CHAINS.every((s) => chainDone(p, s))));
/** The Hollow Crown waits for the three stories it ties together. */
export const CROWN_CHAIN = 4;
const STORY_CHAINS = [0, 1, 2];
/** Every quest of this chain done. */
export const chainDone = (p: Quester | undefined, c: number) => (chainState(p, c)?.questId ?? 0) >= CHAINS[c].quests.length;

// ---- Chains: the blob story and the skeleton story run side by side, each with its own progress ----

export interface QuestChain {
  id: string;
  name: string;
  quests: QuestDef[];
  /** Player fields holding this chain's quest index, stage and step progress */
  keys: [string, string, string];
  /** Bump when this chain's steps change (saved as `verKey`): older saves restart their current quest at the offer */
  version: number; verKey: string;
  /**
   * One synced Player field holding all three numbers (id * 10000 + stage * 100 + count), for chains added after the
   * Player schema ran out of fields (Colyseus allows 64). `keys` are then only the save file's names.
   */
  packed?: string;
}
/** Pack / unpack a chain's progress into one number (QuestChain.packed). */
export const packQuest = (id: number, stage: number, count: number) => id * 10000 + Math.min(99, stage) * 100 + Math.min(99, count);
export const unpackQuest = (n: number) => ({ questId: Math.floor(n / 10000), questStage: Math.floor(n / 100) % 100, questCount: n % 100 });
export const CHAINS: QuestChain[] = [
  { id: "gloam", name: "The Gloam", quests: QUESTS, keys: ["questId", "questStage", "questCount"], version: QUEST_VERSION, verKey: "questVer" },
  { id: "bones", name: "The Pale Marshal", quests: BONE_QUESTS, keys: ["boneId", "boneStage", "boneCount"], version: 1, verKey: "boneVer" },
  { id: "redfang", name: "The Redfang Debt", quests: RED_QUESTS, keys: ["redId", "redStage", "redCount"], version: 2, verKey: "redVer" },
  { id: "tutorial", name: "First Steps", quests: TUT_QUESTS, keys: ["tutId", "tutStage", "tutCount"], version: 1, verKey: "tutVer" },
  { id: "crown", name: "The Hollow Crown", quests: CROWN_QUESTS, keys: ["crownId", "crownStage", "crownCount"], version: 1, verKey: "crownVer", packed: "crown" },
];

/** Progress on one chain (chain undefined = the blob chain, so a Player passed as is reads as chain 0). */
export interface QuestState { questId: number; questStage: number; questCount: number; level?: number; chain?: number }
/** A player's progress on every chain: the Player schema fields (CHAINS[].keys). */
export type Quester = { level?: number; questId?: number; questStage?: number; questCount?: number; boneId?: number; boneStage?: number; boneCount?: number; redId?: number; redStage?: number; redCount?: number; tutId?: number; tutStage?: number; tutCount?: number; crown?: number };

/** One chain's progress, read from the player's fields. */
export function chainState(p: Quester | undefined, c: number): QuestState | undefined {
  if (!p) return undefined;
  const [a, b, n] = CHAINS[c].keys, r = p as Record<string, number | undefined>, pk = CHAINS[c].packed;
  if (pk) return { chain: c, ...unpackQuest(r[pk] ?? 0), level: p.level };
  return { chain: c, questId: r[a] ?? 0, questStage: r[b] ?? 0, questCount: r[n] ?? 0, level: p.level };
}
const chainOf = (q: QuestState | undefined) => CHAINS[q?.chain ?? 0];

export const questDef = (q: QuestState | undefined) => chainOf(q).quests[q?.questId ?? 0];
/** Active step, or undefined before accepting / after the chain. */
export function questStep(q: QuestState | undefined): QuestStep | undefined {
  const d = questDef(q);
  return d && q && q.questStage >= 1 ? d.steps[q.questStage - 1] : undefined;
}

export const popcount = (n: number) => { let c = 0; for (let v = n >>> 0; v; v &= v - 1) c++; return c; };
export function stepGoal(s: QuestStep): number {
  return s.type === "use" ? s.objects!.length : s.goal ?? 1;
}
/** Progress on a step (objects used count bits). */
export function stepProgress(s: QuestStep, count: number): number {
  return Math.min(stepGoal(s), s.type === "use" ? popcount(count) : count);
}
const fill = (t: string, n: number, goal: number) => t.replace("{n}", String(n)).replace("{goal}", String(goal));

/** Objective line for the quest tracker. */
export function questObjective(q: QuestState | undefined): string {
  const s = questStep(q);
  return s ? fill(s.obj, stepProgress(s, q!.questCount), stepGoal(s)) : "";
}

export interface DialogPage {
  text: string[];
  /** Button that moves the quest on (sends "quest" {chain} to the server); none = just talk */
  accept?: string;
  bye: string;
  /** Which chain the page belongs to */
  chain: number;
}

/** Is this NPC standing in the village for this player? (Tobin only comes home once freed.) */
export function npcPresent(id: string, p: Quester | undefined): boolean {
  if (id !== "fisher") return true;
  const q = chainState(p, 0);
  const lake = QUESTS.findIndex((d) => d.id === "lake");
  const qid = q?.questId ?? 0;
  return qid > lake || (qid === lake && (q?.questStage ?? 0) >= QUESTS[lake].steps.length);
}
/** Is the blob cocoon (with Tobin inside) still there for this player? */
export function cocoonPresent(p: Quester | undefined): boolean {
  const q = chainState(p, 0);
  const lake = QUESTS.findIndex((d) => d.id === "lake");
  return (q?.questId ?? 0) < lake || ((q?.questId ?? 0) === lake && (q?.questStage ?? 0) < QUESTS[lake].steps.length);
}

/** One chain's "!" (new quest) / "?" (come and talk) for an NPC. */
function chainMark(id: string, q: QuestState | undefined): "!" | "?" | "" {
  const d = questDef(q);
  if (!d) return "";
  const stage = q?.questStage ?? 0;
  if (stage === 0) return d.giver === id && (q?.level ?? 1) >= d.minLevel ? "!" : "";
  const s = questStep(q);
  return s?.type === "talk" && s.npc === id ? "?" : "";
}
/** Does this NPC have something to say about any quest right now? "?" wins over "!". */
export function npcQuestMark(id: string, p: Quester | undefined): "!" | "?" | "" {
  const marks = CHAINS.map((_, c) => {
    const q = chainState(p, c) ?? { chain: c, questId: 0, questStage: 0, questCount: 0 };
    return q.questStage === 0 && !chainOpen(p, c) ? "" : chainMark(id, q);
  });
  return marks.includes("?") ? "?" : marks.includes("!") ? "!" : "";
}

/** Rewards line for buttons and the log. */
export const rewardText = (r: Reward) => `${r.xp} XP, ${r.gold} gold, ${r.potions} potions`;

/** Idle lines of quest givers with nothing to say on a chain. */
const IDLE: Record<string, string> = {
  druid: "The old oaks are restless. Keep your blade sharp, friend.",
  captain: "Quiet on the walls today. I don't trust quiet.",
  oldfisher: "Tide's turning. Mind the wet sand, it'll have your boots off.",
};

/** What an NPC says about one chain, or undefined if nothing. */
function chainDialog(id: string, q: QuestState): DialogPage | undefined {
  const c = q.chain ?? 0, quests = CHAINS[c].quests;
  const qid = q.questId, stage = q.questStage, count = q.questCount;
  const d = quests[qid];
  const last = quests[quests.length - 1];
  if (!d) return last.giver === id ? { text: [last.after], bye: "Farewell", chain: c } : undefined;
  if (stage === 0) {
    if (d.giver === id) {
      if ((q.level ?? 1) < d.minLevel) return { text: [`There is more to do, but it is dangerous out there. Come back when you are level ${d.minLevel}.`], bye: "I'll train", chain: c };
      return { text: d.offer, accept: d.acceptText, bye: "Not now", chain: c };
    }
    // The previous giver points you to the next one
    const prev = quests[qid - 1];
    if (prev && prev.giver === id) return { text: [prev.after], bye: "Thanks", chain: c };
    return undefined;
  }
  const s = d.steps[stage - 1];
  if (!s) return undefined;
  if (s.type === "talk" && s.npc === id) {
    const end = stage === d.steps.length;
    return { text: s.say!, accept: end ? `${s.accept} (${rewardText(d.reward)})` : s.accept, bye: "Later", chain: c };
  }
  if (d.giver === id && s.nag) return { text: [fill(s.nag, stepProgress(s, count), stepGoal(s))], bye: "On my way", chain: c };
  return undefined;
}

/**
 * What an NPC says about the quests, or undefined if they have nothing to say (traders then just trade).
 * With both chains wanting a word, a page that moves a quest on (a talk step, an offer) comes first.
 */
export function questDialog(id: string, p: Quester | undefined): DialogPage | undefined {
  // The guided first quest talks first; the stories wait for it (chainOpen)
  const order = [TUT_CHAIN, ...CHAINS.map((_, c) => c).filter((c) => c !== TUT_CHAIN)];
  const pages = order.map((c) => {
    const q = chainState(p, c) ?? { chain: c, questId: 0, questStage: 0, questCount: 0, level: 1 };
    if (q.questStage === 0 && !chainOpen(p, c)) return undefined;
    // The finished first quest only chats when nothing else has a word
    if (c === TUT_CHAIN && q.questId >= TUT_QUESTS.length) return undefined;
    return chainDialog(id, q);
  }).filter((x): x is DialogPage => !!x);
  const best = pages.find((x) => x.accept) ?? pages[0];
  if (best) return best;
  return IDLE[id] ? { text: [IDLE[id]], bye: "Farewell", chain: 0 } : undefined;
}

export interface QuestTarget {
  x: number; y: number; // px
  kind: "npc" | "area" | "object";
  r?: number; // area radius in px
  label: string;
}

/** Where one chain's current step points to, for the map, minimap and tracker (several for "use" steps). */
export function questTargets(q: QuestState | undefined): QuestTarget[] {
  const d = questDef(q), stage = q?.questStage ?? 0;
  if (!d) return [];
  if (stage === 0) {
    const g = npcById(d.giver);
    return g && (q?.level ?? 1) >= d.minLevel ? [{ x: g.x, y: g.y, kind: "npc", label: g.name }] : [];
  }
  const s = d.steps[stage - 1];
  if (!s) return [];
  if (s.type === "talk") {
    const n = npcById(s.npc!);
    return n ? [{ x: n.x, y: n.y, kind: "npc", label: n.name }] : [];
  }
  if (s.type === "equip" || s.type === "learn") return []; // done in a menu, anywhere
  if (s.type === "reach") return [{ x: s.at!.x, y: s.at!.y, kind: "area", r: s.at!.r, label: s.at!.label }];
  if (s.type === "use") {
    return s.objects!.filter((o, i) => !(q!.questCount & (1 << i))).map((o) => ({ x: o.x, y: o.y, kind: "object" as const, label: o.name }));
  }
  const z = zoneByName(s.zone ?? d.zone);
  return [{ x: (z.x + z.w / 2) * TILE, y: (z.y + z.h / 2) * TILE, kind: "area", r: (Math.min(z.w, z.h) / 2) * TILE, label: z.name }];
}

/** Quest objects this player can use right now on any chain, with their index (bit) in the step. */
export function usableObjects(p: Quester | undefined): { o: QuestObject; i: number; chain: number }[] {
  return CHAINS.flatMap((_, c) => {
    const q = chainState(p, c), s = questStep(q);
    if (s?.type !== "use") return [];
    return s.objects!.map((o, i) => ({ o, i, chain: c })).filter(({ i }) => !(q!.questCount & (1 << i)));
  });
}

/** Every quest object in the world, with whether it is done for this player (lit lanterns stay lit…). */
export function allObjects(): QuestObject[] {
  return [...LANTERNS, COCOON, ...SHRINES, BROOD_HEART, ...ENGINES, BEACON, ...CRYPTS, PHYLACTERY, ...WARDS];
}
export function objectDone(o: QuestObject, p: Quester | undefined): boolean {
  const c = CHAINS.findIndex((ch) => ch.quests.some((d) => d.steps.some((s) => s.objects?.includes(o))));
  if (c < 0) return false;
  const quests = CHAINS[c].quests, q = chainState(p, c);
  const qid = q?.questId ?? 0;
  const owner = quests.findIndex((d) => d.steps.some((s) => s.objects?.includes(o)));
  if (qid > owner) return true;
  if (qid < owner) return false;
  const si = quests[owner].steps.findIndex((s) => s.objects?.includes(o));
  const stage = q?.questStage ?? 0;
  if (stage - 1 > si) return true;
  if (stage - 1 < si) return false;
  return !!(q!.questCount & (1 << quests[owner].steps[si].objects!.indexOf(o)));
}
