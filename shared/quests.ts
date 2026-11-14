import { MobKind, TILE } from "./constants";
import { AREAS, ELEMENT_LANDS, GULLROCK, HOLLOW, HOLLOW_WARDS, isSafeZone, isSolidAt, REDFANG, SHRINE_SPOT, VILLAGE, WRECK } from "./map";
import { SPAWN_ZONES, SpawnZone } from "./spawns";
import { npcById } from "./npcs";
import { chamberAt, COCOONS, CRYPT_FLOORS, DEN, FLOORS, HIGH_CHOIR, SINKHOLE, TOTEMS, UNDER_FLOORS, WATER_THRONE } from "./dungeon";
import { D, FURNACE, KEL_ASHAR } from "./desert";
import { xpStep } from "./classes";
import { type BargainSpec, type CarrySpec, type ChoiceId, type ChoiceSpec, choiceOf, type HoldSpec, nextStage, type PickSpec, sayFor, stepObjects, type SyncSpec, type UnseenSpec } from "./questSteps";

/**
 * The blob quest chain. Quests are done one after the other, each in a blob zone a little further from
 * Oakvale and a little tougher (North Meadow → Goldenreach Farms → Misty Marsh → Mirror Pond → Sunken Lake →
 * Brinewood → the wreck of the Grey Heron on Heronwreck Strand). The whole chain stays west of River Ashwell
 * and ends on the coast, where the Gloam first came ashore (Murat 2026-11-03). Quests 8-11 (Murat 2026-11-05) follow the
 * four pieces that tore free when the Brood Heart burned, east across the river into the elemental wilds (ELEMENT_LANDS):
 * Blightmire Fen (poison, Lv 14) → Rimewater Hollow (frost, Lv 17) → Cinder Scar (fire, Lv 20) → Stormbreak Crags (storm, Lv 23).
 *
 * Progress lives on the server: Player.questId = index in QUESTS, Player.questStage = 0 before the quest is
 * accepted, then 1..steps.length for the step being worked on (stage s = steps[s - 1]); Player.questCount =
 * progress on that step (kills / items, or a bitmask of the objects already used). Claiming the reward at
 * the last step moves on to the next quest (questId + 1, stage 0). questId === QUESTS.length = chain done.
 */
export const BLOB_KINDS: MobKind[] = ["slime", "motherblob", "blobling", "shooterblob", "warriorblob", "healerblob", "venomblob", "frostblob", "fireblob", "stormblob"];
/** The four elemental blobs of the eastern wilds (blob quests 8-11). */
export const ELEMENT_BLOBS: MobKind[] = ["venomblob", "frostblob", "fireblob", "stormblob"];

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

/** A walkable spot (px, feet) near tile (tx, ty), searched outwards like spotIn. */
export function spotNear(tx: number, ty: number): { x: number; y: number } {
  const free = (x: number, y: number) => {
    const px = (x + 0.5) * TILE, py = (y + 0.5) * TILE;
    if (isSafeZone(px, py)) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isSolidAt(px + dx * TILE * 0.6, py + dy * TILE * 0.6)) return false;
    return true;
  };
  const cx = Math.floor(tx), cy = Math.floor(ty);
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
  venom: { name: "Venom Sac", plural: "Venom Sacs" },
  cinder: { name: "Cinder Heart", plural: "Cinder Hearts" },
  stormglass: { name: "Storm Glass", plural: "Storm Glass" },
  charm: { name: "Hide Charm", plural: "Hide Charms" },
  // Act 2, the Second Sun (SUN_QUESTS)
  veil: { name: "Veil Token", plural: "Veil Tokens" },
  letter: { name: "Sealed Letter", plural: "Sealed Letters" },
  brand: { name: "Sun Brand", plural: "Sun Brands" },
  key: { name: "Furnace Key", plural: "Furnace Keys" },
  // the zone arcs (ZONE_ARCS)
  arrow: { name: "Ewan's Arrow", plural: "Ewan's Arrows" },
  thornseed: { name: "Thorn Seed", plural: "Thorn Seeds" },
  salvage: { name: "Ship's Salvage", plural: "Ship's Salvage" },
  skyiron: { name: "Sky-Iron", plural: "Sky-Iron" },
  caravanseal: { name: "Caravan Seal", plural: "Caravan Seals" },
  pearl: { name: "Dune-Pearl", plural: "Dune-Pearls" },
};

// ---- Map objects you use with E ----

export type QuestObjectKind = "bell" | "urn" | "lantern" | "shrine" | "cocoon" | "heart" | "engine" | "beacon" | "crypt" | "phylactery" | "ward" | "shard" | "silk" | "totem" | "sigil" | "cistern"
  // the zone quests (Murat 2026-11-10): something dropped to search, a nest to burn, a marked stone to read
  | "clue" | "nest" | "cairn"
  // the quest concepts (docs/quest-concepts-progress.md): graves to read or open, seals, ward-lamps, a hidden door
  | "grave" | "seal" | "wardlamp" | "postern" | "lastlantern";
export interface QuestObject { id: string; kind: QuestObjectKind; x: number; y: number; name: string; verb: string }

const obj = (id: string, kind: QuestObjectKind, name: string, verb: string, area: string, fx: number, fy: number): QuestObject =>
  ({ id, kind, name, verb, ...spotIn(area, fx, fy) });

/** How close (px) you must stand to use a quest object. */
export const USE_RANGE = 1.3 * TILE;

// ---- Quest definitions ----

export type StepType = "see" | "reach" | "talk" | "kill" | "collect" | "use" | "merge" | "ritual" | "equip" | "learn" | "cast"
  // shared/questSteps.ts: carry a light, hold a spot, pick the right one, go unseen, turn two things at once, make a choice
  | "carry" | "hold" | "pick" | "unseen" | "sync" | "choose";

/** Bump when steps change: saves from an older version restart their current quest at the offer. */
export const QUEST_VERSION = 4;

/**
 * A monster the server puts in the world for a player on this step (one at a time, back if lost): a fused blob
 * when `parts` are blobs, else one monster of kind parts[0] (a Bone Demon, the Pale Marshal...), with a name tag.
 */
/** A named boss's voice (speech bubbles): lines as it rises, now and then in the fight, once at half health, and its last words. */
export interface BossVoice { wake: string[]; taunt: string[]; half?: string[]; death: string[] }
export interface Summon { parts: MobKind[]; level: number; x: number; y: number; title?: string; hpMult?: number; voice?: BossVoice }
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
  /** Only at night: the dead's bosses and rituals keep the night (shared/daynight.ts); the tracker says when it falls */
  night?: boolean;
  /** Finishing this step brings the hero up to at least this level (so the first quest can teach the skill tree) */
  levelTo?: number;
  /** The new step kinds' specs (shared/questSteps.ts); `choose` also takes `npc` and `say` (the choice is made in their dialog) */
  carry?: CarrySpec; hold?: HoldSpec; pick?: PickSpec; unseen?: UnseenSpec; sync?: SyncSpec; choose?: ChoiceSpec;
  /** own kill: the boss offers a deal as it rises (server/questSteps.ts); accepting ends the step without the fight */
  bargain?: BargainSpec;
  /** talk: these NPCs, in any order (a bit each in the step count); `says` = each one's lines, else `say` */
  npcs?: string[];
  says?: Record<string, string[]>;
  /** Only for heroes whose choice is one of `v` (a branch); other heroes skip the step (questSteps.ts nextStage) */
  onlyIf?: { flag: ChoiceId; v: number[] };
  /** Lines instead of `say` by the hero's choice (questSteps.ts sayFor): the same step, other words */
  sayBy?: { flag: ChoiceId; lines: Record<number, string[]> };
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
  /**
   * Starts by itself the moment the quest before it is done, wherever the hero stands (Murat 2026-11-10: fewer trips
   * back to town, real exploration arcs). The offer is shown as word from the giver; the giver still offers it if the
   * hero was below its level then.
   */
  auto?: boolean;
  /** Lines shown where the quest ends when it ends out in the field (no hand-in): what the hero finds or learns. */
  outro?: string[];
  /** `after` by the hero's choice (a giver who remembers what you did) */
  afterBy?: { flag: ChoiceId; lines: Record<number, string> };
  /** Finishing the quest records this choice value (Penance: the Bargain paid for) */
  sets?: { flag: ChoiceId; v: number };
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
/** The four Heart Shards of the elemental wilds, one in each land (the id ends in its element). */
const shardIn = (land: string, el: string, fx: number, fy: number) => obj(`shard_${el}`, "shard", `${({ poison: "Venom", cold: "Rime", fire: "Cinder", shock: "Storm" } as Record<string, string>)[el]} Shard`, "Shatter", land, fx, fy);
const LANDS = Object.fromEntries(ELEMENT_LANDS.map((l) => [l.el, l.name])) as Record<string, string>;
export const SHARDS: QuestObject[] = [
  shardIn(LANDS.poison, "poison", 0.45, 0.55), shardIn(LANDS.cold, "cold", 0.5, 0.25), shardIn(LANDS.fire, "fire", 0.4, 0.4), shardIn(LANDS.shock, "shock", 0.5, 0.6),
];
const TARN = ELEMENT_LANDS[1];
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
        obj: `Investigate ${FZN}, ${FZD} of the village`, nag: `${FZ} lies ${FZD} of the village. Look carefully.` },
      { type: "kill", kinds: BLOB_KINDS, goal: 10, text: "Kill 10 blobs", banner: [`Blobs in ${FZN}!`, "Kill 10 and watch what they do"], obj: "Kill blobs: {n} / {goal}",
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
      "And if the lumps start creeping toward each other in your pouch, darling, don't run back to me. Find a blob that has already fused and squash that too.",
    ],
    acceptText: "I'll fetch the jelly",
    steps: [
      { type: "collect", zone: Z.farms.name, kinds: ["slime", "motherblob", "blobling"], item: "jelly", goal: 6, chance: { slime: 0.5, motherblob: 1, blobling: 0.25 },
        text: "Collect 6 Blob Jelly", banner: ["New quest", "Jelly That Crawls"], obj: "Blob Jelly: {n} / {goal}",
        nag: `{n} of {goal}. Any blob will do, but ${Z.farms.name} has plenty.` },
      { type: "kill", zone: Z.farms.name, kinds: BLOB_KINDS, fused: 2, goal: 1,
        summon: { parts: ["slime", "slime"], level: 4, ...spotIn(Z.farms.name, 0.55, 0.5) },
        text: "Squash a fused blob", banner: ["The jelly crawls in your pouch!", "The lumps creep together. Squash a fused blob"], obj: "Fused blob squashed: {n} / {goal}",
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
    ],
    outro: [
      "Tobin tumbles out of the jelly, gasping. \"You came for me! They kept melting into each other around me, bigger and bigger.\"",
      "\"And they hummed. One word, over and over. Gloam. Gloam. Gloam.\" He presses his purse into your hand and runs for home.",
    ],
    reward: { xp: 650, gold: 200, potions: 3 },
    after: "Tobin heard them say its name. The Gloam is waking. And the pieces drift west, toward the old wreck on the coast. Talk to me when you are ready.",
  },
  {
    id: "woods", title: "The Rotting Shrines", giver: "druid", zone: Z.brine.name, minLevel: 10, auto: true,
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
    ],
    outro: ["The rot seeds stir in your pouch. All of them roll the same way: down to the strand, to the wreck of the Grey Heron.", "Whatever is still in her hold is pulling every piece of the Gloam back home."],
    reward: { xp: 900, gold: 260, potions: 3 },
    after: "The Gloam's heart still beats in the wreck of the Grey Heron. Come to me when you are strong enough to face it.",
  },
  {
    id: "thorn", title: "The Gloam Awakens", giver: "druid", zone: Z.strand.name, minLevel: 12, auto: true,
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
    after: "The land is quieter thanks to you. But something troubles Morwen, she says the jelly in her flasks still hums. Go and see her when you are stronger.",
  },
  // ---- The elemental wilds (Murat 2026-11-05): the four pieces that fled when the heart burned ----
  {
    id: "fen", title: "Venom in the Fen", giver: "witch", zone: LANDS.poison, minLevel: 14,
    description: `When the Brood Heart burned, four great pieces of the Gloam tore free and fled east across the river. One sank into ${LANDS.poison}, ${zdir(ELEMENT_LANDS[0])} of Oakvale, and drank the bog's poison. Morwen wants its venom, and the shard of the heart it carries smashed.`,
    offer: [
      "Darling, you're back. Listen. My jelly still hums. Fainter, but it hums.",
      "When the heart burned, it burst. Four great pieces flew out of the fire, each with a sliver of the heart inside, and fled east over the river.",
      `One crawled into ${LANDS.poison}. The bog was already poison, and the piece drank it. Now every blob there spits venom like a toad.`,
      "Kill a few, bring me their venom sacs, and find the shard it hides. Smash it, darling. Mind the puddles, they eat boots.",
    ],
    acceptText: "I'll go to the fen",
    steps: [
      { type: "kill", zone: LANDS.poison, kinds: ["venomblob"], goal: 6, text: "Kill 6 venom blobs", banner: ["New quest", "Venom in the Fen"],
        obj: "Venom blobs: {n} / {goal}", nag: "{n} of {goal}. When one puffs up, step out of the green mark before the glob lands." },
      { type: "collect", zone: LANDS.poison, kinds: ["venomblob"], item: "venom", goal: 4, chance: { venomblob: 0.5 },
        text: "Collect 4 Venom Sacs", banner: ["Quest updated", "Collect 4 Venom Sacs"], obj: "Venom Sacs: {n} / {goal}",
        nag: "{n} of {goal} sacs. Only the venom blobs have them." },
      { type: "use", zone: LANDS.poison, objects: [SHARDS[0]], text: "Shatter the Venom Shard", banner: ["The sacs are full!", "Find and shatter the Venom Shard"],
        obj: `Shatter the Venom Shard (${LANDS.poison})`, nag: "The shard lies in the heart of the fen. Press E beside it." },
      { type: "kill", zone: LANDS.poison, kinds: ELEMENT_BLOBS, fused: 3, goal: 1,
        summon: { parts: ["venomblob", "venomblob", "healerblob"], level: 18, title: "Blightmaw", ...spotIn(LANDS.poison, 0.5, 0.45) },
        text: "Slay Blightmaw", banner: ["The shard bursts!", "Its keeper rises from the bog: slay Blightmaw"], obj: "Blightmaw slain: {n} / {goal}",
        nag: "Three blobs in one, spitting venom and mending itself. Keep moving, never stand in the puddles." },
    ],
    outro: ["The Venom Shard bursts into green smoke and the fen goes quiet. One piece fewer that remembers.", "Three more shards fled east. Morwen will want those sacs, but the trail goes on: north-east, where the frost came down."],
    reward: { xp: 2000, gold: 550, potions: 4 },
    after: "Rowan has news of the second piece, darling. Something cold.",
  },
  {
    id: "tarn", title: "The Frozen Tarn", giver: "druid", zone: LANDS.cold, minLevel: 17, auto: true,
    description: `The second piece of the Gloam crept north-east into ${LANDS.cold}, where a black tarn never thaws. Its blobs have turned to ice and blast frost at anyone who comes near. Elder Rowan asked you to find the tarn and shatter the Rime Shard.`,
    offer: [
      "Morwen told me. Four pieces, four shards of the heart. I should have seen it.",
      `The trees in the north-east have gone silent. Frost in summer, around a black tarn in ${LANDS.cold}. A piece of the Gloam lies under that ice.`,
      "Its blobs have turned cold as the tarn. When you get close they swell up and burst into a ring of frost. It will slow you, so do not let them surround you.",
      "Find the tarn, thin the frost blobs, and shatter the Rime Shard.",
    ],
    acceptText: "I'll find the tarn",
    steps: [
      { type: "reach", zone: LANDS.cold, at: { x: (TARN.x + TARN.w / 2) * TILE, y: (TARN.y + TARN.h / 2 + 1) * TILE, r: 7 * TILE, label: "The black tarn" },
        text: `Find the black tarn in ${LANDS.cold}`, banner: ["New quest", "The Frozen Tarn"], obj: `Find the black tarn (${LANDS.cold})`,
        nag: `The tarn lies in the middle of ${LANDS.cold}, ${zdir(TARN)} of Oakvale. Take the trail east from the Thornwood glade.` },
      { type: "kill", zone: LANDS.cold, kinds: ["frostblob"], goal: 8, text: "Kill 8 frost blobs", banner: ["The tarn is frozen black", "Kill 8 frost blobs"],
        obj: "Frost blobs: {n} / {goal}", nag: "{n} of {goal}. When one swells and the ring of ice appears, get out of it." },
      { type: "use", zone: LANDS.cold, objects: [SHARDS[1]], text: "Shatter the Rime Shard", banner: ["Quest updated", "Shatter the Rime Shard"],
        obj: "Shatter the Rime Shard (north shore of the tarn)", nag: "The shard stands on the north shore. Press E beside it." },
      { type: "kill", zone: LANDS.cold, kinds: ELEMENT_BLOBS, fused: 3, goal: 1,
        summon: { parts: ["frostblob", "frostblob", "warriorblob"], level: 21, title: "Rimeheart", ...spotIn(LANDS.cold, 0.5, 0.75) },
        text: "Slay Rimeheart", banner: ["The ice cracks!", "Rimeheart climbs out of the tarn"], obj: "Rimeheart slain: {n} / {goal}",
        nag: "It lunges and freezes. Fight it at range, or strike and step back before the nova." },
    ],
    outro: ["The Rime Shard cracks like river ice in spring, and the frost lifts off the hollow. Birds come back into the pines.", "Two shards remain. Smoke rises in the east, past the Keep, where the woods burn and nothing puts the fire out."],
    reward: { xp: 2500, gold: 650, potions: 4 },
    after: "Brann wants you at the forge. Something about fire that burns without wood.",
  },
  {
    id: "scar", title: "Fire in the Scar", giver: "weaponsmith", zone: LANDS.fire, minLevel: 20, auto: true,
    description: `The third piece of the Gloam burned a scar through the woods east of Greywatch Keep: ${LANDS.fire}. Its blobs breathe fire like little dragons. Brann wants their cinder hearts for his forge, and the Cinder Shard broken.`,
    offer: [
      `There's a fire burning out past the Keep that needs no wood. ${LANDS.fire}, the hunters call it now. Ash and cracked earth for a mile.`,
      "The blobs there breathe fire. Like dragons, I swear it! They rear back, and then the whole ground in front of them goes up.",
      "Their hearts don't go out when they die. Cinder hearts, hot as my forge on its best day. Gather four and keep them: they're worth the burns.",
      "And break that shard. Don't stand in front of them when they rear back.",
    ],
    acceptText: "I'll bring the cinders",
    steps: [
      { type: "kill", zone: LANDS.fire, kinds: ["fireblob"], goal: 8, text: "Kill 8 fire blobs", banner: ["New quest", "Fire in the Scar"],
        obj: "Fire blobs: {n} / {goal}", nag: "{n} of {goal}. When one rears back, the cone in front of it burns. Step to the side." },
      { type: "collect", zone: LANDS.fire, kinds: ["fireblob"], item: "cinder", goal: 4, chance: { fireblob: 0.45 },
        text: "Collect 4 Cinder Hearts", banner: ["Quest updated", "Collect 4 Cinder Hearts"], obj: "Cinder Hearts: {n} / {goal}",
        nag: "{n} of {goal} hearts. Only the fire blobs carry them." },
      { type: "use", zone: LANDS.fire, objects: [SHARDS[2]], text: "Shatter the Cinder Shard", banner: ["The hearts are glowing!", "Shatter the Cinder Shard"],
        obj: `Shatter the Cinder Shard (${LANDS.fire})`, nag: "The shard burns in the middle of the scar. Press E beside it." },
      { type: "kill", zone: LANDS.fire, kinds: ELEMENT_BLOBS, fused: 4, goal: 1,
        summon: { parts: ["fireblob", "fireblob", "warriorblob", "shooterblob"], level: 24, title: "Cindermaw", ...spotIn(LANDS.fire, 0.45, 0.5) },
        text: "Slay Cindermaw", banner: ["The scar roars!", "Cindermaw rises from the ash"], obj: "Cindermaw slain: {n} / {goal}",
        nag: "Four blobs in one, breathing fire, charging and spitting. Frost hurts it most." },
    ],
    outro: ["The Cinder Shard gutters out. The cinder hearts in your pack still glow, hot enough for Brann to quench blades in for a year.", "The last piece fled south-east, where the storms break over the crags."],
    reward: { xp: 3000, gold: 800, potions: 5 },
    after: "Rowan's waiting for you. The last piece is the worst of them, he says.",
  },
  {
    id: "storm", title: "Heart of the Storm", giver: "druid", zone: LANDS.shock, minLevel: 23, auto: true,
    description: `The last piece of the Gloam fled to ${LANDS.shock}, south-east of Redfang Hollow, where every storm in the valley breaks. Its blobs crackle with lightning and throw sparks when struck. The Storm Shard is the last sliver of the heart: shatter it before it calls the others back.`,
    offer: [
      "Three shards broken. One left, and it is the one I fear.",
      `The last piece fled to ${LANDS.shock}, south-east past Redfang Hollow. Lightning strikes there every night, and the piece has drunk it.`,
      "Its blobs are quick, and when you strike them, sparks fly off and crackle on the ground. Hit and step away, or you will dance on embers of lightning.",
      "And it has been calling. Whatever is left of the other three pieces answers it. When you break the Storm Shard, all of it will come at you at once.",
    ],
    acceptText: "I will finish it",
    steps: [
      { type: "kill", zone: LANDS.shock, kinds: ["stormblob"], goal: 8, text: "Kill 8 storm blobs", banner: ["New quest", "Heart of the Storm"],
        obj: "Storm blobs: {n} / {goal}", nag: "{n} of {goal}. Don't stand in the sparks they throw off." },
      { type: "collect", zone: LANDS.shock, kinds: ["stormblob"], item: "stormglass", goal: 3, chance: { stormblob: 0.4 },
        text: "Collect 3 Storm Glass", banner: ["Quest updated", "Collect 3 Storm Glass"], obj: "Storm Glass: {n} / {goal}",
        nag: "{n} of {goal}. Where lightning strikes a storm blob, the jelly turns to glass." },
      { type: "use", zone: LANDS.shock, objects: [SHARDS[3]], text: "Shatter the Storm Shard", banner: ["The glass hums with thunder", "Shatter the Storm Shard"],
        obj: `Shatter the Storm Shard (${LANDS.shock})`, nag: "The shard stands among the split boulders. Press E beside it." },
      { type: "kill", zone: LANDS.shock, kinds: ELEMENT_BLOBS, fused: 5, goal: 1,
        summon: { parts: ["stormblob", "fireblob", "frostblob", "venomblob", "warriorblob"], level: 27, title: "The Fourfold Gloam", ...spotIn(LANDS.shock, 0.5, 0.5) },
        text: "Destroy the Fourfold Gloam", banner: ["THE FOURFOLD GLOAM", "Every piece answers the storm"], obj: "The Fourfold Gloam destroyed: {n} / {goal}",
        nag: "Venom, frost, fire and storm in one body. Watch the ground: every move is marked before it lands." },
      back("druid", "Elder Rowan", "village bonfire", ["The storm broke over the crags and then... quiet. Real quiet, for the first time since the Grey Heron sank.", "No heart, no shards. The pieces are only blobs again, and they will stay that way. Oakvale owes you twice over, friend."], "Claim reward"),
    ],
    reward: { xp: 4000, gold: 1000, potions: 6 },
    after: "The land is quiet, truly quiet. The pieces wander alone again. May the old oaks shelter you, friend.",
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
      "By day most of them lie in the earth and only a work gang stays up. After dark they all climb out, so pick your hour.",
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
    ],
    outro: ["Round stones, every one the same size, each carved with the same sigil. These are not for building walls.", "This is catapult shot. Somebody is arming the dead for a siege, and the engines must be close."],
    reward: { xp: 600, gold: 150, potions: 2 },
    after: "Show those stones to Brann at the forge. If anyone knows siege work, he does.",
  },
  {
    id: "engines", title: "Engines of the Dead", giver: "weaponsmith", zone: BZ.quarry.name, minLevel: 8, auto: true,
    description: `The dead are building siege engines in ${BZ.quarry.name}, and their bone-wrights, the skeleton mages of ${BZ.ruins.name}, bind them with dark magic. Brann wants the engines burned and the bone-wrights put down.`,
    offer: [
      "Hale sent a runner with one of your stones. Hmph. Sigil shot. The old marshals of Greywatch used this mark.",
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
    ],
    outro: ["The last engine goes up in smoke and the bone-wrights lie in pieces. No one will rebuild them now.", "But an engine needs a target and an army needs a commander. Far to the north, a green fire is burning on the Old Watchtower."],
    reward: { xp: 800, gold: 200, potions: 2 },
    after: "Captain Hale wants you. Something about green fire on the Old Watchtower.",
  },
  {
    id: "signal", title: "Green Fire on the Tower", giver: "captain", zone: BZ.tower.name, minLevel: 10, auto: true,
    description: `A green signal fire burns on ${BZ.tower.name} every night, calling the dead to muster. Captain Hale wants it put out and wants to know who lit it.`,
    offer: [
      `Every night a green fire burns on ${BZ.tower.name}, ${zdir(BZ.tower)} of here. Every night, more of them on the roads.`,
      "It's a muster signal. The dead gather to it like soldiers to a drum.",
      "Put it out. And be careful: my scouts say when the bones are losing, they do something... unholy. If you see it, I want to know.",
      "Whatever it is, they only do it under the night sky. Douse the fire by day if you like, but wait for dark for the rest.",
    ],
    acceptText: "I'll put it out",
    steps: [
      { type: "use", zone: BZ.tower.name, objects: [BEACON], chest: false, text: "Douse the green signal fire", banner: ["New quest", "Green Fire on the Tower"],
        obj: "Douse the green signal fire", nag: "The fire is at the foot of the old tower. Press E to douse it." },
      { type: "ritual", zone: BZ.tower.name, kinds: SKELETONS, text: "Beat a pack of skeletons and watch what they do",
        banner: ["The fire is out!", "Beat a skeleton pack, and watch"], obj: "Beat a pack of 3+ skeletons and watch what they do",
        nag: "Wait for nightfall, then fight a pack of them. Hurt them badly, and see what they do when they are losing.", night: true },
      { type: "kill", zone: BZ.tower.name, kinds: ["demon"], goal: 1,
        summon: { parts: ["demon"], level: 14, title: "Bone Demon", ...spotIn(BZ.tower.name, 0.5, 0.75) },
        text: "Slay a Bone Demon", banner: ["They gave their bones to a demon!", "Slay the Bone Demon"], obj: "Bone Demon slain: {n} / {goal}",
        nag: "A demon made of their own bones, and it only walks at night. Stay out of its stomp, and bring it down.", night: true },
    ],
    outro: ["Nailed to the beacon post are marching orders, signed with the same sigil as the catapult shot: Vaeloth, Marshal of Greywatch.", "Vaeloth died three hundred years ago. Elder Rowan knows every old tale in this valley. Ask him who Vaeloth was."],
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
      "Gather the dust when you like. But the raisers are his priests of the dark: they only come out of the barrows after nightfall.",
    ],
    acceptText: "I'll go to the barrows",
    steps: [
      { type: "collect", zone: BZ.barrow.name, kinds: SKELETONS, item: "dust", goal: 5, chance: { skeleton: 0.35, crawler: 0.6, skeletonmage: 0.45 },
        text: "Collect 5 Grave Dust from the undead", banner: ["New quest", "What the Barrows Hold"], obj: "Grave Dust: {n} / {goal}",
        nag: "{n} of {goal}. The crawlers shed the most dust." },
      { type: "kill", zone: BZ.barrow.name, kinds: ["necromancer"], goal: 1,
        summon: { parts: ["necromancer"], level: 16, title: "Raiser of the Barrows", ...spotIn(BZ.barrow.name, 0.49, 0.6) },
        text: "Slay the necromancer raising the barrow kings", banner: ["Dust gathered!", "Slay the Raiser of the Barrows"], obj: "Necromancer slain: {n} / {goal}",
        nag: "After dark he stands before the old mausoleum. Kill him and his raised dead crumble with him.", night: true },
    ],
    outro: ["The raiser carried a map: Gravemoor Cemetery, deep in the south-eastern woods. The great graveyard of the old valley. A thousand graves.", "That is where the Marshal raises his army. The dust in your pouch is enough for a ward on every crypt."],
    reward: { xp: 1300, gold: 300, potions: 3 },
    after: "Captain Hale has the ward now. Gravemoor Cemetery lies deep in the south-eastern woods.",
  },
  {
    id: "gravemoor", title: "The Recruiting Ground", giver: "captain", zone: BZ.grave.name, minLevel: 15, auto: true,
    description: `Gravemoor Cemetery is where the Pale Marshal raises his recruits. Captain Hale sends you with Rowan's ward to thin the ranks, seal its four crypts and destroy what guards them.`,
    offer: [
      "Rowan's ward. Four handfuls, four crypts. It will have to do.",
      `${BZ.grave.name} lies ${zdir(BZ.grave)} of here, past the Smugglers' Path. Every grave there is a recruit waiting for its orders.`,
      "Thin their ranks, seal the crypts so no more rise, and kill whatever he has set to guard them. I'll hold the gate.",
      "Go by day if you want fewer of them about. But whatever guards those crypts will only wake once the sun is down.",
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
        nag: "At nightfall it rises before the mausoleum. Every bone the crypts held, in one body. Destroy it!", night: true },
    ],
    outro: ["Four crypts sealed. No more recruits for the Marshal.", "From the cemetery hill you see them: every skeleton on the roads turning east, marching home to Greywatch Keep."],
    reward: { xp: 1700, gold: 400, potions: 4 },
    after: "The dead are gathering at Greywatch Keep. Come to me when you're ready for the last fight.",
  },
  {
    id: "marshal", title: "The Pale Marshal", giver: "captain", zone: BZ.keep.name, minLevel: 18, auto: true,
    description: `Vaeloth, the Pale Marshal, waits in ${BZ.keep.name} with what is left of his army. Kill his lieutenants, shatter the phylactery that holds his soul, and end him. He and his necromancers only walk at night.`,
    offer: [
      `It's time. Vaeloth sits in the great hall of ${BZ.keep.name}, ${zdir(BZ.keep)} of here, with his best around him.`,
      "Rowan says as long as his phylactery stands, he can't truly die. Two of his necromancers guard it.",
      "Kill them. Shatter the phylactery. And when he comes for you, and he will, put the Pale Marshal in the ground for good.",
      "One more thing: by day his hall is half asleep and his necromancers lie with him. Go at night. That is when the Marshal holds court.",
    ],
    acceptText: "I will end his watch",
    steps: [
      { type: "kill", zone: BZ.keep.name, kinds: ["necromancer"], goal: 2, text: "Slay 2 of the Marshal's necromancers", banner: ["New quest", "The Pale Marshal"],
        obj: "Necromancers slain: {n} / {goal}", nag: "{n} of {goal}. They walk only at night. Kill them fast, before they raise more dead around you.", night: true },
      { type: "use", zone: BZ.keep.name, objects: [PHYLACTERY], text: "Shatter the Marshal's phylactery", banner: ["His guard has fallen!", "Shatter the phylactery"],
        obj: "Shatter the phylactery", nag: "It stands before the great hall. Break it!" },
      { type: "kill", zone: BZ.keep.name, kinds: ["necromancer"], goal: 1,
        summon: { parts: ["necromancer"], level: 24, title: "Vaeloth, the Pale Marshal", hpMult: 2.5, ...spotIn(BZ.keep.name, 0.5, 0.65) },
        text: "Defeat Vaeloth, the Pale Marshal", banner: ["THE PALE MARSHAL RISES", "Defeat Vaeloth"], obj: "The Pale Marshal defeated: {n} / {goal}",
        nag: "Come nightfall he's out of his hall, and he's angry. Finish him!", night: true },
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
      "Drive them off and take back what you can. Their leader is a big brute with a red-dyed beard. Rask, they call him.",
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
    ],
    outro: [
      "Rask falls into the ashes of the smokehouse. Under the stolen cod in his pack is a boy's knife, the handle carved: PELL.",
      "Old Garrick's grandson went up the Smugglers' Path to Redfang Hollow three weeks ago, to take back his boat. He never came down.",
    ],
    reward: { xp: 1500, gold: 300, potions: 3 },
    after: "Pell... come back to me when you're ready. I can't ask anyone else.",
  },
  {
    id: "chief", title: "The Redfang Chief", giver: "oldfisher", zone: RED_AREA, minLevel: 19, auto: true,
    description: `Old Garrick's grandson Pell went up to ${RED_AREA} to take back his boat and never came down. Find him, and put an end to the Redfang Chief who holds the camp together.`,
    offer: [
      "Pell's knife... A smuggler passed through last night. He says the Redfang keep a boy chained by their chief's tent. A boy with a fisherman's hands.",
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
    // once the Two Letters (SIDE_ARCS) are delivered, Garrick remembers which way it went
    afterBy: { flag: "letters", lines: {
      1: "Hale's men came for Ilka at dawn. It was the law, and the law was right. I still can't meet her mother's eye. Sit by the fire, friend.",
      2: "Not a word about Ilka, mind. As far as Saltmere knows, the tide took her. Sit by the fire, friend. Somebody left us a cask of the good stuff.",
    } },
  },
];

