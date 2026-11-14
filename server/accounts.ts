import type { BountyState } from "../shared/bounty";
// Player accounts: name + password, with one saved hero per class.
// Saves live in a JSON file on the server (SAVE_FILE, default data/saves.json).
import path from "node:path";
import crypto from "node:crypto";
import { jsonStore, postgresStore, readJsonFile, Store } from "./store";
import { sendMail, mailReady } from "./mailer";
import { FailDelay, isLocalIp, KeyedLimiter, LOGIN_BURST, LOGIN_PER_SEC, SIGNUP_BURST, SIGNUP_PER_SEC } from "./ratelimit";

export interface HeroSave {
  color: number;
  xp: number; level: number; kills: number;
  xpv?: number; // XP curve version (shared/classes.ts XP_CURVE_VERSION); missing = the old 80 x level curve
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
  /** The Second Sun (CHAINS[6]), Act 2's story. */
  sunId?: number; sunStage?: number; sunCount?: number; sunVer?: number;
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
  /** The act the hero was in when saved (2 = the desert, shared/act2.ts): they log back in there. */
  act?: number;
  /** Bounty board hunt in progress (shared/bounty.ts) and how many this hero has finished. */
  bounty?: BountyState; bountyDone?: number;
  /** Gear wear 0-100: removed 2026-11-13, old saves may still carry it; ignored on load and no longer written. */
  wear?: number;
  /** Devour (shared/devour.ts): monsters eaten per family. */
  feast?: Record<string, number>;
  /** Summoner grimoire: the elements of golem 1 and 2, "fire,cold" (shared/summons.ts parseGrimoire). */
  grimoire?: string;
  /** Summoner skill tree version (shared/summons.ts SUMMONER_TREE): an older save gets its skill points back. */
  suTree?: number;
  /** Songweaver skill tree version (shared/songs.ts SONGWEAVER_TREE): an older save gets its skill points back. */
  swTree?: number;
  /** Songweaver mode (shared/songs.ts MODE_IDS); missing or no longer known = Major. */
  swMode?: string;
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
  /** Optional email for password resets (lower case). */
  email?: string;
  /** Pending password reset: sha256 of the emailed code, expiry (ms) and wrong tries so far. */
  reset?: { hash: string; until: number; tries: number };
}

export interface Stash { items: string[]; gold: number }

const FILE = path.resolve(process.env.SAVE_FILE ?? path.join(__dirname, "../data/saves.json"));
// JSON saves load right away (the bench and tests import this module directly); Postgres loads in initAccounts()
let store: Store<Account> = jsonStore<Account>(FILE);
let accounts: Record<string, Account> = process.env.DATABASE_URL ? {} : readJsonFile<Account>(FILE);

/** Opens the account store. With DATABASE_URL the accounts come from Postgres (imported once from SAVE_FILE). */
export async function initAccounts() {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  store = await postgresStore<Account>(url, FILE);
  accounts = await store.load();
  console.log(`Accounts: Postgres, ${Object.keys(accounts).length} account(s)`);
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
export async function peek(nameIn: unknown, pwIn: unknown, ip = ""): Promise<{ exists: boolean; heroes: Record<string, number>; email?: string }> {
  const name = String(nameIn ?? "").trim();
  const pw = String(pwIn ?? "").slice(0, 64);
  const k = key(name);
  throttle(ip, k);
  const acc = accounts[k];
  if (!acc) return { exists: false, heroes: {} };
  await check(acc, k, pw);
  const heroes: Record<string, number> = {};
  for (const [cls, h] of Object.entries(acc.heroes)) if (h) heroes[cls] = h.level || 1;
  return { exists: true, heroes, email: acc.email ?? "" };
}

// ---- Email + password reset ----
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,100}\.[^\s@]{2,24}$/;
export const RESET_MINUTES = 30;
const RESET_TRIES = 5;
// Reset mails: per address 5 an hour, per account 1 a minute (and 6 a day)
const resetAsks = new KeyedLimiter(5 / 3600, 5, 2 * 60 * 60_000);
const resetPerAcc = new KeyedLimiter(6 / 86400, 6, 25 * 60 * 60_000);
const resetLast = new Map<string, number>();
const codeHash = (code: string) => crypto.createHash("sha256").update(code).digest("hex");

/** Add, change or remove (empty) the account's email. Needs the password. */
export async function setEmail(nameIn: unknown, pwIn: unknown, emailIn: unknown, ip = ""): Promise<string> {
  const name = String(nameIn ?? "").trim();
  const pw = String(pwIn ?? "").slice(0, 64);
  const email = String(emailIn ?? "").trim().toLowerCase();
  if (email && (email.length > 190 || !EMAIL_RE.test(email))) throw new Error("That does not look like an email address");
  const k = key(name);
  throttle(ip, k);
  const acc = accounts[k];
  if (!acc) throw new Error("No account with this name");
  await check(acc, k, pw);
  if (email) acc.email = email; else delete acc.email;
  markDirty(k);
  return acc.email ?? "";
}

/** Hide most of an email: "murat@gmail.com" -> "mu***@gmail.com". */
export function maskEmail(e: string) {
  const [u, d] = e.split("@");
  return `${u.slice(0, Math.min(2, u.length - 1))}***@${d}`;
}

