// Smoke test of the production build: starts server-dist/index.cjs, waits for /health, logs a hero in,
// checks the world state arrives, then stops the server. Run after `npm run build`: node tools/smoke.mjs
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "colyseus.js";

const PORT = 2610, dir = mkdtempSync(path.join(tmpdir(), "smoke-"));
const server = spawn("node", ["server-dist/index.cjs"], {
  env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), SAVE_FILE: path.join(dir, "saves.json"), IDEAS_FILE: path.join(dir, "ideas.json") },
  stdio: "inherit",
});
process.on("unhandledRejection", (e) => fail(String(e?.stack ?? e)));
process.on("uncaughtException", (e) => fail(String(e?.stack ?? e)));
const fail = (msg) => { console.error(`SMOKE FAILED: ${msg}`); server.kill("SIGKILL"); process.exit(1); };
server.on("exit", (code) => { if (code !== null && code !== 0) fail(`server exited with ${code}`); });
setTimeout(() => fail("timed out"), 60_000).unref();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; ; i++) {
  try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) break; } catch { /* not up yet */ }
  if (i > 100) fail("no /health");
  await wait(300);
}
const page = await fetch(`http://localhost:${PORT}/`);
if (!page.ok || !(await page.text()).includes("<html")) fail("client page not served");

const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate("town", { name: "SmokeHero", password: "smokepass1", cls: "vampire", newGame: true });
for (let i = 0; i < 50 && !room.state?.players?.get(room.sessionId); i++) await wait(100);
const me = room.state.players.get(room.sessionId);
if (!me || me.name !== "SmokeHero") fail("hero not in the world state");
// Monsters come in their own "mv" message once the client says it is ready (server/mobView.ts)
let mobs = 0;
room.onMessage("mv", (m) => { mobs += m?.a?.length ?? 0; });
room.send("mvready");
room.send("input", { up: true, down: false, left: false, right: false, seq: 1 });
for (let i = 0; i < 50 && !mobs; i++) await wait(100);
if (!mobs) fail("no monsters received");
await wait(1500); // several patches with monster changes
await room.leave();
console.log(`SMOKE OK: hero at ${Math.round(me.x)},${Math.round(me.y)}, ${mobs} monsters in view`);
server.kill("SIGTERM");
await new Promise((r) => server.once("exit", r));
process.exit(0);