// ---- The Hollow Crown: the first zone's last story, once the other three are over ----

const THRONE = "The Hollow Throne";
const CROWN_DIR = dirFromVillage(HOLLOW.cx, HOLLOW.cy);
/** The three ward-stones round the Hollow Throne (shared/map.ts HOLLOW_WARDS). */
export const WARDS: QuestObject[] = HOLLOW_WARDS.map(([tx, ty], i) => objAt(`ward${i + 1}`, "ward", "Crown ward-stone", "Break", tx, ty));
/** The old kings' waystones beside the King's Way (shared/map.ts), from the forest shrine up toward the throne. */
export const KING_STONES: QuestObject[] = ([[234, 67], [247, 54], [259, 45]] as const).map(([tx, ty], i) => ({ id: `kingstone${i + 1}`, kind: "cairn" as const, name: "Crowned waystone", verb: "Read", ...spotNear(tx, ty) }));

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
const KING_END = [
  "I felt it. The whole wood breathed out at once, like a sleeper waking from a long, bad dream.",
  "The Hollow King is gone, and his crown with him. No more seals, no more grave-gold, no more whispers in the dark.",
  "You came to Oakvale a stranger and you saved this whole valley. Whatever lies beyond it, the road is yours now. Take this, with all our thanks.",
];
export const CROWN_QUESTS: QuestDef[] = [
  {
    id: "seal", title: "The Crowned Seal", giver: "druid", zone: "Whispering Woods", minLevel: 24,
    description: `Elder Rowan found the same crowned seal on the Gloam's cask, the Marshal's phylactery and the Redfang's gold. One hand moved all three. Pell heard the Redfang's paymaster speak of an old road, the King's Way, that starts at the forest shrine ${dirFromVillage(SHRINE_SPOT.x, SHRINE_SPOT.y)} of Oakvale. Follow it and read what is carved along it.`,
    offer: [
      "Sit, friend. The Gloam is scattered, the Pale Marshal is dust, the Redfang have fled. Oakvale should sleep easy. I don't.",
      "One thing has gnawed at me. The cask the Gloam came ashore in bore a seal: a crown, burned into the wood. Hale's men found the same crown carved inside the Marshal's phylactery. And the Redfang paid their debts in old gold, stamped with a crown.",
      "Three shadows, one hand. Pell heard the Redfang's paymaster: a tall figure in rusted iron who came by night, down an old road past the forest shrine. The King's Way, it called it.",
      "Follow that road. The old kings set waystones along it, and stones remember what men forget.",
    ],
    acceptText: "I'll follow the King's Way",
    steps: [
      { type: "reach", at: { x: (SHRINE_SPOT.x + 0.5) * TILE, y: (SHRINE_SPOT.y + 0.5) * TILE, r: 5 * TILE, label: "The forest shrine" }, zone: "Whispering Woods",
        text: "Go to the forest shrine on the Bandit Trail", banner: ["New quest", "The Crowned Seal"],
        obj: `Go to the forest shrine on the Bandit Trail (${dirFromVillage(SHRINE_SPOT.x, SHRINE_SPOT.y)})`, nag: "Take the Bandit Trail east into the woods. The shrine stands beside it." },
      { type: "use", zone: "Whispering Woods", objects: KING_STONES, chest: false, text: "Read the crowned waystones along the King's Way", banner: ["The King's Way", "Read the crowned waystones"],
        obj: "Waystones read: {n} / {goal}", nag: "{n} of {goal}. They stand beside the old road from the shrine, climbing north-east." },
    ],
    outro: [
      "The last waystone is older than Oakvale. Under the moss a crown is cut deep, and a name: OSTREVAR, FIRST KING OF THE VALE.",
      "Below it, fresh, scratched with a blade: WAKE THE KING. The road climbs on, into the dark woods, to a hill the old songs call the Hollow Throne.",
    ],
    reward: { xp: 2200, gold: 400, potions: 4 },
    after: "Rest and grow strong, friend. When you are ready, the Hollow King is waiting.",
  },
  {
    id: "king", title: "The Hollow King", giver: "druid", zone: THRONE, minLevel: 25, auto: true,
    description: `Ostrevar, the Hollow King, is rising from his barrow under ${THRONE}, far ${CROWN_DIR} of Oakvale up the King's Way from the forest shrine. Break the three ward-stones that feed him, and end him when he rises after dark.`,
    offer: [
      "Ostrevar. The Hollow King. So the old tale is true. When he would not give up his crown to death, the first druids sealed him alive in his barrow and set three ward-stones round it.",
      `Follow the King's Way on, ${CROWN_DIR} to ${THRONE}. The three ward-stones stand round his dais.`,
      "The wards were made to hold him, but he has turned them into his strength. Break all three and he will come out weaker. But he will come.",
      "Break the stones whenever you like. But he is of the dead now, and the dead keep the night: he will only rise from his throne after dark.",
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
        nag: "When night falls he wakes on his throne. End him!", night: true },
      // Rowan remembers what became of the Redfang's informer (Two Letters, SIDE_ARCS): other words, same step
      { ...back("druid", "Elder Rowan", "village bonfire", KING_END, "Claim reward"),
        sayBy: { flag: "letters", lines: {
          1: [KING_END[0], KING_END[1], "Hale says the girl who sold Saltmere to the Redfang was paid in that same grave-gold. The law has her now. Justice is cold comfort, but comfort all the same.", KING_END[2]],
          2: [KING_END[0], KING_END[1], "A basket of smoked fish stood at my door this morning, with no name on it. The crown's gold bought a Saltmere girl once. I think you bought her back.", KING_END[2]],
        } } },
    ],
    reward: { xp: 6000, gold: 1500, potions: 6 },
    after: "The valley is free, thanks to you. And the old stone arch outside our south gate has started to hum. Once the Hide-Mother of the Mawdeep is gone too, they say it will open. There is always a seat for you at this fire.",
  },
];

// ---- The Hide Rite: the Mawdeep Warrens under the Whispering Woods (shared/dungeon.ts) ----

const [HALLS, PENS, DENF] = FLOORS;
const pxAt = ([tx, ty]: [number, number], r: number, label: string) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, r: r * TILE, label });
const SINK_DIR = dirFromVillage(SINKHOLE.x, SINKHOLE.y);
/** Trappers wrapped in silk in the Silk Pens, and the three hide totems round the Hide-Mother's bed. */
export const SILK: QuestObject[] = COCOONS.map(([tx, ty], i) => objAt(`silk${i + 1}`, "silk", "Trapper in a silk cocoon", "Cut free", tx, ty));
export const HIDE_TOTEMS: QuestObject[] = TOTEMS.map(([tx, ty], i) => objAt(`totem${i + 1}`, "totem", "Hide totem", "Burn", tx, ty));
const BEAST_FOLK: MobKind[] = ["gnawkin", "tuskborn", "silkwretch", "duskwing"];

/**
 * The story (Murat 2026-11-05): in the Long Hunger, a winter so hard the valley ate its dogs, an old trapper-wife named
 * Ursk led Oakvale's starving hunters down into the Mawdeep, a cave under the woods, and taught them the Hide Rite:
 * sew a beast's skin into your own and its strength is yours. Rat for cunning, boar for might, wolf for the hunt.
 * They never came back up as men. Last month the ground fell in north of the Redfang trail and the Mawdeep was open
 * again. Now trappers go missing: the beast-folk take them below to be sewn into new hides, and the Hide-Mother
 * herself, more bear than woman now, waits on her bed of skins at the bottom.
 * Its own chain, open once First Steps is done; it climbs from Lv 21 to the region's ceiling, beside the elemental
 * wilds and before the Hollow Crown.
 */
export const BEAST_QUESTS: QuestDef[] = [
  {
    id: "ground", title: "Gone to Ground", giver: "captain", zone: HALLS.name, minLevel: 21,
    description: `Trappers have vanished in the woods ${SINK_DIR} of Oakvale, where the ground fell in north of the Redfang trail. Captain Hale wants to know what took them.`,
    offer: [
      "You've a strong arm and a stronger stomach. Good. I need both.",
      `Four trappers went out past the Redfang trail last week, ${SINK_DIR} of here. None came back. A hunter found the ground torn open there, a great sinkhole, with claw marks all round its lip.`,
      "Something dragged them down. Something with hands AND claws. Find out what, and kill as much of it as you can.",
    ],
    acceptText: "I'll go down",
    steps: [
      { type: "reach", at: pxAt([SINKHOLE.x, SINKHOLE.y], 4, "Mawdeep Sinkhole"), zone: "Mawdeep Sinkhole", text: "Find the sinkhole in the Whispering Woods",
        banner: ["New quest", "Gone to Ground"], obj: `Find the sinkhole north of the Redfang trail (${SINK_DIR})`,
        nag: "Take the trail toward Redfang Hollow. The sinkhole is in the trees just north of it." },
      { type: "reach", at: pxAt(chamberAt(HALLS, 0), 6, HALLS.name), zone: HALLS.name, text: "Climb down into the Mawdeep",
        banner: ["The Mawdeep", "Climb down the rope"], obj: "Climb down the rope into the dark", nag: "The rope hangs into the sinkhole. Climb down." },
      { type: "kill", kinds: BEAST_FOLK, zone: HALLS.name, goal: 10, text: "Kill 10 beast-folk", banner: ["They were people once", "Kill 10 beast-folk"],
        obj: "Beast-folk slain: {n} / {goal}", nag: "{n} of {goal}. The tunnels are full of them." },
      { type: "collect", item: "charm", kinds: BEAST_FOLK, chance: { gnawkin: 0.3, tuskborn: 0.45, silkwretch: 0.4, duskwing: 0.4 }, zone: HALLS.name, goal: 4,
        text: "Take 4 Hide Charms from the beast-folk", banner: ["Bone and hide", "Take 4 Hide Charms"], obj: "Hide Charms: {n} / {goal}",
        nag: "{n} of {goal}. They wear them sewn into their skin." },
    ],
    outro: ["The charms are bone needle, gut thread and a tuft of beast, sewn right into the skin. Some are fresh: the stitches still wet.", "Someone is doing the old Hide Rite again, down here, on the missing trappers. If they took them last week, some may still be breathing, deeper down."],
    reward: { xp: 1800, gold: 300, potions: 3 },
    after: "Burn your clothes when you're done down there. Hide smell never comes out.",
  },
  {
    id: "pens", title: "The Silk Pens", giver: "witch", zone: PENS.name, minLevel: 23, auto: true,
    description: `The beast-folk keep their captives wrapped in silk on the Mawdeep's second floor, the Silk Pens. Cut the trappers free and kill Gorehowl the Packlord, who keeps the pens.`,
    offer: [
      "The rite takes days. A hide must be cured, a man must be starved first so the beast takes. If they took the trappers last week, some may still be breathing.",
      "My grandmother's book says they kept their catch below the first halls, wound in spider silk like flies in a larder. The Silk Pens.",
      "And a wolf-man guarded them. Gorehowl, the first of Ursk's hunters, the Packlord. If he still lives he'll hear you coming. He howls, and the little rat-things come running.",
      "Cut the trappers loose. Kill the wolf. They will find their own way up the rope.",
    ],
    acceptText: "I'll cut them free",
    steps: [
      { type: "reach", at: pxAt(chamberAt(PENS, 0), 6, PENS.name), zone: PENS.name, text: "Go down to the Silk Pens",
        banner: ["New quest", "The Silk Pens"], obj: "Find the stair down at the far end of the Gnawing Halls",
        nag: "The stair down is at the far end of the Gnawing Halls, past the boar wallow." },
      { type: "use", zone: PENS.name, objects: SILK, chest: false, text: "Cut the trappers free of the silk", banner: [PENS.name, "Cut the trappers free"],
        obj: "Trappers cut free: {n} / {goal}", nag: "{n} of {goal}. They hang in the pens off the side tunnels." },
      { type: "kill", kinds: ["packlord"], zone: "Gorehowl's Lair", goal: 1, text: "Kill Gorehowl the Packlord", banner: ["A howl in the dark", "Kill Gorehowl the Packlord"],
        obj: "Gorehowl the Packlord slain: {n} / {goal}", nag: "His lair is the big chamber on the east side of the pens. Mind his pounce." },
    ],
    outro: ["Gorehowl falls, and the freed trappers stumble for the rope and the daylight. Wenn, the eldest, grips your arm before she goes.", "\"The Mother,\" she whispers. \"They were waiting for the Mother to wake and choose which beast each of us would be. She sleeps at the bottom.\""],
    reward: { xp: 2400, gold: 380, potions: 4 },
    after: "Wenn is sleeping now. Mostly. She still screams when the dogs bark.",
  },
  {
    id: "mother", title: "The Hide-Mother", giver: "captain", zone: DENF.name, minLevel: 25, auto: true,
    description: `At the bottom of the Mawdeep the Hide-Mother sleeps on a bed of skins, ringed by three hide totems that keep the rite alive. Burn the totems, and end her when she wakes.`,
    offer: [
      "Wenn told me the rest. At the very bottom, past a byre where a bull-man stamps, there's a den. A great bed of hides, and on it something that was a woman once and is mostly bear now.",
      "Ursk. The Hide-Mother. The same Ursk from the Long Hunger, three hundred years gone. The rite keeps her. Three totems of bone and skin stand round her bed, and as long as they stand the rite goes on.",
      "Burn the totems. She'll wake, and she will be angry. Watch the roof when she rages: Wenn says the whole den shakes.",
      "End it. For the trappers, and for the hunters she took the first time.",
    ],
    acceptText: "I'll end the rite",
    steps: [
      { type: "reach", at: pxAt([DEN.x, DEN.y], 11, "The Hide-Mother's Bed"), zone: DENF.name, text: "Find the Hide-Mother's den",
        banner: ["New quest", "The Hide-Mother"], obj: "Go down to the bottom of the Mawdeep and find her den",
        nag: "The stair to the den is at the far end of the Silk Pens, past Gorehowl's lair." },
      { type: "use", zone: DENF.name, objects: HIDE_TOTEMS, chest: false, text: "Burn the three hide totems", banner: ["The Hide-Mother's Bed", "Burn the three hide totems"],
        obj: "Hide totems burned: {n} / {goal}", nag: "{n} of {goal}. They stand round her bed." },
      { type: "kill", kinds: ["hidemother"], zone: DENF.name, goal: 1, own: true,
        summon: { parts: ["hidemother"], level: 30, title: "Grandam Ursk, the Hide-Mother", hpMult: 2, x: (DEN.x + 0.5) * TILE, y: (DEN.y - 1.5) * TILE },
        text: "Defeat the Hide-Mother", banner: ["THE HIDE-MOTHER WAKES", "Defeat Grandam Ursk"], obj: "The Hide-Mother defeated: {n} / {goal}",
        nag: "She is awake. End her!",
        // The Bargain (docs/quest-concepts-progress.md #6): as she rises she offers a deal; taking it ends the step (draft text)
        bargain: { flag: "bargain", accept: 1, refuse: 2, trait: "beast",
          say: [
            "Hush, little hunter. I fed this valley through the Long Hunger, and the hunters who followed me down never came up as men.",
            "You could. Let me sleep, and I will sew a bear's thick hide into yours. Winter will never find you hungry again.",
            "Tell your captain I am dead. Men always want to believe it.",
          ],
          options: [{ label: "Take the hide. Let her sleep", v: 1 }, { label: "Refuse. The rite ends tonight", v: 2 }] } },
      { ...back("captain", "Captain Hale", "east gate", [
        "You're back. You're... mostly you. Good.",
        "The hunters say the woods went quiet last night. Not a rat-squeal, not a howl. Even the sinkhole stopped breathing out that warm stink.",
        "Ursk is gone and her rite with her. Whatever's left down there are beasts now, nothing more. Take this. You've earned the whole valley's thanks, and the trappers' most of all.",
      ], "Claim reward"),
        // took Ursk's bargain: Hale pays, coldly (draft text; dialog only, nothing is blocked)
        sayBy: { flag: "bargain", lines: { 1: [
          "You're back. The woods went quiet, they tell me. Not a squeal, not a howl.",
          "Wenn smelled the den on you when you came up the rope. Not the smoke. The hide.",
          "You say the rite is ended, and I'll write it down so. The watch pays what it promised. Take it and go.",
        ] } } },
    ],
    reward: { xp: 4200, gold: 900, potions: 5 },
    after: "The trappers have taken to wearing bells. And the old stone arch outside Oakvale's south gate hums at night now. Once the Hollow King is gone too, they say it will open.",
    afterBy: { flag: "bargain", lines: {
      1: "The trappers wear bells now, and they cross the street when they hear you coming. The old arch outside the south gate hums at night; once the Hollow King is gone too, they say it will open.",
    } },
  },
];

