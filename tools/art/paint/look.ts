/** How each painted character looks: materials, colours and kit. Poses and animation timing come from characters.ts. */
export type HeadGear = "greathelm" | "ninjahood" | "wizardhat" | "hood" | "horned" | "cap" | "helm" | "bandana" | "wide" | "witch" | "none";
export type TorsoKind = "plate" | "wrap" | "robe" | "jerkin" | "bare" | "shirt" | "mail" | "leather";
export type LegKind = "trousers" | "mail" | "wrapped" | "robe" | "fur" | "dress";
export type WeaponKind = "katana" | "sword" | "staff" | "bow" | "axe" | "hammer" | "spear" | "dagger" | "druidstaff" | "witchstaff" | "none";

export interface Look {
  skin: number;
  hair?: number; hairStyle?: "short" | "long" | "ponytail" | "bald" | "none";
  beard?: number; beardStyle?: "full" | "long" | "stubble";
  eye?: number;
  head: HeadGear; headCol?: number; headTrim?: number; plume?: number;
  torso: TorsoKind; torsoCol: number; trim?: number;
  tabard?: { col: number; trim: number; emblem: number };
  apron?: number; vest?: number; sash?: number; belt?: number; buckle?: number; belly?: boolean;
  legs: LegKind; legCol: number; boots: number; bootStyle?: "greave" | "leather" | "wrap" | "shoe";
  sleeve: number; arms: "plate" | "cloth" | "bare" | "wrap"; glove?: number; bracer?: number;
  weapon: WeaponKind;
  shield?: { col: number; trim: number; emblem: number; style: "kite" | "round" };
  back?: "cape" | "quiver" | "pelt"; capeCol?: number;
  orb?: number;   // glowing staff stone
  fx: number;     // swing trail colour
  build?: number; // 1 = normal, >1 broader shoulders
  skull?: boolean;  // the face is a bare skull (eyeGlow lights its sockets)
  bones?: boolean;  // skeletal limbs and ribcage instead of a body
  eyeGlow?: number;
  mask?: number;    // cloth over the lower face
  rags?: number;    // tattered cloth hanging off a skeleton
}

/** Monsters painted with the same body code (sheets built by paint/mobs.ts). */
export const MOB_LOOKS: Record<string, Look> = {
  skeleton: {
    skin: 0xd8d2bc, skull: true, bones: true, eyeGlow: 0xff5a3c, head: "none", rags: 0x3b3640,
    torso: "bare", torsoCol: 0xd8d2bc, legs: "trousers", legCol: 0xd8d2bc, boots: 0x3a3238, bootStyle: "shoe",
    sleeve: 0xd8d2bc, arms: "bare", weapon: "sword", fx: 0xffffff, belt: 0x3a2a1e,
  },
  // the same skeleton with its other weapons (server: SKELETON_WEAPONS), rags dyed a little differently so they read apart
  get skeleton_axe(): Look { return { ...MOB_LOOKS.skeleton, weapon: "axe", rags: 0x4a2f2a }; },
  get skeleton_spear(): Look { return { ...MOB_LOOKS.skeleton, weapon: "spear", rags: 0x2f3a36 }; },
  get skeleton_bow(): Look { return { ...MOB_LOOKS.skeleton, weapon: "bow", rags: 0x3a3a2a }; },
  bandit: {
    skin: 0xd9a77a, hair: 0x3b2f2a, hairStyle: "short", mask: 0xa3231b,
    head: "hood", headCol: 0x40342c, headTrim: 0x2a221c,
    torso: "jerkin", torsoCol: 0x5a4030, trim: 0x3a2a20, belt: 0x2b1d14, buckle: 0x9a8a6a,
    legs: "trousers", legCol: 0x3a3a3a, boots: 0x231a14, bootStyle: "leather",
    sleeve: 0x4a3a30, arms: "cloth", glove: 0x2b1d14, weapon: "dagger", fx: 0xffffff, back: "cape", capeCol: 0x3a2e28,
  },
  skeletonmage: {
    skin: 0xe2ddca, skull: true, bones: true, eyeGlow: 0x7fe7ff, head: "hood", headCol: 0x26338a, headTrim: 0x1a2466,
    torso: "robe", torsoCol: 0x2f3fa6, trim: 0xe0b440, sash: 0x1a2466,
    legs: "robe", legCol: 0x2c3a9a, boots: 0x9a988a, bootStyle: "shoe",
    sleeve: 0x2f3fa6, arms: "cloth", weapon: "staff", orb: 0x7fe7ff, fx: 0xc8fbff,
  },
  necromancer: {
    skin: 0xd2cbb4, skull: true, bones: true, eyeGlow: 0x7dff6a, head: "horned", headCol: 0x2a1838, headTrim: 0xd8d2bf,
    torso: "robe", torsoCol: 0x24152e, trim: 0x8e1b2e, sash: 0x8e1b2e,
    legs: "robe", legCol: 0x1b1024, boots: 0x9a988a, bootStyle: "shoe",
    sleeve: 0x24152e, arms: "cloth", weapon: "staff", orb: 0x7dff6a, fx: 0x7dff6a, back: "cape", capeCol: 0x16091c,
  },
};

