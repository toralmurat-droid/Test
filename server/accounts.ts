import type { BountyState } from "../shared/bounty";
import type { RumourState } from "../shared/rumours";
import type { WritState } from "../shared/war/writs";
import type { MentorState } from "../shared/quests";
// Player accounts: name + password, with one saved hero per class.
// Saves live in a JSON file on the server (SAVE_FILE, default data/saves.json).
import path from "node:path";
import crypto from "node:crypto";
import { jsonStore, openLeases, postgresStore, readJsonFile, Store } from "./store";
import { AccountGuard, accountLeasesOn, ACCT, type Claim } from "./accountGuard";
import type { LeaseBackend } from "./lease";
import { ACCOUNT_API, ACCOUNT_MIN_READER, accountAccess } from "../shared/accountApi";
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
  /** The act the hero was in when saved (2 = the desert, 3 = the moors, 4 = the badlands, 5 = the sinkholes, 6 = the Crown, shared/act2.ts): they log back in there. */
  act?: number;
  /** Bounty board hunt in progress (shared/bounty.ts) and how many this hero has finished. */
  bounty?: BountyState; bountyDone?: number;
  /** Clan war oath (shared/war/clans.ts key) and when it was sworn (ms). */
  clan?: string; clanAt?: number;
  /** Clan war renown (shared/war/renown.ts); kept when the hero changes clan. */
  renown?: number;
  /** The capital bound as home (W7, a shared/war/clans.ts key with a built city in shared/capitals.ts); missing = none. */
  home?: string;
  /** The highest renown rank a capital's leader paid this hero for (shared/capitals.ts CITY.rankGold); missing = none paid. */
  capPaid?: number;
  /** Feuds per clan (shared/war/feuds.ts): grudge end, kill points and their last step (ms), UTC day a bounty was paid on them; missing = none. */
  feud?: Partial<Record<string, { until?: number; pts?: number; at?: number; paid?: number }>>;
  /** Feud bounties this hero claimed: the UTC day and how many that day (shared/war/feuds.ts FEUD.bounty.perDay); missing = none. */
  claimDay?: number; claims?: number;
  /** War writ in progress (shared/war/writs.ts), and the UTC day / count of writs finished (the daily limit); missing = none. */
  writ?: WritState; writDay?: number; writN?: number;
  /** Gear wear 0-100: removed 2026-11-13, old saves may still carry it; ignored on load and no longer written. */
  wear?: number;
  /** Devour (shared/devour.ts): monsters eaten per family. */
  feast?: Record<string, number>;
  /** Summoner grimoire: the elements of golem 1 and 2, "fire,cold" (shared/summons.ts parseGrimoire). */
  grimoire?: string;
  /** Summoner skill tree version (shared/summons.ts SUMMONER_TREE): an older save gets its skill points back. */
  suTree?: number;
  /** Choices made in quests, 2 bits each (shared/questSteps.ts CHOICES), kept in the owner-only Player.me.flags; missing = none made. */
  flags?: number;
  /** Cosmetics: title and look traits (shared/cosmetics.ts), kept in the public Player.cosm; missing = none. */
  cosm?: number;
  /** Tavern Rumours (shared/rumours.ts): the day, its offers' level, done bits, the one under way, all finished; another day's loads fresh. */
  rumour?: RumourState;
  /** Titles earned, bit i = shared/cosmetics.ts TITLES[i] (the shown one is in `cosm`); missing = only the shown title. */
  titles?: number;
  /** The Apprentice (shared/quests.ts MENTOR): mentoring switched on, recruits counted, their account names (<= 50); missing = off, none. */
  mentor?: MentorState;
  /** Songweaver skill tree version (shared/songs.ts SONGWEAVER_TREE): an older save gets its skill points back. */
  swTree?: number;
  /** Songweaver mode (shared/songs.ts MODE_IDS); missing or no longer known = Major. */
  swMode?: string;
  /** Songweaver kit version (server/songs.ts SW_KIT_VERSION): missing or older = migrateSongweaver on load. */
  swKit?: number;
  /** Songweaver: the songs she collected (shared/songbook.ts SongId); missing = none. */
  swSongs?: string[];
  /** Songweaver: her lute-maker materials, id -> count (shared/lute.ts MaterialId); missing = none. */
  swMats?: Record<string, number>;
}

