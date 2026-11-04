// Bundles the bench and the bots (like production: one file, no on-the-fly TypeScript) and runs it.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
const out = "node_modules/.cache/perf";
mkdirSync(out, { recursive: true });
const esb = ["--bundle", "--platform=node", "--format=cjs", "--packages=external", "--target=node22", "--log-level=error"];
execFileSync("npx", ["esbuild", "tools/perf/bench.ts", ...esb, `--outfile=${out}/bench.cjs`], { stdio: "inherit" });
execFileSync("npx", ["esbuild", "tools/perf/bots.ts", ...esb, `--outfile=${out}/bots.cjs`], { stdio: "inherit" });
execFileSync("node", [...(process.env.NODE_ARGS ? process.env.NODE_ARGS.split(" ") : []), `${out}/bench.cjs`, ...process.argv.slice(2)], { stdio: "inherit" });
