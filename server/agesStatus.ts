/**
 * Ages status (roadmap M5, docs/ages-setup.md "Checks"): one admin view of this game server's part in the Ages, so the
 * owner sees both Ages at a glance (the gateway's /gateway/status fetches it from each). Counts and ids only, never
 * player names. GET /admin/ages.json?key=ADMIN_KEY (404 without, like every /admin route).
 */
import type express from "express";
import { WAR_API } from "../shared/war/api";
import { FORGE_API } from "../shared/forgeApi";
import { ACCOUNT_API } from "../shared/accountApi";
import { crossStats } from "./ageCross";
import { ageRole, holderId } from "./lease";
import { accountStats } from "./accounts";
import { warLease, warRole } from "./war";
import { forgeLease, forgeRole } from "./forge";
import { worldLease } from "./worldStore";

export interface Online { players: number; accounts: number }

/** The status object (also for tests). `online`: heroes and accounts in the rooms (server/TownRoom.ts onlineNow). */
export function agesStatus(build: string, online: () => Online, env = process.env) {
  const war = warLease(), forge = forgeLease(), world = worldLease(), acc = accountStats();
  const leases = [war.held && "lease:war", world.held && "lease:world", forge.held && "lease:forge"].filter((k): k is string => !!k);
  return {
    slot: env.AGE_SLOT || "main",
    role: ageRole(env),
    build,
    api: { war: WAR_API, forge: FORGE_API, account: ACCOUNT_API },
    holder: holderId(env),
    holders: { war: war.holder, world: world.holder, forge: forge.holder, accounts: acc.holder },
    roles: { war: warRole(), world: world.role, forge: forgeRole() },
    leases,
    online: online(),
    accounts: {
      shared: acc.shared, leasesHeld: acc.leasesHeld, inUse: acc.inUse, claims: acc.claims, fencedRefused: acc.refused,
    },
    flush: { dirty: acc.dirty, lagMs: acc.lagMs, failures: acc.failures },
    // Crossing between Ages (server/ageCross.ts): on, this slot, counts since boot (crossed, refused, failed saves, list fetch failures)
    crossing: crossStats(),
    uptimeS: Math.round(process.uptime()),
    at: new Date().toISOString(),
  };
}

/** Mounts GET /admin/ages.json behind the admin key check of server/index.ts. */
export function mountAgesStatus(app: express.Express, adminOk: (req: express.Request) => boolean, build: string, online: () => Online) {
  app.get("/admin/ages.json", (req, res) => {
    if (!adminOk(req)) { res.sendStatus(404); return; }
    res.setHeader("Cache-Control", "no-store");
    res.json(agesStatus(build, online));
  });
}
