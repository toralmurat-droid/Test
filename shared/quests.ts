import { MobKind, TILE } from "./constants";
import { AREAS, ROADS } from "./map";
import { npcById } from "./npcs";

/**
 * First quest chain, given by Elder Rowan (the druid at the bonfire):
 * 1. go and see what is going on in the woods (spot a blob there),
 * 2. come back and tell him, 3. kill 10 blobs, 4. return for the reward.
 * Player.questStage holds the step, Player.questCount the kills.
 */
export const Q = { NONE: 0, INVESTIGATE: 1, REPORT: 2, HUNT: 3, RETURN: 4, DONE: 5 } as const;

export const QUEST = {
  title: "Trouble in the Woods",
  giver: "druid",
  /** Monsters that count as blobs */
  blobs: ["slime", "motherblob", "blobling"] as MobKind[],
  /** Areas that count as "the woods" for the investigation step */
  woods: ["Whispering Woods", "Thornwood"],
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
  description: "The trees east of the river are whispering of something that does not belong. Elder Rowan, the old druid by the village bonfire, asked you to find out what is going on in the Whispering Woods.",
  steps: [
    { stage: Q.INVESTIGATE, text: "Investigate the Whispering Woods" },
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
    const a = AREAS.find((z) => z.name === "Whispering Woods");
    if (!a) return undefined;
    // The near edge of the woods, level with the village
    return { x: (a.x + 12) * TILE, y: (ROADS.RY + 1) * TILE, kind: "area", r: 9 * TILE, label: "Whispering Woods" };
  }
  return undefined;
}

export function isBlob(kind: string): boolean {
  return (QUEST.blobs as string[]).includes(kind);
}

/** Objective line for the quest tracker. */
export function questObjective(stage: number, count: number): string {
  switch (stage) {
    case Q.INVESTIGATE: return "Investigate the Whispering Woods, east of the river";
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
        "The trees have been whispering to me. Something stirs in the woods east of the river, something that does not belong.",
        "My old bones can't make the walk. Will you go and see what is going on?",
      ],
      accept: "I'll look into it", bye: "Not now",
    };
    case Q.INVESTIGATE: return {
      text: ["The Whispering Woods lie east of the river. Follow the King's Road and cross the bridge.", "Look carefully, and come back when you have seen it."],
      bye: "On my way",
    };
    case Q.REPORT: return {
      text: [
        "Blobs? In the Whispering Woods? So that is what the trees are afraid of.",
        "They spread fast, and the Mother Blobs keep budding new ones. If we wait, they will be at our gates.",
        `Thin their numbers. Slay ${QUEST.killGoal} of them and come back to me.`,
      ],
      accept: `I'll kill ${QUEST.killGoal} blobs`, bye: "Later",
    };
    case Q.HUNT: return {
      text: [`You have slain ${Math.min(count, QUEST.killGoal)} of ${QUEST.killGoal}. Keep going, the woods are counting on you.`],
      bye: "Back to the hunt",
    };
    case Q.RETURN: return {
      text: ["I felt the woods breathe easier. You have done well, friend.", "Take this, with the thanks of Oakvale."],
      accept: `Claim reward (${QUEST.reward.xp} XP, ${QUEST.reward.gold} gold, ${QUEST.reward.potions} potions)`, bye: "Later",
    };
    default: return {
      text: ["The woods are quieter thanks to you. May the old oaks shelter you, friend."],
      bye: "Farewell",
    };
  }
}
