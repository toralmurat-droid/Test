/**
 * War news where it happens (roadmap M1): a war horn and a short notice when a siege is called, a land falls or
 * holds in the territory the hero stands in or next to it. Elsewhere the Herald's chat line is enough.
 */
import { CLANS, CLAN_KEYS, type ClanKey } from "../../shared/war/clans";
import { TERRITORIES } from "../../shared/war/territories";
import { WAR } from "../../shared/war/rules";
import { territoryAt } from "../../shared/war/view";
import { TILE } from "../../shared/constants";
import { play } from "./sfx";
import { hudSlot } from "./hudSlots";
import { spanText } from "../../shared/war/crown";
import "./warPlaque.css";

/** `sack`: a hero sacked the Hold of t (server/warHolds.ts); `by` is the holder itself when the hero was unsworn. */
export interface WarEv { kind: "siege" | "flip" | "held" | "sack"; t: number; by: ClanKey; from: ClanKey }
/** Server "warraid": the Night Raiders struck these lands of the clan they hunt (server/war.ts attachWar). */
export interface WarRaid { clan: ClanKey; ts: number[] }

/** Server "reckon" (server/warCrown.ts): the Reckoning's warning, start, hourly standings and result; scores and winner as CLAN_KEYS indexes. */
export interface ReckonMsg { kind: "warn" | "start" | "standings" | "result"; start: number; end: number; score?: number[]; winner?: number; kept?: boolean }

export class WarNotice {
  private el = document.createElement("div");
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.el.id = "warnotice";
    this.el.hidden = true;
    hudSlot("topleft").append(this.el); // under the plaque (hudSlots.css)
  }

  /** Text of the notice for an event (exported for tests and the wiki). */
  static text(e: WarEv): string {
    const land = TERRITORIES[e.t]?.name ?? "?", by = CLANS[e.by]?.name ?? "?";
    if (e.kind === "siege") return `Siege! ${by} march on ${land}. ${Math.round((WAR.siegeWarnTicks * WAR.tickMs) / 60_000)} min to the walls.`;
    if (e.kind === "flip") return `${land} falls to ${by}!`;
    if (e.kind === "sack") return e.by === e.from ? `The Hold of ${land} is sacked!` : `${by} sack the Hold of ${land}!`;
    return `${land} holds against ${by}!`;
  }

  /** Text of the Night Raiders' notice for a struck land. */
  static raidText(r: WarRaid, t: number): string {
    return `Night Raiders! They strike ${TERRITORIES[t]?.name ?? "?"}, land of ${CLANS[r.clan]?.name ?? "?"}.`;
  }

  /** Text of the Reckoning's notice (exported for tests). */
  static reckonText(m: ReckonMsg, now = Date.now()): string {
    const lead = () => { const i = (m.score ?? []).reduce((b, v, j, a) => (v > a[b] ? j : b), 0), k = CLAN_KEYS[i]; return k && m.score?.[i] ? `${CLANS[k].name} lead with ${m.score[i]}` : "nobody leads yet"; };
    if (m.kind === "warn") return `The Reckoning begins in ${spanText(m.start - now)}: the Crown Keep is at stake.`;
    if (m.kind === "start") return "The Reckoning has begun! Hold the Crown's lands and fight there.";
    if (m.kind === "standings") return `The Reckoning: ${lead()}, ${spanText(m.end - now)} left.`;
    const w = CLAN_KEYS[m.winner ?? -1];
    return w ? `${CLANS[w].name} ${m.kept ? "keep" : "take"} the Crown Keep!` : "The Reckoning is over.";
  }

  /** The Reckoning's news: shown wherever the hero is. */
  reckon(m: ReckonMsg) {
    if (!m || typeof m.kind !== "string" || !Number.isFinite(m.start) || !Number.isFinite(m.end)) return;
    this.say(WarNotice.reckonText(m), m.kind === "result" ? 10000 : 8000);
    this.el.className = "reckon";
  }

  /** W5: a big battle's notice (30 min, 5 min, the start): shown wherever the hero is, with a soft horn. */
  say(text: string, ms = 8000) {
    play("horn", undefined, undefined, 0.6, undefined, { minGap: 4000 });
    this.el.textContent = text;
    this.el.className = "siege";
    this.el.hidden = false;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { this.el.hidden = true; }, ms);
  }

  /** W4: a column of another clan marches on land of the hero's clan (shown wherever the hero is; the horn is soft). */
  column(clan: ClanKey, t: number) {
    play("horn", undefined, undefined, 0.5, undefined, { minGap: 4000 });
    this.el.textContent = `${CLANS[clan]?.name ?? "?"} send a column to ${TERRITORIES[t]?.name ?? "?"}.`;
    this.el.className = "siege";
    this.el.hidden = false;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { this.el.hidden = true; }, 6000);
  }

  /** The Night Raiders struck the hunted clan: horn and notice if the hero stands in one of those lands. */
  raid(r: WarRaid, me: { x: number; y: number } | undefined) {
    if (!me || !Array.isArray(r?.ts)) return;
    const here = territoryAt(Math.floor(me.x / TILE), Math.floor(me.y / TILE));
    if (!here || !r.ts.includes(here.id)) return;
    play("horn", undefined, undefined, 0.6, undefined, { minGap: 4000 });
    this.el.textContent = WarNotice.raidText(r, here.id);
    this.el.className = "siege";
    this.el.hidden = false;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { this.el.hidden = true; }, 7000);
  }

  /** A war event: horn and notice if the hero is in that land or next to it. */
  show(e: WarEv, me: { x: number; y: number } | undefined) {
    const t = TERRITORIES[e.t];
    if (!t || !me) return;
    const here = territoryAt(Math.floor(me.x / TILE), Math.floor(me.y / TILE));
    if (!here || (here.id !== t.id && !t.near.includes(here.id))) return;
    play("horn", undefined, undefined, 0.8, undefined, { minGap: 4000 }); // heard by the hero wherever they stand in the land (lands are big)
    this.el.textContent = WarNotice.text(e);
    this.el.className = e.kind;
    this.el.hidden = false;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { this.el.hidden = true; }, 7000);
  }
}
