/**
 * Summoner balance levers (Void Lord rework, session E): switches off one part of the kit at a time and prints the
 * Summoner's duel win rate against each class, to see what carries it. The changes only live in this process.
 * Run: npx tsx tools/balance/summoner-levers.ts [fightsPerPair] [lever,lever...] [--levels=5,20,40]
 */
import { ACTIVE_CLASSES, CLASSES } from "../../shared/classes";
import { skillById } from "../../shared/skills";
import { ARSENAL, AURA, BOND, PORTAL, SUMMON, WISP } from "../../shared/summons";
import { SIM, winRate } from "./duel";

const W = (o: unknown) => o as any;
const off = (id: string) => { W(skillById(id)!).cd = 1e12; };
export const LEVERS: Record<string, () => void> = {
  base: () => {},
  noPortal: () => { const p = W(CLASSES.summoner.projectile); p.portal = false; p.range = 160; },
  range175: () => { W(CLASSES.summoner.projectile).range = 175; },
  range190: () => { W(CLASSES.summoner.projectile).range = 190; },
  range160: () => { W(CLASSES.summoner.projectile).range = 160; },
  noWisps: () => { off("su_wisps"); },
  noArsenal: () => { off("su_arsenal"); },
  noBlades: () => { off("su_blades"); },
  noHole: () => { off("su_blackhole"); off("su_horizon"); },
  noColossus: () => { off("su_colossus"); },
  noAuras: () => { for (const el of Object.keys(AURA)) W(AURA)[el] = { ms: 2000 }; },
  noBond: () => { W(SUMMON).guardShare = 0; W(BOND).low = 0; },
  pvp06: () => { W(SUMMON.pvp).dmg = 0.6; },
  wispHalf: () => { for (const s of Object.values(WISP.shot)) W(s).dmg *= 0.5; },
  golemHalf: () => { W(SUMMON.pvp).dmg = 0.425; W(SUMMON.pvp).hp = 0.5; },
  noGolems: () => { W(SUMMON.pvp).dmg = 0; W(SUMMON.pvp).hp = 0.001; W(SUMMON).guardShare = 0; W(BOND).low = 0; },
  gDmg05: () => { W(SUMMON.pvp).dmg = 0.5; },
  gHp07: () => { W(SUMMON.pvp).hp = 0.7; },
  gap45: () => { W(PORTAL).exitGap = 45; },
  gap60: () => { W(PORTAL).exitGap = 60; },
  dmg15: () => { W(CLASSES.summoner).damage = 15; },
  dmg14: () => { W(CLASSES.summoner).damage = 14; },
  aimHero: () => { SIM.aimHero = true; },
  pvpLow: () => { Object.assign(W(SUMMON.pvp), { dmg: 0.5, hp: 0.5, cc: 0.3 }); },
  pvpMin: () => { Object.assign(W(SUMMON.pvp), { dmg: 0.25, hp: 0.25, cc: 0.1 }); },
  cc0: () => { W(SUMMON.pvp).cc = 0.01; },
  block40: () => { SIM.golemBlock = 0.4; },
  arsenalHalf: () => { W(ARSENAL.lance).dmg *= 0.5; W(ARSENAL.axe.area).dmg *= 0.5; W(ARSENAL.blade).dmg *= 0.5; },
};

if (process.argv[1]?.includes("summoner-levers")) {
  const n = Number(process.argv[2]) || 150;
  const pick = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3].split(",") : Object.keys(LEVERS);
  const levels = (process.argv.find((a) => a.startsWith("--levels="))?.split("=")[1] ?? "5,20,40").split(",").map(Number);
  const foes = ACTIVE_CLASSES.filter((c) => c !== "summoner");
  console.log("lever".padEnd(13) + levels.flatMap((l) => foes.map((f) => `L${l} ${f.slice(0, 3)}`.padStart(9))).join(""));
  for (const name of pick) {
    // each lever in a fresh process state: re-import is costly, so levers are applied one at a time by separate runs
    if (pick.length > 1 && name !== pick[0]) continue;
    for (const part of name.split("+")) LEVERS[part](); // "a+b": both at once
    console.log(name.padEnd(13) + levels.flatMap((l) => foes.map((f) => `${Math.round(winRate("summoner", f, l, n) * 100)}%`.padStart(9))).join(""));
  }
}
