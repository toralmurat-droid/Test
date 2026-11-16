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
  /** The clan title the leader grants at Banneret (appended to shared/cosmetics.ts TITLES). */
  title: string;
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
    title: "Hearthsworn",
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
