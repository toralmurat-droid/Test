// Rebuild only some painted monster sheets (fast): npx tsx tools/art/build-one-mob.ts mob_bride [...]
import { buildMobs } from "./paint/mobs";
buildMobs("client/public/assets/hd/mobs", process.argv.slice(2));
