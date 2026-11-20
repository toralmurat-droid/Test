import Phaser from "phaser";
import { icon as pxIcon } from "./pixelicons";
import { ART_K as K } from "../../shared/constants";
import { PORTAL_COMBAT_MS, PORTAL_RANGE, PORTALS, portalById, type Portal } from "../../shared/portals";
import { dropPortalTexture, portalTexture, PORTAL_FOOT } from "./portalArt";

/** ?look=... (map viewing aid): paint every stone up front, so a parked camera sees them. */
const PORTAL_LOOK = new URLSearchParams(location.search).has("look");
import { isoAnchor } from "./iso";
import { pixelText } from "./pixeltext";
import type { MapMarker } from "./minimap";
import { hudSlot } from "./hudSlots";

/**
 * Portal stones (shared/portals.ts). Stones this hero has not found stand dark; walking up to one wakes it (the server
 * decides and saves it) and it burns orange from then on. At a woken stone, E (or a click on the prompt) opens the
 * travel list: only the stones this hero has woken, so the rest of the network stays a secret until found.
 */
const SCALE = 0.62;
type Stone = { img: Phaser.GameObjects.Sprite; glow: Phaser.GameObjects.Image; p: Portal; v: number; shown: string };

export class PortalLayer {
  private stones = new Map<string, Stone>();
  private found = new Set<string>();
  private prompt = document.createElement("div");
  private menu = document.createElement("div");
  private toast = document.createElement("div");
  private at?: Portal; // the stone we stand at
  private hurtAt = 0;
  near = false;

