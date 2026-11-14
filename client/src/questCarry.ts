import Phaser from "phaser";
import "./questCarry.css";
import { npcById } from "../../shared/npcs";
import { isoAnchor } from "./iso";
import { CHAR_GROW } from "./artAssets";
import { CarriedLantern } from "./questConceptArt";
import { pixelText } from "./pixeltext";
import { chainState, questStep } from "../../shared/quests";
import type { MapMarker } from "./minimap";

/** The lantern's quest object (shared/quests.ts LAST_LANTERN): its take-spot copy is hidden while the lantern is out. */
export const LANTERN_OBJECT = "lantern_last";
/** The drop key follows no layout: Z is free in both (client/src/keymode.ts). */
export const DROP_KEY = "Z";
/** Hotbar tooltip lead-in while the lantern is carried (cosmetic: the server blocks the skills). */
export const LOCK_TIP = "Locked while you carry the lantern. Put it down to use skills (basic attacks still work). ";

interface Carry { key: string; chain: number; holder: string; x: number; y: number; light: number; max: number }
interface Hold { key: string; chain: number; t: number; hp: number; max: number; at: number }
interface Unseen { chain: number; armed: boolean; cp: number; cps: number; cover: boolean; dark: boolean; key: string }
interface Sync { chain: number; turned: [number, number]; window: number; at: number; key: string }
/** Pixel eye for the stealth badge ('#' lid, 'w' white, 'i' iris, 'p' pupil). */
const EYE_OPEN = ["...#####...", ".##wwwww##.", "#wwwiiiwww#", "#wwiippiww#", "#wwwiiiwww#", ".##wwwww##.", "...#####..."];
const EYE_SHUT = ["...........", "...........", ".##.....##.", "#..#####..#", "...........", "...........", "..........."];
const EYE_PX = 3;
function eyeCanvas(rows: string[], iris: string): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = 11; c.height = 7; c.className = "qeye";
  const g = c.getContext("2d")!, col: Record<string, string> = { "#": "#e8e0d0", w: "#f4f0e8", i: iris, p: "#0a0608" };
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (col[ch]) { g.fillStyle = col[ch]; g.fillRect(x, y, 1, 1); } }));
  c.style.width = `${11 * EYE_PX}px`; c.style.height = `${7 * EYE_PX}px`;
  return c;
}
/** Chain key (quest id + stage): changes when the quest moves on, not when a step's count goes up. */
const stepKey = (q: { questId: number; questStage: number } | undefined) => q ? `${q.questId}.${q.questStage}` : "";
type Ent = { sprite: Phaser.GameObjects.Sprite; state?: any };

/**
 * Client side of the carry (The Last Lantern) and hold (Hold the Wheel) quest steps. It only draws what the server's
 * "qstate" messages say: the lantern over its holder or lying on the ground, a light meter and countdown in the quest
 * tracker, Odo's HP bar, banners, the drop button. Taking and dropping are intents ("use" / "qdrop"); the server decides.
 */
export class QuestCarry {
  private carry?: Carry;
  private hold?: Hold;
  private lantern: CarriedLantern;
  private ground: Phaser.GameObjects.Image;
  private groundGlow: Phaser.GameObjects.Arc;
  private odoBar: Phaser.GameObjects.Graphics;
  private odoAt: { x: number; y: number };
  private unseen?: Unseen;
  private sync?: Sync;
  private rings: Phaser.GameObjects.Graphics;
  private sealGlow: Phaser.GameObjects.Arc[];
  private badge = document.createElement("div");
  private vignette = document.createElement("div");
  private eyeOpen = eyeCanvas(EYE_OPEN, "#e0603a");
  private eyeShut = eyeCanvas(EYE_SHUT, "#6fb7d8");
  private badgeText = document.createElement("span");
  private btn = document.createElement("button");
  private banner = document.createElement("div");
  private bannerTimer?: ReturnType<typeof setTimeout>;

