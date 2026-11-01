// Checks the player-ideas rules in shared/ideas.ts. Run: npx tsx tools/ideas-check.ts
import assert from "node:assert/strict";
import { boardFor, emptyLog, IDEA, submit, tick, vote } from "../shared/ideas";

const H = 3600_000;
const t0 = Date.parse("2026-11-02T10:15:00Z");
const log = emptyLog(t0);
const p = (name: string, addr?: string, level = 5) => ({ name, level, addr });

// Submitting: level, length, one a day per name and per address
assert.equal(submit(log, p("Low", undefined, 2), "add a fishing emote", t0).ok, false);
assert.equal(submit(log, p("Ann"), "short", t0).ok, false);
assert.equal(submit(log, p("Ann"), "x".repeat(IDEA.maxChars + 1), t0).ok, false);
const a = submit(log, p("Ann", "ip1"), "Add a fishing emote at the pond", t0);
assert.ok(a.ok && a.idea!.id === 1);
assert.equal(submit(log, p("ann"), "Another idea about boats", t0).ok, false, "same name, same day");
assert.equal(submit(log, p("AltOfAnn", "ip1"), "Another idea about boats", t0).ok, false, "same address, same day");
assert.equal(submit(log, p("Bob"), "add a  FISHING emote at the pond!", t0).ok, false, "duplicate");
assert.equal(submit(log, p("Bob"), "this is shit honestly", t0).ok, false, "bad word");
assert.ok(submit(log, p("Bob"), "Snowy weather in winter", t0).ok);
assert.ok(submit(log, p("Ann", "ip1"), "Next day idea about boats", t0 + 24 * H).ok, "new day");

// Voting: one vote per voter, changeable, not on your own idea
assert.equal(vote(log, p("Ann", "ip1"), 1, 1, t0).ok, false, "own idea");
for (const n of ["V1", "V2", "V3", "V4"]) assert.ok(vote(log, p(n, "ip-" + n), 1, 1, t0).ok);
assert.ok(vote(log, p("V4", "ip-V4"), 1, 1, t0).ok);
assert.ok(vote(log, p("V4alt", "ip-V4"), 1, -1, t0).ok, "same address changes its vote");
let b = boardFor(log, p("V1", "ip-V1"), t0);
assert.equal(b.open.find((i) => i.id === 1)!.score, 2);
assert.equal(b.open.find((i) => i.id === 1)!.myVote, 1);

// Hourly round: needs 5 voters and +3
assert.equal(tick(log, t0 + H).winners.length, 0, "only 4 voters");
for (const n of ["V5", "V6"]) vote(log, p(n, "ip-" + n), 1, 1, t0 + H);
assert.equal(tick(log, t0 + H + 1000).winners.length, 0, "not yet the next hour");
const r = tick(log, Date.parse("2026-11-02T12:00:00Z"));
assert.deepEqual(r.winners.map((i) => i.id), [1]);
assert.equal(vote(log, p("V7", "ip-V7"), 1, 1, t0 + 2 * H).ok, false, "closed after winning");

// Voted down at -5
for (let i = 0; i < 5; i++) vote(log, p("D" + i, "ip-D" + i), 2, -1, t0 + 2 * H);
assert.equal(log.ideas[1].status, "votedDown");

// Expiry after 24h
const r2 = tick(log, t0 + 49 * H);
assert.ok(r2.expired.some((i) => i.id === 3));
b = boardFor(log, p("Ann", "ip1"), t0 + 49 * H);
assert.equal(b.open.length, 0);
assert.ok(b.lastWinner?.id === 1);

// Global cap per day
const log2 = emptyLog(t0);
for (let i = 0; i < IDEA.globalPerDay; i++) assert.ok(submit(log2, p("P" + i), `Idea number ${i} for the game`, t0).ok);
assert.equal(submit(log2, p("Late"), "One idea too many today", t0).ok, false);

console.log("ideas: all checks passed");
