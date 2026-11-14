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
  distance, the waygate joins the acts; fair connected starting land around each capital.
- `shared/war/rules.ts`: `warTick` (10-minute tick): income with overextension, upkeep, defence spread by pressure,
  attacks, counter cycle, day/night doctrines, forts, Control, announced sieges, capitals never fall, rally for clans
  below a fair share, Night Raiders bleed the leader. All numbers in `WAR`.
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
- 7 flips a day over 31 territories may feel fast once players watch it; check with the first front.
