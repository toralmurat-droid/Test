# Pixel Brawl

A top-down 2D pixel-art brawler for the browser: Knight vs Ninja vs Wizard.

Open `game/index.html` in a browser to play. No build step.

- **1 player:** you against two CPU fighters. **2 players:** share one keyboard, and the third character is CPU.
- **P1:** WASD to move, F to attack, G for special. **P2:** arrow keys to move, K to attack, L for special.
- Esc pauses, M mutes sound. On phones, touch controls appear.
- First to 3 round wins takes the match. Health potions spawn during rounds.

## Art
All sprites are 32×32 pixel art, drawn in code (`drawKnight`, `drawNinja`, `drawWizard` in `index.html`).
Each character has 10 frames: idle ×2, walk ×4, attack ×3, hurt ×1.
PNG sprite sheets are in `game/sprites/` (1× and 4×). Regenerate them with:

    node tools/export-sprites.js
