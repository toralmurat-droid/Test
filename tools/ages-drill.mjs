// Ages drill (docs/ages-setup.md "Drill"): a rehearsal of the production Ages setup on one machine. Run after
// `npm run build`:  npm run ages:drill   (or: node tools/ages-drill.mjs)
// Starts blue (primary) and green (vanguard) on one Postgres and the gateway in front of them, then walks through
// routing, crossing, the account lease and the role handover. One PASS / FAIL line per step; exit 1 on any failure.
// AGES_DRILL_DATABASE_URL (a local scratch database; never DATABASE_URL): used when set; otherwise a throwaway cluster is started (initdb in a temp dir, unix socket, a free
// port; as the user `postgres` through runuser when run as root) and removed on exit.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, chmodSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "colyseus.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PG_BIN = process.env.PG_BIN || "/usr/lib/postgresql/16/bin";
const KEY = "drill-admin-key-123456";
const HERO = { name: "DrillHero", password: "drillpass1", cls: "wizard" };
const VERBOSE = !!process.env.DRILL_VERBOSE;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const children = new Map(); // label -> { proc, log }
let pgDir, pgStop, tmp;
let failed = 0;
const results = [];
const step = (n, name, ok, detail = "") => {
  if (!ok) failed++;
  const line = `${ok ? "PASS" : "FAIL"} ${n}. ${name}${detail ? ` (${detail})` : ""}`;
  results.push(line); console.log(line);
  return ok;
};

function cleanup() {
  for (const { proc } of children.values()) if (proc.exitCode === null) try { proc.kill("SIGKILL"); } catch { /* gone */ }
  children.clear();
  if (pgStop) { try { pgStop(); } catch { /* ignore */ } pgStop = undefined; }
  if (tmp) { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ } tmp = undefined; }
  if (pgDir) { try { rmSync(pgDir, { recursive: true, force: true }); } catch { /* ignore */ } pgDir = undefined; }
}
process.on("exit", cleanup);
for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(s, () => { console.error(`\n${s}: cleaning up`); cleanup(); process.exit(130); });
const die = (msg) => { console.error(`DRILL ABORTED: ${msg}`); for (const [l, c] of children) console.error(`--- last log of ${l}\n${c.log.slice(-15).join("\n")}`); cleanup(); process.exit(1); };
process.on("unhandledRejection", (e) => die(String(e?.stack ?? e)));
process.on("uncaughtException", (e) => die(String(e?.stack ?? e)));
setTimeout(() => die("drill timed out (240 s)"), 240_000).unref();

const freePort = () => new Promise((res, rej) => {
  const s = net.createServer(); s.once("error", rej);
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
});

// --- Postgres ---------------------------------------------------------------------------------------------------
async function databaseUrl() {
  // Never DATABASE_URL (it may be production's: the drill takes leases and writes war/world rows). A drill-only
  // variable, and a local host unless --allow-remote-db.
  const own = process.env.AGES_DRILL_DATABASE_URL;
  if (own) {
    let host = "";
    try { host = new URL(own).hostname; } catch { die("AGES_DRILL_DATABASE_URL is not a URL"); }
    const local = host === "" || host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
    if (!local && !process.argv.includes("--allow-remote-db")) die(`refusing database host ${host}: the drill writes leases, war and world rows. Use a local scratch database, or pass --allow-remote-db for a scratch one elsewhere (never production).`);
    console.log(`Postgres: AGES_DRILL_DATABASE_URL on host ${host || "(unix socket)"}`);
    return own;
  }
  const initdb = path.join(PG_BIN, "initdb");
  if (!existsSync(initdb)) { console.log(`SKIP: no AGES_DRILL_DATABASE_URL and no Postgres binaries in ${PG_BIN} (set AGES_DRILL_DATABASE_URL or PG_BIN)`); process.exit(0); }
  const root = process.getuid?.() === 0;
  let asUser = (cmd, args) => [cmd, args];
  if (root) {
    if (spawnSync("id", ["postgres"]).status !== 0 || spawnSync("which", ["runuser"]).status !== 0) {
      console.log("SKIP: running as root, and there is no `postgres` user (or no runuser) to run Postgres as. Set AGES_DRILL_DATABASE_URL.");
      process.exit(0);
    }
    asUser = (cmd, args) => ["runuser", ["-u", "postgres", "--", cmd, ...args]];
  }
  pgDir = mkdtempSync(path.join(tmpdir(), "ages-drill-pg-"));
  if (root) { spawnSync("chown", ["postgres", pgDir]); chmodSync(pgDir, 0o755); }
  const data = path.join(pgDir, "data"), port = await freePort(), user = root ? "postgres" : (process.env.USER || "postgres");
  const run = (cmd, args) => { const [c, a] = asUser(cmd, args); return spawnSync(c, a, { encoding: "utf8" }); };
  let r = run(initdb, ["-D", data, "-U", user, "--auth=trust", "-E", "UTF8", "--no-sync"]);
  if (r.status !== 0) die(`initdb failed: ${r.stderr || r.stdout}`);
  const opts = `-c listen_addresses='' -c unix_socket_directories='${pgDir}' -c port=${port} -c fsync=off -c max_connections=60`;
  r = run(path.join(PG_BIN, "pg_ctl"), ["-D", data, "-l", path.join(pgDir, "pg.log"), "-o", opts, "-w", "-t", "30", "start"]);
  if (r.status !== 0) die(`pg_ctl start failed: ${r.stderr || r.stdout}`);
  pgStop = () => run(path.join(PG_BIN, "pg_ctl"), ["-D", data, "-m", "immediate", "stop"]);
  r = run(path.join(PG_BIN, "createdb"), ["-h", pgDir, "-p", String(port), "-U", user, "ages_drill"]);
  if (r.status !== 0) die(`createdb failed: ${r.stderr || r.stdout}`);
  console.log(`Postgres: throwaway cluster in ${pgDir} (socket, port ${port})`);
  return `postgres://${user}@localhost/ages_drill?host=${encodeURIComponent(pgDir)}&port=${port}`;
}

