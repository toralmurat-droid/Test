/**
 * Sacking a Hold on the client (W2b; the server decides in server/warHolds.ts, rules in shared/war/holdSack.ts). Look and
 * input only: an "E Raise your banner" prompt at the middle of a Hold whose holder fights the hero, the progress bar of
 * the hero's own banner ("sack" message), a rope-and-cloth creak while any banner goes up nearby, the plaque line, and
 * the Holds sacked this war tick ("holds" message) for the war map and the banners drawn by client/src/warStandards.ts.
 */
import { CLANS, CLAN_KEYS, type ClanKey } from "../../shared/war/clans";
import { bannerSpot, cleanHoldsMsg, HOLD_SACK, type HoldsMsg } from "../../shared/war/holdSack";
import { HOLDS } from "../../shared/war/standards";
import { TERRITORIES } from "../../shared/war/territories";
import type { TroopStance } from "../../shared/war/troops";
import { TILE } from "../../shared/constants";
import { hudSlot } from "./hudSlots";
import { play } from "./sfx";
import "./warSack.css";

export interface SackHost {
  /** How clan k's soldiers see this hero (the stance with the hero's oath and feuds: client/src/warFeud.ts). */
  stance(k: ClanKey): TroopStance;
  /** The holder of territory t from the last "war" snapshot. */
  holder(t: number): ClanKey | undefined;
  /** Is a siege announced at territory t (the "war" snapshot)? */
  besieged(t: number): boolean;
  send(type: string, msg?: unknown): void;
  /** Has territory t's Hold fallen (the "war" snapshot: shared/war/holdFall.ts)? Its ruin is claimed with the same banner. */
  fallen?(t: number): boolean;
  /** The clan this hero is sworn to (undefined: unsworn). */
  myClan?(): ClanKey | undefined;
}

/** The hero's own banner as the server last told ("sack"). */
interface Mine { t: number; progress: number; state: "raise" | "paused" | "done" | "stop" }

export class WarSack {
  private holds: HoldsMsg = { tick: -1, sacked: [], raising: [] };
  private mine?: Mine;
  private prompt = document.createElement("div");
  private bar = document.createElement("div");
  private err = ""; private errUntil = 0;
  private nextCreak = 0;
  private shown = "";
  /** The Hold whose banner spot the hero stands at, if its holder fights them. */
  near?: number;
  /** Called when the sacked Holds change (the banners in warStandards.ts, the war map). */
  onChange?: (sacked: ReadonlyMap<number, number>) => void;
  private sackedMap = new Map<number, number>();

  constructor(private h: SackHost) {
    this.prompt.id = "sackprompt";
    this.prompt.onclick = () => this.interact();
    this.bar.id = "sackbar"; this.bar.hidden = true;
    hudSlot("promptstack").append(this.prompt, this.bar);
  }

  /** The server's "holds" message: Holds sacked this war tick, banners going up. */
  setHolds(m: unknown) {
    this.holds = cleanHoldsMsg(m);
    const next = new Map(this.holds.sacked.map(([t, by]) => [t, by] as [number, number]));
    const same = next.size === this.sackedMap.size && [...next].every(([t, by]) => this.sackedMap.get(t) === by);
    this.sackedMap = next;
    if (!same) this.onChange?.(next);
  }

  /** The server's "sack" message to this hero: progress, a pause, the end, or why not (t -1 with err). */
  setSack(m: unknown) {
    const o = m && typeof m === "object" ? (m as { t?: unknown; progress?: unknown; state?: unknown; err?: unknown }) : {};
    if (typeof o.err === "string" && o.err) { this.err = o.err; this.errUntil = Date.now() + 4000; }
    if (typeof o.t !== "number" || o.t < 0) return;
    const state = o.state === "paused" || o.state === "done" || o.state === "stop" ? o.state : "raise";
    this.mine = state === "stop" ? undefined : { t: o.t, progress: Math.max(0, Math.min(1, Number(o.progress) || 0)), state };
    if (state === "done") window.setTimeout(() => { if (this.mine?.state === "done") this.mine = undefined; }, 2500);
  }

  /** The sacked Holds this war tick: territory -> the sacker's clan index (-1 an unsworn hero). */
  get sacked(): ReadonlyMap<number, number> { return this.sackedMap; }

  /** The E key (or a click on the prompt): ask to raise the banner here. True when it handled the key. */
  interact(): boolean {
    if (this.near === undefined || this.mine) return false;
    this.h.send("sack", { t: this.near });
    return true;
  }

