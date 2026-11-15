/**
 * Clan war standards in the world (shared/war/standards.ts): a banner pole in the holder's colours with its capture
 * ring on the ground, an "E" prompt when close, and the oath panel (swear to one of the five clans). Cosmetic: the
 * server decides the oath ("clan" message) and counts the minutes in the ring.
 */
import Phaser from "phaser";
import { CLANS, CLAN_KEYS, type ClanKey } from "../../shared/war/clans";
import { RENOWN_RANKS, rankOf } from "../../shared/war/renown";
import { HOLDS, STANDARD, STANDARDS, type Standard } from "../../shared/war/standards";
import { HoldDraw, HOLD_KEEP, HOLD_RANGE } from "./holdAssets";
import { fortOf } from "../../shared/war/holdWalls";
import { TILE } from "../../shared/constants";
import { targetsOf, type WarState } from "../../shared/war/rules";
import { TERRITORIES } from "../../shared/war/territories";
import type { WarView } from "../../shared/war/view";
import type { SiegeView } from "../../shared/war/siege";
import { hudSlot } from "./hudSlots";
import { isoAnchor } from "./iso";
import { ISO } from "./isoflag";
import { pennant } from "./warPlaque";

const POLE_H = 48; // art px (drawn at 2x, like all world art)
const DOCTRINE_LINE: Record<ClanKey, string> = {
  wardens: "Palisade: their forts grow twice as fast.",
  redfang: "Raid: they strike two places and steal troops.",
  host: "Siege: strongest at night, the dead rise again.",
  hidekin: "Tunnel: they strike land two borders away.",
  veiled: "Ritual: strongest at noon.",
};

/** The standard texture of a clan: pole, crossbar and its pennant, 2 world px per art px. */
function standardTexture(scene: Phaser.Scene, k: ClanKey): string {
  const key = `warstd_${k}`;
  if (scene.textures.exists(key)) return key;
  const flag = pennant(k), W = 22, H = POLE_H, c = document.createElement("canvas");
  c.width = W * 2; c.height = H * 2;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.scale(2, 2);
  g.fillStyle = "#1a1008"; g.fillRect(10, 1, 3, H - 1); // pole with a dark outline
  g.fillStyle = "#6a4a28"; g.fillRect(11, 1, 1, H - 2);
  g.fillStyle = "#c8a040"; g.fillRect(10, 0, 3, 2); // gilt finial
  g.fillStyle = "#1a1008"; g.fillRect(2, 4, 18, 2); // crossbar
  g.drawImage(flag, 3, 5);
  g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(8, H - 2, 7, 2); // foot shadow
  scene.textures.addCanvas(key, c);
  return key;
}

export class WarStandards {
  private poles = new Map<number, Phaser.GameObjects.Image>();
  private holds = new Map<number, HoldDraw | Phaser.GameObjects.Graphics>();
  private holdClan = new Map<number, ClanKey>();
  private rings = new Map<number, Phaser.GameObjects.Ellipse>();
  private prompt = document.createElement("div");
  private el = document.createElement("div");
  private view?: WarView;
  private hero?: { x: number; y: number };
  private holdAt = 0;
  /** Standards that are fronts of the server's live siege battle, and who holds each ("siege" message). */
  private fronts = new Map<number, ClanKey>();
  clan: ClanKey | "" = "";
  private next = 0;
  private minLevel = 5;
  private renown = 0;
  private err = "";
  near?: Standard;
  open = false;

  constructor(private scene: Phaser.Scene, private send: (type: string, msg?: unknown) => void) {
    for (const s of STANDARDS) {
      // a world circle of radius R: an ellipse 2√2R x √2R once projected to iso, a plain circle top-down
      const ring = scene.add.ellipse(s.x, s.y, STANDARD.range * 2 * (ISO ? Math.SQRT2 : 1), STANDARD.range * 2 * (ISO ? Math.SQRT1_2 : 1)).setDepth(-1.5).setVisible(false);
      isoAnchor(ring, { x: s.x, y: s.y });
      this.rings.set(s.id, ring);
    }
    this.prompt.id = "warprompt";
    this.prompt.onclick = () => this.interact();
    this.el.id = "warpanel";
    this.el.hidden = true;
    this.el.addEventListener("mousedown", (ev) => ev.preventDefault());
    hudSlot("promptstack").append(this.prompt);
    document.getElementById("hud")!.append(this.el);
  }