  constructor(private scene: Phaser.Scene, private send: (type: string, msg?: unknown) => void) {
    PORTALS.forEach((p, v) => {
      // each stone is worn its own way; its art is painted only once a hero comes near (see show())
      const img = scene.add.sprite(p.x, p.y, "__DEFAULT").setOrigin(0.5, PORTAL_FOOT).setScale(SCALE).setDepth(p.y).setVisible(false);
      const glow = scene.add.image(p.x, p.y - 26, "glow").setTint(0xff8a24).setScale(5 * K).setAlpha(0.24)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(-0.8).setVisible(false);
      isoAnchor(glow, { x: p.x, y: p.y });
      scene.tweens.add({ targets: glow, alpha: 0.36, scale: 5.5 * K, duration: 1600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.stones.set(p.id, { img, glow, p, v, shown: "" });
    });
    const hud = document.getElementById("hud")!;
    this.prompt.id = "portalprompt";
    this.prompt.onclick = () => this.interact();
    this.menu.id = "portalmenu";
    this.menu.hidden = true;
    this.menu.addEventListener("mousedown", (ev) => ev.preventDefault()); // never take focus from the game
    this.menu.addEventListener("click", (ev) => {
      const b = (ev.target as HTMLElement).closest("button");
      if (!b) return;
      if (b.dataset.to) this.send("travel", { to: b.dataset.to });
      this.close();
    });
    this.toast.id = "portaltoast";
    hudSlot("promptstack").append(this.prompt);
    hud.append(this.menu, this.toast);
  }

  get isOpen() { return !this.menu.hidden; }

  /** Woken portals of this hero, from the server; `woke` = the one just found. */
  setFound(ids: string[], woke?: string) {
    this.found = new Set(ids);
    // the stones already painted are repainted by update(), one per frame: their ring blocks show the woken portals
    const p = portalById(woke);
    if (p) {
      this.burst(p, 26);
      this.toast.replaceChildren(pixelText("Portal awakened", "#ffa22e", 13, 3), pixelText(p.name, "#ffffff", 11, 2));
      this.toast.classList.remove("show"); void this.toast.offsetWidth; this.toast.classList.add("show");
      clearTimeout((this.toast as any)._t);
      (this.toast as any)._t = setTimeout(() => this.toast.classList.remove("show"), 3200);
    }
    if (this.isOpen) this.render();
  }

  /** We just took a hit: the stones won't open for a moment. */
  hurt() { this.hurtAt = Date.now(); }

  /** Someone stepped through: sparks at both ends. */
  travelled(from: string, to: string) {
    const a = portalById(from), b = portalById(to);
    if (a) this.burst(a, 18);
    if (b) this.burst(b, 22);
  }

  private burst(p: Portal, n: number) {
    const cy = p.y - 30;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 18;
      const sp = this.scene.add.rectangle(p.x, cy, 2, 2, Math.random() < 0.6 ? 0xffa22e : 0xfff0a8).setDepth(6000).setBlendMode(Phaser.BlendModes.ADD);
      isoAnchor(sp, { x: p.x, y: p.y });
      this.scene.tweens.add({ targets: sp, x: p.x + Math.cos(a) * r, y: cy + Math.sin(a) * r - 10, alpha: 0,
        duration: 800 + Math.random() * 600, ease: "Sine.easeOut", onComplete: () => sp.destroy() });
    }
  }

  interact(): boolean {
    if (!this.near || !this.at) return false;
    if (this.isOpen) { this.close(); return true; }
    this.menu.hidden = false;
    this.render();
    return true;
  }

  close() { this.menu.hidden = true; }

  private render() {
    const here = this.at;
    const list = PORTALS.filter((p) => this.found.has(p.id));
    const fight = Date.now() - this.hurtAt < PORTAL_COMBAT_MS;
    const rows = list.map((p) => p.id === here?.id
      ? `<div class="pt-row here">${p.name}<span>You are here</span></div>`
      : `<button class="pt-row" data-to="${p.id}"${fight ? " disabled" : ""}>${p.name}<span>Travel</span></button>`).join("");
    const lone = list.length < 2 ? `<p class="pt-note">Find more portal stones out in the wilds to travel between them.</p>` : "";
    const why = fight && list.length > 1 ? `<p class="pt-note warn">The stone will not open while you are fighting.</p>` : "";
    this.menu.innerHTML = `<div class="pt-head"><h2>Portal stones</h2><button class="pt-close" aria-label="Close">${pxIcon("close")}</button></div>${rows}${lone}${why}`;
  }

  /** Map markers for the woken stones. */
  /** The stones this hero has woken (the maps route over them). */
  wokenIds(): ReadonlySet<string> { return this.found; }

  markers(): MapMarker[] {
    return PORTALS.filter((p) => this.found.has(p.id)).map((p) => ({ x: p.x, y: p.y, glyph: "◆", color: "#ff9a3c", label: p.name, layer: "ways" as const }));
  }

  /** The art this stone should show: dark until found, burning once woken, with one ring block lit per woken portal. */
  private want(s: Stone) {
    let mask = 0;
    PORTALS.forEach((q, k) => { if (this.found.has(q.id)) mask |= 1 << k; });
    return { lit: this.found.has(s.p.id), mask, key: `${this.found.has(s.p.id) ? "lit" : "cold"}:${s.v}_${mask}` };
  }

  /** Paints and shows this stone's art for its state, dropping the art it showed before. */
  private show(s: Stone) {
    const w = this.want(s);
    if (s.shown === w.key) return;
    const id = portalTexture(this.scene, s.v, w.lit, w.mask);
    if (w.lit) s.img.play({ key: `portal_spin_${id}`, startFrame: (s.v * 3) % 8 });
    else { s.img.stop(); s.img.setTexture(`portal_cold_${id}`, 0); }
    s.img.setOrigin(0.5, PORTAL_FOOT).setVisible(true);
    s.glow.setVisible(w.lit);
    if (s.shown) { const [st, old] = s.shown.split(":"); dropPortalTexture(this.scene, st === "lit", old); }
    s.shown = w.key;
  }

  update(me: { x: number; y: number } | undefined, blocked: boolean) {
    // paint the art of stones coming into view, or out of date since a portal woke, one per frame (seven worn stones
    // at once would stall the game)
    for (const s of this.stones.values()) {
      if (s.shown ? s.shown === this.want(s).key : !(PORTAL_LOOK || (me && Math.hypot(s.p.x - me.x, s.p.y - me.y) < 30 * 32))) continue;
      this.show(s);
      break;
    }
    let at: Portal | undefined;
    if (me) for (const p of PORTALS) if (this.found.has(p.id) && Math.hypot(p.x - me.x, p.y - me.y) <= PORTAL_RANGE) at = p;
    if (at !== this.at) { this.at = at; if (!at) this.close(); else if (this.isOpen) this.render(); }
    this.near = !blocked && !!at;
    this.prompt.classList.toggle("open", this.near && !this.isOpen);
    if (this.near && at) {
      const html = `<kbd>E</kbd> Use the portal stone <span class="why">${at.name}</span>`;
      if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
    }
  }
}