  constructor(private scene: Phaser.Scene, hud: HTMLElement, private send: (type: string, msg?: unknown) => void) {
    this.lantern = new CarriedLantern(scene);
    this.ground = scene.add.image(0, 0, "qobj_lamp").setOrigin(0.5, 1).setScale(1.5).setVisible(false);
    this.groundGlow = scene.add.circle(0, 0, 14, 0xffc860, 0.2).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    const odo = npcById("miller")!;
    this.odoAt = { x: odo.x, y: odo.y };
    this.odoBar = isoAnchor(scene.add.graphics(), this.odoAt) as Phaser.GameObjects.Graphics;
    this.odoBar.setDepth(odo.y + 2);
    this.rings = scene.add.graphics().setDepth(2);
    this.sealGlow = [0, 1].map(() => scene.add.circle(0, 0, 16, 0xffd166, 0.3).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    this.badge.id = "qstealth"; this.badge.hidden = true; this.badge.append(this.eyeOpen, this.eyeShut, this.badgeText);
    this.vignette.id = "qvignette";
    this.btn.id = "qdrop"; this.btn.hidden = true;
    this.btn.innerHTML = `<kbd>${DROP_KEY}</kbd>Put down`;
    this.btn.onclick = (ev) => { ev.stopPropagation(); this.drop(); this.btn.blur(); };
    this.banner.id = "qbanner";
    hud.append(this.vignette, this.badge, this.btn, this.banner);
  }

  /** "qstate" from the server. */
  onState(m: any) {
    if (!m || typeof m !== "object") return;
    const key = stepKey(this.lastQ(+m.chain));
    if (m.k === "unseen") {
      if (m.end) {
        this.unseen = undefined;
        if (m.end === "seen") this.say("Seen!", "Dragged back to your last hiding place.", "#ff7a6a");
        else if (m.end === "done") this.say("Not a soul saw you", "You reached the wall unseen.", "#b9f27c");
        return;
      }
      this.unseen = { chain: m.chain, armed: !!m.armed, cp: +m.cp || 0, cps: +m.cps || 4, cover: !!m.cover, dark: !!m.dark, key };
    } else if (m.k === "sync") {
      if (m.end) { this.sync = undefined; if (m.end === "done") this.say("Both seals turned", "The vault door stirs.", "#ffd166"); return; }
      const t = Array.isArray(m.turned) ? m.turned : [];
      this.sync = { chain: m.chain, turned: [+t[0] >= 0 ? +t[0] : -1, +t[1] >= 0 ? +t[1] : -1], window: +m.window || 6000, at: this.scene.time.now, key };
    } else if (m.k === "carry") {
      if (m.end) { this.carry = undefined; if (m.end === "out") this.say("The lantern burnt out", "It is lit again where you found it.", "#f0b030"); return; }
      this.carry = { key, chain: m.chain, holder: String(m.holder ?? ""), x: +m.x || 0, y: +m.y || 0, light: +m.light || 0, max: +m.max || 100 };
    } else if (m.k === "hold") {
      if (m.on) { this.hold = { key, chain: m.chain, t: +m.t || 0, hp: +m.hp || 0, max: +m.max || 1, at: this.scene.time.now }; return; }
      this.hold = undefined;
      if (m.end === "done") this.say("The wheel holds!", "Odo is safe. The mill turns again.", "#b9f27c");
      else if (m.end === "fail") this.say("Odo was overrun", "Go back to the mill to try again.", "#ff7a6a");
      else if (m.end === "reset") this.say("The run starts over", "You left the mill. Go back to try again.", "#ffd166");
    }
  }

  private hero?: any; // the hero's synced state, for the quest checks below
  private lastQ(chain: number) { return Number.isInteger(chain) && chain >= 0 ? chainState(this.hero, chain) : undefined; }

  /**
   * A missing "end" must never leave a stale HUD: a state is dropped when its chain has moved to another quest or stage
   * and that step is no longer of its kind. (A state can arrive just before the patch that starts its step, so a
   * changed key whose step does match just adopts the new key.)
   */
  private expire(kind: string, o: { chain: number; key: string } | undefined): boolean {
    if (!o || !this.hero) return false;
    const q = this.lastQ(o.chain), type = questStep(q)?.type, key = stepKey(q);
    if (type === kind) { o.key = key; return false; }
    return key !== o.key;
  }

  /** Is this hero carrying the lantern (skills are locked; the server enforces it)? */
  carrying(me: string) { return !!this.carry && this.carry.holder === me; }

  /** Intent: put the lantern down (the server checks that we hold it). */
  drop() { this.send("qdrop", {}); }

  private say(big: string, small: string, color: string) {
    this.banner.replaceChildren(pixelText(big, color, 13, 3), pixelText(small, "#ffffff", 11, 2));
    this.banner.classList.remove("show"); void this.banner.offsetWidth; this.banner.classList.add("show");
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.banner.classList.remove("show"), 3800);
  }

