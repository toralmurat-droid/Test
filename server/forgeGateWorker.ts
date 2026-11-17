/**
 * The Forge's sim gate in a worker thread (server/forge.ts runGate): the built server runs it from
 * server-dist/forgeGate.cjs so a few seconds of sims never stall the game loop, and a hung gate can be killed.
 */
import { parentPort, workerData } from "node:worker_threads";
import { forgeGate } from "../tools/balance/forgeGate";

const r = forgeGate(workerData?.def);
parentPort?.postMessage({ ok: r.ok, reasons: r.reasons });
