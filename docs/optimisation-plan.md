# Optimisation plan

Status: plan only, nothing implemented. Written 2026-11-13 from three read-only audits (server tick, network and
saves, client runtime) plus measured baselines for server and client. Line numbers are as of commit `a4ebcf1`.

**Leading goal (owner, 2026-11-13): frame rate.** The game slows down noticeably on the owner's PC with one player
online. The client track therefore goes first; server and network work runs beside it at lower priority.

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
- There is no client perf tool in the repo; the client numbers below come from a one-off probe.

Client, one hero alone, production build in headless Chromium at 1920x1080 (scene counts while standing in town;
they barely change outside or in a fight):

| What | Value |
|---|---|
| Game objects in the scene's display list | 30,227 (13,009 Images, 16,794 Sprites) |
| Of those flagged visible each frame | about 13,600 |
| Objects in Phaser's update list (updated every frame) | 16,831 |
| Draw calls per frame | about 380 |
| Textures | 902-936, about 540 MB decoded |
| Animations registered | 5,241 |
| JS heap | 400-650 MB |
| Login to playable | 18-21 s in this environment |

Limits of that probe: headless Chromium draws in software and reached only 2-4 frames a second, so its milliseconds
say nothing about a real PC and GPU cost cannot be judged from it. The counts are exact. In the CPU profile, the
JavaScript time per frame is led by `IsoView.pre` (`client/src/iso.ts:229`), followed by Phaser's `batchSprite`,
`willRender`, `sortByDepth`, `getVisibleChildren` and `preUpdate`: all of them scale with the number of objects in
the scene, not with what is on screen.

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
| T3 | Client perf script: headless Chromium, desktop and phone viewport, walks a fixed route and records display-list and update-list size, draw calls, texture count and bytes, JS time per frame, time to first playable frame | new `tools/perf/client.cjs` (pattern: `tools/e2e-summoner-mobile.cjs`) | tester |
| T4 | In-game perf readout (`?perf=1`): frames per second, script time for update and for render, object counts, draw calls, texture MB, GPU name, with a copy button. Lets the owner read real numbers on the PC that is slow. | `client/src/` (new small module, cosmetic) | client-engineer |

T3 limit: headless Chromium renders in software, so it gives counts and relative JS cost, not real frame times, and
nothing about GPU cost. T4 on the affected PC is what tells CPU-bound from GPU-bound. Do T4 first.

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
| N7 | Bounded send backlog under compression. With per-message deflate each socket compresses one message at a time in the background (two a tick per hero: state patch and monster feed). When the tick loop is about 95% busy the compressor gets no time, the per-socket queue only grows (2,000 messages, about 10 s behind, 300-500 kB), pings wait behind it and the transport cuts every client after two missed pings (close code 1006). Options: send uncompressed while `ws.bufferedAmount` is above a limit (public API, keeps order); one message a tick instead of two (N2/N3); do not ping-kill a socket that still has a backlog. | `server/index.ts` (deflate options), `server/TownRoom.ts` (send path), `@colyseus/ws-transport` heartbeat | measured: `SPREAD=1 CAST=1 DEFLATE=1`, 20 bots: all bots dropped about 9 s after joining in most runs; default branch 3 of 3 runs. Only with a saturated server, so not the single-player slowdown | Compression ratio drops while a client is behind; needs a room test with a slow consumer |

## Load time, HTTP, saves

