/** How each painted character looks: materials, colours and kit. Poses and animation timing come from characters.ts. */
export type HeadGear = "crown" | "greathelm" | "ninjahood" | "wizardhat" | "hood" | "horned" | "cap" | "helm" | "bandana" | "wide" | "witch" | "none";
export type TorsoKind = "plate" | "wrap" | "robe" | "jerkin" | "bare" | "shirt" | "mail" | "leather";
export type LegKind = "trousers" | "mail" | "wrapped" | "robe" | "fur" | "dress" | "bare";
export type WeaponKind = "katana" | "sword" | "staff" | "wand" | "bow" | "axe" | "hammer" | "spear" | "dagger" | "druidstaff" | "witchstaff" | "boneblade" | "none";

export interface Look {
  skin: number;
  hair?: number; hairStyle?: "short" | "long" | "ponytail" | "bald" | "none";
  beard?: number; beardStyle?: "full" | "long" | "stubble";
  eye?: number;
  head: HeadGear; headCol?: number; headTrim?: number; plume?: number;
  torso: TorsoKind; torsoCol: number; trim?: number;
  tabard?: { col: number; trim: number; emblem: number };
  apron?: number; vest?: number; sash?: number; belt?: number; buckle?: number; belly?: boolean;
  legs: LegKind; legCol: number; boots: number; bootStyle?: "greave" | "leather" | "wrap" | "shoe" | "bare";
  sleeve: number; arms: "plate" | "cloth" | "bare" | "wrap"; glove?: number; bracer?: number;
  weapon: WeaponKind;
  shield?: { col: number; trim: number; emblem: number; style: "kite" | "round" };
  back?: "cape" | "quiver" | "pelt"; capeCol?: number;
  orb?: number;   // glowing staff stone
  lips?: number;    // painted lips (front view)
  corset?: number;   // laced waist cincher over the bodice
  palmFlame?: number; // a small witch-fire dancing over the open near hand
  fx: number;     // swing trail colour
  build?: number; // 1 = normal, >1 broader shoulders
  skull?: boolean;  // the face is a bare skull (eyeGlow lights its sockets)
  bones?: boolean;  // skeletal limbs and ribcage instead of a body
  eyeGlow?: number;
  mask?: number;    // cloth over the lower face
  rags?: number;    // tattered cloth hanging off a skeleton
  harness?: boolean; // leather strap across a bare chest (barbarian kit)
  collar?: number; // tall stand-up collar on the cape, this colour inside (vampire kit)
  weaponKind?: WeaponKind; // what found weapons look like in this hero's hands (heroes start with weapon "none")
  /** Bone Demon (DEMON.harvest): skeleton pieces it wears, painted onto the body: 1 pauldrons, 2 rib cuirass, 3 bone blade, 4 skull crown. */
  boneArmour?: number;
  /** Sword length/width multiplier (the Hollow King's greatsword). */
  bladeLen?: number;
  /** Beast-folk of the Mawdeep (shared/dungeon.ts): the animal head whose hide this man or woman was sewn into. */
  beast?: BeastHead;
  /** The other half of the beast-folk: a man's face, the animal's head flayed back as a hood (the rest is beast). */
  beastHood?: boolean;
  /** What the rite grew on their backs: a naked tail, spider legs, wings that beat. */
  tail?: number; spiderLegs?: number; wings?: { col: number; kind: "bat" | "feather" };
}
export type BeastHead = "rat" | "boar" | "spider" | "bat" | "wolf" | "bull" | "bear" | "crow" | "camel";

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
  // Redfang Hollow roles (shared/bandits.ts): a bare-armed axe brute, a hooded archer, and their chief
  bandit_brute: {
    skin: 0xc98f62, hair: 0x2a201a, hairStyle: "bald", beard: 0x2a201a, beardStyle: "full", mask: 0xa3231b,
    head: "bandana", headCol: 0x8e1f1a, headTrim: 0x5a1410,
    torso: "leather", torsoCol: 0x4a3426, trim: 0x2a1c14, belt: 0x2b1d14, buckle: 0x8a8a8a, harness: true,
    legs: "fur", legCol: 0x5a4a3a, boots: 0x231a14, bootStyle: "wrap",
    sleeve: 0xc98f62, arms: "bare", bracer: 0x3a2a1e, glove: 0x2b1d14, weapon: "axe", fx: 0xffd0c0, build: 1.22,
  },
  bandit_archer: {
    skin: 0xd9a77a, hair: 0x5a3a22, hairStyle: "short", mask: 0xa3231b,
    head: "hood", headCol: 0x3a3a2a, headTrim: 0x24241a,
    torso: "jerkin", torsoCol: 0x4e4a34, trim: 0x2e2a1e, belt: 0x2b1d14, buckle: 0x9a8a6a,
    legs: "trousers", legCol: 0x3a342c, boots: 0x231a14, bootStyle: "leather",
    sleeve: 0x3e3a2c, arms: "cloth", bracer: 0x5a3a22, glove: 0x2b1d14, weapon: "bow", back: "quiver", capeCol: 0x3a2a1e, fx: 0xffffff,
  },
  banditchief: {
    skin: 0xcf9a6e, hair: 0x1e1814, hairStyle: "long", beard: 0x1e1814, beardStyle: "full", eye: 0x111111,
    head: "horned", headCol: 0x55504a, headTrim: 0xc9c0ae,
    torso: "mail", torsoCol: 0x6b6a6a, trim: 0x3a2a20, tabard: { col: 0x7e1c18, trim: 0x2a1a14, emblem: 0x3a1210 },
    belt: 0x2b1d14, buckle: 0xc9a050,
    legs: "fur", legCol: 0x4a3a2c, boots: 0x231a14, bootStyle: "leather",
    sleeve: 0x5a5856, arms: "plate", glove: 0x2b1d14, bracer: 0x3a2a1e, weapon: "axe", fx: 0xff8a70,
    back: "pelt", capeCol: 0x5a4632, build: 1.25,
  },
  skeletonmage: {
    skin: 0xe2ddca, skull: true, bones: true, eyeGlow: 0x7fe7ff, head: "hood", headCol: 0x26338a, headTrim: 0x1a2466,
    torso: "robe", torsoCol: 0x2f3fa6, trim: 0xe0b440, sash: 0x1a2466,
    legs: "robe", legCol: 0x2c3a9a, boots: 0x9a988a, bootStyle: "shoe",
    sleeve: 0x2f3fa6, arms: "cloth", weapon: "staff", orb: 0x7fe7ff, fx: 0xc8fbff,
  },
  // ---- the beast-folk of the Mawdeep Warrens: valley folk sewn into animal hides by the Hide-Mother's rite
  gnawkin: { // rat: a starved, hunched wretch in mangy rat hide, a rusty shiv
    skin: 0x7a6e64, beast: "rat", hairStyle: "none", head: "none", eyeGlow: 0xff3a2a,
    torso: "bare", torsoCol: 0x7a6e64, belt: 0x2e2218, harness: true, legs: "fur", legCol: 0x5e554c, boots: 0x6a5f56, bootStyle: "bare",
    sleeve: 0x7a6e64, arms: "bare", bracer: 0x3a2e24, weapon: "dagger", fx: 0xd8d0c0, back: "pelt", capeCol: 0x5a5148,
  },
  tuskborn: { // boar: a broad brute under a bristly boar hide, a spiked club
    skin: 0xa07a5e, beast: "boar", hairStyle: "none", head: "none", eyeGlow: 0xffa23a,
    torso: "leather", torsoCol: 0x3e3028, trim: 0x241a14, belt: 0x241a14, buckle: 0x6a5a48, legs: "fur", legCol: 0x3a2c22, boots: 0x2a201a, bootStyle: "wrap",
    sleeve: 0xa07a5e, arms: "bare", bracer: 0x3e3028, glove: 0x241a14, weapon: "hammer", fx: 0xffd0a0, back: "pelt", capeCol: 0x33281f, build: 1.3,
  },
  silkwretch: { // spider: a thin, pale thing wound in grubby silk, many eyes, fangs
    skin: 0xb8b0a2, beast: "spider", hairStyle: "none", head: "none", eyeGlow: 0x9dff6a,
    torso: "wrap", torsoCol: 0x8a8476, trim: 0x6e685c, legs: "wrapped", legCol: 0x7e786c, boots: 0x5a544a, bootStyle: "wrap",
    sleeve: 0x8a8476, arms: "wrap", glove: 0x2a2228, weapon: "none", fx: 0xd8ffc0,
  },
  duskwing: { // bat: black fur, great ears, wing-membrane grown from the shoulders: it flies
    skin: 0x7a6662, beast: "bat", hairStyle: "none", head: "none", eyeGlow: 0xffe080,
    torso: "leather", torsoCol: 0x2e2426, trim: 0x1a1416, belt: 0x1a1416, legs: "fur", legCol: 0x2a2224, boots: 0x1e181a, bootStyle: "wrap",
    sleeve: 0x2e2426, arms: "cloth", glove: 0x1e181a, weapon: "dagger", fx: 0xffe8c0, wings: { col: 0x3a2628, kind: "bat" },
  },
  // the other half of each kind: a man's face under the flayed animal head, but the body gone over to the beast
  gnawkin_folk: { // a bone-slinger: furred all over, claws, a naked tail; throws stones and bones
    skin: 0xb09a8a, hairStyle: "none", beast: "rat", beastHood: true, head: "none", eye: 0x3a1010,
    torso: "bare", torsoCol: 0x6e655c, belt: 0x2e2218, legs: "fur", legCol: 0x5e554c, boots: 0x6a5f56, bootStyle: "bare",
    sleeve: 0x6e655c, arms: "bare", glove: 0x2a2018, weapon: "none", fx: 0xd8d0c0, tail: 0xa08078,
  },
  tuskborn_folk: { // a bristle-backed brute with a man's scowl under the boar's snout, a hatchet
    skin: 0xa07a5e, hairStyle: "none", beard: 0x3a2a20, beardStyle: "stubble", beast: "boar", beastHood: true, head: "none",
    torso: "bare", torsoCol: 0x3e3028, belt: 0x241a14, buckle: 0x6a5a48, harness: true, legs: "fur", legCol: 0x3a2c22, boots: 0x2a201a, bootStyle: "bare",
    sleeve: 0x3e3028, arms: "bare", glove: 0x1e1610, weapon: "axe", fx: 0xffd0a0, build: 1.3,
  },
  silkwretch_folk: { // chitin where the skin was, spider legs out of the back, a woman's face under the spider's
    skin: 0xc0b4a6, hairStyle: "none", beast: "spider", beastHood: true, head: "none", eye: 0x1a3a10, lips: 0x5a3a3a,
    torso: "leather", torsoCol: 0x2a2228, trim: 0x4a3a44, legs: "wrapped", legCol: 0x3a3036, boots: 0x2a2228, bootStyle: "wrap",
    sleeve: 0x2a2228, arms: "bare", glove: 0x1a1418, weapon: "none", fx: 0xd8ffc0, spiderLegs: 0x2e262c,
  },
  duskwing_folk: { // a pale face under the bat's ears, wings of skin, a hooked knife
    skin: 0xb8a8a0, hairStyle: "none", beast: "bat", beastHood: true, head: "none", eye: 0x3a2a10,
    torso: "bare", torsoCol: 0x2e2426, belt: 0x1a1416, legs: "fur", legCol: 0x2a2224, boots: 0x1e181a, bootStyle: "bare",
    sleeve: 0x2e2426, arms: "bare", glove: 0x1e181a, weapon: "dagger", fx: 0xffe8c0, wings: { col: 0x4a2e30, kind: "bat" },
  },
  crowseer: { // a crow-folk seer: beaked, black-feathered, flies on crow wings and casts hexes from a bone staff
    skin: 0x6a6070, beast: "crow", hairStyle: "none", head: "none", eyeGlow: 0xb8a8ff,
    torso: "robe", torsoCol: 0x1e1a22, trim: 0x5a4a6a, sash: 0x3a2a4a, legs: "robe", legCol: 0x1a161e, boots: 0x3a3438, bootStyle: "bare",
    sleeve: 0x1e1a22, arms: "cloth", glove: 0x3a3438, weapon: "staff", orb: 0xa890ff, fx: 0xc8b8ff, wings: { col: 0x1e1a24, kind: "feather" },
  },
  gnasher: { // Old Gnasher, the rat-queen of the Gnawing Halls: huge, mangy, a robe of rat pelts, a meat cleaver
    skin: 0x7a6e64, beast: "rat", hairStyle: "none", head: "none", eyeGlow: 0xff3a2a,
    torso: "robe", torsoCol: 0x4e463e, trim: 0x2e2620, sash: 0x5a1a12, legs: "fur", legCol: 0x4e463e, boots: 0x6a5f56, bootStyle: "bare",
    sleeve: 0x5e554c, arms: "bare", glove: 0x2a2018, weapon: "axe", fx: 0xd8d0c0, back: "pelt", capeCol: 0x5a5148, tail: 0xa08078, build: 1.45,
  },
  weaver: { // the Weaver of the Silk Pens: a spider-matron on eight legs of chitin, swathed in silk, a staff hung with cocoons
    skin: 0xb8b0a2, beast: "spider", hairStyle: "none", head: "none", eyeGlow: 0x9dff6a,
    torso: "robe", torsoCol: 0xb0aa9c, trim: 0x6e685c, sash: 0x3a3036, legs: "robe", legCol: 0x9a9486, boots: 0x2a2228, bootStyle: "wrap",
    sleeve: 0xa8a294, arms: "wrap", glove: 0x2a2228, weapon: "staff", orb: 0x9dff6a, fx: 0xd8ffc0, spiderLegs: 0x2a2228, build: 1.35,
  },
  packlord: { // Gorehowl: a hulking wolf-man, grey pelt, a notched axe, bone trinkets
    skin: 0x9a8a7a, beast: "wolf", hairStyle: "none", head: "none", eyeGlow: 0xffd23c,
    torso: "leather", torsoCol: 0x4a4440, trim: 0x2a2624, belt: 0x2a1e16, buckle: 0xd8d0b8, harness: true, legs: "fur", legCol: 0x5a5652, boots: 0x2a2420, bootStyle: "wrap",
    sleeve: 0x9a8a7a, arms: "bare", bracer: 0x3a2e24, glove: 0x2a1e16, weapon: "axe", fx: 0xff8a70, back: "pelt", capeCol: 0x6a6662, build: 1.35,
  },
  hornbrute: { // the Hornbrute: a giant under a black bull's hide, horns wider than a door, a stone maul
    skin: 0x8a6a56, beast: "bull", hairStyle: "none", head: "none", eyeGlow: 0xff3a2a,
    torso: "bare", torsoCol: 0x8a6a56, belt: 0x241a14, buckle: 0xc9a050, harness: true, legs: "fur", legCol: 0x2e221c, boots: 0x1e1612, bootStyle: "wrap",
    sleeve: 0x8a6a56, arms: "bare", bracer: 0x2e221c, glove: 0x241a14, weapon: "hammer", fx: 0xffb0a0, back: "pelt", capeCol: 0x2a201a, build: 1.5,
  },
  hidemother: { // Grandam Ursk, the Hide-Mother: a she-bear's head and a robe of stitched hides, a staff of bones
    skin: 0x9a7a60, beast: "bear", hairStyle: "none", head: "none", eyeGlow: 0xff8a2a,
    torso: "robe", torsoCol: 0x5a4030, trim: 0x8a6a48, sash: 0x6a1a12, legs: "robe", legCol: 0x4a3426, boots: 0x2a1e16, bootStyle: "wrap",
    sleeve: 0x5a4030, arms: "cloth", glove: 0x3a2a1e, weapon: "staff", orb: 0xff4a2a, fx: 0xff8a50, back: "pelt", capeCol: 0x4a3626, build: 1.45,
  },
  // ---- Act 2, the Sunscar (Murat 2026-11-08): desert raiders, the buried dead, the Veiled Circle and the camel-folk
  nomad: { // a Dustrider raider: sand-coloured wraps and hood, an indigo veil over the face, a curved blade
    skin: 0xb07a50, hair: 0x1e1814, hairStyle: "short", mask: 0x2a3a6a, eye: 0x1a1008,
    head: "hood", headCol: 0xc8aa7a, headTrim: 0x8a6a48,
    torso: "wrap", torsoCol: 0xb89a70, trim: 0x7a5a3a, sash: 0x8a2a1a, belt: 0x3a2a1a, buckle: 0xc9a050,
    legs: "trousers", legCol: 0x8a7050, boots: 0x5a4430, bootStyle: "wrap",
    sleeve: 0xa88a62, arms: "cloth", bracer: 0x5a4030, glove: 0x3a2a1a, weapon: "sword", fx: 0xfff0d0, back: "cape", capeCol: 0xa07850,
  },
  nomad_folk: { // a Dustrider archer: darker wraps, a short horn bow and a quiver
    skin: 0xa8704a, hair: 0x1e1814, hairStyle: "short", mask: 0x6a1a14, eye: 0x1a1008,
    head: "hood", headCol: 0x8a6a48, headTrim: 0x5a4430,
    torso: "wrap", torsoCol: 0x9a7a54, trim: 0x5a4030, sash: 0x2a3a6a, belt: 0x3a2a1a, buckle: 0xc9a050,
    legs: "trousers", legCol: 0x6a5440, boots: 0x4a3828, bootStyle: "wrap",
    sleeve: 0x8a6a48, arms: "cloth", bracer: 0x5a4030, glove: 0x3a2a1a, weapon: "bow", back: "quiver", capeCol: 0x5a3a22, fx: 0xfff0d0,
  },
  sanddead: { // the dead of Kharsun: sand-scoured bones in linen grave-wraps and a bronze helm, a khopesh, amber eyes
    skin: 0xd8c49a, skull: true, bones: true, eyeGlow: 0xffb030, head: "helm", headCol: 0x8a6a2e, headTrim: 0xc9a050, rags: 0xc8b088,
    torso: "bare", torsoCol: 0xd8c49a, legs: "trousers", legCol: 0xd8c49a, boots: 0x6a5434, bootStyle: "wrap",
    sleeve: 0xd8c49a, arms: "bare", bracer: 0x8a6a2e, weapon: "sword", fx: 0xffe0a0, belt: 0x8a6a2e, buckle: 0xc9a050,
  },
  veiled: { // an adept of the Veiled Circle: indigo robes trimmed in gold, a veil, a staff crowned with a little sun
    skin: 0xa8784e, hair: 0x1a1414, hairStyle: "none", mask: 0x1e1838, eye: 0xffc040,
    head: "hood", headCol: 0x2a2350, headTrim: 0xd8a040,
    torso: "robe", torsoCol: 0x3a2e6a, trim: 0xe0b040, sash: 0xd87a20,
    legs: "robe", legCol: 0x30285a, boots: 0x6a5030, bootStyle: "shoe",
    sleeve: 0x3a2e6a, arms: "cloth", glove: 0x2a2040, weapon: "staff", orb: 0xffb040, fx: 0xffd080,
  },
  camelfolk: { // a camel-man of the mesas: a camel's long head on a broad, sun-dark body, desert-blue cloth, a long spear
    skin: 0xc09060, beast: "camel", hairStyle: "none", head: "none", eyeGlow: 0xffe0a0,
    torso: "leather", torsoCol: 0x6a4a2e, trim: 0x3a2a1a, sash: 0x2a5a8a, belt: 0x3a2a1a, buckle: 0xc9a050,
    legs: "fur", legCol: 0xa07a4c, boots: 0x4a3424, bootStyle: "wrap",
    sleeve: 0xc09060, arms: "bare", bracer: 0x2a5a8a, glove: 0x3a2a1a, weapon: "spear", fx: 0xfff0d0, back: "cape", capeCol: 0x2a5a8a, build: 1.3,
  },
  // summoned by a skeleton ritual (BONES.ritual): a hulking red brute with horns, a bone harness and a cleaver
  demon: {
    skin: 0xa8241c, hairStyle: "none", eyeGlow: 0xffd23c, skull: true, head: "horned", headCol: 0x3a1410, headTrim: 0xe8dcc0,
    torso: "bare", torsoCol: 0xa8241c, harness: true, belt: 0x2a1410, buckle: 0xd8c27a,
    legs: "fur", legCol: 0x2e1a14, boots: 0x3a1410, bootStyle: "bare",
    sleeve: 0xa8241c, arms: "bare", bracer: 0x2a1410, weapon: "axe", fx: 0xff6a2a, build: 1.4, back: "pelt", capeCol: 0x1e0c0a,
  },
  // the demon wearing 1-4 harvested skeletons (sheets mob_demon1..4): painted on its body so they move with it
  get demon1(): Look { return { ...MOB_LOOKS.demon, boneArmour: 1 }; },
  get demon2(): Look { return { ...MOB_LOOKS.demon, boneArmour: 2 }; },
  get demon3(): Look { return { ...MOB_LOOKS.demon, boneArmour: 3, weapon: "boneblade" }; },
  get demon4(): Look { return { ...MOB_LOOKS.demon, boneArmour: 4, weapon: "boneblade" }; },
  // Ostrevar, the Hollow King (the first zone's final boss): a crowned skull in blackened royal plate, a ragged
  // purple tabard with his gold crown on it, a torn grave-cloak and a crown-forged greatsword; the Gloam's green in his eyes
  hollowking: {
    skin: 0xc9c2a8, skull: true, eyeGlow: 0xa6ff4a, head: "crown", headCol: 0xa8843a, headTrim: 0x9dff6a,
    torso: "plate", torsoCol: 0x4a4d55, trim: 0xa8843a, tabard: { col: 0x34203f, trim: 0xa8843a, emblem: 0xd0aa4e },
    belt: 0x24181c, buckle: 0xd0aa4e,
    legs: "mail", legCol: 0x3e4048, boots: 0x3a3c44, bootStyle: "greave",
    sleeve: 0x4a4d55, arms: "plate", glove: 0x2e3036, weapon: "sword", bladeLen: 1.45, fx: 0x9dff6a,
    back: "cape", capeCol: 0x3a1218, build: 1.35,
  },
  // the vampire's Brides (v_brides): deathly pale, long black hair under a torn white veil, a white wedding dress
  // stained with blood at the hem and the mouth, red eyes, bare feet and long nails
  bride: {
    skin: 0xe9e1e4, hair: 0x15101a, hairStyle: "long", eye: 0xff2d2d, lips: 0x8e1020,
    head: "hood", headCol: 0xf2eef0, headTrim: 0xc9c0c6,
    torso: "robe", torsoCol: 0xf0ecee, trim: 0x9b1b1b, corset: 0xd8d0d6, sash: 0x8e1020,
    legs: "dress", legCol: 0xe8e2e6, boots: 0xe9e1e4, bootStyle: "bare",
    sleeve: 0xeae6e8, arms: "cloth", weapon: "none", fx: 0xff2d2d,
  },
  necromancer: {
    skin: 0xd2cbb4, skull: true, bones: true, eyeGlow: 0x7dff6a, head: "horned", headCol: 0x2a1838, headTrim: 0xd8d2bf,
    torso: "robe", torsoCol: 0x24152e, trim: 0x8e1b2e, sash: 0x8e1b2e,
    legs: "robe", legCol: 0x1b1024, boots: 0x9a988a, bootStyle: "shoe",
    sleeve: 0x24152e, arms: "cloth", weapon: "staff", orb: 0x7dff6a, fx: 0x7dff6a, back: "cape", capeCol: 0x16091c,
  },
};