// ---- The Second Sun: Act 2, the Sunscar (shared/desert.ts), told from Kel Ashar ----

/** Where things are, said from Kel Ashar (the Sunscar's own compass: Oakvale is a world away). */
function dirFromKel(tx: number, ty: number): string {
  const kx = (KEL_ASHAR.x0 + KEL_ASHAR.x1) / 2, ky = D((KEL_ASHAR.y0 + KEL_ASHAR.y1) / 2);
  const k = (Math.round(Math.atan2(ty - ky, tx - kx) / (Math.PI / 4)) + 8) % 8;
  return ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"][k];
}
const kdir = (name: string) => { const z = zoneByName(name); return dirFromKel(z.x + z.w / 2, z.y + z.h / 2); };
const areaPx = (name: string, r: number, label = name) => { const z = zoneByName(name); return { x: (z.x + z.w / 2) * TILE, y: (z.y + z.h / 2) * TILE, r: r * TILE, label }; };
/** Sun-glass sigils the Veiled Circle drove into the oases: they drink the water and send it east to the Furnace. */
export const PALM_SIGILS: QuestObject[] = [[0.2, 0.5], [0.55, 0.14], [0.82, 0.72]].map(([fx, fy], i) => obj(`sigil${i + 1}`, "sigil", "Sun-glass sigil", "Shatter", "Palmshade Oasis", fx, fy));
export const MIRAGE_SIGILS: QuestObject[] = [[0.15, 0.3], [0.5, 0.85], [0.86, 0.35]].map(([fx, fy], i) => obj(`sigil${i + 4}`, "sigil", "Sun-glass sigil", "Shatter", "Mirage Wells", fx, fy));
/** Kharsun's sealed cisterns: their carvings tell how the old city died. */
export const CISTERNS: QuestObject[] = [[0.22, 0.3], [0.5, 0.62], [0.8, 0.4]].map(([fx, fy], i) => obj(`cistern${i + 1}`, "cistern", "Sealed cistern", "Read the carvings", "Kharsun, the Buried City", fx, fy));
const SEFA = ["wellkeeper", "Sefa", "the spring in the market"] as const;
const RAKHIM = ["sandcaptain", "Captain Rakhim", "Kel Ashar's south gate"] as const;

/**
 * The story (Murat 2026-11-08: a desert storyline with a final boss). A thousand years ago Kharsun was the jewel of the
 * Sunscar, ruled by the Veiled Circle, sun-priests who swore the desert could have a second sun and they would be its
 * gods. They built the Sun Furnace on the Thornspire and fed it Kharsun's river. The Furnace caught for one night; by
 * morning the river was steam and the city was burning, and the sand buried what was left. The Circle was driven out
 * and the waygate between the Sunscar and the green valley went to sleep.
 * Now the gate has woken (the hero walked through it), Kel Ashar's spring is sinking a finger a day, and the oases are
 * drying. The Circle is back: they pay the Dustrider raiders, drive sun-glass sigils into the oases to drink them, dig
 * Kharsun's cisterns for the old water-script, brand the camel-folk to serve them, and carry it all up to the Furnace.
 * Sefa the Well-Keeper knows the old stories; Captain Rakhim of the Sand Watch trusts no one who comes out of the gate.
 * The chain opens once the first zone's last bosses are down (the same as the waygate, shared/act2.ts) and climbs
 * from Lv 30 by the Sunstone to the Veiled Sanctum at Lv 44, and its finale at the Sun Furnace (Lv 46): Ishael, the Sunwright.
 */
export const SUN_QUESTS: QuestDef[] = [
  {
    id: "stranger", title: "Out of the Old Gate", giver: "sandcaptain", zone: "The Glasswind Flats", minLevel: 30,
    description: "Captain Rakhim of the Sand Watch doesn't trust anyone who walks out of the waygate. Clear the scorpions off the caravan road from the Sunstone Circle and he might.",
    offer: [
      "Hold there. You came out of the old gate. Nobody has come out of that gate in a thousand years, and the last time it woke, Kharsun burned.",
      "So forgive me if I don't hand you the keys to the town.",
      "The flats between the Sunstone and our walls are crawling with scorpions. More than I've seen in twenty years, as if something drove them out of the deep sand. Thin them out and we'll talk.",
    ],
    acceptText: "I'll clear the road",
    steps: [
      { type: "kill", kinds: ["scorpion"], zone: "The Glasswind Flats", goal: 8, text: "Kill 8 Dune Scorpions on the Glasswind Flats", banner: ["New quest", "Out of the Old Gate"],
        obj: "Dune Scorpions slain: {n} / {goal}", nag: "{n} of {goal}. They hunt the flats round the Sunstone. Mind the sting." },
      back(SEFA[0], SEFA[1], SEFA[2], [
        "So you're the one who came through the gate. Rakhim sent you to me, which means he's decided you're not a demon. That's high praise, from Rakhim.",
        "I'm Sefa. I keep the spring. My mother kept it, and hers. Look at the stones round the water: see the dark line, a hand above the surface? That was the water at the new moon.",
        "It sinks a finger a day. And it started the night your gate woke.",
      ], "Claim reward"),
    ],
    reward: { xp: 8000, gold: 400, potions: 3 },
    after: "Drink while you can, stranger. Nobody knows how long the spring will last.",
  },
  {
    id: "thirst", title: "The Thirsting Spring", giver: "wellkeeper", zone: "Palmshade Oasis", minLevel: 31,
    description: `Kel Ashar's spring is sinking, and Palmshade Oasis ${kdir("Palmshade Oasis")} of town is drying too. Caravaners saw glass pillars humming by its water at night.`,
    offer: [
      "It isn't only our spring. Palmshade, the big oasis west of town, has lost a man's height of water since the gate woke. The palms are going brown at the crown.",
      "A caravan came in last night. They said there are pillars of glass standing in the shallows at Palmshade, humming, hot to the touch. And Dustriders camped round them like dogs round a bone.",
      "Pillars of glass by water... my grandmother had a word for that. Sun-glass. Go and look. Break them if you can.",
    ],
    acceptText: "I'll go to Palmshade",
    steps: [
      { type: "reach", at: areaPx("Palmshade Oasis", 9), zone: "Palmshade Oasis", text: "Go to Palmshade Oasis", banner: ["New quest", "The Thirsting Spring"],
        obj: `Go to Palmshade Oasis (${kdir("Palmshade Oasis")} of Kel Ashar)`, nag: "Palmshade is out past the west gate. Follow the palms." },
      { type: "use", zone: "Palmshade Oasis", objects: PALM_SIGILS, chest: false, text: "Shatter the sun-glass sigils", banner: ["Sun-glass", "Shatter the sigils"],
        obj: "Sigils shattered: {n} / {goal}", nag: "{n} of {goal}. They stand by the water, humming." },
      { type: "collect", item: "veil", kinds: ["nomad"], chance: { nomad: 0.4 }, zone: "Palmshade Oasis", goal: 4, text: "Take 4 Veil Tokens from the Dustriders",
        banner: ["Hired blades", "Take 4 Veil Tokens"], obj: "Veil Tokens: {n} / {goal}", nag: "{n} of {goal}. The Dustriders who guarded the sigils carry them." },
    ],
    outro: ["Indigo cloth, a gold sun stitched on it, and the sun has a veil over its face. The mark of the Veiled Circle.", "Every child in Kel Ashar knows the rhyme: \"The veiled ones lit a second sun, and Kharsun drank it, every one.\" It seems it was no rhyme."],
    reward: { xp: 9600, gold: 450, potions: 3 },
    after: "The water at Palmshade has stopped sinking. Ours hasn't. There must be more of those sigils.",
  },
  {
    id: "silver", title: "Dustrider Silver", giver: "sandcaptain", zone: "Dustrider Camp", minLevel: 33, auto: true,
    description: `The Dustriders are paid to guard the Circle's sigils. Raid their camp ${kdir("Dustrider Camp")} of Kel Ashar and find out who pays them.`,
    offer: [
      "Word reached me about those tokens. The Veiled Circle. Children's rhymes. I don't believe in rhymes, stranger. I believe in silver.",
      "Dustriders don't guard anything for free. Somebody is paying them, and paying well: they've stopped raiding our caravans, and a Dustrider who stops raiding is a Dustrider who's being paid more not to.",
      "Their camp is in the Red Wastes, north-west, past Jackal Springs. Hit it hard. Their chief keeps his letters close: bring me one.",
    ],
    acceptText: "I'll raid the camp",
    steps: [
      { type: "kill", kinds: ["nomad"], zone: "Dustrider Camp", goal: 12, text: "Raid the Dustrider Camp: kill 12 Dustriders", banner: ["New quest", "Dustrider Silver"],
        obj: "Dustriders slain: {n} / {goal}", nag: `{n} of {goal}. Their tents are ${kdir("Dustrider Camp")} of town, in the Red Wastes.` },
      { type: "collect", item: "letter", kinds: ["nomad"], chance: { nomad: 0.15 }, zone: "Dustrider Camp", goal: 1, text: "Find a sealed letter on the Dustriders",
        banner: ["Who pays them?", "Find a sealed letter"], obj: "Sealed letters: {n} / {goal}", nag: "Their riders carry the paymaster's letters. Keep looking." },
      back(RAKHIM[0], RAKHIM[1], RAKHIM[2], [
        "Indigo wax. A sun with a veil over its face. Sefa's rhyme again.",
        "'To the riders of the Red Wastes: guard the glass at Palmshade and the Wells. Let no one near the water. Silver on the new moon, as before. By the hand of the Sunwright.'",
        "The Sunwright. All right, stranger. I believe in rhymes now. I don't like it.",
      ], "Claim reward"),
    ],
    reward: { xp: 10800, gold: 500, potions: 3 },
    after: "The Sunwright. Whoever that is, they write a fine hand for a demon.",
  },
  {
    id: "kharsun", title: "What Kharsun Remembers", giver: "wellkeeper", zone: "Kharsun, the Buried City", minLevel: 36,
    description: `Sefa says the Circle ruled Kharsun, ${kdir("Kharsun, the Buried City")} of Kel Ashar, before it burned. Its sealed cisterns hold carvings of how the city died. The Sand-Dead guard them.`,
    offer: [
      "I asked the old women. All of them, even the ones who don't like me. And they told me what their grandmothers told them.",
      "Kharsun was the Circle's city. The veiled priests swore the desert could have a second sun, and they would be its gods. They built a furnace on the Thornspire and fed it the whole river of Kharsun.",
      "It burned for one night. By morning the river was steam and the city was ash, and the sand came down and buried it. The dead never left. They walk at night.",
      "The cisterns of Kharsun were sealed with carvings, the water-script, to tell the water where to go. If the Circle is back, they've been reading them. Read them first.",
    ],
    acceptText: "I'll read the carvings",
    steps: [
      { type: "kill", kinds: ["sanddead"], zone: "Kharsun, the Buried City", goal: 12, text: "Put down 12 of the Sand-Dead", banner: ["New quest", "What Kharsun Remembers"],
        obj: "Sand-Dead put down: {n} / {goal}", nag: "{n} of {goal}. They rise thickest at night.", hint: "The Sand-Dead rise mostly at night" },
      { type: "use", zone: "Kharsun, the Buried City", objects: CISTERNS, chest: true, text: "Read the carvings on 3 sealed cisterns", banner: ["Kharsun", "Read the water-script"],
        obj: "Cisterns read: {n} / {goal}", nag: "{n} of {goal}. They're sunk among the ruins, rimmed with carvings." },
    ],
    outro: ["Three carvings. The river, running. The river running UP, onto the mountain, into a mouth. A second sun over a burning city.", "And at the edge, fresh chisel marks. Someone copied the water-script, not long ago. The Circle is doing it again, and the oases are the river this time."],
    reward: { xp: 12000, gold: 560, potions: 4 },
    after: "I've stopped singing the rhyme. The children haven't. I can't bear to tell them.",
  },
  {
    id: "brands", title: "Brands of the Sun", giver: "sandcaptain", zone: "The Humpback Mesas", minLevel: 38, auto: true,
    description: `The camel-folk of the Humpback Mesas, ${kdir("The Humpback Mesas")} of Kel Ashar, traded with the town for a hundred years. Now they attack every caravan, and they bear burns shaped like a veiled sun.`,
    offer: [
      "The camel-folk of the mesas are an old people. Proud, slow to anger, and they never forget a debt. We've traded salt for their wool since before my grandfather.",
      "Three caravans in a month, all hit by camel-folk. The drivers who lived say their eyes were wrong, glassy, and every one of them had a burn on the neck. A sun with a veil.",
      "The Circle has branded them like cattle. Put the branded ones down, it's a mercy. And take their brands, so the clans' elders can see what was done to their people.",
    ],
    acceptText: "I'll go to the mesas",
    steps: [
      { type: "kill", kinds: ["camelfolk"], zone: "The Humpback Mesas", goal: 10, text: "Kill 10 branded Camel-Men", banner: ["New quest", "Brands of the Sun"],
        obj: "Branded Camel-Men slain: {n} / {goal}", nag: `{n} of {goal}. The mesas are ${kdir("The Humpback Mesas")} of town, beyond the north gate. Mind their stamp.` },
      { type: "collect", item: "brand", kinds: ["camelfolk"], chance: { camelfolk: 0.4 }, zone: "The Humpback Mesas", goal: 4, text: "Take 4 Sun Brands",
        banner: ["Branded", "Take 4 Sun Brands"], obj: "Sun Brands: {n} / {goal}", nag: "{n} of {goal}. The brand-plates are sewn into their harness." },
    ],
    outro: ["The brass brand-plates are still warm, and they hum like the sigils. Whatever the Circle burned into the camel-folk pulls at them toward the east.", "East. Everything goes east: Mirage Wells, and then the Thornspire."],
    reward: { xp: 13200, gold: 620, potions: 4 },
    after: "The clan elders came at dawn. They sat by the spring with Sefa all morning and didn't say a word. Then they left east, armed.",
  },
  {
    id: "wells", title: "Mirage Wells", giver: "wellkeeper", zone: "Mirage Wells", minLevel: 41, auto: true,
    description: `Mirage Wells, the last oasis before the Thornspire, ${kdir("Mirage Wells")} of Kel Ashar, has sun-glass in it too, and the Veiled Circle's adepts tend it themselves.`,
    offer: [
      "Our spring dropped two fingers last night. Two. The sigils at Palmshade are broken, so it must be the Wells, out east past the Saffron Dunes.",
      "A water-finder came in from there with burns on his hands. He says men in indigo robes stand round the glass and sing to it, and the water rises off it like steam and blows east.",
      "Those are no hired blades, stranger. Those are the Circle. Break their glass, and break them.",
    ],
    acceptText: "I'll go to the Wells",
    steps: [
      { type: "reach", at: areaPx("Mirage Wells", 8), zone: "Mirage Wells", text: "Go to Mirage Wells", banner: ["New quest", "Mirage Wells"],
        obj: `Go to Mirage Wells (${kdir("Mirage Wells")} of Kel Ashar)`, nag: "Out the east gate, past the Saffron Dunes. Look for the shimmer." },
      { type: "use", zone: "Mirage Wells", objects: MIRAGE_SIGILS, chest: true, text: "Shatter the sun-glass sigils at the Wells", banner: ["Sun-glass", "Shatter the sigils"],
        obj: "Sigils shattered: {n} / {goal}", nag: "{n} of {goal}. They stand round the water." },
      { type: "kill", kinds: ["veiled"], zone: "Mirage Wells", goal: 6, text: "Kill 6 Veiled Adepts", banner: ["The Veiled Circle", "Kill 6 Veiled Adepts"],
        obj: "Veiled Adepts slain: {n} / {goal}", nag: "{n} of {goal}. They throw sun-fire. Close in fast." },
    ],
    outro: ["The last sigil shatters and the water at the Wells stops steaming. Far behind you, Kel Ashar's spring will rise tonight.", "But the Circle has had a month of the oases. Whatever they were filling on the Thornspire might be full already."],
    reward: { xp: 14400, gold: 700, potions: 4 },
    after: "Listen. The spring is singing again. It does that, when it's full.",
  },
  {
    id: "sanctum", title: "The Veiled Sanctum", giver: "sandcaptain", zone: "The Veiled Sanctum", minLevel: 44, auto: true,
    description: `The Veiled Circle's sanctum is hidden high in the Thornspire Heights, ${kdir("The Veiled Sanctum")} of Kel Ashar, below the Sun Furnace. Break it, and take the key to the Furnace.`,
    offer: [
      "The camel-clans found it. A sanctum cut into the Thornspire, just below the peak, guarded by more adepts than they could count. They lost good people finding it.",
      "Above it is the Furnace. The clans say it's warm. A mountain-top, at night, warm.",
      "Go up. Break the sanctum. Their adepts carry the keys to the Furnace stair: take one. And stranger: whatever the Sunwright is, don't let it finish.",
    ],
    acceptText: "I'll climb the Thornspire",
    steps: [
      { type: "reach", at: areaPx("The Veiled Sanctum", 9), zone: "The Veiled Sanctum", text: "Find the Veiled Sanctum in the Thornspire Heights", banner: ["New quest", "The Veiled Sanctum"],
        obj: `Find the Veiled Sanctum (${kdir("The Veiled Sanctum")} of Kel Ashar, high in the Thornspire)`, nag: "Take the trail up into the Thornspire past Mirage Wells." },
      { type: "kill", kinds: ["veiled"], zone: "The Veiled Sanctum", goal: 12, text: "Break the sanctum: kill 12 Veiled Adepts", banner: ["The Veiled Sanctum", "Kill 12 Veiled Adepts"],
        obj: "Veiled Adepts slain: {n} / {goal}", nag: "{n} of {goal}. Fight them in the doorways, where they can't all see you." },
      { type: "collect", item: "key", kinds: ["veiled"], chance: { veiled: 0.2 }, zone: "The Veiled Sanctum", goal: 1, text: "Take a Furnace Key from an adept",
        banner: ["The stair above", "Take a Furnace Key"], obj: "Furnace Key: {n} / {goal}", nag: "The adepts carry them. One of them must." },
    ],
    outro: ["The key is sun-glass, warm in your hand and getting warmer.", "In the empty sanctum a voice lingers in the stone, calm and kind, like a teacher's: \"Not long now, children. Not long and the sky will have two eyes.\""],
    reward: { xp: 16800, gold: 900, potions: 5 },
    after: "Rest first. Whatever waits at the Furnace has waited a thousand years. It can wait for you to eat.",
  },
  {
    // the finale: Act 2's final boss (SUNWRIGHT in shared/constants.ts)
    id: "secondsun", title: "The Second Sun", giver: "wellkeeper", zone: "The Sun Furnace", minLevel: 46, auto: true,
    description: `The Sunwright waits at the Sun Furnace on top of the Thornspire, ${kdir("The Sun Furnace")} of Kel Ashar. Climb the Furnace Stair from the Veiled Sanctum and put out the second sun before it is lit.`,
    offer: [
      "A key of sun-glass, the clans say. My grandmother had a bead of it. She said it was a tear the sun cried over Kharsun.",
      "I know the Sunwright's name now. Ishael. She was a well-keeper's daughter, from Kel Ashar. She learned her letters at this spring. From me.",
      "She was the cleverest child I ever taught, and the kindest. She cried every winter, for the children in the tents who were cold at night.",
      "She thinks a second sun will save them. It burned Kharsun to glass the first time. Go up, stranger. Stop her. And if you can... tell her the spring forgives her.",
    ],
    acceptText: "I'll climb to the Furnace",
    steps: [
      { type: "reach", at: { x: (FURNACE.x + 0.5) * TILE, y: (D(FURNACE.y) + FURNACE.r * 0.8) * TILE, r: 4 * TILE, label: "The Sun Furnace" }, zone: "The Sun Furnace",
        text: "Climb the Furnace Stair to the Sun Furnace", banner: ["New quest", "The Second Sun"],
        obj: `Climb to the Sun Furnace (${kdir("The Sun Furnace")} of Kel Ashar, above the Veiled Sanctum)`, nag: "The Furnace Stair starts behind the Veiled Sanctum." },
      { type: "kill", zone: "The Sun Furnace", kinds: ["sunwright"], goal: 1,
        summon: { parts: ["sunwright"], level: 50, title: "Ishael, the Sunwright", hpMult: 2, x: (FURNACE.x + 0.5) * TILE, y: (D(FURNACE.y) - 1) * TILE },
        text: "Defeat Ishael, the Sunwright", banner: ["THE SUNWRIGHT TURNS", "Defeat Ishael"], obj: "The Sunwright defeated: {n} / {goal}",
        nag: "Kill her choir before she calls noon, then stand in her shadow." },
      back(SEFA[0], SEFA[1], SEFA[2], [
        "I felt it go out. The whole desert sighed, like a sleeper turning over. And the nights are cold again. Good. Cold is honest.",
        "The spring is full to the brim. The children were splashing in it at dawn. The ordinary dawn, with one sun.",
        "Ishael... no. Let me say it to her myself, at the water, where she learned to read. Thank you, stranger. Kel Ashar is yours, as long as it stands.",
      ], "Claim reward"),
    ],
    reward: { xp: 36000, gold: 2000, potions: 8 },
    after: "Come and drink whenever you like. The spring remembers who saved it.",
  },
];

