import { MobKind, TILE } from "./constants";
import { AREAS, isSafeZone, isSolidAt, VILLAGE } from "./map";
import { SPAWN_ZONES, SpawnZone } from "./spawns";
import { npcById } from "./npcs";

/**
 * The blob quest chain. Quests are done one after the other, each in a blob zone a little further from
 * Oakvale and a little tougher (North Meadow → Goldenreach Farms → Misty Marsh → Mirror Pond → Sunken Lake →
 * Thornwood → deep in the Whispering Woods).
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

const zoneByName = (name: string) => SPAWN_ZONES.find((z) => z.name === name) ?? SPAWN_ZONES[0];
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
const zdir = (z: SpawnZone) => dirFromVillage(z.x + z.w / 2, z.y + z.h / 2);

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
};

// ---- Map objects you use with E ----

export type QuestObjectKind = "lantern" | "shrine" | "cocoon" | "heart";
export interface QuestObject { id: string; kind: QuestObjectKind; x: number; y: number; name: string; verb: string }

const obj = (id: string, kind: QuestObjectKind, name: string, verb: string, area: string, fx: number, fy: number): QuestObject =>
  ({ id, kind, name, verb, ...spotIn(area, fx, fy) });

/** How close (px) you must stand to use a quest object. */
export const USE_RANGE = 1.3 * TILE;

// ---- Quest definitions ----

export type StepType = "see" | "reach" | "talk" | "kill" | "collect" | "use";
export interface QuestStep {
  type: StepType;
  /** Quest log line */
  text: string;
  /** Banner when the step starts: [title, line] */
  banner: [string, string];
  /** Where to go (spawn zone name) for see / kill / collect / use; kills and drops only count inside it */
  zone?: string;
  /** talk: who to talk to */
  npc?: string;
  /** see / kill / collect: which monsters */
  kinds?: MobKind[];
  /** kill / collect: how many */
  goal?: number;
  /** collect: item id in QUEST_ITEMS, and drop chance per kind */
  item?: string;
  chance?: Partial<Record<MobKind, number>>;
  /** use: the objects to use (goal = all of them) */
  objects?: QuestObject[];
  /** reach: point (px) and radius */
  at?: { x: number; y: number; r: number; label: string };
  /** talk: the NPC's lines and the button that moves on */
  say?: string[];
  accept?: string;
  /** Short line for the tracker; "{n}" and "{goal}" are filled in */
  obj: string;
  /** What the quest giver says while this step is in progress */
  nag?: string;
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
  lake: zoneByName("Sunken Lake"), woods: zoneByName("Whispering Woods"), thorn: zoneByName("Thornwood"),
};

export const LANTERNS: QuestObject[] = [
  obj("lantern1", "lantern", "Spirit lantern", "Light", "Misty Marsh", 0.18, 0.3),
  obj("lantern2", "lantern", "Spirit lantern", "Light", "Misty Marsh", 0.42, 0.72),
  obj("lantern3", "lantern", "Spirit lantern", "Light", "Misty Marsh", 0.64, 0.28),
  obj("lantern4", "lantern", "Spirit lantern", "Light", "Misty Marsh", 0.86, 0.66),
];
export const COCOON = obj("cocoon", "cocoon", "Blob cocoon", "Free Tobin", "Sunken Lake", 0.3, 0.35);
export const SHRINES: QuestObject[] = [
  obj("shrine1", "shrine", "Rotting shrine", "Cleanse", "Thornwood", 0.2, 0.3),
  obj("shrine2", "shrine", "Rotting shrine", "Cleanse", "Thornwood", 0.5, 0.75),
  obj("shrine3", "shrine", "Rotting shrine", "Cleanse", "Thornwood", 0.8, 0.35),
];
export const BROOD_HEART = obj("heart", "heart", "Brood Heart", "Burn", "Whispering Woods", 0.6, 0.62);

