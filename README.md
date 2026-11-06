# Pixel Town Brawl

A browser-based online multiplayer pixel brawler set in a small town.

- **Client:** Phaser 3 + TypeScript (Vite)
- **Server:** Colyseus 0.15 (Node.js). The server is authoritative: it runs movement, combat and respawns.
- **Shared:** map, movement and constants used by both sides (`shared/`)

## Put it online

See [DEPLOY.md](DEPLOY.md): Railway + the `Dockerfile`, with a volume at `/app/data` for player saves and auto-deploy on every merge.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173 in two browser tabs to see the multiplayer. The game server runs on port 2567.

To keep a local game on the latest merged version, run `npm run live` instead of `npm run dev`: it checks GitHub every minute,
fast-forwards when the branch has new commits (running `npm install` if dependencies changed) and restarts the game.
It skips an update rather than overwrite local commits or edits.

Controls: WASD/arrows to move, Space to attack, 1 for your class skill, 2 for your ultimate (top row or numpad, once learned in the skill tree), Shift or F to dodge roll, Q to drink a potion, C for the hero menu, T for the skill tree, Enter to chat. Under the HP bar is your **Stamina** bar (**Magic** for the Wizard): skills cost 30, the dodge roll 20 and the ultimate 50; it refills by itself (14/s) and basic attacks are free. The action list under it shows every action with its key and cooldown.

Gameplay:
- **Classes** (`shared/classes.ts`):
  - **Knight:** most HP, slow, strong sword. Skill *Shield*: blocks 70% damage and knockback for 2s.
  - **Ninja:** fast, low HP, rapid strikes. Skill *Dash*: blink forward, untouchable for a moment.
  - **Wizard:** ranged fireballs. Skill *Nova*: blast everything around you.
  - **Archer:** long-range arrows. Skill *Volley*: 3 arrows side by side. Ultimate *Arrow Rain*.
  - **Barbarian:** axe brawler. Skill *Rage*: +30% damage and +20% speed for 5s. Ultimate *Leap*.
- **Combos:** the basic attack alternates two hits. With the **3-Hit Combo** skill (skill tree, Lv 1) a 3rd hit in a row (press attack again within 0.7s) is a finisher: Knight wide slam, Ninja lunge, Wizard big fireball, Archer power shot, Barbarian axe smash. Tuned in `combo` in `shared/classes.ts`.
- **Attack variety:** normal hits pick 1 of 4 attack moves at random (never the same twice in a row).
- **Dodge roll** (F): every hero rolls 48px in the move direction (or facing), untouchable for 0.3s, 1.5s cooldown. Tuned in `DODGE` in `shared/classes.ts`.
- **8-way aim**: attacks, arrows, fireballs, dashes and ultimates go in the last direction you moved, diagonals included (`Player.ax/ay`, `Projectile.vx/vy`).
- **Initiative & attack speed** (`shared/combat.ts`): every hero and monster has a hidden poise bar. Hits drain it, less against higher-level opponents (-15% per level above you, min 20%) and more against lower ones (+10% per level, max +50%), and make the target flinch (a monster's wind-up telegraph, a red flash, is interrupted; heroes' next attack is delayed slightly). Below half poise you attack slower; at 0 you are dizzy (stars): no attacks or skills for 1.2s (monsters 1.8s, and they run away). Then poise refills and you are steady for 1.5s. Shield blocks most poise damage; Unstoppable ignores it. Rage gives +15% attack speed. Hero panel shows attack speed and initiative.
- **Player ideas** (`shared/ideas.ts`, press **I** or the 💡 Ideas button): players at level 3+ suggest one improvement a day (max 280 characters, 10 ideas a day for the whole game). Everyone votes with ▲/▼ (or `/up 12`, `/down 12` in chat; `/idea text` suggests from chat). Every hour, on the hour, the open idea with the best score wins if it has at least 5 voters and +3. Ideas at -5 are removed and ideas expire after 24h. The log is saved in `data/ideas.json` (or `IDEAS_FILE`) and readable at `/ideas.json`. Winners are built by hand for now. `IDEAS_ANY_LEVEL=1` lets fresh heroes suggest (for local testing). Rules are checked by `npx tsx tools/ideas-check.ts`.
- **Emotes:** type /wave /cheer /laugh /sit /sleep in chat. Heroes also fidget when standing still.
- **Levels, stats and powers** (`shared/powers.ts`): XP raises your level (max 20). You assign stat points yourself in the hero panel (**C**, click +): 1 point per level and 3 at levels 3, 5, 8 and 10 (27 by level 20). **Stamina** = max HP (+12) and HP regen, **Strength** = attack for Knight/Ninja/Archer/Barbarian (+7%) and +4 HP, **Magic** = skills (+7%), cooldowns (-2%, max -30%) and Wizard fireballs. Every level also adds 5 max HP. Reset is out of combat, free up to level 5, then 15 gold per level (`shared/upkeep.ts`). Class skills are learned in the skill tree (see below). Press **C** for the hero panel (characteristics only). On level-up a small notice appears; press C (or click it) to see the new stats.
- **Skills** (`shared/talents.ts` + `shared/powers.ts`, press **T**): heroes start with only a basic attack. Every level after 1 gives 1 skill point. One tree per hero holds the class skills (an active skill at level 1, passives at 3/5/8, the active ultimate at level 10), the **3-Hit Combo** skill and 3 branches of passive bonuses (e.g. Knight: Blade, Bulwark, Command; 3 ranks each). Rows unlock at levels 1, 3, 5, 8 and 10 and a node needs the one below it: the tree grows up from the hero (trunk at the bottom, ultimate at the top), with branch lines that light up as you learn skills. Effects: damage, skill damage, crit, lifesteal, max HP, armour, speed, cooldowns, regen. Reset is out of combat, free up to level 5, then 15 gold per level (it also empties the skill slots).
- **Skill slots** (`shared/slots.ts`): keys **1** to **0** (bar at the bottom). They start empty: click a slot to open a list of your skills (pixel icons from `client/src/skillIcons.ts`) and pick one, or scroll the mouse wheel over a slot, or hover a skill in the tree and press a number key. Right-click a slot to clear it. The Hero, Skills and Bag buttons (bottom right) open the menus at any time; Esc closes them.
  - Knight: Shield, Iron Skin, Cleave, Second Wind, Earthquake (stun)
  - Ninja: Dash, Swift Feet, Critical Strike, Shadow Strike, Blade Storm
  - Wizard: Nova, Mana Flow, Ignite, Frost Nova (slow), Meteor