// --- Processes --------------------------------------------------------------------------------------------------
function start(label, env) {
  const log = [];
  const proc = spawn("node", ["server-dist/start.cjs"], { cwd: ROOT, env: { ...process.env, NODE_ENV: "production", ...env }, stdio: ["ignore", "pipe", "pipe"] });
  const take = (d) => { for (const l of String(d).split("\n")) if (l.trim()) { log.push(l); if (log.length > 200) log.shift(); if (VERBOSE) console.log(`[${label}] ${l}`); } };
  proc.stdout.on("data", take); proc.stderr.on("data", take);
  proc.on("exit", (code, sig) => { if (children.get(label)?.proc === proc && !stopping.has(label)) die(`${label} exited by itself (${code ?? sig})`); });
  children.set(label, { proc, log });
  return proc;
}
const stopping = new Set();
async function stop(label) {
  const c = children.get(label);
  if (!c || c.proc.exitCode !== null) return;
  stopping.add(label);
  c.proc.kill("SIGTERM");
  await Promise.race([new Promise((r) => c.proc.once("exit", r)), wait(15_000).then(() => c.proc.kill("SIGKILL"))]);
  children.delete(label); stopping.delete(label);
}
async function until(what, fn, ms = 40_000, every = 300) {
  const t0 = Date.now();
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch { /* retry */ }
    if (Date.now() - t0 > ms) die(`timed out waiting for ${what}`);
    await wait(every);
  }
}
const get = async (url, headers = {}) => { const r = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(5000) }); return { status: r.status, text: await r.text() }; };
const getJson = async (url) => { const r = await get(url); return { status: r.status, json: r.status === 200 ? JSON.parse(r.text) : undefined }; };

// --- Hero over Colyseus -----------------------------------------------------------------------------------------
/** Logs the hero in through the gateway as a browser with cookie ptb_age=<slot>. Rejects with the server's message. */
async function login(gw, slot, newGame = false) {
  const client = new Client(`ws://127.0.0.1:${gw}`, { headers: { cookie: `ptb_age=${slot}` } });
  const room = await client.joinOrCreate("town", { ...HERO, newGame });
  const chat = [], closed = {};
  room.onMessage("chat", (m) => chat.push(m));
  room.onMessage("*", () => {});
  room.onMessage("mvready", () => {});
  room.onLeave((code) => { closed.code = code; });
  const seen = {}; // messages by type, so a test can see "cross"
  room.onMessage("cross", (m) => { seen.cross = m; });
  room.onMessage("ages", (m) => { seen.ages = m; });
  for (let i = 0; i < 50 && !room.state?.players?.get(room.sessionId); i++) await wait(100);
  const me = room.state.players.get(room.sessionId);
  if (!me) throw new Error("hero not in the world state");
  return { room, me, chat, closed, seen };
}