  /** The war snapshot: banners take the holder's colours. */
  setWar(v: WarView) {
    this.view = v;
    for (const s of STANDARDS) {
      const k = CLAN_KEYS[v.owner[s.t]];
      if (!k) continue;
      const key = standardTexture(this.scene, k);
      let img = this.poles.get(s.id);
      if (!img) {
        img = this.scene.add.image(s.x, s.y, key).setOrigin(0.5, 1).setDepth(s.y);
        isoAnchor(img, { x: s.x, y: s.y });
        this.poles.set(s.id, img);
      } else if (img.texture.key !== key) img.setTexture(key);
      this.tint(s.id, this.fronts.get(s.id) ?? k);
    }
    this.syncHolds(this.hero);
    if (this.open) this.render();
  }

  /** A ring in a clan's colour: the land's holder, or whoever holds that front in a live siege battle. */
  private tint(id: number, k: ClanKey) {
    const cl = CLANS[k], col = k === "redfang" ? cl.sigil : cl.trim, front = this.fronts.has(id);
    this.rings.get(id)?.setVisible(true).setFillStyle(col, front ? 0.14 : 0.07).setStrokeStyle(front ? 3 : 2, col, front ? 0.8 : 0.45);
  }

  /** The server's live siege battle: each front's ring takes its holder's colour (the gate front has no ring). */
  setSiege(m: SiegeView) {
    const old = [...this.fronts.keys()];
    this.fronts.clear();
    for (const f of m.fronts ?? []) {
      if (f.gate || !CLAN_KEYS.includes(f.holder as ClanKey)) continue;
      const s = STANDARDS.find((x) => x.t === m.t && Math.hypot(x.x - f.x, x.y - f.y) < STANDARD.range);
      if (s) this.fronts.set(s.id, f.holder as ClanKey);
    }
    const v = this.view;
    if (!v) return;
    for (const id of new Set([...old, ...this.fronts.keys()])) {
      const k = this.fronts.get(id) ?? CLAN_KEYS[v.owner[STANDARDS[id].t]];
      if (k) this.tint(id, k);
    }
  }

  /**
   * Each land's Hold, drawn from the cells of its holder's fort (holdAssets.ts, shared/war/holdWalls.ts): the same cells
   * the server makes solid. A Hold near the hero is built when seen, rebuilt when the land changes hands, dropped when far.
   * Cheap when nothing is new.
   */
  private syncHolds(me: { x: number; y: number } | undefined) {
    const v = this.view;
    if (!v || !me) return;
    for (const h of HOLDS) {
      const k = CLAN_KEYS[v.owner[h.t]], have = this.holds.get(h.t), d = Math.hypot(h.x - me.x, h.y - me.y);
      if (have && (!k || this.holdClan.get(h.t) !== k || d > HOLD_KEEP)) { have.destroy(); this.holds.delete(h.t); this.holdClan.delete(h.t); }
      if (!k || d > HOLD_RANGE || this.holds.has(h.t)) continue;
      this.holdClan.set(h.t, k);
      this.holds.set(h.t, ISO ? new HoldDraw(this.scene, h.t, k) : this.flatHold(h.t, k));
    }
  }

  /** The top-down view has no iso art: the fort's cells as flat blocks (walls solid, gates and gaps open). */
  private flatHold(t: number, k: ClanKey) {
    const g = this.scene.add.graphics().setDepth(-0.4), f = fortOf(t, k);
    if (f) for (const c of f.cells) {
      const x = (f.cx + c.dx) * TILE, y = (f.cy + c.dy) * TILE;
      if (c.kind === "court") g.fillStyle(CLANS[k].cloth, 0.25).fillRect(x, y, TILE, TILE);
      else if (c.kind === "gate") g.fillStyle(CLANS[k].trim, 0.35).fillRect(x, y, TILE, TILE);
      else if (c.kind !== "gap") g.fillStyle(CLANS[k].trim, 0.9).fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
    }
    return g;
  }

  /** The server's oath state. */
  setClan(m: { clan: ClanKey | ""; next: number; minLevel: number; renown?: number; err?: string }) {
    this.clan = m.clan; this.next = m.next; this.minLevel = m.minLevel; this.renown = m.renown ?? 0; this.err = m.err ?? "";
    if (this.open) this.render();
  }

