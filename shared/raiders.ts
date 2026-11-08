// The Night Raiders (Murat 2026-11-08): seven named riders in great black cloaks on dark horses, each with a massive
// weapon. They come out of the night, ride across the land looking for what they lost, cut down every living thing in
// their way (never the dead: they are half dead themselves), and are gone again in a cloud of dust.
import type { MobKind } from "./constants";
import { MAX_LEVEL } from "./classes";

export type RaiderWeapon = "greatsword" | "scythe" | "greataxe" | "flail" | "lance" | "maul" | "glaive";

export interface Raider {
  /** Mob.weapon of the raider, and the end of its sheet name (mob_nightraider_<key>) */
  key: string;
  /** Shown over it (Mob.title); the part before the comma is its name in chat */
  title: string;
  weapon: RaiderWeapon;
  /** Art: horse coat, the trim of the cloak and the glow under the hood */
  horse: number; mane: number; trim: number; eyes: number; metal: number;
  /** What it is looking for (spoken while it rides), when it finds someone to fight, when it kills, when it falls */
  seek: string[]; fight: string[]; kill: string[]; death: string;
}

/**
 * The Unburied Seven. Once the oath-guard of a drowned king, they swore to keep his tomb until the end of days and
 * broke the oath the first night it was tested. The grave they fled took one thing from each of them, and now each
 * night they ride out to find it. They cannot die: cut one down and it falls to dust, and some later night it rides
 * again. The dead let them pass, for the Seven are more than half of the grave already.
 */
export const RAIDERS: Raider[] = [
  {
    key: "vharn", title: "Vharn, the Ashbrand", weapon: "greatsword",
    horse: 0x1c1a1c, mane: 0x0a0909, trim: 0x8a2a14, eyes: 0xff6a1a, metal: 0x6e6258,
    seek: ["Where is the ember? It was in my hand...", "My hearth went cold. Who took the fire?", "Ash. Only ash. Keep looking.", "It burned here once. I can smell it."],
    fight: ["You carry warmth. Give it to me.", "Burn with me!"], kill: ["Cold now. Like me."],
    death: "The ember... was never... here...",
  },
  {
    key: "moragh", title: "Moragh, the Gallows Bride", weapon: "scythe",
    horse: 0x3a3a3e, mane: 0xbab4a8, trim: 0xd8d0c0, eyes: 0xc8e8ff, metal: 0x9aa0a8,
    seek: ["Who tied the rope? Say his name.", "I was promised a wedding, not a gallows.", "Somewhere a ring waits for my finger.", "Every crossroad has a tree. Every tree has a rope."],
    fight: ["Kneel. The harvest is in.", "Do you know his name?"], kill: ["Not him either."],
    death: "Another night... another road...",
  },
  {
    key: "skarde", title: "Skarde, the Faceless", weapon: "greataxe",
    horse: 0x2a1e16, mane: 0x120c08, trim: 0x5a6a3a, eyes: 0x9aff6a, metal: 0x5c5650,
    seek: ["Have you seen my face? I left it somewhere.", "Under the helm is nothing. I must find it.", "Show me your face. Is it mine?", "I remember a smile. Whose was it?"],
    fight: ["Your face. I want your face.", "Hold still!"], kill: ["Not mine. Never mine."],
    death: "Faceless... still...",
  },
  {
    key: "ilsevar", title: "Ilsevar of the Seven Bells", weapon: "flail",
    horse: 0x3c2a1c, mane: 0x1a120c, trim: 0xb08a3a, eyes: 0xffd27a, metal: 0x8a6a3a,
    seek: ["Seven bells rang for my death. One rings still.", "Listen... do you hear it? The last bell.", "When I find the bell, I will silence it.", "The bell tolls somewhere near. Somewhere near."],
    fight: ["Ring for me!", "Your bell rings now."], kill: ["One more bell. One more."],
    death: "Silence... at last...",
  },
  {
    key: "corvane", title: "Corvane, the Oathbreaker", weapon: "lance",
    horse: 0x101418, mane: 0x050608, trim: 0x2a3a6a, eyes: 0x6a9aff, metal: 0x4a5462,
    seek: ["I swore an oath. I cannot remember the words.", "The king's tomb is empty. Where did he go?", "Someone still holds my sworn word. Who?", "We fled. We all fled. I must go back."],
    fight: ["You! Were you there that night?", "Stand and be judged!"], kill: ["Forsworn. Like me."],
    death: "Forgive me... my king...",
  },
  {
    key: "hesk", title: "Hesk, the Grieving", weapon: "maul",
    horse: 0x4a3226, mane: 0x2a1a12, trim: 0x6a3a5a, eyes: 0xe86aff, metal: 0x6a6460,
    seek: ["Little one? Where did they bury you?", "I dug every grave in the valley. Not one was hers.", "She had a red ribbon. Have you seen it?", "Daughter... answer me..."],
    fight: ["Did you take her from me?", "Out of my way!"], kill: ["Not her. Not her."],
    death: "Wait for me... little one...",
  },
  {
    key: "sabel", title: "Sabel, the Last Dawn", weapon: "glaive",
    horse: 0x6a6a6e, mane: 0x2a2a2e, trim: 0xa04a2a, eyes: 0xffa06a, metal: 0x8a8a92,
    seek: ["The dawn was promised to us. Where is it?", "Each night longer than the last.", "I rode toward the sun once. It ran from me.", "Is it morning yet? Tell me it is morning."],
    fight: ["You have seen the sun. I can tell.", "Light? Give it to me!"], kill: ["Still night."],
    death: "Is this... the dawn...?",
  },
];
export const raiderByKey = (k: string) => RAIDERS.find((r) => r.key === k);

