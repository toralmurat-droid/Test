# Quest concepts: progress log

Eleven new quests and activities that ask more than kill / collect / use (Mehmet 2026-11-13: "get cracking on the lot").
One branch (`claude/brave-hypatia-dkkcd3`), one draft PR until all work packages land, tested and reviewed.

## Status
All seven work packages are done: server, client, text and tests for all 11 concepts (2026-11-14).
| WP | Concepts | State |
|---|---|---|
| WP1 framework + choices + puzzles | #5 Two Letters, #3 Empty Grave, #11 Crown in the Sand | done |
| WP2 carry + hold | #1 Last Lantern, #2 Hold the Wheel | done |
| WP3 unseen + sync | #4 Unseen, #8 Two Hands | done |
| WP4 Bargain + Penance | #6 | done (Hidebound on at 0.95) |
| WP5 Tide | #7 | done (tuned; gold 40 + 20 x level, cap 800) |
| WP6 Rumours | #10 | done |
| WP7 Apprentice | #9 | done |

Open for a later session: titles are only earned from Rumours and the Apprentice; a hold-wave monster broadcasts a
`blobmerge` with `merged: 1` (cosmetic); party members can farm a rumour ambusher about as fast as grinding; the
Apprentice's party credit covers every own boss, main story included (decision 9).

## Baseline (commit a4ebcf1, before any change)
- `npm run bench` (5 bots, no SPREAD): 19.7 ticks/s, tick avg 7.39 ms, p95 10.4 ms, patch 4.50 ms, CPU 35%, RSS 319 MB, 20.9 kB/player/s, 5767 mobs / 79 active.
- `npx tsx tools/balance/pve.ts` and `duel.ts` (defaults): raw output kept by the orchestrator; key cells go in the PR.
  Known pre-existing oddities: Lv 1 duels lopsided (vampire 97-99%), Night Raider near-unwinnable (sim quirk vs vampire).

## After (HEAD, 2026-11-14, quiet machine, base a4ebcf1 run alongside)
`npm run bench -- 5 15` and `SPREAD=1 npm run bench -- 10 20`; tick avg / p95 in ms.
| Run | base a4ebcf1 | HEAD |
|---|---|---|
| 5 bots (2 runs) | 9.95 / 13.9, 8.85 / 13.0 | 8.95 / 13.5, 8.58 / 11.9 |
| 10 bots SPREAD (6 runs, mean) | 13.4 / 19.6 (range 11.4-16.8) | 14.2 / 21.3 (range 12.1-15.3) |
| 5 bots TIDE=1 (40 marchers, 2 runs) | — | 9.41 / 14.0, 10.08 / 15.1 |
| 10 bots TIDE=1 SPREAD (2 runs) | — | 13.58 / 20.4, 12.01 / 17.4 |
Ticks/s 19.5-19.8 in every run. kB/player/s during a march 27-32 (22-24 without).

