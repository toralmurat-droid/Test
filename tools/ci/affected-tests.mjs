// Which test files a change can affect, so CI runs those instead of all of them (saves paid Actions minutes).
// Usage: node tools/ci/affected-tests.mjs <from-commit>   (compares <from-commit> with HEAD)
// Prints ALL (run everything), an empty line (no test can be affected), or the test files to run.
// A test is affected when the change touches a file it imports (directly or not, found by bundling it with esbuild),
// or the test file itself. Tests that read files from disk (readFileSync/readdirSync) always run: their inputs are not
// imports. Anything not traceable that way (workflows, package files, test helpers, deleted files, config) runs ALL.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import * as esbuild from "esbuild";

const from = process.argv[2];
const all = (why) => { console.error(`affected-tests: all tests (${why})`); console.log("ALL"); process.exit(0); };
if (!from) all("no base commit");
let changed;
try { changed = execFileSync("git", ["diff", "--name-only", `${from}`, "HEAD"], { encoding: "utf8" }).split("\n").filter(Boolean); }
catch { all("git diff failed"); }
// Only player-facing text and docs: no test reads them as code (patch notes are checked by their own workflow)
const ignored = (f) => f.startsWith("client/patchnotes/") || f.startsWith("docs/") || f.endsWith(".md");
const files = changed.filter((f) => !ignored(f));
if (!files.length) { console.error("affected-tests: only docs/patch notes changed"); console.log(""); process.exit(0); }
for (const f of files) {
  if (!fs.existsSync(f)) all(`deleted or renamed: ${f}`);
  if (/^(\.github\/|package|tsconfig|tests\/helpers\/|tests\/fixtures\/|tools\/ci\/)/.test(f) || !/\.(ts|tsx|mts|cts|js|mjs|cjs|json)$/.test(f)) all(`changed: ${f}`);
}
const tests = fs.readdirSync("tests").filter((f) => f.endsWith(".test.ts")).map((f) => `tests/${f}`);
const run = [];
await Promise.all(tests.map(async (t) => {
  if (files.includes(t) || /readFileSync|readdirSync/.test(fs.readFileSync(t, "utf8"))) { run.push(t); return; }
  let inputs;
  try {
    const r = await esbuild.build({ entryPoints: [t], bundle: true, write: false, metafile: true, platform: "node", packages: "external", logLevel: "silent", outdir: "/tmp/affected-tests" });
    inputs = Object.keys(r.metafile.inputs);
  } catch { all(`could not trace ${t}`); }
  if (files.some((f) => inputs.includes(f))) run.push(t);
}));
run.sort();
console.error(`affected-tests: ${run.length} of ${tests.length} test files (changed: ${files.join(", ")})`);
console.log(run.join(" "));