export interface Account {
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
  /** Account save version (shared/accountApi.ts ACCOUNT_API) of the build that last wrote it; missing = 1 (older saves). */
  av?: number;
  /** The oldest ACCOUNT_API that may show (never write) this account; missing = `av`. */
  minReader?: number;
}

/**
 * Every HeroSave field this build knows. A saved hero's other fields (added by a newer build, an "Age" running side by
 * side) are kept by saveHero; known ones the snapshot leaves out (no clan, `wear`, ...) are dropped as before.
 */
const HERO_KEYS: Record<keyof HeroSave, 1> = {
  color: 1, xp: 1, level: 1, kills: 1, xpv: 1, gold: 1, potions: 1, mpotions: 1, pots: 1, ptSta: 1, ptStr: 1, ptMag: 1, ptDex: 1,
  weapon: 1, armour: 1, shoes: 1, hat: 1, shield: 1, ranged: 1, bag: 1, talents: 1, slots: 1,
  questId: 1, questStage: 1, questCount: 1, questVer: 1, boneId: 1, boneStage: 1, boneCount: 1, boneVer: 1,
  redId: 1, redStage: 1, redCount: 1, redVer: 1, sunId: 1, sunStage: 1, sunCount: 1, sunVer: 1, kit: 1,
  tutId: 1, tutStage: 1, tutCount: 1, tutVer: 1, crownId: 1, crownStage: 1, crownCount: 1, crownVer: 1,
  beastId: 1, beastStage: 1, beastCount: 1, beastVer: 1, portals: 1, act: 1, bounty: 1, bountyDone: 1,
  clan: 1, clanAt: 1, renown: 1, home: 1, capPaid: 1, feud: 1, claimDay: 1, claims: 1, writ: 1, writDay: 1, writN: 1,
  wear: 1, feast: 1, grimoire: 1, suTree: 1, flags: 1, cosm: 1, rumour: 1, titles: 1, mentor: 1,
  swTree: 1, swMode: 1, swKit: 1, swSongs: 1, swMats: 1,
};

/** The new hero save, with the fields of the old one this build does not know (a newer Age's) carried over. */
export function keepUnknown(old: HeroSave | undefined, hero: HeroSave): HeroSave {
  if (!old || typeof old !== "object") return hero;
  const out: Record<string, unknown> = {};
  for (const [f, v] of Object.entries(old)) if (!Object.hasOwn(HERO_KEYS, f)) out[f] = v;
  return Object.assign(out, hero) as HeroSave;
}

/** Login and edits of an account a newer build wrote (shared/accountApi.ts): this build never writes it. */
export const NEW_AGE = "This hero lives in the new Age: play it there";
/** This build may write the account (its `av` is ACCOUNT_API or older). */
const writable = (acc: Account | undefined): acc is Account => !!acc && accountAccess(acc) === "write";
function mustWrite(acc: Account) { if (!writable(acc)) throw new Error(NEW_AGE); }

export interface Stash { items: string[]; gold: number }

const FILE = path.resolve(process.env.SAVE_FILE ?? path.join(__dirname, "../data/saves.json"));
// JSON saves load right away (the bench and tests import this module directly); Postgres loads in initAccounts()
let store: Store<Account> = jsonStore<Account>(FILE);
let accounts: Record<string, Account> = process.env.DATABASE_URL ? {} : readJsonFile<Account>(FILE);

