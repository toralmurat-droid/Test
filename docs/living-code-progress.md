# Living Code (roadmap M6): progress log

Clans get code of their own, behind a fixed interface, sandboxed, and never live without Murat's OK.

## Decisions
- Murat 2026-11-17: no AI-written code goes live without his OK. The OK is the hash pin: Murat sets the bundle's hash
  in Railway's `CLAN_PLUGINS`. Off by default. (The 2026-11-14 "no approval step" still holds for AI leaders and forged
  items, not for code.)
- Orchestrator 2026-11-17: no auto-merge override in part 1 (merged plug-in code never runs unless pinned); revisit in
  part 2 (the AI PR bot). No new critical-area label: part 1 sits in `area:deploy` (CI workflow, `package.json`).
- Murat 2026-11-17 (part 2): a scheduled Claude routine per clan opens PRs that change only `shared/clans/<clan>/`. They
  may merge normally; the hash pin stays the only gate to running live. No email (not approved).

| Part | Scope | State |
|---|---|---|
| 1 | Clan folders behind a fixed interface: API v1 (`council` only), sandbox worker, build + manifest, hash pins, kill switch, auto switch-off, static check, gate, CI scope, `--plugin` in the war sim | done (branch `claude/clan-plugins`) |
| 2 | Clan code routine: `npm run clans:verify`, helper files in a clan folder, the routine's prompt (`docs/living-code-routine.md`) | repo side done (branch `claude/clan-routines`); routines not scheduled yet |

## Part 1: what exists
- **Folders**: `shared/clans/<clan>/index.ts` for the five clans, each exporting `plugin: ClanPlugin` (`api: 1`,
  `clan`, `version` of at most 8 characters, `council(briefing) => orders`). The defaults return `kit.scriptedCouncil(b)`.
  They may import only `shared/clans/api.ts` (types, `CLAN_PLUGIN_API`, the frozen `kit`, the sandbox limits
  `CLAN_PLUGIN`). `herald`, `tactics`, `forgeFlavour` are reserved: a v1 plug-in exporting one is refused. Per-tick
  behaviour must later be data, not code. The client never imports any of it.
- **Kit**: the scripted council and `COUNCIL` moved from `shared/war/council.ts` to `shared/war/councilScript.ts`
  (re-exported, same objects), so a bundle carries the kit and the Heralds' lines (~14 kB) instead of the map (the full
  module graph took over a second to load in a fresh context).
- **Build**: `tools/clans/build.mjs` (esbuild, part of `npm run build:server`) writes `server-dist/clans/<clan>.js`
  (iife, minified, ascii, deterministic) and `manifest.json` (`clan`, `version`, `api`, `sha256`, `sha8`, `bytes`). The
  shared modules are marked free of side effects for the bundle so only what the plug-in reaches is kept; the tests
  prove the default bundles answer exactly the scripted council.
- **Sandbox**: `server/clanPluginWorker.ts` (bundled to `server-dist/clanPlugin.cjs`). A worker thread per run with
  `env: {}`, `execArgv: []`, 32 MB old / 8 MB young generation, 1 MB stack; killed 2 s after its budget. Inside, a fresh
  `node:vm` context per call: string and wasm codegen off, no `require` / `process` / timers (vm never has them),
  `Date`, `Intl`, `Function`, `eval`, `Proxy`, `Reflect`, `Promise`, `WebAssembly`, `SharedArrayBuffer`, `Atomics`,
  `queueMicrotask`, `globalThis` deleted; `Math.random` seeded from the briefing (seed, day, clan); the briefing parsed
  and deep-frozen inside; 200 ms per call (microtasks included); answer at most 4 kB of JSON. Only strings cross. Not a
  security boundary by itself (JSDoc says so): the static check, the empty env, review and the pin are.
- **Server**: `server/clanPlugins.ts`: `CLAN_PLUGINS` pins (16+ hex of the sha256, full hash recommended; malformed pins ignored), the hash is
  taken from the bytes, never from the manifest; provider `plugin` in `server/warCouncil.ts` (council log id
  `plugin:<clan>@<version>#<sha8>`, fits the saved 32-character field). Fails closed: not pinned, mismatch, killed,
  switched off, throw, timeout, worker crash or OOM, wrong clan / API / version, reserved point, unknown field, forge
  order (plug-ins never commission), oversized, invalid orders. Failures of the code itself count; 3 in a row switch the
  clan's plug-in off until `POST /admin/clan-plugins?enable=<clan>` (in memory: a restart re-enables). Kill:
  `CLAN_PLUGINS_KILL=1` or `POST /admin/clan-plugins?kill=1`. `GET /admin/clan-plugins`: pins, deployed hashes,
  `live`, failures, the last 30 runs. Only the war owner runs councils, so only it runs plug-ins.
