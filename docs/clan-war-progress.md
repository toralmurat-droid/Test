# Clan war (the Riven Marches): progress log

Design: https://play.fmtpa.ch/design/riven-marches/ · Plan: https://play.fmtpa.ch/roadmap (`client/src/roadmap.ts`).

## Decisions
- Murat 2026-11-14: the war runs across the whole map, all acts (future ones too). Villages, dungeons, quest-boss
  lairs and the broad wild zones never change hands.
- Murat 2026-11-14: players may swear to any clan, including the Ossuary Host and the Hide-Kin.
- Murat 2026-11-14: one war that never ends (no resets).
- Murat 2026-11-14: no approval step for AI leaders, forged items or AI code; everything logged, significant items and
  a daily digest emailed to Murat. AI code stays sandboxed with automatic rollback.
- Murat 2026-11-14: saves moved to Postgres on Railway (5 accounts imported).

## M0 Foundations (2026-11-14)
Built, not yet wired into the game (nothing players see):
- `shared/war/clans.ts`: the five clans, colours, doctrine, counter cycle, one capital per act.
- `shared/war/territories.ts`: 31 territories from `SPAWN_ZONES` (21 in Act 1, 10 in Act 2), borders by zone
  distance, the waygate joins the acts; connected starting land around each capital (8/7/6/5/5). A future act needs
  its own capitals and a link to join.
- `shared/war/rules.ts`: `warTick` (10-minute tick): income with overextension, upkeep, defence spread by pressure,
  attacks, counter cycle, day/night doctrines, forts, Control, announced sieges, capitals never fall, rally for clans
  below a fair share, Night Raiders bleed the leader. All numbers in `WAR`. Orders are sanitised (`cleanOrders`): AI leaders will never be trusted.
- `shared/war/doctrine.ts`: scripted leaders (fallback for the future War Councils) and one ruse for the clever-plan check.
- `tools/balance/war.ts`: headless war sim. `tests/war.test.ts`.

Sim, 200 wars x 30 war days, no players (`npx tsx tools/balance/war.ts 200 30 --clever=host`):

| clan | avg land | most land |
|---|---|---|
| Wardens | 23.5% | 29.0% |
| Redfang | 25.6% | 32.3% |
| Ossuary Host | 11.8% | 19.4% |
| Hide-Kin | 17.3% | 19.4% |
| Veiled Circle | 21.9% | 25.8% |

- One clan above 30% for more than 3 days in a row: 0.5% of wars (goal under 5%). Met.
- About 7 territories change hands per war day.
- The Host's ruse (feint by day, all-in at night) gains land (13.0% vs 11.8%) without dominating. The same ruse
  costs the other clans land, as it should: it only pays with a night doctrine.

Open points for M1:
- The Host stays the smallest clan (boxed in between two capitals in both acts). Look at its capitals or give it
  the bone-yard growth from the design before tuning numbers.
- The Hide-Kin never grow past their 6 starting territories (about 60 flips each way in 20 wars, against ~1,500 for
  Host and Redfang): the tunnel doctrine barely matters. Tunnelled targets stand undefended but the attack arrives at
  cut-off supply. Rework the tunnel before tuning.
- The Host churns (many flips both ways) rather than grows.
- 7 flips a day over 31 territories may feel fast once players watch it; check with the first front.

## M1 step 1: the war runs live (2026-11-14)

- `server/war.ts`: one war for the whole server, outside the room. Every 10 minutes the scripted leaders give
  orders, players' valor of the last ten minutes is added, the war ticks with the real time of day
  (`shared/war/view.ts` `warPhase`, so the Host's night push matches the game's night). After downtime at most 3
  ticks are caught up. Saved after every tick (Postgres table `kv`, key `war`; or `data/war.json`). A saved war whose
  territory count no longer fits the map starts over (log line "War: map changed").
- Players: `WAR.valorScale` / `WAR.valorCap` in rules.ts turn valor (hero-minutes at a standard) into troops with
  diminishing returns. `addValor()` exists; standards that feed it come next.
- Clients get the `war` snapshot on join and after each tick; the front plaque (`client/src/warPlaque.ts`) shows
  holder, Control and siege countdown in a territory. The Herald posts sieges, holds and conquests in the chat.
- `GET /war.json`: current snapshot and the last 50 events.
- Scope note: Murat chose the whole map, so the live war runs all five clans over both acts from the start instead
  of the single Wardens-Redfang front the roadmap first planned.

## M1 step 2: standards and oaths (2026-11-14)

- `shared/war/standards.ts`: 58 standards (one or two per territory) on free ground, at least 6 tiles from a portal
  stone. `STANDARD` holds the ring radius, valor per minute, minimum level 5, the one-day oath cooldown, the idle
  limit (3 min without moving, attacking or casting) and the over-level cut (heroes more than 5 levels above a
  territory's monsters bring a quarter).
- `server/warHeroes.ts`: oath validation and save cleaning (`clan`, `clanAt` on the hero save, optional), and
  `Presence`: a full minute in one ring reports valor; leaving the ring starts the minute over.
- Client: `client/src/warStandards.ts` (poles in the holder's colours, rings, E prompt, oath panel; other E
  prompts nearby come first), the plaque tells the hero whether they defend, attack or cannot reach the land.
- Open: rewards for valor (Renown, M2), tabards so other players see the oath (M2), Holds.

## M1 step 3: horns and leaders (2026-11-14)

- `shared/war/heralds.ts`: a leader per clan (Captain Hale, the Redfang Chief, the Pale Marshal, the Hide-Mother,
  the Veiled Oracle) with lines per moment; the defender speaks when besieged or holding, the winner when a land
  falls. Picked by tick, so replays say the same.
- Each war event: Herald line, leader line, and a `warev` message; `client/src/warNotice.ts` sounds the war horn and
  shows a notice when it happens in the hero's territory or next to it.
- `WAR.siegeValor` 1.5: valor counts half again at a territory under siege (the hour's warning is for players).

## M1 step 4: Holds (2026-11-14)

- `client/src/holdArt.ts`: five Hold sprites in the clan styles (Warden watchtower, Redfang war camp, Ossuary tower,
  Hide-Kin burrow, Veiled shrine), generated pixel art in the bonfire style (`paintHold` draws one without Phaser).
- `shared/war/standards.ts` `HOLDS`: one spot per territory near the middle, on clear ground, at least 5 tiles from its standards. The
  sprite follows the owner. Look only: no collision, no siege mechanics at the Hold yet (M2: siege works, gates).

## M2: Renown (2026-11-14)

- `shared/war/renown.ts`: `RENOWN_RANKS` (Sworn 0, Shieldbearer 30, Standard-bearer 120, Banneret 360, Warlord 900,
  Hero of the Marches 2000). Each valor report from a standard (one full active minute) adds the same amount of
  renown (`heroValor`: a quarter when far over-levelled). Saved per hero as optional `renown`; kept on a clan change.
- The oath panel shows renown and the next rank; the Herald tells the hero in chat on a rank-up. No reward yet beyond
  the title (ideas: tabard trims by rank, Renown in the name tag once a synced field is free).
