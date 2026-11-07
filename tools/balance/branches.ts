/**
 * PvP win rate of ONE class per branch build against every other class (random builds), at a few levels.
 * Usage: npx tsx tools/balance/branches.ts vampire [fights per pair, default 40]
 */
import { winRate } from "./duel";
import { ACTIVE_CLASSES, ClassKind, isClassKind } from "../../shared/classes";
import { BRANCHES } from "../../shared/skills";

const cls = process.argv[2] as ClassKind, n = Number(process.argv[3]) || 40;
if (!isClassKind(cls)) throw new Error("usage: branches.ts <class> [n]");
const others = ACTIVE_CLASSES.filter((c) => c !== cls);
console.log("Lv".padEnd(6) + BRANCHES[cls].map((b) => b.name.padStart(9)).join(""));
for (const L of [1, 5, 10, 20, 30]) {
  const row = ([0, 1, 2] as const).map((b) => others.reduce((s, c) => s + winRate(cls, c, L, n, b), 0) / others.length);
  console.log(`Lv${L}`.padEnd(6) + row.map((v) => `${Math.round(v * 100)}%`.padStart(9)).join(""));
}