| # | What | Where | Evidence | Risk |
|---|---|---|---|---|
| L1 | Long-lived caching for `/assets/**`: build writes a content-hash manifest, loaders append `?v=<hash>`, server answers `immutable` when `v` is present. Today 1,149 art and music files get `max-age=0` and are revalidated one request each on every visit. | `server/index.ts:57-63`; `client/src/artAssets.ts`, `gear.ts`, `textures.ts`, `music.ts`, `beastForms.ts`, `skillMoves.ts` | read. Guess: every deploy invalidates all art for all players (ETag from mtime in a fresh Docker build) | Hash must come from file content or stale art is served. |
| L2 | Load Phaser and `TownScene` with `import()` from `launch()` and start fetching that chunk and the first art while the player types. The login form currently waits for the whole 2.9 MB chunk. | `client/src/main.ts:1`, `:16`, `:355-361`; `vite.config.mts` | measured chunk size | Low. Rejoin path must await the same import. |
| L3 | Preload only the local hero's sheet; other classes and the 30 NPC sheets on first sight. Today all 37 sheets load before play: 12.9 MB download, 327 MB of decoded texture. In `tools/art`, give NPCs only the animations they use and repack sheets to at most 4096 px tall (they are 5760 now). | `client/src/artAssets.ts:38-44`, `:82`; `TownScene.ts:371-376`; `tools/art` | read (sizes from file headers) | An NPC or hero appears a moment late: hide until loaded. |
| L4 | Small: brotli precompression of text assets; the gzip cache map stores a null per requested path and grows without bound; `UV_THREADPOOL_SIZE=16` (scrypt logins and ws deflate share four threads after a deploy); JSON save backend re-stringifies every account at least every 30 s. | `server/index.ts:23-51`, `Dockerfile`, `server/store.ts:38-41` | read | Save item only matters if production uses the JSON file (see decisions). File format must stay identical. |

## Client runtime

Counts are measured (see Baseline); real frame times and GPU cost are not. Two candidate causes for the slowdown
on the owner's PC, to be told apart with T4:
- CPU: 30,000 scene objects and 16,800 per-frame updates (C1). Certain to cost time on any machine.
- GPU: about 540 MB of textures and three full-screen passes (L3, C5, C7). Decisive on integrated graphics.

| # | What | Where | Evidence | Risk |
|---|---|---|---|---|
| C1 | Static world out of the per-frame path: keep trees, fences, rocks, house strips and props in a spatial grid and add or remove them from the display list by chunk round the camera. Today every static object on the map is a game object that `IsoView.pre`/`post`, the pixel-grid sync and Phaser's visibility filter (two cameras) walk every frame. Set `cameraFilter` once; call `setDepth` only on change. | `client/src/iso.ts:229-306`, `pixelgrid.ts:59-67`, `ambient.ts:238-259`, `isobuild.ts:466-481`, `worldProps.ts:694-699` | measured: 30,227 objects, 16,831 in the update list, `IsoView.pre` is the top JS cost | Tall props need a margin; chimney and flat-layer logic in `pre()` needs care. Trees and bushes are Sprites that only ever set a frame: make them Images so they leave the update list. |
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

Frame rate leads, so the client track goes first. `server/TownRoom.ts` changes go one after another, so the server
track is serial; it runs beside the client track in its own worktree. Each PR carries numbers before and after:
client PRs from T3 and T4, server PRs from `npm run bench` (CLAUDE.md step 6); PRs touching shared skill code also
carry duel and PvE sim numbers (step 5).

Client and load track (priority):

| PR | Contents | Agents | Note |
|---|---|---|---|
| C-1 | T4, T3 | client-engineer, tester | first; the owner reads T4 on the slow PC and the result orders C-3 to C-5 |
| C-2 | C1 | client-engineer, tester, reviewer | the one certain win; largest change |
| C-3 | C2, C3, C8 | client-engineer, reviewer | small, can run beside C-2 (different files except `TownScene.ts`: merge C-2 first) |
| C-4 | L3, C5 | art-audio, client-engineer | texture memory; move ahead of C-2 if T4 shows the PC is GPU-bound |
| C-5 | C7, C6 | client-engineer, art-audio | GPU passes and draw calls; C6 needs a phone |
| C-6 | L1, L2, L4 | gameplay-engineer (`server/index.ts`), client-engineer | load time |
| C-7 | C4, C9 | client-engineer | |

Server and network track (beside it):

