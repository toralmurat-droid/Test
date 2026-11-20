/**
 * What the clans' capital cities say (W7, shared/capitals.ts): city, district and NPC names, the shop's greeting, the
 * gate's notes and the leader's, oath-keeper's and trainer's lines. Placeholder English for the content writer to
 * polish; the rules never read these strings, so they can change freely.
 */
import type { ClanKey } from "./clans";

/** One city's names and lines. Districts follow shared/capitals.ts CITY_DISTRICTS. */
export interface CityText {
  name: string;
  /** The waystone in the gate square (shared/map.ts PORTAL_SPOTS). */
  waystone: string;
  /** The waygate labels: in at the clan's seat, out at the city's inner gate. */
  enter: string; leave: string;
  districts: { gate: string; market: string; barracks: string; hall: string; keep: string; houses: string };
  npcs: { leader: [string, string]; quartermaster: [string, string]; oathkeeper: [string, string]; trainer: [string, string] };
  shopGreeting: string;
  leaderGreeting: string;
  /** What the oath-keeper and the drillmaster say first (client/src/capitals.ts panels). */
  oathGreeting: string;
  trainerGreeting: string;
  /** The clan title the leader grants at Banneret (appended to shared/cosmetics.ts TITLES). */
  title: string;
  /** What the town crier calls across the gate square (client/src/cityFolk.ts); none: he stays silent. */
  crier?: string[];
}

