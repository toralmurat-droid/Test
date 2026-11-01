/**
 * Player ideas (phase 1 of the player change requests design): players suggest one improvement a day,
 * everyone votes, and every hour the best-scored idea wins. Winners are built by hand for now
 * (later by a bot that opens a pull request). This file is pure logic, shared by server and client.
 */

export const IDEA = {
  maxChars: 280,
  minChars: 10,
  minLevel: 3, // to submit (stops throwaway heroes spamming)
  perDay: 1, // per player name and per network address
  globalPerDay: 10, // whole game
  winMinVoters: 5,
  winMinScore: 3,
  removeAtScore: -5,
  expireMs: 24 * 3600_000,
  roundMs: 3600_000, // a winner every hour, on the hour
  historyKept: 30, // finished ideas sent to players (the full log stays on the server)
};

export type IdeaStatus = "open" | "won" | "votedDown" | "expired" | "rejected" | "building" | "live" | "reverted";

export const STATUS_TEXT: Record<IdeaStatus, string> = {
  open: "Open for votes",
  won: "Won",
  votedDown: "Voted down",
  expired: "Expired",
  rejected: "Rejected",
  building: "Being built",
  live: "Live",
  reverted: "Reverted",
};

export interface Idea {
  id: number;
  text: string;
  author: string; // display name
  authorKey: string; // lowercased name, for "my ideas"
  createdAt: number;
  status: IdeaStatus;
  votes: Record<string, 1 | -1>; // voter key -> vote
  wonAt?: number;
  closedAt?: number;
  reason?: string;
}

export interface IdeaLog {
  nextId: number;
  lastRound: number; // start (ms) of the last hourly round that was decided
  ideas: Idea[];
  /** day (UTC "YYYY-MM-DD") -> keys that already submitted that day */
  submitted: Record<string, string[]>;
}

export const emptyLog = (now = Date.now()): IdeaLog => ({ nextId: 1, lastRound: roundStart(now), ideas: [], submitted: {} });

export const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
export const roundStart = (t: number) => Math.floor(t / IDEA.roundMs) * IDEA.roundMs;
export const nextRound = (t: number) => roundStart(t) + IDEA.roundMs;
export const nextDay = (t: number) => Date.parse(dayKey(t) + "T00:00:00Z") + 24 * 3600_000;

export function score(i: Idea) {
  let s = 0;
  for (const v of Object.values(i.votes)) s += v;
  return s;
}
export const voters = (i: Idea) => Object.keys(i.votes).length;

const BAD_WORDS = ["fuck", "shit", "bitch", "cunt", "nigger", "faggot", "retard", "putain", "salope", "connard", "encule"];
const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export type Result = { ok: true; idea?: Idea } | { ok: false; error: string };

/** Who is asking: the player's name and (if known) network address. Both count toward the daily limit. */
export interface Asker { name: string; level: number; addr?: string }

const keysOf = (a: Asker) => {
  const keys = ["n:" + a.name.trim().toLowerCase()];
  if (a.addr) keys.push("a:" + a.addr);
  return keys;
};
/** One vote per network address when known (stops alt heroes voting twice), else per name. */
export const voterKey = (a: Asker) => (a.addr ? "a:" + a.addr : "n:" + a.name.trim().toLowerCase());

export function cleanText(raw: unknown) {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
}

/** When the asker may submit again (0 = now). */
export function nextSubmitAt(log: IdeaLog, a: Asker, now: number) {
  const done = log.submitted[dayKey(now)] ?? [];
  return keysOf(a).some((k) => done.includes(k)) ? nextDay(now) : 0;
}

export function submit(log: IdeaLog, a: Asker, raw: unknown, now: number): Result {
  const text = cleanText(raw);
  if (a.level < IDEA.minLevel) return { ok: false, error: `Reach level ${IDEA.minLevel} to suggest ideas.` };
  if (text.length < IDEA.minChars) return { ok: false, error: `Ideas need at least ${IDEA.minChars} characters.` };
  if (text.length > IDEA.maxChars) return { ok: false, error: `Ideas can be at most ${IDEA.maxChars} characters.` };
  if (nextSubmitAt(log, a, now)) return { ok: false, error: `You already suggested an idea today. Next one in ${waitText(nextDay(now) - now)}.` };
  const day = dayKey(now);
  const today = log.submitted[day] ?? [];
  const todayCount = log.ideas.filter((i) => dayKey(i.createdAt) === day).length;
  if (todayCount >= IDEA.globalPerDay) return { ok: false, error: "The idea box is full for today. Try again tomorrow!" };
  const norm = normalize(text);
  if (BAD_WORDS.some((w) => norm.split(" ").includes(w))) return { ok: false, error: "Please keep ideas friendly." };
  const dup = log.ideas.find((i) => i.status === "open" && normalize(i.text) === norm);
  if (dup) return { ok: false, error: `That's already idea #${dup.id}. Vote for it instead!` };
  const idea: Idea = {
    id: log.nextId++, text, author: a.name, authorKey: a.name.trim().toLowerCase(), createdAt: now, status: "open", votes: {},
  };
  log.ideas.push(idea);
  log.submitted = { [day]: [...today, ...keysOf(a)] }; // only today's list is needed
  return { ok: true, idea };
}