| PR | Contents | Agents | Note |
|---|---|---|---|
| S-1 | T1, T2 | tester | |
| S-2 | S3, S5, S8, N4 (follow-field part only) | gameplay-engineer, tester, reviewer | results unchanged |
| S-3 | S4 | gameplay-engineer, tester, balance-analyst, reviewer | |
| S-4 | S1 | gameplay-engineer, tester, reviewer | |
| S-5 | S2 spike, then go or no-go | gameplay-engineer | |
| S-6 | N1, N3 | gameplay-engineer then client-engineer, tester | lockstep with client |
| S-7 | N4 (rest), N6 | gameplay-engineer, client-engineer, balance-analyst | lockstep with client |
| S-8 | N2 | gameplay-engineer then client-engineer | lockstep with client |
| later | S6, S7, C10, N5 | | only if numbers still call for them |

## Decisions

Settled:
- Leading goal is frame rate.
- Saves: production keeps accounts in `data/saves.json` on a Railway volume (a disk that survives deploys), not in
  Postgres. So the save item in L4 applies, at low priority. Separate from performance: `DEPLOY.md` notes the volume
  is the only copy of player accounts unless volume backups are switched on in Railway.

Open:
1. What the slow PC is (graphics chip, browser) and what T4 reads on it. Until then C1 goes first because it is
   certain; texture memory (C-4) moves up if the PC turns out to be GPU-bound.
2. Target number of players in one room. It decides whether S6, S7 and N2 are worth their risk.
3. Is a real phone available for C6. Headless Chromium cannot judge GPU cost.
4. N1 in plain terms: the screen shows about 12 tiles from the hero to each edge, and the server sends every monster
   up to 30 tiles away, about two and a half screens in each direction. N1 would send only those up to roughly half
   a screen past the edge. Nothing on screen changes; the open point is whether a monster can be seen arriving late
   after a waygate jump or at the smallest screen-size setting, which QA should check when S-6 is built.

## Progress log

2026-11-13
- Merged on the work branch: S-1 (bench: wire bytes, `PHASES=1`), S-2 (grid scans, repeated searches, leak; the
  raider sweep and the full walk in `assignFlanks` were left as they are, see the commit), C-1 (`?perf=1` readout,
  `tools/perf/client.cjs`). S-2 still needs a bench before/after and a full test run on a quiet machine;
  `tests/champions.test.ts` failed in the full run before and after S-2 and passes alone.
- In work: C-2 (static world), C-3 (per-frame fixes), S-4 (active monsters), and an investigation of decode errors.
- Found on the way:
  - Canvas size. At a 1280x720 window with Screen size on Auto the game renders a 2560x1440 canvas (auto picks 50%,
    and the canvas is window size divided by that factor). Small windows and scaled displays therefore render the
    most pixels, through three full-screen passes. Candidate cause for slowdown on integrated graphics; the readout
    shows canvas size and GPU name. Belongs with C7.
  - Phones: about 8,140 draw calls per frame in the Pixel 7 preset against about 390 on desktop (two counters
    agree). Raises the priority of C6.
  - Decode errors (`"refId" not found`, invalid UTF-8) appear with per-message deflate on, in the bench bots and in
    headless Chromium against the production build, on a loaded machine. Never seen with deflate off. Suspected
    cause: state patches are handed to the socket as a view of the encoder's shared buffer while compression runs
    asynchronously. Under investigation; not yet confirmed for real players.
    **Confirmed by reproduction** (minimal room, 40 clients, starved thread pool: 475-626 mismatches and
    3,000-4,000 bad items per 15 s with deflate, 0 with a copy before sending, 0 without deflate; with the
    default pool and login-like background work: 96 bad items, 0 with the copy). Mechanism:
    `@colyseus/schema` `Encoder.encode` returns a view of `sharedBuffer`, `SchemaSerializer.applyPatches` hands
    that view to every socket, and `ws` compresses later without copying (one process-wide limiter, 10 jobs at a
    time), so a socket still waiting when the next patch is encoded sends corrupted bytes. The full state sent
    on join has the same exposure (code reading only). Ordinary messages ("mv", "sfx") are copied and safe;
    browser to server is safe. The client does not detect a corrupted patch: values stay wrong until they change
    again. Fix, not applied: copy the patch once before sending (wrap the serializer's `encode` and
    `getFullState` from `TownRoom.onCreate`, in a small `server/` module), with a test that patch N's bytes are
    unchanged after patch N+1. Not reproduced with the real room. The bench bots have a second bug of the same
    kind in the other direction (`ws` client, bot only), which is why `DEFLATE=1` bench figures are unusable.
    Repro scripts were in the session scratchpad and are not in the repo.
  - `PHASES=1` showed `updateWatch` (about 4 ms) and `updateUndeadNight` (about 1.5 ms) per tick on a loaded
    machine; S-4 looks at why.

