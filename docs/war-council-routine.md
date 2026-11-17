# War council routine

How a scheduled Claude routine (a cloud session on the owner's subscription) leads a clan's war council. The game
server makes no AI call itself: the routine reads a briefing over HTTPS, decides in character, and posts orders. The
server validates them exactly like any other council's (`shared/war/council.ts` `validateCouncil`) and, when the
clan's war day begins, uses them or falls back to the scripted doctrine. Code: `server/warCouncil.ts`.

## Server setup (owner)

| Variable | Value | Effect |
|---|---|---|
| `WAR_COUNCIL_TOKEN` | a long random string (16+ characters) | turns the two routes on; unset = routes answer 404 |
| `WAR_COUNCIL` | `off` (default), `shadow`, `lead`, or per clan: `shadow,host:lead` | what the councils may do |
| `WAR_COUNCIL_PROVIDER` | `scripted` (default) or `remote`, same format: `remote` | `remote` = orders come from the routine |
| `WAR_COUNCIL_KILL` | `1` | kill switch: every clan back to the doctrine at once |

Start with `WAR_COUNCIL=shadow` and `WAR_COUNCIL_PROVIDER=remote`: the routine's orders are validated, logged and
compared with what the doctrine did, but the doctrine still leads and no proclamation is read out. Switch a clan to
`lead` only after its shadow log looks sane. At runtime, `POST /admin/war-council?key=ADMIN_KEY&kill=1` (or `kill=0`)
flips the kill switch (in memory only: a restart or deploy reads `WAR_COUNCIL_KILL` again, so set the env var too to keep it off; the orders already given for the next tick, about 10 minutes, still play out); `GET /admin/war-digest?key=ADMIN_KEY` shows the modes, the daily digests and the council log.

## The two routes

Both need the header `Authorization: Bearer $WAR_COUNCIL_TOKEN`. They are rate-limited (a burst of 20, then one
request every 5 seconds per address) and a request body may be at most 8 kB.

- `GET /api/war/council/briefing?clan=<key>` (or `?clan=all`, or no `clan`): for each clan its `mode`, `provider`,
  `day` (the war day id orders are open for), `sessionAt` (about when that day's council sits, ms since epoch),
  `submitted` (the orders already sent for that day, if any) and `briefing` (the clan's lands, legal targets with
  the doctrine's score, enemies, wars, sieges, the Crown, the last day's events). Also `schema`, the order format.
- `POST /api/war/council/orders` with `{"clan": "<key>", "day": <day>, "orders": {...}}`. Answers:
  - `200 {"ok": true, "accepted": true, "replaced": <bool>, "orders": {...}}`: stored for that war day. A later
    submission for the same day replaces it until the council sits.
  - `422 {"ok": false, "errors": [...], "orders": {...}}`: rejected (also logged); `errors` names every problem,
    `orders` shows the legal part. Fix and resubmit.
  - `409`: wrong day (past, or not open yet: the body names the open day), the clan's council is off or not remote,
    or the kill switch is on. `400`: unknown clan or no day. `401`: bad token. `429`: too fast.

Orders: `targets` (1 to 3 ids from `briefing.targets[].id`, most wanted first; capitals and the Crown Keep are never
allowed), `stance` (`attack`, `defend`: keep more of the army home, `feint`: by day push the second target, by
night everything on the first), `proclamation` (plain ASCII, at most 160 characters, read out by the Herald in lead
mode), `rationale` (plain ASCII, at most 200 characters, one line, logged only). An empty `targets` list with stance
`defend` means "hold every border".

## Forge orders (optional)

An order set may also carry `forge`: one recipe for a weapon or a monster of the clan's own (The Forge, roadmap M4;
rules in `shared/forge.ts`, the full list of parts in the briefing response's `schema.orders.forge.codex`). It is
checked **apart from the targets**: a bad recipe is rejected on its own and never stops the targets from being
stored or from leading; bad targets never stop a legal recipe either.

- Weapon: `{"kind": "weapon", "name": "...", "base": <codex.weapon.bases[].id>, "implicit": [1 to 3 of {"key": <codex.weapon.implicit key>, "value": 1..max}], "elem": {"el": <element>, "share": 0.05..0.5 in steps of 0.05} (optional), "palette": <codex.palettes key>}`.
  `itemPower` (bonuses times `codex.weapon.weights`, plus share x 1.5 x attack) must stay at or under `codex.weapon.powerCap`.
- Monster: `{"kind": "monster", "name": "...", "base": <codex.monster.bases[].kind>, "affixes": [0 to 2 of that base's affixes], "weapon": <one of that base's weapons, optional>, "hp": 0.8..1.6, "dmg": 0.8..1.4, "speed": 0.9..1.15, "palette": <codex.palettes key>}`.
  `mobPower` = hp x dmg x sqrt(speed) x (1 + affix costs, + 0.2 with two affixes) must stay at or under `codex.monster.budget` (1.8).
- Names: at most 32 characters, ASCII letters, digits, spaces, `'` and `-`. `clan` may be left out (it is the council's own; another clan's is an error).
- Limits: at most one forge order per clan per war day (a second at the same day's session is refused), at most 5
  commissions a war day for all clans together (`briefing.forge.leftToday`), none while the forge's kill switch is on
  (`briefing.forge.killed`). A clan keeps 2 live forgings of each kind; a new one retires its oldest.
- In `lead` mode the session commissions it: 10% of the clan's army is spent at once (`briefing.forge.armyCost`), the
  balance sims test it (a fail is final, the army stays spent) and it goes live one war day later: monsters walk in the
  clan's lands, weapons drop from them and sell at its capital. The Herald announces "the forges are burning", then
  "<Clan> has forged <name>" or "the forge failed". In `shadow` mode the order is only logged, nothing is spent or made.
- `briefing.forge` shows the clan's live forgings, its projects in research (gate `pending` / `pass`), `leftToday`,
  `armyCost` and a summary of the Codex.

Answers: with a `forge` field the answer carries `"forge": {"accepted": <bool>, "errors": [...], "recipe": {...}}`.
A 200 with `forge.accepted: false` means the targets were stored but the recipe was not (logged as a forge rejection):
fix the named errors and send the whole order set again (it replaces the first). Error codes start with `forge.`,
e.g. `forge.mult_range: hp is 0.8-1.6`, `forge.over_budget: Monster power 2.10 is over the budget 1.8`.

Examples:

```json
{"clan": "redfang", "day": 12, "orders": {"targets": [41], "stance": "attack",
  "forge": {"kind": "weapon", "name": "Fang of Rourke", "base": "ws_bastard",
            "implicit": [{"key": "atk", "value": 2}, {"key": "str", "value": 1}], "palette": "redfang"}}}
```

```json
{"clan": "hidekin", "day": 12, "orders": {"targets": [7, 9], "stance": "feint",
  "forge": {"kind": "monster", "name": "Gore-Sewn Tusker", "base": "tuskborn", "affixes": ["stitched"],
            "hp": 1.2, "dmg": 1.1, "speed": 1, "palette": "hidekin"}}}
```

When the council sits (once per clan per war day, about `sessionAt`), the stored orders are checked again against
the war as it is then. If nothing valid arrived for that day, the doctrine leads that clan for the day (logged as a
fallback). During the day the armies push the first target that is still legal each 10-minute tick; when none is
left, the doctrine takes over.

## How often to run

A war day is 144 war ticks (24 hours) but does not start at UTC midnight: read `sessionAt`. Run the routine
**every 6 hours**. Each run sends orders for the open day; the last run before `sessionAt` wins, so the orders are at
most 6 hours older than the session. One routine can run all five clans (one `?clan=all` briefing, five POSTs), or
use one routine per clan with the prompt below.

## The prompt

Replace `{CLAN}` with the clan key (`wardens`, `redfang`, `host`, `hidekin`, `veiled`) and `{SERVER}` with the game
server's base URL. The token comes from the routine's secret `WAR_COUNCIL_TOKEN`.

```text
You are the war council of the clan {CLAN} in Pixel Town Brawl's clan war. You decide once per war day where your
armies strike. You only read and send JSON over HTTPS; never touch anything else.

1. Fetch your briefing:
   curl -sS -H "Authorization: Bearer $WAR_COUNCIL_TOKEN" "{SERVER}/api/war/council/briefing?clan={CLAN}"
   If the answer is not 200, report the status and body and stop.
   Read clans[0]: `mode` (if "off", stop: nothing to do), `day` (the war day your orders are for), `sessionAt`,
   `submitted`, and `briefing`. Read `schema` for the order format.

2. Think as the council, in character. briefing.name is your clan, briefing.doctrine its way of war
   (palisade: patient defenders; raid: hit soft places, two at once; siege: grind fortified land, strongest at night;
   tunnel: strike two borders deep; ritual: strongest at noon). Weigh:
   - briefing.targets: the only lands you may name (id, owner, Control 0-100, fort, siege, doctrineScore).
     Lower Control and fort mean the land is shaking. Your clan counters briefing.counters (+20% against them).
   - briefing.sieges: sieges you laid (finish them) and sieges on your land (consider stance "defend").
   - briefing.enemies and briefing.brakes: a clan holding over 30% of the land is everyone's target and the Night
     Raiders hunt it; the Rally helps the weakest. Do not overreach: a clan that grows too big is punished.
   - briefing.crown: the Crown Keep is never a target; it changes hands only at the monthly Reckoning.
   - briefing.events: what happened to you since yesterday.
   - briefing.doctrinePick: what your scripted leader would do. You may follow it or not; have a reason.

3. Write the orders as JSON:
   {"clan": "{CLAN}", "day": <clans[0].day>, "orders": {
     "targets": [<1 to 3 ids from briefing.targets, most wanted first>],
     "stance": "attack" | "defend" | "feint",
     "proclamation": "<what the Herald reads to every player: in character, plain ASCII, at most 160 characters>",
     "rationale": "<one line, at most 200 characters: why>",
     "forge": <optional, at most once a war day: a weapon or monster recipe from schema.orders.forge.codex>}}
   Plain text only: no markdown, no emoji, no quotes inside quotes that break JSON.
   Forge only with a reason (a new beast for your lands, a blade for your heroes) and only when briefing.forge.leftToday
   is above 0, briefing.forge.killed is not set and your projects list is empty: it costs 10% of your army.

4. Send them:
   curl -sS -X POST -H "Authorization: Bearer $WAR_COUNCIL_TOKEN" -H "Content-Type: application/json" \
     --data @orders.json "{SERVER}/api/war/council/orders"

5. Read the answer. "ok": true means they are stored for that day: report the targets and stop, unless the answer has
   "forge": {"accepted": false}: then fix exactly the forge errors and send the whole order set once more (or drop the
   forge field); this counts as your second try.
   On 422, read "errors", fix exactly those problems (keep the rest) and send once more. If the second try fails
   too, report both answers and stop: the doctrine will lead today and that is fine.
   On 409 because of the day, use the day the error names (fetch the briefing again) and send once more.
   Never send more than two order sets per run.
```

## What is logged

Every session (led, shadowed, fallback with its reason) and every rejected submission goes to the council log in the
war save (the last 300 entries), and each war day ends with a plain-text digest (the last 7 are kept): council
decisions, rejections, fallbacks, forge orders and what came of them, flips, battles, the Reckoning, the land and the
Forge's own lines of the day (commissions, gates, forgings gone live or retired). Read them at `/admin/war-digest`.
No email is sent: that needs the owner's approval first.

## Clan plug-ins (Living Code, M6 part 1)

A clan's council can also be its own code: `shared/clans/<clan>/index.ts` exports a `plugin` (API v1: `council`,
briefing in, orders out, once a war day; it may import only `shared/clans/api.ts`). The defaults return the scripted
council's answer, so switching one on changes nothing until its code is rewritten. Murat's rule (2026-11-17): **no
AI-written code goes live without his OK, and the OK is the hash pin.** Code: `server/clanPlugins.ts` (provider,
pins, kill switch, admin), `server/clanPluginWorker.ts` (the sandbox), `tools/clans/` (build, static check, gate).

Nothing runs unless all of these hold: the clan's council is on (`WAR_COUNCIL`), its provider is `plugin`
(`WAR_COUNCIL_PROVIDER`), its bundle's hash is pinned (`CLAN_PLUGINS`), the bundle on the server matches the pin, the
kill switch is off, and the plug-in has not switched itself off. Anything else, and any failure (a throw, a hang over
200 ms, a crash or out-of-memory in the worker, a wrong clan or API, a reserved point, a forge order, an answer over
4 kB or illegal orders), means the doctrine leads that clan for the day; the council log and the daily digest say why.

| Variable | Value | Effect |
|---|---|---|
| `CLAN_PLUGINS` | `wardens:1a2b3c4d,host:5e6f7a8b` (example values) (8 to 64 hex characters of the bundle's sha256 per clan) | pins: only these bundles may run. Unset = off |
| `WAR_COUNCIL_PROVIDER` | e.g. `wardens:plugin` | that clan's council asks its plug-in |
| `WAR_COUNCIL` | e.g. `wardens:shadow`, later `wardens:lead` | as for any council: start with `shadow` |
| `CLAN_PLUGINS_KILL` | `1` | kill switch: no plug-in runs, the doctrine leads |

**Pinning a hash (Murat).** Each build writes the bundles to `server-dist/clans/<clan>.js` and their hashes to
`server-dist/clans/manifest.json` (`sha256`, `sha8`, `version` per clan; locally: `npm run build:server`, or
`CLAN_BUILD_VERBOSE=1 node tools/clans/build.mjs <folder>` prints `clan plug-in wardens@1 sha8 1a2b3c4d`). On the
running server, `GET /admin/clan-plugins?key=ADMIN_KEY` shows for each clan the pin, the deployed bundle's `sha256` /
`sha8`, `live` (pinned, matching, not killed, not switched off), failures in a row and the last runs. To let a
reviewed version go live, set `CLAN_PLUGINS` in Railway to `<clan>:<full sha256>` from there (at least 16 hex; the full 64 is safest) and redeploy (or restart). The
hash covers the exact bytes the server runs, the kit included: any later change to the clan's folder, to
`shared/clans/api.ts` or to what the kit bundles (the scripted council, the Heralds' lines) gives a new hash, and the
old pin then refuses the new bundle (the doctrine leads, logged as `hash mismatch`) until the new hash is pinned.

**Kill switch.** `POST /admin/clan-plugins?key=ADMIN_KEY&kill=1` stops every plug-in at once (`kill=0` lifts it); like
the council's switch it is in memory only, so set `CLAN_PLUGINS_KILL=1` in Railway too to keep it after a restart, or
remove the pin. The war councils' own kill switch (`WAR_COUNCIL_KILL`) stops every council, plug-ins included.

**Auto switch-off.** After 3 failures in a row a clan's plug-in switches itself off (logged, in the digest); the
doctrine leads until `POST /admin/clan-plugins?key=ADMIN_KEY&enable=<clan>` (or `enable=all`). In memory: a restart
re-enables it, and it switches off again after 3 more failures.

The council log names the code that decided: provider `plugin:<clan>@<version>#<sha8>`. `npx tsx tools/clans/check.ts
<clan>` and `npx tsx tools/clans/gate.ts <clan>` are the checks CI runs on a PR that touches a clan folder; a branch
named `claude/clan-<clan>-...` may change only `shared/clans/<clan>/`. The sandbox (a worker thread with no env and
32 MB, a fresh `node:vm` context without `require`, `process`, `Date`, timers, `Intl` or string code generation,
`Math.random` seeded from the briefing) is not a security boundary on its own: the static check, review and the pin are.
