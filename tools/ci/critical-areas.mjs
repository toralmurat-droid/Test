// Labels a PR with the critical areas it touches (area:saves, area:schema, ...) and comments when another open PR
// touches the same area, so parallel sessions see each other before they collide. Warns only: it never blocks or
// changes another PR. Run by .github/workflows/critical-areas.yml. The areas are listed in CLAUDE.md too.
const AREAS = {
  saves: { about: "saves and accounts", files: [/^server\/(accounts|store|handoff)\.ts$/],
    // changed lines in the room that build, load or version a save
    lines: { file: /^server\/TownRoom\.ts$/, line: /^[+-](?![+-]).*\b(snapshot|loadHero|saveHero|HeroSave|xpv|XP_CURVE_VERSION)\b/ } },
  schema: { about: "synced Player / Mob schema", files: [/^server\/player\.ts$/, /^shared\/mobView\.ts$/],
    lines: { file: /^server\/TownRoom\.ts$/, line: /^[+-](?![+-]).*@type\(/ } },
  "skill-engine": { about: "the shared skill engine", files: [/^shared\/skillEngine\.ts$/] },
  map: { about: "the deterministic world map", files: [/^shared\/(map|desert)\.ts$/] },
  deploy: { about: "CI, build and deploy", files: [/^\.github\//, /^Dockerfile$/, /^railway\.json$/, /^package(-lock)?\.json$/,
    /^server\/index\.ts$/, /^tsconfig\.json$/, /^vite\.config\.mts$/] },
};
const MARK = "<!-- critical-areas -->";
const { GITHUB_TOKEN, GITHUB_REPOSITORY: REPO, PR, BASE } = process.env;

async function gh(path, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, { ...opts, headers: { authorization: `Bearer ${GITHUB_TOKEN}`,
    accept: "application/vnd.github+json", "content-type": "application/json", ...opts.headers } });
  if (!r.ok && !(opts.okStatus ?? []).includes(r.status)) throw new Error(`${opts.method ?? "GET"} ${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 || !r.headers.get("content-type")?.includes("json") ? null : r.json();
}
async function all(path) {
  const out = [];
  for (let page = 1; page <= 30; page++) {
    const got = await gh(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    out.push(...got); if (got.length < 100) break;
  }
  return out;
}

/** Which areas a PR touches, from its changed files and their patches. */
export function areasOf(files) {
  const hit = new Set();
  for (const f of files) for (const [key, a] of Object.entries(AREAS)) {
    if (a.files.some((re) => re.test(f.filename))) hit.add(key);
    if (a.lines && a.lines.file.test(f.filename) && (f.patch ?? "").split("\n").some((l) => a.lines.line.test(l))) hit.add(key);
  }
  return [...hit].sort();
}

async function main() {
  const mine = areasOf(await all(`/pulls/${PR}/files`));
  // Labels: add this PR's areas, drop area labels it no longer has
  for (const key of mine) await gh(`/labels`, { method: "POST", okStatus: [422], body: JSON.stringify({ name: `area:${key}`, color: "d93f0b", description: `Touches ${AREAS[key].about}` }) });
  const pr = await gh(`/pulls/${PR}`);
  for (const l of pr.labels.map((l) => l.name).filter((n) => n.startsWith("area:") && !mine.includes(n.slice(5))))
    await gh(`/issues/${PR}/labels/${encodeURIComponent(l)}`, { method: "DELETE", okStatus: [404] });
  if (mine.length) await gh(`/issues/${PR}/labels`, { method: "POST", body: JSON.stringify({ labels: mine.map((k) => `area:${k}`) }) });

  // Other open PRs into the same branch that touch the same areas
  const clashes = [];
  if (mine.length) for (const o of await all(`/pulls?state=open&base=${encodeURIComponent(BASE)}`)) {
    if (o.number === Number(PR)) continue;
    const shared = areasOf(await all(`/pulls/${o.number}/files`)).filter((k) => mine.includes(k));
    if (shared.length) clashes.push(`- #${o.number} ${o.draft ? "(draft) " : ""}${o.title}: ${shared.map((k) => `\`area:${k}\``).join(", ")}`);
  }
  console.log(`areas: ${mine.join(", ") || "none"}; overlapping PRs: ${clashes.length}`);

  // One comment per PR, kept up to date; removed when the overlap is gone
  const old = (await all(`/issues/${PR}/comments`)).find((c) => c.body?.includes(MARK));
  if (!clashes.length) { if (old) await gh(`/issues/comments/${old.id}`, { method: "DELETE", okStatus: [404] }); return; }
  const body = `${MARK}\n**Critical areas also touched by other open PRs** (see CLAUDE.md, "Critical areas"):\n\n${clashes.join("\n")}\n\n` +
    `Coordinate before changing the same thing: check the other PR's changes, and merge the default branch in once it lands. ` +
    `This is a warning only; it doesn't block merging. The merge job tests every PR on top of the latest default branch.`;
  if (old) { if (old.body !== body) await gh(`/issues/comments/${old.id}`, { method: "PATCH", body: JSON.stringify({ body }) }); }
  else await gh(`/issues/${PR}/comments`, { method: "POST", body: JSON.stringify({ body }) });
}

import { pathToFileURL } from "node:url";
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main().catch((e) => { console.error(e); process.exit(1); });
