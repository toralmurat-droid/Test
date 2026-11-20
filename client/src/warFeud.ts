import Phaser from "phaser";
import { TILE } from "../../shared/constants";
import { CLANS, type ClanKey } from "../../shared/war/clans";
import {
  atWar, FEUD, feudFromView, grudgeActive, ptsOf, setWarPairs, WANTED_TIERS, wantedTier, type FeudState, type WantedMarks,
} from "../../shared/war/feuds";
import { holdOf, STANDARD } from "../../shared/war/standards";
import { parseTroop, TROOP_SHORT, troopStance, type TroopStance } from "../../shared/war/troops";
import { territoryAt } from "../../shared/war/view";
import { isSafeZone } from "../../shared/map";
import { hudSlot } from "./hudSlots";
import { fromIso, ISO, isoAnchor, setBaseDepth } from "./iso";
import { TEXT_FONT, TEXT_PX, WT } from "./pixelfont";
import "./warFeud.css";

/**
 * Feuds on the client (look and input only, rule 5; the server decides in server/warFeuds.ts):
 * - Ctrl+click on a trooper or the middle of a Hold of a clan that leaves the hero alone asks every time ("Strike the
 *   Redfang? ...") and only then sends the intent ("provoke"); hovering one with Ctrl held shows a hint. (Shift+click is
 *   the attack in place, client/src/pointer.ts, which skips Ctrl+clicks.)
 * - The hero's own feuds ("feud" message) feed the stance (troop name colours, the attack cursor): a provoked clan's
 *   names turn orange. A badge in the top-left column shows Wanted tiers with the next decay, and how the clan of the
 *   land underfoot sees the hero ("At war with you" / "Neutral" / "Hunting you").
 * - Every hero's Wanted marks ("wanted" message) hang over their names: "Wanted by Redfang".
 */

/** What an entity lends the marks: its sprite and name label; the mark text is kept on it. */
export interface FeudEnt { sprite: Phaser.GameObjects.Sprite; label?: Phaser.GameObjects.Text; feudMark?: Phaser.GameObjects.Text; state?: any; mob?: boolean }
export interface FeudHost {
  me(): { x: number; y: number; level: number; dead?: boolean } | undefined;
  /** The clan this hero is sworn to (the "clan" message), if any. */
  clan(): ClanKey | undefined;
  /** The holder of territory t from the last "war" snapshot. */
  holder(t: number): ClanKey | undefined;
  entities(): Iterable<[string, FeudEnt]>;
}
/** Name colour of a clan whose soldiers fight the hero only because the hero provoked them. */
export const PROVOKED_COLOUR = "#ffa040";
const MARK_COLOUR = ["", "#ffd166", "#ff9a4a", "#ff5a4a"];

export class WarFeud {
  /** The hero's own feuds, rebuilt on this client's clock from the server's view. */
  state: FeudState = {};
  private marks = new Map<string, WantedMarks>();
  private badge = document.createElement("div");
  private hint = document.createElement("div");
  private ask?: HTMLDivElement;
  private ctrl = false;
  private nextHud = 0;
  private lastHtml = "";

