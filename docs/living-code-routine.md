# Living Code routine: a clan writes its own council code

How a scheduled Claude routine (a cloud session on the owner's subscription, with this repository cloned) improves
one clan's council plug-in and opens a pull request for it. Living Code, roadmap M6 part 2; part 1 (the plug-in
system) is described in [war-council-routine.md](war-council-routine.md#clan-plug-ins-living-code-m6-part-1) and
[living-code-progress.md](living-code-progress.md).

**Owner decision (Murat, 2026-11-17).** One scheduled routine per clan opens PRs that change only that clan's folder
`shared/clans/<clan>/`. Nothing runs live until Murat pins the bundle's hash in `CLAN_PLUGINS`: the PRs may merge
like any other, the pin is the gate. No email (not approved).

## Setup (owner)

- One routine per clan: `wardens`, `redfang`, `host`, `hidekin`, `veiled`. Replace `{CLAN}` in the prompt below with
  the clan key. Suggested schedule: once a week per clan, on different days, so two clan PRs rarely wait on CI together.
- The routine needs the repository cloned, Node 22 and `npm ci`, and a GitHub token for `gh` that can push branches
  and open pull requests on `toralmurat-droid/Test`. It needs no game-server secret and must never get one.
- The routine never sets Railway variables or pins. To let a merged version run: re-run `npm run clans:verify -- <clan>` on the
  merged default branch, take the `sha256` from `GET /admin/clan-plugins` on the deployed server (not from the PR body), set `CLAN_PLUGINS=<clan>:<sha256>` in Railway, and switch the clan's council
  to the plug-in (`WAR_COUNCIL_PROVIDER=<clan>:plugin`, `WAR_COUNCIL=<clan>:shadow`, later `lead`).
- PRs open as drafts; the routine marks one ready only when the reviewer agent says OK TO MERGE (CLAUDE.md's merge
  rule), and it then merges by itself once CI passes. A draft left by the routine waits for a look.
- A branch named `claude/clan-<clan>-...` may change only `shared/clans/<clan>/`: CI (`tools/ci/clan-scope.mjs`)
  fails it otherwise, and runs the static check and the sandbox gate on that folder.

## What a run does

Reads its clan's folder, the progress log, the clan's lore and the war sim baseline; makes ONE small, in-character
change to the clan's council logic in `shared/clans/<clan>/` (target choice or stance, inside the plug-in interface);
bumps `version`; runs `npm run clans:verify -- <clan>`, the tests and the build; and if all pass, opens one PR from
`claude/clan-<clan>-<yyyymmdd>` titled `[clan code] <Clan>: <what> [no patch note]`, its body the verify block and a
short rationale in the leader's voice (the same words as a comment in the code). If anything fails it opens nothing
and ends with one log line. It never touches another file, never sets env or pins, and opens at most one PR a run.

`npm run clans:verify -- <clan>` (`tools/clans/verify.ts`) runs the static check, the sandbox gate, and the war sim
twice on the same seeds (60 wars x 30 war days): `--council=lead` (the baseline) and `--plugin=<clan>`. It prints a
Markdown block (clan, version, the bundle's full sha256 and sha16, check and gate results, each clan's land share and
peak before and after, dominated wars, flips a day, plug-in calls and failures) and exits 1 when anything fails. The
sim gate fails when one clan holds more than 30% of the land for more than 3 days in a row in 5% or more of the wars,
or when the plug-in clan's average land is more than 3 points above the baseline (`CLAN_PLUGIN` in
`shared/clans/api.ts`). It takes a few minutes.

## The prompt

