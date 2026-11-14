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

## D – monster plate redesign (decided 2026-11-14, not built yet)
Mockup scripts: session scratchpad `hud/C/mock.cjs`, `frames2.cjs`, `frames5.cjs` (render inside the running game).
Owner decisions:
- Layout: A (compact plate: level tile, name, weak/resist/status icons, thin HP bar, no numbers) for every monster,
  B (one extra row of affix icon + name, Songweaver ear/pitch icons) for champions and elites, C (sentence-case
  details, HP numbers, full weak/resist line) only while **Alt** is held. The plate takes the top-centre slot and the
  war plaque (`warPlaque.ts`) hides while you point at a monster (D).
- Frames in the orb/bar bronze style, more elaborate by rarity, six tiers: normal, elite, champion, named, quest, boss.
  Higher tiers go further. Quest and named get their own frames (quest: wood, parchment edge, wax seal, scroll ends;
  named: steel, violet gems, laurel crest, fins). Named needs a rule: today any titled monster counts as a quest target.
- Champion and boss: the orb statue (angel / demon) **cut vertically in half**, the left half on the left of the plate
  and the right half on the right, **large** (2x), plinth **flush with the frame's bottom**. Boss demon needs a lighter
  outer edge to read on dark ground.

## To do (owner's list)
- Build D above.
- Chat log: a small toggle to hide it (owner, 2026-11-14).
- Stray grey "-28" near the HP orb in town: source not found, needs a repro.
