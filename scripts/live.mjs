// Runs the dev servers and keeps them on the latest commit of the current branch's upstream.
// Every minute it fetches from GitHub; when there are new commits it fast-forwards, runs
// `npm install` if dependencies changed, and restarts `npm run dev`.
//
//   node scripts/live.mjs            (LIVE_INTERVAL_S=30 to check more often)
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INTERVAL_MS = Number(process.env.LIVE_INTERVAL_S ?? 60) * 1000;

// Prefer GitHub Desktop's bundled git: it can use the GitHub sign-in Desktop already stored
const DESKTOP_GIT = "/Applications/GitHub Desktop.app/Contents/Resources/app/git";
const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
let gitBin = "git";
if (existsSync(DESKTOP_GIT)) {
  gitBin = join(DESKTOP_GIT, "bin/git");
  gitEnv.PATH = `${join(DESKTOP_GIT, "bin")}:${process.env.PATH}`;
  gitEnv.GIT_EXEC_PATH = join(DESKTOP_GIT, "libexec/git-core");
}
// Private repo: use the sign-in GitHub Desktop already stored
const CRED = gitBin === "git" ? [] : ["-c", "credential.helper=", "-c", "credential.helper=manager"];

const log = (msg) => console.log(`\x1b[35m[live ${new Date().toLocaleTimeString()}]\x1b[0m ${msg}`);
const git = (...args) => {
  const r = spawnSync(gitBin, [...CRED, ...args], { cwd: ROOT, env: gitEnv, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").split("\n").filter((l) => l && !l.includes("DESKTOP_PORT")).join("\n") };
};

let dev;
function startDev() {
  // Own process group, so a restart stops vite, tsx and their children together
  dev = spawn("npm", ["run", "dev"], { cwd: ROOT, stdio: "inherit", detached: true });
}
function stopDev() {
  // Capture this process: by the time the fallback fires, `dev` already points at the restarted one
  const child = dev;
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    const force = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 5000);
    child.once("exit", () => { clearTimeout(force); resolve(); });
    try { process.kill(-child.pid, "SIGTERM"); } catch { clearTimeout(force); resolve(); }
  });
}

let busy = false;
async function check() {
  if (busy) return;
  busy = true;
  try {
    const upstream = git("rev-parse", "--abbrev-ref", "@{u}");
    if (!upstream.ok) return log("current branch has no upstream on GitHub; not updating");
    const fetched = git("fetch", "--quiet", "origin");
    if (!fetched.ok) return log(`fetch failed: ${fetched.err || "unknown error"}`);
    const behind = Number(git("rev-list", "--count", `HEAD..${upstream.out}`).out);
    if (!behind) return;
    const before = git("rev-parse", "HEAD").out;
    const merged = git("merge", "--ff-only", "--quiet", upstream.out);
    if (!merged.ok) return log(`can't fast-forward to ${upstream.out} (local commits or edits in the way):\n${merged.err}`);
    log(`updated ${behind} commit(s) from ${upstream.out}:\n${git("log", "--oneline", `${before}..HEAD`).out}`);
    const changed = git("diff", "--name-only", before, "HEAD").out.split("\n");
    if (changed.some((f) => f === "package.json" || f === "package-lock.json")) {
      log("dependencies changed, running npm install");
      spawnSync("npm", ["install"], { cwd: ROOT, stdio: "inherit" });
    }
    log("restarting the game");
    await stopDev();
    startDev();
  } finally {
    busy = false;
  }
}

const shutdown = async () => { await stopDev(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

log(`watching GitHub every ${INTERVAL_MS / 1000}s`);
await check();
if (!dev) startDev();
setInterval(check, INTERVAL_MS);
