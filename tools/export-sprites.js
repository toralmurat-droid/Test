// Renders the game's sprites to PNG sprite sheets in game/sprites/.
// Usage: node tools/export-sprites.js   (needs Playwright + Chromium)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.join(root, 'game', 'index.html'));
  await page.waitForFunction(() => window.PixelBrawl);
  const out = path.join(root, 'game', 'sprites');
  fs.mkdirSync(out, { recursive: true });
  const types = await page.evaluate(() => window.PixelBrawl.types);
  for (const t of types) {
    for (const scale of [1, 4]) {
      const url = await page.evaluate(([t, s]) => window.PixelBrawl.sheet(t, s), [t, scale]);
      const file = path.join(out, `${t}${scale > 1 ? '@' + scale + 'x' : ''}.png`);
      fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
      console.log('wrote', path.relative(root, file));
    }
  }
  await browser.close();
})();
