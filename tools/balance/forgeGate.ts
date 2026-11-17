/**
 * The Forge's sim gate (roadmap M4, shared/forge.ts): a forging may only appear in the game when the balance sims say it
 * stays inside its power budget. Pure and seeded: the same forging and seed always give the same verdict (Math.random is
 * swapped for a PRNG seeded from the recipe while it runs), and it fails closed (invalid recipe, timeout, any error).
 *
 * Monster: every active class at the low and the high end of the base kind's level band, `runs` fights each against the
 * plain base and, with the same seed, against the forged one. The hero must still win FORGE.gate.minWin of them (or as
 * often as against the plain one, when that is lower); seconds and HP lost per kill may grow at most FORGE.gate.mobSlack
 * x mobPower.
 * Weapon: every active class that can wear it, at FORGE.gate.weaponLevels (or the recipe's level): zone runs with the
 * forged weapon in place of the usual one (gearFor) may get at most FORGE.gate.weaponGain faster per kill, and duels
 * against the same class and build with the usual weapon may be won at most FORGE.gate.duelMax.
 *
 * Run: npx tsx tools/balance/forgeGate.ts <recipe.json> [--runs=24] [--seed=0] [--timeout=60000]
 * (PR2 wraps it in a worker thread for the live server; here it runs in-process.)
 */
import { readFileSync } from "node:fs";
import { ACTIVE_CLASSES, type ClassKind } from "../../shared/classes";
import {
  defFromRecipe, FORGE, FORGE_MOB_BAND, forgedGearId, forgedMobId, itemPower, parseForgedGearId, parseForgedMobId, mobPower, validateRecipe, weaponInfo,
  type Forged, type ForgedMob, type ForgedWeapon, type ForgeRecipe, type MonsterRecipe, type WeaponRecipe,
} from "../../shared/forge";
import { gearFor, make, pointsFor, Duel, type F } from "./duel";
import { ChampDuel, ChampF, MobF, mobSpec, potionSize, zoneRun, type Pack } from "./pve";
import { itemLevel, setForgedGear, wearProblem, withLevel } from "../../shared/gear";

type Build = 0 | 1 | 2;
export interface GateOpts { runs?: number; seed?: number; timeoutMs?: number; levels?: number[] }
export interface MobCell { cls: ClassKind; level: number; plain: Side; forged: Side; secRatio: number; hpRatio: number }
export interface Side { win: number; sec: number; hp: number }
export interface WeaponClass { cls: ClassKind; gain: number; duelWin: number }
export interface WeaponCell { cls: ClassKind; level: number; itemLevel: number; secPlain: number; secForged: number; gain: number; duelWin: number }
export interface GateResult {
  ok: boolean;
  reasons: string[];
  numbers: { kind: "monster"; power: number; cells: MobCell[] } | { kind: "weapon"; power: number; classes: WeaponClass[]; cells: WeaponCell[] } | { kind: "invalid" };
}

/** A small fast PRNG (mulberry32): the gate's only randomness. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** FNV-1a over a string. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** The recipe behind a forging (what the seed and the validation look at; registry number and status left out). */
export function recipeOf(f: Forged): ForgeRecipe {
  if (f.kind === "weapon") {
    const r: WeaponRecipe = { kind: "weapon", clan: f.clan, name: f.name, base: f.base, implicit: f.implicit, palette: f.palette };
    if (f.elem) r.elem = f.elem;
    if (f.level !== undefined) r.level = f.level;
    return r;
  }
  const r: MonsterRecipe = { kind: "monster", clan: f.clan, name: f.name, base: f.base, affixes: f.affixes, hp: f.mult.hp, dmg: f.mult.dmg, speed: f.mult.speed, palette: f.palette };
  if (f.weapon !== undefined) r.weapon = f.weapon;
  return r;
}
/** A stable text of the recipe's game-relevant parts (name and palette don't change a fight). */
const recipeKey = (r: ForgeRecipe) => r.kind === "weapon"
  ? JSON.stringify(["w", r.base, r.elem?.el ?? "", r.elem?.share ?? 0, [...r.implicit].sort((a, b) => a.key.localeCompare(b.key)).map((a) => [a.key, a.value]), r.level ?? 0])
  : JSON.stringify(["m", r.base, [...r.affixes].sort(), r.weapon ?? "", r.hp, r.dmg, r.speed]);

