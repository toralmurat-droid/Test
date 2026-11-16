/**
 * The voices of the war (roadmap M1 "clan leaders speak"): each clan's leader has a few lines for the moments the
 * Herald announces. Lines are picked by the war tick, so server restarts and replays say the same thing.
 * {land} = the territory, {foe} = the other clan's name.
 */
import type { ClanKey } from "./clans";

export type WarMoment = "siege" | "besieged" | "took" | "lost" | "held" | "repelled" | "sacked" | "march" | "ambushed" | "clash";

export interface Leader { name: string; lines: Record<WarMoment, string[]> }

export const LEADERS: Record<ClanKey, Leader> = {
  wardens: { name: "Captain Hale", lines: {
    siege: ["Wardens, to {land}! We take back what {foe} stole.", "Sound the horn. {land} is ours by spring."],
    besieged: ["{foe} at {land}. Every hand to the walls!", "Hold {land}. The watch does not run."],
    took: ["{land} is free of {foe}. Raise the hearth-banner.", "Good work. {land} sleeps safe tonight."],
    lost: ["{land} fell to {foe}. We will be back with more spears.", "Mark it on the map: {land}. We owe {foe} a debt."],
    held: ["{land} held. {foe} broke on our palisade.", "They came, they bled, they left. {land} stands."],
    repelled: ["The walls of {land} were too high. Regroup.", "{foe} held {land}. Next time, more ladders."],
    sacked: ["{foe} raised their rag over our Hold at {land}. Tear it down!", "The Hold of {land} was sacked by {foe}. Double the watch."],
    march: ["Wardens, the road is ours. March for {land}!", "Boots on the road. {foe} will see us at {land} before they see the sun."],
    ambushed: ["Our column was cut down on the road to {land}. {foe} fight like thieves.", "Bury our fallen, then march again for {land}."],
    clash: ["Steel on the road to {land}! Hold the line, Wardens!", "{foe} met our column in the open. Let them learn what the watch is."],
  } },
  redfang: { name: "The Redfang Chief", lines: {
    siege: ["{land} has fat stores. Take them.", "Knives out, lads. {land} pays us now."],
    besieged: ["{foe} want {land}? Let them come and bleed.", "Lookouts to {land}. Nobody robs a robber."],
    took: ["{land} is Redfang land now. Strip it.", "{foe} ran from {land}. Cowards."],
    lost: ["{foe} took {land}. We'll take it back, and their purses too.", "Lost {land}. Find me who slept on watch."],
    held: ["{land} stays ours. {foe} learned what a red fang is.", "Ha! {foe} turned tail at {land}."],
    repelled: ["{land} held out. We raid somewhere softer.", "Pull back from {land}. We hit them where they sleep."],
    sacked: ["{foe} robbed our camp at {land}? Nobody robs a robber twice.", "Who let {foe} into the camp at {land}? Find them. Gut them."],
    march: ["Out on the road, lads. {land} is waiting to be robbed.", "March light and grab heavy. {land} pays us now."],
    ambushed: ["{foe} jumped our column on the road to {land}? Somebody talked.", "Our lads were cut down on the road. {foe} will pay double."],
    clash: ["Our column met {foe} on the road to {land}. Cut your way through!", "A fight on the road? Good. Take their purses after."],
  } },
  host: { name: "The Pale Marshal", lines: {
    siege: ["The dead march on {land}. They do not tire.", "Raise the engines before {land}. The night is ours."],
    besieged: ["{foe} knock at {land}. Wake the fallen.", "Let {foe} come to {land}. Every one who dies joins us."],
    took: ["{land} is quiet now. The Host keeps it.", "{land} belongs to the patient."],
    lost: ["{land} is lost for a while. We have all the time there is.", "{foe} hold {land}. Graves keep."],
    held: ["{land} held. {foe} filled our ranks.", "The dead do not yield {land}."],
    repelled: ["{land} resisted. The night will come again.", "Fall back from {land}. Gather the bones."],
    sacked: ["{foe} defiled our keep at {land}. The dead will remember their faces.", "Let {foe} wave their banner at {land}. It will hang over their graves."],
    march: ["The column walks for {land}. The road is long. We are patient.", "March, you dead. {land} will not wait forever."],
    ambushed: ["Our column fell on the road to {land}. They will rise again.", "{foe} struck from the dark. The dead do not forget the road."],
    clash: ["The columns meet on the road to {land}. Let {foe} fall and join us.", "Steel on bone. The road to {land} is ours."],
  } },
  hidekin: { name: "The Hide-Mother", lines: {
    siege: ["Dig under {land}, my children.", "{land} smells of fear. Tunnel."],
    besieged: ["{foe} stamp on our roof at {land}. Bite their feet.", "Into the warrens of {land}. Wait for them."],
    took: ["{land} is a burrow now.", "We came up under {foe} at {land}. Feast."],
    lost: ["{foe} took {land}. The tunnels remember.", "Seal the ways under {land}. We will dig again."],
    held: ["{land} holds. {foe} cannot fight in the dark.", "The burrows of {land} ate them."],
    repelled: ["{land} is too hard to dig. Another way.", "Back into the earth. {land} can wait."],
    sacked: ["{foe} trampled our burrow at {land}. Bite them, my children!", "The burrow of {land} is fouled by {foe}. Dig them out."],
    march: ["Out of the burrow, my children. The road leads to {land}.", "Quiet feet on the road to {land}. Then bite."],
    ambushed: ["They caught our column on the road to {land}. Bring the hurt ones home.", "{foe} cut down my children on the road. Dig, and wait."],
    clash: ["Our column met {foe} on the road. Bite, my children, bite!", "Teeth and claws on the road to {land}. Do not give an inch."],
  } },
  veiled: { name: "The Veiled Oracle", lines: {
    siege: ["The sun turns against {land}. Begin the rite.", "At noon {land} will be ours. It is written."],
    besieged: ["{foe} gather at {land}. The circle holds.", "Chant louder. {land} must not fall."],
    took: ["{land} bows to the Circle. As foretold.", "The veil falls over {land}."],
    lost: ["{land} slips from the Circle. A dark omen for {foe}.", "{foe} took {land}. The stars will turn."],
    held: ["{land} held. {foe} could not see what we saw.", "The rite protects {land}."],
    repelled: ["{land} is not yet ready to see. Patience.", "The omens were wrong at {land}. We wait."],
    sacked: ["{foe} profaned the shrine of {land}. The omens turn against them.", "The shrine of {land} was sacked by {foe}. It was foreseen. It will be avenged."],
    march: ["The column sets out for {land}. The road was foreseen.", "Walk in the sun, children of the Circle. {land} awaits."],
    ambushed: ["Our column was cut down on the road to {land}. It was foreseen, and it will be paid.", "{foe} struck on the road. The omens turn against them."],
    clash: ["The columns meet on the road to {land}. As it was written.", "{foe} stand in our way. The Circle does not turn aside."],
  } },
};

