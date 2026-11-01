import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { emptyLog, IdeaLog, score, voters } from "../shared/ideas";

/**
 * The idea log lives in one JSON file so it survives restarts (data/ideas.json, or IDEAS_FILE).
 * Network addresses are only stored hashed.
 */
const FILE = path.resolve(process.env.IDEAS_FILE ?? path.join(__dirname, "../data/ideas.json"));

function load(): IdeaLog {
  try {
    const log = JSON.parse(fs.readFileSync(FILE, "utf8")) as IdeaLog;
    if (Array.isArray(log.ideas)) return { ...emptyLog(), ...log };
  } catch (e: any) {
    if (e?.code !== "ENOENT") console.error("Could not read the idea log, starting a new one:", e?.message);
  }
  return emptyLog();
}

export const ideaLog: IdeaLog = load();

let timer: NodeJS.Timeout | undefined;
/** Saves soon (several changes in a row are written once). */
export function saveIdeas() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      const tmp = FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(ideaLog, null, 1));
      fs.renameSync(tmp, FILE); // never leaves a half-written file
    } catch (e: any) {
      console.error("Could not save the idea log:", e?.message);
    }
  }, 500);
}

const SALT = process.env.IDEAS_SALT ?? "pixel-town-ideas";
export const hashAddr = (addr?: string) => (addr ? crypto.createHash("sha256").update(SALT + addr).digest("hex").slice(0, 16) : undefined);

/** The public log (no voter details), served at /ideas.json for Murat and for later tools. */
export function publicLog() {
  return ideaLog.ideas.map((i) => ({
    id: i.id, date: new Date(i.createdAt).toISOString(), author: i.author, text: i.text, status: i.status,
    score: score(i), voters: voters(i), wonAt: i.wonAt ? new Date(i.wonAt).toISOString() : undefined, reason: i.reason,
  })).reverse();
}