export const LOOKS: Record<string, Look> = {
  knight: {
    skin: 0xe8b48a, head: "greathelm", headCol: 0xb9c2cc, plume: 0xc0262f, headTrim: 0xd9a93a,
    torso: "plate", torsoCol: 0xaeb8c4, trim: 0xd9a93a,
    tabard: { col: 0x24468f, trim: 0xd9a93a, emblem: 0xf0c75a },
    legs: "mail", legCol: 0x7d8792, boots: 0x9aa4ae, bootStyle: "greave",
    sleeve: 0xaeb8c4, arms: "plate", glove: 0x6f7883, belt: 0x4a2f1c, buckle: 0xd9a93a,
    weapon: "sword", shield: { col: 0x24468f, trim: 0xd9a93a, emblem: 0xf0c75a, style: "kite" },
    back: "cape", capeCol: 0x8c1d24,
    fx: 0xfff1c4, build: 1.08,
  },
  ninja: {
    skin: 0xe2ad7f, eye: 0x111111, head: "ninjahood", headCol: 0x23253a, headTrim: 0xc21f32,
    torso: "wrap", torsoCol: 0x2b2e48, sash: 0x8a2230,
    legs: "wrapped", legCol: 0x2b2e48, boots: 0x16172a, bootStyle: "wrap",
    sleeve: 0x2b2e48, arms: "wrap", glove: 0xbfc4cf,
    weapon: "katana", fx: 0xbfd7ff, back: "cape", capeCol: 0x1b1c2e,
  },
  wizard: {
    skin: 0xecc39c, hair: 0xe9e7ef, hairStyle: "long", beard: 0xeeeef4, beardStyle: "long",
    head: "wizardhat", headCol: 0x4b2a8c, headTrim: 0xe0b440,
    torso: "robe", torsoCol: 0x5b33a3, trim: 0xe0b440, sash: 0x2e1d55,
    legs: "robe", legCol: 0x5b33a3, boots: 0x4a2e1c, bootStyle: "shoe",
    sleeve: 0x5b33a3, arms: "cloth",
    weapon: "staff", orb: 0x5ee6ff, fx: 0xc8fbff,
  },
  archer: {
    skin: 0xe8b07e, hair: 0xb8662a, hairStyle: "ponytail",
    head: "hood", headCol: 0x355f2e, headTrim: 0x24421f,
    torso: "jerkin", torsoCol: 0x6e4526, trim: 0x4f7f3a, belt: 0x3e2715, buckle: 0xc9a050,
    legs: "trousers", legCol: 0x5c4129, boots: 0x3a2717, bootStyle: "leather",
    sleeve: 0x4a7a38, arms: "cloth", bracer: 0x6e4526, glove: 0x5a3a22,
    weapon: "bow", back: "quiver", capeCol: 0x2f5a2a, fx: 0xe8f7c8,
  },
  barbarian: {
    skin: 0xd99a6a, hair: 0xc8631f, hairStyle: "long", beard: 0xc8631f, beardStyle: "full",
    head: "horned", headCol: 0x7d8792, headTrim: 0xeadfc6,
    torso: "bare", torsoCol: 0xd99a6a, belt: 0x3a2414, buckle: 0xb8b8b8,
    legs: "fur", legCol: 0x6a4527, boots: 0x45301e, bootStyle: "leather",
    sleeve: 0xd99a6a, arms: "bare", bracer: 0x4a3020,
    weapon: "axe", back: "pelt", capeCol: 0x8a6a48, fx: 0xffe0c0, build: 1.12,
  },
  blacksmith: {
    skin: 0xcf9066, hairStyle: "bald", hair: 0x2b2b2b, beard: 0x2b2b2b, beardStyle: "full",
    head: "none", torso: "shirt", torsoCol: 0xb2a088, apron: 0x5e3b20, belt: 0x2e1d10,
    legs: "trousers", legCol: 0x45454e, boots: 0x262626, bootStyle: "leather",
    sleeve: 0xcf9066, arms: "bare", bracer: 0x3a2a1a,
    weapon: "hammer", fx: 0xffb703, build: 1.1,
  },
  merchant: {
    skin: 0xeec4a0, hair: 0x6b4a2e, hairStyle: "short", beard: 0x6b4a2e, beardStyle: "full",
    head: "wide", headCol: 0x6e2652, headTrim: 0xe0b440,
    torso: "shirt", torsoCol: 0xe4d6ba, vest: 0x8f2a52, belt: 0xc9a050, buckle: 0xe0b440, belly: true,
    legs: "trousers", legCol: 0x384566, boots: 0x3a2717, bootStyle: "leather",
    sleeve: 0xe4d6ba, arms: "cloth", weapon: "none", fx: 0xffffff,
  },
  villager: {
    skin: 0xe8b07e, hair: 0x7e3f22, hairStyle: "long",
    head: "bandana", headCol: 0xd2b47c, headTrim: 0xa98a52,
    torso: "shirt", torsoCol: 0x86a8cf, apron: 0xece2cc,
    legs: "dress", legCol: 0x6b5a45, boots: 0x473525, bootStyle: "shoe",
    sleeve: 0x86a8cf, arms: "cloth", weapon: "none", fx: 0xffffff,
  },
  guard: {
    skin: 0xe8b07e, hair: 0x4e342e, hairStyle: "short", beardStyle: "stubble", beard: 0x4e342e,
    head: "helm", headCol: 0xa5aeb8, headTrim: 0x6f7883,
    torso: "mail", torsoCol: 0x8a939e, tabard: { col: 0xa3222b, trim: 0xd9a93a, emblem: 0xf0c75a }, belt: 0x4a2f1c, buckle: 0xd9a93a,
    legs: "trousers", legCol: 0x4a3828, boots: 0x2e2a28, bootStyle: "leather",
    sleeve: 0x8a939e, arms: "cloth", glove: 0x5a3a22,
    weapon: "spear", fx: 0xffffff,
  },
  druid: {
    skin: 0xe2ad84, hair: 0xe6e1d4, hairStyle: "long", beard: 0xf0ece2, beardStyle: "long",
    head: "hood", headCol: 0x4a6430, headTrim: 0x7d6036,
    torso: "robe", torsoCol: 0x56743a, trim: 0x8a6a3a, sash: 0xa88446,
    legs: "robe", legCol: 0x4a6430, boots: 0x4a3420, bootStyle: "shoe",
    sleeve: 0x4a6430, arms: "cloth",
    weapon: "druidstaff", orb: 0x9be564, fx: 0x9be564, back: "cape", capeCol: 0x3c5226,
  },
  witch: {
    skin: 0xbcd4a0, hair: 0x2a1f3d, hairStyle: "long", eye: 0x6a1b9a,
    head: "witch", headCol: 0x2b2140, headTrim: 0x8e44ad,
    torso: "robe", torsoCol: 0x46305f, trim: 0x8e44ad, sash: 0x8e44ad,
    legs: "dress", legCol: 0x2f2244, boots: 0x221a2e, bootStyle: "shoe",
    sleeve: 0x3a2556, arms: "cloth",
    weapon: "witchstaff", orb: 0xc77dff, fx: 0xc77dff, back: "cape", capeCol: 0x231a33,
  },
};
