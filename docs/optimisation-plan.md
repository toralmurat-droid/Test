# Optimisation plan

Status: plan only, nothing implemented. Written 2026-11-13 from three read-only audits (server tick, network and
saves, client runtime) plus a measured server baseline. Line numbers are as of commit `a4ebcf1`.

How to read the evidence column: **measured** = from `npm run bench` or a CPU profile of it; **read** = verified in
the code but not timed; **guess** = an estimate that needs a measurement before work starts.

## Baseline (measured, 4-core container)

`npm run bench -- <bots> 12`, world holds 5,764 monsters. A tick plus its patch must fit in 50 ms (20 Hz).

| Scenario | Tick avg / p95 | Patch avg | Ticks/s | kB per player/s | Active mobs |
|---|---|---|---|---|---|
| 5 bots, clustered | 9.2 / 13.1 ms | 5.9 ms | 19.6 | 22.1 | 98 |
| 20 bots, `SPREAD=1` | 17.3 / 26.3 ms | 8.5 ms | 19.6 | 24.5 | 273 |
| 20 bots, `SPREAD=1 CAST=1` | 43.2 / 64.3 ms | 11.3 ms | 16.0 | 34.9 | 1,042 |

- The heavy-cast case with 20 players already misses the tick budget (16 ticks/s instead of 20).
- Five idle players cost 15 ms per tick with only 98 monsters active: most of that is fixed cost that grows with the
  size of the world, not with what is happening.
- kB per player is uncompressed payload (the bots count bytes after inflate), so real wire bytes are unknown.
- Client build: `main-*.js` is 2,898 kB (847 kB gzip) in one chunk; `dist/` is 149 MB, of which 147 MB is art and music.
- Nothing on the client is measured. There is no client perf harness.

CPU profile of the 20-bot runs, share of total CPU (spread / spread+cast):

| Where | Share | Note |
|---|---|---|
| `TownRoom.update` (inclusive) | 44% / 59% | |
| the per-mob loop inside it (`TownRoom.ts:2673`) | 35% / 48% | visits all 5,764 mobs each tick |
| `updateMob` | 24% / 34% | |
| `MobView.send` (`server/mobView.ts:36`) | 15% / 14% | visits all 5,764 mobs each patch |
| schema field getter (`@colyseus/schema`, self time) | 15% / 19% | spread over every hot loop that reads `m.x`, `p.x`, ... |
| `pickTarget` | 1% / 5% | |
| full-map scans: `claimSpot`, `blobHeal`, `inGate`, `assignFlanks`, melee rewind | about 1-2% each | |

## Step 0: measuring tools (do first, small)

| # | What | Where | Agent |
|---|---|---|---|
| T1 | Bench reports true wire bytes (`ws._socket.bytesRead`) next to the uncompressed figure | `tools/perf/bots.ts:15`, `bench.ts:39` | tester |
| T2 | Bench prints time per phase of the tick (mob loop, heroes, projectiles, fields, mob view) so each later PR can show its own line | `tools/perf/bench.ts` | tester |
| T3 | Client perf script: headless Chromium, desktop and phone viewport, walks a fixed route and records frame time p50/p95, display-list and update-list size, draw calls, texture count and bytes, time to first playable frame | new `tools/perf/client.cjs` (pattern: `tools/e2e-summoner-mobile.cjs`) | tester |

T3 limit: headless Chromium renders in software, so it is good for CPU-side numbers (frame script time, object counts,
draw calls, memory) and useless for GPU cost. GPU items (C6, C7) need a real phone.

## Server CPU

Order is by measured weight. All items except S6 are meant to leave game results unchanged.