class Timeout extends Error {}
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** A forging whose id doesn't say what it is (another seq or base, a garbled id) fails closed: its items would resolve to something else. */
function idProblem(def: Forged): string | undefined {
  if (!Number.isInteger(def?.seq) || def.seq < 1) return "bad_id: seq must be a whole number from 1";
  if (def.kind === "weapon") {
    const p = parseForgedGearId(String(def.id));
    return !p || p.seq !== def.seq || p.base !== def.base || def.id !== forgedGearId(def.seq, def.base) ? `bad_id: ${def.id} is not forging ${def.seq} on ${def.base}` : undefined;
  }
  return def.id !== forgedMobId(def.seq) || parseForgedMobId(String(def.id)) !== def.seq ? `bad_id: ${def.id} is not monster forging ${def.seq}` : undefined;
}

/** Run the gate on a forging. Never throws: any problem is a failed verdict. */
export function forgeGate(def: Forged, opts: GateOpts = {}): GateResult {
  const idBad = idProblem(def);
  if (idBad) return { ok: false, reasons: [idBad], numbers: { kind: "invalid" } };
  const recipe = recipeOf(def), check = validateRecipe(recipe);
  if (!check.ok) return { ok: false, reasons: check.errors.map((e) => `${e.code}: ${e.msg}`), numbers: { kind: "invalid" } };
  const runs = Math.max(1, Math.floor(opts.runs ?? FORGE.gate.runs)), timeoutMs = opts.timeoutMs ?? FORGE.gate.timeoutMs;
  const seed0 = hash(recipeKey(recipe)) ^ (opts.seed ?? 0), t0 = Date.now();
  const orig = Math.random;
  let calls = 0;
  /** Seed Math.random for one run (each pair of runs shares a seed, so they differ only by the forging). */
  const reseed = (k: number) => {
    if (Date.now() - t0 > timeoutMs) throw new Timeout();
    Math.random = rng(seed0 ^ Math.imul(k + 1, 0x9e3779b1));
    calls++;
  };
  try {
    return def.kind === "monster" ? mobGate(def, runs, reseed, opts.levels) : weaponGate(def, runs, reseed, opts.levels);
  } catch (e) {
    return { ok: false, reasons: [e instanceof Timeout ? `timeout: over ${timeoutMs} ms after ${calls} runs` : `error: ${(e as Error)?.message ?? e}`], numbers: { kind: "invalid" } };
  } finally {
    Math.random = orig;
  }
}

/** One fight, hero and monster at `level` (pve.ts champRun's way): win, seconds, share of the hero's HP lost. */
function fight(cls: ClassKind, level: number, build: Build, m: MobF): Side {
  const h = make("h", cls, level, build);
  const pack: Pack = { heal: 3, mana: 3, healUsed: 0, manaUsed: 0, size: potionSize(level), lastDrink: -1e9 };
  const d = new ChampDuel(h, [m], pack, 0);
  let w: F | null | undefined;
  while (d.now < 180000 && (w = d.step()) === undefined) { /* fight */ }
  return { win: w === h ? 1 : 0, sec: d.now / 1000, hp: 1 - Math.max(0, h.hp) / h.maxHp };
}

function mobGate(v: ForgedMob, runs: number, reseed: (k: number) => void, levels?: number[]): GateResult {
  const G = FORGE.gate, power = mobPower(v), band = FORGE_MOB_BAND[v.base]!;
  const lv = levels ?? [...new Set([band[0], band[1]])];
  const cells: MobCell[] = [], reasons: string[] = [];
  let k = 0;
  for (const level of lv) for (const cls of ACTIVE_CLASSES) {
    const plain: Side[] = [], forged: Side[] = [];
    for (let i = 0; i < runs; i++, k++) {
      const build = (i % 3) as Build;
      reseed(k);
      plain.push(fight(cls, level, build, new MobF(mobSpec(v.base, level, { weapon: v.weapon }))));
      reseed(k);
      const spec = mobSpec(v.base, level, { variant: v });
      forged.push(fight(cls, level, build, v.affixes.length ? new ChampF(spec, [...v.affixes], "c", false) : new MobF(spec)));
    }
    const side = (a: Side[]): Side => ({ win: r3(mean(a.map((x) => x.win))), sec: r3(mean(a.map((x) => x.sec))), hp: r3(mean(a.map((x) => x.hp))) });
    const p = side(plain), f = side(forged);
    const cell: MobCell = { cls, level, plain: p, forged: f, secRatio: r3(f.sec / Math.max(0.05, p.sec)), hpRatio: r3(Math.max(G.hpFloor, f.hp) / Math.max(G.hpFloor, p.hp)) };
    cells.push(cell);
    const at = `${cls} Lv${level}`, cap = G.mobSlack * Math.min(power, FORGE.mobBudget);
    if (f.win < Math.min(G.minWin, p.win) - 1e-9) reasons.push(`${at}: hero wins ${pct(f.win)} (plain ${pct(p.win)}, needs ${pct(Math.min(G.minWin, p.win))})`);
    if (cell.secRatio > cap + 1e-9) reasons.push(`${at}: ${cell.secRatio.toFixed(2)}x seconds per kill (cap ${cap.toFixed(2)})`);
    if (cell.hpRatio > cap + 1e-9) reasons.push(`${at}: ${cell.hpRatio.toFixed(2)}x HP lost per kill (cap ${cap.toFixed(2)})`);
  }
  return { ok: !reasons.length, reasons, numbers: { kind: "monster", power: r3(power), cells } };
}