2026-11-13, later: first wave merged on the work branch
- Merged: S-1, S-2, S-4 (S1: active monsters), C-1, C-2 (C1: static world), C-3 (C2, C3, C8), and the fix for
  corrupted patches under deflate (`server/patchCopy.ts`).
- Checks on the merged branch: build and `tools/smoke.mjs` pass; `npm test` 146 pass, 0 fail, 1 skipped.
  `tests/voidconjure.test.ts` "the lance reached the far skeleton" is timing-dependent and fails now and then: 3 of
  15 runs on the untouched base, 2 of 15 on the branch.
- Server bench, quiet machine, before to after:

  | Scenario | Tick avg | Patch avg | Ticks/s |
  |---|---|---|---|
  | 5 bots, clustered | 9.2 to 5.2 ms | 5.9 to 2.0 ms | 19.6 to 19.8 |
  | 20 bots, `SPREAD=1` | 17.3 to 19.7 ms | 8.5 to 7.9 ms | 19.6 to 19.7 |
  | 20 bots, `SPREAD=1 CAST=1` | 43.2 to 40.4 ms | 11.3 to 11.7 ms | 16.0 to 17.4 |

  The 20-bot runs vary with random bot placement (384 active monsters after, 273 before). The fixed cost of a quiet
  server is roughly halved; a busy server is not faster yet: `updateMob` dominates there (S4 next).
  With `DEFLATE=1`, 20 spread bots: 12.7 kB per player per second on the wire (26.6 uncompressed), no decode errors.
  kB per player varies 18-25 between identical runs, old code and new.
- Client probe (`tools/perf/client.cjs`), standing in town, before to after:

  | | Desktop 1920x1080 | Pixel 7 preset |
  |---|---|---|
  | Display list | 30,227 to 1,508 | not recorded to 1,315 |
  | Update list | 16,831 to 281 | not recorded to 281 |
  | Draw calls per frame | about 380 to 111 | about 8,140 to 406 |
  | Textures | about 540 MB, unchanged | about 500 MB |

  Console errors in both probe runs: none (every run before the patch fix had `"refId" not found`).
  Script time per frame in the same software-rendered browser fell from about 15 + 63 ms (update + render) to
  about 5 + 11 ms in town; these figures do not transfer to a real machine.
- Not done from this wave: darkness overlay still redraws every frame (lights would slide at 20 Hz); minimap
  markers still rebuilt per frame; the raider sweep and `assignFlanks` keep their loops; the top-down view
  (`?iso=0`) is not chunked.
- Not verified in a browser: dungeons, waygate jumps and respawn with the chunked world; Blizzard's particle
  order; party frame and quest tracker timing; the hotbar on a phone (its first slot sat off screen in one run;
  unknown whether that is older than this work).
- Found, not fixed: `OVERLAY_DEPTH = 5000` in `client/src/iso.ts` is compared against world-y depth, so everything
  south of about tile 156 is treated as an overlay (never culled, sorted by world y).
- Next: S4 (awake-monster fast paths), L3 and C5 (texture memory, still about 520 MB), C7 with the canvas-size
  finding, L1, L2. Order of the GPU items depends on the `?perf=1` reading from the owner's PC.
