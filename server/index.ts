import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { TownRoom } from "./TownRoom";
import { ideaLog, publicLog } from "./ideaStore";
import { allAccounts, peek } from "./accounts";

const PORT = Number(process.env.PORT ?? 2567);
const app = express();

// In production, serve the built client from the same server
if (process.env.NODE_ENV === "production") {
  const dist = path.resolve(__dirname, "../dist");
  app.use(express.static(dist));
}
app.get("/health", (_req, res) => { res.send("ok"); });
// The player idea log (read-only), newest first
app.get("/ideas.json", (_req, res) => { res.json(publicLog()); });

// Backup download of every account and the idea log: /admin/backup?key=ADMIN_KEY
// Off unless the ADMIN_KEY environment variable is set (Railway: service -> Variables).
app.get("/admin/backup", (req, res) => {
  const want = Buffer.from(process.env.ADMIN_KEY ?? "");
  const got = Buffer.from(String(req.query.key ?? ""));
  const ok = want.length >= 12 && got.length === want.length && crypto.timingSafeEqual(got, want);
  if (!ok) { res.sendStatus(404); return; }
  const day = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Disposition", `attachment; filename="game-backup-${day}.json"`);
  res.setHeader("Cache-Control", "no-store");
  res.json({ at: new Date().toISOString(), saves: allAccounts(), ideas: ideaLog });
});

// Login screen: which saved heroes does this account have? (lets the player pick Continue or New game)
app.use("/account", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); // dev: the client runs on another port
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});
app.post("/account", express.json({ limit: "2kb" }), (req, res) => {
  try { res.json(peek(req.body?.name, req.body?.password)); }
  catch (e: any) { res.status(401).json({ error: String(e?.message ?? e) }); }
});

const httpServer = http.createServer(app);
// perMessageDeflate: the browser and server squeeze every update (~35% fewer bytes, all browsers support it).
// Level 1 is the fastest setting; tiny messages (inputs, chat) are sent as they are. WS_DEFLATE=0 turns it off.
const deflate = process.env.WS_DEFLATE !== "0" && { threshold: 256, zlibDeflateOptions: { level: 1 } };
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer, perMessageDeflate: deflate }) });
gameServer.define("town", TownRoom);

gameServer.listen(PORT).then(() => console.log(`Game server on http://localhost:${PORT}`));
