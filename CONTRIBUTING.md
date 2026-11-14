# Contributing

How we work on Pixel Town Brawl together. The technical rules (architecture, limits, checks) are in
[CLAUDE.md](CLAUDE.md); everyone, human or Claude session, follows them.

## The flow
1. **Ask for one thing per thread.** One feature or fix per Claude thread / branch, so PRs stay small and parallel
   work doesn't collide.
2. **Branch** from the default branch, `claude/relaxed-wozniak-cjs85z` (there is no `main`). Name it `claude/<something>`.
3. **Open a PR** into the default branch. Title in English, saying what players get ("Two new dungeons with quests").
4. **CI** runs tests, the build and smoke tests (`.github/workflows/ci.yml`), and checks for a patch note.
5. **Auto-merge:** a non-draft PR from a `claude/*` branch merges by itself once CI is green
   (`.github/workflows/auto-merge.yml`). There is no human review step by default. If the default branch moved
   since CI ran, the merge job first tests the PR on top of it; a PR that only breaks in combination doesn't merge.
6. **Deploy:** Railway rebuilds the live game on every merge ([DEPLOY.md](DEPLOY.md)). Players see a short restart.

Because merging is automatic, **anything merged is live within minutes.**

**Working in parallel:** saves, the synced schema, the skill engine, the map and CI/deploy are critical areas
(table in [CLAUDE.md](CLAUDE.md), "Critical areas"). Touching one? Open a draft PR at the start so others see it,
and check open PRs with the same `area:` label first. A workflow labels PRs and warns on overlaps.

## When a PR merges by itself
A PR is opened ready (and merges by itself) only when it is fully tested:
- CI passes (tests, build, smoke tests, patch-note check);
- the automated tests for the change pass;
- the reviewer agent's verdict is **OK TO MERGE**;
- balance numbers are in the PR when combat, skills, monsters or XP changed.

Anything else is opened as a **draft** (drafts never auto-merge), with what is missing in the description: half a
feature, failing checks, open review findings, or anything you want someone to look at first. Mark it
"Ready for review" when it's OK to ship.

## Agents
Work in Claude sessions is split across agents defined in `.claude/agents/`; the session you talk to orchestrates
them. Roles, models and the flow are in the "Working with agents" section of [CLAUDE.md](CLAUDE.md). Hands-on QA
(the `qa` agent playing the game) is slow and only runs when you ask for it.

## Big features
Work that spans several sessions:
- write the plan and decisions in a progress file in `docs/` (example: `docs/summoner-rework-progress.md`), and
  keep it up to date at the end of each session;
- keep it on one branch and one draft PR until it's ready;
- record decisions with name and date ("Murat 2026-11-09: balance later"), so the next session knows why.

## Roadmap
The development plan is public at `/roadmap` (play.fmtpa.ch/roadmap), built from `client/src/roadmap.ts`. When a PR
starts or finishes a roadmap item, update its `status` (and `pr`) in the same PR. New milestones or items need the
Game Director's (Murat's) OK.

## Patch notes
Every PR players can notice adds one file in `client/patchnotes/` — see
[client/patchnotes/README.md](client/patchnotes/README.md). Written for players, in English, 1–4 short lines.
Tools, CI and docs changes put `[no patch note]` in the PR title.

## Owners and decisions
- **Game direction, balance targets and which classes are active:** Murat.
- Don't reverse a recorded decision (in code comments, a `docs/` file or a PR) without asking its owner.
- Ideas from players (in-game voting, `/ideas.json`) are built by hand once they win.

## Keeping docs current
If your change makes `README.md`, `CLAUDE.md` or this file wrong, fix it in the same PR.
