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

## Open
- On a follower only valor reaches the owner. Sacks, town claims, battle deaths and banners, column losses and remote
  council submissions stay local (sacks and claims are refused there) until they get queues of their own.
- A follower's rooms get no battle news (announce / start / end); they show the battles as saved.
- Council proclamations are not saved, so a follower's Herald does not repeat them.
- A follower Age's Gloam Tide meter is its own (memory only); merging kill counts is for a later PR.
- `war-pre-<build>` and `war-valor:<holder>` rows stay one per build; prune them once the Ages run for real.
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