/** v = 1 up, -1 down, 0 remove the vote. */
export function vote(log: IdeaLog, a: Asker, id: number, v: number, now: number): Result {
  const idea = log.ideas.find((i) => i.id === id);
  if (!idea) return { ok: false, error: `There is no idea #${id}.` };
  if (idea.status !== "open") return { ok: false, error: `Idea #${id} is closed (${STATUS_TEXT[idea.status]}).` };
  if (idea.authorKey === a.name.trim().toLowerCase()) return { ok: false, error: "You can't vote on your own idea." };
  const k = voterKey(a);
  if (v === 1 || v === -1) idea.votes[k] = v;
  else delete idea.votes[k];
  if (score(idea) <= IDEA.removeAtScore) close(idea, "votedDown", now);
  return { ok: true, idea };
}

function close(i: Idea, status: IdeaStatus, now: number, reason?: string) {
  i.status = status;
  i.closedAt = now;
  if (reason) i.reason = reason;
}

/** Best open idea that qualifies to win: highest score, then most voters, then oldest. */
export function leader(log: IdeaLog) {
  const ok = log.ideas.filter((i) => i.status === "open" && voters(i) >= IDEA.winMinVoters && score(i) >= IDEA.winMinScore);
  ok.sort((a, b) => score(b) - score(a) || voters(b) - voters(a) || a.createdAt - b.createdAt);
  return ok[0];
}

/**
 * Call regularly (every few seconds). Expires old ideas and, once per hour, picks the winner.
 * Returns what happened so the server can announce it.
 */
export function tick(log: IdeaLog, now: number) {
  const winners: Idea[] = [];
  const expired: Idea[] = [];
  // Decide every round that ended since the last check (normally one; more if the server was down)
  while (log.lastRound + IDEA.roundMs <= now) {
    const end = log.lastRound + IDEA.roundMs;
    expire(log, end, expired);
    const w = leader(log);
    if (w) { w.status = "won"; w.wonAt = end; winners.push(w); }
    log.lastRound = end;
  }
  expire(log, now, expired);
  return { winners, expired };
}

function expire(log: IdeaLog, t: number, out: Idea[]) {
  for (const i of log.ideas) if (i.status === "open" && t - i.createdAt >= IDEA.expireMs) { close(i, "expired", t); out.push(i); }
}

/** What one player sees on the Ideas board. */
export interface IdeaView {
  id: number; text: string; author: string; status: IdeaStatus; score: number; voters: number;
  createdAt: number; wonAt?: number; reason?: string; mine: boolean; myVote: number;
}
export interface BoardView {
  now: number; nextRound: number; nextSubmitAt: number; canSubmit: boolean; minLevel: number;
  open: IdeaView[]; history: IdeaView[]; lastWinner?: IdeaView;
}

export function boardFor(log: IdeaLog, a: Asker, now: number): BoardView {
  const me = a.name.trim().toLowerCase(), vk = voterKey(a);
  const view = (i: Idea): IdeaView => ({
    id: i.id, text: i.text, author: i.author, status: i.status, score: score(i), voters: voters(i),
    createdAt: i.createdAt, wonAt: i.wonAt, reason: i.reason, mine: i.authorKey === me, myVote: i.votes[vk] ?? 0,
  });
  const open = log.ideas.filter((i) => i.status === "open").map(view);
  const done = log.ideas.filter((i) => i.status !== "open").sort((x, y) => (y.closedAt ?? y.wonAt ?? 0) - (x.closedAt ?? x.wonAt ?? 0));
  const winners = log.ideas.filter((i) => i.wonAt).sort((x, y) => y.wonAt! - x.wonAt!);
  const mineDone = done.filter((i) => i.authorKey === me);
  const history = [...new Set([...done.slice(0, IDEA.historyKept), ...mineDone])].map(view);
  const nextAt = nextSubmitAt(log, a, now);
  return {
    now, nextRound: nextRound(now), nextSubmitAt: nextAt, canSubmit: !nextAt && a.level >= IDEA.minLevel, minLevel: IDEA.minLevel,
    open, history, lastWinner: winners[0] ? view(winners[0]) : undefined,
  };
}

export function waitText(ms: number) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}