  constructor(private scene: Phaser.Scene, private room: any, private h: FeudHost) {
    this.badge.id = "warfeud"; this.badge.hidden = true;
    hudSlot("topleft").append(this.badge);
    this.hint.id = "warfeudhint"; this.hint.hidden = true;
    document.getElementById("hud")?.append(this.hint);
    room.onMessage("feud", (m: any) => {
      this.state = feudFromView(m, Date.now());
      if (typeof m?.err === "string" && m.err) this.flash(m.err);
      this.nextHud = 0;
    });
    room.onMessage("wanted", (m: any) => this.setMarks(m));
    room.onMessage("war", (v: any) => { if (Array.isArray(v?.wars)) setWarPairs(v.wars); }); // the clans at war, as the server keeps them
    scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.down(p));
    scene.input.on("pointermove", (p: Phaser.Input.Pointer) => this.hover(p));
    scene.events.on(Phaser.Scenes.Events.UPDATE, () => this.frame());
    const key = (e: KeyboardEvent) => { this.ctrl = e.ctrlKey; if (!this.ctrl) this.hint.hidden = true; };
    window.addEventListener("keydown", key); window.addEventListener("keyup", key);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { window.removeEventListener("keydown", key); window.removeEventListener("keyup", key); this.badge.remove(); this.hint.remove(); this.ask?.remove(); });
  }

  /** How clan `k`'s soldiers see this hero (troops.ts troopStance with the hero's feuds). */
  stance(k: ClanKey): TroopStance {
    const me = this.h.me();
    return me ? troopStance(k, { clan: this.h.clan(), level: me.level, feud: this.state }) : "neutral";
  }
  /** Name colour override for a clan's troopers: orange when only a provocation makes them fight (else undefined). */
  colour(k: ClanKey): string | undefined {
    const mine = this.h.clan();
    return mine !== k && !(mine && atWar(mine, k)) && grudgeActive(this.state, k, Date.now()) && this.stance(k) === "enemy" ? PROVOKED_COLOUR : undefined;
  }

  private setMarks(m: any) {
    if (!m || typeof m !== "object") return;
    if (m.full) this.marks.clear();
    if (m.w && typeof m.w === "object") for (const [id, v] of Object.entries(m.w)) {
      const ok = Array.isArray(v) ? (v as unknown[]).filter((x): x is [ClanKey, number] => Array.isArray(x) && !!CLANS[x[0] as ClanKey] && Number.isInteger(x[1]) && x[1] >= 1 && x[1] <= 3) : [];
      if (ok.length) this.marks.set(id, ok); else this.marks.delete(id);
    }
    if (Array.isArray(m.gone)) for (const id of m.gone) this.marks.delete(String(id));
  }

  /** "Wanted by Redfang" over a marked hero's name. Call after the name label (and tabard) are placed for the frame. */
  sync(id: string, e: FeudEnt, show: boolean) {
    const m = this.marks.get(id), l = e.label;
    if (!m || !l || !show || !l.visible) { e.feudMark?.setVisible(false); return; }
    const top = m.reduce((a, b) => (b[1] > a[1] ? b : a));
    const text = `${WANTED_TIERS[top[1]]} by ${m.map((x) => TROOP_SHORT[x[0]]).join(", ")}`;
    if (!e.feudMark) {
      e.feudMark = isoAnchor(this.scene.add.text(0, 0, text, { fontFamily: TEXT_FONT, fontSize: `${TEXT_PX}px`, color: MARK_COLOUR[top[1]], stroke: "#000", strokeThickness: 2 })
        .setOrigin(0.5, 1).setScale(WT * 0.8).setResolution(1), e.sprite) as Phaser.GameObjects.Text;
      (e.feudMark as any).__worldText = true;
    }
    if (e.feudMark.text !== text) e.feudMark.setText(text).setColor(MARK_COLOUR[top[1]]);
    setBaseDepth(e.feudMark.setPosition(Math.round(l.x), Math.round(l.y - l.displayHeight - 1)).setVisible(true), e.sprite.y + 1);
  }

  // ---- provoking ------------------------------------------------------------------------------------------------

  private world(p: Phaser.Input.Pointer): { x: number; y: number } {
    const w = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    return ISO ? fromIso(w.x, w.y) : { x: w.x, y: w.y };
  }

  /** The neutral clan thing under the pointer: a trooper (by id) or a Hold (by territory). */
  private target(p: Phaser.Input.Pointer): { clan: ClanKey; msg: { id: string } | { hold: number } } | undefined {
    const me = this.h.me();
    if (!me || me.dead || me.level < STANDARD.minLevel) return undefined;
    const w = this.world(p);
    let best: { clan: ClanKey; msg: { id: string } } | undefined, bd = 14; // (right under the cursor)
    for (const [id, e] of this.h.entities()) {
      const s = e.state;
      if (!e.mob || !s || s.kind !== "trooper" || s.dead || s.hidden) continue;
      const tr = parseTroop(s.weapon);
      if (!tr || this.stance(tr.clan) !== "neutral") continue;
      const d = Math.hypot(s.x - w.x, s.y - 10 - w.y);
      if (d < bd) { bd = d; best = { clan: tr.clan, msg: { id } }; }
    }
    if (best) return best;
    // a Hold: only its middle (the banner and the cells round it), never the whole fort
    const tx = Math.floor(w.x / TILE), ty = Math.floor(w.y / TILE), land = territoryAt(tx, ty);
    const hold = land && holdOf(land.id), r = 1.5 * TILE;
    if (!hold || Math.abs(hold.x - w.x) > r || Math.abs(hold.y - w.y) > r) return undefined;
    const clan = this.holderOf(land!.id);
    return clan && this.stance(clan) === "neutral" ? { clan, msg: { hold: land!.id } } : undefined;
  }
  private holderOf(t: number): ClanKey | undefined { return this.h.holder(t); }

  private hover(p: Phaser.Input.Pointer) {
    const t = !this.ask && (this.ctrl || (p.event as MouseEvent | undefined)?.ctrlKey) ? this.target(p) : undefined;
    this.hint.hidden = !t;
    if (!t) return;
    this.hint.textContent = `Ctrl+click: strike at the ${TROOP_SHORT[t.clan]}`;
    this.hint.style.left = `${p.event ? (p.event as MouseEvent).clientX + 18 : 0}px`;
    this.hint.style.top = `${p.event ? (p.event as MouseEvent).clientY + 18 : 0}px`;
  }

  private down(p: Phaser.Input.Pointer) {
    if (p.button !== 0 || !(p.event as MouseEvent | undefined)?.ctrlKey || this.ask) return;
    const t = this.target(p);
    if (!t) return;
    const me = this.h.me();
    if (me && isSafeZone(me.x, me.y)) { this.flash("Not here: blood is never spilled on safe ground."); return; }
    this.hint.hidden = true;
    this.confirm(t.clan, () => this.room.send("provoke", t.msg)); // asked every time: nothing is remembered
  }

  /** The question before every provocation, in the pixel font. Enter / Esc answer it only while it is open and no text field has the focus. */
  private confirm(clan: ClanKey, yes: () => void) {
    const box = document.createElement("div");
    box.id = "warfeudask";
    const q = document.createElement("p");
    q.textContent = `Strike the ${TROOP_SHORT[clan]}? Their soldiers will fight you for ${Math.round(FEUD.grudgeMs / 60_000)} min.`;
    const sub = document.createElement("p"); sub.className = "sub";
    sub.textContent = `Killing their people makes you Wanted by ${CLANS[clan].name}.`;
    const row = document.createElement("div"); row.className = "row";
    const ok = document.createElement("button"); ok.textContent = "Strike";
    const no = document.createElement("button"); no.textContent = "Leave them be";
    const close = () => { box.remove(); this.ask = undefined; window.removeEventListener("keydown", key, true); };
    const key = (e: KeyboardEvent) => {
      const f = document.activeElement as HTMLElement | null;
      if ((e.key !== "Escape" && e.key !== "Enter") || (f && (f.tagName === "INPUT" || f.tagName === "TEXTAREA" || f.isContentEditable))) return;
      e.stopPropagation(); e.preventDefault(); close();
      if (e.key === "Enter") yes();
    };
    ok.onclick = () => { close(); yes(); };
    no.onclick = close;
    row.append(ok, no); box.append(q, sub, row);
    (document.getElementById("hud") ?? document.body).append(box);
    window.addEventListener("keydown", key, true);
    this.ask = box;
  }

  private flashTimer = 0;
  private flash(text: string) {
    this.hint.textContent = text; this.hint.hidden = false;
    this.hint.style.left = "50%"; this.hint.style.top = "30%";
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => { this.hint.hidden = true; }, 2500);
  }

  // ---- the badge ------------------------------------------------------------------------------------------------

  private frame() {
    const now = Date.now();
    if (now < this.nextHud) return;
    this.nextHud = now + 250;
    const me = this.h.me();
    if (!me) { this.badge.hidden = true; return; }
    const rows: string[] = [];
    for (const k of Object.keys(this.state) as ClanKey[]) {
      const t = wantedTier(this.state, k, now);
      if (!t) continue;
      const e = this.state[k]!, pts = ptsOf(this.state, k, now), left = FEUD.decayMs - ((now - (e.at ?? now)) % FEUD.decayMs);
      const stars = Array.from({ length: 3 }, (_, i) => `<i class="${i < t ? "on" : ""}"></i>`).join("");
      rows.push(`<div class="wf-row t${t}"><span class="wf-stars">${stars}</span>${WANTED_TIERS[t]} by ${esc(TROOP_SHORT[k])} <span class="wf-dim">${Number.isInteger(pts) ? pts : pts.toFixed(1)} · -1 in ${clock(left)}</span></div>`);
    }
    // how the clan of the land underfoot sees the hero
    const land = territoryAt(Math.floor(me.x / TILE), Math.floor(me.y / TILE)), holder = land ? this.holderOf(land.id) : undefined;
    if (holder && me.level >= STANDARD.minLevel) {
      const st = this.stance(holder), w = wantedTier(this.state, holder, now);
      const [txt, cls] = st === "ally" ? ["Your clan", "ally"] : w ? ["Hunting you", "hunt"] : st === "enemy" ? (this.colour(holder) ? ["Provoked: fighting you", "prov"] : ["At war with you", "war"]) : ["Neutral", "neutral"];
      rows.push(`<div class="wf-land">${esc(TROOP_SHORT[holder])} land: <span class="${cls}">${txt}</span></div>`);
    }
    const html = rows.join("");
    if (this.lastHtml !== html) { this.lastHtml = html; this.badge.innerHTML = html; }
    this.badge.hidden = !html;
  }
}

const clock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
