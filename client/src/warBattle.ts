/**
 * Clan war W5, big battles (client side): the "battle" message (shared/war/battles.ts BattleMsg) kept on the server's
 * clock, the notices at 30 min, 5 min and the start, the top-centre battle bar (men left per side out of the starting
 * count, banner pips, time left) while the hero is in the field or within BATTLE.barTiles of it, the result banner, and
 * the music flag. The map markers (warMap.ts) read `markers`. Draws only: the server decides every number here.
 */
import { BATTLE, type BattleMsg, type BattleView } from "../../shared/war/battles";
import { CLANS, type ClanKey } from "../../shared/war/clans";
import { TERRITORIES } from "../../shared/war/territories";
import { TILE } from "../../shared/constants";
import { CLAN_COL } from "./warMap";
import { setMusicWar } from "./music";
import { setBattleDin, stopBattleDin } from "./sfx";
import { BANNER_FLUTTER, BANNER_FRAME, ensureBattleBannerTextures } from "./battleArt";
import "./warBattle.css";

const KIND_NAME = { pitched: "Pitched battle", storm: "Storming", meet: "Meeting battle" } as const;
const min = (ms: number) => Math.max(0, Math.ceil(ms / 60_000));

/** "9:41" for a time left (ms). */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The notice text for a battle stage: 1 = 30 min, 2 = 5 min, 3 = the start. */
export function battleText(b: BattleView, stage: 1 | 2 | 3, now: number): string {
  const land = TERRITORIES[b.t]?.name ?? "?", vs = `${CLANS[b.a]?.name ?? "?"} against ${CLANS[b.b]?.name ?? "?"}`;
  if (stage === 3) return `The ${KIND_NAME[b.kind].toLowerCase()} for ${land} begins! ${vs}.`;
  return `${KIND_NAME[b.kind]} at ${land} in ${min(b.start - now)} min: ${vs}.`;
}

/** A battle marker for the maps: where, which clan pair, and the label ("Battle 4:10" before, "Battle 7:30" left while fought). */
export interface BattleMark { id: string; x: number; y: number; a: ClanKey; b: ClanKey; state: 0 | 1; ms: number; tip: string }

export class WarBattle {
  private el = document.createElement("div");
  private list: BattleView[] = [];
  /** Server clock minus this one (ms), from the message's `now`. */
  private offset = 0;
  private stage = new Map<string, number>();
  private shown = new Set<string>();
  private done = new Set<string>();
  private first = true;
  private resultUntil = 0;
  private sig = "";
  /** The hero stands in the field of a battle being fought (the scene thins labels and corpses; music plays). */
  inField = false;
  private scene?: Phaser.Scene;
  private poles = new Map<string, Phaser.GameObjects.Sprite>();
  private dinOn = false;

  constructor(private say: (text: string) => void) {
    this.el.id = "warbattle";
    this.el.hidden = true;
    (document.getElementById("hud") ?? document.body).append(this.el);
  }

  /** Gives the module the scene to place the world banner poles in. */
  attach(scene: Phaser.Scene) { this.scene = scene; ensureBattleBannerTextures(scene); }

  /** The three banner poles of battles announced or fought, flapping; gone with the battle. */
  private drawPoles(wall: number) {
    const sc = this.scene, live = new Set<string>();
    if (sc) for (const b of this.list) {
      if (b.state === 2) continue;
      b.banners.forEach(([x, y, holder], i) => {
        const key = `${b.id}:${i}`; live.add(key);
        let sp = this.poles.get(key);
        if (!sp) { sp = sc.add.sprite(x, y, "battle_banner", 0).setOrigin(0.5, 1).setDepth(y); this.poles.set(key, sp); }
        sp.setPosition(x, y).setDepth(y);
        sp.setFrame((holder ? BANNER_FRAME.defender : BANNER_FRAME.attacker) + (Math.floor(wall / 280 + i) % 2 ? BANNER_FLUTTER : 0));
      });
    }
    for (const [k, sp] of this.poles) if (!live.has(k)) { sp.destroy(); this.poles.delete(k); }
  }

  /** Din volume at the hero: full inside the field box, fading to nothing 30 tiles out. */
  private dinVol(b: BattleView, me: { x: number; y: number }): number {
    let d: number;
    if (b.box) {
      const [tx, ty, w, h] = b.box, px = me.x / TILE, py = me.y / TILE;
      d = Math.hypot(Math.max(tx - px, 0, px - (tx + w)), Math.max(ty - py, 0, py - (ty + h)));
    } else d = Math.max(0, Math.hypot(me.x - b.x, me.y - b.y) / TILE - 14);
    return Math.max(0, Math.min(1, 1 - d / 30));
  }

  setMsg(m: BattleMsg, wall = Date.now()) {
    if (!m || !Array.isArray(m.list)) return;
    if (typeof m.now === "number" && Number.isFinite(m.now)) this.offset = m.now - wall;
    this.list = m.list;
    const now = wall + this.offset;
    for (const b of m.list) { // what is already past when the hero joins is not announced
      if (this.stage.has(b.id)) continue;
      this.stage.set(b.id, this.first ? this.stageOf(b, now) : 0);
    }
    this.first = false;
  }