// ---- Zone quests (Murat 2026-11-10, a playtester's feedback: "denser acts, more zone quests, fewer courier and
// back-and-forth quests, real exploration arcs") ----
//
// Each arc is given by someone who lives out in the zone (shared/npcs.ts), not in a village. Its quests follow one
// trail on through the zone and the ones beside it, each starting by itself where the last one ended (QuestDef.auto),
// and the last one ends out in the field with a named monster: no walk back to hand anything in. Rewards are a little
// under a story quest's (Murat 2026-11-08 wants levelling to stay slow).

/** A zone quest's reward: about a third of a level's XP (half for an arc's last fight). */
const arcReward = (level: number, boss = false): Reward => ({
  xp: Math.round((xpStep(level) * (boss ? 0.5 : 0.35)) / 10) * 10,
  gold: Math.round((level * (level >= 30 ? 14 : 12) * (boss ? 1.5 : 1)) / 5) * 5,
  potions: boss ? 3 : 2,
});
const at = (tx: number, ty: number, r: number, label: string) => { const p = spotNear(tx, ty); return { x: p.x, y: p.y, r: r * TILE, label }; };
const near = (id: string, kind: QuestObjectKind, name: string, verb: string, tx: number, ty: number): QuestObject => ({ id, kind, name, verb, ...spotNear(tx, ty) });
const sumAt = (tx: number, ty: number) => spotNear(tx, ty);

// -- Act 1: the Hunter's Camp → Goldenreach Farms → Mirror Pond (Lv 3-5) --
const HUNT_CLUES = [near("hunt_quiver", "clue", "Dropped quiver", "Search", 25, 26), near("hunt_snare", "clue", "Torn snare line", "Search", 21, 30), near("hunt_cloak", "clue", "Slimed hunting cloak", "Search", 17, 35)];
const KIT_COCOON = near("hunt_kit", "nest", "Kit, stuck fast in a heap of jelly", "Pull free", 36, 66);
const EWAN_HIDE = at(24, 86, 4, "Ewan's hide");
const HUNT_QUESTS: QuestDef[] = [
  {
    id: "coldashes", title: "Cold Ashes", giver: "huntsman", zone: "Hunter's Camp", minLevel: 3,
    description: "Huntmaster Bryn's two trackers, Ewan and Kit, went after a blob that swallowed a whole deer. Their fire is three nights cold. Follow their trail south from the Hunter's Camp.",
    offer: [
      "Keep your voice down, the deer spook. Not that there are many left.",
      "A blob the size of a cart swallowed a full-grown hart by the farms. Ewan and Kit went after it. That was three nights ago, and their fire's cold.",
      "Their trail runs south toward the farms. Read it for me: what they dropped, where they ran. And kill whatever slimed it.",
    ],
    acceptText: "I'll follow the trail",
    steps: [
      { type: "use", zone: "Oakvale Countryside", objects: HUNT_CLUES, chest: false, text: "Follow the trackers' trail south and search what they dropped", banner: ["New quest", "Cold Ashes"],
        obj: "Trail signs searched: {n} / {goal}", nag: "{n} of {goal}. The trail runs south from the camp toward the farms." },
      { type: "kill", zone: "Goldenreach Farms", kinds: BLOB_KINDS, goal: 6, text: "Kill 6 blobs on the slimed trail", banner: ["Slime on everything", "Kill 6 blobs along the trail"],
        obj: "Blobs slain: {n} / {goal}", nag: "{n} of {goal}." },
    ],
    outro: ["Past the farm fence the trail turns to a wide, glistening drag mark, as if something heavy was pulled through the barley.", "There is a boot print in the slime. Small. Kit's."],
    reward: arcReward(3),
    after: "Follow the drag mark. Bring my lads home if you can.",
  },
  {
    id: "dragmark", title: "The Drag Mark", giver: "huntsman", zone: "Goldenreach Farms", minLevel: 4, auto: true,
    description: "The drag mark leads through Goldenreach Farms to something huge and full. Kit may be inside it.",
    offer: ["The drag mark runs on through the barley toward the old pond road.", "At the end of it something huge is sleeping off a big meal. Something with a boot sticking out of it."],
    acceptText: "On my way",
    steps: [
      { type: "kill", zone: "Goldenreach Farms", kinds: BLOB_KINDS, goal: 1, own: true,
        summon: { parts: ["motherblob", "slime", "slime"], level: 5, title: "The Gorged One", ...sumAt(34, 64) },
        text: "Slay the Gorged One at the end of the drag mark", banner: ["New quest", "The Drag Mark"], obj: "The Gorged One slain: {n} / {goal}",
        nag: "It lies at the south end of the farms." },
      { type: "use", zone: "Goldenreach Farms", objects: [KIT_COCOON], chest: false, text: "Pull Kit out of the jelly", banner: ["It burst!", "Pull Kit out of the jelly"],
        obj: "Pull Kit free", nag: "Kit is stuck in what is left of it." },
    ],
    outro: ["Kit coughs up half a pond. \"Ewan... Ewan went on after the others. Up to Mirror Pond. He said the big ones go there to spit.\"", "He limps off north toward the camp. The pond is just south of here."],
    reward: arcReward(4),
    after: "Kit's home. Find Ewan.",
  },
  {
    id: "lastarrow", title: "Ewan's Last Arrow", giver: "huntsman", zone: "Mirror Pond", minLevel: 5, auto: true,
    description: "Ewan followed the blobs to Mirror Pond. The shooter blobs there spit his own arrows back.",
    offer: ["Mirror Pond, Kit said. Ewan went there alone with a bow and twelve arrows.", "If he's still alive, he's in his hide in the reeds. If the shooter blobs have his arrows, they'll be spitting them."],
    acceptText: "On my way",
    steps: [
      { type: "reach", at: EWAN_HIDE, zone: "Mirror Pond", text: "Find Ewan's hide at Mirror Pond", banner: ["New quest", "Ewan's Last Arrow"], obj: "Find Ewan's hide in the reeds of Mirror Pond", nag: "" },
      { type: "collect", zone: "Mirror Pond", kinds: ["shooterblob"], item: "arrow", goal: 4, chance: { shooterblob: 0.6 }, text: "Take back 4 of Ewan's arrows from the shooter blobs",
        banner: ["The hide is empty", "The shooters spat his arrows"], obj: "Ewan's arrows: {n} / {goal}", nag: "{n} of {goal}." },
      { type: "kill", zone: "Mirror Pond", kinds: BLOB_KINDS, goal: 1, own: true, fused: 3,
        summon: { parts: ["shooterblob", "warriorblob", "shooterblob"], level: 7, title: "Old Spitjaw", ...sumAt(22, 92) },
        text: "Slay Old Spitjaw", banner: ["Something big surfaces", "Slay Old Spitjaw"], obj: "Old Spitjaw slain: {n} / {goal}", nag: "It rose out of the pond." },
    ],
    outro: ["Inside what is left of Old Spitjaw: a hunting horn. You blow it, and from deep in the reeds a weak horn answers.", "Ewan, leg broken, dragging himself out of the mud. \"Took your time,\" he grins. He'll make it home to Bryn on your arm and his pride."],
    reward: arcReward(5, true),
    after: "Both my lads home, and the pond quiet. The camp owes you a haunch whenever you pass.",
  },
];

// -- Act 1: Millbrook Mill → the North Meadow spring (Lv 2-3) --
const MILL_CLOTS = [near("mill_clot1", "nest", "Jelly clot in the sluice", "Clear", 112, 42), near("mill_clot2", "nest", "Jelly clot in the millrace", "Clear", 113, 33), near("mill_clot3", "nest", "Jelly clot in the millrace", "Clear", 112, 25)];
const MILL_QUESTS: QuestDef[] = [
  {
    id: "millrace", title: "Something in the Millrace", giver: "miller", zone: "Millbrook Mill", minLevel: 2,
    description: "The wheel at Millbrook has stopped. Odo the miller says the millrace is full of jelly, and it came down from upstream.",
    offer: [
      "Listen. Hear that? Nothing. That's my wheel not turning.",
      "The race is choked with jelly, great clots of it, stuck in the sluice and all along the water up north. Blobs, rotting in my water.",
      "Clear the clots for me, would you? Follow the race upstream. And squash whatever keeps dropping them in.",
    ],
    acceptText: "I'll clear the race",
    steps: [
      { type: "use", zone: "River Ashwell", objects: MILL_CLOTS, chest: false, text: "Clear the jelly clots along the millrace, upstream", banner: ["New quest", "Something in the Millrace"],
        obj: "Clots cleared: {n} / {goal}", nag: "{n} of {goal}. Start at the sluice and walk upstream." },
      { type: "kill", zone: "North Meadow", kinds: BLOB_KINDS, goal: 6, text: "Kill 6 blobs in the North Meadow upstream", banner: ["The water runs clear", "Kill 6 blobs upstream"],
        obj: "Blobs slain: {n} / {goal}", nag: "{n} of {goal}." },
    ],
    outro: ["The wheel groans and starts to turn behind you. But the water still tastes of jelly.", "The stream rises from a spring in the middle of the North Meadow, and something big is wallowing in it."],
    reward: arcReward(2),
    after: "Hear that? She turns!",
  },
  {
    id: "meadowspring", title: "The Spring Under the Meadow", giver: "miller", zone: "North Meadow", minLevel: 3, auto: true,
    description: "A Mother Blob is wallowing in the spring that feeds Millbrook's race, budding new blobs into the water.",
    offer: ["Follow the stream to the spring in the middle of the meadow.", "Whatever sits in it is budding little blobs straight into Odo's water."],
    acceptText: "On my way",
    steps: [
      { type: "kill", zone: "North Meadow", kinds: ["motherblob"], goal: 1, own: true,
        summon: { parts: ["motherblob"], level: 4, title: "Mother Murk", hpMult: 1.5, ...sumAt(100, 18) },
        text: "Slay Mother Murk in the meadow spring", banner: ["New quest", "The Spring Under the Meadow"], obj: "Mother Murk slain: {n} / {goal}", nag: "She sits in the spring in the middle of the meadow." },
    ],
    outro: ["The spring runs clear and cold again. Downstream, faintly, you hear the mill wheel find its rhythm."],
    reward: arcReward(3, true),
    after: "Best flour in a month. Here, take a loaf for the road.",
  },
];

// -- Act 1: Thornwood (Lv 10-12) --
const THORN_MARKS = [near("thorn_mark1", "cairn", "Forester's blazed pine", "Read the marks", 175, 10), near("thorn_mark2", "cairn", "Forester's blazed pine", "Read the marks", 186, 32), near("thorn_mark3", "cairn", "Forester's blazed pine", "Read the marks", 210, 8), near("thorn_mark4", "cairn", "Forester's blazed pine", "Read the marks", 214, 33)];
const THORN_NESTS = [near("thorn_nest1", "nest", "Seed nest in the roots", "Burn", 170, 22), near("thorn_nest2", "nest", "Seed nest in the roots", "Burn", 192, 6), near("thorn_nest3", "nest", "Seed nest in the roots", "Burn", 218, 20)];
const THORN_QUESTS: QuestDef[] = [
  {
    id: "blazed", title: "The Blazed Trees", giver: "forester", zone: "Thornwood", minLevel: 10,
    description: "Ylva the forester marks Thornwood's pines with blazes to read the forest's health. Her last round never finished: the blobs came. Read her marks and see what the forest says.",
    offer: [
      "Careful where you step, there's pitch on everything.",
      "I blaze the pines on my rounds: a cut, a sign, so the next one who passes knows how the tree was. My last round I didn't finish. Something chased me off.",
      "Four blazes still to read, all across the wood. Read them for me. The trees always tell you what's wrong, if you ask.",
    ],
    acceptText: "I'll read them",
    steps: [
      { type: "use", zone: "Thornwood", objects: THORN_MARKS, chest: false, text: "Read Ylva's four blazed pines across Thornwood", banner: ["New quest", "The Blazed Trees"],
        obj: "Blazes read: {n} / {goal}", nag: "{n} of {goal}. They're spread right across the wood." },
      { type: "kill", zone: "Thornwood", kinds: BLOB_KINDS, goal: 10, text: "Kill 10 blobs in Thornwood", banner: ["The roots are sick", "Kill 10 blobs"], obj: "Blobs slain: {n} / {goal}", nag: "{n} of {goal}." },
    ],
    outro: ["Every blaze says the same thing: roots rotting from below, needles falling green. And on each trunk a ring of black seeds, like ticks.", "The healer blobs carry the seeds, and plant them in nests under the roots."],
    reward: arcReward(10),
    after: "So the roots are rotting. I knew it in my gut.",
  },
  {
    id: "seednests", title: "Seeds in the Needles", giver: "forester", zone: "Thornwood", minLevel: 11, auto: true,
    description: "The blobs of Thornwood plant black seeds under the pines. Gather some, and burn the nests they grow in.",
    offer: ["The seeds come from the healer and shooter blobs. Gather a handful.", "And the nests: three of them, deep under the biggest roots. Burn them out."],
    acceptText: "On my way",
    steps: [
      { type: "collect", zone: "Thornwood", kinds: ["healerblob", "shooterblob"], item: "thornseed", goal: 5, chance: { healerblob: 0.55, shooterblob: 0.3 },
        text: "Gather 5 Thorn Seeds from the blobs", banner: ["New quest", "Seeds in the Needles"], obj: "Thorn Seeds: {n} / {goal}", nag: "{n} of {goal}." },
      { type: "use", zone: "Thornwood", objects: THORN_NESTS, chest: false, text: "Burn the 3 seed nests under the roots", banner: ["The seeds pull east", "Burn the seed nests"],
        obj: "Nests burned: {n} / {goal}", nag: "{n} of {goal}." },
    ],
    outro: ["The last nest burns blue. Out of the smoke comes a deep crunch of branches: something big is coming through the wood toward the fire.", "Whatever has been planting the seeds is not happy."],
    reward: arcReward(11),
    after: "That smoke smelled wrong. Mind yourself.",
  },
  {
    id: "bramblemaw", title: "Bramblemaw", giver: "forester", zone: "Thornwood", minLevel: 12, auto: true,
    description: "The thing that planted the seed nests has come for you: a great fused blob grown through with thorns.",
    offer: ["It crashes through the pines: four blobs fused into one, grown through with brambles and pine needles.", "Ylva's people have a name for it in the old songs. Bramblemaw."],
    acceptText: "Fight",
    steps: [
      { type: "kill", zone: "Thornwood", kinds: BLOB_KINDS, goal: 1, own: true, fused: 4,
        summon: { parts: ["warriorblob", "healerblob", "shooterblob", "slime"], level: 13, title: "Bramblemaw", hpMult: 1.3, ...sumAt(214, 22) },
        text: "Slay Bramblemaw", banner: ["New quest", "BRAMBLEMAW"], obj: "Bramblemaw slain: {n} / {goal}", nag: "It came out of the east wood." },
    ],
    outro: ["Bramblemaw comes apart into thorns and jelly. The pines around you creak, and for the first time the wood smells only of pitch."],
    reward: arcReward(12, true),
    after: "The wood breathes easier. Come back in spring, it'll be green again.",
  },
];

// -- Act 1: the Saltwind Coast → Gullrock (Lv 17-19) --
const FALSE_LIGHTS = [near("coast_light1", "beacon", "Wreckers' false light", "Douse", 96, 196), near("coast_light2", "beacon", "Wreckers' false light", "Douse", 160, 196), near("coast_light3", "beacon", "Wreckers' false light", "Douse", 214, 196)];
const COAST_QUESTS: QuestDef[] = [
  {
    id: "falselights", title: "Wreckers' Lights", giver: "beachcomber", zone: "Saltwind Coast", minLevel: 17,
    description: "Somebody is lighting fires on the Saltwind Coast at night, where no harbour is, to lure ships onto the rocks. Nell the beachcomber wants them put out.",
    offer: [
      "See that? Planks. Barrel staves. A whole ship's worth came in on the tide last week.",
      "She didn't hit the rocks by bad luck. Somebody lit fires along the shore, where there's no harbour, to look like one. Wreckers.",
      "Put their lights out, all along the coast. And the blobs come to the fires like moths: kill the ones you find there.",
    ],
    acceptText: "I'll douse them",
    steps: [
      { type: "use", zone: "Saltwind Coast", objects: FALSE_LIGHTS, chest: false, text: "Douse the wreckers' false lights along the coast", banner: ["New quest", "Wreckers' Lights"],
        obj: "False lights doused: {n} / {goal}", nag: "{n} of {goal}. They burn all along the shore." },
      { type: "kill", zone: "Saltwind Coast", kinds: BLOB_KINDS, goal: 8, text: "Kill 8 blobs drawn to the fires", banner: ["The coast goes dark", "Kill 8 blobs at the fires"], obj: "Blobs slain: {n} / {goal}", nag: "{n} of {goal}." },
    ],
    outro: ["By the last fire, a cask of lamp oil with a red rag tied round it. The Redfang mark.", "The Redfang have been wrecking ships off the coast, and the blobs have been eating the salvage."],
    reward: arcReward(17),
    after: "No more lights on my shore. Good.",
  },
  {
    id: "salvage", title: "Salvage Rights", giver: "beachcomber", zone: "Saltwind Coast", minLevel: 18, auto: true,
    description: "The blobs of the coast have swallowed the wrecked ship's salvage, and the Redfang wreckers are camped at Gullrock to collect it.",
    offer: ["The blobs swallowed whatever came ashore from the wreck: you can see it glinting inside them.", "Cut it out of them. Then go east to Gullrock and let the wreckers know their luck has run out."],
    acceptText: "On my way",
    steps: [
      { type: "collect", zone: "Saltwind Coast", kinds: ["warriorblob", "shooterblob", "healerblob"], item: "salvage", goal: 5, chance: { warriorblob: 0.45, shooterblob: 0.45, healerblob: 0.45 },
        text: "Cut 5 pieces of salvage out of the coast blobs", banner: ["New quest", "Salvage Rights"], obj: "Salvage: {n} / {goal}", nag: "{n} of {goal}." },
      { type: "kill", zone: COVE, kinds: ["bandit"], goal: 5, text: "Kill 5 Redfang wreckers at Gullrock Cove", banner: ["The salvage bears a name", "Kill 5 wreckers at Gullrock"], obj: "Wreckers slain: {n} / {goal}", nag: "{n} of {goal}." },
    ],
    outro: ["One of the wreckers had a fresh tally in his belt: five ships, five marks. And a name scratched under them: Ollo.", "The wreckers' boss is coming down the shore to see what the noise is."],
    reward: arcReward(18),
    after: "Five ships. Five crews. Bastards.",
  },
  {
    id: "ollo", title: "Ollo the Wrecker", giver: "beachcomber", zone: COVE, minLevel: 19, auto: true,
    description: "Ollo, the Redfang's wrecker captain, has come down the shore to Gullrock Cove.",
    offer: ["Down the shore he comes, a big man in a drowned captain's coat, a boat-hook for a weapon.", "Ollo the Wrecker. Five ships on his belt."],
    acceptText: "Fight",
    steps: [
      { type: "kill", zone: COVE, kinds: ["bandit"], goal: 1, own: true,
        summon: { parts: ["bandit"], level: 21, title: "Ollo the Wrecker", hpMult: 3.5, x: (GULLROCK.x + 6) * TILE, y: (GULLROCK.y + 6.7) * TILE },
        text: "Slay Ollo the Wrecker", banner: ["New quest", "Ollo the Wrecker"], obj: "Ollo the Wrecker slain: {n} / {goal}", nag: "He's at the west end of Gullrock Cove." },
    ],
    outro: ["Ollo goes down in the surf. In his coat: the logbook of the last ship he wrecked, and her captain's ring. Nell will want them both, for the families."],
    reward: arcReward(19, true),
    after: "I'll send the ring to the captain's widow. Thank you.",
  },
];