  /** A line for the war plaque while the hero stands in land t ("" when nothing). */
  line(t: number): string {
    if (this.h.fallen?.(t)) {
      const r = this.holds.raising.find((x) => x[0] === t);
      return r ? `A banner is going up over the ruin: ${r[1]}%${r[2] ? " (contested)" : ""}` : "The Hold has fallen: any clan may claim its ruin";
    }
    const by = this.sackedMap.get(t);
    if (by !== undefined) return `Hold sacked${CLAN_KEYS[by] ? ` by ${CLANS[CLAN_KEYS[by]].name}` : ""}: guards down until the next war tick`;
    const r = this.holds.raising.find((x) => x[0] === t);
    return r ? `A banner is going up in the Hold: ${r[1]}%${r[2] ? " (held up)" : ""}` : "";
  }

  /** Every frame: the prompt at a hostile Hold's banner, the hero's progress bar, the creak of banners going up near. */
  update(me: { x: number; y: number } | undefined, blocked: boolean, now = Date.now()) {
    let near: number | undefined, reckon = false, ruin: number | undefined;
    if (me && !blocked) for (const hd of HOLDS) {
      const at = bannerSpot(hd.t), k = this.h.holder(hd.t);
      if (!at || !k || Math.hypot(at.x - me.x, at.y - me.y) > HOLD_SACK.useTiles * TILE) continue;
      // the Crown Keep is never sacked (server/warHolds.ts): a note instead of the prompt
      if (TERRITORIES[hd.t]?.reckoningOnly) { reckon = this.h.stance(k) !== "ally"; break; }
      if (TERRITORIES[hd.t]?.haven) break; // heartland: never sacked, no prompt
      if (this.h.fallen?.(hd.t)) { ruin = hd.t; if (this.h.myClan?.()) near = hd.t; break; } // a fallen Hold: any sworn hero claims its ruin
      if (this.h.stance(k) === "enemy" && !this.h.besieged(hd.t) && !this.sackedMap.has(hd.t)) near = hd.t;
      break;
    }
    this.near = near;
    this.prompt.classList.toggle("open", (near !== undefined || reckon || ruin !== undefined) && !this.mine);
    const k = near !== undefined ? this.h.holder(near) : undefined, mine = this.h.myClan?.();
    const html = reckon ? "The Crown Keep falls only at a Reckoning"
      : ruin !== undefined ? (mine ? `<kbd>E</kbd> Claim this fallen Hold for ${CLANS[mine].name}` : "This Hold has fallen: swear to a clan to claim it")
      : near !== undefined && k ? `<kbd>E</kbd> Raise your banner over the ${CLANS[k].name} Hold` : "";
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
    // the hero's own banner: progress in the pixel font, or why not
    const m = this.mine, err = now < this.errUntil ? this.err : "";
    const claim = !!m && !!this.h.fallen?.(m.t);
    const text = m ? (m.state === "done" ? (claim ? "The ruin is yours!" : "Your banner flies over the Hold!") : m.state === "paused" ? `Held up: ${claim ? "another clan contests the ruin" : "defenders in the Hold"} · ${Math.round(m.progress * 100)}%` : `${claim ? "Claiming the ruin" : "Raising your banner"} · ${Math.round(m.progress * 100)}%`) : err;
    const key = `${text}|${m?.state ?? ""}|${m ? Math.round(m.progress * 100) : ""}`;
    if (key !== this.shown) {
      this.shown = key;
      this.bar.hidden = !text;
      this.bar.className = m ? m.state : "err";
      this.bar.replaceChildren();
      const label = document.createElement("div"); label.className = "sb-text"; label.textContent = text;
      this.bar.append(label);
      if (m) { const track = document.createElement("div"); track.className = "sb-track"; const fill = document.createElement("i"); fill.style.width = `${Math.round(m.progress * 100)}%`; track.append(fill); this.bar.append(track); }
    }
    // rope and cloth while a banner goes up within earshot (the server says where; paused ones are silent)
    if (me && now >= this.nextCreak) for (const [t, , paused] of this.holds.raising) {
      const at = bannerSpot(t);
      if (paused || !at || Math.hypot(at.x - me.x, at.y - me.y) > 9 * TILE) continue;
      this.nextCreak = now + 1400;
      play("banner_raise", at.x, at.y, 0.8, undefined, { key: "bannerraise", minGap: 1000 });
      break;
    }
  }
}