const back = (npc: string, name: string, where: string, say: string[], accept: string, nag?: string): QuestStep =>
  ({ type: "talk", npc, text: `Return to ${name}`, banner: ["Quest updated", `Return to ${name}`], say, accept, obj: `Return to ${name} (${where})`, nag });

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
        say: [`Blobs? In ${FZN}? So that is what the trees are afraid of.`, "They spread fast, and the Mother Blobs keep budding new ones. If we wait, they will be at our gates.", "Thin their numbers. Slay 10 of them and come back to me."],
        accept: "I'll kill 10 blobs" },
      { type: "kill", kinds: BLOB_KINDS, goal: 10, text: "Kill 10 blobs", banner: ["Quest updated", "Kill 10 blobs"], obj: "Kill blobs: {n} / {goal}",
        nag: "You have slain {n} of {goal}. Keep going, Oakvale is counting on you." },
      back("druid", "Elder Rowan", "village bonfire", ["I felt the land breathe easier. You have done well, friend.", "Take this, with the thanks of Oakvale."], "Claim reward"),
    ],
    reward: { xp: 120, gold: 40, potions: 2 },
    after: "Old Morwen, our potion witch, has been asking about you. Her hut is on the west side of the square.",
  },
  {
    id: "jelly", title: "Jelly for the Cauldron", giver: "witch", zone: Z.farms.name, minLevel: 2,
    description: `Old Morwen wants fresh blob jelly for her brews. The blobs have spread into ${Z.farms.name}, ${zdir(Z.farms)} of Oakvale, and the farmers want them gone too.`,
    offer: [
      "Rowan's little helper! Yes, yes, I heard. Blobs, blobs everywhere.",
      `Do you know what blob jelly does to a healing brew? Wonders, dearie. And ${Z.farms.name} is crawling with blobs now.`,
      "Bring me 6 lumps of fresh jelly. Squash them and pick up what they leave behind.",
    ],
    acceptText: "I'll fetch the jelly",
    steps: [
      { type: "collect", zone: Z.farms.name, kinds: ["slime", "motherblob", "blobling"], item: "jelly", goal: 6, chance: { slime: 0.5, motherblob: 1, blobling: 0.25 },
        text: `Collect 6 Blob Jelly in ${Z.farms.name}`, banner: ["New quest", "Jelly for the Cauldron"], obj: `Blob Jelly from ${Z.farms.name}: {n} / {goal}`,
        nag: `{n} of {goal}. Only fresh jelly from ${Z.farms.name}, mind, the meadow ones taste of grass.` },
      back("witch", "Old Morwen", "her hut", ["Oh, look at it wobble! Perfect.", "Here, potions from the last batch, and some coin. Mind the green one."], "Claim reward"),
    ],
    reward: { xp: 220, gold: 60, potions: 3 },
    after: "Rowan was looking grim this morning. Go and see him, dearie. And come back for potions!",
  },
  {
    id: "marsh", title: "Lights in the Mist", giver: "druid", zone: Z.marsh.name, minLevel: 3,
    description: `Old spirit lanterns once kept ${Z.marsh.name} safe. They have gone dark, and the blobs grow bolder in the fog. Elder Rowan asked you to light them again and deal with the Mother Blob that brings the mist.`,
    offer: [
      `Morwen's brews will help, but the blobs keep coming. They come from ${Z.marsh.name}, ${zdir(Z.marsh)} of here.`,
      "Long ago we hung spirit lanterns in the marsh. Their light keeps such things away. They have all gone dark.",
      "Light the four lanterns, and slay the Mother Blob that thrives in the dark.",
    ],
    acceptText: "I'll light them",
    steps: [
      { type: "use", zone: Z.marsh.name, objects: LANTERNS, text: `Light the 4 spirit lanterns in ${Z.marsh.name}`, banner: ["New quest", "Lights in the Mist"],
        obj: "Spirit lanterns lit: {n} / {goal}", nag: "{n} of {goal} lanterns burn. Walk up to one and press E." },
      { type: "kill", zone: Z.marsh.name, kinds: ["motherblob"], goal: 1, text: `Slay a Mother Blob in ${Z.marsh.name}`, banner: ["The lanterns burn!", "Now slay a Mother Blob"],
        obj: `Mother Blob slain in ${Z.marsh.name}: {n} / {goal}`, nag: "Now the Mother Blob. She is big, and her little ones will swarm you. Strike her first." },
      back("druid", "Elder Rowan", "village bonfire", ["I can see the glow from here. The marsh can breathe again.", "You are becoming quite the blob hunter. Take this."], "Claim reward"),
    ],
    reward: { xp: 320, gold: 80, potions: 2 },
    after: "Brann the smith wants a word with you. Something about blobs with swords, if you can believe it.",
  },
  {
    id: "pond", title: "Armed and Oozing", giver: "weaponsmith", zone: Z.pond.name, minLevel: 4,
    description: `Blobs at ${Z.pond.name} have started to spit stones and swing blades. Brann wants them thinned, and wants their hard cores to see what makes them so tough.`,
    offer: [
      "You're the one Rowan keeps bragging about? Good. I have a job that needs a sharp blade.",
      `Up at ${Z.pond.name}, ${zdir(Z.pond)} of here, blobs are shooting stones and swinging blades. Blobs! With blades!`,
      "Kill 4 of the shooters. Then bring me 3 cores from the warrior blobs. I want to know what they're made of.",
    ],
    acceptText: "Leave it to me",
    steps: [
      { type: "kill", zone: Z.pond.name, kinds: ["shooterblob"], goal: 4, text: `Kill 4 shooter blobs at ${Z.pond.name}`, banner: ["New quest", "Armed and Oozing"],
        obj: "Shooter blobs: {n} / {goal}", nag: "{n} of {goal} shooters. Close in fast, they're weak up close." },
      { type: "collect", zone: Z.pond.name, kinds: ["warriorblob"], item: "core", goal: 3, chance: { warriorblob: 0.6 },
        text: "Collect 3 Blob Cores from warrior blobs", banner: ["Shooters down!", "Collect 3 Blob Cores"], obj: "Blob Cores: {n} / {goal}",
        nag: "{n} of {goal} cores. Watch out for the lunge, step aside when they crouch." },
      back("weaponsmith", "Brann", "his forge", ["Hard as river stone. No wonder they hit like hammers.", "Here, you've earned this. And the forge is always open to you."], "Claim reward"),
    ],
    reward: { xp: 450, gold: 150, potions: 2 },
    after: "Rowan's got bad news, I hear. Tobin the fisherman never came home.",
  },
  {
    id: "lake", title: "Lost at the Lake", giver: "druid", zone: Z.lake.name, minLevel: 6,
    description: `Tobin the fisherman went to ${Z.lake.name} three days ago and never came back. Elder Rowan fears the blobs took him.`,
    offer: [
      `Tobin the fisherman went to ${Z.lake.name} three days ago. He never came back.`,
      "The blobs there are different. Some of them heal the others. I fear they have taken him somewhere.",
      "Please, find him. Bring him home.",
    ],
    acceptText: "I'll find Tobin",
    steps: [
      { type: "reach", at: { x: COCOON.x, y: COCOON.y, r: 5 * TILE, label: "Tobin's last camp" }, zone: Z.lake.name,
        text: `Search ${Z.lake.name} for Tobin`, banner: ["New quest", "Lost at the Lake"], obj: `Search ${Z.lake.name} for Tobin`,
        nag: "His camp was on the north shore of the lake. Start there." },
      { type: "kill", zone: Z.lake.name, kinds: ["healerblob"], goal: 3, text: "Kill 3 healer blobs keeping the cocoon alive",
        banner: ["Tobin is trapped in a blob cocoon!", "Kill the healer blobs that feed it"], obj: "Healer blobs: {n} / {goal}",
        nag: "Healer blobs feed the cocoon. Kill them, then cut him free." },
      { type: "use", zone: Z.lake.name, objects: [COCOON], text: "Free Tobin from the cocoon", banner: ["The cocoon weakens!", "Free Tobin"],
        obj: "Free Tobin from the cocoon", nag: "Hurry, cut him free!" },
      { type: "talk", npc: "fisher", text: "Check on Tobin back in Oakvale", banner: ["Tobin is free!", "He ran home to Oakvale"],
        obj: "Check on Tobin in Oakvale (east of the bonfire)",
        say: ["You came for me! I thought I'd be blob food for sure.", "I ran all the way home. Here, it's not much, but it's all my savings. Thank you, friend."],
        accept: "Claim reward", nag: "" },
    ],
    reward: { xp: 650, gold: 200, potions: 3 },
    after: "Tobin is home, thanks to you. But the blobs are coming from somewhere deep in the woods. Talk to me when you are ready.",
  },
  {
    id: "woods", title: "The Rotting Shrines", giver: "druid", zone: Z.thorn.name, minLevel: 10,
    description: `The old forest shrines of ${Z.thorn.name} are rotting under blob slime, and the forest spirits have gone quiet. Elder Rowan asked you to cleanse them and bring back the rot seeds the healer blobs carry.`,
    offer: [
      "Tobin told me something. The cocoon was full of tiny black seeds.",
      `The old shrines of ${Z.thorn.name} are rotting, and the forest spirits have gone quiet. The rot and the blobs are one and the same.`,
      "Cleanse the three shrines, and bring me 4 rot seeds from the healer blobs so I can study them.",
    ],
    acceptText: "I'll cleanse them",
    steps: [
      { type: "use", zone: Z.thorn.name, objects: SHRINES, text: "Cleanse the 3 rotting shrines", banner: ["New quest", "The Rotting Shrines"],
        obj: "Shrines cleansed: {n} / {goal}", nag: "{n} of {goal} shrines are clean. Press E at each one." },
      { type: "collect", zone: Z.thorn.name, kinds: ["healerblob"], item: "rot", goal: 4, chance: { healerblob: 0.7 },
        text: "Collect 4 Rot Seeds from healer blobs", banner: ["The shrines are clean!", "Collect 4 Rot Seeds"], obj: "Rot Seeds: {n} / {goal}",
        nag: "{n} of {goal} seeds. The healers hide behind the others, go for them first." },
      back("druid", "Elder Rowan", "village bonfire", ["These seeds... they all point the same way. Deep into the Whispering Woods.", "There is a heart in there, a brood heart, feeding every blob in the land. Rest, and take this."], "Claim reward"),
    ],
    reward: { xp: 900, gold: 260, potions: 3 },
    after: "The heart of the brood beats deep in the Whispering Woods. Come to me when you are strong enough to face it.",
  },
  {
    id: "thorn", title: "Heart of the Brood", giver: "druid", zone: Z.woods.name, minLevel: 12,
    description: `Every blob in the land comes from the Brood Heart deep in ${Z.woods.name}. Two Mother Blobs guard it. Elder Rowan asked you to end it.`,
    offer: [
      `It is time. The Brood Heart beats deep in ${Z.woods.name}, ${zdir(Z.woods)} of here.`,
      "Two Mother Blobs guard it. Slay them, then burn the heart with this torch of oak fire.",
      "This is the hardest thing I have ever asked of anyone. Will you go?",
    ],
    acceptText: "I will end it",
    steps: [
      { type: "kill", zone: Z.woods.name, kinds: ["motherblob"], goal: 2, text: `Slay 2 Mother Blobs in ${Z.woods.name}`, banner: ["New quest", "Heart of the Brood"],
        obj: "Mother Blobs slain: {n} / {goal}", nag: "{n} of {goal} Mother Blobs. Take potions, and do not fight them both at once." },
      { type: "use", zone: Z.woods.name, objects: [BROOD_HEART], text: "Burn the Brood Heart", banner: ["The guardians have fallen!", "Burn the Brood Heart"],
        obj: "Burn the Brood Heart", nag: "The heart is unguarded. Burn it!" },
      back("druid", "Elder Rowan", "village bonfire", ["I felt it, all the way here. The whole forest sighed.", "There will always be blobs, friend. But never like this again. Oakvale owes you everything."], "Claim reward"),
    ],
    reward: { xp: 1600, gold: 500, potions: 5 },
    after: "The land is quieter thanks to you. May the old oaks shelter you, friend.",
  },
];