// -- Act 1: the Stormbreak Crags (Lv 22-24) --
const CRAG_CAIRNS = [near("crag_cairn1", "cairn", "Storm-struck cairn", "Ground it", 246, 146), near("crag_cairn2", "cairn", "Storm-struck cairn", "Ground it", 264, 158), near("crag_cairn3", "cairn", "Storm-struck cairn", "Ground it", 278, 142)];
const CRAG_QUESTS: QuestDef[] = [
  {
    id: "thunderrock", title: "Thunder in the Rock", giver: "prospector", zone: "Stormbreak Crags", minLevel: 22,
    description: "Dagna the prospector came to the Stormbreak Crags for sky-iron. The lightning that strikes there every night has woken something in her old cairns.",
    offer: [
      "Don't touch the cairns. I mean it. I touched one this morning and my beard's still standing up.",
      "I came up here for sky-iron: the ore lightning leaves in the rock. I built cairns over the best veins. Now the storm strikes them every night, and the blobs come to drink it.",
      "Ground them for me: bury the iron rod at each foot. And thin out the storm blobs, they're getting bold.",
    ],
    acceptText: "I'll ground them",
    steps: [
      { type: "use", zone: "Stormbreak Crags", objects: CRAG_CAIRNS, chest: false, text: "Ground Dagna's three storm-struck cairns", banner: ["New quest", "Thunder in the Rock"],
        obj: "Cairns grounded: {n} / {goal}", nag: "{n} of {goal}. Across the crags, on the highest rocks." },
      { type: "kill", zone: "Stormbreak Crags", kinds: ["stormblob"], goal: 8, text: "Kill 8 storm blobs", banner: ["The cairns go quiet", "Kill 8 storm blobs"], obj: "Storm blobs slain: {n} / {goal}", nag: "{n} of {goal}." },
    ],
    outro: ["With the cairns grounded, the storm blobs have nothing left to drink but the sky-iron itself.", "They swallow the ore whole. You can see it glowing blue inside them."],
    reward: arcReward(22),
    after: "My beard's lying down again. Mostly.",
  },
  {
    id: "skyiron", title: "Sky-Iron", giver: "prospector", zone: "Stormbreak Crags", minLevel: 23, auto: true,
    description: "The storm blobs have swallowed Dagna's sky-iron. Cut it out of them.",
    offer: ["The blobs are eating the sky-iron, every vein she found.", "Cut it out of them before they grow too big to fight."],
    acceptText: "On my way",
    steps: [
      { type: "collect", zone: "Stormbreak Crags", kinds: ["stormblob", "warriorblob"], item: "skyiron", goal: 5, chance: { stormblob: 0.4, warriorblob: 0.3 },
        text: "Cut 5 lumps of sky-iron out of the blobs", banner: ["New quest", "Sky-Iron"], obj: "Sky-iron: {n} / {goal}", nag: "{n} of {goal}." },
    ],
    outro: ["The sky-iron hums in your pack, and the hum gets louder when you face the high crags.", "Something up there has eaten more of it than all the others together, and it is calling the rest home."],
    reward: arcReward(23),
    after: "That's good iron. Real good iron.",
  },
  {
    id: "rollingstorm", title: "The Rolling Storm", giver: "prospector", zone: "Stormbreak Crags", minLevel: 24, auto: true,
    description: "The biggest storm blob of the crags is full of sky-iron and lightning. It rolls over the high rocks like a thundercloud.",
    offer: ["On the high crags a thundercloud is rolling over the rock. It is not a cloud.", "Five blobs fused round a heart of sky-iron, crackling. The Rolling Storm."],
    acceptText: "Fight",
    steps: [
      { type: "kill", zone: "Stormbreak Crags", kinds: BLOB_KINDS, goal: 1, own: true, fused: 5,
        summon: { parts: ["stormblob", "stormblob", "warriorblob", "stormblob", "shooterblob"], level: 25, title: "The Rolling Storm", hpMult: 1.3, ...sumAt(268, 166) },
        text: "Slay the Rolling Storm", banner: ["New quest", "THE ROLLING STORM"], obj: "The Rolling Storm slain: {n} / {goal}", nag: "On the high crags in the south." },
    ],
    outro: ["The Rolling Storm bursts with a crack you feel in your teeth. Where it died lies a lump of sky-iron the size of a loaf.", "Dagna will be prospecting here for the rest of her life."],
    reward: arcReward(24, true),
    after: "Ha! Look at the size of it! I'm naming the vein after you.",
  },
];

// -- Act 2: Jackal Springs (Lv 32-34) --
const JACKAL_BALES = [near("jackal_bale1", "clue", "Looted bale", "Search", 86, 360), near("jackal_bale2", "clue", "Looted bale", "Search", 97, 357), near("jackal_bale3", "clue", "Looted bale", "Search", 95, 366)];
const JACKAL_QUESTS: QuestDef[] = [
  {
    id: "stalled", title: "The Stalled Caravan", giver: "caravaneer", zone: "Jackal Springs", minLevel: 32,
    description: "Hamid's salt caravan was hit at Jackal Springs. His camels ran, his drivers ran, and his bales lie split open by the water.",
    offer: [
      "Thirty camels, stranger. Thirty! And not one of them came back. They ran when the Dustriders came, and my drivers ran with them.",
      "The bales lie by the water, cut open. Look through them, see what they took and what they left. Raiders are fussy, it tells you who sent them.",
      "And if Dustriders are still drinking at my springs, put them off it.",
    ],
    acceptText: "I'll look",
    steps: [
      { type: "use", zone: "Jackal Springs", objects: JACKAL_BALES, chest: false, text: "Search Hamid's looted bales", banner: ["New quest", "The Stalled Caravan"], obj: "Bales searched: {n} / {goal}", nag: "{n} of {goal}." },
      { type: "kill", zone: "Jackal Springs", kinds: ["nomad"], goal: 8, text: "Drive off 8 Dustriders", banner: ["Only the seals are gone", "Drive off 8 Dustriders"], obj: "Dustriders slain: {n} / {goal}", nag: "{n} of {goal}." },
    ],
    outro: ["They left the salt and the silk. They took only the caravan seals: brass stamps that open every gate on the trade road.", "With those, a Dustrider can ride right into Kel Ashar as a merchant."],
    reward: arcReward(32),
    after: "Salt and silk left lying, seals gone. That's not a raid. That's a plan.",
  },
  {
    id: "seals", title: "Jackal's Teeth", giver: "caravaneer", zone: "Jackal Springs", minLevel: 33, auto: true,
    description: "The Dustriders who robbed Hamid carry the stolen caravan seals. Take them back before they reach Kel Ashar's gate.",
    offer: ["The riders who took the seals are still about the springs, splitting the take.", "Take the seals back, all of them."],
    acceptText: "On my way",
    steps: [
      { type: "collect", zone: "Jackal Springs", kinds: ["nomad"], item: "caravanseal", goal: 4, chance: { nomad: 0.4 }, text: "Take back 4 caravan seals from the Dustriders",
        banner: ["New quest", "Jackal's Teeth"], obj: "Caravan seals: {n} / {goal}", nag: "{n} of {goal}." },
    ],
    outro: ["Four seals back. A wounded rider spits at your feet: \"Sufyan will skin you. He sees in the dark like a jackal.\"", "Sufyan Jackal-Eye. The riders' leader is coming to the springs himself."],
    reward: arcReward(33),
    after: "My seals! Every gate on the road just shut to them.",
  },
  {
    id: "jackaleye", title: "Sufyan Jackal-Eye", giver: "caravaneer", zone: "Jackal Springs", minLevel: 34, auto: true,
    description: "Sufyan Jackal-Eye, the Dustrider who planned the raid, has come to Jackal Springs for his seals.",
    offer: ["Out of the dusk rides a man with one eye gone milky and one that shines like a jackal's.", "Sufyan Jackal-Eye. He wants his seals."],
    acceptText: "Fight",
    steps: [
      { type: "kill", zone: "Jackal Springs", kinds: ["nomad"], goal: 1, own: true,
        summon: { parts: ["nomad"], level: 36, title: "Sufyan Jackal-Eye", hpMult: 3.5, ...sumAt(90, 358) },
        text: "Slay Sufyan Jackal-Eye", banner: ["New quest", "Sufyan Jackal-Eye"], obj: "Sufyan slain: {n} / {goal}", nag: "At the springs." },
    ],
    outro: ["Sufyan falls. Sewn into his coat is a strip of indigo cloth, and a gold sun with a veil over its face.", "Even the raiders of the Red Wastes answer to the Veiled Circle."],
    reward: arcReward(34, true),
    after: "My drivers are coming back. Some camels too. The springs are open again.",
  },
];

// -- Act 2: the Red Wastes by the Sunstone (Lv 31-33) --
const WASTE_STONES = [near("waste_stone1", "cairn", "Half-buried waystone", "Read", 70, 398), near("waste_stone2", "cairn", "Half-buried waystone", "Read", 60, 392), near("waste_stone3", "cairn", "Half-buried waystone", "Read", 52, 404)];
const WASTE_NESTS = [near("waste_nest1", "nest", "Scorpion nest", "Burn", 48, 414), near("waste_nest2", "nest", "Scorpion nest", "Burn", 40, 400), near("waste_nest3", "nest", "Scorpion nest", "Burn", 56, 420)];
const WASTE_QUESTS: QuestDef[] = [
  {
    id: "boneroad", title: "The Bone Road", giver: "hermit", zone: "The Red Wastes", minLevel: 31,
    description: "Old Tamsin the hermit says the old waystones of the Bone Road, west of the Sunstone, have been dug up. Read them before the sand takes them again.",
    offer: [
      "Sit, sit. Sand in the tea is good for the teeth. Old Tamsin says so, and Old Tamsin has all of hers.",
      "West of here runs the Bone Road, the old way to Kharsun. Its waystones have lain under the sand since before my grandmother. This month the wind dug them up. Or something did.",
      "Go and read them. And mind the scorpions. They've been bold since the stones came up.",
    ],
    acceptText: "I'll read the stones",
    steps: [
      { type: "use", zone: "The Red Wastes", objects: WASTE_STONES, chest: false, text: "Read the 3 waystones of the Bone Road", banner: ["New quest", "The Bone Road"], obj: "Waystones read: {n} / {goal}", nag: "{n} of {goal}. West of my fire." },
      { type: "kill", zone: "The Red Wastes", kinds: ["scorpion"], goal: 8, text: "Kill 8 scorpions on the Bone Road", banner: ["Something dug them up", "Kill 8 scorpions"], obj: "Scorpions slain: {n} / {goal}", nag: "{n} of {goal}." },
    ],
    outro: ["The waystones were not dug up by the wind. Something burrowed under each of them, and the tunnels all run south-west.", "The scorpions come out of those tunnels. Nests, then, under the road."],
    reward: arcReward(31),
    after: "Tunnels? Under the Bone Road? Hm. Old Tamsin does not like that.",
  },
  {
    id: "stingingdark", title: "The Stinging Dark", giver: "hermit", zone: "The Red Wastes", minLevel: 32, auto: true,
    description: "Scorpion nests under the Bone Road. Burn them.",
    offer: ["The tunnels open into nests south-west of the waystones, three of them, each a heap of husks and eggs.", "Burn them before they hatch."],
    acceptText: "On my way",
    steps: [
      { type: "use", zone: "The Red Wastes", objects: WASTE_NESTS, chest: false, text: "Burn the 3 scorpion nests", banner: ["New quest", "The Stinging Dark"], obj: "Nests burned: {n} / {goal}", nag: "{n} of {goal}." },
    ],
    outro: ["The last nest burns. The ground under you shivers, and the sand starts to slide down into a widening hole.", "Something very big lives under the nests, and you just burned her children."],
    reward: arcReward(32),
    after: "Burned? Good. Now run.",
  },
  {
    id: "stings", title: "Mother of Stings", giver: "hermit", zone: "The Red Wastes", minLevel: 33, auto: true,
    description: "The mother of the Bone Road's scorpions has come up out of the sand.",
    offer: ["She heaves up out of the sand: a scorpion as long as a cart, her shell scarred with old spear-points.", "The Mother of Stings."],
    acceptText: "Fight",
    steps: [
      { type: "kill", zone: "The Red Wastes", kinds: ["scorpion"], goal: 1, own: true,
        summon: { parts: ["scorpion"], level: 35, title: "The Mother of Stings", hpMult: 4, ...sumAt(48, 410) },
        text: "Slay the Mother of Stings", banner: ["New quest", "THE MOTHER OF STINGS"], obj: "The Mother of Stings slain: {n} / {goal}", nag: "By the burned nests." },
    ],
    outro: ["The Mother of Stings rolls over in the sand. Among the spear-points in her shell is a waystone fragment with the Bone Road's last mile on it: \"KHARSUN. DRINK, AND REMEMBER.\""],
    reward: arcReward(33, true),
    after: "The Bone Road is quiet. Old Tamsin will walk it again, before she dies.",
  },
];

// -- Act 2: the Saffron Dunes (Lv 40-42) --
const DUNE_TOTEMS = [near("dune_totem1", "totem", "Brand-totem of the Circle", "Burn", 214, 450), near("dune_totem2", "totem", "Brand-totem of the Circle", "Burn", 232, 462), near("dune_totem3", "totem", "Brand-totem of the Circle", "Burn", 248, 446)];
const DUNE_QUESTS: QuestDef[] = [
  {
    id: "backwards", title: "Tracks That Walk Backward", giver: "dunescout", zone: "The Saffron Dunes", minLevel: 40,
    description: "Leyla, a scout of the camel-clans, follows a herd of branded camel-folk into the Saffron Dunes. Their tracks walk backward, so no one can follow.",
    offer: [
      "Quiet. Look at the sand. What do you see? Tracks going west, yes? Wrong. They walk backward, heel first. An old trick.",
      "Branded ones. My own clan, some of them. The Circle's brand makes them do it, so nobody follows them home.",
      "I follow anyway. Thin them out with me. Then we find where they go.",
    ],
    acceptText: "I'll come",
    steps: [
      { type: "kill", zone: "The Saffron Dunes", kinds: ["camelfolk"], goal: 10, text: "Kill 10 branded camel-folk in the dunes", banner: ["New quest", "Tracks That Walk Backward"], obj: "Camel-folk slain: {n} / {goal}", nag: "{n} of {goal}." },
    ],
    outro: ["The backward tracks lead deeper into the dunes, to tall posts of black wood hung with brass plates: brand-totems.", "The branded ones walk round them in circles, like moths round a lamp."],
    reward: arcReward(40),
    after: "Brand-totems. I didn't know they had those out here.",
  },
  {
    id: "brandtotems", title: "The Brand-Totems", giver: "dunescout", zone: "The Saffron Dunes", minLevel: 41, auto: true,
    description: "Brand-totems of the Veiled Circle hold the branded camel-folk in the Saffron Dunes. Burn them, and take the dune-pearls the scorpions gather round them.",
    offer: ["Three totems across the dunes. Burn them and the brand loses its pull.", "The scorpions nest at their feet and swallow the dune-pearls the Circle buries there: gather those too, Leyla says the clan elders can read them."],
    acceptText: "On my way",
    steps: [
      { type: "use", zone: "The Saffron Dunes", objects: DUNE_TOTEMS, chest: false, text: "Burn the 3 brand-totems", banner: ["New quest", "The Brand-Totems"], obj: "Brand-totems burned: {n} / {goal}", nag: "{n} of {goal}." },
      { type: "collect", zone: "The Saffron Dunes", kinds: ["scorpion"], item: "pearl", goal: 4, chance: { scorpion: 0.35 }, text: "Take 4 dune-pearls from the scorpions",
        banner: ["The totems burn", "Take 4 dune-pearls"], obj: "Dune-pearls: {n} / {goal}", nag: "{n} of {goal}." },
    ],
    outro: ["As the last totem falls a great bellow rolls over the dunes. The branded ones stop circling and turn, all at once, toward it.", "Their khan is coming. The Circle branded him first."],
    reward: arcReward(41),
    after: "The dune-pearls are clan memory. The Circle stole our memory and buried it. I won't forget this.",
  },
  {
    id: "khan", title: "The Branded Khan", giver: "dunescout", zone: "The Saffron Dunes", minLevel: 42, auto: true,
    description: "Khan Ghazi, the camel-clans' lost chief, was the first the Circle branded. He comes for whoever burned his totems.",
    offer: ["Over the dune crest comes the biggest of them all, a gold ring in his nose and the Circle's brand burned deep in his neck.", "Khan Ghazi. Leyla's khan, once."],
    acceptText: "Fight",
    steps: [
      { type: "kill", zone: "The Saffron Dunes", kinds: ["camelfolk"], goal: 1, own: true,
        summon: { parts: ["camelfolk"], level: 44, title: "Khan Ghazi, the Branded", hpMult: 3.5, ...sumAt(232, 452) },
        text: "Free Khan Ghazi from the brand", banner: ["New quest", "THE BRANDED KHAN"], obj: "Khan Ghazi freed: {n} / {goal}", nag: "In the middle of the dunes." },
    ],
    outro: ["As Khan Ghazi falls, the brand on his neck cracks and goes dark. His eyes clear for a moment. \"Tell the clans,\" he breathes, \"the sun has a veil. Tear it off.\""],
    reward: arcReward(42, true),
    after: "He knew me at the end. He knew me.",
  },
];

// -- Act 2: the foot of the Thornspire (Lv 43-45) --
const SPIRE_MIRRORS = [near("spire_mirror1", "sigil", "Sun-mirror", "Turn aside", 214, 384), near("spire_mirror2", "sigil", "Sun-mirror", "Turn aside", 228, 376), near("spire_mirror3", "sigil", "Sun-mirror", "Turn aside", 240, 388)];
const SPIRE_RIDDLES = [near("spire_riddle1", "cairn", "Riddle stone", "Read", 208, 364), near("spire_riddle2", "cairn", "Riddle stone", "Read", 222, 356), near("spire_riddle3", "cairn", "Riddle stone", "Read", 236, 366)];
const SPIRE_QUESTS: QuestDef[] = [
  {
    id: "mirrorpath", title: "The Mirror Path", giver: "defector", zone: "The Thornspire Heights", minLevel: 43,
    description: "Nasrin walked out of the Veiled Circle. She knows the mirrors on the lower Thornspire: they burn whoever climbs the path by day.",
    offer: [
      "Don't look up. The mirrors. Look up and they find your eyes.",
      "I wore this robe for nine years. I polished those mirrors. Every one is set to throw the noon sun onto the path, so no one climbs by day.",
      "Turn them aside. I'll show you how. And the sphinxes that guard them, they don't sleep. Kill them before they ask you anything.",
    ],
    acceptText: "I'll turn the mirrors",
    steps: [
      { type: "use", zone: "The Thornspire Heights", objects: SPIRE_MIRRORS, chest: false, text: "Turn the 3 sun-mirrors aside", banner: ["New quest", "The Mirror Path"], obj: "Mirrors turned: {n} / {goal}", nag: "{n} of {goal}." },
      { type: "kill", zone: "The Thornspire Heights", kinds: ["sphinx"], goal: 5, text: "Kill 5 sphinx warriors on the path", banner: ["The path is shaded", "Kill 5 sphinx warriors"], obj: "Sphinx warriors slain: {n} / {goal}", nag: "{n} of {goal}." },
    ],
    outro: ["Above the mirrors the path splits round three carved stones, each cut with a riddle in the Circle's script.", "Nasrin says the right answers open the old riddle-door, and the wrong ones wake its keeper."],
    reward: arcReward(43),
    after: "Shade on the path. I never thought I'd see it.",
  },
  {
    id: "riddles", title: "Riddles in Stone", giver: "defector", zone: "The Thornspire Heights", minLevel: 44, auto: true,
    description: "Three riddle stones guard the old door to the sphinxes' roost. Read them, and put down the adepts who come to stop you.",
    offer: ["Three riddle stones, higher up the path. Nasrin knows the answers. She taught them to children, once.", "The adepts will feel you reading them. They'll come."],
    acceptText: "On my way",
    steps: [
      { type: "use", zone: "The Thornspire Heights", objects: SPIRE_RIDDLES, chest: false, text: "Read the 3 riddle stones", banner: ["New quest", "Riddles in Stone"], obj: "Riddles read: {n} / {goal}", nag: "{n} of {goal}." },
      { type: "kill", zone: "The Thornspire Heights", kinds: ["veiled"], goal: 8, text: "Kill 8 Veiled Adepts", banner: ["The adepts come", "Kill 8 Veiled Adepts"], obj: "Veiled Adepts slain: {n} / {goal}", nag: "{n} of {goal}." },
    ],
    outro: ["The last answer is \"a well\". The stone grinds open, and from the roost above comes a voice like a lioness purring.", "\"A riddle for a riddle, little thief. Come up and answer mine.\""],
    reward: arcReward(44),
    after: "Neferu. She was the Circle's first sphinx. She's very, very old.",
  },
  {
    id: "riddlemother", title: "The Riddle-Mother", giver: "defector", zone: "The Thornspire Heights", minLevel: 45, auto: true,
    description: "Neferu, the first sphinx the Veiled Circle made, keeps the roost above the riddle stones.",
    offer: ["Neferu is waiting on her roost, tail lashing, the Circle's gold on her brow.", "Her riddle has no answer. Only a blade."],
    acceptText: "Fight",
    steps: [
      { type: "kill", zone: "The Thornspire Heights", kinds: ["sphinx"], goal: 1, own: true,
        summon: { parts: ["sphinx"], level: 47, title: "Neferu, the Riddle-Mother", hpMult: 3.5, ...sumAt(222, 350) },
        text: "Slay Neferu, the Riddle-Mother", banner: ["New quest", "THE RIDDLE-MOTHER"], obj: "Neferu slain: {n} / {goal}", nag: "On her roost above the riddle stones." },
    ],
    outro: ["Neferu lies still. On her roost, under bones and gold, is a map of the Thornspire, with the Veiled Sanctum marked and a stair above it."],
    reward: arcReward(45, true),
    after: "She asked me a riddle every morning for nine years. I never once knew the answer. Thank you.",
  },
];


// -- The two deep dungeons (Murat's friend 2026-11-10: "make 2 dungeons, more fun, with quests inside"; shared/dungeon.ts) --
/** A spot in chamber i of a floor, offset by (dx, dy) tiles from its centre. */
const inRoom = (f: { x: number; y: number; chambers: { x: number; y: number }[] }, i: number, dx = 0, dy = 0): [number, number] => [f.x + f.chambers[i].x + dx, f.y + f.chambers[i].y + dy];
const [CAT, CHOIR] = CRYPT_FLOORS, [BAZAAR, VAULT] = UNDER_FLOORS;
const CRYPT_UNDEAD: MobKind[] = ["skeleton", "skeletonmage", "necromancer", "crawler"];
const UNDER_KINDS: MobKind[] = ["sanddead", "scorpion", "veiled", "sphinx"];

