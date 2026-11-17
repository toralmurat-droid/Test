import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import zlib from "node:zlib";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { TownRoom, announceUpgrade, onlineNow } from "./TownRoom";
import { mountAgesStatus } from "./agesStatus";
import { ageInfo } from "./ageCross";
import { AGE_INFO_PATH } from "../shared/ageCross";
import { flushIdeas, ideaLog, initIdeas, publicLog } from "./ideaStore";
import { backupAccounts, flushFinal, initAccounts, peek, releaseAccounts, requestReset, resetPassword, setEmail } from "./accounts";
import { useHandoffKv, writeHandoff } from "./handoff";
import { sharedStateOn } from "./ageQueue";
import { flushWorldFinal, initWorld } from "./worldStore";
import { clientIp } from "./ratelimit";
import { flushWar, startWar, warLog, warNow } from "./war";
import { councilAdmin, killCouncils, mountCouncilRoutes } from "./warCouncil";
import { flushForge, initForge, mountForgeAdmin } from "./forge";
import { openKv } from "./store";

const PORT = Number(process.env.PORT ?? 2567);
const app = express();

// In production, serve the built client from the same server
if (process.env.NODE_ENV === "production") {
  const dist = path.resolve(__dirname, "../dist");
  // Text files (the 2 MB game script, styles, data) go out gzipped: about 4x smaller, so the game loads faster.
  // Compressed once per file and kept in memory (the built files never change while the server runs).
  const gz = new Map<string, Promise<Buffer | null>>();
  const squeeze = (file: string) => {
    let p = gz.get(file);
    if (!p) {
      p = fs.promises.readFile(file)
        .then((raw) => new Promise<Buffer | null>((ok) => zlib.gzip(raw, { level: 9 }, (err, out) => ok(err ? null : out))))
        .catch(() => null);
      gz.set(file, p);
    }
    return p;
  };
  const TEXT = /\.(js|css|html|json|svg|txt)$/;
  // After a deploy every player reloads at once: squeeze the files right at start (in the background), not on
  // the first request, so returning players are not kept waiting
  const warm = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, ent.name);
      if (ent.isDirectory()) warm(file);
      else if (TEXT.test(ent.name)) void squeeze(file);
    }
  };
  setImmediate(() => { try { warm(dist); } catch { /* no build yet */ } });
  app.use(async (req, res, next) => {
    if (req.method !== "GET" || !/\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) return next();
    const rel = req.path === "/" ? "/index.html" : req.path;
    if (!TEXT.test(rel)) return next();
    const file = path.join(dist, path.normalize(rel));
    if (!file.startsWith(dist + path.sep)) return next();
    const body = await squeeze(file);
    if (!body) return next();
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Vary", "Accept-Encoding");
    res.type(path.extname(file));
    // Vite's hashed files (assets/name-HASH.js) never change: let the browser keep them
    if (/\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.\w+$/.test(rel)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    else res.setHeader("Cache-Control", "no-cache");
    res.end(body);
  });
  // The game wiki (client/wiki.html) and its skills page (client/skills.html): short addresses, like play.fmtpa.ch/skills
  app.get("/wiki", (_req, res) => res.sendFile(path.join(dist, "wiki.html")));
  app.get("/skills", (_req, res) => res.sendFile(path.join(dist, "skills.html")));
  app.get("/roadmap", (_req, res) => res.sendFile(path.join(dist, "roadmap.html")));
  app.use(express.static(dist, {
    setHeaders: (res, file) => { if (/[\\/]assets[\\/][^\\/]+-[A-Za-z0-9_-]{8}\.\w+$/.test(file)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); },
  }));
}
// Which build is running: a new deploy gets a new id, so a player who lost the connection can tell that an
// update arrived (and show the "update" notice instead of "connection lost"). Railway sets RAILWAY_DEPLOYMENT_ID.
const BUILD = process.env.RAILWAY_DEPLOYMENT_ID || process.env.RAILWAY_GIT_COMMIT_SHA || `start-${Date.now()}`;
app.get("/health", (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); // dev: the client runs on another port
  res.setHeader("Access-Control-Expose-Headers", "X-Build");
  res.setHeader("X-Build", BUILD);
  res.setHeader("Cache-Control", "no-store");
  res.send("ok");
});
// The clan war for the wiki and tools: who holds what, sieges, and the latest events (read-only)
app.get("/war.json", (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  res.json({ war: warNow() ?? null, log: warLog(50) });
});
// Ages (server/ageCross.ts): this server's slot, build, account version and classes, for the gateway's list of open Ages
app.get(AGE_INFO_PATH, (_req, res) => { res.setHeader("Cache-Control", "no-store"); res.json(ageInfo(BUILD)); });
// The player idea log (read-only), newest first
app.get("/ideas.json", (_req, res) => { res.json(publicLog()); });

// Backup download of every account and the idea log: /admin/backup?key=ADMIN_KEY
// Off unless the ADMIN_KEY environment variable is set (Railway: service -> Variables).
const adminOk = (req: express.Request) => {
  const want = Buffer.from(process.env.ADMIN_KEY ?? "");
  const got = Buffer.from(String(req.query.key ?? ""));
  return want.length >= 12 && got.length === want.length && crypto.timingSafeEqual(got, want);
};
app.get("/admin/backup", async (req, res) => {
  if (!adminOk(req)) { res.sendStatus(404); return; }
  // (with account leases on, memory holds only some accounts: the backup reads the table, server/accounts.ts)
  let saves;
  try { saves = await backupAccounts(); } catch (e: any) { res.status(500).send(String(e?.message ?? e)); return; }
  const day = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Disposition", `attachment; filename="game-backup-${day}.json"`);
  res.setHeader("Cache-Control", "no-store");
  res.json({ at: new Date().toISOString(), saves, ideas: ideaLog });
});

