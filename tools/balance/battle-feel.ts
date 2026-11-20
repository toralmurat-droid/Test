// Battle feel sim (Murat 2026-11-20: "troops get stuck, battle action is confused; it should feel energetic and dense"):
// forces a pitched battle in a real room, puts a watching hero (unsworn, out of the fight) at its edge and samples the
// live lines for SECS seconds. Prints: soldiers fighting (a foe within reach), closing (target set, moving), idle (no
// target), stuck (meant to move but nearly still over 2 s), the mean gap between the two sides, live deaths per minute.
// Run: npx tsx tools/balance/battle-feel.ts   (SECS=40 by default)
import { startRoom, wait } from "../../tests/helpers/room";
import { MOB_ATTACK_RANGE, TILE } from "../../shared/constants";
import { newMinds } from "../../shared/war/doctrine";
import { battleField, type BattleSite } from "../../shared/war/battles";
import { newWar, WAR } from "../../shared/war/rules";
import { TERRITORIES } from "../../shared/war/territories";
import { _forceBattle, _resetWar, type SavedWar } from "../../server/war";

const SECS = Number(process.env.SECS ?? 40);
const SITE: BattleSite = (() => {
  const s = newWar();
  for (const T of TERRITORIES) { if (T.capitalOf) continue; for (const n of T.near) if (s.owner[n] !== s.owner[T.id] && battleField(n, T.id)) return { t: T.id, from: n, a: s.owner[n], b: s.owner[T.id] }; }
  throw new Error("no site");
})();
const F = battleField(SITE.from, SITE.t)!;
(async () => {
  const srv = await startRoom();
  const now = Date.now();
  _resetWar({ v: 1, state: newWar(), minds: newMinds(), next: now + WAR.tickMs, log: [] } as SavedWar);
  const b = _forceBattle(SITE, "pitched", now - 1000, F.x, F.y)!;
  const c = await srv.join({ cls: "wizard" });
  await wait(200);
  const room = srv.room, p = room.state.players.get(c.sessionId);
  p.level = 30; p.hp = p.maxHp = 1e9; p.clan = undefined;
  p.x = F.x - F.dy * 9 * TILE; p.y = F.y + F.dx * 9 * TILE; // (off to the side of the field)
  room.state.mobs.forEach((m: any, id: string) => { if (m.kind !== "trooper") room.state.mobs.delete(id); });
  room.battles.tick(Date.now());
  const lv = room.battles._live();
  if (!lv) throw new Error("battle did not wake");
  const side = new Map<string, number>(); for (const s of [0, 1]) for (const pl of lv.places[s]) if (pl.id) side.set(pl.id, s);
  let fight = 0, close = 0, idle = 0, stuck = 0, n = 0, gapSum = 0, gapN = 0, firstContact = -1;
  const last = new Map<string, { x: number; y: number; t: number }>();
  const men0 = [...b.men];
  const byRole: Record<string, any> = {}; let deaths = 0, switches = 0, windows = 0, overlap = 0; const tgtOf = new Map<string, string>(); const seen = new Set<string>();
  const t0 = Date.now();
  while (Date.now() - t0 < SECS * 1000) {
    await wait(500);
    const t = Date.now();
    const pts: [any, any][] = [[], []] as any;
    for (const s of [0, 1]) for (const pl of lv.places[s]) {
      if (!pl.id) continue;
      if (!side.has(pl.id)) side.set(pl.id, s);
      const m = room.state.mobs.get(pl.id); if (!m || m.dead) continue;
      seen.add(pl.id); m.__role = pl.f.role; m.__id = pl.id; (pts[s] as any[]).push(m);
    }
    let anyFight = false;
    for (const s of [0, 1]) for (const m of pts[s] as any[]) {
      n++; const R = (byRole[m.__role] ??= { n: 0, fight: 0, close: 0, idle: 0, still: 0, sw: 0 }); R.n++;
      const tg = m.target ? room.state.mobs.get(m.target) ?? room.state.players.get(m.target) : undefined;
      if (tg && Math.hypot(tg.x - m.x, tg.y - m.y) <= MOB_ATTACK_RANGE + 30) { fight++; anyFight = true; R.fight++; }
      else if (tg) { close++; R.close++; if (!m.moving && !m.winding) R.still++; } else { idle++; R.idle++; }
      const id = m.__id, q = last.get(id);
      if (m.target !== tgtOf.get(id)) { if (tgtOf.has(id) && m.target) { switches++; R.sw++; } tgtOf.set(id, m.target); }
      if (q && t - q.t >= 2000) { if ((m.__role === "foot" || m.__role === "rider") && tg && Math.hypot(m.x - q.x, m.y - q.y) < 6 && Math.hypot(tg.x - m.x, tg.y - m.y) > MOB_ATTACK_RANGE + 40) stuck++; windows++; last.set(id, { x: m.x, y: m.y, t }); }
      else if (!q) last.set(id, { x: m.x, y: m.y, t });
      for (const o of pts[s] as any[]) if (o !== m && Math.hypot(o.x - m.x, o.y - m.y) < 8) { overlap++; break; }
    }
    if (anyFight && firstContact < 0) firstContact = (t - t0) / 1000;
    const cen = (a: any[]) => a.length ? a.reduce((s, m) => [s[0] + m.x, s[1] + m.y], [0, 0]).map((v: number) => v / a.length) : undefined;
    const c0 = cen(pts[0] as any[]), c1 = cen(pts[1] as any[]);
    if (c0 && c1) { gapSum += Math.hypot(c0[0] - c1[0], c0[1] - c1[1]); gapN++; }
  }
  for (const id of seen) { const m = room.state.mobs.get(id); if (!m || m.dead) deaths++; }
  const pct = (x: number) => `${Math.round((100 * x) / Math.max(1, n))}%`;
  console.error(JSON.stringify({ secs: SECS, samples: n, fighting: pct(fight), closing: pct(close), idle: pct(idle), stuck2s: `${stuck}/${windows}`, overlapping: pct(overlap), targetSwitchesPerMin: +(switches / (SECS / 60)).toFixed(0), firstContactS: firstContact, meanSideGapPx: Math.round(gapSum / Math.max(1, gapN)), liveDeathsPerMin: +(deaths / (SECS / 60)).toFixed(1), poolLost: [men0[0] - b.men[0], men0[1] - b.men[1]] }));
  for (const [k, r] of Object.entries(byRole)) console.error(k, JSON.stringify({ share: pct(r.n), fight: Math.round(100 * r.fight / r.n) + '%', close: Math.round(100 * r.close / r.n) + '%', closeStill: Math.round(100 * r.still / r.n) + '%', idle: Math.round(100 * r.idle / r.n) + '%', swPerMin: +(r.sw / (SECS / 60)).toFixed(0) }));
  await srv.stop(); process.exit(0);
})();