/** Undyed linen braies: what every hero wears under the class kit. */
export const LINEN = 0xe2dccb;

/** A hero's own body (skin, hair, build) in nothing but linen underwear; the class look comes from KITS. */
function bare(b: Partial<Look> & { skin: number; weaponKind: WeaponKind; fx: number }): Look {
  return {
    head: "none", torso: "bare", torsoCol: b.skin, legs: "bare", legCol: LINEN, boots: b.skin, bootStyle: "bare",
    sleeve: b.skin, arms: "bare", weapon: "none", ...b,
  };
}

export const HERO_BODIES: Record<string, Look> = {
  knight: bare({ skin: 0xe8b48a, hair: 0x6b4a2e, hairStyle: "short", beard: 0x6b4a2e, beardStyle: "stubble", build: 1.08, weaponKind: "sword", fx: 0xfff1c4 }),
  ninja: bare({ skin: 0xe2ad7f, eye: 0x111111, hair: 0x1c1a22, hairStyle: "short", weaponKind: "katana", fx: 0xbfd7ff }),
  wizard: bare({ skin: 0xecc39c, hair: 0xe9e7ef, hairStyle: "long", beard: 0xeeeef4, beardStyle: "long", weaponKind: "staff", orb: 0x5ee6ff, fx: 0xc8fbff }),
  archer: bare({ skin: 0xe8b07e, hair: 0xb8662a, hairStyle: "ponytail", weaponKind: "bow", fx: 0xe8f7c8 }),
  barbarian: bare({ skin: 0xd99a6a, hair: 0xc8631f, hairStyle: "long", beard: 0xc8631f, beardStyle: "full", build: 1.12, weaponKind: "axe", fx: 0xffe0c0 }),
  // pale as ash, black hair swept back, red eyes; slim
  vampire: bare({ skin: 0xd6c3bd, eye: 0xc0182a, hair: 0x15111a, hairStyle: "short", build: 0.97, weaponKind: "sword", fx: 0xff5a6a }),
  // the elemental occultist (look C, picked 2026-11-07): ash-pale hair, violet eyes
  summoner: bare({ skin: 0xe8c4a2, eye: 0xb68cff, hair: 0xd8d0c0, hairStyle: "long", weaponKind: "witchstaff", orb: 0xb68cff, fx: 0xd8c4ff }),
};

