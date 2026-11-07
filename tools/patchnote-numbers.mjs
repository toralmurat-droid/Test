// Gives every patch note in client/patchnotes/ a fixed "patch" number, in the
// order the notes were merged into the default branch (git first-parent history).
// Notes that already have a number keep it; new ones get the next numbers.
// Run by .github/workflows/patch-numbers.yml after each merge. Usage: node tools/patchnote-numbers.mjs
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const DIR = "client/patchnotes";
const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
const notes = new Map(files.map((f) => [f, JSON.parse(readFileSync(`${DIR}/${f}`, "utf8"))]));

// Merge order: the first first-parent commit that added each file.
const log = execFileSync("git", ["log", "--first-parent", "--reverse", "--diff-filter=A", "--format=", "--name-only", "--", DIR], { encoding: "utf8" });
const order = new Map();
for (const line of log.split("\n")) {
  const f = line.trim().replace(/^.*\//, "");
  if (notes.has(f) && !order.has(f)) order.set(f, order.size);
}

let max = 0;
for (const n of notes.values()) if (Number.isInteger(n.patch)) max = Math.max(max, n.patch);
const todo = files.filter((f) => !Number.isInteger(notes.get(f).patch))
  .sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity) || a.localeCompare(b));

for (const f of todo) {
  const { date, patch: _drop, ...rest } = notes.get(f);
  const out = { date, patch: ++max, ...rest };
  writeFileSync(`${DIR}/${f}`, JSON.stringify(out, null, 2) + "\n");
  console.log(`Patch #${max}: ${f}`);
}
if (!todo.length) console.log("All patch notes already numbered.");
