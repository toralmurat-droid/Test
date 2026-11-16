/**
 * Capturable towns on the client (W6; the server decides in server/warTowns.ts, rules in shared/war/towns.ts). Look and
 * input only, all from the "towns" message: the holder's banners at each town's banner spots, a cosmetic town watch
 * (two standing soldiers per gate, in the holder's painted sheets, gone while the gate is contested: the real guard
 * stands there then), an "E Raise your banner" prompt and progress bar at a contested town's gate for heroes sworn to the
 * contesting clan ("townclaim" message), short notices, and the lines the plaque, the maps and the stewards read.
 */
import Phaser from "phaser";
import { CLANS, CLAN_KEYS, type ClanKey } from "../../shared/war/clans";
import { cleanTownsMsg, gatePx, TOWN, TOWNS, townPrice, type Town, type TownsMsg } from "../../shared/war/towns";
import { stewardLine, stewardName, stewardSprite, STEWARD_CONTESTED, STEWARD_SWORN, STEWARD_WANTED } from "../../shared/war/townText";
import { TILE } from "../../shared/constants";
import { isoAnchor, setBaseDepth } from "./iso";
import { registerTownBanners, townBannerKey } from "./townBanners";
import { MOB_LOOK, warSoldierTexture } from "./textures";
import { TROOP_LOOK } from "../../shared/war/patrols";
import { SMOOTH } from "./isoflag";
import { hudSlot } from "./hudSlots";
import { play } from "./sfx";
import "./warTowns.css";

export interface TownsHost {
  /** The hero's oath ("" or undefined: unsworn). */
  clan(): ClanKey | "" | undefined;
  send(type: string, msg?: unknown): void;
  /** Is this hero an enemy of clan k (Wanted or at war)? Its steward only has a cold word. */
  hostile?(k: ClanKey): boolean;
  /** Notice text (a soft horn), shown wherever the hero is. */
  say?(text: string): void;
}

/** What the maps, the plaque and the stewards read about one town. */
export interface TownInfo { town: Town; holder: ClanKey; by?: ClanKey; until?: number; raise?: number }

interface Mine { id: string; progress: number; state: "raise" | "paused" | "done" | "stop" }
const WATCH_RANGE = 45 * TILE, BANNER_SCALE = 0.75, FRAME_DOWN = 0;

export class WarTowns {
  private list = new Map<string, TownInfo>();
  private banners = new Map<string, Phaser.GameObjects.Image[]>();
  private watch = new Map<string, { spr: Phaser.GameObjects.Sprite; art: string; dx: number; dy: number; on: boolean }[]>();
  private mine?: Mine;
  private prompt = document.createElement("div");
  private bar = document.createElement("div");
  private err = ""; private errUntil = 0;
  private shown = "";
  private nextCreak = 0;
  private first = true;
  /** The town whose gate the hero stands at and may raise a banner over. */
  near?: Town;

  constructor(private scene: Phaser.Scene, private h: TownsHost) {
    registerTownBanners(scene);
    this.prompt.id = "townprompt";
    this.prompt.onclick = () => this.interact();
    this.bar.id = "townbar"; this.bar.hidden = true;
    hudSlot("promptstack").append(this.prompt, this.bar);
  }

  /** The server's "towns" message (on join, on change, each tick). */
  setTowns(m: unknown) {
    const { list } = cleanTownsMsg(m);
    const next = new Map<string, TownInfo>();
    for (const e of list) {
      const town = TOWNS.find((t) => t.id === e.id), holder = CLAN_KEYS[e.k];
      if (!town || !holder) continue;
      next.set(e.id, { town, holder, by: e.c ? CLAN_KEYS[e.c.by] : undefined, until: e.c?.until, raise: e.raise });
    }
    if (!this.first) for (const [id, n] of next) this.notice(this.list.get(id), n);
    this.first = false;
    this.list = next;
    this.drawBanners();
  }

