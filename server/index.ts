import http from "node:http";
import path from "node:path";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { TownRoom } from "./TownRoom";

const PORT = Number(process.env.PORT ?? 2567);
const app = express();

// In production, serve the built client from the same server
if (process.env.NODE_ENV === "production") {
  const dist = path.resolve(__dirname, "../dist");
  app.use(express.static(dist));
}
app.get("/health", (_req, res) => { res.send("ok"); });

const httpServer = http.createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define("town", TownRoom);

gameServer.listen(PORT).then(() => console.log(`Game server on http://localhost:${PORT}`));
