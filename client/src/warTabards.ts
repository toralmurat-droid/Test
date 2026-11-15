import Phaser from "phaser";
import { CLANS, CLAN_KEYS, type ClanKey } from "../../shared/war/clans";
import { RENOWN_RANKS, rankTitle, type Oath, type OathsMsg } from "../../shared/war/renown";
import { isoAnchor, setBaseDepth } from "./iso";

/**
 * Tabards (look only, rule 5): a sworn hero carries a small pennant in the clan's colours beside the name tag, a
 * clan-coloured stripe under it, and the Renown rank title ("Banneret of the Redfang") in the title line. Hero bodies
 * are painted sheets with no body anchors per frame, so a cloth on the body would drift; the tag follows every frame
 * and facing in iso and flat views alike. The server sends the oaths by message ("oaths", server/warOaths.ts).
 */

/** Pennant size in world px (1 art px = 1 world px, like the troop flags). */
const PW = 8, PH = 11;
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
/** The clan colour mixed toward white: the banner cloths are dark and a name-sized tag must read on dark ground. */
const lift = (c: number, k: number) => [16, 8, 0].reduce((o, s) => o | (Math.round(((c >> s) & 255) * (1 - k) + 255 * k) << s), 0);

/** A clan's little flag on a staff (notched at the fly end, dark outline); Banneret rank and above get a gilt finial. */
function pennantKey(scene: Phaser.Scene, k: ClanKey, gilt: boolean): string {
  const key = `tabard_${k}${gilt ? "_g" : ""}`;
  if (scene.textures.exists(key)) return key;
  const c = document.createElement("canvas");
  c.width = PW; c.height = PH;
  const g = c.getContext("2d")!, cl = CLANS[k];
  const px = (x: number, y: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  g.fillStyle = "#1a1008"; g.fillRect(0, 0, 2, PH); // staff with a dark outline
  g.fillStyle = "#8a6438"; g.fillRect(1, 1, 1, PH - 1);
  g.fillStyle = gilt ? "#ffd860" : "#a08050"; g.fillRect(0, 0, 2, 1); // finial
  const inFlag = (x: number, y: number) => x >= 2 && x < PW && y >= 1 && y <= 7 && !(x === PW - 1 && y >= 3 && y <= 5) && !(x === PW - 2 && y === 4);
  for (let y = 1; y <= 7; y++) for (let x = 2; x < PW; x++) {
    if (!inFlag(x, y)) continue;
    const rim = !inFlag(x - 1, y) && x > 2 || !inFlag(x + 1, y) || !inFlag(x, y - 1) || !inFlag(x, y + 1);
    px(x, y, rim ? "#120c08" : y === 2 ? hex(lift(cl.trim, 0.2)) : hex(lift(cl.cloth, 0.3)));
  }
  const sig = hex(lift(cl.sigil, 0.1)); // the sigil: a small lozenge
  px(4, 4, sig); px(3, 4, sig); px(5, 4, sig); px(4, 3, sig); px(4, 5, sig);
  scene.textures.addCanvas(key, c)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

const isOath = (v: unknown): v is Oath =>
  Array.isArray(v) && (CLAN_KEYS as unknown[]).includes(v[0]) && Number.isInteger(v[1]) && v[1] >= 0 && v[1] < RENOWN_RANKS.length;

/** The stripe under a sworn hero's name: a 1x2 texture (cloth over trim), stretched to the name's width. */
function stripeKey(scene: Phaser.Scene, k: ClanKey): string {
  const key = `tabard_stripe_${k}`;
  if (scene.textures.exists(key)) return key;
  const c = document.createElement("canvas");
  c.width = 1; c.height = 2;
  const g = c.getContext("2d")!;
  g.fillStyle = hex(lift(CLANS[k].cloth, 0.35)); g.fillRect(0, 0, 1, 1);
  g.fillStyle = "#120c08"; g.fillRect(0, 1, 1, 1); // a dark edge, so the colour reads on any ground
  scene.textures.addCanvas(key, c)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

/** What a hero entity lends the tabard: its sprite and name label; the tabard keeps its two images on it. */
export interface TabardHost {
  sprite: Phaser.GameObjects.Sprite;
  label?: Phaser.GameObjects.Text;
  pennant?: Phaser.GameObjects.Image;
  stripe?: Phaser.GameObjects.Image;
}

export class WarTabards {
  private oaths = new Map<string, Oath>();
  constructor(private scene: Phaser.Scene) {}

  /** The server's "oaths" message: the full map on join, then changes. Junk entries are skipped. */
  set(m: OathsMsg) {
    if (!m || typeof m !== "object") return;
    if (m.full) this.oaths.clear();
    if (m.o && typeof m.o === "object") for (const [id, v] of Object.entries(m.o)) if (isOath(v)) this.oaths.set(id, v);
    if (Array.isArray(m.gone)) for (const id of m.gone) this.oaths.delete(String(id));
  }

  /** The rank line for the title slot ("" for Sworn or unsworn). */
  title(id: string): string { const o = this.oaths.get(id); return o ? rankTitle(o) : ""; }

  /** A tag image drawn by the world-text camera (pixelgrid.ts): crisp and unlit at night, like the name it belongs to. */
  private tagImage(key: string, e: TabardHost): Phaser.GameObjects.Image {
    const img = this.scene.add.image(0, 0, key);
    (img as any).__worldText = true;
    return isoAnchor(img, e.sprite) as Phaser.GameObjects.Image;
  }

  /**
   * Places the pennant left of the name and the stripe under it. Call after the name label is placed for the frame.
   * `show` false (dead, hidden) puts both away; so does a hidden name label.
   */
  sync(id: string, e: TabardHost, show: boolean) {
    const o = this.oaths.get(id), l = e.label;
    if (!o || !l || !show || !l.visible) { e.pennant?.setVisible(false); e.stripe?.setVisible(false); return; }
    const key = pennantKey(this.scene, o[0], o[1] >= 3), sk = stripeKey(this.scene, o[0]);
    e.pennant ??= this.tagImage(key, e).setOrigin(1, 1);
    e.stripe ??= this.tagImage(sk, e).setOrigin(0.5, 0);
    if (e.pennant.texture.key !== key) e.pennant.setTexture(key); // a rank up gilds it, an oath change recolours both
    if (e.stripe.texture.key !== sk) e.stripe.setTexture(sk);
    const w = Math.round(l.displayWidth), left = Math.round(l.x - w / 2), base = Math.round(l.y), d = e.sprite.y + 1;
    setBaseDepth(e.pennant.setPosition(left - 1, base + 1).setVisible(true), d);
    setBaseDepth(e.stripe.setPosition(Math.round(l.x), base - 1).setDisplaySize(Math.max(8, w - 4), 2).setVisible(true), d);
  }
}
