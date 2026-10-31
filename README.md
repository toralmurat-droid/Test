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
- **Regen:** HP regenerates after 5s without taking damage, much faster on the plaza.
- **PvP:** players can fight each other anywhere except the stone **plaza**, which is a safe zone.
- **Monsters:** slimes and skeletons roam the outskirts. They chase nearby players, fight back when hit, and give XP when killed. They respawn after a few seconds. They can't enter the plaza and give up the chase if pulled too far from home.
- Monster stats live in `shared/constants.ts` (`MOBS`).

## Production

```bash
npm run build
npm start
```

This runs one Node server (default `PORT=2567`) that serves the built client and the game over WebSockets. It deploys to any VPS or to Fly.io/Render behind HTTPS (WSS is picked up automatically).

## Layout

```
shared/   constants.ts, classes.ts (heroes, skills, levels), map.ts (procedural town + collision), movement.ts
server/   index.ts (HTTP + Colyseus), TownRoom.ts (state, tick, combat, chat)
client/   index.html, style.css, src/ (main.ts, TownScene.ts, textures.ts)
```

## Next steps
- Replace the procedural art with real sprites/tilesets (Aseprite, Tiled)
- Accounts and persistence (PostgreSQL)
- Items/loot, NPCs
- Input-sequence reconciliation and area-of-interest filtering for scale