  /** Every frame: lantern over its holder or on the ground, Odo's bar, the drop button. True while the take-spot lantern should be hidden. */
  update(me: string, ent: (id: string) => Ent | undefined): boolean {
    this.hero = ent(me)?.state;
    if (this.expire("carry", this.carry)) this.carry = undefined;
    if (this.expire("hold", this.hold)) this.hold = undefined;
    if (this.expire("unseen", this.unseen)) this.unseen = undefined;
    if (this.expire("sync", this.sync)) this.sync = undefined;
    this.drawUnseen(); this.drawSync();
    const c = this.carry, holder = c?.holder ? ent(c.holder) : undefined;
    const light = c ? Math.max(0, Math.min(1, c.light / c.max)) : 0;
    if (c && holder && holder.sprite.visible && !holder.state?.dead) this.lantern.update(holder.sprite, light);
    else this.lantern.hide();
    if (c && !c.holder) { // lying on the ground: it dims with its light
      this.ground.setTexture(light <= 0.03 ? "qobj_lamp_out" : "qobj_lamp").setPosition(c.x, c.y).setDepth(c.y).setVisible(true);
      isoAnchor(this.groundGlow.setPosition(c.x, c.y - this.ground.displayHeight * 0.6).setDepth(c.y + 1), { x: c.x, y: c.y });
      this.groundGlow.setVisible(light > 0.03).setAlpha(0.06 + 0.26 * light).setScale(0.55 + 0.45 * light);
    } else { this.ground.setVisible(false); this.groundGlow.setVisible(false); }
    this.btn.hidden = !this.carrying(me);
    // Odo's health while a run is on
    const g = this.odoBar.clear(), h = this.hold;
    if (h) {
      const x = this.odoAt.x, y = this.odoAt.y - Math.round(34 * CHAR_GROW), w = 26, f = Math.max(0, Math.min(1, h.hp / h.max));
      g.fillStyle(0x000000, 0.85).fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
      g.fillStyle(0x3a0f0a).fillRect(x - w / 2, y, w, 3);
      g.fillStyle(f > 0.35 ? 0xd8603a : 0xff3d2e).fillRect(x - w / 2, y, Math.round(w * f), 3);
    }
    return !!c;
  }

  private checkpoints() { const u = this.unseen; return u ? questStep(this.lastQ(u.chain))?.unseen?.checkpoints ?? [] : []; }

  private seals() { const sy = this.sync; return sy ? questStep(this.lastQ(sy.chain))?.sync?.seals : undefined; }

  /** Stealth badge and vignette while armed (hidden), soft rings at the checkpoints: next one bright, reached ones dim. */
  private drawUnseen() {
    const u = this.unseen, g = this.rings.clear(), t = this.scene.time.now / 1000;
    this.badge.hidden = !u; this.vignette.classList.toggle("on", !!u?.armed); this.vignette.classList.toggle("deep", !!u?.armed && (u.cover || u.dark));
    if (!u) return;
    const shade = u.cover || u.dark;
    this.eyeOpen.style.display = u.armed ? "none" : ""; this.eyeShut.style.display = u.armed ? "" : "none";
    this.badge.className = u.armed ? (shade ? "deep" : "hid") : "seen";
    this.badgeText.textContent = u.armed ? (shade ? "Hidden: in shadow" : "Hidden") : "In the open";
    this.checkpoints().forEach((c, i) => {
      const next = i === u.cp, done = i < u.cp, col = next ? 0xffe08a : done ? 0x7f8aa0 : 0x5b6578;
      const pulse = next ? 0.5 + 0.2 * Math.sin(t * 3) : 0;
      g.fillStyle(col, next ? 0.2 + 0.1 * Math.sin(t * 3) : done ? 0.1 : 0.08).fillCircle(c.x, c.y, c.r);
      g.lineStyle(next ? 3 : 2, col, next ? 0.6 + pulse * 0.4 : done ? 0.45 : 0.35).strokeCircle(c.x, c.y, c.r);
      if (next) g.lineStyle(1, 0xffe08a, 0.3).strokeCircle(c.x, c.y, c.r * (0.6 + 0.4 * ((t * 0.8) % 1)));
    });
  }