/**
 * Class starting kits (shared/gear.ts starterKit, item id `${hero}_${slot}`): the Look fields each item puts on the bare body.
 * The gear generator renders every item alone on the bare body and keeps the changed pixels as an overlay sheet.
 */
export const KITS: Record<string, Partial<Record<"weapon" | "shield" | "armour" | "hat" | "shoes", Partial<Look>>>> = {
  knight: {
    hat: { head: "greathelm", headCol: 0xb9c2cc, plume: 0xc0262f, headTrim: 0xd9a93a },
    armour: {
      torso: "plate", torsoCol: 0xaeb8c4, trim: 0xd9a93a, tabard: { col: 0x24468f, trim: 0xd9a93a, emblem: 0xf0c75a },
      legs: "mail", legCol: 0x7d8792, sleeve: 0xaeb8c4, arms: "plate", glove: 0x6f7883, belt: 0x4a2f1c, buckle: 0xd9a93a,
      back: "cape", capeCol: 0x8c1d24,
    },
    shoes: { boots: 0x9aa4ae, bootStyle: "greave" },
    weapon: { weapon: "sword" },
    shield: { shield: { col: 0x24468f, trim: 0xd9a93a, emblem: 0xf0c75a, style: "kite" } },
  },
  ninja: {
    hat: { head: "ninjahood", headCol: 0x23253a, headTrim: 0xc21f32 },
    armour: { torso: "wrap", torsoCol: 0x2b2e48, sash: 0x8a2230, legs: "wrapped", legCol: 0x2b2e48, sleeve: 0x2b2e48, arms: "wrap", glove: 0xbfc4cf, back: "cape", capeCol: 0x1b1c2e },
    shoes: { boots: 0x16172a, bootStyle: "wrap" },
    weapon: { weapon: "katana" },
  },
  wizard: {
    hat: { head: "wizardhat", headCol: 0x4b2a8c, headTrim: 0xe0b440 },
    armour: { torso: "robe", torsoCol: 0x5b33a3, trim: 0xe0b440, sash: 0x2e1d55, legs: "robe", legCol: 0x5b33a3, sleeve: 0x5b33a3, arms: "cloth" },
    shoes: { boots: 0x4a2e1c, bootStyle: "shoe" },
    weapon: { weapon: "staff" },
  },
  archer: {
    hat: { head: "hood", headCol: 0x355f2e, headTrim: 0x24421f },
    armour: {
      torso: "jerkin", torsoCol: 0x6e4526, trim: 0x4f7f3a, belt: 0x3e2715, buckle: 0xc9a050,
      legs: "trousers", legCol: 0x5c4129, sleeve: 0x4a7a38, arms: "cloth", bracer: 0x6e4526, glove: 0x5a3a22,
    },
    shoes: { boots: 0x3a2717, bootStyle: "leather" },
    weapon: { weapon: "bow", back: "quiver", capeCol: 0x2f5a2a },
  },
  barbarian: {
    hat: { head: "horned", headCol: 0x7d8792, headTrim: 0xeadfc6 },
    armour: { harness: true, belt: 0x3a2414, buckle: 0xb8b8b8, legs: "fur", legCol: 0x6a4527, bracer: 0x4a3020, back: "pelt", capeCol: 0x8a6a48 },
    shoes: { boots: 0x45301e, bootStyle: "leather" },
    weapon: { weapon: "axe" },
  },
  // the elemental occultist: bone-white robe in gold, a gold crown set with a violet stone, a mask, a staff with a little witch-fire
  summoner: {
    hat: { head: "crown", headCol: 0xc9a050, headTrim: 0xb68cff, mask: 0x2a2236 },
    armour: {
      torso: "robe", torsoCol: 0xe6e0d0, trim: 0xc9a050, sash: 0x5a3a8a, belt: 0x3a2a4a, buckle: 0xc9a050,
      legs: "robe", legCol: 0xd6cfbf, sleeve: 0xe6e0d0, arms: "cloth", glove: 0x3a2a4a,
    },
    shoes: { boots: 0x3a2a4a, bootStyle: "shoe" },
    weapon: { weapon: "witchstaff", palmFlame: 0x7ad7ff },
  },
  // a noble of the night: dark wine coat with old-gold trim, black cape with a tall blood-red collar, iron circlet, thin blade
  vampire: {
    hat: { head: "crown", headCol: 0x55515c, headTrim: 0xc0182a },
    armour: {
      torso: "jerkin", torsoCol: 0x3a1422, trim: 0xb08a3a, belt: 0x1a1014, buckle: 0xb08a3a,
      legs: "trousers", legCol: 0x1c1820, sleeve: 0x3a1422, arms: "cloth", glove: 0x141016,
      back: "cape", capeCol: 0x17101a, collar: 0x8e0f22,
    },
    shoes: { boots: 0x1a1216, bootStyle: "leather" },
    weapon: { weapon: "sword" },
  },
};

