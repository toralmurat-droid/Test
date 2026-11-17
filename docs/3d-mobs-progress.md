# 3D-built monsters: progress log

Murat 2026-11-17: rebuild all characters, mobs, decor and animations "in 3D turned to isometric, like the vampire",
in sequence, mobs first. Order: monsters family by family (one PR each), then the other heroes, then decor/props,
then animations. Art direction: detailed, dark, weathered pixel art at one resolution (like the village bonfire),
never smooth. Performance: everything is baked by `tools/art` at the old sheet sizes, so the game's cost is unchanged.

## How it works
- `tools/art/paint/mob3d.ts`: the shared monster renderer. Models are soft shapes (signed distance fields: `sphere`,
  `ell`, `cap`, `chain`, `cone`, `torus`, `rbox`, `custom`; `cut` carves, `inner` floats inside jelly) in the
  monster's own frame (x forward, y its left, z up, world px). `renderMob(model, YAW[dir], w, h, oy)` ray-casts it
  from the iso camera onto the sheet's 1.5 texels/px grid: upper-left light, AO, glints (`spec`), grain, emissive
  parts (`emit`), see-through `jelly`, inner lines, glowing eye texels, halos and a ground shadow.
- `tools/art/paint/mobs.ts`: a `Sheet` with `pix(f)` is 3D-built; the build loop runs `pixelize` (posterize, rim,
  selout outline, weathering) on it like every other sheet. Frame layout is unchanged (12 frames: down/up/right
  stand+step, then wind-up/strike per facing).
- Humanoid monsters: body.ts `MOB3D` names are ray-cast by `body3d.ts build3D` straight onto the sheet grid
  (`setMob3D(frame)` while `mobs.ts humanoid()` poses them; weapons stay painted, moved to the 3D hands). Look
  features modelled so far: everything the vampire wears, plus `bones`, `skull`, `rags`, robes, cowl, horned cowl,
  masks, beards, tabards, fur kilts, harness, bracers, quivers, scarves, hood/bandana/kettle/horned helm, crests, pelts.
  Monster-only parts are behind `setMonster3D` (also darker ramps), so the vampire hero is unchanged.
  Not yet: palmFlame, wings, tails, beast heads, dresses, long hair from behind.
- Rebuild a family only: `npx tsx tools/art/build-one-mob.ts mob_slime mob_blobling ...` (seconds, not minutes).

## Families
| # | Family | Sheets | Status |
|---|---|---|---|
| 1 | Blobs | slime, blobling, shooter/warrior/healer, venom/frost/fire/storm, motherblob 1-3 (`blobs3d.ts`) | done |
| 2 | Skeletons | skeleton (+axe/spear/bow, champion), skeletonmage (+champion), necromancer (`body3d.ts` bones3D / skull3D / garb3D, cowl + horns) | done |
| 2b | Other undead | crawler, wight, bride (need 3D hair/faces and dresses), mistwraith (bonehound done in 4) | done: crawler + mistwraith (beasts3d.ts, scaleModel), bride (dress = robe3D), wight (in 7) |
| 3 | Bandits and Redfang | bandit (+brute/archer, champions), banditchief, outrider, crossbowman, firebrand, redcaptain, rourke (`face3D` masks/beards, `extras3D` tabard/fur kilt/harness/bracers/quiver/scarf, hood/bandana/kettle/horned helm, helm crest, fur pelt) | done |
| 3b | Night raiders | nightraider_* (raiders3d.ts: horse, rider, cloak sheet, 7 weapons) | done |
| 4 | Beasts | warhound, gildhound, bonehound, vulture, crowncrow, rattler, scorpion, sinkworm | done (beasts3d.ts, wired with `beast3D` in mobs.ts) |
| 5 | Beast-folk (Mawdeep) | gnawkin, tuskborn, silkwretch, duskwing, crowseer, gnasher, weaver, packlord, hornbrute, hidemother, folk variants | done (body3d.ts beastHead3D + beastParts3D; also unlocks camel, lion, mole, hyena, stag, quill heads) |
| 6 | Desert | nomad, sanddead, veiled, camelfolk, sphinx, sunwright | done (robe3D for living robed monsters, sphinx nemes in beastHead3D) |
| 7 | Moors / Badlands / Sinkholes / Crown | boghag, legionary, cairnlord, barrowking, delver, cackler, stagkin, quillback, stitcher, hidechief, mawfather, oathbreaker, crownguard, hollowherald, courtmagus, pretender, thronewarden, rivenking | done: wight, boghag, legionary, cairnlord, barrowking, delver, cackler, stagkin, quillback, stitcher, hidechief, mawfather, oathbreaker, crownguard, hollowherald, courtmagus, pretender, thronewarden, rivenking (wizard hats, painted mist/palm flame over 3D) |
| 8 | Demons and bosses | demon 1-4 (bone harvest frames), hollowking | done: demon 1-4 (rip frames in 3D, boneArmour in beastParts3D), hollowking in 2b |
| 9 | Golems and wisps | golem/colossus x4 elements, wisps x4 | done (golems3d.ts) |
| 10 | War troops | war_* soldiers (fall frames), carts, rams, tunnels | done: soldiers (fall frames rotated in 3D); carts, ram, tunnel in siege3d.ts (down/up views drawn at 0.8 and pulled in to fit 44 px) |

## Decor (baked 3D props)
Props are modelled in `tools/art/paint/props3d.ts` with the SDF prims of mob3d.ts, ray-cast by `prop3d.ts` in the
runtime prop painter's projection (`client/src/isoPaint.ts`: u, v, z texels; x = ox + u - v, y = oy + (u + v)/2 - z),
and baked by `npx tsx tools/art/bake-props.ts [key...]` (PREVIEW=dir writes painted-vs-baked images) to
`client/public/assets/hd/props/<key>.png`. The client loads them under the painted keys (`worldProps.preloadBakedProps`,
`BAKED_PROPS`), so `sheet()` skips painting; the painted version stays as the fallback.

| # | Set | Props | Status |
|---|---|---|---|
| D1 | Village and camp | lantern pole, dummy, skull pike, pennants red/black, net rack, spear/weapon rack | done |
| D2 | Watchtower, spears on the ground, mill wheel, cows | | done (shipwreck stays painted for now: a 300x200 2D painting) |
| D3 | Siege works (siegeWorks3d.ts): catapult, ram, siege tower, lumber, sawhorse | | done |
| D4 | Dungeon props (dungeon3d.ts): brazier, torch stake (painted flames over 3D), hide rack, skull pole, rock spike | | done |
| D5 | Deep dungeon props (deep3d.ts): candles, skull pyramid, urns (sarcophagus, pillar already iso) | | done |
| D6 | Mawdeep quest objects (dungeon3d.ts): silk cocoon whole/cut, Hide Rite totem whole/burnt | | done |
| D7 | Shipwreck (wreck3d.ts): shell hull in its own pitched/rolled frame, breach + ribs + ooze hold, torn sail | | done |
| D8 | Throne, crown/ward stones, element props (elements3d.ts; fw()/fbox() face-the-viewer frame) | | done |
| D9 | Morwen's tent (tent3d.ts; the alchemy rig is already isoPaint 3D) | | done |
| D10 | Saltmere harbour, lanterns | | next |