/** How leaders name a rival clan in a sentence. */
export const FOE_NAME: Record<ClanKey, string> = { wardens: "the Wardens", redfang: "Redfang", host: "the Host", hidekin: "the Hide-Kin", veiled: "the Veiled" };

/** The line of `k` about `foe` for this moment (picked by the tick), filled in. */
export function leaderLine(k: ClanKey, moment: WarMoment, land: string, foe: ClanKey, tick: number): { name: string; text: string } {
  const l = LEADERS[k], opts = l.lines[moment];
  const t = opts[Math.abs(tick) % opts.length].replace(/\{land\}/g, land).replace(/\{foe\}/g, FOE_NAME[foe]);
  return { name: l.name, text: t.charAt(0).toUpperCase() + t.slice(1) };
}

/** Who speaks for an event, and in which mood: the defender calls to arms, the winner boasts. */
export function eventVoice(kind: "siege" | "flip" | "held" | "sack", by: ClanKey, from: ClanKey): { k: ClanKey; foe: ClanKey; moment: WarMoment } {
  if (kind === "sack") return { k: from, foe: by, moment: "sacked" }; // the holder answers a sack of its Hold
  return kind === "siege" ? { k: from, foe: by, moment: "besieged" } : kind === "flip" ? { k: by, foe: from, moment: "took" } : { k: from, foe: by, moment: "held" };
}