| # | What | Where | Evidence | Risk |
|---|---|---|---|---|
| S1 | Keep an index of non-frozen mobs and iterate only that in the tick loop; in `MobView.send` visit only grid cells round each client and refresh a mob's wire values on first visit. Removes the fixed cost per tick and per patch. | `TownRoom.ts:2673-2699`, `:2576-2609` (warm grid), `server/mobView.ts:36-48`, `server/mobGrid.ts` | measured: loop closure 6-8% self, mob view 15% | A mob must enter the index on every wake path (hero comes near, gets a target, is hit, burn, ritual). Change trees of never-visited mobs stay undiscarded: check they are bounded. `tests/mobview.test.ts`. |
| S2 | Spike, then decide: take `Mob` off `Schema`. Mobs are not in the synced state; the class is a Schema only so the mob view can read its change tree. Plain fields plus a dirty bitmask for the 25 wire fields would make every mob read a plain property. For `Player` (must stay a Schema) snapshot hero positions into plain objects once per tick for `heroNear` / `playerNear` / `pickTarget`. | `TownRoom.ts:216-316`, `server/mobView.ts`, `tests/mobgrid.test.ts:59` | measured: getter 15-19% self. Which share is Mob and which is Player: guess, the spike answers it. | Medium. `MOB_FIELDS` order rule still applies. `trackSchemaMoves` and tests read `~changes`. |
| S3 | Replace full-map scans that already do a box test with `mobs.inBox` (same order, so same first match). | `TownRoom.ts:5976` (melee rewind, every swing), `:5078` (shock arc), `:4671` (storm rune), `:1247` (blobHeal), `:2252`, `:1335`, `:4053`, `:3502`, `:3539`, `:3330`, `:3441`, `:5744`; `inGate` (door check, scans all mobs with `Array.includes` per mob) | measured for melee rewind, blobHeal, inGate; read for the rest | Low. Radii must match. `tests/mobgrid.test.ts` covers `inBox`. |
| S4 | Fast paths per awake mob: compute hero-near once and pass it into `updateMob`; skip `moveStep` when the input is still; `statusOf` returns early with nothing active; skip `tickUnit` for a mob with no burn, buff, stack or counter; `pickTarget` iterates the per-tick awake list and rejects on a box test first. | `TownRoom.ts:2684`, `:3009`, `:3240`, `:1583-1626`; `shared/skillEngine.ts:938`, `:972` | measured: `updateMob` 24-34%, `pickTarget` up to 5%. Gain per item: guess (audit estimate 20-35% of awake-mob cost). | Low. `statusOf` and `tickUnit` are shared with `tools/balance/duel.ts`: output must be identical, rerun the sims. |
| S5 | Stop repeated work: `claimSpot` / `treeFor` build the taken-spots set once per tick and back off after a failed search; `findPath` remembers a failure instead of re-running the BFS every tick; `updateGuards` at 1 Hz; `assignFlanks` over awake mobs only; necro and Hollow King count their children only when a raise is due. | `TownRoom.ts:1263-1314`, `:3477-3486`, `:2829-2843`, `:2381-2403`, `:2326`, `:3664`; `shared/bandits.ts:107-132` | measured: `claimSpot` 2-3%, `assignFlanks` 1%; read for the rest | Low. Guards return up to 1 s later; a fleeing mob finds cover a few ticks later. |
| S6 | Middle sleep tier: an idle mob with no hero within about 18-20 tiles updates every N ticks with summed dt (today everything within 28 tiles runs at full rate; the screen shows about 12, largest aggro range is 560 px). | `TownRoom.ts:521`, `:2598-2609` | guess: about half the full updates with spread players | Changes off-screen idle wandering only. Do after S1-S5 and only if the bench still calls for it. |
| S7 | Hero work: cache `equipped(p)` and talent bonuses per hero, invalidated on gear, level, stat or rank change; quest place checks at 5 Hz, staggered; one target query per projectile per tick instead of one per 4 px sub-step. | `TownRoom.ts:2644`, `:4540-4546`, `:5726-5750`, `:4193-4231`; `shared/skills.ts:968` | read. Gain: guess, matters at 50+ heroes or under skill spam | Cache must be dropped on every path that changes ranks (learn, respec, `/max`, save migration). Projectile hit order must stay "first hit, players then mobs". |
| S8 | Clear per-session entries of `runeCache`, `runeReady`, `ritualCd` on leave (slow leak). | `TownRoom.ts:4618`, `:4628`, `:2408`, `onLeave` `:954-972` | read | None. |