// ===================================================================================================================
if (!existsSync(path.join(ROOT, "server-dist/start.cjs"))) {
  console.log("server-dist/start.cjs missing: running npm run build");
  const b = spawnSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit" });
  if (b.status !== 0) die("build failed");
}
const dbUrl = await databaseUrl();
const [pBlue, pGreen, pGw] = [await freePort(), await freePort(), await freePort()];
tmp = mkdtempSync(path.join(tmpdir(), "ages-drill-"));
const dirs = { blue: path.join(tmp, "blue"), green: path.join(tmp, "green") };
const gatewayUrl = `http://127.0.0.1:${pGw}`;
const gameEnv = (slot, role, port) => {
  const dir = dirs[slot];
  return {
    DATABASE_URL: dbUrl, AGE_SLOT: slot, AGE_ROLE: role, ACCOUNT_LEASES: "1", PORT: String(port), ADMIN_KEY: KEY,
    GATEWAY_URL: gatewayUrl, SAVE_FILE: path.join(dir, "saves.json"), IDEAS_FILE: path.join(dir, "ideas.json"),
    TRUST_PROXY: "1", GATEWAY_TARGETS: "",
  };
};
for (const d of Object.values(dirs)) { rmSync(d, { recursive: true, force: true }); spawnSync("mkdir", ["-p", d]); }
const adminJson = (port) => getJson(`http://127.0.0.1:${port}/admin/ages.json?key=${KEY}`);
const gwStatus = () => getJson(`${gatewayUrl}/gateway/status?key=${KEY}`);

