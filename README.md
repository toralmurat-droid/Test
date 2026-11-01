# Pixel Town Brawl

A browser-based online multiplayer pixel brawler set in a small town.

- **Client:** Phaser 3 + TypeScript (Vite)
- **Server:** Colyseus 0.15 (Node.js). The server is authoritative: it runs movement, combat and respawns.
- **Shared:** map, movement and constants used by both sides (`shared/`)

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173 in two browser tabs to see the multiplayer. The game server runs on port 2567.

To keep a local game on the latest merged version, run `npm run live` instead of `npm run dev`: it checks GitHub every minute,
fast-forwards when the branch has new commits (running `npm install` if dependencies changed) and restarts the game.
It skips an update rather than overwrite local commits or edits.

Controls: WASD/arrows to move, Space to attack, E or Shift for your class skill, Q to drink a potion, R for your ultimate (level 10), C for the hero menu, T for the skill tree, Enter to chat.

Gameplay:
- **Classes** (`shared/classes.ts`):
  - **Knight:** most HP, slow, strong sword. Skill *Shield*: blocks 70% damage and knockback for 2s.
  - **Ninja:** fast, low HP, rapid strikes. Skill *Dash*: blink forward, untouchable for a moment.
  - **Wizard:** ranged fireballs. Skill *Nova*: blast everything around you.
  - **Archer:** long-range arrows. Skill *Volley*: 3 arrows side by side. Ultimate *Arrow Rain*.
  - **Barbarian:** axe brawler. Skill *Rage*: +30% damage and +20% speed for 5s. Ultimate *Leap*.
- **Combos:** each class has a 3-hit attack chain (press attack again within 0.7s). The 3rd hit is a finisher: Knight wide slam, Ninja lunge, Wizard big fireball, Archer power shot, Barbarian axe smash. Tuned in `combo` in `shared/classes.ts`.
- **Attack variety:** normal hits pick 1 of 4 attack moves at random (never the same twice in a row).
- **Emotes:** type /wave /cheer /laugh /sit /sleep in chat. Heroes also fidget when standing still.
- **Levels, stats and powers** (`shared/powers.ts`): XP raises your level (max 20). Each level auto-adds 5 points to **Stamina** (max HP), **Strength** (Knight/Ninja/Archer/Barbarian attack) and **Magic** (skills, cooldowns, Wizard fireballs), split by class. Powers unlock at levels 1, 3, 5, 8 and 10 (the level 10 one is an ultimate on **R**). Press **C** for the hero menu; it also pops up on level-up.
- **Skill tree** (`shared/talents.ts`, press **T**): every level after 1 gives 1 skill point. Each hero has 3 branches (e.g. Knight: Blade, Bulwark, Command) of 3 skills with up to 3 ranks; a branch's 2nd skill needs 2 points in it, the 3rd needs 4. Effects: damage, skill damage, crit, lifesteal, max HP, armour, speed, cooldowns, regen. Reset is free out of combat.
  - Knight: Shield, Iron Skin, Cleave, Second Wind, Earthquake (stun)
  - Ninja: Dash, Swift Feet, Critical Strike, Shadow Strike, Blade Storm
  - Wizard: Nova, Mana Flow, Ignite, Frost Nova (slow), Meteor
- **Loot** (`shared/items.ts`): monsters drop gold and health potions; walk over them to pick up. Potions (max 5) heal 40% HP. Killed by a player? You drop half your gold.
- **Regen:** HP regenerates after 5s without taking damage, much faster on the Market Square.
- **PvP:** players can fight each other anywhere except the cobbled **Market Square**, which is a safe zone.
- **Monsters:** slimes and skeletons roam the outskirts outside the palisade. They chase nearby players, fight back when hit, and give XP when killed. They live in spawn zones (North Meadow, Goldenreach Farms, Mirror Pond, Southern Fields, Whispering Woods, Old Ruins), each with its own monster mix and cap. While a zone is below its cap, its timer brings back one monster every 10-20s. The HUD shows the zone's count and next respawn. Killing a zone's last monster shows a big "<zone> cleared!" banner to that player and a line in everyone's feed. They can't enter the square and give up the chase if pulled too far from home.
- Monster stats live in `shared/constants.ts` (`MOBS`); zones and timers in `shared/spawns.ts` (`SPAWN_ZONES`).

