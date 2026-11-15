# HUD rework (desktop) – progress log

Owner request 2026-11-14: rework the in-game HUD. Desktop only (1920×1080, 1366×768); no phone work.
Shipped as three PRs, one after another on one branch: A (bugs) → B (layout) → C (monster info).

## A – bugs (merged, toralmurat-droid/Test#397)
- Orbs kept old numbers when the max grew at full HP/mana (`orbs.ts`, `hudLogic.ts`).
- Kill feed drew over the quest tracker (`placeFeed()` in `TownScene.ts`; B replaces it with a flex column).
- Level-up note now hides when no stat points are free.
- Group panel: reactions text moved to the Hero tab; "Everyone nearby is in your group".
- Rune pickup sentence finished.
- Open: stray grey "-28" near the HP orb in town, source not found (only `floatText` in the "hit" handler makes `-N`).

## B – layout (done)
- Bottom centre, from the bar up: `#statusrow` (chord widget left, buffs right), then `#promptstack`
  (interact prompt, then `#lvlnote`). All seven `*prompt` elements mount in the stack.
- Top right: `#topright` flex column: online/ping/fps pill (fixed-width cells), minimap + dial (kept on screen),
  location, quest tracker, feed. World name labels under the column are hidden (`hudOccludes`).
- Light weathered backing on `#chatlog` (when it has text) and `#partyframe` (when grouped); chat log clears the input.
- Bottom bar never draws below 100% (`barScale`, `--barzoom`); one slot text style: key label and counts 12 px tiny,
  cooldown 18 px, same outline; counts stay inside the slot.
- New modules: `client/src/hudSlots.ts`, `hudSlots.css`. Tests: `tests/hudSlots.test.ts`.
- Name labels are isoAnchor'ed to their sprite: test them with `screenOf(cam, label.x, label.y, cr, sprite)`.
- Not verified: other window sizes, dpr 1.25, several prompts at once (code keeps them exclusive).

## C – monster info (built and reviewed; server `by` on "hit" ships with it, `server/hitBy.ts`)
- 2026-11-14 (owner): every hurt monster shows its world HP bar, whoever hurt it (`showWorldBar` `damaged`).
Owner rules: monster HP bars only on hover or damage; a top-of-screen bar shows the hovered monster's level, health
and characteristics; monster specifics (helper text, icons) only in that bar.
Owner decisions:
- "Recently hit" = a hit by you or your group in the last 4 s. Needs an attacker field on the server "hit" broadcast.
- Status effects (burn/bleed, elemental mark, stun stars, execute arrow, mark sigil) stay in the world and are also
  listed as chips in the bar.
- No new danger marker: champions keep tint/glow/ring; level labels go.
- Your own summons always show a small HP bar, no name label; other summons follow the monster rule.
Defaults: bar also shows your click target when nothing is hovered (hover wins); move callouts (GROUND SLAM!) stay;
no damage/XP estimate in the bar; NPC/hero label edge clamping out of scope.
- In-world monster labels, champion affix icons (`championFx.ts`) and Songweaver ear/pitch icons (`soundCues.ts`)
  move to the bar. Float texts get collision lanes (`floatLanes.ts`).
- No new synced Mob/Player fields; all bar data comes from synced fields + `shared/` tables.
- New modules: `client/src/monsterInfo.ts` (pure), `monsterBar.ts/.css`, `floatLanes.ts`. Hover re-picks every 100 ms
  in `pointer.ts`. Update `tools/e2e-songweaver-fx.cjs` and `tools/e2e-summoner.cjs` (read removed labels).

## D – monster plate redesign (decided 2026-11-14, built 2026-11-15)
Mockup scripts: session scratchpad `hud/C/mock.cjs`, `frames2.cjs`, `frames5.cjs` (render inside the running game).
Owner decisions:
- Layout: A (compact plate: level tile, name, weak/resist/status icons, thin HP bar, no numbers) for every monster,
  B (one extra row of affix icon + name, Songweaver ear/pitch icons) for champions and elites, C (sentence-case
  details, HP numbers, full weak/resist line, Songweaver sound hints) only while **Alt** is held. The plate takes the
  top-centre slot. The Songweaver sound hints stop going to chat (`soundCues.ts`); they live in the Alt details.
- Frames in the orb/bar bronze style, more elaborate by rarity, six tiers: normal, elite, champion, named, quest, boss.
  Higher tiers go further. Quest and named get their own frames (quest: wood, parchment edge, wax seal, scroll ends;
  named: steel, violet gems, laurel crest, fins). Named needs a rule: today any titled monster counts as a quest target.
