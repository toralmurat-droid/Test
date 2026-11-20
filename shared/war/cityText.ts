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
  /** What the town crier calls out in the gate square, one line at a time, in the clan's voice. */
  crier?: string[];
}

export const CITY_TEXT: Partial<Record<ClanKey, CityText>> = {
  wardens: {
    name: "Hearthhold",
    waystone: "Hearthhold",
    enter: "Pass the gate into Hearthhold, seat of the Wardens",
    leave: "Go out through the gate to the King's Highway",
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
    crier: [
      "Hear ye! The hearth burns and the Wardens stand. All is well in Hearthhold.",
      "The Oath Hall is open to all who would swear. Kneel, and be counted.",
      "Mind the roads at dusk. The Wardens ride out from the north gate at first light.",
      "Wanted heroes, take notice: the gates stay shut to you until your debts are paid.",
      "Sergeant Kell drills new recruits at the barracks. Bring your own boots.",
      "Honest coin buys honest goods at the Wardens' stores. The quartermaster keeps the tally.",
      "Three gates, three roads: south to Oakvale, west to the Hunters, east to the Watchtower Trail.",
      "The untried may not pass the gate. Return at level five, and we will gladly open it.",
    ],
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
    crier: [
      "The Oracle has seen this day. She asks that you do not be surprised.",
      "The Shaded Bazaar opens at dusk. What you will buy was foretold.",
      "Speak softly in the Alleys. The walls have been listening longer than you have lived.",
      "The Regent receives those who bear the Veil. Others will find she has already heard them.",
      "Keep to the shade at noon. The sun is a poor counsellor.",
      "A stranger will lose a glove today. The Circle takes no blame for it.",
      "The Sealed Oath is kept, and never spoken. Ask no one what it says.",
      "Those at war with the Circle will find the gate shut. It was foreseen.",
    ],
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
    crier: [
      "Hear the roll! Every name here is written, and every name is kept.",
      "The Bone Market is open. All goods are counted. The dead do not haggle.",
      "Tallyman Cold asks for debtors to come forward. He will find you anyway.",
      "Muster at the Hall at the third bell. The absent will be struck from the roll, or worse.",
      "Walk quietly past the Ossuary Keep. The Host sleeps lightly.",
      "Swear to the Host and the ink will not fade. Break it, and the ink does not forget.",
      "Heroes under level five are not yet worth the writing. Return when you have lived a little.",
      "The gate is shut to the Host's enemies. The roll has their names.",
    ],
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
    crier: [
      "Oi! Fresh from a caravan, the finest goods in the Fence's Market. Don't ask whose caravan!",
      "The Knife Pits open at noon. Bring a purse, and a friend to carry you home.",
      "Warlord Ironjaw wants it known: nobody takes the wall while he keeps it.",
      "Sign the Blood Ledger, brothers. The Compact pays its own and collects from the rest.",
      "Toll's doubled for surface-folk. Triple if you whine.",
      "Dagny Two-Purse is buying. Dagny is always buying. Count your change.",
      "No cubs on the walls, and no soft heroes at the gate. Come back when you've bled.",
      "The Compact's enemies stay outside. The dogs are hungry and the gate is shut.",
    ],
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
    crier: [
      "Wake, wake! The den is warm and the larder is full. Kin eat first.",
      "Larder Market is open. Dried, salted, stitched. Surface-folk, count your fingers after.",
      "Mind your head in the Burrows. The roof is old, and so is Grandmother Thistle.",
      "Mother sings in the deep tonight. Hush, and listen, and do not dig.",
      "The Claw Pits want fresh cubs. Clawmaster Scrabble bites, but only a little.",
      "One stitch of hide and the Kin know you by smell. Come to the Hide-Oath Den.",
      "Small ones stay out of the warren. Come back when you have grown some teeth.",
      "Surface-folk who are at war with the Kin find the hollow shut. Go home and smell of rain.",
    ],
  },
};

/** Notes heroes get at the gates, the altar, the leader and the hall. `{city}` and `{clan}` are filled in. */
export const CITY_LINES = {
  shutWar: "The gate warden holds up a hand. The gate stays shut. {city} is at war with your clan.",
  shutWanted: "The gate warden shakes his head. The gate stays shut. {clan} want your blood before they open it.",
  shutLevel: "The gate warden looks you over. The gate is barred to the untried. Return at level {level}.",
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
