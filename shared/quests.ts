import { MobKind, TILE } from "./constants";
import { ROADS, VILLAGE } from "./map";
import { SPAWN_ZONES, SpawnZone } from "./spawns";
import { npcById } from "./npcs";

/**
 * First quest chain, given by Elder Rowan (the druid at the bonfire):
 * 1. go and see what is going on in QUEST_ZONE (spot a blob there),
 * 2. come back and tell him, 3. kill 10 blobs, 4. return for the reward.
 * Player.questStage holds the step, Player.questCount the kills.
 */
const BLOB_KINDS: MobKind[] = ["slime", "motherblob", "blobling"];

/**
 * Where the first quest sends you: the spawn zone closest to Oakvale that has blobs and only low monsters
 * (max level below 4). Picked from SPAWN_ZONES, so it follows changes to the monster zones.
 */
function pickQuestZone(): SpawnZone {
  const vx = (VILLAGE.x0 + VILLAGE.x1) / 2, vy = (VILLAGE.y0 + VILLAGE.y1) / 2;
  const hasBlobs = (z: SpawnZone) => BLOB_KINDS.some((k) => (z.mobs[k] ?? 0) > 0);
  const dist = (z: SpawnZone) => Math.hypot(z.x + z.w / 2 - vx, z.y + z.h / 2 - vy);
  const byDist = (a: SpawnZone, b: SpawnZone) => dist(a) - dist(b);
  const low = SPAWN_ZONES.filter((z) => hasBlobs(z) && z.levels[1] < 4).sort(byDist);
  if (low.length) return low[0];
  return SPAWN_ZONES.filter(hasBlobs).sort((a, b) => a.levels[1] - b.levels[1] || byDist(a, b))[0] ?? SPAWN_ZONES[0];
}
export const QUEST_ZONE = pickQuestZone();
const ZN = `the ${QUEST_ZONE.name}`;
/** Rough compass direction of the quest zone from the village, for the dialog. */
const ZDIR = (() => {
  const dx = QUEST_ZONE.x + QUEST_ZONE.w / 2 - (VILLAGE.x0 + VILLAGE.x1) / 2, dy = QUEST_ZONE.y + QUEST_ZONE.h / 2 - (VILLAGE.y0 + VILLAGE.y1) / 2;
  return ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"][(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
})();

/** Is (px, py) inside the quest zone? */
export function inQuestZone(px: number, py: number): boolean {
  const tx = px / TILE, ty = py / TILE, z = QUEST_ZONE;
  return tx >= z.x && ty >= z.y && tx < z.x + z.w && ty < z.y + z.h;
}

export const Q = { NONE: 0, INVESTIGATE: 1, REPORT: 2, HUNT: 3, RETURN: 4, DONE: 5 } as const;

export const QUEST = {
  title: "Trouble Near Oakvale",
  giver: "druid",
  /** Monsters that count as blobs */
  blobs: BLOB_KINDS,
  /** A blob this close (px) counts as seen */
  sightRange: 9 * TILE,
  killGoal: 10,
  reward: { xp: 120, gold: 40, potions: 2 },
};

/** Quest log text and steps (each step is active while questStage === stage). */
export const QUEST_LOG = {
  giverName: "Elder Rowan",
  where: "Oakvale bonfire",
  level: "Lv 1+",
  description: `The trees around Oakvale are whispering of something that does not belong. Elder Rowan, the old druid by the village bonfire, asked you to find out what is going on in ${ZN}, ${ZDIR} of the village.`,
  steps: [
    { stage: Q.INVESTIGATE, text: `Investigate ${ZN}` },
    { stage: Q.REPORT, text: "Tell Elder Rowan what you saw" },
    { stage: Q.HUNT, text: `Kill ${QUEST.killGoal} blobs` },
    { stage: Q.RETURN, text: "Return to Elder Rowan" },
  ],
};

export interface QuestTarget {
  x: number; y: number; // px
  kind: "npc" | "area";
  r?: number; // area radius in px
  label: string;
}

/** Where the current step points to, for the map, minimap and tracker. */
export function questTarget(stage: number): QuestTarget | undefined {
  const giver = npcById(QUEST.giver);
  if ((stage === Q.REPORT || stage === Q.RETURN) && giver) return { x: giver.x, y: giver.y, kind: "npc", label: giver.name };
  if (stage === Q.INVESTIGATE || stage === Q.HUNT) {
    const z = QUEST_ZONE;
    return { x: (z.x + z.w / 2) * TILE, y: (z.y + z.h / 2) * TILE, kind: "area", r: (Math.min(z.w, z.h) / 2) * TILE, label: z.name };
  }
  return undefined;
}

export function isBlob(kind: string): boolean {
  return (QUEST.blobs as string[]).includes(kind);
}

/** Objective line for the quest tracker. */
export function questObjective(stage: number, count: number): string {
  switch (stage) {
    case Q.INVESTIGATE: return `Investigate ${ZN}, ${ZDIR} of the village`;
    case Q.REPORT: return "Tell Elder Rowan what you saw (village bonfire)";
    case Q.HUNT: return `Kill blobs: ${Math.min(count, QUEST.killGoal)} / ${QUEST.killGoal}`;
    case Q.RETURN: return "Return to Elder Rowan for your reward";
    default: return "";
  }
}

export interface DialogPage {
  text: string[];
  /** Button that advances the quest (sends "quest" to the server); none = just talk */
  accept?: string;
  bye: string;
}

/** What the druid says at each quest step. */
export function druidDialog(stage: number, count: number): DialogPage {
  switch (stage) {
    case Q.NONE: return {
      text: [
        "Ah, a traveller. Sit by the fire a moment.",
        `The trees have been whispering to me. Something stirs in ${ZN}, ${ZDIR} of here, something that does not belong.`,
        "My old bones can't make the walk. Will you go and see what is going on?",
      ],
      accept: "I'll look into it", bye: "Not now",
    };
    case Q.INVESTIGATE: return {
      text: [`${QUEST_ZONE.name} lies ${ZDIR} of the village. Follow the road and keep your eyes open.`, "Look carefully, and come back when you have seen it."],
      bye: "On my way",
    };
    case Q.REPORT: return {
      text: [
        `Blobs? In ${ZN}? So that is what the trees are afraid of.`,
        "They spread fast, and the Mother Blobs keep budding new ones. If we wait, they will be at our gates.",
        `Thin their numbers. Slay ${QUEST.killGoal} of them and come back to me.`,
      ],
      accept: `I'll kill ${QUEST.killGoal} blobs`, bye: "Later",
    };
    case Q.HUNT: return {
      text: [`You have slain ${Math.min(count, QUEST.killGoal)} of ${QUEST.killGoal}. Keep going, Oakvale is counting on you.`],
      bye: "Back to the hunt",
    };
    case Q.RETURN: return {
      text: ["I felt the land breathe easier. You have done well, friend.", "Take this, with the thanks of Oakvale."],
      accept: `Claim reward (${QUEST.reward.xp} XP, ${QUEST.reward.gold} gold, ${QUEST.reward.potions} potions)`, bye: "Later",
    };
    default: return {
      text: ["The land is quieter thanks to you. May the old oaks shelter you, friend."],
      bye: "Farewell",
    };
  }
}
