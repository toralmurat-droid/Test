// Clan plug-in scope for CI (Living Code M6, .github/workflows/ci.yml): which clan folders a change touches, so CI runs
// the static check and the gate (tools/clans/check.ts, gate.ts) only for those, and whether a clan branch stayed in its
// own folder. A branch named claude/clan-<clan>-<anything> may change only shared/clans/<clan>/ (a clan's code never
// reaches the kernel, other clans, saves or the server). A change to the plug-in kernel (the API, the sandbox, the
// tools, the scripted council the kit uses) gates every clan.
// Usage: node tools/ci/clan-scope.mjs <branch> <base-commit>   prints the clans to gate (space separated, maybe none);
// exit code 1 (the problems on stderr) when a clan branch stepped outside its folder.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/** Files whose change can alter what every plug-in does or how it is fenced. */
export const KERNEL = ["shared/clans/api.ts", "shared/war/councilScript.ts", "server/clanPlugins.ts", "server/clanPluginWorker.ts", "tools/clans/"];

/** The clan folders in the repository (shared/clans/<clan>/). */
/** Clan folder names: lower-case letters only (they reach a shell in CI). */
const CLAN_NAME = /^[a-z]+$/;

export function clanFolders(root = ROOT) {
  const dir = path.join(root, "shared", "clans");
  return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && CLAN_NAME.test(d.name)).map((d) => d.name).sort() : [];
}

/**
 * The scope of a change: `clans` to check and gate (touched folders, or every folder when the kernel changed), `errors`
 * when branch `branch` is a clan branch (claude/clan-<clan>-...) and a file lies outside shared/clans/<clan>/. Pure but
 * for `all` (the folder list, read from disk when not given).
 */
export function scopeOf(branch, files, all = clanFolders()) {
  const touched = new Set(), errors = [];
  for (const f of files) {
    const m = /^shared\/clans\/([^/]+)\//.exec(f);
    if (!m) continue;
    if (CLAN_NAME.test(m[1])) touched.add(m[1]); else errors.push(`${f}: clan folder names are lower-case letters only`);
  }
  const kernel = files.some((f) => KERNEL.some((k) => (k.endsWith("/") ? f.startsWith(k) : f === k)));
  const cb = /^claude\/clan-([a-z]+)-/.exec(branch ?? "");
  if (cb) {
    const own = `shared/clans/${cb[1]}/`;
    for (const f of files) if (!f.startsWith(own)) errors.push(`${f}: the clan branch ${branch} may change only ${own}`);
  }
  const clans = (kernel ? [...new Set([...all, ...touched])] : [...touched]).filter((c) => CLAN_NAME.test(c) && all.includes(c)).sort(); // (a deleted folder: nothing to gate)
  return { clans, kernel, clanBranch: cb ? cb[1] : undefined, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [branch, base] = process.argv.slice(2);
  let files;
  try { files = execFileSync("git", ["diff", "--name-only", base, "HEAD"], { encoding: "utf8", cwd: ROOT }).split("\n").filter(Boolean); }
  catch { console.error("clan-scope: git diff failed, gating every clan"); console.log(clanFolders().join(" ")); process.exit(0); }
  const r = scopeOf(branch, files);
  for (const e of r.errors) console.error(`clan-scope: ${e}`);
  console.error(`clan-scope: ${r.clans.length ? `gating ${r.clans.join(", ")}${r.kernel ? " (the plug-in kernel changed)" : ""}` : "no clan folder touched"}`);
  console.log(r.clans.join(" "));
  process.exit(r.errors.length ? 1 : 0);
}
