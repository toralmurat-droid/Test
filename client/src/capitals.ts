/**
 * The clans' capital cities on the client (W7; the server decides everything: server/warCapitals.ts, rules in
 * shared/capitals.ts). Look and input only: the city's props (banners, training dummies, weapon racks, the war table, the oath
 * altar), cosmetic guards and townsfolk standing about, the "E Study the war table" prompt, the "city" message (the hero's
 * home, rank and what the leader owes) and the panels of the leader, the oath-keeper and the trainer (npcs.ts shows them).
 */
import Phaser from "phaser";
import { CITIES, CITY, CITY_TEMPLATE, cityAtPx, cityPrice, cityPx, cityText, rankRewardGold, type City, type CityRole } from "../../shared/capitals";
import { CLANS, type ClanKey } from "../../shared/war/clans";
import { RENOWN_RANKS } from "../../shared/war/renown";
import { TROOP_LOOK } from "../../shared/war/patrols";
import { respecCost } from "../../shared/upkeep";
import { TILE } from "../../shared/constants";
import { CITY_PROPS, cityPropKey, cityPropTextures } from "./cityProps";
import { MOB_LOOK, warSoldierTexture } from "./textures";
import { SMOOTH } from "./isoflag";
import { CHAR_ORIGIN, CHAR_SCALE, ensureCharSheet, playCharAnim, type CharacterName } from "./artAssets";
import { hudSlot } from "./hudSlots";
import { icon as pxIcon } from "./pixelicons";

/** The "city" message (server/warCapitals.ts CityView): the hero's standing with the capitals. */
export interface CityState { home: ClanKey | ""; paid: number; rank: number; owed: number; err?: string; text?: string }
export interface CityHost {
  /** The hero's oath. */
  clan(): ClanKey | "" | undefined;
  send(type: string, msg?: unknown): void;
  /** Opens the big map with the war layer on. */
  openWarTable(): void;
}

/** How close (px) a hero must stand to study a war table (it is a wide prop). */
const WARTABLE_REACH = 3 * TILE;
const FRAME: Record<string, number> = { down: 0, up: 2, right: 4, left: 4 };
const FOLK: CharacterName[] = ["villager", "goodwife", "labourer", "peasant", "merchant", "farmwife"] as CharacterName[];
/** Local tiles (feet) and facing of the guards and townsfolk standing about a city (cosmetic: nobody blocks, nobody walks). */
const GUARDS: [number, number, string][] = [[23.3, 37.3, "down"], [28.7, 37.3, "down"], [23.3, 16, "right"], [28.7, 16, "left"], [24, 7.4, "down"], [29, 7.4, "down"], [5.5, 15.2, "up"], [11.5, 15.2, "up"], [41.5, 10.4, "down"], [47, 10.4, "down"]];
const FOLKS: [number, number, string][] = [[4.5, 34, "down"], [11.5, 34.6, "left"], [13.6, 32.6, "down"], [29.5, 31.5, "left"], [21.2, 35.6, "right"], [41.4, 36.6, "right"], [46, 35.8, "down"], [14.5, 25.9, "right"]];

interface Man { spr: Phaser.GameObjects.Sprite; x: number; y: number; dir: string; art?: string; sheet?: CharacterName; on: boolean }

export class CityLayer {
  state?: CityState;
  /** Bumped when the "city" message changes (npcs.ts redraws its panel). */
  rev = 0;
  /** A short note (the leader's line, an error) for the open panel, with its time. */
  note?: { text: string; err: boolean; at: number };
  /** The war table the hero stands at. */
  nearTable = false;
  private men: Man[] = [];
  /** The cities whose props and people are placed (by clan). */
  private built = new Set<ClanKey>();
  private prompt = document.createElement("div");
  private tables: { x: number; y: number }[] = [];
  /** Animated props (flames, cloth): stepped about 6 times a second. */
  private anim: { spr: Phaser.GameObjects.Sprite; frames: number; ph: number }[] = [];

  constructor(private scene: Phaser.Scene, private h: CityHost) {
    this.prompt.id = "cityprompt";
    this.prompt.onclick = () => this.interact();
    hudSlot("promptstack").append(this.prompt);
  }