- **Gates**: `tools/clans/check.ts` (TypeScript syntax tree denylist, folder rules, 20 kB per file);
  `tools/clans/gate.ts` (200 briefings from war-sim states through the real worker at 20 ms a call, 100% legal, run
  twice, byte-identical); `tools/ci/clan-scope.mjs` (`scopeOf(branch, files)`: the touched clan folders, every clan
  when the kernel changed, and `claude/clan-<clan>-*` branches confined to their folder). CI runs scope, check and
  gate only for the folders a PR touches.
- **Sim**: `npx tsx tools/balance/war.ts 200 30 --plugin=all` (or `--plugin=wardens,host`): those councils are their
  bundles in the same sandbox (in process, no pin); implies `--council=lead`.
- No save, schema, `ACCOUNT_API` or `WAR_API` change; nothing in `TownRoom.ts` or the client.

## Part 2: what exists
- **Routine**: [living-code-routine.md](living-code-routine.md) is the exact prompt of the scheduled routine (one per
  clan, `{CLAN}` replaced). A run reads its folder, this log, the lore (`shared/war/clans.ts`, `heralds.ts`) and the sim
  baseline, makes one small in-character change to target choice or stance, bumps `version`, runs `clans:verify`, the
  tests and the build, and when all pass pushes `claude/clan-<clan>-<yyyymmdd>` and opens one PR (`gh api -X POST
  repos/toralmurat-droid/Test/pulls`, ready, title `[clan code] <Clan>: <what> [no patch note]`, body: the verify block
  and the leader's rationale, also a comment in the code). It skips when its last PR is still open; a failure opens
  nothing and ends with one `clan-code <clan> <date> FAILED ...` line (the run history is the log). It never touches
  other files, env or pins.
- **Verify**: `npm run clans:verify -- <clan> [--wars=60] [--days=30] [--out=<file>]` (`tools/clans/verify.ts`): the
  static check, the sandbox gate, then `tools/balance/war.ts` twice in parallel on the same seeds (`--council=lead`,
  `--plugin=<clan>`; new `--json=<file>` hands the numbers back, `daily` land shares included). Prints the PR block:
  clan, version, full sha256 and sha16, check / gate / sim gate, each clan's average and peak land before and after,
  dominated wars, flips a day, plug-in calls and failures. Exit 1 on any failure. The sim gate (`simGate`, pure): a war
  is dominated when one clan holds over `CLAN_PLUGIN.domShare` (30%) for more than `domDays` (3) days in a row after
  settling; fail at `domWars` (5%) of the plug-in run's wars, or when the clan's average land is over `landGainMax`
  (+3 points) above the baseline. Wars and days: `verifyWars` / `verifyDays` (60 x 30).
- **Helper files**: a plug-in may import `../api` and `./<file>` (a `.ts` file directly in its folder, name a letter
  then letters, digits, `-`, `_`). `tools/clans/check.ts` checks the name and that the file exists, and runs every rule
  on each helper; `tools/clans/build.mjs` refuses at bundle time any import from a clan file that resolves outside
  `shared/clans/api.ts` and its own folder (`fenced`). Every other denylist rule is unchanged.
- Editing `shared/clans/api.ts` (the new constants) changed every clan's bundle hash (the minifier's names shift); no
  pin existed yet. Defaults now: wardens `f8ae6beb4cd071c5`, host `414e9e40e2209635` (sha16).
- No save, schema, server or client change.

## Balance (2026-11-17)
`npx tsx tools/balance/war.ts 200 30 --council=lead` before the change, after it, and with `--plugin=all`: every
number identical (wardens 23.1% / 31.9%, redfang 19.4% / 30.6%, host 17.3% / 26.4%, hidekin 17.7% / 23.6%, veiled
22.5% / 29.2%; 2.89 flips a war day; Crown 1.46 changes a day; Reckonings hidekin 81.0%; 30000 sessions, 0 rejected;
dominated runs 1.0%). The plug-in run: 30000 plug-in calls, 0 failed; 195 s against 123 s.

## Open
- Auto switch-off and the admin kill are in memory (no save change in part 1); a restart re-reads the env.
- Part 2: schedule the five routines (owner); decide whether clan PRs stay ready (auto-merge) or open as drafts; a
  shared run log beyond the routine's own history (email is not approved); more API points (as data where they act per
  tick).
