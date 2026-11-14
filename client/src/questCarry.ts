import Phaser from "phaser";
import "./questCarry.css";
import { npcById } from "../../shared/npcs";
import { isoAnchor } from "./iso";
import { CHAR_GROW } from "./artAssets";
import { CarriedLantern } from "./questConceptArt";
import { pixelText } from "./pixeltext";

/** The lantern's quest object (shared/quests.ts LAST_LANTERN): its take-spot copy is hidden while the lantern is out. */
export const LANTERN_OBJECT = "lantern_last";
/** The drop key follows no layout: Z is free in both (client/src/keymode.ts). */
export const DROP_KEY = "Z";
/** Hotbar tooltip lead-in while the lantern is carried (cosmetic: the server blocks the skills). */
export const LOCK_TIP = "Locked while you carry the lantern. Put it down to use skills (basic attacks still work). ";

interface Carry { chain: number; holder: string; x: number; y: number; light: number; max: number }
interface Hold { chain: number; t: number; hp: number; max: number; at: number }
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
    this.btn.id = "qdrop"; this.btn.hidden = true;
    this.btn.innerHTML = `<kbd>${DROP_KEY}</kbd>Put down`;
    this.btn.onclick = (ev) => { ev.stopPropagation(); this.drop(); this.btn.blur(); };
    this.banner.id = "qbanner";
    hud.append(this.btn, this.banner);
  }

  /** "qstate" from the server. */
  onState(m: any) {
    if (!m || typeof m !== "object") return;
    if (m.k === "carry") {
      if (m.end) { this.carry = undefined; if (m.end === "out") this.say("The lantern burnt out", "It is lit again where you found it.", "#f0b030"); return; }
      this.carry = { chain: m.chain, holder: String(m.holder ?? ""), x: +m.x || 0, y: +m.y || 0, light: +m.light || 0, max: +m.max || 100 };
    } else if (m.k === "hold") {
      if (m.on) { this.hold = { chain: m.chain, t: +m.t || 0, hp: +m.hp || 0, max: +m.max || 1, at: this.scene.time.now }; return; }
      this.hold = undefined;
      if (m.end === "done") this.say("The wheel holds!", "Odo is safe. The mill turns again.", "#b9f27c");
      else if (m.end === "fail") this.say("Odo was overrun", "Go back to the mill to try again.", "#ff7a6a");
      else if (m.end === "reset") this.say("The run starts over", "You left the mill. Go back to try again.", "#ffd166");
    }
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
    return html;
  }
}
