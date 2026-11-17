# Ages (roadmap M5): progress log

Goal: two versions of the game (two "Ages") run side by side on one Postgres, so a new version can open to some
players while the current one keeps going, and the clan war, accounts and world carry across both.

## Plan (planner, summary)
- **Option A (proposed): two slot services and a tiny gateway.** Two Railway services run the same image with
  different builds (`AGE_SLOT` = e.g. `blue` / `green`), both on the one Postgres. A small gateway in front routes each
  player to an Age (by choice or cohort). **Needs the owner's OK** before it is built: a second service costs money, and
  the gateway needs a DNS change.
- Roles per Age (env `AGE_ROLE`): `primary` (default; runs the singleton timers: the war's tick, the world's writes),
  `vanguard` (the new Age being tried; follows), `draining` (the old Age on its way out; follows).
- Everything shared is versioned so an older build never damages what a newer one wrote: the war save first
  (`shared/war/api.ts`), accounts later (a per-account version and `minReader`, same idea).
- PR order: 2a leases + 3 war ownership (this PR) -> accounts versioning -> gateway and second slot (after the OK).

## Built (PR 2a + PR 3, branch `claude/ages-war-lease`)
Also makes today's single server safer: a deploy's overlap no longer has two servers ticking the war.
- `server/lease.ts`: leases in table `leases(key, holder, until)`, taken with `INSERT ... ON CONFLICT ... WHERE until <
  now() OR holder = me` (`server/store.ts` `pgLeases`), renewed every 15 s (one call for all of a module's keys),
  45 s long, trusted locally only until 5 s before they run out. Holder id `AGE_SLOT:build` (default slot `main`).
  Only a primary competes. Without Postgres (JSON files, one process) a primary always holds.
- `server/store.ts`: `Store.loadOne`, `Kv.insertIfAbsent`, `Kv.list(prefix)`, `Kv.leases`, `Kv.close`; the leases
  table is created with the kv table. Existing behaviour unchanged.
- `shared/war/api.ts`: `WAR_API` (1), `minReader`, `warAccess` / `readable`.
- `server/war.ts`:
  - **Live bug fixed:** a save of a newer version used to be set aside and a fresh war written over `war`. Now a newer
    save is never written: shown read-only when `minReader <= WAR_API`, else hidden; no new war starts over it, and the
    server gives the lease back. A corrupt save (no usable version, or malformed) is still kept aside under
    `war-old-*` and a new war begins, as before.
  - Tick ownership via lease `lease:war`. The owner ticks and writes as before. Followers read the `war` row every
    15 s; when it changed they take it, and when the tick (or the log) moved they tell their listeners the same
    events, the Rally change and the Night Raiders' strike, so their Herald speaks.
  - Valor on a follower is queued in memory and written every 15 s as a batch to kv `war-valor:<holder>` (only that
    server writes it); the owner counts every queue's new batches before its tick and records the last batch counted
    per holder in the war save (`drained`), in the same write as the tick: never counted twice, never two writers.
  - Taking over (at start or when the old owner's lease ran out / was released): read the row, snapshot it once per
    build to `war-pre-<build>` (shared store only), then go on as the owner. Shutdown with a shared store: one last
    write, then the lease is released so the next server takes over within 15 s.
- `server/worldStore.ts`: lease `lease:world`; only the holder writes the world row, and on taking over it reloads it.
- Review fixes: the kv and lease pools time out (10 s connect, 10 s query; the accounts' pool unchanged, its big
  flushes must not be cut); `flushWar` stops a beat under way (`stopping`: no takeover, tick or save after it) and
  returns its promise, which `server/index.ts` waits for (at most 5 s); the war and world rows carry a write stamp
  (`wrote`), so a server regaining its own lease after a database outage keeps its unsaved progress unless another
  server wrote meanwhile; the lease trust window runs on `performance.now()`.
- `server/tide.ts`: no change (no timer of its own; its march owner is per process, among the rooms).
- Tests: `tests/ages.test.ts` (leases, api, newer / corrupt saves, follower ticks and events, follower valor, takeover
  and snapshot, losing the lease, shutdown), `tests/store.test.ts` (Postgres: leases, insertIfAbsent, list, loadOne).

## Built (part 2: the Forge's lease, branch `claude/ages-forge-lease`, on top of PR #496)
- `shared/forgeApi.ts`: `FORGE_API` (1) and `forgeAccess`, the war's contract (`shared/war/api.ts`) for the forge save
  (kv key `forge`): a newer save is read-only when `minReader` allows, else hidden, never written. Unlike the war, an
  object with no usable `v` still loads as version 1 (every forge save so far); only a non-object is corrupt (kept aside
  under `forge-old-*`, as before). `ForgeSave` gains optional `minReader` and `wrote`.
- `server/forge.ts`: lease `lease:forge` (its own `Leases` on the store's backend, like the world). Roles as the war's:
  owner / follower / read / hidden (`forgeRole()`, also in `/admin/forge`). One beat every `LEASE.renewMs` (the old 15 s
  clock): renew, take over when the lease became ours, then the owner runs `forgeClock`, the others reload the row.
  - Only the owner runs the clock and the gates, takes commissions and admin changes (kill, retire, revoke), and writes
    (`persist` checks at write time). A commission elsewhere is refused with `not_owner` (console-logged, nothing spent
    or saved), and also when this server does not tick the war: the army is paid from the war save, and a forge owner
    that is not the war's owner would have forged for free. A gate that finishes after the lease went is dropped; the
    project stays pending and the next owner gates it (`gatePending` at takeover; one queued already is not run twice).
  - Followers reload the row; when it changed and was not this server's own last write, they clean it and `rebuild()`
    (gear lookup, forged monsters, capital stock, a new pack to the rooms): items forged on the other server are known.
  - Takeover: read the row, snapshot it once per build to `forge-pre-<build>` (shared store only), load, gate pending
    research. Writes carry a stamp (`wrote`, shared store only: JSON saves keep their shape); regaining the lease with
    our own stamp still in the row keeps unsaved progress, another server's stamp reloads.
  - `flushForge` returns a promise: with a shared store it sets `stopping` (no takeover, clock or save after it), writes
    once more if it owns, waits for queued writes, and releases the lease. `server/index.ts` waits for it together with
    the war's, inside the same 5 s cap. Without a shared store: the blocking JSON write, as before.
- Review fix: the war's and the forge's leases could split (one server the forge's, another the war's), refusing every
  commission. With a shared store only the war's owner competes for `lease:forge`; a forge owner that lost the war
  writes the forge once more and releases (`handOver`), so the war's owner takes it at its next beat. A `not_owner`
  refusal on the forge's owner goes to the forge log (`/admin/forge`). A follower's init always installs the registry it
  loaded.
- Tests: `tests/agesForge.test.ts` (late gate dropped and gated once on takeover, the split leases resolving, a second
  follower init; api, JSON mode unchanged, a follower refuses and learns the owner's forgings,
  takeover with snapshot and gates, newer saves read-only / hidden, flush during a takeover, the lease lost and regained,
  shutdown write and release).

## Built (the gateway, branch `claude/ages-gateway`)
Owner's choice for production: one gateway and two game services (blue / green) on Railway, one Postgres. The code
only; the services are set up by the owner (`docs/ages-setup.md`).
- `server/gateway.ts`: reverse proxy on node:http / node:net, no dependency. `GATEWAY_TARGETS` (`slot=http://host:port,...`,
  bad entries fail at boot), `GATEWAY_PRIMARY` (default the first), `AGE_SPLIT` (weights; default 100 % primary),
  `ADMIN_KEY`, `PORT`.
  - Cohort cookie `ptb_age=<slot>` drawn by the split on a first visit (30 days, HttpOnly, SameSite=Lax, Secure when
    `X-Forwarded-Proto: https`), added to the proxied response. A cookie naming an unknown slot is drawn again.
    `/age/<slot>` sets it and redirects to `/` (404 for an unknown slot).
  - HTTP streamed both ways, hop-by-hop headers (and those `Connection` names) stripped, `X-Forwarded-For` appended (the
    edge's client stays first for `TRUST_PROXY`), `-Proto` / `-Host` kept or set. The body is read only once the
    backend accepted the connection, so a refused connection (or 5 s without one) retries the next live slot with the
    whole body.
  - **Deviation from the brief:** `/health` and `/matchmake/*` never fall back. A `/health` answered by the other Age
    would make `client/src/reconnect.ts` reload into it, and a seat reserved there is unknown to the WebSocket, which
    always goes to the cookie's Age; so these return 502 and the reconnect notice keeps polling, as with one server.
  - WebSocket: on `upgrade`, a net socket to the cookie's Age, the request line and headers replayed (with
    `X-Forwarded-*`), piped both ways, both closed on error / close. No fallback.
  - `/gateway/health` (the gateway itself) and `/gateway/status?key=ADMIN_KEY` (each backend's `/health`: ok, build,
    time; the primary and split; 404 without the key, as `/admin/*`).
- `server/start.ts` -> `server-dist/start.cjs` (new Dockerfile CMD): `require("./gateway.cjs").main()` when
  `GATEWAY_TARGETS` is set, else `require("./index.cjs")`, the game exactly as before in the same process (its SIGTERM
  handling unchanged). `npm run build:server` bundles `gateway.cjs` and `start.cjs`. `npm start` and the smoke test
  still run `index.cjs` directly. The gateway on SIGTERM stops listening and exits (open sockets cut after 3 s).
- Review fixes: a chunked request body keeps chunked framing to the backend (Node adds none for GET / DELETE /
  OPTIONS: raw bytes smuggled a second request); `/age/<slot>` for a weight-0 Age needs `?key=ADMIN_KEY`; a cookie-less
  visitor's Age is drawn from a hash of their address (first X-Forwarded-For hop, else the socket), not per request; a
  player leaving while the gateway connects no longer marks the backend down or retries; an HTTP exchange silent 60 s
  (once connected) is cut with 502; upgrades other than `websocket` get 400, and the pipe opens only after the
  backend's 101 (any other answer goes back to the client and closes). `server/start.ts`, `server/gateway.ts` and
  `railway.gateway.json` are in `area:deploy` (`tools/ci/critical-areas.mjs`).
- `railway.gateway.json`: the gateway service's config file (health check `/gateway/health`).
- Tests: `tests/gateway.test.ts` (config, cookie by weights, `/age/<slot>`, re-pick, body and headers, hop-by-hop,
  WebSocket pipe, fallback with body, pinned paths, status key), `tests/gateway-room.test.ts` (a hero joins the real
  room through the gateway: matchmake and WebSocket). `tests/helpers/room.ts` exposes the room's `port`.

## Open
- The gateway: "one account, one server" (ACCOUNT_LEASES) and account save versioning must land before two Ages take players
  at once (`docs/ages-setup.md`). No per-slot health memory beyond the log (each request tries its own Age first). A
  gateway redeploy drops every connection.
- On a follower, valor, sacks and town claims reach the owner (part 7). Battle deaths and banners, column losses and
  remote council submissions stay local until they get queues of their own (`server/ageQueue.ts`).
- A follower's rooms get no battle news (announce / start / end); they show the battles as saved.
- Council proclamations are not saved, so a follower's Herald does not repeat them.
- ~~A follower Age's Gloam Tide meter is its own~~: done in part 7 (below). Each Age still runs the march for its own
  heroes at the shared dusk; only the owner fills the meter, books and moves the march, and resets it.
- `war-pre-<build>` and the queue rows (`war-valor:`, `war-acts:`, `world-tide:`, `ideas-q:<holder>`) stay one per
  build; prune them once the Ages run for real.
- ~~Accounts are not versioned yet~~: done in part 5 (below).
- The Forge on a server where it is hidden (a newer FORGE_API that allows no older reader) knows no forgings: its heroes'
  forged items show as their base until the newer build is gone. Its log lines of refused commissions on followers go
  to the console only (the forge log is the owner's).
- A follower's room shows no forging's news beyond the new pack; `forge-pre-<build>` rows stay one per build (prune
  them with the war's).

## Built: part 3, one account, one server (branch `claude/ages-account-lease`)
Production is to be a gateway and two game servers on one Postgres. Before this, each server loaded every account at
boot and wrote from memory: a stale copy on server B rolled back progress A had saved, a login on B for an account made
on A after B started created a second account over it (password takeover), and "already playing" looked at one room.
- **When:** Postgres and (`AGE_SLOT` set or `ACCOUNT_LEASES=1`), `accountLeasesOn` in `server/accountGuard.ts`. Off
  (today's single server): the old code path, no extra queries, no `acct:` leases. `AGE_SLOT` without `DATABASE_URL`
  refuses to start. In shared mode accounts are not loaded at boot; memory holds the ones read lately.
- **Fresh reads:** `login`, `peek`, `setEmail`, `resetPassword` and `requestReset` read the row (`Store.loadOne`) unless
  this server holds the account. A new account is written at once with `Store.insertNew` (insert if absent); if another
  server made the name first, it is a normal login (password check). The reset by email looks the rows up in SQL
  (`Store.findBy`, `data->>'email'`). `/admin/backup` reads the table (`backupAccounts`), this server's held accounts on top.
- **Account lease** `acct:<lower-case name>` (`server/accountGuard.ts` `AccountGuard`, on `Leases.take` / `Leases.drop`,
  primary whatever `AGE_ROLE`): taken in `onAuth` after the password check. Held already: memory is newest ("mine");
  else the row is reloaded ("fresh"). Held by another server: 4 tries 1 s apart, then "This hero is playing on another
  server". Sessions are counted per account across every room of the process (a second hero: "already playing"). All
  held accounts renew in one call every 15 s. When the last session (or HTTP edit) leaves: save, wait for the COMMIT,
  then release; a failed write keeps the lease (retried at each renewal). Shutdown: after `flushFinal`, every lease
  but those of unsaved accounts goes back in one call (at most 5 s). A seat whose client left before `onJoin` (Colyseus
  then skips `onLeave`) gives its account back after 10 s.
- **Write fence** (`Store.saveFenced`, Postgres): in the flush's transaction, the lease rows still held by this holder
  (`until > clock_timestamp()`) are locked `FOR SHARE` in byte order, so no server takes one over until the commit; only
  those rows are updated, rows are never created by it. A refused account whose lease only lapsed (a database outage,
  nobody took it) stays dirty and keeps its lease (`settle` is false), so the next renewal takes it again and the write
  goes through; one a renewal showed another server holds is given up (logged). `pgLeases` takes and releases keys in
  the same byte order (`COLLATE "C"`, JavaScript's sort), so no deadlock with the fence.
- **Taken over while playing:** when a renewal shows another server holds an account in use here, its heroes are sent
  away (chat "This hero was opened on another server.", close code 4409) and nothing of it is written from here again.
- **Holder:** account leases use `AGE_SLOT:build:<random per process>` (`accountHolder`), so two processes of one build
  never share a holder; a restarted process gets a new one (its old leases were released at shutdown or run out).
- **HTTP edits** (email, reset code, new password) for an account not playing here: take the lease, reload, change,
  save, release; held elsewhere: "Leave the game first, then try again". A reset guess takes a lease only when a code
  is pending.
- No save field changed; the Player / Mob schema untouched.
- Tests: `tests/accountGuard.test.ts` (guard and shared accounts on an in-memory fenced table, `tests/helpers/fencedStore.ts`),
  `tests/accountLease-room.test.ts` (onAuth refused / taken, onLeave saves then releases, orphaned seat, sent away on takeover), `tests/store.test.ts`
  (Postgres: insertNew, fence, findBy).

### Open (part 3)
- A trade's two accounts are written in one transaction, but if one side's lease were lost, the other side is still
  written (the fence refuses rows, not the whole flush). Both traders are on one server, so this needs a lease lost mid-trade.
- An account whose row is missing (deleted by hand) while held: its refused writes are retried at each flush and the
  lease kept until the server stops.
- During a deploy's overlap with leases on, a player reconnecting to the new server while the old one still saves waits
  up to ~3 s and may be refused once; the client shows the message (no automatic retry yet).
- Held leases are trusted locally until 5 s before they run out; a server paused longer than that is fenced by SQL.

## Built: part 5, account save versions (branch `claude/ages-account-versions`)
An older build (a draining Age) must never damage a hero a newer build saved.
- `shared/accountApi.ts`: `ACCOUNT_API` (1), `ACCOUNT_MIN_READER` (1) and `accountAccess(raw)`: "write" (`av` up to this
  build's; a missing `av` is 1, every account so far), "read" (newer, `minReader` allows showing), "hide" (newer, or an
  `av` that is no version). The war's rules (`shared/war/api.ts`), per account row.
- `Account` gains optional `av` / `minReader`, stamped with this build's values whenever the account is queued for a
  write (`markDirty`) and on new accounts. No field renamed or dropped; old saves load as version 1 and are written
  with `av: 1`.
- **Refused:** an account this build may not write: `login` (after the password check) and `peek` (unless "read") say
  "This hero lives in the new Age: play it there"; `setEmail`, `resetPassword` (before a guess is counted) and the
  shared-mode `edit` refuse the same way; `requestReset` sends no code. `claimAccount` (shared mode reloads the row)
  checks again and gives the lease back, so a row written by a newer build between login and the room's claim is
  refused too. `saveHero`, `saveStash`, `markChest`, `resetChests` do nothing on it, `markDirty` refuses it and `flush`
  never copies it into a write (the last fence).
- **Unknown fields kept:** the account object is kept and changed in place, so its unknown top-level fields (and heroes
  of classes this build does not know) are written back as read. A hero's save is the room's snapshot, which knows only
  this build's fields: `saveHero` / `saveStash` copy the old save's fields that are not in `HERO_KEYS` (every
  `HeroSave` field, checked against the type) under the new snapshot (`keepUnknown`). Known fields the snapshot leaves
  out (no clan, `wear`) are still dropped. New game (`saveHero(..., reset)`) keeps nothing of the old hero.
- **The rule:** a new optional save field needs no bump (older builds keep it as it is). Bump `ACCOUNT_API` when older
  builds must not write the new saves (a field's meaning changed, a migration on load, a field an older build would
  clean away); raise `ACCOUNT_MIN_READER` only if older builds may not even list the heroes.
- Tests: `tests/accountVersions.test.ts` (the contract; JSON: old save written with `av` 1 and unknown fields, a newer
  account refused and untouched; shared: login, peek, edits, reset and a claim after a newer write refused, nothing
  written; room: unknown account and hero fields, a hero of an unknown class, survive login, play and save, New game
  drops the hero's).

### Open (part 5)
- "read" accounts are only listed by `peek`; nothing else shows them read-only (no viewer yet).
- A hero field this build once had and removed without keeping it in `HeroSave` is now kept on save as unknown (harmless,
  ignored on load).
- An account on a draining Age's memory that a newer build bumps while the old one does not hold its lease (shared mode)
  is refused at the next fresh read; in single-server mode (no leases) a stale memory copy is the part 3 issue.

## Built: part 6, status for both Ages (branch `claude/ages-metrics`)
- `server/agesStatus.ts`: `GET /admin/ages.json?key=ADMIN_KEY` (the admin check of `server/index.ts`, 404 without;
  mounted there with one line): slot, `AGE_ROLE`, build, `WAR_API` / `FORGE_API` (no account API version exists yet),
  lease holder ids, the roles of war / world / forge, the leases held, heroes and accounts online (counts), the account
  guard's counters, fenced refusals, flush lag and failures, uptime.
- Counters live in their modules, behind small getters: `AccountGuard.stats` / `held()` / `inUseCount()`
  (`server/accountGuard.ts`), `accountStats()` (`server/accounts.ts`: per-account time of the oldest unsaved change, kept
  across a failed or refused write; failures; refused rows), `warLease()`, `forgeLease()`, `worldLease()` (role "off"
  before `initWorld`), `onlineNow()` (`server/TownRoom.ts`, over `liveRooms`).
- `server/gateway.ts`: `/gateway/status` also asks each backend's `/admin/ages.json` with its own key (2 s, in parallel
  with the `/health` probe) and adds it per slot as `ages`, or `agesError` when it fails.
- `docs/ages-setup.md`: a "Checks" section reading both endpoints.
- No gameplay, save or schema change.
- Tests: `tests/agesStatus.test.ts` (key required; leases off: owner of all three; memLeases: follower, account counters,
  flush lag and failures, a lost account's refused write), `tests/gateway.test.ts` (the combined status, a backend timing out).

### Open (part 6)
- Flush lag and failures cover account saves only; the war's, world's and Forge's writes log their failures but have no
  counter yet.
- Nothing alerts on the numbers: someone has to look (or a later uptime check can read `/gateway/status`).

## Built: part 7, shared state (branch `claude/ages-shared-state`)
With two servers on one Postgres, what a player does on the server that does not own a shared row is neither lost nor
applied twice. Handoff spots and the idea log move to kv only in a real multi-server setup (`sharedStateOn` in
`server/ageQueue.ts`: Postgres and `AGE_SLOT` or `ACCOUNT_LEASES=1`, as the account leases); a single server, on files
or on Postgres, keeps `data/handoff.json` and the idea file exactly as before.
- `server/ageQueue.ts` (`AgeQueue`): the valor queue's machinery made generic. A follower writes its own kv row
  `<prefix><holder>` (numbered batches); the owner lists the prefix, applies each batch above its mark and keeps the
  marks (`drained`) in its own row, written with the change. Batches the owner counted are dropped by the follower.
  The war's valor queue now runs on it (same row format: old queue rows still read).
- **Handoff spots** (`server/handoff.ts`): in multi-server mode each spot is also kv `handoff:<account>:<class>` (written when the
  hero leaves; shutdown waits for those writes), taken (read and deleted in one statement, `Kv.take`) in `onAuth` after
  the account is this server's (`fetchLive`); the newer of it and local memory wins. Spots older than 5 min are ignored,
  and pruned at start (`Kv.del`). `data/handoff.json` is still read once at start (a deploy from an older build).
- **Idea log** (`server/ideaStore.ts`): in multi-server mode the log is kv row `ideas` (copied once from `data/ideas.json` when
  the row does not exist), written only by the holder of `lease:ideas`. Followers reload it every 15 s and queue their
  heroes' ideas and votes (`ideas-q:<holder>`): checked against the log they show, shown at once (a new idea under a
  temporary negative number, never sent as a vote target), numbered by the owner. The rooms' hourly round runs on the
  owner only; a follower's rooms announce winners they see in the reloaded log and refresh boards on any change.
  `/ideas.json` and `/admin/backup` show the shared log. Shutdown: the owner writes and releases, a follower writes its queue.
- **Gloam Tide kills** (`server/worldStore.ts`, `server/tide.ts`): a follower queues its blob kills (`world-tide:<holder>`)
  and shows the owner's meter plus its kills not counted yet (reloaded every 15 s). The owner adds them each beat
  under the owner's rules (not while full or a march is called), marks in the world row (`drained`, optional). On a
  follower the Tide never fills the meter, books or moves a march (TideHost `follows` / `queueKill`, optional: absent
  means owner, as before). The world's kv pool now also carries its leases (no separate lease pool).
- **Sacks and town claims** (`server/war.ts`): on a follower `strikeHold` queues the sack and `townClaim` the claim
  (`war-acts:<holder>`, its marks in the war save's optional `drainedActs`); the owner applies them every beat (not
  only at its tick) as if made there (Herald, every room, valor of the claim) and saves once. A sack counts only in the
  war tick it was made in and once per land per tick (`warSacked`, read from the war's log, also checked by
  `server/warHolds.ts` so no server sacks a land already sacked elsewhere); a claim only while the town is still
  contested by that clan. A follower refuses a second claim of a town it queued until the owner's war shows it.
- `Kv.take` / `Kv.del` (Postgres; optional, JSON kv has neither: the handoff stays on the file).
- No save field renamed or dropped; new optional fields only (`drainedActs` in the war save, `drained` in the world
  row). No schema change.
- Tests: `tests/agesShared.test.ts` (the queue; handoff taken once on another server, expired ignored and pruned, JSON
  mode on the file; ideas from both servers, once, across an owner restart and change; Tide kills once, across restart
  and change, and the follower's Tide; a sack and a claim once, across restart and change, a second sack that tick
  dropped), `tests/store.test.ts` (Postgres: take, del).

### Part 7 review fixes (branch `claude/ages-shared-fixes`)
- **Rewards of a follower's sack or claim wait for the owner.** Design chosen: *grant only when accepted*. Each act a
  follower queues carries an id and (a sack) its clan-side reward (`ActMeta`: `valor`, Reckoning `credits` = the hero
  keys of the sharers); the owner, in `applyAct`, adds that valor and crown credit only when it applies the act, and
  notes every act's fate in the war save (`fates`, optional, last 500: 1 applied, 0 dropped). The follower's rooms
  (`server/warHolds.ts`, `server/warTowns.ts`) put the banner up at once (sfx, guards home, the Hold marked sacked
  here) but keep the hero-side part (the war chest, renown) in a per-room `waiting` list; once a later war read shows
  the act's fate as applied they pay the sharers still in the room, and a dropped act (or none answered within
  `ACT_FATE_MS`, 3 min: e.g. an older owner) pays nothing and the sacker is told. Why not the local grant: with N
  servers each could sack the same Hold in the same tick before the owner's log reaches them, so "one per server" still
  lets N heroes take the chest and renown for one counted sack. The cost: a 15-45 s wait for the pay, and a sharer who
  logs out meanwhile gets no renown. Single server (owner) unchanged: everything at once, as before.
  `townClaim`/`strikeHold` keep their follower branches (queue without reward) for other callers; the rooms use
  `sackAct`/`claimAct` + `warActFate`.
- **Tide march with no room on the owner:** each world beat the owner runs `bookIdleMarch` (`server/tide.ts`) when no
  Tide room is open in its process: a full meter with no march booked gets the next dusk, a march missed by more than
  `TIDE.lateMs` moves to the next dusk, and the world row is written. With a room open its Tide does this (as before).
- **Queues never lose a beat's items:** `AgeQueue.push` no longer throws; it returns false when the queue row cannot be
  read (the caller puts the items back with `requeue`, capped by the module's pending maximum), and a failed row
  write is retried at the next beat. The war pushes the valor and the act queue independently.
- **Idea row writes one at a time** (`writeRow` chained, the row built when the write runs).
- **Handoff:** `fetchLive` (onAuth) only reads the row; `takeLive` (onJoin) deletes it, so a join that fails after the
  password check keeps the spot. Writes and deletes of one hero's row run in order. `onLeave` gives the account lease
  back after the hero's spot write is done (`handoffWritten`, capped at 3 s); while it waits, the same hero logging in
  again on this server gets "already playing" (only when the database is slow).
- **World lease lost:** the next beat follows (the owner's row replaces this server's world); meter changes not yet
  written are lost (comment in `server/worldStore.ts` fixed; nothing can be flushed without the lease).
- Tests: `tests/agesSharedFixes.test.ts` (fates and valor in the act; holds and towns pay only on "ok", nothing on a
  drop or a timeout; idle march booked and moved; queue read and write failures; idea write order; handoff read/delete
  and the capped wait), `tests/agesShared.test.ts` (handoff: deleted at the join, not at login).

### Open (part 7)
- A follower's sack/claim pays its heroes 15-45 s later (when the owner's war shows it applied); a hero who left the
  room meanwhile gets no renown. An older owner never answers: those acts pay nothing (3 min timeout).
- An owner with no room open moves a missed march to the next dusk, but the followers that marched at the old dusk
  do not reset the shared meter (only the owner's Tide resets it at a march's end): while the owner has no room, the
  meter stays full and the followers march at every dusk.
- A follower's own idea under its temporary number until the owner's row has it (up to ~30 s); its submitter gets no
  idea number in chat. Ideas win only while a room is open on the owner (as before, per process).
- A hero who logs in on another server within the instant their old server writes the spot may miss it (it then
  waits in kv until it runs out).
- Mixed builds: an older owner ignores the new queues (`war-acts:`, `world-tide:`, `ideas-q:`) and an older world
  owner drops `drained` (a newer owner after it may count a follower's Tide kills again: low stakes).
- A restart no longer forgets the sacks of the current tick (`warSacked` reads the log): one sack per land per tick now
  also holds across a restart, in every mode (the only change a single server sees).
- Turning on multi-server mode the first time copies the idea file into the `ideas` row once (if the row does not
  exist); `data/handoff.json` from the previous build is still read once. Ideas on the other service's volume are not merged.
