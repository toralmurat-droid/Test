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
flips the kill switch; `GET /admin/war-digest?key=ADMIN_KEY` shows the modes, the daily digests and the council log.

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
     "rationale": "<one line, at most 200 characters: why>"}}
   Plain text only: no markdown, no emoji, no quotes inside quotes that break JSON.

4. Send them:
   curl -sS -X POST -H "Authorization: Bearer $WAR_COUNCIL_TOKEN" -H "Content-Type: application/json" \
     --data @orders.json "{SERVER}/api/war/council/orders"

5. Read the answer. "ok": true means they are stored for that day: report the targets and stop.
   On 422, read "errors", fix exactly those problems (keep the rest) and send once more. If the second try fails
   too, report both answers and stop: the doctrine will lead today and that is fine.
   On 409 because of the day, use the day the error names (fetch the briefing again) and send once more.
   Never send more than two order sets per run.
```

## What is logged

Every session (led, shadowed, fallback with its reason) and every rejected submission goes to the council log in the
war save (the last 300 entries), and each war day ends with a plain-text digest (the last 7 are kept): council
decisions, rejections, fallbacks, flips, battles, the Reckoning and the land. Read them at `/admin/war-digest`.
No email is sent: that needs the owner's approval first.
