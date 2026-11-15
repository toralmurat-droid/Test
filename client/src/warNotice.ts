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

export interface WarEv { kind: "siege" | "flip" | "held"; t: number; by: ClanKey; from: ClanKey }

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
    return `${land} holds against ${by}!`;
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