// War Councils (M3, server/warCouncil.ts): the daily digests and the council log; the kill switch (?kill=1 / ?kill=0)
app.get("/admin/war-digest", (req, res) => {
  if (!adminOk(req)) { res.sendStatus(404); return; }
  res.setHeader("Cache-Control", "no-store");
  res.json(councilAdmin());
});
app.post("/admin/war-council", (req, res) => {
  if (!adminOk(req)) { res.sendStatus(404); return; }
  if (req.query.kill === "1" || req.query.kill === "0") killCouncils(req.query.kill === "1");
  res.setHeader("Cache-Control", "no-store");
  res.json(councilAdmin(0));
});
// The Forge (M4, server/forge.ts): GET /admin/forge (registry, research, log), POST ?kill=1|0&retire=<id>&revoke=<id>
mountForgeAdmin(app, adminOk);
// Ages (M5, server/agesStatus.ts): this server's slot, roles, leases, account counters and flush lag
mountAgesStatus(app, adminOk, BUILD, onlineNow);
// The remote councils (scheduled Claude routines): briefings and orders, behind WAR_COUNCIL_TOKEN (off when unset)
mountCouncilRoutes(app);

// Login screen: which saved heroes does this account have? (lets the player pick Continue or New game)
app.use("/account", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); // dev: the client runs on another port
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});
app.post("/account", express.json({ limit: "2kb" }), async (req, res) => {
  try { res.json(await peek(req.body?.name, req.body?.password, clientIp(req))); }
  catch (e: any) { res.status(401).json({ error: String(e?.message ?? e) }); }
});
// Optional email on the account (needs the password), and password reset by an emailed code
app.post("/account/email", express.json({ limit: "2kb" }), async (req, res) => {
  try { res.json({ email: await setEmail(req.body?.name, req.body?.password, req.body?.email, clientIp(req)) }); }
  catch (e: any) { res.status(400).json({ error: String(e?.message ?? e) }); }
});
app.post("/account/forgot", express.json({ limit: "2kb" }), async (req, res) => {
  try { res.json(await requestReset(req.body?.who, clientIp(req))); }
  catch (e: any) { res.status(400).json({ error: String(e?.message ?? e) }); }
});
app.post("/account/reset", express.json({ limit: "2kb" }), async (req, res) => {
  try { res.json({ name: await resetPassword(req.body?.name, req.body?.code, req.body?.password, clientIp(req)) }); }
  catch (e: any) { res.status(400).json({ error: String(e?.message ?? e) }); }
});

const httpServer = http.createServer(app);
// perMessageDeflate: the browser and server squeeze every update (~35% fewer bytes, all browsers support it).
// Level 1 is the fastest setting; tiny messages (inputs, chat) are sent as they are. WS_DEFLATE=0 turns it off.
const deflate = process.env.WS_DEFLATE !== "0" && { threshold: 256, zlibDeflateOptions: { level: 1 } };
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer, perMessageDeflate: deflate }) });
gameServer.define("town", TownRoom);
// A deploy stops this server with SIGTERM. Colyseus then saves everyone and closes each connection with code 4000.
// First tell every player an update is coming (they see the update notice, not "connection lost"). Updates are
// compressed (perMessageDeflate), which happens in the background: without the short waits the process exited
// before the message and the clean close were sent, so players only saw the connection drop.
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
gameServer.onBeforeShutdown(async () => { announceUpgrade(); await wait(400); });
// The rooms are gone by now (everyone saved and remembered where they stood): hand those spots to the next server
// The war's and the Forge's last writes and their leases handed on (Ages: server/war.ts flushWar, server/forge.ts
// flushForge) run alongside, given at most 5 s together.
// With account leases on (server/accountGuard.ts), the accounts' leases go back after their last write (at most 5 s).
gameServer.onShutdown(async () => {
  const handoff = writeHandoff(), ideas = flushIdeas().catch((e) => console.error("Ideas: last write failed:", e));
  const war = flushWar(), forge = flushForge();
  await flushFinal(); await Promise.race([releaseAccounts(), wait(5_000)]); await flushWorldFinal();
  await Promise.all([wait(800), Promise.race([Promise.all([war, forge, handoff, ideas]), wait(5_000)])]);
});

// Accounts first (Postgres when DATABASE_URL is set): players must never join before their saves are loaded.
// The world state (the Gloam Tide's meter, server/worldStore.ts) loads with them; the clan war (server/war.ts, its
// own kv table / data/war.json) starts after both, before the server listens. The Forge's registry (server/forge.ts, its
// own key in the same store) loads after the war and before the server listens: forged items in saves need it.
Promise.all([initAccounts(), initWorld()])
  .then(async () => {
    const kv = await openKv(); await startWar(kv); await initForge(kv);
    // Ages: with several servers on one Postgres (AGE_SLOT or ACCOUNT_LEASES=1) the handoff spots and the idea log live in
    // kv (server/handoff.ts, server/ideaStore.ts); a single server keeps its files
    if (sharedStateOn()) { await useHandoffKv(kv); await initIdeas(kv); }
  })
  .then(() => gameServer.listen(PORT))
  .then(() => console.log(`Game server on http://localhost:${PORT}`))
  .catch((e) => { console.error("Could not start:", e); process.exit(1); });