try {
  // 1-2. Start blue, green, gateway
  start("blue", gameEnv("blue", "primary", pBlue));
  start("green", gameEnv("green", "vanguard", pGreen));
  await until("blue /health", async () => (await get(`http://127.0.0.1:${pBlue}/health`)).status === 200, 60_000);
  await until("green /health", async () => (await get(`http://127.0.0.1:${pGreen}/health`)).status === 200, 60_000);
  start("gateway", {
    GATEWAY_TARGETS: `blue=http://127.0.0.1:${pBlue},green=http://127.0.0.1:${pGreen}`, AGE_SPLIT: "blue=50,green=50",
    GATEWAY_PRIMARY: "blue", ADMIN_KEY: KEY, PORT: String(pGw),
  });
  await until("gateway /gateway/health", async () => (await get(`${gatewayUrl}/gateway/health`)).status === 200, 20_000);
  step(1, "blue (primary), green (vanguard) and the gateway start on one Postgres", true, `ports ${pBlue} / ${pGreen} / gateway ${pGw}`);

  // 3. Gateway checks
  const gh = await get(`${gatewayUrl}/gateway/health`);
  step(2, "/gateway/health answers ok", gh.status === 200 && gh.text === "ok", `${gh.status} ${gh.text}`);

  // blue takes its leases within a few seconds of boot
  const owned = await until("blue to own war, world and forge", async () => {
    const s = await gwStatus(); const b = s.json?.backends?.find((x) => x.slot === "blue");
    return b?.ages?.leases?.length === 3 ? s.json : null;
  }, 40_000, 1000).catch(() => null);
  const st = (await gwStatus()).json;
  const sb = st?.backends?.find((b) => b.slot === "blue"), sg = st?.backends?.find((b) => b.slot === "green");
  const leases = (x) => [...(x?.ages?.leases ?? [])].sort().join(",");
  step(3, "/gateway/status: both Ages up, blue owns war, world and forge, green follows",
    !!owned && sb?.ok && sg?.ok && leases(sb) === "lease:forge,lease:war,lease:world" && leases(sg) === "" &&
    sb.ages.roles.war === "owner" && sb.ages.roles.world === "owner" && sb.ages.roles.forge === "owner" &&
    sg.ages.roles.war === "follower" && sg.ages.roles.world === "follower" && sg.ages.roles.forge === "follower" &&
    sb.ages.accounts.shared === true && sg.ages.accounts.shared === true,
    `blue ${sb?.ok ? "up" : "down"} [${leases(sb)}], green ${sg?.ok ? "up" : "down"} [${leases(sg)}]`);

  const wrongKey = await get(`${gatewayUrl}/gateway/status?key=nope`);
  const agRaw = await get(`${gatewayUrl}/gateway/ages`), ag = { status: agRaw.status, text: agRaw.text, json: agRaw.status === 200 ? JSON.parse(agRaw.text) : undefined };
  const slots = (ag.json?.ages ?? []).map((a) => `${a.slot}:${a.up ? "up" : "down"}`).sort().join(",");
  step(4, "/gateway/ages lists both Ages as up, with no addresses",
    ag.status === 200 && slots === "blue:up,green:up" && !/127\.0\.0\.1|http:|localhost/.test(ag.text) && wrongKey.status === 404, `${slots}; wrong key ${wrongKey.status}`);

  // 4. Hero on blue, move, cross
  let h = await login(pGw, "blue", true);
  const onBlue = await until("hero on blue", async () => (await adminJson(pBlue)).json?.online?.players >= 1);
  for (let i = 0; i < 12; i++) { h.room.send("input", { up: false, down: false, left: false, right: true, seq: i + 1 }); await wait(50); }
  h.room.send("input", { up: false, down: false, left: false, right: false, seq: 99 });
  await wait(1200); // the hero stops, and a cross must not happen in "combat" (we never attack)
  const spot = { x: h.me.x, y: h.me.y };
  h.room.send("cross", { slot: "green" });
  await until("the cross message and close", async () => h.seen.cross && h.closed.code !== undefined, 15_000);
  step(5, "hero joins blue through the gateway, moves, crosses: 'cross' message and close code 4410",
    !!onBlue && h.seen.cross?.slot === "green" && h.closed.code === 4410,
    `spot ${Math.round(spot.x)},${Math.round(spot.y)}; cross ${JSON.stringify(h.seen.cross)}, close ${h.closed.code}${h.chat.length ? `; chat: ${h.chat.map((c) => c.text).join(" | ")}` : ""}`);

  // 5. Same hero on green
  await wait(500);
  let g;
  try { g = await login(pGw, "green"); } catch (e) { g = undefined; step(6, "hero logs in on green", false, e?.message ?? String(e)); }
  if (g) {
    const dx = Math.abs(g.me.x - spot.x), dy = Math.abs(g.me.y - spot.y);
    step(6, "hero lands on green at the same spot (within a tile)", dx <= 32 && dy <= 32, `blue ${Math.round(spot.x)},${Math.round(spot.y)} -> green ${Math.round(g.me.x)},${Math.round(g.me.y)}`);
    await wait(300);
    g.room.send("cross", { slot: "blue" });
    await until("the cooldown line", async () => g.chat.some((c) => c.name === "Ages"), 10_000).catch(() => {});
    const line = g.chat.find((c) => c.name === "Ages");
    step(7, "a second crossing within the cooldown is refused (Ages chat line)", !g.seen.cross && g.closed.code === undefined && /cross again/i.test(line?.text ?? ""), line?.text ?? "no Ages line");

    // 6. Account lease: green holds it, try blue
    let refusal = "";
    try { const x = await login(pGw, "blue"); refusal = "joined"; await x.room.leave(); } catch (e) { refusal = e?.message ?? String(e); }
    step(8, "while the hero plays on green, opening it on blue is refused ('playing on another server')", /playing on another server/i.test(refusal), refusal);
    await g.room.leave();
  } else { step(7, "cooldown refusal", false, "skipped: no hero on green"); step(8, "account lease refusal", false, "skipped: no hero on green"); }

  // 7. Role handover: blue -> draining, green -> primary
  await wait(1500);
  await stop("blue"); await stop("green");
  start("blue", gameEnv("blue", "draining", pBlue));
  start("green", gameEnv("green", "primary", pGreen));
  const t0 = Date.now();
  const got = await until("green to own all three leases", async () => {
    const a = await adminJson(pGreen);
    return a.json?.leases?.length === 3 ? a.json : null;
  }, 40_000, 500).catch(() => null);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const bAfter = await until("blue (draining) to answer", async () => (await adminJson(pBlue)).json, 40_000);
  step(9, "role handover: after restarting blue as draining and green as primary, green owns war, world and forge (within ~20 s)",
    !!got && (Date.now() - t0) <= 25_000 && got.role === "primary" && got.roles.war === "owner" && got.roles.world === "owner" && got.roles.forge === "owner" && (bAfter?.leases?.length ?? 0) === 0,
    `${secs} s after restart; green [${(got?.leases ?? []).join(",")}], blue [${(bAfter?.leases ?? []).join(",")}] role ${bAfter?.role}`);
} catch (e) {
  step("!", "unexpected error", false, e?.stack ?? String(e));
}

console.log(`\n${failed ? "AGES DRILL FAILED" : "AGES DRILL PASSED"}: ${results.length - failed}/${results.length} steps`);
if (failed) for (const [l, c] of children) console.log(`--- last log of ${l}\n${c.log.slice(-12).join("\n")}`);
cleanup();
process.exit(failed ? 1 : 0);