## Decisions (pending Murat unless noted)
Defaults picked so work isn't blocked (Claude 2026-11-13). Murat owns game direction and balance; any of these can be reversed.
1. Last Lantern: Lv 10 (Brinewood is 10-13, not ~8), giver Brother Aldric.
2. Summoner pets keep fighting while the hero carries the lantern; only the hero's own skills are locked.
3. Empty Grave: three mourner NPCs on existing sheets; fixed answer (checked on the server).
4. Unseen: failing sends you back to the last checkpoint, not the start.
5. Two Letters: vendors sell existing stock; XP 0.
6. Hidebound talent (Bargain): -5% damage from beast-folk, **shipped at 1.0 (off) until Murat approves**. Trait cosmetic and permanent.
7. "Cold" guards after the Bargain: dialog only, nothing blocked.
8. Tide: goal 1500 blob kills, march at next dusk, marchers Lv 4-12, >= 3% damage share to be paid, gold scaled by level, rune for top 3, Act 1 only.
9. Apprentice: an `own` boss killed by a nearby party member counts for its owner (changes today's killer-only credit).
10. Rumours: new alewife NPC on the square, XP 0, gold + 25% rune chance, Act 1 only, reset at UTC midnight.
11. XP: new zone arcs use `arcReward` like the others; XP 0 for side arcs, rumours, Tide, Apprentice (levelling stays slow).
12. Cosmetics: titles + the beast trait only.
13. Lantern tuning (Claude 2026-11-14): lure 1.5 -> 1.25, ground drain x3 -> x2. Sim: vampire with basic attacks only clears 16% of Brinewood encounters (wizard 97%, summoner 100%), so dropping the lantern to fight with skills must stay affordable.
14. Unseen: dying ends the hide (respawn in town as always); the saved checkpoint stays. No respawn-point change.
15. Phones out of scope for this feature (Mehmet 2026-11-14: "Phones irrelevant."): no phone-size checks from WP5 on; phone layout polish dropped.
16. Tide tuning (Claude 2026-11-14, pending Murat): goal 1500 -> 600 (one farmer filled 1500 in ~5 h), limit 12 -> 6 min (clears take 2.5-3.5 min), marcher kill XP x0.5 (a surviving Lv 10 solo hero gained ~8 levels in one march). Marchers fill no bounty or quest kill step (bug fix). Open for Murat: payout gold is ~6% of what marchers drop (proposal 40 + 20 x level, cap 800); Lv 30 heroes face no risk (option: scale marcher level to the heroes at the gate).
17. Mehmet 2026-11-14, on the open questions: go with the recommendations. Hidebound on at 0.95; Tide gold 40 + 20 x level (cap 800, was 15 + 8L cap 350); marcher level scaling later; keep the Tide and lantern tuning (decisions 13, 16); keep party own-boss credit for everyone (decision 9, main-story bosses included); keep XP 0 for side arcs, rumours, Tide pay and the Apprentice; Ursk keeps fighting during her offer; keep Ilka as the Saltmere net-mender. Ship when ready.

## Plan
Written by the planner agent (2026-11-13). Code facts below were read from the tree at a4ebcf1.

### Constraints found in the code
- `tests/zone-arcs.test.ts`: one giver per arc, every quest after the first `auto`, last step never `talk`, `outro` required,
  Act 1 arcs Lv <= 30. Arcs that end on a hand-in (Two Letters, Penance) go in a new `SIDE_ARCS` list (also in `Player.arcs`).
- Arc saves are by name (`${id}Id/Stage/Count/Ver`), `restore()` loops `CHAINS`; client sends chain indices, so arcs are append-only.
- `Player.arcs` is a synced `MapSchema<number>`. Choice flags and cosmetics go under reserved keys `$f` / `$c`; arc ids must never
  start with `$` (test). `qset` deletes a key at 0, so meta keys get their own setters.
- Kill credit only goes to the attacker (`questKill`); `own` bosses count only for `summonFor === id`.
- Every `use` step without `chest: false` makes a story chest (`shared/chests.ts placeChests`); `shared/siege.ts fits()` keeps siege
  sites 6 tiles from chests and NPC decor. Default `chest: false` except arc finales away from `SIEGE_ZONES`. Pin siege sites in a test.
- `shared/siege.ts` is skeleton work sites only. The Tide overlaps with Night Raiders (`updateRaids`) and the gate watch (`updateWatch`).
- `worldDayFrac` is module-private in TownRoom: new modules get it through their host interface.
- No cosmetics/titles system and no tavern exist yet. `shopNear()` ignores `npcPresent` (needs a presence filter).

### Framework
New files: `shared/questSteps.ts` (step specs, tuning, pure rules), `shared/rumours.ts`, `shared/tide.ts`, `shared/cosmetics.ts`,
`server/questSteps.ts` (`QuestSteps` class: transient carry/hold/unseen/sync/pick state), `server/rumours.ts`, `server/tide.ts`,
`server/apprentice.ts`, `server/worldStore.ts`.

Step types (`shared/quests.ts`):
```ts
export type StepType = …existing | "carry" | "hold" | "pick" | "unseen" | "sync" | "choose";
// QuestStep gains (all optional, specs typed in shared/questSteps.ts):
carry?: CarrySpec; hold?: HoldSpec; pick?: PickSpec; unseen?: UnseenSpec; sync?: SyncSpec; choose?: ChoiceSpec;
npcs?: string[];                                   // talk: these NPCs in any order (bitmask in questCount)
says?: Record<string, string[]>;                   // talk with npcs: lines per NPC
onlyIf?: { flag: ChoiceId; v: number[] };          // branch: step skipped unless the choice matches
sayBy?: { flag: ChoiceId; lines: Record<number, string[]> }; // text variants (Crown line, Hale's cold lines)
```
`shared/questSteps.ts`:
```ts
export interface Area { x: number; y: number; r: number; label: string }
export interface CarrySpec { take: QuestObject; to: Area; light: number; drain: number; waterMult: number; darkMult: number; groundMult: number; lure: number }
export interface HoldSpec { at: Area; ms: number; npc: string; npcHp: number; waves: { kinds: MobKind[]; n: number; everyMs: number; level: number }; maxAlive: number; leaveMs: number }
export interface PickSpec { objects: QuestObject[]; answer: number; wrong: Summon; back: number /* 1-based stage to fall back to */ }
export interface UnseenSpec { checkpoints: Area[]; night: number; cover: number; floor: number }
export interface SyncSpec { seals: [QuestObject, QuestObject]; windowMs: number; soloMs: number; summonReach: number }
export interface ChoiceSpec { flag: ChoiceId; options: { label: string; v: number }[] }
export const CHOICES = { letters: 0, bargain: 1, grave: 2 } as const;   // 2 bits each in arcs.$f, append-only
export type ChoiceId = keyof typeof CHOICES;
export function choiceOf(p: Quester | undefined, id: ChoiceId): number;
export function withChoice(flags: number, id: ChoiceId, v: number): number;
export function nextStage(d: QuestDef, stage: number, p: Quester | undefined): number; // skips onlyIf mismatches
export function lightDrain(s: CarrySpec, ctx: { water: boolean; dark: boolean; ground: boolean }, dtS: number): number;
export function isDark(t: number): boolean;
export function coverAt(px: number, py: number): boolean; // tree/rock OBJECTS tile within 1 tile, deterministic
export function stealthMult(s: UnseenSpec, dark: boolean, cover: boolean): number;
export function syncOk(tA: number, tB: number, window: number): boolean;
```
Extend in `shared/quests.ts`: `stepGoal`/`stepProgress`, `questTargets`, `usableObjects`/`objectDone`/`allObjects` (pick objects,
seals, carry take-object), `chainDialog` (`choose` → `DialogPage.options`; `npcs`/`says`), `npcQuestMark`, `npcPresent`
(table-driven), `chainOpen` (new `QuestChain.needs?: (p) => boolean` from `ZONE_ARCS[].needs` / `SIDE_ARCS[].needs`).

Chains: append to `ZONE_ARCS`: `lantern`, `wheel`, `grave`, `unseen`, `twohands`, `sandcrown`. New `SIDE_ARCS` after them
(`local: true`, may end on a talk): `letters`, `penance`. Ursk's bargain lives inside the Hide Rite chain with no step added
(`beastVer` stays 2). The Crown change is text only (`sayBy`).

`server/questSteps.ts`:
```ts
export interface StepHost {
  player(pid: string): Player | undefined; qs(p: Player, c: number): QuestState;
  nextStep(pid: string, c: number): void; setStage(pid: string, c: number, stage: number, count?: number): void;
  summon(pid: string, sm: Summon, tag: number, home?: { x: number; y: number }): string; // wraps summonFused; tag -1 = ambush
  removeMob(id: string): void; mobsNear(x: number, y: number, r: number): [string, Mob][];
  send(pid: string, type: string, msg: unknown): void; broadcast(type: string, msg: unknown): void;
  warp(pid: string, x: number, y: number): void;
  group(pid: string): string[]; together(a: string, b: string): boolean;
  dayFrac(now: number): number; summonsOf(pid: string): { x: number; y: number }[];
}
export class QuestSteps {
  constructor(h: StepHost);
  changed(pid: string, c: number): void; tick(now: number, dtMs: number): void;
  use(pid: string, oid: string): boolean; drop(pid: string): void; choose(pid: string, c: number, opt: number): boolean;
  hurt(pid: string): void; died(pid: string): void; leave(pid: string): void;
}
```
TownRoom hooks (each a one-line call, ~60 lines total):
1. build host + modules in `onCreate`;
2. `update()` after the players loop: `qsteps.tick`, `rumours.tick`, `tide.tick`;
3. `nextStep`/`autoStart` use `nextStage()` and call `qsteps.changed`;
4. `advanceQuest(id, c, opt?)`: `"quest"` gets optional integer `opt`, checked against `choose.options`;
5. `useQuestObject` top: `qsteps.use || rumours.use`;
6. `questKill` and the damage path: `tide.kill/hit`, `rumours.kill`, party credit for own bosses (#9);
7. `cast`/`useSlot`/`fireRanged`: `if (p.qlock) return` (plain unsynced field);
8. `pickTarget`: `range *= isBlob(m.kind) ? p.aggroMul * p.lureMul : p.aggroMul` (plain numbers, default 1);
9. hero death and `damagePlayer`: `qsteps.died` / `qsteps.hurt`;
10. `onLeave`: `qsteps.leave`, `apprentice.leave`;
11. `snapshot`/`restore`: new optional fields;
12. `updateRaids`: no Act 1 arrivals while `tide.marching`;
13. `shopNear`: `npcPresent` filter;
14. new handlers `qdrop`, `rumour`, `mentor`.

Transient state (not saved unless noted). A server handoff behaves like a disconnect.
| Step | State | Death | Leave | Rejoin |
|---|---|---|---|---|
| carry | holder, ground x/y, light | lantern drops at the hero (ground drain) | a partner on the step keeps it, else removed | count 0, lantern at the take spot |
| hold | timer, Odo HP, wave mob ids | run fails if no member alive in the area | waves unsummoned, timer reset | walk into the area to restart |
| unseen | armed, last checkpoint (= `questCount`, saved) | warp to last checkpoint, disarmed | nothing | walk to the last checkpoint to re-arm |
| sync | `turnedAt[seal] = {pid, t}` | that hero's turns cleared | cleared | — |
| pick / choose | none (stage, count saved) | — | — | — |
Light 0: lantern relit at the take spot, count 0. Ambush mobs (wrong grave) use `summonChain = -1`: not removed by `unsummon(pid, c)`,
removed on leave, despawn after 120 s.

Messages. Client → server (all through `limitMessages`): `"quest" {chain, opt?}`, `"use" {id}` (string ≤ 40), `"qdrop" {}`,
`"rumour" {take?: 0..2, drop?: true}`, `"mentor" {on}` (`allow("ask")`). Server → client: `"qstate" {chain, k, …}` (≤ 4 Hz, on change),
`"choice" {chain, title, text[], options[]}`, `"rumour"`, `"tide" {n, goal, marchAt?, result?}`, `"mentor"`; `sfx` evs:
`lanterndim lanternout lanternpass wavehorn odohurt graveright gravewrong seen sealturn sealsync bargain tidefull tidemarch tideend`.

Saves (`server/accounts.ts`, optional `HeroSave` fields, missing = 0, no migration): `flags?: number` (→ `arcs.$f`),
`cosm?: number` (→ `arcs.$c`), `owned?: string[]`, `rumour?: { day; done; i?; stage?; count? }` (stale day resets),
`mentor?: { on; n; names: string[] }` (names ≤ 50).
World save (`server/worldStore.ts`): `WorldState { v: 1; tide: number; marchAt?: number; marches: number }`. JSON `WORLD_FILE`
(default `data/world.json`, written like `ideaStore`); with `DATABASE_URL`, `postgresStore(url, undefined, "world")` (adds a `table`
param to `server/store.ts postgresStore`, default `"accounts"`, checked `/^[a-z_]+$/`). Load next to `initAccounts()` in
`server/index.ts`, flush in `onShutdown`.

### Concepts
1. **The Last Lantern** (`ZONE_ARCS` "lantern", Act 1, giver `monk` Brother Aldric, Lv 10, needs chain 0 past the `LANTERNS` quest).
   reach the drowned lamp post (Misty Marsh) → carry (take `lantern_last` in Misty Marsh, to the Brinewood shrine area, new ids) →
   use 3 new Brinewood ward-lamps (`chest: true`, finale). Holder: `qlock`, blob `lureMul` 1.25 (was 1.5). Drain 0.5/s, ×2 water, ×1.5 dark,
   ×2 ground (was ×3), light 100. Party on the step shares one lantern; delivery completes for every `together` member. `arcReward(10)`.
2. **Hold the Wheel** (`ZONE_ARCS` "wheel", giver `miller` Odo, Lv 4, needs mill arc done). talk Odo → hold (Odo, r 7 tiles, 90 s,
   2-3 slimes Lv 3-5 every 15 s, ≤ 6 alive, `home` = Odo) → kill `own` fused "Millrace Glutton". Odo HP 300, hurt every 500 ms by
   wave mobs within 1.2 tiles with no hero target. Out of the area > 5 s resets. Server cap 30 hold mobs.
3. **The Empty Grave** (`ZONE_ARCS` "grave", Lv 15, new NPC `sexton` at the Gravemoor gate, mourners `mourner1-3`). use 3 gravestones
   → talk with `npcs` (any order) → pick 4 graves (kind `grave`). Wrong: ambush titled skeleton (hpMult 3, Lv 17, not a night boss),
   back to step 1, count 0. Right: `choiceOf(grave) = 1`, outro names the living person. `arcReward(15)`.
4. **Unseen** (`ZONE_ARCS` "unseen", giver `defector` Nasrin, Lv 43, needs spire "mirrorpath" done). talk → unseen (4 checkpoints
   across the Thornspire Heights, count = last checkpoint) → use the Sanctum postern. `aggroMul` 1 by day, 0.65 dark, ×0.6 cover, floor
   0.35. Fail: a mob within 12 tiles targets the hero, or any damage → clear targets, warp to the last checkpoint.
5. **Two Letters** (`SIDE_ARCS` "letters", giver `oldfisher` Garrick, Lv 19, needs Redfang done). talk Garrick → choose (law 1,
   mercy 2) → talk `captain` (onlyIf law) | talk `ilka` (onlyIf mercy; new NPC by the Redfang fence). Law: `quartermaster` NPC with
   shop `"watch"`; mercy: `smuggler` at Saltmere beach with shop `"smuggler"`; Garrick idle line; Crown talk `sayBy`. Gold +
   potions, XP 0. Shops reuse existing stock.
6. **The Bargain** (inside the Hide Rite "mother" quest; no step added). When Ursk rises for a hero on the kill step: one `"choice"`
   while she's at full HP, hero within 8 tiles, < 20 s. Accept (`opt: 1`): flag 1, trait bit in `$c`, Ursk unsummoned, `bargain` fx,
   `nextStep`; Hale's hand-in `sayBy` cold lines. Refuse: flag 2, fight as now. Penance (`SIDE_ARCS` "penance", giver `captain`,
   needs bargain = 1): collect 6 Hide Charms (existing `charm`) → talk druid → talk captain → flag 3. Talent `TRAITS.hidebound`
   (-5% from `BEAST_FOLK` + `crowseer`, in `damagePlayer`) ships at 1.0. Trait overlay for wizard / vampire / summoner.
7. **The Tide** (`server/tide.ts`, `shared/tide.ts`). +1 per blob killed by a hero (not summons). Goal 1500 in `WorldState`. Full →
   `marchAt` = next dusk (dayFrac 0.633-0.70). 4 waves of blob packs (Lv 4→12, "Gloam Tide") walk to a point 10 tiles outside the west
   gate, outside `WATCH.sightTiles`; ≤ 40 alive, merging off on marchers, Act 1 raiders paused. Contribution = damage to marchers by
   heroes within 20 tiles of the gate (summons count for their owner). End: ≥ 3% share → `TIDE.gold(level) × (0.5 + share)` capped,
   top 3 a rune (`rollRune`), XP 0 beyond kill XP; meter resets. Client: meter on `client/src/daydial.ts`, banners, summary.
8. **Two Hands** (`ZONE_ARCS` "twohands", giver `tombrobber` Zahir, Lv 42, needs under arc questId ≥ 2). reach the Vault seal hall →
   sync (2 `seal` objects 10-12 tiles apart in a `VAULT` chamber) → kill `own` "Keeper of the Twin Seals" (sanddead, hpMult 3).
   Window 2000 ms with a group member on the step nearby, 6000 ms solo (test: base-speed walk is under it); a hero's summon within
   2 tiles of the other seal turns it too. Credits everyone on the step who is `together`.
9. **The Apprentice** (`server/apprentice.ts`). Veteran (Lv ≥ 11) talks to Hale → `"mentor" {on: true}`. Recruit = party member ≥ 10
   levels lower with `bossesBeaten(p) === 0` (pure fn over chain states). When the recruit finishes an `own`-boss step with the veteran
   `together`: recruit +60 gold, +3 potions; veteran `n` +1 per new recruit name; titles at 1 / 5 / 15 ("Mentor", "Captain's Own",
   "Warden of Oakvale"). No XP. Kill credit: an `own` summon killed by a `together` group member counts for its `summonFor` hero.
10. **Tavern Rumours** (`shared/rumours.ts`, `server/rumours.ts`). `rumourDay(now)` (UTC day), `rumoursFor(day, level, act)` → 3
    rumours built from `QuestStep[]`. Templates: `lost` (use → use), `missing` (reach → kill an own ambusher → use), `light`
    (reach with `night` → use). Zones like `bountyOffers` (level ±2, same act); seeded rng + `spotNear` for object spots. Giver: new
    NPC `alewife` "Mags" on the square with an ale-cart `NPC_DECOR` prop (away from siege zones). Act 1 first. One active rumour in
    `p.rumour` (unsynced, saved, sent as `"rumour"`). Reward gold 10 + 6×level, 25% rune, XP 0; title after 7.
11. **The Crown in the Sand** (`ZONE_ARCS` "sandcrown", giver Zahir, Lv 38, needs Sun chain past "kharsun"). use a crowned-seal
    cistern `sand_seal1` → reach the tomb it leads to → use 2 Ostrevar seals; then (auto) kill `own` "Ostrevar's Envoy" (sanddead,
    Lv 39, hpMult 3, voice), outro hints at Act 3. `arcReward(38)`, `arcReward(39, true)`.

### Work packages
TownRoom changes go strictly in order WP1 → WP7. Inside a WP, parallel work uses separate worktrees. `shared/quests.ts`: the
gameplay-engineer lands step defs with draft text, then the content-writer polishes on the same branch.
| WP | gameplay-engineer (serial) | parallel |
|---|---|---|
| WP1 | `shared/questSteps.ts`, quests.ts helpers, `needs`/`SIDE_ARCS`, `server/questSteps.ts` (pick/choose/npcs), hooks 1 3 4 5 11 13, `$f` save, `shared/cosmetics.ts` skeleton, watch + smuggler shops | client: `DialogPage.options` buttons, `"choice"` modal, grave objects; art: grave + seal objects, NPC sheets; content: Letters / Grave / Sand Crown text, patch note |
| WP2 | carry + hold, hooks 2 7 8 9 10, `qdrop`, `qstate` | client: lantern over head, light meter, Odo HP bar, hold timer, drop key, mobile; art: lantern sprites, sfx; content |
| WP3 | `aggroMul`, `coverAt`, warp, sync windows, summon reach | client: shadow icon, checkpoints, seal states; art: seal fx, sfx; content |
| WP4 | Ursk choice window, trait bit, `TRAITS.hidebound` (off), `sayBy`, penance arc | art: beast trait overlay ×3; client: trait + titles; content |
| WP5 | `store.ts` table param, `worldStore.ts`, index load/flush, `tide.ts`, hooks 6 12, bench `TIDE=1` | client: daydial meter, banners, summary; art: gate fx, sfx; content |
| WP6 | `shared/rumours.ts`, `server/rumours.ts`, handler, save field | client: questlog section, NPC dialog list; art: Mags, ale cart; content: template text |
| WP7 | `server/apprentice.ts`, own-boss party credit, `mentor` handler, titles | client: Hale button, title under names; content |
After each WP: tester, balance-analyst (WP2, 4, 5, 6, 7 + new bosses), reviewer.

### Risks
- No new synced Player/Mob fields; `arcs` grows by ~8 keys plus `$f`/`$c`. Mob extras unsynced (`MOB_FIELDS` unchanged).
- Never change the step count of the BEAST "mother" quest (would force `beastVer` 3).
- `chainDone(BEAST)` / `chainDone(CROWN)` must behave the same whichever way the Bargain goes (test).
- New chests / decor within 6 tiles of siege sites move `SIEGE_SITES`/`ENGINES`: pin in a test; run `tools/map-metrics.ts`.
- Tick cost: Tide march (≤ 40 mobs, merging off), hold waves (≤ 6 per instance, ≤ 30 server). Bench WP2 and WP5.
- Balance: new arc XP ~3-4 levels total vs "levelling slow"; rumour/Tide gold + runes; lantern `lure` + `qlock` at Lv 10.
- Exploits: grave answer visible in the client bundle; rumours roll at UTC midnight; alt-account mentor farming (cosmetic only).
- Raiders can hit marchers; the watch spears marchers at the gate, so the march goal stays outside watch sight (test).
- Unseen warp must reuse the `"travel"` snap path. Postgres: second pool; CI Postgres smoke must boot with the world table.

### Acceptance criteria
See the planner's list per concept; each WP's tester brief carries the criteria for that WP. In short, per concept:
1. E takes the lantern; cast/useslot blocked, attack works; drain ×water/×night/×ground; partner pickup; death drops it; light 0
   resets; delivery finishes for both party members; a straight day walk uses ≤ 60% light.
2. 90 s timer, ≤ 6 alive; parked slime hurts Odo; Odo 0 or > 5 s out resets; 90 s advances; leaving removes waves.
3. pick accepts only its graves; wrong → owned horror + stage back; horror survives `nextStep`, gone on leave; right pays
   `arcReward(15)`; mourners any order.
4. targeted → warp to last checkpoint, target cleared; `aggroMul` lower at night / in cover; checkpoint count survives save.
5. opt 2 → mercy path to Ilka; smuggler only with mercy, quartermaster only with law; bad opt ignored; Crown variant line.
6. one prompt; accept → Hale step, flag 1, trait; chain done, act 2 gate unchanged; refuse = normal fight; old saves bargain 0;
   penance → flag 3.
7. +1 per blob; store round-trip (JSON, Postgres when `TEST_DATABASE_URL`); `marchAt` next dusk; share and pay rules; reset; no
   raiders during the march; goal outside watch sight.
8. party 1.5 s ok, 2.5 s not; solo 5 s ok; golem by seal B works; base-speed walk < `soloMs`.
9. Lv 25 mentor + Lv 5 recruit: recruit's boss dies to the mentor → recruit advances, +60 gold +3 potions, mentor `n` 1 + title,
   no mentor XP; same recruit again doesn't raise `n`.
10. deterministic 3 rumours; objects in zone on open ground; pays gold no XP; once per day; stale day loads clean.
11. gated on Sun past "kharsun"; Envoy own-only; ends in the field; passes zone-arc invariants.
All: `tests/zone-arcs.test.ts` passes; no `$` arc ids; siege sites unchanged; `tests/mobview.test.ts` unchanged.

### Checks
New tests: `tests/quest-steps.test.ts`, `quest-carry-hold`, `quest-unseen-sync`, `quest-choices`, `tide`, `rumours`, `apprentice`;
extend `tests/store.test.ts`, `tests/zone-arcs.test.ts`; siege-sites pin. Balance: `pve.ts --bosses` (new bosses), `pve.ts --zones`
at Lv 10, `duel.ts` only if Hidebound goes on. Bench: WP2 and WP5 (`TIDE=1`, `SPREAD=1`). Every WP: `npm test`, `npm run build`,
`node tools/smoke.mjs`, map-metrics when placing NPCs/props, phone-size UI check, patch note.

## Log
- 2026-11-13: plan written; baseline bench taken; WP1 started.
- 2026-11-13: WP1 gameplay landed in the tree (gameplay-engineer): `shared/questSteps.ts`, `server/questSteps.ts`, `shared/cosmetics.ts`,
  `choose`/`pick`/`npcs`/`onlyIf`/`sayBy`/`afterBy`, `QuestChain.needs`, `SIDE_ARCS` "letters", `ZONE_ARCS` "grave" + "sandcrown", NPCs,
  shops `watch` / `smuggler`, hooks 1 3 4 5 10 (leave) 11 13. Siege sites, engines and chests unchanged; map-metrics unchanged.
- 2026-11-14: WP2 gameplay landed in the tree (gameplay-engineer): carry + hold in `server/questSteps.ts`, `lightDrain` / `isDark` / `wetAt` /
  `CARRY` / `HOLD` in `shared/questSteps.ts` (HoldSpec waves take `n` / `level` ranges and `npcDmg`), hooks 2 7 8 9, `qdrop`, `qstate`,
  `ZONE_ARCS` "lantern" + "wheel". Siege sites and engines unchanged, one new chest `lantern_1_3`; map-metrics unchanged.
- 2026-11-14: Ostrevar's Envoy hpMult 3 -> 7 (was a walkover: 7-12 s, 100% all classes; now 15-25 s, 100%). Lantern holders can't use portals, waygates or Mawdeep ropes/stairs (Claude 2026-11-14). Choice modal can be closed with Esc and has no reopen: WP4 must resend the Bargain prompt while its window is open.
- 2026-11-14: WP2 balance: Millrace Glutton 100% all classes (7-11 s); Hold-wave XP ~190/min vs ~160-190 grinding (not an exploit). WP3 server landed. Polish list: carried lantern is small (~10 px); quest warps reuse "travel" and play the portal sound (client should skip when `why` is set); check that a hidden hero can't skip a stretch by portal.
- 2026-11-14: WP4 server landed. Bargain prompt resends every 6 s while open (the client modal can be closed with Esc); `"choice" {chain, close: true}` when it ends. Ursk keeps fighting during the offer (no free stun opener). Hidebound list of beast kinds is written out in `shared/talents.ts` (can drift from `BEAST_FOLK`). Penance needs bargain 1 AND the Hide Rite handed in. Keeper of the Twin Seals hpMult 3 -> 7 like the Envoy. Test flakes fixed: room logs to stderr, champions split count, Void Arsenal lance poll.
- 2026-11-14: WP5 Tide server landed. Numbers in `shared/tide.ts` `TIDE` (goal 1500, 4 waves 24/30/36/40 Lv 4-12, ≤ 40 alive, 12 min limit, gold 15 + 8 × level capped 350, runes Lv 12 for the top 3). Goal point 10 tiles west of the west gate, 11.2 tiles from the nearest watch post (sight 6). A march is lost if the server restarts mid-march (next dusk is booked). One room at a time owns the Tide (server/tide.ts); every room fills the meter.
- 2026-11-14: WP6 Rumours server landed. Errands are keyed by (UTC day, zone): everyone offered the same zone that day gets the same errand. Act 1 overworld zones only (no crypts or warrens: no night underground). 365 days x Lv 1-30 checked: every object in its zone, on open ground and reachable on foot. `questKill` own-steps now also need `m.summonChain === c`, so rumour and grave ambushers can't fill a chain's own-boss step (keep this in WP7). Reaching 7 rumours overwrites any earlier title (no owned-titles list yet).
- 2026-11-14: WP7 Apprentice server landed. Own-boss credit for a `together` party member goes through `ownerCredit`; rumour (-2) and grave (-1) ambushers and hold waves never count. A recruit is a hero with no `own`-boss step passed (main-story bosses aren't `own`). Titles are now owned (bitmask `HeroSave.titles`, `server/titles.ts`): earning one shows it only if none is shown; `"title" {i}` picks. Rumour ambusher "The Hollow King" renamed (Ostrevar's title).
- 2026-11-14: reviewer verdict OK TO MERGE (code), with bench and balance numbers required in the PR. Fixed from the review: minimap arc arrows for givers of two arcs, one room owns the Tide, inline numbers moved to shared tables, Unseen hide ends away from the climb.
- 2026-11-14: merged the default branch (168 commits: Player.quests, owner-only Player.me, Songweaver). The plan above still says
  `Player.arcs`; the code no longer has it. All chains, ours included (zone arcs grave, sandcrown, lantern, wheel, unseen, twohands;
  side arcs letters, penance, CHAINS[18..25]), live in the owner-only `me.quests` map under their id. Choice flags (`$f`) are now
  `Player.me.flags` (owner-only number), cosmetics (`$c`) the public `Player.cosm` (other clients draw the title and the beast
  hide), both read through `metaOf` / written through `setMeta`, never deleted or undefined. Save format unchanged (`flags`, `cosm`,
  `${id}Id/Stage/Count/Ver`). Player: 47 synced fields (cosm is index 46). A Songweaver with the beast trait wears the wizard's
  mantle (her sheet is the wizard's body); her own overlay is open.
- 2026-11-14: merged the default branch again (35 commits: PR #400 owner-only scalars in `me`, #407 tall houses and the mill
  wheel, #406 clan war foundations, #390 iso props, #403 perf second wave). `flags` stays in `me` (now after #400's nine
  numbers, same getter/setter pattern), `cosm` stays public on Player: Player 38 synced fields (cosm is index 37), PlayerPrivate 12.
  The perf wave's in-loop `pickTarget` skips heroes past twice the aggro range: that box now scales per hero by `aggroMul` and
  (blobs) `lureMul`, or a hated lantern carrier at 2-2.5x would be missed (`tests/mobtick.test.ts` guards it). The mill moved
  down a tile: the Millrace Glutton's spot (`sumAt(108, 41)`) now resolves to (107.5, 40.7), open and reachable; Odo's hold area and
  rim are unchanged (117 of 148 tiles open, the new wheel deck tiles are solid and outside the rim). Map-metrics identical to the
  default branch; chests and siege sites as before (only our two new chests differ from the default). Clan war is not wired into
  the server yet (no travel paths): when it is, any new teleport must call `lanternHeld`.