/**
 * One account, one server (server/accountGuard.ts): set when account leases are on (Postgres and AGE_SLOT or
 * ACCOUNT_LEASES=1). Then memory holds only the accounts read lately: every check reads the row afresh unless this
 * server holds the account, and only held accounts are written. Undefined: today's single server, nothing changes.
 */
let guard: AccountGuard | undefined;

/**
 * Opens the account store. With DATABASE_URL the accounts come from Postgres (imported once from SAVE_FILE).
 * `shared`: tests (a store and a lease backend of their own, account leases on).
 */
export async function initAccounts(shared?: { store: Store<Account>; leases: LeaseBackend; holder?: string; retryMs?: number }) {
  if (shared) {
    store = shared.store; accounts = {}; dirty.clear(); since.clear();
    guard = new AccountGuard(shared.leases, guardHooks, shared.holder, { retryMs: shared.retryMs });
    return;
  }
  const url = process.env.DATABASE_URL;
  if (process.env.AGE_SLOT && !url) throw new Error("AGE_SLOT is set but DATABASE_URL is not: an Age slot needs the shared Postgres");
  if (!url) return;
  store = await postgresStore<Account>(url, FILE);
  if (accountLeasesOn()) {
    guard = new AccountGuard(await openLeases(url), guardHooks);
    guard.start();
    console.log(`Accounts: Postgres, shared (one account, one server; holder ${guard.holder})`);
    return;
  }
  accounts = await store.load();
  console.log(`Accounts: Postgres, ${Object.keys(accounts).length} account(s)`);
}

/** Account leases are on (server/TownRoom.ts claims and leaves accounts only then). */
export const accountsShared = () => !!guard;

/** The account as saved, unless this server holds it (then memory is newest). Shared mode only. */
async function fresh(k: string): Promise<Account | undefined> {
  if (guard!.inUse(k)) return accounts[k];
  const row = await store.loadOne!(k);
  if (row) accounts[k] = row; else delete accounts[k];
  return row;
}

const guardHooks = {
  async reload(k: string) { const row = await store.loadOne!(k); if (row) accounts[k] = row; },
  settle: (k: string) => settle(k),
  unsaved: (k: string) => dirty.has(k),
  lost: (k: string) => { for (const f of lostListeners) f(k); },
};
const lostListeners: ((k: string) => void)[] = [];
/** Another server took this account (key: lower-case name) while it was in use here: server/TownRoom.ts sends its players away. */
export function onAccountLost(f: (k: string) => void) { lostListeners.push(f); }

/**
 * Shared mode: a hero joins (`play`) or leaves. "playing": already in a room on this server; "elsewhere": another
 * server has the account. Off: always "mine" (nothing to do). Every answer but those two needs one `leaveAccount`.
 */
export async function claimAccount(name: string, play = true): Promise<Claim> {
  if (!guard) return "mine";
  const k = key(name), c = await guard.claim(k, play);
  // (the claim may have reloaded the row: a newer build may have written it since the login read it)
  if ((c === "mine" || c === "fresh") && accounts[k] && !writable(accounts[k])) { await guard.leave(k, play); throw new Error(NEW_AGE); }
  return c;
}
/** The session ends: the last one here saves the account, waits for the commit, then gives its lease back. */
export function leaveAccount(name: string, play = true): Promise<void> {
  return guard ? guard.leave(key(name), play) : Promise.resolve();
}
/**
 * Ages crossing (server/ageCross.ts): waits until this account's changes are committed, before its hero is sent to
 * another Age (which reads the row). False when the write failed, was refused, or another server took the account.
 */
export async function settleAccount(name: string): Promise<boolean> {
  const k = key(name);
  if (guard?.takenElsewhere(k)) return false;
  return (await settle(k)) && !guard?.takenElsewhere(k);
}
/** Renews the account leases now (tests; the guard's own timer does it every 15 s). */
export const renewAccounts = () => (guard ? guard.renewAll() : Promise.resolve());
/** Shutting down, after flushFinal: gives back every account lease (not those of accounts left unsaved). */
export function releaseAccounts(): Promise<void> {
  return guard ? guard.releaseAll() : Promise.resolve();
}

