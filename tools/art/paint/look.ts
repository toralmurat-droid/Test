/** How each painted character looks: materials, colours and kit. Poses and animation timing come from characters.ts. */
export type HeadGear = "crown" | "greathelm" | "ninjahood" | "wizardhat" | "hood" | "horned" | "cap" | "helm" | "kettle" | "bandana" | "wide" | "witch" | "stonecrown" | "none";
export type TorsoKind = "plate" | "wrap" | "robe" | "jerkin" | "bare" | "shirt" | "mail" | "leather" | "tailcoat";
export type LegKind = "trousers" | "mail" | "wrapped" | "robe" | "fur" | "dress" | "bare";
export type WeaponKind = "katana" | "sword" | "staff" | "wand" | "bow" | "axe" | "hammer" | "pick" | "spear" | "dagger" | "druidstaff" | "witchstaff" | "boneblade" | "spade" | "lute" | "mace" | "none";

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
  shield?: { col: number; trim: number; emblem: number; style: "kite" | "round" | "book" | "tower"; /** style "book": the id in paint/books.ts BOOKS */ book?: string };
  back?: "cape" | "quiver" | "pelt"; capeCol?: number; capeShort?: boolean;
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
  /** Tailcoat (torso "tailcoat", the Summoner): lapels and piping in `trim`, the waistcoat under it in `vest`, buttons in `buckle`. */
  /** A long scarf wound round the neck, its two ends floating (stirring at rest, streaming at a walk and a run). */
  scarf?: { col: number; band?: number };
  weaponKind?: WeaponKind; // what found weapons look like in this hero's hands (heroes start with weapon "none")
  /** Bone Demon (DEMON.harvest): skeleton pieces it wears, painted onto the body: 1 pauldrons, 2 rib cuirass, 3 bone blade, 4 skull crown. */
  boneArmour?: number;
  /** Act 3 (Grey Barrow Moors): a bronze neck-ring, a permanent stoop (px the body sinks), a hanging lantern on the staff (its light), cold mist round the feet, a notched blade, blade metal colour, a gold funeral mask. */
  torc?: number; stoop?: number; lantern?: number; mist?: number; notched?: boolean; bladeCol?: number; faceMask?: number; reeds?: number; /** A woven basket of herbs in the near hand (colour of the weave). */ basket?: number;
  /** Sword length/width multiplier (the Hollow King's greatsword). */
  bladeLen?: number;
  /** Beast-folk of the Mawdeep (shared/dungeon.ts): the animal head whose hide this man or woman was sewn into. */
  beast?: BeastHead;
  /** The other half of the beast-folk: a man's face, the animal's head flayed back as a hood (the rest is beast). */
  beastHood?: boolean;
  /** What the rite grew on their backs: a naked tail, spider legs, wings that beat. */
  /** Act 5 (Mawdeep Sinkholes, the Hide-Kin): a porcupine's back of quills (colour of the dark bands), big digging claws on the hands (claw colour), bone and charm fetishes hanging from the belt (cord colour). */
  quills?: number; claws?: number; fetishes?: number;
  tail?: number; spiderLegs?: number; wings?: { col: number; kind: "bat" | "feather"; rest?: boolean; tip?: number };
}
export type BeastHead = "rat" | "boar" | "spider" | "bat" | "wolf" | "bull" | "bear" | "crow" | "camel" | "lion" | "mole" | "hyena" | "stag" | "quill";

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
  sphinx: { // a sphinx warrior, old guardian of Kharsun's tombs: a lion's head under a striped gold-and-lapis royal headcloth,
    // golden wings half-folded on its back, a bronze-scaled chest, a linen kilt-panel, a gilded khopesh and a lapis shield
    skin: 0xc8923a, beast: "lion", hairStyle: "none", head: "none", eyeGlow: 0x6ae8ff,
    torso: "plate", torsoCol: 0x8a6a2e, trim: 0x2a4a9a, tabard: { col: 0xd6c8a6, trim: 0x2a4a9a, emblem: 0xe0b040 },
    belt: 0x2a4a9a, buckle: 0xf0c850, legs: "fur", legCol: 0xb8843a, boots: 0x7a4e24, bootStyle: "bare",
    sleeve: 0xc8923a, arms: "bare", bracer: 0xe0b040, weapon: "sword", bladeLen: 1.1, fx: 0xffe8a0,
    shield: { col: 0x24418a, trim: 0xe0b040, emblem: 0xf0c850, style: "round" },
    wings: { col: 0xead08a, kind: "feather", rest: true, tip: 0x2a4a9a }, tail: 0xb8843a, build: 1.3,
  },
  // ---- Act 3, the Grey Barrow Moors: the Ossuary Host's homeland (shared/moors.ts). Cold blue-white light, tarnished bronze, bog green.
  // The Barrow-Wight: a gaunt grey-blue corpse in rotted grave-wrappings, a tarnished bronze torc, pale cold eyes, a notched bronze sword
  wight: {
    skin: 0x8aa0ae, hair: 0x5a636c, hairStyle: "long", eyeGlow: 0xa6e8ff, head: "none",
    torso: "wrap", torsoCol: 0x6e6652, trim: 0x4a4434, belt: 0x30281c, buckle: 0x9a7a3c, torc: 0xa07a3a,
    legs: "wrapped", legCol: 0x5c5644, boots: 0x4a4436, bootStyle: "wrap",
    sleeve: 0x6e6652, arms: "wrap", rags: 0x9a9680, bracer: 0x8a6a34, glove: 0x62705c, weapon: "sword", bladeCol: 0xa08240, notched: true, fx: 0xa6e8ff,
    back: "cape", capeCol: 0x3e4a4c, capeShort: true, build: 0.96,
  },
  // The Bog Hag: stooped in a dripping moss-and-peat shawl, reeds and sundew in her hair, a crooked bog-oak staff with a swinging lantern
  boghag: {
    skin: 0x8c9a6a, hair: 0x424230, hairStyle: "long", eye: 0xc8ff6a, eyeGlow: 0x9dff5a, head: "none", reeds: 0xdccb80,
    torso: "robe", torsoCol: 0x3a3424, trim: 0x5a6a34, vest: 0x58742e, sash: 0x4a3e2a, belt: 0x2a2418,
    legs: "robe", legCol: 0x2e2a1e, boots: 0x2a2418, bootStyle: "wrap",
    sleeve: 0x3a3424, arms: "cloth", glove: 0x6e7e4c, bracer: 0x4a5a2c, weapon: "witchstaff", orb: 0x9dff5a, lantern: 0xc8ff7a, fx: 0x9dff5a,
    back: "pelt", capeCol: 0x62803a, stoop: 1.7,
  },
  // The Host Legionary: a skeleton soldier in rusted bronze scale under a crested helm, a tall tower shield with the Host's bone sigil
  legionary: {
    skin: 0xd6ceb4, skull: true, bones: true, eyeGlow: 0x8fe8c8, head: "helm", headCol: 0x7a5c30, headTrim: 0x4f7d6a, plume: 0x2a3a34, rags: 0x1f2422,
    torso: "mail", torsoCol: 0x806238, trim: 0x4f7d6a, tabard: { col: 0x1f2422, trim: 0x4f7d6a, emblem: 0xd8cfb2 }, belt: 0x2a2418, buckle: 0x9a7a3c,
    legs: "trousers", legCol: 0xd6ceb4, boots: 0x2a3a34, bootStyle: "wrap",
    sleeve: 0xd6ceb4, arms: "bare", bracer: 0x806238, weapon: "spear", bladeCol: 0x8a6a34, fx: 0x8fe8c8, build: 1.18,
    shield: { col: 0x1f2422, trim: 0x7a5c30, emblem: 0xd8cfb2, style: "tower" },
  },
  // The Cairn-Lord: a tall armoured barrow-noble in corroded bronze plate, a mantle of cairn-stone, a crown of standing-stone shards, a great bronze blade
  cairnlord: {
    skin: 0xcfc8b0, skull: true, eyeGlow: 0x8fe8ff, head: "stonecrown", headCol: 0x8c8c84, headTrim: 0x8a6a30,
    torso: "plate", torsoCol: 0x6c7452, trim: 0x8a6a30, belt: 0x2a2418, buckle: 0xa07a3a,
    legs: "mail", legCol: 0x5a5c44, boots: 0x4a5044, bootStyle: "greave",
    sleeve: 0x6c7452, arms: "plate", glove: 0x3a3e34, weapon: "sword", bladeLen: 1.6, bladeCol: 0x8a8048, notched: true, fx: 0x8fe8ff,
    back: "pelt", capeCol: 0x74766e, build: 1.38,
  },
  // The Barrow-King: a gold-leaf funeral mask on blackened bronze plate, a long torn purple-grey burial cloak, a barrow-key mace, cold mist pouring off him
  barrowking: {
    skin: 0x62727e, hairStyle: "none", faceMask: 0xdcb458, eyeGlow: 0xa6e8ff, head: "hood", headCol: 0x2c2824, headTrim: 0xdcb458,
    torso: "plate", torsoCol: 0x4a4440, trim: 0xdcb458, tabard: { col: 0x3e2c4e, trim: 0x8a7a50, emblem: 0xdcb458 }, belt: 0x201c18, buckle: 0xdcb458,
    legs: "mail", legCol: 0x2c2a28, boots: 0x2a2826, bootStyle: "greave",
    sleeve: 0x34302c, arms: "plate", glove: 0x222024, weapon: "mace", bladeCol: 0x3c362e, fx: 0xa6e8ff, bladeLen: 1.15,
    back: "cape", capeCol: 0x4a3e5c, build: 1.4, mist: 0xb4d8ee,
  },
  // ---- Act 4, the Red Badlands: the Redfang bandits' homeland (shared/badlands.ts). Red dust, rust, oxblood scarves, sun-bleached leather.
  // The Redfang Outrider: a lean raider in a dust-red headwrap and face-cloth, a long streaming scarf, light leather, a curved sabre
  outrider: {
    skin: 0xc48a5e, hair: 0x2a1c16, hairStyle: "short", mask: 0x9e231a, eye: 0x1a1008,
    head: "hood", headCol: 0x8a3a24, headTrim: 0x5a2014,
    torso: "leather", torsoCol: 0x6a4a34, trim: 0x3a2418, sash: 0xa3231b, belt: 0x2b1d14, buckle: 0xc9a050,
    legs: "trousers", legCol: 0x5a4636, boots: 0x2a1c14, bootStyle: "wrap",
    sleeve: 0x7a4a30, arms: "cloth", bracer: 0x3a2418, glove: 0x2b1d14, weapon: "sword", bladeCol: 0xc8c0b0, fx: 0xff9a70,
    scarf: { col: 0xa3231b, band: 0x5a1410 }, back: "cape", capeCol: 0x7a3420, capeShort: true, build: 0.96,
  },
  // The Redfang Crossbowman: a heavy sun-bleached coat under a rusty kettle helm, a bolt-quiver at the hip, a crossbow braced to the shoulder
  crossbowman: {
    skin: 0xcf9468, hair: 0x4a3020, hairStyle: "short", beard: 0x4a3020, beardStyle: "stubble", mask: 0x9e231a,
    head: "kettle", headCol: 0x7a4a34, headTrim: 0x4a2a1c,
    torso: "mail", torsoCol: 0x7a6a5a, trim: 0x3a2418, tabard: { col: 0x8e1f1a, trim: 0x3a1410, emblem: 0x3a1410 }, belt: 0x2b1d14, buckle: 0x9a8a6a,
    legs: "trousers", legCol: 0x4a3a2c, boots: 0x231a14, bootStyle: "leather",
    sleeve: 0x6a4a34, arms: "cloth", bracer: 0x3a2a1e, glove: 0x2b1d14, weapon: "bow", fx: 0xffd0a0, back: "quiver", capeCol: 0x4a2a1c, build: 1.1,
  },
  // The Firebrand: a wild fire-thrower swaddled in layers of red scarves, a soot-black face-cloth, scorched leather, a pot of fire cupped in the open hand
  firebrand: {
    skin: 0xb27a52, hair: 0x1a1210, hairStyle: "none", mask: 0x241410, eye: 0xffa030, eyeGlow: 0xffa030,
    head: "hood", headCol: 0xb02a1c, headTrim: 0xe85a1a,
    torso: "wrap", torsoCol: 0xa3231b, trim: 0xe0701c, sash: 0xe85a1a, belt: 0x2a1810, buckle: 0xc9a050,
    legs: "wrapped", legCol: 0x5a2a1c, boots: 0x2a1a12, bootStyle: "wrap",
    sleeve: 0x8e1f1a, arms: "wrap", glove: 0x2a1a12, bracer: 0x3a2418, weapon: "none", palmFlame: 0xff7a22, fx: 0xff7a22,
    scarf: { col: 0xd8401c, band: 0x7a1a10 }, back: "cape", capeCol: 0x7a1a14, capeShort: true,
  },
  // The Redfang Captain: a brute in blackened plate under an oxblood tabard, a red-crested helm, a great war-axe, a fur-trimmed cloak
  redcaptain: {
    skin: 0xb98056, hair: 0x2a201a, hairStyle: "short", beard: 0x2a201a, beardStyle: "full", eye: 0x1a1008,
    head: "helm", headCol: 0x5a4a44, headTrim: 0x8e1f1a, plume: 0xa3231b,
    torso: "plate", torsoCol: 0x5a4a44, trim: 0x8e1f1a, tabard: { col: 0x8e1f1a, trim: 0x2a1410, emblem: 0xe0b060 }, belt: 0x2b1d14, buckle: 0xc9a050,
    legs: "mail", legCol: 0x4a3a30, boots: 0x231a14, bootStyle: "greave",
    sleeve: 0x5a4a44, arms: "plate", glove: 0x2b1d14, bracer: 0x3a2a1e, weapon: "axe", bladeCol: 0xb0a89a, fx: 0xff8a70,
    back: "cape", capeCol: 0x6a1814, build: 1.3,
  },
  // Old Rourke, the Redfang warlord: a grey-bearded old giant of a man in dented black plate, a ragged blood-red cloak over a bear pelt, a huge notched war-axe
  rourke: {
    skin: 0xb07a56, hair: 0xb8b2a8, hairStyle: "long", beard: 0xc4beb0, beardStyle: "long", eye: 0xe8c060, eyeGlow: 0xff5030,
    head: "horned", headCol: 0x3e3a38, headTrim: 0xd0c8b0,
    torso: "plate", torsoCol: 0x46403c, trim: 0xa3231b, tabard: { col: 0x7e1814, trim: 0x2a1410, emblem: 0xd8a040 }, belt: 0x241812, buckle: 0xd0aa4e,
    legs: "mail", legCol: 0x3a342e, boots: 0x1e1814, bootStyle: "greave",
    sleeve: 0x4e4844, arms: "plate", glove: 0x241812, bracer: 0x8e1f1a, weapon: "axe", bladeLen: 1.35, bladeCol: 0x9a948a, notched: true, fx: 0xff5030,
    back: "pelt", capeCol: 0x6a1410, build: 1.45,
  },
  // Rustwater Post: Marshal Hesk Varro (a weathered ex-watch marshal in a rust-red coat and a dented helm, a spear), Corra Flint (the armourer), Old Sal (the healer)
  rustmarshal: {
    skin: 0xc48c62, hair: 0x6a5a4a, hairStyle: "short", beard: 0x7a6e60, beardStyle: "stubble", eye: 0x3a2a1a,
    head: "helm", headCol: 0x8a7a6a, headTrim: 0x5a3a28,
    torso: "mail", torsoCol: 0x8a7a6a, trim: 0x4a3020, tabard: { col: 0x8a3a24, trim: 0xd9a93a, emblem: 0xf0c75a }, belt: 0x3a2a1c, buckle: 0xd9a93a,
    legs: "trousers", legCol: 0x4a3828, boots: 0x2a2018, bootStyle: "leather",
    sleeve: 0x7a6a5a, arms: "cloth", glove: 0x4a3020, weapon: "spear", fx: 0xffffff, back: "cape", capeCol: 0x6a3a28, capeShort: true, build: 1.08,
  },
  rustarmourer: {
    skin: 0xa86e4a, hair: 0x2a1a14, hairStyle: "ponytail", eye: 0x2a1a10,
    head: "bandana", headCol: 0xb02a1c, headTrim: 0x5a1a12,
    torso: "shirt", torsoCol: 0xc8b090, apron: 0x4a2c1c, belt: 0x2a1c12, buckle: 0x9a7a3a,
    legs: "trousers", legCol: 0x5a463a, boots: 0x2a1c14, bootStyle: "leather",
    sleeve: 0xa86e4a, arms: "bare", bracer: 0x4a2c1c, glove: 0x2a1c12, weapon: "hammer", fx: 0xffffff, build: 1.12,
  },
  rusthealer: {
    skin: 0xb88a64, hair: 0xd8d2c8, hairStyle: "long", eye: 0x3a2a1a,
    head: "hood", headCol: 0xc8ae8a, headTrim: 0x8a5a3a,
    torso: "robe", torsoCol: 0xa8683e, trim: 0xe0c090, vest: 0x7a3a24, apron: 0xe4d8bc, sash: 0xa3231b, belt: 0x4a3020,
    legs: "dress", legCol: 0x6a3a28, boots: 0x3a281c, bootStyle: "shoe",
    sleeve: 0xa8683e, arms: "cloth", glove: 0xb88a64, weapon: "none", fx: 0xffffff, back: "cape", capeCol: 0xb88a58, capeShort: true, basket: 0x8a6a3a, build: 0.92,
  },
  // ---- Act 5, the Mawdeep Sinkholes: the Hide-Kin, the Warrens' beast-folk gone feral in the pits. Damp earth, hide, bone, moss.
  delver: { // mole: a stooped, blind-eyed digger with a pink star-nose, great spade-claws, a moss-stained hide
    skin: 0x6a5a4c, beast: "mole", hairStyle: "none", head: "none", eyeGlow: 0xd8c090,
    torso: "bare", torsoCol: 0x54483e, belt: 0x2e2218, harness: true, legs: "fur", legCol: 0x463c32, boots: 0x3a3028, bootStyle: "bare",
    sleeve: 0x54483e, arms: "bare", glove: 0x54483e, bracer: 0x3a3a26, weapon: "none", fx: 0xd8d0b8, claws: 0xe2d8bc, stoop: 1.2, build: 1.18, tail: 0xc09a8a,
  },
  cackler: { // hyena: hunched, spotted tan hide, a ragged dark mane, a wide bared grin, a bone-handled hooked knife
    skin: 0x9a7a4a, beast: "hyena", hairStyle: "none", head: "none", eyeGlow: 0xffc03a,
    torso: "leather", torsoCol: 0x8a6a40, trim: 0x3a2a1a, belt: 0x2e2218, buckle: 0xe2d8bc, legs: "fur", legCol: 0x7a5a38, boots: 0x3a2a1c, bootStyle: "wrap",
    sleeve: 0x9a7a4a, arms: "bare", bracer: 0x3a2a1a, glove: 0x3a2a1a, weapon: "dagger", fx: 0xffe0b0, back: "pelt", capeCol: 0x6a4a2a, stoop: 1.6, build: 1.0, tail: 0x7a5a38,
  },
  stagkin: { // stag: a tall, lean charger under a branching rack of antlers, a hide of damp brown, a bone-studded harness
    skin: 0x8a6a4c, beast: "stag", hairStyle: "none", head: "none", eyeGlow: 0xff8a3a,
    torso: "leather", torsoCol: 0x4a382a, trim: 0x2a1e16, belt: 0x2a1e16, buckle: 0xe2d8bc, harness: true, legs: "fur", legCol: 0x5a4430, boots: 0x2a1e16, bootStyle: "wrap",
    sleeve: 0x8a6a4c, arms: "bare", bracer: 0x4a382a, glove: 0x2a1e16, weapon: "spear", bladeCol: 0xe2d8bc, fx: 0xffd0a0, back: "pelt", capeCol: 0x5a4632, build: 1.2, tail: 0xd8c8a8,
  },
  quillback: { // porcupine: a squat thrower hunched under a fan of banded quills, a bandolier of spare ones
    skin: 0x7a6a58, beast: "quill", hairStyle: "none", head: "none", eyeGlow: 0xffe080,
    torso: "leather", torsoCol: 0x4a3c30, trim: 0x2a2018, belt: 0x2a2018, buckle: 0xe2d8bc, harness: true, legs: "fur", legCol: 0x3e3228, boots: 0x2a2018, bootStyle: "wrap",
    sleeve: 0x7a6a58, arms: "bare", bracer: 0x3a2e24, glove: 0x2a2018, weapon: "none", fx: 0xf0e8d0, quills: 0x2a2220, stoop: 0.8, build: 1.1,
  },
  stitcher: { // a Hide-Stitcher: a shaman in a patchwork robe of mismatched hides, a face-cloth, a long bone needle, fetishes on every cord
    skin: 0xa88a6e, hair: 0x2a2018, hairStyle: "long", mask: 0x6a5a40, eye: 0x1a1008, eyeGlow: 0xffa83a,
    head: "hood", headCol: 0x6a4e36, headTrim: 0xe2d8bc,
    torso: "robe", torsoCol: 0x5a4a38, trim: 0xe2d8bc, vest: 0x7a5a3a, sash: 0x6a2a1a, belt: 0x2a2018, buckle: 0xe2d8bc,
    legs: "robe", legCol: 0x4a3c2e, boots: 0x2a2018, bootStyle: "wrap",
    sleeve: 0x6a5a40, arms: "cloth", glove: 0x3a2e24, weapon: "spear", bladeCol: 0xe8dfc4, bladeLen: 1.1, fx: 0xe8dfc4, back: "pelt", capeCol: 0x4e4a30, fetishes: 0xd8cfb4, build: 0.98,
  },
  hidechief: { // the Hide-Chieftain: a bear's skin worn whole, the head a hood over a scarred man's face, a bone-bound maul
    skin: 0xa07a5e, hairStyle: "none", beard: 0x2a1e16, beardStyle: "full", beast: "bear", beastHood: true, head: "none", eye: 0xff8a2a,
    torso: "bare", torsoCol: 0x4a3626, belt: 0x241a14, buckle: 0xe2d8bc, harness: true, legs: "fur", legCol: 0x3e2e22, boots: 0x241a14, bootStyle: "wrap",
    sleeve: 0x4a3626, arms: "bare", bracer: 0x2e2218, glove: 0x241a14, weapon: "hammer", bladeCol: 0x8a8070, fx: 0xff9a70, back: "pelt", capeCol: 0x4a3626, fetishes: 0xe2d8bc, build: 1.5, notched: true,
  },
  mawfather: { // the Maw-Father: a vast old patriarch, mole-faced and bear-built, scarred and mossed, a crown of bone, a hide cloak
    skin: 0x6a5a4c, beast: "mole", hairStyle: "none", head: "none", eyeGlow: 0xffd080,
    torso: "bare", torsoCol: 0x54483e, trim: 0x3a3a26, belt: 0x241a14, buckle: 0xe2d8bc, harness: true, legs: "fur", legCol: 0x3e342a, boots: 0x2a2018, bootStyle: "bare",
    sleeve: 0x54483e, arms: "bare", bracer: 0x3a3a26, glove: 0x54483e, weapon: "hammer", bladeCol: 0x8a8070, fx: 0xffb070, back: "pelt", capeCol: 0x3e3226, claws: 0xe2d8bc, fetishes: 0xe2d8bc, stoop: 1.0, build: 1.6, tail: 0xc09a8a, notched: true,
  },
  // Ropewell, the lodge-town on the lip of the sinkholes: Lodge-Warden Brannoc Tull, Hesta Coil the armourer, Mother Fennick the herb-wife
  ropewarden: {
    skin: 0xb48862, hair: 0x4a3a2a, hairStyle: "short", beard: 0x5a4a38, beardStyle: "full", eye: 0x2a1c10,
    head: "hood", headCol: 0x5a4632, headTrim: 0xd8cdb0,
    torso: "leather", torsoCol: 0x5e4a36, trim: 0xd8cdb0, tabard: { col: 0x4a5a34, trim: 0x2a3418, emblem: 0xd8cdb0 }, belt: 0x2a1e14, buckle: 0xc9a050,
    legs: "trousers", legCol: 0x4a3c2c, boots: 0x2a1e14, bootStyle: "wrap",
    sleeve: 0x6a5238, arms: "cloth", bracer: 0x3a2a1c, glove: 0x2a1e14, weapon: "spear", fx: 0xffffff, back: "pelt", capeCol: 0x6a5a48, fetishes: 0xc8b890, build: 1.12,
  },
  ropearmourer: {
    skin: 0xc49a76, hair: 0x6a3a22, hairStyle: "ponytail", eye: 0x2a1a10,
    head: "bandana", headCol: 0x4a5a34, headTrim: 0x2a3418,
    torso: "shirt", torsoCol: 0xb8a888, apron: 0x4a3322, belt: 0x2a1e14, buckle: 0xc9a050,
    legs: "trousers", legCol: 0x4a4034, boots: 0x2a1e14, bootStyle: "leather",
    sleeve: 0xc49a76, arms: "bare", bracer: 0x4a3322, glove: 0x2a1e14, weapon: "hammer", fx: 0xffffff, fetishes: 0xb8a070, build: 1.1,
  },
  ropehealer: {
    skin: 0xbc9272, hair: 0xc8c4b8, hairStyle: "long", eye: 0x3a2a1a,
    head: "hood", headCol: 0x6a7a44, headTrim: 0xd8cc9c,
    torso: "robe", torsoCol: 0x5e6a3a, trim: 0xd8cc9c, vest: 0x7a5a38, apron: 0xe0d6b8, sash: 0x8a4a2a, belt: 0x4a3a24,
    legs: "dress", legCol: 0x4a5430, boots: 0x3a2c1c, bootStyle: "shoe",
    sleeve: 0x5e6a3a, arms: "cloth", glove: 0xbc9272, weapon: "none", fx: 0xffffff, back: "cape", capeCol: 0x4a5a30, capeShort: true, basket: 0x7a6a3a, build: 0.94,
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
  // Ishael, the Sunwright (Act 2's final boss): the High Veil of the Veiled Circle. A golden sun-crown, a gold veil over
  // her face, white and gold robes over the Circle's indigo, a saffron mantle and a tall staff crowned with a burning sun
  sunwright: {
    skin: 0xb07a50, hair: 0x1a1414, hairStyle: "long", mask: 0xc89a3a, eye: 0xfff0a0, eyeGlow: 0xffd060,
    head: "crown", headCol: 0xe0b040, headTrim: 0xfff0a0,
    torso: "robe", torsoCol: 0xf0e6d0, trim: 0xe0b040, sash: 0x3a2e6a, belt: 0x3a2e6a, buckle: 0xffd060,
    legs: "robe", legCol: 0xe8dcc0, boots: 0x8a6a30, bootStyle: "shoe",
    sleeve: 0x3a2e6a, arms: "cloth", glove: 0xe0b040, bracer: 0xe0b040,
    weapon: "staff", orb: 0xffb040, fx: 0xffd080, back: "cape", capeCol: 0xd88a20, build: 1.15,
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

/**
 * Champions (shared/champions.ts): a humanoid champion carries another weapon than its kin (Murat 2026-11-10: a
 * different weapon rather than a painted detail; the family's glowing aura stays). Sheets "mob_<kind>_champ".
 * Ranged kin (bow skeletons, archers, slingers) have none: their champions keep the plain sheet with the aura.
 */
export const CHAMP_WEAPONS: Record<string, Partial<Look>> = {
  skeleton: { weapon: "boneblade", eyeGlow: 0xb890ff }, // the necromancer's dead: a blade of fused bone (champion skeletons fight with it)
  skeletonmage: { weapon: "witchstaff", orb: 0xa070ff },
  bandit: { weapon: "sword" }, // a Redfang ringleader's sabre
  bandit_brute: { weapon: "hammer" },
  gnawkin: { weapon: "axe" },
  tuskborn: { weapon: "axe" },
  tuskborn_folk: { weapon: "hammer" },
  silkwretch: { weapon: "spear" },
  silkwretch_folk: { weapon: "spear" },
  duskwing: { weapon: "sword" },
  duskwing_folk: { weapon: "sword" },
  crowseer: { weapon: "witchstaff", orb: 0xff4a2a },
  nomad: { weapon: "katana" }, // a Dustrider's long curved blade
  sanddead: { weapon: "axe" }, // a bronze axe from Kharsun's tombs
  veiled: { weapon: "witchstaff", orb: 0xfff6c8 }, // the second sun's white fire
  camelfolk: { weapon: "hammer" }, // the brass maul they brand with
  sphinx: { weapon: "spear" }, // a tomb guardian's long spear
};
for (const [k, o] of Object.entries(CHAMP_WEAPONS)) Object.defineProperty(MOB_LOOKS, `${k}_champ`, { get: () => ({ ...MOB_LOOKS[k], ...o }), enumerable: false });

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
  // ash-pale hair, violet eyes (the body of look C, 2026-11-07; the Void Lord kit dresses it as a warlock)
  summoner: bare({ skin: 0xe8c4a2, eye: 0xb68cff, hair: 0xd8d0c0, hairStyle: "long", weaponKind: "witchstaff", orb: 0xb68cff, fx: 0xd8c4ff }),
  // the Songweaver (Oakvale minstrel): sun-freckled, curly chestnut hair, green eyes; the lute's sound is warm gold
  songweaver: bare({ skin: 0xeabf98, lips: 0xc4705e, eye: 0x2a7a56, hair: 0x5a3018, hairStyle: "short", weaponKind: "lute", fx: 0xffd27a }),
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
  // the Void Lord (Murat 2026-11-09, look A "anthracite et prune"): a bare-headed warlock in a charcoal tailcoat to
  // mid-thigh over a plum waistcoat, violet piping, a long violet scarf whose two ends float, a staff with a Void flame
  summoner: {
    hat: { scarf: { col: 0x5b2f8f, band: 0xc8a8ff } },
    armour: {
      torso: "tailcoat", torsoCol: 0x38323f, trim: 0x9a6cff, vest: 0x3c2c44, buckle: 0xb8b0c8,
      legs: "trousers", legCol: 0x16131b, sleeve: 0x38323f, arms: "cloth", glove: 0x1a1620,
    },
    shoes: { boots: 0x110f15, bootStyle: "leather" },
    weapon: { weapon: "witchstaff", palmFlame: 0xb68cff },
  },
  // the Songweaver: a travelling minstrel of Oakvale. Teal cap with a long red feather, an ochre doublet over cream
  // billowing sleeves, russet hose, a short rust-red cape and a lute (warm folk colours, apart from the three casters)
  songweaver: {
    hat: { head: "cap", headCol: 0x2e7d74, headTrim: 0xd9482f },
    armour: {
      torso: "jerkin", torsoCol: 0xd09a34, trim: 0x8a5a1c, vest: 0x2e7d74, belt: 0x5a3a22, buckle: 0xe8d070,
      legs: "trousers", legCol: 0x7a3b22, sleeve: 0xe8dcc0, arms: "cloth", glove: 0x8a5a2c, bracer: 0x8a5a2c,
      back: "cape", capeCol: 0xa8402a, capeShort: true,
    },
    shoes: { boots: 0x4e3220, bootStyle: "leather" },
    weapon: { weapon: "lute" },
    // the Songbook (item songweaver_shield): the book itself is drawn by paint/books.ts
    shield: { shield: { col: 0x8a5a2c, trim: 0xe8d070, emblem: 0xe8d070, style: "book", book: "songweaver_shield" } },
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
  // Kel Ashar, the desert village of Act 2 (shared/npcs.ts)
  // Sefa the Well-Keeper: an old woman in a pale headwrap and a well-blue robe, a brass ladle at her sash
  wellkeeper: {
    skin: 0xa8744c, hair: 0xd8d2c4, hairStyle: "long",
    head: "hood", headCol: 0xe2d6bc, headTrim: 0x3a6a8a,
    torso: "robe", torsoCol: 0x2e5a7a, trim: 0xd8c08a, sash: 0xc89a40,
    legs: "robe", legCol: 0x284e6a, boots: 0x6a4a2e, bootStyle: "shoe",
    sleeve: 0x2e5a7a, arms: "cloth", weapon: "none", fx: 0x9ad8ff, back: "cape", capeCol: 0xc8b896,
  },
  // Captain Rakhim of the Sand Watch: a white turban over a brass-capped helm, scale coat, a saffron sash and a long spear
  sandcaptain: {
    skin: 0x9a663e, hair: 0x1a1410, hairStyle: "short", beard: 0x1a1410, beardStyle: "full",
    head: "helm", headCol: 0xc8a050, headTrim: 0xece2c8,
    torso: "mail", torsoCol: 0xa88a52, tabard: { col: 0xd88a20, trim: 0xece2c8, emblem: 0xffd060 }, belt: 0x4a2e1a, buckle: 0xd8a840,
    legs: "trousers", legCol: 0xe2d6bc, boots: 0x5a3a22, bootStyle: "wrap",
    sleeve: 0xece2c8, arms: "cloth", glove: 0x4a2e1a, bracer: 0xa88a52,
    weapon: "spear", fx: 0xfff0d0, back: "cape", capeCol: 0xd88a20, build: 1.1,
    shield: { col: 0x8a5a2a, trim: 0xd8a840, emblem: 0xffd060, style: "round" },
  },
  // Zahra the spice trader: a saffron headscarf, a crimson vest over a cream blouse, a dark skirt and a bright sash
  spicetrader: {
    skin: 0xb07a50, hair: 0x1a1210, hairStyle: "long", eye: 0x3a2410, lips: 0x8a2a2a,
    head: "bandana", headCol: 0xe0a020, headTrim: 0xa8301e,
    torso: "shirt", torsoCol: 0xf0e2c4, vest: 0xa8301e, sash: 0xe0a020, belt: 0x5a3018,
    legs: "dress", legCol: 0x5a2a3a, trim: 0xe0a020, boots: 0x6a4028, bootStyle: "shoe",
    sleeve: 0xf0e2c4, arms: "cloth", bracer: 0xd8a840, weapon: "none", fx: 0xffd060,
  },
  // ---- The zone quest givers (Murat 2026-11-10, shared/npcs.ts): folk who live out in the zones ----
  // Huntmaster Bryn of the Hunter's Camp: a moss-green hood, a stained leather jerkin, a bow and a full quiver
  huntsman: {
    skin: 0xd8a27a, hair: 0x6a4424, hairStyle: "short", beard: 0x6a4424, beardStyle: "full",
    head: "hood", headCol: 0x3e5a2c, headTrim: 0x2a3e1e,
    torso: "leather", torsoCol: 0x5a4630, trim: 0x3a2c1e, belt: 0x2a1c10, buckle: 0x8a7a5a,
    legs: "trousers", legCol: 0x4a3a28, boots: 0x3a2a1a, bootStyle: "leather",
    sleeve: 0x4a3a28, arms: "cloth", glove: 0x2a1c10, bracer: 0x5a4630,
    weapon: "bow", fx: 0xffffff, back: "quiver", capeCol: 0x3e5a2c,
  },
  // Odo the miller of Millbrook: flour-white cap and apron, rolled sleeves, a big belly and a grey beard
  miller: {
    skin: 0xe8b890, hair: 0xb8b0a0, hairStyle: "short", beard: 0xc8c0b0, beardStyle: "full",
    head: "cap", headCol: 0xd8ccb0, headTrim: 0xb8aa88,
    torso: "shirt", torsoCol: 0xe0d6c0, apron: 0xc8bc9c, belt: 0x5a4028,
    legs: "trousers", legCol: 0x6a5a44, boots: 0x3a2a1e, bootStyle: "leather",
    sleeve: 0xe8b890, arms: "bare", weapon: "none", fx: 0xffffff, build: 1.15,
  },
  // Ylva the forester of Thornwood: red braid, green shirt under a leather vest, a woodsman's axe
  forester: {
    skin: 0xe0ae86, hair: 0xa8642e, hairStyle: "ponytail",
    head: "none",
    torso: "shirt", torsoCol: 0x5a6e3a, vest: 0x4a3420, belt: 0x6a4a28, buckle: 0x9a8a5a,
    legs: "trousers", legCol: 0x3e4a2a, boots: 0x3a2818, bootStyle: "wrap",
    sleeve: 0x5a6e3a, arms: "cloth", bracer: 0x4a3420,
    weapon: "axe", fx: 0xffffff, back: "cape", capeCol: 0x3a4a26,
  },
  // Nell the beachcomber of the Saltwind Coast: sea-blue headscarf, salt-stained shirt, a fishing spear
  beachcomber: {
    skin: 0xc8916a, hair: 0x2a2a2e, hairStyle: "long",
    head: "bandana", headCol: 0x2e5a6a, headTrim: 0x1e3e4a,
    torso: "shirt", torsoCol: 0xd8ccb0, vest: 0x3e4e58, belt: 0x6a4a2a,
    legs: "trousers", legCol: 0x5a6a72, boots: 0x4a3a2e, bootStyle: "wrap",
    sleeve: 0xd8ccb0, arms: "cloth", weapon: "spear", fx: 0xffffff,
  },
  // Dagna the prospector of the Stormbreak Crags: a dented iron helm, red beard, leather apron and a rock hammer
  prospector: {
    skin: 0xd8a27a, hair: 0x8a3a1a, hairStyle: "short", beard: 0x8a3a1a, beardStyle: "long",
    head: "helm", headCol: 0x6a6258, headTrim: 0x8a8070,
    torso: "shirt", torsoCol: 0x7a5a3a, apron: 0x5a4028, belt: 0x2e2014, buckle: 0x8a8070,
    legs: "trousers", legCol: 0x4a4038, boots: 0x2a2018, bootStyle: "leather",
    sleeve: 0x7a5a3a, arms: "cloth", glove: 0x3a2818, bracer: 0x4a3424,
    weapon: "hammer", fx: 0xffffff, build: 1.1,
  },
  // Hamid the caravan master: a wide sun hat, a crimson vest over a cream shirt, a gold sash and rings
  caravaneer: {
    skin: 0x9a663e, hair: 0x1a1410, hairStyle: "short", beard: 0x2a201a, beardStyle: "full",
    head: "wide", headCol: 0xc8a060, headTrim: 0x8a5a2a,
    torso: "shirt", torsoCol: 0xe8dcc0, vest: 0x8a3a2a, sash: 0xd8a840, belt: 0x5a3018,
    legs: "trousers", legCol: 0x5a4a3a, boots: 0x5a3a22, bootStyle: "wrap",
    sleeve: 0xe8dcc0, arms: "cloth", bracer: 0xd8a840, weapon: "none", fx: 0xffffff, build: 1.1,
  },
  // Old Tamsin, the hermit of the Red Wastes: a sun-faded hooded robe, a white beard to the belt and a walking staff
  hermit: {
    skin: 0x8a5a36, hair: 0xe0dcd0, hairStyle: "long", beard: 0xece8de, beardStyle: "long",
    head: "hood", headCol: 0x8a6a48, headTrim: 0x5a4430,
    torso: "robe", torsoCol: 0x7a5e40, trim: 0x5a4430, sash: 0x3a2818,
    legs: "robe", legCol: 0x6a5238, boots: 0x4a3420, bootStyle: "wrap",
    sleeve: 0x7a5e40, arms: "cloth", weapon: "staff", fx: 0xffffff, back: "cape", capeCol: 0x6a5238,
  },
  // Leyla, scout of the camel-clans: saffron headscarf, sand-coloured leathers, a short bow
  dunescout: {
    skin: 0xa8744c, hair: 0x1a1210, hairStyle: "ponytail",
    head: "bandana", headCol: 0xd89a30, headTrim: 0x8a4a1a,
    torso: "leather", torsoCol: 0xc8a870, trim: 0x8a6a3a, belt: 0x5a3018, buckle: 0xd8a840,
    legs: "trousers", legCol: 0xc8a870, boots: 0x6a4a2a, bootStyle: "wrap",
    sleeve: 0xe2d2a8, arms: "cloth", bracer: 0x8a6a3a,
    weapon: "bow", fx: 0xffffff, back: "quiver", capeCol: 0x8a6a3a,
  },
  // Nasrin, who walked out of the Veiled Circle: its indigo robe with the gold trim, but her veil torn off
  defector: {
    skin: 0xb07a50, hair: 0x1a1410, hairStyle: "long",
    head: "hood", headCol: 0x2e2a5e, headTrim: 0xd8a840,
    torso: "robe", torsoCol: 0x2e2a5e, trim: 0xd8a840, sash: 0xd8a840,
    legs: "robe", legCol: 0x26224e, boots: 0x3a2a1e, bootStyle: "shoe",
    sleeve: 0x26224e, arms: "cloth", weapon: "staff", orb: 0xffb040, fx: 0xffb040, back: "cape", capeCol: 0x1e1a40,
  },
  // Brother Aldric, the last lamplighter monk of the Lantern Crypt: a grey habit and hood, a rope belt, a lamp on his staff
  monk: {
    skin: 0xe0b08a, hair: 0x9a9690, hairStyle: "bald", beard: 0xb8b4ac, beardStyle: "full",
    head: "hood", headCol: 0x4a4038, headTrim: 0x2e2822,
    torso: "robe", torsoCol: 0x4a4038, trim: 0x2e2822, sash: 0x8a6a3a,
    legs: "robe", legCol: 0x3e362e, boots: 0x2a221c, bootStyle: "shoe",
    sleeve: 0x4a4038, arms: "cloth", weapon: "staff", orb: 0xffd070, fx: 0xffd070,
  },
  // Wren the lute-maker of Oakvale (shared/npcs.ts "lutemaker"): teal head-scarf, rolled linen sleeves, a sawdusty leather apron
  lutemaker: {
    skin: 0xe6b08a, hair: 0x7a3a22, hairStyle: "ponytail", eye: 0x2a6a4a,
    head: "bandana", headCol: 0x2e7d74, headTrim: 0xe8d070,
    torso: "shirt", torsoCol: 0xeadfc4, vest: 0x6a4a2a, apron: 0x7a5230, belt: 0x4a2e1a, buckle: 0xe8d070,
    legs: "trousers", legCol: 0x4a4a3a, boots: 0x3a2717, bootStyle: "leather",
    sleeve: 0xeadfc4, arms: "cloth", bracer: 0x6a4a2a, weapon: "none", fx: 0xffffff,
  },
  // Zahir the tomb-robber of Kharsun: a dust-brown headscarf, a patched vest, ropes and a long knife
  tombrobber: {
    skin: 0xa06a40, hair: 0x1a1410, hairStyle: "short", beard: 0x1a1410, beardStyle: "stubble",
    head: "bandana", headCol: 0x5a3a2a, headTrim: 0x2e1e14,
    torso: "shirt", torsoCol: 0x8a7656, vest: 0x3a2e24, belt: 0x2a1c12, buckle: 0xb08a4a, sash: 0x6a2a1e,
    legs: "trousers", legCol: 0x5a4a38, boots: 0x3a2a1a, bootStyle: "wrap",
    sleeve: 0x8a7656, arms: "cloth", glove: 0x3a2a1a, weapon: "dagger", fx: 0xffffff,
  },
  // Quest-concept NPCs (docs/quest-concepts-progress.md)
  // The sexton: a stooped old gravedigger in a mud-brown coat and a battered flat cap, a spade in hand
  sexton: {
    skin: 0xd0a07c, hair: 0xb4aea0, hairStyle: "short", beard: 0xc4beb0, beardStyle: "stubble",
    head: "cap", headCol: 0x3a3028, headTrim: 0x2a221c,
    torso: "jerkin", torsoCol: 0x4e4234, trim: 0x362c22, belt: 0x2a1c12, buckle: 0x7a6a4a,
    legs: "trousers", legCol: 0x3a3630, boots: 0x2a2018, bootStyle: "leather",
    sleeve: 0x5a4c3c, arms: "cloth", glove: 0x3a2a1a, weapon: "spade", fx: 0xffffff,
  },
  // Three mourners of the village, all in black but not alike: a hooded widow, an old man in a black wide hat, a young man with a white armband
  mourner1: {
    skin: 0xe8c0a0, hair: 0x2a2024, hairStyle: "long",
    head: "hood", headCol: 0x1c1a24, headTrim: 0x34303e,
    torso: "shirt", torsoCol: 0x24212c, apron: 0x2c2834, belt: 0x16141c,
    legs: "dress", legCol: 0x1e1c26, boots: 0x14121a, bootStyle: "shoe",
    sleeve: 0x24212c, arms: "cloth", weapon: "none", fx: 0xffffff, back: "cape", capeCol: 0x1a1822,
  },
  mourner2: {
    skin: 0xdcb08e, hair: 0xd0ccc4, hairStyle: "short", beard: 0xd4d0c8, beardStyle: "full",
    head: "wide", headCol: 0x1a1a1e, headTrim: 0x3a3a42,
    torso: "shirt", torsoCol: 0x2a2a30, vest: 0x1a1a20, belt: 0x141418, buckle: 0x8a8a92,
    legs: "trousers", legCol: 0x242428, boots: 0x121216, bootStyle: "leather",
    sleeve: 0x2a2a30, arms: "cloth", weapon: "none", fx: 0xffffff, build: 1.05,
  },
  mourner3: {
    skin: 0xecc4a2, hair: 0x6a3a22, hairStyle: "short",
    head: "none",
    torso: "jerkin", torsoCol: 0x3a3844, trim: 0x2a2833, belt: 0x1c1a22, buckle: 0x7a7a88, sash: 0xe8e4dc,
    legs: "trousers", legCol: 0x2c2a34, boots: 0x18161c, bootStyle: "leather",
    sleeve: 0x4a4854, arms: "cloth", bracer: 0xe8e4dc, weapon: "none", fx: 0xffffff,
  },
  // Ilka, a young Redfang cutpurse: the gang's red mask pulled down to a scarf, red bandana, a dagger
  ilka: {
    skin: 0xe2b490, hair: 0x7a2a18, hairStyle: "ponytail", eye: 0x3a5a2a,
    head: "bandana", headCol: 0x8e1f1a, headTrim: 0x5a1410, scarf: { col: 0xa3231b },
    torso: "jerkin", torsoCol: 0x5a4030, trim: 0x3a2a20, belt: 0x2b1d14, buckle: 0x9a8a6a,
    legs: "trousers", legCol: 0x3a3a3a, boots: 0x231a14, bootStyle: "leather",
    sleeve: 0x4a3a30, arms: "cloth", glove: 0x2b1d14, bracer: 0x8e1f1a, weapon: "dagger", fx: 0xffffff,
  },
  // Clan war W6, town stewards: one per clan, in the clan's cloth and trim (shared/war/clans.ts)
  steward_wardens: { // a grey-cloaked reeve with a tally staff, a forest-green tabard
    skin: 0xc49a76, hair: 0x8a8a84, hairStyle: "short", beard: 0x8a8a84, beardStyle: "full", eye: 0x2a2a20,
    head: "hood", headCol: 0x6a6e6c, headTrim: 0xd9822b,
    torso: "leather", torsoCol: 0x4a5238, trim: 0xd9822b, tabard: { col: 0x3b4a2c, trim: 0xd9822b, emblem: 0xf0b44a }, belt: 0x2a1e14, buckle: 0xf0b44a,
    legs: "trousers", legCol: 0x3a3e34, boots: 0x2a2018, bootStyle: "leather",
    sleeve: 0x5a5e54, arms: "cloth", glove: 0x2a1e14, weapon: "staff", fx: 0xffffff, back: "cape", capeCol: 0x6a6e6c, build: 1.08,
  },
  // W7 clan capitals: Hearthhold (Wardens). The Lord-Marshal: scarred plate, blue-and-gold tabard, a heavy cloak
  cap_wardens_leader: {
    skin: 0xc8a07c, hair: 0x9a9a98, hairStyle: "short", beard: 0x9a9a98, beardStyle: "full", eye: 0x3a4a5a,
    head: "greathelm", headCol: 0x9aa4ae, headTrim: 0xd9a93a, plume: 0x23468f,
    torso: "plate", torsoCol: 0x98a2ae, trim: 0xd9a93a, tabard: { col: 0x23468f, trim: 0xd9a93a, emblem: 0xf0c75a }, belt: 0x3a2618, buckle: 0xd9a93a,
    legs: "mail", legCol: 0x6f7883, boots: 0x7a838e, bootStyle: "greave",
    sleeve: 0x98a2ae, arms: "plate", glove: 0x4a3a2a, weapon: "sword", fx: 0xffffff, back: "cape", capeCol: 0x1c3470, build: 1.14,
  },
  // the oath-hall keeper: ivory robe, blue sash, a candle-lit staff
  cap_wardens_oathkeeper: {
    skin: 0xe0b894, hair: 0xd8d4cc, hairStyle: "long", eye: 0x4a5a6a,
    head: "hood", headCol: 0xd8d0bc, headTrim: 0xd9a93a,
    torso: "robe", torsoCol: 0xd8d0bc, trim: 0xd9a93a, sash: 0x23468f, belt: 0x23468f, buckle: 0xd9a93a,
    legs: "robe", legCol: 0xb8b0a0, boots: 0x3a2e22, bootStyle: "shoe",
    sleeve: 0xd8d0bc, arms: "cloth", weapon: "staff", orb: 0xffd070, fx: 0xffd070,
  },
  // the drillmaster: padded gambeson, leather bracers, a wooden practice sword, a blue drill-sergeant bandana
  cap_wardens_trainer: {
    skin: 0xc4906a, hair: 0x4a3a2a, hairStyle: "short", beard: 0x4a3a2a, beardStyle: "stubble", eye: 0x3a2a1a,
    head: "bandana", headCol: 0x23468f, headTrim: 0x16306a,
    torso: "jerkin", torsoCol: 0xb8a078, trim: 0x8a7050, vest: 0x8a7050, belt: 0x3a2618, buckle: 0x8a7a5a, sash: 0x23468f,
    legs: "trousers", legCol: 0x4a3e30, boots: 0x2a2018, bootStyle: "wrap",
    sleeve: 0xb8a078, arms: "cloth", glove: 0x3a2618, bracer: 0x5a3a22, weapon: "sword", bladeCol: 0xa8804e, fx: 0xffffff, build: 1.1,
  },
  // Duskveil (Veiled Circle). The Regent: the Oracle's voice, veiled to the eyes in violet and gold, a sun-orb staff
  cap_veiled_leader: {
    skin: 0xd8b898, hair: 0x1a1a2a, hairStyle: "long", eye: 0xe0a030,
    head: "hood", headCol: 0x2a2a5a, headTrim: 0xe0a030, mask: 0x6a5aa8,
    torso: "robe", torsoCol: 0x4a3a8a, trim: 0xe0a030, tabard: { col: 0x2a2a5a, trim: 0xe0a030, emblem: 0xf6d26b }, belt: 0xe0a030, buckle: 0xf6d26b, sash: 0xe0a030,
    legs: "dress", legCol: 0x2a2a5a, boots: 0x14143a, bootStyle: "shoe",
    sleeve: 0x4a3a8a, arms: "cloth", glove: 0xd8b898, weapon: "staff", orb: 0xf6d26b, fx: 0xf6d26b, back: "cape", capeCol: 0x2a2a5a, build: 1.02,
  },
  // the Unspoken Witness: pale lilac veils over the whole face, a violet-lit staff, never a word
  cap_veiled_oathkeeper: {
    skin: 0xe0c4a8, hair: 0xd8d4e8, hairStyle: "long", eye: 0x8a7ad0,
    head: "hood", headCol: 0xd8d4e8, headTrim: 0xe0a030, mask: 0xd8d4e8,
    torso: "robe", torsoCol: 0xd8d4e8, trim: 0xe0a030, sash: 0x4a3a8a, belt: 0x4a3a8a, buckle: 0xe0a030,
    legs: "robe", legCol: 0xb8b4cc, boots: 0x2a2a4a, bootStyle: "shoe",
    sleeve: 0xd8d4e8, arms: "cloth", weapon: "staff", orb: 0xb090ff, fx: 0xb090ff,
  },
  // the Blade-Mistress: indigo wraps and a gold sash, a curved blade, light on her feet
  cap_veiled_trainer: {
    skin: 0xc8946a, hair: 0x1a1414, hairStyle: "ponytail", eye: 0x2a1a10,
    head: "bandana", headCol: 0x4a3a8a, headTrim: 0x2a2a5a, mask: 0x34346a,
    torso: "leather", torsoCol: 0x34346a, trim: 0xe0a030, vest: 0x20204a, belt: 0xe0a030, buckle: 0xf6d26b, sash: 0xe0a030,
    legs: "wrapped", legCol: 0x2a2a4a, boots: 0x1a1a2a, bootStyle: "wrap",
    sleeve: 0x34346a, arms: "wrap", glove: 0x20204a, bracer: 0xe0a030, weapon: "katana", fx: 0xf6d26b, build: 0.98,
  },
  // Marrowkeep (Ossuary Host). The Lord-Ossuary: black plate, bone pauldrons, a teal-trimmed black tabard, a bone plume
  cap_host_leader: {
    skin: 0xc8bcae, hair: 0xd8cfb2, hairStyle: "short", beard: 0xd8cfb2, beardStyle: "stubble", eye: 0x4f7d6a,
    head: "greathelm", headCol: 0x2a302e, headTrim: 0x4f7d6a, plume: 0xd8cfb2,
    torso: "plate", torsoCol: 0x3a4442, trim: 0x4f7d6a, tabard: { col: 0x1f2422, trim: 0x4f7d6a, emblem: 0xd8cfb2 }, belt: 0x1c2020, buckle: 0xd8cfb2,
    legs: "mail", legCol: 0x2e3634, boots: 0x3a4442, bootStyle: "greave", boneArmour: 1,
    sleeve: 0x3a4442, arms: "plate", glove: 0x1c2020, weapon: "sword", bladeCol: 0xb8c4c0, fx: 0x8affd0, back: "cape", capeCol: 0x1f2422, build: 1.16,
  },
  // the Reader of the Roll: bone-pale hood, black robe, a teal grave-lantern on her staff
  cap_host_oathkeeper: {
    skin: 0xd0c8bc, hair: 0xe8e2d0, hairStyle: "long", eye: 0x4f7d6a,
    head: "hood", headCol: 0xd8cfb2, headTrim: 0x4f7d6a,
    torso: "robe", torsoCol: 0x2a302e, trim: 0xd8cfb2, sash: 0x4f7d6a, belt: 0x4f7d6a, buckle: 0xd8cfb2,
    legs: "robe", legCol: 0x1c2020, boots: 0x121616, bootStyle: "shoe",
    sleeve: 0x2a302e, arms: "cloth", glove: 0xd0c8bc, weapon: "staff", orb: 0x8affd0, lantern: 0x8affd0, fx: 0x8affd0, fetishes: 0xd8cfb2,
  },
  // the drill-sergeant: a dented kettle helm, grey mail, a teal sash and a heavy mace
  cap_host_trainer: {
    skin: 0xb8a898, hair: 0x3a3a38, hairStyle: "short", beard: 0x3a3a38, beardStyle: "full", eye: 0x2a2a28,
    head: "kettle", headCol: 0x5a625e, headTrim: 0x4f7d6a,
    torso: "mail", torsoCol: 0x5a625e, trim: 0x2a302e, belt: 0x2a1e14, buckle: 0xd8cfb2, sash: 0x4f7d6a,
    legs: "trousers", legCol: 0x2a302e, boots: 0x1c2020, bootStyle: "leather",
    sleeve: 0x5a625e, arms: "cloth", glove: 0x2a1e14, bracer: 0x3a4442, weapon: "mace", fx: 0xffffff, build: 1.12,
  },
  // Scarwall (Redfang Compact). The Warlord: a horned iron helm, mail under a red tabard, a wolf pelt, a broad axe
  cap_redfang_leader: {
    skin: 0xc8946a, hair: 0x1a1414, hairStyle: "short", beard: 0x1a1414, beardStyle: "full", eye: 0x3a1a10,
    head: "horned", headCol: 0x3a3434, headTrim: 0x7e1d16,
    torso: "mail", torsoCol: 0x4a4444, tabard: { col: 0x7e1d16, trim: 0x1a1414, emblem: 0xe3d6b8 }, belt: 0x1a1414, buckle: 0xe3d6b8,
    legs: "trousers", legCol: 0x2a2224, boots: 0x1a1414, bootStyle: "leather",
    sleeve: 0x4a4444, arms: "plate", glove: 0x1a1414, bracer: 0x7e1d16, weapon: "axe", fx: 0xff8a6a, back: "pelt", capeCol: 0x5a4a3a, build: 1.26,
  },
  // the ledger-keeper: an old woman in a red hood, an ink-stained apron, the knife she cuts thumbs with
  cap_redfang_oathkeeper: {
    skin: 0xd0a07c, hair: 0x9a9690, hairStyle: "long", eye: 0x2a1a10,
    head: "hood", headCol: 0x5a1812, headTrim: 0x1a1414,
    torso: "robe", torsoCol: 0x3a2a24, trim: 0x7e1d16, apron: 0x7e1d16, belt: 0x1a1414, buckle: 0xe3d6b8,
    legs: "dress", legCol: 0x2a2224, boots: 0x1a1414, bootStyle: "shoe",
    sleeve: 0x3a2a24, arms: "cloth", glove: 0xd0a07c, weapon: "dagger", fx: 0xffffff, fetishes: 0xe3d6b8, build: 0.94,
  },
  // the pit-boss: bare-chested and scarred, red bandana, red wraps on his fists, no weapon but those
  cap_redfang_trainer: {
    skin: 0xc48a5e, hair: 0x2a1a14, hairStyle: "bald", beard: 0x2a1a14, beardStyle: "stubble", eye: 0x2a1a10,
    head: "bandana", headCol: 0x7e1d16, headTrim: 0x1a1414,
    torso: "bare", torsoCol: 0xc48a5e, belt: 0x1a1414, buckle: 0xe3d6b8, harness: true,
    legs: "trousers", legCol: 0x3a2a24, boots: 0x1a1414, bootStyle: "wrap",
    sleeve: 0xc48a5e, arms: "bare", glove: 0x7e1d16, bracer: 0x7e1d16, weapon: "none", fx: 0xffffff, build: 1.24,
  },
  // Deepden (Hide-Kin). The Den-Father: an old man's face under a flayed wolf's head, hide harness, a bone-bound maul
  cap_hidekin_leader: {
    skin: 0xa07a58, hairStyle: "none", beard: 0x8a8278, beardStyle: "long", beast: "wolf", beastHood: true, head: "none", eye: 0xe2a040,
    torso: "leather", torsoCol: 0x6a4a2a, trim: 0xe2c79a, belt: 0x6e1d18, buckle: 0xe2c79a, harness: true,
    legs: "fur", legCol: 0x5a3e24, boots: 0x3a281a, bootStyle: "wrap",
    sleeve: 0x8a5f2a, arms: "cloth", bracer: 0x3a281a, glove: 0x3a281a, weapon: "hammer", bladeCol: 0x8a8070, fx: 0xffc070, back: "pelt", capeCol: 0x8a5f2a, fetishes: 0xe2c79a, build: 1.32,
  },
  // Grandmother Thistle: a hide hood, white hair, a bone-needle staff, charms all down her belt
  cap_hidekin_oathkeeper: {
    skin: 0xb08a68, hair: 0xe8e4dc, hairStyle: "long", eye: 0x2a1a10,
    head: "hood", headCol: 0x8a5f2a, headTrim: 0xe2c79a,
    torso: "robe", torsoCol: 0x6a4a2a, trim: 0xe2c79a, apron: 0xc8ac80, belt: 0x6e1d18, buckle: 0xe2c79a,
    legs: "robe", legCol: 0x5a3e24, boots: 0x3a281a, bootStyle: "wrap",
    sleeve: 0x6a4a2a, arms: "cloth", glove: 0xb08a68, weapon: "staff", orb: 0xffc070, fx: 0xffc070, fetishes: 0xe2c79a, stoop: 2, build: 0.92,
  },
  // the Clawmaster: bare-chested, a quilled back, digging claws, a blood-red bandana
  cap_hidekin_trainer: {
    skin: 0xa8805c, hair: 0x2a1c12, hairStyle: "short", eye: 0x2a1a10,
    head: "bandana", headCol: 0x6e1d18, headTrim: 0x3a1410,
    torso: "bare", torsoCol: 0xa8805c, belt: 0x3a281a, buckle: 0xe2c79a, harness: true,
    legs: "fur", legCol: 0x5a3e24, boots: 0x3a281a, bootStyle: "wrap",
    sleeve: 0xa8805c, arms: "bare", glove: 0x3a281a, weapon: "none", fx: 0xffd0a0, quills: 0x3a2a1a, claws: 0xe2d8bc, build: 1.14,
  },
  steward_redfang: { // a scarred quartermaster in red leather
    skin: 0xd0a07c, hair: 0x2a1a14, hairStyle: "short", beard: 0x2a1a14, beardStyle: "stubble", eye: 0x3a2a1a,
    head: "cap", headCol: 0x5a1812, headTrim: 0x1a1414,
    torso: "leather", torsoCol: 0x7e1d16, trim: 0x1a1414, belt: 0x1a1414, buckle: 0xe3d6b8, sash: 0x3a2018,
    legs: "trousers", legCol: 0x2a2224, boots: 0x1a1414, bootStyle: "wrap",
    sleeve: 0x5a1812, arms: "cloth", glove: 0x1a1414, bracer: 0x3a2018, weapon: "none", fx: 0xffffff, build: 1.12,
  },
  steward_host: { // a hooded ossuary clerk, bone-pale, a bone-green sash
    skin: 0xb8b0a0, hair: 0xd8cfb2, hairStyle: "bald", eye: 0x4f7d6a,
    head: "hood", headCol: 0x1f2422, headTrim: 0x4f7d6a,
    torso: "robe", torsoCol: 0x2a302e, trim: 0x4f7d6a, apron: 0x3a4440, belt: 0x4f7d6a, buckle: 0xd8cfb2, sash: 0x4f7d6a,
    legs: "dress", legCol: 0x1c2020, boots: 0x121616, bootStyle: "shoe",
    sleeve: 0x2a302e, arms: "cloth", glove: 0xb8b0a0, weapon: "staff", fx: 0xffffff, back: "cape", capeCol: 0x1f2422, fetishes: 0xd8cfb2, build: 0.96,
  },
  steward_hidekin: { // a hide-wrapped burrow-warden, horned, a bone-studded harness
    skin: 0xa07a58, hair: 0x2a1c12, hairStyle: "long", beard: 0x2a1c12, beardStyle: "full", eye: 0x2a1a10,
    head: "horned", headCol: 0x8a5f2a, headTrim: 0xe2c79a,
    torso: "leather", torsoCol: 0x6a4a2a, trim: 0xe2c79a, belt: 0x6e1d18, buckle: 0xe2c79a, harness: true,
    legs: "trousers", legCol: 0x5a3e24, boots: 0x3a281a, bootStyle: "wrap",
    sleeve: 0x8a5f2a, arms: "cloth", bracer: 0x3a281a, glove: 0x3a281a, weapon: "hammer", fx: 0xffffff, back: "pelt", capeCol: 0x8a5f2a, fetishes: 0xe2c79a, build: 1.2,
  },
  steward_veiled: { // a masked envoy in moon-robes, indigo and gold
    skin: 0xd8b898, hair: 0x1a1a2a, hairStyle: "long", eye: 0xe0a030,
    head: "hood", headCol: 0x2a2a5a, headTrim: 0xe0a030, mask: 0xd8d4e8,
    torso: "robe", torsoCol: 0x34346a, trim: 0xe0a030, apron: 0x2a2a5a, belt: 0xe0a030, buckle: 0xf6d26b, sash: 0xe0a030,
    legs: "dress", legCol: 0x20204a, boots: 0x14143a, bootStyle: "shoe",
    sleeve: 0x34346a, arms: "cloth", glove: 0xd8b898, weapon: "staff", fx: 0xf6d26b, back: "cape", capeCol: 0x2a2a5a, build: 0.98,
  },
  steward_neutral: { // an unaffiliated town reeve: plain drab wool and a ledger belt
    skin: 0xc8a284, hair: 0x6a5a48, hairStyle: "short", eye: 0x3a2a1a,
    head: "cap", headCol: 0x5a5448, headTrim: 0x3a342c,
    torso: "jerkin", torsoCol: 0x6a6458, trim: 0x4a4438, belt: 0x2a1e14, buckle: 0x9a8a5a,
    legs: "trousers", legCol: 0x3a3830, boots: 0x2a2218, bootStyle: "leather",
    sleeve: 0x6a6458, arms: "cloth", glove: 0x2a1e14, weapon: "none", fx: 0xffffff, build: 1.04,
  },
  // The watch quartermaster: the guard's kit in the watch's blue-grey, a big belly, a brass sash, ledger-keeper not spearman
  quartermaster: {
    skin: 0xdcaa80, hair: 0x6a6a68, hairStyle: "short", beard: 0x6a6a68, beardStyle: "full",
    head: "cap", headCol: 0x3e4e66, headTrim: 0xb08a3a,
    torso: "mail", torsoCol: 0x7a8490, tabard: { col: 0x2e4468, trim: 0xd9a93a, emblem: 0xf0c75a }, belt: 0x4a2f1c, buckle: 0xd9a93a, sash: 0xb08a3a, belly: true,
    legs: "trousers", legCol: 0x3a3a46, boots: 0x2a2624, bootStyle: "leather",
    sleeve: 0x7a8490, arms: "cloth", glove: 0x5a3a22, weapon: "none", fx: 0xffffff, build: 1.1,
  },
  // A coast smuggler: a salt-grey hooded oilskin coat, scarf up, a knife at the belt
  smuggler: {
    skin: 0xc8a284, hair: 0x2a2a2e, hairStyle: "short", beard: 0x2a2a2e, beardStyle: "stubble",
    head: "hood", headCol: 0x3a4a52, headTrim: 0x24323a, mask: 0x56666e,
    torso: "leather", torsoCol: 0x3e5058, trim: 0x2a3a42, belt: 0x1e1810, buckle: 0x9a8a5a,
    legs: "trousers", legCol: 0x2e3a40, boots: 0x1e1812, bootStyle: "wrap",
    sleeve: 0x34444c, arms: "cloth", glove: 0x1e1812, weapon: "dagger", fx: 0xffffff, back: "cape", capeCol: 0x2e3e46,
  },
  // Mags the alewife: broad and red-cheeked, rolled sleeves, a linen headscarf and a stained apron
  alewife: {
    skin: 0xeab08a, hair: 0xb8501e, hairStyle: "long",
    head: "bandana", headCol: 0xe4dcc4, headTrim: 0xb8aa88,
    torso: "shirt", torsoCol: 0xd8c8a8, apron: 0xe8e0cc, vest: 0x7a3a2a, belt: 0x5a3a22, buckle: 0xb08a3a, belly: true,
    legs: "dress", legCol: 0x7a3a2a, boots: 0x3a281a, bootStyle: "shoe",
    sleeve: 0xeab08a, arms: "bare", bracer: 0x7a5a38, weapon: "none", fx: 0xffffff, build: 1.25,
  },
  // Oren the bladesmith: a bald, soot-darkened smith with a leather apron and a curved blade on his hip
  desertsmith: {
    skin: 0x8a5a36, hairStyle: "bald", hair: 0x1a1410, beard: 0x2a201a, beardStyle: "full",
    head: "none", torso: "shirt", torsoCol: 0xc8b48a, vest: 0x5a3a22, apron: 0x6a4428, belt: 0x2e2014, buckle: 0xd8a840,
    legs: "trousers", legCol: 0x6a5238, boots: 0x3a2a1e, bootStyle: "wrap",
    sleeve: 0x8a5a36, arms: "bare", bracer: 0x4a3424, weapon: "hammer", fx: 0xffffff, build: 1.15,
  },
  // The armourers (shared/npcs.ts), each dressed in what they sell.
  // Hilda of Oakvale: a broad, red-haired woman in steel mail under an oxblood tabard, a hammer for dents, a kite shield on her arm
  armourer: {
    skin: 0xe8b08a, hair: 0xa8401e, hairStyle: "ponytail", eye: 0x3a5a2a,
    head: "none", torso: "mail", torsoCol: 0x8a939e, tabard: { col: 0x7a2620, trim: 0xd9a93a, emblem: 0xf0c75a }, belt: 0x4a2e1a, buckle: 0xd9a93a,
    legs: "trousers", legCol: 0x4a3a2a, boots: 0x2a2420, bootStyle: "greave",
    sleeve: 0x8a939e, arms: "plate", glove: 0x5a3a22, weapon: "hammer", fx: 0xffffff, build: 1.15,
    shield: { col: 0x7a2620, trim: 0xa5aeb8, emblem: 0xf0c75a, style: "kite" },
  },
  // Dorran of Saltmere: a grey-bearded old sailor in a sea-blue knit cap, riveted sea-leather coat, brass at the belt
  saltarmourer: {
    skin: 0xc8916a, hair: 0x8a8a86, hairStyle: "short", beard: 0x9a9a94, beardStyle: "full",
    head: "cap", headCol: 0x285058, headTrim: 0x1a3a42,
    torso: "leather", torsoCol: 0x4a3628, trim: 0xc89c44, belt: 0x221814, buckle: 0xc89c44,
    legs: "trousers", legCol: 0x3a4a52, boots: 0x221814, bootStyle: "leather",
    sleeve: 0x4a3628, arms: "cloth", glove: 0x36261e, bracer: 0x334656, weapon: "none", fx: 0xffffff,
    shield: { col: 0x285058, trim: 0x708a9a, emblem: 0xd8e4e0, style: "round" },
  },
  // Idris of Kel Ashar: a lean man in a white headwrap with an indigo band, brass scale over cream linen, an indigo sash
  sandarmourer: {
    skin: 0x8a5a36, hair: 0x1a1410, hairStyle: "short", beard: 0x1a1410, beardStyle: "full",
    head: "bandana", headCol: 0xece2c8, headTrim: 0x302e72,
    torso: "mail", torsoCol: 0xc89c44, sash: 0x302e72, belt: 0x4a2e1a, buckle: 0xead07a,
    legs: "trousers", legCol: 0xe2d6bc, boots: 0x4a2e1a, bootStyle: "wrap",
    sleeve: 0xece2c8, arms: "cloth", bracer: 0xc89c44, weapon: "none", fx: 0xffffff,
    shield: { col: 0x9a722c, trim: 0xead07a, emblem: 0xf2ecdc, style: "round" },
  },
  // Warden-Captain Edra Vane of Cairnwatch: weathered, grey wool under a bronze-studded leather coat, the grey-green cairn-warden cloak, a spear
  cairncaptain: {
    skin: 0xd4a888, hair: 0x6a5a4a, hairStyle: "ponytail", eye: 0x3a4a3a, head: "none",
    torso: "leather", torsoCol: 0x4e3e2c, trim: 0xa8843a, belt: 0x2a2018, buckle: 0xa8843a,
    legs: "trousers", legCol: 0x5a5c58, boots: 0x2e2a24, bootStyle: "leather",
    sleeve: 0x7a7e7c, arms: "cloth", glove: 0x3a2e22, bracer: 0x8a6a34, weapon: "spear", bladeCol: 0x9aa4a8, fx: 0xffffff,
    back: "cape", capeCol: 0x56685c, build: 1.05,
  },
  // Mother Ysolde the herbwife: old and small, a heather-dyed shawl over a plum dress, grey hair under a hood, a basket of herbs
  moorherbalist: {
    skin: 0xd8b090, hair: 0xcfcfd0, hairStyle: "long", eye: 0x3a3a4a,
    head: "hood", headCol: 0x7a5a8a, headTrim: 0x5a3e6a,
    torso: "robe", torsoCol: 0x6e4e7e, trim: 0xb89ac8, vest: 0x8a6aa0, apron: 0xcbbf9a, sash: 0x4a3a2a, belt: 0x4a3a2a,
    legs: "dress", legCol: 0x4a3a52, boots: 0x3a2a22, bootStyle: "shoe",
    sleeve: 0x6e4e7e, arms: "cloth", glove: 0xd8b090, weapon: "none", fx: 0xffffff, back: "cape", capeCol: 0x84609a, capeShort: true, basket: 0x8a6a3a, build: 0.92,
  },
  // Gorm the armourer: a big grey-bearded moor-man, bare forearms, a scorched leather apron, a smith's hammer
  moorarmourer: {
    skin: 0xc89a76, hair: 0x8a8a88, hairStyle: "short", beard: 0x9a9a98, beardStyle: "full",
    head: "none", torso: "shirt", torsoCol: 0x6a5a4a, apron: 0x4a3322, belt: 0x2a1c12, buckle: 0x9a7a3a, belly: true,
    legs: "trousers", legCol: 0x4a463c, boots: 0x2a2018, bootStyle: "leather",
    sleeve: 0xc89a76, arms: "bare", bracer: 0x4a3424, glove: 0x2a1c12, weapon: "hammer", fx: 0xffffff, build: 1.3,
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
