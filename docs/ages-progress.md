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

## Open
- On a follower only valor reaches the owner. Sacks, town claims, battle deaths and banners, column losses and remote
  council submissions stay local (sacks and claims are refused there) until they get queues of their own.
- A follower's rooms get no battle news (announce / start / end); they show the battles as saved.
- Council proclamations are not saved, so a follower's Herald does not repeat them.
- A follower Age's Gloam Tide meter is its own (memory only); merging kill counts is for a later PR.
- `war-pre-<build>` and `war-valor:<holder>` rows stay one per build; prune them once the Ages run for real.
- Accounts are not versioned yet: two Ages must not both write one account (next PR).

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
  (`until > clock_timestamp()`) are locked `FOR SHARE` in key order, so no server takes one over until the commit; only
  those rows are updated, rows are never created by it. Refused accounts are logged and dropped from the dirty set.
  `pgLeases` takes keys in key order too (no deadlock with the fence).
- **HTTP edits** (email, reset code, new password) for an account not playing here: take the lease, reload, change,
  save, release; held elsewhere: "Leave the game first, then try again". A reset guess takes a lease only when a code
  is pending.
- No save field changed; the Player / Mob schema untouched.
- Tests: `tests/accountGuard.test.ts` (guard and shared accounts on an in-memory fenced table, `tests/helpers/fencedStore.ts`),
  `tests/accountLease-room.test.ts` (onAuth refused / taken, onLeave saves then releases), `tests/store.test.ts`
  (Postgres: insertNew, fence, findBy).

### Open (part 3)
- A trade's two accounts are written in one transaction, but if one side's lease were lost, the other side is still
  written (the fence refuses rows, not the whole flush). Both traders are on one server, so this needs a lease lost mid-trade.
- A player whose lease is lost (database outage, then another server took it) keeps playing here with saves refused;
  nothing kicks them yet (logged).
- During a deploy's overlap with leases on, a player reconnecting to the new server while the old one still saves waits
  up to ~3 s and may be refused once; the client shows the message (no automatic retry yet).
- Held leases are trusted locally until 5 s before they run out; a server paused longer than that is fenced by SQL.