/**
 * An account change from the login screen (email, reset) in shared mode: holds the account while it changes, so a
 * server where it plays is never overwritten. Held elsewhere: refused. The change is saved before the lease goes back.
 */
async function edit<T>(k: string, fn: (acc: Account) => T | Promise<T>): Promise<T> {
  const g = guard!;
  if ((await g.claim(k)) === "elsewhere") throw new Error("Leave the game first, then try again");
  try {
    const acc = accounts[k];
    if (!acc) throw new Error("No account with this name");
    mustWrite(acc);
    return await fn(acc);
  } finally {
    await g.leave(k);
  }
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
  const acc = guard ? await fresh(k) : accounts[k];
  if (acc) {
    await check(acc, k, pw);
    mustWrite(acc);
    return acc.name;
  }
  if (pw.length < MIN_NEW_PASSWORD) throw new Error(`New account: the password needs at least ${MIN_NEW_PASSWORD} characters`);
  if (!isLocalIp(ip) && !signups.take(ip)) throw new Error("Too many new accounts from this network. Try again later.");
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await hashPw(pw, salt);
  if (guard) {
    // Shared: written at once, only if no server made the name meanwhile; if one did, this is a normal login try
    const made: Account = { name, salt, hash, created: Date.now(), heroes: {}, av: ACCOUNT_API, minReader: ACCOUNT_MIN_READER };
    if (await store.insertNew!(k, made)) { accounts[k] = made; return name; }
    const other = await fresh(k);
    if (!other) throw new Error("Could not create the account. Try again.");
    await check(other, k, pw);
    mustWrite(other);
    return other.name;
  }
  // Someone else may have taken the name while the hash was computed: then this is a normal login try
  const raced = accounts[k];
  if (raced) {
    await check(raced, k, pw);
    mustWrite(raced);
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
  const acc = guard ? await fresh(k) : accounts[k];
  if (!acc) return { exists: false, heroes: {} };
  await check(acc, k, pw);
  if (accountAccess(acc) === "hide") throw new Error(NEW_AGE); // (a newer account that allows it is still listed: showing writes nothing)
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
  const acc = guard ? await fresh(k) : accounts[k];
  if (!acc) throw new Error("No account with this name");
  await check(acc, k, pw);
  const set = (a: Account) => {
    if (email) a.email = email; else delete a.email;
    markDirty(k);
    return a.email ?? "";
  };
  if (!guard) { mustWrite(acc); return set(acc); }
  // (reloaded under the lease: a password changed on another server meanwhile is checked again)
  return edit(k, async (a) => { if (a.hash !== acc.hash) await check(a, k, pw); return set(a); });
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
  const found = guard ? await sharedFind(who, byEmail) : byEmail
    ? Object.entries(accounts).filter(([, a]) => a.email === who).slice(0, 5)
    : accounts[key(who)]?.email ? [[key(who), accounts[key(who)]] as [string, Account]] : [];
  const lines: string[] = [];
  let to = "";
  for (const [k, found1] of found) {
    if (now - (resetLast.get(k) ?? 0) < 60_000 || !resetPerAcc.take(k, now)) continue;
    resetLast.set(k, now);
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const give = (acc: Account) => {
      if (!acc.email || !writable(acc)) return false;
      acc.reset = { hash: codeHash(code), until: now + RESET_MINUTES * 60_000, tries: 0 };
      markDirty(k);
      lines.push(`Name: ${acc.name}\nCode: ${code}`);
      to = acc.email;
      return true;
    };
    // (shared: an account playing on another server gets no code; the answer looks the same as ever)
    if (!guard) give(found1); else await edit(k, give).catch(() => false);
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

/** Shared mode: the accounts a reset asks for, read from the store (by email: an SQL lookup, not every account). */
async function sharedFind(who: string, byEmail: boolean): Promise<[string, Account][]> {
  if (!byEmail) { const k = key(who), a = await fresh(k); return a?.email ? [[k, a]] : []; }
  const rows = Object.entries(await store.findBy!("email", who, 5));
  for (const [k, a] of rows) if (!guard!.inUse(k)) accounts[k] = a;
  return rows.map(([k, a]) => [k, guard!.inUse(k) ? accounts[k] ?? a : a]);
}

/** Set a new password with an emailed code. */
export async function resetPassword(nameIn: unknown, codeIn: unknown, pwIn: unknown, ip = "", now = Date.now()): Promise<string> {
  const name = String(nameIn ?? "").trim();
  const code = String(codeIn ?? "").replace(/\s/g, "");
  const pw = String(pwIn ?? "");
  if (pw.length < MIN_NEW_PASSWORD || pw.length > 64) throw new Error(`New password: at least ${MIN_NEW_PASSWORD} characters`);
  const k = key(name);
  if (!isLocalIp(ip) && !loginTries.take(ip)) throw new Error("Too many tries. Wait a moment and try again.");
  const bad = "This code is wrong or too old. Ask for a new one.";
  const pending = (a: Account | undefined): a is Account => !!a?.reset && a.reset.until >= now && a.reset.tries < RESET_TRIES;
  const use = async (acc: Account | undefined) => {
    const r = acc?.reset;
    if (!acc || !r || r.until < now || r.tries >= RESET_TRIES) throw new Error(bad);
    mustWrite(acc);
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
  };
  if (!guard) return use(accounts[k]);
  // Shared: the account is held only when a code is pending (a stranger's guess at a name takes no lease)
  if (!pending(await fresh(k))) throw new Error(bad);
  return edit(k, use);
}

export function loadHero(name: string, cls: string): HeroSave | undefined {
  return accounts[key(name)]?.heroes[cls];
}

/**
 * Stores the hero (the snapshot of server/TownRoom.ts), keeping the saved hero's fields this build does not know;
 * `reset` (New game): the hero starts over, nothing of the old one is kept.
 */
export function saveHero(name: string, cls: string, hero: HeroSave, reset = false) {
  const acc = accounts[key(name)];
  if (!writable(acc)) return;
  acc.heroes[cls] = reset ? hero : keepUnknown(acc.heroes[cls], hero);
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
  if (!writable(acc) || !acc.chests) return;
  delete acc.chests;
  markDirty(key(name));
}

/** Remember that this account emptied a chest until `refillAt`. */
export function markChest(name: string, id: string, refillAt: number) {
  const acc = accounts[key(name)];
  if (!writable(acc)) return;
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
  if (!writable(acc)) return;
  acc.stash = { items: [...stash.items], gold: stash.gold };
  acc.heroes[cls] = keepUnknown(acc.heroes[cls], hero);
  markDirty(key(name));
}

/** Accounts changed since the last write. */
const dirty = new Set<string>();
/** Queues the account's write, stamped with this build's save version; never one a newer build wrote (shared/accountApi.ts). */
function markDirty(k: string) {
  const acc = accounts[k];
  if (acc && !writable(acc)) { console.error(`Accounts: ${k} was saved by a newer build: not written here`); return; }
  if (acc) { acc.av = ACCOUNT_API; acc.minReader = ACCOUNT_MIN_READER; }
  if (!dirty.has(k)) since.set(k, Date.now());
  dirty.add(k);
}
/** When each unsaved account first changed (flush lag, /admin/ages.json): waiting ones, and those in the write under way. */
const since = new Map<string, number>(), flying = new Map<string, number>();
/** A write did not go through: the account's oldest change is still unsaved. */
function redirty(k: string) {
  dirty.add(k);
  const t = flying.get(k);
  if (t !== undefined) since.set(k, Math.min(since.get(k) ?? t, t));
}
/** Since boot: failed account writes, and accounts a fenced write refused (server/agesStatus.ts). */
const flushStats = { failures: 0, refused: 0 };

/**
 * Account saving at a glance (server/agesStatus.ts): unsaved accounts, the oldest unsaved change's age (ms, 0 when
 * none), failures since boot, and with account leases on the guard's counters and the leases held.
 */
export function accountStats(now = Date.now()) {
  let oldest = now;
  for (const t of since.values()) oldest = Math.min(oldest, t);
  for (const t of flying.values()) oldest = Math.min(oldest, t);
  return {
    shared: !!guard, dirty: dirty.size, lagMs: now - oldest, failures: flushStats.failures, refused: flushStats.refused,
    holder: guard?.holder, leasesHeld: guard?.held() ?? 0, inUse: guard?.inUseCount(), claims: guard ? { ...guard.stats } : undefined,
  };
}

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
  for (const k of keys) { flying.set(k, since.get(k) ?? Date.now()); since.delete(k); }
  // Postgres: copied now, so changes made while the write runs go into the next one
  // (the JSON store turns everything into text before its first await, which is the same snapshot)
  const changed: Record<string, Account> = {};
  // (never an account a newer build wrote: markDirty refuses them, this is the last fence)
  if (store.kind === "postgres") for (const k of keys) if (writable(accounts[k])) changed[k] = structuredClone(accounts[k]);
  // Shared (server/accountGuard.ts): only accounts this server holds are written. A refused one whose lease only lapsed
  // (no renewal showed another holder) is kept for the next write, and its lease with it (settle stays false); one
  // another server took is given up
  const g = guard;
  const save = g
    ? store.saveFenced!(changed, g.holder, ACCT).then((refused) => {
      flushStats.refused += refused.length;
      const kept = refused.filter((k) => g.retryWrite(k)), lost = refused.filter((k) => !g.retryWrite(k));
      for (const k of kept) redirty(k);
      if (kept.length) console.error(`Accounts: not saved yet, the lease ran out (tried again after it is renewed): ${kept.join(", ")}`);
      if (lost.length) console.error(`Accounts: not saved, another server has them now (or the row is missing): ${lost.join(", ")}`);
    })
    : store.save(changed, accounts);
  writing = save
    .catch((e) => {
      for (const k of keys) redirty(k);
      flushStats.failures++;
      console.error("Could not write saves:", e);
    })
    .finally(() => {
      flying.clear();
      writing = null;
      if (again) { again = false; void flush(); }
    });
  return writing;
}

/** Last write while the server shuts down: JSON writes everything at once (blocking), Postgres waits for its writes. */
export async function flushFinal() {
  if (store.saveSync) {
    try { store.saveSync(accounts); dirty.clear(); since.clear(); } catch (e) { flushStats.failures++; console.error("Could not write saves file:", e); }
    return;
  }
  while (writing || dirty.size) await (writing ?? flush());
}
setInterval(() => { if (dirty.size) void flush(); }, 5000).unref();

/**
 * Waits until the account's changes are committed (a write under way that may carry them, then one more if they are
 * still waiting). False when the writes failed: the account must not be let go yet (server/accountGuard.ts).
 */
async function settle(k: string): Promise<boolean> {
  for (let i = 0; i < 8; i++) {
    if (writing) { await writing; continue; }
    if (!dirty.has(k)) return true;
    await flush();
    if (dirty.has(k)) return false; // (the write failed or was refused for now: keep the lease, try again at the renewal)
  }
  return !writing && !dirty.has(k);
}

/** The admin backup, every account as stored (password hashes, never passwords). Shared mode reads the table (memory holds only some), with this server's held ones on top. */
export async function backupAccounts(): Promise<Record<string, Account>> {
  if (!guard) return accounts;
  const all = await store.load();
  for (const [k, a] of Object.entries(accounts)) if (guard.inUse(k)) all[k] = a;
  return all;
}