  /** The server's "townclaim" message to this hero: progress, a pause, the end, or why not (id "" with err). */
  setClaim(m: unknown) {
    const o = m && typeof m === "object" ? (m as { id?: unknown; progress?: unknown; state?: unknown; err?: unknown }) : {};
    if (typeof o.err === "string" && o.err) { this.err = o.err; this.errUntil = Date.now() + 4000; }
    if (typeof o.id !== "string" || !o.id) return;
    const state = o.state === "paused" || o.state === "done" || o.state === "stop" ? o.state : "raise";
    const p = Number(o.progress) || 0;
    this.mine = state === "stop" ? undefined : { id: o.id, progress: Math.max(0, Math.min(1, p > 1 ? p / 100 : p)), state };
    if (state === "done") window.setTimeout(() => { if (this.mine?.state === "done") this.mine = undefined; }, 2500);
  }

  private notice(was: TownInfo | undefined, now: TownInfo) {
    const name = now.town.name.replace(/^the /, "").replace(/^./, (c) => c.toUpperCase());
    if (was && was.holder !== now.holder) this.h.say?.(`${name} now flies the ${CLANS[now.holder].name} banner!`);
    else if (now.by && was?.by !== now.by) this.h.say?.(`${CLANS[now.by].name} contest ${name}. Their banner can be raised at the gate.`);
    else if (was?.by && !now.by) this.h.say?.(`${name} stays with ${CLANS[now.holder].name}.`);
  }

  info(id: string): TownInfo | undefined { return this.list.get(id); }
  all(): IterableIterator<TownInfo> { return this.list.values(); }
  /** The hero's price at the town's shops (shared townPrice: the server charges the same). */
  price(base: number, town: Town | undefined): number {
    const i = town && this.list.get(town.id), c = this.h.clan();
    return townPrice(base, town, i ? i.holder : undefined, c || undefined);
  }
  /** Does the hero get the discount at this town? */
  discount(id: string): boolean { const i = this.list.get(id), c = this.h.clan(); return !!i && !!c && i.holder === c; }

  /** The E key (or a click on the prompt): ask to raise the banner at this gate. True when it handled the key. */
  interact(): boolean {
    if (!this.near || this.mine) return false;
    this.h.send("townclaim", { id: this.near.id });
    return true;
  }

  /** A line for the war plaque while the hero is in the gate's neighbourhood ("" when nothing). */
  line(id: string): string {
    const r = this.list.get(id)?.raise;
    return r !== undefined ? `A banner is going up at the gate: ${r}%` : "";
  }

  private drawBanners() {
    for (const [id, imgs] of this.banners) if (!this.list.has(id)) { for (const i of imgs) i.destroy(); this.banners.delete(id); }
    for (const [id, i] of this.list) {
      const key = townBannerKey(i.holder);
      let imgs = this.banners.get(id);
      if (!imgs) {
        imgs = i.town.banners.map((b) => {
          const x = (b.x + 0.5) * TILE, y = (b.y + 0.5) * TILE;
          const img = this.scene.add.image(x, y, key).setOrigin(0.5, 1).setScale(BANNER_SCALE);
          isoAnchor(img, { x, y }); setBaseDepth(img, y);
          return img;
        });
        this.banners.set(id, imgs);
      } else for (const img of imgs) if (img.texture.key !== key) img.setTexture(key);
    }
  }

