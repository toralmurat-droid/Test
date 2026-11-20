/**
 * The ruins of the Holds' works (shared/war/holdFall.ts; the server decides in server/warHoldWorks.ts). Look only: a
 * wrecked barracks, stores or rack lies where it stood (its sheet's wrecked frame), a wrecked watchtower or gate smokes
 * as a heap of the clan's rubble; a fallen Hold shows its whole ruin until a clan claims it. Drawn only near the hero.
 */
import Phaser from "phaser";
import { TILE } from "../../shared/constants";
import { CLAN_KEYS, type ClanKey } from "../../shared/war/clans";
import { cleanHoldWorksMsg, holdWorks, isFortification, type HoldWork } from "../../shared/war/holdFall";
import type { HoldTier } from "../../shared/war/holdTiers";
import { HOLDS } from "../../shared/war/standards";
import { isoAnchor } from "./iso";
import { MOB_LOOK, warSoldierTexture } from "./textures";

/** Holds farther than this from the hero (px) have no ruin sprites. */
const NEAR = 36 * TILE;

export class HoldRuins {
  /** Wrecked works the server listed: territory -> clan and wrecked work indexes. */
  private wrecked = new Map<number, { clan: ClanKey; tier: HoldTier; is: Set<number> }>();
  /** Fallen lands and their last holder (the "war" snapshot). */
  private fallen = new Map<number, ClanKey>();
  private sprites = new Map<string, Phaser.GameObjects.Sprite>();

  constructor(private scene: Phaser.Scene) {}

  /** The server's "holdworks" message. */
  setWorks(m: unknown) {
    this.wrecked.clear();
    for (const [t, i, c, tier] of cleanHoldWorksMsg(m).wrecked) {
      const clan = CLAN_KEYS[c];
      const e = this.wrecked.get(t) ?? { clan, tier: tier as HoldTier, is: new Set<number>() };
      e.is.add(i); this.wrecked.set(t, e);
    }
  }

  /** The "war" snapshot: which Holds stand fallen, and who held them. */
  setWar(v: { owner?: unknown; fallen?: unknown } | undefined) {
    this.fallen.clear();
    const owner = Array.isArray(v?.owner) ? v!.owner as number[] : [];
    if (Array.isArray(v?.fallen)) for (const t of v!.fallen) if (Number.isInteger(t) && CLAN_KEYS[owner[t]]) this.fallen.set(t, CLAN_KEYS[owner[t]]);
  }

  /** Every frame (cheap): ruins near the hero appear, far ones go. */
  update(me: { x: number; y: number } | undefined, now = Date.now()) {
    const want = new Set<string>();
    if (me) for (const hd of HOLDS) {
      if (Math.abs(hd.x - me.x) > NEAR || Math.abs(hd.y - me.y) > NEAR) continue;
      const w = this.wrecked.get(hd.t), down = this.fallen.get(hd.t);
      // a fallen Hold whose ruin the server no longer knows (a restart): its holder's camp lies in ruins
      const list: [ClanKey, HoldWork][] = w ? holdWorks(hd.t, w.clan, w.tier).filter((x) => w.is.has(x.i)).map((x) => [w.clan, x]) : down ? holdWorks(hd.t, down, 1).map((x) => [down, x]) : [];
      for (const [clan, x] of list) {
        const key = `${hd.t}:${x.i}:${clan}:${x.kind}:${x.x}:${x.y}`;
        if (this.draw(key, clan, x, now)) want.add(key);
      }
    }
    for (const [k, s] of this.sprites) if (!want.has(k)) { s.destroy(); this.sprites.delete(k); }
  }

  /** One ruin sprite (true when it is up; its sheet may still be loading). */
  private draw(key: string, clan: ClanKey, w: HoldWork, now: number): boolean {
    const art = isFortification(w.kind) ? `war_work_rubble_${clan}` : `war_work_${w.kind}_${clan}`, tex = warSoldierTexture(this.scene, art);
    if (!tex) return false;
    let s = this.sprites.get(key);
    if (!s) {
      const look = MOB_LOOK[art];
      s = this.scene.add.sprite(w.x, w.y, tex, 13).setOrigin(0.5, look?.oy ?? 0.9).setScale(look?.scale ?? 1).setDepth(w.y - 1);
      isoAnchor(s, { x: w.x, y: w.y });
      this.sprites.set(key, s);
    }
    if (isFortification(w.kind)) s.setFrame(Math.floor(now / 260 + w.i * 3) % 12); // the rubble's smoke drifts
    return true;
  }

  destroy() { for (const s of this.sprites.values()) s.destroy(); this.sprites.clear(); }
}
