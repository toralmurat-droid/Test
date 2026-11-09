// Look proposals for the Summoner (Void Lord rework, session C): a warlock in a mid-thigh tailcoat and a long scarf,
// bare-headed, dark with Void-violet accents. Painted with the real hero body code (tools/art/paint/body.ts).
// npx tsx tools/art/proposals/summoner.ts <out.png>
import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { HEROES, setPainted, sheetFrames, type SheetDir } from "../characters";
import { HERO_BODIES, LOOKS, type Look } from "../paint/look";

const warlock = (o: Partial<Look>): Look => ({
  ...HERO_BODIES.summoner,
  torso: "tailcoat", legs: "trousers", arms: "cloth", bootStyle: "leather", weapon: "witchstaff",
  ...o,
} as Look);

export const SUMMONER_PROPOSALS: Record<string, { title: string; look: Look }> = {
  // A: charcoal coat over a plum waistcoat, violet piping, a violet scarf with pale bands
  summoner_a: {
    title: "A · Anthracite et prune",
    look: warlock({
      torsoCol: 0x38323f, trim: 0x9a6cff, vest: 0x3c2c44, buckle: 0xb8b0c8, sleeve: 0x38323f, glove: 0x1a1620,
      legCol: 0x16131b, boots: 0x110f15, scarf: { col: 0x5b2f8f, band: 0xc8a8ff }, palmFlame: 0xb68cff,
    }),
  },
  // B: a coat as black as the Void, dull violet piping, a near-black scarf with glowing violet bands
  summoner_b: {
    title: "B · Noir du Néant",
    look: warlock({
      torsoCol: 0x241e2e, trim: 0x7a56c0, vest: 0x2a2232, buckle: 0x8a7aa8, sleeve: 0x241e2e, glove: 0x141018,
      legCol: 0x121016, boots: 0x0e0c11, scarf: { col: 0x2c2438, band: 0xb68cff }, palmFlame: 0x9a6cff,
    }),
  },
};

if (process.argv[1]?.endsWith("summoner.ts")) {
  setPainted(true, 1.5, true);
  const base = HEROES.find((h) => h.name === "summoner")!;
  const ids = Object.keys(SUMMONER_PROPOSALS);
  const shots: [string, SheetDir, number][] = [["idle", "down", 0], ["idle", "downright", 2], ["idle", "right", 0], ["idle", "up", 0],
    ["walk", "down", 2], ["walk", "right", 3], ["run", "down", 2], ["run", "right", 1], ["run", "up", 2], ["skill", "down", 2]];
  const F = 48, Z = 4, LABEL = 40;
  const out = createCanvas(F * Z * shots.length, (F * Z + LABEL) * ids.length), o = out.getContext("2d");
  o.fillStyle = "#3d4530"; o.fillRect(0, 0, out.width, out.height);
  o.imageSmoothingEnabled = false;
  ids.forEach((id, row) => {
    LOOKS[id] = SUMMONER_PROPOSALS[id].look;
    const hero = { ...base, name: id };
    const y0 = row * (F * Z + LABEL);
    o.fillStyle = "#f2e6c8"; o.font = "bold 28px sans-serif"; o.fillText(SUMMONER_PROPOSALS[id].title, 12, y0 + 30);
    shots.forEach(([anim, dir, fi], col) => {
      const f = sheetFrames(hero as any, anim, dir)[fi];
      const c = createCanvas(f.w, f.h), x = c.getContext("2d"), img = x.createImageData(f.w, f.h);
      img.data.set(f.data); x.putImageData(img, 0, 0);
      o.drawImage(c, col * F * Z, y0 + LABEL, F * Z, F * Z);
    });
  });
  writeFileSync(process.argv[2] ?? "summoner-proposals.png", out.encodeSync("png"));
}
