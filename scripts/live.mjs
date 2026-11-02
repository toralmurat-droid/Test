// Runs the dev servers and keeps them on the latest commit of the current branch's upstream.
// Every minute it fetches from GitHub and fast-forwards when there are new commits. Whenever the
// checked-out commit changes (from here, GitHub Desktop or a manual pull) it runs `npm install`
// if dependencies changed and restarts `npm run dev`.
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
  // Time limit: a fetch stalled on the network would otherwise freeze the whole script (and its Ctrl-C)
  const r = spawnSync(gitBin, [...CRED, ...args], { cwd: ROOT, env: gitEnv, encoding: "utf8", timeout: 60_000, killSignal: "SIGKILL" });
  const err = r.error?.code === "ETIMEDOUT" ? "timed out after 60s" : (r.stderr ?? "").split("\n").filter((l) => l && !l.includes("DESKTOP_PORT")).join("\n");
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err };
};

let dev;
let runningHead = ""; // commit the running game was started from
function startDev() {
  runningHead = git("rev-parse", "HEAD").out;
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

/** Fetch from GitHub and fast-forward the branch. Restarting is left to restartIfMoved. */
function pull() {
  const upstream = git("rev-parse", "--abbrev-ref", "@{u}");
  if (!upstream.ok) return log("current branch has no upstream on GitHub; not updating");
  const fetched = git("fetch", "--quiet", "origin");
  if (!fetched.ok) return log(`fetch failed: ${fetched.err || "unknown error"}`);
  if (git("rev-list", "--count", `HEAD..${upstream.out}`).out === "0") return;
  const merged = git("merge", "--ff-only", "--quiet", upstream.out);
  if (!merged.ok) log(`can't fast-forward to ${upstream.out} (local commits or edits in the way):\n${merged.err}`);
}

/**
 * Restart the game when the checked-out commit is no longer the one it was started from,
 * however it moved: pulled here, in GitHub Desktop, by hand, or a new local commit.
 */
async function restartIfMoved() {
  const head = git("rev-parse", "HEAD").out;
  if (!head || head === runningHead) return;
  const commits = git("log", "--oneline", `${runningHead}..${head}`);
  log(`now on ${head.slice(0, 7)}${commits.ok && commits.out ? `:\n${commits.out}` : ""}`);
  const changed = git("diff", "--name-only", runningHead, head).out.split("\n");
  if (changed.some((f) => f === "package.json" || f === "package-lock.json")) {
    log("dependencies changed, running npm install");
    spawnSync("npm", ["install"], { cwd: ROOT, stdio: "inherit" });
  }
  log("restarting the game");
  await stopDev();
  startDev();
}

let busy = false;
const exclusive = (f) => async () => {
  if (busy) return;
  busy = true;
  try { await f(); } finally { busy = false; }
};

const shutdown = async () => { await stopDev(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

log(`watching GitHub every ${INTERVAL_MS / 1000}s`);
pull();
startDev();
setInterval(exclusive(async () => { pull(); await restartIfMoved(); }), INTERVAL_MS);
setInterval(exclusive(restartIfMoved), 5000); // cheap local check, catches pulls made outside this script
