// Look proposals for the Summoner class, painted with the real hero body code (tools/art/paint/body.ts).
// npx tsx tools/art/proposals/summoner.ts <out.png>
import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { HEROES, setPainted, sheetFrames, type SheetDir } from "../characters";
import { LOOKS, type Look } from "../paint/look";

export const SUMMONER_PROPOSALS: Record<string, { title: string; look: Look }> = {
  // A: rune-binder in midnight blue with copper runes; a hood, a staff stone that glows like a golem core
  summoner_a: {
    title: "A · Lieur de runes",
    look: {
      skin: 0xe2b48c, hair: 0x2a2230, hairStyle: "short", eye: 0x6fe3ff,
      head: "hood", headCol: 0x1f2a4a, headTrim: 0xc0783a,
      torso: "robe", torsoCol: 0x22305a, trim: 0xc0783a, sash: 0x14192e, belt: 0x3a2618, buckle: 0xc0783a,
      legs: "robe", legCol: 0x22305a, boots: 0x2a1c14, bootStyle: "shoe",
      sleeve: 0x22305a, arms: "cloth", bracer: 0xc0783a, glove: 0x2a1c14,
      weapon: "staff", orb: 0x6fe3ff, back: "cape", capeCol: 0x141c36, fx: 0x9ff3ff,
    },
  },
  // B: geomancer of the quarries: earth-brown leather, a stone-grey mantle, a living-wood staff, ochre glow
  summoner_b: {
    title: "B · Géomancienne",
    look: {
      skin: 0xc98f62, hair: 0x5a3a22, hairStyle: "ponytail", eye: 0xffb347,
      head: "none",
      torso: "leather", torsoCol: 0x7a5232, trim: 0xd08a2a, belt: 0x2e1d10, buckle: 0xd08a2a, sash: 0xb8742a,
      legs: "trousers", legCol: 0x4a3a2c, boots: 0x3a2a1e, bootStyle: "wrap",
      sleeve: 0x6a5a48, arms: "cloth", bracer: 0x8a8a80, glove: 0x4a3626,
      weapon: "druidstaff", orb: 0xffb347, back: "cape", capeCol: 0x5e5a50, fx: 0xffd28a, build: 1.05,
    },
  },
  // C: elemental occultist: bone-white robe trimmed in gold, a masked face, a crown of four coloured stones
  summoner_c: {
    title: "C · Occultiste élémentaire",
    look: {
      skin: 0xe8c4a2, hair: 0xd8d0c0, hairStyle: "long", eye: 0xb68cff, mask: 0x2a2236,
      head: "crown", headCol: 0xc9a050, headTrim: 0xb68cff,
      torso: "robe", torsoCol: 0xe6e0d0, trim: 0xc9a050, sash: 0x5a3a8a, belt: 0x3a2a4a, buckle: 0xc9a050,
      legs: "robe", legCol: 0xd6cfbf, boots: 0x3a2a4a, bootStyle: "shoe",
      sleeve: 0xe6e0d0, arms: "cloth", glove: 0x3a2a4a,
      weapon: "witchstaff", orb: 0xb68cff, palmFlame: 0x7ad7ff, fx: 0xd8c4ff,
    },
  },
};

if (process.argv[1]?.endsWith("summoner.ts")) {
  setPainted(true, 1.5, true);
  const base = HEROES.find((h) => h.name === "wizard")!;
  const ids = Object.keys(SUMMONER_PROPOSALS);
  const shots: [string, SheetDir, number][] = [["idle", "down", 0], ["idle", "downright", 0], ["idle", "right", 0], ["idle", "up", 0], ["walk", "downright", 3], ["skill", "down", 2], ["attack", "right", 2]];
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
