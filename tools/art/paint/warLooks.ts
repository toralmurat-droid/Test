import { MOB_LOOKS, type Look } from "./look";

/**
 * Clan-war soldiers (shared/war/patrols.ts TROOP_LOOK): a line soldier and an officer for each of the five clans,
 * painted with the same body code as the monsters (sheets mob_war_<key> from paint/mobs.ts, 12 frames + 2 fall frames).
 * Art-only keys: they are not in MOBS, LOOT or any gameplay table. Colours follow shared/war/clans.ts.
 */
export const WAR_SOLDIERS = [
  "war_warden", "war_warden_cap", "war_redfang", "war_redfang_chief", "war_host", "war_host_cap",
  "war_hidekin", "war_hidekin_chief", "war_veiled", "war_veiled_adept",
  // troop roles (shared/war/patrols.ts TROOP_LOOK[clan].roles): same size as the line soldier, a silhouette per role
  "war_warden_bow", "war_warden_pike", "war_redfang_sling", "war_host_bow", "war_host_pike", "war_hidekin_spear", "war_veiled_caster",
] as const;
export type WarSoldier = (typeof WAR_SOLDIERS)[number];

export const WAR_LOOKS: Record<WarSoldier, Look> = {
  // Hearthbound Wardens: amber tabard with the sigil, a dented kettle helm, spear and a round shield
  war_warden: {
    skin: 0xd9a47c, hair: 0x3a2a20, hairStyle: "short", beard: 0x3a2a20, beardStyle: "stubble",
    head: "kettle", headCol: 0x6f757b, headTrim: 0x3e4247,
    torso: "mail", torsoCol: 0x5e646a, tabard: { col: 0xc8741f, trim: 0x3b4a2c, emblem: 0xf0b44a }, belt: 0x3a2618, buckle: 0xd9822b,
    legs: "trousers", legCol: 0x4a3a2a, boots: 0x2a2420, bootStyle: "leather",
    sleeve: 0x5a4a38, arms: "cloth", glove: 0x3e2a1a, bracer: 0x4a3424,
    weapon: "spear", fx: 0xffffff, back: "cape", capeCol: 0x3b4a2c, build: 1.05,
    shield: { col: 0x5a3c22, trim: 0xd9822b, emblem: 0xf0b44a, style: "round" },
  },
  // the Warden captain: plumed helm, plate over the mail, a sword and a kite-less round shield in the clan's green and amber
  war_warden_cap: {
    skin: 0xd9a47c, hair: 0x2a1e16, hairStyle: "short", beard: 0x2a1e16, beardStyle: "full",
    head: "kettle", headCol: 0x8a9096, headTrim: 0xd9822b, plume: 0xd9822b,
    torso: "plate", torsoCol: 0x7a8086, trim: 0xd9822b, tabard: { col: 0xd88a28, trim: 0x2f3a22, emblem: 0xffd06a }, belt: 0x2f2014, buckle: 0xf0b44a,
    legs: "mail", legCol: 0x575d63, boots: 0x2a2420, bootStyle: "greave",
    sleeve: 0x7a8086, arms: "plate", glove: 0x3e2a1a, bracer: 0x4a3424,
    weapon: "sword", fx: 0xfff1c4, back: "cape", capeCol: 0x2f3a22, build: 1.12,
    shield: { col: 0x3b4a2c, trim: 0xd9822b, emblem: 0xf0b44a, style: "round" },
  },
  // Redfang Compact: a red cloak, scrap-iron pauldron and leather, red war paint, a hand axe
  war_redfang: {
    skin: 0xc98f62, hair: 0x1e1814, hairStyle: "short", mask: 0x9a1a14, eye: 0x1a1008,
    head: "bandana", headCol: 0x8e1f1a, headTrim: 0x5a1410,
    torso: "leather", torsoCol: 0x4a3426, trim: 0x6a6a68, belt: 0x2b1d14, buckle: 0x8a8a8a, harness: true,
    legs: "trousers", legCol: 0x3a302a, boots: 0x231a14, bootStyle: "wrap",
    sleeve: 0x4a3a30, arms: "cloth", bracer: 0x6a6a68, glove: 0x2b1d14, weapon: "axe", fx: 0xffd0c0, back: "cape", capeCol: 0x8a1c14, build: 1.08,
  },
  // the Redfang brute: huge, bare-armed, a cleaver, a pelt over scrap plate, a fang trophy on the belt
  war_redfang_chief: {
    skin: 0xc08458, hair: 0x1a1410, hairStyle: "bald", beard: 0x1a1410, beardStyle: "full", mask: 0x9a1a14,
    head: "horned", headCol: 0x55504a, headTrim: 0xe3d6b8,
    torso: "mail", torsoCol: 0x5c5a58, trim: 0x2a1c14, tabard: { col: 0x7e1d16, trim: 0x1a1414, emblem: 0xe3d6b8 }, belt: 0x2b1d14, buckle: 0xe3d6b8,
    legs: "fur", legCol: 0x4a3a2c, boots: 0x231a14, bootStyle: "wrap",
    sleeve: 0xc08458, arms: "bare", bracer: 0x6a6a68, glove: 0x2b1d14, weapon: "axe", bladeLen: 1.2, fx: 0xff8a70,
    back: "pelt", capeCol: 0x7e1d16, build: 1.3,
  },
  // Ossuary Host: a legionary in rusted plate, teal soul-glow in the sockets, a tower shield and a spear
  war_host: {
    skin: 0xcfc8b0, skull: true, bones: true, eyeGlow: 0x4fe8c0, head: "helm", headCol: 0x6a5a48, headTrim: 0x4f7d6a, rags: 0x1f2422,
    torso: "plate", torsoCol: 0x5e4c3c, trim: 0x4f7d6a, tabard: { col: 0x1f2422, trim: 0x4f7d6a, emblem: 0xd8cfb2 }, belt: 0x2a2420, buckle: 0x8a6a40,
    legs: "mail", legCol: 0x4a4038, boots: 0x3a3028, bootStyle: "greave",
    sleeve: 0x6a5a48, arms: "plate", glove: 0x3a3028, weapon: "spear", fx: 0x4fe8c0, build: 1.02,
    shield: { col: 0x2a302c, trim: 0x7a5a38, emblem: 0xd8cfb2, style: "kite" },
  },
  // the bone captain: taller, a crested helm, heavy rusted plate, a great blade and a ragged teal cloak
  war_host_cap: {
    skin: 0xd8d0b6, skull: true, bones: true, eyeGlow: 0x6ffff0, head: "kettle", headCol: 0x7a6650, headTrim: 0x4f7d6a, plume: 0x2f8f78,
    torso: "plate", torsoCol: 0x6a5846, trim: 0x4f7d6a, tabard: { col: 0x1a2220, trim: 0x4f7d6a, emblem: 0xd8cfb2 }, belt: 0x2a2420, buckle: 0xb08a50,
    legs: "mail", legCol: 0x544636, boots: 0x3a3028, bootStyle: "greave",
    sleeve: 0x6a5846, arms: "plate", glove: 0x3a3028, weapon: "sword", bladeLen: 1.5, fx: 0x4fe8c0,
    back: "cape", capeCol: 0x1f3a34, build: 1.18,
  },
  // Hide-Kin of Mawdeep: a burrower under a rat-hide hood, hide armour, a mining pick (hammer pose)
  war_hidekin: {
    skin: 0xb49474, hairStyle: "none", beast: "rat", beastHood: true, head: "none", eye: 0x3a1010,
    torso: "leather", torsoCol: 0x8a5e30, trim: 0x4a3018, belt: 0x2e2218, buckle: 0x8a6a48, harness: true,
    legs: "fur", legCol: 0x5a4430, boots: 0x3a2a1c, bootStyle: "wrap",
    sleeve: 0x7a6858, arms: "cloth", bracer: 0x3a2a1a, glove: 0x2a2018, weapon: "pick", fx: 0xd8d0c0, back: "pelt", capeCol: 0x8a6a40, tail: 0xa08078,
  },
  // the Hide-Kin war-chief: a tusked boar-man in layered hides, red-dyed straps, a great pick-axe
  war_hidekin_chief: {
    skin: 0xa07a5e, hairStyle: "none", beard: 0x3a2a20, beardStyle: "stubble", beast: "boar", beastHood: true, head: "none",
    torso: "leather", torsoCol: 0x4a3626, trim: 0x6e1d18, belt: 0x241a14, buckle: 0xe2c79a, harness: true,
    legs: "fur", legCol: 0x3a2c22, boots: 0x2a201a, bootStyle: "wrap",
    sleeve: 0xa07a5e, arms: "bare", bracer: 0x6e1d18, glove: 0x1e1610, weapon: "pick", bladeLen: 1.25, fx: 0xffd0a0, back: "pelt", capeCol: 0x9a6a30, build: 1.4,
  },
  // Veiled Circle: an indigo-robed acolyte, a veil over the face, a curved blade
  war_veiled: {
    skin: 0xa8784e, hair: 0x1a1414, hairStyle: "none", mask: 0x1e1838, eye: 0xffc040,
    head: "hood", headCol: 0x3a3a82, headTrim: 0xe0a030,
    torso: "robe", torsoCol: 0x42429a, trim: 0xe0a030, sash: 0x8a3a9a,
    legs: "robe", legCol: 0x30306c, boots: 0x6a5030, bootStyle: "shoe",
    sleeve: 0x42429a, arms: "cloth", glove: 0x2a2040, weapon: "katana", fx: 0xffd080, back: "cape", capeCol: 0x1e1e46,
  },
  // the masked adept: a gold half-mask, a high collar, a staff that glows faintly
  war_veiled_adept: {
    skin: 0xa8784e, hair: 0x1a1414, hairStyle: "none", mask: 0xc89a3a, eye: 0xfff0a0, eyeGlow: 0xffd060,
    head: "hood", headCol: 0x1e1e46, headTrim: 0xf6d26b,
    torso: "robe", torsoCol: 0x2a2a5a, trim: 0xf6d26b, sash: 0xe0a030,
    legs: "robe", legCol: 0x1e1e46, boots: 0x6a5030, bootStyle: "shoe",
    sleeve: 0x2a2a5a, arms: "cloth", glove: 0xe0a030, bracer: 0xe0a030, weapon: "staff", orb: 0xffd060, fx: 0xffe0a0, back: "cape", capeCol: 0x161638, build: 1.12,
  },
  // Warden longbowman: no mail or shield, an amber-trimmed leather jerkin, a feathered cap, a tall longbow and a full quiver
  war_warden_bow: {
    skin: 0xd9a47c, hair: 0x4a3626, hairStyle: "short", beard: 0x4a3626, beardStyle: "stubble",
    head: "cap", headCol: 0x3b4a2c, headTrim: 0xc8741f,
    torso: "leather", torsoCol: 0x6a5232, trim: 0xc8741f, tabard: { col: 0xc8741f, trim: 0x3b4a2c, emblem: 0xf0b44a }, belt: 0x3a2618, buckle: 0xd9822b,
    legs: "trousers", legCol: 0x3e4a30, boots: 0x2a2420, bootStyle: "leather",
    sleeve: 0x5a4a38, arms: "cloth", glove: 0x3e2a1a, bracer: 0x4a3424,
    weapon: "bow", fx: 0xffffff, back: "quiver", capeCol: 0x5a3c22, build: 0.98,
  },
  // Warden pikeman: a deep kettle helm with a nasal bar, mail and tabard, a very long pike in both hands, no shield
  war_warden_pike: {
    skin: 0xd9a47c, hair: 0x3a2a20, hairStyle: "short", beard: 0x3a2a20, beardStyle: "full",
    head: "helm", headCol: 0x8a9096, headTrim: 0xc8741f, plume: 0x3b4a2c,
    torso: "mail", torsoCol: 0x6a7076, trim: 0xc8741f, tabard: { col: 0xc8741f, trim: 0x3b4a2c, emblem: 0xf0b44a }, belt: 0x3a2618, buckle: 0xd9822b,
    legs: "mail", legCol: 0x575d63, boots: 0x2a2420, bootStyle: "greave",
    sleeve: 0x6a7076, arms: "plate", glove: 0x3e2a1a, bracer: 0x4a3424,
    weapon: "spear", bladeLen: 1.5, bladeCol: 0xd8dde0, fx: 0xffffff, build: 1.1,
  },
  // Redfang slinger: ragged, hooded in a torn red rag, a stone-pouch and a sling cord on the belt, bone fetishes, bare arms
  war_redfang_sling: {
    skin: 0xc98f62, hair: 0x1e1814, hairStyle: "ponytail", mask: 0x9a1a14, eye: 0x1a1008,
    head: "hood", headCol: 0x7a2a22, headTrim: 0x4a1410,
    torso: "wrap", torsoCol: 0x5a4636, trim: 0x8e1f1a, belt: 0x2b1d14, buckle: 0x8a8a8a, harness: true,
    legs: "wrapped", legCol: 0x4a3a30, boots: 0x231a14, bootStyle: "wrap",
    sleeve: 0xc98f62, arms: "bare", bracer: 0x6a6a68, glove: 0x2b1d14, weapon: "none", fetishes: 0xb8a888, fx: 0xffd0c0, back: "quiver", capeCol: 0x6a4a2a, build: 0.95,
  },
  // Ossuary bone archer: a bare skeleton in a rusted open cap, torn teal rags, a bow of bone, a quiver of black arrows
  war_host_bow: {
    skin: 0xcfc8b0, skull: true, bones: true, eyeGlow: 0x4fe8c0, head: "cap", headCol: 0x6a5a48, headTrim: 0x4f7d6a, rags: 0x1f3a34,
    torso: "bare", torsoCol: 0xcfc8b0, trim: 0x4f7d6a, belt: 0x2a2420, buckle: 0x8a6a40,
    legs: "trousers", legCol: 0xcfc8b0, boots: 0x3a3028, bootStyle: "shoe",
    sleeve: 0xcfc8b0, arms: "bare", glove: 0x3a3028, weapon: "bow", bladeCol: 0xd8cfb2, fx: 0x4fe8c0, back: "quiver", capeCol: 0x1f2422, build: 0.95,
  },
  // Host pike phalanx: the legionary with a tall tower helm, rusted plate, a long pike braced in both hands
  war_host_pike: {
    skin: 0xcfc8b0, skull: true, bones: true, eyeGlow: 0x4fe8c0, head: "greathelm", headCol: 0x6a5a48, headTrim: 0x4f7d6a, plume: 0x2f8f78, rags: 0x1f2422,
    torso: "plate", torsoCol: 0x5e4c3c, trim: 0x4f7d6a, tabard: { col: 0x1f2422, trim: 0x4f7d6a, emblem: 0xd8cfb2 }, belt: 0x2a2420, buckle: 0x8a6a40,
    legs: "mail", legCol: 0x4a4038, boots: 0x3a3028, bootStyle: "greave",
    sleeve: 0x6a5a48, arms: "plate", glove: 0x3a3028, weapon: "spear", bladeLen: 1.5, bladeCol: 0xb8b09a, fx: 0x4fe8c0, build: 1.12,
  },
  // Hide-Kin burrow-spear: a lean rat-hooded spearman in pale hides, a long barbed bone spear, claw-gloves, a tail
  war_hidekin_spear: {
    skin: 0xb49474, hairStyle: "none", beast: "rat", beastHood: true, head: "none", eye: 0x3a1010,
    torso: "leather", torsoCol: 0x6a4a2a, trim: 0x4a3018, belt: 0x2e2218, buckle: 0x8a6a48, harness: true,
    legs: "fur", legCol: 0x5a4430, boots: 0x3a2a1c, bootStyle: "wrap",
    sleeve: 0x7a6858, arms: "bare", bracer: 0x3a2a1a, glove: 0x2a2018, claws: 0xe8dfc4, weapon: "spear", bladeLen: 1.45, bladeCol: 0xe8dfc4, fx: 0xd8d0c0,
    back: "pelt", capeCol: 0x8a6a40, tail: 0xa08078, fetishes: 0xd8cfb4, build: 0.98,
  },
  // Veiled sun-caster: a gold-trimmed saffron-and-indigo robe, a veil, a sun-disc staff glowing gold
  war_veiled_caster: {
    skin: 0xa8784e, hair: 0x1a1414, hairStyle: "none", mask: 0xe0a030, eye: 0xfff0a0, eyeGlow: 0xffd060,
    head: "hood", headCol: 0xc8902a, headTrim: 0xfff0a0,
    torso: "robe", torsoCol: 0x3a3a82, trim: 0xf6d26b, sash: 0xe0a030,
    legs: "robe", legCol: 0xc8902a, boots: 0x6a5030, bootStyle: "shoe",
    sleeve: 0x3a3a82, arms: "cloth", glove: 0xe0a030, bracer: 0xf6d26b, weapon: "staff", orb: 0xffe070, fx: 0xffe8a0, back: "cape", capeCol: 0xb8801e, build: 1.04,
  },
};
Object.assign(MOB_LOOKS, WAR_LOOKS);