  /** The server's "city" message. */
  setCity(m: unknown) {
    const o = m && typeof m === "object" ? (m as Record<string, unknown>) : {};
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    this.state = { home: typeof o.home === "string" ? (o.home as ClanKey | "") : "", paid: num(o.paid), rank: num(o.rank), owed: num(o.owed), err: typeof o.err === "string" ? o.err : undefined, text: typeof o.text === "string" ? o.text : undefined };
    const t = this.state.err ?? this.state.text;
    if (t) this.note = { text: t, err: !!this.state.err, at: Date.now() };
    this.rev++;
  }

  /** The war table prompt's E: opens the big map on the war layer. True when it took the key. */
  interact(): boolean {
    if (!this.nearTable) return false;
    this.h.openWarTable();
    return true;
  }

  /** Where the war tables are (px), for clicking them. */
  tablesPx() { return this.tables; }

  /** A city's props in its clan's colours, baked and placed the first time the hero comes near it (update). */
  private props(c: City) {
    cityPropTextures(this.scene, c.clan);
    for (const p of CITY_TEMPLATE.props) {
      if (p.kind === "stash") continue; // the account stash chest is drawn by trade.ts
      const s = p.solid, fx = s ? s[0] + s[2] / 2 : p.x + 0.5, fy = s ? s[1] + s[3] : p.y + 0.9, at = cityPx(c, fx, fy), a = CITY_PROPS[p.kind];
      const spr = this.scene.add.sprite(at.x, at.y, cityPropKey(p.kind, c.clan), 0).setOrigin(a.ox / a.w, a.oy / a.h).setDepth(at.y);
      if (a.frames > 1) this.anim.push({ spr, frames: a.frames, ph: Math.floor((p.x * 7 + p.y * 3) % a.frames) });
      if (p.kind === "wartable") this.tables.push({ x: at.x, y: at.y - 6 });
      if (p.kind === "altar") {
        const glow = this.scene.add.image(at.x, at.y - 30, "glow").setTint(0xffc060).setScale(1.6).setAlpha(0.2).setBlendMode(Phaser.BlendModes.ADD).setDepth(at.y + 1);
        this.scene.tweens.add({ targets: glow, alpha: 0.34, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      }
    }
  }

  private man(c: City, [x, y, dir]: [number, number, string], i: number, guard: boolean): Man {
    const at = cityPx(c, x, y);
    const spr = this.scene.add.sprite(at.x, at.y, "__DEFAULT").setVisible(false).setDepth(at.y);
    return { spr, x: at.x, y: at.y, dir, on: false, art: guard ? TROOP_LOOK[c.clan].kinds[0] : undefined, sheet: guard ? undefined : FOLK[i % FOLK.length] };
  }

  private ready(m: Man) {
    if (m.on) return;
    if (m.art) { // a clan soldier's painted sheet, fetched on first sight
      if (!SMOOTH) return;
      const tex = warSoldierTexture(this.scene, m.art);
      if (!tex) return;
      m.spr.setTexture(tex, FRAME[m.dir] ?? 0).setOrigin(0.5, MOB_LOOK[m.art]?.oy ?? 0.9375).setFlipX(m.dir === "left").setVisible(true);
    } else if (m.sheet) {
      const sh = m.sheet;
      if (!ensureCharSheet(this.scene, sh, () => { m.on = false; }, 400)) return;
      m.spr.setOrigin(CHAR_ORIGIN.x, CHAR_ORIGIN.y).setScale(CHAR_SCALE).setTexture(sh, 0).setVisible(true);
      playCharAnim(m.spr, sh, "idle", m.dir);
    }
    m.on = true;
  }

  /** Every frame: the guards and townsfolk of a city the hero is near, the war table prompt. */
  update(me: { x: number; y: number } | undefined, blocked: boolean) {
    const tick = Math.floor(performance.now() / 160);
    for (const a of this.anim) a.spr.setFrame((tick + a.ph) % a.frames);
    if (me) for (const c of CITIES) { // a city's props and people appear when the hero comes within sight of its plot
      if (this.built.has(c.clan)) continue;
      const p = cityPx(c, 26, 20);
      if (Math.hypot(p.x - me.x, p.y - me.y) >= 45 * TILE) continue;
      this.built.add(c.clan);
      this.props(c);
      GUARDS.forEach((g, i) => this.men.push(this.man(c, g, i, true))); FOLKS.forEach((f, i) => this.men.push(this.man(c, f, i, false)));
    }
    if (me && this.built.size) for (const m of this.men) this.ready(m);
    const inCity = !!me && !!cityAtPx(me.x, me.y);
    this.nearTable = inCity && !blocked && this.tables.some((t) => Math.hypot(t.x - me!.x, t.y - me!.y) <= WARTABLE_REACH);
    this.prompt.classList.toggle("open", this.nearTable);
    const html = this.nearTable ? `<kbd>E</kbd> Study the war table` : "";
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
  }

  /**
   * The panel of a city NPC other than the quartermaster (npcs.ts draws it in its dialog): returns the page's HTML and the
   * actions its buttons send. `hero` is what the panel needs of the player: level, gold, oath.
   */
  panel(city: City, role: CityRole, hero: { level: number; gold: number }): { html: string; acts: Record<string, () => void>; sig: string } {
    const clan = this.h.clan() || undefined, t = cityText(city), name = CLANS[city.clan].name.replace(/^The /, "the "), sv = this.state;
    const sworn = clan === city.clan, coin = pxIcon("coin");
    const note = this.note && Date.now() - this.note.at < 12_000 ? `<p class="${this.note.err ? "cp-err" : "cp-ok"}">${this.note.text}</p>` : "";
    const btn = (act: string, label: string, off = false, cls = "nd-accept") => `<button class="${cls}" data-act="${act}"${off ? " disabled" : ""}>${label}</button>`;
    const acts: Record<string, () => void> = {};
    let body = "", btns = "";
    if (role === "leader") {
      const owed = sworn && sv ? sv.owed : 0, rank = sv ? RENOWN_RANKS[Math.min(sv.rank, RENOWN_RANKS.length - 1)].name : "";
      body = `<p>${t.leaderGreeting}</p>` + (sworn
        ? `<p class="sh-empty">You stand ${rank ? `as ${rank}` : "sworn"} of ${name}. ${owed > 0 ? `The hall owes you <b>${owed}</b>${coin}.` : "The hall owes you nothing now."}</p>` +
          (sv && sv.rank >= CITY.titleRank ? `<p class="sh-empty">At Banneret and above the leader names you ${t.title}.</p>` : `<p class="sh-empty">Every rank you earn is paid once: ${CITY.rankGold.slice(1).join(", ")} gold, then at Banneret the title ${t.title}.</p>`)
        : `<p class="sh-empty">${t.npcs.leader[0]} rewards only those sworn to ${name}. Swear at the altar in ${t.districts.hall}.</p>`);
      btns = btn("reward", `Claim reward${owed > 0 ? ` (${owed})` : ""}`, !sworn);
      acts.reward = () => this.h.send("cityreward");
    } else if (role === "oathkeeper") {
      const home = sv?.home === city.clan;
      body = `<p>${t.oathGreeting}</p>` +
        `<p class="sh-empty">${clan ? `You are sworn to ${CLANS[clan].name.replace(/^The /, "the ")}.` : "You have sworn no oath."}${home ? ` ${t.name} is your home.` : ""}${clan ? "" : ` A hero of level ${CITY.minLevel} or more may swear.`}</p>`;
      btns = (sworn ? "" : btn("oath", `Swear to ${name}`)) + (home ? btn("unhome", `Leave ${t.name} as home`, false, "nd-bye") : btn("home", `Make ${t.name} my home`, !sworn));
      acts.oath = () => this.h.send("cityoath");
      acts.home = () => this.h.send("cityhome", { on: true });
      acts.unhome = () => this.h.send("cityhome", { on: false });
    } else {
      const base = respecCost(hero.level), price = cityPrice(base, city, clan), cut = price < base;
      const cost = price ? `<b>${price}</b>${coin}${cut ? ` <s>${base}</s> (${Math.round(CITY.discount * 100)}% off for the sworn)` : ""}` : "free";
      body = `<p>${t.trainerGreeting}</p><p class="sh-empty">Each reset costs ${cost}. You carry <b>${hero.gold}</b>${coin}.</p>`;
      btns = btn("respec", `Reset skills`, hero.gold < price) + btn("stats", `Reset stat points`, hero.gold < price);
      acts.respec = () => this.h.send("respec");
      acts.stats = () => this.h.send("resetstats");
    }
    const sig = JSON.stringify([role, sv, sworn, hero, this.note?.at, this.rev]);
    return { html: body + note + `<div class="nd-btns">${btns}<button class="nd-bye">Goodbye <kbd>E</kbd></button></div>`, acts, sig };
  }
}

export { rankRewardGold };
