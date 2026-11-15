/**
 * What a war writ says on the board: a line from the hero's clan leader (shared/war/heralds.ts LEADERS), in their
 * voice. Picked by a seed so the same offer always reads the same. {land} = the territory's name.
 */
import type { ClanKey } from "./clans";
import { LEADERS } from "./heralds";
import type { WritKind } from "./writs";

export const WRIT_LINES: Record<ClanKey, Record<WritKind, string[]>> = {
  wardens: {
    rout: ["Their soldiers walk the roads of {land} like they own them. Show them they don't.", "Break the column at {land}. Bring every Warden home.", "{land} was ours once. Thin out the men who took it."],
    hold: ["Plant yourself at the standard in {land} and do not move.", "The line at {land} needs one more shield. Yours.", "Stand the watch at {land}. Five minutes is all I ask."],
    clear: ["Beasts are eating the harvest in {land}. Clear them out.", "Our farmers can't work {land} with monsters at the fence.", "Make {land} safe to walk again."],
  },
  redfang: {
    rout: ["Their guards at {land} are soft. Prove it.", "Cut down the soldiers in {land} and we take their purses after.", "Every soldier in {land} you drop is one less blade at our backs."],
    hold: ["Stand at the standard in {land}. Look mean.", "Hold the ground at {land} till the lads catch up.", "Nobody moves us off {land}. Show them."],
    clear: ["Vermin in {land}. Bad for business. Kill them.", "Clear {land} so our wagons roll without a scratch.", "Something with teeth is in {land}. Bigger teeth win."],
  },
  host: {
    rout: ["The living hold {land}. Make some of them less so.", "Their soldiers at {land} will serve us better as bones.", "Thin the guard at {land}. The dead will do the rest."],
    hold: ["Stand at the standard in {land}. The patient inherit.", "Keep the vigil at {land}. Five minutes is nothing to us.", "Hold {land}. We have all the time there is; lend us some."],
    clear: ["Wild things defile the graves of {land}. Put them down.", "{land} must be quiet. Make it so.", "Clear the beasts from {land}. They disturb the sleepers."],
  },
  hidekin: {
    rout: ["Their stompers walk over our burrows at {land}. Bite them.", "The soldiers of {land} smell of fear. Hunt them, child.", "Drag the guards of {land} down into the dark."],
    hold: ["Sit by the standard in {land}. Be still, like the stone.", "Hold {land} for the Mother. Do not wander.", "Stay at {land}. The tunnels are listening for you."],
    clear: ["Strange beasts in {land}. They are not of the warren. Eat them.", "Clear {land}. The young need room to dig.", "Hunt the wild ones in {land}. The Mother is hungry."],
  },
  veiled: {
    rout: ["The stars ask for the soldiers of {land}. Answer them.", "Their guards at {land} do not see what comes. Be it.", "It is written that {land} will lose its watchmen. Write it."],
    hold: ["Stand at the standard in {land}. The circle must not break.", "Hold {land} while the rite is sung.", "Be the still point at {land}. Five minutes, five omens."],
    clear: ["Wild things cloud the omens of {land}. Clear them.", "The sight is dim over {land}. Cut away what crawls there.", "Cleanse {land}. The Circle needs clear ground."],
  },
};

/** The leader's line for this writ (name and text). */
export function writFlavour(clan: ClanKey, kind: WritKind, land: string, seed: number): { name: string; text: string } {
  const opts = WRIT_LINES[clan]?.[kind] ?? [];
  const text = opts.length ? opts[Math.abs(Math.floor(seed)) % opts.length].replace(/\{land\}/g, land) : "";
  return { name: LEADERS[clan]?.name ?? "", text };
}