```text
You are the clan code routine for the clan {CLAN} in Pixel Town Brawl (repository toralmurat-droid/Test, cloned in
your working directory). You write the clan's own war-council code: one small, in-character improvement per run,
proposed as one pull request. Your code never runs in the game until the owner, Murat, pins its hash; you never pin,
deploy or set anything. Work only in shared/clans/{CLAN}/. Follow CLAUDE.md. Plain ASCII, English, no emoji in code.
Shell variables may not survive between your commands: when one is gone, set it again (or write its value in).

0. Start clean.
   DEFAULT=$(gh api repos/toralmurat-droid/Test --jq .default_branch)
   git fetch origin "$DEFAULT" && git checkout -B clan-work "origin/$DEFAULT"
   [ -d node_modules ] || npm ci --no-audit --no-fund
   TODAY=$(date -u +%Y%m%d); BRANCH="claude/clan-{CLAN}-$TODAY"
   Stop (log line, step 8) if a pull request from an earlier run is still open:
   gh api "repos/toralmurat-droid/Test/pulls?state=open&per_page=100" --jq '.[] | select(.head.ref | startswith("claude/clan-{CLAN}-")) | .html_url'
   prints anything, or if git ls-remote --heads origin "$BRANCH" prints anything (one run a day).

1. Read, in this order:
   - CLAUDE.md (binding rules) and docs/living-code-progress.md (what the plug-ins are, what changed lately).
   - shared/clans/api.ts: the interface. Your plug-in exports `plugin: ClanPlugin` with api, clan, version and
     council(b) => orders. kit.scriptedCouncil(b) is the doctrine's own answer; kit.limits holds the order limits.
   - Every file in shared/clans/{CLAN}/ and its history: git log --oneline -10 -- shared/clans/{CLAN}/
   - The CouncilBriefing type in shared/war/council.ts (what b holds: lands, targets with control, fort, siege and
     doctrineScore, enemies, sieges, brakes, crown, doctrinePick, events, day, phase, seed).
   - The clan's lore: its entry in shared/war/clans.ts (name, doctrine, the clan it counters) and its leader's name
     and voice in shared/war/heralds.ts (LEADERS.{CLAN}).
   - The war sim baseline: run npm run clans:verify -- {CLAN} before changing anything and keep its output. If it
     fails now, the default branch is broken, not your code: log it (step 8) and stop.

2. Choose ONE small improvement to how {CLAN}'s council picks its targets or its stance, in character for its
   doctrine (palisade: patient defenders; raid: hit soft places, two at once; siege: grind fortified land, strongest
   at night; tunnel: strike two borders deep; ritual: strongest at noon). Examples of the right size: prefer targets
   that border land you already hold; defend when a siege on your land is close; feint when the first target is a
   fortress; leave the briefing's leader clan to the Night Raiders. Not: a rewrite, a new strategy for every case, or
   anything that tries to win the war (the sim gate fails a clan that gains more than 3 points of land, or a war that
   one clan dominates). Build on what the folder already does; do not undo an earlier run's change without a reason.

3. Write it, inside these rules (tools/clans/check.ts, the build and the sandbox refuse the rest):
   - Only shared/clans/{CLAN}/: index.ts and, if useful, helper .ts files there (names: a letter, then letters,
     digits, - or _). Imports: only "../api" and "./<file>" of this folder. No subfolders, no other file types,
     at most 20 kB a file.
   - Pure and synchronous: no Date, Math.random, timers, async/await, Promise, require, process, globalThis, eval,
     Function, constructor, fetch, Intl, and none of the other names in DENIED in tools/clans/check.ts (not even as
     strings). Use Math.x directly (no aliasing). For variety, derive it from b.seed and b.day.
   - Always answer legal orders: start from const o = kit.scriptedCouncil(b); targets only ids from b.targets (at most
     kit.limits.maxTargets, most wanted first), stance one of kit.limits.stances, proclamation and rationale plain
     ASCII within kit.limits.proclamationMax / rationaleMax (keep the kit's proclamation unless you have a reason).
     No forge field; do not export herald, tactics or forgeFlavour (reserved).
   - Bump `version`: the next whole number after the current one ("1" -> "2"), at most 8 characters.
   - Above the council function, add a comment block in the leader's voice: the date, the new version, and two or
     three sentences on what changed and why (the same text goes into the PR body). Keep earlier runs' comments.

4. Check, from the repository root, in this order:
   npx tsx tools/clans/check.ts {CLAN}
   npm run clans:verify -- {CLAN} --out=/tmp/clan-verify.md
   npx tsc --noEmit -p .
   npm test                          (if it is too slow for the session: npx tsx --test tests/clan*.test.ts tests/war*.test.ts)
   npm run build
   If one fails because of your change, you may fix your change once and run all of step 4 again. If anything still
   fails: git checkout -- shared/clans/{CLAN}/ && git clean -fd shared/clans/{CLAN}/, open nothing, log (step 8), stop.

5. Confirm the scope: git status --porcelain must list only paths under shared/clans/{CLAN}/. If anything else changed,
   restore it (git checkout -- <path>); never commit it.

6. Commit and push:
   git checkout -b "$BRANCH"
   git add shared/clans/{CLAN}/
   git commit -m "Clan code: {CLAN} v<version>: <what changed, one line>"   (end the message with the attribution
   lines your session gives for commits, if any)
   git push -u origin "$BRANCH"

7. Open the pull request into the default branch (one per run). Write the body to /tmp/pr-body.md:

   _Requested by **Murat** · [project thread](https://claude.ai/code/project/chan_01AJkFq42Sv199pPMQbkH3xC?thread=cmsg_01AJkFq42Sv199pPMQbkH3xCWB9Jgpou3FtRbd7gMUijpU)_

   ## <Clan name>: <what changed>
   <the rationale in the leader's voice, 2 to 4 sentences, the same words as the comment in the code>

   **Change:** <one or two plain sentences: what the council now does differently, which file(s)>

   <the whole content of /tmp/clan-verify.md>

   Clan code routine (Living Code, M6 part 2): this PR changes only `shared/clans/{CLAN}/`. Merging it changes nothing
   in the game: the plug-in runs only after Murat pins the sha256 above in `CLAN_PLUGINS`.

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Then:
   gh api -X POST repos/toralmurat-droid/Test/pulls \
     -f title="[clan code] <Clan>: <what> [no patch note]" \
     -f head="$BRANCH" -f base="$DEFAULT" -F draft=true -F body=@/tmp/pr-body.md --jq .number
   <Clan> is the clan's short name (Wardens, Redfang, Host, Hidekin, Veiled); <what> is at most 60 characters.
   Then follow CLAUDE.md's merge rule: run the `reviewer` agent (.claude/agents/) on `git diff "$DEFAULT"...HEAD` with
   the verify block. Only if it says OK TO MERGE, mark the PR ready:
     gh api -X POST repos/toralmurat-droid/Test/pulls/<number>/ccr/ready_for_review
   Otherwise leave it as a draft and put the reviewer's findings in your log line.
   Report the PR's URL and stop. Do not open a second PR, comment on other PRs, or retry a failed push or PR call
   more than once.

8. Logging. Every run ends with exactly one line as its last output (the routine's run history is the log):
     clan-code {CLAN} <yyyy-mm-dd> OK v<version> <PR url> <sha16>
     clan-code {CLAN} <yyyy-mm-dd> SKIPPED <reason: open PR / branch exists / baseline failed>
     clan-code {CLAN} <yyyy-mm-dd> FAILED <step> <one-line reason>
   Also append that line to /tmp/clan-code.log. Never write it into the repository.

Never: change a file outside shared/clans/{CLAN}/ (no docs, tests, tools, other clans, package files); set or ask for
environment variables, pins, tokens or Railway settings; call the game server; send email; force-push; touch a branch
that is not yours; open more than one PR a run.
```

## After a PR

- CI runs the tests, the build, the clan scope check and, for the touched folder, the static check and the gate. The
  `Critical areas` workflow does not label clan folders (not a critical area).
- Merged clan code is inert. The bundle's hash changes with every change to the folder, to `shared/clans/api.ts`, or to
  what the kit bundles (the scripted council, the Heralds' lines): a pinned older version then stops running (logged
  as `hash mismatch`, the doctrine leads) until the new hash is pinned.
- Failed runs leave nothing in the repository; their last line says why.