// Act 1: the Lantern Crypt under Barrow Downs (Lv 13-17)
const CRYPT_LAMPS = [near("crypt_lamp1", "lantern", "Lamplighter's lamp", "Relight", ...inRoom(CAT, 2, -3, -1)), near("crypt_lamp2", "lantern", "Lamplighter's lamp", "Relight", ...inRoom(CAT, 2, 3, 2)),
  near("crypt_lamp3", "lantern", "Lamplighter's lamp", "Relight", ...inRoom(CAT, 1, 2, 1)), near("crypt_lamp4", "lantern", "Lamplighter's lamp", "Relight", ...inRoom(CAT, 3, -4, 0))];
const SEXTON_LEDGER = near("crypt_ledger", "clue", "The sexton's ledger", "Read", ...inRoom(CAT, 5, 2, -1));
const CHOIR_BELLS = [near("crypt_bell1", "bell", "Bone bell", "Silence", ...inRoom(CHOIR, 3, -3, -2)), near("crypt_bell2", "bell", "Bone bell", "Silence", ...inRoom(CHOIR, 3, 3, 2)),
  near("crypt_bell3", "bell", "Bone bell", "Silence", ...inRoom(CHOIR, 1, 2, 1))];
const CRYPT_QUESTS: QuestDef[] = [
  {
    id: "lampsout", title: "The Lamps Went Out", giver: "monk", zone: "Barrow Downs", minLevel: 13,
    description: "Brother Aldric's order kept lamps burning in the catacombs under Barrow Downs, so the old dead would sleep. The lamps have gone out, and the dead are walking up the stair.",
    offer: [
      "Mind the stair, child. It is only steep the first nine hundred years.",
      "My brothers kept the lamps lit down there since before Oakvale had a name. While the lamps burn, the dead below sleep. Last week the lamps went out. All of them, in one night.",
      "I am too old for the stair. Go down into the Catacombs and relight what you can. Four lamps will do to start. And put back to bed whatever is up and walking.",
    ],
    acceptText: "I'll relight them",
    steps: [
      { type: "use", zone: CAT.name, objects: CRYPT_LAMPS, chest: false, text: "Go down the crypt stair and relight 4 of the monks' lamps", banner: ["New quest", "The Lamps Went Out"],
        obj: "Lamps relit: {n} / {goal}", nag: "{n} of {goal}. The lamps stand in the lamp hall, the ossuary and the long gallery." },
      { type: "kill", zone: CAT.name, kinds: CRYPT_UNDEAD, goal: 12, text: "Put 12 of the walking dead back to rest", banner: ["They saw the light", "Put 12 of the dead back to rest"],
        obj: "Dead put to rest: {n} / {goal}", nag: "{n} of {goal}." },
    ],
    outro: ["In the light of the relit lamps you can see it plainly: someone snuffed them, one by one. Wax is pinched flat between finger bones.", "And a fresh trail of spade-marks leads deeper, toward the old sexton's dig."],
    reward: arcReward(13),
    after: "Light again, below. Thank you. Now, who would put a lamp out down there?",
  },
  {
    id: "sexton", title: "The Sexton's Spade", giver: "monk", zone: CAT.name, minLevel: 14, auto: true,
    description: "The spade-marks lead to the dig of Sexton Hobb, who buried the order's dead for sixty years. He has not stopped digging. Only now he digs them up.",
    offer: ["Spade-marks... Hobb. Old Hobb was our sexton. We buried him with his spade, as he asked.", "If he is digging again, he is not digging graves. Find his dig past the long gallery, lay him down, and read his ledger. He wrote down everything."],
    acceptText: "On my way",
    steps: [
      { type: "kill", zone: CAT.name, kinds: ["skeleton"], goal: 1, own: true,
        summon: { parts: ["skeleton"], level: 15, title: "Sexton Hobb", hpMult: 5, ...sumAt(...inRoom(CAT, 5, -1, 1)),
          voice: { wake: ["Another one for the hole. Hold still."], taunt: ["Six foot down. Always six foot.", "The Abbot wants them up. So up they come.", "Sixty years I dug. I know where everyone is."], death: ["Put me... back... with my spade..."] } },
        text: "Lay Sexton Hobb to rest in his dig", banner: ["New quest", "The Sexton's Spade"], obj: "Sexton Hobb laid to rest: {n} / {goal}", nag: "His dig is in the south-east of the Catacombs, behind a door." },
      { type: "use", zone: CAT.name, objects: [SEXTON_LEDGER], chest: false, text: "Read the sexton's ledger", banner: ["He lies still", "Read the sexton's ledger"],
        obj: "Read the ledger", nag: "It lies in his dig." },
    ],
    outro: ["The last pages are in a new hand, all bone-dust and candle grease: 'By order of the Abbot. Snuff the lamps. Raise the Choir. Every brother to his stall.'", "Abbot Morrow. Dead two hundred years. The stair down to the Bone Choir is past Hobb's dig."],
    reward: arcReward(14),
    after: "The Abbot. Saints keep us. He was the best of us, once.",
  },
  {
    id: "bonechoir", title: "The Bone Choir", giver: "monk", zone: CHOIR.name, minLevel: 15, auto: true,
    description: "Under the Catacombs the Abbot's dead brothers sing in their stalls, and their bone bells keep time. While the bells ring, the dead above keep rising.",
    offer: ["Do you hear it? Through the floor. The Choir is singing again.", "There are bells down there, made from the bones of the brothers who served longest. Silence them, and thin the Choir before you face him."],
    acceptText: "On my way",
    steps: [
      { type: "use", zone: CHOIR.name, objects: CHOIR_BELLS, chest: false, text: "Go down to the Bone Choir and silence 3 bone bells", banner: ["New quest", "The Bone Choir"],
        obj: "Bells silenced: {n} / {goal}", nag: "{n} of {goal}. The bells hang in the choir stalls and the cloister." },
      { type: "kill", zone: CHOIR.name, kinds: CRYPT_UNDEAD, goal: 14, text: "Break the Choir: slay 14 of the dead", banner: ["The singing falters", "Break the Choir: slay 14 of the dead"],
        obj: "Choir dead slain: {n} / {goal}", nag: "{n} of {goal}." },
    ],
    outro: ["The last bell cracks and the singing stops mid-note. In the silence, one voice goes on alone, from the High Choir to the south-east.", "It is calling you by name. It has been reading Hobb's ledger too."],
    reward: arcReward(15),
    after: "Silence. I had forgotten what it sounded like.",
  },
  {
    id: "hollowabbot", title: "The Hollow Abbot", giver: "monk", zone: "The High Choir", minLevel: 16, auto: true,
    description: "Abbot Morrow kept the lamps for forty years, then learned what the dead below whispered. Now he leads their choir from the High Choir, at the bottom of the crypt.",
    offer: ["He was kind to me when I was a novice. He taught me to trim a wick.", "Whatever is in the High Choir now is not him. Go through the bars, and give him the rest he gave so many others."],
    acceptText: "Into the High Choir",
    steps: [
      { type: "kill", zone: "The High Choir", kinds: ["necromancer"], goal: 1, own: true,
        summon: { parts: ["necromancer"], level: 17, title: "Abbot Morrow, the Hollow Abbot", hpMult: 6, x: (HIGH_CHOIR.x + 0.5) * TILE, y: (HIGH_CHOIR.y - 1.5) * TILE,
          voice: {
            wake: ["Ah. The one who silenced my bells.", "Forty years I kept the lamps, child. Do you know what the dead do in the dark? They sing.", "Come. Sing with us."],
            taunt: ["Every lamp goes out in the end. I only hurried mine.", "Aldric still trims his wicks? Dear boy. He always did miss the point.", "Below the Downs there are ten thousand of us. Above, how many of you?", "Hush. Listen to the stone. It remembers every hymn."],
            half: ["Brothers! To your stalls! Sing me up!"],
            death: ["The lamps... how bright they were... Aldric, I am sorry..."],
          } },
        text: "Lay Abbot Morrow to rest in the High Choir", banner: ["New quest", "The Hollow Abbot"], obj: "The Hollow Abbot laid to rest: {n} / {goal}",
        nag: "The High Choir is at the bottom of the crypt, behind iron bars. A stair there leads back up to the Downs." },
    ],
    outro: ["The Abbot folds down into a heap of grey robes. Under them, an old lamp, still warm. It lights by itself in your hand.", "The abbot's stair at the back of the hall leads straight up to the Downs. Brother Aldric will want to know."],
    reward: arcReward(17, true),
    after: "You brought his lamp back. I will keep it lit for him. For all of them.",
  },
];

// Act 2: the Undercity below Kharsun (Lv 40-44)
const LOST_PACKS = [near("under_pack1", "clue", "A rope-man's pack", "Search", ...inRoom(BAZAAR, 1, -2, 1)), near("under_pack2", "clue", "A rope-man's pack", "Search", ...inRoom(BAZAAR, 2, 2, -1)),
  near("under_pack3", "clue", "A rope-man's pack", "Search", ...inRoom(BAZAAR, 3, 3, 1))];
const BROOD_EGGS = [near("under_eggs1", "nest", "Scorpion egg clutch", "Burn", ...inRoom(BAZAAR, 5, -3, -1)), near("under_eggs2", "nest", "Scorpion egg clutch", "Burn", ...inRoom(BAZAAR, 5, 3, 1)),
  near("under_eggs3", "nest", "Scorpion egg clutch", "Burn", ...inRoom(BAZAAR, 5, 0, 3))];
const CANOPIC = [near("under_urn1", "urn", "Canopic urn of a Water-King", "Break the seal", ...inRoom(VAULT, 2, -2, -1)), near("under_urn2", "urn", "Canopic urn of a Water-King", "Break the seal", ...inRoom(VAULT, 2, 2, 2)),
  near("under_urn3", "urn", "Canopic urn of a Water-King", "Break the seal", ...inRoom(VAULT, 3, -3, 1)), near("under_urn4", "urn", "Canopic urn of a Water-King", "Break the seal", ...inRoom(VAULT, 4, 1, 1))];
const UNDER_QUESTS: QuestDef[] = [
  {
    id: "downthewell", title: "Down the Well", giver: "tombrobber", zone: "Kharsun, the Buried City", minLevel: 40,
    description: "Zahir sent three of his rope-men down the old well in Kharsun to find the Water-Kings' bazaar. The ropes came back up cut.",
    offer: [
      "Shh. Not so loud near the well. Things listen down there.",
      "Under Kharsun there is a whole city the sand swallowed: a bazaar, a vault, the tombs of the Water-Kings. I sent three rope-men down. The ropes came back cut clean.",
      "Go down. Find their packs, find what cut the ropes. I'll pay in gold, and you can keep whatever the dead don't want.",
    ],
    acceptText: "I'll go down the well",
    steps: [
      { type: "use", zone: BAZAAR.name, objects: LOST_PACKS, chest: false, text: "Climb down the well and find the rope-men's 3 packs", banner: ["New quest", "Down the Well"],
        obj: "Packs found: {n} / {goal}", nag: "{n} of {goal}. They are somewhere in the Sunken Bazaar." },
      { type: "kill", zone: BAZAAR.name, kinds: UNDER_KINDS, goal: 12, text: "Clear the bazaar: slay 12 of its dwellers", banner: ["Not empty", "Clear the bazaar: slay 12 of its dwellers"],
        obj: "Slain: {n} / {goal}", nag: "{n} of {goal}." },
    ],
    outro: ["The last pack is stuck through with a sting as long as your arm. The scratches in the floor all lead one way: down, to the old cistern pit.", "Something there lays eggs in what it catches."],
    reward: arcReward(40),
    after: "Gone, all three. Well. They knew the price of a rope.",
  },
  {
    id: "broodqueen", title: "The Brood-Queen", giver: "tombrobber", zone: BAZAAR.name, minLevel: 41, auto: true,
    description: "In the dry cistern pit under the bazaar, a scorpion the size of a cart nests on the rope-men's bones.",
    offer: ["A sting that size... that is no common scorpion. That is a queen, and a queen means a nest.", "Kill her, and burn the eggs. If they hatch, nobody goes down that well again."],
    acceptText: "On my way",
    steps: [
      { type: "kill", zone: BAZAAR.name, kinds: ["scorpion"], goal: 1, own: true,
        summon: { parts: ["scorpion"], level: 42, title: "The Brood-Queen", hpMult: 5, ...sumAt(...inRoom(BAZAAR, 5)) },
        text: "Slay the Brood-Queen in the scorpion pit", banner: ["New quest", "The Brood-Queen"], obj: "The Brood-Queen slain: {n} / {goal}", nag: "Her pit is in the south-east of the bazaar, behind a door." },
      { type: "use", zone: BAZAAR.name, objects: BROOD_EGGS, chest: false, text: "Burn her 3 egg clutches", banner: ["She is dead", "Burn her 3 egg clutches"],
        obj: "Clutches burnt: {n} / {goal}", nag: "{n} of {goal}. In her pit." },
    ],
    outro: ["Behind the egg clutches, a door of green copper stands open, its seal broken from the inside.", "The stair beyond goes down to the Vault of the Water-Kings, and the air from it smells of myrrh and old water."],
    reward: arcReward(41),
    after: "No more eggs. Good. Now, about that vault...",
  },
  {
    id: "canopic", title: "The Canopic Seals", giver: "tombrobber", zone: VAULT.name, minLevel: 42, auto: true,
    description: "In the Vault, the Water-Kings' hearts lie sealed in canopic urns. The Veiled Circle's grave-robbers are trying to open them to wake the last king.",
    offer: ["Veiled ones? Down here? Then they want what I want, only worse. Not gold. Him.", "The kings' hearts are kept in sealed urns. Break the seals before the Veiled do it their way, and they cannot wake him whole. And thin out those robed thieves while you are at it."],
    acceptText: "On my way",
    steps: [
      { type: "use", zone: VAULT.name, objects: CANOPIC, chest: false, text: "Break the seals of 4 canopic urns in the Vault", banner: ["New quest", "The Canopic Seals"],
        obj: "Seals broken: {n} / {goal}", nag: "{n} of {goal}. In the embalmers' room, the dry canal and the treasury." },
      { type: "kill", zone: VAULT.name, kinds: ["veiled"], goal: 8, text: "Slay 8 of the Veiled grave-robbers", banner: ["They saw you", "Slay 8 of the Veiled grave-robbers"],
        obj: "Veiled slain: {n} / {goal}", nag: "{n} of {goal}." },
    ],
    outro: ["As the last seal cracks, water runs out of the urn. Real water, clear and cold, after a thousand years in the dark.", "And from the throne room at the bottom of the vault, something very old takes a long, dry breath."],
    reward: arcReward(42),
    after: "Water, from a dead man's heart. I have robbed a hundred tombs and never seen that.",
  },
  {
    id: "waterking", title: "The Last Water-King", giver: "tombrobber", zone: "The Water-King's Throne", minLevel: 43, auto: true,
    description: "Ammun-Sa, last of the Water-Kings who ruled Kharsun when it had rivers, is awake on his throne. Half woken, half whole, and very thirsty.",
    offer: ["He is awake. I can feel it from up here. The well water has gone salt.", "Whatever is left of him, end it. Then the vault is ours, and Kharsun keeps what little water it has."],
    acceptText: "To the throne",
    steps: [
      { type: "kill", zone: "The Water-King's Throne", kinds: ["sanddead"], goal: 1, own: true,
        summon: { parts: ["sanddead"], level: 44, title: "Ammun-Sa, the Last Water-King", hpMult: 7, x: (WATER_THRONE.x + 0.5) * TILE, y: (WATER_THRONE.y - 1.5) * TILE,
          voice: {
            wake: ["Who breaks the seals of my fathers?", "I ruled when this sand was a sea of barley. Kneel, and I may let you drink.", "No? Then you will be my water."],
            taunt: ["Kharsun had nine rivers. I drank them all.", "Thirst. A thousand years of thirst. You cannot imagine.", "Your Sunwright burns. I only dry.", "My hearts are broken, thief. I still have yours."],
            half: ["Rise, my people! Your king is thirsty!"],
            death: ["Water... at last... it is so cold..."],
          } },
        text: "Slay Ammun-Sa on his throne", banner: ["New quest", "The Last Water-King"], obj: "The Last Water-King slain: {n} / {goal}",
        nag: "His throne is at the bottom of the Vault, behind iron bars. An old rope there leads back up to Kharsun." },
    ],
    outro: ["Ammun-Sa crumbles into dry sand, and the sand into dust. Under his throne, a spring you can hear but not see begins to run again.", "An old rope hangs at the back of the hall, straight up the well-shaft to Kharsun. Zahir will be waiting."],
    reward: arcReward(44, true),
    after: "The well water is sweet again. You have done more for this city than all its kings. Take your share.",
  },
];

// -- Act 1: Gravemoor Cemetery, the Empty Grave (Lv 15; docs/quest-concepts-progress.md #3) --
const GRAVE = "Gravemoor Cemetery";
const GRAVE_STONES = [near("grave_stone1", "grave", "Toppled gravestone", "Set it upright", 186, 136), near("grave_stone2", "grave", "Toppled gravestone", "Set it upright", 212, 136),
  near("grave_stone3", "grave", "Toppled gravestone", "Set it upright", 199, 151)];
/** The four fresh graves; only one is empty (GRAVE_QUESTS pick.answer, checked on the server). */
const FRESH_GRAVES = [near("grave_tam", "grave", "Fresh grave: Tam Ashby, smith", "Dig", 184, 145), near("grave_nan", "grave", "Fresh grave: Nan Hesketh", "Dig", 194, 131),
  near("grave_corin", "grave", "Fresh grave: Corin Vell, boatwright", "Dig", 205, 131), near("grave_jory", "grave", "Fresh grave: Jory Pike, drover", "Dig", 214, 146)];
const GRAVE_QUESTS: QuestDef[] = [
  {
    id: "emptygrave", title: "The Empty Grave", giver: "sexton", zone: GRAVE, minLevel: 15,
    description: "Amos, the sexton of Gravemoor, buried four this month. Three graves have settled as earth does over a coffin. One has not. Find out which one is empty, and leave the others sleeping.",
    offer: [
      "Mind your feet. The dead don't lie easy in Gravemoor these days, and the living are worse.",
      "Four buried this month. Three graves have sunk the way earth does over a coffin. One hasn't. Thirty years with a spade, and I know a grave with nothing in it when I walk on it.",
      "Somebody has been out at night, too, kicking over the old stones round them. Set them upright. Then ask the mourners at the wall who saw what, and dig the one that is empty.",
      "Dig the wrong one and you'll wake what lies in it. Don't say I didn't warn you.",
    ],
    acceptText: "I'll find the empty grave",
    steps: [
      { type: "use", zone: GRAVE, objects: GRAVE_STONES, chest: false, text: "Set the 3 toppled gravestones upright", banner: ["New quest", "The Empty Grave"],
        obj: "Gravestones set right: {n} / {goal}", nag: "{n} of {goal}. Kicked over in the night, round the fresh graves." },
      { type: "talk", zone: GRAVE, npcs: ["mourner1", "mourner2", "mourner3"], text: "Hear out the three mourners at the cemetery wall", banner: ["The stones stand again", "Hear out the mourners"],
        obj: "Mourners heard: {n} / {goal}", nag: "{n} of {goal}. They keep to the north wall, by the gate. They won't come in among the dead.",
        says: {
          mourner1: ["Tam sat in our parlour three days before they nailed the lid. Cold as his forge in winter, my Tam.", "I closed his eyes myself. He's in that ground."],
          mourner2: ["My gran, Nan Hesketh, went in her sleep, ninety winters old. Half the lane sat up with her.", "Jory Pike owed money up and down the Coast Road, they say. But I helped pull him out of the ford. Blue as a mussel, poor lad."],
          mourner3: ["Corin Vell. Best boatwright on the coast, and my partner. Drowned off Saltmere, they told me.", "Nobody saw him go in. Nobody saw the body, either. The coffin came up the Coast Road already nailed shut.", "Four men to lift it, and it shifted in their hands. Rattled, like loose stones."],
        },
        accept: "Thank you for telling me" },
      { type: "pick", zone: GRAVE, text: "Dig up the empty grave", banner: ["Three mourners, three stories", "Dig up the empty grave"],
        obj: "Dig up the one empty grave", nag: "Only one of the four fresh graves is empty. Dig the wrong one and you wake what lies in it.",
        pick: { objects: FRESH_GRAVES, answer: 2, back: 1, sets: { flag: "grave", v: 1 },
          wrong: { parts: ["skeleton"], level: 17, title: "The Disturbed Dead", hpMult: 3, ...sumAt(199, 140) } } },
    ],
    outro: [
      "The spade rings on wood, then the lid gives. Corin Vell's coffin is full of beach stones.",
      "Under them, one line in a boatwright's hand: \"Tell Hollis I'm sorry. The Redfang wanted my debts or my neck. Let them think me drowned.\" Corin Vell is alive, and somebody out there is still looking for him.",
    ],
    reward: arcReward(15),
    after: "A coffin of stones. I'll fill that grave with something that stays put. Thank you.",
  },
];