Also seen: the cast bench triggers Colyseus's "increase `Encoder.BUFFER_SIZE`" warning (a patch outgrew the 16 kB
buffer). N4 shrinks those patches; setting the buffer size is a one-line stopgap.

## Network

Mobs already go out per client through `MobView` (30 tiles in, 36 out, quarter-pixel ints, per-field diffs).
Everything else (players, projectiles, items, fields, zones, 157 `broadcast` sites) goes to every client on the map.
Production has per-message deflate on (level 1, frames over 256 bytes).

| # | What | Where | Evidence | Risk |
|---|---|---|---|---|
| N1 | Mob feed radius per client from its real viewport (client reports half-extent in `mvready` and on resize; server uses that plus about 6 tiles, clamped 16-30). | `shared/mobView.ts:20-22`, `server/mobView.ts:56-76`, `client/src/mobFeed.ts` | read. Guess: 50-70% of mob position bytes | Client and server ship together. Check pop-in at the 50% screen-size setting and after waygate travel. Also shrinks S1's per-patch work. |
| N2 | Positional events (`hit`, `swing`, `sfx`, `bhit`, `boom`, `drain`, `heal`) queued and flushed once per patch as one message per client, only to clients within view range. Global events (chat, kill, levelup, boss shouts, `hb`) stay global. | `TownRoom.ts:4982`, `:5873`, `:5952`, `:6195`, `:4886`, `:4234` and the other sites; `server/champions.ts`; client dispatcher in `TownScene.ts`, `sfx.ts`, `skillfx.ts` | read: cost grows with events times clients. Solo gain about zero. | Events arrive up to 50 ms later (same patch as the hp change). Every `ev` must still reach its sound or effect. |
| N3 | Compact mob position rows: numeric id plus one-byte deltas instead of string id plus two uint16; send `dir` as an index. | `server/mobView.ts:68-73`, `client/src/mobFeed.ts:44-48` | read: 14 bytes down to about 5 per moving mob per tick, before deflate | Lockstep change. Update `tests/mobview.test.ts`. Do after N1. |
| N4 | Stop per-tick writes nobody needs: follow-field `x`/`y` (client ignores them); `hp` regen and `energy` as whole numbers with an unsynced carry (as `mp` already does); projectile `x`/`y` (client flies the shot from origin, direction and a new `speed` field); `zones` out of the synced state (nothing reads it); round item and event coordinates. | `TownRoom.ts:2709`, `:2653`, `:2657`, `:2633`, `:4199`, `:409`, `:4253`; `shared/overload.ts:37-45`; `client/src/TownScene.ts:760-775` | read | No new `Player` fields (cap is 64). `coolHeat` is shared with the duel sim: keep behaviour identical, rerun sims. Projectile change is lockstep. |
| N5 | Not now: private `Player` fields behind a `StateView` (switches Colyseus to per-client encoding, costs patch CPU); patch rate 10 Hz (shows other heroes 110 ms later, touches hit registration). | | read | High. Revisit only if T1 shows player state dominating wire bytes. |
| N6 | Ideas board sent on open, not on join and on every vote. | `TownRoom.ts:878-886`, `:949` | read: up to about 10 kB per push | Board badge freshness. |

## Load time, HTTP, saves

