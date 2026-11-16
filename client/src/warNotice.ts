/**
 * War news where it happens (roadmap M1): a war horn and a short notice when a siege is called, a land falls or
 * holds in the territory the hero stands in or next to it. Elsewhere the Herald's chat line is enough.
 */
import { CLANS, type ClanKey } from "../../shared/war/clans";
import { TERRITORIES } from "../../shared/war/territories";
import { WAR } from "../../shared/war/rules";
import { territoryAt } from "../../shared/war/view";
import { TILE } from "../../shared/constants";
import { play } from "./sfx";
import { hudSlot } from "./hudSlots";
import "./warPlaque.css";

/** `sack`: a hero sacked the Hold of t (server/warHolds.ts); `by` is the holder itself when the hero was unsworn. */
export interface WarEv { kind: "siege" | "flip" | "held" | "sack"; t: number; by: ClanKey; from: ClanKey }
/** Server "warraid": the Night Raiders struck these lands of the clan they hunt (server/war.ts attachWar). */
export interface WarRaid { clan: ClanKey; ts: number[] }

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