export interface QuestState { questId: number; questStage: number; questCount: number; level?: number }

export const questDef = (q: QuestState | undefined) => (q ? QUESTS[q.questId] : QUESTS[0]);
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
  /** Button that moves the quest on (sends "quest" to the server); none = just talk */
  accept?: string;
  bye: string;
}

/** Is this NPC standing in the village for this player? (Tobin only comes home once freed.) */
export function npcPresent(id: string, q: QuestState | undefined): boolean {
  if (id !== "fisher") return true;
  const lake = QUESTS.findIndex((d) => d.id === "lake");
  const qid = q?.questId ?? 0;
  return qid > lake || (qid === lake && (q?.questStage ?? 0) >= QUESTS[lake].steps.length);
}
/** Is the blob cocoon (with Tobin inside) still there for this player? */
export function cocoonPresent(q: QuestState | undefined): boolean {
  const lake = QUESTS.findIndex((d) => d.id === "lake");
  return (q?.questId ?? 0) < lake || ((q?.questId ?? 0) === lake && (q?.questStage ?? 0) < QUESTS[lake].steps.length);
}

/** Does this NPC have something to say about the quest right now? "!" = new quest, "?" = come and talk. */
export function npcQuestMark(id: string, q: QuestState | undefined): "!" | "?" | "" {
  const d = questDef(q);
  if (!d) return "";
  const stage = q?.questStage ?? 0;
  if (stage === 0) return d.giver === id && (q?.level ?? 1) >= d.minLevel ? "!" : "";
  const s = questStep(q);
  return s?.type === "talk" && s.npc === id ? "?" : "";
}