- **Gear wear and repairs** (`shared/upkeep.ts`): each death wears your gear 10% (worn gear gives up to 50% less of its stats). Brann the smith repairs it all for gold (15% of the equipped gear's shop price for a full repair). The hero panel shows the condition.
- **Loot** (`shared/items.ts`): monsters drop gold and health potions; walk over them to pick up (gold is scooped up from about 2 tiles away, `GOLD_PICKUP_RADIUS`). Potions (max 5) heal 40% HP. Killed by a player? You drop half your gold.
- **Bounty boards** (`shared/bounty.ts`, `client/src/bounty.ts`): a board on the Market Square and one beside every portal stone. Press E at a board to pick one of 3 hunts for your level ("Hunt 8 Skeletons", one per zone, one at a time). Monsters of the shown level or higher count anywhere; the reward (XP = 40% of a level, plus gold) is paid the moment the last kill lands.
- **Regen:** HP regen comes from your **Stamina** stat: 0.1 HP/s per point in a fight, ramping up to 0.5 HP/s per point after 3s without damage, 3x on the Market Square (Knight Lv1: 1 → 5 HP/s). Gear and levels that add Stamina speed it up; the hero panel (C) shows your rate. The HP bar shows current / max HP.
- **PvP:** players can fight each other anywhere except the cobbled **Market Square**, which is a safe zone. **Newcomer protection:** heroes up to level 10 can't hurt other heroes or be hurt by them (`PVP_PROTECT_LEVEL` in `shared/combat.ts`); monsters and the village watch still can.
- **Monsters:** slimes and skeletons roam the outskirts outside the palisade. They chase nearby players, fight back when hit, and give XP when killed. They live in spawn zones (North Meadow, Goldenreach Farms, Mirror Pond, Southern Fields, Whispering Woods, Old Ruins), each with its own monster mix and cap. While a zone is below its cap, its timer brings back one monster every 10-20s. The HUD shows how many monsters are alive in the zone. Killing a zone's last monster shows a big "<zone> cleared!" banner to that player and a line in everyone's feed. They can't enter the square and give up the chase if pulled too far from home.
- Monster stats live in `shared/constants.ts` (`MOBS`); zones and timers in `shared/spawns.ts` (`SPAWN_ZONES`).

## The world: Oakvale

The starting region is a 288×216-tile medieval map with 32px tiles drawn at the same pixel size as the heroes, generated deterministically in `shared/map.ts` so the server
and every client build the same world. It has a ground layer and an object layer (objects and water are solid, except
bushes, which you can walk through).

It is laid out like a starting village: four narrow (1-tile) roads leave Oakvale, one to each nearby place (the farms to the
west, the Old Ruins over the bridge to the east, the North Meadow, and Stonecrag Quarry to the south). Footpaths branch
off to the Hunter's Camp, the Watchtower, the mill and Mirror Pond and the marsh. Generation also guarantees that every walkable tile can be reached.
`npx tsx tools/map-metrics.ts` prints walkability, reachability and detour numbers.

- **Oakvale** (centre) — a small stockade with outward-facing pikes, a great bonfire in the middle of Market Square
  (safe zone), and four small walk-in ruins in its corners (Chapel of the Dawn, The Rusty Tankard, the Smithy, a cottage)
- **Goldenreach Farms** (west), **Hunter's Camp** (north-west woods), **North Meadow** (north)
- **Mirror Pond** and **Misty Marsh** (south-west, with a boardwalk), **Stonecrag Quarry** (south-east)
- **Millbrook Mill** on **River Ashwell** (east), then **Whispering Woods** with trails, the **Old Ruins** and the
  **Old Watchtower**
- The wider world, with tougher monsters: **Barrow Downs** (far south-west graveyard and mausoleum), **Sunken Lake**
  (south, island shrine on a boardwalk), **Greywatch Keep** (ruined castle far east) and the **Thornwood** (dark pines,
  north-east)
- Further out: **Redfang Hollow** (bandit camp behind a crude stockade, deep in the eastern woods), **Saltmere** (small
  fishing village with two piers on the southern sea) and the **Saltwind Coast** (beaches along the Saltwind Sea)

Monster levels grow with distance from Oakvale (`zoneLevels` in `shared/spawns.ts`): level 1-3 next to the village,
up to 10-12 at the far edges. Signposts at the gates and junctions have one board per road, naming where it leads.

Each area in `AREAS` can list the monsters that belong there (`mobs`), and `randomPointInArea(name)` returns a free
spot inside an area, for per-zone spawns.

In game, a round minimap sits top-right inside a day/night dial (the sun and moon turn around it with the 30-minute day), and a bold pixel-font banner shows the area name as you walk between regions.

The world is alive (`client/src/ambient.ts`, cosmetic only): trees and bushes are tall sprites that sway in a travelling
wind and hide you when you walk behind them; water ripples and has shoreline foam, the mill wheel turns, grass and
flowers sway, chimneys and the campfire smoke, buildings cast shadows, and butterflies, birds, fireflies, jumping fish
and cloud shadows drift around.

Tile art (`client/src/tileset.ts`) is procedural: shapes are laid out on a 16-unit design grid and painted at full
32px resolution (smooth curves, fine grass, cobbles, sand and water). Static ground detail is baked in chunks around
the camera, so the larger map costs little video memory.

Detail layer (`client/src/details.ts`): shaded roofs with ridges and eaves, pebbles, tufts, mushrooms and fallen
leaves, grass spilling over road edges, rounded shorelines with reeds and lily pads, ducks on Mirror Pond, door
lanterns and gate banners. A 30-minute day/night cycle (shared by all players via the clock) lights up windows,
lanterns and the campfire at night. Add `?time=day|dusk|night` to the URL to force a time of day.

**Isometric view:** the game is drawn in isometric by default. Add `?iso=0` to the URL for the old top-down view
(`?iso=1` goes back; the choice is remembered). Only the drawing changes: the server, the map data and the movement rules stay top-down, see
`client/src/iso.ts`. W/up moves up the screen. Houses (walls, pitched roof, chimney) and ruin walls are built in
`client/src/isobuild.ts`; a house turns see-through when your hero walks behind it. `?zoom=1.5` zooms the camera out
(viewing aid, like `?look=tx,ty`).

**Map viewer:** with `npm run dev` running, open http://localhost:5173/map.html to see the whole map with area,
collision and grid overlays (no server needed). Edit `shared/map.ts` and it hot-reloads.

## Accounts and saves

Players log in with a name and password. A new name creates the account. Each account keeps one saved hero per class (level, XP, stat points, skill tree, hotbar, gear, bag, gold, potions, quest). Saves are written by the server to `data/saves.json` (change with `SAVE_FILE=...`) on leave, every 30 seconds, and on shutdown. Passwords are stored hashed (scrypt). Back up that file to keep player progress; it is not in git. Testing: any player can type `/max` in chat to jump to the max level (30) with every skill at max rank and all stat points placed.

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
