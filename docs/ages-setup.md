# Ages on Railway: one gateway, two game servers

How to run two Ages (two builds of the game, side by side, on one Postgres) behind one public address. The code is
in the repo (`server/gateway.ts`, the leases of `server/lease.ts`); the Railway services are set up by hand, by the
owner. **Cost is the owner's call:** this is three always-on services instead of one (a gateway and two game servers).

```
players --> play.example.com --> [gateway]  --(private network)-->  [blue]  game server, Age "blue"
                                     |                               [green] game server, Age "green"
                                     cookie ptb_age=blue|green           \__ both on the same Postgres __/
```

## Before you start (read this)
- **Shared mode needs Postgres.** Both game services must use the same `DATABASE_URL`. JSON save files
  (`data/saves.json`) are per service: two servers on files would be two separate games that lose each other's saves.
- **One account, one server:** set `ACCOUNT_LEASES=1` on both game services (`server/accountGuard.ts`): a hero's
  account is open on one server at a time, and a server that does not hold it never writes it.
- **Save versions:** a newer build that changes the save in a way older code would damage bumps `ACCOUNT_API`
  (`shared/accountApi.ts`, rule in CLAUDE.md). The older Age then refuses those heroes ("This hero lives in the new
  Age") and never writes them. Only new top-level optional fields are safe without a bump.
- **Shared state:** with Postgres and `AGE_SLOT` (or `ACCOUNT_LEASES=1`) set, where heroes stood when they left (the restart handoff) and the idea log are kept in
  the database too, so a hero moving to the other Age (or across a deploy) comes back where they stood, and ideas and
  votes from either Age land in one log. A follower Age's Gloam Tide kills, Hold sacks and town claims are queued for
  the Age that owns the world and the war, and applied there once. Still give each game service its own volume at
  `/app/data` (older builds keep files there). A single server without those variables keeps `data/handoff.json` and
  the idea file on its volume, as before; the first start in multi-server mode copies that service's idea file into
  the database once.
- A **gateway redeploy drops every player's connection** (their page reconnects by itself within seconds). Redeploy it
  only when its code changed.

## 1. The two game services (blue and green)
Create two services from this repository (same Dockerfile, same image as today). For each:

| Variable | blue | green | What it does |
|---|---|---|---|
| `DATABASE_URL` | the Postgres URL | the same URL | accounts, war, world, forge, leases: all shared |
| `AGE_SLOT` | `blue` | `green` | the server's name in leases and logs |
| `AGE_ROLE` | `primary` | `vanguard` | `primary` runs the war's tick, the world's and the Forge's writes; `vanguard` (the Age being tried) and `draining` (the Age on its way out) follow |
| `ACCOUNT_LEASES` | `1` | `1` | one account on one server at a time (see above) |
| `PORT` | `2567` | `2567` | fixed, so the gateway knows where to call |
| `ADMIN_KEY` | as today | as today | admin pages (`/admin/...`) |
| `TRUST_PROXY` | `1` (image default) | `1` | the player's address comes from `X-Forwarded-For` (the gateway passes the edge's on) |

Other variables (mail, `WAR_COUNCIL_TOKEN`, ...) as on today's service. Each one gets its own volume at `/app/data`.
Leave both **without a public domain**: players reach them only through the gateway. Keep the config file
`railway.json` (health check `/health`).

Exactly one Age should be `primary` at a time. Which build each runs: deploy each service from its own branch (or
pin a commit), so "green" can be the new build while "blue" keeps the current one.

## 2. The gateway service
A third service from the same repository and image. It starts the gateway instead of the game when
`GATEWAY_TARGETS` is set (`server-dist/start.cjs`).

| Variable | Example | What it does |
|---|---|---|
| `GATEWAY_TARGETS` | `blue=http://${{blue.RAILWAY_PRIVATE_DOMAIN}}:2567,green=http://${{green.RAILWAY_PRIVATE_DOMAIN}}:2567` | the Ages, `slot=http://host:port`, over Railway's private network (http only) |
| `GATEWAY_PRIMARY` | `blue` | where new players go when no split is set (default: the first target) |
| `AGE_SPLIT` | `blue=100,green=0` | weights for new visitors (default: 100 % to the primary) |
| `ADMIN_KEY` | 12+ characters | opens `/gateway/status?key=...` |
| `PORT` | set by Railway | the gateway's own port |

In the service's settings, set the config file path to **`railway.gateway.json`** (health check `/gateway/health`:
the gateway's own health, so it deploys even while a game service is restarting). No volume, no `DATABASE_URL`.

Then **move the public domain** (e.g. `play.fmtpa.ch`) from today's game service to the gateway service.

## 3. How players are routed
- A first visit draws an Age by `AGE_SPLIT` and sets the cookie `ptb_age=<slot>` (30 days, HttpOnly, SameSite=Lax,
  Secure over https). Every request of that browser (the page, `/account`, `/matchmake`, the game's WebSocket) then
  goes to that Age. Changing `AGE_SPLIT` only affects new visitors (and cookies that name a slot no longer in
  `GATEWAY_TARGETS`, which are drawn again).
- `/age/<slot>` (e.g. `https://play.fmtpa.ch/age/green`) puts this browser in that Age and opens the game. For an Age
  that takes new visitors (weight above 0 in `AGE_SPLIT`) anyone may use it. An Age with weight 0 (not open yet) needs
  the admin key: `/age/green?key=<ADMIN_KEY>`; give that link only to people you trust (it carries the key), or open
  the Age a little (`green=1`) and hand out the plain link. Without the key the page answers "no such age".
- A browser without a cookie (blocked cookies, or several first requests at once) gets the same Age every time: the
  draw is fixed by the player's address, by the same weights.
- If an Age's server does not answer, page files and `/account` calls are served by the other Age meanwhile (logged
  as `backend <slot> down`). `/health`, `/matchmake` and the game's WebSocket are not: they wait for the player's own
  Age, so the reconnect notice just keeps waiting through a restart, as today.

## 4. Shifting players to a new Age
1. Deploy the new build to the idle service (say green, `AGE_ROLE=vanguard`).
2. Try it yourself: open `/age/green?key=<ADMIN_KEY>` (green still has weight 0). Check `/gateway/status?key=...` (each Age's `/health` and build, and the split).
3. Open it to some new visitors: `AGE_SPLIT=blue=90,green=10` on the gateway (a redeploy of the gateway: players
   reconnect).
4. When green is the Age to keep: set `AGE_ROLE=primary` on green and `draining` on blue (blue hands the war's,
   world's and Forge's leases over within about 15 s), and `AGE_SPLIT=green=100`, `GATEWAY_PRIMARY=green`.
5. Players with a `blue` cookie stay on blue until they use `/age/green` or blue is removed from `GATEWAY_TARGETS`
   (then their cookie is drawn again by the split). To move everyone: remove blue from `GATEWAY_TARGETS`.

## 5. Rollback
- **Back to one server:** move the public domain from the gateway back to the game service you keep, set its
  `AGE_ROLE=primary`, and stop the others. Nothing else changes: the game service is today's server.
- **Back from a bad new Age:** `AGE_SPLIT=blue=100`, remove green from `GATEWAY_TARGETS` (its players' cookies are drawn
  again), keep or set blue as `primary`.
- The gateway has no state of its own: deleting it loses nothing.

## Checks
- `https://<domain>/gateway/health` → `ok` (the gateway).
- `https://<domain>/gateway/status?key=<ADMIN_KEY>` → `{ primary, split, backends: [{ slot, ok, build, ms }] }`.
- `https://<domain>/health` → the build of *your* Age (header `X-Build`).
