import http from "node:http";
import path from "node:path";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { TownRoom } from "./TownRoom";
import { publicLog } from "./ideaStore";
import { peek } from "./accounts";

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
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define("town", TownRoom);

gameServer.listen(PORT).then(() => console.log(`Game server on http://localhost:${PORT}`));