export const CITY_TEXT: Partial<Record<ClanKey, CityText>> = {
  wardens: {
    name: "Hearthhold",
    waystone: "Hearthhold",
    enter: "Pass the city gate into Hearthhold, seat of the Wardens",
    leave: "Go out through the city gate to Goldenreach Farms",
    districts: { gate: "Hearthhold Gate Square", market: "Hearthhold Market", barracks: "The Wardens' Barracks", hall: "The Oath Hall", keep: "The Hearth Keep", houses: "Hearthhold Lanes" },
    npcs: {
      leader: ["Lord-Marshal Aldous Brand", "Lord-Marshal of the Wardens"],
      quartermaster: ["Tamsin Reeve", "Quartermaster of the Wardens"],
      oathkeeper: ["Sister Maelis", "Keeper of the Oath"],
      trainer: ["Sergeant Kell", "Drillmaster"],
    },
    shopGreeting: "Wardens' stores. Sworn hands pay the Wardens' price; everyone else pays the road price.",
    leaderGreeting: "The hearth burns while the Wardens stand. Speak, and be brief.",
    oathGreeting: "Kneel at the altar and your word is bound to the Wardens. Break it, and you may swear again elsewhere.",
    trainerGreeting: "Not what you hoped for? I drill it out of you and you start again. Out of combat only.",
    title: "Hearthsworn",
  },
  // The Veiled Circle's Duskveil (Act 2): the Oracle speaks only through her Regent; everything here was foreseen
  veiled: {
    name: "Duskveil",
    waystone: "Duskveil",
    enter: "Pass the city gate into Duskveil, seat of the Veiled Circle",
    leave: "Go out through the city gate to the Veiled Sanctum",
    districts: { gate: "Duskveil Gate Court", market: "The Shaded Bazaar", barracks: "The Quiet Barracks", hall: "The Hall of the Sealed Oath", keep: "The Regent's Veil", houses: "Duskveil Alleys" },
    npcs: {
      leader: ["Regent Sahar of the Seventh Veil", "Voice of the Veiled Oracle"],
      quartermaster: ["Factor Ismet Noonshade", "Quartermaster of the Circle"],
      oathkeeper: ["The Unspoken Witness", "Keeper of the Sealed Oath"],
      trainer: ["Blade-Mistress Rahel", "Mistress of the Quiet Blade"],
    },
    shopGreeting: "The Circle's stores. Those who wear the Veil pay what was foretold; strangers pay what the sun asks.",
    leaderGreeting: "The Oracle saw you coming before you left the sand. I speak for her. Ask.",
    oathGreeting: "Lay your hand on the altar and say nothing. The Circle hears an oath before it is spoken.",
    trainerGreeting: "You swing like a man who has never been watched. Shall I unteach it? Out of combat only.",
    title: "Veilsworn",
  },
  // The Ossuary Host's Marrowkeep (Act 3): a keeper of rolls, patient and cold; every name is written down
  host: {
    name: "Marrowkeep",
    waystone: "Marrowkeep",
    enter: "Pass the city gate into Marrowkeep, seat of the Ossuary Host",
    leave: "Go out through the city gate to the Host's Muster",
    districts: { gate: "Marrowkeep Gate Yard", market: "The Bone Market", barracks: "The Muster Hall", hall: "The Hall of Rolls", keep: "The Ossuary Keep", houses: "Marrowkeep Rows" },
    npcs: {
      leader: ["Lord-Ossuary Varric Ashgrave", "Keeper of the Host's Rolls"],
      quartermaster: ["Tallyman Edric Cold", "Quartermaster of the Host"],
      oathkeeper: ["Sister Ilse the Pale", "Reader of the Roll"],
      trainer: ["Drill-Sergeant Hollow Tam", "Drillmaster of the Muster"],
    },
    shopGreeting: "Everything here is counted, and everything is paid for. The Host's own pay less. The dead do not haggle.",
    leaderGreeting: "Your name is on the roll. Whether it stays among the living is your affair. Speak.",
    oathGreeting: "Swear, and I write your name in the roll beside the others. The ink does not fade. Neither does the oath, until you break it.",
    trainerGreeting: "The dead march in step and never learn bad habits. You, I can still correct. Out of combat only.",
    title: "Bonesworn",
  },
  // The Redfang Compact's Scarwall (Act 4): a warlord's stockade, loud, greedy and loyal to its own
  redfang: {
    name: "Scarwall",
    waystone: "Scarwall",
    enter: "Pass the city gate into Scarwall, stronghold of the Redfang Compact",
    leave: "Go out through the city gate to Fangrock",
    districts: { gate: "Scarwall Gate Yard", market: "The Fence's Market", barracks: "The Knife Pits", hall: "The Blood Ledger Hall", keep: "The Warlord's Hold", houses: "Scarwall Huts" },
    npcs: {
      leader: ["Warlord Gorrin Ironjaw", "Warlord of the Compact"],
      quartermaster: ["Dagny Two-Purse", "Quartermaster of the Compact"],
      oathkeeper: ["Old Mag Blood-Ink", "Keeper of the Blood Ledger"],
      trainer: ["Knuckles Garrow", "Pit-Boss"],
    },
    shopGreeting: "All of it fell off a caravan. Compact blades pay the brother's price; everybody else pays the toll.",
    leaderGreeting: "The Chief takes the roads, I keep the wall. You want coin? Earn it, then talk.",
    oathGreeting: "Cut your thumb, sign the ledger. The Compact never forgets a name in red. Turn on us and we come to collect.",
    trainerGreeting: "Fight like that out there and the dogs eat you. Want me to knock it out of you? Out of combat only.",
    title: "Fangsworn",
  },
  // The Hide-Kin's Deepden (Act 5): an old den-father under hide and earth, grandmotherly and hungry
  hidekin: {
    name: "Deepden",
    waystone: "Deepden",
    enter: "Pass the city gate into Deepden, the Hide-Kin's warren",
    leave: "Go out through the city gate to Hidehall",
    districts: { gate: "Deepden Gate Hollow", market: "The Larder Market", barracks: "The Claw Pits", hall: "The Hide-Oath Den", keep: "The Den-Father's Mound", houses: "Deepden Burrows" },
    npcs: {
      leader: ["Den-Father Harrowtooth", "Elder of the Hide-Kin"],
      quartermaster: ["Larder-Keeper Mossback", "Quartermaster of the Kin"],
      oathkeeper: ["Grandmother Thistle", "Stitcher of the Hide-Oath"],
      trainer: ["Clawmaster Scrabble", "Clawmaster"],
    },
    shopGreeting: "Dried, salted, stitched and sharp. Kin eat first and pay less. Surface-folk pay full, and count their fingers after.",
    leaderGreeting: "Mother sings in the deep and I keep the den. Sit. Smell of the road, you do. Speak.",
    oathGreeting: "Give me your arm. One stitch of hide, and the Kin know you by smell. Pull it out, and you are surface-folk again.",
    trainerGreeting: "You dig with your elbows out. Bad. I can claw that out of you, start you over. Out of combat only.",
    title: "Hidesworn",
  },
};

/** Notes heroes get at the gates, the altar, the leader and the hall. `{city}` and `{clan}` are filled in. */
export const CITY_LINES = {
  shutWar: "The gate stays shut. {city} is at war with your clan.",
  shutWanted: "The gate stays shut. {clan} want your blood before they open it.",
  shutLevel: "The gate is barred to the untried. Return at level {level}.",
  oathSworn: "You kneel at the altar and swear to {clan}.",
  oathSame: "You are already sworn to {clan}.",
  rewardPaid: "{leader}: \"You have earned this, {rank}.\" (+{gold} gold)",
  rewardTitle: "You are named {title}.",
  rewardNone: "{leader}: \"Come back when your name has grown.\"",
  rewardUnsworn: "{leader}: \"I reward only those sworn to {clan}.\"",
  homeBound: "{city} is your home now. When you fall in these lands, you wake here if it is nearer.",
  homeCleared: "{city} is no longer your home.",
  homeUnsworn: "Only heroes sworn to {clan} may make {city} their home.",
  tooFar: "Stand closer.",
} as const;

/** A line with its {placeholders} filled. */
export const cityLine = (line: string, v: Record<string, string | number>): string => line.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