  private stageOf(b: BattleView, now: number): number {
    return b.state > 0 || now >= b.start ? 3 : b.start - now <= BATTLE.remindMs ? 2 : b.start - now <= BATTLE.noticeMs ? 1 : 0;
  }

  /** The battle being fought now (state 1), if any: the painted reserve ranks stand for it. */
  fighting(): BattleView | undefined { return this.list.find((b) => b.state === 1); }

  /** Battles to mark on the maps: announced and fought ones, under fog. */
  markers(wall = Date.now()): BattleMark[] {
    const now = wall + this.offset, out: BattleMark[] = [];
    for (const b of this.list) {
      if (b.state === 2) continue;
      const ms = b.state === 0 ? b.start - now : b.end - now, land = TERRITORIES[b.t]?.name ?? "?";
      out.push({ id: b.id, x: b.x, y: b.y, a: b.a, b: b.b, state: b.state as 0 | 1, ms,
        tip: `${KIND_NAME[b.kind]} at ${land}: ${CLANS[b.a]?.name} against ${CLANS[b.b]?.name}, ${b.state === 0 ? "starts in" : "ends within"} ${clock(ms)}` });
    }
    return out;
  }

  private inside(b: BattleView, me: { x: number; y: number }): boolean {
    if (b.box) { const [tx, ty, w, h] = b.box, px = me.x / TILE, py = me.y / TILE; return px >= tx - 1 && py >= ty - 1 && px < tx + w + 1 && py < ty + h + 1; }
    return Math.hypot(me.x - b.x, me.y - b.y) <= 14 * TILE;
  }

  /** Per frame: notices, the bar, the result banner and the music flag. `me` is the living hero in world px. */
  update(me: { x: number; y: number } | undefined, wall = Date.now()) {
    const now = wall + this.offset;
    let bar: BattleView | undefined, field = false, din = 0;
    this.drawPoles(wall);
    for (const b of this.list) {
      const st = this.stage.get(b.id) ?? 0, want = this.stageOf(b, now);
      if (b.state === 2 && !this.done.has(b.id)) {
        this.done.add(b.id);
        if (this.shown.has(b.id)) this.result(b);
      }
      if (want > st && b.state !== 2) { this.stage.set(b.id, want); if (st < want) this.say(battleText(b, want as 1 | 2 | 3, now)); }
      if (b.state === 1 && me) {
        din = Math.max(din, this.dinVol(b, me));
        if (this.inside(b, me)) field = true;
        if (field || Math.hypot(me.x - b.x, me.y - b.y) <= BATTLE.barTiles * TILE) bar = b;
      }
    }
    if (din > 0.01) { setBattleDin(din); this.dinOn = true; } else if (this.dinOn) { stopBattleDin(); this.dinOn = false; }
    if (this.inField !== field) { this.inField = field; setMusicWar(field); }
    if (this.resultUntil && wall < this.resultUntil) return;
    if (this.resultUntil) { this.resultUntil = 0; this.sig = ""; }
    if (!bar) { if (!this.el.hidden) this.el.hidden = true; return; }
    this.shown.add(bar.id);
    this.bar(bar, now);
  }

  private bar(b: BattleView, now: number) {
    const k = `${b.id}|${b.men}|${b.banners.map((x) => x[2])}`;
    if (this.sig !== k || !this.el.firstChild) {
      this.sig = k;
      const row = (c: ClanKey, men: number, men0: number) =>
        `<div class="wb-row"><span class="wb-side" style="color:${CLAN_COL[c]}">${CLANS[c]?.name ?? "?"}</span><span class="wb-bar"><i style="width:${Math.round(100 * Math.min(1, men / Math.max(1, men0)))}%;background:${CLAN_COL[c]}"></i><b style="left:${BATTLE.breakAt * 100}%"></b></span><span class="wb-n">${Math.max(0, Math.round(men))}</span></div>`;
      const pips = b.banners.map((x) => `<i style="background:${CLAN_COL[x[2] ? b.b : b.a]}"></i>`).join("");
      this.el.className = "";
      this.el.innerHTML = `<div class="wb-head"><span>${KIND_NAME[b.kind]}: ${TERRITORIES[b.t]?.name ?? "?"}</span><span class="wb-time"></span></div>${row(b.a, b.men[0], b.men0[0])}${row(b.b, b.men[1], b.men0[1])}<div class="wb-pips">${pips}</div>`;
    }
    (this.el.querySelector(".wb-time") as HTMLElement).textContent = clock(b.end - now);
    this.el.hidden = false;
  }

  private result(b: BattleView) {
    const win = b.result === "att" ? b.a : b.result === "def" ? b.b : undefined, land = TERRITORIES[b.t]?.name ?? "?";
    this.el.className = "result";
    this.el.innerHTML = `<div class="wb-res">${win ? `${CLANS[win]?.name} win!` : "A draw!"}</div><div class="wb-sub">The ${KIND_NAME[b.kind].toLowerCase()} for ${land} is over. ${b.men[0]} against ${b.men[1]} men left.</div>`;
    this.el.hidden = false;
    this.resultUntil = Date.now() + 8000;
  }
}
