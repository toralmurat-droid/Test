import Phaser from "phaser";
import { TILE } from "../../shared/constants";
import { BORDERS, crossTo, edgeTile, LAND_NAMES, otherEnd, outward, SEAM, type Border, type BorderEnd } from "../../shared/borders";
import { borderOpen } from "../../shared/act2";
import type { Quester } from "../../shared/quests";
import { isoX, isoY, IsoView } from "./iso";
import type { MapMarker } from "./minimap";

/**
 * The border roads (shared/borders.ts): the mist of the pass thickens over the screen as the hero walks the last
 * stretch of a road towards its land's edge, and the ground at the other land's end is painted ahead (smoothground.ts
 * pin), so the server's swap to the other land happens inside thick mist that then thins as they walk on. Cosmetic:
 * the server decides the crossing.
 */
/** Mist starts this many tiles before the seam and is thickest at it. */
const FOG_TILES = 6;
/** Within this many tiles of a road's end (open for the hero), the other end's ground is painted ahead. */
const PREPAINT_TILES = 26;
/** Mist colour per land the hero stands in (Oakvale's grey-green, the Sunscar's sand dust, the moors' cold grey...). */
const MIST: Record<number, number> = { 1: 0xc4ccc4, 2: 0xe0c89a, 3: 0xb4c0cc, 4: 0xd69a64, 5: 0xb8c4a8, 6: 0xd4d0c8 };

export class BorderLayer {
  private veil: Phaser.GameObjects.Rectangle;
  private banks: { s: Phaser.GameObjects.Image; fx: number; fy: number; v: number }[] = [];
  private fog = 0;
  private pinned = "";

  constructor(private scene: Phaser.Scene) {
    if (!scene.textures.exists("bordermist")) {
      const tex = scene.textures.createCanvas("bordermist", 256, 128)!, c = tex.getContext();
      const g = c.createRadialGradient(128, 64, 4, 128, 64, 126);
      g.addColorStop(0, "rgba(255,255,255,0.95)"); g.addColorStop(0.5, "rgba(255,255,255,0.45)"); g.addColorStop(1, "rgba(255,255,255,0)");
      c.save(); c.scale(1, 0.5); c.translate(0, 64); c.fillStyle = g; c.fillRect(0, -64, 256, 256); c.restore();
      tex.refresh();
    }
    this.veil = scene.add.rectangle(0, 0, 10, 10, 0xc4ccc4).setOrigin(0).setScrollFactor(0).setDepth(24550).setAlpha(0).setVisible(false);
    for (let i = 0; i < 10; i++) {
      const s = scene.add.image(0, 0, "bordermist").setScrollFactor(0).setDepth(24560).setAlpha(0).setVisible(false);
      this.banks.push({ s, fx: (i * 0.618) % 1, fy: (i * 0.377) % 1, v: 0.5 + ((i * 0.73) % 1) * 0.7 });
    }
  }

  /** The mist colour where the hero stands (for the cover while the far side is painted). */
  mistRGB(land: number): [number, number, number] { const c = MIST[land] ?? MIST[1]; return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }

  /** The roads on the maps: where each one leaves its land, named, with the land it leads to. */
  markers(): MapMarker[] {
    return BORDERS.flatMap((b) => [b.a, b.b].map((e) => {
      const [x, y] = edgeTile(e), [ox, oy] = outward(e.side);
      return { x: (x + 0.5 - ox * 2) * TILE, y: (y + 0.5 - oy * 2) * TILE, glyph: "◆", color: "#e8dcc0", road: true, label: `${b.name} (to ${LAND_NAMES[otherEnd(b, e).land]})`, fogged: true };
    }));
  }

  /** Call every frame with the local hero (feet, level and quests) and the frame time. */
  update(me: (Quester & { level: number }) | undefined, pos: { x: number; y: number } | undefined, land: number, dtMs: number, t: number) {
    let want = 0, ahead: { b: Border; e: BorderEnd } | undefined, best = Infinity;
    if (pos) for (const b of BORDERS) for (const e of [b.a, b.b]) {
      const [ex, ey] = edgeTile(e), [ox, oy] = outward(e.side);
      const depth = (((ex + 0.5 + ox * 0.5) * TILE - pos.x) * ox + ((ey + 0.5 + oy * 0.5) * TILE - pos.y) * oy) / TILE;
      const along = Math.abs(ox !== 0 ? pos.y / TILE - (ey + 0.5) : pos.x / TILE - (ex + 0.5));
      if (depth < -1 || along > 6 + Math.max(0, depth)) continue;
      const d = Math.hypot(depth, along);
      if (d < best && d < PREPAINT_TILES && borderOpen(otherEnd(b, e), me)) { best = d; ahead = { b, e }; }
      // a road shut for this hero mists only lightly: they stay at its end and must still see round them
      if (along < 4) want = Math.max(want, Math.min(borderOpen(otherEnd(b, e), me) ? 1 : 0.45, Math.max(0, 1 - (depth - SEAM) / FOG_TILES)));
    }
    // the far end's ground, painted ahead (keyed apart from the waygates' pin)
    const key = ahead ? `${ahead.b.id}:${ahead.e === ahead.b.a ? "a" : "b"}` : "";
    if (key !== this.pinned && IsoView.ground) { // (retried until the ground layer exists)
      this.pinned = key;
      const [ex, ey] = ahead ? edgeTile(ahead.e) : [0, 0], [ox, oy] = ahead ? outward(ahead.e.side) : [0, 0];
      const at = ahead ? crossTo(ahead.b, ahead.e, (ex + 0.5 - ox) * TILE, (ey + 0.5 - oy) * TILE) : undefined;
      IsoView.ground?.pin(at ? [{ x: isoX(at.x, at.y), y: isoY(at.x, at.y) }] : [], "border");
    }
    // the mist: thickens fast as the seam nears, thins slowly after a crossing
    this.fog += (want - this.fog) * Math.min(1, dtMs / (want > this.fog ? 250 : 900));
    const on = this.fog > 0.02, cam = this.scene.cameras.main, W = cam.width, H = cam.height, tint = MIST[land] ?? MIST[1];
    if (this.veil.visible !== on) this.veil.setVisible(on);
    for (const m of this.banks) if (m.s.visible !== on) m.s.setVisible(on);
    if (!on) return;
    this.veil.setSize(W, H).setFillStyle(tint).setAlpha(Math.min(0.9, this.fog ** 1.8 * 0.95));
    for (const m of this.banks) {
      const u = (((m.fx + t * 0.02 * m.v + cam.scrollX / (W * 2)) % 1) + 1) % 1, w = (((m.fy + cam.scrollY / (H * 2.4)) % 1) + 1) % 1;
      m.s.setTint(tint).setPosition((u * 1.4 - 0.2) * W, (w * 1.3 - 0.15) * H).setScale(W / 256 * (0.9 + m.v * 0.6), H / 128 * (0.6 + m.v * 0.4));
      m.s.setAlpha(this.fog * (0.55 + 0.12 * Math.sin(t * 0.4 + m.fx * 9)));
    }
  }

  /** Right after the local hero crossed: the mist stays thick on the far side and thins as they walk out of it. */
  crossed() { this.fog = 1; }
}
