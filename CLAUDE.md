# CLAUDE.md

Rules for any session (Claude or human) that changes this repository. Several people work on it in parallel and
PRs merge themselves, so these rules stand in for a reviewer. For how work is planned and shipped, see
[CONTRIBUTING.md](CONTRIBUTING.md). For what the game is, see [README.md](README.md).

## What this is
Pixel Town Brawl: an online multiplayer pixel-art action RPG in the browser.
- `shared/`: game rules and data (classes, skills, monsters, items, map, quests). Imported by server, client, tests and tools.
- `server/`: Colyseus 0.16 room (`TownRoom.ts`), accounts and saves, HTTP (`index.ts`).
- `client/`: Phaser 3 + Vite. Draws and sends input; decides nothing.
- `tests/`: `node:test` unit and room tests. `tools/`: balance sims, art generator, perf bench, smoke and e2e scripts.

## Architecture rules
1. **The server decides.** Movement, combat, loot, XP, quests and saves are computed on the server. The client
   predicts and draws, but never sends results ("I hit X for 40"), only intents ("attack", "input").
2. **Numbers and rules live in `shared/`.** Any gameplay value (damage, cooldown, range, drop chance, level) goes in
   a `shared/` table, not inline in `server/` or `client/`. One table per concept: `MOBS` (`constants.ts`), `LOOT`
   (`items.ts`), `GEAR_DROP` (`gear.ts`), `MOB_COMBAT` (`combat.ts`), `SKILLS` (`skills.ts`), `SPAWN_ZONES`
   (`spawns.ts`), classes (`classes.ts`). Extend the existing table; don't start a parallel one.
3. **Skills run through `shared/skillEngine.ts`.** The server and `tools/balance/duel.ts` each implement `SkillHost`,
   so a skill behaves the same in the game and in the sim. Add skill logic to the engine or a shared helper (like
   `shared/golemAI.ts`, `shared/voidConjure.ts`), never only in `TownRoom.ts`.
4. **The map is deterministic.** `shared/map.ts` builds the same world on server and client from code. No randomness
   without the fixed seed; check with `npx tsx tools/map-metrics.ts` (every walkable tile stays reachable).
5. **Client art and effects are cosmetic.** Files like `client/src/ambient.ts` or `*Art.ts` / `*Fx.ts` must not
   change what the server sees.
6. **Validate every client message.** Each `onMessage` handler checks types and ranges of its input and goes through
   `this.allow(...)` in `TownRoom.ts` (built on `server/ratelimit.ts`) when a player could spam it.

## Hard limits (break these and things fail quietly)
- **`Player` schema: 64 synced fields max** (`@colyseus/schema` packs the field index into 6 bits, so indexes 0–63).
  Count the `@type` fields before adding one. Never put a collection or child schema at index 63 (it collides with
  an encoder control byte). Quest chains share one `quests` map: a new chain costs no field. When space runs low,
  prefer a map or child schema over packing several values into one number.
- **Owner-only player data goes in `Player.me`** (`server/player.ts`, `@view()`, one `StateView` per client in
  `onJoin`): other clients never receive it. Never replace `me` or a collection inside it after join, and never set a
  synced Player field to `undefined`/`null` (with a `@view` field, Player's deletes reach only the owner). Views need
  `Encoder.BUFFER_SIZE` big enough that a patch never resizes (a library bug corrupts resized view patches); a
  `@colyseus/schema buffer overflow` warning in the logs means raise it. `tests/view.test.ts` guards both.
- **Synced `Mob` fields:** new ones go at the end of the class and of `MOB_FIELDS` in `shared/mobView.ts`, in the same
  order (`tests/mobview.test.ts` checks it).
- **Skill tree layout:** each branch is at most 3 deep, the slab fits 4 rows (`tests/treeLayout.test.ts`).
- **Skill parents:** `cleanRanks` drops a skill whose parent is not learned. Tests that set ranks must set parents too.
- **Saves must load forever.** `data/saves.json` holds live player progress. Add new save fields as optional with a
  default; when a change invalidates old data (XP curve, skill tree), bump a version field and migrate on load
  (examples: `xpv` / `XP_CURVE_VERSION`, `SUMMONER_TREE`: fields in `server/accounts.ts`, migration on load in `server/TownRoom.ts`). Never drop or rename a save field
  without a migration.
- **Active classes:** only `ACTIVE_CLASSES` in `shared/classes.ts` (currently wizard, vampire, summoner, songweaver) can be played.
  Archived classes keep their code, art and saves; don't delete them. Balance sims cover active classes only.

## Adding things
- **Monster:** an entry in each `Record<MobKind, …>` table (`MOBS`, `LOOT`, `GEAR_DROP`, `MOB_COMBAT`; TypeScript
  flags a missing one), a spawn in `SPAWN_ZONES` or an area's `mobs`, art via `tools/art` (`npm run art`).
- **Skill / talent:** `shared/skills.ts` (or `talents.ts`), icon in `client/src/skillArt.ts` / `skillIcons.ts`,
  effect in `client/src/skillfx.ts`, sound in `client/src/sfx.ts`. Server events go out as
  `broadcast("sfx", { ev, ... })`; give each new `ev` a sound or a visible effect.
- **Item / gear / rune:** `shared/gear.ts`, `shared/items.ts`, `shared/runes.ts`. Item ids are strings that must
  round-trip (see `tests/runes.test.ts`); extend the id format, don't change its meaning.
- **Zone, area, dungeon, quest:** `shared/map.ts` (`AREAS`), `shared/spawns.ts`, `shared/dungeon.ts`,
  `shared/quests.ts`. Monster level grows with distance from Oakvale (`zoneLevels`).
- **Music:** see `client/public/assets/music/README.md`.
- **Art:** generated by code (`tools/art`, procedural tiles in `client/src/tileset.ts`). Match the existing pixel
  look: 32 px tiles, heroes at the same pixel size as tiles, Pixelify Sans pixel font for UI text.

## Code style
- TypeScript `strict`. No new runtime dependencies without the owner's OK (it's a deployed server).
- Follow the file you're in: compact code, short JSDoc on exported things saying *why*, not *what*.
- Comments, identifiers, docs, PR titles and patch notes in **English**.
- Keep `TownRoom.ts` from growing further when you can: put new self-contained systems in their own `server/` or
  `shared/` module (like `server/champions.ts`, `server/mobGrid.ts`) and call them from the room.

