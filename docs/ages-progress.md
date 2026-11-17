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
- Tests: `tests/agesForge.test.ts` (api, JSON mode unchanged, a follower refuses and learns the owner's forgings,
  takeover with snapshot and gates, newer saves read-only / hidden, flush during a takeover, the lease lost and regained,
  shutdown write and release).

## Open
- On a follower only valor reaches the owner. Sacks, town claims, battle deaths and banners, column losses and remote
  council submissions stay local (sacks and claims are refused there) until they get queues of their own.
- A follower's rooms get no battle news (announce / start / end); they show the battles as saved.
- Council proclamations are not saved, so a follower's Herald does not repeat them.
- A follower Age's Gloam Tide meter is its own (memory only); merging kill counts is for a later PR.
- `war-pre-<build>` and `war-valor:<holder>` rows stay one per build; prune them once the Ages run for real.
- Accounts are not versioned yet: two Ages must not both write one account (next PR).
- The Forge on a server where it is hidden (a newer FORGE_API that allows no older reader) knows no forgings: its heroes'
  forged items show as their base until the newer build is gone. Its log lines of refused commissions on followers go
  to the console only (the forge log is the owner's).
- A follower's room shows no forging's news beyond the new pack; `forge-pre-<build>` rows stay one per build (prune
  them with the war's).