// -- Act 2: Kharsun, the Crown in the Sand (Lv 38-39; docs/quest-concepts-progress.md #11) --
const KHARSUN_Z = "Kharsun, the Buried City";
const SAND_SEAL = near("sand_seal1", "cistern", "Cistern stamped with a crown", "Break the seal", 51, D(189));
const CROWN_TOMB = at(74, D(178), 4, "The crowned tomb");
const OSTREVAR_SEALS = [near("sand_crown1", "seal", "Ostrevar's seal", "Break", 72, D(176)), near("sand_crown2", "seal", "Ostrevar's seal", "Break", 77, D(177))];
const SANDCROWN_QUESTS: QuestDef[] = [
  {
    id: "crownsand", title: "The Crown in the Sand", giver: "tombrobber", zone: KHARSUN_Z, minLevel: 38,
    description: "Zahir found a cistern in Kharsun stamped with a crown he has seen before, on the grave-gold the valley traders carry. Why would a northern king mark a desert cistern?",
    offer: [
      "You're from the valley, yes? Then look at this. I scraped it off a cistern lid in the old west quarter.",
      "A crown. Not a sun, not a veil. Five points, like the old gold the valley traders bring.",
      "What is a northern king's seal doing under the sand? Break it and follow where it leads. I'll keep the rope tied, in case.",
    ],
    acceptText: "I'll follow the crown",
    steps: [
      { type: "use", zone: KHARSUN_Z, objects: [SAND_SEAL], chest: false, text: "Break the crowned seal on the cistern", banner: ["New quest", "The Crown in the Sand"],
        obj: "Break the crowned seal", nag: "The cistern is in the west quarter, inside the broken walls." },
      { type: "reach", zone: KHARSUN_Z, at: CROWN_TOMB, text: "Find the tomb the cistern leads to", banner: ["The water runs out of it", "Follow it to the tomb"],
        obj: "Find the crowned tomb in Kharsun", nag: "The channel under the seal ran east. Follow it." },
      { type: "use", zone: KHARSUN_Z, objects: OSTREVAR_SEALS, chest: false, text: "Break Ostrevar's 2 seals in the tomb", banner: ["A tomb with a crown", "Break Ostrevar's seals"],
        obj: "Ostrevar's seals broken: {n} / {goal}", nag: "{n} of {goal}. Inside the tomb walls." },
    ],
    outro: ["Behind the second seal there is no body. Only a throne-shaped hollow in the stone, and a name cut over it in valley letters: OSTREVAR.", "Outside, the sand begins to stir and stand."],
    reward: arcReward(38),
    after: "Ostrevar, the Hollow King your valley buried? Then what is his seal doing in Kharsun?",
  },
  {
    id: "envoy", title: "Ostrevar's Envoy", giver: "tombrobber", zone: KHARSUN_Z, minLevel: 39, auto: true,
    description: "Breaking Ostrevar's seals woke what was left to guard them: an envoy of the Hollow King, a thousand miles from his throne.",
    offer: ["The sand outside the tomb is moving. Something stands up in it, with a crown on its breastplate.", "Whatever the Hollow King left here, he left it to wait."],
    acceptText: "On my way",
    steps: [
      { type: "kill", zone: KHARSUN_Z, kinds: ["sanddead"], goal: 1, own: true,
        summon: { parts: ["sanddead"], level: 39, title: "Ostrevar's Envoy", hpMult: 7, ...sumAt(74, D(183)),
          voice: {
            wake: ["You broke the crowned seals. He felt it, even in the dark.", "You buried his crown in the valley. A crown is not a king."],
            taunt: ["Kharsun paid him in water. Your valley paid him in blood.", "There are lands past the sand you have never seen. He is owed there too.", "I have waited a thousand years. I can wait for you to tire."],
            half: ["My king! Lend me your cold!"],
            death: ["He keeps... other crowns..."],
          } },
        text: "Slay Ostrevar's Envoy", banner: ["New quest", "Ostrevar's Envoy"], obj: "Ostrevar's Envoy slain: {n} / {goal}",
        nag: "It rose from the sand outside the crowned tomb." },
    ],
    outro: [
      "The Envoy falls to sand and rusted iron. In its chest lies a token of black iron, cold as deep water and stamped with the crown.",
      "On its back, scratched into the metal, is a map of no land you know. Cold peaks, and a crown drawn over them.",
    ],
    reward: arcReward(39, true),
    after: "Snow, on a map from a desert tomb. I've sold maps all my life. I have never seen that coast.",
  },
];

// -- Act 1: Misty Marsh → Brinewood, the Last Lantern (Lv 10; docs/quest-concepts-progress.md #1). --
const LAMP_POST = at(62, 108, 2, "The drowned lamp post");
const LAST_LANTERN = near("lantern_last", "lastlantern", "The last lamplighter's lantern", "Take up", 60, 110);
const ELOW_SHRINE = at(34, 171, 2.5, "Saint Elow's shrine");
const WARD_LAMPS = [near("brine_wardlamp1", "wardlamp", "Cold ward-lamp", "Light", 36, 165), near("brine_wardlamp2", "wardlamp", "Cold ward-lamp", "Light", 40, 175),
  near("brine_wardlamp3", "wardlamp", "Cold ward-lamp", "Light", 29, 170)];
const LIGHTS_QUEST = QUESTS.findIndex((d) => d.steps.some((s) => s.objects === LANTERNS));
const LANTERN_QUESTS: QuestDef[] = [
  {
    id: "lastlantern", title: "The Last Lantern", giver: "monk", zone: Z.brine.name, minLevel: 10,
    description: "Brother Aldric says one of the lamplighters' spirit lanterns still burns, out in the drowned part of Misty Marsh. It must be carried by hand to Saint Elow's shrine in Brinewood before the light fades, and every blob on the way will be drawn to it.",
    offer: [
      "You lit the spirit lanterns, so you have seen what a little light does to the Gloam's pieces.",
      "When the lamplighters fell, the last of them left his lantern hanging on a post in the marsh. Forty years it has burned, and it is the last one.",
      "Carry it to Saint Elow's shrine in Brinewood and light the three ward-lamps from it. Hold it in your hands, mind. It will not share them with spells, and no portal will take it.",
      "Water and night eat the flame, and so does setting it down. Keep to dry ground and keep walking. Every blob for a mile will smell the light and come. If your arms tire, a friend beside you may take it for a stretch.",
    ],
    acceptText: "I'll carry the light",
    steps: [
      { type: "reach", zone: Z.marsh.name, at: LAMP_POST, text: "Find the drowned lamp post in Misty Marsh", banner: ["New quest", "The Last Lantern"],
        obj: "Find the drowned lamp post in Misty Marsh", nag: "South in the marsh, where the pools run together. Look for a light low over the water." },
      { type: "carry", zone: Z.brine.name, text: "Carry the last lantern to Saint Elow's shrine in Brinewood", banner: ["It still burns", "Carry it to Brinewood"],
        obj: "Carry the lantern to Saint Elow's shrine", nag: "No spells while you hold it. Keep out of the water and keep walking. Set it down if you must fight.",
        hint: "Press E to take it up. The light fades faster in water, at night and on the ground, and blobs are drawn to it. Your skills are locked while you carry it, but plain attacks still work: press Z to set it down and fight. Portals will not take it. A friend beside you can carry it for a stretch.",
        carry: { take: LAST_LANTERN, to: ELOW_SHRINE, light: 100, drain: 0.5, waterMult: 2, darkMult: 1.5, groundMult: 2, lure: 1.25 } },
      { type: "use", zone: Z.brine.name, objects: WARD_LAMPS, chest: true, text: "Light the 3 ward-lamps round the shrine", banner: ["The shrine is reached", "Light the ward-lamps"],
        obj: "Ward-lamps lit: {n} / {goal}", nag: "{n} of {goal}. They stand in a ring round Saint Elow's shrine." },
    ],
    outro: ["The third ward-lamp catches, and the lantern in your hand gutters out at last, as if it had only been waiting.", "For a moment the pines smell of lamp oil and incense, and the blobs in the wood go quiet."],
    reward: arcReward(10),
    after: "Forty years that lantern burned. Now three lamps burn from it, and you lit them. Mind they stay lit.",
  },
];

// -- Act 1: Millbrook Mill, Hold the Wheel (Lv 4, after Millbrook's Bad Water; docs/quest-concepts-progress.md #2). --
const ODO = npcById("miller")!;
const WHEEL_QUESTS: QuestDef[] = [
  {
    id: "holdwheel", title: "Hold the Wheel", giver: "miller", zone: "Millbrook Mill", minLevel: 4,
    description: "Blobs keep coming down the millrace at Millbrook Mill. Odo will open and clear the sluice by hand, but only if you stay close and keep the jelly off him while he works.",
    offer: [
      "They're coming down the race again. Not clots this time, the live ones, a few at a time.",
      "Whatever you did up at the spring, it wasn't the end of it. I have to open the sluice and clear it by hand, and I can't do that with blobs climbing my legs.",
      "Stand by me a minute and a half and keep them off me. Don't wander off. When the sluice is clear, we'll see what's been sending them.",
    ],
    acceptText: "I'll stand with you",
    steps: [
      { type: "talk", npc: "miller", zone: "Millbrook Mill", text: "Tell Odo when you're ready", banner: ["New quest", "Hold the Wheel"], obj: "Tell Odo you're ready (Millbrook Mill)",
        say: ["Ready? Once I open the sluice there's no closing it till it's clear. They'll come for me, not for you, so stay close and put yourself between."], accept: "Open the sluice" },
      { type: "hold", zone: "Millbrook Mill", text: "Stay near Odo and keep the blobs off him while he clears the sluice", banner: ["Here they come", "Keep the blobs off Odo"],
        obj: "Stay near Odo and protect him", nag: "Stay close and keep them off me! If you wander off, I'm shutting the sluice again.",
        hold: { at: { x: ODO.x, y: ODO.y, r: 7 * TILE, label: "Odo's mill" }, ms: 90_000, npc: "miller", npcHp: 300, npcDmg: 5,
          waves: { kinds: ["slime"], n: [2, 3], everyMs: 15_000, level: [3, 5] }, maxAlive: 6, leaveMs: 5000 } },
      { type: "kill", zone: "Millbrook Mill", kinds: BLOB_KINDS, goal: 1, own: true,
        summon: { parts: ["motherblob", "slime", "slime", "slime"], level: 5, title: "The Millrace Glutton", voice: { wake: ["Flour... wet flour... mine."], taunt: ["Hungry. Always hungry.", "Little miller. Little wheel. Gulp."], half: ["Cut me and I only come apart. I come back together."], death: ["Cold... the race... runs on without me..."] }, ...sumAt(108, 41) },
        text: "Slay the Millrace Glutton", banner: ["The sluice is clear", "Something big comes down the race"], obj: "The Millrace Glutton slain: {n} / {goal}",
        nag: "It came down the race with the last of the water. It's in the mill yard." },
    ],
    outro: ["The Glutton bursts across the mill yard. Inside it: half a sack of Odo's flour and a sluice key he lost in the spring.", "Behind you the wheel takes the full race again and turns, steady and loud."],
    reward: arcReward(4, true),
    after: "Hear her? She never ran so sweet. If anyone asks, you stood by Odo.",
  },
];

// -- Act 2: the Thornspire Heights, Unseen (Lv 43, after the Mirror Path; docs/quest-concepts-progress.md #4). Draft text. --
/** The way up to the Sanctum's postern, on open ground: hidden at each one, the hero walks to the next without being seen. */
const UNSEEN_CPS = [at(218, 388, 2.5, "The foot of the climb"), at(214, 380, 2.5, "The goat-track under the west cliffs"), at(226, 364, 2.5, "The broken shelf"),
  at(248, 362, 2.5, "The rocks below the east wall")];
const POSTERN = near("spire_postern", "postern", "A postern in the Sanctum wall", "Slip through", 253, 352);
const UNSEEN_QUESTS: QuestDef[] = [
  {
    id: "unseen", title: "Unseen", giver: "defector", zone: "The Thornspire Heights", minLevel: 43,
    description: "Nasrin left the Veiled Circle, and she knows its habits. The mirror-watch holds the Thornspire Heights, but there is a postern in the Sanctum's east wall that the adepts use when they do not want to be counted. Climb to it unseen.",
    offer: [
      "The mirrors are turned. Good. Now the hard part: the watch.",
      "The Circle's mirror-watch sees all the Heights by day. I stood it myself, for nine years. I know where it looks and where it doesn't.",
      "There are four hiding places on the climb. Stand in one and you slip out of sight. Walk to the next. If anything notices you, a sphinx, an adept, a scorpion, or if anything so much as hurts you, you are dragged back to the last place you hid.",
      "Go by night if you can. Keep to the trees and the rocks. At the top, in the east wall, is the postern.",
    ],
    acceptText: "I'll go unseen",
    steps: [
      { type: "talk", npc: "defector", zone: "The Thornspire Heights", text: "Tell Nasrin you're ready", banner: ["New quest", "Unseen"], obj: "Tell Nasrin you're ready (foot of the Thornspire)",
        say: ["Four hiding places. Stand in one to hide, then walk to the next. Night is better, and cover is better still: trees, rocks, cliffs. If anything sees you or strikes you, you go back to the last one."], accept: "I'm ready" },
      { type: "unseen", zone: "The Thornspire Heights", text: "Climb the Heights unseen, hiding at each of the four places", banner: ["Keep low", "Climb without being seen"],
        obj: "Hiding places reached unseen: {n} / {goal}", nag: "{n} of {goal}. Keep to the trees, the rocks and the dark. If you are seen or struck, back to the last hiding place.",
        hint: "Stand at a hiding place to slip out of sight. If any monster notices you, or anything hurts you, you are dragged back to the last one. Night and cover (trees, rocks) make you harder to spot.",
        unseen: { checkpoints: UNSEEN_CPS, night: 0.65, cover: 0.6, floor: 0.35 } },
      { type: "use", zone: "The Veiled Sanctum", objects: [POSTERN], chest: true, text: "Slip through the postern into the Sanctum", banner: ["Not a soul saw you", "Open the postern"],
        obj: "Slip through the postern", nag: "The postern is in the Sanctum's east wall, above the last rocks." },
    ],
    outro: ["The postern opens on a store-room of lamp oil and folded veils. On the shelf, a ledger: every adept who left by this door, and when.", "Nasrin's name is in it. Nine years ago, and never again."],
    reward: arcReward(43),
    after: "You walked through them like smoke. I never managed it. Not once in nine years.",
  },
];

// -- Act 2: the Vault of the Water-Kings, Two Hands (Lv 42, Undercity arc in the Vault; docs/quest-concepts-progress.md #8). Draft text. --
/** The seal hall: the Vault's hall of statues (chamber 1), its two seals 11 tiles apart across it (tests: a walk between them beats soloMs). */
const SEAL_HALL = at(...inRoom(VAULT, 1), 4, "The hall of the twin seals");
const TWIN_SEALS: [QuestObject, QuestObject] = [near("vault_seal1", "seal", "West seal of the Water-Kings", "Turn", ...inRoom(VAULT, 1, -7, -2)),
  near("vault_seal2", "seal", "East seal of the Water-Kings", "Turn", ...inRoom(VAULT, 1, 6, -2))];
const TWOHANDS_QUESTS: QuestDef[] = [
  {
    id: "twohands", title: "Two Hands", giver: "tombrobber", zone: VAULT.name, minLevel: 42,
    description: "Zahir knows of a door in the Vault of the Water-Kings, sealed with two seals set too far apart for one thief to turn at once.",
    offer: [
      "The Water-Kings trusted nobody. Not even one priest with both keys.",
      "In the Vault's hall of statues there's a door with two seals, one on each side of the hall. Turn both within two seconds of each other and it opens. Turn one alone and it waits a little, then locks again.",
      "Bring a friend, one at each seal. Alone you get six seconds, and you'll have to run for it. I was never quick enough.",
    ],
    acceptText: "Two hands it is",
    steps: [
      { type: "reach", zone: VAULT.name, at: SEAL_HALL, text: "Find the hall of the twin seals in the Vault", banner: ["New quest", "Two Hands"],
        obj: "Find the hall of the twin seals (the Vault's hall of statues)", nag: "Down in the Vault, in the hall of statues past the stair." },
      { type: "sync", zone: VAULT.name, text: "Turn both seals within 2 seconds of each other", banner: ["Two seals", "Turn both at once"],
        obj: "Turn both seals together", nag: "Both together. A friend at the far seal, or a creature of yours standing there.",
        hint: "With a friend, turn both seals within 2 seconds. Alone, you have 6 seconds to turn one and run to the other. A summoner's pet standing by the far seal turns it at the same moment.",
        sync: { seals: TWIN_SEALS, windowMs: 2000, soloMs: 6000, summonReach: 2 * TILE } },
    ],
    outro: ["Both seals grind round together, and the floor of the hall slides open on a stair. Something at the bottom of it stands up.", "It has a hand on each wall, and it is looking at you."],
    reward: arcReward(42),
    after: "Two seals, two hands. The kings were cleverer than me. Not cleverer than you.",
  },
  {
    id: "twinkeeper", title: "The Keeper of the Twin Seals", giver: "tombrobber", zone: VAULT.name, minLevel: 42, auto: true,
    description: "The twin seals guarded something that was left to guard them back.",
    offer: ["It comes up the stair, slow, one hand on each wall.", "The Water-Kings left it to keep their door. It has kept it for a thousand years, and never let a thief past."],
    acceptText: "Fight",
    steps: [
      { type: "kill", zone: VAULT.name, kinds: ["sanddead"], goal: 1, own: true,
        summon: { parts: ["sanddead"], level: 43, title: "Keeper of the Twin Seals", hpMult: 7, voice: { wake: ["Two hands turned. Two hands... who sent two?"], taunt: ["Thieves count to two. Kings count to one.", "The door is kept. The door is always kept."], half: ["I kept it a thousand years. I can keep it a thousand more."], death: ["The seals... turn... and no one left to ask..."] }, ...sumAt(...inRoom(VAULT, 1, 0, 1)) },
        text: "Slay the Keeper of the Twin Seals", banner: ["The seals are turned", "The Keeper of the Twin Seals"], obj: "The Keeper slain: {n} / {goal}", nag: "It stands in the hall of the twin seals." },
    ],
    outro: ["The Keeper folds down onto the stair it kept. Behind it, the Water-Kings' door stands open on a dry room full of gold."],
    reward: arcReward(42, true),
    after: "Gold, behind two seals, and you kept your hands. Better than most who came looking.",
  },
];

/** The zone arcs, each its own chain (QuestChain.local): Act 1 then Act 2. */
export const ZONE_ARCS: { id: string; name: string; quests: QuestDef[]; needs?: (p: Quester | undefined) => boolean }[] = [
  { id: "mill", name: "Millbrook's Bad Water", quests: MILL_QUESTS },
  { id: "hunt", name: "The Lost Hunt", quests: HUNT_QUESTS },
  { id: "thornwood", name: "Thornwood Whispers", quests: THORN_QUESTS },
  { id: "coast", name: "The Wreckers of Saltwind", quests: COAST_QUESTS },
  { id: "crags", name: "Sky-Iron", quests: CRAG_QUESTS },
  { id: "wastes", name: "The Bone Road", quests: WASTE_QUESTS },
  { id: "jackal", name: "Jackal Springs", quests: JACKAL_QUESTS },
  { id: "dunes", name: "The Branded Clans", quests: DUNE_QUESTS },
  { id: "spire", name: "The Mirror Path", quests: SPIRE_QUESTS },
  { id: "crypt", name: "The Lantern Crypt", quests: CRYPT_QUESTS },
  { id: "under", name: "The Undercity of Kharsun", quests: UNDER_QUESTS },
  // the quest concepts (docs/quest-concepts-progress.md): appended, chain indices are sent by the client
  { id: "grave", name: "The Empty Grave", quests: GRAVE_QUESTS },
  { id: "sandcrown", name: "The Crown in the Sand", quests: SANDCROWN_QUESTS, needs: (p) => (chainState(p, SUN_CHAIN)?.questId ?? 0) > SUN_QUESTS.findIndex((d) => d.id === "kharsun") },
  { id: "lantern", name: "The Last Lantern", quests: LANTERN_QUESTS, needs: (p) => (chainState(p, 0)?.questId ?? 0) > LIGHTS_QUEST },
  { id: "wheel", name: "Hold the Wheel", quests: WHEEL_QUESTS, needs: (p) => chainDone(p, chainIx("mill")) },
  { id: "unseen", name: "Unseen", quests: UNSEEN_QUESTS, needs: (p) => (chainState(p, chainIx("spire"))?.questId ?? 0) > SPIRE_QUESTS.findIndex((d) => d.id === "mirrorpath") },
  { id: "twohands", name: "Two Hands", quests: TWOHANDS_QUESTS, needs: (p) => (chainState(p, chainIx("under"))?.questId ?? 0) >= UNDER_QUESTS.findIndex((d) => d.id === "canopic") },
];

// ---- Side arcs: short local chains that may end on a hand-in (unlike ZONE_ARCS), packed in Player.arcs the same way ----

// Two Letters (Lv 19, after the Redfang Debt; docs/quest-concepts-progress.md #5): law or mercy for Saltmere's informer
const LETTER_QUESTS: QuestDef[] = [
  {
    id: "twoletters", title: "Two Letters", giver: "oldfisher", zone: SALT.name, minLevel: 19,
    description: "Pell brought two letters down from the Redfang chief's tent. One names the Saltmere girl who sold the town to the bandits. The other is her own, never sent. Old Garrick can't choose which to send. You can.",
    offer: [
      "Pell brought more than his own skin down from the chief's tent. Two letters. Sit, and read them with me.",
      "The first is a list in a careful hand: every boat, every sailing, every night the watch-fire was out. Signed with a mark I know. Ilka, the net-mender's girl. She sold Saltmere to the Redfang.",
      "The second is hers too, and never sent. They held her little brother in that camp. Every list bought him another week.",
      "Hale should have the first. Or Ilka should have the second back, and a head start. I'm too old to choose.",
    ],
    acceptText: "Show me the letters",
    steps: [
      { type: "choose", npc: "oldfisher", zone: SALT.name, text: "Choose which letter to carry", banner: ["New quest", "Two Letters"], obj: "Choose a letter (Old Garrick, Saltmere beach)",
        say: ["The list for Captain Hale, or the letter back to Ilka. Whichever you carry, the other goes in my fire."],
        choose: { flag: "letters", options: [{ label: "Give the list to Captain Hale", v: 1 }, { label: "Take Ilka her letter, and warn her", v: 2 }] }, nag: "" },
      { type: "talk", npc: "captain", onlyIf: { flag: "letters", v: [1] }, text: "Take the list to Captain Hale", banner: ["The law, then", "Take the list to Captain Hale"],
        obj: "Take the list to Captain Hale (Oakvale, inside the east gate)",
        say: [
          "A list of sailings, signed with a mark. So the Redfang had an ear in Saltmere all along, and we never looked.",
          "I'll send two men down the Coast Road at dawn. It is the law, and the law is what keeps the next village from being sold.",
          "You did right, even if it doesn't feel like it. The watch pays its debts. My quartermaster will see you right.",
        ],
        accept: "Hand over the list", nag: "Hale will want that list." },
      { type: "talk", npc: "ilka", onlyIf: { flag: "letters", v: [2] }, text: "Give Ilka her letter", banner: ["Mercy, then", "Find Ilka by the Redfang fence"],
        obj: "Give Ilka her letter (outside the Redfang fence)",
        say: [
          "That's my hand. Where did you... the chief's tent. Of course it was.",
          "My brother is free now, they say. I've waited by this fence for word of him. None came, and I can't go home.",
          "Garrick still holds the list, and Hale will hear of me soon enough. So I won't be here. There are boats on the beach that don't ask names.",
          "Thank you. I won't forget it. Neither will the people on those boats.",
        ],
        accept: "Go quickly, before the watch comes", nag: "She waits outside the Redfang fence, by the west gate." },
    ],
    reward: { xp: 0, gold: 250, potions: 3 },
    after: "Done is done. One letter in the fire, one out in the world. Sit a while, friend.",
  },
];
// Penance (Lv 25, after the Hide Rite for a hero who took Ursk's bargain; docs/quest-concepts-progress.md #6): draft text
const PENANCE_QUESTS: QuestDef[] = [
  {
    id: "penance", title: "Penance", giver: "captain", zone: HALLS.name, minLevel: 25,
    description: "Captain Hale knows what you brought up out of the Mawdeep. The beast-folk still wear Ursk's charms sewn into their skins. Take six back, let Elder Rowan burn them, and the watch may trust you again.",
    offer: [
      "Sit. I'll say this once. I can't un-smell what you brought up from the Mawdeep.",
      "The beast-folk still wear Ursk's charms sewn into their skins. Every one was a trapper's, once. Take six and bring them up.",
      "Elder Rowan knows the old rites. He'll burn them properly. Then come back to me.",
    ],
    acceptText: "I'll bring them up",
    steps: [
      { type: "collect", item: "charm", kinds: BEAST_FOLK, chance: { gnawkin: 0.3, tuskborn: 0.45, silkwretch: 0.4, duskwing: 0.4 }, zone: HALLS.name, goal: 6,
        text: "Take 6 Hide Charms from the beast-folk", banner: ["Penance", "Take 6 Hide Charms"], obj: "Hide Charms: {n} / {goal}",
        nag: "{n} of {goal}. The Gnawing Halls are still full of them." },
      { type: "talk", npc: "druid", text: "Bring the charms to Elder Rowan", banner: ["Six charms", "Bring them to Elder Rowan"],
        obj: "Bring the charms to Elder Rowan (the village bonfire)",
        say: [
          "Six Hide Charms. Hale sent you, then.",
          "Bone needle and gut thread. Give them here. The fire takes back what the rite made. Not what she sewed into you: that stays. That was the price.",
          "But these men's names go up with the smoke. That much we can give them.",
        ],
        accept: "Give the charms to the fire" },
      back("captain", "Captain Hale", "east gate", [
        "Rowan says it's done. Six charms, six names, and the smoke went straight up.",
        "The mark stays on you. I've seen it. But I'll stop counting it against you. That's the most the watch can give.",
        "Here. The watch pays its debts, even the awkward ones.",
      ], "Claim reward", "Rowan first. Then we'll talk."),
    ],
    reward: { xp: 0, gold: 300, potions: 3 },
    after: "Quiet on the walls. The men have stopped keeping upwind of you. I'll take that.",
    sets: { flag: "bargain", v: 3 }, // penance done: the cold lines end (the trait stays)
  },
];
/** Side arcs (QuestChain.local, after ZONE_ARCS in CHAINS): `needs` gates the first offer. */
export const SIDE_ARCS: { id: string; name: string; quests: QuestDef[]; needs?: (p: Quester | undefined) => boolean }[] = [
  { id: "letters", name: "Two Letters", quests: LETTER_QUESTS, needs: (p) => chainDone(p, RED_CHAIN) },
  { id: "penance", name: "Penance", quests: PENANCE_QUESTS, needs: (p) => choiceOf(p, "bargain") === 1 && chainDone(p, BEAST_CHAIN) },
];
const ARC_OBJECTS: QuestObject[] = [...ZONE_ARCS, ...SIDE_ARCS].flatMap((a) => a.quests.flatMap((d) => d.steps.flatMap(stepObjects)));

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
        hint: "It sits on hotbar key 1. Point the mouse at a blob and press 1 to use it. No magic inside Oakvale: the villagers hate it!",
        nag: "Point at a blob and press 1. But not inside the village!" },
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
export const tutorialDone = (p: Quester | undefined) => p?.tut === undefined || unpackQuest(p.tut).questId >= TUT_QUESTS.length;
/** Can this chain offer new quests yet? Every story waits for the guided first quest. */
export const chainOpen = (p: Quester | undefined, c: number) =>
  c === TUT_CHAIN || (tutorialDone(p) && (c !== CROWN_CHAIN || STORY_CHAINS.every((s) => storyDone(p, s)))
    && (c !== SUN_CHAIN || (chainDone(p, CROWN_CHAIN) && chainDone(p, BEAST_CHAIN))) // the Second Sun: once the waygate is awake (shared/act2.ts)
    && (!CHAINS[c]?.needs || CHAINS[c].needs!(p))); // an arc that follows another story (QuestChain.needs)
