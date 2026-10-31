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

Controls: WASD/arrows to move, Space to attack, E or Shift for your class skill, Enter to chat.

Gameplay:
- **Classes** (`shared/classes.ts`):
  - **Knight:** most HP, slow, strong sword. Skill *Shield*: blocks 70% damage and knockback for 2s.
  - **Ninja:** fast, low HP, rapid strikes. Skill *Dash*: blink forward, untouchable for a moment.
  - **Wizard:** ranged fireballs. Skill *Nova*: blast everything around you.
- **Levels:** XP from monsters and PvP kills. Each level adds HP and damage and fully heals you.
- **Regen:** HP regenerates after 5s without taking damage, much faster in the Market Square.
- **PvP:** players can fight each other anywhere except the cobbled **Market Square**, which is a safe zone.
- **Monsters:** slimes and skeletons roam the outskirts outside the palisade. They chase nearby players, fight back when hit, and give XP when killed. They respawn after a few seconds. They can't enter the square and give up the chase if pulled too far from home.
- Monster stats live in `shared/constants.ts` (`MOBS`).

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
- Items/loot, NPCs
- Input-sequence reconciliation and area-of-interest filtering for scale
