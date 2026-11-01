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

Controls: WASD/arrows to move, Space to attack, E or Shift for your class skill, Q to drink a potion, Enter to chat.

Gameplay:
- **Classes** (`shared/classes.ts`):
  - **Knight:** most HP, slow, strong sword. Skill *Shield*: blocks 70% damage and knockback for 2s.
  - **Ninja:** fast, low HP, rapid strikes. Skill *Dash*: blink forward, untouchable for a moment.
  - **Wizard:** ranged fireballs. Skill *Nova*: blast everything around you.
- **Combos:** each class has a 3-hit attack chain (press attack again within 0.7s). The 3rd hit is a finisher: Knight wide slam, Ninja lunge, Wizard big fireball. Tuned in `combo` in `shared/classes.ts`.
- **Attack variety:** normal hits pick 1 of 4 attack moves at random (never the same twice in a row).
- **Emotes:** type /wave /cheer /laugh /sit /sleep in chat. Heroes also fidget when standing still.
- **Levels:** XP from monsters and PvP kills. Each level adds HP and damage and fully heals you.
- **Loot** (`shared/items.ts`): monsters drop gold and health potions; walk over them to pick up. Potions (max 5) heal 40% HP. Killed by a player? You drop half your gold.
- **Regen:** HP regenerates after 5s without taking damage, much faster on the Market Square.
- **PvP:** players can fight each other anywhere except the cobbled **Market Square**, which is a safe zone.
- **Monsters:** slimes and skeletons roam the outskirts outside the palisade. They chase nearby players, fight back when hit, and give XP when killed. They live in spawn zones (North Meadow, Goldenreach Farms, Mirror Pond, Southern Fields, Whispering Woods, Old Ruins), each with its own monster mix and cap. While a zone is below its cap, its timer brings back one monster every 10-20s. The HUD shows the zone's count and next respawn. They can't enter the square and give up the chase if pulled too far from home.
- Monster stats live in `shared/constants.ts` (`MOBS`); zones and timers in `shared/spawns.ts` (`SPAWN_ZONES`).

## The world: Oakvale

The starting region is a 96×72-tile (16px) medieval map, generated deterministically in `shared/map.ts` so the server
and every client build the same world. It has a ground layer and an object layer (everything on the object layer
and water are solid).

- **Oakvale** — palisade-walled village: market square with well and stalls, Chapel of the Dawn and graveyard,
  The Rusty Tankard tavern, blacksmith, cottages, vegetable garden
- **Goldenreach Farms** (west) — barn, fenced wheat field, hay bales
- **Mirror Pond** (south-west), **North Meadow**, **Millbrook Mill** on **River Ashwell** (east, bridged by the King's Road)
- **Whispering Woods** (far east) with the **Old Ruins** clearing — room for the first mobs

In game, a minimap sits top-right and a banner shows the area name as you walk between regions.

The world is alive (`client/src/ambient.ts`, cosmetic only): trees and bushes are tall sprites that sway in a travelling
wind and hide you when you walk behind them; water ripples and has shoreline foam, the mill wheel turns, grass and
flowers sway, chimneys and the campfire smoke, buildings cast shadows, and butterflies, birds, fireflies, jumping fish
and cloud shadows drift around.

Detail layer (`client/src/details.ts`): shaded roofs with ridges and eaves, pebbles, tufts, mushrooms and fallen
leaves, grass spilling over road edges, rounded shorelines with reeds and lily pads, ducks on Mirror Pond, door
lanterns and gate banners. An 8-minute day/night cycle (shared by all players via the clock) lights up windows,
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