/**
 * Send a reset code to the email of the account(s) matching a name or an email. The answer never says
 * whether an account or email exists (only the masked email, when asked by name and one is set).
 */
export async function requestReset(whoIn: unknown, ip = "", now = Date.now()): Promise<{ sent: boolean; to?: string }> {
  const who = String(whoIn ?? "").trim().toLowerCase().slice(0, 190);
  if (!who) throw new Error("Type your name or your email");
  if (!mailReady()) throw new Error("Password reset by email is not ready yet. Try again soon.");
  if (!isLocalIp(ip) && !resetAsks.take(ip, now)) throw new Error("Too many reset requests. Try again later.");
  const byEmail = who.includes("@");
  const found = byEmail
    ? Object.entries(accounts).filter(([, a]) => a.email === who).slice(0, 5)
    : accounts[key(who)]?.email ? [[key(who), accounts[key(who)]] as [string, Account]] : [];
  const lines: string[] = [];
  let to = "";
  for (const [k, acc] of found) {
    if (now - (resetLast.get(k) ?? 0) < 60_000 || !resetPerAcc.take(k, now)) continue;
    resetLast.set(k, now);
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    acc.reset = { hash: codeHash(code), until: now + RESET_MINUTES * 60_000, tries: 0 };
    markDirty(k);
    lines.push(`Name: ${acc.name}\nCode: ${code}`);
    to = acc.email!;
  }
  if (!lines.length) return { sent: false };
  await sendMail({
    to,
    subject: "Your Pixel Town Brawl password reset code",
    text: `Someone asked to reset the password of your Pixel Town Brawl account.\n\n${lines.join("\n\n")}\n\n`
      + `Type the code on the login screen (Forgot password?) to choose a new password. It works for ${RESET_MINUTES} minutes.\n`
      + `If this was not you, ignore this email: your password stays the same.\n\nhttps://play.fmtpa.ch/`,
  });
  return byEmail ? { sent: true } : { sent: true, to: maskEmail(to) };
}

/** Set a new password with an emailed code. */
export async function resetPassword(nameIn: unknown, codeIn: unknown, pwIn: unknown, ip = "", now = Date.now()): Promise<string> {
  const name = String(nameIn ?? "").trim();
  const code = String(codeIn ?? "").replace(/\s/g, "");
  const pw = String(pwIn ?? "");
  if (pw.length < MIN_NEW_PASSWORD || pw.length > 64) throw new Error(`New password: at least ${MIN_NEW_PASSWORD} characters`);
  const k = key(name);
  if (!isLocalIp(ip) && !loginTries.take(ip)) throw new Error("Too many tries. Wait a moment and try again.");
  const acc = accounts[k];
  const r = acc?.reset;
  const bad = "This code is wrong or too old. Ask for a new one.";
  if (!acc || !r || r.until < now || r.tries >= RESET_TRIES) throw new Error(bad);
  const ok = /^\d{6}$/.test(code) && crypto.timingSafeEqual(Buffer.from(codeHash(code), "hex"), Buffer.from(r.hash, "hex"));
  if (!ok) {
    r.tries++;
    if (r.tries >= RESET_TRIES) delete acc.reset;
    markDirty(k);
    throw new Error(bad);
  }
  acc.salt = crypto.randomBytes(16).toString("hex");
  acc.hash = await hashPw(pw, acc.salt);
  delete acc.reset;
  fails.ok(k);
  markDirty(k);
  return acc.name;
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

/** Accounts changed since the last write. */
const dirty = new Set<string>();
function markDirty(k: string) { dirty.add(k); }

let writing: Promise<void> | null = null;
let again = false;
/**
 * Write the changed accounts in the background (JSON: whole file, atomic temp + rename; Postgres: changed rows in
 * one transaction). The old sync write froze the game world for the whole write every 5 s. A call while a write
 * runs queues one more write right after it.
 */
export function flush(): Promise<void> {
  if (writing) { again = true; return writing; }
  if (!dirty.size) return Promise.resolve();
  const keys = [...dirty];
  dirty.clear();
  // Postgres: copied now, so changes made while the write runs go into the next one
  // (the JSON store turns everything into text before its first await, which is the same snapshot)
  const changed: Record<string, Account> = {};
  if (store.kind === "postgres") for (const k of keys) if (accounts[k]) changed[k] = structuredClone(accounts[k]);
  writing = store.save(changed, accounts)
    .catch((e) => {
      for (const k of keys) dirty.add(k);
      console.error("Could not write saves:", e);
    })
    .finally(() => {
      writing = null;
      if (again) { again = false; void flush(); }
    });
  return writing;
}

/** Last write while the server shuts down: JSON writes everything at once (blocking), Postgres waits for its writes. */
export async function flushFinal() {
  if (store.saveSync) {
    try { store.saveSync(accounts); dirty.clear(); } catch (e) { console.error("Could not write saves file:", e); }
    return;
  }
  while (writing || dirty.size) await (writing ?? flush());
}
setInterval(() => { if (dirty.size) void flush(); }, 5000).unref();

/** All accounts as stored on disk (password hashes, never passwords), for the admin backup download. */
export function allAccounts() {
  return accounts;
}
