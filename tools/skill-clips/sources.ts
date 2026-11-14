// The files a skill clip depends on: when their hash changes, the clips are filmed again (skill-clips.yml).
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { ACTIVE_CLASSES } from "../../shared/classes";

const ROOT = path.resolve(__dirname, "../..");
/** Skill rules and numbers, the cast effects, hero poses and gear looks, and the capture itself. */
export const CLIP_SOURCES = [
  "shared/skills.ts", "shared/skillEngine.ts", "shared/classes.ts", "shared/summons.ts",
  "client/src/skillfx.ts", "client/src/skillMoves.ts", "client/src/skillMoveData.ts", "client/src/elemFx.ts", "client/src/beastForms.ts", "client/src/beastFx.ts",
  "tools/skill-clips/capture.ts", "tools/skill-clips/slowtime.cjs",
];

export function clipSourcesHash(): string {
  const h = createHash("sha256");
  for (const f of CLIP_SOURCES) { h.update(f); try { h.update(readFileSync(path.join(ROOT, f))); } catch { /* removed file */ } }
  // hero art (generated sprite sheets)
  const art = path.join(ROOT, "client/public/assets/characters");
  try { for (const f of readdirSync(art).filter((f) => ACTIVE_CLASSES.some((c) => f.startsWith(c))).sort()) h.update(readFileSync(path.join(art, f))); } catch { /* no art dir */ }
  return h.digest("hex").slice(0, 16);
}

if (process.argv[1]?.endsWith("sources.ts")) console.log(clipSourcesHash());