- Champion and boss: the orb statue (angel / demon) **cut vertically in half**, the left half on the left of the plate
  and the right half on the right, plinth **flush with the frame's bottom**. Angel: scaled so the top of its halo is
  flush with the frame's top. Demon: large (2x), colour as is. Quest and named: no statues.

D as built: `monsterBar.ts/.css` (layout A/B/C, Alt held = C, 120 ms appear delay), `plateArt.ts` (six frames, crests, fins,
scroll ends, orb statue halves from `orbs.ts` `drawAngel` / `drawDemon`, 7x7 glyphs), `monsterInfo.ts` (tiers, `plateRows`,
`detailLines`). "Named" = a titled `nightraider` (`NAMED_KINDS`); the client cannot tell other quest targets from other
unique monsters (`Mob.summonFor` is not synced), so every other titled monster is "quest". Gloam Tide marchers (title
"Gloam Tide") show as plain monsters. Songweaver sound hints are in the Alt details, no longer in chat.

## To do (owner's list)
- (done, 2026-11-15) Monster plate D (`monsterBar.ts`, `plateArt.ts`).
- (done, 2026-11-15) Chat log hide toggle (`chatToggle.ts`); war plaque + notice + party frame in `#topleft` (the Heat
  gauge drops below that column when it reaches down to it); Tide card in `#topright` above the quest tracker.
- Stray grey "-28" near the HP orb in town: source not found, needs a repro.
- Named monsters: the client can't tell them from quest targets; a synced Mob flag would.

## E – character, inventory and skills panel (decided 2026-11-15)
Mockups: session scratchpad `hud/C/panels.cjs`, `panels2.cjs` (restyle the real panel in the running game); renders
`hud/C/sheets/mock-B2-character-1920.png`, `mock-C-inventory-1920.png`, `mock-D-skills-1920.png`.
Owner approved all six:
- A: the stat sheet column (`#spsheet`) leaves every tab; all stats live once, on Character.
- B: Character in two columns. Left: name, "Wizard · level 50", XP bar (gold gradient), stat points, four attribute rows
  (value, + button, one plain effect line), Reset points + cost. Right: Offense, Defense, Resistances (element icons),
  a "?" for elemental reactions instead of the paragraph. **With colour:** attribute colours (STR red, STA amber,
  MAG blue, DEX green) on a small tag, the name, a left stripe and a faint row tint; stat values tinted by kind
  (health red, mana blue, spell damage violet, attack/damage orange, crit/attack speed gold, move speed green);
  Offense header orange with a crossed-swords mark, Defense blue with a shield mark.
- C: Inventory = doll + bag, one dim hint line, loot filter behind a small ⚙. Item details become a compare card beside
  the panel (the hovered item vs what you wear, changes in green/red). Doll slots show faint icons, not words.
- D: Skills: one hint line + "?", points left as a badge on the Skills tab, details readable (no tiny caps),
  "No points to spend" dim instead of red.
- E: tabs and headers in the normal pixel font, sentence case, no letter-spacing; tiny font only for numbers/keys.
- F: panel ~860 px wide (was ~1060), bronze frame like the elite monster plate.

## F – quest log (decided and built 2026-11-15)
Mockup: session scratchpad `hud/C/qmock.cjs`; renders `hud/C/qlog/mock-active-1920.png`, `mock-completed-1366.png`.
Owner approved all six:
- Q1: list ~270 px, one-line titles, grouped by story chain with its progress ("The Gloam · 4 of 12"), level small at the right.
- Q2: tabs Active / Completed / Rumours with counts; completed greyed with a tick.
- Q3: detail = title, one meta line ("Given by Brann · Mirror Pond · level 4+"), description, each objective once with
  its count inside its bar (later steps dimmed), reward row with icons.
- Q4: one way to track: ◆ per row (hollow = not tracked) and a "◆ Tracked" toggle by the title; the big button and
  the footer hint go.
- Q5: bronze frame, sentence-case pixel-font headers, ~860 px, centred; the list scrolls inside at 1366x768.
- Q6: "Show on map" opens the world map at the objective.
F as built: `questlog.ts` (+ `questlog.css`, pure helpers in `questLogView.ts`), "Show on map" via `Minimap.showAt/canShow` (the map only shows the hero's own area, so a quest elsewhere shows "In the Sunscar desert: travel there to see it on the map" instead). Chain progress = finished quests of the chain / all its quests.