## The world: Oakvale

The starting region is a 160×120-tile (16px) medieval map, generated deterministically in `shared/map.ts` so the server
and every client build the same world. It has a ground layer and an object layer (objects and water are solid, except
bushes, which you can walk through).

It is laid out like a starting village: four narrow roads leave Oakvale, one to each nearby place (the farms to the
west, the Old Ruins over the bridge to the east, the North Meadow, and Stonecrag Quarry to the south). Footpaths branch
off to the Hunter's Camp, the Watchtower, the mill and Mirror Pond and the marsh. Generation also guarantees that every walkable tile can be reached.
`npx tsx tools/map-metrics.ts` prints walkability, reachability and detour numbers.

- **Oakvale** (centre) — a small ruined village: Market Square (safe zone) with well, campfire and a stall, and four
  roofless ruins you can walk inside (Chapel of the Dawn with graveyard, The Rusty Tankard, the Smithy, a cottage)
- **Goldenreach Farms** (west), **Hunter's Camp** (north-west woods), **North Meadow** (north)
- **Mirror Pond** and **Misty Marsh** (south-west, with a boardwalk), **Stonecrag Quarry** (south-east)
- **Millbrook Mill** on **River Ashwell** (east), then **Whispering Woods** with trails, the **Old Ruins** and the
  **Old Watchtower**

Each area in `AREAS` can list the monsters that belong there (`mobs`), and `randomPointInArea(name)` returns a free
spot inside an area, for per-zone spawns.

In game, a minimap sits top-right and a banner shows the area name as you walk between regions.

The world is alive (`client/src/ambient.ts`, cosmetic only): trees and bushes are tall sprites that sway in a travelling
wind and hide you when you walk behind them; water ripples and has shoreline foam, the mill wheel turns, grass and
flowers sway, chimneys and the campfire smoke, buildings cast shadows, and butterflies, birds, fireflies, jumping fish
and cloud shadows drift around.

Detail layer (`client/src/details.ts`): shaded roofs with ridges and eaves, pebbles, tufts, mushrooms and fallen
leaves, grass spilling over road edges, rounded shorelines with reeds and lily pads, ducks on Mirror Pond, door
lanterns and gate banners. A 30-minute day/night cycle (shared by all players via the clock) lights up windows,
lanterns and the campfire at night. Add `?time=day|dusk|night` to the URL to force a time of day.

**Map viewer:** with `npm run dev` running, open http://localhost:5173/map.html to see the whole map with area,
collision and grid overlays (no server needed). Edit `shared/map.ts` and it hot-reloads.

## Production

```bash
npm run build
npm start
```

This runs one Node server (default `PORT=2567`) that serves the built client and the game over WebSockets. It deploys to any VPS or to Fly.io/Render behind HTTPS (WSS is picked up automatically).

## Layout

```
shared/   constants.ts, classes.ts (heroes, skills, levels), map.ts (world layout, areas, collision), movement.ts
server/   index.ts (HTTP + Colyseus), TownRoom.ts (state, tick, combat, chat)
client/   index.html, map.html (map viewer), style.css,
          src/ (main.ts, TownScene.ts, tileset.ts (pixel-art tiles), textures.ts, minimap.ts, mapview.ts)
```

## Next steps
- Replace the procedural art with real sprites/tilesets (Aseprite, Tiled)
- Accounts and persistence (PostgreSQL)
- Shop / NPCs to spend gold, gear
- Input-sequence reconciliation and area-of-interest filtering for scale
