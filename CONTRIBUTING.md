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
   (`.github/workflows/auto-merge.yml`). There is no human review step by default.
6. **Deploy:** Railway rebuilds the live game on every merge ([DEPLOY.md](DEPLOY.md)). Players see a short restart.

Because merging is automatic, **anything merged is live within minutes.**

## When to use a draft PR
Open the PR as a **draft** (drafts never auto-merge) when:
- it should not reach players yet (unbalanced, half a feature, waiting for art);
- it changes save data, accounts or the deploy setup;
- it changes balance for a class or the XP curve;
- you want someone else to look first.

Mark it "Ready for review" when it's OK to ship; it then merges by itself.

## Big features
Work that spans several sessions:
- write the plan and decisions in a progress file in `docs/` (example: `docs/summoner-rework-progress.md`), and
  keep it up to date at the end of each session;
- keep it on one branch and one draft PR until it's ready;
- record decisions with name and date ("Murat 2026-11-09: balance later"), so the next session knows why.

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