  /** The watch: two soldiers standing at each uncontested town's gate, made when the hero is near. */
  private drawWatch(me: { x: number; y: number } | undefined) {
    for (const i of this.list.values()) {
      const g = gatePx(i.town), near = !!me && Math.hypot(g.x - me.x, g.y - me.y) < WATCH_RANGE && !i.by && SMOOTH;
      let men = this.watch.get(i.town.id);
      if (!near) { if (men) for (const m of men) m.spr.setVisible(false); continue; }
      const art = TROOP_LOOK[i.holder].kinds[0];
      if (!men) {
        men = [-1, 1].map((s) => ({ spr: this.scene.add.sprite(0, 0, "__DEFAULT").setVisible(false), art: "", dx: s * 0.9 * TILE, dy: 0, on: false }));
        this.watch.set(i.town.id, men);
      }
      for (const m of men) {
        if (m.art !== art) { m.art = art; m.on = false; }
        if (!m.on) {
          const tex = warSoldierTexture(this.scene, art); // fetched on first sight; hidden until it is here
          if (!tex) { m.spr.setVisible(false); continue; }
          m.spr.setTexture(tex, FRAME_DOWN).setOrigin(0.5, MOB_LOOK[art]?.oy ?? 0.9375).setFlipX(false);
          m.spr.setPosition(g.x + m.dx, g.y + m.dy); isoAnchor(m.spr, { x: g.x + m.dx, y: g.y + m.dy }); setBaseDepth(m.spr, g.y + m.dy);
          m.on = true;
        }
        m.spr.setVisible(true);
      }
    }
  }

  /** Every frame: the watch, the prompt at a contested gate, the hero's progress bar, the creak of banners going up near. */
  update(me: { x: number; y: number } | undefined, blocked: boolean, now = Date.now()) {
    this.drawWatch(me);
    const clan = this.h.clan();
    let near: Town | undefined;
    if (me && !blocked && clan) for (const i of this.list.values()) {
      if (!i.by || i.by !== clan) continue;
      const g = gatePx(i.town);
      if (Math.hypot(g.x - me.x, g.y - me.y) <= TOWN.useTiles * TILE) { near = i.town; break; }
    }
    this.near = near;
    this.prompt.classList.toggle("open", !!near && !this.mine);
    const html = near ? `<kbd>E</kbd> Raise your banner at the gate of ${near.name}` : "";
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
    const m = this.mine, err = now < this.errUntil ? this.err : "";
    const pct = m ? Math.round(m.progress * 100) : 0;
    const text = m ? (m.state === "done" ? "Your banner flies over the town!" : m.state === "paused" ? `Held up: defenders at the gate · ${pct}%` : `Raising your banner · ${pct}%`) : err;
    const key = `${text}|${m?.state ?? ""}|${pct}`;
    if (key !== this.shown) {
      this.shown = key;
      this.bar.hidden = !text;
      this.bar.className = m ? m.state : "err";
      this.bar.replaceChildren();
      const label = document.createElement("div"); label.textContent = text;
      this.bar.append(label);
      if (m) { const track = document.createElement("div"); track.className = "tb-track"; const fill = document.createElement("i"); fill.style.width = `${pct}%`; track.append(fill); this.bar.append(track); }
    }
    if (me && now >= this.nextCreak) for (const i of this.list.values()) {
      const g = gatePx(i.town);
      if (i.raise === undefined || Math.hypot(g.x - me.x, g.y - me.y) > 9 * TILE) continue;
      this.nextCreak = now + 1400;
      play("banner_raise", g.x, g.y, 0.8, undefined, { key: "bannerraise", minGap: 1000 });
      break;
    }
  }

  /** What the steward of town `id` is and says now (name, sheet, talk lines), or undefined without a towns view. */
  steward(id: string, seed = 0): { name: string; sprite: string; text: string[] } | undefined {
    const i = this.list.get(id);
    if (!i) return undefined;
    const name = stewardName(i.holder, i.town.id), c = this.h.clan();
    const text = this.h.hostile?.(i.holder) ? [STEWARD_WANTED] : [stewardLine(i.holder, i.town.name.replace(/^the /, "the "), seed)];
    if (i.by && !this.h.hostile?.(i.holder)) text.push(STEWARD_CONTESTED.replace(/\{by\}/g, CLANS[i.by].name));
    if (c && c === i.holder && TOWN.live && !this.h.hostile?.(i.holder)) text.push(STEWARD_SWORN);
    return { name, sprite: stewardSprite(i.holder), text };
  }

  /** The steward's name for a town (the holder's), or undefined without a towns view. */
  stewardOf(id: string): string | undefined { const i = this.list.get(id); return i && stewardName(i.holder, i.town.id); }
}

export type { TownsMsg };
