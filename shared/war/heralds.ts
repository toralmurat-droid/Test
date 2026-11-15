/**
 * The voices of the war (roadmap M1 "clan leaders speak"): each clan's leader has a few lines for the moments the
 * Herald announces. Lines are picked by the war tick, so server restarts and replays say the same thing.
 * {land} = the territory, {foe} = the other clan's name.
 */
import type { ClanKey } from "./clans";

export type WarMoment = "siege" | "besieged" | "took" | "lost" | "held" | "repelled";

export interface Leader { name: string; lines: Record<WarMoment, string[]> }

export const LEADERS: Record<ClanKey, Leader> = {
  wardens: { name: "Captain Hale", lines: {
    siege: ["Wardens, to {land}! We take back what {foe} stole.", "Sound the horn. {land} is ours by spring."],
    besieged: ["{foe} at {land}. Every hand to the walls!", "Hold {land}. The watch does not run."],
    took: ["{land} is free of {foe}. Raise the hearth-banner.", "Good work. {land} sleeps safe tonight."],
    lost: ["{land} fell to {foe}. We will be back with more spears.", "Mark it on the map: {land}. We owe {foe} a debt."],
    held: ["{land} held. {foe} broke on our palisade.", "They came, they bled, they left. {land} stands."],
    repelled: ["The walls of {land} were too high. Regroup.", "{foe} held {land}. Next time, more ladders."],
  } },
  redfang: { name: "The Redfang Chief", lines: {
    siege: ["{land} has fat stores. Take them.", "Knives out, lads. {land} pays us now."],
    besieged: ["{foe} want {land}? Let them come and bleed.", "Lookouts to {land}. Nobody robs a robber."],
    took: ["{land} is Redfang land now. Strip it.", "{foe} ran from {land}. Cowards."],
    lost: ["{foe} took {land}. We'll take it back, and their purses too.", "Lost {land}. Find me who slept on watch."],
    held: ["{land} stays ours. {foe} learned what a red fang is.", "Ha! {foe} turned tail at {land}."],
    repelled: ["{land} held out. We raid somewhere softer.", "Pull back from {land}. We hit them where they sleep."],
  } },
  host: { name: "The Pale Marshal", lines: {
    siege: ["The dead march on {land}. They do not tire.", "Raise the engines before {land}. The night is ours."],
    besieged: ["{foe} knock at {land}. Wake the fallen.", "Let {foe} come to {land}. Every one who dies joins us."],
    took: ["{land} is quiet now. The Host keeps it.", "{land} belongs to the patient."],
    lost: ["{land} is lost for a while. We have all the time there is.", "{foe} hold {land}. Graves keep."],
    held: ["{land} held. {foe} filled our ranks.", "The dead do not yield {land}."],
    repelled: ["{land} resisted. The night will come again.", "Fall back from {land}. Gather the bones."],
  } },
  hidekin: { name: "The Hide-Mother", lines: {
    siege: ["Dig under {land}, my children.", "{land} smells of fear. Tunnel."],
    besieged: ["{foe} stamp on our roof at {land}. Bite their feet.", "Into the warrens of {land}. Wait for them."],
    took: ["{land} is a burrow now.", "We came up under {foe} at {land}. Feast."],
    lost: ["{foe} took {land}. The tunnels remember.", "Seal the ways under {land}. We will dig again."],
    held: ["{land} holds. {foe} cannot fight in the dark.", "The burrows of {land} ate them."],
    repelled: ["{land} is too hard to dig. Another way.", "Back into the earth. {land} can wait."],
  } },
  veiled: { name: "The Veiled Oracle", lines: {
    siege: ["The sun turns against {land}. Begin the rite.", "At noon {land} will be ours. It is written."],
    besieged: ["{foe} gather at {land}. The circle holds.", "Chant louder. {land} must not fall."],
    took: ["{land} bows to the Circle. As foretold.", "The veil falls over {land}."],
    lost: ["{land} slips from the Circle. A dark omen for {foe}.", "{foe} took {land}. The stars will turn."],
    held: ["{land} held. {foe} could not see what we saw.", "The rite protects {land}."],
    repelled: ["{land} is not yet ready to see. Patience.", "The omens were wrong at {land}. We wait."],
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
export function eventVoice(kind: "siege" | "flip" | "held", by: ClanKey, from: ClanKey): { k: ClanKey; foe: ClanKey; moment: WarMoment } {
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