- Review of the first wave: OK TO MERGE, nothing blocking. Follow-ups taken: destroyed objects now leave the static
  grid's cells; a warning on `Mob.dozy`. Follow-ups open: the PR text must also list the taken-spots cache (a spot
  freed within a tick stays taken until the next), the darkness overlay skipping the smooth pass, and the HUD parts
  now updated about 8 times a second; a live old-versus-new check of `assignFlanks` in `tests/mobactive.test.ts`;
  `ws` is imported by `tools/perf/bots.ts` but not declared in `package.json`; the "refId not found" gotcha in
  `CLAUDE.md` is now explained and should be reworded by the owner.

2026-11-14
- Owner: the game is built for computers only. Nothing is done for phones: C6's phone work and every "needs a
  phone" note above are void, and checks run at desktop window sizes only. `CLAUDE.md` step 7 and its decode-error
  gotcha are reworded accordingly.
- QA in a browser runs before the PR for the first wave.
- Second wave started: S4, L3, C5; then L2, C7, L1, L4.

2026-11-14, later
- First wave merged to the default branch as PR #398 (CI green). `ws` is now a declared dev dependency.
- Second wave is on the work branch, on top of the new default branch (which had gained the Songweaver class):
  - S4 (awake-monster fast paths, `server/schemaFast.ts`). The Songweaver work added a resonance status word, a
    mode word and note forgetting; `statusOf`'s early return and `quietUnit` skipped them and three Songweaver
    tests failed after the merge. Fixed; `tests/mobtick.test.ts` now fails if either is forgotten. Re-checked on the
    new base: replays with fixed random numbers give identical hashes before and after in six scenarios (5 bots,
    20 spread, cast, night, Songweavers casting, Songweavers in parties); seeded `duel.ts` and `pve.ts` md5s match.
    Update CPU per tick in those replays: 11.1 to 8.9 ms (5 bots), 28 to 19.7 (20 spread), 53 to 36.7 (cast).
    Bench, 20 spread: tick about 31.6 to 17.9 ms. The cast case still misses the 50 ms budget in most runs.
  - C5 (grass chunks at 2x, tileset rows, hidden ground layer): about 634 to 504 MB in town, 720 to 555 MB in a
    meadow, counting chunk render textures (the probe's texture figure leaves those out). Grass was compared at
    night only.
  - L3 (character sheets on demand): texture manager in town about 497 to 203-233 MB. Being re-checked on the new
    base (Songweaver sheet, NPC speech bubbles).
- Still to do for the second wave: reviewer, desktop QA (1920x1080 and 1366x768), patch note, PR.

2026-11-14, evening
- Second wave: reviewer says OK TO MERGE. Follow-ups taken: a hero whose sheet has not arrived cannot be targeted;
  sheets are requested from 900 px (`SHEET_RANGE`); a console warning when a layer needs more tileset rows than the
  trimmed tileset has. Follow-ups open: one frame of background colour after a camera jump; a missing sheet is
  retried forever; a test that fails when new per-monster state is not added to the fast paths; `TownRoom.ts` grew.
- Desktop QA of the second wave (1920x1080 and 1366x768, production build): login with all four classes, town
  NPCs, first quest, two heroes seeing each other, ground by day in six places, long walk, Screen size changes,
  death and respawn, sinkhole, dungeon, combat, `?pixel=1`, `?iso=0`: pass, no console or decode errors.
  - Grass by day against the default branch, same camera: equal in meadow, bridge and field; tuft edges 4% (town)
    to 20% (gate) softer by an edge measure, not visible side by side.
  - Seen once in three respawns (none in three on the default branch): for about a second after the jump part of
    the screen shows the plain tiles while the painted ground catches up. Software rendering at 1-6 fps; the plain
    tiles are the intended fallback. Low, to watch.
  - Not covered: water animation (cannot be told at 1-3 fps, same on both builds), Morwen's dialog, desert and
    Saltmere by day.
  - Not from this work, also on the default branch: two level-50 heroes outside the gate lose health quickly with
    no monster in sight; cause not found.
- Merged the default branch again (8 commits: `Player` moved to `server/player.ts`, owner-only `Player.me` behind a
  per-client view, 256 KB encoder buffer). No conflicts; `fastFields(Player)` still applies. 213 tests pass, build
  and smoke pass. Bench after the merge: 5 bots tick 4.9 / patch 2.3 ms; 20 spread 12.7 / 7.6; 20 spread cast
  26.8 / 12.1 at 19.1 ticks/s.
- Found while re-running the bench: N7 above. The bench used to print normal-looking numbers after losing all its
  bots; it now reports `botsDropped` and `sendBacklogKbMax` and marks such a run invalid.

2026-11-14, night
- Second wave merged as PR #403 (GitHub Actions had stopped starting jobs for the repository for some hours; the
  checks passed on a re-run).
