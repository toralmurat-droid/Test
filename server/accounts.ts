import type { BountyState } from "../shared/bounty";
// Player accounts: name + password, with one saved hero per class.
// Saves live in a JSON file on the server (SAVE_FILE, default data/saves.json).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { FailDelay, isLocalIp, KeyedLimiter, LOGIN_BURST, LOGIN_PER_SEC, SIGNUP_BURST, SIGNUP_PER_SEC } from "./ratelimit";

export interface HeroSave {
  color: number;
  xp: number; level: number; kills: number;
  gold: number; potions: number;
  mpotions?: number; // mana potions before potion sizes (old saves)
  pots?: { potion: number[]; mpotion: number[] }; // potions by size (shared/potions.ts)
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
  /** The Hide Rite (CHAINS[5]), the Mawdeep Warrens' story. */
  beastId?: number; beastStage?: number; beastCount?: number; beastVer?: number;
  /** Portal stones this hero has woken (shared/portals.ts ids). */
  portals?: string[];
  /** Bounty board hunt in progress (shared/bounty.ts) and how many this hero has finished. */
  bounty?: BountyState; bountyDone?: number;
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
/** Old accounts may still log in with 4+ characters; new accounts need 8 (NIST SP 800-63B minimum). */
export const MIN_PASSWORD = 4;
export const MIN_NEW_PASSWORD = 8;

const key = (name: string) => name.trim().toLowerCase();
// scrypt runs on the libuv thread pool (async): the sync version froze the whole game world ~35 ms per login
const scryptAsync = (pw: string, salt: string) => new Promise<Buffer>((ok, ko) => crypto.scrypt(pw, salt, 32, (e, k) => (e ? ko(e) : ok(k))));
const hashPw = async (pw: string, salt: string) => (await scryptAsync(pw, salt)).toString("hex");
const same = async (pw: string, acc: Account) => crypto.timingSafeEqual(await scryptAsync(pw, acc.salt), Buffer.from(acc.hash, "hex"));

// Brute force and account spam: per address and per account (server/ratelimit.ts)
const loginTries = new KeyedLimiter(LOGIN_PER_SEC, LOGIN_BURST);
const signups = new KeyedLimiter(SIGNUP_PER_SEC, SIGNUP_BURST, 60 * 60_000);
const fails = new FailDelay();

function throttle(ip: string, k: string) {
  if (!isLocalIp(ip) && !loginTries.take(ip)) throw new Error("Too many login attempts. Wait a moment and try again.");
  const w = fails.wait(k);
  if (w) throw new Error(`Too many wrong passwords for this name. Try again in ${Math.ceil(w / 1000)} s.`);
}

async function check(acc: Account, k: string, pw: string) {
  if (!(await same(pw, acc))) {
    fails.fail(k);
    throw new Error("Wrong password for this name (or the name is taken)");
  }
  fails.ok(k);
}

/** Log in, or create the account if the name is free. Throws a message the player can read. */
export async function login(nameIn: unknown, pwIn: unknown, ip = ""): Promise<string> {
  const name = String(nameIn ?? "").trim();
  const pw = String(pwIn ?? "");
  if (!NAME_RE.test(name)) throw new Error("Name: 3 to 16 letters, numbers, spaces, - or _");
  if (pw.length < MIN_PASSWORD || pw.length > 64) throw new Error(`Password: at least ${MIN_PASSWORD} characters`);
  const k = key(name);
  throttle(ip, k);
  const acc = accounts[k];
  if (acc) {
    await check(acc, k, pw);
    return acc.name;
  }
  if (pw.length < MIN_NEW_PASSWORD) throw new Error(`New account: the password needs at least ${MIN_NEW_PASSWORD} characters`);
  if (!isLocalIp(ip) && !signups.take(ip)) throw new Error("Too many new accounts from this network. Try again later.");
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await hashPw(pw, salt);
  // Someone else may have taken the name while the hash was computed: then this is a normal login try
  const raced = accounts[k];
  if (raced) {
    await check(raced, k, pw);
    return raced.name;
  }
  accounts[k] = { name, salt, hash, created: Date.now(), heroes: {} };
  markDirty(k);
  return name;
}

/** Check a name + password without creating anything. Lists the saved heroes (class -> level). */
export async function peek(nameIn: unknown, pwIn: unknown, ip = ""): Promise<{ exists: boolean; heroes: Record<string, number> }> {
  const name = String(nameIn ?? "").trim();
  const pw = String(pwIn ?? "").slice(0, 64);
  const k = key(name);
  throttle(ip, k);
  const acc = accounts[k];
  if (!acc) return { exists: false, heroes: {} };
  await check(acc, k, pw);
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
  markDirty(key(name));
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
  markDirty(key(name));
}

/** Remember that this account emptied a chest until `refillAt`. */
export function markChest(name: string, id: string, refillAt: number) {
  const acc = accounts[key(name)];
  if (!acc) return;
  (acc.chests ??= {})[id] = refillAt;
  markDirty(key(name));
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
  markDirty(key(name));
}

let dirty = false;
function markDirty(_k: string) { dirty = true; }

let writing: Promise<void> | null = null;
let again = false;
/**
 * Write all saves to disk in the background (atomic: temp file then rename). The old sync write froze the game
 * world for the whole write every 5 s. A call while a write runs queues one more write right after it.
 */
export function flush(): Promise<void> {
  if (writing) { again = true; return writing; }
  dirty = false;
  const body = JSON.stringify(accounts);
  writing = (async () => {
    try {
      await fs.promises.mkdir(path.dirname(FILE), { recursive: true });
      await fs.promises.writeFile(FILE + ".tmp", body);
      if (closing) return; // the shutdown write (newer) already happened: never put older data over it
      await fs.promises.rename(FILE + ".tmp", FILE);
    } catch (e) {
      dirty = true;
      console.error("Could not write saves file:", e);
    }
  })().finally(() => {
    writing = null;
    if (again) { again = false; void flush(); }
  });
  return writing;
}

/** Write all saves now, blocking (only while the server shuts down, when nothing else must run first). */
let closing = false;
export function flushSync() {
  closing = true;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE + ".sync.tmp", JSON.stringify(accounts));
    fs.renameSync(FILE + ".sync.tmp", FILE);
    dirty = false;
  } catch (e) {
    console.error("Could not write saves file:", e);
  }
}
setInterval(() => { if (dirty) void flush(); }, 5000).unref();

/** All accounts as stored on disk (password hashes, never passwords), for the admin backup download. */
export function allAccounts() {
  return accounts;
}
