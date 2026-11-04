// Player accounts: name + password, with one saved hero per class.
// Saves live in a JSON file on the server (SAVE_FILE, default data/saves.json).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface HeroSave {
  color: number;
  xp: number; level: number; kills: number;
  gold: number; potions: number;
  ptSta: number; ptStr: number; ptMag: number; ptDex?: number;
  weapon: string; armour: string; shoes: string; hat: string; shield: string; ranged: string;
  bag: string[];
  talents: Record<string, number>;
  slots: string[];
  questId?: number; questStage: number; questCount: number; questVer?: number;
  /** Skeleton quest chain (shared/quests.ts CHAINS[1]) */
  boneId?: number; boneStage?: number; boneCount?: number; boneVer?: number;
  /** Redfang quest chain (CHAINS[2]) */
  redId?: number; redStage?: number; redCount?: number; redVer?: number;
  /** 1 once the hero has been given its class starting kit (older saves get it on their next login). */
  kit?: number;
  /** The guided first quest (CHAINS[3], First Steps); missing on older saves = already done. */
  tutId?: number; tutStage?: number; tutCount?: number; tutVer?: number;
  /** The Hollow Crown (CHAINS[4]), the first zone's last story. */
  crownId?: number; crownStage?: number; crownCount?: number; crownVer?: number;
  /** Portal stones this hero has woken (shared/portals.ts ids). */
  portals?: string[];
}

interface Account {
  name: string;
  salt: string;
  hash: string;
  created: number;
  heroes: Partial<Record<string, HeroSave>>;
  /** Loot chests this account opened: chest id -> time it refills (ms). Shared by all heroes of the account. */
  chests?: Record<string, number>;
  /** The stash chest in Oakvale (shared/trade.ts): items and gold shared by all heroes of the account. */
  stash?: Stash;
}

export interface Stash { items: string[]; gold: number }

const FILE = path.resolve(process.env.SAVE_FILE ?? path.join(__dirname, "../data/saves.json"));
let accounts: Record<string, Account> = {};
try {
  accounts = JSON.parse(fs.readFileSync(FILE, "utf8"));
} catch (e: any) {
  if (e?.code !== "ENOENT") console.error("Could not read saves file:", e);
}

export const NAME_RE = /^[A-Za-z0-9_ -]{3,16}$/;
export const MIN_PASSWORD = 4;

const key = (name: string) => name.trim().toLowerCase();
const hashPw = (pw: string, salt: string) => crypto.scryptSync(pw, salt, 32).toString("hex");

/** Log in, or create the account if the name is free. Throws a message the player can read. */
export function login(nameIn: unknown, pwIn: unknown): string {
  const name = String(nameIn ?? "").trim();
  const pw = String(pwIn ?? "");
  if (!NAME_RE.test(name)) throw new Error("Name: 3 to 16 letters, numbers, spaces, - or _");
  if (pw.length < MIN_PASSWORD || pw.length > 64) throw new Error(`Password: at least ${MIN_PASSWORD} characters`);
  const acc = accounts[key(name)];
  if (!acc) {
    const salt = crypto.randomBytes(16).toString("hex");
    accounts[key(name)] = { name, salt, hash: hashPw(pw, salt), created: Date.now(), heroes: {} };
    flush();
    return name;
  }
  const ok = crypto.timingSafeEqual(Buffer.from(hashPw(pw, acc.salt), "hex"), Buffer.from(acc.hash, "hex"));
  if (!ok) throw new Error("Wrong password for this name (or the name is taken)");
  return acc.name;
}

/** Check a name + password without creating anything. Lists the saved heroes (class -> level). */
export function peek(nameIn: unknown, pwIn: unknown): { exists: boolean; heroes: Record<string, number> } {
  const name = String(nameIn ?? "").trim();
  const pw = String(pwIn ?? "");
  const acc = accounts[key(name)];
  if (!acc) return { exists: false, heroes: {} };
  const ok = crypto.timingSafeEqual(Buffer.from(hashPw(pw.slice(0, 64), acc.salt), "hex"), Buffer.from(acc.hash, "hex"));
  if (!ok) throw new Error("Wrong password for this name (or the name is taken)");
  const heroes: Record<string, number> = {};
  for (const [cls, h] of Object.entries(acc.heroes)) if (h) heroes[cls] = h.level || 1;
  return { exists: true, heroes };
}

export function loadHero(name: string, cls: string): HeroSave | undefined {
  return accounts[key(name)]?.heroes[cls];
}

export function saveHero(name: string, cls: string, hero: HeroSave) {
  const acc = accounts[key(name)];
  if (!acc) return;
  acc.heroes[cls] = hero;
  dirty = true;
}

/** Chests this account has opened that have not refilled yet (id -> refill time, ms). Drops expired entries. */
export function openedChests(name: string, now = Date.now()): Record<string, number> {
  const acc = accounts[key(name)];
  if (!acc?.chests) return {};
  for (const [id, t] of Object.entries(acc.chests)) if (!(t > now)) delete acc.chests[id];
  return { ...acc.chests };
}

/** New game: every loot chest is full again for this account. */
export function resetChests(name: string) {
  const acc = accounts[key(name)];
  if (!acc?.chests) return;
  delete acc.chests;
  dirty = true;
}

/** Remember that this account emptied a chest until `refillAt`. */
export function markChest(name: string, id: string, refillAt: number) {
  const acc = accounts[key(name)];
  if (!acc) return;
  (acc.chests ??= {})[id] = refillAt;
  dirty = true;
}

/** A copy of the account's stash (empty if it never used one). */
export function loadStash(name: string): Stash {
  const s = accounts[key(name)]?.stash;
  return { items: [...(s?.items ?? [])], gold: s?.gold ?? 0 };
}

/**
 * Store the stash together with the hero that changed it, in one go: both end up in the same file write,
 * so a crash can never leave an item both in the stash and in the hero's bag.
 */
export function saveStash(name: string, stash: Stash, cls: string, hero: HeroSave) {
  const acc = accounts[key(name)];
  if (!acc) return;
  acc.stash = { items: [...stash.items], gold: stash.gold };
  acc.heroes[cls] = hero;
  dirty = true;
}

let dirty = false;
/** Write all saves to disk (atomic: temp file then rename). */
export function flush() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE + ".tmp", JSON.stringify(accounts));
    fs.renameSync(FILE + ".tmp", FILE);
    dirty = false;
  } catch (e) {
    console.error("Could not write saves file:", e);
  }
}
setInterval(() => { if (dirty) flush(); }, 5000).unref();

/** All accounts as stored on disk (password hashes, never passwords), for the admin backup download. */
export function allAccounts() {
  return accounts;
}