| # | What | Where | Evidence | Risk |
|---|---|---|---|---|
| L1 | Long-lived caching for `/assets/**`: build writes a content-hash manifest, loaders append `?v=<hash>`, server answers `immutable` when `v` is present. Today 1,149 art and music files get `max-age=0` and are revalidated one request each on every visit. | `server/index.ts:57-63`; `client/src/artAssets.ts`, `gear.ts`, `textures.ts`, `music.ts`, `beastForms.ts`, `skillMoves.ts` | read. Guess: every deploy invalidates all art for all players (ETag from mtime in a fresh Docker build) | Hash must come from file content or stale art is served. |
| L2 | Load Phaser and `TownScene` with `import()` from `launch()` and start fetching that chunk and the first art while the player types. The login form currently waits for the whole 2.9 MB chunk. | `client/src/main.ts:1`, `:16`, `:355-361`; `vite.config.mts` | measured chunk size | Low. Rejoin path must await the same import. |
| L3 | Preload only the local hero's sheet; other classes and the 30 NPC sheets on first sight. Today all 37 sheets load before play: 12.9 MB download, 327 MB of decoded texture. In `tools/art`, give NPCs only the animations they use and repack sheets to at most 4096 px tall (they are 5760 now). | `client/src/artAssets.ts:38-44`, `:82`; `TownScene.ts:371-376`; `tools/art` | read (sizes from file headers) | An NPC or hero appears a moment late: hide until loaded. |
| L4 | Small: brotli precompression of text assets; the gzip cache map stores a null per requested path and grows without bound; `UV_THREADPOOL_SIZE=16` (scrypt logins and ws deflate share four threads after a deploy); JSON save backend re-stringifies every account at least every 30 s. | `server/index.ts:23-51`, `Dockerfile`, `server/store.ts:38-41` | read | Save item only matters if production uses the JSON file (see decisions). File format must stay identical. |

## Client runtime

Nothing here is measured. T3 comes first; items marked guess may drop out once it has run.

| # | What | Where | Evidence | Risk |
|---|---|---|---|---|
| C1 | Static world out of the per-frame path: keep trees, fences, rocks, house strips and props in a spatial grid and add or remove them from the display list by chunk round the camera. Today every static object on the map is a game object that `IsoView.pre`/`post`, the pixel-grid sync and Phaser's visibility filter (two cameras) walk every frame. Set `cameraFilter` once; call `setDepth` only on change. | `client/src/iso.ts:229-306`, `pixelgrid.ts:59-67`, `ambient.ts:238-259`, `isobuild.ts:466-481`, `worldProps.ts:694-699` | read. Object count: guess (over 10,000) | Tall props need a margin; chimney and flat-layer logic in `pre()` needs care. |
| C2 | Darkness overlay: exclude `dg_dark` from the JS smooth pass and redraw at 20 Hz. Today a per-pixel Scale2x runs on it every frame underground and at night with the torch on. | `client/src/dungeon.ts:404-446`, `smooth.ts:10`, `:173-177` | read | None visible. One-line core fix. |
| C3 | Hotbar: build the cells once and update only cooldown height and number. Today the HTML is rebuilt every frame and `innerHTML` replaced every frame while any skill cools down, followed by forced layout reads. Same for the NPC prompt. | `TownScene.ts:2614-2655`, `:2869`; `orbs.ts:186-198`; `resourceBars.ts:174`; `npcs.ts:457` | read | None visible. |
| C4 | Cull off-screen heroes like mobs (skip gear sync, effects, texture loads); drop gear textures no entity uses (each worn item is an 8.85 MB sheet, never unloaded). | `client/src/gear.ts:79-142`, `TownScene.ts:2955-2966` | read | Gear appears a moment after a hero walks into view. |
| C5 | Texture memory: grass chunks at 2x instead of 3x (each is 19.8 MB, 4-9 live; the pixel-grid pass already snaps to 2 px blocks); bake only the tileset rows in use; in the smooth look hide the ground tile layer once painted ground covers it. | `client/src/details.ts:122-147`, `:580`; `tileset.ts:671`; `iso.ts:91-121`; `ambient.ts:497-510` | read: about 80-180 MB grass, 85 MB tilesets | Slightly softer grass: compare screenshots. |
| C6 | Draw calls on phones: one atlas for the roughly 90 mob images, shared atlases for generated prop canvases; test `autoMobilePipeline: false`. Phaser uses a single-texture pipeline on mobile, so every texture switch is a draw call. | `client/src/textures.ts:344-349`, `main.ts:337-345`, `tools/art` | read. Draw-call count: guess | Needs a real phone. |
| C7 | Fold colour grade and vignette into the pixel-grid shader (three full-screen passes become one); `antialiasGL: false`. | `TownScene.ts:411-420`, `pixelgrid.ts:23-68`, `main.ts:340` | read. GPU cost: guess | Colour must match: screenshot diff. Needs a real phone. |
| C8 | Smaller per-frame costs: skip hit numbers for culled targets and pool the Text objects; particles of each blend mode on their own depth; cache `activeOf` per hero; quest tracker, markers and party frame at 5-10 Hz; trees as Images, off-screen emitters and item tweens paused. | `TownScene.ts:1343-1358`, `:1740-1756`, `:2913-3227`; `skillfx.ts:107-121`, `:2314-2337`; `gear.ts:102`; `npcs.ts:474-498`; `ambient.ts:248-333` | read | Tiny particle ordering change. |
| C9 | Startup: the smooth pass runs twice per generated canvas (once on the blank one); build houses and props per region instead of the whole map behind the loading screen. | `client/src/smooth.ts:162-171`, `TownScene.ts:378-403` | read. Duration: guess | Lazy building can hitch: spread over frames. |
| C10 | Product choice: 60 fps cap and a "low effects" setting. | `client/src/main.ts:337-345` | read | None for rules. |