/** Siege battles (shared/war/siege.ts): what a leader says when their side takes a besieged land's gate ({land}, {foe}). */
export const GATE_LINES: Record<ClanKey, { took: string[]; retook: string[] }> = {
  wardens: { took: ["The gate of {land} is ours. Push on, Wardens!", "{foe} lost the gate of {land}. Hold it fast."],
    retook: ["The gate of {land} is ours again. Bar it!", "{foe} are thrown back from the gate of {land}."] },
  redfang: { took: ["We're through the gate of {land}. Grab everything.", "The gate of {land} is open. {foe} can't stop us now."],
    retook: ["Shut the gate of {land} on {foe}'s fingers.", "Gate of {land} back in Redfang hands. Nobody robs a robber."] },
  host: { took: ["The gate of {land} gives way. The dead walk in.", "{foe} could not hold the gate of {land}."],
    retook: ["The gate of {land} is sealed again. The fallen keep watch.", "{foe} broke on the gate of {land}."] },
  hidekin: { took: ["We came up under the gate of {land}. Bite!", "The gate of {land} is ours, my children."],
    retook: ["Back to the gate of {land}. {foe} out of our burrow!", "The gate of {land} holds again."] },
  veiled: { took: ["The gate of {land} opens, as foretold.", "{foe} abandon the gate of {land}. The rite goes on."],
    retook: ["The circle closes round the gate of {land} again.", "{foe} could not keep the gate of {land}."] },
};

/** The leader line of `k` on taking (or taking back) a siege's gate from `foe`, picked by `seed`. */
export function gateLine(k: ClanKey, retook: boolean, land: string, foe: ClanKey, seed: number): { name: string; text: string } {
  const opts = GATE_LINES[k][retook ? "retook" : "took"];
  const t = opts[Math.abs(Math.floor(seed)) % opts.length].replace(/\{land\}/g, land).replace(/\{foe\}/g, FOE_NAME[foe]);
  return { name: LEADERS[k].name, text: t.charAt(0).toUpperCase() + t.slice(1) };
}

/** Feuds (shared/war/feuds.ts): what a leader says when a hero becomes Wanted, Hunted or Marked by the clan, and when a bounty on one is claimed ({hero}). */
export type FeudMoment = "wanted" | "hunted" | "marked" | "bounty";
export const FEUD_LINES: Record<ClanKey, Record<FeudMoment, string[]>> = {
  wardens: {
    wanted: ["{hero} has Warden blood on their hands. The watch will know that face.", "Write down the name {hero}. The watch does not forget."],
    hunted: ["Enough. Send riders after {hero}.", "{hero} answers to the Wardens now. Bring them in."],
    marked: ["Every Warden spear is turned on {hero}.", "No hearth in the Marches will hide {hero} from us."],
    bounty: ["{hero} has paid at last. The watch sleeps easier.", "Justice for our fallen: {hero} is down."],
  },
  redfang: {
    wanted: ["Who is this {hero}, cutting down my lads?", "{hero} owes the Redfang. We always collect."],
    hunted: ["Get the dogs. {hero} runs, we follow.", "A purse of red gold for {hero}'s ears."],
    marked: ["Every knife in the Compact wants {hero}.", "{hero} won't see the next moon. I swear it on my fang."],
    bounty: ["Ha! {hero}'s ears are on my belt.", "{hero} paid in blood. Pour the wine."],
  },
  host: {
    wanted: ["{hero} breaks what the Host has raised. Remember them.", "The dead have learned the name {hero}."],
    hunted: ["Let the patient ones walk after {hero}.", "{hero} will tire. We do not."],
    marked: ["Every grave in the Marches waits for {hero}.", "The Host marches for {hero} alone."],
    bounty: ["{hero} joins our ranks at last.", "{hero} fell. The Host is patient, and the Host is paid."],
  },
  hidekin: {
    wanted: ["{hero} smells of our blood, children.", "The burrows whisper the name {hero}."],
    hunted: ["Dig after {hero}. Wherever they stand, come up under them.", "Bite {hero}'s heels, my children."],
    marked: ["{hero} has no ground left that is not ours.", "Every tunnel leads to {hero}."],
    bounty: ["{hero} is in the earth now. Feast.", "We came up under {hero}. It is done."],
  },
  veiled: {
    wanted: ["The omens turn dark around {hero}.", "{hero} stands against the Circle. It is seen."],
    hunted: ["The sun points to {hero}. Follow its light.", "Send the seekers after {hero}."],
    marked: ["{hero}'s fate is written in every star.", "The Circle will chant until {hero} falls."],
    bounty: ["{hero} has met the fate we foretold.", "The veil closes over {hero}. As it was written."],
  },
};
/** The leader line of `k` for a feud moment about hero `hero`, picked by `seed`. */
export function feudLine(k: ClanKey, moment: FeudMoment, hero: string, seed: number): { name: string; text: string } {
  const opts = FEUD_LINES[k][moment];
  const t = opts[Math.abs(Math.floor(seed)) % opts.length].replace(/\{hero\}/g, hero);
  return { name: LEADERS[k].name, text: t.charAt(0).toUpperCase() + t.slice(1) };
}
