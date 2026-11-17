/**
 * The behaviour gate on a clan plug-in (Living Code M6): CLAN_PLUGIN.gateBriefings briefings of that clan from war-sim
 * states (the scripted war, several seeds, every war day) go through the real sandbox worker (server/clanPlugins.ts
 * runInWorker) with the stricter CLAN_PLUGIN.gateMs a call. Passes only when every answer is legal (the same checks as
 * the live provider: declaration, JSON, no forge order, validateCouncil) and a second run gives the same answers byte
 * for byte (deterministic). CI runs it for the clan folders a PR touches (.github/workflows/ci.yml).
 * Run: npx tsx tools/clans/gate.ts [clan ...]   (no clan: every folder). Exit code 1 when a gate fails.
 */
import { CLAN_KEYS, type ClanKey } from "../../shared/war/clans";
import { newMinds, scriptedOrders } from "../../shared/war/doctrine";
import { buildBriefing, validateCouncil, type CouncilBriefing } from "../../shared/war/council";
import { newWar, WAR, warTick, type WarState } from "../../shared/war/rules";
import { CLAN_PLUGIN } from "../../shared/clans/api";
import { answerOf, runInWorker } from "../../server/clanPlugins";

export interface GateFixture { owner: WarState["owner"]; b: CouncilBriefing }
export interface GateResult { ok: boolean; clan: string; n: number; problems: string[] }

function mulberry(a: number) {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const cache = new Map<string, GateFixture[]>();
/** `n` briefings of clan k: war-sim states at the start of each war day (scripted leaders), seed after seed. Deterministic. */
export function gateFixtures(k: ClanKey, n: number = CLAN_PLUGIN.gateBriefings): GateFixture[] {
  const key = `${k}:${n}`, had = cache.get(key);
  if (had) return had;
  const out: GateFixture[] = [], days = 50;
  for (let seed = 1; out.length < n; seed++) {
    const s = newWar(), minds = newMinds(), rnd = mulberry(seed * 7919);
    for (let d = 0; d < days && out.length < n; d++) {
      out.push({ owner: s.owner.slice(), b: buildBriefing(s, k, { seed }, d) });
      for (let i = 0; i < WAR.ticksPerDay; i++) warTick(s, scriptedOrders(s, minds, rnd));
    }
  }
  cache.set(key, out);
  return out;
}

/** The gate on clan k's bundle `code` (n briefings). Never throws. */
export async function gateCode(k: ClanKey, code: string, n: number = CLAN_PLUGIN.gateBriefings, callMs: number = CLAN_PLUGIN.gateMs): Promise<GateResult> {
  const fx = gateFixtures(k, n), inputs = fx.map((f) => JSON.stringify(f.b)), problems: string[] = [];
  const a = await runInWorker(code, inputs, callMs), b = await runInWorker(code, inputs, callMs);
  fx.forEach((f, i) => {
    const r = answerOf(a[i], k, (raw) => validateCouncil(raw, { owner: f.owner }, k, f.b.day).errors);
    if ("error" in r) problems.push(`briefing ${i} (war day ${f.b.day}): ${r.error}`);
    const same = a[i].ok === b[i].ok && (a[i].ok ? (a[i] as { out: string }).out === (b[i] as { out: string }).out : true);
    if (!same) problems.push(`briefing ${i} (war day ${f.b.day}): not deterministic (two runs gave different answers)`);
  });
  return { ok: !problems.length, clan: k, n: fx.length, problems };
}

/** The gate on clan k's folder, bundled as the build does (tools/clans/build.mjs). */
export async function gateClan(k: string, n?: number): Promise<GateResult> {
  if (!CLAN_KEYS.includes(k as ClanKey)) return { ok: false, clan: k, n: 0, problems: [`${k}: not a clan (${CLAN_KEYS.join(", ")})`] };
  const src = "./build.mjs";
  const { bundleClan } = (await import(src)) as { bundleClan(c: string): Promise<{ code: string; sha256: string }> };
  let code: string;
  try { code = (await bundleClan(k)).code; } catch (e) { return { ok: false, clan: k, n: 0, problems: [`the bundle does not build: ${String((e as Error)?.message ?? e).slice(0, 300)}`] }; }
  return gateCode(k as ClanKey, code, n);
}

if (require.main === module) {
  (async () => {
    const src = "./build.mjs";
    const { listClans } = (await import(src)) as { listClans(): string[] };
    const clans = process.argv.slice(2).length ? process.argv.slice(2) : listClans();
    let bad = 0;
    for (const c of clans) {
      const t = Date.now(), r = await gateClan(c);
      if (!r.ok) bad++;
      console.log(`clan gate ${c}: ${r.ok ? "ok" : "FAILED"}, ${r.n} briefings x2 (${Date.now() - t} ms)${r.problems.length ? `\n${r.problems.slice(0, 20).map((p) => `  ${p}`).join("\n")}` : ""}`);
    }
    process.exit(bad ? 1 : 0);
  })();
}