- Third wave on a local integration branch, on top of the merged default branch: N7, L2, L1.
  - L1 (asset caching): `?v=<8 hex of sha256>` on every art, music, font and clip URL from a build-time manifest
    (1,333 files, 13 kB gzip, its own chunk); the server answers `immutable` only when `v` is the hash of the file
    it sends. Second visit: art and music requests reaching the server 137 to 0. A clean rebuild gives the same
    manifest, so a deploy no longer invalidates unchanged art. Cost: any art change renames the scripts that import
    the manifest chunk (main, game), so they are downloaded again once.
  - L2 (login split): entry script 414 kB gzip to 34 kB (about 55 kB with its static imports); Phaser and the scene
    load through `import("./game")`, started at page load. Form wired at about 0.4 s instead of 1.4-2.0 s
    (localhost, cache off); the main thread is then busy about 1.6 s on this machine while the game chunk
    evaluates. Page open to play unchanged: median 25.1 s before, 24.2 s after (5 alternating runs, software GL).
    The update notice no longer pre-downloads the game chunk (it is not named in `index.html`).
  - N7 (send backlog). The byte-limit idea in the table above did not work: the cost is per message. What is in:
    `guardSendBacklog` (at most 2 compressed sends unfinished per socket, later ones uncompressed) and
    `concurrencyLimit: 256` for `ws`'s zlib queue (the default 10 made every socket wait behind all the others).
    The bench bots compress every message they send, as browsers do (they always did; the bench now reports it as `compressedInPct`). 20 casting bots: dropped in 8 of 9 runs before, 0 of 8
    after; send delay p99 about 0.1-0.2 s, wire/payload 0.55 instead of 0.51 when the server keeps up.
    Not solved: the incoming side. The server inflates each client message one at a time per socket and reads a
    pong only after the messages before it. 40 casting bots (server over budget, 13-16 ticks/s): all dropped when
    each sends about 45 messages a second; none dropped at about 9 a second (`CAST_EVERY=5`), but pongs were
    4.8-7.8 s late against a cut-off of 6-9 s. A real browser could not be measured here (the sandbox's Chromium
    stalls by itself). Options left for the owner: more missed pings allowed before the cut (`pingMaxRetries`),
    or compression off (about 35% more bytes).
  - Review of the third wave: NOT OK at first. A request path with `%00` made the new `?v=` middleware reject
    unhandled, which shuts the server down. Fixed (`versionedCache` never rejects, tests for hostile paths, checked
    against a running server). Also fixed: a throw while building the game (reload message instead of an endless loading screen).
  - Second review: NOT OK again, for a regression from the first fix round: `launching` stayed set after a start,
    so after a refused join ("already playing", server not up yet) Resume did nothing until a manual reload.
    Replaying it in a browser (two tabs, same hero) showed the retry had not worked before this wave either:
    `worldscale.ts` kept the destroyed game and the next start threw on it, leaving the loading screen up.
  - Third review: NOT OK, for the fix to that: freeing the launch on Phaser's destroy event let a second game start
    on a page that still carried the first scene's window listeners and HUD parts (chat lines lost, three game
    menus). Final design: a join that fails reloads the page (`reconnect.ts` `failToStart`), and the start screen
    shows the reason with the form filled in (`takeStartNote`); a page builds one game. Browser replay: refused
    twice (one reload each, message and form filled), in on the third try once the hero is free, one canvas, one
    game menu button, chat sends, Esc opens one menu, no page errors.