  /**
   * What the hero standing here does for the war (for the plaque): "" outside a ring.
   */
  standing(me: { x: number; y: number } | undefined): string {
    const s = me && this.ringAt(me.x, me.y), v = this.view;
    if (!s || !v) return "";
    if (!this.clan) return "Swear to a clan to hold this standard";
    const own = CLAN_KEYS[v.owner[s.t]];
    if (own === this.clan) return "You hold the standard: defending";
    const st = { owner: v.owner.map((i) => CLAN_KEYS[i]) } as unknown as WarState;
    return targetsOf(st, this.clan).includes(s.t) ? "You hold the standard: attacking" : "Your clan cannot reach this land yet";
  }

  private ringAt(x: number, y: number) { return STANDARDS.find((s) => Math.hypot(s.x - x, s.y - y) <= STANDARD.range); }

  interact(): boolean {
    if (!this.near) return false;
    this.open = true; this.el.hidden = false; this.err = "";
    this.render();
    this.send("clan");
    return true;
  }

  close() { this.open = false; this.el.hidden = true; }

  private render() {
    const v = this.view, land = (k: ClanKey) => (v ? v.owner.filter((o) => CLAN_KEYS[o] === k).length : 0);
    const wait = this.clan && Date.now() < this.next ? Math.ceil((this.next - Date.now()) / 3_600_000) : 0;
    const t = this.near ? TERRITORIES[this.near.t] : undefined;
    this.el.replaceChildren();
    const h = document.createElement("h2"); h.textContent = t ? `Standard of ${t.name}` : "Clan oath";
    const help = document.createElement("p"); help.className = "help";
    help.textContent = this.clan
      ? `Sworn to ${CLANS[this.clan].name}. Every minute in a ring counts at the next war tick.`
      : `Swear (level ${this.minLevel}+), then stand in a ring: you defend your clan's land and attack next to it.`;
    this.el.append(h, help);
    if (this.clan || this.renown > 0) {
      const r = rankOf(this.renown), up = RENOWN_RANKS[r + 1], rk = document.createElement("p");
      rk.className = "help wr-rank";
      rk.textContent = `Renown ${this.renown}: ${RENOWN_RANKS[r].name}.` + (up ? ` ${up.name} at ${up.at}.` : "");
      this.el.append(rk);
    }
    for (const k of CLAN_KEYS) {
      const cl = CLANS[k], row = document.createElement("div");
      row.className = "wr-row" + (k === this.clan ? " mine" : "");
      const txt = document.createElement("div"); txt.className = "wr-txt";
      const nm = document.createElement("div"); nm.className = "wr-name"; nm.textContent = cl.name;
      const dl = document.createElement("div"); dl.className = "wr-sub"; dl.textContent = `${DOCTRINE_LINE[k]} ${land(k)} lands.`;
      row.title = `Beats ${CLANS[cl.counters].name}.`;
      txt.append(nm, dl);
      const b = document.createElement("button");
      b.textContent = k === this.clan ? "Sworn" : "Swear";
      b.disabled = k === this.clan || wait > 0;
      b.onclick = () => this.send("clan", { swear: k });
      row.append(pennant(k), txt, b);
      this.el.append(row);
    }
    const foot = document.createElement("p"); foot.className = "help";
    foot.textContent = this.err || (wait ? `You can change your oath in ${wait} h.` : "You can change your oath once a day. E or Esc to close");
    if (this.err) foot.classList.add("wr-err");
    this.el.append(foot);
  }

  /** Every frame: the prompt, and the ring of the standard you hold pulses. */
  update(me: { x: number; y: number } | undefined, blocked: boolean, now: number) {
    this.hero = me;
    if (now >= this.holdAt) { this.holdAt = now + 500; this.syncHolds(me); }
    let near: Standard | undefined;
    if (me && !blocked) near = this.ringAt(me.x, me.y);
    if (near !== this.near) { this.near = near; if (!near) this.close(); }
    this.prompt.classList.toggle("open", !!near && !this.open);
    const html = near ? `<kbd>E</kbd> ${this.clan ? "Clan oath" : "Swear to a clan"}` : "";
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
    for (const [id, r] of this.rings) r.setAlpha(near?.id === id && this.clan ? 0.75 + 0.25 * Math.sin(now / 220) : 1);
  }
}