## Suggested batches

`server/TownRoom.ts` changes go one after another, so the server track is serial. The client and load tracks can run
beside it in their own worktrees. Each PR carries bench numbers before and after (CLAUDE.md step 6); PRs touching
shared skill code also carry duel and PvE sim numbers (step 5).

| PR | Contents | Agents | Track |
|---|---|---|---|
| 1 | T1, T2, T3 | tester | first, alone |
| 2 | S3, S5, S8, N4 (follow-field part only) | gameplay-engineer, tester, reviewer | server |
| 3 | S4 | gameplay-engineer, tester, balance-analyst, reviewer | server |
| 4 | S1 | gameplay-engineer, tester, reviewer | server |
| 5 | S2 spike, then go or no-go | gameplay-engineer | server |
| 6 | N1, N3 | gameplay-engineer then client-engineer, tester | server, lockstep with client |
| 7 | N4 (rest), N6 | gameplay-engineer, client-engineer, balance-analyst | server, lockstep with client |
| 8 | N2 | gameplay-engineer then client-engineer | server, lockstep with client |
| 9 | L1, L2, L4 | gameplay-engineer (`server/index.ts`), client-engineer | load, parallel |
| 10 | L3 | art-audio, client-engineer | load, after 9 |
| 11 | C2, C3, C8 | client-engineer | client, parallel |
| 12 | C1, C4 | client-engineer, tester | client, after 11 |
| 13 | C5, C6, C7, C9 | client-engineer, art-audio | client, needs a phone |
| later | S6, S7, C10, N5 | | only if numbers still call for them |

## Decisions needed

1. Which goal leads: server headroom (players per room), bandwidth, phone frame rate, or load time. The batches
   above assume server headroom first, with load and client quick wins beside it.
2. Target number of players in one room. It decides whether S6, S7 and N2 are worth their risk.
3. Does production store saves in Postgres or in the JSON file (L4, save item).
4. Is a real phone available for C6 and C7. Headless Chromium cannot judge GPU cost.
5. Are two visible changes acceptable: monsters appearing a few tiles past the screen edge instead of 30 tiles out
   (N1), and idle monsters far off screen moving at a lower update rate (S6).