/** A hero wearing its whole starting kit (the old all-in-one class look). */
export function dressed(hero: string): Look {
  return Object.assign({}, HERO_BODIES[hero], ...Object.values(KITS[hero] ?? {}));
}

export const LOOKS: Record<string, Look> = {
  ...HERO_BODIES,
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
  // The gate watch: a dented kettle helm, rusted mail over a padded coat, a faded oxblood tabard, spear and battered round shield
  watchman: {
    skin: 0xd9a47c, hair: 0x3a2a20, hairStyle: "short", beard: 0x3a2a20, beardStyle: "stubble",
    head: "helm", headCol: 0x7a7f84, headTrim: 0x4f5357,
    torso: "mail", torsoCol: 0x6c7176, tabard: { col: 0x5a1c1c, trim: 0x8a6a34, emblem: 0xa88a48 }, belt: 0x3a2618, buckle: 0x8a7a5a,
    legs: "trousers", legCol: 0x4a3a2a, boots: 0x2a2420, bootStyle: "leather",
    sleeve: 0x6a5a44, arms: "cloth", glove: 0x3e2a1a, bracer: 0x4a3424,
    weapon: "spear", fx: 0xffffff, back: "cape", capeCol: 0x3a3028, build: 1.05,
    shield: { col: 0x5a4028, trim: 0x6a6e72, emblem: 0x5a1c1c, style: "round" },
  },
  // Townsfolk of the ruined village: worn, muddy, earthy cloth
  peasant: {
    skin: 0xd8a27a, hair: 0x6a4a2a, hairStyle: "short", beard: 0x6a4a2a, beardStyle: "full",
    head: "cap", headCol: 0x5a4a34, headTrim: 0x3e3224,
    torso: "jerkin", torsoCol: 0x6a5a3e, trim: 0x4a3e2a, belt: 0x3a2818, buckle: 0x7a6a4a,
    legs: "trousers", legCol: 0x4e4436, boots: 0x3a2a1e, bootStyle: "leather",
    sleeve: 0x7a6a50, arms: "cloth", weapon: "none", fx: 0xffffff,
  },
  farmwife: {
    skin: 0xe6b48c, hair: 0xa8642e, hairStyle: "long",
    head: "bandana", headCol: 0x8a7a5c, headTrim: 0x6a5a40,
    torso: "shirt", torsoCol: 0x7a5a48, apron: 0xb8aa8a, belt: 0x4a3420,
    legs: "dress", legCol: 0x5a4a3a, boots: 0x3a2a1e, bootStyle: "shoe",
    sleeve: 0x8a6a52, arms: "cloth", weapon: "none", fx: 0xffffff,
  },
  labourer: {
    skin: 0xc8906a, hairStyle: "bald", hair: 0x3a2a1e, beard: 0x3a2a1e, beardStyle: "stubble",
    head: "none", torso: "shirt", torsoCol: 0x9a8a6a, vest: 0x4a3a2a, belt: 0x2e2014, buckle: 0x6a5a40,
    legs: "trousers", legCol: 0x3e3a34, boots: 0x2a2018, bootStyle: "leather",
    sleeve: 0xc8906a, arms: "bare", bracer: 0x4a3424, weapon: "none", fx: 0xffffff, build: 1.1,
  },
  elder: {
    skin: 0xd8a888, hair: 0xb8b2a4, hairStyle: "short", beard: 0xc8c2b4, beardStyle: "long",
    head: "hood", headCol: 0x4a4038, headTrim: 0x342c26,
    torso: "robe", torsoCol: 0x5a4e40, trim: 0x3e342a, sash: 0x6a4a2a,
    legs: "robe", legCol: 0x4e4438, boots: 0x3a2a1e, bootStyle: "shoe",
    sleeve: 0x4e4438, arms: "cloth", weapon: "none", fx: 0xffffff, back: "cape", capeCol: 0x3a322a,
  },
  goodwife: {
    skin: 0xe8b890, hair: 0x4a3020, hairStyle: "long",
    head: "hood", headCol: 0x5a3a3a, headTrim: 0x402828,
    torso: "shirt", torsoCol: 0x6a4a4a, apron: 0x9a8e74, belt: 0x3a2818,
    legs: "dress", legCol: 0x4a3434, boots: 0x2e2218, bootStyle: "shoe",
    sleeve: 0x5a3e3e, arms: "cloth", weapon: "none", fx: 0xffffff, back: "cape", capeCol: 0x3e2c2c,
  },
  druid: {
    skin: 0xe2ad84, hair: 0xe6e1d4, hairStyle: "long", beard: 0xf0ece2, beardStyle: "long",
    head: "hood", headCol: 0x4a6430, headTrim: 0x7d6036,
    torso: "robe", torsoCol: 0x56743a, trim: 0x8a6a3a, sash: 0xa88446,
    legs: "robe", legCol: 0x4a6430, boots: 0x4a3420, bootStyle: "shoe",
    sleeve: 0x4a6430, arms: "cloth",
    weapon: "druidstaff", orb: 0x9be564, fx: 0x9be564, back: "cape", capeCol: 0x3c5226,
  },
  // Morwen: a young witch in a red dress, black corset bodice, bare arms and a tall black hat with a red band
  witch: {
    skin: 0xf0c8a8, hair: 0x1c1216, hairStyle: "long", eye: 0xd4a017, lips: 0xa01c2a,
    head: "witch", headCol: 0x1e181e, headTrim: 0xb02a2e,
    torso: "shirt", torsoCol: 0xb02a2e, corset: 0x1e1418,
    legs: "dress", legCol: 0x9a1e24, trim: 0x3a0a10, boots: 0x1a1214, bootStyle: "shoe",
    sleeve: 0xf0c8a8, arms: "bare", bracer: 0x1e1418,
    weapon: "none", fx: 0xff6a3a, palmFlame: 0xff6a3a,
  },
};