/** Rewards line for buttons and the log. */
export const rewardText = (r: Reward) => `${r.xp} XP, ${r.gold} gold, ${r.potions} potions`;

/** What an NPC says about the quest chain, or undefined if they have nothing to say (traders then just trade). */
export function questDialog(id: string, q: QuestState | undefined): DialogPage | undefined {
  const qid = q?.questId ?? 0, stage = q?.questStage ?? 0, count = q?.questCount ?? 0;
  const d = QUESTS[qid];
  if (!d) return id === "druid" ? { text: [QUESTS[QUESTS.length - 1].after], bye: "Farewell" } : undefined;
  if (stage === 0) {
    if (d.giver === id) {
      if ((q?.level ?? 1) < d.minLevel) return { text: [`There is more to do, but it is dangerous out there. Come back when you are level ${d.minLevel}.`], bye: "I'll train" };
      return { text: d.offer, accept: d.acceptText, bye: "Not now" };
    }
    // The previous giver points you to the next one
    const prev = QUESTS[qid - 1];
    if (prev && prev.giver === id) return { text: [prev.after], bye: "Thanks" };
    return id === "druid" ? { text: ["The old oaks are restless. Keep your blade sharp, friend."], bye: "Farewell" } : undefined;
  }
  const s = d.steps[stage - 1];
  if (!s) return undefined;
  if (s.type === "talk" && s.npc === id) {
    const last = stage === d.steps.length;
    return { text: s.say!, accept: last ? `${s.accept} (${rewardText(d.reward)})` : s.accept, bye: "Later" };
  }
  if (d.giver === id && s.nag) return { text: [fill(s.nag, stepProgress(s, count), stepGoal(s))], bye: "On my way" };
  return undefined;
}

