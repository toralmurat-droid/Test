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
  features modelled so far: everything the vampire wears, plus `bones`, `skull`, `rags`, robes, cowl, horned cowl.
- Rebuild a family only: `npx tsx tools/art/build-one-mob.ts mob_slime mob_blobling ...` (seconds, not minutes).

## Families
| # | Family | Sheets | Status |
|---|---|---|---|
| 1 | Blobs | slime, blobling, shooter/warrior/healer, venom/frost/fire/storm, motherblob 1-3 (`blobs3d.ts`) | done |
| 2 | Skeletons | skeleton (+axe/spear/bow, champion), skeletonmage (+champion), necromancer (`body3d.ts` bones3D / skull3D / garb3D, cowl + horns) | done |
| 2b | Other undead | crawler, wight, bride (need 3D hair/faces and dresses), bonehound, mistwraith | |
| 3 | Bandits and Redfang | bandit (+brute/archer/champ), banditchief, outrider, crossbowman, firebrand, redcaptain, rourke, nightraiders | |
| 4 | Beasts | warhound, gildhound, vulture, crowncrow, rattler, scorpion, sinkworm | |
| 5 | Beast-folk (Mawdeep) | gnawkin, tuskborn, silkwretch, duskwing, crowseer, gnasher, weaver, packlord, hornbrute, hidemother, folk variants | |
| 6 | Desert | nomad, sanddead, veiled, camelfolk, sphinx, sunwright | |
| 7 | Moors / Badlands / Sinkholes / Crown | boghag, legionary, cairnlord, barrowking, delver, cackler, stagkin, quillback, stitcher, hidechief, mawfather, oathbreaker, crownguard, hollowherald, courtmagus, pretender, thronewarden, rivenking | |
| 8 | Demons and bosses | demon 1-4 (bone harvest frames), hollowking | |
| 9 | Golems and wisps | golem/colossus x4 elements, wisps x4 | |
| 10 | War troops | war_* soldiers (fall frames), carts, rams, tunnels | |