## Before you open a PR
All of these must pass (CI runs 1–3 and the Postgres smoke test):
1. `npm test` (unit tests + `tools/ideas-check.ts`)
2. `npm run build` (typecheck + client + server bundle)
3. `node tools/smoke.mjs` (after the build: server boots, a hero logs in)
4. New rules get tests in `tests/` (room behaviour via `tests/helpers/room.ts`).
5. Combat, skill, monster or XP changes: run `npx tsx tools/balance/duel.ts` and/or `tools/balance/pve.ts` and put
   the before/after numbers in the PR.
6. Load-heavy changes (more monsters, per-tick work): `npm run bench` before/after.
7. UI changes: check on a phone-sized screen too (`tools/e2e-summoner-mobile.cjs` shows how).
8. A patch note in `client/patchnotes/` (rules in `client/patchnotes/README.md`), or `[no patch note]` in the title.

## Gotchas
- e2e scripts need a fresh save file per run; walking out of town can stall (the scripts re-route).
- Colyseus decode errors (`refId not found`) show up now and then in e2e runs; still unexplained. Note it if you see it.
- Big features that span several sessions keep a progress log in `docs/` (see `docs/summoner-rework-progress.md`).

## Working with agents
Agent definitions are in `.claude/agents/` (one file per role, with its model and tools). The session you talk to
is the orchestrator: it splits the request, briefs agents, checks their reports and owns the branch and the PR.

| Agent | Model | Does |
|---|---|---|
| `planner` | Opus | spec, file plan, risks, acceptance criteria (read-only) |
| `gameplay-engineer` | Opus | `shared/`, `server/`: rules, skills, monsters, saves |
| `client-engineer` | Sonnet | `client/`: UI, HUD, input, effects, sounds |
| `art-audio` | Sonnet | generated art, icons, effects, sfx, music slots |
| `content-writer` | Sonnet | quests, dialogue, monster and zone entries, patch notes |
| `balance-analyst` | Sonnet | duel / PvE sims and bench, before and after (no code edits) |
| `tester` | Sonnet | automated tests and checks (edits `tests/` only) |
| `qa` | Sonnet | plays the game in a headless browser; **only when the user asks** |
| `reviewer` | Opus | reviews the diff against this file; its verdict gates merging |
| `scout` | Haiku | quick lookups (read-only) |

Flow for a feature: planner → engineers / art / content → tester → balance-analyst (if combat, skills, monsters
or XP changed) → reviewer → PR. QA is added only on request.
- Small changes skip steps: a one-file fix can go straight to build, tests and reviewer. Don't spawn agents a task
  doesn't need.
- Brief each agent fully: it sees only the brief. Include the goal, the relevant part of the plan, files, the
  acceptance criteria and what it must not touch.
- Agents that edit files in parallel each work in their own worktree. Changes to `server/TownRoom.ts` go one after
  another.
- Give the reviewer the diff, not the orchestrator's opinion of it.
- **Merge rule:** open the PR ready (not draft) only when CI passes, the tester passes, the reviewer says
  **OK TO MERGE**, and balance numbers are in the PR when combat, skills, monsters or XP changed. It then merges by
  itself. Otherwise open it as a draft and say what is missing.