function weaponGate(w: ForgedWeapon, runs: number, reseed: (k: number) => void, levels?: number[]): GateResult {
  const G = FORGE.gate, info = weaponInfo(w);
  const prev = setForgedGear((seq) => (seq === w.seq ? info : prev?.(seq)));
  try {
    const lv = levels ?? (w.level !== undefined ? [w.level] : G.weaponLevels);
    const classes = ACTIVE_CLASSES.filter((c) => !wearProblem(c, w.id));
    const cells: WeaponCell[] = [], perClass: WeaponClass[] = [], reasons: string[] = [];
    if (!classes.length) reasons.push("no active class can wear it");
    let k = 0;
    for (const cls of classes) {
      let pSum = 0, fSum = 0, duels = 0, won = 0;
      for (const level of lv) {
        const secP: number[] = [], secF: number[] = [];
        let duel = 0, il = 0;
        for (let i = 0; i < runs; i++, k++) {
          const build = (i % 3) as Build;
          // the forged weapon at the item level of the weapon the bot would carry (its own gear: a fair swap)
          const usual = gearFor(cls, level, pointsFor(cls, level, build), build).weapon;
          il = usual ? itemLevel(usual) : Math.max(1, level - 2);
          const over = { weapon: withLevel(w.id, il) };
          const mobLevel = () => level + Math.floor(Math.random() * 3);
          reseed(k);
          secP.push(zoneRun(cls, level, build, mobLevel).secPerKill);
          reseed(k);
          secF.push(zoneRun(cls, level, build, mobLevel, 3, over).secPerKill);
          // duels: forged against usual, same class and build, sides swapped
          for (let j = 0; j < G.duelsPerRun; j++) {
            reseed(1e6 + k * G.duelsPerRun + j);
            const fx = make("x", cls, level, build, over), fy = make("y", cls, level, build);
            const r = (j % 2 ? new Duel(fx, fy) : new Duel(fy, fx)).run();
            duel += r === fx ? 1 : r === null ? 0.5 : 0;
          }
        }
        const sp = mean(secP), sf = mean(secF), n = runs * G.duelsPerRun;
        cells.push({ cls, level, itemLevel: il, secPlain: r3(sp), secForged: r3(sf), gain: r3(1 - sf / Math.max(0.05, sp)), duelWin: r3(duel / n) });
        pSum += sp; fSum += sf; duels += n; won += duel;
      }
      // judged per class over all levels tested (pooled: one cell of 24 duels is too noisy for a 60% line)
      const sum: WeaponClass = { cls, gain: r3(1 - fSum / Math.max(0.05, pSum)), duelWin: r3(won / Math.max(1, duels)) };
      perClass.push(sum);
      if (sum.gain > G.weaponGain + 1e-9) reasons.push(`${cls}: kills ${pct(sum.gain)} faster (cap ${pct(G.weaponGain)})`);
      if (sum.duelWin > G.duelMax + 1e-9) reasons.push(`${cls}: wins ${pct(sum.duelWin)} of duels against the usual weapon (cap ${pct(G.duelMax)})`);
    }
    return { ok: !reasons.length, reasons, numbers: { kind: "weapon", power: r3(itemPower(info)), classes: perClass, cells } };
  } finally {
    setForgedGear(prev);
  }
}
const pct = (v: number) => `${Math.round(v * 100)}%`;

if (/[\\/]forgeGate\.ts$/.test(process.argv[1] ?? "")) {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const arg = (k: string) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? Number(a.split("=")[1]) : undefined; };
  if (!file) { console.error("usage: npx tsx tools/balance/forgeGate.ts <recipe.json> [--runs=24] [--seed=0] [--timeout=60000]"); process.exit(2); }
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const check = validateRecipe(raw);
  if (!check.ok) { console.log(JSON.stringify({ ok: false, reasons: check.errors.map((e) => `${e.code}: ${e.msg}`) }, null, 2)); process.exit(1); }
  const t = Date.now();
  const res = forgeGate(defFromRecipe(check.recipe, 1), { runs: arg("runs"), seed: arg("seed"), timeoutMs: arg("timeout") });
  console.log(JSON.stringify(res, null, 2));
  console.log(`${res.ok ? "PASS" : "FAIL"} in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  process.exit(res.ok ? 0 : 1);
}