  /** Turned seals glow while inside the window; a ring around each shrinks with the time left. */
  private drawSync() {
    const sy = this.sync, g = this.rings, seals = sy ? this.seals() : undefined;
    this.sealGlow.forEach((c) => c.setVisible(false));
    if (!sy || !seals) return;
    const el = this.scene.time.now - sy.at;
    seals.forEach((o, i) => {
      const left = this.left(sy, i, el);
      if (left <= 0) return;
      const f = left / sy.window;
      isoAnchor(this.sealGlow[i].setPosition(o.x, o.y - 14).setDepth(o.y + 1).setVisible(true).setAlpha(0.18 + 0.2 * f).setScale(0.8 + 0.4 * f), { x: o.x, y: o.y });
      g.lineStyle(2, f > 0.3 ? 0xffd166 : 0xff7a4a, 0.85).beginPath().arc(o.x, o.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f).strokePath();
    });
  }

  /** ms left in a seal's window (0 = not turned / run out), from the msAgo the server sent and the time since. */
  private left(sy: Sync, i: number, el: number) { const a = sy.turned[i]; return a < 0 ? 0 : Math.max(0, sy.window - a - el); }

  /** Minimap and world-map rings for the hiding places that are not already marked as quest targets (the next and last reached are). */
  markers(): MapMarker[] {
    const u = this.unseen;
    return !u ? [] : this.checkpoints().flatMap((c, i) => i < u.cp - 1 ? [{ x: c.x, y: c.y, r: c.r, glyph: "", color: "#7f8aa0", label: c.label }] : []);
  }

  /** Tracker blocks (HTML) for the light meter and the hold countdown; "" when neither is on. */
  trackerBlock(me: string, nameOf: (id: string) => string): string {
    let html = "";
    const c = this.carry;
    if (c) {
      const l = Math.max(0, Math.min(1, c.light / c.max));
      const where = c.holder === me ? `${DROP_KEY}: put it down. Skills are locked.` : c.holder ? `${nameOf(c.holder)} carries it.` : "It lies on the ground: press E beside it.";
      html += `<div class="qt-block"><div class="qt-title">The Last Lantern</div><div class="qt-obj">• Light: ${Math.ceil(c.light)} / ${c.max}</div>` +
        `<div class="qt-bar light${l < 0.25 ? " low" : ""}"><div style="width:${l * 100}%"></div></div><div class="qt-dir">${where}</div></div>`;
    }
    const h = this.hold;
    if (h) {
      const secs = Math.max(0, Math.ceil((h.t - (this.scene.time.now - h.at)) / 1000));
      html += `<div class="qt-block"><div class="qt-title">Hold the Wheel</div><div class="qt-obj">• Hold the mill: ${secs} s</div>` +
        `<div class="qt-bar odo"><div style="width:${Math.max(0, Math.min(1, h.hp / h.max)) * 100}%"></div></div><div class="qt-dir">Odo: ${Math.max(0, Math.ceil(h.hp))} / ${h.max}. Keep the slimes off him.</div></div>`;
    }
    const u = this.unseen;
    if (u) {
      html += `<div class="qt-block"><div class="qt-title">Unseen</div><div class="qt-obj">• Checkpoints ${Math.min(u.cp, u.cps)} / ${u.cps}</div>` +
        `<div class="qt-dir">${u.armed ? (u.cover || u.dark ? "You are hidden in shadow." : "You are hidden.") : "You are in the open."} Stand in the ring to hide.</div></div>`;
    }
    const sy = this.sync;
    if (sy) {
      const el = this.scene.time.now - sy.at, best = Math.max(this.left(sy, 0, el), this.left(sy, 1, el)), secs = Math.round(sy.window / 1000);
      const n = (i: number) => this.left(sy, i, el) > 0;
      html += `<div class="qt-block"><div class="qt-title">Two Hands</div><div class="qt-obj">• Seals: ${n(0) ? "turned" : "still"} / ${n(1) ? "turned" : "still"}</div>` +
        `<div class="qt-bar light${best / sy.window < 0.3 ? " low" : ""}"><div style="width:${(best / sy.window) * 100}%"></div></div><div class="qt-dir">Turn both seals within ${secs} s.</div></div>`;
    }
    return html;
  }
}
