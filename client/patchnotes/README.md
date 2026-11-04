# Patch notes

Shown in game with **N** or **📜 News** in the game menu (Esc) (client/src/patchnotes.ts).
Players get a "New update" notice and a badge for entries they have not seen yet.

**Every PR that changes the game adds one new file here.** One file per PR, so
parallel PRs never conflict. Never edit someone else's entry to add yours.

File name: `YYYY-MM-DD-short-slug.json` (date the PR is opened, UTC).

```json
{
  "date": "2026-11-04",
  "pr": 194,
  "title": "Short player-facing name",
  "changes": [
    "One plain sentence per change, written for players.",
    "No code names, file paths or PR jargon."
  ]
}
```

- `pr` is optional (add it once the PR number is known; it orders same-day entries).
- Do not add a patch number: the game numbers notes itself ("Patch #1" = oldest),
  in order of date, then `pr`, then file name.
- Keep it short: 1 to 4 changes.
- A PR with nothing players can notice (CI, tools, docs) can skip the note:
  put `[no patch note]` in the PR title or body. The "Patch note" check enforces this.