/** Never touched by the riders, and they never fight back against them: the dead. */
export const RAIDER_SPARES: MobKind[] = ["skeleton", "skeletonmage", "necromancer", "crawler", "demon", "hollowking", "sanddead"];
/** Not living things (the Summoner's golems): the riders pass them by. */
export const raiderIgnores = (kind: MobKind) => RAIDER_SPARES.includes(kind) || kind.startsWith("golem") || kind === "nightraider";

/**
 * When and how they ride. They only ride at night (shared/daynight.ts isUndeadNight), near a hero in the act's
 * overworld. Act 1: rare, one at a time. Act 2: more often, up to two at once. Always the game's top level
 * (MAX_LEVEL) in both acts (Murat 2026-11-08), and close to unbeatable for one hero alone: a group is needed. Every `rollMs` of the night each free slot gets `chance` to fill.
 */
export const NIGHT_RAID = {
  acts: {
    1: { level: MAX_LEVEL, max: 1, chance: 0.07, restMs: 9 * 60_000 },
    2: { level: MAX_LEVEL, max: 2, chance: 0.16, restMs: 4 * 60_000 },
  } as Record<1 | 2, { level: number; max: number; chance: number; restMs: number }>,
  rollMs: 60_000,
  /** How long one rides before it fades away (it also goes at dawn) */
  rideMs: [180_000, 300_000] as [number, number],
  /** It comes out of the dark this far from the hero it chose (tiles), off screen */
  arrive: [16, 24] as [number, number],
  /** Its next stop on the road: this far ahead (tiles), never in a town */
  wander: [10, 24] as [number, number],
  /** Says something about its search every so often while it rides (ms) */
  sayMs: [16_000, 30_000] as [number, number],
  /** Sees prey this far (px) and gives up a chase this far from where it began */
  sight: 170, chase: 420,
  /** Ride-down: from this far it spurs the horse and charges, hitting hard on arrival */
  charge: { min: 50, max: 160, ms: 800, speed: 2.1, mult: 1.6, cooldownMs: 3500 },
  /** Its massive weapon sweeps: everyone this close to the one it hits takes `mult` of the blow */
  cleave: { r: 30, mult: 0.6 },
};