export interface QuestTarget {
  x: number; y: number; // px
  kind: "npc" | "area" | "object";
  r?: number; // area radius in px
  label: string;
}

/** Where the current step points to, for the map, minimap and tracker (several for "use" steps). */
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
  if (s.type === "reach") return [{ x: s.at!.x, y: s.at!.y, kind: "area", r: s.at!.r, label: s.at!.label }];
  if (s.type === "use") {
    return s.objects!.filter((o, i) => !(q!.questCount & (1 << i))).map((o) => ({ x: o.x, y: o.y, kind: "object" as const, label: o.name }));
  }
  const z = zoneByName(s.zone ?? d.zone);
  return [{ x: (z.x + z.w / 2) * TILE, y: (z.y + z.h / 2) * TILE, kind: "area", r: (Math.min(z.w, z.h) / 2) * TILE, label: z.name }];
}

/** Quest objects on the current step that this player can still use, with their index (bit) in the step. */
export function usableObjects(q: QuestState | undefined): { o: QuestObject; i: number }[] {
  const s = questStep(q);
  if (s?.type !== "use") return [];
  return s.objects!.map((o, i) => ({ o, i })).filter(({ i }) => !(q!.questCount & (1 << i)));
}

/** Every quest object in the world, with whether it is done for this player (lit lanterns stay lit…). */
export function allObjects(): QuestObject[] {
  return [...LANTERNS, COCOON, ...SHRINES, BROOD_HEART];
}
export function objectDone(o: QuestObject, q: QuestState | undefined): boolean {
  const qid = q?.questId ?? 0;
  const owner = QUESTS.findIndex((d) => d.steps.some((s) => s.objects?.includes(o)));
  if (qid > owner) return true;
  if (qid < owner) return false;
  const si = QUESTS[owner].steps.findIndex((s) => s.objects?.includes(o));
  const stage = q?.questStage ?? 0;
  if (stage - 1 > si) return true;
  if (stage - 1 < si) return false;
  return !!(q!.questCount & (1 << QUESTS[owner].steps[si].objects!.indexOf(o)));
}