/**
 * Clan-war riders (shared/war/patrols.ts TROOP_LOOK[clan].roles.rider): the same rider on a mount (paint/warRiders.ts builds the
 * mount in 3D, paint/mobs.ts lays the rider on it). Frames 48 x 48, the 14-frame soldier layout. Art-only keys.
 */
export const WAR_RIDERS = ["war_warden_rider", "war_redfang_rider", "war_host_rider", "war_hidekin_rider", "war_veiled_rider"] as const;
export type WarRider = (typeof WAR_RIDERS)[number];

export const RIDER_LOOKS: Record<WarRider, Look> = {
  // Warden lancer: kettle helm, amber tabard, a long lance and a kite shield in the clan's green and amber
  war_warden_rider: {
    ...WAR_LOOKS.war_warden, weapon: "spear", bladeLen: 1.5, plume: 0xd9822b,
    shield: { col: 0x3b4a2c, trim: 0xd9822b, emblem: 0xf0b44a, style: "kite" },
  },
  // Redfang raider: a red hood, scrap-iron and leather, a hand axe
  war_redfang_rider: {
    ...WAR_LOOKS.war_redfang, head: "hood", headCol: 0x8e1f1a, headTrim: 0x5a1410, weapon: "axe", bladeLen: 1.1,
  },
  // Ossuary Host bone rider: a skeleton in teal rags, a long lance
  war_host_rider: {
    ...WAR_LOOKS.war_host, head: "none", rags: 0x2f8f78, weapon: "spear", bladeLen: 1.5, shield: undefined,
    tabard: { col: 0x1f3a34, trim: 0x4f7d6a, emblem: 0xd8cfb2 }, back: "cape", capeCol: 0x2a6a58,
  },
  // Hide-Kin boar rider: the rat-hooded spearman with a barbed bone spear
  war_hidekin_rider: { ...WAR_LOOKS.war_hidekin_spear, bladeLen: 1.5 },
  // Veiled dune rider: saffron and indigo robes, a curved blade
  war_veiled_rider: {
    ...WAR_LOOKS.war_veiled_caster, weapon: "sword", orb: undefined, bladeLen: 1.25, bladeCol: 0xd8d4c8, fx: 0xffe8a0,
  },
};
Object.assign(MOB_LOOKS, RIDER_LOOKS);