export const BEAST_CHAIN = 5;
/** The Redfang Debt (Two Letters follows it). */
export const RED_CHAIN = 2;
export const SUN_CHAIN = 6;
/** The Hollow Crown waits for the three stories it ties together. */
export const CROWN_CHAIN = 4;
const STORY_CHAINS = [0, 1, 2];
/** The Gloam's first story (quests 1-7) is what the Hollow Crown needs; the elemental wilds (8-11) are extra. */
export const GLOAM_STORY = 7;
const storyDone = (p: Quester | undefined, c: number) => c === 0 ? (chainState(p, 0)?.questId ?? 0) >= GLOAM_STORY : chainDone(p, c);
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
  /**
   * A zone quest arc (Murat 2026-11-10): a few quests given out in one zone by someone who lives there, each leading on
   * to the next. Its packed progress lives in the Player.arcs map under `packed` (one synced field for every arc).
   */
  local?: boolean;
  /** An arc's first offer waits for this (ZONE_ARCS / SIDE_ARCS `needs`): another story far enough along */
  needs?: (p: Quester | undefined) => boolean;
}
/** Pack / unpack a chain's progress into one number (QuestChain.packed). */
export const packQuest = (id: number, stage: number, count: number) => id * 10000 + Math.min(99, stage) * 100 + Math.min(99, count);
export const unpackQuest = (n: number) => ({ questId: Math.floor(n / 10000), questStage: Math.floor(n / 100) % 100, questCount: n % 100 });
export const CHAINS: QuestChain[] = [
  { id: "gloam", name: "The Gloam", quests: QUESTS, keys: ["questId", "questStage", "questCount"], version: QUEST_VERSION, verKey: "questVer" },
  { id: "bones", name: "The Pale Marshal", quests: BONE_QUESTS, keys: ["boneId", "boneStage", "boneCount"], version: 2, verKey: "boneVer", packed: "bone" },
  // packed since Act 2 (the Second Sun needed a synced field): saves keep the same three names
  { id: "redfang", name: "The Redfang Debt", quests: RED_QUESTS, keys: ["redId", "redStage", "redCount"], version: 3, verKey: "redVer", packed: "red" },
  { id: "tutorial", name: "First Steps", quests: TUT_QUESTS, keys: ["tutId", "tutStage", "tutCount"], version: 1, verKey: "tutVer", packed: "tut" },
  { id: "crown", name: "The Hollow Crown", quests: CROWN_QUESTS, keys: ["crownId", "crownStage", "crownCount"], version: 2, verKey: "crownVer", packed: "crown" },
  { id: "beast", name: "The Hide Rite", quests: BEAST_QUESTS, keys: ["beastId", "beastStage", "beastCount"], version: 2, verKey: "beastVer", packed: "beast" },
  { id: "sun", name: "The Second Sun", quests: SUN_QUESTS, keys: ["sunId", "sunStage", "sunCount"], version: 2, verKey: "sunVer", packed: "sun" },
  // the zone arcs (ZONE_ARCS), CHAINS[7..]: progress in the Player.arcs map, saved together under "arcs"
  ...ZONE_ARCS.map((a): QuestChain => ({ id: a.id, name: a.name, quests: a.quests, keys: [`${a.id}Id`, `${a.id}Stage`, `${a.id}Count`], version: 1, verKey: `${a.id}Ver`, packed: a.id, local: true, needs: a.needs })),
  // the side arcs (SIDE_ARCS) after them, kept the same way
  ...SIDE_ARCS.map((a): QuestChain => ({ id: a.id, name: a.name, quests: a.quests, keys: [`${a.id}Id`, `${a.id}Stage`, `${a.id}Count`], version: 1, verKey: `${a.id}Ver`, packed: a.id, local: true, needs: a.needs })),
];

// Player.arcs keeps reserved numbers under "$" keys (shared/questSteps.ts META): no chain may take one
for (const ch of CHAINS) if (ch.id.startsWith("$") || ch.packed?.startsWith("$")) throw new Error(`quest chain id ${ch.id}: "$" keys are reserved`);

/** Progress on one chain (chain undefined = the blob chain, so a Player passed as is reads as chain 0). */
export interface QuestState { questId: number; questStage: number; questCount: number; level?: number; chain?: number }
/** A player's progress on every chain: the Player schema fields (CHAINS[].keys). */
/** The zone arcs' packed progress by arc id: the Player's synced MapSchema, or a plain object in saves and tests. */
export type ArcMap = { get(k: string): number | undefined } | Record<string, number>;
export type Quester = { level?: number; questId?: number; questStage?: number; questCount?: number; bone?: number; redId?: number; redStage?: number; redCount?: number; tut?: number; crown?: number; beast?: number; red?: number; sun?: number; arcs?: ArcMap };
/** One arc's packed number out of the arcs map. */
export const arcValue = (m: ArcMap | undefined, k: string): number => {
  if (!m) return 0;
  const v = typeof (m as { get?: unknown }).get === "function" ? (m as { get(k: string): number | undefined }).get(k) : (m as Record<string, number>)[k];
  return typeof v === "number" ? v : 0;
};

/** Every chain's progress in one string: redraw keys for the dialog and the shop. */
export const questSig = (p: Quester | undefined) => CHAINS.map((_, c) => { const q = chainState(p, c); return q ? `${q.questId}.${q.questStage}.${q.questCount}` : ""; }).join(",");

/** One chain's progress, read from the player's fields. */
export function chainState(p: Quester | undefined, c: number): QuestState | undefined {
  if (!p) return undefined;
  const [a, b, n] = CHAINS[c].keys, r = p as Record<string, number | undefined>, pk = CHAINS[c].packed;
  if (pk && CHAINS[c].local) return { chain: c, ...unpackQuest(arcValue(p.arcs, pk)), level: p.level };
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
/** Steps whose count is a bitmask (one bit per object used / NPC talked to) rather than a number. */
const bitStep = (s: QuestStep) => s.type === "use" || (s.type === "talk" && !!s.npcs);
export function stepGoal(s: QuestStep): number {
  if (s.type === "use") return s.objects!.length;
  if (s.type === "talk" && s.npcs) return s.npcs.length;
  if (s.type === "pick" || s.type === "choose" || s.type === "sync") return 1;
  if (s.type === "unseen") return s.unseen!.checkpoints.length; // count = checkpoints reached
  return s.goal ?? 1;
}
/** Progress on a step (objects used and NPCs heard count bits). */
export function stepProgress(s: QuestStep, count: number): number {
  return Math.min(stepGoal(s), bitStep(s) ? popcount(count) : count);
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
  /**
   * A choice (QuestStep.choose): one button per option, each sends "quest" {chain, opt: v}. A page has either
   * `accept` or `options`, never both.
   */
  options?: { label: string; v: number }[];
  bye: string;
  /** Which chain the page belongs to */
  chain: number;
}

const chainIx = (id: string) => CHAINS.findIndex((ch) => ch.id === id);
/**
 * Who stands where only for some heroes (missing = always there). Tobin only comes home once freed; the Two Letters
 * people come and go with the choice made (shared/questSteps.ts CHOICES.letters: 1 law, 2 mercy).
 */
const PRESENCE: Record<string, (p: Quester | undefined) => boolean> = {
  fisher: (p) => (chainState(p, 0)?.questId ?? 0) > QUESTS.findIndex((d) => d.id === "lake"), // freeing him ends the quest: he runs home
  ilka: (p) => chainDone(p, RED_CHAIN) && !chainDone(p, chainIx("letters")), // gone once her letter is delivered either way
  quartermaster: (p) => chainDone(p, chainIx("letters")) && choiceOf(p, "letters") === 1,
  smuggler: (p) => chainDone(p, chainIx("letters")) && choiceOf(p, "letters") === 2,
};
/** Is this NPC standing there for this player? */
export function npcPresent(id: string, p: Quester | undefined): boolean {
  const f = PRESENCE[id];
  return !f || f(p);
}
/** Is the blob cocoon (with Tobin inside) still there for this player? */
export function cocoonPresent(p: Quester | undefined): boolean {
  const q = chainState(p, 0);
  const lake = QUESTS.findIndex((d) => d.id === "lake");
  return (q?.questId ?? 0) <= lake;
}

/** Does this step want a word with this NPC (a talk, a choice, one of several NPCs not yet heard)? */
function stepWants(s: QuestStep | undefined, id: string, count: number): boolean {
  if (s?.type === "talk" && s.npcs) { const i = s.npcs.indexOf(id); return i >= 0 && !(count & (1 << i)); }
  return (s?.type === "talk" || s?.type === "choose") && s.npc === id;
}
/** One chain's "!" (new quest) / "?" (come and talk) for an NPC. */
function chainMark(id: string, q: QuestState | undefined): "!" | "?" | "" {
  const d = questDef(q);
  if (!d) return "";
  const stage = q?.questStage ?? 0;
  if (stage === 0) return d.giver === id && (q?.level ?? 1) >= d.minLevel ? "!" : "";
  return stepWants(questStep(q), id, q?.questCount ?? 0) ? "?" : "";
}
/** Does this NPC have something to say about any quest right now? "?" wins over "!". */
export function npcQuestMark(id: string, p: Quester | undefined): "!" | "?" | "" {
  const marks = CHAINS.map((_, c) => {
    const q = chainState(p, c) ?? { chain: c, questId: 0, questStage: 0, questCount: 0 };
    return q.questStage === 0 && !chainOpen(p, c) ? "" : chainMark(id, q);
  });
  return marks.includes("?") ? "?" : marks.includes("!") ? "!" : "";
}

/** Rewards line for buttons and the log (no XP part when a quest gives none: the side arcs). */
export const rewardText = (r: Reward) => `${r.xp ? `${r.xp} XP, ` : ""}${r.gold} gold, ${r.potions} potions`;

/** Idle lines of quest givers with nothing to say on a chain. */
const IDLE: Record<string, string> = {
  druid: "The old oaks are restless. Keep your blade sharp, friend.",
  captain: "Quiet on the walls today. I don't trust quiet.",
  oldfisher: "Tide's turning. Mind the wet sand, it'll have your boots off.",
  sexton: "Thirty years with a spade. The ground tells you things, if you listen.",
  mourner1: "Forty years married. You'd think I'd be cried out by now.",
  mourner2: "Gran would've hated all this fuss. She'd have wanted the kettle on.",
  mourner3: "I build boats. Corin built better ones. I keep thinking he'll walk up the lane and say so.",
  ilka: "Don't look at me like that. Keep walking.",
  alewife: "Ale's cold, the gossip's warm. Pull up a barrel, love. I hear everything sooner or later.",
};
/**
 * Idle lines by the hero's choice, also said instead of a finished chain's plain `after` (with every story done, that
 * is what a giver usually says). Hale is cold with a hero who took Ursk's bargain until the Penance (draft text).
 */
const IDLE_BY: Record<string, { flag: ChoiceId; lines: Record<number, string> }> = {
  captain: { flag: "bargain", lines: { 1: "Quiet on the walls. The men keep upwind of you. I don't stop them." } },
};
const moodFor = (id: string, p: Quester | undefined) => { const b = IDLE_BY[id]; return b && b.lines[choiceOf(p, b.flag)]; };
const idleFor = (id: string, p: Quester | undefined) => moodFor(id, p) || IDLE[id];
/** A finished quest's `after` line for this hero (QuestDef.afterBy; then, at the end of its chain, the giver's mood). */
const afterFor = (d: QuestDef, p: Quester | undefined, id?: string) => (d.afterBy && d.afterBy.lines[choiceOf(p, d.afterBy.flag)]) || (id && moodFor(id, p)) || d.after;

/** What an NPC says about one chain, or undefined if nothing. */
function chainDialog(id: string, q: QuestState, p: Quester | undefined): DialogPage | undefined {
  const c = q.chain ?? 0, quests = CHAINS[c].quests;
  const qid = q.questId, stage = q.questStage, count = q.questCount;
  const d = quests[qid];
  const last = quests[quests.length - 1];
  if (!d) return last.giver === id ? { text: [afterFor(last, p, id)], bye: "Farewell", chain: c } : undefined;
  if (stage === 0) {
    if (d.giver === id) {
      if ((q.level ?? 1) < d.minLevel) return { text: [`There is more to do, but it is dangerous out there. Come back when you are level ${d.minLevel}.`], bye: "I'll train", chain: c };
      return { text: d.offer, accept: d.acceptText, bye: "Not now", chain: c };
    }
    // The previous giver points you to the next one
    const prev = quests[qid - 1];
    if (prev && prev.giver === id) return { text: [afterFor(prev, p)], bye: "Thanks", chain: c };
    return undefined;
  }
  const s = d.steps[stage - 1];
  if (!s) return undefined;
  if (stepWants(s, id, count)) {
    // the last thing this hero does on the quest (later steps may be another branch's): the button names the reward
    const lastOne = !s.npcs || popcount(count) === s.npcs.length - 1;
    const end = lastOne && nextStage(d, stage, p) > d.steps.length;
    if (s.type === "choose") return { text: sayFor(s, p), options: s.choose!.options.map((o) => ({ label: o.label, v: o.v })), bye: "Later", chain: c };
    return { text: s.npcs ? s.says?.[id] ?? sayFor(s, p) : sayFor(s, p), accept: end ? `${s.accept} (${rewardText(d.reward)})` : s.accept, bye: "Later", chain: c };
  }
  if (d.giver === id && s.nag) return { text: [fill(s.nag, stepProgress(s, count), stepGoal(s))], bye: "On my way", chain: c };
  return undefined;
}

/**
 * What an NPC says about the quests, or undefined if they have nothing to say (traders then just trade).
 * With both chains wanting a word, a page that moves a quest on (a talk step, a choice, an offer) comes first.
 */
export function questDialog(id: string, p: Quester | undefined): DialogPage | undefined {
  // The guided first quest talks first; the stories wait for it (chainOpen)
  const order = [TUT_CHAIN, ...CHAINS.map((_, c) => c).filter((c) => c !== TUT_CHAIN)];
  const pages = order.map((c) => {
    const q = chainState(p, c) ?? { chain: c, questId: 0, questStage: 0, questCount: 0, level: 1 };
    if (q.questStage === 0 && !chainOpen(p, c)) return undefined;
    // The finished first quest only chats when nothing else has a word
    if (c === TUT_CHAIN && q.questId >= TUT_QUESTS.length) return undefined;
    return chainDialog(id, q, p);
  }).filter((x): x is DialogPage => !!x);
  const best = pages.find((x) => x.accept || x.options) ?? pages[0];
  if (best) return best;
  const idle = idleFor(id, p);
  return idle ? { text: [idle], bye: "Farewell", chain: 0 } : undefined;
}

export interface QuestTarget {
  x: number; y: number; // px
  kind: "npc" | "area" | "object";
  r?: number; // area radius in px
  label: string;
}

const npcTarget = (id: string): QuestTarget[] => { const n = npcById(id); return n ? [{ x: n.x, y: n.y, kind: "npc", label: n.name }] : []; };
const objTargets = (os: QuestObject[]): QuestTarget[] => os.map((o) => ({ x: o.x, y: o.y, kind: "object" as const, label: o.name }));

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
  if (s.type === "talk" && s.npcs) return s.npcs.filter((_, i) => !(q!.questCount & (1 << i))).flatMap(npcTarget);
  if (s.type === "talk" || (s.type === "choose" && s.npc)) return npcTarget(s.npc!);
  if (s.type === "equip" || s.type === "learn") return []; // done in a menu, anywhere
  if (s.type === "reach") return [{ x: s.at!.x, y: s.at!.y, kind: "area", r: s.at!.r, label: s.at!.label }];
  if (s.type === "use") return objTargets(s.objects!.filter((o, i) => !(q!.questCount & (1 << i))));
  if (s.type === "pick") return objTargets(s.pick!.objects);
  // carry: the lantern while it waits at its spot (count 0), always where it goes; where it is once taken comes as "qstate"
  if (s.type === "carry") { const to = s.carry!.to; return [...(q!.questCount ? [] : objTargets([s.carry!.take])), { x: to.x, y: to.y, kind: "area", r: to.r, label: to.label }]; }
  if (s.type === "hold") { const a = s.hold!.at; return [{ x: a.x, y: a.y, kind: "area", r: a.r, label: a.label }]; }
  // unseen: the next checkpoint, and the last one reached (where a hero hides again after being seen); whether they are hidden comes as "qstate"
  if (s.type === "unseen") {
    const cps = s.unseen!.checkpoints, n = Math.min(q!.questCount, cps.length - 1);
    return [n, ...(q!.questCount > 0 && q!.questCount - 1 !== n ? [q!.questCount - 1] : [])].map((i) => ({ x: cps[i].x, y: cps[i].y, kind: "area" as const, r: cps[i].r, label: cps[i].label }));
  }
  if (s.type === "sync") return objTargets(s.sync!.seals);
  const z = zoneByName(s.zone ?? d.zone);
  return [{ x: (z.x + z.w / 2) * TILE, y: (z.y + z.h / 2) * TILE, kind: "area", r: (Math.min(z.w, z.h) / 2) * TILE, label: z.name }];
}

/** Quest objects this player can use right now on any chain, with their index (bit) in the step (pick: every candidate; carry: the thing to take up). */
export function usableObjects(p: Quester | undefined): { o: QuestObject; i: number; chain: number }[] {
  return CHAINS.flatMap((_, c) => {
    const q = chainState(p, c), s = questStep(q);
    if (s?.type === "pick") return s.pick!.objects.map((o, i) => ({ o, i, chain: c }));
    if (s?.type === "carry") return q!.questCount ? [] : [{ o: s.carry!.take, i: 0, chain: c }]; // taken: it moves (see "qstate")
    if (s?.type === "sync") return s.sync!.seals.map((o, i) => ({ o, i, chain: c })); // both stay turnable until they turn together
    if (s?.type !== "use") return [];
    return s.objects!.map((o, i) => ({ o, i, chain: c })).filter(({ i }) => !(q!.questCount & (1 << i)));
  });
}

/** Every quest object in the world, with whether it is done for this player (lit lanterns stay lit…). */
export function allObjects(): QuestObject[] {
  return [...LANTERNS, COCOON, ...SHRINES, BROOD_HEART, ...SHARDS, ...ENGINES, BEACON, ...CRYPTS, PHYLACTERY, ...WARDS, ...KING_STONES, ...SILK, ...HIDE_TOTEMS, ...PALM_SIGILS, ...MIRAGE_SIGILS, ...CISTERNS, ...ARC_OBJECTS];
}
/** Done = its step is behind the hero (or, on a use step, its bit is set). Pick candidates and the like are never done mid-step. */
export function objectDone(o: QuestObject, p: Quester | undefined): boolean {
  const has = (s: QuestStep) => stepObjects(s).includes(o);
  const c = CHAINS.findIndex((ch) => ch.quests.some((d) => d.steps.some(has)));
  if (c < 0) return false;
  const quests = CHAINS[c].quests, q = chainState(p, c);
  const qid = q?.questId ?? 0;
  const owner = quests.findIndex((d) => d.steps.some(has));
  if (qid > owner) return true;
  if (qid < owner) return false;
  const si = quests[owner].steps.findIndex(has);
  const stage = q?.questStage ?? 0;
  if (stage - 1 > si) return true;
  if (stage - 1 < si) return false;
  const st = quests[owner].steps[si];
  return st.type === "use" && !!(q!.questCount & (1 << st.objects!.indexOf(o)));
}
